// 残影分层定位:史莱姆跳 5s→挪走→对 主画布/worldCanvas/lightCanvas/lightMaskCanvas/GL层
// 在史莱姆历史位置采样,锁定残影载体画布
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?wgl=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 280000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ren = g.renderer;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let surf = 8;
  while (surf < st.h - 20 && !st.isSolid(px0, surf)) surf++;
  const py0 = surf - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -60; dx <= 60; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  const pinX = (px0 - 8) * 16, pinY = (py0 - 4) * 16;
  g.player.x = pinX; g.player.y = pinY;
  g.camera.x = pinX; g.camera.y = pinY;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 3000 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 20) * 16; slime.y = (py0 - 8) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.hp = slime.maxHp ?? 999;
  const hist = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 5000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
    hist.push({ x: slime.cx, y: slime.cy });
  }
  slime.x = g.camera.x + 2400; slime.y = g.camera.y - 2400;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  const t1 = performance.now();
  while (performance.now() - t1 < 1000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
  }
  // 层清单
  const layers = {
    main: ren.canvas,
    world: ren.worldCanvas ?? null,
    light: ren.lightCanvas ?? null,
    lightMask: ren.lightMaskCanvas ?? null,
    glWorldLight: ren.worldLight ? ren.worldLight.canvas : null,
  };
  const sample = (cv, sx, sy, n = 5) => {
    if (!cv || cv.width === 0) return 'empty';
    const ix = Math.round(sx) - (n >> 1), iy = Math.round(sy) - (n >> 1);
    if (ix < 0 || iy < 0 || ix + n > cv.width || iy + n > cv.height) return 'offscreen';
    const c2 = cv.getContext('2d');
    if (!c2) return 'gl-canvas';
    const im = c2.getImageData(ix, iy, n, n).data;
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; a += im[j + 3]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)];
  };
  // 选屏幕内的历史点(6px 网格去重)
  const picks = [];
  const seen = new Set();
  for (const h of hist) {
    const [sx, sy] = g.camera.worldToScreen(h.x, h.y - slime.h / 2);
    if (sx < 60 || sy < 60 || sx > 1220 || sy > 740) continue;
    const k = Math.round(sx / 8) + ':' + Math.round(sy / 8);
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push({ sx: Math.round(sx), sy: Math.round(sy) });
  }
  const layerSamples = picks.slice(0, 24).map((p) => ({
    at: [p.sx, p.sy],
    main: sample(layers.main, p.sx, p.sy),
    world: sample(layers.world, p.sx, p.sy),
    lightMask: sample(layers.lightMask, p.sx, p.sy),
    gl: sample(layers.glWorldLight, p.sx, p.sy),
  }));
  // 背景参照(天空)
  const bgScreen = g.camera.worldToScreen((px0 - 30) * 16, (py0 - 8) * 16);
  const bg = { at: [Math.round(bgScreen[0]), Math.round(bgScreen[1])], main: sample(layers.main, bgScreen[0], bgScreen[1]), world: sample(layers.world, bgScreen[0], bgScreen[1]) };
  return {
    slime: 1,
    worldLayerActive: ren.worldLayerActive,
    glAvailable: !!ren.worldLight && !ren.worldLight.unavailable,
    histLen: hist.length, inScreenPicks: picks.length,
    layerSamples, bg,
    tintSize: ren.tintAtlas.size,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);

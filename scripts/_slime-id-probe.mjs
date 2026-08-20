// 终局定位:hook 主画布 drawImage 记录【源画布身份】(worldCanvas/lightMask/gl.canvas/...)
// + toDataURL 读 GL canvas 在史莱姆历史位置的内容
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  // ---- 1) 源画布身份 hook(挂 1 帧) ----
  const cv = ren.canvas;
  const ctx = cv.getContext('2d');
  const ids = new Map();
  const tag = (img) => {
    if (!ids.has(img)) ids.set(img, 'c' + ids.size + `(${img.width}x${img.height})`);
    return ids.get(img);
  };
  const draws = [];
  const origDraw = ctx.drawImage.bind(ctx);
  ctx.drawImage = function (img, ...rest) { draws.push(tag(img)); return origDraw(img, ...rest); };
  const t2 = performance.now();
  while (performance.now() - t2 < 500) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
  }
  ctx.drawImage = origDraw;
  const frameDraws = draws.slice(0, 80);
  // ---- 2) GL canvas 内容读取 ----
  const wlight = ren.worldLight;
  let glGhost = null;
  if (wlight && wlight.canvas && wlight.canvas.width > 0) {
    const tmp = document.createElement('canvas');
    tmp.width = wlight.canvas.width; tmp.height = wlight.canvas.height;
    const tctx = tmp.getContext('2d');
    const im2 = new Image();
    const url = wlight.canvas.toDataURL();
    await new Promise((res) => { im2.onload = res; im2.src = url; });
    tctx.drawImage(im2, 0, 0);
    // 采样史莱姆历史位置(屏幕系=GL canvas 系)
    const picks2 = [];
    const seen2 = new Set();
    for (const h of hist) {
      const [sx, sy] = g.camera.worldToScreen(h.x, h.y - 12);
      if (sx < 60 || sy < 60 || sx > 1220 || sy > 740) continue;
      const k = Math.round(sx / 10) + ':' + Math.round(sy / 10);
      if (seen2.has(k)) continue; seen2.add(k);
      const n = 5;
      const d = tctx.getImageData(Math.round(sx) - 2, Math.round(sy) - 2, n, n).data;
      let r = 0, gg = 0, b = 0, a = 0;
      for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; a += d[j + 3]; }
      const c = d.length / 4;
      picks2.push([Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)]);
      if (picks2.length >= 12) break;
    }
    glGhost = picks2;
  }
  // ---- 3) 主画布残影(对照) ----
  const cctx = cv.getContext('2d');
  const mainPicks = [];
  const seen3 = new Set();
  for (const h of hist) {
    const [sx, sy] = g.camera.worldToScreen(h.x, h.y - 12);
    if (sx < 60 || sy < 60 || sx > 1220 || sy > 740) continue;
    const k = Math.round(sx / 10) + ':' + Math.round(sy / 10);
    if (seen3.has(k)) continue; seen3.add(k);
    const n = 5;
    const d = cctx.getImageData(Math.round(sx) - 2, Math.round(sy) - 2, n, n).data;
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; a += d[j + 3]; }
    const c = d.length / 4;
    mainPicks.push([Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)]);
    if (mainPicks.length >= 12) break;
  }
  return {
    slime: 1,
    drawsPerFrame: frameDraws,
    distinctSrcInOneFrame: frameDraws.slice(0, 24),
    glCanvas: wlight ? [wlight.canvas.width, wlight.canvas.height, 'died=' + (wlight.diedAt > 0)] : 'none',
    glGhost, mainPicks,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);

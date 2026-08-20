// 亮度分解:worldCanvas(乘光前)史莱姆像素 + lightCanvas(光系数)+ 主画布(最终)
// → 确定"亮度不对"来自染色管线还是光照层
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
  const pinX2 = (px0 - 14) * 16, pinY2 = (py0 - 4) * 16;
  g.player.x = pinX2 + 120; g.player.y = pinY2;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 3000 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = pinX2; slime.y = (py0 - 3) * 16;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  slime.hp = slime.maxHp ?? 999;
  g.camera.x = slime.cx; g.camera.y = slime.cy;
  for (let k = 0; k < 10; k++) {
    g.player.x = slime.cx + 120; g.player.y = slime.y; g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
    slime.vx = 0; slime.vy = 0;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const snap = (cv, sx, sy, n = 5) => {
    if (!cv) return null;
    const ix = Math.round(sx) - (n >> 1), iy = Math.round(sy) - (n >> 1);
    const c2 = cv.getContext('2d');
    if (!c2) return 'gl';
    const d = c2.getImageData(ix, iy, n, n).data;
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; a += d[j + 3]; }
    const c = d.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)];
  };
  const [sx, sy] = g.camera.worldToScreen(slime.cx, slime.cy - slime.h / 2);
  // 同步 render 后立刻采三层(避免 RAF 间隙)
  g.render();
  const mainAt = snap(ren.canvas, sx, sy);
  const worldAt = snap(ren.worldCanvas, sx, sy);
  // lightCanvas:2×超采样小图,光矩形映射——直接按比例定位
  const lc = ren.lightCanvas;
  const lightAt = (() => {
    if (!lc || lc.width === 0) return null;
    // lightCanvas 覆盖 tilesX×tilesY 格(2×SS);用 compositeLight 同式换算近似:
    // 中心格:camTile = (slime.cx/16, slime.cy/16);x0=tx0 等——简化:采样画布中点偏史莱姆方向
    // 直接采样 4 个候选点找非零(光照图中心区域)
    return snap(lc, lc.width / 2, lc.height / 2, 3);
  })();
  const skyAt = snap(ren.canvas, ...g.camera.worldToScreen(slime.cx, slime.cy - 60));
  return {
    slime: 1, mainAt, worldAt, lightAt, skyAt,
    pos: [Math.round(sx), Math.round(sy)],
    camNow: [Math.round(g.camera.x), Math.round(g.camera.y)],
    slimeAt: [Math.round(slime.cx), Math.round(slime.cy)],
    dayFactor: g.world.clock.dayFactor ?? null,
    timeOfDay: g.world.clock.timeOfDay,
    tintSize: ren.tintAtlas.size,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);

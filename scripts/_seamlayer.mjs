// 三层对照:乘光前 worldCanvas / lightCanvas / 最终画布 @ 缝列 → 定位黑源
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

const loc = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const cx = 341;
  const cy = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40);
  for (let y = cy - 14; y <= cy + 12; y++)
    for (let x = cx - 3; x <= cx + 3; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  for (const y of [cy - 12, cy - 6, cy, cy + 5, cy + 10]) st.setTileSilent(cx + 3, y, TORCH);
  const pl = g.player;
  window.__pin = () => { pl.x = cx * 16 + 8 - pl.w / 2; pl.y = cy * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  window.__pin();
  return { cy };
});
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => window.__pin());
}
const out = await page.evaluate((cy) => {
  const g = window.__swGame, st = g.world.store, L = g.lighting, R = g.renderer, cam = g.camera;
  const ty = cy + 5;   // 火把行
  const grab = (cv, sx, sy) => {
    const c2 = window.__c2 ?? (window.__c2 = document.createElement('canvas'));
    c2.width = cv.width; c2.height = cv.height;
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.drawImage(cv, 0, 0);
    const x = Math.max(0, Math.min(cv.width - 1, Math.round(sx)));
    const y = Math.max(0, Math.min(cv.height - 1, Math.round(sy)));
    const d = ctx2.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  const cols = [337, 341, 344, 345, 346, 347, 348, 350];
  const rows = [];
  for (const tx of cols) {
    const i = st.idx(tx, ty);
    const [wx, wy] = [tx * 16 + 8, ty * 16 + 8];
    const [sx, sy] = cam.worldToScreen(wx, wy);
    const pre = grab(R.worldCanvas, sx, sy);
    const post = grab(g.renderer.canvas, sx, sy);
    const light = L.lightAt(tx, ty);
    // lightCanvas:2× 超采样屏空间 → 采样 2sx,2sy
    const lc = R.lightCanvas;
    const lcv = lc.width ? grab(lc, sx * (lc.width / g.renderer.canvas.width), sy * (lc.height / g.renderer.canvas.height)) : null;
    rows.push({ tx, tile: st.type[i], wall: st.wall[i], cpuLight: light, preLight: pre, lightTex: lcv, post: post });
  }
  return { canvasW: g.renderer.canvas.width, lcW: R.lightCanvas?.width, rows };
}, loc.cy);
console.log('LAYERS');
for (const r of out.rows) {
  console.log(`tx=${r.tx} tile=${r.tile} wall=${r.wall} cpu=[${r.cpuLight}] pre=[${r.preLight}] lightTex=[${r.lightTex}] post=[${r.post}]`);
}
await browser.close();

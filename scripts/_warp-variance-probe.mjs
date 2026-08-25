// 渲染输出侧方差测量：地底池塘（火把照明，相机固定），逐帧采水面带，
// 算每行时间方差——悬停/涉水（用户已知正确）vs 高跳入水（争议）对比。
// 高方差行=渲染出了扰动；全零=渲染侧断点。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_warp-variance-probe.mjs --timeout=150000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 640, height: 400 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16) + 10;
  const py = Math.floor(g.world.rockLevel) + 40;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = py; y <= py + 6; y++) st.setTile(x, y, 0);
    for (let y = py + 1; y <= py + 6; y++) { const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 1; }
    st.setTile(x, py + 7, 1);
  }
  for (let y = py; y <= py + 7; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  const torch = window.__swTileByKey ? window.__swTileByKey('torch') : 4;
  st.setTile(px - 5, py, torch);
  st.setTile(px + 5, py, torch);
  g.world.clock.timeOfDay = 0.5;
  g.camera.x = px * 16 + 8;
  g.camera.y = (py + 2) * 16;
  window.__pd = { px, py, surfY: (py + 1) * 16 };
});

// 采 N 帧水面带（水面线 ±32px），返回每行像素值的行内方差均值
const captureBand = async (frames, trigger) => {
  return page.evaluate(async ({ n, trigger, s: pd }) => {
    const g = window.__swGame;
    const cv = g.renderer?.canvas;
    if (!cv) return null;
    const cx2 = cv.getContext('2d');
    const col = Math.round(cv.width / 2) + (window.__sideOff ?? 0);   // 侧面列=避开精灵
    const bandH = 72;
    const acc = [];
    if (trigger) {
      const g = window.__swGame;
      g.player.wetCount = 0;
      g.player.inWater = false;
      g.player.x = pd.px * 16 - g.player.w / 2 + 8;
      g.player.y = pd.surfY - 220 - g.player.h;
      g.player.vx = 0; g.player.vy = 0;
    }
    for (let f = 0; f < n; f++) {
      // 水面线的屏幕 Y 逐帧算（相机跟手移动）
      const cam = g.camera;
      const zoom = cam.zoom || 1;
      const top = Math.round(cv.height / 2 + (pd.surfY - cam.y) * zoom) - bandH / 2;
      const img = cx2.getImageData(col, top, 1, bandH).data;
      acc.push(Array.from(img.filter((_, i) => i % 4 === 0)).concat(Array.from(img.filter((_, i) => i % 4 === 1)), Array.from(img.filter((_, i) => i % 4 === 2))));
      // 下一帧（rAF 等渲染）
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    // 每行时间方差（RGB 均值的帧间方差）
    const rowVar = [];
    for (let y = 0; y < bandH; y++) {
      const vals = acc.map((fr) => fr[y]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const varr = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
      rowVar.push(+Math.sqrt(varr).toFixed(1));
    }
    return { rowVar };
  }, { n: frames, trigger, s: await page.evaluate(() => window.__pd) });
};

// ---- 场景 1：涉水（玩家站浅水，中心贴水面=用户已知正确）----
await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.x = s.px * 16 - g.player.w / 2 + 8;
  g.player.y = s.surfY - g.player.h + 10;   // 中心 ≈ 水面下
  g.player.vx = 0; g.player.vy = 0;
}, await page.evaluate(() => window.__pd));
await new Promise(r => setTimeout(r, 800));
const wade = await captureBand(24, false);
console.log('涉水（正确参考）行 stddev（水面线=第 34 行±）:');
console.log(wade ? wade.rowVar.map((v, i) => `${i - 36}:${v}`).join(' ') : 'null');

// ---- 场景 2：高跳入水 ----
await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.wetCount = 0;
  g.player.inWater = false;
  g.player.x = s.px * 16 - g.player.w / 2 + 8;
  g.player.y = s.surfY - 220 - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
}, await page.evaluate(() => window.__pd));
// 触发即采（40 帧跨落水+入水+下沉全程，rAF 节奏 ~0.7s）
await page.evaluate(() => { window.__sideOff = -48; });
const diveSide = await captureBand(40, true);
console.log('跳水·侧面48px列（纯传播波，无精灵）行 stddev:');
console.log(diveSide ? diveSide.rowVar.map((v, i) => `${i - 36}:${v}`).join(' ') : 'null');
await page.evaluate(() => { window.__sideOff = 0; });
const dive = await captureBand(40, true);
console.log('跳水入水后行 stddev:');
console.log(dive ? dive.rowVar.map((v, i) => `${i - 36}:${v}`).join(' ') : 'null');
await browser.close();

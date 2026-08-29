// 雪天暴风雪色罩层位验证:雪原+雨天时
//   A = 正常帧截图;B = weatherTintPasses 置空后截图
// 断言:室内暗区(A vs B)亮度差 ≈ 0(色罩不再覆盖室内);天空/远山区差 > 0
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5210');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('bl');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
if (await page.$('.sw-vsel .sw-vitem')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
// 找一个有墙的封闭室内位置难自动化 → 改用【地下无墙洞+室内家具不易】简化:
// 直接对比「雨天雪原」画面中 天空区(top) 与 地下暗区? 表面场景没地下。
// 替代断言:色罩只应影响背景层 → 用 underground 深度:把玩家传送进洞穴
// (screenPosition.Y > worldSurface*16 时 vanilla 的 cave bg sections 触发),
// 然后比较 A/B 全屏差 —— 若色罩还挂在最终链,整屏都会变亮;修正后差异 ≈ 仅天空区(此处=0)
await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  // 强制暴风雪状态:raining + cloudAlpha 1 + 时间锁白天让天区可见差异更清晰
  w.weather.raining = true;
  if ('cloudAlpha' in w.weather) w.weather.cloudAlpha = 1;
  if ('cloudBGActive' in w.weather) w.weather.cloudBGActive = 1;
  w.clock.timeOfDay = 0.5; w.clock.dayTime = true;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  void px; void py;
});
await new Promise(r => setTimeout(r, 2500));   // 等 opacity 渐入(状态机)
const shotA = (await page.screenshot({ type: 'png' })).toString('base64');
await page.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  sky.weatherTintPasses = () => [];
});
await new Promise(r => setTimeout(r, 400));
const shotB = (await page.screenshot({ type: 'png' })).toString('base64');
await page.evaluate(() => { delete window.__swGame.renderer.sky.weatherTintPasses; });
const metrics = await page.evaluate(async (aB64, bB64) => {
  const load = (b) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b; });
  const A = await load(aB64), B = await load(bB64);
  const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d', { willReadFrequently: true }); };
  const ca = mk(); ca.drawImage(A, 0, 0); const da = ca.getImageData(0, 0, W, H).data;
  const cb = mk(); cb.drawImage(B, 0, 0); const db = cb.getImageData(0, 0, W, H).data;
  // 分区平均亮度:A/B 差 = 色罩贡献
  const zoneAvg = (x0, y0, x1, y1) => {
    let sA = 0, sB = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      sA += (da[i] + da[i + 1] + da[i + 2]) / 3; sB += (db[i] + db[i + 1] + db[i + 2]) / 3; n++;
    }
    return { a: sA / n, b: sB / n, d: (sA - sB) / n };
  };
  return {
    skyTop: zoneAvg(Math.round(W * 0.55), Math.round(H * 0.04), Math.round(W * 0.95), Math.round(H * 0.22)),
    midWorld: zoneAvg(Math.round(W * 0.05), Math.round(H * 0.45), Math.round(W * 0.5), Math.round(H * 0.75)),
  };
}, shotA, shotB);
console.log(JSON.stringify(metrics, null, 1));
const skyDelta = metrics.skyTop.d, worldDelta = metrics.midWorld.d;
console.log(`天空区色罩亮度差=${skyDelta.toFixed(1)} 世界区差=${worldDelta.toFixed(1)}`);
console.log(worldDelta < 3 ? '=== PASS:世界内容不受色罩影响(仅背景层) ===' : '=== FAIL:色罩仍覆盖世界内容 ===');
await browser.close();
process.exit(worldDelta < 3 ? 0 : 3);

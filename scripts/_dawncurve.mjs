// 一次性:晨昏光照连续性诊断——密集采样 colorOfTheSkies/setBackColor 曲线,
// 找帧间跳变(相邻采样 |Δ| 远大于邻域均值的断点)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
const out = await page.evaluate(() => {
  const sc = window.__swMenuBg ? null : null;
  return null;
});
// 直接用模块函数(不依赖菜单实例)
const curve = await page.evaluate(async () => {
  const mod = await import('/src/lighting/SkyColor.ts');
  const N = 2000;
  const pts = [];
  // 光种全链:setFrameHorizon 模拟 SkyRenderer 同款可见性,采样 tileColor 后值
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const isDay = t > 0.1875 && t < 0.8125;
    const ticks = isDay ? ((t - 0.1875) / 0.625) * 54000 : ((((t - 0.8125) % 1) + 1) % 1) / 0.375 * 32400;
    mod.setFrameHorizon(null);
    const raw = mod.colorOfTheSkies(t, 3, false, false, 0);
    const c = mod.tileColor(raw);   // 光种链尾(tileColor)——游戏内光照感知源
    pts.push([t, c[0], c[1], c[2]]);
  }
  // 找跳变:|Δlum| 相邻差 > 8 且 > 左右邻域均值 4 倍
  const lum = pts.map((p) => (p[1] + p[2] + p[3]) / 3);
  const jumps = [];
  for (let i = 2; i < lum.length - 2; i++) {
    const d = Math.abs(lum[i] - lum[i - 1]);
    const nb = (Math.abs(lum[i - 1] - lum[i - 2]) + Math.abs(lum[i + 1] - lum[i])) / 2 + 0.5;
    if (d > 6 && d > nb * 3) jumps.push({ t: +pts[i][0].toFixed(4), d: +d.toFixed(1), from: +lum[i - 1].toFixed(1), to: +lum[i].toFixed(1) });
  }
  // 关键采样点摘要(黎明/黄昏附近)
  const at = (t) => {
    const i = Math.round(t * N);
    return `t=${t.toFixed(3)} rgb=${pts[i].slice(1).map(Math.round).join(',')}`;
  };
  return {
    jumps: jumps.slice(0, 12),
    dawn: [at(0.18), at(0.1875), at(0.19), at(0.20), at(0.22)],
    dusk: [at(0.80), at(0.81), at(0.8125), at(0.82), at(0.84)],
    noon: at(0.5), midnight: at(0.0),
  };
});
console.log(JSON.stringify(curve, null, 1));
await browser.close();

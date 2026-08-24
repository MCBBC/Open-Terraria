// 一次性:黎明亮度台阶实测——菜单时钟停在黎明前,逐帧推进,量画布亮度序列。
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
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1000));

// 停在黎明前 0.17,然后每 200ms 推进 0.004(约 3s 扫过黎明),量亮度
const seq = [];
for (let k = 0; k < 30; k++) {
  const t = 0.15 + k * 0.003;
  await page.evaluate((vt) => {
    const mb = window.__swMenuBg;
    mb.dayTime = true;
    mb.vTime = vt;
  }, t / 0.625 * 54000);
  await new Promise((r) => setTimeout(r, 120));   // 等 2-3 帧渲染
  const lum = await page.evaluate(() => {
    const cv = window.__swMenuBg.canvas;
    const g = cv.getContext('2d');
    const d = g.getImageData(400, 100, 200, 60).data;   // 天空区
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return +(s / (200 * 60)).toFixed(1);
  });
  seq.push({ k, t: +(0.15 + k * 0.003).toFixed(3), lum });
}
// 找台阶:相邻差 > 3 倍邻域
const steps = [];
for (let i = 2; i < seq.length - 2; i++) {
  const d = Math.abs(seq[i].lum - seq[i - 1].lum);
  const nb = (Math.abs(seq[i - 1].lum - seq[i - 2].lum) + Math.abs(seq[i + 1].lum - seq[i].lum)) / 2 + 0.3;
  if (d > 2.5 && d > nb * 2.5) steps.push({ t: seq[i].t, d: +d.toFixed(1), from: seq[i - 1].lum, to: seq[i].lum });
}
console.log('SEQ:', seq.map((s) => `${s.t}:${s.lum}`).join(' '));
console.log('STEPS:', JSON.stringify(steps));
await browser.close();

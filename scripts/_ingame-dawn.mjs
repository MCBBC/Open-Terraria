// 一次性:游戏内黎明亮度台阶验证——载入小世界,时间扫过黎明,量主画布亮度序列。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const seq = [];
for (let k = 0; k < 26; k++) {
  const t = 0.16 + k * 0.004;   // 0.16..0.26 扫黎明
  await page.evaluate((tt) => {
    const c = window.__swGame.world.clock;
    c.timeOfDay = tt;
  }, t);
  await new Promise((r) => setTimeout(r, 140));
  const lum = await page.evaluate(() => {
    const cv = window.__swGame.renderer.canvas;
    const g = cv.getContext('2d');
    // 天空区(上 1/3)与地表区(中带)分开量
    const d1 = g.getImageData(300, 60, 300, 80).data;
    const d2 = g.getImageData(300, 380, 300, 80).data;
    let s1 = 0, s2 = 0;
    for (let i = 0; i < d1.length; i += 4) { s1 += (d1[i] + d1[i + 1] + d1[i + 2]) / 3; s2 += (d2[i] + d2[i + 1] + d2[i + 2]) / 3; }
    return { sky: +(s1 / (300 * 80)).toFixed(1), ground: +(s2 / (300 * 80)).toFixed(1) };
  });
  seq.push({ t: +t.toFixed(3), ...lum });
}
const steps = [];
for (const key of ['sky', 'ground']) {
  for (let i = 2; i < seq.length - 2; i++) {
    const d = Math.abs(seq[i][key] - seq[i - 1][key]);
    const nb = (Math.abs(seq[i - 1][key] - seq[i - 2][key]) + Math.abs(seq[i + 1][key] - seq[i][key])) / 2 + 0.3;
    if (d > 2.5 && d > nb * 2.5) steps.push({ k: key, t: seq[i].t, d: +d.toFixed(1) });
  }
}
console.log('SKY:', seq.map((s) => s.sky).join(' '));
console.log('GND:', seq.map((s) => s.ground).join(' '));
console.log('STEPS:', JSON.stringify(steps));
await browser.close();

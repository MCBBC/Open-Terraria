// 一次性:日月高度实证——直读 SkyRenderer.sunScreen/moonScreen vs 原版公式预告。
// 原式(Main.cs:62289-62301):x=time/span×(W+2w)−w; y=bgTopY+|time/span×2−1|²×250+180
// 菜单 bgTopY=0(:61481 gameMenu 门);画布 1280×800。
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
if (!menuReady) { console.log('MENU NOT READY'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const cases = [
  { name: 'sun-noon', day: true, vTime: 27000 },
  { name: 'sun-9am', day: true, vTime: 16200 },
  { name: 'sun-17pm', day: true, vTime: 45500 },
  { name: 'moon-midnight', day: false, vTime: 16200 },
  { name: 'moon-dusk+1000', day: false, vTime: 1000 },
];
const out = [];
for (const c of cases) {
  const r = await page.evaluate((c) => {
    const mb = window.__swMenuBg;
    mb.vTime = c.vTime;
    mb.dayTime = c.day;
    return new Promise((res) => setTimeout(() => {
      const sky = mb.sky;
      const W = 1280;
      const span = c.day ? 54000 : 32400;
      const w = c.day ? 114 : 50;
      // ★同刻读:预告值用【读位时刻】的 vTime（时钟在走，用置入值会差帧间推进量）
      const vt = mb.vTime;
      const ft = vt / span;
      const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
      const exp = {
        x: ft * (W + w * 2) - w,
        y: 0 + dip * 250 + 180,          // 菜单 bgTopY=0
      };
      const got = c.day ? sky.sunScreen : sky.moonScreen;
      res({
        name: c.name,
        expect: { x: +exp.x.toFixed(1), y: +exp.y.toFixed(1) },
        got: got ? { x: +got.x.toFixed(1), y: +got.y.toFixed(1) } : null,
        d: got ? { x: +(got.x - exp.x).toFixed(2), y: +(got.y - exp.y).toFixed(2) } : null,
      });
    }, 120));
  }, c);
  out.push(r);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();

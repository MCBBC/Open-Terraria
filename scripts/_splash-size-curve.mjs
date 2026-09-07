// 水花尺寸曲线定谳:单粒 d33 湿溅花原参数→逐 tick 记 scale/alpha/可见度,对拍原版公式
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const vd = g.vanillaDust;
  const d = vd.spawn(0, 0, 18, 24, 33);
  d.vy -= 4; d.vx *= 2.5; d.scale = 1.3; d.alpha = 100; d.noGravity = true;
  const curve = [];
  for (let t = 0; t < 90 && d.active && d.scale > 0; t++) {
    const worldPx = 8 * d.scale;
    const opacity = Math.max(0, (255 - d.alpha) / 255);
    curve.push({ t, scale: +d.scale.toFixed(2), worldPx: +worldPx.toFixed(1), opacity: +opacity.toFixed(3) });
    g.fixedUpdate(1 / 60);
  }
  // 原版公式:scale=1.3+0.025t(alpha 100+2t,死亡 alpha>255≈t77.5)
  const expect = (t) => ({ scale: +(1.3 + 0.025 * t).toFixed(2), opacity: +Math.max(0, (155 - 2 * t) / 255).toFixed(3) });
  const devs = curve.filter((c) => {
    const e = expect(c.t);
    return Math.abs(c.scale - e.scale) > 0.02 || Math.abs(c.opacity - e.opacity) > 0.01;
  });
  return { lifeTicks: curve.length, sample: [curve[0], curve[10], curve[20], curve[40], curve[curve.length - 1]], formulaDeviations: devs.length };
});
console.log('CURVE=' + JSON.stringify(out));
await browser.close();

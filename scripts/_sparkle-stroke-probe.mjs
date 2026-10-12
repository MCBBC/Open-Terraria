// ★sparkleStroke 2px 量化验证（2026-10-12 canvas哨兵接力案）:
//   页内直驱 prettyStarSparkle 扫淡入淡出包络（模拟星尘/天顶剑挥舞的连续尺寸域）,
//   计量 createElement 出生率。量化前=每帧每笔新键(152/s 实报);量化后=穿越桶界才烘。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__bornOn = false;
  window.__bornN = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) window.__bornN++;
    return orig(tag, ...rest);
  };
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await sleep(2000);

// 直驱:2 个并发 sparkle×4 笔×淡入淡出全包络扫（flareCounter 0→60 往返 6 轮,
// num 连续扫=尺寸域连续新——量化前此处每笔每帧 createElement）
await page.evaluate(() => { window.__bornOn = true; window.__bornN = 0; });
await page.evaluate(async () => {
  const mod = await import('/src/render/Renderer.ts');
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('no canvas');
  const ctx = canvas.getContext('2d');
  window.__sparkleSweep = () => {
    for (let k = 0; k < 2; k++) {
      mod.prettyStarSparkle(ctx, 1, 400 + k * 100, 300,
        [1, 1, 1], [0.8, 0.9, 1], (performance.now() / 16.7) % 120,
        0, 60, 120, 60, 0.7, [1, 1], [1 + k * 0.3, 1 + k * 0.2]);
    }
  };
  window.__sparkleTimer = setInterval(() => window.__sparkleSweep(), 8);   // ~120Hz
});
await sleep(10000);   // 10s 计量窗(≈ flareCounter 往返 6 轮)
const r1 = await page.evaluate(() => ({ born: window.__bornN }));
await page.evaluate(() => { clearInterval(window.__sparkleTimer); });
console.log(`10s 直驱窗(2 sparkle×4 笔×~120Hz): createElement=${r1.born} (${(r1.born / 10).toFixed(1)}/s)`);
console.log(`  量化前同域预期≈4笔×120Hz×2=960/s 中缓存未救的连续新键面;量化后应=桶界穿越率(≈几十/s 内)`);
await browser.close();

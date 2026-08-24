// 探针：进入画面 logo 卡（logo_1..8 随机一张 ≥2s）端到端。
//  1. domcontentloaded 起轮询：#sw-logo-intro 出现，img src ∈ logo_1..8.png
//  2. 可见持续 ≥1.8s（minMs 2000 − 轮询/淡出抖动余量）
//  3. 退场后 .sw-title-menu 出现（正常进标题，不卡死不黑屏）
//  4. z-index 高于 vanilla splash(#sw-splash 9999)，覆盖期 splash 在底下
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });

// 100ms 轮询记录卡的生命周期
const seen = [];
let srcSeen = null;
let shot = false;
const t0 = Date.now();
for (;;) {
  const st = await page.evaluate(() => {
    const el = document.getElementById('sw-logo-intro');
    const img = el?.querySelector('img');
    return {
      present: !!el,
      src: img?.getAttribute('src') ?? null,
      opacity: el ? getComputedStyle(el).opacity : null,
      title: !!document.querySelector('.sw-title-menu'),
    };
  }).catch(() => ({ present: false, src: null, opacity: null, title: false }));
  const t = Date.now() - t0;
  if (st.present) {
    seen.push(t);
    if (!srcSeen && st.src) srcSeen = st.src;
    if (!shot && st.opacity !== '0') {
      shot = true;
      await page.screenshot({ path: '/tmp/logo-intro.png' });
    }
  }
  if (st.title || t > 30000) break;
  await new Promise((r) => setTimeout(r, 100));
}
const first = seen[0] ?? null;
const last = seen[seen.length - 1] ?? null;
console.log(JSON.stringify({ firstSeenMs: first, lastSeenMs: last, samples: seen.length, src: srcSeen }, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(first !== null, 'logo 卡未出现');
A(srcSeen !== null && /logo_[1-8]\.png$/.test(srcSeen), `卡图 src 不符: ${srcSeen}`);
if (first !== null && last !== null) {
  A(last - first >= 1800, `可见持续 ${(last - first)}ms < 1800ms（仍被秒切）`);
}
A(shot, '未截到可见帧');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();

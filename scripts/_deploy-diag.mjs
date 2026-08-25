// HOLD 演练验证(慢速服:分片各延迟 3s → 暖缓存 ~30s+ >> 10.3s 时序):
// 断言时序尽后过渡图【保持可见】(maxOpacity ≥0.5 持续采样),而非旧代码的置黑
// (maxOpacity=0);最终加载完成/30s 超时 → 揭幕移除。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
const t0 = Date.now();
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let presentSamples = 0, heldSamples = 0, blackWhileLoading = 0, removed = false, removedAt = -1;
let everHeld = false;
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const now = Date.now() - t0;
  const s = await p.evaluate(() => {
    const v = document.getElementById('sw-splash');
    if (!v) return { present: false, maxOpacity: 0 };
    const layers = ['back', 'tree', 'front'].map((c) => {
      const el = v.querySelector('.' + c);
      return el ? Number(el.style.opacity || '0') : 0;
    });
    return { present: true, maxOpacity: Math.max(...layers) };
  }).catch(() => ({ present: false, maxOpacity: 0 }));
  if (!s.present) {
    if (presentSamples > 0) { removed = true; removedAt = now; }
    continue;
  }
  presentSamples++;
  if (now > 11000) {
    if (s.maxOpacity >= 0.5) { heldSamples++; everHeld = true; }
    else if (s.maxOpacity === 0) blackWhileLoading++;
  }
  if (removed) break;
}
console.log(JSON.stringify({
  presentSamples, heldSamplesAfterTimeline: heldSamples,
  blackWhileLoadingSamples: blackWhileLoading,
  artHeldThroughWait: everHeld && blackWhileLoading === 0,
  removed, removedAtSec: +(removedAt / 1000).toFixed(1),
  errs: errs.length,
}));
await b.close();
const ok = everHeld && blackWhileLoading === 0 && removed;
console.log(ok ? 'HOLD 演练 ✓ 过渡图等待期保持可见,无早退黑屏' : 'HOLD 演练 ✗');
process.exit(ok ? 0 : 1);

// 跳过+淡出重播修复验证:二访点击进渐隐后,连续快速点击 5 次——
// 断言:渐隐不重播(移除时刻 ≈ 首击+n6,而非被推迟),自然移除,零错误。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 20000));   // 首访+暖完
await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
const t0 = Date.now();
let clicked = false, fadeAt = -1, removedAt = -1, clicks = 0;
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const s = await p.evaluate(() => {
    const v = document.getElementById('sw-splash');
    return v ? { present: true, transparent: v.style.background === 'transparent' } : { present: false };
  }).catch(() => ({ present: false }));
  const now = Date.now() - t0;
  if (s.present && !clicked) {
    clicked = true;
    await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    clicks++;
    console.log(`首击 @${now}ms(进渐隐)`);
    // 渐隐期间连点 5 次(修复前:每次点击淡出从头重播)
    for (let k = 0; k < 5; k++) {
      await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      clicks++;
      await new Promise((r) => setTimeout(r, 120));
    }
    console.log(`渐隐期连点 5 次完毕 @${Date.now() - t0}ms`);
  }
  if (clicked && fadeAt < 0 && s.transparent) { fadeAt = now; console.log(`透明化 @${now}ms`); }
  if (clicked && !s.present) { removedAt = now; console.log(`移除 @${now}ms(总点击 ${clicks})`); break; }
}
console.log(JSON.stringify({ clicked, fadeAt, removedAt, clicks, errs: errs.length }));
const ok = clicked && removedAt > 0 && (removedAt - fadeAt) < 3000 && errs.length === 0;
console.log(ok ? '淡出无重播 ✓' : '异常:渐隐被重播推迟 ✗');
await b.close(); process.exit(ok ? 0 : 1);

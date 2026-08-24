// 字节账终验 v2:Music_50 入缓存时点 + 完成态传输量账单(resource timing)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
const t0 = Date.now();
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
let musicAt = -1;
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 200));
  const ok = await p.evaluate(async () => {
    try { return !!(await caches.match('audios/music/Music_50.mp3')); } catch { return false; }
  }).catch(() => false);
  if (ok) { musicAt = Date.now() - t0; break; }
}
let entries = -1;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  entries = await p.evaluate(async () => {
    let c = 0;
    for (const nm of await caches.keys()) c += (await (await caches.open(nm)).keys()).length;
    return c;
  }).catch(() => -1);
  if (entries >= 12034) break;
}
const bill = await p.evaluate(() => {
  const rows = [];
  let total = 0;
  for (const e of performance.getEntriesByType('resource')) {
    const ts = e.transferSize || 0;
    if (ts > 0) { total += ts; rows.push([e.name.replace(location.origin, ''), ts]); }
  }
  rows.sort((a, b2) => b2[1] - a[1]);
  const mb = (n) => `${(n / 1048576).toFixed(2)}MB`;
  return {
    totalTransfer: mb(total),
    top10: rows.slice(0, 10).map(([u, s]) => `${mb(s)} ${u.slice(0, 60)}`),
    zipParts: rows.filter(([u]) => /assets-zip/.test(u)).map(([u, s]) => `${mb(s)} ${u.slice(0, 40)}`),
  };
});
console.log(JSON.stringify({
  music50CachedAtMs: musicAt,
  warmCompleteEntries: entries,
  bill,
}, null, 1));
await b.close();
process.exit(0);

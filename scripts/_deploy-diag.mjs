// 首访综合终验:veil 向日葵 + worker 预取 + 暖缓存 + 标题曲时点 + 404 计数。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
let splash404 = 0, music404 = 0;
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
p.on('response', (r) => {
  if (r.status() !== 404) return;
  const u = r.url();
  if (/SplashScreens/.test(u)) splash404++;
  if (/Music_5\d\.mp3/.test(u)) music404++;
});
const t0 = Date.now();
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 350));
const veil = await p.evaluate(() => {
  const v = document.getElementById('sw-boot-prime');
  if (!v) return { present: false, lit: -1 };
  const ctx = v.querySelector('canvas')?.getContext('2d');
  let lit = 0;
  if (ctx) { const d = ctx.getImageData(0, 0, 52, 53).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; }
  return { present: true, lit };
}).catch(() => ({ present: false, lit: -1 }));
let musicAt = -1, entries = -1, wg = false, sv = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await p.evaluate(async () => {
    let n = 0, wg = false, sv = false, m50 = false;
    for (const nm of await caches.keys()) {
      for (const k of await (await caches.open(nm)).keys()) {
        n++;
        if (/worldGen\.worker.*\.js/.test(k.url)) wg = true;
        if (/save\.worker.*\.js/.test(k.url)) sv = true;
        if (/Music_50/.test(k.url)) m50 = true;
      }
    }
    return { n, wg, sv, m50 };
  }).catch(() => null);
  if (!s) continue;
  if (musicAt < 0 && s.m50) musicAt = Date.now() - t0;
  entries = s.n; wg = s.wg; sv = s.sv;
  if (entries >= 12034 && wg && sv) break;
}
console.log(JSON.stringify({ veil, music50CachedAtMs: musicAt, warmEntries: entries, worldGenWorker: wg, saveWorker: sv, splash404, music404, pageErrors: errs.length }));
await b.close();
process.exit(entries >= 12034 && wg && sv && errs.length === 0 ? 0 : 1);

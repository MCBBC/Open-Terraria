// 首访综合终验:向日葵 veil 绘制 + worker 预取 + 暖缓存填充 + 标题曲时点 + 零 404。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
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
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

// ① veil 向日葵:早期抓 canvas 是否画上了内容(非全透明)
await new Promise((r) => setTimeout(r, 2500));
const veilCheck = await p.evaluate(() => {
  const v = document.getElementById('sw-boot-prime');
  if (!v) return { present: false };
  const cv = v.querySelector('canvas');
  const ctx = cv?.getContext('2d');
  let lit = 0;
  if (ctx) {
    const d = ctx.getImageData(0, 0, 52, 53).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
  }
  return { present: true, litPixels: lit };
});
console.log('veil:', JSON.stringify(veilCheck));

// ② 等待 prime 完成 + worker 预取落地
let musicAt = -1, entries = -1;
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const s = await p.evaluate(async () => {
    try {
      const has = async (suffix) => {
        for (const nm of await caches.keys()) {
          for (const k of await (await caches.open(nm)).keys()) {
            if (k.url.endsWith(suffix)) return true;
          }
        }
        return false;
      };
      let n = 0;
      for (const nm of await caches.keys()) n += (await (await caches.open(nm)).keys()).length;
      return {
        m50: await has('audios/music/Music_50.mp3'),
        wg: await has('worldGen.worker'),
        sv: await has('/save.worker'),
        n,
      };
    } catch { return null; }
  }).catch(() => null);
  if (!s) continue;
  if (musicAt < 0 && s.m50) musicAt = Date.now() - t0;
  entries = s.n;
  if (entries >= 12034 && s.wg && s.sv) {
    console.log(`workers+暖缓存就绪 @${Date.now() - t0}ms:`, JSON.stringify(s));
    break;
  }
}
// ③ 收尾等待至全量
for (let i = 0; i < 30; i++) {
  if (entries >= 12034) break;
  await new Promise((r) => setTimeout(r, 5000));
  entries = await p.evaluate(async () => {
    let c = 0;
    for (const nm of await caches.keys()) c += (await (await caches.open(nm)).keys()).length;
    return c;
  }).catch(() => -1);
}
console.log(JSON.stringify({
  music50CachedAtMs: musicAt,
  warmEntries: entries,
  splash404, music404,
  pageErrors: errs.length,
}));
if (errs.length) console.log('ERRS:', errs.slice(0, 3).join(' | '));
await b.close();
process.exit(entries >= 12034 && veilCheck.litPixels > 0 ? 0 : 1);

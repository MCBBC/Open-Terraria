// 启动前置专项验证:测量 Music_50 入缓存时点 + 标题曲/过渡图 404 计数。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
const t0 = Date.now();
const music404 = [];
const splash404 = [];
p.on('response', (r) => {
  const u = r.url();
  if (r.status() !== 404) return;
  if (/Music_5\d\.mp3/.test(u)) music404.push(u.split('/').pop() + ` @${Date.now() - t0}ms`);
  if (/SplashScreens/.test(u)) splash404.push(u.split('/').pop() + ` @${Date.now() - t0}ms`);
});
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
let music50At = -1;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const ok = await p.evaluate(async () => {
    try { return !!(await caches.match('audios/music/Music_50.mp3')); } catch { return false; }
  }).catch(() => false);
  if (ok) { music50At = Date.now() - t0; break; }
}
await new Promise((r) => setTimeout(r, 8000));
const splashCached = await p.evaluate(async () => {
  let n = 0;
  for (const nm of await caches.keys()) {
    for (const k of await (await caches.open(nm)).keys()) {
      if (/SplashScreens_Splash_\d+_[012]\.png/.test(k.url)) n++;
    }
  }
  return n;
}).catch(() => -1);
console.log(JSON.stringify({
  music50CachedAtMs: music50At,
  music404s: music404,
  splash404s: splash404,
  splashLayerFilesCached: splashCached,
}, null, 1));
await b.close();
process.exit(0);

// v0.1.24 部署后复验:换代后 zip 补拉全量落地(含 863 opus)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/cache-verify2.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/cv2-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
log('SW controlled');
// 预置:等待首次 warm 完成
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const d = await page.evaluate(() => globalThis.__swAssetCache?.state?.().phase === 'done').catch(() => false);
  if (d) { log('first-warm done'); break; }
}
// ★模拟用户硬刷(CDP ignoreCache)
const CDP = await page.createCDPSession();
await CDP.send('Page.reload', { ignoreCache: true });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 60000 }).catch(() => {});
log('hard-reload done, watching warm');
let prev = -1, stable = 0;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const cnt = await page.evaluate(async () => {
    const names = await caches.keys();
    let total = 0, opus = 0;
    for (const n of names) {
      const c = await caches.open(n);
      const ks = await c.keys();
      total += ks.length;
      opus += ks.filter((r) => r.url.includes('.opus')).length;
    }
    return { total, opus };
  }).catch(() => ({ total: -1, opus: -1 }));
  log(`t${i * 3}s total=${cnt.total} opus=${cnt.opus}`);
  if (cnt.opus >= 863) { log('ALL-OPUS-LANDED'); break; }
  if (cnt.total === prev && cnt.total > 12000) { stable++; if (stable >= 4) { log('STABLE-Without-full-opus'); break; } }
  else { prev = cnt.total; stable = 0; }
}
const fin = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) {
    const c = await caches.open(n);
    const ks = await c.keys();
    out[n] = { total: ks.length, opus: ks.filter((r) => r.url.includes('.opus')).length,
      underworld: ks.filter((r) => r.url.includes('Underworld')).length,
      manifest: (await c.match('assets-zip/manifest.json')) ? 'present' : 'ABSENT' };
  }
  return out;
});
log('FINAL ' + JSON.stringify(fin));
await browser.close();
fs.closeSync(LOG);

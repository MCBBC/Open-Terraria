// world 复刻探针(2026-08-27):完全复刻用户条件——吃系统代理(127.0.0.1:7890)、
// CDP 禁缓存(等价 Disable cache)、无痕等价=全新 profile。
// 每 10s 抓 __swAssetCache.state() 快照,定位 startZipWarm 早期 return 分支。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'sandbox.vinlic.com';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: `/tmp/cdn-repro-${host.split('.')[0]}-${Date.now() % 100000}`,
  defaultViewport: { width: 1280, height: 800 },
  // ★不带 --no-proxy-server:吃系统代理,复刻用户真实网络路径
});
const page = await browser.newPage();
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });   // = Disable cache

let zips = 0;
page.on('response', (r) => { if (/\/assets-zip\/p\d+-/.test(r.request().url())) zips++; });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });

await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

for (let t = 5; t <= 90; t += 5) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await page.evaluate(async () => {
    const h = globalThis.__swAssetCache;
    const st = (h && typeof h.state === 'function') ? h.state() : null;
    const keys = await caches.keys();
    const per = [];
    for (const k of keys) { try { per.push([k, (await (await caches.open(k)).keys()).length]); } catch { per.push([k, -1]); } }
    return st ? { phase: st.phase, done: st.done, total: st.total, warming: st.warming,
      failed: st.failed, enabled: st.enabled, caches: per }
      : { noHandle: true, caches: per };
  });
  console.log(`t=${t}s zips=${zips}`, JSON.stringify(s));
}
console.log('console错误样本:', errors.slice(0, 4), '共', errors.length);
await browser.close();
process.exit(0);

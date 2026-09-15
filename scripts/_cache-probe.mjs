// 生产 CacheStorage 实证:URL 形态不一致(空格编码)挖证
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/cache-probe.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/cache-probe-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 8000));
log('loaded');
const out = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = { names, probe: [] };
  for (const name of names) {
    const c = await caches.open(name);
    const keys = await c.keys();
    const entry = { name, total: keys.length, underworld: [], splash7: [], spaceUrls: [] };
    for (const req of keys) {
      if (req.url.includes('Underworld')) entry.underworld.push(req.url);
      if (req.url.includes('Splash_7')) entry.splash7.push(req.url);
      if (req.url.includes('%20') || req.url.includes(' ')) entry.spaceUrls.push(req.url);
    }
    // 两种形态的 match 对照
    const u1 = new Request('https://sandbox.vinlic.com/sprites/vanilla/Backgrounds_Underworld%200.png');
    const u2 = new Request('https://sandbox.vinlic.com/sprites/vanilla/Backgrounds_Underworld 0.png');
    entry.matchPct20 = (await c.match(u1))?.status ?? 'MISS';
    entry.matchSpace = (await c.match(u2))?.status ?? 'MISS';
    entry.keysHasPct20 = keys.some((r) => r.url.includes('%200.png'));
    entry.keysHasSpace = keys.some((r) => r.url.endsWith('Underworld 0.png') || r.url.includes('Underworld 0.png'));
    out.probe.push(entry);
  }
  return out;
});
log(JSON.stringify(out, null, 1).slice(0, 4000));
await browser.close();
fs.closeSync(LOG);

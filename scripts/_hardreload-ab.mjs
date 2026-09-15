// A/B 对照:普通 reload vs 硬刷(CDP ignoreCache)后的 cache 状态与 match 结果
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/hardreload-ab.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: '/tmp/hr-ab-' + Date.now() % 100000,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const CDP = await page.createCDPSession();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
// 等 warm 完成
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const done = await page.evaluate(() => globalThis.__swAssetCache?.state?.().phase === 'done').catch(() => false);
  if (done) { log('warm done'); break; }
}
const snapshot = async (tag) => {
  const s = await page.evaluate(async () => {
    const names = await caches.keys();
    const out = {};
    for (const name of names) {
      const c = await caches.open(name);
      const keys = await c.keys();
      const e = { total: keys.length };
      // 关键 match 对照:普通 vs ignoreVary vs 逐条
      const probe = ['sprites/vanilla/SplashScreens_Splash_5_0.png', 'sprites/vanilla/Backgrounds_Underworld 0.png', 'sprites/vanilla/Cloud_0.png'];
      e.match = {};
      for (const u of probe) {
        e.match[u.split('/').pop()] = {
          str: (await c.match(u))?.status ?? 'MISS',
          req: (await c.match(new Request('https://sandbox.vinlic.com/' + u)))?.status ?? 'MISS',
          inKeys: keys.some((r) => r.url.includes(u.split('/').pop())),
        };
      }
      // body 完整性抽测:keys 前 50 条逐条 match
      let bodyMiss = 0, bodyOk = 0;
      for (const r of keys.slice(0, 50)) {
        const hit = await c.match(r);
        if (hit) bodyOk++; else bodyMiss++;
      }
      e.bodyProbe = { ok: bodyOk, miss: bodyMiss };
      out[name] = e;
    }
    return out;
  }).catch((e) => ({ err: e.message }));
  log(tag + ' ' + JSON.stringify(s));
};

// 基线快照
await snapshot('A-baseline');
// 普通 reload
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 6000));
await snapshot('B-normal-reload');
// 硬刷(CDP ignoreCache)
await CDP.send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 10000));
await snapshot('C-hard-reload');
// 再硬刷一次(复现用户的多轮)
await CDP.send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 10000));
await snapshot('D-hard-reload-2');
await browser.close();
fs.closeSync(LOG);

// 复现链:①访问旧版产物积累缓存(模拟 v0.1.21 用户)→②切 v0.1.23(+863 opus)换代
// →③读 CacheStorage:863 条 opus 是否落地/Backgrounds_Underworld 空格条目的 URL 形态
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOG = fs.openSync('/tmp/cache-repro.log', 'w');
const log = (t) => fs.writeSync(LOG, t + '\n');
const profile = '/tmp/cache-repro-' + Date.now() % 100000;

// 旧版产物:从 CF Pages 部署历史直链拉(v0.1.21 = 70386dbb 会 404 build-id;直接用
// 当前 dist-release 的上一层?没有旧产物——改用「同一产物两次访问」不可复现换代。
// 改方案:直接访问生产 v0.1.23(当前),读换代后的 cache 状态——用户环境的「升级前
// 旧缓存」无法在干净 profile 复现,退化验证:换代后 put 链本身是否完整)
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: profile,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => navigator.serviceWorker?.controller, { timeout: 30000 }).catch(() => {});
log('SW controlled');
// 等 warm 完成(轮询 cache 总数稳定)
let prev = -1, stable = 0;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const cnt = await page.evaluate(async () => {
    const names = await caches.keys();
    let total = 0;
    for (const n of names) { const c = await caches.open(n); total += (await c.keys()).length; }
    return total;
  }).catch(() => -1);
  if (cnt === prev && cnt > 1000) { stable++; if (stable >= 3) { log(`cache stable at ${cnt}`); break; } }
  else { stable = 0; prev = cnt; }
  if (i % 10 === 0) log(`cache count ${cnt}`);
}
// 读关键证据
const out = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = { names, probes: [] };
  for (const name of names) {
    const c = await caches.open(name);
    const keys = await c.keys();
    const e = { name, total: keys.length };
    e.opus = keys.filter((r) => r.url.includes('.opus')).length;
    e.underworld = keys.filter((r) => r.url.includes('Underworld')).map((r) => r.url).slice(0, 3);
    e.splashAll = keys.filter((r) => r.url.includes('SplashScreens')).length;
    // manifest 数对照
    const m = await c.match('assets-zip/manifest.json');
    e.manifestEntries = m ? ((await m.json()).length ?? '?') : 'ABSENT';
    // 空格文件名的 match 双形态
    const u1 = 'https://sandbox.vinlic.com/sprites/vanilla/Backgrounds_Underworld%200.png';
    e.matchPct20 = (await c.match(u1))?.status ?? 'MISS';
    // 找一个 zip 清单里的 wav/opus 的 URL 形态样例
    e.sampleUrls = keys.slice(0, 3).map((r) => r.url);
    out.probes.push(e);
  }
  return out;
});
log(JSON.stringify(out, null, 1).slice(0, 3000));
// 重新加载一次(模拟用户二次刷新)再看
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 12000));
const out2 = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const name of names) {
    const c = await caches.open(name);
    const keys = await c.keys();
    out[name] = { total: keys.length, opus: keys.filter((r) => r.url.includes('.opus')).length,
      underworld: keys.filter((r) => r.url.includes('Underworld')).length };
  }
  return out;
});
log('after-reload ' + JSON.stringify(out2));
await browser.close();
fs.closeSync(LOG);

// 一次性:release 形态暖缓存"假完成"取证探针(经 tools/run-diag.mjs 运行)
// 用法:SW_ORIGIN=http://localhost:4176 node tools/run-diag.mjs scripts/_rel-warm-probe.mjs
// 用户口径:过渡页底部资源加载器运行中,应确保 p0-p8 全部落盘才放行。
// 实报:只下到 p1-p4 指示器即显示完成。本探针盯住:
//   ①每片 zip 的 fetch 时序(页面上先后)
//   ②__swAssetCache.state 的 done/total/phase/failed/warming 采样(200ms)
//   ③phase 翻 'done' 瞬间:已抓到的片 vs CacheStorage 实际条目数 + 抽查
//     Cloud_2/Star_0/Background_8(用户 404 风暴族)→ 假完成实锤/证伪
//   ④done 后是否还有片继续下(放行时机/续传语义)
//   ⑤全程 /sprites 404 计数与速率(风暴基线,旧 bundle 应现每日 ~840 req/s 级)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4176';
const OUT = '/tmp/sw-rel-warm';
mkdirSync(OUT, { recursive: true });
const MAX_MS = +(process.env.PROBE_MAX_MS ?? 150000);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', `--user-data-dir=${OUT}/profile`, '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errs = [];
const zipParts = [];          // {file, at, ms}
const nf = new Map();         // file -> count
let nfTotal = 0;
const failedReqs = [];
const consoleAll = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160));
  else if (consoleAll.length < 40) consoleAll.push(m.type() + ': ' + m.text().slice(0, 120));
});
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.includes('worker') || u.includes('assets-zip')) failedReqs.push(u + ' :: ' + (r.failure()?.errorText ?? ''));
});
page.on('response', (r) => {
  const u = r.url();
  const t = Date.now() - T0;
  if (u.includes('/assets-zip/p') && u.endsWith('.zip') && r.request().method() === 'GET') {
    zipParts.push({ file: u.split('/').pop(), at: t });
  }
  if (r.status() === 404 && u.includes('/sprites/')) {
    nfTotal++;
    const rel = u.replace(ORIGIN + '/', '');
    nf.set(rel, (nf.get(rel) ?? 0) + 1);
  }
});
const T0 = Date.now();

// 可选网络节流(复现慢网:PROBE_THROTTLE_BPS=5000000 ≈ 5MB/s → 全量 ~75s)
const THROTTLE = +(process.env.PROBE_THROTTLE_BPS ?? 0);
if (THROTTLE > 0) {
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: THROTTLE, uploadThroughput: THROTTLE,
  });
}

// splash 揭幕时刻(菜单可进 = 门已放行)——先等挂载出现,再等移除(否则挂载前的
// 空窗会被误判"已揭幕")
let splashGoneAt = -1;
let splashSeen = false;
const splashWatch = setInterval(() => {
  page.evaluate(() => {
    const el = document.querySelector('#sw-splash');
    return el ? 'on' : (document.readyState === 'complete' ? 'never' : 'wait');
  }).then((st) => {
    if (st === 'on') splashSeen = true;
    if (splashSeen && st !== 'on' && splashGoneAt < 0) splashGoneAt = Date.now() - T0;
  }).catch(() => {});
}, 250);

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

// 状态采样:200ms 一次;记录 done 翻转与 phase 翻转序列
const samples = [];
let doneAt = -1, lastPhase = '', lastDone = -1;
const stateLog = [];
const sampler = setInterval(() => {
  const t = Date.now() - T0;
  page.evaluate(() => {
    const h = globalThis.__swAssetCache;
    if (!h) return null;
    const s = h.state;
    return { done: s.done, total: s.total, phase: s.phase, failed: s.failed, warming: s.warming };
  }).then((s) => {
    if (!s) return;
    if (s.phase !== lastPhase || s.done !== lastDone) {
      stateLog.push({ at: t, ...s });
      lastPhase = s.phase; lastDone = s.done;
      if (s.phase === 'done' && doneAt < 0) doneAt = t;
    }
  }).catch(() => {});
}, 200);

// 等待:phase='done' 且信号(zip/404/phase)5s 无变化即收;兜底 MAX_MS 硬超时
const tEnd = await (async () => {
  const t0 = Date.now();
  let lastSig = '', lastChange = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const sig = `${zipParts.length}|${nfTotal}|${lastPhase}`;
    if (sig !== lastSig) { lastSig = sig; lastChange = Date.now(); continue; }
    if (doneAt >= 0 && Date.now() - lastChange > 5000) break;
    if (Date.now() - t0 > MAX_MS) break;
  }
  return Date.now() - T0;
})();
clearInterval(sampler);

// 终态取证:cache 实况 + 抽查
const finalState = await page.evaluate(async () => {
  const h = globalThis.__swAssetCache;
  const handleShape = h ? Object.keys(h) : null;
  const st = h?.state;
  const s = st ? { enabled: st.enabled, done: st.done, total: st.total, phase: st.phase, failed: st.failed, warming: st.warming } : null;
  const names = await caches.keys();
  let cacheName = names.find((n) => n.startsWith('sw-assets-v'));
  let count = -1;
  const probe = {};
  if (cacheName) {
    const c = await caches.open(cacheName);
    count = (await c.keys()).length;
    for (const k of ['sprites/vanilla/Cloud_2.png', 'sprites/vanilla/Star_0.png', 'sprites/vanilla/Background_8.png', 'sprites/vanilla-ui/Player_Hair_1.png']) {
      probe[k] = !!(await c.match(k));
    }
  }
  return { state: s, cacheName, count, probe,
    flag: localStorage.getItem('swAssetsComplete:' + (s?.version ?? '')) };
});
const nfTop = [...nf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(JSON.stringify({
  tEndMs: tEnd, doneAtMs: doneAt, splashGoneAtMs: splashGoneAt,
  stateLog: stateLog.slice(0, 40),
  zipParts,
  finalState,
  nf404: { total: nfTotal, distinct: nf.size, top: nfTop },
  errs: errs.slice(0, 10),
}, null, 1));
await page.screenshot({ path: `${OUT}/final.png` });
await browser.close();

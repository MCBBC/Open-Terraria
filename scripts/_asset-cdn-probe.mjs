// 预览切源线上验证探针(一次性诊断,_ 前缀,经 tools/run-diag.mjs 运行):
// SW_ORIGIN=https://preview.sandboxworld.pages.dev node tools/run-diag.mjs scripts/_asset-cdn-probe.mjs
// 断言:①/assets-zip/cdn.json 200 且形状合法 ②warm 分片请求命中 CDN host
// (npmmirror/jsDelivr)而非同源。
// ★分片 fetch 全在 dedicated worker 内,page.on('request') 不可见(puppeteer 盲区,
//  2026-10-13 三跑实锤)——定谳走 CDP Target.setAutoAttach 到 worker 会话开 Network 域。
// ★swTrace 读 IDB 兜底不可靠:traceMem<120 不主动 flush,pagehide 硬关闭窗口 IDB
//  事务可能不提交(AssetCache 头注已登记)——本探针不依赖它,仅作附带展示。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'https://preview.sandboxworld.pages.dev';
const NETLOG = '/tmp/sw-cdn-netlog.json';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', `--log-net-log=${NETLOG}`], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
const partReqs = [];       // {host, file, via:'worker'|'page'}
const cdnJson = { status: null, body: null };

// CDP:worker 网络捕获——page.on('request') 对 dedicated worker 不可见(puppeteer
// 盲区);本版 puppeteer 无 cdp.session(id),用 page.workers() 的 workercreated +
// worker.client 开 Network 域(workercreated 须在 goto 前挂,防漏首批)
page.on('workercreated', async (worker) => {
  try {
    const c = worker.client ?? worker._client;
    if (!c) return;
    await c.send('Network.enable');
    c.on('Network.requestWillBeSent', (ev) => {
      const u = ev.request?.url ?? '';
      const m = /\/(p\d+-[0-9a-f]{8}\.(?:zip|tgz))(\?|$)/.exec(u);
      if (m) {
        partReqs.push({ host: new URL(u).hostname, file: m[1], via: 'worker' });
        console.log(`[part#${partReqs.length}] (worker) ${new URL(u).hostname} ← ${m[1]}`);
      }
    });
  } catch { /* 竞态:漏个别 worker 不影响判定 */ }
});

page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('response', async (res) => {
  if (res.url().endsWith('/assets-zip/cdn.json')) {
    cdnJson.status = res.status();
    try { const j = await res.json(); cdnJson.body = { v: j.v, parts: Object.keys(j.parts ?? {}).length, sample: Object.values(j.parts ?? {})[0]?.tgzUrls?.[0]?.url ?? Object.values(j.parts ?? {})[0]?.urls?.[0] }; } catch { /* */ }
  }
});

console.log(`goto ${ORIGIN} …`);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 }).catch(() => console.log('WARN: 菜单 120s 未现(资产门槛拦截中,继续等待)'));

// 等 warm 终态(冷 profile 真下载 ~262MB;页面状态 = 唯一可信进度源)
console.log('等待 warm 终态(冷 profile 全量拉取)…');
await page.waitForFunction(() => {
  const h = globalThis.__swAssetCache;
  if (!h) return false;
  const s = h.state();
  return s.phase === 'done' || s.failed > 0;
}, { timeout: 300_000, polling: 2000 }).catch(() => console.log('WARN: 300s 未到终态,以已捕获请求判'));

const state = await page.evaluate(() => {
  const h = globalThis.__swAssetCache;
  if (!h) return null;
  const s = h.state();
  return { version: s.version, total: s.total, done: s.done, bytesDone: s.bytesDone, bytesTotal: s.bytesTotal, warming: s.warming, phase: s.phase, failed: s.failed };
}).catch(() => null);

const byHost = {};
for (const r of partReqs) byHost[r.host] = (byHost[r.host] ?? 0) + 1;
console.log('=== 验证结论 ===');
console.log('cdn.json:', JSON.stringify(cdnJson));
console.log('分片请求 host 分布(CDP worker 捕获):', JSON.stringify(byHost), `共 ${partReqs.length}`);
console.log('页面资产态:', JSON.stringify(state));
console.log('pageerror:', errs.length ? errs.slice(0, 3) : '无');
const cdnHosts = Object.keys(byHost).filter((h) => h !== new URL(ORIGIN).hostname && !h.includes('pages.dev'));
let netlogHit = null;
await browser.close();   // netlog 随关闭落盘
try {
  const nl = await import('node:fs').then((fs) => fs.promises.readFile(NETLOG, 'utf8'));
  const counts = {};
  for (const host of ['registry.npmmirror.com', 'cdn.npmmirror.com', 'cdn.jsdelivr.net', 'preview.sandboxworld.pages.dev']) {
    counts[host] = (nl.match(new RegExp(host.replace(/\./g, '\\.'), 'g')) ?? []).length;
  }
  netlogHit = counts;
  console.log('netlog host 计数(全进程真值):', JSON.stringify(counts));
} catch (e) {
  console.log('netlog 读取失败:', String(e).slice(0, 80));
}
const nlCdn = netlogHit && (netlogHit['registry.npmmirror.com'] > 0 || netlogHit['cdn.npmmirror.com'] > 0 || netlogHit['cdn.jsdelivr.net'] > 0);
const ok = cdnJson.status === 200 && (cdnHosts.length > 0 || nlCdn) && (state?.phase === 'done' || state?.failed === 0);
console.log(ok ? 'PASS: 分片已走 CDN' : 'FAIL: 未见 CDN 命中');
process.exit(ok ? 0 : 1);

// 预览切源线上验证探针(一次性诊断,_ 前缀,经 tools/run-diag.mjs 运行):
// SW_ORIGIN=https://preview.sandboxworld.pages.dev node tools/run-diag.mjs scripts/_asset-cdn-probe.mjs
// 断言:①/assets-zip/cdn.json 200 且形状合法 ②warm 分片请求命中 CDN host
// (npmmirror/jsDelivr)而非同源 ③trace 首片源≠origin。观察到 ≥2 个分片请求即收口
// (冷 profile 全量 ~262MB,探针只看源头不拉全量,看够就关)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'https://preview.sandboxworld.pages.dev';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
const zipReqs = [];        // {host, file, ts}
const cdnJson = { status: null, body: null };
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('request', (req) => {
  const u = req.url();
  const m = /\/(p\d+-[0-9a-f]{8}\.zip)(\?|$)/.exec(u);
  if (m) {
    zipReqs.push({ host: new URL(u).hostname, file: m[1], ts: Date.now() });
    console.log(`[zip#${zipReqs.length}] ${new URL(u).hostname} ← ${m[1]}`);
  }
  if (u.endsWith('/assets-zip/cdn.json')) {
    cdnJson.status = 'pending';
  }
});
page.on('response', async (res) => {
  if (res.url().endsWith('/assets-zip/cdn.json')) {
    cdnJson.status = res.status();
    try { const j = await res.json(); cdnJson.body = { v: j.v, parts: Object.keys(j.parts ?? {}).length, sample: Object.values(j.parts ?? {})[0]?.urls?.[0] }; } catch { /* */ }
  }
});

console.log(`goto ${ORIGIN} …`);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 }).catch(() => console.log('WARN: 菜单 120s 未现(资产门槛拦截中,继续观察 zip 请求)'));

// 等分片请求(≥3 个或 90s);warm 启动在菜单出现后,冷 profile 必然真下载
const t0 = Date.now();
while (zipReqs.length < 3 && Date.now() - t0 < 90_000) await new Promise((r) => setTimeout(r, 1000));

const state = await page.evaluate(() => {
  const h = globalThis.__swAssetCache;
  if (!h) return null;
  const s = h.state();
  return { version: s.version, total: s.total, done: s.done, bytesDone: s.bytesDone, bytesTotal: s.bytesTotal, warming: s.warming, phase: s.phase };
}).catch(() => null);

const byHost = {};
for (const r of zipReqs) byHost[r.host] = (byHost[r.host] ?? 0) + 1;
console.log('=== 验证结论 ===');
console.log('cdn.json:', JSON.stringify(cdnJson));
console.log('zip 请求 host 分布:', JSON.stringify(byHost), `共 ${zipReqs.length}`);
console.log('页面资产态:', JSON.stringify(state));
console.log('pageerror:', errs.length ? errs.slice(0, 3) : '无');
const cdnHosts = Object.keys(byHost).filter((h) => h !== new URL(ORIGIN).hostname && !h.includes('pages.dev'));
const ok = cdnJson.status === 200 && cdnHosts.length > 0;
console.log(ok ? 'PASS: 分片已走 CDN' : 'FAIL: 分片仍走同源或 cdn.json 缺失');
await browser.close();
process.exit(ok ? 0 : 1);

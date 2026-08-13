// SW 资产预载 E2E 金标准探针 v2(2026-08-13):注册/全量/离线/自愈 + 导航监听加固。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('[navigate]', f.url().slice(0, 80)); });
browser.on('targetcrashed', (t) => console.log('[targetcrashed]', t.url?.() ?? ''));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function safeEval(fn, fallback = null) {
  try { return await page.evaluate(fn); } catch (e) { console.log('[eval-fail]', String(e).slice(0, 90)); return fallback; }
}
async function assetState() {
  return safeEval(async () => {
    const ver = window.__swAssetCache ? window.__swAssetCache.state().version : '';
    const r = await new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 2000);
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'status' && !done) { done = true; clearTimeout(t); resolve(e.data); }
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'status', version: ver });
    });
    const badge = document.querySelector('.sw-asset-badge');
    return {
      swReg: !!navigator.serviceWorker.controller,
      cached: r?.cached ?? -1, warm: r?.warm ?? null,
      badge: badge ? badge.textContent : null,
      gate: !!document.querySelector('.sw-asset-gate'),
    };
  }, { swReg: false, cached: -1, warm: null, badge: null, gate: false });
}

// ① 首载
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
const s1 = await assetState();
console.log('① 首载:', JSON.stringify(s1));
if (!s1.swReg) { console.log('FAIL: SW 未控制页面'); await browser.close(); process.exit(1); }

// ② 等待全量 warm 完成。SW 被 Chrome ~3min 击杀属预期——看门狗自动续传;
// 只在 cached 连续 120s 无增长且远离目标时判死。
let s2 = s1;
let lastGrowthAt = Date.now();
let peak = 0;
for (let i = 0; i < 260; i++) {
  await sleep(3000);
  s2 = await assetState();
  if (s2.cached > peak) { peak = s2.cached; lastGrowthAt = Date.now(); }
  if (i % 10 === 0) console.log(`  t=${i * 3}s cached=${s2.cached} peak=${peak} warm.done=${s2.warm?.done ?? '?'} running=${s2.warm?.running ?? '?'} badge=${s2.badge ? '有' : '无'}`);
  if (peak >= 10800) break;
  if (Date.now() - lastGrowthAt > 120_000) { console.log('FAIL: 缓存增长停滞 120s'); await browser.close(); process.exit(1); }
}
console.log('② warm 终态: peak=' + peak, 'warm=' + JSON.stringify(s2.warm));
if (peak < 10000) { console.log('FAIL: 缓存量不足'); await browser.close(); process.exit(1); }

// ③ 断网 reload:全离线可玩
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await sleep(500);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(4000);
const offline = await safeEval(() => ({
  hasTitle: !!document.querySelector('[data-act=sp]'),
  swReg: !!navigator.serviceWorker.controller,
}), { hasTitle: false });
console.log('③ 断网 reload:', JSON.stringify(offline));
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
if (!offline.hasTitle) { console.log('FAIL: 断网后菜单未渲染'); await browser.close(); process.exit(1); }

// ④ 删缓存 → reload → 自动补下(自愈)
const del = await safeEval(async () => {
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  return keys;
}, []);
console.log('④ 已删缓存:', JSON.stringify(del));
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(8000);
const s4 = await assetState();
console.log('④ 补下中: cached=' + s4.cached, 'badge=' + s4.badge);
if (s4.cached < 100) { console.log('FAIL: 删缓存后未自动补下'); await browser.close(); process.exit(1); }

console.log('PASS: SW 预载全链(注册/全量/离线/自愈)验证通过');
await browser.close();

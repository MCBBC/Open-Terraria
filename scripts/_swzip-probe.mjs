// zip 资源包 E2E 探针(2026-08-19):对 vite preview 的 dist 验证四幕——
// ① warm 期间被裁剪族(sprites/vanilla|sounds|audios/music)逐文件请求 = 0,
//   新增请求仅 manifest+N 片 zip+vendor+sw(基线:改前逐文件 ~11.3k 请求)
// ② 中途断网 3s → 恢复 → watchdog 接力最终 done==total 且 failed==0
// ③ caches 实测条数 ≥ manifest.totalFiles
// ④ 断网 reload → 菜单照常 + 完成标志秒开(门槛快过)
// 用法:node tools/run-diag.mjs scripts/_swzip-probe.mjs(SW_ORIGIN 指 preview 端口)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- 请求账本(CDP 全程记账) ----
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
const reqLog = { pruned: [], zips: [], vendor: 0, swjs: 0, manifest: 0, uiLoose: 0 };
cdp.on('Network.requestWillBeSent', (r) => {
  const p = new URL(r.request.url).pathname;
  if (/^\/sprites\/vanilla\//.test(p) || /^\/sounds\//.test(p) || /^\/audios\/music\//.test(p)) reqLog.pruned.push(p);
  else if (/^\/assets-zip\/.+\.zip$/.test(p)) reqLog.zips.push(p);
  else if (p === '/vendor/fflate.js') reqLog.vendor++;
  else if (p === '/sw.js') reqLog.swjs++;
  else if (p === '/assets-zip/manifest.json') reqLog.manifest++;
  else if (/^\/sprites\/vanilla-ui\//.test(p)) reqLog.uiLoose++;
});

// ---- A:全新态(清 caches reload) ----
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(3000);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); }).catch(() => {});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });

// ---- B:等 warm 完成,中途断网 3s(断点续传) ----
await sleep(6000);   // 让 warm 起步(进第一片)
await cdp.send('Network.emulateNetworkConditions', { offline: true });
await sleep(3000);
await cdp.send('Network.emulateNetworkConditions', { offline: false });

let st = null, manifest = null;
for (let i = 0; i < 120; i++) {
  await sleep(3000);
  st = await page.evaluate(() => (window.__swAssetCache ? window.__swAssetCache.state() : null)).catch(() => null);
  if (st && st.done >= st.total && st.failed === 0 && !st.warming) break;
  if (i % 10 === 4) console.log(`  warm 等待 t=${i * 3}s:`, st ? JSON.stringify(st) : '(无句柄)');
}
check('② 断网 3s 后 watchdog 接力完成', !!st && st.done >= st.total && st.failed === 0, st ? `done=${st.done}/${st.total} failed=${st.failed}` : 'no-state');

manifest = await page.evaluate(async () => (await (await fetch('assets-zip/manifest.json')).json())).catch(() => null);
check('① 被裁剪族逐文件请求 = 0(全走 zip)', reqLog.pruned.length === 0,
  `pruned=${reqLog.pruned.length} ${reqLog.pruned.slice(0, 3).join(',')} | zip=${reqLog.zips.length} 片 manifest=${reqLog.manifest} vendor=${reqLog.vendor} | uiLoose=${reqLog.uiLoose}(菜单散件,预期非零)`);
check('① zip 片请求数 = 分片数', !!manifest && reqLog.zips.length >= manifest.parts.length,
  manifest ? `zips=${reqLog.zips.length}/${manifest.parts.length}` : 'no-manifest');

// ---- C:缓存实测条数 ----
const cached = await page.evaluate(async (ver) => {
  let n = 0;
  for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
  return n;
}, st?.version ?? '').catch(() => -1);
check('③ caches 条数 ≥ totalFiles', manifest && cached >= manifest.totalFiles, `cached=${cached} totalFiles=${manifest?.totalFiles}`);

// ---- D:断网 reload 菜单可用 + 完成标志 ----
await cdp.send('Network.emulateNetworkConditions', { offline: true });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
await sleep(5000);
const offlineOk = await page.evaluate(() => {
  const flag = (() => { try { return Object.keys(localStorage).some((k) => k.startsWith('swAssetsComplete:')); } catch { return false; } })();
  const menuVisible = !!document.querySelector('[data-act=sp], .sw-menu, canvas');
  return { flag, menuVisible };
}).catch(() => null);
await cdp.send('Network.emulateNetworkConditions', { offline: false });
check('④ 断网 reload:菜单渲染 + 完成标志在位', !!offlineOk && offlineOk.menuVisible && offlineOk.flag, JSON.stringify(offlineOk));

console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);

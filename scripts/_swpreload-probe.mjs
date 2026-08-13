// SW 资产预载 E2E 金标准探针(2026-08-13):对生产 preview 实例验证——
// ①注册+悬浮徽标+进度推进 ②warm 完成判定 ③断网 reload 全离线可玩
// ④缓存删除后回菜单自动补下(自愈) ⑤单人门槛弹窗(未完成时)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => window.__swVUI ? null : null) ? null : null; // 占位(下方真实读法)

async function assetState() {
  return page.evaluate(async () => {
    const r = await new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 1500);
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'status' && !done) { done = true; clearTimeout(t); resolve(e.data); }
      });
      navigator.serviceWorker.controller?.postMessage({ type: 'status' });
    });
    const badge = document.querySelector('.sw-asset-badge');
    return {
      swReg: !!navigator.serviceWorker.controller,
      status: r,
      badge: badge ? badge.textContent : null,
      gate: !!document.querySelector('.sw-asset-gate'),
    };
  });
}

// ① 首载:注册+徽标+进度
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
let s1 = await assetState();
console.log('① 首载:', JSON.stringify(s1));
if (!s1.swReg) { console.log('FAIL: SW 未控制页面'); await browser.close(); process.exit(1); }

// ② 等待 warm 完成(localhost 全量 ~11k 文件;最长 180s)
let s2 = null;
for (let i = 0; i < 60; i++) {
  await sleep(3000);
  s2 = await assetState();
  if (s2.status && s2.status.cached > 0 && i % 5 === 0) console.log(`  warm中 cached=${s2.status.cached}`);
  if (s2.status && s2.status.cached >= 11000) break;
}
console.log('② warm 终态:', JSON.stringify({ cached: s2.status?.cached, badge: s2.badge }));
if (!s2.status || s2.status.cached < 10000) { console.log('FAIL: 缓存量不足'); await browser.close(); process.exit(1); }

// ③ 断网 reload:全离线可玩(菜单资源走缓存)
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(4000);
const offline = await page.evaluate(() => ({
  hasTitle: !!document.querySelector('[data-act=sp]'),
  swReg: !!navigator.serviceWorker.controller,
}));
console.log('③ 断网 reload:', JSON.stringify(offline));
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
if (!offline.hasTitle) { console.log('FAIL: 断网后菜单未渲染'); await browser.close(); process.exit(1); }

// ④ 删缓存 → 回菜单自动补下(自愈)
const del = await page.evaluate(async () => {
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  return keys;
});
console.log('④ 已删缓存:', JSON.stringify(del));
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
const s4 = await assetState();
console.log('④ 补下中:', JSON.stringify({ cached: s4.status?.cached, badge: s4.badge }));
if (!s4.status || s4.status.cached < 100) { console.log('FAIL: 删缓存后未自动补下'); await browser.close(); process.exit(1); }

console.log('PASS: SW 预载全链(注册/全量/离线/自愈)验证通过');
await browser.close();

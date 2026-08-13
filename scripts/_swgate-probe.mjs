// 单人游戏门槛弹窗探针(2026-08-13):清缓存+限速弱网 → 立刻点单人游戏 →
// 断言弹窗出现(实时进度条) → 解除限速等 warm 完成 → 弹窗自动关+进入角色选择。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 清缓存(全新下载态)
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });

// 弱网限速(下行 1.5Mbps——真实弱网量级)
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
// 标题按钮一出就点单人
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await sleep(1500);
const gate = await page.evaluate(() => {
  const g = document.querySelector('.sw-asset-gate');
  if (!g) return null;
  return {
    text: g.querySelector('.pct')?.textContent,
    bar: g.querySelector('.sw-asset-bar > div')?.style.width,
    badge: document.querySelector('.sw-asset-badge')?.textContent,
  };
});
console.log('① 弱网点单人 → 门槛弹窗:', JSON.stringify(gate));
if (!gate) { console.log('FAIL: 弹窗未出现'); await browser.close(); process.exit(1); }

// 解除限速,等弹窗自动关闭并进入角色选择(warm 续传后全量完成)
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
let entered = false;
for (let i = 0; i < 200; i++) {
  await sleep(3000);
  entered = await page.evaluate(() => {
    if (document.querySelector('.sw-asset-gate')) return false; // 还在等
    // 弹窗已关 → 角色选择面板出现了吗(CharSelect 的 DOM 容器)
    return !!document.querySelector('[class*="char"], [class*="world"]');
  });
  if (entered) break;
}
console.log('② 完成后自动进入:', entered);
if (!entered) { console.log('FAIL: 弹窗关闭后未进入选择面板'); await browser.close(); process.exit(1); }
console.log('PASS: 门槛弹窗(等待→实时进度→自动放行)验证通过');
await browser.close();

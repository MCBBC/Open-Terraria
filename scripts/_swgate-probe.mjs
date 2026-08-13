// 单人游戏门槛弹窗探针 v2(2026-08-13):清缓存+限速弱网 → 立刻点单人游戏 →
// 弹窗出现(实时进度条)截图 → 解除限速等完成 → 自动放行进角色选择。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const DIR = '/tmp/sw-gate-probe';
mkdirSync(DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 清缓存(全新下载态)——需先有一次加载让 SW 就位
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); }).catch(() => {});

// 弱网限速(下行 1.5Mbps);等待预算放大(限速下 JS 9.6MB 需 ~60s+)
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 1.5 * 1024 * 1024 / 8, uploadThroughput: 1.5 * 1024 * 1024 / 8 });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 240000 }).catch(() => {});
await page.waitForSelector('[data-act=sp]', { timeout: 240000 });
await page.click('[data-act=sp]');
await sleep(1500);
const gate = await page.evaluate(() => {
  const g = document.querySelector('.sw-asset-gate');
  if (!g) return null;
  return {
    pct: g.querySelector('.sw-asset-pct')?.textContent,
    barW: g.querySelector('.slot > div')?.style.width,
    hasOuter: !!getComputedStyle(g.querySelector('.outer') ?? g).backgroundImage?.includes('WorldGen'),
    badge: document.querySelector('.sw-asset-badge')?.textContent,
  };
});
console.log('① 弱网点单人 → 门槛弹窗:', JSON.stringify(gate));
await page.screenshot({ path: `${DIR}/gate-modal.png` });
if (!gate) { console.log('FAIL: 弹窗未出现'); await browser.close(); process.exit(1); }

// 解除限速 → 等弹窗自动关闭并进入选择面板(CharSelectPanel 根类名=sw-list-panel)
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
let entered = false;
let lastDump = '';
for (let i = 0; i < 160; i++) {
  await sleep(3000);
  entered = await page.evaluate(() => {
    if (document.querySelector('.sw-asset-gate')) return false;
    return !!document.querySelector('.sw-list-panel');
  }).catch(() => false);
  if (i % 10 === 0) {
    lastDump = await page.evaluate(() => {
      const g = document.querySelector('.sw-asset-gate .sw-asset-pct');
      const st = window.__swAssetCache ? JSON.stringify(window.__swAssetCache.state()) : '?';
      return `gatePct=${g?.textContent ?? '(弹窗已关)'} state=${st}`;
    }).catch(() => '(页面失联)');
    console.log(`  等待中 t=${i * 3}s ${lastDump}`);
  }
  if (entered) break;
}
console.log('② 完成后自动进入:', entered);
if (!entered) { console.log('FAIL: 弹窗关闭后未进入选择面板; 末态:', lastDump); await browser.close(); process.exit(1); }
console.log('PASS: 门槛弹窗(等待→实时进度→自动放行)+像素风截图 → ' + DIR + '/gate-modal.png');
await browser.close();

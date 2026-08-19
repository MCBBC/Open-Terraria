// zip warm 状态机诊断采样:2s 粒度打 state(含内部游标)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('console', (m) => { const t = m.text(); if (t.includes('[swzip]')) console.log('PAGE:', t); });
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
let zipReqs = [];
cdp.on('Network.requestWillBeSent', (r) => { const p = new URL(r.request.url).pathname; if (/assets-zip\/.+\?diag|assets-zip\/p\d/.test(p)) zipReqs.push(p); });
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(3000);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 45; i++) {
  await sleep(2000);
  const st = await page.evaluate(() => {
    const s = window.__swAssetCache?.state?.();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('swAssetsComplete'));
    return s ? { done: s.done, total: s.total, failed: s.failed, phase: s.phase, warming: s.warming, flag: keys } : null;
  }).catch(() => null);
  console.log(`t=${i * 2}s`, JSON.stringify(st), `zipReqs=${zipReqs.length} last=${zipReqs[zipReqs.length - 1] ?? '-'}`);
  if (st && st.done >= st.total && st.failed === 0 && !st.warming && i > 10) break;
}
await browser.close();

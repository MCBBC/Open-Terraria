// BJ46 最小载入步进探针：定位 loadJson 慢/挂点（含应用启动等待）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/sw|error|fail|load|worldgen/i.test(t)) console.log('[console]', t.slice(0, 200)); });
const t0 = Date.now();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000, polling: 500 });
console.log('step2 flow ready', Date.now() - t0);
await page.evaluate(async () => {
  window.__bj46t = Date.now();
  const txt = await (await fetch('/debug-save.sbw.json')).text();
  window.__bj46fetched = txt.length;
  await window.__swFlow.loadJson(txt);
  window.__bj46loaded = Date.now();
});
console.log('step3 loadJson returned', Date.now() - t0);
await page.waitForFunction(() => !!window.__swGame, { timeout: 180000, polling: 500 });
console.log('step4 game ready', Date.now() - t0, JSON.stringify(await page.evaluate(() => ({ fetched: window.__bj46fetched, loadMs: window.__bj46loaded - window.__bj46t }))));
await browser.close();

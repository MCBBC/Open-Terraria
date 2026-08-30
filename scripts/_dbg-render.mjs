// 主入口健康探针:flow 就绪/页面错误/控制台错误 三合一
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: 'new', protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pe]', String(e.message).slice(0, 250)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[ce]', String(m.text()).slice(0, 250)); });
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
const t0 = Date.now();
let ok = false;
while (Date.now() - t0 < 90000) {
  await new Promise((r) => setTimeout(r, 500));
  try { ok = await page.evaluate(() => !!window.__swFlow); } catch { ok = false; }
  if (ok) break;
}
console.log(JSON.stringify({ flowReady: ok, waitedMs: Date.now() - t0 }));
await browser.close();

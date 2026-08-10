import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300)); });
page.on('dialog', async (d) => { console.log('DIALOG:', d.message().slice(0, 200)); await d.dismiss(); });
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
// 直接经 __swFlow.importWld 触发(读文件为 ArrayBuffer 传入)
const r = await page.evaluate(async () => {
  const buf = await fetch('file:///Users/vinlic/Downloads/Starter_World%20Master.wld').then((r) => r.arrayBuffer()).catch((e) => null);
  if (!buf) return 'fetch-file-failed';
  try {
    await window.__swFlow.importWld(new Uint8Array(buf));
    return 'ok';
  } catch (e) {
    return 'THROWN: ' + e.message + '\n' + (e.stack ?? '');
  }
});
console.log('importWld result:', r);
await new Promise((r2) => setTimeout(r2, 4000));
await browser.close();

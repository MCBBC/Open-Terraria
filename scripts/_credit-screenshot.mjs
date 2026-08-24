// 截图留证：右下署名两行 zh/en 各一张（裁右下角区域放大看）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();

const seedLang = (lang) => page.evaluateOnNewDocument((lang2) => {
  const req = indexedDB.open('sandboxworld', 2);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(JSON.stringify({ lang: lang2 }), 'sandboxworld.options');
  };
}, lang);

await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: '/tmp/credit-zh.png', clip: { x: 640, y: 640, width: 640, height: 160 } });

await seedLang('en-US');
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: '/tmp/credit-en.png', clip: { x: 400, y: 640, width: 880, height: 160 } });

await browser.close();
console.log('shots saved');

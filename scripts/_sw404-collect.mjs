// 收集首访(清缓存)菜单阶段被裁剪族的全量 404 路径 → prune keep 清单
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
const seen = new Map();   // path → count
cdp.on('Network.responseReceived', (r) => {
  if (r.response.status === 404) {
    const p = new URL(r.response.url).pathname;
    seen.set(p, (seen.get(p) ?? 0) + 1);
  }
});
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5311', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); }).catch(() => {});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 45000));   // 菜单静置 45s
const list = [...seen.entries()].sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify(list.slice(0, 40)));
console.log('TOTAL distinct 404:', list.length, 'total hits:', list.reduce((a, b) => a + b[1], 0));
await browser.close();

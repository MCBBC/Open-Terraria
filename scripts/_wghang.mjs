// worldgen 卡点定位:hook worker 消息
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 120000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('console', (m) => console.log('CON:', m.text().slice(0, 180)));
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto('http://localhost:5207/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('select', { timeout: 60000 });
// 注入 worker 消息嗅探(在页面环境包装 Worker)
await page.evaluate(() => {
  const OrigWorker = window.Worker;
  window.Worker = class extends OrigWorker {
    constructor(url, opts) {
      super(url, opts);
      console.log('[sniff] Worker created:', String(url).slice(0, 80));
      this.addEventListener('message', (ev) => {
        const d = ev.data;
        const kind = d && (d.type ?? d.kind ?? d.phase ?? '?');
        console.log('[sniff] msg:', String(kind).slice(0, 60), JSON.stringify(d).slice(0, 120));
      });
      this.addEventListener('error', (ev) => console.log('[sniff] WORKER ERROR:', ev.message?.slice(0, 200)));
    }
  };
});
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await new Promise((r) => setTimeout(r, 20000));
await browser.close();

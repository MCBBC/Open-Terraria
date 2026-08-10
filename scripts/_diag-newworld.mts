// 诊断：newWorld 是否能完成 + 错误日志
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`CONSOLE[${m.type()}]:`, m.text().slice(0, 300)); });
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
console.log('[diag] calling newWorld');
const r = await Promise.race([
  page.evaluate(() => (window as any).__swFlow.newWorld('diag', 800, 300).then(() => 'resolved')),
  new Promise((res) => setTimeout(() => res('TIMEOUT-60s'), 60000)),
]);
console.log('[diag] newWorld:', r);
const st = await page.evaluate(() => {
  const g = (window as any).__swGame;
  return { hasGame: !!g, hasWorld: !!g?.world, progress: document.querySelector('.sw-progress, [class*=progress]')?.textContent?.slice(0, 80) ?? '?' };
});
console.log('[diag] state:', JSON.stringify(st));
await browser.close();

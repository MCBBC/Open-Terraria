// 世界创建流程卡点:点击后 UI 状态/控制台全量捕获
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 60000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]')) console.log('CON:', t.slice(0, 160)); });
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 250)));
await page.goto('http://localhost:5207/', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('select', { timeout: 30000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
const btnInfo = await page.evaluate(() => {
  const b = document.querySelector('button');
  return { text: b?.textContent, disabled: b?.disabled };
});
console.log('button:', JSON.stringify(btnInfo));
await page.click('button');
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await page.evaluate(() => ({
    hasGame: !!window.__swGame,
    uiText: (document.body.innerText.match(/(创建|生成|加载|进度|错误|error)[^\n]{0,40}/) || [null])[0],
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log('t+' + i * 3 + 's', JSON.stringify(st));
}
await browser.close();

import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const removed = await page.evaluate(() => {
  // 只删欢迎弹窗本体(body 级 fixed 覆盖层,标题含 SandboxWorld;新世界 toast 在 .sw-root 内不动)
  const holder = [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld'));
  holder.forEach((d) => d.remove());
  return holder.length;
});
await page.evaluate(() => { try { window.__swUI.openInventory(); } catch {} });
await new Promise((r) => setTimeout(r, 500));
const ok = await page.evaluate((removed) => ({
  rootAlive: !!document.querySelector('.sw-root'),
  dockAlive: !!document.querySelector('.sw-eqdock'),
  gridAlive: !!document.querySelector('.sw-panel .sw-slot[data-idx="10"][data-where="inv"]'),
  removed,
}), removed);
console.log(JSON.stringify(ok), 'ERRS', JSON.stringify(errs.slice(0, 3)));
await page.screenshot({ path: 'shots/batch5-align.png' });
await browser.close();

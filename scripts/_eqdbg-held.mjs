import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld')).forEach((d) => d.remove());
  window.__swUI.openInventory();
  const s10 = document.querySelector('.sw-panel .sw-invgrid .sw-slot[data-idx="10"]');
  const before = getComputedStyle(s10, '::before');
  return {
    beforeBg: before.backgroundColor,          // 期望 transparent(不再是 220 灰)
    beforeBlend: before.mixBlendMode,          // 期望 normal
    slotOpacity: getComputedStyle(s10).opacity,      // 1(物品全亮)
    afterOpacity: getComputedStyle(s10, '::after').opacity,  // 0.575
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: 'shots/batch7c.png' });
await browser.close();

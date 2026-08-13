// 一次性:成就入口验证——顶栏按钮已摘,Advisor 卡在位且可点开成就面板
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 600));
const out = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll('.sw-panel button')].map((b) => b.textContent.trim());
  const advisor = document.querySelector('.sw-ach-advisor');
  const advisorVisible = advisor ? getComputedStyle(advisor).display !== 'none' : false;
  let opened = false;
  if (advisor && advisorVisible) {
    advisor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    opened = !!document.querySelector('.sw-ach-panel, [class*="achieve"]');
  }
  return { topbarButtons: btns, advisorPresent: !!advisor, advisorVisible, clickOpensPanel: opened };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

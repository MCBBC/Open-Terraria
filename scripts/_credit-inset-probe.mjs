// 探针：右下署名右缘贴边(2026-08-24 用户报右侧留白)——右缘内距应≈10px(与左下
// 版本号 left:10px 镜像对称)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 12000)); // 等 splash 揭幕
const out = await page.evaluate(() => {
  const credit = document.querySelector('[data-credit]');
  const version = document.querySelector('.sw-title-version');
  const cr = credit?.getBoundingClientRect();
  const vr = version?.getBoundingClientRect();
  return {
    creditRightInset: cr ? Math.round(window.innerWidth - cr.right) : null,
    versionLeftInset: vr ? Math.round(vr.x) : null,
    creditText: credit ? credit.innerText.split('\n')[0].slice(0, 30) : null,
  };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: '/tmp/credit-inset.png', clip: { x: 880, y: 700, width: 400, height: 100 } });
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(out.creditRightInset !== null && Math.abs(out.creditRightInset - 10) <= 2, `右缘内距应≈10px: ${out.creditRightInset}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();

// tree-inspect.html 冒烟：加载、零错、渲染出树、标注/导出可用
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 120000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(() => {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let opaque = 0;
  for (let j = 3; j < img.length; j += 4) if (img[j] > 40) opaque++;
  // 触发导出
  document.getElementById('export').click();
  return { w: cv.width, h: cv.height, opaque, outLen: document.getElementById('out').value.length };
});
console.log(JSON.stringify(res), 'JS错误:', errs.length ? errs.join(' | ') : '无');
await page.screenshot({ path: '/tmp/tree-inspect.png' });
await browser.close();

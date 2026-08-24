// 截图：世界生成进度条（Outer_Lower 8px 偏移修正前后对比）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等世界生成文案消失的瞬间 = 资源装载段开始（双条 UIGenProgressBar）→ 零延迟截屏
let seenGen = false;
for (let i = 0; i < 900; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const txt = await page.evaluate(() => document.body.innerText ?? '').catch(() => '');
  if (/正在生成|正在让|平滑/.test(txt)) seenGen = true;
  else if (seenGen && txt.length > 0) {
    await page.screenshot({ path: '/tmp/genbar-fixed.png', clip: { x: 100, y: 250, width: 1080, height: 300 } });
    await browser.close();
    console.log('shot saved (transition)');
    process.exit(0);
  }
}
await page.screenshot({ path: '/tmp/genbar-fixed.png', clip: { x: 100, y: 300, width: 1080, height: 200 } });
await browser.close();
console.log('shot saved');

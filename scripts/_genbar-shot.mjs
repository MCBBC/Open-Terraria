// 截图：世界生成进度条（Outer_Lower 8px 偏移修正前后对比）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等世界生成完 → 资源装载段（双条 UIGenProgressBar）——轮询到装载文案立即截屏
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 150));
  const txt = await page.evaluate(() => document.body.innerText ?? '').catch(() => '');
  if (/加载世界|世界贴图|LoadWorld/.test(txt)) {
    await new Promise((r) => setTimeout(r, 300)); // 让双条首帧画出
    await page.screenshot({ path: '/tmp/genbar-fixed.png', clip: { x: 100, y: 300, width: 1080, height: 200 } });
    await browser.close();
    console.log('shot saved (loading phase)');
    process.exit(0);
  }
}
await page.screenshot({ path: '/tmp/genbar-fixed.png', clip: { x: 100, y: 300, width: 1080, height: 200 } });
await browser.close();
console.log('shot saved');

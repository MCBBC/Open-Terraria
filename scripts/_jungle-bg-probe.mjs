// _jungle-bg-probe:丛林远景背景接续修复验证(加载用户存档,截屏背景带)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
// ★跳过 worldgen:标题页直接 loadJson 读档（省 3-5 分钟建图;读档直进世界）
const loadRes = await page.evaluate(async () => {
  const r = await fetch('/tmp-jungle-world.json');
  if (!r.ok) return `fetch ${r.status}`;
  await window.__swFlow.loadJson(await r.text());
  return 'ok';
});
console.log('loadJson →', loadRes);
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.header?.width === 4200, { timeout: 800000, polling: 1000 });
const loaded = await page.evaluate(async () => {
  const r = await fetch('/tmp-jungle-world.json');
  if (!r.ok) return `fetch ${r.status}`;
  await window.__swFlow.loadJson(await r.text());
  return 'ok';
});
console.log('loadJson →', loaded);
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if (await page.evaluate(() => !!window.__swGame && !!window.__swGame.world && window.__swGame.world.header?.width === 4200).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 5000));   // 背景贴图加载+alpha 收敛
await page.screenshot({ path: '/tmp/jungle-bg-fixed.png' });
console.log('screenshot saved; errors:', errors.slice(0, 2).join(' | ') || '无');
await browser.close();

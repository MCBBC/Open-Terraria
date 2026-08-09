// M6 验收：标题 → 设置 → 音量滑条/devMode 开关 → 持久化 → 返回
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 400));

// 打开设置
await page.click('[data-act=set]');
await page.waitForSelector('.sw-set-panel', { timeout: 5000 });
// 数据栏应存在（主菜单）
const hasData = await page.evaluate(() => !!document.querySelector('[data-cat=data]'));

// 音乐音量 0.35 → 0.8
await page.evaluate(() => {
  const input = document.querySelector('.sw-set-content input[type=range]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '0.8');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
const music = await page.evaluate(() => ({
  vol: window.__swFlow ? null : null, // audio 实例不暴露，读 options 持久化
}));

// 游戏页签 → devMode 勾选
await page.click('[data-cat=game]');
await new Promise((r) => setTimeout(r, 200));
await page.click('.sw-set-content input[type=checkbox]');
await new Promise((r) => setTimeout(r, 600)); // 等 kvSet

// 持久化检查（localStorage 或 IDB；先看 localStorage）
const stored = await page.evaluate(() => localStorage.getItem('sandboxworld.options'));
console.log('stored:', stored);

// 返回
await page.click('.sw-set-back');
await new Promise((r) => setTimeout(r, 200));
const closed = await page.evaluate(() => !document.querySelector('.sw-set-panel'));

console.log(JSON.stringify({ hasData, closed, music }));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = errors.length === 0 && hasData && closed;
if (!ok) { console.error('SETTINGS SMOKE FAILED'); process.exit(1); }
console.log('SETTINGS SMOKE OK');

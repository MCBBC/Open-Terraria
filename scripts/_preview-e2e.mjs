// 世界创建加载页端到端冒烟：真实 worker 路径 + UIWorldLoadState + GenWorldPreview 擦除动画。
// 断言：①预览区出现且持续变化（截图哈希去重数 ≥4）②最终进入游戏 ③无 pageerror。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
// 标题 → 角色列表
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 900));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('预览探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
}
// 选角色 → 世界列表 → 新建小世界
await page.click('.sw-item');
await page.waitForFunction(() => { const t = document.querySelector('.sw-list-title'); return t && t.textContent === '选择世界'; }, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('[data-g=size] .sw-wc-opt');   // 小世界
await new Promise((r) => setTimeout(r, 200));

// 点创建的同时开始采样：底部预览带截图哈希序列
const sampler = page.evaluate(() => new Promise((resolve) => {
  window.__swPrevShots = [];
  const tick = () => {
    const g = window.__swGame;
    if (g && g.player) return resolve('ingame');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
await page.click('[data-act=create]');

const hashes = new Set();
let ingame = false;
for (let i = 0; i < 400; i++) {
  ingame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
  if (ingame) break;
  const buf = await page.screenshot({ clip: { x: 360, y: 480, width: 640, height: 340 } });
  hashes.add(buf.toString('base64').length + ':' + buf.reduce((a, b, i) => ((a * 31 + b) & 0xffffff), 7));
  await new Promise((r) => setTimeout(r, 150));
}
await sampler;
console.log(JSON.stringify({
  distinctLoadScreenStates: hashes.size,
  enteredGame: ingame,
  pageErrors: errs.slice(0, 3),
}, null, 2));
const ok = hashes.size >= 4 && ingame && errs.length === 0;
console.log(ok ? 'PASS: 加载页预览持续变化并正常进图' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);

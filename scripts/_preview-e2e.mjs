// 世界创建加载页端到端冒烟：真实 worker 路径 + UIWorldLoadState + GenWorldPreview 擦除动画。
// 导航流同 _vsel-dblclick-probe（当前原版化菜单：splash 揭幕→单人→角色→世界→创建）。
// 断言：①加载期预览带持续变化（截图哈希去重 ≥4）②最终进游戏 ③无 pageerror。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));

await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('预览探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 400));
await page.click('[data-f=seed]');
await page.keyboard.type('prevwipetest');
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
  opts[0]?.click();   // 小世界（生成最快）
});
await new Promise((r) => setTimeout(r, 300));

await page.click('[data-act=create]');   // 进 UIWorldLoadState

// 加载期采样底部预览带（等比缩放后位于底部居中），哈希去重计变化
const hashes = new Set();
const SHOTS = process.env.SAVE_SHOTS ?? '';   // 设为目录路径时保存前几张中间态截图
let ingame = false;
for (let i = 0; i < 400; i++) {
  ingame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player));
  if (ingame) break;
  const buf = await page.screenshot({ clip: { x: 360, y: 470, width: 640, height: 350 } });
  let h = 7;
  for (let j = 0; j < buf.length; j += 97) h = ((h * 31) + buf[j]) & 0xffffff;   // 抽样 FNV
  hashes.add(h);
  if (SHOTS && [4, 12, 24].includes(i)) await import('node:fs').then((fs) => fs.writeFileSync(`${SHOTS}/load-${i}.png`, buf));
  await new Promise((r) => setTimeout(r, 150));
}
console.log(JSON.stringify({
  distinctLoadScreenStates: hashes.size,
  enteredGame: ingame,
  pageErrors: errs.slice(0, 3),
}, null, 2));
const ok = hashes.size >= 4 && ingame && errs.length === 0;
console.log(ok ? 'PASS: 加载页预览持续变化并正常进图' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);

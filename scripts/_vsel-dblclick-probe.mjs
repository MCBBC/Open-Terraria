// 世界列表残留竞态回归探针（2026-08-25 用户报：点进世界后世界列表浮在游戏画面上）：
//   根因=角色/世界行 click+dblclick 双挂 enter → close(fn)，双击时 dblclick 仍派发到
//   已拆离行 → 二次 close 重跑 fn → 角色行双击连建两层世界列表（像素级重叠），点顶层
//   进游戏后底层浮在加载页（DOM z-20 > VUI 画布）/游戏画面上；世界行双击并发跑两次
//   loadWorldFlow。修=close() 防重入门（WorldSelectPanel/CharSelectPanel）。
// 断言：
//   A1 角色行 click+dblclick（dblclick 派发到已拆离行）→ 世界列表面板恰 1 层（修前 2）
//   A2 世界行 click+dblclick → 进游戏后 .sw-vsel 全清零（修前残留 1 层）
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_vsel-dblclick-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
// 角色不存在则先建一个（同 _batch5-probe 流程），回到角色选择
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('双击竞态');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
// 世界不存在则先建一个小世界（同 _batch5-probe 流程），回到世界选择
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界（读档最快）
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
  // 创建直进游戏 → 等就绪后 Esc 暂停菜单 → 末钮（返回主菜单）退出（拿到存在世界档的环境）
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sw-pause-panel', { timeout: 10000 });
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.sw-pause-btn');
    btns[btns.length - 1]?.click();   // 末钮 = 返回主菜单（BackToMenu）
  });
  await page.waitForSelector('.sw-title-menu', { timeout: 30000 });
  await page.click('[data-act=sp]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');   // 进世界选择
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
}

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- A1 角色行双击 → 世界列表恰 1 层 ----
// 复现浏览器双击派发序：click（面板关闭+onPlay）→ dblclick（派发到已拆离行）
{
  await page.click('.sw-vsel [data-act=back]');   // 世界选择 → 角色选择
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  const isChar = await page.evaluate(() =>
    !(document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'));
  if (!isChar) throw new Error('A1 前置失败：不在角色选择页');
  const n = await page.evaluate(() => {
    const row = document.querySelector('.sw-vsel .sw-vitem');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));   // 已拆离行仍收派发
    return document.querySelectorAll('.sw-vsel').length;
  });
  await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
  check('A1 角色行双击后世界列表恰 1 层（修前 2 层像素级重叠）', n === 1, `panels=${n}`);
}

// ---- A2 世界行双击 → 进游戏后 .sw-vsel 全清零 ----
{
  const n = await page.evaluate(() => {
    const row = document.querySelector('.sw-vsel .sw-vitem');
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));   // 防重入：不二次 loadWorldFlow
    return document.querySelectorAll('.sw-vsel').length;
  });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
  const left = await page.evaluate(() => document.querySelectorAll('.sw-vsel').length);
  check('A2 世界行双击后进游戏 .sw-vsel 残留=0（修前残留 1 层浮在游戏上）', left === 0, `click时=${n} 游戏内=${left}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (errors.length) console.log('pageerror:', errors.slice(0, 3));
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);

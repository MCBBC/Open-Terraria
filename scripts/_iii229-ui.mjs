// IIIII229 探针：① Esc 中止链 E2E + ③ 生成屏 tips/预览层叠取证（截图）+ ② 池文案抽查。
// 运行：SW_ORIGIN=http://localhost:5285 node tools/run-diag.mjs scripts/_iii229-ui.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(6000);   // 启动链(assets/splash/音频门探针)自走

// 0) 音频门：真实手势放行(isTrusted 门,合成 dispatchEvent 拒收)——headless 自动播受阻即出门
try { await page.mouse.click(640, 400); } catch {}
await sleep(1500);
try { await page.keyboard.press('Enter'); } catch {}

// 1) 标题屏就绪
for (let i = 0; i < 90; i++) {
  if (await page.$('[data-act=sp]')) break;
  if (i % 15 === 0) console.log('waiting title...', i, (await page.evaluate(() => document.body ? document.body.innerText.slice(0, 80) : 'nobody').catch(() => 'err')));
  await sleep(1000);
}
if (!(await page.$('[data-act=sp]'))) { console.log('FAIL: title screen not ready'); process.exit(1); }
// 导航链照 _iiii221-tipsub（splash→单人→角色(空则建)→世界→创建）
for (let i = 0; i < 60 && !(await page.$('.sw-title-menu')); i++) await sleep(1000);
for (let i = 0; i < 60; i++) {
  if (!(await page.$('#sw-splash'))) break;
  await sleep(1000);
}
await sleep(800);
let vselOk = false;
for (let i = 0; i < 20 && !vselOk; i++) {
  await page.click('[data-act=sp]').catch(() => {});
  vselOk = await page.waitForSelector('.sw-vsel', { timeout: 1600 }).then(() => true).catch(() => false);
}
if (!vselOk) { console.log('FAIL: char panel not ready'); process.exit(1); }
await sleep(600);
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('iiii229探针');
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await sleep(500);
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await sleep(600);
let creOk = false;
for (let i = 0; i < 10 && !creOk; i++) {
  await page.click('.sw-vsel [data-act=new]').catch(() => {});
  creOk = await page.waitForSelector('[data-f=seed]', { timeout: 1600 }).then(() => true).catch(() => false);
}
if (!creOk) { console.log('FAIL: creation panel not ready'); process.exit(1); }
await sleep(400);

// 2) 填种子（多段组合——同时验 ⑥M1 图标派生在真实 UI 链路上不炸）
await page.evaluate(() => {
  const el = document.querySelector('[data-f=seed]');
  el.value = '05162020|not the bees';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(600);
await page.screenshot({ path: '/tmp/iii229-out/creation-panel.png' });
console.log('OK: creation panel seeded (05162020|not the bees)');

// 3) 点创建 → 生成屏
await page.click('[data-act=create]');
let genUi = false;
for (let i = 0; i < 40 && !genUi; i++) {
  genUi = await page.evaluate(() => !!(window.__swGenUi)).catch(() => false);
  if (!genUi) await sleep(500);
}
if (!genUi) { console.log('FAIL: gen screen (__swGenUi) not mounted'); process.exit(1); }
console.log('OK: gen screen mounted');
await sleep(2500);

// 4) tips 池/可见性取证（② 抽查 + ③ 截图）
const tipInfo = await page.evaluate(() => {
  const s = window.__swGenUi;
  const tips = (s && s.tips) ? s.tips.map((t) => t.text) : [];
  const flags = s ? { drunk: s.seedFlags?.drunkWorldGenText, ntb: s.seedFlags?.notTheBees, zenith: s.seedFlags?.zenithWorld } : null;
  return { tipCount: tips.length, first: tips[0] ?? null, flags };
});
console.log('TIPS:', JSON.stringify(tipInfo));
await page.screenshot({ path: '/tmp/iii229-out/gen-tips.png' });
console.log('OK: gen screen screenshot saved (tips + preview)');

// 5) Esc 中止 E2E（①）
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
});
await sleep(800);
const abortState = await page.evaluate(() => {
  const s = window.__swGenUi;
  return s ? { abortQueued: !!s.abortQueued, headerText: s.header?.text ?? null } : { gone: true };
});
console.log('ABORT-STATE:', JSON.stringify(abortState));

// 等中止收场（生成屏退场回菜单）——判据=标题菜单 DOM 回归 ∧ Game.world 未创建
// （__swGenUi 是探针句柄永不清空,不作退场判据）
let backToMenu = false;
for (let i = 0; i < 45; i++) {
  const st = await page.evaluate(() => ({
    title: !!document.querySelector('.sw-title-menu'),
    world: !!(window.__swGame && window.__swGame.world),
    stillGen: (() => { try { const v = window.VUI; return false; } catch { return false; } })(),
  })).catch(() => ({ title: false, world: false }));
  if (st.title && !st.world) { backToMenu = true; break; }
  await sleep(1000);
}
const finalState = await page.evaluate(() => ({
  world: !!(window.__swGame && window.__swGame.world),
  title: !!document.querySelector('.sw-title-menu'),
}));
console.log(backToMenu ? 'OK: aborted back to menu' : 'FAIL: abort did not return to menu within 45s', JSON.stringify(finalState));
console.log(backToMenu && !finalState.world ? 'OK: no world created (QueuedAbort 语义=世界不落库)' : 'CHECK: world state after abort');
await page.screenshot({ path: '/tmp/iii229-out/after-abort.png' });

console.log('PAGE-ERRORS:', errors.length, errors.slice(0, 3));
await browser.close();

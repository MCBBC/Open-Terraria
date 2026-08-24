// 一次性:UI 对齐截图链(分阶段精确导航)——标题→角色选择→创建角色。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
// 等 splash 退场(轮询标题按钮)+云铺开
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(() => !!document.querySelector('.sw-title-btn')).catch(() => false);
  if (has) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 2500));

const visibleTexts = () => page.evaluate(() =>
  [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim().length > 0 && e.textContent.length < 24)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => `${e.className.toString().split(' ')[0] || e.tagName}::${e.textContent.trim().slice(0, 14)}`)
    .slice(0, 20));
const clickVisible = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim().includes(t));
  const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); return true; }
  return false;
}, txt);
const shot = (n) => page.screenshot({ path: `/tmp/ui-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await shot('title');
console.log('[1] click 单人模式:', await clickVisible('单人模式'));
await wait(1500);
console.log('[1] visible:', JSON.stringify(await visibleTexts()));
await shot('charselect');

// 角色选择 → 新建（footer 第二个 sw-vbtn；空列表也应有）
console.log('[2] click 新建:', await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')];
  const b = btns.find((x) => !x.textContent.includes('返回')) ?? btns[1];
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  b.click();
  return b.textContent.trim();
}));
await wait(1500);
console.log('[2] visible:', JSON.stringify(await visibleTexts()));
await shot('charcreate');

// 再建一个角色(两行更真实)
await wait(600);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')].find((x) => !x.textContent.includes('返回'));
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await wait(1200);
await page.evaluate(() => {
  const b = document.querySelector('.sw-char-panel [data-act=create]');
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await wait(1500);
await shot('charselect');
// [3] 点第一个角色行 → 世界选择
await page.evaluate(() => {
  const row = document.querySelector('.sw-vsel-list .sw-vitem');
  row?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  row?.click();
});
await wait(1500);
console.log('[3] visible:', JSON.stringify(await visibleTexts()));
await shot('worldselect-empty');
// [3b] 创建世界(小档最快) → 等生成完成进游戏
console.log('[3b] click 创建世界:', await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')].find((x) => !x.textContent.includes('返回'));
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click();
  return b.textContent.trim();
}));
await wait(1500);
await page.evaluate(() => {
  const b = document.querySelector('.sw-wc-footer [data-act=create]');
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
// 小世界生成 ~40-70s,轮询进游戏
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.world?.store)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
console.log('[3b] inGame:', inGame);
// Esc → 退出到标题(找游戏内菜单按钮)
await page.keyboard.press('Escape');
await wait(1200);
console.log('[3b] esc visible:', JSON.stringify(await visibleTexts()));
await shot('ingamemenu');

// [4] 回到主菜单 → 标题 → 单人 → 点角色行 → 世界选择(此时有已生成世界)
console.log('[4] click 回到主菜单:', await clickVisible('回到主菜单'));
await wait(2500);
console.log('[5] click 单人模式:', await clickVisible('单人模式'));
await wait(1500);
await shot('charselect');
await page.evaluate(() => {
  const row = document.querySelector('.sw-vsel-list .sw-vitem');
  row?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  row?.click();
});
await wait(1500);
console.log('[5] visible:', JSON.stringify(await visibleTexts()));
await shot('worldselect');
if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join('\n'));
await browser.close();

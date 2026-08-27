// 一次性:住房/图鉴图标钮 + 住房条常驻断言(2026-08-27 用户要求)——
//  ①房钮 hover 切 _7 红房;②图鉴钮=UI_Bestiary 2帧书,hover 切帧,与房钮居右;
//  ③点房钮→背包藏+条+✕钮出现;④模拟查询点击世界后 housingMode 保留、面板不收、
//  背包不回;⑤点 ✕ → 条收+背包回+图标回灰。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (!await page.evaluate(() => !!window.__swUI).catch(() => false)) {
  console.log(JSON.stringify({ fail: 'boot timeout: __swUI never ready' }));
  await browser.close();
  process.exit(0);
}
await page.evaluate(() => { document.querySelector('.sw-welcome, [class*="welcome"]')?.remove(); });
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 500));

const out = await page.evaluate(() => {
  const ui = window.__swUI;
  const row = ui.housingBtn?.parentElement;
  const kids = [...row.children].filter((c) => c.style.display !== 'none');
  const last2 = kids.slice(-2);
  const bst = last2[1];
  return {
    houseIcon: (ui.housingBtn.style.backgroundImage || '').includes('DisplaySlots_4'),
    bestiaryIcon: (bst?.style.backgroundImage || '').includes('UI_Bestiary.png'),
    iconsRightmost: last2[0] === ui.housingBtn && row.lastElementChild === bst,
    rowRightEdge: Math.abs(row.getBoundingClientRect().right - kids[kids.length - 1].getBoundingClientRect().right) < 2,
  };
});
// hover 房钮
await page.evaluate(() => { window.__swUI.housingBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false })); });
out.hoverRed = await page.evaluate(() => (window.__swUI.housingBtn.style.backgroundImage || '').includes('DisplaySlots_7'));
await page.evaluate(() => { window.__swUI.housingBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false })); });
// 开住房
await page.evaluate(() => {
  const ui = window.__swUI;
  ui.housingBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 900));
out.housingOpen = await page.evaluate(() => ({
  invHidden: !window.__swUI.inventoryOpen,
  strip: !!document.querySelector('.sw-housing-panel'),
  xBtn: !!document.querySelector('.sw-housing-x'),
  iconRed: (window.__swUI.housingBtn.style.backgroundImage || '').includes('DisplaySlots_5'),
}));
// 模拟查询:直接置 housingMode 再发一次左键(绕过指针几何)
await page.evaluate(() => { window.__swGame.housingMode = { kind: 'query' }; });
await page.mouse.move(700, 500);
await page.mouse.down(); await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
out.afterQuery = await page.evaluate(() => ({
  modeKept: !!window.__swGame.housingMode,
  stripStay: !!document.querySelector('.sw-housing-panel'),
  invStillHidden: !window.__swUI.inventoryOpen,
}));
// ✕ 关闭
await page.evaluate(() => {
  document.querySelector('.sw-housing-x')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 400));
out.afterX = await page.evaluate(() => ({
  stripGone: !document.querySelector('.sw-housing-panel'),
  invBack: window.__swUI.inventoryOpen,
  iconGrey: (window.__swUI.housingBtn.style.backgroundImage || '').includes('DisplaySlots_4'),
  modeCleared: !window.__swGame.housingMode,
}));
console.log(JSON.stringify(out, null, 1));
await browser.close();

// 一次性:住房图标钮+背包隐藏联动断言(2026-08-27 用户要求)——
//  ①背包页签住房钮=原版房子图标(DisplaySlots_4,非文字);②点它→背包隐藏+住房条
//  出现+图标切红房(_5);③玩家可移动(uiBlocking=false);④关条(右键条上空白/直呼
//  destroy)→背包回来+图标回灰房;⑤E 再开背包→住房条被带走。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { document.querySelector('.sw-welcome, [class*="welcome"]')?.remove(); });
await page.keyboard.press('KeyE');   // 开背包
await new Promise((r) => setTimeout(r, 500));

const out = await page.evaluate(() => {
  const ui = window.__swUI;
  const houseBtn = ui?.housingBtn ?? null;
  const bg0 = houseBtn?.style.backgroundImage ?? '';
  const invOpen0 = ui.inventoryOpen;
  // 点住房图标 → 背包应隐藏 + 住房条出现
  houseBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return { bg0: bg0.includes('DisplaySlots_4'), invOpen0, housingOpen: ui.housingOpen };
});
await new Promise((r) => setTimeout(r, 800));   // 动态 import 面板
const st1 = await page.evaluate(() => {
  const ui = window.__swUI;
  return {
    invHidden: !ui.inventoryOpen,
    housingCanvas: !!document.querySelector('.sw-housing-panel'),
    iconRed: (ui.housingBtn?.style.backgroundImage ?? '').includes('DisplaySlots_5'),
    uiBlocking: window.__swGame.input.uiBlocking,
    playerMoved: null,
  };
});
// 玩家移动验证:按住 D 500ms,X 应变化
const x0 = await page.evaluate(() => window.__swGame.player.x);
await page.keyboard.down('KeyD');
await new Promise((r) => setTimeout(r, 500));
await page.keyboard.up('KeyD');
const x1 = await page.evaluate(() => window.__swGame.player.x);
st1.playerMoved = Math.abs(x1 - x0) > 4;
// 关住房条(右键画布空白处=取消) → 背包应回来 + 图标回灰
await page.evaluate(() => {
  const cv = document.querySelector('.sw-housing-panel');
  cv?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  const ui = window.__swUI;
  window.__swHousingPanel?.destroy?.();
});
await new Promise((r) => setTimeout(r, 400));
const st2 = await page.evaluate(() => ({
  invBack: window.__swUI.inventoryOpen,
  iconGrey: (window.__swUI.housingBtn?.style.backgroundImage ?? '').includes('DisplaySlots_4'),
  housingGone: !document.querySelector('.sw-housing-panel'),
}));
// E 关背包再 E 开:住房条不应复活
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 300));
const st3 = await page.evaluate(() => ({ reopened: window.__swUI.inventoryOpen, housingStay: !document.querySelector('.sw-housing-panel') }));
console.log(JSON.stringify({ ...out, ...st1, ...st2, ...st3 }, null, 1));
await page.screenshot({ path: '/tmp/housing-hide.png' });
await browser.close();

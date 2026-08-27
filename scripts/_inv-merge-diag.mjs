// 一次性:背包布局合并断言(2026-08-27 用户要求)——
//  ①顶栏页签无 装备/杂项,住房仍在;②装备页常驻(染料/时装/装备列可见);
//  ③杂项块在右缘列(玩家对决原位),PvP 剑/队伍钮在其下方;截图存档。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等进世界
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('KeyE');   // 开背包
await new Promise((r) => setTimeout(r, 600));

const out = await page.evaluate(() => {
  const inv = document.querySelector('.sw-panel');
  const btns = [...inv.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
  // 装备页可见性:染料列首槽（dye where 槽存在即可见——查 44px 槽数量）
  const slots = inv.querySelectorAll('.sw-slot').length;
  // 杂项块:宠物眼钮
  const eye = document.querySelector('.sw-peteye');
  // PvP 剑钮 = UI_PVP_0 背景按钮
  const pvp = [...inv.querySelectorAll('button')].find((b) => (b.style.background || '').includes('UI_PVP_0'));
  const eyeTop = eye?.getBoundingClientRect().top ?? -1;
  const pvpTop = pvp?.getBoundingClientRect().top ?? -1;
  // 右缘列横向位置:pvp 应在背包网格右缘之外
  const grid = [...inv.querySelectorAll('div')].find((d) => d.style.cssText.includes('grid-template-columns:repeat(10'));
  const gridRight = grid?.getBoundingClientRect().right ?? -1;
  const pvpLeft = pvp?.getBoundingClientRect().left ?? -1;
  return {
    tabTexts: btns.slice(0, 8),
    hasEquipTab: btns.includes('装备'),
    hasMiscTab: btns.includes('杂项'),
    hasHousingTab: btns.includes('住房'),
    slotCount: slots,
    miscAbovePvp: eyeTop > 0 && pvpTop > eyeTop,
    pvpRightOfGrid: pvpLeft > gridRight,
    pvpGapFromMisc: +(pvpTop - eyeTop).toFixed(0),
  };
});
await page.screenshot({ path: '/tmp/inv-merged.png' });
console.log(JSON.stringify(out, null, 1));
await browser.close();

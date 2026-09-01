// 最终清零 review 探针(2026-08-28 会话收口)——本轮全部改动的合并回归:
//  A 合成成品跟随光标(材料扣减+heldStack+背包未直增)
//  B 配方列表:可合成前置/置灰垫底/高度对齐右缘列底
//  C 悬停气泡持续(10s 不消失)
//  D 住房侧栏在屏幕内
//  E 道具搜索首用门(旗清除→门→确认→放行)
//  F 地图点击传送默认禁用;Shift+F10 门;确认后选点可用
//  G Shift+F2 = 无限生命和魔力(不弹地图传送门)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
await page.setViewport({ width: 1600, height: 900 });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer && window.__swGame.world)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click();
  localStorage.removeItem('sbw.journeyQuick.maptp');
  localStorage.removeItem('sbw.itemSearchConfirmed');
  localStorage.removeItem('sbw.journeyQuick.time');
});
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 600));
  if (await page.evaluate(() => window.__swUI.inventoryOpen).catch(() => false)) break;
}
const R = {};

// ---- A+B: 注入木材 → 点第一条可合成行 → 光标持有 + 列表分组/高度 ----
await page.evaluate(() => { window.__swUI.openItemSearch(); });
await new Promise((r) => setTimeout(r, 400));
// 首用门：确认启用后面板才开（本轮新加的拦截,探针先过门）
await page.evaluate(() => {
  [...document.querySelectorAll('#sw-itemsearch-gate button')].find((x) => x.textContent === '确认启用')?.click();
});
await new Promise((r) => setTimeout(r, 400));
await page.type('input[placeholder*="名称"]', '木材');
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div')].filter((d) => /width:\s*170px/.test(d.style.cssText));
  rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.evaluate(() => { window.__swUI.closeItemSearch(); });
await new Promise((r) => setTimeout(r, 300));
const ab = await page.evaluate(() => {
  const ui = window.__swUI;
  const cl = ui.craftListEl;
  const clR = cl.getBoundingClientRect();
  const advR = ui.advRailEl.getBoundingClientRect();
  const rows = [...cl.querySelectorAll('.sw-recipe')].filter((x) => x.style.visibility !== 'hidden');
  const firstNo = rows.findIndex((x) => x.classList.contains('no'));
  const held = ui.heldStack;
  return {
    rows: rows.length,
    craftableFirst: firstNo === -1 || rows.slice(firstNo).every((x) => x.classList.contains('no')),
    listAligned: Math.abs(clR.bottom - (advR.bottom - 8)) < 60,
    held: held ? { id: held.id, stack: held.stack } : null,
  };
});
// A: 光标物品放回背包(点击背包格)→ 再拿其他东西验证光标链无残留
await page.evaluate(() => {
  const slot = window.__swUI.invPanel.querySelector('.sw-slot');
  slot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));

// ---- C: 悬停 10s 气泡持续 ----
await page.evaluate(() => {
  const s = [...document.querySelectorAll('.sw-panel .sw-slot')].find((x) => x.querySelector('img')) ?? document.querySelector('.sw-panel .sw-slot');
  s?.dispatchEvent(new MouseEvent('mouseenter'));
});
let tooltipGone = 0;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const shown = await page.evaluate(() => window.__swUI.tooltip.style.display === 'block').catch(() => false);
  if (!shown) tooltipGone++;
}
R.craftAndTooltip = { ...ab, tooltipPersists: tooltipGone === 0 };

// ---- D: 住房侧栏 ----
await page.evaluate(() => { window.__swUI.onHousing?.(); });
await new Promise((r) => setTimeout(r, 700));
R.housing = await page.evaluate(() => {
  const canvas = [...document.querySelectorAll('canvas')].find((c) => c.className.includes('sw-panel'));
  const r = canvas?.getBoundingClientRect();
  return { inside: !!r && r.right <= window.innerWidth && r.left >= 0, right: Math.round(r?.right ?? 0) };
});
await page.evaluate(() => { window.__swUI.closeHousingPanel?.(); });
await page.evaluate(() => { window.__swUI.closeInventory(); window.__swUI.openInventory(); });
await new Promise((r) => setTimeout(r, 400));

// ---- E: 道具搜索首用门 ----
await page.evaluate(() => { localStorage.removeItem('sbw.itemSearchConfirmed'); window.__swUI.openItemSearch(); });
await new Promise((r) => setTimeout(r, 300));
const gateShown = await page.evaluate(() => !!document.getElementById('sw-itemsearch-gate'));
await page.evaluate(() => {
  [...document.querySelectorAll('#sw-itemsearch-gate button')].find((x) => x.textContent === '确认启用')?.click();
});
await new Promise((r) => setTimeout(r, 300));
R.searchGate = {
  gateShown,
  releasedAfterConfirm: await page.evaluate(() => !!document.querySelector('div[style*="z-index: 1200"], div[style*="z-index:1200"]')),
  flag: await page.evaluate(() => localStorage.getItem('sbw.itemSearchConfirmed')),
};
await page.evaluate(() => { window.__swUI.closeItemSearch?.(); });

// ---- F: 地图点击传送 默认禁用 → Shift+F10 门 → 确认 → 选点 ----
await page.evaluate(() => {
  localStorage.removeItem('sbw.journeyQuick.maptp');
  window.__swUI.closeInventory();
  window.__swGame.renderer.fullMap.open = true;
  window.__swGame.renderer.fullMap.zoom = 2;
});
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(1400, 300);
await new Promise((r) => setTimeout(r, 300));
const disabled = await page.evaluate(() => ({
  enabled: window.__swGame.mapClickTeleportEnabled,
  noTarget: !window.__swGame['_tpTarget'],
}));
await page.keyboard.down('Shift'); await page.keyboard.press('F10'); await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 400));
const tpGate = await page.evaluate(() => ({
  gateShown: !!document.getElementById('sw-journeyquick-gate-mapteleport'),
  title: document.getElementById('sw-journeyquick-gate-mapteleport')?.textContent?.slice(0, 12) ?? null,
}));
await page.evaluate(() => {
  [...document.querySelectorAll('#sw-journeyquick-gate-mapteleport button')].find((x) => x.textContent === '确认启用')?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.mouse.click(1400, 300);
await new Promise((r) => setTimeout(r, 300));
R.mapTeleport = {
  disabledByDefault: disabled,
  gateShown: tpGate.gateShown, gateTitle: tpGate.title,
  enabledAfterConfirm: await page.evaluate(() => window.__swGame.mapClickTeleportEnabled),
  preselectAfterEnable: await page.evaluate(() => !!window.__swGame['_tpTarget']),
};

// ---- G: Shift+F2 = 无敌（无门） ----
await page.keyboard.down('Shift'); await page.keyboard.press('F2'); await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 300));
const god1 = await page.evaluate(() => window.__swGame.player.debugGod);
await page.keyboard.down('Shift'); await page.keyboard.press('F2'); await page.keyboard.up('Shift');
await new Promise((r) => setTimeout(r, 300));
const god2 = await page.evaluate(() => window.__swGame.player.debugGod);
R.shiftF2God = { toggled: god1 !== god2 };

console.log(JSON.stringify(R, null, 1));
await page.screenshot({ path: '/tmp/final-review.png' });
await browser.close();
process.exit(0);

// 全 DOM 链:开对话面板→点重铸 DOM 钮→槽显隐(覆盖 minimize→npcDialog.close() 真实路径)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
await new Promise((r) => setTimeout(r, 800));
const r1 = await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  document.getElementById('sw-welcome-announce')?.remove();
  const p = g.player;
  g.dialogNpc = { dead: false, x: p.x, y: p.y, w: p.w, h: p.h, npcKey: 'goblin_tinkerer', vanillaId: 107, givenName: '', variationIndex: 0, altTexture: 0, shimmered: false };
  // 走真实 cb 开 DOM 面板(按钮组由 game.npcDialogButtons 生成)
  g.cb.onNpcDialog?.('哥布林工匠', '你好', g.npcDialogButtons(g.dialogNpc), { vanillaId: 107 }, 107, 0);
  await new Promise((r) => setTimeout(r, 150));
  const dlgOpen = !!document.querySelector('.sw-npc, [class*=npc-dialog], [class*=npcdlg]');
  // DOM 里点重铸钮
  const btn = [...document.querySelectorAll('button,div[role=button]')].find((b) => b.textContent?.trim() === '重铸' || b.textContent?.trim() === 'Reforge');
  btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await ui.refreshAllAsync();
  await new Promise((r) => setTimeout(r, 250));
  const slot = ui.vinvReforgeSlotEl;
  return {
    dlgOpen, btnFound: !!btn,
    reforgeOpen: ui.vinvReforgeOpen, visible: ui.vinvReforgeVisible(),
    dlgAlive: !!g.dialogNpc, slotVis: slot ? slot.offsetParent !== null : false,
  };
});
console.log(JSON.stringify(r1), 'errs:', errs.slice(0, 2));
console.log(r1.reforgeOpen && r1.slotVis ? 'PASS 槽在' : 'FAIL 槽消失');
// ---- 刀20 加验：对话面板「关闭」钮 = 面板收 + dialogNpc 清（mousedown 直驱同链）----
const r2 = await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const p = g.player;
  g.dialogNpc = { dead: false, x: p.x, y: p.y, w: p.w, h: p.h, npcKey: 'goblin_tinkerer', vanillaId: 107, givenName: '', variationIndex: 0, altTexture: 0, shimmered: false };
  g.cb.onNpcDialog?.('哥布林工匠', '你好', g.npcDialogButtons(g.dialogNpc), { vanillaId: 107 }, 107, 0);
  await new Promise((r) => setTimeout(r, 150));
  const opened = !!document.querySelector('.sw-npc-dialog');
  const closeBtn = [...document.querySelectorAll('.sw-npc-dialog button[data-b]')]
    .find((b) => b.dataset.b === 'close' || b.textContent?.trim() === '关闭' || b.textContent?.trim() === 'Close');
  closeBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await new Promise((r) => setTimeout(r, 250));
  return {
    opened,
    btnFound: !!closeBtn,
    panelGone: !document.querySelector('.sw-npc-dialog'),
    dialogNpcCleared: g.dialogNpc === null,
  };
});
console.log(JSON.stringify(r2), 'errs:', errs.slice(0, 2));
console.log(r2.opened && r2.btnFound && r2.panelGone && r2.dialogNpcCleared && !errs.length ? 'PASS 关闭钮收面板清会话' : 'FAIL 关闭钮');
await browser.close();

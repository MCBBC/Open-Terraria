// 真实链路:开对话→点重铸钮→槽显隐(刀19 会话保持全链)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', (e.stack || e.message).slice(0, 160)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
await new Promise((r) => setTimeout(r, 800));
const r1 = await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  document.getElementById('sw-welcome-announce')?.remove();
  // 伪造会话 NPC(玩家自身区域)——等价真实"右键哥布林开对话"
  const p = g.player;
  g.dialogNpc = { dead: false, x: p.x, y: p.y, w: p.w, h: p.h, npcKey: 'goblin_tinkerer', vanillaId: 107 };
  ui.openNpcDialogPanel?.();
  // 真实入口:npcDialogButton('reforge')(minimize→onReforgeOpen→showReforge)
  g.npcDialogButton('reforge');
  await ui.refreshAllAsync();
  await new Promise((r) => setTimeout(r, 250));
  const slot = ui.vinvReforgeSlotEl;
  return {
    reforgeOpen: ui.vinvReforgeOpen,
    visible: ui.vinvReforgeVisible(),
    dlgAlive: !!g.dialogNpc,
    slotVis: slot ? slot.offsetParent !== null : false,
    slotRect: slot ? slot.getBoundingClientRect().toJSON() : null,
  };
});
console.log('真实链路:', JSON.stringify(r1));
console.log(r1.reforgeOpen && r1.slotVis && r1.slotRect && r1.slotRect.width > 0 ? 'PASS 槽在' : 'FAIL 槽消失');
await browser.close();

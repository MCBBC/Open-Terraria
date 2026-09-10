// SW-FX15 探针:表情轮盘开合/选中演出 + 旅程浏览器检索/复制点击臂(DOM 端到端)。
// 跑法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_sw-fx15-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const out = { emote: {}, browser: {} };
try {
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 180 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swUI)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!inGame) throw new Error('game boot timeout');

  // ---------- 表情轮盘 ----------
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 700));
  const emoteBtnInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.style.backgroundImage || '').includes('UI_Emotes.png'));
    return b ? { found: true, pos: { x: b.style.left, y: b.style.top }, title: b.title } : { found: false };
  });
  out.emote.button = emoteBtnInfo;
  // 点开轮盘
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.style.backgroundImage || '').includes('UI_Emotes.png'));
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 500));
  out.emote.wheelOpened = await page.evaluate(() => !!document.querySelector('.sw-emote-menu'));
  out.emote.groups = await page.evaluate(() => document.querySelectorAll('.sw-emote-group').length);
  out.emote.buttons = await page.evaluate(() => document.querySelectorAll('.sw-emote-btn').length);
  out.emote.pausedWhileOpen = await page.evaluate(() => window.__swGame.paused);
  out.emote.firstTooltip = await page.evaluate(() => document.querySelector('.sw-emote-btn')?.title ?? null);
  // Esc 关闭(关合面)
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));
  out.emote.escCloses = await page.evaluate(() => !document.querySelector('.sw-emote-menu'));
  out.emote.pausedRestored = await page.evaluate(() => !window.__swGame.paused);
  // 选中演出:再开 → 点第一个表情 → 气泡 + 轮盘收 + 背包收
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.style.backgroundImage || '').includes('UI_Emotes.png'));
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));
  out.emote.invOpenBeforePick = await page.evaluate(() => !!window.__swUI.inventoryOpen);
  // EmoteButton 用 click（vanilla LeftClick :91-96）——mousedown 不触发
  await page.evaluate(() => document.querySelector('.sw-emote-btn').click());
  await new Promise((r) => setTimeout(r, 400));
  out.emote.bubbleSpawned = await page.evaluate(() => window.__swEmotes.count() >= 1);
  out.emote.bubbleLife = await page.evaluate(() => window.__swEmotes.snapshot()[0]?.lifeTime ?? null);
  out.emote.wheelClosedAfterPick = await page.evaluate(() => !document.querySelector('.sw-emote-menu'));
  out.emote.invClosedAfterPick = await page.evaluate(() => !window.__swUI.inventoryOpen);

  // ---------- 旅程物品浏览器 ----------
  await page.evaluate(() => { window.__swGame.world.difficulty = 3; });   // isJourney getter
  await page.evaluate(async () => {
    const m = await import('/src/ui/JourneyPowersUI.ts?t=' + Date.now());
    m.openJourneyPowersPanel(window.__swGame);
  });
  await new Promise((r) => setTimeout(r, 500));
  out.browser.panelOpened = await page.evaluate(() => !!document.querySelector('.sw-jp-panel'));
  // 切到「复制」页
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.sw-jp-strip button')].find((x) => x.textContent.includes('复制'));
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 600));
  out.browser.searchBox = await page.evaluate(() => !!document.querySelector('.sw-jp-search input'));
  // 检索「火把」
  await page.evaluate(() => {
    const inp = document.querySelector('.sw-jp-search input');
    inp.value = '火把';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 900));
  out.browser.torchCells = await page.evaluate(() => document.querySelectorAll('.sw-jp-cell').length);
  out.browser.countLine = await page.evaluate(() => document.querySelector('.sw-jp-note')?.textContent ?? null);
  // 复制臂:普点(光标空)→ 整组上光标;再点(光标占用)→ 无操作
  out.browser.cursorGrab = await page.evaluate(() => {
    const ui = window.__swUI;
    const before = ui.heldStack ? { ...ui.heldStack } : null;
    document.querySelector('.sw-jp-cell').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const after = ui.heldStack ? { id: ui.heldStack.id, stack: ui.heldStack.stack } : null;
    const vid2 = (() => { document.querySelector('.sw-jp-cell').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return null; })();
    const after2 = ui.heldStack ? { id: ui.heldStack.id, stack: ui.heldStack.stack } : null;
    void vid2;
    return { before, after, noMergeOnOccupied: JSON.stringify(after) === JSON.stringify(after2) };
  });
  // Shift 点 → 入包
  const invCountBefore = await page.evaluate(() => window.__swGame.player.inv.slots.filter(Boolean).length);
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.sw-jp-cell')];
    cells[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  const invCountAfter = await page.evaluate(() => window.__swGame.player.inv.slots.filter(Boolean).length);
  out.browser.shiftPutsInInventory = invCountAfter > invCountBefore;
  out.browser.invDelta = invCountAfter - invCountBefore;
  // 收尾
  await page.evaluate(() => document.querySelector('.sw-jp-panel button')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
} catch (e) {
  out.error = String(e && e.message || e);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();

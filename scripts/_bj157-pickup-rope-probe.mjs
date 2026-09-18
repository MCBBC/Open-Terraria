// ★SW-BJ157 探针：①右键取件臂实机面（真鼠标 hover+右键按住→取 1→stackSplit 连取）
// ②绳放置面（tryPlace 一次=恰 1 格+耗 1 件+useTime 8;冷却窗内二连拍不加格）。
// 运行：SW_ORIGIN=http://localhost:5235 node tools/run-diag.mjs scripts/_bj157-pickup-rope-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let hotbar = false;
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  hotbar = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (hotbar) break;
}
await new Promise((r) => setTimeout(r, 1500));
if (!hotbar) { console.log(JSON.stringify({ fail: 'hotbar 未出现' })); await browser.close(); process.exit(1); }

// ---- 准备：dev 模式 + 57 叠木材入 10 号包格 ----
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  g.setupDevMode();
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const inv = g.player.inv;
  inv.slots[10] = { id: ITEM_BY_KEY['vi_9_Wood'], stack: 57 };
  return { ok: true, stack: inv.slots[10].stack };
});

// ---- ① 真鼠标悬停+右键单击=取 1 ----
await page.evaluate(() => {
  document.querySelector('#sw-welcome-announce')?.remove();   // 欢迎公告遮罩(z=60 全页拦截)摘除
  window.__swUI.openInventory(true);   // Inventory 缺省键=Escape（Keybinds :74）,直调开包链
});
await new Promise((r) => setTimeout(r, 600));
const el = await page.$('.sw-slot[data-where="inv"][data-idx="10"]');
const dbg = await page.evaluate(() => {
  const el2 = document.querySelector('.sw-slot[data-where="inv"][data-idx="10"]');
  const ui = window.__swUI;
  return { found: !!el2, panel: ui?.invPanel?.style?.display ?? 'null-ui',
    vis: el2 ? getComputedStyle(el2).display : 'no-el', n: document.querySelectorAll('.sw-slot[data-where="inv"]').length };
});
if (!el) { console.log(JSON.stringify({ fail: '槽 10 DOM 缺失', prep, dbg })); await browser.close(); process.exit(1); }
const bb = await el.boundingBox();
if (!bb) { console.log(JSON.stringify({ fail: '槽 10 无布局', dbg })); await browser.close(); process.exit(1); }
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await new Promise((r) => setTimeout(r, 120));
const hitDbg = await page.evaluate(() => {
  const el2 = document.querySelector('.sw-slot[data-where="inv"][data-idx="10"]');
  const r = el2.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  let anc = [];
  for (let n = top, i = 0; n && i < 6; n = n.parentElement, i++) {
    anc.push(`${n.tagName}.${String(n.className).slice(0, 30)}#${n.id || n.dataset?.idx || ''}:${n.dataset?.where ?? ''} z=${getComputedStyle(n).zIndex} pe=${getComputedStyle(n).pointerEvents}`);
  }
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    topEl: top ? `${top.tagName}.${top.className}`.slice(0, 80) : 'none',
    contains: el2.contains(top), anc, hover: el2.matches(':hover') };
});
await page.mouse.down({ button: 'right' });
await new Promise((r) => setTimeout(r, 120));
const take1 = await page.evaluate(() => {
  const ui = window.__swUI;
  window.__swTakeDbg = window.__swTakeDbg ?? null;
  const inv = window.__swGame.player.inv;
  return { held: ui.heldStack ? { stack: ui.heldStack.stack, id: ui.heldStack.id } : null,
    slot: inv.slots[10].stack, split: ui.stackSplit, rcHold: !!ui.rcHold };
});
// ---- ① b 按住不放=stackSplit 连取（真 ticks 驱动）----
await new Promise((r) => setTimeout(r, 1400));
const hold = await page.evaluate(() => {
  const ui = window.__swUI;
  const inv = window.__swGame.player.inv;
  return { heldStack: ui.heldStack?.stack ?? 0, slot: inv.slots[10]?.stack ?? null,
    superFast: ui.superFastStack, btnRight: ui.uiBtnRight };
});
await page.mouse.up({ button: 'right' });
await new Promise((r) => setTimeout(r, 120));
const released = await page.evaluate(() => {
  const ui = window.__swUI;
  return { btnRight: ui.uiBtnRight, split: ui.stackSplit, rcHold: !!ui.rcHold };
});

// ---- ② 绳放置面 ----
const rope = await page.evaluate(async () => {
  const g = window.__swGame;
  window.__swUI.heldStack = null;   // 清光标持木（removeHeld 走 cursorMirror 先扣）
  window.__swUI.heldFrom = null;
  g.player.inv.cursorMirror = null;
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
  const ropeIid = ITEM_BY_KEY['vi_965_rope'];
  const ropeDef = ITEM_DEFS[ropeIid];
  const ropeTile = TILE_INTERNAL_BY_SHEET.get(213);
  const st = g.world.store;
  const p = g.player;
  const ptx = Math.floor(p.x / 16), pty = Math.floor(p.y / 16);
  const tx = ptx + 2, ty = pty - 2;
  // 清作业窗（±2 列,ty-16..ty 行;地板 ty+1 双行实心）
  for (let x = tx - 3; x <= tx + 3; x++) {
    for (let y = ty - 16; y <= ty; y++) st.setTileSilent(x, y, 0);
    st.setTileSilent(x, ty + 2, 1);
    st.setTileSilent(x, ty + 1, 1);   // 石地板（tile sheet 1 → 内部 id）
  }
  const countRope = () => {
    let n = 0;
    for (let x = tx - 3; x <= tx + 3; x++) {
      for (let y = ty - 16; y <= ty + 2; y++) {
        if (st.hasTile(x, y) && st.type[st.idx(x, y)] === ropeTile) n++;
      }
    }
    return n;
  };
  const inv = g.player.inv;
  inv.slots[0] = { id: ropeIid, stack: 99 };
  inv.selected = 0;
  const stackBefore = inv.slots[0].stack;
  g.player.useTime = 0;
  g.tryPlace(tx, ty, ropeDef);                       // 一次放置
  const after1 = { tiles: countRope(), useTime: g.player.useTime, stack: inv.slots[0].stack };
  g.tryPlace(tx, ty, ropeDef);                       // 冷却窗内二连拍（同格已被占,亦被冷却门拦）
  const after2 = { tiles: countRope(), stack: inv.slots[0].stack };
  return { stackBefore, after1, after2, tx, ty };
});

await browser.close();
const verdict = {
  prep, hitDbg, take1, hold, released, rope,
  pass: take1.held?.stack === 1 && take1.slot === 56
    && hold.heldStack > 1 && hold.slot < 56 && hold.heldStack === 1 + (56 - hold.slot)   // 守恒:取1后基线56
    && released.btnRight === false && released.split === 0
    && rope.after1.tiles === 1 && rope.after1.useTime === 8 && rope.after1.stack === rope.stackBefore - 1
    && rope.after2.tiles === 1 && rope.after2.stack === rope.stackBefore - 1,
  errs,
};
console.log(JSON.stringify(verdict, null, 1));

// 用户实报复现探针:vanilla 布局开包态光标持物(取自背包 10-49 格)点世界不能放置。
// 运行:SW_ORIGIN=http://localhost:5226 node tools/run-diag.mjs --timeout=300000 scripts/_cursor-place-vinv.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await sleep(1000);

// ---- 公共:站位(开阔平地)+目标点扫描(右半屏,避开 vinv 面板面) ----
async function stage() {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    document.getElementById('sw-welcome-announce')?.remove();
    // 找开阔平地:3×3 空气 + 其下一行实心
    let spot = null;
    outer:
    for (let x = 200; x < 500; x++) for (let y = 150; y < 400; y++) {
      let air = true;
      for (let dy = -1; dy <= 1 && air; dy++) for (let dx = -1; dx <= 1; dx++) if (st.isActive(x + dx, y + dy)) { air = false; break; }
      if (!air) continue;
      let floor = true;
      for (let dx = -1; dx <= 1; dx++) if (!st.isSolid(x + dx, y + 2)) { floor = false; break; }
      if (floor) { spot = [x, y]; break outer; }
    }
    if (!spot) return { fail: 'no flat spot' };
    const [px, py] = spot;
    g.player.x = px * 16; g.player.y = (py + 2) * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
    // 站稳+相机收敛
    await new Promise((r) => setTimeout(r, 900));
    // 扫描右半屏目标点:世界格为空气、四邻有活块(可贴放)、射程内
    const [pcx, pcy] = [g.player.cx, g.player.cy];
    const cands = [];
    for (let sy = 200; sy <= 900; sy += 25) for (let sx = 700; sx <= 1500; sx += 25) cands.push([sx, sy]);
    let target = null;
    for (const [sx, sy] of cands) {
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
      if (!st.inBounds(tx, ty) || st.isActive(tx, ty)) continue;
      let nb = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (st.isActive(tx + dx, ty + dy)) { nb = true; break; }
      if (!nb) continue;
      const d = Math.hypot(tx * 16 + 8 - pcx, ty * 16 + 8 - pcy);
      if (d > 5 * 16) continue;
      target = { sx, sy, tx, ty, dist: d };
      break;
    }
    if (!target) return { fail: 'no target screen point' };
    return { spot: [px, py], target };
  });
}

// ---- 公共:点位诊断(按住中采样) ----
const diagAt = (pt) => page.evaluate((pt) => {
  const g = window.__swGame;
  const inp = g.input;
  const el = document.elementFromPoint(pt.sx, pt.sy);
  const [wx, wy] = g.camera.screenToWorld(pt.sx, pt.sy);
  const inv = g.player.inv;
  const chain = [];
  let e = el;
  while (e && chain.length < 5) { chain.push(e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').join('.') : '')); e = e.parentElement; }
  return {
    elChain: chain,
    inpOverDomUi: g.inpOverDomUi ? (() => { try { return g.inpOverDomUi(); } catch (err) { return 'throw:' + err.message; } })() : 'n/a',
    mouseDown: inp.mouseDown, mouseHeld: inp.mouseHeld, uiBlocking: inp.uiBlocking,
    blockMouse: inp.blockMouse, mouseX: inp.mouseX, mouseY: inp.mouseY,
    canvasRectLeft: inp.canvasRectLeft, canvasRectTop: inp.canvasRectTop,
    worldXY: [wx, wy], tileUnder: g.camera.tileUnder(pt.sx, pt.sy),
    heldStack: window.__swUI.heldStack ? { id: window.__swUI.heldStack.id, stack: window.__swUI.heldStack.stack } : null,
    cursorMirror: inv.cursorMirror ? { id: inv.cursorMirror.id, stack: inv.cursorMirror.stack } : null,
    heldItemId: inv.heldItem()?.id ?? null, selected: inv.selected,
    inventoryOpen: window.__swUI.inventoryOpen,
    useTime: g.player.useTime, swing: !!g.swing, dead: g.player.dead,
    fullMapOpen: g.renderer.fullMap.open, timeUiHover: g.renderer.timeUiHover,
    smartWanted: g.smartCursor?.wanted ?? null, smartShowing: g.smartCursor?.showing ?? null,
    smartXY: g.smartCursor ? [g.smartCursor.x, g.smartCursor.y] : null,
    lockedContinuity: g.smartCursor?.lockedContinuity != null,
  };
}, pt);

const run = [];
{
  const s0 = await stage();
  if (s0.fail) { console.log('STAGE-FAIL', JSON.stringify(s0)); process.exit(1); }
  const woodKey = await page.evaluate(async () => {
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    return VANILLA_ITEM_KEY_BY_ID[9];   // Wood
  });

  // ============ Phase A:槽 10 取物(用户实报路径) ============
  const woodId = await page.evaluate(async (k) => {
    const { ITEM_BY_KEY } = await import('/src/data/items.ts');
    return ITEM_BY_KEY[k];
  }, woodKey);
  await page.evaluate((woodId) => {
    const g = window.__swGame;
    const inv = g.player.inv;
    inv.slots[10] = { id: woodId, stack: 99, favorited: false, prefix: 0 };
    inv.selected = 0;
    inv.slots[0] = null;
    window.__swUI.openInventory(true);
    return window.__swUI.refreshAllAsync ? window.__swUI.refreshAllAsync() : window.__swUI.refreshAll();
  }, woodId);
  await sleep(300);

  // 点槽 10 拾取(真实鼠标事件)
  const slot10 = await page.evaluate(() => {
    const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(slot10.x, slot10.y);
  await sleep(400);
  const afterPick = await page.evaluate(() => {
    const g = window.__swGame;
    return {
      heldStack: window.__swUI.heldStack ? window.__swUI.heldStack.stack : null,
      cursorMirror: g.player.inv.cursorMirror ? g.player.inv.cursorMirror.stack : null,
      slot10: g.player.inv.slots[10],
    };
  });

  // 按住世界点
  const t = s0.target;
  await page.mouse.move(t.sx, t.sy);
  await sleep(120);
  await page.mouse.down();
  await sleep(350);
  const midDiag = await diagAt(t);
  const tileMid = await page.evaluate((txty) => window.__swGame.world.store.isActive(txty[0], txty[1]), [t.tx, t.ty]);
  const stackMid = await page.evaluate(() => window.__swGame.player.inv.cursorMirror?.stack ?? window.__swUI.heldStack?.stack ?? null);
  await page.mouse.up();
  await sleep(200);
  const tileAfter = await page.evaluate((txty) => window.__swGame.world.store.isActive(txty[0], txty[1]), [t.tx, t.ty]);
  run.push({ phase: 'A slot10-cursor', afterPick, target: t, midDiag, tileMid, tileAfter, stackMid });

  // ============ Phase B:热键栏路径(关包选中槽 0) ============
  await page.evaluate((woodId) => {
    const g = window.__swGame;
    const inv = g.player.inv;
    inv.cursorMirror = null;
    window.__swUI.heldStack = null;
    inv.slots[0] = { id: woodId, stack: 99, favorited: false, prefix: 0 };
    inv.selected = 0;
    window.__swUI.closeInventory();
    window.__swUI.refreshAll();
  }, woodId);
  await sleep(300);
  await page.mouse.move(t.sx, t.sy);
  await sleep(120);
  await page.mouse.down();
  await sleep(350);
  const tileMidB = await page.evaluate((txty) => window.__swGame.world.store.isActive(txty[0], txty[1]), [t.tx, t.ty]);
  await page.mouse.up();
  await sleep(200);
  run.push({ phase: 'B hotbar-selected', tileMid: tileMidB, tileAfter: tileMidB });

  // ============ Phase C:开包态从热键栏行(vinv 槽 0)取物点世界 ============
  await page.evaluate((woodId) => {
    const g = window.__swGame;
    const inv = g.player.inv;
    inv.slots[0] = { id: woodId, stack: 99, favorited: false, prefix: 0 };
    inv.slots[10] = null;
    inv.selected = 0;
    window.__swUI.openInventory(true);
    window.__swUI.refreshAll();
  }, woodId);
  await sleep(300);
  const slot0 = await page.evaluate(() => {
    const el = document.querySelector('.sw-vinv .sw-slot[data-idx="0"][data-where="inv"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(slot0.x, slot0.y);
  await sleep(400);
  const afterPickC = await page.evaluate(() => ({
    heldStack: window.__swUI.heldStack ? window.__swUI.heldStack.stack : null,
    cursorMirror: window.__swGame.player.inv.cursorMirror ? window.__swGame.player.inv.cursorMirror.stack : null,
  }));
  // 换一个目标点(上一格可能已被 Phase B 放掉;先清 B 放置再扫)
  await page.evaluate((p) => { const st = window.__swGame.world.store; if (st.isActive(p[0], p[1])) st.setTile(p[0], p[1], 0, 0, 0); }, [t.tx, t.ty]);
  const t2 = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const [pcx, pcy] = [g.player.cx, g.player.cy];
    for (let sy = 200; sy <= 900; sy += 25) for (let sx = 700; sx <= 1500; sx += 25) {
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
      if (!st.inBounds(tx, ty) || st.isActive(tx, ty)) continue;
      let nb = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (st.isActive(tx + dx, ty + dy)) { nb = true; break; }
      if (!nb) continue;
      if (Math.hypot(tx * 16 + 8 - pcx, ty * 16 + 8 - pcy) > 5 * 16) continue;
      return { sx, sy, tx, ty };
    }
    return null;
  });
  await page.mouse.move(t2.sx, t2.sy);
  await sleep(120);
  await page.mouse.down();
  await sleep(350);
  const midDiagC = await diagAt(t2);
  const tileMidC = await page.evaluate((txty) => window.__swGame.world.store.isActive(txty[0], txty[1]), [t2.tx, t2.ty]);
  await page.mouse.up();
  await sleep(200);
  run.push({ phase: 'C hotbarrow0-cursor', afterPick: afterPickC, target: t2, midDiag: midDiagC, tileMid: tileMidC, tileAfter: tileMidC });

  // ============ Phase D:智能光标 + 槽 10 取物 ============
  await page.evaluate((woodId) => {
    const g = window.__swGame;
    const inv = g.player.inv;
    inv.cursorMirror = null;
    window.__swUI.heldStack = null;
    inv.slots[10] = { id: woodId, stack: 99, favorited: false, prefix: 0 };
    inv.slots[0] = null;
    inv.selected = 0;
    window.__swUI.refreshAll();
  }, woodId);
  await sleep(200);
  await page.mouse.click(slot10.x, slot10.y);
  await sleep(300);
  await page.evaluate(() => { window.__swGame.smartCursor.wanted = true; });
  await sleep(200);
  await page.evaluate((p) => { const st = window.__swGame.world.store; if (st.isActive(p[0], p[1])) st.setTile(p[0], p[1], 0, 0, 0); }, [t2.tx, t2.ty]);
  const t3 = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const [pcx, pcy] = [g.player.cx, g.player.cy];
    for (let sy = 200; sy <= 900; sy += 25) for (let sx = 700; sx <= 1500; sx += 25) {
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
      if (!st.inBounds(tx, ty) || st.isActive(tx, ty)) continue;
      let nb = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (st.isActive(tx + dx, ty + dy)) { nb = true; break; }
      if (!nb) continue;
      if (Math.hypot(tx * 16 + 8 - pcx, ty * 16 + 8 - pcy) > 5 * 16) continue;
      return { sx, sy, tx, ty };
    }
    return null;
  });
  await page.mouse.move(t3.sx, t3.sy);
  await sleep(120);
  await page.mouse.down();
  await sleep(350);
  const midDiagD = await diagAt(t3);
  const tileMidD = await page.evaluate((txty) => window.__swGame.world.store.isActive(txty[0], txty[1]), [t3.tx, t3.ty]);
  await page.mouse.up();
  await sleep(200);
  await page.evaluate(() => { window.__swGame.smartCursor.wanted = false; });
  run.push({ phase: 'D slot10-cursor-smartcursor', target: t3, midDiag: midDiagD, tileMid: tileMidD, tileAfter: tileMidD });
}

console.log('=== RESULTS ===');
for (const r of run) console.log(JSON.stringify(r));
console.log('pageerrors:', JSON.stringify(errs));
await browser.close();
process.exit(0);

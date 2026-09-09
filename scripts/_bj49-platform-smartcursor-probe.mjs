// SW-BJ49 实机探针：平台放置 × 智能光标状态矩阵（真实 Game/输入管线,非壳注入）。
// 用户实报:"有时开智能光标的时候可以放平台,不开放不了平台?"(间歇/状态依赖)
// 矩阵:
//   A1 关智能+同行相邻格        → 期望放置成功(vanilla 3×3 兜底 Player.cs:41663-41678)
//   A2 关智能+离行 2 格悬空     → 期望失败(vanilla 同判:无 3×3 active/无墙)
//   A3 关智能+对角角接触        → 期望成功(BJ10 3×3 兜底臂)
//   A4 关智能+孤立墙格(仅目标格有墙) → vanilla 通用臂 self-wall(:41631-41634)允许;仓库嫌疑漏 self-wall
//   B1 开智能+悬停行端斜向      → 期望续铺目标重定位放置(Step_Platforms)
//   B2 开智能置锁→关智能→再放  → 期望锁清零+放置成功(BJ29 真机回归面)
//   B3 关智能拖拽中途切智能     → 期望切换瞬间放置不断流
//   C1 开智能+悬停既有平台上按住 → vanilla:step 早退 showing=false+锁在 → TileTargetDesired 拦(vanilla 本相)
// 每次尝试记录:锁态/wanted/showing/tx,ty/各门逐项判定/落格结果。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj49-platform-smartcursor-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

const report = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { TILE_BY_KEY, T } = await import('/src/data/tiles.ts');
  const { TILE } = await import('/src/core/constants.ts');
  const out = { scenarios: [], errors: [] };

  // ---- 场地:天空搭台(保证无墙/无杂格) ----
  const X0 = Math.floor(g.player.x / TILE);            // 玩家所在列
  const F = Math.max(20, (g.world.groundLevel ?? 40) - 60);   // 天空行(地表上 60)
  const R = F - 3;                                      // 平台行(脚线上 3)
  const PLAT = TILE_BY_KEY['platform'];
  const STONE = TILE_BY_KEY['stone'];
  const TORCH = (await import('/src/data/tiles.ts')).T.TORCH;
  const clearRect = (x0, y0, x1, y1) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
      st.flags[i] = 0;   // ★必须清 active 旗,否则幽灵格(hasTile=true,type=0)毒化全矩阵
    }
  };
  const clearTileFull = (x, y) => {
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    st.type[i] = 0; st.flags[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  };
  const region = { x0: X0 - 14, x1: X0 + 20, y0: R - 8, y1: F + 4 };
  clearRect(region.x0, region.y0, region.x1, region.y1);
  for (let x = region.x0 + 2; x <= region.x1 - 2; x++) st.setTile(x, F, STONE, 0, 0);   // 地板
  // 平台锚行 5 格:X0-2..X0+2(玩家居中)
  for (let x = X0 - 2; x <= X0 + 2; x++) st.setTile(x, R, PLAT, 0, 0);
  // 玩家放地板中央
  g.player.x = X0 * TILE; g.player.y = F * TILE - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);   // 相机跟随+落稳
  const px = X0, py = F;

  // 手持:仅木平台(vid 94)
  const PLAT_SLOT = ITEM_DEFS.findIndex((d) => (d.vid ?? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1)) === 94);
  if (PLAT_SLOT < 0) { out.errors.push('木平台 vid94 无 def'); return out; }
  out.itemTile = { key: ITEM_DEFS[PLAT_SLOT].tile, id: TILE_BY_KEY[ITEM_DEFS[PLAT_SLOT].tile ?? ''], platKey: 'platform', platId: TILE_BY_KEY['platform'] };
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: PLAT_SLOT, stack: 999, favorited: false };
  g.player.inv.selected = 0;
  g.cb.onInventoryChanged?.();

  const snap = () => ({
    wanted: g.smartCursor.wanted, showing: g.smartCursor.showing,
    lock: g.smartCursor.lockedContinuity ? [g.smartCursor.lockedContinuity.x, g.smartCursor.lockedContinuity.y] : null,
    dir: g.smartCursor.lockedDirection ? [g.smartCursor.lockedDirection.x, g.smartCursor.lockedDirection.y] : null,
  });
  const setMouseAtTile = (tx, ty) => {
    const [sx, sy] = g.camera.worldToScreen(tx * TILE + 8, ty * TILE + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    const [ux, uy] = g.camera.tileUnder(sx, sy);
    return [ux, uy];
  };
  const platAt = (x, y) => st.inBounds(x, y) && st.hasTile(x, y) && st.type[st.idx(x, y)] === PLAT;
  const y0check = (stx, x, y, row) => y === row && x >= X0 - 2 && x <= (X0 + 2);
  const gateProbe = (tx, ty) => {
    const def = ITEM_DEFS[g.player.inv.slots[0].id];
    const sc = g.smartCursor;
    const sheet = TILE_BY_KEY['platform'];
    let sup = false;
    try { sup = g.hasSupport(tx, ty, 1, 1, false, false, sheet); } catch (e) { sup = 'ERR:' + e.message; }
    let inRange = false;
    try { inRange = g.inTileRange(tx, ty, g.blockRange()); } catch (e) { inRange = 'ERR:' + e.message; }
    const desired = !sc.lockedContinuity || !!(sc.showing && sc.x === tx && sc.y === ty);
    return { hasSupport: sup, inTileRange: inRange, tileTargetDesired: desired,
      occupied: st.inBounds(tx, ty) ? st.hasTile(tx, ty) : 'oob',
      useTime: g.player.useTime, blockMouse: g.input.blockMouse, uiBlocking: g.input.uiBlocking,
      domUi: (() => { try { return g.inpOverDomUi(); } catch { return '?'; } })() };
  };

  /** click 流程:可选先切智能(toggleKey 帧数) → 按住 hold 帧 → 逐帧记录 → 松开 */
  const attempt = async (name, tx, ty, opts = {}) => {
    const rec = { name, target: [tx, ty], frames: [], placed: false, placedAt: [] };
    // 清场:区域外平台全拆(只留锚行),恢复目标格空(★全旗清零)
    for (let x = region.x0; x <= region.x1; x++) for (let y = region.y0; y <= region.y1; y++) {
      if (st.hasTile(x, y) && st.type[st.idx(x, y)] === PLAT && y === R && x >= X0 - 2 && x <= X0 + 2) continue;
      if (st.hasTile(x, y) && st.type[st.idx(x, y)] === PLAT) clearTileFull(x, y);
    }
    if (opts.wallOnly !== undefined) {   // A4:孤立墙
      clearRect(region.x0, region.y0, region.x1, region.y1 - 1);
      for (let x = region.x0 + 2; x <= region.x1 - 2; x++) st.setTile(x, F, STONE, 0, 0);
      for (let x = X0 - 2; x <= X0 + 2; x++) st.setTile(x, R, PLAT, 0, 0);
      st.flags[st.idx(tx, ty)] = 0; st.type[st.idx(tx, ty)] = 0;
      st.wall[st.idx(tx, ty)] = opts.wallOnly;
    } else {
      clearRect(region.x0, region.y0, region.x1, region.y1);
      for (let x = region.x0 + 2; x <= region.x1 - 2; x++) st.setTile(x, F, STONE, 0, 0);
      // 锚行可选截短( opts.rowEnd )与火把隔断( opts.torchAt )
      const rowEnd = opts.rowEnd ?? (X0 + 2);
      for (let x = X0 - 2; x <= rowEnd; x++) st.setTile(x, R, PLAT, 0, 0);
      if (opts.torchAt) st.setTile(opts.torchAt[0], opts.torchAt[1], TORCH, 0, 0);
    }
    if (opts.minecart) g.minecart = { dead: false, mounted: true };
    // 目标格 ghost 自检(置墙案除外)
    if (opts.wallOnly === undefined && st.hasTile(tx, ty) && !((y0check(st,tx,ty,R)))) out.errors.push(`${name}: 目标格 hasTile=true pre-attempt type=${st.type[st.idx(tx,ty)]}`);
    g.player.useTime = 0;
    g.input.mouseDown = false; g.input.mouseHeld = false;
    // 智能光标态归零(每案冷启动:先关——松键帧 controlUseItem=false ⇒ 连通锁清,再按需开)
    if (g.smartCursor.wanted) {
      g.input.keys.add('ControlLeft'); g.fixedUpdate(1 / 60); g.input.keys.delete('ControlLeft'); g.fixedUpdate(1 / 60);
    }
    if (opts.smartOn && !g.smartCursor.wanted) {
      g.input.keys.add('ControlLeft'); g.fixedUpdate(1 / 60); g.input.keys.delete('ControlLeft'); g.fixedUpdate(1 / 60);
    }
    rec.smartAfterToggle = snap();
    const [ux, uy] = setMouseAtTile(tx, ty);
    rec.tileUnder = [ux, uy];
    if (ux !== tx || uy !== ty) out.errors.push(`${name}: tileUnder (${ux},${uy})≠目标 (${tx},${ty})`);
    // 按住
    g.input.mouseDown = true; g.input.mouseHeld = true;
    const hold = opts.hold ?? 6;
    for (let f = 0; f < hold; f++) {
      if (opts.midToggleSmartOnAt === f) { g.input.keys.add('ControlLeft'); g.fixedUpdate(1 / 60); g.input.keys.delete('ControlLeft'); }
      else if (opts.midToggleSmartOffAt === f) { g.input.keys.add('ControlLeft'); g.fixedUpdate(1 / 60); g.input.keys.delete('ControlLeft'); }
      else g.fixedUpdate(1 / 60);
      rec.frames.push({ f, ...snap(), tile: platAt(tx, ty) ? [tx, ty] : (opts.trackAll
        ? (() => { const hits = []; for (let x = region.x0; x <= region.x1; x++) if (platAt(x, R) && (x < X0 - 2 || x > X0 + 2)) hits.push([x, R]); return hits; })() : null) });
      if (platAt(tx, ty)) rec.placed = true;
      // 追踪整行新平台
      for (let x = region.x0; x <= region.x1; x++) if (platAt(x, R) && (x < X0 - 2 || x > X0 + 2) && !rec.placedAt.some(([a]) => a === x)) rec.placedAt.push([x, R]);
      if (opts.dragPath && opts.dragPath[f]) { const [nx, ny] = opts.dragPath[f]; setMouseAtTile(nx, ny); }
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    g.minecart = null;
    rec.gateAfter = gateProbe(tx, ty);
    rec.endSnap = snap();
    rec.targetAfter = st.hasTile(tx, ty) ? [st.type[st.idx(tx, ty)], 'plat?', st.type[st.idx(tx, ty)] === PLAT] : null;
    rec.stack = g.player.inv.slots[0].stack;
    out.scenarios.push(rec);
    return rec;
  };

  const T1 = R;                       // 平台行
  // ---- A 组:关智能 ----
  await attempt('A1 关智能+同行相邻格(X0+3)', X0 + 3, T1, { smartOn: false, hold: 8 });
  await attempt('A2 关智能+离行2格悬空(X0+5)', X0 + 5, T1, { smartOn: false, hold: 8 });
  await attempt('A3 关智能+对角角接触(X0+3,R-1)', X0 + 3, T1 - 1, { smartOn: false, hold: 8 });
  await attempt('A4 关智能+孤立墙格(X0+5)仅目标格有墙', X0 + 5, T1, { smartOn: false, hold: 8, wallOnly: 1 });
  // ---- B 组:开智能 ----
  await attempt('B1 开智能+行端斜向悬停(X0+4,R-1)', X0 + 4, T1 - 1, { smartOn: true, hold: 8, trackAll: true });
  await attempt('B2 置锁→关智能→相邻格再放', X0 + 4, T1 - 1, { smartOn: true, hold: 3, midToggleSmartOffAt: 1 });
  await attempt('B2b 关智能后相邻格点击', X0 + 3, T1, { smartOn: false, hold: 8 });
  await attempt('B3 关智能拖拽中途切智能', X0 + 3, T1, { smartOn: false, hold: 12, midToggleSmartOnAt: 2,
    dragPath: { 5: [X0 + 4, T1], 8: [X0 + 5, T1] }, trackAll: true });
  await attempt('C1 开智能+悬停既有平台上按住', X0, T1, { smartOn: true, hold: 6 });
  // ---- D1 复核:火把隔断行,智能开+水平悬停隔断格外一格 → 越隔断续铺（收编臂 :1347-1350） ----
  await attempt('D1 火把隔断行+智能开水平悬停', X0 + 3, T1, { smartOn: true, hold: 10, rowEnd: X0, torchAt: [X0 + 1, T1], trackAll: true });
  // ---- D3 复核:矿车帧,智能开+持平台+按住 → lookup 全管线应运行并放置 ----
  await attempt('D3 矿车帧+智能开+按住', X0 + 3, T1, { smartOn: true, hold: 10, rowEnd: X0, minecart: true, trackAll: true });
  out.fixture = { X0, F, R, playerTile: [px, py] };
  return out;
});

console.log('=== SW-BJ49 状态矩阵 ===');
console.log(JSON.stringify(report, null, 1));
if (errors.length) console.log('PAGE ERRORS:', errors);
await browser.close();

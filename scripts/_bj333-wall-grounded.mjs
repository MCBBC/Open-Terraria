// BJ333 接地扫荡（终审）：玩家每格真实站在地板上（无坠落伪影），A/B 补丁能否清到 0
// + 清后渲染双拍（数据清零后画布是否有残影）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const cx = Math.floor(st.w / 2);
  const RX0 = cx - 60, RX1 = cx + 60, RY0 = 20, RY1 = 78;
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
    const i = st.idx(x, y);
    if (st.type[i] !== 0 || st.flags[i] !== 0) st.setTile(x, y, 0);
    if (st.wall[i] !== 0) st.setWall(x, y, 0);
    st.liquid[i] = 0; st.liquidType[i] = 0;
  }
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };
  const B = { x0: cx + 1, y0: 36, x1: cx + 16, y1: 47 };
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) st.setWall(x, y, 204);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  // 接地站位：地板 tile 在 standY+3,玩家脚踩地板顶 p.y=(standY+3)*16-42
  let floorRow = -1;
  const ground = (sx, fy) => {
    if (floorRow >= 0) for (let dx = -3; dx <= 3; dx++) { const i = st.idx(sx + dx, floorRow); if (st.get(sx + dx, floorRow) === 2) st.setTile(sx + dx, floorRow, 0); }
    for (let dx = -3; dx <= 3; dx++) st.setTile(sx + dx, fy, 2);
    floorRow = fy;
  };
  const standYOf = (fy) => fy * 16 - 42 + 0.01;   // 脚底贴地板顶
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py; g.player.vx = 0; g.player.vy = 0; };
  const settle = (px, py, n = 40) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };
  const swingAt = (wx, wy, sx, fy, offX = 8, offY = 8, ticks = 14) => {
    ground(sx, fy);
    settle(sx, standYOf(fy), 30);
    for (let i = 0; i < ticks; i++) {
      pin(sx, standYOf(fy));
      g.fixedUpdate(1 / 60);
      const [sx2, sy2] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
      g.input.mouseX = sx2; g.input.mouseY = sy2;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };

  // 取证:包裹 tryMine 记录接地版实况
  const trace = [];
  const origTryMine = g.tryMine.bind(g);
  g.tryMine = function (tx, ty, power, toolType, speed, useTime, opts) {
    trace.push({ tx, ty, power, liveY: g.player.y, liveRow: +(g.player.y / 16).toFixed(2), inRange: g.inTileRange(tx, ty), throttled: g.tickCount - g.lastMineHitTick < g.lastMineItemTime });
    return origTryMine(tx, ty, power, toolType, speed, useTime, opts);
  };

  const patchCells = (p) => { const arr = []; for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) arr.push([x, y]); return arr; };
  const countWalls = (p) => patchCells(p).filter(([x, y]) => wallAt(x, y) !== 0).length;
  const initialA = countWalls(A), initialB = countWalls(B);
  const remainSeq = [];
  for (let round = 0; round < 12; round++) {
    for (const p of [A, B]) for (const [x, y] of patchCells(p)) {
      if (wallAt(x, y) === 0) continue;
      swingAt(x, y, x - 2, y + 3, 8, 8, 14);   // 站左2、地板在 y+3（垂直 reach 3 内贴边）
    }
    const ra = countWalls(A), rb = countWalls(B);
    remainSeq.push(ra + rb);
    if (ra + rb === 0) break;
    if (remainSeq.length >= 3 && remainSeq[remainSeq.length - 1] === remainSeq[remainSeq.length - 3]) break;
  }
  const remainA = countWalls(A), remainB = countWalls(B);

  const residue = [];
  for (const p of [A, B]) for (const [x, y] of patchCells(p)) {
    const w = wallAt(x, y);
    if (w !== 0) residue.push({ x, y, w });
  }
  // 对顶行滞留格单格取证
  const T = A.x0 + 3, Ty = A.y0;
  if (wallAt(T, Ty) !== 0) {
    trace.length = 0;
    swingAt(T, Ty, T - 2, Ty + 3, 8, 8, 14);
  }
  const forensic = { calls: trace.length, first4: trace.slice(0, 4), dmg: g.hitTiles.getDamage(T, Ty, 2), wallAfter: wallAt(T, Ty) };

  const residueMap = (() => {
    let s = '';
    for (let y = A.y0; y <= A.y1; y++) {
      let line = '';
      for (let x = A.x0 - 4; x <= B.x1 + 4; x++) {
        const w = wallAt(x, y);
        line += w === 200 ? '#' : w === 204 ? 'J' : st.get(x, y) !== 0 ? 'F' : '.';
      }
      s += line + '\n';
    }
    return s;
  })();

  // 渲染双拍锚点（数据若清零,看画布是否有残影）
  let rshot = null;
  try {
    ground(cx, A.y1 + 6);
    settle(cx, standYOf(A.y1 + 6), 60);
    const [sx0, sy0] = g.camera.worldToScreen((A.x0 - 2) * 16, (A.y0 - 2) * 16);
    const [sx1, sy1] = g.camera.worldToScreen((B.x1 + 2) * 16, (B.y1 + 2) * 16);
    rshot = { clip: { x: Math.floor(sx0), y: Math.floor(sy0), width: Math.ceil(sx1 - sx0), height: Math.ceil(sy1 - sy0) } };
  } catch (e) { rshot = { err: String(e) }; }

  return {
    initial: { A: initialA, B: initialB },
    remainSeq, remain: { A: remainA, B: remainB },
    residueCount: residue.length,
    residue: residue.slice(0, 20),
    forensic,
    residueMap,
    rshot,
  };
});
console.log(JSON.stringify(out, null, 1));

if (out.rshot && out.rshot.clip) {
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: '/tmp/bj333-grounded-before.png', clip: out.rshot.clip });
  await page.evaluate(() => { try { window.__swGame.world.chunkCache?.invalidateAll?.(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: '/tmp/bj333-grounded-after.png', clip: out.rshot.clip });
  console.log('SHOTS SAVED');
}
await browser.close();

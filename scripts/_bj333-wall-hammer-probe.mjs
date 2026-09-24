// BJ333 一次性探针 v2：天然墙（神圣 200/丛林泥 204）锤击清除链复现
// v2 修正：每 tick 钉位玩家（sky 无地面防坠落/摔死）、邻格站位（射程内）、
//          对照组（墙1 单格基线=altar-smash 已证可碎）、路由读 2×2 域
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

  // ---- 场地：天空区（小世界 y 20..78），世界中央 x。全清（tile/wall/liquid）----
  const cx = Math.floor(st.w / 2);
  const RX0 = cx - 60, RX1 = cx + 60, RY0 = 20, RY1 = 78;
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
    const i = st.idx(x, y);
    if (st.type[i] !== 0 || st.flags[i] !== 0) st.setTile(x, y, 0);
    if (st.wall[i] !== 0) st.setWall(x, y, 0);
    st.liquid[i] = 0; st.liquidType[i] = 0;
  }
  // ---- 墙补丁：A=神圣 200（20×14），B=丛林泥 204（16×12），隔 6 格空带 ----
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };
  const B = { x0: cx + 1, y0: 36, x1: cx + 16, y1: 47 };
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) st.setWall(x, y, 204);
  // C=大片面（26×20 神圣 202,静态 3×3 谓词测量用）
  const C = { x0: cx + 24, y0: 30, x1: cx + 49, y1: 49 };
  for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) st.setWall(x, y, 202);
  // D=路由测针竖条（1×6 神圣 200）
  const D = { x: cx + 55, y0: 34, y1: 39 };
  for (let y = D.y0; y <= D.y1; y++) st.setWall(D.x, y, 200);
  // 对照组：单格墙 1（altar-smash 同款可碎面）
  const CTL = { x: cx - 40, y: 40 };
  st.setWall(CTL.x, CTL.y, 1);

  // ---- 工具+玩家 ----
  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const idle = (ticks) => { for (let i = 0; i < ticks; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); } };
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (g.player.fallDistance !== undefined) g.player.fallDistance = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const swingAt = (wx, wy, standX, standY, ticks = 14, offX = 8, offY = 8) => {
    pin(standX, standY); idle(40);                     // 相机先收敛到站位,屏幕坐标才真
    const [sx, sy] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
    for (let i = 0; i < ticks; i++) {
      pin(standX, standY);
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  idle(10);

  // ---- 原版谓词内联复算（CanPlayerSmashWall :46307）----
  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;
  const canSmash = (x, y) => {
    const w = wallAt(x, y);
    if (w === 350) return false;
    for (let a = x - 1; a <= x + 1; a++) for (let b = y - 1; b <= y + 1; b++) if (wallAt(a, b) === 0) return true;
    return false;
  };
  const uniform3x3 = (x, y) => {
    const w = wallAt(x, y);
    for (let a = x - 1; a <= x + 1; a++) for (let b = y - 1; b <= y + 1; b++) if (wallAt(a, b) !== w) return false;
    return true;
  };

  // ---- 对照组基线：单格墙 1 直锤 ----
  pin(CTL.x - 2, CTL.y);
  idle(5);
  swingAt(CTL.x, CTL.y, CTL.x - 2, CTL.y, 14);
  const control = { wallAfter: wallAt(CTL.x, CTL.y), dmg: g.hitTiles.getDamage(CTL.x, CTL.y, 2), playerDead: g.player.dead };

  // ---- 锤扫荡 A+B：逐格瞄准，玩家飞随（每格邻位），多轮直到停滞 ----
  const patchCells = (p) => { const arr = []; for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) arr.push([x, y]); return arr; };
  const countWalls = (p) => patchCells(p).filter(([x, y]) => wallAt(x, y) !== 0).length;
  const initialA = countWalls(A), initialB = countWalls(B);
  const remainSeq = [];
  for (let round = 0; round < 30; round++) {
    for (const p of [A, B]) for (const [x, y] of patchCells(p)) {
      if (wallAt(x, y) === 0) continue;
      swingAt(x, y, x, y + 4, 14);                       // 玩家站目标格下 4 格（射程内）
    }
    const ra = countWalls(A), rb = countWalls(B);
    remainSeq.push(ra + rb);
    if (ra + rb === 0) break;
    if (remainSeq.length >= 3 && remainSeq[remainSeq.length - 1] === remainSeq[remainSeq.length - 3]) break;
  }
  const remainA = countWalls(A), remainB = countWalls(B);

  // ---- 残留格定谳 ----
  const residue = [];
  for (const p of [A, B]) for (const [x, y] of patchCells(p)) {
    const w = wallAt(x, y);
    if (w !== 0) residue.push({ x, y, w, canSmash: canSmash(x, y), uniform: uniform3x3(x, y), dmg: g.hitTiles.getDamage(x, y, 2) });
  }

  // ---- C 大片面静态谓词扫描（内部不可达壳层占比,不锤）----
  let cSmash = 0, cTotal = 0;
  for (const [x, y] of patchCells(C)) { cTotal++; if (canSmash(x, y)) cSmash++; }

  // ---- 亚格象限路由测量：E=空格,右邻=墙条 D ----
  const routing = [];
  {
    const ex = D.x - 1, ey = D.y0 + 2;
    for (const [dx, dy, tag] of [[3, 12, 'left-half'], [13, 12, 'right-half'], [8, 3, 'top-half'], [8, 13, 'bottom-half']]) {
      st.setWall(D.x, ey, 200);
      swingAt(ex, ey, ex - 2, ey, 14, dx, dy);
      const cells = [];
      for (let a = ex; a <= ex + 2; a++) for (let b = ey - 1; b <= ey + 1; b++) {
        const d = g.hitTiles.getDamage(a, b, 2);
        if (d > 0) cells.push([a, b, d]);
      }
      routing.push({ tag, aim: [ex, ey], damaged: cells, wallD: wallAt(D.x, ey) });
    }
  }

  // ---- 渲染对拍锚点 ----
  const rshot = { available: false };
  try {
    pin(cx, A.y1 + 12);
    idle(120); await sleep(600);
    pin(cx, A.y1 + 12);
    const [sx0, sy0] = g.camera.worldToScreen((A.x0 - 2) * 16, (A.y0 - 2) * 16);
    const [sx1, sy1] = g.camera.worldToScreen((B.x1 + 2) * 16, (B.y1 + 2) * 16);
    rshot.clip = { x: Math.floor(sx0), y: Math.floor(sy0), width: Math.ceil(sx1 - sx0), height: Math.ceil(sy1 - sy0) };
    rshot.origin = { wx: A.x0 - 2, wy: A.y0 - 2 };
    rshot.available = true;
  } catch (e) { rshot.err = String(e); }

  const grid = [];
  for (let y = A.y0 - 2; y <= B.y1 + 2; y++) {
    const row = [];
    for (let x = A.x0 - 2; x <= B.x1 + 2; x++) row.push(wallAt(x, y));
    grid.push(row);
  }

  return {
    itemFound: idx >= 0, playerDead: g.player.dead,
    control,
    initial: { A: initialA, B: initialB },
    remainSeq, remain: { A: remainA, B: remainB },
    residueCount: residue.length,
    residueSmashable: residue.filter((r) => r.canSmash).length,
    residue: residue.slice(0, 30),
    residueMap: (() => {
      let s = '';
      for (let y = A.y0; y <= A.y1; y++) {
        let line = '';
        for (let x = A.x0 - 4; x <= B.x1 + 4; x++) {
          const w = wallAt(x, y);
          line += w === 200 ? '#' : w === 202 ? '%' : w === 204 ? 'J' : '.';
        }
        s += line + '\n';
      }
      return s;
    })(),
    cScan: { total: cTotal, smashable: cSmash },
    routing,
    rshot,
    grid,
  };
});
console.log(JSON.stringify(out, null, 1));

if (out.rshot && out.rshot.available) {
  const clip = out.rshot.clip;
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: '/tmp/bj333-shot-before-invalidate.png', clip });
  await page.evaluate(() => {
    const g = window.__swGame;
    try { g.world.chunkCache?.invalidateAll?.(); } catch (e) { console.error('invalidate fail', e.message); }
  });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: '/tmp/bj333-shot-after-invalidate.png', clip });
  console.log('SHOTS SAVED');
}
await browser.close();

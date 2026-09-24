// BJ333 扫荡探针 v4：settle 每 tick 钉位（相机零漂移）+ 每 tick 重算鼠标
// 定谳面：正确瞄准下，A/B 补丁是否仍残留可锤格（canSmash=true 却不清=真 bug）
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
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };            // 20×14 hallow 200
  const B = { x0: cx + 1, y0: 36, x1: cx + 16, y1: 47 };            // 16×12 jungle 204
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);
  for (let y = B.y0; y <= B.y1; y++) for (let x = B.x0; x <= B.x1; x++) st.setWall(x, y, 204);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };
  // 每 tick：钉位→推进(相机)→按当前相机算鼠标→推进(ItemCheck 消费)
  const swingAt = (wx, wy, standX, standY, ticks = 14, offX = 8, offY = 8) => {
    settle(standX, standY, 30);
    for (let i = 0; i < ticks; i++) {
      pin(standX, standY);
      g.fixedUpdate(1 / 60);
      const [sx, sy] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  settle(cx, A.y1 + 10, 60);

  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;
  const canSmash = (x, y) => {
    const w = wallAt(x, y);
    if (w === 350) return false;
    for (let a = x - 1; a <= x + 1; a++) for (let b = y - 1; b <= y + 1; b++) if (wallAt(a, b) === 0) return true;
    return false;
  };
  const patchCells = (p) => { const arr = []; for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) arr.push([x, y]); return arr; };
  const countWalls = (p) => patchCells(p).filter(([x, y]) => wallAt(x, y) !== 0).length;

  const initialA = countWalls(A), initialB = countWalls(B);
  const remainSeq = [];
  for (let round = 0; round < 20; round++) {
    for (const p of [A, B]) for (const [x, y] of patchCells(p)) {
      if (wallAt(x, y) === 0) continue;
      swingAt(x, y, x - 2, y, 14);   // 站左 2 格（水平 reach 5 内;垂直 reach 仅 3,站下 4 格=超程短路）
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
    if (w !== 0) residue.push({ x, y, w, canSmash: canSmash(x, y), dmg: g.hitTiles.getDamage(x, y, 2) });
  }

  const rshot = { available: false };
  try {
    settle(cx, A.y1 + 10, 60);
    const [sx0, sy0] = g.camera.worldToScreen((A.x0 - 2) * 16, (A.y0 - 2) * 16);
    const [sx1, sy1] = g.camera.worldToScreen((B.x1 + 2) * 16, (B.y1 + 2) * 16);
    rshot.clip = { x: Math.floor(sx0), y: Math.floor(sy0), width: Math.ceil(sx1 - sx0), height: Math.ceil(sy1 - sy0) };
    rshot.available = true;
  } catch (e) { rshot.err = String(e); }

  return {
    playerDead: g.player.dead,
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
          line += w === 200 ? '#' : w === 204 ? 'J' : '.';
        }
        s += line + '\n';
      }
      return s;
    })(),
    rshot,
  };
});
console.log(JSON.stringify(out, null, 1));

if (out.rshot && out.rshot.available) {
  const clip = out.rshot.clip;
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: '/tmp/bj333-shot-before.png', clip });
  await page.evaluate(() => { try { window.__swGame.world.chunkCache?.invalidateAll?.(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: '/tmp/bj333-shot-after.png', clip });
  console.log('SHOTS SAVED');
}
await browser.close();

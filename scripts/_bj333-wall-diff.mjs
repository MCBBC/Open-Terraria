// BJ333 差分探针：重建全补丁复现拒锤 + camera.tileUnder 直读链内 tile target + 逐步缩补丁
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
  const fillPatch = (p) => { for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) st.setWall(x, y, 200); };
  fillPatch(A);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };
  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  const swingProbe = (wx, wy, standX, standY, offX = 8, offY = 8, ticks = 6) => {
    settle(standX, standY, 30);
    const log = [];
    for (let i = 0; i < ticks; i++) {
      pin(standX, standY);
      g.fixedUpdate(1 / 60);
      const [sx, sy] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
      g.input.mouseX = sx; g.input.mouseY = sy;
      // ★直读链内 tile target（与 Game.ts:13456 同源）
      const [tux, tuy] = g.camera.tileUnder(g.input.mouseX, g.input.mouseY);
      const [sx2, sy2] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
      log.push({ tileUnder: [tux, tuy], w2sEq: (sx2[0] === sx && sx2[1] === sy) });
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return { log, dmg: g.hitTiles.getDamage(wx, wy, 2), wallAfter: wallAt(wx, wy), dmg3x3: [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]].map(([dx,dy]) => g.hitTiles.getDamage(wx+dx, wy+dy, 2)) };
  };

  const results = [];
  const T = A.x0 + 3, Ty = A.y0;
  // ① 全补丁：顶行格 stand 左2 —— 复现拒锤?
  results.push({ tag: 'full-patch toprow left2', ...swingProbe(T, Ty, T - 2, Ty) });
  // ② 全补丁：顶行格 stand 下2（垂直 reach 3 内）
  st.setWall(T, Ty, 200);
  results.push({ tag: 'full-patch toprow below2', ...swingProbe(T, Ty, T, Ty + 2) });
  // ③ 缩补丁至 2 行（34-35）再试顶行
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) if (y > A.y0 + 1) st.setWall(x, y, 0);
  st.setWall(T, Ty, 200);
  results.push({ tag: 'patch-2rows toprow left2', ...swingProbe(T, Ty, T - 2, Ty) });
  // ④ 缩补丁至 1 行再试
  for (let x = A.x0; x <= A.x1; x++) st.setWall(x, A.y0 + 1, 0);
  st.setWall(T, Ty, 200);
  results.push({ tag: 'patch-1row toprow left2', ...swingProbe(T, Ty, T - 2, Ty) });
  // ⑤ 全补丁但瞄准第二行 (T, 35)（若链内目标真是 (T,35) 则此格应被锤）
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);
  results.push({ tag: 'full-patch row35 left2', ...swingProbe(T, Ty + 1, T - 2, Ty + 1) });

  return { results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

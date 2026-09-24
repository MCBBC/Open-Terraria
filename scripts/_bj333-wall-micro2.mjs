// BJ333 微仪器探针：钉死残留格 (x0,y0)=顶行,取证链内真实瞄准点 + mining 快照 + 多站位
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
  // A 补丁同 v5（20×14 hallow 200, y0=34）
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };

  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  // 单挥仪器：返回 {aimWorld(链内 screenToWorld 重合成), mining, dmg, wallAfter}
  const swingProbe = (wx, wy, standX, standY, offX = 8, offY = 8, ticks = 6) => {
    settle(standX, standY, 30);
    const log = [];
    for (let i = 0; i < ticks; i++) {
      pin(standX, standY);
      g.fixedUpdate(1 / 60);
      const [sx, sy] = g.camera.worldToScreen(wx * 16 + offX, wy * 16 + offY);
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      const [bx, by] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY);
      log.push({
        aimTile: [Math.floor(bx / 16), Math.floor(by / 16)],
        frac: [+(bx / 16 - Math.floor(bx / 16)).toFixed(3), +(by / 16 - Math.floor(by / 16)).toFixed(3)],
        mining: g.mining ? { x: g.mining.x, y: g.mining.y, progress: Math.round(g.mining.progress) } : null,
      });
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return { log, dmg: g.hitTiles.getDamage(wx, wy, 2), wallAfter: wallAt(wx, wy) };
  };

  const T = A.x0 + 3, Ty = A.y0;   // 顶行格 (x0+3, 34)
  const tests = [];
  // ① 站左 2（v5 扫荡几何）
  tests.push({ tag: 'left2', ...swingProbe(T, Ty, T - 2, Ty) });
  // ② 站下 2
  st.setWall(T, Ty, 200);
  tests.push({ tag: 'below2', ...swingProbe(T, Ty, T, Ty + 2) });
  // ③ 站下 3
  st.setWall(T, Ty, 200);
  tests.push({ tag: 'below3', ...swingProbe(T, Ty, T, Ty + 3) });
  // ④ 站左 2 偏上 1（站 (T-2, Ty-1)）
  st.setWall(T, Ty, 200);
  tests.push({ tag: 'left2-up1', ...swingProbe(T, Ty, T - 2, Ty - 1) });
  // ⑤ 站左 2 瞄准亚格左上 (off 3,3)
  st.setWall(T, Ty, 200);
  tests.push({ tag: 'left2-fracTL', ...swingProbe(T, Ty, T - 2, Ty, 3, 3) });
  // ⑥ 站左 2 瞄准亚格右下 (off 13,13)
  st.setWall(T, Ty, 200);
  tests.push({ tag: 'left2-fracBR', ...swingProbe(T, Ty, T - 2, Ty, 13, 13) });

  return { tests, wallTopRow: [...Array(6)].map((_, k) => wallAt(T + k, Ty)) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

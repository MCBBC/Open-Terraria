// BJ333 二分探针：隔离格逐个加 3×3 墙邻格,找翻转「可锤→拒锤」的邻格形态
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
  const RX0 = cx - 30, RX1 = cx + 30, RY0 = 24, RY1 = 70;
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
    const i = st.idx(x, y);
    if (st.type[i] !== 0 || st.flags[i] !== 0) st.setTile(x, y, 0);
    if (st.wall[i] !== 0) st.setWall(x, y, 0);
    st.liquid[i] = 0;
  }
  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };

  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  const M = { x: cx - 5, y: 40 };
  const NB = [
    ['W', -1, 0], ['E', 1, 0], ['N', 0, -1], ['S', 0, 1],
    ['NW', -1, -1], ['NE', 1, -1], ['SW', -1, 1], ['SE', 1, 1],
  ];

  const results = [];
  // 阶段1：全隔离 → 锤 → 应碎
  const swingOnce = (wx, wy, standX, standY, offX = 8, offY = 8, ticks = 4) => {
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
  const probe = (tag) => {
    st.setWall(M.x, M.y, 200);
    swingOnce(M.x, M.y, M.x - 2, M.y);
    const r = { tag, wallAfter: wallAt(M.x, M.y), dmg: g.hitTiles.getDamage(M.x, M.y, 2) };
    results.push(r);
    return r.wallAfter === 0;
  };
  probe('isolated');
  // 阶段2：逐个加邻格
  for (const [tag, dx, dy] of NB) {
    for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) st.setWallSilent?.(x, y, 0) ?? st.setWall(x, y, 0);
    st.setWall(M.x + dx, M.y + dy, 200);
    probe('+' + tag);
  }
  // 阶段3：顶行形态（N/NW/NE 空,S/SW/SE/W/E 墙）——应=残留形态
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) st.setWall(x, y, 0);
  st.setWall(M.x - 1, M.y, 200); st.setWall(M.x + 1, M.y, 200);
  st.setWall(M.x, M.y + 1, 200); st.setWall(M.x - 1, M.y + 1, 200); st.setWall(M.x + 1, M.y + 1, 200);
  probe('toprow-shape');
  // 阶段4：底行形态（S/SW/SE 空,其余墙）
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) st.setWall(x, y, 0);
  st.setWall(M.x - 1, M.y, 200); st.setWall(M.x + 1, M.y, 200);
  st.setWall(M.x, M.y - 1, 200); st.setWall(M.x - 1, M.y - 1, 200); st.setWall(M.x + 1, M.y - 1, 200);
  probe('bottomrow-shape');
  // 阶段5：左列形态
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) st.setWall(x, y, 0);
  st.setWall(M.x, M.y - 1, 200); st.setWall(M.x, M.y + 1, 200);
  st.setWall(M.x + 1, M.y, 200); st.setWall(M.x + 1, M.y - 1, 200); st.setWall(M.x + 1, M.y + 1, 200);
  probe('leftcol-shape');

  return { results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

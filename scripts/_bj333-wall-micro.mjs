// BJ333 微测探针：同格换墙 id 矩阵 + mining 快照 + WALL_HOUSE 成员取证
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
  const housing = await import('/src/world/Housing.ts');
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
  const idle = (ticks) => { for (let i = 0; i < ticks; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); } };
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; if (!g.player.dead) g.player.hp = g.player.maxHp; };

  // 墙 id 成员取证
  const HOUSE = housing.WALL_HOUSE;
  const houseOf = (w) => HOUSE.has(w);
  const ids = [1, 2, 15, 16, 54, 64, 70, 78, 82, 200, 202, 204, 349, 350];
  const houseTable = Object.fromEntries(ids.map((w) => [w, houseOf(w)]));

  // 微测：单格墙 (mx,my)，周缘全空（3×3 有开口），玩家站左 2 格
  const mx = cx - 5, my = 40;
  const matrix = [];
  for (const w of ids) {
    st.setWall(mx, my, w);
    pin(mx - 2, my); idle(40);
    const [sx, sy] = g.camera.worldToScreen(mx * 16 + 8, my * 16 + 8);
    for (let i = 0; i < 14; i++) {
      pin(mx - 2, my);
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    matrix.push({
      w,
      house: houseOf(w),
      wallAfter: st.wall[st.idx(mx, my)],
      dmg: g.hitTiles.getDamage(mx, my, 2),
      mining: g.mining ? { x: g.mining.x, y: g.mining.y, progress: g.mining.progress } : null,
    });
  }

  // 双格对照：同一 id 200 但 3×3 全封闭（无开口）vs 有开口——验证 3×3 门是否真在生效
  const jx = cx + 8, jy = 40;
  st.setWall(jx, jy, 200);
  st.setWall(jx - 1, jy, 200); st.setWall(jx + 1, jy, 200);
  st.setWall(jx, jy - 1, 200); st.setWall(jx, jy + 1, 200);
  st.setWall(jx - 1, jy - 1, 200); st.setWall(jx + 1, jy - 1, 200);
  st.setWall(jx - 1, jy + 1, 200); st.setWall(jx + 1, jy + 1, 200);
  pin(jx - 3, jy); idle(40);
  const [jsx, jsy] = g.camera.worldToScreen(jx * 16 + 8, jy * 16 + 8);
  for (let i = 0; i < 20; i++) {
    pin(jx - 3, jy);
    g.input.mouseX = jsx; g.input.mouseY = jsy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const enclosed = { wallAfter: st.wall[st.idx(jx, jy)], dmg: g.hitTiles.getDamage(jx, jy, 2) };

  return {
    itemFound: idx >= 0,
    hammerPower: items.ITEM_DEFS[idx]?.tool?.power,
    houseTable,
    matrix,
    enclosed,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

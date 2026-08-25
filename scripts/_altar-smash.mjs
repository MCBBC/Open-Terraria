// 一次性:HitTile 全式 Prune 对齐复验——①离手冻结(旧墙钟会清,原版冻结)②跨挥击
// ttl 档衰减③持续两击碎不受影响④猩红同链
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
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const ALTAR = tiles.TILE_BY_KEY['v_26_altars'];
  const st = g.world.store;

  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  for (let dy = -16; dy <= 2; dy++) for (let dx = -30; dx <= 50; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -30; dx <= 50; dx++) st.setTile(px + dx, py + 1, 2);
  // 锤墙练习靶：玩家头顶空气格铺泥墙(墙 id 7? 用 1 泥墙族任一非零)
  const wallCell = { x: px - 2, y: py - 4 };
  st.setWall(wallCell.x, wallCell.y, 1);
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;

  const demon = { x: px + 5, y: py - 3 };
  const crimson = { x: px + 10, y: py - 3 };
  for (let c = 0; c < 3; c++) for (let rI = 0; rI < 2; rI++) {
    st.setTile(demon.x + c, demon.y + rI, ALTAR, c * 18, rI * 18);
    st.setTile(crimson.x + c, crimson.y + rI, ALTAR, 54 + c * 18, rI * 18);
  }

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };

  const snap = (a) => {
    let n = 0;
    for (let c = -1; c < 4; c++) for (let rI = -1; rI < 3; rI++)
      if (st.get(a.x + c, a.y + rI) === ALTAR) n++;
    return n;
  };
  const prog = (a) => {
    let m = 0;
    for (let c = 0; c < 3; c++) for (let rI = 0; rI < 2; rI++)
      m = Math.max(m, g.hitTiles.getDamage(a.x + c, a.y + rI));
    return m;
  };
  const swingAt = (wx, wy, ticks = 12) => {
    const [sx, sy] = g.camera.worldToScreen(wx * 16 + 8, wy * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    for (let i = 0; i < ticks; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const idle = (ticks) => { for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60); };
  const clearHostiles = () => {   // 碎祭坛刷幽灵会打断使用路径——每阶段前清场回血
    g.entities.enemies.length = 0;
    g.entities.projectiles.length = 0;
    if (!g.player.dead) g.player.hp = g.player.maxHp;
  };

  g.world.flags.hardMode = true;
  idle(20);

  // ① 两击碎仍精确:demon 一击 80 → 碎
  swingAt(demon.x + 1, demon.y);
  const afterHit1 = { cells: snap(demon), progress: prog(demon) };
  idle(30);
  clearHostiles();
  swingAt(demon.x + 1, demon.y);
  const afterHit2 = { cells: snap(demon), altarCount: g.world.altarCount };

  // ② 离手冻结:crimson 一击 80 → 干等 300 tick(旧墙钟 ~120t 即清)→ 进度仍在
  clearHostiles();
  g.player.x = (crimson.x - 2) * 16;
  idle(10);
  swingAt(crimson.x + 1, crimson.y);
  const pFrozen0 = prog(crimson);
  idle(300);
  const frozen = { before: pFrozen0, afterIdle300: prog(crimson) };

  // ③ 跨挥击衰减:对泥墙挥 22 击(每击 Prune 全体)→ crimson ttl 60→38,
  //    阶梯在 ttl<48 后每击 -2 → 期望进度 80-约16 ≈ 64(<48 前不扣)
  g.player.x = (wallCell.x + 2) * 16;
  clearHostiles();
  idle(10);
  // 神锤锤墙 160≥100 一击碎→每轮重铺墙保证每轮都有一次真实"非零伤害挥击"→各触发一次 Prune
  for (let k = 0; k < 26; k++) {
    st.setWall(wallCell.x, wallCell.y, 1);
    swingAt(wallCell.x, wallCell.y, 14);
    idle(20);                       // 过 max(8,speed)=27 冷却窗
  }
  const decayed = { crimsonProgress: prog(crimson), expectedBand: '40<<80(ttl60→38,-2×8)' };

  // ④ 衰减后继续敲仍可碎(累积与衰减共存)
  clearHostiles();
  g.player.x = (crimson.x - 2) * 16;
  idle(10);
  swingAt(crimson.x + 1, crimson.y);
  const pAfterMore = { cells: snap(crimson), progress: prog(crimson) };

  return { afterHit1, afterHit2, frozen, decayed, pAfterMore };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

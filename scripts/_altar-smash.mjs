// 一次性:祭坛锤击 1:1 累积制复验——神锤两击碎(80×2≥100)、单击不碎留进度、
// 反噬=statLife/2 每挥击周期、猩红样式(frameX/54)同链
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
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;

  // 两只祭坛:恶魔(style0)与猩红(style1)
  const demon = { x: px + 5, y: py - 3 };
  const crimson = { x: px + 12, y: py - 3 };
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
  const swingAt = (a, ticks = 10) => {
    const [sx, sy] = g.camera.worldToScreen((a.x + 1.5) * 16, (a.y + 1) * 16);
    g.input.mouseX = sx; g.input.mouseY = sy;
    for (let i = 0; i < ticks; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const idle = (ticks) => { for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60); };

  const res = {};
  // —— pre-hardmode:每挥击周期反噬 statLife/2,无进度,祭坛完好 ——
  g.world.flags.hardMode = false;
  idle(60);                                   // 清 i-frame
  let hp0 = g.player.hp;
  swingAt(demon);
  res.preHard = {
    hpBefore: hp0, hpAfter: g.player.hp,
    expectedZap: Math.max(1, Math.floor(hp0 / 2)),
    progress: prog(demon), cells: snap(demon),
  };
  // —— hardmode 神锤两击制:第一击留 80 进度,冷却后第二击碎 ——
  g.world.flags.hardMode = true;
  idle(60);
  res.hit1_demon = { cells: snap(demon) };
  swingAt(demon);
  res.hit1_demon.after = { cells: snap(demon), progress: prog(demon) };
  idle(30);                                    // 过冷却窗(useTime 14)
  swingAt(demon);
  res.hit2_demon = { cells: snap(demon), progress: prog(demon), altarCount: g.world.altarCount,
    oreTierLocked: JSON.parse(JSON.stringify(g.world.savedOreTiers ?? null)) };
  // —— 猩红同链:一击留进度,二击碎(玩家先挪到祭坛旁,inTileRange 内) ——
  g.player.x = (crimson.x - 2) * 16;
  idle(10);
  swingAt(crimson);
  res.crimsonHit1b = { cells: snap(crimson), progress: prog(crimson) };
  idle(30);
  swingAt(crimson);
  res.crimsonHit1 = { cells: snap(crimson), progress: prog(crimson) };
  idle(30);
  swingAt(crimson);
  res.crimsonHit2 = { cells: snap(crimson), progress: prog(crimson), altarCount: g.world.altarCount };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

// SW-BJ10 一次性门级诊断：真实例上逐门报告 tryPlace 拒点
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj10-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj10', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const platId = tilesMod.TILE_BY_KEY['platform'];
  const dirtId = tilesMod.TILE_BY_KEY['dirt'];
  const item = items.ITEM_DEFS.find((d) => d.key === 'vi_94_wood_platform');
  const log = [];
  for (let x = 40; x <= 80; x++) st.setTileSilent(x, 132, dirtId, 0, 0);
  g.player.x = 62 * 16 + 2; g.player.y = 132 * 16 - 44; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y; g.player.dead = false;
  g.smartCursor.wanted = true; g.smartCursor.showing = true;
  st.setTileSilent(60, 126, platId, 0, 0);
  const tx = 61, ty = 127;
  g.smartCursor.x = tx; g.smartCursor.y = ty; g.smartCursor.lockedContinuity = { x: tx, y: ty };
  // 复现全探针时序：标脏 + 800ms 真实 tick 等待
  g.chunks.markDirtyArea(38, 120, 82, 136);
  await new Promise((r2) => setTimeout(r2, 800));
  const r = {};
  r.playerDead = g.player.dead; r.playerHp = g.player.hp;
  r.playerBox = { x: g.player.x, y: g.player.y, w: g.player.w, h: g.player.h, onGround: g.player.onGround };
  r.useTimeBefore = g.player.useTime;
  r.netCanEditTile = g.netCanEditTile();
  r.smartShowing = g.smartCursor.showing; r.smartWanted = g.smartCursor.wanted;
  r.inTileRange = g.inTileRange(tx, ty, g.blockRange());
  r.blockRange = g.blockRange();
  r.inBounds = st.inBounds(tx, ty);
  r.targetBefore = st.type[st.idx(tx, ty)];
  r.itemTile = item.tile;
  r.smartCursorState = { ...g.smartCursor };
  // 拦截 recLog 记录
  g.recLog = (k, d) => log.push({ k, ...d });
  g.tryPlace(tx, ty, item);
  r.targetAfter = st.type[st.idx(tx, ty)];
  r.events = log;
  await new Promise((r2) => setTimeout(r2, 300));
  r.targetAfter300ms = st.type[st.idx(tx, ty)];
  r.useTime = g.player.useTime;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

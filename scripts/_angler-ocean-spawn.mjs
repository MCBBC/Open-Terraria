// 玩家泡在海水里 → spawner 海洋支是否掷出 Enemy 376（用户场景终验）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const st = g.world.store;
  const TILE = 16;
  const res = {};
  // 右侧海洋：从边缘向内找第一个有水的列，玩家浸在水里
  let wx = -1, wy = -1;
  outer:
  for (let x = st.w - 12; x > st.w - 400; x--) {
    for (let y = 200; y < 420; y++) {
      if (st.liquid[st.idx(x, y)] > 150 && !st.isSolid(x, y)) { wx = x; wy = y; break outer; }
    }
  }
  res.waterSpot = { wx, wy };
  if (wx < 0) return res;
  // 先清掉已有的 bound TownNPC angler（模拟用户先没碰到它）
  for (const n of [...g.entities.npcs]) if (n.npcKey === 'angler') n.dead = true;
  g.world.flags.savedAngler = false;
  // 玩家浸入水中（水上漂位置）
  g.player.x = wx * TILE - 8; g.player.y = wy * TILE; g.player.vx = 0; g.player.vy = 0;
  g.world.clock.timeOfDay = 0.45;
  g.enemySpawnEnabled = true;
  const pin = () => { g.player.x = wx * TILE - 8; g.player.y = wy * TILE; g.player.vx = 0; g.player.vy = 0; g.player.breath = 200; };
  pin();
  let found = null;
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    pin();
    g.player.breath = 200;   // 防溺水干扰
    found = g.entities.enemies.find(e => e.vanillaId === 376 && !e.dead) || null;
    if (found) { res.waited = i; break; }
  }
  g.enemySpawnEnabled = false;
  res.spawned376 = !!found;
  if (found) res.pos = { x: Math.round(found.x), y: Math.round(found.y), hp: found.hp };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();

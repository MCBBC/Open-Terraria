import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 清一块观察场：地面 y+2 石板，右侧一堵 6 高墙（跳不过去的高墙）
  for (let x = px - 6; x <= px + 10; x++) {
    for (let y = py - 8; y <= py + 2; y++) st.setTile(x, y, 0);
    st.setTile(x, py + 2, 2);
  }
  for (let y = py - 8; y <= py + 1; y++) st.setTile(px + 8, y, 2);
  // 清掉附近敌人，放 3 只僵尸贴墙
  g.entities.enemies.length = 0;
  const zombieKey = Object.keys(g.tileByKey).length ? null : null;
  const TBK = g.tileByKey;
  void TBK;
  const spawn = () => {
    const e = new (g.constructor.name, (window).__Enemy ?? null)();
    return e;
  };
  void spawn;
  // 通过 VanillaSpawner 没法指定；直接构造：用 g.vanillaSpawner.spawn 返回的对象再手动放置
  const rng = { next: () => Math.random(), int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)) };
  const placed = [];
  for (let i = 0; i < 3; i++) {
    const e = g.vanillaSpawner.spawn((px + 6) * 16, (py - 2) * 16, rng, 30, 20);
    if (e && e.vanillaId !== 3) { e.dead = true; continue; }
    if (e) { e.x = (px + 5) * 16; e.y = (py + 1) * 16; e.id = g.entities.nextId++; g.entities.enemies.push(e); placed.push(e); }
  }
  // 玩家移到墙另一侧（让僵尸朝墙走/索敌）
  g.player.x = (px + 12) * 16; g.player.y = (py - 2) * 16;
  g.world.clock.timeOfDay = 0.1; // 深夜（僵尸活跃）
  return { px, py, placed: placed.length };
});
// 观察 30 秒：每秒采样僵尸 (y, facing, vx) 与城镇 NPC (facing, vx)
const trace = [];
for (let s = 0; s < 30; s++) {
  await new Promise((r) => setTimeout(r, 1000));
  const sample = await page.evaluate(() => {
    const g = window.__swGame;
    const zs = g.entities.enemies.filter((e) => e.vanillaId === 3 && !e.dead).map((e) => ({
      x: Math.round(e.x), y: Math.round(e.y), facing: e.facing, vx: +e.vx.toFixed(2), onG: e.onGround,
    }));
    const npcs = g.entities.npcs.filter((n) => !n.dead).map((n) => ({ facing: n.facing, vx: +n.vx.toFixed(2) }));
    return { zs, npcs };
  }).catch(() => ({ zs: [], npcs: [] }));
  trace.push(sample);
}
// 汇总：僵尸最大离地高度（y 最小值 vs 初始）、facing/vx 异号率（|vx|>0.2 时）
const firstY = trace.flatMap((t) => t.zs.map((z) => z.y));
const minY = firstY.length ? Math.min(...firstY) : null;
let mismatch = 0, matched = 0, npcMismatch = 0, npcMatched = 0;
for (const t of trace) {
  for (const z of t.zs) {
    if (Math.abs(z.vx) > 0.2) { if (Math.sign(z.vx) === z.facing) matched++; else mismatch++; }
  }
  for (const n of t.npcs) {
    if (Math.abs(n.vx) > 0.1) { if (Math.sign(n.vx) === n.facing) npcMatched++; else npcMismatch++; }
  }
}
console.log(JSON.stringify({ setup, zombieMinY: minY, zombieFacingVx: { matched, mismatch }, npcFacingVx: { matched: npcMatched, mismatch: npcMismatch }, errors: errors.slice(0, 3) }, null, 1));
await browser.close();

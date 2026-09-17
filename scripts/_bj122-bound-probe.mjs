// BJ122 实机探针：bound NPC（105/106/123 族 + 685）移动语义 + despawn 语义取证。
// 流程：boot 世界 → 找洞穴层干燥点 → 传玩家过去 → 直接构造 bound TownNPC(105/106/685)
// + 非 bound 城镇 NPC(merchant 17) 作走动基线 → 30s 位置采样 → 传走玩家 +5000px →
// 40s 轮询 bound 是否消散（原版：activeRange 4032px 外当帧消散/离屏 750t 消散）。
// 本脚本只出数据不断言；pre-fix / post-fix 两跑对比由报告层解读。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

// ---- 找洞穴层干燥落脚点并落位玩家 ----
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const ry = Math.floor(w.rockLevel);
  for (let y = ry + 40; y < Math.min(st.h - 220, ry + 300); y += 2) {
    for (let x = 300; x < st.w - 300; x += 3) {
      if (!st.isSolid(x, y)) continue;
      if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
      if (st.liquid[st.idx(x, y - 1)] > 0 || st.liquid[st.idx(x, y - 2)] > 0) continue;
      return { x, y, rockLevel: ry, worldW: st.w, worldH: st.h };
    }
  }
  return null;
});
if (!spot) { console.log('NO_SPOT'); process.exit(1); }
console.log('SPOT', JSON.stringify(spot));

// ---- 构造四只 NPC：bound 105/106/685 + 基线 merchant（非 bound）----
const spawned = await page.evaluate(({ spot }) => {
  const g = window.__swGame;
  const anyNpc = g.entities.npcs.find((n) => n.constructor && n.npcKey);
  if (!anyNpc) return { error: 'no town npc instance to borrow constructor from' };
  const C = anyNpc.constructor;
  const px = (spot.x + 0.5) * 16;
  const py = spot.y * 16;             // y = 脚底（Bottom 锚，NPC.cs:46596）
  const defs = [
    { key: 'goblin_tinkerer', bound: true, dx: -40 },
    { key: 'wizard', bound: true, dx: 0 },
    { key: 'town_slime_old', bound: true, dx: 40 },
    { key: 'merchant', bound: false, dx: 80 },
  ];
  const made = [];
  for (const d of defs) {
    const n = new C(d.key, px + d.dx, py);
    n.bound = d.bound;
    if (!d.bound) n.home = { x: Math.floor((px + d.dx) / 16), y: spot.y - 1 };
    g.entities.add(n, 'npcs');
    made.push({ key: d.key, bound: d.bound, x: n.x, y: n.y, vanillaId: n.vanillaId });
  }
  // 玩家落 NPC 群右侧 +160px（避开重叠——触碰解救是已登记近似,勿污染移动采样）
  g.player.x = px + 160 - g.player.w / 2;
  g.player.y = py - g.player.h - 2;
  return { made, playerX: g.player.x, playerY: g.player.y };
}, { spot });
console.log('SPAWNED', JSON.stringify(spawned));

// ---- 30s 位置采样（~5Hz）----
const samples = [];
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 200));
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    return g.entities.npcs
      .filter((n) => ['goblin_tinkerer', 'wizard', 'town_slime_old', 'merchant'].includes(n.npcKey))
      .map((n) => ({ key: n.npcKey, x: +n.cx.toFixed(2), y: +n.cy.toFixed(2), dead: !!n.dead, vx: +n.vx.toFixed(3) }));
  });
  samples.push(s);
}
// ---- 位移统计 ----
const series = {};
for (const s of samples) {
  for (const e of s) {
    (series[e.key] ??= []).push(e);
  }
}
const stats = {};
for (const [key, arr] of Object.entries(series)) {
  let path = 0, net = 0, flips = 0, maxHop = 0, lastDx = 0;
  for (let i = 1; i < arr.length; i++) {
    const dx = arr[i].x - arr[i - 1].x;
    path += Math.abs(dx);
    if (Math.abs(dx) > maxHop) maxHop = Math.abs(dx);
    if (i >= 2 && dx !== 0 && lastDx !== 0 && Math.sign(dx) !== Math.sign(lastDx)) flips++;
    if (dx !== 0) lastDx = dx;
  }
  net = arr[arr.length - 1].x - arr[0].x;
  stats[key] = { totalPathX: +path.toFixed(1), netX: +net.toFixed(1), dirFlips: flips, maxStepX: +maxHop.toFixed(2), first: arr[0], last: arr[arr.length - 1], deadAtEnd: arr[arr.length - 1].dead };
}
console.log('MOVE_STATS', JSON.stringify(stats, null, 1));

// ---- 传走玩家 +5000px，轮询 bound 消散 40s ----
const away = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x += 5000;
  return { playerX: g.player.x };
});
console.log('TELEPORT_AWAY', JSON.stringify(away));
const despawnLog = [];
let allDead = false;
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    return g.entities.npcs
      .filter((n) => n.bound)
      .map((n) => ({ key: n.npcKey, dead: !!n.dead }));
  });
  const alive = st.filter((e) => !e.dead);
  const marks = st.map((e) => `${e.key}:${e.dead ? 'GONE' : 'alive'}`).join(' ');
  if (marks !== despawnLog[despawnLog.length - 1]) despawnLog.push(marks);
  if (alive.length === 0) { allDead = true; break; }
}
console.log('DESPAWN_LOG', JSON.stringify(despawnLog));
const flags = await page.evaluate(() => {
  const g = window.__swGame;
  const f = g.world.flags;
  return { savedGoblin: !!f['savedGoblin'], savedWizard: !!f['savedWizard'], unlockedSlimeOldSpawn: !!f['unlockedSlimeOldSpawn'] };
});
console.log('FLAGS_AFTER', JSON.stringify(flags));
console.log('VERDICT_DESPAWN', allDead ? 'ALL_BOUND_DESPAWNED' : 'BOUND_STILL_ALIVE_AFTER_40S');
await browser.close();

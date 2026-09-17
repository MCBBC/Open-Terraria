// BJ109-A 修复模拟探针:F6 直召塔(事件不激活) + 按原版 ZoneTower* 语义(纯距离 4000px,
// 无 LunarApocalypseIsUp 门)注入 lunar ctx → 验证 Game.ts:32679 摘除 active 门即修复
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj109fix' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const vs = g.vanillaSpawner ?? (g.vanillaSpawner = g.makeVanillaSpawner(g.world));
  // 玩家落地面
  const st = g.world.store;
  for (let x = Math.floor(st.w / 2) - 30; x < Math.floor(st.w / 2) + 30; x++) {
    let done = false;
    for (let y = 60; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 - g.player.w / 2; g.player.y = (y - 3) * 16 - g.player.h; g.player.vy = 0;
        done = true; break;
      }
    }
    if (done) break;
  }
  // F6 直召四柱在玩家附近(±600px 空中,=用户"四柱旁边"场景),事件不激活
  const ids = [517, 422, 507, 493];
  for (let i = 0; i < 4; i++) {
    g.debugSpawnNpc(ids[i], 1, false);
    const t = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === ids[i]);
    if (t) { t.x = g.player.cx + (i - 1.5) * 400 - t.w / 2; t.y = g.player.cy - 700 - t.h / 2; }
  }
  // ★修复模拟:包装 setPlayerFlags——当 Game 传入 lunar=null 但按原版语义(任意存活
  // 塔 NPC 距玩家 <4000px)应非 null 时,替换为计算好的 ctx(=Game.ts:32679 摘门后的行为)
  const TOWER_KEY = { 517: 'solar', 422: 'vortex', 507: 'nebula', 493: 'stardust' };
  const orig = vs.setPlayerFlags.bind(vs);
  vs.setPlayerFlags = function (zd, ds, inv, activeIds, moonEvent, lunar, ...rest) {
    if (!lunar) {
      const p = g.player;
      const zone = { solar: false, vortex: false, nebula: false, stardust: false };
      let any = false;
      for (const e of g.entities.enemies) {
        if (e.dead || e.vanillaId == null) continue;
        const k = TOWER_KEY[e.vanillaId];
        if (!k) continue;
        if (Math.hypot(e.cx - p.cx, e.cy - p.cy) < 4000) { zone[k] = true; any = true; }
      }
      if (any) {
        const counts = new Map();
        for (const e of g.entities.enemies) {
          if (!e.dead && e.vanillaId != null) counts.set(e.vanillaId, (counts.get(e.vanillaId) ?? 0) + 1);
        }
        lunar = { zone, counts };
      }
    }
    return orig(zd, ds, inv, activeIds, moonEvent, lunar, ...rest);
  };
  window.__spawned = [];
  const on = vs.spawnNPC.bind(vs);
  vs.spawnNPC = function (x, y, netId, rng) {
    const r = on.apply(vs, arguments);
    if (r) window.__spawned.push(r.vanillaId ?? r.def?.npc ?? -1);
    return r;
  };
  return { lunarActive: g.world.lunarEvent.active, player: { cx: Math.round(g.player.cx), cy: Math.round(g.player.cy) },
    towers: [...g.entities.enemies].filter((e) => !e.dead && [517, 422, 507, 493].includes(e.vanillaId)).map((e) => ({ id: e.vanillaId, cy: Math.round(e.cy) })) };
});
console.log('setup:', JSON.stringify(setup));

for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, 8000));
  const s = await page.evaluate((i) => {
    const g = window.__swGame;
    const counts = {};
    for (const L of [402, 405, 406, 407, 409, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 518, 519]) counts[L] = 0;
    for (const e of g.entities.enemies) if (!e.dead && e.vanillaId != null && counts[e.vanillaId] !== undefined) counts[e.vanillaId]++;
    return {
      i, zone: g.vanillaSpawner.lunar ? { ...g.vanillaSpawner.lunar.zone } : null,
      alive: counts, total: Object.values(counts).reduce((s, n) => s + n, 0),
      spawned: window.__spawned.splice(0), playerDead: g.player.dead,
    };
  }, i);
  console.log(JSON.stringify(s));
}
console.log('errors:', errors.slice(0, 3));
await browser.close();

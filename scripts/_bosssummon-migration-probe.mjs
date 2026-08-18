// 六件收口探针（2026-08-18）：
//  ① 机械蠕虫 556 物品召唤落位 = SpawnOnPlayer：屏幕外 + 地下玩家附近（非旧±55列地表顶扫）
//  ② EoW 头死后身段在场，蠕虫食物 70 可再召一头（BOSS_FAMILY 头部精确门）→ 两链并存
//  ③ 史莱姆雨击杀达标自然出王 → HasAwoken 公告文本
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5211'}/?play=small&bsprobe=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world && window.__swGame.entities, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// vanilla.json 反查 vi_ key（autoreuse 探针同法）
const van = await page.evaluate(async () => (await (await fetch('sprites/vanilla.json')).json()).items ?? {});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};

const give = async (vid) => page.evaluate((key) => {
  const g = window.__swGame;
  const id = window.__swItems?.[key];
  if (id === undefined) return false;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 5 };
  g.player.useTime = 0;
  g.cb.onInventoryChanged?.();
  return true;
}, keyFor(vid));

const results = [];

// ============ ① 机械蠕虫 556：夜间 + 地下玩家 + 物品使用 ============
const r1pre = await give(556);
await page.evaluate(() => {
  const g = window.__swGame;
  // 夜间（43/机械族夜门；556 无群系门）
  g.world.clock.timeOfDay = 0.9;
  // 传送地下（rockLevel 下 60 格）：挖 5×5 空腔安放玩家
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.rockLevel) + 60;
  for (let dx = -2; dx <= 2; dx++) for (let dy = -3; dy <= 1; dy++) st.setTile(px + dx, py + dy, 0, 0, 0);
  g.player.x = px * 16; g.player.y = (py - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  window.__p1 = { px, py };
});
const r1 = await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = g.player.cx + 300; g.input.mouseY = g.player.cy;
  for (let t = 0; t < 30; t++) {
    g.world.clock.timeOfDay = 0.9;   // 防时钟自走回白天
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
  }
  g.input.mouseDown = false;
  const head = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 134);
  if (!head) return { spawned: false };
  const halfW = g.camera.viewW / (g.camera.zoom || 1) / 2;
  const halfH = g.camera.viewH / (g.camera.zoom || 1) / 2;
  const p = g.player;
  return {
    spawned: true,
    offscreenX: Math.abs(head.cx - p.cx) > halfW,
    offscreenY: Math.abs(head.cy - p.cy) > halfH,
    offscreen: Math.abs(head.cx - p.cx) > halfW || Math.abs(head.cy - p.cy) > halfH,
    dxTiles: Math.round(Math.abs(head.cx - p.cx) / 16),
    dyTiles: Math.round(Math.abs(head.cy - p.cy) / 16),
    nearPlayerUnderground: Math.abs(Math.floor(head.cy / 16) - Math.floor(p.cy / 16)) < 120,
    headYTile: Math.floor(head.cy / 16), playerYTile: Math.floor(p.cy / 16),
    consumed: !g.player.inv.slots[g.player.inv.selected],
  };
});
results.push({ name: '①mech-worm-offscreen', give556: r1pre, ...r1,
  pass: !!(r1.spawned && r1.offscreen && r1.nearPlayerUnderground) });

// 清场：杀掉毁灭者（标记 dead，跑几 tick 让 boss 槽清空）
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of g.entities.enemies) if (!e.dead) e.dead = true;
  for (let t = 0; t < 12; t++) { g.world.clock.timeOfDay = 0.9; g.fixedUpdate(1 / 60); }
});

// ============ ② EoW 双头：头死→身段在场→蠕虫食物再召 ============
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.9; });
const r2pre = await give(70);
const r2 = await page.evaluate(() => {
  const g = window.__swGame;
  const useFood = () => {
    g.player.useTime = 0;
    for (let t = 0; t < 30; t++) {
      g.scene.zoneCorrupt = true;   // 15tick 刷新前保持腐化群系位
      g.world.clock.timeOfDay = 0.9;
      g.input.mouseX = g.player.cx + 300; g.input.mouseY = g.player.cy;
      g.input.mouseDown = true;
      g.fixedUpdate(1 / 60);
    }
    g.input.mouseDown = false;
  };
  const heads = () => g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 13);
  const bodies = () => g.entities.enemies.filter((e) => !e.dead && (e.vanillaId === 14 || e.vanillaId === 15));
  useFood();
  const h1 = heads();
  if (!h1.length) return { phase: 'summon1', ok: false, bodies: bodies().length };
  const firstHeadId = h1[0].id;
  const bodiesAfter1 = bodies().length;
  // 杀头（身段独立存活，EoW realLife=-1 语义）
  h1[0].dead = true; h1[0].hp = 0;
  for (let t = 0; t < 12; t++) { g.scene.zoneCorrupt = true; g.world.clock.timeOfDay = 0.9; g.fixedUpdate(1 / 60); }
  const headGone = heads().length === 0;
  const bodyAlive = bodies().length > 0;
  // 身段在场时再放蠕虫食物（BOSS_FAMILY 头部精确门 → 应放行）
  useFood();
  const h2 = heads();
  return {
    phase: 'done', ok: true,
    firstHeadId, bodiesAfter1, headGone, bodyAlive,
    secondSummon: h2.length > 0,
    newHeadId: h2[0]?.id ?? null,
    twoChainsCoexist: h2.length > 0 && bodies().length > 0 && h2[0]?.id !== firstHeadId,
    bodiesAfter2: bodies().length,
  };
});
results.push({ name: '②eow-double-head', give70: r2pre, ...r2,
  pass: !!(r2.ok && r2.secondSummon && r2.twoChainsCoexist && r2.bodyAlive) });

// 清场
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of g.entities.enemies) if (!e.dead) e.dead = true;
  for (let t = 0; t < 12; t++) { g.world.clock.timeOfDay = 0.9; g.fixedUpdate(1 / 60); }
});

// ============ ③ 史莱姆雨自然出王公告 ============
const r3 = await page.evaluate(() => {
  const g = window.__swGame;
  const chats = [];
  const orig = g.cb.onChat;
  g.cb.onChat = (t, r, gg, b) => { chats.push(String(t)); orig?.(t, r, gg, b); };
  g.world.weather.slimeRain = true;
  g.world.weather.slimeRainKillCount = 149;   // 150 阈值差一杀
  // 手招一只蓝史莱姆（vanillaId 1）并打死 → advanceSlimeRainKill 达标
  g.debugSpawnNpc(1, 1, false);
  let slime = null;
  for (let t = 0; t < 30 && !slime; t++) {
    g.fixedUpdate(1 / 60);
    slime = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 1);
  }
  if (!slime) { g.cb.onChat = orig; return { phase: 'spawn', ok: false }; }
  slime.hurt(99999, 0, 1, g, 0, false, -1, true);
  for (let t = 0; t < 20; t++) g.fixedUpdate(1 / 60);
  g.cb.onChat = orig;
  const ks = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 50);
  return {
    phase: 'done', ok: true,
    kingSpawned: !!ks,
    chats,
    hasAwokenText: chats.some((t) => t.includes('苏醒') || t.includes('awoken') || t.includes('Awoken')),
    countAfter: g.world.weather.slimeRainKillCount,
  };
});
results.push({ name: '③slime-rain-ks-announce', ...r3,
  pass: !!(r3.ok && r3.kingSpawned && r3.hasAwokenText) });

const failed = results.filter((a) => !a.pass);
console.log(JSON.stringify(results, null, 1));
console.log(failed.length ? `FAIL ×${failed.length}: ${failed.map((f) => f.name).join(', ')}` : 'ALL PASS');
console.log('pageerrors:', errors.length ? errors.slice(0, 3).join(' | ').slice(0, 200) : 0);
await browser.close();

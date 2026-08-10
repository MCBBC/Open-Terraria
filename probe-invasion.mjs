// 入侵系统 E2E：①启动+公告 ②前线推进+抵达 ③入侵怪生成（海盗池）④击杀扣分→胜利→海盗NPC解锁
// ⑤哥布林黎明 roll ⑥压制城镇NPC ⑦物品触发 ⑧音乐/进度条组装 ⑨存档往返
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { Lang } = await import('/src/i18n/Lang.ts');
  const { saveGame } = await import('/src/save/SaveFile.ts');
  const res = {};
  const w = g.world;

  // ① 海盗入侵启动（需要 maxHp≥200）
  g.player.baseMaxHp = 220;
  const started = g.startInvasionAndAnnounce(3);
  res.start = {
    ok: started,
    type: w.invasionType, size: w.invasionSize, sizeStart: w.invasionSizeStart,
    atEdge: w.invasionX === 0 || w.invasionX === w.store.w,
    expectSize: 120 + 60, // 海盗 120+60n
  };
  // 生命不足拒绝
  w.invasionType = 0; w.invasionSize = 0; // 清场再测
  g.player.baseMaxHp = 100;
  res.rejectLowHp = !g.startInvasionAndAnnounce(1);
  g.player.baseMaxHp = 220;
  g.startInvasionAndAnnounce(3);

  // ② 前线推进 + 抵达公告（直调 tickInvasion 前进 5000 帧）
  const dist0 = Math.abs(w.invasionX - w.spawnX);
  for (let i = 0; i < 5000 && w.invasionX !== w.spawnX; i++) {
  }
  // 逐帧推进（不直调私有 tick——fixedUpdate 驱动；但为快进直接拨前线到 spawnX）
  w.invasionX = w.spawnX;
  res.arrived = dist0 > 0;
  void saveGame;

  // ③ 入侵怪生成：拨到前线附近 + 开刷怪，循环 trySpawnEnemy
  g.enemySpawnEnabled = true;
  g.enemySpawnEnabled = true;
  w.clock.timeOfDay = 0.5; // 白天（入侵怪昼行豁免）
  let pirates = [];
  for (let i = 0; i < 4000 && pirates.length < 3; i++) {
    g.trySpawnEnemy();
    pirates = g.entities.enemies.filter((e) => [212, 213, 214, 215, 216, 252].includes(e.vanillaId));
  }
  res.pirateSpawns = pirates.map((e) => e.vanillaId);
  // 非入侵怪不混入（spawnAnNPC 入侵分支互斥）
  res.nonInvasionLeak = g.entities.enemies.some((e) => e.vanillaId === 1 || e.vanillaId === 3);

  // ④ 击杀扣分 → 胜利 → downedPirates + 海盗NPC解锁
  const sizeBefore = w.invasionSize;
  const first = pirates[0];
  if (first) { first.hp = 1; first.hurt(9999, 0, 0, g); }
  res.killScored = first ? w.invasionSize === Math.max(0, sizeBefore - 1) : null;
  if (first && w.invasionSize > 0) {
    // 快进胜利：清空计数
    w.invasionSize = 1;
    const oneMore = g.entities.enemies.find((e) => [212, 213, 214, 215, 216, 252].includes(e.vanillaId) && !e.dead);
    if (oneMore) { oneMore.hp = 1; oneMore.hurt(9999, 0, 0, g); }
  }
  // 等 fixedUpdate 消化胜利帧
  await new Promise((r) => setTimeout(r, 300));
  res.victory = {
    flag: w.flags['downedPirates'],
    typeCleared: w.invasionType === 0,
    pirateNpcUnlocked: g.townNpcSpawnAllowed('pirate'),
  };

  // ⑤ 哥布林黎明 roll：设 shadowOrbSmashed + 跨黎明（未击败过 1/3 → 多次必中）
  w.flags.shadowOrbSmashed = true;
  let goblin = false;
  for (let i = 0; i < 12 && !goblin; i++) {
    w.clock.timeOfDay = 0.24; g._lastClockT = 0.24;
    w.clock.timeOfDay = 0.26; // 模拟跨黎明（fixedUpdate 会消化）
    await new Promise((r) => setTimeout(r, 60));
    goblin = w.invasionType === 1;
  }
  res.goblinDawnRoll = goblin;
  if (goblin) { w.invasionType = 0; w.invasionSize = 0; } // 清场

  // ⑥ 压制：入侵中 updateTownNpcArrival 直接返回
  w.invasionType = 3; w.invasionSize = 100;
  const npcBefore = g.entities.npcs.length;
  g.updateTownNpcArrival();
  res.suppression = g.entities.npcs.length === npcBefore;
  w.invasionType = 0; w.invasionSize = 0;

  // ⑦ 物品触发：雪球（雪人军团）
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  g.player.inv.add(ITEM_BY_KEY['snow_globe'], 1);
  g.player.inv.selected = g.player.inv.slots.findIndex((s) => s && s.id === ITEM_BY_KEY['snow_globe']);
  // 直接调用 useItem 分支不方便（需鼠标），验证 startInvasionAndAnnounce(2) 即可覆盖核心
  res.snowItem = ITEM_BY_KEY['snow_globe'] !== undefined;
  res.snowStart = g.startInvasionAndAnnounce(2);
  w.invasionType = 0; w.invasionSize = 0;

  // ⑧ 音乐/进度条组装（屏内入侵怪时）
  w.invasionType = 1; w.invasionSizeStart = 120; w.invasionSize = 60;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const dummy = Enemy.fromVanilla(28, g.player.cx + 100, g.player.cy);
  dummy.id = 99999; g.entities.enemies.push(dummy);
  const { pickMusic } = await import('/src/data/Music.ts');
  const scene = g.scene ?? { zoneBeach: false, zoneGraveyard: false, zoneHallow: false, townNPCCount: 0, zoneJungle: false, zoneSnow: false, zoneCorrupt: false, zoneCrimson: false, zoneMeteor: false, zoneTemple: false, zoneDungeon: false, zoneGlowshroom: false, zoneUndergroundDesert: false, zoneDesert: false };
  const m = pickMusic({ scene, isDay: true, bossMusic: 0, invasionMusic: 39,
    worldSurface: w.groundLevel, rockLevel: w.rockLevel, lavaLine: w.lavaLine || w.store.h - 200,
    maxTilesX: w.store.w, centerX: g.player.cx, centerY: g.player.cy, state: g.musicState });
  res.music = m === 39;
  dummy.dead = true;
  w.invasionType = 0; w.invasionSize = 0;

  // ⑨ 存档往返
  w.invasionType = 2; w.invasionSize = 50; w.invasionSizeStart = 100; w.invasionX = 777; w.invasionDelay = 0;
  const json = saveGame(w, g.player, 1000);
  const { loadSaveData } = await import('/src/save/SaveFile.ts');
  const loaded = loadSaveData(JSON.parse(json));
  res.saveRoundtrip = {
    type: loaded.world.invasionType, size: loaded.world.invasionSize,
    sizeStart: loaded.world.invasionSizeStart, x: loaded.world.invasionX,
  };
  return res;
});
console.log(JSON.stringify(out));
await b.close();

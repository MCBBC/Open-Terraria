// 幸运度消费面七类补全批——实机探针（run-diag 通道）。
// 七类定谳锚见 tests/luck-consumers.test.ts 头注；本探针在**实机 Game 实例**上断言：
//   ① 旅商商店 luck 链：a) 件数加件掷（SetupTravelShop :1277-1293 RollLuck(4/8/16/32),
//      与画作同用 rollZero=rollLuck(player.luck,N)==0 缝）均值三档单调;
//      b) 画作池结构（稀有画 5121-5124 基率可达——GetPainting Chest.cs:817-829 四掷,
//      ★定谳:重试环"任一命中即停"把各档 1.386× 提升条件化抵消,末位构成本身对 luck
//      不敏感,故画作 luck 面以同缝件数掷+结构可达断言）; c) 复合门补齐（2865-2867/
//      3596/5243 hardMode&&downed 复合串 condOk 修复后可达）。
//   ② 饵金变体实机掷：贴地草 breakTile + Math.random 定谱 + luck=+1 → 金蚯蚓 448
//      （KillTile_DropBait WorldGen.cs:66885 GetClosestRollLuck(i,j,400)==0）；
//      罐钱币传送门实机掷：贴地罐 smashPot → CoinPortalProj（SpawnThingsFromPot :57654）。
//   ③ 心/星五掷：仓内 NpcDrops rollTypeHearts/rollHeartsAndStars 已接（vitest
//      luck-drop-chain/luck-consumers 锁定），本探针不做实机击杀重复覆盖 → 登记。
//   ④ 坠星定向实机掷：夜间 + starfallBoost + Math.random 定谱 → FallingStar homing
//      且出生 X = player.x ± 1（num30=1 两掷偏移实证,SpawnFallingObjects :72410）；
//      外加 starfallHoming 纯函数三档统计（Luck.ts）。
//   ⑤ 金蛙实机掷：spawner.spawnFrog 定谱 luck=+1 → 445 / luck=0 → 361（SpawnFrog
//      NPC.cs:5621-5637 RollLuck(400)）。
//   ⑥ 地牢幽魂实机掷：地牢墙内怪连环击杀（门全开 + luck=+1）→ 288 出魂率 >0
//      （DoDeathEvents_SummonDungeonSpirit NPC.cs:79875-79886,Enemy.ts 死亡结算）。
//   ⑦ 地下仙女实机掷：spawner.checkToSpawnUndergroundFairy 定谱 luck=+1 → true /
//      luck=0 → false（CheckToSpawnUndergroundFairy NPC.cs:5820-5845）。
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player,
  { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { asserts: [], detail: {} };
  const A = (name, ok, detail) => out.asserts.push({ name, ok: !!ok, detail: detail ?? '' });

  // ---- 工具：玩家 luck 实例覆写（buildTravelStock/killTileDropBait 读 this.player.luck）----
  let luckOverride = null;
  Object.defineProperty(g.player, 'luck', {
    get: () => (luckOverride !== null ? luckOverride : 0),
    configurable: true,
  });
  const setLuck = (v) => { luckOverride = v; };

  // ---- 工具：Math.random 定谱（allZero = 恒 0）----
  const origRandom = Math.random;
  const useZeroRandom = () => { Math.random = () => 0; };
  const restoreRandom = () => { Math.random = origRandom; };

  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  const sheetTile = (sheet) => TILE_DEFS.findIndex((d) => d && d.vanilla && d.vanilla.sheet === sheet);
  const st = g.world.store;

  // ---- 试验场：整平一块地表（保留地下实心支撑——植物/瓦罐需贴地,悬空置放会被
  //      支撑检查即时清除,曾致 ② 两断言假红）----
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel);
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  for (let dy = -8; dy <= -1; dy++) for (let dx = -8; dx <= 8; dx++) st.setTile(px + dx, gy + dy, 0);
  for (let dx = -8; dx <= 8; dx++) st.setTile(px + dx, gy, 1);
  g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;

  // ============================================================
  // ① 旅商商店 luck 链（件数掷同缝均值 + 画作结构可达 + 复合门）
  // ============================================================
  {
    // —— a) 件数加件掷（与画作四掷同一 rollZero 缝）三档均值
    const avgStockSize = (luck, n) => {
      setLuck(luck);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += g.buildTravelStock().length;
      return sum / n;
    };
    const N = 4000;
    const sPos = avgStockSize(1, N);
    const sZero = avgStockSize(0, N);
    const sNeg = avgStockSize(-1, N);
    setLuck(null);
    out.detail.stockSize = { sPos, sZero, sNeg };
    // 理论锚：基础件 4-6 + Σ1/4,1/8,1/16,1/32=0.469 → ≈5.47;±1 → 1.386×/0.693× 加件
    A('①商店件数均值 luck+1 > 0（RollLuck(4/8/16/32) 加件缝）',
      sPos > sZero + 0.08, `pos=${sPos.toFixed(3)} zero=${sZero.toFixed(3)}`);
    A('①商店件数均值 luck−1 < 0', sNeg < sZero - 0.08, `neg=${sNeg.toFixed(3)} zero=${sZero.toFixed(3)}`);

    // —— b) 画作池结构：稀有画 5121-5124 在基线 luck=0 下可达（结构断言）
    const RARE = new Set([5121, 5122, 5123, 5124]);
    setLuck(0);
    let rareHits = 0;
    const M = 2000;
    for (let i = 0; i < M; i++) {
      if (g.buildTravelStock().some(([id]) => RARE.has(id))) rareHits++;
    }
    setLuck(null);
    out.detail.rarePaintingRate = rareHits / M;
    A('①稀有画 5121-5124 基线可达（GetPainting rarity[3] 四掷）', rareHits > M * 0.02,
      `rate=${(rareHits / M).toFixed(4)}（理论 ≈0.084 条件化）`);

    // —— c) 复合门补齐（hardMode&&downedMartians / hardMode&&downed_398）——修复前恒不可达
    const f = g.world.flags;
    const oldHM = f.hardMode, oldMart = f.downedMartians, oldML = f['downed_398'];
    f.hardMode = true; f.downedMartians = true; f['downed_398'] = true;
    setLuck(0);
    const WANT = new Set([2865, 2866, 2867, 3596, 5243]);
    let compound = 0;
    for (let i = 0; i < 4000; i++) {
      if (g.buildTravelStock().some(([id]) => WANT.has(id))) compound++;
    }
    f.hardMode = oldHM; f.downedMartians = oldMart; f['downed_398'] = oldML;
    setLuck(null);
    out.detail.compoundPaintings = compound;
    A('①复合门画作可达（2865-2867/3596/5243）', compound > 0, `hits=${compound}/4000`);
  }

  // ============================================================
  // ② 饵金变体（实机 breakTile）+ 罐钱币传送门（实机 smashPot）
  // ============================================================
  {
    // —— ②a 金蚯蚓：贴地草 + 定谱 [accept 0 | 门 0.5 | B 0.99 | 终掷 0] → 448
    //（setTileSilent：植物/罐的 DECOR 邻域复验监听会即时清掉单格放置件——探针只需
    //  store 态正确,非静默写必被 checkDecorSquareFrame 级联拆,曾致本断言假红）
    const grassId = sheetTile(3);
    A('②前置：草地 tile 表在位', grassId > 0, `id=${grassId}`);
    const wormSpot = { x: px - 4, y: gy - 1 };   // 地面行 gy 的正上方=贴地
    st.setTileSilent(wormSpot.x, wormSpot.y, grassId);
    st.frameX[st.idx(wormSpot.x, wormSpot.y)] = 0;
    st.frameY[st.idx(wormSpot.x, wormSpot.y)] = 0;
    const goldWorms = () => g.entities.critters.filter((c) => !c.dead && g.critterVid(c) === 448).length;
    const before = goldWorms();
    setLuck(1);
    useZeroRandom();
    g.breakTile(wormSpot.x, wormSpot.y, true);
    restoreRandom();
    setLuck(null);
    const after = goldWorms();
    A('②草地破坏 luck=+1 定谱 → 金蚯蚓 448 实机生成', after > before, `448:${before}→${after}`);

    // —— ②b 罐钱币传送门：贴地罐 + 定谱全 0 → CoinPortalProj
    const potId = sheetTile(28);
    A('②前置：瓦罐 tile 表在位', potId > 0, `id=${potId}`);
    const potSpot = { x: px + 3, y: gy - 1 };
    st.setTileSilent(potSpot.x, potSpot.y, potId);
    st.frameX[st.idx(potSpot.x, potSpot.y)] = 0;
    st.frameY[st.idx(potSpot.x, potSpot.y)] = 0;   // style 0 → range=500
    const portals = () => g.entities.projectiles.filter((p) => p.constructor?.name === 'CoinPortalProj').length;
    const portalBefore = portals();
    setLuck(1);
    useZeroRandom();
    g.smashPot(potSpot.x, potSpot.y);
    restoreRandom();
    setLuck(null);
    const portalAfter = portals();
    A('②破罐 luck=+1 定谱 → CoinPortalProj 实机生成', portalAfter > portalBefore,
      `portal:${portalBefore}→${portalAfter}`);
  }

  // ============================================================
  // ④ 坠星定向（实机 tick 注入）+ starfallHoming 纯函数三档统计
  // ============================================================
  {
    const { starfallHoming } = await import('/src/stats/Luck.ts');
    // —— 纯函数统计（remix=off,地表/AFK 门全开）
    const rate = (luck) => {
      let hits = 0;
      for (let i = 0; i < 40000; i++) {
        if (starfallHoming(luck, false, Math.random, true, true) !== null) hits++;
      }
      return hits / 40000;
    };
    const sfPos = rate(1), sfZero = rate(0), sfNeg = rate(-1);
    out.detail.starfall = { sfPos, sfZero, sfNeg };
    A('④starfallHoming 三档单调（+1≈0.100/0≈0.067/−1≈0.047）',
      sfPos > sfZero * 1.3 && sfNeg < sfZero * 0.85,
      `pos=${sfPos.toFixed(4)} zero=${sfZero.toFixed(4)} neg=${sfNeg.toFixed(4)}`);

    // —— 实机：夜间 + boost + 定谱全 0 → FallingStar homing 且 X=player.x±1
    const w = g.world;
    const oldTod = w.clock.timeOfDay, oldBoost = g.starfallBoost;
    w.clock.timeOfDay = 0.95;               // 夜
    g.starfallBoost = 1;
    const p0 = { x: g.player.x, y: g.player.y, vx: g.player.vx, vy: g.player.vy };
    g.player.vx = 0; g.player.vy = 0;
    const surfY = (gy - 6) * 16;
    if (g.player.y > surfY) g.player.y = surfY;
    setLuck(1);
    useZeroRandom();
    const starsBefore = g.entities.projectiles.filter((p) => p.constructor?.name === 'FallingStar').length;
    for (let k = 0; k < 6; k++) g.fixedUpdate(1 / 60);
    restoreRandom();
    setLuck(null);
    g.starfallBoost = oldBoost;
    w.clock.timeOfDay = oldTod;
    g.player.x = p0.x; g.player.y = Math.max(p0.y, surfY); g.player.vx = p0.vx; g.player.vy = p0.vy;
    const stars = g.entities.projectiles.filter((p) => p.constructor?.name === 'FallingStar');
    const homing = stars.filter((p) => p.homing === true);
    out.detail.stars = { spawned: stars.length - starsBefore, homing: homing.length };
    A('④夜间坠星实机定向（homing 星生成,X=player.x±1）',
      homing.length > 0 && homing.every((p) => Math.abs((p.cx - 8) - g.player.x) <= 2 || Math.abs(p.cx - g.player.x) <= 2),
      `spawned=${stars.length - starsBefore} homing=${homing.length}`);
  }

  // ============================================================
  // ⑤ 金蛙 + ⑦ 地下仙女（spawner 实例直调）
  // ============================================================
  {
    const sp = g.vanillaSpawner ?? g.makeVanillaSpawner(g.world);
    const stubRng = (seq) => {
      let i = 0;
      const pull = () => (i < seq.length ? seq[i++] : 0);
      return { next: pull, int: (a, b) => a + Math.floor(pull() * (b - a + 1)) };
    };
    // —— ⑤ 金蛙：687 旗置位（支路短路不耗掷）→ 定谱 luck=1 → 445 / luck=0 → 361
    const oldUnlock = g.world.flags.unlockedSlimeYellowSpawn;
    g.world.flags.unlockedSlimeYellowSpawn = true;
    const savedLuck = sp.playerLuck;
    sp.playerLuck = 1;
    sp.spawnTileX = Math.floor(g.player.cx / 16);
    sp.spawnTileY = Math.floor(g.player.cy / 16);
    const goldFrog = sp.spawnFrog(stubRng([0.5, 0.99, 0]));
    sp.playerLuck = 0;
    const plainFrog = sp.spawnFrog(stubRng([0.5]));
    sp.playerLuck = savedLuck;
    g.world.flags.unlockedSlimeYellowSpawn = oldUnlock;
    A('⑤spawnFrog luck=+1 定谱 → 金蛙 445', goldFrog?.vanillaId === 445, `vid=${goldFrog?.vanillaId}`);
    A('⑤spawnFrog luck=0 → 普通蛙 361（基线不回归）', plainFrog?.vanillaId === 361, `vid=${plainFrog?.vanillaId}`);

    // —— ⑦ 地下仙女：fairyLog + 深度窗内 → 定谱 luck=1 → true / luck=0 → false
    //（fairyHelpfulActive 强制 false：play=small 世界自带倒木 fairyLog,场上可能已有
    //  跟随态仙女使 AnyHelpfulFairies 拒绝——本断言只钉 roll+深度窗接线）
    const oldFairyLog = g.world.fairyLog;
    const oldHelpful = sp.fairyHelpfulActive;
    g.world.fairyLog = true;
    sp.fairyHelpfulActive = false;
    const midY = Math.floor((g.world.groundLevel + g.world.rockLevel) / 2) + 5;
    sp.spawnTileY = Math.min(midY, g.world.store.h - 301);
    sp.playerLuck = 1;
    const fairyLucky = sp.checkToSpawnUndergroundFairy(stubRng([0.5, 0.99, 0]));
    sp.playerLuck = 0;
    const fairyPlain = sp.checkToSpawnUndergroundFairy(stubRng([0.5]));
    sp.playerLuck = savedLuck;
    g.world.fairyLog = oldFairyLog;
    sp.fairyHelpfulActive = oldHelpful;
    out.detail.fairy = {
      fairyLucky, fairyPlain, spawnTileY: sp.spawnTileY,
      gl: g.world.groundLevel, rl: g.world.rockLevel, h: g.world.store.h,
      spHardMode: sp.hardMode, fairyHelpful: sp.fairyHelpfulActive,
    };
    A('⑦checkToSpawnUndergroundFairy luck=+1 定谱 → true', fairyLucky === true,
      `=${fairyLucky} state=${JSON.stringify(out.detail.fairy)}`);
    A('⑦checkToSpawnUndergroundFairy luck=0 → false（基线）', fairyPlain === false, `=${fairyPlain}`);
  }

  // ============================================================
  // ⑥ 地牢幽魂（实机击杀链：门全开 + luck=+1 → 288 出魂）
  // ============================================================
  {
    const f = g.world.flags;
    const oldHM = f.hardMode, oldPlant = f['downed_262'];
    f.hardMode = true;
    f['downed_262'] = true;
    if (g.scene) g.scene.zoneDungeon = true;
    setLuck(1);
    // 地牢墙（7/8/9/94-99 任一）铺玩家脚下 5×5,怪/墙同格
    const wx = Math.floor(g.player.cx / 16);
    const wy = Math.floor(g.player.cy / 16);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      st.setWallSilent(wx + dx, wy + dy, 7);
    }
    const spirits = () => g.entities.enemies.filter((e) => e.vanillaId === 288 && !e.dead).length;
    const base = spirits();
    let kills = 0;
    for (let i = 0; i < 150; i++) {
      const e = g.spawnNpcByVanilla(82, wx * 16, wy * 16);
      if (!e) continue;
      e.maxHp = 200;             // ctx.lifeMax>100 门
      e.def.value = 100;         // ctx.value>0 门
      e.def.damage = 60;         // ctx.damage>0 门
      e.hp = 200;
      e.hurt(1e9, 0, 0, g);      // 死亡结算 → DoDeathEvents_SummonDungeonSpirit
      kills++;
    }
    const delta = spirits() - base;
    setLuck(null);
    f.hardMode = oldHM; f['downed_262'] = oldPlant;
    // P(288|kill) luck=+1≈0.118 → 150 杀期望 ~17,P(0)≈2e-8
    A('⑥地牢墙内击杀（luck=+1）→ 幽魂 288 实机生成', delta > 0, `kills=${kills} spirits=${delta}`);
  }

  // 还原 luck 覆写（删除实例属性 → 回到原型 getter）
  delete g.player.luck;
  luckOverride = null;
  return out;
});

let failed = 0;
for (const a of result.asserts) {
  console.log(`[${a.ok ? 'PASS' : 'FAIL'}] ${a.name}${a.detail ? ' — ' + a.detail : ''}`);
  if (!a.ok) failed++;
}
console.log('detail:', JSON.stringify(result.detail));
await browser.close();
if (failed > 0) {
  console.error(`[luck-consumers] ${failed} 断言未过`);
  process.exit(1);
}
console.log('[luck-consumers] all green');

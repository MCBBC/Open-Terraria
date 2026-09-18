// BJ122 2026-09-18【bound NPC 移动语义 + despawn 语义 1:1 实证落刀】
// 定谳（反编译 1457 直读，1458 同行同文零漂移）：
// 【移动环】105/106/123/354/589 = aiStyle 0（NPC.cs:10271/:10285/:10521/:13530/:16680，
//   friendly/非 townNPC）——AI_000（:19871-19977）只做 TargetClosest+spriteDirection
//   （:19813-19816）+vx*=0.93 衰减（:19971-19975），无走路面；重力=UpdateNPC 全局段
//   （:91578-91586）照落 → 原版=站桩面向玩家（BJ117 断言对此族成立）。
//   685 BoundTownSlimeOld = aiStyle 1（:17641-17655）走 AI_001_Slimes 跳跃机：
//   init ai0=-100/ai2=1（:62115-62119）、贴地 ai0 每 tick +1（flag3 再 +1 :61964-68）、
//   阶段表 num54=-1000（:62017-62040）→ 小跳(vy-6,vx+2dir)/大跳(vy-8,vx+3dir)、
//   685 特支 vy×0.5/vx×0.2+1/2 概率反向（:62287-62294）→ 原版被缚老史莱姆【会蹦】
//   （用户质疑"原版会走动"对 685 成立；对 105/106/123 不成立）。
// 【despawn 环·用户观测 2 核心】CheckActive（:78698-78810）豁免面=townNPC +
//   DoesntDespawnToInactivity（:78612-78678，含四塔 422/493/507/517 等）——被缚族
//   两面皆无 → 照走四步：activeRange 盒（4032/2520 半幅 :6176-6178）出界即消/
//   屏幕盒（960+w/600+h :78691-93）续 timeLeft=750（:6188）/归零强翻假（:78791-94）
//   → noSpawnCycle+active=false（:78795-78808）；savedXxx 旗只写于 Transform 侧
//   （:53492-53510），消散不触 → !AnyNPCs+!savedXxx 重刷门复开（wiki"走远消失+
//   新位置重生"）。存档面：SaveNPCs（WorldFile.cs:1724）只写 townNPC、
//   SavesAndLoads（NPCID.cs:4807）=仅四塔 → 被缚族不入档。
//   ★本仓此前 bound TownNPC 永不消散+入档=偏差：早期刷出的 105/106 钉死老位置
//   （用户存档实测 106@(3272,1564)/105@(1245,717)），!AnyNPCs 唯一门永久关闭 →
//   其它区域永远无新刷 → "地下呆很久也没遇到"。
// 【观测 3】生命体分析仪（accCritterGuide）原版扫 Main.npc 全表 rarity 择优
//   （Main.cs:47776-47799，无 bound 排除门；105/106/123/354/589 rarity=1、685=2）
//   → 原版可见；本仓扫描池缺 npcs 桶 = 漏检，本刀补。
// 本测试锁：移动环（站桩/跳跃/弱跳幅）/despawn 四步（几何门/计时门/旗不触/
// noSpawnCycle）/存档排除/分析仪覆盖。变异接缝见各 it 注。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Game } from '../src/core/Game';
import { npcRarityOf } from '../src/data/vanillaNpcs';
import { InfoAccsLayer } from '../src/render/InfoAccsLayer';

const DIRT = TILE_BY_KEY['dirt']!;
const FLOOR_ROW = 100;

function flatWorld(): World {
  const world = new World(200, 200, 100, 'bj122-bound');
  for (let x = 10; x <= 190; x++) world.store.setTileSilent(x, FLOOR_ROW, DIRT);
  return world;
}

/** 实机桩（同 townnpc-adversarial 家族：真 World + 可编程玩家） */
function makeGame(world: World, playerPos: { x: number; y: number }, dead = false) {
  const game = {
    world,
    player: {
      x: playerPos.x, y: playerPos.y, w: 20, h: 42,
      cx: playerPos.x + 10, cy: playerPos.y + 21, dead,
      vx: 0, vy: 0,
    },
    enemies: () => [],
    npcs: () => [],
    critters: () => [],
    projectiles: () => [],
    spawnTownShot: () => {},
    spawnParticles: () => {},
    spawnBurst: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    addDamageNumber: () => {},
  } as never;
  return game;
}

/** 放一只 bound TownNPC 在 FLOOR_ROW 上（y=脚底锚） */
function placeBound(key: string, tileX: number): TownNPC {
  const n = new TownNPC(key, tileX * TILE + 8, FLOOR_ROW * TILE);
  n.bound = true;
  return n;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BJ122 移动环：aiStyle0 被缚族（105/106/123）站桩', () => {
  it('玩家在旁 600t 位置零漂移（摘走路面/速度错 → 本组不变,跳跃组变）', () => {
    const world = flatWorld();
    const px = 100 * TILE;                       // 玩家站 NPC 左侧 2 格
    const g = makeGame(world, { x: px, y: (FLOOR_ROW - 3) * TILE });
    const npcs = [placeBound('goblin_tinkerer', 103), placeBound('wizard', 107), placeBound('mechanic', 111)];
    for (const n of npcs) {
      for (let t = 0; t < 600; t++) n.fixedUpdate(1 / 60, g);
      // 落地后（前 ~30t 内落定）位置恒定：x 精确不变（原版 aiStyle0 无水平位移）
      const before = { x: n.x, y: n.y };
      for (let t = 0; t < 120; t++) n.fixedUpdate(1 / 60, g);
      expect(n.x).toBe(before.x);
      expect(n.y).toBe(before.y);
    }
  }, 60000);

  it('面向玩家（TargetClosest+spriteDirection :19813-19816）：玩家换边 facing 跟随', () => {
    const world = flatWorld();
    const g = makeGame(world, { x: 96 * TILE, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('goblin_tinkerer', 103);
    for (let t = 0; t < 30; t++) n.fixedUpdate(1 / 60, g);
    expect(n.facing).toBe(-1);                    // 玩家在左
    const g2 = makeGame(world, { x: 110 * TILE, y: (FLOOR_ROW - 3) * TILE });
    for (let t = 0; t < 30; t++) n.fixedUpdate(1 / 60, g2);
    expect(n.facing).toBe(1);                     // 玩家在右
  }, 60000);
});

describe('BJ122 移动环：685 被缚老史莱姆 AI_001 跳跃机', () => {
  it('会蹦：600t 内多次起跳（变异①摘跳跃机 → totalPath=0 → 红）', () => {
    const world = flatWorld();
    const g = makeGame(world, { x: 100 * TILE, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('town_slime_old', 103);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // 恒不反向（floor(0.9*2)=1）
    let path = 0;
    let hops = 0;
    let airborne = false;
    for (let t = 0; t < 600; t++) {
      const pre = { x: n.cx, vy: n.vy };
      n.fixedUpdate(1 / 60, g);
      path += Math.abs(n.cx - pre.x);
      if (!airborne && n.vy < 0) { airborne = true; hops++; }
      if (n.vy === 0) airborne = false;
    }
    expect(hops).toBeGreaterThanOrEqual(6);        // 节奏 ~50-60t/跳（init -100 → 50t 首跳）
    expect(path).toBeGreaterThan(60);              // 每跳 ~10-45px（含空中转向）
  }, 60000);

  it('弱跳幅（685 特支 vy×0.5/vx×0.2 :62287-62294；变异②摘乘区 → 单跳幅翻倍+ → 红）', () => {
    const world = flatWorld();
    const g = makeGame(world, { x: 100 * TILE, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('town_slime_old', 103);
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // 恒不反向——单跳几何稳定
    let maxPerTick = 0;
    let maxAirVy = 0;
    let airTicks = 0;
    for (let t = 0; t < 900; t++) {
      const pre = { x: n.cx, vy: n.vy };
      n.fixedUpdate(1 / 60, g);
      if (pre.vy < 0 || n.vy < 0) {
        airTicks++;
        maxPerTick = Math.max(maxPerTick, Math.abs(n.cx - pre.x));
        maxAirVy = Math.max(maxAirVy, Math.abs(Math.min(0, pre.vy)));
      }
    }
    expect(airTicks).toBeGreaterThan(60);          // 确实离过地
    // 弱跳：vy=-3（大跳 -4）、vx 峰值受 ×0.2 起点+空中 +0.2/t 空中转向钳 3、
    // 空中 ~20t（vy -3/g0.3）→ 单 tick 位移 ≤3、腾空总距有限。
    // 摘 ×0.5/×0.2（变异②）：vy=-6/-8 → 空中 40t+、vx 起点 2-3 → 单跳距 ~110px+
    // → per-tick 不变但总距翻倍;此处锁 [vy 峰] 与 [单跳横向] 双界
    expect(maxAirVy).toBeLessThanOrEqual(4.5);     // 弱跳 -3/-4（全力量 -6/-8）
    // 单跳横向距离：从离地到落地累计 |Δx| ≤ 60px（全力量 ≥90px）
    let hopDist = 0;
    let maxHopDist = 0;
    let inAir = false;
    for (let t = 0; t < 900; t++) {
      const pre = n.cx;
      n.fixedUpdate(1 / 60, g);
      if (!inAir && n.vy !== 0) { inAir = true; hopDist = 0; }
      if (inAir) {
        hopDist += Math.abs(n.cx - pre);
        if (n.vy === 0) { inAir = false; maxHopDist = Math.max(maxHopDist, hopDist); }
      }
    }
    expect(maxHopDist).toBeGreaterThan(8);         // 确实有水平位移的跳
    expect(maxHopDist).toBeLessThanOrEqual(70);    // 弱跳上界（大跳 vy-4≈65px 实测 62.4;
                                                   // 变异②摘乘区 → vy-6/-8 全力量 ≥110px）
  }, 60000);
});

describe('BJ122 despawn 环：CheckActive 四步（用户观测 2 核心）', () => {
  it('玩家出 activeRange 盒（4032px 半幅）→ 当帧消散 + noSpawnCycle 置位（原版 :78795-78808）', () => {
    const world = flatWorld();
    // 玩家放 4100px 外（>4032 半幅 → flag2 恒假）
    const g = makeGame(world, { x: 100 * TILE + 4100, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('goblin_tinkerer', 100);
    n.fixedUpdate(1 / 60, g);
    expect(n.dead).toBe(true);
    expect((g as unknown as { noSpawnCycleThisFrame: boolean }).noSpawnCycleThisFrame).toBe(true);
  }, 60000);

  it('activeRange 内但离屏 → timeLeft 倒数 750t 后消散（:78691-78794 归零强翻假）', () => {
    const world = flatWorld();
    // 2000px：activeRange（4032）内保命、屏幕盒（960+w）外 → timer 750 起倒
    const g = makeGame(world, { x: 100 * TILE + 2000, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('wizard', 100);
    let ticks = 0;
    while (!n.dead && ticks < 800) { n.fixedUpdate(1 / 60, g); ticks++; }
    expect(n.dead).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(749);     // 恰在 750t 窗口消散
    expect(ticks).toBeLessThanOrEqual(752);
  }, 60000);

  it('屏内持续在场 → 不消散（存活门①②）;旗不触（savedXxx 只写于 Transform 侧）', () => {
    const world = flatWorld();
    world.flags['savedGoblin'] = false;
    const g = makeGame(world, { x: 100 * TILE + 300, y: (FLOOR_ROW - 3) * TILE });
    const n = placeBound('goblin_tinkerer', 100);
    for (let t = 0; t < 900; t++) n.fixedUpdate(1 / 60, g);
    expect(n.dead).toBe(false);
    expect(world.flags['savedGoblin']).toBe(false);
  }, 60000);
});

describe('BJ122 存档面：被缚族不入档（WorldFile.cs:1724 只写 townNPC）', () => {
  it('townNpcsForSave 滤除一切 bound（含 534 痛苦亡魂态）,获救态保留（红蓝-H③回写闭合）', () => {
    const g = Object.create(Game.prototype) as unknown as {
      entities: { npcs: unknown[] };
      clearDuplicateHomes(s: string, w: boolean): void;
      townNpcsForSave(): Array<{ key: string; bound?: boolean; vanillaId?: number }>;
    };
    const mk = (key: string, bound: boolean, vanillaId: number) => {
      const n = new TownNPC(key, 100 * TILE, FLOOR_ROW * TILE);
      n.bound = bound;
      n.vanillaId = vanillaId;
      return n;
    };
    g.entities = { npcs: [
      mk('guide', false, 22),
      mk('goblin_tinkerer', true, 107),
      mk('wizard', true, 108),
      mk('town_slime_old', true, 679),
      // ★红蓝-H③ 勘误重锚：534=痛苦亡魂（SetDefaults :15841 aiStyle 3,无 townNPC/
      //  friendly）——原版同不入档;旧断言「534 照常入档」与反编译相悖,系
      //  自愈不闭合病灶（旧档 bound 条目永久回写）。获救态 441（townNPC :14732）保留。
      mk('tax_collector', true, 534),
      mk('tax_collector', false, 441),
      mk('merchant', true, 17),            // 无 BOUND_TOWN_NPC_ID 映射键的 bound 同滤
                                           // （vanilla 语义=被缚态恒非 townNPC 型,封同族洞）
    ] };
    g.clearDuplicateHomes = () => {};
    const out = g.townNpcsForSave();
    const keys = out.map((n) => n.key).sort();
    expect(keys).toEqual(['guide', 'tax_collector']);
    // 获救态无 bound 标随档
    expect(out.find((n) => n.key === 'tax_collector')?.bound).toBeUndefined();
  }, 60000);
});

describe('BJ122 观测 3：生命体分析仪覆盖被缚族（Main.cs:47776 全表扫描）', () => {
  // ★红蓝-H② 重锚（2026-09-18）：旧测试手喂 vanillaId 105/685——「真值域幻影」,
  //  运行时 bound TownNPC 实体携【城镇】id（TownNPC ctor TOWN_NPC_IDS[key].id）,
  //  旧喂法不经运行时域=恒真空转。今喂真实体经 Game.boundAnalyzerVid 投影
  //  （与 Game.tickInfoAccs 同一单源）——城镇 id 进、绑缚本体 id 出（rarity/名
  //  同域 :10283/:10534/:15855/:17653…）。变异接缝：boundAnalyzerVid 摘反查
  //  （直接回 vanillaId）→ 本组 vanillaId 断言+分析仪可见面双红。
  it('boundAnalyzerVid 运行时域投影：城镇 id → 绑缚本体 id（105/106/123/354/376/534/579/589/685/686）', () => {
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'goblin_tinkerer', vanillaId: 107 })).toBe(105);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'wizard', vanillaId: 108 })).toBe(106);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'mechanic', vanillaId: 124 })).toBe(123);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'stylist', vanillaId: 353 })).toBe(354);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'angler', vanillaId: 369 })).toBe(376);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'tax_collector', vanillaId: 441 })).toBe(534);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'tavernkeep', vanillaId: 550 })).toBe(579);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'golfer', vanillaId: 588 })).toBe(589);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'town_slime_old', vanillaId: 679 })).toBe(685);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'town_slime_clumsy', vanillaId: 680 })).toBe(686);
    // 非 bound/无映射键/空 id → 原样（城镇型 rarity=0=原版同相不显）
    expect(Game.boundAnalyzerVid({ bound: false, npcKey: 'mechanic', vanillaId: 124 })).toBe(124);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'merchant', vanillaId: 17 })).toBe(17);
    expect(Game.boundAnalyzerVid({ bound: true, npcKey: 'merchant', vanillaId: null })).toBeNull();
  }, 60000);

  it('npcs 桶入池（运行时域）：真 bound 实体投影后 123（rarity1）/685（rarity2）可见,名域随本体 id', () => {
    const layer = new InfoAccsLayer();
    const player = {
      accThirdEyeCounter: 0, accCritterGuideCounter: 0,
      accThirdEyeNumber: 0, accCritterGuideText: null as string | null,
      accCritterGuideVid: null as number | null,
      speedSlice: new Float32Array(60), vx: 0, vy: 0,
    };
    const rarityOf = (vid: number | null) => npcRarityOf(vid);
    // 名域判别：桩只认【本体 id】（124/679 进来即 null→被 `!nm continue` 吞）
    const nameOf = (vid: number | null) => vid === 123 ? '受缚机械师' : vid === 685 ? '老旧摇摇箱' : null;
    // 运行时域装配：真 TownNPC（ctor 携城镇 id）× Game.tickInfoAccs 同款投影
    const runtimePool = (...ns: TownNPC[]) => ns.map((n) => {
      const bid = Game.boundAnalyzerVid(n);
      return bid === n.vanillaId ? n : { dead: n.dead, cx: n.cx, cy: n.cy, vanillaId: bid };
    });
    const mech = placeBound('mechanic', 30);      // vanillaId=124（城镇 id）
    const slime = placeBound('town_slime_old', 60); // vanillaId=679
    mech.x = 500 - mech.w / 2; mech.y = -mech.h / 2;   // cx=500/cy=0（cx/cy 只读 getter）
    slime.x = 900 - slime.w / 2; slime.y = -slime.h / 2; // cx=900/cy=0
    layer.tick(player, [], [], runtimePool(mech, slime) as never, 0, 0, () => false,
      rarityOf, nameOf, (vx) => Math.abs(vx),
      { accThirdEye: false, accCritterGuide: true, accStopwatch: false });
    // 685 rarity=2 > 123 rarity=1 → 择优 685（原版 num12/rarity 择优 :47780-47782）
    expect(player.accCritterGuideText).toBe('老旧摇摇箱');
    expect(player.accCritterGuideVid).toBe(685);
    // 池契约直喂（投影后形状）：GivenOrTypeName（:47796）given 优先——direct 喂
    //  vanillaId 123 非幻影（=投影产物域,映射本身由上一 it 锁死）
    const layer2 = new InfoAccsLayer();
    const player2 = { ...player, accCritterGuideCounter: 0, accCritterGuideText: null, accCritterGuideVid: null };
    layer2.tick(player2, [], [], [
      { dead: false, cx: 100, cy: 0, vanillaId: 123, givenName: 'Nort' },
    ], 0, 0, () => false, rarityOf, nameOf, (vx) => Math.abs(vx),
      { accThirdEye: false, accCritterGuide: true, accStopwatch: false });
    expect(player2.accCritterGuideText).toBe('Nort');
    // 被缚态 givenName 压制：bound 实体 ctor 预派名不得胜出（原版被缚者无名）。
    // 预派名钉死注入（ctor 的 newNpcName 依赖 l10n 运行时,测试环境随机池空——
    // 真机上 mechanic 有 MechanicNames 池,实体名恒非空）
    mech.givenName = 'Nort';
    const layer3 = new InfoAccsLayer();
    const player3 = { ...player, accCritterGuideCounter: 0, accCritterGuideText: null, accCritterGuideVid: null };
    layer3.tick(player3, [], [], runtimePool(mech) as never, 0, 0, () => false,
      rarityOf, nameOf, (vx) => Math.abs(vx),
      { accThirdEye: false, accCritterGuide: true, accStopwatch: false });
    expect(player3.accCritterGuideText).toBe('受缚机械师');   // 投影不带 given → 'Nort' 不得胜出
  }, 60000);

  it('rarity 表锁：105/106/123/354/376/579/589=1、534/685/686/687=2（SetDefaults 直读值）', () => {
    expect(npcRarityOf(105)).toBe(1);
    expect(npcRarityOf(106)).toBe(1);
    expect(npcRarityOf(123)).toBe(1);
    expect(npcRarityOf(354)).toBe(1);
    expect(npcRarityOf(376)).toBe(1);
    expect(npcRarityOf(579)).toBe(1);
    expect(npcRarityOf(589)).toBe(1);
    expect(npcRarityOf(534)).toBe(2);
    expect(npcRarityOf(685)).toBe(2);
    expect(npcRarityOf(686)).toBe(2);
    expect(npcRarityOf(687)).toBe(2);
    // 城镇型真值域=0（旧表捏造 107/108/353/588=1 已清洗）
    expect(npcRarityOf(107)).toBe(0);
    expect(npcRarityOf(108)).toBe(0);
    expect(npcRarityOf(353)).toBe(0);
    expect(npcRarityOf(588)).toBe(0);
    expect(npcRarityOf(441)).toBe(0);
  }, 60000);
});

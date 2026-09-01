// 城镇 NPC 坐姿 + 微光转化链 + 风暴门回归（AI_007 ai[0]==5 族 + ai[0]==25 上升态）。
// 标杆（Terarria1456/Terraria）：
//  - 入座 AI_007_TryForcingSitting NPC.cs:53264-53287（椅格=落座地面格上一行、
//    style 27 排除 frameY∈[1080,1098]、占位互斥、ai[1]=900+rand(10800)、
//    direction=frameX!=0?1:-1、Bottom=(x*16+8+2*dir, y*16)）
//  - 扫椅 AI_007_FindGoodRestingSpot :53195-53262（±7 列 × 行 {+2,0,-2,-4,-6}、
//    |dx|+|dy| 最小、下格(frameY%40!=0) 先 -1 再 +2）
//  - 态推进 :54682-54710（vx×0.8、ai[1]--、椅没了 ai[1]=0 起身、时限起身）
//  - 坐姿与攻击互斥：触发门 flag31 的 ai[0]<2（:55621）不含 5
//  - shimmerTransparency（★1457 锚行校准）：+0.01/t（:92636）、>0.9 转化
//    （:92637-39）、转化置 0.89（:92705）、上升态 −1/60（:53770）、justHit −0.1
//    （:92650）、常规 −0.001（:92658）；消费 = GetAlpha :94874（本体）+
//    Main.cs:25771-25776（160 Glow）
//  - 坐姿落盘：WorldFile.SaveNPCs :1703-1750 / LoadNPCs :2883-2930 **无 ai[]**
//    ——ai[0]==5/ai[1] 坐姿态不随存档持久，读档站立、夜间 AI 自然重坐
//  - ai[0]==25 上升态 :53737-53820：落点传送 :53752-55/:56130-49、ai[1]≥30 起
//    −1/60 + velocity.Y=−4×st :53765-76、收尾变体翻转 :53814（双向）、
//    ShimmerTownNPC 粒子 + 成就 43（:53816-24）
//  - 风暴门 :53399-53402：Main.IsItStorming（= _shouldUseStormMusic，迟滞机
//    Main.cs:12927-12960，阈值 0.34/0.4/0.4/0.5 见 :66137-66140）且
//    position.Y/16 < worldSurface
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot } from '../src/entities/TownShot';
import {
  findChairSpot, canSitAt, isSitTile, chairFacing, sittingAnchor,
  SIT_TIME_BASE, SIT_TIME_RAND,
  sittingHatY, SITTING_HAT_OFFSET_Y, SITTING_HAT_OFFSET_Y_DEFAULT,
  shimmerTransparencyNext, shimmerBodyAlpha, shimmerGlowAlpha,
  SHIMMER_ST_RAMP, SHIMMER_ST_TRANSFORM, SHIMMER_ST_RISE,
  SHIMMER_ST_DECAY_RISE, SHIMMER_ST_DECAY_HIT, SHIMMER_ST_DECAY_IDLE,
  SHIMMER_RISE_VELOCITY_TICK, SHIMMER_RISE_END_TICK,
  SHIMMER_RISE_PAUSE, SHIMMER_RISE_TELEPORT_DIST,
  remapClamped, isItStormingNext,
} from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';
import { saveGame, loadSave } from '../src/save/SaveFile';

const CHAIR = TILE_BY_KEY['chair']!;            // sheet 15
const TOILET = TILE_BY_KEY['v_497_toilets']!;   // sheet 497
const DIRT = TILE_BY_KEY['dirt']!;
const FLOOR = 100;                              // 地面行（实心）
const SPOT_X = 110;                             // 椅子列
/** 落座格中心像素（110*16+8）；NPC 生成 x = 中心 − w/2（与回家传送同式） */
const spotCenter = (x: number) => x * 16 + 8;

function makeGame(world: World, extra: Partial<{
  enemies: unknown[]; npcs: unknown[];
}> = {}) {
  const shots: TownShot[] = [];
  /** 演出调用计数（ai[0]==25 上升态断言用） */
  const fx = {
    bursts: 0, particles: 0, sfx: [] as string[],
    achievements: [] as number[],
  };
  return {
    shots,
    fx,
    game: {
      world,
      // ★RV3 集成审查：银河珍珠批新增存档字段 luckState.usedGalaxyPearl——
      // 手搓 player 桩须补 luckState（读档链 SaveFile:119 读取）
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true, luckState: { usedGalaxyPearl: false } },
      enemies: () => extra.enemies ?? [],
      npcs: () => extra.npcs ?? [],
      critters: () => [],
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: (_x: number, _y: number, _c: string, count?: number) => { fx.particles += count ?? 1; },
      spawnBurst: (_x: number, _y: number, _c: string, count?: number) => { fx.bursts += count ?? 1; },
      playSfx: (name: string) => { fx.sfx.push(name); },
      playSfxFiles: () => {},
      addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: (id: number) => { fx.achievements.push(id); } },
    } as never,
  };
}

/** 地面 + 一把 1x2 椅（上格 frameY=style*40、下格 +18；frameX 0/18 = 朝左/右） */
function makeWorld(opts: { chair?: boolean; style?: number; frameX?: number; at?: number } = {}) {
  const world = new World(200, 200, 100, 'sit-test');
  const st = world.store;
  for (let x = 20; x <= 180; x++) st.setTileSilent(x, FLOOR, DIRT);
  if (opts.chair !== false) {
    const cx = opts.at ?? SPOT_X;
    const style = opts.style ?? 0;
    st.setTileSilent(cx, FLOOR - 2, CHAIR, opts.frameX ?? 0, style * 40);
    st.setTileSilent(cx, FLOOR - 1, CHAIR, opts.frameX ?? 0, style * 40 + 18);
  }
  world.clock.timeOfDay = 0;   // 午夜 → 夜（flag 窗口）
  return world;
}

describe('坐姿纯函数（FindGoodRestingSpot / TryForcingSitting）', () => {
  it('可坐格族 = 椅 15 + 马桶 497（CanBeSatOnForNPCs TileID.cs:211；无他族）', () => {
    expect(isSitTile(CHAIR)).toBe(true);
    expect(isSitTile(TOILET)).toBe(true);
    expect(isSitTile(DIRT)).toBe(false);
    expect(isSitTile(0)).toBe(false);
    // 王座(sheet 102)/长凳(sheet 89) 不在 NPC 可坐集
    expect(isSitTile(TILE_BY_KEY['v_102_throne']!)).toBe(false);
    expect(isSitTile(TILE_BY_KEY['bench']!)).toBe(false);
  });

  it('坐下门：椅 style 27 排除（frameY∈[1080,1098]），马桶无门（:53273-53275）', () => {
    expect(canSitAt(CHAIR, 18)).toBe(true);        // style 0 下格
    expect(canSitAt(CHAIR, 0)).toBe(true);         // style 0 上格
    expect(canSitAt(CHAIR, 1078)).toBe(true);      // style 26 上格
    expect(canSitAt(CHAIR, 1100)).toBe(true);      // style 27+1 上格
    expect(canSitAt(CHAIR, 1080)).toBe(false);     // style 27 上格
    expect(canSitAt(CHAIR, 1098)).toBe(false);     // style 27 下格（1080+18）
    expect(canSitAt(TOILET, 1090)).toBe(true);     // 马桶不吃 style 门
    expect(canSitAt(DIRT, 0)).toBe(false);
  });

  it('朝向/锚点（:53284-53286）：frameX!=0 → 1；Bottom=(x*16+8+2*dir, y*16)', () => {
    expect(chairFacing(0)).toBe(-1);
    expect(chairFacing(18)).toBe(1);
    expect(sittingAnchor(110, 100, -1)).toEqual({ x: 110 * 16 + 6, y: 100 * 16 });
    expect(sittingAnchor(110, 100, 1)).toEqual({ x: 110 * 16 + 10, y: 100 * 16 });
    // 入座时长常量（:53283）
    expect(SIT_TIME_BASE).toBe(900);
    expect(SIT_TIME_RAND).toBe(10800);
  });

  it('扫椅：±7 列窗口、|dx|+|dy| 最小、归一到落座地面行（:53195-53262）', () => {
    const st = makeWorld().store;
    // home.y = 站格（地面行 −1，Housing 口径）；向下找地面 → 行 100
    expect(findChairSpot(st, SPOT_X, FLOOR - 1)).toEqual({ x: SPOT_X, y: FLOOR });
    // 7 列内可扫到（|117-110|=7 ∈ 窗口）
    const far = makeWorld({ at: 117 }).store;
    expect(findChairSpot(far, SPOT_X, FLOOR - 1)).toEqual({ x: 117, y: FLOOR });
    // 8 列外扫不到
    const tooFar = makeWorld({ at: 118 }).store;
    expect(findChairSpot(tooFar, SPOT_X, FLOOR - 1)).toBeNull();
    // 无椅 → null
    expect(findChairSpot(makeWorld({ chair: false }).store, SPOT_X, FLOOR - 1)).toBeNull();
    // 下格归一分支（frameY%40!=0 → 先 −1 再 +2，:53249-53252）：隔壁列地面行上放
    // "下格"帧（frameY=18），恰落在偶数扫行 → spot = 该格 −1+2 = 地面行 +1
    const st2 = makeWorld({ chair: false }).store;
    st2.setTileSilent(111, FLOOR, CHAIR, 0, 18);
    expect(findChairSpot(st2, SPOT_X, FLOOR - 1)).toEqual({ x: 111, y: FLOOR + 1 });
  });
});

describe('坐姿状态机（fixedUpdate 集成）', () => {
  it('夜间站上落座格 → 坐下（锚点/朝向 1:1）', () => {
    const world = makeWorld();   // frameX=0 → 朝左
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.facing).toBe(-1);                          // frameX==0 → 朝左（:53284）
    expect(npc.cx).toBe(SPOT_X * 16 + 6);                 // Bottom.X = x*16+8+2*dir
    expect(npc.y + npc.h).toBe(FLOOR * 16);               // Bottom.Y = 地面行顶
    // 坐姿计时窗口（:53283）
    expect(npc.sitting).toBe(true);
  });

  it('椅子 frameX=18（flip 档）→ 朝右坐', () => {
    const world = makeWorld({ frameX: 18 });
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    expect(npc.facing).toBe(1);
    expect(npc.cx).toBe(SPOT_X * 16 + 10);
  });

  it('白天不走夜椅路径（FindGoodRestingSpot :53209-53212 白天早退；随机坐椅路另见 townnpc-behavior）', () => {
    const world = makeWorld();
    world.clock.timeOfDay = 0.5;   // 正午
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    // 行走随机坐椅（NPC.cs:55774-55814 rand(300)）掷骰接管不中——隔离"回家路径"变量
    const realRandom = Math.random;
    Math.random = () => 0.999;
    try {
      for (let t = 0; t < 300; t++) npc.fixedUpdate(1 / 60, game);
    } finally {
      Math.random = realRandom;
    }
    expect(npc.sitting).toBe(false);
  });

  it('椅子被拆 → 立即起身（:54691-54697 椅格非椅 → ai[1]=0）', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    world.store.setTileSilent(SPOT_X, FLOOR - 2, 0);
    world.store.setTileSilent(SPOT_X, FLOOR - 1, 0);
    for (let t = 0; t < 3; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(false);
  });

  it('对话打断坐姿（:53738 talkNPC 命中 → ai[0]=5 归 0）', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    npc.talking = true;
    npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(false);
  });

  it('占位互斥（:53278-53286）：同椅只坐一个', () => {
    const world = makeWorld();
    const a = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    const b = new TownNPC('merchant', spotCenter(108) - 10, FLOOR * 16);
    a.home = { x: SPOT_X, y: FLOOR - 1 };
    b.home = { x: SPOT_X, y: FLOOR - 1 };
    const both = [a, b];
    const { game } = makeGame(world, { npcs: both });
    for (let t = 0; t < 240; t++) for (const n of both) n.fixedUpdate(1 / 60, game);
    expect(both.filter((n) => n.sitting).length).toBe(1);
  });

  it('坐姿 vs 危险：敌近被拽起逃跑（原版 ai[0]==5 不在扫描豁免列 :53990-54024）+ 站定恢复还击', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    // 敌后入场（敌在场时危险扫描每刻拽起——先坐稳再加敌）
    const foes: unknown[] = [];
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: foes });
    // ★2026-09-01 坐姿修正批：回家传送（TeleportToHome :56211）触发门含「双视野
    // 矩形均无活玩家」——玩家死亡/远遁时夜间逃离一离开 resting 精确同格即被拽回
    // （原版语义成立，本仓 1:1）。本用例考察【可见场景】的逃离/还击物理,须给活
    // 玩家把双矩形视野门关上（2044×1278 门,NPC/家两锚点均需覆盖）;脱离视野门的
    // 拽回语义由文件尾「回家传送 grounding」专用回归锁定。
    (game as unknown as { player: unknown }).player =
      { x: 150 * 16, y: 90 * 16, w: 20, h: 42, dead: false };
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    // 敌在右侧 ~84px（< PrettySafe 200）→ 次刻拽起背向左逃（2026-08-17 接危险扫描）
    const enemy = { x: 115 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    foes.push(enemy);
    npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(false);
    const x0 = npc.cx;
    // ★2026-08-31 对齐批④口径加固：注入实例 rng 屏蔽攻击门随机性——原写法裸跑时
    // 攻击门(实例缺省挂全局 Math.random)可能在逃逸窗内偶发入态造成站定停顿,
    // 使「180t 内 ≥16px」断言 ~50% 抖红(已知抖动族归因)。确定性注入后断言语义不变。
    npc.rng = () => 0.999;
    for (let t = 0; t < 180; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.cx).toBeLessThan(x0 - 16);   // 已向左逃出 ≥1 格（含还击停顿窗口）
    // 站定后还击恢复（flag31 只挡 ai[0]==5 本身——起身即打）
    npc.rng = () => Math.random();          // 还击阶段恢复真实随机面
    let fired = false;
    for (let t = 0; t < 1500 && !fired; t++) {
      enemy.x = npc.cx + 6 * 16;   // 贴身追踪防逃出 PrettySafe
      npc.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('拆椅起身 → 站定恢复攻击（椅没了 ai[1]=0 立即起身 :54691-54697）', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const foes: unknown[] = [];
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: foes });
    // ★2026-09-01 坐姿修正批：同上——视野门内考察还击物理(否则夜间远离锚点瞬移
    //  语义合法地反复打断战斗序;落地风暴回归见文件尾专用用例)
    (game as unknown as { player: unknown }).player =
      { x: 150 * 16, y: 90 * 16, w: 20, h: 42, dead: false };
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    // 拆椅 + 敌入场（拆椅与危险同帧——椅没了即起身，攻击门不再被坐姿挡）
    world.store.setTileSilent(SPOT_X, FLOOR - 2, 0);
    world.store.setTileSilent(SPOT_X, FLOOR - 1, 0);
    const enemy = { x: 115 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    foes.push(enemy);
    let fired = false;
    for (let t = 0; t < 1500 && !fired; t++) {
      enemy.x = npc.cx + 6 * 16;
      npc.fixedUpdate(1 / 60, game);
      if (shots.length) fired = true;
    }
    expect(fired).toBe(true);
  });
});

describe('帽 Y 修正链（Main.cs:26965-26987 num6）', () => {
  it('值表 1:1（默认 −4；637 −12 / 663 −8 / 38 −8 / 124 −2 / 108·178 −6）', () => {
    expect(SITTING_HAT_OFFSET_Y).toEqual({ 38: -8, 124: -2, 108: -6, 178: -6, 637: -12, 663: -8 });
    expect(SITTING_HAT_OFFSET_Y_DEFAULT).toBe(-4);
    expect(sittingHatY(637)).toBe(-12);
    expect(sittingHatY(663)).toBe(-8);
    expect(sittingHatY(38)).toBe(-8);
    expect(sittingHatY(124)).toBe(-2);
    expect(sittingHatY(108)).toBe(-6);
    expect(sittingHatY(178)).toBe(-6);
    expect(sittingHatY(22)).toBe(-4);    // 缺省
    expect(sittingHatY(550)).toBe(-4);   // 原版显式列 −4 = 默认值
    expect(sittingHatY(588)).toBe(-4);
  });
});

describe('shimmerTransparency（NPC.cs:92631-62/:53770——1457 锚行校准）', () => {
  it('推进纯函数：浸没 +0.01 cap 1；rise/justHit/常规三档衰减', () => {
    expect(SHIMMER_ST_RAMP).toBe(0.01);
    expect(SHIMMER_ST_TRANSFORM).toBe(0.9);
    expect(SHIMMER_ST_RISE).toBe(0.89);
    expect(SHIMMER_ST_DECAY_RISE).toBeCloseTo(1 / 60, 10);
    expect(SHIMMER_ST_DECAY_HIT).toBe(0.1);
    expect(SHIMMER_ST_DECAY_IDLE).toBe(0.001);
    // 浸没 ramp
    expect(shimmerTransparencyNext(0, true, false, false)).toBeCloseTo(0.01, 10);
    expect(shimmerTransparencyNext(0.995, true, false, false)).toBe(1);      // cap
    // rise 抑制 ramp（GetShimmered 摘 buff 353 :92570-92573）
    expect(shimmerTransparencyNext(0.89, true, false, true)).toBeCloseTo(0.89 - 1 / 60, 10);
    // 衰减三档
    expect(shimmerTransparencyNext(0.89, false, false, true)).toBeCloseTo(0.89 - 1 / 60, 10);
    expect(shimmerTransparencyNext(0.5, false, true, false)).toBeCloseTo(0.4, 10);
    expect(shimmerTransparencyNext(0.5, false, false, false)).toBeCloseTo(0.499, 10);
    expect(shimmerTransparencyNext(0.0005, false, false, false)).toBe(0);    // 下限 0
  });

  it('两个消费点：本体 alpha=1−st（GetAlpha :94874）+ 160 Glow ×(1−st)（:25771-25776）', () => {
    expect(shimmerBodyAlpha(0)).toBe(1);
    expect(shimmerBodyAlpha(0.89)).toBeCloseTo(0.11, 10);
    expect(shimmerBodyAlpha(0.5)).toBeCloseTo(0.5, 10);
    expect(shimmerGlowAlpha(128 / 255, 0)).toBeCloseTo(128 / 255, 10);
    expect(shimmerGlowAlpha(128 / 255, 0.5)).toBeCloseTo((128 / 255) * 0.5, 10);
    expect(shimmerGlowAlpha(0.5, 1)).toBeCloseTo(0, 10);   // 全透明
  });

  it('端到端：浸微光 ~91t 渐隐 → 转化（置 0.89 进上升态，非即刻标记变体）', () => {
    const world = new World(200, 200, 100, 'shimmer-test');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, FLOOR, DIRT);
    const npc = new TownNPC('guide', spotCenter(100) - 10, FLOOR * 16);
    npc.stationary = true;   // 无 home + stationary：站定不游走
    const { game } = makeGame(world, { npcs: [npc] });
    // 中心格微光（TownNPC 以中心格判浸没）
    world.store.setLiquid(100, 98, 255, 4);
    // 渐变期（~91t 才到 >0.9，非即刻转化——原版 :92637-39）
    for (let t = 0; t < 60; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmered).toBe(false);
    expect(npc.shimmerRising).toBe(false);
    expect(npc.shimmerTransparency).toBeCloseTo(0.6, 5);
    // 转化帧：只进 ai[0]=25 上升态 + st=0.89（GetShimmered :92700-05），变体未翻转
    let tick = -1;
    for (let t = 60; t < 300 && tick < 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.shimmerRising) tick = t;
    }
    // 0.9/0.01 = 90 次 +0.01（浮点累积 0.9000000000000001 > 0.9，恰第 90 次过线）
    expect(tick).toBeGreaterThanOrEqual(85);
    expect(tick).toBeLessThanOrEqual(95);
    expect(npc.shimmerTransparency).toBe(0.89);
    expect(npc.shimmered).toBe(false);
    // 落点传送（:53609）：位置移出微光列（FindSpotWithoutShimmer 近似）
    expect(Math.abs(npc.x - (spotCenter(100) - 10))).toBeGreaterThan(0);
    // ai[1]<30 期间 st 原样保持（衰减门 :53621）——转化帧已 ai[1]=0→1，再推 28t 到 29
    for (let t = 0; t < SHIMMER_RISE_VELOCITY_TICK - 2; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmerTransparency).toBe(0.89);
    expect(npc.shimmerRising).toBe(true);
    // ai[1]≥30 起 −1/60/t 衰减 + velocity.Y=−4×st 上浮（:53765-76）——
    // 落点传送后先落回地面（1..29 无速度设定只受重力），30 起自站位上浮
    const standY = FLOOR * 16 - npc.h;
    let minY = npc.y;
    for (let t = 0; t < 200 && npc.shimmerRising; t++) {
      npc.fixedUpdate(1 / 60, game);
      minY = Math.min(minY, npc.y);
    }
    expect(npc.shimmerRising).toBe(false);
    expect(npc.shimmered).toBe(true);            // 收尾变体翻转（:53664）
    expect(npc.shimmerTransparency).toBeLessThanOrEqual(1e-9);
    expect(minY).toBeLessThan(standY - 30);      // 上升演出：自地面站位上浮 ≥30px
    expect(shimmerBodyAlpha(npc.shimmerTransparency)).toBe(1);
  });
});

describe('ai[0]=25 微光上升态演出（NPC.cs:53737-53820）', () => {
  /** 备好"地面 + 中心微光池 + 无 home 站定向导"场景，返回 {npc, game, world} */
  function shimmerScene() {
    const world = new World(200, 200, 100, 'shimmer-rise');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, FLOOR, DIRT);
    const npc = new TownNPC('guide', spotCenter(100) - 10, FLOOR * 16);
    npc.stationary = true;
    const { game, fx } = makeGame(world, { npcs: [npc] });
    world.store.setLiquid(100, 98, 255, 4);
    return { world, npc, game, fx };
  }

  /** 推进直到 ai[0]=25 上升态启动（渐隐期 ~91t） */
  function runUntilRising(npc: TownNPC, game: unknown, cap = 400): boolean {
    for (let t = 0; t < cap && !npc.shimmerRising; t++) npc.fixedUpdate(1 / 60, game as never);
    return npc.shimmerRising;
  }

  /** 自上升态启动推进到收尾（cap 防死循环），返回 tick 数 */
  function runUntilSettled(npc: TownNPC, game: unknown, cap = 300): number {
    let t = 0;
    for (; t < cap && npc.shimmerRising; t++) npc.fixedUpdate(1 / 60, game as never);
    return t;
  }

  it('转化帧无即刻粒子/音效（GetShimmered :92561-92573 纯态切换）', () => {
    const { npc, game, fx } = shimmerScene();
    for (let t = 0; t < 90 && !npc.shimmerRising; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmerRising).toBe(true);
    expect(fx.bursts).toBe(0);        // dust 309 门在 ai[1]<30 时钳恒假（:53644 Remap）
    expect(fx.particles).toBe(0);
    expect(fx.sfx).toHaveLength(0);
  });

  it('上升演出：dust 309 + ShimmerBlock 粒子 + 收尾到场粒子/音效/成就 43', () => {
    const { npc, game, fx } = shimmerScene();
    expect(runUntilRising(npc, game)).toBe(true);
    runUntilSettled(npc, game);
    expect(npc.shimmered).toBe(true);
    expect(npc.shimmerRising).toBe(false);
    // 上升段 dust 309（spawnBurst，:53640-53646）与 ShimmerBlock（:53642-53649）
    expect(fx.bursts).toBeGreaterThan(0);
    // 收尾 ShimmerTownNPC 到场粒子（:53666 → Spawn_ :1696-1752）+ 音效
    expect(fx.particles).toBeGreaterThanOrEqual(20);
    // SoundID.Item29（Spawn_ShimmerTownNPC :1756）——Sfx 键 manaCrystal → Item_29.wav；
    // 曾因登记"素材缺"以 shimmerSplash 近似（素材实测在库，已换真声）
    expect(fx.sfx).toContain('manaCrystal');
    // 成就 43 = ShimmerVillager（AchievementHelperID.Events:43 → NEW_DIGS）
    expect(fx.achievements).toEqual([43]);
  });

  it('收尾时间线：ai[1]≥30 起衰减 54t，ai[1]≥75 且 st≤0 收尾（:53621/:53653）', () => {
    const { npc, game } = shimmerScene();
    expect(runUntilRising(npc, game)).toBe(true);
    const ticks = runUntilSettled(npc, game, 300);
    // 转化帧 ai[1]=0→1，+54 衰减 tick 到 st=0（riseT 84 ≥ 75 收尾门）→ 83t
    expect(ticks).toBeGreaterThanOrEqual(80);
    expect(ticks).toBeLessThanOrEqual(110);
  });

  it('上升态免伤（ai[0]==25 dontTakeDamage :53596）', () => {
    const { world, npc, game } = shimmerScene();
    for (let t = 0; t < 120 && !npc.shimmerRising; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmerRising).toBe(true);
    const hp = npc.hp;
    expect(npc.hurt(100, 0, 0, game)).toBe(false);
    expect(npc.hp).toBe(hp);
    void world;
  });

  it('变体回切（:53664 双向翻转）：再浸微光 → 上升收尾翻回原形态，成就 43 只发一次', () => {
    const { npc, game, fx } = shimmerScene();
    expect(runUntilRising(npc, game)).toBe(true);
    runUntilSettled(npc, game);
    expect(npc.shimmered).toBe(true);
    expect(fx.achievements).toEqual([43]);
    // 二次浸微光：放回池内重新累积触发
    npc.x = spotCenter(100) - 10;
    npc.y = FLOOR * 16 - npc.h;
    npc.vx = 0; npc.vy = 0;
    expect(runUntilRising(npc, game, 600)).toBe(true);
    runUntilSettled(npc, game, 300);
    expect(npc.shimmerRising).toBe(false);
    expect(npc.shimmerTransparency).toBeLessThanOrEqual(1e-9);
    expect(npc.shimmered).toBe(false);          // 翻转回原形态（townNpcVariationIndex 0）
    expect(fx.achievements).toEqual([43]);      // 43 仅在变体→1 时通知（:53667-9）
  });
});

describe('风暴门（NPC.cs:53399-53402 + Main.IsItStorming）', () => {
  it('IsItStorming 迟滞机 1:1（Main.cs:12927-12960，阈值 0.34/0.4/0.4/0.5）', () => {
    // 无云恒 false
    expect(isItStormingNext(0, 0.8, true)).toBe(false);
    // 高雨+强风 → true
    expect(isItStormingNext(0.5, 0.4, false)).toBe(true);
    expect(isItStormingNext(0.8, -0.6, false)).toBe(true);
    // 低雨或低风 → false
    expect(isItStormingNext(0.39, 0.8, true)).toBe(false);
    expect(isItStormingNext(0.8, 0.33, true)).toBe(false);
    // 中间带保持前值（迟滞）
    expect(isItStormingNext(0.45, 0.36, true)).toBe(true);
    expect(isItStormingNext(0.45, 0.36, false)).toBe(false);
  });

  it('Remap 钳位（Utils.cs:313）', () => {
    expect(remapClamped(30, 30, 90, 0, 0.7)).toBeCloseTo(0, 10);
    expect(remapClamped(60, 30, 90, 0, 0.7)).toBeCloseTo(0.35, 10);
    expect(remapClamped(90, 30, 90, 0, 0.7)).toBeCloseTo(0.7, 10);
    expect(remapClamped(10, 30, 90, 0, 0.7)).toBeCloseTo(0, 10);     // 区间外钳端值
    expect(remapClamped(29, 30, 60, 1, 0.5)).toBeCloseTo(1, 10);
    expect(remapClamped(60, 30, 60, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('白天风暴 + 地表以上 → 回家 flag（远离 home 静默传送，:53399-53402/:56063）', () => {
    const world = makeWorld();
    world.clock.timeOfDay = 0.5;   // 白天（无雨/夜/日食/史莱姆雨）
    world.groundLevel = FLOOR + 20;   // worldSurface 在 NPC 头顶行之下 → "地表以上"
    world.weather.cloudAlpha = 0.6;
    world.weather.windSpeedTarget = 0.5;
    const npc = new TownNPC('guide', spotCenter(60) - 10, FLOOR * 16);  // 远离 home
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    npc.stationary = true;          // 隔离白天随机游走，只看回家传送
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120; t++) npc.fixedUpdate(1 / 60, game);
    // flag=true 且不在好休息位 → TeleportToHome 落位 home 三列之一
    expect(Math.abs(npc.cx - (SPOT_X * 16 + 8))).toBeLessThanOrEqual(2 * 16);
  });

  it('非风暴白天不触发回家（flag 四源全假）', () => {
    const world = makeWorld();
    world.clock.timeOfDay = 0.5;
    world.groundLevel = FLOOR + 20;
    world.weather.cloudAlpha = 0;   // 无云 → IsItStorming 恒 false
    world.weather.windSpeedTarget = 0;
    const npc = new TownNPC('guide', spotCenter(60) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120; t++) npc.fixedUpdate(1 / 60, game);
    // 无 flag → 不触发回家传送（stationary+home 仍会缓慢步行向 home，但 120t
    // 远到不了：无传送的判据 = 距 home 仍 >10 格）
    expect(Math.abs(npc.cx - (SPOT_X * 16 + 8))).toBeGreaterThan(10 * 16);
  });
});

describe('坐姿落存档语义（WorldFile.SaveNPCs :1703-1750 / LoadNPCs :2883-2930）', () => {
  it('原版不落盘 ai[]：存档快照无 sitting/sitTimer，读档站立 + 夜间 AI 自然重坐', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    // Game.townNpcsForSave 同构快照（原版 WF:1712-1726 只写 active/netID/GivenName/
    // position/homeless/homeTileX/Y/townNpcVariationIndex/homelessDespawn——无 ai[]）
    const snap = [{
      key: npc.npcKey,
      x: Math.round(npc.x), y: Math.round(npc.y),
      home: npc.home ? [npc.home.x, npc.home.y] as [number, number] : null,
      givenName: npc.givenName,
    }];
    expect(Object.keys(snap[0]).sort()).toEqual(['givenName', 'home', 'key', 'x', 'y']);
    // 存 → 读往返（共享 save 管线；sitting 不在序列化面 = 蒸发）
    const json = saveGame(world, { hp: 100, x: 0, y: 0, luckState: { usedGalaxyPearl: false }, inv: { slots: [], selected: 0 } } as never, 0, snap);
    const { world: w2 } = loadSave(json);
    expect(w2.pendingTownNpcs).toHaveLength(1);
    const rec = w2.pendingTownNpcs![0];
    expect('sitting' in rec).toBe(false);
    // 读档恢复（Game.ts 城镇 NPC 段同构）：站立起手，夜间 + 椅在 → AI 自然重坐
    const restored = new TownNPC(rec.key, rec.x, rec.y);
    if (rec.home) { restored.home = { x: rec.home[0], y: rec.home[1] }; restored.leashHome = true; }
    expect(restored.sitting).toBe(false);
    const { game: g2 } = makeGame(w2, { npcs: [restored] });
    for (let t = 0; t < 300 && !restored.sitting; t++) restored.fixedUpdate(1 / 60, g2);
    expect(restored.sitting).toBe(true);
  });

  it('读档后椅格已失效 → 不重坐（FindGoodRestingSpot 无椅返回 null :53255）', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    // 存档前拆椅
    world.store.setTileSilent(SPOT_X, FLOOR - 2, 0);
    world.store.setTileSilent(SPOT_X, FLOOR - 1, 0);
    const json = saveGame(world, { hp: 100, x: 0, y: 0, luckState: { usedGalaxyPearl: false }, inv: { slots: [], selected: 0 } } as never, 0, [{
      key: npc.npcKey, x: Math.round(npc.x), y: Math.round(npc.y),
      home: [npc.home.x, npc.home.y] as [number, number], givenName: npc.givenName,
    }]);
    const { world: w2 } = loadSave(json);
    const rec = w2.pendingTownNpcs![0];
    const restored = new TownNPC(rec.key, rec.x, rec.y);
    restored.home = { x: rec.home![0], y: rec.home![1] };
    const { game: g2 } = makeGame(w2, { npcs: [restored] });
    for (let t = 0; t < 300; t++) restored.fixedUpdate(1 / 60, g2);
    expect(restored.sitting).toBe(false);
  });
});

// ===========================================================================
// ★2026-08-31 二轮对账批（F6）：行走随机坐椅缺湿身门——flag30 = ai[0]<2 &&
// !flag16 && !wet（NPC.cs:55768 字面），tryRandomChairSit 条件串补 wet。
// ===========================================================================
describe('★F6 随机坐椅 !wet 门（flag30 :55768 字面）', () => {
  function runCase(wet: boolean): { called: boolean; sitting: boolean } {
    const world = makeWorld();
    const { game } = makeGame(world);
    const npc = new TownNPC('nurse', spotCenter(SPOT_X) - 10, FLOOR * 16) as never;
    const me = npc as unknown as Record<string, unknown> & { sitting: boolean };
    me.onGround = true;
    me.wet = wet;
    me.rng = () => 0;                          // rand(300)==0 必中（其余门全放行面）
    const sitFn = (TownNPC.prototype as unknown as Record<string,
      (w: World, g: never, dir: number) => boolean>).tryRandomChairSit;
    const called = sitFn.call(me, world, game, 1);
    return { called, sitting: me.sitting };
  }

  it('干身:脚下椅格+掷中 → 正常入座', () => {
    const r = runCase(false);
    expect(r.called).toBe(true);
    expect(r.sitting).toBe(true);
  });

  it('湿身(!wet 不满足):同几何同骰 → 拒绝入座', () => {
    const r = runCase(true);
    expect(r.called).toBe(false);
    expect(r.sitting).toBe(false);
  });

  // ★治理批 B3（2026-08-31）：SIT 计时掷骰改走实例 rng 注入面后，
  //   时长分布可确定性钉值——[SIT_TIME_BASE .. SIT_TIME_BASE+SIT_TIME_RAND-1]
  //   两端点逐一钉死（旧 Math.random 直呼使该分布游离在测试口径之外）。
  function sitWithDuration(rngRet: number): number {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    npc.rng = () => rngRet;
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    return (npc as unknown as { sitTimer: number }).sitTimer;
  }

  it('★B3 时长下限:rng=0 → ai[1]=900+rand(10800)=900 整', () => {
    expect(sitWithDuration(0)).toBe(SIT_TIME_BASE);            // :53283 分布下端
  });

  it('★B3 时长上限:rng≈1 → 900+10799（Next 上界不含的离散映射）', () => {
    expect(sitWithDuration(0.9999999)).toBe(SIT_TIME_BASE + SIT_TIME_RAND - 1);
  });
});

// =====================================================================
// ★C1 清零收敛批：微光上升态 × 环境生命周期三连（NPC.cs:91590-91600）
// vanilla 判读定案：CheckLifeRegen(:93622)与 CheckDrowning(:96056)挂在 Update 层
// townNPC 门下,与 AI() 的 ai[0]==25 早退正交——上升帧照常跑;
// GetHurtByOtherNPCs 头部 dontTakeDamage 早退(:93559-63)→ 互殴在 ai25 停算。
// 溺水伤害链无任何 dontTakeDamage 闸:life-=2 直写(:96073)+friendlyRegen 清零
// (:96069)+致死一击 StrikeNPCNoInteraction(owner=255,:82012→82017 全链不查旗)
// ——「微光中溺水仍清零 + 伤害不停算」为原文行为,非近似。
// =====================================================================
describe('★C1 ai[0]==25 上升态内环境生命周期三连(NPC.cs:91590-91600)', () => {
  /** 平地世界 + 定姿上升态 NPC。直注私有态（本文件既有 any 注入口径）：
   *  shimmerRise=ai[0]==25 / shimmerRisePause=ai[2]>0 早退支(:53612-53618)使
   *  落点传送与上浮全程挂起、位置冻结;wet = 微光池上岸残留真值面(上升期
   *  updateNpcLiquid 不推进,wet 冻结)。 */
  function risingScene(opts: { water?: boolean; enemies?: unknown[] } = {}) {
    const world = new World(200, 200, 100, 'c1-rising');
    const st = world.store;
    for (let x = 20; x <= 180; x++) st.setTileSilent(x, FLOOR, DIRT);
    const npc = new TownNPC('guide', spotCenter(100) - 10, FLOOR * 16);
    // 站立落点（站立位 = 地面行上沿−体高,guide h=40）：上升态冻结位移不自然沉落,
    // 头部格采样行 (y+6)/16 = FLOOR-3 必须与注水行对齐才构成几何浸没前提
    npc.y = FLOOR * 16 - npc.h;
    npc.stationary = true;
    const { game } = makeGame(world, { npcs: [npc], enemies: opts.enemies ?? [] });
    if (opts.water) {
      // 头部行普通水(type 1)——非岩浆(2)非微光(4),DrownCollision 受理档
      st.setLiquid(100, FLOOR - 3, 255, 1);
      st.setLiquid(100, FLOOR - 4, 255, 1);
    }
    const priv = npc as unknown as Record<string, number | boolean>;
    priv.shimmerRise = true;
    priv.shimmerRiseT = 0;
    priv.shimmerRisePause = SHIMMER_RISE_PAUSE + 400;     // 长暂停窗冻结位移
    priv.wet = !!opts.water;
    return { world, npc, game };
  }

  it('微光中回血照常(CheckLifeRegen 无 ai 门 :93622;F10 面语义不变)', () => {
    const { npc, game } = risingScene();
    (npc as unknown as { hp: number }).hp = 100;          // life<lifeMax
    let healedAt = -1;
    for (let t = 0; t < 80 && healedAt < 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.hp === 101) healedAt = t;
    }
    expect(npc.shimmerRising).toBe(true);                 // 全程滞留上升态
    // 向导 rate=1+5=6/t → 计数破 180 恰在第 31 tick(hp++ :93639-41)
    expect(healedAt).toBeGreaterThanOrEqual(30);
    expect(healedAt).toBeLessThanOrEqual(32);
  });

  it('微光中溺水照常结算:friendlyRegen 清零(:96069)+life-=2 直伤,dontTakeDamage 不停算', () => {
    const { npc, game } = risingScene({ water: true });
    const n = npc as unknown as Record<string, number>;
    n.hp = 120;                                           // life<lifeMax：回血枝活(交互面)
    n.breath = 1;                                         // 预置濒绝——首拍即入伤害窗
    n.breathCounter = 6;
    npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmerRising).toBe(true);                 // ai[0]==25 全程保持
    expect(n.breath).toBe(0);                             // :96075 钳 0
    expect(n.hp).toBe(118);                               // life-=2 直伤(:96073)不停算
    // ★清零闸(F10 精确序)：伤害拍内 CheckDrowning 先把 friendlyRegen 写 0、
    // 同拍回血枝(CheckLifeRegen,序位后于溺水 :93595-98)再补加 rate —— 向导
    // rate=1+5=6,故终值恰为 6（旧计数若未清应为 7+:96069 缺位即在此爆红）
    expect(n.lifeRegenCounter).toBe(6);
    let maxSeenCounter = 0;
    let anyHeal = false;
    for (let t = 0; t < 300; t++) {
      const before = n.hp as number;
      npc.fixedUpdate(1 / 60, game);
      if ((n.hp as number) > before) anyHeal = true;
      maxSeenCounter = Math.max(maxSeenCounter, n.lifeRegenCounter as number);
    }
    expect(anyHeal).toBe(false);                          // 伤害窗逐拍清零 → 永不自愈
    expect(maxSeenCounter).toBeLessThan(100);             // 反证：无清零则率×7t 破百越 180
    expect((n.hp as number)).toBeLessThan(60);            // 直伤持续生效
  });

  it('微光中互殴停算(GetHurtByOtherNPCs 头部 dontTakeDamage 早退 :93559-63)', () => {
    const enemy = { x: spotCenter(100) - 20, y: FLOOR * 16 - 42, w: 20, h: 42,
      dead: false, damage: 40 };
    const { npc, game } = risingScene({ enemies: [enemy] });
    enemy.y = npc.y + npc.h / 2 - 20;                      // 盒心与本体盒重叠
    npc.fixedUpdate(1 / 60, game);
    expect(npc.hp).toBe(250);                             // 上升态不受敌怪接触伤
    // 对照态外:同一几何解除上升 → 立即互殴扣血
    const priv = npc as unknown as Record<string, number | boolean>;
    priv.shimmerRise = false;
    enemy.x = npc.x - 4;                                  // 保持重叠
    npc.fixedUpdate(1 / 60, game);
    expect(npc.hp).toBeLessThan(250);
  });
});

// =====================================================================
// ★2026-09-01 坐姿修正批：回家传送 grounding 回归（TeleportToHome NPC.cs:56211-
// 56237）。定谳「拆椅+夜=冻结风暴」根因——落位基线曾用 home 站格(地面行−1)而非
// FindGoodRestingSpot 输出的【地面行】,y=(home.y)*TILE−h−0.1 脚底悬在地面行上方
// 16px 空中行 ⇒ nearHome 精确等值门(非坐姿脚格==restTp)永假、每拍重传永不满足：
// onGround 恒 false 连锁钉死攻击门(ai[0] 入态门 :55769 首因子)与逃离位移。
// 本块锁两件事:①落位后脚行==restTp.y 且落位收敛;②无「悬浮静止风暴」复发。
// （拽回触发本体=raining||!dayTime|eclipse|slimeRain|storm :53532-53548,无危险
//  豁免——逃离中被拽回属原版语义,由视野门矩形保持可见场景的测试分离考察。）
// =====================================================================
describe('回家传送 grounding（TeleportToHome :56211-56237 修正回归）', () => {
  /** 平地 + 可选椅 + 夜；玩家死遁=双矩形视野门开 */
  function tpWorld(atWorld = true, chairAt?: number) {
    const world = new World(200, 200, 100, 'tp-ground');
    const st = world.store;
    for (let x = 20; x <= 180; x++) st.setTileSilent(x, FLOOR, DIRT);
    if (chairAt != null) {
      st.setTileSilent(chairAt, FLOOR - 2, CHAIR, 0, 0);
      st.setTileSilent(chairAt, FLOOR - 1, CHAIR, 0, 18);
    }
    world.clock.timeOfDay = atWorld ? 0 : SIT_DAY_MOCK_TIME;
    return world;
  }
  const SIT_DAY_MOCK_TIME = 27000;   // 白天 (isDay)
  const feetRow = (npc: TownNPC): number => Math.floor((npc.y + npc.h + 1) / 16);

  it('拆椅家·远死玩家：离开锚点即被拽回,落位脚行==restFloor.y,onGround 收敛', () => {
    const world = tpWorld(true);          // 无椅 → 锚点走 restFloor(home 列向下找地面行)
    const anchorY = FLOOR;                // home={110,F−1} 向下命中地面行 F
    const npc = new TownNPC('guide', spotCenter(SPOT_X - 4), FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });   // 死亡远处玩家→门开
    let warped = false;
    for (let t = 0; t < 300; t++) {
      const before = (npc as unknown as { teleportedHome: boolean }).teleportedHome;
      npc.fixedUpdate(1 / 60, game);
      const after = (npc as unknown as { teleportedHome: boolean }).teleportedHome;
      if (!before && after) {
        warped = true;
        expect(feetRow(npc), `t${t} 落位脚行应==${anchorY}`).toBe(anchorY);
      }
      void before; void after;
    }
    expect(warped).toBe(true);            // 远离锚点在夜里必然被拽回（原版语义）
    // 收敛态：站于地面或已入座；脚行与锚点一致
    expect(npc.sitting || feetRow(npc) === anchorY).toBe(true);
    if (!npc.sitting) {
      expect((npc as unknown as { onGround: boolean }).onGround).toBe(true);
      expect(Math.abs(npc.cx - spotCenter(SPOT_X))).toBeLessThanOrEqual(16.5);
    }
  });

  it('无悬浮风暴不变量：任何时刻「位置静止×连续 12t」必须伴随 sitting 或 onGround', () => {
    const world = tpWorld(true, SPOT_X);
    const npc = new TownNPC('guide', spotCenter(SPOT_X - 6), FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    let frozenAir = 0;
    for (let t = 0; t < 600; t++) {
      npc.fixedUpdate(1 / 60, game);
      const g = npc as unknown as { onGround: boolean };
      if (Math.abs(npc.vx) < 1e-6 && Math.abs(npc.vy) < 1e-6 && !g.onGround) {
        frozenAir++;
        expect(frozenAir, `t${t}: 悬浮静止 ${frozenAir}t`).toBeLessThan(12);
      } else {
        frozenAir = 0;
      }
    }
    expect(frozenAir).toBe(0);
  });

  it('白天（flag=false）同一布局不触发传送', () => {
    const world = tpWorld(false);         // isDay → sitFlag false
    const npc = new TownNPC('guide', spotCenter(SPOT_X - 4), FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 120; t++) npc.fixedUpdate(1 / 60, game);
    expect((npc as unknown as { teleportedHome: boolean }).teleportedHome).toBe(false);
    expect(Math.abs(npc.cx - spotCenter(SPOT_X - 4))).toBeLessThan(120);   // 游走半径内
  });
});

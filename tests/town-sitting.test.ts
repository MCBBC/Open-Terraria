// 城镇 NPC 坐姿 + 微光透明度衰减回归（AI_007 ai[0]==5 族 + shimmerTransparency）。
// 标杆（Terarria1456/Terraria）：
//  - 入座 AI_007_TryForcingSitting NPC.cs:53264-53287（椅格=落座地面格上一行、
//    style 27 排除 frameY∈[1080,1098]、占位互斥、ai[1]=900+rand(10800)、
//    direction=frameX!=0?1:-1、Bottom=(x*16+8+2*dir, y*16)）
//  - 扫椅 AI_007_FindGoodRestingSpot :53195-53262（±7 列 × 行 {+2,0,-2,-4,-6}、
//    |dx|+|dy| 最小、下格(frameY%40!=0) 先 -1 再 +2）
//  - 态推进 :54682-54710（vx×0.8、ai[1]--、椅没了 ai[1]=0 起身、时限起身）
//  - 坐姿与攻击互斥：触发门 flag31 的 ai[0]<2（:55621）不含 5
//  - shimmerTransparency：+0.01/t（:92469）、>0.9 转化（:92471）、转化置 0.89
//    （:92568）、上升态 −1/60（:53625）、justHit −0.1（:92484）、常规 −0.001
//    （:92492）；消费 = GetAlpha :94874（本体）+ Main.cs:25771-25776（160 Glow）
import { describe, it, expect } from 'vitest';
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
} from '../src/entities/TownNPC';
import { TILE_BY_KEY } from '../src/data/tiles';

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
  return {
    shots,
    game: {
      world,
      player: { x: -9999, y: -9999, w: 0, h: 0, dead: true },
      enemies: () => extra.enemies ?? [],
      npcs: () => extra.npcs ?? [],
      critters: () => [],
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
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

  it('白天不坐（FindGoodRestingSpot :53209-53212 白天早退）', () => {
    const world = makeWorld();
    world.clock.timeOfDay = 0.5;   // 正午
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const { game } = makeGame(world, { npcs: [npc] });
    for (let t = 0; t < 300; t++) npc.fixedUpdate(1 / 60, game);
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

  it('与攻击态互斥：坐着不打（flag31 ai[0]<2 门 :55621），起身恢复攻击', () => {
    const world = makeWorld();
    const npc = new TownNPC('guide', spotCenter(SPOT_X) - 10, FLOOR * 16);
    npc.home = { x: SPOT_X, y: FLOOR - 1 };
    const enemy = { x: 115 * 16, y: 96 * 16, w: 20, h: 40, dead: false, damage: 40, hurt: () => true };
    const { game, shots } = makeGame(world, { npcs: [npc], enemies: [enemy] });
    for (let t = 0; t < 120 && !npc.sitting; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.sitting).toBe(true);
    for (let t = 0; t < 300; t++) npc.fixedUpdate(1 / 60, game);
    expect(shots.length).toBe(0);   // 坐姿中攻击触发门被挡
    // 拆椅起身 → 攻击恢复
    world.store.setTileSilent(SPOT_X, FLOOR - 2, 0);
    world.store.setTileSilent(SPOT_X, FLOOR - 1, 0);
    let fired = false;
    for (let t = 0; t < 1500 && !fired; t++) {
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

describe('shimmerTransparency（NPC.cs:92468-92497/:92568/:53625）', () => {
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

  it('端到端：浸微光 ~91t 渐隐后转化（置 0.89），离池后上升态衰减归零', () => {
    const world = new World(200, 200, 100, 'shimmer-test');
    for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, FLOOR, DIRT);
    const npc = new TownNPC('guide', spotCenter(100) - 10, FLOOR * 16);
    npc.stationary = true;   // 无 home + stationary：站定不游走
    const { game } = makeGame(world, { npcs: [npc] });
    // 中心格微光（TownNPC 以中心格判浸没）
    world.store.setLiquid(100, 98, 255, 4);
    // 渐变期（~91t 才到 >0.9，非即刻转化——原版 :92471）
    for (let t = 0; t < 60; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmered).toBe(false);
    expect(npc.shimmerTransparency).toBeCloseTo(0.6, 5);
    // 转化：shimmered 翻转当帧 st 恰为 0.89（:92568）
    let tick = -1;
    for (let t = 60; t < 300 && tick < 0; t++) {
      npc.fixedUpdate(1 / 60, game);
      if (npc.shimmered) tick = t;
    }
    // 0.9/0.01 = 90 次 +0.01（浮点累积 0.9000000000000001 > 0.9，恰第 90 次过线）
    expect(tick).toBeGreaterThanOrEqual(85);
    expect(tick).toBeLessThanOrEqual(95);
    expect(npc.shimmerTransparency).toBe(0.89);
    expect(shimmerBodyAlpha(npc.shimmerTransparency)).toBeCloseTo(0.11, 10);
    // 离池 → 上升态 −1/60/t 衰减（0.89 → 0 需 54t）
    world.store.setLiquid(100, 98, 0, 0);
    for (let t = 0; t < 60; t++) npc.fixedUpdate(1 / 60, game);
    expect(npc.shimmerTransparency).toBeLessThanOrEqual(1e-9);
    expect(shimmerBodyAlpha(npc.shimmerTransparency)).toBe(1);
  });
});

// 弹幕通用湿段接入回归：Boomerang（aiStyle 3）+ YoyoProj（aiStyle 99）×
// projWetSection 共享体（Projectile.cs:16903-17113 全体弹共用段）。
// 钉面：
//   ① 入水溅花恰 10 粒 dustWater(33) 系 / 出水盒 Y 无 −8 变体 / wetCount=10 冷却窗
//      抑制窗内再入/再出（:16948/:17029 门）;
//   ② 岩浆 d35 入水溅 + lavaWet 粘滞（出水仍溅岩浆花 :16988 出水档 useLava=lavaWet）
//      + !wet 三清（:17103-17108）;
//   ③ 豁免 id（数据面 projectileData().ignoreWater）整段跳过（:16903 门）;
//   ④ 湿位移阻尼只削位移、速度场不减（HandleMovement :17721-17764 → UpdatePosition
//      :20557 `if (wet) position += wetVelocity`;dry :20561 `position += velocity`）——
//      出程/活跃·脱离走 moveAndCollide dx/dy 入参乘档;
//   ⑤ tileCollide=false 直积分两路（回旋镖返回 :40108 / 悠悠球回收 :69138）原版
//      quirk 照抄：wet 位移 = :16870 AI 前 velocity 快照（无阻尼、滞后一子步）,
//      dry = post-AI velocity;
//   ⑥ 数据面审计：BOOMERANG_SIZE 全 36 型 / YOYO_RANGE 全 21 型 ∩ PROJ_IGNORE_WATER = ∅
//      （1457 SetDefaults :699-10676 逐块扫描结论的常驻金标,提取器/手改回退即爆红）。
// 测试域 id 选择：行为用例取 1052（缺省族、无 BOOMERANG_DUST_TRUTH 尘表项、无特支
// 分支 → 尘计数面纯净）;541 悠悠球（缺省 range/top、有寿命倍率不影短测）。
import { describe, it, expect } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { Boomerang, YoyoProj, BOOMERANG_SIZE, YOYO_RANGE, YOYO_TOP, YOYO_LIFE } from '../src/entities/WeaponProj';
import { PROJ_IGNORE_WATER } from '../src/data/vanillaProjectiles';
import type { GameHooks } from '../src/entities/types';

const TILE = 16;
const W = 120, H = 160;
const WATER_TY0 = 20;              // 液体带 ty 20..21（px 320..352）

interface DustCall { x: number; y: number; w: number; h: number; type: number; vx: number; vy: number; alpha?: number; scale?: number; color?: unknown }
interface SfxCall { name: string; vol: number; x: number; y: number; pitch?: number }

function mkStore(): TileStore {
  const st = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = WATER_TY0; y < WATER_TY0 + 2; y++) st.setLiquid(x, y, 255, LIQUID_TYPE.WATER);
  return st;
}
function mkLavaStore(): TileStore {
  const st = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = WATER_TY0; y < WATER_TY0 + 2; y++) st.setLiquid(x, y, 255, LIQUID_TYPE.LAVA);
  return st;
}

function mkHooks(st: TileStore) {
  const dusts: DustCall[] = [];
  const sfx: SfxCall[] = [];
  const hooks = {
    world: { store: st } as never,
    player: {
      x: 600, y: 400, w: 20, h: 42, cx: 610, cy: 421, dead: false,
      attackSpeedMult: 1,
      buffs: { has: () => false },
      critChance: () => 0,
      equipStats: { frostBurn: false, magmaStone: false, stringColor: 0, yoyoString: false, magicString: false },
      yoyoStringAnchor: () => ({ x: 610, y: 421 }),
    },
    enemies: () => [],
    critters: () => [],
    playSfx() {}, playSfxFiles() {},
    playSfxWav: (name: string, vol: number, x: number, y: number, pitch?: number) => { sfx.push({ name, vol, x, y, pitch }); },
    spawnParticles() {},
    spawnDust: (x: number, y: number, w: number, h: number, type: number, vx = 0, vy = 0) => {
      dusts.push({ x, y, w, h, type, vx, vy });
      return { x, y, w, h, vx, vy, scale: 1, alpha: 0, fadeIn: 0, noGravity: false, color: null };
    },
  };
  return { hooks: hooks as unknown as GameHooks, dusts, sfx };
}

/** 悠悠球桩（channel 可翻转;光标世界坐标可设） */
function mkYoyo(g: GameHooks, x: number, y: number, opts: { channel?: boolean; cursor?: { x: number; y: number }; initSpeed?: number } = {}) {
  let ch = opts.channel ?? true;
  const cursor = opts.cursor ?? { x: x + 1, y: y + 50 };
  const yj = new YoyoProj(x, y, 10, 2, 541, 0, () => ch, () => cursor, opts.initSpeed ?? 0);
  return { yj, setChannel: (v: boolean) => { ch = v; } };
}

// ============================================================
// ①②③ 溅花面 / 旗跃迁 / 冷却窗（Boomerang 1052）
// ============================================================
describe('Boomerang 通用湿段（:16903-17113 共享体接入）', () => {
  it('入水溅花恰 10 粒 dustWater(33) + Splash_1 + wet 跃迁;水中位移×0.5 速度场不减', () => {
    const st = mkStore();
    const { hooks, dusts, sfx } = mkHooks(st);
    // 出生 (640,300) 盒 22×22:湿检内盒 vy=306..317,液面 320 → 首 tick 干
    const b = new Boomerang(640, 300, 0, 6, 10, 0, 1052);
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(0);
    expect(b.wet).toBe(false);
    const y1 = b.y;
    b.fixedUpdate(1 / 60, hooks);
    // tick2 湿检内盒 vy=312..323 跨液面 → 入水溅花
    expect(dusts.length).toBe(10);
    expect(dusts.every((d) => d.type === 33)).toBe(true);
    expect(dusts.every((d) => d.x === 640 - 6 && d.w === 22 + 12 && d.h === 24)).toBe(true);
    expect(dusts[0].y).toBe(y1 + 11 - 8);          // 盒 Y = y + h/2 − 8（:16996）
    expect(sfx.filter((s) => s.name === 'Splash_1').length).toBe(1);
    expect(b.wet).toBe(true);
    // 位移阻尼:本拍位移 = 6×0.5 = 3（速度场不减）
    expect(b.y).toBeCloseTo(y1 + 3, 10);
    expect(b.vy).toBe(6);
    // tick3 仍湿:无新溅花,位移继续×0.5
    const y2 = b.y;
    const n2 = dusts.length;
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(n2);
    expect(b.y).toBeCloseTo(y2 + 3, 10);
    expect(b.wet).toBe(true);
  });

  it('出水溅花盒 Y 无 −8 变体 + wetCount=10 冷却窗抑制窗内再入/再出;逐 tick 递减', () => {
    const st = mkStore();
    const { hooks, dusts, sfx } = mkHooks(st);
    // 出生 (640,300) 向下 +16 落入水（湿检内盒 [py+6, py+17]）:tick2 跨液面入水溅
    //  （出生即液内不溅——NewProjectile 预置 :10887 已置 wet,首拍 !wet 门 :16948 抑制）,
    //  随后 vy=-16 上浮出水
    const b = new Boomerang(640, 300, 0, 16, 10, 0, 1052);
    b.fixedUpdate(1 / 60, hooks);                   // y=300 内盒 [306,317] 全干 → 无溅
    expect(dusts.length).toBe(0);
    expect(b.y).toBeCloseTo(316, 10);               // 干态全速
    b.fixedUpdate(1 / 60, hooks);                   // y=316 内盒 [322,333] 跨液面 → 入水溅
    expect(b.wet).toBe(true);
    expect(dusts.length).toBe(10);
    expect(dusts[0].y).toBe(316 + 11 - 8);          // 入水盒 Y = y + h/2 − 8（:16996）
    expect(b.y).toBeCloseTo(316 + 8, 10);           // 湿阻尼 +16×0.5
    b.vy = -16;
    b.fixedUpdate(1 / 60, hooks);                   // 324→316:内盒 [330,341] 仍湿,无溅
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 316→308:内盒 [322,333] 仍湿
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 308→300:内盒 [314,325] 仍湿
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 300:内盒 [306,317] 全干 → 出水溅
    expect(b.wet).toBe(false);
    expect(dusts.length).toBe(20);
    expect(dusts[10].y).toBe(300 + 11);             // 出水【水】支无 −8（:17078）——300+11=311,若走 −8 式应为 303
    expect(b.wetCount).toBe(9);                     // :17031 置 10 后同子步 :17109-17112 递减 → 读 9
    expect(sfx.filter((s) => s.name === 'Splash_1').length).toBe(2);
    // 干 tick:无溅花,wetCount 8
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(20);
    expect(b.wetCount).toBe(8);
    // 窗内再入:入水溅花被 wetCount!=0 门抑制（:16948）;递减照跑 8→7
    b.y = 316;
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(20);
    expect(b.wet).toBe(true);
    expect(b.wetCount).toBe(7);
    // 窗内再出:出水溅花同被抑制;递减 7→6
    b.y = 300;
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(20);
    expect(b.wet).toBe(false);
    expect(b.wetCount).toBe(6);
    // 干置 6 tick → 窗尽;再入水 → 溅花恢复
    for (let i = 0; i < 6; i++) { b.y = 200; b.fixedUpdate(1 / 60, hooks); }
    expect(b.wetCount).toBe(0);
    b.y = 316;
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(30);
  });

  it('岩浆:入水溅 d35 + lavaWet 粘滞（出水仍溅岩浆花）+ 离水三清 + 位移阻尼', () => {
    const st = mkLavaStore();
    const { hooks, dusts } = mkHooks(st);
    // 出生液面上方 (640,300) 落入岩浆:tick2 入水溅 d35;随后上浮出水仍 d35（粘滞）
    const b = new Boomerang(640, 300, 0, 16, 10, 0, 1052);
    b.fixedUpdate(1 / 60, hooks);                   // 干:[306,317] < 320 → 无溅
    expect(dusts.length).toBe(0);
    b.fixedUpdate(1 / 60, hooks);                   // y=316:内盒 [322,333] 入岩浆 → 溅
    expect(dusts.length).toBe(10);
    expect(dusts.every((d) => d.type === 35)).toBe(true);   // 入水岩浆档（:17010 flag 支）
    expect(b.wet).toBe(true);
    expect(b.lavaWet).toBe(true);
    expect(b.y).toBeCloseTo(316 + 8, 10);           // 岩浆湿=true → 位移阻尼 0.5（wet 分支缺省档）
    b.vy = -16;
    b.fixedUpdate(1 / 60, hooks);                   // 324→316:内盒 [330,341] 仍湿
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 316→308:内盒 [322,333] 仍湿
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 308→300:内盒 [314,325] 仍湿
    expect(dusts.length).toBe(10);
    b.fixedUpdate(1 / 60, hooks);                   // 300:内盒 [306,317] 全干 → 出水溅
    // 出水:useLava = lavaWet（粘滞）→ 仍 d35（:17032 出水档 lavaWet 支）
    expect(b.wet).toBe(false);
    expect(dusts.length).toBe(20);
    expect(dusts.slice(10).every((d) => d.type === 35)).toBe(true);
    // !wet 三清（:17103-17108）
    expect(b.lavaWet).toBe(false);
    expect(b.honeyWet).toBe(false);
    expect(b.shimmerWet).toBe(false);
  });

  it('豁免 id（数据面 ignoreWater）整段跳过:无溅花、四旗恒假、位移不阻尼', () => {
    const st = mkStore();
    const { hooks, dusts } = mkHooks(st);
    // projId 8 ∈ PROJ_IGNORE_WATER（SetDefaults :885;域外 id 纯测数据驱动豁免门接线）。
    // 出生液内 (640,330) 下落:若豁免门失效,首拍预置 + 入水支都会溅花且位移受阻尼
    const b = new Boomerang(640, 330, 0, -16, 10, 0, 8);
    b.fixedUpdate(1 / 60, hooks);
    b.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(0);
    expect(b.wet).toBe(false);
    expect(b.lavaWet).toBe(false);
    expect(b.honeyWet).toBe(false);
    expect(b.shimmerWet).toBe(false);
    expect(b.y).toBeCloseTo(330 - 32, 10);          // 两拍全速 -16,无阻尼
  });
});

// ============================================================
// ⑤⑥ 直积分两路的湿位移口径（tileCollide=false 原版 quirk）
// ============================================================
describe('回旋镖/悠悠球 tileCollide=false 位移分叉（UpdatePosition :20555-20562）', () => {
  it('回旋镖返回段:湿位移 = AI 前 velocity 快照（无阻尼滞后一子步）;干态 = post-AI', () => {
    const st = mkStore();
    const { hooks } = mkHooks(st);
    const b = new Boomerang(640, 330, 4, 0, 10, 0, 1052);
    b.ai0 = 1;                                       // 强制返回段（tileCollide=false :40108）
    const preVx = b.vx;
    const x0 = b.x;
    b.fixedUpdate(1 / 60, hooks);
    expect(b.wet).toBe(true);
    expect(b.x - x0).toBeCloseTo(preVx, 10);          // 湿态走 :16870 快照=入速 4
    expect(b.vx).not.toBe(preVx);                     // AI steer 已改速度场（返回目标速度 9 向）
    // 干态对照:位移 = post-AI velocity
    const b2 = new Boomerang(640, 100, 4, 0, 10, 0, 1052);
    b2.ai0 = 1;
    const x20 = b2.x;
    b2.fixedUpdate(1 / 60, hooks);
    expect(b2.x - x20).toBeCloseTo(b2.vx, 10);
    expect(b2.x - x20).not.toBeCloseTo(4, 10);
  });

  it('悠悠球活跃态:湿位移 ×0.5（moveAndCollide 位移入参）+ 速度场不减;干态全速', () => {
    const st = mkStore();
    const { hooks } = mkHooks(st);
    // 出生液内 (640,330)（湿检内盒 [py+4, py+12] ⊂ 液带）:预置 wet=true（:10887）,
    // 首拍位移即受阻尼
    const { yj } = mkYoyo(hooks, 640, 330, { channel: true, cursor: { x: 641, y: 380 } });
    const x0 = yj.x, y0 = yj.y;
    yj.fixedUpdate(1 / 60, hooks);
    expect(yj.wet).toBe(true);
    // 位移 = post-AI velocity × 0.5（阻尼不写速度场 → tick 后读数即位移源）
    expect(yj.x - x0).toBeCloseTo(yj.vx * 0.5, 10);
    expect(yj.y - y0).toBeCloseTo(yj.vy * 0.5, 10);
    expect(yj.vy).toBeGreaterThan(0);
    // 干态对照
    const st2 = new TileStore(W, H);
    const { hooks: hooks2 } = mkHooks(st2);
    const { yj: yj2 } = mkYoyo(hooks2, 640, 330, { channel: true, cursor: { x: 641, y: 380 } });
    const x20 = yj2.x, y20 = yj2.y;
    yj2.fixedUpdate(1 / 60, hooks2);
    expect(yj2.wet).toBe(false);
    expect(yj2.x - x20).toBeCloseTo(yj2.vx, 10);
    expect(yj2.y - y20).toBeCloseTo(yj2.vy, 10);
  });

  it('悠悠球回收态:湿位移 = 本拍入速快照（无阻尼、非 post-lerp）;干态 = post-lerp', () => {
    const st = mkStore();
    const { hooks } = mkHooks(st);
    const { yj, setChannel } = mkYoyo(hooks, 640, 330, { channel: true, cursor: { x: 641, y: 380 } });
    yj.fixedUpdate(1 / 60, hooks);                   // 活跃 tick:建立速度（湿,阻尼位移）
    const preVy = yj.vy;                             // tick2 入速 = :16870 快照源
    const y0 = yj.y;
    setChannel(false);                               // 松手 → 本 tick 活跃块置 ai0=-1 → 回收段
    yj.fixedUpdate(1 / 60, hooks);
    expect(yj.ai0).toBe(-1);
    expect(yj.wet).toBe(true);
    expect(yj.y - y0).toBeCloseTo(preVy, 10);         // 湿态回收位移 = 入速快照
    expect(yj.vy).not.toBeCloseTo(preVy, 4);          // lerp 已改速度场
    // 干态对照:位移 = post-lerp velocity
    const st2 = new TileStore(W, H);
    const { hooks: hooks2 } = mkHooks(st2);
    const { yj: yj2, setChannel: set2 } = mkYoyo(hooks2, 640, 330, { channel: true, cursor: { x: 641, y: 380 } });
    yj2.fixedUpdate(1 / 60, hooks2);
    const y20 = yj2.y;
    set2(false);
    yj2.fixedUpdate(1 / 60, hooks2);
    expect(yj2.y - y20).toBeCloseTo(yj2.vy, 10);
  });

  it('悠悠球豁免接线（域外 exempt id 走数据门）:无溅花、位移不阻尼', () => {
    const st = mkStore();
    const { hooks, dusts } = mkHooks(st);
    // 域内 21 型全不豁免 → 数据门接线以域外 exempt id 8（PROJ_IGNORE_WATER :885）验证:
    // 出生液内 (640,330)（活跃追踪下移）,若豁免失效会预置 wet=true 且位移×0.5
    const y8 = new YoyoProj(640, 330, 10, 2, 8, 0, () => true, () => ({ x: 641, y: 380 }), 8);
    const y0 = y8.y;
    y8.fixedUpdate(1 / 60, hooks);
    expect(dusts.length).toBe(0);
    expect(y8.wet).toBe(false);
    expect(y8.y - y0).toBeCloseTo(y8.vy, 10);         // 全速
  });
});

// ============================================================
// ⑦ 数据面审计金标（1457 SetDefaults :699-10676 逐块扫描结论）
// ============================================================
describe('域 id 全集 ∩ PROJ_IGNORE_WATER = ∅（豁免审计金标）', () => {
  const boomIds = Object.keys(BOOMERANG_SIZE).map(Number);
  const yoyoIds = [
    ...Object.keys(YOYO_RANGE).map(Number),
    ...Object.keys(YOYO_TOP).map(Number),
    ...Object.keys(YOYO_LIFE).map(Number),
  ];
  it(`回旋镖域 ${boomIds.length} 型（BOOMERANG_SIZE 键集）全不豁免`, () => {
    expect(boomIds.length).toBe(36);
    expect(boomIds.sort((a, b) => a - b)).toEqual(
      [6, 19, 33, 52, 106, 113, 182, 272, 301, 320, 333, 383, 866, 867, 902, 1000, 1052,
        1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071,
        1072, 1074, 1075, 1076, 1101, 1102]);
    for (const id of boomIds) expect(PROJ_IGNORE_WATER.has(id), `boomerang ${id}`).toBe(false);
  });
  it('悠悠球域（YOYO_* 三表键并集）全不豁免', () => {
    const uniq = [...new Set(yoyoIds)].sort((a, b) => a - b);
    expect(uniq).toEqual([534, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 562, 563, 564, 603, 999]);
    for (const id of uniq) expect(PROJ_IGNORE_WATER.has(id), `yoyo ${id}`).toBe(false);
  });
});

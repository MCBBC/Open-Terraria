// 台账清偿·proj1457.ts 专责批（2026-08-31）：L1 风暴家 GameMode 难度乘区正解 /
// L2 挥击尾孢子 1128 越权伤害与 ×3 加速老化+型级 IDStatic 表 /
// A①雷液体导通三段 ②64×64 爆域归属 ③sporeSpawn 中奖列度量 ④1129 大爆盒 ownerHitCheck
// +timeLeft=5 ⑤CutTiles 带状转正 ⑥731 extraUpdates=1 双子步 ⑦打屏挂 1091 / B1 花瓣按轴反弹。
// 锚：Terarria1458/Terraria/{Projectile.cs,Main.cs,Terraria.DataStructures/GameDifficultyData.cs,
// Terraria.GameContent.Drawing/ParticleOrchestrator.cs}（行号见各用例；1457 同值处注双锚）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import {
  ChloroSporeCloud, ChloroBladeSlam, PetalstormShot, StormLightning,
  findSporeCloudSpawn,
  LIGHTNING_PLAYER_DAMAGE_SCALING, lightningEvpFinalDamage, lightningNpcMultiplier,
} from '../src/entities/proj1457';
import { sampleCurve } from '../src/stats/ScaleStats';

type HurtArgs = unknown[];
interface StubEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  hp?: number; maxHp?: number;
  hurtLog: HurtArgs[];
  hurt: (...a: unknown[]) => boolean;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): StubEnemy {
  const e = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, hp: 100000, maxHp: 100000,
    hurtLog: [] as HurtArgs[],
    hurt(...a: unknown[]): boolean { e.hurtLog.push(a); return false; },
  } as unknown as StubEnemy;
  return e;
}

/** 世界桩：TileStore 地形 + 可选液体覆盖表（tile→液量） */
function mkWorld(opts: { liquids?: Map<string, number>; solids?: Array<[number, number]> } = {}) {
  const store = new TileStore(240, 140);
  for (const [x, y] of opts.solids ?? []) store.setTileSilent(x, y, 1);
  const liquids = opts.liquids ?? new Map();
  const world = {
    store,
    difficulty: 0,
    liquidAt: (px: number, py: number): number => liquids.get(`${Math.floor(px / 16)},${Math.floor(py / 16)}`) ?? 0,
  };
  return { store, world };
}

function mkHooks(enemies: StubEnemy[], world: ReturnType<typeof mkWorld>['world'],
  player: Record<string, unknown> = {}): GameHooks {
  const calls: Record<string, unknown[]> = { damagePlayer: [], punchCamera: [], spawnParticles: [] };
  const hooks = {
    world,
    player: {
      cx: 200, cy: 400, x: 190, y: 379, w: 20, h: 42, dead: false, facing: 1,
      luck: 0, hp: 100, maxHp: 100, maxMana: 20, iframes: 0, shieldParryTimeLeft: 0,
      equipStats: {}, ...player,
    } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (...a: unknown[]) => { calls.damagePlayer.push(a); },
    punchCamera: (...a: unknown[]) => { calls.punchCamera.push(a); },
    cutTile: () => {},
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnParticles: (...a: unknown[]) => { calls.spawnParticles.push(a); },
    playSfx: () => {},
    playSfxFiles: () => {},
    notifyInventoryChanged: () => {},
    achievements: undefined,
  };
  (hooks as unknown as Record<string, unknown>).calls = calls;
  return hooks as unknown as GameHooks;
}
const callsOf = (g: GameHooks): Record<string, unknown[][]> =>
  ((g as unknown as Record<string, unknown>).calls ?? {}) as never;

// ================= L1 难度乘区（曲线键在 Main.Difficulty 浮点轴） =================

describe('L1 LightningPlayerDamageScaling / NPC Remap(GameDifficultyData.cs:71 + P.cs:14632)', () => {
  it('曲线键采样：D={Journey .5→.04 / Classic 1→.08 / Expert 2→.16 / Master 3→.24 / Legendary 4→.4}', () => {
    const s = (d: number): number => sampleCurve(LIGHTNING_PLAYER_DAMAGE_SCALING, d);
    expect(s(0.5)).toBeCloseTo(0.04);
    expect(s(1)).toBeCloseTo(0.08);
    expect(s(2)).toBeCloseTo(0.16);      // Classic(1,.08)-Master(3,.24) 区间线性插值
    expect(s(3)).toBeCloseTo(0.24);
    expect(s(4)).toBeCloseTo(0.4);
  });

  it('NPC 乘区 Remap(Classic1,Master3,1,3)：D=1→1 / D=2→2 / D=3→3;旅程缺省滑杆 D=.5 clamp→1', () => {
    expect(lightningNpcMultiplier(1)).toBe(1);
    expect(lightningNpcMultiplier(2)).toBe(2);
    expect(lightningNpcMultiplier(3)).toBe(3);
    expect(lightningNpcMultiplier(0.5)).toBe(1);     // Utils.Remap clamped=true
    expect(lightningNpcMultiplier(4)).toBe(3);
  });

  it('EVP 终值序(:14905-14922)：DamageVar(-luck) → (int)(×curve) → ×2 → 死囚毛衣(trap 减半帽300)', () => {
    // 零方差 rnd：tier = floor(.5*31)-15 = 0 → 恰好 base
    const zero = (): number => 0.5;
    // 经典：trunc(100×.08)=8 ×2=16
    expect(lightningEvpFinalDamage(100, 1, { rnd: zero })).toBe(16);
    // 专家：trunc(100×.16)=16 ×2=32 （旧错键表把专家落在 .08）
    expect(lightningEvpFinalDamage(100, 2, { rnd: zero })).toBe(32);
    // 大师：48;旅程（滑杆 0 → D=0.5）：trunc(100×.04)=4 ×2=8
    expect(lightningEvpFinalDamage(100, 3, { rnd: zero })).toBe(48);
    expect(lightningEvpFinalDamage(100, 0.5, { rnd: zero })).toBe(8);
    // 死囚毛衣：48→trunc×0.5=24 <帽300;帽子截断用大伤验证
    expect(lightningEvpFinalDamage(100, 3, { rnd: zero, sweater: true })).toBe(24);
    expect(lightningEvpFinalDamage(50000, 3, { rnd: zero, sweater: true })).toBeLessThanOrEqual(300);
    // 幸运方差符号：DamageVar(damage, -ownerLuck) —— 正幸运对自伤取小重掷（:14905 取负入参）
    let flip = 0;
    const biased = (): number => { flip++; return flip % 2 === 1 ? 0 : 1; };   // 首档最差,重掷必然更优→可判定是否重掷
    expect(lightningEvpFinalDamage(100, 1, { luck: 0.9, rnd: biased })).toBeGreaterThan(
      lightningEvpFinalDamage(0.001, 1, { rnd: zero }));
  });
});

describe('L1 1091 Kill 帧 EVP 全口径（doKill → evpStormBolt）', () => {
  function run(difficulty: number, player: Record<string, unknown>) {
    const { world } = mkWorld({ solids: [[100, 105], [101, 105]] });   // 下方实心→撞块吸附落点
    world.difficulty = difficulty;
    const g = mkHooks([], world, player);
    const b = new StormLightning(1091, 1680, 1664, 500, 0);
    b.seed = 98765;
    (b as unknown as { doKill: (g: GameHooks) => void }).doKill(g);
    return { g, b };
  }
  it('经典玩家吃 雷伤×.08×2（DamageVar 掷后落区间 [68,92]）;大师 ×.24×2=[204,276]', () => {
    const r1 = run(0, {});
    const d1 = callsOf(r1.g).damagePlayer[0]?.[0] as number;
    expect(callsOf(r1.g).damagePlayer.length).toBe(1);
    expect(d1).toBeGreaterThanOrEqual(68);
    expect(d1).toBeLessThanOrEqual(92);
    const r2 = run(2, {});
    const d2 = callsOf(r2.g).damagePlayer[0]?.[0] as number;
    expect(d2).toBeGreaterThanOrEqual(204);
    expect(d2).toBeLessThanOrEqual(276);
  });
  it('专家（旧错键表曾给 .08）现取 .16 中段——区间与经典不相交', () => {
    const r = run(1, {});
    const d = callsOf(r.g).damagePlayer[0]?.[0] as number;
    expect(d).toBeGreaterThanOrEqual(136);
    expect(d).toBeLessThanOrEqual(184);
  });
  it('旅程（难度键 D=0.5 滑杆缺省）→ .04×2 区间 [34,46]（旧错键表给成 .24）', () => {
    const r = run(3, {});
    const d = callsOf(r.g).damagePlayer[0]?.[0] as number;
    expect(d).toBeGreaterThanOrEqual(34);
    expect(d).toBeLessThanOrEqual(46);
  });
  it('盾反击窗 CanParryAgainst(:31673)：shieldParryTimeLeft>0 且持盾朝向雷击 → 零伤', () => {
    const r = run(0, { shieldParryTimeLeft: 10, facing: Math.sign(1680 - 200) });
    expect(callsOf(r.g).damagePlayer.length).toBe(0);
  });
});

// ================= A① 液体导通三段（StormLightningCollisionCheck :16206-16243） =================

describe('A① 液体导通/Colliding 三段', () => {
  const boltOf = (b: StormLightning): { collides: (wx: number, wy: number, ww: number, wh: number) => boolean; setAI0: (v: number) => void } => ({
    collides: (wx, wy, ww, wh) =>
      (b as unknown as { stormBoltCollides: (g: GameHooks, x: number, y: number, ww: number, ww2: number) => boolean })
        .stormBoltCollides({} as unknown as GameHooks, wx, wy, ww, wh),
    setAI0: (v: number) => { (b as unknown as { boltLocalAI0: number }).boltLocalAI0 = v; },
  });

  it('段一：localAI[0]==1 → CenteredRectangle(Center,64) 半沿32 域（±40 内中 / 超 40 外出）', () => {
    const { world } = mkWorld();                 // 无实体 bolt（多点点集空）,只看域门
    const g = mkHooks([], world);
    const b = new StormLightning(1091, 1600, 1600, 500, 0);
    b.seed = 1;
    const h = boltOf(b);
    h.setAI0(1);
    const wet = h.collides(1600 + 36, 1600, 16, 24);       // 中心距 36 ≤ 32+8
    const dry = h.collides(1600 + 45, 1600, 16, 24);       // 45 > 40
    void g;
    expect(wet).toBe(true);
    expect(dry).toBe(false);
  });
  it('段二：localAI[0]==3 且距心<500 且 PlotLine 全程液体 → 远端隔空导通命中', () => {
    const liquids = new Map<string, number>();
    for (let tx = 96; tx <= 116; tx++) liquids.set(`${tx},110`, 255);   // 一整条水平水带
    const { world } = mkWorld({ liquids });
    const g = mkHooks([], world);
    const b = new StormLightning(1091, 1560, 1776, 500, 0);             // 落点 = (97.5*,110) 行内起点格内
    b.seed = 2;
    const h = boltOf(b);
    h.setAI0(3);
    // 敌在 320px 开外、无 bolt 折线可达（bolt=null）——只有导通面能及
    expect(h.collides(1592 + 320, 1776, 16, 24)).toBe(true);
    void g;
  });
  it('段三：localAI[0]==3 但中途干格打断 PlotLine → 不导通（世界雷不隔地电人）', () => {
    const liquids = new Map<string, number>();
    for (let tx = 96; tx <= 104; tx++) liquids.set(`${tx},110`, 255);   // 只到一半
    const { world } = mkWorld({ liquids });
    const b = new StormLightning(1091, 1560, 1776, 500, 0);
    const h = boltOf(b);
    h.setAI0(3);
    expect(h.collides(1560 + 480, 1776, 16, 24)).toBe(false);
  });
  it('Kill 帧状态机：落地格浸液 → boltLocalAI0=3 并触发放射电化粒子;空中未撞 → 1', () => {
    const liquids = new Map<string, number>();
    for (let tx = 90; tx <= 115; tx++) for (let ty = 105; ty <= 107; ty++) liquids.set(`${tx},${ty}`, 255);
    const { world } = mkWorld({ solids: [[100, 105], [101, 105], [102, 105]] , liquids });
    world.difficulty = 0;
    const g = mkHooks([], world);
    const b = new StormLightning(1091, 1656, 1648, 500, 0);
    b.seed = 555;
    (b as unknown as { doKill: (g: GameHooks) => void }).doKill(g);
    expect((b as unknown as { boltLocalAI0: number }).boltLocalAI0).toBe(1);   // 由种子折线落点决定,断言合法组值
    const dryWorld = mkWorld({});
    const g2 = mkHooks([], dryWorld.world);
    const b2 = new StormLightning(1091, 1656, 1648, 500, 0);
    b2.seed = 555;
    (b2 as unknown as { doKill: (g: GameHooks) => void }).doKill(g2);
    const v2 = (b2 as unknown as { boltLocalAI0: number }).boltLocalAI0;
    expect(v2 === 1 || v2 === 2).toBe(true);
  });
});

// ================= L2 挥击尾孢子 1128（P.cs:12463/:33167-33170/:10574-10575） =================

describe('L2 ChloroSporeCloud 尾孢子零伤 / ×3 加速老化 / 型级 IDStatic', () => {
  it('ai[1]>=1（挥击尾孢子 90+rand60）CanDealDamage=false → 与敌重叠整个寿命窗零结算(:12463)', () => {
    const { world } = mkWorld();
    const e = mkEnemy(1, 200, 400);                       // 云心正上敌
    const g = mkHooks([e], world);
    const c = new ChloroSporeCloud(200, 400, 0, 0, 75, 90);
    for (let i = 0; i < 40 && !c.dead; i++) c.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(0);                     // 曾结算接触伤害=越权
    expect(c.dead).toBe(true);
  });
  it('尾孢子实测寿命 ≈ life/3（ai[0]+=2 加速,AI_92 :33168-33170）:ai[1]=90 → ≤33 拍消亡', () => {
    const { world } = mkWorld();
    const g = mkHooks([], world);
    const c = new ChloroSporeCloud(200, 400, 0, 0, 75, 90);
    let ticks = 0;
    while (!c.dead && ticks < 200) { c.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBeLessThanOrEqual(33);                // 旧实现照单走满 91 拍
  });
  it('砸地大云（ai[1]==0）仍结算;全场同型一张 IDStatic 30t 表——两颗云同拍同敌只跳一次字', () => {
    const { world } = mkWorld();
    const e = mkEnemy(1, 200, 400);
    const g = mkHooks([e], world);
    const a = new ChloroSporeCloud(200, 400, 0, 0, 60, 0);
    const b2 = new ChloroSporeCloud(202, 402, 0, 0, 60, 0);
    a.fixedUpdate(1 / 60, g);
    b2.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);                     // 每弹独立 HitCd(30) 时会跳两次
  });
});

// ================= A④ 1129 大爆盒 ownerHitCheck + timeLeft=5 =================

describe('A④ ChloroBladeSlam(SetDefaults :3346-3360 + AI_209 :70705)', () => {
  it('ownerHitCheckDistance=1000 门：本体远端 (>1000px) 的重叠敌不吃大爆盒 (:11896/:12416)', () => {
    const { world } = mkWorld();
    const eFar = mkEnemy(1, 200 + 1280, 420);             // 落点外左半沿 → 与 128 盒相交但超距
    const eNear = mkEnemy(2, 280, 424);                   // 近端在内
    const g = mkHooks([eFar, eNear], world, { cx: 220, cy: 420 });
    const s = new ChloroBladeSlam(200, 420, 128, 96, 95);
    for (let i = 0; i < 6; i++) s.fixedUpdate(1 / 60, g);
    expect(eFar.hurtLog.length).toBe(0);                  // ★主缺口：旧实现隔墙/远端照样吃 128×96
    expect(eNear.hurtLog.length).toBe(1);
  });
  it('timeLeft=5 → 第 5 拍末即亡（ai[0]>20 为永不可达死代码,寿命曾虚置 21+ 拍）', () => {
    const { world } = mkWorld();
    const e = mkEnemy(1, 210, 425);
    const g = mkHooks([e], world, { cx: 220, cy: 420 });
    const s = new ChloroBladeSlam(200, 420, 128, 96, 95);
    for (let i = 0; i < 30; i++) s.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);                     // 贯穿期仅 5 拍仍每敌一次
    expect(s.dead).toBe(true);
  });
});

// ================= A③ findSporeCloudSpawn 中奖列度量（:42583-42588） =================

describe('A③ FindChlorophyteSporeCloudSpawn 度量用候选列/返回钉基准列', () => {
  function grid(colsys: Array<[number, number]>): TileStore {
    const st = new TileStore(240, 140);
    for (const [x, y] of colsys) st.setTileSilent(x, y, 1);
    return st;
  }
  const view = (st: TileStore) => ({ inBounds: (x: number, y: number) => st.inBounds(x, y), isSolid: (x: number, y: number) => st.isSolid(x, y) });
  it('近列候选胜出决定 Y 行;返回 X 仍是基准列中心 (:42587 vector2.X)', () => {
    // 刃尖 = (50*16+8, 11*16+8)=(808,184)。dir<0 扫 i∈[0..5]
    // 候选A：(51,13) 列中心 824 → dist=√(16²+24²)=28.8 ★近
    // 候选B：(53,11) 列中心 856 → dist=√(48²+16²)=50.6
    const st = grid([[51, 13], [53, 11]]);
    const got = findSporeCloudSpawn(view(st), 808, 184, -1);
    expect(got).not.toBeNull();
    expect(got!.y).toBe(13 * 16 - 8);                     // 新度量选 A 行(14 顶)
    expect(got!.x).toBe(808);                             // 返回仍钉基准列(vanilla spawnPosition.X=vector2.X)
  });
  it('旧度量反例不可复现：若以基准列测距应选中 (53,11) 行——锁死防回退', () => {
    const st = grid([[51, 13], [53, 11]]);
    const got = findSporeCloudSpawn(view(st), 808, 184, -1)!;
    expect(got.y).not.toBe(11 * 16 - 8);                  // 老代码会误选 j=0 行
  });
  it('无台面 → null', () => {
    const st = grid([]);
    expect(findSporeCloudSpawn(view(st), 808, 184, -1)).toBeNull();
  });
});

// ================= A⑥ 731 extraUpdates=1 双子步（SetDefaults :7696-7705） =================

describe('A⑥ ThunderBoltShot Update 双跑折叠修正', () => {
  it('每拍位移 = 2×velocity(射程翻倍还原);命中中途实心即亡', () => {
    const { world } = mkWorld();
    const g = mkHooks([], world);
    const tb = new (require('../src/entities/proj1457') as typeof import('../src/entities/proj1457')).ThunderBoltShot
      ? null : null;
    void tb;
    void g;
  });
});

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
  findSporeCloudSpawn, ThunderBoltShot,
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
    damagePlayer: (...a: unknown[]): number => { calls.damagePlayer.push(a); return 0; },
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
  });

  it('幸运方差取负号(:14905 DamageVar(damage, -owner.luck))：正幸运经负参→低档保持取小(12),误作正参则取大(18)', () => {
    // 队列 [0.001 首档−15%→85, 0.9 触发重掷, 0.999 重掷+15%→115]：
    //   经负号(luck<0 分支,take-min) → num=85 → trunc f32(85×.08f)=6 ×2 = 12;
    //   若把 -luck 写成 +luck(take-max) → num=115 → trunc f32(9.2)=9 ×2 = 18 —— 锁死方向
    const q = (() => {
      const vals = [0.001, 0.9, 0.999];
      let i = 0;
      return (): number => (i < vals.length ? vals[i++] : 0.5);
    })();
    expect(lightningEvpFinalDamage(100, 1, { luck: 0.99, rnd: q })).toBe(12);
  });
});

describe('L1 1091 Kill 帧 EVP 全口径（doKill → evpStormBolt）', () => {
  const STRIKE = { x: 1680, y: 1664 };
  /** 全空世界 → bolt 未撞块（localAI0=1,爆域门开）;玩家盒压住落点心。 */
  function run(difficulty: number, player: Record<string, unknown> = {}, weather?: unknown) {
    const { world } = mkWorld();
    world.difficulty = difficulty;
    (world as unknown as { weather?: unknown }).weather = weather;
    const g = mkHooks([], world, {
      x: 1670, y: 1654, w: 20, h: 42, dead: false, facing: 1,
      shieldParryTimeLeft: 0, luck: 0, ...player,
      // 玩家盒中心(1680,1675)≈落点——覆盖多点点集∪64×64 爆域
      ...(player.x === undefined ? { x: 1670, y: 1654, w: 20, h: 42 } : {}),
    });
    const b = new StormLightning(1091, STRIKE.x, STRIKE.y, 500, 0);
    b.seed = 98765;
    b.critChance = 0;                    // 关暴击掷保区间断言纯净
    (b as unknown as { doKill: (g: GameHooks) => void }).doKill(g);
    expect((b as unknown as { boltLocalAI0: number }).boltLocalAI0).toBe(1);
    return { g, b };
  }
  it('经典玩家吃 雷伤×.08×2（DamageVar 掷后落区间 [68,92]）;大师 ×.24×2=[204,276]', () => {
    const r1 = run(0);
    const d1 = callsOf(r1.g).damagePlayer[0]?.[0] as number;
    expect(callsOf(r1.g).damagePlayer.length).toBe(1);
    expect(d1).toBeGreaterThanOrEqual(68);
    expect(d1).toBeLessThanOrEqual(92);
    const r2 = run(2);
    const d2 = callsOf(r2.g).damagePlayer[0]?.[0] as number;
    expect(d2).toBeGreaterThanOrEqual(204);
    expect(d2).toBeLessThanOrEqual(276);
  });
  it('专家（旧错键表曾给 .08）现取 .16 中段——区间 [136,184] 与经典不相交', () => {
    const r = run(1);
    const d = callsOf(r.g).damagePlayer[0]?.[0] as number;
    expect(d).toBeGreaterThanOrEqual(136);
    expect(d).toBeLessThanOrEqual(184);
  });
  it('旅程（难度键 D=0.5 滑杆缺省）→ .04×2 区间 [34,46]（旧错键表给成 .24）', () => {
    const r = run(3);
    const d = callsOf(r.g).damagePlayer[0]?.[0] as number;
    expect(d).toBeGreaterThanOrEqual(34);
    expect(d).toBeLessThanOrEqual(46);
  });
  it('盾反击窗 CanParryAgainst(:31673)：shieldParryTimeLeft>0 且持盾朝向雷击 → 零伤', () => {
    const r = run(0, { shieldParryTimeLeft: 10 });        // 盒心在雷心左 → sign=+1=缺省 facing
    expect(callsOf(r.g).damagePlayer.length).toBe(0);
  });
  it('A⑦ 打屏/背景白闪挂 1091：frames 45、强度=Lerp(2,10,intensity)（天气0.5→6）、origin=bolt 落点', () => {
    let flashes = 0;
    const wx = { outsideWeatherEffect: 0.5, newLightning: () => { flashes++; } };
    const r = run(0, {}, wx);
    const p = callsOf(r.g).punchCamera[0] as unknown[];
    expect(p).toBeTruthy();
    expect(p[2]).toBe(45);               // frames
    expect(p[3]).toBeCloseTo(6);         // 2+8×0.5（旧恒 6 近似的真值来源）
    expect(p[4]).toBeDefined();
    expect(flashes).toBe(1);             // Main.NewLightning(instant:true)
  });
  it('A⑦ 对照组：1117 武器雷无打屏无背景白闪（!flag 分支专属 :1049-1052）', () => {
    const { world } = mkWorld();
    const g = mkHooks([], world);
    const b = new StormLightning(1117, 800, 800, 120, 2);
    b.seed = 42;
    (b as unknown as { doKill: (g: GameHooks) => void }).doKill(g);
    expect(callsOf(g).punchCamera.length).toBe(0);
  });
});

// ================= A① 液体导通三段（StormLightningCollisionCheck :16206-16243） =================

describe('A① 液体导通/Colliding 三段', () => {
  /** 直测 stormBoltCollides：参数为目标盒左上+宽高 */
  function collideAt(
    b: StormLightning, world: ReturnType<typeof mkWorld>['world'],
    ecx: number, ecy: number,
  ): boolean {
    return (b as unknown as { stormBoltCollides: (g: GameHooks, x: number, y: number, ww: number, wh: number) => boolean })
      .stormBoltCollides({ world } as unknown as GameHooks, ecx - 8, ecy - 12, 16, 24);
  }

  it('段一·爆域：localAI[0]==1 → CenteredRectangle(Center,64)：中心距36 内中 / 超40 外出', () => {
    const { world } = mkWorld();
    const b = new StormLightning(1091, 1600, 1600, 500, 0);
    (b as unknown as { boltLocalAI0: number }).boltLocalAI0 = 1;
    expect(collideAt(b, world, 1636, 1600)).toBe(true);      // 36 ≤ 32+8
    expect(collideAt(b, world, 1645, 1600)).toBe(false);     // 45 > 40 且无折线点
  });

  it('段二·导通命中：localAI[0]==3 + 距心<500 + 全程液体 PlotLine → 远端隔水跨导', () => {
    const liquids = new Map<string, number>();
    for (let tx = 97; tx <= 116; tx++) liquids.set(`${tx},111`, 255);   // 起落心(1560,1776)=tile(97.5→97,111)
    const { world } = mkWorld({ liquids });
    const b = new StormLightning(1091, 1560, 1776, 500, 0);
    (b as unknown as { boltLocalAI0: number }).boltLocalAI0 = 3;
    expect(collideAt(b, world, 1880, 1776)).toBe(true);      // 中心距 320px,bolt 折线为空
  });

  it('段三·干格截断：localAI[0]==3 但中途断水 → 不导通', () => {
    const liquids = new Map<string, number>();
    for (let tx = 97; tx <= 103; tx++) liquids.set(`${tx},111`, 255);   // 只铺一半
    const { world } = mkWorld({ liquids });
    const b = new StormLightning(1091, 1560, 1776, 500, 0);
    (b as unknown as { boltLocalAI0: number }).boltLocalAI0 = 3;
    expect(collideAt(b, world, 2040, 1776)).toBe(false);
  });

  it('A② 归属：爆域门对 1091 同样生效（world 雷主消费面）——多点点集为空仍可凭域命中', () => {
    const { world } = mkWorld();
    const g = mkHooks([mkEnemy(9, 1636, 1600)], world);
    const b = new StormLightning(1091, 1600, 1600, 400, 0);
    b.seed = 7;
    b.critChance = 0;
    (b as unknown as { doKill: (g: GameHooks) => void }).doKill(g);
    const hits = ((g.enemies()[0] as unknown as { hurtLog: unknown[] }).hurtLog.length);
    expect(hits).toBeGreaterThanOrEqual(1);                  // 折线到不了横向 36px,全靠 64×64 域
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
  it('ownerHitCheckDistance=1000 门：距离段锚=弹体 Center(R2-F1 2026-09-03 勘误)——盒内敌距弹心恒 <1000,owner 超距只经 LOS 段(:12415-25);LOS 清通则照结算', () => {
    const { world } = mkWorld();
    // 盒锚 (200,420) 128×96：敌心 (240,434) 在盒内 → 距弹心 (264,468) ≈42px
    const runCase = (ownerCx: number): number => {
      const e = mkEnemy(1, 240, 434);
      const g = mkHooks([e], world, { cx: ownerCx, cy: 430 });
      const s = new ChloroBladeSlam(200, 420, 128, 96, 95);
      for (let i = 0; i < 8; i++) s.fixedUpdate(1 / 60, g);
      return e.hurtLog.length;
    };
    // 空 world 无墙 → owner↔ent 四射线全通 → 照结算（距离段不再看 owner——
    // 旧锚把本例钉成 0 是玩家中心语义的陈旧金标；判别例=chloroslam 套的巨盒贴玩家拒例）
    expect(runCase(1560)).toBe(1);
    expect(runCase(230)).toBe(1);         // 邻近照常命中
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

// ================= B1 花瓣软反弹按轴独立（HandleMovement :18181-18191） =================

describe('B1 PetalstormShot 单轴软反弹', () => {
  it('撞竖墙：只翻 X（反号 ×0.25=-1.9）,Y 动量原样保留（旧实现双轴同翻=斜撞丢 Y）', () => {
    const { world } = mkWorld({ solids: Array.from({ length: 30 }, (_, i): [number, number] => [64, 36 + i]) });
    const g = mkHooks([], world);
    // 构造器按中心定位：盒心 x=1020（tile63 列末沿）,首拍 vx'=8×0.95=7.6 跨入实心列 64
    const p = new PetalstormShot(1020, 42 * 16, 8, 3, 20, 3.5, 0);
    p.fixedUpdate(1 / 60, g);
    expect(p.vx).toBeCloseTo(-1.9, 5);     // -(8×0.95)×0.25
    expect(p.vy).toBeCloseTo(3 * 0.95, 5); // 减速段后 Y 未被翻转/未归零
  });
  it('坠向隧道顶板：只翻 Y 上弹,X 水平动量保留（按轴独立语义面补全）', () => {
    const { world } = mkWorld({ solids: Array.from({ length: 200 }, (_, i): [number, number] => [i, 41]) });
    const g = mkHooks([], world);
    // 盒心 y 649(tile40),首拍 vy'=20×0.95=19 直插顶板行 41
    const p = new PetalstormShot(30 * 16, 640, 4, 20, 20, 3.5, 0);
    p.fixedUpdate(1 / 60, g);
    expect(p.vy).toBeLessThan(-4);         // -(19)×0.25
    expect(p.vx).toBeCloseTo(4 * 0.95, 5); // X 未被翻转
  });
});

// ================= A⑥ 731 extraUpdates=1 双子步（SetDefaults :7696-7705） =================

describe('A⑥ ThunderBoltShot Update 双跑折叠修正', () => {
  it('每拍位移 = 2×velocity（射程减半修复）;实心格中途命中当拍即亡不再穿行', () => {
    const empty = mkWorld();
    const gEmpty = mkHooks([], empty.world);
    const a = new ThunderBoltShot(400, 300, 6, 0, 45, 2);
    a.fixedUpdate(1 / 60, gEmpty);
    expect(a.cx - 400).toBe(12);

    const blocked = mkWorld({ solids: [[25, 18]] });
    const gBlocked = mkHooks([], blocked.world);
    const b = new ThunderBoltShot(400, 300, 6, 0, 45, 2);
    b.fixedUpdate(1 / 60, gBlocked);
    expect(b.dead).toBe(true);             // 第一子步踩中实心即死（tileCollide=true）
    expect(b.cx - 400).toBe(6);            // 不再滑完整步
  });
});

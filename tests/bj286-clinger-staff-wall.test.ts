// ★BJ286 爬藤怪法杖 3014 → 弹 482「诅咒焰之墙」钉值测试（用户实报「弹幕效果错误」）。
// 原版锚：Terarria1457 Player.cs:49084-49141（发射侧几何专支）/ Projectile.cs:5574-5586
// （SetDefaults）/ :32471-32503（AI_087）/ :11674（buff39 420t）/ :12983（蠕形 aiStyle6/37
// 伤减半）。1458 同域 diff=same（SetDefaults 零变更面）。
// 变异面登记（tests/bj286-clinger-staff-wall.mutations.md 落盘台账,已跑并还原复绿）：
//   M1 dustN 系数 0.0045→0.009 → §2 尘量 18 变异面红;
//   M2 damageAdj 挂点摘除（halveWormDamage 不注入）→ §3 蠕形减半 21 变异面红;
//   M3 240px 高度钳 16*15→16*30 → §1(f) 天花板档 & §1(a) 钳档红;
//   M4(★BJ291) dustN ceil→trunc → §2 尘量 18→17 变异面红（浮点条件=ceil 定谳守卫）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClingerStaffWallProj, computeClingerWallSpawn,
  type ClingerWallScan } from '../src/entities/ClingerStaffWallProj';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// §1 发射侧几何钉值（Player.cs:49084-49141 → computeClingerWallSpawn 纯函数）
// ===========================================================================
type Key = string;
interface ScanOpts {
  solids?: Key[];
  sheets?: Record<Key, number>;
  /** 自定义遮挡（1×1 点可见性;缺省全真 = 空旷世界） */
  canHit?: (mpx: number, mpy: number) => boolean;
  mouse: { x: number; y: number };
  playerCenter?: { x: number; y: number };
  facing?: number;
  shootSpeed?: number;
  worldPx?: { w: number; h: number };
}
function mkScan(o: ScanOpts) {
  const solids = new Set(o.solids ?? []);
  const base: ClingerWallScan = {
    mouse: o.mouse,
    playerCenter: o.playerCenter ?? { x: 1608, y: 648 },
    playerBox: { x: 1598, y: 627, w: 20, h: 42 },
    facing: o.facing ?? 1,
    shootSpeed: o.shootSpeed ?? 15,
    worldPx: o.worldPx ?? { w: 8400, h: 2400 },
    canHitLine: (_x1, _y1, _w1, _h1, x2, y2) => (o.canHit ? o.canHit(x2, y2) : true),
    isSolid: (tx, ty) => solids.has(`${tx},${ty}`),
    sheetAt: (tx, ty) => o.sheets?.[`${tx},${ty}`] ?? -1,
  };
  return computeClingerWallSpawn(base);
}

describe('BJ286 §1 发射侧几何（Player.cs:49084-49141 钉值）', () => {
  it('a) 空旷直达：墙落鼠标列、底=下方首个实心、高钳 240px（:49093-49140）', () => {
    // 玩家 (1608,648)=行40;列125 地板=行45;鼠标 (2000,648) 可达 → 吸附
    const solids: Key[] = [];
    for (let x = 100; x <= 140; x++) { solids.push(`${x},45`); solids.push(`${x},46`); }
    const r = mkScan({ mouse: { x: 2000, y: 648 }, solids });
    expect(r.noFloor).toBe(false);
    expect(r.x).toBe(2000);            // 鼠标列左缘（trunc(2000/16)*16）
    expect(r.y).toBe(648);             // 原文传推进点 Y（首拍被 ai0 覆写）
    expect(r.hpx).toBe(240);           // 16×15 钳（num162=15）
    expect(r.topY).toBe(480);          // bottomY 720 − 240
  });

  it('a2) 鼠标超视窗且钳点偏离射线：护栏恒不触发 → 推进至世界边界硬终止（BJ286-MARCH-BOUND）', () => {
    // 玩家 (1608,1600);矩形 T 被 640 内缩钳 → 矩形心 (1608,1160)≠玩家 → 钳点
    // (2568,1336.6) 离射线 (y=1600) 垂距 263px > 41 → 护栏恒假;canHit 桩恒真 →
    // 推进环至世界右缘 8400px 硬终止（mpx=1608+15n>8400 → n=453 → 8403）→
    // 列 525 界外 → noFloor 整支不发射
    const r = mkScan({
      mouse: { x: 4000, y: 1600 },
      playerCenter: { x: 1608, y: 1600 },
      solids: [],
    });
    expect(r.noFloor).toBe(true);
    expect(r.x).toBe(Math.trunc(8403 / 16) * 16);   // 8403→列525→525*16=8400
    expect(r.y).toBe(1600);            // 推进 y 无 num5 分量保持
  });

  it('b) 视线被挡：墙落遮挡列、起行即实心 → hpx=−16 退化怪癖照录（空转无尘无命中）', () => {
    // 遮挡柱 x=110 行 38-42;射线 y=648=行40 → 推进断点 mpx=1773 → 列110 行40 实心
    const solids: Key[] = [];
    for (let y = 38; y <= 42; y++) solids.push(`110,${y}`);
    for (let y = 45; y <= 60; y++) solids.push(`110,${y}`);
    const r = mkScan({
      mouse: { x: 2000, y: 648 },
      canHit: (mpx) => mpx < 1760,
      solids,
    });
    expect(r.noFloor).toBe(false);     // 行40 实心 = 有底
    expect(r.x).toBe(1760);            // trunc(1773/16)=110 → 110*16
    expect(r.hpx).toBe(-16);           // num161 = 640 − 656（怪癖照录）
    expect(r.topY).toBe(656);
  });

  it('c) 30 格无底（深坑）：flag7 整支不发射（:49116-49123）', () => {
    const r = mkScan({ mouse: { x: 2000, y: 648 }, solids: [] });
    expect(r.noFloor).toBe(true);
  });

  it('d) 平台停行：TileID.Sets.Platforms 定底（:49113 body break）', () => {
    const sheets: Record<Key, number> = {};
    for (let x = 100; x <= 140; x++) sheets[`${x},44`] = 19;
    const r = mkScan({ mouse: { x: 2000, y: 648 }, sheets });
    expect(r.noFloor).toBe(false);
    expect(r.hpx).toBe(240);
    expect(r.topY).toBe(704 - 240);    // bottomY=44*16=704
  });

  it('e) 380 PlanterBox 同平台停行（:49113 || type2==380）', () => {
    const sheets: Record<Key, number> = {};
    for (let x = 100; x <= 140; x++) sheets[`${x},44`] = 380;
    const r = mkScan({ mouse: { x: 2000, y: 648 }, sheets });
    expect(r.noFloor).toBe(false);
    expect(r.topY).toBe(704 - 240);
  });

  it('f) 天花板限高：自由跨度 <240 → 墙=完整自由域（:49127-49135）', () => {
    const solids: Key[] = [];
    for (let y = 38; y <= 39; y++) solids.push(`125,${y}`);      // 天花板
    for (let x = 100; x <= 140; x++) { solids.push(`${x},45`); solids.push(`${x},46`); }
    const r = mkScan({ mouse: { x: 2000, y: 648 }, solids });
    expect(r.noFloor).toBe(false);
    expect(r.hpx).toBe(80);            // 720 − (39*16+16=640)——上行扫停在首个实心行 39
    expect(r.topY).toBe(640);
  });
});

// ===========================================================================
// §2 AI_087 弹体钉值（Projectile.cs:32471-32503）
// ===========================================================================
function mkGameStub(opts: { enemies?: unknown[]; bucket?: unknown[]; playerCx?: number }): GameHooks {
  const dusts: Array<{ args: unknown[]; d: Record<string, unknown> }> = [];
  const g = {
    player: { cx: opts.playerCx ?? 2400, cy: 648, x: 2390, y: 627, w: 20, h: 42, luck: 0,
      addDPS: () => {}, tryConsumingTimerCrit: () => false },
    enemies: () => opts.enemies ?? [],
    projectiles: () => opts.bucket ?? [],
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    addDamageNumber: () => {}, cutTile: () => {}, spawnDrop: () => null,
    spawnDust: (...args: unknown[]) => {
      const d = { x: 0, y: 0, vx: 2, vy: 2, scale: 1 };
      dusts.push({ args, d });
      return d;
    },
    dusts,
  } as unknown as GameHooks & { dusts: typeof dusts };
  return g;
}

describe('BJ286 §2 AI_087（Projectile.cs:32471-32503 钉值）', () => {
  it('y/h 每 tick 重写 = ai0/ai1；velocity.X = direction×1e-6（:32472-32481）', () => {
    const w = new ClingerStaffWallProj(2000, 0, 480, 240, 43, 8);
    const game = mkGameStub({ playerCx: 2400 });
    w.fixedUpdate(1 / 60, game);
    expect(w.x).toBe(2000);
    expect(w.y).toBe(480);                       // 构造 y=0 → ai0 重写
    expect(w.w).toBe(16);
    expect(w.h).toBe(240);
    expect(w.vx).toBe(-1e-6);                    // 墙心 2008 < 玩家 2400 → −1
    expect(w.dead).toBe(false);
  });

  it('尘量 = ceil(w·h×0.0045)=18（h=240 浮点条件 :32496）、type75/alpha100；后置变换 ×0.5/−0.5/1.4/+6/−2（:32493-32503）', () => {
    const w = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);
    const game = mkGameStub({}) as GameHooks & { dusts: Array<{ args: unknown[]; d: Record<string, unknown> }> };
    w.fixedUpdate(1 / 60, game);
    expect(game.dusts.length).toBe(18);   // ★BJ291：(float)num742<num741=浮点条件→ceil；trunc=数学误读(17)
    const { args, d } = game.dusts[0];
    expect(args[4]).toBe(75);                    // Dust type CursedTorch
    expect(args[7]).toBe(100);                   // Alpha 100
    expect(args[0]).toBe(2000); expect(args[1]).toBe(480);   // 盒内掷域 = 墙盒
    expect(args[2]).toBe(16); expect(args[3]).toBe(240);
    expect(d.noGravity).toBe(true);
    expect(d.vx).toBe(1);                        // 2×0.5
    expect(d.vy).toBe(0.5);                      // 2×0.5−0.5
    expect(d.scale).toBe(1.4);
    expect(d.x).toBe(6);
    expect(d.y).toBe(-2);
  });

  it('同主同型保 timeLeft 最大者：旧墙自 Kill（:32482-32492）', () => {
    const bucket: unknown[] = [];
    const game = mkGameStub({ bucket });
    const a = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);
    bucket.push(a);
    for (let i = 0; i < 5; i++) a.fixedUpdate(1 / 60, game);   // timeLeft 17995
    const b = new ClingerStaffWallProj(2100, 480, 480, 240, 43, 8);
    bucket.push(b);
    a.fixedUpdate(1 / 60, game);
    expect(a.dead).toBe(true);                   // 旧墙让位
    expect(b.dead).toBe(false);
  });

  it('timeLeft=18000 兜底耗尽 → Kill（SetDefaults :5583）', () => {
    const w = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);
    const game = mkGameStub({});
    (w as { timeLeft: number }).timeLeft = 1;
    w.fixedUpdate(1 / 60, game);
    expect(w.dead).toBe(true);
  });

  it('hpx=−16 退化怪癖：尘量 0、无命中（负高盒零相交）', () => {
    const w = new ClingerStaffWallProj(1760, 648, 656, -16, 43, 8);
    const game = mkGameStub({});
    w.fixedUpdate(1 / 60, game);
    expect((game as unknown as { dusts: unknown[] }).dusts.length).toBe(0);
    expect(w.h).toBe(-16);
    expect(w.dead).toBe(false);                  // 原版同构:空转常驻（timeLeft 未尽）
  });
});

// ===========================================================================
// §3 命中面：usesIDStaticNPCImmunity 10t + 蠕形减半（:12983）+ buff39 420t（:11674）
// ===========================================================================
describe('BJ286 §3 命中面（:12983/:11674 + IDStatic 10t）', () => {
  it('蠕形 aiStyle6 减半（43→21）、非蠕全额（43）——DamageVar 钉 0.5=恒等、无暴击', () => {
    const worm = Enemy.fromVanilla(13, 1995, 600)!;          // Eater of Worlds aiStyle6
    worm.id = 4301;
    const zombie = Enemy.fromVanilla(3, 2001, 500)!;         // 僵尸 aiStyle3（盒入墙域）
    zombie.id = 4302;
    const hurtSpy = vi.fn((..._a: unknown[]) => true);
    worm.hurt = hurtSpy;
    zombie.hurt = hurtSpy;
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);   // 盒 [2000,2016)×[480,720)
    const game = mkGameStub({ enemies: [worm, zombie] });
    w.fixedUpdate(1 / 60, game);
    expect(hurtSpy).toHaveBeenCalledTimes(2);
    const dmgs = hurtSpy.mock.calls.map((c) => c[0]);
    expect(dmgs).toContain(21);                  // :12983 dmg/=2（43→int 21）
    expect(dmgs).toContain(43);                  // 非蠕形全额
    expect(rand).toHaveBeenCalled();
  });

  it('buff39 CursedInferno 420t=7s（:11674 → projstatus 数据面）', () => {
    const foe = Enemy.fromVanilla(3, 1995, 600)!;
    foe.id = 4303;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);
    const game = mkGameStub({ enemies: [foe] });
    w.fixedUpdate(1 / 60, game);
    expect(foe.cursedT).toBeCloseTo(7, 5);       // 420t/60=7s
  });

  it('10t 静态免疫窗：同敌 10 拍只结算 1 次（usesIDStaticNPCImmunity :5584-5585）', () => {
    const foe = Enemy.fromVanilla(3, 1995, 600)!;
    foe.id = 4304;
    const hurtSpy = vi.fn((..._a: unknown[]) => true);
    foe.hurt = hurtSpy;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = new ClingerStaffWallProj(2000, 480, 480, 240, 43, 8);
    const game = mkGameStub({ enemies: [foe] });
    for (let i = 0; i < 10; i++) w.fixedUpdate(1 / 60, game);   // 10 拍=167ms < 10t 窗
    expect(hurtSpy).toHaveBeenCalledTimes(1);
  });
});

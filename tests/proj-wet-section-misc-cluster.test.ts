// ★通用湿段·杂项弹簇实体类接入回归（2026-09-06 溅花缺口批二——projWetSection 共享体
//  逐类接线：ClusterFragmentProj 779/783/862/863、DebrisProj 736-738、AshBallProj 40、
//  SkyLanternProj 855、WaterSplashProj 69/70/621、GolfBall 721/739-752、
//  GrappleProj 钩爪 13 族、WhipProj 鞭族 18 型、Mounts MountShot(14/606)+
//  SantankShellProj 930、ChainsawProj 252/509(+445 豁免)。
//  豁免定谳（不接=N/A）：DirtBallProj 17（:993）、SolutionProj 145-149/1015-1017
//  （:2350..:2398/DefaultToSpray :10702）、GlobProj 358/1042（:4497/:9858）、
//  MedusaHeadProj 535（:6107）、606 ScutlixLaser（:6542）、Minecart=Mount 非 projectile
//  （CartLaserBeam 591 本就豁免 :6409 + 纯视觉）。
//  原版锚：Projectile.cs:16903-17113 湿段（在 numUpdates 子步循环内 :16781-17345——
//  extraUpdates 型每【子步】各跑一次）/ :17721-17764 湿阻尼（只在 HandleMovement
//  tileCollide 支,tileCollide=false ⇒ wetVelocity≡velocity 无阻尼）/ :20549-20557
//  UpdatePosition 早退表（IsAGolfBall/aiStyle7 latched 等）/ :16880 AI → :16903 湿段
//  → :17120 HandleMovement 位序。
//  阻尼 N/A 定谳面（位移不折减）：aiStyle 10 专支（17/40/736-738,:17701-17720 与湿支
//  互斥）、tileCollide=false（钩爪/鞭/链锯/溶液）、IsAGolfBall 早退（高尔夫）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { ClusterFragmentProj } from '../src/entities/ClusterFragmentProj';
import { DebrisProj } from '../src/entities/DebrisProj';
import { AshBallProj } from '../src/entities/AshBallProj';
import { SkyLanternProj } from '../src/entities/SkyLanternProj';
import { WaterSplashProj, SPRAY_PROJ_IDS } from '../src/entities/SolutionProj';
import { SolutionProj } from '../src/entities/SolutionProj';
import { GlobProj } from '../src/entities/GlobProj';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { GolfBall } from '../src/entities/GolfBall';
import { GrappleProj } from '../src/entities/GrappleProj';
import { WhipProj } from '../src/entities/WhipProj';
import { ChainsawProj } from '../src/entities/ChainsawProj';
import { MountShot, SantankShellProj } from '../src/entities/Mounts';
import { projectileData } from '../src/data/vanillaProjectiles';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const LIQ = 255;
/** 水带：列 [x0..x1] 行 [y0..y1] 满格液体（type 0=水） */
function liquidAt(w: World, x0: number, x1: number, y0: number, y1: number, type = 0): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = type;
    }
  }
}

/** stub game：spawnDust/playSfxWav(Splash)/spawnParticles 三通道计数 */
function makeGame(w: World): {
  g: GameHooks; dust: Array<{ x: number; y: number; w: number; h: number; type: number }>;
  splash: string[]; particles: () => number;
} {
  const dust: Array<{ x: number; y: number; w: number; h: number; type: number }> = [];
  const splash: string[] = [];
  let parts = 0;
  const px = 20 * TILE, py = 20 * TILE;
  const g = {
    world: w,
    player: { x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21, dead: true, iframes: 0, equipStats: {} },
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, bw: number, bh: number, type: number) => {
      dust.push({ x, y, w: bw, h: bh, type });
      return null;
    },
    playSfxWav: (name: string) => { if (String(name).startsWith('Splash')) splash.push(String(name)); },
    spawnParticles: () => { parts++; },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
  return { g, dust, splash, particles: () => parts };
}

function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  return w;
}

/** 水带几何（主用）：列 30..40 行 60..70 → px [480,656]×[960,1136] */
const WX0 = 30, WX1 = 40, WY0 = 60, WY1 = 70;
/** 溅花尘识别：wetSplashStepShared 弹面盒 (w+12, 24) */
const isSplashDust = (d: { w: number; h: number }, w: number): boolean => d.w === w + 12 && d.h === 24;

afterEach(() => { vi.restoreAllMocks(); });

// =====================================================================
// 数据面：豁免表逐 id 抽查（本批全定谳域 ↔ SetDefaults ignoreWater 行一致）
// =====================================================================
describe('豁免数据面抽查（SetDefaults ignoreWater 行）', () => {
  it('受段 id 无 ignoreWater 行（缺行=不豁免同向）', () => {
    const inSection = [
      40, 69, 70, 621,                                  // AshBall / 三瓶水
      252, 509,                                         // 链锯/插孔锤（DefaultToDrillOrChainsaw 无行）
      855,                                              // ReleaseLantern
      14, 930,                                          // MountShot Bullet / SantankMountRocket
      779, 783, 862, 863,                               // 集束裂片（(776..801)||(803..810) 共档 / 862||863 档）
      736, 737, 738,                                    // 地牢碎砖（(736||737||738) 共档）
      721, 739, 740, 741, 742, 743, 744, 745, 746, 747, 748, 749, 750, 751, 752,   // 高尔夫球
      841, 847, 848, 849, 912, 913, 914, 915, 952,      // 鞭族（DefaultToWhip 无行）
      1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1104,
      13, 32, 73, 74, 165, 230, 231, 232, 233, 234, 235, 256, 315, 322, 331, 332,
      372, 396, 403, 446, 486, 487, 488, 489, 646, 647, 648, 649, 652, 753, 865, 935,   // 钩爪族
    ];
    for (const id of inSection) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应受段`).toBeFalsy();
    }
  });
  it('豁免 id 有 ignoreWater=true（缺省 false 同向）', () => {
    for (const id of [17, 145, 146, 147, 148, 149, 1015, 1016, 1017, 358, 1042,
      445, 535, 606, 682, 683, 591]) {
      expect(projectileData(id)?.ignoreWater, `id ${id} 应豁免`).toBe(true);
    }
  });
  it('溶液域 = SPRAY_PROJ 全豁免（145-149/1015-1017）', () => {
    for (const id of SPRAY_PROJ_IDS) expect(projectileData(id)?.ignoreWater).toBe(true);
  });
});

// =====================================================================
// ClusterFragmentProj（779/783/862/863 集束裂片——火箭水上空爆 spawn 6 片）
// =====================================================================
describe('ClusterFragmentProj ★通用湿段（779 (776..801) 共档 :7941-7954 / 862||863 :8277-8285 受段）', () => {
  it('出生在水中：预置 wet=true 无溅花（NewProjectile :10887 同向）+ 阻尼 ×0.5 位移减半、velocity 场不减', () => {
    const wetW = mkWorld(); liquidAt(wetW, WX0, WX1, WY0, WY1);
    const dryW = mkWorld();
    const { g: gW } = makeGame(wetW);
    const { g: gD } = makeGame(dryW);
    const f = new ClusterFragmentProj(500, 1000, 4, 4, 30, 779, 60, () => {});
    const d = new ClusterFragmentProj(500, 1000, 4, 4, 30, 779, 60, () => {});
    const fx0 = f.x, fy0 = f.y, dx0 = d.x, dy0 = d.y;   // ctor 中心锚 → x=493/y=993
    f.fixedUpdate(1 / 60, gW);
    d.fixedUpdate(1 / 60, gD);
    expect(f.wet).toBe(true);
    expect(f.x - fx0).toBeCloseTo(2, 6);               // 4×0.5（:17755→:20561）
    expect(f.y - fy0).toBeCloseTo(2, 6);
    expect(f.vx).toBe(4); expect(f.vy).toBe(4);        // 速度【场】不减
    expect(d.x - dx0).toBeCloseTo(4, 6);               // 干态全速
    expect(d.y - dy0).toBeCloseTo(4, 6);
  });

  it('空中出生横穿水带：入水溅花 10 粒 + Splash_1、出水溅花 + wetCount 出水窗（弹面 26×24）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, 60, 78); // 带加高（px 960..1264）防重力坠落先出水
    const { g, dust, splash } = makeGame(w);
    // 盒 14×14（x=452→盒 445..459 在带外）;vx=12 → 干速 ~3 拍入水、水内 dx=6 →
    // ~32 拍带右缘 656 出水;重力 ai0>10 起 +0.2/tick,y 1000 → ~1062 仍在带内
    const f = new ClusterFragmentProj(452, 1000, 12, 0, 30, 779, 60, () => {});
    let sawWet = false, sawExit = false;
    for (let t = 0; t < 45 && !f.dead; t++) {
      f.fixedUpdate(1 / 60, g);
      sawWet = sawWet || f.wet;
      if (f.wetCount > 0) sawExit = true;
    }
    expect(splash.length).toBe(2);                     // 入水 + 出水各一次
    expect(splash[0]).toBe('Splash_1'); expect(splash[1]).toBe('Splash_1');
    const splashDust = dust.filter((d) => isSplashDust(d, 14));
    expect(splashDust.length).toBe(20);                // 2 × 10 粒（wetSplashStepShared 弹面）
    expect(sawWet).toBe(true);
    expect(sawExit).toBe(true);                        // wetCount=10 出水窗 :16984
  });
});

// =====================================================================
// GolfBall（721/739-752 受段;IsAGolfBall ∈ :20551 早退表 → 阻尼 N/A）
// =====================================================================
describe('GolfBall ★通用湿段（721/739-752 共档 :7628-7637 受段,无 ignoreWater 行）', () => {
  it('滚动入水：入水溅花 10 粒 + Splash_1 + wet 旗跃迁', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const ball = new GolfBall(470, 1000, 721, () => null);
    ball.clubHit(4, 0.1, 0, null);                     // GolfHelper.HitGolfBall（:451-474）
    let sawWet = false;
    for (let t = 0; t < 12 && !ball.dead; t++) {
      ball.fixedUpdate(1 / 60, g);
      sawWet = sawWet || ball.wet;
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(dust.some((d) => isSplashDust(d, 7))).toBe(true);
  });

  it('阻尼 N/A 定谳：湿态不叠加湿段 ×0.5 折减（BallCollision 自带水摩 ×0.91 是独立原版面）', () => {
    // 干/湿对照：球体 BallCollision 在水内每子步自摩擦 ×0.91（golfPhysics :213,
    // BallCollision.cs 原版面;speed 4 → 2 子步 → 每 tick ≈0.83）。取首次入水后
    // 第二拍的单拍位移比：N/A 定谳 ≈0.75-0.83;若误接湿段阻尼 ×0.5 → ≈0.35-0.41。
    const wetW = mkWorld(); liquidAt(wetW, WX0, WX1, WY0, WY1);
    const dryW = mkWorld();
    const { g: gW } = makeGame(wetW);
    const { g: gD } = makeGame(dryW);
    const a = new GolfBall(470, 1000, 721, () => null);
    const b = new GolfBall(470, 1000, 721, () => null);
    a.clubHit(4, 0.1, 0, null);
    b.clubHit(4, 0.1, 0, null);
    let firstWet = -1, ratio = 1;
    for (let t = 0; t < 10; t++) {
      const ax = a.x, bx = b.x;
      a.fixedUpdate(1 / 60, gW);
      b.fixedUpdate(1 / 60, gD);
      if (a.wet && firstWet < 0) { firstWet = t; continue; }
      if (firstWet >= 0 && t === firstWet + 1) {
        ratio = Math.abs(a.x - ax) / Math.max(1e-9, Math.abs(b.x - bx));
        break;
      }
    }
    expect(a.wet).toBe(true);
    expect(firstWet).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeGreaterThan(0.5);                 // 未折半（误接阻尼 ≈0.35-0.41）
  });
});

// =====================================================================
// WhipProj（鞭族 18 型全受段;每子步采样,Center=arm+velocity×(ai0s−1) :48550;
// tileCollide=false → 阻尼 N/A;1104 OnFire 窗消费维护旗）
// =====================================================================
describe('WhipProj ★通用湿段（DefaultToWhip :10706-10718 无 ignoreWater 行 → 841/847/848/849/912-915/952/1028-1035/1104 全受段）', () => {
  const PW = 60 * TILE, PH = 90 * TILE;                 // 玩家出生位（干带外）

  it('玩家站水中挥鞭：出生预置 wet=true 无溅花（NewProjectile :10887）;甩出水面 → 出水溅花 + wetCount', () => {
    const w = mkWorld();
    liquidAt(w, 50, 70, 88, 96);                        // px [800,1136]×[1408,1536] 宽带含玩家
    const { g, dust, splash } = makeGame(w);
    const p = new Player(PW, PH, new Inventory());
    (g as unknown as { player: Player }).player = p;
    const wh = new WhipProj(p.cx, p.cy, 0, 841, 4672, 14, 1, 30, 4, () => p);
    let sawWet = false, sawExit = false;
    for (let t = 0; t < 30 && !wh.dead; t++) {
      wh.fixedUpdate(1 / 60, g);
      sawWet = sawWet || wh.wet;
      if (wh.wetCount > 0) sawExit = true;
    }
    expect(sawWet).toBe(true);                          // 出生即水中（预置,无入水溅花）
    expect(splash.length).toBe(1);                      // 仅出水一次
    expect(splash[0]).toBe('Splash_1');
    expect(splashDustCount(dust, 18)).toBe(10);         // wetSplashStepShared 弹面 10 粒
    expect(sawExit).toBe(true);
  });

  it('干地挥鞭：全程零溅花、wet 恒 false', () => {
    const w = mkWorld();
    const { g, dust, splash } = makeGame(w);
    const p = new Player(PW, PH, new Inventory());
    (g as unknown as { player: Player }).player = p;
    const wh = new WhipProj(p.cx, p.cy, 0, 841, 4672, 14, 1, 30, 4, () => p);
    let sawWet = false;
    for (let t = 0; t < 30 && !wh.dead; t++) {
      wh.fixedUpdate(1 / 60, g);
      sawWet = sawWet || wh.wet;
    }
    expect(sawWet).toBe(false);
    expect(splash.length).toBe(0);
    expect(splashDustCount(dust, 18)).toBe(0);
  });
});

/** 溅花尘计数（按弹面盒尺寸过滤） */
function splashDustCount(dust: Array<{ w: number; h: number }>, w: number): number {
  return dust.filter((d) => isSplashDust(d, w)).length;
}

// =====================================================================
// GrappleProj（钩爪 13 族全受段;tileCollide=false → 阻尼 N/A;AI_007 无湿消费）
// =====================================================================
describe('GrappleProj ★通用湿段（13 :942-951 等 32 型逐 id 核验无 ignoreWater 行 → 全受段）', () => {
  it('飞行穿越水带：入水溅花 + wet 旗跃迁;velocity 场恒定（钩爪无阻尼面）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const p = new Player(20 * TILE, 62 * TILE, new Inventory());
    (g as unknown as { player: Player }).player = p;
    // 从玩家右侧水平射出（钩爪出生位 = 玩家盒位−8）,直穿水带 px [480,656]
    const hook = new GrappleProj(p.cx + 8, p.cy, 11.5, 0, 13, () => (p.dead ? null : p));
    let sawWet = false;
    for (let t = 0; t < 20 && !hook.dead; t++) {
      hook.fixedUpdate(1 / 60, g);
      sawWet = sawWet || hook.wet;
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(splashDustCount(dust, 18)).toBeGreaterThanOrEqual(10);
    expect(hook.vx).toBe(11.5);                         // AI_007 飞行段不改速度（阻尼 N/A 同向）
  });

  it('阻尼 N/A 定谳：干/湿双世界钩尖位移逐拍全等', () => {
    const wetW = mkWorld(); liquidAt(wetW, WX0, WX1, WY0, WY1);
    const dryW = mkWorld();
    const { g: gW } = makeGame(wetW);
    const { g: gD } = makeGame(dryW);
    const pa = new Player(20 * TILE, 62 * TILE, new Inventory());
    const pb = new Player(20 * TILE, 62 * TILE, new Inventory());
    (gW as unknown as { player: Player }).player = pa;
    (gD as unknown as { player: Player }).player = pb;
    const a = new GrappleProj(pa.cx + 8, pa.cy, 11.5, 0, 13, () => (pa.dead ? null : pa));
    const b = new GrappleProj(pb.cx + 8, pb.cy, 11.5, 0, 13, () => (pb.dead ? null : pb));
    for (let t = 0; t < 8; t++) {
      a.fixedUpdate(1 / 60, gW);
      b.fixedUpdate(1 / 60, gD);
      expect(a.x).toBe(b.x);                            // tileCollide=false ⇒ wetVelocity≡velocity
      expect(a.y).toBe(b.y);
    }
  });
});

// =====================================================================
// Mounts（MountShot 14 受段+阻尼 / 606 豁免直跳;SantankShellProj 930 受段）
// =====================================================================
describe('MountShot ★通用湿段（14 :953-965 受段+阻尼 / 606 :6533-6543 ignoreWater@:6542 豁免）', () => {
  it('14 出生在水中：wet=true、位移 ×0.5、velocity 场不减', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new MountShot(494, 1000, 2, 0, 8, 1, 14);
    const dry = new MountShot(494, 1000, 2, 0, 8, 1, 14);
    const dryW = mkWorld();
    const { g: gD } = makeGame(dryW);
    s.fixedUpdate(1 / 60, g);
    dry.fixedUpdate(1 / 60, gD);
    expect(s.wet).toBe(true);
    // 14 extraUpdates=1 → 2 子步,每子步位移 2×0.5=1 → 合计 2（干态 2 子步 × 2 = 4）
    expect(s.x - 494).toBeCloseTo(2, 6);
    expect(dry.x - 494).toBeCloseTo(4, 6);
    expect(s.vx).toBe(2);
  });

  it('606 豁免直跳：水中 wet 恒 false、零溅花（:6542 ignoreWater=true 整段门）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const s = new MountShot(494, 1000, 2, 0, 8, 1, 606);   // extraUpdates 2 → 3 子步
    let sawWet = false;
    for (let t = 0; t < 8 && !s.dead; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
    }
    expect(sawWet).toBe(false);
    expect(splash.length).toBe(0);
  });
});

describe('SantankShellProj ★通用湿段（930 :8820-8827 无 ignoreWater 行 → 受段）', () => {
  it('空中出生下落入水：入水溅花 + wet 旗跃迁', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const s = new SantankShellProj(500, 900, 0, 4, 120, 0, 930);
    let sawWet = false;
    for (let t = 0; t < 30 && !s.dead; t++) {
      s.fixedUpdate(1 / 60, g);
      sawWet = sawWet || s.wet;
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(splashDustCount(dust, 14)).toBeGreaterThanOrEqual(10);
  });
});

// =====================================================================
// AshBallProj 40 / DebrisProj 736-738（受段;aiStyle10 专支 :17701-17720 → 阻尼 N/A）
// =====================================================================
describe('AshBallProj ★通用湿段（40 :1229-1238 无 ignoreWater 行 → 受段;姊妹 17 :993 豁免异面）', () => {
  it('出生在水中：预置 wet=true 无溅花 + 阻尼 N/A（干/湿轨迹逐拍全等）', () => {
    const wetW = mkWorld(); liquidAt(wetW, WX0, WX1, WY0, WY1);
    const dryW = mkWorld();
    const { g: gW, splash } = makeGame(wetW);
    const { g: gD } = makeGame(dryW);
    const a = new AshBallProj(500, 1000, 0, 0.41, 15);
    const b = new AshBallProj(500, 1000, 0, 0.41, 15);
    for (let t = 0; t < 6; t++) {
      a.fixedUpdate(1 / 60, gW);
      b.fixedUpdate(1 / 60, gD);
      expect(a.x).toBe(b.x);                            // aiStyle10 专支无 wetVelocity 折减
      expect(a.y).toBe(b.y);
    }
    expect(a.wet).toBe(true);
    expect(splash.length).toBe(0);                      // 出生即水中=无溅花（:10887 预置同向）
  });

  it('空中出生落入水带：入水溅花 10 粒 + wet 旗跃迁', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const a = new AshBallProj(500, 900, 0, 0.41, 15);
    let sawWet = false;
    for (let t = 0; t < 40 && !a.dead; t++) {
      a.fixedUpdate(1 / 60, g);
      sawWet = sawWet || a.wet;
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(splashDustCount(dust, 10)).toBeGreaterThanOrEqual(10);
  });
});

describe('DebrisProj ★通用湿段（(736||737||738) 共档 :7750-7757 无 ignoreWater 行 → 受段）', () => {
  it('出生在水中 wet=true 无溅花;空中落入水带入水溅花', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const inWater = new DebrisProj(481, 500, 1000);
    inWater.fixedUpdate(1 / 60, g);
    expect(inWater.wet).toBe(true);
    expect(splash.length).toBe(0);
    const falling = new DebrisProj(482, 500, 900);      // vx=0 直落穿带
    let sawWet = false;
    for (let t = 0; t < 40 && !falling.dead; t++) {
      falling.fixedUpdate(1 / 60, g);
      sawWet = sawWet || falling.wet;
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(splashDustCount(dust, 10)).toBeGreaterThanOrEqual(10);
  });
});

// =====================================================================
// WaterSplashProj（69/70/621 受段 + 阻尼;SolutionProj 145-149/1015-1017 豁免=N/A）
// =====================================================================
describe('WaterSplashProj ★通用湿段（69 :1491-1497 / 70 :1499-1505 / 621 :1507-1513 受段）', () => {
  it('出生在水中：wet=true、位移 ×0.5、velocity 场不减（探针原速/位移阻尼分面）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g } = makeGame(w);
    const s = new WaterSplashProj(500, 1000, 8, 0, 69, 20, 3, () => {});
    s.fixedUpdate(1 / 60, g);
    expect(s.wet).toBe(true);
    expect(s.x - 500).toBeCloseTo(4, 6);                // 8×0.5
    expect(s.vx).toBe(8);
  });

  it('溶液弹域（SolutionProj 145-149/1015-1017）全豁免 → 类无湿段调用面（N/A 定谳）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const convCalls: number[] = [];
    const s = new SolutionProj(500, 1000, 2, 0, 146, false,
      (conv) => { convCalls.push(conv); });
    for (let t = 0; t < 6; t++) s.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0);                      // 豁免=湿段零触发
    expect(convCalls.length).toBe(18);                  // 溶液转换照跑（6 tick × 3 子步,不受湿段影响）
  });
});

// =====================================================================
// SkyLanternProj（855 受段 + 阻尼;aiStyle166 tileCollide 缺省 true）
// =====================================================================
describe('SkyLanternProj ★通用湿段（855 :8199-8207 无 ignoreWater 行 → 受段）', () => {
  it('下方出生上升入水：入水溅花 + wet 旗跃迁 + 位移折减对照', () => {
    const wetW = mkWorld(); liquidAt(wetW, WX0, WX1, WY0, WY1);
    const dryW = mkWorld();
    const { g: gW, dust, splash } = makeGame(wetW);
    const { g: gD } = makeGame(dryW);
    const a = new SkyLanternProj(500, 1200, 0, -3);     // 带底 1136 下方,上升穿入
    const b = new SkyLanternProj(500, 1200, 0, -3);
    let sawWet = false, sawDrag = false;
    for (let t = 0; t < 30 && !a.dead; t++) {
      const ay = a.y, by = b.y;
      a.fixedUpdate(1 / 60, gW);
      b.fixedUpdate(1 / 60, gD);
      sawWet = sawWet || a.wet;
      // 已湿拍：上升位移应比干态小（阻尼 ×0.5 进位移行;两世界同一 AI,唯一差=液体）
      if (a.wet && !a.dead && !b.dead) {
        if (Math.abs(a.y - ay) < Math.abs(b.y - by)) sawDrag = true;
      }
    }
    expect(sawWet).toBe(true);
    expect(splash.length).toBeGreaterThanOrEqual(1);
    expect(splashDustCount(dust, 12)).toBeGreaterThanOrEqual(10);
    expect(sawDrag).toBe(true);                          // 湿态升程 < 干态（:17755 阻尼进位移行）
  });
});

// =====================================================================
// ChainsawProj（252/509 受段;445 豁免直跳;AI 直写位 → 阻尼 N/A）
// =====================================================================
describe('ChainsawProj ★通用湿段（252 :3354-3359 / 509 :5790-5797 受段;445 :5165-5177 ignoreWater@:5175 豁免）', () => {
  const sawOwner = (cx: number, cy: number) => ({ cx, cy, facing: 1, dead: false, h: 42, gfxOffY: 0 });

  it('252 水中持锯：wet=true（湿段照跑）;445 水中：wet 恒 false（豁免整段门直跳）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, splash } = makeGame(w);
    const o252 = sawOwner(520, 1020);                   // 水带内
    const saw252 = new ChainsawProj(o252, 10, 1, () => true,
      () => ({ x: o252.cx + 10, y: o252.cy }), { projId: 252, shootSpeed: 40 });
    saw252.fixedUpdate(1 / 60, g);
    expect(saw252.wet).toBe(true);
    expect(splash.length).toBe(0);                      // 出生即水中=预置无溅花
    const o445 = sawOwner(520, 1020);
    const saw445 = new ChainsawProj(o445, 10, 1, () => true,
      () => ({ x: o445.cx + 10, y: o445.cy }), { projId: 445, laser: true });
    saw445.fixedUpdate(1 / 60, g);
    expect(saw445.wet).toBe(false);                     // 豁免 → 四旗恒 false
    expect(splash.length).toBe(0);
  });
});

// =====================================================================
// 豁免类零触发 runtime（GlobProj 358 / DirtBallProj 17——溅花尘/音全零）
// =====================================================================
describe('豁免类湿段零触发（N/A 定谳 runtime 面）', () => {
  it('GlobProj 358（ignoreWater :4497）水中全程零溅花尘/零 Splash 音', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const gl = new GlobProj(358, 500, 1000, 1, 1);
    for (let t = 0; t < 6 && !gl.dead; t++) gl.fixedUpdate(1 / 60, g);
    expect(splash.length).toBe(0);
    expect(splashDustCount(dust, 18)).toBe(0);          // 尾迹/Kill 尘走 spawnParticles 不入此池
  });

  it('DirtBallProj 17（ignoreWater :993）落水全程零溅花（姊妹 40 受段异面）', () => {
    const w = mkWorld(); liquidAt(w, WX0, WX1, WY0, WY1);
    const { g, dust, splash } = makeGame(w);
    const db = new DirtBallProj(500, 1000, 0, 2, () => null, 'dirt');
    let killed = false;
    for (let t = 0; t < 30 && !db.dead; t++) {
      db.fixedUpdate(1 / 60, g);
      killed = killed || db.dead;
    }
    expect(splash.length).toBe(0);
    expect(splashDustCount(dust, 10)).toBe(0);
    void killed;
  });
});

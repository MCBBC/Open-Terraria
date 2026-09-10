import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Dart } from '../src/entities/Dart';
import { vanillaFrameIdx } from '../src/render/Renderer';
import { moveAndCollide } from '../src/physics/TileCollision';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

// IIII235 圣骑士 290 攻击 AI+特效全量对账回归（2026-09-10）：
// ① FindFrame case 290（NPC.cs:76763-76786）——瞄准相帧行按 ai[1] 倒数窗（<10→11/
//    <20→10/else→9）、腾空=1、站定=0、行走带 2..8（7 帧,>8 回 2）——曾落通用
//    aiStyle3 档把 9/10/11 当行走帧循环。
// ② 锤弹 300（ProjectileID.PaladinsHammerHostile,Projectile.cs:3908-3916/:789/
//    :23845-23853/:23914-23916/:23469-23472/:14846-14971）——38×38、timeLeft 3600、
//    重力 0.2@60+vx×0.99 同门、终端 vy 帽 32、滚转、命中玩家穿透不消亡。
// ③ GetTileCollisionParameters 底对齐缩盒（NPC.cs:93976-93978）——cHeight=40
//    （inset=22）→ 3 格高走廊（48px）可通行、2 格（32px）不可通；feet 语义不变。

type FrameE = {
  customFrameIdx?: number; vanillaId: number; vanilla?: { aiStyle?: number };
  animT: number; vx: number; vy: number; onGround: boolean;
  walkCycleT: number; ai1: number; ai2: number; facing: number;
};
const frameE = (over: Partial<FrameE>): FrameE => ({
  vanillaId: 290, vanilla: { aiStyle: 3 }, animT: 0, vx: 0, vy: 0,
  onGround: true, walkCycleT: 0, ai1: 0, ai2: 0, facing: 1, ...over,
});

describe('IIIII235 圣骑士 290 FindFrame（NPC.cs:76763-76786）', () => {
  it('瞄准相（ai2>0）帧行按 ai1 倒数窗：>=20→9 / 10..19→10 / <10→11（掷锤恰 ai1==15 在行 10）', () => {
    expect(vanillaFrameIdx(frameE({ ai2: 3, ai1: 30 }) as never, 12)).toBe(9);
    expect(vanillaFrameIdx(frameE({ ai2: 3, ai1: 20 }) as never, 12)).toBe(9);
    expect(vanillaFrameIdx(frameE({ ai2: 1, ai1: 19 }) as never, 12)).toBe(10);
    expect(vanillaFrameIdx(frameE({ ai2: 1, ai1: 15 }) as never, 12)).toBe(10);   // 掷锤相
    expect(vanillaFrameIdx(frameE({ ai2: 2, ai1: 10 }) as never, 12)).toBe(10);
    expect(vanillaFrameIdx(frameE({ ai2: 3, ai1: 9 }) as never, 12)).toBe(11);
    expect(vanillaFrameIdx(frameE({ ai2: 4, ai1: 1 }) as never, 12)).toBe(11);
  });
  it('非瞄准相：腾空=1（非通用档末帧 11）；站定=0；行走带 2..8 七帧循环,永不越入 9..11', () => {
    expect(vanillaFrameIdx(frameE({ ai2: 0, onGround: false }) as never, 12)).toBe(1);
    expect(vanillaFrameIdx(frameE({ ai2: 0, onGround: true, vx: 0 }) as never, 12)).toBe(0);
    const rows = new Set<number>();
    for (let t = 0; t <= 140; t++) {
      rows.add(vanillaFrameIdx(frameE({ ai2: 0, onGround: true, vx: 1, walkCycleT: t }) as never, 12));
    }
    expect([...rows].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(vanillaFrameIdx(frameE({ ai2: 0, vx: 1, walkCycleT: 0 }) as never, 12)).toBe(2);
    expect(vanillaFrameIdx(frameE({ ai2: 0, vx: 1, walkCycleT: 6 }) as never, 12)).toBe(3);
    expect(vanillaFrameIdx(frameE({ ai2: 0, vx: 1, walkCycleT: 36 }) as never, 12)).toBe(8);
    expect(vanillaFrameIdx(frameE({ ai2: 0, vx: 1, walkCycleT: 42 }) as never, 12)).toBe(2); // >8 回 2
  });
});

function dartHooks(hits: number[] = []) {
  const w = new World(80, 80, 42, 'open');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 70, 2); // 地板(70 行)
  const player = {
    x: 40 * 16, y: 66 * 16, w: 20, h: 42, cx: 41 * 16, cy: 67 * 16,
    dead: false, vx: 0, vy: 0, iframes: 0, luck: 0,
  };
  const hooks = {
    world: w,
    player,
    playSfx: () => {},
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    spawnParticles: () => {},
    spawnDrop: () => null,
    damagePlayer: (self: unknown, _d: unknown, dmg: number): number => { hits.push(dmg); return dmg; },
    entities: { add: () => {} },
  } as never;
  return { hooks, player, hits };
}

const flyTicks = (d: Dart, hooks: never, n: number) => {
  for (let i = 0; i < n && !d.dead; i++) d.fixedUpdate(1 / 60, hooks);
};

describe('IIIII235 圣锤 300 弹域（Projectile.cs:3908-3916 / :789 / :23845-23853 / :23914）', () => {
  it('SetDefaults/SetupProjectile 数据面：38×38、timeLeft 3600（曾落 Dart 缺省 600）、穿透 ∞', () => {
    const d = new Dart(30 * 16, 50 * 16, -9, 0, 60, 300);
    expect(d.w).toBe(38);
    expect(d.h).toBe(38);
    expect(d.life).toBe(3600);                 // :789 SetupProjectile 缺省（IIIII235 修）
  });
  it('AI 相序：age≤60 直线（vy 恒 0、vx 不衰减）→ 重力门起 vy+=0.2 / vx×0.99 同门', () => {
    const { hooks } = dartHooks();
    const d = new Dart(30 * 16, 50 * 16, -9, 0, 60, 300);
    flyTicks(d, hooks, 60);
    expect(d.vy).toBe(0);                      // :23850 门（ai[0]>=60）前零重力
    expect(d.vx).toBe(-9);                     // xDamp 同门——曾缺=飞行全程不衰减（IIIII235 修）
    flyTicks(d, hooks, 1);                     // 重力门首拍（域约定 age>gravDelay,同 81 箭 :54009 档）
    expect(d.vy).toBeCloseTo(0.2, 5);
    expect(d.vx).toBeCloseTo(-9 * 0.99, 5);
    flyTicks(d, hooks, 1);
    expect(d.vy).toBeCloseTo(0.4, 5);
    expect(d.vx).toBeCloseTo(-9 * 0.99 * 0.99, 5);
  });
  it('终端落速帽 32（aiStyle2 通用钳 :23914-23916,IIIII235 补）+ 滚转持续（:23469-23472）', () => {
    const { hooks } = dartHooks();
    const d = new Dart(30 * 16, 50 * 16, -9, 30, 60, 300);   // 高初 vy 快速触帽
    const rot0 = d['rot'] as number;
    flyTicks(d, hooks, 100);
    expect(d.vy).toBeLessThanOrEqual(32.0001);
    expect(d.vy).toBe(32);
    expect((d['rot'] as number) !== rot0).toBe(true);        // roll=(|vx|+|vy|)×0.03×dir
  });
  it('命中玩家穿透不消亡（Damage_EVP :14846-14971 无 Kill、penetrate=-1 不扣——IIIII235 修）', () => {
    const hits: number[] = [];
    const { hooks, player } = dartHooks(hits);
    player.x = 30 * 16; player.cx = 30 * 16 + 10;            // 弹道正前方
    const d = new Dart(28 * 16, 66 * 16, -2, 0, 60, 300);
    d.hostile = true;
    flyTicks(d, hooks, 40);
    expect(hits.length).toBeGreaterThan(0);                  // 命中结算发生过
    expect(d.dead).toBe(false);                              // 穿过玩家继续飞
  });
});

describe('IIIII235 圣骑士 290 底对齐缩盒（GetTileCollisionParameters NPC.cs:93976-93978）', () => {
  const buildWorld = (gap: number) => {
    const w = new World(80, 80, 42, 'open');
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);           // 地板 60 行
    // 墙 3 列（40..42）,高 20 行,底部 gap 格开口（开口 = 行 59..(60−gap)）
    for (let wx = 40; wx <= 42; wx++) {
      for (let wy = 40; wy <= 59; wy++) st.setTileSilent(wx, wy, 2);
      for (let wy = 60 - gap; wy <= 59; wy++) st.setTileSilent(wx, wy, 0);
    }
    return w;
  };
  const body = (x: number, inset: number | undefined) => ({
    x, y: 60 * TILE - 62, w: 34, h: 62, vx: 0, vy: 0,
    onGround: false, hitWall: false, hitHead: false, collideY: false,
    stepUp: true, stepUpHolds: false, stepUpNpc: true, liqFactor: 1,
    collTopInset: inset,
  } as unknown as Parameters<typeof moveAndCollide>[0]);
  const walk = (b: ReturnType<typeof body>, w: World, ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      b.vx = -1;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
    }
  };
  it('fromVanilla(290) 置 collTopInset=22（62−40；1456:94035 / 1457:93977 / 1458:93977 同值）', () => {
    const e = Enemy.fromVanilla(290, 30 * TILE, 58 * TILE);
    expect(e).not.toBeNull();
    expect(e!.collTopInset).toBe(22);
    const z = Enemy.fromVanilla(3, 30 * TILE, 58 * TILE);
    expect(z!.collTopInset).toBeUndefined();                 // 其余 NPC 全盒缺省路径
  });
  it('3 格高走廊（48px > 缩盒 40px）可通行；无 inset 的 62 全盒则被挡（机制回归锚）', () => {
    const w = buildWorld(3);
    const withInset = body(46 * TILE, 22);
    walk(withInset, w, 240);
    expect(withInset.x < 40 * TILE).toBe(true);              // 走过墙左侧
    const fullBox = body(46 * TILE, undefined);
    walk(fullBox, w, 240);
    expect(fullBox.x).toBeGreaterThanOrEqual(43 * TILE);     // 62 全盒被挡在墙右缘=原版靠缩盒通行
  });
  it('2 格高走廊（32px < 缩盒 40px）不可通行（开口余量判据下限）', () => {
    const w = buildWorld(2);
    const b = body(46 * TILE, 22);
    walk(b, w, 240);
    expect(b.x).toBeGreaterThanOrEqual(43 * TILE);           // 被挡在墙右缘（盒顶 920 压进行 57 实心）
  });
  it('feet 语义不变：缩盒下 onGround 判定与全盒一致（底对齐,盒底不动）', () => {
    const w = new World(80, 80, 42, 'open');
    const st = w.store;
    for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2);
    const b = body(30 * TILE, 22);
    for (let t = 0; t < 40; t++) {
      b.vx = 0;
      b.vy = Math.min(b.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(b, w, b.vx, b.vy);
    }
    expect(b.onGround).toBe(true);
    expect(Math.abs(b.y + b.h - 60 * TILE)).toBeLessThan(0.5);   // 盒底=地板顶（feet 不变）
    expect(b.h).toBe(62);                                        // 出口还原盒高
  });
});

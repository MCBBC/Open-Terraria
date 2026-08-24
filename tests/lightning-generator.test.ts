// LightningGenerator（LightningGenerator.cs 1:1 移植）金标 —— 2026-08-24 r15 R15-15。
// LCG32 序列锚为 C# 语义手算值；bolt 路径锁结构性质（起点/终点/确定性/分叉预算）。
import { describe, expect, it } from 'vitest';
import { LCG32, arcSurgeWeaponGenerator, lightningStrikeWeaponGenerator,
  boltRotations, remap, wrapAngle } from '../src/fx/LightningGenerator';

describe('LCG32（LCG32Random.cs:5-44）', () => {
  it('Advance:state = (int)state·(−1856014347)+1 uint32 回绕', () => {
    const r = new LCG32(1);
    r.advance();
    expect(r.state).toBe(2438952950);          // (−1856014346)>>>0
    // 第二步:(2438952950·(−1856014347)+1) mod 2³²（BigInt 手算锚）
    const expect2 = Number((BigInt(2438952950) * -1856014347n + 1n) & 0xFFFFFFFFn);
    r.advance();
    expect(r.state).toBe(expect2);
  });
  it('NextDouble = state/2³²;Next(max) = (state·max)>>32(BigInt 精确)', () => {
    const r = new LCG32(1);
    expect(r.nextDouble()).toBeCloseTo(2438952950 / 4294967296, 15);
    const r2 = new LCG32(1);
    expect(r2.next(10)).toBe(Math.floor((2438952950 * 10) / 4294967296));
    // 大 state×max 不丢位（Number 乘法 2⁵³ 上限外的 BigInt 路径）
    const r3 = new LCG32(0xFFFFFFFF);
    r3.advance();
    expect(r3.next(0x7FFFFFFF)).toBe(Number((BigInt(r3.state) * 0x7FFFFFFFn) >> 32n));
  });
});

describe('bolt 路径结构性质（GetArcSurgeWeaponGenerator :303-326）', () => {
  const start = { x: 800, y: 1440 };
  const target = { x: 795, y: 795 };
  const gen = arcSurgeWeaponGenerator(start, target, () => false);

  it('确定性:同种子逐点全等;异种子不同', () => {
    const a = gen.generateMainBoltPath(12345, target, { x: -5, y: -645 });
    const b = gen.generateMainBoltPath(12345, target, { x: -5, y: -645 });
    expect(a.positions.length).toBe(b.positions.length);
    for (let i = 0; i < a.positions.length; i++) {
      expect(a.positions[i].x).toBe(b.positions[i].x);
      expect(a.positions[i].y).toBe(b.positions[i].y);
    }
    const c = gen.generateMainBoltPath(12346, target, { x: -5, y: -645 });
    let diff = 0;
    for (let i = 0; i < Math.min(a.positions.length, c.positions.length); i++) {
      if (a.positions[i].x !== c.positions[i].x) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('起点 = target−direction(=手部锚);终点沿轴距 < stepSize(6);主 bolt 恒末位', () => {
    const bolt = gen.generateMainBoltPath(777, target, { x: -5, y: -645 });
    expect(bolt.positions[0].x).toBeCloseTo(start.x, 6);
    expect(bolt.positions[0].y).toBeCloseTo(start.y, 6);
    const dx = target.x - start.x, dy = target.y - start.y;
    const L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    const last = bolt.positions[bolt.positions.length - 1];
    const along = (target.x - last.x) * ux + (target.y - last.y) * uy;
    expect(along).toBeLessThan(6);             // num5 < stepSize break(:146)
    expect(bolt.isMainBolt).toBe(true);
    expect(bolt.rotations).toBeNull();          // GenerateMainBoltPath calcRotations:false
    expect(bolt.collidedWithTile).toBe(false);  // 探针恒 false
  });

  it('撞块截断:探针命中 → collidedWithTile + progressRange 收窄 + 提前终止', () => {
    // 在路径中段 y≈1100 处立宽墙（bolt 横向游走 ±50px,墙须盖住游走带）
    const wall = (x: number, y: number): boolean => y > 1080 && y < 1120 && x > 600 && x < 1000;
    const g2 = arcSurgeWeaponGenerator(start, target, wall);
    const bolt = g2.generateMainBoltPath(42, target, { x: -5, y: -645 });
    expect(bolt.collidedWithTile).toBe(true);
    const last = bolt.positions[bolt.positions.length - 1];
    expect(last.y).toBeGreaterThan(1000);       // 截断在墙附近,未达 target
    expect(bolt.progressRange.max).toBeLessThan(1);
  });

  it('1117 天雷预设:direction 缺省 UnitY → 起点 = 目标上方 750px(±π/36 抖动)', () => {
    const g = lightningStrikeWeaponGenerator(() => false);
    const bolt = g.generateMainBoltPath(9, { x: 500, y: 500 });
    // direction = UnitY.RotatedBy((rand·2−1)·π/36)·750 → 起点 = target−direction
    const dx = bolt.positions[0].x - 500, dy = bolt.positions[0].y - (500 - 750);
    expect(Math.abs(dx)).toBeLessThanOrEqual(750 * Math.sin(Math.PI / 36) + 1);
    expect(Math.abs(dy)).toBeLessThanOrEqual(750 * (1 - Math.cos(Math.PI / 36)) + 1);
  });
});

describe('工具（Utils.Remap :345 / WrapAngle / CalcRotations :251-274）', () => {
  it('remap 线性 + 钳制;wrapAngle 规约 (−π,π]', () => {
    expect(remap(0.5, 0, 1, 10, 20)).toBe(15);
    expect(remap(2, 0, 1, 0, 10)).toBe(10);          // clamped
    expect(remap(-1, 0, 1, 0, 10)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI, 12);
  });
  it('boltRotations:首末=端段角,中点=相邻角折半平滑', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const r = boltRotations(pts);
    expect(r[0]).toBeCloseTo(Math.atan2(0 - 0, 0 - 10), 12);   // positions[0]−positions[1]
    expect(r[2]).toBeCloseTo(Math.atan2(0 - 10, 10 - 10), 12);
    expect(r[1]).toBeCloseTo(r[0] + wrapAngle(r[2] - r[0]) / 2, 12);
  });
});

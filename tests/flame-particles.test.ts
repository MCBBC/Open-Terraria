// FlameParticle 1:1 回归（Terarria1456/Terraria.Graphics.Renderers/FlameParticle.cs
// + ABasicParticle.cs + ParticleOrchestrator.Spawn_WallOfFleshGoatMountFlames
// ParticleOrchestrator.cs:3259-3306）——山羊坐骑 47 地面冲刺火焰本体层。
//   1 编排器出生参数（3 束 ±5.3333335px / 贴图 326/327/328 / scale 0.1-1.0 / 零速 / TTL 50）
//   2 收缩状态机（ScaleAcceleration 二次收缩闭式曲线）
//   3 淡出（FadeOutNormalizedTime 0.3 → Utils.GetLerpValue(1, 0.3, t) 反向段）
//   4 存活期（50 tick 到龄移除）与池上限
import { describe, it, expect } from 'vitest';
import {
  FlameParticles, flameLerpValue, flameFadeOutFactor, flameScaleAcceleration,
  flameScaleAfter, FLAME_TTL, FLAME_FADE_OUT, FLAME_BUNDLE_DX, FLAME_TEX,
} from '../src/fx/FlameParticles';

/** 线性同余 rand（确定性；值域 [0,1) 与 Main.rand.NextFloat 同口径） */
const lcg = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
};

describe('FlameParticle 编排器出生参数（Spawn_WallOfFleshGoatMountFlames :3262-3290）', () => {
  it('三束：x = 入参 + i×5.3333335（i∈{-1,0,1}），y 同位，初速零', () => {
    const fp = new FlameParticles();
    expect(fp.spawnGoatFlames(1000, 2000, lcg(42))).toBe(3);
    const xs = [...fp.each()].map((f) => f.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(1000 - FLAME_BUNDLE_DX, 6);
    expect(xs[1]).toBeCloseTo(1000, 6);
    expect(xs[2]).toBeCloseTo(1000 + FLAME_BUNDLE_DX, 6);
    for (const f of fp.each()) {
      expect(f.y).toBe(2000);
      expect(f.vx).toBe(0);          // :3271 SetBasicInfo 第三参 Vector2.Zero
      expect(f.vy).toBe(0);
    }
  });

  it('贴图三选一（NextFromList [326,327,328]）+ scale ∈ [0.1, 1.0]（rand×0.9+0.1）', () => {
    const fp = new FlameParticles();
    const rand = lcg(7);
    fp.spawnGoatFlames(0, 0, rand);
    for (const f of fp.each()) {
      expect(FLAME_TEX).toContain(f.tex);
      expect(f.scale).toBeGreaterThanOrEqual(0.1);
      expect(f.scale).toBeLessThanOrEqual(1.0);
      expect(f.scaleAccel).toBeCloseTo(flameScaleAcceleration(f.scale));   // :3288
    }
  });

  it('确定性出生：rand 恒 0.5 → num3 = 0.55、贴图取第 2 档（floor(0.5×3)=1）', () => {
    const fp = new FlameParticles();
    fp.spawnGoatFlames(0, 0, () => 0.5);
    const list = [...fp.each()];
    expect(list).toHaveLength(3);
    for (const f of list) {
      expect(f.scale).toBeCloseTo(0.55);            // 0.5×0.9+0.1（:3268）
      expect(f.tex).toBe(FLAME_TEX[1]);
      expect(f.timeToLive).toBe(FLAME_TTL);          // :3261 num = 50
      expect(f.fadeOut).toBe(FLAME_FADE_OUT);        // :3287
      expect(f.timeSinceSpawn).toBe(0);
    }
  });
});

describe('收缩状态机（ABasicParticle.Update :39-50 二次收缩）', () => {
  it('scaleVel 逐 tick += accel、scale 逐 tick += scaleVel——闭式曲线逐点核对', () => {
    const fp = new FlameParticles();
    fp.spawnGoatFlames(0, 0, () => 0.5);
    const f = [...fp.each()][0];
    const scale0 = f.scale, accel = f.scaleAccel;
    const x0 = f.x, y0 = f.y;
    for (let t = 1; t <= 20; t++) {
      fp.update();
      expect(f.scale).toBeCloseTo(flameScaleAfter(scale0, accel, t), 9);
      expect(f.timeSinceSpawn).toBe(t);
      expect(f.x).toBe(x0); expect(f.y).toBe(y0);   // 零速 → 原地
    }
  });

  it('50t 末 scale ≈ num3×0.575（Σk/(60×50)=1275/3000）——收缩近半非归零', () => {
    const fp = new FlameParticles();
    fp.spawnGoatFlames(0, 0, () => 0.5);
    const f = [...fp.each()][0];
    const num3 = 0.55;
    for (let t = 0; t < 50; t++) fp.update();
    expect(f.scale).toBeCloseTo(num3 * (1 - 1275 / 3000), 6);   // ≈0.316
  });
});

describe('淡出与存活期（FlameParticle.Update :43-51 / Draw :55）', () => {
  it('GetLerpValue 反向段（from=1 > to=0.3）：≤0.3 恒 1、≥1 恒 0、间段线性', () => {
    expect(flameLerpValue(1, 0.3, 0)).toBe(1);
    expect(flameLerpValue(1, 0.3, 0.3)).toBe(1);
    expect(flameLerpValue(1, 0.3, 0.65)).toBeCloseTo(0.5);
    expect(flameLerpValue(1, 0.3, 1)).toBeCloseTo(0);   // (t−1)/(−0.7) 的 −0 语义
    expect(flameLerpValue(1, 0.3, 1.4)).toBeCloseTo(0);
    // 正向段（from<to，Utils.cs:287-297 镜像分支）——函数通用性锁定
    expect(flameLerpValue(0, 1, -0.5)).toBe(0);
    expect(flameLerpValue(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(flameLerpValue(0, 1, 2)).toBe(1);
  });

  it('flameFadeOutFactor：生命前 30% 全亮、后 70% 线性降到 0', () => {
    expect(flameFadeOutFactor(0)).toBe(1);
    expect(flameFadeOutFactor(0.29)).toBe(1);
    expect(flameFadeOutFactor(0.5)).toBeCloseTo(1 - (0.5 - 0.3) / 0.7);
    expect(flameFadeOutFactor(0.99)).toBeCloseTo((1 - 0.99) / 0.7, 6);
  });

  it('存活期 50：第 49 次 update 仍活、第 50 次到龄移除（:47-50 ≥ 即删）', () => {
    const fp = new FlameParticles();
    fp.spawnGoatFlames(0, 0, () => 0.5);
    for (let t = 0; t < 49; t++) fp.update();
    expect(fp.count).toBe(3);
    fp.update();
    expect(fp.count).toBe(0);
    // 到龄粒子不再被 each 迭代（绘制侧零残留）
    expect([...fp.each()]).toHaveLength(0);
  });
});

describe('池上限（ParticlePool :37-52 无空位语义 → 定长池满丢弃）', () => {
  it('512 上限：溢出生成被丢、count 不越界、池复用（clear 后可再生成）', () => {
    const fp = new FlameParticles();
    const rand = lcg(99);
    let total = 0, spawned = 0;
    while (spawned < 4096) {
      const n = fp.spawnGoatFlames(0, 0, rand);
      if (n === 0) break;
      spawned += n;
      total = fp.count;
    }
    expect(total).toBeLessThanOrEqual(512);
    fp.clear();
    expect(fp.count).toBe(0);
    expect(fp.spawnGoatFlames(0, 0, rand)).toBe(3);
  });
});

// 湖面星闪 LakeSparkle 包络回归（Spawn_LakeSparkle ParticleOrchestrator.cs:1336-1353
// FadingParticle 1:1——FakeFish.ts 登记④清偿锁定,2026-09-03）：
//   贴图 = TextureAssets.Star[0]（原生 12×12）、TTL 50..140t、Velocity=Zero +
//   AccelerationPerFrame=(MovementVector/60)/TTL、ColorTint=(255,255,255,0)×NextFloat、
//   FadeIn/OutNormalizedTime 0.45/0.45、Rotation=NextFloat×τ、
//   RotationVelocity=NextFloatDirection×τ/32×clamp(|move|/32,0,1)、Scale=0.5..1、
//   掷序 = life→亮度→rot→rotVel→scale（:1342→:1347→:1350→:1351→:1353）。
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnLakeSparkle, eachLakeSparkles, clearFakeFish, setFakeFishRandom } from '../src/entities/FakeFish';

beforeEach(() => clearFakeFish());

describe('spawnLakeSparkle 逐值包络（掷序敏感）', () => {
  it('五掷依原文序消费：life→baseAlpha→rot→rotVel→scale；自旋幅=|2r−1|×τ/32×clamp', () => {
    // 脚本化 rng：五掷值各不相同且可反推（NextFloatDirection = v×2−1）
    const seq = [0.10, 0.90, 0.25, 0.80, 0.55];
    let i = 0;
    setFakeFishRandom(() => seq[i++ % seq.length]);
    const moveX = 0, moveY = -32;              // |move|=32 → clamp=1
    spawnLakeSparkle(moveX, moveY, 5, 6);
    const s = eachLakeSparkles()[0];
    expect(s.life).toBeCloseTo(50 + 90 * 0.10, 12);        // :1342
    expect(s.baseAlpha).toBeCloseTo(0.90, 12);             // :1347（第 2 掷=亮度,非末掷）
    expect(s.rot).toBeCloseTo(0.25 * Math.PI * 2, 12);     // :1350
    expect(s.rotVel).toBeCloseTo((0.80 * 2 - 1) * (Math.PI * 2 / 32) * 1, 12);  // :1351-1352
    expect(s.scale).toBeCloseTo(0.5 + 0.5 * 0.55, 12);     // :1353
    expect(s.x).toBe(5); expect(s.y).toBe(6);
    // Velocity=Zero + APF=(move/60)/TTL（:1343-1346）
    expect(s.vx).toBe(0); expect(s.vy).toBe(0);
    expect(s.axPerT).toBeCloseTo(0 / 60 / s.life, 12);
    expect(s.ayPerT).toBeCloseTo(-32 / 60 / s.life, 12);
  });

  it('自旋钳：|move|<32 → 线性缩幅（clamp(|move|/32,0,1)）', () => {
    setFakeFishRandom(() => 0.9);              // NextFloatDirection=0.8
    spawnLakeSparkle(0, -8, 0, 0);             // |move|=8 → clamp=0.25
    const s = eachLakeSparkles()[0];
    expect(s.rotVel).toBeCloseTo(0.8 * (Math.PI * 2 / 32) * 0.25, 12);
  });

  it('★登记④回归：自旋幅非恒满档（旧 sign 抽签退役——|rotVel|/上限 < 1 的样本存在）', () => {
    // 固定 LCG：足够样本下 NextFloatDirection 均匀 → 幅值散布
    let x = 123456789;
    const rng = () => { x = (1103515245 * x + 12345) % 2147483648; return x / 2147483648; };
    setFakeFishRandom(rng);
    for (let k = 0; k < 40; k++) spawnLakeSparkle(0, -40 * rng(), 0, 0);
    const rats = eachLakeSparkles().map((s) =>
      Math.abs(s.rotVel) / ((Math.PI * 2 / 32) * Math.min(1, 40 / 32)));
    expect(Math.max(...rats)).toBeLessThan(1);   // 40 样本无一恰满幅（旧码全部 =1）
    expect(Math.min(...rats)).toBeLessThan(0.5); // 幅值散布
  });

  it('亮度/缩放域：baseAlpha∈(0,1)、scale∈[0.5,1)、rot∈[0,τ)（:1347/:1350/:1353）', () => {
    let x = 42;
    const rng = () => { x = (1103515245 * x + 12345) % 2147483648; return x / 2147483648; };
    setFakeFishRandom(rng);
    for (let k = 0; k < 24; k++) spawnLakeSparkle(0, -30, 0, 0);
    for (const s of eachLakeSparkles()) {
      expect(s.baseAlpha).toBeGreaterThan(0);
      expect(s.baseAlpha).toBeLessThan(1);
      expect(s.scale).toBeGreaterThanOrEqual(0.5);
      expect(s.scale).toBeLessThan(1);
      expect(s.rot).toBeGreaterThanOrEqual(0);
      expect(s.rot).toBeLessThan(Math.PI * 2);
    }
  });
});

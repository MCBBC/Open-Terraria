import { describe, it, expect } from 'vitest';
import { FastRandom } from '../src/lighting/FastRandom';

// ---- BigInt 参考实现(2026-08-24 重写前的原实现逐字拷贝)----
// 作用:FastRandom 性能重写(BigInt→f64 拆乘)后,本文件对拍锁定掷值序列逐位一致。
// 参考实现本身永不改动;被测实现改坏了这里立刻爆红。
const MULTIPLIER = 25214903917n;
const ADD = 11n;
const MASK = 0xffffffffffffn; // 2^48 - 1

class RefFastRandom {
  private seed: bigint;
  constructor(seed: bigint | number) {
    this.seed = (typeof seed === 'bigint' ? seed : BigInt(seed)) & MASK;
  }
  static nextSeed(seed: bigint): bigint {
    return (seed * MULTIPLIER + ADD) & MASK;
  }
  withModifier(m: number | bigint): RefFastRandom {
    const mod = typeof m === 'bigint' ? m : BigInt(m);
    return new RefFastRandom(RefFastRandom.nextSeed(mod) ^ this.seed);
  }
  reseed(): void { this.seed = RefFastRandom.nextSeed(this.seed); }
  private nextBits(bits: number): number {
    this.seed = RefFastRandom.nextSeed(this.seed);
    return Number(this.seed >> BigInt(48 - bits));
  }
  nextInt31(): number { return this.nextBits(31); }
  next(min: number, max: number): number {
    const range = max - min;
    if (range <= 0) return min;
    return this.nextBelow(range) + min;
  }
  private nextBelow(max: number): number {
    if ((max & -max) === max) {
      return Math.floor((max * this.nextBits(31)) / 2147483648);
    }
    for (;;) {
      const num = this.nextBits(31);
      const rem = num % max;
      if (num <= 2147483647 - (max - 1)) return rem;
    }
  }
  nextFloat(): number { return this.nextBits(24) / 16777216; }
}

// ---- 对拍矩阵 ----
// 种子覆盖:0/小/大/2^47 边界/2^48-1 满态/负 int32(withModifier 入参可为负)
const SEEDS = [0, 1, 2, 42, 0x9e3779b9, 123456789, 2 ** 47, 2 ** 48 - 1, -1, -12345];
// 值域覆盖:项目实际调用点(2=水 flicker / 14=蘑菇·闪烁 / 50=岩浆装饰 / 22·24·28·36·42·54
// =样式档)+ 1/3 非 2 幂 + 大 2 幂
const RANGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [0, 7], [0, 14], [0, 22], [0, 24], [0, 28],
  [0, 36], [0, 42], [0, 50], [0, 54], [28, 42], [98, 100], [0, 2 ** 30],
];
const MODS = [-(2 ** 31), -5, -1, 0, 1, 5, 12345, 2 ** 31 - 1, 2654435761 & 0x7fffffff];

describe('FastRandom f64 重写 vs BigInt 参考逐位一致', () => {
  it('next/nextInt31/nextFloat 序列一致(多种子 × 多值域 × 2000 掷)', () => {
    for (const seed of SEEDS) {
      for (const [min, max] of RANGES) {
        const a = new FastRandom(seed);
        const b = new RefFastRandom(seed);
        for (let i = 0; i < 2000; i++) {
          const va = a.next(min, max);
          const vb = b.next(min, max);
          if (va !== vb) {
            throw new Error(`next(${min},${max}) seed=${seed} 第${i}掷: f64=${va} ref=${vb}`);
          }
        }
      }
      const a = new FastRandom(seed);
      const b = new RefFastRandom(seed);
      for (let i = 0; i < 2000; i++) {
        if (a.nextInt31() !== b.nextInt31()) throw new Error(`nextInt31 seed=${seed} 第${i}掷分歧`);
        if (a.nextFloat() !== b.nextFloat()) throw new Error(`nextFloat seed=${seed} 第${i}掷分歧`);
      }
    }
  });

  it('withModifier 派生序列一致(含负 int32 修饰值)', () => {
    for (const seed of SEEDS) {
      for (const m of MODS) {
        const da = new FastRandom(seed).withModifier(m);
        const db = new RefFastRandom(seed).withModifier(m);
        for (let i = 0; i < 500; i++) {
          if (da.next(0, 50) !== db.next(0, 50)) throw new Error(`withModifier(${m}) seed=${seed} 第${i}掷分歧`);
          if (da.nextFloat() !== db.nextFloat()) throw new Error(`withModifier(${m}).nextFloat seed=${seed} 第${i}掷分歧`);
        }
      }
    }
  });

  it('reseedWithModifierFrom 跨底派生一致(scratch 复用形态,底种=另一实例)', () => {
    // 2026-08-24 首版实现曾以 scratch 自身 seed 为底致 scan 金标抓出(格 52,9 掷 4→34)
    // ——本用例钉死「底种显式」语义:等价 baseInstance.withModifier(m) 的序列
    for (const seed of SEEDS) {
      for (const m of MODS) {
        const refBase = new RefFastRandom(seed);
        const scratch = new FastRandom(0);   // scratch 自身 seed 与底无关,故意错开
        const derived = refBase.withModifier(m);
        scratch.reseedWithModifierFrom(m, seed);   // 派生一次,之后两侧同速前进
        for (let i = 0; i < 500; i++) {
          if (scratch.next(0, 50) !== derived.next(0, 50)) {
            throw new Error(`reseedWithModifierFrom(${m}, base=${seed}) 第${i}掷分歧`);
          }
          if (scratch.nextFloat() !== derived.nextFloat()) {
            throw new Error(`reseedWithModifierFrom(${m}, base=${seed}).nextFloat 第${i}掷分歧`);
          }
        }
      }
    }
  });

  it('reseed 续序列一致(Blur 每周期 NextSeed 语义)', () => {
    for (const seed of SEEDS) {
      const a = new FastRandom(seed);
      const b = new RefFastRandom(seed);
      for (let cycle = 0; cycle < 50; cycle++) {
        a.reseed();
        b.reseed();
        for (let i = 0; i < 20; i++) {
          if (a.next(98, 100) !== b.next(98, 100)) {
            throw new Error(`reseed 续掷 seed=${seed} cycle=${cycle} 第${i}掷分歧`);
          }
        }
      }
    }
  });

  it('构造语义一致:非整数入参抛错 / bigint 入参截断 48 位', () => {
    expect(() => new FastRandom(1.5)).toThrow();
    expect(() => new RefFastRandom(1.5)).toThrow();
    const big = 2n ** 50n + 123n;
    const a = new FastRandom(big);
    const b = new RefFastRandom(big);
    for (let i = 0; i < 100; i++) {
      if (a.nextInt31() !== b.nextInt31()) throw new Error(`bigint 入参 第${i}掷分歧`);
    }
  });
});

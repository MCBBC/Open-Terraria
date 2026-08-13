// Java Random 克隆(Terrarria1456/Terraria.Utilities/FastRandom.cs:7-88 一比一)。
// 48 位 LCG:seed = (seed*25214903917 + 11) & (2^48-1);Next(bits) = seed >> (48-bits)。
// 用于水波纹逐格随机(LightMap.Blur)与蜡烛/篝火闪烁(TileLightScanner)。
// 注意：本文件是光照系统专用副本——世界生成侧（DesertHive 等）请用
// src/core/rng.ts 的 FastRandom（同一原版类，带 Next(max)/NextDouble/WithModifier(x,y)）。
const MULTIPLIER = 25214903917n;
const ADD = 11n;
const MASK = 0xffffffffffffn; // 2^48 - 1

export class FastRandom {
  private seed: bigint;

  constructor(seed: bigint | number) {
    this.seed = (typeof seed === 'bigint' ? seed : BigInt(seed)) & MASK;
  }

  /** NextSeed(L85-88) */
  static nextSeed(seed: bigint): bigint {
    return (seed * MULTIPLIER + ADD) & MASK;
  }

  /** WithModifier(m)(L27-30):新实例种子 = NextSeed(m) ^ 原 Seed */
  withModifier(m: number | bigint): FastRandom {
    const mod = typeof m === 'bigint' ? m : BigInt(m);
    return new FastRandom(FastRandom.nextSeed(mod) ^ this.seed);
  }

/** 仅推进种子不取值（TileLightScanner.Update :58-61 每周期 NextSeed 语义） */
  reseed(): void { this.seed = FastRandom.nextSeed(this.seed); }

  /** NextBits(b)(L47-51):前进一步并取高 b 位 */
  private nextBits(bits: number): number {
    this.seed = FastRandom.nextSeed(this.seed);
    return Number(this.seed >> BigInt(48 - bits));
  }

  /** Next(31) → int */
  nextInt31(): number {
    return this.nextBits(31);
  }

  /** Next(min,max)(L63-83):Next(range)+min;拒绝采样避免模偏置。
   *  原版用 int32 溢出判定(num - num2 + (max-1) < 0);JS 无溢出,用等价的
   *  Math.ceil(range/2) 上界判据:当 num 落在 int32 顶部的溢出带时重投 */
  next(min: number, max: number): number {
    const range = max - min;
    if (range <= 0) return min;
    return this.nextBelow(range) + min;
  }

  /** Next(max)(L68-82);max 为 2 的幂走快速路径 */
  private nextBelow(max: number): number {
    if ((max & -max) === max) {
      // (max * NextBits(31)) >> 31
      return Math.floor((max * this.nextBits(31)) / 2147483648);
    }
    for (;;) {
      const num = this.nextBits(31);          // [0, 2^31)
      const rem = num % max;
      // 原版溢出带:num - rem + (max-1) 溢出 int32 < 0
      //   等价:num > 2^31 - 1 - (max - 1),即 num >= 2^31 - max + ... 顶部 max-1 个值
      if (num <= 2147483647 - (max - 1)) return rem;
    }
  }

  /** NextFloat() */
  nextFloat(): number {
    return this.nextBits(24) / 16777216;
  }
}

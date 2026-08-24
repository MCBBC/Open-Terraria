// Java Random 克隆(Terrarria1456/Terraria.Utilities/FastRandom.cs:7-88 一比一)。
// 48 位 LCG:seed = (seed*25214903917 + 11) & (2^48-1);Next(bits) = seed >> (48-bits)。
// 用于水波纹逐格随机(LightMap.Blur)与蜡烛/篝火闪烁(TileLightScanner)。
// 注意：本文件是光照系统专用副本——世界生成侧（DesertHive 等）请用
// src/core/rng.ts 的 FastRandom（同一原版类，带 Next(max)/NextDouble/WithModifier(x,y)）。
//
// 2026-08-24 性能重写(BigInt→f64):48 位状态与全部中间量 < 2^53 可被 f64 精确表示。
// 乘法拆 hi/lo 24 位(seed*M = Sh*Mh*2^48 + (Sh*Ml+Sl*Mh)*2^24 + Sl*Ml,首项 mod 2^48
// 消失,余两项各自精确);异或拆 24 位半逐段。掷值序列与 BigInt 版逐位一致,
// tests/lighting-fastrandom-golden.test.ts 以 BigInt 参考实现对拍锁定。
// 热路径(reseedWithModifier/next/nextFloat)零分配零 BigInt;构造与 withModifier
// (每 blur 周期一次)保留兼容形态,分配可忽略。
const MASK48 = 281474976710656;   // 2^48
const TWO24 = 16777216;           // 2^24
const MUL_HI = 1502;              // 25214903917 = 1502*2^24 + 15525485
const MUL_LO = 15525485;
const ADD = 11;

/** nextSeed(seed mod 2^48) f64 精确版。入参:int32(负数按 mod 2^48)或 [0,2^48) 整数。 */
function nextSeed48(seed: number): number {
  const m = seed < 0 ? seed + MASK48 : seed;
  const sh = Math.floor(m / TWO24);
  const sl = m - sh * TWO24;
  // X = Sh*Ml + Sl*Mh(< 2^49 精确),取 mod 2^24;Y = Sl*Ml(< 2^48 精确)全量保留
  const mid = (sh * MUL_LO + sl * MUL_HI) % TWO24;
  let s = mid * TWO24 + sl * MUL_LO;
  s += ADD;
  return s >= MASK48 ? s - MASK48 : s;
}

export class FastRandom {
  private seed: number;

  constructor(seed: bigint | number) {
    // 构造非热路径:直接走 BigInt 保全部语义(非整数抛错/负数/超宽截断与原版一致)
    this.seed = Number((typeof seed === 'bigint' ? seed : BigInt(seed)) & 0xffffffffffffn);
  }

  /** NextSeed(L85-88)——bigint 公开静态,非热路径保留原实现 */
  static nextSeed(seed: bigint): bigint {
    return (seed * 25214903917n + 11n) & 0xffffffffffffn;
  }

  /** WithModifier(m)(L27-30):新实例种子 = NextSeed(m) ^ 原 Seed(兼容保留,分配一实例) */
  withModifier(m: number | bigint): FastRandom {
    const r = new FastRandom(0);
    r.seed = FastRandom.modifiedSeedOf(m, this.seed);
    return r;
  }

  /** ★热路径:原地重播 WithModifier(m) 语义(零分配,底种=自身)——链式推进专用 */
  reseedWithModifier(m: number): void {
    this.seed = FastRandom.modifiedSeedOf(m, this.seed);
  }

  /** ★热路径:scratch 复用形态——派生种子 = NextSeed(m) ^ baseSeed(底种显式)。
   *  语义等价 baseInstance.withModifier(m) 的产物,但零分配;scanner/blur 的
   *  「每格从主 random 派生局部随机」都走这里(底=主 random.seed,非 scratch 自身!) */
  reseedWithModifierFrom(m: number, baseSeed: number): void {
    this.seed = FastRandom.modifiedSeedOf(m, baseSeed);
  }

  /** modifiedSeed = NextSeed(m mod 2^48) ^ baseSeed;异或按 24 位拆半(f64 无 48 位位域) */
  private static modifiedSeedOf(m: number | bigint, baseSeed: number): number {
    const base = nextSeed48(typeof m === 'bigint' ? Number(m & 0xffffffffffffn) : m);
    const bh = Math.floor(base / TWO24), bl = base - bh * TWO24;
    const sh = Math.floor(baseSeed / TWO24), sl = baseSeed - sh * TWO24;
    return (bh ^ sh) * TWO24 + (bl ^ sl);
  }

  /** 仅推进种子不取值（TileLightScanner.Update :58-61 每周期 NextSeed 语义） */
  reseed(): void { this.seed = nextSeed48(this.seed); }

  /** NextBits(b)(L47-51):前进一步并取高 b 位(除 2^k 对整数精确) */
  private nextBits(bits: number): number {
    this.seed = nextSeed48(this.seed);
    return Math.floor(this.seed / 2 ** (48 - bits));
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

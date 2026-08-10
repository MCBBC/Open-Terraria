// Java Random 克隆(Terrarria1456/Terraria.Utilities/FastRandom.cs:7-88 一比一)。
// 48 位 LCG:seed = (seed*25214903917 + 11) & (2^48-1);Next(bits) = seed >> (48-bits)。
// 用于水波纹逐格随机(LightMap.Blur)与蜡烛/篝火闪烁(TileLightScanner)。
const MULTIPLIER = 25214903917n;
const ADD = 11n;
const MASK = 0xffffffffffffn; // 2^48 - 1
export class FastRandom {
    constructor(seed) {
        Object.defineProperty(this, "seed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.seed = (typeof seed === 'bigint' ? seed : BigInt(seed)) & MASK;
    }
    /** NextSeed(L85-88) */
    static nextSeed(seed) {
        return (seed * MULTIPLIER + ADD) & MASK;
    }
    /** WithModifier(m)(L27-30):新实例种子 = NextSeed(m) ^ 原 Seed */
    withModifier(m) {
        const mod = typeof m === 'bigint' ? m : BigInt(m);
        return new FastRandom(FastRandom.nextSeed(mod) ^ this.seed);
    }
    /** NextBits(b)(L47-51):前进一步并取高 b 位 */
    nextBits(bits) {
        this.seed = FastRandom.nextSeed(this.seed);
        return Number(this.seed >> BigInt(48 - bits));
    }
    /** Next(31) → int */
    nextInt31() {
        return this.nextBits(31);
    }
    /** Next(min,max)(L63-83):Next(range)+min;拒绝采样避免模偏置。
     *  原版用 int32 溢出判定(num - num2 + (max-1) < 0);JS 无溢出,用等价的
     *  Math.ceil(range/2) 上界判据:当 num 落在 int32 顶部的溢出带时重投 */
    next(min, max) {
        const range = max - min;
        if (range <= 0)
            return min;
        return this.nextBelow(range) + min;
    }
    /** Next(max)(L68-82);max 为 2 的幂走快速路径 */
    nextBelow(max) {
        if ((max & -max) === max) {
            // (max * NextBits(31)) >> 31
            return Math.floor((max * this.nextBits(31)) / 2147483648);
        }
        for (;;) {
            const num = this.nextBits(31); // [0, 2^31)
            const rem = num % max;
            // 原版溢出带:num - rem + (max-1) 溢出 int32 < 0
            //   等价:num > 2^31 - 1 - (max - 1),即 num >= 2^31 - max + ... 顶部 max-1 个值
            if (num <= 2147483647 - (max - 1))
                return rem;
        }
    }
    /** NextFloat() */
    nextFloat() {
        return this.nextBits(24) / 16777216;
    }
}

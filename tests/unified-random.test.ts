// UnifiedRandom / TranslateSeed 位级金标测试。
// 金标来源：tools/golden/rand-golden.cs 反射调用真·Terraria 1.4.5.6 程序集
// （Terraria.exe + ReLogic.dll）导出——重跑该脚本可再生成（需 dotnet 10 + 本机 Steam 版原版）。
// double 一律按 IEEE754 位串比较（"0x…" int64 hex），杜绝任何精度歧义。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UnifiedRandom, RNG, crc32Calculate, translateSeed } from '../src/core/rng';

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('./golden/unified-random.json', import.meta.url)), 'utf8'),
) as {
  translateSeed: Record<string, number>;
  sequences: Array<{
    seed: number;
    next: number[];
    nextDouble: string[];
    next100: number[];
    next7to10: number[];
    nextNeg5to5: number[];
    mixed: Array<number | string>;
  }>;
};

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
function doubleBitsHex(d: number): string {
  f64[0] = d;
  const hi = u32[1].toString(16).padStart(8, '0');
  const lo = u32[0].toString(16).padStart(8, '0');
  return `0x${hi}${lo}`;
}

describe('UnifiedRandom 位级金标（真·Terraria.exe 导出）', () => {
  it('TranslateSeed 全表（数字 Abs / 非数字 Crc32 负值直出）', () => {
    for (const [text, expected] of Object.entries(golden.translateSeed)) {
      expect(translateSeed(text), `seedText=${JSON.stringify(text)}`).toBe(expected);
    }
  });

  it('Crc32 表自检：Tabs[1]==0x77073096（IEEE 0xEDB88320 表）', () => {
    // Crc32("a") = 0xE8B7BE43（IEEE CRC-32 公认参考值）
    expect(crc32Calculate('a')).toBe(0xe8b7be43 | 0);
  });

  for (const seq of golden.sequences) {
    it(`seed=${seq.seed}：next/nextDouble/Next(100)/Next(7,10)/Next(-5,5)/混合流 位级一致`, () => {
      const r0 = new UnifiedRandom(seq.seed);
      for (let i = 0; i < seq.next.length; i++) expect(r0.next()).toBe(seq.next[i]);
      const r1 = new UnifiedRandom(seq.seed);
      for (let i = 0; i < seq.nextDouble.length; i++) {
        const got = r1.nextDouble();
        expect(doubleBitsHex(got), `nextDouble[${i}]`).toBe(seq.nextDouble[i]);
      }
      const r2 = new UnifiedRandom(seq.seed);
      for (let i = 0; i < seq.next100.length; i++) expect(r2.nextInt(100)).toBe(seq.next100[i]);
      const r3 = new UnifiedRandom(seq.seed);
      for (let i = 0; i < seq.next7to10.length; i++) expect(r3.nextIntRange(7, 10)).toBe(seq.next7to10[i]);
      const r4 = new UnifiedRandom(seq.seed);
      for (let i = 0; i < seq.nextNeg5to5.length; i++) expect(r4.nextIntRange(-5, 5)).toBe(seq.nextNeg5to5[i]);
      // 混合流：跨 method 连续性（Next/NextDouble/Next(100)/Next(7,10) 交替 8 轮）
      const r5 = new UnifiedRandom(seq.seed);
      for (let k = 0; k < 8; k++) {
        const a = r5.next();
        const d = r5.nextDouble();
        const b = r5.nextInt(100);
        const c = r5.nextIntRange(7, 10);
        expect(a).toBe(seq.mixed[k * 4]);
        expect(doubleBitsHex(d), `mixed double ${k}`).toBe(seq.mixed[k * 4 + 1]);
        expect(b).toBe(seq.mixed[k * 4 + 2]);
        expect(c).toBe(seq.mixed[k * 4 + 3]);
      }
    });
  }

  it('RNG 包装层对账约定：int(a,b) ≡ Next(a,b+1)，同流一致', () => {
    const seed = golden.sequences[3].seed; // 123456789
    const rng = new RNG(seed);
    const ur = new UnifiedRandom(seed);
    for (let i = 0; i < 64; i++) {
      expect(rng.next()).toBe(ur.nextDouble());
      expect(rng.int(7, 29)).toBe(ur.nextIntRange(7, 30));
      expect(rng.chance(0.3)).toBe(ur.nextDouble() < 0.3);
      expect(rng.pick(['a', 'b', 'c', 'd', 'e'])).toBe(['a', 'b', 'c', 'd', 'e'][ur.nextInt(5)]);
      expect(rng.range(0, 1)).toBeCloseTo(ur.nextDouble(), 15);
    }
  });
});

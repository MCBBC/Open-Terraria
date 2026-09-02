// IIII175 批一次性回放仪：UHBC 尾 +5/+1 骰定罪——x86 ABLOG2 末箱 (1740,950)
//   （tile467 style10 沙漠屋箱,gy=950=h-250,池骰 rc66499→4062 deep=1）。
//   JS 在该箱 loot 段多掷 5（lend@66523 vs x86 loot 尾 66518）+箱后 1。
//   假说：vanilla 洞穴档门=cs(1457):37184 / cs(1458):37192 `num7 < Main.maxTilesY-250`
//   （严格 <），JS caveElig 用 `gy <= worldH-250`（非严格）→ gy=h-250 整带 JS 走洞穴档
//   而 x86 走地狱档。回放：录得的原始 InternalSample 流喂脚本化 UnifiedRandom，
//   验证①当前代码耗 24 样本②修正后耗 19 样本（=x86 loot 段长）。
// 用法：cd game && SW_I175RP=1 npx vitest run tools/_iii175replay.test.ts
import { it, expect } from 'vitest';
import { rollChestLoot } from '../src/world/gen/vanilla/BuriedChestsPass';
import type { RNG } from '../src/core/rng';

const RUN = process.env.SW_I175RP === '1';
// 录得值：池骰 66499 + loot 66500..66523（66519..66523 为 JS 多掷段,x86 无）
const POOL = 1374710076;
const LOOT_24 = [
  1649360657, 1955154362, 19154111, 1584504262, 1005802353, 1590866228, 283457967,
  1433496961, 1656370377, 861593320, 370541492, 238520155, 2147088525, 2040782464,
  223704891, 1907463743, 331629534, 1615677652, 587582416, 1179346899, 601695552,
  12250473, 933386936, 386850527,
];
const SCALE = 4.656612875245797e-10;

function scriptedRng(samples: number[]): { rng: RNG; consumed: () => number } {
  let i = 0;
  const sample = (): number => {
    if (i >= samples.length) throw new Error(`sample stream exhausted at ${i}`);
    return samples[i++]! * SCALE;
  };
  const ur = {
    nextIntRange(minValue: number, maxValue: number): number {
      const num = maxValue - minValue;
      if (num <= 2147483647) return (Math.trunc(sample() * num) + minValue) | 0;
      throw new Error('large range not modelled');
    },
    nextInt(maxValue: number): number { return Math.trunc(sample() * maxValue); },
    nextDouble(): number { return sample(); },
    next(): number { throw new Error('next() not modelled'); },
    getSampleForLargeRange(): number { throw new Error('large range not modelled'); },
    peek(): number { return samples[i] ?? 0; },
  };
  const rng = Object.create((rollChestLoot as unknown as { length: number }) && ({} as object)) as RNG;
  // 直接构造轻量 RNG 面（int/nextInt/pick/chance/range 同语义转发 ur）
  const r = rng as unknown as Record<string, unknown>;
  r.ur = ur;
  r.int = (min: number, max: number): number => ur.nextIntRange(min, max + 1);
  r.nextInt = (m: number): number => ur.nextInt(m);
  r.pick = (arr: number[]): number => arr[ur.nextInt(arr.length)]!;
  r.chance = (p: number): boolean => ur.nextDouble() < p;
  r.range = (a: number, b: number): number => a + ur.nextDouble() * (b - a);
  r.nextIntRange = (a: number, b: number): number => ur.nextIntRange(a, b);
  return { rng, consumed: () => i };
}

const gsStub = {
  seedFlags: { remix: true },
  rockLevel: 769, worldSurface: 337, lavaLine: 852,
  savedOreBars: { copper: 20, iron: 22, silver: 21, gold: 19 },
  oreTiers: { copper: 9999, iron: 9998, silver: 9997, gold: 9996 },
  generatedShadowKey: false, generatedRamRune: false, gennedMahoganyWands: false,
  hellChestIdx: 0, jungleItemIdx: 0,
} as never;

(RUN ? it : it.skip)('iii175 replay: (1740,950) desert-house chest loot branch', () => {
  // 0) 池骰复算：Next(0,3) on POOL → index 1 = 4062（x86 D 行 item=4062 一致）
  const { rng: poolRng, consumed: poolUsed } = scriptedRng([POOL]);
  const poolIdx = poolRng.int(0, 2);
  expect(poolIdx).toBe(1); // [4061,4062,4276][1] = 4062
  console.log(`[RP] pool Next(0,3)=${poolIdx} -> mainId 4062 ✓ (deep arm)`);

  // 1) 当前代码（caveElig: gy <= h-250 非严格）：期望耗尽 24 样本（JS 实况）
  const a = scriptedRng([...LOOT_24, 0]);
  const lootA = rollChestLoot(
    { rng: a.rng, gs: gsStub, gy: 950, flags: { desert: true }, mainKey: null, worldH: 1200, chestStyle: 10 },
    4062,
  );
  console.log(`[RP] CURRENT(cave branch): consumed=${a.consumed()} items=${JSON.stringify(lootA.filter(Boolean))}`);

  // 2) 修正后形态（严格 <）：gy=h-250 → 地狱档。等价模拟=worldH-250 上界收紧 1
  //    （gy=950 > 1200-251=949 → 非 gold 非 cave → hell 档,与把 caveElig 改 < 同效）
  const b = scriptedRng([...LOOT_24, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const lootB = rollChestLoot(
    { rng: b.rng, gs: gsStub, gy: 950, flags: { desert: true }, mainKey: null, worldH: 949 + 250, chestStyle: 10 },
    4062,
  );
  console.log(`[RP] PATCHED(hell branch sim): consumed=${b.consumed()} items=${JSON.stringify(lootB.filter(Boolean))}`);
});

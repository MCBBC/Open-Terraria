// IIII174 仪具：rollChestLoot 定值重放 harness——用录得的掷值序列驱动战利品表,
// 数出实际消耗掷数,对四分支逐一拟合 x86/JS 的 BC 段长度,定谳房箱 loot 分支。
// 用法：npx vitest run tools/_iii174loot.test.ts
import { it } from 'vitest';
import { rollChestLoot } from '../src/world/gen/vanilla/BuriedChestsPass';

class FakeRNG {
  private idx = 0;
  consumed = 0;
  constructor(private vals: number[]) {}
  private sample(): number {
    if (this.idx >= this.vals.length) throw new Error(`values exhausted at #${this.consumed + 1}`);
    const v = this.vals[this.idx++]!;
    this.consumed++;
    return v * 4.656612875245797e-10;
  }
  next(): number { return this.sample(); }
  nextInt(max: number): number { return Math.trunc(this.sample() * max); }
  nextIntRange(a: number, b: number): number { return (Math.trunc(this.sample() * (b - a)) + a) | 0; }
  int(a: number, b: number): number { return this.nextIntRange(a, b + 1); }
  chance(p: number): boolean { return this.sample() < p; }
  pick<T>(xs: T[]): T { return xs[this.nextInt(xs.length)]!; }
}

// 房箱 (2645,950)：JS 22 掷值（BC 3501..3522）；x86 25 掷值（BC 3501..3525）
const JS_VALS = [1472740254, 722798427, 1433098230, 59251819, 2051538976, 663875760, 1205549988, 1918084438, 705973615, 1899216073, 613922977, 918985929, 1523598171, 1667651970, 703311645, 935245643, 315169804, 1912251290, 1393849091, 652605576, 2048952512, 1260634776];
const X86_VALS = [1472740254, 722798427, 1433098230, 59251819, 2051538976, 663875760, 1205549988, 1918084438, 705973615, 1899216073, 613922977, 918985929, 1523598171, 1667651970, 703311645, 935245643, 315169804, 1912251290, 1393849091, 652605576, 2048952512, 1260634776, 978847764, 1505776223, 859597322];

it('III174 loot branch fit', () => {
  const gs = {
    seedFlags: {},
    worldSurface: 360, rockLevel: 480, lavaLine: 700,
    generatedShadowKey: false, generatedRamRune: false, gennedMahoganyWands: false,
    oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
  } as unknown as Parameters<typeof rollChestLoot>[0]['gs'];
  const mk = (vals: number[], gy: number, flags: Record<string, boolean>) => {
    const rng = new FakeRNG(vals) as unknown as Parameters<typeof rollChestLoot>[0]['rng'];
    const ctx = { rng, gs, gy, flags, mainKey: null, worldH: 1200, chestStyle: 1 } as unknown as Parameters<typeof rollChestLoot>[0];
    let out: Array<{ id: number; stack: number } | null> = [];
    try {
      out = rollChestLoot(ctx, 0);
    } catch (e) {
      return { consumed: (rng as unknown as FakeRNG).consumed, err: (e as Error).message.slice(0, 60), out };
    }
    return { consumed: (rng as unknown as FakeRNG).consumed, out };
  };
  const branches: Array<[string, number, Record<string, boolean>]> = [
    ['surface(wooden)', 100, { wooden: true }],
    ['gold', 400, {}],
    ['cave', 700, {}],
    ['hell', 1100, {}],
  ];
  for (const [nm, gy, fl] of branches) {
    const a = mk(JS_VALS, gy, fl);
    console.log(`[i174] JS22 ${nm}: consumed=${a.consumed}${a.err ? ' ERR:' + a.err : ''} items=${a.out.length}`);
    const b = mk(X86_VALS, gy, fl);
    console.log(`[i174] X8625 ${nm}: consumed=${b.consumed}${b.err ? ' ERR:' + b.err : ''} items=${b.out.length}`);
    if (!b.err) console.log(`[i174]   x86 items:`, b.out.map((o) => (o ? `${o.id}x${o.stack}` : 'null')).join(','));
    if (!a.err) console.log(`[i174]   js  items:`, a.out.map((o) => (o ? `${o.id}x${o.stack}` : 'null')).join(','));
  }
}, 300_000);

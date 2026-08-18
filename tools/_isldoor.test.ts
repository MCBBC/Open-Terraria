// 一次性：浮空岛 pass RNG 流取证。
// A) 原版重播模型:UnifiedRandom(seed) 从 0 流,逐屋 [Next(2),Next(7,12),Next(5,7),
//    门 Next(3)×3, 箱掷 c 未知, 横幅 Next(7,10)×3] —— 暴力解 c_i 使全部值对上 golden。
// B) JS 实测:monkey-patch RNG.prototype 记 draw 序列(折叠 int(0,9) 洪流),定位浮空岛屋段。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG, UnifiedRandom, translateSeed } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const seed = translateSeed('12345');

// ---------- A: 原版流模拟 ----------
const golden = {
  h1: { dirDraw: 0, halfW: 7, hgt: 6, door: [1, 2, 2], banners: [7, 9, 7] },   // 644 左门 f18/36/36
  h2: { dirDraw: 1, halfW: 9, hgt: 5, door: [2, 0, 1], banners: [7, 9, 9] },   // 1356 右门 f36/0/18
  h3: { dirDraw: 1, halfW: 8, hgt: 6, door: [2, 1, 1], banners: [7, 7, 8] },   // 1045 右门 f36/18/18
};

it('A: solve vanilla chest draw counts', () => {
  const houses = [golden.h1, golden.h2, golden.h3];
  const expect = houses.flatMap((h) => [h.dirDraw, h.halfW, h.hgt, ...h.door, ...h.banners]);
  // 逐屋顺序解:前缀(6 掷)与 c 无关,banners 随 c 变;候选集逐屋过滤
  let cands: number[][] = [[]];
  const mk = () => {
    const ur = new UnifiedRandom(seed);
    return {
      dir: () => ur.nextIntRange(0, 2),
      halfW: () => ur.nextIntRange(7, 12),
      hgt: () => ur.nextIntRange(5, 7),
      door: () => ur.nextInt(3),
      banner: () => ur.nextIntRange(7, 10),
      skip: (n: number) => { for (let k = 0; k < n; k++) ur.nextDouble(); },
    };
  };
  const allDraws: number[] = [];
  for (let hi = 0; hi < 3; hi++) {
    const h = houses[hi];
    const next: number[][] = [];
    for (const prev of cands) {
      for (let c = 0; c <= 120; c++) {
        const cs = [...prev, c];
        const m2 = mk();
        const vals: number[] = [];
        for (let k = 0; k <= hi; k++) {
          vals.push(m2.dir(), m2.halfW(), m2.hgt(), m2.door(), m2.door(), m2.door());
          m2.skip(cs[k]);
          vals.push(m2.banner(), m2.banner(), m2.banner());
        }
        if (vals.join() === expect.slice(0, vals.length).join()) next.push(cs);
      }
    }
    cands = next;
    console.log(`[A] after house ${hi + 1}: ${cands.length} candidates`);
  }
  void allDraws;
  console.log('[A] solutions (c1,c2,c3):', JSON.stringify(cands.slice(0, 5)));
  if (cands[0]) {
    const m = mk();
    const vals: number[] = [];
    for (let k = 0; k < 3; k++) {
      vals.push(m.dir(), m.halfW(), m.hgt(), m.door(), m.door(), m.door());
      m.skip(cands[0][k]);
      vals.push(m.banner(), m.banner(), m.banner());
    }
    console.log('[A] replay:', JSON.stringify(vals));
    console.log('[A] expect:', JSON.stringify(expect));
  }
}, 600000);

// ---------- B: JS 实测 ----------
it('B: trace JS island house draws', async () => {
  const log: Array<{ tag: string; a?: number; b?: number; v: number; run?: number }> = [];
  const proto = RNG.prototype as unknown as Record<string, (...args: number[]) => number>;
  const patched: Array<[string, (...args: number[]) => number]> = [];
  let lastFlood: { tag: string; a: number; b: number; run: number } | null = null;
  let capturing = false;
  let floodSeen = 0;
  const wrap = (name: string) => {
    const orig = proto[name];
    patched.push([name, orig]);
    proto[name] = function (this: RNG, ...args: number[]) {
      const v = orig.apply(this, args as []);
      const isFlood = name === 'int' && args[0] === 0 && args[1] === 9;
      if (isFlood) {
        if (lastFlood) lastFlood.run++;
        else { lastFlood = { tag: 'int(0,9)', a: 0, b: 9, run: 1 }; if (capturing) log.push(lastFlood); }
        if (lastFlood.run > 1000000 && !capturing) { capturing = true; floodSeen = lastFlood.run; log.push(lastFlood); }
      } else {
        lastFlood = null;
        if (capturing && log.length < 4000) log.push({ tag: name, a: args[0], b: args[1], v });
      }
      return v;
    };
  };
  for (const n of ['next', 'int', 'range', 'chance', 'pick', 'nextInt', 'nextIntRange']) wrap(n);
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
  } finally {
    for (const [n, orig] of patched) proto[n] = orig as never;
  }
  console.log('[B] flood seen at run=', floodSeen, 'captured', log.length, 'entries');
  for (const e of log.slice(0, 120)) console.log('[B]', e.tag, e.a !== undefined ? `(${e.a},${e.b ?? ''})` : '', '=>', e.v, e.run ? `×${e.run}` : '');
}, 600000);

void readFileSync;

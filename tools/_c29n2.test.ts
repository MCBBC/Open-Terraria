// 一次性：#20/#29 多种子泛化（seed 8888）——passchain FNV 定标 N vs JS 管线逐 pass 掷数。
// 定标：UnifiedRandom(8888) 暴力搜 Mushroom 末态 c5c9c7d6 / Corruption 末态 95c3b93b。
// 管线计数：全局钩 UnifiedRandom.prototype.internalSample，按 reseed 源行标签分段
//（mushroom→marble 段=runMushroomPass；corruption→lakes 段=runCorruptionPass）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom, RNG } from '../src/core/rng';

const W = 4200, H = 1200;

(RUN ? it : it.skip)('seed 8888: N calibration + pipeline per-pass draws', async () => {
  // A) 定标
  const ur = new UnifiedRandom(8888);
  const st = ur as unknown as { seedArray: Int32Array; inext: number };
  const h = (): string => {
    let x = 2166136261 >>> 0;
    const byte = (v: number, s: number) => { x = Math.imul(x ^ ((v >>> s) & 0xff), 16777619) >>> 0; };
    for (let k = 0; k < 56; k++) { const v = st.seedArray[k]! | 0; byte(v, 0); byte(v, 8); byte(v, 16); byte(v, 24); }
    const ix = st.inext >>> 0;
    byte(ix, 0); byte(ix, 8); byte(ix, 16); byte(ix, 24);
    return x.toString(16).padStart(8, '0');
  };
  const targets = new Map([['c5c9c7d6', 'mushroom'], ['95c3b93b', 'corruption'], ['c669c7cf', 'desert']]);
  const hits: Record<string, number> = {};
  for (let n = 0; n <= 12_000_000; n++) {
    const hh = h();
    if (targets.has(hh) && hits[targets.get(hh)!] === undefined) hits[targets.get(hh)!] = n;
    ur.nextInt(2);
  }
  console.log('8888 定标 N:', JSON.stringify(hits));

  // B) 管线逐 pass 掷数
  let counter = 0;
  const origSample = UnifiedRandom.prototype.internalSample;
  (UnifiedRandom.prototype as unknown as { internalSample: () => number }).internalSample = function (this: unknown) {
    counter++;
    return (origSample as unknown as (this: unknown) => number).call(this);
  };
  const origReseed = RNG.prototype.reseed;
  const marks: Array<[string, number]> = [];
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    const stackLine = (new Error().stack ?? '').split('\n').find((l) => l.includes('/src/world/gen/WorldGen')) ?? '';
    const mLoc = /WorldGen\.ts:(\d+):/.exec(stackLine);
    if (!mLoc) return;
    const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/world/gen/WorldGen.ts', 'utf8').split('\n');
    const ln = +mLoc[1];
    const line2 = `${src[ln - 1] ?? ''}|${src[ln] ?? ''}`;
    const lab = /▶GlowingMushroomPatches/.test(line2) ? 'mushroom'
      : /▶FloatingIslands/.test(line2) ? 'islands'
        : /▶CorruptionAndCrimson/.test(line2) ? 'corruption'
          : /▶Lakes/.test(line2) ? 'lakes' : '';
    if (lab) marks.push([lab, counter]);
  };
  (RNG.prototype as unknown as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({ width: W, height: H, seedText: '8888', evil: 0, onWorldPartial: () => { } });
  } catch (e) { console.log('gen EX:', String(e).slice(0, 120)); } finally {
    (RNG.prototype as unknown as { reseed: unknown }).reseed = origReseed;
    (UnifiedRandom.prototype as unknown as { internalSample: () => number }).internalSample = origSample;
  }
  console.log('reseed marks:', JSON.stringify(marks));
  const idxOf = (k: string) => marks.findIndex(([l]) => l === k);
  // ★首个 'mushroom' 标记是 Full Desert 前的兼容重播行（间隔=desertN 实证）——
  //   取「最后一个 mushroom → 其后首个 islands」为 runMushroomPass 真区间。
  const im = marks.map(([l], i) => [l, i] as const).filter(([l]) => l === 'mushroom').at(-1)?.[1] ?? -1;
  const ima = marks.findIndex(([l], i) => l === 'islands' && i > im);
  const ic = idxOf('corruption'), il = idxOf('lakes');
  if (im >= 0 && ima >= 0) console.log(`JS mushroom draws=${marks[ima]![1] - marks[im]![1]} (vanilla ${hits.mushroom ?? '?'}, diff=${hits.mushroom !== undefined ? marks[ima]![1] - marks[im]![1] - hits.mushroom : '?'})`);
  if (ic >= 0 && il >= 0) console.log(`JS corruption draws=${marks[il]![1] - marks[ic]![1]} (vanilla ${hits.corruption ?? '?'}, diff=${hits.corruption !== undefined ? marks[il]![1] - marks[ic]![1] - hits.corruption : '?'})  ※8888 管线地狱槽自债污染输入,差≠0不必然自因`);
}, 480000);

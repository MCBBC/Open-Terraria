// YYYYY 批：vanilla pass-97 掷数 FNV 反演 + s22222 settle 重放掷数对拍（SW_YY3=1）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_YY3 === '1';
function fnv(seedArray: Int32Array, inext: number): string {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    v = v >>> 0;
    for (let s = 0; s < 32; s += 8) { h = (h ^ ((v >>> s) & 0xFF)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  };
  for (let k = 0; k < seedArray.length; k++) mix(seedArray[k]);
  mix(inext);
  return h.toString(16).padStart(8, '0');
}
function hashOf(seed: number, n: number): string {
  const r = new UnifiedRandom(seed);
  for (let i = 0; i < n; i++) (r as unknown as { next(): number }).next();
  const ur = r as unknown as { seedArray: Int32Array; inext: number };
  return fnv(ur.seedArray, ur.inext);
}

(RUN ? it : it.skip)('fnv brute pass97 count', () => {
  // pc.txt P|97 行第 6 列 FNV（SW_YY3_CHAIN/SW_YY3_PASS 可换链/槽）
  const SEED = Number(process.env.SW_YY3_SEED ?? 22222);
  const CHAIN = process.env.SW_YY3_CHAIN ?? '/tmp/sw-slp/g-s22222/pc.txt';
  const PASS = process.env.SW_YY3_PASS ?? '97';
  let target = '';
  for (const line of readFileSync(CHAIN, 'utf8').split('\n')) {
    const c = line.split('|');
    if (c[0] === 'P' && c[1] === PASS) { target = c[5]!; console.log(`P|${PASS} target fnv =`, target, 'name =', c[2]); }
  }
  // 上限探测：单实例推进 + 逐步 FNV（O(hi×56)——重建实例的 O(hi²) 写法对大计数太慢）
  let lo = Number(process.env.SW_YY3_LO ?? 0);
  const hi = Number(process.env.SW_YY3_HI ?? 300000);
  {
    const r = new UnifiedRandom(SEED);
    for (let i = 0; i < lo; i++) (r as unknown as { next(): number }).next();
    const ur = r as unknown as { seedArray: Int32Array; inext: number };
    for (let n = lo; n <= hi; n++) {
      const h = fnv(ur.seedArray, ur.inext);
      if (h === target) { console.log(`★ vanilla pass${PASS} rolls = ${n}`); return; }
      (r as unknown as { next(): number }).next();
    }
  }
  console.log(`no match in [${lo},${hi}]`);
}, 580_000);

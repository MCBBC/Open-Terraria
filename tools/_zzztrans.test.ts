// ZZZ 批：golden 104→105 全量转移表（vanilla FinalCleanup 写侧全清单）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';

const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;

function load(idx: number, name: string) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${name}`;
  return {
    t: new Uint16Array(readFileSync(`${pre}.typ`).buffer.slice(0)),
    a: new Uint8Array(readFileSync(`${pre}.act`).buffer.slice(0)),
    w: new Uint16Array(readFileSync(`${pre}.wal`).buffer.slice(0)),
    l: new Uint8Array(readFileSync(`${pre}.liq`).buffer.slice(0)),
    sl: new Uint8Array(readFileSync(`${pre}.slope`).buffer.slice(0)),
    hf: new Uint8Array(readFileSync(`${pre}.half`).buffer.slice(0)),
  };
}

it('golden 104→105 transition table', () => {
  const A = load(104, 'Remove_Broken_Traps');
  const B = load(105, 'Final_Cleanup');
  const pair = new Map<string, number>();
  const samples = new Map<string, string[]>();
  const wpair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va0 = A.a[i], vb0 = B.a[i];
    const vt0 = va0 ? A.t[i] : -1, vt1 = vb0 ? B.t[i] : -1;
    if (va0 !== vb0 || vt0 !== vt1) {
      const k = `T${vt0}>${vt1}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (!samples.has(k)) samples.set(k, []);
      if (samples.get(k)!.length < 3) samples.get(k)!.push(`(${i % W},${(i / W) | 0})`);
    }
    if (A.w[i] !== B.w[i]) {
      const k = `W${A.w[i]}>${B.w[i]}`;
      wpair.set(k, (wpair.get(k) ?? 0) + 1);
    }
  }
  console.log('== type transitions (sheet ids; -1=inactive) ==');
  for (const [k, n] of [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40))
    console.log(`  ${k} ×${n}  ${samples.get(k)!.join(' ')}`);
  console.log('== wall transitions ==');
  for (const [k, n] of [...wpair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${k} ×${n}`);
  // slope/half 也数一下
  let dS = 0, dH = 0;
  for (let i = 0; i < N; i++) { if (A.sl[i] !== B.sl[i]) dS++; if (A.hf[i] !== B.hf[i]) dH++; }
  console.log(`slope diffs=${dS} half diffs=${dH}`);
});

it('wall removal + shimmer zone detail', () => {
  const A = load(104, 'Remove_Broken_Traps');
  const B = load(105, 'Final_Cleanup');
  let wRem = 0, wRemSamples: string[] = [];
  for (let i = 0; i < N; i++) {
    if (A.w[i] !== 0 && B.w[i] === 0) {
      wRem++;
      if (wRemSamples.length < 5) wRemSamples.push(`(${i % W},${(i / W) | 0}) w${A.w[i]}`);
    }
  }
  console.log(`wall removals (X>0 → 0): ${wRem} ${wRemSamples.join(' ')}`);
  // shimmer 中心估计:625→1 转换质心
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < N; i++) {
    if (A.a[i] && A.t[i] === 625 && B.a[i] && B.t[i] === 1) { sx += i % W; sy += (i / W) | 0; n++; }
  }
  console.log(`moss625→stone centroid: (${Math.round(sx / n)},${Math.round(sy / n)}) n=${n}`);
  const cx = Math.round(sx / n), cy = Math.round(sy / n);
  // 半径分布
  let in120 = 0, out120 = 0;
  for (let i = 0; i < N; i++) {
    if (A.a[i] && A.t[i] === 184 && !(B.a[i] && B.t[i] === 184)) {
      const d = Math.hypot((i % W) - cx, ((i / W) | 0) - cy);
      if (d < 120) in120++; else out120++;
    }
  }
  console.log(`moss184 kills: in(shimmer r120)=${in120} out(sweep)=${out120}`);
});

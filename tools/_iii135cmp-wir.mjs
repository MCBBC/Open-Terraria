#!/usr/bin/env node
// IIII104b：truth(~/GoldenChains/golden-ftw-wir) vs js(/tmp/iii135-out/jsdumps) .wir 槽差比较器。
// 用法: node tools/_iii135cmp-wir.mjs [slot=97] [jsdir]
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SLOT = Number(process.argv[2] ?? 97);
const JS = process.argv[3] ?? '/tmp/iii135-out/jsdumps';
const TR = join(homedir(), 'GoldenChains/golden-ftw-wir');
const W = 4200, H = 1200, N = W * H;
const JSPASS = Number(process.env.SW_I135_JSPASS ?? 50); // 槽末#50=微群系→dump#97
const nameOf = (dir, slot, passIdx) => {
  const f = readdirSync(dir).find((x) => new RegExp(
    passIdx !== undefined ? `^${String(passIdx).padStart(3, '0')}_.*\\.wir$` : `^${String(slot).padStart(3, '0')}_.+\\.wir$`,
  ).test(x));
  if (!f) throw new Error(`no .wir for ${dir} slot=${slot} pass=${passIdx}`);
  return `${dir}/${f}`;
};
const a = new Uint8Array(readFileSync(nameOf(TR, SLOT)).buffer, 0, N);
const b = new Uint8Array(readFileSync(nameOf(JS, SLOT, JSPASS)).buffer, 0, N);
let tA = 0, jA = 0, both = 0, first = -1;
const combos = new Map();
for (let i = 0; i < N; i++) {
  const va = a[i] ?? 0, vb = b[i] ?? 0;
  if (va === vb) continue;
  if (first < 0) first = i;
  const ka = [[va, vb].join('>')];
  combos.set(ka[0], (combos.get(ka[0]) ?? 0) + 1);
  // 统计“某侧独有 wire 位”的格数（按红位）
  if ((va & 1) && !(vb & 1)) tA++;
  if (!(va & 1) && (vb & 1)) jA++;
  if (((va | vb) & 17) === 17) void both;
}
console.log(`slot#${SLOT} truth-vs-js wir diff cells=${combos.size ? [...combos.values()].reduce((p, c) => p + c, 0) : 0} first=${first >= 0 ? `(${first % W},${Math.floor(first / W)})` : '-'}`);
console.log('combo top:', [...combos.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([k, v]) => `b${k}×${v}`).join(' '));
console.log(`red-only in truth=${tA}, red-only in js=${jA}`);

// SSSSSSSS2：捕获基座 ↔ x86 dump075 的逐通道复检（完全照抄 _mile8 cmp 口径）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const W = 4200, H = 1200, N = W * H;
const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
(it.skip ? it : it)('noop', () => {});
const RUN = process.env.SW_CAPCHECK === '1';
(RUN ? it : it.skip)('capture channel check', () => {
  const dump = '/tmp/jjj-out/g1457-notraps/075_Place_Fallen_Log.';
  const base = `${process.env.SW_CBASE ?? '/tmp/sss2-out/base-1896728457'}/`;
  const vt = le16(`${dump}typ`), va = readFileSync(`${dump}act`);
  const jt = le16(`${base}type.bin`), ja = readFileSync(`${base}flags.bin`);
  let badA = 0, badT = 0, ghDiff = 0, samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const a1 = va[i]! !== 0, a2 = (ja[i]! & 1) !== 0;
    if (a1 !== a2) {
      badA++;
      if (samples.length < 6) samples.push(`A(${i % W},${(i / W) | 0}) v${a1} j${a2}`);
      continue;
    }
    const t1 = a1 ? vt[i]! : 0;
    const t2 = a2 ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : 0;
    if (t1 !== t2) { badT++; if (samples.length < 6) samples.push(`T(${i % W},${(i / W) | 0}) v${t1} j${t2}`); }
    if (!a1 && !a2 && t1 !== t2) ghDiff++;
  }
  console.log(`badActive=${badA} badType=${badT} ghost=${ghDiff}`);
  console.log(samples.join(' | '));
}, 120000);

// IIII165 一次性：JS 相① 后状态 vs x86 #057 幽灵差谱（Gh 对账——errorWorld raw 门消费）
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I165GH=1 npx vitest run tools/_iii165gh.test.ts
const RUN = process.env.SW_I165GH === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
it('ghost spectrum', () => {
  const G2 = process.env.HOME + '/GoldenChains/i106/x86-iamerror';
  const A = '/tmp/iii165-out/cap-lc/';
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = (nm: string): string => `${G2}/${String([...DUMPNAME.entries()].find(([, v]) => v === nm)![0]).padStart(3, '0')}_${nm}`;
  const bt = le16(`${pre('Wall_Variety')}.typ`), ba = readFileSync(`${pre('Wall_Variety')}.act`);
  const jt = le16(`${A}base_type.bin`), ja = readFileSync(`${A}base_flags.bin`);
  const W = 4200, N = W * 1200;
  const spec = new Map<string, number>();
  let first20 = '';
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (ba[i] || ja[i]) continue;                       // 只看双方都非活性
    const vg = bt[i]!;
    const jg = jt[i] === 0 ? 0 : (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999);
    if (vg !== jg) {
      const k = `van${vg}>js${jg}`;
      if (k === 'van0>js44' || k === 'van0>js191' || k === 'van0>js25') console.log(`CELL ${k} (${i % W},${(i / W) | 0}) jsInternal=${jt[i]}`);
      spec.set(k, (spec.get(k) ?? 0) + 1);
      if (n < 20) first20 += ` (${i % W},${(i / W) | 0})v${vg}j${jg}`;
      n++;
    }
  }
  console.log('ghost mismatch total (both-inactive):', n);
  console.log('spectrum:', [...spec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, c]) => `${k}x${c}`).join(' '));
  console.log('first:', first20);
}, 300_000);

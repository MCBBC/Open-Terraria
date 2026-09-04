// IIII100f 仪②d：墙通道三方对差(JSpre vs g96 vs g97)。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I100F3 === '1';
const OUT = '/tmp/iii225b-out';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, N = W * 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string): Uint8Array => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };

(RUN ? it : it.skip)('iii100f wall-channel 3-way', { timeout: 300_000 }, async () => {
  const jw = le16(`${OUT}/js-pretrack.wal`);
  const gw96 = le16(`${G2}/096_Larva.wal`);
  const gw97 = le16(`${G2}/097_Micro_Biomes.wal`);
  const jpt = le16(`${OUT}/js-pretrack.typ`);
  const jpa = u8(`${OUT}/js-pretrack.act`);
  const lines: string[] = [];
  let a = 0, b = 0; const onlyW: string[] = [];
  for (let i = 0; i < N; i++) {
    const jv = jw[i]!, v6 = gw96[i]!, v7 = gw97[i]!;
    const jd = jv !== v6, gd = v7 !== v6;
    if (!jd && !gd) continue;
    const x = i % W, y = (i / W) | 0;
    if (jd && gd) { a++; continue; }
    if (jd) { b++; if (onlyW.length < 40) onlyW.push(`(${x},${y}) g96=${v6} J=${jv} G97=${v7}`); }
  }
  lines.push(`wall diffs: both(J&G vs g96)=${a} onlyJ=${b}`);
  onlyW.forEach((s) => lines.push('  ' + s));
  // 巷走廊 x∈[1371..1873]∪[1742..2365] 墙差异焦点
  let c1 = 0; const s1: string[] = [];
  for (let y = 500; y <= 980; y++) for (let x = 550; x <= 2400; x++) {
    const i = y * W + x;
    const jv = jw[i]!, v6 = gw96[i]!, v7 = gw97[i]!;
    if (jv !== v6 && v7 === v6) { c1++; if (s1.length < 30) s1.push(`(${x},${y}) g96=${v6} J=${jv} G97=${v7}`); }
  }
  lines.push(`x[550..2400]y[500..980] wall onlyJ=${c1}`);
  s1.forEach((s) => lines.push('  ' + s));
  writeFileSync(`${OUT}/wall100f.txt`, lines.join('\n') + '\n');
});

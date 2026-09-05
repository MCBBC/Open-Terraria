// ★IIIII209 一次性仪：#99 二次沉降 JS 槽末态(pipeslot-99) vs gold 099 全通道差分
// 用法: cd game && SW_I209S99=1 npx vitest run tools/_iii209s99.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I209S99 === '1';
const W = 4200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('iii209 settle99 diff', () => {
  const G = `${process.env.HOME}/GoldenChains/golden-ddual2/099_Settle_Liquids_Again`;
  const D = '/tmp/iii209-out/pipeslot-99';
  const jT = le16(`${D}/base_type.bin`), jA = u8(`${D}/base_flags.bin`);
  const jL = u8(`${D}/base_liquid.bin`), jLt = u8(`${D}/base_liquidType.bin`);
  const jH = u8(`${D}/base_half.bin`), jS = u8(`${D}/base_slope.bin`);
  const gT = le16(`${G}.typ`), gA = u8(`${G}.act`), gL = u8(`${G}.liq`), gLt = u8(`${G}.lty`);
  const gH = u8(`${G}.half`), gS = u8(`${G}.slope`);
  const cells: Array<[number, number, string]> = [];
  for (let i = 0; i < jT.length; i++) {
    const ja = jA[i]!, ga = gA[i]!;
    const jt = ja ? (jT[i]! === 0 ? 0 : (SHEET[jT[i]!]! >= 0 ? SHEET[jT[i]!]! : 9999)) : 0;
    const gt = ga ? gT[i]! : 0;
    const jl = jL[i]! > 0 ? jLt[i]! - 1 : 0, gl = gL[i]! > 0 ? gLt[i]! : 0;   // JS+1基→0基
    if (ja !== ga || jt !== gt || jL[i] !== gL[i] || jl !== gl || jH[i] !== gH[i] || jS[i] !== gS[i]) {
      cells.push([i % W, (i / W) | 0, `A${ga}${ja} T${gt}>${jt} L${gL[i]}>${jL[i]} Y${gl}>${jl}`]);
    }
  }
  console.log(`diff cells = ${cells.length}`);
  const cls = new Map<string, number>();
  for (const c of cells) cls.set(c[2], (cls.get(c[2]) ?? 0) + 1);
  const top = [...cls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [k, n] of top) console.log(`  ${k} ×${n}`);
  // 聚簇(x 带)
  const bands = new Map<string, number>();
  for (const c of cells) { const k = `${Math.floor(c[0] / 50) * 50},${Math.floor(c[1] / 50) * 50}`; bands.set(k, (bands.get(k) ?? 0) + 1); }
  console.log('clusters:', [...bands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
  // 前 40 样本
  for (const c of cells.slice(0, 40)) console.log(`  (${c[0]},${c[1]}) ${c[1]}`);
});

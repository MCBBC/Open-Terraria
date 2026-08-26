// VVV 批刀一：x86 k7 dump vs JS k7 dump 全通道对拍（含内部→vanilla sheet id 映射）
import { TILE_DEFS } from '../src/data/tiles.ts';
import * as fs from 'node:fs';

const W = 4200, H = 1200;
const rd = (p: string) => new Uint8Array(fs.readFileSync(p));
const u16 = (b: Uint8Array, i: number) => b[i] | (b[i] << 8);

const X = '/tmp/uuu-out/liqdump-x86-k7/';
const J = '/tmp/uuu-out/liqdump-js-k7/';
const xt = rd(X + 'K.typ'), xa = rd(X + 'K.act'), xw = rd(X + 'K.wal'), xl = rd(X + 'K.liq');
const jt = rd(J + 'type.bin'), jf = rd(J + 'flags.bin'), jw = rd(J + 'wall.bin'), jl = rd(J + 'liquid.bin');

// 内部 id → vanilla sheet 映射（TILE_DEFS.vanilla.sheet）
const sheetOf = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = (TILE_DEFS[q] as any)?.vanilla?.sheet;
  if (typeof s === 'number') sheetOf[q] = s;
}

let dTyp = 0, dAct = 0, dWal = 0, dLiq = 0;
const typeSamples: string[] = [];
const liqSamples: string[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = y * W + x, kb = k * 2;
    const xv = u16(xt, kb);
    const jsheet = sheetOf[jt[k]] ?? -1;
    if (xv !== jsheet) {
      dTyp++;
      if (typeSamples.length < 40) typeSamples.push(`(${x},${y}) X=${xv} J=${jt[k]}(sheet ${jsheet})`);
    }
    const xaV = xa[k], jaV = (jf[k] & 1) ? 1 : 0;
    if (xaV !== jaV) { dAct++; }
    if (u16(xw, kb) !== jw[k]) dWal++;
    if (xl[k] !== jl[k]) { dLiq++; if (liqSamples.length < 25) liqSamples.push(`(${x},${y}) X=${xl[k]} J=${jl[k]}`); }
  }
}
console.log('typDiff', dTyp, 'actDiff', dAct, 'walDiff', dWal, 'liqDiff', dLiq);
console.log(typeSamples.slice(0, 20).join('\n'));
console.log(liqSamples.join('\n'));

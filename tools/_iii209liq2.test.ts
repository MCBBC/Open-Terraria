// ★IIIII209 #98 液差全图统计：delta 直方 / 深度带 / 首差域形状
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const RUN = process.env.SW_I209L2 === '1';
const JS_DIR = '/tmp/iii209-out/pipeslot-98';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/098_Settle_Liquids_Again';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii209 liquid diff census', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`), jL = u8(`${JS_DIR}/base_liquid.bin`), jLt = u8(`${JS_DIR}/base_liquidType.bin`), jA = u8(`${JS_DIR}/base_flags.bin`);
  const gT = le16(`${GOLD}.typ`), gL = u8(`${GOLD}.liq`), gLt = u8(`${GOLD}.lty`), gA = u8(`${GOLD}.act`);
  const delta = new Map<string, number>();
  const tyDiff: { x: number; y: number; jt: number; gt: number }[] = [];
  const liqCells: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jl = jL[i] ?? 0, gl = gL[i] ?? 0;
    if (jl !== gl) {
      const k = `d${(gl as number) - (jl as number)}`;
      delta.set(k, (delta.get(k) ?? 0) + 1);
      liqCells.push({ x, y, d: gl - jl });
    }
    if ((jLt[i] ?? 0) !== (gLt[i] ?? 0)) delta.set('LT', (delta.get('LT') ?? 0) + 1);
    if ((jT[i] ?? 0) !== (gT[i] ?? 0) && tyDiff.length < 30) tyDiff.push({ x, y, jt: jT[i] ?? 0, gt: gT[i] ?? 0 });
    if ((jA[i] ?? 0) !== (gA[i] ?? 0) && tyDiff.length < 30) tyDiff.push({ x: -x, y, jt: jA[i] ?? 0, gt: gA[i] ?? 0 });
  }
  console.log('delta histogram:', [...delta.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('liq diff cells:', liqCells.length);
  if (liqCells.length) {
    const xs = liqCells.map(c => c.x), ys = liqCells.map(c => c.y);
    console.log(`bbox x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`);
    console.log('first 12:', liqCells.slice(0, 12).map(c => `(${c.x},${c.y})d${c.d}`).join(' '));
  }
  console.log('type/act diff first 30:', tyDiff.map(c => `(${c.x},${c.y})j${c.jt}/g${c.gt}`).join(' '));
});

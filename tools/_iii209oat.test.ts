// ★IIIII209 #99 燕麦/仙人掌差空间分布（SHEET 映射后对拍）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const RUN = process.env.SW_I209O === '1';
const JS_DIR = '/tmp/iii209-out/pipeslot-99';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/099_Cactus__Palm_Trees____Coral';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii99 oat diff census', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const jT = le16(`${JS_DIR}/base_type.bin`), jA = u8(`${JS_DIR}/base_flags.bin`);
  const gT = le16(`${GOLD}.typ`), gA = u8(`${GOLD}.act`);
  const groups: Record<string, { j: number; g: number; cells: [number, number][] }> = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jt = jA[i] ? (SHEET[jT[i] ?? 0] >= 0 ? SHEET[jT[i] ?? 0] : 9999) : 0;
    const gt = gA[i] ? (gT[i] ?? 0) : 0;
    if (jt !== gt) {
      const jg = [jt, gt].sort((a, b) => a - b).join('-');
      const key = jg === '0-529' ? 'SEA_OAT' : jg === '0-530' ? 'OASIS_PLANT' : jg === '0-80' ? 'CACTUS' : jg === '0-323' ? 'PALM323' : 'OTHER';
      if (!groups[key]) groups[key] = { j: 0, g: 0, cells: [] };
      groups[key].cells.push([x, y]);
      if (jt === 529 || jt === 530 || jt === 80 || jt === 323) groups[key].j++;
      if (gt === 529 || gt === 530 || gt === 80 || gt === 323) groups[key].g++;
    }
  }
  for (const [k, v] of Object.entries(groups)) {
    const xs = v.cells.map(c => c[0]), ys = v.cells.map(c => c[1]);
    console.log(`${k}: n=${v.cells.length} (JS-side=${v.j}, x86-side=${v.g}) x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)}`);
    if (k === 'SEA_OAT' || k === 'OASIS_PLANT') {
      const byX = new Map<number, number>();
      for (const [x] of v.cells) byX.set(x, (byX.get(x) ?? 0) + 1);
      console.log(`  ${k} columns: ${[...byX.entries()].sort((a, b) => a[0] - b[0]).map(([x, n]) => `${x}:${n}`).slice(0, 40).join(' ')}`);
    }
  }
});

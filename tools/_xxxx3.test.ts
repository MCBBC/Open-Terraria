// XXXXX 批·#97 wcfirst 4 漏杀格现场检查。用毕即删。
// 用法：cd game && SW_XX=1 npx vitest run tools/_xxxx3.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
const W = 4200, H = 1200, N = W * H;
const G2 = '/tmp/sw-slp/g';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN_probe());

function RUN_probe() {
  return (process.env.SW_XX === '1' ? it : it.skip)('#97 4 missed cells inspection', () => {
    const c = { t: b16(`${G2}/096_${DUMPNAME.get(96)}.typ`), a: b8(`${G2}/096_${DUMPNAME.get(96)}.act`), l: b8(`${G2}/096_${DUMPNAME.get(96)}.liq`), lt: b8(`${G2}/096_${DUMPNAME.get(96)}.lty`) };
    const x86wcAct = b8('/tmp/sw-ddfin/s97wc.act');
    const x86wcLiq = b8('/tmp/sw-ddfin/s97wc.liq');
    const x86qwAct = b8('/tmp/sw-ddfin/s97qw.act');
    const qwL = b8('/tmp/sw-ddfin/s97qw.liq');
    const fw = new Uint32Array(readFileSync('/tmp/www-b/s48/frames.bin').buffer.slice(0));
    const fx = new Uint16Array(N), fy = new Uint16Array(N);
    for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; }
    const cells: Array<[number, number]> = [[2495, 847], [2496, 847], [3800, 1085], [3317, 1097], [3580, 895], [3515, 897], [3124, 972], [3128, 978], [837, 1048], [3687, 1086]];
    for (const [x, y] of cells) {
      const i = y * W + x;
      const sh = c.t[i]!;
      const jsId = REV.get(sh) ?? -1;
      console.log(`(${x},${y}) sheet=${sh} jsId=${jsId}(${TILE_DEFS[jsId]?.key}) base: a=${c.a[i]} l=${c.l[i]} lty=${c.l[i]} frames=(${fx[i]},${fy[i]}) | qw: a=${x86qwAct[i]} l=${qwL[i]} | wc: a=${x86wcAct[i]} l=${x86wcLiq[i]}`);
    }
  });
}

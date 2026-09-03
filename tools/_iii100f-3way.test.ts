// IIII100f 取证仪②c：走廊全差异格清单（JSpre vs g96) + (g97 vs g96) 双侧对照。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I100F3 === '1';
const OUT = process.env.SW_I100F_OUT ?? '/tmp/iii225b-out';
const G2 = process.env.SW_I100F_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p: string): Uint8Array => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };

(RUN ? it : it.skip)('iii100f corridor full diff', { timeout: 300_000 }, async () => {
  const jpt = le16(`${OUT}/js-pretrack.typ`);
  const jpa = u8(`${OUT}/js-pretrack.act`);
  const g97t = le16(`${G2}/097_Micro_Biomes.typ`);
  const g97a = u8(`${G2}/097_Micro_Biomes.act`);
  const g96t = le16(`${G2}/096_Larva.typ`);
  const g96a = u8(`${G2}/096_Larva.act`);
  const jsh = new Uint16Array(W * 1200);
  for (let i = 0; i < W * 1200; i++) jsh[i] = (jpa[i] & 1) ? (SHEET[jpt[i]!] >= 0 ? SHEET[jpt[i]!]! : 9999) : 0;

  const lines: string[] = [];
  // 走廊 = 金标 8 巷 bbox ±12
  const boxes: Array<[number, number, number, number]> = [
    [598, 838, 503, 588], [1371, 1873, 760, 909], [1514, 1837, 879, 971],
    [1742, 2365, 546, 612], [2193, 2369, 618, 676], [2526, 2713, 674, 722],
    [2714, 2942, 791, 830], [3318, 3616, 531, 601],
  ];
  const inBox = (x: number, y: number): boolean => boxes.some(([a, b, c, d]) => x >= a && x <= b && y >= c && y <= d);
  const inLaneCorridor = (x: number, y: number): boolean => {
    // 金标长巷 1383 与 1526 巷的走廊(±12 已含);额外排 JS 1526 巷
    return (x >= 1371 && x <= 1873 && y >= 760 && y <= 971) ;
  };
  let nJ = 0, nG = 0, nBoth = 0;
  const onlyJ: string[] = [], onlyG: string[] = [];
  for (let y = 500; y <= 980; y++) {
    for (let x = 550; x <= 1900; x++) {
      const i = y * W + x;
      const g6 = g96a[i] ? g96t[i]! : 0;
      const jv = jsh[i]!;
      const gv = g97a[i] ? g97t[i]! : 0;
      const jDiff = jv !== g6;
      const gDiff = gv !== g6;
      if (!jDiff && !gDiff) continue;
      if (inLaneCorridor(x, y)) continue;   // 巷走廊(会被 lane 写覆盖,单独看)
      if (jDiff && gDiff) { nBoth++; continue; }
      if (jDiff) { nJ++; if (onlyJ.length < 60) onlyJ.push(`(${x},${y}) g96=${g6} J=${jv} G97=${gv}`); }
      else { nG++; if (onlyG.length < 60) onlyG.push(`(${x},${y}) g96=${g6} G97=${gv} J=${jv}`); }
    }
  }
  lines.push(`corridor-lite x[550..1900] y[500..980] excluding long2/1526 lane box: onlyJ=${nJ} onlyG=${nG} both=${nBoth}`);
  lines.push('ONLY-JS diffs (JS 段写有而金标无):');
  onlyJ.forEach((s) => lines.push('  ' + s));
  lines.push('ONLY-GOLDEN diffs (金标段写有而 JS 无):');
  onlyG.forEach((s) => lines.push('  ' + s));
  writeFileSync(`${OUT}/corridor100f.txt`, lines.join('\n') + '\n');
});

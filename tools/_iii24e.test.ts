// IIII24 批诊断 e：家族空间形态细查（T5 树族/T230 雪带/tree-species 全坐标带直方图）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const G2 = process.env.SW_III24_G2 ?? '/tmp/jjj-out/g1457-ntb';
const OUT = process.env.SW_III24_OUT ?? '/tmp/iii24-out';
const W = 4200, N = W * 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer, 0, readFileSync(p).byteLength >> 1);
function loadCh(idx: number): Record<string, Uint16Array | Uint8Array> {
  const pre = `${G2}/${(readdirSync(G2).find((f) => f.startsWith(`${String(idx).padStart(3, '0')}_`) && f.endsWith('.typ'))!).replace(/\.typ$/, '')}`;
  return { t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`) };
}
it('morph', () => {
  const j58t = le16(`${OUT}/js58_type.bin`);
  const j58f = new Uint8Array(readFileSync(`${OUT}/js58_flags.bin`).buffer, 0, N);
  const j58w = le16(`${OUT}/js58_wall.bin`);
  const d105 = loadCh(105);
  const famCell = (vt: number, jt: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const va = d105.a[i] ? d105.t[i]! : 0;
      const ja = (j58f[i]! & 1) ? SHEET[j58t[i]!]! : 0;
      if (va === vt && ja === jt) out.push(i);
    }
    return out;
  };
  const stat = (nm: string, s: number[]): void => {
    if (!s.length) { console.log(`${nm}: EMPTY`); return; }
    const xs = s.map((i) => i % W), ys = s.map((i) => Math.floor(i / W));
    console.log(`${nm}: n=${s.length} x[${Math.min(...xs)},${Math.max(...xs)}] y[${Math.min(...ys)},${Math.max(...ys)}]`);
    // y 带直方图
    const bh = new Map<number, number>();
    for (const y of ys) bh.set(Math.floor(y / 100) * 100, (bh.get(Math.floor(y / 100) * 100) ?? 0) + 1);
    console.log('   ', [...bh.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join(' '));
  };
  for (const [v, j] of [[5, 0], [596, 0], [616, 0], [596, 616], [616, 596], [636, 62], [61, 62]] as Array<[number, number]>) {
    stat(`T${v}>${j}`, famCell(v, j));
  }
  // (3734,208..220) 竖列双端视图（vanilla vs js，含 wall）
  const colview = (x: number, y0: number, y1: number): void => {
    console.log(`col view x=${x} y${y0}..${y1} [van|js|wallV|wallJ]:`);
    for (let y = y0; y <= y1; y++) {
      const i = y * W + x;
      const v = `${d105.a[i] ? String(d105.t[i]).padStart(3) : ' . '}w${String(d105.w[i]).padStart(3)}`;
      const j2 = `${(j58f[i]! & 1) ? String(SHEET[j58t[i]!] ?? -2).padStart(3) : ' . '}w${String(j58w[i]).padStart(3)}`;
      console.log(`  y=${y} ${v} | ${j2}`);
    }
  };
  colview(3734, 205, 225);
}, 600_000);

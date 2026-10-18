// ★IIIII213 #98 云块水渗定罪仪：L 差格底 tile 普查 / 池塘邻域栅格 / 连通域 delta 平衡
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I213 === '1';
const JS_DIR = process.env.SW_I213_JS ?? '/tmp/iii209-out/pipeslot-98';
const GOLD = process.env.SW_I213_GOLD ?? `${process.env.HOME ?? ''}/GoldenChains/golden-remix/dumps/098_Settle_Liquids_Again`;
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); }
function u8(p: string): Uint8Array { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); }

(RUN ? it : it.skip)('iii213 pond census', () => {
  const jT = le16(`${JS_DIR}/base_type.bin`), jL = u8(`${JS_DIR}/base_liquid.bin`);
  const jLt = u8(`${JS_DIR}/base_liquidType.bin`), jA = u8(`${JS_DIR}/base_flags.bin`);
  const gT = le16(`${GOLD}.typ`), gL = u8(`${GOLD}.liq`), gLt = u8(`${GOLD}.lty`), gA = u8(`${GOLD}.act`);
  // ---- ① L 差格底 tile 普查（gold 侧 act/type 为准；inactive=「空气上水」）----
  const onTile = new Map<number, number>();
  let ltyDiff = 0;
  const cells: { x: number; y: number; d: number; t: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const jl = jL[i] ?? 0, gl = gL[i] ?? 0;
    if (jl === gl) {
      // lty 正确口径：gold 0 基 +1 vs JS 1 基；只裁 liquid>0 格
      const vl = gl > 0 ? (gLt[i] ?? 0) + 1 : 0;
      const jvv = jl > 0 ? (jLt[i] ?? 0) : 0;
      if (vl !== jvv) ltyDiff++;
      continue;
    }
    const ga = (gA[i] ?? 0) !== 0;
    const t = ga ? (gT[i] ?? 0) : -1; // -1=空气上水
    onTile.set(t, (onTile.get(t) ?? 0) + 1);
    cells.push({ x, y, d: gl - jl, t });
  }
  console.log(`L diff cells=${cells.length}  ltyDiff(liquid>0)=${ltyDiff}`);
  console.log('diff-cell underlying tile histogram (top 20):',
    [...onTile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t, n]) => `${t === -1 ? 'AIR' : t}=${n}`).join(' '));
  // ---- ② 连通域 delta 平衡（4 连通,差格之间）----
  const idxOf = new Map<number, number>();
  cells.forEach((c, k) => idxOf.set(c.y * W + c.x, k));
  const seen = new Uint8Array(cells.length);
  const regions: { n: number; sum: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let k = 0; k < cells.length; k++) {
    if (seen[k]) continue;
    const q = [k]; seen[k] = 1;
    let sum = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (q.length) {
      const c = cells[q.pop()!];
      sum += c.d;
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = idxOf.get((c.y + dy) * W + (c.x + dx));
        if (nk !== undefined && !seen[nk]) { seen[nk] = 1; q.push(nk); }
      }
    }
    regions.push({ n: sum !== 0 ? 1e9 : 1, sum, x0, x1, y0, y1 });
  }
  const nonzero = regions.filter(r => r.sum !== 0);
  console.log(`regions=${regions.length} 非平衡(Σd≠0)=${nonzero.length}`);
  console.log('Σd≠0 regions top 12:',
    nonzero.sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum)).slice(0, 12)
      .map(r => `Σ${r.sum > 0 ? '+' : ''}${r.sum}[n?](${r.x0}..${r.x1},${r.y0}..${r.y1})`).join(' '));
  console.log('Σd≠0 size hist:',
    (() => { const m = new Map<number, number>(); for (const r of nonzero) m.set(r.sum, (m.get(r.sum) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([s, n]) => `Σ${s}×${n}`).join(' '); })());
  // ---- ③ 池塘邻域栅格 (x 3672..3700, y 104..126)：每格 sheet/liq(g,j) ----
  const rowOf = (y: number) => {
    let s = '';
    for (let x = 3672; x <= 3700; x++) {
      const i = y * W + x;
      const ga = (gA[i] ?? 0) !== 0, ja = (jA[i] ?? 0) !== 0;
      const gt = ga ? (gT[i] ?? 0) : -1, jt = ja ? SHEET[jT[i] ?? 0] : -1;
      const gl = gL[i] ?? 0, jl = jL[i] ?? 0;
      const tch = gt !== jt ? '!' : '.';
      s += `${tch}${gl === jl ? String(gl).padStart(3) : `${gl}/${jl}`.slice(0, 3).padEnd(3)} `;
    }
    return s;
  };
  console.log('pond grid (cols 3672..3700, cell= !flag g/j liquid, .flag=same; ! =type diff):');
  console.log('     ' + Array.from({ length: 29 }, (_, k) => String(3672 + k).slice(-2).padStart(4)).join('').slice(0));
  for (let y = 104; y <= 126; y++) console.log(`y${String(y).padStart(4)} ${rowOf(y)}`);
  // 底 tile 行（gold 侧）
  let bt = '     ';
  for (let x = 3672; x <= 3700; x++) { const i = 113 * W + x; bt += String(gA[i] ? gT[i] : -1).padStart(4); }
  console.log(`y113 tiles ${bt}`);
  // ---- ④ 池底/池壁云块上有没有水（两侧）----
  let inCloudWaterG = 0, inCloudWaterJ = 0;
  for (let y = 100; y <= 130; y++) for (let x = 3660; x <= 3720; x++) {
    const i = y * W + x;
    const ga = (gA[i] ?? 0) !== 0, ja = (jA[i] ?? 0) !== 0;
    if (ga && (gT[i] ?? 0) === 189 && (gL[i] ?? 0) > 0) inCloudWaterG++;
    if (ja && (jT[i] ?? 0) === 91 && (jL[i] ?? 0) > 0) inCloudWaterJ++;
  }
  console.log(`cloud cell containing liquid near pond: gold=${inCloudWaterG} js=${inCloudWaterJ}`);
});

// IIII24 批诊断 c：离线分析落盘快照（零生成）。回答：
// Q1 T62>0 处 js57 基态分布（vanilla 是“新增藤”还是“本有而 JS 杀”）；
// Q2 全对直方图 top30（含反向家族）；
// Q3 T43>59/T60>43/T60>59 三族的 v-tile 组成与 bbox 重叠矩阵；
// Q4 藤链锚：T62>0 单元格上方连续同 62 链顶的上邻 vanilla 类型直方图；
// Q5 家族两两空间重叠；Q6 门内 motley 反差样本（v/j act+type+walls 完整行）。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const G2 = process.env.SW_III24_G2 ?? '/tmp/jjj-out/g1457-ntb';
const OUT = process.env.SW_III24_OUT ?? '/tmp/iii24-out';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer, 0, readFileSync(p).byteLength >> 1);
function loadCh(idx: number): Record<string, Uint16Array | Uint8Array> {
  const pre = `${G2}/${(readdirSync(G2).find((f) => f.startsWith(`${String(idx).padStart(3, '0')}_`) && f.endsWith('.typ'))!).replace(/\.typ$/, '')}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`), l: readFileSync(`${pre}.liq`),
  };
}
it('analyze', () => {
  const rd = (n: string, C: typeof Uint8Array | typeof Uint16Array) =>
    C === Uint16Array ? le16(`${OUT}/${n}`) : new Uint8Array(readFileSync(`${OUT}/${n}`).buffer, 0, N);
  // C lint workaround
  const rdb = (n: string): Uint8Array => new Uint8Array(readFileSync(`${OUT}/${n}`).buffer, 0, N);
  void rd;
  const j57t = le16(`${OUT}/js57_type.bin`), j58t = le16(`${OUT}/js58_type.bin`);
  const j57f = rdb('js57_flags.bin'), j58f = rdb('js58_flags.bin');
  const j58w = le16('js58_wall.bin'.replace(/^/, `${OUT}/`).replace('//', '/'));
  void j58w;
  const d104 = loadCh(104), d105 = loadCh(105);

  const vtOf = (i: number): number => (d105.a[i] ? d105.t[i]! : 0);
  const jtOf = (i: number): number => ((j58f[i]! & 1) ? (SHEET[j58t[i]!]! >= 0 ? SHEET[j58t[i]!]! : 9999) : 0);

  // Q2 full pairs
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    if (vtOf(i) !== jtOf(i)) {
      const k = `T${vtOf(i)}>${jtOf(i)}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
    }
  }
  console.log('Q2 top pairs:', [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, n]) => `${k}×${n}`).join(' '));

  // family coordinate sets
  const fam = (pred: (i: number) => boolean): number[] => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (pred(i)) out.push(i);
    return out;
  };
  const F62 = fam((i) => vtOf(i) === 62 && jtOf(i) === 0);
  const F61 = fam((i) => vtOf(i) === 61 && jtOf(i) === 0);
  const F6059 = fam((i) => vtOf(i) === 60 && jtOf(i) === 59);
  const F6043 = fam((i) => vtOf(i) === 60 && jtOf(i) === 43);
  const F4359 = fam((i) => vtOf(i) === 43 && jtOf(i) === 59);

  // Q1 base state at F62 cells: j57 residual sheet histogram
  const h1 = new Map<number, number>();
  for (const i of F62) {
    const b = (j57f[i]! & 1) ? SHEET[j57t[i]!] : -1;
    h1.set(b, (h1.get(b) ?? 0) + 1);
  }
  console.log('Q1 T62>0 cells js57-state(sheet|-1) hist:', [...h1.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  const h2 = new Map<number, number>();
  for (const i of F61) {
    const b = (j57f[i]! & 1) ? SHEET[j57t[i]!] : -1;
    h2.set(b, (h2.get(b) ?? 0) + 1);
  }
  console.log('Q1b T61>0 cells js57-state hist:', [...h2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

  // Q3 composition of vanilla side for each family at entry(vt from dump104)
  for (const [nm, set] of [['F6059', F6059], ['F6043', F6043], ['F4359', F4359]] as const) {
    const hh = new Map<number, number>();
    for (const i of set) { const b = d104.a[i] ? d104.t[i]! : -1; hh.set(b, (hh.get(b) ?? 0) + 1); }
    console.log(`Q3 ${nm} n=${set.length} entry-vtile hist:`, [...hh.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  }

  // Q4 vine chain anchors: for F62 cells find chain-top upward neighbor's v-type
  const anchor = new Map<number, number>();
  let processed = 0;
  for (const i of F62) {
    if (processed > 200000) break;
    processed++;
    let y = Math.floor(i / W), x = i % W;
    // climb while same-column vine above
    while (y - 1 >= 0 && d105.a[(y - 1) * W + x] && d105.t[(y - 1) * W + x] === 62) y--;
    const up = d105.a[(y - 1) * W + x] ? d105.t[(y - 1) * W + x]! : -1;
    anchor.set(up, (anchor.get(up) ?? 0) + 1);
  }
  console.log('Q4 T62>0 chain-top up-neighbor vtype:', [...anchor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));

  // Q5 overlap matrix: which cells of each family are within distance<=3 of another family's cells?
  const near = (setA: number[], setB: number[]): Set<number> => {
    const bs = new Set(setB);
    const bx = new Map<number, boolean>();
    for (const i of bs) bx.set(i, true);
    const hit = new Set<number>();
    for (const i of setA) {
      const x = i % W, y = (i / W) | 0;
      outer: for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (bx.has(yy * W + xx)) { hit.add(i); break outer; }
        }
      }
    }
    return hit;
  };
  console.log('Q5 overlaps(near≤3):',
    ['F62/F6059', () => near(F62, F6059).size], ['F62/F4359', () => near(F62, F4359).size],
    ['F62/F6043', () => near(F62, F6043).size], ['F61/F6059', () => near(F61, F6059).size],
    ['F61/F62', () => near(F61, F62).size], ['F6059/F4359', () => near(F6059, F4359).size]
      .map == null ? null : null);
  // simpler explicit prints
  const show = (tag: string, n: number, tot: number) => console.log(`   ${tag}: ${n}/${tot}`);
  show('F62 near F6059', near(F62, F6059).size, F62.length);
  show('F62 near F4359', near(F62, F4359).size, F62.length);
  show('F62 near F6043', near(F62, F6043).size, F62.length);
  show('F61 near F6059', near(F61, F6059).size, F61.length);
  show('F61 near F62', near(F61, F62).size, F61.length);
  show('F6059 near F4359', near(F6059, F4359).size, F6059.length);

  // Q6 where vanilla had active tile but js inactive inside dungeon region AND type differs from neighbors? sample rows
  const region = F62.concat(F6059).concat(F6043).concat(F4359);
  const minX = Math.min(...region.map((i) => i % W)), maxX = Math.max(...region.map((i) => i % W));
  const minY = Math.min(...region.map((i) => (i / W) | 0)), maxY = Math.max(...region.map((i) => (i / W) | 0));
  console.log(`Q6 unified bbox x[${minX},${maxX}] y[${minY},${maxY}] size=${region.length}`);

  // Q7: 在该 bbox 内 vanilla 活性 vs js 活性的构成直方图（双方各自 type 计数）
  const hv = new Map<number, number>(), hj = new Map<number, number>();
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const i = y * W + x;
      if (d105.a[i]) hv.set(d105.t[i]!, (hv.get(d105.t[i]!) ?? 0) + 1);
      if (j58f[i]! & 1) hj.set(SHEET[j58t[i]!]!, (hj.get(SHEET[j58t[i]!]!) ?? 0) + 1);
    }
  }
  const fmtH = (m: Map<number, number>): string =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k}:${n}`).join(' ');
  console.log('Q7 vanilla types-in-bbox:', fmtH(hv));
  console.log('Q7 js     types-in-bbox:', fmtH(hj));

  // Q8 js58 ghost residual at F62 cells（JS 侧这些格的残型）
  const hg = new Map<number, number>();
  for (const i of F62) hg.set(SHEET[j58t[i]!]!, (hg.get(SHEET[j58t[i]!]!) ?? 0) + 1);
  console.log('Q8 T62>0 js58 raw-sheet(hist):', [...hg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
}, 600_000);

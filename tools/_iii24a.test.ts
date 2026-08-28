// IIII24 批一次性诊断（ntb 链 #105 Final_Cleanup 收官）：全管线跑到槽末#58，
// 在槽末#57/#58 回调拍快照，对 dump104/dump105 八通道做家族级解剖。
// 用法：cd game && SW_III24=1 npx vitest run tools/_iii24a.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_III24 === '1';
const G2 = process.env.SW_III24_G2 ?? '/tmp/jjj-out/g1457-ntb';
const SEED = process.env.SW_III24_SEED ?? '1372357239';
const W = Number(process.env.SW_III24_W ?? 4200), H = Number(process.env.SW_III24_H ?? 1200);
const N = W * H;
const OUT = process.env.SW_III24_OUT ?? '/tmp/iii24-out';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function loadCh(idx: number): Ch {
  const names = readdirSync(G2).filter((f) => f.startsWith(`${String(idx).padStart(3, '0')}_`));
  const nm = names.find((f) => f.endsWith('.typ'))!;
  const pre = `${G2}/${nm.replace(/\.typ$/, '')}`;
  const le16 = (p: string): Uint16Array => new Uint16Array(readFileSync(p).buffer, 0, readFileSync(p).byteLength >> 1);
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}
interface Snap {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}
function snap(store: unknown): Snap {
  const s = store as Snap;
  return {
    type: new Uint16Array(s.type), flags: new Uint8Array(s.flags), wall: new Uint16Array(s.wall),
    liquid: new Uint8Array(s.liquid), half: new Uint8Array(s.half), slope: new Uint8Array(s.slope),
    wire: new Uint8Array(s.wire),
  };
}

(RUN ? it : it.skip)('iiiiii4 family dissection', async () => {
  let S57: Snap | null = null, S58: Snap | null = null;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: -1 as const,
    seedFlags: { notTheBees: true },
    onWorldPartial: (w, i) => {
      if (i === 57) S57 = snap(w.store);
      else if (i === 58) S58 = snap(w.store);
    },
  });
  if (!S58) throw new Error('no snap');
  const D105 = loadCh(105), D104 = loadCh(104);
  const van105 = { t: D105.t, a: D105.a };
  // 家族表：vanilla105 → js105 值（js 值域= jt 定义：inactive→0, active→SHEET）
  const FAMILIES = ['T62>0', 'T61>0', 'T60>59', 'T60>43', 'T43>59', 'T230>161', 'T161>230', 'T147>229', 'T229>0'] as const;

  type Cell = { x: number; y: number; vt: number; va: number; jt: number; ja: number; vw: number; jw: number; vl: number };
  const famCells = new Map<string, Cell[]>();
  for (const f of FAMILIES) famCells.set(f, []);
  const [fv, fj] = ['T62>0', 'T61>0', 'T60>59', 'T60>43', 'T43>59', 'T230>161', 'T161>230'].map(() => [] as string[]);
  void fv; void fj;
  for (let i = 0; i < N; i++) {
    const va = D105.a[i]!, ja = S58!.flags[i]! & 1;
    const vt = va ? D105.t[i]! : 0;
    const jti = S58!.type[i]!;
    const jt = ja ? (SHEET[jti]! >= 0 ? SHEET[jti]! : 9999) : 0;
    const k = `T${vt}>${jt}`;
    if ((famCells as Map<string, Cell[]>).has(k)) {
      (famCells.get(k) as Cell[]).push({
        x: i % W, y: Math.floor(i / W), vt, va, jt, ja,
        vw: D105.w[i]!, jw: S58!.wall[i]!, vl: D105.l[i]!,
      });
    }
  }
  console.log(`slot57-vs-dump104 sanity: computing...`);
  let sanity = '';
  {
    let c = 0, firstX = -1, firstY = -1;
    for (let i = 0; i < N; i++) {
      const va = D104.a[i]!, ja = S57!.flags[i]! & 1;
      const vt = va ? D104.t[i]! : 0;
      const jt = ja ? (SHEET[S57!.type[i]!]! >= 0 ? SHEET[S57!.type[i]!]! : 9999) : 0;
      if (va !== ja || vt !== jt || D104.w[i] !== S57!.wall[i]) {
        if (!c) { firstX = i % W; firstY = Math.floor(i / W); }
        c++;
      }
    }
    sanity = `S57↔dump104 A/T/W mismatch cells=${c} first=(${firstX},${firstY})`;
  }
  console.log(sanity);

  const report: string[] = [];
  for (const f of FAMILIES) {
    const cells = famCells.get(f)!;
    if (cells.length === 0) { console.log(`${f}: EMPTY ✓`); continue; }
    let minX = 9e9, maxX = -9e9, minY = 9e9, maxY = -9e9;
    const yBins = new Map<number, number>(), xBins = new Map<number, number>();
    for (const c of cells) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      yBins.set(Math.floor(c.y / 50) * 50, (yBins.get(Math.floor(c.y / 50) * 50) ?? 0) + 1);
      xBins.set(Math.floor(c.x / 250) * 250, (xBins.get(Math.floor(c.x / 250) * 250) ?? 0) + 1);
    }
    const top = [...xBins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k2, n]) => `${k2}:${n}`).join(' ');
    const wallHist = new Map<number, number>();
    for (const c of cells.slice()) wallHist.set(c.jw, (wallHist.get(c.jw) ?? 0) + 1);
    const topW = [...wallHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k2, n]) => `${k2}:${n}`).join(' ');
    const line = `${f}: n=${cells.length} bbox x[${minX},${maxX}] y[${minY},${maxY}]`;
    console.log(line);
    console.log(`   x-bins(250): ${top}`);
    console.log(`   ybins50 top: ${[...yBins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k2, n]) => `${k2}:${n}`).join(' ')}`);
    console.log(`   js-wall@cells: ${topW}`);
    report.push([line, `xbins ${top}`, `walls ${topW}`].join('\n'));
    // neighborhood mini-grid 样本
    const picks = [cells[Math.floor(cells.length * 0.05)], cells[Math.floor(cells.length * 0.5)], cells[Math.floor(cells.length * 0.95)]];
    for (const p of picks) {
      const cx = p.x, cy = p.y;
      const gridV: string[] = [], gridJ: string[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        const rowV: string[] = [], rowJ: string[] = [];
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(W - 1, Math.max(0, cx + dx)), yy = Math.min(H - 1, Math.max(0, cy + dy));
          const ii = yy * W + xx;
          const va = D105.a[ii]!, ja = S58!.flags[ii]! & 1;
          rowV.push(String(va ? D105.t[ii]! : (D105.t[ii] ? D105.t[ii] : -1)));
          rowJ.push(String(ja ? SHEET[S58!.type[ii]!] : -1));
        }
        gridV.push(rowV.join(','));
        gridJ.push(rowJ.join(','));
      }
      const msg = `[${f}] sample(${cx},${cy}) typ105-5x5(raw v / js sheet, -1=off)\n   V:${gridV.join('\n    ')}\n   J:${gridJ.join('\n    ')}\n   walls J@cell=${p.jw} V=${p.vw} liq V=${p.vl}`;
      console.log(msg);
      report.push(msg);
    }
  }
  writeFileSync(`${OUT}/families.txt`, report.join('\n---\n'));
  console.log('families written');
}, 900_000);

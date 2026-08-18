// XXX 批：m/l 世界差异格空间/类型分流探针。
// 对指定世界（/tmp/vserver86 基线）生成 JS 世界 → 差格按（带 × 区域 × 差异对）分流：
//   区域 mask：dungeon（锚 ±180 × 深度带盒）/ jungle（vanilla 泥岩柱带，deep 密度≥25%
//   的最大连续段）/ beach（两侧 380）/ none。
//   另输出 typ 差异对的 x 桶直方图（84 桶）——检测整板位移/分界带集中（JunglePass 前科签名）。
// 用法：SW_CLS=list:m111.wld,l2222.wld npx vitest run tools/_xxxcls.test.ts
//       （TSV 行名；输出 JSON 到 /tmp/xxx-cls.json）
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_CLS;
const VSRV = process.env.SW_CLS_VSRV ?? '/tmp/vserver86';
const TSV = `${VSRV}/matrix-anchors.tsv`;
const OUT = process.env.SW_CLS_OUT ?? '/tmp/xxx-cls.json';
const FILES = (process.env.SW_CLS_LIST ?? (process.env.SW_CLS ?? '').startsWith('list:') ? process.env.SW_CLS.slice(5) : process.env.SW_CLS_LIST ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const SIZE_ID: Record<string, 0 | 1 | 2> = { s: 0, m: 1, l: 2 };
const BANDS = ['sky', 'surf', 'cave', 'deep', 'hell'] as const;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Row { file: string; size: 's' | 'm' | 'l'; seed: string; evil: 0 | 1; ground: number; rock: number; dungeonX: number; dungeonY: number }
function loadRows(): Row[] {
  const lines = readFileSync(TSV, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('file\t'));
  return lines.map((line) => {
    const c = line.split('\t');
    return { file: c[0], size: c[1] as Row['size'], seed: c[2], evil: c[3] === '1' ? 1 : 0, ground: Number(c[4]), rock: Number(c[5]), dungeonX: Number(c[8]), dungeonY: Number(c[9]) };
  });
}

interface Out {
  file: string; w: number; h: number;
  cells: number;
  overall: { typ: number; wal: number; liq: number };
  // [band][region] → 通道计数
  reg: Record<string, { cells: number; typ: number; wal: number; liq: number }>;
  // 差异对明细：pairKey → 数量（分 typ/wal），带 region 细目
  pairs: Record<'typ' | 'wal' | 'liq', Array<{ k: string; n: number; byReg: Record<string, number> }>>;
  // typ 差异 x 桶（84 桶）
  xhist: { typ: number[]; wal: number[]; liq: number[] };
  // 每带 top 对
  bandPairs: Record<string, Array<[string, number, string]>>; // band → [pair, n, region-major]
  jungleX0: number; jungleX1: number;
}

const REGIONS = ['dungeon', 'jungle', 'beach', 'none'] as const;
type Region = (typeof REGIONS)[number];

(RUN ? it : it.skip)('xxx classification', async () => {
  const rows = loadRows().filter((r) => FILES.includes(r.file));
  const report: Record<string, Out> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  for (const row of rows) {
    const t0 = Date.now();
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${row.file}`)));
    const world = await generateWorld({
      size: SIZE_ID[row.size], width: SIZE_DIMS[SIZE_ID[row.size]].width, height: SIZE_DIMS[SIZE_ID[row.size]].height,
      seedText: row.seed, evil: row.evil,
    });
    const st = world.store;
    const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
    const wt = wld.tiles, jt = st;

    // ---- jungle mask：vanilla 泥(59) 柱带（y∈[rock,h-200) 密度≥25% 的最大连续段）----
    const hellTop = h - 200;
    const mudCol = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let y = row.rock; y < hellTop; y++) { const i = y * w + x; if (wt.active[i] === 1 && wt.type[i] === 59) c++; }
      mudCol[x] = c / Math.max(1, hellTop - row.rock);
    }
    const TH = 0.25;
    let jx0 = -1, jx1 = -1, best = 0;
    for (let x = 0, run0 = -1; x <= w; x++) {
      const hot = x < w && mudCol[x] >= TH;
      if (hot && run0 < 0) run0 = x;
      if (!hot && run0 >= 0) {
        if (x - run0 > best) { best = x - run0; jx0 = run0; jx1 = x - 1; }
        run0 = -1;
      }
    }

    const gl = Math.floor(wld.groundLevel), rl = Math.floor(wld.rockLevel);
    const caveEnd = rl + ((hellTop - rl) >> 1);
    const bandOfY = (y: number): number => (y < gl - 60 ? 0 : y < rl ? 1 : y < caveEnd ? 2 : y < hellTop ? 3 : 4);
    const regionOf = (x: number, y: number): Region => {
      if (Math.abs(x - row.dungeonX) <= 180 && y >= row.dungeonY - 60 && y <= row.dungeonY + 280) return 'dungeon';
      if (x >= jx0 && x <= jx1) return 'jungle';
      if (x < 380 || x > w - 380) return 'beach';
      return 'none';
    };

    const reg: Record<string, { cells: number; typ: number; wal: number; liq: number }> = {};
    for (const b of BANDS) for (const r of REGIONS) reg[`${b}.${r}`] = { cells: 0, typ: 0, wal: 0, liq: 0 };
    const pairs: Out['pairs'] = { typ: [], wal: [], liq: [] };
    const pmap: Record<string, Map<string, { n: number; byReg: Record<string, number> }>> = { typ: new Map(), wal: new Map(), liq: new Map() };
    const NB = 84;
    const xhist = { typ: new Array(NB).fill(0), wal: new Array(NB).fill(0), liq: new Array(NB).fill(0) };
    const overall = { typ: 0, wal: 0, liq: 0 };

    for (let x = 0; x < w; x++) {
      const xb = Math.min(NB - 1, Math.floor((x / w) * NB));
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        const b = BANDS[bandOfY(y)];
        const r = regionOf(x, y);
        const rk = `${b}.${r}`;
        reg[rk].cells++;
        const va = wt.active[i] === 1;
        const jt2 = jt.type[i];
        const ja = jt2 !== 0;
        let vt = -1;
        if (va) vt = wt.type[i];
        let jv = -1;
        if (ja) { const s = SHEET[jt2]; jv = s >= 0 ? s : -2; }
        if (va !== ja || (va && vt !== jv)) {
          overall.typ++; reg[rk].typ++; xhist.typ[xb]++;
          const k = `${vt}>${jv === -2 ? 'UNM' : jv}`;
          const e = pmap.typ.get(k) ?? { n: 0, byReg: {} };
          e.n++; e.byReg[rk] = (e.byReg[rk] ?? 0) + 1; pmap.typ.set(k, e);
        }
        if (wt.wall[i] !== jt.wall[i]) {
          overall.wal++; reg[rk].wal++; xhist.wal[xb]++;
          const k = `${wt.wall[i]}>${jt.wall[i]}`;
          const e = pmap.wal.get(k) ?? { n: 0, byReg: {} };
          e.n++; e.byReg[rk] = (e.byReg[rk] ?? 0) + 1; pmap.wal.set(k, e);
        }
        const vamt = wt.liquid[i], jamt = jt.liquid[i];
        const vlt = vamt > 0 ? wt.liquidType[i] : 0;
        const jlt = jamt > 0 ? jt.liquidType[i] : 0;
        if (vamt !== jamt || vlt !== jlt) {
          overall.liq++; reg[rk].liq++; xhist.liq[xb]++;
          const k = `t${vlt}:${vamt}>t${jlt}:${jamt}`;
          const e = pmap.liq.get(k) ?? { n: 0, byReg: {} };
          e.n++; e.byReg[rk] = (e.byReg[rk] ?? 0) + 1; pmap.liq.set(k, e);
        }
      }
    }
    for (const ch of ['typ', 'wal', 'liq'] as const) {
      pairs[ch] = [...pmap[ch].entries()].map(([k, e]) => ({ k, n: e.n, byReg: e.byReg })).sort((a, b2) => b2.n - a.n);
    }
    const bandPairs: Record<string, Array<[string, number, string]>> = {};
    for (const b of BANDS) {
      bandPairs[b] = pairs.typ.filter((p) => Object.keys(p.byReg).some((r) => r.startsWith(b + '.')))
        .map((p) => {
          let n = 0, bestR = '';
          for (const [r, c] of Object.entries(p.byReg)) if (r.startsWith(b + '.') && c > n) { n = c; bestR = r; }
          return [p.k, n, bestR] as [string, number, string];
        }).sort((a, b2) => b2[1] - a[1]).slice(0, 8);
    }
    report[row.file] = {
      file: row.file, w, h, cells: n, overall, reg, pairs, xhist, bandPairs, jungleX0: jx0, jungleX1: jx1,
    };
    writeFileSync(OUT, JSON.stringify(report));
    console.log(`✓ ${row.file} ${((Date.now() - t0) / 1000) | 0}s typ=${overall.typ}(${(overall.typ / n * 100).toFixed(2)}%) wal=${overall.wal}(${(overall.wal / n * 100).toFixed(2)}%) liq=${overall.liq}(${(overall.liq / n * 100).toFixed(2)}%) jungle=[${jx0},${jx1}]`);
  }
  console.log(`→ ${OUT}`);
}, 1200000);

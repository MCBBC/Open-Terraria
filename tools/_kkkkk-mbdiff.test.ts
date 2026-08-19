// KKKKK 一次性探针：#101 MicroBiomes 全通道差分坐标落盘（wall/act/type 直方图）。
// 复刻 _wwwrep 槽 53（boundary s52 + 基座 100 + 金标帧/线直注）——用毕即删。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';

const RUN = process.env.SW_KK === 'diff';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

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

const gPath = (ext: string) => `${G2}/100_Lihzahrd_Altars.${ext}`;
const b8 = (e: string) => new Uint8Array(readFileSync(gPath(e)).buffer.slice(0));
const b16 = (e: string) => new Uint16Array(readFileSync(gPath(e)).buffer.slice(0));
const c = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };

const gs = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
const ids35 = new Map<number, number>();
for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
type Chests = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
const chests: Chests = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8'));

(RUN ? it : it.skip)('kkkkk mb diff', () => {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) { id = REV.get(sh) ?? -1; }
      if (id < 0) id = 0;
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = c.ia[i]! ? 0x20 : 0;
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
    st.wire[i] |= wire[i];
  }
  // 金标帧/线直注（TTTT 同款）
  {
    const b = readFileSync('/tmp/tttt-fr/101_Micro_Biomes.fr');
    const cnt = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0, true);
    for (let q = 0; q < cnt; q++) {
      const off = 4 + q * 8;
      const idx = new DataView(b.buffer, b.byteOffset).getUint32(off, true);
      st.frameX[idx] = new DataView(b.buffer, b.byteOffset).getUint16(off + 4, true);
      st.frameY[idx] = new DataView(b.buffer, b.byteOffset).getUint16(off + 6, true);
    }
    const gw = new Uint8Array(readFileSync('/tmp/tttt-frw/101_Micro_Biomes.wire').buffer.slice(0));
    for (let i = 0; i < N; i++) st.wire[i] = (st.wire[i]! & ~0x1f) | (gw[i]! & 0x1f);
  }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  runMicroBiomesPass(st, new RNG(SEED), structuredClone(gs), structuredClone(chests));
  // 全通道差分落盘
  const out: string[] = [];
  const g101t = new Uint16Array(readFileSync(`${G2}/101_Micro_Biomes.typ`).buffer.slice(0));
  const g101a = new Uint8Array(readFileSync(`${G2}/101_Micro_Biomes.act`).buffer.slice(0));
  const g101w = new Uint16Array(readFileSync(`${G2}/101_Micro_Biomes.wal`).buffer.slice(0));
  let wd = 0, ad = 0, td = 0;
  const wPairs = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (g101w[i]! !== st.wall[i]!) { wd++; const k = `W${g101w[i]}>${st.wall[i]}`; wPairs.set(k, (wPairs.get(k) ?? 0) + 1); if (wd <= 40) out.push(`W (${x},${y}) v${g101w[i]} j${st.wall[i]}`); }
    const va = g101a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { ad++; if (ad <= 80) out.push(`A (${x},${y}) v${va} j${ja}`); }
    const vt = va ? g101t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { td++; if (td <= 80) out.push(`T (${x},${y}) v${vt} j${jt}`); }
  }
  out.push(`# W=${wd} A=${ad} T=${td}`);
  out.push('# wall pairs: ' + [...wPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, n]) => `${k}×${n}`).join(' '));
  // wall 差坐标聚类（列直方图）
  const colHist = new Map<number, number>();
  for (let i = 0; i < N; i++) if (g101w[i]! !== st.wall[i]!) { const x = i % W; colHist.set(x, (colHist.get(x) ?? 0) + 1); }
  const cols = [...colHist.entries()].sort((a, b) => a[0] - b[0]);
  // 相邻列合并成带
  const bands: string[] = [];
  let lo = -9, hi = -9, n = 0;
  for (const [x, cnt] of cols) {
    if (x > hi + 30) { if (hi >= 0) bands.push(`x${lo}-${hi} n=${n}`); lo = x; n = 0; }
    hi = x; n += cnt;
  }
  if (hi >= 0) bands.push(`x${lo}-${hi} n=${n}`);
  out.push('# wall bands: ' + bands.join(' | '));
  writeFileSync('/tmp/kkkkk-mbdiff.txt', out.join('\n') + '\n');
  console.log(out.slice(-3).join('\n'));
  __setGenStateForProbe(null);
}, 300_000);

// EEEE 批·分解探针：#76 Traps 自因 4.9k 分解为「自造前置段贡献」vs「Traps 主体谓词债」。
// 用法：cd game && SW_EEEE=1 npx vitest run tools/_eeeedecomp.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runSurfaceDecorPass } from '../src/world/gen/vanilla/StructuresPass';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_EEEE === '1';
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
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

interface Boundary { gs: GenState; gensolid: Map<number, boolean>; fx: Uint16Array; fy: Uint16Array; wire: Uint8Array; ids35: Map<number, number>; chests: unknown[] }
function boundary(key: string): Boundary {
  const dir = `${BDIR}/${key}`;
  if (!existsSync(`${dir}/gs.json`)) throw new Error(`no boundary ${key}`);
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chests = JSON.parse(readFileSync(`${dir}/chests.json`, 'utf8')) as unknown[];
  return { gs, gensolid, fx, fy, wire, ids35, chests };
}

const chCache = new Map<number, { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }>();
function chans(idx: number) {
  const hit = chCache.get(idx);
  if (hit) return hit;
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const c = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };
  chCache.set(idx, c);
  return c;
}

function buildBase(baseIdx: number, b: Boundary): TileStore {
  const c = chans(baseIdx);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = c.a[i]!;
    st.flags[i] = act;
    if (act || c.t[i]) {
      const sh = c.t[i]!;
      let id = b.ids35.has(i) ? b.ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      if (id < 0) id = 0;
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = c.w[i]!;
    st.liquid[i] = c.l[i]!;
    st.liquidType[i] = c.l[i] ? c.lt[i]! + 1 : 0;
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = (c.ia[i]! ? 0x20 : 0) | b.wire[i];
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i];
  }
  return st;
}

interface Row { tag: string; dA: number; dT: number; dHf: number; dSl: number; pairs: Array<[string, number]>; samples: string[]; first: string }
function diffStore(tag: string, idx: number, st: TileStore): Row {
  const c = chans(idx);
  const r: Row = { tag, dA: 0, dT: 0, dHf: 0, dSl: 0, pairs: [], samples: [], first: '' };
  const pair = new Map<string, number>();
  let firstI = -1;
  for (let i = 0; i < N; i++) {
    const va = c.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; if (firstI < 0) firstI = i; if (r.samples.length < 12) r.samples.push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    const vt = va ? c.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); if (r.samples.length < 12) r.samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (c.hf[i]! !== st.half[i]!) r.dHf++;
    if (c.sl[i]! !== st.slope[i]!) r.dSl++;
  }
  if (firstI >= 0) r.first = `(${firstI % W},${Math.floor(firstI / W)})`;
  r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => [k, n] as [string, number]);
  return r;
}
function printRow(r: Row): void {
  console.log(`\n== ${r.tag}  A=${r.dA} T(cellpairs) Hf=${r.dHf} Sl=${r.dSl} first=${r.first}`);
  console.log(`   pairs: ${r.pairs.map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`   first-samples: ${r.samples.slice(0, 8).join(' | ')}`);
}

(RUN ? it : it.skip)('EEEE #76 decomposition', () => {
  const entry = boundary('s30');
  void (World);
  // 变体 A：现状（前置段 + Traps，镜像 WWW 槽 31 双步）
  {
    const st = buildBase(75, entry);
    restoreGenSolid(entry.gensolid);
    __setGenStateForProbe(structuredClone(entry.gs) as GenState);
    const rng = new RNG(SEED);
    runSurfaceDecorPass(st, rng, structuredClone(entry.gs) as GenState);
    const st2 = new TileStore(W, H);
    st2.type.set(st.type); st2.flags.set(st.flags); st2.wall.set(st.wall); st2.liquid.set(st.liquid);
    st2.liquidType.set(st.liquidType); st2.half.set(st.half); st2.slope.set(st.slope); st2.wire.set(st.wire);
    st2.frameX.set(st.frameX); st2.frameY.set(st.frameY);
    runTrapsPass(st2, new RNG(SEED), structuredClone(entry.gs) as GenState);
    printRow(diffStore('A 前置+Traps（=WWW 槽31 现状）', 76, st2));
    __setGenStateForProbe(null);
  }
  // 变体 B：仅 Traps（前置段退役后的形态）
  {
    const st = buildBase(75, entry);
    restoreGenSolid(entry.gensolid);
    __setGenStateForProbe(structuredClone(entry.gs) as GenState);
    runTrapsPass(st, new RNG(SEED), structuredClone(entry.gs) as GenState);
    printRow(diffStore('B 仅 Traps（前置退役）', 76, st));
    __setGenStateForProbe(null);
  }
  // 变体 C：仅前置段（前置段自身写入面）
  {
    const st = buildBase(75, entry);
    restoreGenSolid(entry.gensolid);
    __setGenStateForProbe(structuredClone(entry.gs) as GenState);
    runSurfaceDecorPass(st, new RNG(SEED), structuredClone(entry.gs) as GenState);
    printRow(diffStore('C 仅前置段', 76, st));
    __setGenStateForProbe(null);
  }
  void flipGenSolid;
}, 560_000);

// EEEE 批·区域转储：golden76 vs JS 重放在首个巨石差异点周边的格态。
// 用法：cd game && SW_EEEE3=1 npx vitest run tools/_eeeeregion.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { placeTrap } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_EEEE3 === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const X0 = Number(process.env.SW_X0 ?? 1908), Y0 = Number(process.env.SW_Y0 ?? 330);
const X1 = Number(process.env.SW_X1 ?? 1930), Y1 = Number(process.env.SW_Y1 ?? 365);

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
function chans(idx: number) {
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));
  return { t: b16('typ'), a: b8('act'), w: b16('wal'), hf: b8('half'), sl: b8('slope') };
}
function boundary(key: string) {
  const dir = `${BDIR}/${key}`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  return { gs, gensolid, fx, fy, wire, ids35 };
}
function buildBase(baseIdx: number, b: ReturnType<typeof boundary>): TileStore {
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
    st.half[i] = c.hf[i]!;
    st.slope[i] = c.sl[i]!;
    st.wire[i] = b.wire[i];
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i];
  }
  return st;
}
const label = (v: number | undefined): string => (v === undefined ? '?' : v === 0 ? '.' : String(v));
function dump(tag: string, get: (x: number, y: number) => { t?: number; a?: number; hf?: number; sl?: number; wal?: number }) {
  console.log(`\n== ${tag} x∈[${X0},${X1}] y∈[${Y0},${Y1}] (T=type h=half s=slope W=wall)`);
  for (let y = Y0; y <= Y1; y++) {
    let row = '';
    for (let x = X0; x <= X1; x++) {
      const c = get(x, y);
      if (!c.a) row += '..';
      else row += label(c.t).padStart(2).slice(0, 2);
    }
    console.log(`${String(y).padStart(4)} ${row}`);
  }
}

function dumpDiff(getG: (x: number, y: number) => { t?: number; a?: number }, st: TileStore) {
  console.log(`\n== diff cells golden76 vs JS, x∈[${X0},${X1}] y∈[${Y0},${Y1}]`);
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const gi = y * W + x;
      const ji = st.idx(x, y);
      const gt = g_a[gi] ? g_t[gi]! : 0;
      const jt = st.flags[ji] ? (SHEET[st.type[ji]!] ?? -1) : 0;
      if (gt !== jt || (g_a[gi] !== (st.flags[ji] ? 1 : 0))) {
        console.log(`  (${x},${y}) golden=${g_a[gi] ? gt : 'air'} js=${st.flags[ji] ? jt : 'air'} half=${st.half[ji]} slope=${st.slope[ji]}`);
      }
    }
  }
}
let g_a: Uint8Array, g_t: Uint16Array;

(RUN ? it : it.skip)('EEEE region dump', () => {
  const entry = boundary('s30');
  const gs: GenState = structuredClone(entry.gs);
  const st = buildBase(75, entry);
  restoreGenSolid(entry.gensolid);
  __setGenStateForProbe(gs);
  flipGenSolid([379], false);
  const rng = new RNG(SEED);
  const accepts: string[] = [];
  for (let n = 0; n < st.w * 0.05; n++) {
    for (let k = 0; k < 1150; k++) {
      let x = rng.int(200, st.w - 201);
      let y = rng.int(gs.worldSurface, st.h - 211);
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanTop && (x < gs.beachDistance || x > st.w - gs.beachDistance)) {
        x = rng.int(200, st.w - 201);
        y = rng.int(gs.worldSurface, st.h - 211);
      }
      if (st.wall[st.idx(x, y)] === 0 && placeTrap(st, rng, gs, x, y, -1)) { accepts.push(`${x},${y}`); break; }
    }
  }
  const g = chans(76);
  g_a = g.a; g_t = g.t;
  // 逐格精确打印 x∈[1912,1924] 两列对照
  // 找本站点附近的 plate(135)/dart(137)/巨石栅格线索
  for (let y = 335; y <= 400; y++) {
    for (let x = 1910; x <= 1926; x++) {
      const gi = y * W + x, ji = st.idx(x, y);
      const gt = g.a[gi] ? g.t[gi]! : -1;
      const jt = st.flags[ji] ? (SHEET[st.type[ji]!] ?? -1) : -1;
      if (gt === 135 || gt === 137 || jt === 135 || jt === 137) {
        console.log(`  plate/dart: (${x},${y}) golden=${gt} js=${jt}`);
      }
    }
  }
  for (let y = 330; y <= 380; y++) {
    let rowG = '', rowJ = '';
    for (let x = 1912; x <= 1924; x++) {
      const gi = y * W + x, ji = st.idx(x, y);
      rowG += `${g.a[gi] ? g.t[gi]! : '.'}`.padStart(4);
      rowJ += `${st.flags[ji] ? (SHEET[st.type[ji]!] ?? -1) : '.'}`.padStart(4);
    }
    if (rowG !== rowJ) console.log(`${String(y).padStart(4)} G:${rowG}   J:${rowJ}`);
  }
  dumpDiff((x, y) => ({ t: g.t[y * W + x], a: g.a[y * W + x] }), st);
  dump('golden76', (x, y) => {
    const i = y * W + x;
    return { t: g.t[i], a: g.a[i], hf: g.hf[i], sl: g.sl[i], wal: g.w[i] };
  });
  dump('JS(新 TrapsPass on golden75)', (x, y) => {
    const i = st.idx(x, y);
    return { t: SHEET[st.type[i]!] ?? -1, a: st.flags[i], hf: st.half[i], sl: st.slope[i], wal: st.wall[i] };
  });
  // JS 落在本窗口的接受点
  console.log(`\naccepts in window: ${accepts.filter(a => { const [ax, ay] = a.split(',').map(Number); return ax >= X0 - 2 && ax <= X1 + 2 && ay >= Y0 - 2 && ay <= Y1 + 8; }).join(' ')}`);
  console.log(`first 8 accepts overall: ${accepts.slice(0, 8).join(' ')}`);
  __setGenStateForProbe(null);
}, 560_000);

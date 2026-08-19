import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_WWW === 'rep';
const W = 4200, H = 1200, N = W * H, SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
import { readdirSync, existsSync } from 'node:fs';
for (const f of readdirSync('/tmp/sw-slp/g')) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `/tmp/sw-slp/g/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (e: string) => new Uint8Array(readFileSync(gPath(100, e)).buffer.slice(0));
const b16 = (e: string) => new Uint16Array(readFileSync(gPath(100, e)).buffer.slice(0));

(RUN ? it : it.skip)('trace frameY@512,222', async () => {
  const t = b16('typ'), a = b8('act'), wl = b16('wal'), l = b8('liq'), lt = b8('lty'), hf = b8('half'), sl = b8('slope'), ia = b8('inact');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    if (act || t[i]) st.type[i] = REV.get(t[i]!) ?? 0;
    st.wall[i] = wl[i]!; st.liquid[i] = l[i]!; st.liquidType[i] = l[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!; st.wire[i] = ia[i] ? 0x20 : 0;
  }
  // golden frames+wires injection
  const b = readFileSync('/tmp/tttt-fr/101_Micro_Biomes.fr');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cnt = dv.getUint32(0, true);
  for (let q = 0; q < cnt; q++) { const off = 4 + q * 8; st.frameX[dv.getUint32(off, true)] = dv.getUint16(off + 4, true); st.frameY[dv.getUint32(off, true)] = dv.getUint16(off + 6, true); }
  const gw = new Uint8Array(readFileSync('/tmp/tttt-frw/101_Micro_Biomes.wire').buffer.slice(0));
  for (let i = 0; i < N; i++) st.wire[i] = (st.wire[i]! & ~0x1f) | (gw[i]! & 0x1f);
  const gs = JSON.parse(readFileSync('/tmp/www-b/s52/gs.json', 'utf8')) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync('/tmp/www-b/s52/gensolid.json', 'utf8'))));
  __setGenStateForProbe(gs);
  const X = 512, Y = 222;
  const watch = st.idx(X, Y);
  let before = `act=${st.flags[watch]} type=${st.type[watch]} fx=${st.frameX[watch]} fy=${st.frameY[watch]}`;
  // patch frameY array write detection via periodic sampling: wrap pass with monkey-patched seg
  (globalThis as any).__swSeg = (n: string, d: any) => {
    const fy = st.frameY[watch], fx = st.frameX[watch], act = st.flags[watch];
    const cur = `act=${act} fx=${fx} fy=${fy}`;
    if ((globalThis as any).__last !== cur) { console.log(`XXXX [${n} ${JSON.stringify(d)}] ${cur}`); (globalThis as any).__last = cur; }
  };
  runMicroBiomesPass(st, new RNG(SEED), gs, JSON.parse(readFileSync('/tmp/www-b/s52/chests.json', 'utf8')));
  (globalThis as any).__swSeg = undefined;
  console.log(`XXXX entry: ${before}`);
  console.log(`XXXX exit: act=${st.flags[watch]} fx=${st.frameX[watch]} fy=${st.frameY[watch]}`);
  __setGenStateForProbe(null);
}, 560_000);

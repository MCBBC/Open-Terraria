// WWW #73 定位（SW_WWW73=1）：SpreadingGrass 干净基座重放 diff 格上下文。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { spreadingGrassPass } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_WWW73 === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

(RUN ? it : it.skip)('#73 cells', () => {
  const t = rd16(72, 'typ'), a = rd8(72, 'act'), w = rd16(72, 'wal'), l = rd8(72, 'liq'), lt = rd8(72, 'lty'), hf = rd8(72, 'half'), sl = rd8(72, 'slope');
  const dir = `${BDIR}/s27`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = a[i]!;
    let id = ids35.has(i) ? ids35.get(i)! : -1;
    if (id < 0 || SHEET[id] !== (t[i] ?? 0)) id = REV.get(t[i]!) ?? 0;
    st.type[i] = id;
    st.wall[i] = w[i]!; st.liquid[i] = l[i]!; st.liquidType[i] = l[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!; st.wire[i] = 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; }
  restoreGenSolid(gensolid);
  spreadingGrassPass(st, gs);
  const t73 = rd16(73, 'typ'), a73 = rd8(73, 'act');
  let n = 0;
  for (let i = 0; i < N && n < 12; i++) {
    const va = a73[i] ? t73[i] : 0;
    const ja = st.flags[i] ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (va !== ja) {
      const x = i % W, y = (i / W) | 0;
      const env: string[] = [];
      for (let dy = -1; dy <= 1; dy++) { let r = ''; for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * W + (x + dx); r += (a[j] ? t[j] : '.') + ' '; } env.push(r); }
      console.log(`(${x},${y}) g72=${a[i] ? t[i] : '.'} g73=${va} js=${ja} env=[${env.join(' | ')}]`);
      n++;
    }
  }
}, 200_000);

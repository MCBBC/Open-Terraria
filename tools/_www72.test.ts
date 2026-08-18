// WWW #72 定位（SW_WWW72=1）：地狱熔炉放置序 vs golden72 —— 找首个被 JS 误拒的 golden 熔炉。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runHellforgesPass } from '../src/world/gen/vanilla/HellforgesPass';

const RUN = process.env.SW_WWW72 === '1';
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

(RUN ? it : it.skip)('#72 forge order', () => {
  const t = rd16(71, 'typ'), a = rd8(71, 'act'), w = rd16(71, 'wal'), l = rd8(71, 'liq'), lt = rd8(71, 'lty'), hf = rd8(71, 'half'), sl = rd8(71, 'slope');
  const dir = `${BDIR}/s26`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${dir}/frames.bin`).buffer.slice(0));
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    let id = ids35.has(i) ? ids35.get(i)! : -1;
    if (id < 0 || SHEET[id] !== (t[i] ?? 0)) id = REV.get(t[i]!) ?? 0;
    st.type[i] = id;
    st.wall[i] = w[i]!; st.liquid[i] = l[i]!; st.liquidType[i] = l[i] ? lt[i]! + 1 : 0;
    st.half[i] = hf[i]!; st.slope[i] = sl[i]!; st.wire[i] = 0;
  }
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; }
  const FORGE = REV.get(77)!;
  const placed: string[] = [];
  const orig = st.setTileSilent.bind(st);
  (st as unknown as { setTileSilent: (...args: unknown[]) => unknown }).setTileSilent = (...args: unknown[]) => {
    const [x, y, tp] = args as [number, number, number];
    if (tp === FORGE && y !== undefined) placed.push(`${x},${y}`);
    return orig(...(args as []));
  };
  restoreGenSolid(gensolid);
  runHellforgesPass(st, new RNG(SEED));
  // golden72 熔炉左上角清单（行主序）
  const t72 = rd16(72, 'typ'), a72 = rd8(72, 'act');
  const gold: string[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (a72[i] && t72[i] === 77 && (!a72[i - 1] || t72[i - 1] !== 77) && (!a72[i - W] || t72[i - W] !== 77)) gold.push(`${x},${y}`);
  }
  console.log(`golden forges(${gold.length}): ${gold.join(' ')}`);
  const jsTop = placed.filter((_, q) => q % 6 === 0);
  // JS 放置的左上角：6 格序 = (x-1,y-1),(x,y-1),(x+1,y-1),(x-1,y),(x,y),(x+1,y)
  const jsTL: string[] = [];
  for (let q = 0; q < placed.length; q += 6) {
    const [fx, fy] = placed[q]!.split(',').map(Number);
    jsTL.push(`${fx},${fy}`);
  }
  console.log(`js forges(${jsTL.length}): ${jsTL.join(' ')}`);
  const gset = new Set(gold), jset = new Set(jsTL);
  console.log('golden-only:', gold.filter(p => !jset.has(p)).join(' '));
  console.log('js-only:', jsTL.filter(p => !gset.has(p)).join(' '));
  const firstDiff = jsTL.findIndex(p => !gset.has(p));
  console.log(`JS 序首个不在 golden 的: #${firstDiff} ${jsTL[firstDiff]}（其前 ${firstDiff > 0 ? jsTL[firstDiff - 1] : '·'} 都对）`);
}, 200_000);

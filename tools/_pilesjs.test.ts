// OOOO 批 #77：JS 侧 Piles 逐放置序列记录（与 x86 探针对拍）。
// 用法：SW_PJ=1 npx vitest run tools/_pilesjs.test.ts  （输出 /tmp/oooo-piles-js.txt）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';

const RUN = process.env.SW_PJ === '1';
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
import { readdirSync } from 'node:fs';
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;

(RUN ? it : it.skip)('JS piles seq', async () => {
  const b8 = (e: string) => new Uint8Array(readFileSync(gPath(76, e)).buffer.slice(0));
  const b16 = (e: string) => new Uint16Array(readFileSync(gPath(76, e)).buffer.slice(0));
  const c = { t: b16('typ'), a: b8('act'), w: b16('wal'), l: b8('liq'), hf: b8('half'), sl: b8('slope'), lt: b8('lty'), ia: b8('inact') };
  const gs = JSON.parse(readFileSync(`${BDIR}/s31/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s31/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s31/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s31/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
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
    st.wire[i] = (c.ia[i] ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(gs);
  const lines: string[] = [];
  let px = -1, py = -1;
  const logPrev = () => {
    if (px < 0) return;
    const i = st.idx(px, py);
    lines.push(`eff ${px} ${py} ${st.flags[i] ? String(SHEET[st.type[i]]) : '-'}`);
  };
  (globalThis as { __swPilesCap?: (x: number, y: number, t: number, s: number, z: number, k: number) => void }).__swPilesCap =
    (x, y, t, s, z, k) => {
      logPrev();
      px = k === 1 ? -1 : x; py = y;
      lines.push(k === 1 ? `small ${x} ${y} ${t} ${s} ${z}` : `3x2 ${x} ${y} ${t} ${s}`);
    };
  runPilesPass(st, new RNG(SEED), gs);
  __setGenStateForProbe(null);
  writeFileSync('/tmp/oooo-piles-js.txt', lines.join('\n') + '\n');
  console.log('js lines:', lines.length);
}, 120_000);

// PPPP 一次性探针：#76 双巨石站点 (2022..2024,581) 接受序互换定罪。
// s30 边界重放 runTrapsPass，钩 placeTrap type==1 巨石分支逐事件打印。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runTrapsPass, placeTrap } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_PPPP76 === '1';
const W = 4200, H = 1200, N = W * H, SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const G2 = '/tmp/sw-slp/g', BDIR = '/tmp/www-b/s30';
const NAME = 'Place_Fallen_Log'; // slot 75

(RUN ? it : it.skip)('trace boulder traps slot76', async () => {
  const rd = (idx: number, ext: string, nm: string) => ext === 'typ' || ext === 'wal'
    ? new Uint16Array(readFileSync(`${G2}/${String(idx).padStart(3, '0')}_${nm}.${ext}`).buffer.slice(0))
    : readFileSync(`${G2}/${String(idx).padStart(3, '0')}_${nm}.${ext}`);
  // golden 75→76 差分（vanilla 动作足迹，站点窗）
  const X0 = 2008, X1 = 2032, Y0 = 568, Y1 = 596;
  const c75 = { t: rd(75, 'typ', NAME), a: rd(75, 'act', NAME) };
  const c76 = { t: rd(76, 'typ', 'Traps'), a: rd(76, 'act', 'Traps') };
  const a76 = c76.a;
  console.log('--- golden 75→76 差分窗 (只列 typ/act 差) ---');
  for (let y = Y0; y <= Y1; y++) {
    let line = '';
    for (let x = X0; x <= X1; x++) {
      const i = x + y * W;
      const va = c75.a[i], vb = a76[i];
      const ta = va ? c75.t[i] : 0, tb = vb ? c76.t[i] : 0;
      if (va !== vb || ta !== tb) line += ` (${x},${y}) ${va ? 'T' + ta : '·'}→${vb ? 'T' + tb : '·'}`;
    }
    if (line) console.log(`y${y}:${line}`);
  }
  // 重放
  const gs = JSON.parse(readFileSync(`${BDIR}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
  const st = new TileStore(W, H);
  const t = rd(75, 'typ', NAME), a = rd(75, 'act', NAME), wl = rd(75, 'wal', NAME), lq = rd(75, 'liq', NAME), lt = rd(75, 'lty', NAME), hf = rd(75, 'half', NAME), sl = rd(75, 'slope', NAME), ia = rd(75, 'inact', NAME);
  for (let i = 0; i < N; i++) {
    st.flags[i] = a[i];
    st.type[i] = (a[i] || t[i]) ? (REV.get(t[i]) ?? 0) : 0;
    st.wall[i] = wl[i]; st.liquid[i] = lq[i]; st.liquidType[i] = lq[i] ? lt[i] + 1 : 0;
    st.half[i] = hf[i]; st.slope[i] = sl[i]; st.wire[i] = ia[i] ? 0x20 : 0;
  }
  const fw = new Uint32Array(readFileSync(`${BDIR}/frames.bin`).buffer.slice(0));
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; st.frameX[i] = fw[q + 1]!; st.frameY[i] = fw[q + 2]!; st.wire[i] |= fw[q + 3]! & 0x1f; }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  const origPlace = placeTrap;
  const log: string[] = [];
  (globalThis as { __sw76Trace?: (s: string) => void }).__sw76Trace = (s) => log.push(s);
  await runTrapsPass(st, new RNG(SEED), structuredClone(gs) as GenState);
  (globalThis as { __sw76Trace?: unknown }).__sw76Trace = undefined;
  __setGenStateForProbe(null);
  for (const l of log) if (/BOULDER|SITE/.test(l)) console.log(l);
}, 560_000);

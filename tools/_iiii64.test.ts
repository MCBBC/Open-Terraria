// IIII 批 #64 诊断③：真 pass + 逐 site 的 JS 墙写集 vs golden64 墙集对拍。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runGemCavesPass } from '../src/world/gen/vanilla/GemPasses';

const RUN = process.env.SW_IIII64 === '1';
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
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

interface Boundary { gs: GenState; gensolid: Map<number, boolean>; fx: Uint16Array; fy: Uint16Array; wire: Uint8Array; ids35: Map<number, number>; chests: unknown[] }
function boundary(key: string): Boundary {
  const dir = `${BDIR}/${key}`;
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

(RUN ? it : it.skip)('iiii64 probe', () => {
  const base = 63, out = 64;
  const t = b16(base, 'typ'), a = b8(base, 'act'), wl = b16(base, 'wal'), lq = b8(base, 'liq'), lt = b8(base, 'lty');
  const hf8 = b8(base, 'half'), sl8 = b8(base, 'slope');
  const w4 = b16(out, 'wal');
  const b = boundary('s18');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a[i]!;
    st.flags[i] = act;
    let id = 0;
    if (act || t[i]) {
      const sh = t[i]!;
      id = b.ids35.has(i) ? b.ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? 0;
    }
    st.type[i] = id;
    st.wall[i] = wl[i]!;
    st.liquid[i] = lq[i]!;
    st.liquidType[i] = lq[i] ? lt[i]! + 1 : 0;
    st.frameX[i] = b.fx[i]; st.frameY[i] = b.fy[i];
    st.half[i] = hf8[i]!; st.slope[i] = sl8[i]!;
    st.wire[i] |= b.wire[i];
  }
  restoreGenSolid(b.gensolid);
  __setGenStateForProbe(structuredClone(b.gs) as GenState);
  // site 边界钩子：每 site 首 candidate 快照 → 上一 site 的墙写集
  let snap = st.wall.slice();
  let curSite = -1;
  const siteWalls = new Map<number, number[]>();      // site → JS 墙写格
  const siteSeeds = new Map<number, [number, number]>();
  const lastCand = new Map<number, [number, number, number, number, number, number, number]>();
  const g0 = globalThis as Record<string, unknown>;
  g0.__swGcCap = (site: number, _sx: number, _sy: number, tries: number, x: number, y: number, air: number, lava: number, ice: number, rock: number) => {
    if (site !== curSite) {
      // 新 site 开始：结算上一 site 的墙写
      const writes: number[] = [];
      for (let i = 0; i < N; i++) if (st.wall[i] !== snap[i]) writes.push(i);
      if (curSite >= 0) siteWalls.set(curSite, writes);
      snap = st.wall.slice();
      curSite = site;
    }
    lastCand.set(site, [x, y, air, lava, ice, rock, tries]);
    void _sx; void _sy;
  };
  runGemCavesPass(st, new RNG(SEED), structuredClone(b.gs) as GenState);
  delete g0.__swGcCap;
  __setGenStateForProbe(null);
  { const writes: number[] = []; for (let i = 0; i < N; i++) if (st.wall[i] !== snap[i]) writes.push(i); siteWalls.set(curSite, writes); }
  for (const [s, writes] of [...siteWalls.entries()].sort((p, q) => p[0] - q[0])) {
    const c = lastCand.get(s)!;
    const accepted = c[2] >= 50 && c[2] < 300 && c[3] === 0 && c[4] === 0 && c[5] > 0;
    if (!accepted) { console.log(`site#${s} seed=(${c[0]},${c[1]}) REJECTED(no writes expected) writes=${writes.length}`); continue; }
    let miss = 0, hit = 0, valOk = 0;
    const misses: string[] = [];
    for (const i of writes) {
      const wv = w4[i]!;
      if (wv >= 48 && wv <= 53) { hit++; if (wv === st.wall[i]) valOk++; }
      else { miss++; if (misses.length < 5) misses.push(`(${i % W},${(i / W) | 0}) v=${wv}`); }
    }
    console.log(`site#${s} seed=(${c[0]},${c[1]}) a${c[2]} writes=${writes.length} inGolden=${hit} valOk=${valOk} miss=${miss} ${misses.length ? misses.join(' ') : ''}`);
    // site#0 起点证伪后：对 site#1 的 JS 拒绝候选逐个做整腔对拍（腔=从候选洪泛的
    // wall==0 非实心连通域；vanilla 若接受该候选,整腔应全部 48-53）
    if (s === 1) {
      // 重放 site#0+1 的候选流（从 trace 里无从取,直接重跑选点环——流必须复刻）
      // 简化：用当前已建 store 上手动洪泛每个候选,不消费 RNG（只做腔对拍）
      const floodCheck = (cx: number, cy: number): { cells: number[]; capped: boolean } => {
        const seenL = new Set<number>();
        const cellsL: number[] = [];
        const st2: Array<[number, number]> = [[cx, cy]];
        let capped = false;
        while (st2.length) {
          const [x, y] = st2.pop()!;
          if (x <= 1 || x >= W - 1 || y <= 1 || y >= H - 1) { capped = true; continue; }
          const ii = y * W + x;
          if (seenL.has(ii)) continue;
          seenL.add(ii);
          if (wl[ii] === 244 || wl[ii] !== 0) { capped = true; continue; }
          const d = TILE_DEFS[st.type[ii]];
          const solid = !!a[ii] && !!d?.solid && !d?.platform && st.half[ii] === 0 && st.slope[ii] === 0;
          if (solid) continue;
          cellsL.push(ii);
          if (cellsL.length > 2000) { capped = true; break; }
          st2.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        }
        return { cells: cellsL, capped };
      };
      for (const [cx, cy] of [[2668, 645], [359, 837], [690, 938], [3716, 699], [1765, 823]] as Array<[number, number]>) {
        const f = floodCheck(cx, cy);
        let van = 0;
        for (const i of f.cells) { const wv = w4[i]!; if (wv >= 48 && wv <= 53) van++; }
        console.log(`  s1cand (${cx},${cy}) cavity=${f.cells.length} capped=${f.capped} vanWalled=${van}`);
      }
    }
  }
}, 560_000);

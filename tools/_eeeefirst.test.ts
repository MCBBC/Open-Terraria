// EEEE 批·首发散定位：JS 接受序列 vs golden 陷阱集合，找第一个 JS 接受在 golden 无对应。
// 用法：cd game && SW_EEEE_DBG=1 SW_EEEE4=1 npx vitest run tools/_eeeefirst.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runTrapsPass, eeeeLog } from '../src/world/gen/vanilla/TrapsPass';

const RUN = process.env.SW_EEEE4 === '1';
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
const rd8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const rd16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

(RUN ? it : it.skip)('EEEE first divergence', () => {
  const gs = JSON.parse(readFileSync(`${BDIR}/s30/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s30/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s30/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s30/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);

  const t75 = rd16(gPath(75, 'typ')), a75 = rd8(gPath(75, 'act'));
  const w75 = rd16(gPath(75, 'wal')), l75 = rd8(gPath(75, 'liq')), lt75 = rd8(gPath(75, 'lty'));
  const hf75 = rd8(gPath(75, 'half')), sl75 = rd8(gPath(75, 'slope'));
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = a75[i]!;
    st.flags[i] = act;
    if (act || t75[i]) {
      const sh = t75[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      if (id < 0) id = 0;
      st.type[i] = id;
    } else st.type[i] = 0;
    st.wall[i] = w75[i]!;
    st.liquid[i] = l75[i]!;
    st.liquidType[i] = l75[i] ? lt75[i]! + 1 : 0;
    st.half[i] = hf75[i]!;
    st.slope[i] = sl75[i]!;
    st.wire[i] = wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  __setGenStateForProbe(structuredClone(gs));
  runTrapsPass(st, new RNG(SEED), structuredClone(gs));
  __setGenStateForProbe(null);

  // golden76 的新增陷阱集合（75→76）
  const t76 = rd16(gPath(76, 'typ')), a76 = rd8(gPath(76, 'act'));
  const newPlates = new Set<number>(), newDarts = new Set<number>(), newGeysers = new Set<number>(), newExpl = new Set<number>();
  const newBoulderAnchor = new Set<number>();
  const isB = (t: number) => t === 138 || t === 664 || (t >= 711 && t <= 716);
  for (let i = 0; i < N; i++) {
    if (!a76[i]) continue;
    const t = t76[i]!;
    if (a75[i] && t75[i] === t) continue;   // 已存在
    if (t === 135) newPlates.add(i);
    else if (t === 137) newDarts.add(i);
    else if (t === 443) newGeysers.add(i);
    else if (t === 141) newExpl.add(i);
    else if (isB(t) && !(a76[i - 1] && isB(t76[i - 1]!)) && !(a76[i - W] && isB(t76[i - W]!))) newBoulderAnchor.add(i);
  }
  console.log(`golden new: plates=${newPlates.size} darts=${newDarts.size} geysers=${newGeysers.size} expl=${newExpl.size} boulderAnchors=${newBoulderAnchor.size}`);
  console.log(`JS eeeeLog: ${eeeeLog.length}  kinds: ${[...new Set(eeeeLog.map(e => e.k))].join(',')}`);
  // 逐 JS 接受对账：plate@ (x2,py)；dart@(ax,ay)；boulder@(ax+1,ay+1)；geyser@(x2,py)；explt@(ax,ay)
  let firstMiss = -1;
  const missList: string[] = [];
  for (let q = 0; q < eeeeLog.length; q++) {
    const e = eeeeLog[q]!;
    let ok = false;
    if (e.k === 0) {
      ok = newPlates.has(e.py! * W + e.x2!) && newDarts.has(e.ay! * W + e.ax!);
    } else if (e.k === 1) {
      ok = newPlates.has(e.py! * W + e.x2!) && newBoulderAnchor.has((e.ay! + 1) * W + (e.ax! + 1));
    } else if (e.k === 2) {
      ok = newPlates.has(e.py! * W + e.x2!) && newExpl.has(e.ay! * W + e.ax!);
    } else if (e.k === 3) {
      ok = newGeysers.has(e.py! * W + e.x2!);
    } else if (e.k === 4) {
      ok = newPlates.has(e.py! * W + e.x2!);
    }
    if (!ok) {
      if (firstMiss < 0) firstMiss = q;
      if (missList.length < 30) missList.push(`#${q} k${e.k} x2=${e.x2} py=${e.py} ax=${e.ax} ay=${e.ay}`);
    }
  }
  console.log(`first miss at log index: ${firstMiss} / ${eeeeLog.length}`);
  console.log(`misses:\n  ${missList.join('\n  ')}`);
  // 前后文
  if (firstMiss > 0) {
    console.log('context around first miss:');
    for (let q = Math.max(0, firstMiss - 6); q < Math.min(eeeeLog.length, firstMiss + 8); q++) {
      const e = eeeeLog[q]!;
      console.log(`  ${q === firstMiss ? '>>' : '  '} #${q} k${e.k} x2=${e.x2} py=${e.py} ax=${e.ax} ay=${e.ay} b=${e.b ?? ''}`);
    }
  }
}, 560_000);

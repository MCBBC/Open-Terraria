// XXXXX 批·12345 #87 首分歧定位 v3（正确时序）。用毕即删。
// 用法：cd game && SW_XX=1 npx vitest run tools/_xxxx6.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runDyePlantsPass, runGrassPlantsPass, runGlowingMushroomPlantsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runWebsInSpiderCavesPass } from '../src/world/gen/vanilla/HiveSpiderPass';

const RUN = process.env.SW_XX === '1';
const G2 = '/tmp/sw-slp/g12345';
const BASE = '/tmp/ss-b/vv12345';
const W = 4200, H = 1200, N = W * H;
const SEED = 12345;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const b16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));

function loadBase(): { st: TileStore; gs: GenState } {
  const st = new TileStore(W, H);
  st.type = new Uint16Array(readFileSync(`${BASE}/type.bin`).buffer.slice(0));
  st.flags = b8(`${BASE}/flags.bin`);
  st.wall = new Uint16Array(readFileSync(`${BASE}/wall.bin`).buffer.slice(0));
  st.liquid = b8(`${BASE}/liquid.bin`);
  st.liquidType = b8(`${BASE}/liquidType.bin`);
  st.half = b8(`${BASE}/half.bin`);
  st.slope = b8(`${BASE}/slope.bin`);
  st.frameX = b16(`${BASE}/frameX.bin`);
  st.frameY = b16(`${BASE}/frameY.bin`);
  st.wire = b8(`${BASE}/wire.bin`);
  st.paint = b8(`${BASE}/paint.bin`);
  const gs = JSON.parse(readFileSync(`${BASE}/gs.json`, 'utf8')) as GenState;
  return { st, gs };
}

function wrapRng(rng: RNG, log: Array<{ bound: number; val: number }>): RNG {
  const rngAny = rng as unknown as Record<string, unknown>;
  for (const m of ['nextInt', 'int', 'next', 'nextDouble', 'nextIntRange', 'chance', 'range']) {
    if (typeof rngAny[m] !== 'function') continue;
    const orig = (rngAny[m] as (...a: never[]) => number).bind(rng);
    rngAny[m] = (...a: never[]) => {
      const r = orig(...a);
      const bound = a.length >= 2 ? (a[1] as number) - (a[0] as number) + 1 : (a[0] as number);
      log.push({ bound, val: r });
      return r;
    };
  }
  return rng;
}

(RUN ? it : it.skip)('12345 #87 first-divergence hunt', async () => {
  const gensolid = new Map(JSON.parse(readFileSync(`${BASE}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const { st, gs } = loadBase();
  restoreGenSolid(gensolid);
  runDyePlantsPass(st, new RNG(SEED), gs);
  runWebsInSpiderCavesPass(st, new RNG(SEED), gs);
  runGrassPlantsPass(st, new RNG(SEED));
  const rollLog: Array<{ bound: number; val: number }> = [];
  runGlowingMushroomPlantsPass(st, wrapRng(new RNG(SEED), rollLog), gs);

  const g87t = b16(gPath(87, 'typ')), g87a = b8(gPath(87, 'act'));
  const baseT = new Uint16Array(readFileSync(`${BASE}/type.bin`).buffer.slice(0));
  const baseF = b8(`${BASE}/flags.bin`);
  type Row = { x: number; y: number; gold: number; js: number };
  const rows: Row[] = [];
  for (let x = 5; x < W - 5; x++) {
    for (let y = 5; y < H - 5; y++) {
      const i = y * W + x;
      if (y + 1 >= H) continue;
      const bi = i + W;
      if (!(baseF[bi]! & 1)) continue;
      const belowSheet = SHEET[baseT[bi]!];
      if (belowSheet !== 60 && belowSheet !== 226) continue;
      if (baseF[i]! & 1) continue;
      const gold = g87a[i]! ? g87t[i]! : 0;
      const js = st.flags[i]! & 1 ? SHEET[st.type[i]!]! : 0;
      if ((gold === 61 || gold === 69 || gold === 28) && (js === 61 || js === 69 || js === 28 || js === 0)) {
        rows.push({ x, y, gold, js });
      }
    }
  }
  console.log(`candidates: ${rows.length}, rolls: ${rollLog.length}`);
  const idxM = rows.findIndex(r => r.gold !== r.js);
  console.log(`first mismatch #${idxM}: ${rows[idxM] ? `(${rows[idxM]!.x},${rows[idxM]!.y}) gold=${rows[idxM]!.gold} js=${rows[idxM]!.js}` : 'none'}`);
  const sporeSeq: number[] = [];
  for (let q = 0; q < rollLog.length && sporeSeq.length < rows.length; q++) {
    if (rollLog[q]!.bound === 16) sporeSeq.push(q);
  }
  console.log(`bound16 count=${sporeSeq.length}`);
  // 28 罐差格坐标 + (388,372) 现场
  const pots: string[] = [];
  for (let i = 0; i < N; i++) {
    const vt = g87a[i]! ? g87t[i]! : 0;
    const jt = st.flags[i]! & 1 ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt === 0 && jt === 28) pots.push(`(${i % W},${(i / W) | 0}) base=${baseF[i]! & 1 ? SHEET[baseT[i]!] : 'ghost' + SHEET[baseT[i]!]} f=${st.frameX[i]},${st.frameY[i]}`);
  }
  console.log(`JS-pot-only cells: ${pots.join(' | ')}`);
  // 罐 2×2 第四格 + 列 385-389 的 70/226/60 事件格清单（y 5..730）
  for (let dy = 1; dy >= -4; dy--) {
    const i = (682 + dy) * W + 386;
    console.log(`  (386,${682 + dy}) base=${baseF[i]! & 1 ? 'a1t' + SHEET[baseT[i]!] : 'a0t' + SHEET[baseT[i]!]} f=${st.frameX[i]},${st.frameY[i]} gold=${g87a[i]! ? 'a' + g87t[i]! : 'dead'} js=${st.flags[i]! & 1 ? 'a' + SHEET[st.type[i]!] : 'dead'}`);
  }
  const events: string[] = [];
  for (let x = 385; x <= 389; x++) {
    for (let y = 5; y < 730; y++) {
      const i = y * W + x;
      if (!(baseF[i]! & 1)) continue;
      const sh = SHEET[baseT[i]!];
      if (sh === 70 || sh === 226 || sh === 60) {
        const above = i - W;
        if (!(baseF[above]! & 1)) events.push(`(${x},${y}) t${sh} above-free gold87=${g87a[above]! ? 'a' + g87t[above]! : 'dead'} js=${st.flags[above]! & 1 ? 'a' + SHEET[st.type[above]!] : 'dead'}`);
      }
    }
  }
  console.log(`col385-389 grass/mushroom/226 events (y<730): ${events.length}`);
  for (const e of events.slice(0, 40)) console.log(`  ${e}`);
  for (const [cx, cy] of [[388, 372], [388, 407], [387, 722]] as Array<[number, number]>) {
    console.log(`--- (${cx},${cy}) 现场 ---`);
    for (let dy = 2; dy >= -2; dy--) {
      const i = (cy + dy) * W + cx;
      console.log(`  (${cx},${cy + dy}) base=${baseF[i]! & 1 ? 'a1t' + SHEET[baseT[i]!] : 'a0t' + SHEET[baseT[i]!]} gold87=${g87a[i]! ? 'a' + g87t[i]! : 'dead'} js=${st.flags[i]! & 1 ? 'a' + SHEET[st.type[i]!] : 'dead'} f=${st.frameX[i]},${st.frameY[i]} l=${st.liquid[i]}`);
    }
  }
  const win = 6;
  for (let k = Math.max(0, idxM - win); k < Math.min(rows.length, idxM + win + 1); k++) {
    const r = rows[k]!;
    const q = sporeSeq[k] ?? -1;
    const lo = (sporeSeq[k - 1] ?? -1) + 1, hi = q;
    const between = rollLog.slice(lo, hi).map(e => `${e.bound}:${e.val}`).join(' ');
    console.log(`  #${k} (${r.x},${r.y}) sporeVal=${q >= 0 ? rollLog[q]!.val : '?'} gold=${r.gold} js=${r.js}${r.gold !== r.js ? ' ✗' : ''} | between=[${between}]`);
  }
}, 300_000);

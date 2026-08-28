// IIII26 一次性:deadmans/thinice 逐调用预算镜像
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import * as MBDBG from '../src/world/gen/vanilla/MicroBiomesPass';
import { runMicroBiomesPass, __resetBudgetLog } from '../src/world/gen/vanilla/MicroBiomesPass';

const W = 4200, H = 1200, N = W * H;
const VG = '/tmp/iii7-out/x86-dump2';
const REV_OF = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV_OF.has(s)) REV_OF.set(s, i);
}
{
  const dirtKey = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  if (!REV_OF.has(1)) REV_OF.set(1, dirtKey);
}
function buildTruthBase(): TileStore {
  const t = new Uint16Array(readFileSync(`${VG}/096_Larva.typ`).buffer.slice(0));
  const a = new Uint8Array(readFileSync(`${VG}/096_Larva.act`));
  const w = new Uint16Array(readFileSync(`${VG}/096_Larva.wal`).buffer.slice(0));
  const l = new Uint8Array(readFileSync(`${VG}/096_Larva.liq`));
  const lty = new Uint8Array(readFileSync(`${VG}/096_Larva.lty`));
  const half = new Uint8Array(readFileSync(`${VG}/096_Larva.half`));
  const slope = new Uint8Array(readFileSync(`${VG}/096_Larva.slope`));
  const wireD = new Uint8Array(readFileSync(`${VG}/096_Larva.wire`));
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const ts = t[i];
    st.type[i] = ts === 0 ? 0 : (REV_OF.get(ts) ?? 0);
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i];
    st.liquid[i] = l[i];
    st.liquidType[i] = l[i] > 0 ? lty[i] + 1 : 0;
    st.half[i] = half[i]; st.slope[i] = slope[i]; st.wire[i] = wireD[i];
  }
  const frx = new Uint16Array(readFileSync(`${VG}/096_Larva.frx`).buffer.slice(0));
  const fry = new Uint16Array(readFileSync(`${VG}/096_Larva.fry`).buffer.slice(0));
  st.frameX.set(frx);
  st.frameY.set(fry);
  return st;
}
(it as never as ((n: string, f: () => void) => void))('III26 budget mirror', () => {
  const st = buildTruthBase();
  let chestSink: unknown;
  try { chestSink = JSON.parse(readFileSync('/tmp/iii7-out/x86-entry-chests.json', 'utf8')); }
  catch { chestSink = JSON.parse(readFileSync('/tmp/iii7-out/cap-chests.json', 'utf8')); }
  const rngObj = new RNG(12345) as RNG & { ur: { internalSample: () => number } };
  const orig = rngObj.ur.internalSample.bind(rngObj.ur);
  let n = 0;
  rngObj.ur.internalSample = () => { n++; return orig(); };
  (globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws = () => n;

  const segsSeen: string[] = [];
  (globalThis as unknown as { __swSeg?: (nm: string) => void }).__swSeg = (nm) => { if (segsSeen.length < 12 || nm.startsWith('iceCount')) segsSeen.push(nm); };
  __resetBudgetLog();
  runMicroBiomesPass(st, rngObj, GS_STUB(), chestSink as never);
  console.log('totalDraws=', n, 'segments seen:', JSON.stringify(segsSeen.slice(0,12)));
  const recs = (MBDBG as { __readBudgetLog?: () => Array<{site:string;seq:number;a:number;b:number}> }).__readBudgetLog?.() ?? [];
  writeFileSync('/tmp/iii26-out/js-budget.txt', recs.map(r => `${r.seq}\t${r.site}\t${r.a}\t${r.b - r.a}`).join('\n') + '\n');
  console.log(`budget records=${recs.length}`);
  (globalThis as unknown as { __swMbDraws?: unknown }).__swMbDraws = undefined;
});
function GS_STUB(): import('../src/world/gen/vanilla/GenState').GenState {
  let rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  try {
    rects = readFileSync('/tmp/iii7-out/structs-at-entry.txt', 'utf8').trim().split('\n').map((l) => {
      const [X, Y, W2, H2] = l.split(',').map(Number); return { x0: X, y0: Y, x1: X + W2, y1: Y + H2 };
    });
  } catch {}
  return {
    seed: 12345, worldSurface: 331, worldSurfaceHigh: 0, worldSurfaceLow: 0,
    rockLevel: 427, rockLevelHigh: 427, rockLevelLow: 340, lavaLine: 898,
    beachDistance: 380, waterLine: 831, genWorldSurface: 267, genRockLayer: 396.458,
    protectedRects: rects, oreTiers: { copper: 26, iron: 27, silver: 28, gold: 7 }, seedFlags: {},
  } as unknown as import('../src/world/gen/vanilla/GenState').GenState;
}

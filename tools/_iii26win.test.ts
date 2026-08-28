// IIII26 一次性:JS 侧 Micro_Biomes 掷流窗口镜像(x86 SW_ROLLWIN=97-97 同口径)
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { __setKillLaneProbe, __setKillLaneRollIdx } from '../src/world/gen/vanilla/TrackPass';

const OUT = '/tmp/iii26-out';
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
const rd = (nm: string, e: string): Buffer => readFileSync(`${VG}/${nm}.${e}`);

function buildTruthBase(): TileStore {
  const t = new Uint16Array(rd('096_Larva', 'typ').buffer.slice(0));
  const a = new Uint8Array(rd('096_Larva', 'act'));
  const w = new Uint16Array(rd('096_Larva', 'wal').buffer.slice(0));
  const l = new Uint8Array(rd('096_Larva', 'liq'));
  const lty = new Uint8Array(rd('096_Larva', 'lty'));
  const half = new Uint8Array(rd('096_Larva', 'half'));
  const slope = new Uint8Array(rd('096_Larva', 'slope'));
  const wireD = new Uint8Array(rd('096_Larva', 'wire'));
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const ts = t[i];
    st.type[i] = ts === 0 ? 0 : (REV_OF.get(ts) ?? 0);
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i];
    st.liquid[i] = l[i];
    st.liquidType[i] = l[i] > 0 ? lty[i] + 1 : 0;
    st.half[i] = half[i];
    st.slope[i] = slope[i];
    st.wire[i] = wireD[i];
  }
  const frx = new Uint16Array(readFileSync(`${VG}/096_Larva.frx`).buffer.slice(0));
  const fry = new Uint16Array(readFileSync(`${VG}/096_Larva.fry`).buffer.slice(0));
  st.frameX.set(frx);
  st.frameY.set(fry);
  return st;
}

function loadChestSink(): Array<{ x: number; y: number; items?: Array<{ id: number; stack: number } | null> }> {
  try {
    return JSON.parse(readFileSync('/tmp/iii7-out/x86-entry-chests.json', 'utf8'));
  } catch {
    return JSON.parse(readFileSync('/tmp/iii7-out/cap-chests.json', 'utf8'));
  }
}

(it as never as ((n: string, f: () => void) => void))('III26 window mirror', () => {
  mkdirSync(OUT, { recursive: true });
  const st = buildTruthBase();
  const chestSink = loadChestSink();
  const seed = 12345;
  const rngObj = new RNG(seed) as RNG & { ur: { internalSample: () => number } };

  // x86 OnRoll 同位织入(internalSample 级,value=原始样本)
  const win: number[] = [];
  const g = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void };
  let armed = false;
  g.__swOnRoll = (v) => { if (armed) win.push(v); };

  const kills: string[] = [];
  __setKillLaneRollIdx(() => win.length);
  __setKillLaneProbe((c) => {
    if (!armed) return;
    kills.push(`K ${win.length} ${c.x} ${c.y} ${c.act ? c.sheet : -1} ${c.fx} ${c.fy}`);
  });

  armed = true;
  runMicroBiomesPass(st, rngObj, GS_STUB(), chestSink as never);
  armed = false;

  writeFileSync(`${OUT}/js-win.txt`, win.join('\n') + '\n');
  writeFileSync(`${OUT}/js-kill.txt`, kills.join('\n') + '\n');
  console.log(`III26 js window rolls=${win.length} killAnchors=${kills.length}`);

  g.__swOnRoll = undefined;
  __setKillLaneProbe(undefined);
  __setKillLaneRollIdx(undefined);
});

function GS_STUB(): import('../src/world/gen/vanilla/GenState').GenState {
  let rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  try {
    const lines = readFileSync('/tmp/iii7-out/structs-at-entry.txt', 'utf8').trim().split('\n');
    rects = lines.map((l) => {
      const [X, Y, W2, H2] = l.split(',').map((v) => Number(v));
      return { x0: X, y0: Y, x1: X + W2, y1: Y + H2 };
    });
  } catch { /* none */ }
  return {
    seed: 12345,
    worldSurface: 331, worldSurfaceHigh: 0, worldSurfaceLow: 0,
    rockLevel: 427, rockLevelHigh: 427, rockLevelLow: 340,
    lavaLine: 898,
    beachDistance: 380, waterLine: 831,
    genWorldSurface: 267, genRockLayer: 396.458,
    protectedRects: rects,
    oreTiers: { copper: 26, iron: 27, silver: 28, gold: 7 },
    seedFlags: {},
  } as unknown as import('../src/world/gen/vanilla/GenState').GenState;
}

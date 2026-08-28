// IIIII12 批主探针:x86 真值基座(dump096)→ 单跑 Micro_Biomes → 段账对拍
//   ★纪律:只比「段 rc 总账 / 每尝试 rc+受理集 / 相位计数」,禁值流对拍(vacuous 二证)。
// 用法:cd game && SW_I12=1 npx vitest run tools/_iii12fix.test.ts
//   SW_I12_TRACE=1 写 /tmp/iii12-out/{jseg.txt,jtape.txt}
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { __setTrackStepProbe } from '../src/world/gen/vanilla/TrackPass';

const RUN = process.env.SW_I12 === '1';
const OUT = '/tmp/iii12-out';
const W = 4200, H = 1200, N = W * H;
const VG = '/tmp/iii7-out/x86-dump2';   // 复用上一批 x86 权威 dump（基座只读）

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

interface ChestRow { slot?: number; x: number; y: number; items?: Array<{ id: number; stack: number } | null> }
function loadChestSink(): ChestRow[] {
  // 与 IIII7 收口态同源:wld 终态箱序（src=wld 的产物快照已固化为 json）
  try {
    return JSON.parse(readFileSync('/tmp/iii7-out/x86-entry-chests.json', 'utf8')) as ChestRow[];
  } catch {
    return JSON.parse(readFileSync('/tmp/iii7-out/cap-chests.json', 'utf8')) as ChestRow[];
  }
}

(RUN ? it : it.skip)('III12 truth-base isolation loop', () => {
  mkdirSync(OUT, { recursive: true });
  const st = buildTruthBase();
  const chestSink = loadChestSink();

  const seed = 12345;
  const rngObj = new RNG(seed) as RNG & { ur: { internalSample: () => number } };
  const origSample = rngObj.ur.internalSample.bind(rngObj.ur);
  let nDraws = 0;
  rngObj.ur.internalSample = () => { nDraws++; return origSample(); };
  (globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws = () => nDraws;

  interface Mark { c: number; n: string; d?: unknown }
  const segMarks: Mark[] = [];
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n, d) => segMarks.push({ c: nDraws, n, d });

  const trkSteps: number[][] = [];
  __setTrackStepProbe((loop, i, x, y, ph) => trkSteps.push([nDraws, loop, i, x, y, ph]));
  runMicroBiomesPass(st, rngObj, GS_STUB(), chestSink as never);
  __setTrackStepProbe(undefined);
  if (process.env.SW_I12_TRACE) {
    writeFileSync(`${OUT}/jtrk.txt`, trkSteps.map((r) => r.join('\t')).join('\n') + '\n');
  }

  (globalThis as unknown as { __swSeg?: unknown }).__swSeg = undefined;
  (globalThis as unknown as { __swMbDraws?: unknown }).__swMbDraws = undefined;

  const firstAt = (label: string): number | undefined => segMarks.find((m) => m.n === label)?.c;
  const iceCount = firstAt('iceCount') ?? -1;
  const swordAtt = firstAt('swordAttempts') ?? -1;
  const campCnt = firstAt('campCount') ?? -1;
  const trapCnt = firstAt('trapCount') ?? -1;
  const treeCnt = firstAt('treeCount') ?? -1;
  const longCnt = firstAt('longTrackCount') ?? -1;
  console.log(`TOTAL=${nDraws} (x86 1473066 Δ=${nDraws - 1473066})`);
  console.log(`deadmans=${iceCount}    target=276     Δ=${iceCount - 276}`);
  console.log(`thinIce=${swordAtt - iceCount}   target=63525   Δ=${swordAtt - iceCount - 63525}`);
  console.log(`sword=${campCnt - swordAtt}      target=3        Δ=${campCnt - swordAtt - 3}`);
  console.log(`camp+mine=${trapCnt - campCnt} target=61602    Δ=${trapCnt - campCnt - 61602}`);
  console.log(`treesection=${longCnt - treeCnt} target=45857   Δ=${longCnt - treeCnt - 45857}`);
  console.log(`tracks+lava=${nDraws - longCnt} target=1301803 Δ=${nDraws - longCnt - 1301803}`);

  if (process.env.SW_I12_TRACE) {
    writeFileSync(`${OUT}/jseg.txt`, segMarks.map((m) =>
      `${m.c}\t${m.n}${m.d !== undefined ? `\t${JSON.stringify(m.d)}` : ''}`).join('\n') + '\n');
    console.log(`seg written lines=${segMarks.length}`);
  }
}, 480000);

/** gs 存根(与 _iii7fix 同值:管线捕获实况) */
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

// IIIII7 批修复主探针:x86 真值基座(096_Larva 无损转换)→ 单跑 Micro_Biomes
//   → 七段预算对拍 + 十通道对拍 dump097。附基座回环自检(转换无损断言)。
// 用法:cd game && SW_I7FIX=1 npx vitest run tools/_iii7fix.test.ts [-t 个别]
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { __setTrackStepProbe } from '../src/world/gen/vanilla/TrackPass';

const RUN = process.env.SW_I7FIX === '1';
const OUT = '/tmp/iii7-out';
const W = 4200, H = 1200, N = W * H;
const VG = '/tmp/iii7-out/x86-dump2';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const rd = (nm: string, e: string): Buffer => readFileSync(`${VG}/${nm}.${e}`);

const REV_OF = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV_OF.has(s)) REV_OF.set(s, i);
}
{
  const dirtKey = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
  if (!REV_OF.has(1)) REV_OF.set(1, dirtKey);
}

/** dump096 → store(内部 id 空间):全通道逐格无条件写入 */
function buildTruthBase(): { st: TileStore; gseedRef: number } {
  const t = new Uint16Array(rd('096_Larva', 'typ').buffer.slice(0));
  const a = new Uint8Array(rd('096_Larva', 'act'));
  const w = new Uint16Array(rd('096_Larva', 'wal').buffer.slice(0));
  const l = new Uint8Array(rd('096_Larva', 'liq'));
  const lty = new Uint8Array(rd('096_Larva', 'lty'));
  const half = new Uint8Array(rd('096_Larva', 'half'));
  const slope = new Uint8Array(rd('096_Larva', 'slope'));
  const inact = new Uint8Array(rd('096_Larva', 'inact'));
  const st = new TileStore(W, H);
  let unmapped = 0;
  const unmappedSheets = new Map<number, number>();
  const wireD = new Uint8Array(rd('096_Larva', 'wire'));
  for (let i = 0; i < N; i++) {
    const ts = t[i];
    if (ts !== 0 && !REV_OF.has(ts)) {
      unmapped++;
      unmappedSheets.set(ts, (unmappedSheets.get(ts) ?? 0) + 1);
      continue;
    }
    st.type[i] = ts === 0 ? 0 : (REV_OF.get(ts) ?? 0);
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i];
    st.liquid[i] = l[i];
    st.liquidType[i] = l[i] > 0 ? lty[i] + 1 : 0;
    st.half[i] = half[i];
    st.slope[i] = slope[i];
    st.wire[i] = wireD[i];
  }
  if (unmapped > 0) console.log(`[warn] un-mapped sheet cells=${unmapped}`, JSON.stringify([...unmappedSheets].slice(0, 20)));
  return { st, gseedRef: 0 };
}
let wireRef: Uint8Array | null = null;
function wireRt(_i: number): number { return 0; }
function buildFrames(st: TileStore): void {
  const frx = new Uint16Array(readFileSync(`${VG}/096_Larva.frx`).buffer.slice(0));
  const fry = new Uint16Array(readFileSync(`${VG}/096_Larva.fry`).buffer.slice(0));
  st.frameX.set(frx);
  st.frameY.set(fry);
}

/** 基座回环自检:store→sheet 快照逐通道比对 */
function roundtripCheck(st: TileStore): void {
  const t = new Uint16Array(rd('096_Larva', 'typ').buffer.slice(0));
  const a = new Uint8Array(rd('096_Larva', 'act'));
  const w = new Uint16Array(rd('096_Larva', 'wal').buffer.slice(0));
  const l = new Uint8Array(rd('096_Larva', 'liq'));
  const lty = new Uint8Array(rd('096_Larva', 'lty'));
  const half = new Uint8Array(rd('096_Larva', 'half'));
  const slope = new Uint8Array(rd('096_Larva', 'slope'));
  const wireRef2 = new Uint8Array(rd('096_Larva', 'wire'));
  const frx = new Uint16Array(readFileSync(`${VG}/096_Larva.frx`).buffer.slice(0));
  const fry = new Uint16Array(readFileSync(`${VG}/096_Larva.fry`).buffer.slice(0));
  const kinds: Record<string, number> = {};
  const add = (k: string): void => { kinds[k] = (kinds[k] ?? 0) + 1; };
  for (let i = 0; i < N; i++) {
    const ts = t[i];
    if (ts !== 0 && !REV_OF.has(ts)) { add('unmap'); continue; }
    const jT = st.type[i] !== 0 ? (SHEET[st.type[i]] ?? -1) : 0;
    if (jT !== ts && !(ts === 0 && jT <= 0)) add('ty');
    if ((st.flags[i] !== 0) !== (a[i] !== 0)) add('ac');
    if (st.wall[i] !== w[i]) add('wa');
    if (st.liquid[i] !== l[i]) add('li');
    if (l[i] > 0 && st.liquidType[i] !== lty[i] + 1) add('lt');
    if (st.half[i] !== half[i]) add('hf');
    if (st.slope[i] !== slope[i]) add('sl');
    if (st.wire[i] !== wireRef2[i]) add('wr');
    if (st.frameX[i] !== frx[i]) add('fx');
    if (st.frameY[i] !== fry[i]) add('fy');
  }
  console.log('roundtrip:', JSON.stringify(kinds));
}

const SRC = process.env.SW_I7SRC ?? 'wld';

interface ChestRow { slot?: number; x: number; y: number; items?: Array<{ id: number; stack: number } | null> }
async function loadChestSink(): Promise<Array<{ x: number; y: number; items?: Array<{ id: number; stack: number } | null> }>> {
  if (SRC === 'rig2') {
    const raw = JSON.parse(readFileSync('/tmp/iii7-out/x86-entry-chests.json', 'utf8')) as ChestRow[];
    return raw;
  }
  if (SRC === 'none') return [];
  if (SRC === 'pipe') {
    try {
      const raw = JSON.parse(readFileSync('/tmp/iii7-out/cap-chests.json', 'utf8')) as Array<{ x: number; y: number; items?: Array<{ id: number; stack: number } | null> }>;
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  // SRC='wld':rig 终态存档(Main.chest 槽序=创建序;entry 态新增仅 Mahogany 尾部)
  const { parseWld } = await import('../src/wld/WldParser') as unknown as { parseWld(b: Uint8Array): { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> } };
  const buf = readFileSync('/tmp/iii3-out/x86-mb12345/w.wld');
  const wld = parseWld(new Uint8Array(buf));
  return wld.chests.map((c) => ({ x: c.x, y: c.y, items: c.items }));
}

(RUN ? it : it.skip)('III7 truth-base isolation fix loop', async () => {
  const { st } = buildTruthBase();
  buildFrames(st);
  roundtripCheck(st);
  const chestSink = await loadChestSink();
  console.log(`chestSink=${chestSink.length} src=${SRC}`);

  const seed = 12345;
  const rngObj = new RNG(seed) as RNG & { ur: { internalSample: () => number } };
  const origSample = rngObj.ur.internalSample.bind(rngObj.ur);
  let nDraws = 0;
  const tape: number[] = [];
  rngObj.ur.internalSample = () => { nDraws++; const v = origSample(); tape.push(v); return v; };
  const segMarks: Array<[string, number]> = [];
  const stepEvents: Array<[number, number, number, number]> = [];
  (globalThis as { __swSeg?: (n: string) => void }).__swSeg = (n) => segMarks.push([n, nDraws]);
  __setTrackStepProbe((p, i, x, y) => stepEvents.push([nDraws, p, x, y]));

  // ChestSink:候选相关内容以 store 真值为准,items 由真实管线包不起作用的部分置空
  runMicroBiomesPass(st, rngObj, GS_STUB(), chestSink as never);

  __setTrackStepProbe(undefined);
  (globalThis as { __swSeg?: unknown }).__swSeg = undefined;

  const firstAt = (label: string): number | undefined => segMarks.find(([n2]) => n2 === label)?.[1];
  const iceCount = firstAt('iceCount') ?? -1;
  const swordAtt = firstAt('swordAttempts') ?? -1;
  const campCnt = firstAt('campCount') ?? -1;
  const trapCnt = firstAt('trapCount') ?? -1;
  const treeCnt = firstAt('treeCount') ?? -1;
  const longCnt = firstAt('longTrackCount') ?? -1;
  const stdCnt = firstAt('stdTrackCount') ?? -1;
  const lavaJ = firstAt('lavaJ') ?? -1;
  console.log(`TOTAL=${nDraws} (x86 1473066 Δ=${nDraws - 1473066})`);
  console.log(`deadmans=${iceCount}         target=276     Δ=${iceCount - 276}`);
  console.log(`thinIce=${swordAtt - iceCount}      target=63525   Δ=${swordAtt - iceCount - 63525}`);
  console.log(`sword=${campCnt - swordAtt}       target=3        Δ=${campCnt - swordAtt - 3}`);
  console.log(`camp+mine=${trapCnt - campCnt}  target=61602(combind) `);
  console.log(`treesection=${longCnt - treeCnt}   target=45857   Δ=${longCnt - treeCnt - 45857}`);
  console.log(`tracks+lava=${nDraws - longCnt} target=1301803 Δ=${nDraws - longCnt - 1301803}`);
  console.log(`bounds: std=${stdCnt} lavaJ=${lavaJ}`);
  const agg: Record<string, number> = {};
  for (const [n2] of segMarks) agg[n2] = (agg[n2] ?? 0) + 1;
  console.log('marks:', JSON.stringify(Object.fromEntries(Object.entries(agg))));
  if (process.env.SW_I7_TRACE) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${OUT}/fix-tape.txt`, tape.join('\n') + '\n');
    writeFileSync(`${OUT}/fix-seg.txt`, segMarks.map(([n2, c]) => `${c}\t${n2}`).join('\n') + '\n');
    console.log(`tape written len=${tape.length}`);
  }
}, 480000);

/** gs 存根:MB pass 可从真值基座独立运行所需的最小字段(值=管线捕获实况) */
function GS_STUB(): import('../src/world/gen/vanilla/GenState').GenState {
  // 保护矩形:x86 入口态(捕获于管线 __swMbCap 时点)——与 GenVars.structures 同构近似
  let rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  try {
    // x86 权威:rig SW_STRUCTDUMP 在 Larva 槽末转储 GenVars.structures(_protectedStructures)
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

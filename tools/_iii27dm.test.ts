// IIII27 批一次性探针:12345 链 deadmans 段逐 attempt 掷账对拍(x86 SW_DMLOG 同格式)
//   用法:cd game && SW_I27=1 npx vitest run tools/_iii27dm.test.ts
//   输出:/tmp/iii27-out/j27-events.txt(全事件:rc 序) + /tmp/iii27-out/j27-place.txt
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { runMicroBiomesPass, DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';

const RUN = process.env.SW_I27 === '1';
const OUT = '/tmp/iii27-out';
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

interface ChestRow { slot?: number; x: number; y: number; items?: Array<{ id: number; stack: number } | null> }
function loadChestSink(): ChestRow[] {
  try {
    return JSON.parse(readFileSync('/tmp/iii7-out/x86-entry-chests.json', 'utf8')) as ChestRow[];
  } catch {
    return JSON.parse(readFileSync('/tmp/iii7-out/cap-chests.json', 'utf8')) as ChestRow[];
  }
}

(RUN ? it : it.skip)('III27 deadmans per-attempt ledger', () => {
  mkdirSync(OUT, { recursive: true });
  const st = buildTruthBase();
  const chestSink = loadChestSink();

  const seed = 12345;
  const rngObj = new RNG(seed) as RNG & { ur: { internalSample: () => number } };
  const origSample = rngObj.ur.internalSample.bind(rngObj.ur);
  let nDraws = 0;
  const drawStacks: string[] = [];
  const drawVals: string[] = [];
  rngObj.ur.internalSample = () => {
    nDraws++;
    if (nDraws <= 340) {
      const s = new Error().stack ?? '';
      const fr = s.split('\n').map((l) => l.trim()).filter((l) => l.includes('game/src'))
        .slice(0, 6).map((l) => l.replace(/^at /, '').replace(/.*vanilla\//, 'van:').replace(/\/Users[^)]*$/, ''));
      drawStacks.push(`${nDraws}\t${fr.join(' < ')}`);
    }
    return origSample();
  };
  {
    // 记录前 340 个样本值(与 x86 win 流同源对拍用)
    let cnt = 0;
    const inner = origSample;
    // 包装采样值:利用 ur.sample 内部不可见,改从 nextIntRange 上层取太绕——直接再包一层 sample:
    // RNG.ur.internalSample 已被替换为上方闭包;此处在其外套一层记录返回值。
    const cur = rngObj.ur.internalSample.bind(rngObj.ur);
    (rngObj.ur as unknown as { internalSample: () => number }).internalSample = () => {
      const v = cur();
      cnt++;
      if (cnt <= 340) drawVals.push(`${cnt}\t${v.toPrecision(17)}`);
      return v;
    };
  }
  void drawStacks;
  try {
    (globalThis as unknown as { __swDrawStacks?: string[] }).__swDrawStacks = drawStacks;
  } catch { /* probe */ }
  (globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws = () => nDraws;

  interface Mark { c: number; n: string; d?: unknown }
  const segMarks: Mark[] = [];
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n, d) => segMarks.push({ c: nDraws, n, d });

  // ---- 方法级 rc 织入(零源码改动):DeadMansChestBiome 原型包装 ----
  const events: string[] = [];
  const P = DeadMansChestBiome.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const wrapWithArgs = (name: string, argfmt?: (...a: unknown[]) => string): void => {
    const orig = P[name];
    if (typeof orig !== 'function') throw new Error(`no method ${name}`);
    P[name] = function (this: unknown, ...a: unknown[]) {
      const d0 = nDraws;
      try { events.push(`ENTER ${name}${argfmt ? ' ' + argfmt(...a) : ''} @${d0}`); } catch { /* probe */ }
      const r = orig.apply(this, a);
      const d1 = nDraws;
      events.push(`EXIT ${name} rc=${d1 - d0} @${d1}`);
      return r;
    };
  };
  wrapWithArgs('place', (x, y) => `${x},${y}`);
  wrapWithArgs('getPossibleChests');
  wrapWithArgs('isAGoodSpot', (x, y) => `${x},${y}`);
  wrapWithArgs('areThereEnoughTraps');
  wrapWithArgs('findBoulderTrapSpots', (x, y) => `${x},${y}`);
  wrapWithArgs('findBoulderTrapSpot');
  wrapWithArgs('placeBoulderTrapSpot', (x, y, p) => `${x},${y} push=${p}`);
  wrapWithArgs('findDartTrapSpots', (x, y) => `${x},${y}`);
  wrapWithArgs('findDartTrapSpotSingle', (_x, y, dir) => `y=${y} dir=${dir}`);
  wrapWithArgs('findExplosiveTrapSpots', (x, y) => `${x},${y}`);
  wrapWithArgs('turnGoldChestIntoDeadMansChest', (x, y) => `${x},${y}`);
  wrapWithArgs('actuallyPlaceDartTrap');
  wrapWithArgs('actuallyPlaceBoulderTrap');
  wrapWithArgs('actuallyPlaceExplosive');
  wrapWithArgs('placeWiresForExplosives', (x, y) => `${x},${y}`);
  wrapWithArgs('placeWireLine');

  runMicroBiomesPass(st, rngObj, GS_STUB(), chestSink as never);

  (globalThis as unknown as { __swSeg?: unknown }).__swSeg = undefined;

  writeFileSync(`${OUT}/j27-events.txt`, events.join('\n') + '\n');
  const stacksOut = (globalThis as unknown as { __swDrawStacks?: string[] }).__swDrawStacks ?? [];
  writeFileSync(`${OUT}/j27-stacks.txt`, stacksOut.join('\n') + '\n');
  writeFileSync(`${OUT}/j27-vals.txt`, drawVals.join('\n') + '\n');
  // seg marks → 与 iii12fix 同视图
  writeFileSync(`${OUT}/j27-seg.txt`, segMarks.map((m) =>
    `${m.c}\t${m.n}${m.d !== undefined ? `\t${JSON.stringify(m.d)}` : ''}`).join('\n') + '\n');
  const firstAt = (label: string): number | undefined => segMarks.find((m) => m.n === label)?.c;
  const iceCount = firstAt('iceCount') ?? -1;
  console.log(`TOTAL=${nDraws} (x86 1473066 Δ=${nDraws - 1473066})`);
  console.log(`deadmans(=draws at iceCount marker)=${iceCount}   x86-DM-end=276 ⇒ aligned-marker=277`);
}, 480000);

/** gs 存根(与 _iii12fix 同值:管线捕获实况) */
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

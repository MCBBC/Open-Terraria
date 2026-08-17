// 一次性：s111 #29 Corruption 隔离重放（/tmp/sw-tgt111{,b} x86 dump 输入直构 → pass → 对拍）。
//   p28(Underworld 末,四通道+half/slope/lty 全零差) → runCorruptionPass → p29(Corruption 末)
//   原版掷数 N=5,423,171（passchain d5a25251 反解,tools 同法）；JS 管线段 4,793,335。
// gs 捕获：真管线 seed=111 经 __swCorGsCap 探针钩深克隆（管线可能在尾段抛错,忽略）。
// 用法：SW_COR29=1 npx vitest run tools/_cor29iso.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_COR29;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200;
const D1 = process.env.SW_COR29_DIR ?? '/tmp/sw-tgt111';
const D2 = process.env.SW_COR29_DIR2 ?? '/tmp/sw-tgt111b';
const VAN_N = Number(process.env.SW_COR29_N ?? 5423171);

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function loadP(dir: string, p: string, ext: string): Uint8Array {
  return readFileSync(`${dir}/${p}.${ext}`);
}

function buildStore(dir: string, p: string): TileStore {
  const t = new Uint16Array(loadP(dir, p, 'typ').buffer.slice(0));
  const a = loadP(dir, p, 'act');
  const w = new Uint16Array(loadP(dir, p, 'wal').buffer.slice(0));
  const l = loadP(dir, p, 'liq');
  const lty = loadP(dir, p, 'lty');
  const half = loadP(dir, p, 'half');
  const slope = loadP(dir, p, 'slope');
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;   // 幽灵 type 照抄（dump typ 含 inactive ghost）
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? lty[i]! + 1 : 0;
    st.half[i] = half[i]!;
    st.slope[i] = slope[i]!;
  }
  return st;
}

function diff(st: TileStore, dir: string, p: string, label: string) {
  const t = new Uint16Array(loadP(dir, p, 'typ').buffer.slice(0));
  const a = loadP(dir, p, 'act');
  const w = new Uint16Array(loadP(dir, p, 'wal').buffer.slice(0));
  const l = loadP(dir, p, 'liq');
  let typ = 0, act = 0, wal = 0, liq = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  const regs = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    if (dT) { typ++; pairs.set(`t${jT}>${t[i]}`, (pairs.get(`t${jT}>${t[i]}`) ?? 0) + 1); }
    if (dA) { act++; pairs.set(`a${st.flags[i] ? 1 : 0}>${a[i]}`, (pairs.get(`a${st.flags[i] ? 1 : 0}>${a[i]}`) ?? 0) + 1); }
    if (dW) { wal++; pairs.set(`W${st.wall[i]}>${w[i]}`, (pairs.get(`W${st.wall[i]}>${w[i]}`) ?? 0) + 1); }
    if (dL) liq++;
    const x = i % W, y = (i / W) | 0;
    const rk = `x${(x / 200) | 0}y${(y / 200) | 0}`;
    regs.set(rk, (regs.get(rk) ?? 0) + 1);
    if (samples.length < 10) samples.push(`(${x},${y})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}W${st.wall[i]}>${w[i]}L${st.liquid[i]}>${l[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p2, q) => q[1] - p2[1]).slice(0, 14)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p2, q) => q[1] - p2[1]).slice(0, 8)));
  console.log('  samples:', samples.join(' | '));
  return { typ, act, wal, liq };
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

let gsCor: GenState | null = null;

(RUN ? it : it.skip)('s111 #29 Corruption isolated replay', async () => {
  const g0 = globalThis as { __swCorGsCap?: (gs: GenState) => void; __swCorMark?: (s: string) => void };
  g0.__swCorGsCap = (gs) => { if (!gsCor) gsCor = cloneGs(gs); };
  const marks: Array<[string, number]> = [];
  try {
    await generateWorld({ size: 0, width: W, height: H, seedText: '111', evil: 0, onWorldPartial: () => { } } as Parameters<typeof generateWorld>[0]);
  } catch (e) {
    console.log('pipeline EX(忽略):', String(e).slice(0, 160));
  } finally {
    g0.__swCorGsCap = undefined;
  }
  if (!gsCor) throw new Error('gs capture failed');
  console.log('gsCor: dgLoc=', gsCor.dungeonLocation, 'dgSide=', gsCor.dungeonSide, 'crimson=', gsCor.crimson,
    'ud=', JSON.stringify(gsCor.undergroundDesert), 'beach=', gsCor.beachDistance, 'ws=', gsCor.worldSurface, 'rock=', gsCor.rockLevel);

  const st = buildStore(D1, 'p28');
  const { rng, box } = countedRng(gsCor.seed);
  g0.__swCorMark = (s) => { marks.push([s, box.n]); };
  try {
    runCorruptionPass(st, rng, gsCor);
  } finally {
    g0.__swCorMark = undefined;
  }
  console.log(`draws=${box.n} (vanilla ${VAN_N}, diff=${box.n - VAN_N})`);
  console.log('marks:', marks.map(([s, n]) => `${s}@${n}`).join(' '));
  // 球(31)/坛(26) 锚点提取（topleft）：与 p29 对照定位首分叉裂隙
  {
    const SHEET2 = SHEET;
    const orbs: string[] = [], altars: string[] = [];
    for (let y = 200; y < 700; y++) {
      for (let x = 2350; x < 2900; x++) {
        const i = y * W + x;
        if (!st.flags[i]) continue;
        const s = SHEET2[st.type[i]];
        if (s === 31) {
          const iL = i - 1, iU = i - W;
          if (!((st.flags[iL] && SHEET2[st.type[iL]] === 31) || (st.flags[iU] && SHEET2[st.type[iU]] === 31))) orbs.push(`(${x},${y})`);
        } else if (s === 26) {
          const iL = i - 1, iU = i - W;
          if (!((st.flags[iL] && SHEET2[st.type[iL]] === 26) || (st.flags[iU] && SHEET2[st.type[iU]] === 26))) altars.push(`(${x},${y})`);
        }
      }
    }
    console.log(`JS orbs(${orbs.length}):`, orbs.join(' '));
    console.log(`JS altars(${altars.length}):`, altars.join(' '));
  }
  diff(st, D2, 'p29', 'ISOLATED vs p29');
}, 480000);

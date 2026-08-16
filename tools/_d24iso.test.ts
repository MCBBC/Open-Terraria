// 一次性：#21/22/24/25 隔离重放掷骰计数 vs 原版定标 N（passchain FNV 暴力定标结果）。
// dump 输入直构 → pass → 计数 + 对拍 dump 输出（首差异定位用）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';
import { runMarblePass, runGranitePass } from '../src/world/gen/vanilla/MarbleGranitePass';
import { runFloatingIslandsPass } from '../src/world/gen/vanilla/StructuresPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const VG = process.env.SW_VG ?? '/tmp/sw-num4/van_x86_g';
const SEEDTXT = process.env.SW_SEED ?? '9293480';
const VN = { '9293480': { mar: 248340, gra: 781137, d2m: 775854, silt: 463409 }, '8888': { mar: 129825, gra: 37550, d2m: 772961, silt: -1 } };
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const NAMES: Record<number, string> = { 20: 'Mushroom_Patches', 21: 'Marble', 22: 'Granite', 23: 'Floating_Islands', 24: 'Dirt_To_Mud', 25: 'Silt' };

function buildStore(idx: number) {
  const t = new Uint16Array(load(idx, 'typ', NAMES[idx]!).buffer.slice(0));
  const a = load(idx, 'act', NAMES[idx]!);
  const w = new Uint16Array(load(idx, 'wal', NAMES[idx]!).buffer.slice(0));
  const l = load(idx, 'liq', NAMES[idx]!);
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]) ?? 0;   // 幽灵 type 照抄（dump typ 含 inactive ghost）
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i];
    st.liquid[i] = l[i];
    st.liquidType[i] = 0;
  }
  return st;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function diff(st: TileStore, idx: number, label: string, maxSamples = 6) {
  const t = new Uint16Array(load(idx, 'typ', NAMES[idx]!).buffer.slice(0));
  const a = load(idx, 'act', NAMES[idx]!);
  const w = new Uint16Array(load(idx, 'wal', NAMES[idx]!).buffer.slice(0));
  const l = load(idx, 'liq', NAMES[idx]!);
  let typ = 0, act = 0, wal = 0, liq = 0;
  const samples: string[] = [];
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) { const s = SHEET[jT] ?? -1; jT = s; }   // 幽灵 type 同比（rig 同法）
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    if (dT) typ++; if (dA) act++; if (dW) wal++; if (dL) liq++;
    if (samples.length < maxSamples) samples.push(`(${i % W},${(i / W) | 0})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}w${st.wall[i]}>${w[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq} | ${samples.join(' ')}`);
  return { typ, act, wal, liq };
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const box = { n: 0 };
  const wrap = (k: 'int' | 'next' | 'nextIntRange') => {
    const orig = (rng[k] as (...a: number[]) => number).bind(rng);
    (rng[k] as unknown as (...a: number[]) => number) = (...a: number[]) => { box.n++; (rng as unknown as { __n?: number }).__n = box.n; return orig(...a); };
  };
  wrap('int'); wrap('next'); wrap('nextIntRange');
  return { rng, box };
}

(RUN ? it : it.skip)('isolated replay draw counts + diffs', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  const gs = rt.gs;

  // #24 DirtToMud：输入 dump023，输出 dump024。原版 N=775854
  {
    const st = buildStore(23);
    const { rng, box } = countedRng(gs.seed);
    runDirtToMudPass(st, rng, gs);
    console.log(`DirtToMud draws=${box.n} (vanilla ${VN[SEEDTXT]!.d2m}, diff=${box.n - VN[SEEDTXT]!.d2m})`);
    diff(st, 24, 'DirtToMud vs dump024');
  }
  // #25 Silt：输入 dump024，输出 dump025。原版 N=463409
  {
    const st = buildStore(24);
    const { rng, box } = countedRng(gs.seed);
    runSiltPass(st, rng, gs);
    console.log(`Silt draws=${box.n} (vanilla ${VN[SEEDTXT]!.silt}, diff=${box.n - VN[SEEDTXT]!.silt})`);
    diff(st, 25, 'Silt vs dump025');
  }
  // #23 Islands：输入 dump022，输出 dump023。原版 N=40352
  {
    const st = buildStore(22);
    const { rng, box } = countedRng(gs.seed);
    runFloatingIslandsPass(st, rng, gs);
    console.log(`Islands draws=${box.n} (vanilla 40352, diff=${box.n - 40352})`);
  }
  // #21 Marble：输入 dump020，输出 dump021。原版 N=248340
  {
    const st = buildStore(20);
    const { rng, box } = countedRng(gs.seed);
    const ptOrig = (st as unknown as { __pt?: number });
    (globalThis as { __ptWrap?: boolean }).__ptWrap = true;
    const g0 = globalThis as { __ptC?: number; __ptOK?: number; __pt165?: number }; g0.__ptC = 0; g0.__ptOK = 0; g0.__pt165 = 0;
    runMarblePass(st, rng, gs);
    console.log(`PTstat fired=${g0.__ptC} ok=${g0.__ptOK} placed165=${g0.__pt165}`);
    console.log(`PT=${(globalThis as { __ptC?: number }).__ptC} Marble draws=${box.n} (vanilla ${VN[SEEDTXT]!.mar}, diff=${box.n - VN[SEEDTXT]!.mar})`);
    diff(st, 21, 'Marble vs dump021');
    // biome2 census: JS 新 165 在 (990..1230, 850..1060)
    {
      const t0 = new Uint16Array(load(20, 'typ', NAMES[20]!).buffer.slice(0));
      let js = 0; const cells: string[] = [];
      for (let y = 850; y < 1060; y++) for (let x = 990; x < 1230; x++) {
        const i = y * W + x;
        if (st.flags[i] && (SHEET[st.type[i]] ?? -1) === 165 && t0[i] !== 165) { js++; if (cells.length < 50) cells.push(`(${x},${y})`); }
      }
      console.log(`biome2 census: JS new stalactites=${js} (vanilla 42) ${cells.join(' ')}`);
      // JS marble blob 统计（同 bbox）
      {
        let mar = 0, sx = 0, sy = 0;
        for (let y = 850; y < 1060; y++) for (let x = 990; x < 1230; x++) {
          const i = y * W + x;
          if (st.flags[i] && (SHEET[st.type[i]] ?? -1) === 367) { mar++; sx += x; sy += y; }
        }
        console.log(`biome2 JS marble blob: n=${mar} c=(${Math.round(sx / Math.max(1, mar))},${Math.round(sy / Math.max(1, mar))})`);
      // biome1 bbox diff（480..600 x 790..880）
      {
        const t21 = new Uint16Array(load(21, 'typ', NAMES[21]!).buffer.slice(0));
        const a21 = load(21, 'act', NAMES[21]!);
        let n1 = 0;
        for (let y = 780; y < 890 && n1 < 12; y++) for (let x = 470; x < 610 && n1 < 12; x++) {
          const i = y * W + x;
          const jT = SHEET[st.type[i]] ?? 0;
          if ((st.flags[i] !== 0) !== (a21[i] !== 0) || jT !== t21[i]!) {
            console.log(`b1diff(${x},${y}) js t${jT}a${st.flags[i] ? 1 : 0}w${st.wall[i]} / van t${t21[i]}a${a21[i]}w${((t21[i], 0), 0) === 0 ? '' : ''}${''}`);
            void 0; n1++;
          }
        }
        const pair = new Map<string, number>();
        for (let y = 780; y < 890; y++) for (let x = 470; x < 610; x++) {
          const i = y * W + x;
          const jT = SHEET[st.type[i]] ?? 0;
          if ((st.flags[i] !== 0) !== (a21[i] !== 0) || jT !== t21[i]!) {
            const k = `t${jT}a${st.flags[i] ? 1 : 0}>t${t21[i]}a${a21[i]}`;
            pair.set(k, (pair.get(k) ?? 0) + 1);
          }
        }
        const cellsB1: string[] = [];
        for (let y = 780; y < 890; y++) for (let x = 470; x < 610; x++) {
          const i = y * W + x;
          const jT = SHEET[st.type[i]] ?? 0;
          if ((st.flags[i] !== 0) !== (a21[i] !== 0) || jT !== t21[i]!) cellsB1.push(`(${x},${y}) js t${jT}a${st.flags[i] ? 1 : 0}h${st.half[i]}s${st.slope[i]} / van t${t21[i]}a${a21[i]}`);
        }
        console.log('b1cells:', cellsB1.join(' | '));
        console.log('b1diff pairs:', JSON.stringify([...pair.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 10)));
        console.log(`b1diff total shown=${n1}`);
      }
      // first diff in biome2 bbox（行主序前 20 个）
      {
        const t21 = new Uint16Array(load(21, 'typ', NAMES[21]!).buffer.slice(0));
        const a21 = load(21, 'act', NAMES[21]!);
        let shown = 0;
        for (let y = 850; y < 1060 && shown < 20; y++) for (let x = 990; x < 1230 && shown < 20; x++) {
          const i = y * W + x;
          const jT = SHEET[st.type[i]] ?? 0;
          const vT = t21[i]!;
          if ((st.flags[i] !== 0) !== (a21[i] !== 0) || jT !== vT) {
            console.log(`firstDiff(${x},${y}) js t${jT}a${st.flags[i] ? 1 : 0} / van t${vT}a${a21[i]}`);
            shown++;
          }
        }
      }
      }
    }
  }
  // #22 Granite：输入 dump021，输出 dump022。原版 N=781137
  {
    const st = buildStore(21);
    const { rng, box } = countedRng(gs.seed);
    runGranitePass(st, rng, gs);
    const gCells = ((globalThis as { __gCells?: number }).__gCells ?? -1);
    (globalThis as { __gCells?: number }).__gCells = 0;
    console.log(`Granite draws=${box.n} (vanilla ${VN[SEEDTXT]!.gra}, diff=${box.n - VN[SEEDTXT]!.gra}) sweptCells=${gCells}`);
    diff(st, 22, 'Granite vs dump022');
  }
}, 480000);

(RUN ? it : it.skip)('sanity: store reconstruction + rng wrap', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: SEEDTXT, evil: 0 });
  const gs = rt.gs;
  console.log('gs.seed=', gs.seed, 'rockLevelLow=', gs.rockLevelLow, 'rockLevelHigh=', gs.rockLevelHigh);
  const st = buildStore(23);
  const t = new Uint16Array(load(23, 'typ', NAMES[23]!).buffer.slice(0));
  const a = load(23, 'act', NAMES[23]!);
  let actMis = 0, firstMis = -1;
  for (let i = 0; i < W * H; i++) {
    if ((st.flags[i] !== 0) !== (a[i] !== 0)) { actMis++; if (firstMis < 0) firstMis = i; }
  }
  console.log('buildStore(23) vs dump023 act差=', actMis, 'first=', firstMis,
    firstMis >= 0 ? `(${firstMis % W},${(firstMis / W) | 0}) jsFlag=${st.flags[firstMis]} vanAct=${a[firstMis]}` : '');
  const { rng, box } = countedRng(9293480);
  const v1 = rng.int(0, 4199);
  console.log('wrap test: rng.int(0,4199)=', v1, 'draws=', box.n);
  void t; void gs;
}, 120000);

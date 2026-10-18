// 一次性：half/slope 通道首分叉猎杀（2026-08-17 U 批）。
// 链路：s31(管线 half/slope@31,#19/21/22 清洁区写入,dump018-031 四通道全等背书)
//  → 清零规则桥接 dump031→052（x86 自己的 PlaceTile/KillTile 写清 half/slope）
//  → #53 SmoothWorld 重放(dump052+重构通道+GenSolid@52 时点) 掷数对拍 passchain
//    col6 + 四通道对拍 dump053 = 忠实性证明 → #54 Waterfalls 重放 → 清零规则 55→66
//  → #67 Cave_Walls 重放注入 → 残余塌缩验证。
// 变体 A(管线 half/slope@52 直用) 对照 —— Dungeon 污染格上的混合不一致性。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmoothWorldPass, runWaterfallLipPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { runCaveWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const DNAME: Record<number, string> = {
  31: 'Slush', 32: 'Dungeon', 33: 'Mountain_Caves', 34: 'Beaches', 35: 'Gems',
  36: 'Gravitating_Sand', 37: 'Create_Ocean_Caves', 38: 'Shimmer', 39: 'Clean_Up_Dirt',
  40: 'Pyramids', 41: 'Dirt_Rock_Wall_Runner', 42: 'Living_Trees', 43: 'Wood_Tree_Walls',
  44: 'Altars', 45: 'Wet_Jungle', 46: 'Jungle_Temple', 47: 'Hives', 48: 'Jungle_Chests',
  49: 'Settle_Liquids', 50: 'Remove_Water_From_Sand', 51: 'Oasis', 52: 'Shell_Piles',
  53: 'Smooth_World', 54: 'Waterfalls', 55: 'Ice', 56: 'Wall_Variety', 57: 'Life_Crystals',
  58: 'Statues', 59: 'Buried_Chests', 60: 'Surface_Chests', 61: 'Jungle_Chests_Placement',
  62: 'Water_Chests', 63: 'Spider_Caves', 64: 'Gem_Caves', 65: 'Moss', 66: 'Temple',
  67: 'Cave_Walls',
};
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${DNAME[idx]}.${ext}`);
const loadT = (idx: number) => new Uint16Array(load(idx, 'typ').buffer.slice(0));
const loadA = (idx: number) => load(idx, 'act');

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
SHEET[0] = 0;

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}
function streamHashOf(ur: UnifiedRandom): string {
  const sac = (ur as unknown as { seedArray: Int32Array; inext: number });
  let h = 0x811c9dc5;
  const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
  for (let i = 0; i < sac.seedArray.length; i++) {
    const v = sac.seedArray[i] | 0;
    for (let b = 0; b < 4; b++) step(v >>> (8 * b));
  }
  const ix = sac.inext >>> 0;
  for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
  return h.toString(16).padStart(8, '0');
}
function calibrateN(seed: number, want: string, hi = 9_000_000): number {
  const ur = new UnifiedRandom(seed);
  for (let n = 0; n <= hi; n++) {
    if (streamHashOf(ur) === want) return n;
    (ur as unknown as { internalSample: () => number }).internalSample();
  }
  return -1;
}
function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

function buildStore(idx: number, half?: Uint8Array, slope?: Uint8Array, liqType?: Uint8Array): TileStore {
  const t = loadT(idx), a = loadA(idx);
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = liqType ? liqType[i] : (l[i]! > 0 ? 1 : 0);
    if (half) { st.half[i] = half[i]; st.slope[i] = slope![i]; }
  }
  return st;
}
function diff4(st: TileStore, idx: number, label: string) {
  const t = loadT(idx), a = loadA(idx);
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let typ = 0, act = 0, wal = 0, liq = 0;
  const samples: string[] = [];
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    mask[i] = 1;
    if (dT) typ++; if (dA) act++; if (dW) wal++; if (dL) liq++;
    if (samples.length < 6) samples.push(`(${i % W},${(i / W) | 0})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}w${st.wall[i]}>${w[i]}l${st.liquid[i]}>${l[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq} ${samples.join(' | ')}`);
  return { typ, act, wal, liq, mask };
}
function diffHS(h1: Uint8Array, s1: Uint8Array, h2: Uint8Array, s2: Uint8Array, label: string) {
  let dh = 0, ds = 0;
  const cells: string[] = [];
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (h1[i] === h2[i] && s1[i] === s2[i]) continue;
    mask[i] = 1;
    if (h1[i] !== h2[i]) dh++; if (s1[i] !== s2[i]) ds++;
    if (cells.length < 8) cells.push(`(${i % W},${(i / W) | 0})h${h2[i]}>${h1[i]}s${s2[i]}>${s1[i]}`);
  }
  console.log(`${label}: Δhalf=${dh} Δslope=${ds} ${cells.join(' ')}`);
  return { dh, ds, mask, cells };
}
/** 清零规则：dump[p-1]→dump[p] 四通道(typ/act)变化格 → half/slope=0 */
function clearRule(h: Uint8Array, s: Uint8Array, from: number, to: number): number {
  let cleared = 0;
  let pT = loadT(from), pA = loadA(from);
  for (let p = from + 1; p <= to; p++) {
    const t = loadT(p), a = loadA(p);
    for (let i = 0; i < N; i++) {
      if (pT[i] !== t[i] || (pA[i] !== 0) !== (a[i] !== 0)) {
        if (h[i] || s[i]) { h[i] = 0; s[i] = 0; cleared++; }
      }
    }
    pT = t; pA = a;
  }
  return cleared;
}

(RUN ? it : it.skip)('half/slope first-divergence hunt', async () => {
  // ── A) 管线时点快照:s31(Dungeon 头=pass31 末)/s52/s53/s54/s66 + GenSolid 时点 + gs@67 ──
  const slotTag: Record<string, string> = { '海滩装饰': 's52', '半砖平滑': 's53', '瀑布唇缘': 's54', '神庙陈设': 's66' };
  const captured = new Set<string>();
  const gsSnaps: Record<string, Map<number, boolean>> = {};
  let cwGs: GenState | null = null;
  let cwSolid: Map<number, boolean> | null = null;
  let store: TileStore | null = null;
  let completedSlot: string | null = null;
  const dumpTag = (st: TileStore, tag: string) => {
    writeFileSync(`/tmp/sw-hs-${tag}-half.bin`, st.half);
    writeFileSync(`/tmp/sw-hs-${tag}-slope.bin`, st.slope);
    writeFileSync(`/tmp/sw-hs-${tag}-liq.bin`, st.liquidType);
    captured.add(tag);
    console.log(`captured ${tag} (after ${completedSlot})`);
  };
  const origReseed = RNG.prototype.reseed;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n').find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      if (!store) return;
      if (/generateWorld/.test(stackLine)) {
        const tag = slotTag[completedSlot ?? ''];
        if (tag && !captured.has(tag)) { gsSnaps[tag] = snapshotGenSolid(); dumpTag(store, tag); }
      } else {
        // 槽内 ▶Dungeon 标签 = Dungeon pass 头 = pass31 末（源码行注释解析,同 contentparity）
        const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
        if (mLoc && !captured.has('s31')) {
          const rel = mLoc[1].slice(mLoc[1].indexOf('src/'));
          try {
            const src = readFileSync(`${new URL('../', import.meta.url).pathname.replace(/\/+$/, '')}/${rel}`, 'utf8').split('\n');
            for (let k = +mLoc[2]; k >= Math.max(0, +mLoc[2] - 2); k--) {
              if (/\/\/\s*▶Dungeon\b/.test(src[k - 1] ?? '')) { gsSnaps['s31'] = snapshotGenSolid(); dumpTag(store, 's31'); break; }
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  };
  const g0 = globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void };
  g0.__swWallCap = (tag, gs) => { if (tag === 'cavewalls' && !cwGs) { cwGs = cloneGs(gs); cwSolid = snapshotGenSolid(); } };
  (RNG.prototype as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: (w, _i, name) => { store = w.store; completedSlot = name; } });
  } catch (e) { console.log('GEN-EX(忽略):', String(e).slice(0, 120)); } finally {
    (RNG.prototype as { reseed: unknown }).reseed = origReseed;
    g0.__swWallCap = undefined;
  }
  if (!captured.has('s31') || !cwGs || !cwSolid) { console.log('!! 快照不全:', [...captured], !!cwGs); return; }
  const seed = cwGs.seed;
  const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
  const hs52p = { half: rd('/tmp/sw-hs-s52-half.bin'), slope: rd('/tmp/sw-hs-s52-slope.bin'), liq: rd('/tmp/sw-hs-s52-liq.bin') };
  const hs53p = { half: rd('/tmp/sw-hs-s53-half.bin'), slope: rd('/tmp/sw-hs-s53-slope.bin') };
  const hs54p = { half: rd('/tmp/sw-hs-s54-half.bin'), slope: rd('/tmp/sw-hs-s54-slope.bin') };
  const hs66p = { half: rd('/tmp/sw-hs-s66-half.bin'), slope: rd('/tmp/sw-hs-s66-slope.bin'), liq: rd('/tmp/sw-hs-s66-liq.bin') };

  // ── B) 重构 half/slope@52 = s31 + 清零规则(031→052) ──
  const recH52 = rd('/tmp/sw-hs-s31-half.bin'), recS52 = rd('/tmp/sw-hs-s31-slope.bin');
  const cl = clearRule(recH52, recS52, 31, 52);
  console.log(`\n[B] 重构 half/slope@52: s31 + 清零规则(031→052) 清了 ${cl} 格`);
  const cmp52 = diffHS(recH52, recS52, hs52p.half, hs52p.slope, '[B] 重构@52 vs 管线@52(管线债度量)');

  // ── C) 掷数定标 ──
  const CH: Record<number, string> = { 53: '65aa58be', 54: '8896b60f', 67: 'd95ed054' };
  const Ns: Record<number, number> = {};
  for (const k of [53, 54, 67]) {
    Ns[k] = calibrateN(seed, CH[k]);
    console.log(`calibrate pass${k}: vanilla N=${Ns[k]}`);
  }

  // ── D) #53 重放(变体 B:重构通道) ──
  const st53 = buildStore(52, recH52, recS52, hs52p.liq);
  restoreGenSolid(gsSnaps['s52']!);
  const { rng: r53, box: b53 } = countedRng(seed);
  runSmoothWorldPass(st53, r53, cwGs);
  console.log(`\n[D|53 SmoothWorld·重构通道] draws=${b53.n} vs vanilla ${Ns[53]} (diff=${b53.n - Ns[53]})`);
  const d53 = diff4(st53, 53, '[D|53] 四通道 vs dump053 ★忠实性★');
  const c53 = diffHS(st53.half, st53.slope, hs53p.half, hs53p.slope, '[D|53] half/slope vs 管线末态');

  // ── D2) #53 重放(变体 A:管线@52 通道直用) 对照 ──
  const st53a = buildStore(52, hs52p.half, hs52p.slope, hs52p.liq);
  restoreGenSolid(gsSnaps['s52']!);
  const { rng: r53a, box: b53a } = countedRng(seed);
  runSmoothWorldPass(st53a, r53a, cwGs);
  console.log(`[D2|53·管线通道] draws=${b53a.n} (diff=${b53a.n - Ns[53]})`);
  diff4(st53a, 53, '[D2|53] 四通道 vs dump053');

  // ── E) #54 Waterfalls 重放(输入 = D 输出(若忠实)否则管线@53) ──
  const ok53 = d53.typ + d53.act + d53.wal + d53.liq === 0 && b53.n === Ns[53];
  const in53 = ok53
    ? { half: new Uint8Array(st53.half), slope: new Uint8Array(st53.slope) }
    : { half: hs53p.half, slope: hs53p.slope };
  console.log(`\n[E] half/slope@53 来源: ${ok53 ? 'D 重放输出(已证忠实)' : '管线快照(!!53 未证忠实)'}`);
  const st54 = buildStore(53, in53.half, in53.slope, hs52p.liq);
  restoreGenSolid(gsSnaps['s53']!);
  const { rng: r54, box: b54 } = countedRng(seed);
  runWaterfallLipPass(st54, r54, cwGs);
  console.log(`[E|54 Waterfalls] draws=${b54.n} vs vanilla ${Ns[54]} (diff=${b54.n - Ns[54]})`);
  diff4(st54, 54, '[E|54] 四通道 vs dump054');
  const c54 = diffHS(st54.half, st54.slope, hs54p.half, hs54p.slope, '[E|54] half/slope vs 管线末态');

  // ── F) #55-#66 桥接(清零规则) ──
  const recH = ok53 ? new Uint8Array(st54.half) : new Uint8Array(hs54p.half);
  const recS = ok53 ? new Uint8Array(st54.slope) : new Uint8Array(hs54p.slope);
  const cl2 = clearRule(recH, recS, 54, 66);
  console.log(`\n[F] 桥接 054→066 清零 ${cl2} 格`);
  const c66 = diffHS(recH, recS, hs66p.half, hs66p.slope, '[F] 重构 half/slope@66 vs 管线@66');

  // ── G) #67 重放(重构通道注入) ★塌缩验证★ ──
  const st67 = buildStore(66, recH, recS, hs66p.liq);
  restoreGenSolid(cwSolid);
  const { rng: r67, box: b67 } = countedRng(seed);
  const t1 = Date.now();
  runCaveWallsPass(st67, r67, cloneGs(cwGs));
  console.log(`\n[G|67 Cave_Walls·重构通道] draws=${b67.n} vs vanilla ${Ns[67]} (diff=${b67.n - Ns[67]}) ${Date.now() - t1}ms`);
  const d67 = diff4(st67, 67, '[G|67] 四通道 vs dump067 ★塌缩★');

  // ── H) 首分叉归因 ──
  {
    const tA = loadT(52), aA = loadA(52);
    const st52 = buildStore(52, recH52, recS52);
    let pm = 0;
    const pol = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let jT = st52.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      if (jT !== tA[i] || (st52.flags[i] !== 0) !== (aA[i] !== 0)) { pol[i] = 1; pm++; }
    }
    console.log(`\n[H] #52 边界 JS 管线 vs dump052 四通道差格: ${pm}`);
    const dil = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!pol[y * W + x]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) dil[ny * W + nx] = 1;
      }
    }
    let inDil = 0, tot = 0;
    const outCells: string[] = [];
    for (let i = 0; i < N; i++) {
      if (!cmp52.mask[i]) continue;
      tot++;
      if (dil[i]) inDil++;
      else if (outCells.length < 10) outCells.push(`(${i % W},${(i / W) | 0})h${hs52p.half[i]}>${recH52[i]}s${hs52p.slope[i]}>${recS52[i]}`);
    }
    console.log(`[H] half/slope@52 差格=${tot}, 其中 ${inDil} 在污染带±2 内 (${(100 * inDil / Math.max(1, tot)).toFixed(1)}%)`);
    if (outCells.length) console.log('[H] 带外差格:', outCells.join(' '));
  }
}, 480000);

// 一次性:x86 half/slope 真值对拍(Rosetta 复现链)——#52 输入三方对比 + #53 重放
// 忠实性(真值输入→dump053 四通道)+ #66 真值注入 #67 → 残余塌缩。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runSmoothWorldPass, runWaterfallLipPass } from '../src/world/gen/vanilla/HalfBrickPass';
import { runCaveWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const TV = '/tmp/sw-hsv';
const W = 4200, H = 1200, N = W * H;
const DNAME: Record<number, string> = {
  31: 'Slush', 52: 'Shell_Piles', 53: 'Smooth_World', 54: 'Waterfalls',
  66: 'Temple', 67: 'Cave_Walls',
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
const rd = (p: string) => new Uint8Array(readFileSync(p).buffer.slice(0));
const truth = (tag: string) => ({ half: rd(`${TV}/hs${tag}.half`), slope: rd(`${TV}/hs${tag}.slope`), lty: rd(`${TV}/hs${tag}.lty`), inact: rd(`${TV}/hs${tag}.inact`) });

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  ur.internalSample = () => { box.n++; return orig(); };
  return { rng, box };
}
function buildStore(idx: number, hs?: { half: Uint8Array; slope: Uint8Array; lty?: Uint8Array; inact?: Uint8Array }, remapLty = false): TileStore {
  const t = loadT(idx), a = loadA(idx);
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    // 原版 liquidType: 水=0/岩浆=1/蜂蜜=2/微光=3;本仓 +1 编码(liquidtype-plus-one 备忘)
    st.liquidType[i] = hs?.lty ? (remapLty ? (l[i]! > 0 ? hs.lty[i] + 1 : 0) : hs.lty[i]) : (l[i]! > 0 ? 1 : 0);
    if (hs) { st.half[i] = hs.half[i]; st.slope[i] = hs.slope[i]; st.wire[i] = hs.inact?.[i] ? 32 : 0; }
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
    if (samples.length < 6) samples.push(`(${i % W},${(i / W) | 0})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq} ${samples.join(' | ')}`);
  return { typ, act, wal, liq, mask };
}
function cmpHS(A: { half: Uint8Array; slope: Uint8Array }, B: { half: Uint8Array; slope: Uint8Array }, label: string) {
  let dh = 0, ds = 0;
  const cells: string[] = [];
  for (let i = 0; i < N; i++) {
    if (A.half[i] === B.half[i] && A.slope[i] === B.slope[i]) continue;
    if (A.half[i] !== B.half[i]) dh++; else ds++;
    if (cells.length < 10) cells.push(`(${i % W},${(i / W) | 0})h${B.half[i]}>${A.half[i]}s${B.slope[i]}>${A.slope[i]}`);
  }
  console.log(`${label}: Δ=${dh + ds} (half=${dh} slope=${ds}) ${cells.join(' ')}`);
  return { dh, ds, cells };
}

(RUN ? it : it.skip)('x86 half/slope truth verdict', async () => {
  const t52 = truth('52'), t53 = truth('53'), t54 = truth('54'), t66 = truth('66');
  let nz = 0; for (let i = 0; i < N; i++) if (t52.half[i] || t52.slope[i]) nz++;
  let nz53 = 0; for (let i = 0; i < N; i++) if (t53.half[i] || t53.slope[i]) nz53++;
  console.log(`真值@52 nz(h|s)=${nz}  @53 nz=${nz53}  @54 nz=${(() => { let c = 0; for (let i = 0; i < N; i++) if (t54.half[i] || t54.slope[i]) c++; return c; })()}  @66 nz=${(() => { let c = 0; for (let i = 0; i < N; i++) if (t66.half[i] || t66.slope[i]) c++; return c; })()}`);

  // ── 1) #52 三方对比:真值 vs 管线@52 vs 重构(s31+clear-rule) ──
  const p52 = { half: rd('/tmp/sw-hs-s52-half.bin'), slope: rd('/tmp/sw-hs-s52-slope.bin') };
  cmpHS(t52, p52, '[52] 真值 vs JS管线@52');
  const recH52 = rd('/tmp/sw-hs-s31-half.bin'), recS52 = rd('/tmp/sw-hs-s31-slope.bin');
  {
    const D = ['Slush', 'Dungeon', 'Mountain_Caves', 'Beaches', 'Gems', 'Gravitating_Sand', 'Create_Ocean_Caves', 'Shimmer', 'Clean_Up_Dirt', 'Pyramids', 'Dirt_Rock_Wall_Runner', 'Living_Trees', 'Wood_Tree_Walls', 'Altars', 'Wet_Jungle', 'Jungle_Temple', 'Hives', 'Jungle_Chests', 'Settle_Liquids', 'Remove_Water_From_Sand', 'Oasis', 'Shell_Piles'];
    let pT = loadT(31), pA = loadA(31);
    for (let p = 32; p <= 52; p++) {
      const nm = p === 52 ? 'Shell_Piles' : D[p - 31];
      const t = new Uint16Array(readFileSync(`${VG}/${String(p).padStart(3, '0')}_${nm}.typ`).buffer.slice(0));
      const a = readFileSync(`${VG}/${String(p).padStart(3, '0')}_${nm}.act`);
      for (let i = 0; i < N; i++) if (pT[i] !== t[i] || (pA[i] !== 0) !== (a[i] !== 0)) { recH52[i] = 0; recS52[i] = 0; }
      pT = t; pA = a;
    }
  }
  cmpHS(t52, { half: recH52, slope: recS52 }, '[52] 真值 vs 重构(s31+清零)');

  // ── 2) #53 重放:真值@52 输入 → dump053 四通道(忠实性终审) ──
  const st53 = buildStore(52, t52);
  const { resetGenSolid, flipGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  resetGenSolid();
  flipGenSolid([484, 137, 659], false);
  flipGenSolid([192], true);
  const { rng: r53, box: b53 } = countedRng(9293480);
  runSmoothWorldPass(st53, r53, { seed: 9293480 } as GenState);
  console.log(`\n[53 重放·真值输入] draws=${b53.n} (vanilla=5097254, diff=${b53.n - 5097254})`);
  const d53 = diff4(st53, 53, '[53] 四通道 vs dump053');
  cmpHS(t53, { half: st53.half, slope: st53.slope }, '[53] 真值@53 vs 重放输出');

  // ── 3) #54 重放:真值@53 输入 ──
  const st54 = buildStore(53, t53);
  const { rng: r54, box: b54 } = countedRng(9293480);
  runWaterfallLipPass(st54, r54, { seed: 9293480 } as GenState);
  console.log(`[54 重放·真值输入] draws=${b54.n} (vanilla=2812, diff=${b54.n - 2812})`);
  diff4(st54, 54, '[54] 四通道 vs dump054');
  cmpHS(t54, { half: st54.half, slope: st54.slope }, '[54] 真值@54 vs 重放输出');

  // ── 4) #67 重放:真值@66 注入 ★最终塌缩★ ──
  // gs 从管线 cavewalls 头捕获(参数与世界无关的标量;受污染的仅结构矩形,#67 不读)
  // ★GenSolid 快照必须同点捕获并 restore（W 批 #67 根因:真值四通道+half/slope 注入
  //   后仍偏 7,998 wal/-3,430 掷——重放缺管线时点 tileSolid 翻转态,蜂巢块 225
  //   （LifeCrystals 尾 cs:16944 起 false）与泡泡块 379（SpiderCaves 头 cs:17459 起
  //   false）在重放里回退 TILE_DEFS 初值=true → countTiles 洪泛被其阻断（原版
  //   穿透 → 1500 帽 → 更多重试 → 更多掷——正是 -3,430 的符号）,候选序列整体漂移。
  const { snapshotGenSolid, restoreGenSolid } = await import('../src/world/gen/vanilla/GenSolid');
  const { __swWallCapGs } = globalThis as unknown as { __swWallCapGs?: GenState };
  let cwGs: GenState | null = null;
  let cwSolid: Map<number, boolean> | null = null;
  if (__swWallCapGs) cwGs = __swWallCapGs;
  if (!cwGs) {
    // 简易兜壳:跑一遍管线抓 gs(仅一次)
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const g0 = globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void };
    const keep = new Map<string, GenState>();
    const clone = (gs: GenState): GenState => {
      const c = { ...gs } as unknown as Record<string, unknown>;
      for (const k of Object.keys(c)) {
        const v = c[k];
        if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
        else if (v instanceof Int32Array) c[k] = v.slice();
        else if (v instanceof Float32Array) c[k] = v.slice();
        else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
      }
      return c as unknown as GenState;
    };
    g0.__swWallCap = (tag, gs) => { if (tag === 'cavewalls' && !keep.has('cw')) { keep.set('cw', clone(gs)); cwSolid = snapshotGenSolid(); } };
    try { await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } }); } catch { /* ignore */ } finally { g0.__swWallCap = undefined; }
    cwGs = keep.get('cw') ?? null;
  }
  if (!cwGs) { console.log('!! cwGs 缺失,#67 跳过'); return; }
  const st67 = buildStore(66, t66, true);
  if (cwSolid) restoreGenSolid(cwSolid);
  const { rng: r67, box: b67 } = countedRng(9293480);
  runCaveWallsPass(st67, r67, cwGs);
  console.log(`\n[67 重放·真值注入] draws=${b67.n} (vanilla=53270, diff=${b67.n - 53270})`);
  diff4(st67, 67, '[67] 四通道 vs dump067 ★塌缩终审★');
}, 480000);

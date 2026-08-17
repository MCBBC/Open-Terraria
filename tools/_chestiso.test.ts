// 一次性：尾批 2-B 箱族+雕像槽隔离重放（dump 输入直构 → pass 链 → 对拍 dump 输出）。
//   - #58 UndergroundHousesAndBuriedChests：dump058 → rollHouseChestCounts+Buried+Underworld
//     +CaveHouses → dump059   ← ① SurfaceChests 边界 14.7k/8.1k/6.9k/1013 归因
//   - #60 SurfaceChests：dump059 → runSurfaceChestsPass → dump060
//   - #63 SpiderCaves：dump062 → runSpiderNestPass → dump063   ← ② SLOT-END 3.7k/3.1k/20k/2138
// 输入 = dump 四通道真值 + 管线时点辅助通道（liquidType/half/slope/wire）+ gs 克隆
// + GenSolid 快照（U 批坑：翻转态必须同点搬运）。跑法：SW_PARITY=1 npx vitest run tools/_chestiso.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass, type ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { snapshotGenSolid, restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200, N = W * H;
const NAMES: Record<number, string> = {
  58: 'Statues', 59: 'Buried_Chests', 60: 'Surface_Chests', 61: 'Jungle_Chests_Placement',
  62: 'Water_Chests', 63: 'Spider_Caves',
};
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);
const loadT = (idx: number) => new Uint16Array(load(idx, 'typ').buffer.slice(0));
const loadA = (idx: number) => load(idx, 'act');
const loadW = (idx: number) => new Uint16Array(load(idx, 'wal').buffer.slice(0));
const loadL = (idx: number) => load(idx, 'liq');

const REV = new Map<number, number>();
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}
SHEET[0] = 0;

interface Cap { gs: GenState; solid: Map<number, boolean>; aux: { liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array } }
const caps: Record<string, Cap> = {};

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v instanceof Uint8Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

function countedRng(seed: number) {
  const rng = new RNG(seed);
  const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
  const orig = ur.internalSample.bind(ur);
  const box = { n: 0 };
  const rolls: Array<[number, string, number, number, number]> = [];
  ur.internalSample = () => { box.n++; return orig(); };
  // RNG 门面日志：int/next 逐调用记 (k, 调用形, lo, hi, val)
  const g = globalThis as { __swRollLog?: Array<[number, string, number, number, number]> };
  if (g.__swRollLog) {
    for (const key of ['int', 'next'] as const) {
      const origFn = (rng[key] as (...a: number[]) => number).bind(rng);
      (rng[key] as unknown as (...a: number[]) => number) = (...a: number[]) => {
        const v = origFn(...a);
        g.__swRollLog!.push([box.n, key, a[0] ?? 0, a[1] ?? 0, v]);
        (globalThis as { __swRollN?: number }).__swRollN = box.n;
        return v;
      };
    }
  }
  return { rng, box };
}

function buildStore(idx: number, cap: Cap): TileStore {
  const t = loadT(idx), a = loadA(idx), w = loadW(idx), l = loadL(idx);
  // ★辅助通道改用 x86 真值 /tmp/chestd59（尾批 2-B ChestProbe D59：Buried Chests
  //   pass 头 slope/half/lty/wire 四通道裸数组——55-58 期间 slope/half 有 5 万格
  //   漂移，hs54 已陈旧）。
  let hHalf: Uint8Array | null = null, hSlope: Uint8Array | null = null, hLty: Uint8Array | null = null, hWire: Uint8Array | null = null;
  try {
    // ★尾批 2-C：/tmp/hg/chestd59v2 = SW_EVIL=0 与金标 dump 同跑的四通道（旧
    //   /tmp/chestd59 是自然邪恶首跑产物——half 有 10,939 格漂移，曾致落定/锚腿判定分叉）
    hHalf = new Uint8Array(readFileSync('/tmp/hg/chestd59v2.half'));
    hSlope = new Uint8Array(readFileSync('/tmp/hg/chestd59v2.slope'));
    hLty = new Uint8Array(readFileSync('/tmp/hg/chestd59v2.lty'));
    hWire = new Uint8Array(readFileSync('/tmp/hg/chestd59v2.wire'));
  } catch { /* 缺真值回退管线捕获 */ }
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = hLty ? hLty[i] : cap.aux.liquidType[i];       // D59 已按本仓 +1 编码（liquid>0 ? lty+1 : 0）
    st.half[i] = hHalf ? hHalf[i] : cap.aux.half[i];
    st.slope[i] = hSlope ? hSlope[i] : cap.aux.slope[i];
    st.wire[i] = hWire ? hWire[i] : cap.aux.wire[i];
  }
  return st;
}

interface DiffRes { typ: number; act: number; wal: number; liq: number; pairs: [string, number][]; samples: string[]; mask: Uint8Array }
function diff(st: TileStore, idx: number, label: string, prevMask?: Uint8Array): DiffRes {
  const t = loadT(idx), a = loadA(idx), w = loadW(idx), l = loadL(idx);
  let typ = 0, act = 0, wal = 0, liq = 0;
  const pairs = new Map<string, number>();
  const samples: string[] = [];
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    mask[i] = 1;
    if (dT) { typ++; pairs.set(`t${jT}>${t[i]}`, (pairs.get(`t${jT}>${t[i]}`) ?? 0) + 1); }
    if (dA) { act++; pairs.set(`a${st.flags[i] ? 1 : 0}>${a[i]}`, (pairs.get(`a${st.flags[i] ? 1 : 0}>${a[i]}`) ?? 0) + 1); }
    if (dW) { wal++; pairs.set(`W${st.wall[i]}>${w[i]}`, (pairs.get(`W${st.wall[i]}>${w[i]}`) ?? 0) + 1); }
    if (dL) liq++;
    if (samples.length < 8) samples.push(`(${i % W},${(i / W) | 0})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}w${st.wall[i]}>${w[i]}L${st.liquid[i]}>${l[i]}`);
  }
  const top = [...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14);
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify(top));
  console.log('  samples:', samples.join(' | '));
  if (prevMask) {
    let nt = 0, na = 0, nw = 0, nl = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || prevMask[i]) continue;
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      if (jT !== t[i]) nt++;
      if ((st.flags[i] !== 0) !== (a[i] !== 0)) na++;
      if (st.wall[i] !== w[i]) nw++;
      if (st.liquid[i] !== l[i]) nl++;
    }
    console.log(`  new(相对prevMask): typ=${nt} act=${na} wal=${nw} liq=${nl}`);
  }
  return { typ, act, wal, liq, pairs: top, samples, mask };
}

/** 足迹对拍：vanilla 改动集（in→out dump）与 JS 改动集（in dump→JS 出）的分渠道计数 + 首/尾分歧点 */
function footprints(st: TileStore, inIdx: number, outIdx: number) {
  const ti = loadT(inIdx), ai = loadA(inIdx), wi = loadW(inIdx), li = loadL(inIdx);
  const to = loadT(outIdx), ao = loadA(outIdx), wo = loadW(outIdx), lo = loadL(outIdx);
  const vanT: number[] = [], vanW: number[] = [], jsT: number[] = [], jsW: number[] = [];
  const vanList: Array<[number, number, string]> = [], jsList: Array<[number, number, string]> = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (ti[i] !== to[i] || (ai[i] !== 0) !== (ao[i] !== 0) || wi[i] !== wo[i]) {
      vanList.push([x, y, `t${ti[i]}${ai[i] ? '*' : '.'}>${to[i]}${ao[i] ? '*' : '.'}w${wi[i]}>${wo[i]}`]);
      if (ti[i] !== to[i] || (ai[i] !== 0) !== (ao[i] !== 0)) vanT.push(i);
      if (wi[i] !== wo[i]) vanW.push(i);
    }
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    const jA = st.flags[i] !== 0;
    if (jT !== ti[i] || jA !== (ai[i] !== 0) || st.wall[i] !== wi[i]) {
      jsList.push([x, y, `t${ti[i]}${ai[i] ? '*' : '.'}>${jT}${jA ? '*' : '.'}w${wi[i]}>${st.wall[i]}`]);
      if (jT !== ti[i] || jA !== (ai[i] !== 0)) jsT.push(i);
      if (st.wall[i] !== wi[i]) jsW.push(i);
    }
  }
  console.log(`  足迹: vanilla typ/act格=${vanT.length} wal格=${vanW.length} | JS typ/act格=${jsT.length} wal格=${jsW.length}`);
  const vanSet = new Set(vanList.map(([x, y]) => `${x},${y}`));
  const jsSet = new Set(jsList.map(([x, y]) => `${x},${y}`));
  const onlyVan = vanList.filter(([x, y]) => !jsSet.has(`${x},${y}`));
  const onlyJs = jsList.filter(([x, y]) => !vanSet.has(`${x},${y}`));
  console.log(`  vanilla-only=${onlyVan.length} (前6: ${onlyVan.slice(0, 6).map((e) => e.join(',')).join(' ')})  JS-only=${onlyJs.length} (前6: ${onlyJs.slice(0, 6).map((e) => e.join(',')).join(' ')})`);
  // 首个 onlyJs 事件的 7×7 邻域三视图
  if (onlyJs.length) {
    const [bx, by] = onlyJs[0]!;
    const rows: string[] = [];
    for (let dy = -3; dy <= 3; dy++) {
      let rI = '', rV = '', rJ = '';
      for (let dx = -3; dx <= 3; dx++) {
        const i = (by + dy) * W + bx + dx;
        rI += `${ti[i] ?? '?'}${ai[i] ? '*' : '.'} `;
        rV += `${to[i] ?? '?'}${ao[i] ? '*' : '.'} `;
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        rJ += `${jT}${st.flags[i] ? '*' : '.'} `;
      }
      rows.push(`y${by + dy}: in[${rI}] van[${rV}] js[${rJ}]`);
    }
    console.log(`  首JS-only(${bx},${by}) 7×7:\n    ` + rows.join('\n    '));
    const near = onlyJs.slice(0, 12).map(([x, y, s]) => `(${x},${y})${s}`);
    console.log(`  JS-only 前12: ${near.join(' ')}`);
    const nearV = onlyVan.slice(0, 12).map(([x, y, s]) => `(${x},${y})${s}`);
    console.log(`  van-only 前12: ${nearV.join(' ')}`);
  }
}

(RUN ? it : it.skip)('chest-family isolated replay', async () => {
  // ── A) 真管线捕获 ──
  const origReseed = RNG.prototype.reseed;
  const WANT = new Set(['UndergroundHousesAndBuriedChests', 'SurfaceChests', 'UnderwaterChests', 'SpiderCaves']);
  let store: TileStore | null = null;
  const onReseed = function (this: RNG, seed: number) {
    origReseed.call(this, seed);
    try {
      const stackLine = (new Error().stack ?? '').split('\n').find((l) => l.includes('/src/') && !l.includes('rng.ts')) ?? '?';
      const mLoc = /\(.*(src\/[^\s?]+):(\d+):\d+\)/.exec(stackLine);
      if (!mLoc || !mLoc[1]!.includes('WorldGen.ts') || !store) return;
      const abs = `/Users/vinlic/Project/GLM/SandboxWorld/game/${mLoc[1]!.slice(mLoc[1]!.indexOf('src/'))}`;
      const src = readFileSync(abs, 'utf8').split('\n');
      for (let k = +mLoc[2]; k >= Math.max(0, +mLoc[2] - 2); k--) {
        const cm = /\/\/\s*▶([^\s(（]+)/.exec(src[k - 1] ?? '');
        if (cm && WANT.has(cm[1]!) && !caps[cm[1]!]) {
          const gs = lastGenState();
          if (!gs) return;
          caps[cm[1]!] = {
            gs: cloneGs(gs), solid: snapshotGenSolid(),
            aux: { liquidType: store.liquidType.slice(), half: store.half.slice(), slope: store.slope.slice(), wire: store.wire.slice() },
          };
          console.log(`captured @▶${cm[1]}`);
        }
      }
    } catch { /* probe */ }
  };
  (RNG.prototype as unknown as { reseed: unknown }).reseed = onReseed;
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: (w) => { store = w.store; } });
  } catch (e) {
    console.log('pipeline EX(忽略):', String(e).slice(0, 200));
  } finally {
    (RNG.prototype as unknown as { reseed: unknown }).reseed = origReseed;
  }
  console.log('caps:', Object.keys(caps).join(','));

  // ── B) #58 窗：dump058 → #58 链 → dump059 ──
  {
    const cap = caps.UndergroundHousesAndBuriedChests!;
    const st = buildStore(58, cap);
    restoreGenSolid(cap.solid);
    const gs = cloneGs(cap.gs);
    const chests: ChestSink = [];
    (globalThis as { __swRollLog?: unknown }).__swRollLog = [];
    const houseEv: Array<[string, number, number, number]> = [];
    (globalThis as unknown as { __swHouseEv?: (p: string, x: number, y: number) => void }).__swHouseEv
      = (p, x, y) => { houseEv.push([p, x, y, (globalThis as { __swRollN?: number }).__swRollN ?? -1]); };
    const chestEv: Array<[string, number, number, number]> = [];
    (globalThis as unknown as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv
      = (p, i, j, x) => { chestEv.push([p, i, j, x ?? (globalThis as { __swRollN?: number }).__swRollN ?? -1]); };
    const stageEv: Array<[string, number, number, number, number]> = [];
    (globalThis as unknown as { __swHouseStage?: (tag: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage
      = (tag, a, b, c, d) => { stageEv.push([tag, a, b, c, d]); };
    const { rng, box } = countedRng(gs.seed);
    flipGenSolid([226, 162, 225, 190], true);
    rollHouseChestCounts(st, rng, gs);
    const counts = { house: gs.caveHouseCount, uw: gs.underworldChestCount, cave: gs.caveChestCount, desert: gs.desertHouseCount };
    runBuriedChestsPass(st, rng, gs, chests);
    runUnderworldChestsPass(st, rng, gs, chests);
    runCaveHousesPass(st, rng, gs, chests);
    flipGenSolid([226, 162, 225, 190], false);
    console.log(`\n[#58 重放] draws=${box.n} counts=${JSON.stringify(counts)} chests=${chests.length}`);
    // 落盘 JS 重放输出 + chests 清单供 python 分析（van N 定标：P59=76364 P60=28810 P62=5495 P63=160186）
    try {
      const fsmod = await import('node:fs');
      fsmod.mkdirSync('/tmp/sw-chest', { recursive: true });
      const wf = fsmod.writeFileSync;
      const bt = Buffer.alloc(N * 2), bw = Buffer.alloc(N * 2);
      for (let i = 0; i < N; i++) {
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        bt.writeUInt16LE(jT & 0xffff, i * 2);
        bw.writeUInt16LE(st.wall[i] & 0xffff, i * 2);
      }
      wf('/tmp/sw-chest/js59.typ', bt); wf('/tmp/sw-chest/js59.act', Buffer.from(Uint8Array.from(st.flags, (f) => f & 1)));
      wf('/tmp/sw-chest/js59.wal', bw); wf('/tmp/sw-chest/js59.liq', Buffer.from(st.liquid.slice()));
      wf('/tmp/sw-chest/js59.chests.json', JSON.stringify(chests.map((c) => ({ x: c.x, y: c.y, items: c.items }))));
      wf('/tmp/sw-chest/js59.rolls.json', JSON.stringify((globalThis as { __swRollLog?: Array<[number, string, number, number, number]> }).__swRollLog ?? []));
      wf('/tmp/sw-chest/js59.houses.json', JSON.stringify(houseEv));
      wf('/tmp/sw-chest/js59.chestev.json', JSON.stringify(chestEv));
      wf('/tmp/sw-chest/js59.stageev.json', JSON.stringify(stageEv));
    } catch (e) { console.log('save fail', String(e).slice(0, 120)); }
    (globalThis as { __swRollLog?: unknown }).__swRollLog = undefined;
    (globalThis as unknown as { __swHouseEv?: unknown }).__swHouseEv = undefined;
    (globalThis as unknown as { __swChestEv?: unknown }).__swChestEv = undefined;
    (globalThis as unknown as { __swHouseStage?: unknown }).__swHouseStage = undefined;
    const d = diff(st, 59, '[#58] vs dump059');
    footprints(st, 58, 59);
    // 宝箱清单对拍：vanilla 新增 2×2 箱组（dump058→059）vs JS chests[]（cell 序）
    {
      const ti = loadT(58), ai = loadA(58), to = loadT(59), ao = loadA(59);
      const vanChests: Array<[number, number, number]> = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if ((to[i] === 21 || to[i] === 467) && (ao[i] !== 0) && !(to[i] === ti[i] && (ai[i] !== 0))) {
          // 左上角判定：左/上邻不是同型箱格
          const l = i - 1, u = i - W;
          const isTL = !((x > 0 && to[l] === to[i] && (ao[l] !== 0))) && !((y > 0 && to[u] === to[i] && (ao[u] !== 0)));
          if (isTL) vanChests.push([x, y, to[i]!]);
        }
      }
      const jsList = chests.map((c) => [c.x, c.y, SHEET[st.type[c.y * W + c.x]] ?? -1] as [number, number, number])
        .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
      const vanList = vanChests.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
      console.log(`  宝箱清单: vanilla=${vanList.length} JS=${jsList.length}`);
      const key = (c: [number, number, number]) => `${c[0]},${c[1]}`;
      const vanKeys = new Set(vanList.map(key));
      const jsKeys = new Set(jsList.map(key));
      let firstBad = -1;
      const merged: Array<[number, number, number, string]> = [];
      for (const c of vanList) merged.push([c[0], c[1], c[2], jsKeys.has(key(c)) ? '=' : 'V-only']);
      for (const c of jsList) if (!vanKeys.has(key(c))) merged.push([c[0], c[1], c[2], 'J-only']);
      merged.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
      for (let k = 0; k < merged.length; k++) if (merged[k]![3] !== '=') { firstBad = k; break; }
      console.log(`  合并序前 40（cell 序）: ${merged.slice(0, 40).map((m) => `(${m[0]},${m[1]})t${m[2]}${m[3] === '=' ? '' : m[3]}`).join(' ')}`);
      console.log(`  首分歧序=${firstBad} → ${firstBad >= 0 ? merged[firstBad]!.join(',') : '全同'}`);
      // 流序对拍：chests[] 前 54 = 循环①(39)+②(15)，其后=小屋序。逐个标 ∈vanilla?
      const streamTag = chests.map((c, idx) => {
        const tag = idx < 39 ? 'C' : idx < 54 ? 'U' : 'H';
        return `${idx}${tag}${vanKeys.has(`${c.x},${c.y}`) ? '=' : '×'}(${c.x},${c.y})`;
      });
      console.log(`  流序前 60: ${streamTag.slice(0, 60).join(' ')}`);
      const missC = streamTag.slice(0, 39).filter((s) => s.includes('×')).length;
      const missU = streamTag.slice(39, 54).filter((s) => s.includes('×')).length;
      let missH = 0;
      for (let k = 54; k < streamTag.length; k++) if (streamTag[k]!.includes('×')) missH++;
      console.log(`  未命中: 循环① ${missC}/39 循环② ${missU}/15 小屋 ${missH}/${Math.max(0, streamTag.length - 54)}`);
    }
  }

  // ── C) #60 SurfaceChests 窗 ──
  if (caps.SurfaceChests) {
    const cap = caps.SurfaceChests!;
    const st = buildStore(59, cap);
    restoreGenSolid(cap.solid);
    const gs = cloneGs(cap.gs);
    const chests: ChestSink = [];
    // GG 批尾案②：AB 逐次事件 + 全量掷骰日志落盘（vs /tmp/hg/houseprobe4.txt pass60 段）
    //   ★__swRollLog 须在 countedRng 之前置（门面在构造时绑定）
    (globalThis as { __swRollLog?: unknown }).__swRollLog = [];
    const { rng, box } = countedRng(gs.seed);
    const abEv: Array<[string, number, number, number, number]> = [];
    (globalThis as unknown as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv
      = (p, i, j, x) => { abEv.push([p, i, j, x ?? -1, (globalThis as { __swRollN?: number }).__swRollN ?? -1]); };
    runSurfaceChestsPass(st, rng, gs, chests);
    try {
      const fsmod = await import('node:fs');
      fsmod.mkdirSync('/tmp/sw-chest', { recursive: true });
      fsmod.writeFileSync('/tmp/sw-chest/js60.ab.json', JSON.stringify(abEv));
      fsmod.writeFileSync('/tmp/sw-chest/js60.rolls.json', JSON.stringify((globalThis as { __swRollLog?: Array<[number, string, number, number, number]> }).__swRollLog ?? []));
      fsmod.writeFileSync('/tmp/sw-chest/js60.chests.json', JSON.stringify(chests.map((c) => ({ x: c.x, y: c.y }))));
    } catch (e) { console.log('js60 save fail', String(e).slice(0, 120)); }
    (globalThis as { __swRollLog?: unknown }).__swRollLog = undefined;
    (globalThis as unknown as { __swChestEv?: unknown }).__swChestEv = undefined;
    console.log(`\n[#60 重放] draws=${box.n} chests=${chests.length} abCalls=${abEv.filter((e) => e[0] === 'ab').length}`);
    diff(st, 60, '[#60] vs dump060');
    footprints(st, 59, 60);
  }

  // ── D) #63 SpiderCaves 窗 ──
  if (caps.SpiderCaves) {
    const cap = caps.SpiderCaves!;
    const st = buildStore(62, cap);
    restoreGenSolid(cap.solid);
    const gs = cloneGs(cap.gs);
    const chests: ChestSink = [];
    const { rng, box } = countedRng(gs.seed);
    runSpiderNestPass(st, rng, gs, chests);
    console.log(`\n[#63 重放] draws=${box.n} chests=${chests.length}`);
    diff(st, 63, '[#63] vs dump063');
    footprints(st, 62, 63);
  }
}, 480000);

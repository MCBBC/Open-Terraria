// 一次性：#29 Corruption + #20 Mushroom 隔离重放（dump 输入直构 → pass → 对拍 dump 输出）。
//   - #20: dump019(Desert 末) → runMushroomPass → dump020（原版掷数 N 见 tools/_c29n 定标）
//   - #29: dump028(Underworld 末) → runCorruptionPass → dump029（原版 N=5,128,077）
// gs 捕获：真管线跑 generateWorld，经 __swMushGsCap/__swCorGsCap 探针钩（pass 头）
// 深克隆 GenState（undergroundDesert/dungeonLocation 等 pass 间状态须与管线一致）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runMushroomPass } from '../src/world/gen/vanilla/MushroomPass';
import { runCorruptionPass } from '../src/world/gen/vanilla/CorruptionPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = { 19: 'Full_Desert', 20: 'Mushroom_Patches', 28: 'Underworld', 29: 'Corruption' };
const load = (idx: number, ext: string) => readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${NAMES[idx]}.${ext}`);

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

function buildStore(idx: number, liquidType = 1): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let lt: Uint8Array | null = null;
  try { lt = readFileSync('/tmp/sw-mush-liqtype.bin'); } catch { /* 首跑无真值 */ }
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;   // 幽灵 type 照抄（dump typ 含 inactive ghost）
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = lt ? lt[i] ?? 0 : (l[i]! > 0 ? liquidType : 0);
  }
  return st;
}

function diff(st: TileStore, idx: number, label: string) {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
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
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8)));
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

let gsMush: GenState | null = null;
let gsCor: GenState | null = null;

(RUN ? it : it.skip)('#20/#29 isolated replay', async () => {
  // ── A) 真管线捕获 gs（跑到 Corruption 即够；不 abort，17s 可接受）
  const g0 = globalThis as {
    __swMushGsCap?: (gs: GenState) => void;
    __swCorGsCap?: (gs: GenState) => void;
  };
  g0.__swMushGsCap = (gs, st) => {
    if (!gsMush) {
      gsMush = cloneGs(gs);
      // liquidType 真值采集（dump 四通道不含；SpreadGrass lava 门/ShroomPatch lava 清除依赖）
      try { writeFileSync('/tmp/sw-mush-liqtype.bin', st.liquidType); } catch { /* ignore */ }
    }
  };
  g0.__swCorGsCap = (gs) => { if (!gsCor) gsCor = cloneGs(gs); };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } });
  } catch (e) {
    console.log('pipeline EX(忽略):', String(e).slice(0, 160));
  } finally {
    g0.__swMushGsCap = undefined; g0.__swCorGsCap = undefined;
  }
  console.log('captured:', { mush: !!gsMush, cor: !!gsCor });
  if (!gsMush || !gsCor) throw new Error('gs capture failed');
  console.log('gsMush: ud=', JSON.stringify(gsMush.undergroundDesert), 'rock=', gsMush.rockLevel, 'ws=', gsMush.worldSurface, 'wsLow=', gsMush.worldSurfaceLow, 'seed=', gsMush.seed);
  console.log('gsCor: dgLoc=', gsCor.dungeonLocation, 'dgSide=', gsCor.dungeonSide, 'ud=', JSON.stringify(gsCor.undergroundDesert), 'beach=', gsCor.beachDistance, 'wsLow=', gsCor.worldSurfaceLow, 'ws=', gsCor.worldSurface, 'rock=', gsCor.rockLevel);

  // ── B) #20 Mushroom：dump019 → runMushroomPass → dump020
  {
    const st = buildStore(19);
    const { rng, box } = countedRng(gsMush!.seed);
    // 杀/放/散点事件记录（cleanup 第二循环）——与 dump 侧 vanilla kill 集对拍
    const ev: string[] = [];
    const t19 = new Uint16Array(load(19, 'typ').buffer.slice(0));
    const a19 = load(19, 'act');
    const t20v = new Uint16Array(load(20, 'typ').buffer.slice(0));
    const a20v = load(20, 'act');
    const g3 = globalThis as { __swMushEv?: (s: string) => void };
    g3.__swMushEv = (s) => { if (ev.length < 4000) ev.push(s); };
    try {
      runMushroomPass(st, rng, gsMush!);
    } finally {
      g3.__swMushEv = undefined;
    }
    console.log(`Mushroom draws=${box.n} (vanilla 4532389, diff=${box.n - 4532389})`);
    diff(st, 20, 'Mushroom vs dump020');
    console.log(`cleanup事件(前30): ${ev.slice(0, 30).join(' ')}`);
    // vanilla kill 集：a19=1→a20=0 且 t20=0（ShroomPatch 腔挖保留幽灵 type，type=0 的失活=KillTile）
    const vanKills: string[] = [];
    for (let i = 0; i < W * H; i++) {
      if (a19[i] && !a20v[i] && t20v[i] === 0 && t19[i] !== 0) vanKills.push(`(${i % W},${(i / W) | 0})t${t19[i]}`);
    }
    const vanHisto = new Map<string, number>();
    for (const k of vanKills) { const t = /t(\d+)/.exec(k)![1]!; vanHisto.set(t, (vanHisto.get(t) ?? 0) + 1); }
    console.log(`vanilla kill 数=${vanKills.length} 类型直方图=${JSON.stringify([...vanHisto.entries()])}`);
    const jsKillSeq = ev.filter((s) => s[0] === 'K').map((s) => s.slice(1));
    const vanSet = new Set(vanKills.map((s) => s.split(')')[0] + ')'));
    // 首个 js-only kill（此前所有 kill 都在 van 集内 = 分歧点）
    let firstBad = -1;
    for (let k = 0; k < jsKillSeq.length; k++) {
      const c = jsKillSeq[k]!.split(')')[0] + ')';
      if (!vanSet.has(c)) { firstBad = k; break; }
    }
    console.log(`js kill 序数=${jsKillSeq.length}; 首个js-only kill 序号=${firstBad} ${firstBad >= 0 ? jsKillSeq[firstBad] : ''}`);
    console.log(`  此前 js kills: ${jsKillSeq.slice(Math.max(0, (firstBad < 0 ? jsKillSeq.length : firstBad) - 6), firstBad < 0 ? jsKillSeq.length : firstBad).join(' ')}`);
    if (firstBad >= 0) {
      const m = /\((\d+),(\d+)\)/.exec(jsKillSeq[firstBad]!)!;
      const bx = +m[1]!, by = +m[2]!;
      // 分歧点邻域 3×3：dump019(入口)/dump020(van 出口)/JS 出口 三方
      const rows: string[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        let r19 = '', r20 = '', rjs = '';
        for (let dx = -2; dx <= 2; dx++) {
          const i = (by + dy) * W + bx + dx;
          r19 += `${t19[i] ?? '?'}${a19[i] ? '*' : '.'} `;
          r20 += `${t20v[i] ?? '?'}${a20v[i] ? '*' : '.'} `;
          let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
          rjs += `${jT}${st.flags[i] ? '*' : '.'} `;
        }
        rows.push(`y${by + dy}: 19[${r19}] 20[${r20}] js[${rjs}]`);
      }
      console.log(`分歧点(${bx},${by}) 5×5（* = active）:\n  ` + rows.join('\n  '));
      // 邻格在 ev 中的最近事件
      console.log('  前后事件窗:', ev.slice(Math.max(0, ev.findIndex((s) => s === `K${jsKillSeq[firstBad]}`) - 10), ev.findIndex((s) => s === `K${jsKillSeq[firstBad]}`) + 6).join(' '));
    }
    // 行主序首个 diff 格 5×5（入口/原版出口/JS 出口）
    {
      const w20v = new Uint16Array(load(20, 'wal').buffer.slice(0));
      const firstCells: Array<[number, number]> = [];
      for (let i = 0; i < W * H && firstCells.length < 3; i++) {
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        const dA = (st.flags[i] !== 0) !== (a20v[i] !== 0);
        if (jT !== t20v[i] || dA || st.wall[i] !== w20v[i]) {
          firstCells.push([i % W, (i / W) | 0]);
        }
      }
      for (const [bx, by] of firstCells) {
        const rows: string[] = [];
        for (let dy = -2; dy <= 2; dy++) {
          let r19 = '', r20 = '', rjs = '';
          for (let dx = -2; dx <= 2; dx++) {
            const i = (by + dy) * W + bx + dx;
            r19 += `${t19[i] ?? '?'}${a19[i] ? '*' : '.'} `;
            r20 += `${t20v[i] ?? '?'}${a20v[i] ? '*' : '.'} `;
            let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
            rjs += `${jT}${st.flags[i] ? '*' : '.'} `;
          }
          rows.push(`y${by + dy}: 19[${r19}] 20[${r20}] js[${rjs}]`);
        }
        console.log(`首diff格(${bx},${by}) 5×5:\n  ` + rows.join('\n  '));
        // 该格附近（±3 列内）的 ev 事件
        const near = ev.filter((s) => { const m = /\((\d+),(\d+)\)/.exec(s); return m && Math.abs(+m[1]! - bx) <= 3 && Math.abs(+m[2]! - by) <= 3; });
        console.log(`  邻域事件(${near.length}): ${near.slice(0, 30).join(' ')}`);
      }
    }
  }

  // ── C) #29 Corruption：dump028 → runCorruptionPass → dump029
  {
    const st = buildStore(28);
    const { rng, box } = countedRng(gsCor!.seed);
    const marks: Array<[string, number]> = [];
    const g2 = globalThis as { __swCorMark?: (s: string) => void };
    g2.__swCorMark = (s) => { marks.push([s, box.n]); };
    try {
      runCorruptionPass(st, rng, gsCor!);
    } finally {
      g2.__swCorMark = undefined;
    }
    console.log(`Corruption draws=${box.n} (vanilla 5128077, diff=${box.n - 5128077})`);
    let prev = 0;
    for (const [lab, n] of marks) { console.log(`  mark ${lab.padEnd(28)} @${n} (+${n - prev})`); prev = n; }
    diff(st, 29, 'Corruption vs dump029');
    console.log('evilZones=', JSON.stringify(gsCor!.evilZones));
    // 足迹分析：vanilla（dump029 vs dump028）与 JS 各自的改动列剖
    const t28 = new Uint16Array(load(28, 'typ').buffer.slice(0));
    const w28 = new Uint16Array(load(28, 'wal').buffer.slice(0));
    const t29 = new Uint16Array(load(29, 'typ').buffer.slice(0));
    const w29 = new Uint16Array(load(29, 'wal').buffer.slice(0));
    const colProf = (fn: (i: number) => boolean, tag: string) => {
      const cols = new Int32Array(W);
      for (let x = 600; x < 1500; x++) {
        let c = 0;
        for (let y = 194; y < 700; y++) { const i = y * W + x; if (fn(i)) c++; }
        cols[x] = c;
      }
      const trunks: string[] = [];
      let run = 0;
      for (let x = 600; x < 1500; x++) {
        if (cols[x]! >= 30) run++;
        else { if (run > 0) trunks.push(`${x - run}-${x - 1}`); run = 0; }
      }
      if (run > 0) trunks.push(`${1500 - run}-1499`);
      console.log(`  ${tag} trunk列(≥30格 y194-700): ${trunks.join(' ')}`);
    };
    colProf((i) => t29[i] !== t28[i] || w29[i] !== w28[i], 'van(029vs028)');
    colProf((i) => {
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      return jT !== t28[i] || st.wall[i] !== w28[i];
    }, 'js(vs028)');
  }
}, 480000);

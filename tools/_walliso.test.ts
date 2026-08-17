// 一次性：墙家族横扫隔离重放（#39 Clean_Up_Dirt / #41 Dirt_Rock_Wall_Runner /
// #46 Jungle_Temple / #47 Hives / #67 Cave_Walls）。
//   dump 输入直构（含管线时点 liquidType 真值注入）→ pass → 掷数对拍 passchain FNV
//   定标 N + 四数组对拍 dump 输出。gs 经 __swWallCap 探针钩（pass 头）从真管线捕获。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runCleanupPass } from '../src/world/gen/vanilla/CleanupPass';
import { runDirtRockWallRunnerPass } from '../src/world/gen/vanilla/DirtRockWallRunnerPass';
import { runTemplePass } from '../src/world/gen/vanilla/TemplePass';
import { runBeehivePass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runCaveWallsPass } from '../src/world/gen/vanilla/CaveWallsPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { GENERAL_PLACEMENT_FORBID, canPlaceStructure } from '../src/world/gen/vanilla/GenState';
import { solidTile as solidTileHB } from '../src/world/gen/vanilla/HalfBrickPass';
import { UnifiedRandom } from '../src/core/rng';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const NAMES: Record<number, string> = {
  38: 'Shimmer', 39: 'Clean_Up_Dirt', 40: 'Pyramids', 41: 'Dirt_Rock_Wall_Runner',
  45: 'Wet_Jungle', 46: 'Jungle_Temple', 47: 'Hives', 48: 'Jungle_Chests',
  66: 'Temple', 67: 'Cave_Walls',
};
// passchain_x86.txt 第 6 列（pass 末 Main.rand StreamHash）
const CHAIN: Record<number, string> = {
  39: '6ddb2d93', 41: '79f00caf', 46: '559cfca6', 47: '973b4c81', 67: 'd95ed054',
};
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

const liqSnap = new Map<string, Uint8Array>();
// pass66 末 half/slope/inActive 通道（管线时点快照——dump 四通道盲区,SolidTile 的
// 半砖/斜面/致动门全靠它,#67 countTiles 门翻根因;vanilla exe 重跑世界≠x86 基准）
let cw66: { half: Uint8Array; slope: Uint8Array; inact: Uint8Array } | null = null;
function buildStore(idx: number, tag: string): TileStore {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  const lt = liqSnap.get(tag) ?? null;
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;   // 幽灵 type 照抄（dump typ 含 inactive ghost）
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = lt ? lt[i] ?? 0 : (l[i]! > 0 ? 1 : 0);
    if (cw66 && tag === 'cavewalls') {
      st.half[i] = cw66.half[i];
      st.slope[i] = cw66.slope[i];
      st.wire[i] = cw66.inact[i] ? 32 : 0;
    }
  }
  return st;
}

function diff(st: TileStore, idx: number, label: string, maxPairs = 12) {
  const t = new Uint16Array(load(idx, 'typ').buffer.slice(0));
  const a = load(idx, 'act');
  const w = new Uint16Array(load(idx, 'wal').buffer.slice(0));
  const l = load(idx, 'liq');
  let typ = 0, act = 0, wal = 0, liq = 0;
  const pairs = new Map<string, number>();
  const regs = new Map<string, number>();
  const samples: string[] = [];
  for (let i = 0; i < W * H; i++) {
    let jT = st.type[i];
    if (jT !== 0) jT = SHEET[jT] ?? -1;
    const dT = jT !== t[i], dA = (st.flags[i] !== 0) !== (a[i] !== 0), dW = st.wall[i] !== w[i], dL = st.liquid[i] !== l[i];
    if (!(dT || dA || dW || dL)) continue;
    if (dT) typ++; if (dA) act++; if (dW) { wal++; pairs.set(`W${st.wall[i]}>${w[i]}`, (pairs.get(`W${st.wall[i]}>${w[i]}`) ?? 0) + 1); }
    if (dL) liq++;
    const x = i % W, y = (i / W) | 0;
    regs.set(`x${(x / 200) | 0}y${(y / 200) | 0}`, (regs.get(`x${(x / 200) | 0}y${(y / 200) | 0}`) ?? 0) + 1);
    if (samples.length < 8) samples.push(`(${x},${y})t${jT}>${t[i]}a${st.flags[i] ? 1 : 0}>${a[i]}W${st.wall[i]}>${w[i]}L${st.liquid[i]}>${l[i]}`);
  }
  console.log(`${label}: typ=${typ} act=${act} wal=${wal} liq=${liq}`);
  console.log('  pairs:', JSON.stringify([...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, maxPairs)));
  console.log('  regions:', JSON.stringify([...regs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6)));
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

/** 暴力定标：fresh(seed) 消耗 N 次后 StreamHash == want（上限 hi） */
function calibrateN(seed: number, want: string, hi = 3_000_000): number {
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
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

const gsCap = new Map<string, GenState>();
// 模块级：D) temple footprint 段（独立 it）也要读——曾声明在 A) 段 it 体内 →
// `gsPristine is not defined` ReferenceError（W 批备案的 rig 断裂,2026-08-17 修）
const gsPristine = new Map<string, GenState>();
const ONLY = (process.env.SW_WALL_ONLY ?? '').split(',').filter(Boolean);

(RUN ? it : it.skip)('wall-family isolated replay', async () => {
  // ── A) 真管线捕获 gs + liquidType（五个 pass 头）
  const g0 = globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void };
  g0.__swWallCap = (tag, gs, st) => {
    if (gsPristine.has(tag)) return;
    gsPristine.set(tag, cloneGs(gs));
    gsCap.set(tag, cloneGs(gs));
    try {
      writeFileSync(`/tmp/sw-wall-liq-${tag}.bin`, st.liquidType);
      // half/slope/inActive 通道（管线时点真值——vanilla dump 四通道盲区;vanilla
      //   侧 exe 重跑世界不等于 x86 基准世界(arm64/x86_64 FP 分歧),故取管线快照）
      writeFileSync(`/tmp/sw-wall-half-${tag}.bin`, st.half);
      writeFileSync(`/tmp/sw-wall-slope-${tag}.bin`, st.slope);
      const inact = new Uint8Array(st.wire.length);
      for (let q = 0; q < st.wire.length; q++) inact[q] = (st.wire[q] & 32) !== 0 ? 1 : 0;
      writeFileSync(`/tmp/sw-wall-inact-${tag}.bin`, inact);
    } catch { /* ignore */ }
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0, onWorldPartial: () => { } });
  } catch (e) {
    console.log('pipeline EX(忽略):', String(e).slice(0, 160));
  } finally {
    g0.__swWallCap = undefined;
  }
  for (const tag of ['cleanup', 'dirtrock', 'temple', 'beehive', 'cavewalls']) {
    liqSnap.set(tag, readFileSync(`/tmp/sw-wall-liq-${tag}.bin`));
  }
  try {
    cw66 = {
      half: new Uint8Array(readFileSync('/tmp/sw-wall-half-cavewalls.bin').buffer.slice(0)),
      slope: new Uint8Array(readFileSync('/tmp/sw-wall-slope-cavewalls.bin').buffer.slice(0)),
      inact: new Uint8Array(readFileSync('/tmp/sw-wall-inact-cavewalls.bin').buffer.slice(0)),
    };
    console.log('cw66 half/slope/inact loaded (pipeline snapshot)');
  } catch { console.log('cw66 缺失——cavewalls 重放半砖/斜面盲'); }
  console.log('captured:', [...gsCap.keys()], 'seed=', gsCap.get('cleanup')!.seed);

  // ── B) FNV 定标原版掷数
  const seed = gsCap.get('cleanup')!.seed;
  const cases: Array<{ tag: string; inIdx: number; outIdx: number; run: (st: TileStore, rng: RNG, gs: GenState) => void }> = [
    { tag: 'cleanup', inIdx: 38, outIdx: 39, run: (st, rng, gs) => runCleanupPass(st, rng, gs) },
    { tag: 'dirtrock', inIdx: 40, outIdx: 41, run: (st, rng, gs) => runDirtRockWallRunnerPass(st, rng, gs) },
    { tag: 'temple', inIdx: 45, outIdx: 46, run: (st, rng, gs) => runTemplePass(st, rng, gs) },
    { tag: 'beehive', inIdx: 46, outIdx: 47, run: (st, rng, gs) => runBeehivePass(st, rng, gs) },
    { tag: 'cavewalls', inIdx: 66, outIdx: 67, run: (st, rng, gs) => runCaveWallsPass(st, rng, gs) },
  ];
  if (!ONLY.length || ONLY.includes('cal')) {
    for (const c of cases) {
      const N = calibrateN(seed, CHAIN[c.outIdx]!);
      console.log(`calibrate pass${c.outIdx} (${c.tag}): vanilla N=${N}`);
    }
  }

  // ── C) 隔离重放
  const hv = new Map<string, number>();
  (globalThis as { __swHvStat?: (k: string, v?: number) => number }).__swHvStat = (k, v = 1) => { hv.set(k, (hv.get(k) ?? 0) + v); return hv.get(k)!; };
  const gMark = globalThis as { __swMark?: (s: string) => void };
  for (const c of cases) {
    if (ONLY.length && !ONLY.includes(c.tag)) continue;
    hv.clear();
    const st = buildStore(c.inIdx, c.tag);
    const gs = cloneGs(gsPristine.get(c.tag)!);
    if (!gs) { console.log(`!! gs 缺失 ${c.tag}`); continue; }
    const { rng, box } = countedRng(seed);
    // 段结构标记 → /tmp/wallq-js-<tag>.log（与 vanilla HVQProbe 的 /tmp/sw-wallq/hvq.log 对拍）
    const marks: string[] = [];
    gMark.__swMark = (s: string) => { marks.push(`${s} rng=${streamHashOf((rng as unknown as { ur: UnifiedRandom }).ur)} @${box.n}`); };
    let cwTr: string[] | null = null;
    if (c.tag === 'cavewalls') {
      cwTr = [];
      (globalThis as { __swCwTrace?: (s: string) => void }).__swCwTrace = (s) => { if (cwTr && cwTr.length < 4000) cwTr.push(s); };
    }
    if (c.tag === 'beehive') {
      const gP = globalThis as { __swPatchDiag?: (ox: number, oy: number, st: import('../src/world/TileStore').TileStore) => void };
      gP.__swPatchDiag = (ox, oy, st2) => {
        if (ox !== 4126 || oy !== 924) return;
        const out: string[] = [`PDIAG 4126,924:`];
        const a0 = st2.idx(ox, oy);
        out.push(`  anchor: active=${st2.flags[a0]} type=${st2.type[a0]} sheet=${TILE_DEFS[st2.type[a0]]?.vanilla?.sheet} solidTile=${solidTileHB(st2, ox, oy)}`);
        let ry = -1;
        for (let k = 0; k < 80 && oy + k < st2.h; k++) {
          const pi = st2.idx(ox, oy + k);
          if (st2.flags[pi] && [4126].length === 1) {
            // Conditions.IsSolid：active+tileSolid（粗查 genSolid 经 sheet 近似——此处用 TILE_DEFS.solid 近似 tileSolid）
            const d = TILE_DEFS[st2.type[pi]];
            if (d && d.solid) { ry = oy + k; break; }
          }
        }
        out.push(`  down: ry=${ry}`);
        if (ry >= 0) {
          ry += 2;
          const rows = (hR: number, vR: number, fn: (dx: number, dy: number) => void): void => {
            const rr = (hR + 1) * (hR + 1);
            for (let dy = -vR; dy <= vR; dy++) {
              const num2 = (hR / vR) * dy;
              const half = Math.min(hR, Math.trunc(Math.sqrt(rr - num2 * num2)));
              for (let dx = -half; dx <= half; dx++) fn(dx, dy);
            }
          };
          let solid = 0, mg = 0, gr = 0;
          rows(15, 15, (dx, dy) => {
            if (!st2.inBounds(ox + dx, ry + dy)) return;
            const i = st2.idx(ox + dx, ry + dy);
            if (!st2.flags[i]) return;
            const d = TILE_DEFS[st2.type[i]];
            if (!(d && d.solid && !d.platform && (st2.wire[i] & 32) === 0)) return;
            solid++;
            const sheet = TILE_DEFS[st2.type[i]]?.vanilla?.sheet ?? -1;
            if (sheet === 60 || sheet === 59) mg++;
            if (sheet === 60) gr++;
          });
          out.push(`  circle15: solid=${solid} mg=${mg} grass=${gr} ratio=${(mg / Math.max(1, solid)).toFixed(3)}`);
        }
        console.log(out.join('\n'));
      };
      const gD = globalThis as { __swHvDiag?: (x: number, y: number, st: import('../src/world/TileStore').TileStore, gs: GenState) => void };
      gD.__swHvDiag = (x, y, st2, gs2) => {
        if (x !== 3698 && x !== 4142) return;
        const lines: string[] = [`DIAG 3698,890:`];
        const i0 = st2.idx(x, y);
        lines.push(`  anchor: active=${st2.flags[i0]} type=${st2.type[i0]}`);
        // canPlace 两半边拆解
        const px0 = x - 50, py0 = y - 50, px1 = x + 50, py1 = y + 50;
        let hitRect = '';
        for (const r of gs2.protectedRects) {
          if (px0 < r.x1 && r.x0 < px1 && py0 < r.y1 && r.y0 < py1) { hitRect = `[${r.x0},${r.x1})x[${r.y0},${r.y1})`; break; }
        }
        lines.push(`  overlap: ${hitRect || '无'} (rects n=${gs2.protectedRects.length})`);
        const badHits: string[] = [];
        for (let cx = px0; cx < px1 && badHits.length < 10; cx++) {
          for (let cy = py0; cy < py1; cy++) {
            const ci = st2.idx(cx, cy);
            if (st2.flags[ci] && GENERAL_PLACEMENT_FORBID.has(st2.type[ci])) {
              badHits.push(`(${cx},${cy})t${st2.type[ci]}/sheet${TILE_DEFS[st2.type[ci]]?.vanilla?.sheet}`);
            }
            if (badHits.length >= 10) break;
          }
        }
        lines.push(`  blacklist: ${badHits.length ? badHits.join(' ') : '无'}`);
        // 土壤门（与 pass 完全同款：solidTile 语义）
        let solid = 0, mg = 0, gr = 0;
        const JG = TILE_BY_KEY['v_60_jungle_grass_block']!, MU = TILE_BY_KEY['mud']!;
        for (let dx = -15; dx <= 15; dx++) for (let dy = -15; dy <= 15; dy++) {
          if (dx * dx + dy * dy > 225) continue;
          if (!st2.inBounds(x + dx, y + dy)) continue;
          const ci = st2.idx(x + dx, y + dy);
          if (!solidTileHB(st2, x + dx, y + dy)) continue;
          solid++;
          if (st2.type[ci] === JG || st2.type[ci] === MU) mg++;
          if (st2.type[ci] === JG) gr++;
        }
        const cp = canPlaceStructure(gs2, { x0: x - 50, y0: y - 50, x1: x + 50, y1: y + 50 }, 0, st2);
        lines.push(`  canPlace: ${cp}`);
        lines.push(`  soil: solid=${solid} mg=${mg} grass=${gr} ratio=${(mg / Math.max(1, solid)).toFixed(3)}`);
        // vanilla 圆15枚举序对照（Shapes.Circle 行主序 j 外层）：同判不同序不影响计数,仅备查
        let solid2 = 0, mg2 = 0, gr2 = 0;
        for (let dy = -15; dy <= 15; dy++) {
          const half = Math.min(15, Math.trunc(Math.sqrt(225 - dy * dy)));
          for (let dx = -half; dx <= half; dx++) {
            if (!st2.inBounds(x + dx, y + dy)) continue;
            if (!solidTileHB(st2, x + dx, y + dy)) continue;
            solid2++;
            const ci = st2.idx(x + dx, y + dy);
            if (st2.type[ci] === JG || st2.type[ci] === MU) mg2++;
            if (st2.type[ci] === JG) gr2++;
          }
        }
        lines.push(`  soil-rowmajor: solid=${solid2} mg=${mg2} grass=${gr2} ratio=${(mg2 / Math.max(1, solid2)).toFixed(3)}`);
        console.log(lines.join('\n'));
      };
    }
    const t0 = Date.now();
    c.run(st, rng, gs);
    gMark.__swMark = undefined;
    (globalThis as { __swCwTrace?: unknown }).__swCwTrace = undefined;
    (globalThis as { __swHvDiag?: unknown }).__swHvDiag = undefined;
    (globalThis as { __swPatchDiag?: unknown }).__swPatchDiag = undefined;
    if (cwTr) { console.log('CWTRACE:'); for (const l of cwTr) console.log('  ' + l); }
    try { writeFileSync(`/tmp/wallq-js-${c.tag}.log`, marks.join('\n') + '\n'); } catch { /* ignore */ }
    const ms = Date.now() - t0;
    if (c.tag === 'beehive') {
      const jl: string[] = [];
      const { rng: r3, box: b3 } = countedRng(seed);
      (globalThis as { __swHvLog?: (s: string, n?: number) => void }).__swHvLog = (s) => { if (jl.length < 2000) jl.push(`${s}@${b3.n}`); };
      const vl = readFileSync('/tmp/sw-tm/probe.log', 'utf8').split('\n').filter((l) => /^(HIVE|TUN) /.test(l)).map((l) => l.replace(/ rng=.*/, ''));
      const st2 = buildStore(c.inIdx, c.tag);
      try { c.run(st2, r3, cloneGs(gsPristine.get(c.tag)!)); } finally { (globalThis as { __swHvLog?: unknown }).__swHvLog = undefined; }
      const vlt = vl.filter((l) => l.startsWith('TUN')).map((l) => l.replace('TUN ', ''));
      const jlt = jl.filter((l) => l.startsWith('TUN')).map((l) => l.replace('TUN ', '').replace(/@\d+$/, ''));
      console.log(`tunnels: js=${jlt.length} van=${vlt.length}`);
      const jlh = jl.filter((l) => l.startsWith('HIVE')).map((l) => l.replace('HIVE ', '').replace(/@\d+$/, ''));
      const vlh = vl.filter((l) => l.startsWith('HIVE') && !l.includes(',1 ')).map((l) => l.replace('HIVE ', ''));
      console.log(`hives: js=${jlh.length}`);
      console.log('js first20:', jlh.slice(0, 20).join(' '));
      const k30 = jl.findIndex((s) => s.startsWith('3058,519'));
      console.log('js 3058,519 attempt idx=', k30, k30 >= 0 ? jl.slice(Math.max(0, k30 - 3), k30 + 2).join(' ') : '');
      console.log('BIGWALKs:', jl.filter((s) => s.startsWith('BIGWALK')).slice(0, 6).join(' | '));
      const vanH = readFileSync('/tmp/sw-tm/probe.log', 'utf8').split('\n').filter((l) => l.startsWith('HIVE ')).map((l) => l.replace(/HIVE | rng=.*/g, ''));
      console.log('van first20:', vanH.slice(0, 20).join(' '));
      const pr = (gsCap.get('beehive') as unknown as { protectedRects?: Array<{ x0: number; y0: number; x1: number; y1: number }> }).protectedRects ?? [];
      console.log('js protectedRects n=', pr.length, ':', pr.slice(0, 30).map((r) => `[${r.x0},${r.x1}]x[${r.y0},${r.y1}]`).join(' '));
      let d1 = -1;
      for (let k = 0; k < Math.min(jlt.length, vlt.length); k++) if (jlt[k] !== vlt[k]) { d1 = k; break; }
      console.log(`first tunnel divergence #${d1}: js=${d1 >= 0 ? jlt[d1] : '(全等)'} van=${d1 >= 0 ? vlt[d1] : ''}`);
      for (let q = 0; q < Math.min(30, jlt.length); q++) console.log(`  t#${q}: js=${jlt[q]} van=${vlt[q] ?? '-'};`);
      let d2 = -1;
      for (let k = 0; k < Math.min(jlh.length, vlh.length); k++) if (jlh[k] !== vlh[k]) { d2 = k; break; }
      console.log(`first HIVE divergence #${d2}: js=${d2 >= 0 ? jlh[d2] : '(全等)'} van=${d2 >= 0 ? vlh[d2] : ''}`);
    }
    console.log(`\n===== [pass${c.outIdx}] ${c.tag} draws=${box.n} (${ms}ms)`, JSON.stringify([...hv.entries()]));
    diff(st, c.outIdx, `${c.tag} vs dump${String(c.outIdx).padStart(3, '0')}`);
    // ── C2) 段结构标记对拍（js marks vs vanilla hvq.log）
    try {
      const van = readFileSync('/tmp/sw-wallq/hvq.log', 'utf8').split('\n').filter(Boolean)
        .filter((l) => /^(PLACE|PLACEX|TUN|FOUT|FOUTX|STAND|PATCH|PATCHX|CWC|CWW2?|CWBEGIN|CWEND) /.test(l) || /^(PLACEX|FOUTX|PATCHX|CWBEGIN|CWEND)/.test(l));
      const want = c.tag === 'beehive' ? /^(PLACE|PLACEX|TUN|FOUT\b|FOUTX|STAND|PATCH|PATCHX)/ : /^(CWC|CWW2?\b|CWBEGIN|CWEND)/;
      const vanF = van.filter((l) => want.test(l));
      const jsF = marks.filter((l) => want.test(l));
      console.log(`marks: js=${jsF.length} van=${vanF.length} (van total lines=${van.length})`);
      let d = -1;
      for (let k = 0; k < Math.min(jsF.length, vanF.length); k++) if (jsF[k] !== vanF[k]) { d = k; break; }
      console.log(`first mark divergence #${d}${d < 0 ? ' (前缀全等)' : ''}`);
      if (d >= 0) {
        for (let q = Math.max(0, d - 4); q <= Math.min(Math.max(jsF.length, vanF.length) - 1, d + 3); q++) {
          console.log(`  #${q}: js=${jsF[q] ?? '-'} | van=${vanF[q] ?? '-'}`);
        }
      }
    } catch (e) { console.log('mark对拍 skip:', String(e).slice(0, 80)); }
  }
}, 480000);

// ── D) 神庙足迹对拍：JS 重放 226 足迹 bbox/列剖 vs vanilla dump046；分段掷数
(RUN ? it : it.skip)('temple footprint + segment marks', async () => {
  const gs = cloneGs(gsPristine.get('temple')!);
  const st = buildStore(45, 'temple');
  const { rng, box } = countedRng(gs.seed);
  const marks: Array<[string, number]> = [];
  (globalThis as { __swTmMark?: (s: string) => void }).__swTmMark = (s) => marks.push([s, box.n]);
  try {
    runTemplePass(st, rng, gs);
  } finally {
    (globalThis as { __swTmMark?: (s: string) => void }).__swTmMark = undefined;
  }
  console.log(`temple draws=${box.n} (vanilla 107941, diff=${box.n - 107941})`);
  // ── D2) 原版 seed+rooms 段逐字转写（纯 RNG，无地形依赖段 + 丛林草命中）对拍
  {
    const stIn = buildStore(45, 'temple');   // ★干净入口 store（上面 st 已被本 pass 污染）
    const r2 = new RNG(gs.seed);
    const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    let band = 0.25, fails = 0, giveups = 0, vsx = -1, vsy = -1;
    const T60 = REV.get(60)!;
    for (;;) {
      let yTop = Math.floor(gs.rockLevel);
      const yBot = H - 600;
      if (yTop > yBot - 1) yTop = yBot - 1;
      const y = r2.int(yTop, yBot - 1);
      const x = Math.floor(((r2.next() * band + 0.1) * -gs.dungeonSide + 0.5) * W);
      if (x >= 0 && x < W && y >= 0 && y < H) {
        const i = y * W + x;
        if (stIn.flags[i] && stIn.type[i] === T60) { vsx = x; vsy = y; break; }
      }
      if (fails++ > 1000000) {
        if (band === 0.35 && ++giveups > 10) break;
        band = Math.min(0.35, band + 0.05);
        fails = 0;
      }
    }
    const num2 = r2.int(10, 15);
    const vrooms: Array<{ x: number; y: number; w: number; h: number }> = [];
    let dir = r2.next() < 0.5 ? 1 : -1;
    const startDir = dir;
    let runLen = r2.int(1, 2);
    let runStep = 0;
    let cx = vsx, cy = vsy;
    for (let n = 0; n < num2; n++) {
      let overlap = -10;
      runStep++;
      const last = n === num2 - 1;
      let rect = { x: cx, y: cy, w: 0, h: 0 };
      let newDir = dir as 1 | -1;
      let rx = cx, ry = cy;
      let ok = false;
      for (let t = 0; t < 5000 && !ok; t++) {
        let rw = r2.int(25, 49);
        let rh = Math.min(r2.int(20, 34), rw);
        const baseY = cy;
        const uwCut = baseY + 70 >= (H - 200) - 10;
        if (last || uwCut) {
          const w0 = r2.int(55, 64), h0 = r2.int(45, 49);
          rw = Math.floor(w0 * 1.6);
          rh = Math.floor(Math.min(h0, w0) * 1.35);
          ry = baseY + r2.int(5, 9);
        }
        if (runStep > runLen) {
          ry = baseY + r2.int(rh + 1, rh + 2) + overlap;
          rx = cx + r2.int(-5, 5);
          newDir = -dir as 1 | -1;
        } else {
          rx = cx + (r2.int(rw + 1, rw + 2) + overlap) * dir;
          ry = baseY + r2.int(-5, 5);
        }
        rect = { x: rx - Math.floor(rw / 2), y: ry - Math.floor(rh / 2), w: rw, h: rh };
        ok = true;
        if (uwCut) break;
        for (const o of vrooms) {
          if (inter(rect, o)) ok = false;
          if (r2.int(0, 99) === 0) overlap++;
        }
      }
      vrooms.push(rect);
      if (runStep > runLen) { runLen++; runStep = 1; }
      dir = newDir;
      cx = rx; cy = ry;
    }
    console.log(`transcribe: seed=(${vsx},${vsy}) rooms=${vrooms.length}`);
    console.log('  van-ref rooms:', vrooms.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(' '));
    void startDir;
  }
  let prev = 0;
  for (const [lab, n] of marks) { console.log(`  mark ${lab.padEnd(20)} @${n} (+${n - prev})`); prev = n; }
  {
    const jp: string[] = [];
    (globalThis as { __swTmPath?: (s: string) => void }).__swTmPath = (s) => { if (jp.length < 500) jp.push(s); };
    try { runTemplePass(buildStore(45, 'temple'), new RNG(gs.seed), cloneGs(gs)); }
    finally { (globalThis as { __swTmPath?: unknown }).__swTmPath = undefined; }
    const vp = readFileSync('/tmp/sw-tm/probe.log', 'utf8').split('\n').filter((l) => l.startsWith('PATH ')).map((l) => /PATH (\S+) -> (\S+)/.exec(l)!.slice(1, 3).join('->'));
    console.log(`pather calls: js=${jp.length} van=${vp.length}`);
    let shown = 0;
    for (let k = 0; k < Math.max(jp.length, vp.length) && shown < 8; k++) {
      if (jp[k] !== vp[k]) { console.log(`  firstDiverge#${k}: js=${jp[k]} van=${vp[k]}`); shown++; if (shown === 1) { for (let q = Math.max(0, k - 3); q <= k + 2; q++) console.log(`    ctx#${q}: js=${jp[q] ?? '-'} van=${vp[q] ?? '-'}`); } }
    }
    if (!shown) console.log('  pather 序列全等');
  }
  {
    const got: Array<{ x: number; y: number; w: number; h: number }> = [];
    let jsx = -1, jsy = -1;
    (globalThis as { __swTmRooms?: (r: Array<{ x: number; y: number; w: number; h: number }>, sx: number, sy: number) => void }).__swTmRooms = (r, sx2, sy2) => { got.push(...r); jsx = sx2; jsy = sy2; };
    try { runTemplePass(buildStore(45, 'temple'), new RNG(gs.seed), cloneGs(gs)); }
    finally { (globalThis as { __swTmRooms?: unknown }).__swTmRooms = undefined; }
    console.log(`js: seed=(${jsx},${jsy}) rooms=${got.length}`);
    console.log('  js rooms:', got.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(' '));
  }
  // JS 226 足迹
  let jx0 = 1e9, jx1 = -1, jy0 = 1e9, jy1 = -1, jn = 0;
  for (let i = 0; i < W * H; i++) {
    if (st.flags[i] && (SHEET[st.type[i]] ?? -1) === 226) {
      const x = i % W, y = (i / W) | 0; jn++;
      if (x < jx0) jx0 = x; if (x > jx1) jx1 = x; if (y < jy0) jy0 = y; if (y > jy1) jy1 = y;
    }
  }
  console.log(`JS temple 226: n=${jn} bbox=${jx0},${jx1},${jy0},${jy1} (vanilla 17348 @ 3456,3667,579,732)`);
  // 行主序首个 diff 与前 5 个 diff 格 5×5
  const t46 = new Uint16Array(load(46, 'typ').buffer.slice(0));
  const a46 = load(46, 'act');
  const w46 = new Uint16Array(load(46, 'wal').buffer.slice(0));
  const shown: Array<[number, number]> = [];
  for (let i = 0; i < W * H && shown.length < 4; i++) {
    let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
    if (jT !== t46[i] || (st.flags[i] !== 0) !== (a46[i] !== 0) || st.wall[i] !== w46[i]) shown.push([i % W, (i / W) | 0]);
  }
  {
    const tp = new Map<string, number>();
    for (let i = 0; i < W * H; i++) {
      let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
      const dA = (st.flags[i] !== 0) !== (a46[i] !== 0);
      if (dA) tp.set(`a${st.flags[i] ? 1 : 0}>${a46[i]}@t${jT}/v${t46[i]}`, (tp.get(`a${st.flags[i] ? 1 : 0}>${a46[i]}@t${jT}/v${t46[i]}`) ?? 0) + 1);
      if (jT !== t46[i] && !dA) tp.set(`ghost t${jT}/v${t46[i]}`, (tp.get(`ghost t${jT}/v${t46[i]}`) ?? 0) + 1);
    }
    console.log('  typair:', JSON.stringify([...tp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
    const wcells: string[] = [];
    for (let i = 0; i < W * H && wcells.length < 14; i++) {
      if (st.wall[i] === 87 && w46[i] === 64) wcells.push(`(${i % W},${(i / W) | 0})a${st.flags[i]}t${SHEET[st.type[i]] ?? -1}`);
    }
    console.log('  W87>64 cells:', wcells.join(' '));
  }
  for (const [bx, by] of shown) {
    const rows: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      let rv = '', rj = '';
      for (let dx = -2; dx <= 2; dx++) {
        const i = (by + dy) * W + bx + dx;
        rv += `${t46[i] ?? '?'}${a46[i] ? '*' : '.'}w${w46[i]} `;
        let jT = st.type[i]; if (jT !== 0) jT = SHEET[jT] ?? -1;
        rj += `${jT}${st.flags[i] ? '*' : '.'}w${st.wall[i]} `;
      }
      rows.push(`y${by + dy}: van[${rv}] js[${rj}]`);
    }
    console.log(`diff(${bx},${by}):\n  ` + rows.join('\n  '));
  }
}, 480000);

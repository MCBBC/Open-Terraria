// 一次性诊断（033→053 逐 pass 隔离重放）：把 dump032..052 原版四通道(+新 half/slope
// /lty)灌入重放 store，逐 pass 单独跑 JS 实现对拍下一边界 dump——每边界重新灌入
// （无累积漂移），检验各 pass 在【原版输入】上的实现纯度。dungeon 残差（032 起
// 1.5k）被此法隔离——若 033 重放干净则证明 20k 漂移=地牢输入驱动而非 pass 实现 bug。
// 用法：cd game && SW_C33=1 npx vitest run tools/_c33replay.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMountainCavesPass } from '../src/world/gen/vanilla/MountCavesPass';
import { runBeachesPass, runBeachDecorPass } from '../src/world/gen/vanilla/BeachPass';
import { runGemsPass } from '../src/world/gen/vanilla/ShiniesPass';
import { runGravitatingSandPass } from '../src/world/gen/vanilla/GravitatingSandPass';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runShimmerPass } from '../src/world/gen/vanilla/ShimmerPass';
import { runCleanupPass } from '../src/world/gen/vanilla/CleanupPass';
import { runPyramidPass, runWetJunglePass } from '../src/world/gen/vanilla/StructuresPass';
import { runDirtRockWallRunnerPass } from '../src/world/gen/vanilla/DirtRockWallRunnerPass';
import { runLivingTreesPass, runLivingTreeWallsPass } from '../src/world/gen/vanilla/LivingTreePass';
import { runAltarsPass } from '../src/world/gen/vanilla/CorruptionPass';
import { runTemplePass } from '../src/world/gen/vanilla/TemplePass';
import { runBeehivePass } from '../src/world/gen/vanilla/HiveSpiderPass';
import { runJungleShrinePass } from '../src/world/gen/vanilla/JungleShrinePass';
import { runRemoveSurfaceWaterAboveSandPass } from '../src/world/gen/vanilla/WaterIcePasses';
import { runOasisPass } from '../src/world/gen/vanilla/OasisPass';
import { runSmoothWorldPass } from '../src/world/gen/vanilla/HalfBrickPass';

const RUN = process.env.SW_C33 === '1';
const VG = process.env.SW_C33_VG ?? '/tmp/sw-num4/van_x86_g';
const G2 = process.env.SW_C33_G2 ?? '/tmp/sw-slp/g';   // 8 通道新 dump（half/slope/lty）
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}
const DUMPNAME = new Map<number, string>();
if (RUN) for (const f of readdirSync(VG))   // ★套件门(2026-09-02):夹具目录缺省不扫 {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
/** reseed ▶label → 该时点 state 的 dump idx（与 _slotdif2 同表，截到重放窗） */
const LABEL2DUMP = new Map<string, number>([
  ['MountainCaveOpenings', 32], ['BeachesAndOceanCleanup', 33], ['Gems', 34], ['OceanCaves', 36],
]);
/** JS 槽末 → dump idx（重放窗内） */
const SLOT_END = new Map<number, number>([
  [3, 35], [5, 37], [6, 38], [7, 39], [8, 48], [9, 49], [10, 50], [11, 51], [12, 52], [13, 53],
]);

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
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

interface Snap { frameX: Uint16Array; frameY: Uint16Array; liqType: Uint8Array; half: Uint8Array; slope: Uint8Array }

(RUN ? it : it.skip)('isolated per-pass replay 033..053 on vanilla grids', async () => {
  // ① 全量 JS 生成：抓 032 点 gs 快照 + 各边界 frame/liquidType/half/slope 快照
  const snaps = new Map<number, Snap>();
  let gs0: GenState | null = null;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l].match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  let liveStore: TileStore | null = null;
  const snapOf = (): Snap | null => {
    const st = liveStore;
    if (!st) return null;
    return { frameX: st.frameX.slice(), frameY: st.frameY.slice(), liqType: st.liquidType.slice(), half: st.half.slice(), slope: st.slope.slice() };
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_c33replay')) {
          const lab = labelOf(m[1], Number(m[2]));
          const idx = LABEL2DUMP.get(lab);
          if (idx !== undefined && !snaps.has(idx)) {
            const sn = snapOf();
            if (sn) snaps.set(idx, sn);
            if (lab === 'MountainCaveOpenings') gs0 = cloneGs(lastGenState()!);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: '9293480', evil: 0,
      onWorldPartial: (w, i) => {
        liveStore = w.store as never as TileStore;
        const idx = SLOT_END.get(i);
        if (idx !== undefined && !snaps.has(idx)) {
          const sn = snapOf();
          if (sn) snaps.set(idx, sn);
        }
      },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!gs0) throw new Error('032 gs capture failed');
  console.log(`boundary snaps: ${[...snaps.keys()].sort((a, b) => a - b).join(',')} (need 32..52 除 40-47 由 pass 输入侧快照补)`);

  // dump 加载
  interface Grids { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; half?: Uint8Array; slope?: Uint8Array; lty?: Uint8Array }
  const loadDump = (idx: number, withHs: boolean): Grids => {
    const pre = `${VG}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
    const g: Grids = { typ: le16(`${pre}.typ`), act: readFileSync(`${pre}.act`), wal: le16(`${pre}.wal`), liq: readFileSync(`${pre}.liq`) };
    if (withHs) {
      const p2 = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
      if (existsSync(`${p2}.half`)) { g.half = readFileSync(`${p2}.half`); g.slope = readFileSync(`${p2}.slope`); g.lty = readFileSync(`${p2}.lty`); }
    }
    return g;
  };
  const build = (idx: number): TileStore => {
    const g = loadDump(idx, true);
    const fallback = [...snaps.keys()].filter((k) => k < idx).sort((a, b) => b - a)[0];
    const sn = snaps.get(idx) ? idx : fallback;
    if (sn === undefined) throw new Error(`build(${idx}): 无可用快照 (keys=${[...snaps.keys()].join(',')})`);
    const s = snaps.get(sn)!;
    const rs = new TileStore(W, H);
    for (let i = 0; i < N; i++) {
      rs.flags[i] = g.act[i] ? 1 : 0;
      rs.type[i] = g.act[i] ? (REV.get(g.typ[i]!) ?? 0) : 0;
      rs.wall[i] = g.wal[i]!;
      rs.liquid[i] = g.liq[i]!;
      rs.liquidType[i] = g.lty ? g.lty[i]! : s.liqType[i]!;
      rs.half[i] = g.half ? g.half[i]! : s.half[i]!;
      rs.slope[i] = g.slope ? g.slope[i]! : s.slope[i]!;
      rs.frameX[i] = s.frameX[i]!;
      rs.frameY[i] = s.frameY[i]!;
    }
    if (sn !== idx) console.log(`  (build ${idx}: half/slope/lty 落新 dump, frame/liqType 借 ${sn} 快照)`);
    return rs;
  };
  const cmp = (tag: string, idx: number, st: TileStore): string => {
    const g = loadDump(idx, false);
    let dT = 0, dA = 0, dW = 0, dL = 0, first = '';
    const pair = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const va = g.act[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; if (!first) first = `(${i % W},${Math.floor(i / W)})`; }
      const vt = va ? g.typ[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt !== jt) { dT++; if (!first) first = `(${i % W},${Math.floor(i / W)})`; const k = `${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
      if (g.wal[i]! !== st.wall[i]!) dW++;
      if (g.liq[i]! !== st.liquid[i]!) dL++;
    }
    const top = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => `${k}×${c}`).join(' ');
    return `${String(idx).padStart(3)} ${DUMPNAME.get(idx)} ← ${tag.padEnd(20)} T=${String(dT).padStart(6)} A=${String(dA).padStart(6)} W=${String(dW).padStart(5)} L=${String(dL).padStart(5)} ${dT || dA || dW || dL ? '✗ ' + first + ' ' + top : '✓'}`;
  };

  // ② 逐 pass 隔离重放
  const chests: never[] = [];
  const lines: string[] = [];
  // SW_C33_XWIN="x0:x1"：只统计该 x 窗内的差（山丘区域隔离）
  const xwin = process.env.SW_C33_XWIN ? (process.env.SW_C33_XWIN!.split(':').map(Number) as [number, number]) : null;
  const cmpWin = xwin
    ? (tag: string, idx: number, st: TileStore): string => {
        const g = loadDump(idx, false);
        let dT = 0, dA = 0, first = '';
        const pair = new Map<string, number>();
        for (let y = 0; y < H; y++) for (let x = xwin[0]; x < xwin[1]; x++) {
          const i = y * W + x;
          const va = g.act[i]!, ja = st.flags[i]! & 1;
          const vt = va ? g.typ[i]! : 0;
          const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
          if (va !== ja) { dA++; if (!first) first = `(${x},${y})`; }
          if (vt !== jt) { dT++; if (!first) first = `(${x},${y})`; const k = `${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
        }
        const top = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => `${k}×${c}`).join(' ');
        return `${tag} 窗[${xwin[0]},${xwin[1]}) T=${dT} A=${dA} ${dT || dA ? '✗ ' + first + ' ' + top : '✓'}`;
      }
    : null;
  const replay = (inIdx: number, tag: string, fn: (st: TileStore, rng: RNG, gs: GenState) => void, post?: (st: TileStore, gsc: GenState) => void) => {
    const gsc = cloneGs(gs0!);
    const st = build(inIdx);
    const rng = new RNG(gs0.seed);
    fn(st, rng, gsc);
    post?.(st, gsc);
    lines.push(cmpWin ? cmpWin(tag, inIdx + 1, st) : cmp(tag, inIdx + 1, st));
  };
  // 山丘二分门（SW_C33_HILLS="a..b"：只重放山丘 a..b，定位首坏丘）
  const hillRange = process.env.SW_C33_HILLS;
  if (hillRange) {
    const [a, b] = hillRange.split('..').map(Number);
    console.log(`numMCaves=${gs0.numMCaves} mCave: ${Array.from({ length: gs0.numMCaves }, (_, q) => `(${gs0.mCaveX[q]},${gs0.mCaveY[q]})`).join(' ')}`);
    const cnt = Math.min(b, gs0.numMCaves - 1) - a + 1;
    const stReplay = { st: null as TileStore | null };
    replay(32, `MCaves[${a}..${b}]`, (st, rng, g) => {
      g.mCaveX = gs0.mCaveX.slice(a, a + cnt);
      g.mCaveY = gs0.mCaveY.slice(a, a + cnt);
      g.numMCaves = cnt;
      runMountainCavesPass(st, rng, g);
      stReplay.st = st;
    });
    // SW_C33_MAP="x0:x1:y0:y1"：逐格差图（v=vanilla j=js ·=等；# = 双方都清成空气但原本…）
    const mapWin = process.env.SW_C33_MAP;
    if (mapWin && stReplay.st) {
      const [mx0, mx1, my0, my1] = mapWin.split(':').map(Number);
      const g32 = loadDump(32, false), g33 = loadDump(33, false);
      console.log(`差图 x[${mx0},${mx1}) y[${my0},${my1}) —— 字符=vanilla33>js（. = 一致）`);
      for (let y = my0; y < my1; y++) {
        let row = '';
        for (let x = mx0; x < mx1; x++) {
          const i = y * W + x;
          const vt = g33.act[i] ? g33.typ[i] : 0;
          const jt = stReplay.st!.flags[i] ? (SHEET[stReplay.st!.type[i]!] ?? 9) : 0;
          row += vt === jt ? '.' : (vt === 0 ? 'J' : jt === 0 ? 'V' : 'X');
        }
        console.log(`${String(y).padStart(4)} ${row}`);
      }
      // 起点邻域输入态（dump032）
      const hx = gs0.mCaveX[a]!, hy = gs0.mCaveY[a]!;
      for (let dy = -2; dy <= 3; dy++) {
        const cells: string[] = [];
        for (let dx = -3; dx <= 3; dx++) {
          const i = (hy + dy) * W + hx + dx;
          cells.push(`${g32.act[i] ? g32.typ[i] : '·'}/w${g32.wal[i]}`);
        }
        console.log(`  in32 y${hy + dy}: ${cells.join(' ')}`);
      }
    }
    for (const l of lines) console.log(l);
    return;
  }
  replay(32, 'MountainCaveOpenings', (st, rng, g) => runMountainCavesPass(st, rng, g));
  replay(33, 'Beaches', (st, rng, g) => {
    runBeachesPass(st, rng, g);
    void g;
  });
  replay(34, 'Gems', (st, rng, g) => runGemsPass(st, rng, g));
  replay(35, 'GravitatingSand', (st, _r, g) => runGravitatingSandPass(st, g));
  replay(36, 'OceanCaves', (st, rng, g) => { void runOceanCavesPass(st, rng, g); });
  replay(37, 'Shimmer', (st, rng, g) => runShimmerPass(st, rng, g));
  replay(38, 'CleanUpDirt', (st, rng, g) => runCleanupPass(st, rng, g));
  replay(39, 'Pyramids', (st, rng, g) => runPyramidPass(st, rng, g, chests));
  replay(40, 'DirtRockWallRunner', (st, rng, g) => runDirtRockWallRunnerPass(st, rng, g));
  replay(41, 'LivingTrees', (st, rng, g) => runLivingTreesPass(st, rng, g, chests));
  replay(42, 'LivingTreeWalls', (st, _r, g) => runLivingTreeWallsPass(st, g));
  replay(43, 'Altars', (st, rng, g) => runAltarsPass(st, rng, g));
  replay(44, 'WetJungle', (st, rng, g) => runWetJunglePass(st, rng, g));
  replay(45, 'Temple', (st, rng, g) => { void runTemplePass(st, rng, g); });
  replay(46, 'Beehives', (st, rng, g) => runBeehivePass(st, rng, g));
  replay(47, 'JungleShrines', (st, rng, g) => { void runJungleShrinePass(st, rng, g); });
  replay(49, 'RemoveWaterSand', (st, _r, g) => runRemoveSurfaceWaterAboveSandPass(st, g));
  replay(50, 'Oasis', (st, rng, g) => runOasisPass(st, rng, g));
  replay(51, 'ShellPiles', (st, rng, g) => runBeachDecorPass(st, rng, g));
  replay(52, 'SmoothWorld', (st, rng, g) => runSmoothWorldPass(st, rng, g));

  for (const l of lines) console.log(l);
}, 900_000);

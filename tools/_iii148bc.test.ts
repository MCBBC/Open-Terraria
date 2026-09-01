// IIII112b 一次性窗口增量仪（clone 自 _iii144a 双锚反演，win #58→#59 埋箱窗）：
// JS 侧双锚 = ▶UndergroundHousesAndBuriedChests（基座，已证 #58 全绿）与
// ▶SurfaceChests（埋箱段末）；x86 侧 = G2 #058→#059。双侧窗内增量（act/type 合成
// 通道 + wal/liq/half/slope/lty）逐格分类：both-diff（行为差）/onlyX（JS 漏）/onlyJ
// （JS 多），并给行聚类 + pairs + 指定样点邻域逐格列。
// 用法：cd game && SW_I148=1 SW_I148_G2=$HOME/GoldenChains/golden-win \
//        SW_I148_OUT=/tmp/iii148-out npx vitest run tools/_iii148bc.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I148 === '1';
const G2 = process.env.SW_I148_G2 ?? '';
const SEED = process.env.SW_I148_SEED ?? '20260907';
const EVIL = Number(process.env.SW_I148_EVIL ?? -1);
const FLAGS = Object.fromEntries((process.env.SW_I148_FLAGS ?? 'worldIsFrozen')
  .split(',').filter(Boolean).map((f) => [f, true]));
const OUT = process.env.SW_I148_OUT ?? '/tmp/iii148-out';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);
const N = W * H;
const PROBE = (process.env.SW_I148_PROBE ?? '2947,352').split(';').map((s) => s.split(',').map(Number));

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface X8 { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array }
function x8(dir: string, idx: number, names: Map<number, string>): X8 {
  const pre = `${dir}/${String(idx).padStart(3, '0')}_${names.get(idx)}`;
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`),
  };
}
type Snap = {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array;
};
function snap(store: unknown): Snap {
  const st = store as Record<string, Uint8Array | Uint16Array>;
  const cp = <T extends Uint8Array | Uint16Array>(a: T): T => {
    const o = new a.constructor(a.length) as T;
    o.set(a);
    return o;
  };
  return {
    type: cp(st.type as Uint16Array), flags: cp(st.flags as Uint8Array),
    wall: cp(st.wall as Uint16Array), liquid: cp(st.liquid as Uint8Array),
    liquidType: cp(st.liquidType as Uint8Array), half: cp(st.half as Uint8Array),
    slope: cp(st.slope as Uint8Array),
  };
}
function cluster(src: Array<{ i: number; k: string }>): Array<{ y: number; x0: number; x1: number; n: number; k: string }> {
  const m = new Map<number, Array<{ x: number; k: string }>>();
  for (const { i, k } of src) {
    const y = (i / W) | 0, x = i % W;
    let arr = m.get(y);
    if (!arr) m.set(y, arr = []);
    arr.push({ x, k });
  }
  const out: Array<{ y: number; x0: number; x1: number; n: number; k: string }> = [];
  for (const [y, xs] of [...m.entries()].sort((p, q) => p[0] - q[0])) {
    xs.sort((p, q) => p.x - q.x);
    let x0 = xs[0]!.x, prev = xs[0]!.x, n = 1;
    const ks = new Map<string, number>([[xs[0]!.k, 1]]);
    for (let j = 1; j < xs.length; j++) {
      if (xs[j]!.x - prev <= 3) { prev = xs[j]!.x; n++; ks.set(xs[j]!.k, (ks.get(xs[j]!.k) ?? 0) + 1); continue; }
      out.push({ y, x0, x1: prev, n, k: [...ks.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}:${c}`).join(',') });
      x0 = xs[j]!.x; prev = xs[j]!.x; n = 1; ks.clear(); ks.set(xs[j]!.k, 1);
    }
    out.push({ y, x0, x1: prev, n, k: [...ks.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}:${c}`).join(',') });
  }
  return out.sort((a, b) => b.n - a.n);
}

(RUN ? it : it.skip)('iiiiii148 buried window dual-anchor increment', async () => {
  if (!G2) throw new Error('need SW_I148_G2');
  const names = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) names.set(Number(m[1]), m[2]);
  }
  const xA = x8(G2, 58, names), xB = x8(G2, 59, names);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (s: number): number => (s >= 0 ? s : 9999);

  class Aborted extends Error {}
  const snaps: Record<string, Snap> = {};
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let live: unknown = null;
  RNGp.reseed = function (this: unknown, s: number) {
    if (live) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii148bc')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'UndergroundHousesAndBuriedChests' && !snaps.A) snaps.A = snap(live);
          else if (lab === 'SurfaceChests' && !snaps.B) { snaps.B = snap(live); throw new Aborted(); }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: (w) => { if (!live) live = w.store; },
    });
  } catch (e) {
    // pass 级 wrapper 会把 Aborted 包进 cause 链，逐层解包
    let c: unknown = e;
    while (c instanceof Error && !(c instanceof Aborted)) c = (c as Error & { cause?: unknown }).cause;
    if (!(c instanceof Aborted)) throw e;
  } finally { RNGp.reseed = oReseed; }
  const A = snaps.A!, B = snaps.B!;

  // ── 增量提取（act/type 合成通道）──
  type Rec = { i: number; k: string };
  const xSet = new Map<number, string>();
  const jSet = new Map<number, string>();
  for (let i = 0; i < N; i++) {
    const a0 = xA.a[i]!, a1 = xB.a[i]!;
    const t0 = a0 ? xA.t[i]! : 0, t1 = a1 ? xB.t[i]! : 0;
    if (a0 !== a1 || t0 !== t1) xSet.set(i, `${a0}#${t0}>${a1}#${t1}`);
    const ja0 = A.flags[i] & 1, ja1 = B.flags[i] & 1;
    const jt0 = ja0 ? sh(SHEET[A.type[i]]) : 0;
    const jt1 = ja1 ? sh(SHEET[B.type[i]]) : 0;
    if (ja0 !== ja1 || jt0 !== jt1) jSet.set(i, `${ja0}#${jt0}>${ja1}#${jt1}`);
  }
  const onlyX: Rec[] = [], onlyJ: Rec[] = [];
  let bothSame = 0, bothDiff = 0;
  const pairX = new Map<string, number>(), pairJ = new Map<string, number>(), pairB = new Map<string, number>();
  for (const [i, xk] of xSet) {
    const jk = jSet.get(i);
    if (jk) {
      if (jk === xk) { bothSame++; continue; }
      bothDiff++;
      const key = `B x[${xk}] j[${jk}]`;
      pairB.set(key, (pairB.get(key) ?? 0) + 1);
    } else {
      onlyX.push({ i, k: xk });
      pairX.set(xk, (pairX.get(xk) ?? 0) + 1);
    }
  }
  for (const [i, jk] of jSet) {
    if (!xSet.has(i)) { onlyJ.push({ i, k: jk }); pairJ.set(jk, (pairJ.get(jk) ?? 0) + 1); }
  }
  // 窗内其他通道双侧增量是否同变（wall/liquid/half/slope/lty）
  function chanInc(vx: (x: X8) => Uint8Array | Uint16Array, jk: keyof Snap, xk: keyof X8): number {
    const bx = vx(xB), ax = vx(xA), bj = B[jk] as Uint8Array | Uint16Array, aj = A[jk] as Uint8Array | Uint16Array;
    if (!bx || !ax || !bj || !aj) throw new Error(`chanInc ${xk}/${jk}: bx=${!!bx} ax=${!!ax} bj=${!!bj} aj=${!!aj}`);
    let n = 0;
    for (let i = 0; i < N; i++) {
      const dx = bx[i] !== ax[i];
      const dj = bj[i] !== aj[i];
      if (dx !== dj) n++;
    }
    return n;
  }
  const walls = chanInc((x) => x.w, "wall", "w");
  const liqs = chanInc((x) => x.l, "liquid", "l");
  const hfs = chanInc((x) => x.hf, "half", "hf");
  const sls = chanInc((x) => x.sl, "slope", "sl");

  console.log(`[I148] win seed=${SEED} evil=${EVIL} flags=${JSON.stringify(FLAGS)}`);
  console.log(`[I148] 窗内增量格数: x86=${xSet.size} js=${jSet.size} both同=${bothSame} both异=${bothDiff}`);
  console.log(`[I148] onlyX=${onlyX.length} onlyJ=${onlyJ.length}`);
  console.log('[I148] 窗内其他通道"是否动过"分歧: wall=' + walls + ' liq=' + liqs + ' half=' + hfs + ' slope=' + sls);
  console.log('[I148] onlyX top12:', [...pairX.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log('[I148] onlyJ top12:', [...pairJ.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log('[I148] bothDiff top10:', [...pairB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, c]) => `${k}×${c}`).join(' '));
  console.log('[I148] onlyX clusters(top30):');
  for (const c of cluster(onlyX).slice(0, 30)) console.log(`   y=${c.y} x∈[${c.x0},${c.x1}] n=${c.n} ${c.k}`);
  console.log('[I148] onlyJ clusters(top30):');
  for (const c of cluster(onlyJ).slice(0, 30)) console.log(`   y=${c.y} x∈[${c.x0},${c.x1}] n=${c.n} ${c.k}`);
  // 样点邻域：双侧 #58→#59 终态逐格列（21×13 窗）
  for (const [px, py] of PROBE) {
    console.log(`[I148] probe (${px},${py}) 0=t,1=a,x=x86 j=js  [left..right]=${px - 10}..${px + 10}`);
    for (let y = py - 6; y <= py + 6; y++) {
      const rowX: string[] = [], rowJ: string[] = [];
      for (let x = px - 10; x <= px + 10; x++) {
        const i = y * W + x;
        rowX.push(`${xB.a[i] ? xB.t[i] : 0}${xB.l[i] ? '~' + xB.l[i] : ''}`);
        rowJ.push(`${(B.flags[i] & 1) ? sh(SHEET[B.type[i]]) : 0}${B.liquid[i] ? '~' + B.liquid[i] : ''}`);
      }
      console.log(`  y=${y} X[${rowX.join(',')}]`);
      console.log(`  y=${y} J[${rowJ.join(',')}]`);
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/win-bc.json`, JSON.stringify({
    xSetSize: xSet.size, jSetSize: jSet.size, bothSame, bothDiff,
    onlyXCount: onlyX.length, onlyJCount: onlyJ.length,
    chanDiv: { walls, liqs, hfs, sls },
    topPairOnlyX: [...pairX.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
    topPairOnlyJ: [...pairJ.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
    topPairBoth: [...pairB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16),
    clX: cluster(onlyX).slice(0, 400), clJ: cluster(onlyJ).slice(0, 400),
  }, null, 1));
  console.log(`[I148] report -> ${OUT}/win-bc.json`);
}, 900_000);

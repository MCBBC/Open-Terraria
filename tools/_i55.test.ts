// IIII55 批：FTW #62 SpiderCaves 段 / #65 Moss 段 残差归因仪。
// 原理：mile8 对拍框架的段级放大镜——以 reseed▶SpiderCaves（=x86 dump062 时点）与
// JS 槽末 18/19/20（=x86 dump063/064/065 时点）抓全库快照，然后
//   ① 各时点 vs G2 dump 逐通道差量（与 _mile8 数字互验）；
//   ② 相邻时点【变更集】（JS 与 x86 各自"本段改了什么格"），上游 #32 残差
//      在差分中天然对消；
//   ③ 变更集空间聚类（union-find + 桶哈希，GAP 内合并）→ 双侧组件匹配 →
//      落单组件 = 本族首次分歧点，输出报表 /tmp/iii55-out/i55-report.json。
// 用法: SW_I55=1 SW_I55_G2=/tmp/iii44-out/x86-ftw npx vitest run tools/_i55.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I55 === '1';
const G2 = process.env.SW_I55_G2 ?? '/tmp/iii44-out/x86-ftw';
const OUT = '/tmp/iii55-out';
const GAP = Number(process.env.SW_I55_GAP ?? 56);
const TOPN = Number(process.env.SW_I55_TOP ?? 36);
const SEED = process.env.SW_I55_SEED ?? '1671560105';   // ftw-w3 真值世界种子（rigv-ftw-win2 配方）
const FLAGS: Record<string, boolean> = { getGoodWorld: true };   // dotted 配方 1.1.1.4.<seed> ⇒ FTW
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

/** 快照域约定：act/typ 恒存（typ=vanilla sheet 域，含 ghost）；wal/liq/half/slope 存原值；
 *  lt 存【JS +1 基】原值——比较时统一折到「vanilla+1」域：js: liq>0?lt:0；x86: liq>0?lt+1:0 */
interface Snap {
  act: Uint8Array; typ: Uint16Array; wal: Uint16Array; liq: Uint8Array;
  hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array;
}
function snapOf(st: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}): Snap {
  const a = new Uint8Array(N), t = new Uint16Array(N), wl = new Uint16Array(N), l = new Uint8Array(N);
  const hf = new Uint8Array(N), sl = new Uint8Array(N), lt = new Uint8Array(N), ia = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    a[i] = ja;
    const sh = SHEET[st.type[i]!];
    t[i] = sh >= 0 ? sh : 9999;
    wl[i] = st.wall[i]!;
    l[i] = st.liquid[i]!;
    hf[i] = st.half[i]!;
    sl[i] = st.slope[i]!;
    lt[i] = st.liquidType[i]!;
    ia[i] = ((st.wire[i]! >>> 5) & 1);
  }
  return { act: a, typ: t, wal: wl, liq: l, hf, sl, lt, ia };
}

/** 快照落盘布局 v2：act(1)+typ(2)+wal(2)+liq(1)+hf(1)+sl(1)+lt(1)+ia(1)=10B/cell */
function writeSnap(tag: string, s: Snap): void {
  const out = Buffer.allocUnsafe(10 * N);
  Buffer.from(s.act.buffer).copy(out, 0);
  Buffer.from(s.typ.buffer).copy(out, N);
  Buffer.from(s.wal.buffer).copy(out, 3 * N);
  Buffer.from(s.liq.buffer).copy(out, 5 * N);
  Buffer.from(s.hf.buffer).copy(out, 6 * N);
  Buffer.from(s.sl.buffer).copy(out, 7 * N);
  Buffer.from(s.lt.buffer).copy(out, 8 * N);
  Buffer.from(s.ia.buffer).copy(out, 9 * N);
  writeFileSync(`${OUT}/snap-${tag}.bin`, out);
}
function readSnap(path: string): Snap {
  const b = readFileSync(path);
  const mkU16 = () => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteLength));
  // 统一拷到独立 buffer 防越界对齐问题
  const one = (off: number, len: number) => b.subarray(off, off + len).slice().buffer;
  return {
    act: new Uint8Array(one(0, N)),
    typ: new Uint16Array(one(N, 2 * N)),
    wal: new Uint16Array(one(3 * N, 2 * N)),
    liq: new Uint8Array(one(5 * N, N)),
    hf: new Uint8Array(one(6 * N, N)),
    sl: new Uint8Array(one(7 * N, N)),
    lt: new Uint8Array(one(8 * N, N)),
    ia: new Uint8Array(one(9 * N, N)),
  };
}

const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m) DUMPNAME.set(Number(m[1]), m[2]);
}
function chans(idx: number): Snap | null {
  const nm = DUMPNAME.get(idx);
  if (!nm) return null;
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  if (!existsSync(`${pre}.typ`)) return null;
  return {
    act: readFileSync(`${pre}.act`), typ: le16(`${pre}.typ`), wal: le16(`${pre}.wal`),
    liq: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}

/** 任一通道不同 ⇒ 掩码位。bit: A1 T2 W4 L8 Hf16 Sl32 Lt64 Ia128 */
function chg(a: Snap, b: Snap): Uint32Array {
  const m = new Uint32Array(N);
  let cnt = 0;
  for (let i = 0; i < N; i++) {
    let bits = 0;
    if (a.act[i] !== b.act[i]) bits |= 1;
    if (a.typ[i] !== b.typ[i]) bits |= 2;
    if (a.wal[i] !== b.wal[i]) bits |= 4;
    if (a.liq[i] !== b.liq[i]) bits |= 8;
    if (a.hf[i] !== b.hf[i]) bits |= 16;
    if (a.sl[i] !== b.sl[i]) bits |= 32;
    const la = a.liq[i] > 0 ? a.lt[i] : 0;
    const lb = b.liq[i] > 0 ? b.lt[i] : 0;
    if (la !== lb) bits |= 64;
    if (a.ia[i] !== b.ia[i]) bits |= 128;
    m[i] = bits;
    if (bits) cnt++;
  }
  console.log(`      changed=${cnt}`);
  return m;
}

interface Comp { id: number; n: number; minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; sA: number; sB: number }
function cluster(mA: Uint32Array, mB: Uint32Array, gap: number): Comps {
  interface Comps { both: Comp[]; onlyA: Comp[]; onlyB: Comp[] }
  const cellIdx: number[] = [];
  for (let i = 0; i < N; i++) if (mA[i] || mB[i]) cellIdx.push(i);
  const parent = new Int32Array(cellIdx.length);
  for (let k = 0; k < parent.length; k++) parent[k] = k;
  const find = (k: number): number => { while (parent[k] !== k) { parent[k] = parent[parent[k]]!; k = parent[k]!; } return k; };
  const uni = (ka: number, kb: number) => {
    ka = find(ka); kb = find(kb);
    if (ka !== kb) { if (ka > kb) { parent[ka] = kb; } else { parent[kb] = ka; } }
  };
  const B = 256;
  const buckets = new Map<string, number[]>();
  for (let k = 0; k < cellIdx.length; k++) {
    const idx = cellIdx[k]!;
    const key = `${((idx % W) / B) | 0}:${((((idx / W) | 0)) / B) | 0}`;
    const arr = buckets.get(key);
    if (arr) arr.push(k); else buckets.set(key, [k]);
  }
  for (let k = 0; k < cellIdx.length; k++) {
    const idx = cellIdx[k]!;
    const bx = ((idx % W) / B) | 0, by = (((idx / W) | 0) / B) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const arr = buckets.get(`${bx + ox}:${by + oy}`);
      if (!arr) continue;
      for (const q of arr) {
        if (q <= k) continue;
        const qi = cellIdx[q]!;
        const dx = (qi % W) - (idx % W), dy = ((qi / W) | 0) - ((idx / W) | 0);
        if (Math.abs(dx) <= gap && Math.abs(dy) <= gap) uni(k, q);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let k = 0; k < cellIdx.length; k++) {
    const r = find(k);
    const g = groups.get(r);
    if (g) g.push(k); else groups.set(r, [k]);
  }
  const comps: Comp[] = [];
  for (const [, ks] of groups) {
    const c: Comp = { id: comps.length, n: ks.length, minX: W, maxX: 0, minY: H, maxY: 0, cx: 0, cy: 0, sA: 0, sB: 0 };
    let sx = 0, sy = 0;
    for (const k of ks) {
      const idx = cellIdx[k]!;
      const x = idx % W, y = (idx / W) | 0;
      if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
      sx += x; sy += y;
      if (mA[idx]) c.sA++;
      if (mB[idx]) c.sB++;
    }
    c.cx = Math.round(sx / c.n); c.cy = Math.round(sy / c.n);
    comps.push(c);
  }
  comps.sort((a, b) => b.n - a.n);
  void unusedStub;
  return {
    both: comps.filter((c) => c.sA > 0 && c.sB > 0),
    onlyA: comps.filter((c) => c.sA > 0 && c.sB === 0),
    onlyB: comps.filter((c) => c.sB > 0 && c.sA === 0),
  };
}
const unusedStub = null;

(RUN ? it : it.skip)('IIII55 spider/moss segment attribution', async () => {
  const snaps = new Map<string, Snap>();
  const seenLabels = new Map<string, number>();

  // —— 抓点①:reseed▶SpiderCaves（state=蜘蛛 pass 前，≡dump062 时点）
  const srcCache = new Map<string, string[]>();
  function labelAt(file: string, line: number): string {
    let src = srcCache.get(file);
    if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return '';
  }
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (!snaps.has('pre_spider')) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1]!.includes('/core/rng') && !m[1]!.includes('_i55.')) {
          const lab = labelAt(m[1]!, Number(m[2]));
          seenLabels.set(lab, (seenLabels.get(lab) ?? 0) + 1);
          if (lab === 'SpiderCaves') {
            snaps.set('pre_spider', snaps.get('pre_spider') ?? (curStore ? snapOf(curStore) : null as never));
            console.log('[snap] pre_spider captured @', `${m[1]}:${m[2]}`);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };

  const spiderNestLog: string[] = [];
  const spiderCandLog: string[] = [];
  let curStore: Parameters<typeof snapOf>[0] | null = null;
  (globalThis as unknown as Record<string, unknown>).__swSpiderNest = (s: string) => { spiderNestLog.push(String(s)); };
  (globalThis as unknown as Record<string, unknown>).__swSpiderCand = (...a: unknown[]) => { spiderCandLog.push(a.join(',')); };

  await generateWorld({
    width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1, seedFlags: FLAGS,
    onWorldPartial: (w, i, pn) => {
      if (!curStore) curStore = w.store as never as typeof curStore;
      const CAPS: Array<[number, string, string]> = [
        [13, 'halfbrick', '半砖平滑'], [15, 'icefragile', '薄冰'],
        [16, 'wallvar', '洞穴墙变体'], [18, 'post_spider', '雕像宝箱'], [19, 'post_gem', '宝石洞'], [20, 'post_moss', '苔藓'],
      ];
      let doneExtra = false;
      for (const [si, tag, nm] of CAPS) {
        if (i === si && pn === nm && !snaps.has(tag)) {
          snaps.set(tag, snapOf(w.store as never));
          console.log(`[snap] ${tag} captured (${pn})`);
          doneExtra = true;
          break;
        }
      }
      void doneExtra;
      if (i === 18 && pn === '雕像宝箱' && !snaps.has('post_spider')) {
        snaps.set('post_spider', snapOf(w.store as never));
        console.log(`[snap] post_spider captured (slot ${i} ${pn})`);
      } else if (i === 19 && pn === '宝石洞' && !snaps.has('post_gem')) {
        snaps.set('post_gem', snapOf(w.store as never));
        console.log(`[snap] post_gem captured (slot ${i} ${pn})`);
      } else if (i === 20 && pn === '苔藓' && !snaps.has('post_moss')) {
        snaps.set('post_moss', snapOf(w.store as never));
        console.log(`[snap] post_moss captured (slot ${i} ${pn})`);
      }
    },
  });
  RNGp.reseed = oReseed;

  const pre = snaps.get('pre_spider');
  const postS = snaps.get('post_spider');
  const postG = snaps.get('post_gem');
  const postM = snaps.get('post_moss');
  if (!pre || !postS || !postG || !postM) throw new Error(`snapshot miss: pre=${!!pre} ps=${!!postS} pg=${!!postG} pm=${!!postM}`);

  const d62 = chans(62)!, d63 = chans(63)!, d64 = chans(64)!, d65 = chans(65)!;
  writeFileSync(`${OUT}/spider-nest.log`, spiderNestLog.join('\n'));
  writeFileSync(`${OUT}/spider-cand.log`, spiderCandLog.join('\n'));
  // ★快照落盘（离线重放用，v2 含 lt/ia）
  const dumpList: Array<[string, Snap | null]> = [
    ['halfbrick', snaps.get('halfbrick') ?? null], ['icefragile', snaps.get('icefragile') ?? null],
    ['wallvar', snaps.get('wallvar') ?? null], ['pre', pre], ['post_spider', postS], ['post_gem', postG], ['post_moss', postM],
  ];
  for (const [tag, jsSnap] of dumpList) {
    if (jsSnap) writeSnap(tag, jsSnap);
  }
  void postS; void postG; void postM;

  const report: Record<string, unknown> = { seed: SEED, flags: FLAGS, gap: GAP };
  for (const [tag, jsSnap, dmp] of [
    ['pre_spider', pre, d62], ['post_spider', postS, d63], ['post_gem', postG, d64], ['post_moss', postM, d65],
  ] as Array<[string, Snap, Snap]>) {
    const diffs = [0, 0, 0, 0, 0, 0, 0, 0];
    const pair = new Map<string, number>();
    let firstBad = '';
    let ghDiff = 0;
    for (let i = 0; i < N; i++) {
      const va = dmp.act[i], ja = jsSnap.act[i];
      if (va !== ja) { diffs[0]++; if (!firstBad) firstBad = `A(${i % W},${(i / W) | 0}) v${va} j${ja}`; }
      // mile8 同口径:vt/jt 以 active 门控
      const vt = va ? dmp.typ[i]! : 0;
      const jt = ja ? jsSnap.typ[i]! : 0;
      if (vt !== jt) diffs[1]++;
      const vg = va ? 0 : dmp.typ[i]!;
      const jg = ja ? 0 : jsSnap.typ[i]!;
      if (vg !== jg) ghDiff++;
      if (jsSnap.wal[i] !== dmp.wal[i]) { diffs[2]++; if (!firstBad) firstBad = `W(${i % W},${(i / W) | 0}) v${dmp.wal[i]} j${jsSnap.wal[i]}`; const k = `W${dmp.wal[i]}>${jsSnap.wal[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
      if (jsSnap.liq[i] !== dmp.liq[i]) diffs[3]++;
      if (jsSnap.hf[i] !== dmp.hf[i]) diffs[4]++;
      if (jsSnap.sl[i] !== dmp.sl[i]) diffs[5]++;
      const jl = jsSnap.liq[i] > 0 ? jsSnap.lt[i] : 0;
      const vl = dmp.liq[i] > 0 ? dmp.lt[i] + 1 : 0;
      if (jl !== vl) diffs[6]++;
      if (jsSnap.ia[i] !== dmp.ia[i]) diffs[7]++;
    }
    report[`stage_${tag}`] = { diffs: { A: diffs[0], T: diffs[1], W: diffs[2], L: diffs[3], Hf: diffs[4], Sl: diffs[5], Lt: diffs[6], Ia: diffs[7], Gh: ghDiff }, firstBad };
    console.log(`[${tag}] A=${diffs[0]} T=${diffs[1]} W=${diffs[2]} L=${diffs[3]} Hf=${diffs[4]} Sl=${diffs[5]} Lt=${diffs[6]} Ia=${diffs[7]} Gh=${ghDiff} first=${firstBad} | top ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  }

  console.log('== 变更集差分（上游残差对消后本族净差）==');
  for (const [seg, aS, bS, xA, xB] of [
    ['spider', pre, postS, d62, d63],
    ['gemcaves', postS, postG, d63, d64],
    ['moss', postG, postM, d64, d65],
  ] as Array<[string, Snap, Snap, Snap, Snap]>) {
    const jM = chg(aS, bS);
    const xM = chg(xA, xB);
    let cntJ = 0, cntX = 0, bothCnt = 0;
    for (let i = 0; i < N; i++) {
      if (jM[i]) cntJ++;
      if (xM[i]) cntX++;
      if (jM[i] && xM[i]) bothCnt++;
    }
    console.log(`  ▸${seg}: JS变更=${cntJ} x86变更=${cntX} 重叠=${bothCnt} 仅JS=${cntJ - bothCnt} 仅x86=${cntX - bothCnt}`);
    const cl = cluster(jM, xM, GAP);
    const fmt = (c: Comp) => `#${c.id}(n=${c.n},box=[${c.minX},${c.minY}]x[${c.maxX},${c.maxY}],c=(${c.cx},${c.cy}),j=${c.sA},x=${c.sB})`;
    writeFileSync(`${OUT}/i55-${seg}-comps.json`, JSON.stringify({ both: cl.both.slice(0, 400), onlyJS: cl.onlyA.slice(0, 400), onlyX86: cl.onlyB.slice(0, 400) }, null, 1));
    console.log(`     组件数: both=${cl.both.length} onlyJS=${cl.onlyA.length} onlyX86=${cl.onlyB.length}`);
    console.log(`     biggest-onlyJS: ${cl.onlyA.slice(0, 6).map(fmt).join(' ')}`);
    console.log(`     biggest-onlyX86: ${cl.onlyB.slice(0, 6).map(fmt).join(' ')}`);
    report[seg] = { changedJS: cntJ, changedX86: cntX, overlap: bothCnt, nBoth: cl.both.length, nOnlyJS: cl.onlyA.length, nOnlyX86: cl.onlyB.length };
  }
  writeFileSync(`${OUT}/i55-report.json`, JSON.stringify(report, null, 1));
  console.log('done IIII55');
}, 600_000);

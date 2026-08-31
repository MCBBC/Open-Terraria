// IIII111（IIIII99c 批）：jagged #76 Traps 单 pass 反演重放（克隆 _iii106oc 模式）。
// ① SW_TR_CAP=1：全量生成 jagged 种子（771005/digExtraHoles），在 ▶Traps reseed 时点
//    深拷贝 store 全通道+gs+chests+gensolid 快照 → $OUT/base_*（该时点=dump075_Place_
//    Fallen_Log 终态，#75 已绿）。
// ② SW_TR_REPLAY=1：hydrate 基座 → 基座自检(vs #075) → runTrapsPass 对拍
//    dump#CMP(默认 076_Traps) 八通道；产出 roll 流/trapEv/tntProbe 三仪日志。
// 用法：cd game && SW_TR_CAP=1 npx vitest run tools/_iii111tr.test.ts --no-file-parallelism
//       cd game && SW_TR_REPLAY=1 npx vitest run tools/_iii111tr.test.ts --no-file-parallelism
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runTrapsPass } from '../src/world/gen/vanilla/TrapsPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_TR_CAP === '1';
const RUN_RE = process.env.SW_TR_REPLAY === '1';
const OUT = process.env.SW_TR_OUT ?? '/tmp/iii111-out';
const G2 = process.env.SW_TR_G2 ?? '/tmp/iii80-out/x86-jagged';
const CMP_IDX = Number(process.env.SW_TR_CMP ?? 76);
const BASE_IDX = Number(process.env.SW_TR_BASE ?? 75);
const SEED = process.env.SW_TR_SEED ?? '771005';   // rig world jg-tr（jagged 种子）
const EVIL = Number(process.env.SW_TR_EVIL ?? 0);
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}
type AnyGs = Record<string, unknown>;
function serVal(v: unknown): unknown {
  if (v instanceof Uint8Array || v instanceof Int8Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint16Array || v instanceof Int16Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Uint32Array || v instanceof Int32Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (v instanceof Float32Array || v instanceof Float64Array) return { __t: v.constructor.name, d: Array.from(v) };
  if (Array.isArray(v)) return v.map(serVal);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = serVal((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as { __t?: string; d?: unknown[] };
    if (o.__t) {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor(o.d?.length ?? 0) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at Traps pass head (jagged)', async () => {
  if (!SEED || !G2) throw new Error('SW_TR_SEED/SW_TR_G2 required');
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
  let liveStore: TileStore | null = null;
  let liveWorld: { chests?: Array<{ x: number; y: number; items: unknown[] }> } | null = null;
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii111tr')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Traps') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            // 生成期实心覆写快照（▶Traps 时点；重放头 restoreGenSolid 用）
            writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()].map(([k, v]) => [k, v])));
            // chests 锚集（CheckChest 有物箱不可毁语境）
            const chs = (liveWorld?.chests ?? []).map((c) => ({ x: c.x, y: c.y, it: c.items.map((it) => [Number((it as { id: number }).id ?? 0), Number((it as { stack: number }).stack ?? 0)]) }));
            writeFileSync(`${OUT}/base_chests.json`, JSON.stringify(chs));
            console.log(`captured @${lab} out=${OUT} chests=${chs.length}`);
            done = true;
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { digExtraHoles: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; liveWorld = w2 as never; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Traps label never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch ${buf.length} != ${len * bytesPer}`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* G2 absent in cap mode */ }
}
interface DumpCh { nm: string; xt: Uint16Array; xa: Uint8Array; xw: Uint16Array; xl: Uint8Array; xhf: Uint8Array; xsl: Uint8Array; xlt: Uint8Array; xia: Uint8Array }
function loadDump(idx: number): DumpCh {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return {
    nm: DUMPNAME.get(idx) ?? '?',
    xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`), xw: le16(`${pre}.wal`),
    xl: readFileSync(`${pre}.liq`), xhf: readFileSync(`${pre}.half`), xsl: readFileSync(`${pre}.slope`),
    xlt: readFileSync(`${pre}.lty`), xia: readFileSync(`${pre}.inact`),
  };
}

/** dump idx 相对 BASE 的动作图：bit0=act+, bit1=act-, bit2=typ 变, bit3=wall 变,
 *  bit4=liquid 置位, bit5=liquid 清零, bit6=inact 置位 */
function actionMap(a: DumpCh, b: DumpCh): Uint8Array {
  const map = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let bits = 0;
    if (a.xa[i] !== b.xa[i]) bits |= a.xa[i] === 1 ? 1 : 2;
    if (b.xa[i] === 1 && a.xt[i] !== b.xt[i]) bits |= 4;
    if (a.xw[i] !== b.xw[i]) bits |= 8;
    if (b.xl[i] >= 250 && a.xl[i] < b.xl[i]) bits |= 16;
    else if (a.xl[i] > 0 && a.xl[i] !== b.xl[i]) bits |= 32;
    if (!!(b.xia[i]! & 1) && !(a.xia[i]! & 1)) bits |= 64;
    if (bits) map[i] = bits;
  }
  return map;
}

/** 动作图聚类摘要（行距 ≤2 合并） */
function clusterSummary(map: Uint8Array, mask: number, topK: number): string[] {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) if (map[i]! & mask) pts.push([i % W, Math.floor(i / W)]);
  const rows = new Map<number, Array<[number, number]>>();
  for (const [x, y] of pts) {
    let r = rows.get(y);
    if (!r) { r = []; rows.set(y, r); }
    if (r.length && r[r.length - 1]![1] === x - 1) r[r.length - 1]![1] = x;
    else r.push([x, x]);
  }
  const merged: Array<{ y0: number; y1: number; x0: number; x1: number; cells: number }> = [];
  for (const [y, rs] of [...rows.entries()].sort((p, q) => p[0] - q[0])) {
    for (const [rx0, rx1] of rs) {
      const last = merged[merged.length - 1];
      if (last && y - last.y1 <= 2 && last.x0 <= rx1 && rx0 <= last.x1 + 20) {
        last.y1 = y; last.x0 = Math.min(last.x0, rx0); last.x1 = Math.max(last.x1, rx1);
        last.cells += rx1 - rx0 + 1;
      } else merged.push({ y0: y, y1: y, x0: rx0, x1: rx1, cells: rx1 - rx0 + 1 });
    }
  }
  return merged.sort((a, b) => b.cells - a.cells).slice(0, topK)
    .map((c) => `x[${c.x0}..${c.x1}] y[${c.y0}..${c.y1}] cells=${c.cells}`);
}

function cmpAgainst(tag: string, idx: number, st: TileStore): void {
  const d = loadDump(idx);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  const detail: string[] = [];
  let fI = -1;
  for (let i = 0; i < N; i++) {
    const va = d.xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) A ${va}>${ja}`); }
    const vt = va ? d.xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      dT++; fI = fI < 0 ? i : fI;
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      detail.push(`(${i % W},${Math.floor(i / W)}) T ${vt}>${jt}`);
    }
    if (d.xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) W ${d.xw[i]}>${st.wall[i]}`); }
    if (d.xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) L ${d.xl[i]}>${st.liquid[i]}`); }
    if (d.xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) Hf ${d.xhf[i]}>${st.half[i]}`); }
    if (d.xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) Sl ${d.xsl[i]}>${st.slope[i]}`); }
    const vl = d.xl[i]! > 0 ? d.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) Lt ${vl}>${jl}`); }
    const via = d.xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; fI = fI < 0 ? i : fI; detail.push(`(${i % W},${Math.floor(i / W)}) Ia ${via}>${jia}`); }
    if (!va) {
      const vg = d.xt[i]!;
      const jg = st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
      if (vg !== jg) dGh++;
    }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`[${tag}] vs #${idx}_${d.nm}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ${bad ? '✗' : '✓'} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`     pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const s of detail.slice(0, 24)) console.log(`     ${s}`);
}

(RUN_RE ? it : it.skip)(`replay runTrapsPass on base vs G2 dump#${CMP_IDX}`, () => {
  const WRITE_PROBE = process.env.SW_TR_WRITE === '1';
  const t0 = Date.now();
  const { st, gs } = hydrate();
  console.log(`gs: seed=${gs.seed} flags=${JSON.stringify(gs.seedFlags)} ws=${gs.worldSurface.toFixed(2)} rock=${gs.rockLevel.toFixed(2)} side=${gs.dungeonSide} beachDist=${gs.beachDistance} h=${st.h} lavaLine=${gs.lavaLine}`);
  // 生成期实心快照还原（与生产 ▶Traps 时点一致）
  const snapArr = JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>;
  restoreGenSolid(new Map(snapArr));
  console.log(`gensolid restored: ${snapArr.length} overrides`);
  // 基座自检（应≡dump BASE）
  {
    const base = loadDump(BASE_IDX);
    let dA = 0, dT = 0, dW = 0, dL = 0, firstCell = '';
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) { dA++; if (!firstCell) firstCell = `A(${i % W},${Math.floor(i / W)}) ${va}>${ja}`; }
      else if (va && base.xt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) { dT++; if (!firstCell) firstCell = `T(${i % W},${Math.floor(i / W)}) ${base.xt[i]}>${SHEET[st.type[i]!]}`; }
      if (base.xw[i] !== st.wall[i]) { dW++; if (!firstCell) firstCell = `W(${i % W},${Math.floor(i / W)}) ${base.xw[i]}>${st.wall[i]}`; }
      if (base.xl[i] !== st.liquid[i]) { dL++; if (!firstCell) firstCell = `L(${i % W},${Math.floor(i / W)}) ${base.xl[i]}>${st.liquid[i]}`; }
    }
    console.log(`[base selfcheck vs #${BASE_IDX}_${base.nm}] dAct=${dA} dTyp=${dT} dWal=${dW} dLiq=${dL}${dA || dT || dW || dL ? ` ✗ first=${firstCell}（基座≠G2 上界）` : ' ✓'}`);
  }
  // 前像克隆（行为级写集探测用）
  const beforeStore = WRITE_PROBE ? hydrate() : null;
  if (beforeStore) restoreGenSolid(new Map(snapArr));
  // 事件三仪日志
  const ROLLLOG = `${OUT}/tr-rolls-js.log`;
  const EVLOG = `${OUT}/tr-ev-js.log`;
  const TNTLOG = `${OUT}/tr-tnt-js.log`;
  writeFileSync(ROLLLOG, ''); writeFileSync(EVLOG, ''); writeFileSync(TNTLOG, '');
  let rollN = 0, rollH = 2166136261 >>> 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oOnRoll = g.__swOnRoll;
  const rollBuf: string[] = [], evBuf: string[] = [], tntBuf: string[] = [];
  let probeActive = WRITE_PROBE;
  g.__swOnRoll = (v: number) => {
    if (probeActive) return;
    rollN++;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (rollBuf.length < 4_000_000) rollBuf.push(`${rollN}|${v}`);
  };
  const ge = globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void; __swTntEv?: (m: string) => void };
  const oEv = ge.__swTrapEv, oTnt = ge.__swTntEv;
  ge.__swTrapEv = (k, a, b, v) => { if (!probeActive && evBuf.length < 200_000) evBuf.push(`${k}|${a}|${b}|${v}`); };
  ge.__swTntEv = (m) => { if (!probeActive && tntBuf.length < 100_000) tntBuf.push(m); };
  const chestsRaw = JSON.parse(readFileSync(`${OUT}/base_chests.json`, 'utf8')) as Array<{ x: number; y: number; it: number[][] }>;
  const chests = chestsRaw.map((c) => ({ x: c.x, y: c.y, items: c.it.map(([id, stack]) => ({ id, stack })) }));
  try {
    const rng = new RNG(gs.seed);
    if (WRITE_PROBE) { runTrapsPass(beforeStore!.st, new RNG(gs.seed), gs, chests.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }))); }
    const rng2 = new RNG(gs.seed);
    runTrapsPass(st, rng2, gs, chests);
  } finally {
    g.__swOnRoll = oOnRoll;
    ge.__swTrapEv = oEv; ge.__swTntEv = oTnt;
  }
  console.log(`runTrapsPass ${Date.now() - t0}ms rolls=${rollN} fnvHash=${rollH.toString(16)}(${rollH})`);

  // ---- 行为级写集对账（SW_TR_WRITE=1）：before→after(JS) vs dump(after=x86) ----
  if (WRITE_PROBE && beforeStore) {
    probeActive = false;
    writeFileSync(ROLLLOG, rollBuf.join('\n') + (rollBuf.length ? '\n' : ''));
    const d76 = loadDump(CMP_IDX);
    const chsOf = (s: TileStore) => {
      const rec = s as unknown as Record<string, Uint8Array | Uint16Array>;
      return { flags: rec.flags, type: rec.type, fx: rec.frameX, fy: rec.frameY, wall: rec.wall, half: rec.half, slope: rec.slope, wire: rec.wire };
    };
    const B = chsOf(beforeStore.st), A = chsOf(st);
    const sites = (process.env.SW_TR_WATCH ?? '2421,487;2373,738').split(';').map((s) => s.split(',').map(Number));
    const sheet = (t: number): number => (SHEET[t] >= 0 ? SHEET[t]! : 9999);
    for (const [cx, cy] of sites) {
      console.log(`\n===== WRITE PROBE (${cx},${cy}) x±14 y±8：行=y；格=[before|JSafter|x86after] type/act；wire 差异随行 ===`);
      for (let y = cy - 8; y <= cy + 8; y++) {
        let row = '';
        for (let x = cx - 14; x <= cx + 14; x++) {
          const i = y * W + x;
          const bA = B.flags[i]! & 1, jA = A.flags[i]! & 1, vA = d76.xa[i]!;
          const bT = bA ? sheet(B.type[i]!) : 0, jT = jA ? sheet(A.type[i]!) : 0, vT = vA ? d76.xt[i]! : 0;
          const mark = bT !== jT || bA !== jA ? '*' : (jT !== vT || jA !== vA ? '!' : ' ');
          row += `${mark}${bT}/${bA}·${jT}/${jA}·${vT}/${vA}`;
          const wB = B.wire[i]!, wJ = A.wire[i]!, wV = d76.xia[i]! & 255;
          const s1 = `w${wB & 31}-${wJ & 31}-${wV}`;
          if ((wB & 31) !== (wJ & 31)) row += `<${s1}`;
          else if ((wJ & 31) !== wV) row += `[${s1}]`;
          row += ' ';
        }
        console.log(`y=${String(y).padStart(4)} ${row}`);
      }
    }
  }
  writeFileSync(ROLLLOG, rollBuf.join('\n') + (rollBuf.length ? '\n' : ''));
  writeFileSync(EVLOG, evBuf.join('\n') + (evBuf.length ? '\n' : ''));
  writeFileSync(TNTLOG, tntBuf.join('\n') + (tntBuf.length ? '\n' : ''));
  cmpAgainst('after-Traps', CMP_IDX, st);

  // 邻差动作图（x86 视角 075→076 与 JS 改写集聚类，仅在启用时）
  if (process.env.SW_TR_SHAPE === '1') {
    const xBefore = loadDump(BASE_IDX), xAfter = loadDump(CMP_IDX);
    const w86 = actionMap(xBefore, xAfter);
    const jsmap = new Uint8Array(N);
    const base = loadDump(BASE_IDX);
    for (let i = 0; i < N; i++) {
      let bits = 0;
      const ja = st.flags[i]! & 1;
      if (ja !== base.xa[i]) bits |= ja === 1 ? 1 : 2;
      if (ja === 1 && base.xa[i] === 1 && SHEET[st.type[i]!] !== base.xt[i]) bits |= 4;
      if (st.wall[i] !== base.xw[i]) bits |= 8;
      if (!(st.wire[i]! >>> 5 & 1) && !!(base.xia[i]! & 1)) bits |= 64;
      if (bits) jsmap[i] = bits;
    }
    writeFileSync(`${OUT}/tr-map-x86.bin`, Buffer.from(w86.buffer));
    writeFileSync(`${OUT}/tr-map-js.bin`, Buffer.from(jsmap.buffer));
    // 差异坐标 ±12 邻域快照（两侧终态列印）
    const fl = cmpFirstFromDetail();
    function cmpFirstFromDetail(): Array<[number, number]> {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < N; i++) {
        const va = xAfter.xa[i]!, ja = st.flags[i]! & 1;
        let diff = va !== ja;
        if (!diff) { const vt = va ? xAfter.xt[i]! : 0; const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0; diff = vt !== jt; }
        if (diff) pts.push([i % W, Math.floor(i / W)]);
      }
      return pts;
    }
    for (const [cx, cy] of fl.slice(0, 8)) {
      console.log(`--- neighborhood (${cx},${cy}) ±10 ×±4（行=y 列=x；x86态|JS态） ---`);
      for (let y = cy - 3; y <= cy + 4; y++) {
        let row = '';
        for (let x = cx - 10; x <= cx + 10; x++) {
          const ii = ((y * W) + x);
          const xt = xAfter.xa[ii] ? String(xAfter.xt[ii]).padStart(3, ' ') : '  0';
          const jt = (st.flags[ii] & 1) ? String(SHEET[st.type[ii]] ?? 9999).padStart(3, ' ') : '  0';
          row += (xt === jt ? ' ' : '>') + xt + '/' + jt + ' ';
        }
        console.log(`y=${String(y).padStart(4)} ${row}`);
      }
    }
  }
}, 600_000);

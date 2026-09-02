// IIII114b（carebears 线）：#40 Pyramids 房内容骰序反演重放仪（克隆 _iii151uw 模式）。
// 背景：mile8 cb 链（1.1.1.0.thecarebearsmovie|106102）0..39 绿，首差 #40_Pyramids
//   @(1649,348) T0>151×980——XLVI 移交「房内容放置序（AddBuriedChest flag11 填充/
//   堆/旗/罐）骰面分叉 → 之字隧 num12 翻向计划错位」。
// ① SW_PYR_CAP=1：全量生成，▶Pyramids reseed 时点快照（=dump#039 Clean_Up_Dirt 终态）
// ② SW_PYR_REPLAY=1：hydrate → runPyramidPass 对拍 #040 八通道+pc 口径掷账
//    （x86 pc.txt P|40 Pyramids R:10300:2145600011）+ 帧通道。
// 用法：cd game && SW_MB_1457=1 SW_PYR_CAP=1 npx vitest run tools/_iii151pyr.test.ts --no-file-parallelism
//       cd game && SW_MB_1457=1 SW_PYR_REPLAY=1 npx vitest run tools/_iii151pyr.test.ts --no-file-parallelism
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runPyramidPass } from '../src/world/gen/vanilla/StructuresPass';

const RUN_CAP = process.env.SW_PYR_CAP === '1';
const RUN_RE = process.env.SW_PYR_REPLAY === '1';
const OUT = process.env.SW_PYR_OUT ?? '/tmp/iii151-out/pyr';
const G2 = process.env.SW_PYR_G2 ?? '/tmp/iii127-out/x86-thecarebearsmovie';
const CMP_IDX = Number(process.env.SW_PYR_CMP ?? 40);
const BASE_IDX = Number(process.env.SW_PYR_BASE ?? 39);
const SEED = process.env.SW_PYR_SEED ?? '1.1.1.0.thecarebearsmovie|106102';
const EVIL = Number(process.env.SW_PYR_EVIL ?? -1);
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

const EXTRA_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_PYR_FLAGS ?? '').split(',').filter(Boolean)) EXTRA_FLAGS[f] = true;

(RUN_CAP ? it : it.skip)('PYR cap: capture base at Pyramids pass head (carebears)', async () => {
  if (!SEED || !G2) throw new Error('SW_PYR_SEED/SW_PYR_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii151pyr')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Pyramids') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            const chs = (liveWorld?.chests ?? []).map((c) => ({ x: c.x, y: c.y, it: c.items.map((it) => [Number((it as { id: number }).id ?? 0), Number((it as { stack: number }).stack ?? 0)]) }));
            writeFileSync(`${OUT}/base_chests.json`, JSON.stringify(chs));
            console.log(`[cap] captured @${lab} out=${OUT} chests=${chs.length} seed=${gs.seed}`);
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
      ...(Object.keys(EXTRA_FLAGS).length > 0 ? { seedFlags: EXTRA_FLAGS } : {}),
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; liveWorld = w2 as never; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Pyramids label never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base_gs.json`, 'utf8'))) as GenState;
  const chests = JSON.parse(readFileSync(`${OUT}/base_chests.json`, 'utf8'));
  return { st, gs, chests };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)('PYR replay: pyramid pass vs x86 #040 (carebears)', async () => {
  const { st, gs, chests } = hydrate();
  const rng = new RNG(gs.seed);
  let DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const loadDump = (idx: number) => {
    const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
    if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing ${pre}`);
    return {
      xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`), xw: le16(`${pre}.wal`),
      xl: readFileSync(`${pre}.liq`), xhf: readFileSync(`${pre}.half`), xsl: readFileSync(`${pre}.slope`),
      xlt: readFileSync(`${pre}.lty`), xia: readFileSync(`${pre}.inact`),
    };
  };
  // ---- 基座自检 ----
  const base = loadDump(BASE_IDX);
  {
    let d = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? base.xt[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja || vt !== jt || base.xw[i] !== st.wall[i] || base.xl[i] !== st.liquid[i]
        || base.xhf[i] !== st.half[i] || base.xsl[i] !== st.slope[i]
        || (base.xl[i]! > 0 ? base.xlt[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0)) d++;
    }
    console.log(`[replay] base self-check vs #${BASE_IDX}_${DUMPNAME.get(BASE_IDX)}: diffCells=${d}`);
    if (d > 1000) throw new Error(`基座自检失败 diffCells=${d}`);
  }
  // ---- 掷账（JJHook pc 口径）----
  let n = 0;
  let h = 2166136261 >>> 0;
  const mainUR = (rng as unknown as { ur?: object }).ur;
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
    if (mainUR === undefined || inst === mainUR) { n++; raws.push(v); h = ((h ^ (v >>> 0)) * 16777619) >>> 0; }
  };
  const n0 = n;
  const raws: number[] = [];
  const marks: Array<{ tag: string; n: number }> = [];
  (globalThis as { __swPyrMark?: (t: string) => void }).__swPyrMark = (t) => marks.push({ tag: t, n });
  runPyramidPass(st, rng, gs, chests);
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = undefined;
  for (const m of marks) console.log(`[mark] ${m.tag.padEnd(16)} n=${m.n}`);
  // 反推 x86 填充环额外掷数：JS num26 于 raws[7250]（room-piles-pre 位）；Next(1,10)=trunc(S*9)+1
  console.log('[probe] raws7226_7400=' + raws.slice(7226, 7401).join(','));
  {
    const S = (r: number) => r * 4.656612875245797e-10;
    for (let k = 0; k <= 8; k++) {
      const idx = 7250 + k;
      const v = Math.trunc(S(raws[idx]!) * 9) + 1;
      console.log(`[probe] num26@+${k} = ${v}`);
    }
  }
  // ---- x86 pc.txt 对拍 ----
  let pcLine = '';
  if (existsSync(`${G2}/pc.txt`)) {
    pcLine = readFileSync(`${G2}/pc.txt`, 'utf8').split('\n').find((l) => l.startsWith(`P|${CMP_IDX}|`)) ?? '';
    console.log(`[pc] x86: ${pcLine}`);
  }
  console.log(`[rolls] js pass-internal=${n - n0} fnv=${h}`);
  if (pcLine) {
    const rm = pcLine.match(/R:(\d+):(\d+)/);
    if (rm) console.log(`[rolls] x86=${rm[1]} fnv=${rm[2]} → Δ=${(n - n0) - Number(rm[1])} Δhash=${((h - Number(rm[2])) >>> 0)}`);
  }
  // ---- 末态对拍 #CMP ----
  const dmp = loadDump(CMP_IDX);
  const pair = new Map<string, number>();
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, firstI = -1;
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = dmp.xa[i]!, ja = st.flags[i]! & 1;
    const vt = va ? dmp.xt[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    const mk = () => { if (firstI < 0) firstI = i; };
    const push = (s: string) => { if (samples.length < 8) samples.push(s); };
    if (va !== ja) { dA++; mk(); push(`A(${i % W},${(i / W) | 0}) v${va} j${ja}`); }
    if (vt !== jt) { dT++; mk(); const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (dmp.xw[i] !== st.wall[i]) { dW++; mk(); push(`W(${i % W},${(i / W) | 0}) v${dmp.xw[i]} j${st.wall[i]}`); }
    if (dmp.xl[i] !== st.liquid[i]) { dL++; mk(); }
    if (dmp.xhf[i] !== st.half[i]) { dHf++; mk(); }
    if (dmp.xsl[i] !== st.slope[i]) { dSl++; mk(); const k = `S${dmp.xsl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = dmp.xl[i]! > 0 ? dmp.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; mk(); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if ((dmp.xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; mk(); }
  }
  console.log(`[#${CMP_IDX} ${DUMPNAME.get(CMP_IDX)}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}` +
    (firstI >= 0 ? ` first=(${firstI % W},${Math.floor(firstI / W)})` : ' ✓ 全绿'));
  console.log(`  pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n2]) => `${k}×${n2}`).join(' ')}`);
  // T28 罐差采样（房内罐行定位）
  {
    const potDiffs: string[] = [];
    for (let i = 0; i < N && potDiffs.length < 40; i++) {
      const va = dmp.xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? dmp.xt[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (vt === 28 || jt === 28) potDiffs.push(`(${i % W},${(i / W) | 0}) v${vt} j${jt}`);
    }
    console.log(`  pot-diffs: ${potDiffs.join(' | ')}`);
  }
  // 房间窗地图（x 1640..1680, y 340..355）
  {
    for (let y = 340; y <= 355; y++) {
      let rx = '', jx = '';
      for (let x = 1640; x <= 1680; x++) {
        const i = y * W + x;
        const va = dmp.xa[i], ja = st.flags[i] & 1;
        const vt = va ? dmp.xt[i] : 0, jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 0) : 0;
        const ch = (v: number, a2: number) => a2 ? (v === 0 ? 'O' : v === 151 ? '#' : v === 28 ? 'P' : v === 21 ? 'C' : v === 185 ? 'p' : v === 91 ? 'B' : '?') : '.';
        rx += ch(vt, va); jx += ch(jt, ja);
      }
      console.log(`  ${y}: x86 ${rx} | js ${jx}`);
    }
  }
  console.log(`  samples: ${samples.join(' | ')}`);
  // ---- 帧通道（归一化 0xFFFF）----
  const pre2 = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (existsSync(`${pre2}.frx`)) {
    const fx = le16(`${pre2}.frx`), fy = le16(`${pre2}.fry`);
    const norm = (v: number): number => (v === 65535 ? 0 : v);
    let dFx = 0, dFy = 0;
    const fxS: string[] = [];
    for (let i = 0; i < N; i++) {
      if (norm(fx[i]!) !== norm(st.frameX[i]!)) { dFx++; if (fxS.length < 6) fxS.push(`FX(${i % W},${(i / W) | 0}) v${norm(fx[i]!)} j${norm(st.frameX[i]!)}`); }
      if (norm(fy[i]!) !== norm(st.frameY[i]!)) { dFy++; if (fxS.length < 6) fxS.push(`FY(${i % W},${(i / W) | 0}) v${norm(fy[i]!)} j${norm(st.frameY[i]!)}`); }
    }
    console.log(`[frames] dFrameX=${dFx} dFrameY=${dFy} ${fxS.join(' | ')}`);
  }
  writeFileSync(`${OUT}/pyr-replay.json`, JSON.stringify({ rolls: n - n0, fnv: h, dA, dT, dW, dL, dHf, dSl, dLt, dIa, first: firstI }));
}, 600_000);

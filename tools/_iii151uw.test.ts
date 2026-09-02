// IIII114b（iamerror 线）：#28 Underworld 地狱段反演重放仪（克隆 _iii111tr 模式）。
// 背景：mile8 er 链（1.1.1.0.iamerror|106103）0..27 绿，首差 #28_Underworld
//   @(447,994) T0>57×5758 Y0>2×5449 T57>0×4760 T75>0×3112——W=34214 全要塞级。
//   cs=Terarria1458 HellFort() 头（cs:32996-33004）有 errorWorld 臂：
//     if (errorWorld) { if (Next(15)==0) num2*=3; if (Next(15)==0) j-=Next(400); }
//   与格受理门（cs:33147-33152）`array3[r] < UnderworldLayer && !errorWorld → 弃`。
//   JS hellFort() 两处整缺 → 本仪定罪 + 修复验证。
// ① SW_UW_CAP=1：全量生成，▶Underworld reseed 时点快照（store13+gs+chests+gensolid）
// ② SW_UW_REPLAY=1：hydrate → runUnderworldPass+underworldAshGrassTrees+runHellFortPass
//    分相掷账（总/x86 pc.txt P|28 R:<count>:<hash> 对拍 + torch/furn/pic/banner 子相），
//    末态对拍 dump#CMP 八通道 + pc 口径 T/A/W/L 四通道 FNV。
// 用法：cd game && SW_MB_1457=1 SW_UW_CAP=1 npx vitest run tools/_iii151uw.test.ts --no-file-parallelism
//       cd game && SW_MB_1457=1 SW_UW_REPLAY=1 npx vitest run tools/_iii151uw.test.ts --no-file-parallelism
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runUnderworldPass, underworldAshGrassTrees } from '../src/world/gen/vanilla/UnderworldPass';
import { runHellFortPass, setHfTrace } from '../src/world/gen/vanilla/HellFortPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_UW_CAP === '1';
const RUN_RE = process.env.SW_UW_REPLAY === '1';
const OUT = process.env.SW_UW_OUT ?? '/tmp/iii151-out';
const G2 = process.env.SW_UW_G2 ?? '/tmp/iii127-out/x86-iamerror';
const CMP_IDX = Number(process.env.SW_UW_CMP ?? 28);
const SEED = process.env.SW_UW_SEED ?? '1.1.1.0.iamerror|106103';
const EVIL = Number(process.env.SW_UW_EVIL ?? -1);
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

(RUN_CAP ? it : it.skip)('UW cap: capture base at Underworld pass head (iamerror)', async () => {
  if (!SEED || !G2) throw new Error('SW_UW_SEED/SW_UW_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii151uw')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Underworld') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()].map(([k, v]) => [k, v])));
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
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; liveWorld = w2 as never; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Underworld label never hit');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
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
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

/** JJHook pc 口径 FNV：hash=(hash^(v>>>0))*16777619（v=InternalSample 原始值） */
class RollMeter {
  n = 0;
  h = 2166136261 >>> 0;
  marks: Array<{ tag: string; n: number; h: number }> = [];
  mark(tag: string): void { this.marks.push({ tag, n: this.n, h: this.h }); }
}
const fnvBytes = (data: Uint8Array | Uint16Array, le: boolean): number => {
  let h = 2166136261 >>> 0;
  const u8 = le && data instanceof Uint16Array
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : (data as Uint8Array);
  for (let k = 0; k < u8.length; k++) { h = (h ^ u8[k]!) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};

(RUN_RE ? it : it.skip)('UW replay: hell segment vs x86 #028 (iamerror)', async () => {
  const { st, gs } = hydrate();
  restoreGenSolid(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')));
  const rng = new RNG(gs.seed);
  const mainUR = (rng as unknown as { ur?: object }).ur;
  const meter = new RollMeter();
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
    if (mainUR === undefined || inst === mainUR) { meter.n++; meter.h = ((meter.h ^ (v >>> 0)) * 16777619) >>> 0; }
  };
  // 基座自检：hydrate 态 vs #BASE dump（缺省 27）应为零差
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
  const base = loadDump(Number(process.env.SW_UW_BASE ?? 27));
  {
    let d = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? base.xt[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja || vt !== jt || base.xw[i] !== st.wall[i] || base.xl[i] !== st.liquid[i]
        || base.xhf[i] !== st.half[i] || base.xsl[i] !== st.slope[i]
        || (base.xl[i]! > 0 ? base.xlt[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0)) d++;
    }
    console.log(`[replay] base self-check vs #${DUMPNAME.get(Number(process.env.SW_UW_BASE ?? 27))}: diffCells=${d}`);
    if (d > 0) throw new Error('基座自检失败：hydrate 态 ≠ x86 基座 dump');
  }
  // ---- 分相执行 ----
  const towers: string[] = [];
  setHfTrace((s) => { if (s.startsWith('T#')) towers.push(s); });
  const chestSink: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean } | null> = [];
  const mark = (t: string) => meter.mark(t);
  runUnderworldPass(st, rng, gs, undefined); mark('uw-pass');
  underworldAshGrassTrees(st, rng, gs, false); mark('ash-grass');
  runHellFortPass(st, rng, gs, mark, chestSink); mark('hellfort-end');
  setHfTrace(null);
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = undefined;
  // ---- x86 pc.txt 对拍 ----
  let pcLine = '';
  if (existsSync(`${G2}/pc.txt`)) {
    const lines = readFileSync(`${G2}/pc.txt`, 'utf8').split('\n');
    pcLine = lines.find((l) => l.startsWith(`P|${CMP_IDX}|`)) ?? '';
    console.log(`[pc] x86: ${pcLine}`);
  }
  console.log(`[rolls] js total=${meter.n} fnv=${meter.h} towers=${towers.length}`);
  for (const m of meter.marks) console.log(`[rolls]   @${m.tag.padEnd(12)} n=${m.n} h=${m.h}`);
  if (pcLine) {
    const rm = pcLine.match(/R:(\d+):(\d+)/);
    if (rm) {
      const xn = Number(rm[1]), xh = Number(rm[2]) >>> 0;
      console.log(`[rolls] x86 total=${xn} fnv=${xh}  → Δcount=${meter.n - xn} Δhash=${((meter.h - xh) >>> 0)}`);
    }
  }
  // ---- 末态对拍 #CMP（八通道）----
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
    if (dmp.xl[i] !== st.liquid[i]) { dL++; mk(); push(`L(${i % W},${(i / W) | 0}) v${dmp.xl[i]} j${st.liquid[i]}`); }
    if (dmp.xhf[i] !== st.half[i]) { dHf++; mk(); }
    if (dmp.xsl[i] !== st.slope[i]) { dSl++; mk(); const k = `S${dmp.xsl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = dmp.xl[i]! > 0 ? dmp.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; mk(); const k = `Y${vl}>${jl}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if ((dmp.xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; mk(); }
  }
  console.log(`[#${CMP_IDX} ${DUMPNAME.get(CMP_IDX)}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}` +
    ` first=(${firstI % W},${Math.floor(firstI / W)})`);
  console.log(`  pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  console.log(`  samples: ${samples.join(' | ')}`);
  // ---- 帧通道对拍（.frx/.fry 存在时；Δcount=−1 的落点定位用）----
  if (existsSync(`${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}.frx`)) {
    const fx = le16(`${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}.frx`);
    const fy = le16(`${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}.fry`);
    let dFx = 0, dFy = 0;
    const fxS: string[] = [];
    const norm = (v: number): number => (v === 65535 ? 0 : v);   // x86 0xFFFF=未设帧 ↔ JS 0
    for (let i = 0; i < N; i++) {
      if (norm(fx[i]!) !== norm(st.frameX[i]!)) { dFx++; if (fxS.length < 6) fxS.push(`FX(${i % W},${(i / W) | 0}) v${norm(fx[i]!)} j${norm(st.frameX[i]!)}`); }
      if (norm(fy[i]!) !== norm(st.frameY[i]!)) { dFy++; if (fxS.length < 6) fxS.push(`FY(${i % W},${(i / W) | 0}) v${norm(fy[i]!)} j${norm(st.frameY[i]!)}`); }
    }
    console.log(`[frames] dFrameX=${dFx} dFrameY=${dFy} ${fxS.join(' | ')}`);
  }
  // ---- pc 口径 T/A/W/L 通道 FNV（x86 raw 语义：typ 恒写 type,act 恒写活性）----
  {
    const typ = new Uint16Array(N), act = new Uint8Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const t = st.type[i]!;
      typ[i] = t === 0 ? 0 : (SHEET[t] >= 0 ? SHEET[t]! : 0x7777);
      act[i] = st.flags[i]! & 1;
      wal[i] = st.wall[i]!;
      liq[i] = st.liquid[i]!;
    }
    const b2 = (u: Uint16Array): Uint8Array => new Uint8Array(u.buffer, u.byteOffset, u.byteLength);
    console.log(`[fnv] JS T=${fnvBytes(typ, true)} A=${fnvBytes(act, false)} W=${fnvBytes(b2(wal), true)} L=${fnvBytes(liq, false)}`);
    const tm = pcLine.match(/T:(\d+)\|A:(\d+)\|W:(\d+)\|L:(\d+)/);
    if (tm) console.log(`[fnv] x86 T=${tm[1]} A=${tm[2]} W=${tm[3]} L=${tm[4]}`);
  }
  writeFileSync(`${OUT}/uw-replay.json`, JSON.stringify({ total: meter.n, fnv: meter.h, marks: meter.marks, towers: towers.length, dA, dT, dW, dL, dHf, dSl, dLt, dIa, first: firstI }));
}, 600_000);

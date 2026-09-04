// IIII108c2 批：iamerror 链 #040 Pyramids（errorWorld 深沙金字塔臂）单窗反演重放。
// 克隆 _iii107c-dg 骨架，靶 = mile8 #040 Pyramids（首差 (907,230) A=29866/T=83374/W=68894）。
// ① CAP：全量生成，在 ▶Pyramids reseed 时点深拷贝 store 全通道 + gs
// ② RE：hydrate → new RNG(seed) → runPyramidPass → 对拍 G2 dump#Pyramids 八通道；
//    ★两种基座：缺省=CAP 快照（含 frame 通道，基座自检残差=CXXI #032 移交 488 族投影）；
//    SW_PYR_X86BASE=1 = 直接 hydrate x86 dump#BASE 八通道（纯 pass 债视角，frame 通道为零化）
//    ——gs 仍取 CAP 的 base_gs.json（worldSurface/rockLevel/shimmer/pyramidSpots 等上下文）。
//    SW_PYR_X86BASE=1 时基座自检自动改为「hydrate 回读一致性」（应全零）。
//    SW_PYR_DELTA2=1 追加打印「x86 039→040 delta 直方图」（对形用）。
// 用法：
//   SW_PYRCAP=1 SW_PYR_OUT=/tmp/iii147-out/cap-pyr SW_PYR_SEED='1.1.1.0.iamerror|106103' \
//     npx vitest run tools/_iii108c2-pyr.test.ts
//   SW_PYRRE=1 SW_PYR_OUT=/tmp/iii147-out/cap-pyr SW_PYR_G2=$HOME/GoldenChains/i106/x86-iamerror \
//     SW_PYR_CMP=Pyramids SW_PYR_BASE=Clean_Up_Dirt [SW_PYR_X86BASE=1] [SW_PYR_SAVEAFTER=1] \
//     [SW_PYR_ROLLCAP=/tmp/iii147-out/js-pyr-rl.txt] [SW_PYR_DELTA=1] [SW_PYR_NCELLS=60] \
//     npx vitest run tools/_iii108c2-pyr.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runPyramidPass } from '../src/world/gen/vanilla/StructuresPass';

const RUN_CAP = process.env.SW_PYRCAP === '1';
const RUN_RE = process.env.SW_PYRRE === '1';
const OUT = process.env.SW_PYR_OUT ?? '/tmp/iii147-out/cap-pyr';
const G2 = process.env.SW_PYR_G2 ?? '';
const LABEL = process.env.SW_PYR_LABEL ?? 'Pyramids';
const CMP_NAME = process.env.SW_PYR_CMP ?? 'Pyramids';
const BASE_NAME = process.env.SW_PYR_BASE ?? 'Clean_Up_Dirt';
const W = Number(process.env.SW_PYR_W ?? 4200), H = Number(process.env.SW_PYR_H ?? 1200), N = W * H;
const SEED = process.env.SW_PYR_SEED ?? '';
const EVIL = Number(process.env.SW_PYR_EVIL ?? -1);
const SAVEAFTER = process.env.SW_PYR_SAVEAFTER === '1';
const X86BASE = process.env.SW_PYR_X86BASE === '1';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// sheet→internal 规范反映射（first-wins；TILE_INTERNAL_BY_SHEET 是 last-wins，
// 会被同名 sheet 的变体/伪装箱条目覆写，round-trip 不闭合 ⇒ x86base hydrate 禁用）
const SHEET2INTERNAL = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = SHEET[i]!;
  if (s >= 0 && !SHEET2INTERNAL.has(s)) SHEET2INTERNAL.set(s, i);
}
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}
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
      const arr = new Ctor((o.d?.length ?? 0)) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)(`capture base at ▶${LABEL}`, async () => {
  if (!SEED) throw new Error('SW_PYR_SEED required');
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
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii108c2')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === LABEL) {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            console.log(`captured @${lab} tag=${OUT} gs keys=${Object.keys(gs).length}`);
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
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error(`capture failed: label ${LABEL} never hit`);
}, 600_000);

function hydrateCap(): { st: TileStore; gs: GenState } {
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

(RUN_RE ? it : it.skip)(`replay pyramid window on base vs x86 dump#${CMP_NAME}`, () => {
  if (!G2) throw new Error('SW_PYR_G2 required');
  const DUMPNAME = new Map<number, string>();
  const IDXNAME = new Map<string, number>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) { DUMPNAME.set(Number(m[1]), m[2]); IDXNAME.set(m[2], Number(m[1])); }
  }
  const idxOf = (nm: string): number => {
    const i = IDXNAME.get(nm);
    if (i === undefined) throw new Error(`dump ${nm} missing in ${G2}`);
    return i;
  };
  const pre = (idx: number): string => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  const CMP = idxOf(CMP_NAME), BASE = idxOf(BASE_NAME);
  const xt = le16(`${pre(CMP)}.typ`), xa = readFileSync(`${pre(CMP)}.act`), xw = le16(`${pre(CMP)}.wal`),
    xl = readFileSync(`${pre(CMP)}.liq`), xhf = readFileSync(`${pre(CMP)}.half`), xsl = readFileSync(`${pre(CMP)}.slope`),
    xlt = readFileSync(`${pre(CMP)}.lty`), xia = readFileSync(`${pre(CMP)}.inact`);
  // x86 dump#BASE 八通道（x86base 基座 + delta2 直方图源）
  const bA8 = readFileSync(`${pre(BASE)}.act`), bT8 = le16(`${pre(BASE)}.typ`), bW8 = le16(`${pre(BASE)}.wal`),
    bL8 = readFileSync(`${pre(BASE)}.liq`), bHf8 = readFileSync(`${pre(BASE)}.half`), bSl8 = readFileSync(`${pre(BASE)}.slope`),
    bLt8 = readFileSync(`${pre(BASE)}.lty`), bIa8 = readFileSync(`${pre(BASE)}.inact`);
  const { st, gs } = hydrateCap();
  if (X86BASE) {
    // x86 dump#BASE 直接覆盖八通道（sheet→internal；frame 通道保留 CAP 值——主体几何被
    // x86 基座覆盖，frame 残留只影响 SquareTileFrame 的重算入参，不进八通道对拍）
    for (let i = 0; i < N; i++) {
      st.flags[i] = bA8[i]! ? (st.flags[i] | 1) : (st.flags[i] & ~1);
      const sh = bA8[i]! ? bT8[i]! : 0;
      // ★x86 dump 里活性格 sheet 0 = Dirt（空气只以 act=0 表达）——禁把 sheet0 当 air
      const tI = SHEET2INTERNAL.get(sh);
      if (sh !== 0 && tI === undefined) throw new Error(`sheet ${sh} no internal mapping @${i % W},${(i / W) | 0}`);
      st.type[i] = tI ?? 0;
      st.wall[i] = bW8[i]!;
      st.liquid[i] = bL8[i]!;
      st.liquidType[i] = bL8[i]! > 0 ? (bLt8[i]! + 1) : 0;
      st.half[i] = bHf8[i]!;
      st.slope[i] = bSl8[i]!;
      st.wire[i] = bIa8[i]! ? (st.wire[i] | (1 << 5)) : (st.wire[i] & ~(1 << 5));
    }
  }
  // 基座自检：CAP 基 → 对 x86 dump#BASE（残差=CXXI 移交 488 族投影）；x86base 基 → 回读全零
  {
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i] & 1;
      if (bA8[i] !== ja) { dA++; continue; }
      if (ja && bT8[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) { dT++; continue; }
      if (bW8[i] !== st.wall[i]) dW++;
      if (bL8[i] !== st.liquid[i]) dL++;
      if (bHf8[i] !== st.half[i]) dHf++;
      if (bSl8[i] !== st.slope[i]) dSl++;
      const vl = bL8[i]! > 0 ? bLt8[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) dLt++;
      if ((bIa8[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    }
    console.log(`[base selfcheck vs ${BASE_NAME}${X86BASE ? ' (x86 hydrate)' : ''}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
    if (X86BASE && (dA || dT || dW || dL || dHf || dSl || dLt || dIa)) throw new Error('x86 base hydrate drift');
  }
  const rng = new RNG(gs.seed);
  const ROLLCAP = process.env.SW_PYR_ROLLCAP;
  const ROLLSTACK = Number(process.env.SW_PYR_ROLLSTACK ?? 0);
  let rollSeq = 0;
  const oOnRoll = (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll;
  const rollRows: number[] = [];
  if (ROLLCAP || ROLLSTACK > 0) {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
      rollSeq++;
      rollRows.push(v);
      if (rollSeq === ROLLSTACK && ROLLSTACK > 0) {
        const stack = (new Error().stack ?? '').split('\n').filter((l) => l.includes('/src/')).slice(0, 9);
        console.log(`[108c2] roll#${rollSeq} value=${v}\n${stack.join('\n')}`);
      }
      void inst;
    };
  }
  try {
    runPyramidPass(st, rng, gs, []);
  } finally {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = oOnRoll;
    if (ROLLCAP) {
      writeFileSync(ROLLCAP, rollRows.map((v, i) => `R|${i + 1}|${v}`).join('\n') + '\n');
      console.log(`[108c2] rollcap rows=${rollRows.length} -> ${ROLLCAP}`);
    }
  }
  // 掷值流对齐自检：有 x86 窗文件时逐值 diff（对齐前缀/分叉块签名）
  const X86WIN = process.env.SW_PYR_X86WIN ?? '/tmp/iii147-out/x86-pyr-window.txt';
  if (ROLLCAP && existsSync(X86WIN)) {
    const xv = readFileSync(X86WIN, 'utf8').split('\n').filter((l) => l.startsWith('R|')).map((l) => l.split('|')[2]);
    const jv = rollRows.map((v) => String(v));
    let pfx = 0;
    while (pfx < xv.length && pfx < jv.length && xv[pfx] === jv[pfx]) pfx++;
    console.log(`[108c2 roll align] x86=${xv.length} js=${jv.length} alignedPrefix=${pfx}` +
      (pfx < Math.min(xv.length, jv.length)
        ? ` firstDiv@${pfx + 1} x86=${xv[pfx]} js=${jv[pfx]}`
        : (xv.length === jv.length ? ' FULL-ALIGNED' : ` tail-extra js=${jv.length - xv.length}`)));
  }
  if (SAVEAFTER) {
    const sheetTyp = new Uint16Array(N);
    const actA = new Uint8Array(N), wal = new Uint16Array(N), liq = new Uint8Array(N),
      slp = new Uint8Array(N), hlf = new Uint8Array(N), lty = new Uint8Array(N), inact = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const va = st.flags[i]! & 1;
      sheetTyp[i] = st.type[i] === 0 || SHEET[st.type[i]!] < 0 ? (va ? 9999 : 0)
        : (SHEET[st.type[i]!] ?? 9999);
      actA[i] = va; wal[i] = st.wall[i]!; liq[i] = st.liquid[i]!;
      slp[i] = st.slope[i]!; hlf[i] = st.half[i]!; lty[i] = st.liquidType[i]!;
      inact[i] = (st.wire[i]! >>> 5) & 1;
    }
    writeFileSync(`${OUT}/jsafter.typ`, Buffer.from(sheetTyp.buffer, sheetTyp.byteOffset, N * 2));
    writeFileSync(`${OUT}/jsafter.act`, Buffer.from(actA.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.wal`, Buffer.from(wal.buffer, wal.byteOffset, N * 2));
    writeFileSync(`${OUT}/jsafter.liq`, Buffer.from(liq.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.slope`, Buffer.from(slp.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.half`, Buffer.from(hlf.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.lty`, Buffer.from(lty.buffer, 0, N));
    writeFileSync(`${OUT}/jsafter.inact`, Buffer.from(inact.buffer, 0, N));
    console.log('[108c2] jsafter saved (8ch)');
  }
  // JS 写迹直方图（基座→pass 终态 delta）
  if (process.env.SW_PYR_DELTA === '1' && SAVEAFTER) {
    const bFlags = X86BASE ? bA8 : readFileSync(`${OUT}/base_flags.bin`);
    const bT = X86BASE ? bT8 : le16(`${OUT}/base_type.bin`), bW = X86BASE ? bW8 : le16(`${OUT}/base_wall.bin`);
    const bL = X86BASE ? bL8 : readFileSync(`${OUT}/base_liquid.bin`), bHf = X86BASE ? bHf8 : readFileSync(`${OUT}/base_half.bin`),
      bSl = X86BASE ? bSl8 : readFileSync(`${OUT}/base_slope.bin`), bLt = X86BASE ? bLt8 : readFileSync(`${OUT}/base_liquidType.bin`),
      bIa = X86BASE ? bIa8 : readFileSync(`${OUT}/base_wire.bin`);
    const aA = readFileSync(`${OUT}/jsafter.act`), aT = le16(`${OUT}/jsafter.typ`), aW = le16(`${OUT}/jsafter.wal`),
      aL = readFileSync(`${OUT}/jsafter.liq`), aHf = readFileSync(`${OUT}/jsafter.half`),
      aSl = readFileSync(`${OUT}/jsafter.slope`), aLt = readFileSync(`${OUT}/jsafter.lty`),
      aIa = readFileSync(`${OUT}/jsafter.inact`);
    let chg = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    const tAdd = new Map<number, number>(), tDel = new Map<number, number>(), wAdd = new Map<number, number>(), wDel = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const a1 = bFlags[i]! & 1;
      const t1 = a1 ? (bT[i]! === 0 ? 0 : (SHEET[bT[i]!]! >= 0 ? SHEET[bT[i]!]! : 9999)) : 0;
      const t2 = aA[i]! ? aT[i]! : 0;
      const w1 = bW[i]!, w2 = aW[i]!;
      const l1 = bL[i]!, l2 = aL[i]!;
      if (t1 !== t2 || w1 !== w2 || l1 !== l2 || bHf[i] !== aHf[i] || bSl[i] !== aSl[i] ||
        (l1 > 0 ? bLt[i]! + 1 : 0) !== (l2 > 0 ? aLt[i]! + 1 : 0) ||
        ((bIa[i]! >>> 5) & 1) !== (aIa[i]! ? 1 : 0)) {
        chg++;
        const x = i % W, y = (i / W) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (t1 !== t2) { tDel.set(t1, (tDel.get(t1) ?? 0) + 1); tAdd.set(t2, (tAdd.get(t2) ?? 0) + 1); }
        if (w1 !== w2) { wDel.set(w1, (wDel.get(w1) ?? 0) + 1); wAdd.set(w2, (wAdd.get(w2) ?? 0) + 1); }
      }
    }
    const srt = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}:${n}`).join(' ');
    console.log(`[108c2 JS delta] changed=${chg} bbox x[${minx === 1e9 ? '-' : minx}..${maxx < 0 ? '-' : maxx}] y[${miny === 1e9 ? '-' : miny}..${maxy < 0 ? '-' : maxy}]`);
    console.log(`  typeAdd ${srt(tAdd)}`);
    console.log(`  typeDel ${srt(tDel)}`);
    console.log(`  wallAdd ${srt(wAdd)}`);
    console.log(`  wallDel ${srt(wDel)}`);
  }
  // x86 039→040 delta 直方图（对形基准）
  if (process.env.SW_PYR_DELTA2 === '1') {
    let chg = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    const tAdd = new Map<number, number>(), tDel = new Map<number, number>(), wAdd = new Map<number, number>(), wDel = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const a1 = bA8[i]!, a2 = xa[i]!;
      const t1 = a1 ? bT8[i]! : 0, t2 = a2 ? xt[i]! : 0;
      const w1 = bW8[i]!, w2 = xw[i]!;
      const l1 = bL8[i]!, l2 = xl[i]!;
      if (a1 !== a2 || t1 !== t2 || w1 !== w2 || l1 !== l2 || bHf8[i] !== xhf[i] || bSl8[i] !== xsl[i] ||
        (l1 > 0 ? bLt8[i]! + 1 : 0) !== (l2 > 0 ? xlt[i]! + 1 : 0) ||
        ((bIa8[i]! ? 1 : 0)) !== (xia[i]! ? 1 : 0)) {
        chg++;
        const x = i % W, y = (i / W) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (t1 !== t2) { tDel.set(t1, (tDel.get(t1) ?? 0) + 1); tAdd.set(t2, (tAdd.get(t2) ?? 0) + 1); }
        if (w1 !== w2) { wDel.set(w1, (wDel.get(w1) ?? 0) + 1); wAdd.set(w2, (wAdd.get(w2) ?? 0) + 1); }
      }
    }
    const srt = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}:${n}`).join(' ');
    console.log(`[108c2 x86 delta 039→040] changed=${chg} bbox x[${minx === 1e9 ? '-' : minx}..${maxx < 0 ? '-' : maxx}] y[${miny === 1e9 ? '-' : miny}..${maxy < 0 ? '-' : maxy}]`);
    console.log(`  typeAdd ${srt(tAdd)}`);
    console.log(`  typeDel ${srt(tDel)}`);
    console.log(`  wallAdd ${srt(wAdd)}`);
    console.log(`  wallDel ${srt(wDel)}`);
  }
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const cells: Array<{ x: number; y: number; desc: string }> = [];
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; cells.push({ x: i % W, y: (i / W) | 0, desc: `act ${va}>${ja} t ${va ? xt[i] : '-'}>${ja ? SHEET[st.type[i]!] ?? 9999 : '-'}` }); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); cells.push({ x: i % W, y: (i / W) | 0, desc: `t ${vt}>${jt}` }); continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; cells.push({ x: i % W, y: (i / W) | 0, desc: `w ${xw[i]}>${st.wall[i]}` }); continue; }
    if (xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; continue; }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; fI = fI < 0 ? i : fI; continue; }
  }
  console.log(`DIFF A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  const show = cells.slice(0, Number(process.env.SW_PYR_NCELLS ?? 40));
  for (const c of show) console.log(`  (${c.x},${c.y}) ${c.desc}`);
  writeFileSync(`${OUT}/diffcells.json`, JSON.stringify(cells));
}, 600_000);

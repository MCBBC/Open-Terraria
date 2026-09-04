// IIII107c 批：iamerror 链 #32 Dungeon 尖刺海/粉砖海定谳单窗反演重放。
// 克隆 _ii102gp CAP/RE 骨架，靶 = errorWorld 链 mile8 首差 #032_Dungeon。
// ① CAP：全量生成，在 ▶Dungeon reseed 时点深拷贝 store 全通道 + gs
// ② RE：hydrate → new RNG(seed) → runDungeonPass → 对拍 G2 dump#Dungeon 八通道；
//    SW_107C_SAVEAFTER=1 落 jsafter 全通道；SW_107C_DELTA=1 打印 JS 写迹直方图；
//    SW_107C_ROLLCAP=<file> 落 pass 内掷值流（R|seq|value，与 x86 rig SW_ROLLLOG 同构）；
//    SW_107C_ROLLSTACK=k 在第 k 个样本时打印 JS 消费端调用栈。
// 用法：
//   SW_107CCAP=1 SW_107C_OUT=/tmp/iii145-out/cap-dg SW_107C_SEED='1.1.1.0.iamerror|106103' \
//     npx vitest run tools/_iii107c-dg.test.ts
//   SW_107CRE=1 SW_107C_OUT=/tmp/iii145-out/cap-dg SW_107C_G2=$HOME/GoldenChains/i106/x86-iamerror \
//     SW_107C_CMP=Dungeon SW_107C_BASE=Slush [SW_107C_SAVEAFTER=1] [SW_107C_DELTA=1] \
//     [SW_107C_ROLLCAP=/tmp/iii145-out/js-rl.txt] [SW_107C_ROLLSTACK=k] \
//     npx vitest run tools/_iii107c-dg.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';

const RUN_CAP = process.env.SW_107CCAP === '1';
const RUN_RE = process.env.SW_107CRE === '1';
const OUT = process.env.SW_107C_OUT ?? '/tmp/iii145-out/cap-dg';
const G2 = process.env.SW_107C_G2 ?? '';
const LABEL = process.env.SW_107C_LABEL ?? 'Dungeon';
const CMP_NAME = process.env.SW_107C_CMP ?? 'Dungeon';
const BASE_NAME = process.env.SW_107C_BASE ?? 'Slush';
const W = Number(process.env.SW_107C_W ?? 4200), H = Number(process.env.SW_107C_H ?? 1200), N = W * H;
const SEED = process.env.SW_107C_SEED ?? '';
const EVIL = Number(process.env.SW_107C_EVIL ?? -1);
const SAVEAFTER = process.env.SW_107C_SAVEAFTER === '1';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
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
  if (!SEED) throw new Error('SW_107C_SEED required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii107c')) {
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

(RUN_RE ? it : it.skip)(`replay dungeon window on base vs x86 dump#${CMP_NAME}`, () => {
  if (!G2) throw new Error('SW_107C_G2 required');
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
  const { st, gs } = hydrate();
  // 基座自检（对上层 dump=BASE）——全通道
  {
    const bt = le16(`${pre(BASE)}.typ`), ba = readFileSync(`${pre(BASE)}.act`);
    const bw = le16(`${pre(BASE)}.wal`), bl = readFileSync(`${pre(BASE)}.liq`);
    const bhf = readFileSync(`${pre(BASE)}.half`), bsl = readFileSync(`${pre(BASE)}.slope`);
    const blt = readFileSync(`${pre(BASE)}.lty`), bia = readFileSync(`${pre(BASE)}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i] & 1;
      if (ba[i] !== ja) { dA++; continue; }
      if (ja && bt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) { dT++; continue; }
      if (bw[i] !== st.wall[i]) dW++;
      if (bl[i] !== st.liquid[i]) dL++;
      if (bhf[i] !== st.half[i]) dHf++;
      if (bsl[i] !== st.slope[i]) dSl++;
      const vl = bl[i]! > 0 ? blt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) dLt++;
      if ((bia[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    }
    console.log(`[base selfcheck vs ${BASE_NAME}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
    if (dA || dT || dW || dL || dHf || dSl || dLt || dIa) throw new Error('base drift — snapshot stale, re-capture');
  }
  const rng = new RNG(gs.seed);
  // ★107c 掷值流窗口捕获（与 x86 rig SW_ROLLLOG 同构：UnifiedRandom.InternalSample 唯一出口）
  const ROLLCAP = process.env.SW_107C_ROLLCAP;
  const ROLLSTACK = Number(process.env.SW_107C_ROLLSTACK ?? 0);
  const ROLLSTACK2 = Number(process.env.SW_107C_ROLLSTACK2 ?? 0);
  let rollSeq = 0;
  const oOnRoll = (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll;
  const rollRows: number[] = [];
  let inst406: { next(): number } | null = null;
  const instHist = new Map<object, number[]>();
  if (ROLLCAP || ROLLSTACK > 0 || ROLLSTACK2 > 0) {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
      rollSeq++;
      rollRows.push(v);
      let h = instHist.get(inst);
      if (!h) { h = []; instHist.set(inst, h); }
      h.push(v);
      if ((rollSeq === ROLLSTACK && ROLLSTACK > 0) || (rollSeq === ROLLSTACK2 && ROLLSTACK2 > 0)) {
        const stack = (new Error().stack ?? '').split('\n').filter((l) => l.includes('/src/')).slice(0, 9);
        console.log(`[107c] roll#${rollSeq} value=${v}\n${stack.join('\n')}`);
        inst406 = inst as { next(): number };
      }
    };
  }
  // MARK 段级掷账（与 x86 rig _mark61 同位对拍用）
  const MARKLOG = process.env.SW_107C_MARKLOG;
  if (MARKLOG) {
    (globalThis as { __wvLines?: string[] }).__wvLines = [];
    (globalThis as { __swWvLog?: unknown }).__swWvLog = { on: true };
  }
  try {
    runDungeonPass(st, rng, gs, [], () => {});
  } finally {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = oOnRoll;
    // ★fork 实证：#406 实例的后续采样 == x86 窗口 #407..#737 的 331 样本块？
    if (inst406 && existsSync('/tmp/iii145-out/x86-dg-window.txt')) {
      const xw2 = readFileSync('/tmp/iii145-out/x86-dg-window.txt', 'utf8').split('\n');
      const xvals = xw2.slice(406, 406 + 331).map((l) => l.split('|')[2]);
      const inst2 = inst406 as unknown as { next(): number };
      const cont: number[] = [];
      for (let i = 0; i < 6000; i++) cont.push(inst2.next());
      const head = xvals[0];
      const hits: number[] = [];
      for (let k = 0; k < cont.length - 340; k++) if (String(cont[k]) === head) hits.push(k);
      for (const k of hits.slice(0, 5)) {
        const ok = xvals.every((v, i) => String(cont[k + i]) === v);
        console.log(`[107c] fork-block probe: block found at continuation offset k=${k} full331match=${ok}`);
      }
      if (hits.length === 0) {
        console.log('[107c] fork-block probe: no hit within 6000-sample continuation');
        // ★全实例状态快照搜索：对 pass 内每个 UnifiedRandom 实例，快照→消费 400 样本
        //   找 block 头→331 全匹配验证→恢复。命中者=x86 超耗实例（JS 侧已停采）。
        const head3 = xvals.slice(0, 3);
        let hitInfo = '';
        for (const [inst2, hist] of instHist) {
          const rec = inst2 as unknown as { seedArray: Int32Array; inext: number };
          if (!rec.seedArray) continue;
          const saSave = Int32Array.from(rec.seedArray);
          const ixSave = rec.inext;
          const probe: number[] = [];
          const asU = inst2 as unknown as { next(): number };
          for (let i = 0; i < 400; i++) probe.push(asU.next());
          rec.seedArray.set(saSave); rec.inext = ixSave;
          const at = probe.findIndex((v, i) => String(v) === head3[0] && i + 331 <= probe.length
            && xvals.every((x, j) => String(probe[i + j]) === x));
          if (at >= 0) {
            hitInfo = `inst histLen=${hist.length} firstVal=${hist[0]} lastVal=${hist[hist.length - 1]} blockAtContinuationOffset=${at}`;
            break;
          }
        }
        console.log(`[107c] fork-block instance sweep: ${hitInfo || 'no instance hit'}`);
      }
    }
    if (ROLLCAP) {
      writeFileSync(ROLLCAP, rollRows.map((v, i) => `R|${i + 1}|${v}`).join('\n') + '\n');
      console.log(`[107c] rollcap rows=${rollRows.length} -> ${ROLLCAP}`);
    }
    if (MARKLOG) {
      const L = (globalThis as { __wvLines?: string[] }).__wvLines ?? [];
      writeFileSync(MARKLOG, L.join('\n') + '\n');
      (globalThis as { __swWvLog?: unknown }).__swWvLog = undefined;
    }
  }
  // ★终态导出（sheet 域全通道）——离线对拍 x86 写迹（dump#BASE→#CMP 的写集）
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
    console.log('[107c] jsafter saved (8ch)');
  }
  // ★107c 写迹对形：JS 基座→pass 终态 delta（sheet 域直方图+bbox），与 x86 031→032 对形
  if (process.env.SW_107C_DELTA === '1') {
    const bFlags = readFileSync(`${OUT}/base_flags.bin`);
    const bT = le16(`${OUT}/base_type.bin`), bW = le16(`${OUT}/base_wall.bin`);
    const bL = readFileSync(`${OUT}/base_liquid.bin`), bHf = readFileSync(`${OUT}/base_half.bin`),
      bSl = readFileSync(`${OUT}/base_slope.bin`), bLt = readFileSync(`${OUT}/base_liquidType.bin`),
      bIa = readFileSync(`${OUT}/base_wire.bin`);
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
    console.log(`[107c JS delta] changed=${chg} bbox x[${minx === 1e9 ? '-' : minx}..${maxx < 0 ? '-' : maxx}] y[${miny === 1e9 ? '-' : miny}..${maxy < 0 ? '-' : maxy}]`);
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
  const show = cells.slice(0, Number(process.env.SW_107C_NCELLS ?? 40));
  for (const c of show) console.log(`  (${c.x},${c.y}) ${c.desc}`);
  writeFileSync(`${OUT}/diffcells.json`, JSON.stringify(cells));
}, 600_000);

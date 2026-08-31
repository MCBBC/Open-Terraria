// IIII98（2026-08-31）REMIX 滚动清扫直通仪 —— _iii100tm 范式泛化（链式多段版）。
// ① SW_TM_CAP=1：一次全量生成，在多个 ▶label reseed 时点各深拷贝 store 全通道+gs+chests
//    → $OUT/base_<LABEL>/*（SW_TM_LABELS 逗号清单，缺省 UndergroundHousesAndBuriedChests）。
// ② SW_TM_REPLAY=1：hydrate $OUT/<BASE> 基座 → 基座自检（vs 基段 dump-1）→ 按
//    SW_TM_CHAIN 清单逐段执行 pass 函数并每段末对拍 G2 dump（八通道）+ 导出
//    m_*.bin（sheet 空间）+ 全量差异格报告 rep-<seg>.txt —— 供离线 cell 级分析。
//    CHAIN 段名：uhbc / surf / junc / uwat( underwater) / water / spider …
// 用法：
//   cd game && SW_MB_1457=1 SW_TM_CAP=1 npx vitest run tools/_iii104tm.test.ts
//   cd game && SW_MB_1457=1 SW_TM_REPLAY=1 \
//     SW_TM_OUT=/tmp/iii104-out SW_TM_BASE=base_UndergroundHousesAndBuriedChests \
//     SW_TM_CHAIN="uhbc,surf" SW_TM_CMP="uhbc:59,surf:60" \
//     npx vitest run tools/_iii104tm.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import {
  runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass,
  runWaterChestsPass, placeBuriedChest,
} from '../src/world/gen/vanilla/BuriedChestsPass';
import { runJungleChestsPass } from '../src/world/gen/vanilla/JungleShrinePass';
import { runUnderwaterChestsPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { runSpiderNestPass } from '../src/world/gen/vanilla/HiveSpiderPass';

const OUT = process.env.SW_TM_OUT ?? '/tmp/iii104-out';
const G2 = process.env.SW_TM_G2 ?? '/tmp/iii89-out/rigb/dumps';
const SEED = process.env.SW_TM_SEED ?? '1138154190';   // rig world remix-i85（G2 同种子）
const EVIL = Number(process.env.SW_TM_EVIL ?? 0);
const W = 4200, H = 1200, N = W * H;
const RUN_CAP = process.env.SW_TM_CAP === '1';
const RUN_RE = process.env.SW_TM_REPLAY === '1';

let SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
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

/** ★IIIII98 房屋阶段探针组（双模式共用；写 HK| 行到指定文件）
 *  __swHouseGate/__swHouseMk/__swHouseRooms/__swHouseEv/__swHouseStage 全接线。 */
function wireHouseHooks(file: string, on: () => boolean): void {
  const wr = (s: string): void => { if (!on()) return; try { appendFileSync(file, s + '\n'); } catch { /* */ } };
  const gt = globalThis as unknown as {
    __swHouseGate?: (gate: string, x: number, y: number) => void;
    __swHouseMk?: (n: string, s?: string | number, t?: string | number) => void;
    __swHouseRooms?: (ox: number, oy: number, rooms: string) => void;
    __swHouseEv?: (phase: string, x: number, y: number) => void;
    __swHouseStage?: (tag: string, a: number, b: number, c: number, d: number) => void;
  };
  gt.__swHouseGate = (g, x, y) => wr(`HKG|${g}|${x}|${y}`);
  gt.__swHouseMk = (n, s, t) => wr(`HKM|${n}${s !== undefined ? `|${s}` : ''}${t !== undefined ? `|${t}` : ''}`);
  gt.__swHouseRooms = (ox, oy, r) => wr(`HKR|${ox},${oy}|${r}`);
  gt.__swHouseEv = (p, x, y) => wr(`HKE|${p}|${x}|${y}`);
  gt.__swHouseStage = (t2, a, b, c, d) => wr(`HKS|${t2}|${a},${b}|${c},${d}`);
}

(RUN_CAP ? it : it.skip)('capture base(s) at labels', async () => {
  if (!SEED || !G2) throw new Error('SW_TM_SEED/SW_TM_G2 required');
  // ★IIIII98：CAP 全程耗骰计数（placeBuriedChest lend 探针消费）
  const gG = globalThis as unknown as { __swOnRoll?: (v: number, inst: object) => void; __swRollN?: number };
  const oRollCap = gG.__swOnRoll;
  let capN = 0;
  gG.__swOnRoll = () => { capN++; gG.__swRollN = capN; };
  // ★IIIII98 尝试流仪：SW_TM_CAP_AB=1 时全程捕获 placeBuriedChest 尝试序(ab|abx)
  const CAPAB = process.env.SW_TM_CAP_AB;
  if (CAPAB && existsSync(CAPAB)) { try { unlinkSync(CAPAB); } catch { /* */ } }
  const LABELS = (process.env.SW_TM_LABELS ?? 'UndergroundHousesAndBuriedChests').split(',').filter(Boolean).map((s) => s.trim());
  // ★IIIII98 尝试流窗口：从 SW_TM_AB_FROM 标签起、SW_TM_AB_TO 标签止（缺省关闭）
  const ABFROM = process.env.SW_TM_AB_FROM ?? '';
  const ABTO = process.env.SW_TM_AB_TO ?? '';
  let abWinOn = false;
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
  const pending = new Set(LABELS);
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && (pending.size > 0 || (CAPAB && abWinOn))) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii104tm')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (CAPAB) {
            if (ABFROM && lab === ABFROM && !abWinOn) {
              abWinOn = true;
              try { appendFileSync(CAPAB, `>>${lab}\n`); } catch { /* */ }
            }
            if (ABTO && lab === ABTO && abWinOn) {
              abWinOn = false;
              try { appendFileSync(CAPAB, `<<${lab}\n`); } catch { /* */ }
            }
          }
          if (pending.has(lab)) {
            const dir = `${OUT}/base_${lab}`;
            mkdirSync(dir, { recursive: true });
            serializeStore(liveStore!, dir);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${dir}/base_gs.json`, JSON.stringify(serVal(gs)));
            // chests sink 快照（重放段所需——近箱拒/锚集依赖世界箱表）
            const chests = (worldRef.chests ?? []) as ChestSink;
            writeFileSync(`${dir}/base_chests.json`, JSON.stringify(chests));
            console.log(`captured @${lab} out=${dir} chests=${chests.length}`);
            pending.delete(lab);
          }
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  let worldRef: { chests?: ChestSink } = {};
  if (CAPAB) {
    (globalThis as unknown as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv =
      (p, i, j, x) => { if (!abWinOn) return; try { appendFileSync(CAPAB, `${p}|${i}|${j}|${x}\n`); } catch { /* */ } };
    if (process.env.SW_TM_CAP_HOUSE === '1') wireHouseHooks(CAPAB, () => abWinOn);
  }
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; worldRef = w2 as never; },
    });
  } finally { RNGp.reseed = oReseed; gG.__swOnRoll = oRollCap; }
  // 跨槽上下文落盘（重放端 hydrate 用）
  try {
    const jc = (globalThis as { __swJCSpots?: unknown }).__swJCSpots;
    if (jc !== undefined) writeFileSync(`${OUT}/ctx_jcspots.json`, JSON.stringify(jc));
    const ot = (globalThis as { __swOceanTreasures?: unknown }).__swOceanTreasures;
    if (ot !== undefined) writeFileSync(`${OUT}/ctx_oceantreasures.json`, JSON.stringify(ot));
  } catch { /* ignore */ }
  if (pending.size > 0) throw new Error(`capture failed: 未命中 [${[...pending].join(',')}]`);
}, 600_000);

function hydrate(baseDir: string): { st: TileStore; gs: GenState; chests: ChestSink } {
  const hdr = JSON.parse(readFileSync(`${baseDir}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${baseDir}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch ${buf.length} != ${len * bytesPer}`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${baseDir}/base_gs.json`, 'utf8'))) as GenState;
  const chests = JSON.parse(readFileSync(`${baseDir}/base_chests.json`, 'utf8')) as ChestSink;
  return { st, gs, chests };
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

interface Face { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }

/** store → sheet 空间八通道快照。
 * ★IIIII98 勘误（初版曾跳过 inactive 格）：x86 dump 的 wal/liq/half/slope/lty
 * 在**非活性格照样有值**（基座与 dump058 字节级全等实证），face 必须全格逐值搬运,
 * 仅 type 走活性门（与 mile8 口径一致）。 */
function faceOf(st: TileStore): Face {
  const t = new Uint16Array(N), w = new Uint16Array(N), l = new Uint8Array(N);
  const hf = new Uint8Array(N), sl = new Uint8Array(N), lt = new Uint8Array(N), ia = new Uint8Array(N);
  const a = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    a[i] = st.flags[i]! & 1;
    w[i] = st.wall[i]!;
    l[i] = st.liquid[i]!;
    hf[i] = st.half[i]!;
    sl[i] = st.slope[i]!;
    ia[i] = ((st.wire[i]! >>> 5) & 1) ? 1 : 0;
    lt[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;  // vanilla 0 基
    if (a[i]) {
      const sh = SHEET[st.type[i]!];
      t[i] = sh >= 0 ? sh : 9999;
    }
  }
  return { t, a, w, l, hf, sl, lt, ia };
}

/** 两八通道面全量对拍；diff 行写文件（cap 上限 MAXROWS），返回计数 */
function diffFaces(tag: string, xf: DumpCh, jf: Face, rowsOut: string[] | null, maxRows = 200000): string {
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  const pair = new Map<string, number>();
  const pushPair = (k: string) => pair.set(k, (pair.get(k) ?? 0) + 1);
  for (let i = 0; i < N; i++) {
    const va = xf.xa[i]!, ja = jf.a[i]!;
    const mk = (d: string): string => `${tag} (${i % W},${Math.floor(i / W)}) ${d}`;
    if (va !== ja) {
      dA++;
      pushPair(`T${xf.xt[i]}>${jf.t[i]}`);            // mile8 口径：act 差格也入 T 对
      rowsOut?.push(mk(`A x86=${va} js=${ja} T x86=${xf.xt[i]} js=${jf.t[i]}`));
      continue;
    }
    if (xf.xw[i] !== jf.w[i]) { dW++; rowsOut?.push(mk(`W ${xf.xw[i]}>${jf.w[i]} act=${va} T x=${xf.xt[i]} j=${jf.t[i]}`)); continue; }
    if (xf.xl[i] !== jf.l[i]) { dL++; rowsOut?.push(mk(`L ${xf.xl[i]}>${jf.l[i]} act=${va} T x=${xf.xt[i]} j=${jf.t[i]}`)); continue; }

    if (xf.xhf[i] !== jf.hf[i]) { dHf++; pushPair(`Hf${xf.xhf[i]}>${jf.hf[i]}`); rowsOut?.push(mk(`Hf ${xf.xhf[i]}>${jf.hf[i]}`)); continue; }
    if (xf.xsl[i] !== jf.sl[i]) { dSl++; pushPair(`Sl${xf.xsl[i]}>${jf.sl[i]}`); rowsOut?.push(mk(`Sl ${xf.xsl[i]}>${jf.sl[i]}`)); continue; }
    const vl = xf.xl[i]! > 0 ? xf.xlt[i]! + 1 : 0;
    const jl = jf.l[i]! > 0 ? jf.lt[i]! + 1 : 0;
    if (vl !== jl) { dLt++; pushPair(`Lt${vl}>${jl}`); continue; }
    if (xf.xia[i] !== jf.ia[i]) { dIa++; continue; }
    if (va && xf.xt[i] !== jf.t[i]) {
      dT++;
      pushPair(`T${xf.xt[i]}>${jf.t[i]}`);
      rowsOut?.push(mk(`T ${xf.xt[i]}>${jf.t[i]}`));
    }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  const pairs = [...pair.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ');
  console.log(`[${tag}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} ${bad ? '✗' : '✓'}${pairs ? ` pairs: ${pairs}` : ''}`);
  return `A=${dA}/T=${dT}/W=${dW}/L=${dL}/Hf=${dHf}/Sl=${dSl}/Lt=${dLt}/Ia=${dIa}`;
}

/** JS 写迹：before→after 差异格坐标列表（act/type/wall/liquid 任一变化即记） */
function jsWriteFace(before: Face, after: Face, tag: string, maxRows = 120000): void {
  const lines: string[] = [];
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (before.a[i] !== after.a[i] || before.t[i] !== after.t[i] || before.w[i] !== after.w[i]
      || before.l[i] !== after.l[i] || before.hf[i] !== after.hf[i] || before.sl[i] !== after.sl[i]) {
      n++;
      if (lines.length < maxRows) {
        lines.push(`${tag} (${i % W},${Math.floor(i / W)}) act ${before.a[i]}>${after.a[i]} typ ${before.t[i]}>${after.t[i]} wal ${before.w[i]}>${after.w[i]} liq ${before.l[i]}>${after.l[i]} hf ${before.hf[i]}>${after.hf[i]} sl ${before.sl[i]}>${after.sl[i]}`);
      }
    }
  }
  console.log(`[jsWriteFace ${tag}] changed cells = ${n}`);
  if (lines.length > 0) appendFileSync(`${OUT}/jswrite-${tag}.txt`, lines.join('\n') + '\n');
}

(RUN_RE ? it : it.skip)('replay chain on base vs G2 dumps', () => {
  const BASE = process.env.SW_TM_BASE ?? '';
  if (!BASE) throw new Error('SW_TM_BASE required');
  const baseDir = BASE.includes('/') ? BASE : `${OUT}/${BASE}`;
  const chainPairs = (process.env.SW_TM_CHAIN ?? 'uhbc').split(',').map((s) => s.trim()).filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^([\w+]+)(?::(\d+))?$/);
      if (!m) throw new Error(`bad chain seg ${seg}`);
      return { seg: m[1], cmp: m[2] !== undefined ? Number(m[2]) : null };
    });
  const { st, gs, chests } = hydrate(baseDir);
  // 跨槽上下文装载（CAP 端落盘的 JSON——重放进程无 live stash）
  try {
    const gj = globalThis as unknown as Record<string, unknown>;
    if (gj.__swJCSpots === undefined && existsSync(`${OUT}/ctx_jcspots.json`)) {
      gj.__swJCSpots = JSON.parse(readFileSync(`${OUT}/ctx_jcspots.json`, 'utf8'));
    }
    if (gj.__swOceanTreasures === undefined && existsSync(`${OUT}/ctx_oceantreasures.json`)) {
      gj.__swOceanTreasures = JSON.parse(readFileSync(`${OUT}/ctx_oceantreasures.json`, 'utf8'));
    }
  } catch { /* ignore */ }
  console.log(`gs: seed=${gs.seed} flags=${JSON.stringify(gs.seedFlags)} ws=${gs.worldSurface.toFixed(2)} rock=${gs.rockLevel.toFixed(2)} side=${gs.dungeonSide} h=${st.h}`);
  if (process.env.SW_TM_DEBUG) {
    const ix = 70 * W + 3701;
    console.log(`[dbg] ix=${ix} fl=${st.flags[ix]} liq=${st.liquid[ix]} lty=${st.liquidType[ix]} typ=${st.type[ix]} wal=${st.wall[ix]} half=${st.half[ix]} slope=${st.slope[ix]}`);
    // 逐通道与原文件对齐校验（hydration 通道偏移定位）
    for (const c of CHANS) {
      const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
      const fbuf = readFileSync(`${baseDir}/base_${c}.bin`);
      const arr = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
      let mm = 0, firstm = -1;
      for (let k = 0; k < N && k < arr.length; k++) {
        const fv = bytesPer === 2 ? fbuf[k * 2] | (fbuf[k * 2 + 1] << 8) : fbuf[k];
        if (fv !== arr[k]) { mm++; if (firstm < 0) firstm = k; }
      }
      console.log(`[dbg] chan ${c}: mismatches=${mm}${mm ? ` first@${firstm % W},${Math.floor(firstm / W)} file=${fbuf[firstm * bytesPer]} arr=${arr[firstm]}` : ''}`);
    }
  }
  mkdirSync(OUT, { recursive: true });

  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void; __swRollN?: number };
  const oOnRoll = g.__swOnRoll;
  let rollN = 0;
  if (process.env.SW_TM_REP_HOUSE) {
    wireHouseHooks(`${OUT}/rep-house.txt`, () => true);
  }
  const ROLLLOG = process.env.SW_TM_ROLLLOG;
  const ROLLCTX = process.env.SW_TM_ROLLCTX === '1';
  const rollBuf: string[] = [];
  // 调用点标签（SW_TM_ROLLCTX=1 时每掷取栈，代价高——仅小窗取证用）
  const ctxCache = new Map<string, string[]>();
  const siteOf = (): string => {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng')) {
        const f = m[1];
        let src = ctxCache.get(f);
        if (!src) { try { src = readFileSync(f, 'utf8').split('\n'); } catch { src = []; } ctxCache.set(f, src); }
        return `${f.replace(/^.*?(src\/)/, '$1')}:${m[2]}`;
      }
    }
    return '?';
  };
  g.__swOnRoll = (v) => {
    rollN++;
    g.__swRollN = rollN;
    if (ROLLLOG) rollBuf.push(`${rollN}|${v}${ROLLCTX ? '|' + siteOf() : ''}`);
  };

  // 段注册表：与 WorldGen.statuesChestsSlot 的编排逐句同构（reseed 属骨架,不在此层）
  type Ctx = { st: TileStore; rng: RNG; gs: GenState; chests: ChestSink };
  const REG: Record<string, { run: (c: Ctx) => void }> = {
    uhbc: {
      run: ({ st, rng, gs, chests }) => {
        flipGenSolid([226, 162, 225, 190], true);   // cs:17076-79 #58 头四翻
        rollHouseChestCounts(st, rng, gs);          // cs:17081-84 四计数连掷
        runBuriedChestsPass(st, rng, gs, chests);
        runUnderworldChestsPass(st, rng, gs, chests);
        runCaveHousesPass(st, rng, gs, chests);
        flipGenSolid([226, 162, 225, 190], false);  // cs:17220-23 尾四翻
      },
    },
    surf: { run: ({ st, rng, gs, chests }) => runSurfaceChestsPass(st, rng, gs, chests) },
    // ★IIIII98 分相拆解：cavesOnly（flip+四计数+洞穴箱+地狱箱）、housesOnly（小屋）、
    //   组合等价于 uhbc——用于把「箱子成败流」与管线 ab 日志逐条对位
    cavesOnly: {
      run: ({ st, rng, gs, chests }) => {
        flipGenSolid([226, 162, 225, 190], true);
        rollHouseChestCounts(st, rng, gs);
        runBuriedChestsPass(st, rng, gs, chests);
        runUnderworldChestsPass(st, rng, gs, chests);
        flipGenSolid([226, 162, 225, 190], false);
      },
    },
    housesOnly: { run: ({ st, rng, gs, chests }) => runCaveHousesPass(st, rng, gs, chests) },
    junc: {
      run: ({ st, rng, gs, chests }) => {
        const spots = (globalThis as { __swJCSpots?: Array<{ x: number; y: number }> }).__swJCSpots ?? [];
        if (spots.length === 0) console.log('  [junc] 警告:__swJCSpots 空(dualDungeons 或漏捕)');
        runJungleChestsPass(st, rng, gs, chests, spots);
      },
    },
    uwat: { run: ({ st, rng, gs, chests }) => {
      const tre = (globalThis as { __swOceanTreasures?: Array<{ x: number; y: number }> }).__swOceanTreasures ?? [];
      if (tre.length === 0) console.log('  [uwat] 警告:__swOceanTreasures 空(普通链应有宝藏点)');
      runUnderwaterChestsPass(st, rng, gs, chests, tre);
    } },
    water: { run: ({ st, rng, gs, chests }) => runWaterChestsPass(st, rng, gs, chests) },
    spider: { run: ({ st, rng, gs, chests }) => runSpiderNestPass(st, rng, gs, chests) },
  };
  // 组合别名（一个原版 pass 内两 runner、比较在末）
  REG.uwatw = { run: (c) => { REG.uwat.run(c); REG.water.run(c); } };
  REG.none = { run: () => {} };   // 基座直拍（零动作对拍——验证基座≡dump CMP）

  // 单投掷调试钩：AddBuriedChest 值流标签（III98 仪具面,正常空转）
  try {
    (globalThis as unknown as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv =
      (p, i, j, x) => { if (process.env.SW_TM_AB) appendFileSync(`${OUT}/ablog.txt`, `${p}|${i}|${j}|${x}\n`); };
  } catch { /* ignore */ }
  const wantAB = process.env.SW_TM_AB;

  try {
    for (const cp of chainPairs) {
      const fn = REG[cp.seg];
      if (!fn) throw new Error(`chain seg 不存在: ${cp.seg}（已知:${Object.keys(REG).join(',')})`);
      const beforeFace = faceOf(st);
      rollN = 0;
      fn.run({ st, rng: new RNG(gs.seed), gs, chests });
      console.log(`[${cp.seg}] samples=${rollN}${wantAB ? ' (ablog)' : ''}`);
      appendFileSync(`${OUT}/rep-samples.log`, `${new Date().toISOString()} ${cp.seg} base=${BASE} chain=${chainPairs.map((c) => c.seg).join('+')} samples=${rollN}\n`);
      if (ROLLLOG) appendFileSync(ROLLLOG, rollBuf.join('\n') + '\n');
      // 段后箱表快照（对照管线基座箱数与各相新增）
      writeFileSync(`${OUT}/rep-${cp.seg}-chests.json`, JSON.stringify(chests));
      if (cp.cmp != null) {
        const xd = loadDump(cp.cmp);
        const rfile = `${OUT}/rep-${cp.seg}.txt`;
        try { if (existsSync(rfile)) copyFileSync(rfile, `${rfile}.prev`); } catch { /* first run */ }
        const rows: string[] = [];
        const stat = diffFaces(`${cp.seg} vs #${cp.cmp}_${xd.nm}`, xd, faceOf(st), rows);
        writeFileSync(rfile, rows.join('\n') + '\n');
        const jf0 = null;
        void jf0;
        jsWriteFace(beforeFace, faceOf(st), cp.seg);
        console.log(`   -> stat ${stat}; diffcells=${rows.length} @ ${rfile}`);
        // 排位对比:JS 写迹里命中 x86 差异格附近 ±6 的上下文已在 rows 内,不再展开
      } else {
        jsWriteFace(beforeFace, faceOf(st), cp.seg);
      }
    }
  } finally { g.__swOnRoll = oOnRoll; }
}, 900_000);

void placeBuriedChest; void SHEET;

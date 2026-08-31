// IIII106（IIIII98b 批）：jagged #37 Create_Ocean_Caves 单 pass 反演重放（克隆 _iii98tm 模式）。
// ① SW_OC_CAP=1：全量生成 jagged 种子，在 ▶OceanCaves reseed 时点深拷贝 store 全通道+gs
//    → $OUT/base_*（该时点 state=dump036_Gravitating_Sand 终态，#36 已绿）。
// ② SW_OC_REPLAY=1：hydrate 基座 → 基座自检(vs #036) → runOceanCavesPass 对拍
//    dump#CMP(默认 37 Create_Ocean_Caves) 八通道；同时写 x86 邻差动作图与 JS 动作图。
// 用法：cd game && SW_OC_CAP=1 npx vitest run tools/_iii106oc.test.ts --no-file-parallelism
//       cd game && SW_OC_REPLAY=1 npx vitest run tools/_iii106oc.test.ts --no-file-parallelism
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runOceanCavesPass } from '../src/world/gen/vanilla/OceanCavesPass';
import { snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_OC_CAP === '1';
const RUN_RE = process.env.SW_OC_REPLAY === '1';
const OUT = process.env.SW_OC_OUT ?? '/tmp/iii106-out';
const G2 = process.env.SW_OC_G2 ?? '/tmp/iii80-out/x86-jagged';
const CMP_IDX = Number(process.env.SW_OC_CMP ?? 37);
const BASE_IDX = Number(process.env.SW_OC_BASE ?? 36);
const SEED = process.env.SW_OC_SEED ?? '771005';   // rig world jagged 种子（G2 同种子）
const EVIL = Number(process.env.SW_OC_EVIL ?? 0);
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

(RUN_CAP ? it : it.skip)('capture base at OceanCaves pass head (jagged)', async () => {
  if (!SEED || !G2) throw new Error('SW_OC_SEED/SW_OC_G2 required');
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii106oc')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'OceanCaves') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            // 生成期实心覆写快照（▶OceanCaves 时点，转写器 SolidTile 口径用）
            writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
            console.log(`captured @${lab} out=${OUT}`);
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
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: OceanCaves label never hit');
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

/** dump idx 相对 dump BASE 的动作图：
 *  bit0=act+, bit1=act-, bit2=typ 变(活性), bit3=wall 变, bit4=liquid 255 置位,
 *  bit5=liquid 清零/变低, bit6=inact 置位(致动), bit7=hardsand(397) 写入 */
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
    if (b.xa[i] === 1 && b.xt[i] === 397 && a.xt[i] !== 397) bits |= 128;
    if (bits) map[i] = bits;
  }
  return map;
}

/** 动作图聚类摘要：按连通簇（同 y 行内连续 ≥1，行距 ≤2 合并）输出最大簇清单 */
function clusterSummary(map: Uint8Array, mask: number, topK: number): string[] {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) if ((map[i]! & mask) && map[i]! !== undefined) pts.push([i % W, Math.floor(i / W)]);
  // 行分组→runs
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
  let fI = -1;
  const samples: string[] = [];
  const mark = (i: number, desc?: string): void => {
    if (fI < 0) fI = i;
    if (desc && samples.length < 12) samples.push(`(${i % W},${Math.floor(i / W)}) ${desc}`);
  };
  for (let i = 0; i < N; i++) {
    const va = d.xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; mark(i, `A ${va}>${ja}`); continue; }
    const vt = va ? d.xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) {
      dT++; mark(i, `T ${vt}>${jt}`);
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      continue;
    }
    if (d.xw[i] !== st.wall[i]) { dW++; mark(i, `W ${d.xw[i]}>${st.wall[i]}`); continue; }
    if (d.xl[i] !== st.liquid[i]) { dL++; mark(i, `L ${d.xl[i]}>${st.liquid[i]}`); continue; }
    if (d.xhf[i] !== st.half[i]) { dHf++; mark(i, `Hf ${d.xhf[i]}>${st.half[i]}`); continue; }
    if (d.xsl[i] !== st.slope[i]) { dSl++; mark(i, `Sl ${d.xsl[i]}>${st.slope[i]}`); continue; }
    const vl = d.xl[i]! > 0 ? d.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; mark(i, `Lt ${vl}>${jl}`); continue; }
    const via = d.xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; mark(i, `Ia ${via}>${jia}`); continue; }
    if (!va) {
      const vg = d.xt[i]!;
      const jg = st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999);
      if (vg !== jg) {
        dGh++;
        const ghLog = process.env.SW_OC_GHLOG;
        if (ghLog) appendFileSync(ghLog, `(${i % W},${Math.floor(i / W)}) x86=${vg} js=${jg}\n`);
      }
    }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`[${tag}] vs #${idx}_${d.nm}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ${bad ? '✗' : '✓'} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`     pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const s of samples) console.log(`     ${s}`);
}

(RUN_RE ? it : it.skip)(`replay runOceanCavesPass on base vs G2 dump#${CMP_IDX}`, () => {
  const t0 = Date.now();
  const { st, gs } = hydrate();
  console.log(`gs: seed=${gs.seed} flags=${JSON.stringify(gs.seedFlags)} ws=${gs.worldSurface.toFixed(2)} rock=${gs.rockLevel.toFixed(2)} side=${gs.dungeonSide} beachDist=${gs.beachDistance} h=${st.h}`);
  // 基座自检（应≡dump BASE）
  {
    const base = loadDump(BASE_IDX);
    let dA = 0, dT = 0, dW = 0, dL = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) dA++;
      else if (va && base.xt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) dT++;
      if (base.xw[i] !== st.wall[i]) dW++;
      if (base.xl[i] !== st.liquid[i]) dL++;
    }
    console.log(`[base selfcheck vs #${BASE_IDX}_${base.nm}] dAct=${dA} dTyp=${dT} dWal=${dW} dLiq=${dL}${dA || dT || dW || dL ? ' ✗（基座≠G2 上界，反演无效！）' : ' ✓'}`);
  }
  // 值流钩（n|v 协议）
  const ROLLLOG = process.env.SW_OC_ROLLLOG;
  if (ROLLLOG) writeFileSync(ROLLLOG, '');
  let rollN = 0, rollH = 2166136261 >>> 0;
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oOnRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number) => {
    rollN++;
    rollH = ((rollH ^ (v >>> 0)) * 16777619) >>> 0;
    if (ROLLLOG) { try { appendFileSync(ROLLLOG, `${rollN}|${v}\n`); } catch { /* ignore */ } }
  };
  // 逐迭代行走轨迹钩（oceanCave 内部标记，由探针注入）
  const trace: string[] = [];
  const g3 = globalThis as unknown as { __swOcTrace?: (s: string) => void };
  g3.__swOcTrace = (s) => { if (trace.length < 40000) trace.push(s); };
  const rng = new RNG(gs.seed);
  let treasures: Array<{ x: number; y: number }> = [];
  try {
    treasures = runOceanCavesPass(st, rng, gs);
  } finally {
    g.__swOnRoll = oOnRoll;
    delete g3.__swOcTrace;
  }
  console.log(`runOceanCavesPass ${Date.now() - t0}ms rolls=${rollN} fnvHash=${rollH.toString(16)}(${rollH}) treasures=[${treasures.map((t) => `(${t.x},${t.y})`).join(',')}]`);
  if (trace.length) writeFileSync(`${OUT}/oc-trace-js.log`, trace.join('\n'));
  cmpAgainst('after-OceanCaves', CMP_IDX, st);

  // ★x86 邻差动作图 vs JS 改写集形状对账（只在启用时产出）
  if (process.env.SW_OC_SHAPE === '1') {
    const xBefore = loadDump(BASE_IDX), xAfter = loadDump(CMP_IDX);
    const w86 = actionMap(xBefore, xAfter);
    const jsBeforeMap = (() => {
      // JS before = hydrate 后原样；重跑一次拿纯基线（无改写）——用第二份 hydrate
      return null;
    })();
    void jsBeforeMap;
    // JS 改写集：直接从当前 st 与基座逐格比（cmpAgainst 已在 st 上）
    const jsmap = new Uint8Array(N);
    {
      const base = loadDump(BASE_IDX);
      for (let i = 0; i < N; i++) {
        let bits = 0;
        const ja = st.flags[i]! & 1;
        if (ja !== base.xa[i]) bits |= ja === 1 ? 1 : 2;
        if (ja === 1 && base.xa[i] === 1 && SHEET[st.type[i]!] !== base.xt[i]) bits |= 4;
        if (st.wall[i] !== base.xw[i]) bits |= 8;
        if (base.xl[i] < 250 && st.liquid[i] >= 250) bits |= 16;
        else if (base.xl[i] > 0 && st.liquid[i] !== base.xl[i]) bits |= 32;
        if (!((st.wire[i]! >>> 5) & 1) && !!(base.xia[i]! & 1)) bits |= 64;
        if (ja === 1 && base.xa[i] === 1 && st.type[i]! !== 0 && SHEET[st.type[i]!] === 397 && base.xt[i] !== 397) bits |= 128;
        if (bits) jsmap[i] = bits;
      }
    }
    for (const [nm, mp] of [['x86', w86], ['js', jsmap]] as const) {
      const total = { act: 0, actm: 0, typ: 0, wal: 0, lqf: 0, lqc: 0, ia: 0, hs: 0 };
      for (let i = 0; i < N; i++) {
        const b = mp[i]!;
        if (b & 1) total.act++; if (b & 2) total.actm++; if (b & 4) total.typ++;
        if (b & 8) total.wal++; if (b & 16) total.lqf++; if (b & 32) total.lqc++;
        if (b & 64) total.ia++; if (b & 128) total.hs++;
      }
      console.log(`[shape:${nm}] ${JSON.stringify(total)}`);
      for (const [mask, nm2] of [[16, 'water255'], [4, 'typ'], [8, 'wal'], [128, 'hs397']] as const) {
        for (const s of clusterSummary(mp, mask, 5)) console.log(`   ${nm}/${nm2}: ${s}`);
      }
    }
    writeFileSync(`${OUT}/oc-map-x86.bin`, Buffer.from(w86.buffer));
    writeFileSync(`${OUT}/oc-map-js.bin`, Buffer.from(jsmap.buffer));
  }
}, 600_000);

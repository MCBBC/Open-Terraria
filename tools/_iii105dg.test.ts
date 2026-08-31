// IIII97b 后续刀（_iii105tm 同构，窗口=Dungeon pass）：toadstool mile8 #32
// Dungeon@MountainCaveOpenings(3304,280) Sl14 残差（x86 坡位 v1..4 vs JS 0；
// dump#031 实证坡位 x86 侧 Dungeon 头即已存在 ⇒ 本窗 JS 清了它/x86 未清）。
// ① SW_I05DGCAP=1：▶Dungeon reseed 时点捕获 → /tmp/iii105-out/cap-dg。
// ② SW_I05DGREPLAY=1：hydrate → runDungeonPass（挂 __dgSegWatch 逐段监视
//    目标 14 格 slope 变化 + 全局 slope 段间差账）→ vs dump#CMP 八通道。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';

const RUN_CAP = process.env.SW_I05DGCAP === '1';
const RUN_RE = process.env.SW_I05DGREPLAY === '1';
const OUT = process.env.SW_I05_OUT ?? '/tmp/iii105-out/cap-dg';
const G2 = process.env.SW_I05_G2 ?? `${process.env.HOME}/GoldenChains/golden-toadstool`;
const CMP_IDX = Number(process.env.SW_I05_CMP ?? 32);
const SEED = process.env.SW_I05_SEED ?? '771002';
const EVIL = Number(process.env.SW_I05_EVIL ?? 0);
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

(RUN_CAP ? it : it.skip)('capture base at Dungeon pass head', async () => {
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii105dg')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Dungeon') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(lastGenState())));
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
      seedFlags: { surfaceIsMushrooms: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed');
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
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
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
}
function loadDump(idx: number) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  return {
    nm: DUMPNAME.get(idx),
    xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`), xw: le16(`${pre}.wal`),
    xl: readFileSync(`${pre}.liq`), xhf: readFileSync(`${pre}.half`), xsl: readFileSync(`${pre}.slope`),
    xlt: readFileSync(`${pre}.lty`), xia: readFileSync(`${pre}.inact`),
  };
}
function cmpAgainst(tag: string, idx: number, st: TileStore): number {
  const d = loadDump(idx);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let fI = -1;
  for (let i = 0; i < N; i++) {
    const va = d.xa[i], ja = st.flags[i] & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; continue; }
    const vt = va ? d.xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; continue; }
    if (d.xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; continue; }
    if (d.xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (d.xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (d.xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const vl = d.xl[i]! > 0 ? d.xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i] : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; continue; }
    const via = d.xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; fI = fI < 0 ? i : fI; continue; }
  }
  console.log(`[${tag}] vs #${idx}_${d.nm}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} ${dA || dT || dW || dL || dHf || dSl || dLt || dIa ? '✗' : '✓'} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  return dSl + dA + dT + dW + dL + dHf + dLt + dIa;
}

(RUN_RE ? it : it.skip)(`replay runDungeonPass with segment watch vs G2 dump#${CMP_IDX}`, () => {
  const t0 = Date.now();
  const { st, gs } = hydrate();
  console.log(`gs ws=${gs.worldSurface} rock=${gs.rockLevel} side=${gs.dungeonSide} loc=(${gs.dungeonLocation})`);
  // 基座自检 vs CMP-1
  {
    const b = loadDump(CMP_IDX - 1);
    let dA = 0, dT = 0, dS = 0;
    for (let i = 0; i < N; i++) {
      const va = b.xa[i], ja = st.flags[i] & 1;
      if (va !== ja) dA++;
      else if (va && b.xt[i] !== (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999)) dT++;
      else if (b.xsl[i] !== st.slope[i]) dS++;
    }
    console.log(`[selfcheck vs #${CMP_IDX - 1}_${b.nm}] A=${dA} T=${dT} Sl=${dS} ${dA || dT || dS ? '✗ 反演无效!' : '✓'}`);
  }
  // 窗口前目标格坡位快照
  const targetCells: number[] = [];
  for (const [x, y] of [[3304, 280], [3303, 281], [3302, 282], [3299, 283], [3314, 283], [3298, 284], [3312, 284]]) targetCells.push(y * W + x);
  // 逐段坡差账：segWatch(name) 时点对比 st.slope 与基座快照的差集
  const prevSlope = new Uint8Array(st.slope);
  const snapSlope = new Uint8Array(st.slope);
  const snapAct = new Uint8Array(st.flags);
  const snapTyp = new Uint16Array(st.type);
  const csv: string[] = [];
  let lastSeg = '(head)';
  const segReport: string[] = [];
  (globalThis as unknown as { __dgSegWatch?: (name: string, s2: TileStore) => void }).__dgSegWatch =
    (name: string, s2: TileStore) => {
      let n = 0; const cells: string[] = [];
      for (let i = 0; i < N; i++) {
        if (prevSlope[i] !== s2.slope[i]) {
          n++;
          if (cells.length < 6) cells.push(`(${i % W},${Math.floor(i / W)}) ${prevSlope[i]}→${s2.slope[i]}`);
        }
      }
      segReport.push(`seg ${lastSeg}→${name}: Δslope=${n}${cells.length ? ' [' + cells.join(' ') + ']' : ''}`);
      // IIII97b：全量差格导出（segment,x,y,sl0→sl1[,act,type]）
      {
        const rows2: string[] = [`seg ${lastSeg}→${name} n=${n}`];
        let c2 = 0;
        for (let i = 0; i < N && c2 < 60000; i++) {
          if (snapSlope[i] !== s2.slope[i]) {
            const qi = i;
            rows2.push(`${lastSeg}>${name},${i % W},${Math.floor(i / W)},${snapSlope[i]},${s2.slope[i]},act${snapAct[i]}>${s2.flags[qi] & 1},typ${snapTyp[i]}>${(TILE_DEFS[s2.type[qi]]?.vanilla?.sheet ?? -1)}`);
            c2++;
          }
        }
        csv.push(rows2.join('\n'));
        snapSlope.set(s2.slope); snapAct.set(s2.flags); snapTyp.set(s2.type);
      }
      prevSlope.set(s2.slope);
      lastSeg = name;
      // 目标格日志
      const tLog = targetCells.map((i) => `sl${s2.slope[i]}`).join(',');
      console.log(`  @snap ${name}: targets[${targetCells.length}] ${tLog}`);
    };
  const rng = new RNG(gs.seed);
  const TT: Record<string, number | string> = {};
  (globalThis as unknown as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace = TT;
  try {
    runDungeonPass(st, rng, gs, [] as never);
    console.log(`TT=${JSON.stringify(TT)}`);
  } finally {
    delete (globalThis as unknown as { __dgSegWatch?: unknown }).__dgSegWatch;
    delete (globalThis as unknown as { __dgTowerTrace?: unknown }).__dgTowerTrace;
  }
  for (const s of segReport) if (!s.endsWith('Δslope=0')) console.log(`  ▲ ${s}`);
  writeFileSync(`${OUT}/seg-deltas.csv`, csv.join('\n') + '\n');
  console.log(`runDungeonPass done ${Date.now() - t0}ms totalΔseg=${segReport.filter((s) => !s.endsWith('Δslope=0')).length}/${segReport.length}`);
  cmpAgainst('after-Dungeon', CMP_IDX, st);
}, 600_000);

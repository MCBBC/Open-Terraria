// IIII101c 批（planetoids）：Dungeon pass 逐掷带栈重放仪（克隆 tools/_iii89dg 范式）。
// ① SW_D101CAP=1：全量生成到 ▶Dungeon reseed 时点存 base_*（seed/flags env 直注）。
// ② SW_D101REPLAY=1：hydrate → runDungeonPass → 对拍 G2 dump#CMP 八通道 +
//    SW_D101_TAGS=<path> 逐掷落 `ordinal|value|栈签名`（序数=x86 Rolls 域 −1 对齐）。
// 用法：cd game && SW_D101CAP=1 SW_D101_TAG=pld SW_D101_SEED='planetoids|20260908' \
//   SW_D101_FLAGS=roundLandmasses SW_D101_EVIL=0 npx vitest run tools/_iii101dg.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_D101CAP === '1';
const RUN_RE = process.env.SW_D101REPLAY === '1';
const TAG = process.env.SW_D101_TAG ?? 'x';
const OUT = process.env.SW_D101_OUT ?? `/tmp/iii119-out/cap-${TAG}`;
const G2 = process.env.SW_D101_G2 ?? '';
const CMP_IDX = Number(process.env.SW_D101_CMP ?? 32);
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_D101_SEED ?? '';
const EVIL = Number(process.env.SW_D101_EVIL ?? 0);
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_D101_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

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

const labelOfCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = labelOfCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } labelOfCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN_CAP ? it : it.skip)('capture base at Dungeon pass head', async () => {
  if (!SEED || !G2) throw new Error('SW_D101_SEED/SW_D101_G2 required');
  let liveStore: TileStore | null = null;
  let done = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (liveStore && !done) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1]!.includes('/core/rng') && !m[1]!.includes('_iii101dg')) {
          const lab = labelOf(m[1]!, Number(m[2]));
          if (lab === 'Dungeon') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
            writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid().entries()]));
            console.log(`captured @${lab} tag=${TAG}`);
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
      seedFlags: Object.keys(FLAGS).length ? FLAGS : undefined,
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Dungeon label never hit');
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

(RUN_RE ? it : it.skip)(`replay runDungeonPass on base vs x86 dump#${CMP_IDX}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSafe(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const { st, gs } = hydrate();
  if (existsSync(`${OUT}/base_gensolid.json`)) {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as [number, boolean][]));
  }
  // 基座自检 vs #031
  {
    const pre41 = `${G2}/031_${DUMPNAME.get(31)}`;
    if (existsSync(`${pre41}.typ`)) {
      const a411 = readFileSync(`${pre41}.act`), t411 = le16(`${pre41}.typ`);
      let dA = 0, dT = 0;
      for (let i2 = 0; i2 < N; i2++) {
        if (a411[i2] !== (st.flags[i2]! & 1)) dA++;
        else if (a411[i2] && t411[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      }
      console.log(`[base selfcheck vs #031] dAct=${dA} dTyp=${dT}`);
    }
  }
  const TAGS_PATH = process.env.SW_D101_TAGS ?? '';
  let rollN = 0;
  const tagLines: string[] | null = TAGS_PATH ? [] : null;
  const g = globalThis as unknown as { __swOnRoll?: (v: number, inst?: object) => void };
  const oOnRoll = g.__swOnRoll;
  g.__swOnRoll = (v) => {
    rollN++;
    if (tagLines) {
      const stack = (new Error().stack ?? '').split('\n').slice(1).join('\n');
      const frames: string[] = [];
      for (const line of stack.split('\n')) {
        const m = line.match(/(?:\/src\/)([^\s()]+\.ts):(\d+):\d+/);
        if (!m) continue;
        if (m[1]!.includes('core/rng') || m[1]!.includes('_iii101dg')) continue;
        frames.push(`${m[1]!.replace(/^.*?(gen|world)\//, '')}:${m[2]}`);
        if (frames.length >= 5) break;
      }
      tagLines.push(`${rollN}|${v}|${frames.join('<')}`);
    }
  };
  const rng = new RNG(gs.seed);
  try {
    runDungeonPass(st, rng, gs, [] as never);
  } finally {
    g.__swOnRoll = oOnRoll;
    if (tagLines && TAGS_PATH) writeFileSync(TAGS_PATH, `${tagLines.join('\n')}\n`);
  }
  // 对拍 dump#CMP 八通道
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, fI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; continue; }
    if (xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; continue; }
    if ((xia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) { dIa++; fI = fI < 0 ? i : fI; }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`DIFF A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} ` +
    `${bad ? `✗ first=(${fI % W},${Math.floor(fI / W)}) ` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
  console.log(`rolls_total=${rollN}`);
}, 600_000);

function readdirSafe(dir: string): string[] {
  try { return require('node:fs').readdirSync(dir); } catch { return []; }
}

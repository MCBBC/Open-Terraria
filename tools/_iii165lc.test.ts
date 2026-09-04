// IIII165 批：iamerror 链 LifeCrystals 窗（乱块海 DoErrorWorldShuffleBlocks + 心晶）
// 单窗反演重放。克隆 _iii146lt（IIII107c）CAP/RE 骨架，CAP 点改走 WorldGen 既有
// __swI91Cap 槽头钩（pass name==='生命水晶'——cap 在 runner reseed 之前直递，
// 槽末态=Wall_Variety 末 = LC pass 头，与 x86 dump #056 同位）。
// ① CAP：SW_165CAP=1 SW_165_OUT=/tmp/iii165-out/cap-lc SW_165_SEED='1.1.1.0.iamerror|106103' \
//    npx vitest run tools/_iii165lc.test.ts
// ② RE：SW_165RE=1 SW_165_OUT=... SW_165_ROLLCAP=/tmp/iii165-out/js-lc-rolls.txt \
//    [SW_165_CMP=Life_Crystals SW_165_BASE=Wall_Variety SW_165_G2=$HOME/GoldenChains/i106/x86-iamerror] \
//    [SW_165_SAVEAFTER=1] npx vitest run tools/_iii165lc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runLifeCrystalsPass } from '../src/world/gen/vanilla/StructuresPass';
import { doErrorWorldShuffleBlocks } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_165CAP === '1';
const RUN_RE = process.env.SW_165RE === '1';
const OUT = process.env.SW_165_OUT ?? '/tmp/iii165-out/cap-lc';
const G2 = process.env.SW_165_G2 ?? '';
const CMP_NAME = process.env.SW_165_CMP ?? 'Life_Crystals';
const BASE_NAME = process.env.SW_165_BASE ?? 'Wall_Variety';
const W = Number(process.env.SW_165_W ?? 4200), H = Number(process.env.SW_165_H ?? 1200), N = W * H;
const SEED = process.env.SW_165_SEED ?? '';
const EVIL = Number(process.env.SW_165_EVIL ?? 0);
const SAVEAFTER = process.env.SW_165_SAVEAFTER === '1';

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

(RUN_CAP ? it : it.skip)('capture base at 生命水晶 pass head', async () => {
  if (!SEED) throw new Error('SW_165_SEED required');
  let done = false;
  const G2Any = globalThis as unknown as Record<string, unknown>;
  G2Any.__swI91Cap = (st: unknown, g: unknown, _ch: unknown, name: string) => {
    if (name !== '生命水晶' || done) return;
    mkdirSync(OUT, { recursive: true });
    serializeStore(st as TileStore, OUT);
    writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
    writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(g)));
    console.log(`[165] captured @${name} -> ${OUT}`);
    done = true;
    delete G2Any.__swI91Cap;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { errorWorld: true },
      onWorldPartial: () => {},
    });
  } finally { delete G2Any.__swI91Cap; }
  if (!done) throw new Error('capture failed: 生命水晶 cap never hit');
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
  const gsf = `${OUT}/base_gensolid.json`;
  if (existsSync(gsf)) restoreGenSolid(new Map(JSON.parse(readFileSync(gsf, 'utf8')) as Array<[number, boolean]>));
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)('replay LC window on base vs x86 dump', () => {
  const { st, gs } = hydrate();
  console.log(`[165] hydrated ${st.w}x${st.h} flags.errorWorld=${gs.seedFlags.errorWorld}`);
  // 基座自检（对 x86 dump BASE_NAME 八通道）
  if (G2) {
    const DUMPNAME = new Map<number, string>();
    const IDXNAME = new Map<string, number>();
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) { DUMPNAME.set(Number(m[1]), m[2]); IDXNAME.set(m[2], Number(m[1])); }
    }
    const pre = (nm: string): string => `${G2}/${String(IDXNAME.get(nm)!).padStart(3, '0')}_${nm}`;
    const bt = le16(`${pre(BASE_NAME)}.typ`), ba = readFileSync(`${pre(BASE_NAME)}.act`);
    const bw = le16(`${pre(BASE_NAME)}.wal`), bl = readFileSync(`${pre(BASE_NAME)}.liq`);
    const bhf = readFileSync(`${pre(BASE_NAME)}.half`), bsl = readFileSync(`${pre(BASE_NAME)}.slope`);
    const blt = readFileSync(`${pre(BASE_NAME)}.lty`), bia = readFileSync(`${pre(BASE_NAME)}.inact`);
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
    console.log(`[165] base selfcheck vs ${BASE_NAME}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa}`);
  }
  const rng = new RNG(gs.seed);
  const ROLLCAP = process.env.SW_165_ROLLCAP;
  const ROLLSTACK = Number(process.env.SW_165_ROLLSTACK ?? 0);
  let rollSeq = 0;
  const oOnRoll = (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll;
  const rollRows: number[] = [];
  if (ROLLCAP || ROLLSTACK > 0) {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
      rollSeq++;
      rollRows.push(v);
      if (rollSeq === ROLLSTACK && ROLLSTACK > 0) {
        const stack = (new Error().stack ?? '').split('\n').filter((l) => l.includes('/src/')).slice(0, 9);
        console.log(`[165] roll#${rollSeq} value=${v}\n${stack.join('\n')}`);
      }
    };
  }
  try {
    if (gs.seedFlags.errorWorld) doErrorWorldShuffleBlocks(st, rng, gs);
    if (gs.seedFlags.getGoodWorld) { /* flip handled by pass engine order; errorWorld-only here */ }
    runLifeCrystalsPass(st, rng, gs);
  } finally {
    (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = oOnRoll;
  }
  console.log(`[165] total rolls in LC window: ${rollSeq}`);
  if (ROLLCAP) {
    writeFileSync(ROLLCAP, rollRows.map((v, k) => `R|${k + 1}|${v >>> 0}`).join('\n') + '\n');
    console.log(`[165] rollcap -> ${ROLLCAP}`);
  }
  // 对拍 x86 dump CMP_NAME 八通道
  if (G2) {
    const DUMPNAME = new Map<number, string>();
    const IDXNAME = new Map<string, number>();
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) { DUMPNAME.set(Number(m[1]), m[2]); IDXNAME.set(m[2], Number(m[1])); }
    }
    const pre = (nm: string): string => `${G2}/${String(IDXNAME.get(nm)!).padStart(3, '0')}_${nm}`;
    const xt = le16(`${pre(CMP_NAME)}.typ`), xa = readFileSync(`${pre(CMP_NAME)}.act`);
    const xw = le16(`${pre(CMP_NAME)}.wal`), xl = readFileSync(`${pre(CMP_NAME)}.liq`);
    const xhf = readFileSync(`${pre(CMP_NAME)}.half`), xsl = readFileSync(`${pre(CMP_NAME)}.slope`);
    const xlt = readFileSync(`${pre(CMP_NAME)}.lty`), xia = readFileSync(`${pre(CMP_NAME)}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    let first = -1;
    const samples: string[] = [];
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i] & 1;
      let bad = false;
      if (xa[i] !== ja) { dA++; bad = true; }
      if (ja && xt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) dT++;
      if (ja && xa[i] === 1 && xt[i] === 0 && st.type[i] === 0) { /* 残型 0 容忍 */ }
      if (xw[i] !== st.wall[i]) dW++;
      if (xl[i] !== st.liquid[i]) dL++;
      if (xhf[i] !== st.half[i]) dHf++;
      if (xsl[i] !== st.slope[i]) dSl++;
      const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) dLt++;
      if ((xia[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
      if (bad && first < 0) first = i;
      if (bad && samples.length < 8) samples.push(`(${i % W},${(i / W) | 0}) v${xa[i]}/${xt[i]} j${ja}/${st.type[i]}`);
    }
    console.log(`[165] post vs ${CMP_NAME}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=(${first % W},${(first / W) | 0})`);
    if (samples.length) console.log(`[165] samples: ${samples.join(' | ')}`);
    if (SAVEAFTER) {
      const dir = `${OUT}/after`;
      mkdirSync(dir, { recursive: true });
      serializeStore(st, dir);
      console.log(`[165] after-state -> ${dir}`);
    }
  }
}, 600_000);

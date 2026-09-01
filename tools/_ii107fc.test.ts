// IIII107b 批：Final_Cleanup 单窗反演重放（purify this 链 mile8 新前沿 #105）。
// 骨架克隆 tools/_ii102gp.test.ts（IIIII102 范式）：
// ① CAP：全量生成，槽末锚（缺省「断线陷阱清理」=#104 Remove_Broken_Traps 末态）
//    深拷贝 store 全通道 + gs；
// ② RE：hydrate → new RNG(seed) → finalizeSecretSeedDoEnds + runFinalCleanupPass
//    （beforeShimmer=WorldGen.ts:1704 同序接线）→ 对拍 G2 dump#105 八通道。
// 用法：
//   SW_I107CAP=1 SW_I107_OUT=/tmp/iii131-out/cap-fc SW_I107_SEED='1.1.1.0.purifythis|106105' \
//     npx vitest run tools/_ii107fc.test.ts
//   SW_I107RE=1 SW_I107_G2=/tmp/iii127-out/x86-purifythis SW_I107_OUT=/tmp/iii131-out/cap-fc \
//     npx vitest run tools/_ii107fc.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { finalizeSecretSeedDoEnds } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { finalSeedCleanup } from '../src/world/gen/vanilla/FinalSeedCleanupPass';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';

const RUN_CAP = process.env.SW_I107CAP === '1';
const RUN_RE = process.env.SW_I107RE === '1';
const OUT = process.env.SW_I107_OUT ?? '/tmp/iii131-out/cap-fc';
const G2 = process.env.SW_I107_G2 ?? '';
const CMP_NAME = process.env.SW_I107_CMP ?? 'Final_Cleanup';
const BASE_NAME = process.env.SW_I107_BASE ?? 'Remove_Broken_Traps';
const SLOTNAME = process.env.SW_I107_SLOTNAME ?? '断线陷阱清理';   // 基座=该槽末态
const W = Number(process.env.SW_I107_W ?? 4200), H = Number(process.env.SW_I107_H ?? 1200), N = W * H;
const SEED = process.env.SW_I107_SEED ?? '';

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
      const arr = new Ctor((o.d?.length ?? 0)) as { set(a: unknown[]): void };
      arr.set(o.d!); return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)(`capture slot-end:${SLOTNAME}`, async () => {
  if (!SEED) throw new Error('SW_I107_SEED required');
  let liveStore: TileStore | null = null;
  let done = false;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: -1,
    onWorldPartial: (w2, _i, pn) => {
      liveStore = w2.store as never as TileStore;
      if (!done && pn === SLOTNAME) {
        mkdirSync(OUT, { recursive: true });
        serializeStore(liveStore!, OUT);
        const gsX = lastGenState();
        if (!gsX) throw new Error('gs missing');
        writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gsX)));
        console.log(`captured @slotend:${SLOTNAME}`);
        done = true;
      }
    },
  });
  if (!done) throw new Error(`capture failed: slot ${SLOTNAME} never hit`);
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

(RUN_RE ? it : it.skip)(`replay Final_Cleanup window on base vs x86 dump#${CMP_NAME}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const IDXNAME = new Map([...DUMPNAME.entries()].map(([i, n]) => [n, i] as [string, number]));
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
  // 基座自检（对上层 dump=BASE=#104）
  {
    const bt = le16(`${pre(BASE)}.typ`), ba = readFileSync(`${pre(BASE)}.act`);
    const bw = le16(`${pre(BASE)}.wal`), bl = readFileSync(`${pre(BASE)}.liq`);
    const bhf = readFileSync(`${pre(BASE)}.half`), bsl = readFileSync(`${pre(BASE)}.slope`);
    const blt = readFileSync(`${pre(BASE)}.lty`), bia = readFileSync(`${pre(BASE)}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
    let firstI = -1;
    for (let i = 0; i < N; i++) {
      const ja = st.flags[i]! & 1;
      if (ba[i] !== ja) { dA++; if (firstI < 0) firstI = i; continue; }
      if (ja && bt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) { dT++; if (firstI < 0) firstI = i; continue; }
      if (bw[i] !== st.wall[i]) { dW++; if (firstI < 0) firstI = i; continue; }
      if (bl[i] !== st.liquid[i]) { dL++; if (firstI < 0) firstI = i; continue; }
      if (bhf[i] !== st.half[i]) { dHf++; continue; }
      if (bsl[i] !== st.slope[i]) { dSl++; continue; }
      const vl = bl[i]! > 0 ? blt[i]! + 1 : 0;
      const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
      if (vl !== jl) { dLt++; continue; }
      if ((bia[i] ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
    }
    console.log(`[base selfcheck vs #${BASE}_${BASE_NAME}] A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} first=${firstI < 0 ? '-' : `(${firstI % W},${Math.floor(firstI / W)})`}`);
    if (dA || dT || dW || dL || dHf || dSl || dLt || dIa) throw new Error('base drift — snapshot stale, re-capture');
  }
  // pass 头 reseed：RNG 消费流从零起（RunPass 语义，WorldGenerator.cs:497）
  const rng = new RNG(gs.seed);
  let rollN = 0;
  const rollH = { h: 2166136261 >>> 0 };
  const oOnRoll = (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = (v) => {
    rollN++;
    rollH.h = ((rollH.h ^ (v >>> 0)) * 16777619) >>> 0;
  };
  try {
    // ★WorldGen.ts:1704-1731 接线同序：finalizeSecretSeedDoEnds（内含 infectedSeed→
    // doWorldIsInfected）→ hfIs1457 门下 errorWorld/portalGun 不适用本链 → finalSeedCleanup。
    runFinalCleanupPass(st, gs, rng, {
      beforeShimmer: () => {
        finalizeSecretSeedDoEnds(st, rng, gs, {
          chests: [], starterTownNpcs: [], flags: {},
        } as never);
        if (process.env.SW_MB_1457 === '1') finalSeedCleanup(st, gs.seedFlags ?? {}, []);
      },
    });
  } finally {
    (globalThis as unknown as { __swOnRoll?: (v: number) => void }).__swOnRoll = oOnRoll;
  }
  console.log(`window totalSample=${rollN} fnv=${rollH.h.toString(16)}(${rollH.h})`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const cells: Array<{ x: number; y: number; desc: string }> = [];
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; fI = fI < 0 ? i : fI; cells.push({ x: i % W, y: (i / W) | 0, desc: `act ${va}>${ja} t ${va ? xt[i] : '-'}>${ja ? SHEET[st.type[i]!] ?? 9999 : '-'}` }); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; fI = fI < 0 ? i : fI; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); cells.push({ x: i % W, y: (i / W) | 0, desc: `t ${vt}>${jt}` }); continue; }
    if (xw[i] !== st.wall[i]) { dW++; fI = fI < 0 ? i : fI; continue; }
    if (xl[i] !== st.liquid[i]) { dL++; fI = fI < 0 ? i : fI; continue; }
    if (xhf[i] !== st.half[i]) { dHf++; fI = fI < 0 ? i : fI; continue; }
    if (xsl[i] !== st.slope[i]) { dSl++; fI = fI < 0 ? i : fI; continue; }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; fI = fI < 0 ? i : fI; continue; }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; fI = fI < 0 ? i : fI; continue; }
    if (!va && !ja && vt !== jt) dGh++;
  }
  console.log(`DIFF A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} Gh=${dGh} first=${fI < 0 ? '-' : `(${fI % W},${Math.floor(fI / W)})`}`);
  console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const c of cells.slice(0, Number(process.env.SW_I107_NCELLS ?? 24))) console.log(`  (${c.x},${c.y}) ${c.desc}`);
  writeFileSync(`${OUT}/diffcells.json`, JSON.stringify(cells));
}, 600_000);

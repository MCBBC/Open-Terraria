// 一次性诊断（IIIII99f 批）：FTW #50(槽末#50·微群系 = mile8 行#97) 单 pass 反演重放。
// 模板=tools/_iii118lt.test.ts（IIIII99e 章同款），改三点：
//   ① CAP 经 WorldGen.runVanillaWorld 的既有 __swI91Cap 钩（pass name==='微群系' 时点）
//     ——该时点比 ▶label/reseed 钩更精确（slot 头 reseed 之后、pass 体之前）；
//   ② 序列化含 chests sink（DeadMansChestBiome 消费上游金箱）；
//   ③ REPLAY 跑 runMicroBiomesPass 对拍 G2 dump#097_Micro_Biomes 八通道。
// FTW 配方：seed 1671560105 / evil 0 / seedFlags {getGoodWorld:true} /
//   G2=~/GoldenChains/golden-ftw / W=4200 H=1200。
// 用法：cd game && SW_I121CAP=1 npx vitest run tools/_iii121mb.test.ts
//       cd game && SW_I121REPLAY=1 npx vitest run tools/_iii121mb.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN_CAP = process.env.SW_I121CAP === '1';
const RUN_RE = process.env.SW_I121REPLAY === '1';
const OUT = process.env.SW_I121_OUT ?? '/tmp/iii121-out';
const CMP_IDX = Number(process.env.SW_I121_CMP ?? 97);
const PRE_IDX = Number(process.env.SW_I121_PRE ?? 96);
const G2 = process.env.SW_I118_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw`;
const W = Number(process.env.SW_I118_W ?? 4200), H = Number(process.env.SW_I118_H ?? 1200), N = W * H;
const SEED = process.env.SW_I118_SEED ?? '1671560105';
const EVIL = process.env.SW_I118_EVIL !== undefined ? Number(process.env.SW_I118_EVIL) : 0;
const FLAGS = process.env.SW_I118_FLAGS !== undefined
  ? Object.fromEntries(process.env.SW_I118_FLAGS.split(',').filter(Boolean).map((f) => [f, true]))
  : { getGoodWorld: true };

interface ChestLike { x: number; y: number; items: Array<{ id: number; stack: number } | null>; [k: string]: unknown }

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
    const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    writeFileSync(`${dir}/base_${c}.bin`, b);
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
      return new Ctor((o.d ?? []).length).fill ? (() => { const arr = new Ctor((o.d ?? []).length) as { set(a: unknown[]): void }; arr.set(o.d!); return arr; })() : null;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at MicroBiomes slot head (ftw)', async () => {
  let liveStore: TileStore | null = null;
  const G2Any = globalThis as unknown as Record<string, unknown>;
  G2Any.__swI91Cap = (st: unknown, g: unknown, ch: unknown, name: string) => {
    if (name !== '微群系') return;
    mkdirSync(OUT, { recursive: true });
    liveStore = st as TileStore;
    serializeStore(liveStore, OUT);
    writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(g)));
    writeFileSync(`${OUT}/base_chests.json`, JSON.stringify(ch ?? []));
    const solidSnap = snapshotGenSolid();
    writeFileSync(`${OUT}/base_gensolid.json`, JSON.stringify([...solidSnap].map(([k, v]) => [k, v])));
    console.log(`captured @微群系 store ch=${CHANS.length} chests=${Array.isArray(ch) ? ch.length : '?'} gs keys=${Object.keys(g as object).length} solidOv=${solidSnap.size}`);
    delete G2Any.__swI91Cap;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: FLAGS,
      onWorldPartial: () => {},
    });
  } finally { delete G2Any.__swI91Cap; }
}, 900_000);

function hydrate(): { st: TileStore; gs: GenState; chests: ChestLike[] } {
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
  const chests = JSON.parse(readFileSync(`${OUT}/base_chests.json`, 'utf8')) as ChestLike[];
  if (existsSync(`${OUT}/base_gensolid.json`)) {
    const list = JSON.parse(readFileSync(`${OUT}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>;
    restoreGenSolid(new Map(list));
    console.log(`[hydrate] restored genSolid overrides: ${list.length}`);
  }
  return { st, gs, chests };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};

(RUN_RE ? it : it.skip)(`replay MicroBiomes on base and compare vs x86 dump#${CMP_IDX}`, () => {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  const pre = `${G2}/${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  const xt = le16(`${pre}.typ`), xa = readFileSync(`${pre}.act`), xw = le16(`${pre}.wal`),
    xl = readFileSync(`${pre}.liq`), xhf = readFileSync(`${pre}.half`), xsl = readFileSync(`${pre}.slope`),
    xlt = readFileSync(`${pre}.lty`), xia = readFileSync(`${pre}.inact`);
  const { st, gs, chests } = hydrate();
  console.log('gs:', JSON.stringify({
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel,
    beachDistance: gs.beachDistance, lavaLine: (gs as unknown as Record<string, number>).lavaLine,
    flags: Object.entries(gs.seedFlags).filter(([, v]) => v),
  }));
  // ★基座自检：对上一层 dump(PRE_IDX=96_Larva) 八通道计数（非零=基座错）
  {
    const pre96 = `${G2}/${String(PRE_IDX).padStart(3, '0')}_${DUMPNAME.get(PRE_IDX)}`;
    const a96 = readFileSync(`${pre96}.act`), t96 = le16(`${pre96}.typ`), w96 = le16(`${pre96}.wal`);
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (a96[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (a96[i2] && t96[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (w96[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #${PRE_IDX}_${DUMPNAME.get(PRE_IDX)}] dAct=${dA} dTyp=${dT} dWal=${dW}`);
  }
  // 掷数计镜
  const rcBox = { n: 0 };
  const rng = new RNG(gs.seed);
  const rp = rng as unknown as Record<string, unknown>;
  for (const k of ['int', 'nextInt', 'next']) {
    const orig = rp[k] as (...a: unknown[]) => unknown;
    if (typeof orig === 'function') rp[k] = ((...a: unknown[]) => { rcBox.n++; return orig.apply(rng, a); });
  }
  const van = rp['vanilla'] as unknown as Record<string, unknown>;
  if (van && typeof van.next === 'function') {
    const on = van.next.bind(van);
    Object.defineProperty(rp, 'vanilla', { value: { ...van, next: () => { rcBox.n++; return on(); } }, configurable: true });
  }
  (globalThis as unknown as { __ltRc?: { n: number } }).__ltRc = rcBox;
  // MBWRITE 全域写监视：记录本 pass 内每个写入格（act/type/wall/liq 任一变化）+ 掷位序
  const beforeAct = xa.slice().subarray(0, 0); void beforeAct;
  const snapAct = new Uint8Array(N), snapTyp = new Uint16Array(N), snapWal = new Uint16Array(N),
    snapLiq = new Uint8Array(N), snapSl = new Uint8Array(N);
  snapAct.set(Array.from({ length: N }, (_, i2) => st.flags[i2]! & 1));
  for (let i2 = 0; i2 < N; i2++) { snapTyp[i2] = st.flags[i2] ? (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!]! : 9999) : 0; snapWal[i2] = st.wall[i2]!; snapLiq[i2] = st.liquid[i2]!; snapSl[i2] = st.slope[i2]!; }
  const t0 = Date.now();
  runMicroBiomesPass(st, rng, gs, chests as never);
  console.log(`runMicroBiomesPass ${Date.now() - t0}ms rolls=${rcBox.n} chestsIn=${chests.length}`);
  // 八通道对拍（mile8 同构）
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, dGh = 0;
  const pair = new Map<string, number>();
  let fI = -1;
  const mark = (i: number): void => { if (fI < 0) fI = i; };
  const pk = (k: string, i: number): void => { pair.set(k, (pair.get(k) ?? 0) + 1); mark(i); };
  const jwCells: number[] = [];
  for (let i = 0; i < N; i++) {
    const va = xa[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; pk(`A${va}>${ja}`, i); continue; }
    const vt = va ? xt[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; pk(`T${vt}>${jt}`, i); }
    if (xw[i] !== st.wall[i]) { dW++; pk(`W${xw[i]}>${st.wall[i]}`, i); }
    if (xl[i] !== st.liquid[i]) { dL++; pk(`L${xl[i]}>${st.liquid[i]}`, i); }
    if (xhf[i] !== st.half[i]) { dHf++; pk(`Hf${xhf[i]}>${st.half[i]}`, i); }
    if (xsl[i] !== st.slope[i]) { dSl++; pk(`Sl${xsl[i]}>${st.slope[i]}`, i); }
    const vl = xl[i]! > 0 ? xlt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; pk(`Y${vl}>${jl}`, i); }
    const via = xia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; pk(`Ia${via}>${jia}`, i); }
    const vg = va ? 0 : xt[i]!;
    const jg = ja ? 0 : (st.type[i] === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999));
    if (vg !== jg) dGh++;
    // 写监视（post-vs-snap 任一差异 → 本 pass 实写格）
    if (va !== snapAct[i] || vt !== snapTyp[i] || xw[i] !== snapWal[i] || xl[i] !== snapLiq[i] || xsl[i] !== snapSl[i]) jwCells.push(i);
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dLt || dIa;
  console.log(`JS writes: ${jwCells.length} cells`);
  if (process.env.SW_I121_JWWRITE === '1') writeFileSync(`${OUT}/js-writes.txt`, jwCells.join('\n') + '\n');
  if (bad && process.env.SW_I121_DIFFLIST === '1') {
    const lines: string[] = [];
    for (let i = 0; i < N; i++) {
      const va = xa[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja) { lines.push(`${i % W},${Math.floor(i / W)} act ${va}>${ja} t ${vt}>${jt}`); continue; }
      if (vt !== jt) { lines.push(`${i % W},${Math.floor(i / W)} t ${vt}>${jt}`); continue; }
      if (xw[i] !== st.wall[i]) lines.push(`${i % W},${Math.floor(i / W)} w ${xw[i]}>${st.wall[i]}`);
      if (xsl[i] !== st.slope[i]) lines.push(`${i % W},${Math.floor(i / W)} sl ${xsl[i]}>${st.slope[i]}`);
      if (xhf[i] !== st.half[i]) lines.push(`${i % W},${Math.floor(i / W)} hf ${xhf[i]}>${st.half[i]}`);
      if (xl[i] !== st.liquid[i]) lines.push(`${i % W},${Math.floor(i / W)} liq ${xl[i]}>${st.liquid[i]}`);
    }
    writeFileSync(`${OUT}/difflist-mb.txt`, lines.join('\n') + '\n');
    console.log(`difflist -> ${OUT}/difflist-mb.txt (${lines.length})`);
  }
  console.log(`replay cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} (Gh=${dGh}) ` +
    `${bad ? `✗ first=${fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`} pairs=` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ') : '✓ zero'}`);
}, 900_000);

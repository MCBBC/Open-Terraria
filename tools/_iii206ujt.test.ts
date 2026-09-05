// III206 一次性诊断：ddual 链 #69 Jungle_Trees（UndergroundJungleTrees+GrowUndergroundTree）
// 离线反演-重放。① SW_I206_CAP=1：全量生成 ddual 链（seed '1.1.1.0.doubledaringdangers|20260831'/
// evil 0），经通用槽头捕获钩 __swI91Cap 在『地下丛林树』槽头（=洞穴墙槽末态）快照 13 通道+gs+
// GenSolid 覆写表+dual 界域 → /tmp/iii206-out/base，随即 swAbort 停管。
// ② SW_I206_RE=1：hydrate 基座 → 复刻 pass 体（逐候选掷计数分类：0=入场门拒/1=EmptyTileCheck 拒/
// >1=成树）→ 8ch 对 gold #069_Jungle_Trees；落 js-cands/js-rolls/js-post。
// ③ SW_I206_SIM=1：hydrate 基座 → vanilla-exact 手译（1457 WorldGen.cs:17967-17985 +
// cs:31131-31581 逐行；1458 同域零 diff 已核）→ 8ch 对 gold #069（全等=手译忠实）+ sim-cands。
// 用法：cd game && SW_MB_1457=1 SW_I206_CAP=1 npx vitest run tools/_iii206ujt.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { growUndergroundTree } from '../src/world/gen/vanilla/UndergroundJungleTreesPass';
import { flipGenSolid, snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { genRangeFrame } from '../src/world/gen/vanilla/FinalCleanupPass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import { runPotsPass } from '../src/world/gen/vanilla/PotsPass';
import { runPilesPass } from '../src/world/gen/vanilla/PilesPass';
import { runAlchemyHerbsPass } from '../src/world/gen/vanilla/StructuresPass';
import { runDyePlantsPass } from '../src/world/gen/vanilla/SurfaceDecorPasses';
import { runExposedGemsIcePass, runExposedGemsUndergroundPass } from '../src/world/gen/vanilla/GemPasses';

const RUN_CAP = process.env.SW_I206_CAP === '1';
const RUN_RE = process.env.SW_I206_RE === '1';
const RUN_SIM = process.env.SW_I206_SIM === '1';
const RUN_CAP2 = process.env.SW_I206_CAP2 === '1';   // 指定槽头基座（SW_I206_SLOT）
const RUN_POTS = process.env.SW_I206_POTS === '1';   // 瓦罐离线重放
const RUN_PILES = process.env.SW_I206_PILES === '1'; // 矿骨堆离线重放
const RUN_HERBS = process.env.SW_I206_HERBS === '1'; // 炼金草药离线重放
const RUN_DYE = process.env.SW_I206_DYE === '1';     // 染料植物离线重放
const RUN_GEMS = process.env.SW_I206_GEMS === '1';   // 宝石系统离线重放
const CAP_SLOT = process.env.SW_I206_SLOT ?? '地下丛林树';
const OUT = process.env.SW_I206_OUT ?? '/tmp/iii206-out';
const G2 = process.env.SW_I206_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_I206_SEED ?? '1.1.1.0.doubledaringdangers|20260831';

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

((RUN_CAP || RUN_CAP2) ? it : it.skip)('capture base at slot head (ddual #69/#72)', async () => {
  mkdirSync(`${OUT}/base`, { recursive: true });
  const g1 = globalThis as { __swI91Cap?: unknown };
  let done = false;
  g1.__swI91Cap = (stRaw: unknown, gRaw: unknown, _c: unknown, nm: string) => {
    if (done || nm !== CAP_SLOT) return;
    const st = stRaw as TileStore;
    const gs = gRaw as GenState;
    if (!gs) throw new Error('gs missing');
    writeFileSync(`${OUT}/base/base_gs.json`, JSON.stringify(serVal(gs)));
    writeFileSync(`${OUT}/base/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
    // dual 界域（基座第三件；本 pass vanilla 无 dual 门,照 CLXXXII 三件套判例照录）
    writeFileSync(`${OUT}/base/base_dual.json`, JSON.stringify({
      enabled: dualDungeonState.enabled,
      potentialBounds: dualDungeonState.potentialBounds,
      dungeons: dualDungeonState.dungeons,
    }));
    serializeStore(st, `${OUT}/base`);
    console.log(`captured @${nm} gs.seed=${gs.seed} ws=${gs.worldSurface} rock=${gs.rockLevel} dual=${JSON.stringify(dualDungeonState.potentialBounds)}`);
    done = true;
    const e = new Error('SW_I206_ABORT') as Error & { swAbort?: boolean };
    e.swAbort = true;
    throw e;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      onWorldPartial: () => {},
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('ABORT')) throw e;
  } finally { delete g1.__swI91Cap; }
  if (!done) throw new Error(`capture failed: ${CAP_SLOT} slot head never hit`);
}, 600_000);

// ── POTS：瓦罐槽头基座 → runPotsPass 离线重放 → 8ch 对 gold #072_Pots ──
(RUN_POTS ? it : it.skip)('replay runPotsPass on 瓦罐-head base, cmp vs #072_Pots', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(72, DUMPNAME);
  const pv = loadDump(71, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #071_Quick_Cleanup] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #071 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  const t0 = Date.now();
  runPotsPass(st, rng, gs);
  console.log(`runPotsPass ${Date.now() - t0}ms rolls=${rc.n}`);
  writeFileSync(`${OUT}/pots-rolls.txt`, rolls.join('\n') + '\n');
  const r = cmp8(st, xv);
  console.log(`POTS cmp vs #072_Pots: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  writeFileSync(`${OUT}/pots-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/pots-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
}, 600_000);

// ── PILES：矿骨堆槽头基座 → runPilesPass 离线重放 → 8ch 对 gold #078_Piles ──
(RUN_PILES ? it : it.skip)('replay runPilesPass on 矿骨堆-head base, cmp vs #078_Piles', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(78, DUMPNAME);
  const pv = loadDump(77, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #077_Traps] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #077 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  const t0 = Date.now();
  runPilesPass(st, rng, gs);
  console.log(`runPilesPass ${Date.now() - t0}ms rolls=${rc.n}`);
  writeFileSync(`${OUT}/piles-rolls.txt`, rolls.join('\n') + '\n');
  const r = cmp8(st, xv);
  console.log(`PILES cmp vs #078_Piles: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
}, 600_000);

// ── HERBS：炼金草药槽头基座 → runAlchemyHerbsPass 离线重放 → 8ch 对 gold #084_Herbs ──
(RUN_HERBS ? it : it.skip)('replay runAlchemyHerbsPass on 炼金草药-head base, cmp vs #084_Herbs', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(84, DUMPNAME);
  const pv = loadDump(83, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #083_Planting_Trees] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #083 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  runAlchemyHerbsPass(st, rng, gs);
  console.log(`runAlchemyHerbsPass rolls=${rc.n}`);
  const r = cmp8(st, xv);
  console.log(`HERBS cmp vs #084_Herbs: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
}, 600_000);

// ── DYE：染料植物槽头基座 → runDyePlantsPass 离线重放 → 8ch 对 gold #085_Dye_Plants ──
(RUN_DYE ? it : it.skip)('replay runDyePlantsPass on 染料植物-head base, cmp vs #085', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(85, DUMPNAME);
  const pv = loadDump(84, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #084_Herbs] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #084 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  runDyePlantsPass(st, rng, gs);
  console.log(`runDyePlantsPass rolls=${rc.n}`);
  const r = cmp8(st, xv);
  console.log(`DYE cmp vs #085_Dye_Plants: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
}, 600_000);

// ── GEMS：宝石系统槽头基座 → 冰系+地下两 pass（槽内重播锚照管线）→ 对 gold #094 ──
(RUN_GEMS ? it : it.skip)('replay gems slot on 宝石系统-head base, cmp vs #094', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(94, DUMPNAME);
  const pv = loadDump(93, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #093_Gems_In_Ice_Biome] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #093 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  // 管线原序（WorldGen.vanillaGems）：▶ExposedGemsInIceBiome reseed → 冰系 →
  // ▶ExposedGemsUnderground reseed → 地下（琥珀含在内）
  rng.reseed(gs.seed);
  runExposedGemsIcePass(st, rng, gs);
  const n1 = rc.n;
  rng.reseed(gs.seed);
  runExposedGemsUndergroundPass(st, rng, gs);
  console.log(`ice rolls=${n1} underground rolls=${rc.n - n1}`);
  const r = cmp8(st, xv);
  console.log(`GEMS cmp vs #094_Random_Gems: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  // 首批差格清单 + 该列基座门读数（act/liquid/wall）
  {
    const rows: string[] = [];
    for (let i = 0; i < N && rows.length < 24; i++) {
      const va = xv.a[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xv.t[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja || vt !== jt) rows.push(`(${i % W},${Math.floor(i / W)}) v${va}t${vt} j${ja}t${jt} [base act=${st.flags[i]} liq=${st.liquid[i]} wall=${st.wall[i]}]`);
    }
    console.log(rows.join('\n'));
  }
  writeFileSync(`${OUT}/gems-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/gems-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
}, 600_000);

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${OUT}/base/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${OUT}/base/base_gs.json`, 'utf8'))) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${OUT}/base/base_gensolid.json`, 'utf8')) as [number, boolean][]));
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
function loadDump(idx: number, DUMPNAME: Map<number, string>) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) throw new Error(`dump missing at ${pre}`);
  return {
    t: le16(`${pre}.typ`), a: readFileSync(`${pre}.act`), w: le16(`${pre}.wal`),
    l: readFileSync(`${pre}.liq`), hf: readFileSync(`${pre}.half`), sl: readFileSync(`${pre}.slope`),
    lt: readFileSync(`${pre}.lty`), ia: readFileSync(`${pre}.inact`),
  };
}
function dumpNames(): Map<number, string> {
  const DUMPNAME = new Map<number, string>();
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m) DUMPNAME.set(Number(m[1]), m[2]);
  }
  return DUMPNAME;
}
function cmp8(st: TileStore, xv: ReturnType<typeof loadDump>): { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: string } {
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0;
  let fI = -1;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = xv.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { dA++; if (fI < 0) fI = i; continue; }
    const vt = va ? xv.t[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { dT++; if (fI < 0) fI = i; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (xv.w[i] !== st.wall[i]) { dW++; if (fI < 0) fI = i; }
    if (xv.l[i] !== st.liquid[i]) { dL++; if (fI < 0) fI = i; }
    if (xv.hf[i] !== st.half[i]) { dHf++; if (fI < 0) fI = i; const k = `H${xv.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (xv.sl[i] !== st.slope[i]) { dSl++; if (fI < 0) fI = i; const k = `S${xv.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = xv.l[i]! > 0 ? xv.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { dLt++; if (fI < 0) fI = i; }
    const via = xv.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { dIa++; if (fI < 0) fI = i; }
  }
  return { dA, dT, dW, dL, dHf, dSl, dLt, dIa, first: fI < 0 ? '' : `(${fI % W},${Math.floor(fI / W)})`, pairs: [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ') };
}

interface RollWrap { cur: () => number }
function wrapRolls(rng: RNG, log: string[], rc: { n: number }): RollWrap {
  let cur = 0;
  const rp = rng as unknown as Record<string, unknown>;
  const wrap = (k: string): void => {
    const orig = rp[k] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') return;
    rp[k] = ((...a: unknown[]) => {
      const r = orig.apply(rng, a);
      cur = ++rc.n;
      log.push(`${rc.n} ${k}(${a.map((x) => String(x)).join(',')})=${String(r)}`);
      return r;
    }) as never;
  };
  for (const k of ['int', 'nextInt', 'next', 'chance', 'pick']) wrap(k);
  return { cur: () => cur };
}

const PLANT_OK = [3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655];
const SAP_OK = [20, 590, 595, 615];
/** sheet 5（Tiles_5 树干）的内部 id（SIM 写格用——内部 id≠sheet,曾硬编码 5 炸 T5>6 全行差） */
const TREE_INT = (() => {
  for (let t = 0; t < TILE_DEFS.length; t++) if (SHEET[t] === 5) return t;
  return 0;
})();

// ── RE：复刻 pass 体 + 逐候选掷计数 ──
(RUN_RE ? it : it.skip)('replay UndergroundJungleTrees on base, per-candidate roll census, cmp vs #069', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(69, DUMPNAME);
  const pv = loadDump(68, DUMPNAME);
  const { st, gs } = hydrate();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #068_Cave_Walls] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #068 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  const rw = wrapRolls(rng, rolls, rc);

  flipGenSolid([379], true);
  const cands: string[] = [];
  const w = st.w, h = st.h;
  const yStart = gs.worldSurface - 1, yEnd = h - 350;
  const isJG = (x: number, y: number): boolean => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const i2 = y * w + x;
    return !!(st.flags[i2] & 1) && SHEET[st.type[i2]] === 60;
  };
  for (let i = 0; i < w; i++) {
    for (let j = yStart; j < yEnd; j++) {
      const g = rng.int(0, 9);
      if (g !== 0) continue;
      const i2 = j * w + i;
      const before = rw.cur();
      growUndergroundTree(st, rng, gs, i, j);
      const after = rw.cur();
      const n = after - before;
      const cls = n === 0 ? 'entryReject' : n === 1 ? 'etcReject' : 'GROWN';
      const m2 = n >= 1 ? (rolls[before]?.match(/=(\d+)$/)?.[1] ?? '?') : '?';
      cands.push(`cand(${i},${j}) rolls=${n} ${cls} num2=${m2} anchor[act=${st.flags[i2]} t${SHEET[st.type[i2]]} half=${st.half[i2]} slope=${st.slope[i2]} inact=${(st.wire[i2] >>> 5) & 1}] L=${isJG(i - 1, j)} R=${isJG(i + 1, j)}`);
    }
  }
  writeFileSync(`${OUT}/js-cands.txt`, cands.join('\n') + '\n');
  writeFileSync(`${OUT}/js-rolls.txt`, rolls.join('\n') + '\n');
  const grown = cands.filter((c) => c.includes('GROWN'));
  console.log(`candidates(shown)=${cands.length} grown=${grown.length} rolls=${rc.n}`);
  console.log('JS grown anchors:', grown.map((c) => c.slice(c.indexOf('(') + 1, c.indexOf(')')) + ':' + (c.match(/rolls=(\d+)/)?.[1] ?? '?')).join(' '));
  const r = cmp8(st, xv);
  console.log(`RE cmp vs #069_Jungle_Trees: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  writeFileSync(`${OUT}/js-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/js-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
}, 600_000);

// ── SIM：vanilla-exact 手译（1457 WorldGen.cs:17967-17985 + cs:31131-31581）──
const TR_BASE: Array<[number, number]> = [
  [0, 0], [0, 66], [22, 0], [44, 66], [22, 66], [88, 0], [66, 66], [110, 66], [0, 0], [0, 0],
];
const ROOT_FIT_SHEETS = [2, 23, 60, 109, 147];

function simEmptyTileCheck(st: TileStore, x0: number, x1: number, y0: number, y1: number, offend: string[]): boolean {
  const w2 = st.w, h2 = st.h;
  if (x0 < 0 || x1 >= w2 || y0 < 0 || y1 >= h2) return false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i2 = y * w2 + x;
      if (!(st.flags[i2] & 1)) continue;
      const sh = SHEET[st.type[i2]] ?? 9999;
      if (SAP_OK.includes(sh)) continue;      // CommonSapling[20] 支：is→放行
      if (PLANT_OK.includes(sh)) continue;    // 白名单 switch
      offend.push(`(${x},${y})t${sh}a1`);
      return false;
    }
  }
  return true;
}

interface SimDiag { offend: string[]; num2: number }
function simGrowUJT(st: TileStore, rng: RNG, gs: GenState, i: number, y: number, diag: SimDiag): void {
  const offend = diag.offend;
  offend.length = 0;
  const w2 = st.w, h2 = st.h;
  const idx = (x: number, y2: number): number => y2 * w2 + x;
  const inB = (x: number, y2: number): boolean => x >= 0 && x < w2 && y2 >= 0 && y2 < h2;
  const act = (x: number, y2: number): boolean => inB(x, y2) && !!(st.flags[idx(x, y2)] & 1);
  const sh = (x: number, y2: number): number => (inB(x, y2) ? SHEET[st.type[idx(x, y2)]] ?? 9999 : -1);
  const half = (x: number, y2: number): boolean => inB(x, y2) && st.half[idx(x, y2)] === 1;
  const slope = (x: number, y2: number): number => (inB(x, y2) ? st.slope[idx(x, y2)]! : 0);
  const inact = (x: number, y2: number): boolean => inB(x, y2) && ((st.wire[idx(x, y2)]! >>> 5) & 1) === 1;
  const nactive = (x: number, y2: number): boolean => act(x, y2) && !inact(x, y2) && !half(x, y2);
  const frameOnly = (x: number, y2: number, fx: number, fy: number): void => {
    if (!inB(x, y2)) return;
    const i2 = idx(x, y2);
    st.frameX[i2] = fx; st.frameY[i2] = fy;
  };
  // cs:31133 入场门（短路序逐字；type 读 raw（含幽灵）经 sheet 域比较）
  if (sh(i, y) !== 60) return;
  if (!nactive(i, y)) return;
  if (half(i, y)) return;
  if (slope(i, y) !== 0) return;
  if (sh(i, y) !== 60) return;
  const sideL = act(i - 1, y) && sh(i - 1, y) === 60;
  const sideR = act(i + 1, y) && sh(i + 1, y) === 60;
  if (!sideL && !sideR) return;
  // cs:31141-31151
  const num = 1;
  const num2 = rng.int(5, 14);
  diag.num2 = num2;
  let num3 = num2 + 2;
  if (sh(i, y) === 60) num3 += 5;
  if (!simEmptyTileCheck(st, i - num, i + num, y - num3, y - 1, offend)) return;
  // cs:31153-31275 干身循环（active+type 先写,掷后帧）
  let flag = false, flag2 = false;
  for (let j = y - num2; j < y; j++) {
    if (!inB(i, j)) continue;
    {
      const i2 = idx(i, j);
      st.flags[i2] = 1; st.type[i2] = TREE_INT;
    }
    const num4 = rng.int(0, 2);
    let num5 = rng.int(0, 9);
    if (j === y - 1 || j === y - num2) num5 = 0;
    while (((num5 === 5 || num5 === 7) && flag) || ((num5 === 6 || num5 === 7) && flag2)) {
      num5 = rng.int(0, 9);
    }
    flag = false; flag2 = false;
    if (num5 === 5 || num5 === 7) flag = true;
    if (num5 === 6 || num5 === 7) flag2 = true;
    {
      const b = TR_BASE[num5] ?? TR_BASE[0]!;
      frameOnly(i, j, b[0], b[1] + num4 * 22);
    }
    if (num5 === 5 || num5 === 7) {
      if (inB(i - 1, j)) {
        const i2 = idx(i - 1, j);
        st.flags[i2] = 1; st.type[i2] = TREE_INT;
      }
      const k = rng.int(0, 2);
      if (rng.int(0, 2) < 2) frameOnly(i - 1, j, 44, 198 + k * 22);
      else frameOnly(i - 1, j, 66, k * 22);
    }
    if (num5 === 6 || num5 === 7) {
      if (inB(i + 1, j)) {
        const i2 = idx(i + 1, j);
        st.flags[i2] = 1; st.type[i2] = TREE_INT;
      }
      const k = rng.int(0, 2);
      if (rng.int(0, 2) < 2) frameOnly(i + 1, j, 66, 198 + k * 22);
      else frameOnly(i + 1, j, 88, 66 + k * 22);
    }
  }
  // cs:31376-31422 根部方向
  const num6 = { v: rng.int(0, 2) };
  const fitL = nactive(i - 1, y) && !half(i - 1, y) && slope(i - 1, y) === 0 && ROOT_FIT_SHEETS.includes(sh(i - 1, y));
  const fitR = nactive(i + 1, y) && !half(i + 1, y) && slope(i + 1, y) === 0 && ROOT_FIT_SHEETS.includes(sh(i + 1, y));
  if (!fitL) { if (num6.v === 0) num6.v = 2; if (num6.v === 1) num6.v = 3; }
  if (!fitR) { if (num6.v === 0) num6.v = 1; if (num6.v === 2) num6.v = 3; }
  if (fitL && !fitR) num6.v = 2;
  if (fitR && !fitL) num6.v = 1;
  if (num6.v === 0 || num6.v === 1) {
    if (inB(i + 1, y - 1)) {
      const i2 = idx(i + 1, y - 1);
      st.flags[i2] = 1; st.type[i2] = TREE_INT;
    }
    const num4 = rng.int(0, 2);
    frameOnly(i + 1, y - 1, 22, 132 + num4 * 22);
  }
  if (num6.v === 0 || num6.v === 2) {
    if (inB(i - 1, y - 1)) {
      const i2 = idx(i - 1, y - 1);
      st.flags[i2] = 1; st.type[i2] = TREE_INT;
    }
    const num4 = rng.int(0, 2);
    frameOnly(i - 1, y - 1, 44, 132 + num4 * 22);
  }
  // cs:31424-31465 基座（仅帧,细胞干身循环已写）
  {
    const num4 = rng.int(0, 2);
    const fx = num6.v === 0 ? 88 : num6.v === 1 ? 0 : num6.v === 2 ? 66 : -1;
    if (fx >= 0) frameOnly(i, y - 1, fx, 132 + num4 * 22);
  }
  // cs:31466-31492 树冠（仅帧）
  if (rng.int(0, 7) !== 0) {
    const num4 = rng.int(0, 2);
    frameOnly(i, y - num2, 22, 198 + num4 * 22);
  } else {
    const num4 = rng.int(0, 2);
    frameOnly(i, y - num2, 0, 198 + num4 * 22);
  }
  // cs:31493 RangeFrame
  genRangeFrame(st, rng, i - 2, y - num2 - 1, i + 2, y + 1);
  void gs;
}

(RUN_SIM ? it : it.skip)('vanilla-exact SIM of UndergroundJungleTrees, cmp vs #069 + census', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(69, DUMPNAME);
  const { st, gs } = hydrate();
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  const rw = wrapRolls(rng, rolls, rc);

  flipGenSolid([379], true);
  const cands: string[] = [];
  const w = st.w, h = st.h;
  const yStart = gs.worldSurface - 1, yEnd = h - 350;
  const isJG = (x: number, y: number): boolean => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const i2 = y * w + x;
    return !!(st.flags[i2] & 1) && SHEET[st.type[i2]] === 60;
  };
  for (let i = 0; i < w; i++) {
    for (let j = yStart; j < yEnd; j++) {
      const g = rng.int(0, 9);
      if (g !== 0 && !gs.seedFlags.drunkWorld) continue;
      const i2 = j * w + i;
      const before = rw.cur();
      const diag: SimDiag = { offend: [], num2: -1 };
      simGrowUJT(st, rng, gs, i, j, diag);
      const after = rw.cur();
      const n = after - before;
      const cls = n === 0 ? 'entryReject' : n === 1 ? 'etcReject' : 'GROWN';
      cands.push(`cand(${i},${j}) rolls=${n} ${cls} num2=${diag.num2}${diag.offend.length ? ` offend=${diag.offend.join(';')}` : ''} anchor[act=${st.flags[i2]} t${SHEET[st.type[i2]]} half=${st.half[i2]} slope=${st.slope[i2]} inact=${(st.wire[i2] >>> 5) & 1}] L=${isJG(i - 1, j)} R=${isJG(i + 1, j)}`);
    }
  }
  writeFileSync(`${OUT}/sim-cands.txt`, cands.join('\n') + '\n');
  writeFileSync(`${OUT}/sim-rolls.txt`, rolls.join('\n') + '\n');
  const grown = cands.filter((c) => c.includes('GROWN'));
  console.log(`candidates(shown)=${cands.length} grown=${grown.length} rolls=${rc.n}`);
  console.log('SIM grown anchors:', grown.map((c) => c.slice(c.indexOf('(') + 1, c.indexOf(')')) + ':' + (c.match(/rolls=(\d+)/)?.[1] ?? '?')).join(' '));
  const r = cmp8(st, xv);
  console.log(`SIM cmp vs #069_Jungle_Trees: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
}, 600_000);

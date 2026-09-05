// III205 一次性诊断：ddual 链 #59 Statues（runStatuesPass）离线反演-重放。
// ① SW_I205_CAP=1：全量生成 ddual 链（seed '1.1.1.0.doubledaringdangers|20260831'/evil 0），
//   经 runStatuesPass 入口钩 __swStatCap 快照 store 13 通道+gs+GenSolid 覆写表+
//   dual potentialBounds → /tmp/iii205-out/base，随即 swAbort 停管。
//   （基座自检 vs gold #058_Life_Crystals——▶Statues reseed 点态=LifeCrystals 槽末。）
// ② SW_I205_RE=1：hydrate 基座 → JS runStatuesPass（现状：海洋回避环缺 dual 门）→
//   8ch 对拍 gold #059_Statues + 掷账/候选账落盘。
// ③ SW_I205_SIM=1：hydrate 基座 → vanilla-exact 手译（Terarria1458 WorldGen.cs:16947-17064
//   逐行编排,含 `oceanDepths || (dualDungeons && InAnyPotentialDungeonBounds)` 门;
//   叶级写面（prologue 清/2×3 净空/底座 SolidTile2/帧写/帧扫/陷阱）逐字复用
//   StatuesPass 导出面=三向对账唯一自由变量=编排）→ 8ch 对拍 + 与 RE 掷账/候选账对拍。
// 用法：cd game && SW_MB_1457=1 SW_I205_CAP=1 npx vitest run tools/_iii205stat.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import {
  runStatuesPass, STATUE_LIST, STATUES_WITH_TRAPS, placeStatueTrap,
  STATUE_105, STATUE_349, statueFrameSweep, FR_IMPORTANT_NOCUT,
} from '../src/world/gen/vanilla/StatuesPass';
import { snapshotGenSolid, restoreGenSolid, vanGenSolidType, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { dualDungeonState, inAnyPotentialDungeonBounds } from '../src/world/gen/vanilla/DungeonStyles1457';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runBuriedChestsPass, runUnderworldChestsPass, type ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN_CAP = process.env.SW_I205_CAP === '1';
const RUN_RE = process.env.SW_I205_RE === '1';
const RUN_SIM = process.env.SW_I205_SIM === '1';
const OUT = process.env.SW_I205_OUT ?? '/tmp/iii205-out';
const CMP_IDX = Number(process.env.SW_I205_CMP ?? 59);
const G2 = process.env.SW_I205_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;
const SEED = process.env.SW_I205_SEED ?? '1.1.1.0.doubledaringdangers|20260831';

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
      const arr = new Ctor((o.d ?? []).length) as { set(a: unknown[]): void };
      arr.set(o.d!);
      return arr;
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = desVal((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

(RUN_CAP ? it : it.skip)('capture base at Statues pass entry (ddual #59)', async () => {
  mkdirSync(`${OUT}/base`, { recursive: true });
  const g1 = globalThis as { __swStatCap?: unknown };
  let done = false;
  g1.__swStatCap = (gRaw: unknown, stRaw: unknown) => {
    if (done) return;
    const st = stRaw as TileStore;
    const gs = gRaw as GenState;
    if (!gs || !st) throw new Error('gs/st missing');
    writeFileSync(`${OUT}/base/base_gs.json`, JSON.stringify(serVal(gs)));
    // 生成期 tileSolid 覆写表快照（CLXXX 教训:缺它伪差放大）
    writeFileSync(`${OUT}/base/base_gensolid.json`, JSON.stringify([...snapshotGenSolid()]));
    // dual 界域/genvars 快照（CLXXIX 教训:基座第二件）
    writeFileSync(`${OUT}/base/base_dual.json`, JSON.stringify({
      enabled: dualDungeonState.enabled,
      potentialBounds: dualDungeonState.potentialBounds,
      dungeons: dualDungeonState.dungeons,
      normalizedDistanceSafeFromDither: dualDungeonState.normalizedDistanceSafeFromDither,
      tileProtection: dualDungeonState.tileProtection ?? null,
      wallProtection: dualDungeonState.wallProtection ?? null,
    }));
    serializeStore(st, `${OUT}/base`);
    console.log(`captured @Statues entry gs.seed=${gs.seed} ws=${gs.worldSurface} rock=${gs.rockLevel} beach=${gs.beachDistance} dual=${JSON.stringify(dualDungeonState.potentialBounds)}`);
    done = true;
    const e = new Error('SW_I205_ABORT') as Error & { swAbort?: boolean };
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
  } finally { delete g1.__swStatCap; }
  if (!done) throw new Error('capture failed: Statues entry never hit');
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
  // dual 界域恢复（离线进程模块态为缺省空表）
  const dual = JSON.parse(readFileSync(`${OUT}/base/base_dual.json`, 'utf8')) as typeof dualDungeonState & { tileProtection: boolean[][] | null; wallProtection: boolean[][] | null };
  dualDungeonState.enabled = dual.enabled;
  dualDungeonState.potentialBounds = dual.potentialBounds;
  dualDungeonState.dungeons = dual.dungeons;
  dualDungeonState.normalizedDistanceSafeFromDither = dual.normalizedDistanceSafeFromDither;
  if (dual.tileProtection) dualDungeonState.tileProtection = dual.tileProtection;
  if (dual.wallProtection) dualDungeonState.wallProtection = dual.wallProtection;
  return { st, gs };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
interface Loaded { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function loadDump(idx: number, DUMPNAME: Map<number, string>): Loaded {
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

interface Cmp8 { dA: number; dT: number; dW: number; dL: number; dHf: number; dSl: number; dLt: number; dIa: number; first: string; pairs: string }
function cmp8(xv: Loaded, st: TileStore, tag: string): Cmp8 {
  const r: Cmp8 = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, dLt: 0, dIa: 0, first: '', pairs: '' };
  const pair = new Map<string, number>();
  let fI = -1;
  const diffRows: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = xv.a[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { r.dA++; if (fI < 0) fI = i; continue; }
    const vt = va ? xv.t[i]! : 0;
    const jt = ja ? (st.type[i]! === 0 ? 0 : (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) : 0;
    if (vt !== jt) {
      r.dT++; if (fI < 0) fI = i;
      const k = `T${vt}>${jt}`;
      pair.set(k, (pair.get(k) ?? 0) + 1);
      if (diffRows.length < 3000) diffRows.push(`${i % W},${Math.floor(i / W)} t ${vt}>${jt}`);
    }
    if (xv.w[i]! !== st.wall[i]!) { r.dW++; if (fI < 0) fI = i; }
    if (xv.l[i]! !== st.liquid[i]!) { r.dL++; if (fI < 0) fI = i; }
    if (xv.hf[i]! !== st.half[i]!) { r.dHf++; if (fI < 0) fI = i; const k = `H${xv.hf[i]}>${st.half[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    if (xv.sl[i]! !== st.slope[i]!) { r.dSl++; if (fI < 0) fI = i; const k = `S${xv.sl[i]}>${st.slope[i]}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
    const vl = xv.l[i]! > 0 ? xv.lt[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { r.dLt++; if (fI < 0) fI = i; }
    const via = xv.ia[i]! ? 1 : 0;
    const jia = (st.wire[i]! >>> 5) & 1;
    if (via !== jia) { r.dIa++; if (fI < 0) fI = i; }
  }
  if (fI >= 0) {
    r.first = `(${fI % W},${Math.floor(fI / W)})`;
    r.pairs = [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ');
  }
  if (diffRows.length) writeFileSync(`${OUT}/${tag}-difflist.txt`, diffRows.join('\n') + '\n');
  return r;
}

function wrapRolls(rng: RNG, rolls: string[]): void {
  const rc = { n: 0 };
  const rp = rng as unknown as Record<string, unknown>;
  const wrap = (k: string): void => {
    const orig = rp[k] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') return;
    rp[k] = ((...a: unknown[]) => {
      const r = orig.apply(rng, a);
      rolls.push(`${++rc.n} ${k}(${a.map((x) => String(x)).join(',')})=${String(r)}`);
      return r;
    }) as never;
  };
  for (const k of ['int', 'nextInt', 'next', 'nextIntRange', 'chance', 'pick', 'range']) wrap(k);
}

function rollStreamDiff(jsFile: string, simRolls: string[], outTag: string): void {
  try {
    const js = readFileSync(jsFile, 'utf8').split('\n').filter(Boolean);
    let div = -1;
    for (let k = 0; k < Math.min(js.length, simRolls.length); k++) {
      if (js[k] !== simRolls[k]) { div = k; break; }
    }
    if (div < 0 && js.length !== simRolls.length) div = Math.min(js.length, simRolls.length);
    console.log(`roll-stream js vs sim: jsLen=${js.length} simLen=${simRolls.length} firstDiv=${div < 0 ? 'NONE(全等)' : div + 1}`);
    if (div >= 0) {
      console.log(`  js : ${js.slice(Math.max(0, div - 2), div + 3).join(' | ')}`);
      console.log(`  sim: ${simRolls.slice(Math.max(0, div - 2), div + 3).join(' | ')}`);
      writeFileSync(`${OUT}/${outTag}`, `firstDiv=${div + 1}\njs : ${js.slice(Math.max(0, div - 4), div + 6).join('\n')}\nsim: ${simRolls.slice(Math.max(0, div - 4), div + 6).join('\n')}\n`);
    }
  } catch { console.log('roll-stream: 对侧账缺,跳过'); }
}

(RUN_RE ? it : it.skip)(`RE: JS runStatuesPass on base vs gold #${CMP_IDX}`, () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(CMP_IDX, DUMPNAME);
  const pv = loadDump(CMP_IDX - 1, DUMPNAME);
  const { st, gs } = hydrate();
  console.log('gs:', JSON.stringify({
    worldSurface: gs.worldSurface, rockLevel: gs.rockLevel, beach: gs.beachDistance,
    dualBounds: dualDungeonState.potentialBounds, dualEnabled: dualDungeonState.enabled,
    flags: Object.entries(gs.seedFlags).filter(([, v]) => v).map(([k]) => k),
  }));
  // 基座自检 vs #058_Life_Crystals（▶Statues reseed 点=上一 pass 末态）
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base selfcheck vs #${String(CMP_IDX - 1).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX - 1)}] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base mismatch vs gold #058 — capture/hydrate broken');
  }
  const rolls: string[] = [];
  const rng2 = new RNG(gs.seed);
  wrapRolls(rng2, rolls);
  const cands: string[] = [];
  (globalThis as unknown as { __swStatTry?: unknown }).__swStatTry = (x: number, y: number, aSheet: number) => {
    cands.push(`${x},${y},${aSheet}`);
  };
  const t0 = Date.now();
  try {
    runStatuesPass(st, rng2, gs);
  } finally {
    delete (globalThis as unknown as { __swStatTry?: unknown }).__swStatTry;
  }
  writeFileSync(`${OUT}/re-rolls.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/re-cands.txt`, cands.join('\n') + '\n');
  console.log(`runStatuesPass ${Date.now() - t0}ms cands=${cands.length} rolls=${rolls.length}`);
  const r = cmp8(xv, st, 're');
  console.log(`RE cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.first || '✓ 全等'} ${r.pairs}`);
}, 600_000);

// ── RE60：#58 四循环整段离线重放（hydrate → Statues(修后) → 头四翻+四计数连掷 →
//    洞穴箱/地狱箱/地下小屋 → 尾四翻）→ 8ch 对拍 gold #060_Buried_Chests。
//    自检链：Statues 修后态 ≡ #059（CLXXX 同款两段自检）。
const RUN_RE60 = process.env.SW_I205_RE60 === '1';
(RUN_RE60 ? it : it.skip)(`RE60: Statues+UndergroundHouses portion on base vs gold #${CMP_IDX + 1}`, () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(CMP_IDX + 1, DUMPNAME);
  const pv = loadDump(CMP_IDX, DUMPNAME);
  const { st, gs } = hydrate();
  const chests: ChestSink = [];
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  wrapRolls(rng, rolls);
  const t0 = Date.now();
  runStatuesPass(st, rng, gs);
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[mid selfcheck vs #${String(CMP_IDX).padStart(3, '0')}_${DUMPNAME.get(CMP_IDX)} after Statues] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('post-Statues state mismatch vs gold #059 — 修后 Statues 未收敛');
  }
  // #58 四循环（statuesChestsPass ▶UndergroundHousesAndBuriedChests 段原序;先重播种子）
  rng.reseed(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests);
  runUnderworldChestsPass(st, rng, gs, chests);
  runCaveHousesPass(st, rng, gs, chests);
  flipGenSolid([226, 162, 225, 190], false);
  writeFileSync(`${OUT}/re60-rolls.txt`, rolls.join('\n') + '\n');
  console.log(`#58 portion ${Date.now() - t0}ms chests=${chests.filter(Boolean).length} rolls=${rolls.length}`);
  const r = cmp8(xv, st, 're60');
  console.log(`RE60 cmp vs #${CMP_IDX + 1}_${DUMPNAME.get(CMP_IDX + 1)}: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.first || '✓ 全等'} ${r.pairs}`);
}, 600_000);

// ── ANA：#58 段两产物账对拍——JS 箱单（sink）+屋单（__swHouseEv）vs gold #060−#059
//    差分提取的 vanilla 侧箱 2×2 锚/木屋簇 bbox。定谳「箱环是否全净、屋环首异位」。
const RUN_ANA = process.env.SW_I205_ANA === '1';
(RUN_ANA ? it : it.skip)(`ANA: chest/house ledger vs gold diff extraction`, () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(CMP_IDX + 1, DUMPNAME);
  const pv = loadDump(CMP_IDX, DUMPNAME);
  const { st, gs } = hydrate();
  const chests: ChestSink = [];
  const rng = new RNG(gs.seed);
  const houseLog: string[] = [];
  (globalThis as unknown as { __swHouseEv?: unknown }).__swHouseEv = (phase: string, x: number, y: number) => {
    houseLog.push(`${phase} ${x},${y}`);
  };
  // placeBuriedChest 入口台账（前 40 次）+ 首候选预告（独立 RNG 不污染主流）
  const abLog: string[] = [];
  (globalThis as unknown as { __swAbGate?: unknown }).__swAbGate = (tag: string, x: number, y: number) => {
    if (abLog.length < 40) abLog.push(`${tag} ${x},${y}`);
  };
  {
    const r2 = new RNG(gs.seed);
    r2.int(Math.trunc(35 * 1), Math.trunc(40 * 1));
    const uw = r2.int(10, 15);
    r2.int(35, 40);
    r2.int(2, 2);
    const yMinC = Math.floor((gs.worldSurfaceHigh + 20 + gs.rockLevel) / 2);
    const cx = r2.int(20, st.w - 21);
    const cy = r2.int(yMinC, st.h - 231);
    console.log(`[first-cand] uw=${uw} yMinC=${yMinC} first=(${cx},${cy}) inDual=${inAnyPotentialDungeonBounds(cx, cy)}`);
  }
  runStatuesPass(st, rng, gs);
  // ★管线原序：▶UndergroundHousesAndBuriedChests 处 rng.reseed(gs.seed)（漏掉则
  //   四计数连掷吃 Statues 尾流,整段错位——ana6 首跑实证 uw=14 伪影）
  rng.reseed(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  console.log(`[counts] caveHouse=${gs.caveHouseCount} underworldChest=${gs.underworldChestCount} caveChest=${gs.caveChestCount} desertHouse=${gs.desertHouseCount}`);
  runBuriedChestsPass(st, rng, gs, chests);
  const afterCave = chests.filter(Boolean).length;
  runUnderworldChestsPass(st, rng, gs, chests);
  const afterUw = chests.filter(Boolean).length;
  runCaveHousesPass(st, rng, gs, chests);
  const afterAll = chests.filter(Boolean).length;
  console.log(`[sink split] cave=${afterCave} +uw=${afterUw - afterCave} +house=${afterAll - afterUw} total=${afterAll}`);
  flipGenSolid([226, 162, 225, 190], false);
  delete (globalThis as unknown as { __swHouseEv?: unknown }).__swHouseEv;
  delete (globalThis as unknown as { __swAbGate?: unknown }).__swAbGate;
  console.log(`[ab-entries] ${abLog.length ? abLog.join(' | ') : '(none)'}`);
  // 探测器（JS 终态箱 2×2 块;先声明后用）
  const chestBlocksJs = (s: TileStore): Set<string> => {
    const out = new Set<string>();
    for (let y = 1; y < s.h - 1; y++) {
      for (let x = 1; x < s.w - 1; x++) {
        const i = y * s.w + x;
        if (!s.flags[i] || !s.flags[i + 1] || !s.flags[i + s.w] || !s.flags[i + s.w + 1]) continue;
        const sh = SHEET[s.type[i]!]!;
        if (sh !== 21 && sh !== 467) continue;
        if (SHEET[s.type[i + 1]!] === sh && SHEET[s.type[i + s.w]!] === sh && SHEET[s.type[i + s.w + 1]!] === sh) out.add(`${x},${y}`);
      }
    }
    return out;
  };
  const jsChests = chests.filter(Boolean).map((c) => `${c!.x},${c!.y}`).sort();
  writeFileSync(`${OUT}/ana-js-chests.txt`, jsChests.join('\n') + '\n');
  writeFileSync(`${OUT}/ana-js-houses.txt`, houseLog.join('\n') + '\n');
  console.log(`JS: chests=${jsChests.length} houseEvents=${houseLog.length} ok=${houseLog.filter((l) => l.startsWith('ok')).length}`);
  // 探测器自检：JS 终态 2×2 箱块 ⊇ sink
  {
    const jsBlocks = chestBlocksJs(st);
    const miss = jsChests.filter((k) => !jsBlocks.has(k));
    console.log(`[detector selfcheck] JS-state 2x2 blocks=${jsBlocks.size} sink=${jsChests.length} sink 缺于 blocks=${miss.length} ${miss.slice(0, 5).join(' ')}`);
  }
  // gold 差分提取：vanilla 侧新增/删除面
  interface Clu { cells: number[]; x0: number; y0: number; x1: number; y1: number }
  const clusters = (pred: (vt: number, jt: number, i: number) => boolean, sheetW: number): Clu[] => {
    const cells: number[] = [];
    for (let i = 0; i < N; i++) {
      const va = pv.a[i]!, ja = xv.a[i]!;
      const vt = va ? pv.t[i]! : 0;
      const jt = ja ? xv.t[i]! : 0;
      if (pred(vt, jt, i)) cells.push(i);
    }
    // 4 邻连通簇（sheetW=图宽）
    const set = new Set(cells);
    const seen = new Set<number>();
    const out: Clu[] = [];
    for (const c0 of cells) {
      if (seen.has(c0)) continue;
      const q = [c0];
      const grp: number[] = [];
      seen.add(c0);
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (q.length) {
        const ci = q.pop()!;
        grp.push(ci);
        const cx = ci % sheetW, cy = (ci / sheetW) | 0;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= sheetW || ny >= (N / sheetW) | 0) continue;
          const ni = ny * sheetW + nx;
          if (set.has(ni) && !seen.has(ni)) { seen.add(ni); q.push(ni); }
        }
      }
      out.push({ cells: grp, x0, y0, x1, y1 });
    }
    return out;
  };
  // vanilla 新增箱 2×2 锚（sheet 21/467 的新活性簇,取 bbox 左上）
  const vChestClus = clusters((vt, jt) => (jt === 21 || jt === 467 || vt === 21 || vt === 467), W);
  const vChests = vChestClus.map((c) => `${c.x0},${c.y0}`).sort();
  writeFileSync(`${OUT}/ana-gold-chests.txt`, vChests.join('\n') + '\n');
  console.log(`gold chest-clusters=${vChestClus.length}（21/467 差簇 bbox 左上,前 12: ${vChests.slice(0, 12).join(' ')}）`);
  // 木屋簇（sheet30 wood 新面簇,bbox）
  const woodClus = clusters((vt, jt) => vt === 30 || jt === 30, W).filter((c) => c.cells.length >= 40);
  woodClus.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  writeFileSync(`${OUT}/ana-gold-wood.txt`, woodClus.map((c) => `bbox(${c.x0},${c.y0})-(${c.x1},${c.y1}) n=${c.cells.length}`).join('\n') + '\n');
  console.log(`gold wood-clusters(≥40)=${woodClus.length} 前 10:`);
  for (const c of woodClus.slice(0, 10)) console.log(`  bbox(${c.x0},${c.y0})-(${c.x1},${c.y1}) n=${c.cells.length}`);
  const jsOk = houseLog.filter((l) => l.startsWith('ok ')).map((l) => l.slice(3));
  console.log(`JS accepted houses (${jsOk.length}): ${jsOk.slice(0, 10).join(' | ')}`);
  // ── 箱 2×2 块对拍（两侧 gold 直读;块=四格同 sheet∈{21,467} 且活性）──
  const chestBlocks = (t: Uint16Array, a: Uint8Array): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!a[i] || !a[i + 1] || !a[i + W] || !a[i + W + 1]) continue;
        const t0 = t[i]!;
        if (t0 !== 21 && t0 !== 467) continue;
        if (t[i + 1] === t0 && t[i + W] === t0 && t[i + W + 1] === t0) out.push([x, y]);
      }
    }
    return out;
  };
  const pvC = chestBlocks(pv.t, pv.a);
  const xvC = chestBlocks(xv.t, xv.a);
  const key = (p: [number, number]): string => `${p[0]},${p[1]}`;
  const pvSet = new Set(pvC.map(key));
  const xvSet = new Set(xvC.map(key));
  console.log(`gold 2x2 chest blocks: #059=${pvC.length} #060=${xvC.length} → vanilla 本段新置=${xvSet.size - pvSet.length}`);
  // vanilla 本段新置 = xvSet − pvSet（#059 箱不会被移除,差集即新置）
  const vanNew = new Set([...xvSet].filter((k) => !pvSet.has(k)));
  const sinkKeys = new Set(jsChests);
  const both = [...vanNew].filter((k) => sinkKeys.has(k));
  const vanOnly = [...vanNew].filter((k) => !sinkKeys.has(k)).sort((a, b) => {
    const [, ya] = a.split(',').map(Number); const [, yb] = b.split(',').map(Number); return ya - yb;
  });
  const jsOnly = [...sinkKeys].filter((k) => !vanNew.has(k)).sort((a, b) => {
    const [, ya] = a.split(',').map(Number); const [, yb] = b.split(',').map(Number); return ya - yb;
  });
  console.log(`对账: matched=${both.length} vanilla-only=${vanOnly.length} js-only=${jsOnly.length}`);
  console.log(`vanilla-only 前 10: ${vanOnly.slice(0, 10).join(' ')}`);
  console.log(`js-only 前 10: ${jsOnly.slice(0, 10).join(' ')}`);
  writeFileSync(`${OUT}/ana-chest-diff.txt`, `vanNew=${[...vanNew].sort().join('\n')}\n\nsink=\n${jsChests.join('\n')}\n`);
}, 600_000);

// ── SIM：vanilla-exact 手译（Terarria1458 WorldGen.cs:16947-17064 逐行编排,含 dual 门）──
// 叶级写面（prologue/净空/底座/帧写/statueFrameSweep/placeStatueTrap）逐字复用
// runStatuesPass 原文——唯一自由变量=编排（门）。
(RUN_SIM ? it : it.skip)(`SIM: vanilla-exact Statues on base vs gold #${CMP_IDX} + roll diff vs RE`, () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(CMP_IDX, DUMPNAME);
  const { st, gs } = hydrate();
  const { w, h } = st;
  const nf = gs.seedFlags;
  const dualGate = !!nf.dualDungeons;
  let count = Math.floor(STATUE_LIST.length * 2 * (w / 4200));
  if (nf.noTraps && !nf.skyblock) {
    count *= 15;
    if (nf.tenthAnniversary || nf.notTheBees) count = Math.trunc(count / 5);
  }
  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  const remixStatueY = !!gs.seedFlags.remix;
  const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  wrapRolls(rng, rolls);
  const cands: string[] = [];
  let num = 0;
  let placed = 0, gateRejects = 0, gives = 0, trapCalls = 0;
  const oceanRej = (x: number, y: number): boolean => y <= oceanTop && (x < gs.beachDistance || x > w - gs.beachDistance);
  for (let i = 0; i < count; i++) {
    if (num >= STATUE_LIST.length) num = 0;
    const [sheet, style] = STATUE_LIST[num]!;
    let done = false;
    let fail = 0;
    while (!done) {
      let x = rng.int(20, w - 21);
      let y = rng.int(yMin, h - 301);
      if (remixStatueY) rng.int(Math.trunc(gs.worldSurface), h - 401);   // :17006 照掷照弃
      // cs:17009：oceanDepths || (dualDungeons && InAnyPotentialDungeonBounds)
      let num8 = 100;
      for (;;) {
        if (!(oceanRej(x, y) || (dualGate && inAnyPotentialDungeonBounds(x, y)))) break;
        if (dualGate && !oceanRej(x, y)) gateRejects++;
        num8--;
        if (num8 <= 0) break;
        x = rng.int(20, w - 21);
        y = rng.int(yMin, h - 301);
        if (remixStatueY) rng.int(Math.trunc(gs.worldSurface), h - 401);   // :17020 同上
      }
      if (num8 <= 0) { done = true; gives++; break; }
      while (y < h && !st.flags[st.idx(x, y)]) y++;      // cs:17014 下扫首活性
      if (y >= h) { done = true; break; }
      y--;                                                // cs:17019 锚=首活性上一格
      const ai = st.idx(x, y);
      const anchorSheet = SHEET[st.type[ai]] ?? -1;
      cands.push(`${x},${y},${anchorSheet}`);
      // cs:17024-17028 flag2 双门（锚活性&&frameImportant&&!cut → 拒；anyShimmer → 拒）
      const shimmer = st.liquid[ai] > 0 && st.liquidType[ai] === 4;
      const flag2 = !(st.flags[ai] && FR_IMPORTANT_NOCUT.has(SHEET[st.type[ai]])) && !shimmer;
      if (flag2) {
        // cs:59501 PlaceTile 前奏清（任何失败尝试也清 inactive 锚格）+ PPPP 活性非 framed 支
        if (!st.flags[ai]) {
          st.half[ai] = 0; st.slope[ai] = 0; st.type[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
        } else if (!TILE_DEFS[st.type[ai]]?.framed) {
          st.half[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
        }
        if (y < 2 || !st.inBounds(x + 1, y - 2)) { fail++; if (fail >= 10000) { done = true; } continue; }
        let ok = true;
        for (let dx = 0; dx < 2 && ok; dx++) {
          for (let dy = -2; dy <= 0 && ok; dy++) {
            if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
          }
        }
        if (ok) {
          for (const bx of [x, x + 1]) {
            const bi = st.idx(bx, y + 1);
            if (!st.flags[bi] || st.half[bi] || st.slope[bi] !== 0
              || ((st.wire[bi] >>> 5) & 1) === 1 || !vanGenSolidType(st.type[bi])) { ok = false; break; }
          }
        }
        if (ok) {
          const tile = sheet === 349 ? STATUE_349 : STATUE_105;
          if (!tile) { done = true; break; }
          const row = Math.floor(style / 55);
          for (let dx = 0; dx < 2; dx++) {
            for (let dy = 0; dy < 3; dy++) {
              st.setTileSilent(x + dx, y - 2 + dy, tile, (style - row * 55) * 36 + dx * 18, row * 54 + dy * 18);
            }
          }
          placed++;
        }
        statueFrameSweep(st, rng, x, y);                 // cs:60100 PlaceTile(105) 尾九宫
      }
      // cs:17029 成功判定=PlaceTile 后回读锚格（引用语义）
      if (st.flags[ai] && SHEET[st.type[ai]] === sheet) {
        if (STATUES_WITH_TRAPS.has(num)) { trapCalls++; placeStatueTrap(st, rng, x, y, gs); }
        num++;
        done = true;
      } else {
        fail++;
        if (fail >= 10000) { done = true; }
      }
    }
  }
  writeFileSync(`${OUT}/sim-rolls.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/sim-cands.txt`, cands.join('\n') + '\n');
  console.log(`SIM count=${count} placed=${placed} gateRejects=${gateRejects} giveups(num8)=${gives} trapCalls=${trapCalls} rolls=${rolls.length}`);
  const r = cmp8(xv, st, 'sim');
  console.log(`SIM cmp vs #${CMP_IDX}_${DUMPNAME.get(CMP_IDX)}: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.first || '✓ 全等'} ${r.pairs}`);
  rollStreamDiff(`${OUT}/re-rolls.txt`, rolls, 'roll-div.txt');
  // 候选账首分歧
  try {
    const rc2 = readFileSync(`${OUT}/re-cands.txt`, 'utf8').split('\n').filter(Boolean);
    let d2 = -1;
    for (let k = 0; k < Math.min(rc2.length, cands.length); k++) {
      if (rc2[k] !== cands[k]) { d2 = k; break; }
    }
    if (d2 >= 0) {
      const [cx, cy] = rc2[d2]!.split(',');
      console.log(`cand-stream firstDiv idx=${d2} re(${rc2[d2]}) sim(${cands[d2]}) — re 锚 ${inAnyPotentialDungeonBounds(Number(cx), Number(cy)) ? '在 dual 界域内' : '不在界域'}`);
      writeFileSync(`${OUT}/cand-div.txt`, `firstDiv=${d2}\nre : ${rc2.slice(Math.max(0, d2 - 3), d2 + 4).join('\n')}\nsim: ${cands.slice(Math.max(0, d2 - 3), d2 + 4).join('\n')}\n`);
    } else console.log(`cand-stream 全等 (${cands.length})`);
  } catch { /* re-cands 缺 */ }
}, 600_000);

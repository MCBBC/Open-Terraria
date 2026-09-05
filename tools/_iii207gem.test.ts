// III207 一次性诊断：ddual 链 #94 Random_Gems（ExposedGemsUnderground：地下单晶 loop-1
// + 琥珀窗 loop-2）。基座=『宝石系统』槽头快照（/tmp/iii206-out/base，13 通道+gs+GenSolid
// 覆写表+dual 界域，SW_I206_CAP2=1 产自 tools/_iii206ujt.test.ts）。
// ① SW_I207_GEMS=1：JS 现实现重放（runExposedGemsUndergroundPass，reseed 锚照管线）→
//    8ch 对 gold #094 + 全掷账（wrapRolls 含 nextIntRange 补裹）+ loop-1/琥珀窗逐候选台账。
// ② SW_I207_SIM=1：vanilla-exact 手译（1458 WorldGen.cs:20892-20931 pass 体 +
//    :59841 PlaceTile 178 支 :60190-60201 + :60758-60762 成功尾 + :82613 TileFrame 前置 +
//    :86249 TileFrameImportant case 178 :86390-86437 + :60813 CheckAndAdjustMultiDirectionalTile
//    + :60790 ValidAnchorForMultiDirectionalTile + :70706/70859/70879/70899 SolidTileAllow* 四族
//    ——★CLXXXIII 家族教训：四族原生带 !inActive 腿，本 SIM 全带）→ 8ch 对 gold #094 + 同款台账。
// 用法：cd game && SW_MB_1457=1 SW_I207_GEMS=1 npx vitest run tools/_iii207gem.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runExposedGemsIcePass, runExposedGemsUndergroundPass } from '../src/world/gen/vanilla/GemPasses';
import { restoreGenSolid, vanGenSolidType, snapshotGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { genTileFrameNeighbor, genKillTile } from '../src/world/gen/vanilla/FinalCleanupPass';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { dualDungeonState, setupDualDungeonTileProtection } from '../src/world/gen/vanilla/DungeonStyles1457';

const RUN_GEMS = process.env.SW_I207_GEMS === '1';
const RUN_SIM = process.env.SW_I207_SIM === '1';
const RUN_CAP98 = process.env.SW_I207_CAP98 === '1';   // 槽头捕获（微群系）
const RUN_MB = process.env.SW_I207_MB === '1';         // 微群系离线重放
const OUT = process.env.SW_I207_OUT ?? '/tmp/iii207-out';
const BASE = process.env.SW_I206_BASE ?? '/tmp/iii206-out';
const G2 = process.env.SW_I206_G2 ?? `${process.env.HOME}/GoldenChains/golden-ddual2`;
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 内部 id → 原版 sheet 178（宝石） */
const GEM_INT = (() => { for (let t = 0; t < TILE_DEFS.length; t++) if (SHEET[t] === 178) return t; return 0; })();
/** Main.tileSolidTop（GemPasses 同表副本） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.Boulders（:60790 ValidAnchor 门）+ 门 10 */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

type AnyGs = Record<string, unknown>;
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

function hydrate(): { st: TileStore; gs: GenState } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${BASE}/base/base_gs.json`, 'utf8'))) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASE}/base/base_gensolid.json`, 'utf8')) as [number, boolean][]));
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
    if (xv.hf[i] !== st.half[i]) { dHf++; if (fI < 0) fI = i; }
    if (xv.sl[i] !== st.slope[i]) { dSl++; if (fI < 0) fI = i; }
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
  for (const k of ['int', 'nextInt', 'nextIntRange', 'next', 'chance', 'pick']) wrap(k);
  return { cur: () => cur };
}

function selfCheck(st: TileStore, pv: ReturnType<typeof loadDump>): void {
  let dA = 0, dT = 0, dW = 0, dIa = 0, dHf = 0, dSl = 0, dL = 0;
  for (let i = 0; i < N; i++) {
    const ja = st.flags[i]! & 1;
    if (pv.a[i] !== ja) { dA++; continue; }
    if (ja && pv.t[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!] : 9999)) dT++;
    if (pv.w[i] !== st.wall[i]) dW++;
    if (pv.l[i] !== st.liquid[i]) dL++;
    if (pv.hf[i] !== st.half[i]) dHf++;
    if (pv.sl[i] !== st.slope[i]) dSl++;
    if (ja && (pv.ia[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa++;
  }
  console.log(`[base selfcheck vs #093_Gems_In_Ice_Biome] dAct=${dA} dTyp=${dT} dWal=${dW} dLiq=${dL} dHf=${dHf} dSl=${dSl} dIa=${dIa}`);
  if (dA || dT || dW || dL || dHf || dSl || dIa) throw new Error('base mismatch vs gold #093 — capture/hydrate broken');
}

// ───────────────────────── ⓪ CAP98：微群系槽头捕获 ─────────────────────────
(RUN_CAP98 ? it : it.skip)('capture base at 微群系 slot head (ddual #98)', async () => {
  const DIR = `${OUT}/base98`;
  mkdirSync(DIR, { recursive: true });
  const g1 = globalThis as { __swI91Cap?: unknown };
  let done = false;
  g1.__swI91Cap = (stRaw: unknown, gRaw: unknown, ch: unknown, nm: string) => {
    if (done || nm !== '微群系') return;
    const st = stRaw as TileStore;
    const gs = gRaw as GenState;
    if (!gs) throw new Error('gs missing');
    writeFileSync(`${DIR}/base_gs.json`, JSON.stringify(desVal(JSON.parse(JSON.stringify(gs)))));
    writeFileSync(`${DIR}/base_gensolid.json`, JSON.stringify([...snapshotGenSolid98()]));
    // ★IIIII208：dual 界域快照（dualDungeonState 为模块态,gs 不携带——MB dual 门族
    //   离线重放必需;普通/非 dual 世界为 {enabled:false, potentialBounds:[]} 同构）
    writeFileSync(`${DIR}/base_dual.json`, JSON.stringify({
      enabled: dualDungeonState.enabled,
      potentialBounds: dualDungeonState.potentialBounds,
      dungeons: dualDungeonState.dungeons,
    }));
    writeFileSync(`${DIR}/base_chests.json`, JSON.stringify(ch ?? []));
    serializeStore98(st, DIR);
    console.log(`captured @${nm} chests=${Array.isArray(ch) ? ch.length : 'n/a'}`);
    done = true;
    const e = new Error('SW_I207_ABORT') as Error & { swAbort?: boolean };
    e.swAbort = true;
    throw e;
  };
  try {
    await generateWorld({ width: W, height: H, seedText: SEED_TEXT, evil: 0 as -1 | 0 | 1, onWorldPartial: () => {} });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!(e as { swAbort?: boolean })?.swAbort && !msg.includes('ABORT')) throw e;
  } finally { delete g1.__swI91Cap; }
  if (!done) throw new Error('capture failed: 微群系 slot head never hit');
}, 600_000);

const SEED_TEXT = '1.1.1.0.doubledaringdangers|20260831';
function snapshotGenSolid98(): [number, boolean][] {
  return [...snapshotGenSolid()];
}
function serializeStore98(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of CHANS) {
    const a = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    writeFileSync(`${dir}/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    hdr[`${c}_len`] = a.length;
  }
  writeFileSync(`${dir}/base_hdr.json`, JSON.stringify(hdr));
}

function hydrate98(): { st: TileStore; gs: GenState; chests: unknown } {
  const DIR = `${OUT}/base98`;
  const hdr = JSON.parse(readFileSync(`${DIR}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${DIR}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base98_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${DIR}/base_gs.json`, 'utf8'))) as GenState;
  restoreGenSolid(new Map(JSON.parse(readFileSync(`${DIR}/base_gensolid.json`, 'utf8')) as [number, boolean][]));
  // ★IIIII208：回灌 dual 界域（模块态）——MB dual 门族消费源
  {
    const dual = JSON.parse(readFileSync(`${DIR}/base_dual.json`, 'utf8')) as {
      enabled: boolean; potentialBounds: typeof dualDungeonState.potentialBounds;
      dungeons: typeof dualDungeonState.dungeons;
    };
    dualDungeonState.enabled = dual.enabled;
    dualDungeonState.potentialBounds = dual.potentialBounds;
    dualDungeonState.dungeons = dual.dungeons;
    // ★IIIII209：tileProtection（IIIII121 isDungeonTile 合并表）不在 CAP98 快照内
    //   ——DM 候选门 cbcDg 双态语义消费源,按 DunesPass:123 同配方离线重建。
    if (dual.enabled && dual.dungeons.length >= 2) {
      setupDualDungeonTileProtection(dual.dungeons[0]!.theme, dual.dungeons[1]!.theme, !!gs.crimson);
    }
  }
  const chests = JSON.parse(readFileSync(`${DIR}/base_chests.json`, 'utf8'));
  return { st, gs, chests };
}

// ───────────────────────── ③ MB：微群系离线重放 ─────────────────────────
(RUN_MB ? it : it.skip)('JS replay micro-biomes on 微群系-head base, cmp vs #098', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(98, DUMPNAME);
  const pv = loadDump(97, DUMPNAME);
  const { st, gs, chests } = hydrate98();
  {
    let dA = 0, dT = 0, dW = 0;
    for (let i2 = 0; i2 < N; i2++) {
      if (pv.a[i2] !== (st.flags[i2]! & 1)) dA++;
      else if (pv.a[i2] && pv.t[i2] !== (SHEET[st.type[i2]!] >= 0 ? SHEET[st.type[i2]!] : 9999)) dT++;
      else if (pv.w[i2] !== st.wall[i2]) dW++;
    }
    console.log(`[base98 selfcheck vs #097_Larva] dAct=${dA} dTyp=${dT} dWal=${dW}`);
    if (dA || dT || dW) throw new Error('base98 mismatch vs gold #097 — capture/hydrate broken');
  }
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  rng.reseed(gs.seed);
  // ★IIIII208：MB 段内探针挂载（roll 位 + 段名 + 详情）→ ${OUT}/mb-seg.txt
  const seg: string[] = [];
  (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg =
    (n: string, d?: unknown) => { seg.push(`${rc.n} ${n}${d === undefined ? '' : ' ' + String(typeof d === 'object' ? JSON.stringify(d) : d)}`); };
  const t0 = Date.now();
  runMicroBiomesPass(st, rng, gs, chests as never);
  delete (globalThis as unknown as { __swSeg?: unknown }).__swSeg;
  writeFileSync(`${OUT}/mb-seg.txt`, seg.join('\n') + '\n');
  console.log(`runMicroBiomesPass ${Date.now() - t0}ms rolls=${rc.n}`);
  const r = cmp8(st, xv);
  console.log(`MB cmp vs #098_Micro_Biomes: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  // III207 全量 sheet 域差格分类（含 ghost）：act+sheet(type)+wall+liquid 全比对
  {
    const cls = new Map<string, { n: number; xs: number[]; ys: number[] }>();
    for (let i = 0; i < N; i++) {
      const va = xv.a[i]!, ja = st.flags[i]! & 1;
      const vt = va ? xv.t[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va === ja && vt === jt && xv.w[i] === st.wall[i] && xv.l[i] === st.liquid[i]) continue;
      const k = `A${va}${ja}T${vt}>${jt}W${xv.w[i]}>${st.wall[i]}L${xv.l[i]}>${st.liquid[i]}`;
      let c = cls.get(k);
      if (!c) { c = { n: 0, xs: [], ys: [] }; cls.set(k, c); }
      c.n++;
      if (c.xs.length < 60000) { c.xs.push(i % W); c.ys.push((i / W) | 0); }
    }
    const lines = [...cls.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 60).map(([k, c]) => {
      const x0 = Math.min(...c.xs), x1 = Math.max(...c.xs), y0 = Math.min(...c.ys), y1 = Math.max(...c.ys);
      return `${k} ×${c.n} bbox=[${x0}..${x1}]×[${y0}..${y1}] sample=(${c.xs[0]},${c.ys[0]})`;
    });
    writeFileSync(`${OUT}/mb-classes.txt`, lines.join('\n') + '\n');
    console.log(`mb classes: ${cls.size} (top: ${lines[0] ?? '-'})`);
  }
  writeFileSync(`${OUT}/mb-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/mb-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
  // ★IIIII208：全通道落盘（房间级对拍用）
  for (const c of ['wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'frameX', 'frameY', 'paint', 'paintWall'] as const) {
    const arr = (st as unknown as Record<string, Uint8Array | Uint16Array>)[c];
    writeFileSync(`${OUT}/mb-post-${c === 'wall' ? 'wal' : c === 'liquidType' ? 'lty' : c}.bin`, Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  }
  writeFileSync(`${OUT}/mb-rolls.txt`, rolls.join('\n') + '\n');
}, 600_000);

// ───────────────────────── ① JS 现实现重放 ─────────────────────────
(RUN_GEMS ? it : it.skip)('JS replay gems slot (ice+underground) vs #094 + ledger', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(94, DUMPNAME);
  const pv = loadDump(93, DUMPNAME);
  const { st, gs } = hydrate();
  selfCheck(st, pv);
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  rng.reseed(gs.seed);
  runExposedGemsIcePass(st, rng, gs);
  const n1 = rc.n;
  rng.reseed(gs.seed);
  runExposedGemsUndergroundPass(st, rng, gs);
  console.log(`ice rolls=${n1} underground rolls=${rc.n - n1} (wrapped; nextIntRange 已裹)`);
  const r = cmp8(st, xv);
  console.log(`GEMS(JS) cmp vs #094_Random_Gems: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  writeFileSync(`${OUT}/js-rolls-gems.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/js-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/js-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
}, 600_000);

// ───────────────────────── ② vanilla-exact SIM ─────────────────────────
// SolidTileAllow* 四族（:70706/70859/70879/70899）——全带 !inActive 腿（CLXXXIII 教训）
function makeSim(st: TileStore, rng: RNG, gs: GenState, ledger: string[]) {
  const flags = st.flags, type = st.type, fx = st.frameX, fy = st.frameY, wall = st.wall;
  const liquid = st.liquid, ltype = st.liquidType, half = st.half, slope = st.slope, wire = st.wire;
  const inB = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H;
  const idx = (x: number, y: number): number => y * W + x;
  const act = (x: number, y: number): boolean => inB(x, y) && !!(flags[idx(x, y)] & 1);
  const typeAt = (x: number, y: number): number => (inB(x, y) ? type[idx(x, y)]! : 0);
  const inact = (x: number, y: number): boolean => inB(x, y) && ((wire[idx(x, y)]! >>> 5) & 1) === 1;
  const solidOf = (t: number): boolean => vanGenSolidType(t);
  const inWorld = (x: number, y: number, f: number): boolean => x >= f && y >= f && x < W - f && y < H - f;

  // ★域纪律：SOLID_TOP/BOULDERS/380 为原版 sheet 域——内部 id 必须经 SHEET[] 转换
  const sheetOf = (t: number): number => (SHEET[t] >= 0 ? SHEET[t]! : -1);
  // SolidTileAllowTopSlope（:70859）——dir 0（上锚）
  const allowTop = (x: number, y: number): boolean => {
    if (!inB(x, y)) return true;                       // Main.tile null → true
    const t = typeAt(x, y);
    const plat = !!TILE_DEFS[t]?.platform;
    return act(x, y) && (solidOf(t) || sheetOf(t) === 380) && ((!plat && !(slope[idx(x, y)] === 3 || slope[idx(x, y)] === 4)) || (plat && half[idx(x, y)] === 1)) && !inact(x, y);
  };
  // SolidTileAllowBottomSlope（:70706）——dir 1（下锚）；有 InWorld 门（越界 true）
  const allowBottom = (x: number, y: number): boolean => {
    if (!inB(x, y)) return true;
    const t = typeAt(x, y);
    const plat = !!TILE_DEFS[t]?.platform;
    const topSlope = slope[idx(x, y)] === 1 || slope[idx(x, y)] === 2;
    return act(x, y) && (solidOf(t) || SOLID_TOP.has(sheetOf(t))) && (!topSlope || (plat && platformProperTopFrame(st.frameX[idx(x, y)]!))) && half[idx(x, y)] !== 1 && !inact(x, y);
  };
  // SolidTileAllowLeftSlope（:70879）——dir 2（左锚）：拒 rightSlope（Tile.cs：1|3）
  const allowLeft = (x: number, y: number): boolean => {
    if (!inB(x, y)) return true;
    const t = typeAt(x, y);
    return act(x, y) && solidOf(t) && half[idx(x, y)] !== 1 && !(slope[idx(x, y)] === 1 || slope[idx(x, y)] === 3) && !TILE_DEFS[t]?.platform && !inact(x, y);
  };
  // SolidTileAllowRightSlope（:70899）——dir 3（右锚）：拒 leftSlope（Tile.cs：2|4）
  const allowRight = (x: number, y: number): boolean => {
    if (!inB(x, y)) return true;
    const t = typeAt(x, y);
    return act(x, y) && solidOf(t) && half[idx(x, y)] !== 1 && !(slope[idx(x, y)] === 2 || slope[idx(x, y)] === 4) && !TILE_DEFS[t]?.platform && !inact(x, y);
  };
  function platformProperTopFrame(f: number): boolean {
    const n = Math.floor(f / 18);
    return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
  }
  // ValidAnchorForMultiDirectionalTile（:60790）：tileCache.type≥0 && !Boulders && !=10
  const validAnchor = (x: number, y: number, dir: 0 | 1 | 2 | 3): boolean => {
    if (!inB(x, y)) return false;                       // tileCache null → false
    const t = typeAt(x, y);
    if (t < 0 || BOULDERS.has(sheetOf(t)) || sheetOf(t) === 10) return false;
    if (dir === 0) return allowTop(x, y);
    if (dir === 1) return allowBottom(x, y);
    if (dir === 2) return allowLeft(x, y);
    return allowRight(x, y);
  };
  // CheckAndAdjustMultiDirectionalTile（:60813）→ dir 或 -1
  const checkAndAdjust = (x: number, y: number): number => {
    if (!inWorld(x, y, 2)) return -1;
    const num2 = validAnchor(x, y - 1, 0) ? typeAt(x, y - 1) : -1;   // 上
    const num = validAnchor(x, y + 1, 1) ? typeAt(x, y + 1) : -1;    // 下
    const num3 = validAnchor(x - 1, y, 2) ? typeAt(x - 1, y) : -1;   // 左
    const num4 = validAnchor(x + 1, y, 3) ? typeAt(x + 1, y) : -1;   // 右
    if (num >= 0 && solidOf(num) && !SOLID_TOP.has(sheetOf(num))) return 0;
    if (num3 >= 0 && solidOf(num3) && !SOLID_TOP.has(sheetOf(num3))) return 2;
    if (num4 >= 0 && solidOf(num4) && !SOLID_TOP.has(sheetOf(num4))) return 3;
    if (num2 >= 0 && solidOf(num2) && !SOLID_TOP.has(sheetOf(num2))) return 1;
    return -1;
  };
  // TileFrame(i,j,reset=true) 中心支（case 178）：pass → Next(3)*18 掷+带外覆写；fail → KillTile
  const tileFrameCenter = (x: number, y: number): void => {
    if (!inB(x, y)) return;
    const i = idx(x, y);
    if (!(flags[i] & 1)) return;
    const fy2 = fy[i]!;
    const dir = checkAndAdjust(x, y);
    if (dir >= 0) {
      const num21 = rng.nextInt(3) * 18;
      let num22 = -1;
      if (dir === 0 && (fy2 < 0 || fy2 > 36)) num22 = 0;
      else if (dir === 1 && (fy2 < 54 || fy2 > 90)) num22 = 54;
      else if (dir === 2 && (fy2 < 108 || fy2 > 144)) num22 = 108;
      else if (dir === 3 && (fy2 < 162 || fy2 > 198)) num22 = 162;
      if (num22 > -1) fy[i] = num22 + num21;
    } else {
      genKillTile(st, rng, x, y);
    }
  };
  // SquareTileFrame（cs:81470 列主序九宫，中心 reset=true；邻格走已验证引擎 reset=false）
  const squareTileFrame = (x: number, y: number): void => {
    for (const [dx, dy, reset] of [[-1, -1, false], [-1, 0, false], [-1, 1, false], [0, -1, false], [0, 0, true], [0, 1, false], [1, -1, false], [1, 0, false], [1, 1, false]] as const) {
      const cx = x + dx, cy = y + dy;
      if (!inB(cx, cy)) continue;
      if (reset) tileFrameCenter(cx, cy);
      else genTileFrameNeighbor(st, rng, cx, cy);
    }
  };
  // PlaceTile(178)（:60190-60201 支 + :60758-60762 成功尾）
  const anchorInfo = (x: number, y: number): string => {
    const t = typeAt(x, y);
    return `(${x},${y})t${t}s${sheetOf(t)}sol${solidOf(t) ? 1 : 0}`;
  };
  const placeTile178 = (x: number, y: number, style: number, tag: string): void => {
    if (!inB(x, y)) return;
    const i = idx(x, y);
    if (!(flags[i] & 1)) { type[i] = 0; fx[i] = 0; fy[i] = 0; half[i] = 0; slope[i] = 0; st.paint[i] = 0; }
    const dir = checkAndAdjust(x, y);
    if (dir < 0) {
      const ax = x, ay = y;
      ledger.push(`${tag} place (${x},${y}) FAIL dir=-1 anchors B=${anchorInfo(ax, ay + 1)} L=${anchorInfo(ax - 1, ay)} R=${anchorInfo(ax + 1, ay)} A=${anchorInfo(ax, ay - 1)}`);
      return;
    }
    flags[i] = (flags[i]! | 1) as number;
    type[i] = GEM_INT;
    fx[i] = style * 18;
    fy[i] = rng.nextInt(3) * 18;
    squareTileFrame(x, y);
    if (flags[i] & 1) squareTileFrame(x, y);            // cs:60275 成功尾
    ledger.push(`${tag} place (${x},${y}) ok dir=${dir} style=${style}`);
  };

  return {
    runUnderground(): void {
      // loop-1 地下单晶（:20898-20908）
      for (let i = 0; i < W; i++) {
        const x = rng.nextIntRange(20, W - 20);
        const y = rng.nextIntRange(Math.floor(gs.rockLevel), H - 300);
        if (!inB(x, y)) { ledger.push(`L1 ${i} (${x},${y}) OOB skip`); continue; }
        const ii = idx(x, y);
        const g = !(flags[ii] & 1) && !(liquid[ii]! > 0 && ltype[ii] === LIQUID_TYPE.LAVA) && !WALL_DUNGEON.has(wall[ii]!) && wall[ii] !== 27;
        if (!g) { ledger.push(`L1 ${i} (${x},${y}) gate=0`); continue; }
        const r12 = rng.nextInt(12);
        const style = r12 < 3 ? 0 : r12 < 6 ? 1 : r12 < 8 ? 2 : r12 < 10 ? 3 : r12 < 11 ? 4 : 5;
        placeTile178(x, y, style, `L1 ${i} y=${y}`);
      }
      // loop-2 琥珀窗（:20909-20930）
      for (let i = 0; i < W; i++) {
        const x = rng.nextIntRange(20, W - 20);
        const y = rng.nextIntRange(Math.floor(gs.worldSurface), H - 300);
        if (!inB(x, y)) { ledger.push(`AM ${i} (${x},${y}) OOB skip`); continue; }
        const ii = idx(x, y);
        const g = !(flags[ii] & 1) && !(liquid[ii]! > 0 && ltype[ii] === LIQUID_TYPE.LAVA) && (wall[ii] === 216 || wall[ii] === 187);
        if (!g) { ledger.push(`AM ${i} (${x},${y}) gate=0`); continue; }
        const al = 1 + rng.nextInt(3), ar = 1 + rng.nextInt(3), at = 1 + rng.nextInt(3), ab = 1 + rng.nextInt(3);
        const head = `AM ${i} origin=(${x},${y}) win=[${x - al},${x + ar})x[${y - at},${y + ab})`;
        const placed: string[] = [];
        for (let k = x - al; k < x + ar; k++) {
          for (let l = y - at; l < y + ab; l++) {
            if (!inB(k, l)) continue;
            if (!(flags[idx(k, l)] & 1)) {
              const before = ledger.length;
              placeTile178(k, l, 6, `${head}`);
              if (ledger.length > before) {
                const last = ledger[ledger.length - 1]!;
                placed.push(last.includes(' ok ') ? `(${k},${l})dir${last.match(/dir=(-?\d+)/)?.[1]}` : `(${k},${l})FAIL`);
                ledger.pop();
              }
            }
          }
        }
        ledger.push(`${head} placed=[${placed.join(' ')}]`);
      }
    },
  };
}

(RUN_SIM ? it : it.skip)('vanilla-exact SIM of ExposedGemsUnderground vs #094 + ledger', () => {
  const DUMPNAME = dumpNames();
  const xv = loadDump(94, DUMPNAME);
  const pv = loadDump(93, DUMPNAME);
  const { st, gs } = hydrate();
  selfCheck(st, pv);
  const rng = new RNG(gs.seed);
  const rolls: string[] = [];
  const rc = { n: 0 };
  wrapRolls(rng, rolls, rc);
  rng.reseed(gs.seed);
  const ledger: string[] = [];
  const sim = makeSim(st, rng, gs, ledger);
  sim.runUnderground();
  console.log(`SIM rolls=${rc.n}`);
  const r = cmp8(st, xv);
  console.log(`SIM cmp vs #094_Random_Gems: dA=${r.dA} dT=${r.dT} dW=${r.dW} dL=${r.dL} dHf=${r.dHf} dSl=${r.dSl} dLt=${r.dLt} dIa=${r.dIa} ${r.dA || r.dT ? '✗ ' + r.first + ' ' + r.pairs : '✓'}`);
  writeFileSync(`${OUT}/sim-ledger.txt`, ledger.join('\n') + '\n');
  writeFileSync(`${OUT}/sim-rolls-gems.txt`, rolls.join('\n') + '\n');
  writeFileSync(`${OUT}/sim-post-act.bin`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
  writeFileSync(`${OUT}/sim-post-typ.bin`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
}, 600_000);

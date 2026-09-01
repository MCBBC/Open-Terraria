// IIII112b 一次性重放保真度检验：hydrate(cap-win 基座) → 跑埋箱段 → 与管线段末态
// (end-win，▶SurfaceChests 时点整 store) 对拍八通道。零差=重放保真，可用于分段二分。
// 用法：cd game && SW_I148F=1 npx vitest run tools/_iii148fid.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runBuriedChestsPass, runUnderworldChestsPass } from '../src/world/gen/vanilla/BuriedChestsPass';
import { rollHouseChestCounts, runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I148F === '1';
const OUT = process.env.SW_I148F_OUT ?? '/tmp/iii148-out';
const W = 4200, H = 1200, N = W * H;
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;

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

(RUN ? it : it.skip)('replay fidelity check vs pipeline end state', () => {
  const loadDir = (dir: string): { st: TileStore; gs?: GenState } => {
    const hdr = JSON.parse(readFileSync(`${dir}/base_hdr.json`, 'utf8'));
    const st = new TileStore(hdr.w as number, hdr.h as number);
    const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
    for (const c of CHANS) {
      const len = hdr[`${c}_len`] as number;
      const buf = readFileSync(`${dir}/base_${c}.bin`);
      const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
      rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
    }
    let gs: GenState | undefined;
    try {
      gs = desVal(JSON.parse(readFileSync(`${dir}/base_gs.json`, 'utf8'))) as GenState;
    } catch { /* end-win has no gs */ }
    return { st, gs };
  };
  const base = loadDir(`${OUT}/cap-win`);
  const end = loadDir(`${OUT}/end-win`);
  const gs = base.gs!;
  const st = base.st;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const sh = (s: number): number => (s >= 0 ? s : 9999);
  const chests: unknown[] = [];
  // 箱/屋事件镜（与 _iii148seg 同款,供重放↔管线事件对位）
  const ev: string[] = [];
  let rc = 0;
  const g = globalThis as Record<string, unknown>;
  g.__swOnRoll = () => { rc++; };
  g.__swChestWrite = (i: number, topY: number, tile: number, style: number) => {
    const shh = TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
    ev.push(`${rc}|W|i=${i},gy=${topY},sheet=${shh},style=${style}`);
  };
  g.__swChestDbg = (i: number, gy: number, why: string) => {
    ev.push(`${rc}|R|i=${i},gy=${gy},why=${why}`);
  };
  g.__swHouseGate = (gate: string, ox: number, oy: number) => {
    ev.push(`${rc}|NO|gate=${gate},ox=${ox},oy=${oy}`);
  };
  g.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    ev.push(`${rc}|RM|ox=${ox},oy=${oy},rooms=${rooms}`);
  };
  // ★目标屋分段快照（SW_I148F_HOUSE=ox,oy）：每个 builder 阶段后截取屋域九态,
  //   供与 x86 #59 逐阶段对拍 → 定位首个分歧阶段。
  const HB = (process.env.SW_I148F_HOUSE ?? '1420,665').split(',').map(Number);
  const RG = { x0: HB[0] - 40, x1: HB[0] + 40, y0: HB[1] - 25, y1: HB[1] + 25 };
  const stageSnaps: Array<{ tag: string; rc: number; typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array }> = [];
  const regionSnap = (): { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array } => {
    const w = RG.x1 - RG.x0 + 1, h = RG.y1 - RG.y0 + 1;
    const typ = new Uint16Array(w * h), act = new Uint8Array(w * h), wal = new Uint16Array(w * h), liq = new Uint8Array(w * h);
    for (let y = RG.y0; y <= RG.y1; y++) {
      for (let x = RG.x0; x <= RG.x1; x++) {
        const i = y * W + x, q = (y - RG.y0) * w + (x - RG.x0);
        act[q] = rst0.flags[i]! & 1;
        typ[q] = act[q] ? (TILE_DEFS[rst0.type[i]!]?.vanilla?.sheet ?? 9999) : 0;
        wal[q] = rst0.wall[i]!;
        liq[q] = rst0.liquid[i]!;
      }
    }
    return { typ, act, wal, liq };
  };
  let rst0: TileStore = st;   // 别名(阶段钩内用)
  g.__swHouseStage = (tag: string, ox: number, oy: number, a: number, rollN: number) => {
    if (ox === HB[0] && oy === HB[1]) stageSnaps.push({ tag, rc: rollN, ...regionSnap() });
  };
  flipGenSolid([226, 162, 225, 190], true);
  // ★流位纪律：计数预掷必须由【主 rng】消费（管线=reseed 后同一实例连掷 4 颗）。
  //   曾用一次性实例预掷 → 主 rng 少耗 4 颗,整段流位前移(伪分叉)。
  const rng = new RNG(gs.seed);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests as never);
  runUnderworldChestsPass(st, rng, gs, chests as never);
  runCaveHousesPass(st, rng, gs, chests as never);
  flipGenSolid([226, 162, 225, 190], false);
  delete g.__swOnRoll; delete g.__swChestWrite; delete g.__swChestDbg;
  delete g.__swHouseGate; delete g.__swHouseRooms; delete g.__swHouseStage;
  // ★阶段快照落盘（SW_I148F_SAVE=1 且有捕获时）
  if (process.env.SW_I148F_SAVE === '1' && stageSnaps.length > 0) {
    const { mkdirSync: mk2, writeFileSync: wf2 } = require('node:fs') as typeof import('node:fs');
    mk2(`${OUT}/stages`, { recursive: true });
    wf2(`${OUT}/stages/meta.json`, JSON.stringify({ rg: RG, snaps: stageSnaps.map((s) => ({ tag: s.tag, rc: s.rc, w: RG.x1 - RG.x0 + 1, h: RG.y1 - RG.y0 + 1 })) }));
    for (let k = 0; k < stageSnaps.length; k++) {
      const s2 = stageSnaps[k]!;
      wf2(`${OUT}/stages/${String(k).padStart(2, '0')}_${s2.tag}.typ`, Buffer.from(s2.typ.buffer, s2.typ.byteOffset, s2.typ.byteLength));
      wf2(`${OUT}/stages/${String(k).padStart(2, '0')}_${s2.tag}.act`, Buffer.from(s2.act.buffer, s2.act.byteOffset, s2.act.byteLength));
      wf2(`${OUT}/stages/${String(k).padStart(2, '0')}_${s2.tag}.wal`, Buffer.from(s2.wal.buffer, s2.wal.byteOffset, s2.wal.byteLength));
      wf2(`${OUT}/stages/${String(k).padStart(2, '0')}_${s2.tag}.liq`, Buffer.from(s2.liq.buffer, s2.liq.byteOffset, s2.liq.byteLength));
    }
  }
  if (process.env.SW_I148F_SAVE === '1') {
    const { writeFileSync: wf } = require('node:fs') as typeof import('node:fs');
    wf(`${OUT}/replay-events.log`, ev.join('\n') + '\n');
  }
  // 对拍 end-win
  const est = end.st as unknown as Record<string, Uint8Array | Uint16Array>;
  const rst = st as unknown as Record<string, Uint8Array | Uint16Array>;
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0;
  let fI = -1;
  const samples: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = est.flags[i]! & 1, ja = rst.flags[i]! & 1;
    if (va !== ja) { dA++; if (fI < 0) fI = i; if (samples.length < 8) samples.push(`A(${i % W},${(i / W) | 0})`); continue; }
    const vt = va ? sh(SHEET[est.type[i]!]) : 0;
    const jt = va ? sh(SHEET[rst.type[i]!]) : 0;
    if (vt !== jt) { dT++; if (fI < 0) fI = i; if (samples.length < 8) samples.push(`T(${i % W},${(i / W) | 0}) v${vt} j${jt}`); }
    if (est.wall[i] !== rst.wall[i]) { dW++; if (fI < 0) fI = i; }
    if (est.liquid[i] !== rst.liquid[i]) { dL++; if (fI < 0) fI = i; }
    if (est.half[i] !== rst.half[i]) { dHf++; if (fI < 0) fI = i; }
    if (est.slope[i] !== rst.slope[i]) { dSl++; if (fI < 0) fI = i; }
  }
  console.log(`fidelity: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} first=(${fI % W},${(fI / W) | 0}) ${samples.join(' | ')}`);
  if (process.env.SW_I148F_SAVE === '1') {
    const { mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
    mkdirSync(`${OUT}/replay-win`, { recursive: true });
    for (const c of CHANS) {
      const a = rst[c]!;
      writeFileSync(`${OUT}/replay-win/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    writeFileSync(`${OUT}/replay-win/base_hdr.json`, JSON.stringify({ w: st.w, h: st.h }));
  }
}, 900_000);

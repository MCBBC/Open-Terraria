// 一次性诊断（IIIII100e2 批）：placeLavaTrap PT135 分支级 K 分解 —— JS 镜像采集。
// 基座=iii121-out CAP（ftw 基线）；装 __swFntProbeI39（窗口门控收集器），
// 跑 runMicroBiomesPass，把每个成功陷阱窗口的腿级事件流写 /tmp/iii124-out/js-k13.log。
// 用法：cd game && SW_K13CAP=1 npx vitest run tools/_iii124k13.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';

const RUN_CAP = process.env.SW_K13CAP === '1';
const OUT = process.env.SW_K13_OUT ?? '/tmp/iii124-out';
const BASE = process.env.SW_K13_BASE ?? '/tmp/iii121-out';
const W = Number(process.env.SW_I118_W ?? 4200), H = Number(process.env.SW_I118_H ?? 1200);
const SEED = process.env.SW_I118_SEED ?? '1671560105';
const EVIL = Number(process.env.SW_I118_EVIL ?? 0);

interface ChestLike { x: number; y: number; items: Array<{ id: number; stack: number } | null>; [k: string]: unknown }

function serializeStore(st: TileStore, dir: string): void {
  const hdr: Record<string, number | string> = { w: st.w, h: st.h };
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
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

(RUN_CAP ? it : it.skip)('capture base at MicroBiomes slot head (ftw)', async () => {
  let liveStore: TileStore | null = null;
  const G2Any = globalThis as unknown as Record<string, unknown>;
  G2Any.__swI91Cap = (st: unknown, g: unknown, ch: unknown, name: string) => {
    if (name !== '微群系') return;
    liveStore = st as TileStore;
    serializeStore(liveStore, OUT);
    writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(g)));
    writeFileSync(`${OUT}/base_chests.json`, JSON.stringify(ch ?? []));
    console.log(`captured @微群系`);
    delete G2Any.__swI91Cap;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { getGoodWorld: true },
      onWorldPartial: () => {},
    });
  } finally { delete G2Any.__swI91Cap; }
}, 900_000);

function hydrate(): { st: TileStore; gs: GenState; chests: ChestLike[] } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const gs = desVal(JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8'))) as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')) as ChestLike[];
  return { st, gs, chests };
}

(RUN_CAP ? it : it.skip)('capture PT135 K-decomposition windows (js mirror)', () => {
  const { st, gs, chests } = hydrate();
  // 真样本计数（x86 drlog 第6列同语义；__swOnRoll=引擎 internalSample 织入位）
  let trueRolls = 0;
  const oRoll = (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
  (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = () => { trueRolls++; };

  // ── 窗口门控收集器（__swFnt39 emit 位，FinalCleanupPass/MicroBiomesPass 钩）──
  let armed = false;
  const cur: string[] = [];
  const wins: string[][] = [];
  (globalThis as unknown as { __swFntProbeI39?: { emit: (l: string) => void; rc: () => number } }).__swFntProbeI39 = {
    rc: () => trueRolls,
    emit: (l: string): void => {
      if (!armed) {
        if (l.startsWith('TWO|')) { armed = true; cur.length = 0; cur.push(l); }
        return;
      }
      cur.push(l);
      if (l.startsWith('TWEND|')) { armed = false; wins.push(cur.slice()); cur.length = 0; }
    },
  };

  // ── 尝试流（attempt-level）──
  const atts: string[] = [];
  (globalThis as unknown as { __swSeg?: (name: string, d?: unknown) => void }).__swSeg =
    (name: string, d?: unknown) => {
      if (name === 'tAtt' || name === 'lavaOk' || name === 'passStart' || name.startsWith('lavaJ')) {
        atts.push(`${name}|${d === undefined ? '' : JSON.stringify(d)}|${trueRolls}`);
      }
    };

  const rng = new RNG(gs.seed);
  const t0 = Date.now();
  runMicroBiomesPass(st, rng, gs, chests as never);
  (globalThis as unknown as { __swFntProbeI39?: unknown }).__swFntProbeI39 = undefined;
  (globalThis as unknown as { __swSeg?: unknown }).__swSeg = undefined;
  (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll = oRoll;

  console.log(`runMicroBiomes ${Date.now() - t0}ms TRUE-rolls=${trueRolls} windows=${wins.length}`);
  writeFileSync(`${OUT}/js-k13.log`, wins.map((wArr) => wArr.join('\n')).join('\n%%WIN%%\n') + '\n');
  writeFileSync(`${OUT}/js-k13-attempts.log`, atts.join('\n') + '\n');
  const at = atts.filter((l) => l.startsWith('tAtt')).length;
  const ok = atts.filter((l) => l.startsWith('lavaOk')).length;
  console.log(`attempts=${at} ok=${ok} -> ${OUT}/js-k13*.log`);
}, 900_000);

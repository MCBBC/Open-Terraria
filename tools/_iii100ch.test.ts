// IIII95：雕像+箱族合并槽（#58..#62）单槽反演重放 + 掷流分账（克隆 _iii100tm/_iii98tm 范式）。
// ① SW_C00CAP=1：全量生成，在 ▶Statues reseed 时点 capture store 全通道+gs → base_*。
// ② SW_C00REPLAY=1：hydrate → 依 statuesChestsPass 原序重放各子 pass
//    （每个独立 GenPass ⇒ 每 pass 重播种子，合并槽内部不重播），逐 pass 记账
//    internalSample 值流并 cmp 对应 x86 dump：Statues→#058 /
//    BuriedChests+Underworld+CaveHouses→#059 / SurfaceChests→#060；掷流账与
//    rigb/pc.txt P|58 R=4459 / P|59 R=66518 / P|60 R=1461 直接闭合。
// 用法：cd game && SW_C00CAP=1 npx vitest run tools/_iii100ch.test.ts
//       cd game && SW_C00REPLAY=1 npx vitest run tools/_iii100ch.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { ChestSink } from '../src/world/gen/vanilla/BuriedChestsPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { rollHouseChestCounts } from '../src/world/gen/vanilla/CaveHousePass';
import { runCaveHousesPass } from '../src/world/gen/vanilla/CaveHousePass';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import {
  runBuriedChestsPass, runUnderworldChestsPass,
} from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN_CAP = process.env.SW_C00CAP === '1';
const RUN_RE = process.env.SW_C00REPLAY === '1';
const OUT = process.env.SW_C00_OUT ?? '/tmp/iii100-out/cap-ch';
const G2 = process.env.SW_C00_G2 ?? '/tmp/iii89-out/rigb/dumps';
const SEED = process.env.SW_C00_SEED ?? '1138154190';
const EVIL = Number(process.env.SW_C00_EVIL ?? 0);
const W = 4200, H = 1200;

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

(RUN_CAP ? it : it.skip)('capture base at Statues pass head', async () => {
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
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii100ch')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Statues') {
            mkdirSync(OUT, { recursive: true });
            serializeStore(liveStore!, OUT);
            const gs = lastGenState();
            if (!gs) throw new Error('gs missing');
            writeFileSync(`${OUT}/base_gs.json`, JSON.stringify(serVal(gs)));
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
      seedFlags: { remix: true },
      onWorldPartial: (w2) => { liveStore = w2.store as never as TileStore; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!done) throw new Error('capture failed: Statues label never hit');
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
let DUMPNAME = new Map<number, string>();
{
  try {
    for (const f of readdirSync(G2)) {
      const m = f.match(/^(\d{3})_(.+)\.typ$/);
      if (m) DUMPNAME.set(Number(m[1]), m[2]);
    }
  } catch { /* cap mode */ }
}
function cmpAgainst(tag: string, idx: number, st: TileStore): void {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}`;
  if (!existsSync(`${pre}.typ`)) { console.log(`[${tag}] dump missing ${pre}`); return; }
  const xa = readFileSync(`${pre}.act`); const xt = le16(`${pre}.typ`);
  const xw = le16(`${pre}.wal`);
  const xl = readFileSync(`${pre}.liq`); const xhf = readFileSync(`${pre}.half`);
  const xsl = readFileSync(`${pre}.slope`); const xia = readFileSync(`${pre}.inact`);
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dIa = 0;
  let fI = -1;
  const pair = new Map<string, number>();
  const N = W * H;
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
    const via = xia[i]! ? 1 : 0;
    if (via !== ((st.wire[i]! >>> 5) & 1)) { dIa++; fI = fI < 0 ? i : fI; }
  }
  const bad = dA || dT || dW || dL || dHf || dSl || dIa;
  console.log(`[${tag}] vs #${idx}_${DUMPNAME.get(idx)}: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Ia=${dIa} ${bad ? `✗ @(${fI % W},${(fI / W) | 0}) ` + [...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join(' ') : '✓'}`);
}

(RUN_RE ? it : it.skip)(`replay statues+chest bundle vs G2`, () => {
  const N = W * H;
  const { st, gs } = hydrate();
  // 基座自检 vs #057_Life_Crystals
  {
    const pre = `${G2}/057_${DUMPNAME.get(57)}`;
    const base = { xt: le16(`${pre}.typ`), xa: readFileSync(`${pre}.act`) };
    let dA = 0, dT = 0;
    for (let i = 0; i < N; i++) {
      const va = base.xa[i]!, ja = st.flags[i]! & 1;
      if (va !== ja) dA++;
      else if (va && base.xt[i] !== (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999)) dT++;
    }
    console.log(`[base selfcheck vs #057_${DUMPNAME.get(57)}] dAct=${dA} dTyp=${dT}${dA || dT ? ' ✗ 反演无效！' : ' ✓'}`);
  }
  let rollN = 0;
  let statueVals: number[] = [];
  const g = globalThis as unknown as { __swOnRoll?: (v: number) => void };
  const oOnRoll = g.__swOnRoll;
  const ledger: Array<{ tag: string; n: number }> = [];
  const markR = (tag: string): void => { ledger.push({ tag, n: rollN }); };
  g.__swOnRoll = (v) => { rollN++; statueVals.push(v); };
  const chests: ChestSink = [];
  const rng = new RNG(gs.seed);

  rng.reseed(gs.seed);   // ▶Statues cs:16947
  markR('head.Statues');
  const dbg = { attempt: 0, oceanLoop: 0, placeFail: 0 };
  (globalThis as unknown as { __swStatDbg?: Record<string, number> }).__swStatDbg = dbg;
  // 时间线仪：每次候选锚点（__swStatTry）打点当前样本号，try 行=『smp,x,y,anchorSheet』
  const tries: string[] = [];
  (globalThis as unknown as { __swStatTry?: (x: number, y: number, s: number) => void }).__swStatTry =
    (x, y, s) => tries.push(`${rollN},${x},${y},${s}`);
  runStatuesPass(st, rng, gs);
  writeFileSync('/tmp/iii100-out/stat-tries.txt', `${tries.join('\n')}\n`);
  delete (globalThis as unknown as { __swStatDbg?: Record<string, number> }).__swStatDbg;
  markR('tail.Statues');
  console.log(`statues-dbg: attempt=${dbg.attempt} oceanLoop=${dbg.oceanLoop} placeFail=${dbg.placeFail} samples=${rollN}`);
  if (process.env.SW_C00_STATVALS) writeFileSync(process.env.SW_C00_STATVALS, `${statueVals.join('\n')}\n`);
  if (process.env.SW_C00_POSTSTAT) {
    const out = process.env.SW_C00_POSTSTAT;
    writeFileSync(`${out}.typ`, Buffer.from(st.type.buffer, st.type.byteOffset, st.type.byteLength));
    writeFileSync(`${out}.act`, Buffer.from(st.flags.buffer, st.flags.byteOffset, st.flags.byteLength));
    writeFileSync(`${out}.wal`, Buffer.from(st.wall.buffer, st.wall.byteOffset, st.wall.byteLength));
    writeFileSync(`${out}.liq`, Buffer.from(st.liquid.buffer, st.liquid.byteOffset, st.liquid.byteLength));
  }
  cmpAgainst('after-Statues', 58, st);

  rng.reseed(gs.seed);   // ▶UndergroundHousesAndBuriedChests cs:17066
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  markR('counts');
  runBuriedChestsPass(st, rng, gs, chests);
  markR('loop1.caveChests');
  runUnderworldChestsPass(st, rng, gs, chests);
  markR('loop2.underworldChests');
  runCaveHousesPass(st, rng, gs, chests);
  markR('loop3.placeHouses+4.desertHouses');
  flipGenSolid([226, 162, 225, 190], false);
  cmpAgainst('after-BuriedChestsBundle', 59, st);

  rng.reseed(gs.seed);   // ▶SurfaceChests cs:17226
  g.__swOnRoll = oOnRoll;
  console.log(`ledger(samples)=${ledger.map(({ tag, n }) => `${tag}=${n}`).join(' ')}`);
}, 600_000);

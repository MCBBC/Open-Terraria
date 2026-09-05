// IIII184 一次性取证探针：在 ▶SurfaceChests reseed 锚（=x86 dump 059_Buried_Chests
// 对应世界态=『埋箱/小屋』束收尾）导出 JS 八通道原始快照，供离线逐格对勘。
// 用法：cd game && SW_I184=1 SW_I184_OUT=/tmp/iii184-out \
//        SW_I81_SEED='1.1.1.0.iamerror|106103' npx vitest run tools/_iii184dump.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I184 === '1';
const OUT = process.env.SW_I184_OUT ?? '/tmp/iii184-out';
const SEED = process.env.SW_I81_SEED ?? '1.1.1.0.iamerror|106103';
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200);

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; srcCache.set(file, src); } }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

(RUN ? it : it.skip)('IIII184 dump JS state at SurfaceChests anchor', async () => {
  type Store = { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; w: number; h: number };
  let store: Store | null = null;
  let dumped = false;
  let dumped60 = false;
  const saveTo = (prefix: string): void => {
    if (!store) return;
    const st = store as unknown as Record<string, Uint8Array | Uint16Array>;
    const N = W * H;
    const act = new Uint8Array(N), typ = new Uint16Array(N), wal = new Uint16Array(N);
    const liq = new Uint8Array(N), lty = new Uint8Array(N), hf = new Uint8Array(N), sl = new Uint8Array(N), ia = new Uint8Array(N);
    const flags = st.flags as Uint8Array, type = st.type as Uint16Array;
    const raw = new Uint16Array(N);
    const SHEET = new Int32Array(1024).fill(-1);
    { // sheet 映射表（与 _iii81m8 同口径：TILE_DEFS[i].vanilla.sheet）
      for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
    }
    for (let i = 0; i < N; i++) {
      const a = flags[i]! & 1;
      act[i] = a; raw[i] = a ? type[i]! : 0;
      const sh = a ? (type[i]! === 0 ? 0 : (SHEET[type[i]!]! >= 0 ? SHEET[type[i]!]! : 9999)) : 0;
      typ[i] = sh;
      wal[i] = (st.wall as Uint16Array)[i]!;
      liq[i] = (st.liquid as Uint8Array)[i]!;
      lty[i] = (st.liquidType as Uint8Array)[i]!;
      hf[i] = (st.half as Uint8Array)[i]!;
      sl[i] = (st.slope as Uint8Array)[i]!;
      ia[i] = (((st.wire as Uint8Array)[i]!) >>> 5) & 1;
    }
    const w8 = (n: string, b: ArrayBufferView): void => writeFileSync(`${OUT}/${n}`, Buffer.from(b.buffer, b.byteOffset, b.byteLength));
    w8(`${prefix}.typ`, typ); w8(`${prefix}.act`, act); w8(`${prefix}.wal`, wal); w8(`${prefix}.liq`, liq);
    w8(`${prefix}.lty`, lty); w8(`${prefix}.half`, hf); w8(`${prefix}.slope`, sl); w8(`${prefix}.inact`, ia);
    w8(`${prefix}.raw`, raw);
    console.log(`[i184] JS anchor state saved -> ${OUT}/${prefix}.*`);
  };
  const save = (): void => { if (!dumped) { dumped = true; saveTo('js059'); } };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let rollN = 0, inWin = false, winStart = -1;
  const rollLog: number[] = [];
  const houseEv: string[] = [];
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v: number) => {
    rollN++;
    (globalThis as { __swRollN?: number }).__swRollN = rollN;   // 供 CaveHousePass __rn 消费
    if (inWin && rollLog.length < 3_000_000) rollLog.push(v);
  };
  (globalThis as { __swHouseStage?: (tag: string, a: number, b: number, c: number, d: number) => void }).__swHouseStage = (tag: string, a: number, b: number, c: number, d: number) => {
    if (inWin) houseEv.push(`stage ${tag} ${a} ${b} ${c} r${d}`);
  };
  (globalThis as { __swPcEv?: (row: string) => void }).__swPcEv = (row: string) => {
    if (inWin) houseEv.push(`pc ${row}`);
  };
  (globalThis as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (inWin) houseEv.push(`chest ${p} ${i} ${j} r${x}`);
  };
  (globalThis as { __swAbGate?: (tag: string, i: number, j: number, extra?: number) => void }).__swAbGate = (tag: string, i: number, j: number, extra?: number) => {
    if (inWin && tag !== 'enter') houseEv.push(`abgate ${tag} ${i} ${j} ${extra ?? ''}`);
  };
  (globalThis as { __swHouseEv?: (p: string, x: number, y: number) => void }).__swHouseEv = (p: string, x: number, y: number) => {
    if (inWin) houseEv.push(`${p} ${x} ${y} r${rollN}`);
  };
  (globalThis as { __swHouseRooms?: (ox: number, oy: number, rooms: string) => void }).__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    if (inWin) houseEv.push(`rooms ${ox} ${oy} ${rooms} r${rollN}`);
  };
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    if (lab === 'UndergroundHousesAndBuriedChests' && !inWin) { inWin = true; winStart = rollN; console.log(`[i184] window starts at roll ${rollN}`); }
    if (store && !dumped && lab === 'SurfaceChests') {
      save();
      const g = (globalThis as { __swGsDebug?: unknown }).__swGsDebug as { worldSurface: number; worldSurfaceLow: number; rockLevel: number; worldSurfaceHigh: number } | undefined;
      console.log(`[i184] sub-window SurfaceChests at roll ${rollN} gs=${g ? JSON.stringify({ ws: g.worldSurface, wsl: g.worldSurfaceLow, rl: g.rockLevel, wsh: g.worldSurfaceHigh }) : 'n/a'}`);
    }
    if (store && lab === 'ChestsInJungleShrines') {
      if (!dumped60) { dumped60 = true; saveTo('js060'); }
      if (inWin) { inWin = false; console.log(`[i184] window ends at roll ${rollN} (count ${rollN - winStart})`); }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!store) store = w.store as never as Store; },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!dumped) throw new Error('IIII184: 未命中 ▶SurfaceChests reseed 锚——标签解析失效?');
  writeFileSync(`${OUT}/js-houseev.txt`, houseEv.join('\n') + '\n');
  writeFileSync(`${OUT}/js-rolls.txt`, rollLog.join('\n') + '\n');
  console.log(`[i184] window rolls=${rollLog.length} houseEvents=${houseEv.length} -> ${OUT}/js-rolls.txt, js-houseev.txt`);
}, 900_000);

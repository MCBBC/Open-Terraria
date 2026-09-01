// IIIII107 反演重放归因仪：hydrate base_UHBC → 完整重放 UHBC 三循环
// （flip 四翻 + 四计数 + caves + uw + houses + 尾翻），全程织入：
//   ab/abx/lend（尝试台账）+ __swAbGate（门探针）+ CD/CW（写面/拒因）
// 结束后对拍 dump059：导出「每 attempt 命运表」与箱体级 diff 组表。
// 用法：
//   cd game && SW_MB_1457=1 SW_I107ATTR=1 npx vitest run tools/_iii107attr.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import {
  runBuriedChestsPass, runUnderworldChestsPass,
} from '../src/world/gen/vanilla/BuriedChestsPass';
import { runCaveHousesPass, rollHouseChestCounts } from '../src/world/gen/vanilla/CaveHousePass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I107ATTR === '1';
const BASE = process.env.SW_A_BASE ?? '/tmp/iii130-out/replay1/base_UndergroundHousesAndBuriedChests';
const G2 = process.env.SW_A_G2 ?? '/tmp/iii89-out/rigb/dumps';
const OUT = process.env.SW_A_OUT ?? '/tmp/iii130-out/attr';

const W = 4200, H = 1200;
let SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface DumpCh { t: Uint16Array; a: Uint8Array }
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const dumpName = (idx: number): string => {
  for (const f of readdirSync(G2)) {
    const m = f.match(/^(\d{3})_(.+)\.typ$/);
    if (m && Number(m[1]) === idx) return m[2];
  }
  throw new Error(`no dump ${idx}`);
};

(RUN ? it : it.skip)('UHBC full-loop attribution replay', async () => {
  void RUN;
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  let gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as never as Parameters<typeof runBuriedChestsPass>[2];
  const chestsSrc = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')) as unknown[];
  const chests = JSON.parse(JSON.stringify(chestsSrc)) as typeof chestsSrc;

  mkdirSync(OUT, { recursive: true });
  const logA = `${OUT}/attempts.txt`;
  try { writeFileSync(logA, ''); } catch { /* */ }

  // ---- 织入所有钩 ----
  const wr = (s: string): void => { try { appendFileSync(logA, s + '\n'); } catch { /* */ } };
  const g = globalThis as unknown as Record<string, unknown>;
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => { wr(`${p}|${i}|${j}|${x ?? ''}`); };
  g.__swAbGate = (tag: string, i: number, j: number, extra?: number) => { wr(`G|${tag}|${i},${j}${extra !== undefined ? '|' + extra : ''}`); };
  g.__swChestDbg = (i: number, gy: number, why: string) => { wr(`CD|${i},${gy}|${why}`); };
  g.__swChestWrite = (i: number, topY: number, tile: number, style: number, fx: number) => { wr(`CW|${i},${topY}|t${tile}s${style}fx${fx}`); };

  // ---- 重放 ----
  const rng = new RNG(gs.seed);
  flipGenSolid([226, 162, 225, 190], true);
  rollHouseChestCounts(st, rng, gs);
  runBuriedChestsPass(st, rng, gs, chests);
  runUnderworldChestsPass(st, rng, gs, chests);
  runCaveHousesPass(st, rng, gs, chests);
  flipGenSolid([226, 162, 225, 190], false);

  // ---- 对拍 dump059 ----
  const nm = dumpName(59);
  const d59a = readFileSync(`${G2}/059_${nm}.act`);
  const d59t = le16(`${G2}/059_${nm}.typ`);
  const cells: Array<[number, number, number, number]> = [];
  let dA = 0;
  for (let i = 0; i < W * H; i++) {
    const va = d59a[i]!;
    const ja = rec.flags[i]! & 1;
    const vt = va ? d59t[i]! : 0;
    const jt = ja ? (SHEET[rec.type[i]!] >= 0 ? SHEET[rec.type[i]!]! : 9999) : 0;
    if (va !== ja || (va && vt !== jt)) {
      dA++;
      if (vt === 21 || vt === 467 || jt === 21 || jt === 467) cells.push([i % W, (i / W) | 0, vt, jt]);
    }
  }
  console.log(`replay done: face active/type diffs=${dA}; chest-family cells=${cells.length}`);
  writeFileSync(`${OUT}/chestdiff.txt`, cells.map(([x, y, vt, jt]) => `${x},${y},${vt},${jt}`).join('\n'));
}, 600_000);

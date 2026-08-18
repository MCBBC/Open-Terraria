// CCCC 批·诊断④:死箱候选分歧定位——(1129,537) 为何被 JS 拒 / (1546,552) 为何被 JS 收,
// 逐门诊断 + chestList 创建序位置。一次性探针。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { __setGenStateForProbe } from '../src/world/gen/WorldGen';
import { runMicroBiomesPass, DeadMansChestBiome } from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE, idsByVanillaSheet } from '../src/world/gen/vanilla/TileRunner';
import { canPlaceStructure, GENERAL_PLACEMENT_FORBID } from '../src/world/gen/vanilla/GenState';

const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const b8 = (idx: number, e: string) => new Uint8Array(readFileSync(gPath(idx, e)).buffer.slice(0));
const b16 = (idx: number, e: string) => new Uint16Array(readFileSync(gPath(idx, e)).buffer.slice(0));

const itIs = process.env.SW_CCCC === '4';

(itIs ? it : it.skip)('cccc deadchest gates', async () => {
  const gt = b16(100, 'typ'), ga = b8(100, 'act'), gw = b16(100, 'wal'), gl = b8(100, 'liq');
  const ghf = b8(100, 'half'), gsl = b8(100, 'slope'), glt = b8(100, 'lty'), gia = b8(100, 'inact');
  const REV = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
  }
  const gsB = JSON.parse(readFileSync(`${BDIR}/s52/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${BDIR}/s52/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const fw = new Uint32Array(readFileSync(`${BDIR}/s52/frames.bin`).buffer.slice(0));
  const fx = new Uint16Array(N), fy = new Uint16Array(N), wire = new Uint8Array(N);
  for (let q = 0; q < fw.length; q += 4) { const i = fw[q]!; fx[i] = fw[q + 1]!; fy[i] = fw[q + 2]!; wire[i] = fw[q + 3]! & 0x1f; }
  const iw = new Uint32Array(readFileSync(`${BDIR}/s52/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  const chestList = JSON.parse(readFileSync(`${BDIR}/s52/chests.json`, 'utf8')) as Array<{ x: number; y: number }>;

  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    const act = ga[i]!;
    st.flags[i] = act;
    if (act || gt[i]) {
      const sh = gt[i]!;
      let id = ids35.has(i) ? ids35.get(i)! : -1;
      if (id < 0 || SHEET[id] !== sh) id = REV.get(sh) ?? -1;
      st.type[i] = id < 0 ? 0 : id;
    }
    st.wall[i] = gw[i]!; st.liquid[i] = gl[i]!;
    st.liquidType[i] = gl[i] ? glt[i]! + 1 : 0;
    st.half[i] = ghf[i]!; st.slope[i] = gsl[i]!;
    st.wire[i] = (gia[i]! ? 0x20 : 0) | wire[i];
    st.frameX[i] = fx[i]; st.frameY[i] = fy[i];
  }
  restoreGenSolid(gensolid);
  const gs = structuredClone(gsB) as GenState;
  __setGenStateForProbe(gs);
  const rng = new RNG(SEED);

  // chestList 创建序里找两箱
  const i1129 = chestList.findIndex(c => c.x === 1129 && c.y === 537);
  const i1546 = chestList.findIndex(c => c.x === 1546 && c.y === 552);
  console.log(`chestList len=${chestList.length}; (1129,537) idx=${i1129}; (1546,552) idx=${i1546}`);
  const jsCands = [[1546, 552], [3029, 521], [61, 708], [4053, 535], [3745, 684], [2437, 926], [4055, 500], [3044, 733], [827, 767], [3775, 844], [1032, 875], [568, 966]];
  for (const [x, y] of jsCands) console.log(`   cand(${x},${y}) chestListIdx=${chestList.findIndex(c => c.x === x && c.y === y)}`);

  // 逐门诊断两个箱子
  const dmc = new DeadMansChestBiome(st, rng, gs, chestList);
  const D = dmc as unknown as {
    isAGoodSpot(x: number, y: number): boolean;
    findBoulderTrapSpots(px: number, py: number): void;
    findDartTrapSpots(px: number, py: number): void;
    findExplosiveTrapSpots(px: number, py: number): void;
    areThereEnoughTraps(): boolean;
    darts: unknown[]; boulders: unknown[]; explosives: unknown[];
  };
  for (const [x, y] of [[1129, 537], [1546, 552], [4055, 500]] as Array<[number, number]>) {
    const i = st.idx(x, y);
    console.log(`\n== chest (${x},${y}): internal=${st.type[i]} key=${TILE_DEFS[st.type[i]!]?.key} sheet=${SHEET[st.type[i]!]} active=${st.flags[i]} fx=${st.frameX[i]} fy=${st.frameY[i]}`);
    if (i1129 >= 0 || i1546 >= 0 || true) {
      // golden 侧类型
      console.log(`   golden100: typ=${gt[i]} act=${ga[i]} | golden101: typ=${b16(101, 'typ')[i]} act=${b8(101, 'act')[i]}`);
    }
    console.log(`   isAGoodSpot=${D.isAGoodSpot(x, y)}`);
    D.findBoulderTrapSpots(x, y + 1);
    D.findDartTrapSpots(x, y + 1);
    D.findExplosiveTrapSpots(x, y + 1);
    console.log(`   boulders=${D.boulders.length} darts=${D.darts.length} explosives=${D.explosives.length} enough=${D.areThereEnoughTraps()}`);
    if (D.areThereEnoughTraps()) {
      const forbid = new Set(GENERAL_PLACEMENT_FORBID);
      for (const t of idsByVanillaSheet(21, 467, 138, 664, 712, 713, 714, 715)) forbid.delete(t);
      const cp = canPlaceStructure(gs, { x0: x, y0: y, x1: x + 1, y1: y + 1 }, 10, st, forbid);
      console.log(`   canPlaceStructure(pad10,扩展白名单)=${cp}`);
    }
    D.darts.length = 0; D.boulders.length = 0; D.explosives.length = 0;
  }
  __setGenStateForProbe(null);
}, 300_000);

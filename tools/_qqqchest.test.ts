// QQQQQQQQ 一次性诊断（2026-08-27）：m 链 Jungle Chests Placement（CS#
//  候选）隔离重放——x86-m dump060 八通道重建 TileStore 后直接调
//  placeBuriedChest 观察 (__swChestDbg 拒因)。SW_QCHEST=1 npx vitest run
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { placeBuriedChest } from '../src/world/gen/vanilla/BuriedChestsPass';

const RUN = process.env.SW_QCHEST === '1';
const G2 = process.env.SW_QG2 ?? '/tmp/rrrr-out/x86-m';
const W = 6400, H = 1800;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const p3 = (n: number) => String(n).padStart(3, '0');
function chan8(st: import('../src/world/TileStore').TileStore, idx: number, name: string) {
  st.type = new Uint16Array(readFileSync(`${G2}/${p3(idx)}_${name}.typ`).buffer.slice(0)).map(t => REV.get(t) ?? 0);
  st.flags = readFileSync(`${G2}/${p3(idx)}_${name}.act`);
  st.wall = new Uint16Array(readFileSync(`${G2}/${p3(idx)}_${name}.wal`).buffer.slice(0));
  st.liquid = readFileSync(`${G2}/${p3(idx)}_${name}.liq`);
  st.half = readFileSync(`${G2}/${p3(idx)}_${name}.half`);
  st.slope = readFileSync(`${G2}/${p3(idx)}_${name}.slope`);
}
(RUN ? it : it.skip)('jungle-chest JC#3 replay', () => {
  const seedFlags = {} as Record<string, boolean>;
  const base = runResetAndTerrain({ width: W, height: H, seedText: '20260811', evil: 0 as -1 | 0 | 1, seedFlags });
  const gs = base.gs;
  const st = base.world.store;
  chan8(st, 60, 'Surface_Chests');
  (globalThis as unknown as Record<string, unknown>).__swChestDbg = (i: number, gy: number, why: string) =>
    console.log(`[abx0] anchor=(${i},${gy}) reject=${why}`);
  // 模拟 vanilla 两连试（dx 已由 rig 实测：first=+1 失败、fallback 原位成功）
  base.rng.reseed(base.seed);
  console.log('--- attempt1 i=4737 ---');
  const r1 = placeBuriedChest(st, base.rng, gs, [], 4737, 741, { style: 10, loot: 0 });
  console.log('attempt1 ret=', r1);
  console.log('--- attempt2 i=4736 (after manual 3x3 clear + slope fix, mirroring vanilla fallback order) ---');
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      if (st.inBounds(4736 + dx, 741 + dy)) st.flags[st.idx(4736 + dx, 741 + dy)] = 0;
    }
  }
  const r2 = placeBuriedChest(st, base.rng, gs, [], 4736, 741, { style: 10, loot: 0 });
  console.log('attempt2 ret=', r2);
  // 状态打印
  for (let y = 739; y <= 746; y++) {
    let line = `y=${y} `;
    for (let x = 4732; x <= 4742; x++) {
      const i = st.idx(x, y);
      line += `${st.flags[i] ? String(SHEET[st.type[i]]).padStart(3) : ' ..'}`;
    }
    console.log(line + '   [x4732..4742]');
  }
}, 300000);

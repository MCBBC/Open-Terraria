// ZZZ 探针 3：s111 ⑭ 流位反推 + 二次扫观察
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import type { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

it('s111 vanilla-state ⑭ offset brute force', async () => {
  // A) 原版 .wld 终态上 brute-force ⑭ 起点 K（复刻 XXX 方法）
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s111.wld')));
  const w = wld.tilesWide, h = wld.tilesHigh;
  const st: TileStore = { w, h, idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    type: new Uint16Array(w * h), flags: new Uint8Array(w * h) } as never;
  for (let i = 0; i < w * h; i++) {
    st.flags[i] = wld.tiles.active[i]!;
    // vanilla type 0=dirt/sheet0 → JS dirt id：用 SHEET 反查不到（dirt sheet=0 与 air 同）。
    // ⑭ 谓词 active && type∈{0,668}——直接在 vanilla 空间判定，不走内部 id。
  }
  const isDirt = (x: number, y: number): boolean => {
    const i = y * w + x;
    return wld.tiles.active[i]! === 1 && (wld.tiles.type[i] === 0 || wld.tiles.type[i] === 668);
  };
  const want = ['(2933,302)', '(2194,416)', '(1643,925)'];
  const hits: number[] = [];
  for (let K = 0; K < 40000; K += 1) {
    const rng = new RNG(111);
    for (let s = 0; s < K; s++) rng.int(0, 2);  // 快进 K 个样本（int 同 Next 消耗 1 样本）
    let placed = 0; const cells: string[] = []; let budget = 3000;
    while (placed < 3 && budget > 0) {
      budget--;
      const x = rng.int(50, w - 51), y = rng.int(50, h - 201);
      if (isDirt(x, y)) { placed++; cells.push(`(${x},${y})`); }
    }
    if (cells.length === 3 && cells.every((c, q) => c === want[q])) hits.push(K);
    if (hits.length >= 4) break;
  }
  console.log('vanilla ⑭ first-accept offsets K =', hits.join(','));
}, 480_000);

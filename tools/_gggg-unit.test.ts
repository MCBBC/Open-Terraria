// GGGG 级联单元取证：手工搭一棵树（干 6 格 + 基座帧），killTileTree 基座后
// 断言整树坍塌。定位级联为何未在管线中生效。
import { it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { killTileTree } from '../src/world/gen/vanilla/SurfaceDecorPasses';

const RUN = process.env.SW_GGGG === '1';
const TREE = TILE_BY_KEY['tree']!;
const GRASS = TILE_BY_KEY['grass']!;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('killTileTree 干基 → CheckTree 级联整树坍塌', () => {
  const st = new TileStore(30, 40);
  // 地面 y=30 草；树干 x=15, y=24..29（顶 24 带冠标帧 22,198；底 29 基座帧 88,132）
  for (let x = 13; x <= 17; x++) st.setTileSilent(x, 30, GRASS, 0, 0);
  for (let y = 25; y <= 28; y++) st.setTileSilent(15, y, TREE, 0, 0);
  st.setTileSilent(15, 24, TREE, 22, 198);   // 冠标
  st.setTileSilent(15, 29, TREE, 88, 132);   // 基座
  st.setTileSilent(14, 29, TREE, 44, 132);   // 左根
  st.setTileSilent(16, 29, TREE, 22, 132);   // 右根
  const dump = () => {
    const rows: string[] = [];
    for (let y = 23; y <= 30; y++) {
      const i = st.idx(15, y);
      rows.push(`y${y}:${st.flags[i] ? 's' + SHEET[st.type[i]] + '@' + st.frameX[i] + ',' + st.frameY[i] : 'dead'}`);
    }
    const l = st.idx(14, 29), r = st.idx(16, 29);
    rows.push(`Lroot:${st.flags[l] ? SHEET[st.type[l]] : 'dead'}`, `Rroot:${st.flags[r] ? SHEET[st.type[r]] : 'dead'}`);
    return rows.join(' | ');
  };
  console.log('before:', dump());
  killTileTree(st, 15, 29);
  console.log('after :', dump());
  let alive = 0;
  for (let y = 20; y <= 32; y++) {
    for (let x = 12; x <= 18; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && SHEET[st.type[i]] === 5) alive++;
    }
  }
  console.log('存活干格:', alive);
  expect(alive).toBe(0);
}, 30_000);

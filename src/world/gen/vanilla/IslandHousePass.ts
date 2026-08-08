// 原版 "Floating Island Houses" pass(L8463 + IslandHouse L48185)移植。
// 日光板 202 外壳 + Disc Wall 82 室内 + Skyware 门(tile10 style9)+ 天空宝箱(chest,style13 近似帧0)
// + 桌椅横幅。对 gs.floatingIslands 每个非湖岛建房。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const SUNPLATE = TILE_BY_KEY['v_202_sunplate_block']!;
const DOOR = TILE_BY_KEY['door_closed']!;
const CHEST = TILE_BY_KEY['chest']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const BANNER = TILE_BY_KEY['v_91_banners']!;

export function runIslandHousePass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  let houseCount = 0;
  for (const isl of gs.floatingIslands) {
    if (isl.isLake) continue;
    islandHouse(st, rng, isl.x, isl.y, chests, houseCount);
    houseCount++;
  }
}

function islandHouse(
  st: TileStore, rng: RNG, i: number, j: number,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
  houseIdx: number,
): void {
  const dir = rng.next() < 0.5 ? -1 : 1;
  const halfW = rng.int(7, 11);
  const hgt = rng.int(5, 6);
  // 找地板:在门口侧 x 扫描岛面
  let floorY = -1;
  const probeX = i + (halfW + 2) * dir;
  for (let y = Math.max(2, j - 15); y < Math.min(st.h, j + 30); y++) {
    if (st.flags[st.idx(probeX, y)]) { floorY = y; break; }
  }
  if (floorY < 0) floorY = j + 4;
  // 外壳(实心日光板)
  for (let x = i - halfW - 1; x <= i + halfW + 1; x++) {
    for (let y = floorY - hgt - 1; y <= floorY + 2; y++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      const bottomRow = y === floorY + 2;
      const edgeOnly = bottomRow && Math.abs(x - i) < halfW - 1;
      if (edgeOnly) continue;
      st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.liquid[idx] = 0;
    }
  }
  // 内部挖空 + Disc Wall 82
  for (let x = i - halfW; x <= i + halfW; x++) {
    for (let y = floorY - hgt; y <= floorY + 1; y++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      st.type[idx] = 0; st.flags[idx] = 0; st.liquid[idx] = 0;
      st.wall[idx] = 82;
    }
  }
  // 门(Skyware:tile10 style9 → frameX 9*54;清 5×3 门洞)
  const doorX = i + (halfW + 1) * dir;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (!st.inBounds(doorX + dx, floorY + dy)) continue;
      const idx = st.idx(doorX + dx, floorY + dy);
      st.type[idx] = 0; st.flags[idx] = 0;
    }
  }
  if (st.inBounds(doorX, floorY)) st.setTileSilent(doorX, floorY, DOOR, 9 * 54, 0);
  // 对侧补柱
  const pillarX = i + (halfW + 2) * -dir - dir;
  for (let y = floorY - hgt - 1; y <= floorY + 2; y++) {
    if (!st.inBounds(pillarX, y)) continue;
    const idx = st.idx(pillarX, y);
    st.type[idx] = SUNPLATE; st.flags[idx] = 1;
  }
  // 窗(Glass Wall 21)
  for (const s of [-1, 1]) {
    const wx = i + (Math.floor(halfW / 2) + 1) * s * -1 + s;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!st.inBounds(wx + dx, floorY - Math.floor(hgt / 2) + dy)) continue;
        st.wall[st.idx(wx + dx, floorY - Math.floor(hgt / 2) + dy)] = 21;
      }
    }
  }
  // 宝箱(第0-2间固定战利品序:气球/星怒/马蹄铁——物品id 由 Game 侧 loot 表处理,这里空箱)
  const bx = i, by = floorY - 1;
  st.setTileSilent(bx, by, CHEST, 0, 0);
  st.setTileSilent(bx + 1, by, CHEST, 18, 0);
  st.setTileSilent(bx, by + 1, CHEST, 0, 18);
  st.setTileSilent(bx + 1, by + 1, CHEST, 18, 18);
  chests.push({ x: bx, y: by, items: Array(10).fill(null) });
  void houseIdx;
  // 桌+两椅
  const tableX = i - (Math.floor(halfW / 2) + 1) * dir;
  if (st.inBounds(tableX, floorY)) {
    st.setTileSilent(tableX, floorY, TABLE, 7 * 36, 0);
    for (const s of [-2, 2]) {
      if (st.inBounds(tableX + s, floorY)) st.setTileSilent(tableX + s, floorY, CHAIR, s < 0 ? 18 : 0, 0);
    }
  }
  // 横幅(天花板两角+一侧)
  for (const bx2 of [i - halfW + 1, i + halfW - 1, i - (halfW - 2) * dir]) {
    if (st.inBounds(bx2, floorY - hgt + 1)) st.setTileSilent(bx2, floorY - hgt + 1, BANNER, rng.int(7, 9) * 36, 0);
  }
}

void T;

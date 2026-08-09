// 原版 "Floating Island Houses" pass(L8463 + IslandHouse L48185)移植。
// 日光板 202 外壳 + Disc Wall 82 室内 + Skyware 门(tile10 style9)+ 天空宝箱(chest,style13 近似帧0)
// + 桌椅横幅。对 gs.floatingIslands 每个非湖岛建房。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';

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
  // 找地板(cs L48195-48203):门口侧探测列首个实心行的上一格;找不到保持 j
  let floorY = j;
  const probeX = i + (halfW + 2) * dir;
  for (let y = j - 15; y < j + 30; y++) {
    if (st.inBounds(probeX, y) && st.flags[st.idx(probeX, y)]) { floorY = y - 1; break; }
  }
  // 外壳(cs L48217-48231):整块实心日光板+清墙,仅顶行两角跳过
  for (let x = i - halfW - 1; x <= i + halfW + 1; x++) {
    for (let y = floorY - hgt - 2; y <= floorY + 3; y++) {
      if (y === floorY - hgt - 2 && (x === i - halfW - 1 || x === i + halfW + 1)) continue;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.liquid[idx] = 0; st.liquidType[idx] = 0;
      st.wall[idx] = 0;
    }
  }
  // 内部挖空 + Disc Wall 82(cs L48244-48254):仅原墙为 0 处,跳过顶行两角
  const j1 = floorY - hgt, j2 = floorY + 1;
  for (let x = i - halfW; x <= i + halfW; x++) {
    for (let y = j1; y <= j2; y++) {
      if (y === j1 && (x === i - halfW || x === i + halfW)) continue;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (st.wall[idx] === 0) {
        st.type[idx] = 0; st.flags[idx] = 0;
        st.wall[idx] = 82;
      }
    }
  }
  // 门(Skyware style9;5×3 门洞,cs L48255-48263)
  const doorX = i + (halfW + 1) * dir;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (!st.inBounds(doorX + dx, floorY + dy)) continue;
      const idx = st.idx(doorX + dx, floorY + dy);
      st.type[idx] = 0; st.flags[idx] = 0;
    }
  }
  if (st.inBounds(doorX, floorY)) st.setTileSilent(doorX, floorY, DOOR, 9 * 54, 0);
  // 对侧补柱(cs L48264-48273)
  const pillarX = i + (halfW + 1) * -dir - dir;
  for (let y = j1; y <= j2 + 1; y++) {
    if (!st.inBounds(pillarX, y)) continue;
    const idx = st.idx(pillarX, y);
    st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.wall[idx] = 0;
  }
  // 天空宝箱(cs L48274-48293):战利品序 0=气球/1=星怒/2=马蹄铁,第 3 间起随机
  let loot = houseIdx;
  if (loot > 2) loot = rng.int(0, 2);
  const lootKeys = ['vi_159_shiny_red_balloon', 'vi_65_starfury', 'vi_158_lucky_horseshoe'];
  const lootId = ITEM_BY_KEY[lootKeys[loot]] ?? ITEM_BY_KEY[lootKeys[0]];
  const bx = i, by = floorY - 1;
  st.setTileSilent(bx, by, CHEST, 0, 0);
  st.setTileSilent(bx + 1, by, CHEST, 18, 0);
  st.setTileSilent(bx, by + 1, CHEST, 0, 18);
  st.setTileSilent(bx + 1, by + 1, CHEST, 18, 18);
  chests.push({ x: bx, y: by, items: [{ id: lootId, stack: 1 }, ...Array(9).fill(null)] });
  // 窗(Glass Wall 21,cs L48312-48327):halfW>10 → ±2 宽,否则 ±1;
  // 中心 x = i∓halfW/2±1,y = (j1+j2)/2 - 1 ± 1
  const winHalf = halfW > 10 ? 2 : 1;
  const winY = Math.floor((j1 + j2) / 2) - 1;
  for (const wx of [i - Math.floor(halfW / 2) + 1, i + Math.floor(halfW / 2) - 1]) {
    for (let dx = -winHalf; dx <= winHalf; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!st.inBounds(wx + dx, winY + dy)) continue;
        st.wall[st.idx(wx + dx, winY + dy)] = 21;
      }
    }
  }
  // 桌+两椅(cs L48328-48333):桌 style7,桌对侧再往内一格
  const tableX = i + (Math.floor(halfW / 2) + 1) * -dir;
  if (st.inBounds(tableX, j2)) {
    st.setTileSilent(tableX, j2, TABLE, 7 * 36, 0);
    if (st.inBounds(tableX - 2, j2)) st.setTileSilent(tableX - 2, j2, CHAIR, 18, 0);
    if (st.inBounds(tableX + 2, j2)) st.setTileSilent(tableX + 2, j2, CHAIR, 0, 0);
  }
  // 横幅(cs L48334-48348):天花板两角 + dir 异侧墙
  for (const bx2 of [i - halfW + 1, i + halfW - 1]) {
    if (st.inBounds(bx2, j1)) st.setTileSilent(bx2, j1, BANNER, rng.int(7, 9) * 36, 0);
  }
  const bannerX = dir > 0 ? i - halfW : i + halfW;
  if (st.inBounds(bannerX, j1 + 1)) st.setTileSilent(bannerX, j1 + 1, BANNER, rng.int(7, 9) * 36, 0);
}

void T;

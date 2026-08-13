// 原版 "Floating Island Houses" pass(L8463 + IslandHouse L48185)移植。
// 日光板 202 外壳 + Disc Wall 82 室内 + Skyware 门(tile10 style9)+ 天空宝箱(chest,style13 近似帧0)
// + 桌椅横幅。对 gs.floatingIslands 每个非湖岛建房。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { rollChestLoot } from './BuriedChestsPass';
import { placeDoorClosed } from '../../Door';
import { placeFurn, flipFurn } from './DungeonPass';

const SUNPLATE = TILE_BY_KEY['v_202_sunplate_block']!;
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
    islandHouse(st, rng, gs, isl.x, isl.y, chests, houseCount);
    houseCount++;
  }
}

function islandHouse(
  st: TileStore, rng: RNG, gs: GenState, i: number, j: number,
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
  // 原版 L48263 PlaceTile(i1, y) → 门顶在 y-2（占 y-2..y，门洞已清 y-2..y）
  if (st.inBounds(doorX, floorY - 2)) placeDoorClosed(st, doorX, floorY - 2, 9);
  // 对侧补柱(cs L48264-48273)
  const pillarX = i + (halfW + 1) * -dir - dir;
  for (let y = j1; y <= j2 + 1; y++) {
    if (!st.inBounds(pillarX, y)) continue;
    const idx = st.idx(pillarX, y);
    st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.wall[idx] = 0;
  }
  // 天空宝箱主件（cs:79983-79996）：序 0-3 = 159 气球/65 星怒/158 马蹄铁/2219 星磁铁；
  // 第 4 间起 Next(4) 全四随机——★旧实现只有三件且 >2 时 Next(3)，2219 永不出现
  let loot = houseIdx;
  if (loot > 3) loot = rng.int(0, 3);
  const lootKeys = ['vi_159_shiny_red_balloon', 'vi_65_starfury', 'vi_158_lucky_horseshoe', 'vi_2219_celestial_magnet'];
  const lootId = ITEM_BY_KEY[lootKeys[loot]] ?? ITEM_BY_KEY[lootKeys[0]];
  const bx = i, by = floorY - 1;
  // PlaceChestDirect 语义:frameX = 36*style + dx*18,顶行 frameY=0
  st.setTileSilent(bx, by, CHEST, 13 * 36, 0);
  st.setTileSilent(bx + 1, by, CHEST, 13 * 36 + 18, 0);
  st.setTileSilent(bx, by + 1, CHEST, 13 * 36, 18);
  st.setTileSilent(bx + 1, by + 1, CHEST, 13 * 36 + 18, 18);
  // 战利品走 rollChestLoot（原版经 AddBuriedChest：岛高 < rockLevel → 金箱分支杂物表 +
  // flag12 尾段【主件 159/65/158/2219 触发：4978 幼翼 1/40、天空磨坊 1/3、装饰画、
  // 751 云】——旧实现只有裸主件，审计三.10 修复）
  const lootVid = [159, 65, 158, 2219][loot];
  const items = rollChestLoot({
    rng, gs, gy: by, worldH: st.h, mainKey: lootKeys[loot],
    flags: { skyTheme: true },
  }, lootVid);
  if (!items.some((it) => it && it.id === lootId)) items.unshift({ id: lootId, stack: 1 });
  chests.push({ x: bx, y: by, items });
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
  // 桌+两椅(cs L48328-48333):桌 style7(步长 54),椅 style10(左椅翻转 +18)——
  // 此前是单格残件 + 错误步长(桌 36/旗 36),现为完整多格放置
  const tableX = i + (Math.floor(halfW / 2) + 1) * -dir;
  if (placeFurn(st, tableX, j2, TABLE, 7)) {
    if (placeFurn(st, tableX - 2, j2, CHAIR, 10)) flipFurn(st, tableX - 2, j2, CHAIR);
    placeFurn(st, tableX + 2, j2, CHAIR, 10);
  }
  // 横幅(cs L48334-48348):1×3 顶锚,style 7-9(步长 18)
  for (const bx2 of [i - halfW + 1, i + halfW - 1]) {
    placeFurn(st, bx2, j1, BANNER, rng.int(7, 9), 'top', 1, false, undefined, 54); // 旗帜列步54
  }
  const bannerX = dir > 0 ? i - halfW : i + halfW;
  placeFurn(st, bannerX, j1 + 1, BANNER, rng.int(7, 9), 'top', 1, false, undefined, 54);
}

void T;

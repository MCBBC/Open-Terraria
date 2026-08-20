// 原版 "Floating Island Houses" pass(L8463 + IslandHouse L48185)移植。
// 日光板 202 外壳 + Disc Wall 82 室内 + Skyware 门(tile10 style9)+ 天空宝箱(chest,style13 近似帧0)
// + 桌椅横幅。对 gs.floatingIslands 每个非湖岛建房。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY } from '../../../data/items';
import { rollChestLoot } from './BuriedChestsPass';
import { placeFurn } from './DungeonPass';

const SUNPLATE = TILE_BY_KEY['v_202_sunplate_block']!;
const CHEST = TILE_BY_KEY['chest']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const BANNER = TILE_BY_KEY['v_91_banners']!;

/** WorldGen.SolidTile(cs:42370):active && tileSolid && !tileSolidTop && !halfBrick && slope==0。
 *  与 TileCleanupPass.solidTile 同口径(tileSolidTop 近似为 platform;379 泡泡
 *  覆写在浮空岛上不会出现,省略)。供 I3 地板探测用。 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const ti = st.idx(x, y);
  if (!st.flags[ti]) return false;
  const d = TILE_DEFS[st.type[ti]];
  return !!d && d.solid && !d.platform && !st.half[ti] && st.slope[ti] === 0;
}

export function runIslandHousePass(
  st: TileStore, rng: RNG, gs: GenState,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  let houseCount = 0;
  for (const isl of gs.floatingIslands) {
    // cs:17983:skyLake 不调用 IslandHouse,天然不消耗计数
    if (isl.isLake) continue;
    // cs:79830-79841 早退的屋整栋放弃且不消耗 skyIslandHouseCount(cs:80022 的
    // 自增在早退 return 之后)——loot 序号只在真正建成时前进(I4)
    if (islandHouse(st, rng, gs, isl.x, isl.y, chests, houseCount)) houseCount++;
  }
}

function islandHouse(
  st: TileStore, rng: RNG, gs: GenState, i: number, j: number,
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
  houseIdx: number,
): boolean {
  // cs:79830-79841:±30 范围内出现地牢墙(wallDungeon 7-9/94-99,Main.cs:10507-10515)/
  // 神庙墙 87/土墙 3/石墙 83 → 整屋放弃。必须放在所有掷骰之前(原版此处零耗骰)。
  // 返回 false 让调用方不消耗 skyIslandHouseCount(I4)
  for (let k = i - 30; k <= i + 30; k++) {
    for (let l = j - 30; l <= j + 30; l++) {
      if (!st.inBounds(k, l)) continue;
      const wl = st.wall[st.idx(k, l)];
      if ((wl >= 7 && wl <= 9) || (wl >= 94 && wl <= 99) || wl === 87 || wl === 3 || wl === 83) return false;
    }
  }
  const dir = rng.next() < 0.5 ? -1 : 1;
  const halfW = rng.int(7, 11);
  const hgt = rng.int(5, 6);
  // 找地板(cs:79857-79868):探测列上找"wall>0 && active && SolidTile 且
  // type∉{192,191,384}(生命树叶/生命木/红木叶族)"的首行,取其上一格;
  // 不命中 floorY 保持传入 j(不是继续外推)。旧实现只看首个活性格,会把
  // 无墙的云壳(189)当楼层,屋底落到云壳表面而非有墙土芯(I3)。
  // 注:cs:79853-79856 的 j>worldSurface 分支对浮空岛恒走 else 扫描,不另移植
  let floorY = j;
  const probeX = i + (halfW + 2) * dir;
  for (let y = j - 15; y < j + 30; y++) {
    if (!st.inBounds(probeX, y)) continue;
    const ti = st.idx(probeX, y);
    if (st.wall[ti] > 0 && st.flags[ti] && solidTile(st, probeX, y)
      && st.type[ti] !== 192 && st.type[ti] !== 191 && st.type[ti] !== 384) {
      floorY = y - 1;
      break;
    }
  }
  // 外壳(cs:79875-79890):整块实心日光板+清墙,仅顶行两角跳过。
  // 行域 num7-1..num8 = val.Y-hgt-2 .. val.Y+2——旧实现多砌一行到 +3,
  // 屋底厚一层、室内净高少一格(I1)
  for (let x = i - halfW - 1; x <= i + halfW + 1; x++) {
    for (let y = floorY - hgt - 2; y <= floorY + 2; y++) {
      if (y === floorY - hgt - 2 && (x === i - halfW - 1 || x === i + halfW + 1)) continue;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.liquid[idx] = 0; st.liquidType[idx] = 0;
      st.wall[idx] = 0;
      // cs:79907-79908 halfBrick(false)/slope(0)——壳填先清半砖/坡位再由挖空支
      // 重置 active，室内格(挖空只 active(false) 不动 half/slope)由此继承 0。
      // 不清则浮空岛地形的旧坡/半砖位残留(9293480 #69 Hf=4/Sl=2 根因)
      st.half[idx] = 0; st.slope[idx] = 0;
    }
  }
  // 内部挖空 + Disc Wall 82(cs:79903-79914):仅原墙为 0 处,跳过顶行两角。
  // 行域 num7..num8-1 = val.Y-hgt .. val.Y(j2=num8=val.Y+1 是"地板上一格"语义,
  // 支柱/窗/桌椅继续引用它,勿改)。旧实现 y<=j2 多挖一行到 val.Y+1,地面缺一格
  // 致门底/宝箱底悬空(I2;与 I1 连锁)
  const j1 = floorY - hgt, j2 = floorY + 1;
  for (let x = i - halfW; x <= i + halfW; x++) {
    for (let y = j1; y < j2; y++) {
      if (y === j1 && (x === i - halfW || x === i + halfW)) continue;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (st.wall[idx] === 0) {
        st.type[idx] = 0; st.flags[idx] = 0;
        st.wall[idx] = 82;
      }
    }
  }
  // 门洞 5×3(cs:79940-79947 清 num12±2 × num13..num13-2)。
  // 紧随其后的 PlaceTile(num12, num13=val.Y, 10, -1, 9)(cs:79949)命中 case10
  // 分支 A:门列 num12=i±(halfW+1) 是外壳边列(不在 i±halfW 室内挖空范围),
  // 壳填后 floorY-3 仍是日光板实心、门洞只清 floorY-2..floorY → 三条件全真
  // → PlaceDoor(i, floorY-1, 10, 9) 每行独立掷 Next(3) 变体(共 3 掷)并放门。
  // 2026-08-13 审计曾判"死几何从不出门"并移除放置——误把门列当室内列;12345
  // 金标 3 岛 3 门实锤(f18/36/36 等,frameY 486=54*9 Skyware)。缺这 3 掷会使
  // 同 pass 后续掷骰流整体前移:12345 第二屋后横幅错档、第三屋(中间岛)dir
  // 翻转/halfW 错(2026-08-18 用户报"门朝向相反"根因)。
  const doorX = i + (halfW + 1) * dir;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 0; dy++) {
      if (!st.inBounds(doorX + dx, floorY + dy)) continue;
      const idx = st.idx(doorX + dx, floorY + dy);
      st.type[idx] = 0; st.flags[idx] = 0;
    }
  }
  // PlaceTile case10(cs:59882-59900)分支 A:!active(j-1)&&!active(j-2)
  // &&active(j-3)&&tileSolid(j-3);分支 B(向下)在本几何恒假(地板行实心),
  // 零掷直接 return false——不移植。PlaceDoor(cs:31938-31949)护栏:nactive+
  // tileSolid(j'-2=floorY-3) && SolidTile(j'+2=floorY+1);过护栏才逐行
  // 掷变体放门(顶行在下:floorY-2/−1/0,frameY 486/504/522)。
  const dGate = (dy: number) => st.inBounds(doorX, floorY + dy) && st.flags[st.idx(doorX, floorY + dy)] === 0;
  const solidTileAt = (dy: number): boolean => {
    if (!st.inBounds(doorX, floorY + dy)) return false;
    const ti = st.idx(doorX, floorY + dy);
    return st.flags[ti] === 1 && !!TILE_DEFS[st.type[ti]]?.solid;
  };
  if (dGate(-1) && dGate(-2) && solidTileAt(-3)) {
    const ti3 = st.idx(doorX, floorY - 3);
    const guard3 = st.flags[ti3] === 1 && st.half[ti3] === 0 && !!TILE_DEFS[st.type[ti3]]?.solid;
    if (guard3 && solidTile(st, doorX, floorY + 1)) {
      for (let dy = 0; dy < 3; dy++) {
        const variant = rng.int(0, 2); // PlaceDoor 每行独立 genRand.Next(3)
        st.setTileSilent(doorX, floorY - 2 + dy, T.DOOR_CLOSED, variant * 18, 486 + dy * 18);
      }
      // ★QQQQQ（m20260811 #69 定谳）：case10 成功支尾 SquareTileFrame(doorX,floorY)
      //   （cs:59895/59902）——3×3 TileFrame 头对非活跃格清 halfBrick/slope/块漆
      //   （cs:82077-82082）。门洞清空（cs:79940-46 只 active(false) 不动 half）格上
      //   的岛面旧半砖位靠这步复位：金标 (5206,184) 活性半砖泥土 → 门洞清空 → 级联
      //   复位 half=0（dump69 H=0）；JS 曾直写门无级联 → 半砖残留 H0>1 单格。
      //   活性格的 Check* 派发（门格 CheckDoorClosed 等）在本几何恒验证通过（金标
      //   门存活），不移植——备案。
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!st.inBounds(doorX + dx, floorY + dy)) continue;
          const fi = st.idx(doorX + dx, floorY + dy);
          if (!st.flags[fi]) { st.half[fi] = 0; st.slope[fi] = 0; st.paint[fi] = 0; }
        }
      }
    }
  }
  // 对侧补柱(cs L48264-48273)：与壳填同款五连——active/liquid=0/type/wall=0/
  // halfBrick false/slope 0(cs:79969-79974)
  const pillarX = i + (halfW + 1) * -dir - dir;
  for (let y = j1; y <= j2 + 1; y++) {
    if (!st.inBounds(pillarX, y)) continue;
    const idx = st.idx(pillarX, y);
    st.type[idx] = SUNPLATE; st.flags[idx] = 1; st.liquid[idx] = 0; st.liquidType[idx] = 0;
    st.wall[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0;
  }
  // 天空宝箱主件（cs:79983-79996）：序 0-3 = 159 气球/65 星怒/158 马蹄铁/2219 星磁铁；
  // 第 4 间起 Next(4) 全四随机——★旧实现只有三件且 >2 时 Next(3)，2219 永不出现
  let loot = houseIdx;
  if (loot > 3) loot = rng.int(0, 3);
  const lootKeys = ['vi_159_shiny_red_balloon', 'vi_65_starfury', 'vi_158_lucky_horseshoe', 'vi_2219_celestial_magnet'];
  const lootId = ITEM_BY_KEY[lootKeys[loot]] ?? ITEM_BY_KEY[lootKeys[0]];
  // 箱锚=PlaceChest(i-1, num7-1)(cs:36251)——2×2 左列 i-1、行 floorY-1..floorY
  // (12345 金标三岛箱 tile 全在 (i-1,i) 列,曾错在 i 列右偏一格)
  const bx = i - 1, by = floorY - 1;
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
  // 桌+两椅(cs:80064-80070):桌 style7(步长 54),椅 style10(左椅翻转 +18)。
  // 原版锚行 = num8-1 = val.Y = j2-1(室内地面行)——I2 修掉多挖的一行后
  // 桌椅必须随之上移一行,否则嵌进日光板壳(I1/I2 连锁)
  // ★NNN 批 ①（2026-08-18）：对齐原版放置语义——三件 PlaceTile 互不 gate
  //  （1456 :80064-80068 桌/左椅/右椅无条件连放， Chairs 不以桌成败为前提），
  //  椅走 Place1x2（cs:46680-46691）语义：只查【上格 !active】+【下方
  //  SolidTile2】——锚格(椅底格)不查净空，放置时直接覆写（旧实现走 placeFurn
  //  全格净空=比原版严，桌失败时还会连带跳过两椅）。
  const tableX = i + (Math.floor(halfW / 2) + 1) * -dir;
  placeFurn(st, tableX, j2 - 1, TABLE, 7);
  placeChairD(st, tableX - 2, j2 - 1, CHAIR);
  placeChairD(st, tableX + 2, j2 - 1, CHAIR);
  // 左椅翻转（cs:80069-80070 对 (num28-2, num8-1/-2) frameX+=18——原版无脑加，
  // 椅未放置时两格 inactive 帧不值钱；此处只对真放置的椅格加，可见行为等价）
  for (const dy of [-1, 0]) {
    const ci = st.idx(tableX - 2, j2 - 1 + dy);
    if (st.flags[ci] && st.type[ci] === CHAIR) st.frameX[ci] += 18;
  }
  // 横幅(cs L48334-48348):1×3 顶锚,style 7-9(步长 18)
  for (const bx2 of [i - halfW + 1, i + halfW - 1]) {
    placeFurn(st, bx2, j1, BANNER, rng.int(7, 9), 'top', 1, false);
  }
  const bannerX = dir > 0 ? i - halfW : i + halfW;
  placeFurn(st, bannerX, j1 + 1, BANNER, rng.int(7, 9), 'top', 1, false);
  return true; // 建成,消耗一个 skyIslandHouseCount 槽位(I4)
}

/** Place1x2（cs:46665-46691）椅子语义：SolidTile2(x,y+1) && !active(x,y-1)
 *  才放；锚格(底格)不查净空（原版直接覆写）。帧 = style10 → fy 400/418
 *  （furnitureStyleBase sheet15 竖排 40 步；朝向翻转 +18 由调用方追加）。 */
function placeChairD(st: TileStore, x: number, anchorY: number, chair: number): boolean {
  // SolidTile2（cs:70497）：active && tileSolid && slope==0 && !halfBrick
  if (!st.inBounds(x, anchorY + 1)) return false;
  const bi = st.idx(x, anchorY + 1);
  if (st.flags[bi] === 0 || !TILE_DEFS[st.type[bi]]?.solid
    || st.slope[bi] !== 0 || st.half[bi]) return false;
  // 上格须净空（Place1x2 只查这一格）
  if (!st.inBounds(x, anchorY - 1) || st.flags[st.idx(x, anchorY - 1)]) return false;
  st.setTileSilent(x, anchorY - 1, chair, 0, 400);
  st.setTileSilent(x, anchorY, chair, 0, 418);
  return true;
}

void T;

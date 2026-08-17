// 原版 "JungleShrines"(cs:16059-16213)+ "ChestsInJungleShrines"(cs:17308)1:1。
// 数量 = rand(7,12) × w/4200;落点在地牢异侧半区、(ws+rockLevel)/2..h-400,
// 中心须丛林草(tile 60),±30 步进 3 扫描排除蜂巢/蜥蜴砖/泥砖/红砖(225/229/226/119/120)
// 与蜂巢墙(86/87);jungleHut 每世界五选一 [119,120,158,175,45]→墙 [23,24,42,45,10];
// 实体壳 + 空腔(墙) + 腔内火把(样式3) + 底部入口 + 泥地基 + 金字塔顶;
// 神龛中心记录 → 常春藤宝箱(style 10,主件序 GetNextJungleChestItem)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, nextJungleItem, type ChestSink } from './BuriedChestsPass';
import { addProtectedStructure, canPlaceStructure } from './GenState';
import { flipGenSolid } from './GenSolid';

function sheetTile(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}

const HUT_TILES = [sheetTile(119), sheetTile(120), TILE_BY_KEY['v_158_rich_mahogany']!,
  TILE_BY_KEY['v_175_tin_brick']!, TILE_BY_KEY['v_45_gold_brick']!];
const HUT_WALLS = [23, 24, 42, 45, 10];
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUD = TILE_BY_KEY['mud']!;
const TORCH = TILE_BY_KEY['torch']!;
const BAD_TILES = new Set([sheetTile(225), sheetTile(229), TILE_BY_KEY['v_226_lihzahrd_brick']!,
  sheetTile(119), sheetTile(120)]);

/** JungleShrines pass:返回神龛中心列表(供后续常春藤箱 pass 消费) */
export function runJungleShrinePass(st: TileStore, rng: RNG, gs: GenState): Array<{ x: number; y: number }> {
  const { w, h } = st;
  const spots: Array<{ x: number; y: number }> = [];
  // jungleHut 每世界五选一——值来自 Reset 掷(cs:11182 Next(5) → cs:11333-11352 映射),
  // 此处复用 gs.jungleHut 不再重掷(曾重掷致流位+样式双偏)
  const hutIdx = gs.jungleHut;
  const hutTile = HUT_TILES[hutIdx];
  if (hutTile === undefined || hutTile < 0) return spots;
  const hutWall = HUT_WALLS[hutIdx];

  // ★J1(cs:16063-16066):掷骰顺序 x → y → 数量。原版
  //   num=Next(40,w-40)、num2=Next((ws+rl)/2,h-400)、num3=Next(7,12)×w/4200。
  //   此前先数量后 x,y,整 pass 掷骰流错位。
  //   num3 为裸 double,循环条件是浮点比较 i < num3——非整数倍时按 ceil 计
  //   (如 6300 宽 7×1.5=10.5 → 11 座,勿 floor)
  let x = rng.int(40, w - 41);
  let y = rng.int(Math.floor((gs.worldSurface + gs.rockLevel) / 2), h - 401);
  const num3 = rng.int(7, 11) * (w / 4200);
  let retries = 0;
  for (let i = 0; i < num3; i++) {
    let placed = false;
    let abandoned = false;
    while (!placed) {
      retries++;
      // 地牢异侧半区(cs:16071-16076)
      x = rng.int(40, Math.floor(w / 2) - 41);
      if (gs.dungeonSide <= 0) x += Math.floor(w / 2);
      y = rng.int(Math.floor((gs.worldSurface + gs.rockLevel) / 2), h - 401);
      const halfW = rng.int(2, 3);  // num5
      const halfH = rng.int(2, 3);  // num6
      if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)] || st.type[st.idx(x, y)] !== JUNGLE_GRASS) {
        // ★J2(cs:16204-16207):放弃分支挂在 type==60 判断的 **else** 上——重试超
        //   w*10 时 i++ 额外消耗名额(for 再 ++)并 break。此前放在排除扫描的
        //   bad 分支、只 break 不扣名额:挂载位置与名额语义双偏。
        if (retries > w * 10) { retries = 0; abandoned = true; break; }
        continue;
      }
      // ±30 步进 3 排除扫描(cs:16088-16102)
      let bad = false;
      for (let jx = x - 30; jx < x + 30 && !bad; jx += 3) {
        for (let jy = y - 30; jy < y + 30 && !bad; jy += 3) {
          if (!st.inBounds(jx, jy)) continue;
          if (st.flags[st.idx(jx, jy)] && BAD_TILES.has(st.type[st.idx(jx, jy)])) bad = true;
          const wl = st.wall[st.idx(jx, jy)];
          if (wl === 86 || wl === 87) bad = true;
        }
      }
      if (bad) continue;
      // ★cs:16077 保护矩形 + cs:16101 structures.CanPlace(area, 1)：
      //   area = Rectangle(num-num5-1, num2-num6-1, num5+1, num6+1)——半开区间即
      //   [x-halfW-1, x) × [y-halfH-1, y),宽高各 halfW+1/halfH+1（原版数值如此,壳体
      //   实际为 (halfW+1)*2+1 宽——area 只覆盖左上角,系原版本来的窄登记,照抄勿"修"）。
      //   pad=1：与既有保护结构（蜂巢主巢±50 pad5/蜂蜜斑 16×16 pad0/微光 200×200 pad0
      //   等）互斥,失败则继续重试。原版还有 validTiles 内容扫描（StructureMap.cs:40-53）,
      //   上面的 ±30 坏块扫描已是本地等价判定,不重复收紧。
      const area = { x0: x - halfW - 1, y0: y - halfH - 1, x1: x, y1: y };
      // cs:16101 CanPlace(area, 1)：pad1 + 默认 GeneralPlacementTiles 内容扫描
      //   （±30 坏块扫描是神龛自有的额外门,两者原版并存——勿视作等价替换）
      if (!canPlaceStructure(gs, area, 1, st)) continue;
      // 实体壳(cs:16116-16127)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        for (let ly = y - halfH - 1; ly <= y + halfH + 1; ly++) {
          if (!st.inBounds(lx, ly)) continue;
          st.setTileSilent(lx, ly, hutTile);
          st.liquid[st.idx(lx, ly)] = 0;
          st.liquidType[st.idx(lx, ly)] = 0;
        }
      }
      // 空腔 + 墙(cs:16129-16137)
      for (let lx = x - halfW; lx <= x + halfW; lx++) {
        for (let ly = y - halfH; ly <= y + halfH; ly++) {
          if (!st.inBounds(lx, ly)) continue;
          st.setTileSilent(lx, ly, 0);
          st.setWallSilent(lx, ly, hutWall);
        }
      }
      // 腔内火把(样式 3 丛林火把,cs:16152-16154)。★样式在 Y 轴(PlaceTile case4
      //   cs:59863 frameY=22*style,与 StructuresPass.placeTorch 同);y 上界
      //   cs:16153 Next(num2-num6, num2+num6-2) 不含上界
      for (let t = 0; t < 100; t++) {
        const tx = rng.int(x - halfW, x + halfW);
        const ty = rng.int(y - halfH, y + halfH - 3);
        if (!st.flags[st.idx(tx, ty)]) {
          st.setTileSilent(tx, ty, TORCH, 0, 3 * 22);
          break;
        }
      }
      // 底部入口:掏空壳底两行(cs:16152-16162)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        for (let ly = y + halfH - 2; ly <= y + halfH; ly++) {
          if (st.inBounds(lx, ly)) st.setTileSilent(lx, ly, 0);
        }
      }
      // 泥地基:壳底向下最多 4 格填泥(cs:16164-16174)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        let fill = 4;
        let ly = y + halfH + 2;
        while (ly < h && !st.flags[st.idx(lx, ly)] && fill > 0) {
          st.setTileSilent(lx, ly, MUD);
          ly++; fill--;
        }
      }
      // 金字塔顶(cs:16176-16194)
      let topHalf = halfW - rng.int(1, 2);
      let ty = y - halfH - 2;
      while (topHalf > -1) {
        for (let lx = x - topHalf - 1; lx <= x + topHalf + 1; lx++) {
          if (st.inBounds(lx, ty)) st.setTileSilent(lx, ty, hutTile);
        }
        topHalf -= rng.int(1, 2);
        ty--;
      }
      spots.push({ x, y });
      // ★cs:16200 structures.AddProtectedStructure(area)（pad 默认 0）：登记保护矩形,
      //   后续蜂巢蜂蜜斑（本 pass 已过,原版时序蜂巢在前）/地下小屋/剑冢等结构互斥。
      addProtectedStructure(gs, area, 0);
      retries = 0;
      placed = true;
    }
    if (abandoned) i++;   // ★J2:原版 i++ 使放弃额外消耗一个名额(cs:16205)
  }
  // ★pass 尾 tileSolid 翻转（cs:16212 `Main.tileSolid[137] = false`）：飞镖陷阱自此
  //   非实心,SmoothWorld 尾（cs:16692）还原 true（HalfBrickPass 接线）。本仓神龛
  //   未放置 137（原版神龛内含飞镖陷阱,缺件备案）,此翻转当前无消费面,仅存档时间线。
  flipGenSolid([137], false);
  return spots;
}

/** ChestsInJungleShrines pass(cs:17308):神龛中心放常春藤箱;失败掏 3×3 后原地重试 */
export function runJungleChestsPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, spots: Array<{ x: number; y: number }>,
): void {
  for (const s of spots) {
    const main = nextJungleItem(gs, rng);
    if (!placeBuriedChest(st, rng, gs, chests, s.x + rng.int(0, 1), s.y, { style: 10, loot: main, flags: { ivy: true } })) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (st.inBounds(s.x + dx, s.y + dy)) st.setTileSilent(s.x + dx, s.y + dy, 0);
        }
      }
      // ★J3(cs:17324-17332):第二次放置前对 3×4(含地面行 y+3)统一 slope(0)/
      //   halfBrick(false)——落地行残留半砖/坡面会顶掉第二次 AddBuriedChest。
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy <= 3; dy++) {
          if (!st.inBounds(s.x + dx, s.y + dy)) continue;
          const i = st.idx(s.x + dx, s.y + dy);
          st.slope[i] = 0; st.half[i] = 0;
        }
      }
      placeBuriedChest(st, rng, gs, chests, s.x, s.y, { style: 10, loot: main, flags: { ivy: true } });
    }
  }
}

// 原版 AddHellHouses(cs:32299-32849) + HellFort(cs:32850-33310)1:1 移植
// (旧注释 L16550/L16068 系 1405 行号,以 1456 cs: 为准)。
// 5 列(左右界数组,列宽 8-20/中央 ±4-10)× 10 行(层高 6-12)房间网格塔;
// 占用 = 2 轮侧翼(1/3 概率,双列同行标记 + 单列随机走)+ 中央列 [num1..num2] 跨度;
// 边缘格实心砖(75 黑曜石 4/5 或 76 狱石),内部墙(14/13)+清空;
// 门洞 style19 参数(列间 1/3 + 左右外门;四门位 PlaceTile→PlaceDoor 落 3 格门
// +每门 3 掷 Next(3)——2026-08-17 dump28 typ=10 实证推翻旧 H2「从不出门」结论)/
// 平台 style13(层间 + 顶层口);恶魔火把独立 pass(cs:32334-32379);
// ★2026-08-16 补齐 AddHellHouses 后三环(此前整段缺失=地狱 pass 掷流短 ~74 万):
//   家具环 m<4200000/w(cs:32386-32643) / 挂画环 num23<420000/w(cs:32645-32744) /
//   旗帜吊灯环 array[3]+num35<420000/w(cs:32746-32843)。
// ★2026-08-17 终清批(N 批):掷数 185,299=原版精确、隔离重放 act/wal/liq 全 0:
//   ① 四门位落门(PlaceDoor 3 掷/门);② 右外门 num37<20 恒 break(原版 bug,
//   正常世界右外门从不触发);③ 家具/挂画/旗灯放置 Place* 家族逐 helper 1:1
//   (替代旧 placeHF 近似:逐列底检/床浴缸 direction 镜像帧/挂画锚点几何);
//   ④ 旗灯环锚点格判活「内列任意类型拒」分支;⑤ styles 三元素先掷再判重。
//   残余=10 格 ghost(原版 KillTile 级联清 type=0 vs 本仓保留输入 ghost——
//   非内容通道,见 docs/worldgen/content-parity 文档 N 批节)。
// ★2026-08-22 KKKKKK 批 1457→1456 回滚：8/21 18:09 的 1457 批曾把 hellFort() 移成
//   1457 语义（左翼先掷/Clamp(Next(10),3,3)/门落点 AttemptToPlaceDoor 真实格检查
//   +doorExists 记账/新增塌墙阶段）——mile8 四链 #28 Underworld 首差定罪（三链同
//   签名 T0>57+Y0>2+T57>0+T75>0,JS 地狱塔位错→泥/岩浆差）。本批逐处还原 1456：
//   右翼先掷+Next(10) 扩 span+门落点无条件直写+右外门死分支保留+无塌墙阶段。
//   1457 语义全量存档 → rollback1457/HellFort.1457.ts。
// ★2026-08-23 1457 对齐档 2（代码重接线）：项目基准切 ../Terarria1457/ → hellFort()
//   按存档 rollback1457/HellFort.1457.ts 头注换回 1457 语义（源=Terarria1457/
//   WorldGen.cs HellFort cs:32974-33456）：①列界掷序=左翼先（cs:32996-33008）；
//   ②翼行 Clamp(Next(10),num4,num5)（num4=num5=3 恒 3,不扩 span,cs:33013/33036）；
//   ③中央跨度 Max/Min 钳位（cs:33090-33091）；④四处门落点=AttemptToPlaceDoor
//   while 重掷+锚格真实检查+doorExists 记账（cs:33158-33169/33433-33468）；⑤1/3 门
//   =单发 AttemptToPlaceDoor（cs:33205-33211）；⑥右外门死分支删除=可触发
//   （cs:33251-33283）；⑦新增塌墙阶段（cs:33347-33365/33383-33432）。门/塌墙
//   helper 直接 import 自存档（存档即插式,已接线）。
import type { TileStore } from '../../TileStore';   // KKKKKK:塌墙阶段回滚后无值消费,改 type-only
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
// ★1457 对齐档 2：门落点/塌墙 helper 从 1457 语义存档即插接线（存档自包含副本,
//   与本文件 placeDoorHF/placeTileDoorHF/solidTileHF 同构,勿双向耦合）
import { hellFortAttemptDoorAt, hellFortPlaceDoorLoop, hellFortCanCrumbleWall, hellFortAttemptCrumbleWall } from './rollback1457/HellFort.1457';

const OBS_BRICK = TILE_BY_KEY['v_75_obsidian_brick']!;
const HELL_BRICK = TILE_BY_KEY['v_76_hellstone_brick'] ?? OBS_BRICK;
const PLATFORM = TILE_BY_KEY['platform']!;
const TORCH = TILE_BY_KEY['torch']!;

// 家具 key（vanilla sheet）：14 桌/15 椅/18 工作台/33 蜡烛/34 吊灯/42 灯笼/
// 79 床/87 钢琴/88 梳妆台/89 长凳/90 浴缸/91 旗帜/93 落地灯/100 烛台/101 书架/104 落地钟
const T_TABLE = TILE_BY_KEY['table']!;
const T_CHAIR = TILE_BY_KEY['chair']!;
const T_BENCH_W = TILE_BY_KEY['workbench']!;
const T_CANDLE = TILE_BY_KEY['candle']!;
const T_CHANDELIER = TILE_BY_KEY['chandelier']!;
const T_LANTERN = TILE_BY_KEY['lantern']!;
const T_BED = TILE_BY_KEY['bed']!;
const T_PIANO = TILE_BY_KEY['piano']!;
const T_DRESSER = TILE_BY_KEY['dresser']!;
const T_BENCH = TILE_BY_KEY['bench']!;
const T_BATHTUB = TILE_BY_KEY['bathtub']!;
const T_BANNER = TILE_BY_KEY['v_91_banners']!;
const T_LAMP = TILE_BY_KEY['v_93_lamps']!;
const T_CANDELABRA = TILE_BY_KEY['candelabra']!;
const T_BOOKCASE = TILE_BY_KEY['bookcase']!;
const T_CLOCK = TILE_BY_KEY['grandfather_clock']!;
const PIC_240 = TILE_BY_KEY['v_240_wall_hangings_3x3']!;
const PIC_242 = TILE_BY_KEY['v_242_paintings_6x4']!;
const PIC_245 = TILE_BY_KEY['v_245_paintings_2x3']!;
const PIC_246 = TILE_BY_KEY['v_246_paintings_3x2']!;
const T_DOOR = TILE_BY_KEY['door_closed']!;
const T_STATUE = TILE_BY_KEY['v_105_statue']!;

/** PlaceDoor（cs:31938）1:1：门 gate（j-2 活性+tileSolid 且 SolidTile(j+2)）→
 *  三格门(type10) frameY=54*(style%36)+{0,18,36}、frameX 每格独立 Next(3)*18
 *  ——★每格 1 掷共 3 掷是 HF 掷流此前缺失的主根因(2026-08-17 dump28 实证
 *  (1190,1071-1073) typ=10 act=1 wal=14)。不写 wall/liquid/half/slope。
 *  ★1457 对齐档 2：hellFort() 门落点已改走存档 helper（rollback1457/HellFort.1457.ts
 *  内同构副本），本文件 placeDoorHF/placeTileDoorHF 现无 live 调用方——保留作
 *  PlaceTile/PlaceDoor 语义锚（1456≡1457 同构）。 */
function placeDoorHF(st: TileStore, rng: RNG, x: number, j: number, style: number): boolean {
  if (!st.inBounds(x, j - 2) || !st.inBounds(x, j + 2)) return false;
  const iUp = st.idx(x, j - 2);
  // ★批4 review P3-9：C# PlaceDoor 头是 `tile[i,j-2].nactive() && tileSolid`——补 inActive 位
  if (!st.flags[iUp] || ((st.wire[iUp] >>> 5) & 1)) return false;
  const d = TILE_DEFS[st.type[iUp]];
  if (!d || !d.solid) return false;
  if (!solidTileHF(st, x, j + 2)) return false;
  const num3 = 54 * Math.floor(style / 36);
  const num4 = 54 * (style % 36);
  for (let k = -1; k <= 1; k++) {
    const ti = st.idx(x, j + k);
    st.flags[ti] = 1;
    st.type[ti] = T_DOOR;
    st.frameX[ti] = num3 + rng.nextInt(3) * 18;
    st.frameY[ti] = num4 + (k + 1) * 18;
  }
  return true;
}

/** PlaceTile(x, j, 10, forced:false)（cs:59868-59906）1:1：分支 A 向上门
 *  （j-1/j-2 空 + j-3 活性实心 → PlaceDoor(x, j-1)）、分支 B 向下门
 *  （j+1/j+2 空 + j+3 活性实心 → PlaceDoor(x, j+1)），否则 return false。
 *  HF 门洞几何(打 3 格 + rowB 地板)恒走分支 A。 */
function placeTileDoorHF(st: TileStore, rng: RNG, x: number, j: number, style: number): boolean {
  const inact = (a: number, b: number): boolean => !!st.inBounds(a, b) && st.flags[st.idx(a, b)] === 0;
  const actSolid = (a: number, b: number): boolean => {
    if (!st.inBounds(a, b)) return false;
    const i = st.idx(a, b);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && !!d.solid;
  };
  if (inact(x, j - 1) && inact(x, j - 2) && actSolid(x, j - 3)) {
    placeDoorHF(st, rng, x, j - 1, style);
    return true;
  }
  if (st.inBounds(x, j + 1) && (st.flags[st.idx(x, j + 1)] !== 0 || st.flags[st.idx(x, j + 2)] !== 0
    || !actSolid(x, j + 3))) return false;
  placeDoorHF(st, rng, x, j + 1, style);
  return true;
}

/** WorldGen.SolidTile（1457 cs:70642）：nactive && solid && !solidTop && !半砖 && 无坡
 *  ★批4 review P3-9：补 inActive 位（与 noDoors 版一致;生成期无致动器,恒无差） */
function solidTileHF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] >>> 5) & 1) return false;                    // inActive（致动缩入）
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** WorldGen.SolidTile2（Place3x2 底检,cs:71027）：nactive && tileSolid（无坡/半砖门）
 *  ★批4 review P3-9：补 inActive 位 */
function solidTile2HF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] >>> 5) & 1) return false;                    // inActive
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform;
}

/** 家具放置——PlaceTile 各 helper 1:1（2026-08-17 终清,替代旧 placeHF 近似：
 *  旧版把 Place3x2 逐列底检简化为中央列、床/浴缸 direction 镜像帧未分、
 *  挂画锚点几何近似——act/typ 差 ~127 格 + 挂画环掷流 +277 的根因)。 */
const inB5 = (st: TileStore, x: number, y: number): boolean =>
  x >= 5 && x <= st.w - 5 && y >= 5 && y <= st.h - 5;

/** Place3x2（cs:52097）：桌14/钢琴87/梳妆台88/长凳89。x-1..x+1 × y-1..y 净空
 *  + 逐列 SolidTile2(y+1)；frameX=54*style+col*18,frameY=row*18。
 *  梳妆台 88 的 Chest.CreateChest(x-1,y-1)（:52169-52177）：**在 flag2 终判之前**
 *  无条件调用——失败尝试也烧一个注册表槽（孤儿条目,终态 .wld chests 段保留）；
 *  同位已有条目（FindEmptyChest -1）→ 放置失败。TTTT 2026-08-19 接线
 *  （此前"恒成功不登记"=纯登记债:sink 缺 2 条地狱梳妆台,DeadMans 候选不受影响
 *  ——type 88 过不了 IsAGoodSpot 的 21 门,零掷）。 */
function place3x2HF(st: TileStore, x: number, y: number, tile: number, style: number, chests?: import('./BuriedChestsPass').ChestSink): boolean {
  if (!inB5(st, x, y)) return false;
  let ok = true;
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y - 1; j < y + 1; j++) {
      if (st.flags[st.idx(i, j)]) ok = false;
    }
    if (!solidTile2HF(st, i, y + 1)) ok = false;
  }
  if (tile === T_DRESSER && chests) {
    // CreateChest(x-1,y-1)：同位重条目 → flag2=false（放置失败,条目不建）
    if (chests.some(c => c.x === x - 1 && c.y === y - 1)) return false;
    chests.push({ x: x - 1, y: y - 1, items: [], locked: false });
  }
  if (!ok) return false;
  const fx = 54 * style;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
    st.setTileSilent(x - 1 + i, y - 1 + j, tile, fx + i * 18, j * 18);
  return true;
}

/** Place2x1（cs:47371,工作台 18）：x..x+1 × y 净空 + SolidTile2 两列(y+1)；
 *  frameX=36*style+col*18,frameY=0。 */
function place2x1HF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  if (st.flags[st.idx(x, y)] || st.flags[st.idx(x + 1, y)]) return false;
  if (!solidTile2HF(st, x, y + 1) || !solidTile2HF(st, x + 1, y + 1)) return false;
  const fx = 36 * style;
  st.setTileSilent(x, y, tile, fx, 0);
  st.setTileSilent(x + 1, y, tile, fx + 18, 0);
  return true;
}

/** Place1x2（cs:46665,椅 15）：SolidTile2(x,y+1) 且 (x,y-1) 空；
 *  frameY=40*style+{0,18},frameX=0。 */
function place1x2HF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  if (!solidTile2HF(st, x, y + 1) || st.flags[st.idx(x, y - 1)]) return false;
  const fy = style * 40;
  st.setTileSilent(x, y - 1, tile, 0, fy);
  st.setTileSilent(x, y, tile, 0, fy + 18);
  return true;
}

/** Place1x2Top（cs:46694,灯笼 42）：(x,y-1) 活性+tileSolid+非 solidTop 且
 *  (x,y+1) 空；frameY=36*style+{0,18},frameX=0。 */
function place1x2TopHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  const up = st.idx(x, y - 1);
  const dUp = TILE_DEFS[st.type[up]];
  if (!st.flags[up] || !dUp || !dUp.solid || dUp.platform) return false;
  if (st.flags[st.idx(x, y + 1)]) return false;
  const fy = style * 36;
  st.setTileSilent(x, y, tile, 0, fy);
  st.setTileSilent(x, y + 1, tile, 0, fy + 18);
  return true;
}

/** Place1xX（cs:39203,落地灯 93）：高 3（92 为 6）,格子净空（93 另需无液体）
 *  + SolidTile2(x,y+1)；frameY=3*style*18+j*18,frameX=0。 */
function place1xXHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  const hgt = 3;
  let ok = true;
  for (let j = y - hgt + 1; j <= y; j++) {
    if (st.flags[st.idx(x, j)] || st.liquid[st.idx(x, j)] > 0) ok = false;
  }
  if (!ok || !solidTile2HF(st, x, y + 1)) return false;
  for (let j = 0; j < hgt; j++)
    st.setTileSilent(x, y - hgt + 1 + j, tile, 0, j * 18 + hgt * (style * 18));
  return true;
}

/** Place2x2（cs:51352,烛台 100）：x-1..x × y-1..y 净空 + 逐列
 *  (i,y+1) 活性且（SolidTile2 或 tileTable）；frameX=col*18,frameY=style*36+row*18。 */
function place2x2HF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  if (!inB5(st, x, y)) return false;
  for (let i = x - 1; i < x + 1; i++) {
    for (let j = y - 1; j < y + 1; j++) {
      if (st.flags[st.idx(i, j)]) return false;
    }
    const bi = st.idx(i, y + 1);
    if (!st.flags[bi] || (!solidTile2HF(st, i, y + 1) && !TABLE_FAMILY.has(st.type[bi]))) return false;
  }
  for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++)
    st.setTileSilent(x - 1 + k, y - 1 + l, tile, k * 18, style * 36 + l * 18);
  return true;
}

/** Place2xX（cs:39705,落地钟 104 高 5/雕像 105 高 3）：x..x+1 × y-h+1..y 净空
 *  + SolidTile2 两列(y+1)；雕像 55 样式绕回（style 49 无绕回）；
 *  frameX=style*36(+54 绕回列)+{0,18},frameY=j*18。 */
function place2xXHF(st: TileStore, x: number, y: number, tile: number, style: number, hgt: number): boolean {
  let fx = style * 36, fy0 = 0;
  if (tile === T_STATUE) {
    const wrap = Math.floor(style / 55);
    fx -= 1980 * wrap;
    fy0 += 54 * wrap;
  }
  let ok = true;
  for (let j = y - hgt + 1; j <= y; j++) {
    if (st.flags[st.idx(x, j)] || st.flags[st.idx(x + 1, j)]) ok = false;
  }
  if (!ok || !solidTile2HF(st, x, y + 1) || !solidTile2HF(st, x + 1, y + 1)) return false;
  for (let j = 0; j < hgt; j++) {
    st.setTileSilent(x, y - hgt + 1 + j, tile, fx, fy0 + j * 18);
    st.setTileSilent(x + 1, y - hgt + 1 + j, tile, fx + 18, fy0 + j * 18);
  }
  return true;
}

/** Place3x4（cs:51943,书架 101）：x-1..x+1 × y-3..y 净空 + 逐列 SolidTile2(y+1)；
 *  frameX=54*style+col*18,frameY=row*18。 */
function place3x4HF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  if (!inB5(st, x, y)) return false;
  let ok = true;
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y - 3; j < y + 1; j++) {
      if (st.flags[st.idx(i, j)]) ok = false;
    }
    if (!solidTile2HF(st, i, y + 1)) ok = false;
  }
  if (!ok) return false;
  const fx = style * 54;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++)
    st.setTileSilent(x - 1 + i, y - 3 + j, tile, fx + i * 18, j * 18);
  return true;
}

/** PlaceChand（cs:52753,吊灯 34）：3×3(x-1..x+1,y..y+2) 净空 + (x,y-1) 活性
 *  +tileSolid+非 solidTop；frameX=(style/36)*108+col*18,
 *  frameY=style*54(-54*(num2/108)*37 绕回)+row*18。 */
function placeChandHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  let ok = true;
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y; j < y + 3; j++) {
      if (st.flags[st.idx(i, j)]) ok = false;
    }
  }
  const up = st.idx(x, y - 1);
  const dUp = TILE_DEFS[st.type[up]];
  if (!st.flags[up] || !dUp || !dUp.solid || dUp.platform) ok = false;
  if (!ok) return false;
  const fx0 = Math.floor(style / 36) * 108;
  let fy0 = style * 54;
  if (fx0 >= 108) fy0 -= 54 * Math.floor(fx0 / 108) * 37;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    st.setTileSilent(x - 1 + i, y + j, tile, fx0 + i * 18, fy0 + j * 18);
  return true;
}

/** PlaceBanner（cs:46270,旗帜 91）：(x,y-1) 活性+tileSolid+非 solidTop 且
 *  (x,y..y+2) 净空；frameX=style*18(111 绕回),frameY={0,18,36}+绕回基。 */
function placeBannerHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  let fx = style * 18, fy0 = 0, s3 = style;
  while (s3 >= 111) { s3 -= 111; fx -= 1998; fy0 += 54; }
  const up = st.idx(x, y - 1);
  const dUp = TILE_DEFS[st.type[up]];
  if (!st.flags[up] || !dUp || !dUp.solid || dUp.platform) return false;
  if (st.flags[st.idx(x, y)] || st.flags[st.idx(x, y + 1)] || st.flags[st.idx(x, y + 2)]) return false;
  for (let j = 0; j < 3; j++) st.setTileSilent(x, y + j, tile, fx, fy0 + j * 18);
  return true;
}

/** Place4x2（cs:50534,床 79/浴缸 90）：x-1..x+2 × y-1..y 净空 + 逐列 SolidTile2；
 *  direction=1 时 frameX 基 72（镜像帧）；frameY=36*style+row*18。 */
function place4x2HF(st: TileStore, x: number, y: number, tile: number, direction: number, style: number): boolean {
  if (!inB5(st, x, y)) return false;
  for (let a = x - 1; a < x + 3; a++) {
    for (let b = y - 1; b < y + 1; b++) {
      if (st.flags[st.idx(a, b)]) return false;
    }
    if (!solidTile2HF(st, a, y + 1)) return false;
  }
  const fx0 = direction === 1 ? 72 : 0;
  const fy0 = 36 * style;
  for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++)
    st.setTileSilent(x - 1 + a, y - 1 + b, tile, fx0 + a * 18, fy0 + b * 18);
  return true;
}

/** PlaceOnTable1x1（cs:45346,蜡烛 33）：下方活性桌族(tileTable)才放；
 *  frameX=0,frameY=style*22。 */
const TABLE_FAMILY = new Set<number>([T_TABLE, TILE_BY_KEY['v_555_picnic_tables'] ?? T_TABLE, T_BENCH_W, T_PIANO, T_DRESSER, T_BENCH, T_BOOKCASE, TILE_BY_KEY['v_577_toilet'] ?? -1]);
function placeOnTableHF(st: TileStore, tile: number, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
  const i = st.idx(x, y), bi = st.idx(x, y + 1);
  if (st.flags[i]) return false;
  if (!st.flags[bi] || !TABLE_FAMILY.has(st.type[bi])) return false;
  st.setTileSilent(x, y, tile, 0, style * 22);
  return true;
}

/** Place3x3Wall（cs:44281,画 240）：x-1..x+1 × y-1..y+1 净空且 wall≠0；
 *  frameX=(style%36)*54+col*18,frameY=(style/36)*54+row*18。 */
function place3x3WallHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y - 1; j < y + 2; j++) {
      if (st.flags[st.idx(i, j)] || st.wall[st.idx(i, j)] === 0) return false;
    }
  }
  const s = ((style % 36) + 36) % 36;
  const fx0 = s * 54, fy0 = Math.floor(style / 36) * 54;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    st.setTileSilent(x - 1 + i, y - 1 + j, tile, fx0 + i * 18, fy0 + j * 18);
  return true;
}

/** Place6x4Wall（cs:44959,画 242）：x-2..x+3 × y-2..y+1 净空且 wall≠0；
 *  frameX=(style/27)*108+col*18,frameY=(style%27)*72+row*18。 */
function place6x4WallHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  for (let i = x - 2; i < x + 4; i++) {
    for (let j = y - 2; j < y + 2; j++) {
      if (st.flags[st.idx(i, j)] || st.wall[st.idx(i, j)] === 0) return false;
    }
  }
  const fx0 = Math.floor(style / 27) * 108, fy0 = (style % 27) * 72;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++)
    st.setTileSilent(x - 2 + i, y - 2 + j, tile, fx0 + i * 18, fy0 + j * 18);
  return true;
}

/** Place2x3Wall（cs:44595,画 245）：x..x+1 × y-1..y+1 净空且 wall≠0；
 *  frameX=style*36+col*18,frameY=row*18。 */
function place2x3WallHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  for (let i = x; i < x + 2; i++) {
    for (let j = y - 1; j < y + 2; j++) {
      if (st.flags[st.idx(i, j)] || st.wall[st.idx(i, j)] === 0) return false;
    }
  }
  const fx0 = style * 36;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++)
    st.setTileSilent(x + i, y - 1 + j, tile, fx0 + i * 18, j * 18);
  return true;
}

/** Place3x2Wall（cs:44752,画 246）：x-1..x+1 × y..y+1 净空且 wall≠0；
 *  frameX=col*18,frameY=style*36+row*18。 */
function place3x2WallHF(st: TileStore, x: number, y: number, tile: number, style: number): boolean {
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y; j < y + 2; j++) {
      if (st.flags[st.idx(i, j)] || st.wall[st.idx(i, j)] === 0) return false;
    }
  }
  const fy0 = style * 36;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)
    st.setTileSilent(x - 1 + i, y + j, tile, i * 18, fy0 + j * 18);
  return true;
}

/** nearPicture（cs:34704）：[x-4,x+3]×[y-3,y+2] 任一活性 */
function nearPictureHF(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 4; i <= x + 3; i++) {
    for (let j = y - 3; j <= y + 2; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)]) return true;
    }
  }
  return false;
}

/** nearPicture2（cs:34719）：墙非地牢族时 ±8×±5 扫画 240/241/242 */
function nearPicture2HF(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const wi = st.idx(x, y);
  if (st.wall[wi] === 7 || st.wall[wi] === 8 || st.wall[wi] === 9) return true;
  const pics = new Set([PIC_240, PIC_242, TILE_BY_KEY['v_241_paintings_6x5'] ?? PIC_242]);
  for (let i = x - 8; i <= x + 8; i++) {
    for (let j = y - 5; j <= y + 5; j++) {
      if (st.inBounds(i, j) && st.flags[st.idx(i, j)] && pics.has(st.type[st.idx(i, j)])) return true;
    }
  }
  return false;
}

/** RandHellPicture（cs:35210）——掷骰 1:1 */
function randHellPicture(rng: RNG): [number, number] {
  let num = rng.nextInt(4);
  if (num === 1) num = rng.nextInt(4);
  switch (num) {
    case 0: return [PIC_240, [27, 29, 30, 31, 32][rng.nextInt(5)]!];
    case 1: return [PIC_242, 14];
    case 2: return [PIC_245, [1, 2, 4][rng.nextInt(3)]!];
    default: return [PIC_246, [0, 16, 17][rng.nextInt(3)]!];
  }
}

/** 诊断钩(tools/_uwp7):逐塔五元组+四环写点跟踪;null 时零开销 */
let hfTrace: ((s: string) => void) | null = null;
export function setHfTrace(f: ((s: string) => void) | null): void { hfTrace = f; }
const tr = (s: string): void => { hfTrace?.(s); };

/** TTTT：地狱梳妆台 88 的 chest 注册表入口（WorldGen 传 world.chests；探针/单跑可空） */
let hfChests: import('./BuriedChestsPass').ChestSink | undefined;
export function runHellFortPass(st: TileStore, rng: RNG, gs: GenState,
  phaseMark?: (name: string) => void, chests?: import('./BuriedChestsPass').ChestSink): void {
  hfChests = chests;
  const { w, h } = st;
  const hellTop = h - 200;
  if (hellTop >= h - 60) return;
  // AddHellHouses(cs:32299-32318):for 逐列 i=100..w-100,正常世界只处理中间 50%
  // (num..w-num;drunk/remix 秘密种子域反转,不移植)。**只有成功建成才**跳格
  // i += Next(30,130)(再 1/10 追加 Next(0,200));找不到落点仅靠 for 自增 i+1
  // 扫下一列——旧实现改成 while 无论成败都跳格+耗骰,塔数量级直接错(H1);
  // 有效起点域到 w-num(=0.75w),旧 endX-30 截尾同批修正
  const num = Math.floor(w * 0.25);
  let towerNo = 0;
  for (let i = 100; i < w - 100; i++) {
    if (i < num || i > w - num) continue;
    // 找落点(cs:32307-32310):从 h-40 向上跳过 active/液体格,首格空气即塔底锚点。
    // 原版无下界(旧实现自制 y>hellTop 下界已删,H4)
    let j = h - 40;
    while (st.flags[st.idx(i, j)] || st.liquid[st.idx(i, j)] > 0) j--;
    if (st.flags[st.idx(i, j + 1)]) {
      // 塔体材质(cs:32311-32317):Next(75,77) 掷底再被 Next(5)>0(4/5)覆盖为 75,
      // 净 9/10 黑曜石砖——旧实现单掷 0.8 概率骰,概率与耗骰数均偏
      let tileType = rng.int(75, 76) === 75 ? OBS_BRICK : HELL_BRICK;
      if (rng.nextInt(5) > 0) tileType = OBS_BRICK;
      const wallType = tileType === OBS_BRICK ? 14 : 13;
      tr(`T#${towerNo} i=${i} j=${j} tile=${tileType === OBS_BRICK ? 75 : 76}`);
      hellFort(st, rng, i, j, tileType, wallType, towerNo);
      towerNo++;
      i += rng.int(30, 129); // cs:32331:Next(30,130)
      if (rng.nextInt(10) === 0) i += rng.int(0, 199); // cs:32332-32335
    }
  }
  phaseMark?.('torch');
  // ---- 恶魔火把(cs:32334-32379):200×(w/4200) 个,贴砖放置,±8 内无其他火把 ----
  const torchCount = Math.floor(200 * Math.floor(w / 4200));
  for (let n = 0; n < torchCount; n++) {
    let tries = 0, placed = false;
    while (!placed) {
      tries++;
      const x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);
      const y = rng.int(h - 300, h - 21);
      if (!st.inBounds(x, y)) { if (tries > 1000) break; continue; }
      const ti = st.idx(x, y);
      if (!st.flags[ti] || (st.type[ti] !== OBS_BRICK && st.type[ti] !== HELL_BRICK)) {
        if (tries > 1000) break; else continue;
      }
      let side = 0;
      if (st.inBounds(x - 1, y) && st.wall[st.idx(x - 1, y)] > 0) side = -1;
      else if (st.inBounds(x + 1, y) && st.wall[st.idx(x + 1, y)] > 0) side = 1;
      if (side === 0) { if (tries > 1000) break; else continue; }
      if (st.flags[st.idx(x + side, y)] || st.flags[st.idx(x + side, y + 1)]) {
        if (tries > 1000) break; else continue;
      }
      let near = false;
      for (let ix = x - 8; ix < x + 8 && !near; ix++) {
        for (let iy = y - 8; iy < y + 8; iy++) {
          if (st.inBounds(ix, iy) && st.flags[st.idx(ix, iy)] && st.type[st.idx(ix, iy)] === TORCH) { near = true; break; }
        }
      }
      if (near) { if (tries > 1000) break; else continue; }
      // cs:59863-59865 PlaceTile case4:只写 frameY=22*style,frameX 不动(=0);
      // style=7(恶魔火把)→ frameY=154。旧实现把 style 写进 frameX 属轴写反(H3)
      st.setTileSilent(x + side, y, TORCH, 0, 22 * 7);
      placed = true;
    }
  }
  phaseMark?.('furn');
  // ---- 家具环（cs:32386-32643）：m < 4200000/w 次，拒绝采样墙 13/14 空格 ----
  const num9 = 4200000 / w;
  for (let m = 0; m < num9; m++) {
    let tries = 0;
    let fx = rng.int(num, w - num - 1);            // Next(num, w-num)
    let fy = rng.int(h - 250, h - 21);             // Next(h-250, h-20)
    const bad = () => {
      if (!st.inBounds(fx, fy)) return true;
      const i = st.idx(fx, fy);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    };
    while (bad()) {
      fx = rng.int(num, w - num - 1);
      fy = rng.int(h - 250, h - 21);
      tries++;
      if (tries > 100000) break;
    }
    if (tries > 100000 || bad()) continue;
    for (; !solidTileHF(st, fx, fy) && fy < h - 20; fy++) { /* 落到地板 */ }
    fy--;
    let lo = fx, hi = fx;
    while (!st.flags[st.idx(lo, fy)] && solidTileHF(st, lo, fy + 1)) lo--;
    lo++;
    for (; !st.flags[st.idx(hi, fy)] && solidTileHF(st, hi, fy + 1); hi++) { }
    hi--;
    const width = hi - lo;
    const cx = (hi + lo) >> 1;
    {
      const i = st.idx(cx, fy);
      if (st.flags[i] || (st.wall[i] !== 13 && st.wall[i] !== 14) || !solidTileHF(st, cx, fy + 1)) continue;
    }
    // num16 家具 13 选 1（cs:32448-32512）：[半宽, 高]
    const pick = rng.nextInt(13);
    const size = [[5, 4], [4, 3], [3, 5], [4, 6], [3, 3], [5, 3], [5, 4], [5, 4], [5, 4], [3, 5], [5, 3], [2, 4], [3, 3]][pick]!;
    let kind = pick;
    for (let a = cx - size[0]; a <= cx + size[0]; a++) {
      for (let b = fy - size[1]; b <= fy; b++) {
        if (st.inBounds(a, b) && st.flags[st.idx(a, b)]) { kind = -1; break; }
      }
    }
    if (width < size[0] * 1.75) kind = -1;
    const chairMirror = (x: number, y: number) => {   // case0/1/4 左椅 frameX+=18（cs:32543-32547）
      const i0 = st.idx(x, y), i1 = st.idx(x, y - 1);
      if (st.flags[i0]) st.frameX[i0] += 18;
      if (st.flags[i1]) st.frameX[i1] += 18;
    };
    switch (kind) {
      case 0: {
        place3x2HF(st, cx, fy, T_TABLE, 13);
        const n22 = rng.nextInt(6);
        if (n22 < 3) placeOnTableHF(st, T_CANDLE, cx + n22, fy - 2, 25);
        if (!st.flags[st.idx(cx, fy)]) break;
        if (!st.flags[st.idx(cx - 2, fy)]) {
          if (place1x2HF(st, cx - 2, fy, T_CHAIR, 16)) chairMirror(cx - 2, fy);
        }
        if (!st.flags[st.idx(cx + 2, fy)]) place1x2HF(st, cx + 2, fy, T_CHAIR, 16);
        break;
      }
      case 1: {
        place2x1HF(st, cx, fy, T_BENCH_W, 14);
        const n21 = rng.nextInt(4);
        if (n21 < 2) placeOnTableHF(st, T_CANDLE, cx + n21, fy - 1, 25);
        if (!st.flags[st.idx(cx, fy)]) break;
        if (rng.nextInt(2) === 0) {
          if (!st.flags[st.idx(cx - 1, fy)]) {
            if (place1x2HF(st, cx - 1, fy, T_CHAIR, 16)) chairMirror(cx - 1, fy);
          }
        } else if (!st.flags[st.idx(cx + 2, fy)]) {
          place1x2HF(st, cx + 2, fy, T_CHAIR, 16);
        }
        break;
      }
      case 2: place2xXHF(st, cx, fy, T_STATUE, 49, 3); break;
      case 3: place3x4HF(st, cx, fy, T_BOOKCASE, 4); break;
      case 4:
        if (rng.nextInt(2) === 0) {
          if (place1x2HF(st, cx, fy, T_CHAIR, 16)) chairMirror(cx, fy);
        } else place1x2HF(st, cx, fy, T_CHAIR, 16);
        break;
      case 5:
        // direction=1/-1 → Place4x2 镜像帧基 72/0（cs:50563-50567）
        if (rng.nextInt(2) === 0) place4x2HF(st, cx, fy, T_BED, 1, 8);
        else place4x2HF(st, cx, fy, T_BED, -1, 8);
        break;
      case 6: place3x2HF(st, cx, fy, T_PIANO, 15); break;
      case 7: place3x2HF(st, cx, fy, T_DRESSER, 9, hfChests); break;
      case 8: place3x2HF(st, cx, fy, T_BENCH, 10); break;
      case 9: place2xXHF(st, cx, fy, T_CLOCK, 17, 5); break;
      case 10:
        if (rng.nextInt(2) === 0) place4x2HF(st, cx, fy, T_BATHTUB, 1, 25);
        else place4x2HF(st, cx, fy, T_BATHTUB, -1, 25);
        break;
      case 11: place1xXHF(st, cx, fy, T_LAMP, 23); break;
      case 12: place2x2HF(st, cx, fy, T_CANDELABRA, 25); break;
    }
  }
  phaseMark?.('pic');
  // ---- 挂画环（cs:32645-32744）：num23 < 420000/w 次 ----
  const num9b = 420000 / w;
  for (let n23 = 0; n23 < num9b; n23++) {
    let tries = 0;
    let px = rng.int(num, w - num - 1), py = rng.int(h - 250, h - 21);
    const bad = () => {
      if (!st.inBounds(px, py)) return true;
      const i = st.idx(px, py);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    };
    while (bad()) {
      px = rng.int(num, w - num - 1);
      py = rng.int(h - 250, h - 21);
      tries++;
      if (tries > 100000) break;
    }
    if (tries > 100000) continue;
    let x0 = px, x1 = px, y0 = py, y1 = py;
    for (let it = 0; it < 2; it++) {
      x0 = px; x1 = px;
      const wallOK = (x: number, y: number) => st.inBounds(x, y)
        && (st.wall[st.idx(x, y)] === 13 || st.wall[st.idx(x, y)] === 14);
      while (!st.flags[st.idx(x0, py)] && wallOK(x0, py) && x0 > 10) x0--;
      x0++;
      for (; !st.flags[st.idx(x1, py)] && wallOK(x1, py) && x1 < st.w - 10; x1++) { }
      x1--;
      px = (x0 + x1) >> 1;
      y0 = py; y1 = py;
      while (st.inBounds(px, y0) && !st.flags[st.idx(px, y0)] && wallOK(px, y0)) y0--;
      y0++;
      for (; st.inBounds(px, y1) && !st.flags[st.idx(px, y1)] && wallOK(px, y1); y1++) { }
      y1--;
      py = (y0 + y1) >> 1;
    }
    x0 = px; x1 = px;
    const row3Clear = (x: number, y: number) => st.inBounds(x, y)
      && !st.flags[st.idx(x, y)] && (!st.inBounds(x, y - 1) || !st.flags[st.idx(x, y - 1)])
      && (!st.inBounds(x, y + 1) || !st.flags[st.idx(x, y + 1)]);
    while (row3Clear(x0, py) && x0 > 10) x0--;
    x0++;
    for (; row3Clear(x1, py) && x1 < st.w - 10; x1++) { }
    x1--;
    y0 = py; y1 = py;
    const col3Clear = (x: number, y: number) => st.inBounds(x, y)
      && !st.flags[st.idx(x, y)] && (!st.inBounds(x - 1, y) || !st.flags[st.idx(x - 1, y)])
      && (!st.inBounds(x + 1, y) || !st.flags[st.idx(x + 1, y)]);
    while (col3Clear(px, y0)) y0--;   // 原版无上界（y 可负→inBounds 拦）
    y0++;
    for (; col3Clear(px, y1); y1++) { }
    y1--;
    px = (x0 + x1) >> 1;
    py = (y0 + y1) >> 1;
    if (x1 - x0 <= 7 || y1 - y0 <= 5) continue;
    let ok = 0;
    if (nearPicture2HF(st, px, py)) ok = -1;
    if (ok === 0) {
      const [tile, style] = randHellPicture(rng);
      // PlaceTile 挂画族 1:1 分派:240=Place3x3Wall/242=Place6x4Wall/
      // 245=Place2x3Wall/246=Place3x2Wall(各自锚点几何不同!)
      let placed = false;
      if (!nearPictureHF(st, px, py)) {
        if (tile === PIC_240) placed = place3x3WallHF(st, px, py, tile, style);
        else if (tile === PIC_242) placed = place6x4WallHF(st, px, py, tile, style);
        else if (tile === PIC_245) placed = place2x3WallHF(st, px, py, tile, style);
        else placed = place3x2WallHF(st, px, py, tile, style);
      }
      void 0;
      tr(`P# n${n23} retry=${tries} c=(${px},${py}) t${tile === PIC_240 ? 240 : tile === PIC_242 ? 242 : tile === PIC_245 ? 245 : 246} s${style} ${placed ? '放' : '拒'}`);
    } else {
      tr(`P# n${n23} retry=${tries} c=(${px},${py}) near2拒`);
    }
  }
  // ---- 旗帜/吊灯环（cs:32746-32843）：array[3] 互异 style + num35 < 420000/w ----
  // ★原版三元素先各自掷 Next(16,22) 再判重补掷（cs:32744-32757）——旧实现只掷
  //   styles[0] 用 0 占位判重,少掷 1-2 次+styles[1] 恒 0 的错帧。
  const styles = [rng.nextIntRange(16, 22), rng.nextIntRange(16, 22), rng.nextIntRange(16, 22)];
  while (styles[1] === styles[0]) styles[1] = rng.nextIntRange(16, 22);
  while (styles[2] === styles[0] || styles[2] === styles[1]) styles[2] = rng.nextIntRange(16, 22);
  phaseMark?.('banner');   // ★原版 IL 锚(第二个 420000)在 styles 初始化之后——边界含 3+掷
  for (let n35 = 0; n35 < num9b; n35++) {
    let tries = 0;
    let bx = num, by = h - 250;
    do {
      bx = rng.int(num, w - num - 1);
      by = rng.int(h - 250, h - 21);
      tries++;
    } while (tries <= 100000 && (() => {
      if (!st.inBounds(bx, by)) return true;
      const i = st.idx(bx, by);
      return (st.wall[i] !== 13 && st.wall[i] !== 14) || st.flags[i] !== 0;
    })());
    if (tries > 100000) continue;
    while (!solidTileHF(st, bx, by) && by > 10) by--;
    by++;
    {
      const i = st.idx(bx, by);
      if (st.wall[i] !== 13 && st.wall[i] !== 14) continue;
    }
    let pick2 = rng.nextInt(3);
    tr(`T#- banner n${n35} @(${bx},${by}) pick=${pick2}`);
    const sz = pick2 === 1 ? [3, 3] : pick2 === 2 ? [1, 2] : [1, 3];
    // ★原版此处内层读锚点格 (num37,num38) 而非 (num42,num43)（cs:32808-32834 反编译
    //   事实,等效于对锚点格反复判活）:边界列(a<bx 或 a==bx+sz[0])仅门类型
    //   {10,11,34,42,91},内列任意活性类型都拒——净效=锚点格只要 active 即
    //   pick2=-1 不放置。旧实现漏「内列任意类型」分支,致灯笼覆写真火把(2026-08-17
    //   (2574,1045) 实证)。
    {
      const i = st.idx(bx, by);
      const anchorActive = st.flags[i] !== 0;
      const anchorType = st.type[i];
      const HANG_SET = anchorType === T_DOOR || anchorType === 10 || anchorType === 11
        || anchorType === T_CHANDELIER || anchorType === T_LANTERN || anchorType === T_BANNER;
      for (let a = bx - 1; a <= bx + sz[0]; a++) {
        for (let b = by; b <= by + sz[1]; b++) {
          if (a < bx || a === bx + sz[0]) {
            if (anchorActive && HANG_SET) pick2 = -1;
          } else if (anchorActive) pick2 = -1;
        }
      }
    }
    switch (pick2) {
      case 0: placeBannerHF(st, bx, by, T_BANNER, styles[rng.nextInt(3)]!); break;
      case 1: placeChandHF(st, bx, by, T_CHANDELIER, 32); break;
      case 2: place1x2TopHF(st, bx, by, T_LANTERN, 32); break;
    }
  }
  void gs;
}

// ★KKKKKK 批（2026-08-22）1457→1456 回滚：1457 批（8/21 18:09 落盘）把 HellFort
//   移成了 1457 语义（翼掷序重分配/Clamp(Next(10),3,3) 钳 3/门落点 AttemptToPlaceDoor
//   真实格检查+doorExists 记账/新增塌墙阶段）——被 mile8 四链定罪为 #28 Underworld
//   首差（三链同签名 T0>57+Y0>2+T57>0+T75>0）。1456 真值裁决=IIIIII IL 复裁
//   （hs.exe=1.4.5.6 二进制）。1457 语义全量存档于 rollback1457/HellFort.1457.ts。
//   1456 真值要点（Terarria1456/Terraria/WorldGen.cs cs:32850-33310）：
//   ① 右翼(3-4)先掷、左翼(1-0)后掷；② 翼行/中央跨度都是 Next(10) 直接扩 [lo,hi]
//   （无 Clamp）；③ 四处门落点=命中候选行即单次无条件直写（仅 InWorld 门,无
//   SolidTile 锚检查、无 doorExists）；④ 右外门有原版死分支（列号 num37<20 恒真
//   → 首候选行即 break）=正常世界右外门从不放置且零掷；⑤ 无塌墙阶段。

function hellFort(st: TileStore, rng: RNG, i: number, j: number, tileType: number, wallType: number, tno = -1): void {
  const { w, h } = st;
  const hellTop = h - 200;
  // ---- 列左右界(1457 cs:32996-33008):中央 ±4-9,其余依次外扩 8-19 ----
  // ★1457 掷序：左翼(colR[1]/colL[1]、colR[0]/colL[0])先掷,右翼(colL[3]/colR[3]、
  //   colL[4]/colR[4])后掷（1456 是右翼先——掷数不变、几何镜像级偏移,#28 定罪项）
  const colL = new Array<number>(5), colR = new Array<number>(5);
  colL[2] = i - rng.int(4, 9);
  colR[2] = i + rng.int(4, 9);
  colR[1] = colL[2]; colL[1] = colR[1] - rng.int(8, 19);   // ★1457 左翼先（掷 3-4）
  colR[0] = colL[1]; colL[0] = colR[0] - rng.int(8, 19);
  colL[3] = colR[2]; colR[3] = colL[3] + rng.int(8, 19);   // ★1457 右翼后（掷 5-6）
  colL[4] = colR[3]; colR[4] = colL[4] + rng.int(8, 19);
  // ---- 行上下界(cs L16575-16586):层高 6-11,行 3 锚定 j ----
  const rowT = new Array<number>(10), rowB = new Array<number>(10);
  rowT[3] = j - rng.int(6, 11); rowB[3] = j;
  for (let r = 4; r < 10; r++) { rowT[r] = rowB[r - 1]; rowB[r] = rowT[r] + rng.int(6, 11); }
  for (let r = 2; r >= 0; r--) { rowB[r] = rowT[r + 1]; rowT[r] = rowB[r] - rng.int(6, 11); }
  // ---- 占用网格(1457 cs:32994-33062):2 轮各两个 1/3 翼 ----
  // ★1457：翼行 r=Clamp(Next(10), num4, num5)（num4=num5=3 起恒 3）——span 不再被
  //   翼扩（1456 是 Next(10) 直接扩 [spanLo,spanHi],#28 定罪项之二）
  const occ: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  // ★1457 门记账双账本（cs:32995-32996）：doorExists2=右侧墙段（列间门/右外门）、
  //   doorExists=左侧墙段（左外门）——塌墙阶段跳过有门的墙段
  const doorExists: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  const doorExists2: boolean[][] = Array.from({ length: 5 }, () => new Array(10).fill(false));
  let hasLWing = false, hasRWing = false;
  let spanLo = 3, spanHi = 3;
  for (let round = 0; round < 2; round++) {
    if (rng.int(0, 2) === 0) {
      hasLWing = true;
      const r0 = Math.max(spanLo, Math.min(spanHi, rng.int(0, 9)));   // ★1457 Clamp(Next(10),num4,num5)（恒 3）
      let wingCol = 1;
      if (rng.int(0, 1) === 0) { occ[0][r0] = true; occ[1][r0] = true; wingCol = 0; }
      else occ[1][r0] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9), r = r0; steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
    if (rng.int(0, 2) === 0) {
      hasRWing = true;
      const r0 = Math.max(spanLo, Math.min(spanHi, rng.int(0, 9)));   // ★1457 同上
      let wingCol = 3;
      if (rng.int(0, 1) === 0) { occ[3][r0] = true; occ[4][r0] = true; wingCol = 4; }
      else occ[3][r0] = true;
      let dir = rng.int(0, 1); if (dir === 0) dir = -1;
      for (let steps = rng.int(0, 9), r = r0; steps > 0 && r >= 0 && r < 10; r += dir) occ[wingCol][r] = true;
    }
  }
  // ---- 列合法性(cs L16641-16662):出界或地狱层已有墙 → 整列弃用 ----
  for (let c = 0; c < 5; c++) {
    let bad = false;
    if (colL[c] < 10 || colL[c] > w - 10) bad = true;
    else {
      for (let y = hellTop; y < h; y++) {
        if (st.inBounds(colL[c], y) && st.wall[st.idx(colL[c], y)] > 0) { bad = true; break; }
      }
    }
    if (bad) for (let r = 0; r < 10; r++) occ[c][r] = false;
  }
  // ---- 中央列跨度(1457 cs:33090-33104)----
  // ★1457：两掷 Next(10) 经 Max/Min 钳位——`num16=Max(num4,Next(10)); num16=Min(num5,
  //   Next(10))`,num16 覆写丢弃、span 保持 [3,3]（1456 是两掷直接扩 span,#28 定罪项之三;
  //   掷数不变）。无翼时 while 环同构扩 span（span 单调扩张,原版无守卫,数学必收敛）
  {
    const a = Math.max(spanLo, rng.int(0, 9)); void a;   // num16 = Max(num4, Next(10))
    const b = Math.min(spanHi, rng.int(0, 9)); void b;   // num16 = Min(num5, Next(10))
  }
  if (!hasLWing && !hasRWing) {
    while (spanHi - spanLo < 5) {
      const a = rng.int(0, 9); if (a < spanLo) spanLo = a;
      const b = rng.int(0, 9); if (b > spanHi) spanHi = b;
    }
  }
  for (let r = spanLo; r <= spanHi; r++) occ[2][r] = true;
  // ---- 越界单元清除(cs L16683-16690)----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && (rowT[r] < hellTop || rowB[r] > h - 20)) occ[c][r] = false;
    }
  }
  if (hfTrace) {
    tr(`T#${tno} colL=[${colL.join(',')}] colR=[${colR.join(',')}]`);
    tr(`T#${tno} rowT=[${rowT.join(',')}] rowB=[${rowB.join(',')}]`);
    for (let c = 0; c < 5; c++) tr(`T#${tno} occ[${c}]=${occ[c].map((v) => (v ? 1 : 0)).join('')}`);
  }
  // ---- 绘制(cs L16691-16718):四边实心砖,内部墙+清空 ----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      for (let x = colL[c]; x <= colR[c]; x++) {
        if (x < 10 || x > w - 10) continue;
        for (let y = rowT[r]; y <= rowB[r]; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (x === colL[c] || x === colR[c] || y === rowT[r] || y === rowB[r]) {
            st.type[ti] = tileType; st.flags[ti] = 1;
            st.half[ti] = 0; st.slope[ti] = 0;   // 原版 halfBrick(false)+slope(0)（cs:33065-33067）
          } else {
            // 原版室内只 active(false)+wall——type 保留幽灵（★勿清零,曾致 ~1.4 万 typ 差）
            st.wall[ti] = wallType;
            st.flags[ti] = 0;
          }
        }
      }
    }
  }
  // ---- 列间门 style19(1457 cs:33158-33169):每个列对 while 抽行开 3 高门洞 ----
  // ★1457：门落点经 HellFort_AttemptToPlaceDoor while 重掷（cs:33433-33448）——
  //   命中候选行后做锚格真实检查（InWorld && SolidTile(y-4,noDoors) && SolidTile(y,
  //   noDoors),cs:33449-33468）,拒则继续重掷；成功落门记入 doorExists2（右侧墙段）,
  //   供尾部塌墙阶段跳过。1456 是命中即单次无条件直写（仅 InWorld 门）
  for (let c = 0; c < 4; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let needDoor = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r] && occ[c + 1][r]) { rows[r] = true; needDoor = true; }
    }
    hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists2, rows, c, colR, rowB, wallType, 19);
  }
  // ---- 层间平台口 + 列间 1/3 门(1456 cs:33049-33094)----
  // cell 循环头门= `!array5||!InWorld(array2[c],array4[r],10) → continue`——InWorld
  // 失败时该格的平台写与门13 Next(3) 掷都被跳过（w≥4200 现世界尺寸恒不可达,
  // errorWorld 域可分叉）
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      if (!(colR[c] >= 10 && colR[c] < w - 10 && rowB[r] >= 10 && rowB[r] < h - 10)) continue;   // InWorld(...,10)
      if (r > 0 && occ[c][r - 1]) {
        // 平台口:列内 x 跨度 2-5
        let x1 = rng.int(colL[c] + 2, colR[c] - 2);
        let x2 = rng.int(colL[c] + 2, colR[c] - 2);
        let tries = 0;
        while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
          x1 = rng.int(colL[c] + 2, colR[c] - 2);
          x2 = rng.int(colL[c] + 2, colR[c] - 2);
          tries++;
        }
        if (tries <= 10000) {
          tr(`T#${tno} plat c=${c} r=${r} x=${x1}..${x2} y=${rowT[r]}`);
          for (let x = x1; x <= x2; x++) {
            if (x < 20 || x > w - 20 || !st.inBounds(x, rowT[r])) continue;
            const ti = st.idx(x, rowT[r]);
            st.flags[ti] = 0;
            st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            st.wall[ti] = wallType;
          }
        } else break;
      }
      if (c < 4 && occ[c + 1][r] && rng.int(0, 2) === 0) {
        // ★1457（cs:33205-33211）1/3 门=单发 AttemptToPlaceDoor（bool 重载,锚检查
        //   拒即弃、不重掷、不记账——与列间门 while 重掷版不同）
        hellFortAttemptDoorAt(st, rng, colR[c], rowB[r], wallType, 19);
      }
    }
  }
  // ---- 左外门(1457 cs:33214-33249):最左占用列,外侧 3 格空且无液 ----
  // ★1457：候选行预检（3 格空+无液→needDoor3=true,否则剔出候选）→ while 抽行+
  //   AttemptToPlaceDoor（wallType=0=不打墙）+doorExists（左侧墙段）记账。
  //   1456 是命中即无条件直写、无记账
  for (let c = 0; c < 5; c++) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (!any) continue;
    let needDoor = false;
    for (let r = 0; r < 10; r++) {
      if (!rows[r]) continue;
      const x = colL[c] - 1;
      if (!st.inBounds(x, rowB[r] - 3)) { rows[r] = false; continue; }
      if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
        && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
        && st.liquid[st.idx(x, rowB[r] - 3)] === 0) needDoor = true;
      else rows[r] = false;
    }
    hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists, rows, c, colL, rowB, 0, 19);
    break;
  }
  // ---- 右外门(1457 cs:33251-33283):最右占用列 ----
  // ★1457：1456 的原版死分支（预检环首候选行 `num37 < 20` 恒真→break,右外门从不
  //   放置且零掷）已删除——右外门可触发：预检（colR+1 三格空+无液）→ while 抽行+
  //   AttemptToPlaceDoor（wallType=0）+doorExists2 记账
  for (let c = 4; c >= 0; c--) {
    const rows: boolean[] = new Array(10).fill(false);
    let any = false;
    for (let r = 0; r < 10; r++) {
      if (occ[c][r]) { rows[r] = true; any = true; }
    }
    if (!any) continue;
    let needDoor = false;
    for (let r = 0; r < 10; r++) {
      if (!rows[r]) continue;
      const x = colR[c] + 1;
      if (!st.inBounds(x, rowB[r] - 3)) { rows[r] = false; continue; }
      if (!st.flags[st.idx(x, rowB[r] - 1)] && !st.flags[st.idx(x, rowB[r] - 2)] && !st.flags[st.idx(x, rowB[r] - 3)]
        && st.liquid[st.idx(x, rowB[r] - 1)] === 0 && st.liquid[st.idx(x, rowB[r] - 2)] === 0
        && st.liquid[st.idx(x, rowB[r] - 3)] === 0) needDoor = true;
      else rows[r] = false;
    }
    hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists2, rows, c, colR, rowB, 0, 19);
    break;
  }
  // ---- 顶层平台口(cs L16878-16929):最上占用行,列内 2-5 跨,上方须净空 ----
  for (let r = 0; r < 10; r++) {
    const cols: boolean[] = new Array(5).fill(false);
    let any = false;
    for (let c = 0; c < 5; c++) {
      if (occ[c][r]) { cols[c] = true; any = true; }
    }
    if (any) {
      let searching = true;
      while (searching) {
        const c = rng.int(0, 4);
        if (cols[c]) {
          let x1 = rng.int(colL[c] + 2, colR[c] - 2);
          let x2 = rng.int(colL[c] + 2, colR[c] - 2);
          let tries = 0;
          while ((x2 - x1 < 2 || x2 - x1 > 5) && tries <= 10000) {
            x1 = rng.int(colL[c] + 2, colR[c] - 2);
            x2 = rng.int(colL[c] + 2, colR[c] - 2);
            tries++;
          }
          if (tries > 10000) break;
          let clear = true;
          for (let x = x1; x <= x2; x++) {
            if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r] - 1)) continue;
            const ti = st.idx(x, rowT[r] - 1);
            if (st.flags[ti] || st.liquid[ti] > 0) { clear = false; break; }
          }
          if (clear) {
            tr(`T#${tno} topPlat c=${c} r=${r} x=${x1}..${x2} y=${rowT[r]}`);
            for (let x = x1; x <= x2; x++) {
              if (x < 10 || x > w - 10 || !st.inBounds(x, rowT[r])) continue;
              const ti = st.idx(x, rowT[r]);
              st.flags[ti] = 0;
              st.setTileSilent(x, rowT[r], PLATFORM, 0, 13 * 18);
            }
          }
          searching = false;
        }
      }
      break;
    }
  }
  // ---- 塌墙阶段(★1457 新增 cs:33347-33365)：每个占用单元的左/右墙段——无门
  //      （doorExists/doorExists2 未记账）且外侧一列全空（CanCrumbleWall 先掷
  //      Next(2),cs:33383）→ AttemptToCrumbleWall（cs:33409）段内 NextFloat/Next(2)
  //      取塌陷终点把实心格 ClearTile——地狱塔向外界「塌」出开口。1456 无此阶段。
  //      helper 见 rollback1457/HellFort.1457.ts（本批即插接线）----
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 10; r++) {
      if (!occ[c][r]) continue;
      if (!doorExists[c][r] && hellFortCanCrumbleWall(st, rng, -1, c, r, colL, rowT, rowB)) {
        hellFortAttemptCrumbleWall(st, rng, c, r, colL, rowT, rowB);
      }
      if (!doorExists2[c][r] && hellFortCanCrumbleWall(st, rng, 1, c, r, colR, rowT, rowB)) {
        hellFortAttemptCrumbleWall(st, rng, c, r, colR, rowT, rowB);
      }
    }
  }
}

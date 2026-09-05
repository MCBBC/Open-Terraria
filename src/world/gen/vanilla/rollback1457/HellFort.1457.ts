// ★1457 语义存档（KKKKKK 批 2026-08-22 从 HellFortPass.ts 回滚时摘存）。
// ★2026-08-23 1457 对齐档 2：**已接线**——HellFortPass.hellFort() 本批按本存档
//   头注换回 1457 语义，门落点（hellFortPlaceDoorLoop/hellFortAttemptDoorAt）与
//   塌墙阶段（hellFortCanCrumbleWall/hellFortAttemptCrumbleWall）四 helper 直接
//   import 自本文件（存档即插式）。1456 真值裁决：
// IIIIII IL 复裁（hs.exe=1.4.5.6 二进制）+ Terarria1456/Terraria/WorldGen.cs
// HellFort cs:32850-33310（无塌墙阶段/门落点无条件直写/右翼先掷/Next(10) 扩 span）。
// 1457 语义差异清单（相对 1456，源=Terarria1457 cs:32974-33456）：
//   ① 翼掷序重分配：左翼(colL[1]/colL[0])先掷、右翼(colL[3]/colR[3]族)后掷
//     （1456 右翼先）——掷数不变、几何镜像级偏移。
//   ② 翼行槽数钳位：`Clamp(Next(10), num4, num5)`（num4=num5=3 起恒 3），
//     span 不再被翼扩（1456 是 Next(10) 直接扩 [num4,num5]）。
//   ③ 中央跨度钳位：`Max(num4,Next(10))` + `Min(num5,Next(10))`（1456 两掷扩 span）。
//   ④ 门落点经 HellFort_AttemptToPlaceDoor：while 重掷 + 锚格真实检查
//     （InWorld && SolidTile(y-4,noDoors) && SolidTile(y,noDoors)）+ doorExists
//     记账（塌墙阶段跳过有门墙段）；wallType>0 才补墙（外门 wallType=0 不打墙）。
//     1456 是「命中候选行即单次无条件直写（仅 InWorld 门）」。
//   ⑤ 第 4 扇门（右外门）修复：1456 的 `num37 < 20 || num37 > maxTilesX-20`
//     死分支（num37=列号 0-4 恒 <20 → 首候选行即 break）删除，右外门可触发；
//     1456 正常世界右外门从不放置且零掷。
//   ⑥ 新增塌墙阶段（cs:33362-33378）：每个占用单元左右墙段，无门（doorExists
//     未记账）且外侧一列全空（CanCrumbleWall 先掷 Next(2)）时在墙段内
//     NextFloat/Next(2) 取段 ClearTile——地狱塔向外界「塌」出开口。1456 无此阶段。
// 1457 hellFort() 主体调用序（掷流）：
//   colL[2]/colR[2]（2 掷 ±4-9）→ 左翼 colR[1]/colL[1]、colR[0]/colL[0]（2 掷 8-19）
//   → 右翼 colL[3]/colR[3]、colL[4]/colR[4]（2 掷 8-19）→ 行界（7+6×6+... 同 1456）
//   → 占用网格 2 轮×2 翼（翼行 r=Clamp(Next(10),3,3)）→ 中央跨度
//   n4=Max(3,Next(10)); n4=Min(3,Next(10))（两掷钳 3）→ 绘制 → 四门位
//   hellFortPlaceDoorLoop(1457 helper)→ 平台/1-3 门（AttemptToPlaceDoor 单发）
//   → 左外门/右外门（helper+doorExists 记账）→ 顶层平台 → 塌墙阶段（1457 新增）。
// 共享底层 helper（placeDoorHF/placeTileDoorHF/solidTileHF，1456≡1457 同构）见
// ../HellFortPass.ts（本存档为自包含副本，未跨文件 import 防接线）。
import { TileStore } from '../../../TileStore';
import type { RNG } from '../../../../core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../../../../data/tiles';
import { placeTilePrologueClear } from '../WorldGenTileHelpers';
import { framePlatformSweep } from '../FinalCleanupPass';

const T_DOOR = TILE_BY_KEY['door_closed']!;

function solidTileHF1457(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] >>> 5) & 1) return false;                    // inActive（致动缩入）
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** WorldGen.SolidTile(i, j, noDoors)（1457 cs:70642） */
function solidTileNoDoorsHF(st: TileStore, x: number, y: number, noDoors: boolean): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !d.solid || d.platform || st.half[i] || st.slope[i] !== 0) return false;
  if ((st.wire[i] >>> 5) & 1) return false;                    // inActive（致动缩入）
  if (noDoors && st.type[i] === T_DOOR) return false;
  return true;
}

/** PlaceTile(x, j, 10, forced:false) 分支 A（向上门）→ PlaceDoor——与 live
 *  HellFortPass.placeTileDoorHF 同构（1456≡1457），此处副本仅存档用。 */
function placeTileDoorHF(st: TileStore, rng: RNG, x: number, j: number, style: number): boolean {
  // ★IIIII179：PlaceTile(x,j,10,forced:false)（AttemptToPlaceDoor cs:33468 调）受理序
  //  预清（cs:59966）——10 实心,forced=false ⇒ 析取经 EmptyTile(=目标惰性)放行;10 无
  //  型拒/drip/液体拒支⇒惰性即清（AttemptToPlaceDoor 头清 y-1..y-3 后 (x,j) 恒惰性,
  //  残型门洞格由此归零;受理则门三格覆写,PlaceDoor 锚门拒时外显）。序言位在分支 A/B
  //  方向判定前=vanilla 序言位。
  placeTilePrologueClear(st, x, j);
  const inact = (a: number, b: number): boolean => !!st.inBounds(a, b) && st.flags[st.idx(a, b)] === 0;
  const actSolid = (a: number, b: number): boolean => {
    if (!st.inBounds(a, b)) return false;
    const i = st.idx(a, b);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && !!d.solid;
  };
  if (!(inact(x, j - 1) && inact(x, j - 2) && actSolid(x, j - 3))) return false;
  placeDoorHF(st, rng, x, j - 1, style);
  // ★IIIII108b2：PlaceTile case10 落门后原版 SquareTileFrame(i,j)（cs:60378）——
  //   3×3 门肃清投影（对齐 x86,见 hellFortSquareDoorFrame 注）
  hellFortSquareDoorFrame(st, x, j);
  return true;
}

// ★IIIII108b2（2026-09-04）winter A 格 (1862,1047) 定罪修复：SquareTileFrame→
//   TileFrame 的「门肃清」最小投影。原版每次 PlaceTile 成功（case10 门 cs:60378 /
//   case19 平台 cs:60760 / case4 火把）尾置 SquareTileFrame(i,j)（cs:81470）对 3×3
//   逐格 TileFrame（cs:82613）：失活格清 halfBrick/slope/块漆/块涂层（cs:82631-35,
//   ClearBlockPaintAndCoating=Tile.cs:906）；活性门(10) 走 TileFrameImportant→
//   CheckDoorClosed（cs:87722）整门体检——由 frameY%54/18 反推门顶 num,上(num-1)/
//   下(num+3) 须 SolidTile(Tile)（cs:70495,nactive 口径）且三门位全活性 type10,
//   否则 destroyObject 置位逐位 KillTile（cs:64037:失活格早退+type10 才杀+尾置
//   SquareTileFrame）+DropDoorItem（生成期物品面,JS 无实体域,略）。
//   mile8 winter A 格机理：T#7 右外门落 3 格门 (1862,1047..1049) → T#8 绘制期
//   raw-write 以边墙行覆写门中位 (…,1048)（Terraria 绘制期无 TileFrame,门暂存活）、
//   室内写幽灵化门底位 (…,1049) → T#8 顶层平台 PlaceTile(1863,1048) 的 3×3 越框
//   Framing 门顶 (…,1047) → CheckDoorClosed 查中位≠门 → KillTile 门顶
//   （门底已失活被 KillTile 早退豁免=ghost 门保留）——x86 dump028 终态
//   (1047)=0:0:0/(1048)=75:1:0/(1049)=10:0:14 由此逐字节成立。JS 管线无 TileFrame,
//   本投影在 HellFort 的 PlaceTile 受理面补齐该状态面。
//   生成期其余活性非 frame-important 格 TileFrame 零状态面（TileFrameCosmetic 被
//   !generatingWorld 门跳过,cs:82656）;家具/挂画环 PlaceTile 肃清投影未接线（备案债,
//   本链无受理窗）。
let hfDestroyObject = false;

/** WorldGen.SolidTile(Tile)（cs:70495）：nactive+tileSolid+!tileSolidTop+!half+slope0 */
function hfSolidTileTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || ((st.wire[i] >>> 5) & 1)) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** CheckDoorClosed（cs:87722）1:1：整门体检+破门清算（destroyObject 重入门;
 *  KillTile 只杀活性 type10 位——被后写截断的中位/已幽灵化的底位均豁免）。 */
function hfCheckDoorClosed(st: TileStore, i: number, j: number): void {
  if (hfDestroyObject) return;
  const ti = st.idx(i, j);
  const top = j - Math.floor((st.frameY[ti] % 54) / 18);   // num = j - frameY%54/18
  const doorAt = (y: number): boolean => st.inBounds(i, y)
    && !!st.flags[st.idx(i, y)] && st.type[st.idx(i, y)] === T_DOOR;
  if (hfSolidTileTile(st, i, top - 1) && hfSolidTileTile(st, i, top + 3)
    && doorAt(top) && doorAt(top + 1) && doorAt(top + 2)) return;
  hfDestroyObject = true;
  for (let y = top; y <= top + 2; y++) {
    if (!st.inBounds(i, y)) continue;
    const t = st.idx(i, y);
    if (!st.flags[t] || st.type[t] !== T_DOOR) continue;    // KillTile 早退口径
    st.flags[t] = 0;                                       // active(false)
    st.half[t] = 0;                                        // halfBrick(false)
    // ★IIIII169·C4（R2）：KillTile 尾 `frameX=-1; frameY=-1`（cs:64400-64401,u16
    //   环回 65535）——漏写则门帧 (Next(3)*18, 54*style%36)（如 style19=(18,1026)）
    //   残留进终态（winter (1862,1047) x86 幽灵 65535 实证）
    st.frameX[t] = 65535;
    st.frameY[t] = 65535;
    st.type[t] = 0;                                        // 尾置 type=0
    st.paint[t] = 0;                                       // ClearBlockPaintAndCoating
    st.coat[t] &= ~TileStore.COAT_BLOCK_MASK;
    hellFortSquareDoorFrame(st, i, y);                     // KillTile 尾 SquareTileFrame
  }
  hfDestroyObject = false;
}

/** TileFrame(i,j) 生成期状态面投影（cs:82613）：±5 边界门;失活支清 half/slope/
 *  块漆/块涂层;活性门→hfCheckDoorClosed;活性平台→framePlatformSweep（★IIIII190 补支,
 *  原投影漏 cs:86648-86772 Platforms 支→顶平台 frameX 恒 0,x86 连接码 (54/72,234)
 *  残差=CLXIV after 89 格族 t19×11+t75×2）;其余类型生成期零状态面。 */
function hfTileFrameProj(st: TileStore, i: number, j: number): void {
  if (i <= 5 || j <= 5 || i >= st.w - 5 || j >= st.h - 5) return;
  const ti = st.idx(i, j);
  if (!st.flags[ti]) {
    st.half[ti] = 0;
    st.slope[ti] = 0;
    st.paint[ti] = 0;
    st.coat[ti] &= ~TileStore.COAT_BLOCK_MASK;
    return;
  }
  // ★IIIII190：TileFrameImportant Platforms 支（cs:86648 `TileID.Sets.Platforms[type]`）。
  //  PlaceTile case19（cs:60739 frameY=18*style）尾 SquareTileFrame（cs:60753）→ TileFrame
  //  → 本支写平台连接码 frameX（0/18/36/54/72…纯帧零掷）。HellFort 平台 style=13
  //  （cs:33181）→ 连接码 x86 实证 (54,234)/(72,234)（CLXIV 残余格逐格）。
  //  本塔面仅 PlaceTile(19) 一种平台（framePlatformSweep 邻域谓词族 {19,427,435-439}
  //  内其余型在本链不可达,门支 gate=sheet 19 精确）。终值=派发时刻邻域纯函数,与
  //  vanilla 逐格增量派发终态恒等（连接码不含掷）。
  if (TILE_DEFS[st.type[ti]]?.vanilla?.sheet === 19) framePlatformSweep(st, HF_FRAME_CTX, i, j);
  if (st.type[ti] === T_DOOR) hfCheckDoorClosed(st, i, j);
}

/** framePlatformSweep 的 ctx 形参（函数体内 void ctx,零消费——占位实参）。 */
const HF_FRAME_CTX = { rng: undefined, destroyObject: false, frameSparse: false } as const;

/** SquareTileFrame(i,j)（cs:81470）3×3 投影（行主序=原版 (i-1,j-1)→(i+1,j+1) 序）——
 *  HellFort 域 PlaceTile 受理面（门/平台/火把）后必调。 */
export function hellFortSquareDoorFrame(st: TileStore, cx: number, cy: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      hfTileFrameProj(st, cx + dx, cy + dy);
    }
  }
}

/** PlaceDoor（cs:31938）——与 live HellFortPass.placeDoorHF 同构（副本存档） */
function placeDoorHF(st: TileStore, rng: RNG, x: number, j: number, style: number): boolean {
  if (!st.inBounds(x, j - 2) || !st.inBounds(x, j + 2)) return false;
  const iUp = st.idx(x, j - 2);
  if (!st.flags[iUp] || ((st.wire[iUp] >>> 5) & 1)) return false;
  const d = TILE_DEFS[st.type[iUp]];
  if (!d || !d.solid) return false;
  if (!solidTileHF1457(st, x, j + 2)) return false;
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

/** HellFort_AttemptToPlaceDoor /bool 重载（1457 cs:33449）：锚格上下 (y-4/y) 均
 *  非门实心才落门——清 y-1..y-3（wallType>0 才补墙）+ PlaceTile(x, y-1, 10, mute,
 *  forced:false, style)。★1456 四处门落点是无条件直写（仅 InWorld 门）,1457 改
 *  真实格检查——第 4 扇门（右外门）因此从「恒 break 从不触发」变为可触发。 */
export function hellFortAttemptDoorAt(st: TileStore, rng: RNG, x: number, y: number,
  wallType: number, doorStyle: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x, y - 4)) return false;
  if (!solidTileNoDoorsHF(st, x, y - 4, true) || !solidTileNoDoorsHF(st, x, y, true)) return false;
  for (let k = 1; k <= 3; k++) {
    const ti = st.idx(x, y - k);
    st.flags[ti] = 0;
    if (wallType > 0) st.wall[ti] = wallType;   // ★1457 外门 wallType=0 → 不打墙
  }
  placeTileDoorHF(st, rng, x, y - 1, doorStyle);
  return true;
}

/** HellFort_AttemptToPlaceDoor /while 重载（1457 cs:33433）：`while (needDoor)` 逐轮
 *  Next(10) 抽行,命中候选行才尝试落门——失败（锚检查拒）不置 needDoor=false,
 *  继续重掷（1456 是命中即单次无条件落门后 break）。doorExists 记账成功落门行,
 *  供尾部塌墙阶段跳过有门的墙段。 */
export function hellFortPlaceDoorLoop(st: TileStore, rng: RNG, needDoor: { v: boolean },
  doorExists: boolean[][] | null, door: boolean[], x: number,
  doorX: number[], doorY: number[], wallType: number, doorStyle: number): void {
  let guard = 0;
  while (needDoor.v) {
    const num = rng.nextInt(10);
    if (door[num]) {
      const ok = hellFortAttemptDoorAt(st, rng, doorX[x], doorY[num], wallType, doorStyle);
      if (ok) needDoor.v = false;
      if (doorExists) doorExists[x][num] = ok;
    }
    // ★原版无守卫（候选行锚检查恒过后单轮收敛）;守卫仅防异常种子下的活锁
    if (++guard > 100000) break;
  }
}

/** HellFort_CanCrumbleWall（1457 cs:33383）：先掷 Next(2)（0→拒,掷恒耗）;再查墙段
 *  外侧一列 (wallX±1, wallTop+1..wallBottom-1) 无墙/无液/非实心。 */
export function hellFortCanCrumbleWall(st: TileStore, rng: RNG, dir: number, x: number, y: number,
  wallX: number[], wallTop: number[], wallBottom: number[]): boolean {
  if (rng.nextInt(2) === 0) return false;
  const wx = wallX[x];
  const wy = wallTop[y];
  const hgt = wallBottom[y] - wy;
  if (!(wx >= 10 && wx < st.w - 10 && wy >= 10 && wy < st.h - 10)) return false;   // InWorld(wx, wy, 10)
  const cx = wx + dir;
  for (let k = 1; k < hgt; k++) {
    const yy = wy + k;
    if (!st.inBounds(cx, yy)) return false;
    const ti = st.idx(cx, yy);
    if (st.wall[ti] > 0 || st.liquid[ti] > 0 || solidTileHF1457(st, cx, yy)) return false;
  }
  return true;
}

/** HellFort_AttemptToCrumbleWall（1457 cs:33409）：墙段内 NextFloat 取点 + Next(2)
 *  抖动定塌陷终点（<2 强制 2、钳 wallBottom-1）,起点 wallTop+1 起把实心格
 *  ClearTile（=清坡+失活+清致动位;type 幽灵保留,与全管线口径一致）。 */
export function hellFortAttemptCrumbleWall(st: TileStore, rng: RNG, x: number, y: number,
  wallX: number[], wallTop: number[], wallBottom: number[]): void {
  const wx = wallX[x];
  const wt = wallTop[y];
  const wb = wallBottom[y];
  const start = wt + 1;
  // (int)((float)(h-3) * NextFloat())——float32 乘积截断,与 C# 位级同口径
  let end = start + Math.trunc(Math.fround(Math.fround(wb - wt - 3) * Math.fround(rng.next())));
  end += rng.nextInt(2);
  if (end - start < 2) end = start + 2;
  end = Math.min(wb - 1, end);
  for (let k = start; k <= end; k++) {
    if (!st.inBounds(wx, k)) continue;
    const ti = st.idx(wx, k);
    if (st.flags[ti]) {
      st.flags[ti] = 0;
      st.slope[ti] = 0;
      st.half[ti] = 0;
      st.wire[ti] &= ~TileStore.WIRE_ACTUATED;   // inActive(false)
    }
  }
}

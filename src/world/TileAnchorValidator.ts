// TileObjectData 锚点验证器（vanilla Terraria.TileObject.CanPlace 全量移植，分格判定）
// 数据源：src/data/tile-anchors.json（tools/recon-tileobj.mjs 从反编译
//   Terraria.ObjectData/TileObjectData.cs 提取，1457）。
// 验收语义（TileObject.cs CanPlace 尾判）：锚点格子与占位格【全部】通过才可放
//   （num35/num36 双满分制），备选方向按序取首个满分者。
import anchorsJson from '../data/tile-anchors.json';
import { TILE_DEFS, TILE_TABLE_SHEETS, TILE_CUT_SHEETS, BREAKABLE_WHEN_PLACING_SHEETS,
  PLATFORMS_SHEETS } from '../data/tiles';
import { VAN_TILE_SOLID_EXTRA } from './gen/vanilla/GenSolid';
import { platformProperTopFrame } from './Torch';
import { LIQUID_TYPE } from './TileStore';
// ★BJ629 件2：Main.tileNoAttach 全表单源（SmartCursor.ts:76 67 项,与 Game.ts 局部
//  NO_ATTACH_SHEETS 逐值同表——Main.cs :7260-10258 逐条赋值 + 435-439 循环 :10130）。
//  world←player 引用向无环（SmartCursor 依赖面 data/*+world/{TileStore,Housing,
//  CanCutTile} 均不回指本文件）。
import { TILE_NO_ATTACH_SHEETS } from '../player/SmartCursor';
import type { World } from './World';

export interface AnchorDataRec { t: string[]; cnt: number | string; start: number | string }
/** LiquidPlacement 枚举值入库形态（Terraria.Enums/LiquidPlacement.cs 四值；
 *  1457 基样式数据实际只出现前两者，'onlyInFull' 为子样式级（227 style5）预留。
 *  原版 OnlyInLiquid 基样式零出现，不入库值域。 */
export type LiquidPlacementVal = 'allowed' | 'notAllowed' | 'onlyInFull';
export interface AnchorRec {
  w: number; h: number; ox: number; oy: number;
  anchorTop: AnchorDataRec | null; anchorBottom: AnchorDataRec | null;
  anchorLeft: AnchorDataRec | null; anchorRight: AnchorDataRec | null;
  wall: boolean;
  /** ★M-3 液体放置两维（TileObjectData.LiquidPlace :1853-1907）：
   *  water 维 = 原版 liquidType 0/2/3（水/蜜/微光）；lava 维 = 1（岩浆）。
   *  缺省 = SetupBaseObject :1767-1768（water Allowed / lava NotAllowed）。 */
  liq: { water: LiquidPlacementVal; lava: LiquidPlacementVal };
  /** ★M-3b 子样式级液体例外（TileObjectData.cs addSubTile/addSubTileRange :2016-2096
   *  提交到 SubTiles[style] 槽;GetTileData :5142-5150 对无子样式/越界 style 回落基记录
   *  ——故只存与基记录发散的样式,命中用 style 档,未命中落 liq 基档）。
   *  alternate 维不建模：CanPlace（TileObject.cs:205-208/:342）结构上逐 alternate 取
   *  GetTileData(type,style,num7) 做 LiquidPlace,但 1457 全表 newAlternate.* 液体赋值
   *  0 行,alternate 液体恒等于所属记录（_tod-substyle-audit.mjs 双向发散计数=0）。 */
  liqStyles?: Record<string, { water: LiquidPlacementVal; lava: LiquidPlacementVal }>;
  flatten: boolean; dir: string; yOff: number;
  dirs?: Array<{ dir: string }>;
  /** ★BJ602（2026-10-10）：AnchorAlternateTiles（TileObjectData.cs:434-446）——
   *  AnchorType.AlternateTile 位的成员表；锚格 active 且 sheet∈表 → 该锚成立
   *  （isValidAlternateAnchor :1969-1984；消费位 TileObject.cs:419/:509/:611/:697）。
   *  位存在而表缺省（null）=原版本相恒 false（isValidAlternateAnchor 早退）。 */
  altTiles?: number[];
  /** ★BJ602：子样式全记录（GetTileData TileObjectData.cs:5127-5162 SubTiles[style]
   *  整记录替换非合并,越界/缺style回落基记录）。recon-tileobj 从反编译提取,
   *  只存与基记录发散的 style。 */
  subTiles?: Record<string, AnchorRec>;
  /** ★BJ602：UsesCustomCanPlace（TileObjectData.cs:145-155,ctor :1679 缺省 false）——
   *  CustomPlace（:5017-5038）路由维度。★暂只入库不设路由门（消费端 19/427/165/233
   *  等在册件照旧走既有路由）=登记债（BJ602）。 */
  uccp?: boolean;
}
const RAW = (anchorsJson as unknown as { v: string; tiles: Record<string, AnchorRec | null> }).tiles;

/** ★BJ602：AlternateTile 位已建模（altTiles 成员表）——白名单渐进解禁：
 *  698（altTiles 8 成员 TileObjectData.cs:2481）、693/694（坐地变体 subTiles 39-77
 *  全提取,位本身无成员表=原版恒 false 惰性位）。
 *  ★BJ624（2026-10-10 件2 逐族翻案,亲读反编译逐块）追加四族：
 *  · 82/83/84 药草（AnchorAlternateTiles={78} 陶盆,:4756/:4759-4782 全 subTile 同值）
 *    ——放置链走 placeAlchRuntime 专用支（Player.cs:40085 `tileToCreate != 82` 路由
 *    排除,Player.cs:40085 区）,解禁后 anchorRec 仅作数据面/预览/实体门域,放置路由
 *    不变（needSupport isAlchPlace 豁免+清格相 BJ567 专用支全在位）。
 *  · 753 巨型提基（AnchorAlternateTiles={753} 自身,:4129）——3×3 多格,解禁后入
 *    chooseAnchorFromClick/validateAnchors 表驱动链（底行 SolidWithTop 平台档归位+
 *    贴墙松臂撤除:wall=false 无墙锚=原版无墙挂档）。
 *  仍维持保守回落（BJ624 复核维持,★BJ629 更新）：419（BJ622 判语=placeLogicLampGate
 *    专用门维持;★BJ629 件4 叠挂 alternate1 Origin(0,1) 已入 Game.ts 419 门——本链仍
 *    回落,placeStyle 档/基档液体面独立有效）;442/630/631/723/724（走 Game.ts
 *    anchorTilePlacementStyle 五锚档路由=CanPlace alternates 全序,不入本链）;
 *    136 拉杆（★BJ629 件1 定谳翻正：原版 StyleSwitch 块 :4551-4577 亲读——
 *    addBaseTile(out StyleSwitch) :4560 先于 AnchorBottom 赋值 :4562,故
 *    newAlternate.CopyFrom(StyleSwitch) 三备档【不含】底锚:alt1=AnchorLeft+梁成员表
 *    {124,561,574-578}/alt2=AnchorRight+同表/alt3=AnchorWall,exclusive 制与 630/631
 *    同构——旧注「alternates 叠加底锚」系误读,保守回落已撤,改走 Game.ts 五锚档路由
 *    （ANCHOR_GATE_SPECS[136],bottomSolidTop=false 对应基记录底锚 SolidTile|SolidSide
 *    双位无 SolidWithTop）;本链 anchorSpecOf(136) 基记录仍非空（无 exotic 位）=预览面
 *    足印域消费,放置路由不经过）;
 *    165（ BJ602 销案锚维持：AlternateTile 位无成员表=原版恒 false 惰性位,入链无增益,
 *    且 subTiles 惰性位+级联面已 'stalactite' 单源）。 */
const ALTERNATE_MODELED = new Set([698, 693, 694, 82, 83, 84, 753]);

const _resolved = new Map<string, AnchorRec | null>();
/** 取 tile 的锚点规格；无数据 / 复杂构造回落(null)/含未建模豁免位者归 null 走旧路径。
 *  ★BJ602：style 给定且命中 subTiles[style] → 返回子样式记录（GetTileData 整记录
 *  替换语义,TileObjectData.cs:5127-5162）；未命中/越界回落基记录（同 :5142-5150）。 */
export function anchorSpecOf(sheet: number, style?: number): AnchorRec | null {
  const key = `${sheet}|${style ?? ''}`;
  if (_resolved.has(key)) return _resolved.get(key)!;
  const raw = RAW[String(sheet)];
  let out: AnchorRec | null = null;
  if (raw) {
    const face = (style !== undefined ? raw.subTiles?.[String(style)] : undefined) ?? raw;
    // Tree 位依赖逐族白名单（未提取）→ 整体回落旧近似（保守）;AlternateTile 已建模
    // （ALTERNATE_MODELED 三族外仍保守回落）。★基记录毒性连带子样式：基记录含未建模
    // 位 → 该 tile 整体回落（子样式路由翻转不得早于其级联/帧带建模,如 165 坐地子样式
    // 入表驱动链会以吊顶帧带落地→级联杀=掉落循环）。
    const exoticOf = (f: AnchorRec) => [f.anchorTop, f.anchorBottom, f.anchorLeft, f.anchorRight]
      .some((a) => a?.t.some((s) => s === 'Tree'
        || (s === 'AlternateTile' && !ALTERNATE_MODELED.has(sheet))));
    out = (exoticOf(raw) || exoticOf(face)) ? null : face;
  }
  _resolved.set(key, out);
  return out;
}

/** ★M-3c 液体档直读（绕开 anchorSpecOf 的 AlternateTile/Tree 豁免回落）。
 *  消费位 = Game.ts 门双锚分支（liqGateDoor——门 10/11 被显式豁免走专用路径）与
 *  药草 legacy 置放路径（liqGateHerb——药草 82-84 anchorBottom 含 AlternateTile
 *  TileObjectData.cs:4749 → anchorSpecOf 恒 null，但【液体档】与该豁免无关，
 *  liq/liqStyles 是独立两维数据）。
 *  无记录返回 null：调用方不得臆造缺省、不开门（原版 GetTileData(type,style)==null
 *  时 CheckLiquidPlacement TileObjectData.cs:5042 回落 Main.tileLavaDeath/WaterDeath
 *  全局面——本仓无该表，无记录即无门，与既有行为一致）。 */
export function liquidSpecOf(sheet: number):
  { liq: AnchorRec['liq']; liqStyles?: AnchorRec['liqStyles'] } | null {
  const raw = RAW[String(sheet)];
  return raw ? { liq: raw.liq, liqStyles: raw.liqStyles } : null;
}

/** 原版 blockType()：0 平整 / 1 半砖 / 2..5 = slope1..4 */
function btOf(st: World['store'], x: number, y: number): number {
  const i = st.idx(x, y);
  if (st.half[i]) return 1;
  const s = st.slope[i];
  return s > 0 ? s + 1 : 0;
}
function defAt(st: World['store'], x: number, y: number) {
  return TILE_DEFS[st.get(x, y)];
}
function solidPureFlat(st: World['store'], x: number, y: number, flatten: boolean): boolean {
  // SolidTile 位：tileSolid 且非 tileSolidTop；默认还要求 blockType==0
  // （FlattenAnchors 时坡/半砖亦可）；noAttach 表近似忽略（常见家具锚面皆可附）
  // ★G1谓词批(2026-09-04)：现无调用点（死代码备案）。复活前置——须补原版 active
  // 双门（WorldGen.cs:70652-70658 SolidTile = active() && tileSolid && !tileSolidTop
  // && !halfBrick && slope==0 && !inActive()）：首门 active 位本体读 st.hasTile、
  // 尾门致动位 st.isActuated——本函数只读 type/half/slope,幽灵残型与已致动格都会
  // 被误判锚面
  const d = defAt(st, x, y);
  if (!d) return false;
  if (!(d.solid && !d.platform)) return false;
  return flatten || btOf(st, x, y) === 0;
}
/** 原版 blockType 侧缘对位表（SolidSide）：bottom{4,5} top{2,3} left{3,5} right{2,4} */
const SIDE_BT_PAIRS: Record<string, number[]> = {
  bottom: [4, 5], top: [2, 3], left: [3, 5], right: [2, 4],
};

interface SideSpec { t: string[]; cnt: number; start: number }

function evalCell(side: string, spec: SideSpec, at: [number, number],
  st: World['store'], rec: AnchorRec): boolean {
  const [cx, cy] = at;
  if (!st.inBounds(cx, cy)) return false;
  const active = st.isActive(cx, cy);
  const bit = (name: string) => spec.t.includes(name);
  let ok = false;
  if (active) {
    const d = defAt(st, cx, cy)!;
    const sheet = d?.vanilla?.sheet ?? -1;
    const iCell = st.idx(cx, cy);
    // ★BJ629 件2（2026-10-10）：SolidTile 臂补 !tileNoAttach 排除（原版四锚同款:
    //  底 TileObject.cs:388 / 顶 :457 / 右 :561 / 左 :647——`Main.tileSolid &&
    //  !Main.tileSolidTop && !Main.tileNoAttach && (FlattenAnchors || blockType()==0)`）。
    //  旧缺=松于原版:关态门 10（tileSolid[10]=true Main.cs:8027 而 noAttach[10]=true
    //  Main.cs:7812 区）等 noAttach 实心件曾被当承重锚（可浮贴门顶等）。其余臂不受影
    //  响:SolidSide（:411/:497/:565/:651）/SolidBottom（:465）/SolidWithTop（:392-406）
    //  原文本就无 noAttach 位——勿扩大。多格链共面（validateAnchors 逐格）一并受益。
    if (bit('SolidTile') && d?.solid && !d.platform && st.wall[iCell] >= 0
      && !TILE_NO_ATTACH_SHEETS.has(sheet)
      && (rec.flatten || btOf(st, cx, cy) === 0)) ok = true;
    // ★BJ624（2026-10-10）：SolidWithTop / Table 两臂拆分（原版 CanPlace 底锚四支
    //  1:1,TileObject.cs:404-476）——旧合并支 solidTopLike（isPlatform∪tileTable）
    //  双向松：① SolidWithTop 桌面漏拒（桌 14/工作台 18 tileSolidTop=true 而
    //  tileSolid=false,原版非平台支 :474-476 要求 tileSolid∧tileSolidTop 双旗→
    //  桌不承;平台支 :466-473 要求 !halfBrick∧PlatformProperTopFrame（frameX 连接
    //  带,WorldGen.cs:70686——斜坡带 8-11/17-24 不承））;② Table 平台漏拒
    //  （:404-408 显式 !TileID.Sets.Platforms 前置——tileTable[19/427/435-439]=true
    //  而桌面锚支排除平台）。
    if (!ok && bit('SolidWithTop')) {
      if (PLATFORMS_SHEETS.has(sheet)) {
        // 平台支（:466-473）：Platforms ∧ !halfBrick ∧ PlatformProperTopFrame
        if (rec.flatten || (!st.half[iCell] && platformProperTopFrame(st.frameX[iCell] ?? 0))) ok = true;
      } else if (VAN_TILE_SOLID_EXTRA.has(sheet)) {
        // 非平台支（:474-476）：tileSolid ∧ tileSolidTop（九件套差集 239/380 等,
        //  无 blockType 门——坡/半砖锭顶亦承,原版本相）
        ok = true;
      }
    }
    if (!ok && bit('Table') && TILE_TABLE_SHEETS.has(sheet) && !PLATFORMS_SHEETS.has(sheet)
      && btOf(st, cx, cy) === 0) ok = true;
    if (!ok && bit('SolidSide') && d?.solid && !d.platform
      && SIDE_BT_PAIRS[side]?.includes(btOf(st, cx, cy))) ok = true;
    if (!ok && bit('PlanterBox') && sheet === 380) ok = true;
    // ★BJ602：AlternateTile 位（TileObject.cs:419/:509/:611/:697）——锚格 active 且
    // sheet ∈ rec.altTiles（AnchorAlternateTiles,isValidAlternateAnchor
    // TileObjectData.cs:1969-1984）→ 锚成立。表缺省 = 原版本相恒 false（惰性位）。
    if (!ok && bit('AlternateTile') && (rec.altTiles ?? []).includes(sheet)) ok = true;
    if (!ok && bit('SolidBottom')) {
      // Composite（TileObject :541-556）：整实心 / 半砖 / 顶坡 / 平台的半砖·顶坡形态；
      // NotReallySolid/bottomSlope 近似忽略（花箱族已由 PlanterBox 覆盖）
      const b = btOf(st, cx, cy);
      if (d?.solid || b === 1 || b >= 2) ok = true;
    }
  } else if (bit('EmptyTile')) ok = true;
  return ok;
}

/** ★M-3c 单格液体放置门（TileObjectData.LiquidPlace TileObjectData.cs:1853-1907 全支）。
 *  validateAnchors 的逐格液体门与【非锚点表消费位】（Game.ts 门双锚分支 liqGateDoor /
 *  药草 legacy 路径 liqGateHerb）共用同一实现——液体语义单源，禁止在消费侧复刻。
 *  维度：岩浆（LIQUID_TYPE.LAVA=原版 liquidType 1）走 lava 档，其余（WATER/HONEY/
 *  SHIMMER=原版 0/2/3）走 water 档。液体量 >0：NotAllowed 拒 / onlyInFull 非满液(255) 拒；
 *  量 ==0（dry）：onlyIn* 恒拒（:1886-1904 else 支——基样式数据无 onlyIn 值,分支为
 *  语义完备性保留）。调用方保证 (x,y) 在界内（validateAnchors 已界内检查）。 */
export function liquidCellOk(st: World['store'], x: number, y: number,
  liq: { water: LiquidPlacementVal; lava: LiquidPlacementVal }): boolean {
  const i = st.idx(x, y);
  const amt = st.liquid[i];
  // 本仓 liquidType 为原版 +1 编码（TileStore.LIQUID_TYPE）；0(NONE) 视同水（同
  //  Game.ts:21951 惯例——原版 liquidType()==0 即水）
  const spec = st.liquidType[i] === LIQUID_TYPE.LAVA ? liq.lava : liq.water;
  if (amt > 0) {
    if (spec === 'notAllowed') return false;
    if (spec === 'onlyInFull' && amt !== 255) return false;
  } else if (spec === 'onlyInFull') {
    return false;
  }
  return true;
}

/** 检验“某物放在 ax,ay 是否满足全部锚点”。CanPlace 的 all-or-nothing 判定。
 *  液体门 = 两维建模（rec.liq.water/lava，见下方逐格注释）；wall 族沿用
 *  isValidWallAnchor 默认分支（任意非零墙均有效）。occupiedIgnore：调用方为
 *  “原地重放”场景给的豁免面。style = itemDef.placeStyle（原版 Item.placeStyle →
 *  TileObjectData style,TileObject.CanPlace :176 GetTileData(type,style)）：
 *  ★M-3b 命中 rec.liqStyles[style] 子样式档,未命中回落 rec.liq 基档（vanilla
 *  GetTileData :5142-5150 SubTiles[style]==null/越界回落基记录的同构语义）。 */
export function validateAnchors(st: World['store'], ax: number, ay: number, rec: AnchorRec,
  style = 0, occupiedIgnore?: (x: number, y: number) => boolean): boolean {
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return false;
  if (ax < 1 || ay < 1 || ax + rec.w > st.w - 1 || ay + rec.h > st.h - 1) return false;
  for (let j = 0; j < rec.h; j++) {
    for (let i = 0; i < rec.w; i++) {
      const x = ax + i, y = ay + j;
      if (!st.inBounds(x, y)) return false;
      const i2 = st.idx(x, y);
      if (occupiedIgnore?.(x, y)) continue;
      // 占位格阻挡判定（CanPlace TileObject.cs:357）：tileCut ∪ BreakableWhenPlacing
      // 均不阻挡（写入前 TileObject.Place :84-86 KillTile 清除）；特例 484/654 虽属
      // tileCut 仍阻挡。★石堆族 185 曾漏入例外面——小石子挡家具须镐挖(用户实报)。
      // ★终审 B①（2026-09-04）：门读裸 active()（=hasTile,含已致动格）——原版
      //  CanPlace :357 占用面为 tile.active() 非 nactive(),已致动格=占用拒绝放置
      //  （曾用 isActive=nactive() → 致动格被当空位;豁免件清格侧 KillTile 尾
      //  WorldGen.cs:64431 复位 inActive,setTile(0) 已同步清 WIRE_ACTUATED）。
      {
        const shOc = defAt(st, x, y)?.vanilla?.sheet ?? -1;
        const clearable = (shOc !== -1 && shOc !== 484 && shOc !== 654
          && TILE_CUT_SHEETS.has(shOc)) || BREAKABLE_WHEN_PLACING_SHEETS.has(shOc);
        if (st.hasTile(x, y) && !clearable) return false;
      }
      // ★M-3 液体放置两维门（vanilla TileObjectData.LiquidPlace 全支，TileObjectData.cs
      //  :1853-1907；CanPlace 逐格消费 TileObject.cs:342 → :361 flag3 并入拒放）：
      //  · 液体量 >0：lava 型（LIQUID_TYPE.LAVA=原版 liquidType 1）走 lava 维，其余
      //    （WATER/HONEY/SHIMMER=原版 0/2/3）走 water 维；NotAllowed 拒；
      //    onlyInFull 非满液（255）拒。
      //  · 液体量 ==0（dry）：onlyIn* 语义拒（:1886-1904 else 支——onlyInFull/onlyInLiquid
      //    在无液格恒拒）。基样式数据暂无 onlyIn 值，分支为语义完备性保留。
      //  旧实现 liqAllow 单维布尔（缺省 false=液体中一律拒）与原版 382/382 反向，已翻正。
      //  ★M-3b：style 档解析——命中 liqStyles[style] 用子样式记录（如火把 4 styles
      //  8/11/17 水岩浆均放 TileObjectData.cs:4612-4613、染料 227 style5 onlyInFull
      //  :2196），未命中落基档（= GetTileData 回落语义,TileObjectData.cs:5142-5150）。
      //  ★M-3c：门体实现上移 liquidCellOk（门双锚分支/药草 legacy 路径共源）。
      {
        const liq = rec.liqStyles?.[String(style)] ?? rec.liq;
        if (!liquidCellOk(st, x, y, liq)) return false;
      }
      if (rec.wall && st.wall[i2] === 0) return false;
    }
  }
  const sideSpec = (side: 'top' | 'bottom' | 'left' | 'right'): SideSpec | null => {
    const a = side === 'top' ? rec.anchorTop : side === 'bottom' ? rec.anchorBottom
      : side === 'left' ? rec.anchorLeft : rec.anchorRight;
    if (!a) return null;
    return {
      t: a.t,
      cnt: typeof a.cnt === 'number' ? a.cnt : rec.w,
      start: typeof a.start === 'number' ? a.start : Math.max(0, rec.h - 1),
    };
  };
  const bottom = sideSpec('bottom');
  if (bottom) for (let k = 0; k < bottom.cnt; k++) {
    if (!evalCell('bottom', bottom, [ax + bottom.start + k, ay + rec.h], st, rec)) return false;
  }
  const top = sideSpec('top');
  if (top) for (let k = 0; k < top.cnt; k++) {
    if (!evalCell('top', top, [ax + top.start + k, ay - 1], st, rec)) return false;
  }
  const left = sideSpec('left');
  if (left) for (let k = 0; k < left.cnt; k++) {
    if (!evalCell('left', left, [ax - 1, ay + left.start + k], st, rec)) return false;
  }
  const right = sideSpec('right');
  if (right) for (let k = 0; k < right.cnt; k++) {
    if (!evalCell('right', right, [ax + rec.w, ay + right.start + k], st, rec)) return false;
  }
  return true;
}

/** 点击格 → 锚定位置换算 + Smart 吸附。返回最终锚点（占位左上角）。
 *  候选序（vanilla 手感：Smart Cursor 对持拿物的幽灵吸附重定向，行为子集）：
 *  ①主 Origin 对位；②方向备选水平镜像；③★全窗吸附——
 *    水平覆盖点击列落在物件横向跨度内的所有锚（贴墙缝点首/尾格即成），垂直
 *    覆盖「点击格作为底锚行正上方悬坐」（点到地表固体上时幽灵整体上移），
 *    按「Origin 所在格到点击的曼哈顿距」升序取首个满分者。
 *  style = itemDef.placeStyle（★M-3b 子样式液体档,透传 validateAnchors）。 */
export function chooseAnchorFromClick(st: World['store'], cx: number, cy: number, rec: AnchorRec,
  style = 0): { x: number; y: number } | null {
  const prim = { x: cx - rec.ox, y: cy - rec.oy };
  if (validateAnchors(st, prim.x, prim.y, rec, style)) return prim;
  if ((rec.dirs?.length ?? 0) > 0 && rec.w > 1) {
    const mx = { x: cx - ((rec.w - 1) - rec.ox), y: cy - rec.oy };
    if (mx.x !== prim.x && validateAnchors(st, mx.x, mx.y, rec, style)) return mx;
  }
  // ③ 全窗吸附：横向让点击列 ∈ [ax, ax+w-1]（ax ∈ [cx-w+1, cx]，与 Origin 解耦），
  //    纵向 ay ∈ [cy-h, cy]：「物件直接坐在点击行上方」(ay=cy-h, 点地表块本体)
  //    至「点击行即物件顶行」。排序键 = 物件 Origin 格到点击的曼哈顿距，同距低者优。
  type Cand = { ax: number; ay: number; d: number };
  const out: Cand[] = [];
  for (let dxx = -(rec.w - 1); dxx <= 0; dxx++) {
    const ax = cx + dxx;
    for (let ay = cy - rec.h; ay <= cy; ay++) {
      if (ax === prim.x && ay === prim.y) continue;
      const oxCell = ax + rec.ox, oyCell = ay + rec.oy;
      out.push({ ax, ay, d: Math.abs(oxCell - cx) + Math.abs(oyCell - cy) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.ay - b.ay || a.ax - b.ax);
  for (const c of out) {
    if (validateAnchors(st, c.ax, c.ay, rec, style)) return { x: c.ax, y: c.ay };
  }
  return null;
}
/** ★BJ557（2026-10-07）：放置预览幽灵【逐格】1/2 值（TileObject.CanPlace onlyCheck
 *  占位循环 TileObject.cs:340-372 1:1——每格 num11=2（阻挡红）/1（可放白））。
 *  判定域 = 足印（w×h）三谓词,与 validateAnchors 足印段逐谓词同源（:169-199）：
 *  · 占位（:357 `tileSafely.active() && (!tileCut ∨ 484/654) && !BreakableWhenPlacing`）
 *  · 液体（:342 flag3 = !LiquidPlace——liqStyles[style] 档,同 M-3b）
 *  · 墙（:347-353 AnchorWall → isValidWallAnchor——本仓默认分支=任意非零墙）。
 *  ★与 validateAnchors 的关系：本表全 1 是 validateAnchors 通过的【必要非充分】
 *  条件（锚点带 :404-716 不在本判定;原版锚带格同样写 1/2 但 DrawPreview 绘制窗
 *  只取 ObjectStart..+W/H（:936-938 continue 跳过）=锚带格【永不可见】——故预览
 *  只需足印值;锚失败时原版幽灵仍显示白格（点击落空=原版本相,照抄）。 */
export function previewCellValues(st: World['store'], ax: number, ay: number, rec: AnchorRec,
  style = 0): Uint8Array {
  const cells = new Uint8Array(rec.w * rec.h);
  const liq = rec.liqStyles?.[String(style)] ?? rec.liq;
  for (let j = 0; j < rec.h; j++) {
    for (let i = 0; i < rec.w; i++) {
      const x = ax + i, y = ay + j;
      if (!st.inBounds(x, y)) { cells[j * rec.w + i] = 2; continue; }
      const i2 = st.idx(x, y);
      const shOc = defAt(st, x, y)?.vanilla?.sheet ?? -1;
      const clearable = (shOc !== -1 && shOc !== 484 && shOc !== 654
        && TILE_CUT_SHEETS.has(shOc)) || BREAKABLE_WHEN_PLACING_SHEETS.has(shOc);
      if (st.hasTile(x, y) && !clearable) { cells[j * rec.w + i] = 2; continue; }
      if (!liquidCellOk(st, x, y, liq)) { cells[j * rec.w + i] = 2; continue; }
      if (rec.wall && st.wall[i2] === 0) { cells[j * rec.w + i] = 2; continue; }
      cells[j * rec.w + i] = 1;
    }
  }
  return cells;
}
export const ANCHOR_JSON_V = (anchorsJson as unknown as { v: string }).v;

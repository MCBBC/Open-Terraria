// 火把锚定（TileObjectData tile 4 + TileObject.CanPlace 1:1）。
// 帧语义（TEdit Tiles_4 framing，22px 步长）：
//   frameX 0 = 底锚直立（地面/背景墙共用直立贴图）、22 = 左锚（贴左块倾斜）、44 = 右锚。
//   未点燃变体 = 点燃帧 +66（Wiring.ToggleTorch Wiring.cs:2922-2937 的 ±66 翻转；
//   frameX ≥ 66 判定见同函数/Player.cs:17654 的 TorchAttack 复燃）。重锚定与点亮态
//   互不干扰——TileFrame 重算时先剥掉 66 再选锚（WorldGen.cs:86860 num = frameX>=66 ? 66 : 0）。
// TileObjectData.cs:4584-4602 锚定义：
//   base      AnchorBottom = SolidTile | SolidSide
//   alt[1]    AnchorLeft   = SolidTile | SolidSide | Tree | AlternateTile(124,561,574-578)
//   alt[2]    AnchorRight  = 同上
//   alt[0]    AnchorWall   = 任意背景墙
// CanPlace（TileObject.cs:203 while 循环）按 base → alt[1] → alt[2] → alt[0] 顺序尝试，全过即取。
import type { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

/** 未点燃火把的帧偏移（Wiring.ToggleTorch：frameX ±= 66；判定 frameX >= 66） */
export const TORCH_UNLIT_OFFSET = 66;

/** 火把是否处于未点燃态（Torch God 熄灭/电路 ToggleTorch 后；Player.TorchAttack 复燃） */
export function isUnlitTorch(frameX: number): boolean {
  return frameX >= TORCH_UNLIT_OFFSET;
}

/** 剥掉未点燃偏移取锚帧（WorldGen.cs:86860 TileFrame 的 num 剥离语义） */
export function torchLitFrame(frameX: number): number {
  return isUnlitTorch(frameX) ? frameX - TORCH_UNLIT_OFFSET : frameX;
}

/** 翻转点亮态（Wiring.ToggleTorch Wiring.cs:2922-2937：< 66 则 +66，≥ 66 则 −66） */
export function toggleTorchFrame(frameX: number): number {
  return isUnlitTorch(frameX) ? frameX - TORCH_UNLIT_OFFSET : frameX + TORCH_UNLIT_OFFSET;
}

/** 树干/棕榈干 sheet（AnchorLeft/Right 的 Tree|AlternateTile 项） */
const TRUNK_SHEETS = new Set([5, 72, 323, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 124, 561, 574, 575, 576, 577, 578]);

const isTrunk = (st: TileStore, x: number, y: number): boolean => {
  const i = st.idx(x, y);
  if (!st.flags[i] || st.type[i] === 0) return false;
  const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
  return sheet !== undefined && TRUNK_SHEETS.has(sheet);
};

/** 可锚定的支撑（AnchorLeft/Right 用：实心或树干） */
const anchorable = (st: TileStore, x: number, y: number): boolean =>
  st.isSolid(x, y) || isTrunk(st, x, y);

/**
 * 计算放置锚点帧。优先级 1:1 TileObject.CanPlace：底锚(0) → 左锚(22) → 右锚(44) → 墙锚(0)。
 * 无任何锚点返回 -1（放置拒绝）。新放置火把恒为点燃态；既有火把重锚定时须用
 * torchLitFrame 剥偏移选锚、再把 TORCH_UNLIT_OFFSET 加回（WorldGen.cs:86860 语义）。
 */
export function torchAnchorFrame(st: TileStore, tx: number, ty: number): number {
  if (!st.inBounds(tx, ty)) return -1;
  if (st.isSolid(tx, ty + 1)) return 0;                       // base: AnchorBottom
  if (anchorable(st, tx - 1, ty)) return 22;                  // alt[1]: AnchorLeft
  if (anchorable(st, tx + 1, ty)) return 44;                  // alt[2]: AnchorRight
  if (st.wall[st.idx(tx, ty)] !== 0) return 0;                // alt[0]: AnchorWall
  return -1;
}

/**
 * 已放置火把的锚是否仍然成立（支撑被挖掉时判定掉落）。
 * frameX 0 的直立火把：底锚或墙锚任一在即成立（vanilla 行为：拆地板留墙不掉）。
 * 未点燃变体（+66）先剥偏移再判锚——此前 88（22+66）/110（44+66）落进 default，
 * 侧锚丢失不掉、只剩侧锚却误判成立。
 */
export function torchStillAnchored(st: TileStore, tx: number, ty: number, frameX: number): boolean {
  if (!st.inBounds(tx, ty)) return false;
  switch (torchLitFrame(frameX)) {
    case 22: return anchorable(st, tx - 1, ty);
    case 44: return anchorable(st, tx + 1, ty);
    default: return st.isSolid(tx, ty + 1) || st.wall[st.idx(tx, ty)] !== 0;
  }
}

// ---- 水炬（TileObjectData :4604-4616 addSubTile 8/11/17）：水中不死、可水中放置 ----
/** 水炬 torchId 集（普通火把 WaterDeath=true；水炬三色 false + WaterPlacement Allowed） */
export const WATER_TORCH_STYLES = new Set([8, 11, 17]);

/** 该火把 tile（frameY）是否水炬样式——液体冲毁豁免/水中放置门 */
export function isWaterTorchStyle(frameY: number): boolean {
  return WATER_TORCH_STYLES.has(Math.floor(frameY / 22));
}

// ---- 群系火把样式（TorchGodsFlavor 自动转换链，2026-08-22 补 C 审计 5573 效果端）----

/** TorchID.Sets.IsABiomeTorch（Terraria.ID/TorchID.cs:12）：
 *  false 兜底 + {0 普通炬,18 腐化,19 猩红,20 神圣,21 丛林,23 微光,13 骨,7 恶魔,9 冰雪,
 *  22 蘑菇,16 沙漠}——TorchGodsFlavor 只转换该集内的样式（彩炬/诅咒等不属"群系炬"） */
export const IS_BIOME_TORCH_STYLE = new Set([0, 18, 19, 20, 21, 23, 13, 7, 9, 22, 16]);

/** TorchID.Dust（TorchID.cs:77-81）：样式 0-23 → 转换弹 1084 尾迹/落点尘埃 id */
export const TORCH_DUST_BY_STYLE: readonly number[] = [
  6, 59, 60, 61, 62, 63, 64, 65, 75, 135,
  158, 169, 156, 234, 66, 242, 293, 294, 295, 296,
  297, 298, 307, 310,
];

/** BiomeTorchPlaceStyle 的群系输入（Player.Zone* 位 + 深度/世界旗） */
export interface BiomeTorchZones {
  shimmer: boolean; dungeon: boolean; temple: boolean; underworld: boolean;
  glowshroom: boolean; hallow: boolean; corrupt: boolean; crimson: boolean;
  snow: boolean; jungle: boolean; desert: boolean; undergroundDesert: boolean;
  /** 玩家 tileY ≤ worldSurface（地表沙漠门 :39626 `position.Y < worldSurface*16`） */
  aboveSurface: boolean;
  /** Main.remixWorld（:39631 don't dig up 沙漠补支） */
  remixWorld: boolean;
}

/**
 * BiomeTorchPlaceStyle（Player.cs:39586-39635 1:1 提取）：当期群系 → 应使用的火把样式。
 * 消费端①TorchGodsFlavor（:39529，buff 376 火把神药水每 tick 1/10 扫屏把**异群系群系炬**
 * 转成本表样式）；②原版手持火把自动换样式（UsingBiomeTorches，unlockedBiomeTorches
 * 消费端，本仓未建——登记）。无命中群系 = 0（普通炬，不触发转换）。
 */
export function biomeTorchPlaceStyle(z: BiomeTorchZones): number {
  if (z.shimmer) return 23;          // :39592-39594
  if (z.dungeon) return 13;          // :39596-39598
  if (z.temple) return 21;           // :39600-39602 ZoneLihzhardTemple
  if (z.underworld) return 7;        // :39604-39606 position.Y > UnderworldLayer*16
  if (z.glowshroom) return 22;       // :39608-39610
  if (z.hallow) return 20;           // :39612-39614
  if (z.corrupt) return 18;          // :39616-39618
  if (z.crimson) return 19;          // :39620-39622
  if (z.snow) return 9;              // :39624-39626
  if (z.jungle) return 21;           // :39628-39630
  if ((z.desert && z.aboveSurface) || z.undergroundDesert) return 16;  // :39632-39634
  if (z.desert && z.remixWorld) return 16;                             // :39636-39638
  return 0;
}

/** 物品 key → 放置火把样式 torchId（Item.cs SetDefaults placeStyle + 生物群系火把显式表）。
 *  彩色火把 427-433 = id-426（1-7）；群系火把 BIOME 表；水炬 = 8（咒火 523）/11（灵液 1333）
 *  /17（珊瑚 4384）；legacy 'torch' 与其余 → 0 */
const BIOME_TORCH_ITEM: Record<number, number> = {
  523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
  4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
};
export function torchStyleOfItemKey(key: string): number {
  // 本地 'torch'→style0 支已随退役移除:vi_8_Torch 由下方 BIOME_TORCH_ITEM[8] 命中 style0
  const m = /^vi_(\d+)_/.exec(key);
  if (!m) return 0;
  const id = Number(m[1]);
  if (id >= 427 && id <= 433) return id - 426;
  return BIOME_TORCH_ITEM[id] ?? 0;
}

// 存量自放「高门 388/389 / 花园侏儒 567」帧约定迁移（★M-2b,2026-09-02 九批;
// 纯函数,afterWorldLoad 进世界统一汇点调用——repairIndexFrames 同款装载面修复位）。
//
// 背景：本仓放置面 framedCellFrame 曾对多格件统一写 dy*18 行步进,而原版
// TileObject.Place（TileObject.cs:96-108）行步进 = num9 += CoordinateHeights[l]
// + CoordinatePadding。两族 heights 非 18 均值 → 旧自放帧为非原版态：
//   · 388/389 高门 heights{18,16,16,16,18}+pad2（TileObjectData.cs:2301-2303,
//     addTile(388) :2323/389=FullCopyFrom :2324-2325）→ 原版行帧 0/20/38/56/74;
//     旧自放 = 0/18/36/54/72（2px 错缝,Tiles_388.png 内容带 0-17/20-35/…）。
//   · 567 花园侏儒 heights{18,18}+pad2（TileObjectData.cs:4222-4224）→ 原版 0/20
//     （CheckGnome WorldGen.cs:54419 完整性即按 `frameY==0 && frameY2==20`）;
//     旧自放第二行 = 18。
// 数据来源面：wld 导入 copyFrame 直拷原版帧（WldImport.ts :494/:515）、worldgen
// 不放这两件（grep 证）、放置面已归原版（FurnitureStyle.PLACE_ROW_FY）——只剩
// 本修复前存档里的自放格带旧帧。
//
// ★幂等性：旧约定帧集 {18,36,54,72} 与原版帧集 {0,20,38,56,74}（含带基 94*k/…）
// 交集为空 → 重映射后值不在键集,重复执行零改动（分批/重复进世界均安全）。
// 顶行 0 两约定同值不动。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from './TileStore';

/** 旧行帧 → 原版行帧（仅第二行起;键集与原版帧域不相交,幂等依据） */
const OLD_ROW_TO_VANILLA: Record<number, number> = { 18: 20, 36: 38, 54: 56, 72: 74 };
/** 受影响 vanilla sheet → 内部 id 布尔表（循环体内 O(1) 静态查） */
const REPAIR_TYPE = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sh = TILE_DEFS[i]?.vanilla?.sheet;
    if (sh === 388 || sh === 389 || sh === 567) t[i] = 1;
  }
  return t;
})();

/** 迁移存量旧帧;返回修复格数（日志/测试用） */
export function repairTallGateFramesInStore(st: TileStore): number {
  let fixed = 0;
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i] || REPAIR_TYPE[st.type[i]] !== 1) continue;
    const mapped = OLD_ROW_TO_VANILLA[st.frameY[i]];
    if (mapped === undefined) continue;
    st.frameY[i] = mapped;
    fixed++;
  }
  return fixed;
}

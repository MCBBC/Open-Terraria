// 植物支撑/换型规则单点（Game 运行时维护与 WorldEvolution 放置门/清整共用）。
//
// 原版标杆（Terarria1457）：
// · IsFitToPlaceFlowerIn（WorldGen.cs:58714-58734）：放置花族{3,24,110,201,637}时
//   支撑格必须 active+slope==0+非半砖，且类型严格配对——
//   {2,78,380,477,579}→3｜{23,661}→24｜{109,492}→110｜{199,662}→201｜633→637。
//   num==61 内联支（:60073）/num==71（:60142）：同坡/半砖门 + 地基 {60,226}/70。
// · PlaceTile 是唯一放置口 ⇒ 蔓延生成的新植物同样受门控。
// · PlantCheck（:81818，TileFrame Check 族 :86519 case {3,24,61,71,73,74,110,
//   113,201,637,703} 派发）：运行期支撑变化 → TryGetNewType 换型（腐化过境变型，
//   原版不杀）/ 无法变型即杀。
// 缺陷史：SW 蔓延放置端曾无门控（place1 直写不进 PlaceTile），斜面/半砖支撑上
// 长出蘑菇/高草、腐化地上残留森林草——写入监听只查上方格，新放的植物自身永不被
// 复检=粘滞（2026-08-26 用户实报，存档解码实证两案）。

/** 花族类型配对表（IsFitToPlaceFlowerIn :58726-58733） */
export const FLOWER_GROUND_SHEETS: Record<number, Set<number>> = {
  3: new Set([2, 78, 380, 477, 579]),
  24: new Set([23, 661]),
  110: new Set([109, 492]),
  201: new Set([199, 662]),
  637: new Set([633]),
};

/** 花族 placing sheets（PlantCheck 派发 case 表去掉 703 倒挂钟乳石——其地基允许坡面） */
export const PLANT_CHECK_SHEETS = [3, 24, 61, 71, 73, 74, 110, 113, 201, 637];

/**
 * 支撑格能否承载 want 植物（surface/underground 生长共用；等价
 * IsFitToPlaceFlowerIn + 61/71 内联锚支的坡/半砖门前置）。down 由调用方给出：
 * supportType(st 下格 sheet) 或 -1（非 active/slope≠0/半砖 → 一律 false）。
 */
export function flowerGroundOk(down: number, want: number): boolean {
  if (want === 61 || want === 74) return down === 60 || down === 226;
  if (want === 71) return down === 70;
  // 丛林株族（PlaceJunglePlant :48191 地基段 SolidTile(i,num+1)&&type==60）——
  // 233 小株单格锚；238 球茎/236 生命果为双列整平底，主列先过此门、副列由调用方逐列校验
  if (want === 233 || want === 238 || want === 236 || want === 702) return down === 60;
  const ok = FLOWER_GROUND_SHEETS[want];
  return !!ok && ok.has(down);
}

/** PlantCheck_IsBadTypeMatch（cs:81421）——运行期维护判定（Game 侧原实现迁入） */
export function plantBadMatch(down: number, type: number): boolean {
  if ((type !== 3 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 73 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 24 || down === 23 || down === 661)
    && (type !== 61 || down === 60 || down === 226)
    && (type !== 74 || down === 60 || down === 226)
    && (type !== 71 || down === 70)
    && (type !== 110 || down === 109 || down === 492)
    && (type !== 113 || down === 109 || down === 492)
    && (type !== 201 || down === 199 || down === 662)) {
    if (type === 637) return down !== 633;
    return false;
  }
  return true;
}

/** PlantCheck_TryGetNewType（cs:81886-81928）：按地基换型+帧折叠;
 *  spore=入口帧蘑菇株标记（回写 270/144） */
export function plantNewType(sheet: number, down: number, fx: number): { type: number; fx: number; spore: boolean } {
  let type = sheet, nfx = fx;
  let spore = false;
  if (type === 3 || type === 61 || type === 110 || type === 24) spore = nfx === 144;
  if (type === 201) spore = nfx === 270;
  if ((type === 3 || type === 73) && down !== 2 && down !== 477 && nfx >= 162) nfx = 126;
  if (type === 74 && down !== 60 && down !== 226 && nfx >= 162) nfx = 126;
  switch (down) {
    case 23: case 661: type = 24; if (nfx >= 162) nfx = 126; break;
    case 2: case 477: type = type === 113 ? 73 : 3; break;
    case 109: case 492: type = type === 73 ? 113 : 110; break;
    case 199: case 662: type = 201; break;
    case 60: case 226: type = 61; while (nfx > 126) nfx -= 126; break;
    case 70: type = 71; while (nfx > 72) nfx -= 72; break;
  }
  return { type, fx: nfx, spore };
}

/** 换型目标内部键（tile key by target sheet）——Game.setTileConvert 用 */
export const PLANT_CONVERT_KEY: Record<number, string> = {
  3: 'v_3_forest_short_plants', 24: 'v_24_corruption_short_plants', 61: 'v_61_jungle_short_plants',
  71: 'v_71_mushroom_plant', 73: 'v_73_forest_tall_plants', 74: 'v_74_jungle_tall_plants',
  110: 'v_110_hallow_short_plants', 113: 'v_113_hallow_tall_plants', 201: 'v_201_crimson_short_plants',
};

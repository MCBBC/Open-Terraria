// Check2x2 多格件回收身份金标（2026-09-07 回收身份升级批，43 def）。
//
// 权威锚：1457 WorldGen.cs Check2x2（:48985-49165 num14 表）+ 传送器 3 宽件特支
// Check3x1 case 235（:49592-49594 Item.NewItem 1263）。判据链：
//   vanilla 返还 item vid ──createTile──▶ 该 tile type（public/sprites/vanilla.json 独立
//   数据源反查）⇒「返还==放置物品」，本仓 def.drop 必须是真原版物品 id（VI 反查名牌件），
//   不得走 place_v_ 合成件（value 1 无名牌=前批登记债，本批清偿）。
// 行号 = num14 赋值行（1457）。★NO_RETURN_RECYCLE_SHEETS 门住面（484/590/595/615/滴水
//   五型）不在本表；样式依赖返还（100 烛台表/172 洗手池表/652 碎石 num7 三档）亦不在——
//   单 vid 无法表达逐 style 返还,维持 place_v_ 回收=登记在案未清偿面。
import { describe, it, expect } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { vanillaPlaceableTileKeys, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI } from '../src/data/itemKeys';
import { multiTileDropKey, NO_RETURN_RECYCLE_SHEETS } from '../src/core/Game';
import vanillaItemMeta from '../public/sprites/vanilla.json';

/** Check2x2/Check3x1 权威表（sheet=tile type, vid=返还 item id, at=WorldGen.cs num14 行） */
const CHECK2X2_RETURNS: Array<[number, number, string]> = [
  [126, 488, 'case 126 :49133 DiscoBall'],
  [142, 581, 'case 142 :49141 InletPump'],
  [143, 582, 'case 143 :49145 OutletPump'],
  [173, 714, 'case 173 :49121 PlatinumCandelabra'],
  [235, 1263, 'Check3x1 case 235 :49594 Teleporter（3 宽件特支）'],
  [282, 250, 'case 282 :49149 FishBowl'],
  [287, 2177, 'case 287 :49129 AmmoBox'],
  [288, 2178, ':49069 带 288-295→2178+type-288 MonarchButterflyJar'],
  [289, 2179, ':49069 带 288-295 PurpleEmperorButterflyJar'],
  [290, 2180, ':49069 带 288-295 RedAdmiralButterflyJar'],
  [291, 2181, ':49069 带 288-295 UlyssesButterflyJar'],
  [292, 2182, ':49069 带 288-295 SulphurButterflyJar'],
  [293, 2183, ':49069 带 288-295 TreeNymphButterflyJar'],
  [294, 2184, ':49069 带 288-295 ZebraSwallowtailButterflyJar'],
  [295, 2185, ':49069 带 288-295 JuliaButterflyJar'],
  [316, 2439, ':49073 带 316-318→2439+type-316 BlueJellyfishJar'],
  [317, 2440, ':49073 带 316-318 GreenJellyfishJar'],
  [318, 2441, ':49073 带 316-318 PinkJellyfishJar'],
  [319, 2490, 'case 319 :49153 ShipInABottle'],
  [335, 2700, 'case 335 :49105 FireworksBox'],
  [360, 3072, 'case 360 :49037 GoldButterflyCage'],
  [411, 3545, 'case 411 :49109 Detonator'],
  [490, 4075, 'case 490 :49157 WeatherVane'],
  [505, 4275, 'case 505 :49049 GoldGoldfishBowl'],
  [521, 4327, 'case 521 :48995 BlackDragonflyJar'],
  [522, 4328, 'case 522 :48998 BlueDragonflyJar'],
  [523, 4329, 'case 523 :49001 GreenDragonflyJar'],
  [524, 4330, 'case 524 :49004 OrangeDragonflyJar'],
  [525, 4331, 'case 525 :49007 RedDragonflyJar'],
  [526, 4332, 'case 526 :49010 YellowDragonflyJar'],
  [527, 4333, 'case 527 :49013 GoldDragonflyJar'],
  [543, 4398, 'case 543 :49053 PupfishBowl'],
  [564, 4553, 'case 564 :49016 PlasmaLamp'],
  [565, 4552, 'case 565 :49019 FogMachine'],
  [568, 4655, 'case 568 :49057 PinkFairyJar'],
  [569, 4656, 'case 569 :49061 GreenFairyJar'],
  [570, 4657, 'case 570 :49065 BlueFairyJar'],
  [580, 4846, 'case 580 :49041 HellButterflyJar'],
  [594, 4869, 'case 594 :49022 VolcanoLarge'],
  [598, 4880, 'case 598 :49033 LavaFishbowl'],
  [620, 4964, 'case 620 :49045 EmpressButterflyJar'],
  [621, 3750, 'case 621 :49025 SliceOfCake'],
  [622, 5008, 'case 622 :49028 TeaKettle'],
];

describe('Check2x2 回收身份（vanilla 返还==放置物品 → def.drop=真物品 id）', () => {
  const placeable = vanillaPlaceableTileKeys();
  /** vanilla.json createTile 反查表（item id → 放置 tile type） */
  const createTileOf = new Map<number, number>();
  for (const [idStr, it] of Object.entries(
    (vanillaItemMeta as unknown as { items: Record<string, { createTile?: number }> }).items,
  )) {
    if (it.createTile != null) createTileOf.set(Number(idStr), it.createTile);
  }

  it('表规模自检（43 def,与 tiles.ts 改账面一致）', () => {
    expect(CHECK2X2_RETURNS.length).toBe(43);
    expect(new Set(CHECK2X2_RETURNS.map(([s]) => s)).size).toBe(43);
  });

  it('逐条：返还物品 createTile == tile（返 还==放置 的数据面证据）', () => {
    const broken: string[] = [];
    for (const [sheet, vid, at] of CHECK2X2_RETURNS) {
      const ct = createTileOf.get(vid);
      if (ct !== sheet) broken.push(`vid ${vid}（${at}）createTile=${ct} ≠ sheet ${sheet}`);
    }
    expect(broken).toEqual([]);
  });

  it('逐条：def.drop == 原版 vid,且 multiTileDropKey 解析为真物品键（不再 place_ 合成件）', () => {
    const broken: string[] = [];
    for (const [sheet, vid, at] of CHECK2X2_RETURNS) {
      const d = TILE_DEFS.find((x) => x?.vanilla?.sheet === sheet);
      if (!d) { broken.push(`sheet ${sheet}（${at}）无 def`); continue; }
      if (d.drop !== vid) broken.push(`${d.key}: drop=${JSON.stringify(d.drop)} ≠ ${vid}（${at}）`);
      const resolved = multiTileDropKey(d, placeable);
      const want = VI(vid);
      if (resolved !== want) broken.push(`${d.key}: multiTileDropKey=${resolved} ≠ VI(${vid})=${want}`);
      if (!VANILLA_ITEM_KEY_BY_ID[vid]) broken.push(`vid ${vid} 无 VANILLA_ITEM_KEY_BY_ID 反查`);
      if (d.vanilla?.sheet !== undefined && NO_RETURN_RECYCLE_SHEETS.has(d.vanilla.sheet)) {
        broken.push(`${d.key} 误入 NO_RETURN_RECYCLE_SHEETS`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('样式依赖返还面：100 烛台=前批 pin style0（349）在案;172 洗手池/652 碎石维持 null', () => {
    // GetItemDrop_Candelabras(num5)（前批已 pin style0=349,ANCHOR_DROPS 账）/
    // GetItemDrop_Sinks(num5)/652 num7 三档——逐 style 返还,本批不扩刀（172/652
    // 维持 place_v_ 回收=移交债;盲 pin style0 会让其余 style 掉错件）
    for (const d of TILE_DEFS.filter((x) => x?.vanilla?.sheet === 100)) {
      expect(d.drop, '100 烛台=前批 pin style0（GetItemDrop_Candelabras(0)=349）').toBe(349);
    }
    for (const sheet of [172, 652]) {
      for (const d of TILE_DEFS.filter((x) => x?.vanilla?.sheet === sheet)) {
        expect(d.drop ?? null, `${d.key}（样式依赖面未建模,勿盲数值化）`).toBeNull();
      }
    }
  });
});

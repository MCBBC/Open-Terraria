// ★BJ563（2026-10-08）：种植盆 380 地图名随 style（BJ548 连带面——地图名称面）。
//
// 用户复报：BJ548 落了放置/绘制/破坏/收获全链后，全屏地图悬停种植盆仍恒显
// 「太阳花种植盆」（style0 物品名）。
//
// 定谳（亲读 1457 反编译）：
//   · 原版地图名面 = 全屏地图悬停 text = Lang.GetMapObjectName(MapTile.Type)
//     （Main.cs:56742；MapTile.Type = baseType+baseOption，MapHelper.cs:1923）。
//   · 原版 380 【无图例名】：Lang.BuildMapAtlas（Lang.cs:557-1052，由
//     MapHelper.Initialize :1789 调）全函数无 tile 380 条目 →
//     _mapLegendCache[tileLookup[380]] = LocalizedText.Empty → 悬停显空。
//     本仓 MapObject.PlanterBox l10n 键亦不存在（en-US.Game.json MapObject 分节
//     80 键全录无 PlanterBox）。
//   · 原版 380 全材质地图同质：MapHelper.Initialize array[380][0] 单色档（:704,
//     Color(151,107,75)）→ tileOptionCounts[380]=1（:1694-1700 计数=非透明色档数）；
//     GetTileBaseOption 无 case 380（MapHelper.cs:2085-3019 全案清点）→ baseOption
//     恒 0。即原版 7+1 材质在地图上共一色一 Type 一（空）名，style 面在地图不可观测。
//   · 任务处方「style→名称表（7 型名，Localization 键亲读）」按反编译证伪：原版
//     不存在 380 的 style→名表；8 名（3215-3222 = DayBloom/Moonglow/Corrupt/
//     Crimson/Blinkroot/Waterleaf/Shiverthorn/FireBlossom PlanterBox，ItemID.cs
//     :7976-7988+7990；zh 官方译文含 3217/3218 同名「死亡草种植盆」）是物品名，
//     原版从未把它们接线到地图图例。
//   · 本仓病灶链：地图悬停 mapTileHoverName → Lang.tileName(380) 走放置物品名兜底
//     （Lang.ts tileName ③ → TILE_NAME_ITEM_BY_SHEET[380]='3215'，id-maps ZH/EN 表
//     同钉 style0 名）→ 8 材质恒显「太阳花种植盆」。该兜底面是本仓既有登记面
//     （原版=无名）——本刀在其上补 per-style 名 = 登记明令分歧（同 BJ258 口径；
//     回滚口=删 Renderer mapTileHoverName 380 支即回落 tileName）。
//
// 刀面：Renderer.mapTileHoverName(+frameY 形参, sheet 380 → styleDropVidOfFrames
// (380,fx,fy) → Lang.itemName)——style 反推与破坏掉落同一单源（vanillaStyleDrops
// styleFromFrame[380]=fy/18 + PlanterBoxes 钳回，KillTile case 380
// WorldGen.cs:65726-65729），地图名恒=该材质被挖出的物品名，两面永不漂移；
// 调用侧 Renderer.ts 全屏地图悬停链传 st.frameY[i]。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mapTileHoverName, mapHoverNameKey } from '../src/render/Renderer';
import { styleDropVidOfFrames, styleFromFrame } from '../src/data/vanillaStyleDrops';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

// l10n 真包（bj224/bestiary-ungated-tooltip 同法，文案逐字断言）
languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/zh-Hans.json', 'utf8')));

// 原版 ItemID.cs:7976-7990 亲读（BJ548 PlanterBoxes 表同源）
const PLANTER_VIDS = [3215, 3216, 3217, 3218, 3219, 3220, 3221, 3222] as const;

// zh-Hans 官方译文钉值（vanilla Terraria.Localization.Content.zh-Hans.Items.json 亲读）
const ZH_NAMES = [
  '太阳花种植盆',      // 3215 DayBloomPlanterBox
  '月光草种植盆',      // 3216 MoonglowPlanterBox
  '死亡草种植盆',      // 3217 CorruptPlanterBox
  '死亡草种植盆',      // 3218 CrimsonPlanterBox（官方与腐化版同名）
  '闪耀根种植盆',      // 3219 BlinkrootPlanterBox
  '水叶草种植盆',      // 3220 WaterleafPlanterBox
  '寒颤棘种植盆',      // 3221 ShiverthornPlanterBox
  '火焰花种植盆',      // 3222 FireBlossomPlanterBox
] as const;

describe('★BJ563 种植盆地图名随 style', () => {
  it('A 全 8 材质钉值：style k（frameY=18k）→ 物品 3215+k 官方名（判别：style≠0 不再显 style0 名）', () => {
    for (let k = 0; k < 8; k++) {
      expect(mapTileHoverName(380, 0, 18 * k), `style ${k}`).toBe(ZH_NAMES[k]);
    }
    // 判别面：修复前 style1 恒显 style0 名
    expect(mapTileHoverName(380, 0, 18)).not.toBe(ZH_NAMES[0]);
    expect(mapTileHoverName(380, 0, 126)).toBe('火焰花种植盆');
  });

  it('B 连接帧不扰名：frameX 连接档 {0,18,36,54} 同材质同名（KillTile case 380 只读 frameY）', () => {
    for (const fx of [0, 18, 36, 54]) {
      expect(mapTileHoverName(380, fx, 18 * 4), `fx=${fx}`).toBe('闪耀根种植盆');
      expect(mapTileHoverName(380, fx, 0), `fx=${fx}`).toBe('太阳花种植盆');
    }
  });

  it('C 帧漂移钳回：越界 frameY 沿掉落链同一 pick 钳制（值域封闭，永不外推表外物品）', () => {
    expect(mapTileHoverName(380, 0, 200)).toBe('太阳花种植盆');   // style 11 → 钳回 style0
    expect(mapTileHoverName(380, 0, -1)).toBe('太阳花种植盆');
    expect(mapTileHoverName(380, 0, 0)).toBe('太阳花种植盆');
    // 与掉落链逐点同相（vanillaStyleDrops pick = t[style] ?? t[0]）
    for (const fy of [0, 18, 200, -1]) {
      const vid = styleDropVidOfFrames(380, 0, fy);
      expect(mapTileHoverName(380, 0, fy)).toBe(Lang.text(`ItemName.${itemNameKey(vid)}`));
    }
  });

  it('D 单源对拍：地图名 ≡ 该材质破坏掉落物品名（BJ548 面零漂移,全 8 档）', () => {
    for (let k = 0; k < 8; k++) {
      const vid = styleDropVidOfFrames(380, 0, 18 * k);
      expect(vid, `drop vid style ${k}`).toBe(PLANTER_VIDS[k]);
      expect(mapTileHoverName(380, 0, 18 * k)).toBe(Lang.text(`ItemName.${itemNameKey(vid)}`));
    }
  });

  it('E BJ548 styleFromFrame[380] 不回归：fy/18 全 8 档 + frameX 无关', () => {
    for (let k = 0; k < 8; k++) {
      expect(styleFromFrame[380]!(0, 18 * k)).toBe(k);
      expect(styleFromFrame[380]!(54, 18 * k)).toBe(k);
    }
  });

  it('F 非 380 面零回归：箱族 frameX 档名照旧（frameY 新参不参与）+ 图例名分支照旧', () => {
    expect(mapHoverNameKey(21, 0)).toBe('LegacyChestType.0');
    expect(mapHoverNameKey(88, 54)).toBe('LegacyDresserType.1');
    // 箱族仍走 mapHoverNameKey（frameY 传入也被忽略）
    expect(mapTileHoverName(21, 0, 999)).toBe(Lang.text('LegacyChestType.0'));
    // 非 380 非 21 → tileName 图例面（tile 14 桌 MapObject.Table——①分支直证）
    expect(mapTileHoverName(14, 0, 18)).toBe(Lang.text('MapObject.Table'));
  });

  it('G en-US 面：同链走 ItemName 键（非 zh 硬编码）', () => {
    languageManager.loadPackJson(JSON.parse(fs.readFileSync('public/l10n/en-US.json', 'utf8')));
    expect(mapTileHoverName(380, 0, 0)).toBe('Daybloom Planter Box');
    expect(mapTileHoverName(380, 0, 18)).toBe('Moonglow Planter Box');
    expect(mapTileHoverName(380, 0, 36)).toBe('Deathweed Planter Box');   // 3217 腐化版（style2）
    expect(mapTileHoverName(380, 0, 54)).toBe('Deathweed Planter Box');   // 3218 猩红版（style3）官方同名
    expect(mapTileHoverName(380, 0, 72)).toBe('Blinkroot Planter Box');   // 3219（style4）
    expect(mapTileHoverName(380, 0, 126)).toBe('Fireblossom Planter Box');
  });
});

/** vid → ItemName 内部键（idNames.generated ITEM_NAME_BY_ID 等价最小表——
 *  仅本测 8 件,避免为断言引生产表） */
function itemNameKey(vid: number): string {
  const keys = [
    'DayBloomPlanterBox', 'MoonglowPlanterBox', 'CorruptPlanterBox', 'CrimsonPlanterBox',
    'BlinkrootPlanterBox', 'WaterleafPlanterBox', 'ShiverthornPlanterBox', 'FireBlossomPlanterBox',
  ];
  const idx = PLANTER_VIDS.indexOf(vid as (typeof PLANTER_VIDS)[number]);
  expect(idx, `vid ${vid} 不在种植盆族`).toBeGreaterThanOrEqual(0);
  return keys[idx];
}

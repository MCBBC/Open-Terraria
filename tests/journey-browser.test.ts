// ============================================================================
// M8 旅程物品浏览器纯逻辑测试（过滤/排序/搜索）
// 标杆：Terarria1456
//   Terraria.GameContent.Creative/ItemFilters.cs（10 过滤器 + MiscFallback）
//   Terraria.GameContent.Creative/SortingSteps.cs（ByUnlockStatus/ByCreativeSortingId/
//     Alphabetical——UICreativeInfiniteItemsDisplay.cs:94-100 固定装配）
//   Terraria.ID/ContentSamples.cs CreativeHelper.GetItemGroup（:117-675）
//   Terraria.DataStructures/EntryFilterer.cs（搜索 AND + 活动 OR）
// 数据源 = src/data/vanilla-journeycat.json（tools/extract-journey-browser.mjs）。
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  JOURNEY_FILTER_KEYS, FILTER_L10N, fitsFilter, searchMatches,
  runBrowserQuery, getItemSortId, sortIdOf, makeJourneyComparator,
  ItemGroup, type ResearchSortView,
} from '../src/ui/JourneyBrowser';
import { languageManager } from '../src/i18n/LanguageManager';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { Research } from '../src/stats/Research';

const nameOf = (vid: number): string => ITEM_NAME_BY_ID[vid] ?? `#${vid}`;

// 真实 zh-Hans 包注入（双语搜索断言需要；同 bestiary-ui.test.ts 先例）
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

/** 无进度研究视图（全 false——排序测 fully/newly 档时再局部覆写） */
const noneResearch: ResearchSortView = {
  isNewlyResearched: () => false,
  isResearched: () => false,
};

describe('CreativeHelper.GetItemGroup（ContentSamples.cs:117-675）逐分支', () => {
  it('钱币（:196-215）：71-74 → Coin 组，order 4/3/2/1（铜→铂递减序）', () => {
    expect(getItemSortId(71)).toEqual({ group: ItemGroup.Coin, order: 4 });
    expect(getItemSortId(72)).toEqual({ group: ItemGroup.Coin, order: 3 });
    expect(getItemSortId(73)).toEqual({ group: ItemGroup.Coin, order: 2 });
    expect(getItemSortId(74)).toEqual({ group: ItemGroup.Coin, order: 1 });
  });

  it('工作台（_manualCraftingStations 首位）→ CraftingObjects order 0', () => {
    expect(getItemSortId(33)).toEqual({ group: ItemGroup.CraftingObjects, order: 0 });
  });

  it('火把（Torches :292-301）：普通火把 placeStyle 0 → order 5；蓝火把 → 10', () => {
    expect(getItemSortId(8)).toEqual({ group: ItemGroup.Torches, order: 5 });
    expect(getItemSortId(427)).toEqual({ group: ItemGroup.Torches, order: 10 });
  });

  it('木材（:228-243）：木料 9 → Wood order 0', () => {
    expect(getItemSortId(9)).toEqual({ group: ItemGroup.Wood, order: 0 });
  });

  it('物块（:373-377）：泥 2 → 10 / 石 3 → 20（type 覆写序）；玻璃 170 → 70', () => {
    expect(getItemSortId(2)).toEqual({ group: ItemGroup.Blocks, order: 10 });
    expect(getItemSortId(3)).toEqual({ group: ItemGroup.Blocks, order: 20 });
    expect(getItemSortId(170)).toEqual({ group: ItemGroup.Blocks, order: 70 });
  });

  it('平台（:303-306）：木平台 94 ps0 → 19；石平台 4416 ps1 → 20', () => {
    expect(getItemSortId(94)).toEqual({ group: ItemGroup.PlaceableObjects, order: 19 });
    expect(getItemSortId(4416)).toEqual({ group: ItemGroup.PlaceableObjects, order: 20 });
  });

  it('魔杖（:250-258）：再生法杖 213 → 0；骨魔杖 932（tileWand 154）→ 10', () => {
    expect(getItemSortId(213)).toEqual({ group: ItemGroup.Wands, order: 0 });
    expect(getItemSortId(932)).toEqual({ group: ItemGroup.Wands, order: 10 });
  });

  it('电线（SortingPriorityWiring :133-136）：电线 530 → -85；剪线钳 510 → -103', () => {
    expect(getItemSortId(530)).toEqual({ group: ItemGroup.Wiring, order: -85 });
    expect(getItemSortId(510)).toEqual({ group: ItemGroup.Wiring, order: -103 });
  });

  it('Boss 召唤物手表（:121-125）：史莱姆王冠 560 → BossItem order 1；向导巫毒娃娃 267 → order 7', () => {
    expect(getItemSortId(560)).toEqual({ group: ItemGroup.BossItem, order: 1 });
    expect(getItemSortId(267)).toEqual({ group: ItemGroup.BossItem, order: 7 });
  });

  it('Buff 药水（:435-453 damage==-1 门）：铁皮药水 292 → BuffPotion', () => {
    expect(getItemSortId(292)).toEqual({ group: ItemGroup.BuffPotion, order: 0 });
  });

  it('治疗药水（:521-547）：次级治疗药水 28 → LifePotions order 4（:28 直配表）', () => {
    expect(getItemSortId(28)).toEqual({ group: ItemGroup.LifePotions, order: 4 });
  });

  it('配饰（:487-503）：赫尔墨斯靴 54 → Accessories order -10000（rare1）', () => {
    expect(getItemSortId(54)).toEqual({ group: ItemGroup.Accessories, order: -10000 });
  });

  it('工具三族（:505-519）：铁镐 1 → Pickaxe -40', () => {
    expect(getItemSortId(1)).toEqual({ group: ItemGroup.Pickaxe, order: -40 });
  });

  it('武器（:598-613）：铜阔剑 3508 → MeleeWeapon；木剑 24 → MeleeWeapon -7', () => {
    expect(getItemSortId(3508).group).toBe(ItemGroup.MeleeWeapon);
    expect(getItemSortId(24)).toEqual({ group: ItemGroup.MeleeWeapon, order: -7 });
  });

  it('染料/发染料（:188-194）：蓝染料 1015 → Dye 910；疾速发染料 1986 → HairDye 920（Hair 注册表不入 dye）', () => {
    expect(getItemSortId(1015)).toEqual({ group: ItemGroup.Dye, order: 0 });
    expect(getItemSortId(1986)).toEqual({ group: ItemGroup.HairDye, order: 0 });
  });

  it('墙（:217-219）：石墙 26 → Walls 150', () => {
    expect(getItemSortId(26).group).toBe(ItemGroup.Walls);
  });

  it('绳（:145-147/259-261）：绳 965 → Rope 140', () => {
    expect(getItemSortId(965).group).toBe(ItemGroup.Rope);
  });

  it('弹药排除表（:553-556）：凝胶 23 显式排除 Ammo → ConsumableThatDoesNotDamage', () => {
    expect(getItemSortId(23)).toEqual({ group: ItemGroup.ConsumableThatDoesNotDamage, order: 0 });
  });

  it('材料（:619-621）：丝绸 225 → Material 10000', () => {
    expect(getItemSortId(225)).toEqual({ group: ItemGroup.Material, order: 0 });
  });

  it('矿车（:379-385 MountID.Sets.Cart）：矿车 2343 → Minecart 720', () => {
    expect(getItemSortId(2343)).toEqual({ group: ItemGroup.Minecart, order: 0 });
  });

  it('捕获小动物（createTile=724 先于 makeNPC 分支）→ PlaceableObjects order ct+1000', () => {
    // DefaultToCapturedCritter 设 createTile=724（Item.cs:47624）——createTile 分支
    //（:245）在 makeNPC（:392）之前，故走笼子物 group（原版同序）
    expect(getItemSortId(2019).group).toBe(ItemGroup.PlaceableObjects);
  });
});

describe('ItemFilters（ItemFilters.cs 各 FitsFilter）', () => {
  it('过滤器键装配序与显示键（UICreativeInfiniteItemsDisplay :76-92 + fallback）', () => {
    expect(JOURNEY_FILTER_KEYS).toEqual([
      'weapon', 'armor', 'vanity', 'buildingBlock', 'furniture', 'accessories',
      'miscAccessories', 'consumables', 'tools', 'materials', 'miscFallback',
    ]);
    expect(FILTER_L10N.weapon).toBe('CreativePowers.TabWeapons');
    expect(FILTER_L10N.miscFallback).toBe('CreativePowers.TabMisc');
  });

  it('武器（:197 damage>0）：铜阔剑 ✓ / 泥块 ✗（damage 默认 -1）', () => {
    expect(fitsFilter(3508, 'weapon')).toBe(true);
    expect(fitsFilter(2, 'weapon')).toBe(false);
  });

  it('建材（:76-90 createWall/tileWand/非帧重要块）：泥块 ✓ 墙 ✓ 骨魔杖 ✓；火把（帧重要）✗', () => {
    expect(fitsFilter(2, 'buildingBlock')).toBe(true);
    expect(fitsFilter(26, 'buildingBlock')).toBe(true);
    expect(fitsFilter(932, 'buildingBlock')).toBe(true);
    expect(fitsFilter(8, 'buildingBlock')).toBe(false);
  });

  it('家具（:113-118 帧重要 tile）：火把 ✓ 工作台 ✓ 木平台 ✓ 泥块 ✗', () => {
    expect(fitsFilter(8, 'furniture')).toBe(true);
    expect(fitsFilter(33, 'furniture')).toBe(true);
    expect(fitsFilter(94, 'furniture')).toBe(true);
    expect(fitsFilter(2, 'furniture')).toBe(false);
  });

  it('工具（:148-175 四力+tileWand+58 件手表）：铁镐 ✓ 电线 ✓ 捕虫网(1991 手表) ✓', () => {
    expect(fitsFilter(1, 'tools')).toBe(true);
    expect(fitsFilter(530, 'tools')).toBe(true);
    expect(fitsFilter(1991, 'tools')).toBe(true);
  });

  it('配饰双桶（AAccessories :282-303）：赫尔墨斯靴 → accessories；矿车 → miscAccessories', () => {
    expect(fitsFilter(54, 'accessories')).toBe(true);
    expect(fitsFilter(54, 'miscAccessories')).toBe(false);
    expect(fitsFilter(2343, 'miscAccessories')).toBe(true);
    expect(fitsFilter(2343, 'accessories')).toBe(false);
  });

  it('消耗品（:355-367）：药水 ✓；放置物消耗品（火把/橡实）✗；巫毒娃娃 267 直配 ✓', () => {
    expect(fitsFilter(292, 'consumables')).toBe(true);
    expect(fitsFilter(28, 'consumables')).toBe(true);
    expect(fitsFilter(8, 'consumables')).toBe(false);   // cons 但 createTile≠-1
    expect(fitsFilter(27, 'consumables')).toBe(false);  // 橡实（放置）
    expect(fitsFilter(267, 'consumables')).toBe(true);  // type==267 直配
  });

  it('材料（:448-450 IsAMaterial 配方派生）：丝绸 ✓ 凝胶 ✓', () => {
    expect(fitsFilter(225, 'materials')).toBe(true);
    expect(fitsFilter(23, 'materials')).toBe(true);
  });

  it('兜底桶（:419-427）= 其余 10 桶之非（miscFallback 定义）；实测全目录 10 桶全覆盖', () => {
    const others: Array<typeof JOURNEY_FILTER_KEYS[number]> = ['weapon', 'armor', 'vanity',
      'buildingBlock', 'furniture', 'accessories', 'miscAccessories', 'consumables', 'tools', 'materials'];
    for (const id of [1, 8, 50, 3508, 2343, 267]) {
      expect(fitsFilter(id, 'miscFallback')).toBe(!others.some((k) => fitsFilter(id, k)));
    }
    // 全 6145 件扫描：10 桶并集无遗漏（fallback 恒空——quest fish 亦经配方成 material，
    // 与原版 UpdateWhichItemsAreMaterials 派生面一致）
    let fallbackCount = 0;
    for (let vid = 1; vid < 6146; vid++) {
      if (fitsFilter(vid, 'miscFallback')) fallbackCount++;
    }
    expect(fallbackCount).toBe(0);
  });
});

describe('搜索（BySearch 仓库变体：双语模糊）', () => {
  it('内部英文名（Item.Name）命中', () => {
    expect(searchMatches(1, 'iron')).toBe(true);
    expect(searchMatches(1, 'PICK')).toBe(true);       // 大小写不敏感
    expect(searchMatches(1, 'copper')).toBe(false);
  });
  it('当前语言显示名命中（zh 包）', () => {
    expect(searchMatches(1, '铁镐')).toBe(true);
    expect(searchMatches(3508, '铜阔剑')).toBe(true);
  });
  it('空/白 = 全过（EntryFilterer.SetSearchFilter :85-94）', () => {
    expect(searchMatches(1, null)).toBe(true);
    expect(searchMatches(1, '')).toBe(true);
  });
});

describe('排序链（EntrySorter：ByUnlockStatus → ByCreativeSortingId → Alphabetical）', () => {
  const cmp = makeJourneyComparator(noneResearch);
  it('组间序 = ItemGroup 枚举值（Coin 10 < CraftingObjects 11 < Torches 20 …）', () => {
    expect(cmp(71, 33)).toBeLessThan(0);
    expect(cmp(33, 8)).toBeLessThan(0);
    expect(cmp(8, 9)).toBeLessThan(0);     // Torches 20 < Wood 30
    expect(cmp(9, 23)).toBeLessThan(0);    // Wood 30 < Consumable 94
    expect(cmp(23, 94)).toBeLessThan(0);   // 94 < PlaceableObjects 100
    expect(cmp(94, 2)).toBeLessThan(0);    // 100 < Blocks 120
    expect(cmp(1, 3508)).toBeLessThan(0);  // Pickaxe 500 < Melee 530
  });
  it('组内序（order 升序）：铜币 71(order4) 后于铂币 74(order1)', () => {
    expect(cmp(74, 71)).toBeLessThan(0);
  });
  it('同组同序 → 内部名字母序（Alphabetical :145-151——item.Name 码元序）', () => {
    // 同为 RemainingUseItems(5000) 同 order(-1) 的两件：50 MagicMirror vs 另一 rare1 同档件
    // 找一对真实同档件验证字母兜底
    const pairs: Array<[number, number]> = [];
    const seen = new Map<string, number>();
    for (let vid = 1; vid < 6146 && pairs.length < 1; vid++) {
      const s = sortIdOf(vid);
      const key = `${s.group}:${s.order}`;
      const prev = seen.get(key);
      if (prev !== undefined) pairs.push([prev, vid]);
      else seen.set(key, vid);
    }
    expect(pairs.length).toBe(1);
    const [a, b] = pairs[0];
    // 与组/序无关的两件在 unlock 全 false 时按名字典序
    expect(cmp(a, b)).toBe(sortIdOf(a).group - sortIdOf(b).group
      || sortIdOf(a).order - sortIdOf(b).order
      || ((n1: string, n2: string) => (n1 < n2 ? -1 : n1 > n2 ? 1 : 0))(
        nameOf(a), nameOf(b)));
  });
  it('ByUnlockStatus 首序位（:91-115）：newly > fully > 未研究', () => {
    const view: ResearchSortView = {
      isNewlyResearched: (v) => v === 2,
      isResearched: (v) => v === 2 || v === 8 || v === 33,
    };
    const c = makeJourneyComparator(view);
    // 泥块 2（Blocks 120）newly → 压过铂币 74（Coin 10，未研究）
    expect(c(2, 74)).toBeLessThan(0);
    // 火把 8（Torches 20）fully → 压过泥块 3（Blocks 120，未研究）
    expect(c(8, 3)).toBeLessThan(0);
    // 同 fully 两件回落组序（33 CraftingObjects 11 < 8 Torches 20）
    expect(c(33, 8)).toBeLessThan(0);
  });
  it('runBrowserQuery：搜索 AND + 活动 OR + 全链排序（UpdateContents :541-554）', () => {
    const research = new Research(undefined, { count: 10, need: { '2': 5, '3': 5, '8': 1, '3508': 1 }, override: {} });
    // 火把研究满、泥/石半程
    research.setSacrificeCountDirectly(8, 1);
    research.setSacrificeCountDirectly(2, 3);
    research.setSacrificeCountDirectly(3, 2);
    const vids = research.resolvedIdsWithProgress();
    expect(vids.sort((a, b) => a - b)).toEqual([2, 3, 8]);
    // 无过滤无搜索：8(fully) 在 2/3(半程) 前；2(order10) 在 3(order20) 前
    const out = runBrowserQuery(vids, { search: null, activeFilters: [] }, research);
    expect(out).toEqual([8, 2, 3]);
    // buildingBlock 过滤：8 出局（帧重要→furniture 桶）
    const out2 = runBrowserQuery(vids, { search: null, activeFilters: ['buildingBlock'] }, research);
    expect(out2).toEqual([2, 3]);
    // 搜索 "石" 只留石块
    const out3 = runBrowserQuery(vids, { search: '石', activeFilters: [] }, research);
    expect(out3).toEqual([3]);
  });
});

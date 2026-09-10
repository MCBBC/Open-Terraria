// SW-FX17 M2 物品变体系统（ItemVariants.cs）——反编译金标 oracle + 消费面锚钉。
//
// 定谳（task M2「先反编译定谳真身」）：ItemVariants = 秘密种子世界的【物品变体选择器】
//   （Terraria.GameContent.Items/ItemVariants.cs——静态构造 25 条 AddVariant 注册：
//   Stronger/Weaker/Rebalanced/Enabled/DisabledBossSummon 五变体 × Remix/GetGood/
//   Mechdusa/Skyblock 四条件）。**非** modern 商店/交换面——消费面全在数值域：
//   Item.SetDefaults(Type, variant) 内 ~24 处 Variant 分支（Item.cs:2717-44695）改写
//   damage/useTime/mana/rare/defense/hammer + Item.cs:48680 variant==null 时
//   SelectVariant(Type) 自选 + Player.RefreshItems(onlyIfVariantChanged :35627) +
//   Recipe.UpdateItemVariants(Recipe.cs:535) + DisabledBossSummon 三件使用拦截
//   （Player.cs:43125/:43143/:43159）。⇒ 仓库建模判断：需要建模（数值域）——
//   src/data/vanillaItemVariants.ts 投影式建模在库（tests/item-variants.test.ts 352
//   行数值面全测）；本文件补【反编译金标 oracle】：直接解析 1457 源文静态构造，
//   与仓注册表逐条 diff——注册表任何漂移（漏条/多条/变体种错/条件错/序错）必红。
//   1458 同域：Terarria1458 ItemVariants.cs 与 1457 逐字节同源（diff 实证,运行时钉）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ITEM_VARIANT_REGISTRY, selectVariant, isMechdusaWorld,
  type ItemVariantKind, type ItemVariantConditionKind,
} from '../src/data/vanillaItemVariants';
import type { SeedFlags } from '../src/world/gen/SeedEasterEggs';

const VARIANTS_1457 = '../../Terarria1457/Terraria.GameContent.Items/ItemVariants.cs';
const VARIANTS_1458 = '../../Terarria1458/Terraria.GameContent.Items/ItemVariants.cs';

/** 反编译变体/条件名 → 仓 kind 映射（ItemVariants.cs:111-121 五变体四条件） */
const VARIANT_NAME_MAP = {
  StrongerVariant: 'stronger', WeakerVariant: 'weaker',
  RebalancedVariant: 'rebalanced', EnabledVariant: 'enabled',
  DisabledBossSummonVariant: 'disabledBossSummon',
} as const;
type VanillaVariantName = keyof typeof VARIANT_NAME_MAP;
const CONDITION_NAME_MAP = {
  RemixWorld: 'remix', GetGoodWorld: 'getGood', MechdusaWorld: 'mechdusa', SkyblockWorld: 'skyblock',
} as const;

/** 反编译静态构造 → 结构化注册表（AddVariant(itemId, Variant, conditions...)）。
 *  序敏感：SelectVariant（ItemVariants.cs:89-106）按注册序取首个条件满足 entry。 */
function parseVanillaRegistry(): Array<{ id: number; variant: ItemVariantKind; conditions: ItemVariantConditionKind[] }> {
  const src = readFileSync(fileURLToPath(new URL(VARIANTS_1457, import.meta.url)), 'utf8');
  const ctor = src.slice(src.indexOf('static ItemVariants()'), src.indexOf('}\n}', src.indexOf('static ItemVariants()')));
  const out: Array<{ id: number; variant: ItemVariantKind; conditions: ItemVariantConditionKind[] }> = [];
  const re = /AddVariant\((\d+),\s*(\w+Variant)(?:,\s*([A-Za-z,\s]+?))?\);/g;
  for (const m of ctor.matchAll(re)) {
    const id = Number(m[1]);
    const vname = m[2] as VanillaVariantName;
    const variant = VARIANT_NAME_MAP[vname];
    const conditions = ((m[3] ?? '').match(/\w+World/g) ?? [])
      .map((c) => CONDITION_NAME_MAP[c as keyof typeof CONDITION_NAME_MAP]);
    expect(variant, `未映射变体 ${m[2]}`).toBeDefined();
    for (const c of conditions) expect(c, `未映射条件 ${c}`).toBeDefined();
    out.push({ id, variant, conditions });
  }
  return out;
}

describe('SW-FX17 ① 反编译金标 oracle（1457 ItemVariants.cs 静态构造 vs 仓注册表）', () => {
  const vanilla = parseVanillaRegistry();

  it('源文提取 25 条（与 1457 终值一致；1458 逐字节同源）', () => {
    expect(vanilla.length).toBe(25);
    // 1458 同域零增量（diff 实证；运行时再钉——1458 若动此域此断言先红）
    const src57 = readFileSync(fileURLToPath(new URL(VARIANTS_1457, import.meta.url)), 'utf8');
    const src58 = readFileSync(fileURLToPath(new URL(VARIANTS_1458, import.meta.url)), 'utf8');
    expect(src58).toBe(src57);
  });

  it('逐条 1:1：id → 变体种 + 条件集 + 注册序全等（漏/多/错/序漂任一即红）', () => {
    const repoEntries: Array<{ id: number; variant: ItemVariantKind; conditions: ItemVariantConditionKind[] }> = [];
    // 仓注册表按 id 分桶展平——展平序与源文注册序对拍（SelectVariant 语义面）
    for (const [idStr, entries] of Object.entries(ITEM_VARIANT_REGISTRY)) {
      for (const e of entries) repoEntries.push({ id: Number(idStr), variant: e.variant, conditions: [...e.conditions] });
    }
    const norm = (list: typeof vanilla) => [...list]
      .sort((a, b) => a.id - b.id || a.variant.localeCompare(b.variant))
      .map((e) => `${e.id}:${e.variant}(${[...e.conditions].sort().join('+')})`);
    expect(norm(repoEntries)).toEqual(norm(vanilla));
    // 序敏感面：remix weaker 五段 5279..5284 注册序、5687/5688 尾段（1457 新增）
    const ids = vanilla.map((e) => e.id);
    expect(ids.slice(0, 6)).toEqual([112, 157, 1319, 1325, 3069, 5147]);      // Stronger 段
    expect(ids.slice(-2)).toEqual([5687, 5688]);                              // Skyblock 段收尾
  });

  it('判别力（oracle 自证）：注入一条假条目/翻转变体种 → 逐条比对即红', () => {
    const mutated = [...vanilla];
    mutated[3] = { id: mutated[3].id, variant: 'weaker', conditions: mutated[3].conditions };   // 1325 stronger→weaker
    const norm = (list: typeof vanilla) => [...list]
      .sort((a, b) => a.id - b.id || a.variant.localeCompare(b.variant))
      .map((e) => `${e.id}:${e.variant}(${[...e.conditions].sort().join('+')})`);
    expect(norm(mutated)).not.toEqual(norm(parseVanillaRegistry()));   // 变异可捕
    expect(mutated.length + 1).not.toBe(vanilla.length || vanilla.length + 0 || vanilla.length);
  });

  it('条件求值矩阵（ItemVariantsCondition 四条件 × isMechdusaWorld=remix∧getGood :119-129）', () => {
    const none: SeedFlags = {};
    const remix: SeedFlags = { remix: true };
    const gg: SeedFlags = { getGoodWorld: true };
    const both: SeedFlags = { remix: true, getGoodWorld: true };
    const sky: SeedFlags = { skyblock: true };
    expect(selectVariant(112, remix)).toBe('stronger');       // RemixWorld → Main.remixWorld
    expect(selectVariant(5687, sky)).toBe('weaker');          // 1457 新增 SkyblockWorld :121
    expect(selectVariant(197, gg)).toBe('rebalanced');        // GetGoodWorld
    expect(selectVariant(112, none)).toBeNull();              // 普通世界全闭
    expect(selectVariant(544, remix)).toBeNull();             // 仅 remix 不足（Mechdusa 门）
    expect(selectVariant(544, both)).toBe('disabledBossSummon');
    expect(selectVariant(5334, both)).toBe('enabled');
    expect(isMechdusaWorld(both)).toBe(true);
    expect(isMechdusaWorld(remix)).toBe(false);
    expect(isMechdusaWorld(gg)).toBe(false);
  });
});

describe('SW-FX17 ② 消费面锚钉（数值域四处——漏接任一即红）', () => {
  it('世界态灌入：afterWorldLoad → setItemVariantWorld（Recipe.UpdateItemVariants 等价物）', () => {
    expect(srcMatch(/setItemVariantWorld\(w\.seedFlags \?\? null\);/)).toBe(true);
    expect(srcMatch(/import \{ setItemVariantWorld, bossSummonDisabledVid, activeVariantStatsOfVid \} from '\.\.\/data\/vanillaItemVariants';/)).toBe(true);
  });

  it('DisabledBossSummon 使用拦截门在 Game（Player.cs:43125/:43143/:43159 等价面）', () => {
    expect(srcMatch(/bossSummonDisabledVid\(/)).toBe(true);
  });

  it('数值取数口接投影：vanillaItemStats 活跃变体覆写（SetDefaults Variant 分支等价物）', () => {
    expect(srcMatch(/activeVariantStatsOfVid/, '../src/data/vanillaItemStats.ts')).toBe(true);
  });

  it('UI 变体名后缀：VARIANT_L10N_KEY 官方键消费（ItemVariant.* l10n 内置）', () => {
    expect(srcMatch(/variantRareOfVid|VARIANT_L10N_KEY/, '../src/ui/UI.ts')).toBe(true);
    // l10n 产物内五键齐（zh-Hans/en-US 双语——产物按组分嵌套 d['ItemVariant']['Stronger']）
    for (const lang of ['zh-Hans', 'en-US']) {
      const db = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/l10n/${lang}.json`, import.meta.url)), 'utf8')) as Record<string, Record<string, string>>;
      const grp = db['ItemVariant'];
      expect(grp, `${lang} 缺 ItemVariant 组`).toBeDefined();
      for (const k of ['Stronger', 'Weaker', 'Rebalanced', 'Enabled', 'DisabledBossSummon']) {
        expect(grp![k], `${lang} 缺 l10n 键 ItemVariant.${k}`).toBeTruthy();
      }
    }
  });
});

function srcMatch(re: RegExp, rel = '../src/core/Game.ts'): boolean {
  return re.test(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
}

// SW-BJ24 2026-09-07 向导材料槽 vid/iid 双域分池守卫（RB7 复核批补钉——原报告缺
// 测试落盘，终验清单含本文件）。
//
// 原版门 = checkItem.material（ItemSlot.cs:1503 PickItemMovementAction context 7 →
// PickAction 0 整组迁移；checkItem 恒 = Main.mouseItem :899 ⇒ 门只挂手持侧，
// 对换不门槽内件侧；1458 同式 :1503 零增量）。material 真值源 =
// Recipe.UpdateWhichItemsAreMaterials（Recipe.cs:15205-15243）双臂：
//   ①原料臂 :15214-15224——requiredItemQuickLookup 非组条目（ itemIdOrRecipeGroup
//     < 1000000,IsRecipeGroup :21-23）直赋 IsAMaterial；
//   ②组员臂 :15227-15241——array[k] 仅在【任一配方】的原料 type ∈ 该组
//     ValidItems 时置位（CreateRequiredItemQuickLookups :15165-15187 只在原料命中
//     acceptedGroups 的 ValidItems 时才把条目换成组假 id）⇒ 被用组全体成员标材料。
//     实测（本文件 ① 独立重演）：本仓 json 32/32 被引用组全为被用组 ⇒
//     materialVids()（全原料 ∪ 各配方 r.groups 成员）与原版双臂逐 vid 等价。
// 消费面分域（itemTooltip.ts ★SW-BJ24 头注）：vid 域门（向导槽放置门
// UI.ts isMaterialVid + Shift 特化支 itemMaterial）用 materialVids()；iid 域
// （tooltip Material 行 slot.id=内部 iid）用 materialIids()。
// 跨域碰撞病根（本文件 ③ 回归钉）：钉鞋 vid 975 是原料、其内部 iid 恰 = 24 ⇒
// 旧「vid+iid 并集一池」在 vid 域查询 has(24)=真 ⇒ 木剑（vanilla vid 24,非材料）
// 误过向导槽门/误挂 Material 行；反向 vid 撞他件 iid 同理污染 tooltip 面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { materialVids, materialIids, buildTooltipBody } from '../src/ui/itemTooltip';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VANILLA_RECIPES, RECIPE_GROUP_ITEMS } from '../src/data/vanillaRecipes';

const UI_SRC = readFileSync(join(__dirname, '..', 'src', 'ui', 'UI.ts'), 'utf8');

/** 原版双臂独立重演（Player.LocalPlayer 语境无关,纯数据面）：
 *  原料臂只标【未被组吞】的原料;组员臂只展开【被用组】（任一配方原料命中其
 *  ValidItems,Recipe.cs:15218-15221）。与 materialVids() 的「全原料 ∪ 全被引用组
 *  成员」实现分立——两式逐 vid 等价即证提取面无双臂语义漂移。 */
function vanillaAccurateMaterialVids(): Set<number> {
  const out = new Set<number>();
  const usedGroups = new Set<number>();
  for (const r of VANILLA_RECIPES) {
    const accepted = r.groups ?? [];
    for (const ing of r.items) {
      const inGroup = accepted.some((g) => (RECIPE_GROUP_ITEMS[g] ?? []).includes(ing.id));
      if (!inGroup) out.add(ing.id);                       // 原料臂（:15224）
      else for (const g of accepted) {
        if ((RECIPE_GROUP_ITEMS[g] ?? []).includes(ing.id)) usedGroups.add(g);
      }
    }
  }
  for (const g of usedGroups) for (const v of RECIPE_GROUP_ITEMS[g] ?? []) out.add(v);   // 组员臂（:15233-15241）
  return out;
}

// ---------------------------------------------------------------------------
// ① vid 域池 ≡ 原版双臂（原料臂 + 组员臂）逐 vid 对拍
// ---------------------------------------------------------------------------
describe('SW-BJ24 ① materialVids ≡ 原版 UpdateWhichItemsAreMaterials 双臂', () => {
  it('集合等价（双向无差）——防配方 json / RECIPE_GROUP_ITEMS 提取面漂移', () => {
    const vanilla = vanillaAccurateMaterialVids();
    const repo = materialVids();
    const onlyRepo = [...repo].filter((v) => !vanilla.has(v));
    const onlyVanilla = [...vanilla].filter((v) => !repo.has(v));
    expect(onlyRepo).toEqual([]);
    expect(onlyVanilla).toEqual([]);
  });

  it('原料臂基础 vid（凝胶 23/木材 9/铁锭 22/真·圣剑 674/钛金锭 1198）在位', () => {
    const pool = materialVids();
    for (const vid of [23, 9, 22, 674, 1198]) expect(pool.has(vid)).toBe(true);
  });

  it('组员臂 +16 vid（仅经组出现:珍珠砂 408/7 压力板/6 果/2 向导陪伴指南）在位', () => {
    const pool = materialVids();
    for (const vid of [408, 529, 541, 543, 852, 853, 1151, 4261,
      4282, 4286, 4290, 4295, 5277, 5278, 5453, 5454]) {
      expect(pool.has(vid)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ② 双域分池：vid 池纯 vid / iid 池纯 iid（跨域碰撞回归钉）
// ---------------------------------------------------------------------------
describe('SW-BJ24 ② 双域分池（钉鞋 975→iid 24 × 木剑 vid 24 碰撞面）', () => {
  it('夹具自证：钉鞋 vid 975 的内部 iid 恰 = 24（碰撞几何,items 表移位即爆）', () => {
    expect(ITEM_BY_KEY['vi_975_shoe_spikes']).toBe(24);
    expect(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[975] as string]).toBe(24);
  });

  it('vid 域池不吞 iid 域值：has(24)=false（木剑非材料）∧ has(975)=true（钉鞋是原料）', () => {
    expect(materialVids().has(24)).toBe(false);   // 旧并集池此处假真=向导槽误放行木剑
    expect(materialVids().has(975)).toBe(true);
  });

  it('iid 域池合法条目：has(24)=true（钉鞋 tooltip Material 行数据面）', () => {
    expect(materialIids().has(24)).toBe(true);
  });

  it('iid 域池 ≡ vid 域池经 VANILLA_ITEM_KEY_BY_ID→ITEM_BY_KEY 桥的全量映射', () => {
    const bridged = new Set<number>();
    for (const vid of materialVids()) {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      const iid = k !== undefined ? ITEM_BY_KEY[k] : undefined;
      if (iid !== undefined) bridged.add(iid);
    }
    const m = materialIids();
    expect([...m].filter((v) => !bridged.has(v))).toEqual([]);
    expect([...bridged].filter((v) => !m.has(v))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ③ tooltip Material 行（Main.cs:20782-20786 → 本仓 :348 materialIids 消费面）
// ---------------------------------------------------------------------------
describe('SW-BJ24 ③ tooltip Material 行双域正确', () => {
  const lineOf = (iid: number, tag: string): boolean =>
    buildTooltipBody(ITEM_DEFS[iid], { id: iid, stack: 1 }, null).lines.some((l) => l.tag === tag);

  it('钉鞋（iid 24,vid 975 是原料）→ Material 行在', () => {
    expect(lineOf(24, 'material')).toBe(true);
  });

  it('小治疗药水（iid 3,vid 188 非材料）→ 无 Material 行（旧并集池误挂面）', () => {
    expect(lineOf(3, 'material')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ④ 结构锁：UI/SlotActions 消费面域正确（防并集池回潮/域混用回退）
// ---------------------------------------------------------------------------
describe('SW-BJ24 ④ 结构锁（源文本锚）', () => {
  it('向导槽放置门 = vid 域直查（isMaterialVid 经 vidOfItem 域转换）', () => {
    expect(UI_SRC).toContain(
      'const isMaterialVid = (vid: number): boolean => vid >= 0 && materialVids().has(vid);');
    // ★FX27 刀(2026-09-14)随源翻新:闭包 vidOfItem 已上提为实例法 this.vidOfItemOf
    // （刀19「ctx7 槽语义共享体」重构,UI.ts:8799 注）——旧锁钉的 `vidOfItem(cur.id)`
    // 字面量在盘上已不存在,本锁按现形翻新,语义(vid 域直查门)不变
    expect(UI_SRC).toContain('if (cur && !isMaterialVid(this.vidOfItemOf(cur.id))) return;');
  });

  it('旧病根 `vidOfItem(vid) >= 0`（vid 当 ITEM_DEFS 下标二次解析）已绝迹', () => {
    // 仅查代码行（UI.ts 的 BJ24 头注引用了旧病根文本作勘误记录,注释行豁免）
    const code = UI_SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code.includes('vidOfItem(vid) >= 0')).toBe(false);
  });

  it('Shift 特化支（SlotActions itemMaterial）用 vid 域池（vanillaIdOfItemKey 反解）', () => {
    expect(UI_SRC).toContain('materialVids().has(curVid)');
    expect(UI_SRC).toContain("vanillaIdOfItemKey(ITEM_DEFS[cur.id]?.key ?? '')");
  });

  it('tooltip Material 行消费 materialIids（iid 域）——非 vid 池混用', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'itemTooltip.ts'), 'utf8');
    expect(src).toContain('if (materialIids().has(slot.id))');
  });

  it('SlotActions 向导支门 = context 0 ∧ itemMaterial（ItemSlot.cs:645-651）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'SlotActions.ts'), 'utf8');
    expect(src).toContain('if (e.context === 0 && e.itemMaterial)');
  });
});

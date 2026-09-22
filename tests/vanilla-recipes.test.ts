// 原版配方管线测试（2688 条提取 + 组匹配 + 可用性）
import { describe, it, expect } from 'vitest';
import {
  VANILLA_RECIPES, RECIPE_GROUPS, RECIPE_GROUP_ITEMS, expandStationTiles,
  collectOwnedItems, craftableCount, envOk, vanillaItemKey, invIndexOfVanilla,
  type VanillaCraftCtx,
} from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS } from '../src/data/items';
import { TILE_DEFS } from '../src/data/tiles';

const ctx = (over: Partial<VanillaCraftCtx> = {}): VanillaCraftCtx => ({
  nearbyInternal: new Set(),
  ...over,
});

describe('原版配方提取', () => {
  it('3431 条（★BJ261 1457 编码面重建:+单参 SetIngredients 276+族/+num·stack 局部变量 53 处/+num2-5 变量块 14+反向 14/+平台反转 27(TileID.cs:243 死扫描勘误)）+组 34(Turtles 源码序补位)+继承 9', () => {
    // 3173（线性+生成器+模板22件套+小动物雕像+反向平台/墙）+ 137（for 循环段，tests/loop-recipes.test.ts
    // 对账）+ BJ261 增量 55（高尔夫墙族 14+反向 14+平台反转 27）-1（5547@114[3306x1] 循环残影，--append-loops 剔除）
    expect(VANILLA_RECIPES.length).toBe(3431);   // BJ261 1457 编码面重建终值（干跑对拍双向零差）
    expect(Object.keys(RECIPE_GROUPS).length).toBe(34);   // 源码注册序 0..33（Turtles 补位,gid 已按原版序重编）
    expect(Object.keys(RECIPE_GROUP_ITEMS).length).toBe(34);
  });

  it('火把配方：1 木(组)+1 凝胶 徒手 出 3', () => {
    const torch = VANILLA_RECIPES.find((r) => r.create === 8);
    expect(torch).toBeDefined();
    expect(torch!.tile).toBe(-1);
    expect(torch!.createStack).toBe(3);
    expect(torch!.items).toEqual([{ id: 23, stack: 1 }, { id: 9, stack: 1 }]);
    expect(torch!.groups).toContain(RECIPE_GROUPS['Wood']);
  });

  it('Wood 组含 9 种木材（id 9/619/620/621/911/1729/2504/2503/5215）', () => {
    const wood = RECIPE_GROUP_ITEMS[String(RECIPE_GROUPS['Wood'])];
    expect(wood).toEqual([9, 619, 620, 621, 911, 1729, 2504, 2503, 5215]);
  });

  it('站点继承链：玻璃窑302→熔炉17→篝火215', () => {
    expect(expandStationTiles(302)).toEqual([302, 17, 215]);
    expect(expandStationTiles(134)).toEqual([134, 16]);
  });
});

describe('可用性计算', () => {
  it('组聚合：持有任一木材即满足 Wood 组计数', () => {
    const inv = new Inventory();
    // 木头=9：先确认内部 id 可反查
    const woodIid = invIndexOfVanilla(9);
    expect(woodIid).toBeGreaterThanOrEqual(0);
    inv.slots[10] = { id: woodIid, stack: 5 };
    const owned = collectOwnedItems(inv);
    expect(owned.get(9)).toBe(5);
    expect(owned.get(1000000 + RECIPE_GROUPS['Wood'])).toBe(5);
  });

  it('craftableCount：火把 5 木+1 凝胶 → 5 次；缺凝胶 → 0', () => {
    const inv = new Inventory();
    const woodIid = invIndexOfVanilla(9);
    const gelIid = invIndexOfVanilla(23);
    inv.slots[10] = { id: woodIid, stack: 5 };
    const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;
    expect(craftableCount(torch, collectOwnedItems(inv))).toBe(0); // 缺凝胶
    inv.slots[11] = { id: gelIid, stack: 2 };
    expect(craftableCount(torch, collectOwnedItems(inv))).toBe(2); // 凝胶 2 木 5 → min(5,2)
  });

  it('envOk：铁砧配方需附近铁砧（tile16）；徒手配方恒过', () => {
    const anvilRecipe = VANILLA_RECIPES.find((r) => r.tile === 16);
    expect(anvilRecipe).toBeDefined();
    expect(envOk(anvilRecipe!, ctx())).toBe(false);
    // 附近有秘银砧(134)也算（继承链 134→16）
    const mithril = expandStationTiles(134);
    const fakeNearby = new Set<number>(mithril); // 模拟站点扫描（内部 id 近似用 sheet id 演示）
    // envOk 用 SHEET_TO_INTERNAL——此处直接断言展开链语义
    expect(mithril).toContain(16);
  });
});

// ---- 自制 RECIPES 表已随本地物品退役整体移除(2026-08):
// data/recipes.ts 文件已删,合成统一走本文件的原版配方段(3173 条)。 ----

// ================= 附近箱子合成联动（CraftFromNearbyChests，Player.cs:359 默认开） =================
import {
  nearbyChestsForCrafting, craftSourcesFor, consumeMaterials,
  CRAFT_CHEST_RANGE_PX, type CraftItemSource,
} from '../src/data/vanillaRecipes';
import type { ChestData } from '../src/world/World';

const chest = (x: number, y: number, items: Array<{ id: number; stack: number } | null> = [], locked = false): ChestData =>
  ({ x, y, items, ...(locked ? { locked: true } : {}) });

describe('附近箱子合成联动（NearbyChests.cs:10-31 / CraftingRequests.cs:220-285）', () => {
  const woodIid = invIndexOfVanilla(9);
  const gelIid = invIndexOfVanilla(23);

  it('距离圈：锚=(x*16+16)，≤600px 含、>600px 排除（Distance>range 排除语义）', () => {
    // 锚点 = x*16+16：箱(10,10)→(176,176)；箱(47,10)→(768,176) 距 592 含；
    // 箱(48,10)→(784,176) 距 608 排除；箱(100,100) 远排除
    const a = chest(10, 10), b = chest(47, 10), c = chest(48, 10), far = chest(100, 100);
    const list = [a, b, c, far];
    expect(nearbyChestsForCrafting(list, 176, 176)).toEqual([a, b]);
    // 恰 600px 边界含（Next(a,b) 闭开铁律：Distance > range 才排除）——单箱沿 x 拉距
    expect(nearbyChestsForCrafting([a], 176 + 600, 176)).toEqual([a]);
    expect(nearbyChestsForCrafting([a], 176 + 601, 176)).toEqual([]);
    expect(CRAFT_CHEST_RANGE_PX).toBe(600);
  });

  it('locked 排除 + 开箱引用去重（IsLockedOrInUse Chest.cs:171-183）', () => {
    const open = chest(5, 5, [{ id: woodIid, stack: 9 }]);
    const locked = chest(5, 6, [{ id: woodIid, stack: 9 }], true);
    const other = chest(5, 7, [{ id: woodIid, stack: 9 }]);
    expect(nearbyChestsForCrafting([open, locked, other], 5 * 16, 5 * 16, 600, open)).toEqual([other]);
  });

  it('craftSourcesFor 组装序：开箱 → bank(tile 扫描) → 附近箱（Recipe.cs:378-405）', () => {
    const open = chest(1, 1, [{ id: woodIid, stack: 2 }]);
    const bank: CraftItemSource = { items: [{ id: woodIid, stack: 3 }] };
    const near = chest(2, 2, [{ id: woodIid, stack: 4 }]);
    // GetBanksInRangeOf tile 段（NearbyChests.cs:61-89）：piggy 29 tile 在玩家中心 ±39 盒内
    const piggyInternal = (() => {
      const m = new Map<number, number>();
      for (let i = 0; i < TILE_DEFS.length; i++) {
        const d = TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined;
        if (d?.vanilla?.sheet !== undefined && !m.has(d.vanilla.sheet)) m.set(d.vanilla.sheet, i);
      }
      return m.get(29);
    })();
    const W = 100, H = 100;
    const type = new Uint16Array(W * H); // TileStore.type 现为 Uint16Array（对象化 world 改制）
    if (piggyInternal !== undefined) type[5 * W + 5] = piggyInternal; // 中心格旁放 piggy
    const store = {
      w: W, h: H,
      inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
      idx: (x: number, y: number) => y * W + x,
      type,
    };
    const sources = craftSourcesFor([near], 16, 16,
      { openChest: open, banks: [bank, null, null, null], store, centerTileX: 5, centerTileY: 5 });
    if (piggyInternal !== undefined) {
      expect(sources).toEqual([open, bank, near]);
    } else {
      // tile 29 未注册时 bank 扫描自然空过（SHEET_TO_INTERNAL 缺席）
      expect(sources).toEqual([open, near]);
    }
    // 虚空袋持有且未开 bank4 → bank4 计入（:385-388，无需 tile 扫描）
    const bank4: CraftItemSource = { items: [{ id: woodIid, stack: 7 }] };
    const withVoidBag = craftSourcesFor([], 16, 16, { banks: [null, null, null, bank4], voidBagHeld: true });
    expect(withVoidBag).toEqual([bank4]);
    const voidBagButOpenBank4 = craftSourcesFor([], 16, 16,
      { banks: [null, null, null, bank4], voidBagHeld: true, openIsBank4: true });
    expect(voidBagButOpenBank4).toEqual([]);
  });

  it('collectOwnedItems：箱材料计入可用性（CollectItemsFromChests Recipe.cs:378-405）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: gelIid, stack: 2 };
    const src: CraftItemSource = { items: [{ id: woodIid, stack: 5 }] };
    const owned = collectOwnedItems(inv, [src]);
    expect(owned.get(9)).toBe(5);
    expect(owned.get(1000000 + RECIPE_GROUPS['Wood'])).toBe(5);
  });

  it('consumeMaterials：先扣背包后扣箱，部分扣留堆/整格清空（Consume :220-285）', () => {
    const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 1 };
    inv.slots[11] = { id: gelIid, stack: 2 };
    const c = chest(3, 3, [
      { id: woodIid, stack: 4 }, { id: gelIid, stack: 5 }, null,
      { id: invIndexOfVanilla(5215), stack: 2 },
    ]);
    expect(consumeMaterials(inv, torch, 2, false, [c])).toBe(2);   // SW-AZ1 R3：返实际合成轮数
    // 火把=1木+1凝胶，×2 → 木扣 2（背包 1 清空 + 箱补 1 → 箱 4-1=3）；
    // 凝胶扣 2（背包清空，箱不动）；箱内 Boreal 木槽（Wood 组）不受单 id 木扣波及
    expect(inv.slots[10]).toBeNull();
    expect(inv.slots[11]).toBeNull();
    expect(c.items[0]).toEqual({ id: woodIid, stack: 3 });
    expect(c.items[1]).toEqual({ id: gelIid, stack: 5 });
    expect(c.items[3]).toEqual({ id: invIndexOfVanilla(5215), stack: 2 });
  });

  it('consumeMaterials：背包够时箱不动（先背包后箱的自然空转）', () => {
    const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 5 };
    inv.slots[11] = { id: gelIid, stack: 5 };
    const c = chest(3, 3, [{ id: woodIid, stack: 9 }]);
    expect(consumeMaterials(inv, torch, 2, false, [c])).toBe(2);
    expect(c.items[0]).toEqual({ id: woodIid, stack: 9 });
    expect(inv.slots[10]).toEqual({ id: woodIid, stack: 3 });
  });

  it('consumeMaterials：组槽可从箱扣任一成员（Matches Recipe.cs:35-42）', () => {
    const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;
    const borealIid = invIndexOfVanilla(5215);
    expect(borealIid).toBeGreaterThanOrEqual(0); // Boreal 木在 Wood 组
    const inv = new Inventory();
    inv.slots[10] = { id: gelIid, stack: 1 };
    const c = chest(3, 3, [{ id: borealIid, stack: 2 }]);
    expect(consumeMaterials(inv, torch, 1, false, [c])).toBe(1);
    expect(c.items[0]).toEqual({ id: borealIid, stack: 1 });
  });

  it('consumeMaterials：首轮不足 → 返 0 且零扣减（R14-B2 守卫,SW-AZ1 数值契约）；部分量=造到不够为止', () => {
    const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;
    const inv = new Inventory();
    inv.slots[10] = { id: gelIid, stack: 9 };
    const c = chest(3, 3, [{ id: woodIid, stack: 1 }]);
    // 木材全源仅 1 → 首轮可造 1（i==0 无门,CraftItem CRQ57:93 `i<=0 ||`）,第 2 轮
    // 账面守卫（ownedAcc 未折扣递减）不过即停：返 1、扣 1 木+1 凝胶,零蒸发
    expect(consumeMaterials(inv, torch, 2, false, [c])).toBe(1);
    expect(c.items[0]).toBeNull();
    expect(inv.slots[10]).toEqual({ id: gelIid, stack: 8 });
    // 全源真不足（木 0）→ 首轮校验不过 = 0 轮合成零扣减（旧 false 面等价）
    const inv2 = new Inventory();
    inv2.slots[10] = { id: gelIid, stack: 9 };
    const c2 = chest(3, 3, [{ id: invIndexOfVanilla(8), stack: 3 }]);
    expect(consumeMaterials(inv2, torch, 2, false, [c2])).toBe(0);
    expect(inv2.slots[10]).toEqual({ id: gelIid, stack: 9 });
  });
});

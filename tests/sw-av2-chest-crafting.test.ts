// SW-AV2 2026-09-06：宝箱邻近参与制作 + 放置/使用源门 1:1 钉面
//
// 原版权威（Terarria1457，1458 diff 本域零变更：NearbyChests/Recipe/Chest/CraftingRequests 四文件逐一 diff 全同）：
//   Recipe.CollectItemsToCraftWithFrom   Recipe.cs:366-373 —— 材料 = 背包 58 槽 + 箱/bank（CollectItemsFromChests :375-407）
//   Recipe.CollectItemsFromChests        Recipe.cs:375-407 —— ①开箱容器(:378-381) ②虚空袋 bank4(:382-385,门 :382 chest!=-5)
//                                                            ③CraftFromNearbyChests 开时：附近 bank(盒) + 附近世界箱(600px 圈)
//   Player.Settings.CraftFromNearbyChests Player.cs:355 —— 默认 true
//   NearbyChests.GetChestsInRangeOf      NearbyChests.cs:10-31 —— 箱锚 (x*16+16,y*16+16)，与玩家 position 欧氏距离 ≤600
//   NearbyChests.GetBanksInRangeOf       NearbyChests.cs:33-91 —— num=(int)(600/16+2)=39，玩家中心格 ±39 的 79×79 盒；
//                                            tile 29 存钱罐→bank / 97 保险箱→bank2 / 463 守护者熔炉→bank3 / 491 虚空vault→bank4
//   NearbyChests.ContainerIndexToPlayerBank NearbyChests.cs:105-134 —— case -5：背包持 5325(ClosedVoidBag) → bank4 不计
//   Chest.IsLockedOrInUse                Chest.cs:172-183 —— locked 或被任一玩家开着 → 排除（单人=当前开箱，由首入列+去重覆盖）
//   Recipe.CollectItems                  Recipe.cs:418-433 —— 只看 stack>0：收藏物(favorited)照计；槽 0-57（不含 58 垃圾/光标镜像）
//   Recipe.GetAvailableItemCount         Recipe.cs:313-320 —— UI 材料统计取聚合表（含箱）→ availableItemCountFor 等价
//   CraftingRequests.Consume             CraftingRequests.cs:223-238 —— 扣料先背包(58 槽)后箱、按 _recipeChests 序
//   Recipe.AddFakeCountsForItemGroups    Recipe.cs:409-416 —— 组假 id 聚合在全部源收集之后
//
// 使用源门（第 2 问）裁决：直接使用/放置 = HeldItem = inventory[selectedItem]（Player.cs:3835-3837），
// 用户选槽通道全钳 0-9（数字键 Player.cs:25289-25328 / 滚轮 ClampHotbarOffset :32134-32145 /
// 热栏点击 Main.cs:44336-44359 循环 i<10）；≥10 选中仅瞬态覆盖（Shift 智选 :17588 扫 0-49、
// 光标镜像槽 58 PickItemSelectionOverride :17528-17532、AFK 风筝）——背包 10-49 不能被直接选中使用=原版本相。
import { describe, it, expect } from 'vitest';
import {
  craftSourcesFor, nearbyChestsForCrafting, collectOwnedItems, craftableCount,
  consumeMaterials, availableItemCountFor, VANILLA_RECIPES, RECIPE_GROUPS,
  invIndexOfVanilla, type CraftItemSource,
} from '../src/data/vanillaRecipes';
import type { ChestData } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { SmartSelect, EMPTY_SLOT, type SmartSelectEnv, type SmartSelectHost, type SmartSelectSlot } from '../src/player/SmartSelect';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const woodIid = invIndexOfVanilla(9);      // Wood 组代表（原版 id 9）
const gelIid = invIndexOfVanilla(23);      // 凝胶
const borealIid = invIndexOfVanilla(5215); // 北地木（Wood 组成员）
const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;          // 火把：组木+凝胶 徒手
const workbench = VANILLA_RECIPES.find((r) => r.create === 36 && r.tile === -1)!; // 工作台（vi_36）：木×10 徒手
const WOOD_GID = 1000000 + RECIPE_GROUPS['Wood'];

const chest = (x: number, y: number, items: ChestData['items'] = [], extra: Partial<ChestData> = {}): ChestData =>
  ({ x, y, items, ...extra });

const bank4 = (items: ChestData['items']): CraftItemSource[] => {
  const b: Array<CraftItemSource | null> = [null, null, null, { items }];
  return b as unknown as CraftItemSource[];
};

describe('SW-AV2 邻近箱参与制作：600px 圈几何（GetChestsInRangeOf）', () => {
  it('箱锚 = (x*16+16, y*16+16)：x=36 收（592.2px ≤600）、x=37 排（608.2px >600）', () => {
    const inChest = chest(36, 0, [{ id: woodIid, stack: 1 }]);
    const outChest = chest(37, 0, [{ id: woodIid, stack: 1 }]);
    const hit = nearbyChestsForCrafting([inChest, outChest], 0, 0);
    expect(hit).toEqual([inChest]);
  });

  it('locked 排除（IsLockedOrInUse）；未锁的不同位置箱全计（原版扫全部 chest 槽,类型无关）', () => {
    const a = chest(10, 0, [{ id: woodIid, stack: 2 }]);
    const b = chest(0, 10, [{ id: woodIid, stack: 3 }]);
    const locked = chest(5, 5, [{ id: woodIid, stack: 99 }], { locked: true });
    const hit = nearbyChestsForCrafting([a, locked, b], 0, 0);
    expect(hit).toEqual([a, b]);
  });

  it('当前开箱恒入列（任距离,Recipe.cs:378-381）且范围扫描按引用去重不双计', () => {
    const openFar = chest(600, 0, [{ id: woodIid, stack: 1 }]);   // 600*16+16=9616px 远超圈
    const near = chest(10, 0, [{ id: woodIid, stack: 2 }]);
    const src = craftSourcesFor([openFar, near], 0, 0, { openChest: openFar });
    expect(src[0]).toBe(openFar);                 // 开箱首位、无距离门
    expect(src.some((s) => s === (near as unknown as CraftItemSource))).toBe(true);
    expect(src.filter((s) => s.items === openFar.items).length).toBe(1);
  });
});

describe('SW-AV2 邻近 bank 盒判定（GetBanksInRangeOf）', () => {
  /** 玩家中心格 (100,100)，num=39 → 盒 j∈[61,139] */
  const storeWith = (tx: number, ty: number): TileStore => {
    const st = new TileStore(300, 300);
    st.setTile(tx, ty, TILE_BY_KEY['v_29_piggy_bank']);   // sheet 29 → bank
    return st;
  };

  it('tile 29 存钱罐：盒左缘 61 收 / 60 排（num = trunc(600/16+2) = 39）', () => {
    const banks = [{ items: [{ id: woodIid, stack: 40 } as never] }] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const on = craftSourcesFor([], 0, 0, {
      store: storeWith(61, 100), centerTileX: 100, centerTileY: 100, banks,
    });
    const off = craftSourcesFor([], 0, 0, {
      store: storeWith(60, 100), centerTileX: 100, centerTileY: 100, banks,
    });
    expect(on.some((s) => s.items === (banks[0] as CraftItemSource).items)).toBe(true);
    expect(off.some((s) => s.items === (banks[0] as CraftItemSource).items)).toBe(false);
  });

  it('四类 bank tile 映射（29/97/463/491 → bank..bank4）：vault 命中 banks[3]', () => {
    const st = new TileStore(300, 300);
    st.setTile(100, 100, TILE_BY_KEY['v_491_void_vault']);
    st.setTile(100, 101, TILE_BY_KEY['v_97_safe']);
    st.setTile(101, 100, TILE_BY_KEY['v_463_defenders_forge']);
    const items2 = [{ id: woodIid, stack: 1 } as never];
    const items3 = [{ id: woodIid, stack: 2 } as never];
    const items4 = [{ id: woodIid, stack: 4 } as never];
    const banks = [
      null, { items: items2 }, { items: items3 }, { items: items4 },
    ] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const src = craftSourcesFor([], 0, 0, { store: st, centerTileX: 100, centerTileY: 100, banks });
    expect(src.some((s) => s.items === items2)).toBe(true);
    expect(src.some((s) => s.items === items3)).toBe(true);
    expect(src.some((s) => s.items === items4)).toBe(true);
  });

  it('背包持 ClosedVoidBag 5325 → 放置 vault 的 bank4 不计（ContainerIndexToPlayerBank :119-130）', () => {
    const st = new TileStore(300, 300);
    st.setTile(100, 100, TILE_BY_KEY['v_491_void_vault']);
    const items4 = [{ id: woodIid, stack: 4 } as never];
    const banks = [null, null, null, { items: items4 }] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const blocked = craftSourcesFor([], 0, 0, { store: st, centerTileX: 100, centerTileY: 100, banks, voidVaultHeld: true });
    const allowed = craftSourcesFor([], 0, 0, { store: st, centerTileX: 100, centerTileY: 100, banks, voidVaultHeld: false });
    expect(blocked.some((s) => s.items === items4)).toBe(false);
    expect(allowed.some((s) => s.items === items4)).toBe(true);
  });
});

describe('SW-AV2 去重与虚空袋门（白嫖窗口回归）', () => {
  it('开中的 placed bank 与盒扫描同一 items 数组 → 只计一次（旧按包装对象判重失手=计双份）', () => {
    const st = new TileStore(300, 300);
    st.setTile(100, 100, TILE_BY_KEY['v_29_piggy_bank']);
    const bankArr = [{ id: woodIid, stack: 40 } as never];
    const openPanel = { x: -2, y: 0, items: bankArr };   // 开箱容器（placed piggy 面板）
    const banks = [{ items: bankArr }] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const src = craftSourcesFor([], 0, 0, {
      openChest: openPanel, store: st, centerTileX: 100, centerTileY: 100, banks,
    });
    expect(src.filter((s) => s.items === bankArr).length).toBe(1);
    const inv = new Inventory();
    const owned = collectOwnedItems(inv, src);
    expect(owned.get(9)).toBe(40);   // 双计则 80
  });

  it('虚空袋门 chest==-5：vault 面板开着时 bank4 不再经虚空袋支重复入列（Recipe.cs:382）', () => {
    const bankArr = [{ id: woodIid, stack: 9 } as never];
    const banks = [null, null, null, { items: bankArr }] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const vaultPanel = { x: -5, y: 0, items: bankArr };
    const src = craftSourcesFor([], 0, 0, { openChest: vaultPanel, voidBagHeld: true, banks });
    expect(src.filter((s) => s.items === bankArr).length).toBe(1);
  });

  it('虚空袋门 chest!=-5：开存钱罐时虚空袋 bank4 正常入列一次', () => {
    const piggy = [{ id: woodIid, stack: 1 } as never];
    const bag = [{ id: woodIid, stack: 2 } as never];
    const banks = [
      { items: piggy }, null, null, { items: bag },
    ] as unknown as ReadonlyArray<CraftItemSource | null | undefined>;
    const piggyPanel = { x: -2, y: 0, items: piggy };
    const src = craftSourcesFor([], 0, 0, { openChest: piggyPanel, voidBagHeld: true, banks });
    expect(src.filter((s) => s.items === piggy).length).toBe(1);
    expect(src.filter((s) => s.items === bag).length).toBe(1);
  });
});

describe('SW-AV2 材料统计聚合（CollectItems + 组假 id）', () => {
  it('背包 0-57 槽 + 箱/bank 全聚合；收藏物照计（CollectItems :418-433 只看 stack>0）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 5 };
    inv.slots[11] = { id: gelIid, stack: 3, favorited: true };
    const src: CraftItemSource[] = [{ items: [{ id: woodIid, stack: 7 } as never] }];
    const owned = collectOwnedItems(inv, src);
    expect(owned.get(9)).toBe(12);
    expect(owned.get(23)).toBe(3);
  });

  it('组假 id 聚合跨源（AddFakeCountsForItemGroups :409-416 在箱聚合之后）：箱内北地木计入 Wood 组', () => {
    const inv = new Inventory();
    const src: CraftItemSource[] = [{ items: [{ id: borealIid, stack: 7 } as never] }];
    const owned = collectOwnedItems(inv, src);
    expect(owned.get(5215)).toBe(7);
    expect(owned.get(WOOD_GID)).toBe(7);
    expect(availableItemCountFor(torch, 9, owned)).toBe(7);   // 组槽按组假 id 取数
  });

  it('GetAvailableItemCount 等价：组槽/单槽两态；箱料使 UI 行统计补齐（用户实报根因面）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 4 };
    const src: CraftItemSource[] = [{ items: [{ id: woodIid, stack: 6 } as never] }];
    const owned = collectOwnedItems(inv, src);
    expect(availableItemCountFor(workbench, 9, owned)).toBe(10);
    expect(availableItemCountFor(workbench, 9, collectOwnedItems(inv))).toBe(4);   // 无源=仅背包
  });
});

describe('SW-AV2 可合成判定与扣料（跨源）', () => {
  it('craftableCount：背包+箱合计过门槛；任一材料全源不足 → 0', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 4 };
    const src: CraftItemSource[] = [{ items: [{ id: woodIid, stack: 6 } as never] }];
    expect(craftableCount(workbench, collectOwnedItems(inv, src))).toBe(1);
    inv.slots[10] = { id: woodIid, stack: 3 };
    expect(craftableCount(workbench, collectOwnedItems(inv, src))).toBe(0);
  });

  it('consumeMaterials：先背包后箱（Consume :223-238），箱槽整格清空语义', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 4 };
    const c = chest(10, 0, [{ id: woodIid, stack: 6 }, { id: gelIid, stack: 1 }]);
    expect(consumeMaterials(inv, workbench, 1, false, [c])).toBe(true);
    expect(inv.countOf(woodIid)).toBe(0);
    expect(c.items[0]).toBeNull();       // 需 6=存 6 → 整格清空（ConsumeItemsFrom :277-282）
    expect(c.items[1]).not.toBeNull();   // 非本配方材料不动
  });

  it('光标/垃圾镜像槽不参与（背包 58 槽=0-57；Inventory 无 58 槽即等价）', () => {
    const inv = new Inventory();
    expect(inv.slots.length).toBe(58);
  });
});

describe('SW-AV2 使用源门钉面（Q2 裁决：背包 10-49 不能直接使用/放置=原版本相）', () => {
  it('SmartSelect：≥10 选中仅瞬态覆盖（Shift 智选命中背包 15 槽镐,松键还原热栏）', () => {
    const st = new TileStore(200, 200);
    st.setTile(50, 50, TILE_BY_KEY['dirt']);   // sheet 0 → 拾取策略（Hammer/Axe 集外）
    const slots: SmartSelectSlot[] = Array.from({ length: 58 }, () => ({ ...EMPTY_SLOT }));
    slots[15] = { ...EMPTY_SLOT, vid: 3509, pick: 35 };   // 铜镐画像在背包 15 槽
    const ss = new SmartSelect();
    let changed = 0;
    const host: SmartSelectHost = {
      selected: 0, hotbar: 0, canChangeImmediately: true,
      isSlotEmpty: (i) => i !== 15,
      onSelectionChanged: () => { changed++; },
    };
    const env = {
      controlTorch: true, usingGamepad: false, st,
      mouseX: 50 * 16 + 8, mouseY: 50 * 16 + 8, screenTopY: 0, screenHeight: 1200,
      player: { x: 48 * 16, y: 48 * 16, w: 20, h: 42, wet: false, gravDir: 1 },
      slots, selectedItem: 0,
      inRange: () => true,
    } as unknown as SmartSelectEnv;
    ss.update(env, host);
    expect(host.selected).toBe(15);   // 智选 = 唯一合法的 ≥10 选中通道（瞬态）
    env.controlTorch = false;
    ss.update(env, host);
    expect(host.selected).toBe(0);    // 松键还原 hotbar（SelectedItemState.Update :513-521）
    expect(changed).toBe(2);
  });

  it('源级钉面：选槽写入点全部钳 0-9（防未来把背包 10-49「修」成可选可用）', () => {
    const read = (p: string): string => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
    const game = read('../src/core/Game.ts');
    const ui = read('../src/ui/UI.ts');
    // 裁决注释在位
    expect(game).toContain('SW-AV2 2026-09-06 裁决');
    // 数字键 Hotbar1-10 → 0-9（Player.cs:25289-25328）
    expect(game).toMatch(/selected = digit\[1\] === '0' \? 9 : Number\(digit\[1\]\) - 1/);
    // 滚轮 ±1 环绕在 10 内（ClampHotbarOffset Player.cs:32134-32145）
    expect(game).toMatch(/inv\.selected = \(this\.player\.inv\.selected \+ 9\) % 10/);
    expect(game).toMatch(/inv\.selected = \(this\.player\.inv\.selected \+ 1\) % 10/);
    // 联机代理钳 0-9
    expect(game).toMatch(/Math\.min\(rp\.selectedItem, 9\)/);
    // UI 热栏点击选中仅 0-9（Main.cs:44336-44359 GUIHotbarDrawInner i<10）
    expect(ui).toMatch(/from\.i < 10 && !panelOpen/);
  });
});

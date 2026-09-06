// SW-AZ1 2026-09-06 制作/放置域备案项清偿守卫
//
// 原版权威（Terarria1457；1458 diff 本域零变更——Recipe/Chest/NearbyChests/CraftingRequests
// 四文件行数全同 + CraftFromNearbyChests 三消费点同位）：
//   CraftingRequests.CraftItem              CraftingRequests.cs:88-110 —— qty 循环、i>0 每轮
//                                           重查 CollectedEnoughItemsToCraft；i==0 无门（:93）
//   Recipe.SubtractOwnedItem                Recipe.cs:259-265 —— 账面按 req.stack【未折扣面】
//                                           递减（Max(...,0)）；仅入列材料递减（折扣归零
//                                           不入列 GetIngredientsForOneCraft :206-208）
//   Player.Settings.CraftFromNearbyChests   Player.cs:355 默认 true；作用域只包住
//                                           Recipe.cs:386-397（③bank 盒/弹体 + ④世界箱），
//                                           ①开箱容器 :378-381 / ②虚空袋 :382-385 在外
//   NearbyChests.GetBanksInRangeOf 弹体段   NearbyChests.cs:44-58 —— 弹体先于 tile 段；
//                                           射程盒 = tile 段同款 num=39 的 79×79
//   Projectile.TryGetContainerIndex         Projectile.cs:80559-80568 —— 525/960→-2=bank、
//                                           734→-5=bank4；ContainerIndexToPlayerBank
//                                           NearbyChests.cs:119-130 case -5 背包持 5325 → 不计
//   PickItemSelectionOverride               Player.cs:17526-17548 —— mouseItem 非空 → 伪选中 58
//   dropItemCheck                           Player.cs:5122 inventory[58]=mouseItem.Clone()；
//                                           :5139-5154 右键释放臂=丢出 DropSelectedItem(58)
//   CanChangeSelectedItemImmediately        Player.cs:415-421 —— !UsingOrReusingItem && ItemTimeIsZero
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  craftSourcesFor, consumeMaterials, collectOwnedItems, craftableCount,
  VANILLA_RECIPES, RECIPE_GROUPS, invIndexOfVanilla, CRAFT_CHEST_RANGE_PX,
  type CraftItemSource,
} from '../src/data/vanillaRecipes';
import type { ChestData } from '../src/world/World';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const woodIid = invIndexOfVanilla(9);
const gelIid = invIndexOfVanilla(23);
const torch = VANILLA_RECIPES.find((r) => r.create === 8)!;                 // 1木+1凝胶
const workbench = VANILLA_RECIPES.find((r) => r.create === 36 && r.tile === -1)!; // 木×10
const WOOD_GID = 1000000 + RECIPE_GROUPS['Wood'];

const chest = (x: number, y: number, items: ChestData['items'] = [], extra: Partial<ChestData> = {}): ChestData =>
  ({ x, y, items, ...extra });

const src = (p: string): string =>
  fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

afterEach(() => { vi.restoreAllMocks(); });

// ==================== R3：Shift 批量合成部分量（CraftItem :88-110） ====================
describe('SW-AZ1 R3 批量合成部分量语义', () => {
  it('料够 3 造 3：times=10 → 返 3、材料扣净（旧两阶段全量校验=不够 10 造 0）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 30 };
    inv.slots[11] = { id: gelIid, stack: 3 };   // 凝胶 3 = 瓶颈 → 恰 3 轮
    const crafted = consumeMaterials(inv, torch, 10, false);
    expect(crafted).toBe(3);
    expect(inv.countOf(woodIid)).toBe(27);      // 木只扣 3（跟凝胶同尽）
    expect(inv.countOf(gelIid)).toBe(0);
  });

  it('零蒸发不变量保持（R14-B2）：料够 5 times=3 → 3 轮精确扣减,无过扣', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 5 };
    inv.slots[11] = { id: gelIid, stack: 5 };
    expect(consumeMaterials(inv, torch, 3, false)).toBe(3);
    expect(inv.countOf(woodIid)).toBe(2);
    expect(inv.countOf(gelIid)).toBe(2);
  });

  it('全源不足且首轮即缺 → 返 0、零扣减（i==0 也过实际校验,R14-B2 守卫不回退）', () => {
    const inv = new Inventory();
    inv.slots[10] = { id: woodIid, stack: 4 };  // 工作台需 10
    expect(consumeMaterials(inv, workbench, 10, false)).toBe(0);
    expect(inv.countOf(woodIid)).toBe(4);
  });

  it('炼金折扣账面=未折扣面（SubtractOwnedItem Recipe.cs:259-265）：全折扣轮不白嫖续命迭代', () => {
    const alch = VANILLA_RECIPES.find((r) => r.alchemy && r.items.length === 1
      && !r.groups.length)!;
    const req = alch.items[0];
    const iid = invIndexOfVanilla(req.id);
    const inv = new Inventory();
    inv.slots[10] = { id: iid, stack: req.stack * 3 };   // 恰够 3 轮全价
    // random<1/3 恒真 → 每材料全额折扣 → need=0（不入列 :206-208）→ 账面不递减
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const crafted = consumeMaterials(inv, alch, 10, true);
    expect(crafted).toBe(10);          // 无材料消耗 → i>0 账面门不拦（账面未动）
    expect(inv.countOf(iid)).toBe(req.stack * 3);   // 零消耗
  });

  it('炼金账面两本账：无折扣时料够 3 造 3（账面未折扣递减,折扣剩余料不续命）', () => {
    const alch = VANILLA_RECIPES.find((r) => r.alchemy && r.items.length === 1
      && !r.groups.length)!;
    const req = alch.items[0];
    const iid = invIndexOfVanilla(req.id);
    const inv = new Inventory();
    inv.slots[10] = { id: iid, stack: req.stack * 3 };
    vi.spyOn(Math, 'random').mockReturnValue(0.99);   // ≥1/3 → 永不折扣
    expect(consumeMaterials(inv, alch, 10, true)).toBe(3);   // 账面 3 轮即尽
    expect(inv.countOf(iid)).toBe(0);
  });

  it('掷流序（B9 备案更新）：掷次数 = 实际合成轮数 × 材料数 × stack（部分量停产不烧未发生迭代的掷）', () => {
    const alch = VANILLA_RECIPES.find((r) => r.alchemy && r.items.length === 1
      && !r.groups.length)!;
    const req = alch.items[0];
    const iid = invIndexOfVanilla(req.id);
    const inv = new Inventory();
    inv.slots[10] = { id: iid, stack: req.stack * 3 };   // 恰 3 轮
    // ★赋值式拦截（不用 vi.spyOn——并行套件对 Math.random 的全局赋值/还原会让
    // spy 脱钩,组合运行时计数失真;赋值+手动还原与本仓 ghost-place-swap 同法）
    const orig = Math.random;
    let rolls = 0;
    Math.random = () => { rolls++; return 0.99; };   // ≥1/3 → 永不折扣
    try {
      const crafted = consumeMaterials(inv, alch, 10, true);
      expect(crafted).toBe(3);
      // 按实际轮数掷：3 轮 × 1 材料 × stack 次（旧实现预掷满 times=10 轮）
      expect(rolls).toBe(3 * req.stack);
    } finally {
      Math.random = orig;
    }
  });
});

// ==================== item4：CraftFromNearbyChests 开关作用域 ====================
describe('SW-AZ1 item4 CraftFromNearbyChests 作用域（Recipe.cs:375-407）', () => {
  it('false = ③④旁路：附近世界箱与 bank tile 不计;①开箱容器照常入列', () => {
    const st = new TileStore(300, 300);
    st.setTile(100, 100, TILE_BY_KEY['v_29_piggy_bank']);
    const near = chest(10, 0, [{ id: woodIid, stack: 7 }]);
    const openPanel = { x: -1, y: 0, items: [{ id: woodIid, stack: 5 }] };
    const banks = [{ items: [{ id: woodIid, stack: 40 } as never] }] as unknown as
      ReadonlyArray<CraftItemSource | null | undefined>;
    const srcOff = craftSourcesFor([near], 0, 0, {
      openChest: openPanel, store: st, centerTileX: 100, centerTileY: 100, banks,
      nearbyChestsEnabled: false,
    });
    expect(srcOff.map((s) => s.items)).toEqual([openPanel.items]);   // 只有①
    const srcOn = craftSourcesFor([near], 0, 0, {
      openChest: openPanel, store: st, centerTileX: 100, centerTileY: 100, banks,
    });
    expect(srcOn.length).toBeGreaterThan(1);          // 开+bank+箱
    expect(srcOn.some((s) => s.items === near.items)).toBe(true);
  });

  it('false 时②虚空袋 bank4 不受开关管（Recipe.cs:382 在 if 体外）', () => {
    const near = chest(10, 0, [{ id: woodIid, stack: 7 }]);
    const bag = [{ id: woodIid, stack: 2 } as never];
    const banks = [null, null, null, { items: bag }] as unknown as
      ReadonlyArray<CraftItemSource | null | undefined>;
    const srcOff = craftSourcesFor([near], 0, 0, {
      voidBagHeld: true, banks, nearbyChestsEnabled: false,
    });
    expect(srcOff.map((s) => s.items)).toEqual([bag]);   // ②在,④（near）不在
  });

  it('缺省（未传键）= 原版默认开（Player.cs:355 true）', () => {
    const near = chest(10, 0, [{ id: woodIid, stack: 7 }]);
    expect(craftSourcesFor([near], 0, 0).some((s) => s.items === near.items)).toBe(true);
  });
});

// ==================== item5：弹体容器支（GetBanksInRangeOf 弹体段） ====================
describe('SW-AZ1 item5 弹体容器 bank 支', () => {
  const banksOf = (items: unknown) => [{ items }] as unknown as
    ReadonlyArray<CraftItemSource | null | undefined>;

  it('projectileBanks 入列且与 tile/虚空袋支按 items 身份去重（Contains :388 同义）', () => {
    const st = new TileStore(300, 300);
    st.setTile(100, 100, TILE_BY_KEY['v_29_piggy_bank']);   // 放置存钱罐（同 bank 数组）
    const bankArr = [{ id: woodIid, stack: 40 } as never];
    const banks = banksOf(bankArr);
    const petBank = (banks[0] as CraftItemSource);           // Game 侧传同一包装
    const s = craftSourcesFor([], 0, 0, {
      store: st, centerTileX: 100, centerTileY: 100, banks,
      projectileBanks: [petBank],
    });
    expect(s.filter((x) => x.items === bankArr).length).toBe(1);   // 弹体+tile 同 bank 只计一次
    const owned = collectOwnedItems(new Inventory(), s);
    expect(owned.get(9)).toBe(40);                   // 双计则 80（白嫖窗口指纹）
  });

  it('受 nearbyChestsEnabled 管辖（③族,Recipe.cs:386 if 体内）', () => {
    const bankArr = [{ id: woodIid, stack: 40 } as never];
    const banks = banksOf(bankArr);
    const s = craftSourcesFor([], 0, 0, {
      banks, projectileBanks: [banks[0] as CraftItemSource], nearbyChestsEnabled: false,
    });
    expect(s.length).toBe(0);
  });
});

// ==================== item1：光标持物镜像槽 58 ====================
describe('SW-AZ1 item1 光标持物镜像槽（Inventory 层）', () => {
  it('heldItem() 伪选中：镜像非空即 HeldItem（PickItemSelectionOverride :17528-17532）', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: woodIid, stack: 9 };
    expect(inv.heldItem()).toBe(inv.slots[0]);
    const cur = { id: gelIid, stack: 5 };
    inv.cursorMirror = cur;
    expect(inv.heldItem()).toBe(cur);              // 光标物压过热栏选中（HeldItem=inventory[58]）
    inv.cursorMirror = null;
    expect(inv.heldItem()).toBe(inv.slots[0]);     // 耗尽/失选 → 回热栏（:524 空镜像回热栏支）
  });

  it('removeHeld 镜像臂：扣光标物不扣真槽（消费点 :43659 mouseItem 同步支同语义）', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: woodIid, stack: 9 };
    const cur = { id: gelIid, stack: 5 };
    inv.cursorMirror = cur;
    expect(inv.removeHeld(2)).toBe(true);
    expect(cur.stack).toBe(3);                     // 直写共享对象 = 回写 UI 光标物
    expect(inv.slots[0]).toEqual({ id: woodIid, stack: 9 });   // 真槽分毫不动
    expect(inv.removeHeld(3)).toBe(true);
    expect(cur.stack).toBe(0);                     // 归零由 Game.syncCursorMirror 清 UI 光标
    expect(inv.removeHeld(1)).toBe(false);         // 镜像不足 → 拒扣（不过扣）
  });

  it('镜像未激活：removeHeld 退化 removeAt(selected)（56 处旧消费点零行为漂移）', () => {
    const inv = new Inventory();
    inv.slots[3] = { id: woodIid, stack: 2 };
    inv.selected = 3;
    expect(inv.removeHeld(1)).toBe(true);
    expect(inv.slots[3]).toEqual({ id: woodIid, stack: 1 });
    inv.cursorMirror = { id: gelIid, stack: 1 };
    expect(inv.removeHeld(1)).toBe(true);
    expect(inv.slots[3]).toEqual({ id: woodIid, stack: 1 });   // 镜像激活时不误扣真槽
  });

  it('镜像不入材料聚合（CollectItems Recipe.cs:418-433 槽帽 58=0-57）', () => {
    const inv = new Inventory();
    inv.cursorMirror = { id: woodIid, stack: 99 };
    expect(collectOwnedItems(inv).get(9)).toBeUndefined();
  });
});

// ==================== 结构锁（源文本锚,防静默回退） ====================
describe('SW-AZ1 结构锁', () => {
  const game = src('../src/core/Game.ts');
  const ui = src('../src/ui/UI.ts');
  const inv = src('../src/items/Inventory.ts');
  const recipes = src('../src/data/vanillaRecipes.ts');
  const optionsTs = src('../src/core/Options.ts');

  it('Game.updateUse 门：镜像激活∧非右键才放行（其余光标持物态维持拦截）', () => {
    expect(game).toMatch(/cursorHeld && \(!this\.player\.inv\.cursorMirror \|\| inp\.rightDown\)/);
    // 同步/结算挂点：智能选取之前同步（PickItemSelectionOverride 先于 SmartSelectLookup），
    // updateUse 之后结算
    expect(game).toMatch(/this\.syncCursorMirror\(\);[\s\S]{0,200}this\.updateSmartSelect\(\);/);
    expect(game).toMatch(/this\.updateUse\(dt\);[\s\S]{0,200}this\.commitCursorMirror\(\);/);
    // CanChangeSelectedItemImmediately 门（:415-421）三臂
    expect(game).toMatch(/if \(this\.usingOrReusingItem\(\) \|\| this\._dirtRodChannel \|\| this\.player\.useTime !== 0\) return;/);
  });

  it('Game 手持消耗统一入口：56 处消费点全走 removeHeld,无 removeAt(selected) 残留', () => {
    expect(game.match(/inv\.removeHeld\(1\)/g)?.length).toBe(56);
    expect(game).not.toContain('removeAt(this.player.inv.selected, 1)');
    expect(game).not.toContain('p.inv.removeAt(p.inv.selected, 1)');
    // ★SW-RB4a 2026-09-06 残留检测面加宽：任意书写形态的 removeAt(selected)/
    // slots[selected] 【写入】直读均视为镜像分裂面（合法消费=removeHeld;
    // 扫描位弹药/导线/油漆用显式槽号,不落此模式）。UI 的右键换型三函数
    //（swapVoidBagVisual/swapParkourBookVisual/swapFlaironForm）读 slots[selected]
    //  为已证不可达面（updateUse 光标持物右键全拦）——锁 src/player 与 src/net 面:
    expect(game).not.toMatch(/removeAt\(\s*(?:this\.)?(?:player\.)?inv\.selected\b/);
    expect(game).not.toMatch(/inv\.removeAt\(\s*inv\.selected\b/);
    // 光标物活对象注入 + 耗尽清端
    expect(game).toContain('uiHeldItemObj: ');
    expect(game).toContain('uiHeldItemClear: ');
  });

  it('UI：左键世界点击不再丢出（右键丢出臂保留）', () => {
    expect(ui).toMatch(/if \(e\.button === 0\) return;\s*\n\s*this\.throwHeldToWorld\(\);/);
    expect(ui).toContain('game.uiHeldItemObj = () => this.heldStack;');
    // 拖拽丢出路径保留（resolveDrop → throwHeldToWorld）
    expect(ui).toMatch(/this\.throwHeldToWorld\(\);\s*\n\s*\} else \{\s*\n\s*this\.placeHeld/);
  });

  it('vanillaCraft 数值契约：crafted 轮数贯穿成品数量/词缀/NoCoinMerge 条件', () => {
    expect(game).toMatch(/const crafted = consumeMaterials\(this\.player\.inv, r, times, this\._alchemyTable, this\._craftSourcesCache\(\)\)/);
    expect(game).not.toMatch(/r\.createStack \* times/);
    expect(game).toMatch(/r\.createStack === 1 && crafted === 1/);
  });

  it('craftSourcesFor：开关门与弹体支（③族序：弹体先于 tile 盒,受开关管辖）', () => {
    expect(recipes).toMatch(/if \(opts\.nearbyChestsEnabled !== false\) \{/);
    expect(recipes).toMatch(/if \(opts\.projectileBanks\) \{\s*\n\s*for \(const pb of opts\.projectileBanks\) push\(pb\);\s*\n\s*\}\s*\n\s*if \(opts\.store/);
    // consumeMaterials 数值契约 + 账面未折扣递减仅在入列材料上
    expect(recipes).toMatch(/ownedAcc\.set\(accKey, Math\.max\(\(ownedAcc\.get\(accKey\) \?\? 0\) - req\.stack, 0\)\)/);
    expect(recipes).toMatch(/if \(needOf\.get\(req\)! > 0\) \{\s*\n\s*const accKey/);
  });

  it('Game.craftSources：弹体容器三型锚（525/960→bank、734→bank4+5325 门）与开关消费', () => {
    expect(game).toMatch(/e instanceof FlyingPiggyBank/);
    expect(game).toMatch(/this\.petFollower\.projId === 960/);
    expect(game).toMatch(/e instanceof VoidLensProj/);
    expect(game).toMatch(/!heldVids\.has\(5325\)/);
    expect(game).toMatch(/nearbyChestsEnabled: options\.data\.craftFromNearbyChests !== false/);
    expect(optionsTs).toMatch(/craftFromNearbyChests: true,\s*\/\/ ★SW-AZ1/);
  });

  it('Inventory：伪选中 heldItem 单点 + removeHeld 镜像臂（结构锚）', () => {
    expect(inv).toMatch(/return this\.cursorMirror \?\? this\.slots\[this\.selected\];/);
    expect(inv).toMatch(/removeHeld\(count = 1\): boolean \{/);
    expect(inv).toContain('cursorMirror: InvItem | null = null;');
  });

  it('Settings：开关行挂 game 组（文案键双语入包由 build-l10n 门保障）', () => {
    const settings = src('../src/ui/Settings.ts');
    expect(settings).toMatch(/Lang\.text\('Mods\.SandboxWorld\.Settings\.CraftFromNearbyChests'\)/);
    expect(settings).toMatch(/GameUI\.CraftFromNearbyChestsOn/);
    const zh = JSON.parse(src('../../tools/l10n-custom/zh-Hans.json')) as Record<string, Record<string, string>>;
    const en = JSON.parse(src('../../tools/l10n-custom/en-US.json')) as Record<string, Record<string, string>>;
    expect(zh.Mods['SandboxWorld.Settings.CraftFromNearbyChests']).toBe('从附近的箱子制作');
    expect(en.Mods['SandboxWorld.Settings.CraftFromNearbyChests']).toBe('Craft from nearby chests');
  });
});

// ==================== item1 行为面：光标持物 → tryPlace 消耗光标物（端到端） ====================
describe('SW-AZ1 item1 行为面（Game 壳端到端）', () => {
  it('光标捏木材点世界 → 铺放且扣的是光标物 stack,热栏原物分毫不动（removeHeld 镜像臂）', () => {
    const iidOf = (vid: number): number => {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      for (let i = 0; i < ITEM_DEFS.length; i++) if (ITEM_DEFS[i]?.key === key) return i;
      return -1;
    };
    // 场景 = ghost-place-swap『豁免面』同款（已致动草丛清格铺放——空格铺设链依赖
    // 未桩化的 Game 侧子系统,与本测面无关;此场景在既有套件中已证可铺）
    const w = new World(40, 40, 13, 'az1');
    const st = w.store;
    for (let x = 2; x < 38; x++) st.setTileSilent(x, 21, TILE_BY_KEY['stone']);
    st.setTileSilent(12, 20, TILE_BY_KEY['tallgrass']);
    st.setActuated(12, 20, true);
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      tryPlace(tx: number, ty: number, def: (typeof ITEM_DEFS)[number]): void;
    };
    const inv = new Inventory();
    inv.slots[0] = { id: iidOf(3509), stack: 1 };        // 热栏原物（铜镐）
    const cursor = { id: iidOf(9), stack: 5 };           // 光标捏 5 木材
    inv.cursorMirror = cursor as never;                  // syncCursorMirror 激活态
    g.world = w;
    g.chunks = { markDirtyArea: () => {} };
    g.sfx = { play: () => {} };
    g.cb = { onInventoryChanged: () => {} };
    g.input = { rightDown: false };
    g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
    g.critterVid = () => -1;
    g.spawnNpcByVanilla = () => null;
    g.spawnParticles = () => {};
    g.recLog = () => {};
    g.spawnDrop = () => {};
    g.hitTiles = { addDamage: () => 100, clear: () => {} };
    g.swingTileCutSet = new Set();
    g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
    g.player = {
      cx: 10 * 16 + 8, cy: 19 * 16 + 8, x: 10 * 16 + 2, y: 19 * 16 - 6, w: 12, h: 28,
      facing: 1, useTime: 0, attackSpeedMult: 1,
      buffs: { has: () => false }, equipStats: {},
      inv,
    };
    const woodDef = ITEM_DEFS[iidOf(9)];
    g.tryPlace(12, 20, woodDef);
    expect(st.type[st.idx(12, 20)]).toBe(TILE_BY_KEY[woodDef.tile ?? '']);   // 铺放成功
    expect(cursor.stack).toBe(4);                        // 扣的是光标物（removeHeld 镜像臂）
    expect(inv.slots[0]).toEqual({ id: iidOf(3509), stack: 1 }); // 热栏原物分毫不动
  });
});

// ==================== SW-RB4a 2026-09-06 红蓝对抗修复钉 ====================
describe('SW-RB4a 修复钉', () => {
  const torchIid = invIndexOfVanilla(8);   // 火把（maxStack 999、无词缀域）
  const TORCH_MAX = ITEM_DEFS[torchIid]?.maxStack ?? 999;

  /** vanillaCraft 壳（Object.create 绕构造;_craftSourcesCache/uiHeldItemObj/cb 桩） */
  function craftShell(cursorIn: { id: number; stack: number } | null) {
    const inv = new Inventory();
    let cursor = cursorIn ? { ...cursorIn } : null;
    const granted: Array<[number, number]> = [];
    const drops: Array<[string, number]> = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
      vanillaCraft(r: typeof torch, times?: number, toCursor?: boolean): void;
    };
    g.player = { inv };
    g._alchemyTable = false;
    g._craftSourcesCache = () => [];
    g.uiHeldItemObj = () => cursor;
    g.cb = {
      grantToCursor: (id: number, stack: number, prefix?: number): number => {
        granted.push([stack, id]);
        if (!cursor) {
          const put = Math.min(stack, TORCH_MAX);
          cursor = { id, stack: put, ...(prefix !== undefined ? { prefix } : {}) };
          return stack - put;
        }
        if (cursor.id === id && (cursor.prefix ?? 0) === (prefix ?? 0)) {
          const put = Math.min(TORCH_MAX - cursor.stack, stack);
          cursor.stack += put;
          return stack - put;
        }
        return stack;                       // 异型不可并 → 全余量
      },
      onInventoryChanged: () => {},
      onCraftCursorGlow: () => {},
    };
    g.sfx = { play: () => {} };
    g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push([key, n]); return null; };
    g.prefetchPlaceableSheets = () => {};
    g.achievements = { notifyItemPickup: () => {}, notifyItemCraft: () => {} };
    return { g, inv, getCursor: () => cursor, granted, drops };
  }

  it('item5 点击门（Main.cs:43017 TryAllowingToCraftRecipe 桌面臂）：光标捏异型物点配方 = 整次点击无效,零扣减零成品', () => {
    const s = craftShell({ id: gelIid, stack: 1 });      // 光标捏凝胶（异型,不可并堆成品）
    s.inv.slots[10] = { id: woodIid, stack: 10 };
    s.inv.slots[11] = { id: gelIid, stack: 10 };
    (s.g as unknown as { vanillaCraft(r: unknown, t?: number, c?: boolean): void })
      .vanillaCraft(torch, 10, true);
    expect(s.inv.countOf(woodIid)).toBe(10);             // 材料分毫未扣
    expect(s.inv.countOf(gelIid)).toBe(10);
    expect(s.granted).toEqual([]);                       // 无成品授予（不落地不掉物）
    expect(s.drops).toEqual([]);                         // 无地面掉落（旧缺陷:成品 spawnDrop）
  });

  it('item5 同型无词缀有余位 → 放行;上光标余量回背包（CraftItem_GrantItem → GetItem NoCoinMerge）,不再 spawnDrop 落地', () => {
    const s = craftShell({ id: torchIid, stack: TORCH_MAX - 4 });   // 光标捏 995 火把（同型无词缀）
    s.inv.slots[10] = { id: woodIid, stack: 30 };
    s.inv.slots[11] = { id: gelIid, stack: 30 };
    (s.g as unknown as { vanillaCraft(r: unknown, t?: number, c?: boolean): void })
      .vanillaCraft(torch, 10, true);                    // 10 轮 × 3 火把 = 30
    expect(s.getCursor()!.stack).toBe(TORCH_MAX);        // 光标并到满 999（4 上光标）
    expect(s.inv.countOf(torchIid)).toBe(26);            // 余量 26 回背包（曾 spawnDrop 落地）
    expect(s.drops).toEqual([]);
    expect(s.inv.countOf(woodIid)).toBe(20);             // 10 轮材料扣净
    expect(s.inv.countOf(gelIid)).toBe(20);
  });

  it('item1 SmartSelect 短路（PickItemSelectionOverride Player.cs:17528-17532 先于 SmartSelectLookup）：mouseItemHeld=true 时 selected 不被改写', async () => {
    const { SmartSelect } = await import('../src/player/SmartSelect');
    const ss = new SmartSelect();
    let changed = 0;
    const host = {
      canChangeImmediately: true,
      selected: 3,
      hotbar: 0,
      isSlotEmpty: () => false,
      onSelectionChanged: () => { changed++; },
    };
    const env = {
      controlTorch: true, usingGamepad: false,
      st: new TileStore(4, 4), mouseX: 0, mouseY: 0, screenTopY: 0, screenHeight: 100,
      player: { x: 0, y: 0, w: 12, h: 28, gravDir: 1, wet: false },
      slots: [], selectedItem: 3,
      mouseItemHeld: true,                              // 光标持物伪选中在显
      inRange: () => false,
    };
    ss.update(env as never, host as never);
    expect(host.selected).toBe(3);                       // 原版 lookup 不被咨询,选中保持
    expect(changed).toBe(0);
  });

  it('item1 鞭回声扫描窗（Player.cs:43055 selectedItem+1..49）——镜像鞭同鞭回声（源文本锁）', () => {
    const whipSrc = src('../src/entities/WhipProj.ts');
    expect(whipSrc).toMatch(/owner\.inv\.cursorMirror \? 50 : owner\.inv\.selected \+ 1/);
  });
});

// 红队 F1 回归：ChestUI.LootAll → vault 溢流通道的【UI 生产接线】（2026-09-01）。
// 红队主张（F1）：lootAllFromContainer/chestSettingsAllowsVault 库码就绪但全 src
// 唯一引用=测试——宝箱面板 Loot All 钮从未触发溢流入袋。本文件钉死四面：
//   ① 接线存在（源文本）：LegacyInterface.29（Loot All）钮 → UI.chestLootAll →
//      lootAllFromContainer，spill 按 chestSettingsAllowsVault(openChest.x) 二选一。
//   ② 真箱端到端（真 Player+真 Inventory）：x≥0 面板 Loot All 主背包装不下的余量经
//      player.depositIntoVoidVault 进 banks[3]（虚空袋）；容器格清空/回写残量。
//   ③ bank 面板（-2..-4,含 -2 猪猪支）走 LootAllFromBank 面——吸收照常、溢流关闭
//      （settings 按 player.chest>-1 二选一,ChestUI.cs:392）。
//   ④ -5 虚空袋面板收藏锁：favorited 格不被拉取（ChestUI.cs:443-452/:447 是唯一带
//      收藏锁的容器分支；收藏物可经拖拽落进 bank4 格,favorited 随实例透传）。
//   ⑤ UI.chestLootAll 生产方法驱动：绕 DOM 构造直调方法体,验证真实 settings 选择/
//      moved 门 sfx/refreshAll。
// 原版真值 ../Terarria1457/Terraria.UI/ChestUI.cs:389-412 + Terraria/GetItemSettings.cs:
// 11-12（LootAllFromBank=default / LootAllFromChest.CanGoIntoVoidVault=true）；
// 溢流=Player.GetItem_VoidVault（Player.cs:39710,GetItem 收尾汇流门 :39703）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI } from '../src/ui/UI';
import { chestSettingsAllowsVault, lootAllFromContainer } from '../src/stats/QuickStacking';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (!ITEM_DEFS[id]) throw new Error(`测试钉死前提失效：vid ${vid} 未注册`);
  return id;
};
const WOOD = iidOf(9);                                  // ItemID.Wood
const DIRT = iidOf(2);                                  // ItemID.DirtBlock
const BATFISH = iidOf(2450);                            // 任务鱼（QUEST_ITEM_VIDS 成员）
const M_WOOD = ITEM_DEFS[WOOD].maxStack ?? 999;

type Slot = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

/** IsVoidVaultEnabled 桩 = 主背包持 4131 虚空透镜（Player.cs:24744 只扫主背包,
 *  Player.useVoidBag 同式）;bank4 = 虚空保险库 40 格。 */
function vaultPlayer(): Player {
  const p = new Player(50 * 16, 90 * 16, new Inventory());
  p.inv.slots[0] = { id: iidOf(4131), stack: 1 };
  p.banks[3] = Array(40).fill(null) as typeof p.banks[3];
  return p;
}

/** 主背包塞满同型满堆（槽 0 留透镜；槽 49 半堆供部分吸收分支）。 */
function fillBag(p: Player, halfTail = true): void {
  for (let i = 1; i < 49; i++) p.inv.slots[i] = { id: WOOD, stack: M_WOOD };
  p.inv.slots[49] = halfTail ? { id: WOOD, stack: M_WOOD - 700 } : { id: WOOD, stack: M_WOOD };
}

/** 绕过 DOM constructor 直调 UI.chestLootAll 方法体:Object.create(UI.prototype)+
 *  手工铺方法引用面（openChest/game.sfx/game.player/refreshAll）。 */
function driveOpen(chest: { x: number; y: number; items: Slot[] }): { plays: string[]; player: Player; refreshed(): number } {
  let refreshCount = 0;
  const plays: string[] = [];
  const fake = Object.create(UI.prototype) as unknown as {
    openChest: typeof chest;
    game: { player: Player; sfx: { play(n: string): void }; achievements: { notifyItemPickup(v: number): void } };
    refreshAll(): void;
  };
  fake.openChest = chest;
  fake.game = { player: vaultPlayer(), sfx: { play: (n) => plays.push(n) }, achievements: { notifyItemPickup: () => {} } };   // SW-AU2 重钉：onPickup 成就回执（UI.ts:4284）需桩
  fake.refreshAll = () => { refreshCount++; };
  fillBag(fake.game.player);                       // 全满+半堆尾,制造确定分流面
  (Object.getPrototypeOf(fake) as { chestLootAll(this: unknown): void }).chestLootAll.call(fake);
  return { plays, player: fake.game.player, refreshed: () => refreshCount };
}

describe('① UI 生产接线（红队 F1 的"零接线"主张钉死）', () => {
  it('宝箱面板 Loot All 钮绑 chestLootAll;chestLootAll 走 lootAllFromContainer+二选一 spill', () => {
    // 面板按钮面（buildChestPanel 三按钮之首位,LegacyInterface.29=原版 "Loot All"）
    expect(srcMatch(/mkBtn\(Lang\.text\('LegacyInterface\.29'\), \(\) => this\.chestLootAll\(\)\)/)).toBe(true);
    // 调用链面：settings 二选一 → lootAllFromContainer,-5 支收藏锁随入参携带
    expect(srcMatch(/const moved = lootAllFromContainer\(/)).toBe(true);
    expect(srcMatch(/chestSettingsAllowsVault\(chest\.x\)\s*\?[\s\S]*depositIntoVoidVault/)).toBe(true);
    expect(srcMatch(/\{ skipFavorited: chest\.x === -5,/)).toBe(true);   // SW-AU2 重钉：-5 收藏锁入参（onPickup 成就回执后续键）
    // 库函数面：QuickStacking 导出两符号（非测试孤挂）
    expect(srcMatch(/export function chestSettingsAllowsVault/, '../src/stats/QuickStacking.ts')).toBe(true);
    expect(srcMatch(/export function lootAllFromContainer/, '../src/stats/QuickStacking.ts')).toBe(true);
  });
});

describe('② 真箱 loot-all：残量溢流入虚空袋（ChestUI.cs:393-405 → P.cs:39703/:39710）', () => {
  it('部分吸收木堆 + 全拒泥土双路：残量灌 banks[3],容器格清空', () => {
    const p = vaultPlayer();
    fillBag(p);                                     // 主背包全满(槽0=透镜,49=半堆)
    const items: Slot[] = [
      { id: WOOD, stack: 700 + 800 },               // 木：并满半堆 700 + 溢流 800
      { id: DIRT, stack: 1500 },                    // 泥土：全拒 → 整堆 1500 溢流入袋
      null,
    ];
    expect(chestSettingsAllowsVault(120)).toBe(true);          // 世界宝箱 x≥0 开通道
    const moved = lootAllFromContainer(p.inv, items, (id, n) => p.depositIntoVoidVault(id, n));
    expect(moved).toBe(true);
    expect(items.slice(0, 3).every((s) => s === null)).toBe(true);   // 三格全清
    expect(p.inv.slots[49]).toEqual({ id: WOOD, stack: M_WOOD });    // 吸收面=补满半堆
    expect(p.banks[3][0]).toEqual({ id: WOOD, stack: 800 });         // 溢流面=整份进袋
    expect(p.banks[3][1]).toEqual({ id: DIRT, stack: 1500 });        // 异型不并堆、独落空格
    expect(p.banks[3].slice(2).every((s) => s === null)).toBe(true); // 后续格无扰动
  });

  it('vault 拒收面在通道内闭环：任务鱼原地保留、绝不落袋;铜币并入钱币栏', () => {
    const p = vaultPlayer();
    fillBag(p);
    const items: Slot[] = [{ id: BATFISH, stack: 3 }, { id: iidOf(71), stack: 250 }];
    const moved = lootAllFromContainer(p.inv, items, (id, n) => p.depositIntoVoidVault(id, n));
    expect(moved).toBe(true);                                  // 铜币有实际搬移
    expect(items[0]).toEqual({ id: BATFISH, stack: 3 });       // CanVoidVaultAccept 拒收=留原格
    expect(items[1]).toBeNull();                               // 币 250≤4×100 全入钱币栏（升面额门内闭环）
    expect(p.banks[3].every((s) => s === null)).toBe(true);    // 袋内零进账（拒收面 + 币被钱币栏吃下）
  });
});

describe('③ bank 面板不溢流（LootAllFromBank 面,ChestUI.cs:414-465 各支无 vault 门）', () => {
  it('-2 猪猪面板：吸收照常(补满半堆),余量回写原格,溢流口不携带（settings 决策面在调用方）', () => {
    const p = vaultPlayer();
    fillBag(p);
    expect(chestSettingsAllowsVault(-2)).toBe(false);
    // 生产链对 bank 支的实际形参 = spill:undefined（UI.chestLootAll 三元支,见①/⑤）——
    // 纯函数层面照同形调用；带什么 spill 就用什么是函数契约,vault 关断在 settings 选面。
    const items: Slot[] = [{ id: WOOD, stack: 3000 }];
    lootAllFromContainer(p.inv, items, undefined);
    expect(items[0]).toEqual({ id: WOOD, stack: 3000 - 700 }); // 余量回写原格
    expect(p.banks[3].every((s) => s === null)).toBe(true);    // 虚空袋零进账
  });

  it('UI.driven -2 面板端到端：余量留箱、袋零进账（红队"非 world 箱维持现行为"钉死）', () => {
    const vv = { x: -2, y: 0, items: Array.from({ length: 40 }, (): Slot => null) };
    vv.items[2] = { id: DIRT, stack: 456 };
    const r = driveOpen(vv);
    expect(vv.items[2]).toEqual({ id: DIRT, stack: 456 });
    expect(r.player.banks[3].every((s) => s === null)).toBe(true);
    expect(r.plays).not.toContain('pickup');                   // 全满零搬移,moved 门
  });

  it('spill 形参未携(=bank 支等价调用)：全拒且无口 → 无任何搬移,false 返回', () => {
    const p = vaultPlayer();
    fillBag(p, false);                              // 全满,吸收零
    const items: Slot[] = [{ id: DIRT, stack: 777 }];
    expect(lootAllFromContainer(p.inv, items)).toBe(false);
    expect(items[0]).toEqual({ id: DIRT, stack: 777 });
    expect(p.banks[3].every((s) => s === null)).toBe(true);
  });
});

describe('④ -5 虚空袋面板收藏锁（ChestUI.cs:443-452/:447 唯一收藏锁支）', () => {
  it('favorited 格不拉取,普通格照常处理;不带 opts 时锁不存在（其余面板语义不受扰）', () => {
    const p = vaultPlayer();
    fillBag(p, false);
    const items: Slot[] = [
      { id: WOOD, stack: 10, favorited: true },       // 锁物：跳过不拉
      { id: DIRT, stack: 30 },                        // 普通物：全满无口 → 留格
    ];
    expect(lootAllFromContainer(p.inv, items, undefined, { skipFavorited: true })).toBe(false);
    expect(items[0]).toEqual({ id: WOOD, stack: 10, favorited: true });
    expect(items[1]).toEqual({ id: DIRT, stack: 30 });
    expect(p.banks[3].every((s) => s === null)).toBe(true);

    // 对照：同满包、不传 opts → 收藏物进【拉取尝试】路径（此处只是拉不动=false；
    // 用空包证明不加 opts 时收藏物会被正常收走——锁是调用方按 -5 分支的决策面）
    const itemsB: Slot[] = [{ id: WOOD, stack: 10, favorited: true }];
    const pFree = vaultPlayer();
    expect(lootAllFromContainer(pFree.inv, itemsB, undefined)).toBe(true);
    expect(itemsB[0]).toBeNull();
  });
});

describe('⑤ UI.chestLootAll 生产方法驱动（按钮行为位;40 槽世界箱契约 ChestData 同形）', () => {
  it('真箱(x=120)：残量入虚空袋+清格+moved 门响 Grab+刷新一次', () => {
    const rc = { x: 120, y: 0, items: Array.from({ length: 40 }, (): Slot => null) };   // R21 原版统一 40 槽
    rc.items[0] = { id: WOOD, stack: 2000 };          // 700 入半堆,1300 溢流(<M_WOOD 单格)
    rc.items[5] = { id: DIRT, stack: 123 };
    const { plays, player, refreshed } = driveOpen(rc);
    expect(rc.items[0]).toBeNull();
    expect(rc.items[5]).toBeNull();
    expect(player.inv.slots[49]).toEqual({ id: WOOD, stack: M_WOOD });
    expect(player.banks[3][0]).toEqual({ id: WOOD, stack: 1300 });
    expect(player.banks[3][1]).toEqual({ id: DIRT, stack: 123 });     // 异型不并堆、独落次空格
    expect(refreshed()).toBe(1);
    expect(plays).toContain('pickup');
  });

  it('真箱空箱：零搬移不响 Grab（moved=false 门）,面板仍刷新', () => {
    const empty = { x: 7, y: 0, items: Array.from({ length: 40 }, (): Slot => null) };
    const { plays, refreshed } = driveOpen(empty);
    expect(plays).not.toContain('pickup');
    expect(refreshed()).toBe(1);
  });

  it('-5 虚空袋面板：driven 方法体走 skipFavorited 与【不溢流】双支（:414-465/:443-452）', () => {
    const vv = { x: -5, y: 0, items: Array.from({ length: 40 }, (): Slot => null) };
    vv.items[3] = { id: WOOD, stack: 12, favorited: true };
    vv.items[4] = { id: DIRT, stack: 456 };
    const { plays, player } = driveOpen(vv);
    expect(vv.items[3]).toEqual({ id: WOOD, stack: 12, favorited: true });   // 收藏锁:原格不动
    expect(vv.items[4]).toEqual({ id: DIRT, stack: 456 });                   // 全满无口:留格
    expect(player.banks[3].every((s) => s === null)).toBe(true);             // bank 支永不溢流
    expect(plays).not.toContain('pickup');                                   // 零搬移
  });
});

function srcMatch(re: RegExp, rel = '../src/ui/UI.ts'): boolean {
  const text = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  return re.test(text);
}

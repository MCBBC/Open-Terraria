// 附近箱子快速堆叠（Terraria.GameContent/QuickStacking.cs 1:1 + NearbyChests.cs
// + ChestUI.MoveCoins 存币段，1.4.5.6，2026-08-20）。
// 入口：Player.QuickStackAllChests（Player.cs:22904-22911）——
//   smartStack = Settings.StackToChestsPreferredMode == Smart → QuickStackToNearbyInventories：
//   ① QuickStackToNearbyBanks：附近 bank（tile 29/97/463/491，600px 盒扫）先
//      ChestUI.MoveCoins 合币，再走通用 Transfer；
//   ② QuickStackToNearbyChests：附近宝箱（锚 (x·16+16, y·16+16) 与玩家 position
//      欧氏距 ≤600）Transfer（locked → 记 transferBlocked 不动）。
// 源 = 背包槽 10-49（★不含快捷栏 0-9 / 钱币 50-53 / 弹药 54-58），条件 !air &&
// !favorited && !coin（AddQuickStackableItems :380-393）。
// 转移两阶段（Transfer :395-450）：
//   A. 逐箱建账（BuildDestinationMetricsAndStackItems :465-500）：空格记 freeSlots、
//      每件非空加分类层分；同型源件先 FillStack 补满箱内已有叠（CanStack =
//      同 type + 同 prefix，Item.cs:49446）；同型装 destinationsForItemTypes（同箱去重）。
//   B. 残余件（同型箱有空位 → Lookup 命中）Consolidate 归并后 InsertIntoFreeSlot
//      整件入空格；smart 档再加一轮：按物品分类层找 categoryScore 最高且有空位的
//      箱整件送入（locked → transferBlocked）。
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import type { Inventory } from '../items/Inventory';
import type { ChestData } from '../world/World';
import { vanillaIdOfItem } from './Shimmer';
import { sortingLayerIndex } from '../data/vanillaItemSorting';

/** NearbyChests.GetChestsInRangeOf（NearbyChests.cs:10-31）：锚=右缘中点，
 *  与玩家 position 欧氏距离 > 600 排除（与合成侧 nearbyChestsForCrafting 同口径，
 *  但不排除 locked——locked 箱参与转移并记 blocked） */
export function chestsInRangeOf(chests: readonly ChestData[],
  px: number, py: number, range = 600): ChestData[] {
  const out: ChestData[] = [];
  const r2 = range * range;
  for (const c of chests) {
    const dx = c.x * 16 + 16 - px, dy = c.y * 16 + 16 - py;
    if (dx * dx + dy * dy > r2) continue;
    out.push(c);
  }
  return out;
}

type SrcItem = { id: number; stack: number; prefix?: number; favorited?: boolean } | null;

/** 源件收集（PackQuickStackableItems :368-378 + AddQuickStackableItems :380-393）：
 *  背包 10-49（Inventory0+10 起 40 格）。CanStack = 同 type + 同 prefix */
function packQuickStackable(inv: Inventory): { slots: number[]; items: SrcItem[]; blocked: boolean[] } {
  const slots: number[] = [], items: SrcItem[] = [], blocked: boolean[] = [];
  for (let i = 10; i < 50; i++) {
    const s = inv.slots[i] as SrcItem;
    if (!s || s.stack <= 0 || s.favorited) continue;
    const vid = vanillaIdOfItem(s.id);
    if (vid >= 71 && vid <= 74) continue;   // IsACoin（71-74）
    slots.push(i);
    items.push(s);
    blocked.push(false);
  }
  return { slots, items, blocked };
}

const canStack = (a: SrcItem, b: SrcItem): boolean => {
  if (!a || !b) return false;
  const at = vanillaIdOfItem(a.id), bt = vanillaIdOfItem(b.id);
  return at === bt && (a.prefix ?? 0) === (b.prefix ?? 0);
};

interface DestHelper {
  chest: ChestData;
  items: Array<{ id: number; stack: number; prefix?: number } | null>;
  locked: boolean;
  transferBlocked: boolean;
  /** 本箱有实际收货（FillStack 或整送——VisualizeChestTransfer 的等价记录位） */
  mutated: boolean;
  /** L5 长尾批：本箱收进的首个 vanilla 物品型（ItemTransfer 编排载荷 itemType 用） */
  movedVid: number;
  freeSlots: number[];
  freeStart: number;
  categoryScores: Map<number, number>;
  /** 本箱已入 destinationsForItemTypes 的类型（同箱去重，MatchingItemTypeDestinationList
   *  的 entries[num].value != value 检查） */
  listedTypes: Set<number>;
}

/** Chest.IsEmpty（Chest.cs）——全空槽 */
const chestIsEmpty = (c: ChestData): boolean => c.items.every((it) => !it || it.stack <= 0);

/** 快堆主链（QuickStackToNearbyChests :243-259 + Transfer :395-450）。
 *  返回受影响箱（供 UI 发光/音效）与被锁阻塞标记 */
export function quickStackToChests(
  inv: Inventory,
  chests: readonly ChestData[],
  smartStack: boolean,
): { touched: ChestData[]; blocked: ChestData[];
     /** ItemTransfer 编排载荷（:315 BroadcastOrRequest 面）：箱 → 本次迁入的首件型序列 */
     movedVids: Map<ChestData, number[]> } {
  const src = packQuickStackable(inv);
  const dests: DestHelper[] = [];
  const typesToList = new Map<number, DestHelper[]>();
  for (const c of chests) {
    if (chestIsEmpty(c)) continue;              // :404 !destination.chest.IsEmpty() 门
    const d: DestHelper = {
      chest: c, items: c.items, locked: !!c.locked, transferBlocked: false, mutated: false,
      movedVid: 0,   // L5 长尾批:ItemTransfer 首件型载荷,首箱入件时置位
      freeSlots: [], freeStart: 0, categoryScores: new Map(), listedTypes: new Set(),
    };
    dests.push(d);
    buildDestinationMetrics(src, d, typesToList);
  }
  const insertIntoFreeSlot = (srcIdx: number, d: DestHelper) => {
    const slot = d.freeSlots[d.freeStart];
    d.freeStart++;
    if (!d.movedVid && src.items[srcIdx]) {
      d.movedVid = vanillaIdOfItem(src.items[srcIdx]!.id ?? 0);   // ItemTransfer 载荷首件型
    }
    d.items[slot] = src.items[srcIdx];                // Utils.Swap（源格清空在写回）
    src.items[srcIdx] = null;
    d.mutated = true;                                 // VisualizeChestTransfer 等价记录
  };
  // ---- B 阶段：同型空位直送（:412-420）----
  for (let i = 0; i < src.items.length; i++) {
    const it = src.items[i];
    if (!it) continue;
    const vid = vanillaIdOfItem(it.id);
    let hit: DestHelper | null = null;
    for (const d of typesToList.get(vid) ?? []) {
      if (d.freeStart < d.freeSlots.length) { hit = d; break; }   // Lookup：首个有空位者
    }
    if (!hit) continue;
    consolidate(src, i);
    if (src.items[i]) insertIntoFreeSlot(i, hit);
  }
  // ---- smart 档：分类层最适箱整件送（:421-440）----
  if (smartStack) {
    for (let j = 0; j < src.items.length; j++) {
      const it = src.items[j];
      if (!it || src.blocked[j]) continue;
      const cat = sortingLayerIndex(vanillaIdOfItem(it.id));
      let best: DestHelper | null = null, bestScore = -1;
      for (const d of dests) {
        if (d.freeStart >= d.freeSlots.length) continue;
        const score = d.categoryScores.get(cat) ?? 0;
        if (score > 0 && score > bestScore) { best = d; bestScore = score; }
      }
      if (!best) continue;
      if (best.locked) { src.blocked[j] = true; best.transferBlocked = true; continue; }
      consolidate(src, j);
      if (src.items[j]) insertIntoFreeSlot(j, best);
    }
  }
  // ---- RestoreToPlayer（:334-354）：源槽写回（null = 清格）----
  for (let i = 0; i < src.slots.length; i++) {
    inv.slots[src.slots[i]] = src.items[i] as Inventory['slots'][number];
  }
  const movedVids = new Map<ChestData, number[]>();
  for (const d of dests) {
    if (d.mutated && d.movedVid) movedVids.set(d.chest, [d.movedVid]);
  }
  return {
    touched: dests.filter((d) => d.mutated).map((d) => d.chest),
    blocked: dests.filter((d) => d.transferBlocked).map((d) => d.chest),
    movedVids,
  };
}

/** BuildDestinationMetricsAndStackItems（:465-500）：空格记账 + 分类层计分 +
 *  同型补叠 + 同型登记 */
function buildDestinationMetrics(
  src: { items: SrcItem[]; blocked: boolean[] },
  d: DestHelper,
  typesToList: Map<number, DestHelper[]>,
): void {
  for (let i = 0; i < d.items.length; i++) {
    const cs = d.items[i];
    if (!cs || cs.stack <= 0) { d.freeSlots.push(i); continue; }   // AddFreeSlot
    const cat = sortingLayerIndex(vanillaIdOfItem(cs.id));
    d.categoryScores.set(cat, (d.categoryScores.get(cat) ?? 0) + 1);
    for (let j = 0; j < src.items.length; j++) {
      const s = src.items[j];
      if (!s || vanillaIdOfItem(s.id) !== vanillaIdOfItem(cs.id)) continue;
      if (d.locked) { src.blocked[j] = true; d.transferBlocked = true; continue; }
      const max = ITEM_DEFS[cs.id]?.maxStack ?? 1;
      if (canStack(s, cs) && cs.stack < max) {
        const n = Math.min(max - cs.stack, s.stack);
        if (n > 0) {
          cs.stack += n;
          s.stack -= n;
          if (!d.movedVid) d.movedVid = vanillaIdOfItem(cs.id);
          if (s.stack <= 0) src.items[j] = null;
          d.mutated = true;      // FillStack（:517-529）——VisualizeChestTransfer 视觉=L5 长尾批
                                 //   itemTransferFx 接线（movedVids 载荷经返回值交 Game 直播）
        }
      }
      if (!d.listedTypes.has(vanillaIdOfItem(cs.id))) {
        d.listedTypes.add(vanillaIdOfItem(cs.id));
        const list = typesToList.get(vanillaIdOfItem(cs.id)) ?? [];
        list.push(d);
        typesToList.set(vanillaIdOfItem(cs.id), list);
      }
    }
  }
}

/** Consolidate（:531-548）：把同型后位源件归并进第 i 件（i 自身将整件入箱） */
function consolidate(src: { items: SrcItem[] }, i: number): void {
  const a = src.items[i];
  if (!a) return;
  const max = ITEM_DEFS[a.id]?.maxStack ?? 1;
  for (let k = i + 1; k < src.items.length; k++) {
    const b = src.items[k];
    if (!b || !canStack(a, b)) continue;
    const n = Math.min(max - a.stack, b.stack);
    a.stack += n;
    b.stack -= n;
    if (b.stack <= 0) src.items[k] = null;
  }
}

// ===================== bank 存币段（QuickStackToNearbyBanks :230-241）=====================

/** ChestUI.MoveCoins（ChestUI.cs:987-1198）1:1：bank 既有币位 + 背包非收藏币
 *  （IsACoin 71-74，j≠58）合池 → 100:1 进位 → ①原币位同档回填 → ②余下原币位
 *  自高档而低 → ③其余空槽自高档而低 → ④溢出回背包原币槽（自高档而低）。
 *  bank 无任何既有币（flag2 门 :1037-1040）不收币直接 0。返回玩家侧净转移铜值 */
export function moveCoinsIntoBank(
  inv: Inventory,
  bank: Array<{ id: number; stack: number; prefix?: number } | null>,
): number {
  const coinVid = (it: { id: number } | null | undefined): number => {
    if (!it) return 0;
    const v = vanillaIdOfItem(it.id);
    return v >= 71 && v <= 74 ? v : 0;
  };
  const coinInternalId = [71, 72, 73, 74].map((v) => {
    const key = VANILLA_ITEM_KEY_BY_ID[v];
    return key !== undefined ? ITEM_BY_KEY[key] : -1;
  });
  const before = countCoins(inv.slots as SrcItem[]);
  const amounts = [0, 0, 0, 0];
  const emptySlots: number[] = [];          // list2（原空位 + 被清空币位，可回填）
  const coinSlotTier = new Map<number, number>();   // array2：slot → 原档位
  let hadBankCoins = false;
  for (let i = 0; i < bank.length; i++) {
    const v = coinVid(bank[i]);
    if (bank[i] && bank[i]!.stack > 0 && v > 0) {
      amounts[v - 71] += bank[i]!.stack;
      coinSlotTier.set(i, v - 71);
      emptySlots.push(i);
      bank[i] = null;
      hadBankCoins = true;
    } else if (!bank[i] || bank[i]!.stack < 1) {
      emptySlots.push(i);
      bank[i] = null;
    }
  }
  if (!hadBankCoins) return 0;                      // :1037-1040
  const invCoinSlots: number[] = [];                // list
  let tookFromPlayer = false;                       // flag
  for (let j = 0; j < inv.slots.length; j++) {
    const s = inv.slots[j] as SrcItem;
    if (j === 58 || !s || s.stack <= 0 || s.favorited) continue;
    const v = coinVid(s);
    if (v > 0) {
      tookFromPlayer = true;
      amounts[v - 71] += s.stack;
      invCoinSlots.push(j);
      inv.slots[j] = null;
    }
  }
  for (let k = 0; k < 3; k++) {
    while (amounts[k] >= 100) { amounts[k] -= 100; amounts[k + 1]++; }
  }
  const maxStackOf = (tier: number): number => {
    const key = VANILLA_ITEM_KEY_BY_ID[71 + tier];
    const iid = key !== undefined ? ITEM_BY_KEY[key] : -1;
    return (iid >= 0 ? ITEM_DEFS[iid]?.maxStack : undefined) ?? 9999;
  };
  const placeBank = (slot: number, tier: number): void => {
    const ms = maxStackOf(tier);
    const n = Math.min(amounts[tier], ms);
    bank[slot] = { id: coinInternalId[tier], stack: n };
    amounts[tier] -= n;
    const ei = emptySlots.indexOf(slot);
    if (ei >= 0) emptySlots.splice(ei, 1);          // list2.Remove
    coinSlotTier.delete(slot);                      // array2 = -1
  };
  // ① 原币位同档回填（:1096-1105——array2[l] 档位命中且该档有余量）
  for (const [slot, tier] of [...coinSlotTier]) {
    if (amounts[tier] > 0) placeBank(slot, tier);
  }
  // ② 余下原币位自高档而低（:1107-1125）
  for (const slot of [...coinSlotTier.keys()]) {
    for (let t = 3; t >= 0; t--) {
      if (amounts[t] > 0) { placeBank(slot, t); break; }
      if (amounts[t] === 0) continue;
    }
  }
  // ③ 其余空槽自高档而低（:1127-1150）
  while (emptySlots.length > 0) {
    const slot = emptySlots[0];
    let placed = false;
    for (let t = 3; t >= 0 && !placed; t--) {
      if (amounts[t] > 0) { placeBank(slot, t); placed = true; }
    }
    if (!placed) { emptySlots.shift(); }   // 全零——原版同（num9 走到 -1 无放置即出循环）
    else if (emptySlots[0] === slot) emptySlots.shift();   // placeBank 已 splice
  }
  // ④ 溢出回背包原币槽（:1169-1184——自高档而低）
  while (invCoinSlots.length > 0) {
    let placed = false;
    for (let t = 3; t >= 0 && !placed; t--) {
      if (amounts[t] > 0) {
        const slot = invCoinSlots[0];
        const ms = maxStackOf(t);
        const n = Math.min(amounts[t], ms);
        inv.slots[slot] = { id: coinInternalId[t], stack: n } as Inventory['slots'][number];
        amounts[t] -= n;
        tookFromPlayer = false;                      // flag=false（有币回手）
        invCoinSlots.shift();
        placed = true;
      }
    }
    if (!placed) break;
  }
  return before - countCoins(inv.slots as SrcItem[]);
}

function countCoins(items: SrcItem[]): number {
  let n = 0;
  for (const it of items) {
    if (!it) continue;
    const v = vanillaIdOfItem(it.id);
    if (v >= 71 && v <= 74) n += it.stack * Math.pow(100, v - 71);
  }
  return n;
}

// ---------------------------------------------------------------------------
// 储物面板 Loot All 通道（ChestUI.LootAll；2026-08-31 台账"多通道 vault 允许面"清偿）
// ---------------------------------------------------------------------------

/** ChestUI.LootAll 的 settings 二选一（ChestUI.cs:391-392）：
 *  `player.chest > -1`（真箱 = 本仓 openChest.x ≥ 0 的世界宝箱）→ GetItemSettings.
 *  LootAllFromChest，CanGoIntoVoidVault=true（GetItemSettings.cs:12-13）；bank 面板
 *  （存钱罐 -2 / 保险箱 -3 / 守护者熔炉 -4 / 虚空袋 -5,ChestUI.cs:414-465 分支）→
 *  LootAllFromBank = default,CanGoIntoVoidVault=false。即只有从真箱往背包拉取的
 *  溢流面可进虚空保险库,bank 自身面板不进。 */
export function chestSettingsAllowsVault(openChestX: number | undefined): boolean {
  return !(openChestX !== undefined && openChestX < 0);
}

/** ChestUI.LootAll（ChestUI.cs:389-412）：容器全物逐槽 `player.GetItem(chest.item[i],
 *  settings)`——主背包优先吸收（FillAmmo→Occupied→Empty 汇流顺序由 Inventory.add
 *  承载）,装不下的余量留在原格。溢流段为 vault 允许通道：settings.CanGoIntoVoidVault
 *  && IsVoidVaultEnabled && CanVoidVaultAccept 三重门后经 Player.GetItem_VoidVault
 *  （Player.cs:39710）灌 bank4（GetItemSettings.cs:12 收尾汇流门 :39703）。vault 拒收
 *  面（questItem/3822,Player.CanVoidVaultAccept :39733-39745）与 DoCoins 尾随
 *  （:39844-39847 主背包同下标位结算）都在 Player.depositIntoVoidVault 内闭环,
 *  本函数只把"是否允许进袋"的表达面按上面 settings 规则传入。
 *  @param voidSpill 由调用方按 chestSettingsAllowsVault 决定是否携带（绑
 *  player.depositIntoVoidVault）；返回值=仍未入袋余量。
 *  @param opts.skipFavorited 收藏锁（ChestUI.cs:443-452：bank4/虚空袋面板 -5 支
 *  `!item.favorited` 门槛 :447——唯一带此判定的容器分支；真箱/猪猪/保险箱/熔炉
 *  分支无收藏锁）。收藏物可经 UI 拖拽落进 bank4 格（heldStack favorited 透传），
 *  vault 面板 Loot All 时按原文跳过不拉取。
 *  @returns 有任何实际搬移（入包或溢流入袋）时 true */
export function lootAllFromContainer(
  inv: Inventory,
  items: Array<{ id: number; stack: number; prefix?: number; favorited?: boolean } | null>,
  voidSpill?: ((itemId: number, stack: number) => number) | undefined,
  opts?: { skipFavorited?: boolean },
): boolean {
  let anyMoved = false;
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (!cur || cur.stack <= 0) continue;
    if (opts?.skipFavorited && cur.favorited) continue;   // ChestUI.cs:447 收藏锁（-5 面板支）
    const before = cur.stack;
    let left = inv.add(cur.id, before, cur.prefix);   // 词缀随新放置槽写入,合并保留现有堆词缀
    if (left > 0 && voidSpill) left = voidSpill(cur.id, left);
    if (left === 0) items[i] = null;
    else cur.stack = left;
    if (left !== before) anyMoved = true;
  }
  return anyMoved;
}

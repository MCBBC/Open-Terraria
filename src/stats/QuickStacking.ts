// 附近箱子快速堆叠（Terraria.GameContent/QuickStacking.cs 1:1 + NearbyChests.cs
// + ChestUI.MoveCoins 存币段。2026-09-01 起头注与正文行号一律双版标
//  「1457 行号 / 1456 行号」——两版仅有 Invariant.Assert 断言插入与
//  PackQuickStackableItems 的 `&&`→`&`（1456:372→1457:384）之差，无行为面变化,
//  行号平移规则： Banks 段前 +1/+8、宝箱包装位后 +9/+10、IndicateBlockedChests 后
//  +11、FillStack 尾断言（1456:520→1457:532）后 +12。基线按 CLAUDE.md 以 1457 为准。
// 入口：Player.QuickStackAllChests（Player.cs:22904-22911）——
//   smartStack = Settings.StackToChestsPreferredMode == Smart → QuickStackToNearbyInventories：
//   （:232 / 1456 :224）
//   ① QuickStackToNearbyBanks：附近 bank（tile sheet 29 存钱罐 / 97 保险箱 /
//      463 守护者熔炉 / 491 虚空vault，600px 盒扫 ×2num+1 方格,NearbyChests.cs:33-91）
//      先 ChestUI.MoveCoins 合币 + VisualizeChestTransfer_CoinsBatch 可视化
//      （:243-244 / 1456 :235-236），再走通用 Transfer（includeVoidBag=false；bank 径
//      断言永零 blocked——bank 无 locked 面,:248）;
//   ② QuickStackToNearbyChests：附近宝箱（锚 (x·16+16, y·16+16)=格右缘中点，
//      NearbyChests.cs:23 与玩家 position 欧氏距 ≤600，:10-31）Transfer
//      （locked → 记 transferBlocked 不动，IndicateBlockedChests 回执），
//      源件走 PackQuickStackableItems(includeVoidBag:true)（:254 / 1456 :245）。
// 源 = 背包槽 10-49（Inventory0+10 起 40 格,★不含快捷栏 0-9 / 钱币 50-53 /
// 弹药 54-58），条件 !air && !favorited && !coin（AddQuickStackableItems :391-404,
// 判式 :397 / 1456 :380-393/:386）；②臂下背包持虚空透镜 4131（player.useVoidBag）
// 时把 bank4（Bank4_0 起 bank4.maxItems 格,:386 / 1456 :375）追加为源件段——
// favorited 门对袋内件同判（:397 单判式不分来源）。
// 转移两阶段（Transfer :406-461 / 1456 :395-450）：
//   A. 逐箱建账（BuildDestinationMetricsAndStackItems :476-511 / 1456 :465-500）：
//      空格记 freeSlots、每件非空加分类层分；同型源件先 FillStack 补满箱内已有叠
//      （CanStack = 同 type + 同 prefix，Item.cs:49446），**源件被并尽即跳过该型登记**
//      （continue,:503-506 / 1456 :492-495）；未并尽的同型装 destinationsForItemTypes
//      （MatchingItemTypeDestinationList 同箱去重,:141-152）。
//   B. 残余件（同型箱有空位 → Lookup 命中首箱,:168-184 头部失格弹落）Consolidate
//      归并后 InsertIntoFreeSlot 整件入空格（:423-431 / 1456 :412-420）；smart 档再
//      加一轮：按物品分类层找 categoryScore 最高且有空位的箱整件送入
//      （TryGetBestDestinationForCategory :513-526，locked → transferBlocked，
//      :432-451 / 1456 :421-440）。
// 视觉/回执（BroadcastOrRequest 面）：FillStack（:533 / 1456 :522）与
// InsertIntoFreeSlot（:564 / 1456 :553）每次实际搬运各发一枚 ItemTransfer 编排
// （type=当次搬运物品,Chest.VisualizeChestTransfer Chest.cs:312-321,uniqueInfo 低
// 24 位 item id|高字节 settings 位）;PlayerToChest settings 四旗全真
// （Chest.cs:30-36 bits RandomizeStart|RandomizeEnd|TransitionIn|Fullbright）。
// blocked 双回执：源槽级 = RestoreToPlayer 里 ItemSlot.IndicateBlockedSlot
// （:360-363 / 1456 :349-352）——★Q-F9 起随返回值 blockedSlots: number[] 出站,
//   Game→UI 经 .sw-blocked-pulse 通道呈现;目的箱级 = IndicateBlockedChests →
// Chest.IndicateBlockedChest（Chest.cs:3578-3598,箱锚红图标 60t 上浮）。
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import type { Inventory } from '../items/Inventory';
import type { ChestData } from '../world/World';
import { TILE_INTERNAL_BY_SHEET } from '../data/tiles';
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
/** 槽数组视图（Chest.item / bank4 皆满足；favorited 只在背包/bank4 面真实存在） */
export type SlotArray = Array<{ id: number; stack: number; prefix?: number; favorited?: boolean } | null>;

/** VisualizeChestTransfer 的 PlayerToChest settings 位面（Chest.cs:30-36 四旗全真
 *  RandomizeStart|RandomizeEnd|TransitionIn|Fullbright → BitsByte=0b1111 << 24）。
 *  ★Q-F4 跨端形差备忘：仓内消费端 orchestraFx.itemTransferFx 只读 bit0（散布项圈）
 *  ——高三位仍按原版值写入载荷（net 对拍形差已在协议注释登记），消费端不改。 */
export const ITEM_TRANSFER_PLAYER_TO_CHEST_BITS = 0b1111 << 24;

/** bank 盒扫命中项：bi=槽位序（0 存钱罐/1 保险箱/2 守护者熔炉/3 虚空vault）、
 *  tx/ty=首遇锚格（Visualize* 的 item.position=(tx·16+16, ty·16+16) 取此）、items=bank 本体 */
export interface BankScanHit { bi: number; tx: number; ty: number; items: SlotArray }

/** NearbyChests.GetBanksInRangeOf tile 段（NearbyChests.cs:61-89 两版同文）1:1：
 *  num=(int)(range/16+2)=39（600px 缺省），玩家中心格 ±num 的 (2n+1)² 盒逐格；
 *  case 面（:68-82）：sheet 29→-2 存钱罐 / 97→-3 保险箱 / 463→-4 熔炉 / 491→-5 vault。
 *  ★Q-F1 修复锚：本仓内部 tile id ≠ 原版 sheet id——直比 `[29,97,463,491]` 恒不命中。
 *  经 TILE_INTERNAL_BY_SHEET（tiles.ts:957-967,首个同 sheet def 下标,与
 *  vanillaRecipes.ts SHEET_TO_INTERNAL ts:292-299 同构先例 :156 反查）落表，
 *  四 sheet 内部真值 = 29→83(v_29_piggy_bank) / 97→235(v_97_safe) /
 *  463→84(v_463_defenders_forge) / 491→230(v_491_void_vault)——未注册 sheet 无键跳过
 *  （≈原文 switch default 不赋 container）。重复 bank 以首遇格为准去重
 *  （原文 !scratch.Contains(bank) 同语义,:83）；voidVaultHeld=背包 58 格任一 5325
 *  （ContainerIndexToPlayerBank -5 支 :119-130,vault 格不计）。 */
export function nearbyBanksInRange(
  store: Pick<{ w: number; h: number }, 'w' | 'h'>
    & { inBounds(x: number, y: number): boolean; idx(x: number, y: number): number; type: ArrayLike<number> },
  centerTileX: number, centerTileY: number,
  banks: ReadonlyArray<SlotArray | null | undefined>,
  voidVaultHeld: boolean,
  rangePx = 600,
): BankScanHit[] {
  const num = Math.trunc(rangePx / 16 + 2);
  const out: BankScanHit[] = [];
  const seen = new Set<number>();
  // sheet→internal 预解析（TILE_INTERNAL_BY_SHEET=tiles.ts 全表；未注册 sheet 无键）
  const biByInternal = new Map<number, number>();
  [29, 97, 463, 491].forEach((sh, bi) => {
    const tid = TILE_INTERNAL_BY_SHEET.get(sh);
    if (tid !== undefined) biByInternal.set(tid, bi);
  });
  for (let j = centerTileX - num; j <= centerTileX + num; j++) {
    for (let k = centerTileY - num; k <= centerTileY + num; k++) {
      if (!store.inBounds(j, k)) continue;
      const t = store.type[store.idx(j, k)];
      if (!t) continue;
      const hitBi = biByInternal.get(t);
      if (hitBi === undefined || seen.has(hitBi)) continue;
      if (hitBi === 3 && voidVaultHeld) continue;      // ContainerIndexToPlayerBank :119-130
      const bank = banks[hitBi];
      if (!bank) continue;                              // bank 缺席跳过该格（原文 out=false → 扫描继续）
      seen.add(hitBi);
      out.push({ bi: hitBi, tx: j, ty: k, items: bank });
    }
  }
  return out;
}

/** 源件收集（PackQuickStackableItems :379-389/:368-378 + AddQuickStackableItems
 *  :391-404/:380-393）：段 1 = 背包 10-49（Inventory0+10 起 40 格,恒有——
 *  includeVoidBag 与否不影响此段）；段 2（includeVoidBag 臂）= bank4 袋面 0 起
 *  maxItems 格。两段共享同一判式 !air && !favorited && !coin（:397 单判式——
 *  favorited 门对袋内件同样生效）。CanStack = 同 type + 同 prefix。 */
function packQuickStackable(
  inv: Inventory,
  includeVoidBagSources: ReadonlyArray<SlotArray> = [],
): { slots: Array<{ arr: SlotArray; index: number }>; items: SrcItem[]; blocked: boolean[] } {
  const slots: Array<{ arr: SlotArray; index: number }> = [];
  const items: SrcItem[] = [], blocked: boolean[] = [];
  const addSegment = (arr: SlotArray, base: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const s = arr[base + i] as SrcItem;
      if (!s || s.stack <= 0 || s.favorited) continue;
      const vid = vanillaIdOfItem(s.id);
      if (vid >= 71 && vid <= 74) continue;   // IsACoin（71-74）
      slots.push({ arr, index: base + i });
      items.push(s);
      blocked.push(false);
    }
  };
  addSegment(inv.slots as SlotArray, 10, 40);   // AddQuickStackableItems(player, inv, Inventory0+10, 40)
  // PackQuickStackableItems `player.useVoidBag() & includeVoidBag` 臂（useVoidBag 判定
  // 由调用侧 Game 以 4131 在场评估后透传袋面;空数组＝入选零件,行为面等价）
  for (const seg of includeVoidBagSources) addSegment(seg, 0, seg.length);
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
  /** ItemTransfer 编排序列（QuickStacking.cs:533 FillStack/:564 InsertIntoFreeSlot 每次实际
   *  搬运各广播一枚,type=当次搬运物品）——Game 端逐帧播放,broadcast 每帧一条 */
  transferVids: number[];
  freeSlots: number[];
  freeStart: number;
  categoryScores: Map<number, number>;
  /** 本箱已入 destinationsForItemTypes 的类型（同箱去重，MatchingItemTypeDestinationList
   *  的 entries[num].value != value 检查） */
  listedTypes: Set<number>;
}

/** Chest.IsEmpty（Chest.cs）——全空槽 */
const chestIsEmpty = (c: ChestData): boolean => c.items.every((it) => !it || it.stack <= 0);

/** 快堆主链（QuickStackToNearbyChests :252-268/:243-259 + Transfer :406-461/:395-450）。
 *  @param opts.voidVaultSource PackQuickStackableItems(includeVoidBag:true) 臂
 *  （:254 调用点 → :384-386 门）——Game 侧按 player.useVoidBag()（背包 58 格任一
 *  虚空透镜 4131,Player.ts useVoidBag）评估后传入 banks[3]（虚空vault袋面）本体;
 *  缺省/null = 原文 includeVoidBag:false（bank 径）。
 *  返回受影响箱（供 UI 发光/音效）、被锁阻塞标记与逐帧 ItemTransfer 序列 */
export function quickStackToChests(
  inv: Inventory,
  chests: readonly ChestData[],
  smartStack: boolean,
  opts?: { voidVaultSource?: SlotArray | null },
): { touched: ChestData[]; blocked: ChestData[];
     /** ItemTransfer 编排载荷（VisualizeChestTransfer Chest.cs:312-321 每搬一枚）：
      *  箱 → 本次迁入的物品型序列（FillStack→InsertIntoFreeSlot 时间序） */
     movedVids: Map<ChestData, number[]>;
     /** ★Q-F9 槽级 blocked 回执半边（RestoreToPlayer :360-363 flag 支 →
      *  ItemSlot.IndicateBlockedSlot :527 = AddPulseEffect(250,40,40)。原版回执门：
      *  transferBlocked[j] 且源件仍非空（AddPulseEffect !item.IsAir :535-538——
      *  被并尽的源件不闪）。元素 = 打包段槽号（主段 10-49 背包槽号；includeVoidBag
      *  臂下为 bank4 槽号——袋面槽 DOM 通道本仓未挂,Game/UI 侧查不到即静默,
      *  形差登记于 emitQuickStackResultFx 注）。bank 径恒空（Invariant.Assert !blocked）。 */
     blockedSlots: number[] } {
  const src = packQuickStackable(inv,
    opts?.voidVaultSource ? [opts.voidVaultSource] : []);   // :379-389 两段收集
  const dests: DestHelper[] = [];
  const typesToList = new Map<number, DestHelper[]>();
  for (const c of chests) {
    if (chestIsEmpty(c)) continue;              // :415 !destination.chest.IsEmpty() 门
    const d: DestHelper = {
      chest: c, items: c.items, locked: !!c.locked, transferBlocked: false, mutated: false,
      transferVids: [],   // L5 长尾批→Q-F5:逐帧序列（每次实际搬运一帧）
      freeSlots: [], freeStart: 0, categoryScores: new Map(), listedTypes: new Set(),
    };
    dests.push(d);
    buildDestinationMetrics(src, d, typesToList);
  }
  const insertIntoFreeSlot = (srcIdx: number, d: DestHelper) => {
    // InsertIntoFreeSlot（:562-568 / 1456 :550-556）：先 Visualize 后 Swap
    if (src.items[srcIdx]) d.transferVids.push(vanillaIdOfItem(src.items[srcIdx]!.id));
    const slot = d.freeSlots[d.freeStart];
    d.freeStart++;
    d.items[slot] = src.items[srcIdx];                // Utils.Swap（源格清空在写回）
    src.items[srcIdx] = null;
    d.mutated = true;                                 // VisualizeChestTransfer 等价记录
  };
  // ---- B 阶段：同型空位直送（:423-431 / 1456 :412-420）----
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
  // ---- smart 档：分类层最适箱整件送（:432-451 / 1456 :421-440）----
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
  // ---- RestoreToPlayer（:345-365 / 1456 :334-355）：源槽写回（null = 清格）；
  //      覆盖面 = 两段收集位（背包 + includeVoidBag 臂下的 bank4 袋格）。
  //      ★Q-F9：flag 支回执面 = transferBlocked[j] 且源件仍在槽（:358 flag 判定 +
  //      AddPulseEffect !IsAir 门）——被并尽格不闪。槽号取打包段 index 原值。 ----
  const blockedSlots: number[] = [];
  for (let i = 0; i < src.slots.length; i++) {
    const ref = src.slots[i];
    ref.arr[ref.index] = src.items[i] as SlotArray[number];
    if (src.blocked[i] && src.items[i]) blockedSlots.push(ref.index);
  }
  const movedVids = new Map<ChestData, number[]>();
  for (const d of dests) {
    if (d.mutated && d.transferVids.length) movedVids.set(d.chest, d.transferVids);
  }
  return {
    touched: dests.filter((d) => d.mutated).map((d) => d.chest),
    blocked: dests.filter((d) => d.transferBlocked).map((d) => d.chest),
    movedVids,
    blockedSlots,
  };
}

/** BuildDestinationMetricsAndStackItems（:476-511 / 1456 :465-500）：空格记账 +
 *  分类层计分 + 同型补叠（FillStack,源并尽即 continue 跳同型登记）+ 同型登记 */
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
          d.transferVids.push(vanillaIdOfItem(cs.id));   // FillStack 先 Visualize（Chest.cs:533）
          cs.stack += n;
          s.stack -= n;
          if (s.stack <= 0) src.items[j] = null;
          d.mutated = true;      // VisualizeChestTransfer 视觉=itemTransferFx 接线
          //                       （movedVids 载荷经返回值交 Game 直播,Q-F5 起逐帧）
        }
        // QuickStacking.cs:503-506（1456 :492-495）：源件已被并尽（IsAir→TurnToAir）
        // → continue 跳过同型登记——装空的型不进 destinationsForItemTypes，
        // 免得残余同型件被 B 阶段 Lookup 二次送入空格（Q-F8 边窗回归见批测试）
        if (!src.items[j]) continue;
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

/** Consolidate（:543-560 / 1456 :531-548）：把同型后位源件归并进第 i 件（i 自身将整件入箱） */
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

// ============ bank 存币段（QuickStackToNearbyBanks :238-250 / 1456 :230-242）============

/** ChestUI.MoveCoins（ChestUI.cs:998-1208）1:1：bank 既有币位 + 背包非收藏币
 *  （IsACoin 71-74，j≠58）合池 → 100:1 进位 → ①原币位同档回填 → ②余下原币位
 *  自高档而低 → ③其余空槽自高档而低 → ④溢出回背包原币槽（自高档而低）。
 *  bank 无任何既有币（flag2 门 :1044-1047）不收币直接 0。返回玩家侧净转移铜值。
 *  @param out Q-F6 出参臂——ChestUI.cs:1000/:1071/:1185/:1196-1198 的 flag 支尾
 *  等价（flag=自玩家拿过币且未走④回手）→ SoundEngine.PlaySound(7) 条件；调用方
 *  以 out.playSound7 驱动仓内 sfx 播放位（本函数不碰 Audio 域） */
export function moveCoinsIntoBank(
  inv: Inventory,
  bank: Array<{ id: number; stack: number; prefix?: number } | null>,
  out?: { playSound7?: boolean },
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
  if (!hadBankCoins) {
    if (out) out.playSound7 = false;                // 未到池化段,flag 恒假（ChestUI.cs:1000 初值）
    return 0;                                       // :1044-1047
  }
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
  // flag 支尾（ChestUI.cs:1196-1198）：flag = 自玩家拿过币（:1071）且未全数经④回手
  // （:1185 归假）→ PlaySound(7)。回执交调用方播放
  if (out) out.playSound7 = tookFromPlayer;
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

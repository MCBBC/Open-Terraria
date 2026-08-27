// EmergencyStacking.cs（1.4.5.8 Terraria.GameContent，454 行）1:1 移植。
// 触发：Main.item 满槽（NewItem 扫 0..399 无空槽、无可回收 pickup）时的腾位算法——
// 把地上可堆叠物品按【保存优先级组】就近合并（曼哈顿 ≤2400），释放槽位给新掉落物。
// 组与步长（:20-45/123-131）：RareCurrency{73,74,3822} ÷4 / Equipment(仅需持有一件)
// / SilverCoins{72} / CopperCoins{71} / FallenStars{75} ×4 / Default 全体，步长基 160。
// 优先级 StackingPriority = 保存序倒序（Rare=6 … Default=1，:336-347）。
// 单人语义：HasOwnership 恒真（双方 myPlayer）、PendingTransfers 同步清空（netMode≠2）。
import type { ItemDrop } from '../entities/ItemDrop';

export interface StackCtx {
  vidOf: (d: ItemDrop) => number;
  maxStackOf: (d: ItemDrop) => number;
  /** OnlyNeedOneInInventory（Item.cs:1177）+ Override 表（ItemID.cs:1224-1281） */
  onlyNeedOne: (vid: number) => boolean;
  /** 玩家可视域中心列表（PlayerViewRectSize 2320×1600，:104 Main.player 全活玩家） */
  viewCenters: Array<{ x: number; y: number }>;
  /** MP 所有权门（原版语义：netMode==2 时算法只在服务器跑，Main.item 全量
   *  本地自有 → HasOwnership 恒真；本仓所有权分散在生成端，傀儡=他端所有——
   *  搬运 Foreign 堆会导致双端各改各的，必须只在自己拥有的堆之间合并。
   *  缺省 = 单人（全数自有） */
  mpOwned?: (d: ItemDrop) => boolean;
  /** OnReachingMaxStack（:436-449）：钱币堆满升面（71→72→73→74） */
  promoteCoin: (d: ItemDrop) => void;
}

const STEP = 160;                    // DefaultStackDistanceStepSize :21
const MAX_TRANSFER_DISTANCE = 2400;  // :107
const ON_SCREEN_PENALTY = 3;         // OnScreenDistancePriorityPenalty :109
const ITEMS_TO_STACK_EACH_TIME = 20; // :108
const VIEW_W = 2320, VIEW_H = 1600;  // PlayerViewRectSize :103

interface Group { priority: number; step: number; types?: number[]; equip?: boolean; all?: boolean }

// PreservationOrder（:123-131）注册序 = 保存优先级从高到低
const GROUPS: Group[] = [
  { priority: 6, step: STEP / 4, types: [73, 74, 3822] },   // RareCurrency（:43-45 ÷4）
  { priority: 5, step: STEP, equip: true },                 // Equipment（:46-48）
  { priority: 4, step: STEP, types: [72] },                 // SilverCoins（:50-52）
  { priority: 3, step: STEP, types: [71] },                 // CopperCoins（:53-55）
  { priority: 2, step: STEP * 4, types: [75] },             // FallenStars（:38-40 ×4）
  { priority: 1, step: STEP, all: true },                   // Default（:56-58）
];

/** GroupLookup（:336-347，按 type 缓存组归属；OnlyNeedOneInInventory 是 type 级数据） */
const groupCache = new Map<number, Group>();
function groupOf(vid: number, onlyNeedOne: (vid: number) => boolean): Group {
  let g = groupCache.get(vid);
  if (g) return g;
  for (const grp of GROUPS) {
    if (grp.all) { g = grp; break; }
    if (grp.equip) { if (onlyNeedOne(vid)) { g = grp; break; } continue; }
    if (grp.types!.includes(vid)) { g = grp; break; }
  }
  g = g ?? GROUPS[GROUPS.length - 1];
  groupCache.set(vid, g);
  return g;
}

interface Memo { d: ItemDrop; vid: number; age: number; onScreen: boolean }
interface Transfer { src: Memo; dst: Memo; distanceOrder: number; preservationOrder: number; distance: number }

/** IsPreferredDestination（:72-83）：onScreen 优先 → 年轻优先 → 槽位号优先 */
function isPreferredDestination(a: Memo, b: Memo): boolean {
  if (a.onScreen !== b.onScreen) return a.onScreen;
  if (a.age !== b.age) return a.age < b.age;
  return a.d.id < b.d.id;
}

function transferCompare(a: Transfer, b: Transfer): number {
  if (a.distanceOrder !== b.distanceOrder) return a.distanceOrder - b.distanceOrder;
  if (a.preservationOrder !== b.preservationOrder) return a.preservationOrder - b.preservationOrder;
  return a.distance - b.distance;
}

/** AddToOrderedList（:407-421）：按 CompareTo 有序插入，上限 limit（挤掉末位） */
function addToOrderedList(list: Transfer[], limit: number, item: Transfer): void {
  let i = 0;
  while (i < list.length && transferCompare(item, list[i]) >= 0) i++;
  if (i === limit) return;
  if (list.length === limit) list.pop();
  list.splice(i, 0, item);
}

/** EmergencyStackItemsToMakeSpace（:232-243）——满槽腾位。freed=是否释放了槽位；
 *  touched = stack 被本轮搬运改动且仍存活的堆（MP 即刻同步用，SP 空消费无害） */
export function emergencyStackItemsToMakeSpace(
  drops: ItemDrop[],
  ctx: StackCtx,
): { freed: boolean; touched: ItemDrop[] } {
  const limit = Math.max(ITEMS_TO_STACK_EACH_TIME, 1);
  const rects = ctx.viewCenters.map((c) => ({
    x: c.x - VIEW_W / 2, y: c.y - VIEW_H / 2, w: VIEW_W, h: VIEW_H,
  }));
  // MemoStackableItems（:800-820）：活/stack<maxStack/未微光/槽未冷却
  // （MP：外加上下文所有权门——傀儡/私有实例不可参与搬运，见 mpOwned 注）
  type Memo = { d: ItemDrop; vid: number; age: number; onScreen: boolean };
  const memo: Memo[] = [];
  for (const d of drops) {
    if (d.dead) continue;
    if (ctx.mpOwned && !ctx.mpOwned(d)) continue;
    const vid = ctx.vidOf(d);
    const max = ctx.maxStackOf(d);
    if (!(d.stack < max)) continue;
    if (d.shimmerTime !== 0) continue;
    const cxp = d.x + 6, cyp = d.y + 6;   // item.Center（本仓掉落盒 12×12）
    memo.push({
      d, vid, age: d.age,
      onScreen: rects.some((r) => cxp >= r.x && cxp < r.x + r.w && cyp >= r.y && cyp < r.y + r.h),
    });
  }
  // FindBestTransfers（:860-935）：每 src 找最优 dst（同 type、非优先方向、
  // CanStack=同 type 同 prefix、曼哈顿 ≤2400），序 = 距离档(含屏幕 +3)→保存级→距离
  type Transfer = { src: Memo; dst: Memo; distanceOrder: number; preservationOrder: number; distance: number };
  const pending: Transfer[] = [];
  for (const a of memo) {
    let best: Transfer | null = null;
    for (const b of memo) {
      if (a.vid !== b.vid || a.d === b.d || isPreferredDestination(a, b)) continue;
      if (a.d.prefix !== b.d.prefix) continue;         // Item.CanStack（Item.cs:49870）
      const dx = Math.abs((a.d.x + 6) - (b.d.x + 6));
      const dy = Math.abs((a.d.y + 6) - (b.d.y + 6));
      const dist = dx + dy;
      if (dist > MAX_TRANSFER_DISTANCE) continue;
      const grp = groupOf(a.vid, ctx.onlyNeedOne);
      const t: Transfer = {
        src: a, dst: b,
        distanceOrder: Math.floor(dist / grp.step) + (a.onScreen ? ON_SCREEN_PENALTY : 0),
        preservationOrder: grp.priority,
        distance: dist,
      };
      if (!best || transferCompare(t, best) < 0) best = t;
    }
    if (best) addToOrderedList(pending, limit, best);
  }
  // ProcessPendingTransfers（:247-270）：顺序执行 + 链式重定向（dst 被前一笔搬空
  // → 顺链找最终落点）。MP 段差异备案：原版 netMode==2 把每笔记入 PendingTransfers
  // 留服务器增量处理并对 src/dst 各发一次 SendData(21)；本仓合并在触发端一步到
  // 位，被改堆经 touched 由调用方即刻 op0 广播（等价于那两次 SendData），
  // 所有权释放/HasPendingTransfersInvolving 守卫由此不需要——搬运只发生在本端
  // 自有堆之间（mpOwned 门），他端无悬挂引用可释放。
  let freed: number | null = null;
  const touched = new Set<ItemDrop>();
  for (let i = 0; i < pending.length; i++) {
    const tr = pending[i];
    let dst = tr.dst;
    let k = i - 1;
    while (dst.d.dead && k >= 0) {
      if (pending[k].src === dst) dst = pending[k].dst;
      k--;
    }
    const src = tr.src;
    // DoTransfer（:370-400）：HasOwnership 单人恒真；n = CanStack ? min(src,dst 余) : 0
    const n = src.vid === dst.vid && src.d.prefix === dst.d.prefix
      ? Math.min(src.d.stack, ctx.maxStackOf(dst.d) - dst.d.stack) : 0;
    if (n <= 0) continue;
    src.d.stack -= n;
    dst.d.stack += n;
    touched.add(dst.d);
    if (src.d.stack > 0) touched.add(src.d);
    if (src.d.stack <= 0) {
      src.d.dead = true;
      freed = freed === null ? src.d.id : Math.min(freed, src.d.id);
    }
    // OnReachingMaxStack（:436-449）：钱币堆满升面
    if (dst.d.stack === ctx.maxStackOf(dst.d)) ctx.promoteCoin(dst.d);
  }
  // 单人：ProcessPendingTransfers 尾段 PendingTransfers.Clear()（netMode≠2）同义；
  // touched = stack 被改的存活堆（src 半搬走剩余 + dst 合并后，含升面换物）
  return { freed: freed !== null && freed < 400, touched: [...touched] };
}

// ★SW-BJ81 2026-09-14 —— 道具搜索取件规则纯函数（用户规格②⑤⑥）。
// 本面 = FX39 停车坪自创 QoL（main.ts openInGamePause onItemSearch 入口），原版
// 无对应物 = Web 便利档——规格以用户令为准，1457 反编译仅作交互惯例参照。
//
// 规格⑤：点搜出项 = 道具上光标，复用仓内既有合成抓取路径（UI.grantCraftToCursor
// → UI.heldStack 光标持物，markCursorGlow SM2 MouseItem 辉光同款反馈）；落点由
// 玩家放置决定——点物品栏槽 = 放入（SlotActions 路由面），点世界 = 左键使用/放置
// （SW-AZ1 光标镜像槽 58 支）/ 右键丢出（DropSelectedItem 臂），与合成抓取的
// 放置语义全同。
// 规格②：单次取件量恒 1（旧实现可堆叠给 min(maxStack,99) 整组 = 废止）。
// 规格⑥：长按持续 +1——仓内合成面无按住连加先例（证据：craftingGrid.ts/
// modernCrafting.ts 零 setInterval/连抓实现，grep 定谳 2026-09-14），取用户规格
// 档 ~8/s；上限 = 该物品 maxStack（并入钳制走 grantCraftToCursor 既有算式）。
import { canMergeStack } from './SlotActions';

/** 长按连取节奏：125ms/件 ≈ 8 件/s（用户规格档；合成面无先例可抄，见头注） */
export const ITEMSEARCH_GRAB_INTERVAL_MS = 125;

/** 单次取件量（规格②：恒 1） */
export const ITEMSEARCH_GRAB_COUNT = 1;

/** 光标持物形（与 UI.heldStack 同构的只读面） */
export interface CursorStackLike {
  id: number;
  stack: number;
  prefix?: number;
  placeStyle?: number;
  favorited?: boolean;
}

/** 点击搜出项 → 取件计划：
 *  · 光标空 / 同物可并（canMergeStack，★SW-AY1 R1 谓词单源）→ `'cursor'`
 *    （执行器 = UI.grantCraftToCursor：空光标挂 1 / 可并位 +1 / 满叠余量由调用方
 *    落地——合成成品上光标同款）；
 *  · 光标被异型占据 → `'inventory'` 兜底入包。直接覆盖光标 = 静默丢玩家持物
 *    （词缀/收藏/实例样式随光标流转），禁。 */
export function searchGrabPlan(
  held: CursorStackLike | null,
  id: number,
): { to: 'cursor' | 'inventory'; stack: number } {
  const mergeable = !held || canMergeStack(held, { id });
  return mergeable
    ? { to: 'cursor', stack: ITEMSEARCH_GRAB_COUNT }
    : { to: 'inventory', stack: ITEMSEARCH_GRAB_COUNT };
}

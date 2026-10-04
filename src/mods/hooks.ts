// L2 脚本 mod 运行时钩子注册表(2026-10-04,P1)。
// 设计纪律(design.md §2.3):
//   ① 空注册零成本——各 run*/take* 首行按 Map.size/length 短路,热路径无 try/catch
//     (tML 同哲学:mod=可信代码,错误 loud 暴露,不做 per-frame 包装);
//   ② 注册只发生在 loader 脚本相位(启动链 L1 注册之后),运行期无并发写;
//   ③ fail-fast 重复注册(对齐 plan-A 双射纪律);
//   ④ import type 单向——本文件不 import Game/Enemy 运行时面(零环)。
import type { Enemy } from '../entities/Enemy';
import type { Game } from '../core/Game';
import type { Player } from '../entities/Player';
import type { ItemDef } from '../data/items';
import type { InvItem } from '../items/Inventory';
import { MOD_ITEM_STABLE_BASE, MOD_NPC_ID_BASE } from './types';

/** mod 物品 use 上下文(updateUse 预分流点供给) */
export interface ModUseCtx {
  game: Game;
  player: Player;
  item: InvItem;
  def: ItemDef;
  /** 钳后目标 tile 坐标(updateUse 的 tx/ty,世界缘钳后) */
  tileX: number;
  tileY: number;
  mouseX: number;
  mouseY: number;
  /** 返回 true=已消费(updateUse 立即 return;useTime 节奏由 handler 自管,
   *  与 digtoise/无人机原版专支同语义) */
}

/** mod 系统/世界生命周期钩子(全可选) */
export interface ModSystemHooks {
  /** fixedUpdate 头(mouseOvers/tickCount 之后、一切系统之前) */
  preUpdate?: (game: Game, dt: number) => void;
  /** entities.update 之后(实体桶 enemies→drops→npcs→projectiles 全部步进完) */
  postEntities?: (game: Game, dt: number) => void;
  /** postUpdate 头(联机 tick 前) */
  postUpdate?: (game: Game) => void;
  /** afterWorldLoad 尾(新世界/读档全链落定) */
  onWorldLoad?: (game: Game) => void;
  /** Game.destroy(退世界/换世界拆实例) */
  onWorldUnload?: (game: Game) => void;
}

const npcAi = new Map<number, (e: Enemy, game: Game, player: Player | null) => void>();
const itemUse = new Map<number, (ctx: ModUseCtx) => boolean>();
const systems: ModSystemHooks[] = [];

export function registerNpcAi(npcId: number, fn: (e: Enemy, game: Game, player: Player | null) => void): void {
  if (!(npcId >= MOD_NPC_ID_BASE)) throw new Error(`[mod-hooks] npcId 须 ≥${MOD_NPC_ID_BASE}: ${npcId}`);
  if (npcAi.has(npcId)) throw new Error(`[mod-hooks] npc AI 重复注册: ${npcId}`);
  npcAi.set(npcId, fn);
}

export function registerItemUse(vid: number, fn: (ctx: ModUseCtx) => boolean): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-hooks] vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (itemUse.has(vid)) throw new Error(`[mod-hooks] item use 重复注册: ${vid}`);
  itemUse.set(vid, fn);
}

export function registerSystem(hooks: ModSystemHooks): void {
  systems.push(hooks);
}

/** Enemy.fixedUpdate AI 派发缝:mod NPC(800+)带自定义 ai 时返回处理器(接管整支,
 *  共享尾段照走);否则 null=原版 aiStyle switch 照旧。null vanillaId/原版域=零成本。 */
export function takeModNpcAi(vanillaId: number | null): ((e: Enemy, game: Game, player: Player | null) => void) | null {
  if (vanillaId === null || vanillaId < MOD_NPC_ID_BASE || npcAi.size === 0) return null;
  return npcAi.get(vanillaId) ?? null;
}

/** updateUse 预分流:mod 物品带 use 处理器时调用之;返回 true=已消费。 */
export function runModItemUse(
  game: Game, def: ItemDef | null, item: InvItem | null, tileX: number, tileY: number,
): boolean {
  if (itemUse.size === 0 || !def || !item) return false;
  const vid = def.vid;
  if (vid === undefined || vid < MOD_ITEM_STABLE_BASE) return false;
  const fn = itemUse.get(vid);
  if (!fn) return false;
  return fn({
    game, player: game.player, item, def, tileX, tileY,
    mouseX: game.input.mouseX, mouseY: game.input.mouseY,
  });
}

export function runModPreUpdate(game: Game, dt: number): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.preUpdate?.(game, dt);
}

export function runModPostEntities(game: Game, dt: number): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.postEntities?.(game, dt);
}

export function runModPostUpdate(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.postUpdate?.(game);
}

export function runModOnWorldLoad(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.onWorldLoad?.(game);
}

export function runModOnWorldUnload(game: Game): void {
  if (systems.length === 0) return;
  for (let i = 0; i < systems.length; i++) systems[i]!.onWorldUnload?.(game);
}

/** 测试重置(模块态隔离;loader 单测同款纪律) */
export function _resetModHooksForTests(): void {
  npcAi.clear(); itemUse.clear(); systems.length = 0;
}

// 弹幕命中目标:怪物桶之外还有小动物桶(critters)。
// 原版小动物是 NPC(NPCID.Squirrel 等),任何伤害即死——近战挥砍已覆盖
// (Game 挥砍段"小动物:任何挥击一击致死"),弹幕此前漏判,箭射松鼠无效果。
import type { GameHooks } from './types';

export interface CritterLike {
  x: number; y: number; w: number; h: number;
  dead: boolean;
  /** 小动物受击:一击致死,返回是否生效(iframes 内 false) */
  hurt(game: GameHooks): boolean;
}

/** 弹幕与实体 AABB 重叠 */
export function projOverlap(ax: number, ay: number, aw: number, ah: number, e: { x: number; y: number; w: number; h: number }): boolean {
  return ax < e.x + e.w && ax + aw > e.x && ay < e.y + e.h && ay + ah > e.y;
}

/** 命中小动物:一击致死。返回是否命中(调用方按各自语义消耗穿透/销毁弹体) */
export function hitCritters(self: { x: number; y: number; w: number; h: number }, game: GameHooks): boolean {
  const list = (game as unknown as { critters?: () => unknown[] }).critters?.() ?? [];
  for (const ent of list) {
    const c = ent as CritterLike;
    if (c.dead) continue;
    if (projOverlap(self.x, self.y, self.w, self.h, c)) {
      c.hurt(game);
      return true;
    }
  }
  return false;
}

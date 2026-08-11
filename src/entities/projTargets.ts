// 弹幕命中目标:怪物桶之外还有小动物桶(critters)。
// 原版小动物是 NPC(NPCID.Squirrel 等),任何伤害即死——近战挥砍已覆盖
// (Game 挥砍段"小动物:任何挥击一击致死"),弹幕此前漏判,箭射松鼠无效果。
import type { GameHooks } from './types';
import { BuffType } from '../stats/Buffs';

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

/** 弹幕命中怪物:播受击音效(原版 NPC.StrikeNPC 语义——任意伤害来源都响,
 *  近战挥砍早已如此;弹幕此前漏了) */
export function playEnemyHitSound(game: GameHooks, e: { def?: { hitSound?: string[] } }): void {
  const files = e.def?.hitSound;
  if (files && files.length) game.playSfxFiles(files, 0.9);
}

/** 敌对弹幕命中玩家(原版 Projectile.Damage_EVP,Projectile.cs:13706-13830):
 *  - 门禁 hostile + damage>0(:13708)——调用方用 hostile 标志控制,本函数只做判定;
 *  - 玩家 dead / 无敌即跳过(:13732 player.immune)——Player.damage 自带 iframes,
 *    与原版 immune 同义去重,无需调用方另记冷却;
 *  - 相交判定 = AABB 重叠(Colliding :13749,Rect.Intersects 同构);
 *  - 伤害结算走 GameHooks.damagePlayer(= Player.Hurt 入口,含防御减算/击退/
 *    受击音/伤害数字/饰品触发)。
 *  原版敌弹命中【不消耗穿透】(:13811-13829 仅 435/436/437/681/682 特判递减),
 *  弹体照常飞行——调用方不得据此销毁弹体。
 *  返回是否【实际造成伤害】(iframes/闪避吞掉时 false,对应原版 Hurt 返回 0;
 *  StatusPlayer 的 debuff 授予以此为准,:13798-13800)。 */
export function hitPlayer(
  self: { x: number; y: number; w: number; h: number },
  game: GameHooks,
  dmg: number,
): boolean {
  if (dmg <= 0) return false;
  const p = game.player;
  if (p.dead) return false;
  if (!projOverlap(self.x, self.y, self.w, self.h, p)) return false;
  const ifr = p.iframes;
  game.damagePlayer(dmg, self.x + self.w / 2, self.y + self.h / 2);
  return p.iframes > ifr; // damage 落地才置无敌帧(闪避/无敌内不置)
}

/** 敌弹命中玩家的状态授予(原版 Projectile.StatusPlayer :11450+,仅在
 *  hitPlayer 返回 true 即 Hurt>0 后调用)。本仓库已实装弹型登记:
 *   348 FrostWave —— Chilled(46) 300/600t(:11554-11557) + Frozen(47)
 *                    概率 20/40/60t 三级(:11558-11567)
 *   349 FrostShard —— Chilled(46) 1/3→600t、否则 1/2→300t(:11569-11576)
 *  其余弹型的 debuff 链(毒/诅咒/灵液/暗影焰等)随对应批次逐条接入。 */
export function statusPlayer(game: GameHooks, projId: number): void {
  const p = game.player;
  switch (projId) {
    case 348:
      p.buffs.apply(BuffType.Chilled, (Math.random() < 0.5 ? 300 : 600) / 60);
      if (Math.random() < 2 / 3) {
        const r = Math.random();
        const t = r < 1 / 16 ? 60 : r < 1 / 12 ? 40 : r < 1 / 8 ? 20 : 0;
        if (t > 0) p.buffs.apply(BuffType.Frozen, t / 60);
      }
      break;
    case 349: {
      const r = Math.random();
      if (r < 1 / 3) p.buffs.apply(BuffType.Chilled, 600 / 60);
      else if (r < 0.5) p.buffs.apply(BuffType.Chilled, 300 / 60);
      break;
    }
    default:
      break;
  }
}

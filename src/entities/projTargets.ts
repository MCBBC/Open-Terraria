// 弹幕命中目标:怪物桶之外还有小动物桶(critters)。
// 原版小动物是 NPC(NPCID.Squirrel 等),任何伤害即死——近战挥砍已覆盖
// (Game 挥砍段"小动物:任何挥击一击致死"),弹幕此前漏判,箭射松鼠无效果。
import type { GameHooks } from './types';
import { BuffType } from '../stats/Buffs';
import { projectileData } from '../data/vanillaProjectiles';

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
/** 城镇 NPC 受击判定(玩家武器/友方弹幕/敌怪接触/巨石共用)。
 *  原版 Projectile.Damage 的 NPC 碰撞对 friendly 城镇 NPC 同样生效——
 *  杀裁缝师召骷髅王即此链;本作曾仅陷阱弹(Dart)命中城镇 NPC。
 *  TownNPC.hurt 自带 8t 无敌帧去重;返回是否实际造成伤害。 */
export function hitTownNpcs(
  self: { x: number; y: number; w: number; h: number },
  game: GameHooks,
  dmg: number,
  kbx = 0,
): boolean {
  const list = (game as unknown as { npcs?: () => unknown[] }).npcs?.() ?? [];
  let any = false;
  for (const ent of list) {
    const n = ent as {
      x: number; y: number; w: number; h: number; dead: boolean;
      hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
      bound?: boolean; talking?: boolean;
    };
    if (n.dead || typeof n.hurt !== 'function') continue;
    if (n.bound) continue; // 被缚待救不可打(近似;原版 bound 型有独立受击语义)
    if (!projOverlap(self.x, self.y, self.w, self.h, n)) continue;
    if (n.hurt(dmg, kbx, 0, game)) any = true;
  }
  return any;
}

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
  if (p.iframes > 0) return false; // 原版 :13732 player.immune 门禁（General 槽）
  if (!projOverlap(self.x, self.y, self.w, self.h, p)) return false;
  const ifr = p.iframes;
  game.damagePlayer(dmg, self.x + self.w / 2, self.y + self.h / 2);
  return p.iframes > ifr; // damage 落地才置无敌帧（闪避不置，对应 Hurt 返回 0）
}

// ================= 弹幕反射管线（原版 Projectile.cs:12050-12060 + NPC.cs:67003-67059） =================

/** 可反射 aiStyle 白名单（Projectile.CanBeReflected，Projectile.cs:20224）：
 *  1 箭/子弹直飞弹、2 抛物线投掷物、8/21/24/28/29/131 各特化直线弹。
 *  另有 type 728（超级星星）/955（坠落星）无条件可反射（:20220）。 */
const REFLECTABLE_AI_STYLES = new Set([1, 2, 8, 21, 24, 28, 29, 131]);

/** 可反射弹体（调用方自报运动学字段；hostile/reflected/damage 参与门禁） */
export interface ReflectableProj {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  damage: number;
  hostile?: boolean;
  /** 已反射标记（本仓显式防重复；原版靠 friendly→hostile 翻转天然拦截二次反射） */
  reflected?: boolean;
}

/** 原版 Projectile.CanBeReflected（Projectile.cs:20216-20230）：
 *  active && friendly && !hostile && damage>0，且 type∈{728,955} 或
 *  aiStyle∈{1,2,8,21,24,28,29,131}。本仓 friendly 无字段——非 hostile 即友方。 */
export function projCanBeReflected(
  projId: number,
  proj: Pick<ReflectableProj, 'hostile' | 'damage'>,
): boolean {
  if (proj.hostile || !(proj.damage > 0)) return false;
  if (projId === 728 || projId === 955) return true;
  return REFLECTABLE_AI_STYLES.has(projectileData(projId)?.aiStyle ?? -1);
}

/** 原版 NPC.ReflectProjectile（NPC.cs:67036-67059）：
 *  - 音效 Item150 + 尘 31×3（velocity×0.3）；
 *  - reflected=true、friendly=false、hostile=true（owner 不变——"朝发射者"
 *    方向读 Main.player[owner]，本仓单主角恒为 game.player）；
 *  - 速度 = normalize(随机方向×原速 + 朝发射者×20) × 原速（:67047-67055，
 *    即随机散射偏向回打玩家；原速取 oldVelocity.Length，此处用当前速度近似）；
 *  - damage ÷2 两次（int 语义 ≈ ÷4）+ penetrate=1（穿透归一，穿透字段的
 *    清理由调用方按各自存储执行）。 */
export function reflectProjectile(proj: ReflectableProj, game: GameHooks): void {
  const cx = proj.x + proj.w / 2, cy = proj.y + proj.h / 2;
  // Item_150 未入音效提取库（public/sounds 无此 wav）：playSfxFile 未命中静默，
  // 回退 tink（Tink_0/1 金属弹开近似）——素材补齐后自动切真声
  if (!game.playSfxFile?.('Item_150', 1, cx, cy)) game.playSfx('tink', 0.9, cx, cy);
  game.spawnParticles(cx, cy, '#D8D8E0', 3, 0.6, { life: 24, damp: 0.9 });
  proj.reflected = true;
  proj.hostile = true;
  // 反射向量（NPC.cs:67047-67055）
  const p = game.player;
  const speed = Math.hypot(proj.vx, proj.vy);
  let ox = p.cx - cx, oy = p.cy - cy;
  const od = Math.hypot(ox, oy);
  if (od > 0.001) { ox /= od; oy /= od; }
  else if (speed > 0.001) { ox = -proj.vx / speed; oy = -proj.vy / speed; } // 重合退化:原路弹回
  else { ox = 0; oy = -1; }
  // 随机方向 = Main.rand.Next(-100,101) 双轴归一（此处 [-1,1) 均匀近似）
  const rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1;
  let dx = rx * speed + ox * 20, dy = ry * speed + oy * 20;
  const dl = Math.hypot(dx, dy);
  if (dl > 0.001) { proj.vx = (dx / dl) * speed; proj.vy = (dy / dl) * speed; }
  else { proj.vx = ox * 6; proj.vy = oy * 6; } // 零速退化:低速直飞回发射者
  // 伤害衰减（int 连除两次）+ penetrate=1（:67056-67058）
  proj.damage = Math.floor(Math.floor(proj.damage / 2) / 2);
}

/** 弹体命中敌怪分支的反射门禁 + 执行（原版 Projectile.cs:12050-12060：
 *  flag6 = targetNPC.reflectsProjectiles（getGoodWorld 星弹特例未接入——运行时
 *  无 FTW 标志），命中重叠本身即 NPC.CanReflectProjectile 的 Hitbox 相交）。
 *  返回 true = 已反射，调用方跳过本次伤害结算并结束本帧命中迭代
 *  （对应原版 keepIterating=false; return）。 */
export function tryReflectProjectile(
  proj: ReflectableProj,
  projId: number,
  e: { reflectsProjectiles?: boolean },
  game: GameHooks,
): boolean {
  if (!e.reflectsProjectiles) return false;
  if (proj.reflected) return false; // 显式防重复（原版由 hostile 翻转天然拦截）
  if (!projCanBeReflected(projId, proj)) return false;
  reflectProjectile(proj, game);
  return true;
}

/** 敌弹命中玩家的状态授予(原版 Projectile.StatusPlayer :11450+,仅在
 *  hitPlayer 返回 true 即 Hurt>0 后调用)。本仓库已实装弹型登记:
 *   348 FrostWave —— Chilled(46) 300/600t(:11554-11557) + Frozen(47)
 *                    概率 20/40/60t 三级(:11558-11567)
 *   349 FrostShard —— Chilled(46) 1/3→600t、否则 1/2→300t(:11580-11588)
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

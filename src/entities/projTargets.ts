// 弹幕命中目标:怪物桶之外还有小动物桶(critters)。
// 原版小动物是 NPC(NPCID.Squirrel 等),任何伤害即死——近战挥砍已覆盖
// (Game 挥砍段"小动物:任何挥击一击致死"),弹幕此前漏判,箭射松鼠无效果。
import type { GameHooks } from './types';
import { BuffType, buffTypeByVanilla, type BuffState } from '../stats/Buffs';
import { projectileData } from '../data/vanillaProjectiles';
import { hostileProjectileDamage, mainDifficulty, mainExpertMode, damageVar } from '../stats/ScaleStats';
import { bannerReceivedMult } from '../world/Banners';
import { petSlimeHitVoice } from '../data/vanillaNpcAmbience';
import statusPlayerJson from '../data/vanilla-statusplayer.json';

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
/** 城镇 NPC 受击判定(玩家弹幕/敌怪弹幕共用)。门禁照原版两分支:
 *  - 'playerProj'(friendly 弹):Projectile.Damage_PVE_Inner :11970-11976 巫毒窄门——
 *    仅向导 22(装备向导巫毒娃娃 267→player.killGuide)/裁缝师 54(裁缝娃 1307→
 *    killClothier)可被玩家弹幕/近战伤害;其余城镇 NPC 玩家武器一律无效
 *  - 'hostile'(敌怪弹/陷阱弹):原版 flag2 分支(hostile && victim.friendly)恒命中
 *  TownNPC.hurt 自带 8t 无敌帧去重;kbx=0 时按相对方位自动击退方向。 */
export function hitTownNpcs(
  self: { x: number; y: number; w: number; h: number },
  game: GameHooks,
  dmg: number,
  kbx = 0,
  source: 'playerProj' | 'hostile' = 'playerProj',
  projId = 0,
): boolean {
  const list = (game as unknown as { npcs?: () => unknown[] }).npcs?.() ?? [];
  // player 可为 null(测试 fakeHooks/导入早期帧)——加空守卫
  const eq = (game.player as unknown as { equipStats?: { killGuide?: boolean; killClothier?: boolean } } | null)
    ?.equipStats;
  let any = false;
  for (const ent of list) {
    const n = ent as {
      x: number; y: number; w: number; h: number; dead: boolean;
      hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
      bound?: boolean; vanillaId?: number;
    };
    if (n.dead || typeof n.hurt !== 'function') continue;
    if (n.bound) continue; // 被缚待救不可打(近似;原版 bound 型有独立受击语义)
    if (!projOverlap(self.x, self.y, self.w, self.h, n)) continue;
    if (source === 'playerProj') {
      // 巫毒窄门(:11970-11972):22→killGuide / 54→killClothier,其余 false;
      // ★臭鸡蛋 318 无条件例外（:11971 `flag |= type == 318`——整蛊蛋专属,
      //  全游戏唯一可无条件砸 friendly NPC 的玩家弹）
      const vid = n.vanillaId ?? -1;
      const doll = vid === 22 ? eq?.killGuide : vid === 54 ? eq?.killClothier : false;
      if (!doll && projId !== 318) continue;
    }
    const kb = kbx !== 0 ? kbx : Math.sign(n.x + n.w / 2 - (self.x + self.w / 2)) * 2 || 1;
    if (n.hurt(dmg, kb, 0, game)) any = true;
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
 *  近战挥砍早已如此;弹幕此前漏了)。
 *  宠物史莱姆语音表优先（StrikeNPC :82255-82302）：type==1 且 ai[1]=语音
 *  饰品物品 id → 按表替换（鸡 1/5 稀有变体在 petSlimeHitVoice 内掷） */
export function playEnemyHitSound(
  game: GameHooks,
  e: { def?: { hitSound?: string[] }; vanillaId?: number | null; ai1?: number; cx?: number; cy?: number },
): void {
  if (e.vanillaId === 1 && e.ai1 != null) {
    const v = petSlimeHitVoice(e.ai1);
    if (v) {
      // WithPitchVariance(0.4)（SoundID.cs:1115-1147 全表）——±0.4 音高抖动
      game.playSfxWav?.(v.file, v.vol, e.cx, e.cy, Math.random() * 0.8 - 0.4);
      return;
    }
  }
  const files = e.def?.hitSound;
  if (files && files.length) game.playSfxFiles(files, 0.9);
}

/** 玩家攻击能否命中敌怪桶实体（原版 Projectile.Damage_PVE_Inner :11892-11896 的
 *  flag 门 + Player.ApplyItemToNPC :43605 friendly 门同式）：敌怪桶里的 friendly NPC
 *  （睡渔夫 376、被缚救援族残留）对玩家近战/弹幕/爆炸一律无效——命中循环须在
 *  音效/伤害数字/穿透消耗/debuff 施加【之前】跳过（原版 return 在全部结算之前）。
 *  例外：臭鸡蛋 318（:11971 全游戏唯一可无条件命中 friendly NPC 的玩家弹）；
 *  voodoo（向导 22 装娃娃 killGuide / 裁缝师 54 killClothier——敌怪桶实际不含
 *  这两型，门对称保留）。小动物不入 enemies 桶（critters 桶独立），无 critter 分支。 */
export function playerCanHitEnemy(
  e: unknown,
  game: GameHooks,
  projId = 0,
): boolean {
  const t = e as { vanillaId?: number | null; def?: { friendly?: boolean }; immortal?: boolean } | null | undefined;
  // CanBeChasedBy 的 !immortal / chaseable 门（NPC.cs:91141-91147，1457 全表提取）：
  //  immortal=true：488 训练假人 / 690 伪装雕像 / 133 巡游之眼（事件眼非本体重生态）
  //  chaseable=false：399 火星探测 probe / 416 日耀骑手骑体 / 437 教徒祭坛石板 /
  //  438 教徒信徒 / 440 教主克隆体 / 523 远古末日球——均不可被**索敌瞄准**
  //  （玩家手动攻击走直接命中不受限。2026-08-24 用户报"召唤宠物追打假人"）
  const vid = t?.vanillaId;
  if (vid !== undefined && vid !== null && (vid === 488 || vid === 690 || vid === 133 || vid === 399
    || vid === 416 || vid === 437 || vid === 438 || vid === 440 || vid === 523)) return false;
  if (!t?.def?.friendly) return true;
  if (projId === 318) return true;
  const eq = (game.player as unknown as { equipStats?: { killGuide?: boolean; killClothier?: boolean } } | null)
    ?.equipStats;
  if (vid === 22 && eq?.killGuide) return true;
  if (vid === 54 && eq?.killClothier) return true;
  return false;
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
/** ProjectileID.Sets.SkipDamage_EVP（1457 :275 新表,1456 无）={108,164,1002}——
 *  爆炸物/地雷/TNT 桶类敌对弹不再走 EVP 打主人（自伤语义移交 Kill→SelfHurtPlayers
 *  的 FixedSelfDamageForPlayers 定伤链） */
const SKIP_DAMAGE_EVP = new Set([108, 164, 1002]);

/** NPC.coldDamage 寒冷系敌弹表（Projectile.cs SetDefaults 逐型 coldDamage = true，
 *  1.4.5.6 全 29 型——冰雪族弹幕：冰块 80/敌雪球 109/冰回力镖 113/冰霜弹 118-120/
 *  霜燃箭 172/冰锥 174/霜弹 253/霜光束 257/冰镰 263/北地长矛族 342-344/霜波 348 等）
 *  ——消费 = 温暖(124) resistCold 受击 ×0.7（Projectile.cs:13764-13766 Damage_EVP
 *  段：banner 后、难度乘区前） */
export const COLD_DAMAGE_PROJS: ReadonlySet<number> = new Set([
  80, 109, 113, 118, 119, 120, 128, 166, 172, 174, 177, 253, 257, 263,
  308, 309, 337, 342, 343, 344, 348, 349, 359, 520, 912, 917, 961, 962, 979,
]);

/** NPC.coldDamage 寒冷系敌怪表（NPC.cs SetDefaults 逐型 coldDamage = true，
 *  1.4.5.6 全 16 型）——消费 = 温暖(124) resistCold 接触伤 ×0.7
 *  （Player.cs:30961-30963 NPC 接触循环：thorns 后、Hurt 前） */
export const COLD_DAMAGE_NPCS: ReadonlySet<number> = new Set([
  143, // Snowman Gangsta
  144, // Mister Stabby
  145, // Snow Balla
  147, // Ice Slime
  150, // Ice Bat
  154, // Ice Tortoise
  169, // Ice Elemental
  184, // Spiked Ice Slime
  185, // Snow Flinx
  206, // Icy Merman
  243, // Ice Golem
  343, // Yeti
  345, // Ice Queen
  352, // Flocko
  629, // Ice Mimic
  668, // Deerclops
]);

export function hitPlayer(
  self: { x: number; y: number; w: number; h: number },
  game: GameHooks,
  dmg: number,
  trap = false,
  pvp = false,
): boolean {
  if (dmg <= 0) return false;
  // 1457 :14846-14850（1456 :13706-13710 无此门）:SkipDamage_EVP 表早退。
  // （1457 同段还删了受击路径的 TryDoingOnHitEffects——本仓 hitPlayer 本就无
  //   owner OnHit 侧道,无需删;1091+双闪电种子 Heal(80) 依赖 1457 新种子旗标
  //   noLightningSeed/moreLightningSeed,本仓 SeedFlags 未登记——不实装,随种子批）
  const evpId = (self as { projId?: number }).projId;
  if (evpId !== undefined && SKIP_DAMAGE_EVP.has(evpId)) return false;
  const p = game.player;
  if (p.dead) return false;
  if (p.iframes > 0) return false; // 原版 :13732 player.immune 门禁（General 槽）
  if (!projOverlap(self.x, self.y, self.w, self.h, p)) return false;
  // R5-F21：DamageVar ±15% 掷骰（Projectile.cs:13762 `num3 = Main.DamageVar(damage,
  // -Main.player[owner].luck)`——Damage_EVP 首段,先掷后吃 banner/resistCold/缩放）。
  // PvP 弹走 Damage_PVP 的 Main.DamageVar（0.85-1.15,数值侧已含）——同样掷
  dmg = damageVar(dmg, pvp ? 0 : -p.luck);
  // R5-F22：旗 buff 减伤对敌弹生效（Projectile.cs:13763-13765 `GetBannerBuffEffect(
  // bannerIdToRespondTo)`——bannerIdToRespondTo = 发射 NPC 的 banner（:11112-11116
  // FindBannerToAssociateTo）。本仓弹体侧仅 Dart 带 ownerNpcId,其余族发射者追踪
  // 未建模——有 ownerNpcId 即吃旗减伤,无则跳过（登记）
  if (!pvp) {
    const srcNpcId = (self as { ownerNpcId?: number }).ownerNpcId ?? 0;
    if (srcNpcId > 0 && (game as { bannerNpcActive?: (id: number) => boolean }).bannerNpcActive?.(srcNpcId)) {
      dmg = Math.max(1, Math.round(dmg * bannerReceivedMult(mainExpertMode(game.world))));
    }
  }
  // 温暖(124) resistCold：寒冷系敌弹 ×0.7（Projectile.cs:13766-13768——banner 段后、
  // hostileDamageScaling 前；(int) 截断）。PvP 弹走 Damage_PVP 无此段,不乘
  if (!pvp && evpId !== undefined && COLD_DAMAGE_PROJS.has(evpId)
    && p.buffs.has(BuffType.Warmth)) {
    dmg = Math.trunc(dmg * 0.7);
  }
  const ifr = p.iframes;
  // ★ 玩家受伤难度乘区 + 全局 ×2（Projectile.cs:14912-14917，Damage_EVP 段）：
  //   `if (!reflected) num3 = (int)(num3 * hostileDamageScaling.Sample(Main.Difficulty));`
  //   随后 `int num4 = 2; num3 *= num4;`——敌弹对玩家恒 ×2（对所有难度，含经典）。
  //   hostileDamageScaling = GameDifficultyData.HostileProjectileDamageMultiplier
  //   （Projectile.cs:264/544：旅程 0.5 / 经典 1 / 专家 2 / 大师 3）。
  //   NPC 接触伤害不走这里——其难度缩放在生成时由 NPC.ScaleStats 完成
  //   （Enemy.def.damage 已是缩放值），在此再乘会双重缩放；
  //   但接触伤害同样吃这 ×2？否——×2 只在 Projectile.Damage_EVP（弹幕侧），
  //   接触侧是 Player.Hurt 直入（Enemy.def.damage 已是 ScaleStats 终值）。
  //   （本函数调用方均为 hostile 弹幕，无 reflected 路径——反射弹转 friendly 打怪）
  game.damagePlayer(
    // pvp=true 不乘敌弹难度缩放与 ×2——那是 Damage_EVP（NPC 敌弹）专属（:14912-14917）；
    // 玩家 PvP 弹走 Damage_PVP 的 Main.DamageVar 直传
    pvp ? dmg : hostileProjectileDamage(dmg, mainDifficulty(game.world)) * 2,
    self.x + self.w / 2, self.y + self.h / 2,
    undefined, false, pvp);
  // 成就：陷阱弹致死（Projectile.cs:13804-13808 trap→trapDebuffSource，死则
  // HandleSpecialEvent(4) WATCH_YOUR_STEP；仅 trap 类、非反射弹）
  if (trap && (p.dead || p.hp <= 0)) {
    game.achievements?.handleSpecialEvent(4,
      { statLifeMax: p.maxHp, statManaMax: p.maxMana });
  }
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

/** 敌弹命中玩家的状态授予(原版 Projectile.StatusPlayer :11450-11722 **全量**,
 *  仅在 hitPlayer 返回 true 即 Hurt>0 且未死后调用——调用点 Game.ts 敌弹命中段)。
 *  数值表 = tools/extract-statusplayer.mjs 从 1456 源码提取的 AST
 *  (src/data/vanilla-statusplayer.json,48 弹型/42 块/零跳过,提取带护栏):
 *   1078 陨石碎块 → OnFire(24) 300-599t（:11456-11458）
 *   285 纳米弹 → Confused(31) 1/3→180t 否则 60t,双块(!hostile 块 :11622-11631)
 *   1048 配重球 → Poisoned(20)+Stinky(120) 各 600t（:11471-11474）
 *   669 麦酒 → Confused(31) 1/20 → 120-300t（:11476-11478）
 *   119/359 冰晶刃/冰晶杖 → Frostburn2(324) 240/420t（:11480-11486）
 *   188 火焰陷阱 → OnFire3(323) 1200t（:11488-11490）
 *   472 黑隐士吐网 → Webbed(149) 30-149t（:11492-11494）
 *   961 鹿角怪冰锥 → Frozen(47) 20t（:11496-11498）
 *   467 异教徒火球 → OnFire(24) 30-149t（:11500-11502）
 *   581 星旋酸弹 → VortexDebuff(164) 专家 300-539t/经典 50% 360-719t（:11504-11514）
 *   687 贝蒂吐息 → OnFire(24) 420-600t（:11515-11517）
 *   258 火球 → OnFire(24) 50% → 300-420t（:11519-11521）
 *   572 蝾螈喷毒 → Poisoned(20) 2/3 → 120-239t（:11523-11525）
 *   276 世纪之花毒种子 → Poisoned(20) 专家必中/经典 50%（:11527-11535）
 *   436 脑部干扰弹 → Confused(31) Next(5)>=2 → 300t（:11538-11540）
 *   435 火星炮塔弹 → Electrified(144) 2/3 → 300t（:11542-11544）
 *   682 DD2 萤火虫电击 → WitheredWeapon(196) 300t（:11546-11548）
 *   437 千兆电枪矛 → Electrified(144) 240-480t（:11550-11552）
 *   348 霜涛 → Chilled(46) 1/2→600/300t + Frozen(47) 三级顺序掷骰（:11554-11576）
 *   349 霜晶 → Chilled(46) 1/3→600t、否则 1/2→300t（:11580-11588）
 *   399-402 燃烧瓶族(!hostile 自伤) → OnFire(24) 180-360t（:11591-11593）
 *   55 刺球 / 719 蜂后刺针 → Poisoned(20) 1/3→600t 否则专家 60-299t（:11595-11604）
 *   44 恶魔镰刀 → Darkness(22) 1/3 → 900t（:11606-11608）
 *   293 迷失之魂 → Blackout(80) 120-360t（:11610-11612）
 *   299 暗影焰 → Cursed(23) 240t（:11614-11616）
 *   82 燃烧箭 → OnFire(24) 1/3 → 420t（:11618-11620）
 *   96 诅咒焰/101 恶魔眼火 → CursedInferno(39) 三级顺序掷骰（:11633-11647）
 *   288 金浴 → Ichor(69) 900t（:11648-11650）
 *   253 霜球(!hostile) → Frostburn2(324) 600t（:11652-11654）
 *   291/292 地狱火 → OnFire(24) 480-900t（:11656-11658）
 *   98 毒镖/1073 史莱姆毒镖 → Poisoned(20) 600t（:11660-11662）
 *   1053 熔岩巨砾 → OnFire(24) 300t（:11664-11666）
 *   184 毒镖陷阱 → Poisoned(20) 900t（:11668-11670）
 *   980 毒液镖陷阱 → Venom(70) 300t（:11672-11674）
 *   290 暗影光束 → Slow(32) 300-900t（:11676-11678）
 *   174 冰锥 → Chilled(46) 1200t + !frozen 门 Frozen 两级（:11680-11690）
 *   257 霜束 → Chilled(46) 2700t + !frozen 门 Frozen 1/5→60t（:11692-11698）
 *   177 冰水喷吐 → Chilled(46) 1500t + !frozen 门 Frozen 30-119t（:11700-11706）
 *   128 冰爆 → Frostburn(44) 1/3 → 360t（:11708-11710）
 *   176 丛林尖刺 → Poisoned(20) 1/4→1200t 否则 1/2→300t（:11712-11720）
 *  GAP：ApplyBuffTo 的 trap&&deadMansSweater 减半(:11729-11733)——"死人毛衣"
 *  配件未移植；creativeGodMode 入口门(:11452-11454)——创意上帝模式字段未建模。
 *  玩家侧 buff 免疫链(buffImmune,黑曜石皮防火等)在 BuffState.apply 无门,
 *  独立缺口登记(Player.AddBuff :5088-5092 buffImmune 早退)。 */

/** AST 条件原子：{r:[K,cmp,阈值?]} = Main.rand.Next(K) 与阈值比较(eq/ne/ge)；
 *  {expert:1} = Main.expertMode；{hostile:0} = !hostile；{frozen:0} = !player.frozen */
interface SPCond { r?: [number, 'eq' | 'ne' | 'ge', number?]; expert?: 1; hostile?: 0; frozen?: 0 }
/** AST 门/链节点：g=外层门(全 atom 成立进 t/i,否则进 e) / t=then 体 / i=else-if 链
 *  (首全成 arm,全落空进 e) / a=顺序全执行 */
interface SPNode {
  g?: SPCond[];
  t?: SPElem;
  i?: Array<{ g?: SPCond[]; t: SPElem }>;
  a?: SPElem[];
  e?: SPElem;
}
/** AST 叶子：ApplyBuffTo(player, b, d)（b 为原版 buff id，d 见 spDurTicks） */
interface SPLeaf {
  g?: SPCond[];
  b: number;
  d: number | { n: [number, number]; m?: number };
}
type SPElem = SPNode | SPLeaf;
const SP_TABLE = statusPlayerJson as unknown as Record<string, SPElem>;

/** Main.rand.Next(K)：含头不含尾的整数掷骰（Math.random()×K 取整精确等价） */
const spNext = (k: number): number => Math.floor(Math.random() * k);

/** 求值上下文：hostile=弹体敌对标志(Damage_EVP 路径恒 true,爆炸自伤路径 false)；
 *  expert=专家难度；frozen=player.frozen 两源(buff 47 :9749 / 微光化 353 :11382) */
interface SPCtx { hostile: boolean; expert: boolean; frozen: boolean }

/** 条件门求值：原子逐个判,任一不成立即 false */
function spGateOk(atoms: SPCond[] | undefined, ctx: SPCtx): boolean {
  if (!atoms || !atoms.length) return true;
  for (const at of atoms) {
    if (at.r) {
      const [k, cmp, thr = 0] = at.r;
      const v = spNext(k);
      if (cmp === 'eq' ? v !== thr : cmp === 'ne' ? v === thr : v < (thr ?? 0)) return false;
    } else if (at.expert) {
      if (!ctx.expert) return false;
    } else if (at.hostile === 0) {
      if (ctx.hostile) return false;
    } else if (at.frozen === 0) {
      if (ctx.frozen) return false;
    }
  }
  return true;
}

/** 时长求值：常量=tick 数；{n:[a,b]}=Next(a,b)；{n,m:60}=60×Next(a,b)（含头不含尾） */
function spDurTicks(d: SPLeaf['d']): number {
  if (typeof d === 'number') return d;
  const v = d.n[0] + Math.floor(Math.random() * (d.n[1] - d.n[0]));
  return d.m ? d.m * v : v;
}

/** AST 求值：命中后按原版逐块顺序掷骰并 AddBuff(max 合并由 BuffState.apply 保证)。
 *  未实装 buff（buffTypeByVanilla 查无）静默跳过——登记见 Buffs.ts 枚举注释 */
function spEval(node: SPElem, ctx: SPCtx, buffs: BuffState): void {
  if ('b' in node) {
    // 叶子可带外层门(如 436 的 Next(5)>=2),门不过即整叶跳过
    if (node.g && !spGateOk(node.g, ctx)) return;
    const t = buffTypeByVanilla(node.b);
    if (t === undefined) return;
    buffs.apply(t, spDurTicks(node.d) / 60);
    return;
  }
  if (node.g && !spGateOk(node.g, ctx)) {
    if (node.e) spEval(node.e, ctx, buffs);
    return;
  }
  if (node.i) {
    for (const arm of node.i) {
      if (spGateOk(arm.g, ctx)) { spEval(arm.t, ctx, buffs); return; }
    }
    if (node.e) spEval(node.e, ctx, buffs);
    return;
  }
  if (node.a) {
    for (const child of node.a) spEval(child, ctx, buffs);
    return;
  }
  // 纯 then 节点（{g, t[, e]}）：门已过/无门 → 执行 t
  if (node.t) spEval(node.t, ctx, buffs);
}

/** 敌弹命中玩家 → debuff 结算（Projectile.StatusPlayer :11450-11722 全量,表驱动）。
 *  hostile 缺省 true = Damage_EVP 调用点语义（:13708 门禁 hostile 弹才走到这里）；
 *  爆炸/自伤路径（BombsHurtPlayers :13944-13983,无 hostile 门）应显式传弹体
 *  实际 hostile 标志（如燃烧瓶族 399-402 的 !hostile 分支 :11591-11593）。 */
export function statusPlayer(game: GameHooks, projId: number, hostile = true): void {
  const p = game.player;
  const node = SP_TABLE[String(projId)];
  if (!node) return;
  spEval(node, {
    hostile,
    expert: mainExpertMode(game.world),
    frozen: p.buffs.has(BuffType.Frozen) || p.shimmering, // :9749 / :11382 双源
  }, p.buffs);
}

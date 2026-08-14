// 原版物品战斗数据（tools/extract-itemcombat.mjs 从 Terarria1456 Item.cs SetDefaults 提取）：
// damage/knockBack/useTime/useAnimation/shoot/useAmmo/shootSpeed/ammo/consumable/noMelee/autoReuse/mana
import combatJson from './vanilla-itemcombat.json';
import { projectileData, AI_ANCHORED, AI_BOOMERANG, AI_FLAIL, AI_GLOWSTICK, AI_GRENADE, AI_SPEAR, AI_SHORTSWORD, AI_THROWN, AI_YOYO } from './vanillaProjectiles';

export interface ItemCombat {
  damage?: number;
  crit?: number;           // Item.crit（武器自带暴击，GetWeaponCrit P:25230-25232 消费）
  knockBack?: number;
  useTime?: number;
  useAnimation?: number;
  shoot?: number;
  useAmmo?: number;
  shootSpeed?: number;
  ammo?: number;
  consumable?: boolean;
  noMelee?: boolean;
  autoReuse?: boolean;
  mana?: number;
  melee?: boolean;
  ranged?: boolean;
  magic?: boolean;
  summon?: boolean;
  /** Item.cs useTurn=true（1141 件，工具族；武器 false）——itemAnimation 窗内移动改向豁免（:19546） */
  useTurn?: boolean;
}

const RAW = combatJson as unknown as Record<string, ItemCombat>;

// ---- 鞭系（DefaultToWhip 提取，Item.cs SetDefaults switch 共 18 把）----
import whipsJson from './vanilla-whips.json';
const WHIPS = whipsJson as unknown as Record<string, { proj: number; dmg: number; kb: number; speed: number; anim: number }>;

// ---- 提取缺口补丁（tools/extract-itemcombat.mjs 只解析 case 内字面赋值）----
// DefaultToSpear/DefaultToStaff/DefaultToMagicWeapon/DefaultToRangedWeapon 的形参
// 赋值（Item.cs:47630/:48045/:48057）漏提：4347/4348/4703/5629 仅剩 damage/knockBack、
// 4788-4790（剑矛三件 DefaultToSpear+SetWeaponValues）与 4060-4062 整条缺失。
// 下表按源码 case 逐件 1:1（:35651/:35672/:37119/:38629/:39341-39353/:44212）：
//   DefaultToSpear → useStyle5 / useTime=useAnimation=animationTime / shootSpeed=push / noMelee+melee
//   DefaultToStaff → magic / autoReuse / mana=manaPerShot / UseSound43
//   DefaultToMagicWeapon → magic / noMelee / useTime=useAnimation=singleShotTime
//   DefaultToRangedWeapon → noMelee / ranged / useAmmo=ammoID（5629 随后 ranged=false 已在表内）
const EXTRACT_PATCH: Record<string, Partial<ItemCombat>> = {
  '4060': { shoot: 728, useAmmo: 75, useTime: 18, useAnimation: 18, shootSpeed: 20, damage: 60, knockBack: 5, noMelee: true, ranged: true, autoReuse: true },
  '4061': { shoot: 730, useTime: 28, useAnimation: 28, shootSpeed: 3.5, damage: 14, knockBack: 6, noMelee: true, melee: true },
  '4062': { shoot: 731, useTime: 17, useAnimation: 17, shootSpeed: 8, mana: 6, damage: 24, knockBack: 3, noMelee: true, magic: true, autoReuse: true },
  '4347': { shoot: 876, useTime: 36, useAnimation: 36, shootSpeed: 15, noMelee: true, magic: true },
  '4348': { shoot: 876, useTime: 36, useAnimation: 36, shootSpeed: 15, noMelee: true, magic: true },
  '4703': { shoot: 14, useAmmo: 97, useTime: 55, useAnimation: 55, shootSpeed: 7, noMelee: true, ranged: true },
  '4788': { shoot: 877, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 60, knockBack: 12, noMelee: true, melee: true },
  '4789': { shoot: 878, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 130, knockBack: 14, noMelee: true, melee: true },
  '4790': { shoot: 879, useTime: 24, useAnimation: 24, shootSpeed: 3.5, damage: 90, knockBack: 13, noMelee: true, melee: true },
  '5629': { shoot: 1088, useAmmo: 27, useTime: 20, useAnimation: 20, shootSpeed: 10, noMelee: true, autoReuse: true },
  // ---- 七金属短剑 SetDefaults1(6) 模板漏提(Item.cs:1377-1392;2026-08-13
  //   "铜剑变投掷"根因:shootSpeed 缺→默认 8→位移 120px 像丢剑;autoReuse 应 false;
  //   noMelee 应 true。铁短剑 item 6 自带全量(不走模板)不受影响) ----
  '3483': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3489': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3495': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3501': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3507': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3513': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  '3519': { shootSpeed: 2.1, noMelee: true, autoReuse: false },
  // ---- 湿/干/土制炸弹族（Item.cs:39461-39473 / :39787-39799 共享 case 段算式
  //   `shoot = 903 + (type - 4824)` / `shoot = 910 + (type - 4908)` 提取器不解析字面量
  //   → 缺 shoot 整族死路径。此处按源码算式逐件回填（4824-4827→903-906，
  //   4908/4909→910/911）。★noMelee 非 1456 SetDefaults 字面（该两段未置），
  //   此处作 combatWeapon `consumable && noMelee` 爆炸物门的派发等价门：
  //   原版族 damage 缺省 0 + noUseGraphic=true，近战面 0 伤，语义相同 ----
  '4824': { shoot: 903, noMelee: true },
  '4825': { shoot: 904, noMelee: true },
  '4826': { shoot: 905, noMelee: true },
  '4827': { shoot: 906, noMelee: true },
  '4908': { shoot: 910, noMelee: true },
  '4909': { shoot: 911, noMelee: true },
  // 5334 奥库瑞姆剃刀（Item.cs:42276-42287）：consumable/useStyle4/useTime 45 在
  //   `Variant == EnabledVariant` 条件块内——提取器不解析条件块，整条缺失
  '5334': { consumable: true, useTime: 45, useAnimation: 45 },
};

const TABLE: Record<string, ItemCombat> = { ...RAW };
for (const k of Object.keys(EXTRACT_PATCH)) {
  TABLE[k] = { ...(RAW[k] ?? {}), ...EXTRACT_PATCH[k] } as ItemCombat;
}

/** 原版 item id → 战斗数据（无条目返回 null） */
export function itemCombat(vanillaId: number): ItemCombat | null {
  return TABLE[String(vanillaId)] ?? null;
}

/** 弓类 AmmoID.Arrow = 40（AmmoID.cs:116） */
export const AMMO_ARROW = 40;
/** AmmoID 常量（AmmoID.cs:114-146）：子弹/凝胶/钱币/坠落之星/沙/飞镖/火箭/溶液/信号弹 */
export const AMMO_GEL = 23;
export const AMMO_COIN = 71;
export const AMMO_FALLEN_STAR = 75;
export const AMMO_BULLET = 97;
export const AMMO_SAND = 169;
export const AMMO_DART = 283;
export const AMMO_ROCKET = 771;
export const AMMO_SOLUTION = 780;
export const AMMO_FLARE = 931;

// ================= vi_* 武器语义解析（1456 数据驱动） =================

/** vi_<id>_<slug> key → 原版 item id（vi_ 批次未显式存 vid 时从 key 反解） */
export function viIdFromKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

export type CombatWeapon =
  | { kind: 'melee'; damage: number; knockback: number; useTime: number; useAnimation: number; autoReuse: boolean; shoot?: number; shootSpeed?: number }
  | { kind: 'summon'; shoot: number; sentry: boolean; damage: number; knockback: number; useTime: number; shootSpeed: number }
  | { kind: 'whip'; shoot: number; damage: number; knockback: number; useTime: number; shootSpeed: number; itemId: number }
  | {
      kind: 'boomerang' | 'spear' | 'yoyo' | 'flail' | 'grenade' | 'glowstick' | 'magic' | 'shot' | 'summon';
      shoot: number;
      damage: number;
      knockback: number;
      useTime: number;
      shootSpeed: number;
      mana?: number;
      sentry?: boolean;
    };

/** 物品定义的最小形状（items.ts 的 ItemDef 满足之） */
export interface CombatWeaponItemLike {
  key: string;
  vid?: number;
}

/** vi_* 物品的原版战斗语义：按 itemCombat 字段 + 投射物 aiStyle 家族分流
 *  （Projectile.cs SetDefaults 数据 + DefaultTo* 族 aiStyle）。
 *  返回 null = 无战斗语义（材料/家具/药水等，或走既有手写分支的弓）。
 *  注意：消耗型 aiStyle 2（手里剑等抛物线投掷）仍走 Game.thrownCombat，
 *  这里只接管爆炸物族（ai16）——判定顺序见 Game.useItem */
export function combatWeapon(def: CombatWeaponItemLike): CombatWeapon | null {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return null;
  // 传送门枪 3384（Item.cs:30926-30942）：shoot=600 是 aiStyle75 手持光束投射物
  // （本身不落门，其首帧 AI 在 Projectile.cs:63883-63911 发出真正的 601 落门弹）。
  // 直射兜底（kind 'shot'）会把 600 发成一发无落门逻辑的 Arrow——显式退出通用分流，
  // 物品链由 entities/PortalGunBolt.ts firePortalGun 承载（Game.updateUse 专属分支）。
  // 另两消费点（右键集火门/remoteSwingDur）对 null 与 'shot' 行为一致，无回归。
  if (vid === 3384) return null;
  // 鞭（DefaultToWhip，Item.cs:47439——提取器漏提，独立表 src/data/vanilla-whips.json 全 18 把）
  const whip = WHIPS[String(vid)];
  if (whip) {
    return {
      kind: 'whip', itemId: vid,
      shoot: whip.proj, damage: whip.dmg, knockback: whip.kb,
      useTime: whip.anim, shootSpeed: whip.speed,
    };
  }
  const c = itemCombat(vid);
  if (!c || c.useAmmo || c.ammo) return null; // 弓弩/弹药体系不在此分流
  const shoot = c.shoot ?? 0;
  const ai = shoot ? projectileData(shoot)?.aiStyle ?? -1 : -1;
  const base = {
    damage: c.damage ?? 1,
    knockback: c.knockBack ?? 3,
    useTime: c.useTime ?? c.useAnimation ?? 20,
    shootSpeed: c.shootSpeed ?? 8,
  };
  if (shoot) {
    if (c.consumable && c.noMelee) {
      // 消耗型：荧光棒族（282 普通/286 粘性/3112 弹力/3002 矿工/4776 妖精/5643 彩虹
      // → proj 50/53/515/473/870/1089，ai14 弹跳物理）；爆炸物族（ai16）弹跳+引信；
      // ai2 抛物线投掷武器（手里剑）交回 thrownCombat
      // 门禁 = ItemID.Sets.Glowsticks（ItemID.cs:1198 精确六件）——ai14 还有巨石/药瓶等
      // 其他投掷物，不能按 aiStyle 一律归入
      if (ai === AI_GLOWSTICK && (vid === 282 || vid === 286 || vid === 3112 || vid === 3002 || vid === 4776 || vid === 5643)) {
        return { kind: 'glowstick', shoot, ...base };
      }
      if (ai === AI_GRENADE) return { kind: 'grenade', shoot, ...base };
      return null;
    }
    if (ai === AI_BOOMERANG) return { kind: 'boomerang', shoot, ...base };
    if (ai === AI_SPEAR || ai === AI_SHORTSWORD || ai === AI_ANCHORED) return { kind: 'spear', shoot, ...base };
    // AI_ANCHORED(13):鱼叉 160/Golem拳 1297/KO加农 1314/链刀 1325/链斩 3012——
    // 原版锚在角色上伸缩(AI_013),归长矛前刺族近似;此前落入 shot 兜底=子弹射飞
    if (ai === AI_YOYO) return { kind: 'yoyo', shoot, ...base };
    if (c.summon) {
      // 召唤武器（31 件）：按投射物 AI 分流哨兵与随从。哨兵 aiStyle 集合 = 53（冰九头蛇
      // 308/蜘蛛皇后 377/猎犬 966，:3724/:4342/:8860）/123（月门 641/彩虹水晶 643，:6638/:6651）
      // /130/134/137/138（OOA 四塔）。**aiStyle 54 不是哨兵**——唯一使用者 317 乌鸦是
      // minion（:3825-3836 minion=true/minionSlots=1，无 sentry 字段），此前误入哨兵
      // 路径吃到"60t 一发"兜底
      return { kind: 'summon', shoot, sentry: ai === 53 || ai === 123 || ai === 130 || ai === 134 || ai === 137 || ai === 138,
        ...base };
    }
    if (ai === AI_FLAIL) return { kind: 'flail', shoot, ...base };
    // ★ melee+shoot（附魔剑 989/波刃 190 等 46 件）：原版语义 = 挥砍为主 +
    // 挥击中射弹（Player.cs:42880：flag4 = itemAnimation>0 && ItemTimeIsZero →
    // ItemCheck_Shoot，useTime 节奏发弹）。此前落入 shot 兜底 = 变成"光束枪"
    // 完全不挥砍——语义错误。数值取 melee 分支，附带 shoot/shootSpeed 给挥击侧发射
    if (c.melee && !c.noMelee) {
      return {
        kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
        useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
        shoot, shootSpeed: base.shootSpeed,
      };
    }
    if (c.magic || c.mana) return { kind: 'magic', shoot, mana: c.mana ?? 0, ...base };
    // 其余 melee/ranged+shoot（附魔剑光束等）：直射弹兜底
    if (c.melee || c.ranged || c.noMelee) return { kind: 'shot', shoot, ...base };
    return null;
  }
  // 纯近战（剑等：melee 且非 noMelee；无 shootSpeed 语义）。
  // useAnimation=挥击动画时长 / useTime=复用冷却（Player.ItemCheck: itemAnimationMax 与 itemTime
  // 分立，1790 件 vi 武器两者不同——只回传 useTime 会让挥速虚快）
  if (c.melee && !c.noMelee) {
    return {
      kind: 'melee', damage: base.damage, knockback: base.knockback, useTime: base.useTime,
      useAnimation: c.useAnimation ?? base.useTime, autoReuse: !!c.autoReuse,
    };
  }
  return null;
}

/** 旧判定（消耗型投掷武器）保留：shoot+consumable+noMelee 且无 useAmmo/ammo */
export function thrownCombat(def: CombatWeaponItemLike): { shoot: number; damage: number } | null {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return null;
  const c = itemCombat(vid);
  if (!c?.shoot || !c.consumable || !c.noMelee || c.useAmmo || c.ammo) return null;
  return { shoot: c.shoot, damage: c.damage ?? 0 };
}

/** AI_001（aiStyle 1）重力全链规格（1.4.5.6 反编译 :53083-53173 / :53881-54698 /
 *  :54871-54887，2026-08-14 对账）：
 *  · 默认（:54686-54696）：ai[0] ≥15（每 AI update 计一次）后 vy += 0.1/update，
 *    终端 vy 16（flag7，577 除外）——箭族 E=0 即"15t 平飞后 0.1/t² 缓坠"
 *  · 三类豁免默认：①flag3 表（:53085-53168，ai[0] 冻结 → 默认门永不开——
 *    子弹/光束族 83 型）②顶层行为链命中（:53881-54295 自管速度——357 叶绿弹/
 *    207/837 吸血飞刀等）③链尾排除（:54308/:54638：239/264/675 + 437/477）
 *  · 逐型自带重力（替代默认）：见 AI1_GRAV 表
 *  · 686/711 两段式（:54640-54659）：+0.1@ai0≥10 再 +0.1@≥20、vx×0.99 */
const AI1_NO_DROP = new Set<number>([
  // flag3（ai[0] 不自增；498 例外——分支内手动计数，在 AI1_GRAV 表）
  5, 14, 20, 36, 38, 55, 83, 84, 88, 89, 98, 100, 104, 110, 158, 159, 160, 161, 180, 184,
  242, 248, 257, 259, 265, 270, 279, 283, 284, 285, 286, 287, 299, 302, 323, 325, 348, 349,
  350, 355, 374, 376, 389, 435, 436, 438, 440, 442, 449, 459, 462, 467, 468, 469, 472, 483,
  484, 485, 498, 576, 577, 585, 592, 593, 601, 606, 616, 634, 635, 638, 639, 660, 661, 682,
  684, 706, 709, 710, 712, 876, 980, 981, 1073,
  // 顶层行为链命中（分支自管速度，重力链不达）
  357, 207, 837, 962, 337, 645, 424, 425, 426, 344, 336, 345, 246, 311, 1023, 312,
  // 链尾排除 + 无重力分支（437 仅淡出 / 477 分支内豁免）
  239, 264, 675, 437, 477,
]);

/** 逐型重力 [rate/update, ai0 门槛]（顶层链 :54009-54032 + 嵌套链 :54310-54626） */
const AI1_GRAV: Record<number, [number, number]> = {
  81: [0.07, 20], 91: [0.07, 20],                                        // :54009-54016
  174: [0.15, 5], 605: [0.15, 5], 920: [0.15, 5], 921: [0.15, 5], 926: [0.15, 5],  // :54017-54024
  937: [0.07, 5],                                                        // :54025-54032
  176: [0.05, 15], 275: [0.025, 35], 276: [0.025, 35],                   // :54310/:54318
  172: [0.085, 17], 117: [0.06, 35], 120: [0.05, 30],                    // :54354-54380
  195: [0.15, 40], 1097: [0.15, 40],                                     // :54381-54408
  267: [0.075, 20], 478: [0.075, 20], 479: [0.075, 20],                  // :54409-54423
  408: [0.05, 45], 495: [0.04, 30], 498: [0.15, 50],                     // :54482/:54597/:54608
  507: [0.3, 60], 508: [0.3, 60], 662: [0.3, 60], 680: [0.3, 60], 685: [0.3, 60],  // :54589-54596
};

/** 686/711 两段式（grav2 通道） */
const AI1_TWO_STEP = new Set<number>([686, 711]);

export interface ProjGravSpec {
  /** 每 update 重力（Arrow subStep 即 per-update 语义） */
  grav: number;
  /** ai[0] 门槛（update 计）；-1 = 无延迟 */
  delay: number;
  /** 二段重力（686/711 @20 再 +0.1） */
  grav2?: number;
  grav2At?: number;
  /** 恒定 vx 衰减（686/711 ×0.99/update） */
  drag?: number;
}

export function projGravSpec(shoot: number): ProjGravSpec {
  const ai = projectileData(shoot)?.aiStyle ?? -1;
  if (ai !== 1) {
    // aiStyle 2/16 旧口径保留（GrenadeProj/投掷路径自带物理，此处仅兜底）
    return { grav: ai === AI_THROWN || ai === AI_GRENADE ? 0.3 : 0, delay: -1 };
  }
  const t = AI1_GRAV[shoot];
  if (t) return { grav: t[0], delay: t[1] };
  if (AI1_TWO_STEP.has(shoot)) return { grav: 0.1, delay: 10, grav2: 0.1, grav2At: 20, drag: 0.99 };
  if (AI1_NO_DROP.has(shoot)) return { grav: 0, delay: -1 };
  return { grav: 0.1, delay: 15 };   // 默认（:54686-54696）
}

/** aiStyle → 投射物重力（兼容旧调用面；规格细节走 projGravSpec） */
export function projGravity(shoot: number): number {
  return projGravSpec(shoot).grav;
}

/** AmmoID.Sets.SpecificLauncherAmmoProjectileMatches 全表（AmmoID.cs，1.4.5.6）：
 *  发射器 id → { 弹药 id → 弹体 id }，5 发射器 × 12 弹药，优先级最高 */
export const SPECIFIC_LAUNCHER_AMMO: Record<number, Record<number, number>> = {
  759: { 771: 134, 772: 137, 773: 140, 774: 143, 4445: 776, 4446: 780, 4457: 793, 4458: 796, 4459: 799, 4447: 784, 4448: 787, 4449: 790 },
  758: { 771: 133, 772: 136, 773: 139, 774: 142, 4445: 777, 4446: 781, 4457: 794, 4458: 797, 4459: 800, 4447: 785, 4448: 788, 4449: 791 },
  760: { 771: 135, 772: 138, 773: 141, 774: 144, 4445: 778, 4446: 782, 4457: 795, 4458: 798, 4459: 801, 4447: 786, 4448: 789, 4449: 792 },
  1946: { 771: 338, 772: 339, 773: 340, 774: 341, 4445: 803, 4446: 804, 4457: 808, 4458: 809, 4459: 810, 4447: 805, 4448: 806, 4449: 807 },
  3930: { 771: 715, 772: 716, 773: 717, 774: 718, 4445: 717, 4446: 718, 4457: 717, 4458: 718, 4459: 717, 4447: 717, 4448: 717, 4449: 717 },
};

/** PickAmmo 弹型解析 1:1（Player.cs:52635-52668）：优先级 = Specific 匹配表 >
 *  雪人炮算式（338+ammo−771）/ MK2 算式（715+ammo−771）> 火箭族【加法】
 *  （发射器 shoot + 弹药 shoot，:52648-52651 —— 非替换！火箭一型 shoot=0 → 基弹，
 *  二/三/四型 +3/+6/+9 偏移）> 弹药 shoot 替换；弓族特例尾改写（3019/3052）。
 *  此前误用"弹药 shoot 替换"链：火箭一型打出 projId 0 隐形弹、二型打出手里剑
 *  贴图（772.shoot=3=Shuriken），2026-08-14 对账修复 */
export function resolveAmmoProjId(launcherVid: number, ammoVid: number, useAmmo: number,
  launcherShoot: number | undefined, ammoShoot: number | undefined): number {
  const specMatch = SPECIFIC_LAUNCHER_AMMO[launcherVid]?.[ammoVid];
  if (specMatch !== undefined) return specMatch;
  if (launcherVid === 1946) return 338 + ammoVid - 771;
  if (launcherVid === 3930) return 715 + ammoVid - 771;
  if (useAmmo === 771) return (launcherShoot ?? 0) + (ammoShoot ?? 0);   // 火箭加法
  return ammoShoot ?? launcherShoot ?? 1;
}

/** vi_ useAmmo 远程武器（弓/枪/发射器，DefaultToRangedWeapon 族 useStyle=5）：
 *  返回 useAmmo id（AmmoID.Arrow=40 / Bullet=97 …）；非 useAmmo 物品返回 0。
 *  combatWeapon 对 useAmmo 物品返回 null（弓弩/弹药体系另走 PickAmmo），Game 远程
 *  分支据此接管枪族——此前 vi_ 手枪/雪球炮等无 def.ranged 又被 combatWeapon 排除 = 静默失效 */
export function rangedAmmoWeapon(def: CombatWeaponItemLike): number {
  const vid = def.vid ?? viIdFromKey(def.key);
  if (vid < 0) return 0;
  const ua = itemCombat(vid)?.useAmmo ?? 0;
  return ua > 0 ? ua : 0;
}

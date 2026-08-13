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

/** aiStyle → 投射物重力/tick（ai2/16 抛物线 0.3；其余直飞 0）——AI_002/AI_016 实测值 */
export function projGravity(shoot: number): number {
  const ai = projectileData(shoot)?.aiStyle ?? -1;
  return ai === AI_THROWN || ai === AI_GRENADE ? 0.3 : 0;
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

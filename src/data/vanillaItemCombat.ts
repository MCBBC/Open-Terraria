// 原版物品战斗数据（tools/extract-itemcombat.mjs 从 Terarria1456 Item.cs SetDefaults 提取）：
// damage/knockBack/useTime/useAnimation/shoot/useAmmo/shootSpeed/ammo/consumable/noMelee/autoReuse/mana
import combatJson from './vanilla-itemcombat.json';
import { projectileData, AI_BOOMERANG, AI_FLAIL, AI_GRENADE, AI_SPEAR, AI_SHORTSWORD, AI_THROWN, AI_YOYO } from './vanillaProjectiles';

export interface ItemCombat {
  damage?: number;
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
}

const TABLE = combatJson as unknown as Record<string, ItemCombat>;

/** 原版 item id → 战斗数据（无条目返回 null） */
export function itemCombat(vanillaId: number): ItemCombat | null {
  return TABLE[String(vanillaId)] ?? null;
}

/** 弓类 AmmoID.Arrow = 40（AmmoID.cs:116） */
export const AMMO_ARROW = 40;

// ================= vi_* 武器语义解析（1456 数据驱动） =================

/** vi_<id>_<slug> key → 原版 item id（vi_ 批次未显式存 vid 时从 key 反解） */
export function viIdFromKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

export type CombatWeapon =
  | { kind: 'melee'; damage: number; knockback: number; useTime: number; useAnimation: number; autoReuse: boolean }
  | {
      kind: 'boomerang' | 'spear' | 'yoyo' | 'flail' | 'grenade' | 'magic' | 'shot';
      shoot: number;
      damage: number;
      knockback: number;
      useTime: number;
      shootSpeed: number;
      mana?: number;
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
      // 消耗型：爆炸物族（手雷 28/炸弹 29/炸药 30 等 ai16）弹跳+引信；
      // ai2 抛物线投掷武器（手里剑）交回 thrownCombat
      if (ai === AI_GRENADE) return { kind: 'grenade', shoot, ...base };
      return null;
    }
    if (ai === AI_BOOMERANG) return { kind: 'boomerang', shoot, ...base };
    if (ai === AI_SPEAR || ai === AI_SHORTSWORD) return { kind: 'spear', shoot, ...base };
    if (ai === AI_YOYO) return { kind: 'yoyo', shoot, ...base };
    if (ai === AI_FLAIL) return { kind: 'flail', shoot, ...base };
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

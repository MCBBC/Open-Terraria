// 原版物品战斗数据（tools/extract-itemcombat.mjs 从 Terarria1456 Item.cs SetDefaults 提取）：
// damage/knockBack/useTime/useAnimation/shoot/useAmmo/shootSpeed/ammo/consumable/noMelee/autoReuse
import combatJson from './vanilla-itemcombat.json';

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
}

const TABLE = combatJson as unknown as Record<string, ItemCombat>;

/** 原版 item id → 战斗数据（无条目返回 null） */
export function itemCombat(vanillaId: number): ItemCombat | null {
  return TABLE[String(vanillaId)] ?? null;
}

/** 弓类 AmmoID.Arrow = 40（AmmoID.cs:116） */
export const AMMO_ARROW = 40;

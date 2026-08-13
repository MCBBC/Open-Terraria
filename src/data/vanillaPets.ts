// 宠物物品运行时（tools/extract-pets.mjs 从 Item.cs 提取：
// buffType+shoot 直赋值 + DefaultToVanitypet(projId, buffId) 双模式，86 件）。
// 语义（Player.UpdatePet :17147-17162）：装备槽 [0]=宠物 / [1]=光宠 的 buffType
// 即宠物存在标志；TogglePet/ToggleLight（:17191-17208）= hideMisc 翻转 + 清 buff。
import petsJson from './vanilla-pets.json';

export interface PetInfo {
  buff: number;   // Item.buffType（Main.vanityPet/lightPet 布尔表成员）
  proj: number;   // Item.shoot（宠物投射物贴图 Projectile_<id>.png）
  light: boolean; // Main.lightPet[buff] → 光宠（装备槽 [1]）
}

const TABLE = petsJson as unknown as Record<string, PetInfo>;

/** 原版 item id → 宠物信息（非宠物 null） */
export function petInfoOfVid(vid: number): PetInfo | null {
  const e = TABLE[String(vid)];
  return e ? { buff: e.buff, proj: e.proj, light: !!e.light } : null;
}

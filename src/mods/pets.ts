// mod 宠物运行时(★刀3-2,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀3 节)。
// 形态=tML 同构(buff+proj 组合,无 ModPet 类):物品声明 `pet:{buff,proj,light}` →
// 本表 vid(stableId 30000+)→{buffType,projId,light}。消费面:
// ①Game.updatePetSlot(mod 反查→BuffType 直挂+PetFollower 重生) ②petBuffKinds
// (light/vanity 集并入——QuickBuff 跳过/buff 栏哨兵同源) ③togglePetSlot(隐藏清 buff)
// ④vanillaEquip 分类 overlay(宠物槽准入/右键装备路由;KIND_BY_IID 载入期冻结的
// mod 件盲区由此补)。零注册恒等:全查表 miss→原链。
import { MOD_ITEM_STABLE_BASE } from './types';   // ★红队 R3-m4:段常量收编(禁硬编码)
export interface ModPetContent {
  /** mod buff 键(content/buffs 已注册;注册期 modBuffTypeOf → BuffType) */
  buff: string;
  /** `proj:<key>`/裸键(本 mod 弹)或原版 proj vid 数字 */
  proj: string | number;
  /** true=光宠(装备槽 1);缺省=宠物(槽 0) */
  light?: boolean;
}

export interface ModPetInfo { buff: number; proj: number; light: boolean; }

/** vid(stableId) → 宠物信息 */
const modPets = new Map<number, ModPetInfo>();

export function registerModPet(
  vid: number, spec: { buffType: number; projId: number; light: boolean },
): void {
  if (!(vid >= MOD_ITEM_STABLE_BASE)) throw new Error(`[mod-pet] vid 须 ≥${MOD_ITEM_STABLE_BASE}: ${vid}`);
  if (modPets.has(vid)) throw new Error(`[mod-pet] 重复注册: ${vid}`);
  modPets.set(vid, { buff: spec.buffType, proj: spec.projId, light: spec.light });
}

/** mod 宠物反查(非 mod 宠物件/原版件=null) */
export function modPetInfoOf(vid: number): ModPetInfo | null {
  return modPets.get(vid) ?? null;
}

/** 全量簿(petBuffKinds/UI 哨兵集并入用;注册后只读) */
export function modPetEntries(): ModPetInfo[] {
  return [...modPets.values()];
}

export function _resetModPetsForTests(): void {
  modPets.clear();
}

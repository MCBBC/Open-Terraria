// 物品装备分类运行时（tools/extract-equip-prefix.mjs 从源码提取;ItemSlot.PickItemMovementAction 判定两版同值,提取器结构绑定 SetDefaults1-5=1456 布局）。
// 判定规则 1:1 于 ItemSlot.PickItemMovementAction（ItemSlot.cs:1197-1248）：
//   dye=BindShader 表 / pet/light=buffType→Main.vanityPet·lightPet / mount·cart=mountType
//   / hook=mountType==-1 && Main.projHook[shoot]（projHook=aiStyle 7）
import equipJson from './vanilla-equip.json';
import { ITEM_DEFS } from './items';
import { statOfInternal } from './vanillaItemStats';   // ★清偿刀 Z：accPairConflicts 双翼臂翼表（无环:vanillaItemStats 不回依本模块）

export type EquipKind = 'dye' | 'pet' | 'light' | 'mount' | 'cart' | 'hook';

const DOC = equipJson as Record<EquipKind, number[]>;
const BY_VID = new Map<EquipKind, Set<number>>();
for (const k of Object.keys(DOC) as EquipKind[]) BY_VID.set(k, new Set(DOC[k]));

/** 原版 item id → 分类 */
export function equipKindOfVid(vid: number): EquipKind | null {
  for (const [k, s] of BY_VID) if (s.has(vid)) return k;
  return null;
}

/** ★R-A-D7(2026-10-13):vid 域收口——mod 件 vid≡iid,overlay 直查;原版域零扰动。
 *  旧三消费面(modernCrafting/FurnitureItems/SecretSeedDoEnds)不经此=mod 件恒 null。 */
export function equipKindOfAnyVid(vid: number): EquipKind | null {
  if (vid >= 30000) return MOD_KIND_BY_IID.get(vid) ?? null;
  return equipKindOfVid(vid);
}

/** 内部 item id → 分类（缓存；vi_ key 反解原版 id） */
const KIND_BY_IID = (() => {
  const m = new Map<number, EquipKind>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    // ★BJ283：键前缀 parseInt 兜底退役（BJ268 登记,方案 A ⑥回填后恒短路=items.ts:2414 等价定谳）
    const vid = d.vid ?? -1;
    if (vid < 0) continue;
    const k = equipKindOfVid(vid);
    if (k) m.set(i, k);
  }
  return m;
})();

/** ★刀3-2(2026-10-13):mod 装备分类 overlay——KIND_BY_IID 模块载入期冻结,
 *  mod 件(注册晚于模块求值)进不了表=宠物/坐骑槽准入盲区。注册期直写本表,
 *  读侧单源经 equipKindOfInternal 统一收口(mod iid 与原版 iid 域不相交,查序无歧义)。 */
const MOD_KIND_BY_IID = new Map<number, EquipKind>();
export function registerModEquipKind(id: number, kind: EquipKind): void {
  if (KIND_BY_IID.has(id)) throw new Error(`[mod-equip] iid 与原版分类表冲突: ${id}`);
  if (MOD_KIND_BY_IID.has(id)) throw new Error(`[mod-equip] 重复注册: ${id}`);
  MOD_KIND_BY_IID.set(id, kind);
}

export function equipKindOfInternal(id: number): EquipKind | null {
  return MOD_KIND_BY_IID.get(id) ?? KIND_BY_IID.get(id) ?? null;
}

/** ★红队 R3-m6:测试清账面(overlay 注册表无清除路径=二次装载撞重复注册) */
export function _resetModEquipKindsForTests(): void {
  MOD_KIND_BY_IID.clear();
}

/** 染料判定（ItemSlot context 12/25/27/33：checkItem.dye > 0） */
export function isDyeItem(id: number): boolean {
  return KIND_BY_IID.get(id) === 'dye';
}

/** 杂项装备槽序（Player.miscEquips[5]）：0 宠物 / 1 光源 / 2 矿车 / 3 坐骑 / 4 钩爪 */
export const MISC_KINDS: EquipKind[] = ['pet', 'light', 'cart', 'mount', 'hook'];

export function miscSlotAccepts(slot: number, id: number): boolean {
  return equipKindOfInternal(id) === MISC_KINDS[slot];   // ★刀3-2:收口 overlay(mod 件准入)
}

// ---- ★清偿刀 Z（2026-09-29）配饰互斥组谓词单源（原 UI.ts 模块内私有,提至数据层——
// Inventory.ts armorAccepts 本体组臂收口（U 刀登记债,其内部消费面 CanShareArmor
// :311/Loadout :337 自动承接）与 UI 三面（右键/拖放/时装互换）共用;提源原因:
// UI.ts 已 import Inventory.ts（UI.ts:199）,反向 import 成环,数据层无环）----

/** ItemID.Sets.AccessoryIncompatibilityType（ItemID.cs:58,1457 亲读）：四件同组
 *  （值全 6168：6168/6169/6193/6194 弹药循环族）——组员两两互斥（CanEquipBothAccessories
 *  :3475-3480 `num != -1 && num == num2`）。其余 vid 无组（−1）。 */
export const ACC_INCOMPAT_GROUP = new Set([6168, 6169, 6193, 6194]);

/** HasSameItemInSlot（ItemSlot.cs:3517-3538,1457 亲读）：段内同 type（:3527-3530）
 *  ∨ 同互斥组（:3531-3535）——【无】双翅臂。ArmorSwap 对段门（:3593/:3598）用。 */
export const accGroupClash = (a: number, b: number): boolean =>
  a === b ||
  (ACC_INCOMPAT_GROUP.has(ITEM_DEFS[a]?.vid ?? -1) && ACC_INCOMPAT_GROUP.has(ITEM_DEFS[b]?.vid ?? -1));

/** CanEquipBothAccessories 的否定（ItemSlot.cs:3460-3481,1457 亲读）——ArmorSwap
 *  自段冲突扫描（:3618 HasIncompatibleAccessory 逐槽调）：同 type（:3462-3464）/
 *  双翅（:3465-3474 wingSlot 双正;社交段 3580 例外 :3466-3473）/互斥组（:3475-3480）。
 *  空槽恒不冲突（air type=0/wingSlot=0/组 −1——调用侧先判空）。@param vanity =
 *  目标段为社交段（ArmorSwap :3618 传 item.vanity） */
export const accPairConflicts = (a: number, b: number, vanity: boolean): boolean => {
  if (a === b) return true;
  const wa = statOfInternal(a)?.wing, wb = statOfInternal(b)?.wing;
  if (wa != null && wb != null) {
    if (vanity && (ITEM_DEFS[a]?.vid === 3580 || ITEM_DEFS[b]?.vid === 3580)) return false;
    return true;
  }
  return ACC_INCOMPAT_GROUP.has(ITEM_DEFS[a]?.vid ?? -1) && ACC_INCOMPAT_GROUP.has(ITEM_DEFS[b]?.vid ?? -1);
};

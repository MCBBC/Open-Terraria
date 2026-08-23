// 物品装备分类运行时（tools/extract-equip-prefix.mjs 从源码提取;ItemSlot.PickItemMovementAction 判定两版同值,提取器结构绑定 SetDefaults1-5=1456 布局）。
// 判定规则 1:1 于 ItemSlot.PickItemMovementAction（ItemSlot.cs:1197-1248）：
//   dye=BindShader 表 / pet/light=buffType→Main.vanityPet·lightPet / mount·cart=mountType
//   / hook=mountType==-1 && Main.projHook[shoot]（projHook=aiStyle 7）
import equipJson from './vanilla-equip.json';
import { ITEM_DEFS } from './items';

export type EquipKind = 'dye' | 'pet' | 'light' | 'mount' | 'cart' | 'hook';

const DOC = equipJson as Record<EquipKind, number[]>;
const BY_VID = new Map<EquipKind, Set<number>>();
for (const k of Object.keys(DOC) as EquipKind[]) BY_VID.set(k, new Set(DOC[k]));

/** 原版 item id → 分类 */
export function equipKindOfVid(vid: number): EquipKind | null {
  for (const [k, s] of BY_VID) if (s.has(vid)) return k;
  return null;
}

/** 内部 item id → 分类（缓存；vi_ key 反解原版 id） */
const KIND_BY_IID = (() => {
  const m = new Map<number, EquipKind>();
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const vid = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (vid < 0) continue;
    const k = equipKindOfVid(vid);
    if (k) m.set(i, k);
  }
  return m;
})();

export function equipKindOfInternal(id: number): EquipKind | null {
  return KIND_BY_IID.get(id) ?? null;
}

/** 染料判定（ItemSlot context 12/25/27/33：checkItem.dye > 0） */
export function isDyeItem(id: number): boolean {
  return KIND_BY_IID.get(id) === 'dye';
}

/** 杂项装备槽序（Player.miscEquips[5]）：0 宠物 / 1 光源 / 2 矿车 / 3 坐骑 / 4 钩爪 */
export const MISC_KINDS: EquipKind[] = ['pet', 'light', 'cart', 'mount', 'hook'];

export function miscSlotAccepts(slot: number, id: number): boolean {
  return KIND_BY_IID.get(id) === MISC_KINDS[slot];
}

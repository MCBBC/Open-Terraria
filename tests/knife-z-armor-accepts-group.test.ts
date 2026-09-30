// ★清偿刀 Z（2026-09-29）armorAccepts 本体互斥组第四面判别测试（清偿刀 X 新立债 #1 收口）。
// 定谳锚（1457 反编译亲读）：
//   门链 = ItemSlot.PickItemMovementAction 配饰支（ItemSlot.cs:1444-1456）→
//   CanEquipInArmorSlot（:1399-1458）：同段 CanEquipAccessoryInSlot→HasIncompatibleAccessory
//   （:3483-3495 逐槽 CanEquipBothAccessories,互斥组臂 :3474-3480 `num != -1 &&
//   num == num2`,冲突槽=目标槽放行 :3544）+ 对段 HasSameItemInSlot（:3517-3538,
//   组员跨段同拘 :3531-3535）。组表 ItemID.Sets.AccessoryIncompatibilityType
//   （ItemID.cs:58）={6168,6169,6193,6194} 四件同组（值全 6168）。
//   消费面：armorAccepts 本体（Inventory.ts,原 P 刀终态盲区=U 刀登记债）→ 内部
//   CanShareArmor 快捷装备（getEffectiveArmor :311,原版 Player.cs:5706-5734 第一门
//   =CanEquipInArmorSlot 含组臂;低位空槽逐槽配对扫 :5713-5732 仍未建模=R4-19 残面）
//   + Loadout（effectiveSharedFrom :337）。谓词单源=vanillaEquip.accGroupClash
//   （UI.ts 三面同源,提源原因=UI.ts→Inventory 反向 import 成环）。
// 判别法：U/X 刀 mkUi 同法真 Inventory 直调;6169→6168 同段异槽 = 收刀前放行、
//   收刀后拒绝的单腿判别位。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const CYC_A = idOfVid(6168);   // 组员甲（AccessoryIncompatibilityType 组值 6168）
const CYC_B = idOfVid(6169);   // 组员乙（同组 6168——与甲互斥）
const BOOTS = idOfVid(54);     // Hermes Boots（组外对照）

describe('清偿刀 Z 门① armorAccepts 本体互斥组臂（:3474-3480/:3531-3535）', () => {
  it('同段组臂：功能段组员甲在场,乙拖入同段空槽被拒（收刀前=自创放行）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    expect(inv.armorAccepts(4, CYC_B)).toBe(false);
  });

  it('冲突槽=目标槽放行（:3544 slot==collisionSlot）：乙拖入甲所在槽=顶掉交换,照收', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    expect(inv.armorAccepts(3, CYC_B)).toBe(true);
  });

  it('对段组员跨段同拘（:3531-3535）：功能段组员在场,社交段空槽拒（原版无自槽例外形态）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    expect(inv.armorAccepts(13, CYC_B)).toBe(false);
  });

  it('对段反向同拘：社交段组员在场,功能段空槽拒（:1452-1454 镜像门）', () => {
    const inv = new Inventory();
    inv.armor[13] = { id: CYC_B, stack: 1 };
    expect(inv.armorAccepts(3, CYC_A)).toBe(false);
  });

  it('回归锁（组外配饰不受牵连）：组员甲在场,Boots 照常入同段空槽', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    expect(inv.armorAccepts(4, BOOTS)).toBe(true);
  });
});

describe('清偿刀 Z 门② CanShareArmor 快捷装备面（getEffectiveArmor/effectiveSharedFrom）', () => {
  it('快捷装备 6169 到 6168 段被拒：功能段组员甲在场,Loadout 收藏乙不共享（:5693 break）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    inv.loadouts[0].armor[4] = { id: CYC_B, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(4)).toBeNull();      // 共享门内 armorAccepts 拒 → null
    expect(inv.effectiveSharedFrom(4, false)).toBeNull();
  });

  it('组外回归锁：组员甲在场,Loadout 收藏 Boots 照常共享（组臂只拘组员）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    inv.loadouts[0].armor[4] = { id: BOOTS, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(4)).toMatchObject({ id: BOOTS });
    expect(inv.effectiveSharedFrom(4, false)).toBe(0);
  });

  it('收藏件非组员相位照旧：槽空+组员在场时共享门只看目标件与在场的组冲突', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: CYC_A, stack: 1 };
    inv.loadouts[0].armor[4] = { id: BOOTS, stack: 1, favorited: true };
    inv.loadouts[1].armor[4] = { id: CYC_B, stack: 1, favorited: true };
    // vanilla 语义：首个收藏件可共享即 return（:5688-5699 无冲突=Boots 命中即返回）
    expect(inv.getEffectiveArmor(4)).toMatchObject({ id: BOOTS });
  });
});

// ===================== ★清偿刀 P4（2026-09-30）社交段 3580 双翼例外臂 =====================
// 定谳锚（1457 亲读）：CanEquipBothAccessories（ItemSlot.cs:3460-3481）双翅臂
// :3465-3474——`vanity && (acc1.type == 3580 || acc2.type == 3580)` 例外先行于
// 翅膀恒拒；armorAccepts 本体旧内联双翅臂缺此例外（C4 定谳：右键面 accPairConflicts
// 已接/本体缺——拖放与 CanShareArmor 面拒「开发者翼 3580×普通翼同戴社交段」）。
// 本刀修=本体自段扫描改 accPairConflicts 全臂单源（vanity 实参=目标段）。
describe('清偿刀 P4 门③ 社交段 3580 例外臂（:3465-3474 经 accPairConflicts 单源）', () => {
  const DEV_WING = idOfVid(3580);   // 开发者翼 wing:33（Item.cs:32290 wingSlot=33,X 刀同锚）
  const WING = idOfVid(492);        // 天使之翼 wing:1（普通翼对照）

  it('判别位：普通翼占社交 14,开发者翼拖入社交 13 → 放行（收刀前拒）', () => {
    const inv = new Inventory();
    inv.armor[14] = { id: WING, stack: 1 };
    expect(inv.armorAccepts(13, DEV_WING)).toBe(true);
  });

  it('对称位：开发者翼占社交 13,普通翼拖入社交 14 → 放行（例外对 a/b 两支对称）', () => {
    const inv = new Inventory();
    inv.armor[13] = { id: DEV_WING, stack: 1 };
    expect(inv.armorAccepts(14, WING)).toBe(true);
  });

  it('例外仅 3580：普通翼×普通翼同段仍拒（双翅恒拒臂不变）', () => {
    const inv = new Inventory();
    inv.armor[14] = { id: WING, stack: 1 };
    expect(inv.armorAccepts(13, WING)).toBe(false);
  });

  it('同款臂先于例外：社交段 3580 在场,第二个 3580 拖入 → 拒（:3462-3464 type 相等先判）', () => {
    const inv = new Inventory();
    inv.armor[13] = { id: DEV_WING, stack: 1 };
    expect(inv.armorAccepts(14, DEV_WING)).toBe(false);
  });

  it('功能段无例外：普通翼占 3,开发者翼拖入功能段 4 → 拒（vanity=false 臂）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: WING, stack: 1 };
    expect(inv.armorAccepts(4, DEV_WING)).toBe(false);
  });

  it('CanShareArmor 快捷装备面自动承接：普通翼占社交 14,Loadout 收藏开发者翼共享入 13', () => {
    const inv = new Inventory();
    inv.armor[14] = { id: WING, stack: 1 };
    inv.loadouts[0].armor[13] = { id: DEV_WING, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(13)).toMatchObject({ id: DEV_WING });
    expect(inv.effectiveSharedFrom(13, false)).toBe(0);
  });

  it('CanShareArmor 反例锁：收藏普通翼（例外不适用）→ 拒共享', () => {
    const inv = new Inventory();
    inv.armor[14] = { id: WING, stack: 1 };
    inv.loadouts[0].armor[13] = { id: WING, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(13)).toBeNull();
  });
});

describe('清偿刀 Z 门③ 静态结构锁', () => {
  it('Entity.ts BJ294 玩家侧登记债枚举已同步补 254（V 刀 REGISTRY playerSide 同步,防注释回退）', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/entities/Entity.ts'), 'utf8');
    const a = src.indexOf('玩家侧登记债（本刀不修');
    expect(a).toBeGreaterThanOrEqual(0);
    const seg = src.slice(a, a + 900);
    expect(seg).toContain('250/298/305/254');
    expect(seg).toContain('P.cs:3369-3377');
    expect(seg).toContain('playerSide');
  });

  it('互斥组谓词单源：Inventory.armorAccepts 与 UI 消费同源 vanillaEquip.accGroupClash/accPairConflicts（提源判据=无环数据层;★P4 自段扫描改 accPairConflicts 全臂）', () => {
    const invSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/items/Inventory.ts'), 'utf8');
    expect(invSrc).toContain("accGroupClash, accPairConflicts } from '../data/vanillaEquip'");
    const eqSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/data/vanillaEquip.ts'), 'utf8');
    expect(eqSrc).toContain('export const accGroupClash');
    expect(eqSrc).toContain('export const accPairConflicts');
    const uiSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');
    expect(uiSrc).not.toMatch(/^const accPairConflicts/m);   // UI 本体不再持副本（单源无双写）
    expect(uiSrc).toContain("accGroupClash, accPairConflicts } from '../data/vanillaEquip'");
  });
});

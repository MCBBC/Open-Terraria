// ★清偿刀 R4（2026-09-30,Q3 登记收口）acc:0 功能配饰段收窄类级定谳判别测试。
// 定谳锚（Terarria1457 唯一标杆,反编译亲读）：
//   · 类门=CanEquipInArmorSlot（ItemSlot.cs:1399-1462）配饰支唯 `checkItem.accessory`
//     （:1444 `if (!checkItem.accessory) return false;`——:1446/:1452 功能/社交两支
//     共用同一类门,无 vanity 排除臂）→ accessory+vanity 双旗物原版可进功能段 3-9。
//   · 数据面映射定谳：itemstats acc:1⟺accessory∧¬vanity（336 件,与 van:1 零交集,
//     ★BJ392 审计）;acc:0⟺accessory∧vanity 双旗——35 件逐例核实（Item.cs SetDefaults:
//     4762=:39177-39185 accessory=true+vanity=true+hasVanityEffects=true;2276 handOnSlot=
//     16;2501 beardSlot=1;4563/4769/4771/4773/4775=DefaultToAccessory(w,h)+vanity=true;
//     208=:30233 区 faceSlot=8;其余 3536-3539/3581/3730-3731/3929/4054/4318/4744/4822/
//     5075-5077/5080/5104-5106/5345/5347/5587/5596/5628/6141 同型）⇒ 本仓
//     `st.acc!==undefined` ⟺ 原版 Item.accessory。
//   · 收刀面=armorAccepts 本体功能段类门（Inventory.ts,旧 `st.acc!==1` 排除臂）;三面
//     自动承接：armorAcceptsDrag（UI.ts:2860 纯合成=armorAccepts∧组扫）/CanShareArmor
//     （getEffectiveArmor Inventory.ts:311/:337）/拖放放置门（UI.ts:2898/:5778）。
//     accFitsInSegment（UI.ts:2081=CanEquipAccessoryInSlot :3540 冲突单扫,无类门）与
//     右键面（ArmorSwap :3596 按 vanity 路由→双旗右键仍进社交段）原版同相,不动。
//   · 功能段消费面（双旗族进 3-9 后）：UpdateEquips_CanItemGrantBenefits :12965-12985
//     case 3-9=item.accessory（本仓 grantArmorBenefits=acc!==undefined,Player.ts 已同相）
//     ;UpdateVisibleAccessories :37036 功能轮同 UpdateVisibleAccessory（照画）;UpdateItemDye
//     :9703 逐槽配对无类门（cMinion 链 dyeChannelsOf 扫 armor[0..19] 两段同读）。
//   · 双旗族无 stat（accfx/def/life 全空）⇒ 功能段装备零属性差=纯装备面 parity;
//     重铸面 Item.IsAPrefixableAccessory=accessory∧¬vanity（Item.cs:1151-1158）双旗
//     恒排除——isPrefixableAccessory 保持 acc===1 不随本刀放宽（★BJ392 同判）。
// 判别法：真 Inventory 直调（knife-z 同法）;4762 CritterShampoo 判别位——收刀前
//   armorAccepts(3,·)=false、收刀后=true;单腿判别+对照回归锁。
import { describe, it, expect } from 'vitest';
import { Inventory, isPrefixableAccessory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { vanillaStatOfVid } from '../src/data/vanillaItemStats';
import { CRITTER_SHAMPOO, dyeChannelsOf } from '../src/data/projDye';

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const SHAMPOO = idOfVid(4762);   // CritterShampoo——双旗族判别位
const GLOBE = idOfVid(2276);     // Gravity Globe（handOnSlot=16 双旗）
const SHROUD = idOfVid(4563);    // DefaultToAccessory+vanity 双旗（UpdateItemDye :9706 恒染名单成员）
const BOOTS = idOfVid(54);       // Hermes Boots——acc:1 功能配饰对照
const WALLITEM = idOfVid(132);   // createWall=6 消耗品——非配饰对照（类门反向判别位）
const DYE = idOfVid(1002);       // 染料（cMinion 配对槽载荷,vid 只作通道值）

describe('R4 定谳① 数据面映射（acc:0 ⟺ 原版 accessory∧vanity 双旗）', () => {
  it('4762/2276/4563 itemstats 形态={acc:0,van:1}（Item.cs SetDefaults 双旗逐例核实）', () => {
    expect(vanillaStatOfVid(4762)).toMatchObject({ acc: 0, van: 1 });
    expect(vanillaStatOfVid(2276)).toMatchObject({ acc: 0, van: 1 });
    expect(vanillaStatOfVid(4563)).toMatchObject({ acc: 0, van: 1 });
  });

  it('acc:1 对照（Hermes Boots=accessory∧¬vanity）与双旗零 stat 面（def/life/accfx 缺位）', () => {
    const st = vanillaStatOfVid(54)!;
    expect(st.acc).toBe(1);
    expect(st.van).toBeUndefined();
    const dual = vanillaStatOfVid(4762)!;
    expect(dual.def).toBeUndefined();    // 双旗族无防御（GrantArmorBenefits :13220 空）
    expect(dual.life).toBeUndefined();   // 无生命回复（:12700 空）
  });
});

describe('R4 判别② armorAccepts 功能段类门（ItemSlot.cs:1444 收刀位）', () => {
  it('双旗 4762 进功能段 3（收刀前=旧 acc!==1 臂拒,Q3 登记偏差位）', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(3, SHAMPOO)).toBe(true);
  });

  it('双旗族其余成员同门：2276→4 / 4563→5 照收（35 件族代表性抽样）', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(4, GLOBE)).toBe(true);
    expect(inv.armorAccepts(5, SHROUD)).toBe(true);
  });

  it('社交段照常收双旗（:1452 支原样回归锁）', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(13, SHAMPOO)).toBe(true);
  });

  it('类门反向判别：非配饰 132 两段都拒（:1444 真值面,防本刀过宽）', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(3, WALLITEM)).toBe(false);
    expect(inv.armorAccepts(13, WALLITEM)).toBe(false);
  });

  it('acc:1 对照不回归：Boots 功能段照常收', () => {
    const inv = new Inventory();
    expect(inv.armorAccepts(3, BOOTS)).toBe(true);
  });
});

describe('R4 判别③ 跨段同款互斥不松（HasSameItemInSlot :1448/:1454）', () => {
  it('4762 已占功能段 3,同款进社交段 13 仍拒（双旗不获同款双占豁免）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: SHAMPOO, stack: 1 };
    expect(inv.armorAccepts(13, SHAMPOO)).toBe(false);
  });

  it('镜像：4762 已占社交段 13,同款进功能段 3 仍拒', () => {
    const inv = new Inventory();
    inv.armor[13] = { id: SHAMPOO, stack: 1 };
    expect(inv.armorAccepts(3, SHAMPOO)).toBe(false);
  });
});

describe('R4 判别④ CanShareArmor 快捷装备面（getEffectiveArmor/effectiveSharedFrom 承接）', () => {
  it('Loadout 收藏 4762 共享进空功能槽 3（收刀前=armorAccepts 拒→null）', () => {
    const inv = new Inventory();
    inv.loadouts[0].armor[3] = { id: SHAMPOO, stack: 1, favorited: true };
    expect(inv.getEffectiveArmor(3)).toMatchObject({ id: SHAMPOO });
    expect(inv.effectiveSharedFrom(3, false)).toBe(0);
  });

  it('非收藏件不共享（快门只认 favorited,原版 :5706 同相）', () => {
    const inv = new Inventory();
    inv.loadouts[0].armor[3] = { id: SHAMPOO, stack: 1 };
    expect(inv.getEffectiveArmor(3)).toBeNull();
  });
});

describe('R4 判别⑤ cMinion 染料链功能段直通（UpdateItemDye :9703/9832 无类门）', () => {
  it('4762 装功能段 3+配对染料 3 → cMinion=染料 vid（时装段 13 老路回归锁并存）', () => {
    const inv = new Inventory();
    inv.armor[3] = { id: SHAMPOO, stack: 1 };
    inv.dye[3] = { id: DYE, stack: 1 };
    expect(dyeChannelsOf(inv).cMinion).toBe(1002);   // 通道值=配对染料 vid（cMinion 链读 armor[0..19] 两段）
  });

  it('时装段 13+染料 3 → cMinion 同值（N 刀老路不动）', () => {
    const inv = new Inventory();
    inv.armor[13] = { id: SHAMPOO, stack: 1 };
    inv.dye[3] = { id: DYE, stack: 1 };
    expect(dyeChannelsOf(inv).cMinion).toBe(1002);
  });
});

describe('R4 判别⑥ 重铸面不随本刀放宽（Item.IsAPrefixableAccessory=accessory∧¬vanity）', () => {
  it('双旗 4762 不可重铸（Item.cs:1151-1158 vanity 排除臂;acc!==undefined 放宽不外溢）', () => {
    expect(isPrefixableAccessory(SHAMPOO)).toBe(false);
  });

  it('acc:1 对照可重铸受理门（Boots 真值=可入室,例外表由 rollablePrefixes 承担）', () => {
    expect(isPrefixableAccessory(BOOTS)).toBe(true);
  });
});

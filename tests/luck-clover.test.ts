// 四叶草幸运装备链测试（Player.luckEquipmentBonus = equipmentBasedLuckBonus，
// Player.cs:12628-12646 UpdateEquips 尾段 + :12321-12332 RefreshInfoAccsFromItemType
// + :12494-12530 全背包/装备槽扫描）：
//   取值语义（原版实证）：五旗各 bool——每种类型只计一次（多槽同款不叠）、
//   旗间加法非取最大；四叶草三旗口袋生效（背包任意格），马掌/幸运币旗限
//   功能配饰槽（armor[3-9]，ApplyEquipFunctional :12540-12546）。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory, ACC_ARMOR_START } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';

const clover = ITEM_BY_KEY['vi_5574_LuckyClover'];
const wilted = ITEM_BY_KEY['vi_5575_WiltedClover'];
const raven = ITEM_BY_KEY['vi_5576_RavenFeather'];
const horseshoe = ITEM_BY_KEY['vi_158_LuckyHorseshoe'];
const obsidianHorseshoe = ITEM_BY_KEY['vi_396_ObsidianHorseshoe'];
const balloonHorseshoe = ITEM_BY_KEY['vi_1250_BlueHorseshoeBalloon'];
const soaring = ITEM_BY_KEY['vi_5331_HorseshoeBundle'];
const luckyCoin = ITEM_BY_KEY['vi_855_LuckyCoin'];

describe('四叶草三旗（:12628-12639，RefreshInfoAccsFromItemType :12321-12332）', () => {
  it('幸运四叶草 5574 +0.03：背包任意格生效（口袋语义，UpdateEquips :12494-12498 全 58 格扫描）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.luckEquipmentBonus).toBe(0);
    p.inv.slots[30] = { id: clover, stack: 1 };      // 深背包格
    expect(p.luckEquipmentBonus).toBeCloseTo(0.03, 6);
    expect(p.luck).toBeCloseTo(0.03, 6);             // luck 聚合透传（:28692）
  });

  it('枯萎四叶草 5575 −0.1 / 乌鸦羽 5576 −0.1：独立负贡献', () => {
    const p1 = new Player(0, 0, new Inventory());
    p1.inv.slots[0] = { id: wilted, stack: 1 };
    expect(p1.luckEquipmentBonus).toBeCloseTo(-0.1, 6);
    const p2 = new Player(0, 0, new Inventory());
    p2.inv.slots[0] = { id: raven, stack: 1 };
    expect(p2.luckEquipmentBonus).toBeCloseTo(-0.1, 6);
  });

  it('三旗并存 = 加法（+0.03 −0.1 −0.1 = −0.17），非取最大/非取绝对值最大', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.slots[0] = { id: clover, stack: 1 };
    p.inv.slots[1] = { id: wilted, stack: 1 };
    p.inv.slots[2] = { id: raven, stack: 1 };
    expect(p.luckEquipmentBonus).toBeCloseTo(-0.17, 6);
  });

  it('同款多槽不叠（hasLuck_* 是 bool 旗非计数：两株四叶草仍 +0.03）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.slots[0] = { id: clover, stack: 5 };
    p.inv.slots[1] = { id: clover, stack: 5 };
    p.inv.armor[3] = { id: clover, stack: 1 };       // 装备槽同计入（GrantArmorBenefits）
    expect(p.luckEquipmentBonus).toBeCloseTo(0.03, 6);
  });

  it('装备槽扫描覆盖 armor[0-9]（GrantArmorBenefits :12683-12685）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[5] = { id: wilted, stack: 1 };
    expect(p.luckEquipmentBonus).toBeCloseTo(-0.1, 6);
  });
});

describe('马掌族九件全集（ApplyEquipFunctional hasLuck_LuckyHorseshoe 赋值处）', () => {
  it('158/396/1250/5331 各 +0.05（装备位生效）', () => {
    for (const id of [horseshoe, obsidianHorseshoe, balloonHorseshoe, soaring]) {
      const p = new Player(0, 0, new Inventory());
      p.inv.armor[ACC_ARMOR_START] = { id, stack: 1 };
      expect(p.luckEquipmentBonus).toBeCloseTo(0.05, 6);
    }
  });

  it('口袋里的马掌不给运气（旗限 armor[3-9]，区别于四叶草口袋语义）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.slots[10] = { id: horseshoe, stack: 1 };
    expect(p.luckEquipmentBonus).toBe(0);
  });
});

describe('幸运币旗（hasLuck_LuckyCoin {855,3034,3035} → equipStats.luckyCoin）', () => {
  it('855 装备 +0.05；与四叶草/马掌加法并存（:12640-12646）', () => {
    const p = new Player(0, 0, new Inventory());
    p.inv.armor[ACC_ARMOR_START] = { id: luckyCoin, stack: 1 };
    expect(p.luckEquipmentBonus).toBeCloseTo(0.05, 6);
    p.inv.slots[0] = { id: clover, stack: 1 };
    p.inv.armor[ACC_ARMOR_START + 1] = { id: horseshoe, stack: 1 };
    expect(p.luckEquipmentBonus).toBeCloseTo(0.13, 6);   // 0.05+0.05+0.03
  });
});

describe('获取链（掉落源）', () => {
  it('割成熟药草 1/1000 四叶草掷（KillTile_DropBait :66337-66340）——帧带门与分母', async () => {
    const { dropCloverRoll } = await import('../src/world/DropBait');
    // sheet 73 成熟药草（frameX<108）命中；自长株带（fx>=108）不掷
    expect(dropCloverRoll(73, 0, () => 0.0005)).toBe(true);
    expect(dropCloverRoll(73, 0, () => 0.999)).toBe(false);
    expect(dropCloverRoll(73, 108, () => 0)).toBe(false);   // 花靴自长带
    expect(dropCloverRoll(3, 0, () => 0)).toBe(false);      // 草方块不在表
    // 1/1000 分母边界
    expect(dropCloverRoll(73, 0, () => 0.001)).toBe(false);
  });
});

// 恶魔之心 3335 槽位数学（★清偿刀 P 逐槽谓词 Player.cs:12669-12690
// IsItemSlotUnlockedAndUsable——旧 accSlotMax 连续界建模退役判据）
// 偏差史：连续界在「大师世界无恶魔心」态反相（连续界 8 开 9 锁 vs 原版 8 锁 9 开），
// 本文件即该场景判别锁（清偿刀 N 定谳 → 刀 P 清偿；N 刀「社交 18 放置 UI 门下
// 不可达」判断已证伪——右键装备段扫 13..19 可达 18，社交环门随本刀落地）。
import { describe, expect, it } from 'vitest';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';

/** vid → 内部 id 权威反查（drone-visor-face-draw.test.ts 同口径） */
const vidIdx = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

describe('IsItemSlotUnlockedAndUsable 逐槽真值表（Player.cs:12669-12690）', () => {
  it('经典世界无旗：基座 3-7 恒开,心 8/大师 9 双锁（社交孪生 18/19 同门）', () => {
    const inv = new Inventory();
    for (let k = 3; k <= 7; k++) expect(inv.isItemSlotUnlockedAndUsable(k)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(false);
    expect(inv.isItemSlotUnlockedAndUsable(9)).toBe(false);
    expect(inv.isItemSlotUnlockedAndUsable(18)).toBe(false);
    expect(inv.isItemSlotUnlockedAndUsable(19)).toBe(false);
  });

  it('专家世界+恶魔心：8/18 开,9/19 仍锁（extraAccessory=false 时连 gameMenu 也不开,:12678 return false）', () => {
    const inv = new Inventory();
    inv.gateExpert = true;
    inv.extraAccessory = true;
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(18)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(9)).toBe(false);
    expect(inv.isItemSlotUnlockedAndUsable(19)).toBe(false);
    // 经典世界旗在但格不生效（cs:18402-18409）
    const cl = new Inventory();
    cl.extraAccessory = true;
    expect(cl.isItemSlotUnlockedAndUsable(8)).toBe(false);
  });

  it('★判别核心「大师世界无恶魔心」：8 锁 9 开（原版逐槽）——旧连续界反相(8 开 9 锁)已清偿', () => {
    const inv = new Inventory();
    inv.gateMaster = true;   // 大师水晶槽 :12685-12689 无道具门
    expect(inv.isItemSlotUnlockedAndUsable(9)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(19)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(false);   // ← 旧连续界此处 true（accSlotMax=9 含 8）
    expect(inv.isItemSlotUnlockedAndUsable(18)).toBe(false);
    // 心+大师全开态
    inv.extraAccessory = true;
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(true);
    expect(inv.isItemSlotUnlockedAndUsable(9)).toBe(true);
  });

  it('其余槽（0-7/10-17）恒真（default 臂）', () => {
    const inv = new Inventory();
    for (const k of [0, 1, 2, 10, 11, 12, 13, 14, 15, 16, 17]) {
      expect(inv.isItemSlotUnlockedAndUsable(k)).toBe(true);
    }
  });
});

describe('追加槽显隐（Player.cs:4259-4281 CanDemonHeart/MasterModeAccessoryBeShown）', () => {
  it('解锁∨功能格∨社交孪生 18/19∨染料格（★刀 P 补孪生臂）', () => {
    const acc = vidIdx(5452);
    const inv = new Inventory();
    // 经典世界全空：双隐
    expect(inv.shownExtraCount()).toBe(0);
    // 功能格占（跨世界携带）：显示但不生效
    inv.armor[8] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().heart).toBe(true);
    expect(inv.extraSlotShown().master).toBe(false);
    inv.armor[8] = null;
    // 社交孪生 18 占格同样开显（旧版漏此臂）
    inv.armor[18] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().heart).toBe(true);
    inv.armor[18] = null;
    inv.armor[19] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().master).toBe(true);
    inv.armor[19] = null;
    // 染料格占
    inv.dye[8] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().heart).toBe(true);
    inv.dye[8] = null;
    // 大师世界：9 号槽恒显（旧版无心态显示的是 8 号位=反相显示面）
    inv.gateMaster = true;
    expect(inv.extraSlotShown().heart).toBe(false);
    expect(inv.extraSlotShown().master).toBe(true);
    expect(inv.shownExtraCount()).toBe(1);
  });
});

describe('效果/绘制结算面（:13044/:13110 逐槽门,Player 级）', () => {
  it('★大师无恶魔心：armor[9] 配饰生效（旧连续界不结算）、armor[8] 不生效（旧连续界反结算）', () => {
    const horse = vidIdx(158);   // Lucky Horseshoe（hasHorseshoe vid 判定）
    const p = new Player(0, 0, new Inventory());
    p.inv.gateMaster = true;
    p.inv.armor[9] = { id: horse, stack: 1 };
    expect(p.hasHorseshoe).toBe(true);      // 旧连续界 accSlotMax=9 不含 9 → false（反相面）
    p.inv.armor[9] = null;
    p.inv.armor[8] = { id: horse, stack: 1 };
    expect(p.hasHorseshoe).toBe(false);     // 锁槽不结算（旧连续界 accSlotMax=9 含 8 → true）
  });

  it('经典世界旗在格锁：armor[8] 存物不结算（cs:18402）', () => {
    const horse = vidIdx(158);
    const p = new Player(0, 0, new Inventory());
    p.inv.extraAccessory = true;
    p.inv.armor[8] = { id: horse, stack: 1 };
    expect(p.hasHorseshoe).toBe(false);
    p.inv.gateExpert = true;
    expect(p.hasHorseshoe).toBe(true);
  });

  it('社交环逐槽门：19（大师孪生）大师世界入绘制聚合,18（恶魔心孪生）锁不入', () => {
    const cloak = vidIdx(5452);   // face=21 判别件（drone-visor 同锚）
    const on = new Player(0, 0, new Inventory());
    on.inv.gateMaster = true;
    on.inv.armor[19] = { id: cloak, stack: 1 };
    expect(on.equipStats.accDraw.face).toBe(21);
    const off = new Player(0, 0, new Inventory());
    off.inv.gateMaster = true;
    off.inv.armor[18] = { id: cloak, stack: 1 };
    expect(off.equipStats.accDraw.face).toBe(0);   // 旧版社交环 13..20 无门 → 21（N 刀登记面）
  });
});

// ★清偿刀 U（2026-09-29）装备槽域三残面判别测试（清偿刀 P 新立债 #1/#2/#3）。
// 定谳锚（1457 反编译亲读,1456/1405 对拍）：
//   面① expertOnly 效益门：Player.cs:13017-13018 UpdateEquips k-loop
//     `(!effectiveArmor.expertOnly || Main.expertMode)`（GrantPrefixBenefits+
//     GrantArmorBenefits 全效益）+ :14475-14478 ApplyEquipFunctional 头整函数早退;
//     画廊/线色臂（UpdateVisibleAccessories :36331/UpdateVisibleAccessory :36441）
//     【无】门照画;套装【检测】面（ArmorSetBonus.QueryContext :29-35 直读
//     GetEffectiveArmor）无门。数据定谳：1.4.5.7 全树零 `expertOnly = true` 赋值
//     （Item.cs:129 声明/:48960 ResetStats 置 false 外无第三处;1456/1405 同相）——
//     原版内容全 false,门为模组物品建模（ItemDef.expertOnly 仅 mod 可置）。
//   面② ArmorSwap 冲突臂：ItemSlot.cs:3592-3648——对段 HasSameItemInSlot
//     （:3597-3600,同 type∨同互斥组,无翅臂）/自段冲突【换入冲突槽】（:3608-3623,
//     仅 :3620-3623 锁槽早退）/无冲突首空（:3628-3635）/全满段首（:3627）;
//     盔甲同款含目标槽自身早退（:3592-3596,无 DualEquipArmor 例外）。旧面
//     armorAccepts 拒→早退=自创语义。
//   面③ DyeSwap 计数器：ItemSlot.cs:3556-3577——while 跳锁（:3558-3561）→ 全表
//     扫首个解锁∧空槽优先（:3563-3568）→ 与计数槽 SwapClearFavorite（:3571,全满
//     【不】早退）→ 计数器 +1 mod 10（:3573）。计数器=:292 private static 会话态
//     【不入档】;ResetInventoryStateCounters（:3262-3265）由 Main.cs:46445
//     !playerInventory 每帧调 = 关包归零。旧面「全满早退」=自创。
//   音效：SwapEquip 三原语（ArmorSwap :3643/DyeSwap :3570/EquipSwap :3657）成功支
//     统一 PlaySound(7)='pickup'（旧 'menuTick'=取件臂 Sound 12 误挂）。
// 测试法：sw-bj116 mkUi 原型桩（真实现+真 Inventory+sfx/成就录音）;面①用真
//   Player.equipStats + 测试内变异 ITEM_DEFS[].expertOnly（finally 还原——原版
//   数据面零真值,门的行为分支只能由测试数据点亮）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI, resetInventoryStateCounters } from '../src/ui/UI';
import { Inventory, ACC_ARMOR_START } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const BOOTS = idOfVid(54);        // Hermes Boots acc:1（accfx runSpeed:6）
const HELMET = idOfVid(89);       // Copper Helmet hs:1 def:1（statOfInternal.def）
const MAGIC_STRING = idOfVid(5540);   // 魔法线（accfx 族,功能臂门内）
const YOYO_STRING = idOfVid(3293);    // 悠悠球线族 str:1——功能臂 yoyoString 门内/线色臂 stringColor 门外
const WING_A = idOfVid(492);      // 恶魔之翼 wing:1
const WING_B = idOfVid(493);      // 天使之翼 wing:2
const DIVING = idOfVid(268);      // Diving Helmet hs:27（功能盔甲）
const RED_DYE = idOfVid(1007);    // Red Dye（染料）
const CYC_A = idOfVid(6168);      // 弹药循环·四格（互斥组主键）
const CYC_B = idOfVid(6169);      // 弹药循环·全背包（同组 6168）
const WATCH_COPPER = idOfVid(15); // 功能配饰段填充族（互异防同款互斥）
const WATCH_SILVER = idOfVid(16);
const WATCH_GOLD = idOfVid(17);
const DEPTH_METER = idOfVid(18);
const BAND_REGEN = idOfVid(49);

/** UI 原型桩（sw-bj116 同法）：真实现 + 真 Inventory + sfx/成就录音 */
function mkUi(): { ui: AnyUI; sfx: string[]; achCalls(): number } {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  const sfx: string[] = [];
  let ach = 0;
  ui.game = {
    player: { inv: new Inventory() },
    sfx: { play: (name: string) => { sfx.push(name); } },
    achNotifyEquipChanged: () => { ach++; },
    npcShopOpen: false,
  };
  ui.heldStack = null;
  ui.heldFrom = null;
  ui.openChest = null;
  ui.refreshAll = () => {};
  return { ui, sfx, achCalls: () => ach };
}

const mkPlayer = (): Player => new Player(60 * 16, 90 * 16, new Inventory());

// ===================== 面① expertOnly 效益门 =====================
describe('清偿刀 U 面① expertOnly 效益门（:13017-13018/:14475-14478）', () => {
  /** 测试内点亮 expertOnly（原版数据面零真值;finally 还原防串测） */
  function withExpertOnly<T>(id: number, fn: () => T): T {
    const def = ITEM_DEFS[id] as unknown as Record<string, unknown>;
    def.expertOnly = true;
    try {
      return fn();
    } finally {
      delete def.expertOnly;
    }
  }

  it('配饰效益面（accfx runSpeed 通道）：经典世界零效益,专家世界照常', () => {
    withExpertOnly(BOOTS, () => {
      const p = mkPlayer();
      const base = p.equipStats.accRunSpeed;
      expect(base).toBe(0);
      p.inv.armor[3] = { id: BOOTS, stack: 1 };
      expect(p.equipStats.accRunSpeed).toBe(base);           // 经典：ApplyEquipFunctional 门内=零
      p.inv.gateExpert = true;
      expect(p.equipStats.accRunSpeed).toBe(6);              // :14475 门开（vanilla-accfx '54'.runSpeed=6）
    });
  });

  it('词缀效益面（GrantPrefixBenefits 62-80）：经典世界零效益,专家世界照常', () => {
    withExpertOnly(BOOTS, () => {
      const p = mkPlayer();
      p.inv.armor[3] = { id: BOOTS, stack: 1, prefix: 73 };  // Quick 系 73=+1% 移速
      expect(p.equipStats.moveMult).toBe(1);                 // :13018 k-loop 门内=零
      p.inv.gateExpert = true;
      expect(p.equipStats.moveMult).toBeCloseTo(1.01);       // k-loop 门开
    });
  });

  it('甲件防御面（GrantArmorBenefits :13220）：经典世界零防御,专家世界照常', () => {
    withExpertOnly(HELMET, () => {
      const p = mkPlayer();
      p.inv.armor[0] = { id: HELMET, stack: 1 };
      expect(p.defense).toBe(0);                             // defense getter 甲件和 :13220 门内=零
      p.inv.gateExpert = true;
      expect(p.defense).toBe(1);                             // statOfInternal(89).def=1
    });
  });

  it('可见面不设门：专家档配饰经典世界仍染线（stringColor）但零功能（yoyoString）', () => {
    withExpertOnly(YOYO_STRING, () => {
      const p = mkPlayer();
      p.inv.armor[3] = { id: YOYO_STRING, stack: 1 };
      const es = p.equipStats;
      expect(es.stringColor).toBe(1);                        // UpdateVisibleAccessory :36441 门【外】照染（str=1）
      expect(es.yoyoString).toBe(false);                     // ApplyEquipFunctional :14816 门【内】=零
      p.inv.gateExpert = true;
      expect(p.equipStats.yoyoString).toBe(true);
      expect(p.equipStats.stringColor).toBe(1);
    });
  });

  it('套装【检测】面不设门（ArmorSetBonus.QueryContext :29-35 无 expertOnly 臂）——'
    + '单件效益旗照门（shroomiteType=GrantArmorBenefits :13274 面）', () => {
    withExpertOnly(HELMET, () => {
      const p = mkPlayer();
      // 检测面载体：equipStats 消费 hs/bs/ls 的套装匹配（activeArmorSetMatch 直读
      // effArmor——蘑菇矿头 1546 单件面才是门内对照位,此处用 def 通道已证单件门;
      // 本断言锁「甲件在经典世界仍进 effArmor 读点」=检测面不因门而盲）
      p.inv.armor[0] = { id: HELMET, stack: 1 };
      expect(p.inv.getEffectiveArmor(0)?.id).toBe(HELMET);   // 门不遮 GetEffectiveArmor 本体
    });
  });

  it('equipStats 内容键含难度位：专家档件在场时改档翻转帧失效重算', () => {
    withExpertOnly(BOOTS, () => {
      const p = mkPlayer();
      p.inv.armor[3] = { id: BOOTS, stack: 1 };
      const a = p.equipStats;                                 // 经典态
      p.inv.gateExpert = true;
      const b = p.equipStats;
      expect(b).not.toBe(a);                                  // mix(14) 难度位 → 新引用
      expect(b.accRunSpeed).toBe(6);
    });
  });
});

// ===================== 面② ArmorSwap 冲突臂 =====================
describe('清偿刀 U 面② ArmorSwap 冲突臂（:3592-3648 换入冲突槽）', () => {
  it('自段冲突 → 换入冲突槽（:3617 targetSlot=collisionSlot）：空槽【不】被占,被顶件回包', () => {
    const { ui, sfx, achCalls } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[4] = { id: WING_A, stack: 1 };                 // 冲突件在 4（双翅互斥 :3465-3474）
    inv.slots[10] = { id: WING_B, stack: 1 };
    ui.swapEquipItem({ id: WING_B, stack: 1 }, 'inv', 10);
    expect(inv.armor[4]).toMatchObject({ id: WING_B });      // 换入冲突槽
    expect(inv.slots[10]).toMatchObject({ id: WING_A });     // 被顶件回背包
    expect(inv.armor[3]).toBeNull();                          // 空槽未被占（旧面 armorAccepts 拒=全静默）
    expect(sfx).toEqual(['pickup']);                          // PlaySound(7)（:3643）
    expect(achCalls()).toBe(1);                               // HandleOnEquip（:3358）
  });

  it('互斥组冲突（AccessoryIncompatibilityType :3475-3480）→ 换入冲突槽,组员两两互斥', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: CYC_A, stack: 1 };                  // 6168 主键
    inv.slots[10] = { id: CYC_B, stack: 1 };                 // 6169 同组
    ui.swapEquipItem({ id: CYC_B, stack: 1 }, 'inv', 10);
    expect(inv.armor[3]).toMatchObject({ id: CYC_B });       // 组冲突→换入 3
    expect(inv.slots[10]).toMatchObject({ id: CYC_A });
    expect(inv.armor[4]).toBeNull();
  });

  it('段内同 type（:3462）→ 与己互换=成功+SwapClearFavorite 双端清（非拒装）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[5] = { id: WATCH_COPPER, stack: 1, favorited: true };   // 分享标记
    inv.slots[10] = { id: WATCH_COPPER, stack: 1 };
    ui.swapEquipItem({ id: WATCH_COPPER, stack: 1 }, 'inv', 10);
    expect(inv.armor[5]!.favorited).toBe(false);             // SwapClearFavorite（:1237）双端清=成功侧证
    expect(inv.armor[3]).toBeNull();
    expect(sfx).toEqual(['pickup']);
  });

  it('冲突槽锁定 → 早退无声（:3620-3623——经典无恶魔心 8 号锁,解锁后同场景成功', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[8] = { id: WATCH_COPPER, stack: 1 };           // 8 号=恶魔心格（经典锁）
    inv.slots[10] = { id: WATCH_COPPER, stack: 1 };          // 同款→collision=8
    ui.swapEquipItem({ id: WATCH_COPPER, stack: 1 }, 'inv', 10);
    expect(inv.armor[8]).toMatchObject({ id: WATCH_COPPER });// 未动
    expect(inv.slots[10]).toMatchObject({ id: WATCH_COPPER });// 手上件未动
    expect(sfx).toEqual([]);                                  // :3620-3623 早退无声
    // 解锁态（:12673-12677 extraAccessory∧expert）→ 换入 8 成功
    inv.extraAccessory = true;
    inv.gateExpert = true;
    ui.swapEquipItem({ id: WATCH_COPPER, stack: 1 }, 'inv', 10);
    expect(inv.armor[8]).toMatchObject({ id: WATCH_COPPER });
    expect(inv.slots[10]).toMatchObject({ id: WATCH_COPPER });
    expect(sfx).toEqual(['pickup']);
  });

  it('对段同款 → 早退（:3597-3600 HasSameItemInSlot——功能件扫社交段）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[13] = { id: BOOTS, stack: 1 };                 // 社交段同款
    inv.slots[10] = { id: BOOTS, stack: 1 };
    ui.swapEquipItem({ id: BOOTS, stack: 1 }, 'inv', 10);
    expect(inv.armor[3]).toBeNull();                          // 功能段不收
    expect(inv.armor[13]).toMatchObject({ id: BOOTS });
    expect(inv.slots[10]).toMatchObject({ id: BOOTS });
    expect(sfx).toEqual([]);
  });

  it('盔甲同款已在段（含目标槽自身 :3592-3596）→ 早退;异款照常顶替', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[0] = { id: DIVING, stack: 1, favorited: true };
    inv.slots[10] = { id: DIVING, stack: 1 };                // 手上同款第二件
    ui.swapEquipItem({ id: DIVING, stack: 1 }, 'inv', 10);
    expect(inv.armor[0]!.favorited).toBe(true);              // 未动（旧面 armorAccepts 放行=收藏被洗+误响）
    expect(inv.slots[10]).toMatchObject({ id: DIVING });
    expect(sfx).toEqual([]);
    // 异款盔甲照常顶替（:3641-3644 无条件换目标部位槽）
    inv.slots[10] = { id: HELMET, stack: 1 };
    ui.swapEquipItem({ id: HELMET, stack: 1 }, 'inv', 10);
    expect(inv.armor[0]).toMatchObject({ id: HELMET });
    expect(inv.slots[10]).toMatchObject({ id: DIVING });
    expect(sfx).toEqual(['pickup']);
  });

  it('全满无冲突 → 段首槽交换（:3627 targetSlot=Offset——既有行为回归锁）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BAND_REGEN, stack: 1 };
    inv.armor[4] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[5] = { id: WATCH_SILVER, stack: 1 };
    inv.armor[6] = { id: WATCH_GOLD, stack: 1 };
    inv.armor[7] = { id: DEPTH_METER, stack: 1 };
    inv.slots[10] = { id: BOOTS, stack: 1 };
    ui.swapEquipItem({ id: BOOTS, stack: 1 }, 'inv', 10);
    expect(inv.armor[3]).toMatchObject({ id: BOOTS });
    expect(inv.slots[10]).toMatchObject({ id: BAND_REGEN });
  });
});

// ===================== 面③ DyeSwap 持久计数器 =====================
describe('清偿刀 U 面③ DyeSwap 计数器轮转（:3556-3577）', () => {
  it('空槽优先+计数器推进（:3563-3568/:3573）：两次装备落 dye[0]→dye[2]', () => {
    resetInventoryStateCounters();
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.dye[1] = { id: RED_DYE, stack: 1 };                  // 预占 1
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);
    expect(inv.dye[0]).toMatchObject({ id: RED_DYE });       // 首个解锁∧空=dye[0]
    expect(inv.slots[10]).toBeNull();
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);
    expect(inv.dye[2]).toMatchObject({ id: RED_DYE });       // 0/1 已占 → dye[2]（计数器只影响全满分支）
    expect(inv.slots[10]).toBeNull();
    expect(sfx).toEqual(['pickup', 'pickup']);               // :3570
  });

  it('全满【不】早退：与计数槽交换（:3571/:3572——被换下染料回源格）+计数器逐次推进', () => {
    resetInventoryStateCounters();
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    for (let k = 0; k < 8; k++) inv.dye[k] = { id: RED_DYE, stack: 1, favorited: k === 0 };
    const firstDye0 = inv.dye[0];
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 计数器 0 → 与 dye[0] 交换
    expect(inv.dye[0]).not.toBe(firstDye0);                  // 新件上 0 号
    expect(inv.slots[10]).toBe(firstDye0);                   // 被换下件（原 0 号对象）回包
    expect(firstDye0!.favorited).toBe(false);                // SwapClearFavorite 双端清
    expect(inv.dye[0]!.favorited).toBe(false);
    expect(sfx).toEqual(['pickup']);
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 计数器 1 → 与 dye[1] 交换
    expect(inv.dye[1]).not.toMatchObject({ favorited: true });
    expect(inv.slots[10]).toMatchObject({ id: RED_DYE });
  });

  it('while 跳锁+mod 10 环扫（:3558-3561）：经典世界计数器走到 8 后回卷 0（8/9 锁跳过）', () => {
    resetInventoryStateCounters();
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    for (let k = 0; k < 8; k++) inv.dye[k] = { id: RED_DYE, stack: 1 };
    for (let n = 0; n < 8; n++) {                            // 八连装：0..7 逐槽交换,计数器→8
      inv.slots[10] = { id: RED_DYE, stack: 1 };
      ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);
    }
    const dye0Before = inv.dye[0];
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 计数器 8→锁→9 锁→回卷 0
    expect(inv.dye[0]).not.toBe(dye0Before);                 // 回卷后与 dye[0] 交换
    expect(inv.dye[8]).toBeNull();                           // 锁槽 8/9 全程未被写（经典）
    expect(inv.dye[9]).toBeNull();
  });

  it('关包归零（ResetInventoryStateCounters :3262-3265/Main.cs:46445 !playerInventory）', () => {
    resetInventoryStateCounters();
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    for (let k = 0; k < 8; k++) inv.dye[k] = { id: RED_DYE, stack: 1 };
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 计数器 0→1
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 1→2
    resetInventoryStateCounters();                           // ≙ closeInventory（UI 内接）
    const dye0Before = inv.dye[0];
    inv.slots[10] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'inv', 10);  // 归零后计数器 0 → 与 dye[0] 交换
    expect(inv.dye[0]).not.toBe(dye0Before);
  });

  it('计数器=UI 会话态结构锁：closeInventory 内接 reset（变异即红）;不入存档域', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');
    const close = src.indexOf('  closeInventory() {');
    const next = src.indexOf('\n  }', close);
    const body = src.slice(close, next);
    expect(body).toContain('resetInventoryStateCounters();');
    // 会话态域：Inventory.ts 存档面零触及（dyeSwapCounter 不在 Inventory 类上）
    const invSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/items/Inventory.ts'), 'utf8');
    expect(invSrc.includes('dyeSwapCounter')).toBe(false);
  });
});

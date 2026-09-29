// ★SW-BJ116-a/b（2026-09-18）装备/染料/杂项格右键语义 1:1（登记债清偿）+ rarityColor
// 四漂移档整表对齐 + showReforgeTooltip 词缀档位移。
// 定谳锚（1457 反编译亲读;1458 对拍零差）：
//   · ItemSlot.RightClick :1614-1693：首块门(:1636)=光标空或不可叠同款——switch
//     (:1654-1676) case 9/11=SwapVanityEquip(:1845 同序互换+Sound 7 :1857);
//     case 0/3/4/32=stack==1&&(CanBeEquipped||dye>0)→SwapEquip(:3287);
//     case 8/10/12/16-20/33=【无 case】→落 PickupItemIntoMouse(:1695) 取 1 到光标
//     +Sound 12(:1688)=menuTick。本仓旧面 canSwapEquip→swapEquipItem 对装备列=
//     换槽路由(no-op/自段挪位)、splitHalf 拆半——均为自创,本刀摘。
//   · SwapVanityEquip :1845-1877 门序：npcShop>0 → 双空 → context 11 双向
//     CanEquipAccessoryInSlot(:3540,冲突槽=目标槽放行;段宽恒 7 不设解锁门;
//     对段不扫) → SwapClearFavorite(:1237 双端清) → Sound 7 → HandleOnEquip(:1873)。
//   · PickupItemIntoMouse :1695-1750：光标空→clone 单件(favorited 且整格 stack==1
//     随件 :1706-1709);光标同款可叠→+1(:1685 CanStack+stack<maxStack);异款/满叠
//     无动作;源 stack-- 归零清槽(:1719-1724)。
//   · swapEquipItem 容器向 src 修复：case 0/3/4/32 的 inv[slot] 即容器格,
//     SwapEquip 直换该格↔装备位——旧码 src 误读 inv.dye[i]（右键箱中装备=空转/
//     错装染料格+miscDyes 错位回写）。
//   · GetItemNameColor :20742-20814（债刀-2）：−11=(255,175,0)（旧 '#828282' 误并
//     −1 档）/9=(5,200,255)/10=(255,40,100)/≥11=(180,40,255)——旧表自创/漂移。
//   · Item.Prefix :588-614（债刀-3）：num2≥1.2 +2 / ≥1.05 +1 / ≤0.8 −2 / ≤0.95 −1
//     （reforge 烘入 Item.rare,MouseText_DrawItemTooltip :20511 直读）——重铸槽
//     tooltip 曾用基表值整缺位移。
// 测试法：UI 原型桩（sw-qd4 Object.create(UI.prototype) 同法）真实现驱动
//   pickupEquipIntoMouse/swapVanityEquip/swapEquipItem/showReforgeTooltip +
//   真 Inventory;sfx/成就桩录音;右键链路由序走源码结构锁（fx52 C4 同法,变异即红）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';

type AnyUI = Record<string, any>;

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

// 装备族夹具（vid:本仓 internal id;部位/配饰归属见 vanilla-itemstats.json）
const BOOTS = idOfVid(54);        // Hermes Boots acc:1（功能配饰）
const HALO = idOfVid(1987);       // Angel Halo acc:0 van:1（社交配饰）
const DIVING = idOfVid(268);      // Diving Helmet hs:27（功能盔甲）
const FAMILIAR = idOfVid(269);    // Familiar Shirt bs:0 van:1（时装盔甲）
const WING_A = idOfVid(492);      // 双翅族（statOfInternal().wing=1）
const WING_B = idOfVid(493);
const WING_C = idOfVid(665);
const RED_DYE = idOfVid(1007);    // Red Dye（染料,maxStack>1）
const CARROT = idOfVid(603);      // Carrot（宠物,杂项段）
const FALLING_STAR = idOfVid(75); // 坠落星 rare=1（可重铸魔法武器）
// 功能配饰段预填充族（acc:1,互异防 armorAccepts 同款互斥）
const WATCH_COPPER = idOfVid(15);
const WATCH_SILVER = idOfVid(16);
const WATCH_GOLD = idOfVid(17);
const DEPTH_METER = idOfVid(18);
const BAND_REGEN = idOfVid(49);
const PREFIX_LEGENDARY = 81;      // valueMul 1.760 ≥1.2 → rare+2
const PREFIX_QUICK = 42;          // 1.100 ≥1.05 → +1
const PREFIX_AWFUL = 22;          // 0.689 ≤0.8 → −2
const PREFIX_SMALL = 9;           // 0.900 ≤0.95 → −1（Lazy 49 同档,l10n 键缺=告警污染改 Small）

/** UI 原型桩：真实现 + 真 Inventory + sfx/成就录音 */
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
  // ★SW-TT1：showReforgeTooltip 现走 applyTooltipBg 终局（清 nobox 类→display 门早退）
  ui.tooltip = { style: {} as CSSStyleDeclaration, innerHTML: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false } } as never;
  ui.reforgeItem = null;
  ui.reforgeSlotEl = null;
  return { ui, sfx, achCalls: () => ach };
}

// ============ ① case 8/10/12/16-20/33 = PickupItemIntoMouse 取 1 到光标 ============
describe('BJ116 ① 装备/染料/杂项列右键=取 1 到光标（RightClick :1677-1691 无 case 落取件臂）', () => {
  it('配饰格（context 10）取下到光标：整件上光标+源格清空+Sound 12', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BOOTS, stack: 1 };
    ui.pickupEquipIntoMouse('armor', 3);
    expect(ui.heldStack).toMatchObject({ id: BOOTS, stack: 1 });
    expect(inv.armor[3]).toBeNull();
    expect(sfx).toEqual(['menuTick']);                       // SoundEngine.PlaySound(12)（:1688）
  });

  it('多叠取 1（PickupItemIntoMouse :1716 stack++/:1719 stack-- 单件语义,非拆半）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BOOTS, stack: 50 };
    ui.pickupEquipIntoMouse('armor', 3);
    expect(ui.heldStack).toMatchObject({ id: BOOTS, stack: 1 });
    expect(inv.armor[3]!.stack).toBe(49);
    expect(sfx).toEqual(['menuTick']);
  });

  it('光标同款可叠 → +1（:1685 CanStack+stack<maxStack）;满叠/异款无动作无声', () => {
    const max = ITEM_DEFS[RED_DYE].maxStack;
    expect(max).toBeGreaterThan(1);
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    ui.heldStack = { id: RED_DYE, stack: 3 };
    inv.dye[0] = { id: RED_DYE, stack: 10 };
    ui.pickupEquipIntoMouse('dye', 0);                       // context 12 同臂
    expect(ui.heldStack!.stack).toBe(4);
    expect(inv.dye[0]!.stack).toBe(9);
    // 满叠：mouseItem.stack == maxStack → 无动作
    ui.heldStack = { id: RED_DYE, stack: max };
    inv.dye[0] = { id: RED_DYE, stack: 10 };
    ui.pickupEquipIntoMouse('dye', 0);
    expect(ui.heldStack!.stack).toBe(max);
    expect(inv.dye[0]!.stack).toBe(10);
    // 异款：!CanStack → 无动作
    ui.heldStack = { id: BOOTS, stack: 1 };
    inv.dye[0] = { id: RED_DYE, stack: 10 };
    ui.pickupEquipIntoMouse('dye', 0);
    expect(ui.heldStack).toMatchObject({ id: BOOTS, stack: 1 });
    expect(inv.dye[0]!.stack).toBe(10);
    expect(sfx).toEqual(['menuTick']);                       // 仅首取一响
  });

  it('收藏随尾件（:1706-1709 favorited && stack==1）;多叠不带收藏', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[4] = { id: BOOTS, stack: 1, favorited: true };   // loadout 分享标记
    ui.pickupEquipIntoMouse('armor', 4);
    expect(ui.heldStack!.favorited).toBe(true);
    inv.armor[4] = { id: BOOTS, stack: 2, favorited: true };
    ui.heldStack = null;
    ui.pickupEquipIntoMouse('armor', 4);
    expect(ui.heldStack!.favorited).toBe(false);
    expect(inv.armor[4]!.stack).toBe(1);
  });

  it('context 8 盔甲 / 16-20 杂项 / 33 杂项染料 / 12 染料 同臂（switch 无 case 全落取件）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[0] = { id: DIVING, stack: 1 };
    ui.pickupEquipIntoMouse('armor', 0);
    expect(ui.heldStack).toMatchObject({ id: DIVING, stack: 1 });
    expect(inv.armor[0]).toBeNull();
    inv.miscEquips[0] = { id: CARROT, stack: 1 };
    ui.heldStack = null;
    ui.pickupEquipIntoMouse('misc', 0);
    expect(ui.heldStack).toMatchObject({ id: CARROT, stack: 1 });
    expect(inv.miscEquips[0]).toBeNull();
    inv.miscDyes[0] = { id: RED_DYE, stack: 5 };
    ui.heldStack = null;
    ui.pickupEquipIntoMouse('miscDye', 0);
    expect(ui.heldStack!.stack).toBe(1);
    expect(inv.miscDyes[0]!.stack).toBe(4);
    inv.dye[0] = { id: RED_DYE, stack: 2 };
    ui.heldStack = null;
    ui.pickupEquipIntoMouse('dye', 0);
    expect(inv.dye[0]!.stack).toBe(1);
    expect(sfx).toEqual(['menuTick', 'menuTick', 'menuTick', 'menuTick']);
  });

  it('空槽/无光标动作：IsAir 早退（:1678）无声无状态', () => {
    const { ui, sfx } = mkUi();
    ui.pickupEquipIntoMouse('armor', 3);
    expect(ui.heldStack).toBeNull();
    expect(sfx).toEqual([]);
  });
});

// ============ ① case 9/11 = SwapVanityEquip 同序互换 + Sound 7 ============
describe('BJ116 ① 时装列右键=SwapVanityEquip（:1845-1877 同序互换,非本段重排）', () => {
  it('时装盔甲 ↔ 装备盔甲同序互换（10↔0）+ Sound 7 + HandleOnEquip', () => {
    const { ui, sfx, achCalls } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[0] = { id: DIVING, stack: 1 };
    inv.armor[10] = { id: FAMILIAR, stack: 1 };
    ui.swapVanityEquip(10);
    expect(inv.armor[0]).toMatchObject({ id: FAMILIAR });
    expect(inv.armor[10]).toMatchObject({ id: DIVING });
    expect(sfx).toEqual(['pickup']);                         // SoundEngine.PlaySound(7)（:1857）
    expect(achCalls()).toBe(1);                              // HandleOnEquip（:1873）
  });

  it('时装配饰 ↔ 功能配饰同序互换（13↔3）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BOOTS, stack: 1 };
    inv.armor[13] = { id: HALO, stack: 1 };
    ui.swapVanityEquip(13);
    expect(inv.armor[3]).toMatchObject({ id: HALO });
    expect(inv.armor[13]).toMatchObject({ id: BOOTS });
  });

  it('SwapClearFavorite 双端清（:1237-1242——分享标记不随互换骑行）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BOOTS, stack: 1, favorited: true };
    inv.armor[13] = { id: HALO, stack: 1, favorited: true };
    ui.swapVanityEquip(13);
    expect(inv.armor[3]!.favorited).toBe(false);
    expect(inv.armor[13]!.favorited).toBe(false);
  });

  it('单侧空：脱下/穿上互换（:1852 首支仅双空早退）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[11] = { id: FAMILIAR, stack: 1 };              // 时装有、功能空 → 脱下
    ui.swapVanityEquip(11);
    expect(inv.armor[1]).toMatchObject({ id: FAMILIAR });
    expect(inv.armor[11]).toBeNull();
  });

  it('双空早退无声（:1852）;商店开着早退（:1847 Main.npcShop>0）', () => {
    const { ui, sfx } = mkUi();
    ui.swapVanityEquip(10);
    expect(sfx).toEqual([]);
    ui.game.npcShopOpen = true;
    ui.game.player.inv.armor[0] = { id: DIVING, stack: 1 };
    ui.game.player.inv.armor[10] = { id: FAMILIAR, stack: 1 };
    ui.swapVanityEquip(10);
    expect(sfx).toEqual([]);
    expect(ui.game.player.inv.armor[0]).toMatchObject({ id: DIVING });   // 未动
  });

  it('context 11 双翅门阻断：功能段已有异款翅,换入段再遇第三翅（:3544 冲突槽≠目标槽）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: WING_A, stack: 1 };
    inv.armor[13] = { id: HALO, stack: 1 };
    inv.armor[14] = { id: WING_B, stack: 1 };
    ui.swapVanityEquip(13);                                  // HALO↔WING_A
    expect(inv.armor[3]).toMatchObject({ id: WING_A });      // 全部未动
    expect(inv.armor[13]).toMatchObject({ id: HALO });
    expect(inv.armor[14]).toMatchObject({ id: WING_B });
  });

  it('context 11 目标槽冲突放行（:3544 slot==collisionSlot——双翅跨段对换合法）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: WING_A, stack: 1 };
    inv.armor[13] = { id: WING_B, stack: 1 };
    ui.swapVanityEquip(13);
    expect(inv.armor[3]).toMatchObject({ id: WING_B });
    expect(inv.armor[13]).toMatchObject({ id: WING_A });
  });

  it('context 11 段内同款阻断（:3462 CanEquipBothAccessories same type,载入态构造）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: HALO, stack: 1 };                   // 功能段 HALO（跨段同款=载入态构造）
    inv.armor[13] = { id: WING_A, stack: 1 };
    inv.armor[14] = { id: HALO, stack: 1 };                  // 时装段已有同款 HALO
    ui.swapVanityEquip(13);                                  // HALO(armor[3]) 换入时装段:k=14 同款
    expect(inv.armor[3]).toMatchObject({ id: HALO });        // 全部未动
    expect(inv.armor[13]).toMatchObject({ id: WING_A });
    expect(inv.armor[14]).toMatchObject({ id: HALO });
  });
});

// ============ ① case 0/3/4/32 SwapEquip 容器向 src 修复 ============
describe('BJ116 ① 容器右键装备 src 修复（旧码误读 inv.dye[i]）', () => {
  it('箱中配饰右键=装备该件+功能段满时被换下件回箱（SwapEquip 直换容器格↔装备位 :3287）', () => {
    const { ui, sfx } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.dye[0] = { id: RED_DYE, stack: 1 };                  // 旧码 canary：src 误读 inv.dye[0]
    ui.openChest = { x: 0, items: Array(40).fill(null) } as never;
    ui.openChest.items[0] = { id: BOOTS, stack: 1 };
    // 功能配饰段 3-7 填满（accSlotMax 基座 5）→ first-empty 落空 → 交换段首槽
    inv.armor[3] = { id: BAND_REGEN, stack: 1 };
    inv.armor[4] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[5] = { id: WATCH_SILVER, stack: 1 };
    inv.armor[6] = { id: WATCH_GOLD, stack: 1 };
    inv.armor[7] = { id: DEPTH_METER, stack: 1 };
    ui.swapEquipItem({ id: BOOTS, stack: 1 }, 'chest', 0);
    expect(inv.armor[3]).toMatchObject({ id: BOOTS });       // 箱中件上装备位
    expect(ui.openChest.items[0]).toMatchObject({ id: BAND_REGEN });     // 被换下件回箱
    expect(inv.armor[4]).toMatchObject({ id: WATCH_COPPER });            // 其余段位不动
    expect(inv.dye[0]).toMatchObject({ id: RED_DYE });       // 染料格不被误读/误装
    expect(inv.miscDyes[0]).toBeNull();                      // 旧码错位回写格不落在
    expect(sfx).toEqual(['pickup']);                   // SoundEngine.PlaySound(7)（★清偿刀 U:ArmorSwap :3643 统一 Swap 三原语,旧 menuTick=取件臂声误挂）
  });

  it('箱中染料右键→染料位（旧码同错源面）', () => {
    const { ui } = mkUi();
    ui.openChest = { x: 0, items: Array(40).fill(null) } as never;
    ui.openChest.items[0] = { id: RED_DYE, stack: 1 };
    ui.swapEquipItem({ id: RED_DYE, stack: 1 }, 'chest', 0);
    expect(ui.game.player.inv.dye[0]).toMatchObject({ id: RED_DYE });
    expect(ui.openChest.items[0]).toBeNull();
  });

  it('背包向回归不变（inv.slots 取件→装备位,段满时被换下件回背包）', () => {
    const { ui } = mkUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: BOOTS, stack: 1 };
    inv.armor[3] = { id: BAND_REGEN, stack: 1 };
    inv.armor[4] = { id: WATCH_COPPER, stack: 1 };
    inv.armor[5] = { id: WATCH_SILVER, stack: 1 };
    inv.armor[6] = { id: WATCH_GOLD, stack: 1 };
    inv.armor[7] = { id: DEPTH_METER, stack: 1 };
    ui.swapEquipItem({ id: BOOTS, stack: 1 }, 'inv', 10);
    expect(inv.armor[3]).toMatchObject({ id: BOOTS });
    expect(inv.slots[10]).toMatchObject({ id: BAND_REGEN });
  });
});

// ============ ① 右键链路由序结构锁（变异即红） ============
describe('BJ116 ① 右键链逐 context 路由序（源码结构锁,fx52 C4 同法）', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');

  it('门序：关包门 → 开包 → 换型 → 时装互换 → 取件臂 → 装备 → 取件臂（★BJ157 拆半摘）', () => {
    const gate = src.indexOf("if (!this.invPanel || this.invPanel.style.display !== 'block') return;");
    const order = [
      'this.tryOpenContainer(cur, i);',
      'tryItemSwapVid(ITEM_DEFS[cur.id]?.vid ?? -1)',   // ★方案 A 重锚(BJ265):vid 直读
      'this.swapVanityEquip(i);',
      "if (this.pickupEquipIntoMouse(where, i)) this.refreshStackSplitCooldown();",
      'this.swapEquipItem(cur, where, i);',
      'this.runPickupArm(where, i, cur);',
    ].map((t) => src.indexOf(t));
    for (const p of order) expect(p, '右键动作原语全部存在').toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(0);
    for (const p of order) expect(p, '动作原语都在关包门之后').toBeGreaterThan(gate);
    for (let k = 1; k < order.length; k++) {
      expect(order[k], `路由序臂 ${k} 次序`).toBeGreaterThan(order[k - 1]);
    }
  });

  it('取件臂挂 context 表（8/10/12/16-20/33 逐值在谓词内;摘任一档即红）', () => {
    const s = src.indexOf('const ctx = slotContext(where, i, true');
    const e = src.indexOf('if (!this.heldStack && cur && cur.stack === 1 && this.canSwapEquip', s);
    const body = src.slice(s, e);
    for (const frag of ['ctx === 9 || ctx === 11', 'ctx === 8', 'ctx === 10', 'ctx === 12',
      'ctx >= 16 && ctx <= 20', 'ctx === 33', 'heldStacks']) {
      expect(body, `路由谓词含 ${frag}`).toContain(frag);
    }
  });
});

// ============ ③ showReforgeTooltip 词缀档位移（Item.Prefix :588-614） ============
describe('BJ116 ③ 重铸槽 tooltip 词缀档位移（:588-614 烘入 rare,tooltip :20511 直读）', () => {
  it('无词缀 = 基表档（75 坠落星 rare=1 → rgb(150,150,255)）', () => {
    const { ui } = mkUi();
    ui.reforgeItem = { id: FALLING_STAR, stack: 1 };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(150,150,255)');
  });

  it('Legendary(81, mul 1.760≥1.2) +2 档 → rare 3 rgb(255,200,150)', () => {
    const { ui } = mkUi();
    ui.reforgeItem = { id: FALLING_STAR, stack: 1, prefix: PREFIX_LEGENDARY };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(255,200,150)');
  });

  it('Quick(42, mul 1.100≥1.05) +1 档 → rare 2 rgb(150,255,150)', () => {
    const { ui } = mkUi();
    ui.reforgeItem = { id: FALLING_STAR, stack: 1, prefix: PREFIX_QUICK };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(150,255,150)');
  });

  it('Awful(22, mul 0.689≤0.8) −2 档钳 −1 → rgb(130,130,130)', () => {
    const { ui } = mkUi();
    ui.reforgeItem = { id: FALLING_STAR, stack: 1, prefix: PREFIX_AWFUL };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(130,130,130)');
  });

  it('Small(9, mul 0.900≤0.95) −1 档 → rare 0 White', () => {
    const { ui } = mkUi();
    ui.reforgeItem = { id: FALLING_STAR, stack: 1, prefix: PREFIX_SMALL };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(255,255,255)');
  });

  it('expert 件带词缀仍 −12 覆写末位（:20512-20515 在位移之后）', () => {
    const { ui } = mkUi();
    ui.game.lighting = { clock: { discoColor: () => [1, 0.5, 0] } };
    ui.reforgeItem = { id: idOfVid(3090), stack: 1, prefix: PREFIX_LEGENDARY };
    ui.showReforgeTooltip();
    expect(ui.tooltip.innerHTML).toContain('color:rgb(255,127,0)');
  });
});

// HasItemSwap 提示/交互面（R4 伴随项 2026-09-03；2611↔5526 + 6190↔6195 先例同缺）。
// 原版权威（1457）：
//   ItemID.cs:1219 HasItemSwap 集 28 件（2611 Flairon/5526 FlaironFlail/6190
//   OldStyleParkourBook/6195 OldStyleParkourBookInactive/5325/4131 贝壳电话族/
//   5059/5060/5324/5329/5330/4346/5391/5323/5455/4767/5453/5309/5454/5358/5360/
//   5361/5359/5437/6168/6169/6193/6194）。
//   悬停呈现＝两路：①mouse:Item.ToolTip ← l10n ItemTooltip.{Name} 带
//   {InputTrigger_ToggleOrOpen}（Lang.cs:160 → PC=Controls.MouseRight 键名、
//   手柄=Grapple），走 tooltip 渲染段 Main.cs:20783-20798 → 仓内 UI.showTooltipFor
//   staticTip 支（ItemTooltip.{ITEM_NAME_BY_ID[vid]} → Lang.text 全局替换表）；
//   ②gamepad:ItemSlot.cs:4009-4015 GetGamepadInstructions 悬停指令行
//   "UI.ActionChangeType"（更改类型）挂 Grapple——本作无手柄（Game.ts:10163）→
//   无渲染面，数据面键保留（登记）。原版无 cursorItemIconID/IconText/icon 分支
//   （全库 grep 仅 ItemSlot.cs:1646/:4009 两消费点）。
//   交互面＝ItemSlot.RightClick :1646-1653：canItemSwapAt 语境{0/3/4/8/10/32}+
//   stack==1+光标空或【不可叠】（:1636 外门 IsAir||!CanStack——★BJ208 2026-09-20
//   收口,旧"光标空"自创门清偿）→ TryItemSwap(:1879-1990 对表)原地 ChangeItemType +
//   AfterItemSwap(:1992-2008) 音 22 Unlock/7 Grab+stackSplit=30；持有侧快换表
//   Player.cs:31764-31877 已实装（tests/flairon-swap.test.ts）。
// 仓内：CursorItemIcon.tryItemSwapVid（对表+音档）+ UI 右键语境支
//   ('inv'/'chest'；★红蓝-E 债升级 2026-09-18：装备位 8/10 已接线——UI.makeSlotEl
//   右键监听器槽语境 ctx 经 CAN_ITEM_SWAP_AT{0,3,4,8,10,32}（ItemSlot.cs:423-428
//   canItemSwapAt 置位表）受理装备格,见下方 ④ 装备位 describe）。
// 运行：cd game && npx vitest run tests/has-item-swap.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { tryItemSwapVid } from '../src/render/CursorItemIcon';
import { invIndexOfVanilla } from '../src/data/vanillaRecipes';
import { ITEM_DEFS } from '../src/data/items';
import { assembleTooltipLines } from '../src/ui/itemTooltip';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';

/** HasItemSwap 集金标（ItemID.cs:1219 CreateBoolSet 逐件转录，1458 同值未变） */
const VANILLA_HAS_ITEM_SWAP = [
  5325, 4131, 5060, 5059, 5324, 5329, 5330, 4346, 5391, 5323, 5455, 4767,
  5453, 5309, 5454, 6190, 6195, 5358, 5360, 5361, 5359, 5437, 6168, 6169,
  6193, 6194, 2611, 5526,
] as const;

const loadPack = (loc: 'zh-Hans' | 'en-US'): void => {
  languageManager.resetForTest();
  languageManager.loadPackJson(
    JSON.parse(readFileSync(new URL(`../public/l10n/${loc}.json`, import.meta.url), 'utf8')),
  );
};

// ============================================================
// ① 换型对表 + 音档（TryItemSwap :1879-1990 / AfterItemSwap :1992-2008）
// ============================================================
describe('HasItemSwap 对表（ItemSlot.cs:1879-1990;集 = ItemID.cs:1219）', () => {
  it('28 件全受理;沿表迭代止于环内（5324 系定向三环,5437 单向汇入 5358 环）', () => {
    for (const vid of VANILLA_HAS_ITEM_SWAP) {
      const sw = tryItemSwapVid(vid);
      expect(sw, `集内件 ${vid} 必须受理`).not.toBeNull();
      expect(VANILLA_HAS_ITEM_SWAP).toContain(sw!.target);
      const seen = new Set<number>([vid]);
      let cur = sw!.target;
      while (!seen.has(cur) && seen.size < 8) {
        seen.add(cur);
        cur = tryItemSwapVid(cur)!.target;
      }
      expect(seen.has(cur), `${vid} 迭代应止于环`).toBe(true);
    }
  });

  it('焦点对：2611 猪龙鱼链球↔5526 / 6190↔6195 旧世界跑酷指南±', () => {
    expect(tryItemSwapVid(2611)).toEqual({ target: 5526, sound: 'unlock' });
    expect(tryItemSwapVid(5526)).toEqual({ target: 2611, sound: 'unlock' });
    expect(tryItemSwapVid(6190)).toEqual({ target: 6195, sound: 'pickup' });
    expect(tryItemSwapVid(6195)).toEqual({ target: 6190, sound: 'pickup' });
  });

  it('三环一汇：5324→5329→5330→5324 / 5358→5360→5361→5359→5358 / '
    + '5437→5358 / 6168→6169→6193→6194→6168', () => {
    expect([5324, 5329, 5330].map((v) => tryItemSwapVid(v)!.target)).toEqual([5329, 5330, 5324]);
    expect([5358, 5360, 5361, 5359].map((v) => tryItemSwapVid(v)!.target)).toEqual([5360, 5361, 5359, 5358]);
    expect(tryItemSwapVid(5437)!.target).toBe(5358);
    expect([6168, 6169, 6193, 6194].map((v) => tryItemSwapVid(v)!.target)).toEqual([6169, 6193, 6194, 6168]);
  });

  it('音档（AfterItemSwap :1993-2007）：换入 2611/5526/6168 族=22 unlock、'
    + '6190/6195/5325 对侧等=7 pickup', () => {
    for (const v of [2611, 5526, 6168, 6169, 6193, 6194, 5358, 5360, 5361, 5359,
      5324, 5329, 5330, 4346, 5391]) {
      expect(tryItemSwapVid(v)!.sound, `${v}→unlock`).toBe('unlock');
    }
    for (const v of [6190, 6195, 5325, 4131, 5059, 5060, 5323, 5455, 4767, 5453, 5309, 5454]) {
      expect(tryItemSwapVid(v)!.sound, `${v}→pickup`).toBe('pickup');
    }
  });

  it('非集内件不受理（859 沙滩球/4132/6196/5061 抽查）', () => {
    for (const v of [859, 4132, 6196, 5061]) expect(tryItemSwapVid(v)).toBeNull();
  });

  it('仓内注册面：焦点四件已注册；已注册成员的 target 同样可解析（UI 支落格门）', () => {
    for (const v of [2611, 5526, 6190, 6195]) {
      expect(invIndexOfVanilla(v), `${v} 应已注册`).toBeGreaterThan(0);
    }
    for (const vid of VANILLA_HAS_ITEM_SWAP) {
      if (invIndexOfVanilla(vid) < 0) continue;   // 未注册件无法悬停,落格门不涉
      expect(invIndexOfVanilla(tryItemSwapVid(vid)!.target))
        .toBeGreaterThan(0);
    }
  });
});

// ============================================================
// ② 悬停提示面（Item.ToolTip ← ItemTooltip.{Name} + {InputTrigger_ToggleOrOpen}）
// ============================================================
describe('悬停提示面：ItemTooltip.{Name} 的 ToggleOrOpen 替换（Lang.cs:160）', () => {
  beforeEach(() => { loadPack('zh-Hans'); });

  it('四件 tooltip 键在真实包内且 token 替换为右键键名（zh-Hans）', () => {
    for (const vid of [2611, 5526, 6190, 6195]) {
      const key = `ItemTooltip.${ITEM_NAME_BY_ID[vid]}`;
      expect(languageManager.exists(key), `${key} 缺失`).toBe(true);
      const tip = languageManager.getTextValue(key);
      expect(tip).not.toContain('{InputTrigger');
      expect(tip).toContain('右键点击');
    }
  });

  it('分型文案键：6190 激活态「停用」/6195 未激活态「重新激活」', () => {
    expect(languageManager.getTextValue('ItemTooltip.OldStyleParkourBook')).toContain('停用');
    expect(languageManager.getTextValue('ItemTooltip.OldStyleParkourBookInactive')).toContain('重新激活');
  });

  it('手柄指令行数据面键 UI.ActionChangeType 在包内（更改类型;渲染面无手柄=登记 N/A）', () => {
    expect(languageManager.getTextValue('UI.ActionChangeType')).toBe('更改类型');
  });

  it('en-US 包同面（Right Click 替换）', () => {
    loadPack('en-US');
    const tip = languageManager.getTextValue('ItemTooltip.Flairon');
    expect(tip).toContain('Right Click');
    expect(tip).not.toContain('{InputTrigger');
    expect(languageManager.getTextValue('UI.ActionChangeType')).toBe('Change Type');
  });
});

// ============================================================
// ③ tooltip 装配链（Main.cs:20783-20798 item.ToolTip 渲染段 → staticTip 行族）
// ============================================================
describe('tooltip 装配：提示行随 staticTip 支入行族（tag static）', () => {
  beforeEach(() => { loadPack('zh-Hans'); });

  it('持 2611 悬停：装配结果含「右键点击切换模式」两行 static', () => {
    const iid = invIndexOfVanilla(2611);
    const def = ITEM_DEFS[iid];
    const staticTip = languageManager.getTextValue(`ItemTooltip.${ITEM_NAME_BY_ID[2611]}`);
    const lines = assembleTooltipLines(def, { id: iid, stack: 1 }, null, staticTip);
    const statics = lines.filter((ln) => ln.tag === 'static').map((ln) => ln.text);
    expect(statics).toEqual(['喷出自动制导的泡泡', '右键点击切换模式']);
  });

  it('持 6195 悬停：未激活分型文案入行族', () => {
    const iid = invIndexOfVanilla(6195);
    const staticTip = languageManager.getTextValue(`ItemTooltip.${ITEM_NAME_BY_ID[6195]}`);
    const lines = assembleTooltipLines(ITEM_DEFS[iid], { id: iid, stack: 1 }, null, staticTip);
    const joined = lines.filter((ln) => ln.tag === 'static').map((ln) => ln.text).join('\n');
    expect(joined).toContain('重新激活');
  });
});

// ============================================================
// ④ 装备位 8/10 接线（★红蓝-E 债升级 2026-09-18）
// ============================================================
// 原版：ItemSlot.RightClick(:1646-1653) 的 HasItemSwap 门在 switch 之先,门谓词
// canItemSwapAt[context] 于 :423-428 置位 {0,4,32,3,10,8}——装备位 8（盔甲）/10
// （配饰）受理原地换型（TryItemSwap→ChangeItemType :47841 直改 type,不回查
// armorAccepts/成就）。可达性：5358-5361 Shellphone acc=1→armor[3-9]（ctx 10）;
// 5059/5060 摩羯座时装腿 ls 225/226 拖入功能腿槽合法（CanEquipInArmorSlot :1399
// 只查 legSlot≥0+同款唯一,不查 vanity 旗）→ctx 8;时装槽 9/11 不受理（case 9/11
// =SwapVanityEquip）。双态物（ls/acc/createTile——Rubblemaker 5324-5330 为
// DefaultToPlaceableTile(647) 态,仅背包/容器面）变体族槽型自洽,换型免重验。
// 测试法：UI 原型桩（BJ116 同法）+ document.createElement 桩捕获 makeSlotEl 真实
//   mousedown 监听器——整条右键路由（真实现）驱动,变异即红：
//   M-a 摘 CAN_ITEM_SWAP_AT.has(ctx) 门 → ①②⑥红+结构锁红;
//   M-b 集撤 8/10（回 inv/chest 旧域）→ ①②红+集内容锁红。
// ★BJ208（2026-09-20）⑤ 外门收口组（⑧-⑪）：:1636 外门=光标空或不可叠（id+prefix
//   异=不可叠,Item.cs:49870-49877）——持异款右键换型/装备臂照常受理,两臂本体不触
//   mouseItem（TryItemSwap :1879 原地/SwapEquip :3287-3368 只动槽与装备页）。变异：
//   M-c 换型门回退 `!this.heldStack` 空门 → ⑧⑪红;
//   M-d 装备门回退 `!this.heldStack` 空门 → ⑨红。
import { UI } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { slotContext } from '../src/ui/SlotActions';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type AnyUI = Record<string, any>;

const idOfVid2 = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} 应有本仓键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};
const SHELLPHONE = idOfVid2(5358);          // vi_5358_shellphone acc=1
const SHELLPHONE_OCEAN = idOfVid2(5360);    // 环 5358→5360 下一位
const CAPRI_LEGS = idOfVid2(5059);          // 摩羯座护腿 ls=225 van=1
const CAPRI_TAIL = idOfVid2(5060);          // 摩羯座尾 ls=226
const BOOTS = idOfVid2(54);                 // Hermes Boots（非集内件阴性）

/** UI 原型桩 + document.createElement 桩（捕获 makeSlotEl 挂的真 mousedown 监听器） */
function mkSwapUi() {
  type Listener = (e: unknown) => void;
  const listeners: Array<[string, Listener]> = [];
  const mkEl = () => ({
    className: '', textContent: '',
    style: { cssText: '', display: '' },
    dataset: {} as Record<string, string>,
    children: [] as unknown[],
    appendChild(c: unknown) { this.children.push(c); },
    addEventListener(t: string, fn: Listener) { listeners.push([t, fn]); },
    removeEventListener() {},
  });
  vi.stubGlobal('document', { createElement: () => mkEl() });
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  const sfx: string[] = [];
  ui.game = {
    player: { inv: new Inventory() },
    sfx: { play: (name: string) => { sfx.push(name); } },
    achNotifyEquipChanged: () => {},
    npcShopOpen: false,
  };
  ui.heldStack = null;
  ui.heldFrom = null;
  ui.openChest = null;
  ui.refreshAll = () => {};
  ui.invPanel = { style: { display: 'block' } };   // 开包态（关包门放行）
  return { ui, sfx, listeners };
}

/** 经真 makeSlotEl+真监听器发右键（DOM mousedown = mouseRightRelease 边沿） */
function rightClick(ui: AnyUI, listeners: Array<[string, (e: unknown) => void]>, where: string, i: number): void {
  (ui as AnyUI).makeSlotEl(i, where);
  const mdown = listeners.find(([t]) => t === 'mousedown');
  expect(mdown, 'mousedown 监听器已挂').toBeTruthy();
  mdown![1]({ button: 2, stopPropagation() {}, preventDefault() {} });
}

describe('④ 装备位 8/10 HasItemSwap 接线（RightClick :1646 门先于 switch;canItemSwapAt :423-428）', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('槽语境映射：armor 0-2=8 / 3-9=10（受理域）;10-12=9 / 13+=11（时装,不受理）', () => {
    expect(slotContext('armor', 0, true)).toBe(8);
    expect(slotContext('armor', 2, true)).toBe(8);
    expect(slotContext('armor', 3, true)).toBe(10);
    expect(slotContext('armor', 9, true)).toBe(10);
    expect(slotContext('armor', 10, true)).toBe(9);
    expect(slotContext('armor', 13, true)).toBe(11);
  });

  it('① 配饰位（ctx 10）Shellphone 右键=原地换型 5358→5360+音 22,不取下', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: SHELLPHONE, stack: 1 };
    rightClick(ui, listeners, 'armor', 3);
    expect(inv.armor[3]!.id).toBe(SHELLPHONE_OCEAN);
    expect(inv.armor[3]!.stack).toBe(1);              // 原地,stack 不动
    expect(ui.heldStack).toBeNull();                  // 不落光标（旧面=取下到光标）
    expect(sfx).toEqual(['unlock']);                  // AfterItemSwap(:1992) 5360∈音 22 族
  });

  it('② 功能腿槽（ctx 8）摩羯座护腿右键=原地换型 5059↔5060+音 7', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[2] = { id: CAPRI_LEGS, stack: 1 };
    rightClick(ui, listeners, 'armor', 2);
    expect(inv.armor[2]!.id).toBe(CAPRI_TAIL);
    expect(ui.heldStack).toBeNull();
    expect(sfx).toEqual(['pickup']);                  // 5060 换入∉音 22 表 → Sound 7
  });

  it('③ 阴性：非集内装备位右键仍=取 1 到光标（BJ116 取件面零变化）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: BOOTS, stack: 1 };
    rightClick(ui, listeners, 'armor', 3);
    expect(inv.armor[3]).toBeNull();
    expect(ui.heldStack).toMatchObject({ id: BOOTS, stack: 1 });
    expect(sfx).toEqual(['menuTick']);                // PickupItemIntoMouse Sound 12
  });

  it('④ 阴性：时装腿槽（ctx 9）右键=SwapVanityEquip 镜像互换,不换型（canItemSwapAt[9]=false）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[12] = { id: CAPRI_LEGS, stack: 1 };
    rightClick(ui, listeners, 'armor', 12);
    expect(inv.armor[2]!.id).toBe(CAPRI_LEGS);        // 镜像到功能腿槽,id 不变
    expect(inv.armor[12]).toBeNull();
    expect(sfx).toEqual(['pickup']);                  // SwapVanityEquip(:1857) Sound 7
  });

  it('⑤ stack==1 门：装备位多叠 Shellphone 不换型,落取件臂（:1646 stack==1 前置）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: SHELLPHONE, stack: 3 };
    rightClick(ui, listeners, 'armor', 3);
    expect(inv.armor[3]!.id).toBe(SHELLPHONE);        // 不换型
    expect(inv.armor[3]!.stack).toBe(2);              // 取 1
    expect(ui.heldStack).toMatchObject({ id: SHELLPHONE, stack: 1 });
    expect(sfx).toEqual(['menuTick']);
  });

  it('⑥ 背包语境（ctx 0）回归：Shellphone 背包右键仍原地换型（旧面零回退）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: SHELLPHONE, stack: 1 };
    rightClick(ui, listeners, 'inv', 10);
    expect(inv.slots[10]!.id).toBe(SHELLPHONE_OCEAN);
    expect(sfx).toEqual(['unlock']);
  });

  it('⑦ 结构锁：CAN_ITEM_SWAP_AT 集={0,3,4,8,10,32};换型门在开包门后、时装互换臂前', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/ui/UI.ts'), 'utf8');
    const m = src.match(/const CAN_ITEM_SWAP_AT = new Set\(\[([0-9, ]+)\]\)/);
    expect(m, 'CAN_ITEM_SWAP_AT 声明存在').toBeTruthy();
    const set = m![1].split(',').map((x) => parseInt(x.trim(), 10)).sort((a, b) => a - b);
    expect(set).toEqual([0, 3, 4, 8, 10, 32]);        // ItemSlot.cs:423-428 置位表逐值
    const gateUse = src.indexOf('CAN_ITEM_SWAP_AT.has(ctx)');
    expect(gateUse).toBeGreaterThan(0);
    expect(gateUse, '换型门在开包动作之后（:1636→:1646 同序）')
      .toBeGreaterThan(src.indexOf('this.tryOpenContainer(cur, i);'));
    expect(gateUse, '换型门在时装互换臂之前（:1646→:1654 switch 同序）')
      .toBeLessThan(src.indexOf('this.swapVanityEquip(i);'));
    const gate = src.slice(gateUse - 80, gateUse + 80);
    expect(gate, '门谓词含 stack==1+光标空（heldStack null 门）').toContain('cur.stack === 1');
    expect(gate).toContain('!this.heldStack');
  });
});

// ============================================================
// ⑤ BJ208 外门收口（ItemSlot.RightClick :1636 `mouseItem.IsAir || !Item.CanStack`
//   全谓词）——持异款/异词缀物右键时换型/装备臂照常受理（TryItemSwap :1879 原地
//   ChangeItemType / SwapEquip :3287-3368 两臂本体均不触 mouseItem,光标持物原样
//   保留=原版行为）;可叠同款（同 id 同词缀）照旧跳过两臂直落取件臂。
// ============================================================
describe('⑤ BJ208 外门收口：光标持不可叠物仍进换型/装备臂（:1636/:49870）', () => {
  const TORCH = idOfVid2(8);                // 火把（非集内、非装备——纯异款持物）
  const DIVING_HELM = idOfVid2(268);        // 潜水头盔（功能盔甲,可 SwapEquip）

  afterEach(() => { vi.unstubAllGlobals(); });

  it('⑧ 持异款火把+配饰位 Shellphone 右键=仍原地换型,光标原样（:1650 不触 mouseItem）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: SHELLPHONE, stack: 1 };
    ui.heldStack = { id: TORCH, stack: 5 };            // 光标持异款（不可叠）物
    rightClick(ui, listeners, 'armor', 3);
    expect(inv.armor[3]!.id).toBe(SHELLPHONE_OCEAN);   // 换型照常
    expect(ui.heldStack).toMatchObject({ id: TORCH, stack: 5 });   // 光标持物不动
    expect(sfx).toEqual(['unlock']);                   // AfterItemSwap 5360∈音 22 族
  });

  it('⑨ 持异款火把+背包格盔甲右键=照常一键装备,光标原样（:1671 不触 mouseItem）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: DIVING_HELM, stack: 1 };
    ui.heldStack = { id: TORCH, stack: 3 };
    rightClick(ui, listeners, 'inv', 10);
    expect(inv.armor[0]?.id).toBe(DIVING_HELM);        // 装备上身
    expect(inv.slots[10]).toBeNull();                  // 旧装备位空 → 槽清空
    expect(ui.heldStack).toMatchObject({ id: TORCH, stack: 3 });   // 光标持物不动
    expect(sfx).toEqual(['menuTick']);                 // swapEquipItem 装备声
  });

  it('⑩ 可叠同款（同 id 同词缀）照旧跳过两臂直落取件臂（:1636 CanStack=true）', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.slots[10] = { id: DIVING_HELM, stack: 1 };
    ui.heldStack = { id: DIVING_HELM, stack: 1 };      // 同款同词缀=可叠
    ui.stackSplit = 0;                                 // 取件臂电平面桩（:1678/runPickupArm）
    ui.superFastStack = 0;
    rightClick(ui, listeners, 'inv', 10);
    expect(inv.armor[0]).toBeNull();                   // 未触发 SwapEquip（可叠同款不进臂）
    expect(ui.heldStack).toMatchObject({ id: DIVING_HELM, stack: 2 });  // 取件臂取 1
    expect(inv.slots[10]).toBeNull();                  // 源格耗尽清槽
    expect(sfx).toEqual(['menuTick']);
  });

  it('⑪ 异词缀=不可叠（!CanStack prefix 位 Item.cs:49874）→ 换型臂照常受理', () => {
    const { ui, sfx, listeners } = mkSwapUi();
    const inv = ui.game.player.inv as Inventory;
    inv.armor[3] = { id: SHELLPHONE, stack: 1 };
    ui.heldStack = { id: SHELLPHONE, stack: 1, prefix: 1 };  // 同 id 异词缀 → !CanStack
    rightClick(ui, listeners, 'armor', 3);
    expect(inv.armor[3]!.id).toBe(SHELLPHONE_OCEAN);
    expect(ui.heldStack).toMatchObject({ id: SHELLPHONE, prefix: 1 });
    expect(sfx).toEqual(['unlock']);
  });
});

// ★清偿刀 H（2026-09-29）两件持有/槽位域判别测试。
// 定谳锚（1457 反编译亲读）：
//  ①holdStyle=7 持件姿态（5451 无人机遥控器,Item.cs:42967-42980）——
//    · SetDefaults：useStyle 1/useAnimation 32/useTime 32/holdStyle 7/noUseGraphic
//      true/shoot 1020/shootSpeed 9/rare 3/buyPrice(0,10)（:42967-42980）。
//      1457 全树 holdStyle=7 赋值恰两处：5451（:42971）+5738（:44994,shoot 1105,
//      同 noUseGraphic）——两件皆 noUseGraphic ⇒ 持件可见效应=身体帧行 11 全域。
//    · 身体行：Player.cs:36754-36756 `else if (flag5 && holdStyle == 7)
//      bodyFrame.Y = bodyFrame.Height * 11`（flag5=CanVisuallyHoldItem :36427;
//      hs7 在 CanVisuallyHoldItem :50801-50826 无隐藏支=恒真）。
//    · 持件绘制：ItemCheck_ApplyHoldStyle :50881-51187 分支表=1/2/3/4/5/6/8,
//      【无 7 支】——itemLocation/itemRotation 不调;两件 noUseGraphic ⇒ 静持不画
//      （PlayerDrawLayers.cs:3857 门槛 holdStyle!=0 照进层,但贴图被 noUseGraphic 压）。
//    · 重力翻转：FlipItemLocationAndRotationForGravity 调用位=holdStyle 1/2/4/5/6/8
//      （:51070/:51091/:51110/:51154/:51170/:51184/:51196）——7 无翻转支。
//    · 坐骑锚：ApplyItemPositionOffsetFromMount :52029 `flag2 = !flag &&
//      heldItem.holdStyle > 0`——hs7 静持照进坐骑物品锚（仓内 mountHeldAnchor 已建）。
//    本仓现状（普查定谳=【已建模】,本测试钉值防回退）：数据 vanilla-itemfunc.json
//    /5451{holdStyle:7,noUseGraphic:1}；身体行 Renderer.ts `holdStyleRaw === 7 →
//    body = 11`；静持不画 `staticHoldStyle = hs === 7 ? 0 : hs`；翻转集
//    heldItemGrav.holdStyleFlipsForGravity 不含 7。
//  ②itemFade 持物变暗（GetDimSlotForMouseItem,ItemSlot.cs:1336-1397）——
//    · Draw 头 :2334-2336 `itemFade=1; GetDimSlotForMouseItem(context, slot,
//      Main.mouseItem, out itemFade); color2 *= itemFade`——拖拽物进不了槽=0.5。
//    · switch 域：8/9/10/11（:1348 解锁臂+CanEquipInArmorSlot）/12（:1357 解锁臂+
//      dye>0）/25,27,33（:1359 dye>0 无解锁臂）/16（:1361 钩爪）/17,39（:1363 坐骑
//      非矿车）/18（:1365 矿车）/19（:1367 时装宠非光源）/20（:1369 光源）/24（:1371
//      娃娃配饰）/38（:1373 娃娃武器）——背包 0/钱币 1/弹药 2/箱 3/4/32/垃圾桶 6/
//      向导 7/快捷栏 13/商店 15 ∉ switch 永不变暗。
//    · 消费点全谱：槽底 color2（:2336→:2339）/空槽幽灵 0.35×fade（:2481）/图标
//      color×fade（:2499→:2880）/共享角标 0.7×num17（:2733,num17=×0.6 前快照 :2465）/
//      共享幽灵 fade×0.6（:2467）/CD 覆盖 context 10|18 expertOnly white×fade（:2724）；
//      堆叠数字/槽号用基色（:2680/:2698）不乘 fade。
//  测试法：纯函数全支矩阵 + slotItemFadeFor 装配（真 Player/Inventory）+
//  paintSlotChrome CSS 变量接线 + tickSlotCooldownOverlays CD α 接线（假 DOM 槽,
//  测试内点亮 expertOnly,knife-c 同法）;①面=数据钉值+Renderer 源锚（BJ378 自包含
//  锚法;变异证红 M1/M2 见各 it 注）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI, getDimSlotForMouseItem, slotCooldownAlpha } from '../src/ui/UI';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { armorSlotIndexOfInternal, statOfInternal } from '../src/data/vanillaItemStats';
import { equipKindOfVid } from '../src/data/vanillaEquip';
import { holdStyleFlipsForGravity } from '../src/render/heldItemGrav';

type AnyUI = Record<string, any>;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf8');

const idOfVid = (vid: number): number => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `vid ${vid} ↔ 本仓 def 键`).toBeTruthy();
  return ITEM_BY_KEY[key!];
};

const mkUi = (): { ui: AnyUI; p: Player } => {
  const ui = Object.create(UI.prototype) as unknown as AnyUI;
  const p = new Player(60 * 16, 90 * 16, new Inventory());
  ui.game = { player: p, sfx: { play: () => {} } };
  return { ui, p };
};
// 动态取样（不硬编码 vid 档位）：部位 0 头盔/功能配饰/染料/宠物
const helmetId = ITEM_DEFS.findIndex((d, i) => !!d && armorSlotIndexOfInternal(i) === 0);
const accId = ITEM_DEFS.findIndex((d, i) => !!d && statOfInternal(i)?.acc === 1 && statOfInternal(i)?.wing == null);
const dyeId = ITEM_DEFS.findIndex((d) => !!d && equipKindOfVid(d.vid ?? -1) === 'dye');
const petId = ITEM_DEFS.findIndex((d) => !!d && equipKindOfVid(d.vid ?? -1) === 'pet');

// ===================== ① holdStyle=7 持件姿态 =====================
describe('①holdStyle 7 数据面（Item.cs:42971/:44994 ↔ vanilla-itemfunc.json）', () => {
  it('5451 无人机遥控器：holdStyle 7 + noUseGraphic + shoot 1020（:42967-42980）', () => {
    const f = itemFuncOfVid(5451);
    expect(f?.holdStyle).toBe(7);
    expect(f?.noUseGraphic).toBe(1);
    expect(f?.shoot).toBe(1020);
    expect(f?.useStyle).toBe(1);
  });

  it('1457 全树 holdStyle=7 恰两 vid：{5451,5738}（Item.cs:42971/:44994 穷举）', () => {
    const hs7 = ITEM_DEFS
      .filter((d) => (d?.vid ?? -1) > 0 && itemFuncOfVid(d.vid!)?.holdStyle === 7)
      .map((d) => d.vid!)
      .sort((a, b) => a - b);
    expect(hs7).toEqual([5451, 5738]);
    // 5738 同支（:44985-44994）：useStyle 5/shoot 1105/noUseGraphic
    expect(itemFuncOfVid(5738)?.noUseGraphic).toBe(1);
    expect(itemFuncOfVid(5738)?.shoot).toBe(1105);
  });

  it('身体行 11（Player.cs:36754-36756）——Renderer.ts 行选择锚（变异 M2 证红）', () => {
    // 旧实现退化值=落默认行走链（body=11 缺失→静持 5451 人物变走姿）
    expect(SRC('render/Renderer.ts')).toMatch(/holdStyleRaw === 7\) body = 11/);
  });

  it('静持不画（ApplyHoldStyle :50881-51187 无 7 支+两件 noUseGraphic）——锚（变异 M3 证红）', () => {
    // 旧实现退化值=hs7 进静持绘制载荷（物品凭空画在手边）
    expect(SRC('render/Renderer.ts')).toContain('staticHoldStyle = hs === 7 ? 0 : hs');
  });

  it('CanVisuallyHoldItem：hs7 无隐藏支（:50801-50826 仅 4/5/6/8 有门）——抚摸中 5451 姿态仍在', () => {
    expect(SRC('render/Renderer.ts')).toContain('hs === 4 || hs === 5 || hs === 6');
  });

  it('重力翻转集不含 7（:51070-:51196 调用位表;sw-fx31 同源再钉）', () => {
    expect(holdStyleFlipsForGravity(7)).toBe(false);
    for (const hs of [1, 2, 4, 5, 6, 8]) expect(holdStyleFlipsForGravity(hs)).toBe(true);
  });
});

// ===================== ② GetDimSlotForMouseItem 纯函数 =====================
describe('②getDimSlotForMouseItem 全支矩阵（ItemSlot.cs:1336-1397）', () => {
  const inp = (context: number, slotUnlocked: boolean, mouseFitsSlot: boolean) =>
    getDimSlotForMouseItem({ context, slotUnlocked, mouseFitsSlot });

  it('装备族 8/9/10/11：解锁臂+入槽面双判（:1348）——变异 M1 证红（0.5 档值）', () => {
    for (const ctx of [8, 9, 10, 11]) {
      expect(inp(ctx, true, true)).toBe(1);     // 可装→不暗
      expect(inp(ctx, true, false)).toBe(0.5);  // 不可装→暗
      expect(inp(ctx, false, true)).toBe(0.5);  // 锁槽（恶魔心/大师格未解锁）→暗
      expect(inp(ctx, false, false)).toBe(0.5);
    }
  });

  it('染料 12：同带解锁臂（:1357）', () => {
    expect(inp(12, true, true)).toBe(1);
    expect(inp(12, true, false)).toBe(0.5);
    expect(inp(12, false, true)).toBe(0.5);
  });

  it('杂项 16-20 与 miscDye 33：无解锁臂,只看入槽面（:1359/:1361-:1369）', () => {
    for (const ctx of [16, 17, 18, 19, 20, 33]) {
      expect(inp(ctx, true, true)).toBe(1);
      expect(inp(ctx, true, false)).toBe(0.5);
      expect(inp(ctx, false, true)).toBe(1);   // 杂项槽恒解锁——解锁臂不存在
    }
  });

  it('∉ switch 语境恒 1：背包 0/钱币 1/弹药 2/箱 3/4/32/垃圾桶 6/向导 7/快捷栏 13/商店 15', () => {
    for (const ctx of [0, 1, 2, 3, 4, 32, 6, 7, 13, 15]) {
      expect(inp(ctx, true, false)).toBe(1);
      expect(inp(ctx, false, false)).toBe(1);
    }
  });

  it('展示娃娃 23/24/25/38 与帽架 26/27/矿车 39：本仓无槽面=边界声明（不装配不暗）', () => {
    for (const ctx of [23, 24, 25, 26, 27, 38, 39]) expect(inp(ctx, true, false)).toBe(1);
  });

  it('CD 覆盖 α 乘区（:2724 White×itemFade）——slotCooldownAlpha 透传', () => {
    const base = {
      context: 10, vid: 4745, potion: false, healMana: 0, expertOnly: true,
      potionDelayTicks: 0, potionDelayTimeTicks: 3600, manaPotionDelayTicks: 0,
      expertMode: false, itemFade: 0.5,
    };
    expect(slotCooldownAlpha(base)).toBe(0.5);
    expect(slotCooldownAlpha({ ...base, itemFade: 1 })).toBe(1);
    expect(slotCooldownAlpha({ ...base, context: 18 })).toBe(0.5);
    expect(slotCooldownAlpha({ ...base, context: 13, potion: true })).toBe(0);   // 换支不乘 fade
  });
});

// ===================== ② slotItemFadeFor 装配（真 Inventory 谓词域） =====================
describe('②slotItemFadeFor 装配（:1336 装配侧=放置域同源谓词）', () => {
  const cartId = idOfVid(4745);   // Mechanical Cart（MountID.Sets.Cart 档）

  it('头盔拖过配饰槽（armor:3）暗、拖回头盔槽（armor:0/时装 10）不暗——CanEquipInArmorSlot 面', () => {
    expect(helmetId).toBeGreaterThan(0);
    const { ui } = mkUi();
    ui.heldStack = { id: helmetId, stack: 1 };
    expect(ui.slotItemFadeFor('armor', 3)).toBe(0.5);
    expect(ui.slotItemFadeFor('armor', 0)).toBe(1);
    // armor:10=时装头盔槽（part 0 镜像）：armorAccepts 部位同判 ✓,功能↔时装
    // 同款互斥=armor[0] 空 → 可入 → 不暗
    expect(ui.slotItemFadeFor('armor', 10)).toBe(1);
  });

  it('锁槽臂（:1348）：armor:8 无恶魔心——配饰可入也暗（解锁臂先于入槽面）', () => {
    const { ui, p } = mkUi();
    expect(p.inv.isItemSlotUnlockedAndUsable(8)).toBe(false);   // extraAccessory=false
    ui.heldStack = { id: accId, stack: 1 };
    expect(ui.slotItemFadeFor('armor', 8)).toBe(0.5);
    expect(ui.slotItemFadeFor('armor', 3)).toBe(1);      // 功能配饰段照常
  });

  it('misc 逐槽语境（MISC_SLOT_CONTEXTS 19/20/18/17/16）——矿车槽分类面', () => {
    expect(petId).toBeGreaterThan(0);
    const { ui } = mkUi();
    ui.heldStack = { id: cartId, stack: 1 };
    expect(ui.slotItemFadeFor('misc', 2)).toBe(1);       // 矿车进矿车槽
    expect(ui.slotItemFadeFor('misc', 0)).toBe(0.5);     // 矿车进宠物槽（ctx19）
    ui.heldStack = { id: petId, stack: 1 };
    expect(ui.slotItemFadeFor('misc', 0)).toBe(1);       // 宠物进宠物槽
    expect(ui.slotItemFadeFor('misc', 2)).toBe(0.5);     // 宠物进矿车槽
  });

  it('染料双面：dye 槽带解锁臂/miscDye 槽无（:1357 vs :1359）', () => {
    const { ui, p } = mkUi();
    ui.heldStack = { id: dyeId, stack: 1 };
    expect(ui.slotItemFadeFor('dye', 0)).toBe(1);
    expect(ui.slotItemFadeFor('miscDye', 0)).toBe(1);
    ui.heldStack = { id: helmetId, stack: 1 };
    expect(ui.slotItemFadeFor('dye', 0)).toBe(0.5);
    expect(ui.slotItemFadeFor('miscDye', 0)).toBe(0.5);
    // 解锁臂只在 dye：染料槽 8（恶魔心染料格）未解锁时暗——miscDye 不设该臂
    p.inv.extraAccessory = false;
    expect(ui.slotItemFadeFor('dye', 8)).toBe(0.5);
  });

  it('空光标/checkItem.IsAir（:1337-1339）与 inv/chest 语境恒 1', () => {
    const { ui } = mkUi();
    expect(ui.slotItemFadeFor('armor', 3)).toBe(1);
    ui.heldStack = { id: helmetId, stack: 1 };
    expect(ui.slotItemFadeFor('inv', 0)).toBe(1);
    expect(ui.slotItemFadeFor('chest', 0)).toBe(1);
  });

  it('vanilla inv:2 弹药/inv:1 钱币语境不装配（tick inv 循环 itemFade 恒 1 同相）', () => {
    const base = {
      context: 13, vid: 188, potion: true, healMana: 0, expertOnly: false,
      potionDelayTicks: 3600, potionDelayTimeTicks: 3600, manaPotionDelayTicks: 0,
      expertMode: false, itemFade: 1,
    };
    expect(slotCooldownAlpha({ ...base, itemFade: 0.5 })).toBe(1);   // ①支不吃 fade（:2705）
  });
});

// ===================== ② paintSlotChrome / tick 接线 =====================
describe('②接线：paintSlotChrome --sw-ifade 写值 + tickSlotCooldownOverlays CD α', () => {

  function mkStyleStub(): { style: Record<string, string>; get: (k: string) => string; set: (k: string, v: string) => void } {
    const style: Record<string, string> = {};
    return {
      style,
      get: (k: string) => (k in style ? style[k] : ''),
      set: (k: string, v: string) => { style[k] = v; },
    };
  }

  it('装备槽写 --sw-ifade（暗/明两态+同值守卫）;inv/chest 不写', () => {
    const { ui, p } = mkUi();
    p.inv.armor[3] = { id: accId, stack: 1 };
    const st = mkStyleStub();
    const slotEl = {
      style: {
        getPropertyValue: st.get,
        setProperty: st.set,
        removeProperty: () => {},
      },
      querySelector: () => null,
    };
    ui.game = { player: p, sfx: { play: () => {} } };
    ui.slotContent = (where: string, i: number) =>
      where === 'armor' ? (p.inv.armor[i] ?? null) : (p.inv.slots[i] ?? null);
    ui.slotGlowState = new Map();
    ui.heldStack = { id: helmetId, stack: 1 };   // 头盔拖过配饰槽
    ui.paintSlotChrome(slotEl, 'armor', 3);
    expect(st.style['--sw-ifade']).toBe('0.5');
    expect(st.style['--slot-bgimg']).toContain('Inventory_Back13');
    ui.heldStack = { id: accId, stack: 1 };      // 配饰可入
    ui.paintSlotChrome(slotEl, 'armor', 3);
    expect(st.style['--sw-ifade']).toBe('1');
    // inv 语境不装配（∉ switch）
    delete st.style['--sw-ifade'];
    ui.paintSlotChrome(slotEl, 'inv', 3);
    expect('--sw-ifade' in st.style).toBe(false);
  });

  it('tickSlotCooldownOverlays：expertOnly 矿车槽 CD α=White×itemFade（:2724 全链）', () => {
    const ui = Object.create(UI.prototype) as unknown as AnyUI;
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    ui.game = { player: p, sfx: { play: () => {} } };
    ui.invPanel = { style: { display: 'none' } };
    ui.slotCdEls = new Map();
    const cds = new Map<string, { style: Record<string, string>; dataset: Record<string, string> }>();
    const hosts = new Map<string, { querySelector: (s: string) => unknown }>();
    const hostFor = (where: string, i: number): void => {
      const key = `${where}:${i}`;
      const cd = { style: {} as Record<string, string>, dataset: {} as Record<string, string> };
      cds.set(key, cd);
      hosts.set(key, { querySelector: (s: string) => (s === '.sw-slot-cd' ? cd : null) });
    };
    for (let i = 0; i < 10; i++) hostFor('inv', i);
    for (let i = 0; i < 10; i++) hostFor('armor', i);
    for (let i = 0; i < 5; i++) hostFor('misc', i);
    ui.slotEl = (i: number, where: string) => hosts.get(`${where}:${i}`) ?? null;
    ui.slotContent = (where: string, i: number): { id: number; stack: number } | null =>
      where === 'inv' ? (p.inv.slots[i] ?? null)
        : where === 'armor' ? (p.inv.armor[i] ?? null)
          : where === 'misc' ? (p.inv.miscEquips[i] ?? null)
            : null;
    const cartId = idOfVid(4745);
    const petId = ITEM_DEFS.findIndex((d) => d && equipKindOfVid(d.vid ?? -1) === 'pet');
    const def = ITEM_DEFS[cartId] as unknown as Record<string, unknown>;
    def.expertOnly = true;                       // 1457 全树零真值,测试点亮（knife-c 同法）
    try {
      p.inv.miscEquips[2] = { id: cartId, stack: 1 };
      // 空光标：fade=1 → α=1
      ui.tickSlotCooldownOverlays();
      expect(cds.get('misc:2')!.dataset.cd).toBe('1.000');
      // 拖宠物（非矿车）过矿车槽：fade=0.5 → α=0.5
      ui.heldStack = { id: petId, stack: 1 };
      ui.tickSlotCooldownOverlays();
      expect(cds.get('misc:2')!.dataset.cd).toBe('0.500');
      // 拖矿车（可入）：fade=1
      ui.heldStack = { id: cartId, stack: 1 };
      ui.tickSlotCooldownOverlays();
      expect(cds.get('misc:2')!.dataset.cd).toBe('1.000');
      // 配饰槽 armor:3 放 expertOnly 件+拖头盔（不可入配饰段）：0.5
      p.inv.armor[3] = { id: cartId, stack: 1 };
      ui.heldStack = { id: helmetId, stack: 1 };
      ui.tickSlotCooldownOverlays();
      expect(cds.get('armor:3')!.dataset.cd).toBe('0.500');
      ui.heldStack = { id: dyeId, stack: 1 };
      ui.tickSlotCooldownOverlays();
      expect(cds.get('armor:3')!.dataset.cd).toBe('0.500');   // 染料也进不了配饰槽
    } finally {
      delete def.expertOnly;
    }
  });
});

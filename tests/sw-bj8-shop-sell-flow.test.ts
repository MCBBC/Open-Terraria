// SW-BJ8 2026-09-07 ——「无法向 NPC 出售」回归守卫（用户实报：商店开着时出售动作不生效）。
//
// 根因定谳（证据链）：
//   ① SW-AU2（2c8e0bcb,09-06）把 Shift/Ctrl 快移重构为 ItemSlot.GetAlternateClickAction
//      :601-700 1:1 路由表后，缺省档（Quick Trash=Left Control,ItemSlot.cs:28
//      `DisableLeftShiftTrashCan=true`）下卖出唯一修饰键 = Ctrl；此前旧 shiftClick
//      （无语境门）Shift+点任意背包/快捷栏物品即卖——用户训练手势为 Shift。
//   ② 但开店链一直缺原版 Main.OpenShop Main.cs:41162-41170 首行 :41164
//      `playerInventory = true`（1458 本域无增量）——商店开着时背包面板不自动展开：
//      可见物品只剩快捷栏 = 关包快捷栏 context 13（Main.cs:44374 只 Draw 不 Handle，
//      slotContext 'inv' i<10 && !panelOpen → 13），无任何 Alt/Shift/Ctrl ItemSlot
//      语义；Ctrl 路由门（:611 `(uint)context <= 4u`）把 13 排除在外 → 卖出计划恒
//      null → 点击静默回落普通点击（热栏格=选中）。背包格 10-49 又不在屏，且
//      npcDialogActive 态下 Esc/E 均走关对话链（Player.cs:4960-5025 ToggleInv 优先序，
//      main.ts runInventoryEscapeChain）→ 背包在店开期间无法补开 ⇒ 整条卖出死路。
//   ③ 修复 = showNpcShop 补 OpenShop :41164 等价面（this.openInventory(true)，
//      force 跳开/关翻转——卖出/购买后 openNpcShop 重刷货架会再次进入本方法）。
//
// 分层钉法（同 tests/sw-au2-slot-shift-alt.test.ts 车道）：
//   · 结构锁（源文本锚）   —— showNpcShop 内 openInventory(true) + Main.cs:41164 锚
//   · 行为面（原型直驱）   —— UI.altMoveClick × 真实 Game.prototype.npcShopSell 全链
//   · 因果锁（死路语义）   —— panelOpen=false 时热栏 Ctrl 无卖出（本刀所补之洞）
//   · 今日嫌疑面排除       —— placeStyle 位/收藏总闸/ITEM_DEFS 收缩 vid 解析不拦卖出
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI } from '../src/ui/UI';
import { Game } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { options } from '../src/core/Options';
import { slotContext } from '../src/ui/SlotActions';
import { computeSellValue } from '../src/stats/SellChain';
import { vanillaIdOfItem } from '../src/stats/Shimmer';

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (id === undefined || !ITEM_DEFS[id]) throw new Error(`测试钉死前提失效：vid ${vid} 未注册`);
  return id;
};
const TORCH = iidOf(8);      // value 50 → 每件卖 10 铜
const GEL = iidOf(23);       // value 5 → 每件卖 1 铜
const COPPER_COIN = iidOf(71);
const DIRT = iidOf(2);       // value 0 → 白送支

const srcOf = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

/** 真实 Game.prototype 壳（npcShopSell 全链真跑；DOM/音/回调桩） */
function fakeGameWithRealSell() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    player: { inv: Inventory; banks: Array<Array<unknown>>; equipStats: { discount: boolean } };
    npcShopOpen: boolean;
    shopHappinessMul: number;
    shopSellbackMemo: Map<string, number>;
    shopBuybackStock: Array<{ vid: number; prefix: number; stack: number }>;
    dialogNpc: unknown;
    coinsOwned(): number;
  };
  const inv = new Inventory();
  g.player = { inv, banks: [[], [], [], []], equipStats: { discount: false } };
  g.npcShopOpen = true;
  g.shopHappinessMul = 1;
  g.shopSellbackMemo = new Map();
  g.shopBuybackStock = [];
  g.dialogNpc = null;
  g.sfx = { play: () => {}, playFiles: () => {}, playWavFile: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  return { g, inv };
}

/** UI 原型壳（altMoveClick 走原型；openInventory/refreshAll 桩化防 DOM 触碰） */
function fakeUI(g: unknown, opts: { openChest?: unknown } = {}) {
  const invOpened: Array<boolean | undefined> = [];
  const fake = Object.create(UI.prototype) as unknown as {
    game: unknown;
    openChest: unknown;
    guideEl: unknown;
    openInventory(force?: boolean): void;
    refreshAll(): void;
    altMoveClick(i: number, where: string, shift: boolean, ctrl: boolean, panelOpen: boolean): boolean;
  };
  fake.game = g;
  fake.openChest = opts.openChest ?? null;
  fake.guideEl = null;
  fake.openInventory = (force?: boolean) => { invOpened.push(force); };
  fake.refreshAll = () => {};
  return { fake, invOpened };
}

// ---------------------------------------------------------------------------
// ① 结构锁：showNpcShop 内补 OpenShop Main.cs:41164 等价面
// ---------------------------------------------------------------------------
describe('① 结构锁：开店强制开背包（Main.OpenShop Main.cs:41164）', () => {
  it('UI.showNpcShop 首行 = this.openInventory(true)，带 Main.cs:41164/SW-BJ8 锚', () => {
    const src = srcOf('../src/ui/UI.ts');
    const body = src.slice(src.indexOf('showNpcShop(title: string'));
    expect(body).toContain('this.openInventory(true)');
    expect(body).toContain('Main.cs:41162-41170');
    expect(body).toContain(':41164');
    expect(body).toContain('SW-BJ8');
    // force=true 必须在 openNpcShop 重刷面之前（卖出/购买刷新不翻转关包）
    expect(body.indexOf('this.openInventory(true)')).toBeLessThan(body.indexOf('this.npcShop.open('));
  });

  it('原版锚仍在位：ItemSlot.cs:28 DisableLeftShiftTrashCan 缺省 true（卖出唯一缺省修饰键=Ctrl）', () => {
    const vanilla = srcOf('../../Terarria1457/Terraria.UI/ItemSlot.cs');
    expect(vanilla).toContain('public static bool DisableLeftShiftTrashCan = true;');
  });

  it('缺省设置档 = leftControl（ItemSlot.cs:28-30 等价；SW-AY1 #10）', () => {
    expect(options.data.quickTrashMode).toBe('leftControl');
  });
});

// ---------------------------------------------------------------------------
// ② 因果锁（死路语义）：关包快捷栏 context 13 无卖出语义——本刀补开的洞
// ---------------------------------------------------------------------------
describe('② 死路因果锁：panelOpen=false 时快捷栏无 Alt/Shift/Ctrl 卖出语义', () => {
  it('context 13（Main.cs:44374 只 Draw 不 Handle）不在 Ctrl 路由门 :611 域内', () => {
    expect(slotContext('inv', 0, false)).toBe(13);
    expect(slotContext('inv', 9, false)).toBe(13);
    // :611 `(uint)context <= 4u || context == 7 || context == 32` 不含 13
    const inDomain = (c: number): boolean => (c >= 0 && c <= 4) || c === 7 || c === 32;
    expect(inDomain(slotContext('inv', 0, false))).toBe(false);
    expect(inDomain(slotContext('inv', 0, true))).toBe(true);   // 开包后 = InventoryItem 0
    expect(inDomain(slotContext('inv', 30, true))).toBe(true);
  });

  it('panelOpen=false：Ctrl+点快捷栏物品 → 不触发 npcShopSell（实报死路面）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[3] = { id: TORCH, stack: 10 };
    const { fake } = fakeUI(g);
    const sold = fake.altMoveClick(3, 'inv', false, true, false);
    expect(sold).toBe(false);                       // 计划 null → 回落普通点击
    expect(inv.slots[3]).not.toBeNull();            // 物品原地不动
    expect(g.coinsOwned()).toBe(0);
  });

  it('panelOpen=true（SW-BJ8 补开后）：Ctrl+点快捷栏物品 → 真卖（端到端）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[3] = { id: TORCH, stack: 10 };
    const { fake } = fakeUI(g);
    const sold = fake.altMoveClick(3, 'inv', false, true, true);
    expect(sold).toBe(true);                        // :840-841 恒消费
    expect(inv.slots[3]).toBeNull();                // TurnToAir（:830）
    expect(g.coinsOwned()).toBe(100);               // value 50 ÷5 = 10 ×10
    expect(g.shopBuybackStock).toHaveLength(1);     // AddItemToShop :828
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 8, stack: 10 });
  });
});

// ---------------------------------------------------------------------------
// ③ 端到端卖出面（真实点击路由 × 真实 Game 方法）：今日嫌疑面各自不拦
// ---------------------------------------------------------------------------
describe('③ 端到端卖出：SW-AU2 路由 × 真实 npcShopSell 全链', () => {
  it('Ctrl+点背包格（10-49）整叠卖出 + 回购记入货架（SellItem :34716-34878）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[21] = { id: GEL, stack: 50 };
    const { fake } = fakeUI(g);
    expect(fake.altMoveClick(21, 'inv', false, true, true)).toBe(true);
    expect(inv.slots[21]).toBeNull();
    expect(g.coinsOwned()).toBe(50);                // 每件 1 铜 ×50
  });

  it('★SW-BP1 placeStyle 位不拦卖出：带实例样式的物品照常成交（卖出路由不经合并谓词）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[12] = { id: TORCH, stack: 5, placeStyle: 3 };
    const { fake } = fakeUI(g);
    expect(fake.altMoveClick(12, 'inv', false, true, true)).toBe(true);
    expect(inv.slots[12]).toBeNull();
    expect(g.coinsOwned()).toBe(50);
  });

  it('收藏总闸（ItemSlot.cs :604）不消费卖出：收藏物 Ctrl+点回落普通点击（不卖不扔）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[11] = { id: TORCH, stack: 10, favorited: true };
    const { fake } = fakeUI(g);
    expect(fake.altMoveClick(11, 'inv', false, true, true)).toBe(false);
    expect(inv.slots[11]).not.toBeNull();           // 收藏保护域,原样保留
    expect(g.coinsOwned()).toBe(0);
  });

  it('钱币豁免（GetSellOrTrash :191-194 type 71-74 → null）：币格 Ctrl+点不动', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[0] = { id: COPPER_COIN, stack: 99 };
    const { fake } = fakeUI(g);
    expect(fake.altMoveClick(0, 'inv', false, true, true)).toBe(false);
    expect(inv.slots[0]).toMatchObject({ id: COPPER_COIN, stack: 99 });
  });

  it('value=0 物品（泥土）→ 白送入店支（OverrideLeftClick :833-839）：不产币、上回购架', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[30] = { id: DIRT, stack: 7 };
    const { fake } = fakeUI(g);
    expect(computeSellValue(2, 7).sellable).toBe(false);
    expect(fake.altMoveClick(30, 'inv', false, true, true)).toBe(true);   // :840 恒消费
    expect(inv.slots[30]).toBeNull();
    expect(g.coinsOwned()).toBe(0);
    expect(g.shopBuybackStock).toHaveLength(1);     // AddItemToShop（白送支 :835）
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 2, stack: 7 });
  });

  it('优先级链：店开+箱未开 → 卖出优先可达；店外同格 Ctrl → 垃圾桶（GetSellOrTrash :187 分流）', () => {
    const { g, inv } = fakeGameWithRealSell();
    inv.slots[15] = { id: TORCH, stack: 1 };
    const { fake } = fakeUI(g);
    expect(fake.altMoveClick(15, 'inv', false, true, true)).toBe(true);
    expect(inv.slots[15]).toBeNull();
    expect(g.coinsOwned()).toBe(10);
    // 店外 = trash 计划（本壳直接看 slotContext 门即可，trash 执行面 AU2 套件已钉）
    g.npcShopOpen = false;
    inv.slots[15] = { id: TORCH, stack: 1 };
    expect(fake.altMoveClick(15, 'inv', false, true, true)).toBe(true);   // trash 支恒消费
    expect(inv.slots[15]).toBeNull();
    expect((inv as unknown as { trash: { id: number } | null }).trash).toMatchObject({ id: TORCH });
  });
});

// ---------------------------------------------------------------------------
// ④ 数据面（SW-BK1/BN1 收缩 7479→6854）：卖出链 vid 解析与币注册零错位
// ---------------------------------------------------------------------------
describe('④ SW-BK1/BN1 数据面收缩后卖出链 vid 解析零错位', () => {
  it('币 71-74 与常卖物品 vid 解析唯一（def.vid ?? key 反解）', () => {
    for (const vid of [2, 8, 23, 71, 72, 73, 74, 39, 75, 3507]) {
      const iid = iidOf(vid);
      expect(vanillaIdOfItem(iid), `vid ${vid}`).toBe(vid);
    }
  });

  it('跨越收缩点的高段 vid（宝石橡实 4851-4857/旗帜 1615/迟到件 5359）仍解析', () => {
    for (const vid of [1615, 4851, 4857, 5359, 5360]) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      expect(key, `vid ${vid} key`).toBeTruthy();
      const iid = ITEM_BY_KEY[key!];
      expect(iid, `vid ${vid} internal`).toBeDefined();
      expect(vanillaIdOfItem(iid!)).toBe(vid);
    }
  });
});

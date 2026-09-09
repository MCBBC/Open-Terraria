// SW-BJ22 2026-09-07 —— 商店出售交互原版对账（用户实问：「手持物品点商店面板=卖、
// 界面上没有任何区域有售卖放置区、也没有提示」）。
//
// 原版语义定谳（Terarria1457 唯一标杆；1458 本域无增量）：
//   ① 卖出修饰键面 = Ctrl（缺省 Quick Trash=Left Control,ItemSlot.cs:28-30）点背包格
//      → GetSellOrTrash :186-196（店外=Trash / 币 71-74=null / 否则 Sell）
//      → OverrideLeftClick cursorOverride==10 :823-841 SellItem 整叠（BJ8/AU2 已钉）。
//      ★原版没有「左键点背包格卖 1」——无修饰键左键 = 拾起/交换（context 0→result 0）。
//   ② 光标持有物点【空商店格】= 唯一卖出放置面：40 格货架网格 Main.cs:42522-42532
//      （10×4,空格同样以 InventoryBack 底框绘制且矩形可命中）→ PickItemMovementAction
//      case 15 :1426-1439（:1435-1438 空格+持有非币 → result 4）→ LeftClick case 4
//      :1195-1212 SellItem(mouseItem) 整叠 → AddItemToShop → SetDefaults(0)。
//      面板格间空白只置 mouseInterface（:42518-42524）不 Handle 任何 slot = 无动作；
//      右键空格不卖（RightClick→HandleShopSlot :1878-1881 CanStack 早退）。
//      旧仓实现「点面板任意空白=卖」自创且无可见售卖区（用户实报）——本刀改回原版面：
//      商店面板重铺 40 格网格,空格=放置区,空白=无动作。
//   ③ 悬停价签 = MouseHover context 15 → Main.HoverItem.buy=true（ItemSlot.cs:3197-3201）
//      → AddShopLines Main.cs:20632-20402：门 :20634（npcShop>0 / value≥0 / 非币 71-74）；
//      buy 支 = tip[50] 买入价（:20714）；!buy 支 = tip[49] 卖出价 = calcForSelling÷5
//      min1 ×stack + 回购差额（:20652-20660,与 SellItem :34732-34743 同式——快乐度÷
//      PriceAdjustment/词缀 value 缩放/回购记全参与）；num≤0 → tip[51] 无价值
//      （:20731-20738,type!=3817 门——散护卫勋章不显「无价值」）。
//      ★旧实现误读 :3200——把「货架上有该物品」当 buy=true（背包格悬停也显买入价）；
//      且卖价公式缺快乐度/词缀/回购差额三项。本刀逐项纠正。
//
// 分层钉法（同 sw-bj8-shop-sell-flow.test.ts 车道）：
//   ① 结构锁（源文本锚）—— 40 格网格/空格放置区/悬停接线/卖出触发面收窄
//   ② 放置卖出交互矩阵 —— Game.npcShopSellHeld 原型直驱（LeftClick case 4 面）
//   ③ 悬停价签矩阵 —— UI.shopTooltipContext 原型直驱（AddShopLines 语义面）
//   ④ BJ8 Ctrl 卖出路径守恒 —— altMoveClick 'sell' 路由不被本刀扰动
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UI } from '../src/ui/UI';
import { Game } from '../src/core/Game';
import { Inventory, COIN_START } from '../src/items/Inventory';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { options } from '../src/core/Options';
import { computeSellValue, itemValueWithPrefix } from '../src/stats/SellChain';
import { vanillaIdOfItem } from '../src/stats/Shimmer';

const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (id === undefined || !ITEM_DEFS[id]) throw new Error(`测试钉死前提失效：vid ${vid} 未注册`);
  return id;
};
const TORCH = iidOf(8);        // value 50 → 每件卖 10 铜
const GEL = iidOf(23);         // value 5 → 每件卖 1 铜
const COPPER_COIN = iidOf(71); // 钱币豁免
const DIRT = iidOf(2);         // value 0 → 白送支/tip51
const MEDAL = iidOf(3817);     // value 0 + type==3817 门 → 无任何价格行

const srcOf = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');

/** 真实 Game.prototype 壳（npcShopSellHeld/npcShopBuy/shopBuybackPriceOf 全链真跑） */
function fakeGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    player: { inv: Inventory; banks: Array<Array<unknown>>; equipStats: { discount: boolean } };
    npcShopOpen: boolean;
    shopHappinessMul: number;
    shopSellbackMemo: Map<string, number>;
    shopBuybackStock: Array<{ vid: number; prefix: number; stack: number }>;
    dialogNpc: unknown;
    coinsOwned(): number;
    npcShopSellHeld(held: { id: number; stack: number; prefix?: number }): boolean;
    npcShopSell(slot: number): boolean;
    npcShopBuy(vanillaId: number, buybackIndex?: number, held?: { id: number; stack: number; prefix?: number }, bulk?: boolean): boolean;
    shopBuybackPriceOf(vid: number, index: number): number | null;
    shopEntryPriceOf(vid: number): number | null;
    shopEntryMedalPriceOf(vid: number): number | null;
    shopStockFor?: (n: unknown) => Array<[number, number]>;
    openNpcShop?: () => void;
    achievements?: { notifyItemPickup(v: number): void };
    sfx: { play(s: string, v?: number): void; playFiles(f: string[], v?: number): void };
    cb: Record<string, (...a: unknown[]) => void>;
  };
  const inv = new Inventory();
  g.player = { inv, banks: [[], [], [], []], equipStats: { discount: false } };
  g.npcShopOpen = true;
  g.shopHappinessMul = 1;
  g.shopSellbackMemo = new Map();
  g.shopBuybackStock = [];
  g.dialogNpc = null;
  g.sfx = { play: () => {}, playFiles: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {}, onNpcShop: () => {} };
  return { g, inv };
}

/** UI 原型壳（shopTooltipContext 走原型；tooltip DOM 不触碰） */
function tooltipShell(g: unknown) {
  const fake = Object.create(UI.prototype) as unknown as { game: unknown };
  fake.game = g;
  return fake as unknown as {
    shopTooltipContext(def: unknown, vid: number, stack: number,
      opts?: { prefix?: number; shopCell?: { price: number; medal?: number } }): unknown;
  };
}

const defOf = (iid: number) => ITEM_DEFS[iid];

// ---------------------------------------------------------------------------
// ① 结构锁：40 格货架网格（Main.cs:42522-42532）+ 空格放置区 + 悬停价签接线
// ---------------------------------------------------------------------------
describe('① 结构锁：原版形制货架网格与卖出触发面收窄', () => {
  it('原版锚仍在位：Main.cs 40 格网格双循环 + ItemSlot.cs result 4（空格+持有非币）', () => {
    const main = srcOf('../../Terarria1457/Terraria/Main.cs');
    expect(main).toContain('for (int num76 = 0; num76 < 10; num76++)');
    expect(main).toContain('ItemSlot.Handle(shop[npcShop].item, 15, slot3)');
    const itemSlot = srcOf('../../Terarria1457/Terraria.UI/ItemSlot.cs');
    // PickItemMovementAction case 15 :1435-1438
    expect(itemSlot).toContain('result = 4;');
    expect(itemSlot).toContain('checkItem.type < 71 || checkItem.type > 74');
    // LeftClick case 4 :1195-1212（光标持有物整叠卖出）
    expect(itemSlot).toContain('player.SellItem(Main.mouseItem)');
  });

  it('NpcShop.open 渲染 40 格网格（.sw-shop-grid）+ 空格（.sw-shop-empty）= 售卖放置区', () => {
    const src = srcOf('../src/ui/NpcDialog.ts');
    expect(src).toContain('.sw-shop-grid');
    expect(src).toContain('i < 40');                      // Main.cs:42522-42532 10×4
    expect(src).toContain('.sw-shop-empty');
    expect(src).not.toContain('sw-shop-list');            // 旧自创行列表退役
  });

  it('UI.installDragListeners 卖出触发面收窄：仅空商店格+左键（旧「点面板任意空白=卖」退役）', () => {
    const src = srcOf('../src/ui/UI.ts');
    expect(src).toContain("if (!t.closest('.sw-shop-empty') || e.button !== 0) return;");
    expect(src).toContain('npcShopSellHeld(this.heldStack)');
  });

  it('悬停价签接线：格位回调现查 Game 现值（shopBuybackPriceOf/勋章/货架价）+ shopCell 进 tooltip 上下文', () => {
    const ui = srcOf('../src/ui/UI.ts');
    expect(ui).toContain('shopBuybackPriceOf(hover.vid, hover.buyback)');
    expect(ui).toContain('shopCell: override?.shopCell');
    const game = srcOf('../src/core/Game.ts');
    expect(game).toContain('shopBuybackPriceOf(vid: number, index: number)');
    expect(game).toContain('stack: bb.stack');            // 卖回克隆 stack 随行（角标/tooltip）
  });

  it('shopTooltipContext 走 SellChain 全链（快乐度/词缀/回购差额参与卖出价行）', () => {
    const ui = srcOf('../src/ui/UI.ts');
    expect(ui).toContain('computeSellValue(vid, Math.max(1, stack)');
  });
});

// ---------------------------------------------------------------------------
// ② 放置卖出交互矩阵：Game.npcShopSellHeld（LeftClick case 4 ItemSlot.cs:1195-1212）
// ---------------------------------------------------------------------------
describe('② 光标持有物×商店格交互矩阵（npcShopSellHeld = case 4 面）', () => {
  it('手持火炬×10 点空商店格 → 整叠卖出（SellItem :1196）：100 铜 + 上回购架 + 光标清', () => {
    const { g, inv } = fakeGame();
    const held = { id: TORCH, stack: 10 };
    expect(g.npcShopSellHeld(held)).toBe(true);
    expect(g.coinsOwned()).toBe(100);                     // value 50 ÷5 = 10 ×10
    expect(g.shopBuybackStock).toHaveLength(1);           // AddItemToShop :1198
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 8, stack: 10 });
    void inv;
  });

  it('手持钱币（71）点空格 → result -1 无动作（:1435 币排除），不卖不白送', () => {
    const { g } = fakeGame();
    const held = { id: COPPER_COIN, stack: 99 };
    expect(g.npcShopSellHeld(held)).toBe(false);
    expect(g.coinsOwned()).toBe(0);
    expect(g.shopBuybackStock).toHaveLength(0);
  });

  it('手持 value=0（泥土）点空格 → 白送入店支（:1120-1126）：0 铜 + 上回购架', () => {
    const { g } = fakeGame();
    const held = { id: DIRT, stack: 7 };
    expect(g.npcShopSellHeld(held)).toBe(true);
    expect(g.coinsOwned()).toBe(0);
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 2, stack: 7 });
  });

  it('币装不下 → SellItem false（:34727-34731 回滚门）：不产币、不上架、光标原样', () => {
    const { g, inv } = fakeGame();
    const max = ITEM_DEFS[TORCH].maxStack;
    for (let i = 0; i < COIN_START; i++) inv.slots[i] = { id: TORCH, stack: max };   // 包 0-49 全满
    const coinMax = ITEM_DEFS[COPPER_COIN].maxStack;
    for (let i = COIN_START; i < COIN_START + 4; i++) inv.slots[i] = { id: COPPER_COIN, stack: coinMax };
    const held = { id: TORCH, stack: 10 };
    expect(g.npcShopSellHeld(held)).toBe(false);
    expect(g.coinsOwned()).toBe(4 * coinMax);             // 分文未入（回滚）
    expect(g.shopBuybackStock).toHaveLength(0);           // 货未上（:1113 门先于 AddItemToShop）
    expect(held.stack).toBe(10);
  });

  it('店未开 → false（npcShop<=0 无 context 15 面）', () => {
    const { g } = fakeGame();
    g.npcShopOpen = false;
    expect(g.npcShopSellHeld({ id: TORCH, stack: 1 })).toBe(false);
  });

  it('守恒·买入面不变：空手点有货格真买（shopStockFor×npcShopBuy 全链）；手持同型买叠光标；异型无动作', () => {
    const { g, inv } = fakeGame();
    g.dialogNpc = { type: 1 };
    g.shopStockFor = () => [[8, 50]];
    g.openNpcShop = () => {};       // 刷新面桩（Lang/DOM 不触碰）
    g.achievements = { notifyItemPickup: () => {} };
    inv.slots[0] = { id: COPPER_COIN, stack: 100 };              // 付 50 买火炬 ×2 笔
    inv.slots[1] = { id: COPPER_COIN, stack: 100 };
    expect(g.npcShopBuy(8, undefined, undefined, false)).toBe(true);
    expect(g.coinsOwned()).toBe(150);
    expect(inv.slots.some((s) => s && vanillaIdOfItem(s.id) === 8)).toBe(true);
    expect(g.shopSellbackMemo.get('8:0')).toBe(1);               // 回购记 :1919-1922
    // 手持同型（CanStack :1431）→ 买入叠光标 held.stack++（:1910-1923）
    const held = { id: TORCH, stack: 1 };
    expect(g.npcShopBuy(8, undefined, held, false)).toBe(true);
    expect(held.stack).toBe(2);
    expect(g.coinsOwned()).toBe(100);
    // 手持异型（凝胶点火炬格）→ result -1 整链无动作（:1427-1434），钱不动
    const wrong = { id: GEL, stack: 1 };
    expect(g.npcShopBuy(8, undefined, wrong, false)).toBe(false);
    expect(wrong.stack).toBe(1);
    expect(g.coinsOwned()).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// ③ 悬停价签矩阵：UI.shopTooltipContext（AddShopLines Main.cs:20632-20402 语义面）
// ---------------------------------------------------------------------------
describe('③ 悬停价签矩阵（shopTooltipContext = AddShopLines 面）', () => {
  it('店未开 → null（:20634 npcShop<=0 早退）；钱币 71-74 → null（无价格行）', () => {
    const { g } = fakeGame();
    g.npcShopOpen = false;
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1)).toBeNull();
    g.npcShopOpen = true;
    for (const vid of [71, 72, 73, 74]) {
      expect(shell.shopTooltipContext(defOf(iidOf(vid)), vid, 1), `vid ${vid}`).toBeNull();
    }
  });

  it('玩家物品卖出价行（buy=false）：火炬 value 50 → ÷5 min1 ×stack = 10 铜/件', () => {
    const { g } = fakeGame();
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1)).toEqual({ buy: false, priceCopper: 10 });
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 3)).toEqual({ buy: false, priceCopper: 30 });
  });

  it('快乐度参与卖出价（PriceAdjustment ÷ 侧 :34936）：pa=1.5 → selling 33 → 6/件 ×2 = 12（旧公式给 20）', () => {
    const { g } = fakeGame();
    g.shopHappinessMul = 1.5;
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 2)).toEqual({ buy: false, priceCopper: 12 });
  });

  it('回购差额参与（:20652-20660 = SellItem :34739-34743 同式）：店内买 1 件当场悬停 = 按买价 50 全额退', () => {
    const { g } = fakeGame();
    g.shopSellbackMemo.set('8:0', 1);
    const shell = tooltipShell(g);
    // 10 + (calcForBuying 50 - perUnit 10) × min(1,1) = 50
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1)).toEqual({ buy: false, priceCopper: 50 });
    g.shopSellbackMemo.set('8:0', 3);
    // 记 3 件只覆盖 stack 内 2 件（:34742 Math.Min(amount, stack)）：10×2 + 40×2 = 100
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 2)).toEqual({ buy: false, priceCopper: 100 });
  });

  it('词缀 value 缩放参与（Item.cs:596-597 num2²）：火炬+Large(1)（mul 1.12）→ value 62 → 12/件', () => {
    const { g } = fakeGame();
    const shell = tooltipShell(g);
    expect(itemValueWithPrefix(8, 1)).toBe(62);           // trunc(50×1.12²)
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1, { prefix: 1 })).toEqual({ buy: false, priceCopper: 12 });
  });

  it('value=0 → tip[51] 无价值行（:20731-20738）；散护卫勋章 3817 → 无任何行（type!=3817 门）', () => {
    const { g } = fakeGame();
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(DIRT), 2, 5)).toEqual({ buy: false, priceCopper: 0 });
    expect(shell.shopTooltipContext(defOf(MEDAL), 3817, 1)).toBeNull();
  });

  it('★D3a 纠偏：货架上有同型物品时，悬停【背包格】仍显卖出价（HoverItem.buy 只在 context 15 置位）', () => {
    const { g } = fakeGame();
    // 旧实现会反查货架显买入价 50——新实现仅 shopCell（商店格悬停）才走买入支
    (g as { shopEntryPriceOf(v: number): number | null }).shopEntryPriceOf = () => 50;
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1)).toEqual({ buy: false, priceCopper: 10 });
  });

  it('商店格位悬停（shopCell）→ 买入价行 tip[50]（buy=true）；勋章条目走 medalPrice 文案位', () => {
    const { g } = fakeGame();
    const shell = tooltipShell(g);
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1, { shopCell: { price: 50 } }))
      .toEqual({ buy: true, priceCopper: 50 });
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 1, { shopCell: { price: 50, medal: 5 } }))
      .toEqual({ buy: true, priceCopper: 5, medalPrice: 5 });
  });

  it('卖价公式与 SellItem 结算全链同源（computeSellValue 交叉验证）', () => {
    const { g } = fakeGame();
    g.shopHappinessMul = 0.88;
    const shell = tooltipShell(g);
    const quote = computeSellValue(8, 4, { priceAdjustment: 0.88 });
    expect(shell.shopTooltipContext(defOf(TORCH), 8, 4, { prefix: 2 }))
      .toEqual({ buy: false, priceCopper: computeSellValue(8, 4, { prefix: 2, priceAdjustment: 0.88 }).copper });
    expect(quote.sellable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ BJ8 守恒：Ctrl+点背包格卖出路径不被本刀扰动
// ---------------------------------------------------------------------------
describe('④ BJ8 守恒：Ctrl 卖出路由与缺省修饰键档', () => {
  it('altMoveClick case \'sell\' 仍路由 npcShopSell（结构锚）', () => {
    const src = srcOf('../src/ui/UI.ts');
    const i = src.indexOf("case 'sell'");
    expect(i).toBeGreaterThan(-1);
    expect(src.indexOf('this.game.npcShopSell(i)')).toBeGreaterThan(i);
  });

  it('缺省档 = Quick Trash: Left Control（ItemSlot.cs:28-30；SW-AU2/BJ8 判例）', () => {
    expect(options.data.quickTrashMode).toBe('leftControl');
    const vanilla = srcOf('../../Terarria1457/Terraria.UI/ItemSlot.cs');
    expect(vanilla).toContain('public static bool DisableLeftShiftTrashCan = true;');
  });

  it('守恒·Ctrl+点背包格整叠卖全链照常（BJ8 ③ 同面复钉）', () => {
    const { g, inv } = fakeGame();
    inv.slots[21] = { id: GEL, stack: 50 };
    const fake = Object.create(UI.prototype) as unknown as {
      game: unknown; openChest: unknown; guideEl: unknown;
      openInventory(force?: boolean): void; refreshAll(): void;
      altMoveClick(i: number, where: string, shift: boolean, ctrl: boolean, panelOpen: boolean): boolean;
    };
    fake.game = g;
    fake.openChest = null;
    fake.guideEl = null;
    fake.openInventory = () => {};
    fake.refreshAll = () => {};
    expect(fake.altMoveClick(21, 'inv', false, true, true)).toBe(true);
    expect(inv.slots[21]).toBeNull();
    expect(g.coinsOwned()).toBe(50);
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 23, stack: 50 });
  });
});

// ---------------------------------------------------------------------------
// ⑤ SW-RB6a 2026-09-07 红蓝复核：AddItemToShop 第一相并叠 + 槽位卖出「不先腾格」
//    （Chest.cs:664-686 phase-1 merge；Player.cs:34727-34868 卖品驻格结算）
// ---------------------------------------------------------------------------
describe('⑤ SW-RB6a 回购架并叠相 + 槽位卖出占格语义（Chest.cs:664-686 / :823-841）', () => {
  it('同 vid 同词缀分两次卖 → 并入同一条目（phase-1 CanStack 门；曾出两行）', () => {
    const { g } = fakeGame();
    expect(g.npcShopSellHeld({ id: TORCH, stack: 10 })).toBe(true);
    expect(g.npcShopSellHeld({ id: TORCH, stack: 5 })).toBe(true);
    expect(g.shopBuybackStock).toHaveLength(1);                 // :664-672 并叠相
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 8, stack: 15 });
  });

  it('异词缀不并（Item.CanStack Item.cs:5578-5585 prefix 相同才可叠）', () => {
    const { g } = fakeGame();
    expect(g.npcShopSellHeld({ id: TORCH, stack: 10 })).toBe(true);
    expect(g.npcShopSellHeld({ id: TORCH, stack: 5, prefix: 1 })).toBe(true);
    expect(g.shopBuybackStock).toHaveLength(2);
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 8, prefix: 0, stack: 10 });
    expect(g.shopBuybackStock[1]).toMatchObject({ vid: 8, prefix: 1, stack: 5 });
  });

  it('maxStack 帽：货架条目满叠后余量落新行（:669 Math.Min(num2, maxStack-stack)）', () => {
    const { g } = fakeGame();
    g.shopBuybackStock.push({ vid: 8, prefix: 0, stack: ITEM_DEFS[TORCH].maxStack - 3 });
    expect(g.npcShopSellHeld({ id: TORCH, stack: 10 })).toBe(true);
    expect(g.shopBuybackStock).toHaveLength(2);                 // 3 入旧行 + 7 落新行
    expect(g.shopBuybackStock[0].stack).toBe(ITEM_DEFS[TORCH].maxStack);
    expect(g.shopBuybackStock[1]).toMatchObject({ vid: 8, prefix: 0, stack: 7 });
  });

  it('回购记与并叠相同序（Remove 先于上架 :652-663）：买 1 再卖 10 → 架上 9', () => {
    const { g, inv } = fakeGame();
    g.dialogNpc = { type: 1 };
    g.shopStockFor = () => [[8, 50]];
    g.openNpcShop = () => {};
    g.achievements = { notifyItemPickup: () => {} };
    inv.slots[0] = { id: COPPER_COIN, stack: 100 };
    expect(g.npcShopBuy(8, undefined, undefined, false)).toBe(true);   // 记 8:0 = 1
    expect(g.npcShopSellHeld({ id: TORCH, stack: 10 })).toBe(true);
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 8, stack: 9 }); // stack -= num(:663)
    expect(g.shopSellbackMemo.has('8:0')).toBe(false);                  // 记已实扣删键
  });

  it('槽位卖出不先腾格：包+币位全满 → 币无格可落 = 整单回滚不卖（:34727-34876 语义）', () => {
    const { g, inv } = fakeGame();
    const max = ITEM_DEFS[TORCH].maxStack;
    for (let i = 0; i < COIN_START; i++) inv.slots[i] = { id: TORCH, stack: max };
    const coinMax = ITEM_DEFS[COPPER_COIN].maxStack;
    for (let i = COIN_START; i < COIN_START + 4; i++) inv.slots[i] = { id: COPPER_COIN, stack: coinMax };
    // slot 0 持满叠火炬（卖价 9990 铜）——原版结算期卖品仍驻格,币只能进 0-53 的空位
    expect(g.npcShopSell(0)).toBe(true);
    expect(g.coinsOwned()).toBe(4 * coinMax);          // 分文未入（回滚）
    expect(g.shopBuybackStock).toHaveLength(0);        // 货未上
    expect(inv.slots[0]).toMatchObject({ id: TORCH, stack: max });   // 物品从未离位
  });

  it('槽位卖出正常态：币入包 + 架上货 + 卖品格清空（TurnToAir 在结算后 :832）', () => {
    const { g, inv } = fakeGame();
    inv.slots[7] = { id: GEL, stack: 50 };
    expect(g.npcShopSell(7)).toBe(true);
    expect(g.coinsOwned()).toBe(50);
    expect(inv.slots[7]).toBeNull();
    expect(g.shopBuybackStock[0]).toMatchObject({ vid: 23, stack: 50 });
  });
});

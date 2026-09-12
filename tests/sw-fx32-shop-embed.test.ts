// SW-FX32 刀①（2026-09-11）:商店侧内嵌布局——vanilla-inventory-refactor 登记债#1
// 分期二（箱侧 FX28 已清偿;店侧本刀）。金标 = 1457 反编译
// Terarria1457/Terraria/Main.cs DrawInventory 商店段（:42500-42532）+ ItemSlot.cs
// DrawSavings/DrawMoney（:3712-3757/:3668-3711）+ Main.cs:67677-67680 快乐度 offsets。
// 1458 交叉核对:同域零增量（Main.cs 1458 :42508-42538 同式偏移 +6 行;offsets 赋值
// 1458 :67683-67686 同值 26/98/12/108;DrawSavings 1458 ItemSlot.cs:3713 同函数）。
// 覆盖面:①几何金标（纯算术+逐槽截断纪律）②单源接线锚定（结构锁,变异证红）
// ③行为绑定（储蓄数据面/买卖接线/Set-Back 退役/悬停单源）。
//
// 变异证红纪律:每段断言即判别器——几何常量/帧档边界/单源接线任一漂移即红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHOP_TITLE_XY, CHEST_NAME_XY, CHEST_SCALE,
  shopSlotXY, chestSlotXY, shopShelfBand,
  shopHappinessIconXY, shopHappinessTextXY, happinessFrameX,
  shopSavingsLabelXY, shopSavingsCoinXY, SHOP_SAVINGS_BANK_ICONS, SHOP_SAVINGS_ICON_SCALE,
} from '../src/ui/vanillaInvLayout';
import { Game } from '../src/core/Game';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import type { InvItem } from '../src/items/Inventory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const uiSrc = read('src/ui/UI.ts');
const layoutSrc = read('src/ui/vanillaInvLayout.ts');
const npcDialogSrc = read('src/ui/NpcDialog.ts');
const mainSrc = read('../Terarria1457/Terraria/Main.cs');
const itemSlotSrc = read('../Terarria1457/Terraria.UI/ItemSlot.cs');

/** 原版商店货架逐槽字面(Main.cs:42522-42523:num78=(int)(73+num76·56·scale)/
 *  num79=(int)(invBottom+num77·56·scale),invBottom=258 Main.cs:6746,scale 0.755 :42513) */
const vanillaShelfXY = (col: number, row: number): { x: number; y: number } => ({
  x: Math.trunc(73 + col * 56 * 0.755),
  y: Math.trunc(258 + row * 56 * 0.755),
});

// ============================================================
// ① 几何金标(Main.cs:42500-42532 商店段 + ItemSlot.cs 储蓄行)
// ============================================================
describe('SW-FX32 ①货架/店名几何金标(Main.cs:42500-42532)', () => {
  it('原版锚仍在位:Main.cs 商店段门/名/储蓄/40 格双循环/context 15', () => {
    expect(mainSrc).toContain('if (npcShop > 0 && !PipsUseGrid)');                    // :42500 门
    expect(mainSrc).toContain('Lang.inter[28].Value, 504f, invBottom');               // :42502 店名
    expect(mainSrc).toContain('ItemSlot.DrawSavings(spriteBatch, 504f, invBottom)');  // :42503 储蓄
    expect(mainSrc).toContain('for (int num76 = 0; num76 < 10; num76++)');            // :42518
    expect(mainSrc).toContain('ItemSlot.Handle(shop[npcShop].item, 15, slot3)');      // :42529 ctx15
    expect(mainSrc).toContain('int num78 = (int)(73f + (float)(num76 * 56) * inventoryScale);');   // :42522
    expect(mainSrc).toContain('int num79 = (int)((float)invBottom + (float)(num77 * 56) * inventoryScale);');  // :42523
  });

  it('店名/储蓄落位 = (504,258)(Main.cs:42502-42503;与箱名同构面——同一常量单源)', () => {
    expect(SHOP_TITLE_XY).toEqual({ x: 504, y: 258 });
    expect(SHOP_TITLE_XY).toBe(CHEST_NAME_XY);   // 同一对象——禁另立字面
  });

  it('40 格逐槽与反编译表达式恒等(:42522-42523 逐槽 (int) 截断,行主序 :42524 slot3=num76+num77·10)', () => {
    for (let i = 0; i < 40; i++) {
      const col = i % 10, row = Math.floor(i / 10);
      expect(shopSlotXY(i), `slot ${i}`).toEqual(vanillaShelfXY(col, row));
    }
  });

  it('货架=箱条同格(Main.cs:42522-42524 ≡ ChestUI.cs:375-376):40 槽逐槽与 chestSlotXY 全等', () => {
    for (let i = 0; i < 40; i++) expect(shopSlotXY(i)).toEqual(chestSlotXY(i));
    expect(CHEST_SCALE).toBe(0.755);   // :42513 inventoryScale=0.755f ≡ ChestUI.cs:83
  });

  it('关键落位像素:首格 (73,258)/行末 x=453/第 4 行 y=384', () => {
    expect(shopSlotXY(0)).toEqual({ x: 73, y: 258 });
    expect(shopSlotXY(9)).toEqual({ x: 453, y: 258 });
    expect(shopSlotXY(39)).toEqual({ x: 453, y: 384 });
  });

  it('货架整带拦截区(Main.cs:42514-42516):73..73+560·0.755 × invBottom..invBottom+224·0.755', () => {
    expect(shopShelfBand()).toEqual({ x: 73, y: 258, w: Math.trunc(560 * 0.755), h: Math.trunc(224 * 0.755) });
    expect(shopShelfBand().w).toBe(422);   // trunc(422.8)
    expect(shopShelfBand().h).toBe(169);   // trunc(169.12)
  });
});

describe('SW-FX32 ①快乐度图标+倍率金标(Main.cs:42504-42512 + :67677-67680)', () => {
  it('原版锚:NPCHappiness 4 帧/中心锚/offsets 赋值(1458 :67683-67686 同值)', () => {
    expect(mainSrc).toContain('TextureAssets.NPCHappiness.Value');                  // :42504
    expect(mainSrc).toContain('value5.Frame(4, 1, frameX)');                       // :42507
    expect(mainSrc).toContain('rectangle2.Size() / 2f');                           // :42509 中心锚
    expect(mainSrc).toContain('shopHappinessTextOffsetX = 26;');                   // :67677
    expect(mainSrc).toContain('shopHappinessTextOffsetY = 98;');                   // :67678
    expect(mainSrc).toContain('shopHappinessIconOffsetX = 12;');                   // :67679
    expect(mainSrc).toContain('shopHappinessIconOffsetY = 108;');                  // :67680
  });

  it('图标中心 (516,366)/文字 (530,356)(:42508/:42512 = 504+offset + invBottom=258)', () => {
    expect(shopHappinessIconXY()).toEqual({ x: 504 + 12, y: 258 + 108 });
    expect(shopHappinessTextXY()).toEqual({ x: 504 + 26, y: 258 + 98 });
  });

  it('表情帧档三元链(Main.cs:42506:≤0.82→0/≤1→1/≤1.1→2/其余→3)——边界逐点钉死', () => {
    expect(happinessFrameX(0.75)).toBe(0);
    expect(happinessFrameX(0.82)).toBe(0);     // 边界含
    expect(happinessFrameX(0.83)).toBe(1);
    expect(happinessFrameX(1)).toBe(1);
    expect(happinessFrameX(1.01)).toBe(2);
    expect(happinessFrameX(1.1)).toBe(2);      // 边界含
    expect(happinessFrameX(1.11)).toBe(3);
    expect(happinessFrameX(1.5)).toBe(3);
  });

  it('图标右缘不入货架带(x=516-12=504 ≥ 货架右缘 495——原版并存不叠)', () => {
    expect(shopHappinessIconXY().x - 12).toBeGreaterThanOrEqual(shopShelfBand().x + shopShelfBand().w);
  });
});

describe('SW-FX32 ①储蓄行金标(ItemSlot.cs:3712-3757 DrawSavings→DrawMoney)', () => {
  it('原版锚:bank..bank4 四仓合计/num5>0 门/Lang.inter[66]/币图标步距', () => {
    expect(itemSlotSrc).toContain('public static void DrawSavings(SpriteBatch sb, float shopx, float shopy, bool horizontal = false)');   // :3712
    expect(itemSlotSrc).toContain('Utils.CoinsCount(out var overFlowing, player.bank.item)');    // :3718
    expect(itemSlotSrc).toContain('if (num5 > 0)');                                              // :3726 门
    expect(itemSlotSrc).toContain('DrawMoney(sb, Lang.inter[66].Value, shopx, shopy, Utils.CoinsSplit(num5), horizontal, fromSavings: true)');  // :3757
    expect(itemSlotSrc).toContain('new Vector2(shopx + 11f + (float)(24 * j), shopy + 75f - drawState.coinYOffset)');   // :3699-3701
  });

  it('储蓄标签 @(504,298)(DrawMoney :3671 shopx,shopy+40)/币图标 @(515+24j,333)(:3699-3701)', () => {
    expect(shopSavingsLabelXY()).toEqual({ x: 504, y: 258 + 40 });
    expect([0, 1, 2, 3].map(shopSavingsCoinXY)).toEqual([
      { x: 504 + 11, y: 258 + 75 },
      { x: 504 + 11 + 24, y: 258 + 75 },
      { x: 504 + 11 + 48, y: 258 + 75 },
      { x: 504 + 11 + 72, y: 258 + 75 },
    ]);
  });

  it('四银行小图标(ItemSlot.cs:3727-3740):虚空袋4076(70,45)/熔炉3813(92,45)/保险箱346(80,50)/存钱罐87(70,60),×0.65', () => {
    expect(SHOP_SAVINGS_ICON_SCALE).toBe(0.65);
    expect(SHOP_SAVINGS_BANK_ICONS.map((b) => [b.vid, b.off.x, b.off.y, b.bank])).toEqual([
      [4076, 70, 45, 3],   // num4>0 → bank4 虚空保险库 :3727-3730
      [3813, 92, 45, 2],   // num3>0 → bank3 守护者熔炉 :3731-3734
      [346, 80, 50, 1],    // num2>0 → bank2 保险箱 :3735-3738
      [87, 70, 60, 0],     // num>0 → bank 存钱罐 :3739-3742
    ]);
  });
});

// ============================================================
// ② 单源接线锚定(结构锁,变异证红):vinvBuildShop 几何只认 vanillaInvLayout
// ============================================================
describe('SW-FX32 ②单源接线锚定(结构锁,变异证红)', () => {
  it('vanillaInvLayout.ts 携反编译行号锚+字面公式;shopSlotXY 委托 chestSlotXY(同格禁二式)', () => {
    expect(layoutSrc).toContain('export function shopSlotXY(i: number)');
    expect(layoutSrc).toContain('return chestSlotXY(i);');
    expect(layoutSrc).toContain('if (pa <= 0.82) return 0;');
    expect(layoutSrc).toContain('if (pa <= 1.1) return 2;');
    expect(layoutSrc).toContain('Main.cs:42502-42503');
    expect(layoutSrc).toContain('Main.cs:67677-67680');
    expect(layoutSrc).toContain('ItemSlot.cs:3712-3757');
  });

  it('UI.ts vinvBuildShop 消费单源(货架/店名/储蓄/快乐度四路)', () => {
    expect(uiSrc).toContain('const { x, y } = shopSlotXY(i);');
    expect(uiSrc).toContain('{ x: SHOP_TITLE_XY.x, y: SHOP_TITLE_XY.y }');
    expect(uiSrc).toContain('return shopSavingsLabelXY();');
    expect(uiSrc).toContain('return shopSavingsCoinXY(0);');
    expect(uiSrc).toContain('shopHappinessIconXY()');
    expect(uiSrc).toContain('vis() ? shopHappinessTextXY() : null');
  });

  it('反向锁定:内联字面已废除,禁回潮(货架/happiness/储蓄坐标不落 UI.ts)', () => {
    expect(uiSrc).not.toContain('Math.trunc(73 +');        // 货架逐槽式(单源 shopSlotXY)
    expect(uiSrc).not.toContain('504 + 12');               // 快乐度图标 offset
    expect(uiSrc).not.toContain('504 + 26');               // 快乐度文字 offset
    expect(uiSrc).not.toContain('shopSlotXY(i: number)');  // 禁在 UI.ts 内重定义
  });

  it('showNpcShop 分派:vanilla 分支=载荷+refresh,payload 在 openInventory(true) 之后(BJ8 锚)', () => {
    const body = uiSrc.slice(uiSrc.indexOf('showNpcShop(title: string'));
    expect(body).toContain('if (this._builtLayout === \'vanilla\') {');
    expect(body).toContain('vinvShopPayload = { title, entries, copper, happinessMul: happinessPct ?? 1, medals, medalsTotal }');
    expect(body).toContain('this.vinvRefreshShop();');
    expect(body).toContain('this.vinvShopIconPoll();');
    // BJ8 ① 守恒:openInventory(true) 必须先于一切面板落位
    expect(body.indexOf('this.openInventory(true)')).toBeLessThan(body.indexOf('vinvShopPayload = {'));
    expect(body.indexOf('this.openInventory(true)')).toBeLessThan(body.indexOf('this.npcShop.open('));
  });

  it('显示门 = Main.cs:42500 同面(npcShopOpen ∧ !PipsUseGrid);建挂于 vinvBuildChest 之后', () => {
    const start = uiSrc.indexOf('private vinvShopVisible');
    const body = uiSrc.slice(start, uiSrc.indexOf('private vinvRefreshShop', start));
    expect(body).toContain('!!this.game?.npcShopOpen && !this.vinvPipsUseGrid');
    expect(body).toContain("for (let i = 0; i < 40; i++) {");
    const build = uiSrc.slice(uiSrc.indexOf('this.vinvBuildChest();'), uiSrc.indexOf('this.vinvBuildShop();'));
    expect(build.length).toBeLessThan(120);   // vinvBuildShop() 紧随 vinvBuildChest() 调用
  });

  it('vanilla 面无 Set-Back 钮浮面板:vinvBuildShop 不产 .sw-npc-shop/sw-set-back;NpcShop=classic 专属', () => {
    const start = uiSrc.indexOf('private vinvBuildShop');
    const body = uiSrc.slice(start, uiSrc.indexOf('private vinvRefreshShop', start));
    expect(body).not.toContain('sw-npc-shop');
    expect(body).not.toContain('sw-set-back');
    expect(npcDialogSrc).not.toContain('sw-set-back');   // 浮面板(classic 面)同撤
    expect(npcDialogSrc).not.toContain('sw-shop-foot');
  });
});

// ============================================================
// ③ 行为绑定(储蓄数据面/买卖接线/悬停单源)
// ============================================================
const iidOf = (vid: number): number => {
  const id = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  if (id === undefined) throw new Error(`测试钉死前提失效：vid ${vid} 未注册`);
  return id;
};

/** 真实 Game.prototype 壳（BJ22 fakeGame 车道:只填储蓄域读取面） */
function fakeGame(banks: Array<Array<InvItem | null>>): Game {
  const g = Object.create(Game.prototype) as unknown as {
    player: { banks: Array<Array<InvItem | null>> };
    coinSavingsCopper(): number;
    coinSavingsByBank(): [number, number, number, number];
    coinSavingsSplit(): [number, number, number, number];
  };
  g.player = { banks };
  return g as unknown as Game;
}

describe('SW-FX32 ③储蓄数据面(Utils.CoinsCount/CoinsSplit 1:1)', () => {
  it('四仓合计:存钱罐 1 铂 + 保险箱 50 银 = 1005000 铜(背包/光标不进)', () => {
    const g = fakeGame([
      [{ id: iidOf(74), stack: 1 } as InvItem],               // bank 存钱罐
      [{ id: iidOf(72), stack: 50 } as InvItem],              // bank2 保险箱
      [], [],
    ]);
    expect(g.coinSavingsByBank()).toEqual([1000000, 5000, 0, 0]);
    expect(g.coinSavingsCopper()).toBe(1005000);
  });

  it('空仓/非币物不计:0 铜(Items 71-74 以外全跳过 Utils.cs:1060-1077)', () => {
    const g = fakeGame([
      [{ id: iidOf(8), stack: 99 } as InvItem, null],         // 火炬非币
      [], [], [],
    ]);
    expect(g.coinSavingsCopper()).toBe(0);
    expect(g.coinSavingsSplit()).toEqual([0, 0, 0, 0]);
  });

  it('CoinsSplit 贪心除档(Utils.cs:1083-1097):1234567 铜 → [铜67,银45,金23,铂1]', () => {
    const g = fakeGame([[], [], [], [{ id: iidOf(71), stack: 1234567 } as InvItem]]);
    expect(g.coinSavingsSplit()).toEqual([67, 45, 23, 1]);
    expect(g.coinSavingsCopper()).toBe(1234567);
  });

  it('空壳守恒:全空 → 0/[0,0,0,0](DrawSavings num5>0 门 :3726 不画整行)', () => {
    const g = fakeGame([[], [], [], []]);
    expect(g.coinSavingsCopper()).toBe(0);
    expect(g.coinSavingsByBank()).toEqual([0, 0, 0, 0]);
  });
});

describe('SW-FX32 ③买卖接线/悬停单源(SW-BJ22 语义面 vanilla 载体)', () => {
  it('空格卖出放置区接线:npcShopSellHeld+光标清(:1435-1438→case 4 :1195-1212)', () => {
    const start = uiSrc.indexOf('private vinvBuildShop');
    const body = uiSrc.slice(start, uiSrc.indexOf('/** 货架内容+头部回写', start));
    expect(body).toContain('if (e.button !== 0) return;');   // 右键不买不卖(:1878-1881)
    expect(body).toContain('npcShopSellHeld(this.heldStack)');
    expect(body).toContain('this.heldStack = null;');
  });

  it('买入接线:有货格→npcShopBuy(vid,buyback,held?,bulk)——同型叠光标/Shift 批量', () => {
    const start = uiSrc.indexOf('private vinvBuildShop');
    const body = uiSrc.slice(start, uiSrc.indexOf('/** 货架内容+头部回写', start));
    expect(body).toContain('npcShopBuy(it.vanillaId, it.buyback, held, bulk)');
    expect(body).toContain('npcShopBuy(it.vanillaId, it.buyback, undefined, bulk)');
    expect(body).toContain('e.shiftKey || undefined');
  });

  it('悬停 tooltip 单源:showShopCellTooltip 浮面板/内嵌货架共用(SW-BJ22 语义面)', () => {
    expect(uiSrc).toContain('private showShopCellTooltip(hover: ShopCellHover, anchor: HTMLElement | null): void');
    expect(uiSrc).toContain('(hover, anchor) => this.showShopCellTooltip(hover, anchor)');
    expect(uiSrc).toContain('this.showShopCellTooltip({ vid: it.vanillaId, stack: 1, prefix: it.prefix, buyback: it.buyback }, cell)');
  });

  it('店名文案回写:vinvRefreshShop 画 payload title(探针实测曾漏=空店名,红方回锁)', () => {
    expect(uiSrc).toContain("this.vinvShopTitleEl.textContent = pay?.title ?? ''");
  });

  it('关店收面:closeNpcDialog 触 refreshAll(走远/对话关闭 → 货架 pos 门失效)', () => {
    const body = uiSrc.slice(uiSrc.indexOf('closeNpcDialog(): void'), uiSrc.indexOf('showNpcShop(title: string'));
    expect(body).toContain("if (this._builtLayout === 'vanilla') this.refreshAll();");
  });

  it('储蓄可见旗入布局签名(银行搬钱不翻 chestOpen → 不入签 = 图标滞留)', () => {
    expect(uiSrc).toContain('const savBanks = this.game.coinSavingsByBank();');
  });
});

// ============================================================
// SW-RB14b(2026-09-12)修复锚定:关包关店门/换店失效面/陈旧锚订正
// ============================================================
describe('SW-RB14b 修复锚定(F1 关包关店门/F5 换店失效/F4 锚订正)', () => {
  it('F1 !playerInventory ⇒ npcShop=0:closeInventory 补 npcShopClose(Main.cs:42496-42499 每帧门 + :46434-46441 dead 链)', () => {
    const start = uiSrc.indexOf('closeInventory() {');
    const body = uiSrc.slice(start, uiSrc.indexOf('openItemSearch()', start));
    expect(body).toContain('this.game.npcShopClose();');
    expect(body).toContain('★SW-RB14b');
    // 门序:在 vinvCloseModernCraft(Main.cs:46438-46444 同段)之后,与原版 !playerInventory
    // 块同域(Main.cs:46437 chest=-1 → InGuideCraftMenu → InReforgeMenu → NewCraftingUI.Close)
    expect(body.indexOf('this.vinvCloseModernCraft(true);')).toBeGreaterThan(-1);
    expect(body.indexOf('this.game.npcShopClose();')).toBeGreaterThan(body.indexOf('this.vinvCloseModernCraft(true);'));
  });

  it('F5 商店按钮开启面:openShopFromButton 接线(OpenShop Main.cs:41162-41170 两臂)', () => {
    const g = read('src/core/Game.ts');
    expect(g).toContain("if (id === 'shop') { this.openShopFromButton(false); return; }");
    expect(g).toContain("if (id === 'shopDecor' && npc.vanillaId === 227) { this.openShopFromButton(true); return; }");
    const start = g.indexOf('private openShopFromButton');
    const body = g.slice(start, g.indexOf('private openNpcShop(decor', start));
    expect(body).toContain('this.shopSellbackMemo.clear();');   // UpdateOldNPCShop(1457:18387-18393)
    expect(body).toContain('this.shopBuybackStock = [];');      // Chest.SetupShop 重建(Chest.cs:1357-1361)
    expect(body).toContain("`${decor ? 'd' : 's'}:${this.dialogNpc?.vanillaId ?? -1}`");
  });

  it('F5 行为矩阵:换店清记/同店保记/装饰专柜算换店(原版 npcShop 变更语义)', () => {
    const shell = (memo: Record<string, number>, idx: string | null) => {
      const g = Object.create(Game.prototype) as unknown as {
        dialogNpc: { vanillaId: number };
        shopSellbackMemo: Map<string, number>;
        shopBuybackStock: Array<{ vid: number; prefix: number; stack: number }>;
        lastOpenedShopIdx: string | null;
        openNpcShop(decor?: boolean): void;
      };
      g.dialogNpc = { vanillaId: 1 };
      g.shopSellbackMemo = new Map(Object.entries(memo).map(([k, v]) => [k, v]));
      g.shopBuybackStock = [{ vid: 8, prefix: 0, stack: 3 }];
      g.lastOpenedShopIdx = idx;
      let refreshDecor: boolean | null = null;
      g.openNpcShop = (decor = false) => { refreshDecor = decor; };
      return { g, getRefresh: () => refreshDecor };
    };
    // ①换店(A s:1 → B s:2):记+回购清,openNpcShop 照走
    const a = shell({ '8:0': 5 }, 's:2');   // 上一会话=B 店(s:2)→点 NPC1 商店钮=换店
    (Game.prototype as unknown as { openShopFromButton(decor: boolean): void }).openShopFromButton.call(a.g, false);
    expect(a.g.shopSellbackMemo.size).toBe(0);
    expect(a.g.shopBuybackStock).toEqual([]);
    expect(a.g.lastOpenedShopIdx).toBe('s:1');   // 目标 NPC=1(/dialogNpc)
    expect(a.getRefresh()).toBe(false);
    // ②同店再点(npcShop 未变):差价记保留(原版 helper 存活),回购货架仍重建(SetupShop)
    const b = shell({ '8:0': 5 }, 's:1');
    (Game.prototype as unknown as { openShopFromButton(decor: boolean): void }).openShopFromButton.call(b.g, false);
    expect(b.g.shopSellbackMemo.get('8:0')).toBe(5);
    expect(b.g.shopBuybackStock).toEqual([]);
    // ③装饰专柜(商店索引 15→25 变更):记清
    const c = shell({ '8:0': 5 }, 's:1');
    (Game.prototype as unknown as { openShopFromButton(decor: boolean): void }).openShopFromButton.call(c.g, true);
    expect(c.g.shopSellbackMemo.size).toBe(0);
    expect(c.getRefresh()).toBe(true);
    // ④npcShopClose 归零投影:重开同店=索引 0→A 变更 → lastOpenedShopIdx 复位
    const d = shell({}, 's:1');
    (Game.prototype as unknown as { npcShopClose(): void }).npcShopClose.call(d.g);
    expect(d.g.lastOpenedShopIdx).toBeNull();
  });

  it('F4 锚订正:陈旧 1456 锚(18056-18064)不再入注(现锚 1457:18387-18393)', () => {
    for (const f of ['src/ui/UI.ts', 'src/ui/NpcDialog.ts', 'src/core/Game.ts', 'src/stats/SellChain.ts']) {
      expect(read(f), f).not.toContain('Main.cs:18056-18064');
    }
    expect(read('src/core/Game.ts')).toContain('UpdateOldNPCShop 1457:18387-18393');
  });
});

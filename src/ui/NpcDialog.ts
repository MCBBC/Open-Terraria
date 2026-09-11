// 原版 NPC 对话 UI(DOM 版):对话框(NPC 名 + 台词 + 选项按钮)+ 商店面板。
// 对照 1456:Player.SetTalkNPC(Player.cs:4180)→ Main.npcChatText/Main.DrawNPCChat;
// 按钮标签 = Lang.inter[](LegacyInterface):28 商店 / 52 关闭 / 54 治疗 / 50 诅咒。
// 台词与商店内容在 Game 侧生成(NPC.GetChat / Chest.SetupShop 1:1),本文件纯渲染。
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';
import { options } from '../core/Options';
import type { DialoguePortraitPayload } from '../data/npcPortraits';
import { townNpcProfileSheet } from '../data/townNpcProfiles';
import { VANILLA_NPCS } from '../data/vanillaNpcs';
import portraitOffsetsJson from '../data/vanilla-portrait-offsets.json';

/** NPCPortraitsCloseUpOffsets / FullBodyRetroOffsets（NPCID.cs:4517/:4681 全量 40+21） */
const PORTRAIT_OFFSETS = portraitOffsetsJson as unknown as {
  closeUp: Record<string, [number, number]>;
  fullBodyRetro: Record<string, [number, number]>;
};
// 2026-08-30 对齐 NPCInteractions.Initialize 全注册表（:489-531）：新增
// shopDecor(画家装饰店 25) / help+craft(向导 22 GuideTip·GuideReverseCrafting)
// / music(派对女孩 208) / advice(酒馆老板 550 TavernkeepAdvice) / stardew(树妖
// Joja 净化独立按钮,ShowExclamation) / home(无家 NPC RequestHome,ShowExclamation)
export type NpcButtonId = 'shop' | 'shopDecor' | 'heal' | 'curse' | 'collect' | 'reforge'
  | 'hair' | 'quest' | 'plant' | 'happiness' | 'status' | 'help' | 'craft' | 'music'
  | 'advice' | 'stardew' | 'home' | 'pet' | 'close';

/** 心情报告条目（Game 侧已做 l10n 渲染的成品文案 + 价格乘子） */
export type NpcButtonMeta = { id: NpcButtonId; label: string; excl?: boolean; coins?: number };

/** NPC 对话框右下角物品（Main.npcChatCornerItem 三态模型）：
 *  >0 = 渔夫任务鱼图标（32px 帽缩放,悬停 tooltip,点击把 [i:id] 插聊天——
 *  DrawNPCChatBottomRightItem Main.cs:40480-40543）；-1 = RequestHome 态
 *  （原版画 EquipPage[5] 快捷图标开装备页,本仓无该单图资产不画,登记）；0 = 无。 */

export interface HappinessInfo {
  name: string;
  /** 逐条心情文案（TownNPCMood_<NPC>.<键> 渲染后） */
  lines: string[];
  /** 价格乘子（LimitAndRoundMultiplier 后 [0.75,1.5]） */
  priceMul: number;
}

/** 快乐度表情档位（Main.cs:41235-41237 NPCHappiness 贴图 4 帧：≤0.82 / ≤1 / ≤1.1 / 其余） */
export function happinessFace(priceMul: number): { face: string; cls: string } {
  if (priceMul <= 0.82) return { face: '😄', cls: 'best' };
  if (priceMul <= 1) return { face: '🙂', cls: 'good' };
  if (priceMul <= 1.1) return { face: '😐', cls: 'ok' };
  return { face: '😡', cls: 'bad' };
}

/** 价格百分比文案（Main.cs:41240 priceAdjustment.ToString("P0")） */
export function happinessPct(priceMul: number): string {
  return `${Math.round(priceMul * 100)}%`;
}

export interface ShopEntry {
  /** 本仓库 item key(vi_ 系) */
  key: string;
  /** 原版 item id(图标) */
  vanillaId: number;
  name: string;
  /** 铜币计价(item.value；勋章条目 = 勋章枚数) */
  price: number;
  /** 护卫勋章价（shopSpecialCurrency=DefenderMedals 条目；渲染走勋章文案，
   *  支付分流 Game.npcShopBuy 扣勋章——CustomCurrencyID.DefenderMedals 全链） */
  medal?: number;
  /** 卖回货架条目下标（Chest.AddItemToShop buyOnce 克隆；购买时回传 npcShopBuy
   *  区分常规货——同 vid 双行时 data-id 撞号，以此区分） */
  buyback?: number;
  /** 条目堆叠（SW-BJ22 2026-09-07：卖回克隆带 stack——Chest.AddItemToShop
   *  :658-663 克隆原 stack；常规货架条目原版恒 1（SetDefaults）缺省即可）。
   *  商品格位角标 + 悬停 tooltip 价格行 ×stack（Main.cs:20652 EstimateDisplayStack） */
  stack?: number;
  /** 条目词缀（卖回克隆带出——Item.Prefix :596-597 缩放后 value 随行；
   *  tooltip 词缀行 + 买回价 shopBuybackPriceOf 同源） */
  prefix?: number;
  iconUrl: string | null;
}

/** 商品格位悬停载荷（SW-BJ22 2026-09-07：vanilla 商品格悬停 = ItemSlot.MouseHover
 *  context 15（ItemSlot.cs:3170-3204，:3197-3201 置 Main.HoverItem.buy=true）→
 *  Main.MouseText 物品全文 tooltip + AddShopLines 买入价行；空格悬停无 tooltip
 *  （IsAir 早退）。null = 离开格位收起） */
export type ShopCellHover = {
  vid: number;
  stack: number;
  prefix?: number;
  buyback?: number;
} | null;

/** 勋章价格文案（CustomCurrencySingleCoin.GetPriceText :103-107：
 *  price + Language[Currency.DefenderMedals].ToLower()，色 (240,100,120)） */
export function medalPriceText(price: number): string {
  return `${price} ${Lang.text('Currency.DefenderMedals').toLowerCase()}`;
}

const CSS = `
.sw-npc-dialog {
  position: fixed; left: 50%; bottom: 120px; transform: translateX(-50%);
  width: 560px; max-width: 94vw; z-index: 22; cursor: auto;
  /* ★sw-root 是 pointer-events:none(防挡画布),子面板必须显式 auto 否则按钮点不到 */
  pointer-events: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 10px 14px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-npc-body { display: flex; gap: 10px; align-items: flex-start; }
.sw-npc-portrait { width: 76px; height: 92px; flex: none; image-rendering: pixelated;
  border: 2px solid #7d92d6; border-radius: 4px; background: #10142a;
  animation: sw-portrait-hop 0.35s cubic-bezier(.2,1.6,.4,1); }
@keyframes sw-portrait-hop { 0% { transform: translateY(14px) scale(0.9); opacity: 0.2; }
  100% { transform: translateY(0) scale(1); opacity: 1; } }
.sw-npc-main { flex: 1; min-width: 0; }
.sw-npc-name { color: #ffe8a0; font-size: 15px; margin-bottom: 6px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
.sw-npc-chat { font-size: 14px; line-height: 1.6; color: #e8e8f4; min-height: 44px; position: relative; }
.sw-npc-btns { display: flex; gap: 8px; margin-top: 8px; position: relative;
  /* 原版每 4 个换行（NPCChatPanel.DrawButtons :103-107 num%4）——按钮流式排布
     以 wrap 近似同观感 */
  flex-wrap: wrap; row-gap: 6px; align-items: center; }
/* 金币条（TryAddCoins→ItemSlot.DrawMoney 画在按钮左上 −45,−44,NPCChatPanel.cs:142） */
.sw-npc-coins { position: absolute; bottom: calc(100% + 2px); left: 0; color: #ffd76e;
  font-size: 11px; white-space: nowrap; text-shadow: 1px 1px 0 #000;
  pointer-events: none; }
/* 渔夫任务鱼角标（npcChatCornerItem>0,32px 帽缩放 Main.cs:40486-40492） */
.sw-corner-item { position: absolute; right: -34px; bottom: 0px; width: 30px; height: 30px;
  image-rendering: pixelated; cursor: pointer; filter: drop-shadow(0 0 3px rgba(0,0,0,.7)); }
/* -1 态：EquipPage[5] 装备页快捷图标（bottomRight-12 :40518） */
.sw-corner-equip { width: 26px; height: 26px; bottom: -6px; right: -42px; }
/* 移动端：负偏移把角标推出视口（360px 下仅 ~7px 可点），收进面板内缘 */
@media (max-width: 560px), (pointer: coarse) {
  .sw-corner-item { right: 4px; bottom: -34px; }
  .sw-corner-equip { width: 26px; height: 26px; bottom: -36px; right: 4px; }
}
.sw-npc-btns button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 5px 16px; cursor: pointer; font-family: inherit;
}
.sw-npc-btns button:hover { background: #4a5aa0; }
/* NPCChatPanel.cs:136-138 按钮通知图标(UI_quickicon1,文字右+8px;亮度脉冲
   sin(2πt)白↔半透=Utils.cs:448,rotMul=0 无摇摆) */
.sw-npc-btns button { position: relative; }
.sw-npc-excl { width: 6px; height: 16px; image-rendering: pixelated; margin-left: 8px;
  vertical-align: -3px; animation: sw-excl-pulse 1s linear infinite; }
@keyframes sw-excl-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.sw-npc-shop {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 520px; max-width: 94vw; z-index: 23; cursor: auto;
  pointer-events: auto; /* 同上:sw-root 穿透关闭,子面板须显式开启 */
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 12px 14px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-shop-title { text-align: center; color: #ffe8a0; font-size: 15px; margin-bottom: 8px; }
.sw-shop-coins { text-align: right; color: #ffd76e; font-size: 13px; margin-bottom: 6px; }
.sw-shop-medals { color: #f06478; margin-left: 8px; }   /* 勋章持有（CurrencyTextColor 240,100,120） */
/* SW-BJ22 2026-09-07 货架网格（Main.cs:42522-42532 10×4=40 格 0.755 缩放观感；
   空格 = 售卖放置区,光标持非币物左键整叠卖出 ItemSlot.cs:1435-1438/:1195-1212） */
.sw-shop-grid { display: grid; grid-template-columns: repeat(10, 42px); gap: 5px;
  justify-content: center; margin: 2px 0 6px; }
.sw-shop-item {
  position: relative; width: 42px; height: 42px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  cursor: pointer;
}
.sw-shop-item:hover { background: #3d4c8f; border-color: #6a80d0; }
.sw-shop-item.poor { opacity: 0.45; cursor: default; }
.sw-shop-item img { width: 30px; height: 30px; image-rendering: pixelated; }
.sw-shop-ph { width: 30px; height: 30px; display: inline-block; }
.sw-shop-stack { position: absolute; right: 2px; bottom: 0; font-size: 11px; color: #fff;
  text-shadow: 1px 1px 0 #000; pointer-events: none; }
.sw-shop-empty { width: 42px; height: 42px; background: #1a2140;
  border: 1px solid #2c3768; border-radius: 4px; }
.sw-shop-empty:hover { border-color: #4a5aa0; background: #20294e; }
.sw-shop-happy { display: flex; align-items: center; gap: 6px; margin-left: 10px;
  font-size: 13px; color: #e8e8f4; }
.sw-shop-happy.best { color: #7dff8a; }
.sw-shop-happy.good { color: #d7ffe0; }
.sw-shop-happy.ok { color: #ffe8a0; }
.sw-shop-happy.bad { color: #ff8a7d; }
.sw-happy-panel {
  position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%);
  width: 520px; max-width: 94vw; z-index: 23; cursor: auto;
  pointer-events: auto; /* 同 sw-npc-dialog：sw-root 穿透关闭，子面板须显式开启 */
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 12px 14px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-happy-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.sw-happy-title { color: #ffe8a0; font-size: 15px; flex: 1;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
.sw-happy-price { font-size: 15px; }
.sw-happy-price.best { color: #7dff8a; }
.sw-happy-price.good { color: #d7ffe0; }
.sw-happy-price.ok { color: #ffe8a0; }
.sw-happy-price.bad { color: #ff8a7d; }
.sw-happy-list { display: flex; flex-direction: column; gap: 6px; max-height: 40vh; overflow-y: auto;
  background: #1a2140; border: 1px solid #3a4680; border-radius: 4px; padding: 8px 10px; }
.sw-happy-line { font-size: 13px; line-height: 1.6; }
.sw-happy-line::before { content: "• "; color: #7d92d6; }
.sw-happy-foot { display: flex; justify-content: flex-end; margin-top: 10px; }
`;

/** 铜币计价格式化(原版 = Main.ValueToCoins,货币名走 Currency.* 官译;
 *  旧硬编码"金/银/铜"他语言不可译) */
export function formatCopper(v: number): string {
  return Lang.valueToCoins(v);
}

export class NpcDialog {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private parent: HTMLElement, private onButton: (id: NpcButtonId) => void,
    private onCornerItem?: (vid: number) => void) {
    if (!document.getElementById('sw-npc-style')) {
      const style = document.createElement('style');
      style.id = 'sw-npc-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  /** 打开对话框:name=NPC 名,chat=台词,buttons=选项(原版 Lang.inter 标签);
   *  cornerItem: >0=渔夫任务鱼角标(url/name 由 UI 注入) / -1=RequestHome 态 →
   *  DisplaySlots_5 快捷图标点击开背包(Main.cs:40516-40543) / 缺省不画 */
  open(name: string, chat: string, buttons: NpcButtonMeta[], portrait?: DialoguePortraitPayload | null,
    vanillaId?: number, corner?: { vid: number; url: string; name: string }) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-dialog';
    const btns = buttons.map((b) => `<button data-b="${b.id}">${b.label}${b.excl ? '<img class="sw-npc-excl" src="sprites/vanilla-ui/UI_quickicon1.png" alt="!" draggable="false">' : ''}</button>`).join('');
    // 头像(原版 Main.npcChatPortrait = Images/TownNPCs/Portraits/Portrait_<Name>，SetTalkNPC :4196;
    // 打开时 DoNPCPortraitHop 弹跳)——无头像类型(如骷髅商人外的野兽)原版也不显示。
    // ★原版画法（Main.cs DrawNPCPortrait :39745）：200×200 原尺寸画在圆形底框上、
    //  头部居中——贴图自带 ~50% 透明留白是圆框设计的一部分；本仓是矩形头像框，
    //  整图塞入头像只占一半 → 打开时 canvas 按 alpha 内容包围盒裁剪 + 等比铺满
    // 对话头像偏好（Main.DialoguePortraitPreference，IngameOptions.cs:823-836；
    // CycleNPCPortraitMode :39724 序 Detailed→CloseUp→FullBodyRetro→Disabled）：
    // Disabled=不画；CloseUp/FullBodyRetro 走 Profile/Retro 变体贴图——变体未
    // 导入，暂按 Detailed 现行画法渲染（登记：素材变体缺口）——2026-08-30 续批翻案：
    // CloseUp/Retro 两模式 = NPC 变体贴图行 0 dummy 直绘（Main.DrawNPCPortrait
    // :41075-41172：scale3+CloseUpOffsets / scale2+RetroOffsets，texture=
    // Profiles.GetTextureNPCShouldUse → townNpcProfileSheet），**不需要额外资产**，
    // 登记作废；三模式偏好 DialoguePortraitPreference(IngameOptions.cs:823-836)。
    const mode = options.data.dialoguePortraitMode;
    const portraitOn = !!portrait && !!portrait.url && mode !== 'disabled';
    const portraitHtml = portraitOn
      ? `<canvas class="sw-npc-portrait" width="152" height="184"></canvas>`
      : '';
    // 角落：>0=渔夫任务鱼(32 帽缩放 :40486-40492,悬停 tooltip :40514)；-1=RequestHome
    // 态 EquipPage[5] 快捷图标(bottomRight-12 :40518，悬停叠[7]金染 OurFavoriteColor
    // :40530-40539；点击=关对话+OpenInventory+EquipPageSelected=1)
    const cornerHtml = corner
      ? (corner.vid > 0
        ? `<img class="sw-corner-item" data-corner="${corner.vid}" src="${corner.url}" title="${corner.name}" alt="" draggable="false">`
        : `<img class="sw-corner-item sw-corner-equip" data-corner="-1" src="sprites/vanilla-ui/UI_DisplaySlots_5.png" alt="" draggable="false">`)
      : '';
    panel.innerHTML = `<div class="sw-npc-body">${portraitHtml}<div class="sw-npc-main">`
      + `<div class="sw-npc-name">${name}</div><div class="sw-npc-chat">${chat}${cornerHtml}</div>`
      + `<div class="sw-npc-btns">${btns}</div></div></div>`;
    // 金币条（TryAddCoins → ItemSlot.DrawMoney 画在该按钮左上 −45,−44 处
    // NPCChatPanel.cs:140-144——护士治疗费/税务官应收税款）绝对定位节点
    for (const b of buttons) {
      if ((b.coins ?? 0) <= 0) continue;
      const host = panel.querySelector(`button[data-b="${b.id}"]`);
      if (!host) continue;
      // 挂在按钮自身（button 已 position:relative）——曾插 .sw-npc-btns 容器：
      // flex abspos static-position=内容盒左上 ⇒ 永远落在最左按钮上方（审查 P1；
      // 原版 DrawMoney 锚定该按钮 −45,−44，NPCChatPanel.cs:140-144）
      const tag = document.createElement('span');
      tag.className = 'sw-npc-coins';
      tag.textContent = formatCopper(b.coins!);
      host.appendChild(tag);
    }
    // 渔夫任务鱼角标：点击把 [i:vid] 物品标签送进聊天输入框（AddChatText 等价；
    // 悬停改名已在 title 注入，:40498-40513 光标形变略）。-1 态=装备页快捷图标：
    // 悬停叠 DisplaySlots_7 金染、点击走 onCornerItem(-1)（UI 侧关对话+开背包）
    const cornerImg = panel.querySelector<HTMLImageElement>('img.sw-corner-item');
    if (cornerImg) {
      if (Number(cornerImg.dataset.corner) === -1) {
        cornerImg.title = Lang.text('UI.NPCHousing');
        cornerImg.addEventListener('mouseenter', () => { cornerImg.src = 'sprites/vanilla-ui/UI_DisplaySlots_7.png'; });
        cornerImg.addEventListener('mouseleave', () => { cornerImg.src = 'sprites/vanilla-ui/UI_DisplaySlots_5.png'; });
      }
      cornerImg.addEventListener('click', () => {
        UISfx.click();
        this.onCornerItem?.(Number(cornerImg.dataset.corner));
      });
    }
    panel.querySelectorAll('button').forEach((el) => {
      el.addEventListener('mouseenter', () => UISfx.hover());   // DrawButtons :157-161 悬停换行即响(12)
      el.addEventListener('click', () => {
        UISfx.click(); // 原版对话按钮 MenuTick(id 12)
        this.onButton((el as HTMLElement).dataset.b as NpcButtonId);
      });
    });
    this.parent.appendChild(panel);
    this.panel = panel;
    if (portraitOn) this.drawPortrait(panel.querySelector('canvas.sw-npc-portrait') as HTMLCanvasElement | null, portrait!);
    // Esc 优先序对齐 Player.cs:4960-5025 ToggleInv：talkNPC≥0 时 Esc 只关对话、
    // 不落背包/暂停链——捕获阶段拦截截胡其余 window 监听（main.ts Inventory 链）
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // ★聊天框开着时原版语义 = Esc 先收聊天（Player.cs chatMode 前置消费）——
        // 不让位则「点任务鱼插签→按 Esc」会关对话留聊天（审查 P1）
        if ((window as unknown as { __swGame?: { chatInput?: { isOpen?: boolean } } }).__swGame?.chatInput?.isOpen) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        this.onButton('close');
      }
    };
    window.addEventListener('keydown', this.escHandler, true);
  }

  /** 头像绘制三分支（DialoguePortraitPreference 序）：
   *  Detailed = Portrait 圆框图 alpha 包围盒 cover 铺满 76×92 框；
   *  CloseUp  = NPC 变体贴图行 0 ×3 直绘（Main.cs:41075-41103：dummy scale=3、
   *             宠物 num14=-20 特调 + CloseUpOffsets 表——本仓矩形框即天然 scissor，
   *             头部自然落上半区）；
   *  FullBodyRetro = 行 0 ×2 底对齐 + RetroOffsets 表（:41104-41123）。 */
  private drawPortrait(canvas: HTMLCanvasElement | null, payload: DialoguePortraitPayload): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mode = options.data.dialoguePortraitMode;
    // ---- CloseUp / FullBodyRetro：NPC 变体贴图直绘 ----
    if (mode === 'closeUp' || mode === 'fullBodyRetro') {
      const sheet = townNpcProfileSheet(payload.vanillaId, payload.shimmered ? 1 : 0,
        payload.altTexture ?? 0, payload.variationIndex ?? 0)
        ?? `vanilla/NPC_${payload.vanillaId}.png`;                    // 无 Profile 兜底(NPC_XX.png)
      const off = PORTRAIT_OFFSETS[mode][String(payload.vanillaId)] ?? [0, 0];
      const img = new Image();
      // 兜底：Profile 档缺失（解包缺口/未来新类型）→ NPC_<id> 竖条（行 0 全展，
        // 视觉近似 Retro 档）。★IMG-SELF-HEAL（2026-09-02 image-retry-audit 清偿）：
        // 面板一次性建绘，一次失败=整段对话缺头像（首访冷缓存窗口高危）——两段
        // URL 耗尽后按 1s/2s/4s 退避重试整链，TTL 10s 封顶（负缓存错误语义参照
        // ensureVImage TTL；超时后留空=与原版无资产不画同义）
      const urls = [sheet, `vanilla/NPC_${payload.vanillaId}.png`];
      const bornAt = Date.now();
      let seg = 0;
      let round = 0;
      const tryLoad = () => {
        img.onload = () => { paintSheet(); };
        img.onerror = () => {
          seg++;
          if (seg < urls.length) { img.src = `sprites/${urls[seg]}`; return; }
          const delay = 1000 * 2 ** round;
          round++;
          if (Date.now() - bornAt + delay <= 10_000) {
            setTimeout(() => { seg = 0; tryLoad(); }, delay);
          }
        };
        img.src = `sprites/${urls[seg]}`;
      };
      tryLoad();
      /** 行 0 直绘主体（onload 与兜底共用）：fh = 整条高/帧数
       *  （vanilla-npcs.json frames=Main.npcFrameCount） */
      const paintSheet = () => {
        const frames = VANILLA_NPCS[String(payload.vanillaId)]?.frames ?? 14;
        const fh = Math.max(1, Math.floor(img.naturalHeight / frames));
        const fw = img.naturalWidth;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (mode === 'closeUp') {
          const scale = 6;                                            // dummy scale3 × canvas2x
          const dw = fw * scale;
          const isPet = [637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684].includes(payload.vanillaId);
          const lift = isPet ? -20 : 16;                              // Main.cs num14 缺省 16 / 宠物 -20
          let x: number; let y: number;
          if (isPet) {
            // Main.cs:41088-41098 特支：num15 = -36+((96-fw)/2)/6*6（96 圆框−frameWidth
            // 按 texel 组取整再水平定位）——缺此支猫头整体偏左出框/狗只剩右 1/3（审查）。
            // 换算：num15 是 UI 轴偏移（×1），canvas=UI×2 ⇒ baseX=(152)+(num15*2)
            const n16 = Math.floor(Math.floor((96 - fw) / 2) / 6) * 6;
            const num15 = -36 + Math.floor(n16 / 6);
            x = (canvas.width - fw * scale) / 2 + num15 * 2 + off[0] * scale;
            y = canvas.height - fh * scale - lift * 2 + off[1] * scale;
          } else {
            x = (canvas.width - dw) / 2 + off[0] * scale;
            y = canvas.height - fh * scale + lift * 2 * 0.5 + off[1] * scale;
          }
          ctx.drawImage(img, 0, 0, fw, fh, x, y, fw * scale, fh * scale);
        } else {
          const scale = 4;                                            // dummy scale2 × canvas2x
          const dw = fw * scale;
          const x = (canvas.width - dw) / 2 + off[0] * scale;
          const y = canvas.height - fh * scale - 4 + off[1] * scale;
          ctx.drawImage(img, 0, 0, fw, fh, x, y, fw * scale, fh * scale);
        }
      };
      img.src = `sprites/${sheet}`;
      return;
    }
    // ---- Detailed：Portrait 圆框图 cover 铺满（含贴图自带透明留白裁剪）----
    const src = payload.url;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      // alpha 包围盒（贴图自带大透明留白）
      const probe = document.createElement('canvas');
      probe.width = img.naturalWidth; probe.height = img.naturalHeight;
      const pc = probe.getContext('2d', { willReadFrequently: true });
      if (!pc) return;
      pc.drawImage(img, 0, 0);
      let data: Uint8ClampedArray;
      try { data = pc.getImageData(0, 0, probe.width, probe.height).data; } catch { return; }
      let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1;
      for (let y = 0; y < probe.height; y++) {
        for (let x = 0; x < probe.width; x++) {
          if (data[(y * probe.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return;   // 全透明防御
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      ctx.imageSmoothingEnabled = false;
      // cover：等比放大铺满，居中裁溢出
      const scale = Math.max(canvas.width / bw, canvas.height / bh);
      const dw = bw * scale, dh = bh * scale;
      ctx.drawImage(img, minX, minY, bw, bh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    img.src = src;
  }

  close() {
    // ★capture 位必须对称（监听器身份含 capture——曾漏传=摘不掉=全局 Esc 被永久截胡：
    // 暂停/设置/聊天全哑到刷新页。审查 P0）
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler, true);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
  }

  get isOpen(): boolean { return this.panel !== null; }
}

export class NpcShop {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** onBuy(vanillaId, buybackIndex?, bulk?)：buybackIndex = 卖回货架条目（buyOnce）
   *  下标（ItemSlot.HandleShopSlot :1925-1928 减库存），缺省 = 常规货；bulk = Shift
   *  批量买 10（CanBulkBuy ItemSlot.cs:2874-2881 ShiftInUse + GetBulkBuyAmount :2861-2870） */
  constructor(private parent: HTMLElement,
    private onBuy: (vanillaId: number, buybackIndex?: number, bulk?: boolean) => void,
    private onClose: () => void,
    private onCellHover?: (hover: ShopCellHover, anchor: HTMLElement | null) => void) {}

  open(title: string, items: ShopEntry[], copper: number, happinessPct?: number | null, medals?: number, medalsTotal?: number) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-shop';
    // 支付能力判定按条目币种分流：勋章条目比勋章持有全量（medalsTotal = BuyItem
    // 门口计数五仓 CustomCurrencyManager.cs:76-87,背包+随身银行;缺省回落 medals
    // 兼容旧调用形），铜币条目比铜币。头部数值 medals = 储蓄面（DrawSavings
    // bank-only :28-40）——SW-FX17 两域分立
    const afford = (it: ShopEntry): boolean =>
      it.medal !== undefined ? (medalsTotal ?? medals ?? 0) >= it.medal : copper >= it.price;
    // ★SW-BJ22 2026-09-07 原版形制货架网格（Main.cs:42522-42532：10×4=40 格，
    //  空格同样以 InventoryBack 底框绘制并可命中——空格即「售卖放置区」，光标
    //  持非币物左键 = 整叠卖出 PickItemMovementAction case 15 ItemSlot.cs:1435-1438
    //  → LeftClick case 4 :1195-1212）。有货格按货架序占位（常规货 + 卖回架尾接，
    //  Chest.AddItemToShop :658-663 落首空位语义同序）；余格全画空格。
    //  旧「名称+价格」行列表 = 自创呈现且无售卖区（用户实报），整格替换。
    const cells: string[] = [];
    for (let i = 0; i < 40; i++) {
      const it = items[i];
      if (!it) {
        cells.push(`<div class="sw-shop-empty" data-slot="${i}"></div>`);
        continue;
      }
      const ok = afford(it);
      cells.push(`
      <div class="sw-shop-item${ok ? '' : ' poor'}" data-id="${it.vanillaId}"${it.buyback !== undefined ? ` data-bb="${it.buyback}"` : ''} data-ok="${ok ? 1 : 0}"${it.prefix ? ` data-prefix="${it.prefix}"` : ''}>
        ${it.iconUrl ? `<img src="${it.iconUrl}">` : '<span class="sw-shop-ph"></span>'}
        ${it.stack && it.stack > 1 ? `<span class="sw-shop-stack">${it.stack}</span>` : ''}
      </div>`);
    }
    // 快乐度头部指示已摘（2026-08-27 用户要求：商店标题旁不再显示快乐度系数——
    // 快乐度详情仍走底部「快乐度」页签；原版 Main.cs:41231-41243 参考备案）
    // 勋章储蓄并列显示（CustomCurrencyManager.DrawSavings :28-63：双货币店在
    //  钱币行旁画勋章图标+数量，【只】合计 bank..bank4 储蓄——背包勋章不进此行；
    //  仅本店有勋章条目时传值。★SW-FX17 值域修正：旧版传持有全量=背包+四仓混淆）
    const medalLine = medals !== undefined
      ? ` <span class="sw-shop-medals">🏅 ×${medals}</span>` : '';
    panel.innerHTML = `
      <div class="sw-shop-title">${title}</div>
      <div class="sw-shop-coins">${formatCopper(copper)}${medalLine}</div>
      <div class="sw-shop-grid">${cells.join('')}</div>`;
    // ★SW-FX32 刀①（2026-09-11）Set-Back 钮退役：原版 Main.cs:42500-42532 商店段
    //  全文无关闭钮——关店 = Esc / 对话「关闭」钮 / 走远（closeNpcDialog →
    //  npcShopClose Main.cs:18056-18064 等价面）。旧「Set-Back」钮=自创,撤。
    panel.querySelectorAll('.sw-shop-item').forEach((el) => {
      const cell = el as HTMLElement;
      cell.addEventListener('click', (ev) => {
        if (cell.dataset.ok !== '1') return;
        const bb = cell.dataset.bb;
        this.onBuy(Number(cell.dataset.id),
          bb !== undefined ? Number(bb) : undefined,
          (ev as MouseEvent).shiftKey || undefined);   // Shift+点 = 批量买 10
      });
      // 格位悬停 tooltip（MouseHover context 15 ItemSlot.cs:3170-3204 → Main.HoverItem
      //  → MouseText 全文 + AddShopLines 买入价行；价格取数走 Game 现值——重开刷新后
      //  闭包 entries 会陈旧，UI 侧回调现查 shopEntryPriceOf/shopBuybackPriceOf）
      if (this.onCellHover) {
        const bb = cell.dataset.bb;
        const prefix = cell.dataset.prefix;
        cell.addEventListener('mouseenter', () => this.onCellHover?.({
          vid: Number(cell.dataset.id),
          stack: 1,   // buyOnce 条目 EstimateDisplayStack=1（ItemSlot.cs:3155）、常规货架条目 stack 恒 1
          prefix: prefix !== undefined ? Number(prefix) : undefined,
          buyback: bb !== undefined ? Number(bb) : undefined,
        }, cell));
        cell.addEventListener('mouseleave', () => this.onCellHover?.(null, null));
      }
    });
    // Esc 关店（Player.cs:4960-5025 Esc 优先序——talkNPC 活跃时 Esc 只收对话链,
    //  对话关闭连带关店 closeNpcDialog → npcShopClose;此处 onClose 为浮面板直挂底）
    this.parent.appendChild(panel);
    this.panel = panel;
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.onClose(); };
    window.addEventListener('keydown', this.escHandler);
  }

  close() {
    // SW-BJ22：面板移除前收起格位 tooltip（Esc 关店时格上悬停态的气泡不残留）
    if (this.panel) this.onCellHover?.(null, null);
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
  }

  get isOpen(): boolean { return this.panel !== null; }

  /** 原地升级某商品行图标(开店时 iconUrl 一次成型的 miss 冻结问题,2026-08-13
   *  枚举 review):懒加载晚到由 UI 侧轮询驱动补图。无该行/已关店静默 */
  setRowIcon(vanillaId: number, url: string): void {
    const row = this.panel?.querySelector(`.sw-shop-item[data-id="${vanillaId}"]`);
    if (!row) return;
    const img = row.querySelector('img');
    if (img) { if (img.getAttribute('src') !== url) img.src = url; return; }
    const ph = row.querySelector('span');
    const el = document.createElement('img');
    el.src = url;
    if (ph && ph.tagName === 'SPAN') ph.replaceWith(el); else row.insertBefore(el, row.firstChild);
  }
}

/** NPC 快乐度详情浮层（ReportHappiness.Interact：NPCInteractions.cs:303-313）。
 *  原版点「快乐度」按钮后把 HappinessReport 整段写进 npcChatText + 头像弹跳；
 *  DOM 对话框台词区定高，此处等价为独立浮层逐条列出，并附价格倍率
 *  （Main.cs:41240 priceAdjustment.ToString("P0") 同口径）。 */
export class NpcHappinessPanel {
  private panel: HTMLElement | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private parent: HTMLElement, private onClose: () => void) {}

  open(info: HappinessInfo) {
    this.close();
    const face = happinessFace(info.priceMul);
    const panel = document.createElement('div');
    panel.className = 'sw-happy-panel';
    const rows = (info.lines.length ? info.lines : ['—'])
      .map((t) => `<div class="sw-happy-line">${t}</div>`).join('');
    panel.innerHTML = `
      <div class="sw-happy-head">
        <div class="sw-happy-title">${info.name}</div>
        <span class="sw-happy-price ${face.cls}">${face.face} ${happinessPct(info.priceMul)}</span>
      </div>
      <div class="sw-happy-list">${rows}</div>
      <div class="sw-happy-foot"><button class="sw-happy-close" style="background:#3a4680;color:#e8e8f4;border:1px solid #7d92d6;border-radius:4px;padding:5px 16px;cursor:pointer;font-family:inherit;">${Lang.inter(52)}</button></div>`;
    (panel.querySelector('.sw-happy-close') as HTMLElement).addEventListener('click', () => this.close());
    this.parent.appendChild(panel);
    this.panel = panel;
    // 捕获阶段拦截 Esc：只关浮层，不连带关掉背后的对话框
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.stopImmediatePropagation(); this.close(); }
    };
    window.addEventListener('keydown', this.escHandler, true);
  }

  close() {
    const had = this.panel !== null;   // 重开（open 首行 close）不触发回调
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler, true);
    this.escHandler = null;
    this.panel?.remove();
    this.panel = null;
    if (had) this.onClose();
  }

  get isOpen(): boolean { return this.panel !== null; }
}

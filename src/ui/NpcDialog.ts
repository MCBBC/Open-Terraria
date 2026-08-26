// 原版 NPC 对话 UI(DOM 版):对话框(NPC 名 + 台词 + 选项按钮)+ 商店面板。
// 对照 1456:Player.SetTalkNPC(Player.cs:4180)→ Main.npcChatText/Main.DrawNPCChat;
// 按钮标签 = Lang.inter[](LegacyInterface):28 商店 / 52 关闭 / 54 治疗 / 50 诅咒。
// 台词与商店内容在 Game 侧生成(NPC.GetChat / Chest.SetupShop 1:1),本文件纯渲染。
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';
import { options } from '../core/Options';
export type NpcButtonId = 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'hair' | 'quest' | 'plant' | 'happiness' | 'status' | 'close';

/** 心情报告条目（Game 侧已做 l10n 渲染的成品文案 + 价格乘子） */
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
  iconUrl: string | null;
}

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
.sw-npc-chat { font-size: 14px; line-height: 1.6; color: #e8e8f4; min-height: 44px; }
.sw-npc-btns { display: flex; gap: 8px; margin-top: 8px; }
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
.sw-shop-list { display: flex; flex-direction: column; gap: 4px; max-height: 50vh; overflow-y: auto; }
.sw-shop-item {
  display: flex; align-items: center; gap: 10px; padding: 5px 8px;
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  cursor: pointer; font-size: 13px;
}
.sw-shop-item:hover { background: #4a5aa0; }
.sw-shop-item.poor { opacity: 0.45; cursor: default; }
.sw-shop-item img { width: 26px; height: 26px; image-rendering: pixelated; }
.sw-shop-item .nm { flex: 1; }
.sw-shop-item .pr { color: #ffd76e; }
.sw-shop-foot { display: flex; justify-content: flex-end; margin-top: 10px; }
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

  constructor(private parent: HTMLElement, private onButton: (id: NpcButtonId) => void) {
    if (!document.getElementById('sw-npc-style')) {
      const style = document.createElement('style');
      style.id = 'sw-npc-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  /** 打开对话框:name=NPC 名,chat=台词,buttons=选项(原版 Lang.inter 标签) */
  open(name: string, chat: string, buttons: Array<{ id: NpcButtonId; label: string }>, portrait?: string | null) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-dialog';
    const btns = buttons.map((b) => `<button data-b="${b.id}">${b.label}${(b as { excl?: boolean }).excl ? '<img class="sw-npc-excl" src="sprites/vanilla-ui/UI_quickicon1.png" alt="!" draggable="false">' : ''}</button>`).join('');
    // 头像(原版 Main.npcChatPortrait = Images/TownNPCs/Portraits/Portrait_<Name>，SetTalkNPC :4196;
    // 打开时 DoNPCPortraitHop 弹跳)——无头像类型(如骷髅商人外的野兽)原版也不显示。
    // ★原版画法（Main.cs DrawNPCPortrait :39745）：200×200 原尺寸画在圆形底框上、
    //  头部居中——贴图自带 ~50% 透明留白是圆框设计的一部分；本仓是矩形头像框，
    //  整图塞入头像只占一半 → 打开时 canvas 按 alpha 内容包围盒裁剪 + 等比铺满
    // 对话头像偏好（Main.DialoguePortraitPreference，IngameOptions.cs:823-836；
    // CycleNPCPortraitMode :39724 序 Detailed→CloseUp→FullBodyRetro→Disabled）：
    // Disabled=不画；CloseUp/FullBodyRetro 走 Profile/Retro 变体贴图——变体未
    // 导入，暂按 Detailed 现行画法渲染（登记：素材变体缺口）
    const portraitOn = !!portrait && options.data.dialoguePortraitMode !== 'disabled';
    const portraitHtml = portraitOn
      ? `<canvas class="sw-npc-portrait" width="152" height="184"></canvas>`
      : '';
    panel.innerHTML = `<div class="sw-npc-body">${portraitHtml}<div class="sw-npc-main">`
      + `<div class="sw-npc-name">${name}</div><div class="sw-npc-chat">${chat}</div>`
      + `<div class="sw-npc-btns">${btns}</div></div></div>`;
    panel.querySelectorAll('button').forEach((el) => {
      el.addEventListener('click', () => {
        UISfx.click(); // 原版对话按钮 MenuTick(id 12)
        this.onButton((el as HTMLElement).dataset.b as NpcButtonId);
      });
    });
    this.parent.appendChild(panel);
    this.panel = panel;
    if (portraitOn) this.drawPortrait(panel.querySelector('canvas.sw-npc-portrait') as HTMLCanvasElement | null, portrait!);
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.onButton('close'); };
    window.addEventListener('keydown', this.escHandler);
  }

  /** 头像裁剪填充：alpha 包围盒 → cover 式铺满 76×92 框（canvas 2× 抗糊，pixelated） */
  private drawPortrait(canvas: HTMLCanvasElement | null, src: string): void {
    if (!canvas) return;
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
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      // cover：等比放大铺满，居中裁溢出
      const scale = Math.max(canvas.width / bw, canvas.height / bh);
      const dw = bw * scale, dh = bh * scale;
      ctx.drawImage(img, minX, minY, bw, bh,
        (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    img.src = src;
  }

  close() {
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
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
    private onClose: () => void) {}

  open(title: string, items: ShopEntry[], copper: number, happinessPct?: number | null, medals?: number) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-shop';
    // 支付能力判定按条目币种分流：勋章条目比勋章持有（medals），铜币条目比铜币
    const afford = (it: ShopEntry): boolean =>
      it.medal !== undefined ? (medals ?? 0) >= it.medal : copper >= it.price;
    const rows = items.map((it) => `
      <div class="sw-shop-item${afford(it) ? '' : ' poor'}" data-id="${it.vanillaId}"${it.buyback !== undefined ? ` data-bb="${it.buyback}"` : ''} data-ok="${afford(it) ? 1 : 0}">
        ${it.iconUrl ? `<img src="${it.iconUrl}">` : '<span style="width:26px;height:26px;display:inline-block"></span>'}
        <span class="nm">${it.name}</span><span class="pr">${it.medal !== undefined ? medalPriceText(it.medal) : formatCopper(it.price)}</span>
      </div>`).join('');
    // 快乐度表情 + 价格百分比（Main.cs:41231-41243 商店标题旁 NPCHappiness 贴图 +
    //  priceAdjustment.ToString("P0")；DOM 版用表情档位代替贴图帧）
    const happy = happinessPct != null
      ? `<span class="sw-shop-happy ${happinessFace(happinessPct).cls}">${happinessFace(happinessPct).face} ${happinessPct}</span>`
      : '';
    // 勋章持有并列显示（CustomCurrencyManager.DrawSavings :28-63：双货币店在
    //  钱币行旁画勋章图标+数量；仅本店有勋章条目时传值）
    const medalLine = medals !== undefined
      ? ` <span class="sw-shop-medals">🏅 ×${medals}</span>` : '';
    panel.innerHTML = `
      <div class="sw-shop-title">${title}${happy}</div>
      <div class="sw-shop-coins">${formatCopper(copper)}${medalLine}</div>
      <div class="sw-shop-list">${rows}</div>
      <div class="sw-shop-foot"><button class="sw-set-back" style="background:#3a4680;color:#e8e8f4;border:1px solid #7d92d6;border-radius:4px;padding:5px 16px;cursor:pointer;font-family:inherit;">${Lang.inter(52)}</button></div>`;
    panel.querySelectorAll('.sw-shop-item').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if ((el as HTMLElement).dataset.ok !== '1') return;
        const bb = (el as HTMLElement).dataset.bb;
        this.onBuy(Number((el as HTMLElement).dataset.id),
          bb !== undefined ? Number(bb) : undefined,
          (ev as MouseEvent).shiftKey || undefined);   // Shift+点 = 批量买 10
      });
    });
    (panel.querySelector('.sw-set-back') as HTMLElement).addEventListener('click', () => this.onClose());
    this.parent.appendChild(panel);
    this.panel = panel;
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.onClose(); };
    window.addEventListener('keydown', this.escHandler);
  }

  close() {
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

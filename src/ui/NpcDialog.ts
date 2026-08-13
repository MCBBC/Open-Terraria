// 原版 NPC 对话 UI(DOM 版):对话框(NPC 名 + 台词 + 选项按钮)+ 商店面板。
// 对照 1456:Player.SetTalkNPC(Player.cs:4180)→ Main.npcChatText/Main.DrawNPCChat;
// 按钮标签 = Lang.inter[](LegacyInterface):28 商店 / 52 关闭 / 54 治疗 / 50 诅咒。
// 台词与商店内容在 Game 侧生成(NPC.GetChat / Chest.SetupShop 1:1),本文件纯渲染。
import { Lang } from '../i18n/Lang';
import { UISfx } from '../vui/UISfx';
export type NpcButtonId = 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'quest' | 'close';

export interface ShopEntry {
  /** 本仓库 item key(vi_ 系) */
  key: string;
  /** 原版 item id(图标) */
  vanillaId: number;
  name: string;
  /** 铜币计价(item.value) */
  price: number;
  iconUrl: string | null;
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
`;

/** 铜币计价格式化(原版 tooltip:金/银/铜) */
export function formatCopper(v: number): string {
  const gold = Math.floor(v / 10000);
  const silver = Math.floor((v % 10000) / 100);
  const copper = v % 100;
  let s = '';
  if (gold) s += `${gold}金`;
  if (silver) s += `${silver}银`;
  if (copper || !s) s += `${copper}铜`;
  return s;
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
    const btns = buttons.map((b) => `<button data-b="${b.id}">${b.label}</button>`).join('');
    // 头像(原版 Main.npcChatPortrait = Images/TownNPCs/Portraits/Portrait_<Name>，SetTalkNPC :4196;
    // 打开时 DoNPCPortraitHop 弹跳)——无头像类型(如骷髅商人外的野兽)原版也不显示
    const portraitHtml = portrait
      ? `<img class="sw-npc-portrait" src="${portrait}">`
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
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.onButton('close'); };
    window.addEventListener('keydown', this.escHandler);
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

  constructor(private parent: HTMLElement, private onBuy: (vanillaId: number) => void, private onClose: () => void) {}

  open(title: string, items: ShopEntry[], copper: number) {
    this.close();
    const panel = document.createElement('div');
    panel.className = 'sw-npc-shop';
    const rows = items.map((it) => `
      <div class="sw-shop-item${copper < it.price ? ' poor' : ''}" data-id="${it.vanillaId}" data-ok="${copper >= it.price ? 1 : 0}">
        ${it.iconUrl ? `<img src="${it.iconUrl}">` : '<span style="width:26px;height:26px;display:inline-block"></span>'}
        <span class="nm">${it.name}</span><span class="pr">${formatCopper(it.price)}</span>
      </div>`).join('');
    panel.innerHTML = `
      <div class="sw-shop-title">${title}</div>
      <div class="sw-shop-coins">${formatCopper(copper)}</div>
      <div class="sw-shop-list">${rows}</div>
      <div class="sw-shop-foot"><button class="sw-set-back" style="background:#3a4680;color:#e8e8f4;border:1px solid #7d92d6;border-radius:4px;padding:5px 16px;cursor:pointer;font-family:inherit;">${Lang.inter(52)}</button></div>`;
    panel.querySelectorAll('.sw-shop-item').forEach((el) => {
      el.addEventListener('click', () => {
        if ((el as HTMLElement).dataset.ok !== '1') return;
        this.onBuy(Number((el as HTMLElement).dataset.id));
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
}

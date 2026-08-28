// 聊天输入框（原版 Enter 开聊语义：Main.cs 输入态 + LegacyChatMonitor 配套）。
// DOM 底部左侧半透明输入条（项目 DOM UI 范式,同 MultiplayerSelect）;仅联机态启用。
// 频道：Tab 切换 房间(默认)/世界(跨房全服,服务器 v8 尾部 channel 字节)。
// 键序：Enter 开/发送,Escape 关,Tab 切频道,↑/↓ 翻发送历史(S 级;本仓自增,
// 原版无聊天历史);点击面板外(blur)关闭。
// ★ Input.keydown 对 INPUT 元素打字自动豁免游戏键位——输入期不触发跳跃等。
import { Lang } from '../i18n/Lang';

export interface ChatInputOpts {
  /** 发送（text 非空;world=true 世界频道） */
  onSend: (text: string, world: boolean) => void;
}

/** 发送历史上限（环形;S 级聊天历史） */
const HISTORY_MAX = 50;

export class ChatInput {
  private root: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private tag: HTMLSpanElement | null = null;
  private world = false;
  private readonly onSend: ChatInputOpts['onSend'];
  /** 发送历史（新在尾）;histIdx = -1 表示未在历史中（正在打字） */
  private history: string[] = [];
  private histIdx = -1;
  /** 进入历史浏览前正在编辑的草稿（Down 回到底部时恢复,shell 惯例） */
  private draft = '';

  constructor(opts: ChatInputOpts) {
    this.onSend = opts.onSend;
  }

  get isOpen() { return this.root !== null; }

  /** 重开抑制窗（发送的 Enter 关框后,同一次按键风暴不应立刻重开——双端 Enter 语义） */
  private suppressOpenUntil = 0;
  /** 窗口捕获键监听（开着期间挂在 window capture——不依赖输入框焦点,
   *  消灭焦点目标类玄学;close 时摘除） */
  private winKey: ((e: KeyboardEvent) => void) | null = null;

  open() {
    if (this.root) { this.input?.focus(); return; }
    if (Date.now() < this.suppressOpenUntil) return;
    const root = document.createElement('div');
    root.className = 'sw-chatbox';   // Input mousedown 不穿透门（body 直挂件不在 .sw-root 内）
    root.style.cssText = 'position:fixed;left:12px;bottom:64px;z-index:60;display:flex;gap:6px;align-items:center;'
      + 'background:rgba(20,24,38,0.82);border:1px solid rgba(255,220,120,0.35);border-radius:4px;padding:4px 8px;'
      + 'font:13px ui-monospace,monospace;color:#e8e4d8;';
    const tag = document.createElement('span');
    tag.style.cssText = 'color:#ffd76e;white-space:nowrap;';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 200;   // 服务器 200 字符上限（room.ts Text case 同值）
    input.style.cssText = 'background:transparent;border:none;outline:none;color:#fff;width:340px;font:inherit;';
    root.appendChild(tag);
    root.appendChild(input);
    document.body.appendChild(root);
    this.root = root;
    this.input = input;
    this.tag = tag;
    this.refreshTag();
    input.focus();
    this.winKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        const text = input.value.trim();
        const world = this.world;
        this.close(true);
        // 发送历史（S 级）：非空入列,连续重复不堆叠
        if (text && this.history[this.history.length - 1] !== text) {
          this.history.push(text);
          if (this.history.length > HISTORY_MAX) this.history.shift();
        }
        this.histIdx = -1;
        // 发送链走 window 活实例（与 onSend 同义——双路径等价,均经服务器收达验证）
        const g = (window as unknown as { __swGame?: { sendChat?: (t: string, w: boolean) => void } }).__swGame;
        if (text) g?.sendChat?.(text, world);
      } else if (e.code === 'ArrowUp' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.history.length) return;
        if (this.histIdx === -1) {
          this.draft = input.value;                      // 存草稿
          this.histIdx = this.history.length - 1;
        } else if (this.histIdx > 0) this.histIdx--;
        input.value = this.history[this.histIdx] ?? '';
      } else if (e.code === 'ArrowDown' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        if (this.histIdx === -1) return;
        this.histIdx++;
        if (this.histIdx >= this.history.length) {       // 越过最新 → 回草稿
          this.histIdx = -1;
          input.value = this.draft;
        } else {
          input.value = this.history[this.histIdx] ?? '';
        }
      } else if (e.code === 'Escape' && !e.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.world = !this.world;
        this.refreshTag();
      }
    };
    window.addEventListener('keydown', this.winKey, true);
    input.addEventListener('blur', () => { this.close(); });
  }

  private refreshTag() {
    if (!this.tag) return;
    this.tag.textContent = this.world
      ? `[${Lang.text('Mods.SandboxWorld.Chat.ChannelWorld')}]`
      : `[${Lang.text('Mods.SandboxWorld.Chat.ChannelRoom')}]`;
    this.tag.style.color = this.world ? '#ffd76e' : '#9fd8ff';
  }

  /** @param byKey 键盘关闭（Enter/Esc）——置 300ms 重开抑制（防发送键残留事件重开） */
  close(byKey = false) {
    if (!this.root) return;
    if (byKey) this.suppressOpenUntil = Date.now() + 300;
    if (this.winKey) { window.removeEventListener('keydown', this.winKey, true); this.winKey = null; }
    this.root.remove();
    this.root = null;
    this.input = null;
    this.tag = null;
    this.world = false;
  }
}

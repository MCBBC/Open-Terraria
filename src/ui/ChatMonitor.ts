// 原版左下角消息列(DOM 实现),1:1 对照 Terarria1457:
//   Terraria.GameContent.UI.Chat/RemadeChatMonitor.cs(500 条环形池/滚动窗口)
//   + Terraria.UI.Chat/ChatMessageContainer.cs(600 tick 显示期)
//   + Terraria/Main.cs:17460(chatMonitor.Update 每拍)/41706(DrawChat(drawingPlayerChat))
//     /18497-18501(关框 ResetOffset)/18502-18514(开框 ↑↓=Offset 每拍 ±1 行)
//     /49030-49033(退世界 Clear)
// 语义(★BJ680 重写;旧「单点 10 行浮层+10s 整行删」注释作废——消息本体不再删):
//   - 池:AddNewMessage Insert(0) 头插,环形上限 500 条(MaxMessages :13,超限尾删)
//     ——消息【永不按时间删除】,池常驻;时间只淘汰「关框态的显示」,不淘汰数据
//   - 显示期:每条 timeLeft=600 拍(ChatMessageContainer.cs:33),Update 每拍 -1
//     (:45-52);只有「聊天框关闭」态才按 timeLeft>0 淘汰显示
//     (CanBeShownWhenChatIsClosed :23);框开着(drawingPlayerChat)时忽略 timeLeft
//     全量可显示(DrawChat :79 门 `drawingPlayerChat | CanBeShownWhenChatIsClosed`)
//   - 窗口:showCount=10 视觉行(:25;折行消息按折行行数计,LineCount=容器行数)。
//     最新在底、旧行向上;↑=Offset(+1) 向更旧滚、↓=Offset(-1)(Main.cs:18505-18513,
//     keyState 每拍 1 行=长按 60 行/s);关框 ResetOffset 归 0(:18499,关框期恒 0)
//   - 绘制:x=88,自底向上第 i 行 top=screenHeight-30-28-i*22(:84 num5*22)——
//     行高 22、最新行【顶】锚 58px;DOM 等价:line-height 22px + 容器 bottom:36px
//     (=58-22,行底 36px 正落在原版输入底板 TextBack 顶 y=h-36 上沿)
//   - 消息颜色 = ChatColors.cs 五色;文字内联色标签 [c/RRGGBB:text](ColorTagHandler)
// 已知偏差(登记债,BJ680):
//   - snippet 悬停/点击(DrawChat :99-108 链接 snippet)——本仓无链接 snippet 面,不做
//   - 折行宽:原版缺省 ChatLineWidthLimit=screenWidth/UIScale-320(Main.cs:2921)动态;
//     本仓 DOM 沿用既有固定 640px(max-width)——折行数随之固定,不随 resize 重折
//     (原版 OnWidthLimitChanged 重折仅对 widthLimit==-1 条目,本仓 640 恒定=永不触发)

/** 池内一条消息(=ChatMessageContainer 数据面;lineCount=折行后视觉行数) */
export interface ChatEntryData {
  text: string;
  r: number;
  g: number;
  b: number;
  /** NewTextMultiline WidthLimit(px,-1=缺省 640) */
  width: number;
  /** 显示期剩余 tick(SetContents=600;关框态显示门 timeLeft>0) */
  timeLeft: number;
  /** 折行行数(LineCount;DOM 量测注入,缺省 1) */
  lineCount: number;
}

/** 窗口内一段连续行(同一消息的 [from,to] 行区间,含两端;读序 0=消息首行) */
export interface ChatWindowSpan {
  /** entries 下标(0=最新) */
  idx: number;
  from: number;
  to: number;
}

/** RemadeChatMonitor 纯逻辑核(DOM 无关,可单测):500 池/时间面/偏移钳制/窗口走查 */
export class ChatHistoryModel {
  /** MaxMessages(RemadeChatMonitor.cs:13) */
  static readonly MAX_MESSAGES = 500;
  /** _showCount(:25) */
  static readonly SHOW_COUNT = 10;
  /** 显示期 600 tick(ChatMessageContainer.cs:33;60Hz=10s) */
  static readonly SHOW_TICKS = 600;

  /** 新在下标 0(Insert(0) 头插,:47) */
  readonly entries: ChatEntryData[] = [];
  /** _startChatLine(窗口底行离开最新端的行数;↑ 增=看更旧) */
  private startChatLine = 0;

  /** AddNewMessage(:40-53):头插 + 环形尾删;lineCount 由视图量测注入 */
  addNewMessage(text: string, r: number, g: number, b: number, width: number, lineCount = 1): void {
    this.entries.unshift({
      text, r, g, b, width,
      timeLeft: ChatHistoryModel.SHOW_TICKS,
      lineCount: Math.max(1, lineCount),
    });
    while (this.entries.length > ChatHistoryModel.MAX_MESSAGES) {
      this.entries.pop();          // RemoveAt(Count-1) :48-51
    }
  }

  get offsetLine(): number { return this.startChatLine; }

  /** 全池总行数(ClampMessageIndex 走查上界) */
  totalLineCount(): number {
    let n = 0;
    for (const e of this.entries) n += e.lineCount;
    return n;
  }

  /** Offset(:132-135):行级偏移 + 钳制(↑=正=向更旧) */
  offset(linesOffset: number): void {
    this.startChatLine += linesOffset;
    this.clampMessageIndex();
  }

  /** ResetOffset(:177-180) */
  resetOffset(): void {
    this.startChatLine = 0;
  }

  /** ClampMessageIndex(:138-175)闭式等价:上界=总行数-showCount(不足一窗=0),下界 0 */
  private clampMessageIndex(): void {
    const maxStart = Math.max(0, this.totalLineCount() - ChatHistoryModel.SHOW_COUNT);
    if (this.startChatLine > maxStart) this.startChatLine = maxStart;
    if (this.startChatLine < 0) this.startChatLine = 0;
  }

  /** chatMonitor.Update(:17460 → ChatMessageContainer.Update :45-52):每条 -1、地板 0。
   *  @returns 本拍是否有条目跨过显示期终点(>0 → 0;关框态需重渲染) */
  tick(): boolean {
    let crossed = false;
    for (const e of this.entries) {
      if (e.timeLeft > 0) {
        e.timeLeft--;
        if (e.timeLeft === 0) crossed = true;
      }
    }
    return crossed;
  }

  /** 是否还有未超时条目(全 0 后驱动器可停摆;新消息再启动) */
  hasLiveTime(): boolean {
    for (const e of this.entries) if (e.timeLeft > 0) return true;
    return false;
  }

  /** DrawChat(:55-98)窗口走查。返回序=从窗口底行(最新侧)向更旧——DOM 渲染需倒序
   *  append(顶=窗口最旧行)。chatOpen=drawingPlayerChat;关框态遇首条超时即断
   *  (:79 break;新在头+统一递减 ⇒ 首超时=更旧全超时,断=滤等价)。 */
  visibleWindowSpans(chatOpen: boolean): ChatWindowSpan[] {
    const out: ChatWindowSpan[] = [];
    const n = this.entries.length;
    // 走查①:跳过 startChatLine 行定位窗口底行(:60-70)
    let skip = this.startChatLine, m = 0, l = 0;
    while (skip > 0 && m < n) {
      const lc = this.entries[m].lineCount;
      const take = Math.min(skip, lc);
      skip -= take; l += take;
      if (l === lc) { l = 0; m++; }
    }
    // 走查②:自窗口底行起最多画 showCount 行(:76-98)
    let rows = 0;
    while (rows < ChatHistoryModel.SHOW_COUNT && m < n) {
      const e = this.entries[m];
      if (!(chatOpen || e.timeLeft > 0)) break;   // :79 显示门(关框态)
      const from = l;
      const to = Math.min(l + (ChatHistoryModel.SHOW_COUNT - rows), e.lineCount) - 1;
      out.push({ idx: m, from, to });
      rows += to - from + 1;
      l = 0; m++;                                  // :93-97 行尽转下一条(部分窗=截于 to)
    }
    return out;
  }

  /** Clear(:111-114) */
  clear(): void {
    this.entries.length = 0;
    this.startChatLine = 0;
  }
}

/** 视图(DOM):折行量测 + 窗口渲染 + 60Hz 显示期驱动 + ChatInput 开合/滚动联动。
 *  联动通道=window CustomEvent(sw-ach-toggle 同范式):
 *    'sw-chat-toggle' {open:boolean}(ChatInput 开/关框)
 *    'sw-chat-scroll' {delta:+1|-1}(开框态 ↑/↓) */
export class ChatMonitor {
  private model = new ChatHistoryModel();
  private open = false;             // drawingPlayerChat
  private root: HTMLElement;
  /** 离屏折行量测器(与 .sw-chat 同排版上下文;scrollHeight/22=行数) */
  private measurer: HTMLElement;

  private static readonly LINE_H = 22;       // 行高/行距(Main.cs:84 num5*22)
  private static readonly TICK_MS = 1000 / 60;   // Main.Update 60Hz
  private rafId = 0;
  private lastRaf = 0;
  private accMs = 0;

  private onToggle: ((e: Event) => void) | null = null;
  private onScroll: ((e: Event) => void) | null = null;

  constructor(parent: HTMLElement, private playTick?: () => void) {
    if (!document.getElementById('sw-chat-style')) {
      const style = document.createElement('style');
      style.id = 'sw-chat-style';
      style.textContent = `
.sw-chat, .sw-chat-measure {
  max-width: 640px;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
}
.sw-chat {
  position: fixed; left: 88px; bottom: 36px; z-index: 15;
  display: flex; flex-direction: column; align-items: flex-start;
  pointer-events: none;
}
.sw-chat-measure {
  position: fixed; left: -9999px; top: 0; visibility: hidden;
  pointer-events: none; display: block;
}
.sw-chat-line {
  line-height: 22px; font-size: 14px; white-space: pre-wrap;
  text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000,
    2px 2px 0 rgba(0,0,0,.7);
}
`;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'sw-chat';
    parent.appendChild(this.root);
    this.measurer = document.createElement('div');
    this.measurer.className = 'sw-chat-measure';
    parent.appendChild(this.measurer);
    // ChatInput 开合/滚动联动(sw-ach-toggle 同范式;clear() 摘除)
    if (typeof window !== 'undefined') {
      this.onToggle = (e: Event) => {
        this.setOpen(!!(e as CustomEvent).detail?.open);
      };
      this.onScroll = (e: Event) => {
        this.offsetLines((e as CustomEvent).detail?.delta ?? 0);
      };
      window.addEventListener('sw-chat-toggle', this.onToggle);
      window.addEventListener('sw-chat-scroll', this.onScroll);
    }
    // 字体晚到重折行(原版无此事件=预载;本仓 webfont 异步——量测一次,廉价对齐)
    if (typeof document !== 'undefined') {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      fonts?.ready
        .then(() => { if (this.root.isConnected) { this.remeasureAll(); this.render(); } })
        .catch(() => { });
    }
  }

  /** Main.NewText(text, R, G, B) → AddNewMessage;width=-1 缺省 640。 */
  message(text: string, r = 255, g = 255, b = 255, width = -1): void {
    const lineCount = this.measureLines(text, width);
    this.model.addNewMessage(text, r, g, b, width, lineCount);
    this.render();
    this.ensureTicker();
    this.playTick?.();
  }

  /** 开框态(drawingPlayerChat):true=历史窗全量可显示;false=关框+ResetOffset
   *  (Main.cs:18497-18501 关框期每拍 ResetOffset,幂等=关框一次归零等价) */
  setOpen(open: boolean): void {
    this.open = open;
    if (!open) this.model.resetOffset();
    this.render();
  }

  /** ↑/↓ 滚动(Offset ±1 行;Main.cs:18505-18513,长按 60 行/s 由 ChatInput 驱动) */
  offsetLines(delta: number): void {
    if (!delta) return;
    this.model.offset(delta);
    this.render();
  }

  /** 显示期一拍(Main.Update→chatMonitor.Update:17460)。@returns 是否有跨期(测试面) */
  tick(): boolean {
    const crossed = this.model.tick();
    if (crossed && !this.open) this.render();   // 开框态忽略 timeLeft,无视觉变化
    return crossed;
  }

  /** 离屏量测折行行数(scrollHeight/22;无布局环境回退 1) */
  private measureLines(text: string, width: number): number {
    const node = this.buildLineNode(text, 255, 255, 255, width);
    this.measurer.appendChild(node);
    const h = node.scrollHeight;
    node.remove();
    return Math.max(1, Math.round(h / ChatMonitor.LINE_H));
  }

  /** 字体加载后重折行(仅 width==-1 条目;OnWidthLimitChanged :37-43 同域) */
  private remeasureAll(): void {
    let changed = false;
    for (const e of this.model.entries) {
      if (e.width !== -1) continue;
      const lc = this.measureLines(e.text, e.width);
      if (lc !== e.lineCount) { e.lineCount = lc; changed = true; }
    }
    if (changed) this.render();
  }

  /** 窗口渲染(状态变化驱动,非每帧):spans 倒序 append(顶=窗口最旧行);
   *  窗口切进消息中部=定高裁剪(outer 高 N*22 + inner 上移 from*22——
   *  DrawChat 逐行绘制的行级窗口语义,DOM 等价) */
  private render(): void {
    const spans = this.model.visibleWindowSpans(this.open);
    this.root.replaceChildren();
    for (let i = spans.length - 1; i >= 0; i--) {
      const s = spans[i];
      const e = this.model.entries[s.idx];
      const node = this.buildLineNode(e.text, e.r, e.g, e.b, e.width);
      if (s.from === 0 && s.to === e.lineCount - 1) {
        this.root.appendChild(node);
        continue;
      }
      const clip = document.createElement('div');
      clip.style.height = `${(s.to - s.from + 1) * ChatMonitor.LINE_H}px`;
      clip.style.overflow = 'hidden';
      const inner = document.createElement('div');
      inner.style.marginTop = `${-s.from * ChatMonitor.LINE_H}px`;
      inner.appendChild(node);
      clip.appendChild(inner);
      this.root.appendChild(clip);
    }
  }

  /** 文字内联色标签 [c/RRGGBB:text](ColorTagHandler——/boss伤害 报告的本人行
   *  [c/FFAF00:] 高亮):无标签走 textContent 快路径,有标签解析为着色 span */
  private buildLineNode(text: string, r: number, g: number, b: number, width: number): HTMLDivElement {
    const line = document.createElement('div');
    line.className = 'sw-chat-line';
    line.style.color = `rgb(${r},${g},${b})`;
    if (width > 0) line.style.maxWidth = `${width}px`;
    if (text.includes('[c/')) {
      // [c/hex:内容] → span#FFAF00;其余原样(未知标签按字面保留,同原版 chat tag 解析)
      const re = /\[c\/([0-9A-Fa-f]{6}):((?:[^\[\]]|\[[^c][^\]]*\])*)\]/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) line.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.style.color = `#${m[1]}`;
        span.textContent = m[2];
        line.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) line.appendChild(document.createTextNode(text.slice(last)));
    } else {
      line.textContent = text;
    }
    return line;
  }

  /** 显示期驱动:rAF 固定步长 60Hz(原版 Main.Update 每拍;后台大步长钳 250ms)。
   *  全池超时/空池停摆(timeLeft 全 0 后递减为 no-op)——新消息 ensureTicker 重启。 */
  private ensureTicker(): void {
    if (this.rafId || typeof requestAnimationFrame !== 'function') return;
    if (!this.model.hasLiveTime()) return;   // 全超时/空池:递减已无作用(新消息重启)
    this.lastRaf = 0;
    this.accMs = 0;
    const step = (t: number) => {
      if (!this.rafId) return;
      if (this.lastRaf) {
        this.accMs += Math.min(t - this.lastRaf, 250);
        while (this.accMs >= ChatMonitor.TICK_MS) {
          this.accMs -= ChatMonitor.TICK_MS;
          this.tick();
        }
      }
      this.lastRaf = t;
      if (!this.model.hasLiveTime()) { this.rafId = 0; return; }
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  /** 退出世界时清空(Main.cs:49030-49033 chatMonitor.Clear + 摘监听/停驱动) */
  clear(): void {
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = 0;
    if (this.onToggle && typeof window !== 'undefined') {
      window.removeEventListener('sw-chat-toggle', this.onToggle);
    }
    if (this.onScroll && typeof window !== 'undefined') {
      window.removeEventListener('sw-chat-scroll', this.onScroll);
    }
    this.onToggle = null;
    this.onScroll = null;
    this.model.clear();
    this.open = false;
    this.root.remove();
    this.measurer.remove();
  }
}

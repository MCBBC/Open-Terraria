// 原版左下角消息列(DOM 实现),1:1 对照 Terarria1456:
//   Terraria.GameContent.UI.Chat/LegacyChatMonitor.cs + Main.NewText(Main.cs:64095)
// 语义:
//   - Main.NewText(text, R, G, B) → 新消息入列,播 SoundID 12(Menu_Tick)
//   - 最多显示 10 行(showCount),最新在底部,新消息把旧消息上推
//   - 每条存活 600 tick = 10 秒(chatLength),到时整行消失(无渐隐,原版 showTime 二值)
//   - 绘制位置:x=88,自底向上第 i 行 y = screenHeight-30-28-i*21(行高 21)
//     (DrawChat L198),DrawColorCodedStringWithShadow = 黑描边
// 消息颜色 = ChatColors.cs:
//   BossOrEvent(175,75,255) 紫 / NPCTravel(50,125,255) 蓝 / World(50,255,130) 绿
//   ServerMessage(255,240,20) 黄 / Death(255,25,25) 红
export class ChatMonitor {
  private root: HTMLElement;
  private nodes: HTMLElement[] = [];
  private timers: number[] = [];

  private static readonly MAX_LINES = 10;    // showCount
  private static readonly SHOW_MS = 10_000;  // chatLength 600 tick

  constructor(parent: HTMLElement, private playTick?: () => void) {
    if (!document.getElementById('sw-chat-style')) {
      const style = document.createElement('style');
      style.id = 'sw-chat-style';
      style.textContent = `
.sw-chat {
  position: fixed; left: 88px; bottom: 58px; z-index: 15;
  display: flex; flex-direction: column; align-items: flex-start;
  pointer-events: none; max-width: 640px;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
}
.sw-chat-line {
  line-height: 21px; font-size: 14px; white-space: pre-wrap;
  text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000,
    2px 2px 0 rgba(0,0,0,.7);
}
`;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'sw-chat';
    parent.appendChild(this.root);
  }

  /** Main.NewText(text, R, G, B)。width = NewTextMultiline WidthLimit（px，-1 不限：
   *  RemadeChatMonitor.AddNewMessage 的 widthLimitInPixels——消息容器按该宽度折行，
   *  广播盒公告 = 460） */
  message(text: string, r = 255, g = 255, b = 255, width = -1): void {
    const line = document.createElement('div');
    line.className = 'sw-chat-line';
    line.style.color = `rgb(${r},${g},${b})`;
    if (width > 0) line.style.maxWidth = `${width}px`;
    line.textContent = text;
    this.root.appendChild(line);
    this.nodes.push(line);
    this.timers.push(window.setTimeout(() => this.remove(line), ChatMonitor.SHOW_MS));
    // 超出 showCount:最旧一行立即出列(原版环形 500 行只显示前 10)
    while (this.nodes.length > ChatMonitor.MAX_LINES) this.remove(this.nodes[0]);
    this.playTick?.();
  }

  private remove(line: HTMLElement): void {
    const i = this.nodes.indexOf(line);
    if (i < 0) return;
    this.nodes.splice(i, 1);
    clearTimeout(this.timers[i]);
    this.timers.splice(i, 1);
    line.remove();
  }

  /** 退出世界时清空 */
  clear(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.nodes = [];
    this.root.remove();
  }
}

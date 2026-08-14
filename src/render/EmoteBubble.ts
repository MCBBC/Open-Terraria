// 原版 EmoteBubble（Terraria.GameContent.UI/EmoteBubble.cs）移植——NPC 头顶表情气泡。
// 素材 = Extra_48.png（272×1092，8 列 × 39 行，格 34×28：行0 列0/1 = 气泡框闭合/张开，
// 行 1+emote/4、列 emote*2%8+frame = 表情图标，每表情 2 帧动画、8 tick/帧）。
// 锚定（GetPosition Entity 分支）：位置 = 头顶 + (-dir*w*0.75, 2)，origin 底中，
// dir≠-1 时水平翻转（气泡尾巴指向 NPC）。
export interface EmoteBubbleInstance {
  npc: { cx: number; y: number; w: number; facing: number };
  emote: number;
  lifeTime: number;
  lifeStart: number;
  frame: number;
  frameCounter: number;
}

const bubbles: EmoteBubbleInstance[] = [];

/** 调试/探针：当前活跃气泡数 */
export function emoteCount(): number { return bubbles.length; }

// 探针句柄：挂在 window 上保证与 Game/Renderer 同一模块实例（HMR ?t= 分叉时
// 动态 import 会拿到另一份模块实例，气泡数恒 0 的假象来源）
if (typeof window !== 'undefined') {
  (window as unknown as { __swEmotes?: unknown }).__swEmotes = { spawn: spawnEmote, count: emoteCount, draw: drawEmotes };
}

/** NewBubble(emoticon, anchor, time)：默认存活 180 tick */
export function spawnEmote(npc: EmoteBubbleInstance['npc'], emote: number, time = 180): void {
  if (bubbles.some((b) => b.npc === npc)) return; // 同一实体一次一个（原版 byID 近似）
  bubbles.push({ npc, emote, lifeTime: time, lifeStart: time, frame: 0, frameCounter: 0 });
}

/** Update()（EmoteBubble.cs:177）：--life；每 8 tick 图标帧 0↔1 */
export function tickEmotes(): void {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (--b.lifeTime <= 0) { bubbles.splice(i, 1); continue; }
    if (++b.frameCounter >= 8) {
      b.frameCounter = 0;
      if (++b.frame >= 2) b.frame = 0;
    }
  }
}

/** 绘制（Draw :203-231 1:1）。img = Extra_48 表。
 *  ※在渲染器的世界变换内调用（ctx 已 scale(z)/translate(-cam)）——直接用世界坐标锚定 */
export function drawEmotes(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  if (!img || !(img.width > 0) || img.width === 0) return;
  const CW = 34, CH = 28; // 272/8=34, 1092/39=28
  for (const b of bubbles) {
    const opening = b.lifeTime < 6 || b.lifeStart - b.lifeTime < 6; // flag：开合动画 → 行0 列0
    // 位置（GetPosition Entity 分支）：头顶 + (-dir*w*0.75, 2)px；origin = (格宽/2, 格高)
    const ax = b.npc.cx - b.npc.facing * b.npc.w * 0.75;
    const ay = b.npc.y + 2;
    const flip = b.npc.facing !== -1; // dir≠-1 → 水平翻转
    ctx.save();
    ctx.translate(ax, ay);
    if (flip) ctx.scale(-1, 1);
    // 气泡框：行 0，列 opening?0:1
    ctx.drawImage(img, (opening ? 0 : 1) * CW, 0, CW, CH, -CW / 2, -CH, CW, CH);
    if (!opening) {
      // 表情图标：列 = emote*2%8 + frame，行 = 1 + emote/4
      ctx.drawImage(img, (b.emote * 2 % 8 + b.frame) * CW, (1 + Math.floor(b.emote / 4)) * CH, CW, CH, -CW / 2, -CH, CW, CH);
    }
    ctx.restore();
  }
}

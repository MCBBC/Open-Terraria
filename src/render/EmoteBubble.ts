// 原版 EmoteBubble（Terraria.GameContent.UI/EmoteBubble.cs）移植——实体头顶表情气泡。
// 素材 = Extra_48.png（272×1092，8 列 × 39 行，格 34×28：行0 列0/1 = 气泡框闭合/张开，
// 行 1+emote/4、列 emote*2%8+frame = 表情图标，每表情 2 帧动画、8 tick/帧）。
// 锚定（GetPosition Entity 分支）：位置 = 头顶 + (-dir*w*0.75, 2)，origin 底中，
// dir≠-1 时水平翻转（气泡尾巴指向实体）。
// 锚对象 = 任意满足 {cx,y,w,facing} 的实体（NPC / 玩家 / 远端玩家代理——M4 玩家
// 表情气泡与 NPC 共用本模块，无实体类型分叉）。
import type { TownNPC } from '../entities/TownNPC';

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

/** NewBubble(emoticon, anchor, time)（:116-132）：默认存活 180 tick。
 *  OnBubbleChange（:263-277）：同一实体旧气泡 lifeTime=6（6t 内播闭合动画消隐）
 *  ——不是拒绝新泡（旧"同实体只一泡"为近似,2026-08-20 按原版更正） */
export function spawnEmote(npc: EmoteBubbleInstance['npc'], emote: number, time = 180): void {
  for (const b of bubbles) {
    if (b.npc === npc) b.lifeTime = 6;
  }
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

/** 绘制（Draw :199-242 1:1）。img = Extra_48 表。
 *  ※在渲染器的世界变换内调用（ctx 已 scale(z)/translate(-cam)）——直接用世界坐标锚定 */
export function drawEmotes(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement): void {
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
    if (!opening && b.emote >= 0) {
      // 表情图标：列 = emote*2%8 + frame，行 = 1 + emote/4（:226）。
      // 87 困惑/89 睡觉例外（:221-225）：图标不随气泡水平翻转，锚点 +4px（世界系
      // X 反向补偿翻转缩放——翻转系内等价 +4 世界像素）
      const ex = (b.emote * 2 % 8 + b.frame) * CW;
      const ey = (1 + Math.floor(b.emote / 4)) * CH;
      if ((b.emote === 87 || b.emote === 89) && flip) {
        ctx.save();
        ctx.scale(-1, 1);          // 再翻一次 = 恢复不翻转
        ctx.translate(4, 0);       // position.X += 4（翻转系内）
        ctx.drawImage(img, ex, ey, CW, CH, -CW / 2, -CH, CW, CH);
        ctx.restore();
      } else {
        ctx.drawImage(img, ex, ey, CW, CH, -CW / 2, -CH, CW, CH);
      }
    }
    ctx.restore();
  }
}

/** CheckForNPCsToReactToEmoteBubble（EmoteBubble.cs:152-167）1:1：
 *  附近城镇 NPC（aiStyle7 城镇族）对玩家表情起回应——条件：ai[0]<2（游走/站定,
 *  社交/攻击/坐姿等态不打断）且（玩家可对话且 <200px 或 无视线遮挡）→
 *  ai[0]=19 回应态 220t + 面向玩家（NPC.cs:69680 ai0==19 与 7 同帧带：帧 16 冒
 *  PickNPCEmote 气泡 112t——见 TownNPC.socialFrame case 7/19）。 */
export function checkForNPCsToReactToEmoteBubble(
  player: { cx: number; cy: number; x: number; y: number; w: number; h: number },
  npcs: readonly TownNPC[],
  canHitLine: (x1: number, y1: number, x2: number, y2: number) => boolean,
): void {
  for (const n of npcs) {
    if (n.dead || n.bound || !(n.ai0 < 2)) continue;   // aiStyle==7 && townNPC（入参即城镇池）
    const dist = Math.hypot(player.cx - n.cx, player.cy - n.cy);
    // CanBeTalkedTo && Distance(Center) < 200 || !CanHitLine(Top→Top)
    const reacts = (dist < 200) || !canHitLine(n.x, n.y, player.x, player.y);
    if (!reacts) continue;
    const direction = n.x < player.x ? 1 : -1;
    n.social = { kind: 19, t: 220, other: null, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
    n.facing = direction;
  }
}

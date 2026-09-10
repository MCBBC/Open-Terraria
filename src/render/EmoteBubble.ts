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

/** 测试/探针：活跃气泡快照（emote + 剩余寿命）——NewBubbleNPC 时长/随机表情
 *  断言用（TownNPC 台账批 2026-08-31） */
export function emoteSnapshot(): Array<{ emote: number; lifeTime: number }> {
  return bubbles.map((b) => ({ emote: b.emote, lifeTime: b.lifeTime }));
}

/** 测试/探针：清空全部气泡（隔离用例间模块态） */
export function emoteClearAll(): void { bubbles.length = 0; }

// 探针句柄：挂在 window 上保证与 Game/Renderer 同一模块实例（HMR ?t= 分叉时
// 动态 import 会拿到另一份模块实例，气泡数恒 0 的假象来源）
if (typeof window !== 'undefined') {
  (window as unknown as { __swEmotes?: unknown }).__swEmotes = {
    spawn: spawnEmote, count: emoteCount, draw: drawEmotes,
    snapshot: emoteSnapshot, clear: emoteClearAll,
    tempSnapshot: temporaryBubbleSnapshot,
    setTemp: setTemporaryBubble, clearTemp: clearTemporaryBubble,
  };
}

/** NewBubble(emoticon, anchor, time)（:116-132）：默认存活 180 tick。
 *  OnBubbleChange 淡出旧泡门（:263-277）：原版仅当【新泡锚是 Player】才把同锚
 *  旧泡 lifeTime=6（6t 内播闭合动画消隐）——NPC 锚气泡不触发，同一 NPC 可多泡
 *  并存。R24 勘误（E1）：曾对任意实体杀旧泡并把注释写成"按原版更正"，实为把
 *  Player 专属规则扩大到全体；现 isPlayer 门恢复原版语义。 */
export function spawnEmote(npc: EmoteBubbleInstance['npc'], emote: number, time = 180,
  opts?: { isPlayer?: boolean }): void {
  if (opts?.isPlayer) {
    for (const b of bubbles) {
      if (b.npc === npc) b.lifeTime = 6;
    }
  }
  bubbles.push({ npc, emote, lifeTime: time, lifeStart: time, frame: 0, frameCounter: 0 });
}

/** Update()（EmoteBubble.cs:177）：--life；每 8 tick 图标帧 0↔1 */
export function tickEmotes(): void {
  // 临时气泡槽新鲜度：拥有者每 tick 必刷新（stamp），2 tick 未续 = 拥有者已亡/停 → 清
  tempStamp++;
  for (const [k, b] of temporaryBubbles) {
    if (tempStamp - b.stamp > 2) temporaryBubbles.delete(k);
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (--b.lifeTime <= 0) { bubbles.splice(i, 1); continue; }
    if (++b.frameCounter >= 8) {
      b.frameCounter = 0;
      if (++b.frame >= 2) b.frame = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// ★IIIII233（2026-09-09）：临时气泡 = EmoteBubble.DrawTemporaryBubble（:189-197）
// 1:1——原版无实体态、由拥有者在 Draw 阶段直接画（宠物弹幕的 localAI 计时槽
// Main.cs:33755/:34820/:34250 三站）。本仓以【每 tick 由拥有者刷新的槽表】等价：
// setTemporaryBubble(anchor, emoteId, maxLife, curLife) 覆盖同锚槽，drawEmotes
// 逐槽绘制（无 Update——寿命由拥有者的计时槽驱动，同原版 lifeTime 直通）。
// 开合动画门（Draw :205）= curLife<6（闭合收尾）|| maxLife-curLife<6（开泡）。
// ---------------------------------------------------------------------------
const temporaryBubbles = new Map<object, { emote: number; lifeTimeStart: number; lifeTime: number; stamp: number }>();
let tempStamp = 0;

/** DrawTemporaryBubble 等价：同锚覆盖（原版 _temporaryBubble 单例逐帧覆写） */
export function setTemporaryBubble(
  anchor: EmoteBubbleInstance['npc'], emoteId: number, maxLifetime: number, currentLifetime: number,
): void {
  temporaryBubbles.set(anchor, { emote: emoteId, lifeTimeStart: maxLifetime, lifeTime: currentLifetime, stamp: tempStamp });
}

/** 拥有者计时槽走完（curLife≤1 或 ≤0 门,原版 >1 才画）后清槽 */
export function clearTemporaryBubble(anchor: EmoteBubbleInstance['npc']): void {
  temporaryBubbles.delete(anchor);
}

/** 测试/探针：临时气泡快照 */
export function temporaryBubbleSnapshot(): Array<{ emote: number; lifeTime: number }> {
  return [...temporaryBubbles.values()].map((b) => ({ emote: b.emote, lifeTime: b.lifeTime }));
}

/** 绘制（Draw :199-242 1:1）。img = Extra_48 表。
 *  ※在渲染器的世界变换内调用（ctx 已 scale(z)/translate(-cam)）——直接用世界坐标锚定 */
export function drawEmotes(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement): void {
  if (!img || !(img.width > 0) || img.width === 0) return;
  const CW = 34, CH = 28; // 272/8=34, 1092/39=28
  // 临时气泡（DrawTemporaryBubble :189-197）——宠物弹幕抚摸/离场/挖掘演出
  for (const [anchor, b] of temporaryBubbles) {
    if (b.lifeTime <= 1) { temporaryBubbles.delete(anchor); continue; }  // 原版 >1 才画
    drawOne(ctx, img, CW, CH, {
      npc: anchor as EmoteBubbleInstance['npc'], emote: b.emote,
      lifeTime: b.lifeTime, lifeStart: b.lifeTimeStart, frame: 0, frameCounter: 0,
    });
  }
  for (const b of bubbles) {
    drawOne(ctx, img, CW, CH, b);
  }
}

/** Draw（EmoteBubble.cs:199-242）单泡绘制（实体锚分支）。开合动画 6t 窗。 */
function drawOne(
  ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement,
  CW: number, CH: number, b: EmoteBubbleInstance,
): void {
  {
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

/** MakeLocalPlayerEmote（EmoteBubble.cs:279-293）1:1——死亡门恒置（netMode!=2）;
 *  本地出泡 + NPC 回应（原版 netMode==0 支）;联机时另发 msg120（原版 SendData(120)
 *  → 服务器权威 NewBubble + msg91 全体回环,中继模型 = 本地即刻出泡 + sendEmote
 *  中继其他端,观察行为等价） */
export function makeLocalPlayerEmote(
  anchor: EmoteBubbleInstance['npc'], emoteId: number,
  opts: { dead: boolean; sendEmote?: (emoteId: number) => void; reactToNpcs?: () => void },
): void {
  if (opts.dead) return;
  spawnEmote(anchor, emoteId, 360, { isPlayer: true });   // OnBubbleChange Player 锚门
  opts.reactToNpcs?.();
  opts.sendEmote?.(emoteId);
}

/** CheckForNPCsToReactToEmoteBubble（EmoteBubble.cs:152-167）1:1：
 *  附近城镇 NPC（aiStyle7 城镇族）对玩家表情起回应——条件：ai[0]<2（游走/站定,
 *  社交/攻击/坐姿等态不打断）且（玩家可对话且 <200px 或 无视线遮挡）→
 *  ai[0]=19 回应态 220t + 面向玩家（NPC.cs:69680 ai0==19 与 7 同帧带：帧 16 冒
 *  PickNPCEmote 气泡 112t——见 TownNPC.socialFrame case 7/19）。
 *  ★SW-FX15：补 CanBeTalkedTo 门（Player.cs:3872-3882 = active∧!dead∧!ShouldNotDraw
 *  ∧stealth==1f）——蘑菇矿/星璇潜行中（stealth<1）NPC 不回应 200px 近距臂，仅剩
 *  无视线遮挡臂（与原版 (talkable && dist<200) || !CanHitLine 同构）。JS 侧 stealth
 *  用 ε≥1−1e-6 判满：C# float 回升链 +0.1f 累加溢出后钳回精确 1f，JS double 累加
 *  漂移停在 0.9999999999999999（ULP 族备案）——严格 ===1 会把可对话态误判潜行。 */
export function checkForNPCsToReactToEmoteBubble(
  player: { cx: number; cy: number; x: number; y: number; w: number; h: number; stealth?: number },
  npcs: readonly TownNPC[],
  canHitLine: (x1: number, y1: number, w1: number, h1: number, x2: number, y2: number, w2: number, h2: number) => boolean,
): void {
  // CanBeTalkedTo（Player.cs:3872）：!ShouldNotDraw（隐身甲/invis,本仓未建模=恒真
  // 偏差备案）∧ stealth==1f；dead 已由上游 MakeLocalPlayerEmote 死亡门涵盖
  const talkable = (player.stealth ?? 1) >= 1 - 1e-6;
  for (const n of npcs) {
    if (n.dead || n.bound || !(n.ai0 < 2)) continue;   // aiStyle==7 && townNPC（入参即城镇池）
    const dist = Math.hypot(player.cx - n.cx, player.cy - n.cy);
    // CanBeTalkedTo && Distance(Center) < 200 || !CanHitLine(Top→Top)
    const reacts = (talkable && dist < 200)
      || !canHitLine(n.x, n.y, 0, 0, player.x, player.y, 0, 0);
    if (!reacts) continue;
    const direction = n.x < player.x ? 1 : -1;
    n.social = { kind: 19, t: 220, other: null, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
    n.facing = direction;
  }
}

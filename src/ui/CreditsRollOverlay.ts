// 制作组名单演出渲染（CreditsRollSky）—— Terraria.GameContent.Skies/CreditsRollSky.cs
// 消费侧 1:1（IIIII232 装配；★BJ409 归位渲染层/时钟/比例）。
//
// ★BJ409 定谳（2026-09-29 用户实报"城镇 NPC 悬空排成数排站在半空"）三根因：
//  ① 段时间窗门缺失——原版 Segments.AnimationSegmentWithActions.Draw 消费端
//     （Segments.cs:244-245 NPCSegment / :397 SpriteSegment）有硬窗门
//     `TimeInAnimation < _targetTime || > _targetTime+DedicatedTimeNeeded → 不画`，
//     本仓 npc/spr 分支只靠动作链首 Fade(255)/Fade(0) 隐身，而 blankState 初值
//     （alphaNpc=0 可见 / opacity=1 可见）在段开场（local<0）时不吃动作 → 全剧
//     348 段所有 NPC/画板从第 0 帧起全部常驻（探针实测 t=100 时 64/64 npc + 30/30
//     spr 泄漏）＝"几排 NPC 整齐悬空排排站"的第一根因。修 = 1:1 补窗门。
//  ② 渲染层错位——原版 CreditsRollSky 是 SkyManager 深度 1 天空，经
//     DrawRemainingDepth（Main.cs:60564/:53484 背景段收尾）绘制：全部背景层之后、
//     世界内容之前 → 被墙/tile 遮挡（在室内/洞穴看不见，露天=挂在天空的背景板）。
//     本仓曾挂 DOM 顶层画布（z-index 60）= 盖住世界/HUD。修 = Renderer 在
//     drawLanternsNear/drawPartyBalloonsNear 同槽（该位=本仓已判例的
//     DrawRemainingDepth 等价位）调 drawCreditsRollSky；DOM 画布拆除。
//  ③ 时钟/比例——原版 _currentTime 在 SkyManager.Instance.Update（Main.cs:17317
//     每 Main.Update 帧）推进、演出锚=Main.ScreenSize/2、精灵 1:1 屏幕像素
//     （zoom1=16px/tile 世界比例）。本仓曾 overlay 自有 rAF（120Hz 屏 2×速）+
//     固定 scale=2（巨人比例）。修 = tick 挂 Game 60Hz 固定档（creditsRoll
//     .updateTime 同帧位）、scale=相机 zoom（与世界同比例）。
//  另:composer 侧同批修——收场群像 AddEmote 窗/侧（见 creditsRollComposer.ts
//  BJ409 注）与 bg/道具画板 origin 折叠（Size*(0.5,1)+(ox,oy) 语义）。
//
// 段求值 = creditsRollComposer 时间线逐帧无状态重放（Actions.cs ApplyTo 闭式函数，
// 动作按数组序串行施加、运行态在帧内逐段传递——与 ProcessActions 的重放序一致）。
// 资产 = public/sprites/vanilla/{NPC_,Extra_,Projectile_}*.png（既有抽取管线资产）；
// emote 气泡 = Extra_48（EmoteSegment :464-495，8×N 帧表 34×28）。
// 字体 = Fusion Pixel（UIFont 注入）近似 FontAssets.DeathText ×0.7（原版位图字库）。
// ★M 刀（清偿 BJ409 债#1）：PlayerSegment 玩家形象段 1:1 实装（Segments.cs:117-213）——
//  phantom = CopyVisuals(Main.LocalPlayer)（:209 皮肤/盔甲全复制）→ 本仓 deps.playerVisual
//  供给本地玩家 appearance+displayArmor 三槽（Renderer.dollEquipFromInv 单源,SetMatch
//  三查同链）；帧 = PlayerFrame 闭式（velocity.Y≠0 → 行5 跳跃 :36523/:36824,静止 → 行0;
//  眨眼由 Player.Update 驱动,phantom 从不 Update → 睁眼恒定=原版同相）；锚 = 盒底中心
//  （:187-188 position-=(width/2,height)）；绘制复用 compositePaperDoll rows 模式。
// 登记债见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md 本批章（item 喷洒段、
// NPC 变体/AlternativeTexture/派对帽形象、ShowItem 手持物、染色剂 dye 通道）。
// ★C6-P2 清偿刀（2026-09-30）：F2 帧序列两形态 1:1（seqFrameIndex——hold 钳末帧/
// 循环相位锚段首,Actions.cs:1005-1039）；F6 Blink 域（EvalState.blink+帧梯 rest>
// blink>walk,帧行 npcFrameCount−AFC−1,NPC.cs:69972）；F8 PauseSkies=零改动定谳
// （暂停期 fixedUpdate 冻结→tick 自然冻结,见 tick 注）。

import { getCreditsRollFill, invalidateCreditsRollFill, type Act, type Anim, type Seg } from '../world/creditsRollComposer';
import { VANILLA_NPCS } from '../data/vanillaNpcs';
import { Lang } from '../i18n/Lang';
import { compositePaperDoll, FRAME_W, FRAME_H } from '../player/PaperDoll';
import type { Appearance } from '../player/Appearance';

/** Extra_48 气泡帧 34×28（272×1092 → 8 列×39 行） */
const EMOTE_FW = 34;
const EMOTE_FH = 28;

interface SheetImg {
  img: ImageBitmap | HTMLImageElement;
  w: number;
  h: number;
}

/** 段求值态（Actions.cs ApplyTo 重放载体；NPC=alphaNpc 语义 / 精灵=opacity 语义；导出=测试消费面） */
export interface EvalState {
  alphaNpc: number;        // NPC alpha（0=不透明 … 255=隐；DrawNPCDirect alpha<255 才画）
  opacity: number;         // 精灵 opacity（1=不透明）
  dx: number;              // 相对锚点累计位移
  dy: number;
  rot: number;
  look: number;            // 最后 LookAt（渲染翻面用）
  seq: { frames: Array<[number, number]>; tpf: number; delay: number; loop: boolean } | null;
  frame: [number, number] | null;
  moving: boolean;         // Move/accel 活动中（走路动画相位）
  party: boolean;
  blink: boolean;          // ★C6-F6：NPCs.Blink 域（ai[0]==1001 → 眨眼帧行）
  vy: number;              // ★M 刀：最后速度 Y（Players.Wait 置 0 / Move=vy / accel=v0+a·num
                           //  —— Actions.cs 逐类 ApplyTo 终值；玩家帧行判据 velocity.Y≠0）
  restRow: number | null;  // ★M 刀：NPCs.DoBunnyRestAnimation 钉帧行（:426-470 闭式）
}

const clamp = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;

/** ★C6-F2：SetFrameSequence 帧号闭式（Actions.cs:1005-1039 两形态；导出=测试消费面）。
 *  循环系（时长参构造 :980-985,_loop=true）——idx = local%(tpf*len)/tpf,相位锚段首
 *  （local=段本地时间,非 local−delay;:1013-1021,delay 只作 :1007 门槛）；
 *  一次性系（无时长参 :987-994,hold）——local−delay 钳 [0,tpf*len] 除 tpf,钳末帧
 *  （:1022-1033）。尾护 idx≥len→len−1（:1017-1020/:1030-1033 浮点护）。 */
export function seqFrameIndex(seq: NonNullable<EvalState['seq']>, local: number): number {
  const cyc = seq.tpf * seq.frames.length;
  let idx: number;
  if (seq.loop) idx = Math.floor((local % cyc) / seq.tpf);
  else idx = Math.floor(clamp(local - seq.delay, 0, cyc) / seq.tpf);
  if (idx >= seq.frames.length) idx = seq.frames.length - 1;
  return idx;
}

/** NPCID.Sets.AttackFrameCount（NPCID.cs:4839）——Blink 帧行消费面（本剧仅 108/663
 *  触发 Blink;其余 id 缺省=不适用）。眨眼帧行 = npcFrameCount−AFC−1（NPC.cs:69433
 *  num60−1 :69972-69976） */
export const BLINK_ATTACK_FRAMES: Record<number, number> = { 108: 2, 663: 2 };

/** ★BJ409①：段时间窗门（Segments.cs:244-245 NPCSegment / :397 SpriteSegment 消费端
 *  硬窗 1:1）——`TimeInAnimation < _targetTime || > _targetTime+DedicatedTimeNeeded
 *  → 不画`。npc/spr 段渲染端必经此门（此前缺门 + blankState 初值可见 = 全剧段
 *  从第 0 帧起全部常驻,= 用户实报"NPC 悬空排排站"第一根因） */
export function inSegWindow(seg: Extract<Seg, { acts: Anim }>, t: number): boolean {
  const local = t - seg.t;
  return local >= 0 && local <= seg.acts.time;
}

/** Anim 动作链求值（Actions.cs ApplyTo 逐条重放；delay 由 Then/With 预分配）。
 *  gravity/rotor/move 的位移在求值期直接累计（vanilla position += 闭式项，
 *  已过窗的动作钳 num=duration 保留终值——与逐帧重放等价） */
/** 动作链求值（纯函数；导出=测试消费面,与 inSegWindow 同域） */
export function evalActs(acts: readonly Act[], t: number, st: EvalState, isNpc: boolean): void {
  for (const a of acts) {
    const local = t - a.delay;
    if (local < 0) continue;
    switch (a.a) {
      case 'look':
        st.look = a.d;
        break;
      case 'fade':
        if (a.per !== undefined) {
          // Fade(alphaPerFrame[, dur])：alpha = clamp(alpha + num*per)（NPC 侧）
          const num = Math.min(local, a.dur ?? 0);
          if (isNpc) st.alphaNpc = clamp(st.alphaNpc + Math.trunc(num) * a.per, 0, 255);
          else st.opacity = clamp(st.opacity + num * a.per / 255, 0, 1);
        } else {
          // Fade(target[, dur])：dur=0 → 置位；dur>0 → Lerp(cur, target, num/dur)
          if ((a.dur ?? 0) === 0) {
            if (isNpc) st.alphaNpc = clamp(a.target ?? st.alphaNpc, 0, 255);
            else st.opacity = clamp(a.target ?? 1, 0, 1);
          } else {
            const p = clamp(local / (a.dur ?? 1), 0, 1);
            const target = a.target ?? 0;
            if (isNpc) st.alphaNpc = st.alphaNpc + (target - st.alphaNpc) * p;
            else st.opacity = st.opacity + (target - st.opacity) * p;
          }
        }
        break;
      case 'wait':
        st.moving = false;
        st.vy = 0;              // Wait.ApplyTo（:65-94）：velocity = Vector2.Zero
        break;
      case 'move': {
        const num = Math.min(local, a.d);
        st.dx += a.vx * num;
        st.dy += a.vy * num;
        if (a.vx !== 0) st.look = a.vx > 0 ? 1 : -1;
        st.moving = a.vx !== 0 || a.vy !== 0;
        st.vy = a.vy;           // NPC Move（:316）：velocity = offsetPerFrame
        break;
      }
      case 'accel': {
        const num = Math.min(local, a.d);
        st.dx += a.vx * num + a.ax * (num * num * 0.5);
        st.dy += a.vy * num + a.ay * (num * num * 0.5);
        if (a.vx !== 0) st.look = a.vx > 0 ? 1 : -1;
        st.moving = true;
        st.vy = a.vy + a.ay * num;   // MoveWithAcceleration（:166）终值
        break;
      }
      case 'rest': {
        // ★M 刀 DoBunnyRestAnimation（Actions.cs:426-470）：ai[0]=21/ai[1]=31（休息态）
        //  + frame.Y = 行 {10,11,12,13} 每 4 帧一进（while num3>4 递进、封顶 13）——
        //  本仓 npc 帧机钉到此行（FindFrame 休息态复现同域,见 BJ409 债章节注）
        const num = Math.min(local, a.d);
        st.restRow = Math.min(10 + Math.floor(num / 4), 13);
        st.moving = false;
        break;
      }
      case 'knock': {
        // ★M 刀 ZombieKnockOnDoor（Actions.cs:645-685）：bumpOffset=(-1,0)——
        //  (int)num%60/4 ≤ 3（C# 整除:num%60∈[0,15] 前 16 帧）position += (-1,0)
        //  +velocity=(0.75,0)，否则 position -= (-1,0)（回位）+velocity=0。位移闭式
        //  逐帧无状态复现 + velocity.X≠0 → FindFrame 走路帧
        const num = Math.min(local, a.d);
        st.dx += Math.floor((Math.floor(num) % 60) / 4) <= 3 ? -1 : 1;
        st.moving = true;
        break;
      }
      case 'gravity': {
        // SimulateGravity（Actions.cs:903-912）：pos += v0*num + g*num²、rot += rotPerFrame*num
        const num = Math.min(local, a.d);
        st.dx += a.v0.x * num + a.g.x * (num * num);
        st.dy += a.v0.y * num + a.g.y * (num * num);
        st.rot += a.rot * num;
        break;
      }
      case 'rotor': {
        // MoveWithRotor（Actions.cs:412-424）：pos += offsetPerFrame.RotatedBy(speed*num)*axis
        const num = Math.min(local, a.d);
        const th = a.speed * num;
        const vx = a.per.x, vy = a.per.y;
        const rx = vx * Math.cos(th) - vy * Math.sin(th);
        const ry = vx * Math.sin(th) + vy * Math.cos(th);
        st.dx += rx * a.axis.x;
        st.dy += ry * a.axis.y;
        break;
      }
      case 'show':
        st.moving = false;
        break;                      // ShowItem 形象（手持物）不渲染=登记债
      case 'frame':
        st.frame = [a.x, a.y];
        st.seq = null;
        break;
      case 'frames':
        // ★C6-F2①：无时长参 SetFrameSequence 构造（Actions.cs:987-994）= 一次性
        //  钳末帧（hold）——非无限循环
        st.seq = { frames: a.frames, tpf: a.tpf, delay: a.delay, loop: false };
        break;
      case 'framesFor':
        // ★C6-F2②：时长参构造（Actions.cs:980-985）= 循环（相位锚段首,见
        //  seqFrameIndex——delay 只作门槛）
        st.seq = { frames: a.frames, tpf: a.tpf, delay: a.delay, loop: true };
        break;
      case 'blink':
        // ★C6-F6 Blink（Actions.cs:509-543）：local≥delay → velocity=Zero +
        //  ai[0]=0；local≤delay+dur → ai[0]=1001（眨眼域,NPC.cs:69972 消费）；
        //  过窗恒写 ai[0]=0 = 归位正常帧梯
        st.moving = false;
        st.vy = 0;
        st.blink = local <= a.d;
        break;
      case 'party':
        st.party = true;
        break;
      default:
        break;   // variant/forceAlt：形象变体/专用贴图域（登记债勿强扩）
    }
  }
}

export interface CreditsRollOverlayDeps {
  /** Main.CanPlayCreditsRoll（Main.cs:3223-3232）：!gameMenu && hasCreditsSceneMusicBox
   *  ∪ gameMenu&&menuMode==3000 ∪ IsEventOngoing——由装配侧注入（musicBoxStyle===85） */
  canPlay(): boolean;
  /** ★M 刀 PlayerSegment.ResetPlayerAnimation → CopyVisuals(Main.LocalPlayer)
   *  （Segments.cs:209）的本仓供给：本地玩家外观 + 盔甲三槽（dollEquipFromInv
   *  单源,SetMatch 三查同链——phantom 皮肤/盔甲 1:1 本地玩家）。菜单态无本地玩家
   *  → null（段窗内不画；同 creditsRoll.canPlay menuMode 3000 登记域） */
  playerVisual?(): { appearance: Appearance; equip: { head: number | null; body: number | null; legs: number | null } } | null;
}

class CreditsRollOverlay {
  private t = 0;                    // CreditsRollSky._currentTime
  private opacity = 0;              // CreditsRollSky._opacity
  private active = false;           // isActive
  private wants = false;            // _wantsToBeSeen
  private sheets = new Map<string, SheetImg>();
  // ★审计对齐(2026-09-13):永久负缓存 → 10s TTL 自愈（参照 ensureVImage/loadExtraSprite——
  //  首访冷缓存一次失败曾=整会话缺贴图;TTL 后允许重试） */
  private failed = new Map<string, number>();
  private static readonly FAILED_TTL_MS = 10000;   // ★RB15c:readonly 收紧
  private walkPhase = new Map<object, number>();   // 走路动画相位（段对象键）

  constructor(private deps: CreditsRollOverlayDeps) {
    Lang.onChange(() => invalidateCreditsRollFill());
  }

  /** CreditsRollSky.Update（:35-66）——Game 60Hz 固定档每 tick 调
   *  （原版 = SkyManager.Instance.Update，Main.cs:17317 每 Main.Update 帧）。
   *  ★C6-F8 定谳（2026-09-30,零改动）：原版 Update 头 FocusHelper.PauseSkies 门
   *  （CreditsRollSky.cs:37-40,= !IsSelectedApplication ∨ Main.gamePaused）在本仓
   *  由消费位自然等价——本 tick 只被 Game.fixedUpdate 调（Game.ts fixedUpdate 内
   *  creditsRoll.updateTime 同帧位）,而本仓 paused（手动/autoPause/失焦自暂停）
   *  时 fixedUpdate 整段冻结（Game.ts frame() !paused 门+后台泵 pumpGate paused
   *  门）→ 暂停期 tick 不跑 = _currentTime 自然冻结,与原版门逐帧同相。
   *  分歧域登记：backgroundRun+playWhenUnfocused 双开的后台挂机态本仓世界照走
   *  （用户明令特性）而原版 PauseSkies 仍冻天穹钟——与 AuroraSky.ts 同一门既有
   *  判例（「本仓无对应态」）一致,后台无渲染面、回前台时钟前跳,登记债勿强接门。 */
  tick(): void {
    const playing = this.deps.canPlay();
    if (playing && !this.active) this.activate();
    if (!this.active) return;
    this.t++;                                   // _currentTime++（每 Update）
    this.opacity = clamp(this.opacity + (1 / 120) * (this.wants ? 1 : -1), 0, 1);
    if (this.opacity === 0 && !this.wants) this.active = false;
    if (!playing || this.t >= getCreditsRollFill(true).endTime) this.wants = false;
  }

  /** CreditsRollSky.Activate（:110-119） */
  private activate(): void {
    this.active = true;
    this.wants = true;
    if (this.opacity === 0) this.t = 0;
  }

  private loadSheet(tex: string, cb: (s: SheetImg | null) => void): void {
    const hit = this.sheets.get(tex);
    if (hit) { cb(hit); return; }
    {
      const at = this.failed.get(tex);
      if (at !== undefined && performance.now() - at < CreditsRollOverlay.FAILED_TTL_MS) { cb(null); return; }
      if (at !== undefined) this.failed.delete(tex);   // TTL 过 → 重试
    }
    const pending = this.pend.get(tex);
    if (pending) { pending.push(cb); return; }
    const q: Array<(s: SheetImg | null) => void> = [cb];
    this.pend.set(tex, q);
    const img = new Image();
    img.onload = () => {
      const rec = { img, w: img.naturalWidth, h: img.naturalHeight };
      this.sheets.set(tex, rec);
      this.pend.delete(tex);
      for (const f of q) f(rec);
    };
    img.onerror = () => {
      this.failed.set(tex, performance.now());
      this.pend.delete(tex);
      for (const f of q) f(null);
    };
    img.src = `sprites/vanilla/${tex}.png`;
  }
  private pend = new Map<string, Array<(s: SheetImg | null) => void>>();

  /** CreditsRollSky.Draw（:68-95）：锚 = Main.ScreenSize/2（屏中心）、DisplayOpacity
   *  斜坡；S = 相机 zoom（原版背景段 1:1 屏幕像素 ≙ 世界比例）。由 Renderer 在
   *  DrawRemainingDepth 等价槽调用（背景层之后/世界内容之前=被墙 tile 遮挡） */
  drawInto(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, S: number): void {
    if (!this.active || this.opacity <= 0) return;
    const t = this.t;
    const displayOpacity = this.opacity;
    const fill = getCreditsRollFill(true);
    const ax = viewW / 2;
    const ay = viewH / 2;   // AnchorPositionOnScreen = ScreenSize/2
    const globalTime = (performance.now() / 1000) % 3600;

    for (const seg of fill.segments) {
      if (seg.k === 'text') {
        // LocalizedTextSegment.Draw（:40-65）：±250 帧淡入出、0.75px/帧上滚
        const num3 = clamp((t - (seg.peak - 250)) / 250, 0, 1)
          * clamp((t - (seg.peak + 250)) / (-250), 0, 1);
        if (num3 <= 0) continue;
        const pos: [number, number] = [
          ax + seg.ax * S,
          ay + (seg.peak - t) * 0.75 * S + seg.ay * S,
        ];
        const num6 = 1 - (1 - num3) * (1 - num3);
        const hue = ((globalTime * 0.02) % 1 + 1) % 1;
        const rgb = hslToRgb(hue, 1, 0.5);
        ctx.font = `${Math.round(30 * S)}px "Fusion Pixel 12px", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 阴影 = 彩虹色 × num6² × 0.25（原版 DrawColorCodedStringShadow）
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${num6 * num6 * 0.25 * displayOpacity})`;
        ctx.fillText(seg.text, pos[0] + 2 * S, pos[1] + 2 * S);
        ctx.fillStyle = `rgba(255,255,255,${num6 * displayOpacity})`;
        ctx.fillText(seg.text, pos[0], pos[1]);
        continue;
      }
      if (seg.k === 'emote') {
        // EmoteSegment.Draw（:464-495）：pop/收口气泡 + 表情图标（20t 双帧循环）
        const num = t - seg.t;
        if (num < 0 || num >= seg.dur) continue;
        const vx = seg.vel?.x ?? 0, vy = seg.vel?.y ?? 0;
        let ex = ax + (seg.dx + vx * num) * S;
        let ey = ay + (seg.dy + vy * num) * S;
        ex = Math.floor(ex); ey = Math.floor(ey);   // vec.Floor()
        const flag = num < 6 || num >= seg.dur - 6;
        let flip = seg.flip ?? false;
        this.loadSheet('Extra_48', (s) => {
          if (!s) return;
          const drawFrame = (col: number, row: number, alpha: number, doFlip: boolean): void => {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(ex, ey);
            if (doFlip) ctx.scale(-1, 1);
            ctx.drawImage(s.img, col * EMOTE_FW, row * EMOTE_FH, EMOTE_FW, EMOTE_FH,
              -EMOTE_FW * S / 2, -EMOTE_FH * S, EMOTE_FW * S, EMOTE_FH * S);
            ctx.restore();
          };
          // 气泡壳 row0=pop / row1=常态 × displayOpacity；图标 Color.White 全亮
          drawFrame(flag ? 0 : 1, 0, displayOpacity, flip);
          if (!flag) {
            if ((seg.id === 87 || seg.id === 89) && flip) {
              flip = false;
              ex += 4 * S;                        // :486-491 翻面修正
            }
            const fcol = (seg.id % 4) * 2 + Math.floor((num % 20) / 10);
            const frow = Math.floor(seg.id / 4) + 1;
            drawFrame(fcol, frow, 1, flip);
          }
        });
        continue;
      }
      if (seg.k === 'npc') {
        const local = t - seg.t;
        // ★BJ409①：段窗门 1:1（Segments.cs:244-245）——窗外（未开场/已收场）不画
        if (!inSegWindow(seg, t)) continue;
        const st: EvalState = blankState();
        evalActs(seg.acts.acts, local, st, true);
        if (!(st.alphaNpc < 255)) continue;          // DrawNPCDirect alpha<255 门
        const frames = VANILLA_NPCS[String(seg.type)]?.frames ?? 1;
        // 帧梯（FindFrame 城镇分支 ai[0] else-if 链序 :69436-69976：20-22 休息 >
        // 1001 眨眼 > 走路）：rest → blink → walk 相位/站定
        let frame = 0;
        if (st.restRow !== null) {
          frame = st.restRow;          // ★M 刀：休息动画钉帧（DoBunnyRestAnimation 行 10..13）
        } else if (st.blink && BLINK_ATTACK_FRAMES[seg.type] !== undefined) {
          // ★C6-F6：Blink 帧行 = npcFrameCount−AttackFrameCount−1（NPC.cs:69433
          //  num60−1 → :69972-69976 frame.Y=num*(num60-1);108/663 AFC=2）
          frame = frames - BLINK_ATTACK_FRAMES[seg.type] - 1;
          this.walkPhase.delete(seg);
        } else if (st.moving) {
          const ph = (this.walkPhase.get(seg) ?? 0) + 1;
          this.walkPhase.set(seg, ph);
          frame = 2 + Math.floor(ph / 6) % 11;
        } else {
          this.walkPhase.delete(seg);
        }
        this.loadSheet(`NPC_${seg.type}`, (s) => {
          if (!s) return;
          const fh = s.h / frames;
          const fw = s.w;
          // 城镇 NPC 原生朝左；direction 1（右）→ 水平翻转（Main.cs:23356-23359
          // spriteDirection==1 → FlipHorizontally）
          const flip = st.look >= 0;
          ctx.save();
          ctx.globalAlpha = (1 - st.alphaNpc / 255) * displayOpacity;
          ctx.translate(ax + (seg.dx + st.dx) * S, ay + (seg.dy + st.dy) * S);
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(s.img, 0, frame * fh, fw, fh, -fw * S / 2, -fh * S, fw * S, fh * S);
          ctx.restore();
        });
        continue;
      }
      if (seg.k === 'spr') {
        // ★BJ409①：段窗门 1:1（Segments.cs:397）——同 npc 分支
        if (!inSegWindow(seg, t)) continue;
        const local = t - seg.t;
        const st = blankState();
        evalActs(seg.acts.acts, local, st, false);
        if (st.opacity <= 0) continue;
        this.loadSheet(seg.tex, (s) => {
          if (!s) return;
          const frames = seg.frames ?? 1;
          const fh = s.h / frames;
          const fw = s.w;
          let col = 0, row = 0;
          if (st.seq) {
            // ★C6-F2：帧号闭式两形态（hold/循环+相位锚段首）——此前统一取模循环
            //  且相位锚动作起点（local−delay）= 双偏离（Actions.cs:1005-1039）
            [col, row] = st.seq.frames[seqFrameIndex(st.seq, local)];
          } else if (st.frame) {
            [col, row] = st.frame;
          }
          // origin：原版 DrawData origin——originBottom 系 = Size*(0.5,1)+(ox,oy)
          // （ox/oy = BJ409⑤ 新增场；center 系 = Size()/2）
          const originX = fw / 2 + (seg.ox ?? 0);
          const originY = (seg.originBottom ? fh : fh / 2) + (seg.oy ?? 0);
          ctx.save();
          ctx.globalAlpha = st.opacity * displayOpacity;
          ctx.translate(ax + (seg.dx + st.dx) * S, ay + (seg.dy + st.dy) * S);
          if (st.rot) ctx.rotate(st.rot);
          if (seg.flip) ctx.scale(-1, 1);
          ctx.drawImage(s.img, col * fw, row * fh, fw, fh, -originX * S, -originY * S, fw * S, fh * S);
          ctx.restore();
        });
        continue;
      }
      if (seg.k === 'player') {
        // ★M 刀：PlayerSegment.Draw（Segments.cs:170-206）1:1——
        //  窗门 :172-175（同 npc/spr）→ ResetPlayerAnimation :207-212（锚+动作链闭式
        //  重放）→ PlayerFrame 帧行 → DrawPlayer（盒底中心锚,opacityForAnimation×
        //  DisplayOpacity 乘色,fullRotation=0,socialIgnoreLight=无光照 tint）。
        //  染色剂 dye 通道（ImmediateSpritebatchForPlayerDyesEffect :126-139 批模式
        //  切换面）不渲染=登记债。
        if (!inSegWindow(seg, t)) continue;
        const local = t - seg.t;
        const st = blankState();
        evalActs(seg.acts.acts, local, st, false);
        if (st.opacity <= 0) continue;               // opacityForAnimation=0 → 乘色全透明
        const visual = this.deps.playerVisual?.() ?? null;
        if (!visual) continue;                       // 无本地玩家（菜单态）：窗内不画
        // 帧行（PlayerFrame :36523/:36824 velocity.Y≠0 → 跳跃行5、静止 → 行0；phantom
        // 域无翼/骑乘/沙暴/eocDash 分支——CopyVisuals 不复制 buff,ResetEffects 后恒 0）
        const rows = st.vy !== 0 ? { body: 5, legs: 5 } : { body: 0, legs: 0 };
        const doll = compositePaperDoll(visual.appearance, visual.equip, { rows });
        if (!doll) continue;                         // 贴图未就绪（texReady 门,下帧自愈）
        const px = ax + (seg.dx + st.dx) * S;
        const py = ay + (seg.dy + st.dy) * S;
        // 玩家 20 帧表默认朝右（与城镇 NPC 相反）→ direction 1 不翻、-1 镜像
        // （Renderer 实体玩家同式 scale(facing,1),Renderer.ts:16007-16008）
        const flip = st.look < 0 ? -1 : 1;
        ctx.save();
        ctx.globalAlpha = st.opacity * displayOpacity;   // opacityForAnimation *= DisplayOpacity（:189）
        ctx.translate(px, py);
        ctx.scale(flip * S, S);
        // 贴底 +4（原版全层 Position.Y+height−frameH+4,Renderer.ts:16223-16225 同源）
        ctx.drawImage(doll, 0, 0, FRAME_W, FRAME_H, -FRAME_W / 2, -FRAME_H + 4, FRAME_W, FRAME_H);
        ctx.restore();
        continue;
      }
    }
  }
}

/** 求值态初值（导出=测试消费面） */
export function blankState(): EvalState {
  return {
    alphaNpc: 0, opacity: 1, dx: 0, dy: 0, rot: 0, look: 1,
    seq: null, frame: null, moving: false, party: false, blink: false,
    vy: 0, restRow: null,
  };
}

/** hsl → rgb（Main.hslToRgb(h,1,0.5) 近似——文字彩虹阴影用） */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, tt: number): number => {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// ---- 单例装配 + 渲染/模拟消费口 ----

let overlay: CreditsRollOverlay | null = null;

/** 装配演出（mainFlow createFlow 一次；root 形参保留=旧 DOM 宿主位,BJ409 起演出
 *  画进 Renderer 世界画布,不再自建 canvas）。canPlay 由装配侧注入
 *  （musicBoxStyle===85 → hasCreditsSceneMusicBox ∪ creditsRoll.isEventOngoing） */
export function mountCreditsRollOverlay(_root: HTMLElement,
  deps: CreditsRollOverlayDeps): CreditsRollOverlay {
  if (!overlay) overlay = new CreditsRollOverlay(deps);
  return overlay;
}

/** CreditsRollSky.Update 消费口——Game 60Hz 固定档调（creditsRoll.updateTime 同帧位；
 *  原版 = Main.cs:17317 SkyManager.Instance.Update 每 Main.Update 帧） */
export function tickCreditsRollSky(): void {
  overlay?.tick();
}

/** CreditsRollSky.Draw 消费口——Renderer 背景段 DrawRemainingDepth 等价位调
 *  （drawLanternsNear/drawPartyBalloonsNear 同槽）。S = 相机 zoom。 */
export function drawCreditsRollSky(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
  zoom: number): void {
  overlay?.drawInto(ctx, viewW, viewH, zoom);
}

/** 探针/测试钩子：当前演出时间线（懒构建） */
export function creditsRollSegmentsForProbe(): { count: number; endTime: number } {
  const fill = getCreditsRollFill(true);
  return { count: fill.segments.length, endTime: fill.endTime };
}

// ---- 类型再出口（测试消费） ----
export type { Seg };

// 虚空透镜弹 734（VoidLensProj——虚空袋对 4131/5325 shoot，孤儿武器 B3 波工单1）。
// SetDefaults（Projectile.cs:7728-7736）：30×24 / aiStyle 154 / tileCollide=false /
// timeLeft=10800（3 分钟自灭）/ alpha=255 / drawLayer=3。
// AI_154_VoidLens（Projectile.cs:53071-53101）：
//   · Main.CurrentFrameFlags.HadAnActiveInteractableProjectile = true——右键交互标的
//     （IsInteractable :80571-80590 case 734；TryGetContainerIndex :80568 → chest=-5 =
//     玩家 bank4 void vault）
//   · 同主同型去重（:53074-53087）：双端收敛 timeLeft 小者（先出生）被杀
//   · velocity ×0.94/t 恒衰减、direction=1
//   · frameCounter 每 5t 步进循环 8 帧（projFrames[734]=8,Main.cs:8643）
//   · Opacity += 0.03 → 封顶 1（出生淡入）
//   · VoidLensHelper.Update()（GameContent/VoidLensHelper.cs:28-45）：AddLight 紫
//     (0.4,0.2,0.9) + 尘 86/88 吸附涡流（1/3 掷，径向收束视觉近似）
// 面板开合/追踪在 Game（TryInteractingWithVoidLens Main.cs:38403-38400 段 + Player.cs:
// 31245 HandleBeingInChestRange 的 voidLensChest 支）——本实体只承载 AI 与存活。
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { Entity } from './Entity';

const FRAMES = 8;           // projFrames[734]（Main.cs:8643）
const FRAME_TICKS = 5;      // frameCounter>=5 一帧（:53089-53095）
const TIME_LEFT_MAX = 10800;

export class VoidLensProj extends Entity {
  declare w: number;
  declare h: number;
  readonly projId = 734;
  dead = false;
  /** 原版 Opacity（:53096-53101 出生淡入 0.03/t 至 1；绘制乘色） */
  opacity = 0;
  private frameCounter = 0;
  private frame = 0;
  /** 原版 timeLeft（Update 递减，≤0 Kill——3 分钟静默自灭;同 FlyingPiggyBank 口径） */
  timeLeft = TIME_LEFT_MAX;
  /** 智能光标交互态回写位（同 FlyingPiggyBank.interactState；纯鼠标路径恒 0 不画） */
  interactState = 0;

  constructor(x: number, y: number, vx: number, vy: number) {
    super();
    this.w = 30; this.h = 24;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
  }

  override fixedUpdate(_dt: number, game: GameHooks): void {
    // 帧机（:53089-53095）：frameCounter++ 每 5t 一帧,循环 [0..7]
    if (++this.frameCounter >= FRAME_TICKS * FRAMES) this.frameCounter = 0;
    this.frame = Math.floor(this.frameCounter / FRAME_TICKS);

    // 淡入（:53096-53101）
    if (this.opacity < 1) this.opacity = Math.min(1, this.opacity + 0.03);

    // 同主同型去重（:53074-53087）：timeLeft 大者留（后出生），小者自杀——
    // 双端一致收敛（新透镜顶旧透镜）。Vanilla 用 whoAmI 升序扫描含双向杀，
    // 本仓 FlyingPiggyBank 同款写法
    for (const o of game.projectiles?.() ?? []) {
      if (!(o instanceof VoidLensProj) || o === this || o.dead) continue;
      if (this.timeLeft >= o.timeLeft) o.dead = true;
      else { this.dead = true; return; }
    }

    // velocity *= 0.94f（:53088）+ 直线位移（tileCollide=false 无碰撞）
    this.vx *= 0.94;
    this.vy *= 0.94;
    this.x += this.vx;
    this.y += this.vy;

    // 尘涡流（VoidLensHelper.SpawnVoidLensDust :34-72 的视觉子集）：1/3 掷,
    // 径向内旋吸附（原版 dust.customData 绘制驱动改轴向——canvas 侧以 spawnParticles
    // 定向近似,登记非 1:1）
    if (Math.random() < 1 / 3) {
      const ang = Math.random() * Math.PI * 2;
      const sx = -Math.sin(ang) * (Math.random() < 0.5 ? 1 : -1);
      game.spawnParticles?.(this.cx, this.cy, '#c87aff', 1, 2,
        { life: 22, damp: 0.9, grav: 0, size: 2, vx: sx, vy: 0 });
    }

    // AddLight(0.4,0.2,0.9)（Helper.Update :30）——世界坐标光源
    game.addLightAt?.(this.cx, this.cy, 0.4, 0.2, 0.9);

    // timeLeft（Update 每 tick 递减,≤0 Kill）
    if (--this.timeLeft <= 0) this.dead = true;
  }

  override draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage('vanilla/Projectile_734.png');
    const ctx = r.ctx;
    if (!ctx || !img) return;
    // 竖排 8 帧条（贴图异常回退整图）
    const fh = img.height >= FRAMES ? img.height / FRAMES : img.height;
    const useStrip = Number.isFinite(fh) && fh >= 1 && img.height >= FRAMES;
    const sy = useStrip ? Math.round(this.frame * fh) : 0;
    const sh = useStrip ? Math.round(fh) : img.height;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.opacity));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, sy, img.width, sh, -img.width / 2, -sh / 2, img.width, sh);
    ctx.restore();
    // 选圈：VoidLensHelper.DrawToDrawData selectionMode 非 0 时叠 Extra_93 呼吸光晕
    // （:97-105）。纯鼠标路径 TryInteractingWithVoidLens 恒 selectionMode=0（飞猪注：
    // Main.cs 智能光标路径才有 num497∈{1,2}）——本仓同步 via Game 回写 interactState
    if (this.interactState > 0 && useStrip) {
      // ★B3-1 回归修复(2026-08-30):原版用 TextureAssets.Extra[93](VoidLensHelper.cs
      // :103,1456/1457/1458 三版一致);Extra[94] 是飞猪选圈(Main.cs 悬停段 proj 525/960,
      // num500=94——本仓 FlyingPiggyBank 同源)。尺寸实证:Extra_93=34×384 与
      // Projectile_734 的 34×48×8 帧栅格完全同构,Extra_94=34×170 对不上。
      const sel = r.atlas?.ensureVImage('vanilla/Extra_93.png');
      if (sel) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4;
        ctx.drawImage(sel, 0, sy, img.width, sh, -img.width / 2, -sh / 2, img.width, sh);
        ctx.restore();
      }
    }
  }
}

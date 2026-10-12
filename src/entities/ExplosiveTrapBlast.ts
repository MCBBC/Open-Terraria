// ★BJ650件4（2026-10-12,R15-F6 登记债清偿）：爆炸机关弹 694/695/696 视觉面。
// 伤害面由塔体 691-693 直伤臂承载（BJ630 判例——本弹体零伤害=离散链同相,勿双伤）。
//
// 原版锚（Terarria1457 反编译亲读）：
//  · 生成（AI_138_ExplosiveTraps Projectile.cs:70440）：NewProjectile(base.Center
//    +(0,−num2), Vector2.Zero, num, damage, knockBack, owner)——num2=48（携行支
//    −14=34,:70402）;num = 694/695/696（塔 691/692/693 → +3 映射 :70381-70387）。
//  · SetDefaults（:7356-7366）：aiStyle=139、friendly、tileCollide=false、
//    penetrate=−1、usesLocalNPCImmunity+localNPCHitCooldown=30、alpha=255、
//    width=height=144。projFrames[694]=4/[695]=4/[696]=5（Main.cs:8609-8611）。
//  · AI_139_ExplosiveTrapExplosion（:70466-70490）：
//      alpha −= 25/拍（<0 归 0,:70470-70474）——GetAlpha 694-696 特支
//      （Projectile.cs:81026-81029）= Color(255,255,255,127)×(1−alpha/255)【字面色
//      不取光照=自发光】;XNA Color×float 逐字节截断 → k=1−α/255 渐显。
//      帧机（:70480-70487,= :70487-70489 登记锚）：++frameCounter≥3 → ++frame,
//      frame ≥ projFrames → Kill()（存活 12/12/15 拍）。
//      光带（:70488-70489）：DelegateMethods.v3_1=(1.3,0.9,0.2) +
//      Utils.PlotTileLine(base.Top, base.Bottom, 2f, CastLightOpen)——盒顶→盒底
//      竖直段宽 2px（PlotTileLine/Utils.cs:2462-2485：±1px 横向偏移带,主列
//      ±1 列同格合并）逐【开放格】（CastLightOpen DelegateMethods.cs:729-748：
//      !active∨inActive∨solidTop∨!solid）Lighting.AddLight(1.3,0.9,0.2)——
//      强度不随 α 衰减,弹灭即停。
//  · 绘制（Main.cs:32522-32546 DrawProjDirect 694-696 专支）：锚 = proj.Bottom
//    +(0,gfxOffY)（:32524 position17）、源矩形 = Frame(1,projFrames,0,frame)
//    （:32525 竖条帧切片）、origin = 帧尺寸×(0.5,1) 后 Y−8（:32526-32527）且
//    694/695 再 X+3（:32530-32532 (uint)(type−694)<=1u 两型档）、rotation=0
//    （AI_139 零 rotation 写,spriteDirection 缺省 1=dir None）。双笔：
//    color75 = GetAlpha(projectileColor)（:32534——Lerp(·,White,0f)=恒等链）
//    本体 + color75×0.3 × scale×1.1（:32536 第二笔）。
//  · MP 面：本仓塔臂仅 owner 权威模拟（BJ630 既有口径）——爆炸弹视觉实体
//    本地生成不广播,访客侧缺爆花（登记债,与蘑菇弹 broadcastParticleOrchestra
//    先例同族待编排通道）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** XNA Color×float 逐字节截断（FNA operator*(Color,float)=(byte)(c×f)） */
const xnaByte = (v: number): number => Math.max(0, Math.min(255, Math.trunc(v)));

export class ExplosiveTrapBlastProj extends Entity {
  readonly projId: number;
  w = 144; h = 144;                                     // SetDefaults :7364-7365
  /** SetDefaults alpha=255（:7363）——AI_139 逐拍 −25 渐显驱动面 */
  alpha = 255;
  /** 帧机（frameCounter/frame 镜像 :70480-70487） */
  private fc = 0;
  private fr = 0;
  dead = false;

  /** x,y = 塔心+(0,−num2) 的盒左上（CenteredRectangle 语义:盒心=该点,w=h=144） */
  constructor(cx: number, cy: number, projId: 694 | 695 | 696) {
    super();
    this.projId = projId;
    this.x = cx - this.w / 2;
    this.y = cy - this.h / 2;
  }

  /** 帧高（Frame(1,projFrames,0,frame) 行高——懒查贴图,未就绪拍按盒几何照跑帧机） */
  private frameH(imgH: number): number {
    const frames = this.projId === 696 ? 5 : 4;          // projFrames :8609-8611
    return Math.max(1, Math.floor(imgH / frames));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.dead) return;                             // Kill 后不再见（原版弹出 Main.projectile）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // ---- AI_139 :70467-70474 alpha 渐显 ----
    this.alpha -= 25;
    if (this.alpha < 0) this.alpha = 0;
    // ---- 帧机 :70480-70487（3t/帧,满帧 Kill）----
    if (++this.fc >= 3) {
      this.fc = 0;
      if (++this.fr >= (this.projId === 696 ? 5 : 4)) {
        this.dead = true;                                // Kill()（:70483-70485）
        return;
      }
    }
    // ---- 光带 :70488-70489（PlotTileLine Top→Bottom 宽 2,CastLightOpen）----
    // 主列 = 盒心列;±1px 带偏移 → dxMin/dxMax ∈ {−1,0,1} 同列合并（Utils.cs:2477-2485
    // lineMinOffset/lineMaxOffset 逐行水平子线）。行域 = Top 行 .. Bottom 行。
    const st = game.world?.store;
    if (st) {
      const cxp = this.x + this.w / 2;
      const colMid = Math.floor(cxp / 16);
      const dxMin = Math.floor((cxp - 1) / 16) - colMid;
      const dxMax = Math.floor((cxp + 1) / 16) - colMid;
      const j0 = Math.max(0, Math.floor(this.y / 16));
      const j1 = Math.floor((this.y + this.h) / 16);
      for (let j = j0; j <= j1; j++) {
        for (let d = dxMin; d <= dxMax; d++) {
          const i = colMid + d;
          // CastLightOpen（DelegateMethods.cs:729-748）：开放格才加光
          //（!active ∨ solidTop(平台) ∨ !solid;inActive 致动面本仓无独立旗=并入 !isActive 近似,登记）
          if (!st.inBounds(i, j)) continue;
          if (st.isActive(i, j) && st.isSolid(i, j) && !st.isPlatform(i, j)) continue;
          game.addLightAt?.(i * 16 + 8, j * 16 + 8, 1.3, 0.9, 0.2);
        }
      }
    }
  }

  /** Main.cs:32522-32546 专支 1:1——自发光字面色 → pushGlowOps 合成后逃逸
   *  （BJ621 迁层习语/R15-F1 FLAMEBURST 辉光同判例;染色弹染料面与字面色替换序
   *  =原版 EntitySpriteDraw 先染后乘,本仓 glow 通道未接染料=登记近似）。 */
  draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage(`vanilla/Projectile_${this.projId}.png`) ?? null;
    if (!img || !(img.width > 0)) return;
    const ctx = r.ctx;
    if (!ctx) return;
    const fh = this.frameH(img.height);
    const fw = img.width;
    // GetAlpha 特支（Projectile.cs:81026-81029）：Color(255,255,255,127)×(1−α/255)
    const k = 1 - this.alpha / 255;
    const c1 = xnaByte(255 * k);                         // color75.R=G=B
    const a1 = xnaByte(127 * k);                         // color75.A
    const c2 = xnaByte(c1 * 0.3);                        // 第二笔 color75×0.3（:32536）
    const a2 = xnaByte(a1 * 0.3);
    // 锚 = proj.Bottom + (0,gfxOffY)（:32524）;origin = (fw/2 [+3 694/695], fh−8)
    const ox = fw / 2 + (this.projId <= 695 ? 3 : 0);    // :32530-32532
    const oy = fh - 8;                                   // :32526-32527
    const push = r as unknown as {
      pushGlowOps?: (ops: Array<{
        tex: string; sx: number; sy: number; sw: number; sh: number;
        dx: number; dy: number; dw?: number; dh?: number;
        blend: 'add' | 'over'; tint: [number, number, number]; alpha: number;
      }>, m: DOMMatrix) => void;
    };
    ctx.save();
    ctx.translate(this.cx, this.y + this.h);             // Bottom 锚（gfxOffY 恒 0）
    const m = ctx.getTransform();
    push.pushGlowOps?.([
      { tex: `vanilla/Projectile_${this.projId}.png`,
        sx: 0, sy: this.fr * fh, sw: fw, sh: fh,
        dx: -ox, dy: -oy,
        blend: 'over', tint: [c1 / 255, c1 / 255, c1 / 255], alpha: a1 / 255 },
      { tex: `vanilla/Projectile_${this.projId}.png`,
        sx: 0, sy: this.fr * fh, sw: fw, sh: fh,
        dx: -ox * 1.1, dy: -oy * 1.1, dw: fw * 1.1, dh: fh * 1.1,   // scale×1.1（:32536）
        blend: 'over', tint: [c2 / 255, c2 / 255, c2 / 255], alpha: a2 / 255 },
    ], m);
    ctx.restore();
  }
}

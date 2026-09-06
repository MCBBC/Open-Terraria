// 飞猪存钱罐弹幕 525（FlyingPiggyBank——钱币槽 Item 3213 shoot）。
// SetDefaults（Projectile.cs:5955-5963）：30×24 / aiStyle 97 / tileCollide=false /
// timeLeft=10800（3 分钟自灭）/ drawLayer=3（渲染层级,本仓投射物桶单层,登记）。
// AI_097（Projectile.cs:33640-33744）1:1：
//   帧机 frameCounter++ 4t/步循环 [0,1,2,3,4,3,2,1]（projFrames[525]=5,Main.cs:8618）；
//   同主同型去重（:33682-33698）：timeLeft 大者（后出生）杀 timeLeft 小者（先出生）；
//   ai[0]==0 抛出段 velocity×0.94/t，|v|<0.1 → v 清零、ai[0]=1、ai[1]=45；
//   ai[0]==1 悬停段：Y 浮动 ai[1]++ / vy += ai[1]>0 ? -0.005 : +0.005，ai[1]≥90 反向
//   ——**不水平跟随玩家**（direction 仅随玩家侧翻转，spriteDirection 同步），
//   停驻原地悬停（钱币槽=空中放置的便携存钱罐）。
// 容器：TryGetContainerIndex（Projectile.cs:80559-80566）type 525/960 → chest=-2，
// 与 Chester 960 共用玩家 piggyBankProjTracker（Game.containerTrackedPet）。
// 绘制：Projectile_525 竖排 5 帧 + GlowMask[169] 同帧叠加（Main.cs:26644-26646，
// Color(200,200,200,100)）+ draw origin Y=frameHeight/2+5（Main.cs:30143 num151=5
// 类型项 → 图形相对中心上移 5px）。
// 悬停选圈 Extra_94（Main.cs:35128-35141）：仅智能光标路径 num497∈{1,2} 才画
// （纯鼠标路径 :38488 恒返回 0——GetSelectionGlowColor Colors.cs:127-130 未选中灰
// avg/2 / 选中暖 avg,avg,avg/3，avg=本体格光照亮度，≤10 不画）。
import type { GameHooks } from './types';
import type { Camera } from '../render/Camera';
import type { Renderer } from '../render/Renderer';
import { Entity } from './Entity';
import { projectileWetSection } from './projWetSection';
import { projectileData } from '../data/vanillaProjectiles';

const FRAME_SEQ = [0, 1, 2, 3, 4, 3, 2, 1];
const FRAMES = 5;          // projFrames[525]（Main.cs:8618）
const TIME_LEFT_MAX = 10800;

export class FlyingPiggyBank extends Entity {
  declare w: number;
  declare h: number;
  /** ai[0]：0=抛出减速段 / 1=悬停段 */
  private phase = 0;
  /** ai[1]：悬停浮动相位（入悬停置 45，≥90 反向，:33699-33743） */
  private bob = 0;
  private frameCounter = 0;
  private frame = 0;
  /** 原版 direction（速度/玩家侧符号），draw 折算 spriteDirection 翻转 */
  private dir = 1;
  /** 智能光标交互态（Main.cs:35128 num497：0 无 / 1 射程内 / 2 光标命中）——
   *  Game 每 tick 回写（TryInteractingWithMoneyTrough :38407 同门），驱动选圈 */
  interactState = 0;
  /** 原版 timeLeft（Update :15861 每 tick 递减，≤0 Kill——3 分钟静默自灭） */
  timeLeft = TIME_LEFT_MAX;

  // ---- ★通用湿段（Projectile.cs:16895-17113 全体弹共用段;2026-09-06 杂项弹簇批）----
  //  豁免核对：525 SetDefaults（P.cs:5955-5963：30×24/aiStyle 97/tileCollide=false/
  //  timeLeft 10800）【无 ignoreWater 行】= 受段（projectileData 数据面同向）。
  //  阻尼不适用：tileCollide=false → HandleMovement :17721 湿支不进（位移全速,
  //  与湿段批 Misc 簇钩爪/链锯同谳）。
  //  插位=tick 头：AI_097 只写 velocity（×0.94/浮点),位移在分支尾直写——采样位=
  //  上拍位移后 ≡ 原版 AI(:16880)后湿段(:16895)采样。杀拍口径（Arrow.ts ⑥配方
  //  逐位核）：本类杀位=同主同型去重（:33682-33698——活拍湿段【前】的 early return
  //  杀位）与 timeLeft 自灭（分支尾,湿段【后】）——tick 头单调用点两者天然覆盖,
  //  双调用点/防双跑机不适用。去重【被杀方】(o.dead=true 直写) 在原版=彼弹自身
  //  Update 外被 Kill（:33696）→ 彼弹湿段本拍本就不跑,同构。
  wet = false;
  lavaWet = false;
  honeyWet = false;
  shimmerWet = false;
  /** 出水溅花冷却窗（Projectile.wetCount :16984 置 10 / :17109-17112 逐拍 −1） */
  wetCount = 0;
  /** 出生预置已做（一次;NewProjectile :10886-10893 等价;共享体首调自做） */
  presetDone = false;
  /** 原版弹型 id（SetDefaults :5955-5963）——湿段按真 id 传参 */
  readonly projId = 525;

  constructor(x: number, y: number, vx: number, vy: number,
    private ownerRef: () => { cx: number; cy: number } | null) {
    super();
    this.w = 30; this.h = 24;
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
  }

  override fixedUpdate(_dt: number, game: GameHooks): void {
    // ---- ★通用湿段（:16895-17113,共享体;溅花尘/音=wetSplashStepShared 弹面 10 粒）----
    //  tick 头插位（杀拍覆盖/采样位论证见字段块头注）;tileCollide=false → 阻尼不适用。
    projectileWetSection(this, game, game.world.store, this.x, this.y, this.w, this.h,
      this.projId, !!projectileData(this.projId)?.ignoreWater);
    // 帧机（:33642-33680）：frameCounter++ 每 4t 一帧，序 [0,1,2,3,4,3,2,1] 循环
    if (++this.frameCounter >= FRAME_SEQ.length * 4) this.frameCounter = 0;
    this.frame = FRAME_SEQ[Math.floor(this.frameCounter / 4)];

    // 同主同型去重（:33682-33698）：双端一致收敛——timeLeft 小者（先出生）被杀，
    // 留后出生者（新猪顶旧猪；新猪 own tick 杀旧、旧猪 own tick 自杀）
    for (const o of game.projectiles?.() ?? []) {
      if (!(o instanceof FlyingPiggyBank) || o === this || o.dead) continue;
      if (this.timeLeft >= o.timeLeft) o.dead = true;
      else { this.dead = true; return; }
    }

    if (this.phase === 0) {
      // 抛出段（:33699-33720）：速度衰减，朝向随 vx；|v|<0.1 → v 清零入悬停
      if (Math.hypot(this.vx, this.vy) < 0.1) {
        this.vx = 0; this.vy = 0;
        this.phase = 1;
        this.bob = 45;
        return;
      }
      this.vx *= 0.94;
      this.vy *= 0.94;
      this.dir = this.vx < 0 ? -1 : 1;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    // 悬停段（:33721-33743）：朝向随玩家侧，Y 三角波浮动；**无水平跟随**
    const p = this.ownerRef();
    if (p) this.dir = p.cx < this.cx ? -1 : 1;
    this.bob++;
    this.vy += this.bob > 0 ? -0.005 : 0.005;
    if (this.bob >= 90) this.bob *= -1;
    this.x += this.vx;
    this.y += this.vy;

    // timeLeft（Update :15861 每 tick 递减，≤0 Kill；被追踪时 Game T2 经
    // 感知消亡 → 关面板 + 关猪音 Item59）
    if (--this.timeLeft <= 0) this.dead = true;
  }

  override draw(r: Renderer, _cam: Camera): void {
    const img = r.atlas?.ensureVImage('vanilla/Projectile_525.png');
    const ctx = r.ctx;
    if (!ctx || !img) return;
    // 竖排 5 帧帧条（贴图异常回退整图）
    const fh = img.height >= FRAMES ? img.height / FRAMES : img.height;
    const useStrip = Number.isFinite(fh) && fh >= 1 && img.height >= FRAMES;
    const sy = useStrip ? Math.round(this.frame * fh) : 0;
    const sh = useStrip ? Math.round(fh) : img.height;
    // num151=5（Main.cs:30143）：origin Y = frameHeight/2 + 5 → 图形相对中心上移 5px
    const flip = this.dir < 0;
    ctx.save();
    ctx.translate(this.cx, this.cy - 5);
    ctx.imageSmoothingEnabled = false;
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, 0, sy, img.width, sh, -img.width / 2, -sh / 2, img.width, sh);
    // GlowMask[169] 同帧叠加（Main.cs:26644-26646，Color(200,200,200,100)——
    // canvas 等价 lighter 加色 × alpha 100/255）
    const glow = r.atlas?.ensureVImage('vanilla/Glow_169.png');
    if (glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 100 / 255;
      ctx.drawImage(glow, 0, sy, img.width, sh, -img.width / 2, -sh / 2, img.width, sh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // 悬停选圈 Extra_94（Main.cs:35128-35141，仅智能光标路径 num497∈{1,2}——
    // GetSelectionGlowColor Colors.cs:127-130：射程内灰 avg/2、光标命中暖 avg；
    // avg=本体格光照亮度，≤10 不画；帧矩形高 -1 裁缝 :35135；SpriteBatch color
    // 参数=乘色 → canvas 用离屏 source-in 染色等价）
    if (this.interactState > 0 && useStrip) {
      const g = (r as unknown as { game?: { lighting?: { lightAt(tx: number, ty: number): number[] } } }).game;
      const lv = g?.lighting?.lightAt(Math.floor(this.cx / 16), Math.floor(this.cy / 16)) ?? [255, 255, 255];
      const avg = Math.round((lv[0] + lv[1] + lv[2]) / 3);
      const sel = avg > 10 ? r.atlas?.ensureVImage('vanilla/Extra_94.png') : null;
      if (sel) {
        const tinted = document.createElement('canvas');
        tinted.width = img.width; tinted.height = Math.max(1, sh - 1);
        const tc = tinted.getContext('2d');
        if (tc) {
          tc.drawImage(sel, 0, sy, img.width, sh - 1, 0, 0, img.width, sh - 1);
          tc.globalCompositeOperation = 'source-in';
          tc.fillStyle = this.interactState === 2
            ? `rgb(${avg},${avg},${Math.round(avg / 3)})`
            : `rgb(${Math.round(avg / 2)},${Math.round(avg / 2)},${Math.round(avg / 2)})`;
          tc.fillRect(0, 0, tinted.width, tinted.height);
          ctx.save();
          ctx.translate(this.cx, this.cy - 5);
          ctx.imageSmoothingEnabled = false;
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(tinted, -img.width / 2, -sh / 2);
          ctx.restore();
        }
      }
    }
  }
}

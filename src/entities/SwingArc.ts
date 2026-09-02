// 真刃系旋斩弧家族 1:1（AI_190_NightsEdge Projectile.cs:39416-39557 + 各 Draw 方法）：
//   972 永夜刃（273 锚弧 + 飞斩变体）/982 圣剑（368）/983 真断钢（674）/
//   997 无头骑士剑（1826）/984 泰拉刃（757，原 TerraArc 并入本表）。
//   AI：t++；num=t/ai1；rotation=π×ai0×num + vel角(0|π) + ai0×π；
//   Center=MountedCenter−vel（vel=(dir,0)）；scale=(num6+num×num5)×ai2；
//   t≥ai1 Kill。984 首帧 Item60×0.65；按型号尘块（278/107 火花近似粒子）。
//   绘制（DrawProj_NightsEdge :27398 / Excalibur :27455 / TheHorsemansBlade :27494 /
//   TrueExcalibur :27533 / TerraBlade2 :27630）：同骨架——Frame(1,4) 四帧、
//   origin 中心、scale×1.1、ai0<0 → FlipVertically、num3=Remap(num,0,.6,0,1)×
//   Remap(num,.6,1,1,0) 包络、光照因子 fromValue（取 1 近似）、深色底×张开角
//   −π/4×ai0×(1−num) + 内芯 + 主色 + 帧3 白芯层组。972 无帧3 三层（单层 0.3）。
//   刀尖星尘闪光 = DrawPrettyStarSparkle 原语（:27424/:27527-27530/:27568-27571/
//   :27627/:27664-27667，经 Renderer.prettyStarSparkle——参数表见下方 SWING_SPARKLE）。
//   997 命中召南瓜弹 321 已实装（Projectile.cs:13728-13732 → Player.HorsemansBlade_
//   SpawnPumpkin :42444-42462）——SwingArc 命中处生成，弹体见文件尾 HorsemansPumpkin。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playerCanHitEnemy, canBeChasedBy, applyBannerDamageDealt } from './projTargets';
import { projectileSnapStrikeBonus } from '../stats/SnapStrike';
import { prettyStarSparkle } from '../render/Renderer';
import { canHitLine } from '../physics/LineOfSight';
import { drawStripTrail } from '../fx/TrailShader';
import { cutTilesBox } from './ProjCutTiles';
// L5 长尾批：真刃系挥弧命中编排（Projectile.Damage case972-985 收编池）
import { nightsEdgeFx, trueNightsEdgeFx, excaliburFx, trueExcaliburFx, terraBladeFx } from '../fx/orchestraFx';
import { ParticleOrchestraType } from '../net/syncModules';

interface ArcOwner { cx: number; cy: number; x: number; y: number; w: number; h: number; facing: number; dead: boolean }

/** 型号参数（AI_190 :39428-39441 switch）：num5=scale 增速 / num6=基数 */
interface SwingStyle {
  num5: number;
  num6: number;
  /** 深色底（layer1） */
  c1: [number, number, number];
  /** 主亮色（color2） */
  c2: [number, number, number];
  /** 内芯亮色（color3） */
  c3: [number, number, number];
  /** 帧3 白芯三层（Excalibur 族有 / NightsEdge 无） */
  frame3Trio: boolean;
  /** AI_190 首帧音（唯 984） */
  snd?: string;
}

const SWING_STYLE: Record<number, SwingStyle> = {
  972: { num5: 0.2, num6: 1, c1: [40, 20, 60], c2: [80, 40, 180], c3: [80, 30, 160], frame3Trio: false },
  982: { num5: 0.6, num6: 1, c1: [180, 160, 60], c2: [255, 240, 150], c3: [255, 255, 80], frame3Trio: true },
  983: { num5: 1.0, num6: 1.2, c1: [180, 50, 90], c2: [255, 240, 150], c3: [255, 255, 80], frame3Trio: true },
  997: { num5: 0.6, num6: 1, c1: [193, 43, 43], c2: [247, 115, 0], c3: [255, 202, 130], frame3Trio: true },
  984: { num5: 0.6, num6: 1, c1: [45, 124, 205], c2: [181, 230, 29], c3: [34, 177, 76], frame3Trio: true, snd: 'Item_60' },
};

/** 通用旋斩弧（原 TerraArc 泛化） */
export class SwingArc extends Entity {
  w = 16; h = 16;
  damage: number;
  /** 弹体击退（NewProjectile KnockBack 实参；997 命中召南瓜弹 321 透传用） */
  kb = 6.5;
  projId: number;
  ai0: number;
  ai1: number;
  ai2: number;
  private style: SwingStyle;
  private t = 0;
  private rot = 0;
  private scaleCur = 1;
  op = 0;
  private owner: ArcOwner;
  private hitSet = new Set<number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  lightRGB: [number, number, number] | null = null;

  constructor(owner: ArcOwner, projId: number, animMax: number, damage: number, facing: number, scale: number) {
    super();
    this.owner = owner;
    this.projId = projId;
    this.style = SWING_STYLE[projId] ?? SWING_STYLE[972];
    this.ai0 = facing;
    this.ai1 = Math.max(1, animMax);
    this.ai2 = scale;
    this.damage = damage;
  }

  get num(): number { return this.t / this.ai1; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t === 1 && this.style.snd) game.playSfxFiles([this.style.snd], 0.65, this.cx, this.cy);
    if (this.owner.dead) { this.dead = true; return; }
    const num = this.num;
    this.rot = Math.PI * this.ai0 * num + (this.ai0 > 0 ? 0 : Math.PI) + this.ai0 * Math.PI;
    this.x = this.owner.cx - this.w / 2 - Math.sign(this.ai0);
    this.y = this.owner.cy - this.h / 2;
    this.scaleCur = (this.style.num6 + num * this.style.num5) * this.ai2;
    this.op = Math.min(1, Math.max(0, num / 0.6)) * (num <= 0.6 ? 1 : Math.max(0, (1 - num) / 0.4));
    this.lightRGB = [this.style.c2[0] / 255 * 0.4, this.style.c2[1] / 255 * 0.4, this.style.c2[2] / 255 * 0.4];
    // CutTiles（Projectile.cs:11824 全弹幕旁路——972/982/983/997/984 均不在
    // CanCutTiles 排除表）→ 旋斩扫过的瓦罐/杂草同步砍断（cutTilesBox 弹盒+1 外沿）
    cutTilesBox(game, this.cx - 85 * this.scaleCur, this.cy - 60 * this.scaleCur,
      170 * this.scaleCur, 120 * this.scaleCur);
    // 尘近似（AI_190 各型号 278/107/267 火花——按 num3 包络概率降采样）
    if (Math.random() < this.op * 0.5) {
      const a2 = this.rot + (Math.random() - 0.5) * Math.PI / 2;
      game.spawnParticles(this.cx + Math.cos(a2) * 84 * this.scaleCur,
        this.cy + Math.sin(a2) * 84 * this.scaleCur,
        `rgb(${this.style.c2[0]},${this.style.c2[1]},${this.style.c2[2]})`, 1, 1.4, { life: 18 });
    }
    // 命中：穿透（型号表）+ 同敌单跳（usesLocalNPCImmunity 族）
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; cx: number; cy: number; id: number; dead: boolean; dontTakeDamage?: boolean; spawnedFromStatue?: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitSet.has(e.id)) continue;
      const reach = 85 * this.scaleCur;
      const ex = this.cx + Math.cos(this.rot) * reach * 0.5;
      const ey = this.cy + Math.sin(this.rot) * reach * 0.5;
      const bw = reach, bh = 60 * this.scaleCur;
      if (!(ex - bw / 2 < e.x + e.w && ex + bw / 2 > e.x && ey - bh / 2 < e.y + e.h && ey + bh / 2 > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）①：锚弧（this.projId=972/982/983/997/984，数据面 melee）
      // → 焰爆石/拍击石双支（Projectile.cs:13439-13446）；加伤在 banner 外随暴击并入
      const snapBonusArc = projectileSnapStrikeBonus(game,
        { projId: this.projId }, (e as { cx?: number }).cx ?? e.x + e.w / 2,
        (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: e.cx, cy: e.cy },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusArc ? Math.trunc(snapBonusArc * (crit ? 2 : 1)) : 0),
        this.ai0 * 6.5, 0, game, this.armorPen, crit, 0, true);   // ★F1 旗乘区;fromPlayer=DPS 计
      this.hitSet.add(e.id);
      // ★L5 长尾批：挥弧命中编排（case972/982/983/984 面）;★δB1 MovementVector=弹速
      // =锚弧出生速度 (direction,0)（Player.cs:49441;AI_190 恒定不写 velocity）
      swordTrailOrchestra(game, this.projId, e, Math.sign(this.ai0) || 1, 0);
      // ★1457 无头骑士剑 997 命中召南瓜弹 321（Projectile.cs:13728-13732：门 =
      // (!immortal|flag9) && !SpawnedFromStatue && !CountsAsCritter——flag9 仅调试
      // 假人 488；dmg=damage×1f、kb=弹体击退）→ Player.HorsemansBlade_SpawnPumpkin
      // （Player.cs:42444-42462）屏外 ±半视口召 321 追击，见文件尾 HorsemansPumpkin
      if (this.projId === 997) {
        if (!e.dontTakeDamage && !e.spawnedFromStatue) {
          spawnHorsemansPumpkin(game, e.id, e.cx, e.cy, this.damage, this.kb);
        }
      }
    }
    if (this.t >= this.ai1) this.dead = true;
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(this.projId);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = img.width, fh = img.height / 4;
    const num = this.num;
    const sc = this.scaleCur * 1.1;                       // num = proj.scale×1.1
    const st = this.style;
    const layer = (frame: number, angOff: number, sy: number, rgb: [number, number, number], alpha: number) => {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot + angOff * this.ai0);
      if (this.ai0 < 0) ctx.scale(1, -1);                // effects（ai0<0 → FlipVertically）
      const dw = fw * sy * sc, dh = fh * sy * sc;
      ctx.drawImage(img, 0, frame * fh, fw, fh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    ctx.imageSmoothingEnabled = false;
    const op = this.op;
    // :27648 族骨架——深色底×张开角 + 内芯 0.15 + c3 0.3 + c2 主芯 + 帧3 白芯组
    layer(0, -Math.PI / 4 * (1 - num), 1, st.c1, 0.95 * op);
    layer(0, 0.01, 1, st.c3, 0.15 * op);
    layer(0, 0, 1, st.c3, 0.3 * op);
    layer(0, 0, 0.975, st.c2, 0.6 * op);
    if (st.frame3Trio) {
      layer(3, 0.01, 1, [255, 255, 255], 0.6 * op);
      layer(3, -0.05, 0.8, [255, 255, 255], 0.5 * op);
      layer(3, -0.1, 0.6, [255, 255, 255], 0.4 * op);
    } else {
      layer(3, 0.01, 1, [255, 255, 255], 0.3 * op);      // NightsEdge 单层（:27422）
    }
    this.drawSparkle(ctx, fw);
  }

  /** 刀尖星尘闪光（各 DrawProj_* 尾段的 DrawPrettyStarSparkle 组，1:1 参数）：
   *  - 972 永夜刃（:27424）：单笔 @刀尖（相位 Remap(num,0,1,0,π/2)·ai0）
   *  - 982 圣剑（:27527-27530）/ 997 无头骑士剑（同结构 :27527-27530 段）：8 笔
   *    循环（沿旋向 −2π·0.025·k 散布、径 (W/2−6)·sc）+ 刀尖大笔
   *  - 983 真断钢（:27568-27571）：12 笔（相位 Remap(num,0,0.6,0,0.95504415)、
   *    尺寸 ×0.75；shine=Lerp((255,255,80),(255,60,190),num3)——16 档量化防 tintCache 爆）
   *  - 984 泰拉刃（:27664-27667）：12 笔（相位 (k−2)）+ 大笔（fatness×1.5）
   *  flare/包络四参：num / fade(0,0.5,0.5,1)；draw=White(A0)×num3×0.5 → drawDim=op·0.5 */
  private drawSparkle(ctx: CanvasRenderingContext2D, fw: number): void {
    const num = this.num, op = this.op;
    if (op <= 0 || num >= 1) return;
    const sc = this.scaleCur * 1.1;
    const remap = (x: number, a: number, b: number, c: number, d: number): number =>
      x <= a ? c : x >= b ? d : c + ((d - c) * (x - a)) / (b - a);
    const WHITE: [number, number, number] = [255, 255, 255];
    const pos = (ang: number, r: number): [number, number] =>
      [this.cx + Math.cos(ang) * r, this.cy + Math.sin(ang) * r];
    const FADE: [number, number, number, number] = [0, 0.5, 0.5, 1];
    const spark = (x: number, y: number, shine: [number, number, number], rot: number,
      scale: [number, number], fat: [number, number], drawDim: number, shineDim = 1) => {
      prettyStarSparkle(ctx, 1, x, y, WHITE, shine, num,
        FADE[0], FADE[1], FADE[2], FADE[3], rot, scale, fat, drawDim, shineDim);
    };
    const tip = (phase: number): [number, number] => pos(this.rot + phase * this.ai0, (fw * 0.5 - 4) * sc);
    switch (this.projId) {
      case 972:   // :27424（drawColor=White×num3×0.5、shine=color2、rot=π/4、(2,2)/(1,1)）
        spark(...tip(remap(num, 0, 1, 0, Math.PI / 2)), [80, 40, 180],
          Math.PI / 4, [2, 2], [1, 1], op * 0.5);
        break;
      case 982:
      case 997: {
        // 8 笔循环（ang=rot+ai0·k·(−2π)·0.025+相位 π/4 段）+ 刀尖大笔
        const phase = remap(num, 0, 1, 0, Math.PI / 4);
        const shine: [number, number, number] = this.projId === 982 ? [255, 255, 80] : [255, 202, 130];
        const wide = remap(num, 0, 1, 3, 0), tall = remap(num, 0, 1, 4, 1);
        for (let k = 0; k < 8; k++) {
          const ang = this.rot + this.ai0 * k * (Math.PI * -2) * 0.025 + phase * this.ai0;
          const [x, y] = pos(ang, (fw * 0.5 - 6) * sc);
          spark(x, y, shine, ang, [0, wide * sc], [1 * sc, 1 * sc], op * (k / 9));
        }
        if (this.projId === 982) {
          spark(...tip(phase), shine, 0, [2 * sc, tall * sc], [1 * sc, 1 * sc], op * 0.5);
        } else {
          // 997 大笔：Vector2(Remap(num,0,1,4,1))（单分量构造 = 两轴同值）、rot=π/4
          spark(...tip(phase), shine, Math.PI / 4, [tall * sc, tall * sc], [1 * sc, 1 * sc], op * 0.5);
        }
        break;
      }
      case 983: {
        // 12 笔（相位 0.95504415 = 0.6·(π/2+π/4 折角)；尺寸 ×0.75）
        const phase = remap(num, 0, 0.6, 0, 0.95504415);
        const n5 = sc * 0.75;
        const tq = Math.round(op * 16) / 16;
        const shine: [number, number, number] = [255, 255 - 195 * tq, 80 + 110 * tq];
        const wide = remap(num, 0, 1, 3, 0), tall = remap(num, 0, 1, 4, 1);
        for (let k = 0; k < 12; k++) {
          const ang = this.rot + this.ai0 * k * (Math.PI * -2) * 0.025 + phase * this.ai0;
          const [x, y] = pos(ang, (fw * 0.5 - 6) * sc);
          spark(x, y, shine, ang, [0, wide * n5], [1 * n5, 1 * n5], op * (k / 12));
        }
        spark(...tip(phase), shine, 0, [2 * n5, tall * n5], [1 * n5, 1 * n5], op * 0.5);
        break;
      }
      case 984: {
        // 12 笔（相位 (k−2)）+ 大笔（fatness×num×1.5）
        const phase = remap(num, 0, 1, 0, Math.PI / 4);
        const shine: [number, number, number] = [34, 177, 76];
        const wide = remap(num, 0, 1, 3, 0), tall = remap(num, 0, 1, 4, 1);
        for (let k = 0; k < 12; k++) {
          const ang = this.rot + this.ai0 * (k - 2) * (Math.PI * -2) * 0.025 + phase * this.ai0;
          const [x, y] = pos(ang, (fw * 0.5 - 6) * sc);
          spark(x, y, shine, ang, [0, wide * sc], [1 * sc, 1 * sc], op * (k / 12));
        }
        spark(...tip(phase), shine, 0, [2 * sc, tall * sc], [1 * sc * 1.5, 1 * sc * 1.5], op * 0.5);
        break;
      }
      default:
        break;
    }
  }
}

/** 泰拉刃 984 兼容别名（Game.ts 旧引用） */
export const TerraArc = SwingArc;

/** 真永夜刃飞斩 973（AI_191 :39241-39332 + DrawProj_TrueNightsEdge :27574）：
 *  锚定伸长：Center=MountedCenter − vel + vel×num6²×77（最多前伸 76px）；
 *  rotation += ai0×2π×(4+4×Opacity)/90 旋进；scale=Remap(t,ai1+2,ai1+65,1.12,1)×ai2；
 *  Opacity=Remap(t,0,ai1,0,1)×Remap(t,ai1+50,ai1+65,1,0)；寿命 ai1+65（出生 32→97t）；
 *  t≥ai1(=num5)+3=80 清伤；近墙 80px 锥探测失败 → 速度阻尼 ×0.8/×0.88（>8 时）。
 *  绘制：oldPos 3 档残影（旧位 −vel×0.5×i + 旧旋 −ai0×2π×0.1×i）× 三向扇形四层。 */
export class TrueNightsEdgeSlash extends Entity {
  w = 30; h = 30;
  damage: number;
  ai0: number;
  ai1: number;
  ai2: number;
  /** ai1 出生日注入 32 */
  private t = 0;
  /** localAI[1] 伸长计数器 */
  private lai1 = 0;
  private rot = 0;
  private opacity = 0;
  private scaleCur = 1;
  /** 近墙阻尼标记 */
  private wallBlocked = false;
  private owner: ArcOwner;
  private hitCd = new Map<number, number>();
  critChance = 0.04;
  armorPen = 0;
  /** oldPos 残影环（3 档 + 当前） */
  private hist: Array<{ x: number; y: number; rot: number }> = [];

  constructor(owner: ArcOwner, vx: number, vy: number, damage: number, facing: number, animMax: number, scale: number) {
    super();
    this.owner = owner;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.ai0 = facing;
    this.ai1 = animMax;
    this.ai2 = scale;
  }

  get num(): number { return this.t / this.ai1; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    this.lai1++;
    const num3 = this.ai1 + 50, num4 = this.ai1 + 65, num5 = 77;
    this.opacity = Math.min(1, Math.max(0, this.t / this.ai1))
      * (this.t <= num3 ? 1 : Math.max(0, (num4 - this.t) / 15));
    if (this.t >= num4) { this.dead = true; return; }
    // t≥num5+3(80) 清伤（纯视觉尾段）
    if (this.t >= num5 + 3) this.damage = 0;
    const owner = this.owner;
    if (owner.dead) { this.dead = true; return; }
    // 近墙锥探测（:39286-39304：±22.5° 三射线 80px CanHit，全遮 → 阻尼）
    if (!this.wallBlocked && this.damage > 0) {
      const va = Math.atan2(this.vy, this.vx);
      let clear = false;
      for (let k = -1; k <= 1 && !clear; k += 0.5) {
        const a = va + k * (Math.PI / 4) * 0.25;
        const ok = (game.world.store.inBounds(Math.floor((this.cx + Math.cos(a) * 80) / 16), Math.floor((this.cy + Math.sin(a) * 80) / 16))
          && !game.world.store.isSolid(Math.floor((this.cx + Math.cos(a) * 80) / 16), Math.floor((this.cy + Math.sin(a) * 80) / 16)));
        if (ok) clear = true;
      }
      if (!clear) this.wallBlocked = true;
    }
    if (Math.hypot(this.vx, this.vy) > 8) {
      this.vx *= 0.94; this.vy *= 0.94;
      if (this.wallBlocked && Math.hypot(this.vx, this.vy) > 8) { this.vx *= 0.8; this.vy *= 0.8; }
      if (this.wallBlocked) { this.vx *= 0.88; this.vy *= 0.88; }
    }
    // 锚定伸长（:39309-39312）
    const num6 = Math.min(1, Math.max(0, (this.lai1 - this.ai1 * 0.4) / (num4 - this.ai1 * 0.4)));
    const vd = Math.hypot(this.vx, this.vy) || 1;
    this.x = owner.cx - this.w / 2 + (this.vx / vd) * (-1 + num6 * num6 * num5);
    this.y = owner.cy - this.h / 2 + (this.vy / vd) * (-1 + num6 * num6 * num5);
    this.rot += this.ai0 * Math.PI * 2 * (4 + this.opacity * 4) / 90;
    this.scaleCur = (1.12 - 0.12 * Math.min(1, Math.max(0, (this.t - this.ai1 - 2) / (num4 - this.ai1 - 2)))) * this.ai2;
    this.hist.push({ x: this.cx, y: this.cy, rot: this.rot });
    if (this.hist.length > 4) this.hist.shift();
    // 尘（:39317-39330：尘 14 1/5 + 75/27 ×3Opacity——降采样近似）
    if (Math.random() < this.opacity * 0.6) {
      const f = this.rot + (Math.random() - 0.5) * 1.1;
      game.spawnParticles(this.cx + Math.cos(f) * 84 * this.scaleCur, this.cy + Math.sin(f) * 84 * this.scaleCur,
        Math.random() < this.opacity ? '#9BE864' : '#5028B4', 1, 1.4, { life: 18 });
    }
    // 命中（穿透 3；免疫 5t）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    if (this.damage > 0) {
      const reach = 85 * this.scaleCur;
      for (const ent of game.enemies()) {
        if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892）
        const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
        if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
        const ex = this.cx + Math.cos(this.rot) * reach * 0.5;
        const ey = this.cy + Math.sin(this.rot) * reach * 0.5;
        if (!(ex - reach / 2 < e.x + e.w && ex + reach / 2 > e.x && ey - 30 * this.scaleCur < e.y + e.h && ey + 30 * this.scaleCur > e.y)) continue;
        const crit = Math.random() < this.critChance;
        const dmg = crit ? this.damage * 2 : this.damage;
        // ★F3 接线（蓝队四轮）②：真永夜刃伸长斩 973（数据面 melee）——双支同序；
        // 排除面 = 本弹 local 免疫窗投影
        const snapBonusTrueEdge = projectileSnapStrikeBonus(game,
          { projId: 973 }, (e as { cx?: number }).cx ?? e.x + e.w / 2,
          (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
          { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
            cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
            targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
        e.hurt(applyBannerDamageDealt(game, e, dmg)
          + (snapBonusTrueEdge ? Math.trunc(snapBonusTrueEdge * (crit ? 2 : 1)) : 0),
          this.ai0 * 6.5, 0, game, this.armorPen, crit, 0, true);   // ★F1 旗乘区;fromPlayer=DPS 计
        this.hitCd.set(e.id, 5);
        // ★L5 长尾批：TrueNightsEdgeSlash=弹 973 → TrueNightsEdge(12);★δB1 载弹速
        swordTrailOrchestra(game, 973, e, this.vx, this.vy);
      }
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(973);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = img.width, fh = img.height / 4;
    const sc = this.scaleCur * 1.1 * 0.975;
    // oldPos 3 档残影（:27597-27611）
    for (let i = this.hist.length - 2; i >= 0; i--) {
      const h = this.hist[i];
      const age = this.hist.length - 1 - i;
      const px = h.x - (this.vx * 0.5 * age) / 1;
      const py = h.y - (this.vy * 0.5 * age) / 1;
      const prot = h.rot - this.ai0 * Math.PI * 2 * 0.1 * age;
      const num7 = 1 - age / 3;
      const num8 = Math.max(0, this.opacity * num7 * num7 * 0.85);
      const amount = this.opacity * this.opacity;
      this.tneLayer(ctx, img, fw, fh, px, py, prot + this.ai0 * Math.PI / 4 * -1, sc,
        [40 + 40 * amount, 20 + 140 * amount, 60 + 90 * amount], num8 * 0.95);
      // 三向扇形（:27624-27630：num10 ∈ (−2π,0) 三分）
      for (let k = 1; k <= 2; k++) {
        const num10 = -Math.PI * 2 + (Math.PI * 2 / 3) * k;
        const num11 = (num10 + Math.PI * 2) / (Math.PI * 2) * 0.5;
        this.tneLayer(ctx, img, fw, fh, px, py, prot + this.ai0 * 0.01 + num10, sc,
          [80, 30 + 70 * amount, 160 + 40 * amount], num8 * num11 * 0.8);
      }
    }
    // 本体（当前位四层主色组）
    this.tneLayer(ctx, img, fw, fh, this.cx, this.cy, this.rot + this.ai0 * Math.PI / 4 * -1, sc,
      [80, 40, 180], this.opacity * 0.95);
    this.tneLayer(ctx, img, fw, fh, this.cx, this.cy, this.rot, sc,
      [155, 255, 100], this.opacity * 0.7);
    // 刀尖星芒（:27627）：num12=clamp(1−t/80,0.5,1)（伸长回缩半径）、num13=
    // min(num3,1)（光照 fromValue 取 1 → num3=Remap(t,30,96,1,0)）；
    // shine=(150,255,100)×num13、draw=White(A0)×Opacity×0.5×num13 → 双 dim；
    // flare=Opacity、fade(0,1,1,2)、rot=π/4、scale=(2,2)、fatness=One
    const num12 = Math.max(0.5, 1 - this.t / 80);
    const num13 = Math.max(0, Math.min(1, (96 - this.t) / 66));
    const spAng = this.rot + 0.47123894 * this.ai0;
    const spR = (fw * 0.5 - 4) * sc * num12;
    prettyStarSparkle(ctx, this.opacity,
      this.cx + Math.cos(spAng) * spR, this.cy + Math.sin(spAng) * spR,
      [255, 255, 255], [150, 255, 100], this.opacity,
      0, 1, 1, 2, Math.PI / 4, [2, 2], [1, 1],
      this.opacity * num13, num13);
  }

  private tneLayer(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement, fw: number, fh: number,
    px: number, py: number, ang: number, sc: number, rgb: [number, number, number], alpha: number): void {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(px, py);
    ctx.rotate(ang);
    if (this.ai0 < 0) ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0, fw, fh, -fw * sc / 2, -fh * sc / 2, fw * sc, fh * sc);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** 永夜刃飞斩变体（273 第二发：ai0=0.1×dir → |ai0|<0.2 分支 :39457-39466）：
 *  自由飞行、rotation += π×4×ai0×10×num 旋进、10t 起前漂 45px、scale +0.4、
 *  寿命 ai1=30t。 */
export class NightsEdgeFly extends Entity {
  w = 16; h = 16;
  damage: number;
  private ai0: number;
  private ai1: number;
  private ai2: number;
  private t = 0;
  private rot = 0;
  private scaleCur = 1;
  private dx: number; private dy: number;
  private hitCd = new Map<number, number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  private hist: Array<{ x: number; y: number; rot: number }> = [];

  constructor(x: number, y: number, vx: number, vy: number, damage: number, facing: number, animMax: number, scale: number) {
    super();
    this.x = x; this.y = y;
    const n = Math.hypot(vx, vy) || 1;
    this.vx = vx; this.vy = vy;
    this.dx = vx / n; this.dy = vy / n;
    this.damage = damage;
    this.ai0 = facing * 0.1;
    this.ai1 = animMax;
    this.ai2 = scale;
  }

  get num(): number { return this.t / this.ai1; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t >= this.ai1) { this.dead = true; return; }
    const num = this.num;
    // |ai0|<0.2 分支（:39459-39466）
    this.rot += Math.PI * 4 * this.ai0 * 10 * num;
    const num7 = Math.min(1, Math.max(0, (this.t - 10) / (this.ai1 - 5 - 10)));
    this.x += this.dx * 45 * num7;
    this.y += this.dy * 45 * num7;
    this.scaleCur = (1 + num * 0.2) * this.ai2 + num7 * 0.4;
    this.x += this.vx; this.y += this.vy;
    this.hist.push({ x: this.cx, y: this.cy, rot: this.rot });
    if (this.hist.length > 4) this.hist.shift();
    // 尘 14（1/5）+ 27（:39467-39478 近似）
    if (Math.random() < 0.2) {
      game.spawnParticles(this.cx + (Math.random() - 0.5) * 60, this.cy + (Math.random() - 0.5) * 60,
        '#5028B4', 1, 1.2, { life: 16 });
    }
    // 命中（穿透 2；同敌单跳）
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitCd.has(e.id)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）③：永夜刃飞斩变体 972（数据面 melee）——双支同序
      const snapBonusFly = projectileSnapStrikeBonus(game,
        { projId: 972 }, (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusFly ? Math.trunc(snapBonusFly * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * 6.5, 0, game, this.armorPen, crit, 0, true);   // ★F1 旗乘区;fromPlayer=DPS 计
      this.hitCd.set(e.id, 9999);
      // ★L5 长尾批：永夜刃飞斩变体=弹 972 → NightsEdge(10);★δB1 载弹速
      swordTrailOrchestra(game, 972, e, this.vx, this.vy);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(972);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = img.width, fh = img.height / 4;
    const sc = this.scaleCur * 1.1;
    const op = Math.min(1, Math.max(0, this.num / 0.6)) * (this.num <= 0.6 ? 1 : Math.max(0, (1 - this.num) / 0.4));
    const layer = (px: number, py: number, ang: number, rgb: [number, number, number], a: number, sy = 1) => {
      if (a <= 0.02) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.translate(px, py);
      ctx.rotate(ang);
      if (this.ai0 < 0) ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, fw, fh, -fw * sy * sc / 2, -fh * sy * sc / 2, fw * sy * sc, fh * sy * sc);
      ctx.restore();
      ctx.globalAlpha = 1;
    };
    layer(this.cx, this.cy, this.rot + this.ai0 * 10 * Math.PI / 4 * -1 * (1 - this.num), [40, 20, 60], op * 0.95);
    layer(this.cx, this.cy, this.rot + this.ai0 * 0.01, [80, 30, 160], op * 0.15);
    layer(this.cx, this.cy, this.rot, [80, 30, 160], op * 0.3, 0.8);
    layer(this.cx, this.cy, this.rot, [80, 40, 180], op * 0.7);
    layer(this.cx, this.cy, this.rot + this.ai0 * 0.01, [255, 255, 255], op * 0.3);
  }
}

/** Zenith 933（AI_182_FinalFractal :40434-40515 + 绘制 :28040/:30174-30185/:30841）：
 *  出生（Player.cs:48078-48121）：vel=(目标−MountedCenter)/2（非归一！轨道半径=|vel|）；
 *  ai[0]=rand(−100,101) 轨道椭圆高；ai[1]=剑档案（首击 4956，后续档案表随机，
 *  GetRandomProfileIndex 重掷 4956）。
 *  AI：首帧 Item169；counter += Lerp(0.7,2, GetLerpValue(900,0,|vel|×2))（慢则快计）；
 *  ≥120 消亡；锚点 = MountedCenter + vel（随玩家移动）；椭圆轨道
 *  num8=|vel|+Late(0.5..1)×40（下限 60）绕锚点旋转 num7=π+sign(vx)×phase×2π
 *  （phase=GetLerpValue(0,1,counter/60)）；rotation=num7+vel角+π/2（ai0<0 反旋）；
 *  Opacity 淡入 0-5/淡出 115-120。
 *  绘制链（DrawProjDirect 内顺序）：① 彩带拖尾（FinalFractalHelper.Draw :28040
 *  → VertexStrip：截面沿刃轴向 ±trailWidth、StripColors 逐剑固定色渐隐）→
 *  ② 白残影 ×3（:30381 循环 + :30174 933 档 num156=60/num155=−15 → num159=
 *  45/30/15，60 越界跳过）→ ③ 本体 =【ai[1] 物品贴图】（:29945-29953 LoadItem、
 *  origin=中心、基角 −π/4×spriteDir；GetAlpha :76047 = White×Opacity ×num182
 *  淡入 0-20/淡出 68-60）→ ④ 1.25× 白叠绘（:30841 色 (255,255,255,127)×Opacity
 *  ×num186）→ ⑤ 刃尖星芒（1457 Main.cs:31620 DrawPrettyStarSparkle，15-45 counter 窗）。
 *  档案表（FinalFractalHelper.cs:81-168：剑物品 id → 全刃长/拖尾色）。 */
const FRACTAL_PROFILES: Record<number, { len: number; color: [number, number, number] }> = {
  65: { len: 48, color: [236, 62, 192] }, 1123: { len: 48, color: [255, 231, 69] },  // 1123=Main.OurFavoriteColor（Main.cs:868）
  46: { len: 48, color: [122, 66, 191] }, 121: { len: 76, color: [254, 158, 35] },
  190: { len: 70, color: [107, 203, 0] }, 368: { len: 70, color: [236, 200, 19] },
  674: { len: 70, color: [236, 200, 19] }, 273: { len: 70, color: [179, 54, 201] },
  675: { len: 70, color: [179, 54, 201] }, 2880: { len: 70, color: [84, 234, 245] },
  989: { len: 48, color: [91, 158, 232] }, 1826: { len: 76, color: [252, 95, 4] },
  3063: { len: 76, color: [254, 194, 250] }, 3065: { len: 70, color: [237, 63, 133] },
  757: { len: 70, color: [80, 222, 122] }, 155: { len: 70, color: [56, 78, 210] },
  795: { len: 70, color: [237, 28, 36] }, 3018: { len: 80, color: [143, 215, 29] },
  4144: { len: 45, color: [178, 255, 180] }, 3507: { len: 45, color: [235, 166, 135] },
  4956: { len: 86, color: [178, 255, 180] },
};

/** 档案键集（测试用） */
export const FRACTAL_KEYS = Object.keys(FRACTAL_PROFILES).map(Number);

/** GetRandomProfileIndex（:170-180）：档案表随机，命中 4956 移除后重掷一次
 *  （重掷池不含 4956——曾从全表重掷仍有 1/21 概率回到 Zenith） */
export function randomFractalProfile(excludeZenith = true): number {
  const keys = Object.keys(FRACTAL_PROFILES).map(Number);
  let id = keys[Math.floor(Math.random() * keys.length)];
  if (excludeZenith && id === 4956) {
    const rest = keys.filter((k) => k !== 4956);
    id = rest[Math.floor(Math.random() * rest.length)];
  }
  return id;
}

/** GetFinalFractalProfile（:192-199）：缺项回退 50f/Color.White */
export function fractalProfile(id: number): { len: number; color: [number, number, number] } {
  return FRACTAL_PROFILES[id] ?? { len: 50, color: [255, 255, 255] };
}

/** 拖尾衰减因子（FinalFractalProfile.StripColors :54-59 逐字）：
 *  result = trailColor × (1 − GetLerpValue(0, 0.98, progressOnStrip))；result.A /= 2。
 *  XNA Color×float 四通道同乘 → rgb 与 A 同乘本因子、A 额外减半（预乘混合下
 *  rgb:alpha = 2:1——draw 的两 pass 精确等价来源）。progress = i/(oldPos.Length−1)
 *  = i/59（VertexStrip.PrepareStrip :63，恒除 60−1——幼年拖尾不缩分母）。 */
export function fractalStripFade(progress: number): number {
  return 1 - Math.max(0, Math.min(1, progress / 0.98));
}

/** 白残影 alpha（Main.cs:30606-30611）：Color.White × GetLerpValue(0, 60, 60−num159)
 *  × Opacity × GetLerpValue(0,20,counter−num159) × GetLerpValue(68,60,counter−num159)
 *  （rgb:alpha = 1:1 → 单 pass source-over；t = 历史时刻的 localAI[0] −− 原版按
 *  索引差近似，非真实计数差——逐字沿用） */
export function fractalGhostAlpha(counter: number, num159: number, opacity: number): number {
  const t = counter - num159;
  return ZenithSword.lerpV(0, 60, 60 - num159) * opacity
    * ZenithSword.lerpV(0, 20, t) * ZenithSword.lerpV(68, 60, t);
}

export class ZenithSword extends Entity {
  w = 32; h = 32;
  damage: number;
  knockback = 6.5;
  /** ai[0] 轨道椭圆高（−100..100） */
  ai0: number;
  /** ai[1] 剑档案（物品 id） */
  ai1: number;
  private counter = 0;
  private opacity = 0;
  private rot = 0;
  private spriteDir = 1;
  private owner: ArcOwner;
  private hitCd = new Map<number, number>();
  /** oldPos/oldRot 拖尾环（TrailCacheLength=60、TrailingMode=4，ProjectileID.cs:293）：
   *  每条目 [cx, cy, rot] 每 update 压一条（extraUpdates=1 → 每帧 2 条）；
   *  在 AI 位移【前】压栈（Projectile.Update 内 :15728 拖尾段先于 AI_182）——
   *  最新条 = 上一 update 末态（滞后本体一 update），首条 = 出生点 */
  private trail: number[] = [];
  /** oldSpriteDirection 环（残影镜像 XOR 用，:30572-30577）——与 trail 同步压/裁 */
  private trailDirs: number[] = [];
  /** TrailingMode 4 玩家位移补偿（:15828-15841 numUpdates==0 时 oldPos += 玩家帧位移） */
  private lastOwnerX = 0;
  private lastOwnerY = 0;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  lightRGB: [number, number, number] | null = null;

  constructor(owner: ArcOwner, tx: number, ty: number, damage: number, profile: number, kb = 6.5) {
    super();
    this.owner = owner;
    this.vx = (tx - owner.cx) / 2;   // :48116 vector44 = vector45/2（非归一——轨道半径）
    this.vy = (ty - owner.cy) / 2;
    this.damage = damage;
    this.ai0 = Math.floor(Math.random() * 201) - 100;
    this.ai1 = profile;
    this.knockback = kb;
    this.lastOwnerX = owner.x;
    this.lastOwnerY = owner.y;
    // 出生点（NewProjectile position=发射点，Player.cs:48118）——拖尾首条锚
    // （原版 AI_182 首帧即把 Center 挪上轨道，oldPos[0] 留在出生点：拖尾从玩家
    // 处甩出一段再入轨的视觉来源）。近似取 MountedCenter（枪口在其 ~50px 内）
    this.x = owner.cx - this.w / 2;
    this.y = owner.cy - this.h / 2;
  }

  /** GetLerpValue(from,to,t,clamped) 语义——线性后钳 [0,1]（递减区间 from>to 同式，
   *  曾按 min/max 早退写反：900→0 区间 t≥900 应得 0 非 1）。公开供模块级
   *  档案/残影纯函数复用 */
  static lerpV(a: number, b: number, t: number): number {
    if (a === b) return t >= a ? 1 : 0;
    const v = (t - a) / (b - a);
    return Math.max(0, Math.min(1, v));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // vanilla-projectiles 933 extraUpdates=1——AI 每 tick 跑两遍（整程 120 计数
    // 60 游戏秒帧耗尽；曾单跑=轨道慢一倍且滞空过久，2026-08-19 审查）
    // TrailingMode 4 前置（:15828-15841）：拖尾整条平移玩家帧位移
    const odx = this.owner.x - this.lastOwnerX, ody = this.owner.y - this.lastOwnerY;
    if (odx !== 0 || ody !== 0) {
      for (let i = 0; i < this.trail.length; i += 3) { this.trail[i] += odx; this.trail[i + 1] += ody; }
      this.lastOwnerX = this.owner.x;
      this.lastOwnerY = this.owner.y;
    }
    this.step(game);
    this.step(game);
  }

  private step(game: GameHooks): void {
    if (this.counter === 0) game.playSfxFiles(['Item_169'], 1, this.cx, this.cy);   // :40439
    // TrailingMode 4 记录（:15841-15843）：oldPos[0]/oldRot[0]/oldSpriteDirection[0]
    // 在 Projectile.Update 内先于 AI_182 压栈——记录上一 update 末态
    this.trail.push(this.cx, this.cy, this.rot);
    if (this.trail.length > 60 * 3) this.trail.splice(0, this.trail.length - 60 * 3);
    this.trailDirs.push(this.spriteDir);
    if (this.trailDirs.length > 60) this.trailDirs.splice(0, this.trailDirs.length - 60);
    const spd = Math.hypot(this.vx, this.vy);
    const lv = ZenithSword.lerpV(900, 0, spd * 2);      // GetLerpValue(900,0,|vel|×2)
    this.counter += 0.7 + (2 - 0.7) * lv;               // Lerp(0.7,2,lv)
    if (this.counter >= 120) { this.dead = true; return; }
    const phase = ZenithSword.lerpV(0, 1, this.counter / 60);
    const va = Math.atan2(this.vy, this.vx);
    const num6 = this.vx > 0 ? 1 : -1;
    const num7 = Math.PI + num6 * phase * Math.PI * 2;
    let num8 = spd + ZenithSword.lerpV(0.5, 1, phase) * 40;
    if (num8 < 60) num8 = 60;
    // 锚点 = MountedCenter + vel（随玩家移动——:40466）
    const ax = this.owner.cx + this.vx, ay = this.owner.cy + this.vy;
    // 椭圆轨道（:40474-40478）+ 起始回拉（vector3 :40479-40480）
    const spinX = Math.cos(num7) * num8;
    const spinY = Math.sin(num7) * this.ai0 * (2 + (1 - 2) * lv);
    const ca = Math.cos(va), sa = Math.sin(va);
    const pull = (1 - ZenithSword.lerpV(0, 0.5, phase));
    const pullX = pull * num6 * -num8 * 0.1;
    const pullY = pull * -this.ai0 * 0.3;
    this.x = ax + (ca * spinX - sa * spinY) + pullX - this.w / 2;
    this.y = ay + (sa * spinX + ca * spinY) + pullY - this.h / 2;
    this.rot = num7 + va + Math.PI / 2;
    this.spriteDir = this.vx > 0 ? 1 : -1;
    if (this.ai0 < 0) {
      this.rot = Math.PI + num6 * phase * (-Math.PI * 2) + va + Math.PI / 2;   // 反旋（:40488-40494）
      this.spriteDir = this.vx > 0 ? -1 : 1;
    }
    this.opacity = ZenithSword.lerpV(0, 5, this.counter) * ZenithSword.lerpV(120, 115, this.counter);
    // 剑刃线 CutTiles（Projectile.CutTiles :11824/:14115——瓦罐/杂草等 tileCut 物
    // 随剑刃扫过砍断）：沿刃轴向（rot−π/2）中心±40 逐格 game.cutTile，与 bladeHits
    // 判定线同源。曾漏接 = 天顶剑穿过瓦罐不碎（用户实报 2026-09-01）。
    {
      const dxc = Math.cos(this.rot - Math.PI / 2), dyc = Math.sin(this.rot - Math.PI / 2);
      for (const off of [-40, -13, 13, 40]) {
        const tx = Math.floor((this.cx + dxc * off) / 16);
        const ty = Math.floor((this.cy + dyc * off) / 16);
        if (Number.isFinite(tx) && Number.isFinite(ty)) game.cutTile?.(tx, ty);
      }
    }
    const prof = fractalProfile(this.ai1);
    // 光照（:40493-40496，num2<1 门 :40478）：Center 点 trailColor×0.5×Opacity +
    // MountedCenter 点 Lerp(Vector3.One, trailColor, 0.7)×Opacity×0.15（后者每剑
    // 叠加——齐射时玩家侧聚成暖白光晕）
    if (phase < 1) {
      this.lightRGB = [prof.color[0] / 255 * 0.5 * this.opacity, prof.color[1] / 255 * 0.5 * this.opacity, prof.color[2] / 255 * 0.5 * this.opacity];
      game.addLightAt?.(this.owner.cx, this.owner.cy,
        (1 + (prof.color[0] / 255 - 1) * 0.7) * this.opacity * 0.15,
        (1 + (prof.color[1] / 255 - 1) * 0.7) * this.opacity * 0.15,
        (1 + (prof.color[2] / 255 - 1) * 0.7) * this.opacity * 0.15);
    } else {
      this.lightRGB = null;
    }
    // 拖尾尘（:40480-40492 调用点 → StripDust :38-52）：每 update num11 次独立掷
    // Next(9)==0，命中出 Next(1,4)=1-3 粒尘 278（Dust.NewDustPerfect：alpha 100、
    // color=Lerp(trailColor,White,rand×0.3)、scale 0.4、fadeIn 0.4+rand×0.3、
    // noGravity、velocity += (rot−π/2+π/2·spriteDir)向×(3+rand×4)）；
    // 位置 = Center + 刃向×trailWidth×Lerp(0.5,1,rand)（刃中段→刃尖）
    if (phase < 1) {
      let num11 = 1 + Math.floor(spd / 100);
      num11 = Math.floor(num11 * ZenithSword.lerpV(0, 0.5, phase) * ZenithSword.lerpV(1, 0.5, phase));
      if (num11 < 1) num11 = 1;
      const bdx = Math.cos(this.rot - Math.PI / 2), bdy = Math.sin(this.rot - Math.PI / 2);
      const dist = (prof.len / 2) * (0.5 + Math.random() * 0.5);
      const px = this.cx + bdx * dist, py = this.cy + bdy * dist;
      for (let i = 0; i < num11; i++) {
        if (Math.floor(Math.random() * 9) !== 0) continue;      // Next(9)==0（1/9）
        const dAng = this.rot - Math.PI / 2 + Math.PI / 2 * this.spriteDir;
        for (let k = 0, cnt = 1 + Math.floor(Math.random() * 3); k < cnt; k++) {
          const wf = Math.random() * 0.3;   // Color.Lerp(trailColor, White, rand×0.3)
          // spawn() 对 w=0 的盒内散布退化为确定 +4（(rand×1|0)+4）→ 传 −4 抵消
          const d = game.spawnDust?.(px - 4, py - 4, 0, 0, 278, 0, 0, 100,
            {
              r: Math.round(prof.color[0] + (255 - prof.color[0]) * wf),
              g: Math.round(prof.color[1] + (255 - prof.color[1]) * wf),
              b: Math.round(prof.color[2] + (255 - prof.color[2]) * wf),
              a: 255,
            }, 0.4, true);
          if (!d) break;
          d.scale = 0.4;
          d.fadeIn = 0.4 + Math.random() * 0.3;
          const dsp = 3 + Math.random() * 4;   // velocity += dir×(3+rand×4)（覆写池抖动）
          d.vx = Math.cos(dAng) * dsp;
          d.vy = Math.sin(dAng) * dsp;
        }
      }
    }
    // 命中：lance 线形判定（Projectile.cs:14333-14363）——当前刃线 ±40 厚 20 +
    // 拖尾采样点（每 15 update：i=14/29/44/59，counter−i∈[0,60] 才激活）；
    // usesLocalNPCImmunity + localNPCHitCooldown=15/MaxUpdates=7（:8587）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!this.bladeHits(e.x, e.y, e.w, e.h)) continue;
      const crit = Math.random() < this.critChance;
      // Main.DamageVar ±15% 浮动（同挥击侧公式）
      const dmg = Math.max(1, Math.round(this.damage * (crit ? 2 : 1) * (1 + (Math.random() * 30 - 15) / 100)));
      // ★F3 接线（蓝队四轮）④：天顶剑终弹 933（数据面 melee）——双支同序；加伤随暴击并入
      const snapBonusZenith = projectileSnapStrikeBonus(game,
        { projId: 933 }, (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg), this.spriteDir * this.knockback, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      this.hitCd.set(e.id, 7);
    }
  }

  /** Collision.CheckAABBvLineCollision 六参全式 1:1（1458 Collision.cs:275-371）——
   *  台账批 B：刃线命中由“膨胀 AABB+Liang-Barsky 胶囊裁剪”近似换原式：
   *   · 先取线段 AABB（沿长两端各外扩 lineWidth/2）与目标盒粗测（:300 AABB 门）；
   *   · 目标盒四角旋转到线空间（−atan2(lineDir) :308-317），四角入带判定
   *     |Y|<halfWidth 且 X∈[0,len]（:320-327）；
   *   · 四边与上下轨 (0,±hw)-(len,±hw) 的段交穷举（:332-369，任一相交即真）。
   *  与胶囊近似的差异在端部几何（矩形直角端 vs 圆帽），±10px 尖锋擦碰判定对齐。 */
  private static segHitsRectVanilla(x1: number, y1: number, x2: number, y2: number,
    rx: number, ry: number, rw: number, rh: number, lineWidth: number): boolean {
    const hw = lineWidth * 0.5;
    // 线段外包盒（按轴向正负分别外扩半宽,:280-299）
    let bx = x1, bw = x2 - x1;
    if (bw > 0) { bx -= hw; bw += lineWidth; }
    else { bx += bw - hw; bw = -bw + lineWidth; }
    let by = y1, bh = y2 - y1;
    if (bh > 0) { by -= hw; bh += lineWidth; }
    else { by += bh - hw; bh = -bh + lineWidth; }
    // CheckAABBvAABBCollision（Collision.cs:2368-2377）
    if (!(bx < rx + rw && by < ry + rh && bx + bw > rx && by + bh > ry)) return false;
    // 目标盒四角旋转到线空间
    const dxl = x2 - x1, dyl = y2 - y1;
    const len = Math.hypot(dxl, dyl);
    const ang = Math.atan2(dyl, dxl);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    const rot = (qx: number, qy: number): [number, number] => {
      const ax = qx - x1, ay = qy - y1;
      return [ax * c - ay * s, ax * s + ay * c];
    };
    const corners: Array<[number, number]> = [
      rot(rx, ry), rot(rx, ry + rh), rot(rx + rw, ry + rh), rot(rx + rw, ry),
    ];
    // :320-327 角点入带
    let result = false;
    for (const [px, py] of corners) {
      if (Math.abs(py) < hw && px < len && px >= 0) { result = true; break; }
    }
    if (result) return true;
    // :332-369 四边 vs 上下轨段交（XNA Vector2 叉积同构）
    const railTest = (
      eA: [number, number], eB: [number, number],
      rA: [number, number], rB: [number, number],
    ): boolean => {
      const rvx = rB[0] - rA[0], rvy = rB[1] - rA[1];
      const evx = eB[0] - eA[0], evy = eB[1] - eA[1];
      const den = rvx * evy - rvy * evx;
      if (den === 0) return false;
      const s1 = ((eA[0] - rA[0]) * evy - (eA[1] - rA[1]) * evx) / den;
      if (s1 < 0 || s1 > 1) return false;
      const s2 = ((eA[0] - rA[0]) * rvy - (eA[1] - rA[1]) * rvx) / den;
      return !(s2 < 0 || s2 > 1);
    };
    const rails: Array<[[number, number], [number, number]]> = [
      [[0, hw], [len, hw]],          // vector3→vector4(:328-329)
      [[0, -hw], [len, -hw]],        // vector5→vector6(:330-331)
    ];
    for (let j = 0; j < 4; j++) {
      const eA = corners[j], eB = corners[(j + 1) % 4];
      if (railTest(eA, eB, rails[0][0], rails[0][1])) return true;
      if (railTest(eA, eB, rails[1][0], rails[1][1])) return true;
    }
    return result;
  }

  /** 刃线判定 1:1（Projectile.Colliding type 933/1100 分支 :15626-15660）：
   *  每采样位先 _lanceHitboxBounds（Projectile.cs:498 静态 300×300）过靶门再进
   *  CheckAABBvLineCollision(tgtRect.TopLeft, tgtRect.Size, lineStart, lineEnd,
   *  lineWidth=20)。旧版本无 300×300 前置闸。 */
  private bladeHits(ex: number, ey: number, ew: number, eh: number): boolean {
    const lineAt = (cx: number, cy: number, rot: number): boolean => {
      // _lanceHitboxBounds 300×300 过靶门（:15641-15643/:15654-15656 同式）
      const gateHalf = 150;
      if (ex >= cx + gateHalf || ex + ew <= cx - gateHalf
        || ey >= cy + gateHalf || ey + eh <= cy - gateHalf) return false;
      const dx = Math.cos(rot + Math.PI / 2), dy = Math.sin(rot + Math.PI / 2);
      return ZenithSword.segHitsRectVanilla(cx - dx * 40, cy - dy * 40, cx + dx * 40, cy + dy * 40,
        ex, ey, ew, eh, 20);
    };
    if (lineAt(this.cx, this.cy, this.rot)) return true;
    // oldPos[i]（i update 前）= trail 尾起倒数第 i 条（条目 0=最新）
    for (let i = 14; i < 60; i += 15) {
      const age = this.counter - i;
      if (age < 0 || age > 60) continue;
      const idx = this.trail.length - 3 * (i + 1);
      if (idx < 0) continue;
      if (lineAt(this.trail[idx], this.trail[idx + 1], this.trail[idx + 2])) return true;
    }
    return false;
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; atlas?: unknown }): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const prof = fractalProfile(this.ai1);
    const tw = prof.len / 2;   // trailWidth = 全刃长/2（StripWidth :61-64 恒宽——沿程无宽度变化）
    const icon = (r.atlas as unknown as { vicon?: (id: number) => { img: ImageBitmap | HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null } | undefined)?.vicon?.(this.ai1) ?? null;
    // 本体淡入淡出包络（:30799-30801 num182 与 :30840 num186 同式同参 t=localAI[0]）
    const num182 = ZenithSword.lerpV(0, 20, this.counter) * ZenithSword.lerpV(68, 60, this.counter);
    const n = this.trail.length / 3;

    // ---- ① 彩带拖尾（FinalFractalHelper.Draw :175-190）----
    // ★2026-08-30 GL 化改约：原"平色四边形双 pass + CPU 像素叠层"两段合成整体移除
    // ——原版只有【一次】PS 条带绘制，平色底条系近似期产物（与真值叠成大团色块，
    // 用户实报截图）；CPU 像素循环又是卡顿本体。现在 drawStripTrail 内部自动走
    // GLSpriteLayer 拖尾 pass（GLSpriteLayer.ts 尾部 TRAIL_VS/FS——obj58 逐指令
    // 1:1），主 ctx 每帧单次合成；GL 不可用时其内部退化 CPU 版仍可用。
    if (n >= 2) {
      if (r.atlas) {
        const ptsFS: Array<{ x: number; y: number; hw: number; rot: number; r: number; g: number; b: number; a: number }> = [];
        for (let i = n - 1; i >= 1; i--) {
          const f = fractalStripFade((n - 0.5 - i) / (60 - 1));
          if (f <= 0.02) continue;
          // trailWidth = profile 全刃长/2（StripWidth :61-64 恒宽）——0.85 系近似期
          // 压制倍率，随平色层一并退役
          ptsFS.push({ x: this.trail[i * 3], y: this.trail[i * 3 + 1], hw: tw,
            rot: this.trail[i * 3 + 2],
            r: prof.color[0] / 255, g: prof.color[1] / 255, b: prof.color[2] / 255, a: f });
        }
        if (ptsFS.length >= 2) {
          try {
            drawStripTrail(ctx, r as unknown as Parameters<typeof drawStripTrail>[1],
              { set: 'FinalFractal' as never, pts: ptsFS, opacity: 1,
                time: performance.now() / 1000, zigzag: 0.5 });
          } catch { /* atlas 未就绪静默 */ }
        }
      }
    }

    // ---- 贴图绘制原语（:29945-29953：LoadItem(ai[1])、Frame() 全幅、origin=中心、
    // 基角 −π/4×【当前】spriteDir 加进旋转；镜像=局部系 scale(−1,1)（XNA Flip源
    // 矩形后旋转 = canvas 先 rotate 后镜像），刀尖恒指 (rot−π/2) 向）----
    const drawIcon = (x: number, y: number, rot: number, mirror: boolean, scale: number, alpha: number, additive = false) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (additive) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (mirror) ctx.scale(-1, 1);
      if (icon) {
        const dw = icon.sw * scale, dh = icon.sh * scale;
        ctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.fillStyle = `rgb(${prof.color[0]},${prof.color[1]},${prof.color[2]})`;
        ctx.fillRect(-16 * scale, -16 * scale, 32 * scale, 32 * scale);
      }
      ctx.restore();
    };

    // ---- ② 白残影 ×3（:30381 循环 + :30174-30181 933 档：num156=60、num154=0、
    // num155=−15 → num159∈{60,45,30,15}；60 ≥ oldPos.Length=60 越界跳过 :30383）。
    // 色（:30606-30611，替换通用乘子）：White × GetLerpValue(0,60,60−num159) ×
    // Opacity × num170(counter−num159)（rgb:alpha=1:1 单 pass）；旋转 = oldRot +
    // (−π/4×当前 spriteDir)（:30614 num152 取现值）；镜像 = 历史与当前
    // spriteDirection 异号（:30572-30577 XOR）；scale = Lerp(1,1,·)=1 ----
    for (let num159 = 60; num159 > 0; num159 -= 15) {
      if (num159 >= 60) continue;
      const j = n - 1 - num159;
      if (j < 0) continue;
      drawIcon(this.trail[j * 3], this.trail[j * 3 + 1],
        this.trail[j * 3 + 2] - Math.PI / 4 * this.spriteDir,
        (this.trailDirs[j] === -1) !== (this.spriteDir === -1), 1,
        fractalGhostAlpha(this.counter, num159, this.opacity));
    }
    // ---- ③ 本体（:30761-30803）：GetAlpha(:76047-76050)=White×Opacity ×num182
    // （rgb:alpha=1:1 → 单 pass source-over，不受场景光照染色的全亮白）----
    drawIcon(this.cx, this.cy, this.rot - Math.PI / 4 * this.spriteDir, this.spriteDir === -1,
      1, this.opacity * num182);
    // ---- ④ 1.25× 白叠绘（:30839-30841）：色 (255,255,255,127)×Opacity×num186——
    // 预乘 rgb:alpha = 255:127 → 两 pass：source-over α=(127/255)·ov（覆盖）
    // + lighter α=(128/255)·ov（加色）＝ rgb×ov 全量、背景衰减仅 (127/255)·ov ----
    const ov = this.opacity * num182;
    drawIcon(this.cx, this.cy, this.rot - Math.PI / 4 * this.spriteDir, this.spriteDir === -1,
      1.25, 127 / 255 * ov);
    drawIcon(this.cx, this.cy, this.rot - Math.PI / 4 * this.spriteDir, this.spriteDir === -1,
      1.25, 128 / 255 * ov, true);
    // ---- ⑤ 刃尖星芒（1457 Main.cs:31620）：DrawPrettyStarSparkle(Opacity, dir, Center+
    // (rot−π/2)向×trailWidth, White×num197, trailColor(A/2)×num197, localAI[0],
    // 15,30,30,45, 0, (5,2), (1,1))——15-45 counter 窗内十字星芒
    // （num197 = GetLerpValue(0,20,t)×GetLerpValue(68,60,t) = 本档 num182，draw=White/
    //   shine=trailColor 与原版实参序一致——2026-09-02 黑十字案复核勘误,原注 num186 系笔误）----
    if (this.opacity > 0.01 && num182 > 0.01) {
      prettyStarSparkle(ctx, this.opacity,
        this.cx + Math.cos(this.rot - Math.PI / 2) * tw,
        this.cy + Math.sin(this.rot - Math.PI / 2) * tw,
        [255, 255, 255], prof.color, this.counter,
        15, 30, 30, 45, 0, [5, 2], [1, 1], num182, num182);
    }
  }
}

/** 魔光剑斩痕 974（AI_188_LightsBane :39558-39591 + DrawProj_LightsBane :27356）：
 *  出生（Player.cs:48242-48264）：生成在【瞄准搜索点】（MountedCenter+(70,−40)×Directions
 *  ±20px 散布，或 ZenithTarget 50px 内敌人身上）；vel=方向载波×0.001（不位移）；
 *  ai[0]=1（暴击掷中 Next(100)<meleeCrit → 2 且 Damage×2——暴击折进斩痕）；
 *  Damage×0.5。AI：首帧 Item60×0.15×ai0；scale=ai0；3t/帧 ×12 帧=36t 消亡；
 *  rotation=vel 角；尘 278 沿 ±46×scale 扫线（num2=Remap(t/36×4,0,1) 包络）。
 *  绘制：Frame(1,13)（171×702=13 帧 54px）本体帧 ×0.7×scale + 帧 12 辉光两遍
 *  （(1,6)/(2,2)×vector2、white×0.3×num、multiply blend→lighter 近似）。 */
export class LightsBaneSlash extends Entity {
  w = 20; h = 20;
  damage: number;
  ai0: number;
  private t = 0;
  private frame = 0;
  private frameCtr = 0;
  private rot = 0;
  private dirX: number; private dirY: number;
  private hitCd = new Map<number, number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  lightRGB: [number, number, number] | null = [0.2, 0, 0.5];

  constructor(x: number, y: number, dirX: number, dirY: number, damage: number, ai0: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.dirX = dirX; this.dirY = dirY;
    this.damage = damage;
    this.ai0 = ai0;
    this.rot = Math.atan2(dirY, dirX);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    if (this.t === 1) game.playSfxFiles(['Item_60'], 0.15 * this.ai0, this.cx, this.cy);
    if (++this.frameCtr >= 3) {
      this.frameCtr = 0;
      if (++this.frame >= 12) { this.dead = true; return; }
    }
    // 尘 278 扫线（:39580-39590：t/36×4 包络 ×0.7）
    const num2 = this.t / 36 * 4;
    if (num2 >= 0 && num2 <= 1 && Math.random() < 0.5) {
      const k = Math.random();
      game.spawnParticles(
        (this.cx - this.dirX * 46 * this.ai0) * (1 - k) + (this.cx + this.dirX * 46 * this.ai0) * k,
        (this.cy - this.dirY * 46 * this.ai0) * (1 - k) + (this.cy + this.dirY * 46 * this.ai0) * k,
        '#8C3CE8', 1, 1.2, { life: 20 });
    }
    // 命中（穿透 2 + 10t 免疫）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）⑤：魔光剑斩痕 974（数据面 melee）——双支同序
      const snapBonusLb = projectileSnapStrikeBonus(game,
        { projId: 974 }, (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg), Math.sign(this.dirX) * 6.5, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(974);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    const fw = img.width, fh = img.height / 13;
    const sc = 0.7 * this.ai0;
    // num = Remap(frame,0,3,0,1)×Remap(frame,4,12,1,0)（辉光包络）
    const n = Math.min(1, Math.max(0, this.frame / 3)) * (this.frame <= 4 ? 1 : Math.max(0, (12 - this.frame) / 8));
    const pass = (frame: number, sx: number, sy: number, alpha: number, additive: boolean) => {
      if (alpha <= 0.02) return;
      ctx.save();
      if (additive) ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(this.cx, this.cy);
      ctx.rotate(this.rot);
      ctx.drawImage(img, 0, frame * fh, fw, fh, -fw * sx * sc / 2, -fh * sy * sc / 2, fw * sx * sc, fh * sy * sc);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    ctx.imageSmoothingEnabled = false;
    pass(12, 1, 6, 0.3 * n, true);   // 辉光 (1,6)×vector2（multiply→lighter 近似）
    pass(12, 2, 2, 0.3 * n, true);   // 辉光 (2,2)×vector2
    pass(this.frame, 1, 1, 1, false); // 本体帧（原版 ×4 遍合并为一遍）
  }
}

/** 草剑飞叶 976（AI_152_SuperStarSlash :20872-20995 的 976 分支 + 绘制 :30059）：
 *  出生（Player.cs:48318-48361）：弧线搜索（ZenithTarget 150px→敌人盒内随机点，否则
 *  ±20px 散布）；起=玩家中心随机半宽；ai[0]=每 tick 旋转量（num178/60）、
 *  ai[1]=弧步数；Damage×0.25。AI：vel=vel.RotatedBy(ai0) 弧线飞行；
 *  速度 = 4+12×(1−num6)（num6 = Remap(60−timeLeft,…)—**timeLeft 默认 3600 恒负 →
 *  num6=0 恒 16px/t**——原版 1.4.5.6 实际行为，忠实移植勿"修"）；2t/帧 ×7 帧循环；
 *  rotation=vel 角；tileCollide=false 穿墙；岩浆即亡；timeLeft 3600（远射程飞叶）。 */
export class GrassSlash extends Entity {
  w = 20; h = 20;
  damage: number;
  private ai0: number;
  private frame = 0;
  private frameCtr = 0;
  private life = 3600;
  private rot = 0;
  private first = true;
  private hitCd = new Map<number, number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, ai0: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.ai0 = ai0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    // 弧线（:20927-20930：vel.RotatedBy(ai0)）
    const c = Math.cos(this.ai0), s = Math.sin(this.ai0);
    const nvx = this.vx * c - this.vy * s, nvy = this.vx * s + this.vy * c;
    this.vx = nvx; this.vy = nvy;
    // 帧循环（2t/帧 ×7）
    if (++this.frameCtr >= 2) { this.frameCtr = 0; if (++this.frame >= 7) this.frame = 0; }
    // 恒速 16（num6=0：60−timeLeft 在 timeLeft=3600 下恒负 → Remap 钳 0——原版最终态）
    const sp = Math.hypot(this.vx, this.vy) || 1;
    this.vx = this.vx / sp * 16; this.vy = this.vy / sp * 16;
    this.rot = Math.atan2(this.vy, this.vx);
    this.x += this.vx; this.y += this.vy;
    // 岩浆即亡（:20953-20956）+ 出界
    const st = game.world.store;
    const cxT = Math.floor(this.cx / 16), cyT = Math.floor(this.cy / 16);
    if (!st.inBounds(cxT, cyT)) { this.dead = true; return; }
    if (st.liquidType[st.idx(cxT, cyT)] === 2) { this.dead = true; return; }
    // 尘 40 拖尾（1/3）+ 首帧 10 粒爆发
    if (this.first) {
      this.first = false;
      for (let i = 0; i < 10; i++) game.spawnParticles(this.cx, this.cy, '#7CE84A', 1, 1.5, { life: 22 });
    } else if (Math.random() < 1 / 3) {
      game.spawnParticles(this.cx, this.cy, '#7CE84A', 1, 1, { life: 18 });
    }
    // 命中（穿透 2 + 10t 免疫）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）⑥：草剑飞叶 976（数据面 melee）——双支同序
      const snapBonusGrass = projectileSnapStrikeBonus(game,
        { projId: 976 }, (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg)
        + (snapBonusGrass ? Math.trunc(snapBonusGrass * (crit ? 2 : 1)) : 0),
        Math.sign(this.vx) * 6.5, 0, game, this.armorPen, crit, 0, true);   // ★F1 旗乘区;fromPlayer=DPS 计
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(976);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    // 帧 = (0, frame*20, 32, 18)（:30063-30067）×1.3
    const fw = 32, fh = 18;
    const dw = fw * 1.3, dh = fh * 1.3;
    ctx.drawImage(img, 0, this.frame * 20, fw, fh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
}

/** 南瓜弹出生屏外偏移（Player.HorsemansBlade_SpawnPumpkin Player.cs:42444-42456）：
 *  Main.MaxWorldViewSize = Point(1920,1200)（Main.cs:754-758），前段 rand(100,300)（:42449-42450）在
 *  `num + (x/2 − num)` / `num − (x/2 + num)` 两分支中均被整式消去 = 死值——
 *  实际偏移恒 ±960/±600（各轴独立 50/50），即玩家位 ± 半视口。 */
const PUMPKIN_VIEW_HALF_X = 1920 / 2;
const PUMPKIN_VIEW_HALF_Y = 1200 / 2;

/** 南瓜弹出生（HorsemansBlade_SpawnPumpkin Player.cs:42444-42462 1:1）：
 *  位 = 玩家 position + (±960, ±600)（:42451-42454）、初速 = normalize(目标心−出生点)×8（:42456-42461）、
 *  ai[0] = 目标 npcIndex（仓内 = 实体 id）、dmg/kb = 调用方透传。 */
export function spawnHorsemansPumpkin(
  game: GameHooks, targetId: number, tcx: number, tcy: number, dmg: number, kb: number,
): HorsemansPumpkin {
  const p = game.player;
  const sx = p.x + (Math.random() < 0.5 ? -1 : 1) * PUMPKIN_VIEW_HALF_X;   // :42451 x 轴塌缩
  const sy = p.y + (Math.random() < 0.5 ? -1 : 1) * PUMPKIN_VIEW_HALF_Y;   // :42452 y 轴塌缩、:42453-42454 加玩家位
  const dx = tcx - sx, dy = tcy - sy;
  const dl = Math.hypot(dx, dy) || 1;
  const sp = 8 / dl;                                                       // :42458-42461 num5=8f/num5
  const pumpkin = new HorsemansPumpkin(sx, sy, dx * sp, dy * sp, dmg, kb, targetId);
  (game as unknown as { entities: { add(e: HorsemansPumpkin, bucket: string): void } })
    .entities.add(pumpkin, 'projectiles');                                 // NewProjectile :42462
  return pumpkin;
}

/** 无头骑士剑南瓜弹 321（SetDefaults Projectile.cs:4141-4150 + AI_055 :29201-29274）：
 *  30×30、friendly、melee、tileCollide=false 穿墙、ignoreWater、penetrate 1、
 *  timeLeft 3600。AI：向 ai[0] 目标收敛 v=(v×14+dir×8)/15；目标失效 → 1000px
 *  曼哈顿 + CanHit 重锁（无则保持直飞——原版 Kill 门只挡 ai[0] 越界槽，恒不触发）；
 *  每拍尘 6（8px 内缩、vel×0.5+弹速×0.5、noGravity/noLight、scale1.4）；命中即亡 +
 *  Kill 特效（:77759-77773 Sound 10 + 2×20 尘 6 反速 ×2）。 */
export class HorsemansPumpkin extends Entity {
  w = 30; h = 30;
  damage: number;
  kb: number;
  /** ai[0] = 目标实体 id（原版 npcIndex） */
  ai0: number;
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  private frame = 0;
  private frameCtr = 0;
  private life = 3600;
  private rot = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, kb: number, targetId: number) {
    super();
    this.x = x - this.w / 2; this.y = y - this.h / 2;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kb = kb;
    this.ai0 = targetId;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    // 帧循环（:29203-29212 frameCounter>0 恒真 → 每拍 +1、>2 归 0）
    if (++this.frameCtr > 0) { this.frameCtr = 0; if (++this.frame > 2) this.frame = 0; }
    // 追踪/重锁（:29223-29269）
    const enemies = game.enemies() as Array<{
      id: number; x: number; y: number; w: number; h: number; dead: boolean;
    }>;
    const tgt = enemies.find((e) => e.id === this.ai0);
    if (tgt && !tgt.dead && canBeChasedBy(tgt)) {
      // CanBeChasedBy（:29227/:91141）追踪重锁索敌门（命中校验仍走下方 Damage_PVE 门）
      const dx = tgt.x + tgt.w / 2 - this.cx, dy = tgt.y + tgt.h / 2 - this.cy;
      const dl = Math.hypot(dx, dy) || 1;
      this.vx = (this.vx * 14 + dx / dl * 8) / 15;                          // :29229 num427=8f、:29238 收敛式
      this.vy = (this.vy * 14 + dy / dl * 8) / 15;
    } else {
      // 重锁（:29241-29257）：1000 曼哈顿内 Collision.CanHit 最近者
      let bd = 1000, bi = 0;
      for (const e of enemies) {
        if (!canBeChasedBy(e)) continue;
        const d = Math.abs(this.cx - (e.x + e.w / 2)) + Math.abs(this.cy - (e.y + e.h / 2));
        if (d >= bd) continue;
        if (!canHitLine(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
        bd = d; bi = e.id;
      }
      if (bi !== 0) this.ai0 = bi;
    }
    // 朝向（:29213-29222：vx<0 → spriteDirection −1 + 反向 atan2；绘制侧 Y 翻转近似）
    this.rot = Math.atan2(this.vy, this.vx);
    // 尘 6（:29260-29268）
    const d = game.spawnDust?.(this.x + 8, this.y + 8, this.w - 16, this.h - 16, 6,
      this.vx * 0.5, this.vy * 0.5, 0, null, 1.4, true);
    if (d) { d.vx *= 0.5; d.vy *= 0.5; }
    this.x += this.vx; this.y += this.vy;
    // 命中（penetrate 1：首敌即亡；tileCollide=false 不撞块）
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game, 321)) continue;   // friendly 门（Damage_PVE_Inner :11892）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      // ★F3 接线（蓝队四轮）⑦：无头骑士南瓜弹 321（数据面 melee）——双支同序
      const snapBonusPumpkin = projectileSnapStrikeBonus(game,
        { projId: 321 }, (e as { cx?: number }).cx ?? e.x + e.w / 2, (e as { cy?: number }).cy ?? e.y + e.h / 2, e.id,
        { victimBox: { w: e.w, h: e.h, cx: (e as { cx?: number }).cx ?? e.x + e.w / 2,
          cy: (e as { cy?: number }).cy ?? e.y + e.h / 2 },
          targeterBox: { x: this.x, y: this.y, w: this.w, h: this.h } });
      e.hurt(applyBannerDamageDealt(game, e, dmg), Math.sign(this.vx || 1) * this.kb, 0, game, this.armorPen, crit, 0, true);   // fromPlayer=DPS 计
      // Kill 特效（Projectile.cs:77759-77773：SoundID.Item10 + 2×20 尘 6 反速 ×2）
      game.playSfxFiles(['Item_10'], 1, this.cx, this.cy);
      for (let i = 0; i < 20; i++) {
        for (const sc of [2, 1]) {
          const kd = game.spawnDust?.(this.x, this.y, this.w, this.h, 6,
            -this.vx * 0.2, -this.vy * 0.2, 100, null, sc);
          if (kd) { kd.vx *= 2; kd.vy *= 2; }
        }
      }
      this.dead = true;
      break;
    }
  }

  draw(r: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }): void {
    const img = projSprite(321);
    const ctx = r.ctx;
    if (!img || !(img.width > 0) || img.width === 0 || !ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    if (this.vx < 0) ctx.scale(1, -1);                 // spriteDirection −1（:29212-29215）
    ctx.imageSmoothingEnabled = false;
    const fh = img.height / 3;                         // Main.projFrames[321]=3（AI frame 0-2）
    ctx.drawImage(img, 0, this.frame * fh, img.width, fh, -img.width / 2, -fh / 2, img.width, fh);
    ctx.restore();
  }
}


/** ★L5 长尾批：真刃系挥弧命中编排分派（Projectile.Damage :12984-13031 ownedBySomeone 支——
 *  PositionInWorld=Main.rand.NextVector2FromRectangle(targetNPC.Hitbox)、MovementVector
 *  缺省零（case984|985 :13015 载 velocity）;clientOnly:false → 本地直生 + module8 上行。弹型映射：
 *  972→NightsEdge(10)/973→TrueNightsEdge(12)/982→Excalibur(13)/983→TrueExcalibur(14)/
 *  984|985→TerraBlade(15);997 无头骑士/976 草剑无编排面（vanilla 无对应 case）。
 *  ★δB1（2026-09-01）：MovementVector=弹体速度（1457/1458 Projectile.cs 同 :13015）——曾误传
 *  命中点 Y 的 (cos(hy),sin(hy))。锚弧支 vel=(direction,0) 恒定（Player.cs:49441 NewProjectile(
 *  MountedCenter,new Vector2(direction,0f),984…);AI_190 只读不改写 velocity:42749 num3=
 *  velocity.ToRotation()）→ 按朝向传 ±1;飞斩 972/973 支传实时 vx/vy（原版 Damage 时点读弹速）。 */
function swordTrailOrchestra(
  g: import('./types').GameHooks, projId: number,
  e: { x: number; y: number; w: number; h: number },
  mvX = 0, mvY = 0,
): void {
  const hx = e.x + Math.random() * e.w;
  const hy = e.y + Math.random() * e.h;
  switch (projId) {
    case 972:
      nightsEdgeFx(g, hx, hy);
      g.broadcastParticleOrchestra?.(ParticleOrchestraType.NightsEdge, hx, hy);
      break;
    case 973:
      trueNightsEdgeFx(g, hx, hy);
      g.broadcastParticleOrchestra?.(ParticleOrchestraType.TrueNightsEdge, hx, hy);
      break;
    case 982:
      excaliburFx(g, hx, hy);
      g.broadcastParticleOrchestra?.(ParticleOrchestraType.Excalibur, hx, hy);
      break;
    case 983:
      trueExcaliburFx(g, hx, hy);
      g.broadcastParticleOrchestra?.(ParticleOrchestraType.TrueExcalibur, hx, hy);
      break;
    case 984:
    case 985:
      // MovementVector=弹体速度（Projectile.cs:13015 settings.MovementVector=velocity）
      terraBladeFx(g, hx, hy, mvX, mvY);
      g.broadcastParticleOrchestra?.(ParticleOrchestraType.TerraBlade, hx, hy, mvX, mvY);
      break;
    default:
      break;
  }
}

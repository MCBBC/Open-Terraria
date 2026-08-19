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
//   997 南瓜弹 321（:12837→Player:41472 屏外 100-300px 召 321 追击）暂缓。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound } from './projTargets';
import { prettyStarSparkle } from '../render/Renderer';

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
    // 尘近似（AI_190 各型号 278/107/267 火花——按 num3 包络概率降采样）
    if (Math.random() < this.op * 0.5) {
      const a2 = this.rot + (Math.random() - 0.5) * Math.PI / 2;
      game.spawnParticles(this.cx + Math.cos(a2) * 84 * this.scaleCur,
        this.cy + Math.sin(a2) * 84 * this.scaleCur,
        `rgb(${this.style.c2[0]},${this.style.c2[1]},${this.style.c2[2]})`, 1, 1.4, { life: 18 });
    }
    // 命中：穿透（型号表）+ 同敌单跳（usesLocalNPCImmunity 族）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitSet.has(e.id)) continue;
      const reach = 85 * this.scaleCur;
      const ex = this.cx + Math.cos(this.rot) * reach * 0.5;
      const ey = this.cy + Math.sin(this.rot) * reach * 0.5;
      const bw = reach, bh = 60 * this.scaleCur;
      if (!(ex - bw / 2 < e.x + e.w && ex + bw / 2 > e.x && ey - bh / 2 < e.y + e.h && ey + bh / 2 > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, this.ai0 * 6.5, 0, game, this.armorPen, crit);
      game.addDamageNumber(ex, ey, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitSet.add(e.id);
    }
    if (this.t >= this.ai1) this.dead = true;
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(this.projId);
    const ctx = r.canvas.getContext('2d');
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
        const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
        if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
        const ex = this.cx + Math.cos(this.rot) * reach * 0.5;
        const ey = this.cy + Math.sin(this.rot) * reach * 0.5;
        if (!(ex - reach / 2 < e.x + e.w && ex + reach / 2 > e.x && ey - 30 * this.scaleCur < e.y + e.h && ey + 30 * this.scaleCur > e.y)) continue;
        const crit = Math.random() < this.critChance;
        const dmg = crit ? this.damage * 2 : this.damage;
        playEnemyHitSound(game, e);
        e.hurt(dmg, this.ai0 * 6.5, 0, game, this.armorPen, crit);
        game.addDamageNumber(ex, ey, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
        this.hitCd.set(e.id, 5);
      }
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(973);
    const ctx = r.canvas.getContext('2d');
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
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitCd.has(e.id)) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * 6.5, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 9999);
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(972);
    const ctx = r.canvas.getContext('2d');
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
 *  绘制：本体 = 【ai[1] 物品贴图】（:30181 LoadItem(ai[1])，基角 −π/4×spriteDir）
 *  + 彩带拖尾（VertexStrip→canvas polyline，trailColor 见档案表）。
 *  档案表（FinalFractalHelper.cs:81-168：剑物品 id → 全刃长/拖尾色）。 */
const FRACTAL_PROFILES: Record<number, { len: number; color: [number, number, number] }> = {
  65: { len: 48, color: [236, 62, 192] }, 1123: { len: 48, color: [138, 78, 229] },   // 1123=OurFavoriteColor 近似紫
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

/** GetRandomProfileIndex（:170-180）：档案表随机，命中 4956 重掷一次 */
export function randomFractalProfile(excludeZenith = true): number {
  const keys = Object.keys(FRACTAL_PROFILES).map(Number);
  let id = keys[Math.floor(Math.random() * keys.length)];
  if (excludeZenith && id === 4956) id = keys[Math.floor(Math.random() * keys.length)];
  return id;
}

export class ZenithSword extends Entity {
  w = 32; h = 32;
  damage: number;
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
  /** oldPos 拖尾环（彩带） */
  private trail: number[] = [];
  critChance = 0.04;
  armorPen = 0;
  dead = false;
  lightRGB: [number, number, number] | null = null;

  constructor(owner: ArcOwner, tx: number, ty: number, damage: number, profile: number) {
    super();
    this.owner = owner;
    this.vx = (tx - owner.cx) / 2;   // :48116 vector44 = vector45/2（非归一——轨道半径）
    this.vy = (ty - owner.cy) / 2;
    this.damage = damage;
    this.ai0 = Math.floor(Math.random() * 201) - 100;
    this.ai1 = profile;
  }

  /** GetLerpValue(from,to,t,clamped) 语义——线性后钳 [0,1]（递减区间 from>to 同式，
   *  曾按 min/max 早退写反：900→0 区间 t≥900 应得 0 非 1） */
  private static lerpV(a: number, b: number, t: number): number {
    if (a === b) return t >= a ? 1 : 0;
    const v = (t - a) / (b - a);
    return Math.max(0, Math.min(1, v));
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // vanilla-projectiles 933 extraUpdates=1——AI 每 tick 跑两遍（整程 120 计数
    // 60 游戏秒帧耗尽；曾单跑=轨道慢一倍且滞空过久，2026-08-19 审查）
    this.step(game);
    this.step(game);
  }

  private step(game: GameHooks): void {
    if (this.counter === 0) game.playSfxFiles(['Item_169'], 1, this.cx, this.cy);   // :40439
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
    this.trail.push(this.cx, this.cy);
    if (this.trail.length > 20) this.trail.splice(0, this.trail.length - 20);
    this.opacity = ZenithSword.lerpV(0, 5, this.counter) * ZenithSword.lerpV(120, 115, this.counter);
    const prof = FRACTAL_PROFILES[this.ai1] ?? { len: 50, color: [255, 255, 255] as [number, number, number] };
    this.lightRGB = [prof.color[0] / 255 * 0.5 * this.opacity, prof.color[1] / 255 * 0.5 * this.opacity, prof.color[2] / 255 * 0.5 * this.opacity];
    // 拖尾尘（profile.dustMethod → StripDust 1/9×1-3 粒——降采样近似）
    if (phase < 1 && Math.random() < 0.35) {
      game.spawnParticles(this.cx, this.cy, `rgb(${prof.color[0]},${prof.color[1]},${prof.color[2]})`,
        1, 1.2, { life: 20 });
    }
    // 命中（穿透 -1 + 10t 免疫）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, this.spriteDir * 6.5, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement; atlas?: unknown }): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx || this.opacity <= 0.01) return;
    const prof = FRACTAL_PROFILES[this.ai1] ?? { len: 50, color: [255, 255, 255] as [number, number, number] };
    // 彩带拖尾（VertexStrip→polyline，lighter）
    if (this.trail.length >= 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${prof.color[0]},${prof.color[1]},${prof.color[2]},${0.5 * this.opacity})`;
      ctx.lineWidth = prof.len / 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.trail[0], this.trail[1]);
      for (let i = 2; i < this.trail.length; i += 2) ctx.lineTo(this.trail[i], this.trail[i + 1]);
      ctx.stroke();
      ctx.restore();
    }
    // 本体 = ai[1] 物品贴图（:30181-30186：LoadItem(ai[1])，基角 −π/4×spriteDir）
    const icon = (r.atlas as unknown as { vicon?: (id: number) => { img: ImageBitmap | HTMLImageElement; sx: number; sy: number; sw: number; sh: number } | null } | undefined)?.vicon?.(this.ai1);
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot - Math.PI / 4 * this.spriteDir * -1);
    if (icon) {
      ctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, -icon.sw / 2, -icon.sh / 2, icon.sw, icon.sh);
    } else {
      ctx.fillStyle = `rgb(${prof.color[0]},${prof.color[1]},${prof.color[2]})`;
      ctx.fillRect(-16, -16, 32, 32);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.dirX) * 6.5, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(974);
    const ctx = r.canvas.getContext('2d');
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
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || (this.hitCd.get(e.id) ?? 0) > 0) continue;
      if (!(this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y)) continue;
      const crit = Math.random() < this.critChance;
      const dmg = crit ? this.damage * 2 : this.damage;
      playEnemyHitSound(game, e);
      e.hurt(dmg, Math.sign(this.vx) * 6.5, 0, game, this.armorPen, crit);
      game.addDamageNumber(this.cx, this.cy, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
      this.hitCd.set(e.id, 10);
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(976);
    const ctx = r.canvas.getContext('2d');
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

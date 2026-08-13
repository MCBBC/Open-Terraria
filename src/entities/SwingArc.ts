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
//   【备案】DrawPrettyStarSparkle 星尘原语未移植（粒子近似，同 402 星尘蠕虫先例）；
//   997 南瓜弹 321（:12837→Player:41472 屏外 100-300px 召 321 追击）暂缓。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import { projSprite } from './Arrow';
import { playEnemyHitSound } from './projTargets';

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
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
    const fw = img.naturalWidth, fh = img.naturalHeight / 4;
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
  private vx: number; private vy: number;
  private hitCd = new Map<number, number>();
  critChance = 0.04;
  armorPen = 0;
  dead = false;
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
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
    const fw = img.naturalWidth, fh = img.naturalHeight / 4;
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
  }

  private tneLayer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, fw: number, fh: number,
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
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
    const fw = img.naturalWidth, fh = img.naturalHeight / 4;
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

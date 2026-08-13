// 最后的棱镜（Last Prism 3541）弹链 1:1：
//   633 棱镜晶体（SetDefaults :6514）：14×18 aiStyle75 drawLayer7 magic，channel 主控。
//     AI_075（:63626-63717）：ai[0]=charge（魔耗节奏 30→90t 后 15→120t 后 5）；
//     ai[1] 每 tick 置 0：aim=鼠标向 lerp(prev,0.92) 平滑 ×shootSpeed(30)；
//     channel&&mana&&!noItems&&!CCed 存活，charge==1 时生成 6×632 光棱；
//     断 channel → Kill。
//   632 光棱（SetDefaults :6525）：18×18 aiStyle84 alpha255 tileCollide=false。
//     AI_084（:30326-30382）：charge 三段展开——<120t 散 20−4×(t/120)、透明
//     t/120×0.4；120-180t 散 16−10×((t−120)/60)、透明 0.4→1；≥180t 散 1.75
//     【伤害 ×3】；光棱绕 aim 旋转分布（UnitY.RotatedBy(orbit)×(4,num725)）；
//     friendly 门 charge>30t（前 0.5s 不伤敌）。
//     激光长度 = LaserScan 沿向 2400 截实心（:30498，localAI[1] Lerp 0.75 平滑）；
//     命中 = 线碰撞盒 厚 22×scale（:14669-14677）+ 同敌 5t 免疫（:13032）。
//     绘制（Main.cs:32018-32040）：Utils.DrawLaser×2（hue 色 0.75 透明 + 内白
//     半宽）；hue = GetLastPrismHue 默认 laserIndex/6（彩虹，:20692——玩家名
//     彩蛋分支不移植）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { projSprite, Arrow } from './Arrow';
import { playEnemyHitSound } from './projTargets';

/** hslToRgb（原版 Main.hslToRgb 近似——S=1 L=0.5 时的纯色环） */
function hueToRgb(h: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  const c = 1, x = c * (1 - Math.abs((h * 6) % 2 - 1));
  let r = 0, g = 0, b = 0;
  const seg = Math.floor(h * 6);
  if (seg === 0) { r = c; g = x; } else if (seg === 1) { r = x; g = c; }
  else if (seg === 2) { g = c; b = x; } else if (seg === 3) { g = x; b = c; }
  else if (seg === 4) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export class PrismProng extends Entity {
  w = 18; h = 18;
  /** ai[0] 棱序 0-5 */
  idx: number;
  parent: PrismProj | null = null;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** 光束方向（velocity） */
  vx = 0; vy = -1;
  /** localAI[1] 激光长度（Lerp 平滑） */
  beamLen = 0;
  /** 充能透明度（0..1） */
  opacity = 0;
  /** 光棱 scale（charge 展开 1.4×(1−num724)，满充 1.4） */
  prongScale = 1;
  /** 同敌 5t 免疫（immune[owner]=5 :13032） */
  private hitCd = new Map<number, number>();
  dead = false;
  lightRGB: [number, number, number] | null = null;

  constructor(idx: number, damage: number, knockback: number) {
    super();
    this.idx = idx;
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = this.parent;
    if (!p || p.dead) { this.dead = true; return; }
    const charge = p.charge;
    // ---- 充能三段展开（:30338-30366）----
    let num723 = 20, num725 = 15, num726 = -2, num724 = 1;
    if (charge < 180) {
      num724 = 1 - charge / 180;
      num725 = 20 - charge / 180 * 14;
      if (charge < 120) {
        num723 = 20 - 4 * (charge / 120);
        this.opacity = charge / 120 * 0.4;
      } else {
        num723 = 16 - 10 * ((charge - 120) / 60);
        this.opacity = 0.4 + (charge - 120) / 60 * 0.6;
      }
      num726 = -22 + charge / 180 * 20;
    } else {
      num724 = 0; num723 = 1.75; num725 = 6;
      this.opacity = 1; num726 = -2;
    }
    // ---- 光棱轨道分布（:30368-30376）----
    const aim = Math.atan2(p.dirY, p.dirX);
    const off = this.idx - 2.5;
    const orbit = (charge + off * num723) / (num723 * 6) * Math.PI * 2;
    // UnitY.RotatedBy(θ) = (−sinθ, cosθ)（XNA 旋转阵）；num722 取其 .Y=cosθ
    const spreadRot = Math.cos(orbit) * (Math.PI / 6) * num724;   // :30376
    // 预旋转分量（:30374：(−sinθ,cosθ)×(4,num725)——曾写 sin(θ+π/2) 相位错，修正）
    const pxPre = -4 * Math.sin(orbit);
    const pyPre = num725 * Math.cos(orbit);
    // 轨道偏移旋转到 aim 系（.RotatedBy(aim)）
    const ca = Math.cos(aim), sa = Math.sin(aim);
    this.x = p.cx - this.w / 2 + ca * 16 + ca * num726 + (ca * pxPre - sa * pyPre);
    this.y = p.cy - this.h / 2 + sa * 16 + sa * num726 + (sa * pxPre + ca * pyPre);
    // 光束方向 = aim 旋转 spreadRot
    const rot = aim + spreadRot;
    this.vx = Math.cos(rot);
    this.vy = Math.sin(rot);
    this.prongScale = 1.4 * (1 - num724);
    // ---- 激光长度：LaserScan 沿向 2400 截实心（:30498，2 样本均值→单线近似）----
    const st = game.world.store;
    let scanLen = 2400;
    for (let d = 0; d <= 2400; d += 8) {
      const tx = Math.floor((this.cx + this.vx * d) / TILE);
      const ty = Math.floor((this.cy + this.vy * d) / TILE);
      if (!st.inBounds(tx, ty)) { scanLen = d; break; }
      if (st.isSolid(tx, ty)) { scanLen = d; break; }
    }
    this.beamLen = this.beamLen + (scanLen - this.beamLen) * 0.75;   // Lerp 0.75（:30518-30521）
    // ---- 命中：线碰撞盒 厚 22×scale（:14669-14677），friendly=charge>30 ----
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    if (charge > 30) {
      const thick = 22 * this.prongScale;
      const steps = Math.max(1, Math.floor(this.beamLen / 12));
      for (const ent of game.enemies()) {
        const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
        if (e.dead || this.hitCd.has(e.id)) continue;
        for (let s2 = 1; s2 <= steps; s2++) {
          const d = s2 * 12;
          if (d > this.beamLen) break;
          const bx = this.cx + this.vx * d - thick / 2, by = this.cy + this.vy * d - thick / 2;
          if (!(bx < e.x + e.w && bx + thick > e.x && by < e.y + e.h && by + thick > e.y)) continue;
          const crit = Math.random() < this.critChance;
          let dmg = crit ? this.damage * 2 : this.damage;
          if (charge >= 180) dmg *= 3;                     // 满充 ×3（:30379-30381）
          playEnemyHitSound(game, e);
          e.hurt(dmg, this.vx * this.knockback, this.vy * this.knockback, game, this.armorPen, crit);
          game.addDamageNumber(this.cx, this.cy - 8, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
          this.hitCd.set(e.id, 5);
          break;
        }
      }
    }
    // ---- 光棱点光 + 彩色尘（:30622-30660 简化）----
    const [lr, lg, lb] = hueToRgb(this.idx / 6);
    this.lightRGB = [lr / 255 * 0.5, lg / 255 * 0.5, lb / 255 * 0.5];
    if (Math.random() < 0.5) {
      game.spawnParticles(this.cx + this.vx * Math.min(this.beamLen, 200),
        this.cy + this.vy * Math.min(this.beamLen, 200),
        `rgb(${lr},${lg},${lb})`, 1, 1.2, { life: 16 });
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx || this.beamLen < 8) return;
    const [rr, gg, bb] = hueToRgb(this.idx / 6);
    const a = Math.max(0, Math.min(1, this.opacity * 0.75));
    if (a <= 0.02) return;
    const x2 = this.cx + this.vx * this.beamLen, y2 = this.cy + this.vy * this.beamLen;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 主束（26×scale×0.75 厚，hue 色）+ 内白半宽（Main.cs:32032-32040 双 pass）
    ctx.strokeStyle = `rgba(${rr},${gg},${bb},${a})`;
    ctx.lineWidth = 26 * this.prongScale * 0.75;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.75})`;
    ctx.lineWidth = 13 * this.prongScale * 0.75;
    ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
}

export class PrismProj extends Entity {
  w = 14; h = 18;
  /** ai[0] 充能计数 */
  charge = 0;
  /** 平滑瞄准方向（velocity，模长=shootSpeed 30） */
  dirX: number; dirY: number;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  /** channel 电平 / 瞄准点 / 每拍魔耗（失败=false） */
  channelCb: () => boolean;
  aimCb: () => { x: number; y: number };
  payMana: () => boolean;
  prongs: PrismProng[] = [];
  dead = false;
  private frame = 0;
  private spawnGuard = false;

  constructor(dirX: number, dirY: number, damage: number, knockback: number,
    channelCb: () => boolean, aimCb: () => { x: number; y: number }, payMana: () => boolean) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dirX = dirX / n * 30; this.dirY = dirY / n * 30;   // shootSpeed 30
    this.damage = damage;
    this.knockback = knockback;
    this.channelCb = channelCb;
    this.aimCb = aimCb;
    this.payMana = payMana;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.frame++;
    // 魔耗节奏（:63628-63636：>90t 15 拍、>120t 5 拍，否则 30 拍）
    this.charge++;
    const cadence = this.charge > 120 ? 5 : this.charge > 90 ? 15 : 30;
    if (this.charge % cadence === 0 && !this.payMana()) { this.dead = true; this.killProngs(); return; }
    // aim 平滑（:63662-63676）：value7=Normalize(瞄准向) 先归一，再
    // Lerp(value7, Normalize(velocity), 0.92)（曾漏归一直接 0.08×原始差——鼠标
    // 距离越远偏差越大，2026-08-13 复查修正）
    const aim = this.aimCb();
    const pd = Math.hypot(this.dirX, this.dirY) || 1;
    let ax = aim.x - this.cx, ay = aim.y - this.cy;
    const al = Math.hypot(ax, ay) || 1;
    ax /= al; ay /= al;
    let mx = ax * 0.08 + (this.dirX / pd) * 0.92;
    let my = ay * 0.08 + (this.dirY / pd) * 0.92;
    const ml = Math.hypot(mx, my) || 1;
    this.dirX = mx / ml * 30; this.dirY = my / ml * 30;
    // channel 门（:63700-63717）：断 channel/noItems/CCed → Kill
    if (!this.channelCb()) { this.dead = true; this.killProngs(); return; }
    // 挂玩家手（heldProj 语义：parent.Center 即光棱轨道圆心）
    const pl = game.player as unknown as { cx: number; cy: number } | null;
    if (!pl) { this.dead = true; this.killProngs(); return; }
    this.x = pl.cx - this.w / 2;
    this.y = pl.cy - this.h / 2;
    // 首帧生成 6 光棱（:63702-63710）
    if (!this.spawnGuard) {
      this.spawnGuard = true;
      const nd = Math.hypot(this.dirX, this.dirY) || 1;
      for (let i = 0; i < 6; i++) {
        const prong = new PrismProng(i, this.damage, this.knockback);
        prong.parent = this;
        prong.vx = this.dirX / nd; prong.vy = this.dirY / nd;
        prong.critChance = this.critChance;
        prong.armorPen = this.armorPen;
        this.prongs.push(prong);
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(prong, 'projectiles');
      }
    }
  }

  private killProngs(): void {
    for (const q of this.prongs) q.dead = true;
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    // 晶体本体（Projectile_633.png 26×120 = 5 帧；帧按充能推进≈3t/帧）
    const img = projSprite(633);
    const ctx = r.canvas.getContext('2d');
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
    const fh = img.naturalHeight / 5;
    const f = Math.floor(this.frame / 3) % 5;
    const rot = Math.atan2(this.dirY, this.dirX);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(rot);
    ctx.drawImage(img, 0, Math.round(f * fh), img.naturalWidth, Math.round(fh),
      -img.naturalWidth / 2, -fh / 2, img.naturalWidth, fh);
    ctx.restore();
  }
}

/** 充能爆破炮 2882 → 460/461/459（AI_075 :63442-63620 的 460 分支 + AI_84 461 锚定）：
 *  460 晶体：channel 主控；ai[0] 计数（80=二档尘/180=满蓄 flag4）；每 5t 重瞄
 *  （vel=归一瞄准向）；音 Item15 按 (5−档)×2 间隔；459 小弹发射点 = ai0==1、
 *  ≤50 每 10t、80-180 每 30t（速度 10）；ai0==180 发 461 光束（伤害×1.5）后
 *  光束灭即亡。命中 461 = 线碰撞 22×scale（:14612-14620）+ LaserScan 2400。 */
export class BlasterBeam extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  parent: ChargedBlaster | null = null;
  vx = 0; vy = -1;
  beamLen = 0;
  private hitCd = new Map<number, number>();
  dead = false;
  lightRGB: [number, number, number] | null = [0.5, 0.2, 0.5];

  constructor(damage: number, knockback: number) {
    super();
    this.damage = damage;
    this.knockback = knockback;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    const p = this.parent;
    if (!p || p.dead) { this.dead = true; return; }
    // 锚定（AI_84 :30313-30319：Center = 父.Center + 归一vel×16）
    this.x = p.cx + p.dirX * 16 - this.w / 2;
    this.y = p.cy + p.dirY * 16 - this.h / 2;
    this.vx = p.dirX; this.vy = p.dirY;
    // 激光长度（LaserScan 2400 截实心）
    const st = game.world.store;
    let scanLen = 2400;
    for (let d = 0; d <= 2400; d += 8) {
      const tx = Math.floor((this.cx + this.vx * d) / TILE);
      const ty = Math.floor((this.cy + this.vy * d) / TILE);
      if (!st.inBounds(tx, ty)) { scanLen = d; break; }
      if (st.isSolid(tx, ty)) { scanLen = d; break; }
    }
    this.beamLen = this.beamLen + (scanLen - this.beamLen) * 0.75;
    // 线碰撞命中（厚 22）
    for (const [k, v] of this.hitCd) {
      if (v <= 1) this.hitCd.delete(k); else this.hitCd.set(k, v - 1);
    }
    const thick = 22;
    const steps = Math.max(1, Math.floor(this.beamLen / 12));
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || this.hitCd.has(e.id)) continue;
      for (let s2 = 1; s2 <= steps; s2++) {
        const d = s2 * 12;
        if (d > this.beamLen) break;
        const bx = this.cx + this.vx * d - thick / 2, by = this.cy + this.vy * d - thick / 2;
        if (!(bx < e.x + e.w && bx + thick > e.x && by < e.y + e.h && by + thick > e.y)) continue;
        const crit = Math.random() < this.critChance;
        const dmg = crit ? this.damage * 2 : this.damage;
        playEnemyHitSound(game, e);
        e.hurt(dmg, this.vx * this.knockback, this.vy * this.knockback, game, this.armorPen, crit);
        game.addDamageNumber(this.cx, this.cy - 8, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
        this.hitCd.set(e.id, 5);
        break;
      }
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx || this.beamLen < 8) return;
    const x2 = this.cx + this.vx * this.beamLen, y2 = this.cy + this.vy * this.beamLen;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(230,140,255,0.85)';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }
}

export class ChargedBlaster extends Entity {
  w = 14; h = 18;
  damage: number;
  knockback: number;
  critChance = 0.04;
  armorPen = 0;
  dirX: number; dirY: number;
  channelCb: () => boolean;
  aimCb: () => { x: number; y: number };
  payMana: () => boolean;
  beam: BlasterBeam | null = null;
  dead = false;
  private charge = 0;
  private aimCd = 0;
  private sndT = 0;

  constructor(dirX: number, dirY: number, damage: number, knockback: number,
    channelCb: () => boolean, aimCb: () => { x: number; y: number }, payMana: () => boolean) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dirX = dirX / n; this.dirY = dirY / n;
    this.damage = damage;
    this.knockback = knockback;
    this.channelCb = channelCb;
    this.aimCb = aimCb;
    this.payMana = payMana;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.charge++;
    const full = this.charge >= 180;
    const stage = (this.charge >= 180 ? 2 : this.charge >= 80 ? 1 : 0);
    // 重瞄（:63476-63496：满蓄前 ai1≥5 门、满蓄 ai0%5）
    if (!full) this.aimCd++;
    if ((!full && this.aimCd >= 5) || (full && this.charge % 5 === 0)) {
      if (!full) this.aimCd = 0;
      const aim = this.aimCb();
      let ax = aim.x - this.cx, ay = aim.y - this.cy;
      const al = Math.hypot(ax, ay) || 1;
      this.dirX = ax / al; this.dirY = ay / al;
    }
    // 音（Item15 按 (5−档)×2 间隔，非首帧）
    if (this.sndT <= 0 && !full) {
      this.sndT = (5 - stage) * 2;
      if (this.charge !== 1) game.playSfxFiles(['Item_15'], 1, this.cx, this.cy);
    }
    this.sndT--;
    // channel 门（:63562-63565）——断链即亡
    if (!this.channelCb()) { this.dead = true; if (this.beam) this.beam.dead = true; return; }
    // 挂手
    const pl = game.player as unknown as { cx: number; cy: number } | null;
    if (!pl) { this.dead = true; return; }
    this.x = pl.cx - this.w / 2;
    this.y = pl.cy - this.h / 2;
    if (!full) {
      // 459 小弹（:63592-63620：ai0==1 / ≤50 每 10t / 80-180 每 30t；速度 10）
      const fire = this.charge === 1
        || (this.charge <= 50 && this.charge % 10 === 0)
        || (this.charge >= 80 && this.charge % 30 === 0);
      if (fire && this.payMana()) {
        const bolt = new Arrow(this.cx, this.cy, this.dirX * 10, this.dirY * 10,
          this.damage, this.knockback, 459, null,
          { grav: 0, life: 600, pierce: 1 });
        bolt.critChance = this.critChance;
        bolt.armorPen = this.armorPen;
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(bolt, 'projectiles');
      }
    } else if (this.charge === 180) {
      // 满蓄发 461 光束（伤害 ×1.5，:63569-63578）
      if (this.payMana()) {
        const beam = new BlasterBeam(Math.round(this.damage * 1.5), this.knockback);
        beam.parent = this;
        beam.critChance = this.critChance;
        beam.armorPen = this.armorPen;
        this.beam = beam;
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(beam, 'projectiles');
      } else {
        this.dead = true; return;
      }
    } else if (this.beam?.dead) {
      this.dead = true; return;      // 光束灭即亡（:63580-63587）
    }
  }

  draw(r: { canvas: HTMLCanvasElement }): void {
    const img = projSprite(460);
    const ctx = r.canvas.getContext('2d');
    if (!img || !img.complete || img.naturalWidth === 0 || !ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(Math.atan2(this.dirY, this.dirX));
    if (this.dirX < 0) ctx.scale(1, -1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }
}

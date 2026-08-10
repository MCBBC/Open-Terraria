// 数据驱动近战/爆炸武器投射物（1456 aiStyle 家族行为，Game.useCombatWeapon 派发）：
//   Boomerang  aiStyle 3   —— 飞出减速后返回主角（AI_003）
//   SpearProj  aiStyle 19/161 —— 随主角前刺伸缩（AI_019 的 owner 相对位移简化）
//   YoyoProj   aiStyle 99  —— 按住鼠标滞留追光标，松手收回（AI_099 channel 语义）；
//                              连枷 aiStyle 15 复用（甩链球近似，重力头由加速度兜住）
//   GrenadeProj aiStyle 16 —— 弹跳 + 引信爆炸（手雷 180/炸弹 150/炸药 135 tick）
// 贴图统一 Projectile_N.png 懒加载（Arrow.projSprite 共享缓存）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitCritters } from './projTargets';

/** 共用绘制：投射物贴图按角度旋转（贴图纵向，rotation = ang+π/2 与 AI_001 一致）。
 *  世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标) */
function drawProj(r: Renderer, _cam: Camera, e: { x: number; y: number; w: number }, projId: number, ang: number, fallbackColor: string): void {
  const ctx = r.canvas.getContext('2d');
  if (!ctx) return;
  const img = projSprite(projId);
  ctx.save();
  ctx.translate(e.x + e.w / 2, e.y + e.w / 2);
  ctx.rotate(ang);
  ctx.imageSmoothingEnabled = false;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -e.w / 2, -e.w / 2, e.w, e.w * (img.naturalHeight / img.naturalWidth));
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(-e.w / 2, -e.w / 2, e.w, e.w);
  }
  ctx.restore();
}

/** 同敌命中去重 + 冷却的通用伤害结算。
 *  hitCd 记录每敌剩余冷却 tick，每 fixedUpdate 调用方先 tickCd() 递减；
 *  cooldown >= 9999 视作单次结算（突刺类：一击每敌只中一次） */
class HitCooldown {
  private map = new Map<number, number>();
  tick(): void {
    for (const [k, v] of this.map) {
      if (v <= 1) this.map.delete(k);
      else this.map.set(k, v - 1);
    }
  }
  ready(id: number, cooldown: number): boolean {
    if (this.map.has(id)) return false;
    if (cooldown < 9999) this.map.set(id, cooldown);
    else this.map.set(id, 2147483647); // 永不再中
    return true;
  }
  clear(): void { this.map.clear(); }
}

function hitEnemies(
  self: { x: number; y: number; w: number; h: number; damage: number; knockback: number },
  game: GameHooks,
  hitCd: HitCooldown,
  cooldown: number,
  dirX: number,
): void {
  // 小动物:一击致死(原版小动物是 NPC;近战挥砍同语义)。回旋镖/悠悠球等穿透型
  // 命中小动物不消耗穿透语义——hurt 自带 iframes 防同帧连击
  hitCritters(self, game);
  for (const ent of game.enemies()) {
    const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean };
    if (e.dead) continue;
    if (!(self.x < e.x + e.w && self.x + self.w > e.x && self.y < e.y + e.h && self.y + self.h > e.y)) continue;
    if (!hitCd.ready(e.id, cooldown)) continue;
    const crit = Math.random() < 0.04;
    const dmg = crit ? self.damage * 2 : self.damage;
    const kdir = Math.sign((e.x + e.w / 2) - (self.x + self.w / 2)) || dirX;
    e.hurt(dmg, kdir * self.knockback * 0.65, -2.5, game);
    game.addDamageNumber(self.x + self.w / 2, self.y, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
  }
}

// ================= 回旋镖（aiStyle 3，AI_003） =================

export class Boomerang extends Entity {
  w = 22; h = 22; // 原版 SetDefaults（type 6：22×22）
  damage: number;
  knockback: number;
  projId: number;
  /** 旋转角（回旋镖持续自旋） */
  private rot = 0;
  /** 飞出段累计；返回段置 true */
  private returning = false;
  private hitCd = new HitCooldown();
  life = 900;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot, '#C0A060');
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    this.rot += 0.35;
    this.hitCd.tick();
    if (!this.returning) {
      // 飞出段：速度衰减（原版摩擦），衰减到阈值/撞墙 → 进入返回段
      this.vx *= 0.985;
      this.vy *= 0.985;
      this.x += this.vx;
      this.y += this.vy;
      const tx = Math.floor((this.x + this.w / 2) / TILE);
      const ty = Math.floor((this.y + this.h / 2) / TILE);
      if (game.world.store.isSolid(tx, ty) || Math.hypot(this.vx, this.vy) < 2.2) {
        this.returning = true;
        this.hitCd.clear(); // 返程可再次命中（原版去而复返二次伤害语义）
        // 轻微弹出防嵌入墙内
        this.x -= this.vx; this.y -= this.vy;
      }
    } else {
      // 返回段：朝主角加速（原版 AI_003 尾段朝 owner 归位）
      const dx = p.cx - (this.x + this.w / 2);
      const dy = p.cy - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 0.9;
      this.vy += (dy / d) * 0.9;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 12) { this.vx = (this.vx / sp) * 12; this.vy = (this.vy / sp) * 12; }
      this.x += this.vx;
      this.y += this.vy;
      if (d < 16) { this.dead = true; return; } // 回到手中
    }
    hitEnemies(this, game, this.hitCd, 20, Math.sign(this.vx));
  }
}

// ================= 长矛（aiStyle 19，AI_019 随角色前刺） =================

export class SpearProj extends Entity {
  w = 20; h = 20;
  damage: number;
  knockback: number;
  projId: number;
  /** 刺出方向（单位向量，原版出手时定死） */
  private dx: number;
  private dy: number;
  /** 最大刺出距离 px（原版 spear reach ≈ 5.5 格 + shootSpeed 修正） */
  private reach: number;
  private t = 0;
  private dur: number;
  private hitCd = new HitCooldown();
  dead = false;

  constructor(dirX: number, dirY: number, reach: number, dur: number, damage: number, knockback: number, projId: number) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dx = dirX / n;
    this.dy = dirY / n;
    this.reach = reach;
    this.dur = dur;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, Math.atan2(this.dy, this.dx) + Math.PI / 2, '#A0A0B0');
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    this.t++;
    if (this.t >= this.dur) { this.dead = true; return; }
    // 原版 AI_019：矛锚定在角色中心，沿出手方向伸缩（sin 曲线 0→reach→0）
    const k = Math.sin((this.t / this.dur) * Math.PI);
    const ext = k * this.reach;
    const p = game.player;
    this.x = p.cx - this.w / 2 + this.dx * ext;
    this.y = p.cy - this.h / 2 + this.dy * ext;
    hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1); // 一次突刺每敌只结算一次
  }
}

// ================= 悠悠球 / 连枷（aiStyle 99 / 15，channel 语义） =================

export class YoyoProj extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  projId: number;
  /** 持续按住判定（原版 channel：按住时悠悠球滞留追光标） */
  private channel: () => boolean;
  /** 光标世界坐标 getter */
  private target: () => { x: number; y: number };
  /** 线长上限 px（原版 stringLength，按 shootSpeed 修正） */
  private stringLen: number;
  /** 连枷头带重力（aiStyle 15 的链球比悠悠球更坠） */
  private flail: boolean;
  private hitCd = new HitCooldown();
  private rot = 0;
  /** 手部坐标（线起点，fixedUpdate 每帧刷新为主角中心） */
  handX = 0;
  handY = 0;
  life = 7200;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    stringLen: number, channel: () => boolean, target: () => { x: number; y: number }, flail = false) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.stringLen = stringLen;
    this.channel = channel;
    this.target = target;
    this.flail = flail;
  }

  draw(r: Renderer, cam: Camera): void {
    // 线（原版 yoyo string / 连枷链：手部 → 球体）。世界坐标(实体循环在世界变换内)
    const c = r.canvas.getContext('2d');
    if (c) {
      c.strokeStyle = this.flail ? '#605848' : '#D0D0D8';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(this.handX, this.handY);
      c.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      c.stroke();
    }
    this.rot += 0.25;
    drawProj(r, cam, this, this.projId, this.rot, '#E04040');
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    this.hitCd.tick();
    if (!this.channel()) {
      // 松手/切走：回收到手（原版 channel 结束语义）
      const dx = p.cx - (this.x + this.w / 2);
      const dy = p.cy - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 16;
      this.vy = (dy / d) * 16;
      this.x += this.vx;
      this.y += this.vy;
      if (d < 16) this.dead = true;
      return;
    }
    // 追光标（原版 AI_099：朝光标位置加速，限线长内）
    const t = this.target();
    const dx = t.x - (this.x + this.w / 2);
    const dy = t.y - (this.y + this.h / 2);
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 0.55;
    this.vy += (dy / d) * 0.55 + (this.flail ? 0.12 : 0.02);
    const sp = Math.hypot(this.vx, this.vy);
    const cap = this.flail ? 11 : 13;
    if (sp > cap) { this.vx = (this.vx / sp) * cap; this.vy = (this.vy / sp) * cap; }
    this.x += this.vx;
    this.y += this.vy;
    // 线长约束：超出即向手方向拉回
    const ox = this.x + this.w / 2 - p.cx;
    const oy = this.y + this.h / 2 - p.cy;
    const od = Math.hypot(ox, oy);
    if (od > this.stringLen) {
      const k = this.stringLen / od;
      this.x = p.cx + ox * k - this.w / 2;
      this.y = p.cy + oy * k - this.h / 2;
    }
    // 弹墙（原版 yoyo tileCollide=false 穿墙，连枷也穿；不做碰撞）
    hitEnemies(this, game, this.hitCd, 15, Math.sign(this.vx));
  }
}

// ================= 手雷/炸弹/炸药（aiStyle 16，AI_016 引信爆炸） =================

export class GrenadeProj extends Entity {
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  projId: number;
  /** 引信（原版 timeLeft：手雷 180 / 炸弹 150 / 炸药 135） */
  fuse: number;
  onExplode: (x: number, y: number, damage: number) => void;
  private rot = 0;
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, fuse: number,
    projId: number, onExplode: (x: number, y: number, damage: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.fuse = fuse;
    this.projId = projId;
    this.onExplode = onExplode;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot, '#408040');
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    this.rot += Math.hypot(this.vx, this.vy) * 0.03;
    if (--this.fuse <= 0) {
      this.dead = true;
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage);
      return;
    }
    // AI_016：重力 + 弹跳（碰墙法向反弹，保部分动能）。
    // 碰撞探测用「底边中点」而非中心——中心探测会让 14px 弹体在地面沉降 ~4px 嵌入
    this.vy = Math.min(this.vy + 0.3, 16);
    let nx = this.x + this.vx;
    let ny = this.y + this.vy;
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, this.y + this.h - 1)) {
      this.vx *= -0.85; nx = this.x;
    }
    if (solidAt(nx + this.w / 2, ny + this.h - 1)) {
      if (this.vy > 1) { this.vy = -this.vy * 0.5; } else { this.vy = 0; }
      this.vx *= 0.92;
      ny = this.y;
    }
    this.x = nx;
    this.y = ny;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) this.dead = true;
  }
}

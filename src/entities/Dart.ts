// 飞镖投射物(原版 Projectile 10 Dart 语义:直线飞行、撞块消失、命中伤害)。
// 陷阱(137)发射;简化布线:同排/同列直线可见(≤60 格无实心阻挡)的拉杆/开关/压力板驱动。
import { Entity } from './Entity';
import { hitPlayer, playEnemyHitSound, projOverlap } from './projTargets';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import type { Enemy } from './Enemy'; // type-only（Enemy 运行时反向依赖本文件，避免环）

/** 电路陷阱投射物(Wiring.cs:1495-1743)。贴图 = 原版 projectile id;
 *  帧尺寸按实际解包 PNG 整图(素材为完整单帧:98 竖镖 10×28 / 184 竖火舌 10×18 /
 *  185 尖刺球 16×16 / 99 巨石 32×32)——勿按 SetDefaults 碰撞盒裁剪,否则只画残片 */
// tile 137 kind ↔ projectile 对应(Wiring.cs:1495-1743 + Item.cs placeStyle 核实):
//   0 飞镖机关(539)→98 | 1 超级飞镖机关(1146)→184(毒镖样式,有图) |
//   2 烈焰机关(1147)→187(FlamethrowerTrap,官方空桩贴图,视觉=火焰尘埃) |
//   3 尖球机关(1148)→185 | 4 长矛机关(1149)→186(有图)
// 187/654 的 PNG 是官方占位空桩(xnb 像素全零,经字节级同 stub 证实),isBlankTex 检出后
// 走色块回退 + 粒子拖尾——与原版"隐形弹体+尘埃视觉"一致(Projectile.cs:24222 188 同族 dust 驱动)
const TRAP_SHOT_STYLE: Record<string, {
  w: number; h: number; color: string; grav: number;
  proj?: string; fw?: number; fh?: number;
  spin?: boolean | 'roll' | 'bunny'; rotOff?: number;
  trail?: { colors: string[]; count: number; life: number; grav: number };
  /** 炮弹族：前 N tick 直线无重力（Projectile.cs:21546/26844 ai[0]>=18 才加重力） */
  gravDelay?: number;
  /** 水平阻尼（Projectile.cs:21549 velocity.X *= 0.99） */
  xDamp?: number;
  /** 垂直速度上限（Projectile.cs:26850-26853 兔兔炮 15.9） */
  vCap?: number;
  /** 友方弹幕（friendly=true，SetDefaults）：只伤敌怪，不伤玩家/城镇 NPC */
  friendly?: boolean;
  /** 落点爆炸半宽 px（Projectile.Kill 伤害盒：162=144×144→72 / 281=128×128→64） */
  blast?: number;
  /** 撞块破碎尘（Projectile.Kill 166：尘 76 十粒 + Item51） */
  shatterDust?: boolean;
  /** 发射音（Projectile.AI 首帧 SoundID.Item14：162=Projectile.cs:21542 / 281=26830） */
  launchSfx?: string;
  life?: number;
}> = {
  dart: { w: 8, h: 4, color: '#C8B89A', grav: 0, proj: 'vanilla/Projectile_98.png', fw: 10, fh: 28, rotOff: Math.PI / 2 },
  superdart: { w: 6, h: 6, color: '#8FBF6A', grav: 0, proj: 'vanilla/Projectile_184.png', fw: 10, fh: 18, rotOff: Math.PI / 2 },
  flame: { w: 10, h: 10, color: '#FF8030', grav: 0, proj: 'vanilla/Projectile_187.png', fw: 16, fh: 16,
    trail: { colors: ['#FF8030', '#FFC040', '#FF5010'], count: 2, life: 16, grav: -0.03 } },
  spear: { w: 6, h: 14, color: '#B8B8C0', grav: 0, proj: 'vanilla/Projectile_186.png', fw: 10, fh: 16, rotOff: Math.PI / 2 },
  spiky: { w: 12, h: 12, color: '#8A8F96', grav: 0.18, proj: 'vanilla/Projectile_185.png', fw: 16, fh: 16, spin: true },
  boulder: { w: 14, h: 14, color: '#9A8C72', grav: 0.22, proj: 'vanilla/Projectile_99.png', fw: 32, fh: 32, spin: true },
  geyser: { w: 10, h: 14, color: '#B8E8F0', grav: 0.02, proj: 'vanilla/Projectile_654.png', fw: 16, fh: 16,
    trail: { colors: ['#E8F4F8', '#C8E4EE'], count: 1, life: 26, grav: -0.015 } },
  // ---- 炮弹族（Wiring.cs case 209/212 → WorldGen.ShootFromCannon / 直接 NewProjectile）----
  // 162 炮弹（SetDefaults Projectile.cs:2239-2246）：16×16 aiStyle2 friendly penetrate4；
  // AI（:21540-21592）：18 tick 直线后 vy+=0.28/vx*=0.99；Kill（:72768-72831）：64×64→144×144
  // 两段 Damage() 纯伤害（不在 ExplodeTiles 表 = 不破坏地形）
  cannonball: { w: 16, h: 16, color: '#33333C', grav: 0.28, gravDelay: 18, xDamp: 0.99,
    proj: 'vanilla/Projectile_162.png', fw: 18, fh: 18, spin: 'roll', friendly: true, blast: 72,
    launchSfx: 'explosion', life: 3600 },
  // 281 爆炸兔兔（SetDefaults Projectile.cs:3408-3418）：28×28 aiStyle49 friendly timeLeft600；
  // AI（:26822-26913）同炮弹弧线（18 tick 后 vy+=0.28/vx*=0.99，vy 上限 15.9）；
  // Kill（:72704-72758）：128×128 Damage() 纯伤害
  bunny: { w: 28, h: 28, color: '#E8E2D8', grav: 0.28, gravDelay: 18, xDamp: 0.99, vCap: 15.9,
    proj: 'vanilla/Projectile_281.png', fw: 28, fh: 28, spin: 'bunny', friendly: true, blast: 64,
    launchSfx: 'explosion', life: 600 },
  // 166 雪球（SetDefaults Projectile.cs:2282-2289）：14×14 aiStyle2 friendly ranged coldDamage；
  // AI（:21862-21897）：20 tick 直线后 vy+=0.3/vx*=0.98；Kill（:71758-71767）：碎裂尘无 AoE
  snowball: { w: 14, h: 14, color: '#F2F8FF', grav: 0.3, gravDelay: 20, xDamp: 0.98,
    proj: 'vanilla/Projectile_166.png', fw: 14, fh: 14, spin: 'roll', friendly: true,
    shatterDust: true, life: 3600 },
  // 601 传送门弹（SetDefaults Projectile.cs:3408 族：10×10 friendly，无重力直线；
  // AI :51174-51242：门色拖尾尘 + alpha 递减；撞块 :16672-16686 → PortalHelper.TryPlacingPortal
  // + Kill）。贴图 20×38 竖条 = 2 帧 20×19（frameCounter 4tick 步进）
  portalbolt: { w: 10, h: 10, color: '#B069FF', grav: 0,
    proj: 'vanilla/Projectile_601.png', fw: 20, fh: 19, friendly: true, life: 3600 },
};

/** TrapShot 弹种（DeviceCtx.shootProjectile kind 共用） */
export type TrapShotKind = 'dart' | 'superdart' | 'flame' | 'spear' | 'spiky' | 'boulder' | 'geyser' | 'cannonball' | 'bunny' | 'snowball' | 'portalbolt';

export class TrapShot extends Entity {
  w = 8; h = 8;
  vx: number;
  vy: number;
  damage: number;
  kind: TrapShotKind;
  /** 传送门弹 601 的 ai[0]（WorldGen.cs:50622-50631：0 橙门 / 1 蓝门） */
  form = 0;
  /** 滚转角(尖刺球/巨石/炮弹族) */
  private rot = 0;
  /** 已飞行 tick（炮弹族重力延迟用，对应原版 ai[0]） */
  private age = 0;
  life = 600;
  dead = false;

  /** 全透明贴图缓存(xnb 解包异常的 187/654 等):检出一次后走色块回退,避免隐形弹幕 */
  private static blankTex = new Set<string>();
  private static okTex = new Set<string>();
  private static isBlank(r: Renderer, path: string): boolean {
    if (TrapShot.blankTex.has(path)) return true;
    if (TrapShot.okTex.has(path)) return false;
    const img = r.atlas?.vimages.get(path);
    let blank = true;
    if (img) {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { blank = false; break; } }
    }
    (blank ? TrapShot.blankTex : TrapShot.okTex).add(path);
    return blank;
  }

  constructor(x: number, y: number, vx: number, vy: number, damage: number, kind: TrapShotKind, form = 0) {
    super();
    const s = TRAP_SHOT_STYLE[kind];
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.form = form;
    this.w = s.w; this.h = s.h;
    if (kind === 'spiky') this.life = 1800; // 原版尖刺球 timeLeft 1800
    if (s.life !== undefined) this.life = s.life; // 炮弹族 timeLeft（SetDefaults 默认 3600 / 281=600）
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标)
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const st = TRAP_SHOT_STYLE[this.kind];
    const img = st.proj && r.atlas ? r.atlas.vimages.get(st.proj) : null;
    if (img && st.fw && st.fh && !TrapShot.isBlank(r, st.proj!)) {
      // 原版弹幕贴图(整帧):飞行类贴图默认朝上(镖尖/火苗向上),对齐速度方向需 +90°;
      // 尖刺球/巨石不随速度旋转,按位移滚转
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      if (st.spin) ctx.rotate(this.rot);
      else if (Math.abs(this.vx) + Math.abs(this.vy) > 0.01) ctx.rotate(Math.atan2(this.vy, this.vx) + (st.rotOff ?? 0));
      ctx.drawImage(img, 0, 0, st.fw, st.fh, -st.fw / 2, -st.fh / 2, st.fw, st.fh);
      ctx.restore();
      return;
    }
    ctx.fillStyle = st.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.x += this.vx; this.y += this.vy; return; }
    if (--this.life <= 0) {
      // 炮弹族 timeLeft 耗尽同样走 Kill 爆炸（Projectile.Kill 由 timeLeft 归零触发）
      if (TRAP_SHOT_STYLE[this.kind].blast) this.blastKill(game);
      else this.dead = true;
      return;
    }
    const st = TRAP_SHOT_STYLE[this.kind];
    this.age++;
    // 首帧发射音（Projectile.AI：162=Projectile.cs:21542-21546 / 281=26830-26833 SoundID.Item14）
    if (this.age === 1 && st.launchSfx) game.playSfx(st.launchSfx, 1, this.x + this.w / 2, this.y + this.h / 2);
    // 滚转：尖刺球/巨石近似 | 炮弹族按原版
    if (st.spin === true) this.rot += this.vx * 0.03;
    else if (st.spin === 'roll') {
      // aiStyle2（Projectile.cs:21528）：rotation += (|vx|+|vy|)*0.03*direction
      this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx < 0 ? -1 : 1);
    } else if (st.spin === 'bunny') {
      // aiStyle49（Projectile.cs:26841）：rotation += vx*0.05 + direction*0.05
      this.rot += this.vx * 0.05 + (this.vx < 0 ? -1 : 1) * 0.05;
    }
    if (st.gravDelay !== undefined) {
      // 炮弹族弧线：前 gravDelay tick 直线，之后 vy+=grav / vx*=xDamp
      // （162/281=Projectile.cs:21546-21550/26844-26849 的 ai[0]>=18；166=:21879-21884 的 >=20）
      if (this.age >= st.gravDelay) {
        this.vy += st.grav;
        this.vx *= st.xDamp ?? 1;
        if (st.vCap !== undefined && this.vy > st.vCap) this.vy = st.vCap; // 281 :26850-26853
      }
    } else {
      this.vy += st.grav;
    }
    this.x += this.vx;
    this.y += this.vy;
    // 粒子拖尾(原版火焰陷阱/热喷泉的视觉主体是沿途粒子;每 2 tick 一次防刷屏)
    if (st.trail && (this.life & 1) === 0) {
      game.spawnParticles(
        this.x + this.w / 2, this.y + this.h / 2,
        st.trail.colors[(this.life >> 1) % st.trail.colors.length],
        st.trail.count, 0.4, { life: st.trail.life, damp: 0.96, grav: st.trail.grav },
      );
    }
    // 传送门弹拖尾（Projectile.cs:51180-51192：尘 264 = 门色，无重力）
    if (this.kind === 'portalbolt' && (this.life & 1) === 0) {
      game.spawnParticles(
        this.x + this.w / 2, this.y + this.h / 2,
        this.form === 0 ? '#FFAA28' : '#3CE0FF', 1, 0.6, { life: 14, damp: 0.94, grav: 0 },
      );
    }
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) {
      // 传送门弹撞块（Projectile.cs:16672-16686）：落门后消亡（音效 Item115/114 按 form）
      if (this.kind === 'portalbolt') {
        game.placePortal?.(this.x, this.y, this.vx, this.vy, this.form);
        game.playSfx(this.form === 0 ? 'portalOrange' : 'portalBlue', 1, this.x, this.y);
        this.dead = true;
        return;
      }
      // 尖刺球/巨石:撞块反弹衰减
      if (this.kind === 'spiky' || this.kind === 'boulder') {
        if (Math.abs(this.vy) > 1) { this.vy *= -0.4; this.vx *= 0.7; this.y -= this.vy; }
        else { this.vy = 0; this.vx *= 0.94; }
      } else if (st.blast) {
        // 炮弹/兔兔炮撞块 → Kill 落点爆炸（Projectile.cs:72768-72831 / 72704-72758）
        this.blastKill(game);
        return;
      } else {
        // 雪球撞块碎裂（Projectile.cs:71758-71767）
        if (st.shatterDust) this.shatter(game);
        this.dead = true;
        return;
      }
    }
    // 友方弹幕（炮弹族 friendly=true）：不伤玩家，直接进敌怪判定。
    // 敌对陷阱：伤害走 damagePlayer(防御减算/受击音/iframes 去重);除巨石外命中即碎
    if (!st.friendly) {
      if (projOverlap(this.x, this.y, this.w, this.h, game.player) && !game.player.dead) {
        hitPlayer(this, game, this.damage);
        if (this.kind !== 'boulder') this.dead = true;
        if (this.dead) return;
      }
    }

    // ---- 命中怪物/小动物/城镇 NPC（原版陷阱弹幕对全实体敌对，Projectile.DamageNPC 语义） ----
    // 穿透规则（近似原版）：巨石碾压穿透；尖刺球/火焰穿透（靠受击者无敌帧节流连击）；
    // 镖/超级飞镖/热喷泉一碰即碎（与对玩家一致）；
    // 炮弹族：162 penetrate4 / 281 penetrate-1（SetDefaults）→ 穿透，撞块/超时才 Kill 爆炸；
    // 166 雪球 penetrate1 → 一碰即碎
    const pierce = this.kind === 'boulder' || this.kind === 'spiky' || this.kind === 'flame'
      || this.kind === 'cannonball' || this.kind === 'bunny';
    const overlaps = (e: { x: number; y: number; w: number; h: number }) =>
      this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y;
    // 怪物桶（Enemy.hurt 自带 8tick 无敌帧，穿透弹不会同帧连击）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || !overlaps(e)) continue;
      if (e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game)) {
        playEnemyHitSound(game, e);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#FFD060');
      }
      if (!pierce) {
        if (st.shatterDust) this.shatter(game);
        this.dead = true;
        return;
      }
    }
    // 友方弹幕（炮弹族 friendly=true）到此为止：不误伤小动物/城镇 NPC
    // （原版 friendly 弹对城镇 NPC 免疫；小动物不在敌怪判定内）
    if (st.friendly) return;
    // 小动物桶（Enemy 单参 shim / Critter.hurt(game) 皆可，被击即死）
    const buckets = (game as unknown as { entities?: { critters: Array<{ x: number; y: number; w: number; h: number; dead: boolean; hurt: (g: GameHooks) => boolean }>; npcs: Array<{ x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean }> } }).entities;
    if (buckets) {
      for (const c of buckets.critters) {
        if (c.dead || !overlaps(c)) continue;
        c.hurt(game);
        if (!pierce) { this.dead = true; return; }
      }
      // 城镇 NPC（TownNPC.hurt：防御减伤+无敌帧+死亡移除）
      for (const n of buckets.npcs) {
        if (n.dead || !overlaps(n)) continue;
        n.hurt(this.damage, Math.sign(this.vx) * 2, 0, game);
        if (!pierce) { this.dead = true; return; }
      }
    }
  }

  /** 雪球碎裂（Projectile.Kill type166，Projectile.cs:71758-71767：尘 76 十粒 + Item51） */
  private shatter(game: GameHooks): void {
    game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#F2F8FF', 10, 1, { life: 20, damp: 0.94, grav: -0.01 });
    game.playSfx('shatter', 1, this.x, this.y);
  }

  /** 落点爆炸（Projectile.Kill：type162=Projectile.cs:72768-72831 / type281=72704-72758）：
   *  纯范围伤害（162/281 均不在 ExplodeTiles 判定表 Projectile.cs:75260 → 不破坏地形）；
   *  原版两段伤害盒 162 为 64×64→144×144、281 为 128×128，此处按 blast 半宽合并一段；
   *  friendly 弹不伤玩家（hostile 伤害仅在 getGoodWorld 下对玩家生效，Main.getGoodWorld） */
  private blastKill(game: GameHooks): void {
    this.dead = true;
    const st = TRAP_SHOT_STYLE[this.kind];
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    game.playSfx('explosion', 1, cx, cy); // SoundID.Item14（Projectile.cs:72769/72706）
    game.spawnParticles(cx, cy, '#FFA050', 14, 3.5, { life: 18, damp: 0.93, grav: -0.02 });
    game.spawnParticles(cx, cy, '#FFF0C0', 8, 4.5, { life: 10, damp: 0.9, grav: -0.05 });
    const r = st.blast!;
    const box = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(box.x < e.x + e.w && box.x + box.w > e.x && box.y < e.y + e.h && box.y + box.h > e.y)) continue;
      if (e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game)) {
        playEnemyHitSound(game, e);
        game.addDamageNumber(cx, cy, this.damage, false, '#FFD060');
      }
    }
  }
}

export class Dart extends Entity {
  w = 8; h = 4;
  vx: number;
  vy: number;
  damage: number;
  life = 600; // tick 上限(原版 timeLeft 600)
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(同 TrapShot)
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#C8B89A';
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.x += this.vx; this.y += this.vy; return; }
    if (--this.life <= 0) { this.dead = true; return; }
    const world = game.world;
    this.x += this.vx;
    this.y += this.vy;
    // 撞实心块消失
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (world.store.isSolid(tx, ty)) { this.dead = true; return; }
    // 命中玩家(敌对陷阱):矩形相交即消耗弹体;伤害走 damagePlayer(防御减算/受击音/
    // iframes 去重——无敌帧内命中不扣血但弹体照常销毁,原版语义)
    if (projOverlap(this.x, this.y, this.w, this.h, game.player) && !game.player.dead) {
      hitPlayer(this, game, this.damage);
      this.dead = true;
    }
  }
}

/**
 * 629 TowerDamageBolt（Projectile.cs AI_122 :33747-33778 + Kill 段 :69784-69819）：
 * 本组教徒怪死亡时朝对应塔发射的红色追踪弹——ai[0]=目标塔 NPC，
 * 每 tick velocity = normalize(塔心-弹心)×5（:33775-33777）+ Dust.QuickDust 红尘尾，
 * 命中塔 Hitbox → Kill：盾 -1（Game 侧 onTowerBoltHit）且盾非 0 时塔 ai[3]=1（闪光 120t）。
 * 目标失联（塔死亡/消失）立即消亡（:33753-33761）。
 * 纯事件弹：无伤害（damage=0）、无碰撞、不参与联机弹幕同步（视觉弹） */
export class TowerBolt extends Entity {
  w = 10; h = 10;
  /** 目标塔解析（每 tick 重查——塔可能在本弹飞行中死亡） */
  private target: () => Enemy | null;
  /** 命中回调（盾结算/闪光/盾破音，Game 注入） */
  private onHit: (tower: Enemy) => void;
  private life = 3600;

  constructor(x: number, y: number, target: () => Enemy | null, onHit: (tower: Enemy) => void) {
    super();
    this.x = x; this.y = y;
    this.target = target;
    this.onHit = onHit;
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    // 世界坐标绘制：红色发光点（原版贴图 Projectile_629 未解包时以粒子红点代）
    const img = r.atlas ? r.atlas.vimages.get('vanilla/Projectile_629.png') : null;
    if (img) {
      ctx.drawImage(img, this.x + this.w / 2 - img.width / 2, this.y + this.h / 2 - img.height / 2);
      return;
    }
    ctx.fillStyle = '#FF4040';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#FFB0A0';
    ctx.fillRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const t = this.target();
    if (!t || t.dead) { this.dead = true; return; }   // AI_122 目标失联即 Kill（:33753-33761）
    if (--this.life <= 0) { this.dead = true; return; }
    const dx = t.cx - this.cx, dy = t.cy - this.cy;
    const len = Math.hypot(dx, dy) || 1;
    this.vx = (dx / len) * 5;                          // :33775 normalize(塔心-弹心)×5
    this.vy = (dy / len) * 5;
    this.x += this.vx;
    this.y += this.vy;
    // 红尘尾（:33778 Dust.QuickDust(Center, Red)——无重力短命尘）
    game.spawnParticles(this.cx, this.cy, Math.random() < 0.5 ? '#FF4040' : '#FF9060',
      1, 0.5, { life: 12, damp: 0.95, grav: 0 });
    // 命中塔 Hitbox（:33765-33770）→ Kill → 盾结算回调
    if (this.aabbOverlaps(t)) {
      this.dead = true;
      this.onHit(t);
    }
  }
}

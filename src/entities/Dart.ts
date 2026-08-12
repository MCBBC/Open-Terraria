// 飞镖投射物(原版 Projectile 10 Dart 语义:直线飞行、撞块消失、命中伤害)。
// 陷阱(137)发射;简化布线:同排/同列直线可见(≤60 格无实心阻挡)的拉杆/开关/压力板驱动。
import { Entity } from './Entity';
import { hitPlayer, playEnemyHitSound, projOverlap } from './projTargets';
import { TILE } from '../core/constants';
import { TILE_BY_KEY } from '../data/tiles';
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
  /** 烟花族：同 kind 多色变体贴图（form 0-3 → 167-170 / 415-418 / 419-422） */
  projs?: string[];
  /** 隐形弹（733 alpha=255 SetDefaults）：纯尘/gore 发射器，不画本体 */
  invisible?: boolean;
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
  // ---- 烟花三件套 + 马桶水花（Wiring.cs:1492-1553；WorldGen.LaunchRocket/LaunchRocketSmall）----
  // 167-170 烟花火箭（SetDefaults Projectile.cs:2291-2300）：14×14 aiStyle34 friendly ranged
  // timeLeft45，damage 150 / kb 7（WorldGen.cs:62197-62199）；AI（:25677-25739）无重力直线 + 尾烟；
  // Kill（:73435-73921）：Item14 + 按色爆尘 + 192×192 Damage()。贴图 14×28 = 2 帧 14×14（取帧 0）
  fireworkRocket: { w: 14, h: 14, color: '#FF8066', grav: 0, friendly: true, blast: 96, life: 45,
    projs: ['vanilla/Projectile_167.png', 'vanilla/Projectile_168.png',
      'vanilla/Projectile_169.png', 'vanilla/Projectile_170.png'],
    fw: 14, fh: 14, rotOff: Math.PI / 2 },
  // 415-418 烟花盒火箭（SetDefaults Projectile.cs:4669-4676）：14×14 aiStyle34 friendly timeLeft45
  // damage 0（WorldGen.cs:62213-62215）——纯视觉弹，Kill 同样 192×192 Damage() 但伤害为 0
  fireworksBoxRocket: { w: 14, h: 14, color: '#66FF99', grav: 0, friendly: true, blast: 96, life: 45,
    projs: ['vanilla/Projectile_415.png', 'vanilla/Projectile_416.png',
      'vanilla/Projectile_417.png', 'vanilla/Projectile_418.png'],
    fw: 14, fh: 14, rotOff: Math.PI / 2 },
  // 419-422 烟花喷泉（SetDefaults Projectile.cs:4679-4686）：4×4 aiStyle73 friendly timeLeft3600（默认值），
  // 锚点 tile 338 消失即 Kill（AI :29369-29377）；每 tick 2 粒火花 × 60 秒
  fireworkFountain: { w: 4, h: 4, color: '#FFE85A', grav: 0, friendly: true, life: 3600,
    projs: ['vanilla/Projectile_419.png', 'vanilla/Projectile_420.png',
      'vanilla/Projectile_421.png', 'vanilla/Projectile_422.png'],
    fw: 8, fh: 8 },
  // 733 马桶水花（SetDefaults Projectile.cs:7434-7441）：2×2 aiStyle153 tileCollide=false alpha=255
  // ——全隐形纯发射器；AI_153_ToiletPop（:49278-49314）ai[0]==0 → 6 尘 + 1 gore，
  // ai[0] 1..10 → 2 尘 + 1/5 gore，ai[0]>10 → Kill
  toiletPop: { w: 2, h: 2, color: '#8AC7F0', grav: 0, life: 3600, invisible: true },
};

/** TrapShot 弹种（DeviceCtx.shootProjectile kind 共用） */
export type TrapShotKind = 'dart' | 'superdart' | 'flame' | 'spear' | 'spiky' | 'boulder' | 'geyser' | 'cannonball' | 'bunny' | 'snowball' | 'portalbolt'
  | 'fireworkRocket' | 'fireworksBoxRocket' | 'fireworkFountain' | 'toiletPop';

/** ---- 烟花尘色表（Projectile.cs Kill/AI 引用的 Dust id → 近似色）----
 *  130-134 爆花尘：发光色照抄 Dust.cs:2204-2226 Lighting.AddLight 的 RGB（134 未入光照表，
 *  金色弹 170 与 133 交替使用，取亮金近似）；219-223 喷泉火花条（DustID.cs:167 仅 219 命名
 *  Fireworks；419 用 222 黄 / 420 用 219 红 / 421 用 221 蓝 / 422 用 219+rand(5)，据此定色）；
 *  216 马桶水花（AI_153 :49299）取浅水蓝 */
export const FW_DUST: Record<string, string> = {
  d130_red: '#FF8066', d131_green: '#66FF99', d132_blue: '#4D80FF',
  d133_yellow: '#E6E64D', d134_gold: '#FFF2A8',
  d219_red: '#FF5A4A', d220_green: '#5AFF8A', d221_blue: '#5A8AFF',
  d222_yellow: '#FFE85A', d223_pink: '#FF66C8',
  d216_water: '#8AC7F0',
};
/** 喷泉彩虹弹 422 的尘池（Projectile.cs:29499：219 + rand(5)） */
export const FW_RAINBOW = [FW_DUST.d219_red, FW_DUST.d220_green, FW_DUST.d221_blue,
  FW_DUST.d222_yellow, FW_DUST.d223_pink];

export class TrapShot extends Entity {
  w = 8; h = 8;
  vx: number;
  vy: number;
  damage: number;
  kind: TrapShotKind;
  /** 传送门弹 601 的 ai[0]（WorldGen.cs:50622-50631：0 橙门 / 1 蓝门）；
   *  烟花族 = 色变体（167-170 / 415-418 / 419-422 减基址） */
  form = 0;
  /** 喷泉弹锚点 tile（Projectile.ai[0]/ai[1]，Wiring.cs:1548；锚点 338 消失即 Kill） */
  ax = -1;
  ay = -1;
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

  constructor(x: number, y: number, vx: number, vy: number, damage: number, kind: TrapShotKind,
    form = 0, anchor?: [number, number]) {
    super();
    const s = TRAP_SHOT_STYLE[kind];
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.form = form;
    if (anchor) { this.ax = anchor[0]; this.ay = anchor[1]; }
    this.w = s.w; this.h = s.h;
    if (kind === 'spiky') this.life = 1800; // 原版尖刺球 timeLeft 1800
    if (s.life !== undefined) this.life = s.life; // 炮弹族 timeLeft（SetDefaults 默认 3600 / 281=600）
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标)
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const st = TRAP_SHOT_STYLE[this.kind];
    if (st.invisible) return; // 733 alpha=255：隐形纯发射器（SetDefaults :7440）
    // 烟花族按 form 选色变体贴图；单贴图 kind 走 proj
    const tex = st.projs?.[this.form] ?? st.proj;
    const img = tex && r.atlas ? r.atlas.vimages.get(tex) : null;
    if (img && st.fw && st.fh && !TrapShot.isBlank(r, tex!)) {
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
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 烟花三件套 + 马桶水花：独立 AI 族（aiStyle 34/73/153），不走陷阱弹通用位移/命中链
    if (this.kind === 'fireworkRocket' || this.kind === 'fireworksBoxRocket'
      || this.kind === 'fireworkFountain' || this.kind === 'toiletPop') {
      this.fireworkUpdate(game);
      return;
    }
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
    this.blastDamage(game, cx, cy, st.blast!);
  }

  /** 伤害盒结算（炮弹族与烟花火箭共用的 Damage() 语义：friendly 只伤敌怪） */
  private blastDamage(game: GameHooks, cx: number, cy: number, r: number): void {
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

  // ============ 烟花三件套 + 马桶水花（Projectile 167-170 / 415-422 / 733）============

  /** 烟花族 AI 主循环。
   *  火箭（aiStyle34，Projectile.cs:25677-25739）：无重力直线上升 + 尾烟尘 6，
   *  timeLeft 45 到点或撞块 → Kill 爆花；
   *  喷泉（aiStyle73，:29369-29510）：静态发射器，锚点 338 消失即 Kill，每 tick 2 粒火花；
   *  马桶（aiStyle153，:49278-49314）：11 帧水花后自杀 */
  private fireworkUpdate(game: GameHooks): void {
    const isRocket = this.kind === 'fireworkRocket' || this.kind === 'fireworksBoxRocket';
    if (--this.life <= 0) {
      if (isRocket) this.explodeFirework(game); // timeLeft 45 到点 → Projectile.Kill（:73435）
      else this.dead = true;                    // 喷泉 3600 自然耗尽（马桶由下方 age 分支自杀）
      return;
    }
    this.age++;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    if (isRocket) {
      this.x += this.vx;
      this.y += this.vy;
      // 尾烟（AI_034 :25724-25739）：167-170 每帧 1 粒尘 6；415-418 自 ai[0]>4 起（:25722-25733）
      //（引擎粒子 2 tick 一发节流，视觉近似）
      const trailOk = this.kind === 'fireworkRocket' || this.age > 4;
      if (trailOk && (this.life & 1) === 0) {
        game.spawnParticles(this.x + this.w / 2, this.y + this.h, '#A8A8A0', 1, 0.6,
          { life: 18, damp: 0.95, grav: -0.02 });
      }
      // tileCollide=true → 撞实心块同样 Kill 爆花
      const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
      if (game.world.store.isSolid(tx, ty)) this.explodeFirework(game);
      return;
    }
    if (this.kind === 'fireworkFountain') {
      // 锚点 tile 必须仍是 338（AI_073 :29371-29377，否则 Kill）
      const T338 = TILE_BY_KEY['v_338_fireworkfountain'] ?? -1;
      const st = game.world.store;
      if (!st.inBounds(this.ax, this.ay) || st.type[st.idx(this.ax, this.ay)] !== T338) {
        this.dead = true;
        return;
      }
      // num625 = 2 * min(1, timeLeft/60)（:29378-29383）——最后 60t 出速衰减
      const sp = 2 * Math.min(1, this.life / 60);
      const burst = game.spawnBurst;
      if (!burst) return;
      if (this.form === 0) {
        // 419 黄（:29385-29406）：尘 222，±PI/4 散布，vy×2
        burst(cx, cy, FW_DUST.d222_yellow, 2, sp, -Math.PI / 2, Math.PI / 4, { yMul: 2, life: 30, damp: 0.96 });
      } else if (this.form === 1) {
        // 420 红（:29408-29431）：尘 219（每粒 1/5 → 222，此处逐帧取色近似），vx×0.5 vy×2
        burst(cx, cy, Math.random() < 0.2 ? FW_DUST.d222_yellow : FW_DUST.d219_red, 2, sp,
          -Math.PI / 2, Math.PI / 4, { xMul: 0.5, yMul: 2, life: 30, damp: 0.96 });
      } else if (this.form === 2) {
        // 421 蓝（:29433-29452）：尘 221，±PI/8 窄散布，vy×2.5
        burst(cx, cy, FW_DUST.d221_blue, 2, sp, -Math.PI / 2, Math.PI / 8, { yMul: 2.5, life: 30, damp: 0.96 });
        // timeLeft%10==0 再补 9 粒尘 222 扇面（:29455-29475：x=(i-4)/5 均布）
        if (this.life % 10 === 0) {
          burst(cx, cy, FW_DUST.d222_yellow, 9, sp * (0.85 + Math.random() * 0.2),
            -Math.PI / 2, Math.PI / 5, { yMul: 2, life: 30, damp: 0.96 });
        }
      } else {
        // 422 彩虹（:29494-29510）：尘 219 + rand(5)，±PI/4，vy×2
        burst(cx, cy, FW_RAINBOW[Math.floor(Math.random() * FW_RAINBOW.length)]!, 2, sp,
          -Math.PI / 2, Math.PI / 4, { yMul: 2, life: 30, damp: 0.96 });
      }
      return;
    }
    // ---- 马桶水花 733（AI_153_ToiletPop :49278-29314）----
    // age 1 ↔ 原版 ai[0]==0（首帧 6 尘 216 + 1 gore）；age 2..11 ↔ ai[0] 1..10（2 尘 + 1/5 gore）；
    // age 12 ↔ ai[0]=11 > 10 → Kill。尘向上（speedY -2，velX×0.5，:49299-49305）；
    // gore 580-582（:49308-49312）以 2 粒亮水珠近似
    if (this.age > 11) {
      this.dead = true;
      return;
    }
    const burst = game.spawnBurst;
    if (!burst) return;
    if (this.age === 1) {
      burst(cx, cy, FW_DUST.d216_water, 6, 2, -Math.PI / 2, 0.9, { xMul: 0.5, life: 26, damp: 0.96 });
      burst(cx, cy, '#D8ECFA', 2, 2.5, -Math.PI / 2, 0.7, { life: 32, damp: 0.97 });
    } else {
      burst(cx, cy, FW_DUST.d216_water, 2, 2, -Math.PI / 2, 0.9, { xMul: 0.5, life: 26, damp: 0.96 });
      if (Math.random() < 0.2) {
        burst(cx, cy, '#D8ECFA', 2, 2.5, -Math.PI / 2, 0.7, { life: 32, damp: 0.97 });
      }
    }
  }

  /** 烟花爆花（Projectile.Kill aiStyle==34，Projectile.cs:73435-73921）：
   *  SoundID.Item14 + 按弹种彩色尘（数量/速度档 1:1）+ 192×192 伤害盒 Damage()（:73912-73920）。
   *  尘速档 = 原版各循环的径向速度（尘自带 0.5 系数初速并入档位）；noGravity 尘按
   *  Dust.cs:2227-2230 velocity*=0.93 / fadeIn 缓胀 → damp 0.93 + 45t 存活近似 */
  private explodeFirework(game: GameHooks): void {
    this.dead = true;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    game.playSfx('explosion', 1, cx, cy); // SoundID.Item14（:73437）
    const burst = game.spawnBurst
      ?? ((x: number, y: number, c: string, n: number, s: number) => game.spawnParticles(x, y, c, n, s));
    /** 全向径向爆花（dir=0/spread=PI 覆盖全圆；原版尘方向为随机角，整体旋转不变） */
    const radial = (color: string, count: number, speed: number,
      opts?: { xMul?: number; yMul?: number }) =>
      burst(cx, cy, color, count, speed, 0, Math.PI, { life: 45, damp: 0.93, ...opts });
    const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo));
    if (this.kind === 'fireworkRocket') {
      // 167-170（:73439-73661）
      if (this.form === 0) {
        // 红 167（:73439-73473）：400 尘 130，四档速度 4/8/12/16 各 100
        radial(FW_DUST.d130_red, 100, 4); radial(FW_DUST.d130_red, 100, 8);
        radial(FW_DUST.d130_red, 100, 12); radial(FW_DUST.d130_red, 100, 16);
      } else if (this.form === 1) {
        // 绿 168（:73475-73518）：400 尘 131；0-100 档 0→2 渐增（取均值 1）、
        // 101-250 档 10（150 粒）、251-399 档 13 且 x×1.25/y×0.75（149 粒）
        radial(FW_DUST.d131_green, 101, 1); radial(FW_DUST.d131_green, 150, 10);
        radial(FW_DUST.d131_green, 149, 13, { xMul: 1.25, yMul: 0.75 });
      } else if (this.form === 2) {
        // 蓝 169（:73520-73612）：双圈 Lerp 曲线（各 2×num843×20 尘 133）+ 中心 100 尘 132；
        // num843 = rand(5,9) 臂、num844 = rand(12,17) 外速、value10 = rand(3,7) 内速
        const arms = rand(5, 9), outer = rand(12, 17), inner = rand(3, 7);
        radial(FW_DUST.d133_yellow, 80 * arms, outer);
        radial(FW_DUST.d133_yellow, 80 * arms, outer / 2);
        radial(FW_DUST.d132_blue, 100, outer);
      } else {
        // 黄 170（:73614-73661）：400 尘 133/134 交替，四档 16/11/8/5 各 100，轴压 0.7 交替
        radial(FW_DUST.d133_yellow, 100, 16, { yMul: 0.7 }); radial(FW_DUST.d134_gold, 100, 11, { xMul: 0.7 });
        radial(FW_DUST.d133_yellow, 100, 8, { yMul: 0.7 }); radial(FW_DUST.d134_gold, 100, 5, { xMul: 0.7 });
      }
    } else {
      // 415-418 烟花盒（:73663-73898）
      if (this.form === 0) {
        // 红 415（:73663-73710）：30×num868 臂尘 130（速度 num870→num869 渐增，取均值）+
        // 100 尘 130 补充；num868 = rand(5,9)、num869 = rand(10,15)×0.66、num870 = rand(4,7)/2
        const arms = rand(5, 9), sp = rand(10, 15) * 0.66, sp0 = rand(4, 7) / 2;
        radial(FW_DUST.d130_red, 30 * arms, (sp0 + sp) / 2);
        radial(FW_DUST.d130_red, 100, sp);
      } else if (this.form === 1) {
        // 绿 416（:73712-73760）：num883=20 步 × num882 = rand(3,6)×2 臂螺旋尘 131，
        // 速度 1→8 渐增（取均值 4.5），奇偶臂 scale 0.9
        radial(FW_DUST.d131_green, 20 * rand(3, 6) * 2, 4.5);
      } else if (this.form === 2) {
        // 蓝 417（:73762-73801）：150 尘三段（各 50）132/133/132，
        // 外圈 num894 = max(rand(4,7),rand(4,7))（x×0.5 旋转）、中段 num893（y×0.5 旋转）、内圈 num892
        const sp2 = 4 + Math.random() * 3, sp1 = 4 + Math.random() * 3;
        radial(FW_DUST.d132_blue, 50, Math.max(sp1, sp2), { xMul: 0.5 });
        radial(FW_DUST.d133_yellow, 50, Math.min(sp1, sp2), { yMul: 0.5 });
        radial(FW_DUST.d132_blue, 50, Math.min(sp1, sp2));
      } else {
        // 黄 418（:73803-73898）：2×num899×15 臂尘 134（SmoothStep num900→num901）+
        // 120 补充尘（前 80 尘 133 慢速、后 40 尘 131 外速）
        const arms = rand(5, 12), sp = rand(9, 14) * 0.66, sp0 = rand(2, 4) * 0.66;
        radial(FW_DUST.d134_gold, 2 * arms * 15, (sp + sp0) / 2);
        radial(FW_DUST.d133_yellow, 80, sp0);
        radial(FW_DUST.d131_green, 40, sp);
      }
    }
    // 192×192 伤害盒 Damage()（:73912-73920）：烟花火箭 damage 150 结算，
    // 烟花盒 damage 0 = 纯视觉（hurt(0) 无意义，直接跳过）
    if (this.damage > 0) this.blastDamage(game, cx, cy, 96);
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
    if (this.netPuppet) { this.netPuppetStep(); return; }
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

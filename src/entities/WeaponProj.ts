// 数据驱动近战/爆炸武器投射物（1456 aiStyle 家族行为，Game.useCombatWeapon 派发）：
//   Boomerang  aiStyle 3   —— 飞出减速后返回主角（AI_003）
//   SpearProj  aiStyle 19/161 —— 随主角前刺伸缩（AI_019 的 owner 相对位移简化）
//   YoyoProj   aiStyle 99  —— 按住鼠标滞留追光标，松手收回（AI_099 channel 语义）
//   FlailProj  aiStyle 15  —— AI_015_Flails 全状态机（旋转/掷出/回拉/坠落/悬荡/回收）
//   GrenadeProj aiStyle 16 —— 弹跳 + 引信爆炸（手雷 180/炸弹 150/炸药 135 tick）
// 贴图统一 Projectile_N.png 懒加载（Arrow.projSprite 共享缓存）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { hitCritters, hitTownNpcs, playEnemyHitSound, tryReflectProjectile } from './projTargets';
import { applyProjStatus, applyMeleeImbue, applyFrostBurn } from './projStatus';
import { projectileData } from '../data/vanillaProjectiles';
import { canHit } from '../physics/LineOfSight';

/** 共用绘制：投射物贴图按角度旋转（贴图纵向，rotation = ang+π/2 与 AI_001 一致）。
 *  世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标) */
function drawProj(r: Renderer, _cam: Camera, e: { x: number; y: number; w: number }, projId: number, ang: number, fallbackColor: string, alpha = 1, drawSize = 0): void {
  // drawSize=绘制尺寸(0=取碰撞盒 w；-1=贴图原生尺寸——原版投射物绘制语义,
  // 爆炸族雷管 10×32 竖条等非方贴图必须走原生尺寸否则被拉方)
  const img0 = projSprite(projId);
  const natural = drawSize < 0 && img0 && img0.complete && img0.naturalWidth > 0;
  const dw = natural ? img0!.naturalWidth : drawSize > 0 ? drawSize : e.w;
  const ctx = r.canvas.getContext('2d');
  if (!ctx) return;
  const img = img0;
  ctx.save();
  ctx.globalAlpha = alpha; // AI_161 细剑淡入淡出(:44993-44994)
  ctx.translate(e.x + e.w / 2, e.y + e.w / 2);
  ctx.rotate(ang);
  ctx.imageSmoothingEnabled = false;
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -dw / 2, -dw / 2, dw, dw * (img.naturalHeight / img.naturalWidth));
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(-dw / 2, -dw / 2, dw, dw);
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

type ReflectableWeaponProj = {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  damage: number; knockback: number;
  projId?: number;
  hostile?: boolean;
  reflected?: boolean;
  /** 暴击率（GetWeaponCrit：4 基础+武器 item.crit+装备/buff,Game 侧算好传入） */
  critChance?: number;
  /** 近战系投射物（吃武器浸剂 meleeEnchant,StatusNPC:10559 门 (melee||whip)） */
  meleeProj?: boolean;
};

function hitEnemies(
  self: { x: number; y: number; w: number; h: number; vx: number; damage: number; knockback: number },
  game: GameHooks,
  hitCd: HitCooldown,
  cooldown: number,
  dirX: number,
  pen = 0,
): void {
  // 小动物:一击致死(原版小动物是 NPC;近战挥砍同语义)。回旋镖/悠悠球等穿透型
  // 命中小动物不消耗穿透语义——hurt 自带 iframes 防同帧连击
  hitCritters(self, game);
  // 城镇 NPC 受击(原版 Projectile.Damage 对 friendly NPC 同样生效,杀裁缝师即此链);
  // 穿透型不消耗穿透语义(NPC.hurt 8t iframes 自去重)
  hitTownNpcs(self, game, self.damage, Math.sign(self.vx) * 2);
  const me = self as ReflectableWeaponProj;
  // 反射后的弹体 friendly 已翻——不再入敌怪判定（原版 Damage NPC 需 friendly 门禁）
  if (me.reflected) return;
  for (const ent of game.enemies()) {
    const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
    if (e.dead) continue;
    if (!(self.x < e.x + e.w && self.x + self.w > e.x && self.y < e.y + e.h && self.y + self.h > e.y)) continue;
    // 反射源命中（Projectile.cs:12050-12060）：按 projId 查 CanBeReflected 白名单——
    // 回旋镖 aiStyle3/长矛 19/161/悠悠球 99/15 均不在表内不反射，白名单内新弹型自动生效
    if (me.projId !== undefined && tryReflectProjectile(me, me.projId, e, game)) return;
    if (!hitCd.ready(e.id, cooldown)) continue;
    // 暴击 = GetWeaponCrit 语义:4 基础 + 武器 item.crit + 装备/buff（Game 侧合并传入；
    // 此前全族写死 4%——Sunfury 原版 crit=7 应为 11%）
    const crit = Math.random() < (me.critChance ?? 0.04);
    const dmg = crit ? self.damage * 2 : self.damage;
    const kdir = Math.sign((e.x + e.w / 2) - (self.x + self.w / 2)) || dirX;
    playEnemyHitSound(game, e);
    e.hurt(dmg, kdir * self.knockback, 0, game, pen, crit); // 裸 kb（0.65 自造已摘）——hurt 内原版管线
    // 命中 debuff(StatusNPC:10555——阳炎之怒 50% OnFire 300t / 粉恒星之锤 OnFire 等,按型号查表)
    applyProjStatus(me.projId, e as unknown as Record<string, number>);
    // 武器浸剂（StatusNPC:10559 门 (melee||whip)&&meleeEnchant>0——近战四族命中施加,
    // 时长 Player.cs:6141-6171;挥砍侧同表在 Game 挥击结算）
    if (me.meleeProj) {
      const pl = game.player as unknown as { buffs: { has: (b: never) => boolean }; equipStats: { frostBurn: boolean } };
      applyMeleeImbue(pl.buffs, e as unknown as Record<string, number>,
        () => game.spawnParticles(e.x + e.w / 2, e.y + e.h / 2,
          ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 }));
      // 冰霜盔甲引擎(melee 门,:93712)
      applyFrostBurn(pl.equipStats.frostBurn, e as unknown as Record<string, number>);
    }
    game.addDamageNumber(self.x + self.w / 2, self.y, Math.round(dmg), crit, crit ? '#FFD040' : '#FF7060');
    // 配重球（counterWeight 装备时悠悠球命中落配重：YoyoBag 语义近似——
    // spawnWeight 回调由 Game 注入（无实体循环依赖）；伤害 = 武器 100%（原版））
    const wSpawn = (self as { spawnWeight?: (x: number, y: number, dmg: number) => void }).spawnWeight;
    if (wSpawn) wSpawn(e.x + e.w / 2, e.y, Math.round(self.damage));
  }
}

// ================= 回旋镖（aiStyle 3，AI_003_Boomerang，Projectile.cs:36623） =================

/** 返回段型号参数（AI_003 返回分支 :532-582）：num28=目标速率 / num29=加速度，
 *  缺省 9/0.4。特例族（Phaseblade 40/3、866/182/106 16/1.2 等）按型号覆写 */
const BOOMERANG_RETURN: Record<number, [number, number]> = {
  19: [20, 1.5], 33: [18, 1.2], 106: [16, 1.2], 182: [16, 1.2],
  272: [20, 1.5], 866: [16, 1.2], 333: [12, 0.6], 301: [15, 3],
  320: [15, 3], 383: [16, 4], 1000: [9.5, 0.4],
};

/** Phaseblade 族（ProjectileID.Sets.IsAPhaseblade :27——1059-1072/1074-1076/1101/1102）：
 *  出程 30t 后垂落,回收 40/3 高速穿墙归位（:190-258/:527-531） */
const PHASEBLADE_PROJ = new Set([1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067,
  1068, 1069, 1070, 1071, 1072, 1074, 1075, 1076, 1101, 1102]);

/** 回旋镖命中盒型号表（SetDefaults aiStyle=3 全 20 型提取：type→size） */
const BOOMERANG_SIZE: Record<number, number> = {
  6: 22, 19: 22, 33: 38, 52: 22, 106: 32, 113: 22, 182: 30, 272: 32,
  301: 38, 320: 34, 333: 38, 383: 34, 866: 30, 867: 22, 902: 20, 1000: 22,
  1052: 22, 1101: 38, 1102: 46, 1074: 46,
};

export class Boomerang extends Entity {
  w = 22; h = 22; // 默认（型号表覆盖）
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（301 Bouncing Shield 按 20t/100t 双门用；其余族不用） */
  channel: (() => boolean) | null = null;
  /** rotation（出程=飞行向+π/4 定角,返回段自旋 0.4/t——AI_003 尾段 :675-706） */
  private rot = 0;
  /** ai[0]：0 飞出 / 1 返回 */
  private returning = false;
  /** ai[1]：飞出段计数（普通族 ≥30t 自动回收,:434-438） */
  private outT = 0;
  /** localAI[0]（866 飞刀目标搜索计时,:291-300） */
  private localT = 0;
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
    const sz = BOOMERANG_SIZE[projId]; // ⑬-2 命中盒按型号（曾统一 22×22）
    if (sz) { this.w = sz; this.h = sz; }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot, '#C0A060');
  }

  /** 轴向目标速度逼近（AI_003 追踪/返回共用式 :331-360/:586-660）：
   *  每轴朝目标速度步进 acc,异号再加倍 */
  private steerTo(tvx: number, tvy: number, acc: number): void {
    if (this.vx < tvx) { this.vx += acc; if (this.vx < 0 && tvx > 0) this.vx += acc; }
    else if (this.vx > tvx) { this.vx -= acc; if (this.vx > 0 && tvx < 0) this.vx -= acc; }
    if (this.vy < tvy) { this.vy += acc; if (this.vy < 0 && tvy > 0) this.vy += acc; }
    else if (this.vy > tvy) { this.vy -= acc; if (this.vy > 0 && tvy < 0) this.vy -= acc; }
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    this.hitCd.tick();
    const solidAt = (x: number, y: number): boolean => {
      const tx = Math.floor((x + this.w / 2) / TILE), ty = Math.floor((y + this.h / 2) / TILE);
      return game.world.store.inBounds(tx, ty) && game.world.store.isSolid(tx, ty);
    };
    const outOfWorld = (): boolean => this.x < TILE * 10 || this.y < TILE * 10
      || this.x > (game.world.store.w - 10) * TILE || this.y > (game.world.store.h - 10) * TILE;
    const startReturn = (zeroV: boolean): void => {
      this.returning = true;
      this.outT = 0;
      this.hitCd.clear(); // 返程可再次命中（原版去而复返二次伤害语义）
      if (zeroV) { this.vx = 0; this.vy = 0; } // 301 回收时速度归零（:443-447）
      else if (solidAt(this.x, this.y)) { this.x -= this.vx; this.y -= this.vy; } // 弹出防嵌墙
    };
    if (!this.returning) {
      this.outT++;
      const isPhase = PHASEBLADE_PROJ.has(this.projId);
      // ---- 特例族出程行为 ----
      if (this.projId === 182 || this.projId === 866) {
        // 圣骑士锤 182 / 飞刀 866：追踪最近敌（:264-330/:291-360）——800px 内最近敌,
        // 目标速度=(敌-球)norm×12,轴步进 0.25;无目标且 ≥30t(866:30t) → 回收。
        // 视线门 Collision.CanHit（:285-288/:305-308）——canHit 1:1
        this.localT++;
        let tvx = this.vx, tvy = this.vy, found = false;
        if (this.outT > 10 && this.outT < 360) {
          const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
          let best = 800, bx = 0, by = 0;
          for (const ent of game.enemies()) {
            const e = ent as { x: number; y: number; w: number; h: number; dead: boolean };
            if (e.dead) continue;
            if (!canHit(game.world.store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
            const d = Math.hypot(e.x + e.w / 2 - cx0, e.y + e.h / 2 - cy0);
            if (d < best) { best = d; bx = e.x + e.w / 2; by = e.y + e.h / 2; found = true; }
          }
          if (found) {
            const dd = Math.hypot(bx - cx0, by - cy0) || 1;
            tvx = ((bx - cx0) / dd) * 12; tvy = ((by - cy0) / dd) * 12;
          }
        }
        if (!found && this.outT >= 30) { this.x += this.vx; this.y += this.vy; startReturn(false); }
        else { this.steerTo(tvx, tvy, 0.25); this.x += this.vx; this.y += this.vy; }
      } else if (this.projId === 301) {
        // Bouncing Shield 1513：按住 ≥20t / 松手 ≥100t 回收（:437-452）
        const held = this.channel ? this.channel() : false;
        if ((held && this.outT >= 20) || (!held && this.outT >= 100)) {
          this.x += this.vx; this.y += this.vy; startReturn(true);
        } else { this.x += this.vx; this.y += this.vy; }
      } else if (this.projId === 383) {
        // 附魔飞刀 2424：10t 后下垂 vy+=0.5(上升再+0.35)/vx×0.95（:263-277）;>800px 回收
        if (this.outT >= 10) {
          this.vy += 0.5;
          if (this.vy < 0) this.vy += 0.35;
          this.vx *= 0.95;
          this.vy = Math.min(this.vy, 16);
        }
        this.x += this.vx; this.y += this.vy;
        if (Math.hypot(this.x + this.w / 2 - p.cx, this.y + this.h / 2 - p.cy) > 800) startReturn(false);
      } else if (this.projId === 320) {
        // 冰回旋镖 1825：10t 后下垂 vy+=0.5/vx×0.95（:263-268）
        if (this.outT >= 10) { this.vy += 0.5; this.vx *= 0.95; this.vy = Math.min(this.vy, 16); }
        this.x += this.vx; this.y += this.vy;
      } else if (isPhase) {
        // 光刃族：前 30t 自旋 0.4×direction,之后垂落 vy+=1/vx×0.96（:190-232）
        if (this.outT >= 30) {
          this.vy += 1;
          this.vx *= 0.96;
          this.vy = Math.min(this.vy, 16);
          this.rot += 0.4 * Math.sign(this.vx || 1);
        } else {
          this.rot += 0.4 * Math.sign(this.vx || 1);
        }
        this.x += this.vx; this.y += this.vy;
      } else {
        // 普通族：无摩擦直线;106 光碟 45t 回收（:180-186）,其余 30t（:434-438）
        this.x += this.vx;
        this.y += this.vy;
        // 出程旋转 = 飞行向 + π/4（:675-677,不自旋）;106 光碟 0.3×dir（:670-672）
        this.rot = this.projId === 106
          ? this.rot + 0.3 * Math.sign(this.vx || 1)
          : Math.atan2(this.vy, this.vx) + Math.PI / 4;
        if (Math.random() < 0.5) {
          game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#D0E8FF', 1, 0.4, { life: 18, grav: 0, size: 2 });
        }
        if (this.outT >= (this.projId === 106 ? 45 : 30)) startReturn(false);
      }
      // 通用撞墙/出界回收门（:123-133,全部族）
      if (!this.returning && (solidAt(this.x, this.y) || outOfWorld())) startReturn(false);
    } else {
      // 返回段：tileCollide=false 穿墙（:496）;目标速度制——朝玩家 num28 px/t,
      // 每轴逼近 num29/t,目标异号再 ×2（:586-660）;>3000px Kill（:606-610;
      // 301 是 6000px,:603-605）
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      let dx = p.cx - cx, dy = p.cy - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > (this.projId === 301 ? 6000 : 3000)) { this.dead = true; return; }
      const [spd, acc] = BOOMERANG_RETURN[this.projId] ?? (PHASEBLADE_PROJ.has(this.projId) ? [40, 3] : [9, 0.4]);
      dx = (dx / d) * spd; dy = (dy / d) * spd;
      this.steerTo(dx, dy, acc);
      this.x += this.vx;
      this.y += this.vy;
      // 返回段自旋 0.4/t × direction（:704-706）
      this.rot += 0.4 * Math.sign(this.vx || 1);
      // 收手 = 与玩家 AABB 相交即 Kill（:663-673）
      if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
        this.dead = true; return;
      }
    }
    hitEnemies(this, game, this.hitCd, 20, Math.sign(this.vx), this.armorPen);
  }
}

// ================= 长矛（aiStyle 19，AI_019_Spears，Projectile.cs:43198） =================

/** 每型号伸缩参数（AI_019_Spears_GetSpearOffsetRelativeToPlayer :43417-43540 switch）：
 *  [初始偏移 num6, 伸出速 num7, 缩回速 num8]——位移 = dir × shootSpeed × offset。
 *  aiStyle 161（新短剑 802/842/938-945）不在此 AI,归 spear kind 直刺近似(GAP) */
const SPEAR_PARAMS: Record<number, [number, number, number]> = {
  46: [3, 1.4, 1.6], 105: [3, 2.1, 2.4], 367: [3, 1.5, 1.6], 368: [3, 1.4, 1.5],
  222: [3, 2.1, 2.4], 342: [3, 2.1, 2.4], 47: [4, 0.9, 1.2], 153: [4, 1.3, 1.5],
  49: [4, 0.85, 1.1], 730: [8, 1.2, 1.5], 877: [28, 0.4, 0.4], 878: [28, 0.4, 0.4],
  879: [28, 0.4, 0.4], 64: [3, 1.7, 1.9], 215: [3, 1.7, 1.9],
  66: [3, 1.9, 2.1], 97: [3, 1.9, 2.1], 212: [3, 1.9, 2.1], 218: [3, 1.9, 2.1],
  130: [3, 1.0, 1.3], 1103: [4, 0.85, 1.1],
};

/** aiStyle 161 细剑/短剑族(AI_161_RapierStabs :44987):线性外伸 velocity×(t-1),
 *  16t 消失;与 AI_019 包络完全不同的直刺模型。型号 = 161 全集合 */
const RAPIER_PROJ = new Set([802, 842, 938, 939, 940, 941, 942, 943, 944, 945]);

export class SpearProj extends Entity {
  w = 20; h = 20;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 刺出方向（单位向量，原版出手时定死） */
  private dx: number;
  private dy: number;
  /** 原版 item.shootSpeed（velocity 模长——位移=offset×此值,勿当单位向量用） */
  private spd: number;
  private t = 0;
  private dur: number;
  /** 型号伸缩参数 */
  private prm: [number, number, number];
  private hitCd = new HitCooldown();
  dead = false;

  constructor(dirX: number, dirY: number, spd: number, dur: number, damage: number, knockback: number, projId: number) {
    super();
    const n = Math.hypot(dirX, dirY) || 1;
    this.dx = dirX / n;
    this.dy = dirY / n;
    this.spd = spd || 2.4; // 兜底:提取表 shootSpeed 缺失(七金属短剑模板坑)时按短剑族 2.1-2.4 档
    this.dur = dur;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.prm = SPEAR_PARAMS[projId] ?? [3, 1.9, 2.1];
  }

  draw(r: Renderer, cam: Camera): void {
    // AI_019（:43271-43276）:rotation = atan2+π/2+π/4,spriteDir==-1 再 -π/2;
    // AI_161 细剑(:44990):rotation = atan2+π/2(无 π/4 修正),Opacity 淡入 0→7/淡出 16→12
    const isRap = RAPIER_PROJ.has(this.projId);
    const base = Math.atan2(this.dy, this.dx) + Math.PI / 2
      + (isRap ? 0 : Math.PI / 4);
    // Utils.GetLerpValue clamped:淡入 t/7(t≤7),淡出 (16-t)/4(t≥12)
    const aIn = Math.min(1, this.t / 7);
    const aOut = this.t <= 12 ? 1 : Math.max(0, (16 - this.t) / 4);
    drawProj(r, cam, this, this.projId, this.dx < 0 && !isRap ? base - Math.PI / 2 : base,
      '#A0A0B0', isRap ? aIn * aOut : 1, isRap ? 32 : 0); // 细剑贴图 32×32 原尺寸(碰撞盒 18 解耦)
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    this.t++;
    const p = game.player;
    if (RAPIER_PROJ.has(this.projId)) {
      // AI_161_RapierStabs(:44987-45006):线性外伸,固定 16t 消失(与 AI_019 包络无关)
      if (this.t >= 16) { this.dead = true; return; }
      this.x = p.cx - this.w / 2 + this.dx * this.spd * (this.t - 1);
      this.y = p.cy - this.h / 2 + this.dy * this.spd * (this.t - 1);
      hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen);
      return;
    }
    if (this.t >= this.dur) { this.dead = true; return; }
    // AI_019 伸缩包络 1:1（:43441-43540）：
    //   itemAnimation 从 max 递减；伸出相占前 2/3（num5 增长），缩回相占后 1/3（num10 增长）
    const max = this.dur;
    const num3 = Math.floor(max / 3);
    const itemAnim = Math.max(0, max - this.t);
    const num4 = Math.min(itemAnim, num3);
    const num5 = itemAnim - num4;
    const num9 = (max - num3) - num5;
    const num10 = num3 - num4;
    const [n6, n7, n8] = this.prm;
    const offset = n6 + n7 * num9 - n8 * num10;
    this.x = p.cx - this.w / 2 + this.dx * offset * this.spd;
    this.y = p.cy - this.h / 2 + this.dy * offset * this.spd;
    hitEnemies(this, game, this.hitCd, 9999, this.dx > 0 ? 1 : -1, this.armorPen); // 一次突刺每敌只结算一次
  }
}

// ================= 燃烧瓶（proj 399 aiStyle 68；Molotov 2590→399，Kill 链 :70889-70928） =================
// 弹跳物理（ai[0]>=15 起重力 0.2/t，AI_068 :29048-29100）；死亡（撞块/命中/超时）→
// 6 朵火云 400+rand3（:70918-70927：散布 ±8/上抛，伤 ×0.5，火云=aiStyle 14 弹跳穿透 3、
// 360t、命中 OnFire 3-6s :10850-10852）
export class MolotovProj extends Entity {
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  critChance = 0.04;
  armorPen = 0;
  private t = 0;
  private hitSet = new Set<number>();
  dead = false;
  /** 火云生成回调（Game 注入——避免实体循环依赖） */
  spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    spawnFires: (x: number, y: number, dmg: number, vx: number, vy: number) => void) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.spawnFires = spawnFires;
  }

  private breakOpen(game: GameHooks): void {
    this.dead = true;
    // :70918-70927 六朵火云：x 散布 -vx×rand(20,50)%±8、y -|vy|×rand(30,50)%-8..+2
    for (let i = 0; i < 6; i++) {
      const fx = -this.vx * (20 + Math.floor(Math.random() * 30)) * 0.01 + (Math.random() * 40 - 20) * 0.4;
      const fy = -Math.abs(this.vy) * (30 + Math.floor(Math.random() * 20)) * 0.01 + (Math.random() * 24 - 20) * 0.4;
      this.spawnFires(this.cx + fx, this.cy + fy, Math.max(1, Math.round(this.damage * 0.5)), fx, fy);
    }
    game.spawnParticles(this.cx, this.cy, '#FF9A3C', 20, 5, { life: 30, grav: -0.06, damp: 0.94 });
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    if (++this.t >= 3) { /* alpha 淡入（:29054）视觉从略 */ }
    if (this.t >= 15) this.vy = Math.min(this.vy + 0.2, 16); // :29063
    else this.vy = Math.min(this.vy + 0.1, 16);
    this.vx *= 0.99;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (solidAt(nx + this.w / 2, this.y + this.h / 2)) { this.breakOpen(game); return; } // 撞块即裂
    if (solidAt(this.x + this.w / 2, ny + this.h - 1)) { this.breakOpen(game); return; }
    this.x = nx; this.y = ny;
    if (this.t > 600) { this.dead = true; return; }
    // 命中敌即裂（penetrate 1）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean };
      if (e.dead || this.hitSet.has(e.id)) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        this.hitSet.add(e.id);
        this.breakOpen(game);
        return;
      }
    }
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 399, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#804020');
  }
}

// ================= 配重球（aiStyle 99 type 556-561/1079，AI_099_1 :64472-64610） =================
// 环绕玩家：半径 num=250×0.5=125（yoyoString +25%+10，:64487）；rotation+0.5/t；
// 超径钳回轨道（:64544-64550）+ 切向增速 vector2=(vy,vx) 翻转带象限符号（:64552-64610）；
// 生存绑 yoyo 存活（timeLeft=6 刷新语义：alive() false 即消亡）
export class CounterweightProj extends Entity {
  w = 18; h = 18;
  damage: number;
  knockback: number;
  projId: number;
  critChance = 0.04;
  armorPen = 0;
  meleeProj = true;
  private orbitR: number;
  private rot = 0;
  private alive: () => boolean;
  private ownerRef: () => { cx: number; cy: number } | null;
  private hitCd = new HitCooldown();
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    owner: () => { cx: number; cy: number } | null, alive: () => boolean, yoyoString: boolean) {
    super();
    this.x = x; this.y = y;
    this.damage = damage; this.knockback = knockback; this.projId = projId;
    this.ownerRef = owner; this.alive = alive;
    this.orbitR = 125; // 250×0.5（:64477/:64482）
    if (yoyoString) this.orbitR += this.orbitR * 0.25 + 10; // :64487
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    const p = this.ownerRef();
    if (!p || !this.alive()) { this.dead = true; return; } // timeLeft=6/宿主消亡
    this.rot += 0.5; // :64489
    // 超径钳回（:64540-64550）：钳到轨道 + 速度径向衰减（去超出的 num6）
    let dx = p.cx - this.cx, dy = p.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    if (d > this.orbitR) {
      const over = d - this.orbitR;
      dx /= d; dy /= d;
      this.x = p.cx - dx * this.orbitR - this.w / 2;
      this.y = p.cy - dy * this.orbitR - this.h / 2;
      const sp = Math.hypot(this.vx, this.vy);
      const cut = Math.min(over, Math.max(0, sp - 1)); // num6 钳（:64556）
      if (sp > 0) { this.vx *= (sp - cut) / sp; this.vy *= (sp - cut) / sp; }
    }
    // 切向增速（:64552-64610）：vector2=(vy,vx) 按象限定号后并入速度方向
    {
      const sp0 = Math.hypot(this.vx, this.vy);
      if (sp0 > 0.5) {
        let tx = this.vy, ty = this.vx; // vector2 翻转
        if (this.cy < p.cy) ty = Math.abs(ty); else if (this.cy > p.cy) ty = -Math.abs(ty);
        if (this.cx < p.cx) tx = Math.abs(tx); else if (this.cx > p.cx) tx = -Math.abs(tx);
        let nvx = this.vx + tx, nvy = this.vy + ty;
        const nl = Math.hypot(nvx, nvy) || 1;
        nvx = nvx / nl * sp0; nvy = nvy / nl * sp0; // 保速转朝
        if (Math.abs(tx) < 0.1 || Math.abs(ty) < 0.1) { this.vx = nvx; this.vy = nvy; }
        else { this.vx = (nvx + this.vx * 2) / 3; this.vy = (nvy + this.vy * 2) / 3; } // :64588
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx) || 1, this.armorPen);
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, this.projId, this.rot + Math.PI / 2, '#B09060');
  }
}

// ================= 悠悠球 / 连枷（aiStyle 99 / 15，channel 语义） =================

/** 悠悠球型号三表（ProjectileID.cs:185/187/189 全量 1:1；键=projId，缺省=表默认） */
export const YOYO_RANGE: Record<number, number> = { // 最大射程 px（默认 200）
  541: 130, 548: 170, 542: 195, 543: 207, 544: 215, 534: 220, 564: 225, 999: 225,
  545: 235, 562: 235, 563: 250, 546: 275, 552: 270, 553: 330, 547: 280, 549: 290,
  554: 340, 550: 370, 551: 370, 555: 360, 603: 400,
};
export const YOYO_TOP: Record<number, number> = {  // 顶速（默认 10）
  541: 9, 548: 11, 542: 12.5, 543: 12, 544: 13, 534: 13, 564: 14, 999: 14,
  545: 14, 562: 17, 563: 12, 546: 15, 552: 14, 553: 15, 547: 17, 549: 16,
  554: 16, 550: 16, 551: 16, 555: 16.5, 603: 17.5,
};
export const YOYO_LIFE: Record<number, number> = {  // 寿命倍率（默认 -1=无限）
  541: 3, 548: 5, 542: 7, 543: 6, 544: 8, 534: 9, 564: 11, 999: 11,
  545: 13, 563: 30, 562: 16, 553: 12, 546: 16, 552: 15, 549: 14,
};

export class YoyoProj extends Entity {
  w = 16; h = 16;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** 持续按住判定（原版 channel：按住时悠悠球滞留追光标） */
  private channel: () => boolean;
  /** 光标世界坐标 getter */
  private target: () => { x: number; y: number };
  /** 线长上限 px（原版 stringLength，按 shootSpeed 修正） */
  private stringLen: number;
  private hitCd = new HitCooldown();
  private rot = 0;
  /** 手部坐标（线起点，fixedUpdate 每帧刷新为主角中心） */
  handX = 0;
  handY = 0;
  /** 存活秒数（AI_099 localAI[0]/60 ÷(1+ms)/2,超 YOYO_LIFE 回收） */
  private lifeT = 0;
  /** 回收锁（ai[0]=-1 终态:松手/超寿命/1.3×超程后不可复活,需重新使用掷出） */
  private recalled = false;
  life = 7200;
  /** 型号顶速（YOYO_TOP 注入，缺省 10——ProjectileID.cs:189） */
  topSpeed = 10;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    stringLen: number, channel: () => boolean, target: () => { x: number; y: number }) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.stringLen = stringLen;
    this.channel = channel;
    this.target = target;
  }

  draw(r: Renderer, cam: Camera): void {
    // 线（原版 yoyo string / 连枷链：手部 → 球体）。世界坐标(实体循环在世界变换内)
    const c = r.canvas.getContext('2d');
    if (c) {
      c.strokeStyle = '#D0D0D8';
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
    // 联机傀儡（远端弹幕快照驱动）：纯位移外推，不跑命中/碰撞（伤害归拥有者客户端结算）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    this.hitCd.tick();
    // ---- AI_099_2_Yoyos 参数链（:64945-64977）----
    const ms = p.attackSpeedMult || 1;
    const msRange = (1 + ms * 3) / 4;          // 射程/顶速缩放(:64974-64975)
    let range = YOYO_RANGE[this.projId] ?? 200;
    if (p.equipStats.yoyoString) range = range * 1.25 + 30;  // 线圈 yoyoString(:64971)
    range /= msRange;
    let top = (YOYO_TOP[this.projId] ?? 10) / msRange;
    let inertia = Math.max(1, 14 - top / 2);   // num7(:64968-64971)
    const deadZone = 5 + top / 2;              // num9 光标死区半径(:64972)
    // 寿命（:64840-64854）：秒数 ÷(1+ms)/2,超 YoyosLifeTimeMultiplier → 回收态
    this.lifeT += 1 / 60 / ((1 + ms) / 2);
    let lifeMul = YOYO_LIFE[this.projId] ?? -1;
    if (p.equipStats.yoyoString && lifeMul > 0) lifeMul *= 1.5;
    const expired = lifeMul !== -1 && this.lifeT > lifeMul;
    if (this.recalled || !this.channel() || expired) {
      this.recalled = true;
      // 回收态（ai[0]=-1,:65152-65172）：惯性 ×0.8 取整、顶速 ×1.5、穿墙,
      // lerp 朝玩家;距手 <num8+10 或 >2000 → Kill
      inertia = Math.floor(inertia * 0.8);
      top *= 1.5;
      const dx = p.cx - (this.x + this.w / 2);
      const dy = p.cy - (this.y + this.h / 2);
      const d = Math.hypot(dx, dy);
      if (d < top + 10 || d === 0 || d > 2000) { this.dead = true; return; }
      this.vx = (this.vx * (inertia - 1) + (dx / d) * top) / inertia;
      this.vy = (this.vy * (inertia - 1) + (dy / d) * top) / inertia;
      this.x += this.vx;
      this.y += this.vy;
      hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx), this.armorPen);
      return;
    }
    // ---- 活跃态（:64983-65148）----
    if (Math.hypot(this.vx, this.vy) > top) { this.vx *= 0.98; this.vy *= 0.98; }
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const dPlayer = Math.hypot(p.cx - cx, p.cy - cy);
    const overRange = dPlayer > range;          // flag3:超程减速
    if (dPlayer > range * 1.3) { this.recalled = true; return; } // flag4:1.3×超程强制回收(下帧走回收态)
    // 光标目标钳在射程内（:65002-65034）
    const t = this.target();
    let tx = t.x, ty = t.y;
    let tdx = tx - p.cx, tdy = ty - p.cy;
    const td = Math.hypot(tdx, tdy);
    if (td > range) { tdx = (tdx / td) * range; tdy = (tdy / td) * range; tx = p.cx + tdx; ty = p.cy + tdy; }
    if (overRange) {
      inertia /= 2; top *= 2;
      if (cx > p.cx && this.vx > 0) this.vx *= 0.5;
      if (cy > p.cy && this.vy > 0) this.vy *= 0.5;
      if (cx < p.cx && this.vx < 0) this.vx *= 0.5;
      if (cy < p.cy && this.vy < 0) this.vy *= 0.5;
    }
    // lerp 逼近目标（:65071-65083）：死区外 velocity=(v×(num7-1)+dir×min(d/2,top))/num7
    const dx2 = tx - cx, dy2 = ty - cy;
    const d2 = Math.hypot(dx2, dy2);
    if (d2 > deadZone) {
      const step = overRange ? Math.min(d2 / 2, top / 2) : Math.min(d2 / 2, top);
      const k = overRange ? 1 : inertia; // flag3 时 num7=1（:65066-65067）
      this.vx = (this.vx * (k - 1) + (dx2 / d2) * step) / k;
      this.vy = (this.vy * (k - 1) + (dy2 / d2) * step) / k;
    } else {
      this.vx *= 0.8; this.vy *= 0.8;  // 死区内衰减(:65127)
    }
    this.x += this.vx;
    this.y += this.vy;
    // yoyo tileCollide=false 穿墙;命中冷却 10t(SetDefaults localNPCHitCooldown)
    hitEnemies(this, game, this.hitCd, 10, Math.sign(this.vx), this.armorPen);
  }
}

// ================= 连枷/链球（aiStyle 15，AI_015_Flails，Projectile.cs:41051-41506） =================

/** 每型号参数（Projectile.cs:41070-41115 switch 各 case + 默认值；单位 px/tick/tick）。
 *  meleeSpeed 缩放链（:41116-41124）：throwSpd/farPull/pullAccel/retractKill/returnAccel/
 *  returnKill ×(1/meleeSpeed)——orbitRadius(num15)不缩放 */
interface FlailParams {
  flightTicks: number;  // num:掷出态飞行上限 tick（超时 → 回拉）
  throwSpeed: number;   // num2:松手掷出初速
  pullAccel: number;    // num4:回拉态 MoveTowards 步长
  retractKill: number;  // num5:回拉态距手 ≤ 此值即消失
  returnAccel: number;  // num6:回收态 MoveTowards 步长
  returnKill: number;   // num7:回收态距手 ≤ 此值即消失
  farPullSpeed: number; // num9:远端回拉目标速率
  orbitRadius: number;  // num15:旋转态绕体半径
  spinHitCd: number;    // num12:旋转态每敌命中冷却
  thrownHitCd: number;  // num13:掷出/回拉/坠落态冷却
}
const FLAIL_DEFAULT: FlailParams = {
  flightTicks: 10, throwSpeed: 24, pullAccel: 3, retractKill: 16,
  returnAccel: 6, returnKill: 48, farPullSpeed: 14, orbitRadius: 30,
  spinHitCd: 15, thrownHitCd: 10,
};
const FLAIL_PARAMS: Record<number, Partial<FlailParams>> = {
  25:  { flightTicks: 15, throwSpeed: 14, retractKill: 10, returnKill: 15 },
  26:  { flightTicks: 15, throwSpeed: 16, retractKill: 13, returnKill: 17, orbitRadius: 32 },
  35:  { flightTicks: 15, throwSpeed: 17, retractKill: 14, returnKill: 18, orbitRadius: 37 },
  63:  { flightTicks: 13, throwSpeed: 21, retractKill: 20, returnKill: 24, spinHitCd: 12 },
  154: { flightTicks: 15, throwSpeed: 15, retractKill: 11, returnKill: 16 },
  247: { flightTicks: 13, throwSpeed: 23, spinHitCd: 12, orbitRadius: 40 },
  757: { flightTicks: 13, throwSpeed: 22, retractKill: 22, returnKill: 26, spinHitCd: 12, orbitRadius: 35 },
  947: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  948: { flightTicks: 13, throwSpeed: 12, retractKill: 8, returnKill: 13 },
  1058: { flightTicks: 16, throwSpeed: 23, spinHitCd: 10, orbitRadius: 45 },
};

/** 链贴图（DrawProj_FlailChains Main.cs:34757-34781 switch）：型号 → Chain_N；
 *  948 三段混排（前 4 节 Chain43 全亮 → 2 节 Chain42 → 其余 Chain41）；
 *  757 = Extra_99 六帧竖条动画链 */
function flailChainTex(projId: number): string {
  switch (projId) {
    case 25: return 'Chain2';
    case 35: return 'Chain6';
    case 63: return 'Chain7';
    case 154: return 'Chain13';
    case 247: return 'Chain19';
    case 947: case 948: return 'Chain41';
    case 757: return 'Extra_99';
    default: return 'Chain3';
  }
}
const chainImgCache = new Map<string, HTMLImageElement>();
function chainImg(name: string): HTMLImageElement | null {
  let img = chainImgCache.get(name);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.src = `sprites/vanilla/${name}.png`;
  chainImgCache.set(name, img);
  return img;
}

export class FlailProj extends Entity {
  /** 原版碰撞盒按型号(Projectile.SetDefaults):247/757=34 / 947/948=20 /
   *  1058=26 / 其余 22——写死 22 会让 5 个型号命中盒失真,2026-08-13 review */
  w: number;
  h: number;
  damage: number;
  knockback: number;
  projId: number;
  /** GetWeaponCrit 合并值（Game 侧传入；缺省 4 基础） */
  critChance = 0.04;
  /** ⑥ 护甲穿透（Game 注入，命中传 hurt 减防） */
  armorPen = 0;
  /** 近战系（吃武器浸剂） */
  meleeProj = true;
  /** channel 电平（mouseHeld && 手持原物品 && !uiBlocking）——Game 注入 */
  private channel: () => boolean;
  /** 鼠标世界坐标 getter（松手掷出方向） */
  private target: () => { x: number; y: number };
  private prm: FlailParams;
  /** ai[0] 状态：0 旋转 / 1 掷出 / 2 回拉 / 5 坠落 / 6 垂地悬荡 / 4 回收 */
  private st = 0;
  /** ai[1] 状态内计数 */
  private stT = 0;
  /** localAI[1] 旋转态累计 tick */
  private spinT = 0;
  /** localAI[0] 弹墙累计（AI_015_HandleMovementCollision:41006） */
  private bounces = 0;
  private rotation = 0;
  private hitCd = new HitCooldown();
  /** 手部坐标（链条起点，每 tick 刷新） */
  handX = 0;
  handY = 0;
  life = 7200;
  dead = false;

  constructor(x: number, y: number, damage: number, knockback: number, projId: number,
    channel: () => boolean, target: () => { x: number; y: number }) {
    super();
    this.x = x; this.y = y;
    this.handX = x; this.handY = y;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.channel = channel;
    this.target = target;
    this.prm = { ...FLAIL_DEFAULT, ...FLAIL_PARAMS[projId] };
    const pd = projectileData(projId);
    this.w = pd?.width ?? 22;
    this.h = pd?.height ?? 22;
  }

  draw(r: Renderer, cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (ctx) this.drawChain(ctx, r);
    drawProj(r, cam, this, this.projId, this.rotation, '#E04040');
  }

  /** 链条（DrawProj_FlailChains Main.cs:34752-34842 1:1）：球心 → 手臂方向逐节
   *  步长=链节高，每节按所在格光照着色；948 三段混排 / 757 六帧动画链 */
  private drawChain(ctx: CanvasRenderingContext2D, r: Renderer): void {
    const img = chainImg(flailChainTex(this.projId));
    if (!img || !img.complete || img.naturalWidth === 0) {
      // 贴图未就绪兜底：细线（旧实现形态）
      ctx.strokeStyle = '#605848';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.handX, this.handY);
      ctx.lineTo(this.x + this.w / 2, this.y + this.h / 2);
      ctx.stroke();
      return;
    }
    // 光照采样（Lighting.GetColor 每节一次；拿不到则全亮。
    // ★lightAt 返回 0..255(Renderer 同源 /255 消费)——不除即恒满亮的静默 bug,2026-08-13 review)
    const lighting = (r as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
    const lightAt = (wx: number, wy: number): number => {
      if (!lighting) return 1;
      const [lr, lg, lb] = lighting.lightAt(Math.floor(wx / TILE), Math.floor(wy / TILE));
      return Math.min(1, (lr * 0.3 + lg * 0.5 + lb * 0.2) / 255);
    };
    // 球心 → 臂方向（playerArmPosition.MoveTowards(center,4) 近似为手部）
    const cx0 = this.x + this.w / 2, cy0 = this.y + this.h / 2;
    let dx = this.handX - cx0, dy = this.handY - cy0;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    dx /= d; dy /= d;
    const frames = this.projId === 757 ? 6 : 1;
    const linkH = img.naturalHeight / frames + (this.projId === 757 ? -2 : 0);
    const rotation = Math.atan2(dy, dx) + Math.PI / 2;
    let px = cx0, py = cy0;
    let i = 0;
    for (let remain = d + linkH / 2; remain > 0; remain -= linkH, i++) {
      let tex = img;
      let sy = 0, sh = img.naturalHeight;
      if (this.projId === 757) { sy = (i % 6) * (img.naturalHeight / 6); sh = img.naturalHeight / 6; }
      else if (this.projId === 948) {
        // 三段：前 4 节 Chain43（全亮）→ 2 节 Chain42（最低亮度 140）→ 其余 Chain41
        if (i < 4) { tex = chainImg('Chain43') ?? img; }
        else if (i < 6) { tex = chainImg('Chain42') ?? img; }
      }
      if (!tex.complete || tex.naturalWidth === 0) tex = img;
      const alpha = this.projId === 948 && i < 4 ? 1
        : this.projId === 948 && i < 6 ? Math.max(lightAt(px, py), 140 / 255)
          : lightAt(px, py);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = Math.max(0.15, alpha);
      ctx.drawImage(tex, 0, sy, tex.naturalWidth, sh, -tex.naturalWidth / 2, -sh / 2, tex.naturalWidth, sh);
      ctx.restore();
      px += dx * linkH;
      py += dy * linkH;
    }
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    // 火焰重锤 948 入水(非岩浆)→ 变型 948→947(:41069-41072 type==948 && wet && !lavaWet)
    if (this.projId === 948) {
      const st948 = game.world.store;
      const li = st948.liquid[st948.idx(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h / 2) / TILE))];
      if (li > 64 && st948.liquidType[st948.idx(Math.floor((this.x + this.w / 2) / TILE), Math.floor((this.y + this.h / 2) / TILE))] !== 2) {
        this.projId = 947;
      }
    }
    const p = game.player;
    this.handX = p.cx;
    this.handY = p.cy;
    this.hitCd.tick();
    // meleeSpeed 缩放链（:41116-41124,1/meleeSpeed）——repo attackSpeedMult 语义同向(>1 更快)
    const inv = 1 / (p.attackSpeedMult || 1);
    const throwSpd = this.prm.throwSpeed * inv;
    const pullAccel = this.prm.pullAccel * inv;
    const retractKill = this.prm.retractKill * inv;
    const returnAccel = this.prm.returnAccel * inv;
    const returnKill = this.prm.returnKill * inv;
    const farPull = this.prm.farPullSpeed * inv;
    const maxRange = 800;
    // 击杀门（:41053-41060）：主角死亡/离手 900×(1/meleeSpeed)
    const distHand = () => Math.hypot(this.x + this.w / 2 - p.cx, this.y + this.h / 2 - p.cy);
    if (p.dead || distHand() > 900 * inv) { this.dead = true; return; }
    const held = this.channel();
    // num17/num18(:41129-41130):链长上限=掷速×飞行tick;垂地悬荡放行 +160
    const num17 = throwSpd * this.prm.flightTicks;
    const num18 = num17 + 160;
    let cd = 10; // num11 默认每敌冷却
    switch (this.st) {
      case 0: { // 旋转态（:41163-41212）：绕体公转,松手朝鼠标掷出
        if (!held) {
          this.st = 1; this.stT = 0;
          const t = this.target();
          const dx = t.x - p.cx, dy = t.y - p.cy;
          const dd = Math.hypot(dx, dy) || 1;
          this.vx = (dx / dd) * throwSpd + p.vx;
          this.vy = (dy / dd) * throwSpd + p.vy;
          this.x = p.cx - this.w / 2;
          this.y = p.cy - this.h / 2;
          this.hitCd.clear(); // ResetLocalNPCHitImmunity
          cd = this.prm.thrownHitCd;
          break;
        }
        this.spinT++;
        // :41189-41197 vector6 = (direction,0).RotatedBy(π×10×(t/60)×direction);
        // Y×0.8;向下(gravDir>0)再减半——扁椭圆轨迹,上快下慢。
        // direction 取朝鼠标侧（原版 ChangeDir(vector5.X>0?1:-1) :41203;不直接改
        // player.facing,登记 GAP）
        const t0 = this.target();
        const dir = (t0.x >= p.cx ? 1 : -1);
        const a = Math.PI * 10 * (this.spinT / 60) * dir;
        let ox = Math.cos(a) * dir, oy = Math.sin(a) * dir;
        oy *= 0.8;
        if (oy > 0) oy *= 0.5;
        this.x = p.cx + ox * this.prm.orbitRadius - this.w / 2;
        this.y = p.cy + oy * this.prm.orbitRadius - this.h / 2;
        this.vx = 0; this.vy = 0;
        cd = this.prm.spinHitCd;
        break;
      }
      case 1: { // 掷出态（:41243-41273）：直线无重力;超时/超程 → 回拉;再按 → 垂地
        this.stT++;
        if (held) { this.st = 3; this.stT = 0; this.vx *= 0.2; this.vy *= 0.2; break; } // 再按→垂链(:41288)
        if (this.stT >= this.prm.flightTicks || distHand() >= maxRange) {
          this.st = 2; this.stT = 0; this.vx *= 0.3; this.vy *= 0.3;
        }
        cd = this.prm.thrownHitCd;
        break;
      }
      case 2: { // 回拉态（:41275-41290）：向手回拉,近手消失;再按 → 垂地
        if (distHand() <= retractKill) { this.dead = true; return; }
        if (held) { this.st = 6; this.stT = 0; this.vx *= 0.2; this.vy *= 0.2; break; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, retractKill, pullAccel);
        cd = this.prm.thrownHitCd;
        break;
      }
      case 3: { // 垂链态（:41288-41330 1:1）：持按悬垂摆动;松手 → 回收;
        //  超链长段 ×0.98 朝手 MoveTowards(num9=14, num8=1)；链内近停段 X×0.96/Y+0.2
        //  （玩家静止再 X×0.96）；tileCollide 按是否超 num17 切换；玩家朝向背对球
        if (!held) { this.st = 4; this.stT = 0; break; }
        {
          const dHand3 = Math.hypot(p.cx - this.cx, this.cy - p.cy);
          if (dHand3 > num17) {
            this.vx *= 0.98; this.vy *= 0.98;
            this.moveTowardsHand(p, 14, 1); // velocity ×0.98 后朝手 MoveTowards(14, 1)（num9/num8）
          } else {
            if (Math.hypot(this.vx, this.vy) < 6) {
              this.vx *= 0.96;
              this.vy += 0.2;
            }
            if (p.vx === 0) this.vx *= 0.96;
          }
          // ChangeDir 背对球（:41327）：玩家中心在球左侧 → 朝右（本仓玩家朝向由输入驱动,此处仅注释语义）
          cd = this.prm.thrownHitCd;
        }
        break;
      }
      case 5: { // 坠落态（:41346-41362,撞墙入口见下方 tile 碰撞）：重力坠地
        this.stT++;
        if (this.stT >= this.prm.flightTicks + 5) { this.st = 6; this.stT = 0; break; }
        cd = this.prm.thrownHitCd;
        this.vy += 0.6;
        this.vx *= 0.95;
        break;
      }
      case 6: { // 垂地悬荡态（:41364-41376）：持按垂链;松手/超程 → 回收
        if (!held || distHand() > num18) { this.st = 4; this.stT = 0; break; }
        this.vy += 0.8;
        this.vx *= 0.95;
        break;
      }
      case 4: { // 回收态（:41292-41234 区段 case 4:41321-41344）：无视碰撞回手
        if (distHand() <= returnKill) { this.dead = true; return; }
        this.vx *= 0.98; this.vy *= 0.98;
        this.moveTowardsHand(p, returnKill, returnAccel);
        // 越手击杀（:41337-41343 Dot(dirToHand, dirFrom(目标点))<0 → Kill）
        const tx2 = this.x + this.w / 2 + this.vx, ty2 = this.y + this.h / 2 + this.vy;
        const hx = p.cx - tx2, hy = p.cy - ty2;
        const hd = Math.hypot(hx, hy) || 1;
        const sx = (p.cx - (this.x + this.w / 2)) / (distHand() || 1);
        const sy = (p.cy - (this.y + this.h / 2)) / (distHand() || 1);
        if (sx * (hx / hd) + sy * (hy / hd) < 0) { this.dead = true; return; }
        break;
      }
      default: break;
    }
    // 位移 + tile 碰撞（AI_015_HandleMovementCollision :40982-41049）：
    // 旋转态位置由 AI 直接钉死不积分;回收态 tileCollide=false
    if (this.st !== 0 && this.st !== 4) {
      const rest = this.st === 1 || this.st === 5 ? 0.4 : this.st === 6 ? 0 : 0.2;
      const world = game.world;
      const solid = (x: number, y: number): boolean => {
        const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
        const x1 = Math.floor((x + this.w - 1) / TILE), y1 = Math.floor((y + this.h - 1) / TILE);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (world.store.inBounds(tx, ty) && world.store.isSolid(tx, ty)) return true;
        }
        return false;
      };
      const lvx = this.vx, lvy = this.vy;
      const nx = this.x + this.vx;
      if (solid(nx, this.y)) {
        this.vx = -lvx * rest;
        this.bounces++; // localAI[0]:每次接触都计(:41001/:41010)——只计 >4 会让缓磨墙永不触发逃生
        if (Math.abs(lvx) > 4) this.hitTileFx(game, nx, this.y); // num2>0 门=音尘(:40999)
      } else this.x = nx;
      const ny = this.y + this.vy;
      if (solid(this.x, ny)) {
        this.vy = -lvy * rest;
        this.bounces++;
        if (Math.abs(lvy) > 4) this.hitTileFx(game, this.x, ny);
      } else this.y = ny;
      // 掷出态撞墙 → 坠落态（:41027-41037 + CreateImpactExplosion 音尘近似）
      if (this.st === 1 && (this.vx !== lvx || this.vy !== lvy)) {
        this.st = 5; this.stT = 0;
      }
      // 卡死逃生（:41040-41045）：弹墙≥10 次且非 3/0/5/6 态 → 强制回收
      if (this.st !== 3 && this.st !== 0 && this.st !== 5 && this.st !== 6 && this.bounces >= 10) {
        this.st = 4; this.stT = 0;
      }
    }
    // 旋转（:41476-41484 flag 通用段）：速度>1 对齐速度向,否则按 vx 缓转
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 1) this.rotation = Math.atan2(this.vy, this.vx) + this.vx * 0.1;
    else this.rotation += this.vx * 0.1;
    // 火尘（AI_015_Flails_Dust :41778-41785:type 35 每帧 1 颗火尘 noGravity）
    if (this.projId === 35 || this.projId === 948) {
      game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#FF8830', 1, 0.5,
        { life: 20, grav: 0, size: 2 });
    } else if (this.projId === 26) {
      // :41770-41775 hallow 尘近似
      if (Math.random() < 0.2) game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#B0A0FF', 1, 0.5, { life: 20, grav: 0, size: 2 });
    }
    hitEnemies(this, game, this.hitCd, cd, Math.sign(this.vx) || 1, this.armorPen);
  }

  /** velocity MoveTowards(手方向×targetSpd, accel)（:41281-41285/:41325-41329 同式） */
  private moveTowardsHand(p: { cx: number; cy: number }, targetSpd: number, accel: number): void {
    const d = Math.hypot(p.cx - (this.x + this.w / 2), p.cy - (this.y + this.h / 2)) || 1;
    const tx = ((p.cx - (this.x + this.w / 2)) / d) * targetSpd;
    const ty = ((p.cy - (this.y + this.h / 2)) / d) * targetSpd;
    const ddx = tx - this.vx, ddy = ty - this.vy;
    const dd = Math.hypot(ddx, ddy);
    if (dd <= accel) { this.vx = tx; this.vy = ty; }
    else { this.vx += (ddx / dd) * accel; this.vy += (ddy / dd) * accel; }
  }

  /** 撞墙反馈（Collision.HitTiles 尘 + SoundID 0 挖掘音——:41045 num2>0 门） */
  private hitTileFx(game: GameHooks, hx: number, hy: number): void {
    game.spawnParticles(hx + this.w / 2, hy + this.h / 2, '#A09080', 3, 1.5, { life: 14, size: 2 });
    game.playSfx('dig', 0.5, hx + this.w / 2, hy + this.h / 2);
  }
}

// ================= 手雷/炸弹/炸药（aiStyle 16，AI_016 引信爆炸） =================

export class GrenadeProj extends Entity {
  // 碰撞盒 1:1（Projectile.SetDefaults :846-869）：炸弹 28=22×22 / 炸药棍 29=10×10 /
  // 手雷 30=14×14——此前统一 14×14（雷管判定盒虚大 2 倍）
  w = 14; h = 14;
  vx: number;
  vy: number;
  damage: number;
  projId: number;
  /** 引信 timeLeft 1:1（SetDefaults :10348-10372）：炸弹 28=180 / 炸药棍 29=300 /
   *  手雷 30=180——此前误写 150/135/180（引信时长不对的根源） */
  fuse: number;
  onExplode!: (x: number, y: number, damage: number) => void;
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
    const hb = projId === 28 ? 22 : projId === 29 ? 10 : 14;
    this.w = hb; this.h = hb;
  }

  draw(r: Renderer, cam: Camera): void {
    // 原版投射物绘制 = 贴图原生尺寸 × scale 1（与碰撞盒解耦）——雷管 29 贴图 10×32
    // 此前按碰撞盒宽 14 拉方成 14×44.8（"雷管贴图这么大个"根因）
    drawProj(r, cam, this, this.projId, this.rot, '#408040', 1, -1);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 旋转 = 滚动（AI_016 :44913 rotation += velocity.X × 0.1；28/29/30 不在排除表）——
    // 此前自造 speed×0.03 全程自旋，与原版"落地滚、空中缓摆"不符
    this.rot += this.vx * 0.1;
    if (--this.fuse <= 0) {
      this.dead = true;
      this.onExplode(this.x + this.w / 2, this.y + this.h / 2, this.damage);
      return;
    }
    // AI_016：重力 0.2/tick（:44897 velocity.Y += 0.2f；曾误用 0.3）+ 弹跳。
    // 碰撞探测用「底边中点」而非中心——中心探测会让弹体在地面沉降 ~4px 嵌入
    this.vy = Math.min(this.vy + 0.2, 16);
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
      // 着地滚动摩擦（:44888 velocity.X × 0.97；雷管 29 追加 ×0.99）；曾 0.92 停太急
      this.vx *= this.projId === 29 ? 0.96 : 0.97;
      ny = this.y;
    }
    this.x = nx;
    this.y = ny;
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) this.dead = true;
  }
}

// ================= 荧光棒族（aiStyle 14，AI_014 + 碰撞反弹表 Projectile.cs:23482-23500/18261-18333） =================

/** 荧光棒物理 1:1：
 *  AI_014 主体（cs:23482-23500）：ai0++ >5 钳位；着地（本帧 vy 未变且 vx≠0）滚动摩擦
 *  vx×0.97（<0.01 归零）；重力 vy+=0.2；rotation += vx×0.1
 *  粘性（proj 53，tileCollide=false，cs:23245-23296）：与实心块重叠 → velocity=(0,-0.2)
 *  抵消重力 → 停在原位粘住
 *  妖精（proj 870）：首次碰墙全反射 → aiStyle 170（cs:42997-43053）：半径 10 实心排斥
 *  场（速度>1 时每 10 tick 重算）+ 速度 ×0.95 衰减、<1 归零
 *  碰撞反弹表（cs:18261-18333，碰墙后）：
 *    50      X→-0.2×；Y（lastV>1.5）→-0.2×
 *    ≥1089   彩虹：X→-0.99×（|Δ|<1 → ±1）；Y→-0.99×（0<lastV<1 → -1）——近似永动
 *    其余    473/515：X→-0.5×；Y（lastV>1）→-0.5×
 *  寿命：timeLeft×5（=9000，cs:1075）；矿工 473 ×2（=3600）。到期消失无掉落 */
export class GlowstickProj extends Entity {
  w: number; h: number;
  vx: number;
  vy: number;
  projId: number;
  dead = false;
  /** 原版 timeLeft（proj 50/53/515/870/1089 = 9000；473 = 3600） */
  timeLeft: number;
  private ai0 = 0;
  private rot = 0;
  /** 妖精阶段（870 反弹后） */
  private fairy = false;
  private fairyT = 0;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
    this.w = projId === 473 ? 8 : 6;
    this.h = this.w;
    this.timeLeft = projId === 473 ? 3600 : 9000;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 原版投射物绘制尺寸 = 贴图原生尺寸 × scale（碰撞盒 6×6 与绘制解耦）——
    // 50/53/515/1089 贴图是 22×6 横条（此前按碰撞盒 6px 画成 1.6px 细丝）；
    // 870 妖精 = 18×96 纵条 6 帧（帧进 5t）；473 = 18×18 单帧
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      if (this.projId === 870) {
        const fr = Math.floor(this.fairyT / 5) % 6;
        ctx.drawImage(img, 0, fr * 16, 18, 16, -9, -8, 18, 16);
      } else {
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      }
    } else {
      ctx.fillStyle = '#7FE8A8';
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.timeLeft <= 0) { this.dead = true; return; }
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    if (this.fairy) {
      // AI_170_FairyGlowstick（cs:42997-43053）：排斥场 + 衰减
      this.fairyT++;
      if (this.fairyT % 10 === 0 && Math.hypot(this.vx, this.vy) > 1) {
        const ptx = Math.floor((this.x + this.w / 2) / TILE), pty = Math.floor((this.y + this.h / 2) / TILE);
        let zx = 0, zy = 0, n = 0;
        for (let i = ptx - 10; i <= ptx + 10; i++) {
          for (let j = pty - 10; j <= pty + 10; j++) {
            if (!st.inBounds(i, j) || !st.isSolid(i, j)) continue;
            const dx = ptx - i, dy = pty - j;
            const len = Math.hypot(dx, dy) || 1;
            const f = Math.max(10 - len, 0) / len * 3;
            zx += dx * f; zy += dy * f; n++;
          }
        }
        if (n > 0) { zx /= n; zy /= n; }
        if (Math.hypot(zx, zy) > 1) { this.vx = zx; this.vy = zy; }
      }
      this.vx *= 0.95; this.vy *= 0.95;
      if (Math.hypot(this.vx, this.vy) < 1) { this.vx = 0; this.vy = 0; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // AI_014 主体
    this.ai0++;
    if (this.ai0 > 5) {
      this.ai0 = 5;
      // 着地判定用上一帧 vy 是否未变（原版 velocity.Y == 0 即已落地）——落地格 vy 被置 0
      if (this.vy === 0 && this.vx !== 0) {
        this.vx *= 0.97;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
      }
      this.vy += 0.2;
    }
    this.rot += this.vx * 0.1;
    // 粘性（53）：tileCollide=false，与实心重叠 → 粘住
    if (this.projId === 53) {
      const overlap = solidAt(this.x + this.w / 2, this.y + this.h / 2)
        || solidAt(this.x + 1, this.y + 1) || solidAt(this.x + this.w - 2, this.y + this.h - 2);
      if (overlap) { this.vx = 0; this.vy = -0.2; return; }
      this.x += this.vx; this.y += this.vy;
      return;
    }
    // 移动 + 碰撞反弹（反弹表 cs:18261-18333）
    const lastVx = this.vx, lastVy = this.vy;
    let nx = this.x + this.vx, ny = this.y + this.vy;
    let hitX = false, hitY = false;
    if (solidAt(nx + this.w / 2, this.y + this.h / 2) || solidAt(nx + this.w / 2, this.y + 1)) { hitX = true; nx = this.x; }
    if (solidAt(nx + this.w / 2, ny + this.h) || solidAt(nx + 1, ny + this.h) || solidAt(nx + this.w - 1, ny + this.h)) { hitY = true; ny = this.y; }
    if (hitX || hitY) {
      if (this.projId === 870) {
        // 妖精首次反弹：全反射进入 170 阶段（cs:18270-18276）
        this.vx = -lastVx; this.vy = -lastVy;
        this.fairy = true;
        this.fairyT = 0;
        this.rot = 0;
        return;
      }
      if (this.projId === 50) {
        if (hitX) this.vx = lastVx * -0.2;
        if (hitY) this.vy = lastVy > 1.5 ? lastVy * -0.2 : 0;
      } else if (this.projId >= 1089) {
        // 彩虹：近全反射、最低 ±1 保底（cs:18279-18299）
        if (hitX) this.vx = Math.abs(this.vx - lastVx) < 1 ? (lastVx < 0 ? -1 : 1) : -lastVx * 0.99;
        if (hitY) this.vy = -lastVy * 0.99;
      } else {
        // 473 矿工 / 515 弹力（默认档，cs:18314-18327）
        if (hitX) this.vx = lastVx * -0.5;
        if (hitY) this.vy = lastVy > 1 ? lastVy * -0.5 : 0;
      }
    }
    this.x = nx; this.y = ny;
  }
}

// ================= 净化粉/邪恶粉云（proj 10/11/463，aiStyle 6，cs:22399-22533） =================

/** 粉末云 1:1（SetDefaults cs:637-662：64×64 命中盒、tileCollide=false、penetrate=-1、
 *  alpha=255 本体不可见——视觉全靠尘粒；AI_006 cs:22399-22533：速度 ×0.95 衰减、
 *  寿命 180 tick、首 tick 30 粒尘、每 tick 命中盒内逐格 Convert + Damage_TryUsingPowders
 *  （:13646）NPC 转化。tile/NPC 实效经 GameHooks.applyPowder 回调——实体层不触
 *  World/实体桶，与 cutTile/breakTile 同构） */
export class PowderProj extends Entity {
  w = 64; h = 64;
  projId: number;
  dead = false;
  private t = 0;
  private dusted = false;

  constructor(x: number, y: number, vx: number, vy: number, projId: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.projId = projId;
  }

  draw(): void { /* 原版 alpha=255：本体不绘制（cs:643），尘粒即全部视觉 */ }

  fixedUpdate(_dt: number, game: GameHooks): void {
    this.t++;
    if (this.t >= 180) { this.dead = true; return; } // ai[0]==180 → Kill（cs:22406）
    this.vx *= 0.95; this.vy *= 0.95;                // cs:22403
    this.x += this.vx;
    this.y += this.vy;
    if (!this.dusted) {
      // 首帧尘团（cs:22411-22452：30 粒，dust = 10+type → 净化 20 / 邪恶 21 / 猩红 231）
      this.dusted = true;
      const color = this.projId === 10 ? '#DCE8E2' : this.projId === 11 ? '#B070D0' : '#D06070';
      game.spawnParticles(this.cx, this.cy, color, 30, 1.6, { life: 45, damp: 0.94, size: 2 });
    }
    game.applyPowder?.(this.projId, this.x, this.y, this.w, this.h);
  }
}

// ================= Torch God 火把弹幕（proj 949，AI_184 cs:40100） =================

/** 直线飞行火把：射程(rangePx)耗尽前穿墙，之后撞块即毁；命中玩家 20 伤。
 *  ai0=尘色/ai1=射程——尘迹省略（粒子钩子未接），伤害/碰撞 1:1 */
export class TorchGodProj extends Entity {
  w = 4; h = 4;
  vx: number; vy: number;
  damage = 20;
  projId = 949;
  dead = false;
  private rangeLeft: number;
  private tileCollide = false;

  constructor(x: number, y: number, vx: number, vy: number, rangePx: number) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.rangeLeft = rangePx;
  }

  draw(r: Renderer, cam: Camera): void {
    drawProj(r, cam, this, 949, Math.atan2(this.vy, this.vx) + Math.PI / 2, '#FFB060');
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // ai[1] -= velocity.Length()（:40112-40119）：射程内 tileCollide=false
    this.rangeLeft -= Math.hypot(this.vx, this.vy);
    if (this.rangeLeft <= 0) this.tileCollide = true;
    const nx = this.x + this.vx, ny = this.y + this.vy;
    if (this.tileCollide) {
      const tx = Math.floor((nx + this.w / 2) / TILE), ty = Math.floor((ny + this.h / 2) / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.dead = true; return; }
    }
    // 命中玩家（无敌帧由 Player.damage 侧处理）
    const p = game.player;
    if (nx < p.x + p.w && nx + this.w > p.x && ny < p.y + p.h && ny + this.h > p.y) {
      p.damage(this.damage, Math.sign(p.cx - (nx + this.w / 2)) || 1, 0, game as never);
      this.dead = true;
      return;
    }
    this.x = nx; this.y = ny;
  }
}

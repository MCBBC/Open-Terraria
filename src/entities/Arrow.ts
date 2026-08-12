// 箭矢/通用直飞·抛物线投射物（原版 Projectile type 1/2、aiStyle 1/2 主干，Projectile.cs:546-566 + AI_001/AI_002）：
// 重力 0.3/tick（aiStyle1/2 通用常量；直飞弹传 0）、timeLeft 1200、旋转 atan2(vy,vx)+π/2（AI_001 尾部 L54877）、
// 原版贴图 Projectile_N.png；命中敌人伤害/击退/暴击（穿透>1 时同敌免疫防连击）；
// 命中 tileCut 砍草/碎罐（Projectile.CutTiles）；命中实心块 1/3 概率回收掉落。
import { Entity } from './Entity';
import { hitCritters, hitPlayer, playEnemyHitSound, statusPlayer, tryReflectProjectile } from './projTargets';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版投射物贴图懒加载（Projectile_1.png = 木箭、Projectile_2.png = 燃烧箭，泛用所有 id） */
const spriteCache = new Map<number, HTMLImageElement>();
export function projSprite(projId: number): HTMLImageElement | null {
  let img = spriteCache.get(projId);
  if (img !== undefined) return img ?? null;
  if (typeof Image === 'undefined') return null;
  img = new Image();
  img.src = `sprites/vanilla/Projectile_${projId}.png`;
  spriteCache.set(projId, img);
  return img;
}

/** Main.projFrames（Main.cs:8392 起全 275 条非 1 帧赋值，tools 内联提取）：
 *  未列入的恒 1 帧。投射物贴图是【竖向多帧行】——帧高 = 图高/帧数，
 *  整图绘制会把多帧压成胶片条（史莱姆随从 266 曾 12 帧压成一坨） */
import projFramesJson from '../data/vanilla-projframes.json';
import { projectileData } from '../data/vanillaProjectiles';
const PROJ_FRAMES = projFramesJson as Record<string, number>;
export function projFrameCount(projId: number): number {
  return PROJ_FRAMES[String(projId)] ?? 1;
}

/** 单帧裁切缓存（id+帧号 → canvas），多帧行按帧高切片 */
const frameCache = new Map<string, HTMLCanvasElement>();
export function projFrameImg(projId: number, frameIdx: number): HTMLCanvasElement | null {
  const img = projSprite(projId);
  if (!img || !img.complete || img.naturalWidth === 0) return null;
  const frames = projFrameCount(projId);
  const idx = Math.max(0, Math.min(frames - 1, frameIdx));
  const fh = img.naturalHeight / frames;
  if (!Number.isFinite(fh) || fh < 1) return null;
  const key = `${projId}|${idx}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = Math.round(fh);
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, Math.round(idx * fh), img.naturalWidth, Math.round(fh), 0, 0, c.width, c.height);
  if (frameCache.size > 2048) frameCache.clear();
  frameCache.set(key, c);
  return c;
}

export interface ArrowOpts {
  /** 重力/tick（aiStyle1/2 = 0.3；直飞魔法弹传 0）。默认 0.3 */
  grav?: number;
  /** 原版 timeLeft（Projectile.cs:554 默认 1200） */
  life?: number;
  /** 穿透次数（原版 penetrate：手里剑 4、箭 1；-1 视作 1） */
  pierce?: number;
  /** 敌对弹（原版 Projectile.hostile，Damage_EVP :13708 门禁）：
   *  Boss/敌怪发射的弹传 true → 命中玩家结算伤害；玩家武器弹默认 false 不伤玩家。 */
  hostile?: boolean;
  /** aiStyle 14 弹跳弹（希腊火/装饰球等月事件弹幕，Projectile.cs 碰撞反弹
   *  cs:18314-18327 档）：撞实心块法向反弹 ×0.5 衰减而非消亡。 */
  bounce?: boolean;
}

export class Arrow extends Entity {
  w = 10; h = 10; // 原版 SetDefaults type 1：width/height = 10
  vx: number;
  vy: number;
  damage: number;
  knockback: number;
  /** 原版投射物类型（1=木箭 2=燃烧箭，PickAmmo projToShoot = ammo.shoot） */
  projId: number;
  /** 回收掉落的 item key（null = 不回收，如燃烧箭） */
  dropKey: string | null;
  grav: number;
  life: number;
  pierce: number;
  /** 敌对弹（原版 Projectile.hostile）：命中玩家结算（Damage_EVP 语义） */
  hostile: boolean;
  /** 随从/哨兵射出的弹（ProjectileID.Sets.MinionShot/SentryShot 语义：吃鞭 tag） */
  whipTagShot = false;
  /** 命中施加 OnFire 300t（1106 火舌 :11002-11004） */
  ignite = false;
  /** 星云套 booster 回调（StrikeNPC :12892-12905：魔法弹命中 → Game 判定掉落） */
  nebulaCb: (() => void) | null = null;
  /** aiStyle 14 弹跳：撞块反弹不消亡 */
  bounce: boolean;
  /** 已反射（原版 Projectile.reflected：反射源命中后置位，防重复反射；
   *  反射后弹体转 hostile——不再入下方敌怪判定，改走 hitPlayer 伤玩家） */
  reflected = false;
  /** 穿透投射物的同敌免疫表（敌人 id 集合） */
  private hitSet = new Set<number>();
  dead = false;

  constructor(x: number, y: number, vx: number, vy: number, damage: number,
    knockback: number, projId = 1, dropKey: string | null = null, opts?: ArrowOpts) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    this.dropKey = dropKey;
    this.grav = opts?.grav ?? 0.3;
    this.life = opts?.life ?? 1200;
    this.pierce = opts?.pierce ?? 1;
    this.hostile = opts?.hostile ?? false;
    this.bounce = opts?.bounce ?? false;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标——
    // 曾双变换把箭甩出屏幕,表现为"箭隐形但能命中")
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const ang = Math.atan2(this.vy, this.vx);
    const img = projSprite(this.projId);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(ang + Math.PI / 2); // 原版贴图纵向：rotation = atan2+π/2（AI_001 L54877）
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -this.w / 2, -this.w / 2, this.w, this.w * (img.naturalHeight / img.naturalWidth));
    } else {
      // 贴图未就绪：短线兜底
      ctx.strokeStyle = this.projId === 2 ? '#FFB060' : '#D8C8A0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -Math.min(14, Math.hypot(this.vx, this.vy) * 1.4));
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 统一消亡出口（Projectile.Kill 语义钩子）：碎镜 1085 近身 150px 坏运等
   *  按弹型分发由 Game 侧 onProjectileDeath 消费 */
  private killNow(game: GameHooks): void {
    this.dead = true;
    game.onProjectileDeath?.(this.projId, this.x, this.y, this.w, this.h);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    if (--this.life <= 0) { this.killNow(game); return; }
    const world = game.world;
    // aiStyle 1/2 通用重力（原版箭 0.3/tick 抛物线；直飞弹 grav=0）
    if (this.grav !== 0) this.vy = Math.min(this.vy + this.grav, 16);
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (!world.store.inBounds(tx, ty)) { this.killNow(game); return; }
    const tileType = world.store.get(tx, ty);
    if (tileType !== 0) {
      // 可砍物（杂草/瓦罐）：Projectile.CutTiles 语义——弹幕扫过即砍
      game.cutTile(tx, ty);
      // 阻挡判定只看【实心】(Main.tileSolid 语义):树干/火把/平台等非实心格
      // 箭直接穿过(此前 tileType!==0 一刀切,箭会被树挡住——树 solid:false)
      if (!world.store.isSolid(tx, ty)) return;
      // aiStyle 14 弹跳弹（希腊火 326-328 / 装饰球 346）：撞块法向反弹不消亡
      if (this.bounce && this.bounceOff(game)) return;
      // 实心块：1/3 概率回收掉落（原版箭 Kill 的掉落），然后消失
      if (this.dropKey && Math.random() < 1 / 3) game.spawnDrop(this.x, this.y, this.dropKey, 1);
      this.killNow(game);
      return;
    }
    // 敌对弹命中玩家（原版 Projectile.Damage_EVP :13706-13830）：不消耗弹体，
    // Player.damage 自带 iframes 去重（= 原版 player.immune 门禁）；
    // 实际造成伤害才走 StatusPlayer 的 debuff 授予（:13798-13800）
    if (this.hostile && hitPlayer(this, game, this.damage)) statusPlayer(game, this.projId);
    // 反射后的弹体 friendly 已翻（原版 Damage NPC 需 friendly 门禁，小动物也是 NPC）
    // ——不再伤小动物/敌怪，只走上方 hitPlayer 回打发射者
    if (this.reflected) return;
    // 小动物:一击致死并消耗弹体(原版小动物是 NPC;近战挥砍同语义)
    if (hitCritters(this, game)) { this.killNow(game); return; }
    // 命中敌人（原版 penetrate：箭 1 射中即停；手里剑 4 穿 4 敌，同敌免疫防连击）
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; id: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
      if (e.dead) continue;
      if (this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y) {
        // 反射源（419 旋刃冲刺等 reflectsProjectiles 置标）：命中前先走反射
        // （原版 Projectile.cs:12050-12060，反射即终止本帧命中迭代 keepIterating=false）
        if (tryReflectProjectile(this, this.projId, e, game)) {
          this.pierce = 1;            // 原版 penetrate=1（NPC.cs:67058）
          this.hitSet.clear();        // 转敌对后命中表作废
          return;
        }
        if (this.hitSet.has(e.id)) continue; // 穿透弹已命中过此敌
        // 暴击：玩家远程基础 4%（原版 ranged 初始 4）。
        // ★鞭 tag（WhipTagEffect.CanRunHitEffects :73-84：MinionShot/SentryShot 弹幕吃
        //   tag——随从/哨兵射出的箭 whipTagShot 置标时 +tagDmg，TagCrit 可暴击）
        let dmg = this.damage;
        let crit = Math.random() < 0.04;
        if (this.whipTagShot) {
          const en2 = e as unknown as { whipTagT?: number; whipTagDmg?: number; whipTagCrit?: number };
          if (en2.whipTagT && en2.whipTagT > 0) {
            dmg += (en2.whipTagDmg ?? 0);
            if (Math.random() * 100 < (en2.whipTagCrit ?? 0)) crit = true;
          }
        }
        if (crit) dmg *= 2;
        if (this.ignite) {
          const en3 = e as unknown as { onFireT?: number };
          en3.onFireT = Math.max(en3.onFireT ?? 0, 5); // AddBuff(24,300)=5s
        }
        if (this.nebulaCb) this.nebulaCb(); // 星云 booster（:12892-12905，伤害>0 门已过）
        playEnemyHitSound(game, e);
        e.hurt(dmg, Math.sign(this.vx) * this.knockback, 0, game);
        game.addDamageNumber(this.x, this.y, Math.round(dmg), crit, crit ? '#FF8040' : '#FFD060');
        this.hitSet.add(e.id);
        // ---- 吸血链（Projectile.cs:12877-12892 on-hit 段）----
        // 吸血鬼飞刀 304 → vampireHeal（:12879-12882，!moonLeech 门）；
        // 魔法弹 + 幽灵套 ghostHeal → ghostHeal（:12883-12888，canGhostHeal 全 true
        // 近似——雕像产怪 flag 未实装）。ghostHurt（幽灵伤害头 156）未接，登记。
        // numHits = 含本次的命中数（原版 StrikeNPC 先自增，hitSet.size 此时已含本敌）
        if (this.projId === 304) {
          game.applyLifeSteal?.('vampire', Math.round(dmg), this.hitSet.size, this.x, this.y);
        } else if (projectileData(this.projId)?.magic) {
          game.applyLifeSteal?.('ghost', Math.round(dmg), this.hitSet.size, this.x, this.y, true);
        }
        if (--this.pierce <= 0) { this.killNow(game); return; }
      }
    }
  }

  /** aiStyle 14 撞块反弹（Projectile.cs:18314-18327 默认档：法向 ×-0.5，低速归零）。
   *  逐轴回退探测穿透轴并反弹；两轴均无法脱困（嵌入过深）则返回 false 交还消亡。 */
  private bounceOff(game: GameHooks): boolean {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const t0 = Math.floor(px / TILE), t1 = Math.floor(py / TILE);
      return st.inBounds(t0, t1) && st.isSolid(t0, t1);
    };
    let bounced = false;
    // X 轴：回退一步脱离实心 → 穿透轴是 X，反弹并退回
    if (!solidAt(this.x + this.w / 2 - this.vx, this.y + this.h / 2)) {
      this.x -= this.vx;
      this.vx *= -0.5;
      bounced = true;
    }
    if (!solidAt(this.x + this.w / 2, this.y + this.h / 2 - this.vy)) {
      this.y -= this.vy;
      this.vy = this.vy > 1 ? -this.vy * 0.5 : 0;
      bounced = true;
    }
    return bounced;
  }
}

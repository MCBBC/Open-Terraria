// 召唤物实体（R6）：随从（飞行/地面通用 AI 近似）与哨兵（定点炮台）。
// 原版各随从 aiStyle（62/66/26/121/156/164/197…）行为高度定制，本实体按三大类
// 近似（数值=武器 combat 表；上限/驱逐/召回语义取 Player.maxMinions 链）：
//   flying：悬停玩家侧后环形槽位 → 锁定最近敌 ≤700px 俯冲突进（接触伤害+同敌冷却）
//           → >1300px 瞬移回玩家（原版 minion 回收语义）
//   ground ：重力+碰撞，地面追击最近敌，接触伤害
//   sentry ：定点（施法点），每 60t 朝最近敌 ≤600px 射一弹（Arrow 复用）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Arrow, projFrameImg, projFrameCount } from './Arrow';

/** 爆炸烈焰塔三档（3818/3819/3820 → proj 663/665/667，AI_130）：帧 0 待机、
 *  帧 1-6 开火动画、第 12t 出火球 668 */
const FLAMEBURST_TOWER = new Set([663, 665, 667]);
/** 弩车三档（AI_134 :65584）：帧 0 待机、帧 1-5 开火（每 5t）、第 12t 出弩箭 680
 *  （速 16，T2 21）、25t 结束、冷却 GetBallistraShotDelay=160 */
const BALLISTA_TOWER = new Set([677, 678, 679]);
/** 闪电光环三档（AI_137 :65910）：非射击——光环场伤害（宽 ≤999 扫描增长，
 *  localNPCHitCooldown=3）；帧 6 张连续循环 */
const AURA_TOWER = new Set([688, 689, 690]);
/** 爆炸机关三档（AI_138 :66059）：帧 4 张每 12t 连续循环；触发检测每 3t——
 *  中心上方 48px 处 144×144 盒内有敌 → 原地爆炸（proj 694/695/696 等价 AoE），
 *  冷却 GetExplosiveTrapCooldown=90 */
const TRAP_TOWER = new Set([691, 692, 693]);
/** 随从帧循环表（源码提取，Projectile.cs 各 AI 内 frameCounter 规则）：
 *  [每帧 tick, 循环帧数, 攻击帧偏移]。375 小鬼攻击中 +4（ai[1]<24 → 真攻击帧）；
 *  未列入的家族（758 吸血蛙 24 帧/951 雪怪 12 帧/1022 蘑菇 16 帧/1093 猫 28 帧/
 *  191 矮人 18 帧/393 海盗 15 帧/864 刃 2 帧/946 棱镜 1 帧）帧语义复杂或单帧，
 *  走 age/8 匀速循环兜底 */
const MINION_FRAMES: Record<number, [number, number, number]> = {
  373: [2, 3, 0],   // 黄蜂：fc>1 → frame++，cap 2
  375: [5, 4, 4],   // 小鬼：fc/5 帧 0-3，攻击中 +4
  407: [2, 6, 0],   // 蜘蛛：fc/2，6 帧循环
  423: [3, 4, 0],  613: [3, 4, 0], // 暴风雨/星尘细胞
  266: [5, 8, 0],   // 史莱姆：fc>4 → frame++，frame≥8 → 0
  317: [5, 4, 0],   // 乌鸦：fc≥4 → frame++，frame>3 → 0
  387: [4, 3, 0],   // 魔眼：fc>3 → frame++，cap 2
  533: [2, 3, 0],   // 致命球：fc>1 → frame++，cap 2
  755: [6, 5, 0],   // 血红杖：fc≥6 循环 5 帧
  759: [6, 4, 0],   // 雀杖：fc≥6，cap projFrames-1=4
  831: [4, 6, 0],   // 沙漠虎：fc≥4，frame≥6 → 0
  970: [4, 6, 0],   // 阿比盖尔：fc≥4，frame≥6 → 0
  1025: [8, 4, 0],  // 藤壶：慢循环
};

/** 敌人最小形状（鸭子类型，避免与 Enemy 循环依赖） */
interface EnemyLike {
  cx: number; cy: number; x: number; y: number; w: number; h: number; id: number;
  dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
}

/** 接触伤害的每敌冷却表（原版 npc.immune[owner]≈10t） */
export class MinionHitCd {
  private map = new Map<number, number>();
  ready(id: number, cd: number): boolean {
    const t = this.map.get(id) ?? 0;
    if (t > 0) { this.map.set(id, t - 1); return false; }
    this.map.set(id, cd);
    return true;
  }
}

export class MinionProj extends Entity {
  w = 16; h = 16;
  dead = false;
  damage: number;
  knockback: number;
  projId: number;
  /** true=哨兵（定点炮台，独立于随从上限） */
  sentry: boolean;
  /** 哨兵剩余寿命（t；随从不耗） */
  life: number;
  /** 同列槽位序（多随从环形悬停错位） */
  slot: number;
  private ownerRef: () => Player | null;
  private hitCd = new MinionHitCd();
  private shootCd = 0;
  /** 地面型重力 */
  private ground: boolean;
  onGround = false;
  /** 存活 tick（多帧贴图动画驱动） */
  age = 0;
  /** 哨兵开火状态机（AI_130）：0=待机 1=开火动画中 */
  sFire = 0;
  sFireT = 0;
  sCool = 0;
  /** 朝向（哨兵 spriteDirection / 随从渲染翻转） */
  facing = 1;
  /** 攻击闪光 tick（AI_062 小鬼攻击帧 +4 门：命中后 24t） */
  attackFlash = 0;

  constructor(
    x: number, y: number, projId: number, damage: number, knockback: number,
    sentry: boolean, slot: number, ground: boolean,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y;
    this.projId = projId;
    this.damage = damage;
    this.knockback = knockback;
    this.sentry = sentry;
    this.slot = slot;
    this.ground = ground;
    this.life = sentry ? 60 * 600 : Infinity; // 哨兵 10 分钟（哨兵类默认时限近似）
    this.ownerRef = owner;
  }

  /** 最近敌人（无目标 null）。鞭 tag 优先（原版随从锁定被鞭标记目标：
   *  Projectile.ApplyTag → npc.whipSet/whipTime，随从 TargetSlot 优先取 tag 敌） */
  private nearestEnemy(game: GameHooks, maxRange: number): EnemyLike | null {
    const p = this.ownerRef();
    if (!p) return null;
    let best: EnemyLike | null = null;
    let bestD = maxRange;
    let tagged: EnemyLike | null = null;
    let taggedD = maxRange;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; whipTagT?: number };
      if (!en || en.dead) continue;
      const d = Math.hypot(en.cx - this.cx, en.cy - this.cy);
      if (d < bestD) { bestD = d; best = en; }
      if (en.whipTagT && en.whipTagT > 0 && d < taggedD) { taggedD = d; tagged = en; }
    }
    return tagged ?? best;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    this.age++;
    if (this.attackFlash > 0) this.attackFlash--;
    if (this.sentry) {
      if (--this.life <= 0) { this.dead = true; return; }
      // 落地（AI_130 尾部 :65420：tileCollide=true + velocity.Y += 0.2）
      this.vy = Math.min(this.vy + 0.2, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, 0, this.vy);
      const owner = this.ownerRef();
      // 随从伤害 = 基础 × magic 乘区；荆棘鞭 buff(314) 命中 +10%（Player.minionDamage 系）
      const thorn = (owner as unknown as { whipBuffs?: Record<number, number> })?.whipBuffs?.[314] ? 1.1 : 1;
      const dmgOf = () => Math.max(1, Math.round(this.damage * (owner ? owner.damageMult('magic') : 1) * thorn));
      // 爆炸烈焰塔族（AI_130，Projectile.cs:65194-65450 1:1）：
      // 待机帧 0 → 锁定目标(900px 内)转向 → 开火动画帧 1-6 每 4t（第 12t 从炮口
      // Bottom+(dir*6,-46) 发火球 668）→ 24t 结束回待机并冷却 60t（num8）
      if (FLAMEBURST_TOWER.has(this.projId)) {
        if (this.sFire === 0) {
          const tgt = this.nearestEnemy(game, 900);
          if (tgt && this.sCool <= 0) {
            this.facing = tgt.cx >= this.cx ? 1 : -1; // direction = Sign(指向)（:65386）
            this.sFire = 1; this.sFireT = 0;
          }
          if (this.sCool > 0) this.sCool--;
        } else {
          if (this.sFireT === 12) {
            const tgt = this.nearestEnemy(game, 900);
            const mx = this.cx + this.facing * 6, my = this.y + this.h - 46; // 炮口（:65316）
            let vx = this.facing * 9, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
              vx = ((tgt.cx - mx) / d) * 9; vy = ((tgt.cy - my) / d) * 9;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              new Arrow(mx - 5, my - 5, vx, vy, dmgOf(), this.knockback, 668, null, { grav: 0.2 }),
              'projectiles');
          }
          if (++this.sFireT >= 24) { this.sFire = 0; this.sCool = 60; } // num6*num7=24、num8=60
        }
        return;
      }
      // 弩车族（AI_134）：帧 0 待机 → 帧表 1-5（每 5t）→ 第 12t 弩箭 680（速 16）
      // → 25t 结束 → 冷却 160（GetBallistraShotDelay）
      if (BALLISTA_TOWER.has(this.projId)) {
        if (this.sFire === 0) {
          const tgt = this.nearestEnemy(game, 900);
          if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
          if (tgt && this.sCool <= 0) { this.sFire = 1; this.sFireT = 0; }
          if (this.sCool > 0) this.sCool--;
        } else {
          if (this.sFireT === 12) {
            const tgt = this.nearestEnemy(game, 900);
            let vx = this.facing * 16, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - (this.y + 20)) || 1;
              vx = ((tgt.cx - this.cx) / d) * 16; vy = ((tgt.cy - (this.y + 20)) / d) * 16;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              new Arrow(this.cx, this.y + 20, vx, vy, dmgOf(), this.knockback, 680, null, { grav: 0 }),
              'projectiles');
          }
          if (++this.sFireT >= 25) { this.sFire = 0; this.sCool = 160; }
        }
        return;
      }
      // 闪电光环族（AI_137）：非射击——每 3t 对塔周 4 格盒内敌人场伤
      // （localNPCHitCooldown=3；宽 999 扫描增长近似为固定 4 格盒）
      if (AURA_TOWER.has(this.projId)) {
        if (--this.sCool <= 0) {
          this.sCool = 3;
          for (const ent of game.enemies()) {
            const en = ent as EnemyLike & { dead: boolean };
            if (en.dead) continue;
            if (Math.abs(en.cx - this.cx) > TILE * 4 || Math.abs(en.cy - this.cy) > TILE * 4) continue;
            if (!this.hitCd.ready(en.id, 3)) continue;
            en.hurt(dmgOf(), 0, 0, game);
          }
        }
        return;
      }
      // 爆炸机关族（AI_138）：每 3t 探测中心上方 48px 的 144×144 盒——有敌即
      // 原地爆炸 AoE（proj 694 等价）+ 粒子 + 冷却 90（GetExplosiveTrapCooldown）
      if (TRAP_TOWER.has(this.projId)) {
        if (--this.sCool <= 0) {
          this.sCool = 3;
          const ecx = this.cx, ecy = this.cy - 48;
          const hit = (game.enemies() as EnemyLike[]).some((en) =>
            !en.dead && Math.abs(en.cx - ecx) < 72 + en.w / 2 && Math.abs(en.cy - ecy) < 72 + en.h / 2);
          if (hit) {
            this.sCool = 90;
            let boom = 0;
            for (const ent of game.enemies()) {
              const en = ent as EnemyLike & { dead: boolean };
              if (en.dead) continue;
              if (Math.abs(en.cx - ecx) < 72 + en.w / 2 && Math.abs(en.cy - ecy) < 72 + en.h / 2) {
                en.hurt(dmgOf(), Math.sign(en.cx - this.cx) * this.knockback, -2, game);
                boom++;
              }
            }
            void boom;
            game.spawnParticles(ecx, ecy, '#FFB040', 18, 4, { life: 36 });
            game.playSfx('explode', 0.8, this.cx, this.cy);
          }
        }
        return;
      }
      // 其余哨兵：定点炮台，60t 一发（兜底近似）
      const tgt = this.nearestEnemy(game, 600);
      if (tgt) {
        this.shootCd--;
        if (this.shootCd <= 0) {
          this.shootCd = 60;
          const ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            new Arrow(this.cx, this.cy, Math.cos(ang) * 6, Math.sin(ang) * 6, dmgOf(), this.knockback, this.projId, null),
            'projectiles');
        }
      }
      return;
    }
    // 随从
    const p = this.ownerRef();
    if (!p) { this.dead = true; return; }
    const tgt = this.nearestEnemy(game, 700);
    // 朝向（AI_062 :62975：velocity.X>0 → spriteDirection=-1；近似取
    // 追敌方向/移动方向的水平符号）
    {
      const dirX = tgt ? Math.sign(tgt.cx - this.cx) : Math.sign(this.vx);
      if (dirX !== 0) this.facing = dirX;
    }
    if (!this.ground) {
      // 飞行：无目标 → 环形槽位悬停玩家侧后；有目标 → 俯冲
      if (tgt) {
        const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 5;
        this.vy = (dy / d) * 5;
      } else {
        const hoverAng = this.slot * Math.PI * 0.5;
        const hx = p.cx - p.facing * 36 + Math.cos(hoverAng) * 22;
        const hy = p.cy - 30 + Math.sin(hoverAng) * 18;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = Math.min(4, d * 0.08);
        this.vx = (dx / d) * spd;
        this.vy = (dy / d) * spd;
      }
      this.x += this.vx;
      this.y += this.vy;
      // 回收（Minion Removal ：>1300px 瞬移回玩家）
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 1300) {
        this.x = p.cx - p.facing * 30;
        this.y = p.cy - 30;
      }
    } else {
      // 地面：重力+碰撞追击
      if (tgt) {
        this.vx += Math.sign(tgt.cx - this.cx) * 0.12;
        this.vx = Math.max(-3.5, Math.min(3.5, this.vx));
        if (this.onGround && tgt.cy < this.cy - 24 && Math.random() < 0.03) this.vy = -5; // 小跳追高
      } else {
        this.vx *= 0.9;
        // 跟随玩家（距离大时小跑）
        const dx = p.cx - this.cx;
        if (Math.abs(dx) > 60) this.vx = Math.max(-2.5, Math.min(2.5, dx * 0.02));
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
    }
    // 接触伤害（同敌 20t 冷却；伤害吃玩家 summon≈magic 乘区；
    // 敌方有鞭 tag → +whipTagDmg，Projectile.ApplyTag 系语义）
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean; whipTagT?: number; whipTagDmg?: number };
      if (en.dead) continue;
      if (!(this.x < en.x + en.w && this.x + this.w > en.x && this.y < en.y + en.h && this.y + this.h > en.y)) continue;
      if (!this.hitCd.ready(en.id, 20)) continue;
      const tag = en.whipTagT && en.whipTagT > 0 ? (en.whipTagDmg ?? 0) : 0;
      const thornM = (p as unknown as { whipBuffs?: Record<number, number> })?.whipBuffs?.[314] ? 1.1 : 1;
      const dmg = Math.max(1, Math.round(this.damage * p.damageMult('magic') * thornM) + tag);
      en.hurt(dmg, Math.sign(en.cx - this.cx) * this.knockback * 0.5, -1, game);
      this.attackFlash = 24; // AI_062 攻击帧门（小鬼 ai[1]<24 → frame+4）
    }
    // 玩家死亡/过远不消失（原版随从持续到上限驱逐或卸装）——仅跟随
    void TILE;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    // 世界坐标绘制（Renderer 实体循环在世界变换内）——投射物贴图懒加载通道同 Arrow。
    // 原版投射物贴图是竖向多帧行（projFrames 表）：按帧高切片，1:1 像素尺寸。
    // 爆炸烈焰塔走 AI_130 帧状态机（待机帧 0 / 开火帧 1-6 每 4t），其余哨兵/随从
    // age/8 匀速循环；哨兵按 facing 翻转（原版 spriteDirection）
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const frames = projFrameCount(this.projId);
    let frame: number;
    if (this.sentry && FLAMEBURST_TOWER.has(this.projId)) {
      frame = this.sFire === 1 ? 1 + Math.floor(this.sFireT / 4) : 0;
    } else if (this.sentry && BALLISTA_TOWER.has(this.projId)) {
      frame = this.sFire === 1 ? 1 + Math.floor(this.sFireT / 5) : 0;
    } else if (this.sentry && TRAP_TOWER.has(this.projId)) {
      frame = Math.floor(this.age / 12) % frames; // AI_138 frameCounter 12t 连续循环
    } else if (MINION_FRAMES[this.projId]) {
      // 帧表族（源码各 AI 提取）：每帧 tick 循环帧表；
      // 小鬼攻击中（attackFlash>0）frame += 4（ai[1]<24 → 帧偏移，真攻击帧）
      const [tickPer, count, atkOff] = MINION_FRAMES[this.projId];
      frame = Math.floor(this.age / tickPer) % count;
      if (atkOff && this.attackFlash > 0) frame += atkOff;
    } else {
      frame = frames > 1 ? Math.floor(this.age / 8) % frames : 0;
    }
    const img = projFrameImg(this.projId, frame);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.imageSmoothingEnabled = false;
    if (this.facing < 0) ctx.scale(-1, 1); // spriteDirection 翻转（随从+哨兵通用）
    if (img) {
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      // 兜底：召唤符记色块（哨兵紫 / 随从金）——贴图缺失或懒加载未就绪
      ctx.fillStyle = this.sentry ? '#B080FF' : '#FFD060';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(-8, -8, 16, 16);
    }
    ctx.restore();
  }
}

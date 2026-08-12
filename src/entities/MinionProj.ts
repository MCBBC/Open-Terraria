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
import { canHit } from '../physics/LineOfSight';
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

/** 远程射击随从表（Projectile.cs AI_062/AI_026/aiStyle66 射击分支提取）：
 *  shot=射出弹幕 speed=弹速 cd=冷却 t(源码 ai[1] 递增率折算：373 rand(1,4)/t>90≈36；
 *  375/407/423/613 +1~2/t 折算) range=射击门距 dmgMul=伤害倍率 jitter=瞄准随机抖动 px。
 *  373 黄蜂→374 毒刺(:63116 sp10)；375 小鬼→376 火球(sp11)；
 *  407 风暴(鲨鱼龙卷)→408(sp20)；423 Xeno UFO→433 光束(sp4,≤400px 门,:63136)；
 *  613 星尘细胞→614(sp14,≤500px 门)；
 *  191-194 俾格米→195 掷矛(AI_026 :58795,sp11,CD30,射程800,抖动±20)；
 *  387 双子激光眼→389(:28982 sp8 ×1.15 伤,CD~45,需视线)；
 *  1094 Foxparks→1097 火球(:58815 sp11 CD42 无抖动) */
const MINION_SHOOT: Record<number, { shot: number; speed: number; cd: number; range: number; dmgMul?: number; jitter?: number; grav?: number; life?: number }> = {
  373: { shot: 374, speed: 10, cd: 36, range: 1000 },
  375: { shot: 376, speed: 11, cd: 68, range: 1000, life: 100 },  // 火球 timeLeft=100
  407: { shot: 408, speed: 20, cd: 30, range: 1000 },
  423: { shot: 433, speed: 4, cd: 24, range: 400 },
  613: { shot: 614, speed: 14, cd: 36, range: 500 },
  191: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3 }, // 掷矛抛物线(aiStyle 1)
  192: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3 },
  193: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3 },
  194: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3 },
  387: { shot: 389, speed: 8, cd: 45, range: 1000, dmgMul: 1.15 },
  1094: { shot: 1097, speed: 11, cd: 42, range: 800 },
};

/** 其他哨兵射击表（aiStyle 53 :27300 / aiStyle 123 :33990 提取；射程门 1000）：
 *  308 冰九头蛇→309 冰弹 sp9 CD60（炮口 +24*facing）；377 蜘蛛皇后→378 蛛卵 sp9 CD60；
 *  966 猎犬→967 sp12.5 CD90（Center-16Y）；641 月门→642 传送门弹 CD30（10t 蓄+20t 冷）；
 *  643 彩虹水晶→644×3 目标区随机落点 CD50（:34000 三连，距离越远散布越大） */
const SENTRY_SHOOT: Record<number, { shot: number; speed: number; cd: number; volley?: number }> = {
  308: { shot: 309, speed: 9, cd: 60 },
  377: { shot: 378, speed: 9, cd: 60 },
  966: { shot: 967, speed: 12.5, cd: 90 },
  641: { shot: 642, speed: 9, cd: 30 },
  643: { shot: 644, speed: 0, cd: 50, volley: 3 },
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
  hitCd = new MinionHitCd(); // dragon 全链共用实例
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
  /** 不占随从槽位（沙漠虎/阿比盖尔本体、龙身体段、星尘守护者——原版 minionSlots=0/不统计） */
  noSlot = false;
  /** 龙链父段引用（626/627/628 跟随前段） */
  parentRef: (() => MinionProj | null) | null = null;
  /** 虎/守护者冲刺状态 */
  private dashT = 0;
  /** 家族一次性初始化（龙链生成） */
  private spawned = false;
  /** 渲染旋转（龙链：段朝向 = 指向父段 +PI/2，同原版 rotation=velocity.ToRotation()+PI/2） */
  rot = 0;
  /** Foxparks 5664 手持喷火通道（AI_026 ai[0]>=1000：每 4t 发 1106，Game 每帧置 true+瞄准） */
  foxChannel = false;
  foxAimX = 0; foxAimY = 0;
  private foxT = 0;
  private pounceCd = 0;

  // ---- 旗舰家族分支（行号见各方法注释；均在通用运动前 return）----

  /** 星尘龙头（aiStyle 121 :40138-40403）：加速追敌（acc 0.4/0.6/0.8 限速 30，穿墙穿敌）
   *  / 跟随玩家（限速 15，>2000px 传送）；伤害 ×(1+0.23×段数)（:12097）；
   *  首次生成 626→627→628 链（段距 16px），全链共用一张命中表（7t/敌） */
  private dragonHead(game: GameHooks, p: Player, dmg0: number): void {
    const ents = (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities;
    if (!this.spawned) {
      this.spawned = true;
      let parent: MinionProj = this;
      for (const seg of [626, 627, 628]) {
        const m = new MinionProj(this.cx, this.cy, seg, this.damage, this.knockback,
          false, 0, false, this.ownerRef);
        m.noSlot = true;
        const par = parent;
        m.parentRef = () => (par.dead ? null : par);
        m.hitCd = this.hitCd; // 全链共用命中表（localNPCHitCooldown=7 语义）
        ents.add(m, 'projectiles');
        parent = m;
      }
    }
    const segN = this.peerCount(game, 626) + this.peerCount(game, 627);
    const scale = 1 + 0.23 * Math.min(50, segN);
    const tgt = this.nearestEnemy(game, 1000);
    if (tgt) {
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const acc = d < 300 ? 0.8 : d < 600 ? 0.6 : 0.4;
      this.vx += (dx / d) * acc;
      this.vy += (dy / d) * acc;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 30) { this.vx *= 30 / sp; this.vy *= 30 / sp; }
    } else {
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 2000) { this.x = p.cx - 30; this.y = p.cy - 30; this.vx = this.vy = 0; }
      else if (d > 100) {
        const acc = d < 140 ? 0.06 : d < 200 ? 0.12 : 0.2;
        this.vx += (dx / d) * acc;
        this.vy += (dy / d) * acc;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 15) { this.vx *= 15 / sp; this.vy *= 15 / sp; }
      } else {
        this.vx *= 0.96; this.vy *= 0.96; this.vy -= 0.1; // 近距缓刹 + 轻微上浮（:40168）
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    if (Math.hypot(this.vx, this.vy) > 0.5) this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    const fd = tgt ? Math.sign(tgt.cx - this.cx) : Math.sign(this.vx);
    if (fd !== 0) this.facing = fd;
    this.contact(game, dmg0 * scale, 7);
  }

  /** 喷火后攻击锁（Game 通道断开时调：localAI[0]=30 :56155） */
  lockAfterFoxChannel(): void { this.shootCd = Math.max(this.shootCd, 30); }

  /** 再召唤延伸：尾(628)前插入 2 段（626+627）（Player.cs:47906-47963） */
  extendDragon(game: GameHooks): boolean {
    const projs = (game as unknown as { entities: { projectiles: unknown[]; add: (e: unknown, b: string) => void } }).entities;
    const tail = projs.projectiles.find((m) =>
      m instanceof MinionProj && !m.dead && m.projId === 628) as MinionProj | undefined;
    if (!tail || !tail.parentRef) return false;
    const oldParent = tail.parentRef;
    const a = new MinionProj(tail.cx, tail.cy, 626, this.damage, this.knockback, false, 0, false, this.ownerRef);
    const b = new MinionProj(tail.cx, tail.cy, 627, this.damage, this.knockback, false, 0, false, this.ownerRef);
    a.noSlot = b.noSlot = true;
    a.parentRef = oldParent;
    b.parentRef = () => (a.dead ? null : a);
    tail.parentRef = () => (b.dead ? null : b);
    a.hitCd = b.hitCd = this.hitCd;
    projs.add(a, 'projectiles');
    projs.add(b, 'projectiles');
    return true;
  }

  /** 龙身/尾（626/627/628）：无自主速度——纯链式跟随（:40384 pos=父段心-方向×16px） */
  private dragonSegment(game: GameHooks, p: Player, dmg0: number): void {
    void p;
    const par = this.parentRef?.();
    if (!par) { this.dead = true; return; } // 头亡链断
    const dx = this.cx - par.cx, dy = this.cy - par.cy;
    const d = Math.hypot(dx, dy) || 1;
    this.x = par.cx - (dx / d) * 16 - this.w / 2;
    this.y = par.cy - (dy / d) * 16 - this.h / 2;
    this.rot = Math.atan2(par.cy - this.cy, par.cx - this.cx) + Math.PI / 2;
    const segN = this.peerCount(game, 626) + this.peerCount(game, 627);
    this.contact(game, dmg0 * (1 + 0.23 * Math.min(50, segN)), 7);
  }

  /** 计数器（831 虎宝石 / 970 阿比盖尔计数，AI_164 :43946）：头顶环绕吸附、不攻击；
   *  派生唯一本体（档位随同类数），本体 noSlot 不占上限 */
  private counterHover(game: GameHooks, p: Player, dmg0: number): void {
    void dmg0;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles;
    if (this.projId === 831) {
      const gems = this.peerCount(game, 831);
      const want = gems <= 3 ? 833 : gems <= 6 ? 834 : 835; // GetDesiredStormTigerMinionRank
      const tigers = projs.filter((m) => m instanceof MinionProj && !m.dead && m.projId >= 833 && m.projId <= 835);
      if (!tigers.length) this.spawnBody(game, want, this.damage);
      else if (tigers[0].projId !== want) { tigers[0].dead = true; this.spawnBody(game, want, this.damage); }
    } else if (!projs.some((m) => m instanceof MinionProj && !m.dead && m.projId === 963)) {
      this.spawnBody(game, 963, this.damage);
    }
    // AI_164 环绕：每层 4 个、层高 +12px、中心头顶 -61px（MountedCenter-21-40）
    const peers = projs.filter((m) => m instanceof MinionProj && !m.dead && m.projId === this.projId);
    const idx = peers.indexOf(this);
    const layer = Math.floor(idx / 4), inLayer = idx % 4;
    const layerCount = Math.max(1, Math.min(4, peers.length - layer * 4));
    const ang = (this.age * 2 + layer / 8 + inLayer / layerCount) * Math.PI * 2;
    const r = 8 + 12 * layer;
    this.x = p.cx + Math.sin(ang) * r - this.w / 2;
    this.y = p.cy - 61 - Math.cos(ang) * r - this.h / 2;
    this.facing = p.facing;
  }

  /** 沙漠虎本体（833/834/835，minionSlots=0）：地面追击 + 周期冲刺（818 链近似为
   *  直线穿墙冲刺，132 判定盒、冲刺伤 ×(1.5+0.4n)→取 1.5×缩放）；伤害 ×(1+0.4×(宝石数-1)) */
  private tigerBody(game: GameHooks, p: Player, dmg0: number): void {
    const gems = Math.max(1, this.peerCount(game, 831));
    const scale = 1 + 0.4 * (gems - 1);
    const cd = this.projId === 833 ? 360 : this.projId === 834 ? 300 : 240;
    const tgt = this.nearestEnemy(game, 800);
    if (this.dashT > 0) {
      this.dashT--;
      if (tgt) {
        const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
        this.x += ((tgt.cx - this.cx) / d) * 12;
        this.y += ((tgt.cy - this.cy) / d) * 12;
      }
      // 818 冲刺伤 ×(1.5+0.4×(宝石数-1))（:12108）
      this.contact(game, dmg0 * scale * (1.5 + 0.4 * (gems - 1)), 10, 58);
      return;
    }
    if (this.pounceCd > 0) this.pounceCd--;
    if (tgt && this.pounceCd <= 0) { this.dashT = 30; this.pounceCd = cd; return; }
    // 地面追击（AI_067 地面段近似）
    if (tgt) {
      this.vx += Math.sign(tgt.cx - this.cx) * 0.12;
      this.vx = Math.max(-3.5, Math.min(3.5, this.vx));
      if (this.onGround && tgt.cy < this.cy - 24 && Math.random() < 0.05) this.vy = -6;
      this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
    } else {
      this.vx *= 0.9;
      const dx = p.cx - this.cx;
      if (Math.abs(dx) > 60) this.vx = Math.max(-2.5, Math.min(2.5, dx * 0.02));
      this.facing = Math.sign(dx) || p.facing;
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.contact(game, dmg0 * scale, 10);
  }

  /** 阿比盖尔本体 963（aiStyle 62 前段 :62109-63100）：飞行近战，<50px 挥击
   *  （20t/敌）；伤害 ×(1+0.55×(n-1))（肉前档，1.4.5 困难模式 1.3） */
  private abigailBody(game: GameHooks, p: Player, dmg0: number): void {
    const n = Math.max(1, this.peerCount(game, 970));
    const scale = 1 + 0.55 * (n - 1);
    const tgt = this.nearestEnemy(game, 700);
    if (tgt) {
      const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
      const spd = d > 200 ? 7.4 : d > 50 ? 5.4 : 0; // 6+1.4n / 4+1.4n（n=1 档）
      this.vx = (tgt.cx - this.cx) / d * spd;
      this.vy = (tgt.cy - this.cy) / d * spd;
      if (d < 50) this.attackFlash = 24;
      this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
    } else {
      const hx = p.cx - p.facing * 40, hy = p.cy + 40;
      const dx = hx - this.cx, dy = hy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spd = Math.min(4.8, d * 0.08);
      this.vx = (dx / d) * spd;
      this.vy = (dy / d) * spd;
      this.facing = p.facing;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.contact(game, dmg0 * scale, 20);
  }

  /** 星尘守护者 623（套装奖励，Player.cs:16195）：站玩家侧后 -(5+w/2)×dir,-25；
   *  500 内最近敌瞬移冲刺拳击（AI_120 近似） */
  private guardianBody(game: GameHooks, p: Player, dmg0: number): void {
    const tgt = this.nearestEnemy(game, 500);
    if (tgt) {
      const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
      this.vx = (tgt.cx - this.cx) / d * 10;
      this.vy = (tgt.cy - this.cy) / d * 10;
      this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
    } else {
      const hx = p.cx - p.facing * (5 + this.w / 2), hy = p.cy - 25;
      const dx = hx - this.cx, dy = hy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spd = Math.min(10, d * 0.1);
      this.vx = (dx / d) * spd;
      this.vy = (dy / d) * spd;
      this.facing = p.facing;
    }
    this.x += this.vx;
    this.y += this.vy;
    this.contact(game, dmg0, 10);
  }

  /** 接触伤害通用（pad=判定盒外扩，818 冲刺用）；鞭 tag + TagCrit 语义同主线 */
  private contact(game: GameHooks, dmg: number, cd: number, pad = 0): void {
    const add = (e: unknown, b: string) =>
      (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(e, b);
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & {
        dead: boolean; whipTagT?: number; whipTagDmg?: number; whipTagCrit?: number;
        whipTagItem?: number; whipProcT?: number; whipProcItem?: number;
      };
      if (en.dead) continue;
      if (!(this.x - pad < en.x + en.w && this.x + this.w + pad > en.x
        && this.y - pad < en.y + en.h && this.y + this.h + pad > en.y)) continue;
      if (!this.hitCd.ready(en.id, cd)) continue;
      const tag = en.whipTagT && en.whipTagT > 0 ? (en.whipTagDmg ?? 0) : 0;
      const crit = tag > 0 && Math.random() * 100 < (en.whipTagCrit ?? 0);
      let dmg1 = (dmg + tag) * (crit ? 2 : 1);
      // 黑收成 OnTaggedHit（WhipTagEffect_DarkHarvest :9-20：每次 tag 命中 → 916 黑闪电，
      // 伤害 = TagDamage×乘率，armorPen 50）——视觉走 916 弹幕
      if (tag > 0 && en.whipTagItem === 4680) {
        en.hurt(Math.max(1, Math.round(tag)), Math.sign(en.cx - this.cx), -1, game);
        add(new Arrow(en.cx, en.cy, 0, -1, 0, 0, 916, null, { grav: 0, life: 24, pierce: 99 }), 'projectiles');
        game.spawnParticles(en.cx, en.cy, '#7A3AFF', 6, 2.2, { life: 20 });
      }
      // proc 型鞭首跳（TagEffectState：ModifyProcHit→OnProcHit 一次性）：
      //  4912 火鞭 ×2.75 + 918 爆炸（伤×1.75,96 盒）；5476 星陨（×1.33 自上而下）；
      //  5477 花瓣×3（各 40）；5479 星座星（×0.33 若干）；5480 月主弹（20，3 连近似 1 发）
      if (en.whipProcT && en.whipProcT > 0 && en.whipProcItem) {
        const pi = en.whipProcItem;
        en.whipProcT = 0;
        if (pi === 4912) {
          dmg1 *= 2.75; // ProcDamageMultiplier 1.75 → ModifyProcHit 合计 ×2.75
          const ex = Math.max(1, Math.round(dmg * 1.75));
          for (const ent2 of game.enemies()) {
            const en2 = ent2 as EnemyLike & { dead: boolean };
            if (en2.dead || Math.abs(en2.cx - en.cx) > 48 + en2.w / 2 || Math.abs(en2.cy - en.cy) > 48 + en2.h / 2) continue;
            en2.hurt(ex, Math.sign(en2.cx - en.cx) * 2, -2, game);
          }
          game.spawnParticles(en.cx, en.cy, '#FF7A28', 16, 4, { life: 26 });
        } else if (pi === 5476) {
          add(new Arrow(en.cx - 6, en.cy - 280, 0.4, 8, Math.max(1, Math.round(dmg * 1.33)), 2, 1037, null, { grav: 0 }), 'projectiles');
        } else if (pi === 5477) {
          for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            add(new Arrow(en.cx, en.cy, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 40, 2, 1038, null, { grav: 0, life: 120 }), 'projectiles');
          }
        } else if (pi === 5479) {
          for (let i = 0; i < 3; i++) {
            add(new Arrow(en.cx, en.cy - 20 - i * 30, (Math.random() - 0.5) * 2, 3,
              Math.max(1, Math.round(dmg * 0.33)), 1, 1039, null, { grav: 0, life: 240 }), 'projectiles');
          }
        } else if (pi === 5480) {
          add(new Arrow(en.cx, en.cy - 30, (Math.random() - 0.5) * 4, 6, 20, 1, 1045, null, { grav: 0 }), 'projectiles');
        }
      }
      en.hurt(Math.max(1, Math.round(dmg1)), Math.sign(en.cx - this.cx) * this.knockback * 0.5, -1, game);
      this.attackFlash = 24;
    }
  }

  /** 同类计数（计数器/本体伤害档位用：831 宝石数 / 970 阿比盖尔数） */
  private peerCount(game: GameHooks, id: number): number {
    let n = 0;
    for (const e of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
      const m = e as MinionProj;
      if (m instanceof MinionProj && !m.dead && m.projId === id) n++;
    }
    return n;
  }

  /** 生成不占槽实体（计数器派生本体/守护者） */
  private spawnBody(game: GameHooks, projId: number, damage: number): MinionProj {
    const owner = this.ownerRef();
    const m = new MinionProj(this.cx, this.cy, projId, damage, this.knockback,
      false, 0, false, () => owner);
    m.noSlot = true;
    (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(m, 'projectiles');
    return m;
  }

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
    // 右键集火优先（OwnerMinionAttackTargetNPC 模板 :27431：有效且距本随从 <900）
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as never as EnemyLike;
        if (!en.dead && en.id === focus && Math.hypot(en.cx - this.cx, en.cy - this.cy) < 900) return en;
      }
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
      // 随从/哨兵伤害：武器基伤 × summonDamageMult（live 刷新，换装即时生效，
      // Projectile.cs:15368 语义）+ 护甲穿透（对随从弹幕生效 :12068）
      const dmgOf = () => Math.max(1, Math.round(this.damage * (owner ? owner.summonDamageMult : 1))
        + (owner ? owner.equipStats.armorPen : 0));
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
            game.playSfx('dd2Flameburst', 0.9, this.cx, this.cy); // AI_131 :65533（弹幕 localAI[0]==0）
            const mx = this.cx + this.facing * 6, my = this.y + this.h - 46; // 炮口（:65316）
            let vx = this.facing * 9, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
              vx = ((tgt.cx - mx) / d) * 9; vy = ((tgt.cy - my) / d) * 9;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(mx - 5, my - 5, vx, vy, dmgOf(), this.knockback, 668, null, { grav: 0.2 }), { whipTagShot: true }),
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
            game.playSfx('dd2Ballista', 0.9, this.cx, this.cy); // AI_134 :65674（开火帧同弩箭）
            let vx = this.facing * 16, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - (this.y + 20)) || 1;
              vx = ((tgt.cx - this.cx) / d) * 16; vy = ((tgt.cy - (this.y + 20)) / d) * 16;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(this.cx, this.y + 20, vx, vy, dmgOf(), this.knockback, 680, null, { grav: 0 }), { whipTagShot: true }),
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
            // SummonTagDamageMultiplier（ProjectileID.cs:31）：闪电 aura 族 tag 伤减半
            const tagA = (en as { whipTagT?: number; whipTagDmg?: number }).whipTagT ? Math.round(((en as { whipTagDmg?: number }).whipTagDmg ?? 0) * 0.5) : 0;
            en.hurt(dmgOf() + tagA, 0, 0, game);
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
            game.playSfx('dd2Explosive', 0.9); // AI_138 :66104（无位置参数）
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
      // 其他哨兵五族（aiStyle 53/123：冰九头蛇/蜘蛛皇后/猎犬/月门/彩虹水晶）
      const ss = SENTRY_SHOOT[this.projId];
      if (ss) {
        const tgt = this.nearestEnemy(game, 1000);
        if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
        if (tgt && this.sCool <= 0) {
          this.sCool = ss.cd;
          // 炮口（aiStyle 53 :27324：308/377 头部帧偏移≈+24*facing；966 Center-16Y；641 本体中心）
          const mOff = this.projId === 308 || this.projId === 377 ? this.facing * 24 : 0;
          const mx = this.cx + mOff;
          const my = this.projId === 966 ? this.cy - 16 : this.cy - 2;
          if (ss.volley) {
            // 彩虹水晶 643：3 连目标区随机落点（:34005——距离越远散布越大 0.5-1.25×）
            for (let i = 0; i < ss.volley; i++) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
              const spread = 0.1 + 0.65 * Math.max(0, Math.min(1, (800 - Math.min(800, d)) / 600));
              const px = tgt.cx + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              const py = tgt.cy + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              // 644 是原地爆裂弹（零速生成,短时引爆）→ 落点直接 AoE
              for (const ent of game.enemies()) {
                const en = ent as EnemyLike & { dead: boolean };
                if (en.dead) continue;
                if (Math.abs(en.cx - px) < 14 + en.w / 2 && Math.abs(en.cy - py) < 14 + en.h / 2) {
                  en.hurt(dmgOf(), Math.sign(en.cx - px) * this.knockback, -2, game);
                }
              }
              game.spawnParticles(px, py, `hsl(${Math.floor(Math.random() * 360)},90%,65%)`, 8, 2.4, { life: 26 });
            }
          } else {
            const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(mx - 5, my - 5, ((tgt.cx - mx) / d) * ss.speed, ((tgt.cy - my) / d) * ss.speed,
                dmgOf(), this.knockback, ss.shot, null, { grav: 0 }), { whipTagShot: true }),
              'projectiles');
          }
        }
        if (this.sCool > 0) this.sCool--;
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
            Object.assign(new Arrow(this.cx, this.cy, Math.cos(ang) * 6, Math.sin(ang) * 6, dmgOf(), this.knockback, this.projId, null), { whipTagShot: true }),
            'projectiles');
        }
      }
      return;
    }
    // 随从
    const p = this.ownerRef();
    if (!p) { this.dead = true; return; }
    const tgt = this.nearestEnemy(game, MINION_SHOOT[this.projId] ? 1000 : 700);
    // 基础伤害（每 tick 按当前装备 live 重算 = Projectile.cs:15368；+armorPen）
    const dmg0 = Math.max(1, Math.round(this.damage * p.summonDamageMult) + p.equipStats.armorPen);
    // ---- 旗舰家族分发（源码行号见各方法注释；先于通用运动）----
    if (this.projId >= 626 && this.projId <= 628) { this.dragonSegment(game, p, dmg0); return; }
    if (this.projId === 625) { this.dragonHead(game, p, dmg0); return; }
    if (this.projId === 831 || this.projId === 970) { this.counterHover(game, p, dmg0); return; }
    if (this.projId >= 833 && this.projId <= 835) { this.tigerBody(game, p, dmg0); return; }
    if (this.projId === 963) { this.abigailBody(game, p, dmg0); return; }
    if (this.projId === 623) { this.guardianBody(game, p, dmg0); return; }
    // Cool Whip 雪花哨兵 917（buff 312 维持）与 Cobwhip 蜘蛛 1036（buff 365 维持）：
    // 独立索敌 400/环绕，伤害吃 summonDamageMult
    // Foxparks 1094 喷火态（PR:56081-56159：ai[0] 1000-1003 每 4t 一发 1106；
    // 伤 = dmg×0.75(:56133) ×命中 0.85(:12620)；OnFire 300t(:11002)；penetrate 4；
    // 寿命 72t/54t 后不伤——Arrow 无 extraUpdates，速度×3/life÷3 等价换算）
    if (this.projId === 1094 && this.foxChannel) {
      if (++this.foxT % 4 === 1) {
        const flame = new Arrow(this.cx - 3, this.cy - 3, this.foxAimX * 15, this.foxAimY * 15,
          Math.max(1, Math.round(dmg0 * 0.75 * 0.85)), 0, 1106, null,
          { grav: 0, life: 24, pierce: 4 });
        flame.ignite = true; // 命中 OnFire 300t（PR:11002-11004）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(flame, 'projectiles');
      }
      return; // 喷火态跳过常规索敌/移动（position 锚玩家由 Game/悬停链处理近似）
    }
    if (this.projId === 917 || this.projId === 1036) {
      // 生命与玩家 buff 绑定（AI_177 :42468：coolWhipBuff/cobWhipBuff → timeLeft=2 续命）
      if (!p.whipBuffs[this.projId === 917 ? 312 : 365]) { this.dead = true; return; }
      const tgt = this.nearestEnemy(game, 400);
      if (tgt) {
        const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
        this.vx = (tgt.cx - this.cx) / d * 5;
        this.vy = (tgt.cy - this.cy) / d * 5;
        this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
      } else {
        const hx = p.cx - p.facing * 30 + Math.cos(this.age * 0.05 + this.slot) * 24;
        const hy = p.cy - 40 + Math.sin(this.age * 0.05 + this.slot) * 16;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = Math.min(4, d * 0.08);
        this.vx = (dx / d) * spd;
        this.vy = (dy / d) * spd;
        this.facing = p.facing;
      }
      this.x += this.vx;
      this.y += this.vy;
      this.contact(game, dmg0 + 30, 20); // armorPen 30（:8422/:9490）
      return;
    }
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
    // 远程射击（AI_062/AI_026/aiStyle66 射击族：射程门内且冷却好 → 朝目标发射专属弹幕）。
    // 俾格米掷矛带 ±20px 随机抖动（AI_026 :58788 rand(-20,21)/rand(-20,20)）；射击与接触
    // 伤害并存（原版随从移动中也带接触判定）
    const shooter = MINION_SHOOT[this.projId];
    if (tgt && shooter) {
      if (this.shootCd > 0) this.shootCd--;
      else {
        const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
        // 387 双子激光眼需视线（:28982 CanHitLine 门；AI_062 五族无此门）
        if (this.projId === 387 && !canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) return;
        if (d <= shooter.range) {
          this.shootCd = shooter.cd;
          const j = shooter.jitter ?? 0;
          const ax = tgt.cx + (Math.random() * 2 - 1) * j - this.cx;
          const ay = tgt.cy + (Math.random() * 2 - 1) * j - this.cy;
          const al = Math.hypot(ax, ay) || 1;
          const dmg = Math.max(1, Math.round(dmg0 * (shooter.dmgMul ?? 1)));
          const shot = new Arrow(this.cx - 5, this.cy - 5, (ax / al) * shooter.speed, (ay / al) * shooter.speed,
            dmg, this.knockback, shooter.shot, null, { grav: shooter.grav ?? 0, life: shooter.life ?? 1200 });
          shot.whipTagShot = true; // MinionShot 吃鞭 tag（WhipTagEffect.cs:73-84）
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
        }
      }
    }
    // 接触伤害（同敌 20t 冷却；tag + TagCrit 语义见 contact()）
    this.contact(game, dmg0, 20);
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
    if (this.rot !== 0) ctx.rotate(this.rot); // 龙链旋转（rotation=vel 方向+PI/2）
    else if (this.facing < 0) ctx.scale(-1, 1); // spriteDirection 翻转（随从+哨兵通用）
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

// 敌人实体：统一类 + 按 key 分支行为（史莱姆/僵尸/恶魔眼/蝙蝠/克苏鲁之眼及其仆从）
// + 原版 NPC 数据驱动路径（vanillaId）：属性/AI/音效/贴图来自 vanilla-npcs.json（SetDefaults 提取）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { ENEMY_DEFS, EnemyDef } from '../data/enemies';
import { vanillaNpc, vanillaSoundName, vanillaNpcDrops, type VanillaNpc } from '../data/vanillaNpcs';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Dart } from './Dart';
import { avoidWater } from './waterAvoid';
import { RNG } from '../core/rng';

/** 原版 Boss NPC id（EoC 4/世吞 13-15/史莱姆王 50/骷髅王 66/血肉墙 127/双子 125-127 外的旧三王 66,113-115/蜂后 262/克脑 266 等） */
const VANILLA_BOSS_IDS = new Set([4, 13, 14, 15, 50, 66, 113, 114, 115, 127, 134, 135, 136, 222, 262, 266, 370, 398, 625, 636, 657]);

/** 原版路径 key（v_*）的占位 def，fromVanilla 会整体覆写 */
const PLACEHOLDER_DEF: EnemyDef = {
  key: 'v_placeholder', name: '?', hp: 1, damage: 0, knockbackResist: 0.5,
  width: 16, height: 16, mapColor: '#9A8FA0', gore: ['#9A8FA0', '#5E5566', '#C4BACC'],
  hitSound: ['NPC_Hit_1'], killedSound: ['NPC_Killed_1'], drops: [],
};

export class Enemy extends Entity {
  /** 原版 NPC id（数据驱动路径启用时非空） */
  vanillaId: number | null = null;
  vanilla: VanillaNpc | null = null;
  // ---- 蠕虫多段体（AI_006，NPC.cs:18046）：头 aiStyle 6，编号约定 头+1=身 头+2=尾 ----
  /** 链上紧随本段的一段（头 → 身×n → 尾） */
  wormNext: Enemy | null = null;
  /** 本段跟随的前一段（非空 = 本段是身体段，跳过 AI 只做跟随） */
  wormFollow: Enemy | null = null;
  /** 上一 tick 位置（段跟随用：段复制前一段的旧位置 = 经典贪吃蛇链） */
  prevX = 0; prevY = 0;

  /** AI_006 头部（L18645 通用常数 maxSpd=8 accel=0.07；穿墙直行；段链跟随） */
  private wormAI(game: GameHooks, player: Player | null) {
    const maxSpd = 8, accel = 0.07;
    // 朝向：有玩家朝玩家，无玩家缓慢巡游
    let dx: number, dy: number;
    if (player) { dx = player.cx - this.cx; dy = player.cy - this.cy; }
    else { dx = Math.cos(this.aiT * 0.02) * 10; dy = Math.sin(this.aiT * 0.013) * 10; }
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * accel;
    this.vy += (dy / d) * accel;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > maxSpd) { this.vx = (this.vx / spd) * maxSpd; this.vy = (this.vy / spd) * maxSpd; }
    this.facing = this.vx > 0 ? 1 : -1;
    // 蠕虫穿墙：直接位移（原版 noTileCollide）
    this.x += this.vx;
    this.y += this.vy;
    // 段链跟随：每段贴前一段的上一位置
    for (let s = this.wormNext; s; s = s.wormNext) {
      const fx = s.wormFollow!;
      s.x = fx.prevX;
      s.y = fx.prevY;
      s.facing = fx.facing;
    }
  }

  /** 由头生成段链（原版各 worm 的 NewNPC 链，NPC.cs:18174+）：body×n + tail */
  static spawnWormChain(head: Enemy, segCount: number): Enemy[] {
    const segs: Enemy[] = [];
    const bodyId = head.vanillaId! + 1, tailId = head.vanillaId! + 2;
    let prev = head;
    for (let k = 0; k < segCount; k++) {
      const id = k === segCount - 1 ? tailId : bodyId;
      const s = Enemy.fromVanilla(id, head.cx, head.cy);
      if (!s) continue;
      s.wormFollow = prev;
      prev.wormNext = s;
      prev = s;
      segs.push(s);
    }
    return segs;
  }


  /** 用原版数据造怪：属性/碰撞/音效全部来自 SetDefaults 提取值 */
  static fromVanilla(id: number, x: number, y: number): Enemy | null {
    const v = vanillaNpc(id);
    if (!v) return null;
    const e = new Enemy(`v_${id}`, x, y);
    e.vanillaId = id;
    e.vanilla = v;
    const hit = vanillaSoundName(v.HitSound) ?? 'NPC_Hit_1';
    const kill = vanillaSoundName(v.DeathSound) ?? 'NPC_Killed_1';
    const flying = v.noGravity || v.aiStyle === 2 || v.aiStyle === 5 || v.aiStyle === 14;
    e.def = {
      ...e.def,
      name: v.name, hp: v.lifeMax, damage: v.damage, defense: v.defense,
      // 原版 knockBackResist 是"承受击退的比例"（0.5=吃一半）；本仓库语义是
      // "抗性"（hurt(): resist<0.9 才生效，kbx*(1-resist)）→ 换算 1-比例
      knockbackResist: Math.max(0, Math.min(0.89, 1 - (v.knockBackResist ?? 0.5))),
      width: v.width, height: v.height, flying,
      boss: VANILLA_BOSS_IDS.has(id),
      nightOnly: v.aiStyle === 2 || v.aiStyle === 5, underground: false,
      mapColor: '#9A8FA0', gore: ['#9A8FA0', '#5E5566', '#C4BACC'],
      hitSound: [hit], killedSound: [kill], drops: v.critter ? [] : vanillaNpcDrops(id),
      // 小动物：无接触伤害、不夜行
      ...(v.critter ? { damage: 0, nightOnly: false } : {}),
    };
    e.hp = v.lifeMax;
    e.maxHp = v.lifeMax;
    e.w = v.width;
    e.h = v.height;
    e.x = x - e.w / 2;
    e.y = y - e.h / 2;
    return e;
  }

  def: EnemyDef;
  hp: number;
  maxHp: number;
  iframes = 0;
  animT = 0;
  facing = 1;
  aiT = 0;               // 通用 AI 计时
  state = 0;             // 行为状态
  phase = 1;             // Boss 阶段
  target: { x: number; y: number } | null = null;
  squash = 0;            // 史莱姆挤压动画 -1..1
  stuckT = 0;            // 飞行怪卡墙计时（脱困用）
  stuckCd = 0;           // 脱困后的游荡冷却
  jumpStartX = 0;        // 史莱姆本次起跳的 x（落地时判定是否白跳）
  chargesLeft = 0;       // EoC 剩余冲撞次数
  dashing = false;       // EoC 冲撞中（无视地形）
  visAngle = Math.PI;    // EoC 显示角度（平滑追踪移动方向；素材默认朝左）
  spin = 0;              // EoC 变身旋转进度 0..1
  hpBarT = 0;            // 受击后血条显示计时（tick）
  inWater = false;       // 入水检测（溅落声用）

  constructor(public key: string, x: number, y: number) {
    super();
    this.def = ENEMY_DEFS[key] ?? PLACEHOLDER_DEF;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.w = this.def.width;
    this.h = this.def.height;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.prevX = this.x; this.prevY = this.y;
    this.aiT++;
    if (this.iframes > 0) this.iframes--;
    if (this.hpBarT > 0) this.hpBarT--;
    if (this.squash !== 0) this.squash *= 0.85;
    this.animT++;

    const player = (game as unknown as { player: Player }).player;
    const hasPlayer = !!player && !player.dead;

    // ---- 原版数据驱动路径：按 aiStyle 分发到已移植的 AI 家族（分发后落入共享尾段） ----
    // 蠕虫身体段（wormFollow 非空）无 AI：位置由头部 wormAI 沿链驱动，但仍走共享尾段（接触伤害等）
    // 小动物（critter）优先走被动游荡，绝不落入 default 的追击 fallback
    if (this.vanilla && !this.wormFollow && this.vanilla.critter) {
      this.critterWanderAI(game, hasPlayer ? player : null);
    } else if (this.vanilla && !this.wormFollow) {
      const p = hasPlayer ? player : null;
      switch (this.vanilla.aiStyle) {
        case 1: this.slimeAI(game, p); break;                          // AI_001 史莱姆
        case 2: this.floatEyeAI(game, p); break;                        // AI_002 飘浮眼（原版核）
        case 3: this.fighterAI(game, p); break;                        // AI_003 战士族（原版通用核）
        case 5: this.swarmerAI(game, p); break;                         // AI_005 噬魂怪族（原版蜂群核）
        case 6: this.wormAI(game, p); break;                           // AI_006 蠕虫族（头）
        case 8: this.casterAI(game, p); break;                          // AI_008 法师族（传送+弹幕）
        case 14: this.batAI(game, p); break;                            // AI_014 蝙蝠/飞行族（1.4.5.6 原版核）
        case 16: this.swimAI(game, p); break;                           // AI_016 游泳族（鲨鱼/食人鱼）
        case 18: this.jellyfishAI(game, p); break;                      // AI_018 水母族（脉冲游动）
        case 22: this.ghostAI(game, p); break;                          // AI_022 幽灵族（穿墙缓速）
        case 26: this.chargerAI(game, p); break;                        // AI_026 独角兽/冲锋族（原版核）
        case 107: this.chargerAI(game, p, 1); break;                    // AI_107 ImprovedWalkers（0.07/±1.0 walker 档，NPC.145.cs:43153 引擎核同构）
        default: this.zombieAI(game, p); break;                        // 其余家族待逐个移植
      }
    } else switch (this.key) {
      case 'slime_green':
      case 'slime_blue': this.slimeAI(game, hasPlayer ? player : null); break;
      case 'zombie': this.zombieAI(game, hasPlayer ? player : null); break;
      case 'demon_eye':
      case 'cave_bat': this.flyAI(game, hasPlayer ? player : null, 0.09); break;
      case 'servant_of_cthulhu': this.flyAI(game, hasPlayer ? player : null, 0.22); break;
      case 'eye_of_cthulhu': this.eocAI(game, hasPlayer ? player : null); break;
    }

    // 入水溅落声（与主角一致）：音量随与主角距离衰减，Boss 更响
    const eli = game.world.store.liquid[game.world.store.idx(
      Math.floor(this.cx / TILE), Math.floor(this.cy / TILE),
    )];
    const wasWater = this.inWater;
    this.inWater = eli > 80;
    if (this.inWater && !wasWater && hasPlayer) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      const vol = Math.max(0.12, Math.min(1, 1 - d / (TILE * 45))) * (this.def.boss ? 1.2 : 0.9);
      game.playSfx('splash', vol);
    }

    // 接触伤害（带上攻击者引用，供荆棘反伤）。damage=0（小动物等友好生物）不触发——
    // 否则 damagePlayer(0) 仍会击退/闪红，表现为"兔子撞我有攻击性"
    if (hasPlayer && this.aabbOverlaps(player) && this.def.damage > 0) {
      game.damagePlayer(this.def.damage, this.cx, this.cy, this);
    }

    // 白天烧夜间怪（恶魔眼/僵尸在白天消失）
    if ((this.def.nightOnly) && game.world.clock.isDay && !this.def.boss) {
      if (game.world.clock.dayFactor > 0.85) this.dead = true;
    }
    // 距玩家过远清除
    if (hasPlayer) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (!this.def.boss && d > TILE * 90) this.dead = true;
    }
  }

  private groundPhysics(game: GameHooks, jumpV = 0, accel = 0.12, maxSpd = 1, buoyant = false) {
    // 浮力生物（史莱姆）：水中上浮 + 阻尼，漂在水面而不是沉底
    if (buoyant) {
      const st = game.world.store;
      const li = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))];
      if (li > 80) {
        if (this.state === 1) {
          // 跳跃中：弱重力助其跃出水面（浮力阻尼会把起跳速度吃掉导致困在水里）
          this.vy = Math.min(this.vy + GRAVITY * 0.3, MAX_FALL_SPEED);
          moveAndCollide(this, game.world, this.vx, this.vy);
          this.vx *= 0.98;
          return;
        }
        this.vy -= 0.32;
        this.vy *= 0.92;
        this.vx *= 0.95;
        moveAndCollide(this, game.world, this.vx, this.vy);
        return;
      }
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    this.vx = Math.max(-maxSpd, Math.min(maxSpd, this.vx + accel * Math.sign(this.vx || 1) * 0));
    if (jumpV && this.onGround) this.vy = -jumpV;
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.vx *= this.onGround ? 0.8 : 0.98;
  }

  private slimeAI(game: GameHooks, player: Player | null) {
    // 水中漂浮状态：漂在水面时也可蓄力起跳
    const st = game.world.store;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    const surfaced = inWater && Math.abs(this.vy) < 0.8; // 漂在水面附近（准地面）
    // 状态机：0 蓄力 → 1 跳跃
    if (this.state === 0) {
      this.vx *= 0.6;
      if (this.onGround) this.squash = Math.min(1, this.squash + 0.08);
      const canAct = this.onGround || surfaced;
      // 脱困冷却内（stuckCd>0）落地/浮面立刻再跳，不在原地等 50 tick 空转
      // 索敌：受击后（iframes 刚触发过）或玩家贴近 <6 格才追；否则随机方向游荡跳
      const hurt = this.iframes > 0;
      const close = !!player && Math.abs(player.cx - this.cx) < TILE * 6;
      if (canAct && (this.aiT % 50 === 0 || this.stuckCd > 0 || ((hurt || close) && this.aiT > 40))) {
        // 起跳方向：掉头冷却内用当前朝向（不再朝玩家死磕同一堵墙）
        let dir = this.facing;
        if (player && this.stuckCd === 0) {
          const dx = player.cx - this.cx;
          if (Math.abs(dx) > 8) dir = Math.sign(dx);
        }
        this.facing = dir;
        const dist = player ? Math.min(1, Math.abs(player.cx - this.cx) / (TILE * 10)) : 0.4;
        // 前方障碍高度探测（1-2 格）→ 按需起跳力度。
        // 普通跳 vy-4.2 在 GRAVITY=0.36 下脚底只升 24.5px（1.5 格）——
        // 精灵贴图放大 1.25 倍看着跳很高，但碰撞盒过不了 32px 的两格墙
        const fx = Math.floor((this.cx + dir * (this.w / 2 + 2)) / TILE);
        const fy = Math.floor((this.y + this.h - 1) / TILE);
        let obsH = 0;
        for (let k = 0; k < 3; k++) {
          if (st.isSolid(fx, fy - k)) obsH = k + 1; else break;
        }
        const headroom = obsH > 0 && obsH <= 2 && !st.isSolid(fx, fy - obsH) && !st.isSolid(fx, fy - obsH - 1);
        if (headroom) {
          // 障碍跳：1 格 -4.6（脚底升 29px）/ 2 格 -6.0（升 50px），慢速横移保证越过块面
          this.vx = dir * (obsH === 1 ? 1.6 : 1.2);
          this.vy = obsH === 1 ? -4.6 : -6.0;
        } else {
          this.vx = dir * (1.6 + dist * 2.6);
          // 水中起跳加力：跃出水面爬上岸（普通力度会被浮力吃掉困在水里）
          this.vy = inWater ? -(5.6 + dist * 1.6) : -(4.2 + dist * 2.4);
        }
        this.jumpStartX = this.cx;
        this.state = 1;
        this.squash = -0.7;
      }
    } else {
      // 空中转向（与主角空操一致）：跳跃中持续朝面向水平加速——
      // 没有它起跳瞬间 vx 被墙清零后就只剩原地垂直跳，永远出不去
      this.vx = Math.max(-2.6, Math.min(2.6, this.vx + this.facing * 0.12));
      const landed = this.onGround && this.vy >= 0 && this.aiT > 10;
      if (landed || (surfaced && this.aiT > 20)) {
        // 起跳后几乎没位移（被墙弹回）→ 直接记一次失败，快速累计触发翻面
        if (Math.abs(this.cx - this.jumpStartX) < 6) this.stuckT += 10;
        this.state = 0;
        this.aiT = 0;
      }
    }
    this.groundPhysics(game, 0, 0.12, 1, true);
    // 卡墙脱困（水中/陆地通用）：撞墙计数用"缓慢衰减"而非硬清零——
    // 史莱姆是"跳一下撞墙→落回水中漂离"的循环，撞墙帧之间 hitWall 为 false，
    // 硬重置会让跨跳跃的撞墙永远攒不满阈值。累计 24 → 翻面 + 逃亡冷却
    // （水中 240 tick：足够连续多跳横渡水域脱离，否则冷却一到又朝墙对面的玩家折返死磕）
    if (this.stuckCd > 0) this.stuckCd--;
    if (this.hitWall) {
      this.stuckT += 3;
    } else {
      this.stuckT = Math.max(0, this.stuckT - 1);
    }
    if (this.stuckT > 24) {
      this.stuckT = 0;
      this.stuckCd = inWater ? 240 : 90;
      this.facing = -this.facing;
    }
  }

  private zombieAI(game: GameHooks, player: Player | null) {
    // 卡墙脱困：朝玩家走却持续撞墙（高墙跳不过去）→ 掉头往另一侧探索
    if (this.onGround && this.hitWall && player) {
      if (++this.stuckT > 80) {
        this.stuckT = 0;
        this.stuckCd = 90; // 掉头冷却：期间不再朝玩家折返
      }
    } else if (!this.hitWall) {
      this.stuckT = 0;
    }
    if (this.stuckCd > 0) this.stuckCd--;
    let dir = this.facing;
    if (player && this.stuckCd === 0) {
      dir = Math.sign(player.cx - this.cx) || 1;
      // 跳过障碍
      if (this.onGround && this.hitWall) this.vy = -6;
      // 门：会尝试跳，不做开门
    } else if (this.hitWall && this.onGround) {
      dir = -this.facing; // 掉头期间撞墙就反向
    }
    this.facing = dir;
    this.vx += dir * 0.08;
    this.vx = Math.max(-0.9, Math.min(0.9, this.vx));
    this.groundPhysics(game, 0);
  }

  /** AI_003_Fighters 通用核（NPC.cs:24559-24733，剥离 per-type 特例）：
   *  前方 tile 探测 + 四级跳（2 格墙 -8 / 1 格墙 -7 / 卡半格 -5 / 前方悬空且目标在上 -8 加速），
   *  加速度 0.1、最大速度 1.0（原版 num1/num2 常量），门/高门交互待移植 */
  private fighterAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    // 方向：朝玩家（无玩家则保持）
    if (player) this.facing = player.cx > this.cx ? 1 : -1;
    const dir = this.facing;
    // 前方探测点（L24561-24562）：体中心前 15px、脚底上 15px
    const fx = Math.floor((this.x + this.w / 2 + 15 * dir) / TILE);
    const fy = Math.floor((this.y + this.h - 15) / TILE);
    const solidAt = (x: number, y: number) => x >= 0 && y >= 0 && x < st.w && y < st.h && st.isSolid(x, y);
    // 加速度 + 限速（原版通用核）
    this.vx += dir * 0.1;
    if (this.vx > 1) this.vx = 1;
    if (this.vx < -1) this.vx = -1;
    // 原版跳跃判定用碰撞前的速度符号（NPC 碰撞在 AI 之后）——
    // 此处必须先捕获再碰撞，否则撞墙清零 vx 后 movingInto 恒假、战士永不跳墙
    const vxSign = this.vx > 0 ? 1 : this.vx < 0 ? -1 : 0;
    // ---- 台阶自动步升（L24512-24554）：前方高差 ≤16.1px 直接跨上（gfxOffY 视觉补偿略）----
    if (this.vy >= 0 && vxSign !== 0) {
      const ax = Math.floor((this.x + this.vx + this.w / 2 + (this.w / 2 + 1) * vxSign) / TILE);
      const fr = Math.floor((this.y + this.h - 1) / TILE);
      if (ax >= 0 && fr >= 2 && ax < st.w && fr < st.h
        && solidAt(ax, fr) && !st.half[st.idx(ax, fr)]
        && !solidAt(ax, fr - 1) && !solidAt(ax, fr - 2) && !solidAt(ax, fr - 3)) {
        const top = fr * TILE;
        const rise = this.y + this.h - top;
        if (rise > 0 && rise <= 16.1) this.y = top - this.h;
      }
    }
    // 重力 + 碰撞（原版 SteepSlowing/WalkDownSlope 略）
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    // ---- 四级跳判定（L24651-24733）：仅在朝移动方向撞到东西时 ----
    const movingInto = vxSign === dir && vxSign !== 0;
    if (movingInto) {
      if (this.h >= 32 && solidAt(fx, fy - 2)) {
        // 胸口前 2 格墙：上方再 1 格也堵 → -8，否则 -7
        this.vy = solidAt(fx, fy - 3) ? -8 : -7;
      } else if (solidAt(fx, fy - 1)) {
        this.vy = -6;                       // 脚前 1 格墙
      } else if (this.y + this.h - fy * TILE > 20 && solidAt(fx, fy) && !st.half[st.idx(fx, fy)]) {
        this.vy = -5;                       // 卡在格内下部（非半砖）
      } else if (player && player.y + player.h < this.y
        && !solidAt(fx, fy + 1) && !solidAt(fx + dir, fy + 1)) {
        this.vy = -8;                       // 前方悬空且目标在上方 → 大跳 + 冲刺
        this.vx *= 1.5;
      }
    }
    // 地面摩擦（原版经由 SlopeCollision 的速度衰减近似）
    if (this.onGround) this.vx *= 0.85;
  }

  /** AI_008 法师族（Fire Imp 24 / Goblin Sorcerer 29 / Dark Caster 32）：
   *  悬浮 + 周期传送（原版 ai[0] 计时到阈值或目标不可见时 TeleportSearch）+ 三连弹幕（原版 ai[1] volley）。
   *  弹幕复用 Dart（命中玩家）；传送条件：4-16 格内有地面 + 上下净空（原版 100 次随机试探） */
  /** AI_002_FloatingEye 通用核（NPC.cs:19118-19440）：
   *  分轴非对称加速 X±4 / Y±2.5（Wandering Eye 133 半血以下激怒 ±6/±4）；
   *  撞墙/撞地按 旧速度*-0.5 反弹并保证最小弹速（L19124-19140）；
   *  白天 DespawnEncouragement：向上远离（L19147-19153 近似） */
  private floatEyeAI(game: GameHooks, player: Player | null) {
    // 撞墙反弹（collideX/Y → hitWall/hitHead/onGround + 上一帧速度近似 oldVelocity）
    const oldVx = this.vx, oldVy = this.vy;
    // ---- 白天逃离（direction=远离、directionY=-1 向上）----
    const day = game.world.clock.isDay;
    let dirX: number, dirY: number, cx: number, cy: number;
    if (day || !player) {
      dirX = -Math.sign(oldVx || 1);
      dirY = -1;
      cx = 4; cy = 2.5;
    } else {
      dirX = player.cx > this.cx ? 1 : -1;
      dirY = player.cy > this.cy ? 1 : -1;
      const rage = this.vanillaId === 133 && this.hp < this.maxHp * 0.5;
      cx = rage ? 6 : 4;
      cy = rage ? 4 : 2.5;
    }
    this.facing = dirX;
    // X 轴（L19211-19237 结构）：未越过目标且未达上限 → 朝目标加速，带两档修正
    if (dirX === -1 && this.vx > -cx) {
      this.vx -= 0.1;
      if (this.vx > 0) this.vx -= 0.1;
      if (this.vx < -cx) this.vx = -cx;
    } else if (dirX === 1 && this.vx < cx) {
      this.vx += 0.1;
      if (this.vx < 0) this.vx += 0.1;
      if (this.vx > cx) this.vx = cx;
    }
    // Y 轴（步长 0.1/0.04，档位简化为 0.1+逆风修正）
    if (dirY === -1 && this.vy > -cy) {
      this.vy -= 0.1;
      if (this.vy > 0) this.vy -= 0.05;
      if (this.vy < -cy) this.vy = -cy;
    } else if (dirY === 1 && this.vy < cy) {
      this.vy += 0.1;
      if (this.vy < 0) this.vy += 0.05;
      if (this.vy > cy) this.vy = cy;
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 碰撞反弹（在碰撞后按旧速度算）
    if (this.hitWall) {
      this.vx = -oldVx * 0.5;
      if (this.facing === -1 && this.vx > 0 && this.vx < 2) this.vx = 2;
      if (this.facing === 1 && this.vx < 0 && this.vx > -2) this.vx = -2;
    }
    if (this.hitHead || this.onGround) {
      this.vy = -oldVy * 0.5;
      if (this.vy > 0 && this.vy < 1) this.vy = 1;
      if (this.vy < 0 && this.vy > -1) this.vy = -1;
    }
  }

  /** AI_005 噬魂怪族（NPC.cs:17567-17790）"蜂群"AI：
   *  目标方向 8px 网格量化 → 期望速度 = 归一化方向 × maxSpd；
   *  ai[0] 环绕摆动（>0 加 vy、|>100| 加 vx，±200 循环）产生盘旋蜂群感（L17742-17752）；
   *  近距(<150) 附加 0.007×期望速度制导（L17754-17757）；
   *  各轴以 accel 步进逼近期望速度（L17774-17789）。
   *  速度表（L17610-17617）：Eater of Souls(6)/Crimera(173) 4/0.02，默认 6/0.05 */
  private swarmerAI(game: GameHooks, player: Player | null) {
    const isEater = this.vanillaId === 6 || this.vanillaId === 173 || this.vanillaId === 139;
    const maxSpd = isEater ? 4 : this.vanillaId === 94 ? 4.2 : this.vanillaId === 5 ? 5 : 6;
    const accel = isEater ? 0.02 : this.vanillaId === 94 ? 0.022 : this.vanillaId === 5 ? 0.03 : 0.05;
    const tx = player ? player.cx : this.cx + this.facing * 100;
    const ty = player ? player.cy : this.cy - 100;
    // 8px 网格量化（L17705-17710）
    const dx = Math.floor(tx / 8) * 8 - Math.floor(this.cx / 8) * 8;
    const dy = Math.floor(ty / 8) * 8 - Math.floor(this.cy / 8) * 8;
    const dist = Math.hypot(dx, dy) || 1;
    const sx = (dx / dist) * maxSpd;
    const sy = (dy / dist) * maxSpd;
    // 摆动项：ai[0] 的 -200..200 循环用 aiT 取模近似（同周期同幅度）
    if (dist > 100) {
      const wob = (this.aiT % 400) - 200;
      this.vy += wob > 0 ? 0.023 : -0.023;
      this.vx += Math.abs(wob) > 100 ? 0.023 : -0.023;
    }
    // 近距制导（6/94/173/619）
    if (dist < 150 && (isEater || this.vanillaId === 94 || this.vanillaId === 619)) {
      this.vx += sx * 0.007;
      this.vy += sy * 0.007;
    }
    // 各轴步进逼近期望速度（eater 族 flag4=0：单步）
    if (this.vx < sx) this.vx += accel;
    else if (this.vx > sx) this.vx -= accel;
    if (this.vy < sy) this.vy += accel;
    else if (this.vy > sy) this.vy -= accel;
    this.facing = this.vx > 0 ? 1 : -1;
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 撞墙/撞地反弹（方法尾部 collide 处理，眼睛同款近似）
    if (this.hitWall) this.vx = -this.vx * 0.5;
    if (this.onGround) this.vy = -Math.abs(this.vy) - 0.5;
    if (this.hitHead) this.vy = Math.abs(this.vy) * 0.5 + 0.5;
  }

  /** AI_026 独角兽/冲锋族（NPC.cs:25863-26292）：
   *  冲锋 walker：accel 0.07 / maxSpd 6（num7/num8，独角兽 315 配置 L26100-26116）；
   *  逆向阻尼 0.95、超速落地 ×0.8；卡墙 30 tick 折返（ai[3]≥num1，玩家 <200px 重置 L25936-25941）；
   *  台阶步升 16.1 同战士（L26182-26207）；跳梯 -8.5/-7.5/-7/-6/-8（L26245-26279，
   *  前方探测含 (w/2+2)×dir + 5×vx 提前量 L26226-26227） */
  private chargerAI(game: GameHooks, player: Player | null, maxSpd = 6) {
    const st = game.world.store;
    const solidAt = (x: number, y: number) => x >= 0 && y >= 0 && x < st.w && y < st.h && st.isSolid(x, y);
    // 方向：卡墙 ≥30 tick 折返；玩家 200px 内重置计数并朝玩家冲
    if (this.stuckT >= 30) { this.facing *= -1; this.stuckT = 0; }
    if (player && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 200) {
      this.stuckT = 0;
      this.facing = player.cx > this.cx ? 1 : -1;
    }
    const dir = this.facing;
    const accel = 0.07;
    // 逆向阻尼（L26105-26108）
    if ((this.vx > 0 && dir < 0) || (this.vx < 0 && dir > 0)) this.vx *= 0.95;
    if (dir === 1 && this.vx < maxSpd) { this.vx += accel; if (this.vx > maxSpd) this.vx = maxSpd; }
    else if (dir === -1 && this.vx > -maxSpd) { this.vx -= accel; if (this.vx < -maxSpd) this.vx = -maxSpd; }
    const vxSign = this.vx > 0 ? 1 : this.vx < 0 ? -1 : 0;
    // 台阶步升（同战士：前方高差 ≤16.1 直接抬升）
    if (this.vy >= 0 && vxSign !== 0) {
      const ax = Math.floor((this.x + this.vx + this.w / 2 + (this.w / 2 + 1) * vxSign) / TILE);
      const fr = Math.floor((this.y + this.h - 1) / TILE);
      if (ax >= 0 && fr >= 2 && ax < st.w && fr < st.h
        && solidAt(ax, fr) && !st.half[st.idx(ax, fr)]
        && !solidAt(ax, fr - 1) && !solidAt(ax, fr - 2) && !solidAt(ax, fr - 3)) {
        const rise = this.y + this.h - fr * TILE;
        if (rise > 0 && rise <= 16.1) this.y = fr * TILE - this.h;
      }
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    const xBefore = this.x;
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 卡墙计数（X 未动，原版 position.X == oldPosition.X 判定）
    if (Math.abs(this.x - xBefore) < 0.01) this.stuckT++;
    // 跳梯（前方探测带 5×vx 提前量）
    if (vxSign === dir && vxSign !== 0) {
      const fx = Math.floor((this.x + this.w / 2 + (this.w / 2 + 2) * dir + this.vx * 5) / TILE);
      const fy = Math.floor((this.y + this.h - 15) / TILE);
      if (this.h >= 32 && solidAt(fx, fy - 2)) {
        this.vy = solidAt(fx, fy - 3) ? -8.5 : -7.5;
      } else if (solidAt(fx, fy - 1)) {
        this.vy = -7;
      } else if (this.y + this.h - fy * TILE > 20 && solidAt(fx, fy)) {
        this.vy = -6;
      } else if (!solidAt(fx, fy + 1) && !solidAt(fx + dir, fy + 1) && !solidAt(fx + dir, fy + 2)) {
        this.vy = -8; // 前方悬空（悬崖/沟）大跳
      }
    }
    // 注意：原版 AI_026 无逐帧地面摩擦（速度持续加到 maxSpd，只有逆向阻尼/超速落地衰减）——
    // 不能带 fighterAI 的 onGround *=0.9，否则平衡点被压到 0.63 远低于 6
  }

  /** AI_014 蝙蝠/飞行族（1.4.5.6 完整反编译 NPC.145.cs:22895+）：
   *  noGravity；撞墙旧速×-0.5 反弹（X 最小弹速朝向 ±2 / Y ±1）；
   *  通用分轴加速 X 0.1/±4、Y 0.04/±1.5（逆转修正 0.05/0.03）；
   *  Giant Bat(158) 0.2/±7；血乌贼(660) X 0.35/±6、Y 0.3/±5。
   *  （1.4.0.5 反编译包 AI() 空壳，此处以 1.4.5.6 源为准——旧编号行为两版未变） */
  private batAI(game: GameHooks, player: Player | null) {
    const oldVx = this.vx, oldVy = this.vy;
    let ax = 0.1, ay = 0.04, cx = 4, cy = 1.5;
    if (this.vanillaId === 158) { ax = 0.2; ay = 0.2; cx = 7; cy = 7; }
    else if (this.vanillaId === 660) { ax = 0.35; ay = 0.3; cx = 6; cy = 5; }
    let dirX: number, dirY: number;
    if (player) { dirX = player.cx > this.cx ? 1 : -1; dirY = player.cy > this.cy ? 1 : -1; }
    else { dirX = this.facing; dirY = -1; }
    this.facing = dirX;
    // X 轴（L23314-23345）
    if (dirX === -1 && this.vx > -cx) {
      this.vx -= ax;
      if (this.vx > cx) this.vx -= ax; else if (this.vx > 0) this.vx += ax * 0.5;
      if (this.vx < -cx) this.vx = -cx;
    } else if (dirX === 1 && this.vx < cx) {
      this.vx += ax;
      if (this.vx < -cx) this.vx += ax; else if (this.vx < 0) this.vx -= ax * 0.5;
      if (this.vx > cx) this.vx = cx;
    }
    // Y 轴（L23346-23377）
    if (dirY === -1 && this.vy > -cy) {
      this.vy -= ay;
      if (this.vy > cy) this.vy -= 0.05; else if (this.vy > 0) this.vy += 0.03;
      if (this.vy < -cy) this.vy = -cy;
    } else if (dirY === 1 && this.vy < cy) {
      this.vy += ay;
      if (this.vy < -cy) this.vy += 0.05; else if (this.vy < 0) this.vy -= 0.03;
      if (this.vy > cy) this.vy = cy;
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 撞墙/撞地反弹（L22899-22923：collideX/Y → oldVelocity*-0.5 + 最小弹速）
    if (this.hitWall) {
      this.vx = -oldVx * 0.5;
      if (this.facing === -1 && this.vx > 0 && this.vx < 2) this.vx = 2;
      if (this.facing === 1 && this.vx < 0 && this.vx > -2) this.vx = -2;
    }
    if (this.hitHead || this.onGround) {
      this.vy = -oldVy * 0.5;
      if (this.vy > 0 && this.vy < 1) this.vy = 1;
      if (this.vy < 0 && this.vy > -1) this.vy = -1;
    }
  }

  /** AI_016 游泳族（1.4.5.6 NPC.145.cs:23549+）：鲨鱼/食人鱼/琵琶鱼等
   *  通用档水中 accel 0.1/0.1、上限 X±3/Y±2（L23883-23897）；Arapaima(157) 0.25/0.2、±7/±4（L23831+）；
   *  撞墙掉头；离水缓慢上浮。螺旋转向/专家模式特化略 */
  private swimAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    if (player) this.facing = player.cx > this.cx ? 1 : -1;
    const dirX = player ? this.facing : (this.vx >= 0 ? 1 : -1);
    const dirY = player ? (player.cy > this.cy ? 1 : -1) : 0;
    const ara = this.vanillaId === 157;
    const ax = ara ? 0.25 : 0.1, ay = ara ? 0.2 : 0.1;
    const cx = ara ? 7 : 3, cy = ara ? 4 : 2;
    if (inWater) {
      this.vx += dirX * ax;
      this.vy += dirY * ay;
      this.vx = Math.max(-cx, Math.min(cx, this.vx));
      this.vy = Math.max(-cy, Math.min(cy, this.vy));
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.hitWall) { this.facing *= -1; this.vx = -this.vx * 0.8; } // 撞墙掉头
    } else {
      // 离水：重力下坠 + 落地拍打挣扎（原版鱼离水不会飞——之前误写成持续上浮导致飞天）
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
      this.vx *= 0.9;
      if (this.onGround && this.aiT % 30 === 0) {   // 拍打：小跳 + 随机方向
        this.vy = -2.5;
        this.vx = (Math.random() - 0.5) * 3;
      }
    }
  }

  /** AI_018 水母族（NPC.145.cs:24210+）：阻尼漂移 + 周期性脉冲游向目标
   *  速度 *=0.98 阻尼（L24349）；静止阈值内（num277 0.2-3）触发脉冲，脉冲速度 7-9（L24374+）。
   *  离水：重力下坠拍打（脉冲只在水中生效——否则水母会飞） */
  private jellyfishAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    this.vx *= 0.98; this.vy *= 0.98;
    if (inWater) {
      if (++this.aiT % 90 === 0 && player) {
        const dx = player.cx - this.cx, dy = player.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 7;       // 脉冲速度 7（大体型 9）
        this.vy = (dy / d) * 7;
      } else if (!player) {
        this.vy -= 0.02;              // 缓慢下沉漂移
      }
    } else {
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED); // 离水受重力
      if (this.onGround && this.aiT % 30 === 0) this.vy = -2.5; // 拍打
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) this.vx *= -0.8;
    if (this.onGround && inWater) this.vy = -Math.abs(this.vy) - 0.5;
  }

  /** AI_022 幽灵族（NPC.145.cs:24726+）：穿墙缓速追击
   *  目标速度 = 归一化方向×7（num312），Lerp 系数 0.0125（num317）——飘忽逼近的手感 */
  private ghostAI(game: GameHooks, player: Player | null) {
    if (!player) { this.vx *= 0.95; this.vy *= 0.95; return; }
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += ((dx / d) * 7 - this.vx) * 0.0125;
    this.vy += ((dy / d) * 7 - this.vy) * 0.0125;
    this.facing = this.vx > 0 ? 1 : -1;
    // 幽灵族 noTileCollide：直接位移
    this.x += this.vx;
    this.y += this.vy;
  }

  /** 小动物被动 AI（原版 critter 语义近似）：间歇游荡 + 受击逃离玩家。
   *  各家族原版行为（蚱蜢 ai1 跳/鸟 ai24 飞/蚯蚓 ai66 爬）后续逐族 1:1，先统一温和地面行为 */
  private critterWanderAI(game: GameHooks, player: Player | null) {
    // 受击逃离（iframes 刚触发时朝远离玩家方向窜）
    if (this.iframes > 6 && player) {
      const flee = player.cx > this.cx ? -1 : 1;
      this.facing = flee;
      this.vx = flee * 2.2;
      if (this.onGround) this.vy = -3;
    } else if (this.onGround && this.aiT % 90 === 0) {
      // 随机踱步/停驻
      const r = Math.random();
      if (r < 0.4) { this.facing = Math.random() < 0.5 ? -1 : 1; this.vx = this.facing * 0.7; }
      else this.vx = 0;
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) this.vx *= 0.85;
    if (this.hitWall) this.facing *= -1;
  }

  private casterAI(game: GameHooks, player: Player | null) {
    this.vx *= 0.9; this.vy *= 0.9;
    this.x += this.vx; this.y += this.vy; // noGravity 悬浮直移
    if (!player) return;
    this.facing = player.cx > this.cx ? 1 : -1;
    // 传送计时（原版阈值 ~200 tick；用 aiT 累计）
    if (this.aiT > 200) {
      const st = game.world.store;
      const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
      for (let tries = 0; tries < 100; tries++) {
        const tx = ptx + (Math.random() < 0.5 ? -1 : 1) * (4 + ((Math.random() * 13) | 0));
        const ty = pty + (((Math.random() * 21) | 0) - 10);
        if (tx < 3 || ty < 3 || tx > st.w - 4 || ty > st.h - 4) continue;
        if (!st.isSolid(tx, ty + 1) || st.isSolid(tx, ty) || st.isSolid(tx, ty - 1)) continue;
        if (Math.hypot(tx - ptx, ty - pty) < 4) continue;
        this.x = tx * TILE + (TILE - this.w) / 2;
        this.y = ty * TILE + TILE - this.h;
        this.aiT = 0;
        this.chargesLeft = 3; // 三连弹幕
        break;
      }
      if (this.chargesLeft === 0) this.aiT = 160; // 没找到点：缩短重试间隔
    }
    // 三连弹幕：传送后第 15/40/65 tick 各一发（原版 volley 间隔）
    if (this.chargesLeft > 0 && (this.aiT === 15 || this.aiT === 40 || this.aiT === 65)) {
      const dx = player.cx - this.cx, dy = player.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      const spd = 3.4;
      const dart = new Dart(this.cx, this.cy, (dx / d) * spd, (dy / d) * spd, this.def.damage);
      (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(dart, 'projectiles');
      this.chargesLeft--;
    }
  }

  private flyAI(game: GameHooks, player: Player | null, steer: number) {
    // 恶魔眼式飞行 AI：
    // 游荡时自主调整航向（朝巡航点平滑转向、到点即换新目标、撞墙自动绕开）；
    // 玩家进入索敌范围后：朝向玩家明显加速逼近；脱离后回落游荡。
    const dist = player ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : Infinity;
    const aggro = 18 * 16; // 18 格索敌
    // 卡墙脱困：追击中持续撞墙/贴地/顶头 → 暂时退回游荡重新选航向（冷却内不再贴脸），
    // 防止顶在崖壁/坑洞里原地抖动
    if (this.stuckCd > 0) this.stuckCd--;
    if (this.state === 1 && (this.hitWall || this.onGround || this.hitHead)) {
      if (++this.stuckT > 18) { this.stuckT = 0; this.stuckCd = 45; this.state = 0; this.target = null; }
    } else this.stuckT = 0;
    if (player && dist < aggro && this.stuckCd === 0) {
      // ---- 追击：朝向玩家，加速逼近 ----
      const dx = player.cx - this.cx, dy = player.cy - this.cy;
      const d = dist || 1;
      this.vx += (dx / d) * steer * 4.5;
      this.vy += (dy / d) * steer * 4.5;
      this.facing = dx > 0 ? 1 : -1;
      this.state = 1; // 标记追击态（脱离后回到游荡时重新选巡航点）
    } else {
      // ---- 游荡：自主巡航，到点换向 ----
      if (this.state === 1 || !this.target || Math.hypot(this.target.x - this.cx, this.target.y - this.cy) < 32) {
        this.state = 0;
        // 脱困冷却内：重选目标强制向上（120-260px）——困在谷底时随机目标仍在低位，永远飞不出去
        const escape = this.stuckCd > 0;
        this.target = {
          x: this.cx + (Math.random() - 0.5) * (escape ? 200 : 320),
          y: this.cy + (escape ? -(100 + Math.random() * 160) : (Math.random() - 0.5) * 220),
        };
      }
      const dx = this.target.x - this.cx, dy = this.target.y - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * steer * 1.4;
      this.vy += (dy / d) * steer * 1.4;
      this.facing = dx > 0 ? 1 : -1;
    }
    const damp = 0.96;
    this.vx *= damp; this.vy *= damp;
    const spd = Math.hypot(this.vx, this.vy);
    // 追击上限略高于游荡：游荡 1.8，追击 2.2（太快会贴脸躲不开）
    const maxSpd = this.key === 'servant_of_cthulhu' ? 4.2 : (this.state === 1 ? 2.2 : 1.8);
    if (spd > maxSpd) { this.vx = (this.vx / spd) * maxSpd; this.vy = (this.vy / spd) * maxSpd; }
    // 通用飞行避水（def.avoidWater 声明式开启）：避让时重选航向
    if (this.def.avoidWater && avoidWater(this, game.world)) {
      this.state = 0;
      this.target = null;
      return;
    }
    // 原版 noTileCollide（穿墙族）：直接位移不走碰撞
    if (this.vanilla?.noTileCollide) {
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.vx = -this.vx * 0.7; this.state = 0; this.target = null; } // 撞墙重新选向
    if (this.hitHead) this.vy = -this.vy * 0.7;
    if (this.onGround) this.vy = -Math.abs(this.vy) - 0.5;
  }

  private eocAI(game: GameHooks, player: Player | null) {
    if (!player) return;
    const T = TILE;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy) || 1;

    // ---- 二阶段触发：半血以下且不处于冲刺/前摇 → 原地旋转三圈变身 ----
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5 && (this.state === 0 || this.state === 3 || this.state === 4)) {
      this.state = 5; this.aiT = 0; this.spin = 0;
      this.vx = 0; this.vy = 0;
      game.spawnParticles(this.cx, this.cy, '#C02020', 24, 3);
    }

    // ---- 玩家跑太远（含被地形隔开追不上）→ 传送到视口外上空，从远处飞回来 ----
    if (this.state !== 5 && !this.dashing && dist > 55 * T) {
      const cam = (game as unknown as { camera?: { viewW: number; viewH: number; zoom: number } }).camera;
      const halfX = cam ? cam.viewW / 2 / cam.zoom / T : 40;  // 视口半宽（格）
      const halfY = cam ? cam.viewH / 2 / cam.zoom / T : 25;  // 视口半高（格）
      const side = this.cx < player.cx ? -1 : 1;
      const maxX = game.world.w * T - this.w, maxY = game.world.h * T - this.h;
      // 水平超出视口边缘 6 格 + 垂直高于视口上缘 4 格（保证完全在画面外）
      this.x = Math.max(0, Math.min(maxX, player.cx + side * (halfX + 6) * T - this.w / 2));
      this.y = Math.max(2 * T, Math.min(maxY, player.cy - Math.max(halfY + 4, 14) * T));
      this.vx = 0; this.vy = 0;
      this.state = 0; this.aiT = 0;
      game.spawnParticles(this.cx, this.cy, '#802020', 20, 3);
    }

    this.dashing = false;
    switch (this.state) {
      case 0: {
        // 悬浮/进场：远处直线飞近，近处绕玩家侧上方悬浮（带起伏）
        if (dist > 20 * T) {
          this.vx += (dx / dist) * 0.3;
          this.vy += (dy / dist) * 0.3;
        } else {
          const tx = player.cx - this.facing * 6 * T;
          const ty = player.cy - 4 * T;
          this.vx += Math.sign(tx - this.cx) * 0.12 + Math.sin(this.aiT * 0.05) * 0.04;
          this.vy += Math.sign(ty - this.cy) * 0.12 + Math.cos(this.aiT * 0.07) * 0.06;
        }
        this.facing = dx > 0 ? 1 : -1;
        this.vx *= 0.95; this.vy *= 0.95;
        // 仆从召唤
        const servantEvery = this.phase === 2 ? 260 : 420;
        if (this.aiT > 0 && this.aiT % servantEvery === 0) {
          game.spawnEnemy('servant_of_cthulhu', this.cx, this.cy);
        }
        // 就位 → 进入冲撞连段（3 连冲；二阶段蓄力更短）
        if (dist <= 24 * T && this.aiT > (this.phase === 2 ? 45 : 90)) {
          this.state = 1; this.aiT = 0; this.chargesLeft = 3;
        }
        break;
      }
      case 1: {
        // 前摇：短暂悬停后锁定玩家位置迅猛冲出
        this.vx *= 0.8; this.vy *= 0.8;
        if (this.aiT > (this.phase === 2 ? 8 : 14)) {
          this.state = 2; this.aiT = 0;
          const d2 = Math.hypot(player.cx - this.cx, player.cy - this.cy) || 1;
          const p2 = this.phase === 2 ? 1.6 : 1; // 二阶段更快更强
          this.vx = ((player.cx - this.cx) / d2) * 7 * p2;
          this.vy = ((player.cy - this.cy) / d2) * 7 * p2;
          this.facing = this.vx > 0 ? 1 : -1;
          this.dashing = true;
        }
        break;
      }
      case 2: {
        // 冲撞：无视地形直接穿透，冲过一段距离后回头
        this.dashing = true;
        // 速度感拖尾粒子
        if (this.aiT % 2 === 0) {
          game.spawnParticles(
            this.cx - Math.sign(this.vx || 1) * 20, this.cy - Math.sign(this.vy || 1) * 14,
            this.phase === 2 ? '#FF4040' : '#D0D0D0', 2, 2,
          );
        }
        const spd = 7 * (this.phase === 2 ? 1.6 : 1);
        if (this.aiT * spd > 20 * T || this.aiT > 70) {
          this.chargesLeft--;
          this.state = 3; this.aiT = 0;
        }
        break;
      }
      case 3: {
        // 回头悬停：减速 → 还有剩余次数再冲，否则收招拉开距离
        this.vx *= 0.82; this.vy *= 0.82;
        if (this.aiT > (this.phase === 2 ? 12 : 20)) {
          if (this.chargesLeft > 0) { this.state = 1; this.aiT = 0; }
          else {
            // 收招落点：进入状态时一次性锁定（玩家反方向 10 格、抬高 3 格）。
            // 若每帧从当前位置重算，目标会随 Boss 一起外退 → 一直飞到计时上限
            const d0 = Math.hypot(player.cx - this.cx, player.cy - this.cy) || 1;
            this.target = {
              x: player.cx + ((this.cx - player.cx) / d0) * 10 * T,
              y: player.cy + ((this.cy - player.cy) / d0) * 10 * T - 3 * T,
            };
            this.state = 4; this.aiT = 0;
          }
        }
        break;
      }
      case 4: {
        // 收招：飞到锁定落点（贴近玩家 10 格处）后立刻回到悬浮，保持压迫感
        const away = this.target;
        if (away) {
          const adx = away.x - this.cx, ady = away.y - this.cy;
          const ad = Math.hypot(adx, ady) || 1;
          this.vx += (adx / ad) * 0.16;
          this.vy += (ady / ad) * 0.16;
          this.vx *= 0.96; this.vy *= 0.96;
          if (ad < 2.5 * T || this.aiT > 90) {
            this.state = 0; this.aiT = 0; this.target = null;
          }
        } else {
          this.state = 0; this.aiT = 0;
        }
        break;
      }
      case 5: {
        // 变身：原地旋转六圈（比三圈更快——100 tick 转 12π，角速度翻倍多）
        this.spin = Math.min(1, this.aiT / 100);
        this.vx *= 0.85; this.vy *= 0.85;
        this.visAngle += (Math.PI * 12) / 100; // 六圈自转
        if (this.aiT % 4 === 0) game.spawnParticles(this.cx, this.cy, '#C02020', 3, 2);
        if (this.aiT >= 100) {
          this.phase = 2;
          this.state = 0; this.aiT = 0; this.spin = 0;
          game.playSfx('roar');
          game.spawnParticles(this.cx, this.cy, '#FF3030', 30, 3);
        }
        break;
      }
    }

    // 显示角度平滑追踪移动方向（最短弧插值；悬浮低速时保持原朝向不抖动）
    if (this.state !== 5) {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 0.6) {
        const target = Math.atan2(this.vy, this.vx) + Math.PI * 1.5; // 素材默认朝左偏下 90°
        let diff = target - this.visAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.visAngle += diff * 0.18;
      }
    }

    // 移动：EoC 全程无视地形——悬浮飞行体贴图块边缘会卡顿、冲撞后残留在
    // 图块内也会受碰撞影响，统一直接积分 + 世界边界钳制（撞墙/嵌入问题全部消除）
    this.x += this.vx; this.y += this.vy;
    this.onGround = false; this.hitWall = false; this.hitHead = false;
    const maxX = game.world.w * T - this.w, maxY = game.world.h * T - this.h;
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  /** 受击。返回是否死亡 */
  hurt(dmg: number, kbx: number, kby: number, game: GameHooks): boolean {
    // Critter 兼容：critters 桶的调用方按 Critter.hurt(game) 单参调用；
    // 原版小动物是 Enemy 进该桶，这里把 Game 对象重映射回 game 参、伤害取固定 5
    if (typeof dmg === 'object' && dmg !== null) {
      game = dmg as unknown as GameHooks;
      dmg = 5; kbx = 0; kby = 0;
    }
    if (this.iframes > 0) return false;
    // 原版 Main.CalculateDamageNPCsTake：dmg - defense*0.5，下限 1
    const def = this.def.defense ?? 0;
    dmg = Math.max(1, Math.round(dmg - def * 0.5));
    this.hp -= dmg;
    this.iframes = 8;
    this.hpBarT = 240; // 受击后血条持续显示 4 秒
    const resist = this.def.knockbackResist;
    if (resist < 0.9) {
      this.vx += kbx * (1 - resist);
      this.vy += kby * (1 - resist);
    }
    if (this.hp <= 0) {
      this.dead = true;
      // 蠕虫任一段死亡 → 整链同死（原版 realLife 共享生命，L18152-18156）
      if (this.wormNext || this.wormFollow) {
        let head: Enemy = this;
        while (head.wormFollow) head = head.wormFollow;
        for (let s: Enemy | null = head; s; s = s.wormNext) s.dead = true;
      }
      // 掉落
      const rng = new RNG(Math.floor(Math.random() * 1e9));
      for (const d of this.def.drops) {
        if (rng.next() < d.chance) {
          const n = rng.int(d.min, d.max);
          if (n > 0) game.spawnDrop(this.cx, this.cy, d.item, n, rng.range(-1.5, 1.5), -2);
        }
      }
      game.onEnemyKilled(this.key);
      // 死亡专属声：Boss 咆哮；普通怪优先专属 killedSound，无则通用
      if (this.def.boss) game.playSfx('roar');
      else if (this.def.killedSound.length) game.playSfxFiles(this.def.killedSound);
      else game.playSfx('killed');
      // 死亡碎裂：与主角同款物理粒子（喷溅/落地反弹/停驻淡出），颜色按怪物类型
      const [c1, c2, c3] = this.def.gore;
      const big = this.def.boss || this.w > 40;
      game.spawnParticles(this.cx, this.y + this.h * 0.3, c1, big ? 26 : 12, big ? 3.4 : 2.6, { life: 240, damp: 0.988, grav: 0.09 });
      game.spawnParticles(this.cx, this.cy, c2, big ? 18 : 8, big ? 2.6 : 2.0, { life: 220, damp: 0.985, grav: 0.09 });
      game.spawnParticles(this.cx, this.cy - this.h * 0.2, c3, big ? 12 : 6, big ? 3.0 : 2.3, { life: 200, damp: 0.988, grav: 0.09 });
      return true;
    }
    // 受击：少量碎屑零散溅落（不大面积）
    game.spawnParticles(this.cx, this.cy, this.def.gore[0], 5, 1.4, { life: 60 });
    return false;
  }

  draw() { /* Renderer 统一绘制 */ }
}

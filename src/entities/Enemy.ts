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
    // 段链跟随（原版 L52271-52308）：方向向量收缩维持 linkDist 间距——
    // shrink = (dist - linkDist)/dist；position += dxC*shrink（原版 num63/num64）
    for (let s = this.wormNext; s; s = s.wormNext) {
      const fx = s.wormFollow!;
      const dxC = fx.cx - s.cx;
      const dyC = fx.cy - s.cy;
      const dist = Math.hypot(dxC, dyC);
      if (dist > 0.01) {
        const linkDist = s.w;               // 原版 num64 = width
        const shrink = (dist - linkDist) / dist;
        s.x += dxC * shrink;
        s.y += dyC * shrink;
        s.facing = dxC < 0 ? 1 : -1;         // 原版 spriteDirection（L52305）
      }
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
    e.spawnAlpha = v.alpha ?? 0; // 原版 SetDefaults alpha（静态不透明度，NPC.Opacity=1-alpha/255）
    e.colorRGBA = v.color ? [v.color[0], v.color[1], v.color[2], v.color[3] ?? 255] : null; // 原版 color 字段
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
  walkCycleT = 0;        // 行走帧累加器（≈原版 frameCounter，按 |vx| 推进）
  /** 原版 netID 变种（负数 SetDefaultsFromNetId）：scale/颜色/属性覆盖 */
  vanillaScale = 1;
  /** 实际生效的负 netID（SetDefaultsFromNetId；凝胶染色过滤用） */
  vanillaNetId = 0;
  /** 原版 NPC.color 当前值（SetDefaults/SetDefaultsFromNetId 初值，AI_001 逐 tick 渐变）。
   *  渲染语义（Main.cs:24527 + NPC.GetColor L94903）：color≠default 时用同贴图二次绘制，
   *  逐像素乘 color（贴轮廓）；通道 A 决定该 pass 强度 */
  colorRGBA: [number, number, number, number] | null = null;
  /** 原版 SetDefaults alpha：每类型静态不透明度基线（渲染 1-alpha/255，NPC.Opacity）。
   *  多数为 0=不透明；史莱姆 175/120=半透明凝胶、水母 20、蝙蝠 30 等。
   *  无通用渐隐——仅特定家族（幽灵/怨灵等）在自己的 AI 内衰减 */
  spawnAlpha = 0;
  /** 原版 ai[0] 跳跳计数器（史莱姆 hop 节奏）；ai[2] 卡墙禁追冷却 */
  ai0 = -1120;
  ai2 = 0;
  /** 原版 ai[1]（史莱姆体内物品 id，驱动 SLIME_ITEM_COLORS 渐变色；0=无） */
  ai1 = 0;
  /** 原版 ai[3]（地牢 AI 族用：诅咒头骨状态/火轮速度档/刺球相位） */
  ai3 = 0;
  /** 原版 directionY（火轮/刺球对角弹跳的纵向方向） */
  dirY = 1;
  /** 原版 timeLeft（默认 7500 tick，离屏递减；飘浮眼白天 EncourageDespawn(10)） */
  despawnTimer = 7500;
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
    this.walkCycleT += Math.abs(this.vx); // 原版 zombie/fighter 行走帧按 |vx| 累加（L77072/L70216）

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
        case 10: this.cursedSkullAI(game, p); break;                     // AI_010 诅咒头骨（地牢飞行族）
        case 11: this.skeletronHeadAI(game, p); break;                   // AI_011 骷髅王头/地牢守卫
        case 20: this.blazingWheelAI(); break;                           // AI_020 火轮（地牢陷阱）
        case 21: this.spikeBallAI(game); break;                          // AI_021 刺球（地牢陷阱）
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

    // Despawn 系统（原版 timeLeft/EncourageDespawn L7228-7241）：
    // 飘浮眼(2) 白天 DespawnEncouraged_AIStyle2（L19147）→ EncourageDespawn(10)；
    // 夜行怪白天离屏清除；其余离屏 timeLeft 递减到 0 清除（原版默认 7500 tick，回屏重置）
    const day = game.world.clock.isDay;
    if (hasPlayer) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (!this.def.boss) {
        if ((day && this.def.nightOnly) || (day && this.vanilla?.aiStyle === 2)) {
          // 白天夜行怪/飘浮眼：离屏 >90 格即清
          if (d > TILE * 90) this.dead = true;
        } else if (d > TILE * 120) {
          this.despawnTimer--;
          if (this.despawnTimer <= 0) this.dead = true;
        } else {
          this.despawnTimer = 7500; // 原版默认 timeLeft，回屏重置
        }
      }
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

  /** AI_001_Slimes 原版核（1.4.5.6 NPC.cs:60735+）：
   *  站定 vx*=0.8；ai[0] 每 tick +1（激愤 +1 额外）；
   *  阶段判定（num54=-1000）：ai0>=0 → 小跳（vy=-6, vx+=2*dir, ai0=-1120）；
   *  -1000..-500 → 小跳（ai0=-2120）；-2000..-1500 → 大跳（vy=-8, vx+=3*dir, ai0=-200）。
   *  即：小跳→小跳→大跳循环，约 5-10 秒节奏。
   *  flag3 激愤（L61446）= 夜晚 || 受过伤 || 地下 → 追玩家；白天满血地表 = 被动保持方向。
   *  卡墙（L61937）：落地 X == 起跳 X → direction 反转 + ai[2]=200 冷却（期间不索敌）。
   *  蚱蜢(377/446) 复用本 AI（ai0 额外 +3，跳得更频繁） */
  private slimeAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const underground = this.cy / TILE > game.world.groundLevel;
    // flag3 激愤判定（L61446-61448）
    const hurt = this.hp < this.maxHp;
    const flag3 = !game.world.clock.isDay || hurt || underground;
    const grasshopper = this.vanillaId === 377 || this.vanillaId === 446;
    // ai[2] 卡墙冷却期间不索敌（L61938）
    if (this.ai2 > 0) this.ai2--;
    // 激愤时索敌：direction 朝玩家；被动时保持现方向
    if (flag3 && this.ai2 === 0 && player) {
      this.facing = player.cx > this.cx ? 1 : -1;
    }
    const dir = this.facing;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    const grounded = this.onGround || (inWater && Math.abs(this.vy) < 0.8);
    if (grounded) {
      // 落地卡墙检测（L61937-61939）：起跳位置没变 = 白跳 → 反转
      if (this.jumpStartX !== 0 && Math.abs(this.cx - this.jumpStartX) < 1) {
        this.facing *= -1;
        this.ai2 = 200;
      }
      this.jumpStartX = 0;
      this.vx *= 0.8;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      // ai[0] 递增（L61954-61956：基础+1；激愤额外+1；蚱蜢+3）
      this.ai0 += 1 + (flag3 ? 1 : 0) + (grasshopper ? 3 : 0);
      // 阶段判定（L62029-62040）
      const num54 = -1000;
      let stage = 0;
      if (this.ai0 >= 0) stage = 1;
      else if (this.ai0 >= num54 && this.ai0 <= num54 * 0.5) stage = 2;
      else if (this.ai0 >= num54 * 2 && this.ai0 <= num54 * 1.5) stage = 3;
      if (stage > 0) {
        if (stage === 3) {
          // 大跳（L62055-62059）
          this.vy = -8;
          this.vx += 3 * dir;
          this.ai0 = -200;
        } else {
          // 小跳（L62062-62070）
          this.vy = -6;
          this.vx += 2 * dir;
          this.ai0 = stage === 1 ? -120 + num54 : -120 + num54 * 2;
        }
        this.jumpStartX = this.cx;  // ai[3] = position.X（L62059）
      }
    }
    // 重力+碰撞（原版经由 NPC 碰撞；水中浮力为原版 wet 行为）
    this.groundPhysics(game, 0, 0.12, 1, true);
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
    this.slimeColorTick();
  }

  // ---- AI_001 颜色渐变（NPC.cs:60973-61105）：每 tick (c*19+target)/20 向目标色靠拢 ----
  // ai[1] = 体内物品 id → 目标色表（蛆/凝胶/铂金币等占位色的 1:1 表）；踩油漆色 lerp 暂缺（无油漆系统）
  private static SLIME_ITEM_COLORS: Record<number, [number, number, number, number]> = {
    751: [185, 235, 255, 100], 2: [169, 125, 93, 150], 3: [128, 128, 128, 150], 9: [229, 149, 93, 150],
    150: [193, 202, 203, 100], 3086: [59, 28, 136, 150], 3081: [138, 145, 170, 150], 147: [189, 159, 139, 150],
    29: [220, 36, 117, 125], 3609: [232, 172, 162, 150], 3736: [255, 66, 152, 125], 3737: [179, 132, 255, 125],
    3738: [0, 206, 180, 125], 1345: [200, 200, 200, 50], 5395: [198, 72, 12, 150], 1124: [255, 158, 49, 150],
    1125: [255, 156, 12, 150], 314: [79, 163, 241, 75], 364: [37, 118, 172, 100], 1104: [227, 52, 14, 100],
    365: [22, 119, 125, 100], 1105: [205, 30, 199, 100], 366: [173, 15, 13, 100], 1106: [91, 90, 119, 100],
  };

  private slimeColorTick() {
    if (this.vanillaId !== 1 || this.ai1 <= 0 || !this.colorRGBA) return;
    const t = Enemy.SLIME_ITEM_COLORS[this.ai1];
    if (!t) return;
    for (let k = 0; k < 3; k++) this.colorRGBA[k] = (this.colorRGBA[k] * 19 + t[k]) / 20;
    this.colorRGBA[3] = (this.colorRGBA[3] * 19 + t[3]) / 20;
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
    // 摆动项（L17742-17752）：真实 ai[0] 环绕计数（>0 加 vy、|>100| 加 vx、超 200 翻回 -200）
    if (dist > 100) {
      this.ai0 += 1;
      if (this.ai0 > 200) this.ai0 = -200;
      this.vy += this.ai0 > 0 ? 0.023 : -0.023;
      this.vx += Math.abs(this.ai0) > 100 ? 0.023 : -0.023;
    } else {
      this.ai0 = 0; // 近距无摆动
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

  /** AI_010 诅咒头骨（NPC.145.cs:21553+；type 34 路径，书怪 694/魔法骷髅 289 分支未达）：
   *  距离分档速度（>350:5/0.3 >300:3/0.2 >250:1.5/0.1 其余 1/0.011，L21655-21672）；
   *  <250 环绕摆动（ai[0] +=0.9、vy ±0.019、|ai0|>100 时 vx 反向，L21636-21651）；
   *  ai[1] 追击计数 >600 加速档（×8/速度4）>650 清零；贴脸 <100 时 ai[1]=-60（L21620-21634）；
   *  noTileCollide 穿墙直移 */
  private cursedSkullAI(game: GameHooks, player: Player | null) {
    let maxSpd = 1, accel = 0.011;
    const dx = player ? player.cx - this.cx : this.facing * 100;
    const dy = player ? player.cy - this.cy : -100;
    const dist = Math.hypot(dx, dy) || 1;
    this.ai1 += 1; // ai[3]≠3 恒真（34 无状态机）
    if (this.ai1 > 600) {
      accel *= 8; maxSpd = 4;
      if (this.ai1 > 650) this.ai1 = 0;
    } else if (player && dist < 100 && this.ai1 >= 0) {
      this.ai1 = -60; // 贴脸冷却重置
    } else if (dist < 250) {
      this.ai0 += 0.9;
      this.vy += this.ai0 > 0 ? 0.019 : -0.019;
      this.vx += Math.abs(this.ai0) > 100 ? 0.019 : -0.019;
      if (this.ai0 > 200) this.ai0 = -200;
    }
    // 距离分档（L21655-21672）
    if (dist > 350) { maxSpd = 5; accel = 0.3; }
    else if (dist > 300) { maxSpd = 3; accel = 0.2; }
    else if (dist > 250) { maxSpd = 1.5; accel = 0.1; }
    let sx = (dx / dist) * maxSpd, sy = (dy / dist) * maxSpd;
    if (!player) { sx = this.facing * maxSpd / 2; sy = -maxSpd / 2; } // 玩家死亡漂移（L21686-21689）
    if (this.vx < sx) this.vx += accel;
    else if (this.vx > sx) this.vx -= accel;
    if (this.vy < sy) this.vy += accel;
    else if (this.vy > sy) this.vy -= accel;
    if (player) this.facing = dx > 0 ? 1 : -1;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_011 骷髅王头/地牢守卫（NPC.145.cs:21904+；type 68 守卫路径——骷髅王战斗分支不可达）：
   *  守卫恒 ai[1]=2（L21937-21941）：伤害/防御 9999（L22277-22278）、恒速 8 直线追击
   *  （L22282-22288）；玩家死亡/超 2000px → ai[1]=3 下坠脱场（L21925-21935, L22289-22296）。
   *  noTileCollide 直移 */
  private skeletronHeadAI(game: GameHooks, player: Player | null) {
    if (this.ai0 === 0) this.ai0 = 1; // 初始化（L21910；68 无手 NPC 生成）
    if (!player || Math.abs(this.cx - player.cx) > 2000 || Math.abs(this.cy - player.cy) > 2000) {
      this.ai1 = 3;
    } else if (this.ai1 !== 3) {
      this.ai1 = 2;
    }
    if (this.ai1 === 2) {
      this.def.damage = 9999;
      const dx = player!.cx - this.cx, dy = player!.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 8;
      this.vy = (dy / d) * 8;
    } else {
      this.vy += 0.1;
      if (this.vy < 0) this.vy *= 0.95;
      this.vx *= 0.95;
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_020 火轮（NPC.145.cs:24596+）：ai[3]=1+Next(15)*0.1 速度档；
   *  首段垂直俯冲 spd/acc/2≈15 tick（L24617-24622），随后恒速 ±spd 弹跳——
   *  noTileCollide 穿墙，"弹"靠 |v|≥spd 时 direction 翻转（L24637-24660）而非碰撞 */
  private blazingWheelAI() {
    if (this.ai0 === 0) {
      this.facing *= -1;
      this.y += this.h / 2 + 8;
      if (this.facing === 0) this.facing = 1;
      this.ai3 = 1 + Math.floor(Math.random() * 15) * 0.1;
      this.vy = 6 * this.ai3 * this.dirY;
      this.ai0 = 1;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    const spd = 6 * this.ai3, accel = 0.2 * this.ai3;
    const phaseLen = Math.floor(spd / accel / 2); // num304（ai3 约掉=15）
    if (this.ai0 >= 1 && this.ai0 < phaseLen) {
      this.vy = this.dirY * spd;
      this.ai0 += 1;
    } else if (this.ai0 >= phaseLen) {
      this.vy = 0;
      this.dirY *= -1;
      this.vx = spd * this.facing;
      this.ai0 = -1;
    } else {
      // 常态弹跳（L24637-24660）：到 ±spd 翻向，持续加 accel
      if (this.dirY > 0 && this.vy >= spd) { this.dirY *= -1; this.vy = spd; }
      else if (this.dirY < 0 && this.vy <= -spd) { this.dirY *= -1; this.vy = -spd; }
      if (this.facing > 0 && this.vx >= spd) { this.facing *= -1; this.vx = spd; }
      else if (this.facing < 0 && this.vx <= -spd) { this.facing *= -1; this.vx = -spd; }
      this.vx += accel * this.facing;
      this.vy += accel * this.dirY;
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_021 刺球（NPC.145.cs:24674+）：恒速 6 对角移动，撞轴翻转（collideX→dirY 翻、
   *  collideY→facing 翻），ai[1] 交替旋转相位（视觉态，渲染暂无旋转仅保留状态语义） */
  private spikeBallAI(game: GameHooks) {
    if (this.ai0 === 0) {
      if ((game as unknown as { player?: Player }).player) {
        const p = (game as unknown as { player: Player }).player;
        this.facing = p.cx > this.cx ? 1 : -1;
      }
      this.dirY = 1;
      this.ai0 = 1;
    }
    // 上一 tick moveAndCollide 留下的碰撞旗标（原版 AI 开头读 collideX/Y 同语义）
    const collideX = this.hitWall;
    const collideY = this.onGround || this.hitHead;
    if (this.ai1 === 0) {
      if (collideY) this.ai0 = 2;
      if (!collideY && this.ai0 === 2) { this.facing *= -1; this.ai1 = 1; this.ai0 = 1; }
      if (collideX) { this.dirY *= -1; this.ai1 = 1; }
    } else {
      if (collideX) this.ai0 = 2;
      if (!collideX && this.ai0 === 2) { this.dirY *= -1; this.ai1 = 0; this.ai0 = 1; }
      if (collideY) { this.facing *= -1; this.ai1 = 0; }
    }
    this.vx = 6 * this.facing;
    this.vy = 6 * this.dirY;
    moveAndCollide(this, game.world, this.vx, this.vy);
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
  /** AI_024 鸟（1.4.5.6 NPC.cs:25396+）：三态——0 地面踱步 / 1 飞行 / 2 降落。
   *  飞行：X 轴同飘浮眼（0.1 步进 ±4 cap）；Y 轴探测前方下方 15 格——
   *  全空 vy+=0.05 缓沉，受阻 vy-=0.1，近障 5 格内再 -0.2（L25568-25605）；
   *  撞墙 direction 反转 + 旧速×-0.5（最小 ±3/±1，L25500+）；落水上浮 */
  private birdAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const oldVx = this.vx, oldVy = this.vy;
    if (this.ai0 === 0) {
      // 地面态：重力踱步；玩家贴近/受击 → 起飞（远离方向）
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.onGround && this.aiT % 60 === 0) this.vx = (Math.random() < 0.5 ? -1 : 1) * 0.7;
      if (this.onGround) this.vx *= 0.85;
      const flee = player && Math.abs(player.cx - this.cx) < 48;
      if ((flee || this.iframes > 0) && this.onGround) {
        this.ai0 = 1;
        this.vy = -6;
        if (player) this.facing = player.cx > this.cx ? -1 : 1; // 远离玩家起飞
      }
      return;
    }
    if (this.ai0 === 2) {
      // 降落态：缓降，落地回地面
      this.vx *= 0.98;
      this.vy = Math.min(this.vy + 0.05, 2);
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.onGround) { this.ai0 = 0; this.vx = 0; }
      return;
    }
    // 飞行态：X 轴
    const dir = this.facing;
    const cap = 4;
    if (dir === -1 && this.vx > -cap) {
      this.vx -= 0.1;
      if (this.vx > 0) this.vx -= 0.05;
      if (this.vx < -cap) this.vx = -cap;
    } else if (dir === 1 && this.vx < cap) {
      this.vx += 0.1;
      if (this.vx < 0) this.vx += 0.05;
      if (this.vx > cap) this.vx = cap;
    }
    // Y 轴：前方 15 格下探（L25569-25602）
    const aheadX = Math.floor(this.cx / TILE) + dir;
    const footY = Math.floor((this.y + this.h) / TILE);
    let allClear = true, nearBlock = false;
    for (let k = 0; k < 15; k++) {
      const yy = footY + k;
      if (yy >= st.h) continue;
      if (st.isSolid(aheadX, yy) || st.liquid[st.idx(aheadX, yy)] > 0) {
        if (k < 5) nearBlock = true;
        allClear = false;
        break;
      }
    }
    if (allClear) this.vy += 0.05;
    else this.vy -= 0.1;
    if (nearBlock) this.vy -= 0.2;
    this.vy = Math.max(-4, Math.min(2, this.vy));
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) {
      this.facing *= -1;
      this.vx = -oldVx * 0.5;
      if (this.facing === -1 && this.vx > 0 && this.vx < cap - 1) this.vx = cap - 1;
      if (this.facing === 1 && this.vx < 0 && this.vx > -(cap - 1)) this.vx = -(cap - 1);
    }
    if (this.hitHead || this.onGround) {
      this.vy = -oldVy * 0.5;
      if (this.vy > 0 && this.vy < 1) this.vy = 1;
      if (this.vy < 0 && this.vy > -1) this.vy = -1;
    }
  }

  /** AI_065 蝶/萤（NPC.cs:34488 AI_065_Butterflies）：正弦游荡漂移 */
  private butterflyAI(game: GameHooks, _player: Player | null) {
    const t = this.aiT;
    this.vx = Math.sin(t * 0.03) * 1.5;
    this.vy = Math.cos(t * 0.05) * 0.8;
    this.facing = this.vx > 0 ? 1 : -1;
    this.x += this.vx;
    this.y += this.vy;
    if (game.world.store.isSolid(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.vx *= -1; this.vy *= -1;
      this.x += this.vx * 4; this.y += this.vy * 4;
    }
  }

  private critterWanderAI(game: GameHooks, player: Player | null) {
    // 飞行/漂浮家族走专属 AI（鸟 24 / 蝶萤 64/65）；蚱蜢 1 复用 slimeAI（ai0 额外+3）
    const ai = this.vanilla?.aiStyle ?? 0;
    if (ai === 24) { this.birdAI(game, player); return; }
    if (ai === 64 || ai === 65) { this.butterflyAI(game, player); return; }
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
          if (n > 0) {
            const drop = game.spawnDrop(this.cx, this.cy, d.item, n, rng.range(-1.5, 1.5), -2);
            // 凝胶染色（CommonCode.ModifyItemDropFromNPC）：gel(item 23) 由 type 1 掉落且
            // netID∉{-1,-2,-5,-6} → item.color = npc.color（当前渐变色）
            if (drop && d.item === 'gel' && this.vanillaId === 1
              && this.vanillaNetId !== -1 && this.vanillaNetId !== -2
              && this.vanillaNetId !== -5 && this.vanillaNetId !== -6 && this.colorRGBA) {
              drop.color = [...this.colorRGBA];
            }
          }
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

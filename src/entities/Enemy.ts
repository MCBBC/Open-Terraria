// 敌人实体：统一类 + 按 key 分支行为（史莱姆/僵尸/恶魔眼/蝙蝠/克苏鲁之眼及其仆从）
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { ENEMY_DEFS, EnemyDef } from '../data/enemies';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { RNG } from '../core/rng';

export class Enemy extends Entity {
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
    this.def = ENEMY_DEFS[key];
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.w = this.def.width;
    this.h = this.def.height;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.aiT++;
    if (this.iframes > 0) this.iframes--;
    if (this.hpBarT > 0) this.hpBarT--;
    if (this.squash !== 0) this.squash *= 0.85;
    this.animT++;

    const player = (game as unknown as { player: Player }).player;
    const hasPlayer = !!player && !player.dead;

    switch (this.key) {
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

    // 接触伤害（带上攻击者引用，供荆棘反伤）
    if (hasPlayer && this.aabbOverlaps(player)) {
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
      if (canAct && (this.aiT % 50 === 0 || this.stuckCd > 0 || (player && this.aiT > 40 && Math.abs(player.cx - this.cx) < TILE * 12))) {
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
    // 蝙蝠/恶魔眼不入水：前方是液体则向上弹开并重选航向
    if (this.key === 'cave_bat' || this.key === 'demon_eye') {
      const st = game.world.store;
      const ax = Math.floor((this.cx + this.vx * 4) / TILE), ay = Math.floor((this.cy + this.vy * 4) / TILE);
      if (st.inBounds(ax, ay) && st.liquid[st.idx(ax, ay)] > 40) {
        this.vx = -this.vx * 0.5;
        this.vy = -Math.abs(this.vy || 1) * 0.8 - 0.8;
        this.state = 0;
        this.target = null;
        return;
      }
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
    if (this.iframes > 0) return false;
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

// 玩家实体：移动、跳跃、游泳、Buff/配饰属性聚合、摔伤
import { Entity } from './Entity';
import type { GameHooks } from './types';
import {
  GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX,
  PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS,
  PLAYER_IFRAME_TICKS, TILE,
} from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Inventory, ACCESSORY_START } from '../items/Inventory';
import { BuffState, BuffType } from '../stats/Buffs';
import { ITEM_DEFS } from '../data/items';
import { TILE_DEFS } from '../data/tiles';

// 摔伤参数（移植自 Maples Player.Fall，单位换算为 tile）
// 对齐原版体感：跳跃/小坡绝不受伤（原版约 25 格起伤）；落水另行豁免
const FALL_SAFE_TILES = 22;
const FALL_FATAL_TILES = 45;

export class Player extends Entity {
  w = 20; h = 42;        // 原版 Player 构造(Player.cs:55083-55084 width=20 height=42;
                         // ResizeHitbox :28744 同值)。曾 16×39(窄 4px 矮 3px)——
                         // 精灵帧 40×56 已对齐,盒偏小导致判定区比视觉小一圈
  facing = 1;            // 1 右 -1 左
  baseMaxHp = 100;
  baseMaxMana = 20;   // 原版 statManaMax2 起步 20,坠落之星 +20/颗(上限 200)
  mana = 20;
  manaRegenAccum = 0;
  hp = 100;
  /** 最近一次伤害死因（PlayerDeathReason 语义子集）——死亡瞬间由 Game 消费生成原版死亡文本 */
  lastDamageCause: import('../i18n/RandomText').DeathCause | null = null;
  inv: Inventory;
  /** 玩家储物（原版 Player.cs:1468-1474 Chest.CreateBank(-2..-5)，各 40 槽）：
   *  [0]=bank 存钱罐(29) / [1]=bank2 保险箱(97) / [2]=bank3 守护者熔炉(463) /
   *  [3]=bank4 虚空保险库(491)——右键绑定见 Player.cs:32598+。内容随玩家存档，
   *  方块破坏不丢内容（原版同语义，掉落回收 place_v_ 物品） */
  banks: Array<Array<{ id: number; stack: number } | null>> = [
    Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), Array(40).fill(null),
  ];
  buffs = new BuffState();
  /** 角色外观（来自角色系统；渲染层 M7 切换 PaperDoll 时使用） */
  appearance?: import('../player/Appearance').Appearance;
  iframes = 0;
  jumpHold = 0;          // 长按跳跃剩余加速 tick
  inWater = false;
  headUnderwater = false;
  /** 税务员累积税款（Player.cs:792 taxMoney，铜币；对话「收集」领取） */
  taxMoney = 0;
  /** 收税计时（Player.cs:793 taxTimer；taxRate=3600 即每游戏小时一结） */
  taxTimer = 0;
  /** 蜂蜜浸入（原版 honeyWet，Player.cs:27436-27438）：授予 Honey buff(48,1800t) 的来源 */
  inHoney = false;
  // 气口：5 个气泡，共 23.33 秒（原版参数），每颗 ≈4.67 秒
  static readonly BREATH_BUBBLES = 5;
  static readonly BREATH_SECONDS = 23.33;
  breath = Player.BREATH_BUBBLES;
  private breathAccum = 0;
  private drownAccum = 0;
  inLava = false;
  private lavaAccum = 0;
  animTime = 0;          // 走路动画计时
  useTime = 0;           // 通用动作冷却
  dead = false;
  respawnTimer = 0;
  // 摔伤追踪
  private fallStartY: number | null = null;
  private surfaceJumpCd = 0;  // 水面起跳冷却
  sinceHurt = 0;               // 距上次受击 tick（自然回血计时；渲染层读取做心心跳动效）
  private regenAccum = 0;
  stepRenderY = 0;             // 跨台阶的渲染高度补偿（缓动到 0，消除瞬移顿挫）

  constructor(x: number, y: number, inv: Inventory) {
    super();
    this.x = x; this.y = y;
    this.inv = inv;
  }

  // ---- 配饰效果（重算式聚合，幂等）----
  get hasHorseshoe(): boolean {
    for (let i = ACCESSORY_START; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'lucky_horseshoe') return true;
    }
    return false;
  }
  get hasFeralClaws(): boolean {
    for (let i = ACCESSORY_START; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'feral_claws') return true;
    }
    return false;
  }
  /** 防御 = 基础(0) + 盔甲 + 铁皮 Buff(+6)（时装不计） */
  get defense(): number {
    let d = this.buffs.defenseBonus;
    for (const id of this.inv.equippedArmor()) {
      if (id != null) d += ITEM_DEFS[id]?.armor?.defense ?? 0;
    }
    return d;
  }
  get maxHp(): number {
    return this.baseMaxHp + this.buffs.healthBonus;
  }
  get maxMana(): number {
    return this.baseMaxMana;
  }
  get thornsActive(): boolean {
    return this.buffs.hasThorns;
  }
  /** 近战攻速倍率（猛爪手套 ×2） */
  get attackSpeedMult(): number {
    return this.hasFeralClaws ? 2 : 1;
  }
  /** 近战伤害加成（猛爪手套 +5） */
  get meleeDamageBonus(): number {
    return this.hasFeralClaws ? 5 : 0;
  }

  get frame(): number {
    if (!this.onGround) return 4;
    if (Math.abs(this.vx) > 0.3) {
      return 1 + Math.floor(this.animTime / 8) % 3;
    }
    return 0;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    const world = game.world;
    if (this.iframes > 0) this.iframes--;
    if (this.useTime > 0) this.useTime--;

    // Buff tick：自然回复（恢复 Buff）
    const buffHeal = this.buffs.tick(dt);
    if (buffHeal > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + buffHeal);
    // 自然回血：脱离战斗 5 秒后每秒缓回 1 点
    this.sinceHurt++;
    if (this.sinceHurt > 300 && this.hp > 0 && this.hp < this.maxHp) {
      this.regenAccum += dt;
      if (this.regenAccum >= 1) {
        this.regenAccum -= 1;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }
    // 上限收缩时钳制
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    // 魔力自然回复(原版 Player.manaRegen:越满越快,简化为每秒 maxMana*0.08+0.5)
    if (this.mana < this.maxMana) {
      this.manaRegenAccum += dt;
      if (this.manaRegenAccum >= 1) {
        this.manaRegenAccum -= 1;
        this.mana = Math.min(this.maxMana, this.mana + Math.ceil(this.maxMana * 0.08) + 1);
      }
    }

    // 液体检测：身体采样在脚底上方固定 4px（贴脚即入水，不随身高缩放）
    const liq = world.store.liquid[world.store.idx(
      Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE),
    )];
    const wasInWater = this.inWater;
    this.inWater = liq > 100;
    // 入水瞬间：水花声（出水不响）
    if (this.inWater && !wasInWater) game.playSfx('splash');
    const centerIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE));
    this.inLava = world.store.liquidType[centerIdx] === 2 && world.store.liquid[centerIdx] > 60;
    // 蜂蜜浸入（Player.cs:27436）：湿判定命中蜂蜜 → AddBuff(48, 1800t=30s) + honeyWet。
    // BuffState.apply 是 max 合并（AddBuff 语义），浸着恒 30s，离开后自然倒计时
    this.inHoney = world.store.liquidType[centerIdx] === 3 && liq > 30;
    if (this.inHoney) this.buffs.apply(BuffType.Honey, 30);
    const headIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + 8) / TILE), // 鼻子位置（头顶下方半格）
    );
    const headLiq = world.store.liquid[headIdx];
    const prevHeadUnderwater = this.headUnderwater; // 旧值（判定"刚出水"必须用更新前状态）
    // 气口消耗只对水（原版 DrownCollision 不含水蜜/岩浆——蜂蜜和岩浆不会淹死）
    this.headUnderwater = headLiq > 40 && world.store.liquidType[headIdx] === 1;
    // 岩浆伤害：每半秒 15
    if (this.inLava) {
      this.lavaAccum += dt;
      if (this.lavaAccum >= 0.5) {
        this.lavaAccum = 0;
        this.lastDamageCause = { kind: 'lava' };
        this.damage(15, this.cx, this.y - 10);
        game.addDamageNumber(this.cx, this.y, 15, false, '#FF6020');
      }
    } else this.lavaAccum = 0;

    // 气口：头部浸水时 23.33 秒耗尽，耗尽后每秒掉 10 血；出水立即恢复
    const wasHead = prevHeadUnderwater;
    if (this.headUnderwater) {
      this.breathAccum += dt;
      const per = Player.BREATH_SECONDS / Player.BREATH_BUBBLES;
      while (this.breathAccum >= per && this.breath > 0) {
        this.breathAccum -= per;
        this.breath--;
      }
      if (this.breath <= 0) {
        this.drownAccum += dt;
        if (this.drownAccum >= 1) {
          this.drownAccum -= 1;
          this.lastDamageCause = { kind: 'drowned' };
          this.damage(10, this.cx, this.y - 10, false); // 窒息环境伤害：只掉血，无击退
          game.playSfx('drown');
          game.addDamageNumber(this.cx, this.y, 10, false, '#FF5050'); // 与受击同色
        }
      }
    } else if (wasHead || this.breath < Player.BREATH_BUBBLES) {
      // 出水补气。关键：刚出水时 breath 可能仍为满值但有一颗正在渐隐消耗中
      // （breathAccum > 0）——只判 breath==5 会跳过补气导致气泡瞬间消失。
      // 余量取「整口气 + 正在消耗那颗的剩余比例」的精确小数，从该状态回满
      const per = Player.BREATH_SECONDS / Player.BREATH_BUBBLES;
      const drainRemain = wasHead ? Math.max(0, Math.min(1, 1 - this.breathAccum / per)) : 1;
      this.refillFrom = Math.min(Player.BREATH_BUBBLES, this.breath - 1 + drainRemain);
      const missing = 1 - this.refillFrom / Player.BREATH_BUBBLES;
      this.breath = Player.BREATH_BUBBLES;
      this.breathAccum = 0;
      this.drownAccum = 0;
      // 补气时长：缺口比例（1.11s × 缺口），保底 0.55s 能看清；满后停留 0.35s 再隐藏
      this.refillDur = Math.max(0.55, 1.11 * missing);
      this.refillT = 0;
    }
    // 补气动画推进（补满后停留 REFILL_HOLD 再隐藏）
    if (this.refillT >= 0) {
      this.refillT += dt;
      if (this.refillT >= this.refillDur + 0.15) this.refillT = -1;
    }

    // 死亡等待重生（任何死法统一在此发声——溺水/岩浆/摔落/受击都经过这里）
    if (this.hp <= 0) {
      if (!this.dead) game.playSfx('pkilled');
      this.dead = true;
      return;
    }

    // 水平（敏捷 Buff 提速；蜂蜜比水更黏滞——原版蜂蜜重力 0.1/落速 3，Player.cs:24131-24135）
    const speedMult = this.buffs.moveSpeedMult * (this.inHoney ? 0.5 : 1);
    const ix = this.inputX;
    if (ix !== 0) {
      this.vx += ix * PLAYER_WALK_ACCEL * (this.inWater ? 0.6 : 1) * speedMult;
      this.facing = ix;
    } else {
      this.vx *= this.onGround ? PLAYER_FRICTION : PLAYER_AIR_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    const maxSpd = PLAYER_WALK_MAX * (this.inWater ? 0.55 : 1) * speedMult;
    this.vx = Math.max(-maxSpd, Math.min(maxSpd, this.vx));

    // 绳索攀爬(原版:身体中心格为绳(213/353/950-9)时无重力,上/下键攀爬,左右离绳)
    const st = world.store;
    const ropeTx = Math.floor((this.x + this.w / 2) / TILE);
    const ropeTy = Math.floor((this.y + this.h / 2) / TILE);
    const ropeHere = !!(st.inBounds(ropeTx, ropeTy) && st.flags[st.idx(ropeTx, ropeTy)]
      && TILE_DEFS[st.type[st.idx(ropeTx, ropeTy)]]?.rope);
    this.onRope = ropeHere;
    if (ropeHere && !this.inWater) {
      // 原版攀爬(Player.cs:17169-17212):上爬 vy>0 先阻尼×0.7,-3 以上每 tick -0.2
      // (之下 -0.02,下限 -8);下滑镜像(+0.2/+0.1,上限 maxFallSpeed);静止 vy*=0.7
      if (this.inputJump) {
        if (this.vy > 0) this.vy *= 0.7;
        this.vy -= this.vy > -3 ? 0.2 : 0.02;
        if (this.vy < -8) this.vy = -8;
      } else if (this.inputDown) {
        if (this.vy < 0) this.vy *= 0.7;
        this.vy += this.vy < 3 ? 0.2 : 0.1;
        if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
      } else {
        this.vy *= 0.7;
      }
      this.fallStartY = null; // 绳上不计摔伤
    } else
    // 跳跃 / 游泳
    if (this.inWater) {
      // 头部露出水面（踩水状态）→ 允许正常力度起跳跃上岸块（带冷却防连跳）
      if (this.inputJump && !this.headUnderwater) {
        if (this.surfaceJumpCd <= 0) {
          this.vy = -PLAYER_JUMP_SPEED;
          this.jumpHold = PLAYER_JUMP_TICKS;
          this.surfaceJumpCd = 24;
        }
      } else if (this.inputJump) {
        // 全浸没：游泳上浮
        this.vy = Math.max(this.vy - 0.62, -4.4);
      }
      if (this.surfaceJumpCd > 0) this.surfaceJumpCd--;
      this.vy += GRAVITY * 0.3;
      this.vy = Math.max(-4.6, Math.min(3.0, this.vy));
      this.fallStartY = null;
    } else {
      if (this.inputJump && this.onGround) {
        this.vy = -PLAYER_JUMP_SPEED;
        this.jumpHold = PLAYER_JUMP_TICKS;
      }
      if (this.inputJump && this.jumpHold > 0) {
        this.vy -= 0.22;
        this.jumpHold--;
      } else {
        this.jumpHold = 0;
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    }
    // 松键截断上升（手感）
    if (!this.inputJump && this.vy < -2) this.vy = -2;

    // 摔伤追踪：开始下落记录高度，落地结算
    if (!this.onGround && this.vy > 0 && this.fallStartY === null) {
      this.fallStartY = this.y;
    }
    if (this.vy < -0.1) this.fallStartY = null; // 重新上升则重置

    this.dropThrough = !!this.inputDown;
    moveAndCollide(this, world, this.vx, this.vy);

    // 边缘滑落：已移除（改为收窄支撑判定宽度——本质相同但无侧推力）
    if (false) {
      const fy = Math.floor((this.y + this.h + 1) / TILE);
      const fx0 = Math.floor(this.x / TILE), fx1 = Math.floor((this.x + this.w - 0.01) / TILE);
      let support = 0;
      let supportX = 0; // 支撑面积加权重心
      for (let tx = fx0; tx <= fx1; tx++) {
        if (!world.store.isSolid(tx, fy)) continue;
        const left = Math.max(this.x, tx * TILE);
        const right = Math.min(this.x + this.w, tx * TILE + TILE);
        const ov = Math.max(0, right - left);
        support += ov;
        supportX += (left + right) / 2 * ov;
      }
      // 主动移动（上行爬坡/走动）时只在彻底失撑（≤2px）才坠落，不参与缓滑——
      // 爬台阶时身体经常大半悬空，缓滑会把人往回推；静止站边缘才触发缓滑
      const moving = this.inputX !== 0 && Math.abs(this.vx) > 0.3;
      // 固定 3px 阈值：几乎完全悬空才滑落（比例阈值对放大后的宽碰撞盒过敏）
      void moving;
      if (support > 0 && support < 3) {
        const cen = supportX / support;
        const dir = cen < this.cx ? 1 : -1; // 支撑在身体哪侧，就往反侧滑
        if (support <= 2) {
          this.x += dir * 1.2;
          this.onGround = false; // 彻底失撑，下坠
        } else {
          this.x += dir * 0.9; // 缓慢滑向悬空侧
        }
      }
    }

    // 自动上台阶：贴地行走撞 1 格高台阶且上方净空 → 直接踏上去（无需跳跃）
    // 注意碰撞后 vx 已清零，用输入方向判断
    if (this.onGround && this.hitWall && this.inputX !== 0) {
      const dir = this.inputX;
      const frontX = dir > 0 ? this.x + this.w + 1 : this.x - 1;
      const fx = Math.floor(frontX / TILE);
      const fy = Math.floor((this.y + this.h - 1) / TILE);
      const stepSolid = world.store.isSolid(fx, fy);
      const headroom = !world.store.isSolid(fx, fy - 1) && !world.store.isSolid(fx, fy - 2);
      if (stepSolid && headroom) {
        const ny = this.y - TILE;
        // 抬升后自身所占空间必须无实心
        let clear = true;
        const tx0 = Math.floor(this.x / TILE), tx1 = Math.floor((this.x + this.w - 1) / TILE);
        const ty0 = Math.floor(ny / TILE), ty1 = Math.floor((ny + this.h - 1) / TILE);
        for (let tx = tx0; tx <= tx1 && clear; tx++) {
          for (let ty = ty0; ty <= ty1; ty++) {
            if (world.store.isSolid(tx, ty)) { clear = false; break; }
          }
        }
        if (clear) {
          this.y = ny;
          this.x += dir * 2.5;
          this.onGround = true;
          this.stepRenderY = TILE; // 渲染补偿：从旧高度缓升，消除瞬移顿挫
        }
      }
    }
    // 台阶视觉缓动：每帧向 0 收敛
    if (this.stepRenderY > 0.5) this.stepRenderY *= 0.55;
    else this.stepRenderY = 0;

    // 落地摔伤结算（幸运马掌免疫；落在水里豁免——水有缓冲）
    if (this.onGround && this.fallStartY !== null) {
      const fallTiles = (this.y - this.fallStartY) / TILE;
      this.fallStartY = null;
      const feetLiq = world.store.liquid[world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 1) / TILE))];
      const landedInWater = feetLiq > 60 || this.inWater;
      if (landedInWater) { /* 落水缓冲：不计摔伤 */ }
      else if (fallTiles > FALL_SAFE_TILES && !this.hasHorseshoe) {
        const t = Math.min(1, (fallTiles - FALL_SAFE_TILES) / (FALL_FATAL_TILES - FALL_SAFE_TILES));
        const dmgPercent = 10 + 90 * t * t * t; // 10%~100% 三次方曲线（Maples 公式）
        const dmg = Math.max(1, Math.round((dmgPercent / 100) * this.hp));
        this.lastDamageCause = { kind: 'fell' };
        this.damage(dmg, this.cx, this.y - 10);
        game.playSfx('hurt');
        game.addDamageNumber(this.cx, this.y, dmg, false, '#FF5050');
      }
    }

    // 走跑动画计时（仅地面；空中贴图静态不参与动画）
    if (Math.abs(this.vx) > 0.3 && this.onGround) this.animTime += Math.abs(this.vx);
    else this.animTime = 0;

    // 越界保护
    const maxY = world.h * TILE;
    if (this.y > maxY + 100) this.damage(9999, this.cx, this.y);
  }

  /** 出水补气动画进度 0..1（-1 = 未在补气） */
  refillT = -1;
  refillDur = 1.11; // 本次补气总时长（按出水时的缺口比例：1.11s × 缺口）
  refillFrom = 0;   // 出水时的余量（补气动画从此处起填）
  static readonly REFILL_HOLD = 0.35; // 补满后满格停留时长
  get refill01(): number {
    return this.refillT < 0 ? 1 : Math.min(1, this.refillT / this.refillDur);
  }

  /** 当前正在消耗的那口气泡进度 0..1（1=满，趋 0 渐隐）；头部浸水外为 0 */
  get breathDrain01(): number {
    if (!this.headUnderwater || this.breath <= 0) return 0;
    const per = Player.BREATH_SECONDS / Player.BREATH_BUBBLES;
    return Math.max(0, Math.min(1, 1 - this.breathAccum / per));
  }

  // 输入状态由 Game 每帧写入
  inputX = 0;
  inputJump = false;
  inputDown = false;
  inputUp = false;
  onRope = false;

  /** 受击：防御减伤公式 max(1, dmg - defense*0.5)（移植自 Maples Player.OnAttacked）。
   *  knockback=false 用于窒息等环境伤害（只掉血不击退） */
  damage(dmg: number, srcX: number, srcY: number, knockback = true): boolean {
    if (this.iframes > 0 || this.dead) return false;
    const reduction = Math.max(1, dmg - this.defense * 0.5);
    this.hp -= reduction;
    this.iframes = PLAYER_IFRAME_TICKS;
    this.sinceHurt = 0; // 受击打断自然回血
    // 击退
    if (knockback) {
      const dir = this.cx < srcX ? -1 : 1;
      this.vx = dir * 3.4;
      this.vy = -3;
    }
    return true;
  }

  draw() { /* 由 Renderer 统一绘制 */ }
}

// 玩家实体：移动、跳跃、游泳、Buff/配饰属性聚合、摔伤
import { Entity } from './Entity';
import type { GameHooks } from './types';
import {
  GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX,
  PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS,
  PLAYER_IFRAME_TICKS, TILE,
} from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Inventory, ACC_ARMOR_START } from '../items/Inventory';
import { BuffState, BuffType } from '../stats/Buffs';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { statOfInternal } from '../data/vanillaItemStats';
import { wingStatOf } from '../data/vanillaWingStats';
import { accFxOfInternal } from '../data/vanillaAccFx';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hurtTiles, liquidCollision, TOUCH_IMMEDIATE, TOUCH_HOT, TOUCH_BLEEDING, SUFFOCATE, TOUCH_DESTROY, type HurtTile } from '../stats/TouchDamage';

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
  /** 蛛网挣扎计数（原版 stickyBreak，Player.cs:22653） */
  private stickyBreak = 0;
  private surfaceJumpCd = 0;  // 水面起跳冷却
  sinceHurt = 0;               // 距上次受击 tick（自然回血计时；渲染层读取做心心跳动效）
  private regenAccum = 0;
  stepRenderY = 0;             // 跨台阶的渲染高度补偿（缓动到 0，消除瞬移顿挫）
  /** 联机远端位置平滑偏移（原版 Player.netOffset，MessageBuffer.cs case 13 注入、
   *  Player.UpdateNetOffset :28240 衰减）：模拟位置与权威快照的差，渲染时叠加。
   *  本地玩家恒 0 */
  netOffX = 0;
  netOffY = 0;
  /** 联机远端挥舞动画（msg13 useItem 位驱动；Game 派生，Renderer 以 swing 参数消费）。
   *  本地玩家不用（本地走 Game.swing） */
  swingNet: { t: number; dur: number; item: number } | null = null;

  constructor(x: number, y: number, inv: Inventory) {
    super();
    this.x = x; this.y = y;
    this.inv = inv;
  }

  // ---- 配饰效果（重算式聚合，幂等）----
  get hasHorseshoe(): boolean {
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) { // armor[3-9] 配饰槽（原版 Player.cs:36326）
      const s = this.inv.armor[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'lucky_horseshoe') return true;
    }
    return false;
  }
  get hasFeralClaws(): boolean {
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) {
      const s = this.inv.armor[i];
      if (s && ITEM_DEFS[s.id]?.accessory === 'feral_claws') return true;
    }
    return false;
  }
  /** 防御 = 基础(0) + 盔甲/配饰（含 vi_ 表防御+accfx def+词缀 62-65）+ 铁皮 Buff(+6)（时装不计） */
  get defense(): number {
    let d = this.buffs.defenseBonus + this.equipStats.def;
    for (const id of this.inv.equippedArmor()) {
      if (id != null) d += ITEM_DEFS[id]?.armor?.defense ?? statOfInternal(id)?.def ?? 0;
    }
    return d;
  }

  /** 装备数值聚合（GrantArmorBenefits/ApplyEquipFunctional/GrantPrefixBenefits 可移植切片）。
   *  覆盖：配饰防御/魔力/回复/移速/近战速度/全系伤害/暴击 + 词缀 62-80 效益；
   *  行为型效果（火箭靴飞行/熔岩护身等）不在内。每帧重算式聚合，幂等 */
  get equipStats(): {
    def: number; mana: number; hpPerSec: number;
    dmgMelee: number; dmgRanged: number; dmgMagic: number;
    critMelee: number; critRanged: number; critMagic: number;
    moveMult: number; meleeSpeed: number;
    extraFall: number; lavaMax: number; armorPen: number;
    rocketBoots: number; autoJump: boolean; fireWalk: boolean;
    noKnockback: boolean; noFallDmg: boolean; desertBoots: boolean;
    waterWalk: boolean; jumpBoost: boolean; panic: boolean; starCloak: boolean;
    jumpOpts: string[];
    wing: { time: number; speed: number } | null;
    dash: number; blackBelt: boolean; bees: boolean; carpet: boolean;
  } {
    let def = 0, mana = 0, life = 0;
    let dmgMelee = 0, dmgRanged = 0, dmgMagic = 0;
    let critMelee = 0, critRanged = 0, critMagic = 0;
    let move = 0, meleeSpeed = 0, runSpeed = 0;
    let extraFall = 0, lavaMax = 0, armorPen = 0, rocketBoots = 0;
    let autoJump = false, fireWalk = false, noKnockback = false, noFallDmg = false;
    let desertBoots = false, waterWalk = false, jumpBoost = false, panic = false, starCloak = false;
    const jumpSet = new Set<string>();
    let wing: { time: number; speed: number } | null = null;
    let dash = 0, blackBelt = false, bees = false, carpet = false;
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) {
      const s = this.inv.armor[i];
      if (!s) continue;
      const fx = accFxOfInternal(s.id);
      // 翅膀（Item.wingSlot>0 → WingStatsInitializer 飞行属性；多翅膀取首个）
      const wingSlot = statOfInternal(s.id)?.wing;
      if (wingSlot && wingSlot > 0 && !wing) wing = wingStatOf(wingSlot);
      // 生命回复优先取 Item.lifeRegen 字段（再生手环族，GrantArmorBenefits :12700），
      // accfx.life 为 if-chain 段的 lifeRegen += N
      const itemLife = statOfInternal(s.id)?.life ?? 0;
      if (itemLife) life += itemLife;
      if (fx) {
        if (fx.def) def += fx.def;
        if (fx.mana) mana += fx.mana;
        if (fx.life) life += fx.life;
        if (fx.move) move += fx.move;
        if (fx.meleeSpd) meleeSpeed += fx.meleeSpd;
        if (fx.runSpeed) runSpeed = Math.max(runSpeed, fx.runSpeed);
        if (fx.dmgMelee) dmgMelee += fx.dmgMelee;
        if (fx.dmgRanged) dmgRanged += fx.dmgRanged;
        if (fx.dmgMagic) dmgMagic += fx.dmgMagic;
        if (fx.dmgAll) { dmgMelee += fx.dmgAll; dmgRanged += fx.dmgAll; dmgMagic += fx.dmgAll; }
        if (fx.critMelee) critMelee += fx.critMelee;
        if (fx.critRanged) critRanged += fx.critRanged;
        if (fx.critMagic) critMagic += fx.critMagic;
        // ---- 行为型（ApplyEquipFunctional 布尔/数值字段）----
        if (fx.extraFall) extraFall += fx.extraFall;
        if (fx.lavaMax) lavaMax += fx.lavaMax;       // 熔岩护身符族：叠加（lavaMax += 420）
        if (fx.armorPen) armorPen += fx.armorPen;
        if (fx.rocketBoots) rocketBoots = Math.max(rocketBoots, fx.rocketBoots);
        if (fx.autoJump) autoJump = true;
        if (fx.fireWalk) fireWalk = true;
        if (fx.noKnockback) noKnockback = true;
        if (fx.noFallDmg) noFallDmg = true;
        if (fx.desertBoots) desertBoots = true;
        if (fx.waterWalk || fx.waterWalk2) waterWalk = true;
        if (fx.jumpBoost) jumpBoost = true;
        if (fx.panic) panic = true;
        if (fx.starCloak) starCloak = true;
        if (fx.dashType) dash = Math.max(dash, fx.dashType);
        if (fx.blackBelt) blackBelt = true;
        if (fx.bees) bees = true;
        if (fx.carpet) carpet = true;
        for (const j of fx.jumpOpts ?? []) jumpSet.add(j);
      }
      // 词缀效益（GrantPrefixBenefits :13531：配饰前缀 62-80）
      const p = s.prefix;
      if (p && p >= 62 && p <= 80) {
        if (p <= 65) def += p - 61;              // 62-65：+1..4 防御
        else if (p === 66) mana += 20;           // Arcane：魔力 +20
        else if (p === 67) { critMelee += 2; critRanged += 2; critMagic += 2; }
        else if (p === 68) { critMelee += 4; critRanged += 4; critMagic += 4; }
        else if (p >= 69 && p <= 72) dmgMelee += dmgRanged += dmgMagic += (p - 68) / 100; // 69-72：+1..4% 全伤
        else if (p <= 76) move += (p - 72) / 100; // 73-76：+1..4% 移速
        else meleeSpeed += (p - 76) / 100;        // 77-80：+1..4% 近战速度
      }
    }
    // 恐慌项链受击加速窗口（PanicSpeedBoost :25034：panicTime 300 tick 内 moveSpeed +0.5）
    if (this.panicTime > 0) move += 0.5;
    // runSpeed：accRunSpeed=6 vs 基础 maxRunSpeed=3 → 移速倍率贡献（取最高不叠）
    const moveMult = 1 + move + (runSpeed > 0 ? runSpeed / 3 - 1 : 0);
    // 多段跳按原版优先序排列（JumpMovement 消费序）
    const JUMP_ORDER = ['Cloud', 'Sail', 'Sandstorm', 'Blizzard', 'Fart', 'Tsunami', 'Unicorn', 'Basilisk', 'WallOfFleshGoat', 'Santank'];
    const jumpOpts = JUMP_ORDER.filter((j) => jumpSet.has(j));
    return {
      def, mana, hpPerSec: life / 2, // lifeRegen 单位 = 每半秒（NaturalLifeRegen 语义）
      dmgMelee, dmgRanged, dmgMagic,
      critMelee, critRanged, critMagic,
      moveMult, meleeSpeed,
      extraFall, lavaMax, armorPen, rocketBoots,
      autoJump, fireWalk, noKnockback, noFallDmg, desertBoots,
      waterWalk, jumpBoost, panic, starCloak,
      jumpOpts,
      wing, dash, blackBelt, bees, carpet,
    };
  }
  get maxHp(): number {
    return this.baseMaxHp + this.buffs.healthBonus;
  }
  get maxMana(): number {
    return this.baseMaxMana + this.equipStats.mana; // 星力手环族/魔法手铐等（statManaMax2 += N）
  }
  get thornsActive(): boolean {
    return this.buffs.hasThorns;
  }
  /** 近战攻速倍率（猛爪手套 ×2 + 装备 meleeSpeed 67-80 词缀/狂战士手套累加） */
  get attackSpeedMult(): number {
    return (1 + this.equipStats.meleeSpeed) * (this.hasFeralClaws ? 2 : 1);
  }
  /** 近战伤害加成（猛爪手套 +5） */
  get meleeDamageBonus(): number {
    return this.hasFeralClaws ? 5 : 0;
  }
  /** 全系伤害加成装备聚合（ApplyEquipFunctional dmgX 段；melee/ranged/magic 分道） */
  damageMult(kind: 'melee' | 'ranged' | 'magic'): number {
    const st = this.equipStats;
    return 1 + (kind === 'melee' ? st.dmgMelee : kind === 'ranged' ? st.dmgRanged : st.dmgMagic);
  }
  /** 装备暴击率（critX 段 + 词缀 67/68） */
  critChance(kind: 'melee' | 'ranged' | 'magic'): number {
    const st = this.equipStats;
    return kind === 'melee' ? st.critMelee : kind === 'ranged' ? st.critRanged : st.critMagic;
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

    // Buff tick：自然回复 / 环境 DoT（负值=持续伤害,原版 lifeRegen 路径:无视防御与无敌帧）
    const buffHeal = this.buffs.tick(dt);
    if (buffHeal > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + buffHeal);
    else if (buffHeal < 0 && this.hp > 0) {
      this.hp = Math.max(0, this.hp + buffHeal);
      if (this.hp <= 0) this.lastDamageCause = { kind: 'default' }; // DoT 致死=默认死亡包
    }
    // 恐慌项链加速窗口倒计时
    if (this.panicTime > 0) this.panicTime -= dt;
    // 装备生命回复（再生手环族 lifeRegen：每半秒 N/2 HP → 每秒 N/2；战斗中也生效）
    const equipRegen = this.equipStats.hpPerSec;
    if (equipRegen > 0 && this.hp > 0) {
      this.regenAccum += equipRegen * dt;
      if (this.regenAccum >= 1) {
        const n = Math.floor(this.regenAccum);
        this.regenAccum -= n;
        this.hp = Math.min(this.maxHp, this.hp + n);
      }
    }
    // 自然回血：脱离战斗 5 秒后每秒缓回 1 点（流血 Bleeding 清 lifeRegenTime → 阻断,:18998）
    this.sinceHurt++;
    if (this.sinceHurt > 300 && this.hp > 0 && this.hp < this.maxHp && !this.buffs.has(BuffType.Bleeding)) {
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
    this.inLava = liquidCollision(world.store, this.x, this.y, this.w, this.h, 2); // LavaCollision 盒判定
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
    // 岩浆伤害 1:1（Player.cs:27350-27440）：盒判定接触 → lavaTime 宽限（护身符族）耗尽后
    // 单发 80（Hurt 全结算：防御+无敌帧）+ 着火 OnFire 7s（AddBuff(24,420)）；
    // 无敌帧承担原版 hurtCooldowns[Lava] 冷却
    if (this.inLava) {
      const lavaMax = this.equipStats.lavaMax;
      if (lavaMax > 0 && this.lavaImmuneTicks > 0) {
        this.lavaImmuneTicks--;
      } else if (this.iframes <= 0) {
        this.lastDamageCause = { kind: 'lava' };
        if (this.damage(80, this.cx, this.y - 10, false)) {
          this.buffs.apply(BuffType.OnFire, 7);
          game.playSfx('hurt');
          game.addDamageNumber(this.cx, this.y, Math.max(1, Math.round(80 - this.defense * 0.5)), false, '#FF6020');
          game.spawnParticles(this.cx, this.y + this.h / 2, '#FF9A3C', 12, 1.6, { life: 32, grav: -0.05 });
        }
      }
    } else {
      this.lavaAccum = 0;
      if (this.equipStats.lavaMax > 0) this.lavaImmuneTicks = this.equipStats.lavaMax;
    }
    // 入水熄灭着火（Player.cs:27426：wet 且非岩浆 → DelBuff 24）
    if (this.inWater && !this.inLava) this.buffs.remove(BuffType.OnFire);
    // 着火/燃烧粒子（dust6 火尘族,每 tick 0.8 概率一枚上浮）
    if (this.buffs.has(BuffType.OnFire) || this.buffs.has(BuffType.Burning)) {
      if (Math.random() < 0.8) {
        game.spawnParticles(
          this.x + Math.random() * this.w, this.y + Math.random() * this.h,
          Math.random() < 0.7 ? '#FF9A3C' : '#FFD24A', 1, 0.7,
          { life: 26 + Math.random() * 14, grav: -0.06, damp: 0.96 });
      }
    }
    // HurtTiles 接触伤害（Collision.cs:3128 + Player.cs:27296/28507）:
    // 尖刺/木尖刺/荆棘族直接伤害 + 流血,陨石/狱石族 Burning,沙族窒息,荆棘族触碰毁块
    const ht = hurtTiles(world.store, this.x, this.y, this.w, this.h, this.equipStats.fireWalk);
    if (ht) this.applyTouchDamage(game, ht);

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

    // 水平（敏捷 Buff 提速 + 装备移速（赫尔墨斯靴族 runSpeed/词缀 73-76）；蜂蜜比水更黏滞）
    const speedMult = this.buffs.moveSpeedMult * this.equipStats.moveMult * (this.inHoney ? 0.5 : 1);
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
      // ---- 水面行走（WaterWalkingBoots/LavaWaders 族，Player.WaterWalk 语义近似）----
      // 装备后落向液面时站在液面（vy 清零、可正常行走/起跳/重置空中能力）；
      // 按 ↓ 下潜。waterWalk2（水上漂靴）同效。
      if (this.equipStats.waterWalk && !this.headUnderwater && this.vy >= 0 && !this.inputDown) {
        this.onWaterSurface = true;
        this.vy = 0;
        this.fallStartY = null;
        // 站在液面等价落地：重置多段跳/飞行/飞毯，允许起跳离水面
        this.extraJumps = [...this.equipStats.jumpOpts];
        if (this.equipStats.wing) this.wingTime = this.equipStats.wing.time;
        this.rocketUnits = 7; this.rocketRelease = true; this.rocketUnitTicks = 0;
        this.carpetTime = 300;
        if (this.inputJump && this.surfaceJumpCd <= 0) {
          this.vy = -PLAYER_JUMP_SPEED;
          this.jumpHold = PLAYER_JUMP_TICKS;
          this.surfaceJumpCd = 24;
        }
        if (this.surfaceJumpCd > 0) this.surfaceJumpCd--;
      } else {
        this.onWaterSurface = false;
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
      }
    } else {
      if (this.inputJump && this.onGround) {
        this.vy = -PLAYER_JUMP_SPEED * (this.equipStats.jumpBoost ? 1.25 : 1);
        this.jumpHold = PLAYER_JUMP_TICKS;
      }
      if (this.inputJump && this.jumpHold > 0) {
        this.vy -= 0.22;
        this.jumpHold--;
      } else {
        this.jumpHold = 0;
      }
      // ---- 多段跳（RefreshDoubleJumps + JumpMovement 近似）：云朵/沙暴/暴雪/屁瓶族 ----
      // 空中再按跳（持续按住 + 段数剩余 + 未在急升中）→ 消费一段；各段速度原版梯度近似
      const eq = this.equipStats;
      if (this.onGround) this.extraJumps = [...eq.jumpOpts]; // 落地重置段数
      if (!this.onGround && this.inputJump && this.extraJumps.length > 0 && this.vy > -2 && this.extraJumpCd <= 0) {
        const opt = this.extraJumps.shift()!;
        const mult = opt === 'Fart' ? 1.28 : (opt === 'Sandstorm' || opt === 'Blizzard') ? 1.18 : 1.0;
        this.vy = -PLAYER_JUMP_SPEED * mult * (eq.jumpBoost ? 1.25 : 1);
        this.jumpHold = PLAYER_JUMP_TICKS;
        this.extraJumpCd = 8; // 防同帧连段
      }
      if (this.extraJumpCd > 0) this.extraJumpCd--;
      // ---- 翅膀/火箭靴飞行（WingMovement+RocketBootsMovement :26530 近似）----
      // 共用控制语义：松跳键（release）后再次按住起飞；落地回满。翅膀优先于火箭靴。
      if (this.onGround) {
        if (eq.wing) this.wingTime = eq.wing.time;
        this.rocketUnits = 7;
        this.rocketRelease = true;
        this.rocketUnitTicks = 0;
        this.carpetTime = 300;
      } else {
        if (!this.inputJump) { this.rocketRelease = true; this.wingRelease = true; }
        let flying = false;
        if (this.inputJump && this.wingRelease && eq.wing && this.wingTime > 0) {
          this.wingTime--;
          flying = true;
          this.vy = Math.min(this.vy, -eq.wing.speed * 0.85); // 上升（flySpeed 近似）
          this.fallStartY = null;
        } else if (this.inputJump && this.rocketRelease && eq.rocketBoots > 0 && this.rocketUnits > 0) {
          // 火箭靴：7 格（rocketTimeMax=7）；1 档每格 30t、2+ 档 15t（:26537）
          this.rocketUnitTicks++;
          const perUnit = eq.rocketBoots === 1 ? 30 : 15;
          if (this.rocketUnitTicks >= perUnit) {
            this.rocketUnitTicks = 0;
            this.rocketUnits--;
            if (this.rocketUnits <= 0) this.rocketRelease = false;
          }
          flying = true;
          this.vy = Math.min(this.vy, -7); // 飞行上升速度（近似 rocketSpeed）
          this.fallStartY = null;
        }
        // 翅膀滑翔（时间耗尽后按住跳缓降）+ 飞毯水平滑翔（CarpetMovement 近似：
        // 按住跳+有横移 → 缓降+横向加速，300t 用尽落地回满）
        if (!flying && this.inputJump) {
          if (eq.wing && this.vy > 2.5) this.vy = 2.5;
          if (eq.carpet && this.carpetTime > 0 && this.inputX !== 0) {
            this.carpetTime--;
            if (this.vy > 2) this.vy = 2;
            this.vx += this.inputX * 0.35;
            this.fallStartY = null;
          }
        }
      }
      // ---- 冲刺（DashMovement + DoCommonDashHandle 近似）：同向双击触发 ----
      // 1=忍者足具/水晶刺客（纯位移）2=克苏鲁护盾（冲撞伤害 30+反弹）
      if (this.inputX !== 0 && this.prevInputX === 0) {
        if (eq.dash > 0 && this.dashCd <= 0 && this.dashT !== 0 && Math.sign(this.dashT) === this.inputX) {
          this.dashDir = this.inputX;
          this.dashTicks = 15;
          this.dashCd = 30;
          this.dashHitDone = false;
        }
        this.dashT = this.inputX * 15; // 双击窗口（dashTime ±15）
      }
      if (this.dashT > 0) this.dashT--;
      else if (this.dashT < 0) this.dashT++;
      if (this.dashCd > 0) this.dashCd--;
      if (this.dashTicks > 0) {
        this.dashTicks--;
        this.vx = this.dashDir * 12.5; // 冲刺速度（原版 16.9 → 本作物理尺度近似）
        this.vy = 0;                    // 冲刺中锁定垂直速度（原版 dashing 分支）
        this.fallStartY = null;
        // 克苏鲁护盾冲撞（dashType 2，DashMovement :20791：接触 30×meleeDamage 击退 9，
        // 命中后反弹 vx=-dir*9 vy=-4 + 30t 冷却）
        if (eq.dash === 2 && !this.dashHitDone) {
          for (const e of game.enemies()) {
            const en = e as { cx?: number; cy?: number; w?: number; dead?: boolean;
              hurt?: (d: number, kx: number, ky: number, g: unknown) => boolean };
            if (en.dead || !en.hurt || en.cx === undefined || en.cy === undefined) continue;
            if (Math.abs(en.cx - this.cx) < 26 && Math.abs(en.cy - this.cy) < 30) {
              const dmg = Math.max(1, Math.round(30 * this.damageMult('melee')));
              en.hurt(dmg, this.dashDir * 9, -4, game);
              game.addDamageNumber(en.cx, en.cy, dmg, false, '#FFD080');
              this.dashHitDone = true;
              this.vx = -this.dashDir * 9;
              this.vy = -4;
              this.dashTicks = 0;
              break;
            }
          }
        }
      }
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    }
    // 松键截断上升（手感）
    if (!this.inputJump && this.vy < -2) this.vy = -2;

    // ---- 黏滞 tile（Collision.StickyTiles + Player.cs:22650-22740 1:1）----
    // 蛛网(51)：泡在网里 X/Y 双重阻尼、禁跳、不计摔伤、挣扎随机会撕破网（掉蛛丝）；
    // 蜂蜜块(229)：只阻尼、不破坏、不禁跳（原版 type!=229 才清 jump）
    {
      const stickId = TILE_BY_KEY['v_51_cobweb'] ?? 0;
      const honeyId = TILE_BY_KEY['v_229_honey_block'] ?? 0;
      const tx0 = Math.floor(this.x / TILE) - 1, tx1 = Math.floor((this.x + this.w) / TILE) + 1;
      const ty0 = Math.floor(this.y / TILE) - 1, ty1 = Math.floor((this.y + this.h) / TILE) + 1;
      let inWeb = false, inHoney = false;
      let webTx = 0, webTy = 0;
      for (let ty = ty0; ty <= ty1 && !(inWeb || inHoney); ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!st.inBounds(tx, ty)) continue;
          const t = st.type[st.idx(tx, ty)];
          if (t === 0) continue;
          const cell = { x: tx * TILE, y: ty * TILE };
          const pad = t === honeyId ? 1 : 0;
          if (this.x + this.w > cell.x - pad && this.x < cell.x + TILE + pad
            && this.y + this.h > cell.y && this.y < cell.y + TILE + 0.01) {
            if (t === stickId) { inWeb = true; webTx = tx; webTy = ty; break; }
            if (t === honeyId) { inHoney = true; break; }
          }
        }
      }
      if (inWeb || inHoney) {
        this.fallStartY = null; // fallStart 重置（黏滞中不积累摔伤）
        // X 阻尼（L22688-22699）：钳 ±1；|vx|>0.75 → ×0.85，否则 ×0.6
        this.vx = Math.max(-1, Math.min(1, this.vx));
        this.vx *= Math.abs(this.vx) > 0.75 ? 0.85 : 0.6;
        // Y 阻尼（gravDir=1，L22715-22726）：下落钳 1（缓沉）、上升钳 -5；
        // 上升 ×0.96，下落 ×0.3
        if (this.vy > 1) this.vy = 1;
        if (this.vy < -5) this.vy = -5;
        this.vy *= this.vy < 0 ? 0.96 : 0.3;
        // 丝尘（Collision.cs:3416）：纠缠中速度>0.7 时每 tick 1/30 出白色网屑
        if (inWeb && Math.abs(this.vx) + Math.abs(this.vy) > 0.7 && Math.random() < 1 / 30) {
          game.spawnParticles(webTx * TILE + 8, webTy * TILE + 8, '#C8C8CC', 1, 0.4, { life: 26, damp: 0.96, grav: 0 });
        }
        // 蜂蜜滴落尘（Player.cs:22747-22760，dust 153）：1/5 且垂直有速
        if (inHoney && (this.vy > 0.15 || this.vy < 0) && Math.random() < 1 / 5) {
          const side = this.cx > webTx * TILE + TILE / 2 ? -1 : 1;
          game.spawnParticles(this.cx + side * (this.w / 2 + 2), this.y + this.h * 0.6,
            '#E8A020', 1, 0.3, { life: 22, damp: 0.97, grav: 0.02 });
        }
        if (inWeb) {
          this.jumpHold = 0; // L22676：type != 229 → jump 清零（蛛网内禁跳）
          // 挣扎撕网（L22653-22670）：移动中 stickyBreak++，超 rand(20,100) 破坏
          if (this.vx !== 0 || this.vy !== 0) {
            this.stickyBreak++;
            if (this.stickyBreak > 20 + Math.floor(Math.random() * 80)) {
              this.stickyBreak = 0;
              // 破坏脚边第一张重叠网（原版破坏的是检测返回的那格）
              outer: for (let ty = ty0; ty <= ty1; ty++) {
                for (let tx = tx0; tx <= tx1; tx++) {
                  if (!st.inBounds(tx, ty) || st.type[st.idx(tx, ty)] !== stickId) continue;
                  st.setTile(tx, ty, 0);
                  // 破坏爆散（KillTile HitEffect 网屑四溅近似）
                  game.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#C8C8CC', 8, 1.4, { life: 30, grav: 0.05 });
                  game.spawnDrop(tx * TILE + 8, ty * TILE, VANILLA_ITEM_KEY_BY_ID[150] ?? 'vi_150_cobweb', 1);
                  break outer;
                }
              }
            }
          }
        }
      }
    }

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
      else if (fallTiles > FALL_SAFE_TILES + this.equipStats.extraFall
        && !(this.hasHorseshoe || this.equipStats.noFallDmg)) {
        const safeT = FALL_SAFE_TILES + this.equipStats.extraFall;
        const t = Math.min(1, (fallTiles - safeT) / (FALL_FATAL_TILES - FALL_SAFE_TILES));
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
    this.prevInputX = this.inputX; // 冲刺双击检测（DoCommonDashHandle release 语义）
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
  /** 多段跳剩余段（原版 RefreshDoubleJumps：落地时重置为 equipStats.jumpOpts 拷贝） */
  extraJumps: string[] = [];
  extraJumpCd = 0;
  /** 火箭靴飞行：剩余格（7 满）/ 当前格消耗 tick / 需松跳键重触发（:26530 rocketRelease） */
  rocketUnits = 0;
  rocketUnitTicks = 0;
  rocketRelease = true;
  /** 恐慌项链受击加速计时（tick，原版 panicTime=300） */
  panicTime = 0;
  /** 岩浆免疫剩余 tick（熔岩护身符族 lavaMax；离开岩浆回满） */
  lavaImmuneTicks = 0;
  /** 翅膀：剩余飞行 tick（WingStats.FlyTime）+ 需松跳键重触发 */
  wingTime = 0;
  wingRelease = true;
  /** 飞毯滑翔剩余 tick（CarpetMovement carpetTime=300） */
  carpetTime = 0;
  /** 冲刺：双击窗口（±15）/ 方向 / 持续 tick / 冷却（dashTime/dashDelay） */
  dashT = 0;
  dashDir = 1;
  dashTicks = 0;
  dashCd = 0;
  dashHitDone = false;
  prevInputX = 0;
  /** 水面行走状态（水上漂靴族：站在液面，按 ↓ 下潜） */
  onWaterSurface = false;
  inputDown = false;
  inputUp = false;
  onRope = false;

  /** 受击：防御减伤公式 max(1, dmg - defense*0.5)（移植自 Maples Player.OnAttacked）。
   *  knockback=false 用于窒息等环境伤害（只掉血不击退） */
  damage(dmg: number, srcX: number, srcY: number, knockback = true): boolean {
    if (this.iframes > 0 || this.dead) return false;
    const eq = this.equipStats;
    // 黑带/忍者大师装备 10% 闪避（Player.Hurt :9772 blackBelt 分支）
    if (eq.blackBelt && Math.random() < 0.1) return false;
    const reduction = Math.max(1, dmg - this.defense * 0.5);
    this.hp -= reduction;
    this.iframes = PLAYER_IFRAME_TICKS;
    this.sinceHurt = 0; // 受击打断自然回血
    // 恐慌项链：受击触发 5 秒移速爆发（panicTime=300，PanicSpeedBoost :25034）
    if (eq.panic) this.panicTime = 300;
    // 击退（钴护盾族 noKnockback 免疫）
    if (knockback && !eq.noKnockback) {
      const dir = this.cx < srcX ? -1 : 1;
      this.vx = dir * 3.4;
      this.vy = -3;
    }
    return true;
  }

  /** ApplyTouchDamage（Player.cs:28507）1:1:直接伤害(护甲结算)→灼烧/流血 buff→
   *  窒息延迟→荆棘族触碰毁块。伤害被完全抵消(含无敌帧)时跳过 buff 授予(原版 num83==0 分支) */
  private suffocateDelay = 0;
  private applyTouchDamage(game: GameHooks, ht: HurtTile): void {
    let blocked = false;
    const dmg = TOUCH_IMMEDIATE.get(ht.type);
    if (dmg !== undefined) {
      this.lastDamageCause = { kind: 'default' }; // PlayerDeathReason.ByOther(3) → 默认包
      if (!this.damage(dmg, this.cx, this.y - 10, false)) {
        blocked = true;
      } else {
        game.playSfx('hurt');
        game.addDamageNumber(this.cx, this.y, Math.max(1, Math.round(dmg - this.defense * 0.5)), false, '#FF5050');
      }
    }
    if (!blocked) {
      if (TOUCH_HOT.has(ht.type)) this.buffs.apply(BuffType.Burning, 20 / 60);   // AddBuff(67,20)
      if (TOUCH_BLEEDING.has(ht.type)) this.buffs.apply(BuffType.Bleeding, (600 + Math.random() * 600) / 60); // AddBuff(30,600-1200)
    }
    if (SUFFOCATE.has(ht.type)) {
      if (this.suffocateDelay < 5) this.suffocateDelay++;       // suffocateDelay<5 递增
      else this.buffs.apply(BuffType.Suffocation, 1 / 60);      // 满后每 tick AddBuff(68,1)
    } else {
      this.suffocateDelay = 0;
    }
    if (TOUCH_DESTROY.has(ht.type)) {
      game.world.breakTileAt(ht.x, ht.y); // TouchDamageDestroyTile → KillTile
    }
  }

  draw() { /* 由 Renderer 统一绘制 */ }
}

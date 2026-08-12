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
import { LuckState } from '../stats/Luck';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { statOfInternal } from '../data/vanillaItemStats';
import { wingStatOf } from '../data/vanillaWingStats';
import { accFxOfInternal } from '../data/vanillaAccFx';
import { ARMOR_SET_BONUSES } from '../data/vanillaArmorSets';
import { SUMMON_GEAR, SUMMON_SET, type SummonSetFx } from '../data/vanillaSummonStats';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import { hurtTiles, liquidCollision, TOUCH_IMMEDIATE, TOUCH_HOT, TOUCH_BLEEDING, SUFFOCATE, TOUCH_DESTROY, type HurtTile } from '../stats/TouchDamage';
import { findShimmerFreeSpot, shimmerTeleportPos } from '../stats/Shimmer';

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
  /** PVE 死亡计数（Player.numberOfDeathsPVE，PL:53840；存档 player 段持久化） */
  deathsPve = 0;
  /** 收税计时（Player.cs:793 taxTimer；taxRate=3600 即每游戏小时一结） */
  taxTimer = 0;
  /** 蜂蜜浸入（原版 honeyWet，Player.cs:27436-27438）：授予 Honey buff(48,1800t) 的来源 */
  inHoney = false;
  /** 微光浸入（原版 shimmerWet，Player.cs:27420-27424：Collision.shimmer 盒命中） */
  inShimmer = false;
  /** 微光化态（buff 353，Player.cs:11381-11388）：frozen 封输入 + fallStart 重置 +
   *  受击免疫（Hurt :37591-37595 直接 0）+ 慢沉（:24117-24119 ×0.9） */
  shimmering = false;
  /** 微光滞留 tick（TryToShimmerUnstuck :28378：钳 0-7200，shimmering +1/否则 -10） */
  timeShimmering = 0;
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
  /** 死亡画面淡入（Player.cs:16873：dead 时 +2/tick 钳 255；GetDeathAlpha :53284 消费） */
  immuneAlpha = 0;
  // 摔伤追踪
  private fallStartY: number | null = null;
  /** 蛛网挣扎计数（原版 stickyBreak，Player.cs:22653） */
  private stickyBreak = 0;
  private surfaceJumpCd = 0;  // 水面起跳冷却
  sinceHurt = 0;               // 距上次受击 tick（自然回血计时；渲染层读取做心心跳动效）
  /** 本 tick 落地冲击速度（碰撞前 vy≥3 落地才非 0；Game 消费：起爆器 411 坠落触发） */
  landImpactVy = 0;
  private regenAccum = 0;
  stepRenderY = 0;             // 跨台阶的渲染高度补偿（缓动到 0，消除瞬移顿挫）
  stepUp = true;               // Collision.StepUp 自动上台阶（moveAndCollide 内消费）
  /** 鞭命中授予的玩家 buff（WhipTagEffect.PlayerBuffId → 剩余 tick；
   *  效果实装（:9790-9802）：311 镰鞭=鞭攻速+35%、308 剑鞭=+25%、314 荆棘鞭=+12%
   *  ——Game 鞭 useTime 结算读取；312/365 登记持续期（效果端暂不接） */
  whipBuffs: Record<number, number> = {};
  /** 星云层数（0-3，8s 刷新；套装 on-mana-spent 触发近似原版击杀掉 booster） */
  nebulaStacks = 0;
  private nebulaT = 0;
  /** 甲虫攻击球（0-3）：近战命中蓄能，受击掉一颗 */
  beetleOrbs = 0;
  private beetleCharge = 0;
  /** 潜行 0(可见)-1(满)：蘑菇矿/星璇套按住↓静立蓄积（:25500/:25542） */
  stealth = 0;
  private sharpenedCd = 0;
  /** BOC 受击脉冲（fixedUpdate 消费：buff 321 + 困惑近敌） */
  bocPulse = 0;
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
    wing: { logic: number; time: number; accSpeed: number; accelMult: number; hover: boolean } | null;
    dash: number; blackBelt: boolean; bees: boolean; carpet: boolean;
    jumpSpd: number; flipper: boolean; longInvince: boolean; spikedBoots: boolean;
    treasureMagnet: boolean; goldRing: boolean; luckyCoin: boolean; discount: boolean;
    arrowDmg: number; ammoSave: boolean; kbGlove: boolean; yoyoString: boolean;
    arrowStack: number;      // 箭袋 additiveStack（仅箭，:14785）
    shroomiteType: 'arrow' | 'bullet' | 'rocket' | null;
    shroomiteSet: boolean; vortexSet: boolean; nebulaSet: boolean; beetleOff: boolean;
    wolfAcc: boolean; boc: boolean;
    tileSpeed: boolean; wallSpeed: boolean; tileRange: boolean; pStone: boolean;
    counterWeight: boolean; manaMagnet: boolean; magicCuffs: boolean; manaFlower: boolean;
    setBonus: ReturnType<typeof activeArmorSetBonus> | null;
    manaCostMul: number;
    // ---- 召唤师链（vanillaSummonStats：ApplyEquipFunctional type if-chain 1:1）----
    minionSlots: number;   // maxMinions += N（散件+套装合计）
    minionDmg: number;     // minionDamage += X（加算乘区，散件+套装合计）
    minionKB: number;      // minionKB += N
    sentrySlots: number;   // maxTurrets += N
    whipRange: number;     // whipRangeMultiplier += X
    whipSpd: number;       // 鞭 useTime 倍率（黑曜套 1/1.15）
    summonSet: SummonSetFx | null;
  } {
    /** 当前套装匹配（armor[0-2] 的 hs/bs/ls 槽序号 → ARMOR_SET_BONUSES；通配 `${hs}|${bs}|*` 兜底） */
    function activeArmorSetBonus(self: Player) {
      const st0 = statOfInternal(self.inv.armor[0]?.id ?? -1);
      const st1 = statOfInternal(self.inv.armor[1]?.id ?? -1);
      const st2 = statOfInternal(self.inv.armor[2]?.id ?? -1);
      if (!st0?.hs || st1?.bs === undefined || st2?.ls === undefined) return null;
      return ARMOR_SET_BONUSES[`${st0.hs}|${st1.bs}|${st2.ls}`]
        ?? ARMOR_SET_BONUSES[`${st0.hs}|${st1.bs}|*`] ?? null;
    }
    let def = 0, mana = 0, life = 0;
    let dmgMelee = 0, dmgRanged = 0, dmgMagic = 0;
    let critMelee = 0, critRanged = 0, critMagic = 0;
    let move = 0, meleeSpeed = 0, runSpeed = 0;
    let extraFall = 0, lavaMax = 0, armorPen = 0, rocketBoots = 0;
    let autoJump = false, fireWalk = false, noKnockback = false, noFallDmg = false;
    let desertBoots = false, waterWalk = false, jumpBoost = false, panic = false, starCloak = false;
    const jumpSet = new Set<string>();
    let wing: { logic: number; time: number; accSpeed: number; accelMult: number; hover: boolean } | null = null;
    let dash = 0, blackBelt = false, bees = false, carpet = false;
    let jumpSpd = 0, arrowDmg = 0;
    let wolfAcc = false, boc = false;
    let shroomiteType: 'arrow' | 'bullet' | 'rocket' | null = null;
    let shroomiteSet = false, vortexSet = false, nebulaSet = false, beetleOff = false;
    let flipper = false, longInvince = false, spikedBoots = false;
    let treasureMagnet = false, goldRing = false, luckyCoin = false, discount = false;
    let ammoSave = false, kbGlove = false, yoyoString = false;
    let tileSpeed = false, wallSpeed = false, tileRange = false, skyStone = false, pStone = false, counterWeight = false;
    let manaMagnet = false, magicCuffs = false, manaFlower = false;
    let manaCostMul = 1;
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) {
      const s = this.inv.armor[i];
      if (!s) continue;
      const fx = accFxOfInternal(s.id);
      // 翅膀（Item.wingSlot>0 → WingStatsInitializer 全字段；多翅膀取首个）
      const wingSlot = statOfInternal(s.id)?.wing;
      if (wingSlot && wingSlot > 0 && !wing) {
        const ws = wingStatOf(wingSlot);
        wing = { logic: wingSlot, time: ws.time, accSpeed: ws.accSpeed, accelMult: ws.accelMult, hover: ws.hover };
      }
      // 悠悠球线（Item.stringColor>0 → yoyoString，Player.cs:14170）
      if (statOfInternal(s.id)?.str) yoyoString = true;
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
        if (fx.jumpSpd) jumpSpd = Math.max(jumpSpd, fx.jumpSpd);
        if (fx.arrowDmg) arrowDmg += fx.arrowDmg; // 箭袋 +0.1（仅箭吃，见 rangedDamageMult）
        if (fx.nightWolf) wolfAcc = true;
        if (fx.brainOfConfusion) boc = true;
        if (fx.flipper) flipper = true;
        if (fx.longInvince) longInvince = true;
        if (fx.spikedBoots) spikedBoots = true;
        if (fx.treasureMagnet) treasureMagnet = true;
        if (fx.goldRing) goldRing = true;
        if (fx.luckyCoin) luckyCoin = true;
        if (fx.discount) discount = true;
        if (fx.ammoSave || fx.huntressSave) ammoSave = true;
        if (fx.kbGlove) kbGlove = true;
        if (fx.yoyoString) yoyoString = true;
        if (fx.tileSpeed) tileSpeed = true;
        if (fx.wallSpeed) wallSpeed = true;
        if (fx.tileRange) tileRange = true;
        if (fx.skyStone) skyStone = true;
        if (fx.pStone) pStone = true;
        if (fx.manaMagnet) manaMagnet = true;
        if (fx.magicCuffs) magicCuffs = true;
        if (fx.manaFlower) manaFlower = true;
        if (fx.counterWeight) counterWeight = true;
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
    // 沙丘行者靴（desertBoots：沙漠区提速近似——原版 ZoneDesert 时 maxRunSpeed+3/段）
    if (desertBoots && this.zoneDesert) move += 0.25;
    // runSpeed：accRunSpeed=6 vs 基础 maxRunSpeed=3 → 移速倍率贡献（取最高不叠）
    const moveMult = 1 + move + (runSpeed > 0 ? runSpeed / 3 - 1 : 0);
    // 多段跳按原版优先序排列（JumpMovement 消费序）
    const JUMP_ORDER = ['Cloud', 'Sail', 'Sandstorm', 'Blizzard', 'Fart', 'Tsunami', 'Unicorn', 'Basilisk', 'WallOfFleshGoat', 'Santank'];
    const jumpOpts = JUMP_ORDER.filter((j) => jumpSet.has(j));
    // ---- 召唤师链（vanillaSummonStats：ApplyEquipFunctional armor[0-9] 单遍语义 =
    //      盔甲三件 + 配饰各扫一遍 SUMMON_GEAR；套装查 SUMMON_SET）----
    let minionSlots = 0, minionDmg = 0, minionKB = 0, sentrySlots = 0, whipRange = 0;
    // 原版 ApplyEquipFunctional armor[0-9] 单遍 = 盔甲三件 + 配饰各扫（SummonFx 同表直查）
    const sumFx = (s: { id: number } | null): void => {
      if (!s) return;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      const fx = vid >= 0 ? SUMMON_GEAR[vid] : undefined;
      if (!fx) return;
      if (fx.slot) minionSlots += fx.slot;
      if (fx.sentry) sentrySlots += fx.sentry;
      if (fx.dmg) minionDmg += fx.dmg;
      if (fx.kb) minionKB += fx.kb;
      if (fx.whipRange) whipRange += fx.whipRange;
    };
    for (let i = 0; i < 3; i++) sumFx(this.inv.armor[i]);
    // 套装/头盔 type 检测（vid 直查）：蘑菇矿头 1546箭/1547弹/1548火箭（:13274-13288）
    const aVid = (i: number): number => {
      const d = ITEM_DEFS[this.inv.armor[i]?.id ?? -1];
      return d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    };
    const [hVid, bVid, lVid] = [aVid(0), aVid(1), aVid(2)];
    if (hVid === 1546) shroomiteType = 'arrow';
    else if (hVid === 1547) shroomiteType = 'bullet';
    else if (hVid === 1548) shroomiteType = 'rocket';
    shroomiteSet = (hVid >= 1546 && hVid <= 1548) && bVid === 1549 && lVid === 1550;
    vortexSet = hVid === 2757 && bVid === 2758 && lVid === 2759;
    nebulaSet = hVid === 2760 && bVid === 2761 && lVid === 2762;
    beetleOff = hVid === 2199 && bVid === 2200 && lVid === 2202; // 进攻甲（壳 2201 是防御版）
    for (let i = ACC_ARMOR_START; i < ACC_ARMOR_START + 7; i++) sumFx(this.inv.armor[i]);
    // 盔甲套装加成（vanillaArmorSets.ts：槽序号三键匹配）
    const sb = activeArmorSetBonus(this);
    if (sb) {
      if (sb.def) def += sb.def;
      if (sb.mana) mana += sb.mana;
      if (sb.move) move += sb.move;
      if (sb.meleeSpd) meleeSpeed += sb.meleeSpd;
      if (sb.dmgMelee) dmgMelee += sb.dmgMelee;
      if (sb.dmgRanged) dmgRanged += sb.dmgRanged;
      if (sb.dmgMagic) dmgMagic += sb.dmgMagic;
      if (sb.critMelee) critMelee += sb.critMelee;
      if (sb.critRanged) critRanged += sb.critRanged;
      if (sb.critMagic) critMagic += sb.critMagic;
      if (sb.noKnockback) noKnockback = true;
      if (sb.fireWalk) fireWalk = true;
      if (sb.ammoCost80) ammoSave = true;
      if (sb.manaCostMul !== undefined) manaCostMul = sb.manaCostMul;
    }
    // 召唤系套装（SUMMON_SET 槽序键；散件效果已在上扫，此处只叠套装层）
    const summonSet = (() => {
      const st0 = statOfInternal(this.inv.armor[0]?.id ?? -1);
      const st1 = statOfInternal(this.inv.armor[1]?.id ?? -1);
      const st2 = statOfInternal(this.inv.armor[2]?.id ?? -1);
      if (!st0?.hs || st1?.bs === undefined || st2?.ls === undefined) return null;
      const s = SUMMON_SET[`${st0.hs}|${st1.bs}|${st2.ls}`] ?? SUMMON_SET[`${st0.hs}|${st1.bs}|*`];
      if (!s) return null;
      if (s.slot) minionSlots += s.slot;
      if (s.sentry) sentrySlots += s.sentry;
      if (s.dmg) minionDmg += s.dmg;
      if (s.whipRange) whipRange += s.whipRange;
      return s;
    })();
    // 天界石族复合（Player.cs:12558-12570：life+2/def+4/近战速+10%/全系伤+10%/全系暴+2%）
    if (skyStone) {
      life += 2; def += 4; meleeSpeed += 0.1;
      dmgMelee += 0.1; dmgRanged += 0.1; dmgMagic += 0.1;
      critMelee += 2; critRanged += 2; critMagic += 2;
    }
    return {
      def, mana, hpPerSec: life / 2, // lifeRegen 单位 = 每半秒（NaturalLifeRegen 语义）
      dmgMelee, dmgRanged: dmgRanged + arrowDmg, dmgMagic,
      critMelee, critRanged, critMagic,
      moveMult, meleeSpeed,
      extraFall, lavaMax, armorPen, rocketBoots,
      autoJump, fireWalk, noKnockback, noFallDmg, desertBoots,
      waterWalk, jumpBoost, panic, starCloak,
      jumpOpts,
      wing, dash, blackBelt, bees, carpet,
      jumpSpd, flipper, longInvince, spikedBoots,
      treasureMagnet, goldRing, luckyCoin, discount,
      arrowDmg, ammoSave, kbGlove, yoyoString,
      arrowStack: arrowDmg, shroomiteType, shroomiteSet, vortexSet, nebulaSet, beetleOff,
      wolfAcc, boc,
      tileSpeed, wallSpeed, tileRange, pStone, counterWeight,
      manaMagnet, magicCuffs, manaFlower,
      setBonus: sb, manaCostMul,
      minionSlots, minionDmg, minionKB, sentrySlots, whipRange,
      whipSpd: summonSet?.whipSpd ?? 1,
      summonSet,
    };
  }
  get maxHp(): number {
    // 生命力药水（Lifeforce :9883）：statLifeMax2 += statLifeMax/5/20*20 → +20%（按 20 取整）
    const lf = this.buffs.has(BuffType.Lifeforce) ? Math.floor(this.baseMaxHp / 5 / 20) * 20 : 0;
    return this.baseMaxHp + this.buffs.healthBonus + lf;
  }
  get maxMana(): number {
    return this.baseMaxMana + this.equipStats.mana + this.buffs.manaMaxBonus; // 星力手环族等 + 水晶球预见 +20（:11481)
  }
  /** 随从/鞭伤害乘区（GetWeaponDamageMultiplier summon → minionDamage 链：独立第四链，
   *  不再复用 magic——MagicPower 等 magic-only 来源不吃召唤；四系通用来源照常） */
  get summonDamageMult(): number {
    return this.damageMult('summon');
  }
  /** 随从上限（Player.cs:9855+ buff + ApplyEquipFunctional 散件/配饰 + 套装层） */
  get maxMinions(): number {
    return 1 + (this.buffs.has(BuffType.Bewitched) ? 1 : 0)
      + (this.buffs.has(BuffType.Summoning) ? 1 : 0)
      + this.equipStats.minionSlots;
  }
  /** 哨兵上限（maxTurrets 链 :9863 War Table buff 未实装暂缺 + 散件/套装） */
  get maxSentries(): number {
    return 1 + this.equipStats.sentrySlots;
  }
  get thornsActive(): boolean {
    return this.buffs.hasThorns;
  }
  /** 近战攻速倍率（猛爪手套 ×2 + 装备 meleeSpeed 67-80 词缀/狂战士手套累加 + 醉酒近战速 ×1.1） */
  get attackSpeedMult(): number {
    return (1 + this.equipStats.meleeSpeed) * (this.hasFeralClaws ? 2 : 1)
      * (this.buffs.has(BuffType.Tipsy) ? 1.1 : 1)
      * (this.buffs.has(BuffType.Werewolf) ? 1.051 : 1)      // 狼人 meleeSpeed += 5.1%（:11489）
      * (1 + 0.1 * this.beetleOrbs)                           // 甲虫攻击球攻速（:10071+）

      * (1 + this.buffs.wellFedMeleeSpeed);   // 食物近战速 +5/7.5/10%（:11528+）
  }
  /** 近战伤害加成（猛爪手套 +5） */
  get meleeDamageBonus(): number {
    return this.hasFeralClaws ? 5 : 0;
  }
  /** 全系伤害加成装备聚合（ApplyEquipFunctional dmgX 段；四系分道——summon 是独立
   *  minionDamage 链：装备走 SUMMON_GEAR/SET，不含 magic-only 来源） */
  damageMult(kind: 'melee' | 'ranged' | 'magic' | 'summon'): number {
    const st = this.equipStats;
    if (kind === 'summon') {
      // minionDamage 链（Player.cs GetWeaponDamageMultiplier summon 分支）：仅四系通用
      // 来源（怒气/食物）+ 召唤装备链；MagicPower/Archery 等 class 来源不吃
      let m = 1 + st.minionDmg;
      if (this.buffs.has(BuffType.Rage)) m += 0.1;
      if (this.buffs.has(BuffType.BrainOfConfusionBuff)) m += 0.1; // BOC 321（:9639-9646）
      m += this.buffs.wellFedDamage;
      m += 0.15 * this.nebulaStacks;   // 星云 179-181 每级四系 +15%（:10116）
      return m;
    }
    let m = 1 + (kind === 'melee' ? st.dmgMelee : kind === 'ranged' ? st.dmgRanged : st.dmgMagic);
    if (kind === 'magic') {
      m += this.buffs.magicDmgBonus;            // MagicPower +20%（:9669）
      m *= this.buffs.manaSickMagicMult;        // 魔力眩晕最高 -25% 线性恢复（:10003/:25616）
    }
    if (kind === 'ranged') m *= this.buffs.arrowDmgMult;   // Archery ×1.1（:9712,ranged 近义）
    // R1 药水：怒气(117)全系 +10%（:9947）；醉酒(25)近战 +10%（:11513）
    if (this.buffs.has(BuffType.Rage)) m += 0.1;
    if (kind === 'melee') {
      if (this.buffs.has(BuffType.Tipsy)) m += 0.1;
      if (this.buffs.has(BuffType.Werewolf)) m += 0.051;      // 狼人（:11488）
      m += 0.1 * this.beetleOrbs;                              // 甲虫攻击球每颗 +10%（:10071+）
    }
    m += this.buffs.wellFedDamage;   // 食物三档全系 +5/7.5/10%（:11527+）
    m += 0.15 * this.nebulaStacks;   // 星云四系 +15%/层
    return m;
  }
  /** 远程分道乘区（Player.cs:3820-3824 bowEffectiveDamage 拆分）：
   *  箭 = (rangedDamage + 箭袋stack) × Archery × 蘑菇矿箭头 1.12 × 潜行增伤；
   *  弹/火箭 = rangedDamage × 对应蘑菇矿头 1.12 × 潜行；其他（飞镖等）= rangedDamage */
  rangedDamageMult(kind: 'arrow' | 'bullet' | 'rocket' | 'other'): number {
    const st = this.equipStats;
    const base = this.damageMult('ranged'); // rangedDamage 全链（装备+四系 buff）
    const stealthBonus = 1 + (1 - this.stealth) * (st.vortexSet ? 0.8 : st.shroomiteSet ? 0.6 : 0);
    if (kind === 'arrow') {
      return (base + st.arrowStack) * this.buffs.arrowDmgMult
        * (st.shroomiteType === 'arrow' ? 1.12 : 1) * stealthBonus;
    }
    if (kind === 'bullet') return base * (st.shroomiteType === 'bullet' ? 1.12 : 1) * stealthBonus;
    if (kind === 'rocket') return base * (st.shroomiteType === 'rocket' ? 1.12 : 1) * stealthBonus;
    return base;
  }
  /** 近战护甲穿透（磨刀 159：meleeArmorPenetration += 12，仅近战/投掷） */
  get meleeArmorPen(): number {
    return this.buffs.has(BuffType.Sharpened) ? 12 : 0;
  }
  /** 星云套：耗魔 15% 概率叠层（近似原版击杀掉 booster 拾取；8s 全层刷新） */
  onManaSpent(): void {
    if (!this.equipStats.nebulaSet || Math.random() >= 0.15) return;
    this.nebulaStacks = Math.min(3, this.nebulaStacks + 1);
    this.nebulaT = 480;
  }
  /** 甲虫进攻套：近战命中蓄能（45 次/球，满 3 球；受击掉球见 damage()） */
  onMeleeHit(): void {
    if (!this.equipStats.beetleOff) return;
    if (++this.beetleCharge >= 45) { this.beetleCharge = 0; this.beetleOrbs = Math.min(3, this.beetleOrbs + 1); }
  }
  /** 装备暴击率（critX 段 + 词缀 67/68） */
  critChance(kind: 'melee' | 'ranged' | 'magic'): number {
    const st = this.equipStats;
    let c = kind === 'melee' ? st.critMelee : kind === 'ranged' ? st.critRanged : st.critMagic;
    // R1 药水：暴怒(115)全系暴击 +10（:9890）；醉酒(25)近战暴击 +2（:11515）
    if (this.buffs.has(BuffType.Wrath)) c += 10;
    if (this.buffs.has(BuffType.BrainOfConfusionBuff)) c += 10; // BOC（:9639）
    if (kind === 'melee' && this.buffs.has(BuffType.Tipsy)) c += 2;
    if (kind === 'melee' && this.buffs.has(BuffType.Werewolf)) c += 2; // 狼人（:11493）
    if (kind === 'ranged') {
      if (this.equipStats.shroomiteType) c += 5; // 蘑菇矿头 rangedCrit+5（:13274+）
      c += Math.round((1 - this.stealth) * (this.equipStats.vortexSet ? 20 : 10)); // 潜行暴击（:25506/:25544）
    }
    c += this.buffs.wellFedCrit;    // 食物三档全系暴击 +2/3/4（:11525+）
    return c;
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
    // 自然回血：脱离战斗 5 秒后每秒缓回 1 点（流血 Bleeding 清 lifeRegenTime → 阻断,:18998；
    // 遮挡 Obstructed 163 的 bleed 同门——:11424 bleed=true 同消费点）
    this.sinceHurt++;
    if (this.sinceHurt > 300 && this.hp > 0 && this.hp < this.maxHp
      && !this.buffs.has(BuffType.Bleeding) && !this.buffs.obstructed) {
      this.regenAccum += dt;
      if (this.regenAccum >= 1) {
        this.regenAccum -= 1;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }
    // 上限收缩时钳制
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    // 魔力自然回复(原版 Player.manaRegen:越满越快,简化为每秒 maxMana*0.08+1;
    // 魔力再生药水 manaRegenBuff:静止加成常开+满额倍率+×1.15 ≈ 2.3 倍,:19238-19270)
    if (this.mana < this.maxMana) {
      this.manaRegenAccum += dt;
      if (this.manaRegenAccum >= 1) {
        this.manaRegenAccum -= 1;
        const base = Math.ceil(this.maxMana * 0.08) + 1;
        // 瓶中星(158)：manaRegenDelay×0.5（:9629）——简化回蓝模型下等价 ×2 速率
        const starMult = this.buffs.has(BuffType.StarInBottle) ? 2 : 1;
        this.mana = Math.min(this.maxMana, this.mana + Math.round(base * (this.buffs.manaRegenBuff ? 2.3 : 1) * starMult));
      }
    }

    // 液体检测：身体采样在脚底上方固定 4px（贴脚即入水，不随身高缩放）
    const liq = world.store.liquid[world.store.idx(
      Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE),
    )];
    const wasInWater = this.inWater;
    // wet 判定排除微光（Collision.cs:1418 WetCollision 只认 !lava && !shimmer）
    this.inWater = liq > 100 && world.store.liquidType[
      world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE))] !== 4;
    // 入水瞬间：水花声（出水不响）
    if (this.inWater && !wasInWater) game.playSfx('splash');
    const centerIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE));
    // waterWalk 时缩高 6px 判定(原版 num80,Player.cs:27349/27352:水面行走不因脚尖触浆受伤)
    // 水上行走（装备 waterWalk 族 ∪ 水上行走药水 buff 15,:9706）
    const canWaterWalk = this.equipStats.waterWalk || this.buffs.canWaterWalk;
    const lavaProbeH = canWaterWalk ? this.h - 6 : this.h;
    this.inLava = liquidCollision(world.store, this.x, this.y, this.w, lavaProbeH, 2); // LavaCollision 盒判定
    // 蜂蜜浸入（Player.cs:27436）：湿判定命中蜂蜜 → AddBuff(48, 1800t=30s) + honeyWet。
    // BuffState.apply 是 max 合并（AddBuff 语义），浸着恒 30s，离开后自然倒计时
    this.inHoney = world.store.liquidType[centerIdx] === 3 && liq > 30;
    if (this.inHoney) this.buffs.apply(BuffType.Honey, 30);
    // 微光浸入（Player.cs:27420-27434）：盒命中微光 → shimmerWet；本地玩家非免疫且
    // 脚格是微光且在地狱层之上 → AddBuff(353, 60)（每 tick 刷新 = 浸着恒微光化）。
    // shimmerImmune（:14981 原版旗标来源未移植）恒 false；地狱层内微光不生效
    // （:11391-11397 position.Y/16 > UnderworldLayer → DelBuff）
    this.inShimmer = world.store.liquidType[centerIdx] === 4 && liq > 30;
    this.shimmering = this.inShimmer && this.y / TILE < world.lavaLine;
    // TryToShimmerUnstuck（:28377-28389）：timeShimmering 钳 0-7200（shimmering +1/
    // 否则 -10）；≥3600 或 ≥1200 且有任意输入 → ShimmerUnstuck 传送脱困
    this.timeShimmering = Math.max(0, Math.min(7200,
      this.timeShimmering + (this.shimmering ? 1 : -10)));
    if (this.shimmering || this.timeShimmering > 0) {
      const anyInput = this.inputX !== 0 || this.inputJump || this.inputUp || this.inputDown;
      if (this.timeShimmering >= 3600 || (this.timeShimmering >= 1200 && anyInput)) {
        this.shimmerUnstuck(game, world);
      }
    }
    const headIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + 8) / TILE), // 鼻子位置（头顶下方半格）
    );
    const headLiq = world.store.liquid[headIdx];
    const prevHeadUnderwater = this.headUnderwater; // 旧值（判定"刚出水"必须用更新前状态）
    // 气口消耗只对水（原版 DrownCollision 不含水蜜/岩浆——蜂蜜和岩浆不会淹死）
    this.headUnderwater = headLiq > 40 && world.store.liquidType[headIdx] === 1;
    // 岩浆伤害 1:1（Player.cs:27350-27440）：盒判定接触 → lavaTime 宽限（护身符族）耗尽后
    // 单发 80（Hurt 全结算：防御+无敌帧）+ 着火 OnFire 7s（AddBuff(24,420)）；
    // 无敌帧承担原版 hurtCooldowns[Lava] 冷却
    if (this.inLava && !this.buffs.obsidianSkin) {
      // 黑曜石皮 buff:lavaImmune 完全豁免（Player.cs:9573）,不伤不火
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
    } else if (!this.inLava) {
      this.lavaAccum = 0;
      // 离浆宽限逐步恢复(Player.cs:27405:lavaTime < lavaMax 时每 tick +1,
      // 非立即回满——护身符 7s 宽限需要等价时间回充)
      const lavaMax = this.equipStats.lavaMax;
      if (lavaMax > 0 && this.lavaImmuneTicks < lavaMax) this.lavaImmuneTicks++;
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
    const ht = hurtTiles(world.store, this.x, this.y, this.w, this.h,
      this.equipStats.fireWalk || this.buffs.obsidianSkin); // 黑曜石皮含 fireWalk（:9576）
    if (ht) this.applyTouchDamage(game, ht);

    // 气口：头部浸水时 23.33 秒耗尽，耗尽后每秒掉 10 血；出水立即恢复；
    // 鱼鳃 buff（gills,:9656）水下呼吸不耗
    const wasHead = prevHeadUnderwater;
    if (this.headUnderwater && !this.buffs.gills) {
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
    // 冰冻 Frozen(47,Player.cs:9749 frozen=true)：整帧封移动输入——跳跃/攀绳/矿车
    // 同读这些标志,一并归零(原版 Update 段 control* 清零语义)。帧末由 Game 重灌输入
    if (this.buffs.has(BuffType.Frozen)) { this.inputX = 0; this.inputJump = false; this.inputUp = false; this.inputDown = false; }
    const ix = this.inputX;
    let accel = PLAYER_WALK_ACCEL;
    if (!this.onGround && this.equipStats.wing && this.vy !== 0) {
      const ws = wingStatOf(this.equipStats.wing.logic);
      const hoverDownMove = this.inputDown && this.inputJump && ws.hover && this.wingTime > 0;
      accel *= hoverDownMove && ws.hover ? ws.hoverAccelMult : ws.accelMult;
    }
    if (ix !== 0) {
      this.vx += ix * accel * (this.inWater ? 0.6 : 1) * speedMult;
      this.facing = ix;
    } else {
      this.vx *= this.onGround ? PLAYER_FRICTION : PLAYER_AIR_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    let maxSpd = PLAYER_WALK_MAX * (this.inWater ? 0.55 : 1) * speedMult;
    // 翅膀空中横移上限覆盖（WingAirLogicTweaks cs:28843-48：AccRunSpeedOverride；
    // hover 下落态改用 DownHoverSpeedOverride 档）
    if (!this.onGround && this.equipStats.wing && this.vy !== 0) {
      const ws = wingStatOf(this.equipStats.wing.logic);
      const hoverDownMove = this.inputDown && this.inputJump && ws.hover && this.wingTime > 0;
      const spd = hoverDownMove && ws.hoverSpeed > 0 ? ws.hoverSpeed : ws.accSpeed;
      if (spd > maxSpd) maxSpd = spd;
    }
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
    // 微光物理（Player.cs:24115-24127 else if (shimmerWet || shimmering) 分支）
    if (this.inShimmer && !this.shimmering) {
      // 非微光化态浸微光：gravity 0.15（水 0.3 的一半）+ jumpHeight 23/jumpSpeed 5.51
      // （:24219-24223）——更轻、可大跳离池；微光不计摔伤
      if (this.inputJump) this.vy = Math.max(this.vy - 0.62, -5.5);
      this.vy += GRAVITY * 0.15;
      this.vy = Math.max(-5.5, Math.min(3.0, this.vy));
      this.fallStartY = null;
    } else if (this.shimmering) {
      // buff 353（:11381-11388）：frozen 封输入 + fallStart 重置（免摔伤）；
      // 物理 :24117-24119 gravity/maxFall ×0.9（近似正常慢沉，原地等脱困传送）
      this.inputX = 0; this.inputJump = false; this.inputUp = false; this.inputDown = false;
      this.vy = Math.min(this.vy + GRAVITY * 0.7 * 0.9, MAX_FALL_SPEED * 0.9);
      this.fallStartY = null;
    } else
    // 跳跃 / 游泳
    if (this.inWater) {
      // ---- 水面行走（WaterWalkingBoots/LavaWaders 族，Player.WaterWalk 语义近似）----
      // 装备后落向液面时站在液面（vy 清零、可正常行走/起跳/重置空中能力）；
      // 按 ↓ 下潜。waterWalk2（水上漂靴）同效。
      if (canWaterWalk && !this.headUnderwater && this.vy >= 0 && !this.inputDown) {
        this.onWaterSurface = true;
        this.vy = 0;
        this.fallStartY = null;
        // 站在液面等价落地：重置多段跳/飞行/飞毯，允许起跳离水面
        this.extraJumps = [...this.equipStats.jumpOpts];
        const eqW = this.equipStats;
        this.wingTime = eqW.wing ? eqW.wing.time : 0;
        this.rocketTime = 7; this.rocketRelease = true; this.rocketDelay = 0;
        this.canCarpet = true;
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
        // 全浸没：游泳上浮（脚蹼族 accFlipper：提速 1.5×）
        const swimMult = (this.equipStats.flipper || this.buffs.has(BuffType.FlipperPotion)) ? 1.5 : 1;
        this.vy = Math.max(this.vy - 0.62 * swimMult, -4.4 * swimMult);
      }
      if (this.surfaceJumpCd > 0) this.surfaceJumpCd--;
      this.vy += GRAVITY * 0.3;
      this.vy = Math.max(-4.6, Math.min(3.0, this.vy));
      this.fallStartY = null;
      }
    } else {
      const gd = this.gravDir;
      if (this.inputJump && this.onGround) {
        // 跳跃速度 = 基础 + jumpSpeedBoost（蛙腿族 +1.6，Player.jumpSpeedBoost :22427）；
        // 重力倒置时方向取反（gravDir，Player.cs:3207 全部 vy 乘 gravDir 语义）
        this.vy = -(PLAYER_JUMP_SPEED + this.equipStats.jumpSpd) * gd;
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
      // ---- 翅膀/火箭靴/飞毯 1:1（Player.Update :26388-27092 + WingMovement :21746 +
      //      CarpetMovement :21568 + RocketBoots :26548-26628）----
      const wings = eq.wing ? eq.wing.logic : 0;   // wingsLogic = armor.wingSlot（:12584）
      const hoverDown = this.inputDown;            // TryingToHoverDown（保持态近似省略）
      const JS = PLAYER_JUMP_SPEED;                // jumpSpeed 基准（原版 5.301 系按本地尺度）
      // 落地重置（原版 :26169 地面块 + :26490 vy==0&&releaseJump 语义并入）
      // 松跳重触发（原版 :20765 松跳段独立于地面状态——rocketRelease/wingRelease）
      if (!this.inputJump) { this.rocketRelease = true; this.wingRelease = true; }
      if (this.onGround) {
        this.wingTime = eq.wing ? eq.wing.time : 0;   // :26169 = wingTimeMax（FlyTime）
        this.rocketTime = eq.rocketBoots > 0 ? 7 : 0;  // :2612 + :26436（无靴恒 0）
        this.rocketDelay = 0;
        this.canRocket = false;
        this.rocketRelease = false;
        this.canCarpet = true;        // :26173
        this.carpetTime = 300;
      } else {
        // canRocket 门（:26487）：vy > -jumpSpeed 且 vy≠0
        if (this.vy > -JS && this.vy !== 0) this.canRocket = true;
        // vy==0 恢复 rocketTime（:26540：velocity.Y==0 即回满，含撞顶悬停等非落地场景）
        if (this.vy === 0) this.rocketTime = eq.rocketBoots > 0 ? 7 : 0;
        // flag19 = 翅膀飞行中（:26500-26510：wings>0 && controlJump && wingTime>0 &&
        //   jump==0 && vy≠0；hover 族 + ↓+跳 也算 :26505）
        const flying =
          (wings > 0 && this.inputJump && this.wingTime > 0 && this.jumpHold === 0 && this.vy !== 0)
          || (eq.wing !== null && eq.wing.hover && this.inputJump && hoverDown && this.wingTime > 0);
        if (flying) {
          this.wingMovement(wings, hoverDown, JS);
          // WingFrame 通用 flap（:29425+ 各族主干）：6t/帧循环 1→2→3→2
          this.wingFrameCounter++;
          const beat = 6;
          const phase = Math.floor(this.wingFrameCounter / beat) % 4;
          this.wingFrame = [1, 2, 3, 2][phase];
        } else if (this.vy !== 0 && this.inputJump) {
          this.wingFrame = 2;      // 滑翔固定帧（各族主干 else-if 段）
          this.wingFrameCounter = 0;
        } else if (this.vy !== 0) {
          this.wingFrame = 2;      // 空中下落张翼
        } else {
          this.wingFrame = 0;      // 地面收起
          this.wingFrameCounter = 0;
        }
        // 翅膀+火箭靴动态合并（:26523-26531）：空中且 rocketTime 有余 →
        // 剩余脉冲×6 并入 wingTime（上限 = wingTimeMax + 本次转换量），rocketTime 清零
        if (wings > 0 && eq.rocketBoots > 0 && this.vy !== 0 && this.rocketTime > 0) {
          const add = this.rocketTime * 6;
          this.wingTime += add;
          const cap = (eq.wing ? eq.wing.time : 0) + add;
          if (this.wingTime > cap) this.wingTime = cap;
          this.rocketTime = 0;
        }
        // ---- 火箭靴（:26548-26628）：翅膀不可用（无翅或时间尽）才接管 ----
        if (!flying && (this.wingTime <= 0 || wings === 0) && eq.rocketBoots > 0
          && this.inputJump && this.rocketDelay === 0 && this.canRocket && this.rocketRelease) {
          if (this.rocketTime > 0) {
            this.rocketTime--;
            this.rocketDelay = 10;    // 推力脉冲段（:26556）
            if (this.rocketDelay2 <= 0) this.rocketDelay2 = eq.rocketBoots === 1 ? 30 : 15;
          } else {
            this.canRocket = false;
          }
        }
        if (this.rocketDelay2 > 0) this.rocketDelay2--;
        if (this.rocketDelay > 0) {
          // 推力脉冲速度模型（:26602-26626，与翅膀同构 0.1/0.5/1.5 档）：
          this.rocketDelay--;
          this.vy -= 0.1;
          if (this.vy > 0) this.vy -= 0.5;
          else if (this.vy > -JS * 0.5) this.vy -= 0.1;
          if (this.vy < -JS * 1.5) this.vy = -JS * 1.5;
          this.fallStartY = null;
        } else if (!flying) {
          // ---- 飞毯（CarpetMovement :21568-21602）：条件=无多段跳余量/jumpHold 空/
          //      vy≠0/火箭靴未在用/翅膀时间尽；效果=vy 钳到 -(gravity+ε) 抵消重力 ----
          if (eq.carpet && this.extraJumps.length === 0 && this.jumpHold === 0
            && this.vy !== 0 && this.rocketTime === 0 && this.wingTime <= 0) {
            if (this.inputJump && this.canCarpet) { this.canCarpet = false; this.carpetTime = 300; }
            if (this.carpetTime > 0 && this.inputJump) {
              this.carpetTime--;
              this.fallStartY = null;
              this.vy = -(GRAVITY + 1e-6);   // :21588 微升抵消随后重力 → 净缓降
            }
          }
        }
        // 悬浮缓降（:27083-27102）：hover 族 + ↓+跳 + wingTime>0 → vy×0.9（45=0.8）
        if (eq.wing?.hover && hoverDown && this.inputJump && this.wingTime > 0) {
          this.vy *= wings === 45 ? 0.8 : 0.9;
          if (this.vy > -2 && this.vy < 1) this.vy = 1e-5;
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
      // ---- 攀壁钉鞋（spikedBoots：攀爬爪/鞋钉/忍者大师装备——贴墙缓降+蹬墙跳）----
      this.wallCling = false;
      if (!this.onGround && eq.spikedBoots && this.hitWall && this.inputX !== 0 && this.vy > 0) {
        this.vy = Math.min(this.vy, 1.5); // 贴墙缓降
        this.fallStartY = null;
        this.wallCling = true;
        if (this.inputJump) { // 蹬墙跳
          this.vy = -PLAYER_JUMP_SPEED;
          this.jumpHold = PLAYER_JUMP_TICKS;
          this.vx = -Math.sign(this.vx || this.facing) * 3;
        }
      }
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
      // 翅膀滑翔（:27015-27027）：wingTime 尽后按住跳 = 重力/3 + 终端 maxFallSpeed/3
      // （!hoverDown）——原版此段在 else-if 链替换常规重力，此处以等价条件并入
      const gliding = !!eq.wing && this.wingTime <= 0 && this.inputJump && this.vy > 0 && !hoverDown;
      // 羽落 buff（slowFall,:21369）：重力 /3,fallStart 每帧重置 → 免坠伤
      let grav = this.buffs.slowFall ? GRAVITY / 3 : GRAVITY;
      if (gliding) {
        grav = GRAVITY / 3;
        if (this.vy > MAX_FALL_SPEED / 3) this.vy = MAX_FALL_SPEED / 3;
      }
      // 重力倒置（gravDir，R7）：方向取反（Player.cs:3207 vy×gravDir 全局语义近似）
      this.vy = gd === 1
        ? Math.min(this.vy + grav, MAX_FALL_SPEED)
        : Math.max(this.vy - grav, -MAX_FALL_SPEED);
      if (this.buffs.slowFall) this.fallStartY = null;
      // 倒置时天花板即地板（TileCollision.hitHead → onGround 近似）
      if (gd === -1) this.onGround = this.hitHead;
    }
    // 松键截断上升（手感；倒置时镜像）
    if (!this.inputJump && (this.gravDir === 1 ? this.vy < -2 : this.vy > 2)) this.vy = 2 * this.gravDir;

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
      // 扫描顺序 1:1（Collision.StickyTiles cs:3399-3402）：外层 X 自左向右、
      // 内层 Y 自顶向下——撕网目标=最左重叠列的顶端那张（垂直蛛网串即从身体最上方
      // 开始撕，原版语义；此前行优先会错撕横向蛛网层的最上行）
      for (let tx = tx0; tx <= tx1 && !(inWeb || inHoney); tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
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
          // 挣扎撕网（L22653-22670）：移动中 stickyBreak++，超 rand(20,100) →
          // WorldGen.KillTile(检测格)——原版直接破坏 StickyTiles 返回的那一格
          if (this.vx !== 0 || this.vy !== 0) {
            this.stickyBreak++;
            if (this.stickyBreak > 20 + Math.floor(Math.random() * 80)) {
              this.stickyBreak = 0;
              st.setTile(webTx, webTy, 0);
              // 破坏爆散（KillTile HitEffect 网屑四溅近似）
              game.spawnParticles(webTx * TILE + 8, webTy * TILE + 8, '#C8C8CC', 8, 1.4, { life: 30, grav: 0.05 });
              game.spawnDrop(webTx * TILE + 8, webTy * TILE, VANILLA_ITEM_KEY_BY_ID[150] ?? 'vi_150_cobweb', 1);
            }
          }
        }
      }
    }

    // 摔伤追踪：开始下落记录高度，落地结算
    const fallVy = this.vy * this.gravDir;
    if (!this.onGround && fallVy > 0 && this.fallStartY === null) {
      this.fallStartY = this.y;
    }
    if (fallVy < -0.1) this.fallStartY = null; // 重新上升则重置

    this.dropThrough = !!this.inputDown;
    this.stepUp = true; // 原版玩家走 Collision.StepUp（Player.cs:23258/:27753）
    // 落地冲击速度留存（原版 TryLandingOnDetonator Player.cs:34368 的 velocity.Y>=3 门；
    // 碰撞前捕获——碰撞会清零 vy。Game 侧消费：落在起爆器 411 上触发电路）
    const impactVy = this.vy;
    const preY = this.y;
    moveAndCollide(this, world, this.vx, this.vy);
    this.landImpactVy = this.onGround && impactVy >= 3 ? impactVy : 0;
    // StepUp 抬升检测（原版 gfxOffY）：水平移动中被抬升 ≤16px → 渲染缓动补偿
    const lifted = preY - this.y;
    if (this.inputX !== 0 && lifted > 0.5 && lifted <= 16.1) this.stepRenderY = lifted;

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

    // 自动上台阶：统一走原版 Collision.StepUp（moveAndCollide 内 stepUp 门，
    // Physics/TileCollision.ts applyStepUp 1:1）——此前自研版只处理玩家，
    // 敌人/小动物卡死半砖；原版玩家与 NPC 共用同一 StepUp。视觉缓动保留：
    // 每帧检测被抬升时记录补偿高度
    if (this.onGround && this.hitWall && this.inputX !== 0) {
      // 碰撞被拦但 StepUp 已抬升过（y 比上一帧高出一格内）→ 渲染缓动
      void 0;
    }
    // 台阶视觉缓动：每帧向 0 收敛
    if (this.stepRenderY > 0.5) this.stepRenderY *= 0.55;
    else this.stepRenderY = 0;
    // ---- 职业状态机（对账批实装）----
    // 狼人（月亮符 485 + 夜间：Player.cs:11488 链 wolfAcc&&night）
    if (this.equipStats.wolfAcc && !(game.world.clock?.isDay ?? true)) this.buffs.apply(BuffType.Werewolf, 2);
    // 磨刀站 3198 就近常驻（每 60t 扫 41×25 区）
    if (--this.sharpenedCd <= 0) {
      this.sharpenedCd = 60;
      const stt = game.world.store;
      const tid = TILE_BY_KEY['v_377_sharpening_station'] ?? -1;
      if (tid > 0) {
        const tx0 = Math.floor(this.cx / TILE) - 20, tx1 = tx0 + 40;
        const ty0 = Math.floor(this.cy / TILE) - 12, ty1 = ty0 + 25;
        outer: for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          if (stt.inBounds(tx, ty) && stt.type[stt.idx(tx, ty)] === tid) { this.buffs.apply(BuffType.Sharpened, 2); break outer; }
        }
      }
    }
    // BOC 受击脉冲消费
    if (this.bocPulse > 0) {
      this.bocPulse = 0;
      this.buffs.apply(BuffType.BrainOfConfusionBuff, 4);
      for (const e of game.enemies()) {
        const en = e as { cx?: number; cy?: number; confusedT?: number; dead?: boolean };
        if (en.dead || en.cx === undefined || en.cy === undefined) continue;
        if (Math.abs(en.cx - this.cx) < 300 && Math.abs(en.cy - this.cy) < 200) en.confusedT = 4;
      }
    }
    // 潜行（蘑菇矿/星璇套：按住↓静立蓄 1/60t，动则散 1/15t）
    const stealthSet = this.equipStats.shroomiteSet || this.equipStats.vortexSet;
    if (stealthSet && this.inputDown && this.onGround && Math.abs(this.vx) < 0.6) this.stealth = Math.min(1, this.stealth + 1 / 60);
    else this.stealth = Math.max(0, this.stealth - 1 / 15);
    // 星云层数衰减（8s 全层刷新）
    if (this.nebulaStacks > 0 && --this.nebulaT <= 0) { this.nebulaStacks = 0; }
    // 鞭 buff 倒计时（WhipTagEffect.PlayerBuffTime=180 系）
    for (const k of Object.keys(this.whipBuffs)) {
      if (--this.whipBuffs[Number(k)] <= 0) delete this.whipBuffs[Number(k)];
    }

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
  /** 火箭靴 1:1（Player.cs:2612/26548-26628）：rocketTime 剩余脉冲次数（max=7）/
   *  rocketDelay 推力脉冲倒计时（每次触发=10t 加速段）/ rocketDelay2 焰间隔
   *  （1 档 30 / 2+ 档 15）/ canRocket 门（vy>-jumpSpeed 才可启动）/ rocketRelease
   *  需松跳重触发 */
  rocketTime = 0;
  rocketDelay = 0;
  rocketDelay2 = 0;
  canRocket = false;
  rocketRelease = false;
  /** WingMovement（Player.cs:21746-21966）1:1：飞行中每 tick 垂直运动。
   *  wings==4（UFO 之翼）+TryingToHoverUp 独占分支（消耗 ×2）；
   *  其余按翼型参数表（num 恒减/num2 下落减速/num5 上升微推/num4 jumpSpeed 区间
   *  系数/num3 上升帽系数），上升帽 = -jumpSpeed×num3（1.5~4.5 按翼型）；
   *  hover 下落无左右移时 wingTime 消耗减半（×0.5） */
  private wingMovement(wings: number, hoverDown: boolean, JS: number): void {
    if (wings === 4 && this.inputUp) {
      // wingsLogic 4 + TryingToHoverUp（:21748-21782）
      this.vy -= 0.2;
      if (this.vy > 0) this.vy -= 1;
      else if (this.vy > -JS) this.vy -= 0.2;
      if (this.vy < -JS * 3) this.vy = -JS * 3;
      this.wingTime -= 2;
    } else {
      // 参数表（:21785-21789 基准 + 翼型覆盖 :21790-21921）
      let num = 0.1, num2 = 0.5, num3 = 1.5, num4 = 0.5, num5 = 0.1;
      if (wings === 26) { num2 = 0.75; num5 = 0.15; num4 = 1; num3 = 2.5; num = 0.125; }
      if (wings === 8 || wings === 11 || wings === 24 || wings === 27 || wings === 22) num3 = 1.66;
      if (wings === 21 || wings === 12 || wings === 20 || wings === 23) num3 = 1.805;
      if (wings === 37) { num2 = 0.75; num5 = 0.15; num4 = 1; num3 = 2.5; num = 0.125; }
      if (wings === 44 || wings === 45) {
        // 星尘/星旋悬浮强化：±0.4 hover 推力（:21814-21904）
        if (wings === 44) { num2 = 0.85; num3 = 2.75; }
        else { num2 = 0.95; num3 = 4.5; }
        num5 = 0.15; num4 = 1; num = 0.125;
        if (this.inputUp) {
          // TryingToHoverUp 附加推力（:21821-21838 / :21866-21883 同构）
          this.vy -= 0.4;
          if (this.vy > 0) this.vy -= 1;
          else if (this.vy > -JS) this.vy -= 0.2;
          if (this.vy < -JS * 3) this.vy = -JS * 3;
        }
        // （:21855/:21900 TryingToHoverDown && !controlJump 下沉分支在原版调用门
        //  flag19（要求 controlJump）下不可达——反编译证实为死分支，不移植）
      }
      if (wings === 29 || wings === 32) { num2 = 0.85; num5 = 0.15; num4 = 1; num3 = 3; num = 0.135; }
      if (wings === 30 || wings === 31) { num4 = 1; num3 = 2.45; if (!hoverDown) num = 0.15; }
      // 主体（:21922-21952，gravDir=1 半边）
      this.vy -= num;
      if (this.vy > 0) this.vy -= num2;
      else if (this.vy > -JS * num4) this.vy -= num5;
      if (this.vy < -JS * num3) this.vy = -JS * num3;
      // wingTime 消耗（:21953-21960）：hover 下落且无左右移 ×0.5
      const halfCost = (wings === 22 || wings === 28 || wings === 30 || wings === 31
        || wings === 37 || wings === 45) && hoverDown && this.inputX === 0;
      this.wingTime -= halfCost ? 0.5 : 1;
    }
    this.fallStartY = null;
  }

  /** 恐慌项链受击加速计时（tick，原版 panicTime=300） */
  panicTime = 0;
  /** 岩浆免疫剩余 tick（熔岩护身符族 lavaMax；离开岩浆回满） */
  lavaImmuneTicks = 0;
  /** 翅膀：剩余飞行 tick（float，hover 下落档 0.5/tick）+ 需松跳键重触发 */
  wingTime = 0;
  wingRelease = true;
  /** 飞毯触发门（CarpetMovement :21575：起跳后置 true，触发一次即 false） */
  canCarpet = true;
  /** 翅膀动画帧（WingFrame :29002：0 收起 / flap 循环 1→2→3→2 / 滑翔 2）+ 拍速计数 */
  wingFrame = 0;
  private wingFrameCounter = 0;

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
  /** 所在沙漠区（Game 每帧同步 scene.zoneDesert；沙丘行者靴消费） */
  zoneDesert = false;
  /** 重力方向（R7：1 普通 / -1 倒置——重力药水 buff 18 激活时按 Up 切换，Player.gravDir）
   *  倒置 = 重力/跳跃/落点起点全部取反；onGround 由 hitHead 近似（天花板当地板） */
  gravDir: 1 | -1 = 1;
  /** 贴墙缓降中（spikedBoots 攀壁） */
  wallCling = false;
  /** 拾取范围扩展（宝藏磁石/金戒指族，px；defaultItemGrabRange=42） */
  get grabRangeBonus(): number {
    return this.equipStats.treasureMagnet ? 94 : this.equipStats.goldRing ? 12 : 0;
  }
  /** 红心拾取范围扩展（拾心药水 lifeMagnet，ItemDrop 心分支消费） */
  get heartGrabBonus(): number {
    return this.buffs.has(BuffType.Heartreach) ? 60 : 0;
  }
  /** 魔力星拾取范围扩展（魔力磁石族 manaMagnet，ItemDrop 星分支消费） */
  get manaMagnetBonus(): number {
    return this.equipStats.manaMagnet ? 80 : 0;
  }
  /** 幸运度聚合态（src/stats/Luck.ts LuckState；环境因子由 Game 扫描写入，
   *  RecalculateLuck :28672-28697 各项见 LuckState 注释） */
  readonly luckState = new LuckState();
  /** 幸运值（RecalculateLuck :28672-28697 1:1）：
   *  luck = 瓢虫×0.2 + 火炬×0.2 + 药水档×0.1 + 风筝档×0.1/3 + 银河珍珠 0.03
   *        + 灯笼夜 0.3 + 地精 0.2 − 臭屁 0.25 + 装备 + 钱币 − 碎镜 0.25。
   *  不 clamp——luckMinimumCap=-0.7/luckMaximumCap=1（Player.cs:2952/2954）只喂 UI 计量
   *  （:3950-3957），聚合本体可超界（原版如此）。
   *  来源接线：药水 buff 257 三档 / 灯笼夜 / 地精+火炬（Game 15t 扫描）/ 装备（幸运币 855
   *  +0.05、马掌族 +0.05，Player.cs:12629-12647）已接；瓢虫 359/360、buff 383 风筝、
   *  buff 120 臭屁、银河珍珠 5340、碎镜 810、微光化币——登记（物品/子系统未移植） */
  get luck(): number {
    const l = this.luckState;
    let v = l.ladyBugLuck * 0.2 + l.torchLuck * 0.2;        // :28673
    v += this.luckPotionTier * 0.1;                          // :28674（buff 257 三档）
    if (l.usedGalaxyPearl) v += 0.03;                        // :28676-28678
    if (l.lanternsUp) v += 0.3;                              // :28679-28682
    if (l.hasGardenGnomeNearby) v += 0.2;                    // :28683-28686
    if (l.stinky) v -= 0.25;                                 // :28687-28690
    v += this.luckEquipmentBonus;                            // :28692
    v += l.coinLuckValue;                                    // :28693
    if (l.brokenMirrorBadLuck) v -= 0.25;                    // :28694-28696
    return v;
  }
  /** luckPotion（Player.cs:9971-9982 buff 257 分档）：0 无 / >600s=3 / >300s=2 / 其余 1 */
  get luckPotionTier(): number {
    const left = this.buffs.active.get(BuffType.Luck);
    if (left === undefined) return 0;
    return left > 600 ? 3 : left > 300 ? 2 : 1;
  }
  /** equipmentBasedLuckBonus（Player.cs:12629-12647）：
   *  幸运币 855 +0.05（hasLuck_LuckyCoin）/ 马掌族 +0.05（hasLuck_LuckyHorseshoe）。
   *  四叶草 5574 +0.03 / 枯萎 5575 −0.1 / 乌鸦羽 5576 −0.1（RefreshInfoAccsFromItemType
   *  :12321-12332）——三件物品未入物品表，登记 */
  get luckEquipmentBonus(): number {
    let b = this.equipStats.luckyCoin ? 0.05 : 0;
    if (this.hasHorseshoe) b += 0.05;
    return b;
  }
  inputDown = false;
  inputUp = false;
  onRope = false;

  /** 受击：防御减伤公式 max(1, dmg - defense*0.5)（移植自 Maples Player.OnAttacked）。
   *  knockback=false 用于窒息等环境伤害（只掉血不击退） */
  damage(dmg: number, srcX: number, srcY: number, knockback = true): boolean {
    // 微光化免伤（Player.cs:37591-37595 Hurt 前置：shimmering 且可闪避 → 直接返回 0；
    // 本仓 damage 以 false 表示完全免伤——Boss 专属弹幕 371 等不可闪避源未移植）
    if (this.shimmering) return false;
    if (this.iframes > 0 || this.dead) return false;
    const eq = this.equipStats;
    // 黑带/忍者大师装备 10% 闪避（Player.Hurt :9772 blackBelt 分支）
    if (eq.blackBelt && Math.random() < 0.1) return false;
    // 耐久药水(114)：endurance+0.1 → 受伤 ×0.9（Player.endurance 在 Hurt 结算）
    const endurance = this.buffs.has(BuffType.Endurance) ? 0.1 : 0;
    const reduction = Math.max(1, Math.round((dmg - this.defense * 0.5) * (1 - endurance)));
    this.hp -= reduction;
    // 十字项链/星星面纱：无敌帧翻倍（longInvince）
    this.iframes = PLAYER_IFRAME_TICKS * (eq.longInvince ? 2 : 1);
    this.sinceHurt = 0; // 受击打断自然回血
    // 甲虫攻击球受击掉一颗
    if (this.beetleOrbs > 0) this.beetleOrbs--;
    // 混乱之脑（:37488-37496：受击 1/6 → buff 321 + 困惑近敌；damage 无 game 参→脉冲标志）
    if (this.equipStats.boc && Math.random() < 1 / 6) this.bocPulse = 1;
    // 恐慌项链：受击触发 5 秒移速爆发（panicTime=300，PanicSpeedBoost :25034）
    if (eq.panic) this.panicTime = 300;
    // 魔力手铐（magicCuffs :37678）：受伤回蓝 = 原始伤害 1:1（防前数值）
    if (eq.magicCuffs) this.mana = Math.min(this.maxMana, this.mana + dmg);
    // 击退（钴护盾族 noKnockback 免疫）
    if (knockback && !eq.noKnockback) {
      const dir = this.cx < srcX ? -1 : 1;
      this.vx = dir * 3.4;
      this.vy = -3;
    }
    return true;
  }

  /** ShimmerUnstuck（Player.cs:28394-28428）：timeShimmering 清零，找最近无微光
   *  落点传送（TryFindingShimmerFreeSpot :28414-28440，落点 = spot+(0,-2)px、
   *  velocity=(0,0.0001)），清微光化态；找不到则保持原位等下一轮（原版同样仅
   *  StartUnstuck 辅助）。传送附带短暂无敌帧（原版 Teleport style 12 的 immune
   *  语义近似——落点邻敌免秒杀） */
  private shimmerUnstuck(game: GameHooks, world: import('../world/World').World): void {
    this.timeShimmering = 0;
    const st = world.store;
    const spot = findShimmerFreeSpot(st, Math.floor(this.cx / TILE), Math.floor(this.y / TILE));
    if (!spot) return;
    const p = shimmerTeleportPos(spot);
    this.x = p.x;
    this.y = p.y;
    this.vx = 0;
    this.vy = 0.0001;
    this.shimmering = false;
    this.inShimmer = false;
    this.iframes = Math.max(this.iframes, PLAYER_IFRAME_TICKS);
    game.spawnParticles(this.cx, this.cy, '#BFE8FF', 14, 1.4, { life: 30, grav: -0.04 });
    game.playSfx('shimmerSplash', 0.75, this.cx, this.cy);
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

  /** 清坠落起点(F10 调试瞬移用):瞬移不结算高空摔伤 */
  clearFall(): void {
    this.fallStartY = null;
  }

  draw() { /* 由 Renderer 统一绘制 */ }
}

// 玩家实体：移动、跳跃、游泳、Buff/配饰属性聚合、摔伤
import { Entity } from './Entity';
import type { GameHooks } from './types';
import {
  GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX,
  PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS,
  PLAYER_IFRAME_TICKS, TILE, RUN_ACCELERATION, RUN_SLOWDOWN,
} from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { wetCollision } from './npcLiquid';
import { playerCanHitEnemy } from './projTargets';
import { randomizeFriendlyInsanityShadow } from './InsanityShadowFriendly';
import { Inventory, ACC_ARMOR_START } from '../items/Inventory';
import { vanillaIdOfItem } from '../stats/Shimmer';
import { BuffState, BuffType } from '../stats/Buffs';
import { LuckState } from '../stats/Luck';
import { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { viIdFromKey } from '../data/vanillaItemCombat';
import { itemFuncOfVid } from '../data/vanillaItemFunc';
import type { TileStore } from '../world/TileStore';
import { TileStore as TileStoreRT } from '../world/TileStore';   // 运行时 SOLID_LUT（type-only import 会被剥）
import { emptyInfoAccGates, refreshInfoAccsFromItemType, type InfoAccGates } from '../stats/InfoAccs';
import { VI_ID } from '../data/itemKeys';
import { statOfInternal } from '../data/vanillaItemStats';
import { wingStatOf } from '../data/vanillaWingStats';
import { stepWingFrame, FLAP_HOVER_SET } from '../data/vanillaWingVisuals';
import type { WingFrameState } from '../data/vanillaWingVisuals';
import { accFxOfInternal } from '../data/vanillaAccFx';
import { accDrawSlotsOf, BALLOON_TORSO_FRAMING, BACK_DRAW_IN_BACKPACK, BACK_DRAW_IN_TAIL } from '../data/vanillaAccDrawslots';
import { dyeEntryOf } from '../data/vanillaDyes';
import { ARMOR_SET_BONUSES, type ArmorSetBonus } from '../data/vanillaArmorSets';
import { DD2_PIECE_FX } from '../data/vanillaArmorSets';
import { SUMMON_GEAR, SUMMON_SET, type SummonSetFx } from '../data/vanillaSummonStats';
import { TagEffectStack } from './WhipTag';
import { harpyCharmEffect } from './Arrow';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import { isCrackedSheet, isCrackedAt } from '../world/CrackedBricks';
import { hurtTiles, liquidCollision, drownCollision, TOUCH_IMMEDIATE, TOUCH_HOT, TOUCH_BLEEDING, SUFFOCATE, TOUCH_DESTROY, type HurtTile } from '../stats/TouchDamage';
import { findShimmerFreeSpot, shimmerTeleportPos } from '../stats/Shimmer';
import { ParticleOrchestraType } from '../net/syncModules';
import { mainExpertMode, mainDifficulty, getAttackDamageScaledByDifficulty, scaleStatsWorld, GDL } from '../stats/ScaleStats';
import { journeyPowers } from '../world/JourneyPowers';

/** 旅程上帝模式激活（GodmodePower.IsEnabledForPlayer——绑定态读取，
 *  对应原版 Player.creativeGodMode 每帧自 power 授予 Player.cs:25208） */
function journeyGodmodeActive(): boolean { return journeyPowers().godmode; }

/** 蘑菇矿潜行加成轴 = Utils.Remap(stealth, 1f, 0.75f, 1f, 0f)（1457 Player.cs:26015
 *  num26；Utils.cs:345-348 Remap = Lerp(toMin,toMax,GetLerpValue(fromMin,fromMax,v,
 *  clamped))，Utils.cs:315-342 反序轴钳制）——s=1（无潜行）→1、s=0.75→0、s<0.75 钳 0，
 *  解析式 clamp(4s−3, 0, 1)。加成因子 (1−num26) 只在深潜行段升起、s≤0.75 起恒满，
 *  非旧平铺 (1−s) 全程线性（:26016-26018 伤 +0.5/暴 +10/仇恨 -750 全走此轴） */
function shroomiteStealthRemap(s: number): number {
  return Math.min(1, Math.max(0, 4 * s - 3));
}

// ---- 1457 弹药轮换槽序（Player.cs:3175-3180 静态表 1:1）----
/** AmmoSlotOrder_Default（:3175）：币槽 50-53 → 弹药槽 54-57 → 背包 0-53 */
export const AMMO_SLOT_ORDER_DEFAULT: readonly number[] = Object.freeze([
  50, 51, 52, 53, 54, 55, 56, 57, ...Array.from({ length: 54 }, (_, i) => i),
]);
/** AmmoSlotOrder_AmmoOnly（:3178）：弹药槽 54-57（AmmoSlots 轮换模式专用） */
export const AMMO_SLOT_ORDER_AMMO_ONLY: readonly number[] = Object.freeze([54, 55, 56, 57]);
/** AmmoSlotOrder_CoinsOnly（:3180）：币槽 50-53（币族武器 + AmmoSlots 模式） */
export const AMMO_SLOT_ORDER_COINS_ONLY: readonly number[] = Object.freeze([50, 51, 52, 53]);

/** PickAmmo_IterateRange（Player.cs:54326-54366）1:1：按槽序扫 `matches(slot) &&
 *  stack>0` 的弹药——cycling 时先数兼容组数 num2（:54332-54341,0 组早退 null），
 *  跳过 `offset % num2` 组（:54346）后取第一组；forceFirst（779/5134 :54347-54350）
 *  压 0。返回槽位下标，-1 = 无弹药（原版 null）。 */
export function pickAmmoIterateRange(
  order: readonly number[],
  slots: ReadonlyArray<{ id: number; stack: number } | null>,
  matches: (id: number) => boolean,
  offset: number,
  cycling: boolean,
  forceFirst: boolean,
): number {
  let skip = 0;
  if (cycling) {
    let count = 0;                                       // num2 :54332
    for (const s of order) {
      const it = slots[s];
      if (it && it.stack > 0 && matches(it.id)) count++;
    }
    if (count === 0) return -1;                          // :54342-54345
    skip = forceFirst ? 0 : offset % count;              // :54346-54350
  }
  for (const s of order) {                               // :54352-54364
    const it = slots[s];
    if (it && it.stack > 0 && matches(it.id)) {
      if (skip === 0) return s;
      skip--;
    }
  }
  return -1;                                             // :54365
}
import type { Enemy } from './Enemy';
import { GrappleProj, GRAPPLE_LATCH } from './GrappleProj';
import { TRACK_SHEET } from '../data/grappleHooks';
import { canHitLine } from '../physics/LineOfSight';
import { PARTY_HAIR_DYE_SHADER_ID } from '../data/vanillaHairDyes';
import { GorePiece } from './GorePiece';
import { TownShot } from './TownShot';
import { hslToRgb } from '../player/Appearance';
import {
  MountInstance, SCUTLIX_PROJ_ID, SCUTLIX_SHOT_DAMAGE, inAPlaceWithWind, MountShot, MOUNT_DATA,
} from './Mounts';
import { flameParticles } from '../fx/FlameParticles';

// 摔伤参数已对齐 Player.cs:25005-25091（25 格起伤+超格×10 线性，结算在落地段）——原 Maples 三次方曲线已废

// 沙族地格集合（TileID.Sets.Conversion：Sand{53,112,116,234} / HardenedSand{397,398,399,402}
// / Sandstone{396,400,401,403}——TileID.cs:30-34）。53/396/397 是本地基础方块键。
/** 地面材质内部 id 集（Player.cs FloorCheck :23453-23455 五旗的 tile 族——
 *  内部 id 经 TILE_BY_KEY 反查；★曾直接拿原版 sheet id 对比 st.type 永不命中
 *  = 冰面滑移整链死代码（"角色在冰面不脚滑"根因，2026-08-18 修）） */
export const ICE_SLIP_IDS = new Set<number>([
  'ice', 'thin_ice', 'v_127_ice_ice_rod', 'v_163_purple_ice_block',
  'v_164_pink_ice_block', 'v_200_red_ice_block', 'v_659_aetherium_block',
].map((k) => TILE_BY_KEY[k] ?? 0).filter((id) => id > 0));   // IceSkateSlippery(TileID.cs:149)
export const FROZEN_SLIME_ID = TILE_BY_KEY['v_197_frozen_slime_block'] ?? 0;   // slippy2
export const ASPHALT_ID = TILE_BY_KEY['v_198_asphalt_block'] ?? 0;             // powerrun

// ---- 绳锚几何系统常量（绳锚批 2026-08-19：pulley 悬挂 + 线起点链）----
/** ItemID.Sets.Yoyo（ItemID.cs:1166）——悠悠球物品 vid 集
 *  （ApplyItemPositionOffsetFromMount flag9 :50660） */
const YOYO_ITEM_VIDS = new Set([3262, 3278, 3279, 3280, 3281, 3282, 3283, 3284,
  3285, 3286, 3287, 3288, 3289, 3290, 3291, 3292, 3315, 3316, 3317, 3389, 5294]);
/** ItemID.Sets.IsAKite（ItemID.cs:153）——风筝物品 vid 集（flag12 :50663） */
const KITE_ITEM_VIDS = new Set([4367, 4368, 4369, 4370, 4371, 4379, 4610, 4611,
  4612, 4613, 4648, 4649, 4650, 4651, 4669, 4670, 4671, 4674, 4675, 4676, 4677,
  4681, 4683, 4684]);
/** TileID.Sets.Platforms（TileID.cs:243，sheet id）——WorldGen.IsRope 的
 *  "绳穿平台/花盆箱/矿轨"支（WorldGen.cs:70140-70146：314 矿轨 / 380 花盆箱 /
 *  平台族格，上下 5 格内皆有绳时该格视作绳，可攀穿） */
const VANILLA_PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]);
/** 绳索攀爬速度链（Player.cs:26016-26125）：上爬 -0.2/-0.02 下限 -8；
 *  下滑 +0.2/+0.1 上限 maxFallSpeed；静止 ×0.7（|vy|<0.1 归 0 :26120-26124） */
const ROPE_IDLE_ZERO = 0.1;
export const HONEY_FLOOR_ID = TILE_BY_KEY['v_229_honey_block'] ?? 0;           // sticky(地面材质档,与 StickyTiles 泡块阻尼不同链)

const SAND_FLOOR_IDS = new Set<number>([
  'sand', 'sandstone', 'hardened_sand',
  'v_112_ebonsand_block', 'v_116_pearlsand_block', 'v_234_crimsand_block',
  'v_398_corrupt_hardened_sand_block', 'v_399_crimson_hardened_sand_block',
  'v_402_hallow_hardened_sand_block', 'v_400_corrupt_sandstone_block',
  'v_401_crimson_sandstone_block', 'v_403_hallow_sandstone_block',
].map((k) => TILE_BY_KEY[k] ?? 0).filter((id) => id > 0));

/** 十字章免疫族：物品 id → 免疫的 vanilla buff id 列表
 *  （Player.cs:14911-15003 buffImmune 逐件赋值全表）。
 *  885 抛光剂→30 流血 / 886 维生素→36 破甲 / 887 牛黄→20 中毒 / 888 创可贴→22 沉默 /
 *  889 快速时钟→32 缓慢 / 890 三折地图→35 蛛网 / 891 眼罩→23 黑暗 / 892 护腕→33 虚弱 /
 *  893 药用绷带→31 困惑 / 3781 袖珍镜→156 石化 / 901 反诅咒→33+36 / 902 扩音器→30+20 /
 *  903 计划→32+31 / 904 十字章护身符→35+23+22 / 5354 反光墨镜→22+156 /
 *  1921 暖手宝→46+47 冰寒冰冻 / 1612 十字章盾→十项全免 / 1613 十字章守护→46+十项 */
/** 背包生效域 vid 集（UpdateEquips :12494-12500 消费集合 = RefreshInfoAccsFromItemType
 *  :12319-12400 全响应 vid ∪ RefreshMechanicalAccsFromItemType :12397-12430 本仓
 *  已建模三族）——equipStatsKey 背包段只对命中格记键：未命中格不进 computeEquipStats
 *  输出,内容键仍对全部实际输入完备（直写背包放取即失效） */
const INV_EFFECTIVE_VIDS = new Set<number>([
  // 信息族（RefreshInfoAccsFromItemType 逐 if 响应 vid）
  15, 707, 16, 708, 17, 709,          // 表三档+升级版
  393, 18, 395,                        // 罗盘/深度计/GPS
  3036, 3037, 3096,                    // 渔夫耳语/天气电台/六分仪
  3084, 3095, 3118,                    // 雷达/计数器/生命体分析仪
  3099, 3102, 3119,                    // 秒表/金属探测器/DPS 计
  3120, 3121, 3122,                    // 渔夫指南/哥布林科技/REK 混合件
  3123, 3124, 5358, 5359, 5360, 5361,  // PDA/REK3000/手机/贝壳手机三态
  5574, 5575, 5576,                    // 幸运饰族（hasLuck_*）
  // 机械族（RefreshMechanicalAccsFromItemType 本仓已建模三族）
  3619, 3624, 2216, 3061, 5126,
]);

const IMMUNE_ACC: Record<number, number[]> = {
  885: [30], 886: [36], 887: [20], 888: [22],
  889: [32], 890: [35], 891: [23], 892: [33], 893: [31],
  3781: [156],
  901: [33, 36], 902: [30, 20], 903: [32, 31], 904: [35, 23, 22],
  5354: [22, 156], 1921: [46, 47],
  1612: [33, 36, 30, 20, 32, 31, 35, 23, 22, 156],
  1613: [46, 33, 36, 30, 20, 32, 31, 35, 23, 22, 156],
};

/** UnbreakableWallScan.InsideUnbreakableWalls（UnbreakableWallScan.cs:47-66）：
 *  8 向射线各 250 格，遇墙 350（UnbreakableBlockWall，双地牢不可破墙）记方向位；
 *  随后 8 次环形移位检查——任一次低 5 位全零即 false（≈5 个连续方向命中才算
 *  被墙包围）。★LineScan 的 `wallColor()>=16` 门（双地牢按进度分层涂色）本仓
 *  未建模 → 墙 350 即命中（备案：分层色阶不区分，越界判定略偏宽，外部
 *  DangerousDungeonCurse 进度档比较仍完整把关） */
function insideUnbreakableWallsScan(st: import('../world/TileStore').TileStore, px: number, py: number): boolean {
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let num = 0;
  for (let i = 0; i < 8; i++) {
    let x = px, y = py, n = 0, hit = false;
    while (n < 250) {                                   // ScanDistance :19
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) { hit = false; break; }
      if (st.wall[st.idx(x, y)] === 350) { hit = true; break; }
      n++; x += dirs[i][0]; y += dirs[i][1];
    }
    if (hit) num |= 1 << i;
  }
  for (let j = 0; j < 8; j++) {
    if ((num & 0x1F) === 0) return false;
    num = ((num << 1) & 0xFF) | (num >> 7);
  }
  return true;
}

/** equipStats 形状(getter/computeEquipStats 共用;2026-08-19 记忆化改造时从内联注释放别) */
export type PlayerEquipStats = {    def: number; mana: number; hpPerSec: number;
    dmgMelee: number; dmgRanged: number; dmgMagic: number;
    critMelee: number; critRanged: number; critMagic: number;
    moveMult: number; meleeSpeed: number;
    accRunSpeed: number;   // 靴族 accRunSpeed 原值（0=未装备）
    bootFx: 'hellfire' | 'sail' | 'cold' | 'desert' | 'fairy' | null;   // 跑靴奔跑尘型（:36285 switch 按装备 vid）
    bootDyeVid: number;   // 鞋染料 vid（cShoe——尘色）
    autoReuseGlove: boolean; // 力量手套族：近战武器自动连挥（Player.cs:52040-52042）
    /** 手套族近战放大：GetAdjustedItemScale（Player.cs:41919-41930）melee 武器
     *  判定盒/手持贴图 ×1.1——泰坦手套 536(:15029-15033)/力量手套 897(:14749-14756)/
     *  机械手套 936(:14820-14826)/火焰护手 1343(:14757-14764)/狂战士手套 3992(:13993-13999) */
    meleeScaleGlove: boolean;
    extraFall: number; lavaMax: number; armorPen: number;
    rocketBoots: number; autoJump: boolean; fireWalk: boolean;
    noKnockback: boolean; noFallDmg: boolean; desertBoots: boolean;
    frostBurn: boolean;   // 冰霜盔甲引擎（StatusNPC :93712:近/远程命中 → Frostburn2）
    huntressT2: boolean;  // 女猎手 T2/T3（setHuntressT2 :16119/:16149）：爆炸机关弹 Oiled 门
    anglerSetSpawnReduction: boolean;   // 渔夫套：生成环 ×1.3/×0.7（NPC.cs:627-630）
    iceSkate: boolean;   // 冰刀族 950/1861/1862/5000：冰面不滑+加速（:26237-26255）
    waterWalk: boolean; jumpBoost: boolean; panic: boolean; starCloak: boolean;
    jumpOpts: string[];
    wing: { logic: number; slot: number; time: number; accSpeed: number; accelMult: number; hover: boolean; hidden: boolean } | null;
    dash: number; blackBelt: boolean; bees: boolean; carpet: boolean;
    jumpSpd: number; flipper: boolean; longInvince: boolean; spikedBoots: boolean;
    canFloat: boolean;   // canFloatInWater（:2594——仅两源：甲件 4404 水上漂靴 :12842-12846 ∪ buff265 脚蹼药水 :9592；注意 flipper 饰品不授予）
    killGuide: boolean; killClothier: boolean;   // 巫毒娃娃 267/1307
    infoAccs: InfoAccGates;  // 信息饰品门禁(DrawInfoAccs)
    treasureMagnet: boolean; goldRing: boolean; luckyCoin: boolean; discount: boolean;
    arrowDmg: number; kbGlove: boolean; yoyoString: boolean;
    /** 线饰品线色（Player.stringColor，UpdateVisibleAccessory :36441-36449）：0=无；
     *  1-12/13/14/27/28/30=油漆域线色，29=魔法线鼠标文字色闪烁。钓线/悠悠球线消费 */
    stringColor: number;
    /** 身上贴图绘制槽（配饰审计系统性批 2026-08-22：UpdateVisibleAccessories
     *  :36324-36368 功能槽 3-9 + 社交槽 13-19 逐槽【后写覆盖前写】+ back 披风清
     *  front :36468-36471；槽值=ArmorIDs 槽序号,0=该族无贴图。染料槽 vid 对
     *  UpdateItemDye :9329-9420 的 cBack/cFront/... 逐族路由,-1=无染料） */
    accDraw: {
      back: number; front: number; shield: number; shoe: number; waist: number;
      neck: number; face: number; balloon: number; balloonFront: number;
      handOn: number; handOff: number; beard: number;
      backpack: number; tail: number;
      dyeBack: number; dyeFront: number; dyeShield: number; dyeShoe: number; dyeWaist: number;
      dyeNeck: number; dyeFace: number; dyeBalloon: number; dyeBalloonFront: number;
      dyeHandOn: number; dyeHandOff: number; dyeBeard: number;
      dyeBackpack: number; dyeTail: number;
    };
    /** 配饰仇恨轴合计（ApplyEquipFunctional aggro ±400：3015 恶臭香氛/3991 奥术花/
     *  4005 侦察瞄准镜/4006 潜行箭袋 -400(:14098/:13992/:14064/:14067)，
     *  3016 血肉指虎/3992 狂战士手套/3998 英雄盾 +400(:14109/:13999/:14029)。
     *  ★审计台账"1300"有误——1300=Rifle Scope,1456 反编译无 aggro 赋值,以源码为准） */
    aggroAcc: number;
    // ↑省弹四档独立旗（原版 Player 四布尔字段，PickAmmo :52791-52804 逐档各掷一次
    //  Next(N)==0——huntressAmmoCost90 1/10 女猎手 3804/水晶忍者胸 4983、
    //  chloroAmmoCost80 1/5 叶绿头盔 1002、ammoCost80 1/5 蘑菇矿胸 1549/化石套/女猎
    //  旧衬衫 3878、ammoCost75 1/4 星旋胸 2758。旧单 denom 聚合会漏并戴时的第二次掷）
    ammoSaveHuntress: boolean; ammoSaveChloro: boolean; ammoSaveCost80: boolean; ammoSaveCost75: boolean;
    magmaStone: boolean;   // 近战命中点燃（岩浆石/火焰护手；StatusNPC:10866/Player.cs:6184）
    quiver: boolean;
    moltenQuiver: boolean;
    arrowStack: number;      // 箭袋 additiveStack（仅箭，:14785）
    shroomiteType: 'arrow' | 'bullet' | 'rocket' | null;
    shroomiteSet: boolean; vortexSet: boolean; nebulaSet: boolean; beetleOff: boolean;
    beetleDef: boolean;
    wolfAcc: boolean; boc: boolean;
    tileSpeed: boolean; wallSpeed: boolean; tileRange: boolean; pStone: boolean;
    autoPaint: boolean;    // 喷漆器族 2216/3061/5126：放置后自动上漆（:14720-14734）
    chiselSpeed: boolean;  // 古凿 4056/5126：pickSpeed-0.25（:12610-12612/:13981）
    toolbelt: boolean;     // 工具腰带 407：装备生效 blockRange+1（:14873-14876）
    flowerBoots: boolean;   // 花靴 3017/仙灵靴 3993（Player.cs:12688 行走生花）
    stepStool: boolean;     // 折叠凳 4341/造物之手 5126（:14077-14080 HasAStool,HeightBoost 26）
    /** 配重球物品 id（Player.counterWeight，int——0=无；556-561 彩色/1079 黑）：
     *  悠悠球袋族装备映射（UpdateEquips :14174-14226），Counterweight() 消费 */
    counterWeight: number;
    /** 悠悠球袋(3366/5541):配重球颜色在使用端掷(rollYoyoCounterweight,
     *  原版 :14176/:14200 每帧重掷=使用期随机;曾放 getter 每访问掷,记忆化时迁出) */
    yoyoBag: boolean;
    /** 虚荣配重球 id（Player.vanityCounterWeight，ApplyEquipVanity :13800-13803：
     *  社交槽 13-19 彩色配重球 3309-3314 → 556+vid-3309；黑球 5547 无虚荣档） */
    vanityCounterWeight: number;
    /** 悠悠球手套（3334/3366/5541 → Player.yoyoGlove，:14187/:14211/:14225）：
     *  悠悠球命中时掷同型二号球（Counterweight() :11973 手套分支） */
    yoyoGlove: boolean;
    /** 魔法线（5540/5541 → Player.magicString，:14196/:14213）：松手回收时
     *  原球转 -3 隐身幽灵 + 掷 75% 伤/击退的脱离态克隆（AI_099 :65110-65116） */
    magicString: boolean;
    manaMagnet: boolean; magicCuffs: boolean; manaFlower: boolean;
    manaRegenBonus: number; manaRegenDelayBonus: number;
    setBonus: ArmorSetBonus | null;   // ARMOR_SET_BONUSES 表值(activeArmorSetBonus 返回型)
    manaCostMul: number;
    // ---- 召唤师链（vanillaSummonStats：ApplyEquipFunctional type if-chain 1:1）----
    minionSlots: number;   // maxMinions += N（散件+套装合计）
    minionDmg: number;     // minionDamage += X（加算乘区，散件+套装合计）
    minionKB: number;      // minionKB += N
    sentrySlots: number;   // maxTurrets += N
    // ---- 1457 鞭 tag 栈族（ApplyEquipFunctional :13068-13083 + :14615-14648）----
    maxTagEffects: number;   // Player.maxTagEffects（:1187,默认 1;6156/6158/6159 系各 +1,满配 4）
    tagEffectDuration: number; // Player.tagEffectDuration（:1189,默认 1f;6156 系 +2f → ×3）
    accSnakeBand: boolean;   // Player.accSnakeBand（:1191;6157/6162/6186——每 3 挥中段补挥下一把鞭）
    accWickedArmlet: boolean;  // Player.accWickedArmlet（:1197;6159/6163/6179/6182——出鞭击退+1 :49159）
    fishingSkill: number;  // fishingSkill 合计（钓具+渔夫甲+软糖虫）
    /** 钓具箱族 accTackleBox（2375/3721/5064 :14123-14140）：鱼饵消耗分母 +1（:51645，Bobber 消费） */
    fishingTackle: boolean;
    /** accFishingLine（2373 高测钓线/3721 渔具袋/5064 防熔渔具袋 :14759/:14779/:14785）——
     *  收竿 1/7 断线免疫（PLA57:53076-53079）R14-E6 */
    fishingLine: boolean;
    /** 岩浆钓族 accLavaFishing（4881/5064 :14127-14140）：岩浆钓门（:19230，Bobber 消费） */
    lavaFishing: boolean;
    /** 皇家凝胶 3090（:14144-14168）：23 类史莱姆 npcTypeNoAggro（Enemy 索敌门消费） */
    royalGel: boolean;
    /** 耗魔【加算】折扣合计（manaCost 从 1f 逐项减：魔力花 0.08 :14040 + 大自然的恩赐
     *  223 0.06 :14561-14563）——消费端 (1 - manaCostOff) × manaCostMul，对齐原版加算语义 */
    manaCostOff: number;
    /** 工具箱 1923（:14405-14408 tileRangeX/Y 各 +1；与 2215 族 +3/+2 叠加，Game.inTileRange 消费） */
    toolboxRange: number;
    /** 机械透镜 3619（:12400-12402 InfoAccMechShowWires）：装备即显电线（Game showWires 消费） */
    mechShowWires: boolean;
    /** 加压器 3624（:14746-14748）：放置实心瓦自动上致动器（Game tryPlace 消费 :39977-40010） */
    autoActuator: boolean;
    /** 荧光体 5107（:26188-26194）：地面 acc×1.75/maxRun×1.15/accRun×1.15/slowdown×1.75 */
    magiluminescence: boolean;
    /** 冰冻护盾族（1253/3997 :14348-14351）：半血挂 buff 62 IceBarrier（fixedUpdate 消费） */
    iceBarrierAcc: boolean;
    /** 植物纤维绳索宝典 3068（Player.cordage :1016,UpdateEquips :14461-14463 装备置位）：
     *  割藤 52/62/382 时 1/2 掉藤绳 2996（WorldGen.cs:65087-65092 GetPlayerForTile
     *  .cordage 门）——D-4 效果端（物品 3068 已注册,效果链曾全仓未接） */
    cordage: boolean;
    /** 玫瑰族 lavaRose（1323/908/4003/4004/5000）：岩浆伤 80-45/OnFire 420-210（:27384-27387） */
    lavaRose: boolean;
    /** 浮漂饰品弹型覆写（Player.overrideFishingBobber :1920；-1=无，986-993=5139-5146） */
    overrideFishingBobber: number;
    runAccMul: number; maxRunMul: number; runSlowMul: number;   // 暗影套移动四参数(:26195-26201)
    enduranceEq: number; solarSet: boolean;
    shieldItem?: boolean;   // 日曜套(:16224-16295)
    whipRange: number;     // whipRangeMultiplier += X
    whipSpd: number;       // 鞭 useTime 倍率（黑曜套 1/1.15）
    summonSet: SummonSetFx | null;
    // ---- 呼吸族（GrantArmorBenefits/ApplyEquipFunctional 行为型）----
    divingHelm: boolean;   // accDivingHelm（Player.cs:12829/14652）：breathCDMax ×6
    merman: boolean;       // accMerman（:15019/14587/14855）：水中不耗气
    arcticDivingGear: boolean; // 1861（:14701）：专家雪原冷水 Chilled 免疫（:27692）
    jellyfishGlow: boolean;    // 1860（:14682-14688）：浸水发光
    // ---- 1457 新配饰行为旗（ApplyEquipFunctional case 6166-6189 :14596-14739）----
    accSentryBackpack: boolean;      // 6172/6175/6176/6177（:14613/:14671/:14679/:14683）
    accGolemSentryBackpack: boolean; // 6176 TemplarSling（:14680）——sentry/SentryShot 10% 强制暴击
    accHarpyCharm: boolean;          // 6166/6180/6181（:14598/:14695/:14700）——弧线引矢
    accSeraphNecklace: boolean;      // 6180（:14697）——引矢冷却 ×0.8（:28671-28673）
    hasPhoenixQuiver: boolean;       // 6181（:14701）——引矢标记箭 PhoenixQuivered（命中 323/300）
    accSnappingStone: boolean;       // 6167（:14601）——远程命中脉冲
    accPyroclast: boolean;           // 6178（:14688）——近战命中脉冲（45 伤/300px/323）
    accArmletOfRuin: boolean;        // 6179（:14692）——tag 命中脉冲（150 伤/400px）
    accPoisonBarb: boolean;          // 6165/6184/6185（:14610/:14717/:14722）——箭 100% 中毒 90t
    accHoneyedBarb: boolean;         // 6184（:14718）——箭命中 20% 放蜂
    catalystBand: boolean;           // 6185（:14724）——命中 398 AcceleratePoisons 300t
    accSharpBarb: boolean;           // 6160（:14607;rangedCrit+8 走 accfx 主链,旗登记）
    ammoCyclerMode: number;          // 6168/6169/6193/6194（:14635-14648）PlayerAmmoCyclingMode
    mysticSashDodge: boolean;        // 6189（:14739）——受击闪避（批 1 段登记位）
    accTimerCrit: boolean;           // 6170（:14604）——时间蓄能暴击（登记未接）
    shinyStone: boolean;             // 3337（:14874-14876）——生命再生 ×1.1 + 静止整段
};

export class Player extends Entity {
  w = 20; h = 42;        // 原版 Player 构造(Player.cs:55083-55084 width=20 height=42;
                         // ResizeHitbox :28744 同值)。曾 16×39(窄 4px 矮 3px)——
                         // 精灵帧 40×56 已对齐,盒偏小导致判定区比视觉小一圈
  facing = 1;            // 1 右 -1 左
  baseMaxHp = 100;
  baseMaxMana = 20;   // 原版 statManaMax2 起步 20,坠落之星 +20/颗(上限 200)
  mana = 20;
  /** 奥术水晶（item 5339 使用后永久旗标，Player.cs:44780-44783）——本仓 5339 尚无使用
   *  链路，恒 false；接使用系统后置 true 即自动进回复模型（:19242/:19259） */
  usedArcaneCrystal = false;
  /** 神盾果 5338(:44776)→ statDefense += 4(UpdatePermanentBoosters :12447) */
  usedAegisFruit = false;
  /** 神盾水晶 5337(:44769)→ lifeRegenTime +0.2/tick 爬坡加速(:18931) */
  usedAegisCrystal = false;
  /** 软糖虫 5341(:44790)→ fishingSkill += 3(:12451) */
  usedGummyWorm = false;
  /** 仙馔蜜酒 5342(:44796)→ pickSpeed/tileSpeed/wallSpeed ±0.05(:12455) */
  usedAmbrosia = false;
  // ChaosState(88) 已走 buffs 真实装（BuffType.ChaosState=83；混乱之杖 Game 侧
  // case 1326 的 has/apply 门）——旧"独立冷却字段"近似已退役（2026-08-15 销项）
  /** 魔力蓄能（Player.manaRegenCount :1824，UpdateManaRegen :19274 累积 ≥120 +1 魔） */
  manaRegenCount = 0;
  /** 用魔惩罚期（Player.manaRegenDelay :1826，float）：>0 时每帧产额 0（:19270-19271） */
  manaRegenDelay = 0;
  /** 用魔物品动画窗剩余 tick（itemAnimation>0 期每帧重置 delay，:42131-42137） */
  manaAnimTicks = 0;
  // ---- 1457 ManaHeat 魔力过热族（Player.cs:961-967 字段声明）----
  /** Player.slowMagicUse（:961）：蓝空过载施法标记——DebugOptions.ManaV2 默认 true
   *  （Testing/DebugOptions.cs:30）→ release 正式机制。置位 = CheckMana 蓝不足分支
   *  :53241-53256 → DoRunOutOfManaEffect :53258-53261（空蓝照放+攻速 ×0.4）；
   *  每次施法入口 CheckMana :53217 先清、喝蓝药 UndoSlowMagicUse :52585 清 */
  slowMagicUse = false;
  /** Player.yoyoHitCounter（:1203，初始 -1）：EverySomeYoyoHits 共享命中计数器——
   *  仅悠悠球 per-hit 族（545/546/554/555）命中时经 everySomeYoyoHits() 自增 */
  yoyoHitCounter = -1;
  /** Player.manaHeat（:963）：魔法伤害乘区，ResetEffects 每帧清 1f（:18709），
   *  UpdateBuffs buff 396 段累加（:10416-10429） */
  manaHeat = 1;
  /** Player.latestManaPotionDamageBonus（:965）：最近一次 ManaHeat 源的功率 */
  latestManaPotionDamageBonus = 0;
  /** Player.latestManaPotionDuration（:967）：最近一次 ManaHeat 源时长（tick） */
  latestManaPotionDuration = 0;
  /** Player.chlorophyteBladeCounter（1457 新字段，叶绿巨剑 1226 三连击计数——
   *  ItemCheck :43161-43163 每帧递减，ItemCheck_Shoot :49406 奖励击后 += itemAnimation×3） */
  chlorophyteBladeCounter = 0;
  /** 调试：无敌 + 无限魔力（F2 切换，原版无）——damage() 早退 + 每 tick 血蓝回满
   *  （回满兜住 DoT/溺水/摔落等直改 hp 的路径）。仅本地调试语义，不入存档 */
  debugGod = false;
  shieldRaised = false;      // 格挡盾举起(:31263)
  shieldParryTimeLeft = 0;  // 格挡窗口(:30981 >0 面敌免疫+反伤2×)
  shieldParryCd = 0;        // 降盾冷却(:31276 15t)
  /** 玩家对决开关（Player.cs:2436 hostile，会话态不存档——仅网络同步，进服默认 false） */
  hostile = false;
  /** 队伍 0-5（Player.cs:1312 team，PlayerTeamID：0 无/1 红/2 绿/3 蓝/4 黄/5 粉紫；存档持久） */
  team = 0;
  /** 发色剂槽（Player.cs:2412 hairDye byte——染料 shaderId 1..12，0=无/去除剂清除；
   *  使用发色剂物品赋值 Player.cs:42179-42186，随存档持久化 :53805-53808）。
   *  原版无装备槽位——使用即换色，清除走 1990 去除剂 */
  hairDye = 0;
  /** 上一 tick PvP 死亡标记（Player.cs:1250 pvpDeath：KillMe 时若 pvp 置位——
   *  死亡不掉钱 + 复活满血/300t 无敌/跳过 Boss 延迟，:38208/:38321/:37223/:38388） */
  lastPvpDeath = false;
  hp = 100;
  /** 最近一次伤害死因（PlayerDeathReason 语义子集）——死亡瞬间由 Game 消费生成原版死亡文本 */
  lastDamageCause: import('../i18n/RandomText').DeathCause | null = null;
  /** 上一 tick 石化态（:24941 lastStoned——变身过渡检测） */
  lastStoned = false;
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
  /** 游泳划水动画计时（Player.swimTime :2634——脚蹼水中跳/人鱼按住刷新 30，
   *  PlayerFrame :35307-35312 每帧 -1；帧档 0/5/0 三段 :36098-36118。仅动画语义，
   *  本仓渲染未消费——状态位保留） */
  swimTime = 0;
  inWater = false;
  /** 出入水 10t 去抖（Player.wetCount，Player.cs:27464/27558 置 10、:27651 每tick 递减、
   *  :37203 重生清零）——水波涟漪尺寸因子（WaterShaderData.cs:263 h·wetCount/9） */
  wetCount = 0;
  headUnderwater = false;
  /** 税务员累积税款（Player.cs:792 taxMoney，铜币；对话「收集」领取） */
  taxMoney = 0;
  /** 渔夫任务完成数（Player.cs:1790 anglerQuestsFinished；随角色存档 PL:53943/54670。
   *  交付时先 ++ 再结算奖励（Main.cs:39671-39672）——奖励阶梯/稀有度系数全看此值 */
  anglerQuestsFinished = 0;
  /** PVE 死亡计数（Player.numberOfDeathsPVE，PL:53840；存档 player 段持久化） */
  deathsPve = 0;
  /** PvP 死亡计数（Player.numberOfDeathsPVP，KillMe :38228 按 pvpDeath 分道计数） */
  deathsPvp = 0;
  /** 圣骑士盾转移冷却（hurtCooldowns[ImmunityCooldownID.PaladinsShield] 槽近似,
   *  Player.cs:37756-37763——独立于常规无敌帧;Game.fixedUpdate 递减） */
  paladinShieldCd = 0;
  /** 收税计时（Player.cs:793 taxTimer；taxRate=3600 即每游戏小时一结） */
  taxTimer = 0;
  /** 蜂蜜浸入（原版 honeyWet，Player.cs:27436-27438）：授予 Honey buff(48,1800t) 的来源 */
  inHoney = false;
  /** 微光浸入（原版 shimmerWet，Player.cs:27420-27424：Collision.shimmer 盒命中） */
  inShimmer = false;
  /** 微光化态（buff 353，Player.cs:11381-11388）：frozen 封输入 + fallStart 重置 +
   *  受击免疫（Hurt :37591-37595 直接 0）+ 穿墙下坠（:27868 velocity×0.375 完全
   *  绕过 tile collision；:24117-24119 gravity/maxFall ×0.9）——直到落入能容纳的
   *  空腔（盒覆盖全非实心）才实体化（:11403-11419 DelBuff） */
  shimmering = false;
  /** 微光滞留 tick（TryToShimmerUnstuck :28378：钳 0-7200，shimmering +1/否则 -10） */
  timeShimmering = 0;
  /** 微光化半透明（Player.cs:18147-18162 shimmerTransparency：shimmering +0.015/t
   *  钳 0.8；解除后 -0.015/t 回 0，衰减起始帧（恰 0.8）播 Sound 19 style 3）。
   *  渲染侧 globalAlpha = 1 - 值（GetAlpha :53253 三通道乘 (1-t) 近似） */
  shimmerTransparency = 0;
  // ---- 呼吸 1:1（Player.cs:1402-1406 / CheckDrowning :22914-23002）----
  breathMax = 200;   // :1404（全源码无修改点——潜水头盔加的是 breathCDMax ×6 非 breathMax）
  breath = 200;      // :1406（显示侧气泡数 = breathMax/20 = 10）
  breathCD = 0;      // :1402（每 tick +1，≥breathCDMax 时 breath--）
  /** 原版 itemAnimation 等效（>0 = 挥舞动画中）：芦苇管换气门禁（:22920/:3698）
   *  用。Game.fixedUpdate 每帧注入（swing 在 postUpdate 递减，读到的是上一帧尾值，
   *  ≤1 tick 偏差，注释存档） */
  itemAnimTicks = 0;
  /** 魂镰 3006 吸魂计数（Player.cs:784 字段；NPC.cs:91952-91979 每帧邻域敌
   *  SoulDrain+3006 挥击中 → ++；Player.cs:9555 UpdateBuffs >0 → AddBuff(151,2)
   *  自持；:18939 lifeRegenTime+2；:18979 回复加成 (5+n)/2——每 tick 0 归零） */
  soulDrain = 0;
  /** 本帧吸魂回复加成缓存（(5+soulDrain)/2 截断，:18980） */
  soulDrainBonus = 0;
  /** SuperCart 矿车坐骑防御加成（Mount.cs:4797-4798 UpdateEffects 每帧写入：
   *  statDefense += (int)(2×(1+|vx|/RunSpeed×2.5))；下车清零）——Minecart 持有 */
  cartDefenseBonus = 0;
  /** accMerman 人鱼化态（:22965 merman=true，水中呼吸；本作仅标志，变身渲染后续） */
  merman = false;
  inLava = false;
  private lavaAccum = 0;
  animTime = 0;          // 走路动画计时
  useTime = 0;           // 通用动作冷却
  // ---- pulley 绳索悬挂态（Player.cs:1028/1026/994/1506/1504；FindPulley :19355-19460）----
  /** 绳上悬挂（原版 pulley）：按上/下键抓绳吸附进态；HorizontalMovement 整段不跑
   *  （Player.cs:26366 在 pulley else 分支内）、X 钉绳列、gfxOffY 视觉偏移 */
  pulley = false;
  /** 悬挂侧向档（原版 pulleyDir，Player.cs:1026）：0=未定（状态机首帧归 1）、
   *  1=绳列中心、2=中心±6px（贴绳侧挂） */
  pulleyDir = 0;
  /** 视觉纵向偏移（Player.cs:1504 gfxOffY）：挂绳/上绳瞬间 position.Y 跳变时
   *  记录差值（=position.Y−新Y），渲染锚点（钓线/悠悠球线/持物）消费；
   *  每 tick 衰减回 0（:27695-27719），钳 ±32。矿车态另有 Minecart.gfxOffY
   *  （贴轨补偿，Renderer:8590）——两源互斥（pulley 门含 !mount.Active） */
  gfxOffY = 0;
  /** 台阶/挂绳视觉缓动速度（Player.cs:1506 默认 1f；FindPulley 置 2.5——
   *  gfxOffY 衰减步长乘子。原版 Collision.StepUp/Down 会按台阶改写 1/1.5/2/2.5，
   *  本仓台阶走 stepRenderY 独立系统不写此值） */
  stepSpeed = 1;
  /** 绳端下穿冷却（Player.cs:994 ropeCount）：孤立绳格按下键穿落时置 10，
   *  归零前 FindPulley 不再抓绳（:25801-25805 门 / :26129 置位） */
  ropeCount = 0;
  /** 手持物品 useTurn（Item.cs SetDefaults；Game 每帧注入）——itemAnimation 窗内
   *  允许移动改朝向的唯一豁免（:19546-19556） */
  itemUseTurn = false;
  dead = false;
  respawnTimer = 0;
  /** sunScorchCounter（Player.cs:2228）：吸血鬼种子"阳光炽灼"蓄能 0-300（每 tick
   *  updateSunScorchValues 推进；写入端 vampireSeedSunlightExposure 已接，见
   *  updateSunScorch——非吸血鬼世界恒 0）。消费：耀斑强度 AdjustIntensity
   *  （NextHorizonRenderer.cs:398-406，SkyRenderer.drawLensFlare 经 frameCtx.player
   *  透传读）、炽灼音环音量（updateSunScorchValues）、120 档点火链（updateSunScorch）
   *  与热浪扭曲门（SceneState.cs:122 flag7 / :187-191 强度 lerp×4——本仓无
   *  HeatDistortion 滤镜，登记） */
  sunScorchCounter = 0;
  /** vampireBurningInSunlight（Player.cs:2676）：阳光暴露位。置 true =
   *  vampireSeedSunlightExposure（:28228，vampireSeed 且露天白天自脚下向上扫 15 格
   *  透光墙）；清 false = 帧首重置（ResetEffects :18549 等价位）/死亡(:28103)。
   *  消费：counter 步进方向（±1/−6）、Molten 套 buffImmune[24] 门(:15883)、
   *  死亡文案 ByOther(22)(:19187)、点火链门(:28153) */
  vampireBurningInSunlight = false;
  /** 夜/日食相位（fixedUpdate 每帧从 world 灌入：!isDay || eclipse——月亮石 900
   *  :14871-14874 的天界石复合门）。equipStats 记忆化输入 → equipStatsKey 的 N/d 档 */
  nightPhase = false;
  /** 死亡画面淡入（Player.cs:16873：dead 时 +2/tick 钳 255；GetDeathAlpha :53284 消费）
   *  ——兼作散飞体渐隐（GetImmuneAlpha :53253：(255−值)/255，>125 直接全透明） */
  immuneAlpha = 0;
  /** 死亡三段散飞（KillMe :38287-38298 初速 / UpdateDead :16878-16888 翻滚解体）：
   *  头/身/腿各带 pos（相对死亡位像素偏移）/vel/rot——渲染 drawDeadPlayerParts
   *  按三件分离绘制（原版 PlayerDrawLayers 逐层 + headPosition/bodyPosition/legPosition） */
  deadParts = {
    head: { px: 0, py: 0, vx: 0, vy: 0, rot: 0 },
    body: { px: 0, py: 0, vx: 0, vy: 0, rot: 0 },
    legs: { px: 0, py: 0, vx: 0, vy: 0, rot: 0 },
  };
  /** 击杀击退方向（KillMe hitDirection 参：X 初速 +2×dir；环境死（岩浆/窒息/溺水
   *  等无击退源）=0——damage() 击退段捕获，同原版 Hurt 的 hitDirection 口径） */
  deathHitDir = 0;
  /** 硬核幽灵帧 0-3（Ghost() :6444-6450：ghostFrameCounter 每 8t 推进 %4） */
  ghostFrame = 0;
  private ghostFrameCounter = 0;
  /** 死亡初速已掷标记（见死亡结算门——dead 可能被 Game 侧先直置） */
  private _deathPartsInit = false;
  /** 眼睑帧 0-2（PlayerEyeHelper.EyeFrameToShow：0 睁 1 半闭 2 全闭——
   *  渲染叠 Player_0_15 帧于头/眼之上；死亡态不更新（UpdateDead 无该链）） */
  eyeFrame = 0;
  private eyeState = 0;      // PlayerEyeHelper.EyeState 枚举序（见文件尾 EYE_* 常量）
  private eyeTimeInState = 0;
  // 摔伤追踪
  fallStartY: number | null = null;   // 矿车骑乘同步清空（车上不计摔伤），公开给 Minecart
  /** 蛛网挣扎计数（原版 stickyBreak，Player.cs:22653） */
  private stickyBreak = 0;
  sinceHurt = 0;               // 距上次受击 tick（自然回血计时；渲染层读取做心心跳动效）
  /** 移动段当前速度上限探针（mounts.test 等消费;非原版字段） */
  _maxRunProbe = 0;
  /** 日曜护盾层数 0-3（Player.solarShields,:16250）;受击每层该次伤 ×0.2（:37699-37720） */
  solarShields = 0;
  /** 护盾回充计时（Player.solarCounter,:16227 每 180t=3s 回 1 层） */
  solarCounter = 0;
  /** 日曜冲撞进行中（solarDashing,:20855）;命中已耗盾标记（solarDashConsumedFlare） */
  solarDashing = false;
  private solarDashConsumed = false;
  /** 盾球环绕偏移/速度（Player.solarShieldPos/Vel :876;轨道更新 :16258-16283,
   *  渲染 DrawPlayer_26_SolarShield——Extra_61+shields-1 单贴图含全簇） */
  solarShieldPos = [ { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 } ];
  solarShieldVel = [ { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 } ];
  /** 自然回血爬坡计时（Player.lifeRegenTime：受击 :37784 / DoT :18781+ / 流血 :19000 清零，
   *  每 tick 基础 +1（:18930）、蜂蜜 +2（:18954）；本仓自然回血为恒 1HP/s 简化，爬坡只
   *  决定"出伤后多久开始回"（首档阈值 300t :19003）——蜂蜜 3 倍速抵达 */
  lifeRegenTime = 0;
  /** 本 tick 落地冲击速度（碰撞前 vy≥3 落地才非 0；Game 消费：起爆器 411 坠落触发） */
  landImpactVy = 0;
  private regenAccum = 0;
  stepRenderY = 0;             // 跨台阶的渲染高度补偿（缓动到 0，消除瞬移顿挫）
  stepUp = true;               // Collision.StepUp 自动上台阶（moveAndCollide 内消费）
  stepUpHolds = false;         // holdsMatching（Player.cs:23258 第 8 参 = controlUp，fixedUpdate 灌入）
  stepUpNpc = false;
  stepDownGate = 'gravity' as const;  // StepDown 门 = vy===GRAVITY（Player.cs:23252 字面）
  /** 高尔夫累计分（Player.cs:1792 AccumulateGolfingScore——Golfer 商店门槛/月相画门） */
  golferScoreAccumulated = 0;
  /** 鞭命中授予的玩家 buff（WhipTagEffect.PlayerBuffId → 剩余 tick；
   *  效果实装（:9790-9802）：311 镰鞭=鞭攻速+35%、308 剑鞭=+25%、314 荆棘鞭=+12%
   *  ——Game 鞭 useTime 结算读取；312/365 登记持续期（效果端暂不接） */
  whipBuffs: Record<number, number> = {};
  // ---- 1457 鞭 tag 栈（TagEffectStack,Player.cs:1867 字段 + :56750 init + :24785
  //      Update）——每玩家 MRU 栈,容量 5;门控 maxTagEffects/tagEffectDuration 出
  //      equipStats（配饰 6156/6158/6159 系）。 WhipProj 打 tag、随从/哨兵命中侧
  //      resolveWhipTagHit 统一经此查询（敌实体不再存 tag 态） ----
  tagEffectStack = new TagEffectStack(this);
  /** Player.maxTagEffects（:1187,默认 1;ResetEffects :18633 重置→equipStats 聚合） */
  get maxTagEffects(): number { return this.equipStats.maxTagEffects; }
  /** Player.tagEffectDuration（:1189,默认 1f）——tag/proc/自 buff 时长乘区 */
  get tagEffectDuration(): number { return this.equipStats.tagEffectDuration; }
  /** Player.repeatWhipSwings（:1199,初始 -1）——蛇环补挥计数（真挥 +1 :49184,
   *  120t 无挥经 Update_SnakeBand :28623-28628 归 -1） */
  repeatWhipSwings = -1;
  /** Player.repeatWhipsResetCooldown（:1201） */
  repeatWhipsResetCooldown = 0;
  /** 拍击石系共用冷却（Player.accSnappingStoneCooldown :1215,360t——6167 拍击石/
   *  6178 焰爆石/6179 毁灭臂镗三脉冲同轴,Update :28599-28610 递减+回充音登记未接） */
  accSnappingStoneCooldown = 0;
  // ---- 1457 配饰四件运行态（字段 :1219/:1229/:1231/:1237/:1241；Update 调用链
  //      :24760-24763，本体 :28521-28659。消费端：弹药轮换=Game 射击路径
  //      PickAmmo :54326-54390；哨兵携带=MinionProj sentry 分支
  //      CanGetPickedUpBySentryBackpack :80532-80557；蓄能暴击=Game 近战命中
  //      TryConsumingTimerCrit :28564-28572；弧线引矢=Arrow.ts harpyCharmEffect）----
  /** Player.ammoCyclingCooldown（:1229）：PickAmmo 实耗一发 → useAnimation+120
   *  （:54211-54212）；Update_AmmoCycler :28632-28638 走完归 0 拍把 offset 复位
   *  = 停火 useAnimation+120t 后轮换回第一组弹药 */
  ammoCyclingCooldown = 0;
  /** Player.ammoCyclingOffset（:1231）：每发 ++（:54213）、Random 模式直写
   *  Main.rand.Next()（:54214-54217）；选弹 = offset % 兼容弹药组数（:54346） */
  ammoCyclingOffset = 0;
  /** Player.accHarpyCharmCooldown（:1219）：引矢冷却 90t、6180 炽天使 ×0.8=72
   *  （:28670-28674）；Update_HarpyCharm :28648-28659 递减、归零拍才扫描 */
  accHarpyCharmCooldown = 0;
  /** Player.accSentryBackpackGrabCooldown（:1237）：携带中每拍被哨兵 AI 续约 2
   *  （SetAsSelectedSentryBackpackTarget :80554-80557）——>0 期其余哨兵不可再被拾
   *  （CanGetPickedUpBySentryBackpack :80543 门）= 同时至多携带一门 */
  accSentryBackpackGrabCooldown = 0;
  /** Player.accTimerCritCharge（:1241，0..1000；timerCritChargeFull :3387 ≥1000）：
   *  Update_TimerCrit :28521-28562 充能 3/t（用物中）+3/t（闲置）+3/t（|v|<0.1 驻立）；
   *  近战命中消费 → −15（:28570），负窗 1/t 回充（:28528-28533）且窗内命中仍暴击
   *  （TryConsumingTimerCrit :28566 `charge < 0f` 亦过门） */
  accTimerCritCharge = 0;
  /** 1457 相机平移档（Player.Settings.PanControl_Keyboard :359;ButtonControlMode.cs:
   *  Hold=0/Click=1/OnAlways=2/OffAlways=3,缺省 Hold=旧行为。设置 UI 循环切换
   *  CyclePanControl_KeyboardAndMouse :379-382 登记未接——控制台/测试可直写） */
  panControlMode = 0;
  /** Player.hasClickPanOn（:2837）——Click 档互动键（右键）切换的平移开关 */
  hasClickPanOn = false;
  // ---- 信息显示运行态(Player.cs 对应字段) ----
  /** 各信息显示开关(Player.hideInfo[13] :776;按下标=图标序,随存档;
   *  唯一交互=背包界面点图标切换,Main.cs:46547-46573) */
  hideInfo: boolean[] = new Array(13).fill(false);
  /** 配饰格可见性开关(Player.hideVisibleAccessory[10] :1590;下标=装备槽序,随存档)。
   *  交互=装备页配饰格旁眼睛图标点击翻转(Main.cs:40855-40880,仅 num40>2 配饰段
   *  3-9 有图标;盔甲 0-2 与社交 13-19 无)。消费侧:①UpdateVisibleAccessories
   *  :36361 !hide 才 UpdateVisibleAccessory(功能槽贴图隐藏,功能效果不受影响
   *  ——ApplyEquipFunctional :13962 独立扫);②翅膀特例 :12580 隐藏翼在
   *  vy≠0 且 mount.CanUseWings 时仍显形;③UpdateItemDye :9313-9322 隐藏槽染料
   *  不应用(翼族/盾 fallback 豁免);④社交槽 13-19 第二轮 :36368-36375 无 hide 门。
   *  ★原版语义定谳:眼睛图标只挂功能配饰段,"虚荣槽 13-19 也可隐藏"与原版不符,
   *  审计登记回写不改码 */
  hideVisibleAccessory: boolean[] = new Array(10).fill(false);
  /** 击杀计数行"最近击杀"(Player.lastCreatureHit :2458;命中写入 :20175/:43750) */
  lastCreatureHit = -1;
  /** 渔情行粘性缓存(Player.displayedFishingInfo :2498;浮漂在水时保持旧值) */
  displayedFishingInfo = '';
  /** 秒表速度滑动窗口(Player.speedSlice :1292,长 60;窗口长随速度变化) */
  speedSlice = new Float32Array(60);
  // ---- 指针物品/交互图标(DrawInterface_40 :44474;Player.cs:1730-1740 五字段,
  //      Game 每帧 hover 扫描写入、帧首重置——reset 在 Game.tickCursorIcon) ----
  cursorItemIconEnabled = false;
  /** 覆写图标物品 id(0=用手持;悬停交互物时设) */
  cursorItemIconID = 0;
  /** 光标图标偏移推进(基 10px 之上) */
  cursorItemIconPush = 0;
  /** 光标旁 tooltip 文本(空=无) */
  cursorItemIconText = '';
  /** 图标水平翻转(高门族) */
  cursorItemIconReversed = false;
  /** 雷达/稀有生物节流(Player.accThirdEyeCounter/accCritterGuideCounter :2462/:2472,
   *  byte;ResetEffects :12625 卸下雷达时 accThirdEyeCounter 归零 → 重装备立即重扫) */
  accThirdEyeCounter = 0;
  accCritterGuideCounter = 0;
  /** 雷达扫描间缓存的敌数(Player.accThirdEyeNumber :2464,byte;唯一消费点
   *  DrawInfoAccs :46406-46408 行文本;byte++ 255 回绕此处不模拟——2000px 内
   *  敌数 >255 不现实) */
  accThirdEyeNumber = 0;
  /** 稀有生物行缓存。原版 accCritterGuideNumber(:2474)缓存的是 npc[] 槽位索引,
   *  消费点 npc[num13].GivenOrTypeName(:46366/:46371)——本仓实体无 npc 槽位数组,
   *  索引不可移植,直接缓存消费产出(生物名)+ id(金色生物行染色判定)等效 */
  accCritterGuideText: string | null = null;
  accCritterGuideVid: number | null = null;
  // ---- DPS 计(Player.cs:2488-2496 字段 + :53290-53353 addDPS/checkDPSTime/getDPS) ----
  /** dpsDamage/dpsStart/dpsEnd/dpsLastHit/dpsStarted;墙钟 3 秒窗口,停手自动归 N/A */
  private dpsDamage = 0;
  private dpsStart = 0; private dpsEnd = 0; private dpsLastHit = 0;
  private dpsStarted = false;
  /** addDPS(:53301-53309)——命中伤害累计;accDreamCatcher 门禁在调用侧(原版两调用点均门禁:
   *  Projectile.cs:12817/Player.cs:20165),此处同样收口 */
  addDPS(dmg: number): void {
    if (!this.equipStats.infoAccs.accDreamCatcher) return;
    const now = Date.now();
    if (!this.dpsStarted) {
      this.dpsStarted = true;
      this.dpsDamage = 0;
      this.dpsStart = now;
      this.dpsEnd = now;
    }
    this.dpsLastHit = now;
    this.dpsDamage += dmg;
    this.dpsEnd = now;
  }
  /** checkDPSTime(:53319-53327):距上次命中 ≥3 秒 → 停表 */
  private checkDPSTime(): void {
    if (this.dpsStarted && Date.now() - this.dpsLastHit >= 3000) this.dpsStarted = false;
  }
  /** getDPS(:53328-53353):窗口归一,elapsed 下限 1s,>3s 重均并把起点重置为 now-1s */
  getDPS(): number {
    this.checkDPSTime();
    if (!this.dpsStarted) return 0;
    const elapsed = Math.max(1, (this.dpsEnd - this.dpsStart) / 1000);
    const dps = this.dpsDamage / elapsed;
    if (elapsed > 3) {
      this.dpsDamage = Math.round(dps);
      this.dpsStart = this.dpsEnd - 1000;
    }
    return Math.floor(dps);
  }
  /** 右键集火目标（MinionAttackTargetNPC，Player.cs:48952：召唤杖右键指定，
   *  随从索敌优先；-1=无。失效：死亡或离玩家 >3000px——随从侧判定） */
  minionTargetId = -1;
  /** 星云三族等级（0-3，各自独立 480t；NebulaLevelup :56091-56121 逐级升/降）：
   *  0=伤害 179-181（四系 +15%/级）1=生命 173-175（lifeRegen +6/级）2=魔力 176-178 */
  nebula = [0, 0, 0];
  private nebulaT = [0, 0, 0];
  private nebulaManaAccum = 0;
  private nebulaLifeAccum = 0;
  /** NebulaLevelup（:56091-56121）：本族 +1 级 cap3，满 480t 重置（拾取驱动） */
  nebulaLevelup(family: 0 | 1 | 2): void {
    this.nebula[family] = Math.min(3, this.nebula[family] + 1);
    this.nebulaT[family] = 480;
  }

  /** 取消一族星云增益（buff 栏右键 DelBuff 等价，Main.cs:42793 TryRemovingBuff——
   *  原版 UpdateBuffs_NebulaBuffs :11660 从 buffType 派生等级，buff 没了效果即停；
   *  本仓等级即真值 → 清零同语义） */
  nebulaCancel(family: 0 | 1 | 2): void {
    this.nebula[family] = 0;
    this.nebulaT[family] = 0;
  }

  /** 星云增益 buff 栏视图（补 C ⚠️图标批）：等级>0 的族 → 原版档位 buff id +
   *  剩余秒。档位映射 = UpdateBuffs_NebulaBuffs（Player.cs:11660-11669
   *  num = 1 + buffType[b] - baseBuffId）+ AddBuff(type + level - 1, 480)
   *  （NebulaLevelup :56109/:56113/:56117）——0=伤 179-181 / 1=命 173-175 /
   *  2=魔 176-178。图标 Buff_173-181.png（UI 直链） */
  nebulaBuffIcons(): Array<{ fam: 0 | 1 | 2; vanillaBuff: number; secs: number }> {
    const base = [179, 173, 176] as const;
    const out: Array<{ fam: 0 | 1 | 2; vanillaBuff: number; secs: number }> = [];
    for (const fam of [0, 1, 2] as const) {
      const lvl = this.nebula[fam];
      if (lvl > 0) out.push({ fam, vanillaBuff: base[fam] + lvl - 1, secs: Math.ceil(this.nebulaT[fam] / 60) });
    }
    return out;
  }
  /** 甲虫攻击球（0-3）：近战命中蓄能，受击掉一颗 */
  beetleOrbs = 0;
  private beetleCharge = 0;
  /** 近战续航窗口（onMeleeHit 刷新；fixedUpdate 内蓄能消费） */
  private lastMeleeTick = 0;
  /** 潜行度：1=无潜行(全可见)、0=满潜行——越低越隐（1457 Player.cs:1545 初值 1f；
   *  消费式全走 (1−stealth) 加成：变态刀伤/暴 :25970-25971、星璇伤/暴/仇恨
   *  :26043-26045、蘑菇矿 Remap :26015-26018）。此前误写 0=出生即"满潜行"，
   *  变态刀/潜行装在首帧即吃满加成、渲染 s'=max(stealth,0.03) 近乎全隐。
   *  蘑菇矿=移动蓄/星璇=双击↓开关（1457 :25981-26021/:26022-26068） */
  stealth = 1;
  private stealthTimer = 0;
  vortexStealthActive = false;
  private prevDown = false;
  private downTapT = 0;
  private sharpenedCd = 0;
  /** BOC 受击脉冲（fixedUpdate 内消费：buff 321 + 困惑近敌） */
  bocPulse = 0;
  /** Player.insanityShadowCooldown（Player.cs:1060；SpawnHallucination :13633 递减）：
   *  骸骨头盔幻影生成节流——归零时重掷 Next(20,101) */
  insanityShadowCooldown = 0;
  /** 原版 Player.insideUnbreakableWalls（Player.cs:2678；UpdateUnbreakableWallScan
   *  :28125-28141 更新）：getfixedboi 双地牢不可破墙内的越界判定——刷怪链
   *  tresspassingDualDungeon（NPC.cs:313）消费。普通世界恒 false */
  insideUnbreakableWalls = false;
  private uwScanCd = 0;
  private uwScanX = 0;
  private uwScanY = 0;
  /** UpdateUnbreakableWallScan（Player.cs:28125-28141）：Main.dualDungeonsSeed 门
   *  （getfixedboi）+ 20t 冷却/256px 移动重扫；扫描=UnbreakableWallScan.cs。
   *  Game 刷怪周期调用（内部冷却幂等） */
  updateUnbreakableWallScan(world: import('../world/World').World, force = false): void {
    if (!world.seedFlags?.everything) return;   // Main.dualDungeonsSeed（:28127-28129）
    if (force || --this.uwScanCd <= 0
      || Math.hypot(this.cx - this.uwScanX, this.cy - this.uwScanY) >= 256) {
      this.insideUnbreakableWalls = insideUnbreakableWallsScan(
        world.store, Math.floor(this.cx / 16), Math.floor(this.cy / 16));
      this.uwScanCd = 20;                       // UnbreakableWallRescanPeriod :2970
      this.uwScanX = this.cx; this.uwScanY = this.cy;
    }
  }
  /** 睡眠（PlayerSleepingHelper SH:155-191：脚侧悬停右键入睡；床失效/移动输入/挥武器唤醒。
   *  ★受伤不唤醒（StopSleeping 全调用点仅 5 处，SH:98-131）。睡熟阈值 120t（SH:11） */
  sleeping = false;
  timeSleeping = 0;
  /** 坐椅（PlayerSittingHelper 1:1，2026-08-15）：isSitting = isLockedToATile——
   *  重力/常规移动锁死（velocity 恒 0，矿车同款早退段）；任意移动输入/朝向变化/
   *  椅失效 → 起身（Game.updateSitting 每帧）。渲染偏移 seatOffsetX/Y =
   *  offsetForSeat + sittingIndex 叠坐位（单人恒 0） */
  sitting = false;
  /** 座位渲染偏移（offsetForSeat，px） */
  seatOffsetX = 0;
  seatOffsetY = 0;
  /** 马桶座位（ExtraSeatInfo.IsAToilet）——TryToPoop 门 */
  seatIsToilet = false;
  /** 坐椅恢复加成计时（坐满 10t 后 TryToPoop 可触发） */
  sitTicks = 0;
  /** 联机远端位置平滑偏移（原版 Player.netOffset，MessageBuffer.cs case 13 注入、
   *  Player.UpdateNetOffset :28240 衰减）：模拟位置与权威快照的差，渲染时叠加。
   *  本地玩家恒 0 */
  netOffX = 0;
  netOffY = 0;
  /** 联机远端挥舞动画（msg13 useItem 位驱动；Game 派生，Renderer 以 swing 参数消费）。
   *  useStyle/aim 与本地 Game.swing 同构（远端无瞄准角同步，aim 取 0=正前方）——
   *  缺失时 Renderer 退化为 useStyle 1 剑挥（喝药/开枪/举火把全错）。
   *  本地玩家不用（本地走 Game.swing） */
  swingNet: { t: number; dur: number; item: number; useStyle?: number; aim?: number } | null = null;
  /** 矿车骑乘中（原版 mount.Active && mount.Cart）：常规移动/跳跃/重力由 Minecart
   *  实体接管（Player.cs:27783-27850 TrackCollision 段），fixedUpdate 提前返回；
   *  渲染层消费本标志取坐姿帧（mount.BodyFrame=3）并叠画车身 */
  ridingCart = false;
  /** 当前所骑矿车（渲染层叠画车身/倾角用；Game 挂载） */
  cart: import('./Minecart').Minecart | null = null;
  /** 坐骑实例（Mount.cs Mount 1:1：非矿车坐骑状态机/能量/帧态；矿车族由 Minecart 接管） */
  mount = new MountInstance();
  /** 骑乘中（非矿车坐骑；渲染/物理分支消费——原版 mount.Active && !mount.Cart） */
  get ridingMount(): boolean { return this.mount.active && !this.mount.isCart; }
  /** 游泳族坐骑门（坐骑 buff 的 ignoreWater 语义：海龟 131/猪鲨崽 168/熔岩鲨 265） */
  get ridingMountSwimFree(): boolean { return this.ridingMount && this.mount.swimFree; }

  constructor(x: number, y: number, inv: Inventory) {
    super();
    this.x = x; this.y = y;
    this.inv = inv;
  }

  // ---- 配饰效果（重算式聚合，幂等）----
  /** Lucky Horseshoe 158（本地 accessory 枚举退役,vid 判定） */
  get hasHorseshoe(): boolean {
    const want = VI_ID(158);
    for (let i = ACC_ARMOR_START; i < this.inv.accSlotMax; i++) { // armor[3-7 基座+恶魔之心 8(原版 Player.cs:36326)
      const s = this.inv.armor[i];
      if (s && s.id === want) return true;
    }
    return false;
  }
  /** Feral Claws 211 */
  get hasFeralClaws(): boolean {
    const want = VI_ID(211);
    for (let i = ACC_ARMOR_START; i < this.inv.accSlotMax; i++) {
      const s = this.inv.armor[i];
      if (s && s.id === want) return true;
    }
    return false;
  }
  /** 防御 = 基础(0) + 盔甲/配饰（含 vi_ 表防御+accfx def+词缀 62-65）+ 铁皮 Buff(+6)（时装不计） */
  get defense(): number {
    let d = this.buffs.defenseBonus + this.equipStats.def + this.cartDefenseBonus;
    if (this.usedAegisFruit) d += 4;   // UpdatePermanentBoosters :12447-12449
    for (const id of this.inv.equippedArmor()) {
      if (id != null) d += ITEM_DEFS[id]?.armor?.defense ?? statOfInternal(id)?.def ?? 0;
    }
    // 破甲(36)/枯萎护甲(195)：终值各减半（Player.cs:25704/:25708——全部来源加总之后）
    if (this.buffs.has(BuffType.BrokenArmor)) d = Math.floor(d / 2);
    if (this.buffs.has(BuffType.WitheredArmor)) d = Math.floor(d / 2);
    return d;
  }

  /** 装备数值聚合（GrantArmorBenefits/ApplyEquipFunctional/GrantPrefixBenefits 可移植切片）。
   *  覆盖：配饰防御/魔力/回复/移速/近战速度/全系伤害/暴击 + 词缀 62-80 效益；
   *  行为型效果（火箭靴飞行/熔岩护身等）不在内。每帧重算式聚合，幂等 */
  /** 翅膀染料 vid（Player.cs:9306-9312 UpdateItemDye 链 + :9417 cWings）：
   *  armor[0..19] 中最后一个 wingSlot>0 槽位 → dye[i%10]（vanity 10-19 后扫
   *  自然胜出 = 原版同序）；无染料/无翅 → -1 */
  wingDyeVid(): number {
    let slot = -1;
    for (let i = 0; i < 20; i++) {
      const it = this.inv.armor[i];
      if (!it) continue;
      if ((statOfInternal(it.id)?.wing ?? 0) > 0) slot = i % 10;
    }
    if (slot < 0) return -1;
    const dye = this.inv.getEffectiveDye(slot);   // LoadoutShare（GetEffectiveDye :5736）
    if (!dye) return -1;
    return viIdFromKey(ITEM_DEFS[dye.id]?.key ?? '') ?? -1;
  }

  /** 盔甲套染料 vid（Player.cs:9456 ArmorSetDye：Next(3) → 0=cHead/1=cBody/2=cLegs,
   *  兜底 cBody——dye[0..2] 对应头/身/腿；无染料 → 0=无 shader） */
  armorSetDyeVid(): number {
    const pick = Math.floor(Math.random() * 3);
    const dye = this.inv.getEffectiveDye(pick === 0 ? 0 : pick === 1 ? 1 : 2)
      ?? this.inv.getEffectiveDye(1);   // LoadoutShare（GetEffectiveDye :5736）
    if (!dye) return -1;
    return viIdFromKey(ITEM_DEFS[dye.id]?.key ?? '') ?? -1;
  }


  get equipStats(): PlayerEquipStats {
    // ★记忆化(2026-08-19 367s trace 剖析:207 个调用点大量逐帧访问,每次现建
    //   200+ 字段对象+遍历装备表 = 0.22% 自耗时 + MajorGC 每 5s 的分配 churn 主源)。
    //   内容哈希键失效(输入清单见 equipStatsKey——★改 computeEquipStats 的输入
    //   必须同步键 + tests/equip-stats-cache.test.ts 六路锁);返回对象冻结
    //   (全仓零改写已审计,冻结把将来误写变成显式 TypeError)
    const key = this.equipStatsKey();
    if (this._equipStatsCache && key === this._equipStatsKey) return this._equipStatsCache;
    this._equipStatsKey = key;
    const stats = this.computeEquipStats();
    Object.freeze(stats);
    Object.freeze(stats.jumpOpts);
    if (stats.wing) Object.freeze(stats.wing);
    this._equipStatsCache = stats;
    return stats;
  }
  private _equipStatsCache: PlayerEquipStats | null = null;
  private _equipStatsKey = '';

  /** equipStats 内容键(输入清单 = computeEquipStats 读到的全部可变状态):
   *  甲/饰品/社交 20 槽 + 染料 10 槽的【id+prefix】(★prefix 是槽条目字段——
   *  2026-08-19 review 实证漏过:重铸换词缀不换 id = 键不变 = Warding→Arcane
   *  数值陈旧,tests/equip-stats 的词缀用例当场红)+ extraAccessory(恶魔心→
   *  第 6 饰品位)+ usedGummyWorm + panicTime>0(受击加速 300t 窗口,布尔)
   *  + buffs.active 键集合(getter 对 buffs 的用法全是存在性判定 has()——
   *  时长到期=键集合变化自然失效)+ 背包 I 档(2026-08-22 信息/机械饰品背包
   *  生效域 :12494-12500——只记 INV_EFFECTIVE_VIDS 命中格,未命中格不影响输出)。
   *  内容键对一切写入方(测试直写槽位/控制台/未来新代码)天然免疫,无事件式
   *  失效可漏。★审计输入时勿只 grep this.*——槽条目对象字段(s.prefix)也是输入! */
  private equipStatsKey(): string {
    const inv = this.inv;
    let k = '';
    // R4-19（1457 P57:13015-13048 属性聚合走 GetEffectiveArmor）：共享段（跨配装
    // 收藏件填空槽）也是聚合输入——键段同步走 effective,否则共享件变更不失效缓存
    for (let i = 0; i < inv.armor.length; i++) {
      const s = inv.getEffectiveArmor(i);
      k += (s?.id ?? 0) + 'p' + (s?.prefix ?? 0) + '.';
    }
    for (let i = 0; i < inv.dye.length; i++) {
      const s = inv.getEffectiveDye(i);
      k += (s?.id ?? 0) + 'p' + (s?.prefix ?? 0) + '.';
    }
    k += inv.extraAccessory ? 'E' : 'e';
    k += this.usedGummyWorm ? 'G' : 'g';
    k += this.panicTime > 0 ? 'P' : 'p';
    // 配饰格可见性开关段（hideVisibleAccessory,Player.cs:1590——UpdateVisibleAccessories
    // :36361 !hide 门进 accDraw 聚合,翻转帧必须失效缓存;只记配饰段 3..accSlotMax）
    for (let i = ACC_ARMOR_START; i < inv.accSlotMax; i++) k += this.hideVisibleAccessory[i] ? 'H' : 'h';
    // 背包生效域段（I 档,信息/机械饰品背包扫描 :12494-12500 的输入）：只记
    // INV_EFFECTIVE_VIDS 命中格（vid+槽位）——未命中格不影响 computeEquipStats
    // 输出,内容键对实际输入仍完备
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      const d = ITEM_DEFS[s.id];
      const vid = d ? (d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1)) : -1;
      if (vid > 0 && INV_EFFECTIVE_VIDS.has(vid)) k += i + ':' + vid + '.';
    }
    // 吸血鬼炽灼三态（computeEquipStats 读 vampireBurningInSunlight/sunScorchCounter：
    // Molten buffImmune[24] 反门 :15883 + 120 档卸翅膀/火箭靴 :28186-28187——翻转帧
    // 必须失效缓存，否则 Molten 玩家点火帧拿着旧免疫把 AddBuff(24) 挡掉）
    k += this.vampireBurningInSunlight
      ? (this.sunScorchCounter >= 120 ? 'S' : 'V') : 'v';
    // 夜/日食相位（月亮石 900 天界石复合门 :14871-14874——昼夜翻转帧必须重算）
    k += this.nightPhase ? 'N' : 'd';
    for (const bt of this.buffs.active.keys()) k += bt + ',';
    return k;
  }

  private computeEquipStats(): PlayerEquipStats {
    // R4-19 裁决（1457 P57:13015-13048 逐行）：属性聚合 k=0..9 全走 GetEffectiveArmor
    // （GrantPrefixBenefits+GrantArmorBenefits）+ m=3..9 ApplyEquipFunctional 同——
    // 【共享件给全部属性】;"防空槽白嫖"由 GetEffectiveArmor 只填空槽 + CanShareArmor
    // （槽型/配件互斥门）承担。本函数全部 armor[] 读点统一走 effArmor。
    const effArmor = (slot: number) => this.inv.getEffectiveArmor(slot);
    /** 当前套装匹配（armor[0-2] 的 hs/bs/ls 槽序号 → ARMOR_SET_BONUSES；通配 `${hs}|${bs}|*` 兜底） */
    function activeArmorSetBonus(self: Player) {
      const st0 = statOfInternal(self.inv.getEffectiveArmor(0)?.id ?? -1);
      const st1 = statOfInternal(self.inv.getEffectiveArmor(1)?.id ?? -1);
      const st2 = statOfInternal(self.inv.getEffectiveArmor(2)?.id ?? -1);
      if (!st0?.hs || st1?.bs === undefined || st2?.ls === undefined) return null;
      return ARMOR_SET_BONUSES[`${st0.hs}|${st1.bs}|${st2.ls}`]
        ?? ARMOR_SET_BONUSES[`${st0.hs}|${st1.bs}|*`] ?? null;
    }
    let def = 0, mana = 0, life = 0;
    let dmgMelee = 0, dmgRanged = 0, dmgMagic = 0;
    let critMelee = 0, critRanged = 0, critMagic = 0;
    let move = 0, meleeSpeed = 0, runSpeed = 0;
    let bootFx: 'hellfire' | 'sail' | 'cold' | 'desert' | 'fairy' | null = null;   // 跑靴尘型（:36285）
    let bootDyeVid = -1;   // cShoe 鞋染料 vid（尘 GetSecondaryShader 着色源）
    let fish = 0;             // fishingSkill（钓具配饰+渔夫甲）
    let setRunAccMul = 1, setMaxRunMul = 1, setRunSlowMul = 1;
    let shieldItem = false;   // 暗影套移动四参数(:26195)
    let setEndurance = 0, solarSet = false;   // 日曜套(:16224-16295)
    let setManaCostMul = 1;   // DD2 散件魔耗乘区(:12770-12775)
    // 魔力回复直值（ApplyEquipFunctional if-chain :14379-14383——魔力斗篷 982 专属）
    let manaRegenBonus = 0, manaRegenDelayBonus = 0;
    let extraFall = 0, lavaMax = 0, armorPen = 0, rocketBoots = 0;
    let autoJump = false, fireWalk = false, noKnockback = false, noFallDmg = false;
    let frostBurn = false; // 冰霜盔甲 46 套装引擎
    let anglerSetSpawnReduction = false;   // Player.anglerSetSpawnReduction（:2672）
    const immuneBuffs = new Set<number>(); // Player.buffImmune（十字章族装备扫描累积）
    let desertBoots = false, waterWalk = false, jumpBoost = false, panic = false, starCloak = false;
    const jumpSet = new Set<string>();
    let wing: { logic: number; slot: number; time: number; accSpeed: number; accelMult: number; hover: boolean; hidden: boolean } | null = null;
    let dash = 0, blackBelt = false, bees = false, carpet = false;
    let jumpSpd = 0, arrowDmg = 0;
    let equipHasQuiver = false;
    let wolfAcc = false, boc = false;
    let moltenQuiver = false;
    let shroomiteType: 'arrow' | 'bullet' | 'rocket' | null = null;
    let shroomiteSet = false, vortexSet = false, nebulaSet = false, beetleOff = false;
    let beetleDef = false;
    let flipper = false, longInvince = false, spikedBoots = false;
    let canFloat = false;   // canFloatInWater（4404 甲件；buff265 在消费侧并集）
    let bobberOverride = -1;   // Player.overrideFishingBobber（:1920 初值 -1；浮漂饰品覆写）
  let killGuide = false, killClothier = false;   // 巫毒娃娃 267/1307(Player.cs UpdateEquips killGuide/killClothier)
  const infoAccs: InfoAccGates = emptyInfoAccGates(); // 信息饰品门禁(RefreshInfoAccs :12198)
    let treasureMagnet = false, goldRing = false, luckyCoin = false, discount = false;
    let ammoSaveHuntress = false, ammoSaveChloro = false, ammoSaveCost80 = false, ammoSaveCost75 = false;
    let kbGlove = false, yoyoString = false, autoReuseGlove = false;
    let meleeScaleGlove = false;   // Player.meleeScaleGlove（:2258）：手套族近战放大 ×1.1
    // 线饰品线色（Player.stringColor）：0=无——UpdateVisibleAccessory 逐槽后写覆盖前写
    //（Player.cs:36441-36449：5540/5541→29 在前、item.stringColor>0 在后，槽序 3-9→13-19）
    let stringColor = 0;
    let magmaStone = false;   // Player.magmaStone（:1850）：近战命中点燃（1322/1343）
    let iceSkate = false;      // Player.iceSkate（:1077 族）：冰面移动修正
    let tileSpeed = false, wallSpeed = false, tileRange = false, skyStone = false, pStone = false;
    let counterWeight = 0, vanityCounterWeight = 0;   // int 物品 id（0=无）
    let yoyoBag = false;   // 悠悠球袋(3366/5541):配重球颜色使用端掷(见类型注释)
    let yoyoGlove = false, magicString = false;
    let autoPaint = false, chiselSpeed = false, toolbelt = false;
    let flowerBoots = false;
    let stepStool = false;
    let manaMagnet = false, magicCuffs = false, manaFlower = false;
    let manaCostMul = 1;
    // 配饰审计 P0 批（2026-08-22）聚合位
    let fishingTackle = false, lavaFishing = false, royalGel = false, fishingLine = false;
    let manaCostOffAcc = 0, toolboxRange = 0, accDmgMinion = 0;
    let mechShowWires = false, autoActuator = false, magiluminescence = false;
    let iceBarrierAcc = false, lavaRose = false;
    let cordage = false;   // 植物纤维绳索宝典 3068（:14461-14463,割藤掉藤绳 2996 效果端）
    let divingHelm = false, merman = false;
    let arcticDivingGear = false, jellyfishGlow = false;
    // ---- 1457 新配饰行为旗（ApplyEquipFunctional case 6166-6189 :14596-14739）----
    let accSentryBackpack = false, accGolemSentryBackpack = false;
    let accHarpyCharm = false, accSeraphNecklace = false, hasPhoenixQuiver = false;
    let accSnappingStone = false, accPyroclast = false, accArmletOfRuin = false;
    let accPoisonBarb = false, accHoneyedBarb = false, catalystBand = false;
    let accSharpBarb = false, mysticSashDodge = false, accTimerCrit = false;
    let shinyStone = false;   // 闪亮石 3337（:14874-14876——regen ×1.1 + 静止整段）
    let ammoCyclerMode = 0;   // PlayerAmmoCyclingMode（PlayerAmmoCyclingMode.cs:None=0/AmmoSlots=1/FullInventory=2/Random=3）
    // ---- 召唤师链聚合位（vanillaSummonStats：ApplyEquipFunctional armor[0-9] 单遍语义 =
    //      盔甲三件 + 配饰各扫一遍 SUMMON_GEAR；套装查 SUMMON_SET）——声明须在配饰
    //      循环前：1457 侦察背包 6175（:14670-14677）在循环内直加 minionDmg ----
    let minionSlots = 0, minionDmg = 0, minionKB = 0, sentrySlots = 0, whipRange = 0;
    // ---- 身上贴图绘制槽 + 仇恨轴（配饰审计系统性批 2026-08-22）----
    let aggroAcc = 0;
    const accDraw = {
      back: 0, front: 0, shield: 0, shoe: 0, waist: 0, neck: 0, face: 0,
      balloon: 0, balloonFront: 0, handOn: 0, handOff: 0, beard: 0,
      backpack: 0, tail: 0,
      dyeBack: -1, dyeFront: -1, dyeShield: -1, dyeShoe: -1, dyeWaist: -1,
      dyeNeck: -1, dyeFace: -1, dyeBalloon: -1, dyeBalloonFront: -1,
      dyeHandOn: -1, dyeHandOff: -1, dyeBeard: -1, dyeBackpack: -1, dyeTail: -1,
    };
    /** 槽 → 族赋值（UpdateVisibleAccessory :36451-36520 后写覆盖语义 + back 披风
     *  清 front :36468-36471；face 槽按 ArmorIDs.Face.Sets 分流 face/mask/flower/
     *  head 四层——本仓单层合并,head 层并入 face（同锚同帧,登记偏差）） */
    const accDrawApply = (s: { id: number }, slotIdx: number): void => {
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      const ds = accDrawSlotsOf(vid);
      if (!ds) return;
      const dyeItem = this.inv.getEffectiveDye(slotIdx % 10);   // UpdateItemDye :9696 走 GetEffectiveDye
      const dyeVid = dyeItem ? (ITEM_DEFS[dyeItem.id]?.vid ?? viIdFromKey(ITEM_DEFS[dyeItem.id]?.key ?? '') ?? -1) : -1;
      if (ds.handOn) { accDraw.handOn = ds.handOn; accDraw.dyeHandOn = dyeVid; }
      if (ds.handOff) { accDraw.handOff = ds.handOff; accDraw.dyeHandOff = dyeVid; }
      if (ds.back) {
        // Back 子层三路由（UpdateVisibleAccessory :36455-36466）：DrawInBackpackLayer
        // → Player.backpack / DrawInTailLayer → Player.tail（两者不占 back 不清 front）/
        // 其余（披风族）→ back + front=-1 互斥清写
        if (BACK_DRAW_IN_BACKPACK.has(ds.back)) { accDraw.backpack = ds.back; accDraw.dyeBackpack = dyeVid; }
        else if (BACK_DRAW_IN_TAIL.has(ds.back)) { accDraw.tail = ds.back; accDraw.dyeTail = dyeVid; }
        else { accDraw.back = ds.back; accDraw.dyeBack = dyeVid; accDraw.front = 0; accDraw.dyeFront = -1; }
      }
      if (ds.front) { accDraw.front = ds.front; accDraw.dyeFront = dyeVid; }
      if (ds.shoe) { accDraw.shoe = ds.shoe; accDraw.dyeShoe = dyeVid; }
      if (ds.waist) { accDraw.waist = ds.waist; accDraw.dyeWaist = dyeVid; }
      if (ds.shield) { accDraw.shield = ds.shield; accDraw.dyeShield = dyeVid; }
      if (ds.neck) { accDraw.neck = ds.neck; accDraw.dyeNeck = dyeVid; }
      if (ds.face) {
        // face 四层路由（underHair 5/mask 22/flower 1,6,8,9/head 12,10,13,11——
        // ArmorIDs.cs:2143-2150）在本仓单层身体模型下同锚同帧合并画一层;
        // 层序差异（mask 压头盔/underHair 压发）登记未建模
        accDraw.face = ds.face;
        accDraw.dyeFace = dyeVid;
      }
      if (ds.beard) { accDraw.beard = ds.beard; accDraw.dyeBeard = dyeVid; }
      if (ds.balloon) {
        // DrawInFrontOfBackArmLayer（ArmorIDs.cs:2213={18}）→ balloonFront,余 → balloon
        if (BALLOON_TORSO_FRAMING.has(ds.balloon)) { accDraw.balloonFront = ds.balloon; accDraw.dyeBalloonFront = dyeVid; }
        else { accDraw.balloon = ds.balloon; accDraw.dyeBalloon = dyeVid; }
      }
    };
    // 仇恨轴（ApplyEquipFunctional case 内 aggro ±400 直赋——功能槽 only,
    // 社交槽 ApplyEquipVanity 无 aggro）
    const AGGRO_NEG = new Set([3015, 3991, 4005, 4006, 6175]);   // 6175 侦察哨兵背包（★1457 :14670-14677 aggro-=400;V6 复核补）
    const AGGRO_POS = new Set([3016, 3992, 3998]);
    for (let i = ACC_ARMOR_START; i < this.inv.accSlotMax; i++) {
      const s = effArmor(i);   // R4-19：功能配饰聚合走 GetEffectiveArmor（:13044-13048）
      if (!s) continue;
      const fx = accFxOfInternal(s.id);
      // 巫毒娃娃(Player.cs:8801 killGuide / :8804 killClothier):装备即置位——
      // 玩家弹幕/近战对向导(22)/裁缝师(54) 的伤害门(Projectile.cs:11970-11972)
      const accVid = viIdFromKey(ITEM_DEFS[s.id]?.key ?? '');
      // 身上贴图绘制槽（UpdateVisibleAccessories :36331-36351 功能槽轮 + !hide 门
      // :36361——per-slot 隐藏开关已建模（hideVisibleAccessory,眼睛图标只藏贴图,
      // 功能效果 ApplyEquipFunctional :13962 独立扫不受影响）;社交槽 13-19 轮在
      // 下方独立 for,原版无 hide 门）
      if (accVid > 0 && !this.hideVisibleAccessory[i]) accDrawApply(s, i);
      // 仇恨轴（aggro ±400 七件,见 PlayerEquipStats.aggroAcc 注）
      if (AGGRO_NEG.has(accVid)) aggroAcc -= 400;
      else if (AGGRO_POS.has(accVid)) aggroAcc += 400;
      if (accVid === 4404) canFloat = true;   // 水上漂靴（ApplyEquipFunctional :12842-12846）
      if (accVid === 3068) cordage = true;   // 绳索宝典（UpdateEquips :14461-14463 currentItem.type==3068 → cordage=true）
      if (accVid === 4341 || accVid === 5126) stepStool = true;   // 折叠凳/造物之手（:14077-14080，Player 侧 SetStats 非物品字段）
      // 月亮石 900（:14871-14874）：夜/日食档才授天界石复合（太阳石 899 的白天门
      // :14868-14870 本仓未建模——899 恒开为既有偏差，审计 ✅ 行，登记不并）
      if (accVid === 900 && this.nightPhase) skyStone = true;
      if (accVid === 267) killGuide = true;
      else if (accVid === 1307) killClothier = true;
      // 浮漂饰品 5139-5146（Player.cs:14121-14124 accFishingBobber → fishingSkill+10
      // :12552-12554；UpdateFishingBobber :36244-36272 → overrideFishingBobber=986+(vid-5139)）
      if (accVid >= 5139 && accVid <= 5146) {
        fish += 10;
        bobberOverride = Math.max(bobberOverride, 986 + (accVid - 5139));
      }
      // 十字章免疫族（Player.cs:14911-15003 buffImmune 逐件赋值——vanilla buff id）
      const immune = IMMUNE_ACC[accVid];
      if (immune) immune.forEach((b) => immuneBuffs.add(b));
      // 信息饰品门禁(Player.cs:12486 UpdateEquips→RefreshInfoAccsFromItemType)
      if (accVid > 0) refreshInfoAccsFromItemType(infoAccs, accVid);
      // 翅膀（Item.wingSlot>0 → WingStatsInitializer 全字段；多翅膀【后槽胜出】——
      // 原版 :12578-12586 for n=3..10 循环内直赋 wings/wingsLogic,后写覆盖前写;
      // 曾 `!wing` 先到先得 = 槽序反向偏差,2026-08-22 审计系统性批修）
      const wingSlot = statOfInternal(s.id)?.wing;
      if (wingSlot && wingSlot > 0) {
        const ws = wingStatOf(wingSlot);
        // 隐藏翼门（UpdateEquips :12577-12586）：!hideVisibleAccessory[n] 才写
        // wings（视觉）,wingsLogic 恒写;隐藏翼不覆盖前槽可见翼（gate 败=保持旧值）。
        // hidden 随翼记录,渲染侧补 vy≠0 且未骑坐骑的显形特例（:12580 vy 项不入
        // 记忆化键,只能在消费侧判）
        const wingHidden = this.hideVisibleAccessory[i] ?? false;
        if (!wingHidden || !wing) {
          wing = { logic: wingSlot, slot: wingSlot, time: ws.time, accSpeed: ws.accSpeed, accelMult: ws.accelMult, hover: ws.hover, hidden: wingHidden };
        }
      }
      // 悠悠球线（Item.stringColor>0 → yoyoString，Player.cs:14170）
      if (statOfInternal(s.id)?.str) yoyoString = true;
      // 线色（Player.cs:36441-36449 UpdateVisibleAccessory）：魔法线 5540/5541 → 29
      //（无 item.stringColor 字段），其余线饰品 → 其 str；同帧逐槽后写覆盖前写
      if (accVid === 5540 || accVid === 5541) stringColor = 29;
      const funcStr = statOfInternal(s.id)?.str;
      if ((funcStr ?? 0) > 0) stringColor = funcStr!;
      // ---- 悠悠球袋族（Player.cs:14174-14226 ApplyEquipFunctional if-chain；提取器
      //      default 区间段抓不到，此处 vid 直表）。★配重球掷骰(1/7→1079 黑/
      //      556+Next(6) 彩,:14176/:14200)2026-08-19 迁消费端 rollYoyoCounterweight:
      //      原版 ResetEffects 每帧清零重掷 = 使用期随机;getter 记忆化会把它冻结成
      //      "每套装备一次",故此处只标 yoyoBag 旗,Counterweight 命中时掷 ----
      if (accVid === 3366) {   // 悠悠球袋（:14174-14189）
        yoyoBag = true;
        yoyoGlove = true;
        yoyoString = true;
      }
      if (accVid === 5540) magicString = true;   // 魔法线（:14195-14197）
      if (accVid === 5541) {   // 魔法悠悠球袋（:14199-14214 段：袋旗同 3366 + 全套旗）
        yoyoBag = true;
        yoyoGlove = true;
        yoyoString = true;
        magicString = true;
      }
      if (accVid === 5547) counterWeight = 1079;              // 黑配重球（:14215-14218）
      if (accVid >= 3309 && accVid <= 3314) counterWeight = 556 + accVid - 3309;  // 彩色配重球（:14219-14222）
      if (accVid === 3334) yoyoGlove = true;                  // 悠悠球手套（:14223-14226）
      // ---- 1457 新配饰行为旗（ApplyEquipFunctional case 6166-6189 :14596-14739;
      //      数值主属性走下方 accfx/SUMMON_GEAR 链,此处只收行为布尔/模式）----
      //  消费端落点（蓝队 R2-14 勘误：下四项曾标"登记未接",实均已接）：
      //  · accHarpyCharm 6166/6180/6181——弧线引矢三段已接（Arrow.ts harpyCharmEffect
      //    :2703 扫 arrow 弹改向 + 冷却 90t/6180 ×0.8=72）
      //  · accSnappingStone 6167——远程命中触发已接（Arrow.ts 命中环 trySnapStrike
      //    kind0;脉冲本体 stats/SnapStrike）
      //  · ammoCyclerMode 6168-6194——弹药轮换本体已接（Player.ts pickAmmoSlot +
      //    noteAmmoCycledShot :1940-1955,PickAmmo_IterateRange :54330-54389）
      //  · accTimerCrit 6170——时间蓄能暴击已接（Game.ts 近战命中 tryConsumingTimerCrit）
      //  仍登记未接：
      //  · accSentryBackpack 6172/6175/6176/6177——哨兵携带（SetAsSelectedSentryBackpackTarget
      //    Projectile.cs:37818/:37998 + AI_Sentries_HeavySlingReposition :37822/:31969）
      //    未接,旗+6176 暴击生效
      if (accVid === 3337) shinyStone = true;                                      // 闪亮石（:14874-14876）
      else if (accVid === 6166) { accHarpyCharm = true; critRanged += 5; }         // 鹰妖护符（:14596-14599）
      else if (accVid === 4002) moltenQuiver = true;                               // 熔火箭袋（:14049-14052 hasMoltenQuiver——
                                                                                   //   accfx 表缺标 moltenQuiver 旗,此处补：
                                                                                   //   木箭→火矢 +2 伤 PickAmmo :52702-52705）
      else if (accVid === 6167) accSnappingStone = true;                           // 拍击石（:14600-14602）
      else if (accVid === 6170) accTimerCrit = true;                               // 计时暴击（:14603-14605,登记未接）
      else if (accVid === 6160) { accSharpBarb = true; critRanged += 8; }          // 锐刺（:14606-14608 rangedCrit+8 :13062-13066）
      else if (accVid === 6165) accPoisonBarb = true;                              // 毒刺（:14609-14611）
      else if (accVid === 6168) { ammoCyclerMode = 1; dmgRanged += 0.08; }         // 弹药循环·四格（:14634-14637）
      else if (accVid === 6169) { ammoCyclerMode = 2; dmgRanged += 0.08; }         // 弹药循环·全背包（:14638-14641）
      else if (accVid === 6193) { ammoCyclerMode = 3; dmgRanged += 0.08; }         // 弹药循环·随机（:14642-14645）
      else if (accVid === 6194) { ammoCyclerMode = 0; dmgRanged += 0.08; }         // 弹药循环·禁用（:14646-14648）
      //  ^ 四件共 accAmmoCyclerDamage → rangedDamage += 0.08（:13054-13057 UpdateEquips 段）
      else if (accVid === 6172) accSentryBackpack = true;                          // 重携哨兵背包（:14612-14614）
      else if (accVid === 6175) {                                                  // 侦察背包（:14670-14677）
        accSentryBackpack = true;
        dmgMelee += 0.05; dmgMagic += 0.05; dmgRanged += 0.05; minionDmg += 0.05;  //   四系伤+5%（:14673-14676;aggro-400 仇恨轴登记未接）
      } else if (accVid === 6176) {                                                // 圣殿骑士背包（:14678-14681）
        accSentryBackpack = true;
        accGolemSentryBackpack = true;                                             //   sentry/SentryShot 10% 强制暴击（:12963-12967）
      } else if (accVid === 6177) { accSentryBackpack = true; noKnockback = true; } // 皇家卫队背带（:14682-14685）
      else if (accVid === 6178) { magmaStone = true; accPyroclast = true; }        // 焰爆石（:14686-14689）
      else if (accVid === 6179) accArmletOfRuin = true;                            // 毁灭臂镯（:14690-14693;6159 旗走 SUMMON_GEAR）
      else if (accVid === 6180) {                                                  // 炽天使项链（:14694-14698）
        accHarpyCharm = true; longInvince = true; accSeraphNecklace = true;
      } else if (accVid === 6181) {                                                // 凤凰箭袋（:14699-14704）
        accHarpyCharm = true; hasPhoenixQuiver = true; moltenQuiver = true;
        equipHasQuiver = true; arrowDmg += 0.1;
      } else if (accVid === 6182) {                                                // 邪恶之爪（:14705-14710）
        autoReuseGlove = true; meleeSpeed += 0.12;
      } else if (accVid === 6183) { noKnockback = true; fireWalk = true; }         // 白银之盾（:14711-14715;6156 旗走 SUMMON_GEAR）
      else if (accVid === 6184) { accPoisonBarb = true; accHoneyedBarb = true; bees = true; } // 蜜刺（:14716-14719 honeyCombItem→bees 受击放蜂）
      else if (accVid === 6185) { accPoisonBarb = true; pStone = true; catalystBand = true; } // 催化指环（:14720-14725）
      else if (accVid === 6186) { starCloak = true; }                              // 德鲁伊蛇斗篷（:14726-14729;6157 旗走 SUMMON_GEAR）
      else if (accVid === 6187) { panic = true; longInvince = true; }              // 十字心项链（:14730-14733）
      else if (accVid === 6188) noKnockback = true;                                // 复原之盾（:14734-14736;1457 case 只置 noKnockback——缓回+法40 走 vanilla-accfx.json '6188' mana40/regen60,已生效）
      else if (accVid === 6189) mysticSashDodge = true;                            // 神秘艺术腰布（:14737-14739）
      // 生命回复优先取 Item.lifeRegen 字段（再生手环族，GrantArmorBenefits :12700），
      // accfx.life 为 if-chain 段的 lifeRegen += N
      const itemLife = statOfInternal(s.id)?.life ?? 0;
      if (itemLife) life += itemLife;
      if (fx) {
        if (fx.def) def += fx.def;
        if (fx.mana) mana += fx.mana;
        if (fx.life) life += fx.life;
        if (fx.move) move += fx.move;
        if (fx.fish) fish += fx.fish;
        if (fx.shield) shieldItem = true;   // 钓具族+渔夫甲 fishingSkill（:12549-12556/:14115-14140/:13022-13027）
        if (fx.meleeSpd) meleeSpeed += fx.meleeSpd;
        if (fx.runSpeed) {
          runSpeed = Math.max(runSpeed, fx.runSpeed);
          // 跑靴奔跑尘型（SpawnFastRunParticles :36285-36320 switch——按装备 vid 授予；
          // 后装覆盖先装，原版 CancelAllBootRunVisualEffects 语义）
          const vidDef = ITEM_DEFS[s.id];
          const vid = vidDef ? (vidDef.vid ?? viIdFromKey(vidDef.key)) : -1;
          bootFx = vid === 4874 ? 'hellfire'
            : vid === 3200 || vid === 3990 ? 'sail'
            : vid === 1579 ? 'cold'
            : vid === 4055 ? 'desert'
            : vid === 3993 ? 'fairy' : null;
          // 跑靴染料（cShoe :9355-9369：shoeSlot 装备所在槽的 dye → GetSecondaryShader）
          const dyeS = this.inv.dye[i % 10];
          bootDyeVid = dyeS ? (ITEM_DEFS[dyeS.id]?.vid ?? viIdFromKey(ITEM_DEFS[dyeS.id]?.key ?? '')) : -1;
        }
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
        // jumpSpeedBoost 叠加语义（Player.jumpSpeedBoost float 累加字段 :2590,
        // ResetEffects :18605 清零后逐件 += 1.6：2423 :14250 / 3990 :13986 /
        // 3994-3996 :14011-14024——蛙腿+两栖靴同戴 = +3.2。曾 Math.max 取单件）
        if (fx.jumpSpd) jumpSpd += fx.jumpSpd;
        if (fx.arrowDmg) arrowDmg += fx.arrowDmg; // 箭袋 +0.1（仅箭吃，见 rangedDamageMult）
        if (fx.nightWolf) wolfAcc = true;
        if (fx.quiver) equipHasQuiver = true;
        if (fx.moltenQuiver) moltenQuiver = true;
        if (fx.brainOfConfusion) boc = true;
        if (fx.flipper) flipper = true;
        if (fx.longInvince) longInvince = true;
        if (fx.spikedBoots) spikedBoots = true;
        if (fx.treasureMagnet) treasureMagnet = true;
        if (fx.goldRing) goldRing = true;
        if (fx.luckyCoin) luckyCoin = true;
        if (fx.discount) discount = true;
        if (fx.ammoSave) ammoSaveCost80 = true;       // ammoCost80 1/5（:52799）
        if (fx.huntressSave) ammoSaveHuntress = true; // huntressAmmoCost90 1/10（:52791）
        if (fx.kbGlove) kbGlove = true;
        if (fx.autoReuseGlove) autoReuseGlove = true;   // 力量手套族：近战自动连挥
        if (fx.meleeScaleGlove) meleeScaleGlove = true;   // 手套族近战放大（:14754 等 5 件）
        if (fx.yoyoString) yoyoString = true;
        if (fx.magmaStone) magmaStone = true;   // 岩浆石 1322/火焰护手 1343（:14764/:14787-14790）
        if (fx.iceSkate) iceSkate = true;       // 冰刀族（:14542/:14703/:14843/:14846）
        if (fx.tileSpeed) tileSpeed = true;
        if (fx.wallSpeed) wallSpeed = true;
        if (fx.tileRange) tileRange = true;
        if (fx.autoPaint) autoPaint = true;      // 喷漆器族（:14720/:14726-14734）
        if (fx.chiselSpeed) chiselSpeed = true;  // 古凿/创造之手（:12610-12612/:13981）
        if (fx.toolbelt) toolbelt = true;        // 工具腰带 407（:14873 blockRange++）
        if (fx.skyStone) skyStone = true;
        if (fx.pStone) pStone = true;
        if (fx.flowerBoots) flowerBoots = true;   // 花靴/仙灵靴（:12688）
        if (fx.manaMagnet) manaMagnet = true;
        if (fx.magicCuffs) magicCuffs = true;
        if (fx.manaFlower) {
          manaFlower = true;
          // 1457: 法力花增强（ApplyEquipFunctional case 3991 :14511-14516）——
          // 新增 magicCrit += 5 / magicDamage += 0.05（manaCost -0.08 迁至
          // UpdateEquips if(manaFlower) :13058-13062，本仓 Game 侧 ×0.92 已等价）。
          // ★仅 3991 裸法力花有此两项：4000/4001(:14561-14569)与 555(:15706-15709)
          // 只置 manaFlower 旗，不吃增强
          if (accVid === 3991) { critMagic += 5; dmgMagic += 0.05; }
        }
        if (fx.manaRegenBonus) manaRegenBonus += fx.manaRegenBonus;           // 魔力斗篷 982（:14383）
        // 1458 已删 982/6188/6189 的 delayBonus++（:15044）,数据面 vanilla-accfx 三键已清——
        // 此消费行恒 0,保留仅为 equipStats 字段完整性
        if (fx.manaRegenDelayBonus) manaRegenDelayBonus += fx.manaRegenDelayBonus;
        // ---- 配饰审计 P0 批（2026-08-22）消费 ----
        if (fx.fishingTackle) fishingTackle = true;   // 钓具箱族 2375/3721/5064（:14123-14140）
        if (fx.fishingLine) fishingLine = true;       // 高测钓线族 2373/3721/5064（R14-E6）
        if (fx.lavaFishing) lavaFishing = true;       // 防熔钓族 4881/5064（:14127-14140）
        if (fx.dmgMinion) accDmgMinion += fx.dmgMinion;   // 召唤伤 935/1301/3015（:14900/:14431/:14105）
        if (fx.endurance) setEndurance += fx.endurance;   // 蠕虫围巾 3224（:14532-14535）
        if (fx.manaCostOff) manaCostOffAcc += fx.manaCostOff; // 大自然的恩赐 223（:14561-14563）
        if (fx.royalGel) royalGel = true;             // 皇家凝胶 3090（:14144-14168）
        if (fx.toolboxRange) toolboxRange += fx.toolboxRange;  // 工具箱 1923（:14405-14408）
        if (fx.mechShowWires) mechShowWires = true;   // 机械透镜 3619（:12400-12402）
        if (fx.autoActuator) autoActuator = true;     // 加压器 3624（:14746-14748）
        if (fx.magiluminescence) magiluminescence = true;  // 荧光体 5107（:14087-14093）
        if (fx.iceBarrier) iceBarrierAcc = true;      // 冰冻护盾族 1253/3997（:14348-14351）
        if (fx.lavaRose) lavaRose = true;             // 玫瑰族 1323/908/4003/4004/5000（:27384-27387）
        // （fx.counterWeight 已并入上方悠悠球袋族 vid 直表——5547 是唯一 accfx 条目，
        //  原版语义是 int 1079 非 bool，此处不再消费表字段）
        if (fx.divingHelm) divingHelm = true;   // 394/1860/1861 潜水装备族
        if (fx.merman) merman = true;           // 497/861/3110 贝壳族
        if (fx.arcticDivingGear) arcticDivingGear = true; // 1861
        if (fx.jellyfishGlow) jellyfishGlow = true;      // 1860
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
    // 时装配饰槽 13-19 的线色（Player.cs:36361-36372 UpdateVisibleAccessories 第二轮：
    // 社交槽无条件走 UpdateVisibleAccessory——时装线饰品同样染线；yoyoString 不在此轮，
    // ApplyEquipFunctional 只扫功能槽）。★per-slot 隐藏定谳（2026-08-23）：社交槽
    // 原版【无】hideVisibleAccessory 门（:36368-36375 第二轮无条件;Main.cs:40855
    // 眼睛图标只挂 num40>2 功能配饰段）——"虚荣槽 13-19 可隐藏"与原版不符,
    // 审计登记项回写备案,本仓同原版不设门。
    for (let i = 13; i < 20; i++) {
      const s = effArmor(i);   // ApplyEquipVanity :13108-13112 同走 GetEffectiveArmor
      if (!s) continue;
      const v = ITEM_DEFS[s.id];
      const vid = v?.vid ?? (v?.key?.startsWith('vi_') ? parseInt(v.key.slice(3), 10) : -1);
      if (vid === 5540 || vid === 5541) stringColor = 29;
      const sc = statOfInternal(s.id)?.str;
      if ((sc ?? 0) > 0) stringColor = sc!;
      // 虚荣配重球（ApplyEquipVanity :13800-13803，社交槽 13-19 彩色配重球 →
      // vanityCounterWeight；Counterweight() 消费端优先于功能槽 counterWeight :11991-11994）
      if (vid >= 3309 && vid <= 3314) vanityCounterWeight = 556 + vid - 3309;
      // 社交槽身上贴图（UpdateVisibleAccessories :36353-36361 第二轮：
      // UpdateVisibleAccessory 无 !hide 门,时装配饰贴图无条件生效,后写覆盖功能槽）
      if (vid > 0) accDrawApply(s, i);
    }
    // ---- 信息/机械饰品背包生效域（配饰审计系统性批 2026-08-22）----
    // UpdateEquips :12494-12500：for j=0..57 inventory 全格扫
    // RefreshInfoAccsFromItemType + RefreshMechanicalAccsFromItemType——信息族
    // （表/罗盘/深度计/渔夫族/PDA/手机/REK3000 3124…）与机械族（机械透镜 3619/
    // 加压器 3624/喷漆器 2216/建筑师包 3061/造物之手 5126）【放背包即生效】,
    // 对这两类豁免穿戴槽位要求;其余饰品仍走上方配饰槽循环。equipStatsKey 的
    // 背包段（下方 key I 档）保证放取失效重算
    for (let j = 0; j < this.inv.slots.length; j++) {
      const s = this.inv.slots[j];
      if (!s) continue;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (vid <= 0) continue;
      refreshInfoAccsFromItemType(infoAccs, vid);
      // RefreshMechanicalAccsFromItemType（Player.cs:12397-12430）本仓已建模三旗;
      // rulerLine 486/rulerGrid 2799·3611/preventAllItemPickups 4346/
      // dontHurtCritters 4767·5323/dontHurtNature 5309·5323/hasLucyTheAxe 5095
      // 无消费端登记不接
      if (vid === 3619) mechShowWires = true;
      else if (vid === 3624) autoActuator = true;
      else if (vid === 2216 || vid === 3061 || vid === 5126) autoPaint = true;
    }
    // 恐慌项链受击加速窗口（PanicSpeedBoost :25034：panicTime 300 tick 内 moveSpeed +0.5）
    if (this.panicTime > 0) move += 1.0;   // PanicSpeedBoost（:25034 满档 +1.0=+100%;旧 +0.5 是 1.4.0 旧值,2026-08-13 修）
    // moveMult 只含 moveSpeed 加成（原版 accRunSpeed 不随 moveSpeed 缩放——靴族
    // 冲刺走【慢爬坡段】到 6/6.75,旧折算 runSpeed/3-1 把 sprint 当移速乘区致
    // Flurry 装备即 +1.0 移速上限,2026-08-13 拆除;accRunSpeed 单独经 equipStats）
    const moveMult = 1 + move;
    // 多段跳按原版消费优先序排列（JumpMovement :20875-20922 else-if 链）：
    // 坐骑族 Basilisk>WallOfFleshGoat>Santank>Unicorn 在前（:20875-20893）,瓶族
    // Sandstorm>Blizzard>Fart>Sail>Cloud（:20899-20922,Cloud 兜底）。
    // ★数据键只有 Cloud/Sandstorm/Blizzard/Fart/Sail（vanilla-accfx.json）——
    // 'Tsunami' 键不存在（航行瓶=Sail,TsunamiInABottle 数据键即 Sail）,R5-F9 已删
    const JUMP_ORDER = ['Basilisk', 'WallOfFleshGoat', 'Santank', 'Unicorn', 'Sandstorm', 'Blizzard', 'Fart', 'Sail', 'Cloud'];
    const jumpOpts = JUMP_ORDER.filter((j) => jumpSet.has(j));
    // （召唤师链 minionSlots/minionDmg/... 声明已上移至配饰循环前——6175 循环内直加）
    minionDmg += accDmgMinion;   // accfx dmgMinion 通道（935/1301/3015 :14900/:14431/:14105）
    // 1457 鞭 tag 栈族（Player.maxTagEffects/tagEffectDuration/accSnakeBand :1187-1199）
    let maxTagEffects = 1, tagEffectDuration = 1, accSnakeBand = false, accWickedArmlet = false;
    // 原版 ApplyEquipFunctional armor[0-9] 单遍 = 盔甲三件 + 配饰各扫（SummonFx 同表直查）
    const sumFx = (s: { id: number } | null): void => {
      if (!s) return;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      const fx = vid >= 0 ? SUMMON_GEAR[vid] : undefined;
      if (!fx) return;
      if (fx.dd2) {
        // dd2Accessory 布尔（Player.cs:12571-12575）：四件全戴只计一次 +1哨兵/+10%召唤伤
        if (!seenDd2) { seenDd2 = true; sentrySlots += 1; minionDmg += 0.10; }
        return;
      }
      if (fx.slot) minionSlots += fx.slot;
      if (fx.sentry) sentrySlots += fx.sentry;
      if (fx.dmg) minionDmg += fx.dmg;
      if (fx.kb) minionKB += fx.kb;
      if (fx.whipRange) whipRange += fx.whipRange;
      // 1457 鞭 tag 栈族（:13068-13083 if-chain 数值段）
      if (fx.tagDur) tagEffectDuration += fx.tagDur;
      if (fx.maxTag) maxTagEffects += fx.maxTag;
      if (fx.snakeBand) accSnakeBand = true;
      if (fx.wickedArmlet) accWickedArmlet = true;
    };
    let seenDd2 = false;
    for (let i = 0; i < 3; i++) sumFx(effArmor(i));   // R4-19：GrantArmorBenefits k=0..9
    // GrantArmorBenefits 盔甲三件扫描（Player.cs:12826-12831）：armor 268 潜水头盔 → accDivingHelm
    for (let i = 0; i < 3; i++) {
      const s = effArmor(i);
      if (s && accFxOfInternal(s.id)?.divingHelm) divingHelm = true;
    }
    // 套装/头盔 type 检测（vid 直查）：蘑菇矿头 1546箭/1547弹/1548火箭（:13274-13288）
    const aVid = (i: number): number => {
      const d = ITEM_DEFS[effArmor(i)?.id ?? -1];
      return d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    };
    const [hVid, bVid, lVid] = [aVid(0), aVid(1), aVid(2)];
    if (hVid === 1546) shroomiteType = 'arrow';
    else if (hVid === 1547) shroomiteType = 'bullet';
    else if (hVid === 1548) shroomiteType = 'rocket';
    shroomiteSet = (hVid >= 1546 && hVid <= 1548) && bVid === 1549 && lVid === 1550;
    vortexSet = hVid === 2757 && bVid === 2758 && lVid === 2759;
    nebulaSet = hVid === 2760 && bVid === 2761 && lVid === 2762;
    beetleOff = hVid === 2199 && bVid === 2200 && lVid === 2202; // 进攻甲
    beetleDef = hVid === 2199 && bVid === 2201 && lVid === 2202; // 防御甲（壳：beetleEndurance 15%/球）
    for (let i = ACC_ARMOR_START; i < this.inv.accSlotMax; i++) sumFx(effArmor(i));   // R4-19
    // 盔甲套装加成（vanillaArmorSets.ts：槽序号三键匹配）
    // DD2 盔甲散件主属性（DD2_PIECE_FX——Player.cs:12709-12810 胸/腿件逐件扫描,2026-08-13）
    for (let _i = 0; _i < 3; _i++) {
      const _fx = DD2_PIECE_FX[hVid + bVid + lVid]; void _fx;
      break;
    }
    const dd2Vids = [hVid, bVid, lVid];
    for (const _v of dd2Vids) {
      const _d = DD2_PIECE_FX[_v];
      if (!_d) continue;
      if (_d.dmgMagic) dmgMagic += _d.dmgMagic;
      if (_d.dmgMinion) minionDmg += _d.dmgMinion;
      if (_d.critMagic) critMagic += _d.critMagic;
      if (_d.critMelee) critMelee += _d.critMelee;
      if (_d.critRanged) critRanged += _d.critRanged;
      if (_d.move) move += _d.move;
      if (_d.meleeSpd) meleeSpeed += _d.meleeSpd;
      if (_d.manaCostMul) setManaCostMul *= _d.manaCostMul;
      if (_d.ammoCost80) ammoSaveCost80 = true;
      if (_d.huntressAmmoCost90) ammoSaveHuntress = true;
    }
    // ---- 盔甲单件省弹门（Player.cs ApplyEquipFunctional armorPiece.type if-chain +
    //      :12709 switch 逐件 1:1——提取器 accfx 表漏标 2758/1002 档位键，此处手读直表）：
    //  星旋胸 2758 → ammoCost75=1/4（:13484）；叶绿头 1002 → chloroAmmoCost80=1/5
    //  （:13224）；蘑菇矿胸 1549 → ammoCost80=1/5（:13289，accfx 已标 ammoSave 同值）；
    //  水晶忍者胸 4983 → huntressAmmoCost90=1/10（:13206）；女猎手护甲 3804 →
    //  huntressAmmoCost90=1/10（:12754）；女猎手旧衬衫 3878 → ammoCost80=1/5（:12797）。
    //  ★2758/3804 的 accfx dmg/crit 主属性走 vanilla-accfx（配饰循环不含盔甲三件，
    //  由 DD2_PIECE_FX/本表承载——已核对原版数值一致）----
    // ★1457 叶绿素套水晶叶三修（OnHit :6986-7036,1456 :6615-6640）——叶绿素套
    //  SetBonus 的水晶叶追踪弹（226 剑气→227 花瓣）三处门：①目标须 CanBeChasedBy
    //  （:6991-6996,1456 无）②226 弹 !active 即跳过（:7000,1456 无 active 检）③
    //  新增 1200px 距离上限（:7007,1456 无半径门,首个 226 即触发）。本仓叶绿素套
    //  SetBonus（水晶叶弹）未移植（仅头盔单件省弹 1/5 在上表）→ 三修无宿主。备案：
    //  移植水晶叶套弹时按 1457 三门落地。
    const ARMOR_AMMO_SAVE_VID: Record<number, 'huntress' | 'chloro' | 'cost80' | 'cost75'> = {
      2758: 'cost75', 1002: 'chloro', 1549: 'cost80', 4983: 'huntress', 3804: 'huntress', 3878: 'cost80',
    };
    for (const v of [hVid, bVid, lVid]) {
      const tier = ARMOR_AMMO_SAVE_VID[v];
      if (tier === 'huntress') ammoSaveHuntress = true;
      else if (tier === 'chloro') ammoSaveChloro = true;
      else if (tier === 'cost80') ammoSaveCost80 = true;
      else if (tier === 'cost75') ammoSaveCost75 = true;
    }
    // 渔夫套/升级渔夫套单件 fishingSkill +5（ApplyEquipFunctional :13549-13552：
    // 2367/2368/2369 + 5591/5592/5593 各 +5,三件套共 +15）——R14-E9 补（此前整套少 15 渔力）
    for (const v of [hVid, bVid, lVid]) {
      if (v === 2367 || v === 2368 || v === 2369 || v === 5591 || v === 5592 || v === 5593) fish += 5;
    }
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
      if (sb.runAccMul) setRunAccMul = sb.runAccMul;      // 暗影套 :26195-26201
      if (sb.maxRunMul) setMaxRunMul = sb.maxRunMul;
      if (sb.runSlowMul) setRunSlowMul = sb.runSlowMul;
      if (sb.endurance) setEndurance += sb.endurance;   // 日曜套 :16224
      if (sb.solar) solarSet = true;
      if (sb.dashType) dash = Math.max(dash, sb.dashType);   // 日曜套 :16288-16294（dash 与 accfx 同聚合链）
      if (sb.fireWalk) fireWalk = true;
      // Molten 套 buffImmune[24] 门（Player.cs:15883 UpdateArmorSetsOld：裸 Molten
      // 三件套免疫 On Fire!——★阳光炽灼中不免疫，:15882 vampireBurningInSunlight 反门）
      if (sb.name === 'Molten' && !this.vampireBurningInSunlight) immuneBuffs.add(24);
      if (sb.frostBurn) frostBurn = true; // 冰霜套引擎(:93712)
      if (sb.anglerSet) anglerSetSpawnReduction = true;   // 渔夫套生成环（NPC.cs:627-630）
      if (sb.ammoCost80) ammoSaveCost80 = true;
      if (sb.manaCostMul !== undefined) manaCostMul = sb.manaCostMul;
    manaCostMul *= setManaCostMul;   // DD2 散件魔耗乘区并入(2026-08-13)
    }
    // 女猎手 T2/T3 套装旗标（setHuntressT2,Player.cs:16119/:16149——爆炸机关弹
    // 694-696 的 Oiled 门,StatusNPC :10786;由 MinionProj 经 ctx 传入 applyProjStatus）
    let huntressT2 = false;
    // 召唤系套装（SUMMON_SET 槽序键；散件效果已在上扫，此处只叠套装层）
    const summonSet = (() => {
      const st0 = statOfInternal(effArmor(0)?.id ?? -1);
      const st1 = statOfInternal(effArmor(1)?.id ?? -1);
      const st2 = statOfInternal(effArmor(2)?.id ?? -1);
      if (!st0?.hs || st1?.bs === undefined || st2?.ls === undefined) return null;
      const s = SUMMON_SET[`${st0.hs}|${st1.bs}|${st2.ls}`] ?? SUMMON_SET[`${st0.hs}|${st1.bs}|*`];
      if (!s) return null;
      if (s.slot) minionSlots += s.slot;
      if (s.sentry) sentrySlots += s.sentry;
      if (s.dmg) minionDmg += s.dmg;
      if (s.whipRange) whipRange += s.whipRange;
      if (s.huntressT2) huntressT2 = true;
      return s;
    })();
    // 天界石族复合（Player.cs:12558-12570：life+2/def+4/近战速+10%/全系伤+10%/全系暴+2%）
    if (skyStone) {
      life += 2; def += 4; meleeSpeed += 0.1;
      dmgMelee += 0.1; dmgRanged += 0.1; dmgMagic += 0.1;
      critMelee += 2; critRanged += 2; critMagic += 2;
    }
    // buffImmune 刷新（Player.cs:14911-15003 装备段 + :9576-9578 黑曜石皮 buff 段；
    // buff 103 Wet 的 buffImmune[24]/[323]/[67] 见 UpdateBuffs :11342-11346——水行族
    // 授予三段火免疫）。★必须在下方 return 之前执行（曾位于 return 之后成死代码，
    // 黑曜石皮/Wet 免疫全灭）。空集路径 O(1) 清零
    const immuneDirty = immuneBuffs.size > 0
      || this.buffs.immuneVanilla.size > 0
      || this.buffs.has(BuffType.ObsidianSkin)
      || this.buffs.has(BuffType.Wet)
      // Molten 套 24 免疫（Player.cs:15883）——炽灼翻转时也要失效重建（key 的 V 档）
      || (sb?.name === 'Molten');
    if (immuneDirty) {
      this.buffs.immuneVanilla = new Set(immuneBuffs);
      if (this.buffs.has(BuffType.ObsidianSkin)) this.buffs.immuneVanilla.add(24);   // :9577
      // Wet 103：着火 24 / 地狱火 323 / 燃烧 67 免疫（Player.cs:11344-11346——
      // UpdateBuffs 内 buffType==103 分支逐帧置位，DrippingSlime 同族语义）
      if (this.buffs.has(BuffType.Wet)) {
        this.buffs.immuneVanilla.add(24);
        this.buffs.immuneVanilla.add(323);
        this.buffs.immuneVanilla.add(67);
      }
    }
    // 吸血鬼炽灼 120 档卸翅膀/火箭靴（Player.cs:28186-28187 wingsLogic=0;
    // rocketBoots=0——原版在 UpdateEquips 后直清字段；本仓 wing/rocketBoots 出自本
    // getter，等价实现 = 炽灼档（burning 且 counter≥120）下归零，equipStatsKey 的
    // S/V/v 档保证翻转帧失效重算）
    if (this.vampireBurningInSunlight && this.sunScorchCounter >= 120) {
      wing = null;
      rocketBoots = 0;
    }
    return {
      def, mana, hpPerSec: life / 2, // lifeRegen 单位 = 每半秒（NaturalLifeRegen 语义）
      dmgMelee, dmgRanged, dmgMagic,   // 箭袋 arrowDmg 移入 arrowStack（仅箭吃，:3820）
      critMelee, critRanged, critMagic,
      moveMult, meleeSpeed,
      accRunSpeed: runSpeed,   // 靴族 accRunSpeed（裸 0=未装备 → 消费侧取基准 3）
      bootFx, bootDyeVid,
      extraFall, lavaMax, armorPen, rocketBoots,
      autoJump, fireWalk, noKnockback, noFallDmg, desertBoots,
      frostBurn,
      huntressT2,                // 女猎手 T2/T3（setHuntressT2 :16119/:16149）
      anglerSetSpawnReduction,   // 渔夫套生成环（NPC.cs:627-630）
      waterWalk, jumpBoost, panic, starCloak,
      jumpOpts,
      wing, dash, blackBelt, bees, carpet,
      jumpSpd: jumpSpd + (this.buffs.has(BuffType.Werewolf) ? 0.2 : 0), flipper, longInvince, spikedBoots, canFloat,
      treasureMagnet, goldRing, luckyCoin, discount,
      killGuide, killClothier,   // 巫毒娃娃(城镇 NPC 玩家伤害门)
      infoAccs,                 // 信息饰品 12 门禁(DrawInfoAccs)
      arrowDmg, ammoSaveHuntress, ammoSaveChloro, ammoSaveCost80, ammoSaveCost75,
      kbGlove, autoReuseGlove, yoyoString, magmaStone,
      meleeScaleGlove,   // 手套族近战放大 ×1.1（GetAdjustedItemScale :41919-41930）
      stringColor,   // 线饰品线色（UpdateVisibleAccessory :36441-36449）
      accDraw,       // 身上贴图十族绘制槽（UpdateVisibleAccessory :36441-36520;渲染层消费）
      aggroAcc,      // 仇恨轴 ±400 七件合计（aggro getter 并入）
      iceSkate,
    quiver: equipHasQuiver,
    moltenQuiver, // 箭袋族：箭速/击退 ×1.1（Player.cs:52711-52715）
      arrowStack: arrowDmg, shroomiteType, shroomiteSet, vortexSet, nebulaSet, beetleOff,
      beetleDef,
      wolfAcc, boc,
      tileSpeed, wallSpeed, tileRange, autoPaint, chiselSpeed, toolbelt, pStone, counterWeight, vanityCounterWeight, yoyoBag,
      yoyoGlove, magicString,   // 悠悠球袋族（UpdateEquips :14174-14226）
      flowerBoots, stepStool,
      manaMagnet, magicCuffs, manaFlower,
      manaRegenBonus, manaRegenDelayBonus,
      fishingSkill: fish + (this.usedGummyWorm ? 3 : 0),   // +软糖虫(:12451)
      fishingTackle, lavaFishing, fishingLine,   // 钓具箱族/防熔钓族/断线免疫（R14-E6）
      royalGel,                     // 皇家凝胶 23 类史莱姆不索敌（Enemy 索敌门消费）
      manaCostOff: (manaFlower ? 0.08 : 0) + manaCostOffAcc,   // 耗魔加算折扣（:14040+:14561）
      toolboxRange, mechShowWires, autoActuator, magiluminescence,
      iceBarrierAcc, lavaRose,
      cordage,
      overrideFishingBobber: bobberOverride,   // 浮漂饰品弹型覆写（:1920/-1=无）
      runAccMul: setRunAccMul, maxRunMul: setMaxRunMul, runSlowMul: setRunSlowMul,
      enduranceEq: setEndurance, solarSet,
      shieldItem,
      setBonus: sb,
      // 水晶球预见(29) 耗魔 -2%（manaCost -= 0.02f，Player.cs:11485——原版与饰品同池
      // 加算,本仓饰品侧为乘法聚合,折乘 0.98 并入;buffs.active 已在 equipStatsKey 缓存键内）
      manaCostMul: manaCostMul * this.buffs.clairvoyanceManaCostMult,
      minionSlots, minionDmg, minionKB, sentrySlots, whipRange,
      maxTagEffects, tagEffectDuration, accSnakeBand, accWickedArmlet,
      whipSpd: summonSet?.whipSpd ?? 1,
      summonSet,
      divingHelm, merman, arcticDivingGear, jellyfishGlow,
      accSentryBackpack, accGolemSentryBackpack,
      accHarpyCharm, accSeraphNecklace, hasPhoenixQuiver,
      accSnappingStone, accPyroclast, accArmletOfRuin,
      accPoisonBarb, accHoneyedBarb, catalystBand,
      accSharpBarb, ammoCyclerMode, mysticSashDodge, accTimerCrit, shinyStone,
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
    // War Table buff 348（:9863-9866 maxTurrets++，:2714 默认 1）
    return 1 + this.equipStats.sentrySlots + (this.buffs.has(BuffType.WarTable) ? 1 : 0);
  }
  get thornsActive(): boolean {
    return this.thornsAmount > 0 || this.turtleSet;
  }
  /** 荆棘反伤乘数 thorns（UpdateBuffs 赋值链：buff14=1 / dryadWard165=0.5(<1 补)）；
   *  海龟套在消费端覆写 2（Player.cs:30912-30914 num2=turtleThorns?2:thorns——覆写非叠加） */
  get thornsAmount(): number {
    return this.buffs.thornsAmount;
  }
  /** 海龟套装（1316-1318 h99|b65|l54,Player.cs:15930-15934 turtleThorns → 反伤 ×2） */
  get turtleSet(): boolean {
    const a = this.inv.armor;
    const s0 = statOfInternal(a[0]?.id ?? -1), s1 = statOfInternal(a[1]?.id ?? -1), s2 = statOfInternal(a[2]?.id ?? -1);
    return s0?.hs === 99 && s1?.bs === 65 && s2?.ls === 54;
  }
  /** 仙人掌套装（894-896 h70|b46|l42,Player.cs:30948-30958 cactusThorns → 独立定值反伤） */
  get cactusSet(): boolean {
    const a = this.inv.armor;
    const s0 = statOfInternal(a[0]?.id ?? -1), s1 = statOfInternal(a[1]?.id ?? -1), s2 = statOfInternal(a[2]?.id ?? -1);
    return s0?.hs === 70 && s1?.bs === 46 && s2?.ls === 42;
  }
  /** player.head 语义（Player.cs:25336 = armor[0].headSlot；:35315-35322 时装头
   *  armor[10].headSlot ≥ 0 时覆盖）——displayArmor()[0] 即"时装优先"同式。
   *  消费：SkyRenderer 太阳分支（Main.cs:62365 head==12 太阳镜 → Sun2 骷髅头太阳）。
   *  头槽 12 = 物品 237 太阳镜（Item.cs:4273 headSlot=12, vanity） */
  get headArmorSlot(): number {
    return statOfInternal(this.inv.displayArmor()[0] ?? -1)?.hs ?? -1;
  }
  /** 近战攻速倍率（CapAttackSpeeds + TurnAttackSpeedToUseTimeMultiplier，Player.cs
   *  :28555-28574 1:1）：meleeSpeed 加法总和（装备 0.12 档 + 词缀 77-80 + 套装 + buff）
   *  封顶 3 后取倒数，作为 useAnimation/useTime 的时长乘数。原"猛爪手套 ×2"档已废——
   *  原版猛爪手套 211 只给 meleeSpeed += 0.12 + autoReuseGlove（:14559-14562），
   *  0.12 已经 vanilla-accfx.json 走 equipStats.meleeSpeed，不应再翻倍。 */
  get attackSpeedMult(): number {
    const raw = (1 + this.equipStats.meleeSpeed)
      * (this.buffs.has(BuffType.Tipsy) ? 1.1 : 1)
      * (this.buffs.has(BuffType.Werewolf) ? 1.051 : 1)      // 狼人 meleeSpeed += 5.1%（:11489）
      * (this.buffs.has(BuffType.Weak) ? 0.949 : 1)          // 虚弱 meleeSpeed -= 5.1%（:11507）
      * (1 + 0.1 * this.beetleOrbs)                          // 甲虫攻击球攻速（:10071+）
      * (1 + this.buffs.wellFedMeleeSpeed)                   // 食物近战速 +5/7.5/10%（:11528+）
      * (1 + this.buffs.hungerMeleeSpeed);                   // 饥饿/极饿近战速 -5/-10%（:11566+/:11589+）
    return raw > 3 ? 1 / 3 : 1 / raw;                        // :28566-28573
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
      m += this.buffs.hungerDamage;      // 饥饿/极饿全系 -5/-10%（:11565+/:11588+，含召唤）
      m += 0.15 * this.nebula[0];        // 星云伤害 179-181 每级四系 +15%（:10118-10124）
      if (this.buffs.has(BuffType.WitheredWeapon)) m *= 0.5;   // 枯萎武器（:25715）
      // 猪鲨崽增益（Mount.cs UpdateEffects case 12 :4991：minionDamage += 0.15）
      if (this.ridingMount && this.mount.type === 12 && this.mount.fishronBoost) m += 0.15;
      // 帕鲁坐骑 62-65（1457 Mount.cs UpdateEffects case 62/63/64/65 :4862-4867：
      // melee/ranged/magic/minion 四系各 += 0.1——疾旋鼬/疾旋火鼬及其 Trusty 版）
      if (this.ridingMount && this.mount.type >= 62 && this.mount.type <= 65) m += 0.1;
      return m;
    }
    let m = 1 + (kind === 'melee' ? st.dmgMelee : kind === 'ranged' ? st.dmgRanged : st.dmgMagic);
    if (kind === 'magic') {
      m += this.buffs.magicDmgBonus;            // MagicPower +20%（:9669）
      m *= this.buffs.manaSickMagicMult;        // 魔力眩晕最高 -25% 线性恢复（:10003/:25616）
      m *= this.manaHeatMult;                   // 1457: 魔力过热乘区（Update :26104
                                                //   magicDamage *= manaHeat，紧跟 manaSick 段）
    }
    // Archery 药水(16) ×1.1 不在此乘（:9711-9712 只进 arrowDamage → bowEffectiveDamage
    // :3820-3822 仅箭族消费；枪弹 gunEffective/火箭 specialistEffective 均不含
    // arrowDamage）——本仓在 rangedDamageMult('arrow') 分道处乘（:1508 附近）
    // R1 药水：怒气(117)全系 +10%（:9947）；醉酒(25)近战 +10%（:11513）
    if (this.buffs.has(BuffType.Rage)) m += 0.1;
    if (kind === 'melee') {
      if (this.buffs.has(BuffType.Tipsy)) m += 0.1;
      if (this.buffs.has(BuffType.Werewolf)) m += 0.051;      // 狼人（:11488）
      if (this.buffs.has(BuffType.Weak)) m -= 0.051;         // 虚弱（:11506）
      m += 0.1 * this.beetleOrbs;                              // 甲虫攻击球每颗 +10%（:10071+）
      if (this.heldPsychoKnife) m += (1 - this.stealth) * 3;   // 变态刀潜行（:25487）
    }
    m += this.buffs.wellFedDamage;   // 食物三档全系 +5/7.5/10%（:11527+）
    m += this.buffs.hungerDamage;    // 饥饿/极饿全系 -5/-10%（:11564+/:11587+）
    m += 0.15 * this.nebula[0];      // 星云四系 +15%/层
    // 猪鲨崽增益（Mount.cs UpdateEffects case 12 :4988-4992：melee/ranged/magic/minion
    // 四系各 += 0.15——湿身/半血以下/雨中露天的 MountFishronSpecial 态）
    if (this.ridingMount && this.mount.type === 12 && this.mount.fishronBoost) m += 0.15;
    // 帕鲁坐骑 62-65（1457 Mount.cs UpdateEffects case 62/63/64/65 :4862-4867）：
    // melee/ranged/magic/minion 四系各 += 0.1
    if (this.ridingMount && this.mount.type >= 62 && this.mount.type <= 65) m += 0.1;
    // 枯萎武器(196)：四系伤害 ×0.5（Player.cs:25712-25719）
    if (this.buffs.has(BuffType.WitheredWeapon)) m *= 0.5;
    return m;
  }
  /** 远程分道乘区（1457 Player.cs:3966-3970 bowEffectiveDamage/gunEffectiveDamage/
   *  specialistEffectiveDamage 拆分,消费 GetWeaponDamageMultiplier :54031-54055）：
   *  箭 = (rangedDamage + 箭袋stack) × Archery × 蘑菇矿箭头 1.12 × 潜行增伤；
   *  弹/火箭 = rangedDamage × 对应蘑菇矿头 1.12 × 潜行；其他（飞镖等）= rangedDamage */
  rangedDamageMult(kind: 'arrow' | 'bullet' | 'rocket' | 'other'): number {
    const st = this.equipStats;
    const base = this.damageMult('ranged'); // rangedDamage 全链（装备+四系 buff）
    // 潜行增伤：星璇平铺 (1−s)×0.8（:26043）；蘑菇矿走 Remap 轴 ×0.5（:26015-26016
    //  num26=Remap(s,1,0.75,1,0)、rangedDamage += (1−num26)×0.5f——曾误平铺 ×0.6）
    const stealthBonus = st.vortexSet ? 1 + (1 - this.stealth) * 0.8
      : st.shroomiteSet ? 1 + (1 - shroomiteStealthRemap(this.stealth)) * 0.5
      : 1;
    if (kind === 'arrow') {
      // 1457 Player.cs:3966 bowEffectiveDamage = (rangedDamage/rangedMultDamage
      //   + arrowDamageAdditiveStack) × rangedMultDamage × arrowDamage——箭袋 stack
      //   只乘 arrowDamage 一次（旧码 stack×arrowMult 内外双乘 = stack 段 ×arrowMult²
      //   登记债,2026-08-22 备案遗留①修复）。rangedMultDamage 全仓仅枯萎武器 ×0.5
      //   （:26233;:18454 ResetEffects 每帧复位 1f）,本仓枯萎已折入 damageMult
      //   ('ranged')（:1769）→ 先 /M 还原加算链、stack 加在后、再回乘 M,与原式逐项等价
      const arrowMult = this.buffs.arrowDmgMult * (st.shroomiteType === 'arrow' ? 1.12 : 1);
      const rangedMultDamage = this.buffs.has(BuffType.WitheredWeapon) ? 0.5 : 1;   // :26233
      return ((base / rangedMultDamage) + st.arrowStack) * rangedMultDamage * arrowMult * stealthBonus;
    }
    if (kind === 'bullet') return base * (st.shroomiteType === 'bullet' ? 1.12 : 1) * stealthBonus;
    if (kind === 'rocket') return base * (st.shroomiteType === 'rocket' ? 1.12 : 1) * stealthBonus;
    return base;
  }
  /** 手持变态刀 3106（潜行判定用） */
  get heldPsychoKnife(): boolean {
    const d = ITEM_DEFS[this.inv.heldItem()?.id ?? -1];
    const vid = d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    return vid === 3106;
  }
  /** 潜行 aggro（:25518/:25557/:25491：蘑菇矿 -750×(1-s) / 星璇 -1200 / 变态刀 -750）
   *  ——敌人索敌距离缩短（NPC.cs:78375 dist -= aggro）；各 AI 家族索敌门消费见后续批 */
  get aggro(): number {
    const s1 = 1 - this.stealth;
    // 原版 aggro 是累加字段（ResetEffects :18229 清零 → 装备 ±400/套装 ±250·300
    // 逐源 += → 潜行装 :25494-25563 减）——本仓潜行三源互斥 if/else 近似 + 配饰
    // 轴 aggroAcc 并入（±400 七件,ApplyEquipFunctional :13992-14109）
    let a: number;
    if (this.equipStats.vortexSet) a = -Math.round(1200 * s1);            // :26045 平铺 (1−s)
    else if (this.equipStats.shroomiteSet) a = -Math.round(750 * (1 - shroomiteStealthRemap(this.stealth)));  // :26015/:26018 Remap 轴（曾误平铺 (1−s)）
    else if (this.heldPsychoKnife) a = -Math.round(750 * s1);             // :25976 平铺 (1−s)
    else a = 0;
    a += this.equipStats.aggroAcc;
    // 隐身药水(10)：aggro 钳位（Player.cs:25437-25445）——未挥击钳 -750（索敌距离
    // +750 曼哈顿 = 敌怪"看不见"），挥击中只钳 -250；只降不升（潜行套 -1200 不被抬回）
    if (this.buffs.has(BuffType.Invisibility)) {
      const attacking = !(this.itemAnimTicks <= 0 && this.useTime <= 0);
      if (!attacking) {
        if (a > -750) a = -750;
      } else if (a > -250) {
        a = -250;
      }
    }
    return a;
  }
  /** 近战护甲穿透（磨刀 159：meleeArmorPenetration += 12，仅近战/投掷） */
  get meleeArmorPen(): number {
    return this.buffs.has(BuffType.Sharpened) ? 12 : 0;
  }
  /** 星云 booster CD（命中驱动，Game 侧判定；:12895 nebulaCD=30） */
  nebulaCD = 0;
  /** 用魔物品起手（Game 在设定 useTime 后调用）：登记动画窗，窗内每帧重置
   *  manaRegenDelay（Player.cs:42131-42137 itemAnimation>0 && item.mana>0 →
   *  ItemCheck_ApplyManaRegenDelay :49851；本仓单计时器模型以 useTime 代 useAnimation） */
  onManaItemUsed(): void {
    this.manaAnimTicks = Math.max(this.manaAnimTicks, this.useTime);
  }
  /** channel 族持械续期（channel 弹实体在 channelCb() 活跃期每 tick 调用）：
   *  原版 channel 武器按住期间 itemAnimation 持续 >0 → ItemCheck_ApplyManaRegenDelay
   *  （Player.cs:43143-43146 itemAnimation>0 && item.mana>0 每帧）恒把 manaRegenDelay
   *  刷回 4（ApplyManaRegenerationDelay :19517-19540 ManaV2 钉值）→ 全程 5% 滴流回蓝
   *  （UpdateManaRegen flag3 支 :19563-19567/:19601-19604）。本仓 channel 弹寿命 >
   *  useTime，manaAnimTicks 只在出手拍登记（onManaItemUsed）→ useTime 耗尽即回满速
   *  回蓝 = channel 期白嫖魔力（2026-08-22 审计 ❌）。修复 = channel 活跃期把动画窗
   *  钉 ≥1，下一帧 fixedUpdate 的 `manaAnimTicks>0` 支消费（--→applyManaRegeneration
   *  Delay → delay 钉 4 → 衰减 3 ∈ (0,4) → 5% 滴流），与直射武器每拍刷新同语义。
   *  调用侧用可选链（`?.()`）——容忍测试 mock player 缺该方法 */
  onChannelManaHold(): void {
    this.manaAnimTicks = Math.max(this.manaAnimTicks, 1);
  }
  /** 甲虫进攻套：近战命中蓄能（45 次/球，满 3 球；受击掉球见 damage()） */
  onMeleeHit(): void {
    // ⑰ 时间蓄能（原版持续近战 ~90t/球）：命中只刷新续航窗口，蓄能走 fixedUpdate 每 tick
    if (this.equipStats.beetleOff || this.equipStats.beetleDef) this.lastMeleeTick = 30;
  }

  // ---- 1457 配饰四件本体（ammoCycler / sentry backpack / accTimerCrit /
  //      accHarpyCharm——旗落聚合在 equipStats,运行态+消费端 2026-08-23 批）----

  /** Update_AmmoCycler + Update_SentryBackpack + Update_HarpyCharm + Update_TimerCrit
   *  （Player.cs:24760-24763 四连调,本体 :28632-28659/:28521-28562/:28661-28704）。
   *  fixedUpdate 每 tick 调（原版 Update 同位）。 */
  /** 冷却回充三连尘（Spawn_SnappingStoneRecharge P57:454-470 / Pyroclastic :437-452 /
   *  ArmletOfRuin :418-435 共用形态）：NewDust(position,w,h,type,0,0,α) 后置字段
   *  noLight/noGravity/scale/fadeIn/y=半高/customData=player/noLightEmittance。
   *  pull 系（226/15）velocity×0.5 再 vy×3；circular 系（6）v=Circular(2,4)。 */
  private emitRechargeDust(game: GameHooks, type: number, count: number,
    scale: number, alpha: number, pull: boolean): void {
    for (let i = 0; i < count; i++) {
      const d = game.spawnDust?.(this.x, this.y, this.w, this.h, type, 0, 0, alpha, null, scale);
      if (!d) continue;
      d.noLight = true;
      d.noGravity = true;
      d.scale = scale;
      d.fadeIn = 1.1;
      d.y = this.y + this.h / 2;
      if (pull) {
        d.vx *= 0.5;
        d.vy *= 3;
      } else {
        d.vx = (Math.random() * 2 - 1) * 2;               // NextVector2Circular(2,4)
        d.vy = (Math.random() * 2 - 1) * 4;
      }
      d.alpha = alpha;
      d.followPlayer = true;                              // customData=player
      d.noLightEmittance = true;
    }
  }

  private update1457AccBodies(game: GameHooks): void {
    // Update_AmmoCycler（:28632-28638）：冷却走完归 0 拍把轮换偏移复位
    if (this.ammoCyclingCooldown > 0 && --this.ammoCyclingCooldown === 0) {
      this.ammoCyclingOffset = 0;
    }
    // Update_SentryBackpack（:28640-28646）：抓取占位冷却递减（携带中哨兵 AI 每拍续约）
    if (this.accSentryBackpackGrabCooldown > 0) this.accSentryBackpackGrabCooldown--;
    // Update_HarpyCharm（:28648-28659）：冷却 >0 递减,归零拍扫描在场箭引矢
    if (this.accHarpyCharmCooldown > 0) this.accHarpyCharmCooldown--;
    else harpyCharmEffect(game, this);
    // Update_TimerCrit（:28521-28562）：num=1000 上限
    if (this.accTimerCritCharge < 1000) {
      if (this.accTimerCritCharge < 0) {
        this.accTimerCritCharge += 1;                    // :28528-28533 负窗 1/t 回充
      } else {
        // :28534-28537 num5 = 3 + (UsingOrReusingItem ? 0 : 3) + (|v|<0.1 ? 3 : 0)
        // ——本仓 UsingOrReusingItem ≈ itemAnimTicks>0 || useTime>0（挥舞窗/冷却窗）
        const usingItem = this.itemAnimTicks > 0 || this.useTime > 0;
        const speed = Math.hypot(this.vx, this.vy);
        this.accTimerCritCharge += 3 + (usingItem ? 0 : 3) + (speed < 0.1 ? 3 : 0);
        if (this.accTimerCritCharge >= 1000) {
          this.accTimerCritCharge = 1000;                // :28538-28542 钳满
          if (this.equipStats.accTimerCrit) {
            // :28543-28561 满蓄提示 SoundID.Item28（vol 0.04/pitch −0.9）+ 尘 228×5
            game.playSfxFiles?.(['Item_28'], 0.04, this.cx, this.cy);
            for (let i = 0; i < 5; i++) {
              game.spawnDust?.(this.x, this.y + this.h * (1 - this.accTimerCritCharge / 1000),
                this.w, this.h, 228, 0, 0.03, 255, null, 0.9, true);
            }
          }
        }
      }
    }
  }

  /** TryConsumingTimerCrit（Player.cs:28564-28595；调用点 :44657 ItemCheck 近战命中
   *  等 5 处全在近战接触结算）：满蓄（timerCritChargeFull :3387 ≥1000）或负冷却窗
   *  （charge<0，:28566）→ 强制暴击；charge>0 时消费置 −15（:28568-28571,负窗内
   *  不重置=15t 连暴窗）；粒子（:28576-28593 NightsEdge 编排+尘 228×20）近似取
   *  相交盒中心。返回 true = 本次命中强制暴击。 */
  tryConsumingTimerCrit(game: GameHooks, rx: number, ry: number, rw: number, rh: number): boolean {
    if (!this.equipStats.accTimerCrit) return false;
    if (!(this.accTimerCritCharge >= 1000 || this.accTimerCritCharge < 0)) return false;
    if (this.accTimerCritCharge > 0) this.accTimerCritCharge = -15;   // :28568-28571
    game.spawnParticles?.((rx + rw / 2), (ry + rh / 2), '#E8E8FF', 6, 2.2, { life: 20, grav: 0 });
    return true;
  }

  /** PickAmmo 实耗侧轮换推进（Player.cs:54209-54217）：模式≠None 且真实射击
   *  （!dontConsume）→ cooldown = useAnimation+120、offset++；Random 模式 offset
   *  直写随机（:54214-54217）。无弹药早退（:54101-54104）不推进——调用侧须在
   *  选弹命中后调。 */
  noteAmmoCycledShot(useAnimation: number): void {
    if (this.equipStats.ammoCyclerMode === 0) return;
    this.ammoCyclingCooldown = useAnimation + 120;
    this.ammoCyclingOffset++;
    if (this.equipStats.ammoCyclerMode === 3) {
      this.ammoCyclingOffset = Math.floor(Math.random() * 2147483647);   // Main.rand.Next()
    }
  }

  /** PickAmmo_PickAmmoItem（Player.cs:54368-54390）+ PickAmmo_IterateRange
   *  （:54326-54366）：按 ammoCyclerMode 选弹药槽,返回命中的背包槽位（-1=无弹药）。
   *  AmmoSlots(1)=先只在弹药槽（54-57;币族 50-53）内轮换,空则回退默认序【不轮换】
   *  （:54389 allowAmmoCycling=false）;FullInventory(2)/Random(3)=默认序轮换;
   *  None(0)=默认序首个（1.4.4 语义）。默认序 = 币 50-53 → 弹药 54-57 → 背包 0-53
   *  （AmmoSlotOrder_Default :3175）。克塔敏化器 779/大地改造器 5134 恒取第一组
   *  （:54347-54350）。matches = `item.ammo == sItem.useAmmo && stack > 0` 的槽判定。 */
  pickAmmoSlot(matches: (id: number) => boolean, useAmmo: number, weaponVid: number): number {
    const mode = this.equipStats.ammoCyclerMode;
    const forceFirst = weaponVid === 779 || weaponVid === 5134;   // :54347-54350
    if (mode === 1) {
      const order = useAmmo === 71 ? AMMO_SLOT_ORDER_COINS_ONLY : AMMO_SLOT_ORDER_AMMO_ONLY;
      const hit = pickAmmoIterateRange(order, this.inv.slots, matches,
        this.ammoCyclingOffset, true, forceFirst);
      if (hit >= 0) return hit;
    }
    return pickAmmoIterateRange(AMMO_SLOT_ORDER_DEFAULT, this.inv.slots, matches,
      this.ammoCyclingOffset, mode === 2 || mode === 3, forceFirst);
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
    if (kind === 'magic') c += this.buffs.clairvoyanceMagicCrit; // 水晶球预见 +2（:11482）
    if (kind === 'melee' && this.heldPsychoKnife) c = Math.min(100, c + Math.round((1 - this.stealth) * 30)); // 变态刀（:25489）
    if (kind === 'ranged') {
      if (this.equipStats.shroomiteType) c += 5; // 蘑菇矿头 rangedCrit+5（:13274+）
      // 潜行暴击：星璇平铺 (1−s)×20（:26044）；蘑菇矿 Remap 轴 ×10（:26015/:26017）
      if (st.vortexSet) c += Math.round((1 - this.stealth) * 20);
      else if (st.shroomiteSet) c += Math.round((1 - shroomiteStealthRemap(this.stealth)) * 10);
    }
    c += this.buffs.wellFedCrit;    // 食物三档全系暴击 +2/3/4（:11525+）
    c += this.buffs.hungerCrit;     // 饥饿/极饿全系暴击 -2/-4（:11562+/:11585+）
    return c;
  }

  get frame(): number {
    if (!this.onGround) return 4;
    if (Math.abs(this.vx) > 0.3) {
      return 1 + Math.floor(this.animTime / 8) % 3;
    }
    return 0;
  }

  /** 坐骑能力维护上下文（Mount.updateMountEffects 用）：Scutlix/Santank 索敌候选
   *  （CanBeChasedBy 口径过滤）+ 视线门 + 发射桶（606 眼激光 / 930 炮击 / 14 子弹）+
   *  冲刺尘/山羊火焰 + 猪鲨崽天气视图（Player.cs:25373 UpdateEffects
   *  :4884-4930/:4996-5003 对应数据源）。索敌候选惰性组装——仅眼炮族（9/46）消费 */
  private mountEffectsCtx(game: GameHooks): import('./Mounts').MountEffectsCtx {
    const st = this.lastStore;
    const raining = !!game.world.weather?.raining;
    const needTargets = this.mount.type === 9 || this.mount.type === 46;
    const targets: import('./Mounts').ScutlixTarget[] = [];
    if (needTargets) {
      for (const e of game.enemies()) {
        const n = e as { x: number; y: number; w: number; h: number; dead: boolean;
          maxHp: number; def?: { friendly?: boolean; critter?: boolean } };
        // NPC.CanBeChasedBy（NPC.cs:28334：active && chaseable && lifeMax>5 && !friendly && !immortal）
        if (n.dead || n.maxHp <= 5 || n.def?.friendly || n.def?.critter) continue;
        if (n.x === undefined || n.w === undefined) continue;
        targets.push({ x: n.x, y: n.y, w: n.w, h: n.h });
      }
    }
    return {
      scutlixTargets: targets,
      los: (cx, cy, t) => !!st && canHitLine(st, cx, cy, 0, 0, t.x, t.y, t.w, t.h),
      // 眼激光 606（UseAbility case 9）：MountShot 实体化（extraUpdates 2 → 42px/tick）
      fireScutlixShot: game.spawnTownShot
        ? (x, y, vx, vy) => {
          game.spawnTownShot?.(new MountShot(x, y, vx, vy, SCUTLIX_SHOT_DAMAGE, 0, SCUTLIX_PROJ_ID));
        }
        : undefined,
      // Santank 双炮（UseAbility case 46）：930 炮击（伤 120，重力抛物线 + Item_89）/
      // 14 子弹（伤 100，直线 + Item_11；自带 light 0.5 走 Game 弹幕点光通道）
      fireSantankShot: game.spawnTownShot
        ? (kind, x, y, vx, vy) => {
          if (kind === 'cannon') {
            game.spawnTownShot?.(new MountShot(x, y, vx, vy, 120, 0, 930, { noGravity: false }));
            game.playSfxFile?.('Item_89', 0.2, x, y);
          } else {
            game.spawnTownShot?.(new MountShot(x, y, vx, vy, 100, 0, 14));
            game.playSfxFile?.('Item_11', 0.2, x, y);
          }
        }
        : undefined,
      // 冲刺尘（UpdateFrame case 10/47/14）：原版 dust 池优先（176/177/179/6 型号语义
      // + noGravity/scale/fadeIn），缺省回退程序粒子环向爆发
      dashDust: (x, y, n, spread, type) => {
        const pool = game.vanillaDust;
        if (pool) {
          const sign = Math.sign(this.vx);
          for (let i = 0; i < n; i++) {
            const ang = (Math.PI * 2 * i) / n + Math.random() * Math.PI * 2;
            const dirX = -Math.sin(ang), dirY = Math.cos(ang);   // UnitY 旋转族
            const k = 0.2 * spread;
            const d = pool.spawn(x + dirX * k * 40, y + dirY * k * 30, 0, 0, type,
              dirX * 4 + this.mount.runSpeed() - sign * spread * 2, dirY * 4);
            if (d) { d.noGravity = true; d.scale = 1 + Math.random() * 0.8; d.fadeIn = Math.random() * 2; }
          }
          return;
        }
        game.spawnBurst?.(x, y, type === 6 ? '#8C6A4A' : '#D8D0E0', n, 3, 0, Math.PI * 2,
          { life: 30, grav: 0 });
      },
      // 山羊火焰（ParticleOrchestrator.WallOfFleshGoatMountFlames :3892-3895 引用，
      //  Spawn_WallOfFleshGoatMountFlames 编排器定义 ParticleOrchestrator.cs:3259-3306）：
      //  3 束 FlameParticle（x = 入参 ±5.3333335px，零速，scale 0.1-1.0，TTL 50，
      //  贴图 326/327/328——本体层已 1:1 落地 src/fx/FlameParticles.ts，绘制走
      //  Renderer.drawFlameParticles = Main.ParticleSystem_World_BehindPlayers）+
      //  每束 1/8 概率 dust 6（NewDustDirect(vector,4,4,6,0,0,α100) 后 velocity×0.6、
      //  vy-1.2、y-4、noLight；50% noGravity+fadeIn1.15 / 50% scale0.6）——尘段 1:1。
      goatFlames: (x, y) => {
        // FlameParticle 本体层（编排器 :3262-3290 的三束段）
        flameParticles.spawnGoatFlames(x, y);
        const pool = game.vanillaDust;
        if (!pool) return;   // 无尘池（测试桩）：尘段静默跳过（火焰本体层不受影响）
        for (let i = -1; i <= 1; i++) {
          const vx0 = x + i * 5.3333335;                     // :3269 三束同偏移
          if (Math.floor(Math.random() * 8) !== 0) continue;   // :3292 Next(8)==0
          const d = pool.spawn(vx0, y, 4, 4, 6, 0, 0, 100);
          if (!d) continue;
          if (Math.floor(Math.random() * 2) === 0) {           // :3293 Next(2)==0
            d.noGravity = true;
            d.fadeIn = 1.15;
          } else {
            d.scale = 0.6;
          }
          d.vx *= 0.6;                                          // :3299 velocity *= 0.6
          d.vy = d.vy * 0.6 - 1.2;                              // :3300 velocity.Y -= 1.2
          d.noLight = true;                                     // :3301
          d.y -= 4;                                             // :3302 position.Y -= 4
        }
      },
      fishron: {
        hp: this.hp, maxHp: this.maxHp,
        inWater: this.inWater, inLava: this.inLava, inHoney: this.inHoney,
        dripping: this.buffs.has(BuffType.Wet),  // Player.dripping（buff 103 Wet 激活 :11342）
        raining,
        windExposed: raining && !!st
          && inAPlaceWithWind(st, this.x, this.y, this.w, this.h, game.world.groundLevel),
      },
    };
  }

  /** 1457 新方法 ApplyManaRegenerationDelay（Player.cs:19515-19540）：用魔惩罚期置值
   *  统一入口。公式与 1456 三处内联相同（(1−mana/max)×240+45 再 ×0.7 取整），但
   *  新增 manaRegenBuff 时钳 20f——1456 该钳只在 UpdateManaRegen 每帧做，1457 挪到
   *  置值时点（QuickBuff :5877 / ItemCheck_ApplyManaRegenDelay :51204 /
   *  CommandForbiddenStorm :57546 三处改调本方法）→ 回蓝 buff 期间惩罚期变短。
   *  smm = statManaMax2（调用侧已备）。
   *  ★DebugOptions.ManaV2 分支（:19526-19537）为 release 正式行为（ManaV2 默认 true,
   *  Testing/DebugOptions.cs:30）——2026-08-21 批 1 遗漏半边补齐：置值后钳 4 帧
   *  （num2=num3=4：delay>4 → 4；statMana>0 → 恒钉 4）。官方"完全移除延迟"即此
   *  4 帧残桩（0.067s），攻击期每帧刷新 delay=4 → UpdateManaRegen 恒落 5% 滴流支 */
  applyManaRegenerationDelay(smm = this.maxMana): void {
    const base = smm > 0 ? (1 - this.mana / smm) * 240 + 45 : 45;
    this.manaRegenDelay = Math.floor(base * 0.7);      // :19518-19521（×0.7 后才取整）
    if (this.buffs.manaRegenBuff && this.manaRegenDelay > 20) {
      this.manaRegenDelay = 20;                        // :19522-19525 回蓝期钳 20f
    }
    // DebugOptions.ManaV2（:19526-19537）：num2=num3=4
    if (this.manaRegenDelay > 4) this.manaRegenDelay = 4;   // if (delay > num3) delay = num3
    if (this.mana > 0) this.manaRegenDelay = 4;             // if (statMana > 0) delay = num2（空蓝只钳上界不钉值）
  }

  /** 魔力花 QuickMana 钩子（CheckMana manaFlower 支 :53226-53239 内的 QuickMana()
   *  调用,:5590）。Player 层无 Game 引用（音效/背包变更回调在 Game 侧）→ 构造后由
   *  Game 接线到 quickMana()（QuickMana 全门版：死亡/满蓝/药水病 healBlocked 门,
   *  :5590-5596 + :5621 GetItemToUse 的 potionDelay 门）。未接线（测试/远端代理）
   *  = 该支静默跳过,行为同无魔力花 */
  quickManaHook: (() => void) | null = null;

  /** 1457 CheckMana（Player.cs:53216-53253；DebugOptions.ManaV2 默认 true——
   *  Testing/DebugOptions.cs:30,release 正式行为）：入口清 slowMagicUse（:53217）→
   *  蓝够扣魔返 true；不足 → manaFlower QuickMana 支（:53226-53239,2026-08-22 备案
   *  遗留②补齐：channel 续发每拍 ItemCheck_TryStartUse :52660-52690 →
   *  ItemCheck_ActuallyPayMana :53277 → CheckMana 直通本端口,装备魔力花时自动喝蓝
   *  重估——Game 主施法链 :9943-9961 内联支不动,两条入口语义自此一致）→ 仍不足
   *  statMana=0（:53243/:53254）+ DoRunOutOfManaEffect()（:53258-53261
   *  slowMagicUse=true）→ ManaV2 恒返 true =【空蓝照放】（慢施惩罚经
   *  GetSlowMagicUseTime/Rate/Scalar :47425-47456 消费） */
  checkMana(amount: number, blockQuickMana = false): boolean {
    this.slowMagicUse = false;                     // :53217 入口清标记（每次重估）
    if (this.mana >= amount) {
      this.mana -= amount;                         // if (pay) statMana -= num
      return true;
    }
    if (this.equipStats.manaFlower && !blockQuickMana) {   // :53226 if (manaFlower && !blockQuickMana)
      this.quickManaHook?.();                      // :53228 QuickMana()（Game.quickMana 全门版）
      if (this.mana >= amount) {
        this.mana -= amount;                       // if (pay) statMana -= num
        return true;
      }
    }
    this.mana = 0;                                 // :53243/:53254 statMana = 0
    this.slowMagicUse = true;                      // DoRunOutOfManaEffect :53258-53261
    return true;                                   // ManaV2：照常施法
  }

  /** 1457 新方法 TryApplyManaHeat（Player.cs:52644-52652）：登记最近 ManaHeat 源并
   *  挂 buff 396（时长 = time×60 tick）。power/time 任一为 0 不挂 buff（字段仍覆写） */
  tryApplyManaHeat(power: number, time: number): void {
    this.latestManaPotionDamageBonus = power;            // :52646
    this.latestManaPotionDuration = time * 60;           // :52647
    if (time !== 0 && power !== 0) {
      this.buffs.apply(BuffType.ManaHeat, (time * 60) / 60);  // :52650 AddBuff(396, duration)
    }
  }

  /** 1457 ApplyManaPotionManaHeat（Player.cs:52606-52642）：蓝药 189/500/2209 →
   *  0.05/0.10/0.15 × 20s。★1457 该方法【无调用点】（死代码——活路径只有魔力星
   *  35350/:35368 直调 TryApplyManaHeat），按原样备位不接线，喝蓝不触发 ManaHeat */
  static readonly MANA_POTION_MANA_HEAT: Record<number, [number, number]> = {
    189: [0.05, 20], 500: [0.1, 20], 2209: [0.15, 20],
  };

  /** 1457 魔力过热伤害乘区（Update :26098-26105 + UpdateBuffs buff 396 段 :10416-10429）：
   *  manaHeat 每帧 ResetEffects 清 1f 后由 buff 396 累加
   *  latestManaPotionDamageBonus × (buffTime/latestManaPotionDuration)——线性随
   *  剩余时长衰减。本仓以纯读 getter 等价（active 存秒） */
  get manaHeatMult(): number {
    const left = this.buffs.active.get(BuffType.ManaHeat);
    if (left === undefined || this.latestManaPotionDamageBonus === 0) return 1;
    const duration = this.latestManaPotionDuration > 0 ? this.latestManaPotionDuration : 1;
    return 1 + this.latestManaPotionDamageBonus * ((left * 60) / duration);
  }

  // ---- 1457 slowMagic 蓝空过载施法减速（Player.cs:47425-47456/:52593-52604）----
  /** GetSlowMagicMultiplier（:47453-47456）：恒 2.5（private static） */
  static readonly SLOW_MAGIC_MULTIPLIER = 2.5;
  /** GetSlowMagicUseTime（:47425-47432）：出手窗时长 ×2.5 */
  getSlowMagicUseTime(originalTime: number): number {
    if (!this.slowMagicUse) return originalTime;
    return Math.floor(Player.SLOW_MAGIC_MULTIPLIER * originalTime);
  }
  /** GetSlowMagicUseRate（:47434-47442）：充能速率 ÷2.5（弹幕 AI 每帧增量） */
  getSlowMagicUseRate(): number {
    if (!this.slowMagicUse) return 1;
    return 1 / Player.SLOW_MAGIC_MULTIPLIER;
  }
  /** GetSlowMagicScalar（:47444-47451）：节拍/阈值标量 ×2.5（slowMagicUse=false → 1）。
   *  ★1457 全部消费点核实（grep 全仓仅 3 处,全在 Projectile.cs）：439 激光机枪
   *  帧拍 frameCounter≥4×scalar（:67211）+ 音隔 soundDelay=(24−6×档)×scalar（:67222）、
   *  535 美杜莎之首石化阈值 (int)(60×scalar)/4（:45301）。两件武器本仓均未实装
   *  （2795 激光机枪无 AI、535 弹无 AI——Enemy.ts:2901 的 535 是美杜莎 NPC）→
   *  本仓暂零消费,按 parity 原语保留（tests/diff-1457-player-batch1 已断言 1/2.5）,
   *  武器实装时直接接（登记债） */
  getSlowMagicScalar(): number {
    if (!this.slowMagicUse) return 1;
    return Player.SLOW_MAGIC_MULTIPLIER;
  }
  /** UndoSlowMagicUse（:52591-52604,★1458 修）：喝蓝药时清标记（QuickMana :52585
   *  调用）。★1458 把窗缩回从 ×GetSlowMagicMultiplier()(2.5,越撤越慢=1457 bug,
   *  "slow magic resetting when using Quick buff"修复半边)改为 ×GetSlowMagicUseRate()
   *  (0.4,真正还原)+min 钳 2;零耗蓝物品路径 ItemCheck_ActuallyPayMana 早退
   *  （:53278 sItem.mana==0 return true）不再副作用清标记=修复另半边。本仓无
   *  itemAnimationMax/itemTimeMax 窗字段（swing 模型不同）→ 只清标记;零耗蓝物品
   *  本就不入 checkMana 端口=两半边天然对齐 1458 终态 */
  undoSlowMagicUse(): void {
    this.slowMagicUse = false;
  }
  /** EverySomeYoyoHits（Player.cs:4293-4301）：悠悠球 per-hit 族共享计数器。
   *  yoyoHitCounter 初始 -1 → 首次命中 -1%N≠0 不触发（原版同款,第 2 击才首触发）；
   *  countUp=true 时命中后自增（伤害乘区侧 :13428/:13434 传 false 只读不加） */
  everySomeYoyoHits(amount: number, countUp: boolean): boolean {
    const result = this.yoyoHitCounter % amount === 0;
    if (countUp) this.yoyoHitCounter++;
    return result;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    const world = game.world;
    this.lastStore = world.store;   // dashWallAhead 探测缓存（本 tick 内有效）
    this.prevInputJump = this.inputJump;   // 坐骑 releaseJump 边沿（Mount.tryStartHover 消费）
    this.oldX = this.x; this.oldY = this.y;   // oldPosition（尘埃 customData 跟随差值）
    // ---- 派对染发剂彩纸（UpdateHairDyeDust Player.cs:23994-24023；2026-08-14 接通，
    //      原 HairDyeColor.ts §4 登记偏差销核）——抽为方法：MP 远端代理不走
    //      Player.fixedUpdate（Game.stepRemoteProxy 只跑移动子集）,代理彩纸在
    //      Game.simulateRemotePlayers 同门补掷（原版各端对全部 Main.player 跑此尘）。
    //      fixedUpdate 本身只在非暂停时跑 ----
    this.updateHairDyeDust(game);
    if (this.iframes > 0) this.iframes--;
    if (this.useTime > 0) this.useTime--;
    this.miscCounter++;
    // AdvancedShadows 历史环（翅膀 45 彩虹拖尾；尾插保持 ≤31）
    this.advancedShadows.push({ x: this.x, y: this.y });
    if (this.advancedShadows.length > 31) this.advancedShadows.shift();
    // itemFlame（LegacyPlayerRenderer :493-502：仅翅膀 22 在用时每 5t 重掷）
    if (this.equipStats.wing?.logic === 22 && --this.itemFlameCount <= 0) {
      this.itemFlameCount = 5;
      for (let i = 0; i < 7; i++) {
        this.itemFlamePos[i].x = ((Math.random() * 21 | 0) - 10) * 0.15;   // Next(-10,11)×0.15
        this.itemFlamePos[i].y = ((Math.random() * 10 | 0) - 10) * 0.35;   // Next(-10,1)×0.35
      }
    }

    // 调试无敌（F2）：每 tick 血蓝回满——兜住 DoT/溺水/摔落等直改 hp 的路径
    // （战斗伤害已由 damage() 早退拦截）；同时保证不会走到下方 hp<=0 死亡结算
    if (this.debugGod) {
      this.hp = this.maxHp;
      this.mana = this.maxMana;
    }
    // 旅程上帝模式回满（Main.cs:17711-17715：statLife/statMana/breath 三回满——
    // creativeGodMode 由 GodmodePower 每帧授予 Player.cs:25208-25211；战斗伤害
    // 在 damage() 早退拦截，此处兜 DoT/溺水/摔落直改 hp 的路径）
    if (journeyGodmodeActive()) {
      this.hp = this.maxHp;
      this.mana = this.maxMana;
      this.breath = this.breathMax;
    }

    // Buff tick：自然回复 / 环境 DoT（负值=持续伤害,原版 lifeRegen 路径:无视防御与无敌帧）。
    // 感电移动惩罚开关先行写入（Player.cs:18900 controlLeft||controlRight）——inputX
    // 已由 Game.fixedUpdate 注入（Game.ts:2890 → :2931），此处读到的即本帧输入
    this.buffs.electrifiedMoving = this.inputX !== 0;
    // ---- The Constant 饥饿链上下文注入（Main.dontStarveWorld = seedFlags.theConstant；
    //      remix 组合（"don't dig up"+constant）拉长 332/333 至 28800t；死亡态不推进
    //      ——原版 UpdateDead 无 UpdateBuffs 链。表情 146/147/148 + Hungry 音经回调）----
    this.buffs.dontStarveWorld = !!world.seedFlags?.theConstant;
    this.buffs.hungerPlayerAlive = !this.dead;   // 死亡冻结（UpdateDead 无 UpdateBuffs 链）
    this.buffs.remixHunger = !!(world.seedFlags?.theConstant && world.seedFlags?.remix);
    this.buffs.starvingMaxHp = this.maxHp;
    this.buffs.starvingZoneBoost = !!game.scene?.zoneDesert || !!game.scene?.zoneSnow;
    this.buffs.nebulaLifeLevel = this.nebula[1];   // 星云生命层数（:19220 DoT 全免消费）
    if (!this.buffs.onHungerEvent) {
      this.buffs.onHungerEvent = (kind) => {
        // EmoteBubble.MakeLocalPlayerEmote（:11706/:11726——146 Peckish/147 Hungry/
        // 148 Starving）；333→334 档附 SoundID.Hungry（:11728，Sounds/Custom/hungry）
        if (kind === 'neutral') game.playerEmote?.(146);
        else if (kind === 'hungry') game.playerEmote?.(147);
        else {
          game.playerEmote?.(148);
          game.playSfxWav?.('hungry', 1);
        }
      };
    }
    // ---- 抚摸宠物状态推进（UpdatePettingAnimal :33015-33033——目标漂移/移动键停） ----
    this.updatePettingAnimal();
    // ---- 骸骨头盔幻影（Bone Helm 5100 功能配饰槽 → SpawnHallucination
    //      Player.cs:12823 GrantArmorBenefits → :13627-13656；GrantArmorBenefits 循环
    //      只扫 armor[0-9]（时装槽 10-19 走 ApplyEquipVanity 不触发））----
    this.updateInsanityShadow(game);
    // ---- 眼球伞 5101（armor[0] 头盔或 armor[10] 时装头任一，UpdateEquips :12661 门）
    //      + 水晶鞋 5077（armor[13-19] 时装配饰槽，ApplyEquipVanity :13821 门） ----
    this.updateDontStarveCosmetics(game, world);
    // 魂镰吸魂自持（Player.cs:9555-9558：soulDrain>0 → AddBuff(151, 2)——
    // Game 侧扫描每帧清零再 ++，无 3006 邻域供给即熄）
    if (this.soulDrain > 0) this.buffs.apply(BuffType.SoulDrain, 2);
    const buffHeal = this.buffs.tick(dt);
    // 叶绿孢子 397 玩家侧孢子云发射器（★2026-08-24 r15 R15-19：PL57:26178-26193
    //  chlorophyteSpore && Next(60)==0 → 盒内 Inflated(−2,−2) 掷点,v=velocity×0.5
    //  钳 5 的 SporeCloud 编排；DoT 15 HP/s 已入 Buffs ENV_DOTS。buff 来源 =
    //  敌对/反弹 1127 命中（PC57:12015-12018 StatusPvP,vanilla-statusplayer.json
    //  "1127" 叶子）。粒子形态 spawnParticles 方块近似（与 Enemy.ts:2185 同登记））
    if (this.buffs.active.has(BuffType.ChlorophyteSpore) && Math.floor(Math.random() * 60) === 0) {
      const svx = Math.min(5, Math.hypot(this.vx, this.vy) * 0.5);
      game.spawnParticles(
        this.x + 2 + Math.random() * Math.max(1, this.w - 4),
        this.y + 2 + Math.random() * Math.max(1, this.h - 4),
        '#A8D060', 3, svx || 0.5,
        { life: 40, grav: -0.02, damp: 0.95 },
      );
    }
    if (buffHeal > 0 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + buffHeal);
    else if (buffHeal < 0 && this.hp > 0) {
      this.hp = Math.max(0, this.hp + buffHeal);
      // HurtLifeRegen 飘字（Player.cs:19207-19212）：DoT 分块伤害弹掉血数字,
      // LifeRegen 色 (255,60,70) + dot:true;原版 DoT 不触发受击闪烁/无敌帧/音效
      // ——故不进 damage(),死亡原因仍是 ByOther 默认包
      const dot = this.buffs.consumeDotChunk();
      if (dot > 0) game.addDamageNumber(this.cx, this.y, dot, false, '#FF3C46', true);
      // DoT 致死（:19142-19156 + :19186-19201）：suffocating→ByOther(7)；tongued 已在
      // 自身路径；其余按 :19187 链——vampireBurningInSunlight 优先 VampireBurningInDaylight
      // ByOther(22)（吸血鬼种子日光灼死文案），再 poisoned/venom→9、electrified→10、
      // 默认 Burned(8)（不区分火/毒/流血——含炽热狱石/陨石的灼烧与着火）
      if (this.hp <= 0) this.lastDamageCause = this.vampireBurningInSunlight
        ? { kind: 'vampire' }
        : this.buffs.has(BuffType.Starving)
          ? { kind: 'starved' }   // PlayerDeathReason.ByOther(18)（:19175，饥饿链 2026-08-20）
          : this.buffs.has(BuffType.Suffocation)
            ? { kind: 'suffocated' } : { kind: 'burned' };
    }
    // 恐慌项链加速窗口倒计时（panicTime 单位=tick,dt 秒 ×60 折算——
    // 旧 `-= dt` 把 480t 窗口拉成 480 秒,R5-F26 连带修正）
    if (this.panicTime > 0) this.panicTime = Math.max(0, this.panicTime - dt * 60);
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
    // 自然再生 9 档公式（Player.cs:18925-19089 NaturalLifeRegen eRT 段;2026-08-13
    // 重写——旧"恒 1HP/s"简化致满配回血仅原版 1/3~1/5,续航手感差异根因）。
    // 流血 Bleeding/遮挡 Obstructed 清 lifeRegenTime → 阻断(:18998/:11424);
    // DoT 同清（:18781+）——DoT 期间自然回血重启爬坡
    this.sinceHurt++;
    // 日曜护盾回充（Player.cs ApplySetBonus_Solar :16222-16296 全链：
    //   回充 +1 层时 16×尘6(ArmorSetDye 染料) + AddBuff(170+shields,5)；
    //   盾球环绕轨道 :16258-16283——Y=半径 6 圆×相位(miscCounter/100·2π+l·2π/shields),
    //   X 钉朝向 20px(坐骑 52/54/56/61 推远 50/54/40),vel=(target-pos)×0.2 弹簧）
    if (this.equipStats.solarSet) {
      this.solarCounter++;
      if (this.solarCounter >= 180 && this.solarShields < 3) {
        this.solarShields++;
        this.solarCounter = 0;
        // :16240-16250 层视觉 buff + 16×尘6（noGravity/scale1.7/fadeIn0.5/v×5/套染料）
        for (let j = 0; j < 16; j++) {
          const d = game.vanillaDust?.spawn(this.x, this.y, this.w, this.h, 6,
            0, 0, 100, null, 1.7);
          if (d) {
            d.noGravity = true; d.fadeIn = 0.5;
            d.vx *= 5; d.vy *= 5;
            d.dyeVid = this.armorSetDyeVid();
          }
        }
      }
    } else { this.solarShields = 0; this.solarCounter = 0; }
    // 盾球轨道（:16258-16283）+ buff 对账（:10044-10066：层数变即清多余档,
    // setSolar 在场持续续期 5t；卸套清零）
    {
      const mntType = this.ridingMount ? this.mount.type : -1;
      for (let k = this.solarShields; k < 3; k++) this.solarShieldPos[k].x = this.solarShieldPos[k].y = 0;
      for (let l = 0; l < this.solarShields; l++) {
        const pos = this.solarShieldPos[l], vel = this.solarShieldVel[l];
        pos.x += vel.x; pos.y += vel.y;
        const ang = (this.miscCounter / 100) * Math.PI * 2 + l * (Math.PI * 2 / this.solarShields);
        const tx0 = Math.cos(ang) * 6, ty0 = Math.sin(ang) * 6;   // ToRotationVector2 × 6
        let tx = this.facing * 20;                                 // X 钉朝向（:16269）
        if (mntType === 52) tx = this.facing * 50;
        else if (mntType === 54) tx = this.facing * 54;
        else if (mntType === 56 || mntType === 61) tx = this.facing * 40;
        vel.x = (tx - pos.x) * 0.2;
        vel.y = (ty0 - pos.y) * 0.2;
      }
      const tiers = [BuffType.SolarShield1, BuffType.SolarShield2, BuffType.SolarShield3] as const;
      tiers.forEach((bt, i) => {
        if (this.solarShields > 0 && i + 1 === this.solarShields) this.buffs.apply(bt, 0.5);   // :10046 buffTime=5 持续续期
        else this.buffs.remove(bt);
      });
    }
    // 乘区外 flat lifeRegen 单位缓存（闪亮石静止 +4 :19248;丰盛大餐 +6 :19283-19287;
    // 魂镰 num3 在下方 soulDrainBonus）
    let shinyFlatUnits = 0;
    const heartyFlatUnits = this.buffs.has(BuffType.HeartyMeal) ? 6 : 0;   // 3HP/s
    this.lifeRegenTime += 1 + (this.buffs.has(BuffType.Honey) ? 2 : 0);   // 蜂蜜 +2/t（:18954 加法并列项）
    // 神盾水晶 +0.2/t（★V2a 复核 ⚠️e 勘误：原版 :18930-18934 为【加法独立项】,
    // 曾写成 (1+蜂蜜)×1.2 乘算 → 蜂蜜同挂时 3.6/t vs 原版 3.2/t）
    if (this.usedAegisCrystal) this.lifeRegenTime += 0.2;
    // 坐/睡加成（:19053-19056）：lifeRegenTime +3/tick + 自然回血 ×1.3
    if (this.sitting || this.sleeping) this.lifeRegenTime += 3;
    // 魂镰吸魂（:19237-19240 lifeRegenTime += 2；:19277-19282 num3=(5+n)/2 同时加
    //  lifeRegenTime 与 lifeRegen——R5-F3：旧漏 num3 加 eRT 半边,且把 num3 塞进
    //  num5 吃移动/专家/mHP 乘区,原版是乘区外 flat）
    if (this.soulDrain > 0) {
      this.lifeRegenTime += 2;                       // :19239
      this.soulDrainBonus = Math.floor((5 + this.soulDrain) / 2);  // :19279
      this.lifeRegenTime += this.soulDrainBonus;     // :19280 num3 加 eRT
    } else {
      this.soulDrainBonus = 0;
    }
    if (buffHeal < 0 || this.buffs.dotActiveTick
      || this.buffs.has(BuffType.Bleeding) || this.buffs.obstructed) this.lifeRegenTime = 0;
    if (this.hp > 0 && this.hp < this.maxHp
      && !this.buffs.has(BuffType.Bleeding) && !this.buffs.obstructed) {
      // 闪亮石静止档 flag（UpdateLifeRegen :19061-19064：shinyStone &&
      // IsConsideredStandingStill(:3307 |vx|<0.05&&|vy|<0.05) && itemAnimation==0）。
      // R5-F2：整段（跳档/加速/减伤半/连续加成/×1.1/0.75 档）曾全缺
      const eqS = this.equipStats;
      const shinyStill = !!eqS.shinyStone && Math.abs(this.vx) < 0.05
        && Math.abs(this.vy) < 0.05 && this.itemAnimTicks <= 0;
      // eRT 八档阶梯（:19301-19332）+ 3600 封顶档（:19346-19350;闪亮石静止档改走
      // (RT-3000)/300 连续加成 :19333-19345）
      const rt = this.lifeRegenTime;
      let ert = 0;
      for (const th of [300, 600, 900, 1200, 1500, 1800, 2400, 3000]) if (rt >= th) ert++;
      let num5 = ert;
      if (shinyStill) {
        // :19241-19249：eRT∈(90,1800) 直接跳档 1800；eRT += 4/t；lifeRegen flat +4
        if (rt > 90 && rt < 1800) this.lifeRegenTime = 1800;
        this.lifeRegenTime += 4;
        shinyFlatUnits += 4;
      } else if (rt >= 3600) {
        ert++;                       // :19346-19350 第 9 档（非闪亮石静止档）
        this.lifeRegenTime = 3600;
      }
      // 移动系数（:19360 `velocity.X != 0 && grappling[0] < 0 ? ×0.5 : ×1.25`）——
      // R5-F5：静止判定是【未抓钩】非攀绳;抓钩悬移吃 ×1.25 静止档,站绳移动吃 ×0.5。
      // 旧 `|vx|>0.01 && !onRope` 两处皆反,已修
      num5 *= (this.vx !== 0 && !this.grappling[0]) ? 0.5 : 1.25;
      // 篝火乘区（:19369-19372——本仓篝火为 buff,lifeRegen+1 半边在 Buffs 系,此处为乘区）
      if (this.buffs.has(BuffType.Campfire)) num5 *= 1.1;
      // 闪亮石 ×1.1（:19365-19368——装备即生效,不要求静止）
      if (eqS.shinyStone) num5 *= 1.1;
      // 坐/睡回血 ×1.3（:19351-19355 下半——睡中恒静止吃 1.25 静止档，坐椅同）
      if (this.sitting || this.sleeping) num5 *= 1.3;
      // 闪亮石静止连续加成（:19333-19345）：num6=(eRT-3000)/300 钳 30 并入 num5
      if (shinyStill) {
        const num6 = Math.min(30, (this.lifeRegenTime - 3000) / 300);
        if (num6 > 0) num5 += num6;
      }
      // 专家且未进食 /2（:19373-19376——闪亮石在栏改 ×0.75 档）
      const diff = scaleStatsWorld().difficulty;
      const fed = this.buffs.has(BuffType.WellFed) || this.buffs.has(BuffType.WellFed2) || this.buffs.has(BuffType.WellFed3);
      if (diff >= GDL.EXPERT && !fed) num5 = eqS.shinyStone ? num5 * 0.75 : num5 / 2;
      // mHP 系数（:19381-19382:statLifeMax2/400×0.85+0.15）→ lifeRegen 单位=半HP/s
      num5 *= this.maxHp / 400 * 0.85 + 0.15;
      // R5-F6：逐 tick (int)Math.Round 取整（:19383）——旧 (num5/2)*dt 连续积分
      // 系统性偏快（满血 400 单档静止 1.25→Round 1 = 0.5HP/s,旧 0.625HP/s +25%;
      // 移动低爬坡 0.5→Round 0 = 原版早期零回复）。C# Math.Round = 银行家舍入
      //（2.5→2）,同款实现
      const rf = Math.floor(num5);
      const rd = num5 - rf;
      const rounded = rd > 0.5 ? rf + 1 : rd < 0.5 ? rf : (rf % 2 === 0 ? rf : rf + 1);
      // lifeRegenCount 语义：rounded(num5) + 乘区外 flat（闪亮石静止 +4、丰盛大餐 +6、
      // 魂镰 num3）逐 tick 入账,满 120 单位 = 1 HP（:19384 + :19407-19433）
      this.regenAccum += (rounded + shinyFlatUnits + heartyFlatUnits + this.soulDrainBonus) / 120;
      if (this.regenAccum >= 1) {
        const n = Math.floor(this.regenAccum);
        this.regenAccum -= n;
        this.hp = Math.min(this.maxHp, this.hp + n);
      }
    }
    // 上限收缩时钳制
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    // ---- 魔力自然回复 1:1（Player.UpdateManaRegen :19214-19302）----
    // maxRegenDelay（:24378-24379）：(1−mana/max)×60×4+45 再 ×0.7——用魔越狠惩罚越长
    const smm = this.maxMana;                       // statManaMax2（buff+装备后上限）
    if (this.manaAnimTicks > 0) {
      // 用魔物品动画期：每帧重置 delay（ItemCheck :42131-42137 → ApplyManaRegenDelay
      // :49851-49856；spaceGun+太空枪族 127/4347/4348/514 豁免项本仓无该配饰，恒重置）
      // 1457: 三处置 delay 改调 ApplyManaRegenerationDelay()（:19515-19540）——
      // 内联同公式但带 manaRegenBuff 钳 20f（1456 只在 UpdateManaRegen 每帧钳，
      // 1457 把钳挪到置值时点 → 回蓝 buff 期间施法/快捷 buff 的惩罚期变短）
      this.manaAnimTicks--;
      this.applyManaRegenerationDelay(smm);
    }
    // manaRegenBonus/manaRegenDelayBonus（:18481-18482 每帧清零后由 buff 158 :9629-9632
    // 与魔力斗篷 982 :14379-14383 重算）。★1458：瓶中星 buff 158 的 delayBonus+0.5
    // 已删（1458 Player.cs:10020——手环族堆叠致惩罚期衰减溢出=用武器也满速回蓝的
    // 修复半边;regen+10 保留）;手环族 982/6188/6189 的 delayBonus++ 同批删除
    // （1458 :15044）——1458 删除,数据面已同步清零（vanilla-accfx.json 三键已删,
    // equipStats.manaRegenDelayBonus 恒 0,惩罚期衰减恒 1/tick）
    const mRegenBonus = this.equipStats.manaRegenBonus
      + (this.buffs.has(BuffType.StarInBottle) ? 10 : 0);
    const mDelayBonus = this.equipStats.manaRegenDelayBonus;
    if (this.manaRegenDelay > 0) {
      // 惩罚期衰减（:19545-19557）：基础 1 + delayBonus；静止/抓钩/魔力再生再 −1
      //（R5-F8：原版静止判定 = IsConsideredStandingStill || grappling[0] >= 0,
      // 抓钩悬移吃快速衰减档;旧 onRope 误代——攀绳静止本就落在 |v|<0.05 档）
      this.manaRegenDelay -= 1 + mDelayBonus;
      const still = Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05; // IsConsideredStandingStill :3307
      if (still || this.grappling[0] || this.buffs.manaRegenBuff) this.manaRegenDelay -= 1;
      if (this.usedArcaneCrystal) this.manaRegenDelay -= 0.05;   // :19442-19446
    }
    // 1457: manaRegenBuff 钳 20 从 UpdateManaRegen 移除（:19541-19560 无此段）——
    // 钳制只在置值时点（applyManaRegenerationDelay）发生
    // ★ManaV2 攻击期 5% 滴流（:19563-19567 + :19601-19604,2026-08-21 补批 1 遗漏半边）：
    // flag2 = delay≤0（衰减后）;flag3 = ManaV2 && !flag2 && delay<4 → flag2 强制 true。
    // 攻击期 ItemCheck_ApplyManaRegenDelay（:43143-43146 itemAnimation>0 && item.mana>0
    // 每帧）→ ApplyManaRegenerationDelay 把 delay 恒刷回 4 → 衰减后 3 ∈ (0,4) →
    // num10 ×= 0.05 = 攻击时 5% 产额（官方"攻击时仍以正常速率 5% 恢复"）。
    // 药水"始终最大速率+攻击时也生效"同此支：manaRegenBuff → num9=1 无低蓝惩罚。
    const flag2 = this.manaRegenDelay <= 0;
    const flag3 = !flag2 && this.manaRegenDelay < 4;      // :19563-19567（ManaV2 恒真）
    let manaRegen = 0;
    if (flag2) this.manaRegenDelay = 0;
    if (flag2 || flag3) {
      // 1457 每帧产额（UpdateManaRegen :19568-19605）三改：
      // ①基数 = max/3+manaRegenBonus+1，静止/攀绳/魔力再生档改为【再加全额基数】
      //   （num5 = max/3+bonus+1；1456 只加 max/3）
      // ②存量系数 0.2+0.8×(mana/max) → 0.5+0.5×(mana/max)（空蓝回复 2.5 倍）
      // ③下限钳 manaRegen<2 → =2；且 1456 的 ×1.15 全局乘区被移除（满蓝 -13%）
      const still = Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05;
      const num5 = Math.floor(smm / 3) + mRegenBonus + 1;   // :19571
      manaRegen = num5;
      if (still || this.grappling[0] || this.buffs.manaRegenBuff) manaRegen += num5;  // :19572-19575（抓钩=静止档,R5-F8）
      if (this.usedArcaneCrystal) manaRegen += Math.floor(smm / 50);            // :19577-19580
      const num6 = smm > 0 ? this.mana / smm : 1;                               // :19582
      const num9 = this.buffs.manaRegenBuff ? 1 : 0.5;                          // :19584-19588
      let num10 = num9 + (1 - num9) * num6;                                     // :19592
      if (flag3) num10 *= 0.05;                          // :19601-19604 num11=0.05（攻击期滴流）
      manaRegen = Math.floor(manaRegen * num10);                                // :19599（×1.15 已删）
      if (manaRegen < 2) manaRegen = 2;                                         // :19600-19603 下限（滴流支同样吃 2 下限）
    }
    // 蓄能结算（:19274-19278）：≥120 扣 120 换 1 魔（满魔时也扣——原版同语义）
    this.manaRegenCount += manaRegen;
    while (this.manaRegenCount >= 120) {
      this.manaRegenCount -= 120;
      if (this.mana < smm) this.mana++;
    }
    if (this.manaRegenCount < 0) this.manaRegenCount = 0;  // :25686-25688
    if (this.mana > smm) this.mana = smm;                  // :25690-25693
    // 1457: 叶绿巨剑三连击计数每帧递减（ItemCheck :43161-43163
    // `if (chlorophyteBladeCounter > 0) chlorophyteBladeCounter--`）
    if (this.chlorophyteBladeCounter > 0) this.chlorophyteBladeCounter--;

    // A3（1457 :24823-24860 魔力过热蓝焰尘,2026-08-21 接线）：manaHeat≠1 期间每帧
    // 2 掷,掷中率 = Remap(manaHeat,1.3→1,  rate 1→0) = clamp((manaHeat−1)/0.3)
    // （本地玩家档;他玩家恒 0.3——本仓单本地模型恒走本地档）。尘 267 蓝焰:
    // noLight+noGravity、vx=0、vy=rand×0.5−1.5、fadeIn/scale=0.7+1.3×rand、
    // Color.Blue α200、y+5;CloneDust 伴生白尘 ×0.4 缩放/fadeIn
    if (this.manaHeatMult !== 1) {
      const pool = game.vanillaDust;
      if (pool) {
        const rate = Math.max(0, Math.min(1, (this.manaHeatMult - 1) / 0.3));
        for (let k = 0; k < 2; k++) {
          if (Math.random() * 6 >= rate) continue;
          const d = pool.spawn(this.x, this.y, this.w, this.h, 267, 0, 0, 200,
            { r: 0, g: 0, b: 255, a: 255 }, 1);
          if (!d) continue;
          d.noLight = true;
          d.noGravity = true;
          d.vy = d.vy * 0.5 - 1.5;
          d.vx = 0;
          d.fadeIn = 0.7 + Math.random() * 1.3;
          d.scale = 0.7 + Math.random() * 1.3;
          d.y += 5;
          const d2 = pool.spawn(this.x, this.y, this.w, this.h, 267, 0, d.vy, 200,
            { r: 255, g: 255, b: 255, a: 255 }, d.scale * 0.4);   // CloneDust 伴生
          if (d2) {
            d2.noLight = true;
            d2.noGravity = true;
            d2.vx = 0;
            d2.fadeIn = d.fadeIn * 0.4;
            d2.y = d.y;
          }
        }
      }
    }

    // 液体检测：Collision.WetCollision（Collision.cs:1575-1650）——**中心小盒**：
    // 宽 min(10,w) × 高 min(h/2,h)，以身体中心居中（vector = Center−(num/2,num2/2)）。
    // ★曾误移植为 [身体中心,脚底]×±10 的"下半盒"：wet 翻转点比原版深 ~10px（水面
    //   到脚底才翻）→ 出入水涟漪生成点 center+5 高出水面 ~16px、圆环大半在空气
    //   = 用户实报"角色出入水没涟漪、史莱姆正常"（NPC 侧 npcLiquid.wetCollision 是
    //   正确居中盒故无此症）。2026-08-22 改与 NPC 侧共用同一实现（含坡面格+上液
    //   满高计 :1635-1654 分支——旧手写盒缺该支，坡面涉水判定偏浅）。
    //   居中盒同样解决旧"脚底单点采样"的水下走坡 1-2px 抖动翻转问题。
    const wasInWater = this.inWater;
    {
      const r = wetCollision(world.store, this.x, this.y, this.w, this.h);
      // :1418 wet 只认 !lava && !shimmer(蜜算 wet);岩浆里不能"游泳"
      this.inWater = r.wet && !this.inLava;
      this.inHoney = r.honey;
    }
    // 入水/出水瞬间：水花尘 + 水花声（Player.cs:27464-27636,2026-08-20 补齐——
    // 曾只播入水声、零粒子=用户报"入水出水效果非常轻微且出水几乎没有"）
    // 原版两方向都出 50 颗 dustWater 尘(水样=33,岩浆样=35,微光=308,蜜=152)+
    // SoundID 19(splash);入水 vy−3 / 出水 vy−4、vx×2.5、scale 0.8、α100、无重力
    if (this.inWater !== wasInWater && this.wetCount === 0) {
      const exiting = !this.inWater;
      // 原版矩形分布(Player.cs:27504-27509):NewDust(position.X−6, y+h/2−8,
      // width+12, 24, dustWater())——盒内随机出生,vy−3/−4 上踢+vx×2.5 横散
      const bx = this.x - 6, by = this.y + this.h / 2 - 8;
      const bw = this.w + 12, bh = 24;
      const upKick = exiting ? -0.15 : -0.12;
      const color = this.inHoney ? '#D4A017' : this.inLava ? '#FF6600' : '#4A9EFF';
      const count = this.inHoney ? 20 : 50;
      for (let i = 0; i < count; i++) {
        const dx = bx + Math.random() * bw;
        const dy = by + Math.random() * bh;
        game.spawnParticles(dx, dy, color, 1, 2.5, { life: 30, damp: 0.97, grav: upKick });
      }
      game.playSfx('splash');
    }
    // wetCount 去抖（Player.cs:27464-27466 入水置 10 / :27558-27560 出水置 10 /
    // :27649-27651 每 tick 递减）——水波系统涟漪尺寸因子消费
    if (this.inWater && !wasInWater && this.wetCount === 0) this.wetCount = 10;
    else if (!this.inWater && wasInWater && this.wetCount === 0) this.wetCount = 10;
    const centerIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 4) / TILE));
    // waterWalk 时缩高 6px 判定(原版 num80,Player.cs:27349/27352:水面行走不因脚尖触浆受伤)
    // 水上行走（装备 waterWalk 族 ∪ 水上行走药水 buff 15,:9706）
    const canWaterWalk = this.equipStats.waterWalk || this.buffs.canWaterWalk;
    const lavaProbeH = canWaterWalk ? this.h - 6 : this.h;
    this.inLava = liquidCollision(world.store, this.x, this.y, this.w, lavaProbeH, 2); // LavaCollision 盒判定
    // Wet 103：浸岩浆即刻移除（UpdateBuffs :11335-11338 `if (lavaWet) DelBuff(j)`——
    // 岩浆蒸干一身水。★须在 inLava 判定同帧执行（原版 Collision 先于 UpdateBuffs），
    // 放 buffs.tick 前会因 inLava 滞后一帧）
    if (this.inLava && this.buffs.has(BuffType.Wet)) this.buffs.remove(BuffType.Wet);
    // 蜂蜜浸入（Player.cs:27436：Collision.honey 命中 → AddBuff(48, 1800t=30s) + honeyWet）。
    // 判定 = Collision.WetCollision（Collision.cs:1573-1625）：**全身盒**扫蜂蜜格且
    // liquid>0（任一残量即算）——曾只查脚底单格且 liq>30，脚不沾蜜但身体没入时漏判。
    // BuffState.apply 是 max 合并（AddBuff 语义），浸着恒 30s，离开后自然倒计时
    this.inHoney = liquidCollision(world.store, this.x, this.y, this.w, this.h, 3);
    if (this.inHoney) this.buffs.apply(BuffType.Honey, 30);
    // 微光浸入（Player.cs:27420-27434）：shimmerWet + 地狱层之上 → AddBuff(353, 60t=1s)。
    // shimmerImmune（:14981 原版旗标来源未移植）恒 false；地狱层内不授予
    // （:27430 采样处即有 position.Y/16 < UnderworldLayer 门）
    // Main.UnderworldLayer = maxTilesY-200（Main.cs:2863 恒 h-200，SceneMetrics.ts 同源）——
    // 非 world.lavaLine（本仓岩浆线 ≈(rockLayer+h)/2 生成参数，比 h-200 浅 ~170 格，
    // 误用会提前关闭地狱层门）
    const underworldLayer = world.h - 200;
    this.inShimmer = world.store.liquidType[centerIdx] === 4
      && world.store.liquid[centerIdx] > 30;
    // 授予采样（:27426-27433）与 shimmerWet 盒判定不同位：外门 = Collision.shimmer
    // 盒命中（inShimmer 近似），内采样另取【顶格】(Center.X/16, (position.Y+1)/16) 的
    // shimmer() 旗标——该旗标只看液体类型不看液量（同句 liquid>=0 恒真），浅浸即授予；
    // 曾沿用脚格 + liq>30 → 顶格 1 单位微光时不授予（修正：浅浸过量授予的反向漏授）。
    // 顶格越界（y<0）读 undefined !== 4 = 原版 Main.tile[负] null 短路，同语义
    const topIdx = world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + 1) / TILE));
    if (this.inShimmer && world.store.liquidType[topIdx] === 4
      && this.y / TILE < underworldLayer) this.buffs.apply(BuffType.Shimmered, 1);
    // buff 353 处理段（Player.cs:11381-11419）：buff 在 → shimmering=true + frozen
    // 封输入（下方移动积分前的 Frozen∪Shimmering 清零段消费）+ fallStart 重置（免摔伤）。
    // 注意：本 tick 内 DelBuff 后 shimmering 保留到下 tick 才复位（原版 :18168 帧首
    // shimmering=false、buff 循环内置位——同帧移除不撤销本帧穿落）
    if (this.buffs.has(BuffType.Shimmered)) {
      this.shimmering = true;
      this.fallStartY = null;
      if (this.y / TILE > underworldLayer) {
        // 地狱层门（:11391-11397）position.Y/16 > UnderworldLayer → DelBuff
        this.buffs.remove(BuffType.Shimmered);
      } else if (this.inShimmer) {
        // 浸液中（:11399-11402）：buffTime=60t=1s 刷新（穿落全程浸着恒续期）
        this.buffs.apply(BuffType.Shimmered, 1);
      } else {
        // 穿落落点检查（:11403-11419）：逐格扫玩家盒覆盖的全部 tile——
        // 任一实心（SolidTile3）→ buffTime=6t=0.1s 继续穿落；全非实心 →
        // DelBuff 实体化（此刻悬/站在该容纳空间，下 tick 起恢复常规碰撞）
        let inSolid = false;
        const sx0 = Math.floor(this.x / TILE), sx1 = Math.floor((this.x + this.w) / TILE);
        const sy0 = Math.floor(this.y / TILE), sy1 = Math.floor((this.y + this.h) / TILE);
        outer: for (let sy = sy0; sy <= sy1; sy++) {
          for (let sx = sx0; sx <= sx1; sx++) {
            if (world.store.inBounds(sx, sy) && world.store.isSolid(sx, sy)) { inSolid = true; break outer; }
          }
        }
        if (inSolid) this.buffs.set(BuffType.Shimmered, 0.1);
        else this.buffs.remove(BuffType.Shimmered);
      }
    } else {
      this.shimmering = false; // 帧首复位（:18168 shimmering=false 语义）
    }
    if (this.wetCount > 0) this.wetCount--;   // Player.cs:27649-27651
    // shimmerTransparency（Player.cs:18147-18162）：shimmering +0.015/t 钳 0.8；
    // 解除后 -0.015/t 回 0，衰减起始帧（恰 0.8）播 Sound 19 style 3
    // （本作 sfx 库无独立 style 3 样本，shimmerSplash 近似）
    if (this.shimmering) {
      this.shimmerTransparency = Math.min(0.8, this.shimmerTransparency + 0.015);
    } else if (this.shimmerTransparency > 0) {
      if (this.shimmerTransparency >= 0.8) game.playSfx('shimmerSplash', 1, this.cx, this.cy);
      this.shimmerTransparency = Math.max(0, this.shimmerTransparency - 0.015);
    }
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
    // 纯视觉字段：Renderer 水下色调滤镜/调试面板在用。溺水判定已走 drownCollision
    // （CheckDrowning 1:1），勿以此字段做机制决策
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
        // 玫瑰族 lavaRose（:27384-27387）：岩浆伤 num81 80-45=35、OnFire num82 420-210=3.5s
        const lavaDmg = this.equipStats.lavaRose ? 35 : 80;
        // cooldownCounter=ImmunityCooldownID.Lava(4)——日曜盾消耗门 Counter 集
        // {General,BossNoCheese} 不含 Lava（R5-F23,Player.cs:2675 岩浆段不耗盾）
        if (this.damage(lavaDmg, this.cx, this.y - 10, false, false, 4)) {
          this.buffs.apply(BuffType.OnFire, this.equipStats.lavaRose ? 3.5 : 7);
          game.playSfx('hurt');
          game.addDamageNumber(this.cx, this.y, this.damagePreview(lavaDmg), false, '#FF6020');
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
    // 冷水（专家雪原）：wet 且非岩浆/蜂蜜 → Chilled(46) 150t（Player.cs:27692-27695）；
    // arcticDivingGear（1861 极地潜水装备）免疫。environmentBuffImmunityTimer
    // （十字盾族 :27692 第 6 门）本作未实装 → 恒 0 语义
    if (world.isExpert && game.scene?.zoneSnow && this.inWater && !this.inLava && !this.inHoney
      && !this.equipStats.arcticDivingGear) {
      this.buffs.apply(BuffType.Chilled, 2.5); // AddBuff(46,150)=2.5s max 合并 = 浸着恒挂
    }
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
    // 尖刺/木尖刺/荆棘族直接伤害 + 流血,陨石/狱石族 Burning,沙族窒息,荆棘族触碰毁块。
    // 骑矿车时按坐骑盒采样（Mount.cs mounts[6]：玩家 hitbox 即车 20×52，
    // heightBoost 10——用 20×42 玩家盒会漏掉车底 10px,贴轨尖刺扫不到）
    const rideBox = this.ridingCart && this.cart
      ? { x: this.cart.x, y: this.cart.y, w: this.cart.w, h: this.cart.h }
      : null;
    const ht = hurtTiles(world.store, rideBox?.x ?? this.x, rideBox?.y ?? this.y,
      rideBox?.w ?? this.w, rideBox?.h ?? this.h,
      this.equipStats.fireWalk || this.buffs.obsidianSkin); // 黑曜石皮含 fireWalk（:9576）
    if (ht) this.applyTouchDamage(game, ht);

    // ---- CheckDrowning 1:1（Player.cs:22914-23002，本地玩家门 = Main.myPlayer==whoAmI）----
    // 原版 flag = DrownCollision（Collision.cs:1385：头部盒判定，**蜂蜜也淹**，
    // 只排岩浆/微光——旧实现只认水是错的）
    let drown = drownCollision(world.store, this.x, this.y, this.w, this.h,
      this.gravDir === -1 ? -1 : 1);
    // 鱼缸头盔（armor[0]∈{250,4275}，:22917）：恒淹（戴着鱼缸无法呼吸）
    const headVid = (() => {
      const d = ITEM_DEFS[this.inv.armor[0]?.id ?? -1];
      return d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    })();
    if (headVid === 250 || headVid === 4275) drown = true;
    // 芦苇管出水口（:22920-22945）：非挥舞中时采样头顶 44px 前偏 6px 格，
    // 该格液体<128 且非实心 → 不淹（管口在水面上）。原版整段 try/catch 吞越界
    if (this.hasBreathingReed && this.itemAnimTicks === 0) {
      const rx = Math.floor((this.x + this.w / 2 + 6 * this.facing) / TILE);
      const ry = Math.floor((this.y + (this.gravDir === -1 ? this.h : 0) - 44 * this.gravDir) / TILE);
      if (world.store.inBounds(rx, ry)) {
        const ri = world.store.idx(rx, ry);
        if (world.store.liquid[ri] < 128
          && (!world.store.isActive(rx, ry) || !world.store.isSolid(rx, ry) || world.store.isPlatform(rx, ry))) {
          drown = false;
        }
      }
    }
    // gills（:22946-22949）：普通世界免淹；ftw 种子（getGoodWorld）语义翻转——
    // flag = getGoodWorld && !flag（鱼鳃在 ftw 下反而水下不淹、水上淹）
    if (this.buffs.gills) drown = world.seedFlags.getGoodWorld ? !drown : false;
    if (this.shimmering) drown = false;  // :22950-22952 微光化不淹
    // mount.Type==4 海龟坐骑免淹（:22953）——坐骑系统已实装，接线
    if (this.ridingMount && this.mount.type === 4) drown = false;
    if (this.equipStats.merman) {        // :22957-22964 accMerman：水中不耗气并人鱼化
      if (drown) this.merman = true;
      drown = false;
    } else {
      this.merman = false;
    }
    if (drown) {
      this.breathCD++;
      if (this.breathCD >= this.breathCDMax) {
        this.breathCD = 0;
        this.breath--;
        if (this.breath === 0) game.playSfx('drown'); // SoundID 23，恰减到 0 那轮播一次
        if (this.breath <= 0) {
          this.breath = 0;
          this.lastDamageCause = { kind: 'drowned' }; // PlayerDeathReason.ByOther(1)
          // statLife -= 2 直伤（:22981-22991）：不过防御/不吃无敌帧，不走 damage()
          this.hp -= 2;
          if (this.hp <= 0) this.hp = 0; // KillMe(ByOther(1),10) 交由下方统一死亡结算
        }
      }
    } else {
      this.breath = Math.min(this.breathMax, this.breath + 3); // :22995-23000 每 tick +3
      this.breathCD = 0;
    }
    // 溺水口部气泡尘（CheckDrowning 尾段 :23003-23035）：drowning 且非岩浆/蜂蜜时
    // 1/20 概率在口部出 dust 34（scale 1.2,盒 w-8×8）；芦苇管时移到管口上方 58px
    // （mount 52/54 MouthPosition 分支本作无坐骑,省略）。本仓粒子为程序化圆,
    // 浅蓝近似 dust 34 视觉(sprite 粒子系统未实装)
    if (drown && !this.inLava && !this.inHoney && Math.random() < 1 / 20) {
      const num4 = this.gravDir === -1 ? this.h - 12 : 0;
      let mx = this.x + 12 * this.facing;
      let my = this.y + num4 + 4 * this.gravDir;
      if (this.hasBreathingReed) { mx += -2 * this.facing; my += -58 * this.gravDir; }
      game.spawnParticles(mx + Math.random() * (this.w - 8), my + Math.random() * 8,
        '#BFE3FF', 1, 0.2, { life: 30, grav: -0.03, size: 2 });
    }

    // ---- 眼睑状态机（PlayerEyeHelper.Update，Player.cs:25812 每 tick；死亡态不更新
    //      ——原版 dead 早退到 UpdateDead，无该链） ----
    if (!this.dead) {
      if (this._deathPartsInit) this._deathPartsInit = false;  // 重生复位（respawnPlayer 在 Game 侧）
      this.updateEyeState(game);
    }

    // 死亡等待重生（任何死法统一在此发声——溺水/岩浆/摔落/受击都经过这里）
    if (this.hp <= 0) {
      if (!this.dead) {
        game.playSfx('pkilled');
        this.dead = true;
        game.recLog?.('death', { hp: 0 });   // 行为录制：玩家死亡（任何死法统一在此结算）
      }
      // 初速掷骰用独立标记：Game.damagePlayer 接触死路径会先直置 dead（Game.ts:15360）
      // ——不能拿 !dead 当 init 门；首 tick 只掷不推进（原版 KillMe 在 Hurt 中段置 dead，
      // 物理自下一 tick UpdateDead 起）
      if (!this._deathPartsInit) {
        this._deathPartsInit = true;
        this.initDeathParts();          // KillMe :38287-38298 三段初速
      } else {
        this.updateDeathParts(game);    // UpdateDead :16878-16888 翻滚解体
      }
      this.updateSunScorchValues(game);  // UpdateDead 尾（Player.cs:16928）：死亡档衰减 −2
      // 1457 UpdateDead 新增重置（Player.cs:17109-17110）：manaSick=false、manaHeat=1f
      // （新机制字段随死亡归零；1456 无此两行。本仓 manaSick=buff 载体 → 同步摘除）
      this.buffs.remove(BuffType.ManaSickness);
      this.manaHeat = 1;
      this.slowMagicUse = false;
      return;
    }
    // UpdateSunScorch 调用点（Player.Update :25349，UpdateEquips(i) 后一行——
    // 本仓 fixedUpdate 中段，先于下方首个 equipStats 读取，等价原版
    // UpdateEquips→UpdateSunScorch→UpdateArmorSets 帧内序）
    this.updateSunScorch(game);

    // 水平（敏捷 Buff 提速 + 装备移速（赫尔墨斯靴族 runSpeed/词缀 73-76）；蜂蜜比水更黏滞）
    const eqEarly = this.equipStats;
    // ---- 折叠凳（UpdatePortableStoolUsage :28727-28739 1:1；原版每 tick
    //      ResetEffects 清 IsInUse+ResizeHitbox 回 42 后按条件重长）----
    if (this.stoolInUse) { this.y += Player.STOOL_BOOST; this.h -= Player.STOOL_BOOST; this.stoolInUse = false; }
    if (eqEarly.stepStool && this.inputUp && !this.ridingMount
      && this.vx === 0 && this.vy === 0
      && !this.grappleProjs.some((g) => g.latched)
      && this.canFitSpaceUp(Player.STOOL_BOOST, world.store)) {
      this.y -= Player.STOOL_BOOST;
      this.h += Player.STOOL_BOOST;
      this.stoolInUse = true;
    }
    // 沙丘行者靴地板旗标（FloorVisuals :23434-23471 + GetFloorTile :23481-23509）：
    // vy==0 时取脚下一行的 x/x−1/x+1 首个 active+solid 格，属沙族地格即 runningOnSand
    // （TileID.Sets.Conversion Sand{53,112,116,234}/HardenedSand{397-399,402}/
    // Sandstone{396,400,401,403}，TileID.cs:30-34）。原版只在 vy==0 时刷新、离地不清零
    // （ResetFloorFlags 仅重生/传送调用）——空中保留加成，同语义
    if (this.vy === 0 && !this.ridingCart) {
      const st0 = world.store;
      const fx0 = Math.floor(this.cx / TILE), fy0 = Math.floor((this.y + this.h) / TILE);
      let ft = -1;
      for (const d of [0, -1, 1]) {
        const xx = fx0 + d;
        if (!st0.inBounds(xx, fy0)) continue;
        const ii = st0.idx(xx, fy0);
        if (st0.flags[ii] && st0.isSolid(xx, fy0)) { ft = st0.type[ii]; break; }
      }
      // 坡面门（FloorCheck :23466-23471：脚下三格任一有 slope → num3=-1，slippy 等地板旗全灭）
      if (ft >= 0 && (st0.slope[st0.idx(fx0 - 1, fy0)] !== 0 || st0.slope[st0.idx(fx0, fy0)] !== 0
        || st0.slope[st0.idx(fx0 + 1, fy0)] !== 0)) ft = -1;
      this.floorTileT = ft;
      this.runningOnSand = ft >= 0 && SAND_FLOOR_IDS.has(ft);
    }
    // 沙丘行者靴 1:1（Player.cs:26225-26231）：runningOnSand && desertBoots →
    // maxRunSpeed/accRunSpeed/runAcceleration/runSlowdown 全部 ×1.75（原版是乘区，
    // 非 ZoneDesert 门——曾按 zoneDesert+0.25 定值近似）。speedMult 同时乘加速与
    // 限速 = 前三者的复合；runSlowdown ×1.75 以摩擦指数 1.75 等价（乘法摩擦下
    // 每帧减量 ∝ 1−f^n）
    const duneBoost = eqEarly.desertBoots && this.runningOnSand;
    // 1457: 移动减速 debuff 折算 strongestMoveSpeedDebuff（Update :26204-26210
    // moveSpeed *= strongestMoveSpeedDebuff → runAcceleration/maxRunSpeed 随之）——
    // 取最强单项不叠加（1456 else-if 乘法链在 Buffs.moveSpeedMult，已迁出）
    // D2（2026-08-21）：盾举并入（:26155-26162 shieldRaised → min(1/3)）——Buffs
    // getter 无 Player 访问,在此合成（maxRunSpeed getter :3816 同式）
    const strongestSlow = Math.min(this.buffs.strongestMoveSpeedDebuff, this.shieldRaised ? 1 / 3 : 1);
    // 1457 :26156-26161 盾举侧效：地面(vy==0)且 |vx|>3 → vx 每帧减半（Update 段、
    // 无 dashDelay 门——冲刺滑行期举盾同样制动）。原版盾举态每帧 Update 重算
    if (this.shieldRaised && this.vy === 0 && Math.abs(this.vx) > 3) this.vx /= 2;
    const speedMult = this.buffs.moveSpeedMult * this.equipStats.moveMult * (this.inHoney ? 0.5 : 1)
      * (this.vortexStealthActive ? 0.3 : 1)   // 星璇潜行移速 ×0.3（1457 Player.cs:26046-26047
                                              // vortexStealthActive 全程生效,无 stealth 门——
                                              // 旧 `&& stealth>0` 系 0/1 语义反写期产物,满潜行
                                              // 后移速惩罚反而消失,1456 :25563-25564 同无门）
      * (duneBoost ? 1.75 : 1)
      * strongestSlow;
    // 冰冻 Frozen(47,Player.cs:9749 frozen=true) ∪ 微光化 buff 353（:11381-11388
    // frozen=true 同语义）：整帧封移动输入——跳跃/攀绳/矿车同读这些标志,一并归零
    // （原版 Update 段 control* 清零语义,发生在移动积分之前）。帧末由 Game 重灌输入。
    // ★必须在水平积分（下方 const ix = this.inputX 消费点）之前执行：矿车/装备聚合
    // 重写曾把清零挪进 else-if 链的 shimmering 物理分支（位于积分之后）——清零形同
    // 虚设,微光中仍可自由行走（2026-08 回归）
    if (this.buffs.has(BuffType.Frozen) || this.shimmering || this.buffs.has(BuffType.Stoned)) {
      // 石化(156)与冰冻同段清输入（:24942 control* 清零——石化还额外清 useItem/useTile,
      // 我们输入模型只有四键,同 frozen 处理）
      this.inputX = 0; this.inputJump = false; this.inputUp = false; this.inputDown = false;
    } else if (this.buffs.has(BuffType.Confused)) {
      // 困惑(31)：控制轮换（Player.cs:24683-24690 字面复刻,含原版 Up←交换后Right 的
      // 怪癖——flag2=L,flag3=Up; L=R; R=flag2; **Up=R(新)**; Down=flag3）
      const wasLeft = this.inputX < 0, wasRight = this.inputX > 0;
      const wasUp = this.inputUp;
      const newRight = wasLeft;
      this.inputX = wasRight ? -1 : newRight ? 1 : 0;   // L←R / R←L
      this.inputUp = newRight;                          // Up←R(新)（原版怪癖同款）
      this.inputDown = wasUp;                           // Down←Up
    }
    // 石化变身瞬间（:24924-24931 stoned != lastStoned 过渡）： Hurt(20×敌伤倍率, ByOther(5))
    // + SoundID 0 + 20 尘——死因 = DeathText.Petrified_1..4（"X碎成渣了"）
    {
      const stonedNow = this.buffs.has(BuffType.Stoned);
      if (stonedNow !== this.lastStoned) {
        if (stonedNow) {
          this.lastDamageCause = { kind: 'petrified' };
          this.damage(getAttackDamageScaledByDifficulty(20, mainDifficulty(game.world)), this.cx, this.cy - 10, false);
          game.playSfx('hurt');
          game.spawnParticles(this.cx, this.cy, '#9A8FA0', 20, 2.2);
        }
        this.lastStoned = stonedNow;
      }
    }
    // 睡中移动/跳跃/下移/上坐骑输入 → 起床（SH:103-105 controlLeft/Right/Up/Down/
    // Jump/pulley/mount → StopSleeping；须在物理锁【之前】判，睡中不响应移动）
    if (this.sleeping
      && (this.inputX !== 0 || this.inputJump || this.inputUp || this.inputDown
        || this.ridingMount)) {
      this.sleeping = false;
    }
    // 坐椅/睡床（isLockedToATile Player.cs:3858-3868）：重力/常规移动锁死——velocity
    // 恒 0（原版坐/睡态不跑 SlopingCollision 输入侧；锚点钉在座位/床锚）。buff/液体/
    // 受伤照常。★sleeping 曾漏在条件外——睡中重力/移动链照跑（按方向键"边睡边走"）
    if (this.sitting || this.sleeping) {
      this.vx = 0; this.vy = 0;
      this.onGround = true;
      if (this.sitting) this.sitTicks++;
      return;
    }
    // 矿车骑乘（mount.Cart 语义）：移动/跳跃/重力/碰撞全部由 Minecart 实体接管
    //（原版 Player.Update :27783-27850 的 TrackCollision 段替代常规移动链）。
    // 上面的 buff/液体/受伤逻辑照常 tick；位置每 tick 由矿车回写。
    if (this.ridingCart) {
      this.vx = 0; this.vy = 0;
      this.onGround = true;
      this.fallStartY = null;
      this.pulley = false;   // mount.Active → pulley=false（:25815-25818——早退路径
                             // 跳过下方维护段，此处直清防下车残留悬挂态）
      return;
    }
    // ---- 非矿车坐骑每 tick 维护（Mount.cs 1:1）----
    // 能量/疲劳恢复 + 地面飞行时量回充（:26538 ResetFlightTime）+ hover 起始
    //（:26416）+ 帧态机分派（:35745-35790）。冻结/石化/蛛网控场强制下坐（:26556）
    if (this.ridingMount) {
      if (this.buffs.has(BuffType.Frozen) || this.buffs.has(BuffType.Stoned) || this.buffs.has(BuffType.Webbed)) {
        // 坐骑抚摸随下坐终止（Mount.Dismount :6219-6222 petting.mount → Stop）
        if (this.petting.mount) this.stopPettingAnimal();
        this.mount.dismount(this, game);
      } else {
        this.mount.upkeep(this);
        // 能力维护（Player.cs:25373 UpdateEffects 能力子集）：猪鲨崽计数器/增益 +
        // Scutlix 索敌-充能-开火。须在 upkeep 后、hover 消费前（fishronBoost 本 tick 新鲜）
        this.mount.updateMountEffects(this, this.mountEffectsCtx(game));
      }
    }
    const ix = this.inputX;
    // ---- pulley 绳索悬挂（Player.cs:25801-25808 ropeCount/FindPulley 调用点 +
    //      :25813-25976 状态机的可达子集）。门 1:1 除 controlJump（本仓 inputJump
    //      并含 W/↑ 攀爬键，照抄会连坐拦截进态——Space-only 不触发，等价原版
    //      controlUp≠controlJump 分离）；tongued = 狂卷之舌 buff 38 ----
    if (this.ropeCount > 0) this.ropeCount--;                            // :25801-25804
    const ccPulley = this.buffs.has(BuffType.Frozen) || this.buffs.has(BuffType.Stoned)
      || this.buffs.has(BuffType.Webbed);
    if (!this.pulley && !ccPulley && this.gravDir === 1 && this.ropeCount === 0
      && !this.grappling[0] && !this.buffs.has(BuffType.TheTongue) && !this.mount.active) {
      this.findPulley(world.store);                                      // :25805-25808
    }
    if (this.pulley) {
      if (this.mount.active) this.pulley = false;                        // :25815-25818 上坐骑即离绳
      if (this.vx !== 0) this.pulley = false;                            // :25942-25945 击退/横移即离
      const num29 = Math.floor((this.x + this.w / 2) / TILE);            // :25821 头心列
      const num30 = Math.floor((this.y - 8) / TILE);                     // :25822 头格行
      if (!this.isRopeAt(world.store, num29, num30)) this.pulley = false; // :25946-25953 头格脱绳
      if (this.gravDir !== 1) this.pulley = false;                       // :25954-25957
      if (ccPulley) this.pulley = false;                                 // :25958-25961
      if (this.grappling[0]) this.pulley = false;                        // :25973-25976 抓钩优先
      // 左右离绳（:25930-25941）：非上爬中 + 按左右 → pulley=false + vx=±1。
      // 原版门要求按键边沿（releaseLeft/Right——本仓玩家无左右键边沿追踪，持键
      // 即离；按住上爬期间不触发与原版一致）
      if (this.pulley && !this.inputUp && this.inputX !== 0) {
        this.pulley = false;
        if (this.vx === 0) this.vx = Math.sign(this.inputX);
      }
      if (this.pulley) {
        // X 钉绳列（:26138-26152）：pulleyDir 0/1=列中心、2=中心+6·direction
        //（:25824-25827 首帧归一 0→1）
        if (this.pulleyDir === 0) this.pulleyDir = 1;
        let num37 = num29 * TILE + 8 - this.w / 2;
        if (this.pulleyDir === 2) num37 = num29 * TILE + 8 - this.w / 2 + 6 * this.facing;
        this.x = num37;
      }
    }
    // :19546-19556 门：itemAnimation 窗内仅 useTurn 物品允许移动改朝向
    // （动画窗代理 = itemAnimTicks>0 || useTime>0——非挥砍武器以 useTime 计窗）
    const animBusy = this.itemAnimTicks > 0 || this.useTime > 0;
    // Scutlix/Santank 瞄准中锁朝向（Player.cs:19549 flag3 的 AllowDirectionChange 门；
    // 声明在冲刺分支外——滑行段的改向门同样消费）
    const mountAllowDir = !this.ridingMount || this.mount.allowDirectionChange;
    // pulley 悬挂期 HorizontalMovement 整段不跑（Player.cs:26366 在 pulley else
    // 分支内）——只保留朝向翻转（:25842-25851，pulleyDir 1 居中档按反方向键翻面）
    if (this.pulley) {
      if (this.pulleyDir === 1) {
        if (this.facing === 1 && this.inputX < 0) this.facing = -1;
        if (this.facing === -1 && this.inputX > 0) this.facing = 1;
      }
    } else
    // 冲刺滑行期（dashDelay<0）常规加速/摩擦/限速整体跳过——Run 各分支 dashDelay>=0 门
    // （Player.cs:19559/:19575/:19675/:19705），速度由 DashMovement 阻尼段独占
    if (this.dashDelay >= 0) {
      // ---- 原版两段加速模型（Player.cs:19559-19800 HorizontalMovement Run 段）----
      // maxRunSpeed=3×moveSpeed（常规上限）;accRunSpeed=6（靴族 6/6.75,冲刺爬坡上限）
      // 全速段（:19559:|vx|<maxRun）runAcceleration=0.08 全力;慢爬坡段（:19675:
      // maxRun≤|vx|<accRun）仅 ×0.2 且需 onGround(vy==0)或翼飞行——空中爬坡无效;
      // 翼飞行再 +0.2 一份（:19690）。无输入减速（:19771）:地面 runSlowdown=0.2
      // 空中 ×0.5,加法钳 0（旧乘法摩擦曲线高速段衰减过快）。
      // 1457: 慢速/燃烧爬坡门已删（:20091/:20121），Chilled 压 accRun 门改
      // oldStyleParkour-only（:19901）——减速统一折入 strongestMoveSpeedDebuff
      const mnt = this.ridingMount ? this.mount : null;   // 坐骑参数接管（Player.cs:26310-26334）
      // ★水中不缩 Run 参数：原版 reset(:24096-24099)/moveSpeed 乘区(:25694-25695)/
      // 装备链(:26184-26300) 全链无任何 wet 因子——水中减速全在位移积分层
      //（:27874-27888 WetCollision：位移 ×0.5/蜜 0.25/微光 0.375，见下方 liqFactor 段）。
      // 旧 `inWater→maxRun×0.55` 是自造速度模型：accRun 不缩 → 裸装水中爬坡带
      // [1.65,3) 非空 → 尘门 vx>(3+1.65)/2=2.325 可越 → 跑尘+脚步声误触发（2026-08-17 修）
      let maxRun = PLAYER_WALK_MAX * speedMult;
      // accRunSpeed 定值不随 moveSpeed（:25694-25695 只乘 runAcceleration/maxRunSpeed
      // ——旧误乘 speedMult,2026-08-13 修）。裸装基准 = 3：原版每 tick reset
      // :24099 accRunSpeed = maxRunSpeed（reset 时 maxRunSpeed 尚为裸值 3，moveSpeed
      // 乘区在其后）；6/6.75 是靴族 equip 覆写。曾 `|| 6` = 裸装极速翻倍 6 px/t
      // （30mph vs 原版 15mph，2026-08-16 默认移速审计修）
      let accRun = this.equipStats.accRunSpeed || 3;
      // 1457: accRunSpeed 也吃减速 debuff（Update :26207-26210 accRunSpeed *=
      // strongestMoveSpeedDebuff，oldStyleParkour 豁免——本仓无 6190 老派跑酷书恒吃）；
      // 1456 的 `chilled → accRunSpeed = maxRunSpeed` 门改为仅 oldStyleParkour
      // （HorizontalMovement :19901-19903）——本仓无该配饰，Chilled 不再压跑步上限
      accRun *= strongestSlow;
      if (mnt) {
        // :26329-26331：mounted 时 maxRun=RunSpeed / accRun=DashSpeed / runAcc=Acceleration
        //（CanUseWings 族走 Math.max 分支省略——本仓坐骑恒禁翼）。
        //  RunSpeed 含每坐骑特例（蜜蜂空中+4×(1-疲劳)、猪鲨崽空中+13.5、游泳态→swimSpeed）
        maxRun = mnt.runSpeed();
        accRun = mnt.dashSpeed;
      }
      // 翼飞行横移加速倍率（WingAirLogicTweaks :28838-28862：悬浮档
      // runAcceleration *= DownHoverAccelerationMult :28852,常规档
      // *= AccRunAccelerationMult :28856——26/45/29/32/30/31/37/44 档 ×1.5-4.5,
      // 其余 ×1。vanillaWingStats 表齐全但此前零消费,2026-08-22 审计系统性批接）
      let wingAccMul = 1;
      if (!this.onGround && this.equipStats.wing && this.vy !== 0) {
        const ws = wingStatOf(this.equipStats.wing.logic);
        const hoverDownMove = this.inputDown && this.inputJump && ws.hover && this.wingTime > 0;
        maxRun = Math.max(maxRun, hoverDownMove && ws.hoverSpeed > 0 ? ws.hoverSpeed : ws.accSpeed);
        accRun = maxRun;                                  // 翼空中横移上限覆盖(原 WingAirLogicTweaks)
        wingAccMul = hoverDownMove ? ws.hoverAccelMult : ws.accelMult;   // :28852/:28856
      }
      let runSlow = RUN_SLOWDOWN * this.equipStats.runSlowMul;   // 暗影套 ×1.75(:26195-26201)
      // 沙丘行者靴:四参数全 ×1.75（Player.cs:26226-26232——maxRun/accRun/acc/slowdown）
      if (duneBoost && !mnt) { maxRun *= 1.75; accRun *= 1.75; }
      // D3（1457 :26206 runAcceleration *= moveSpeed）：步行支加速度也吃 moveSpeed
      // 乘区——构成 = moveSpeedMult×装备 moveMult×strongestSlow（含盾举,上方合成）。
      // ★勿整乘 speedMult：inHoney 0.5/星璇潜行 0.3 是场景因子,原版不走 moveSpeed 链
      // （蜜减速在位移积分层 WetCollision;潜行只乘 accRun/maxRunSpeed :26046-26047）。
      // 坐骑支不乘（:26329-26331 mount.Acceleration 覆写在乘区之后,不吃减速）
      let runAcc = mnt ? mnt.acceleration
        : RUN_ACCELERATION * (duneBoost ? 1.75 : 1)
          * this.buffs.moveSpeedMult * this.equipStats.moveMult * strongestSlow;
      // 翼飞行加速倍率（WingAirLogicTweaks :28852/:28856,乘区在 moveSpeed 链之后;
      // 坐骑支不乘——原版 WingAirLogicTweaks 门 mount.CanUseWings :26175,本仓坐骑恒禁翼）
      if (!mnt) runAcc *= wingAccMul;
      // 荧光体 5107（:26188-26194）：地面四参数——acc×1.75/maxRun×1.15/accRun×1.15/
      // slowdown×1.75（velocity.Y==0 门 ≈ onGround；PlotTileLine 手持光登记未接）
      if (this.onGround && this.equipStats.magiluminescence) {
        runAcc *= 1.75; maxRun *= 1.15; accRun *= 1.15; runSlow *= 1.75;
      }
      // ---- 地面材质链（Player.cs:26210-26255 原版 else-if 真序：sticky→powerrun→
      //      sand→slippy2→slippy；floorTileT 已带坡面门 :23466）----
      // sticky 蜂蜜块地面（:26210-26221）：maxRun/acc×0.25、slowdown×2 + 钳 ±maxRun
      //   ——与 StickyTiles 泡块阻尼（:22650+，上面已接）是两条链
      // powerrun 沥青（:26222-26224）：maxRun×3.5、slowdown×2（跑道）
      // slippy2 冻结史莱姆块（:26234-26240）：acc×0.6、slowdown=0（无摩擦滑到底）；
      //   冰刀族 acc 再×3.5+maxRun×1.25
      // slippy 冰族七 tile（:26244-26255）：acc×0.7；冰刀 acc×3.5+maxRun×1.25，
      //   无冰刀 slowdown×0.1（打滑）
      if (!mnt && this.floorTileT >= 0) {
        const iceSkate = !!eqEarly.iceSkate;
        const ft = this.floorTileT;
        if (ft === HONEY_FLOOR_ID) {                        // sticky（:26210-26221）
          maxRun *= 0.25; runAcc *= 0.25; runSlow *= 2;
          if (this.vx > maxRun) this.vx = maxRun;
          if (this.vx < -maxRun) this.vx = -maxRun;
        } else if (ft === ASPHALT_ID) {                     // powerrun（:26222-26224）
          maxRun *= 3.5; runSlow *= 2;
        } else if (ft === FROZEN_SLIME_ID) {                // slippy2（:26234-26240）
          runAcc *= 0.6;
          runSlow = 0;
          if (iceSkate) { runAcc *= 3.5; maxRun *= 1.25; }
        } else if (ICE_SLIP_IDS.has(ft)) {                  // slippy（:26244-26255）
          runAcc *= 0.7;
          if (iceSkate) { runAcc *= 3.5; maxRun *= 1.25; }
          else runSlow *= 0.1;
        }
      }
      // 猪鲨崽非增益态减半（Player.cs:26333-26337：mount.Type==12 && !MountFishronSpecial
      //  → runAcceleration/=2、maxRunSpeed/=2——干爽满血且无雨才减，湿身/雨中/半血以下全额）
      if (mnt && mnt.type === 12 && !mnt.fishronBoost) { runAcc /= 2; maxRun /= 2; }
      // 坐骑特殊跳进行中加成（Player.cs:26272-26290 isPerformingJump_*：独角兽/圣诞坦克/
      // 山羊/蜥蜴 → runAcceleration×3、maxRunSpeed×1.5——蜥蜴/山羊两版源码均无复位，骑乘期内常驻）
      if (mnt && mnt.mountJumpPerforming) { runAcc *= 3; maxRun *= 1.5; }
      const wingAir = !this.onGround && this.equipStats.wing && this.wingTime > 0 && !mnt;
      // 水平链 1:1（:19559-19800）：两段加速 + 【超额回落摩擦】。原版整链不设
      // 硬钳（仅 sticky :26211 钳 maxRun）——持方向键越过帽（全速段 +0.08 过冲
      // 到 3.04）时落入摩擦分支（地面 −0.2/空中 −0.1）→ 2.84 → 再 +0.08……
      // 锯齿均值 ≈2.93-3.0 = 原版"15mph"的真实纹理（曾硬钳帽值=恒 3.0，2026-08-16 审计修）
      const grounded = this.onGround || this.vy === 0;
      const applyRunFriction = () => {
        const fr = grounded ? runSlow : runSlow * 0.5;
        if (this.vx > fr) this.vx -= fr;
        else if (this.vx < -fr) this.vx += fr;
        else this.vx = 0;
      };
      if (ix !== 0) {
        // :19546-19556：itemAnimation 窗内仅锁【朝向】不锁移动（挥砍中可跑）——
        // useTurn 物品（工具族）豁免
        if ((!animBusy || this.itemUseTurn) && mountAllowDir) this.facing = ix;
        // 跑靴脚步声冷却（Item_17，IntendedCooldown 9t :35517）
        if (this.runSoundDelay > 0) this.runSoundDelay--;
        const canRamp = this.vy === 0 || wingAir;          // 爬坡门（地面或翼飞行）
        const toward = ix * Math.max(maxRun, wingAir ? accRun : 0);
        // 全速段（|vx| 未到 maxRun → 加速;反向先 runSlowdown 制动 :19563-19568）
        if (ix > 0 ? this.vx < maxRun : this.vx > -maxRun) {
          if (ix > 0 ? this.vx < -runSlow : this.vx > runSlow) this.vx += ix * runSlow;
          this.vx += ix * runAcc;
        } else if (canRamp && (ix > 0 ? this.vx < accRun : this.vx > -accRun)) {
          // 慢爬坡段（:19675-19690:×0.2,翼飞行双份）。1457: 爬坡分支删 `!slow && !burned`
          // 门（:20091/:20121 只剩 dashDelay>=0）——减速改由 accRun×strongestSlow 承担
          // （上面已乘），Slow/Burning 下仍可爬坡但上限被压
          if (ix > 0 ? this.vx < -runSlow : this.vx > runSlow) this.vx += ix * runSlow;
          this.vx += ix * runAcc * 0.2;
          if (wingAir) this.vx += ix * runAcc * 0.2;
          // 跑靴快速奔跑尘+脚步声（:19697/:19731）：★尘门【嵌套在爬坡分支内】——
          // 分支入口门 vx<accRunSpeed 与尘门 vx>(accRunSpeed+maxRunSpeed)/2 构成
          // 互斥带，裸装 accRun==maxRun==3 → 带 [3,3) 为空 → 永不触发（原版裸装
          // 跑动无尘无声，2026-08-17 用户原版实测纠偏；此前误作全局门，裸装锯齿
          // 3.04 越线误触发）
          this.spawnFastRunParticles(game, maxRun, accRun);
        } else {
          applyRunFriction();   // 超帽回落（:19771/:19786——持键越帽同摩擦）
        }
        this._maxRunProbe = Math.max(accRun, toward);
      } else {
        // 无输入减速（:19771-19800:地面 0.2 / 空中 0.1 加法钳 0）
        applyRunFriction();
      }
    } else if (ix !== 0) {
      if ((!animBusy || this.itemUseTurn) && mountAllowDir) this.facing = ix; // 滑行中朝向仍随输入（同 :19546 门）
    }

    // 绳索攀爬 + pulley 悬挂（原版 Player.cs:25985-26177 pulley 段的本仓合流：
    // 身体中心格为绳（Space/W/↑ 攀爬键位模型）走既有速度链；中心格脱绳但
    // pulley 未离（绳端/孤立绳格——头格仍绳）走 :26118-26137 的绳端支）
    // 坐骑飞行 vy 独占标记（本 tick 悬停/飞行接管时置 true）——下方"松键截断上升"
    // 手感段须让位：原版 Player 无此截断，且 Hover 接受 controlUp 单独爬升
    //（Mount.cs:3396-3424），截断会把不按跳的爬升当场掐死
    let mountFlight = false;
    const st = world.store;
    const ropeTx = Math.floor((this.x + this.w / 2) / TILE);
    const ropeTy = Math.floor((this.y + this.h / 2) / TILE);
    const ropeHere = !!(st.inBounds(ropeTx, ropeTy) && st.flags[st.idx(ropeTx, ropeTy)]
      && TILE_DEFS[st.type[st.idx(ropeTx, ropeTy)]]?.rope);
    this.onRope = ropeHere;
    if (ropeHere && !this.inWater) {
      // 攀爬速度链（Player.cs:26016-26125——见 ropeClimbVy 注）
      this.ropeClimbVy();
      this.fallStartY = null; // 绳上不计摔伤
    } else if (this.pulley) {
      // 绳端悬挂支（:25985-26137）：头格列/行 num34/num36，上下邻格（:25998 flag17）
      const num34 = Math.floor((this.x + this.w / 2) / TILE);
      const num35 = Math.floor((this.y - 16) / TILE);        // :25994 上身格行
      const num36 = Math.floor((this.y - 8) / TILE);         // :25995 头格行
      const midRope = this.isRopeAt(st, num34, num36 - 1) || this.isRopeAt(st, num34, num36 + 1);
      if (midRope) {
        // 中段绳但身体中心已顶出（攀到绳上端）：速度链照走（:26016-26125）
        this.ropeClimbVy();
      } else if (this.inputDown) {
        // 孤立绳格按下 → 穿落（:26127-26132）：ropeCount=10 拦 FindPulley 十 tick
        this.ropeCount = 10;
        this.pulley = false;
        this.vy = 1;
      } else {
        // 挂在绳端（:26133-26137）：vy 钉 0、y 钉上身格顶+22
        this.vy = 0;
        this.y = num35 * TILE + 22;
      }
      this.fallStartY = null; // 绳上不计摔伤（:25987 fallStart）
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
      // buff 353（:11381-11388）：frozen 封输入（输入清零在上方移动积分前的
      // Frozen∪Shimmering 段执行——此处只做物理）+ fallStart 重置（免摔伤）；
      // 物理 :24117-24119 gravity/maxFall ×0.9——速度只用于积分，位移走下方
      // :27868 的 velocity×0.375 穿墙下坠（绕过 tile collision）
      this.vy = Math.min(this.vy + GRAVITY * 0.9, MAX_FALL_SPEED * 0.9);
      this.fallStartY = null;
    } else if (this.buffs.has(BuffType.Webbed)) {
      // 结网(149)（Player.cs:11459-11476）：本帧 velocity 清零（下落中留 1e-6 缓降）、
      // gravity=0、jumpHeight=0、moveSpeed=0（已走 moveSpeedMult）、dash 归零、
      // 免击退；摘钩 RemoveAllGrapplingHooks（:11476——幂等，多帧重复调用无害）
      this.vx = 0;
      this.vy = this.vy !== 0 ? 0.000001 : 0;
      this.fallStartY = null;
      this.removeAllGrapplingHooks();
    } else if (this.buffs.has(BuffType.VortexDebuff)) {
      // 星旋减益(164)：gravity=0（:24162-24164）+ vy 摆动（:27854-27857：
      // vy×0.8 + cos(cx%120/120×2π)×5×0.2——按世界 X 相位正弦悬浮）
      this.vy = this.vy * 0.8 + Math.cos((this.cx % 120) / 120 * Math.PI * 2) * 5 * 0.2;
      this.fallStartY = null;
    } else
    // ---- 跳跃参数链（每帧先于物理求值：UpdateJumpHeight :19301-19341 + 坐骑档
    //      Mount.JumpHeight/JumpSpeed :19307-19308——原版 jumpHeight/jumpSpeed 是
    //      玩家字段，液体链 :24130-24155 在湿态覆写；sustain 段消费当帧生效值）----
    {
      const gd = this.gravDir;
      const mnt2 = this.ridingMount ? this.mount : null;
      const eqJ = this.equipStats;
      let baseJumpSpd = PLAYER_JUMP_SPEED;
      let baseJumpTicks = PLAYER_JUMP_TICKS;
      if (eqJ.jumpBoost) {
        baseJumpTicks = Math.max(baseJumpTicks, 20);
        baseJumpSpd = Math.max(baseJumpSpd, 6.51);
      }
      if (this.buffs.has(BuffType.Werewolf)) baseJumpTicks += 2;   // :19334 jumpHeight += 2（速度 +0.2 已在 jumpSpd）
      if (this.stoolInUse) baseJumpTicks += 5;   // :19341-19344 折叠凳 +5（非坐骑支——凳/坐骑互斥）
      baseJumpSpd += eqJ.jumpSpd;
      const mJumpSpd0 = mnt2 ? mnt2.jumpSpeed(this.vx) : baseJumpSpd;
      const mJumpTicks0 = mnt2 ? mnt2.jumpHeight(this.vx) : baseJumpTicks;
      // 蜂蜜块【地面】sticky 跳削弱（Player.cs:19343-19346：jumpHeight/=10（整数除）、
      // jumpSpeed/=5——在坐骑赋值【之后】=坐骑跳同样被削；与泡块阻尼
      // （StickyTiles :22650+）不同链；dazed 同位点（/5,/2）在 1456 零施加源
      // =死字段不移植）。折叠凳 IsInUse +5（:19337-19340）已在 baseJumpTicks 前段
      let mJumpSpd = mJumpSpd0, mJumpTicks = mJumpTicks0;
      if (this.floorTileT === HONEY_FLOOR_ID) {
        mJumpTicks = Math.floor(mJumpTicks / 10);
        mJumpSpd /= 5;
      }
      // 本帧生效跳跃速度（湿态液体档覆写；长跳 sustain 钉速用它——原版钉的是当帧
      // jumpSpeed，出水瞬间自动切回干燥档）
      let effJumpSpd = mJumpSpd;
      // 起跳帧标记（原版 JumpMovement 的 if(jump>0)/else-if(起跳) 同帧互斥——
      // 起跳帧不进 sustain，平台段全长 = 起跳帧 + jumpHold 帧）
      let jumpStartedThisTick = false;
      // 手持三叉戟 277（UpdateEquips :12487-12490：手持即 trident，非装备槽）
      const heldIt = this.inv.heldItem();
      const heldVid = heldIt ? (ITEM_DEFS[heldIt.id]?.vid ?? viIdFromKey(ITEM_DEFS[heldIt.id].key)) : -1;
      const trident = heldVid === 277;
      // 跳键沿（releaseJump 等价，JumpMovement :20845 消费门 `(releaseJump ||
      // (autoJump && (velocity.Y == 0 || sliding)))`——原版按住跳键落地【不会】自动
      // 连跳（releaseJump 仅在 !controlJump 帧 :21204 置真），须松键再按；autoJump
      // 是蛙蹼族配饰/系统设置授予的免松键档（:14507 等）。R5-F11/F12：旧 held 门
      // （inputJump+vy>-2+8t cd）= 全员恒 autoJump 语义，已废）
      const jumpEdge = this.inputJump && !this.jumpEdgePrev;
    // 跳跃 / 游泳
    // 游泳族坐骑（海龟/猪鲨崽/海盗船/熔岩鲨：坐骑 buff 的 ignoreWater，Player.cs:9592-9608）
    // 浸水走干燥分支——水下不降速（Run 段本就无水因子；位移层 liqFactor 由积分段
    // ridingMountSwimFree 门豁免）、正常重力与跳跃（+5 高/+2.5 速
    // 在 Mount.JumpHeight/JumpSpeed 的 frameState==4 支线），帧态机自行切游泳帧
    if ((this.inWater || this.inLava) && !this.ridingMountSwimFree) {
      // ---- 液体参数档（Player.cs:24130-24155 wet 链；inWater 已含蜂蜜 type3，
      //      岩浆 wet 同链走 else 档）----
      // honeyWet → gravity 0.1/maxFall 3（跳跃参数保持干燥档——原版分支不覆写）；
      // merman → 0.3/7（跳跃参数同保持）；trident 且非岩浆 → 0.25/6 + jump 25/5.51
      // （按住 ↑ 0.1/2 浮升）；其余湿态 → 0.2/5(+0.01) + jump 30/6.01
      const flipperOn = this.equipStats.flipper || this.buffs.has(BuffType.FlipperPotion);
      let lGrav = GRAVITY * 0.5, lMaxFall = 5.01;
      let lJSpd = mJumpSpd, lJT = mJumpTicks;
      if (this.inHoney) { lGrav = GRAVITY * 0.25; lMaxFall = 3; }
      else if (this.equipStats.merman) { lGrav = GRAVITY * 0.75; lMaxFall = 7; }
      else if (trident && !this.inLava) {
        lGrav = GRAVITY * 0.625; lMaxFall = 6; lJSpd = 5.51; lJT = 25;
        if (this.inputUp) { lGrav = GRAVITY * 0.25; lMaxFall = 2; }
      } else { lJSpd = 6.01; lJT = 30; }
      effJumpSpd = lJSpd;
      // ---- 水面行走（WaterWalkingBoots/LavaWaders 族 + 水行药水；按 ↓ 下潜）----
      // vy 清零 → 下方起跳门 vy==0 自然通过（原版同——水面站立即 velocity.Y==0）
      if (canWaterWalk && !this.headUnderwater && this.vy >= 0 && !this.inputDown) {
        this.onWaterSurface = true;
        this.vy = 0;
        this.fallStartY = null;
        // 站在液面等价落地：重置多段跳/飞行/飞毯
        this.extraJumps = [...this.equipStats.jumpOpts];
        const eqW = this.equipStats;
        this.wingTime = eqW.wing ? eqW.wing.time : 0;
        this.rocketTime = 7; this.rocketRelease = true; this.rocketDelay = 0;
        this.canCarpet = true;
        this.carpetTime = 300;
      } else {
        this.onWaterSurface = false;
      }
      // ---- 水中起跳门（JumpMovement :20405-20496 原版语义，2026-08-16 对齐）：
      //   vy==0（踩底 / 水行站立）或 脚蹼族湿态任意时刻（flag2&&flag3 :20407）；
      //   均须按键边沿（releaseJump :20409）。★头露出水面【不是】原版起跳条件——
      //   踩水悬停 vy≠0 不能跳出水面，须踩底/水行/脚蹼（旧"头露即可跳+冷却"自制
      //   门已废）；起跳 = vy=-jumpSpeed + jump=jumpHeight（:20496-20500，脚蹼
      //   不消费多段跳 :20449 !flag2 门），脚蹼起跳置 swimTime=30（:20419-20422）----
      const flipperJump = flipperOn && !this.ridingCart;
      if (jumpEdge && (this.vy === 0 || flipperJump)) {
        if (flipperOn && this.swimTime === 0) this.swimTime = 30;
        this.vy = -lJSpd * gd;
        this.jumpHold = lJT;
        jumpStartedThisTick = true;
        if (this.stoolInUse) {   // 湿跳同离凳（:20504 无分支门）
          this.stoolInUse = false;
          this.y -= Player.STOOL_BOOST;
          this.h -= Player.STOOL_BOOST;
        }
      }
      this.vy += lGrav;
      this.vy = Math.max(-lJSpd, Math.min(lMaxFall, this.vy));
      this.fallStartY = null;
    } else {
      if (this.inputJump && (jumpEdge || (this.ridingMount ? this.mount.autoJump : eqJ.autoJump)) && this.onGround) {
        // 跳跃速度 = 基础 + jumpSpeedBoost（蛙腿族 +1.6，Player.jumpSpeedBoost :22427）；
        // 重力倒置时方向取反（gravDir，Player.cs:3207 全部 vy 乘 gravDir 语义）
        // 起跳门 = releaseJump || (autoJump && vy==0)（JumpMovement :20845——按住跳键
        // 落地不自动连跳,须松键再按;autoJump 来源 = 蛙蹼族配饰（:14507/:14533/:14539/
        // :14546）或坐骑 constantJump 族（Mount.UpdateEffects :4850 `mountedPlayer.
        // autoJump = AutoJump`——骑乘期【覆写】配饰档）。R5-F12：旧 held 门（按住即
        // 落地重跳）= 全员恒 autoJump,已废）
        this.vy = -mJumpSpd * gd;
        this.jumpHold = mJumpTicks;
        jumpStartedThisTick = true;
        // 折叠凳起跳离凳（Player.cs:20504-20512：IsInUse=false + position.Y −= 26
        // ——从凳上一步起跳=净多 26px 高度；相机 bump 无对应载体略）
        if (this.stoolInUse) {
          this.stoolInUse = false;
          this.y -= Player.STOOL_BOOST;
          this.h -= Player.STOOL_BOOST;
        }
      }
      // ---- 坐骑特殊跳（hasJumpOption_*：UpdateEffects :4933/:4877/:4956/:4963 授予；
      //      JumpMovement :20435-20688 链——优先于装备多段跳） ----
      let mountJumpFired = false;   // 本帧坐骑跳已消费（与装备多段跳 else-if 互斥）
      // 独角兽 10 / 圣诞坦克 46 / 山羊 47：vy = -mountJumpSpeed、保持 jumpHeight×2；
      // 蜥蜴 14：保持 trunc(jumpHeight×0.75)（:20659）。落地恢复（:22612-22628
      // canJumpAgain_* 段）。isPerformingJump_* 蜥蜴/山羊两版源码均无复位——一旦使出，
      // 骑乘期内 runAcceleration×3/maxRunSpeed×1.5 常驻（Run 段消费）
      if (mnt2?.jumpOption) {
        if (this.onGround) this.mount.mountJumpReady = true;
        else if (this.mount.mountJumpReady && this.inputJump && this.jumpHold <= 0) {
          this.mount.mountJumpReady = false;
          this.mount.mountJumpPerforming = true;
          this.vy = -mJumpSpd * gd;
          this.jumpHold = this.mount.mountJumpTicks();
          mountJumpFired = true;   // 与装备多段跳同帧互斥（原版 :20935 else-if 单分支）
        }
      }
      // ---- 多段跳（JumpMovement :20899-21197）：高度表 1:1——沙暴 jumpHeight×3
      //      （:20970）/ 暴雪 (int)(×1.5)（:20980）/ 航行瓶 (int)(×1.25)（:20992）/
      //      屁瓶 ×2（:21023）/ 独角兽×2（:21048）/ 血肉山羊×2（:21076）/ 蜥蜴坐骑
      //      (int)(×0.75)（:21104）/ 圣诞坦克×2（:21134）/ 云朵 (int)(×0.75)（:21181）。
      //      消费优先序（:20875-20922 else-if 链）：坐骑族 Basilisk>WoFGoat>Santank>
      //      Unicorn 在前,瓶族 Sandstorm>Blizzard>Fart>Sail>Cloud（Cloud 兜底必消费）。
      //      R5-F9/F10：旧表 Fart/Cloud 1.25、Sail 落 1.0（'Tsunami' 键在数据不存在）
      //      + JUMP_ORDER 完全倒序,均已修。
      //      起跳帧特效（:20953-21196）：沙暴/暴雪/航行 播 SoundID 16（Item_16 跳跃音）；
      //      屁瓶 10×尘188+3×gore435-437（:21024-21038）；航行瓶 30×尘253（:20993-21011）。
      //      持续尾迹见 doubleJumpVisuals（DoubleJumpVisuals :21615-21745） ----
      const eq = this.equipStats;
      if (this.onGround) { this.extraJumps = [...eq.jumpOpts]; this.performingJump = null; }
      // 坐骑封段（Mount.BlockExtraJumps，Player.cs:25730）：大多数坐骑禁多段跳。
      // 触发门 = releaseJump（:20845 `(releaseJump || (autoJump && (vy==0||sliding)))`
      // ——空中档 autoJump 分支 vy==0 恒假,多段跳【必须松键再按】。R5-F11：旧 held 门
      // （inputJump+vy>-2+8t cd）按住跳键即自动连段,已废;坐骑跳与多段跳同帧互斥
      // （原版 :20935 else-if 链单分支）由 mountJumpFired 旗保证）
      if (!this.onGround && !mnt2?.blockExtraJumps && jumpEdge && this.extraJumps.length > 0 && !mountJumpFired) {
        const opt = this.extraJumps.shift()!;
        const hMult = opt === 'Sandstorm' ? 3
          : opt === 'Blizzard' ? 1.5
          : opt === 'Fart' ? 2
          : opt === 'Sail' ? 1.25
          : opt === 'Cloud' ? 0.75
          : opt === 'Basilisk' ? 0.75
          : 2;   // Unicorn / WallOfFleshGoat / Santank ×2（:21048/:21076/:21134）
        this.vy = -mJumpSpd * gd;
        this.jumpHold = Math.round(mJumpTicks * hMult);
        this.performingJump = opt;                          // isPerformingJump_* 等价标记
        game.playSfxFiles(['Item_16'], 1, this.cx, this.cy); // SoundID 16（沙暴/暴雪/屁瓶/航行同）
        const D = game.vanillaDust;
        const mk = (x: number, y: number, w: number, h: number, type: number,
          alpha: number, scale: number, vx = 0, vy = 0) => D ? D.spawn(x, y, w, h, type, vx, vy, alpha, null, scale) : null;
        if (opt === 'Fart') {
          const fy = gd === 1 ? this.y + this.h - 16 : this.y - 16;
          for (let m = 0; m < 10; m++) {
            const d = mk(this.x - 34, fy, 102, 32, 188, 100, 1.5, -this.vx * 0.5, this.vy * 0.5);
            if (d) { d.vx = d.vx * 0.5 - this.vx * 0.1; d.vy = d.vy * 0.5 - this.vy * 0.3; }
          }
          for (let gi = 0; gi < 3; gi++) {
            const gx = gi === 0 ? this.x + this.w / 2 - 16 : gi === 1 ? this.x - 36 : this.x + this.w + 4;
            const g = GorePiece.newGore(435 + (Math.random() * 3 | 0), gx, fy, -this.vx, -this.vy, 1, false);
            if (g) { g.vx = g.vx * 0.1 - this.vx * 0.1; g.vy = g.vy * 0.1 - this.vy * 0.05; }
          }
        } else if (opt === 'Sail') {
          const sy = gd === 1 ? this.y + this.h : this.y;
          for (let l = 0; l < 30; l++) {
            const d = mk(this.x, sy, this.w, 12, 253, 100, 1.5, this.vx * 0.3, this.vy * 0.3);
            if (!d) continue;
            if (l % 2 === 0) d.vx += (30 + Math.random() * 41 | 0) * 0.1;
            else d.vx -= (30 + Math.random() * 41 | 0) * 0.1;
            d.vy += (Math.random() * 41 - 10 | 0) * 0.1;
            d.noGravity = true;
            d.scale += (Math.random() * 51 - 10 | 0) * 0.01;
            d.vx *= d.scale * 0.7; d.vy *= d.scale * 0.7;
          }
        }
      }
      // 多段跳上升尾迹（DoubleJumpVisuals，Update :26445 每帧调用位）
      this.doubleJumpVisuals(game);
      // ---- 坐骑飞行族接管（Player.cs:26637-26700 的 else-if 链 1:1）----
      // usesHover（UFO/蜜蜂/猪鲨崽/巫婆扫帚/熔岩鲨(水中)）→ Mount.Hover 接管 vy
      //（flyTime→疲劳双池，疲劳满失升力）；非 hover 飞行坐骑（驯鹿/猪龙）→ 按住跳
      // 消耗 flyTime 爬升（0.1/tick、上限 -jumpSpeed×1.5），耗尽重力/3 缓降。
      // 两者独占 vy：下方翅膀/火箭靴段与重力段全部跳过（原版同链互斥）。
      if (mnt2) {
        if (mnt2.canHover(this)) {
          mnt2.hover(this);
          mountFlight = true;
        } else if (mnt2.canFly(this) && this.inputJump && this.jumpHold === 0) {
          if (mnt2.flight()) {
            let js = mJumpSpd;
            if (mnt2.type === 50) js *= 0.5;               // 史后坐骑爬升减半（:26660）
            if (this.vy > 0) this.vy -= 0.1 * 5;          // 下落中反抽 5×（:26672）
            else if (this.vy > -js * 1.5) this.vy -= 0.1;
            if (this.vy < -js * 1.5) this.vy = -js * 1.5;
          } else {
            // 能量耗尽缓降（:26683-26696）：重力/3 + 终端 maxFallSpeed/3
            this.vy += GRAVITY / 3 * gd;
            const cap = MAX_FALL_SPEED / 3 * gd;
            this.vy = gd === 1 ? Math.min(this.vy, cap) : Math.max(this.vy, -cap);
          }
          mountFlight = true;
        }
      }
      // ---- 翅膀/火箭靴/飞毯 1:1（Player.Update :26388-27092 + WingMovement :21746 +
      //      CarpetMovement :21568 + RocketBoots :26548-26628）----
      // 坐骑禁翼禁靴（Player.cs:26316-26322：mount.Active → rocketBoots=0、
      // CanUseWings 假族 wings=0——本仓坐骑恒属禁翼族）
      // ★1457 翅膀"隐藏显形"门变更（ApplyEquipFunctional :15710-15716,1456 :12583）：
      // `!hideVisibleAccessory[slot] || (vy≠0 && mount.CanUseWings)` → `(… && !mount.Active)`
      // ——1456 骑【可飞】坐骑时被隐藏的翅膀下落中仍显形,1457 骑任何坐骑都不再显形。
      // 本仓 per-slot 隐藏已建模（hideVisibleAccessory,聚合侧 hidden 旗随翼记录）:
      // 隐藏翼的【飞行逻辑】不受影响（原版 wingsLogic 恒写 :12585,本仓 wingsLogic
      // 同）,显形门在渲染侧补 vy≠0 特例（Renderer 翅膀层）。
      // 绘制侧 ShouldDrawWingsThatAreAlwaysAnimated（:30271,1457 未改,仍 mount.CanUseWings）
      // 本仓以 !ridingMount 等价（坐骑恒禁翼族,两式同假）——下方 shouldDraw 同。
      // R4-23（P57:26824-26834 + Mount.cs:572-580）：原版骑乘只清【禁翼族】坐骑
      // （CanUseWings 缺省 false,仅滚轴鞋 57-60 置 true）;本仓曾骑任何坐骑恒清零。
      // 与 Renderer.ts 翼门同表（vanilla-mounts.json 仅 57-60 带键）
      const mountCanWings2 = !mnt2 || MOUNT_DATA[String(mnt2.type)]?.CanUseWings === true;
      const wings = eq.wing && mountCanWings2 ? eq.wing.logic : 0;   // wingsLogic = armor.wingSlot（:12584）
      const wingsLogic = eq.wing?.logic ?? 0;  // 不随坐骑清零（flag19 hover 档 :26477 用 wingsLogic）
      const hoverDown = this.inputDown;            // TryingToHoverDown（保持态近似省略）
      const JS = PLAYER_JUMP_SPEED + this.equipStats.jumpSpd;   // jumpSpeed（含 jumpSpeedBoost）
      // 落地重置（原版 :26169 地面块 + :26490 vy==0&&releaseJump 语义并入）
      // 松跳重触发（原版 :20765 松跳段独立于地面状态——rocketRelease/wingRelease）
      if (!this.inputJump) { this.rocketRelease = true; this.wingRelease = true; }
      let flying = false;   // flag19（空中段赋值；地面恒 false）
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
        // flag19 = 翅膀飞行中（:26469-26483：wings>0 && controlJump && wingTime>0 &&
        //   jump==0 && vy≠0；hover 档固定集 {22,28,30,32,29,33,35,37,45} + ↓+跳 :26477）
        flying =
          (wings > 0 && this.inputJump && this.wingTime > 0 && this.jumpHold === 0 && this.vy !== 0)
          || (FLAP_HOVER_SET.has(wingsLogic) && this.inputJump && hoverDown && this.wingTime > 0);
        if (flying) {
          this.wingMovement(wings, hoverDown, JS);
          // ★ WingFrame 帧状态机已移至 if/else 之后每 tick 执行（原版 :26498
          //   无条件调 WingFrame(flag19)——33/38 落地不归零等语义依赖此执行位）
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
        if (!flying && !mnt2 && (this.wingTime <= 0 || wings === 0) && eq.rocketBoots > 0
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
          if (eq.carpet && !mnt2 && this.extraJumps.length === 0 && this.jumpHold === 0
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
      // ---- 翅膀帧状态机（Player.cs:26497-26501 每 tick 调 WingFrame(flag19) +
      //      :26874-27010 滑翔帧覆盖，两段顺序执行；地面也跑——33/38 落地保持
      //      帧 2、generic 地面归 0 均在此位生效）----
      if (wingsLogic > 0) {
        const glide = !flying && this.inputJump && this.vy > 0;   // :26718（downDash 未建模恒 false）
        this.wingFrameScratch.frame = this.wingFrame;
        this.wingFrameScratch.counter = this.wingFrameCounter;
        stepWingFrame(wingsLogic, this.wingFrameScratch, {
          flap: flying,
          jump: this.jumpHold > 0,
          vy: this.vy,
          controlJump: this.inputJump,
          controlLR: this.inputX !== 0,
          hoverDown, hoverUp: this.inputUp,
          wingTime: this.wingTime,
          glide,
          downDash: false,          // isPerformingJump_DownDash 未建模
          waterFloat: this.inWater
            && (eq.canFloat || this.buffs.has(BuffType.FlipperPotion))   // canFloatInWater 两源（:12845/:9595）
            && !this.inputDown && (!this.ridingMount || this.mount.type === 37),   // ShouldFloatInWater :3710-3722 全门
          // ShouldDrawWingsThatAreAlwaysAnimated :30271（坐骑恒禁翼 → !ridingMount）
          shouldDraw: this.vy !== 0 && !this.ridingMount
            && !this.grappleProjs.some((g) => g.latched)
            && !(this.inWater && ((eq.canFloat || this.buffs.has(BuffType.FlipperPotion))
              && !this.inputDown && (!this.ridingMount || this.mount.type === 37))),   // ShouldFloatInWater :3710-3722
        });
        this.wingFrame = this.wingFrameScratch.frame;
        this.wingFrameCounter = this.wingFrameScratch.counter;
        // 翅膀尘埃/音效（WingAirVisuals :30284 + WingFrame 各分支尘 + 滑翔尘 :26914+）
        this.wingFx(game, wings, wingsLogic, flying, glide, !!this.wingFrameScratch.justSwitched);
      }
      // ---- 冲刺 1:1（DashMovement :20769-21265 + DoCommonDashHandle :21267-21323）----
      // 1=忍者足具/水晶刺客（纯位移） 2=克苏鲁护盾（冲撞 30+反弹）。
      // dashDelay 三态（:20775-20782）：0=就绪 / -1=滑行中（阻尼衰减） / >0=冷却倒计时。
      // 三态互斥（原版 if/else-if/else 同 tick 只走一支：:20958/:20970/:21128）——
      // 触发帧不再叠跑阻尼。触发帧单次置速（:21131 dash1=16.9 / :21162 dash2=14.5，
      // 原版 px 值），此后靠滑行阻尼自然衰减——无恒速段（旧 dashTicks=15×12.5 近似
      // 已废）；重力照常作用（原版 JumpMovement 不因 dashing 豁免）
      // 克苏鲁护盾冲撞（:20784-20846）：eocDash>0 且未命中时逐帧扫敌。命中判定盒 =
      // 位置 + 速度×0.5 外扩 4px（:20786）；伤害 30×meleeDamage 可暴击、击退 9
      // （kbGlove ×2 / 泰坦 kbBuff ×1.5，:20800-20808）；命中 → eocDash=10、30t 冷却、
      // 反弹 vx=-dir×9 vy=-4（:20825-20840）
      if (eq.dash === 2 && this.eocDash > 0 && this.eocHitId < 0) {
        const bhx = this.x + this.vx * 0.5 - 4, bhy = this.y + this.vy * 0.5 - 4;
        const bhw = this.w + 8, bhh = this.h + 8;
        for (const e of game.enemies()) {
          const en = e as { id?: number; x?: number; y?: number; w?: number; h?: number; cx?: number; cy?: number;
            dead?: boolean; hurt?: (d: number, kx: number, ky: number, g: unknown) => boolean };
          if (en.dead || !en.hurt || en.cx === undefined || en.cy === undefined) continue;
          // friendly 门（原版 :20793 !nPC.friendly continue——冲撞对睡渔夫 376 等友好 NPC 无效）
          if (!playerCanHitEnemy(e, game)) continue;
          const ex = en.x ?? en.cx - 8, ey = en.y ?? en.cy - 8, ew = en.w ?? 16, eh = en.h ?? 16;
          if (!(bhx < ex + ew && bhx + bhw > ex && bhy < ey + eh && bhy + bhh > ey)) continue;
          const dir = this.vx < 0 ? -1 : this.vx > 0 ? 1 : this.facing; // :20809-20815
          const crit = Math.random() * 100 < this.critChance('melee');  // :20811-20813
          const dmg = Math.max(1, Math.round(30 * this.damageMult('melee')) * (crit ? 2 : 1));
          const kb = 9 * (eq.kbGlove ? 2 : 1) * (this.buffs.has(BuffType.Titan) ? 1.5 : 1);
          en.hurt(dmg, dir * kb, -4, game);
          game.addDamageNumber(en.cx, en.cy, dmg, crit, crit ? '#FF8040' : '#FFD080');
          this.eocDash = 10;            // :20833
          this.eocHitId = en.id ?? -2;  // :20840（后续帧不再对同一敌结算）
          this.dashDelay = 30;          // :20834 反弹并结束滑行
          this.vx = -dir * 9;
          this.vy = -4;
          break;
        }
      }
      if (this.dashDelay > 0) {
        // 冷却段（:20958-20968）：eocDash 同步倒数，归零清冲撞命中标记
        if (this.eocDash > 0) this.eocDash--;
        if (this.eocDash === 0) this.eocHitId = -1;
        this.dashDelay--;
      } else if (this.dashDelay < 0) {
        // 滑行阻尼（:20970-21113）：|vx|>12 → ×0.985；否则 |vx|>max(accRunSpeed,
        // maxRunSpeed) → ×0.94；跌破档位即结束滑行（dashDelay=20）并把 vx 钳回
        // ±maxRunSpeed（:21108-21113）。num13 = max(accRunSpeed,maxRunSpeed)
        // （accRunSpeed=靴 6/裸 3，maxRunSpeed=3×moveSpeed）
        // 1457: 步行两分支删 `dashDelay >= 0` 门（HorizontalMovement :19984/:20010）——
        // 滑行中按反方向输入现在会制动冲刺：原版落 maxRunSpeed 步行分支
        // （反向时 vx<maxRun / vx>-maxRun 成立）→ runSlowdown 制动 + runAcceleration
        // 反向加速；同向输入不满足门，无效果。爬坡分支仍保留 dashDelay>=0（:20091/:20121）
        if (ix !== 0) {
          const mRun = this.ridingMount ? this.mount.runSpeed() : PLAYER_WALK_MAX * speedMult;
          const rSlow = RUN_SLOWDOWN * this.equipStats.runSlowMul;
          if (ix > 0 ? this.vx < mRun : this.vx > -mRun) {
            if (ix > 0 ? this.vx < -rSlow : this.vx > rSlow) this.vx += ix * rSlow;
            // D3（:26206）：原版此处 runAcceleration 已被 Update 乘过 moveSpeed 乘区
            // （滑行分支消费的是乘后值）——同式补乘（duneBoost 沙地 ×1.75 同在乘区）
            this.vx += ix * RUN_ACCELERATION * (duneBoost ? 1.75 : 1)
              * this.buffs.moveSpeedMult * this.equipStats.moveMult * strongestSlow;
          }
        }
        // 滑行阻尼参数（DashMovement :21424-21431 基础档 + 各 dash 段覆写）：
        //   num13=档1阈值 12（dash3 日曜=14 :21478）、num14=档1阻尼 0.992
        //   （dash2/3/4=0.985 :21457/:21479/:21499）、num16=档2阻尼 0.96
        //   （dash2/3/4=0.94）、num17=结束冷却 20（dash2=30 :21459）。
        //   R5-F14：旧恒 12/0.985/0.94/20——dash1 克盾衰减过快（20t 残速 74% vs
        //   原版 85%）、dash2 冷却短 1/3、dash3 阈值档错,均已修
        const dashNum13 = eq.dash === 3 ? 14 : 12;
        const dashNum14 = (eq.dash === 2 || eq.dash === 3 || eq.dash === 4) ? 0.985 : 0.992;
        const dashNum16 = (eq.dash === 2 || eq.dash === 3 || eq.dash === 4) ? 0.94 : 0.96;
        const dashNum17 = eq.dash === 2 ? 30 : 20;
        // num15（:21429 出口钳速）= max(accRunSpeed, maxRunSpeed)，maxRunSpeed 已吃
        // Update :26204-26210 moveSpeed 乘区（buffs.moveSpeedMult × strongestSlow——
        // R5-F15：旧式缺这两项,敏捷/减速下出口速度错）
        const num15 = Math.max(eq.accRunSpeed > 0 ? eq.accRunSpeed : 3, PLAYER_WALK_MAX * speedMult);
        this.vortexStealthActive = false;  // :21106 滑行中强制显形
        if (Math.abs(this.vx) > dashNum13) {
          this.vx *= dashNum14;
        } else if (Math.abs(this.vx) > num15) {
          this.vx *= dashNum16;
        } else {
          this.dashDelay = dashNum17;      // :21567 dashDelay = num17
          this.vx = this.vx < 0 ? -num15 : num15;   // :21570-21575 钳回 ±num15
        }
      } else if (eq.dash > 0) {
        // 就绪段（:21128 else）：DoCommonDashHandle（:21267-21323）——双击窗收敛 +
        // 同向二连击触发（原版此段只在 dashDelay==0 时运行：冷却/滑行期点击不登记窗）
        // 1457: 触发条件加 `!CCed`（DoCommonDashHandle :21740 `controlDash && !CCed &&
        // releaseDash`）——冻结/结网/石化不能冲刺
        if (this.dashT > 0) this.dashT--;   // :21268-21271 每帧向 0 收敛
        else if (this.dashT < 0) this.dashT++;
        if (!this.cced && this.inputX !== 0 && this.prevInputX === 0) {
          const dir = this.inputX;
          if (dir > 0 ? this.dashT > 0 : this.dashT < 0) {
            // 骑乘禁冲刺（:21579 `dash <= 0 || (mount.Active && !MountID.Sets.CanDash[
            // mount.Type]) → return`——R5-F17：本仓坐骑恒禁翼族,CanDash 表全假,骑乘
            // 一律不触发;双击窗照常收敛（原版 return 在窗登记之后语义等价——窗已清）
            if (this.ridingMount) { this.dashT = 0; }
            else {
            this.dashT = 0;               // :21305 触发即清双击窗
            this.dashDir = dir;
            this.dashDelay = -1;          // :21138 进入滑行态
            this.vx = (eq.dash === 2 ? 14.5 : eq.dash === 3 ? 21.9 : 16.9) * dir;
            // :21588 dash1=16.9 / :21619 dash2=14.5 / :21643 dash3 日曜=21.9
            //（R5-F13：旧 dash3 落 16.9,冲撞初速低 23%）
            // 头部将撞墙减半（:21132-21137）：身前半宽+2px 的头部点/身体中点格
            // SolidOrSlopedTile → velocity.X /= 2
            if (this.dashWallAhead(dir)) this.vx /= 2;
            if (eq.dash === 2) { this.eocDash = 15; this.eocHitId = -1; } // :21170
            if (eq.dash === 3) { this.solarDashing = true; this.solarDashConsumed = false; } // :21258-21260 SolarDashStart
            }
          } else {
            this.dashT = dir * 15;        // :21316-21321 首击登记双击窗（dashTime ±15）
          }
        }
      }
      // 日曜冲撞命中（DashMovement :21293-21352：solarDashing && dashDelay<0 逐帧
      // 扫敌——【不反弹不结束滑行】,滑行期每帧可多目标;命中置 nPC.immune[whoAmI]=6
      // （:21348）防同敌连击 + GiveImmuneTimeForCollisionAttack(4)。首中耗一层盾
      // （solarDashConsumedFlare :21312-21316）。R5-F16：旧"命中即 solarDashing=false"
      // = 每次冲撞只伤一个目标,已修为逐帧多目标）
      if (this.solarDashing && this.dashDelay < 0) {
        const bhx3 = this.x + this.vx * 0.5 - 4, bhy3 = this.y + this.vy * 0.5 - 4;
        const bhw3 = this.w + 8, bhh3 = this.h + 8;
        for (const e of game.enemies()) {
          const en = e as { id?: number; x?: number; y?: number; w?: number; h?: number; cx?: number; cy?: number;
            dead?: boolean; hurt?: (d: number, kx: number, ky: number, g: unknown) => boolean;
            iframes?: number };
          if (en.dead || !en.hurt || en.cx === undefined || en.cy === undefined) continue;
          // friendly 门（原版 :21299 !nPC2.friendly continue——同克盾冲撞）+
          // immune[whoAmI] > 0 门（:21299——6t 免疫帧内不再吃冲撞）
          if ((en.iframes ?? 0) > 0) continue;
          if (!playerCanHitEnemy(e, game)) continue;
          const ex3 = en.x ?? en.cx - 8, ey3 = en.y ?? en.cy - 8, ew3 = en.w ?? 16, eh3 = en.h ?? 16;
          if (!(bhx3 < ex3 + ew3 && bhx3 + bhw3 > ex3 && bhy3 < ey3 + eh3 && bhy3 + bhh3 > ey3)) continue;
          if (this.solarShields > 0 && !this.solarDashConsumed) {
            this.solarDashConsumed = true;
            this.solarShields--;          // ConsumeSolarFlare(:21312-21316)
            this.solarCounter = 0;
          }
          const dir3 = this.vx < 0 ? -1 : this.vx > 0 ? 1 : this.facing;
          const crit3 = Math.random() * 100 < this.critChance('melee');
          const dmg3 = Math.max(1, Math.round(150 * this.damageMult('melee')) * (crit3 ? 2 : 1));  // :21317
          const kb3 = 9 * (eq.kbGlove ? 2 : 1) * (this.buffs.has(BuffType.Titan) ? 1.5 : 1);        // :21318-21327
          en.hurt(dmg3, dir3 * kb3, -4, game);
          if (en.iframes !== undefined) en.iframes = 6;   // :21348 immune[whoAmI]=6
          game.addDamageNumber(en.cx, en.cy, dmg3, crit3, crit3 ? '#FF8040' : '#FFD080');
          // 不置 solarDashing=false——滑行全程逐帧结算（原版 :21352 无终止写）
        }
      } else if (this.dashDelay >= 0) {
        this.solarDashing = false;
      }
      // ---- 攀壁钉鞋（spikedBoots：攀爬爪/鞋钉/忍者大师装备——贴墙缓降+蹬墙跳）----
      this.wallCling = false;
      // ---- 老鼠坐骑 55 爬墙（WallClimbMovement :21329-21450 非 spikedBoots 支）：
      //      按向墙方向 + 墙延到脚下一格 → 上 -2/t、下 4/t、松手 0.5/t 缓滑；
      //      fallStart 重置免坠伤；爬墙期间平台穿透（:27777 flag29 num107!=0）----
      this.ratClimbVy = null;
      const ratClimb = this.mount.active && this.mount.type === 55
        && !this.onGround && this.hitWall && this.inputX !== 0
        && Math.sign(this.inputX) === Math.sign(this.vx || this.facing);
      if (ratClimb) {
        const st = game.world.store;
        const sideX = this.inputX > 0
          ? Math.floor((this.x + this.w + 1) / TILE) : Math.floor((this.x - 1) / TILE);
        const footY = Math.floor((this.y + this.h + 1) / TILE);
        if (st.inBounds(sideX, footY) && st.isSolid(sideX, footY)) {
          this.ratClimbVy = this.inputUp ? -2 : this.inputDown ? 4 : 0.5;
          this.fallStartY = null;
          this.wallCling = true;
          game.spawnParticles(this.inputX > 0 ? this.x + this.w : this.x,
            this.cy, '#B0907A', 1, 0.5, { life: 20 });
        }
      }
      if (!this.onGround && eq.spikedBoots && this.hitWall && this.inputX !== 0 && this.vy > 0) {
        this.vy = Math.min(this.vy, 1.5); // 贴墙缓降
        this.fallStartY = null;
        this.wallCling = true;
        if (this.inputJump) { // 蹬墙跳（:21588-21590 同 jumpSpeed/jumpHeight 链）
          this.vy = -(PLAYER_JUMP_SPEED + this.equipStats.jumpSpd) * this.gravDir;
          this.jumpHold = Math.max(PLAYER_JUMP_TICKS, this.equipStats.jumpBoost ? 20 : 0);
          this.vx = -Math.sign(this.vx || this.facing) * 3;
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
      // 坐骑飞行族已独占 vy（上方 Hover/Flight 段）——重力段整体让位（原版 :26637
      // else-if 链互斥语义）；悬停免摔（Hover :3450 fallStart 每帧重置）
      if (mountFlight) {
        grav = 0;
        this.fallStartY = null;
      }
      // 翅膀扇动中（flag19）：原版重力走 :26545 火箭靴 if 的【else-if 链】
      // （!flag19 → 滑翔 → 飞毯 → 常规重力 :27033）——flag19 时整链跳过 = 飞行期
      // 不加重力（WingMovement 的 0.1/0.5 档独立驱动 vy）。曾无条件 +GRAVITY，
      // 扇动 −0.1 被重力 +0.3 盖成净 +0.2/tick → 爬升被掐死在跳跃高度附近
      // （2026-08-13"翅膀飞不高"报障根因）
      if (flying) {
        grav = 0;
        this.fallStartY = null;
      }
      // 重力倒置（gravDir，R7）：方向取反（Player.cs:3207 vy×gravDir 全局语义近似）
      this.vy = gd === 1
        ? Math.min(this.vy + grav, MAX_FALL_SPEED)
        : Math.max(this.vy - grav, -MAX_FALL_SPEED);
      // 老鼠坐骑爬墙速度钉（原版序：重力 :26200s 先行、WallClimb :26436 直写
      // velocity.Y 覆盖）——上 -2/下 4/松手 0.5 精确落碰撞
      if (this.ratClimbVy !== null) this.vy = this.ratClimbVy;
      if (this.buffs.slowFall) this.fallStartY = null;
      // 倒置时天花板即地板（TileCollision.hitHead → onGround 近似）
      if (gd === -1) this.onGround = this.hitHead;
    }
    // ★原版长跳平台段（:20384-20396；湿/干同链——JumpMovement 不分液体，2026-08-16
    //   从干燥分支提出为公共段）：vy==0（撞顶/落地）→ jump=0（:20386 平台段终止）；
    //   否则按住跳期间 vy 恒钉 -jumpSpeed（:20391 每 tick 重置，非累加）+ jump--；
    //   人鱼湿态不减计数（:20392-20400，swimTime≤10 刷 30=无限游泳）；松键不清计数
    //   只停钉（中途再按恢复剩余平台段）。钉速用当帧 effJumpSpd（湿态=液体档，如
    //   水中 6.01；出水瞬间自动切回干燥档——原版 jumpSpeed 是玩家字段的天然结果）。
    //   曾自制 vy-=0.22 累加 + 松键清零（2026-08-15 审计）；曾在干燥分支内使水下跳
    //   丢平台段（2026-08-16 水中跳对齐批修）。
    if (this.jumpHold > 0 && !jumpStartedThisTick) {
      if (this.vy === 0) this.jumpHold = 0;
      else {
        if (this.inputJump) {
          this.vy = -effJumpSpd * gd;
          if ((this.inWater || this.inLava) && !this.ridingMountSwimFree
            && this.equipStats.merman && !this.ridingCart) {
            if (this.swimTime <= 10) this.swimTime = 30;
          }
        }
        // ★平台计时器无条件流逝（原版 jump-- 在 controlJump 门**外**——松键不清计数
        //   :22446 但窗口照常耗尽；曾只在按住时递减 → 松键冻结预算，半空再按恢复
        //   整段钉速 = 免费二段跳（2026-08-19 行为录制定位+坡面探针复现 vy+2.31→-2.55）
        this.jumpHold--;
      }
    }
    if (this.swimTime > 0) this.swimTime--;   // PlayerFrame :35307-35312
    }
    // 松键上升衰减（原版语义 1:1，:22435-22446）：原版无"跳高截断"——松键仅在
    // 下一个 tick 使 vy += 0.01（几乎不衰减，小跳靠 platform 段耗尽前的松键时间差
    // 实现不了，原版跳高基本固定）；曾自制 vy>2→vy=2 狠掐上升（手感大偏，
    // 2026-08-15 审计）。坐骑飞行族（悬停/飞行）vy 独占 tick 让位
    if (!this.inputJump && !mountFlight
      && (this.gravDir === 1 ? this.vy < 0 : this.vy > 0)) this.vy += 0.01 * this.gravDir;

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

    this.dropThrough = !!this.inputDown || this.ratClimbVy !== null;   // 爬墙期间平台穿透（:27777）
    this.stepUp = true; // 原版玩家走 Collision.StepUp（Player.cs:23258/:27753）
    this.stepUpHolds = this.inputUp;   // holdsMatching=controlUp：按住↑行走可踏上站台面（桌子/平台/铁砧…）
    // 跑动/下落撞碎裂砖（Player.Update :27733 CheckIceBreak 后紧随——在 StepDown/StepUp
    // （:27745-27760）与 TileCollision（:27783+）【之前】调用：读碰撞前的完整速度与
    // 上 tick 已落定位置。曾挂在 fixedUpdate 尾部（碰撞后）——空中横移（跳跃顶点
    // vy<1）以 vx 撞脚行裂砖的场景碰撞已清零 vx，速度门必失败，2026-08-17 归位）
    this.checkCrackedBrickBreak(game);
    // 钩爪牵引（GrappleMovement 1:1，Player.cs:22338-22483）——moveAndCollide 前覆写速度
    this.grappleMovement(game);
    // ---- gfxOffY 衰减（Player.cs:27695-27719，TileCollision 前位）。FindPulley
    //      落位同 tick 即衰减一次（原版 FindPulley :25805 早于本段）----
    this.decayGfxOffY();
    // 落地冲击速度留存（原版 TryLandingOnDetonator Player.cs:34368 的 velocity.Y>=3 门；
    // 碰撞前捕获——碰撞会清零 vy。Game 侧消费：落在起爆器 411 上触发电路）
    const impactVy = this.vy;
    const preY = this.y;
    // ---- 水中位移减速（Player.cs:27858-27888 湿态碰撞选档 + WetCollision :23157-23172：
    //      velocity 原值进碰撞、位移 ×factor——水中 vx 照常加速到 3，只是每 tick 只走
    //      一半路程。经 moveAndCollide 的 liqFactor 入口（NPC MoveWhileWet 同机制）。
    //      选档：shimmerWet→0.375(num111) > honeyWet&&!ignoreWater→0.25 >
    //      wet&&!merman&&!ignoreWater&&!trident→0.5（岩浆同 0.5，num109/num110）>
    //      其余 DryCollision=1。ignoreWater = 游泳族坐骑(:9585-9604) ∪ 脚蹼药 109
    //      (:9852) ∪ 星旋强化翼 wingSlot26(:14906-14908)；trident=手持三叉戟 277
    //      (:12487-12490)。shimmering 穿墙分支不走 moveAndCollide，不消费此值。----
    {
      const ignoreWater = this.ridingMountSwimFree
        || this.buffs.has(BuffType.FlipperPotion)
        || this.equipStats.wing?.slot === 26;
      const heldIt2 = this.inv.heldItem();
      const heldVid2 = heldIt2 ? (ITEM_DEFS[heldIt2.id]?.vid ?? viIdFromKey(ITEM_DEFS[heldIt2.id].key)) : -1;
      this.liqFactor = this.inShimmer ? 0.375
        : this.inHoney && !ignoreWater ? 0.25
        : (this.inWater || this.inLava) && !this.merman && !ignoreWater && heldVid2 !== 277 ? 0.5
        : 1;
    }
    if (this.shimmering) {
      // 穿墙下坠（Player.cs:27868-27870）：position += velocity × 0.375（num111）——
      // **完全绕过 tile collision**（moveAndCollide/DryCollision 不跑），穿湖底与
      // 岩层直落；onGround/hitWall 不更新（原版同语义——穿墙中不落地不贴墙）
      this.x += this.vx * 0.375;
      this.y += this.vy * 0.375;
      this.landImpactVy = 0;
    } else {
      moveAndCollide(this, world, this.vx, this.vy);
      this.landImpactVy = this.onGround && impactVy >= 3 ? impactVy : 0;
    }
    this.bordersMovement(world);
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
    // 狼人（月亮符 485 + 夜间：Player.cs:11488-11501 链 !dayTime && wolfAcc && !merman——
    // else 分支 DelBuff：人鱼化（accMerman 浸水态 merman）期间狼人 buff 直接移除，
    // 回复/近战加成随 buff 一起失效）
    if (this.equipStats.wolfAcc && !this.merman && !(game.world.clock?.isDay ?? true)) {
      this.buffs.apply(BuffType.Werewolf, 2);
    } else if (this.buffs.has(BuffType.Werewolf)) {
      this.buffs.remove(BuffType.Werewolf);
    }
    // 夜/日食相位（月亮石 900 天界石复合门 :14871-14874；equipStatsKey 的 N/d 档输入）
    this.nightPhase = !(game.world.clock?.isDay ?? true) || game.world.clock?.eclipse === true;
    // 冰冻护盾族（冰龟壳 1253/冰冻盾 3997 :14348-14351）：半血以下每帧 AddBuff(62,5)；
    // buff 侧 :10148-10152 超半血 DelBuff——同构为 else 移除（回复跨过半血的当帧即掉）
    if (this.equipStats.iceBarrierAcc && this.hp <= this.maxHp / 2) {
      this.buffs.apply(BuffType.IceBarrier, 5 / 60);
    } else if (this.buffs.has(BuffType.IceBarrier)) {
      this.buffs.remove(BuffType.IceBarrier);
    }
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
    // BOC 闪避脉冲消费（BrainOfConfusionDodge :38331-38340 后半：AddBuff(321,240)=4s。
    // R5-F25：困惑近敌是 Hurt :38690-38721 命中侧 Retaliate 分支（Game.damagePlayer）,
    // 闪避侧只挂 321——旧消费端在此困惑近敌系错位,已移） */
    if (this.bocPulse > 0) {
      this.bocPulse = 0;
      this.buffs.apply(BuffType.BrainOfConfusionBuff, 4);
    }
    // 潜行（1:1 改写 1457 :25930-26021）：蘑菇矿套=移动蓄(|vx|+|vy|)×0.0075/t、
    // 静止散 0.015/t 且衰减拍 stealthTimer=30（:25991——原版无 useTime 置 5、无 ==0 门）；
    // 星璇套=双击↓开关 vortexStealthActive
    // （开时 stealth 从满每 t -0.04、移速 ×0.3；再双击关）——星璇的增伤/暴在乘区读同一 stealth
    // ⑭ 变态刀 3106 单件潜行（:25448-25493：挥击中 stealth +0.1/t 且 timer=15；
    // 静止衰减同蘑菇矿；效果在 damageMult/critChance 消费）
    const heldVid = (() => {
      const d = ITEM_DEFS[this.inv.heldItem()?.id ?? -1];
      return d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    })();
    if (heldVid === 3106) {
      if (this.useTime > 0) { this.stealthTimer = 15; if (this.stealth > 0) this.stealth = Math.min(1, this.stealth + 0.1); }
      // :25940 静止衰减分支带 !mount.Active——骑乘不走衰减（落 else 回升段）
      else if (Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1 && !this.mount.active
        && this.stealthTimer === 0 && this.stealth > 0) {
        this.stealth = Math.max(0, this.stealth - 0.02);   // :25944 0.02f（曾误 0.015=蘑菇矿档）
      }
      // :25955-25965 else 段（移动/骑乘）：回升 +0.1/t、骑坐骑 stealth 直归 1（曾整缺
      // ——移动后潜行度冻结不回升、骑坐骑仍保持隐身加成）
      else {
        if (this.stealth > 0) this.stealth = Math.min(1, this.stealth + 0.1);   // :25957-25960
        if (this.mount.active) this.stealth = 1;                                 // :25961-25964
      }
      if (this.stealth > 1) this.stealth = 1;   // :25966-25969 钳顶
      if (this.stealthTimer > 0) this.stealthTimer--;
    } else if (this.equipStats.shroomiteSet) {
      // :25984-25986 静止阈 = maxRunSpeed−0.1（原版此执行点 maxRunSpeed 恒 =originalRunSpeed=3f
      // ——Update 内序:reset :24562 → UpdateBuffs :25763 → 潜行块 :25982-26021 → moveSpeed
      // 乘区 :26206 → 装备/地板/坐骑链 :26707-26859 → HorizontalMovement :26889,乘区与装备
      // 全在潜行块之后、不参与阈值;曾写死 0.1 = 慢速漂移也判"移动",原版 |v|<2.9 全算静止衰减档）
      const num24 = PLAYER_WALK_MAX - 0.1;
      const still = this.vx > -num24 && this.vx < num24 && this.vy > -num24 && this.vy < num24
        && !this.mount.active;   // :25986 骑乘不走衰减,落 else 回升段
      if (still) {
        // :25988-25991 衰减拍:仅 stealth>0 门,每拍 −0.015 且 stealthTimer=30——原版无
        // stealthTimer==0 门、也无 useTime→5（timer 纯"衰减中"标记,衰减停后自 30 递减 :26019-26021）
        if (this.stealth > 0) {
          this.stealth = Math.max(0, this.stealth - 0.015);   // :25990（≤0 钳 0 :25992-25994）
          this.stealthTimer = 30;                             // :25991
        }
      } else {
        this.stealth = Math.min(1, this.stealth + (Math.abs(this.vx) + Math.abs(this.vy)) * 0.0075);   // :26004-26009
        if (this.mount.active) this.stealth = 1;   // :26010-26013 骑坐骑 stealth=1f（曾缺）
      }
      if (this.stealthTimer > 0) this.stealthTimer--;   // :26019-26021
    } else if (this.equipStats.vortexSet) {
      // 双击↓检测（KeyDoubleTap :24740-24749 窗口 15t）——:57444-57448 双击只翻
      // vortexStealthActive 开关、不复位 stealth（衰减/回升段自然处理；曾强置 1 =
      // 半潜行态双击开反而先回满再衰减）
      const downNow = this.inputDown;
      // :57445-57447 KeyDoubleTap:`if (setVortex && !mount.Active)` 才翻转——骑乘中双击↓
      // 不切潜行（曾缺门=骑乘可开潜行,移速 ×0.3 叠骑速且 stealth 照衰减,原版骑乘即断）
      if (downNow && !this.prevDown && this.downTapT > 0 && !this.mount.active) {
        this.vortexStealthActive = !this.vortexStealthActive;
      }
      if (downNow && !this.prevDown) this.downTapT = 15;
      else if (this.downTapT > 0) this.downTapT--;
      this.prevDown = downNow;
      if (this.vortexStealthActive) this.stealth = Math.max(0, this.stealth - 0.04);
      // 未潜行态回升 +0.04/t 至 1（1457 Player.cs:26052-26060 else 分支——缺此段则
      // 关潜行后 stealth 恒 0：渲染 settled=s'≈0.03 近似永久隐身 + (1−s)×0.8 伤/
      // ×20 暴恒满（:26043-26044）。2026-08-23 潜行语义统一批补）
      else this.stealth = Math.min(1, this.stealth + 0.04);
    } else {
      this.stealth = 1;   // 无潜行装=无潜行（1457 Player.cs:26094-26097 else 分支 stealth=1f；初值同 :1545）
      this.vortexStealthActive = false;
    }
    // 星云三族逐级衰减（:11660-11670：到时降 1 级并重挂 480t，非直接清零）
    for (let f = 0; f < 3; f++) {
      if (this.nebula[f] > 0 && --this.nebulaT[f] <= 0) {
        this.nebula[f]--;
        if (this.nebula[f] > 0) this.nebulaT[f] = 480;
      }
    }
    // 星云生命 173-175（:10111-10115 lifeRegen+6/级 = 3HP/s/级）
    if (this.nebula[1] > 0 && this.hp > 0) {
      this.nebulaLifeAccum += 3 * this.nebula[1] * dt;
      if (this.nebulaLifeAccum >= 1) { const n = Math.floor(this.nebulaLifeAccum); this.nebulaLifeAccum -= n; this.hp = Math.min(this.maxHp, this.hp + n); }
    }
    // 星云魔力 176-178（:19214-19226 counter+level/t，>=6 → mana++）
    if (this.nebula[2] > 0) {
      this.nebulaManaAccum += this.nebula[2] * dt;
      if (this.nebulaManaAccum >= 6) { this.nebulaManaAccum -= 6; this.mana = Math.min(this.maxMana, this.mana + 1); }
    }
    // 甲虫球时间蓄能（进攻+防御共用；窗口内每 tick +1，90t/球；受击掉球见 damage()）
    if (this.lastMeleeTick > 0) {
      this.lastMeleeTick--;
      if ((this.equipStats.beetleOff || this.equipStats.beetleDef) && ++this.beetleCharge >= 90) {
        this.beetleCharge = 0;
        this.beetleOrbs = Math.min(3, this.beetleOrbs + 1);
      }
    } else this.beetleCharge = Math.max(0, this.beetleCharge - 2); // 断战缓退
    // 鞭 buff 倒计时（WhipTagEffect.PlayerBuffTime=180 系）
    for (const k of Object.keys(this.whipBuffs)) {
      if (--this.whipBuffs[Number(k)] <= 0) delete this.whipBuffs[Number(k)];
    }
    // 鞭 tag 栈 Update（TagEffectStack.Update :24785——Limit(maxTagEffects) 超限驱逐
    // + 各 state per-NPC 双表递减；1456 的敌侧单值递减已退役）
    this.tagEffectStack.update();
    // 蛇环补挥计数复位（Update_SnakeBand :28623-28628：冷却 120t 走完归 -1）
    if (this.repeatWhipsResetCooldown > 0 && --this.repeatWhipsResetCooldown === 0) {
      this.repeatWhipSwings = -1;
    }
    // 拍击石系冷却递减（Update_SnappingStone :28595-28621）——归零帧按在身饰品
    // 三选一回充反馈（★2026-08-24 r15 R15-16 补齐：三段纯 Dust + 三音效）：
    //   accSnappingStone  → Item30(pitch −0.9,vol 0.08) + Spawn_SnappingStoneRecharge
    //   (P57:454-470:10×dust 226,scale .9/fadeIn 1.1/α255→显形,y=半高,v×0.5 再
    //    vy×3,customData=player,noLight/noGravity/noLightEmittance)
    //   accPyroclast      → Item20 + Spawn_PyroclasticStoneRecharge(:437-452:
    //    15×dust 6,scale 1.5/fadeIn 1.1,v=Circular(2,4))
    //   accArmletOfRuin   → Item28(pitch −0.9,vol 0.08) + Spawn_ArmletOfRuinRecharge
    //    (:418-435:10×dust 15,scale .9/fadeIn 1.1/α60,v×0.5 再 vy×3)
    if (this.accSnappingStoneCooldown > 0 && --this.accSnappingStoneCooldown === 0) {
      const es = this.equipStats;
      const cx = this.mountedCenter.x, cy = this.mountedCenter.y;
      if (es.accSnappingStone) {
        game.playSfxWav?.('Item_30', 0.08, cx, cy, -0.9);
        this.emitRechargeDust(game, 226, 10, 0.9, 255, true);
      } else if (es.accPyroclast) {
        game.playSfxWav?.('Item_20', 1, cx, cy);
        this.emitRechargeDust(game, 6, 15, 1.5, 255, false);
      } else if (es.accArmletOfRuin) {
        game.playSfxWav?.('Item_28', 0.08, cx, cy, -0.9);
        this.emitRechargeDust(game, 15, 10, 0.9, 60, true);
      }
    }
    // ---- 1457 配饰四件运行态（Update_AmmoCycler :28632 / Update_SentryBackpack
    //      :28640 / Update_HarpyCharm :28648 / Update_TimerCrit :28521——原版
    //      Update :24760-24763 同段连排）----
    this.update1457AccBodies(game);

    // 落地摔伤结算（Player.cs:25005-25091：25 格 + extraFall 起伤，超格数 ×10 线性；
    // 翼豁免 flag9=任一盔甲槽 wingSlot>-1；幸运马掌 noFallDmg；落在水里豁免）
    if (this.onGround && this.fallStartY !== null) {
      const fallTiles = (this.y - this.fallStartY) / TILE;
      this.fallStartY = null;
      const feetLiq = world.store.liquid[world.store.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 1) / TILE))];
      const landedInWater = feetLiq > 60 || this.inWater;
      if (landedInWater) { /* 落水缓冲：不计摔伤 */ }
      else if (this.buffs.has(BuffType.Stoned)) {
        // :25066-25075 石化摔伤：(格数-2)×20——无 25 格安全阈值、不吃翼/马掌/
        // noFallDmg 豁免（分支独立于常规链）；幸存 ≤10% → event 8（:25071-25076）
        if (fallTiles > 2) {
          const dmg = Math.max(1, Math.round((fallTiles - 2) * 20));
          this.lastDamageCause = { kind: 'fell' };
          this.damage(dmg, this.cx, this.y - 10);
          game.playSfx('hurt');
          game.addDamageNumber(this.cx, this.y, dmg, false, '#FF5050');
          if (!this.dead && this.hp > 0 && this.hp <= this.maxHp / 10) {
            game.achievements?.handleSpecialEvent(8,
              { statLifeMax: this.maxHp, statManaMax: this.maxMana });
          }
        }
      }
      else if (fallTiles > 25 + this.equipStats.extraFall + (this.ridingMount ? this.mount.extraFall : 0)
        && !(this.equipStats.wing || this.hasHorseshoe || this.equipStats.noFallDmg)) {
        const safeT = 25 + this.equipStats.extraFall + (this.ridingMount ? this.mount.extraFall : 0);
        // 坐骑摔伤系数（Player.cs:25081 num17 *= mount.FallDamage）：兔兔 0.8/史莱姆 0.5/
        // 独角兽 0.2/蜥蜴 0.2/飞行族 0；extraFall 起步豁免（:25011 mount.ExtraFall）
        let dmg = Math.max(1, Math.round((fallTiles - safeT) * 10));
        if (this.ridingMount) {
          // Player.cs:25022-25025：Mount.Type==1（兔兔）落距直接清零——永不摔伤
          // （曾按 fallDamage 0.8 结算错值）；其余乘 mounts[n].fallDamage 系数
          if (this.mount.type === 1) { this.fallStartY = null; return; }
          dmg = Math.max(1, Math.round(dmg * this.mount.fallDamageFactor));
        }
        this.lastDamageCause = { kind: 'fell' };
        this.damage(dmg, this.cx, this.y - 10);
        game.playSfx('hurt');
        game.addDamageNumber(this.cx, this.y, dmg, false, '#FF5050');
        // 成就：摔落幸存（Player.cs:25085-25090：!dead && hp≤maxHp/10 → event 8
        // LUCKY_BREAK；stoned 摔伤分支 :25071-25076 同门——stoned 态本仓未实装）
        if (!this.dead && this.hp > 0 && this.hp <= this.maxHp / 10) {
          game.achievements?.handleSpecialEvent(8,
            { statLifeMax: this.maxHp, statManaMax: this.maxMana });
        }
      }
    }

    // 走跑动画计时（仅地面；空中贴图静态不参与动画）
    if (Math.abs(this.vx) > 0.3 && this.onGround) this.animTime += Math.abs(this.vx);
    else this.animTime = 0;

    // 越界保护
    const maxY = world.h * TILE;
    if (this.y > maxY + 100) this.damage(9999, this.cx, this.y);
    this.prevInputX = this.inputX; // 冲刺双击检测（DoCommonDashHandle release 语义）
    this.jumpEdgePrev = this.inputJump;  // 跳键边沿（tick 尾快照——水中起跳 releaseJump :20409 消费；prevInputJump 在 tick 头快照故不可用）
    // 血肉墙舌头（Player.WOFTongue :21993-22056，Update 内 myPlayer 段调用）
    this.wofTongue(game, world, dt);
    // 钩爪锚点表重建（Player.cs:27991-27992 Update 尾清表）：锚由 GrappleProj
    // 每帧自登记（挂墙 :49797-49801 / 锚定段 :49954-49957），下 tick 消费前重建
    this.grappling[0] = null;
    this.grapCount = 0;
  }

  /** 派对染发剂彩纸（UpdateHairDyeDust Player.cs:23994-24023 1:1）：
   *  门=hairDye==派对 shaderId 且非死亡/石化/冰冻（本仓 shimmering≈frozen 语义）。
   *  独立方法供 MP 远端代理同门补掷（代理不走 fixedUpdate,原版各端对全部
   *  Main.player 跑此尘——本地/远端双消费,2026-08-20 补远端） */
  updateHairDyeDust(game: GameHooks): void {
    if (this.hairDye !== PARTY_HAIR_DYE_SHADER_ID || this.dead || this.shimmering) return;
    const jit = () => 1 + (Math.floor(Math.random() * 101) - 50) * 0.01;   // 1±0.5
    if (Math.random() < 1 / 45) {
      // 尘 139-142（Next(139,143) 上界排除）：盒 width×8、scale 1.2×(0.7±0.3)、
      // 速度 ×(1±0.5)+±0.5、vy−1、+自身速度×0.2
      const d = game.vanillaDust?.spawn(this.x, this.y, this.w, 8,
        139 + Math.floor(Math.random() * 4), 0, 0, 0, null, 1.2);
      if (d) {
        d.vx = d.vx * jit() + jit() - 0.5 + this.vx * 0.2;
        d.vy = d.vy * jit() + jit() - 0.5 - 1 + this.vy * 0.2;
        d.scale *= 0.7 + (Math.floor(Math.random() * 61) - 30) * 0.01;
      }
    }
    if (Math.random() < 1 / 225) {
      // 内脏 gore 276-282（Next(276,283) 上界排除）：NewGore 自带抖动后再
      // ×(1±0.5)+±0.5、vy−1、scale×(1±0.2)、+自身速度×0.2
      const g = GorePiece.newGore(276 + Math.floor(Math.random() * 7),
        this.x + Math.random() * this.w, this.y + Math.random() * 8, 0, 0, 1, false);
      if (g) {
        g.vx = g.vx * jit() + jit() - 0.5 + this.vx * 0.2;
        g.vy = g.vy * jit() + jit() - 0.5 - 1 + this.vy * 0.2;
        g.scale *= 1 + (Math.floor(Math.random() * 41) - 20) * 0.01;
      }
    }
  }

  /** CheckCrackedBrickBreak（Player.cs:23040-23110 全 1:1）：跑动/下落撞上地牢
   *  裂砖族（481-483）徒手撞碎一片。速度门：|vx|>rand(2,12) 或 vy>rand(2,12)；
   *  vy<1 时脚底三点（Bottom/BottomLeft/BottomRight+1px）任一为"实心非裂砖"
   *  则不触发（站在普通地面跑不算）；扫掠命中格压 vy→1；破坏区=预测位外扩
   *  （横 ±(16+8)px、脚行至 +2 行）内全部"上方无实心"的裂砖 KillTile（掉落）。 */
  private checkCrackedBrickBreak(game: GameHooks): void {
    if (this.shimmering || this.dead) return;               // :23043 shimmering 豁免
    const st = game.world.store;
    const cxT = Math.floor(this.cx / 16), cyT = Math.floor(this.cy / 16);
    if (cxT < 10 || cyT < 10 || cxT >= st.w - 10 || cyT >= st.h - 10) return;  // InWorld 10
    let flag = (2 + Math.random() * 10) < Math.abs(this.vx)
      || (2 + Math.random() * 10) < this.vy;                // rand.Next(2, 12)
    if (flag && this.vy < 1) {
      const feetY = Math.floor((this.y + this.h + 1) / 16); // Bottom + UnitY
      for (const px of [this.x + this.w / 2, this.x, this.x + this.w]) {
        const tx = Math.floor(px / 16);
        if (!st.inBounds(tx, feetY)) continue;
        const t = st.get(tx, feetY);
        if (t === 0) continue;
        const d = TILE_DEFS[t];
        // SolidTileAllowBottomSlope && !CrackedBricks（:23060）→ 站普通地面不触发
        if (d?.solid && !d.platform && !isCrackedSheet(d.vanilla?.sheet)) { flag = false; break; }
      }
    }
    if (!flag) return;
    const pvx = this.x + this.vx;                            // position + velocity（:23072）
    const num = Math.floor(pvx / 16), num2 = Math.floor((pvx + this.w) / 16);
    const num3 = Math.floor((this.y + this.h + 1) / 16);
    const solidTopAt = (x: number, y: number): boolean => {  // WorldGen.SolidTile
      if (!st.inBounds(x, y)) return false;
      const t = st.get(x, y);
      if (t === 0) return false;
      const d = TILE_DEFS[t];
      return !!d?.solid && !d.platform;
    };
    const rx = this.x - 1, ry = this.y - 1, rw = this.w + 2, rh = this.h + 2;  // getRect Inflate(1,1)
    let hit = false;
    for (let i = num; i <= num2; i++) {
      for (let j = num3; j <= num3 + 1 && i >= 0 && i < st.w && j >= 0 && j < st.h; j++) {
        if (isCrackedAt(st, i, j) && !solidTopAt(i, j - 1)
          && i * 16 < rx + rw && i * 16 + 16 > rx
          && j * 16 < ry + rh && j * 16 + 16 > ry) {
          hit = true;
          if (this.vy > 1) this.vy = 1;                      // :23091 速度钳
        }
      }
    }
    if (!hit) return;
    // 破坏区（:23099-23106：(x−16−8)/16 .. (x+w+16+8)/16，脚行 num3..num3+2）
    const k0 = Math.floor((pvx - 16 - 8) / 16), k1 = Math.floor((pvx + this.w + 16 + 8) / 16);
    for (let k = k0; k <= k1; k++) {
      for (let l = num3; l <= num3 + 2; l++) {
        if (isCrackedAt(st, k, l) && !solidTopAt(k, l - 1)) game.breakTile?.(k, l);
      }
    }
  }

  // ==================== 钩爪（Grappling Hooks 1:1）====================
  // 原版锚点表登记（Projectile.cs:49797-49801 挂墙 / :49954-49957 锚定段每帧重登记；
  // grapCount < 10 上限）
  registerGrapple(g: GrappleProj): void {
    if (this.grapCount < 10) {
      this.grappling[this.grapCount] = g;
      this.grapCount++;
    }
  }

  /** 发射时登记在役钩（= 原版扫 Main.projectile[owner] aiStyle==7，Player.cs:5984） */
  registerGrappleProj(g: GrappleProj): void {
    if (!this.grappleProjs.includes(g)) this.grappleProjs.push(g);
  }

  /** Kill 反注册（GrappleProj.kill） */
  unregisterGrapple(g: GrappleProj): void {
    const i = this.grappleProjs.indexOf(g);
    if (i >= 0) this.grappleProjs.splice(i, 1);
  }

  /** 现役锚定格集合（SmartCursorHelper.cs:106-115 _grappleTargets：
   *  锚点表各锚 Center 的 tile 坐标——智能光标镐线终点/免挖集） */
  grappleAnchorTiles(): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < this.grapCount; i++) {
      const g = this.grappling[i];
      if (g) out.push({ x: Math.floor(g.cx / TILE), y: Math.floor(g.cy / TILE) });
    }
    return out;
  }

  /** Player.RemoveAllGrapplingHooks（Player.cs:33106-33116）：清黑名单 + 清锚点表 +
   *  杀全部自有 aiStyle7 弹体 */
  removeAllGrapplingHooks(): void {
    this.clearGrapplingBlacklist();
    this.grappling[0] = null;
    this.grapCount = 0;
    for (const g of this.grappleProjs) g.kill();
    this.grappleProjs.length = 0;
    this.goingDownWithGrapple = false;
  }

  /** Player.ClearGrapplingBlacklist（:5880-5882） */
  clearGrapplingBlacklist(): void {
    this.grappleBlacklist.clear();
  }

  /** Player.IsBlacklistedForGrappling（:5885-5887） */
  isBlacklistedForGrappling(x: number, y: number): boolean {
    return this.grappleBlacklist.has(x * 100000 + y);
  }

  /** Player.UpdateBlacklistedTilesForGrappling（:5890-5927）：
   *  每个已锚钩的 3×3 邻域中【非实心】格入黑名单（防同点叠锚——实心格本就可挂，
   *  此名单实际只拦截平台/轨道等非实心可挂格）+ 轨道/平台锚的 5×5 同族格网。
   *  store 缺省取 lastStore（fixedUpdate 每帧刷新）；GrappleProj 挂墙回调显式传入 */
  updateBlacklistedTilesForGrappling(store?: import('../world/TileStore').TileStore): void {
    this.clearGrapplingBlacklist();
    const st = store ?? this.lastStore ?? null;
    if (!st) return;
    for (const g of this.grappleProjs) {
      if (!g.latched) continue;                            // :5893-5895 ai[0]!=2 跳过
      const px = Math.floor(g.cx / TILE);
      const py = Math.floor(g.cy / TILE);
      for (let j = -1; j <= 1; j++) {                      // :5897-5905 3×3 非实心
        for (let k = -1; k <= 1; k++) {
          if (!st.inBounds(px + j, py + k)) continue;
          if (!st.isSolid(px + j, py + k)) {
            this.grappleBlacklist.add((px + j) * 100000 + (py + k));
          }
        }
      }
      const sheet = TILE_DEFS[st.get(px, py)]?.vanilla?.sheet ?? -1;
      if (sheet !== TRACK_SHEET && !TILE_DEFS[st.get(px, py)]?.platform) continue; // :5907-5909
      for (let l = -2; l <= 2; l++) {                      // :5911-5925 5×5 同族格网
        for (let m = -2; m <= 2; m++) {
          if (!st.inBounds(px + l, py + m)) continue;
          const s2 = TILE_DEFS[st.get(px + l, py + m)]?.vanilla?.sheet ?? -1;
          if (s2 === TRACK_SHEET || TILE_DEFS[st.get(px + l, py + m)]?.platform) {
            this.grappleBlacklist.add((px + l) * 100000 + (py + m));
          }
        }
      }
    }
  }

  /** Player.GrappleMovement（Player.cs:22338-22483）1:1。
   *  在移动积分（moveAndCollide）前调用——覆写 vx/vy 为锚点牵引速度；
   *  跳键沿释放全部钩爪（:22463-22478）；无锚（grappling[0] 空）整段早退（:22340-22342） */
  grappleMovement(game: GameHooks): void {
    if (!this.grappling[0]) {                              // :22340-22342
      this.goingDownWithGrapple = false;
      if (!this.inputJump) this.grappleReleaseJump = true; // :22479-22482 releaseJump 维护
      return;
    }
    // :22347-22347 坐骑挂不得（MountID.Sets.CanUseHooks）——本仓矿车无钩门，骑乘即否
    // :22351-22362 滑翔帧位（wingFrame/canCarpet/rocketFrame 复位 + RefreshMovementAbilities）
    if (this.equipStats.wing) this.wingTime = this.equipStats.wing.time;  // wingTime = wingTimeMax
    if (this.onGround) this.extraJumps = [...this.equipStats.jumpOpts];   // RefreshDoubleJumps
    this.canCarpet = true;
    this.fallStartY = null;                                // fallStart = position.Y/16 → 免摔伤
    // :22367-22373 轨道钩 403 贴轨上车（Minecart.GetOnTrack）——403 仅由右键轨道
    //   发射路径产生，物品族不产出，本仓等价空集（见 grappleHooks.ts 403 条注释）
    // :22353-22356 释放跳跃门（覆写速度【前】的原速度判定——顺序敏感）：
    //   flag = velocity.Length() < 2；flag2 = wet && |vy|<0.02（水面静止）
    const slow = Math.hypot(this.vx, this.vy) < 2;         // :22353-22354
    const wetStill = this.inWater && Math.abs(this.vy) < 0.02; // :22355-22356 flag2
    const [pvx, pvy, dir] = this.getGrapplingForces();
    if (pvy > 0) this.goingDownWithGrapple = true;         // :22381-22383
    else this.goingDownWithGrapple = false;
    const pullingDown = pvy > 0 && this.vy === 0;          // :22385 flag3
    this.vx = pvx;                                         // :22386-22387
    this.vy = pvy;
    // :22394-22434 轨道钩上车段（type 403）——同上空集
    // :22436-22445 ChangeDir（itemAnimation==0 时按牵引方向转身）
    if (this.itemAnimTicks <= 0 && this.useTime <= 0) {    // itemAnimation == 0（窗代理含 useTime）
      if (this.vx === 0 && dir !== 0) this.facing = dir;   // :22438-22441 preferredDirection
      if (this.vx > 0) this.facing = 1;                    // :22442-22445
      if (this.vx < 0) this.facing = -1;
    }
    // :22447-22482 跳键沿 → 释放全部钩爪；速度低（<2）/水面静止/非下拉时附带跳跃
    if (this.inputJump) {
      if (this.grappleReleaseJump) {
        let canJump = wetStill || slow;                    // :22465 flag4 = flag2 || flag
        if (this.inputDown) canJump = false;               // :22467-22469 controlDown 否决
        if (pullingDown && !this.inputUp) canJump = false; // :22470-22472 下拉贴地且未按上
        if (canJump) {
          this.vy = -PLAYER_JUMP_SPEED * this.gravDir;     // :22474 velocity.Y = -jumpSpeed
          this.jumpHold = PLAYER_JUMP_TICKS;               // :22475 jump = jumpHeight
          this.grappleReleaseJump = false;
        } else {
          this.vy += 0.01;                                 // :22478 velocity.Y += 0.01
          this.grappleReleaseJump = false;
        }
        if (this.onGround) this.extraJumps = [...this.equipStats.jumpOpts]; // RefreshDoubleJumps
        this.removeAllGrapplingHooks();                    // :22480
      }
    } else {
      this.grappleReleaseJump = true;                      // :22481-22482
    }
    void game;
  }

  /** Player.GetGrapplingForces（Player.cs:22484-22577）1:1：
   *  返回 [速度X, 速度Y, 期望朝向(0=无)]。锚点质心 - 玩家中心 → 距离缩放到牵引上限 */
  private getGrapplingForces(): [number, number, number] {
    let sumX = 0;
    let sumY = 0;
    let preferredDir = 0;
    let n = 0;
    const gravDir = this.gravDir;
    for (let i = 0; i < this.grapCount; i++) {             // :22490
      const g = this.grappling[i]!;
      if (g.ai0 !== GRAPPLE_LATCH) continue;               // :22493 ai[0] != 2 跳过
      if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) continue; // :22494 HasNaNs
      sumX += g.cx;                                        // :22496-22497 锚点中心累加
      sumY += g.cy;
      n++;
      if (g.projType === 446) {
        // :22500-22512 反重力钩：目标 = 锚点 + normalize(玩家中心 - 锚点 + 输入×100) × 200
        let vx = (this.inputX || 0), vy = ((this.inputDown ? 1 : 0) - (this.inputUp ? 1 : 0)) * gravDir;
        const vl = Math.hypot(vx, vy);
        if (vl > 0) { vx /= vl; vy /= vl; }                // :22505-22507 归一
        vx *= 100; vy *= 100;
        let dx = this.cx - g.cx + vx, dy = this.cy - g.cy + vy;
        const dl = Math.hypot(dx, dy);
        dx = dl > 0 ? dx / dl : 0; dy = dl > 0 ? dy / dl : 0;
        if (dx === 0 && dy === 0) { dx = 0; dy = -1; }     // :22509-22511 NaN → -UnitY
        sumX += dx * 200;                                  // :22513-22515 num4 = 200
        sumY += dy * 200;
      } else if (g.projType === 652) {
        // :22517-22536 静态钩：目标 = 玩家中心 + 绳向×输入投影×6（不拉，只沿绳自由位移）
        let ix = (this.inputX || 0), iy = ((this.inputDown ? 1 : 0) - (this.inputUp ? 1 : 0)) * gravDir;
        const il = Math.hypot(ix, iy);
        if (il > 0) { ix /= il; iy /= il; }                // :22518 SafeNormalize
        const ax = g.cx - this.cx, ay = g.cy - this.cy;    // :22519 vector3 = 锚 - 玩家
        const al = Math.hypot(ax, ay);
        const ux = al > 0 ? ax / al : 0, uy = al > 0 ? ay / al : 0; // :22520 vector4
        let projX = 0, projY = 0;
        if (il > 0) {                                      // :22523-22525 value = vector4 × Dot(vector4, 输入)
          const d = ux * ix + uy * iy;
          projX = ux * d; projY = uy * d;
        }
        let mult = 6;                                      // :22527 num5 = 6
        if ((projX * ax + projY * ay) < 0 && al >= 600) mult = 0; // :22529-22531 背离且绳尽 → 0
        sumX += -ax + projX * mult;                        // :22533-22534
        sumY += -ay + projY * mult;
      } else if (g.projType === 865) {
        // :22538-22546 松鼠钩：目标 = 锚点 - 绳向×28（垂吊在锚下 28px，绳向按 90° 吸附）
        const a = g.rot - Math.PI / 2;
        let ux = Math.cos(a), uy = Math.sin(a);            // :22538 ToRotationVector2
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        sumX += -ux * 28;                                  // :22540-22541 vector6 = -vector5 × 28
        sumY += -uy * 28;
        if (ux !== 0) preferredDir = ux > 0 ? 1 : -1;      // :22543-22545 preferredPlayerDirection
      }
    }
    if (n === 0) return [this.vx, this.vy, 0];             // :22548-22552 num3==0 → 保留原速度
    const tx = sumX / n;                                   // :22554-22555 质心
    const ty = sumY / n;
    let pvx = tx - this.cx;                                // :22558-22560 vector7 = fromPosition
    let pvy = ty - this.cy;
    const len = Math.hypot(pvx, pvy);                      // :22561-22562 num8
    let maxSpeed = 11;                                     // :23016 num9 = 11
    const first = this.grappling[0]!;
    if (first.projType === 315) maxSpeed = 14;             // :23019-23021 蝙蝠钩
    if (first.projType === 73 || first.projType === 74) maxSpeed = 12.5; // 1457 :23022-23025
                                                                         //   双钩蓝/红(DualHook) 11 → 12.5
    if (first.projType === 487) maxSpeed = 12;             // :23026-23028 荆棘钩
    if (first.projType >= 646 && first.projType <= 649) maxSpeed = 16; // :23029-23034 月亮钩
    const k = len > maxSpeed ? maxSpeed / len : 1;         // :22572-22574 num10
    pvx *= k;
    pvy *= k;
    return [pvx, pvy, preferredDir];
  }

  /** Player.DoQueenSlimeHookTeleport（Player.cs:22486-22506）1:1：
   *  150 步 × 12px 朝目标步进（TileCollision 碰撞贴墙停），落点即传送。
   *  AI_007 挂墙回调（Projectile.cs:49876-49878 type==935） */
  doQueenSlimeHookTeleport(targetX: number, targetY: number, game: GameHooks): void {
    const steps = 150;                                     // :22488 num = 150
    let px = this.x;
    let py = this.y;
    let sx = 0;
    let sy = 0;
    const body = {
      x: px, y: py, w: this.w, h: this.h, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false,
    };
    for (let i = 0; i < steps; i++) {
      const dx = targetX - (px + this.w / 2);
      const dy = targetY - (py + this.h / 2);
      const dl = Math.hypot(dx, dy) || 1;
      sx = (dx / dl) * 12;                                 // :22494 DirectionTo × 12
      sy = (dy / dl) * 12;
      body.x = px; body.y = py; body.vx = sx; body.vy = sy;
      moveAndCollide(body, game.world, sx, sy);            // :22496 TileCollision
      px = body.x;
      py = body.y;
    }
    this.x = px;
    this.y = py;
    this.vx = 0;
    this.vy = 0;
    game.spawnBurst?.(this.cx, this.cy, '#58B8E8', 14, 3, -Math.PI / 2, Math.PI, { life: 24 });
  }

  /** 狂卷之舌 DoT 分块累加器（专家 50 HP/s，:18905-18910 lifeRegen-100；
   *  :19136-19148 -600 阈值 → 每 6t 弹 HurtLifeRegen(5)） */
  private tongueDotAcc = 0;

  /** Player.WOFTongue（Player.cs:21993-22056）1:1：
   *  gross=惊恐 37（见到墙）、tongued=狂卷之舌 38（高于地狱层/绕到墙后）。
   *  - 墙嘴前沿 140px 带且 gross → 每帧 Hurt(50×难度缩放)，强制击退（:22003-22007）
   *  - 未 gross 且身处地狱视野内 → 上 37 + 播 Zombie_10 尖啸（:22009-22012）
   *  - gross 且（高于地狱层 或 绕到墙背后 40px）→ 上 38（:22014-22027）
   *  - tongued：封道具/钩爪（:22032-22041）+ 专家 50 HP/s DoT（:18905-18910）+
   *    舌距中心 >3000px（:22044-22048）或墙抵世界边（:22049-22052）→ KillMe */
  private wofTongue(game: GameHooks, world: import('../world/World').World, dt: number): void {
    if (this.dead) return;
    // :21993-21997 Main.wofNPCIndex<0 / 墙 inactive → 直接返回
    //（enemies 可选调用：测试假宿主常缺该钩子）
    const wall = ((game.enemies?.() ?? []) as Enemy[]).find((n) => !n.dead && n.vanillaId === 113) ?? null;
    if (!wall) return;
    // UpdateBuffs :10578-10587：buff 37 在且墙在场 → gross + buffTime 钳 10（apply 续期）；
    // 墙不在场则不续期自然消散（原版 DelBuff）
    const gross = this.buffs.has(BuffType.Horrified);
    if (gross) this.buffs.apply(BuffType.Horrified, 10 / 60);
    const tongued = this.buffs.has(BuffType.TheTongue);
    // :22000-22002 墙嘴前沿 X（墙朝东再退 96px）
    let mouth = wall.x + 40;
    if (wall.facing > 0) mouth -= 96;
    // :22003-22007 墙前 140px 带且 gross → 每帧 50 伤（难度缩放，走墙的难度档）
    if (this.x + this.w > mouth && this.x < mouth + 140 && gross) {
      const dmg = getAttackDamageScaledByDifficulty(50, wall.difficulty);
      this.lastDamageCause = { kind: 'npc', name: 'Wall of Flesh' };
      if (this.damage(dmg, wall.cx, wall.cy)) {
        game.playSfx('hurt');
        game.addDamageNumber(this.cx, this.y, this.damagePreview(dmg), false, '#FF5050');
        // :22005 noKnockback=false——舌击无视钴盾族免击退，沿墙推进方向弹开。
        // 原版走 Hurt(hitDirection=墙 direction)（:22007）→ 击退段 = 固定
        // velocity.X = 4.5×direction / velocity.Y = -3.5（Player.cs:37910-37912）
        this.vx = (wall.facing >= 0 ? 1 : -1) * 4.5;
        this.vy = -3.5;
        this.fallStartY = this.y;   // fallStart 重置（:37912 同段）
      }
    }
    // :22009-22012 未 gross 且身处地狱带（>h-250 格）且在墙嘴 ±MaxWorldViewSize.X
    //  （Main.cs:736-740 = 1920）视野内 → 上 37 + Zombie_10 尖啸
    if (!gross && this.y > (world.h - 250) * TILE
      && this.x > mouth - 1920 && this.x < mouth + 1920) {
      this.buffs.apply(BuffType.Horrified, 10 / 60);
      // PlaySound(4,…,10)=NPC_Killed_10(case4 死音库;曾误 Zombie_10,终审修)
      game.playSfxWav?.('NPC_Killed_10', 1, wall.cx, wall.cy);
    }
    // :22014-22027 gross 且 高于地狱层 / 绕到墙背后（越过墙中心 40px）→ 上 38
    // ★地狱层 = UnderworldLayer(h-200)——曾用 world.lavaLine(生成参数岩浆线,
    // 比 h-200 浅 ~170 格)致玩家爬到洞穴层就被上舌(bossAI_wof 头注同款坑,终审修)
    if (gross) {
      if (this.y < (world.h - 200) * TILE) {
        this.buffs.apply(BuffType.TheTongue, 10 / 60);
      }
      if (wall.facing < 0) {
        if (this.cx > wall.cx + 40) this.buffs.apply(BuffType.TheTongue, 10 / 60);
      } else if (this.cx < wall.cx - 40) {
        this.buffs.apply(BuffType.TheTongue, 10 / 60);
      }
    }
    // :22032 以下 tongued 效果实装：
    //  ① controlUseItem/controlHook=false——道具门禁由 Game.updateUse 读本 buff（钩爪
    //    系统未实装，aiStyle 7 弹 Kill 段 :22036-22041 登记不适用）
    if (!tongued) return;
    //  ② 专家 DoT（:18905-18910 lifeRegen-100 = 50 HP/s，正回复清零 + 爬坡计时清零；
    //     :19136-19148 -600 阈值分块 HurtLifeRegen(5) → 每 0.1s 弹 5，无视无敌帧/防御）
    if (mainExpertMode(world)) {
      this.lifeRegenTime = 0;
      this.tongueDotAcc += 50 * dt;
      let chunk = 0;
      while (this.tongueDotAcc >= 5) { this.tongueDotAcc -= 5; chunk += 5; }
      if (chunk > 0) {
        this.hp = Math.max(0, this.hp - chunk);
        game.addDamageNumber(this.cx, this.y, chunk, false, '#FF3C46', true);
        // :19144-19149 statLife<=0 → KillMe(ByOther(12)) WasLicked
        if (this.hp <= 0) this.lastDamageCause = { kind: 'tongued' };
      }
    }
    //  ③ 舌距 >3000px（:22044-22048）/ 墙抵世界两侧（:22049-22052）→ KillMe(1000)
    if (Math.hypot(wall.cx - this.cx, wall.cy - this.cy) > 3000
      || wall.x < 608 || wall.x > (world.w - 38) * TILE) {
      // KillMe 绕无敌帧直死（原版 ByOther(11)/(12) 文案包未移植 → npc 归因）
      this.lastDamageCause = { kind: 'npc', name: 'Wall of Flesh' };
      this.iframes = 0;
      this.hp = 0;
    }
  }

  /** breathCDMax（Player.cs:3693-3710，属性每次读重算）：基础 7 tick；
   *  芦苇管（手持 186 且非挥舞中）×2；accDivingHelm ×6 → 7/14/42 */
  get breathCDMax(): number {
    let n = 7;
    if (this.hasBreathingReed && this.itemAnimTicks === 0) n *= 2;
    if (this.equipStats.divingHelm) n *= 6;
    return n;
  }
  /** hasBreathingReed（Player.cs:3974-3987）：选中快捷栏格为 186 芦苇管。
   *  原版 mount.Active 时查 MountID.Sets.DontHoldItems——本作无坐骑，省略 */
  get hasBreathingReed(): boolean {
    const held = this.inv.heldItem();
    if (!held) return false;
    const d = ITEM_DEFS[held.id];
    return (d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1)) === 186;
  }

  // 输入状态由 Game 每帧写入
  inputX = 0;
  inputJump = false;
  /** Player.maxRunSpeed（常规跑速上限 stat，:25695 base 3 × moveSpeed 乘区；
   *  水中/蜂蜜等场景折扣不在此列——矿车撞击速比等按 stat 口径消费）。
   *  1457: moveSpeed 乘区含 strongestMoveSpeedDebuff（Update :26205 maxRunSpeed *=
   *  moveSpeed，debuff 已折入） */
  get maxRunSpeed(): number {
    return PLAYER_WALK_MAX * this.buffs.moveSpeedMult * this.equipStats.moveMult
      * Math.min(this.buffs.strongestMoveSpeedDebuff, this.shieldRaised ? 1 / 3 : 1);
  }

  /** Player.CCed（1457 Player.cs:6291/:21738 等消费；1456 为 frozen||webbed||stoned
   *  内联三元，1457 收敛为属性，语义同）——硬控三件套 */
  get cced(): boolean {
    return this.buffs.has(BuffType.Frozen) || this.buffs.has(BuffType.Webbed)
      || this.buffs.has(BuffType.Stoned);
  }
  // ---- 钩爪（AI_007 + GrappleMovement 1:1）----
  /** 本 tick 锚点表（原版 player.grappling[10] + grapCount，Player.cs:2608/:2828）：
   *  GrappleProj 挂墙/锚定段每帧登记（Projectile.cs:49797-49801/:49954-49957），
   *  grappleMovement 消费后于本 tick 尾重建（原版 Player.cs:27991-27992 清表） */
  grappling: (GrappleProj | null)[] = new Array(10).fill(null);
  grapCount = 0;
  /** 本玩家全部在役钩爪弹体（= 原版扫 Main.projectile[owner].aiStyle==7，
   *  Player.cs:5984/:33113；发射登记 / Kill 反注册） */
  grappleProjs: GrappleProj[] = [];
  /** 跳键沿（原版 releaseJump，GrappleMovement :22463-22477 消费）——松跳置 true */
  grappleReleaseJump = true;
  /** 钩爪下垂中（原版 GoingDownWithGrapple :22381-22383，fall damage 门 :27778） */
  goingDownWithGrapple = false;
  /** 钩爪锚格黑名单（UpdateBlacklistedTilesForGrappling，Player.cs:2896-2926）：
   *  packed = x * 100000 + y */
  private grappleBlacklist = new Set<number>();
  /** 多段跳剩余段（原版 RefreshDoubleJumps：落地时重置为 equipStats.jumpOpts 拷贝） */
  extraJumps: string[] = [];
  /** 当前进行中的多段跳型（isPerformingJump_* 等价；落地清除——上升尾迹分支门） */
  performingJump: string | null = null;
  /** 跑靴脚步声冷却（hermesStepSound.IntendedCooldown=9 :35519） */
  runSoundDelay = 0;
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
  /** 翅膀喷尘/喷射音（WingAirVisuals :30284-30547 + WingFrame 各分支尘 :29031+/
   *  :29337+/:29845+/:29730+/:30025+ + 滑翔段尘 :26914+/:26958+ + 47/49/50 三函数
   *  :30063-30270）。原版 Main.rand.Next(a,b)=[a,b)；本批 Dust 池缺省（无 Game）
   *  时静默跳过。 */
  /** SpawnFastRunParticles（:19935-20027 1:1）：跑靴快速奔跑尘+脚步声。
   *  门（:19697/:19731）：|vx| > (accRunSpeed+maxRunSpeed)/2 && vy==0 && 无坐骑。
   *  ★调用点必须嵌在爬坡分支（else-if B）内——分支入口门 |vx|<accRunSpeed 与尘门
   *  中点构成互斥带；裸装 accRun==maxRun → 带空永不触发（勿再提升为全局判定）。
   *  分支（按装备 vid 授予 :36285）：4874 泰拉闪耀=火尘6 / 3200·3990 航行靴=尘253×4 /
   *  1579 冰靴=雪尘76×2 / 4055 沙丘行者=沙尘32 / 3993 仙灵火花=仙尘61族×2 /
   *  其余跑靴（赫尔墨斯 54/闪电 405/幽灵 898/霜花 1862 等）=白尘16+脚步声
   *  （hermesStepSound=SoundID 17 冷却 9t :35517-35519）。鞋染料 shader 不建模。 */
  private spawnFastRunParticles(game: GameHooks, maxRun: number, accRun: number): void {
    if (this.ridingMount || this.vy !== 0) return;
    if (Math.abs(this.vx) <= (accRun + maxRun) / 2) return;
    const gd = this.gravDir;
    const off = gd === -1 ? -this.h : 0;
    const feetY = this.y + this.h + off;
    const D = game.vanillaDust;
    const eq0 = this.equipStats;
    const fx = eq0.bootFx;
    // cShoe 鞋染料（:9355-9369）——尘带 dyeVid，渲染端跑 SM2 染料字节码（63 pass
    // 全技术 1:1：ArmorColored 主色族静态缓存，彩虹/凝胶/反射等动态族逐帧真跑）
    const shoeDye = eq0.bootDyeVid;
    // 翅靴分支（:19947 if 链首，优先于五靴型）：wings==3 或 时装槽 668（Red's
    // Leggings → vanityRocketBoots=6 :12667-12670）→ 尘186×2（翅膀染料色 cWings）
    const vanity668 = this.inv.armor.slice(10).some((it) => {
      if (!it) return false;
      const d = ITEM_DEFS[it.id];
      return d ? (d.vid ?? viIdFromKey(d.key)) === 668 : false;
    });
    if (eq0.wing?.logic === 3 || vanity668) {
      const wingDye = this.wingDyeVid();
      for (let n = 0; n < 2; n++) {
        const d = D ? D.spawn(this.x - 4, feetY, this.w + 8, 4, 186,
          -this.vx * 0.5, this.vy * 0.5, 50, null, 1.5) : null;
        if (d) { d.vx *= n === 0 ? 0.025 : 0.2; d.vy *= n === 0 ? 0.025 : 0.2; d.dyeVid = wingDye; }
      }
      return;
    }
    if (fx === 'hellfire') {
      const d = D ? D.spawn(this.x - 4, feetY, this.w + 8, 4, 6, -this.vx * 0.5, this.vy * 0.5, 50, null, 2) : null;
      if (d) { d.dyeVid = shoeDye; d.vx *= 0.2; d.vy = -1.5 - Math.random() * 0.5; d.fadeIn = 0.5; d.noGravity = true; }
    } else if (fx === 'sail') {
      for (let i = 0; i < 4; i++) {
        const d = D ? D.spawn(this.x - 4, this.y, this.w + 8, this.h, 253, -this.vx * 0.5, this.vy * 0.5, 100, null, 1.5) : null;
        if (!d) continue;
        d.dyeVid = shoeDye;
        d.noGravity = true;
        d.vx *= 0.2; d.vy *= 0.2;
        d.scale += (Math.random() * 8 - 5 | 0) * 0.1;
      }
    } else if (fx === 'desert') {
      const d = D ? D.spawn(this.x - 4, feetY, this.w + 8, 4, 32, -this.vx * 0.5, this.vy * 0.5, 0, null, 1) : null;
      if (d) { d.dyeVid = shoeDye; d.vx *= 0.2; d.vy = d.vy * 0.2 - gd * 2; }
    } else if (fx === 'cold') {
      for (let j = 0; j < 2; j++) {
        const d = D ? D.spawn(j === 0 ? this.x : this.x + this.w / 2, this.y + this.h,
          this.w / 2, 6, 76, 0, 0, 0, null, 1.35) : null;
        if (!d) continue;
        d.dyeVid = shoeDye;
        d.scale *= 1 + (20 + Math.random() * 20 | 0) * 0.01;
        d.noGravity = true; d.noLight = true;
        d.vx *= 0.001; d.vy = d.vy * 0.001 - 0.003;
      }
    } else if (fx === 'fairy') {
      const type = [61, 61, 61, 242, 64, 63][Math.random() * 6 | 0];   // NextFromList
      for (let k = 1; k < 3; k++) {
        const d = D ? D.spawn(this.x - 4, feetY, this.w + 8, 4, type, -this.vx * 0.5, this.vy * 0.5,
          0, null, k === 2 ? 1 : 1.5) : null;
        if (!d) continue;
        d.dyeVid = shoeDye;
        d.vx *= 1.5; d.vy *= 1.5;
        if (k === 2) { d.x += d.vx; d.y += d.vy; }
        d.noGravity = true; d.noLightEmittance = true;
      }
    } else {
      // 普通跑靴：尘16 + 脚步声（SoundID 17 → Item_17，IntendedCooldown 9t）
      const d = D ? D.spawn(this.x - 4, feetY, this.w + 8, 4, 16, -this.vx * 0.5, this.vy * 0.5, 50, null, 1.5) : null;
      if (d) { d.dyeVid = shoeDye; d.vx *= 0.2; d.vy *= 0.2; }
      if (this.runSoundDelay <= 0) {
        game.playSfxFiles?.(['Item_17'], 1, this.cx, this.cy);
        this.runSoundDelay = 9;
      }
    }
  }

  /** DoubleJumpVisuals（:21615-21745 1:1）：多段跳上升期持续尾迹——沙暴瓶 3×尘124/
   *  tick + 每 3t gore220-223 沙云（scale 随平台段剩余放大）、云瓶/屁瓶 脚底 1×尘16/188、
   *  暴雪瓶 三段 8×尘76、航行瓶 1-2×尘253。门=performingJump 置位 + 上升中
   *（vy*gravDir<0；航行瓶 <1 放宽）。Game 侧 Update :26445 每帧调用 */
  doubleJumpVisuals(game: GameHooks): void {
    const opt = this.performingJump;
    if (!opt) return;
    const gd = this.gravDir;
    const rising = gd === 1 ? this.vy < 0 : this.vy > 0;
    const D = game.vanillaDust;
    const mk = (x: number, y: number, w: number, h: number, type: number,
      alpha = 0, scale = 1, vx = 0, vy = 0) => D ? D.spawn(x, y, w, h, type, vx, vy, alpha, null, scale) : null;
    if (opt === 'Cloud' && rising) {
      // :21617-21626 尘16（脚底 w+8×4 条带）
      const cy = gd === 1 ? this.y + this.h : this.y - 6;
      const d = mk(this.x - 4, cy, this.w + 8, 4, 16, 100, 1.5, -this.vx * 0.5, this.vy * 0.5);
      if (d) { d.vx = d.vx * 0.5 - this.vx * 0.1; d.vy = d.vy * 0.5 - this.vy * 0.3; }
    } else if (opt === 'Sandstorm' && rising) {
      // :21628-21649 尘124×3 + gore220-223 每 miscCounter%3（沙云随平台段缩放）
      const cy = gd === 1 ? this.y + this.h : -6;
      const num4 = (this.jumpHold / 75 + 1) / 2;
      for (let i = 0; i < 3; i++) {
        const d = mk(this.x, this.y + (cy === -6 ? -3 : this.h / 2), this.w, 32, 124, 150, 1 * num4,
          this.vx * 0.3, this.vy * 0.3);
        if (d) { d.vx *= 0.5 * num4; d.vy *= 0.5 * num4; d.fadeIn = 1.5 * num4; }
      }
      if (this.miscCounter % 3 === 0) {
        const g = GorePiece.newGore(220 + (Math.random() * 3 | 0),
          this.x + this.w / 2 - 18, this.y + this.h / 2, -this.vx, -this.vy, num4, false);
        if (g) { g.vx = this.vx * 0.3 * num4; g.vy = this.vy * 0.3 * num4; g.alpha = 100; }
      }
    } else if (opt === 'Fart' && rising) {
      // :21651-21661 尘188（同云瓶式再 ×0.5）
      const cy = gd === 1 ? this.y + this.h : this.y - 6;
      const d = mk(this.x - 4, cy, this.w + 8, 4, 188, 100, 1.5, -this.vx * 0.5, this.vy * 0.5);
      if (d) { d.vx = d.vx * 0.5 - this.vx * 0.1; d.vy = d.vy * 0.5 - this.vy * 0.3; d.vx *= 0.5; d.vy *= 0.5; }
    } else if (opt === 'Blizzard' && rising) {
      // :21701-21743 三段尘76：2 粒慢散 + 3 粒顺速 + 3 粒逆速（noGravity/noLight）
      const by = gd === 1 ? this.y + this.h - 6 : this.y + 6;
      for (let k = 0; k < 2; k++) {
        const d = mk(this.x, by, this.w, 12, 76, 0, 1, this.vx * 0.3, this.vy * 0.3);
        if (!d) continue;
                d.vx *= 0.1; d.vy *= 0.1;
        if (k === 0) { d.vx += this.vx * 0.03; d.vy += this.vy * 0.03; }
        else { d.vx -= this.vx * 0.03; d.vy -= this.vy * 0.03; }
        d.vx -= this.vx * 0.1; d.vy -= this.vy * 0.1;
        d.noGravity = true; d.noLight = true;
      }
      for (let l = 0; l < 3; l++) {
        const d = mk(this.x, by, this.w, 12, 76, 0, 1, this.vx * 0.3, this.vy * 0.3);
        if (!d) continue;
                d.fadeIn = 1.5; d.vx = d.vx * 0.6 + this.vx * 0.8; d.vy = d.vy * 0.6 + this.vy * 0.8;
        d.noGravity = true; d.noLight = true;
      }
      for (let m = 0; m < 3; m++) {
        const d = mk(this.x, by, this.w, 12, 76, 0, 1, this.vx * 0.3, this.vy * 0.3);
        if (!d) continue;
                d.fadeIn = 1.5; d.vx = d.vx * 0.6 - this.vx * 0.8; d.vy = d.vy * 0.6 - this.vy * 0.8;
        d.noGravity = true; d.noLight = true;
      }
    } else if (opt === 'Sail' && (gd === 1 ? this.vy < 1 : this.vy > -1)) {
      // :21671-21700 尘253：平台段中 2 粒（顺速 −v/5）否则 1 粒（scale×0.8）
      const n = this.jumpHold > 0 ? 2 : 1;
      const by = gd === 1 ? this.y + this.h - 6 : this.y + 6;
      for (let j = 0; j < n; j++) {
        const d = mk(this.x, by, this.w, 12, 253, 100, 1.5, this.vx * 0.3, this.vy * 0.3);
        if (!d) continue;
                d.scale += (Math.random() * 8 - 5 | 0) * 0.1;
        if (this.jumpHold <= 0) d.scale *= 0.8;
        else { d.vx -= this.vx / 5; d.vy -= this.vy / 5; }
        d.noGravity = true;
      }
    }
  }

  private wingFx(game: GameHooks, wings: number, wingsLogic: number,
    flying: boolean, glide: boolean, justSwitched: boolean): void {
    const D = game.vanillaDust;
    const dir = this.facing;
    const cx = this.cx, top = this.y, half = this.h / 2;
    const cxOff = (back: number, front: number) => cx + (dir === 1 ? back : front);
    const Next = (a: number, b: number) => a + (Math.random() * (b - a) | 0);
    const dirF = () => Math.random() * 2 - 1;   // NextFloatDirection
    const airOk = this.vy !== 0 && !this.ridingMount
      && !this.grappleProjs.some((g) => g.latched)
      && !(this.inWater && !!this.equipStats.flipper);   // ShouldDrawWings :30271
    const mk = (x: number, y: number, w: number, h: number, type: number,
      alpha = 0, scale = 1, color: import('../fx/VanillaDust').DustColor | null = null,
      vx = 0, vy = 0) => D ? D.spawn(x, y, w, h, type, vx, vy, alpha, color, scale) : null;

    // ---- WingAirVisuals（flag19 时每 tick；:30284-30547）----
    if (flying) {
      if (wings === 10 && Next(0, 2) === 0) {
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 76, 50, 0.6);
        if (d) { d.fadeIn = 1.1; d.noGravity = true; d.noLight = true; d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 34 && Next(0, 2) === 0) {
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 261, 50, 0.6);
        if (d) { d.fadeIn = 1.1; d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings; d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 51 && Next(0, 2) === 0) {
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 261, 50, 0.6, { r: 230, g: 130, b: 55, a: 255 });
        if (d) { d.fadeIn = 1.1; d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings; d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 9 && Next(0, 2) === 0) {
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 6, 200, 2);
        if (d) { d.noGravity = true; d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 6 && Next(0, 4) === 0) {   // :30343-30351（落体尘）
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 55, 200);
        if (d) { d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 5 && Next(0, 3) === 0) {   // :30364-30371
        const d = mk(cx + (dir === 1 ? -30 : 6), top, 18, this.h, 58, 255, 1.2);
        if (d) { d.vx *= 0.3; d.vy *= 0.3; }
      }
      if (wings === 26) {                       // :30374-30400（每 tick 主尘 + 1/2 副尘）
        let d = mk(cx + (dir === 1 ? -30 : 6), top, 18, this.h, 217, 100, 1.4);
        if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx; d.vy = d.vy / 4 - this.vy; }
        if (Next(0, 2) === 0) {
          d = mk(cx + (dir === 1 ? 12 : -24), top, 12, this.h / 2, 217, 100, 1.4);
          if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx; d.vy = d.vy / 4 - this.vy; }
        }
      }
      if (wings === 37) {                       // :30409-30452
        let d = mk(cx + (dir === 1 ? -30 : 6), top, 24, this.h, 31, 100);
        if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx / 2; d.vy = d.vy / 4 - this.vy / 2; }
        if (Next(0, 3) === 0) {
          d = mk(cx + (dir === 1 ? 12 : -24), top, 16, this.h / 2, 31, 100);
          if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx / 2; d.vy = d.vy / 4 - this.vy / 2; }
        }
      }
      if (wings === 29 && Next(0, 3) === 0) {   // :30454-30467
        const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 6, 100, 2.4);
        if (d) { d.noGravity = true; d.vx *= 0.3; d.vy *= 0.3; if (Next(0, 10) === 0) d.fadeIn = 2; }
      }
      if (wings === 31) {                       // :30469-30546（86/240 四门）
        if (Next(0, 6) === 0) {
          const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 86);
          if (d) { d.noGravity = true; d.fadeIn = 1.2; d.vx *= 0.2; d.vy *= 0.2; d.noLight = true; }
        }
        if (Next(0, 3) === 0) {
          const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 240, 200, 1.2);
          if (d) { d.noGravity = true; d.vx *= 0.2; d.vy *= 0.2; }
        }
        if (Next(0, 2) === 0) {
          if (Next(0, 6) === 0) {
            const d = mk(cx + (dir === 1 ? 12 : -24), top, 12, this.h / 2, 86);
            if (d) { d.noGravity = true; d.fadeIn = 1.2; d.vx *= 0.2; d.vy *= 0.2; d.noLight = true; }
          }
          if (Next(0, 3) === 0) {
            const d = mk(cx + (dir === 1 ? 12 : -24), top, 12, this.h / 2, 240, 200, 1.2);
            if (d) { d.noGravity = true; d.vx *= 0.2; d.vy *= 0.2; }
          }
        }
      }
    }

    // ---- Wings 4 妖精翅喷射（:29031-29086，分支内每 tick）----
    if (wings === 4 && (flying || this.jumpHold > 0)) {
      if (--this.rocketDelay2 <= 0) {
        game.playSfxAt?.('rocketJet', this.x, this.y);
        this.rocketDelay2 = 60;
      }
      const num = this.inputUp ? 4 : 2;         // TryingToHoverUp 档（:29037）
      for (let i = 0; i < num; i++) {
        let x = cx + (dir > 0 ? -26 : 16);      // :29046-29052
        let y = top + this.h - 18;
        if (i === 1 || i === 3) { x = cx + (dir > 0 ? -20 : 8); y += 6; }
        if (i > 1) y += this.vy;
        const d = mk(x, y, 8, 8, 6, 100, 1.75);
        if (d) {
          d.noGravity = true;
          d.vx *= 0.1;
          d.vy = d.vy * 1 + 2 - this.vy * 0.3;
          if (num === 4) d.vy += 6;
        }
      }
    }

    // ---- Wings 30 日耀喷射双环（:29337-29377，flag2 门）----
    const flag2 = flying || this.jumpHold > 0 || (this.vy !== 0 && this.inputJump);
    if (wings === 30 && flag2) {
      for (let j = 0; j < 4; j++) {
        if (Next(0, 4) === 0) {
          const a = -0.74539816 + Math.PI / 8 * j + 0.03 * j;
          const px = cx + Math.cos(a) * (-dir * 20), py = this.cy + Math.sin(a) * 20;
          const d = mk(cx, this.cy, 0, 0, 229, 100, 0.8);
          if (d) {
            const dx = px - cx, dy = py - this.cy, len = Math.hypot(dx, dy) || 1;
            d.x = px; d.y = py;
            d.vx = dx / len * 2; d.vy = dy / len * 2;
            d.noGravity = true; d.noLightEmittance = wingsLogic !== wings;
            if (Next(0, 10) !== 0) { d.followPlayer = true; d.followOnce = true; } else d.fadeIn = 0.5;
          }
        }
      }
      for (let k = 0; k < 4; k++) {
        if (Next(0, 8) === 0) {
          const a = -0.7053982 + Math.PI / 8 * k + 0.03 * k;
          let px = cx + Math.cos(a) * (dir * 20) - dir * 16;
          let py = this.cy + Math.sin(a) * 24;
          const d = mk(cx, this.cy, 0, 0, 229, 100, 0.5);
          if (d) {
            const dx = px - (cx - dir * 16), dy = py - this.cy, len = Math.hypot(dx, dy) || 1;
            d.vx = dx / len * 2; d.vy = dy / len * 2;
            px += d.vx * 5; py += d.vy * 5;
            d.x = px; d.y = py;
            d.noGravity = true; d.noLightEmittance = wingsLogic !== wings;
            if (Next(0, 10) !== 0) { d.followPlayer = true; d.followOnce = true; } else d.fadeIn = 0.5;
          }
        }
      }
    }

    // ---- Wings 33 星尘眼色尘（:29845-29904，flag9 门）----
    const flag9 = flag2;
    if (wings === 33 && flag9) {
      const eye = this.appearance?.eyeColor ?? { r: 105, g: 90, b: 75 };
      const mx = Math.max(eye.r, eye.g, eye.b), mn = Math.min(eye.r, eye.g, eye.b);
      let hue = 0;   // rgbToHsl(...).X
      if (mx !== mn) {
        const dlt = mx - mn;
        hue = mx === eye.r ? ((eye.g - eye.b) / dlt + (eye.g < eye.b ? 6 : 0))
          : mx === eye.g ? (eye.b - eye.r) / dlt + 2
            : (eye.r - eye.g) / dlt + 4;
        hue /= 6;
      }
      const [cr, cg, cb] = hslToRgb(hue, 1, 0.5);
      const num32 = dir !== 1 ? -4 : 0;
      for (let m = 0; m < 2; m++) {
        const d = mk(this.x + (m === 0 ? num32 : this.w + num32), this.y + this.h,
          this.w, this.h, 182, 127, 1, { r: cr, g: cg, b: cb, a: 255 }, this.vx, this.vy);
        if (!d) break;
        d.noGravity = true; d.fadeIn = 1; d.noLight = true; d.noLightEmittance = wingsLogic !== wings;
        d.followPlayer = true; d.followOnce = true;
        d.vx = d.vx + (m === 0 ? -2 : 2) - this.vx * 0.3;
        d.vy = d.vy + 2 - this.vy * 0.3;
        // CloneDust（:29889-29897）：scale/fadeIn ×0.65、白化
        const c = mk(d.x, d.y, 0, 0, 182, 127, d.scale * 0.65, { r: 255, g: 255, b: 255, a: 255 });
        if (c) {
          c.noGravity = true; c.noLight = true; c.noLightEmittance = wingsLogic !== wings;
          c.fadeIn = d.fadeIn * 0.65; c.vx = d.vx; c.vy = d.vy;
          c.followPlayer = true; c.followOnce = true;
        }
      }
    }

    // ---- Wings 45 星璇悬浮板（:29707-29740 门内：喷射音 + 星尘）----
    if (wings === 45 && airOk) {
      if (this.wingTime > 0 && --this.rocketDelay2 <= 0) {
        game.playSfxAt?.('starboardJet', this.x, this.y);
        this.rocketDelay2 = 30;
      }
      if (Next(0, 8) === 0) {
        // CenteredRectangle(Bottom−(0,10), 40×24)（:29735）
        const d = mk(cx - 20, this.y + this.h - 10 - 12, 40, 24, 43, 0, 0.2);
        if (d) { d.fadeIn = 0.4; d.vx = (d.vx + this.vx) * 0.35; d.vy = (d.vy + this.vy) * 0.35; }
      }
    }

    // ---- Wings 47/49/50 十一帧族三函数（:30063-30270）----
    if ((wings === 47 || wings === 49 || wings === 50) && this.wingFrame !== 0) {
      const numTbl: Record<number, number> = { 1: 0, 2: 0, 3: 0.5, 4: 1, 5: 1, 6: 0.5, 7: 0, 8: -0.5, 9: -1, 10: -0.5 };
      const num = numTbl[this.wingFrame] ?? 0;
      if (wings === 47) {   // ChickenBonesWingDust :30063-30141
        const col = { r: 50, g: 120, b: 255, a: 200 };
        if (justSwitched && this.wingFrame === 6 && this.inputJump) {
          for (let i = 0; i < 8; i++) {
            const vx0 = (i < 4 ? -25 : -5) * dir, vy0 = 20;
            const d = mk(cx - 5 + vx0, this.cy - 5 + vy0, 10, 10, 264, 0, 1.1 * (1 + 0.25 * dirF()), col);
            if (d) {
              const xo = d.x - cx - vx0;
              d.y += xo * 2;
              d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings;
              d.vx = xo * 0.5; d.vy = 3;
              d.followPlayer = true; d.followOnce = true;
            }
          }
        }
        if (Next(0, 6) === 0) {
          const d = mk(cx - 15 - 30 * dir, this.cy - 25, 30, 50, 264, 0, 1.1 * (1 + 0.25 * dirF()), col);
          if (d) {
            d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings;
            d.vx = d.vx * 0.1 + this.vx * 0.3 * Math.random();
            d.vy = d.vy * 0.1 + num * 2 + this.vy * 0.3 * Math.random();
            d.y += num * 2;
            d.followPlayer = true; d.followOnce = true;
          }
        }
      }
      if (wings === 49) {   // HeroicisWingDust :30143-30204（光照门 z=Remap(亮度,0.2,0.4,0,1)
        //                 :30166-30168——rgbToHsl(Lighting.GetColor).Z，亮度=(max+min)/2/255）
        const col = { r: 255, g: 255, b: 255, a: 200 };
        // z 门（:30166-30173）：暗处抑制尘爆/环境尘（z >= NextFloat 才放行）
        const lc = game.lightAt?.(cx, this.cy);
        const lightZ = lc
          ? (Math.max(lc[0], lc[1], lc[2]) + Math.min(lc[0], lc[1], lc[2])) / 2 / 255
          : 0;
        const z = Math.min(1, Math.max(0, (lightZ - 0.2) / 0.2));   // Utils.Remap
        if (justSwitched && this.wingFrame === 6 && this.inputJump) {
          for (let i = 0; i < 8; i++) {
            if (z < Math.random()) continue;            // :30175 !(z < NextFloat())
            const vx0 = (i < 4 ? -20 : -10) * dir, vy0 = 15;
            const d = mk(cx - 2.5 + vx0, this.cy - 2.5 + vy0, 5, 5, 264, 0, 0.6 * (1 + 0.45 * dirF()), col);
            if (d) {
              const xo = d.x - cx - vx0;
              d.y += xo * 2;
              d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings;
              d.vx = xo * 0.5; d.vy = 2;
              d.followPlayer = true; d.followOnce = true;
            }
          }
        }
        if (Next(0, 6) === 0 && z >= Math.random()) {   // :30192 z >= NextFloat()
          const d = mk(cx - 15 - 30 * dir, this.cy - 20, 30, 40, 264, 0, 0.6 * (1 + 0.45 * dirF()), col);
          if (d) {
            d.noGravity = true; d.noLight = true; d.noLightEmittance = wingsLogic !== wings;
            d.vx = d.vx * 0.1 + this.vx * 0.3 * Math.random();
            d.vy = d.vy * 0.1 + num * 1.5 + this.vy * 0.3 * Math.random();
            d.y += num * 2;
            d.followPlayer = true; d.followOnce = true;
          }
        }
      }
      if (wings === 50) {   // KazzymodusWingDust :30205-30270
        const col = { r: 50, g: 120, b: 255, a: 200 };
        if (justSwitched && this.wingFrame === 1) {
          const y0 = -20;
          for (let i = 0; i < 16; i++) {
            const nx = (i < 4 ? -25 : -5) * dir;
            const d = mk(cx + nx - 15, this.cy + y0 - 5, 30, 10, 6, 100, 1.2, col);
            if (d) { d.vx = dirF() * 5; d.vy = dirF() * 2; d.fadeIn = 1.2; d.noGravity = true; d.noLightEmittance = wingsLogic !== wings; }
          }
        }
        if (Next(0, 4) === 0) {
          const flag = Next(0, 2) === 0;
          const nx = dir * (flag ? -30 : 10);
          const y2 = this.wingFrame === 1 ? -25 : -5;
          const d = mk(cx + nx - 12.5, this.cy + y2 - 10, 25, 20, 6, 100, 1.2, col);
          if (d) { d.vx = dirF() * 2.5; d.vy = Math.random() * 3; d.fadeIn = 1.2; d.noGravity = true; d.noLightEmittance = wingsLogic !== wings; }
        }
      }
    }

    // ---- Wings 29 下落烟（generic 尾段 :30025-30040，!flap && vy≠0）----
    if (wings === 29 && !flying && this.jumpHold === 0 && this.vy !== 0 && Next(0, 5) === 0) {
      const d = mk(cxOff(-40, 4), top + half - 15, 30, 30, 6, 100, 2.4);
      if (d) { d.noGravity = true; d.vx *= 0.3; d.vy *= 0.3; if (Next(0, 10) === 0) d.fadeIn = 2; }
    }

    // ---- 滑翔段尘 26/37（:26914-26970，glide 门内）----
    if (glide) {
      if (wings === 26) {
        let d = mk(cx + (dir === 1 ? -30 : 6), top, 18, this.h, 217, 100, 1.4);
        if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx; d.vy = d.vy / 4 - this.vy; }
        if (Next(0, 2) === 0) {
          d = mk(cx + (dir === 1 ? 12 : -24), top, 12, this.h / 2, 217, 100, 1.4);
          if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx; d.vy = d.vy / 4 - this.vy; }
        }
      }
      if (wings === 37) {
        let d = mk(cx + (dir === 1 ? -30 : 6), top, 24, this.h, 31, 100);
        if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx / 2; d.vy = d.vy / 4 - this.vy / 2; }
        if (Next(0, 3) === 0) {
          d = mk(cx + (dir === 1 ? 12 : -24), top, 16, this.h / 2, 31, 100);
          if (d) { d.noGravity = true; d.noLight = true; d.vx = d.vx / 4 - this.vx / 2; d.vy = d.vy / 4 - this.vy / 2; }
        }
      }
    }

    // ---- Wings 28 空中微光（:29071-29076：Bottom AddLight(0.3,0.1,0.4)）----
    if (wings === 28 && airOk && wingsLogic === wings) {
      game.addLightAt?.(cx, this.y + this.h, 0.3, 0.1, 0.4);
    }
  }

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

  /** 恐慌项链受击加速计时（tick，原版 AddBuff(63,480)=8s，Hurt :38524） */
  panicTime = 0;
  /** 岩浆免疫剩余 tick（熔岩护身符族 lavaMax；离开岩浆回满） */
  lavaImmuneTicks = 0;
  /** 翅膀：剩余飞行 tick（float，hover 下落档 0.5/tick）+ 需松跳键重触发 */
  wingTime = 0;
  wingRelease = true;
  /** 飞毯触发门（CarpetMovement :21575：起跳后置 true，触发一次即 false） */
  canCarpet = true;
  /** 翅膀动画帧（WingFrame :29002-30045 逐款状态机；值域随款 0-13）+ 拍速计数 */
  wingFrame = 0;
  private wingFrameCounter = 0;
  /** 帧状态机 scratch（stepWingFrame 纯函数传参用，避免每 tick 分配） */
  private wingFrameScratch: WingFrameState = { frame: 0, counter: 0 };
  /** Main.miscCounter 近似（每 tick +1；翅膀 28 绘制帧 miscCounter/5%4 消费） */
  miscCounter = 0;
  /** 棉花糖烤串 968 烤制计时（player.miscTimer，Player.cs:1339，1456 :1244——
   *  仅 ItemCheck_ApplyHoldStyle 968 支 :50955-50994 消费；运行时态不入档，
   *  原版同；分支不进（换持/死亡/pulley）时冻结非清零） */
  miscTimer = 0;
  /** AdvancedShadows 位置历史环（≤31 项，翅膀 45 彩虹拖尾 :2901 消费；每 tick 尾插） */
  advancedShadows: Array<{ x: number; y: number }> = [];
  /** itemFlame（LegacyPlayerRenderer :493-502：每 5t 重掷 7 组，仅翅膀 22 在用时更新；
   *  绘制端 :683-694 消费 (X, −Y)×0.5 偏移） */
  itemFlameCount = 5;
  itemFlamePos: Array<{ x: number; y: number }> = Array.from({ length: 7 }, () => ({ x: 0, y: 0 }));
  /** 上一 tick 左上角（原版 oldPosition；customData=Player 尘埃跟随差值用） */
  oldX = 0;
  oldY = 0;

  /** 飞毯滑翔剩余 tick（CarpetMovement carpetTime=300） */
  carpetTime = 0;
  /** 冲刺头部将撞墙探测（DashMovement :21132-21137）：身前 dir×半宽+2px 的
   *  头部点（gravDir 对应侧 h/2−2）与身体中点格任一 SolidOrSlopedTile → true
   *  （触发帧 velocity.X /= 2）。探测点恒在身体行内——对整砖随后必撞停（原版同），
   *  实际差异面 = 半砖/坡面（SolidOrSloped 含之） */
  dashWallAhead(dir: number): boolean {
    const st = this.lastStore;
    if (!st) return false;   // fixedUpdate 之前调用：无缓存世界视为不撞
    const wtx = Math.floor((this.cx + dir * (this.w / 2) + 2 * dir) / TILE);
    const hty = Math.floor((this.cy + this.gravDir * (-this.h / 2) + 2 * this.gravDir) / TILE);
    const solidOrSloped = (tx: number, ty: number): boolean =>
      st.inBounds(tx, ty) && !!st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty);
    return solidOrSloped(wtx, hty) || solidOrSloped(wtx, Math.floor(this.cy / TILE));
  }
  /** 冲刺：双击窗口（dashTime ±15）/ 方向 / dashDelay 三态（0 就绪 / -1 滑行 / >0 冷却） */
  dashT = 0;
  dashDir = 1;
  dashDelay = 0;
  /** 克苏鲁护盾冲撞判定窗（eocDash :20784，触发=15/命中=10）+ 已命中敌 id（eocHit） */
  eocDash = 0;
  eocHitId = -1;
  prevInputX = 0;
  /** 水面行走状态（水上漂靴族：站在液面，按 ↓ 下潜） */
  onWaterSurface = false;
  /** 所在沙漠区（Game 每帧同步 scene.zoneDesert） */
  zoneDesert = false;
  /** 脚下是沙族地格（runningOnSand，FloorVisuals :23457——沙丘行者靴消费）。
   *  原版只在 vy==0 时刷新、离地不清零（ResetFloorFlags 仅重生/传送） */
  runningOnSand = false;
  /** 脚下地板 tile type（FloorCheck num3 :23450-23471，含坡面门；-1=无/坡面/空中）——
   *  slippy 冰面滑移消费（:26234-26255） */
  floorTileT = -1;
  /** 折叠凳使用中（PortableStoolUsage.IsInUse）：命中盒 +26px（脚锚定向上长，
   *  :28745-28747 ResizeHitbox）；起跳离凳 y-=26（:20504-20512）；渲染下移 26 */
  stoolInUse = false;
  /** 折叠凳常量（:14077 SetStats(26,26,26)：HeightBoost/VisualYOffset/MapYOffset） */
  static readonly STOOL_BOOST = 26;

  /** CanFitSpace（Collision.cs：命中盒向上抬 extra 像素后的新增带无实心格；
   *  fixedUpdate 传入当帧 store） */
  private canFitSpaceUp(extra: number, st: { isSolid(x: number, y: number): boolean } | null): boolean {
    if (!st) return true;   // 无 store 引用时保守放行（原版恒有 Main.tile）
    const x0 = Math.floor(this.x / 16), x1 = Math.floor((this.x + this.w - 0.01) / 16);
    const y0 = Math.floor((this.y - extra) / 16), y1 = Math.floor((this.y - 0.01) / 16);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (st.isSolid(x, y)) return false;
    return true;
  }

  // ===================== pulley 绳索悬挂（Player.cs:19355-19460 / :25801-26177） =====================

  /** 原版 Main.tileRope[type] 直判（不含 IsRope 的"绳穿平台"支——FindPulley 的
   *  孤立绳格检查 :19376 用的是裸 tileRope，非 IsRope；出界=非绳） */
  private rawRopeAt(st: TileStore, x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    return (st.flags[k] & 1) !== 0 && !!TILE_DEFS[st.type[k]]?.rope;
  }

  /** WorldGen.IsRope(x,y)（WorldGen.cs:70118-70152，rangeToCheck=5）：
   *  tileRope 族直判；314 矿轨/380 花盆箱/平台族格 → GetRopeEnds 上下 5 格内
   *  均有绳才算（绳穿平台可攀）。pulley 抓绳门（FindPulley :19363）与
   *  维持退出门（:25950）的判定源 */
  isRopeAt(st: TileStore, x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    if (!(st.flags[k] & 1)) return false;              // !active
    const def = TILE_DEFS[st.type[k]];
    if (!def) return false;
    if (def.rope) return true;                         // Main.tileRope
    const sheet = def.vanilla?.sheet ?? -1;
    if (sheet !== 314 && sheet !== 380 && !VANILLA_PLATFORM_SHEETS.has(sheet)) return false;
    // GetRopeEnds（WorldGen.cs:70069-70105，treatEmptyAsTheRopeEnd=false，range 5）
    let topRopeY = -1;
    for (let i = 1; i <= 5; i++) {
      const ty = y - i;
      if (!st.inBounds(x, ty)) break;                  // InWorld 出界即止
      if (!this.rawRopeAt(st, x, ty)) break;           // !active→break；绳→置位 break
      topRopeY = ty;
      break;
    }
    let bottomRopeY = -1;
    for (let j = 1 + (y - topRopeY); j <= 6; j++) {
      const ty = topRopeY + j;
      if (!st.inBounds(x, ty)) break;
      if (!this.rawRopeAt(st, x, ty)) break;
      bottomRopeY = ty;
      break;
    }
    return topRopeY !== -1 && bottomRopeY !== -1;
  }

  /** Collision.SolidCollision（Collision.cs:2713-2746）：盒与实心非平台格相交
   *  判定（扫描域 x∈[⌊px/16⌋−1, ⌊(px+w)/16⌋+2]、y 同构；halfBrick 只算下半
   *  8px；已致动格不计）。FindPulley 吸附位碰撞预检（:19413/:19430/:19447） */
  private solidCollision(st: TileStore, px: number, py: number): boolean {
    const x0 = Math.floor(px / TILE) - 1;
    const x1 = Math.floor((px + this.w) / TILE) + 2;
    const y0 = Math.floor(py / TILE) - 1;
    const y1 = Math.floor((py + this.h) / TILE) + 2;
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) {
        if (!st.inBounds(i, j)) continue;              // 原版钳世界边（近缘差异登记）
        const k = st.idx(i, j);
        const def = TILE_DEFS[st.type[k]];
        if (!def?.solid || def.platform) continue;     // tileSolid && !tileSolidTop（:2728）
        if (st.wire[k] & 32) continue;                 // !inActive()（致动缩入）
        let ty = j * TILE, th = TILE;
        if (st.half[k]) { ty += 8; th -= 8; }          // halfBrick：下半实心（:2734-2737）
        if (px + this.w > i * TILE && px < i * TILE + TILE
          && py + this.h > ty && py < ty + th) return true;
      }
    }
    return false;
  }

  /** FindPulley（Player.cs:19355-19460）：按上/下键且头顶格（(y−8)/16 行）为绳
   *  时抓绳——X 吸附绳列三档（中心/±6px 取最近），y 落 num3（孤立绳格=格顶+22，
   *  连续绳=原位），gfxOffY 记录 y 跳变的视觉补偿，stepSpeed=2.5、vx=0。
   *  调用门（:25805）：!pulley && !frozen && !webbed && !stoned && gravDir==1 &&
   *  ropeCount==0 && 无钩爪 && !tongued && !mount.Active（!controlJump 门因本仓
   *  inputJump 并含 W/↑（攀爬键）会连坐拦截，省略——Space-only 照旧不触发，
   *  与原版 controlUp≠controlJump 等价）。原版另调 Main.cameraX 平滑
   *  （:19417/:19433/:19450）——本仓相机无对应载体，略 */
  findPulley(st: TileStore): void {
    if (this.stoolInUse || (!this.inputUp && !this.inputDown)) return;   // :19357
    const num = Math.floor((this.x + this.w / 2) / TILE);                // :19361 头心列
    const num2 = Math.floor((this.y - 8) / TILE);                        // :19362 头格行
    if (!this.isRopeAt(st, num, num2)) return;                           // :19363
    let num3 = this.y;                                                   // :19367 目标 y
    // :19368-19379 孤立绳格（上、下邻格均非 tileRope）→ 挂到格顶+22（挂绳下沿）
    if (!this.rawRopeAt(st, num, num2 - 1) && !this.rawRopeAt(st, num, num2 + 1)) {
      num3 = num2 * TILE + 22;
    }
    const num5 = num * TILE + 8 - this.w / 2 + 6;    // :19381 右贴档
    const num6 = num * TILE + 8 - this.w / 2;        // :19382 居中档
    const num7 = num * TILE + 8 - this.w / 2 - 6;    // :19383 左贴档
    let num8 = 1;                                    // :19384 最近档号
    let num9 = Math.abs(this.x - num5);              // :19385
    if (Math.abs(this.x - num6) < num9) { num8 = 2; num9 = Math.abs(this.x - num6); }
    if (Math.abs(this.x - num7) < num9) { num8 = 3; }
    let num4 = num5;                                 // :19380 初值（下三支覆写）
    if (num8 === 1) { num4 = num5; this.pulleyDir = 2; this.facing = 1; }   // :19396-19401
    if (num8 === 2) { num4 = num6; this.pulleyDir = 1; }                    // :19402-19406
    if (num8 === 3) { num4 = num7; this.pulleyDir = 2; this.facing = -1; }  // :19407-19412
    // 三连试位（:19413-19459）：选定档 → 右贴档 → 左贴档，首个无实心碰撞的落位
    if (!this.solidCollision(st, num4, this.y)) { this.pulleySnap(num4, num3); return; }
    num4 = num5; this.pulleyDir = 2; this.facing = 1;                       // :19427-19429
    if (!this.solidCollision(st, num4, this.y)) { this.pulleySnap(num4, num3); return; }
    num4 = num7; this.pulleyDir = 2; this.facing = -1;                      // :19444-19446
    if (!this.solidCollision(st, num4, this.y)) { this.pulleySnap(num4, num3); }
  }

  /** FindPulley 落位三连写（:19419-19425/:19436-19442/:19453-19459 同构段）：
   *  pulley 置位 + X 吸附 + gfxOffY 视觉补偿 + stepSpeed=2.5 + Y 落位 + vx 清零 */
  private pulleySnap(x: number, y: number): void {
    this.pulley = true;
    this.x = x;
    this.gfxOffY = this.y - y;     // 跳变差（渲染锚消费，每 tick 衰减回 0）
    this.stepSpeed = 2.5;
    this.y = y;
    this.vx = 0;
  }

  /** gfxOffY 衰减（Player.cs:27695-27719）：每 tick 向 0 收敛 num106×stepSpeed
   *  （num106=1+|vx|/3——跑动加速收敛），过零截断，钳 ±32 */
  decayGfxOffY(): void {
    const num106 = 1 + Math.abs(this.vx) / 3;
    if (this.gfxOffY > 0) {
      this.gfxOffY -= num106 * this.stepSpeed;
      if (this.gfxOffY < 0) this.gfxOffY = 0;
    } else if (this.gfxOffY < 0) {
      this.gfxOffY += num106 * this.stepSpeed;
      if (this.gfxOffY > 0) this.gfxOffY = 0;
    }
    if (this.gfxOffY > 32) this.gfxOffY = 32;
    if (this.gfxOffY < -32) this.gfxOffY = -32;
  }

  /** 绳上攀爬速度链（Player.cs:26016-26125）：上爬（W/Space 皆入攀爬键位模型）
   *  vy>0 阻尼×0.7 后 −0.2（>−3 档）/−0.02（≤−3 档），下限 −8；下滑镜像
   *  +0.2/+0.1 上限 maxFallSpeed；静止 ×0.7 且 |vy|<0.1 归 0（:26120-26124） */
  ropeClimbVy(): void {
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
      if (Math.abs(this.vy) < ROPE_IDLE_ZERO) this.vy = 0;
    }
  }

  // ===================== 绳锚几何（RotatedRelativePoint / 坐骑持物偏移 / 线起点） =====================

  /** 原版 Player.fullRotation 的本仓聚合源：矿车 TrackRotation（:27805-27806）
   *  → Minecart.rotation；坐骑 Hover 机身倾斜（Mount.cs:3468-3521）→
   *  MountInstance.fullRotation；无骑乘 = 0（本仓玩家侧无独立 fullRotation 字段，
   *  睡床躺平角只在渲染层 sleepingTransformOps） */
  get anchorFullRotation(): number {
    if (this.ridingCart && this.cart) return this.cart.rotation;
    if (this.ridingMount) return this.mount.fullRotation;
    return 0;
  }

  /** 锚链用的 Mount.PlayerOffset（Mount.cs:409-423 = playerYOffsets[frame]）：
   *  矿车族数组由 SetAsMinecart 填 8×3（:2720-2726；51/53 屁股车档 -10/-8 → 10）
   *  ——vanilla-mounts.json 提取器未跑该帮助函数致缺数组，此处硬补
   *  （Minecart.ts:763 num2=8 同源）；非矿车坐骑走 MOUNT_DATA 原值 */
  private get anchorPlayerOffset(): number {
    if (!this.mount.active) return 0;
    if (this.mount.isCart) return this.mount.type === 51 || this.mount.type === 53 ? 10 : 8;
    return this.mount.playerOffset;
  }

  /** MountedCenter（Player.cs:3189-3199：(x+w/2, y+BaseHeight/2+HeightOffsetHitboxCenter)）。
   *  坐骑态经 Bottom−21−PlayerOffset 等价形（原版 h=42+heightBoost、BaseHeight=42
   *  → boost 项经 Bottom 自消；本仓坐骑不改玩家盒，Bottom 同锚一致）。折叠凳
   *  （SetStats(26,26,26) :14077 → HeightOffsetHitboxCenter=26−26=0）= 基础 42
   *  盒中心（本仓 h 已含 +26）。常规 = 盒中心 */
  get mountedCenter(): { x: number; y: number } {
    if (this.mount.active) {
      return { x: this.x + this.w / 2, y: this.y + this.h - 21 - this.anchorPlayerOffset };
    }
    const baseH = this.h - (this.stoolInUse ? Player.STOOL_BOOST : 0);
    return { x: this.x + this.w / 2, y: this.y + baseH / 2 };
  }

  /** RotatedRelativePoint（Player.cs:4063-4089）：pos 先 +gfxOffY（addGfxOffY），
   *  绕 pivot=Bottom+(0,gfxOffY) 旋 rot，再 + (0,−num2)+(0,num2).RotatedBy(rot)
   *  （num2=PlayerOffset/2+4，未骑乘 PlayerOffset=0→num2=4）。fullRotation=0 时
   *  mount 项自消 → 输出 = pos+(0,gfxOffY)。sleeping/sitting 偏移支未移植
   *  （两态 gfxOffY 恒 0 且与线锚消费互斥，登记） */
  rotatedRelativePoint(px: number, py: number,
    opts: { reverseRotation?: boolean; addGfxOffY?: boolean; rotation?: number } = {},
  ): { x: number; y: number } {
    const rotation = opts.rotation ?? this.anchorFullRotation;
    const rot = opts.reverseRotation ? -rotation : rotation;             // :4065
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivX = this.x + this.w / 2;                                    // Bottom.X
    const pivY = this.y + this.h + this.gfxOffY;                         // :4070
    const num2 = Math.floor(this.anchorPlayerOffset / 2) + 4;            // :4071
    let y = py;
    if (opts.addGfxOffY !== false) y += this.gfxOffY;                    // :4073-4076
    const dx = px - pivX, dy = y - pivY;
    return {
      // :4072 vector2 = (0,−num2)+(0,num2).RotatedBy(rot) = (−num2·sin, −num2+num2·cos)
      x: pivX + dx * cos - dy * sin - num2 * sin,
      y: pivY + dx * sin + dy * cos - num2 + num2 * cos,
    };
  }

  /** 手持物 vid（heldItem→ITEM_DEFS→vid；空手 −1） */
  heldVid(): number {
    const held = this.inv.heldItem();
    if (!held) return -1;
    const def = ITEM_DEFS[held.id];
    return def ? (def.vid ?? viIdFromKey(def.key)) : -1;
  }

  /** 手持物 useStyle：itemfunc.useStyle + 提取缺口补（悠悠球族 Item.cs:30018-30033
   *  goto case 链丢 useStyle → 全族 5；钓竿族 case 链同理 → 1；其余缺 → 1） */
  private heldUseStyleOf(vid: number): number {
    const us = vid >= 0 ? itemFuncOfVid(vid)?.useStyle : undefined;
    if (us) return us;
    if (YOYO_ITEM_VIDS.has(vid)) return 5;
    return 1;
  }

  /** ApplyItemPositionOffsetFromMount 的 bodyFrame 行（:50644 bodyFrame.Y/Height）。
   *  原版行由 Player.UpdateFrames 维护；本仓帧行渲染侧（Renderer.playerFrameRows），
   *  此处按原版链序重算可达分支。消费分支中只有"动画中"useStyle 5（悠悠球 flag9）
   *  需要行——aim 给全（n21=itemRotation·direction :35994，<−0.75→行2 / >0.6→行4，
   *  gravDir=−1 互换 :35996-36010；缺省 0=行 3 中档带）。相位族（1/6/7/11/13）
   *  本仓单计时器模型无 itemAnimationMax，取动画中点行（该族无钓竿/悠悠球消费，
   *  登记）；坐骑分支以下（抓钩/游泳/行走行）骑乘态不可达（:36056 先拦） */
  private mountOffsetBodyRow(itemAnimating: boolean, aim?: number): number {
    const vid = this.heldVid();
    const tf = vid >= 0 ? itemFuncOfVid(vid) : null;
    const useStyle = this.heldUseStyleOf(vid);
    const holdStyle = tf?.holdStyle ?? 0;
    const styleNotExcluded = useStyle !== 10 && useStyle !== 14 && useStyle !== 15;  // :35716 flag6
    if (itemAnimating && styleNotExcluded) {
      switch (useStyle) {
        case 1:
        case 13: return 2;          // 三相 3/2/1（:35882-35895/:35971-35985）→ 中点近似
        case 7: return 2;           // 两相 3/2（:35897-35907）→ 中点近似
        case 2:
        case 3:
        case 12: return 3;          // :35908/:35948/:35967
        case 11: return 3;          // 三相 4/3/2（:35912-35925）→ 中点近似
        case 9: return 0;           // :35927-35929
        case 6: return 3;           // 两相 3/2（:35931-35947）→ 后段近似
        case 4: return 2;           // :35959-35961
        case 8: return 0;           // :35963-35965
        case 5: {
          if (vid === 281 || vid === 986) return 2;                      // :35988-35991
          const n21 = aim ?? 0;                                          // :35994
          if (n21 < -0.75) return this.gravDir === -1 ? 4 : 2;           // :35996-36002
          if (n21 > 0.6) return this.gravDir === -1 ? 2 : 4;             // :36004-36010
          return 3;                                                      // :35995
        }
        default: break;               // 其余 style 无行写入（链下落）
      }
    }
    // pulley 行（:36015-36023）骑乘互斥不可达，省略
    if (holdStyle === 1 || holdStyle === 3 || holdStyle === 5) return 3; // :36026-36041
    if (holdStyle === 2) return 2;                                       // :36030-36033
    if (holdStyle === 7) return 11;                                      // :36042-36045
    if (holdStyle === 4 && this.vy === 0 && this.gravDir === 1) return 0; // :36046-36051
    if (this.shieldRaised) return 10;                                    // :36052-36055
    return this.mount.active ? this.mount.bodyFrame : 0;                 // :36056-36060
  }

  /** ApplyItemPositionOffsetFromMount（Player.cs:50638-50795）：坐骑上持物位置
   *  偏移。1456 唯一有表坐骑 = 54 迅猛龙（MountID.cs:142，IsTransformationMount/
   *  PlayerIsHidden——变身坐骑；其余 63 坐骑 zero 恒 0 直接返回加零）。opts：
   *  - itemAnimating：itemAnimation>0 代理（缺省 itemAnimTicks>0||useTime>0；
   *    悠悠球 channel 期原版 itemAnimation 持续刷新恒>0，本仓 useTime 单发模型
   *    由消费端传 channel 态补）
   *  - aim：mountOffsetBodyRow 的瞄准角原料 */
  applyItemPositionOffsetFromMount(px: number, py: number,
    opts: { itemAnimating?: boolean; aim?: number } = {},
  ): { x: number; y: number } {
    if (!this.mount.active) return { x: px, y: py };                     // :50640-50643
    const dir = this.facing, gd = this.gravDir;                          // Directions :3687
    const vid = this.heldVid();
    const tf = vid >= 0 ? itemFuncOfVid(vid) : null;
    const useStyle = this.heldUseStyleOf(vid);
    const holdStyle = tf?.holdStyle ?? 0;
    const flag = (opts.itemAnimating ?? false) || this.itemAnimTicks > 0 || this.useTime > 0;
    const num = this.mountOffsetBodyRow(flag, opts.aim);                 // :50644
    const flag2 = !flag && holdStyle > 0;                                // :50648
    if (!flag && !flag2) return { x: px, y: py };                        // :50649-50652
    const flag3 = useStyle === 5;                                        // :50653
    const flag4 = useStyle === 2;                                        // :50655
    const flag5 = useStyle === 9;                                        // :50656
    const flag6 = !!tf?.fishingPole;                                     // :50657
    const flag7 = useStyle === 14;                                       // :50658
    const flag8 = useStyle === 8;                                        // :50659
    const flag9 = vid > 0 && YOYO_ITEM_VIDS.has(vid);                    // :50660
    const flag10 = useStyle === 11;                                      // :50661
    const flag11 = vid === 3542;                                         // :50662 星云怒涛
    const flag12 = vid > 0 && KITE_ITEM_VIDS.has(vid);                   // :50663
    const flag13 = holdStyle === 1;                                      // :50664
    const flag14 = holdStyle === 2;                                      // :50665
    const flag15 = holdStyle === 5;                                      // :50666
    let zx = 0, zy = 0;
    const mul = (ox: number, oy: number) => { zx += ox * dir; zy += oy * gd; };
    if (this.mount.type === 54) {                                        // :50667
      if (flag4) {
        if (flag) mul(7, -4); else mul(3, 2);                            // :50669-50678
      } else if (flag6) {
        mul(-2, 0);                                                      // :50680-50683 钓竿
      } else if (flag5) {
        if (flag) mul(14, -10); else mul(3, 2);                          // :50684-50693
      } else if (flag10) {
        if (flag) mul(4, 0); else mul(1, 0);                             // :50695-50704
      } else if (flag8) {
        mul(6, 0);                                                       // :50706-50709
      } else if (flag7) {
        if (flag) mul(-6, 6); else mul(-10, 10);                         // :50710-50719
      } else if (flag12) {
        mul(4, -4);                                                      // :50721-50723 风筝
      } else if (flag15) {
        mul(6, 0);                                                       // :50725-50728
      } else if (flag13 && !flag) {
        mul(1, 4);                                                       // :50729-50732
      } else if (flag14) {
        if (flag && vid === 186) {
          // :50735-50737 芦苇管：(−4,0).RotatedBy((pos−Center).ToRotation())
          const a = Math.atan2(py - this.cy, px - this.cx);
          zx += -4 * Math.cos(a);
          zy += -4 * Math.sin(a);
        } else {
          mul(6, 0);                                                     // :50739-50742
        }
      } else if (flag9) {
        if (num === 2) mul(10, -10);                                     // :50746-50757 悠悠球
        else if (num === 3) mul(8, 0);
        else if (num === 4) mul(2, 2);
      } else if (flag11) {
        if (num === 2) mul(-10, 0);                                      // :50759-50772 星云怒涛
        else if (num === 3) mul(10, 0);
        else if (num === 4) mul(10, 0);
      } else if (flag3) {
        mul(4, 0);                                                       // :50774-50777
      } else {
        if (num === 1) mul(1, -1);                                       // :50778-50792
        else if (num === 2) mul(4, 2);
        else if (num === 3) mul(2, 0);
      }
    }
    return { x: px + zx, y: py + zy };                                   // :50794
  }

  /** 手持瞄准角 n21（=itemRotation·direction，行档阈值原料）：参照点 =
   *  RotatedRelativePoint(MountedCenter) − (0, 2·gravDir)（:46560 + :46640）；
   *  itemRotation = atan2(dy·dir, dx·dir) − fullRotation（:46730）；n21 = ×direction（:35994） */
  private itemAimRotDir(tx: number, ty: number): number {
    const mc = this.mountedCenter;
    const rp = this.rotatedRelativePoint(mc.x, mc.y);
    const dx = tx - rp.x;
    const dy = ty - (rp.y - 2 * this.gravDir);
    return (Math.atan2(dy * this.facing, dx * this.facing) - this.anchorFullRotation) * this.facing;
  }

  /** 悠悠球/配重球线起点（Main.cs:27794-27803 DrawProjDirect aiStyle99 段）：
   *  MountedCenter → mount52（狼人）修正 → +gfxOffY → ApplyItemPositionOffsetFromMount。
   *  target = 光标世界坐标（mount54 行档 aim）；channelActive = 悠悠球滞留态
   *  （itemAnimation>0 代理——原版 channel 期持续刷新） */
  yoyoStringAnchor(target?: { x: number; y: number }, channelActive?: boolean): { x: number; y: number } {
    const mc = this.mountedCenter;
    let x = mc.x, y = mc.y;
    if (this.mount.active && this.mount.type === 52) {                   // :27795-27798
      x += this.facing * 14;
      y += -10;
    }
    y += this.gfxOffY;                                                   // :27802
    const aim = target ? this.itemAimRotDir(target.x, target.y) : undefined;
    return this.applyItemPositionOffsetFromMount(x, y, { itemAnimating: channelActive, aim });
  }

  /** 钓线竿尖起点链前段（DrawProj_FishingLine Main.cs:34967-34982）：
   *  mountedCenter → [mount52 死支] → ApplyItemPositionOffsetFromMount → +gfxOffY。
   *  ★mount52 支（:34973-34976）写的是 polePos，紧接 :34979-34980 用偏移后的
   *  mountedCenter 覆写 polePos——该修正被丢弃（原版同款死代码，照抄保留） */
  fishingPoleAnchorBase(): { x: number; y: number } {
    const mc = this.mountedCenter;
    let x = mc.x, y = mc.y;
    if (this.mount.active) {
      if (this.mount.type === 52) { /* :34973-34976 死支（:34979 覆写） */ }
      ({ x, y } = this.applyItemPositionOffsetFromMount(x, y));          // :34978-34980
    }
    y += this.gfxOffY;                                                   // :34982
    return { x, y };
  }
  /** 上一 tick 的世界 store 引用（fixedUpdate 缓存；dashWallAhead 探测用） */
  private lastStore: import('../world/TileStore').TileStore | null = null;
  /** 坐骑探测用世界（MountedPlayerView.store：fixedUpdate 帧首刷新） */
  get store() { return this.lastStore; }
  /** 上一 tick 的跳跃输入（Mount.tryStartHover 的 releaseUp 边沿门 :26416） */
  prevInputJump = false;
  /** 跳键上一 tick 按住态（tick 尾快照；水中起跳边沿=releaseJump :20409 语义） */
  jumpEdgePrev = false;
  /** 鼠标世界坐标（Game 每帧注入；钻头坐骑瞄准 AimAbility / Scutlix 索敌回退用） */
  aimWX = 0;
  aimWY = 0;
  /** 左键（controlUseItem）/ 右键（controlUseTile）按住电平——钻头坐骑挖掘驱动 */
  inputUseItem = false;
  inputUseTile = false;
  /** 上一 tick 的两键电平（ItemCheck_HandleMount :52074 的 releaseUseItem&&releaseUseTile
   *  按压边沿 = 上 tick 双松 + 本 tick 任一按下） */
  prevUseItem = false;
  prevUseTile = false;
  /** 重力方向（R7：1 普通 / -1 倒置——重力药水 buff 18 激活时按 Up 切换，Player.gravDir）
   *  倒置 = 重力/跳跃/落点起点全部取反；onGround 由 hitHead 近似（天花板当地板） */
  gravDir: 1 | -1 = 1;
  /** 世界边界钳制（原版 Player.BordersMovement，Player.cs:23771-23844；
   *  碰撞积分后调用，调用点对应原版 :27968）。
   *  边界 = 世界边缘内缩 640px（=40 格 = offLimitBorderTiles×16，Main.cs:433）：
   *  - 左/右越线 → 钳回 + vx=0（原版另置 cameraX=0 抗镜头抖动，本仓库无对应，略）
   *  - 顶越线 → 钳回 + vy 下推至 ≥0.11 + gravDir 复位 1（原版 remix/forcedGravity
   *    分支出界即死，普通世界取 else 支——:23797-23818）
   *  - 底越线 → 【出界即死】KillMe 原因 21 伤害 10（:23829-23834——地狱地板
   *    挖穿/坠落兜底；走 damage 直杀近似，iframes 只延迟一 tick 不改语义） */
  bordersMovement(world: import('../world/World').World): void {
    const B = 640;                              // offLimitBorderTiles(40) × 16
    const wPx = world.store.w * TILE;           // Main.rightWorld
    const hPx = world.store.h * TILE;           // Main.bottomWorld（leftWorld/topWorld=0）
    // 最小世界门:边框两侧各 40 格,世界任一边 ≤80 格时钳制无意义(会把整张图框死)。
    // 原版最小世界 4200×1200 格,真实世界恒过此门;单测手搓小世界天然豁免
    if (wPx <= 2 * B || hPx <= 2 * B) return;
    if (this.x < B) { this.x = B; this.vx = 0; }
    if (this.x > wPx - B - this.w) { this.x = wPx - B - this.w; this.vx = 0; }
    if (this.y < B) {
      this.y = B;
      if (this.vy < 0.11) this.vy = 0.11;
      this.gravDir = 1;
    }
    if (this.y > hPx - B) {
      // 旅程上帝模式（Player.cs:23837-23845 creativeGodMode）：越界钳位不致死
      if (!journeyGodmodeActive()) {
        // KillMe(ByOther 21, 10.0):直死——绕过防御/无敌帧(不走 damage()),
        // hp 归零后由 fixedUpdate 尾部统一结算(死亡音/墓碑),最迟次 tick 生效
        this.hp = 0;
        this.lastDamageCause = { kind: 'underground' }; // ByOther(21) Underground_1..5
      }
      this.y = hPx - B;
      this.vy = 0;
    }
  }
  /** 贴墙缓降中（spikedBoots 攀壁） */
  wallCling = false;
  /** 老鼠坐骑 55 爬墙钉速（WallClimbMovement :21329-21450 非 spiked 支：-2/4/0.5；null=未爬） */
  ratClimbVy: number | null = null;
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
  /** 吸血预算（Player.cs:962 初始 99999 → 首帧 Update 钳到上限；本体语义 =
   *  每秒可吸血总量池）。Game 每 tick 回充：普通 +0.6 钳 80 / 专家 +0.5 钳 70
   *  （:24196-24216）。吸血命中扣全额浮点（Projectile.cs:11417/:11444） */
  lifeSteal = 80;
  /** 幸运值（RecalculateLuck :28672-28697 1:1）：
   *  luck = 瓢虫×0.2 + 火炬×0.2 + 药水档×0.1 + 风筝档×0.1/3 + 银河珍珠 0.03
   *        + 灯笼夜 0.3 + 地精 0.2 − 臭屁 0.25 + 装备 + 钱币 − 碎镜 0.25。
   *  不 clamp——luckMinimumCap=-0.7/luckMaximumCap=1（Player.cs:2952/2954）只喂 UI 计量
   *  （:3950-3957），聚合本体可超界（原版如此）。
   *  来源接线：药水 buff 257 三档 / 灯笼夜 / 地精+火炬（Game 15t 扫描）/ 装备（幸运币
   *  {855,3034,3035} +0.05、马掌族九件 +0.05、四叶草族 5574/5575/5576 +0.03/−0.1/−0.1
   *  ——luckEquipmentBonus，Player.cs:12628-12646）已接；瓢虫 604/605（击杀=坏运
   *  Enemy.hurt cs:82338、触碰=好运 ladybugAI cs:78730——旧注 359/360 为误记，实为蜗牛）、
   *  buff 383 风筝三档、buff 120 臭屁、银河珍珠 5340、碎镜 1085、微光化币——均已接
   *  （来源状态权威见 src/stats/Luck.ts 头注） */
  get luck(): number {
    const l = this.luckState;
    let v = l.ladyBugLuck * 0.2 + l.torchLuck * 0.2;        // :28673
    v += this.luckPotionTier * 0.1;                          // :28674（buff 257 三档）
    v += this.kiteLuckTier * (0.1 / 3);                      // :28675（buff 383 三档）
    if (l.usedGalaxyPearl) v += 0.03;                        // :28676-28678
    if (l.lanternsUp) v += 0.3;                              // :28679-28682
    if (l.hasGardenGnomeNearby) v += 0.2;                    // :28683-28686
    if (l.stinky || this.buffs.has(BuffType.Stinky)) v -= 0.25; // :28687-28690（buff 120 → stinky；l.stinky 为环境外注入位）
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
  /** kiteLuckLevel（Player.cs:9618-9623 buff 383）：clamp(buffTime/10800, 0, 3)——
   *  active 存秒，10800t=180s 一档；无 buff = 0（luck += 档×0.1/3 :28675） */
  get kiteLuckTier(): number {
    return this.buffs.kiteLuckLevel;
  }
  /** equipmentBasedLuckBonus（Player.cs:12628-12646，UpdateEquips 尾段逐旗加和）：
   *  ★取值语义：五旗各是【bool】——每种类型只计一次（多槽同款不叠），旗间【加法】
   *    非取最大（四叶草+0.03 / 枯萎−0.1 / 乌鸦羽−0.1 / 马掌族+0.05 / 幸运币+0.05，
   *    Player.cs:12628-12646 五个独立 if）。
   *  ★作用域：四叶草三旗经 RefreshInfoAccsFromItemType（:12321-12332）置位——
   *    UpdateEquips :12494-12498 对【全背包 0-57 + 装备槽 armor[0-9]（经
   *    GrantArmorBenefits :12683-12685）】逐槽刷新 → 口袋里带着就生效（原版
   *    1.4 信息饰品同机制，非装备位限定）；马掌/幸运币旗在 ApplyEquipFunctional
   *    （:12540-12546 仅 armor[3-9] 功能配饰槽）——装备位限定。
   *  hasLuck_LuckyHorseshoe 物品全集（ApplyEquipFunctional 9 处赋值）：158/396/
   *  1250/1251/1252/3250/3251/3252/5331（= accfx noFallDmg 集合减 6146）；
   *  hasLuck_LuckyCoin：855/3034/3035（= accfx luckyCoin 集）。曾只判 158——
   *  马掌族运气+0.05 对 396 黑曜石马掌/气球族/翱翔徽章全漏（2026-08-20 修） */
  private static readonly LUCK_HORSESHOE_VIDS = new Set([158, 396, 1250, 1251, 1252, 3250, 3251, 3252, 5331]);
  /** 四叶草族（RefreshInfoAccsFromItemType :12321-12332：hasLuck_LuckyClover/
   *  WiltedClover/RavenFeather → :12628-12646 +0.03/−0.1/−0.1） */
  private static readonly LUCK_CLOVER_BONUS: Record<number, number> = { 5574: 0.03, 5575: -0.1, 5576: -0.1 };
  get luckEquipmentBonus(): number {
    let b = this.equipStats.luckyCoin ? 0.05 : 0;      // :12640-12646 hasLuck_LuckyCoin
    // hasLuck_LuckyHorseshoe = 精确九件集（ApplyEquipFunctional 赋值处），armor[3-9]
    let horseshoe = false;
    for (let i = ACC_ARMOR_START; i < this.inv.accSlotMax && !horseshoe; i++) {
      const s = this.inv.armor[i];
      if (s && Player.LUCK_HORSESHOE_VIDS.has(vanillaIdOfItem(s.id))) horseshoe = true;
    }
    if (horseshoe) b += 0.05;                          // :12628-12631
    // 四叶草三旗：背包 0-57 + 装备槽 armor[0-9]（UpdateEquips :12494-12530 双扫描）
    let clover = 0, wilted = 0, raven = 0;
    const see = (vid: number) => {
      if (vid === 5574) clover = 1;
      else if (vid === 5575) wilted = 1;
      else if (vid === 5576) raven = 1;
    };
    for (let i = 0; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (s) see(vanillaIdOfItem(s.id));
    }
    for (let i = 0; i < 10; i++) {
      const s = this.inv.armor[i];
      if (s) see(vanillaIdOfItem(s.id));
    }
    // 虚空袋扫描(Player.cs:12525-12535):背包持有 4131 虚空透镜时 bank4 逐槽
    // WorksInVoidBag(默认全真,SetFactory.cs:97-107 仅两只海螺除外)→ 袋内四叶草
    // 同样置旗——复审 R1 P2(曾漏,袋内 5574 少 +0.03)
    const hasVoidLens = this.inv.slots.some((s) => s && vanillaIdOfItem(s.id) === 4131);
    if (hasVoidLens && this.banks[4]) {
      for (const s of this.banks[4]) {
        if (s) see(vanillaIdOfItem(s.id));
      }
    }
    if (clover) b += 0.03;                             // :12628 hasLuck_LuckyClover
    if (wilted) b -= 0.1;                              // :12632-12635 hasLuck_WiltedClover
    if (raven) b -= 0.1;                               // :12636-12639 hasLuck_RavenFeather
    return b;
  }
  inputDown = false;
  inputUp = false;
  onRope = false;

  /** 受击：防御减伤公式 max(1, dmg - defense*0.5)（移植自 Maples Player.OnAttacked）。
   *  knockback=false 用于窒息等环境伤害（只掉血不击退） */
  /** 受伤预览（与 damage() 同口径：难度防御系数 0.5/0.75/1.0 + endurance）——
   *  供调用方飘字使用，避免显示≠实扣（Main.cs:65646 CalculateDamagePlayersTake） */
  damagePreview(dmg: number): number {
    const endurance = (this.buffs.has(BuffType.Endurance) ? 0.1 : 0)
      + (this.equipStats.beetleDef ? 0.15 * this.beetleOrbs : 0)
      + (this.equipStats.enduranceEq ?? 0)   // 日曜套 0.12（与 damage 同口径,2026-08-13 同步）
      // 冰障 buff 62（:10127-10152）：半血以下 endurance += 0.25
      + (this.buffs.has(BuffType.IceBarrier) && this.hp <= this.maxHp / 2 ? 0.25 : 0);
    // 日曜护盾层预览不模拟消耗（取决于 damage 实际扣减序）,登记
    const diff = scaleStatsWorld().difficulty;
    const defF = diff >= GDL.MASTER ? 1 : diff >= GDL.EXPERT ? 0.75 : 0.5;
    return Math.max(1, Math.round((dmg - this.defense * defF) * (1 - endurance)));
  }

  /** pvp=true 走 Hurt 的 pvp 语义（Player.cs:37592 Hurt pvp 参）：减伤链与 PvE 完全
   *  相同（CalculateDamagePlayersTake 难度防系数 + endurance + 日曜——原版 PvP 实际
   *  扣血即此链；CalculateDamagePlayersTakeInPVP 的固定半防公式 Main.cs:65636 仅用于
   *  Hurt 返回值=吸血/近战反馈消费 :37953，不参与扣血）；差异点：①无敌帧 8t
   *  （:37769 num9 = pvp ? 8 : 40/80）——远短于 PvE，不同弹幕可高频命中（每弹另有
   *  playerImmune 40t 独立冷却，Projectile.cs:214/:13618，弹侧维护）②击杀置
   *  pvpDeath（KillMe :38208-38210）→ 不掉钱/300t 无敌满血复活/跳过 Boss 重生延迟 */
  /** 返回实际扣除的 HP（0=完全未受伤/被无敌帧吞掉——原版 Hurt 返回 0 语义;
   *  圣骑士盾转移/日曜反击消费此值。★pvp 时原版 Hurt 的【返回值】另有口径 =
   *  CalculateDamagePlayersTakeInPVP（dmg−def×0.5 下限 1,吸血/甲虫蓄能消费,
   *  :37953）——需要该口径的消费方自行计算,勿改本返回 */
  damage(dmg: number, srcX: number, srcY: number, knockback = true, pvp = false,
    cooldownCounter = -1): number {
    // 调试无敌（F2）：完全免伤——不扣血/不进无敌帧/不触发受击饰品（返回 0=未受伤）
    if (this.debugGod) return 0;
    // 旅程上帝模式（Player.cs:37595-37598 Hurt 首段 creativeGodMode → return 0
    // ——同样免伤不进无敌帧；NPC 接触碰撞侧 Player.cs:30863 整段跳过由本早退覆盖）
    if (journeyGodmodeActive()) return 0;
    // 微光化免伤（Player.cs:37591-37595 Hurt 前置：shimmering 且可闪避 → 直接返回 0；
    // 本仓 damage 以 false 表示完全免伤——Boss 专属弹幕 371 等不可闪避源未移植）
    if (this.shimmering) return 0;
    if (this.iframes > 0 || this.dead) return 0;
    const eq = this.equipStats;
    // 神秘艺术腰布 6189（Player.Hurt :38501-38505 mysticSashDodge 分支——1457 新,
    // 排在黑带前）：10% 闪避 → SetImmuneTimeForAllTypes(longInvince?120:80)（:38342-38344;
    // DoMysticSashDodge 紫尘/碎布 gore 登记未接——本仓 damage() 无 game 钩子）
    if (eq.mysticSashDodge && Math.random() < 0.1) {
      this.iframes = Math.max(this.iframes, eq.longInvince ? 120 : 80);
      return 0;
    }
    // 黑带/忍者大师装备 10% 闪避（Player.Hurt :38506-38510 → NinjaDodge :38404
    // SetImmuneTimeForAllTypes 同上——旧漏无敌帧,补）
    if (eq.blackBelt && Math.random() < 0.1) {
      this.iframes = Math.max(this.iframes, eq.longInvince ? 120 : 80);
      return 0;
    }
    // 混乱之脑 3223 完整闪避（Player.Hurt :38511-38515：1/6 且 buff 321 不在栏 →
    // BrainOfConfusionDodge :38331-38340 = SetImmuneTimeForAllTypes(80/120) +
    // brainOfConfusionDodgeAnimationCounter=300 + AddBuff(321,240)【return 0 不掉血】。
    // R5-F25：旧"受扣血后置 bocPulse"= 伤害照扣 + 无 buff321 禁再触发门,已修——
    // bocPulse 消费端（fixedUpdate）只负责挂 321,困惑反伤走 Game.damagePlayer 命中侧）
    if (eq.boc && Math.random() < 1 / 6 && !this.buffs.has(BuffType.BrainOfConfusionBuff)) {
      this.iframes = Math.max(this.iframes, eq.longInvince ? 120 : 80);
      this.bocPulse = 1;
      return 0;
    }
    // 受击破潜行（Player.Hurt :38530 `stealth = 1f;`——闪避分支已全部早退,走到此处
    // 即伤害落地,无条件复位；潜行装下一帧由更新段自然回蓄。曾缺=潜行态挨打不破隐）
    this.stealth = 1;
    // 耐久药水(114)：endurance+0.1 → 受伤 ×0.9（Player.endurance 在 Hurt 结算）
    const endurance = (this.buffs.has(BuffType.Endurance) ? 0.1 : 0)
      + (this.equipStats.beetleDef ? 0.15 * this.beetleOrbs : 0)   // 甲虫壳每球 15%（buffs 95-97）
      + (this.equipStats.enduranceEq ?? 0)                           // 日曜套 0.12（:16224,2026-08-13 接）
      // 冰障 buff 62（:10127-10152）：半血以下 endurance += 0.25（蠕虫围巾 0.17 走 enduranceEq）
      + (this.buffs.has(BuffType.IceBarrier) && this.hp <= this.maxHp / 2 ? 0.25 : 0);
    // 玩家受伤防御难度系数（Main.cs:65646-65657 CalculateDamagePlayersTake：
    // 经典 0.5 / 专家 0.75 / 大师 1.0，Journey 同经典档；防御步先截断，endurance 后乘）
    const diff = scaleStatsWorld().difficulty;
    const defF = diff >= GDL.MASTER ? 1 : diff >= GDL.EXPERT ? 0.75 : 0.5;
    // 日曜护盾（:37699-37720:套装在场且有层 → 消耗 1 层,该次伤 ×0.2+solarCounter 清零;
    // 反击 608 弹/冲撞命中消耗登记未接）
    // 格挡盾反击（:30979 CanParryAgainst+:30910-30920 消费——shieldParryTimeLeft>0
    // 且面向来敌 → 免伤+反伤 2×(kb 5)。shouldGuard = 按住下键,2026-08-13 简化实现:
    // 装备盾族+按住 Down → 格挡态;格挡中受击=反伤,降盾后 15t 冷却）
    const shouldGuard = this.inputDown && !!this.equipStats.shieldItem;
    if (shouldGuard !== this.shieldRaised) {
      this.shieldRaised = shouldGuard;
      if (shouldGuard) {
        if (this.shieldParryCd === 0) this.shieldParryTimeLeft = 1;  // :31268
        this.useTime = 0;
      } else {
        this.shieldParryCd = 15;   // :31276
        this.shieldParryTimeLeft = 0;
      }
    }
    if (this.shieldParryTimeLeft > 0) {
      this.shieldParryTimeLeft++;
      if (this.shieldParryTimeLeft > 20) this.shieldParryTimeLeft = 0;  // :31250
    }
    if (this.shieldParryCd > 0) this.shieldParryCd--;
    let solarConsumed = false;
    // 日曜护盾消耗门（Hurt :38591 `ImmunityCooldownID.Sets.Counter[cooldownCounter]`
    // = CreateBoolSet(General(-1), BossNoCheese(1))（ImmunityCooldownID.cs:31）——
    // R5-F23：岩浆(:2675)/触格伤不耗盾,旧无门全消耗。本仓单无敌帧通道,BossNoCheese
    // 档未建模,门 = counter ∈ {General, BossNoCheese}
    const solarGateOk = cooldownCounter === -1 || cooldownCounter === 1;
    if (solarGateOk && this.equipStats.solarSet && this.solarShields > 0) {
      solarConsumed = true;
      this.solarShields--;
      this.solarCounter = 0;
    }
    const solarMul = solarConsumed ? 0.2 : 1;
    const reduction = Math.max(1, Math.round((dmg - this.defense * defF) * (1 - endurance) * solarMul));
    this.hp -= reduction;
    // 受击闭眼 20t（Player.Hurt :37916 eyeHelper.BlinkBecausePlayerGotHurt——
    // 与无敌帧同步的全闭眼优先档，仅对真正造成伤害的命中）
    this.eyeBlinkHurt();
    // 无敌帧（:38674）：`pvp ? 8 : (num2 != 1 ? (longInvince?80:40) : (longInvince?40:20))`
    // ——R5-F24：伤被防到 1 的命中无敌帧减半（40/20）,旧缺该档
    this.iframes = pvp ? 8
      : (reduction !== 1 ? (eq.longInvince ? 80 : 40) : (eq.longInvince ? 40 : 20));
    // PvP 击杀（KillMe :38208-38210 if(pvp) pvpDeath=true）——重生端消费
    if (pvp && this.hp <= 0) this.lastPvpDeath = true;
    this.sinceHurt = 0; // 受击打断自然回血
    this.lifeRegenTime = 0; // 同源清零（Player.Hurt :37784 lifeRegenTime=0）
    // 甲虫攻击球受击掉一颗
    if (this.beetleOrbs > 0) this.beetleOrbs--;
    // 隐身药水受击破隐（Hurt :38566-38575 `if (invis) DelBuff(10)`——buff 10 在栏
    // 即删。R5-F27：旧受击不破隐,已补）
    if (this.buffs.has(BuffType.Invisibility)) this.buffs.remove(BuffType.Invisibility);
    // 恐慌项链：受击触发移速爆发（Hurt :38522-38525 AddBuff(63, 480)——buff 63
    // Panic! moveSpeed++（:10218-10220）= +1.0,480t=8s。R5-F26：旧 300 且按 dt 秒
    // 递减（实际 300s）双错已修）
    if (eq.panic) this.panicTime = 480;
    // 魔力手铐（magicCuffs :37678）：受伤回蓝 = 原始伤害 1:1（防前数值）
    if (eq.magicCuffs) this.mana = Math.min(this.maxMana, this.mana + dmg);
    // 击退（钴护盾族 noKnockback 免疫；坐骑冲刺态免击退——UpdateEffects
    // :4962/:4968 |vx| > DashSpeed-RunSpeed/2 时 mountedPlayer.noKnockback=true）。
    // 原版 Player.Hurt 击退段（Player.cs:37908-37912）：固定 velocity.X = 4.5×hitDirection、
    // velocity.Y = -3.5——【不按攻击方武器 kb 缩放】（NPC.knockBack 只作用于敌怪端
    // StrikeNPC），hitDirection=0 的伤害（岩浆/窒息/摔落）整段跳过。同段
    // fallStart = position.Y/16（:37912）：击退弹起从受击高度重新累计摔伤。
    // 旧近似 dir*3.4/-3 已按原版数值修正（2026-08-13）
    if (knockback && !eq.noKnockback
      && !(this.ridingMount && this.mount.dashNoKnockback(this.vx))) {
      const dir = this.cx < srcX ? -1 : 1;
      this.deathHitDir = dir;   // KillMe :38291-38292 X 初速 +2×hitDirection 的方向源
      this.vx = dir * 4.5;   // Player.cs:37910
      this.vy = -3.5;        // Player.cs:37911
      this.fallStartY = this.y;  // fallStart = position.Y/16（:37912，像素口径同源）
    } else if (knockback) {
      // 钴护盾免击退：速度不弹但击退方向照记（KillMe hitDirection 用 Hurt 参——
      // noKnockback 只清 velocity 不改 hitDirection 口径）
      this.deathHitDir = this.cx < srcX ? -1 : 1;
    }
    return reduction;
  }

  /** ShimmerUnstuck（Player.cs:28394-28428）：timeShimmering 清零，找最近无微光
   *  落点传送（TryFindingShimmerFreeSpot :28414-28440，落点 = ShimmerHelper 盒左上角
   *  再 +(0,-2)px、velocity=(0,0.0001)），清微光化态；找不到则保持原位等下一轮
   *  （原版同样仅 StartUnstuck 辅助）。传送附带短暂无敌帧（原版 Teleport style 12
   *  的 immune 语义近似——落点邻敌免秒杀） */
  private shimmerUnstuck(game: GameHooks, world: import('../world/World').World): void {
    this.timeShimmering = 0;
    const st = world.store;
    // 三层兜底（原版 :28442-28469）：玩家周围 → 出生点——保证封闭洞穴内也必脱困
    const spot = findShimmerFreeSpot(
      st, Math.floor(this.cx / TILE), Math.floor(this.y / TILE),
      world.spawnX, world.spawnY,
    );
    if (!spot) return;
    const p = shimmerTeleportPos(spot, this.w, this.h);
    this.x = p.x;
    this.y = p.y;
    this.vx = 0;
    this.vy = 0.0001;
    this.shimmering = false;
    this.inShimmer = false;
    this.buffs.remove(BuffType.Shimmered); // :28406 ClearBuff(353)——传送即解除微光化
    this.iframes = Math.max(this.iframes, PLAYER_IFRAME_TICKS);
    game.spawnParticles(this.cx, this.cy, '#BFE8FF', 14, 1.4, { life: 30, grav: -0.04 });
    game.playSfx('shimmerSplash', 1, this.cx, this.cy);
    // module8 广播（Player.cs:28402 BroadcastOrRequestParticleSpawn(ShimmerTownNPC,
    // PositionInWorld = Bottom)）——原版在 Teleport 之后取 base.Bottom（= 新位脚底）,
    // 此处 x/y 已更新,同语义照抄
    game.broadcastParticleOrchestra?.(ParticleOrchestraType.ShimmerTownNPC, this.cx, this.y + this.h);
  }

  /** ApplyTouchDamage（Player.cs:28507）1:1:直接伤害(护甲结算)→灼烧/流血 buff→
   *  窒息延迟→荆棘族触碰毁块。伤害被完全抵消(含无敌帧)时跳过 buff 授予(原版 num83==0 分支) */
  private suffocateDelay = 0;
  private applyTouchDamage(game: GameHooks, ht: HurtTile): void {
    let blocked = false;
    const dmg = TOUCH_IMMEDIATE.get(ht.type);
    if (dmg !== undefined) {
      this.lastDamageCause = { kind: 'defaultWrap' }; // ByOther(3) → DeathText.Default 包裹 generic
      // cooldownCounter=TileContactDamage(0)——Counter 集 {General,BossNoCheese}
      // 不含（R5-F23：仙人掌/荆棘触格伤不耗日曜盾）
      if (!this.damage(dmg, this.cx, this.y - 10, false, false, 0)) {
        blocked = true;
      } else {
        game.playSfx('hurt');
        game.addDamageNumber(this.cx, this.y, this.damagePreview(dmg), false, '#FF5050');
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

  // ============ 死亡散飞 + 硬核幽灵（KillMe/UpdateDead/Ghost 1:1） ============

  /** KillMe 尾段（Player.cs:38287-38298）：头/身/腿三段散飞初速——
   *  Y = Next(-40,-10)×0.1（-4.0..-1.1 向上抛）、X = Next(-20,21)×0.1 + 2×hitDirection；
   *  stoned 时三段 Position 归零（初速照掷——原版门字面照抄） */
  private initDeathParts(): void {
    const hitDir = this.deathHitDir;
    for (const seg of [this.deadParts.head, this.deadParts.body, this.deadParts.legs]) {
      seg.px = 0; seg.py = 0; seg.rot = 0;
      seg.vy = (Math.floor(Math.random() * 30) - 40) * 0.1;        // Next(-40,-10)×0.1
      seg.vx = (Math.floor(Math.random() * 41) - 20) * 0.1 + 2 * hitDir;  // Next(-20,21)×0.1 + 2×hitDir
    }
    // :38294-38298 stoned → 三段 Position 归零
    if (this.buffs.has(BuffType.Stoned)) {
      for (const seg of [this.deadParts.head, this.deadParts.body, this.deadParts.legs]) {
        seg.px = 0; seg.py = 0;
      }
    }
  }

  /** UpdateDead（Player.cs:16878-16888）：三段 pos += vel / rot += vel.X×0.1（翻滚）/
   *  vel.Y += 0.1（重力）/ vel.X ×= 0.99（水平阻尼）。immuneAlpha 的 +2 钳 255 由
   *  Game 死亡分支执行（同一段逻辑，不重复）。ghost 态帧推进（Ghost() :6444-6450） */
  private updateDeathParts(game: GameHooks): void {
    for (const seg of [this.deadParts.head, this.deadParts.body, this.deadParts.legs]) {
      seg.px += seg.vx;
      seg.py += seg.vy;
      seg.rot += seg.vx * 0.1;
      seg.vy += 0.1;
      seg.vx *= 0.99;
    }
    if (this.isGhostPhase(game.world)) {
      if (++this.ghostFrameCounter >= 8) {
        this.ghostFrameCounter = 0;
        this.ghostFrame = (this.ghostFrame + 1) % 4;
      }
    }
  }

  /** UpdateSunScorch（Player.cs:28144-28189 一比一）：暴露判定 → counter 推进 →
   *  120 档点火链。原版 whoAmI==Main.myPlayer 门 = 本仓 Player 仅主角实例跑
   *  fixedUpdate（联机代理不走本链）。非吸血鬼世界 vampireSeedSunlightExposure
   *  直出 → burning 恒 false → counter 恒 0，链尾整段死代码 */
  private updateSunScorch(game: GameHooks): void {
    // BuffState.vampireSeed（Main.vampireSeed，Main.cs:327）——OnFire -50HP/s 特档
    // （Player.cs:18798-18802）的开关；世界常量,每帧自 seedFlags 刷新
    this.buffs.vampireSeed = !!game.world.seedFlags?.vampireSeed;
    this.vampireSeedSunlightExposure(game);             // :28150
    const prev = this.sunScorchCounter;                 // :28151（点火沿探测用）
    this.updateSunScorchValues(game);                   // :28152
    if (!this.vampireBurningInSunlight || this.sunScorchCounter < 120) return;   // :28153-28156
    if (prev < 120) {                                   // :28157-28171 首越 120 档：
      // PlayerFrame() 探头 head==124 && body==85 && legs==72（怪物套装视觉槽——
      // 帧函数按 armor 槽序号重写 head/body/legs 后比对，本仓直接读等价的
      // hs/bs/ls）→ AchievementsHelper.NotifyProgressionEvent(33) = FEAR_THE_SUN
      const st0 = statOfInternal(this.inv.armor[0]?.id ?? -1);
      const st1 = statOfInternal(this.inv.armor[1]?.id ?? -1);
      const st2 = statOfInternal(this.inv.armor[2]?.id ?? -1);
      if (st0?.hs === 124 && st1?.bs === 85 && st2?.ls === 72) {
        game.achievements?.notifyProgressionEvent(33);
      }
    }
    // Array.Clear(buffImmune)（:28168）：点火帧清全部免疫——黑曜石头骨/十字章盾族
    //  当帧全部失效（原版下一帧 UpdateEquips 重建、再被本行清——本仓 immuneVanilla
    //  随 equipStats 键失效重建，等价；见 equipStatsKey 的 S/V 档）
    this.buffs.immuneVanilla.clear();
    if (!this.buffs.has(BuffType.OnFire)) {             // :28170-28178 !onFire 才发
      // ParticleOrchestrator VampireOnFire（:28178）= Spawn_VampireOnFire
      // （ParticleOrchestrator.cs:2352-2355）——仅播 SoundID.Item20，无粒子体。
      // module8 广播（RequestParticleSpawn !clientOnly, PositionInWorld=Center）：
      // 本地音已播,他端经 netApplyParticleOrchestra 同款落点复播
      game.playSfxWav?.('Item_20', 1, this.cx, this.y + this.h / 2);
      game.broadcastParticleOrchestra?.(ParticleOrchestraType.VampireOnFire,
        this.cx, this.y + this.h / 2);
    }
    // AddBuff 24/23/32 各 3【tick】= 0.05s（:28179-28181，AddBuff time 参为帧——
    // 每帧续期；24 OnFire/23 Cursed/32 Slow）
    this.buffs.apply(BuffType.OnFire, 3 / 60);
    this.buffs.apply(BuffType.Cursed, 3 / 60);
    this.buffs.apply(BuffType.Slow, 3 / 60);
    if (this.mount.active) this.mount.tryDismount(this);   // :28182-28185 mount.TryDismount
    // wingsLogic = 0; rocketBoots = 0（:28186-28187）——本仓 wing/rocketBoots 出自
    // equipStats（缓存键含炽灼档，见 computeEquipStats 尾部 S 档），本行无需直写
  }

  /** UpdateSunScorchValues（Player.cs:28094-28106 逐式 + :28107-28121 炽灼音环）：
   *  常态档 counter += burning ? 1 : −6；死亡档（UpdateDead :16928 调用）burning
   *  清 false、衰减放缓为 −2；一律钳 0-300。音环 = SoundID.VampireSizzle
   *  （CreateTrackable("sizzle").WithVolume(1)，SoundID.cs:1039——public/sounds/
   *  sizzle.wav 在库）：lerp = GetLerpValue(0,120,counter) 起轨并每帧跟随；
   *  loopingCondition（VampireSizzleTracker.IsActiveAndInGame = !gameMenu &&
   *  vampireSeed && counter>0）≈ counter 归零拆轨 */
  updateSunScorchValues(game?: GameHooks): void {
    let num = 6;                                        // :28100
    if (this.dead) {                                    // :28101-28105
      this.vampireBurningInSunlight = false;
      num = 2;
    }
    this.sunScorchCounter = Math.max(0, Math.min(300,   // :28106 Clamp(±, 0, 300)
      this.sunScorchCounter + (this.vampireBurningInSunlight ? 1 : -num)));
    // ---- :28107-28121 炽灼音环（SoundEngine.PlayTrackedLoopedSound + 每帧
    //      Volume/Position 更新；本仓常驻循环轨 playLoopFile + setVolume 同构） ----
    const lerpValue = Math.max(0, Math.min(1, this.sunScorchCounter / 120));   // GetLerpValue(0,120,·,true)
    if (!this._sizzleLoop && !this._sizzleFailed && lerpValue !== 0 && game?.startLoopSfx) {
      this._sizzleLoop = game.startLoopSfx('sizzle', lerpValue, 1);           // :28109-28115
      if (!this._sizzleLoop) this._sizzleFailed = true;   // 无钩子/无素材：本实例不再重试
    }
    if (this._sizzleLoop) {
      if (this._sizzleLoop.dead) {                       // 终态（stop/加载失败）拆轨
        if (!this._sizzleLoop.playing) this._sizzleFailed = true;  // 起振前死=加载失败，不再重建
        this._sizzleLoop.stop();
        this._sizzleLoop = null;
      } else if (this.sunScorchCounter <= 0) {           // counter 归零（条件出）拆轨
        this._sizzleLoop.stop();
        this._sizzleLoop = null;
      } else {
        this._sizzleLoop.setVolume(lerpValue);           // :28118 activeSound.Volume
      }
    }
  }

  /** 炽灼音环句柄（SfxLoop 同构面；Game.destroy/退世界拆轨用——防菜单残留） */
  private _sizzleLoop: {
    stop(): void; setVolume(v: number): void;
    readonly playing: boolean; readonly dead: boolean;
  } | null = null;
  private _sizzleFailed = false;
  /** 拆炽灼音环（Game.destroy → 本体调；Player 实例弃用前必经） */
  stopSizzleLoop(): void {
    this._sizzleLoop?.stop();
    this._sizzleLoop = null;
  }

  /** VampireSeedSunlightExposure（Player.cs:28191-28238 逐式）：吸血鬼种子世界
   *  的阳光暴露判定——地表 + 白天 + 无雨/日食/墓园/蘑菇地 + 月总天幕强度 ≤0.5 +
   *  不在水里 + 未持遮阳物（雨伞 946/悲剧之伞 4707）+ 非蝙蝠坐骑（56），则自脚下
   *  向上扫 ≤15 格找"透光墙"（无墙/玻璃 21/回声墙 318）→ vampireBurningInSunlight */
  private vampireSeedSunlightExposure(game: GameHooks): void {
    const w = game.world;
    const num = Math.floor(this.cx / 16);               // :28192 (int)Center.X/16
    let num2 = Math.floor((this.y + this.h - 1) / 16);  // :28193 (int)(Bottom.Y-1)/16
    // 帧首清位（ResetEffects :18549 vampireBurningInSunlight=false 的等价位——
    // 原版在 Player.Update 开头清、本链末尾置，本仓两步并到本函数首行）
    this.vampireBurningInSunlight = false;
    if (!w.seedFlags?.vampireSeed) return;              // :28195-28198 !Main.vampireSeed
    const num3 = 0.5;                                   // :28199
    // :28200 白天/露天六门（worldSurface 为 tile 行；ZoneGraveyard/ZoneGlowshroom
    // 来自 SceneMetrics——本仓 game.scene 每 15t 以玩家为中心刷新）
    const scene = game.scene;
    let flag = num2 < w.groundLevel && w.clock.isDay && !w.weather.raining
      && !w.clock.eclipse && !scene?.zoneGraveyard && !scene?.zoneGlowshroom;
    // :28201-28204 月总天幕（SceneMetrics.MoonLordSkyIntensity = 1−SmoothStep(3000,
    // 6000,距核)，SceneMetrics.cs:297-305；>0.5 → 距核<4500 → 天被月总遮黑不灼）
    if (flag) {
      let ml: { cx: number; cy: number } | null = null;
      for (const e of game.enemies()) {
        const en = e as { vanillaId?: number | null; cx?: number; cy?: number };
        if (en?.vanillaId === 398) { ml = { cx: en.cx ?? 0, cy: en.cy ?? 0 }; break; }
      }
      if (ml) {
        const d = Math.hypot(this.cx - ml.cx, this.cy - ml.cy);
        if (1 - Math.max(0, Math.min(1, (d - 3000) / 3000)) > num3) flag = false;
      }
    }
    if (!flag || this.inWater) return;                  // :28206-28209（wet 判定 = 水；
    //  原版 wet 不含岩浆/蜂蜜——本仓 inWater 同口径，见 :1673 注释）
    const heldVid = this.heldVid();                     // :28210 遮阳物二选一
    let flag2 = heldVid === 946 || heldVid === 4707;    // Umbrella/Tragic Umbrella
    if (this.mount.active && this.mount.type === 56) flag2 = false;   // :28211-28213 蝙蝠坐骑上伞失效
    if (flag2) return;                                  // :28214-28216 持伞免灼
    // ---- :28217-28238 自脚下向上 15 格透光墙扫描 ----
    const st = w.store;
    let num4 = 15;
    while (num4 > 0) {
      if (!st.inBounds(num, num2)) break;               // :28221 tile==null ≈ 出界
      const wi = st.idx(num, num2);
      const wall = st.wall[wi];
      const type = st.type[wi];
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      // 透光墙：无墙 0 / 玻璃 21 / 回声墙 318（回声涂层 invisibleWall 系统未建恒
      // false，:28225 末项化简掉——登记见 world/Paint.ts:129）
      if (wall === 0 || wall === 21 || wall === 318) {
        this.vampireBurningInSunlight = true;           // :28228
        break;
      }
      num4--;                                           // :28231
      num2--;                                           // :28232
      // :28233-28237 上方一格 SolidTile3 且本格非沙(54)/回声块(541) → 屋顶，停扫
      // （tile.* 读的是本格（自减前），SolidTile3 读的是上一格——照抄原版结构）
      const above = st.inBounds(num, num2)
        ? st.isActive(num, num2) && TileStoreRT.SOLID_LUT[st.type[st.idx(num, num2)]] === 1
        : false;
      if (above && sheet !== 54 && sheet !== 541) break;
    }
  }

  /** boss 存活在场（GetRespawnTime :38388-38398 扫描结果——Game 死亡分支每帧写入；
   *  +600t 复活延迟的开关，非 PvP 死亡才计） */
  bossNearOnDeath = false;
  /** 复活跳过可用（★1457 Main.cs:46104 AllowsRespawnTimerSkip 全门——Game 死亡
   *  分支每帧写入；死亡 UI 的"按SPACE跳过"提示淡入/滑移与此位联动，运行时态） */
  respawnSkipUi = false;
  /** 硬核幽灵态（Player.cs:16894-16901 difficulty==2 → respawn 计时到点 ghost=true；
   *  本仓 Game.respawnPlayer 对 hardcoreDead 拒绝重生 → 计时越过阈值即幽灵相。
   *  阈值 = GetRespawnTime（:38384-38422）：600t 基准 + boss 在场 600（:38398
   *  `if (flag) num += 600`）→ 【之后】专家 ×1.5（:38402-38404——boss 在场专家
   *  = (600+600)×1.5 = 1800，非 900+600） */
  isGhostPhase(world: import('../world/World').World): boolean {
    return this.dead && this.appearance?.difficulty === 2
      && this.respawnTimer > (600 + (this.bossNearOnDeath ? 600 : 0))
      * (mainExpertMode(world) ? 1.5 : 1);
  }

  // ============ 眼睑状态机（PlayerEyeHelper.cs 全文 1:1） ============

  /** PlayerEyeHelper.Update（:32-37）：SetStateByPlayerInfo → UpdateEyeFrameToShow →
   *  _timeInState++。逐 tick 由 fixedUpdate 驱动（原版 Player.Update :25812 调用点） */
  /** SpawnHallucination（Player.cs:13627-13656）1:1：Bone Helm（5100）在功能配饰槽
   *  （armor[0-9]——GrantArmorBenefits :12521 循环域）→ cooldown 递减 → 归零重掷
   *  Next(20,101) → 候选（CanBeChasedBy + 距离 ≤500 + CanHitLine）随机一只 →
   *  RandomizeInsanityShadowFor(isHostile:false) → 964 号弹（damage 18 / kb 0） */
  private updateInsanityShadow(game: GameHooks): void {
    this.insanityShadowCooldown = Math.max(0, Math.min(100, this.insanityShadowCooldown - 1));
    if (this.insanityShadowCooldown > 0) return;
    this.insanityShadowCooldown = 20 + Math.floor(Math.random() * 81);   // Next(20,101)
    // Bone Helm 检出（armor[0..9] 任一 vid 5100）
    let hasBoneHelm = false;
    for (let i = 0; i <= 9; i++) {
      const it = this.inv.armor[i];
      if (it && vanillaIdOfItem(it.id) === 5100) { hasBoneHelm = true; break; }
    }
    if (!hasBoneHelm) return;
    // 候选敌怪（:13641-13649：CanBeChasedBy + Distance ≤ 500 + CanHitLine）
    const store = game.world.store;
    const candidates: Array<{ cx: number; cy: number }> = [];
    for (const e of game.enemies() as unknown as Array<{ x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean }>) {
      if (e.dead || !playerCanHitEnemy(e, game)) continue;
      if (Math.hypot(e.cx - this.cx, e.cy - this.cy) > 500) continue;
      if (!canHitLine(store, this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) continue;
      candidates.push(e);
    }
    if (candidates.length === 0) return;
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    game.spawnInsanityShadow?.(randomizeFriendlyInsanityShadow(t.cx, t.cy));
  }

  /** 眼球伞（DoEyebrellaRainEffect Player.cs:13888-13919 + eyebrellaCloud :12661）与
   *  水晶鞋（DoGlassSlipperSparkles :13866-13887，ApplyEquipVanity :13821 门 =
   *  armor[13-19] 时装配饰槽）——饥荒联动小件，每 tick。 */
  private updateDontStarveCosmetics(game: GameHooks, world: import('../world/World').World): void {
    const headVid = (slot: number) => {
      const it = this.inv.armor[slot];
      return it ? vanillaIdOfItem(it.id) : 0;
    };
    // ---- 眼球伞：armor[0]（头盔）或 armor[10]（时装头）任一 = 5101（:12660-12664）----
    const eyebrella = headVid(0) === 5101 || headVid(10) === 5101;
    this.eyebrellaCloud = eyebrella;
    if (eyebrella && Math.random() * 4 < 1) {
      // 头顶出生点：MountedCenter − height×0.5 + x∈[−0.5,0.5)×(width+18) − 30
      // （坐骑 54 头顶偏移 −14×Directions 未建模——坐骑 54 = 月总头坐骑，登记）
      const vx = this.cx + (-0.5 + Math.random()) * (this.w + 18);
      const vy = this.cy - this.h * 0.5 - 30;
      const tx = Math.floor(vx / 16), ty = Math.floor(vy / 16);
      const st = world.store;
      if (st.inBounds(tx, ty)) {
        const i = st.idx(tx, ty);
        const dj = TILE_DEFS[st.type[i]];
        // WorldGen.SolidTile3 = active && !inActive && tileSolid && !tileSolidTop
        // + tile.liquid <= 0（:13912-13916）
        const solid3 = st.type[i] !== 0 && (st.wire[i] & 32) === 0   // TileStore.WIRE_ACTUATED
          && !!dj?.solid && !dj?.platform;
        if (!solid3 && st.liquid[i] <= 0) {
          game.spawnRainForced?.(vx, vy, (world.weather?.windSpeedCurrent ?? 0) * 3, 9);
        }
      }
    }
    // ---- 水晶鞋：armor[13-19]（时装配饰槽）任一 = 5077（ApplyEquipVanity :13821）----
    let slipper = false;
    for (let i = 13; i <= 19; i++) {
      const it = this.inv.armor[i];
      if (it && vanillaIdOfItem(it.id) === 5077) { slipper = true; break; }
    }
    if (slipper) {
      const D = game.vanillaDust;
      const shoeDye = this.inv.dye[2];
      const dyeVid = shoeDye ? vanillaIdOfItem(shoeDye.id) : -1;
      if (D && Math.random() * 60 < 1) {
        // 尘 204：CenteredRectangle(Center+(0,16×grav),20×8)、alpha 150、scale 0.3、
        // fadeIn 1、velocity×0.1、noLight、shader=cShoe（:13868-13877）
        const rx = this.cx - 10, ry = this.cy + 16 - 4;
        const d = D.spawn(rx, ry, 20, 8, 204, 0, 0, 150, null, 0.3);
        if (d) { d.fadeIn = 1; d.vx *= 0.1; d.vy *= 0.1; d.noLight = true; d.dyeVid = dyeVid; }
      }
      if (D && this.onGround && Math.abs(this.vx) + Math.abs(this.vy) > 1
        && Math.random() * 10 < 1) {
        // CanSpawnWalkingEffects 门（|vx|+|vy|>1）+ CenteredRectangle(Center+(−2×dir,16),6×8)
        const rx = this.cx + (-2 * this.facing) - 3, ry = this.cy + 16 - 4;
        const d = D.spawn(rx, ry, 6, 8, 204, 0, 0, 150, null, 0.3);
        if (d) { d.fadeIn = 1; d.vx *= 0.1; d.vy *= 0.1; d.noLight = true; d.dyeVid = dyeVid; }
      }
    }
  }

  /** 眼球伞云盖标记（Player.cs:1884 eyebrellaCloud——渲染层 DrawPlayer_38 消费） */
  eyebrellaCloud = false;

  // ---- 虫洞药水（item 2997 WormholePotion：HasUnityPotion/TakeUnityPotion
  //     Player.cs:41652-41697；消费链 = 观战键 B 传送 HandleSpectatingControls
  //     :16942-16947，CanWormholeToSpectating :17002-17009）----
  /** useVoidBag（Player.cs:22904-22902）：背包 58 格任一 4131 虚空袋 */
  useVoidBag(): boolean {
    for (let i = 0; i < 58; i++) {
      const s = this.inv.slots[i];
      if (s && s.stack > 0 && vanillaIdOfItem(s.id) === 4131) return true;
    }
    return false;
  }
  /** HasUnityPotion（:41652-41669）：背包 58 格任一 2997；持虚空袋时 bank4（banks[3]）也计 */
  hasUnityPotion(): boolean {
    for (let i = 0; i < 58; i++) {
      const s = this.inv.slots[i];
      if (s && vanillaIdOfItem(s.id) === 2997 && s.stack > 0) return true;
    }
    if (this.useVoidBag()) {
      const b = this.banks[3];
      for (let j = 0; j < b.length; j++) {
        const s = b[j];
        if (s && vanillaIdOfItem(s.id) === 2997 && s.stack > 0) return true;
      }
    }
    return false;
  }
  /** TakeUnityPotion（:41672-41697）：扣 1 瓶（背包优先 → 空位 SetDefaults(0)；
   *  持虚空袋时 bank4 兜底） */
  takeUnityPotion(): void {
    for (let i = 0; i < 58; i++) {
      const s = this.inv.slots[i];
      if (s && vanillaIdOfItem(s.id) === 2997 && s.stack > 0) {
        s.stack--;
        if (s.stack <= 0) this.inv.slots[i] = null;   // SetDefaults(0) = 清空
        return;
      }
    }
    if (!this.useVoidBag()) return;
    const b = this.banks[3];
    for (let j = 0; j < b.length; j++) {
      const s = b[j];
      if (s && vanillaIdOfItem(s.id) === 2997 && s.stack > 0) {
        s.stack--;
        if (s.stack <= 0) b[j] = null;
        return;
      }
    }
  }

  // ---- 抚摸宠物链（Player.cs:32881-32942 PetAnimal/PetMount + :33009-33033
  //     UpdatePettingAnimal + CanSnapToPosition :32945-32983；PlayerPettingInfo
  //     Terraria.GameContent/PlayerPettingInfo.cs）----
  /** 抚摸状态（Player.petting）。offsetFromPet = 目标 Bottom 的偏移（宠物在哪侧，
   *  玩家站对侧）；targetBottom = 快照（>2px 漂移即停，:33020） */
  readonly petting = {
    isPetting: false,
    isPetSmall: false,
    offsetX: 0, offsetY: 0,
    targetBottomX: 0, targetBottomY: 0,
    /** 坐骑抚摸支（PlayerPettingInfo.mount，Player.cs:33613 构造第三态）：
     *  骑乘 62-65 时右键坐骑 → PetMount（:33601-33620）——不 snap 站位（人已在坐骑上），
     *  UpdatePettingAnimal :33746-33752 mount 支 num=direction（无对侧站位语义） */
    mount: false,
    /** 宠物跟随体存活校验回调（Game 注入——目标死亡/换宠返回 false） */
    validTarget: null as null | (() => boolean),
  };
  /** 抚摸手臂动画档（ItemCheck_ApplyHoldStyle :49481-49508：miscCounter%14/7
   *  两档——0=ThreeQuarters / 1=Full；角度 = −2π×0.3×dir（小宠 0.2）。
   *  渲染侧无复合手臂层（引擎级缺口），仅暴露档位数据，登记） */
  get pettingArmPhase(): number { return Math.trunc(this.miscCounter % 14 / 7); }

  /** PetAnimal（:32901-32942）：snap 到宠物旁 → 置 petting 态。返回 false = 站位
   *  不可达（CanSnapToPosition / 地面非实心）。target 形参 = 宠物跟随体。 */
  petAnimal(game: GameHooks, target: {
    cx: number; bottomY: number; valid: () => boolean; isSmall: boolean; reach: number;
  }): boolean {
    // 站位点 = 目标 Bottom + offsetFromPet（取整，:32906 Floor）+ 要求脚下实心
    // （SolidTileAllowBottomSlope——斜坡底允许；本仓 solid 判定含半砖近似，登记）
    const num = Math.sign(target.cx - this.cx) || 1;       // num = 宠在玩家右侧?1:-1
    const ox = -num * target.reach;
    const vx = Math.floor(target.cx + ox);
    const vy = Math.floor(target.bottomY);
    const st = game.world.store;
    const gx = Math.floor(vx / 16), gy = Math.floor(vy / 16);
    if (!st.inBounds(gx, gy)) return false;
    if (!st.isSolid(gx, gy)) return false;   // SolidTileAllowBottomSlope 底面（实心底）
    // 已在抚摸同位 → 二次交互 = 停止（:32917-32921）
    if (this.petting.isPetting && Math.trunc(this.y + this.h) === vy
      && Math.abs(Math.trunc(this.x) - Math.trunc(vx - this.w / 2)) < 2) {
      this.stopPettingAnimal();
      return false;
    }
    // CanSnapToPosition（:32945-32965）：目标盒无实心碰撞 + 可视直线（薄柱回退）
    const nx = vx - this.w / 2, ny = vy - this.h;
    if (!this.canSnapToPosition(game, nx - this.x, ny - this.y)) return false;
    // StopVanityActions（:32923 坐/睡/抚摸互斥）+ RemoveAllGrapplingHooks（:32924）
    this.sitting = false;
    this.sleeping = false;
    this.removeAllGrapplingHooks();
    this.x = nx; this.y = ny;
    this.vx = 0; this.vy = 0;
    this.facing = num === 0 ? this.facing : -Math.sign(ox);   // 面向宠物（ChangeDir(sign(−offset))）
    this.petting.isPetting = true;
    this.petting.isPetSmall = target.isSmall;
    this.petting.offsetX = ox;
    this.petting.offsetY = 0;
    this.petting.targetBottomX = target.cx + ox;
    this.petting.targetBottomY = target.bottomY;
    this.petting.validTarget = target.valid;
    this.petting.mount = false;
    return true;
  }

  /** PetMount（Player.cs:33601-33620）：骑乘中右键坐骑的抚摸支——toggle 语义
   *  （抚摸中再点 = Stop，:33603-33606）；置 petting.mount 态（无站位 snap——
   *  PetAnimal 的 TryGetTarget 门 :33627-33629 对 mount 态恒 false，直接落状态位）。
   *  返回 = 是否进入抚摸态（true 时 Game 侧播 PalChilletJoy + 成就 21——
   *  :33614-33619 音效在 PetMount 内、HandleSpecialEvent(21) :33612） */
  petMount(): boolean {
    if (this.petting.isPetting) {
      this.stopPettingAnimal();
      return false;
    }
    this.stopPettingAnimal();
    this.petting.isPetting = true;
    this.petting.mount = true;
    this.petting.isPetSmall = false;          // isPetSmall: false（Mount.cs:6164）
    this.petting.validTarget = null;
    return true;
  }

  /** StopPettingAnimal（:33009-33012） */
  stopPettingAnimal(): void {
    this.petting.isPetting = false;
    this.petting.mount = false;
    this.petting.validTarget = null;
  }

  /** CanSnapToPosition（:32945-32983）：!SolidCollision(pos+offset) + CanHit 直线，
   *  失败回退宽 w−2 薄柱两向（TryAllowingSnappingToPosition :32986-33000）。
   *  第三回退（TileCollision 横向试走）以同距实心盒检查等价（登记） */
  private canSnapToPosition(game: GameHooks, offX: number, offY: number): boolean {
    const st = game.world.store;
    const tx = this.x + offX, ty = this.y + offY;
    if (!solidCollisionBox(st, tx, ty, this.w, this.h)) {
      return canHitLine(st, this.x, this.y, this.w, this.h, tx, ty, this.w, this.h);
    }
    // 薄柱回退（TryAllowingSnappingToPosition：w−2 宽两柱互见）
    const thin = this.w - 2;
    if (canHitLine(st, this.x + thin, this.y, 2, this.h, tx, ty, 2, this.h)) return true;
    if (canHitLine(st, this.x + thin, this.y, 2, this.h, tx + thin, ty, 2, this.h)) return true;
    return false;
  }

  /** UpdatePettingAnimal（:33015-33033）：目标失效/漂移 >2px/移动键/换向 → 停 */
  private updatePettingAnimal(): void {
    if (!this.petting.isPetting) return;
    // 坐骑抚摸支（:33746-33752）：TryGetTarget 对 mount 态恒 false → 跳过漂移门；
    // num = direction（:33748-33750 坐骑无对侧站位）→ `num != direction` 恒 false
    if (this.petting.mount) {
      // controlLeft/Right/Up/Down/Jump || pulley || (mount.Active && !petting.mount)
      // （:33751）——本仓 pulley 未跟踪（登记）；骑乘中抚摸的 mount.Active && !mount
      // 恒 false；下坐即停（Dismount :6219-6222 显式 Stop，Mounts/Game 下坐路径调）
      if (this.inputX !== 0 || this.inputUp || this.inputDown || this.inputJump) {
        this.stopPettingAnimal();
      }
      return;
    }
    const ok = this.petting.validTarget?.() ?? false;
    const drift = Math.hypot(
      this.petting.targetBottomX - (this.x + this.w / 2),
      this.petting.targetBottomY - (this.y + this.h));
    if (!ok || drift > 2) { this.stopPettingAnimal(); return; }
    const num = Math.sign(-this.petting.offsetX);
    // controlLeft/Right/Up/Down/Jump（:33030——inputX 覆盖左右、inputUp/Down 上下）
    if (this.inputX !== 0 || this.inputUp || this.inputDown
      || this.inputJump || num !== this.facing) {
      this.stopPettingAnimal();
    }
  }

  /** 换向沿备案（UpdatePettingAnimal :33752 `num != direction` 的坐骑支——
   *  num=direction 恒等,坐骑抚摸无换向停门；宠物支的换向停门见上） */

  private updateEyeState(game: GameHooks): void {
    // SetStateByPlayerInfo（:75-122）——优先级：致盲 > 受击锁存 > 床 > 中度伤 > 醉 >
    // 毒 > 风暴眯眼 > 正常眨眼
    if (this.buffs.has(BuffType.Blackout) || this.buffs.has(BuffType.Darkness)) {
      this.switchEyeState(EYE_BLIND);        // blackout/blind（:77-80）
    } else if (this.eyeState === EYE_HURT && this.eyeTimeInState < 20) {
      // 受击档锁存 20t（:83-86——期间更高优先级判定也让位）
    } else if (this.sleeping) {
      this.switchEyeState(EYE_BED, this.itemAnimTicks > 0);   // :87-91 reset=itemAnimation>0
    } else if (this.hp <= this.maxHp * 0.25) {
      this.switchEyeState(EYE_HURTDMG);      // :93-96 中度伤 = statLife ≤ statLifeMax2×0.25（:133-136）
    } else if (this.buffs.has(BuffType.Tipsy)) {
      this.switchEyeState(EYE_TIPSY);        // :98-101
    } else if (this.buffs.has(BuffType.Poisoned) || this.buffs.has(BuffType.Venom)
      || this.buffs.has(BuffType.Starving)) {
      this.switchEyeState(EYE_POISON);       // :103-106 poisoned||venom||starving（饥饿链 2026-08-20 补）
    } else {
      // :108-120 风暴眯眼 = ZoneSandstorm || (ZoneSnow && IsItRaining)；behindBackWall
      // 抑制位本仓无追踪（恒 false，登记偏离）
      const storm = !!game.scene?.zoneSandstorm
        || (!!game.scene?.zoneSnow && !!game.world.weather.raining);
      this.switchEyeState(storm ? EYE_STORM : EYE_BLINK);
    }
    // UpdateEyeFrameToShow（:39-73）——输出 0 睁 / 1 半闭 / 2 全闭
    const t = this.eyeTimeInState;
    let frame: number;
    switch (this.eyeState) {
      case EYE_BLINK: {
        // :46-47 正常眨眼：240t 周期末 6t——半闭 2t→闭 2t→半闭 2t
        const n = t % 240 - 234;
        frame = n >= 4 ? 1 : n < 2 ? (n >= 0 ? 1 : 0) : 2;
        break;
      }
      case EYE_STORM:
        frame = t % 120 - 114 < 0 ? 1 : 2;   // :51 眯眼 + 每 120t 末 6t 全闭
        break;
      case EYE_HURTDMG:
      case EYE_TIPSY:
      case EYE_POISON:
        frame = t % 120 - 100 < 0 ? 1 : 2;   // :56 耷拉眼 + 每 120t 末 20t 全闭
        break;
      case EYE_BED: {
        // :58-63 计时被 timeSleeping 覆写；<60 中度伤半闭/否则睁，60-119 半闭，≥120 全闭
        this.eyeTimeInState = this.timeSleeping;
        const base = this.hp <= this.maxHp * 0.25 ? 1 : 0;
        frame = this.timeSleeping >= 120 ? 2 : this.timeSleeping >= 60 ? 1 : base;
        break;
      }
      case EYE_BLIND:
      case EYE_HURT:
      default:
        frame = 2;                            // :65-70 致盲/受击恒全闭
        break;
    }
    this.eyeFrame = frame;
    this.eyeTimeInState++;                    // :36（EYE_BED 已被覆写为 timeSleeping）
  }

  /** SwitchToState（:124-131）：换态清零计时（同态不重置，除显式 reset） */
  private switchEyeState(state: number, reset = false): void {
    if (this.eyeState !== state || reset) {
      this.eyeState = state;
      this.eyeTimeInState = 0;
    }
  }

  /** BlinkBecausePlayerGotHurt（:138-141）：受击全闭 20t（Hurt :37916 调用） */
  eyeBlinkHurt(): void {
    this.switchEyeState(EYE_HURT, true);
  }
}

/** PlayerEyeHelper.EyeState 枚举序（PlayerEyeHelper.cs:12-22） */
const EYE_BLINK = 0;    // NormalBlinking
const EYE_STORM = 1;    // InStorm
const EYE_BED = 2;      // InBed
const EYE_HURT = 3;     // JustTookDamage
const EYE_HURTDMG = 4;  // IsModeratelyDamaged
const EYE_BLIND = 5;    // IsBlind
const EYE_TIPSY = 6;    // IsTipsy
const EYE_POISON = 7;   // IsPoisoned

/** Collision.SolidCollision（Terraria/Collision.cs 同名方法 1:1）：盒内任一实心
 *  非站顶格相交（半砖下移 8/高 8；扫描域 ±1/-1..+2 padding 同原版）。
 *  抚摸链 CanSnapToPosition（Player.cs:32948）消费 */
export function solidCollisionBox(
  st: { inBounds(x: number, y: number): boolean; idx(x: number, y: number): number; type: unknown; isSolid(x: number, y: number): boolean },
  px: number, py: number, w: number, h: number,
): boolean {
  const store = st as unknown as {
    inBounds(x: number, y: number): boolean; idx(x: number, y: number): number;
    type: Uint16Array; half: Uint8Array; isSolid(x: number, y: number): boolean;
  };
  const x0 = Math.max(0, Math.floor(px / 16) - 1);
  const x1 = Math.floor((px + w) / 16) + 2;
  const y0 = Math.max(0, Math.floor(py / 16) - 1);
  const y1 = Math.floor((py + h) / 16) + 2;
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      if (!store.inBounds(i, j)) continue;
      if (!store.isSolid(i, j)) continue;   // active && !inActive && tileSolid（含致动门）
      const k = store.idx(i, j);
      if (TILE_DEFS[store.type[k]]?.platform) continue;   // !tileSolidTop
      let ty = j * 16, th = 16;
      if (store.half[k]) { ty += 8; th -= 8; }            // halfBrick
      if (px + w > i * 16 && px < i * 16 + 16 && py + h > ty && py < ty + th) return true;
    }
  }
  return false;
}

// 敌人实体：统一类 + 按 key 分支行为（史莱姆/僵尸/恶魔眼/蝙蝠/克苏鲁之眼及其仆从）
// + 原版 NPC 数据驱动路径（vanillaId）：属性/AI/音效/贴图来自 vanilla-npcs.json（SetDefaults 提取）
import { Entity } from './Entity';
import { entityNet } from '../net/entitySyncHooks';
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import { paintColor } from '../world/Paint';
import { liquidCollision } from '../stats/TouchDamage';
import { updateNpcLiquid, getWaterLine } from './npcLiquid';
import type { GameHooks } from './types';
import { Clock } from '../world/World';
import type { Player } from './Player';
import { ENEMY_DEFS, EnemyDef } from '../data/enemies';
import { vanillaNpc, vanillaSoundFiles, type VanillaNpc } from '../data/vanillaNpcs';
import { IDLE_SOUNDS, CHATTER_SOUNDS, CRITTER_SOUNDS } from '../data/vanillaNpcAmbience';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';

/** 镇静药水(物品 3090)的 npcTypeNoAggro 置位表（Player.cs:14144-14168：
 *  `if (currentItem.type == 3090)` 下逐项 npcTypeNoAggro[N]=true，共 23 类；
 *  字段声明 Player.cs:2858。本仓等效语义：Calming buff（vanillaBuff 106）生效
 *  期间视为置位，消费点 effectiveTargetDist(+1000 罚)与 seekDirX(不面向门)。 */
export const CALMING_NO_AGGRO_TYPES: ReadonlySet<number> = new Set([
  1, 16, 59, 71, 81, 138, 121, 122, 141, 147, 183, 184, 204, 225, 244,
  302, 333, 335, 334, 336, 537, 676, 667,
]);
/** Main.wallDungeon（Main.cs:10507-10515：主题墙 7/8/9 + 1.4 变体 94-99）——地牢之魂
 *  双门的墙侧（SceneMetrics/WorldGen 各有一份同值表） */
const DUNGEON_WALL_IDS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
import { canHit } from '../physics/LineOfSight';
import { spawnStardustMarks } from './StardustMarkProj';
import { moveAndCollide } from '../physics/TileCollision';
import { Dart } from './Dart';
import { BookProj } from './BookProj';
import { SquidCloud } from './SquidCloud';
import { avoidWater } from './waterAvoid';
import { daybreakStacks } from './WeaponProj';
import { npcCheckArmorPenetration } from './projStatus';
import { bindEnemyCtor, skeletronBossAI, skeletronHandAI, kingSlimeAI, brainOfCthulhuAI, creeperAI, twinsAI, skeletronPrimeAI, primePartAI, destroyerAI, destroyerSegmentLight, spawnPart, addEnemy, shoot, losClear, mechProbeLock } from './bossAI';
import { mechQueenUp } from './mechQueen';
import { wallOfFleshAI, wofEyeAI, hungryAI } from './bossAI_wof';
import { lunaticCultistAI, empressOfLightAI, queenSlimeAI, ancientLightAI, ancientDoomAI } from './bossAI_lategame';
import { deerclopsAI } from './bossAI_deerclops';
import { queenBeeAI, planteraHookAI, planteraAI, planteraTentacleAI, planteraTentacle2AI } from './bossAI_queenbee_plantera';
import { dukeFishronAI, dukeBubbleAI, sharkronAI, moonLordCoreAI, moonLordHandAI, moonLordHeadAI } from './bossAI_duke_moonlord';
import { golemAI, golemHeadAI, golemFistAI } from './bossAI_golem';
import {
  mourningWoodAI, pumpkingAI, pumpkingBladeAI, iceQueenAI,
  santaNK1AI, elfCopterAI, flockoAI, snowmanAI, bouncingBallAI,
} from './bossAI_moon_events';
import {
  martianProbeAI, martianSaucerAI, martianSaucerPartAI, martianDroneAI,
  teslaTurretAI, bubbleShieldAI, angryNimbusAI, martianFighterExtras,
} from './bossAI_martian';
import {
  flyingDutchmanAI, sandElementalAI, sandSharkAI, dd2AttackerTestAI,
  eterniaCrystalAI, lanePortalAI, divingFlyerAI, darkMageAI, betsyAI,
  dd2LightningBugAI, ai107ImprovedWalkers,
} from './bossAI_dd2';
import {
  moonLordFreeEyeAI, moonLeechAI, cultistTabletAI, lunaticDevoteeAI,
  cultistArcherStandbyAI, cultistArcherWake, phantomAI, bigMimicAI,
  mothronAI, mothronEggAI, babyMothronAI, graniteElementalAI,
  starCellAI, smallStarCellAI, flowInvaderAI, nebulaFloaterAI, solarSlimeAI,
  crawltipedeAI, lunarLocalAI,
} from './bossAI_lunar_misc';
import { RNG } from '../core/rng';
import { TOWER_KEY } from '../world/LunarEvent';
import { openDoor } from '../world/Door';
import {
  fighterMoveStep, chaosElementalStep, swampThingAmbushStep, attemptToFindTeleportSpot,
  attemptToFindTeleportSpotNearBooks,
  psychoStealthStep, nailheadHitScatter, butcherKbStep, possessedStep, fritzPounceStep,
  stormDiverStep, FIGHTER_NO_DOOR,
} from './fighterFamilies';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import type { ItemDrop } from './ItemDrop';
import {
  resolveDrops, rollCoins, rollHeartsAndStars, rollBossPotionsAndHearts,
  dropVelocity, npcValueOf, type NpcDropCtx,
} from '../drops/NpcDrops';
import { isNpcShimmerImmune, npcShimmerTransformTo, npcShimmerTransformToItem } from '../stats/Shimmer';
import {
  scaleStats, getAttackDamageForProjectiles, type ScalingStats,
  GDL, remap, mainDifficulty, mainExpertMode, getAttackDamageCappedAtMaster,
  getKnockbackMultiplierScaledByDifficulty,
  scaleStatsWorld, applySeedAdjustments, type SeedAdjustStats, f32,
} from '../stats/ScaleStats';
import { BuffType } from '../stats/Buffs';
import { rollLuck, rollOnlyBadLuckExtreme } from '../stats/Luck';
import { spawnNpcDeathGore, GorePiece } from './GorePiece';
import { hslToRgb } from '../player/Appearance';

/** 无 key 映射的原版物品 id（一次性告警用） */
const UNMAPPED_WARNED = new Set<number>();

/** NPCID.Sets.CritterThatCanTurnOnPlayers（NPCID.cs:4779）：松鼠族 + 宝石松鼠——
 *  玩家 CanHit 内 1/3000 厄运掷 → 黑化反咬（townCritterWalkAI 头部，NPC.cs:53797） */
const CRITTER_TURN_ON_PLAYERS = new Set([299, 538, 539, 639, 640, 641, 642, 643, 644, 645]);

// ================= NPC 侧点光的共享近似源（GameHooks 取不到 FlickerClock/Main 计数器） =========
/** 近似 Main.timeForVisualEffects（Main.cs:17110-17113：每帧 +1、216000 回卷）。
 *  以 performance.now() 折帧数（16.6667ms/帧）——光色波（hsl 时间色/WrappedLerp）
 *  只需视觉节拍，帧漂移无感 */
export function visEffectFrames(): number {
  return (performance.now() / 16.6667) % 216000;
}
/** 近似 Main.mouseTextColor（Main.cs:18066-18073：190↔255 每帧 ±1 三角波，周期 130 帧）。
 *  消费点：cs:24722（火轮 num306=(270−mouseTextColor)/400）、cs:93547 等
 *  UpdateNPC_CastLights 的 (270−mouseTextColor)/500 抖动项 */
export function mouseTextColorApprox(): number {
  const t = visEffectFrames();
  const p = t % 130;
  return p < 65 ? 190 + p : 255 - (p - 65);
}
/** 661 帝皇蝶离神圣渐隐一步（NPC.cs:45240-45263 纯函数化，仅 type 661）：
 *  fading（目标失效 / 中心距 ≥300 / 目标玩家不在神圣，:45244-45252）→ ai2 +1，
 *  否则 −1，钳 [0, cap]（cap=50 常态；目标不在神圣抬到 60，:45242/:45250）；
 *  opacity = GetLerpValue(60, cap/2, ai2)（:45263）——ai2 ≤ cap/2 全显，
 *  cap/2→60 线性渐隐；ai2 ≥ 60 → despawn（active=false，:45254-45261）。
 *  渲染侧 Renderer.npcGlowOrbitParams 同源消费 ai2（轨道环半径 2+ai2 /
 *  num300 下限 GetLerpValue(0,60,ai2) / 相位 0→3）。 */
export function lacewingFadeStep(
  ai2: number, fading: boolean, cap: number,
): { ai2: number; opacity: number; despawn: boolean } {
  const DESPAWN = 60;                                                // num3（cs:45240）
  const next = Math.max(0, Math.min(cap, ai2 + (fading ? 1 : -1)));   // cs:45253 Clamp(±1, 0, num4)
  if (next >= DESPAWN) return { ai2: next, opacity: 0, despawn: true };
  const from = DESPAWN, to = cap / 2;                                // cs:45263 GetLerpValue(60, num4/2, ·)
  let opacity: number;
  if (next <= to) opacity = 1;                                       // 反向区间：≤to 全显
  else if (next >= from) opacity = 0;
  else opacity = (next - from) / (to - from);
  return { ai2: next, opacity, despawn: false };
}
// 原生 def 覆盖表(钱币/凝胶/火把/晶状体→本地键)已随本地物品退役移除:
// 全量 vi_ 注册(VANILLA_ITEM_KEY_BY_ID)直接覆盖;236 曾误当 Lens(实为 Black Lens)
/** 雕像产怪战利品门（NPCID.Sets，NPC.cs :79648-79654 NPCLoot 早退用） */
const STATUE_NO_EARLYMODE_LOOT = new Set([480, 82, 86, 170, 180, 171]);
/** DoesntDespawnToInactivity 名单（NPC.cs:78584-78641）中本批涉及的仪式/月总链类型——
 *  神秘石碑 437/忠实信徒 438/弓手 379,380（拜月仪式链条，离屏消失会断 439 召唤链）与
 *  月总游离眼 400（锚核心 398 生命周期，自身不参与离屏消散）。
 *  690 雕像宝箱怪休眠态（CheckActive :78692 `type==690 && ai[0]==0` 豁免）——AI_126
 *  未移植时 ai0 恒 0 = 永远休眠，离屏不消散与原版休眠态一致 */
/** DoesntDespawnToInactivity 名单外补丁（名单本体 NPC.cs:78584-78658）：血肉墙族
 *  113 墙/114 之眼/115 饥饿者/118+119 水蛭体节在列——离屏永不因闲置消散；
 *  ★116 饿魂与 117 水蛭头【不在】名单（照原文，任务单曾列 117 系笔误）——水蛭头
 *  消散时其体节链经下方 despawn 链杀级联（原版 :51832-51841 段自查前段失效自灭） */
/** DoesntDespawnToInactivity（NPC.cs:78584-78679）全量 + 690（CheckActive 头部
 *  type==690&&ai0==0 门）。★14/15（EoW 体节/尾）必在——它们 SetDefaults boss=false
 * （仅头 13 是 boss）又不在此前名单,离屏 750t 消散会触发链级联整链同灭 →
 * "EoW 打两下自动战败"根因。★413/414（爬尾虫身/尾）同款补入：crawltipedeAI 的
 * 段完整性自查（NPC.cs:51807-51861）会把"邻段离屏消散"级联成整链 die（带掉落）
 * ——30 段长链尾段出屏即连锁塌链。139(Betsy 依赖 134 在场)/552-578(依赖 548 永恒
 * 水晶在场)为条件项,单独判定 */
const NO_DESPAWN_IDS = new Set([
  8, 9, 11, 12, 14, 15, 36, 40, 41, 88, 89, 90, 91, 92, 96, 97, 99, 100,
  113, 114, 115, 118, 119, 128, 129, 130, 131, 134, 135, 136, 246, 247, 248, 249,
  263, 267, 328, 379, 380, 392, 393, 394, 396, 397, 398, 400, 413, 414, 422, 437, 438,
  439, 440,
  488, 492, 493, 507, 517, 548, 549, 551, 564, 565, 690,
]);
/** CheckActive flag2 强真名单（NPC.cs:78735-78758:boss 之外 type∈{7,10,13,35,36,
 *  39,87,127-131,392-394,491,492} 恒视屏内）。13=EoW 头（即便 boss 位被换锚到
 *  体节后,原头残段也不消散） */
const ALWAYS_ACTIVE_IDS = new Set([7, 10, 13, 35, 36, 39, 87, 127, 128, 129, 130, 131, 392, 393, 394, 491, 492]);
/** StatueSpawnedDropRarity（NPCID.cs:4795）：-1=不受限；≥0=按该概率整单出战利品 */
const STATUE_DROP_RARITY: Record<number, number> = {
  480: 0.05, 82: 0.05, 86: 0.05, 48: 0.05, 490: 0.05, 489: 0.05,
  170: 0.05, 180: 0.05, 171: 0.05, 167: 0.25, 73: 0.01, 24: 0.05,
  481: 0.05, 42: 0.05, 6: 0.05, 2: 0.05, 49: 0.2, 3: 0.2, 58: 0.2,
  21: 0.2, 65: 0.2, 449: 0.2, 482: 0.2, 103: 0.2, 64: 0.2, 63: 0.2, 85: 0,
};

/** 原版 Boss 头/主体 id（部件不标记:击杀部件不应出 Boss 退场流程）。
 *  与 1456 SetDefaults boss=true 全集逐块对齐（2026-08-13 整体 review 复核）：
 *  4 EoC / 35 骷髅王 / 50 史莱姆王 / 113 血肉墙 / 125,126 双子 / 127 Prime /
 *  134 毁灭者 / 222 蜂后 / 245 石巨人 / 262 世纪之花 / 266 克脑 / 370 猪鲨 /
 *  395 火星飞碟(:13993) / 396/397 月总头手 / 398 月总核心 / 439 异教徒 /
 *  578 DD2 闪电甲虫 T3 / 636 光皇 / 657 史莱姆皇后 / 664 火把神 / 668 鹿角怪。
 *  13-15 世吞三段：原版 :79225 动态置位(仅头实时 boss=true),本仓恒含 13 供
 *  boss 槽/掉落锚定。★68 地牢守卫(:9584 无 boss 位)、325 哀木/327 南瓜王
 *  (:13047)、345 冰女王/346 圣诞坦克(:13301)——SetDefaults 均无 boss=true,
 *  不入本集合（月事件 Boss 只有波次进度与掉落,占槽会误播"已被击败"误写
 *  downed）。396/397/578/664 已随消散审计补入（EoW 14/15 同款离屏消散隐患,
 *  见 NO_DESPAWN_IDS 注释）;boss 槽接管点已审：仅联机傀儡(:906)/F6 调试
 *  (:13085)/显式召唤链——事件怪(578/664)与月总部件无通用接管,补入无副作用 */
/** 原版 SetDefaults boss=true 全量对账（NPC.cs 逐 case 提取,2026-08-13）:
 *  4/35/50/113/125/126/127/134/222/245/262/266/370/395/396/397/398/439/578/
 *  636/657/664/668（另含本仓语义位 13） */
export const VANILLA_BOSS_IDS = new Set([
  4, 13, 35, 50, 113, 125, 126, 127, 134, 222, 245, 262, 266, 370, 395, 396, 397, 398,
  439, 578, 636, 657, 664, 668,
]);
/** 训练假人 tile 378（v_378_target_dummy；dummyAI 锚定判定用） */
const DUMMY_TILE_ID = TILE_BY_KEY['v_378_target_dummy'] ?? -1;

// AI_003 战士族昼行豁免表（DespawnEncouragement_AIStyle3_Fighters_NotDiscouraged 排除表
// NPC.cs:60694-60724 + switch 保留集 :60712-60721）：白天地表仍索敌的类型
// （腐化/猩红战士、秃鹫、鸟妖、事件怪等群系原住民）。僵尸 3 不在表内 → 白天驱散。
const FIGHTER_DAY_ACTIVE = new Set([
  73, 624, 631, 31, 294, 295, 296, 47, 67, 77, 78, 79, 80, 630, 110, 120, 168, 181, 185,
  198, 199, 206, 217, 218, 219, 220, 239, 243, 254, 255, 257, 258, 291, 292, 293,
  379, 380, 464, 470, 424, 411, 409, 415, 419, 425, 427, 428, 429, 508, 524, 525, 526, 527, 580, 582,
  // 入侵怪（原版昼行：入侵期间不被驱散——哥布林 26-29/111/471、海盗 212-216、雪人 143-145）
  26, 27, 28, 29, 111, 471, 212, 213, 214, 215, 216, 143, 144, 145,
]);
// 火星入侵昼行豁免（cs:60705 第四组 invasionType!=4 门）：入侵进行中这些战士族
// 不被白天驱散（387 特斯拉炮塔是 aiStyle 73 无此逻辑,不列）
const MARTIAN_DAY_ACTIVE = new Set([381, 382, 383, 385, 386, 389, 391, 520]);
// AI_002 飘浮眼昼散表（DespawnEncouragement_AIStyle2_FloatingEye_IsDiscouraged, cs:53152-53165）：
// 白天 && y≤worldSurface → EncourageDespawn(10) + 保持水平方向向上飞离
const EYE_DAY_DESPAWN = new Set([2, 133, 190, 191, 192, 193, 194, 317, 318]);

// AI_014 wet 浮力表（cs:23232 蝙蝠/恶魔/巨狐蝠/孢子蝠 + cs:23380 哈比 48）：
// 入水上浮弹出水面（vy>0 ×0.95、恒 -0.5、钳 -4 + TargetClosest）；表外 aiStyle14 无此段
const AI014_SWIM_UP = new Set([48, 49, 51, 60, 62, 66, 93, 137, 150, 151, 152, 634]);

/** 原版路径 key（v_*）的占位 def，fromVanilla 会整体覆写 */
const PLACEHOLDER_DEF: EnemyDef = {
  key: 'v_placeholder', name: '?', hp: 1, damage: 0, knockbackResist: 0.5,
  width: 16, height: 16, mapColor: '#9A8FA0', gore: ['#9A8FA0', '#5E5566', '#C4BACC'],
  hitSound: ['NPC_Hit_1'], killedSound: ['NPC_Killed_1'], drops: [],
};

export class Enemy extends Entity {
  /** 原版 NPC id（数据驱动路径启用时非空） */
  vanillaId: number | null = null;
  /** 穿墙旗（原版 noTileCollide；fairyAI 状态 2-7 宝箱引导态置真） */
  noTileCollide = false;
  vanilla: VanillaNpc | null = null;
  /** npc.difficulty（ScaleStats 写入，NPC.cs:18086 = strengthOverride ?? Main.Difficulty）：
   *  原版档位浮点（Classic 1/Expert 2/Master 3，getGoodWorld +1）——AI 段
   *  GetAttackDamage_ScaledByDifficulty/ForProjectiles（如饥饿者 :26341）消费。
   *  未进 ScaleStats 门（friendly/townNPC/无伤小动物）保持 0（原版字段初值） */
  difficulty = 0;
  /** defDamage 的【未缩放】基线（ScaleStats 前的 v.damage，critter/friendly 归零后值）。
   *  敌怪弹幕出膛原版一律用 ForProjectiles(基线, 基线×N) 这类显式档位 lerp
   *  （NPC.cs:21180 等），命中玩家的难度乘区在 Projectile.cs:13770 统一做——
   *  若此处误用缩放后的 def.damage 会与命中端乘区叠加成双重缩放 */
  baseDamage = 0;
  /** 雕像产怪（Wiring.cs:2480 SpawnedFromStatue）：value=0 不掉钱、
   *  肉前集合不掉战利品、StatueSpawnedDropRarity 概率门（NPCLoot :79648-79654） */
  spawnedFromStatue = false;
  /** 捕获物释放出生（NPC.releaseOwner != 255 语义，NPC.cs:78709 不计 nearby 槽） */
  releasedFromItem = false;
  /** NPC.AnyInteractions（NPC.cs:5431 playerInteraction[who] 任一 true）——本仓 hurt 调用方
   *  全为玩家武器/弹幕/荆棘链 → hurt 生效即等价玩家交互；雕像门 :79651 消费 */
  playerInteracted = false;
  /** 鞭 tag（Projectile.ApplyTag → npc.whipTimeLeft 系）：剩余 tick 与附加伤害
   *  （240t=4 秒；随从命中被 tag 敌伤害 +whipTagDmg） */
  whipTagT = 0;
  whipTagDmg = 0;
  whipTagCrit = 0;
  whipTagItem = 0;
  /** 鞭 proc（proc 型鞭命中启用 240t，随从首跳触发后清零） */
  whipProcT = 0;
  whipProcItem = 0;
  /** 原版 NPC 全体走 Collision.StepUp（NPC.cs:54382） */
  stepUp = true;
  stepUpHolds = true; stepUpNpc = true;   // holdsMatching + IgnoredByNpcStepUp（NPC.cs:54382 flag22 恒 true（飞行 AI 不走地面段））
  // ---- 蠕虫多段体（AI_006，NPC.cs:18046）：头 aiStyle 6，编号约定 头+1=身 头+2=尾 ----
  /** 链上紧随本段的一段（头 → 身×n → 尾） */
  wormNext: Enemy | null = null;
  /** EoW 链总段数（头+体+尾,EaterOfWorldsProgressBar 恒定分母用——
   *  原版 maxLife = (GetEaterOfWorldsSegmentsCount()+2)×150,玩家杀段不缩分母;
   *  spawnWormChain 写入全链各段,断链拆分时各自继承原值） */
  eowChainMax = 0;
  /** 共享生命主段（NPC.realLife :6086;=null 即 -1 各自独立）。毁灭者族 134-136
   *  首帧建链时全链指向头（:50208-50222）——受击伤害传导扣主头、本段 hp 镜像
   *  （StrikeNPC :82132-82137）,段不可单独打死;EoW 族恒 null（:51524 realLife=-1
   *  各段独立 150HP）。WoF 113-115 用 wofNPCIndex（:26148）同语义由其 AI 自管 */
  realLifeHost: Enemy | null = null;
  /** 本段跟随的前一段（非空 = 本段是身体段，跳过 AI 只做跟随） */
  wormFollow: Enemy | null = null;
  /** 上一 tick 位置（段跟随用：段复制前一段的旧位置 = 经典贪吃蛇链） */
  prevX = 0;
  /** 存活 tick 计数(侏儒石化等用) */
  gnomeAge = 0;
  prevY = 0;
  /** EoW 掘地音效间隔（:52375-52395 soundDelay，距离/40 钳 10..20） */
  digSndDelay = 0;
  /** 蠕虫出生特效一次性门（117 水蛭爆尘/454 幻影龙音效,localAI 首帧哨兵） */
  _wormSpawnFx = false;
  /** 击杀时生效的 npc.boss 位（DropEoWLoot :79212-79228：场上再无 13/14/15 才置位；
   *  掉落门/图鉴/Boss 药水心共用。仅 EoW 三段非恒 true，其余 = def.boss） */
  killBossFlag = false;

  // ===================== 原版 npc.oldPos/oldRot 历史缓冲（DrawNPC 拖尾族） =====================
  // 原版 NPC.oldPos/oldRot 容量 10，UpdateNPC 头部整体后移一格 → oldPos[i] = i tick 前
  // 的左上角坐标。Main.cs DrawNPC 拖尾族读 0..9：蠕虫族 125-131（:24660 间隔 2 取 5 份）、
  // 火月怪 419（:24638 取 0..6 七份渐隐 + 帧行 5-7 循环）。
  // 定长预分配（性能审计"每帧分配热点"清单），零逐 tick 分配；联机傀儡路径同样推入
  // （fixedUpdate 头部早退分支内单独调用）——傀儡只有快照推进但拖尾同样需要历史。
  private static readonly HIST_N = 10;
  private histX = new Float64Array(Enemy.HIST_N);
  private histY = new Float64Array(Enemy.HIST_N);
  private histRot = new Float64Array(Enemy.HIST_N);
  private histHead = 0;   // 最新条目下标
  private histCount = 0;  // 已填条数（<10 时拖尾按实际深度截断）

  /** fixedUpdate 尾部推入当前快照（位置=左上角，旋转=visAngle≈npc.rotation） */
  private pushHistory(): void {
    this.histHead = (this.histHead + 1) % Enemy.HIST_N;
    if (this.histCount < Enemy.HIST_N) this.histCount++;
    this.histX[this.histHead] = this.x;
    this.histY[this.histHead] = this.y;
    this.histRot[this.histHead] = this.visAngle;
  }

  /** i tick 前的历史条数（拖尾最大可用深度） */
  historyDepth(): number { return this.histCount; }
  /** i tick 前的左上角 X（i 超出已填深度时取最旧条目） */
  histXAt(i: number): number {
    const d = Math.min(Math.max(0, i), this.histCount - 1);
    return this.histX[(this.histHead - d + Enemy.HIST_N * 2) % Enemy.HIST_N];
  }
  histYAt(i: number): number {
    const d = Math.min(Math.max(0, i), this.histCount - 1);
    return this.histY[(this.histHead - d + Enemy.HIST_N * 2) % Enemy.HIST_N];
  }
  /** i tick 前的自转角（原版 oldRot[i]） */
  histRotAt(i: number): number {
    const d = Math.min(Math.max(0, i), this.histCount - 1);
    return this.histRot[(this.histHead - d + Enemy.HIST_N * 2) % Enemy.HIST_N];
  }

  /** AI_006 头部（L18645 通用常数 maxSpd=8 accel=0.07；穿墙直行；段链跟随） */
  private wormAI(game: GameHooks, player: Player | null) {
    // EoW 三段（13/14/15）走专属核（realLife=-1 各段独立 + 断链拆分，:51524-51914）
    if (this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15) {
      this.eowAI(game, player);
      return;
    }
    // 水蛭 117 出生爆尘+音（:51357-51370 localAI[1]==0 首帧）：NPCDeath13 + 20 尘
    // （原版 velocity*3 定向散——本仓 opts 无 vx/vy,用 spawnBurst 定向近似（若不可用
    //  回退全向）;2026-08-18 修 tsc: opts 恒不认 vx）
    if (this.vanillaId === 117 && this.ai1 === 0 && !this._wormSpawnFx) {
      this._wormSpawnFx = true;
      game.playSfxFiles(['NPC_Killed_13'], 1, this.cx, this.cy);
      const dir = this.vx < 0 ? Math.PI : 0;   // 朝速度反方向喷
      if (game.spawnBurst) {
        game.spawnBurst(this.cx, this.cy, '#B0A080', 20, 3, dir, Math.PI, { life: 30 });
      } else {
        game.spawnParticles(this.cx, this.cy, '#B0A080', 20, 1, { life: 30 });
      }
    }
    // 幻影龙 454 出生音（:51372-51376 localAI[3]==0 首帧）：Item119
    if (this.vanillaId === 454 && !this._wormSpawnFx) {
      this._wormSpawnFx = true;
      game.playSfxFiles(['Item_119'], 1, this.cx, this.cy);
    }
    // ---- 402 星尘织带蠕虫 ai[2] 生命计时（NPC.cs:51402-51461，1:1）----
    // ai[2] 每 tick +1；285→570 速度 ×1→×0.5（Remap 线性减速）；恰 570 时
    // 50 尘暴（尘 180/176 各 50% 掷、noGravity、NextVector2Circular(8,8) 初速）
    // + SpawnStardustMark_StardustWorm（:44230-44314 弹 540 孵化标记 BFS 链 →
    //   星尘生物链，StardustMarkProj.spawnStardustMarks 已接）+ 速度归一化 ×6 冲刺
    //   （原版序：先孵化标记后冲刺，:51455-51458）；≥600 ai[2] 归零
    // 重开（★不自灭——渐隐由渲染端 num291/drawPrettyStarSparkle 同链消费）。
    // ★置于玩家死亡早退【前】：原版 type 段（:51402）在 target 检查（:51532）
    // 之前——玩家死亡 ai2 计时照走（曾误放早退后：玩家被磨死即冻结、渐隐链断）。
    if (this.vanillaId === 402) {
      this.ai2 += 1;
      const LIFE = 600, LIFE_LAST = 570;               // num3/num4（:51404-51405）
      const spd = Math.hypot(this.vx, this.vy);
      if (spd >= 1 && this.ai2 <= LIFE_LAST) {
        // velocity *= Remap(ai2, 285, 570, 1, 0.5)（clamped 线性）
        const half = LIFE_LAST * 0.5;
        const k = this.ai2 <= half ? 1
          : this.ai2 >= LIFE_LAST ? 0.5 : 1 - 0.5 * (this.ai2 - half) / (LIFE_LAST - half);
        this.vx *= k; this.vy *= k;
      }
      if (this.ai2 === LIFE_LAST) {
        // 尘 180=星尘深蓝(贴图帧均色 51,75,190)/176=星尘浅蓝白(176,194,215)
        for (let d = 0; d < 50; d++) {
          game.spawnParticles(this.cx, this.cy,
            Math.random() < 0.5 ? '#334BBE' : '#B0C2D7',
            1, 1.3 + Math.random() * 2, { life: 30, damp: 0.97 });
        }
        // SpawnStardustMark_StardustWorm（:44230-44314，先于冲刺 :51455-51458）：
        // 孵化池 405/406<2 ∪ 402<3 ∪ 407<1 随机选一 → BFS 世代标记弹 540 链，
        // 末端标记淡入破零时于 (Center.X, Bottom.Y) 孵化（StardustMarkProj）
        spawnStardustMarks(game, this.cx, this.cy, 'worm');
        if (spd > 0) { this.vx = (this.vx / spd) * 6; this.vy = (this.vy / spd) * 6; }
      }
      if (this.ai2 >= LIFE) this.ai2 = 0;
    }
    // 玩家死亡（:51532-51539）：TargetClosest 落空 → EncourageDespawn(300) 缓慢消散
    // （EoW flag=false 不加速下钻——靠 despawn 系统离屏倒数收尾）
    if (!player) {
      this.encourageDespawn(300);
      this.vx *= 0.97; this.vy *= 0.97;
      this.x += this.vx; this.y += this.vy;
      this.visAngle = Math.atan2(this.vy, this.vx) + Math.PI * 0.5;
      return;
    }
    // ---- 地下蠕虫 flag 型脱战（:51506-51546，2026-08-17 仇恨审计补）----
    //  flag 表：10/39/95/117/510（地下蠕虫）恒 true 且 num11=0.2；513 玩家不在
    //  地下沙漠 → true 且 num11=0.1；621 恒 false。玩家死亡 || (flag && 玩家升到
    //  地表之上) → EncourageDespawn(300) + flag 时下潜 velocity.Y += num11
    const wormFlagType = this.vanillaId === 10 || this.vanillaId === 39 || this.vanillaId === 95
      || this.vanillaId === 117 || this.vanillaId === 510;
    const wormFlag = wormFlagType || (this.vanillaId === 513
      && !game.world.scene?.zoneUndergroundDesert);
    const wormDive = wormFlagType ? 0.2 : this.vanillaId === 513 ? 0.1 : 0;
    const playerAboveSurface = player.cy < game.world.groundLevel * TILE;
    if (player.dead || (wormFlag && playerAboveSurface)) {
      this.encourageDespawn(300);
      if (wormFlag) this.vy += wormDive;
    }
    // 621（Dune Splicer 成虫）白天 → EncourageDespawn(60) + vy += 1（:51541-51544）
    if (this.vanillaId === 621 && game.world.clock.isDay) {
      this.encourageDespawn(60);
      this.vy += 1;
    }
    const maxSpd = 8, accel = 0.07;
    // 掘地/咆哮音效（AI_006 :52375-52395 通用段，与 eowAI 同源）：间隔 = 距离/40 钳
    // 10..20；PlaySound(15,x,y) 无 style → style 默认 1 = Roar_1(LegacySoundPlayer
    // :366 签名 Style=1;boss 唤醒才是显式 style0=Roar_0)——骨蛇 39-41/食世者 95 等
    // 接近时的周期咆哮（用户报"地狱骨龙接近有音效"，2026-08-18；同日修正:曾用
    // 'roar' 键随机双轨 → 一半概率播成 boss 唤醒音,且 Roar_1 被 FILE_CASE_VOL 误
    // 乘 0.25 几不可闻 = "地底全是 boss 咆哮"根因）；排除表 621/87/117/454/412；
    // Roar_1 单实例互斥在 Sfx 层(case 15 播着跳过)
    if (this.vanillaId !== 621 && this.vanillaId !== 87 && this.vanillaId !== 117
      && this.vanillaId !== 454 && this.vanillaId !== 412) {
      if (this.digSndDelay <= 0) {
        const dd = player ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : 400;
        this.digSndDelay = Math.round(Math.min(20, Math.max(10, dd / 40)));
        game.playSfxWav?.('Roar_1', 1, this.cx, this.cy);
      } else {
        this.digSndDelay--;
      }
    }
    // 朝向：有玩家朝玩家，无玩家缓慢巡游
    let dx: number, dy: number;
    if (player) {
      // 375 TruffleWormDigger（松露虫钻地逃走形）：AI_006 反向——逃离玩家而非追击
      const s = this.vanillaId === 375 ? -1 : 1;
      dx = s * (player.cx - this.cx); dy = s * (player.cy - this.cy);
    }
    else { dx = Math.cos(this.aiT * 0.02) * 10; dy = Math.sin(this.aiT * 0.013) * 10; }
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * accel;
    this.vy += (dy / d) * accel;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > maxSpd) { this.vx = (this.vx / spd) * maxSpd; this.vy = (this.vy / spd) * maxSpd; }
    this.facing = this.vx > 0 ? 1 : -1;
    // 旋转（AI_006_Worms :52591 头/:51500 段）：贴图正面朝上 → rotation = atan2 + π/2。
    // 头朝目标（:52591 num49/50 = 朝向分量，等价速度角）；段用速度角（:51500）
    this.visAngle = Math.atan2(this.vy, this.vx) + Math.PI * 0.5;
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
      // 段旋转 = 指向前一段的方向（= 本段行进切向，与原版段速度角等价）
      if (dist > 0.01) s.visAngle = Math.atan2(dyC, dxC) + Math.PI * 0.5;
    }
  }

  /** EoW 族（13/14/15，NPC.cs:51357-52671 专属语义；SetDefaults :8835-8894 各段
   *  独立 150HP、realLife=-1 :51524-51527——无整链共享生命）。
   *  断链拆分（:51874-51914，逐 tick 各段自查邻段）：
   *  - 两邻全灭 / 头(13)的下段灭 / 尾(15)的前段灭 → 自灭（走标准死亡管线=checkDead）；
   *  - 身段(14)前段灭 → Transform(13)（:51906-51909）晋升新头，断开 wormFollow；
   *  - 身段(14)后段灭 → Transform(15)（:51910-51913）收成新尾，断开 wormNext；
   *  → 杀中段把一条虫拆成两条独立虫；杀头不灭虫（下段即晋升新头）。
   *  头速度双模（:52091-52104）：num46=10/num47=0.07，专家 12/0.15，FTW +4/+0.05——
   *  埋地（AABB 外扩 1-2 格实心/液体>64 :51968-51992，玩家距 >1000px 亦视作埋地
   *  :51993-52014）走全向舵（:52511-52597）；空中 vy+=0.11 钳 num46 + 三档横漂不转向
   *  （:52324-52371）。离开腐化下潜（:52402-52450）：目标玩家 !ZoneCorrupt&&!ZoneCrimson
   *  （或死）→ 直向下潜，y > (rockLevel+h)/2 整链清除（无掉落无记账）。
   *  专家毒唾 666（:51468-51504）；掘地音效（:52375-52395 间隔=距离/40 钳 10..20）。 */
  private eowAI(game: GameHooks, _player: Player | null): void {
    const st = game.world.store;
    const w = game.world;
    // 原版 target 即便玩家死亡仍指向其槽位（:51532 TargetClosest 后舵机照用其坐标）
    const tgt = (game as unknown as { player: Player }).player ?? null;
    if (!tgt) return;
    // ---- 链维护（:51874-51914）----
    const linkAlive = (s: Enemy | null): boolean =>
      !!s && !s.dead && s.vanillaId !== null && s.vanillaId >= 13 && s.vanillaId <= 15;
    const prevOk = linkAlive(this.wormFollow), nextOk = linkAlive(this.wormNext);
    if (!prevOk && !nextOk) { this.die(game); return; }                   // :51876-51885 两邻全灭
    const kind0 = this.vanillaId ?? 0;
    if (kind0 === 13 && !nextOk) { this.die(game); return; }              // :51886-51895 头的下段灭
    if (kind0 === 15 && !prevOk) { this.die(game); return; }              // :51896-51905 尾的前段灭
    if (kind0 === 14) {
      if (!prevOk) {
        // :51906-51909 Transform(13, ai[0])：晋升新头（SetDefaults(13) 换头属性/贴图，
        // HP 按比例结转；三段 lifeMax 同为 150 → 原值保留）
        if (this.wormFollow) this.wormFollow.wormNext = null;
        this.wormFollow = null;
        this.transformTo(13, st, true, game);
      } else if (!nextOk) {
        // :51910-51913 Transform(15, 0, ai[1])：收成新尾
        if (this.wormNext) this.wormNext.wormFollow = null;
        this.wormNext = null;
        this.transformTo(15, st, true, game);
      }
    }
    // ---- 专家毒唾 666（:51468-51504）----
    const id = this.vanillaId ?? 0;
    if (w.isExpert && tgt) {
      if (id === 14 && (this.cy / TILE < w.groundLevel || w.seedFlags?.getGoodWorld)) {
        // :51470-51489 身段仅地表（中心格无墙）1/900 掷（FTW 1/450）
        const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
        if (st.inBounds(tx, ty) && st.wall[st.idx(tx, ty)] === 0
          && Math.floor(Math.random() * (w.seedFlags?.getGoodWorld ? 450 : 900)) === 0) {
          this.eowSpit(game, tgt);
        }
      } else if (id === 13) {
        // :51491-51503 头段 1/(90 + life/lifeMax×300) 掷
        const denom = 90 + Math.floor((this.hp / this.maxHp) * 300);
        if (Math.floor(Math.random() * denom) === 0) this.eowSpit(game, tgt);
      }
    }
    // ---- 身/尾段（ai[1]>0 → :52266-52321）：朝前段收缩维持链距（num64=width）----
    if (this.wormFollow) {
      const fx = this.wormFollow;
      const dxC = fx.cx - this.cx, dyC = fx.cy - this.cy;
      const dist = Math.hypot(dxC, dyC);
      if (dist > 0.01) {
        // :52300-52302 getGoodWorld 且 type∈13-15 → num64=62（段间距拉宽）；其余蠕虫族不覆写
        const vid = this.vanillaId ?? 0;
        const gap = (w.seedFlags?.getGoodWorld && vid >= 13 && vid <= 15) ? 62 : this.w;
        const shrink = (dist - gap) / dist;
        this.x += dxC * shrink;
        this.y += dyC * shrink;
        this.visAngle = Math.atan2(dyC, dxC) + Math.PI / 2;
      }
      this.vx = 0; this.vy = 0;   // :52307 velocity = Vector2.Zero
      return;
    }
    // ---- 头段 ----
    // 玩家死（:51536-51543，EoW flag=false 不加速下钻）：离屏倒数消散
    if (tgt.dead) this.encourageDespawn(300);
    // 常数（:52091-52104）
    let maxSpd = 10, acc = 0.07;
    if (w.isExpert) { maxSpd = 12; acc = 0.15; }
    if (w.seedFlags?.getGoodWorld) { maxSpd += 4; acc += 0.05; }
    // 埋地判定 flag3（:51968-51992）：AABB 外扩 1-2 格内实心块或液体>64
    let buried = false;
    const tx0 = Math.max(0, Math.floor(this.x / TILE) - 1);
    const tx1 = Math.min(st.w - 1, Math.floor((this.x + this.w) / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(this.y / TILE) - 1);
    const ty1 = Math.min(st.h - 1, Math.floor((this.y + this.h) / TILE) + 2);
    for (let x = tx0; x <= tx1 && !buried; x++) {
      for (let y = ty0; y <= ty1; y++) {
        const i = st.idx(x, y);
        if (((st.flags[i] & 1) !== 0 && st.isSolid(x, y)) || st.liquid[i] > 64) {
          if (this.x + this.w > x * TILE && this.x < x * TILE + 16
            && this.y + this.h > y * TILE && this.y < y * TILE + 16) { buried = true; break; }
        }
      }
    }
    // :51993-52014 无玩家外扩矩形相交（>1000px）→ 视作埋地（远离时照走地下舵机）
    if (!buried && (tgt.dead
      || Math.abs(tgt.cx - this.cx) > 1000 + this.w
      || Math.abs(tgt.cy - this.cy) > 1000 + this.h)) buried = true;
    // 朝向分量（:52173-52259 tile 吸附差值）
    const dx = Math.floor(tgt.cx / TILE) * TILE - Math.floor(this.cx / TILE) * TILE;
    const dy = Math.floor(tgt.cy / TILE) * TILE - Math.floor(this.cy / TILE) * TILE;
    const dist = Math.hypot(dx, dy);
    if (!buried) {
      // 空中（:52324-52371）：vy+=0.11 钳 num46；三档横漂（不主动转向）
      this.vy += 0.11;
      if (this.vy > maxSpd) this.vy = maxSpd;
      if (Math.abs(this.vx) + Math.abs(this.vy) < maxSpd * 0.4) {
        this.vx += this.vx < 0 ? -acc * 1.1 : acc * 1.1;
      } else if (this.vy === maxSpd) {
        if (this.vx < dx) this.vx += acc;
        else if (this.vx > dx) this.vx -= acc;
      } else if (this.vy > 4) {
        this.vx += this.vx < 0 ? acc * 0.9 : -acc * 0.9;
      }
    } else {
      // 掘地/咆哮音效（:52375-52395）：间隔 = num63/40 钳 10..20；
      // EoW 三段(13-15) = eow_dig 专属轨；【其余蠕虫族 = SoundID 15 Roar】——
      // 骨蛇 39-41/食世者等接近时的周期咆哮(用户报"骨龙接近有音效",2026-08-18)；
      // 排除表 621/87/117/454/412 不发声；EoW 另有 skyblock lowTiles 门(不涉)
      const isEow = (this.vanillaId ?? 0) >= 13 && (this.vanillaId ?? 0) <= 15;
      const digSndType = [621, 87, 117, 454, 412].includes(this.vanillaId ?? -1);
      if (!digSndType && this.digSndDelay <= 0) {
        this.digSndDelay = Math.round(Math.min(20, Math.max(10, dist / 40)));
        game.playSfx(isEow ? 'eowDig' : 'roar', 1, this.cx, this.cy);
      } else {
        this.digSndDelay--;
      }
      if (Math.random() < 0.02) {
        game.spawnParticles(this.cx, this.cy, '#7A5A3C', 1, 0.9, { life: 28, damp: 0.96, grav: 0.06 });
      }
      // 目标速度（:52396-52401 归一到 num46 模长）
      let tvx = dx, tvy = dy;
      const d2 = Math.hypot(tvx, tvy) || 1;
      tvx = (tvx / d2) * maxSpd;
      tvy = (tvy / d2) * maxSpd;
      // 离开腐化下潜（:52402-52450）：目标 !ZoneCorrupt && !ZoneCrimson（或死）→ 直下潜。
      // 原版另有 flag7 多玩家扫描（任一存活玩家在腐化即不潜，:52417-52424）——
      // 单人等价于目标自身，联机 Boss 权威在房主，略（登记）
      const scene = w.scene;
      const zoneOk = scene == null ? true : (scene.zoneCorrupt || scene.zoneCrimson);
      if (tgt.dead || !zoneOk) {
        if (this.cy / TILE > (w.rockLevel + w.h) / 2) {
          // :52427-52446 深度达标：头 + 后继链整体清除（active=false，无掉落无记账）
          this.bossFled = true;
          for (let s: Enemy | null = this; s; s = s.wormNext) s.dead = true;
          return;
        }
        tvx = 0; tvy = maxSpd;   // :52447-52449
      }
      // 全向舵（:52511-52597，与毁灭者地下核同构）
      const sameX = (this.vx > 0 && tvx > 0) || (this.vx < 0 && tvx < 0);
      const sameY = (this.vy > 0 && tvy > 0) || (this.vy < 0 && tvy < 0);
      // :52513 首分支 = 四条件【跨轴 OR】(sameX || sameY)——单轴同向即走温和支；
      // 曾抄成 &&（毁灭者 :50481/:50500 才是 &&/|| 双块结构，勿混）
      if (sameX || sameY) {
        if (this.vx < tvx) this.vx += acc; else if (this.vx > tvx) this.vx -= acc;
        if (this.vy < tvy) this.vy += acc; else if (this.vy > tvy) this.vy -= acc;
        if (Math.abs(tvy) < maxSpd * 0.2 && ((this.vx > 0 && tvx < 0) || (this.vx < 0 && tvx > 0))) {
          this.vy += this.vy > 0 ? acc * 2 : -acc * 2;
        }
        if (Math.abs(tvx) < maxSpd * 0.2 && ((this.vy > 0 && tvy < 0) || (this.vy < 0 && tvy > 0))) {
          this.vx += this.vx > 0 ? acc * 2 : -acc * 2;
        }
      } else if (Math.abs(dx) > Math.abs(dy)) {
        if (this.vx < tvx) this.vx += acc * 1.1; else if (this.vx > tvx) this.vx -= acc * 1.1;
        if (Math.abs(this.vx) + Math.abs(this.vy) < maxSpd * 0.5) {
          this.vy += this.vy > 0 ? acc : -acc;
        }
      } else {
        if (this.vy < tvy) this.vy += acc * 1.1; else if (this.vy > tvy) this.vy -= acc * 1.1;
        if (Math.abs(this.vx) + Math.abs(this.vy) < maxSpd * 0.5) {
          this.vx += this.vx > 0 ? acc : -acc;
        }
      }
    }
    // :52600 rotation = 速度角 + π/2（贴图正面朝上）
    this.visAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** 专家毒唾 666（:51483-51501）：CanHitLine(本体中心,1,1,玩家中心,1,1) 才出膛，
   *  弹体落点 = 本体中心 + 速度（NewNPC(666, 0, 0f, 1f)） */
  private eowSpit(game: GameHooks, tgt: Player): void {
    const st = game.world.store;
    if (!canHit(st, this.cx, this.cy, 1, 1, tgt.cx, tgt.cy, 1, 1)) return;
    const spit = Enemy.fromVanilla(666, this.cx + this.vx, this.cy + this.vy);
    if (!spit) return;
    spit.ai0 = 0; spit.ai1 = 1;
    addEnemy(game, spit);
  }

  /** 由头生成段链（原版各 worm 的 NewNPC 链，NPC.cs:18174+）：body×n + tail。
   *  segIds 显式段表（454 幻影龙 = 455-458 身 ×4 + 459 尾——非 head+1/head+2 连号族）；
   *  sharedLife = realLife 共享头血池（StrikeNPC :82132-82137——毁灭者/幻影龙段不可单独打死） */
  static spawnWormChain(head: Enemy, segCount: number, segIds?: number[], sharedLife = false): Enemy[] {
    const segs: Enemy[] = [];
    const bodyId = head.vanillaId! + 1, tailId = head.vanillaId! + 2;
    // EoW 族记链总段数（血条恒定分母,EaterOfWorldsProgressBar :30-33;
    // 毁灭者族不消费,统一写入无副作用）
    const chainTotal = segCount + 1;
    head.eowChainMax = chainTotal;
    let prev = head;
    for (let k = 0; k < segCount; k++) {
      const id = segIds ? segIds[k] : (k === segCount - 1 ? tailId : bodyId);
      const s = Enemy.fromVanilla(id, head.cx, head.cy);
      if (!s) continue;
      s.wormFollow = prev;
      prev.wormNext = s;
      prev = s;
      s.eowChainMax = chainTotal;
      if (sharedLife) s.realLifeHost = head;
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
    const hit = vanillaSoundFiles(v.HitSound) ?? ['NPC_Hit_1'];
    const kill = vanillaSoundFiles(v.DeathSound) ?? ['NPC_Killed_1'];
    // 飞行档（StrikeNPC :82217/-0.5 受击档用）：数据 noGravity 族 + aiStyle 2/5/14
    // （原版各 AI 开头 noGravity=true）+ aiStyle 23/44（飞行武器 83/84/179 kb0.4
    // :25318、飞鱼/蚁狮蜂族 224/509/581/587 :31001——JSON noGravity=false 但原版
    // AI 每 tick 置位，静态表覆盖不到，2026-08-17 补）；按态族（17/87/91）走运行时
    // this.noGravity 位（hurt() 读 noGravity || def.flying）
    const flying = v.noGravity || v.aiStyle === 2 || v.aiStyle === 5 || v.aiStyle === 14
      || v.aiStyle === 23 || v.aiStyle === 44;
    // ---- NPC.ScaleStats（NPC.cs:18081-18105，NewNPC→SetDefaults 后调用 :8322/:17791）----
    // 世界难度轴（Main.Difficulty → 生命/伤害/钱/击退倍率 + 逐类型系数 +
    // 专家困难模式兜底增强）。Boss **不豁免**（仅 ExpertHardmode 段跳过 :18471）。
    // 上下文经 bindScaleStatsWorld 注入（Game.afterWorldLoad；原版 Main 静态单例语义），
    // 未绑定=经典档（倍率恒 1，仅 lifeMax<6 下限与类型系数在 Classic 档同样无变化）。
    const rawDamage = (v.critter || v.friendly) ? 0 : v.damage;   // def.damage 基线
    // 原版"承受比例"语义——缺省 1f（NPC.cs:8449 SetDefaults 默认 knockBackResist=1,
    // JSON 提取表只写显式赋值,无字段的 137 只（克眼仆从等）此前落 0.5 吃半击退,2026-08-13 修正）
    const rawKb = v.knockBackResist ?? 1;
    // ---- SetDefaults 尾段种子档调整（NPC.cs:17774-17785，ScaleStats :17791 之前）----
    // zenith(getfixedboi)→getGood(FTW)→tenthAnniversary（else-if 互斥）。命中分支
    // 扩盒（★与专家档 Tweaks"只缩贴图不扩盒"语义相反），详 ScaleStats.applySeedAdjustments 头注。
    const seedS: SeedAdjustStats = {
      type: id, scale: v.scale ?? 1, lifeMax: v.lifeMax, defense: v.defense, damage: v.damage,
      canDisplayBuffs: true,   // NPC.canDisplayBuffs 默认 true（NPC.cs:6124）
    };
    const seedBox = applySeedAdjustments(seedS, scaleStatsWorld());
    // 碰撞盒：:17745 基扩盒 (int)(w×scale) 之后，种子档命中分支再 (int)(w×scaleNew)
    // （:18025-18026/:17861-17862）——按原文两级 (int) 截断重算（不沿用下方 round
    // 基盒，s≠1 族 113/114/134-136 差 1px）；未命中走既有 round 路径
    const vScale = v.scale ?? 1;
    const boxW = seedBox
      ? Math.trunc(f32(Math.trunc(f32(v.width * vScale)) * f32(seedS.scale)))
      : Math.round(v.width * vScale);
    const boxH = seedBox
      ? Math.trunc(f32(Math.trunc(f32(v.height * vScale)) * f32(seedS.scale)))
      : Math.round(v.height * vScale);
    const ss: ScalingStats = {
      type: id, lifeMax: seedS.lifeMax, damage: seedS.damage, value: npcValueOf(id),
      defense: seedS.defense, knockBackResist: rawKb,
      boss: VANILLA_BOSS_IDS.has(id), friendly: !!v.friendly, townNPC: !!v.townNPC,
      scale: seedS.scale, difficulty: 0,
    };
    scaleStats(ss);
    e.difficulty = ss.difficulty;          // npc.difficulty（AI 段 GetAttackDamage_* 消费）
    e.baseDamage = rawDamage;              // defDamage 快照的【未缩放】基线（弹幕出膛用）
    // def.knockBackResist 直存原版"承受比例"语义（ScaleStats :307 缩放后仍是比例；
    // hurt() 无条件 kbx*resist——0=免疫、1=全额）。旧"1-比例"换算+0.89 钳已废（2026-08-13）
    const kbr = ss.knockBackResist;
    e.def = {
      ...e.def,
      // friendly（被缚 NPC 等城镇系）与 critter 一样零接触伤害——原版 friendly 旗
      name: v.name, hp: ss.lifeMax, damage: rawDamage !== 0 ? ss.damage : 0, defense: ss.defense,
      // 原版 knockBackResist="承受击退的比例"（0=免疫 Boss、0.5=吃一半、1=全额）
      knockbackResist: kbr,
      width: boxW, height: boxH, flying,
      boss: VANILLA_BOSS_IDS.has(id),
      nightOnly: v.aiStyle === 2 || v.aiStyle === 5, underground: false,
      mapColor: '#9A8FA0', gore: ['#9A8FA0', '#5E5566', '#C4BACC'],
      hitSound: hit, killedSound: kill, drops: [], // 掉落走 NpcDrops 规则树（击杀时求值，不再预展开）
      // hitSound/killedSound 为 wav 变体组（DD2_*/Deerclops* 多变体，playSfxFiles 组内随机）
      // ScaleStats 后的 npc.value（EnemyMoneyDropMultiplier 已乘，经典档=原值；
      // 弹体 NPC 不缩）——击杀掉钱消费位（Enemy.ts 掉落 ctx.value）
      value: ss.value,
      // 小动物：无接触伤害、不夜行（ScaleStats 对 damage=0/lifeMax≤5 的它们本就不进门）
      ...(v.critter ? { damage: 0, nightOnly: false } : {}),
    };
    // 接触伤害：战斗怪 = ScaleStats 缩放后 npc.damage（damage!=0 的 friendly/critter
    // 恒 0，与旧归零语义一致）
    e.hp = ss.lifeMax;
    e.maxHp = ss.lifeMax;
    e.noGravity = flying;   // 运行时位初值=静态飞行档（按态族由各自 AI 每 tick 改写）
    // 碰撞盒乘 npc.scale(NPC.cs:17745-17747 width/height=(int)(×scale))——
    // 史莱姆王/毁灭者 1.25、血肉墙 1.2:此前未乘,贴图放大了盒子没放大,
    // 判定区比视觉小一圈(与渲染 scale 不一致的"盒贴图不匹配"来源)。
    // 种子档命中族（boxW/boxH）已含 :18025/:17862 二次扩盒
    e.w = boxW;
    e.h = boxH;
    // 渲染乘区同步（Renderer.ts drawEnemy :2213 = vanilla.scale × vanillaScale）：
    // 注入"种子档总 scale / 基 scale"比值，使贴图与扩盒后的碰撞盒一致
    // （113=0.65、134-136=1.3、39-41=1.1[remix 1.32]）
    if (seedBox) e.vanillaScale = seedS.scale / vScale;
    // NPC.canDisplayBuffs（批次B 落地）：FTW getGood 245-248 石巨人族置 false
    // （ScaleStats.getGoodAdjustments :17945/:17950/:17955）。原版两处消费
    // （染色门 :92026 / 鞭标 VFX 门 :92135）本仓均未移植——字段先行保数据链一致
    e.canDisplayBuffs = seedS.canDisplayBuffs !== false;
    e.spawnAlpha = v.alpha ?? 0; // 原版 SetDefaults alpha（静态不透明度，NPC.Opacity=1-alpha/255）
    // alpha=255 = 出生全透明渐显标记（13-15 世吞 / 134-136 毁灭者；其余 alpha 为
    // 静态不透明度,勿动）：置 alphaFade 交渐显路径逐 tick 减回 0。EoW 族保持原版
    // 初值 255（AI_006 尾段 :52650-52670 移动门 -42/t，见 fixedUpdate 渐显段）；
    // 134-136 毁灭者同保 255 但【不置 alphaFade】——AI_037 链门淡入（头恒过/
    // 段须前段<128、无条件 -42/t+红尘 182，:50162-50182，destroyerAI 内）接管，
    // 通用 -1/t 近似对其已退役；其余 alpha=255 族沿用 254 起步走 -1/t 近似
    if (e.spawnAlpha >= 255) {
      if (id >= 134 && id <= 136) { /* 保持 255 初值，AI_037 链门淡入接管 */ }
      else { e.alphaFade = true; e.spawnAlpha = (id >= 13 && id <= 15) ? 255 : 254; }
    }
    e.colorRGBA = v.color ? [v.color[0], v.color[1], v.color[2], v.color[3] ?? 255] : null; // 原版 color 字段
    // 266 克脑 SetDefaults :12372 dontTakeDamage=true——一阶段（爬行者存活）不可击，
    // AI_054 二阶段入场段 :32589 自行解除（存档载入即二阶段也由该段下一 tick 清除）
    if (id === 266) e.dontTakeDamage = true;
    // 263 世纪之花钩蔓 SetDefaults :12331-12332 dontTakeDamage=true——恒不可击
    // （AI_052 本体消失时自伤 9999 走直改 hp 通道,不受此门禁阻塞）
    if (id === 263) e.dontTakeDamage = true;
    // 690 雕像宝箱怪 SetDefaults :17615-17627 immortal+dontTakeDamage=true——伪装态
    // 不可击；AI_126 唤醒段 :43873 解除（ai[0] 0→1）
    if (id === 690) e.dontTakeDamage = true;
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
  /** 渲染层回填：本帧实际绘制的贴图底边（世界 y）。血条定位用——原版条在
   *  盒底+10 的前提是"贴图底≈盒底+4"，中心锚+显式下移（如 EoC +23/+30）会
   *  破坏该前提 → 条会扎进贴图（2026-08-13 用户报"血条在眼球内"）。
   *  drawHealthBar 以 max(盒底+10, 贴图底+6) 兜底。仅渲染消费，AI/存档无关 */
  spriteBottomWorld = 0;
  phase = 1;             // Boss 阶段
  target: { x: number; y: number } | null = null;
  squash = 0;            // 史莱姆挤压动画 -1..1
  stuckT = 0;            // 飞行怪卡墙计时（脱困用）
  stuckCd = 0;           // 脱困后的游荡冷却
  jumpStartX = 0;        // 史莱姆本次起跳的 x（落地时判定是否白跳）
  chargesLeft = 0;       // EoC 剩余冲撞次数
  dashing = false;       // EoC 冲撞中（无视地形）
  visAngle = Math.PI;    // EoC 显示角度（素材正面朝下:瞳孔角=π/2+θ,盯玩家须 θ=φ−π/2）
  spin = 0;              // EoC 变身旋转进度 0..1
  hpBarT = 0;            // 受击后血条显示计时（tick）
  // ---- EoC(AI_004)专属 ----
  servantT = 0;          // 悬浮时"位于玩家上方"累计(110t 召仆从)
  spinSpeed = 0;         // 自旋角速度(cs ai[2]:0.005 步进钳 0.5)
  spinPhase = 0;         // 自旋段:0 加速 / 1 减速
  walkCycleT = 0;        // 行走帧累加器（≈原版 frameCounter，按 |vx| 推进）
  crawlT = 0;            // AI_040 爬墙帧累加器（FindFrame case 165 族：(|vx|+|vy|)×0.5，24 循环）
  justHitT = 0;          // 受击单帧旗标计数（hurt() 置 2，AI 消费原版 justHit 语义）
  /** 岩浆接触冷却（原版 immune[255]=30,NPC.cs:94528）与 onFire 状态（buff 24,秒） */
  lavaCd = 0;
  lavaWet = false;
  onFireT = 0;
  onFireDoT = 0;
  /** 原版液体态（NPC.cs UpdateCollision :93712-93805，npcLiquid.updateNpcLiquid 每 tick 写）：
   *  wet=中心小盒 WetCollision 命中（含岩浆格）；honeyWet/shimmerWet 选减速档与熄火门；
   *  wetCount=出入水 10t 去抖（溅落声/尘）。inWater 为旧字段别名（=wet） */
  wet = false;
  wetCount = 0;
  honeyWet = false;
  shimmerWet = false;
  /** AI_001 wet 段的 ai[3] 语义位（cs:61889：vy>0 时记 position.X，上浮中 X 未动 → 掉头） */
  slimeWetX = 0;
  /** 微光浸入进度（≈shimmerTransparency ×100，NPC.cs:92468-92483：+0.01/t，
   *  90t 到 0.9 阈值触发 NPC.GetShimmered；离池 -0.01/t） */
  shimmerT = 0;
  /** 武器浸剂 debuff（R2，近战命中施加；单位=秒）
   *  DoT 对应 NPC.cs UpdateNPC_BuffApplyDOTs（lifeRegen/2 = HP/s）：
   *  poison lifeRegen-12→6HP/s(:92590)、venom -60→30(:92706)、cursed(onFire2) -48→24(:92690) */
  poisonT = 0;
  venomT = 0;
  cursedT = 0;
  /** Frostburn(44)/Frostburn2(324)/OnFire3(323)/ShadowFlame(153)/Oiled(204)
   *  （NPC.cs UpdateNPC_BuffApplyDOTs：44→lifeRegen-16=8HP/s(:92648) / 324→-50=25HP/s
   *  (:92668) / 323→-30=15HP/s(:92632) / 153→-30=15HP/s(:92712)。
   *  Oiled(:92728-92737) = 六火系任意在身时【再叠 -50 = +25 HP/s】,flat 加算
   *  非"翻倍"(旧实现按倍率,2026-08-13 G7 回源修正) */
  frostburnT = 0;    frostburnDoT = 0;
  frostburn2T = 0;   frostburn2DoT = 0;
  onFire3T = 0;      onFire3DoT = 0;
  shadowFlameT = 0;  shadowFlameDoT = 0;
  oiledT = 0;        oiledDoT = 0;
  /** BrokenArmor(36)=受击无视 20 防 / BetsysCurse(203)=无视 40 防
   *  (NPC.cs:81919-81924 armorPenetration += 20/40);Daybreak(189) 层数模型
   *  已接(原版:场上附着 636 太阳耀斑数 num8,lifeRegen -= num8×2×100 = 100HP/s/层,
   *  零层兜底 1——NPC.cs:92807-92830;636 实体 = WeaponProj.DaybreakFlare) */
  brokenArmorT = 0;
  betsysCurseT = 0;
  daybreakT = 0;  daybreakDoT = 0;
  /** R2 余量批(NPC.cs UpdateNPC_BuffApplyDOTs 逐条):Bleeding(30)=-24=12HP/s(:92598)/
   *  Hemorrhage(375)=-200=100HP/s(:92610)。
   *  贴附族层数模型已接(2026-08-15,NPC.cs:92740-92863 逐条):层数=场上附着弹计数
   *  (169←598 骨标 3HP/s/层 :92740-92759 / 337←971 触手刺 3HP/s/层 :92761-92779 /
   *  344←975 血腥屠夫 4HP/s/层 :92786-92804 / 183←614 星尘弹 20HP/s/层 :92846-92863
   *  ——均无零层兜底,唯 Daybreak 189 有 :92822-92825)。
   *  仓内 598/614/971/975 无附着实体,以"层=独立倒计时条目"等价建模:
   *  每层寿命=对应 buff 时长(贴附弹寿命 60×num11 AI 次,AI_113 :38252-38272
   *  默认 num11=15→900t/971·975=9×MaxUpdates→540t,恰与 AddBuff 时长
   *  169/183=900t、337/344=540t 等长)——层自然消亡与 buff 到期同步,无独立衰减。
   *  137 Slimed = 六火系 DoT 翻倍(drippingSlime 六处等量叠伤,见 onFireT 块)。
   *  151 SoulDrain = -50 lifeRegen = 25 HP/s(:92927-92935,realLife==-1 即非蠕虫
   *  分体)——玩家侧魂镰联动(3006 持械挥击时 player.soulDrain++ 计数,
   *  UpdateNPC_SoulDrainDebuff :91952-91979)依赖魂镰实装,登记 GAP */
  slimedT = 0;
  bleedT = 0;      bleedDoT = 0;
  hemorrhageT = 0; hemorrhageDoT = 0;
  javelinT = 0;    javelinDoT = 0;
  spikeT = 0;      spikeDoT = 0;
  butcherT = 0;    butcherDoT = 0;
  soulDrainT = 0;  soulDrainDoT = 0;
  /** 本体 soulDrain（SoulDrainDebuff debuff 位 :91951）——Game 侧邻域扫描
   *  3006 挥击中玩家供给计数用（:91966 soulDrain++），非 DoT 计时 */
  soulDrainActive = false;
  stardustT = 0;   stardustDoT = 0;
  /** 贴附族层数池（每元素=一层的剩余秒数；addStickerStack 入池、buff tick 衰减，
   *  ≤0 剪除）。上限=KillOldestJavelin（Projectile.cs:13019-13030/:13995-14020
   *  杀 timeLeft 最低=最老）：598=6 / 614=10；971/975 不在白名单无上限。
   *  189 Daybreak 有 DaybreakFlare 实体走 daybreakStacks 活计数，不入本表 */
  javelinStacks: number[] = [];    // 598 骨标枪（cap 6）
  stardustStacks: number[] = [];   // 614 星尘细胞弹（cap 10）
  spikeStacks: number[] = [];      // 971 触手刺（无上限）
  butcherStacks: number[] = [];    // 975 血腥屠夫（无上限）
  poisonDoT = 0;
  venomDoT = 0;
  cursedDoT = 0;
  /** ichor(69)：受击时防御 -15（ArmorPenetration += 15 :92096） */
  ichorT = 0;
  /** midas(72)：掉钱 ×1.1-1.5（NPC.cs:80424） */
  midasT = 0;
  /** confused(31)：纳米药剂/浸剂命中——buff 存量（秒）。语义见 {@link confused} */
  confusedT = 0;
  /** 原版 confused 全局语义（NPC.TargetClosest 尾段 NPC.cs:78569-78572）：
   *  `if (confused) direction *= -1;`——各 AI 族用 direction 决定水平移动方向，
   *  因此 confused = 索敌的水平方向反向（directionY 不反转）。本仓各 AI 的
   *  "TargetClosest"= 从玩家算 facing 的赋值点，统一走 {@link seekDirX} 应用反转；
   *  直接用玩家坐标差算位移向量的族（AI_005 蜂群/AI_013 植物/AI_056 地牢之魂）
   *  原版不读 direction，同样不反转（勿在这些族接 confused）。 */
  get confused(): boolean { return this.confusedT > 0; }
  /** oldTarget 等效（NPC.cs:6374 `public int target = -1;` + :8472/:91442 每帧
   *  `oldTarget = target;`）：-1=从未索过敌 → 首次 seekDirX 必转身（原版 oldTarget=-1
   *  使 :78553 门失效）；首次后恒 0（单人 target 槽位）→ 门生效 */
  hadTarget = false;
  /** TargetClosest + confused 反转（NPC.cs:78555-78572）：返回朝玩家的水平方向。
   *  无玩家时保持现方向（原版 TargetClosest 无目标不重算） */
  seekDirX(player: Player | null): number {
    if (!player) return this.facing;
    // ⑫-2 aggro 不转身门（NPC.cs:78549-78561 SetTargetTrackingValues faceTarget 段，
    //  普通 TargetClosest :78456 的 283 处 AI 调用均走此段）：
    //    bool flag = oldTarget >= 0 && oldTarget <= 254;      （:78553）
    //    bool num   = player.itemAnimation == 0 && player.aggro < 0;  （:78552）
    //    bool flag2 = !boss;                                  （:78554）
    //    if (!(num && flag && flag2)) { direction = …; directionY = …; }  （:78555-78561）
    //  → 玩家未挥击 && aggro<0（潜行）&& 曾索过敌 && 非 Boss：整段保留旧朝向。
    //  ★此段【无距离检查】；带 `num8 > 尺寸和/4+800` 距离门的是
    //  TargetClosestUpgraded(:78447-78452) 与 ShouldFaceTarget(:78318-78337)——
    //  两者在 1.4.5.6 本体源码中【零调用点】（mod API 面）。旧实现误取该距离门，
    //  已按实际调用路径对齐移除（2026-08-13）。
    //  itemAnimation==0 窗代理 = itemAnimTicks<=0 && useTime<=0（Player.ts:1353/:2264
    //  同口径；原版 itemAnimation 为挥舞动画窗，非挥砍武器由 useTime 代）
    const itemAnimZero = player.itemAnimTicks <= 0 && player.useTime <= 0;
    // 镇静不面向门（NPC.cs:78543-78546 SetTargetTrackingValues）：
    //   if (player.npcTypeNoAggro[type] && direction != 0) faceTarget = false;
    // faceTarget=false 时整段朝向更新跳过（direction 保留旧值）——与潜行门同落点，
    // 原版里它在 :78547 `if (faceTarget)` 外层判定，故先于潜行门生效。
    if (CALMING_NO_AGGRO_TYPES.has(this.vanillaId ?? -1) && this.facing !== 0
      && !!player.buffs?.has(BuffType.Calming)) {
      return this.facing;
    }
    if (itemAnimZero && player.aggro < 0 && this.hadTarget && !this.def.boss) {
      return this.facing;
    }
    this.hadTarget = true;   // 本次生效=原版 AI 后 target=0，下一帧 oldTarget 门激活
    const raw = player.cx > this.cx ? 1 : -1;
    return this.confused ? -raw : raw;
  }
  /** 原版索敌有效距离（NPC.cs:78485-78492 TryTrackingTarget——TargetClosest 选距）：
   *    num  = |player.cx - npc.cx| + |player.cy - npc.cy|  （曼哈顿距离，非欧氏）
   *    num -= player.aggro                                  （:78491）
   *    if (player.npcTypeNoAggro[type] && direction != 0) num += 1000;  （:78493-78496）
   *  aggro<0（潜行装/变态刀）→ 有效距离拉长 → 索敌门更难命中（敌人"看不见"）。
   *  同式变体：TargetClosestUpgraded :78375（欧氏）/NPCUtils.SearchForTarget
   *  :78230（欧氏）——后两者本体无调用点；以曼哈顿版为准。
   *  ★单人下 TargetClosest 的选距循环退化（仅一名玩家恒选它），本方法在本仓的
   *  落点是各 AI 族近似索敌门（canTargetPlayerAt）——原版索敌本身无距离概念 */
  effectiveTargetDist(player: Player): number {
    const num = Math.abs(player.cx - this.cx) + Math.abs(player.cy - this.cy);
    let dist = num - player.aggro;                       // :78491 num -= player.aggro
    // 镇静罚项（NPC.cs:78492-78495）：player.npcTypeNoAggro[type] && direction != 0
    // → num += 1000f。npcTypeNoAggro[type] 即镇静 buff 生效位（CALMING_NO_AGGRO_TYPES，
    // Player.cs:14144-14168 物品 3090 逐项置位 23 类）。★单人语义：NPC.direction
    // 恒 ±1（本仓 facing 同构，:324 `vx>0?1:-1` / :675 缺省 1，无 0 值）→
    // 罚项对表内怪恒生效 = 索敌半径 +1000 曼哈顿（canTargetPlayerAt 门等效收窄）。
    if (CALMING_NO_AGGRO_TYPES.has(this.vanillaId ?? -1) && this.facing !== 0
      && !!player.buffs?.has(BuffType.Calming)) dist += 1000;
    return dist;
  }
  /** 各 AI 族索敌门统一入口：有效距离（已按原版减 aggro）< range。
   *  接线现状：flyAI 恶魔眼式 18 格门（原版无此门，为仓内近似；见 flyAI 注） */
  canTargetPlayerAt(player: Player, range: number): boolean {
    return this.effectiveTargetDist(player) < range;
  }
  /** 本 tick 实体点光（原版 Lighting.AddLight，Game 渲染前扫描落入光照引擎）；
   *  AI 每帧重写，null=不发光（萤火虫闪烁/发光蜗牛/魔化夜 crawler） */
  lightRGB: [number, number, number] | null = null;
  /** 点光像素坐标覆盖（缺省=实体中心）：光源不在中心格的原版语义位——
   *  火把僵尸 590/591 手持火把（NPC.cs:57309-57366，±22/±36px 偏移格） */
  lightRGBAt: { x: number; y: number } | null = null;
  lai0 = 0;              // localAI 语义位（萤火虫：闪烁间隔计时）
  lai1 = 0;              // localAI 语义位（萤火虫：发光剩余帧）
  lai2 = 0;              // localAI[2] 语义位（AI_054 克脑：二阶段入场演出门）
  lai3 = 0;              // localAI[3] 语义位（AI_054 克脑：玩家死/离场下坠计数；AI_008 法师 32：RedHat 变体带 +3）
  /** 红帽骷髅王标记（NPC.cs:81262-81266 redHatMode 召唤置 ai[3]=1；RedHatSkeletron
   *  AdjustmentsEnabled :67282 消费）。本仓 Chippy 沙发召唤链未实装 → 恒 false，
   *  32 的 lai3 变体带/双倍计时因此不触发（常态=单一头饰形态，2026-08-17 帧修复的门） */
  redHat = false;
  /** 原版 NPC.dontTakeDamage（SetDefaults 静态置位，如 266 克脑 :12372 一阶段
   *  不可击；AI 段自行清除）。与 iframes 不同：持续态而非帧计数 */
  dontTakeDamage = false;
  /** 击退抗性运行时覆写（游泳族专用）：461 wet→0 / dry→0.4（难度曲线，
   *  NPC.cs:56366/:56412 GetKnockbackMultiplier_ScaledByDifficulty）；null=用 def 值 */
  kbResistOverride: number | null = null;
  /** 694 水书宝箱怪专用帧计数（FindFrame case 694 frameCounter，态切换清零） */
  npcFrameT = 0;
  /** AI 侧算定的帧号直读位（694 态机帧；null=走渲染端 vanillaFrameIdx 通用档） */
  customFrameIdx: number | null = null;
  /** 运行时 noGravity 位（原版 NPC.noGravity 逐 tick 置位，StrikeNPC :82217/:82228
   *  受击档读【运行时值】非静态表）：AI_017 秃鹫(:24079 飞行态 true/栖息 0 态 false)、
   *  AI_087 珍珑宝箱怪(:39525 起始 false、4/4.1/5 空中态 true)、AI_091 花岗岩元素
   *  (:40688 起始 true、-1 石化态 false)在各自 AI 内同步置位；hurt() 读
   *  noGravity || def.flying（def.flying=静态兜底，覆盖数据 noGravity 族与
   *  aiStyle 2/5/14/23/44 恒飞行族） */
  noGravity = false;
  /** 原版 justHit 语义（本 tick 内受过击） */
  get justHit(): boolean { return this.justHitT > 0; }
  /** 原版 netID 变种（负数 SetDefaultsFromNetId）：scale/颜色/属性覆盖 */
  vanillaScale = 1;
  /** NPC.canDisplayBuffs（NPC.cs:6124 默认 true / :8423 SetDefaults 复位）。
   *  FTW 世界 245-248 石巨人族置 false（getGoodAdjustments :17945/:17950/:17955，
   *  249 不置）。原版门控消费两处：GetNPCColorTintedByBuffs 染色（:92026，经
   *  Main.cs:22797）与 UpdateNPC_BuffApplyVFX 鞭标闪电粒子（:92135）——两消费者
   *  本仓未移植（debuff 自发光 :92181+ 段不受此门），字段落地保数据链一致（批次B） */
  canDisplayBuffs = true;
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
  /** 出生渐显中（仅原版 alpha=255 的 EoW 族）;静态半透明(史莱姆 175 等)不参与 */
  alphaFade = false;
  /** 原版 ai[0] 跳跳计数器（史莱姆 hop 节奏）；ai[2] 卡墙禁追冷却 */
  ai0 = -1120;
  ai2 = 0;
  /** 原版 ai[1]（史莱姆体内物品 id，驱动 SLIME_ITEM_COLORS 渐变色；0=无） */
  ai1 = 0;
  /** 原版 ai[3]（地牢 AI 族用：诅咒头骨状态/火轮速度档/刺球相位） */
  ai3 = 0;
  /** 原版 directionY（火轮/刺球对角弹跳的纵向方向） */
  dirY = 1;
  /** AI 首帧初始化标记（原版 ai[0]==0 门在 ai0 初值 -1120 的史莱姆语义下不可用） */
  aiInit = false;
  /** AI_024 鸮族 localAI[0]（出生即飞行一次性门,NPC.cs:25410-25416） */
  owlAirborneInit = false;
  /** 原版 timeLeft（CheckActive 屏内每 tick 重置；activeTime=750，非 7500） */
  despawnTimer = 750;
  /** Boss 离场逃走标记（EncourageDespawn/天亮撤离等非击杀消亡）：
   *  Game 记账分支据此区分「逃走」（不播击败公告、不写 downed 标志）与「被击败」 */
  bossFled = false;
  /** 原版 despawnEncouraged（EncourageDespawn 置位，屏内重置清除） */
  despawnEncouraged = false;
  inWater = false;       // 入水检测（溅落声用）
  /** Boss 专属初始化标记(部件生成等一次性动作;aiN 默认值有歧义故独立字段) */
  bInit = false;
  /** 部件 → 主体引用（骷髅王手 36 → 头：渲染臂骨 IK 与存活判定用） */
  master: Enemy | null = null;
  /** 原版 NPC.reflectsProjectiles（NPC.cs:6019）：冲刺中反射玩家弹幕（419 旋刃怪
   *  cs:57171 置位；Projectile.cs:12050 命中前反射——CanBeReflected 弹型白名单 +
   *  ReflectProjectile cs:67036 反向归属玩家管线未接，登记依赖） */
  reflectsProjectiles = false;
  /** 原版 NPC.takenDamageMultiplier（NPC.cs:6018，StrikeNPC :81997-82000 防
   *  御结算后 ×N）：419 旋刃冲刺中受击 ×3（cs:57172） */
  takenDamageMultiplier = 1;

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

  /** 贴附族层数登记（projStatus.applyProjStatus 施加 169/183/337/344 时调用，
   *  等价原版一枚贴附弹入场的 KillOldestJavelin 检查 :13019-13030）：
   *  push 一层（寿命=dur 秒），超上限杀最老（最早入池者剩余时间最低，对应
   *  原版扫 timeLeft 最低者 Kill，:13995-14020）。598=6 / 614=10；
   *  971/975 不在 :13021 白名单 → 无上限 */
  addStickerStack(buff: 169 | 183 | 337 | 344, dur: number): void {
    const arr = buff === 169 ? this.javelinStacks : buff === 183 ? this.stardustStacks
      : buff === 337 ? this.spikeStacks : this.butcherStacks;
    const cap = buff === 169 ? 6 : buff === 183 ? 10 : Infinity;
    arr.push(dur);
    while (arr.length > cap) arr.shift(); // 最老离池
  }

  fixedUpdate(dt: number, game: GameHooks) {
    this.prevX = this.x; this.prevY = this.y;
    this.gnomeAge++;
    // 侏儒 624 日光石化（NPC.cs:56252-56280 + :56232 ShouldTurnToStone——白天且
    // 头上无实心遮挡 → 脚下实心 → PlaceTile(567 花园侏儒 style rand(5)) +
    // bestiary RegisterKill + Achievement 24,2026-08-13）
    if (this.vanillaId === 624 && !this.dead && this.gnomeAge > 60) {
      const w = game.world as import('../world/World').World;
      if (w?.clock?.isDay && w?.store) {
        const st = w.store;
        const tx = Math.floor(this.cx / 16), ty = Math.floor((this.y + this.h) / 16);
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty) && !st.isActive(tx, ty - 1)) {
          let sheltered = false;
          for (let dy = 1; dy <= 5; dy++) {
            if (st.inBounds(tx, ty - dy) && st.isSolid(tx, ty - dy)) { sheltered = true; break; }
          }
          if (!sheltered) {
            const style = Math.floor(Math.random() * 5);
            st.setTile(tx, ty - 1, TILE_BY_KEY['v_567_garden_gnome'] ?? 0, style * 36, 0);
            game.spawnParticles(this.cx, this.cy, '#E0E0E0', 5, 1, { life: 30 });
            this.dead = true; this.hp = 0;
            return;
          }
        }
      }
    }
    // 联机傀儡（房主权威快照驱动）：无本地 AI——P3.2 插值/外推推进 + 动画计时，
    // 打击/拾取等交互经 entityNet 上报房主结算
    if (this.netPuppet) {
      this.aiT++;
      this.animT++;
      this.netPuppetStep();
      this.onGround = Math.abs(this.vy) < 0.6;
      if (Math.abs(this.vx) > 0.05) this.walkCycleT += Math.abs(this.vx);
      if (this.iframes > 0) this.iframes--;
      this.pushHistory();   // 傀儡无本地 AI 但拖尾渲染同样需要历史位置
      return;
    }
    this.aiT++;
    if (this.iframes > 0) this.iframes--;
    if (this.justHitT > 0) this.justHitT--;
    this.lightRGB = null; // 点光由 AI 每帧重写（不残留上一帧状态）
    this.lightRGBAt = null;
    if (this.hpBarT > 0) this.hpBarT--;
    if (this.whipTagT > 0) this.whipTagT--;
    if (this.whipProcT > 0) this.whipProcT--;
    if (this.squash !== 0) this.squash *= 0.85;
    this.animT++;
    this.walkCycleT += Math.abs(this.vx); // 原版 zombie/fighter 行走帧按 |vx| 累加（L77072/L70216）
    // 原版 case46 族 vx==0 清 frameCounter（NPC.cs:77571-77577）——站定即清相位，
    // 起步必从帧 0 起稳走（2026-08-18 审查：曾保留相位起步首帧非 0）
    if (Math.abs(this.vx) <= 0.05) this.walkCycleT = 0;

    // 出生渐显（alphaFade 族，AI 分发【前】的近似段）——静态半透明不受影响。
    // EoW 族（13-15）除外：走下方 AI 分发后的 1:1 段（移动门 -42/t，NPC.cs:52650-52670）
    if (this.alphaFade && !(this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15)) {
      this.spawnAlpha = Math.max(0, this.spawnAlpha - 1);
      if (this.spawnAlpha === 0) this.alphaFade = false;
    }

    const player = (game as unknown as { player: Player }).player;
    const hasPlayer = !!player && !player.dead;

    // ---- 原版数据驱动路径：按 aiStyle 分发到已移植的 AI 家族（分发后落入共享尾段） ----
    // 蠕虫身体段（wormFollow 非空）无 AI：位置由头部 wormAI 沿链驱动，但仍走共享尾段（接触伤害等）
    // 例外：EoW 三段各段独立跑 eowAI（断链自查 + 身/尾自跟随，:51874/:52266），
    // 不再由头统一驱动链——断链拆分后每条子虫的头各自驱动
    const eowSeg = this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15;
    const wormBody = this.wormFollow && !eowSeg;
    // 小动物（critter）优先走被动游荡，绝不落入 default 的追击 fallback
    if (this.vanilla && !wormBody && this.vanilla.critter) {
      this.critterWanderAI(game, hasPlayer ? player : null);
    } else if (this.vanilla && !wormBody) {
      const p = hasPlayer ? player : null;
      switch (this.vanilla.aiStyle) {
        case 92: this.dummyAI(game); break;                            // AI_092 训练假人（NPC 488）
        case 1: this.slimeAI(game, p); break;                          // AI_001 史莱姆
        case 2: this.floatEyeAI(game, p); break;                        // AI_002 飘浮眼（原版核）
        case 3:
          // AI_003 拜月教弓手 379/380 仪式待机（NPC.cs:56575-56601,ai[3]<0 静立面碑零伤；
          // 碑置 ai[3]=0 后激活复位 :56602-56609,回战士核）——bossAI_lunar_misc
          if ((this.vanillaId === 379 || this.vanillaId === 380) && this.ai3 < 0) {
            cultistArcherStandbyAI(this, game);
            break;
          }
          if (this.vanillaId === 379 || this.vanillaId === 380) cultistArcherWake(this);
          this.fighterAI(game, p);
          // 火把僵尸 590/591 手持火把发光（NPC.cs:57309-57366 AI_003 内 type 段）：
          //  590 按朝向取 (Center±22 / y+6) 格，火把格与相邻格均无液体才点亮；
          //  591 持械变体 !wet 即亮，偏移 ±36/±28（专家变体，尘需 ai[2]==0 门）。
          //  色 (1, 0.95, 0.8) = 与手持火把同色；尘 6 号 1/30 概率
          if (this.vanillaId === 590 || this.vanillaId === 591) this.torchZombieLight(game);
          // AI_003 火星尾段（bossAI_martian.ts）：军官 383 带盾无敌/补盾、工程师 386 放炮塔
          if (this.vanillaId === 383 || this.vanillaId === 386) martianFighterExtras(this, game, p);
          break;                                                        // AI_003 战士族（原版通用核）
        // EoC 传参例外:玩家死亡也要传原对象(cs:19931 dead 判定走逃离分支,
        // 冲刺计时合法冻结;传 null 会让 aiT 照走、状态机停摆 → 首冲时长翻倍)
        case 4: this.eocAI(game, (game as unknown as { player: Player }).player ?? null); break; // AI_004 克苏鲁之眼（NPC.cs:19909）
        case 5: this.swarmerAI(game, p); break;                         // AI_005 噬魂怪族（原版蜂群核）
        case 6:
          // AI_006 蠕虫族（头）；412 爬尾虫走专属核（bossAI_lunar_misc：
          // 30 段链 + 空泳追击环 + 414 尾受击红闪 localAI[2] 状态机，cs:51357-52671）
          if (this.vanillaId === 412) crawltipedeAI(this, game, p);
          else this.wormAI(game, p);
          break;
        case 8: this.casterAI(game, p); break;                          // AI_008 法师族（传送+弹幕）
        case 10: this.cursedSkullAI(game, p); break;                     // AI_010 诅咒头骨（地牢飞行族）
        case 11:
          // 68 守卫走专用分支（bossAI.skeletronBossAI 注释"守卫分支已在 skeletronHeadAI"
          // 即此拆分：守卫恒速追击与骷髅王战斗状态机互不混用）
          if (this.vanillaId === 68) this.dungeonGuardianAI(game, p);
          else skeletronBossAI(this, game, p);
          break;                                                         // AI_011 骷髅王头战斗核/地牢守卫
        case 12: skeletronHandAI(this, game, p); break;                    // AI_012 骷髅王手(锚定头)
        case 20: this.blazingWheelAI(); break;                           // AI_020 火轮（地牢陷阱）
        case 21: this.spikeBallAI(game); break;                          // AI_021 刺球（地牢陷阱）
        case 14: this.batAI(game, p); break;                            // AI_014 蝙蝠/飞行族（1.4.5.6 原版核）
        case 16: this.swimAI(game, p); break;                           // AI_016 游泳族（鲨鱼/食人鱼）
        case 18: this.jellyfishAI(game, p); break;                      // AI_018 水母族（脉冲游动）
        case 22: this.ghostAI(game, p); break;                          // AI_022 幽灵族（穿墙缓速）
        case 13: this.plantAI(game, p); break;                          // AI_013 植物/攀爬者族（锚点伸展）
        case 15: kingSlimeAI(this, game, p); break;                       // AI_015 史莱姆王(大跳+小史莱姆)
        case 54: brainOfCthulhuAI(this, game, p); break;                  // AI_054 克脑(爬行者环→瞬移冲刺)
        case 55: creeperAI(this, game, p); break;                         // AI_055 爬行者(环绕漂移)
        case 30: twinsAI(this, game, p, false); break;                    // AI_030 雷神之眼 125(悬浮/连冲/变身/激光)
        case 31: twinsAI(this, game, p, true); break;                     // AI_031 魔神之眼 126(诅咒焰/火焰喷射)
        case 32: skeletronPrimeAI(this, game, p); break;                  // AI_032 机械骷髅王头 127(4 部件/旋冲/白天狂暴)
        case 33: case 34: case 35: case 36: primePartAI(this, game, p); break; // AI_033-036 Prime 部件(锯/激光/钳/炮)
        case 37: destroyerAI(this, game, p); break;                       // AI_037 毁灭者 134(80 段链穿地/探针激光)
        case 27: wallOfFleshAI(this, game, (game as unknown as { player: Player }).player ?? null); break; // AI_027 血肉墙(空腔扫描/速度血量档/Leech 轮)
        case 28: wofEyeAI(this, game, p); break;                          // AI_028 血肉墙之眼(钉墙吸附/激光连射 83)
        case 29: hungryAI(this, game, p); break;                          // AI_029 饥饿者(挂墙环绕→受击脱落扑咬)
        case 84: lunaticCultistAI(this, game, p); break;                  // AI_084 拜月教邪教徒(瞬移+四系弹幕轮换)
        // ---- 月系批（bossAI_lunar_misc.ts）----
        case 81: moonLordFreeEyeAI(this, game, p); break;                // AI_081 月总游离眼 400（cs:38224 十槽攻击表+死光）
        case 82: moonLeechAI(this, game, p); break;                       // AI_082 月总水蛭块 401（cs:38668 90t 插值吸血回灌）
        case 83:                                                            // AI_083 神秘石碑 437/忠实信徒 438（cs:38793）
          if (this.vanillaId === 437) cultistTabletAI(this, game, p);
          else lunaticDevoteeAI(this, game, p);
          break;
        case 86: phantomAI(this, game, p); break;                          // AI_086 暗焰幻影 472/远古幻影 521（cs:39261 穿墙横掠循环）
        case 87: bigMimicAI(this, game, p); break;                         // AI_087 珍稀四宝箱怪 473-476（cs:39520 跳扑+蓄能/俯冲/三连扑）
        case 88: mothronAI(this, game, p); break;                          // AI_088 飞蛾魔 477（cs:39876 日食限定轮换+产卵）
        case 89: mothronEggAI(this, game, p); break;                       // AI_089 蛾卵 478（cs:40407 900t→Transform 479）
        case 90: babyMothronAI(this, game, p); break;                      // AI_090 幼蛾 479（cs:40450 日食贴脸冲撞）
        case 91: graniteElementalAI(this, game, p); break;                 // AI_091 花岗岩元素 483（cs:40686 五态寻路）
        case 120: empressOfLightAI(this, game, p); break;                 // AI_120 光之女皇(连段选招/半血变身)
        case 121: queenSlimeAI(this, game, p); break;                     // AI_121 史莱姆皇后(走路四连跳→飞行二阶段)
        case 122: this.pirateGhostAI(game, p); break;                     // AI_122 海盗幽灵 662（穿墙追击+失标渐隐自灭）
        case 123: deerclopsAI(this, game, p); break;                      // AI_123 鹿角怪(尖刺/碎石/影手/回家)
        case 100: ancientLightAI(this, game, p); break;                  // AI_100 远古之光 522(直飞投射物型)
        case 101: ancientDoomAI(this, game, p); break;                  // AI_101 远古末日 523(锚邪教徒蓄能自爆)
        case 43: queenBeeAI(this, game, p); break;                        // AI_043 蜂后(悬浮俯冲/蜜蜂机枪/毒刺)
        case 50: planteraHookAI(this, game, p); break;                    // AI_050 真菌孢子 261/孢子 265
        case 51: planteraAI(this, game, p); break;                        // AI_051 世纪之花(钩蔓牵引→二阶段)
        case 52: planteraTentacleAI(this, game, p); break;                // AI_052 钩蔓 263(抓墙换锚收线)
        case 53: planteraTentacle2AI(this, game, p); break;               // AI_053 触须 264(二阶段环绕)
        case 69: dukeFishronAI(this, game, p); break;                     // AI_069 猪鲨(冲撞/泡泡/龙卷,半血变身)
        case 70: dukeBubbleAI(this, game, p); break;                      // AI_070 爆裂泡泡 371
        case 71: sharkronAI(this, game, p); break;                        // AI_071 鲨鱼龙 372/373(龙卷出鲨,升空蓄力→扑咬)
        case 77: moonLordCoreAI(this, game, p); break;                    // AI_077 月总核心 398(双手死前无敌)
        case 78: moonLordHandAI(this, game, p); break;                    // AI_078 月总手 397(攻表/睁眼可击)
        case 79: moonLordHeadAI(this, game, p); break;                    // AI_079 月总头 396(死亡之光/吸血)
        case 45: golemAI(this, game, p); break;                        // AI_045 石巨人本体 245(蓄力跳/挂头无敌)
        case 46: golemHeadAI(this, game, p); break;                      // AI_046 挂载头 246(锚本体/火焰弹眼激光;249 自由态)
        case 47: golemFistAI(this, game, p); break;                      // AI_047 石巨人拳 247/248(肩锚冲拳)
        case 40: this.wallCreeperAI(game, p); break;                      // AI_040 爬墙蜘蛛族（贴背景墙爬行+形态互转）
        case 42: this.lostGirlAI(game, p); break;                         // AI_042 失落女孩（伪装静止→Nymph 变身 cs:30281-30310）
        case 0: this.boundNPCAI(game, p); break;                          // AI_000 被缚NPC（cs:19774 站立/水上漂流；Enemy 侧防御，常规走 TownNPC.bound）
        case 17: this.vultureAI(game, p); break;                          // AI_017 秃鹫（cs:24079 栖息→200px盒/受击起飞，单向不回落）
        case 19: this.antlionAI(game, p); break;                          // AI_019 蚁狮（cs:24465 扎沙不动+沙球；传送带特例略）
        case 23: this.flyingWeaponAI(game, p); break;                     // AI_023 飞行武器（cs:25316 冲/漂100/转120 循环，受击回蓄转）
        case 25: this.mimicAI(game, p); break;                            // AI_025 宝箱怪（cs:25621 伪装200px盒→小小大跳循环）
        case 39: this.tortoiseAI(game, p); break;                         // AI_039 陆龟族（cs:29257 待机蓄力→蓄势→旋冲→恢复）
        case 41: this.herplingAI(game, p); break;                         // AI_041 赫柏林/德普林/378 咬齿炸弹（cs:30017 低跳连扑+自爆链）
        case 44: this.flyingSwarmerAI(game, p); break;                    // AI_044 飞鱼/蚁狮蜂（cs:30999 分轴限速追+失视逃逸）
        case 56: this.dungeonSpiritAI(game, p); break;                    // AI_056 地牢之魂（cs:32915 穿墙0.99惯性追踪）
        case 26: this.chargerAI(game, p); break;                        // AI_026 独角兽/冲锋族（原版核）
        case 107:                                                          // AI_107 ImprovedWalkers（NPC.cs:63372-64919）
          if (this.vanillaId !== 620) ai107ImprovedWalkers(this, game, p); // DD2 walker 族 1:1（bossAI_dd2.ts：近战前摇/投弹/掷矛/喷吐/自爆/灵气）
          else this.chargerAI(game, p, 1);                                 // 620 地精鲨（wet 游泳档,cs:64118-64230 专属分支）
          break;
        case 94: this.towerAI(game, p); break;                          // AI_094 星璇四塔（NPC.cs:41029-41443，核心 1:1）
        // ---- 星璇塔四组专属怪 1:1（bossAI_lunar_misc.ts；docs/event-lunar-pillars.md §4）----
        // 74 穿心者 418 / 75 日耀骑手 416 已由火星批 bossAI_martian.ts 落位（见下方
        // 火星族分发）；85/95/96/97/99 五族 1:1 内核在 lunar_misc（一期近似档已退役）。
        // 勘误：NPC 408 无 NewNPC 调用源（docs §4"408 由投射物 539 生成"不成立）。
        case 85: starCellAI(this, game, p); break;                    // AI_085 星细胞 405/星云头蟹 421（六态寻路+吸附）
        case 95: smallStarCellAI(this, game, p); break;               // AI_095 小星细胞 406（300t 长大 Transform 405）
        case 96: flowInvaderAI(this, game, p); break;                 // AI_096 水流入侵者 407(/408)（悬顶伺服+甩 539）
        case 97: nebulaFloaterAI(this, game, p); break;               // AI_097 星云悬浮脑 420（瞬移+环绕球 574→弹 576）
        case 99: solarSlimeAI(this, game, p); break;                  // AI_099 日耀黏液 519（坠落→落地 5t 自爆）
        // ---- 月事件（南瓜月/霜月）Boss 族 1:1（bossAI_moon_events.ts）----
        case 57: mourningWoodAI(this, game, p); break;                  // AI_057 悲木 325/常世吼 344（cs:32937 悬浮树怪+分阶段弹幕）
        case 58: pumpkingAI(this, game, p); break;                       // AI_058 南瓜王 327（cs:33246 悬浮/俯冲+生双刃）
        case 59: pumpkingBladeAI(this, game, p); break;                   // AI_059 南瓜王之刃 328（cs:33405 锚主环绕/俯冲/横扫）
        case 60: iceQueenAI(this, game, p); break;                        // AI_060 冰雪女王 345（cs:33588 滑翔/落冰/旋射三态）
        case 61: santaNK1AI(this, game, p); break;                        // AI_061 圣诞坦克 346（cs:33902 悬浮+链炮/火箭/礼盒）
        case 62: elfCopterAI(this, game, p); break;                       // AI_062 玩具直升机 347（cs:34155 近距悬停点射）
        case 63: flockoAI(this, game, p); break;                          // AI_063 弗洛科 352（cs:34208 追踪+旋冲）
        case 38: snowmanAI(this, game, p); break;                         // AI_038 雪人三兄弟 143/144/145（cs:29115 跳扑/停顿/雪球）
        case 9: bouncingBallAI(this, game, p); break;                     // AI_009 弹跳球族 25/30/33/112/516/665/666（cs:21349 直飞球）
        // ---- 火星疯狂族 1:1（bossAI_martian.ts）----
        case 80: martianProbeAI(this, game, p); break;                    // AI_080 火星探测器 399（cs:38129 逃逸→StartInvasion(4)）
        case 76: martianSaucerAI(this, game, p); break;                   // AI_076 火星飞碟核心 395（cs:36322 600t 六窗口+部件生成）
        case 72: bubbleShieldAI(this, game, p); break;                    // AI_072 泡泡盾 384（cs:35318 锚军官 383）
        case 73: teslaTurretAI(this, game, p); break;                     // AI_073 特斯拉炮塔 387（cs:35340 部署渐显+180t 电击）
        case 74:                                                          // AI_074 火星无人机 388/日耀 Corite 418（cs:35452 悬浮→扑咬→自爆）
          if (this.vanillaId === 388 || this.vanillaId === 418) martianDroneAI(this, game, p);
          else this.floatEyeAI(game, p);                                  // 其余（一期近似档保留）
          break;
        case 75:                                                          // AI_075 飞碟部件 392/393/394 + 骑手 390（cs:35745 锚主体+攻击窗）
          if (this.vanillaId === 390 || this.vanillaId === 392
            || this.vanillaId === 393 || this.vanillaId === 394
            || this.vanillaId === 416 || this.vanillaId === 492) martianSaucerPartAI(this, game, p);
          else this.fighterAI(game, p);                                   // 其余（一期近似档保留）
          break;
        case 48: golemHeadAI(this, game, p); break;                       // AI_048 自由石巨人头 249（cs:31500,golemHeadAI 已含自由态分支）
        case 49: angryNimbusAI(this, game, p); break;                     // AI_049 愤怒云 250（cs:31742 悬顶淋雨 264）
        // ---- DD2/旧日军团 + 沙漠族（bossAI_dd2.ts）----
        case 93: flyingDutchmanAI(this, game, p); break;                  // AI_093 荷兰飞盗船 491（cs:40918 四炮部件+海盗跳舱+贴地巡航）
        case 102: sandElementalAI(this, game, p); break;                  // AI_102 沙尘精 541（cs:42224 walker 核+沙暴标记 658）
        case 103: sandSharkAI(this, game, p); break;                      // AI_103 沙鲨族 542-545（cs:42621 沙中巡游+跃沙扑咬,沙族豁免碰撞）
        case 104: dd2AttackerTestAI(this, game); break;                   // AI_104 DD2AttackerTest 547（cs:42807 出生即消）
        case 105: eterniaCrystalAI(this, game, p); break;                 // AI_105 永恒水晶 548（cs:42810 180t 双端放门+胜负演出）
        case 106: lanePortalAI(this, game, p); break;                     // AI_106 神秘传送门 549（cs:43063 出怪门节拍,事件依赖 DD2_EVENT_HOOKS）
        case 108: divingFlyerAI(this, game, p); break;                    // AI_108 飞龙 558-560/小妖魔滑翔怪 574-575（cs:65959 俯冲五态+自爆）
        case 109: darkMageAI(this, game, p); break;                       // AI_109 黑暗魔法师 564/565（cs:66392 walker+三连招 675/674/673）
        case 110: betsyAI(this, game, p); break;                          // AI_110 双足翼龙 551（cs:62266 八槽攻表+rotation 收敛）
        case 111: dd2LightningBugAI(this, game, p); break;                // AI_111 埃特尼亚荧光虫 578（cs:66799 悬停蓄电 682 电弧）
        case 113: this.windyBalloonAI(game, p); break;                    // AI_113 风气球 594（cs:48253 挂史莱姆 ai[0]=-999）
        case 125: this.balloonSlimeAI(game, p); break;                    // AI_125 笨笨气球史莱姆 686（cs:44009 漂浮悬停+爆裂解救）
        case 117: this.bloodNautilusAI(game, p); break;                  // AI_117 恐惧鹦鹉螺 618（cs:47488 血月钓鱼 Boss）
        case 119: this.dandelionAI(game, p); break;                      // AI_119 蒲公英 628（cs:43254 下风喷籽；非critter勿只登 critterWanderAI）
        case 126: this.statueMimicAI(game, p); break;                    // AI_126 雕像宝箱怪 690（cs:43760 伪装/唤醒/跳跃穿墙）
        default: this.zombieAI(game, p); break;                        // 其余家族待逐个移植
      }
    } else switch (this.key) {
      case 'slime_green':
      case 'slime_blue': this.slimeAI(game, hasPlayer ? player : null); break;
      case 'zombie': this.zombieAI(game, hasPlayer ? player : null); break;
      case 'demon_eye':
      case 'cave_bat': this.flyAI(game, hasPlayer ? player : null, 0.09); break;
      case 'servant_of_cthulhu': this.flyAI(game, hasPlayer ? player : null, 0.22); break;
      case 'eye_of_cthulhu': this.eocAI(game, player ?? null); break;
    }

    // ---- AI 家族外的三段恒走点光（与 AI 分发无关，原版各自独立方法）----
    this.updateNpcCastLights();
    this.updateNpcTrailLights();
    this.updateNpcDebuffLights();
    // 毁灭者族段光：原版 AI_037 每段独立发光，本仓身/尾 wormBody 跳过 AI 分发 →
    // 全族三 id（134/135/136）统一在此结算（含头，防与 destroyerAI 双写）
    if (this.vanillaId === 134 || this.vanillaId === 135 || this.vanillaId === 136) {
      destroyerSegmentLight(this, game);
    }

    // ---- EoW 出生渐显（AI_006 尾段 1:1，NPC.cs:52650-52670；须在 AI 分发后跑——
    //      原版位移门 `(position - oldPosition).Length() > 2` 量的是本 tick 位移，
    //      fixedUpdate 头部 prevX/prevY 在 AI 前采样）----
    // 门（:52650 原文为反写 return 表达式）：13 头恒过；14/15 身/尾须前段
    //   spawnAlpha < 85 才启动——渐显沿链向尾传播（头先现、段逐级跟上）。
    //   prev 链断（晋升中瞬时态）按头段放行，防残段卡全透明。
    // alpha>0 且存活（:52656-52664）：每 tick 2 颗 14 号腐化尘（noGravity/noLight、
    //   scale 2、尘 alpha 100——spawnParticles 紫尘近似，DustID.Corruption）。
    // 位移 >2px（:52666-52670）：spawnAlpha -42 钳 0——255→0 共 7 tick 现身。
    // ---- 幻影龙 454-459 出生渐显（AI_006 头段 :51379-51400 1:1）：头无条件 -42/t、
    //      身/尾须前段 spawnAlpha<85 沿链传播（无位移门——龙自传送圈直接成型）；
    //      渐隐期 dontTakeDamage + 每 tick 2 颗 228 紫尘（noGravity/noLight/scale 2）----
    if (this.vanillaId !== null && this.vanillaId >= 454 && this.vanillaId <= 459) {
      const prev = this.wormFollow;
      if (this.vanillaId === 454 || !prev || prev.spawnAlpha < 85) {
        this.dontTakeDamage = this.spawnAlpha > 0;    // :51381-51382
        if (this.spawnAlpha > 0 && this.hp > 0) {
          game.spawnParticles(this.x + Math.random() * this.w, this.y + Math.random() * this.h,
            '#A060E0', 2, 0, { life: 40, size: 2 });
        }
        this.spawnAlpha = Math.max(0, this.spawnAlpha - 42);
        if (this.spawnAlpha === 0) this.alphaFade = false;
      }
    }

    if (this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15 && this.alphaFade) {
      const prev = this.wormFollow;
      if (this.vanillaId === 13 || !prev || prev.spawnAlpha < 85) {
        if (this.spawnAlpha > 0 && this.hp > 0) {
          game.spawnParticles(
            this.x + Math.random() * this.w, this.y + Math.random() * this.h,
            '#8A62C0', 2, 0, { life: 40, size: 2 },
          );
        }
        if (Math.hypot(this.x - this.prevX, this.y - this.prevY) > 2) {
          this.spawnAlpha = Math.max(0, this.spawnAlpha - 42);
          if (this.spawnAlpha === 0) this.alphaFade = false;
        }
      }
    }

    // ---- 液体态 1:1（NPC.cs UpdateCollision :93712-93805，全量细节在 npcLiquid.ts）----
    // 岩浆判定(受伤/onFire)→wet 判定(WetCollision 中心小盒/蜂蜜/微光)→出入水去抖溅落声
    // →!wet 清液体态→熄火(24+323)→liqFactor 供 moveAndCollide 缩位移（水 .5/岩浆 .5/
    // 蜂蜜 .25/微光 .375；DD2 族与 612/613 = 1）。此前中心格 liquid>80 近似 + 无减速已退役。
    updateNpcLiquid(this, game, game.world.store);
    // 微光接触（NPC.cs:94268-94274）：WetCollision 盒命中微光 → shimmerWet +
    // TryAddingRepeatedBuff(353,100)；buff 353 → shimmering（:93313-93321）→
    // shimmerTransparency +0.01/t（:92468-92483）>0.9 → GetShimmered；离池衰减
    // :92484-92500 一并 1:1（见下），视觉渐隐侧未接（GAP：shimmerTransparency
    // 渲染消费）。
    // 入口门（NPC.cs:17773）：buffImmune[353] = ShimmerImmunity[type]——免表 NPC
    // （史莱姆王/石巨人/史莱姆皇后/城镇宠物/事件军…，isNpcShimmerImmune）不进
    // shimmering；非免表 Boss（克苏鲁之眼 4 等）原版照进，GetShimmered 无表项
    // 时为空操作（npcGetShimmered 同语义提前返回）
    if (this.vanillaId !== null && !isNpcShimmerImmune(this.vanillaId)) {
      // shimmerWet 由 updateNpcLiquid 的 WetCollision（中心小盒）写出——原版同一判定
      if (this.shimmerWet) {
        this.shimmerT += 1;
        if (this.shimmerT > 90) this.npcGetShimmered(game);
      } else if (this.shimmerT > 0) {
        // 离池衰减（:92484-92500）：shimmerTransparency -0.001/t（本仓 shimmerT
        // 为其 ×100 计数 → -0.1/t，90 → 0 需 900t；justHit -0.1、buffImmune[353]
        // -0.015 两加速项本仓无对应态不进）。曾 -1/t（快 10 倍，离池即近乎清零）
        this.shimmerT = Math.max(0, this.shimmerT - 0.1);
      }
    }
    // onFire DoT（NPC.cs:92616-92630:lifeRegen-8 = 4 HP/s,无防御结算）+ 火尘粒子（:92187）
    // Slimed(137 = drippingSlime,凝胶易燃):六火系每系再叠等量 lifeRegen → 各系 DoT 翻倍
    //  （:92623-92624 onFire / :92633-92635 onFire3 / :92643-92645 frostburn /
    //    :92655-92657 frostburn2 / :92667-92669 onFire2 / :92684-92686 shadowFlame）
    // Oiled(204):六火系任意在身时【flat 再叠 -50 = +25 HP/s】(:92728-92737)——
    //  非"按系翻倍"(旧 oiledMul=2 系误读,2026-08-13 G7 回源修正);slimedT 独立递减
    const slimedMul = this.slimedT > 0 ? 2 : 1;
    // Oiled 的 -50 是【单块一次性】(:92728-92737),多火系并存时不得按系重复叠——
    // 独立 oiledDoT 累加器结算,不并入各系
    const fireOn = this.onFireT > 0 || this.cursedT > 0 || this.onFire3T > 0
      || this.frostburnT > 0 || this.frostburn2T > 0 || this.shadowFlameT > 0;
    if (this.oiledT > 0 && fireOn) this.oiledDoT += 25 * dt;
    if (this.slimedT > 0) this.slimedT -= dt;
    if (this.onFireT > 0) {
      this.onFireT -= dt;
      this.onFireDoT += 4 * slimedMul * dt;
      if (this.onFireDoT >= 1) {
        const n = Math.floor(this.onFireDoT);
        this.onFireDoT -= n;
        this.hp -= n;
        this.hpBarT = 240;
        if (this.hp <= 0) this.hurt(9999, 0, 0, game); // 走标准死亡管线(掉落/分裂/联机)
      }
      if (Math.random() < 0.75) {
        game.spawnParticles(
          this.x + Math.random() * this.w, this.y + Math.random() * this.h,
          Math.random() < 0.7 ? '#FF9A3C' : '#FFD24A', 1, 0.8,
          { life: 26 + Math.random() * 14, grav: -0.06, damp: 0.96 });
      }
    }

    // ---- 武器浸剂 debuff 滴血（R2，NPC.cs:92585/92703/92684 DoT 同 onFire 模式） ----
    if (this.poisonT > 0) { this.poisonT -= dt; this.poisonDoT += 6 * dt; }
    if (this.venomT > 0) { this.venomT -= dt; this.venomDoT += 30 * dt; }
    // 六火系:各自基档 × slimedMul(cursed=onFire2 亦吃 Slimed 翻倍)
    if (this.cursedT > 0) { this.cursedT -= dt; this.cursedDoT += 24 * slimedMul * dt; }
    // 四新系(NPC.cs:44→8HP/s(:92648) / 324→25HP/s(:92668) / 323→15HP/s(:92632) /
    //  153→15HP/s(:92712),各吃 Slimed 翻倍)
    if (this.frostburnT > 0) { this.frostburnT -= dt; this.frostburnDoT += 8 * slimedMul * dt; }
    if (this.frostburn2T > 0) { this.frostburn2T -= dt; this.frostburn2DoT += 25 * slimedMul * dt; }
    if (this.onFire3T > 0) { this.onFire3T -= dt; this.onFire3DoT += 15 * slimedMul * dt; }
    if (this.shadowFlameT > 0) { this.shadowFlameT -= dt; this.shadowFlameDoT += 15 * slimedMul * dt; }
    if (this.oiledT > 0) this.oiledT -= dt;
    if (this.brokenArmorT > 0) this.brokenArmorT -= dt;
    if (this.betsysCurseT > 0) this.betsysCurseT -= dt;
    // 层数模型（NPC.cs:92807-92830）：num8 = 场上附着 636 太阳耀斑数（WeaponProj
    // .daybreakStacks），零层兜底 1（:92822-92825）→ num8×100 HP/s（:92826）
    if (this.daybreakT > 0) {
      this.daybreakT -= dt;
      this.daybreakDoT += 100 * Math.max(1, daybreakStacks(this.id)) * dt;
    }
    if (this.bleedT > 0) { this.bleedT -= dt; this.bleedDoT += 12 * dt; }
    if (this.hemorrhageT > 0) { this.hemorrhageT -= dt; this.hemorrhageDoT += 100 * dt; }
    // 贴附族层数结算（NPC.cs:92740-92863）：层数先随 dt 衰减（每层独立倒计时，
    // 寿命=对应 buff 时长——与场上附着弹到寿消亡等价），再按层 ×单层 HP/s。
    // 无零层兜底（:92740/:92761/:92786/:92846 四处均无 num==0→1；唯 Daybreak 有）
    const decay = (arr: number[]): number => {
      let n = 0;
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i] -= dt;
        if (arr[i] <= 0) arr.splice(i, 1); else n++;
      }
      return n;
    };
    if (this.javelinT > 0) { this.javelinT -= dt; this.javelinDoT += 3 * decay(this.javelinStacks) * dt; }   // :92740-92759
    else this.javelinStacks.length = 0;   // buff 尽层同步清（防御性；正常两钟同步到期）
    if (this.spikeT > 0) { this.spikeT -= dt; this.spikeDoT += 3 * decay(this.spikeStacks) * dt; }           // :92761-92779
    else this.spikeStacks.length = 0;
    if (this.butcherT > 0) { this.butcherT -= dt; this.butcherDoT += 4 * decay(this.butcherStacks) * dt; }   // :92786-92804
    else this.butcherStacks.length = 0;
    this.soulDrainActive = this.soulDrainT > 0;   // :91951 debuff 位镜像
    if (this.soulDrainT > 0) { this.soulDrainT -= dt; this.soulDrainDoT += 25 * dt; } // :92927-92935
    if (this.stardustT > 0) { this.stardustT -= dt; this.stardustDoT += 20 * decay(this.stardustStacks) * dt; } // :92846-92863 num10×20
    else this.stardustStacks.length = 0;
    // Oiled 独立结算(:92728-92737 单块 -50 = 25 HP/s,不随各系翻倍/重复)
    if (this.oiledDoT >= 1) {
      const n = Math.floor(this.oiledDoT);
      this.oiledDoT -= n;
      this.hp -= n;
      this.hpBarT = 240;
      if (this.hp <= 0) this.hurt(9999, 0, 0, game);
    }
    for (const [tKey, dKey] of [['poisonT', 'poisonDoT'], ['venomT', 'venomDoT'], ['cursedT', 'cursedDoT'],
      ['frostburnT', 'frostburnDoT'], ['frostburn2T', 'frostburn2DoT'],
      ['onFire3T', 'onFire3DoT'], ['shadowFlameT', 'shadowFlameDoT'],
      ['daybreakT', 'daybreakDoT'], ['bleedT', 'bleedDoT'], ['hemorrhageT', 'hemorrhageDoT'],
      ['javelinT', 'javelinDoT'], ['spikeT', 'spikeDoT'], ['butcherT', 'butcherDoT'],
      ['soulDrainT', 'soulDrainDoT'], ['stardustT', 'stardustDoT']] as const) {
      const acc = this[dKey];
      if (acc >= 1) {
        const n = Math.floor(acc);
        this[dKey] -= n;
        this.hp -= n;
        this.hpBarT = 240;
        if (this.hp <= 0) this.hurt(9999, 0, 0, game);
      }
    }
    if (this.ichorT > 0) this.ichorT -= dt;
    if (this.midasT > 0) this.midasT -= dt;
    // confused（buff 31）存量倒数；反向语义在各 AI 的索敌点（seekDirX）按
    // 原版 TargetClosest :78569 应用——不再对 vx 做周期翻转（旧近似已移除）
    if (this.confusedT > 0) this.confusedT -= dt;

    // 接触伤害（带上攻击者引用，供荆棘反伤）。damage=0（小动物等友好生物）不触发——
    // 否则 damagePlayer(0) 仍会击退/闪红，表现为"兔子撞我有攻击性"
    if (hasPlayer && this.aabbOverlaps(player) && this.def.damage > 0) {
      // 蜂蜜史莱姆（NPC 1 且 ai[1]=1125，Player.cs:30902-30908 接触分支最前）：
      // AddBuff(48 Honey, 1800t=30s) 后 continue——**免接触伤害/击退/无敌帧**，
      // 语义是"蹭一身蜜"而非攻击（此前仅 SLIME_ITEM_COLORS 染色，接触照常掉血）
      if (this.vanillaId === 1 && this.ai1 === 1125) {
        player.buffs?.apply(BuffType.Honey, 30);
      } else {
        game.damagePlayer(this.def.damage, this.cx, this.cy, this, true);
      }
    }

    // Despawn 系统（原版 CheckActive, NPC.cs:78669-78798 + EncourageDespawn :7228-7235）：
    // timeLeft(activeTime=750) 屏内矩形每 tick 重置+清鼓励旗；离屏从当前值倒数，归零即消失。
    // EncourageDespawn(10) 封顶后离屏 ~10t 即消；屏内每 tick 被重置抵挡——
    // 僵尸/眼球白天游荡或上飞，一离屏就消失（原版天亮清夜怪的实际语义）。
    // Boss 默认豁免，但 despawnEncouraged（骷髅王离场/原版通用 EncourageDespawn）后
    // 同样倒数——且玩家死亡（player=null）时视为离屏（原版 CheckActive 不依赖玩家存活）
    if (this.vanillaId === 488
      || (this.vanillaId != null && this.vanillaId in TOWER_KEY)
      || (this.vanillaId != null && NO_DESPAWN_IDS.has(this.vanillaId))
      // 条件豁免（NPC.cs:78645-78679）：139 Betsy 需 134 在场；552-578 OOA 怪需 548
      // 永恒水晶在场（事件怪不应离屏自灭）
      || (this.vanillaId === 139 && this.anyNpcAlive(game, 134))
      || (this.vanillaId != null && this.vanillaId >= 552 && this.vanillaId <= 578 && this.anyNpcAlive(game, 548))) {
      // 训练假人不参与 despawn（原版 netAlways + TileEntity 生命周期由锚 tile 管理）；
      // 四塔同样豁免（DoesntDespawnToInactivity 名单 NPC.cs:78634-78635 含 422/493/507/517
      // ——事件建筑离屏消失会让 UpdateLunarApocalypse 永远等不到塔死）
    } else if (!this.def.boss || this.despawnEncouraged) {
      // 屏内判定跳过死亡玩家（原版 CheckActive 只用 active 玩家重置 timeLeft：
      // 尸体位置不算"屏内"——此前死亡玩家照常重置，Boss 鼓励消散全部失效）
      const pp = player && !player.dead ? player : null;
      const dxp = pp ? Math.abs(pp.cx - this.cx) : Infinity;
      const dyp = pp ? Math.abs(pp.cy - this.cy) : Infinity;
      // 屏内矩形（原版 rectangle2：sWidth/sHeight+2w 固定 1920×1080 → 半轴约 62×35 格）
      if (dxp < TILE * 62 && dyp < TILE * 35
        // flag2 强真名单（:78735-78758）:EoW 头 13/毁灭者头 134 族等恒视屏内
        || (this.vanillaId != null && ALWAYS_ACTIVE_IDS.has(this.vanillaId))) {
        this.despawnTimer = 750;
        this.despawnEncouraged = false;
      } else {
        this.despawnTimer--;
        if (this.despawnTimer <= 0) {
          if (this.def.boss) this.bossFled = true; // 非击杀消亡:天亮离场/玩家死后撤离
          // 风气球 594 自然消散：挂载史莱姆一并消失（防 -999 冻结悬空）
          if (this.vanillaId === 594) {
            const sl = (game.enemies() as Enemy[]).find((n) => n.id === this.ai3 && n.ai0 === -999);
            if (sl) sl.dead = true;
          }
          this.dead = true;
          // 蠕虫离屏消散 → 整链同灭（原版段自查 :51832-51841：前段 ai[0] 失效 →
          // life=0 自灭级联；水蛭头 117 不在闲置豁免名单，离屏消散时其体节
          // 118/119 在名单内不会自行消散，需此处级联，否则留无驱动的冻结残段）
          if (this.wormNext || this.wormFollow) {
            let wh: Enemy = this;
            while (wh.wormFollow) wh = wh.wormFollow;
            for (let s: Enemy | null = wh; s; s = s.wormNext) s.dead = true;
          }
        }
      }
    }
    this.ambientSoundTick(game);   // 环境声三表（IdleSounds/闲话/Critter,2026-08-18 批）
    this.pushHistory();   // 原版 npc.oldPos/oldRot（DrawNPC 拖尾族 419/125-131 读）
  }

  /** 环境声三表（UpdateNPC IdleSounds :91119-91246 + AI_003 闲话 :57735-57764 +
   *  CritterSounds :93420-93517,数据在 data/vanillaNpcAmbience.ts）。
   *  每 tick 每 NPC 至多一次掷骰（原版各表独立掷,同帧双中概率≈0 取先闲话后 idle）。
   *  playSfxWav = GameHooks→Sfx.playWavFile 直 wav（FILE_CASE_VOL 带 Zombie_24-87
   *  ×0.5 等档,零新增 SfxName）。 */
  private ambientSoundTick(game: GameHooks): void {
    const id = this.vanillaId;
    if (id == null || this.dead) return;
    if (this.shimmerT > 0) return;   // IdleSounds :91117 微光浸入态不发声(闲话 :57734 同门)
    const world = game.world;
    const clock = world.clock;
    const st = world.store;
    // 小动物声（:93420-93517）——门控族(day/night/dawn/still)
    const cs = CRITTER_SOUNDS[id];
    if (cs) {
      let ok = true;
      if (cs.gate === 'day') ok = clock.isDay;
      else if (cs.gate === 'night') ok = !clock.isDay;
      else if (cs.gate === 'dawn') ok = clock.isDay && clock.timeOfDay < Clock.DAWN + (Clock.DUSK - Clock.DAWN) / 3;  // Main.time<18000(清晨 1/3)
      else if (cs.gate === 'still') ok = Math.abs(this.vx) < 0.5
        && (!clock.isDay || this.y > world.groundLevel * 16);
      if (ok && Math.floor(Math.random() * cs.denom) === 0) {
        const f = cs.pool ? cs.pool[Math.floor(Math.random() * cs.pool.length)] : cs.file;
        game.playSfxWav?.(f, 1, this.cx, this.cy);
      }
      return;   // 原版 critter 段互斥(else-if 链)
    }
    // AI_003 闲话（:57735-57764）——仅战士族 aiStyle 3 且未被鼓励消散
    // （:57732 DespawnEncouragement_NotDiscouraged 主语义=白天驱散态不呻吟;
    //   完整表含雕像/墓地/事件豁免,此处取 despawnEncouraged 旗主门,近似备案）
    if (this.vanilla?.aiStyle === 3 && !this.despawnEncouraged) {
      const ch = CHATTER_SOUNDS[id];
      if (ch && Math.floor(Math.random() * ch.denom) === 0) {
        game.playSfxWav?.(ch.file, 1, this.cx, this.cy);
        return;
      }
    }
    // IdleSounds（:91119-91246）
    const is = IDLE_SOUNDS[id];
    if (is) {
      if (is.gate === 'wet') {
        const ti = st.idx(Math.floor(this.cx / 16), Math.floor(this.cy / 16));
        if (st.liquid[ti] <= 0) return;
      }
      if (Math.floor(Math.random() * is.denom) === 0) {
        const n = is.range[0] + Math.floor(Math.random() * (is.range[1] - is.range[0]));
        game.playSfxWav?.(`Zombie_${n}`, 1, this.cx, this.cy);
      }
    }
  }

  /** NPC.AnyNPCs（NPC.cs:6611-6630 子集）：场上是否存在指定 vanilla id 的存活段
   *  ——DoesntDespawnToInactivity 条件豁免（139 依赖 134 / 552-578 依赖 548）用 */
  private anyNpcAlive(game: GameHooks, id: number): boolean {
    return (game.enemies() as Enemy[]).some((e) => !e.dead && e.vanillaId === id);
  }

  /** 原版 EncourageDespawn(despawnTime)（NPC.cs:7228-7235）：timeLeft 封顶 + 置鼓励旗 */
  encourageDespawn(despawnTime: number): void {
    if (this.despawnTimer > despawnTime) this.despawnTimer = despawnTime;
    this.despawnEncouraged = true;
  }

  /** 敌怪弹幕发射辅助：从 (ox,oy) 朝 (tx,ty) 偏移方向以 speed 定速发射敌对 Dart；
   *  projId = 原版弹型（Dart.ts DART_STYLE 表,贴图/旋转/重力/加速 1:1） */
  private shootDart(game: GameHooks, ox: number, oy: number, tx: number, ty: number, speed: number, dmg: number, projId = 0): void {
    const d = Math.hypot(tx, ty) || 1;
    const dart = new Dart(ox, oy, (tx / d) * speed, (ty / d) * speed, dmg, projId);
    dart.hostile = true; // 敌怪发射弹（原版 Projectile.hostile）——联机 v5 随 msg27 bit7 下发
    (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities
      .add(dart, 'projectiles');
  }

  /** 敌怪弹幕发射辅助（原始速度向量版）：Nailhead 463 散射（NPC.cs:57611）等
   *  "速度向量已定"的发射点——shootDart 会把 (tx,ty) 归一到 speed，不适用此处。
   *  projId = 原版弹型（Dart.ts DART_STYLE 表） */
  spawnHostileProj(game: GameHooks, x: number, y: number, vx: number, vy: number, dmg: number, projId = 0): void {
    const dart = new Dart(x, y, vx, vy, dmg, projId);
    dart.hostile = true;
    (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities
      .add(dart, 'projectiles');
  }

  private groundPhysics(game: GameHooks, jumpV = 0, accel = 0.12, maxSpd = 1) {
    // 注：水中行为不在本方法——wet 减速由 npcLiquid→liqFactor 统一承担（原版
    // Collision_MoveWhileWet），浮力族（史莱姆）的弹跳漂浮在各自 AI 的 wet 段（cs:61877）
    this.applyGravity(game);
    this.vx = Math.max(-maxSpd, Math.min(maxSpd, this.vx + accel * Math.sign(this.vx || 1) * 0));
    if (jumpV && this.onGround) this.vy = -jumpV;
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.vx *= this.onGround ? 0.8 : 0.98;
  }

  /** NPCID.Sets.SlimeCanContainItems（NPCID.cs:4791）：可携带体内物品的史莱姆族 */
  private static readonly SLIME_CAN_CONTAIN_ITEMS = new Set([1, 59, 147, 184, 537]);

  /** AI_001_Slimes_GenerateItemInsideBody（NPC.cs:62150-62258）1:1：num=Next(4) 四桶；
   *  isBallooned（风气球 ai[0]==-999，:62154）→ 13 桶风筝/纸飞机。
   *  WorldGen.Skyblock.lowTiles 三处修正（:62156-62164 / :62199-62207 / :62230-62237）
   *  依赖天空盒世界——本仓无天空盒世界（NpcDrops evalCond 'SkyblockIsUp' 同判恒
   *  false）→ 跳过。case 0 default 的 netMode!=0 分支（多人 2997 虫洞药水）单人不可达 */
  private slimeGenItemInsideBody(isBallooned: boolean): number {
    const roll = (n: number) => Math.floor(Math.random() * n);              // Next(n)
    const rollR = (a: number, b: number) => a + Math.floor(Math.random() * (b - a)); // Next(a,b) 含a不含b
    let num = roll(4);
    if (isBallooned) {
      switch (roll(13)) {                                                     // :62166-62191 风筝桶
        case 1: return 4368; case 2: return 4369; case 3: return 4370; case 4: return 4371;
        case 5: return 4612; case 6: return 4674;
        case 7: case 8: case 9: return 4343;
        case 10: case 11: case 12: return 4344;
        default: return 4367;
      }
    }
    switch (num) {
      case 0:                                                                // 药水桶 :62193
        switch (roll(7)) {
          case 0: return 290;            // 迅捷
          case 1: return 292;            // 铁皮
          case 2: return 296;            // 光标
          case 3: return 2322;           // 挖矿
          default: return 2350;          // 回忆（2997 虫洞仅多人，:62200-62203）
        }
      case 1:                                                                // 火把/炸弹桶 :62196
        num = roll(4);
        return num === 0 ? 8 : num === 1 ? 965 : num === 2 ? 166 : 58;        // 火把/荧光棒/炸弹/红心
      case 2: {                                                              // 矿物桶 :62222
        if (roll(2) === 0) return rollR(11, 15);   // 11-14 铜/铁/银/金矿
        return rollR(699, 703);                    // 699-702 同序锭
      }
      default:                                                                // 钱币桶 :62239
        num = roll(3);
        return num === 0 ? 71 : num === 1 ? 72 : 73;   // 铜/银/金币（堆叠档在掉落侧）
    }
  }

  /** AI_001_Slimes 体内物品主掷段（NPC.cs:60750-60960）：首 AI 帧 ai[1]==0 且 value>0
   *  时掷内容物——先置 -1（空）再最多 num2 次机会，任一分支赋正值后即停（:60777-60781）。
   *  netID -5/-4（地牢/丛林彩装变种）整体不掷（:60815 continue），-6 额外 +4 次
   *  （:60769），-10（蜜蜂丛林变种）走 1124/1125/314/5395 特例（:60840），史莱姆雨
   *  +2 次（:60773）。跳过分支（登记）：
   *  - WorldGen.Skyblock.{lowTiles,noHellstone,noFossils,noLifeCrystals} 六处（:60757/
   *    :60806/:60813/:60822/:60827/:60859/:60892）——天空盒世界未实装恒 false
   *  - Item.GetRandomVoiceItem（:60828-60830，天空盒子分支内）——连带跳过
   *  - Main.vampireSeed（:60920-60923 地下 1/13 → 9 木头）——1.4.5 vampirism 哈希
   *    秘密种子无文本映射（SeedFlags 无位，参照 infectedSeed 预留位惯例） */
  private slimeRollContainedItem(game: GameHooks): void {
    const vid = this.vanillaId;
    if (vid === null || !Enemy.SLIME_CAN_CONTAIN_ITEMS.has(vid)) return;
    if (this.ai1 !== 0) return;                    // 已掷过：-1=空 / >0=物品（只掷一次）
    const netId = this.vanillaNetId !== 0 ? this.vanillaNetId : vid;
    const value = this.spawnedFromStatue ? 0                       // 与死亡掉落链同式（:6258 侧）
      : (netId === vid ? (this.def.value ?? npcValueOf(netId)) : npcValueOf(netId));
    if (value <= 0) return;                        // :60750 value>0 门
    const w = game.world;
    const sf = w.seedFlags;
    this.ai1 = -1;                                 // :60752 先置空
    const roll = (n: number) => Math.floor(Math.random() * n);
    let maxValue = 20;                             // :60753 主桶分母
    let maxValue2 = 40;                            // :60754 副桶分母
    let num2 = 1;                                  // :60755 掷骰次数
    // WorldGen.Skyblock.lowTiles（:60757-60768：maxValue2=20/num2+4/maxValue=15，-6 再+5）
    // ——天空盒世界未实装，跳过
    if (netId === -6) num2 += 4;                   // :60769-60772
    if (w.weather.slimeRain) num2 += 2;            // :60773-60775 Main.slimeRain
    const surfaceY = w.groundLevel;                // Main.worldSurface（tile）
    const yTile = this.y / TILE;
    const rockLayer = (y: number): boolean => (sf.remix   // WorldGen.isThisInTheRockLayer :26916
      ? (y > surfaceY && y <= w.rockLevel) : y > w.rockLevel);
    for (let i = 0; i < num2; i++) {
      if (this.ai1 !== -1) break;                  // :60777-60781 已中即停
      if (vid === 59) {                            // :60784 岩浆史莱姆
        if (sf.remix && roll(maxValue) === 0) {    // Main.remixWorld
          this.ai1 = this.slimeGenItemInsideBody(this.ai0 === -999);
        }
        // else if Skyblock.noHellstone && downedBoss3 && Next(15)==0 → 174 地狱石（:60789-60793）
        //   ——天空盒未实装跳过
      } else if (yTile > surfaceY && (vid === 147 || vid === 184)) {  // :60796 地下棘刺史莱姆
        // 两 lowTiles 子分支（:60800-60811）与普通分支同体 → 合并
        if (roll(maxValue2) === 0) this.ai1 = roll(2) === 0 ? 1103 : 593;  // 淤泥/雪块
      } else if (vid === 537) {                    // :60812 沙漠史莱姆
        // Skyblock.noFossils && Next(5)==0 → 3347 沙漠化石（:60813-60816）：天空盒未实装跳过
      } else {
        if (vid !== 1 || netId === -5 || netId === -4) continue;   // :60815 仅蓝史莱姆族
        let num4 = 500;                            // :60817 史莱姆法杖分母
        if (sf.noTraps) num4 = 20;                 // Main.noTrapsWorld
        else if (sf.getGoodWorld) num4 = 100;      // Main.getGoodWorld
        else if (this.cy < surfaceY * TILE) num4 = -1;             // 地表蓝史莱姆不掷法杖
        // isThisInTheRockLayer && (noLifeCrystals||lowTiles) && !AnyLifeCrystalSlimes() &&
        //   Next(200)==0 → 29 生命水晶（:60822-60826）：天空盒未实装跳过
        // Skyblock.lowTiles && 地下 && Next(1000)==0 → 语音物品（:60827-60830）：同上连带跳过
        const genuineParty = !!(game as unknown as { partyState?: { genuineParty?: boolean } })
          .partyState?.genuineParty;               // BirthdayParty.GenuineParty（真派对）
        if (genuineParty && this.cy < surfaceY * TILE) {            // :60831-60839 地表真派对
          this.ai1 = roll(2) === 0 ? 3736 + roll(3) : 1345;         // Next(3736,3739) 气球/彩纸
        } else if (netId === -10 && roll(20) === 0) {               // :60840-60849 蜜蜂丛林变种
          const num5 = sf.notTheBees ? roll(4) : roll(3);           // notTheBeesWorld 扩到 314/5395
          this.ai1 = num5 === 1 ? 1125 : num5 === 2 ? 314 : num5 === 3 ? 5395 : 1124;
        } else if (roll(maxValue) === 0) {                          // :60850-60854 主桶
          this.ai1 = this.slimeGenItemInsideBody(this.ai0 === -999);
        } else if (roll(maxValue2) === 0) {                         // :60855 副桶
          if (yTile <= surfaceY) {
            // Skyblock.lowTiles 表层分支（:60859-60876：194/195/62/27）：天空盒未实装跳过
            this.ai1 = 751;                        // 云块
          } else if (!rockLayer(yTile)) {                            // :60882-60887 浅地下
            const num7 = roll(3);
            this.ai1 = num7 === 1 ? 3 : num7 === 2 ? 9 : 2;         // 石/木/土
          } else if (roll(10) === 0) {
            this.ai1 = 3609;                        // :60888-60890 传送带
          } else {
            // Skyblock.lowTiles && hardMode 矿桶（:60892-60902）：天空盒未实装跳过
            const num9 = roll(4);                   // :60904-60910 深层
            this.ai1 = num9 === 1 ? 150 : num9 === 2 ? 3086 : num9 === 3 ? 3081 : 3; // 蛛网/花岗岩/大理石/石
          }
        } else if (num4 > 0 && roll(num4) === 0) {
          this.ai1 = 539;                           // :60911-60913 史莱姆法杖
        } else if (sf.getGoodWorld && yTile > surfaceY && roll(num4) === 0) {
          this.ai1 = 147;                           // :60914-60916 ftw 地下 → 棘刺丛林史莱姆物
        } else if (i === 0 && sf.remix && this.ai0 !== -999 && roll(3) === 0) {
          this.ai1 = 75;                            // :60917-60919 首掷 remix → 生命水晶星史莱姆
        }
        // Main.vampireSeed（:60920-60923）：哈希秘密种子无载体，跳过
      }
    }
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
    // ai[0]==-999：风气球挂载冻结（NPC.cs:61441 帧0不行动，位置由气球驱动）
    if (this.ai0 === -999) return;
    // ---- 体内物品掷骰（NPC.cs:60750 主掷段，只掷一次）----
    // 置于光位前：首帧即得 ai[1]（原版此段在 :60737 星史莱姆光之后，晚一帧显色）
    this.slimeRollContainedItem(game);
    // ---- 史莱姆族点光（cs:61445-61456 / :61508-61515 / :61527-61531 / :61866-61870）----
    if (this.vanillaId === 244) {
      // :61444-61456 彩虹史莱姆 = Main.Disco 三色（6 相状态机 ≈ hsl 时间色，s=1 l=0.5）
      const [dr, dg, db] = hslToRgb((visEffectFrames() / 222) % 1, 1, 0.5);
      this.lightRGB = [dr, dg, db];
    } else if (this.vanillaId === 667) {
      // :61508-61513 金史莱姆 Color(204,181,72)/255×1.1
      this.lightRGB = [(204 / 255) * 1.1, (181 / 255) * 1.1, (72 / 255) * 1.1];
    } else if (this.vanillaId === 676) {
      // :61527-61530 微光史莱姆 = TorchColor(23)（TorchID.cs:48-62 公式）
      const num = Math.min(1, Math.max(0, 0.9 + (270 - mouseTextColorApprox()) / 900));
      this.lightRGB = [num * 0.9, 0.55, num * 1.2];
    } else if (this.vanillaId === 59) {
      this.lightRGB = [1, 0.3, 0.1];                                    // :61866-61870 岩浆史莱姆
    }
    const st = game.world.store;
    const underground = this.cy / TILE > game.world.groundLevel;
    const grasshopper = this.vanillaId === 377 || this.vanillaId === 446;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    // flag3 激愤判定（:61459-61463）：!白天 || 受伤 || 地下 || ★史莱姆雨
    //  （第四项曾缺——史莱姆雨白天满血地表史莱姆应主动追人 :61462）
    const hurt = this.hp < this.maxHp;
    let flag3 = !game.world.clock.isDay || hurt || underground || !!game.world.weather.slimeRain;
    if (grasshopper) {
      // 蚱蜢（cs:61479-61483）：只有玩家 200px 内且非 wet 才激愤蹦跳，平时走路档
      flag3 = !!player && !player.dead && !inWater
        && Math.hypot(player.cx - this.cx, player.cy - this.cy) <= 200;
    }
    // ai[2] 卡墙冷却期间不索敌（L61938）
    if (this.ai2 > 0) this.ai2--;
    // 激愤时索敌：direction 朝玩家；被动时保持现方向（confused 反向走 seekDirX）
    if (flag3 && this.ai2 === 0 && player) {
      this.facing = this.seekDirX(player);
    }
    // 蚱蜢被动档（cs:61479）：无激愤时走"走路档"——0.2 慢爬不进跳循环
    if (grasshopper && !flag3) {
      this.vx += this.facing * 0.02;
      this.vx = Math.max(-0.2, Math.min(0.2, this.vx));
      this.groundPhysics(game, 0, 0.12, 1);
      return;
    }
    const dir = this.facing;
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
      // ai[0] 递增（L61954-61956：基础+1 激愤+1；蚱蜢固定 +3 整体更慢，cs:61994）
      this.ai0 += grasshopper ? 3 : 1 + (flag3 ? 1 : 0);
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
        if (grasshopper) { this.vy *= 0.9; this.vx *= 0.6; } // cs:62088-62102 蚱蜢跳力衰减
        this.jumpStartX = this.cx;  // ai[3] = position.X（L62059）
      }
    }
    // ---- 尖刺史莱姆（cs:61555-61870：184 冰/535 尖刺/204 丛林）：落地 + 有视线 + 冷却尽
    // → 单发抛物线尖刺（<200px，204 <400px；瞄准点上抬 rand(0,200) 补抛物线、速 4.5、
    // 伤 9、冷却 50t=ai[3]）；专家模式五连扇形((k-2,-4) 归一 ×4、<120px/204<200px、冷却 30t)
    // 未启用专家只做单发；射刺时 ai[0]=-40 压跳 + vx×0.9（cs:61573-61576）
    const spiked = this.vanillaId === 184 || this.vanillaId === 535 || this.vanillaId === 204;
    if (spiked && player && !player.dead && !inWater && this.onGround) {
      if (this.ai3 > 0) this.ai3 -= 1;
      const near = this.vanillaId === 204 ? 400 : 200;
      const dp = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (dp < near && this.ai3 === 0 && this.canSeePlayer(st, player)) {
        this.ai0 = -40; // 压制下一跳
        this.vx *= 0.9;
        const aimY = player.y - this.cy - Math.random() * 200;
        this.shootDart(game, this.cx, this.cy, player.cx - this.cx, aimY, 4.5, 9,
          this.vanillaId === 184 ? 174 : this.vanillaId === 204 ? 176 : 605);
        this.ai3 = 50;
      }
    }
    // ---- 史后仆从凝胶弹（cs:61668-61840：658 蓝 / 659 粉）：落地 + 有视线 + 冷却尽
    // → 单发上抛凝胶弹（658→920 蓝 / 659→921 粉）。门 = |ΔX|<500 且 |ΔY|<550 且
    // CanHit 且 velocity.Y==0（cs:61690-61694/:61747-61749）；瞄准点 Y 上抬
    // rand(0,200) 补抛物线，基速 (4.5/距)×2，距离 >350 再 ×2（658）/×1.75（659）、
    // >250 ×1.5（658）/×1.25（659）；伤 = MultiLerp(15,17,20) 经典档 15；冷却
    // 50t（658）/40t（659）；射击时 ai[0]=-40 压跳 + vx×0.9。
    // 专家分支（658 CountNPCS<5 门三星连发 920 ×(m-1,-4) 档 6 速 + 距离增益）未启用
    const queenMinion = this.vanillaId === 658 || this.vanillaId === 659;
    if (queenMinion && player && !player.dead && !inWater && this.onGround) {
      if (this.ai3 > 0) this.ai3 -= 1;
      const mdx = player.cx - this.cx;
      const mdy = player.cy - this.cy;
      const mdist = Math.hypot(mdx, mdy);
      if (Math.abs(mdx) < 500 && Math.abs(mdy) < 550 && this.ai3 === 0
        && this.canSeePlayer(st, player)) {
        this.ai0 = -40; // 压制下一跳（cs:61721/:61751）
        this.vx *= 0.9;
        const aimY = player.y - this.cy - Math.random() * 200;   // :61724/:61758
        let k = (4.5 / (Math.hypot(mdx, aimY) || 1)) * 2;        // :61726-61727
        if (mdist > 350) k *= this.vanillaId === 658 ? 2 : 1.75; // :61728-61733
        else if (mdist > 250) k *= this.vanillaId === 658 ? 1.5 : 1.25;
        // 920/921 均为 aiStyle 1 弹跳凝胶弹（Projectile.cs:8443-8457）；本仓敌弹出口
        // 统一 grav 0 直飞（shoot），上抛补偿已含在瞄准点
        shoot(game, this.cx, this.cy, mdx * k, aimY * k, 15, this.vanillaId === 658 ? 920 : 921, 240);
        this.ai3 = this.vanillaId === 658 ? 50 : 40;             // :61735/:61770
      }
    }
    // ---- wet 浮力段（cs:61877-61935 1:1，替换旧 groundPhysics buoyant 近似）----
    // 纵向碰撞(上帧 collideY) → vy=-2 上弹；上浮中 X 原地未动 → 掉头 + ai[2]=200 冷却；
    // vy>2 ×0.9、恒 -0.5 上浮、钳 -4（59 岩浆史莱姆钳 -10 且 directionY<0 追加 -0.8）
    // ——史莱姆在水中以弹跳方式漂浮，贴面上下起落（collideY 读的是上一 tick 碰撞，
    // 与原版 AI 先于 UpdateCollision 的时序一致）
    if (this.wet) {
      if (this.onGround || this.hitHead) this.vy = -2;
      if (this.vy < 0 && this.slimeWetX === this.x) {
        this.facing *= -1;
        this.ai2 = 200;
      }
      if (this.vy > 0) this.slimeWetX = this.x;
      if (this.vanillaId === 59) {
        if (this.vy > 2) this.vy *= 0.9;
        else if (this.dirY < 0) this.vy -= 0.8;
        this.vy -= 0.5;
        if (this.vy < -10) this.vy = -10;
      } else {
        if (this.vy > 2) this.vy *= 0.9;
        this.vy -= 0.5;
        if (this.vy < -4) this.vy = -4;
      }
      if (this.ai2 === 1 && flag3 && player) this.facing = this.seekDirX(player);
    }
    // 重力+碰撞（原版经由 NPC 碰撞；水中位移减速由 wet→liqFactor 统一承担）
    this.groundPhysics(game, 0, 0.12, 1);
    // AI_001 尾部颜色渐变（NPC.cs:60971 起为 slime(type 1) 专属段；
    // 此前误挂在 zombieAI——守卫 vanillaId!==1 使其全程空转，移回 slimeAI）
    this.slimeColorTick(game);
    // ---- SlimeCanContainItems 三处 ai[1] 物品变体光（NPC.cs:60737/:61152/:61289）----
    // 放染色后与原版同序（:61152 读渐变后的 this.color）。:60740 同段 dust 228 星尘
    // （1/12 帧闪烁上飘）未接——repo 粒子桶无 dust 228 语义，登记
    if (this.ai1 === 75 && this.vanillaId === 1) {
      // :60737-60740 type1 携 29 生命水晶：num=0.3 → (0.24,0.21,0.03) @ 中心格
      this.mergeLightRGB([0.8 * 0.3, 0.7 * 0.3, 0.1 * 0.3]);
    } else if (this.ai1 === 364 || this.ai1 === 1104 || this.ai1 === 365
      || this.ai1 === 1105 || this.ai1 === 366 || this.ai1 === 1106) {
      // :61152 金属矿史莱姆（钴/钯金/秘银/山铜/精金/钛金）：this.color 各通道/500
      // @ position（顶左格，非中心）——lavaImmune/防御+30/伤害×3/悬浮重力等行为段
      // （:61095-61155）属 AI_001 行为侧，本批只接光位
      const c = this.colorRGBA ?? [0, 0, 0, 0];
      this.mergeLightRGB([c[0] / 500, c[1] / 500, c[2] / 500], { x: this.x, y: this.y });
    } else if (this.ai1 === 314) {
      // :61289 草药史莱姆 (0.4,0.9,1) @ 中心格（尘 41 每帧闪烁 :61285 未接，登记）
      this.mergeLightRGB([0.4, 0.9, 1]);
    }
  }

  /** 原版 UpdateNPC_UpdateGravity（NPC.cs:91876-91953）通用重力档 1:1：
   *  ① 高空衰减（:91916-91934）：num=(maxTilesX/4200)²、num2=(y/16−(60+10·num))/
   *     (worldSurface/6) 钳 [0.25,1] → gravity×num2——空岛/太空高度下落明显变缓
   *     （worldSurface=world.groundLevel，LunarEvent.ts:143 同源换算）；
   *  ② wet 三档（:91936-91952）：0.2(水)/0.1(蜜)/0.15(微光)——原版为绝对值直替
   *     （覆盖①的高空系数），照抄 TownNPC.ts:1200 先例；落速帽 7/4/5.5 已由
   *     npcLiquid.ts 第 6 段每 tick 钳，此处不重复。
   *  特例族（258/425/426/427/576/577/541/aiStyle7-ai25 的专属重力改写）由各自
   *  AI 内自带档，不在此列。
   *  ★GRAVITY=0.4 vs 原版 0.3 偏差已登记（constants.ts）勿动：①高空系数按原版
   *  乘子直接叠加在现 GRAVITY 上；②wet 档取原版绝对值（0.2/0.1/0.15 对 0.4 基数
   *  的减速比比原版更陡——与 TownNPC 先例一致，待重力专项统一）。 */
  applyGravity(game: GameHooks) {
    let g = GRAVITY;
    // ① 高空衰减（worldSurface/6 与 (60+10num) 为原版双参，浮点同式；
    //    groundLevel<=0 的手工/测试世界无地表线 → 视作全重力，防 ÷0/NaN）
    const surf = game.world.groundLevel;
    if (surf > 0) {
      const num = (game.world.store.w / 4200) ** 2;
      let alt = (this.y / TILE - (60 + 10 * num)) / (surf / 6);
      if (alt < 0.25) alt = 0.25;
      else if (alt > 1) alt = 1;
      g *= alt;
    }
    // ② wet 三档（绝对值直替，覆盖高空系数——原版同序）
    if (this.wet) g = this.shimmerWet ? 0.15 : this.honeyWet ? 0.1 : 0.2;
    this.vy = Math.min(this.vy + g, MAX_FALL_SPEED);
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
    this.slimeColorTick(game); // 守卫 vanillaId!==1：僵尸走此路径为 no-op（1:1）
  }

  // ---- AI_001 颜色渐变（NPC.cs:60971-61105）：每 tick (c*19+target)/20 向目标色靠拢 ----
  // 优先级（:60971-60984）：底边下方一格踩到油漆（color>0 且 !=30 负相）→ 向油漆色 lerp
  //  （flag 置位，体内物品色本轮不生效）；无油漆时才回落 ai[1] 体内物品目标色表。
  private static SLIME_ITEM_COLORS: Record<number, [number, number, number, number]> = {
    751: [185, 235, 255, 100], 2: [169, 125, 93, 150], 3: [128, 128, 128, 150], 9: [229, 149, 93, 150],
    150: [193, 202, 203, 100], 3086: [59, 28, 136, 150], 3081: [138, 145, 170, 150], 147: [189, 159, 139, 150],
    29: [220, 36, 117, 125], 3609: [232, 172, 162, 150], 3736: [255, 66, 152, 125], 3737: [179, 132, 255, 125],
    3738: [0, 206, 180, 125], 1345: [200, 200, 200, 50], 5395: [198, 72, 12, 150], 1124: [255, 158, 49, 150],
    1125: [255, 156, 12, 150], 314: [79, 163, 241, 75], 364: [37, 118, 172, 100], 1104: [227, 52, 14, 100],
    365: [22, 119, 125, 100], 1105: [205, 30, 199, 100], 366: [173, 15, 13, 100], 1106: [91, 90, 119, 100],
  };

  private slimeColorTick(game: GameHooks) {
    if (this.vanillaId !== 1 || !this.colorRGBA) return;
    // ---- 踩油漆扫描（NPC.cs:60973-60983）----
    // j 自 floor(Left.X/16) 至 floor(Right.X/16)（含端点，跨格史莱姆每格各 lerp一次）；
    // num10 = floor((Bottom.Y+1)/16)（底边下一格）；门槛 = SolidTile3（:70470-70489
    // active && !inActive && tileSolid && !tileSolidTop）&& color>0 && color!=30（负相不吃）
    const st = game.world.store;
    let flag = false;
    const ty = Math.floor((this.y + this.h + 1) / TILE);
    for (let j = Math.floor(this.x / TILE); j <= Math.floor((this.x + this.w) / TILE); j++) {
      if (!st.inBounds(j, ty)) continue;
      const i = st.idx(j, ty);
      const t = st.type[i];
      // SolidTile3：非活性格/已致动/非实心/平台（tileSolidTop）都不算立足点
      if (!(st.flags[i] && t !== 0)) continue;
      if (st.wire[i] & 32) continue;                       // inActive（致动缩入）
      const d = TILE_DEFS[t];
      if (!d?.solid || d.platform) continue;
      const pc = st.paint[i];
      if (pc > 0 && pc !== 30) {
        const c = paintColor(pc);                          // WorldGen.paintColor :60979
        for (let k = 0; k < 3; k++) this.colorRGBA[k] = (this.colorRGBA[k] * 19 + c[k]) / 20;
        this.colorRGBA[3] = (this.colorRGBA[3] * 19 + 100) / 20; // :60980 alpha 目标恒 100
        flag = true;
      }
    }
    // ---- 体内物品色（NPC.cs:60984-61086：ai[1]>0 且本轮无踩漆才生效） ----
    if (this.ai1 <= 0 || flag) return;
    const t = Enemy.SLIME_ITEM_COLORS[this.ai1];
    if (!t) return;
    for (let k = 0; k < 3; k++) this.colorRGBA[k] = (this.colorRGBA[k] * 19 + t[k]) / 20;
    this.colorRGBA[3] = (this.colorRGBA[3] * 19 + t[3]) / 20;
  }

  /** AI_003_Fighters 通用核（NPC.cs:24559-24733，剥离 per-type 特例）：
   *  前方 tile 探测 + 四级跳（2 格墙 -8 / 1 格墙 -7 / 卡半格 -5 / 前方悬空且目标在上 -8 加速），
   *  加速度 0.1、最大速度 1.0（原版 num1/num2 常量），门/高门交互待移植 */
  /** AI_092 训练假人（NPC 488，NPC.cs:40871-40914）：静止站立于锚定 tile（tile 378，
   *  ai0/ai1 = 锚点 tile 坐标）；锚 tile 被破坏 → 消失。受击显示伤害数字+播声音+
   *  摇晃动画（shake = clamp(dmg,20,120)，帧由渲染层读取），永不死亡（immortal）。 */
  doorWarm = 0;            // 攻门蓄势（AI_003 ai[0]：站定累计 60）
  doorHit = 0;             // 攻门累计（AI_003 ai[1]：每 tick +5 至 10 尝试）
  doorCd = 0;              // 脱离冷却（AI_003 ai[3]=num21=30t）
  dummyShake = 0;          // localAI[0]：受击摇晃强度（20..120，每 tick -1）
  dummyHitDir = 0;         // localAI[1]：受击方向
  dummyAnchor: [number, number] | null = null;  // ai[0]/ai[1]：tile 378 锚点
  private dummyAI(game: GameHooks) {
    const st = game.world.store;
    const [ax, ay] = this.dummyAnchor ?? [-1, -1];
    // 锚 tile 378 消失 → 失活（cs:40886-40889）
    if (ax < 0 || !st.inBounds(ax, ay) || st.type[st.idx(ax, ay)] !== DUMMY_TILE_ID) {
      this.dead = true;
      return;
    }
    // 摇晃衰减（FindFrame 488 分支 cs:71516-71544 同步逻辑在渲染帧端）
    if (this.dummyShake > 0) this.dummyShake--;
    // 静止：仅重力站立
    this.applyGravity(game);
    this.vx = 0;
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.hp = this.maxHp; // immortal：血量恒满（cs:14535 lifeMax=1000 + immortal）
  }

  /** UpdateNPC_CastLights（NPC.cs:93520-93603）敌怪侧两段：发光蘑菇族闪烁蓝光 +
   *  44 不死矿工头盔灯。城镇 NPC 段（160 松露 / 209 电子人）归 TownNPC 实体不在此。
   *  蘑菇族（:93576-93588）：num9 = Next(28,42)×0.005 + (270−mouseTextColor)/500，
   *  基色 (0.1, 0.3+num9/2, 0.6+num9) × num13（634 孢子蝙蝠 0.65，其余 0.35）。 */
  private updateNpcCastLights() {
    const vid = this.vanillaId;
    if (vid === null) return;
    if ((vid >= 254 && vid <= 261) || vid === 634 || vid === 635) {
      const num9 = (28 + Math.random() * 14) * 0.005 + (270 - mouseTextColorApprox()) / 500;
      const num13 = vid === 634 ? 0.65 : 0.35;
      this.mergeLightRGB([0.1 * num13, (0.3 + num9 / 2) * num13, (0.6 + num9) * num13]);
      // 256 菌鱼与 AI_018 水母光（cs:24276）原版同帧叠加——单槽逐通道 max
    } else if (vid === 44) {
      // :93599-93602 不死矿工：(0.9, 0.75, 0.5) @ (position.x+w/2, position.y+4)
      this.lightRGB = [0.9, 0.75, 0.5];
      this.lightRGBAt = { x: this.cx, y: this.y + 4 };
    }
  }

  /** UpdateNPC_UpdateTrails TrailingMode==4（NPC.cs:91825-91841）：120 混沌元素 /
   *  137 荧光蝠 / 138 荧光史莱姆——循环体内在 position（顶左格）加 (0.3,0,0.2)。 */
  private updateNpcTrailLights() {
    const vid = this.vanillaId;
    if (vid !== 120 && vid !== 137 && vid !== 138) return;
    this.lightRGB = [0.3, 0, 0.2];
    this.lightRGBAt = { x: this.x, y: this.y };
  }

  /** debuff 自发光（NPC.cs:92181-92467，DrawNPC 前的 buff 视效段）：onFire/onFire3/
   *  daybreak/onFire2(诅咒焰) (1,0.3,0.1)、betsysCurse (0.6,0.1,0.9)、onFrostBurn/
   *  onFrostBurn2 (0.1,0.6,1)。位置 = (position.x, position.y+16)。原版同帧可与
   *  type 光叠加；本仓单槽 → 逐通道 max 合并（AI 已写 lightRGBAt 时不挪光源位） */
  /** 单槽点光的通道 max 合并：AI 已写 lightRGB 时逐通道取大（原版 AddLight 可同帧
   *  叠加，单槽下 max 最接近视觉并集）且不挪既有 lightRGBAt；空槽则直接写入 */
  private mergeLightRGB(rgb: [number, number, number], at?: { x: number; y: number }) {
    if (this.lightRGB) {
      this.lightRGB = [
        Math.max(this.lightRGB[0], rgb[0]),
        Math.max(this.lightRGB[1], rgb[1]),
        Math.max(this.lightRGB[2], rgb[2]),
      ];
    } else {
      this.lightRGB = rgb;
      if (at) this.lightRGBAt = at;
    }
  }

  private updateNpcDebuffLights() {
    let bl: [number, number, number] | null = null;
    if (this.onFireT > 0 || this.onFire3T > 0 || this.daybreakT > 0 || this.cursedT > 0) {
      bl = [1, 0.3, 0.1];
    }
    if (this.frostburnT > 0 || this.frostburn2T > 0) {
      bl = bl ? [Math.max(bl[0], 0.1), Math.max(bl[1], 0.6), Math.max(bl[2], 1)] : [0.1, 0.6, 1];
    }
    if (this.betsysCurseT > 0) {
      bl = bl ? [Math.max(bl[0], 0.6), Math.max(bl[1], 0.1), Math.max(bl[2], 0.9)] : [0.6, 0.1, 0.9];
    }
    if (bl) this.mergeLightRGB(bl, { x: this.x, y: this.y + 16 });
  }

  /** 火把僵尸 590/591 手持火把点光（NPC.cs:57309-57366，AI_003 内 type 段 1:1）。
   *  590：光源格 = floor((Center.x + dir 偏移)/16)，y 取 floor((y+6)/16)；火把格与
   *  相邻格（dir 侧）液体均须为 0。591（持械专家变体）：!wet 即亮，偏移 ±36/±28、
   *  y+24。色均 (1, 0.95, 0.8)；尘 6 号 1/30（591 另有 ai[2]==0 门）。 */
  private torchZombieLight(game: GameHooks) {
    const st = game.world.store;
    if (this.vanillaId === 590) {
      const ty = Math.floor((this.y + 6) / TILE);
      const left = this.facing < 0;           // 原版 spriteDirection < 0
      const tx = Math.floor((this.cx + (left ? -22 : 14)) / TILE);
      const near = left ? tx + 1 : tx - 1;
      if (!st.inBounds(tx, ty) || !st.inBounds(near, ty)) return;
      if (st.liquid[st.idx(tx, ty)] !== 0 || st.liquid[st.idx(near, ty)] !== 0) return;
      this.lightRGB = [1, 0.95, 0.8];
      this.lightRGBAt = { x: tx * TILE, y: ty * TILE };
      if (Math.random() * 30 < 1) {
        game.spawnParticles(this.cx + (left ? -22 : 14), this.y + 6, '#C87830', 1, 0.3, { life: 20 });
      }
      return;
    }
    // 591：wet 门（原版 Collision.WetCollision ≈ 中心格 liquid>20 近似）+ ai[2]==0 尘门
    const tx2 = Math.floor(this.cx / TILE), ty2 = Math.floor(this.cy / TILE);
    if (st.inBounds(tx2, ty2) && st.liquid[st.idx(tx2, ty2)] > 20) return;
    const left2 = this.facing < 0;
    this.lightRGB = [1, 0.95, 0.8];
    this.lightRGBAt = { x: this.cx + (left2 ? -36 : 28), y: this.y + 24 };
    if (this.ai2 === 0 && Math.random() * 30 < 1) {
      game.spawnParticles(this.cx + (left2 ? -36 : 28), this.y + 24, '#C87830', 1, 0.3, { life: 20 });
    }
  }

  /** 游泳化三族 wet 分支 1:1 —— 461 深海水怪 / 586 僵尸人鱼（AI_003 cs:56361/:56486）
   *  与 620 地精鲨（AI_107 flag27 cs:64300-64336，参数 num28/29/30=5/3/8、
   *  amount/2/3=0.05/0.04/0.1 与 461 同表）。共用结构：
   *   wet：kbResist=0、ai[3]=-0.10101（出水加速哨兵）、noGravity（本仓=跳过重力）、
   *     461 另缩盒 18×40→34×24（Center 保持）；collideX → vx=-oldVx；direction 跟 vx
   *     （620 原文是 `direction=Math.Sign(direction)` 无操作怪癖 → 保持）；
   *     有视线 → Lerp 向玩家（461/620 速 5 系数 1/20；586 速 clamp(1+|dy|/40,5,20)、
   *     vy>0 系数 1/30 否则 1/5）；无视线 → 巡航 (dir,−1) 归一 ×(5|3|8)，
   *     3 档（下坠）Lerp 1/25、5/8 档 Lerp 1/10。
   *   dry：461 复原 kbResist=0.4（难度曲线）+缩盒复原；461/586 在 ai[3]==哨兵时
   *     出水冲量：|v|×2 钳 10（586 钳 15）沿原方向。
   *  移动：本仓各 AI 自带积分——wet 时经 moveAndCollide 走 liqFactor（461/586 水 0.5；
   *  620 DD2 全速 1），与原版 UpdateCollision 语义一致。
   *  @returns true = 本 tick 已接管（调用方跳过行走/重力） */
  /** 美杜莎 480 蓄力石化（NPC.cs:56751-56889 1:1）。返回 true = 蓄力中（本 tick 接管 AI）。
   *  ai2 语义：>0 冷却递减 / 0 待机判定起手 / <0 蓄力（-(num23+num25)→0）；蓄力两段
   *  均阻尼 vx 0.9，被挑空(|vy|超阈)或受击打断回 num21；走完回 num22。
   *  低血(<1/3)：num21 180→120 / num22 300→240 / num23 180→240 / num24 60→90。
   *  发石化窗（ai2 ≥ -num23 段）：双相对视 + 距<700 + (贴脸<30 或 45°锥) + 三路视线
   *  任一通 → AddBuff(156, num24+剩余蓄力)（:56885-56888）——变身伤害/死因在 Player 过渡段 */
  private medusaChargeStep(game: GameHooks, player: Player): boolean {
    const lowHp = this.hp < this.maxHp / 3;
    const num21 = lowHp ? 120 : 180;   // 打断冷却
    const num22 = lowHp ? 240 : 300;   // 放完冷却
    const num23 = lowHp ? 240 : 180;   // 发石化窗长度
    const num24 = lowHp ? 90 : 60;     // buff 基础时长
    const num25 = 20;                  // 起手辉光段
    if (this.ai2 > 0) {
      this.ai2 -= 1;
    } else if (this.ai2 === 0) {
      // 待机起手判定（:56764-56771）：正对玩家 + 站地 + <900 + 视线
      const facing = (player.cx < this.cx && this.facing < 0) || (player.cx > this.cx && this.facing > 0);
      if (facing && this.vy === 0 && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 900
        && losClear(game, Math.floor(this.cx / TILE), Math.floor(this.cy / TILE),
          Math.floor(player.cx / TILE), Math.floor(player.cy / TILE))) {
        this.ai2 = -(num23 + num25);
      }
    } else {
      // 蓄力两段（:56778-56889）：打断/推进
      this.vx *= 0.9;
      if (this.vy < -2 || this.vy > 4 || this.justHitT > 0) {
        this.ai2 = num21;
      } else {
        this.ai2 += 1;
        if (this.ai2 === 0) this.ai2 = num22;
      }
      this.lightRGB = [0.9, 0.75, 0.1];          // :56816/:56820 蓄力点光——曾误写 0-255 标度致 254× 过曝
      const rem = this.ai2 + num23 + num25;      // 起手辉光段计时（:56798 num26）
      if (rem === 1) game.playSfxFile?.('Item_17', 1, this.cx, this.cy); // SoundID 4-17(充能)
      if (rem < num25) {
        // 充能尘（:56801-56813 尘 228 头顶环;num26<num25 含首 tick 0）
        const hx = this.cx + this.facing * 6, hy = this.y + 6;
        game.spawnParticles(hx, hy, '#E8A040', 2, 1.6);
      }
      if (this.ai2 >= -num23) {
        // 发石化窗（:56835-56888）：尘 + 直击判定
        const n29 = this.ai2 + num23;
        if (n29 < 180 && (Math.random() < 1 / 3 || this.ai2 % 3 === 0)) { // :56844 num29<180 含 0
          const hx = this.cx + this.facing * 10, hy = this.y + 10;
          game.spawnParticles(hx, hy, '#E8A040', 1, 2.4);
        }
        if (!player.dead && !player.buffs.has(BuffType.Stoned)) {
          const dx = player.cx - this.cx, dy = player.cy - this.cy;
          const dist = Math.hypot(dx, dy);
          if (dist < 700) {
            let hit = dist < 30;                                    // 贴脸必中（:56866）
            if (!hit) {
              // 45° 锥（:56870-56877）：|单位向量 X| > cos(45°) → 视为正面
              const ux = dx / dist;
              hit = ux > 0.7071 || ux < -0.7071;
            }
            const mutualFacing = (player.cx < this.cx && this.facing < 0 && player.facing > 0)
              || (player.cx > this.cx && this.facing > 0 && player.facing < 0);
            if (hit && mutualFacing) {
              // 三路视线任一通（:56880-56882：头/上 16px/下 8px）
              const sees = (ox: number, oy: number) => losClear(game,
                Math.floor((this.cx + ox) / TILE), Math.floor((this.cy + oy) / TILE),
                Math.floor(player.cx / TILE), Math.floor(player.cy / TILE));
              if (sees(0, 0) || sees(0, -16) || sees(0, 8)) {
                player.buffs.apply(BuffType.Stoned, (num24 + Math.trunc(-this.ai2)) / 60);
              }
            }
          }
        }
      }
      // 蓄力期接管 AI_003 余段（原版两段末尾 return）
      this.x += this.vx; this.y += this.vy;
      return true;
    }
    return false;
  }

  private wetSwimStep(game: GameHooks, player: Player | null, mode: 461 | 586 | 620): boolean {
    if (!this.wet) {
      // ---- 出水复原（461 :56409-56440 / 586 :56536-56558）----
      if (mode === 461) {
        this.kbResistOverride = getKnockbackMultiplierScaledByDifficulty(0.4, this.difficulty);
        const cx = this.cx, cy = this.cy;
        this.w = 18; this.h = 40;
        this.x = cx - this.w / 2; this.y = cy - this.h / 2;
      } else {
        this.kbResistOverride = null;
      }
      if (this.ai3 === -0.10101) {
        this.ai3 = 0;
        let spd = Math.hypot(this.vx, this.vy) * 2;
        if (spd > (mode === 586 ? 15 : 10)) spd = mode === 586 ? 15 : 10;
        const l = Math.hypot(this.vx, this.vy);
        if (l > 0) { this.vx = (this.vx / l) * spd; this.vy = (this.vy / l) * spd; }
        if (this.vx < 0) this.facing = -1;
        if (this.vx > 0) this.facing = 1;
      }
      return false;
    }
    // ---- 入水游泳 ----
    this.kbResistOverride = 0;                                 // knockBackResist = 0f
    this.ai3 = -0.10101;                                       // 出水冲量哨兵
    if (mode === 461) {
      // 缩盒 34×24（Center 保持，:56369-56373）
      const cx = this.cx, cy = this.cy;
      this.w = 34; this.h = 24;
      this.x = cx - this.w / 2; this.y = cy - this.h / 2;
    }
    if (player && !player.dead) this.facing = this.seekDirX(player);  // TargetClosest
    if (this.hitWall) this.vx = -this.vx;                      // collideX → -oldVelocity.X
    if (mode !== 620) {                                        // 620 保持 direction（原文怪癖）
      if (this.vx < 0) this.facing = -1;
      if (this.vx > 0) this.facing = 1;
    }
    const sees = !!player && !player.dead && this.canSeePlayer(game.world.store, player);
    if (sees) {
      const dx = player!.cx - this.cx, dy = player!.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      let spd = 5;
      let k = 1 / 20;                                          // 461/620 amount=0.05
      if (mode === 586) {
        spd = 1 + Math.abs(this.cy - player!.cy) / 40;         // num8（:56503-56506）
        spd = Math.max(5, Math.min(20, spd));
        k = this.vy > 0 ? 1 / 30 : 1 / 5;                      // :56511-56516
      }
      const tx = (dx / d) * spd, ty = (dy / d) * spd;
      this.vx += (tx - this.vx) * k;
      this.vy += (ty - this.vy) * k;
      moveAndCollide(this, game.world, this.vx, this.vy);
      return true;
    }
    // 无视线：斜上巡航（:56388-56405 / :56519-56536 / :64321-64336）
    let cruise = 5;
    if (this.vy > 0) cruise = 3;
    if (this.vy < 0) cruise = 8;
    const k2 = cruise < 5 ? 1 / 25 : 1 / 10;
    const l = Math.hypot(this.facing, -1) || 1;
    const tx2 = (this.facing / l) * cruise, ty2 = (-1 / l) * cruise;
    this.vx += (tx2 - this.vx) * k2;
    this.vy += (ty2 - this.vy) * k2;
    moveAndCollide(this, game.world, this.vx, this.vy);
    return true;
  }

  private fighterAI(game: GameHooks, player: Player | null) {    const st = game.world.store;
    // ---- AI_003 尾段点光（cs:58802-58823，恒亮；放函数头防各 type 分支提前 return 漏写）----
    const vidF = this.vanillaId ?? -1;
    if (vidF >= 277 && vidF <= 280) {
      this.lightRGB = [0.2, 0.1, 0];                                   // :58802-58804 地牢骷髅四族
    } else if (vidF === 520) {
      this.lightRGB = [0.3, 0.3, 0.7];                                 // :58806-58808 火星行者 Top+20
      this.lightRGBAt = { x: this.cx, y: this.y + 20 };
    } else if (vidF === 525) {
      this.lightRGB = [0.35, 0.5, 0.1];                                // :58810-58813 腐化沙鬼 Top+15
      this.lightRGBAt = { x: this.cx, y: this.y + 15 };
    } else if (vidF === 526) {
      this.lightRGB = [0.4, 0.4, 0.2];                                 // :58815-58818 猩红沙鬼 Top+15
      this.lightRGBAt = { x: this.cx, y: this.y + 15 };
    } else if (vidF === 527) {
      this.lightRGB = [0.24, 0.12, 0.4];                               // :58820-58823 圣域沙鬼 Top+15
      this.lightRGBAt = { x: this.cx, y: this.y + 15 };
    }
    // 游泳化双族 461/586（AI_003_Fighters cs:56361/:56486）：块在通用行走与白天驱散
    // （cs:57732，位于其后）之前，wet 时整段接管本 tick——故 hook 在函数最前
    if (this.vanillaId === 461 || this.vanillaId === 586) {
      if (this.wetSwimStep(game, player, this.vanillaId as 461 | 586)) return;
    }
    // 美杜莎 480 蓄力石化（NPC.cs:56751-56889,位于 AI_003 通用行走之后——行走段先跑,
    //  蓄力期行走被本块 velocity.X*=0.9 阻尼近似）。ai2: >0 冷却递减 / 0 蓄机判定 /
    //  <-(num23+num25) 起手辉光 / >=-num23 发石化窗;贴脸|45°锥内|双向对视|视线通→
    //  AddBuff(156, num24+剩余蓄力)——变身瞬间伤害/死因在 Player 石化过渡段
    if (this.vanillaId === 480 && player) {
      if (this.medusaChargeStep(game, player)) return;
    }
    // ---- Psycho 466 潜伏突袭（NPC.cs:56290-56326，AI_003 最前段——先于白天驱散）：
    // 潜伏/显形两分支 return 跳过本 tick 余段（helper 自补重力+碰撞）
    if (psychoStealthStep(this, game, player)) return;
    // ---- 白天地表驱散（cs:57732-57775 + NotDiscouraged :60694）：
    // 白天 && y<worldSurface && 类型不在昼行豁免表 → 停止索敌 + EncourageDespawn(10)，
    // 沿原方向游荡（站定 2t 转向），离屏后由 CheckActive ~10t 清除。
    // ★日食豁免（:60694 首条件 !Main.eclipse）：日食期间全体战士族不被驱散——
    // 日食怪（Eyezor/Psycho/Nailhead/Butcher/Possessed/Fritz/Dr Man Fly）都是白天
    // 刷的，缺此门会一出生就停止索敌游荡离场。
    // 墓地豁免（:60698 `!Main.player[npcInstance.target].ZoneGraveyard`）：目标玩家在
    // 墓地时白天不驱散——墓地白天刷出的僵尸/蛆僵尸白天照常索敌（scene 为本地玩家
    // 快照，单人下与"目标玩家所在区"等价）
    const daySurface = game.world.clock.isDay && !game.world.clock.eclipse
      && this.cy < game.world.groundLevel * TILE
      && !game.world.scene?.zoneGraveyard;
    const dayActive = this.vanillaId != null
      && (FIGHTER_DAY_ACTIVE.has(this.vanillaId)
        || (game.world.invasionType === 4 && MARTIAN_DAY_ACTIVE.has(this.vanillaId)));
    const discouraged = daySurface && !dayActive;
    if (discouraged) {
      this.encourageDespawn(10);
      // 游荡转向（原版 else 分支 ：57783-57797：站定累计 2t 反转 direction）
      if (Math.abs(this.vx) < 0.1 && this.vy === 0) {
        this.state += 1;
        if (this.state >= 2) { this.facing *= -1; this.state = 0; }
      } else {
        this.state = 0;
      }
      if (this.facing === 0) this.facing = 1;
    } else if (player) {
      // 方向：朝玩家（无玩家则保持）；confused 反向（TargetClosest :78569）
      this.facing = this.seekDirX(player);
    }
    // ---- 419 日耀旋刃怪（AI_003_Fighters cs:57114-57173 type==419 段）：旋刃冲刺
    //  状态机。该段位于原版通用行走段之前，各分支 return 跳过本 tick 行走/跳跃/远程——
    //  helper 返回 true = 已自管重力+碰撞，调用方直接收尾
    if (this.vanillaId === 419 && player && !player.dead && this.solenianDashAI(game, player)) {
      return;
    }
    const dir = this.facing;
    // 前方探测点（L24561-24562）：体中心前 15px、脚底上 15px
    const fx = Math.floor((this.x + this.w / 2 + 15 * dir) / TILE);
    const fy = Math.floor((this.y + this.h - 15) / TILE);
    const solidAt = (x: number, y: number) => x >= 0 && y >= 0 && x < st.w && y < st.h && st.isSolid(x, y);
    // 沼泽怪 166 伏击（NPC.cs:56327-56360）：伏击态接管本 tick（原地减速，跳过行走）
    if (swampThingAmbushStep(this, !!player && this.canSeePlayer(st, player))) return;
    // 混沌元素 120（NPC.cs:57431-57460/:60679-60696）：ai[3] 卡死计数 + 传送
    if (this.vanillaId === 120 && player) this.ai3 = chaosElementalStep(this, game, player);
    // ---- 日食怪战士族专属段（NPC.cs:57547-57710，位于卡死计数与横向移动链之间）----
    // Nailhead 463 受击散射（:57547-57613）；Butcher 460 空中免击退（:57615-57624）；
    // Possessed 469 爬墙冲刺（:57626-57677，冲刺分支 return 跳过余段）；
    // Fritz 462 跳扑（:57678-57710，改 vx/vy 后继续走本 tick 行走）
    nailheadHitScatter(this, game, player);
    butcherKbStep(this);
    if (possessedStep(this, game, player)) return;
    fritzPounceStep(this, player);
    // 横向移动逐族表（NPC.cs:57799-58800 else-if 链 1:1，fighterFamilies.ts）——
    // 取代一期固定档（加速 0.1 / 限速 ±1）；射击族（:58719 排除表）链上无分支
    fighterMoveStep(this, dir, player);
    // 425 风暴潜水员专属段（NPC.cs:58865-59013，原版独立第二段 if/else-if 阶梯，
    // 位于移动链之后/重力之前）：喷包伺服 + 起飞门 + ai3 瞄准蓄力（stormDiverAimStep
    // 计数节奏）——ai3 专用于蓄力，不再与任何通用计数共用（Renderer.npcGlowSparkleEnvelope 消费）
    stormDiverStep(this, game, player);
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
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    // ---- 四级跳判定（L24651-24733）：仅在朝移动方向撞到东西时 ----
    // 原版全部跳跃赋值都有 velocity.Y == 0f 前置（AI_003 内 44 处同款门）——
    // 缺失此门时空中贴墙每帧 vy=-8 → 沿墙飞天贴天花板（主角靠近才掉落）
    const movingInto = vxSign === dir && vxSign !== 0 && this.vy === 0;
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
    // ---- 门交互（AI_003 :64716-64780 攻门态语义 + AI_007 :60390-60460 不放弃门）----
    // 前方脚上一格是关闭的门（sheet 10）→ 攻门：先 60t 站定蓄势（ai[0]），后每
    // tick +5（tall gate 388 +2）累计至 10 → 尝试开门（失败 30t 脱离 ai[3]=num21）；
    // 血月/墓园不脱离（AI_007 flag27 反义：(!bloodMoon||getGoodWorld)&&!graveyard），
    // 持续攻门直到开出；GoblinPeon 26 直接拆门（KillTile → 掉门物品）。
    // ★:60383 flag8 门（NPC.cs:57462-57471 表）：Psycho 466/Possessed 469/Eyezor 251/
    // Dr Man Fly 468/沼泽怪 166/美杜莎 480 等表内型原版**不攻门**。
    if (this.doorCd > 0) {
      this.doorCd--;
    } else if (this.vanillaId == null || FIGHTER_NO_DOOR.has(this.vanillaId)) {
      // flag8=false 族：原版整个攻门段被 `&& flag8` 短路（doorWarm/doorHit 也不累计）
    } else if (this.vy === 0 && dir !== 0 && vxSign === dir) {
      const dtx = fx, dty = fy - 1;
      if (st.inBounds(dtx, dty) && st.flags[st.idx(dtx, dty)]) {
        const dDef = TILE_DEFS[st.type[st.idx(dtx, dty)]];
        if (dDef?.vanilla?.sheet === 10) {
          this.doorWarm = (this.doorWarm ?? 0) + 1;
          this.vx *= 0.7; // 攻门贴门减速（velocity.X = 0.5×-direction 语义近似）
          if (this.doorWarm >= 60) {
            this.doorHit = (this.doorHit ?? 0) + 5;
            if (this.doorHit >= 10) {
              this.doorHit = 0;
              if (this.vanillaId === 26) {
                game.breakTile?.(dtx, dty); // GoblinPeon 拆门（:60439-60444）
                this.doorWarm = 0;
              } else if (!openDoor(st, dtx, dty, dir)) {
                const clock = game.world.clock;
                if (!clock.bloodMoon && !game.world.scene?.zoneGraveyard) {
                  this.doorCd = 30; // 非血月：一次失败即脱离 30t（:60447-60450）
                }
              } else {
                this.doorWarm = 0; // 开出 → 重新蓄势
              }
            }
          }
        } else {
          this.doorWarm = 0;
          this.doorHit = 0;
        }
      }
    }
    // ---- 蜘蛛上墙形态切换（NPC.cs:59273-59293）：站定（velocity.Y==0）且身边有
    // 背景墙（NPCCanStickToWalls）→ Transform 成爬墙形态（164→165 等）——
    // 蜘蛛洞里贴墙爬的就是这一步，地表无背景墙自然不触发
    if (this.vy === 0 && this.vanillaId != null) {
      const wallForm = Enemy.SPIDER_WALL_FORM[this.vanillaId];
      if (wallForm !== undefined && this.npcCanStickToWalls(st)) {
        this.tryTransformTo(wallForm, st, false, game);
      }
    }
    // ---- 吸血鬼离远 → 化回蝙蝠（cs:59236-59244：type 159 距玩家 >300 → Transform(158)）
    if (this.vanillaId === 159 && player
      && Math.hypot(player.cx - this.cx, player.cy - this.cy) > 300) {
      this.tryTransformTo(158, st, false, game);
    }
    // ---- 蜥蜴人激怒（cs:57422-57425：type 198 HP≤55% → Transform(199 LihzahrdCrawler)，
    //  爬行姿态更快更狠；同段的 Nutcracker 348→349 霜月未引入不移植）
    if (this.vanillaId === 198 && this.hp <= this.maxHp * 0.55) {
      this.tryTransformTo(199, st, false, game);
    }
    // 地面摩擦：原版 walker 摩擦链已在 fighterMoveStep（fighterFamilies.ts）1:1
    // （AI_003_Fighters :60115-60175——num3 档 velocity×damp【双轴】、vy==0 落地门、
    // 仅 |vx|>max 超速段衰减,逐族 damp 0.7/0.8/0.95…;未超速段是 +=accel 钳 ±max）;
    // 坡面逐面链（Collision.SlopeCollision :1796-2036 贴合/受阻清零）在
    // TileCollision.slopeCollide。此处的 onGround ×0.85 是 slope 系统落地前的
    // 陈旧近似,与 damp 叠乘成双阻尼（超速段 0.8×0.85,匀速段把平衡点压到
    // accel/(1-0.85)≈0.47px/t,远低于原版 max 1-1.5）——2026-08-15 摘除回归单链
    // ---- 战士族远程攻击（NPC.cs:59464-60085：落地 + 视线 + 距离<射程 → 举枪蓄力，
    // 半程发射；justHit 打断蓄力 cs:59489。覆盖入侵弓手 + 地牢/沙漠常驻射击怪）----
    // ai[1]=蓄力倒数(ai0)、ai[2]=瞄准姿态(ai3)
    if (player && this.vanillaId != null && Enemy.RANGED_FIGHTERS.has(this.vanillaId)) {
      const R = Enemy.RANGED_TABLE[this.vanillaId];
      const fireAt = R.burst ? R.cooldown - 1 : R.cooldown >> 1; // 292 在 num163-1 连发（cs:59967）
      const spread = R.spread ?? 40;
      // num168 下坠补偿（cs:60046）：定值或每发 [lo,hi] 区间随机（468 :59727-59730）
      const dropOf = () => Array.isArray(R.drop)
        ? R.drop[0] + Math.random() * (R.drop[1] - R.drop[0])
        : (R.drop ?? 0.1);
      // 解除瞄准门的"下坠补偿 > 0"判定（cs:60015 !flag17）——区间型取上界判定
      const dropCanDrop = Array.isArray(R.drop) ? R.drop[1] > 0 : (R.drop ?? 0.1) > 0;
      // :60020-60024 瞄准减速 vx×0.9——flag16=true 族跳过（468 非日食 :60026-60029）
      const aimDecel = !(R.aimDecelOffEclipse && !game.world.clock.eclipse);
      if (this.ai3 > 0) {           // 瞄准中：减速 + 半程发射
        if (this.ai0 > 0) this.ai0--;
        if (aimDecel) this.vx *= 0.9;
        this.facing = this.seekDirX(player);
        if (this.ai0 === fireAt && this.ai0 > 0) {
          const ox = this.cx, oy = this.cy + (R.oy ?? 0);
          const shots = R.burst ?? 1;
          for (let b = 0; b < shots; b++) {
            // 预判点（cs:59700-59790）：目标中心 + 下坠补偿（默认 |dx|×0.1，各 type 修正）
            // + 散布（默认 ±40，291 狙击 ±8）——弹体直飞（Dart 敌我对全敌对）
            let tx = player.cx - ox;
            let ty = player.cy - oy - Math.abs(tx) * dropOf();
            tx += Math.random() * spread * 2 - spread;
            ty += Math.random() * spread * 2 - spread;
            this.shootDart(game, ox, oy, tx, ty, R.speed, R.dmg, R.proj);
          }
        }
        // 移动/冷却尽 → 解除瞄准（cs:60005-60009）
        if ((this.vy !== 0 && dropCanDrop) || this.ai0 <= 0) { this.ai3 = 0; this.ai0 = 0; }
      } else if (this.vy === 0 && this.ai0 <= 0 && !player.dead && this.onGround) {
        // 开瞄（cs:60013-60095）：视线 + 距离 < 射程。
        // ★ cs:60036-60039 idle 门：目标玩家待机（原版 stealth==0 && itemAnimation==0，
        //   此处 useTime>0 近似——挥击重启已对齐原版时序，战斗中恒 >0）→ 视线判 false，不开瞄
        const dx = player.cx - this.cx, dy = player.cy - this.cy;
        let los = player.useTime > 0;
        const steps = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
        for (let s = 1; s < steps && los; s++) {
          const lx = Math.floor((this.cx + (dx * s) / steps) / TILE);
          const ly = Math.floor((this.cy + (dy * s) / steps) / TILE);
          if (lx >= 0 && ly >= 0 && lx < st.w && ly < st.h && solidAt(lx, ly)) { los = false; break; }
        }
        if (los && Math.hypot(dx, dy) < R.range) {
          this.ai3 = 3;               // 姿态（cs:60080 起的 1-5 分档，本处仅作标记）
          this.ai0 = R.cooldown;
          this.vx *= 0.5;
        }
      }
    }
    // ---- 冰雪巨人 243 霜冻光束（cs:59331-59360）：ai[2] 计时 ≥ rand(30..900)×(HP 比)+30
    // 且落地 + 朝向玩家 + 视线 → 光束（速 15、伤 32、散布 ±40）；阈值随机数缓存 ai[3]，
    // 发射后双双清零（受击 ai[2]-=rand(30) 略）
    if (this.vanillaId === 243 && player && !player.dead) {
      this.ai2 += 1;
      if (this.ai3 === 0) this.ai3 = 30 + Math.floor(Math.random() * 870);
      if (this.vy === 0 && this.facing === (player.cx > this.cx ? 1 : -1)
        && this.ai2 >= this.ai3 * (this.hp / this.maxHp) + 30 && this.canSeePlayer(st, player)) {
        // 枪口（cs:59323/:59340）：基点 (cx + 10×朝向, y + 20) 瞄准（含 ±40 散布），
        // 出生点再沿弹向 +vel×3（速 15 → 前移 45px）
        const baseX = this.cx + 10 * this.facing, baseY = this.y + 20;
        const bdx = player.cx - baseX + (Math.random() * 80 - 40);
        const bdy = player.cy - baseY + (Math.random() * 80 - 40);
        const bd = Math.hypot(bdx, bdy) || 1;
        this.shootDart(game, baseX + (bdx / bd) * 45, baseY + (bdy / bd) * 45,
          bdx, bdy, 15, 32, 257);
        this.ai2 = 0; this.ai3 = 0;
        return;
      }
    }
    // ---- 岩石巨人 631 投石（cs:56733-56760）：320px 内 + 视线 → 100 帧前摇，
    // 第 68 帧发射岩石（速 8±0.8、伤 20）；脱距重置前摇
    if (this.vanillaId === 631 && player && !player.dead) {
      const dg = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (dg < 320 && this.canSeePlayer(st, player)) {
        this.ai2 += 1;
        if (this.ai2 === 68) {
          const jit = 8 + (Math.random() * 1.6 - 0.8); // ±0.8
          this.shootDart(game, this.cx, this.cy - 8, player.cx - this.cx, player.cy - this.cy, jit, 20, 909);
        }
        if (this.ai2 >= 100) this.ai2 = 0;
      } else this.ai2 = 0;
    }
    // ---- Eyezor 251 死光（NPC.cs:59335-59378：独立 type 段，**不在**通用射击族
    // （:59464 表无 251）；ai[2] 每 tick +1（:59349），justHit 倒扣 rand(30)（:59337），
    // confused 清零（:59345），负值钳 0（:59341）。阈值 = rand(60..1799)×(HP比)+15
    // （:59350-59352 每次判定重掷）。命中门：计时达标 + 落地 + 玩家存活且未冰冻
    // （:59353 !Main.player[target].frozen = buff 47）+ 朝向玩家 + CanHit；再过
    // <700px 距离门（:59363-59364）→ EyeLaser 83（速 15 伤 30；枪口
    // (Center.X + 6×direction, position.Y + 12)，瞄准 + 散布 ±40 / Y −30..−1，
    // 出生点沿弹向 +vel×3）；发射后 ai[2]=0（:59374）
    if (this.vanillaId === 251 && player) {
      if (this.justHit) this.ai2 -= Math.floor(Math.random() * 30);      // :59337-59340
      if (this.ai2 < 0) this.ai2 = 0;                                    // :59341-59344
      if (this.confused) this.ai2 = 0;                                   // :59345-59348
      this.ai2 += 1;                                                     // :59349
      // num142（:59350-59352）：rand(60,1800) × (life/lifeMax) + 15
      const num142 = (60 + Math.floor(Math.random() * 1740)) * (this.hp / this.maxHp) + 15;
      const facingPlayer = (this.facing > 0 && this.cx < player.cx)
        || (this.facing < 0 && this.cx > player.cx);                     // :59353 direction 锥
      if (this.ai2 >= num142 && this.vy === 0 && !player.dead
        && !player.buffs?.has(BuffType.Frozen)                           // :59353 !frozen
        && facingPlayer && this.canSeePlayer(st, player)) {
        // 枪口（:59356-59357）：(Center.X + 6×direction, position.Y + 12)
        const mx = this.cx + 6 * this.facing, my = this.y + 12;
        let num144 = player.cx - mx + (Math.random() * 82 - 41);         // :59358/:59360 ±41
        let num145 = player.cy - my + (Math.floor(Math.random() * 30) - 30); // :59359/:59361 −30..−1
        const num146 = Math.hypot(num144, num145);                       // :59362
        if (num146 < 700) {                                              // :59363-59364 距离门
          const num143 = 15;                                             // :59355 弹速
          // 出生点沿弹向 +vel×3（:59371-59372）
          const u = num146 || 1;
          this.shootDart(game, mx + (num144 / u) * num143 * 3, my + (num145 / u) * num143 * 3,
            num144, num145, num143, 30, 83);                             // :59373 proj 83 伤 30
          this.ai2 = 0;                                                  // :59374
        }
      }
    }
  }

  /** 419 日耀旋刃怪冲刺（NPC.cs:57114-57173，AI_003_Fighters 内 type==419 专属段，
   *  位于通用行走段之前——各分支 return 跳过行走/跳跃/远程，仅留全局重力+碰撞）。
   *  ai[2] 状态机（num40=6 / num41=10 / num42=16）：
   *    >0   落地恢复倒数（触地或受击置 60）
   *    0    巡航：面朝玩家 + 视线 → -1（本 tick 仍走通用段，cs 无 return）
   *    -1..-6  蓄力：vx×0.9
   *    -7   发射：朝 player.Top+(0,-30) 方向 ×16
   *    <-7  冲刺：-17 起 vy+0.15 钳 24（前 10t 无重力增量）；反射弹幕 + 受击 ×3
   *  拖尾渲染（ai2≤-9 oldPos 拖尾）已就位：Renderer NPC_GLOW[419] mode 'trail'。
   *  @returns true = 冲刺族本 tick 已自管重力+碰撞，调用方应跳过通用战士段 */
  private solenianDashAI(game: GameHooks, player: Player): boolean {
    const WINDUP = 6;    // num40：蓄力 tick 数（-1..-6）
    const DASH_SPEED = 16; // num42：冲刺初速
    this.reflectsProjectiles = false;
    this.takenDamageMultiplier = 1;
    if (this.ai2 > 0) this.ai2 -= 1;
    if (this.ai2 === 0) {
      // 巡航待发（cs:57124-57131）：面朝玩家（direction 与玩家水平侧一致）+ 中心视线
      if (((player.cx < this.cx && this.facing < 0) || (player.cx > this.cx && this.facing > 0))
        && this.canSeePlayer(game.world.store, player)) {
        this.ai2 = -1;
      }
      return false;   // 未触发/刚起手 → 本 tick 走通用行走段（cs 该分支无 return）
    }
    if (this.ai2 < 0 && this.ai2 > -WINDUP) {
      // 蓄力减速（cs:57135-57140）
      this.ai2 -= 1;
      this.vx *= 0.9;
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return true;
    }
    if (this.ai2 === -WINDUP) {
      // 发射（cs:57141-57152）：朝玩家头顶上方 30px 直冲；零向量退化 (spriteDirection,-1)
      this.ai2 -= 1;
      let dx = player.cx - this.cx;
      let dy = (player.y - 30) - this.cy;   // player.Top + (0,-30)
      let d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = this.facing || 1; dy = -1; d = Math.hypot(dx, dy); }
      this.vx = (dx / d) * DASH_SPEED;
      this.vy = (dy / d) * DASH_SPEED;
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return true;
    }
    // 冲刺（ai2 < -6，cs:57153-57172）
    this.ai2 -= 1;
    // 落地判定读上一 tick 碰撞结果（原版 velocity.Y==0f 是碰撞后清零值）
    if (this.vy === 0) this.ai2 = 60;
    else if (this.ai2 < -WINDUP - 10) this.vy = Math.min(this.vy + 0.15, 24); // num41=10
    this.reflectsProjectiles = true;
    this.takenDamageMultiplier = 3;
    if (this.justHit) this.ai2 = 60;
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    return true;
  }

  /** AI_003 远程战士参数（NPC.cs:59464-60095 各 type 修正汇总）：
   *  cooldown=蓄力时长（num163，半程发射 num165）/ speed=弹速（num166）/
   *  dmg=弹伤（num171）/ range=开瞄距离（num181 默认 700）/
   *  drop=下坠补偿系数（num168，默认 0.1；0=直射；[lo,hi] = 每发 rand(lo..hi)）/
   *  spread=散布 ±px（num167 后修正）/ oy=枪口 Y 偏移 / burst=连发数（292 战术骷髅
   *  ×4 各自重新瞄准，cs:59967）/ aimDecelOffEclipse=非日食不因瞄准减速（468
   *  :60026-60029 flag16 门） */
  private static readonly RANGED_FIGHTERS = new Set([
    111, 214, 215, 216,                       // 入侵：哥布林弓手/海盗三件
    110, 206, 290, 291, 292, 293,             // 骷髅弓手/冰鱼人/圣骑士/神射/战术/爆破
    449, 450, 451, 452, 481,                  // 投骨骷髅×4/希腊骷髅
    498, 499, 500, 501, 502, 503, 504, 505, 506, // 蝾螈族
    379, 380,                                 // 拜月教弓手（cs:56575 仪式待机解除后射击，num163=80）
    468,                                      // 蝇博士 Dr. Man Fly（日食，cs:59464 表内）
  ]);
  private static readonly RANGED_TABLE: Record<number, {
    cooldown: number; speed: number; dmg: number; range: number;
    drop?: number | [number, number]; spread?: number; oy?: number; burst?: number;
    aimDecelOffEclipse?: boolean;
    /** 原版弹型（NPC.cs:59797 起各 num172：贴图/旋转/重力见 Dart.ts DART_STYLE） */
    proj: number;
  }> = {
    111: { cooldown: 180, speed: 9, dmg: 11, range: 700, drop: 0.1, proj: 81 },
    379: { cooldown: 80, speed: 11, dmg: 35, range: 700, drop: 0.1, proj: 81 },  // 拜月教弓手（cs:59494/59609/59797/59823 修正后值,弹 WoodenArrowHostile 81）
    380: { cooldown: 80, speed: 11, dmg: 35, range: 700, drop: 0.1, proj: 81 },
    214: { cooldown: 50, speed: 10, dmg: 25, range: 500, drop: 0, spread: 45, proj: 180 },
    215: { cooldown: 90, speed: 14, dmg: 35, range: 650, drop: 0.08, proj: 82 },
    216: { cooldown: 180, speed: 9, dmg: 30, range: 700, drop: 0.1, proj: 180 },
    110: { cooldown: 70, speed: 11, dmg: 35, range: 700, drop: 0.1, proj: 82 },          // 骷髅弓手 火焰箭
    206: { cooldown: 50, speed: 7, dmg: 37, range: 700, drop: 0.1, oy: -10, proj: 177 },  // 冰鱼人 冰水吐息
    290: { cooldown: 30, speed: 9, dmg: 60, range: 700, drop: 0, oy: -10, proj: 300 },    // 圣骑士 圣锤
    291: { cooldown: 200, speed: 4, dmg: 100, range: 700, drop: 0, spread: 8, proj: 302 },// 骷髅神射 狙击弹
    292: { cooldown: 120, speed: 12, dmg: 50, range: 700, drop: 0, burst: 4, proj: 180 }, // 战术骷髅 4 连弹
    293: { cooldown: 90, speed: 4, dmg: 60, range: 700, drop: 0.1, proj: 303 },           // 骷髅爆破 火箭
    449: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16, proj: 471 }, // 投骨骷髅（drop 原版 rand 0.10-0.49）
    450: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16, proj: 471 },
    451: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16, proj: 471 },
    452: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16, proj: 471 },
    481: { cooldown: 100, speed: 8, dmg: 18, range: 400, drop: 0, spread: 16, oy: -14, proj: 508 }, // 希腊骷髅 标枪（drop 原版 ±0.035 随机）
    498: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 }, // 蝾螈吐息
    499: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    500: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    501: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    502: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    503: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    504: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    505: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    506: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8, proj: 572 },
    // 蝇博士 Dr. Man Fly（cs:59493 num163=70 默认 / :59662-59665 num166=7.5 /
    // :59727-59730 num168=rand(10..49)×0.01 / :59815-59818 num171=50 /
    // :59861-59864 num172=501 / :60072-60075 num181=400；:60026-60029 非日食不减速）
    468: { cooldown: 70, speed: 7.5, dmg: 50, range: 400, drop: [0.1, 0.49], spread: 40,
      proj: 501, aimDecelOffEclipse: true },
  };

  /** 蜘蛛家族地面↔爬墙形态对照（NPC.cs:59276-59289 地→墙 / :29994-30008 墙→地）：
   *  164 Wall Creeper→165 Wall Creeper Wall、236→237 Black Recluse、163→238、239→240、530→531 */
  private static readonly SPIDER_WALL_FORM: Record<number, number> = { 164: 165, 236: 237, 163: 238, 239: 240, 530: 531 };
  private static readonly SPIDER_GROUND_FORM: Record<number, number> = { 165: 164, 237: 236, 238: 163, 240: 239, 531: 530 };

  /** NPCCanStickToWalls 1:1（NPC.cs:56209-56229）：身体中心 3×3 内"非实心 tile 且有背景墙"
   *  的格数 >4 → 可贴墙（蜘蛛洞/洞穴天然满足，地表不满足 → 落回地面形态） */
  private npcCanStickToWalls(st: GameHooks['world']['store']): boolean {
    const cx = Math.floor(this.cx / TILE), cy = Math.floor(this.cy / TILE);
    let n = 0;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cy - 1; j <= cy + 1; j++) {
        if (!st.inBounds(i, j)) continue;
        const ii = st.idx(i, j);
        const passable = st.type[ii] === 0 || !st.isSolid(i, j) || st.isPlatform(i, j);
        if (passable && st.wall[ii] > 0) {
          n++;
          if (n > 4) return true;
        }
      }
    }
    return false;
  }

  /** Transform 1:1（NPC.cs:81861-81919）：换类型 + 按比例结转 HP + ai[0..3] 清零；
   *  位置按 TryChangingSizeFromBottomCenter（:81836）底边中心锚定改尺寸，
   *  新碰撞盒与实心块重叠则放弃（原版换尺寸失败语义）。
   *  game 可选 = TransformVisuals（:81902 Transform 尾对所有转化统一调用）播
   *  音效用——见 transformVisuals */
  private tryTransformTo(id: number, st: GameHooks['world']['store'], allowEmbedded = false, game?: GameHooks): boolean {
    const v = vanillaNpc(id);
    if (!v) return false;
    const oldType = this.vanillaId;
    const s = v.scale ?? 1;
    const nw = Math.round(v.width * s), nh = Math.round(v.height * s);
    const nx = this.cx - nw / 2, ny = this.y + this.h - nh; // 底边中心锚定
    if (!allowEmbedded) {
      for (let tx = Math.floor(nx / TILE); tx <= Math.floor((nx + nw - 0.01) / TILE); tx++) {
        for (let ty = Math.floor(ny / TILE); ty <= Math.floor((ny + nh - 0.01) / TILE); ty++) {
          if (st.isSolid(tx, ty)) return false;
        }
      }
    }
    const oldMax = this.maxHp;
    this.vanillaId = id;
    this.vanilla = v;
    this.w = nw; this.h = nh;
    this.x = nx; this.y = ny;
    this.maxHp = v.lifeMax;
    this.hp = Math.max(1, Math.round((this.hp * v.lifeMax) / oldMax)); // life = life*lifeMax/old
    // 飞行档表达式与 fromVanilla 同源（noGravity 数据族 + aiStyle 2/5/14/23/44）
    const flying = v.noGravity || v.aiStyle === 2 || v.aiStyle === 5 || v.aiStyle === 14
      || v.aiStyle === 23 || v.aiStyle === 44;
    this.noGravity = flying;   // 运行时位随 Transform 重置（原版 SetDefaults 复位语义）
    this.def = {
      ...this.def,
      name: v.name, hp: v.lifeMax, damage: v.damage, defense: v.defense,
      width: nw, height: nh,
      flying,
      boss: VANILLA_BOSS_IDS.has(id),
      hitSound: vanillaSoundFiles(v.HitSound) ?? ['NPC_Hit_1'],
      killedSound: vanillaSoundFiles(v.DeathSound) ?? ['NPC_Killed_1'],
      drops: [], // 掉落走 NpcDrops 规则树（击杀时求值，不再预展开）
    };
    this.ai0 = 0; this.ai1 = 0; this.ai2 = 0; this.ai3 = 0;
    this.transformVisuals(game, oldType, id);
    return true;
  }

  /** TransformVisuals（NPC.cs:81739-81771——Transform 尾部 :81902 对所有转化统一
   *  调用,按 (oldType,newType) 对分发）。当前移植对仅 158⇄159（吸血蝙蝠⇄吸血鬼,
   *  :81742-81749）：Item_8 + 3 个 gore 99（三锚点 y−10 / y+h/2−10 / y+h−10、
   *  初速 ×0.3——GorePiece 血块收缩族含 99）。478→479（dust 238+gore 684-686）/
   *  406→405 等其余对无音效号,粒子侧未移植维持现状。 */
  private transformVisuals(game: GameHooks | undefined, oldType: number | null, newType: number): void {
    if (!game) return;
    if (!((oldType === 158 && newType === 159) || (oldType === 159 && newType === 158))) return;
    game.playSfxWav?.('Item_8', 1, this.cx, this.cy);
    for (const gy of [this.y - 10, this.y + this.h / 2 - 10, this.y + this.h - 10]) {
      GorePiece.newGore(99, this.x, gy, this.vx * 0.3, this.vy * 0.3, this.vanillaScale ?? 1);
    }
  }

  /** 外部 AI 文件的 Transform 入口（骑手 390 失坐骑 → 382,cs:36291）。
   *  allowEmbedded：noTileCollide 族（EoW 断链晋升 13/15 常处实心块内）跳过
   *  实心重叠自检——原版 Transform 无此回退（SetDefaults 后仅底边锚定改尺寸） */
  transformTo(id: number, st: GameHooks['world']['store'], allowEmbedded = false, game?: GameHooks): boolean {
    return this.tryTransformTo(id, st, allowEmbedded, game);
  }

  /** NPC.GetShimmered（NPC.cs:92502-92584）子集：雕像产怪直接消散（:92504-92519）→
   *  ShimmerTransformToNPC 则 Transform（:92521-92533）→ ShimmerTransformToItem 则
   *  掉微光化物品后消散（:92535-92560）。表来自 tools/extract-shimmer.mjs
   *  （114 NPC 对 + 15 NPC→物品）。原版四分支全落空时整函数为空操作（无表项 Boss
   *  浸微光仅反复空调用，:92502-92573 无 else 兜底）——先判分支可达再出转化特效，
   *  避免每 90t 粒子空刷；城镇变体分支（:92560-92573）在 TownNPC 侧实现 */
  private npcGetShimmered(game: GameHooks): void {
    if (this.vanillaId === null) return;
    const toNpc = npcShimmerTransformTo(this.vanillaId);
    const toItem = npcShimmerTransformToItem(this.vanillaId);
    // 空操作门：非雕像产怪且无任何转化目标 → 原版同帧不产生任何副作用
    if (!this.spawnedFromStatue && !(toNpc >= 0 && toNpc !== this.vanillaId) && toItem < 0) return;
    this.shimmerT = 0;
    game.spawnParticles(this.cx, this.cy, '#BFE8FF', 10, 1.4, { life: 30, grav: -0.04 });
    if (this.spawnedFromStatue) {           // SpawnedFromStatue → active=false（:92508-92514）
      this.dead = true;
      return;
    }
    if (toNpc >= 0 && toNpc !== this.vanillaId) {
      this.transformTo(toNpc, game.world.store, false, game);
      return;
    }
    if (toItem >= 0) {
      const key = VANILLA_ITEM_KEY_BY_ID[toItem];
      if (key) {
        const d = game.spawnDrop(this.cx, this.cy, key, 1);
        if (d) { d.shimmered = true; d.shimmerTime = 1; }  // 微光化物品上浮（:92540-92545）
      }
      this.dead = true;                    // noSpawnCycle + active=false（:92557-92559）
    }
  }

  /** AI_040 爬墙蜘蛛族 1:1（NPC.cs:29784-30022）：无重力、贴背景墙表面爬行。
   *  速度表：165 默认 2/0.08、237 3/0.12、531 4/0.16（:29789-29798）；
   *  有视线 → 分轴伺服追玩家（:29880-29920，朝向角 atan2(期望速度)）；
   *  无视线 → ai[0] ±200 振荡漂移（:29833-29878，角 atan2(当前速度)）；
   *  531 朝向角额外 +π/2（:29922）；spriteDirection 恒 -1（:29829，渲染层处理）；
   *  碰撞反弹（:29924-29950）：旧速 ×-0.5，X 朝移动方向保底 ±2、Y 保底 ±2；
   *  专家模式毒液弹（:29960-29989，type 472）未启用专家模式，不移植；
   *  脱墙（NPCCanStickToWalls 假）→ Transform 回地面形态（:29991-30010） */
  private wallCreeperAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    let maxSpd = 2, accel = 0.08;
    if (this.vanillaId === 237) { maxSpd = 3; accel = 0.12; }
    else if (this.vanillaId === 531) { maxSpd = 4; accel = 0.16; }
    // 目标向量（8px 量化，:29799-29819）；无目标/目标死亡 → 沿方向漂离上浮（:29824-29827）
    let tx: number, ty: number;
    const alive = !!player && !player.dead;
    if (alive) {
      tx = Math.floor(player!.cx / 8) * 8 - Math.floor(this.cx / 8) * 8;
      ty = Math.floor(player!.cy / 8) * 8 - Math.floor(this.cy / 8) * 8;
    } else {
      tx = this.facing * maxSpd / 2;
      ty = -maxSpd / 2;
    }
    const dist = Math.hypot(tx, ty);
    let sx: number, sy: number; // 期望速度向量（num636/637）
    if (dist === 0) { sx = this.vx; sy = this.vy; }
    else { sx = (tx / dist) * maxSpd; sy = (ty / dist) * maxSpd; }
    // direction（TargetClosest 语义：朝目标水平方向；死亡保持）
    if (alive) this.facing = this.seekDirX(player!);
    const los = alive ? this.canSeePlayer(st, player!) : false;
    if (!los) {
      // 无视线：振荡漂移（:29833-29878）——ai[0] 驱动的 X/Y 交替扰动 + 微弱趋目标分量
      if (this.ai0 < -200) this.ai0 = 0; // 类默认 -1120 钳回原版下界（同 swarmerAI 清查）
      this.ai0 += 1;
      this.vy += this.ai0 > 0 ? 0.023 : -0.023;
      this.vx += (this.ai0 < -100 || this.ai0 > 100) ? 0.023 : -0.023;
      if (this.ai0 > 200) this.ai0 = -200;
      this.vx += sx * 0.007;
      this.vy += sy * 0.007;
      this.visAngle = Math.atan2(this.vy, this.vx);
      if (this.vx > 1.5 || this.vx < -1.5) this.vx *= 0.9;
      if (this.vy > 1.5 || this.vy < -1.5) this.vy *= 0.9;
      this.vx = Math.max(-3, Math.min(3, this.vx));
      this.vy = Math.max(-3, Math.min(3, this.vy));
    } else {
      // 有视线：分轴非对称伺服（:29880-29920，与 servoTo 同构、目标为期望速度）
      if (this.vx < sx) {
        this.vx += accel;
        if (this.vx < 0 && sx > 0) this.vx += accel;
      } else if (this.vx > sx) {
        this.vx -= accel;
        if (this.vx > 0 && sx < 0) this.vx -= accel;
      }
      if (this.vy < sy) {
        this.vy += accel;
        if (this.vy < 0 && sy > 0) this.vy += accel;
      } else if (this.vy > sy) {
        this.vy -= accel;
        if (this.vy > 0 && sy < 0) this.vy -= accel;
      }
      this.visAngle = Math.atan2(sy, sx);
    }
    if (this.vanillaId === 531) this.visAngle += Math.PI / 2; // :29922
    // 移动 + 碰撞反弹（:29924-29950；旧速 = 碰撞前速度）
    const oldVx = this.vx, oldVy = this.vy;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) {
      this.vx = oldVx * -0.5;
      if (this.facing === -1 && this.vx > 0 && this.vx < 2) this.vx = 2;
      if (this.facing === 1 && this.vx < 0 && this.vx > -2) this.vx = -2;
    }
    if (this.hitHead || this.onGround) {
      this.vy = oldVy * -0.5;
      if (this.vy > 0 && this.vy < 1.5) this.vy = 2;
      if (this.vy < 0 && this.vy > -1.5) this.vy = -2;
    }
    // 行走帧累加（FindFrame case 165/237/238/240/531，cs:73795-73817：
    // frameCounter += (|vx|+|vy|)×0.5（531 ×0.4），24 一循环）
    this.crawlT = (this.crawlT + (Math.abs(this.vx) + Math.abs(this.vy))
      * (this.vanillaId === 531 ? 0.4 : 0.5)) % 24;
    // 脱墙 → Transform 回地面形态（:29991-30010）
    const groundForm = Enemy.SPIDER_GROUND_FORM[this.vanillaId ?? -1];
    if (groundForm !== undefined && !this.npcCanStickToWalls(st)) {
      this.tryTransformTo(groundForm, st, false, game);
    }
  }

  /** Collision.CanHit 1:1（Collision.cs:388-480）：实体矩形 → 逐 tile 扫描。
   *  半砖/坡面/平台/已致动/开门态不阻挡；"两邻格均为整实心"= 被夹住 → 无视线 */
  private canSeePlayer(st: GameHooks['world']['store'], p: Player): boolean {
    return canHit(st, this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h);
  }

  /** AI_042 失落女孩 1:1（NPC.cs:30281-30310）：伪装成无害 NPC 静止站立（无移动逻辑，
   *  仅重力）；玩家靠到 200px 内有视线、或自身被推动/下落/受伤（ai[0] 0→1 的三重触发，
   *  cs:30292-30300）→ 21 tick 后 Transform(196 Nymph) 显形追杀 */
  private lostGirlAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (this.ai0 < 0) this.ai0 = 0; // 类字段默认 -1120 是史莱姆专用初值；原版 ai[0] 从 0 起步
    if (this.ai0 === 0) {
      if (player && !player.dead) {
        const dx = player.cx - this.cx, dy = player.y - this.cy;
        if (Math.hypot(dx, dy) < 200 && this.canSeePlayer(st, player)) this.ai0 = 1;
      }
      if (this.vx !== 0 || this.vy < 0 || this.vy > 2 || this.hp !== this.maxHp) this.ai0 = 1;
    } else {
      this.ai0 += 1;
      if (this.ai0 >= 21) {
        this.ai0 = 21;
        if (this.tryTransformTo(196, st, false, game)) return;
      }
    }
    // 静止站立 + 重力（原版 AI_042 无任何速度代码）
    this.vx = 0;
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_000 被缚 NPC（NPC.cs:19774-19893）：105/106/123/354 静态站立（面朝玩家+摩擦，
   *  无任何移动）；376 睡渔夫/579 醉酒酒保水上漂流（vy=-0.4 上浮 + 缓漂）。
   *  376/579 在永不沾水表（:94252）→ wet 恒 false，原版用水线判定：wet || 头顶上方格
   *  ((position.Y-4)/16) 有液体（:19818-19820）——睡在水面上恒漂不沉。
   *  解救（对话 Transform 成对应城镇 NPC）在 TownNPC 侧；Enemy 侧仅防御性兜底 */
  private boundNPCAI(game: GameHooks, player: Player | null) {
    if (player && !player.dead) this.facing = this.seekDirX(player);
    this.vx *= 0.93;
    if (Math.abs(this.vx) < 0.1) this.vx = 0;
    const st = game.world.store;
    if (this.vanillaId === 376 || this.vanillaId === 579) {
      const headTile = st.liquid[st.idx(
        Math.floor(this.cx / TILE), Math.floor((this.y - 4) / TILE))] > 0;
      if (headTile) {
        this.vy = -0.4;                     // 水面漂流（cs:19821-19883）
        this.vx *= 0.99;
        this.x += this.vx; this.y += this.vy;
        return;
      }
    }
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_017 秃鹫 61（Raven 301 同块，NPC.cs:24079-24209）：ai[0]=0 栖息（重力站立），
   *  200px 盒与玩家相交 / life<max / 有速度 → 起飞（vy-=6）单向 0→1 不回落；
   *  飞行态无重力：X accel 0.1 clamp±3，Y 目标=玩家上方（|dx|>50 再抬高 100）accel 0.05 clamp±3；
   *  碰撞反弹旧速×-0.5（X 朝 direction 保底 2 / Y 保底 1） */
  private vultureAI(game: GameHooks, player: Player | null) {
    if (this.ai0 < 0) this.ai0 = 0;
    // noGravity 运行时位（:24079-24084）：AI 开头恒 true，栖息 0 态置 false——
    // StrikeNPC :82217 受击档（def.flying=false 覆盖不到，2026-08-17 补）
    this.noGravity = true;
    if (this.ai0 === 0) {
      this.noGravity = false;
      // 唤醒判定用重力前的速度（原版 AI 先读 velocity、重力在其后施放——
      // 落地碰撞清零后站立态 vy==0，不会被本 tick 重力误判成"有速度"）
      const preVy = this.vy;
      const near = player && !player.dead
        && Math.abs(player.cx - this.cx) < 100 + (this.w + player.w) / 2
        && Math.abs(player.cy - this.cy) < 100 + (this.h + player.h) / 2;
      if (this.vx !== 0 || preVy < 0 || preVy > 0.3) {
        // 速度触发唤醒(:24091):置 ai[0]=1 但不跳(无 vy-=6)
        this.ai0 = 1;
        return;
      }
      if (near || this.hp < this.maxHp) {
        // 玩家靠近/掉血唤醒(:24101-24105):起身跳 vy-=6
        this.ai0 = 1;
        this.vy = -6;
        return;
      }
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    if (player && !player.dead) this.facing = this.seekDirX(player);
    const dir = this.facing;
    // (:24151-24170) else-if 链:基础 ∓0.1;>3(同向满速不可达档)/>0(逆行)追加 ∓0.05;
    // 曾把逆行追加错写成 ∓0.1(减速过猛)
    if (dir === -1 && this.vx > -3) {
      this.vx -= 0.1;
      if (this.vx > 3) this.vx -= 0.1;
      else if (this.vx > 0) this.vx -= 0.05;
      if (this.vx < -3) this.vx = -3;
    } else if (dir === 1 && this.vx < 3) {
      this.vx += 0.1;
      if (this.vx < -3) this.vx += 0.1;
      else if (this.vx < 0) this.vx += 0.05;
      if (this.vx > 3) this.vx = 3;
    }
    // 悬停目标(:24172-24174):player.Y - h/2;水平距离>50 → 再抬 100px。
    // ★曾写成【vy】与【世界坐标 ty】比较(单位错位恒 false → 永远 vy+=0.05 向下
    // 加速):秃鹫唤醒后不悬停,贴地乱撞冲向玩家。原版比较的是 position.Y 与 ty
    let ty = player && !player.dead ? player.y - this.h / 2 : this.cy - 100;
    if (player && Math.abs(player.cx - this.cx) > 50) ty -= 100;
    if (this.y < ty) {
      this.vy += 0.05;
      if (this.vy < 0) this.vy += 0.01;   // :24183-24185 上行中额外 +0.01 减速(曾写反 -0.01)
    } else {
      this.vy -= 0.05;
      if (this.vy > 0) this.vy -= 0.01;
    }
    // （秃鹫无沙球攻击——:24475 沙球块属 aiStyle 19 蚁狮,曾误植于此并错用
    //  ai0 状态机字段自减,已撤;蚁狮侧 antlionAI 已含 Item_5 音,2026-08-18 复核）
    this.vy = Math.max(-3, Math.min(3, this.vy));
    const oldVx = this.vx, oldVy = this.vy;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) {
      this.vx = -oldVx * 0.5;
      if (this.facing === -1 && this.vx > 0 && this.vx < 2) this.vx = 2;
      if (this.facing === 1 && this.vx < 0 && this.vx > -2) this.vx = -2;
    }
    if (this.hitHead || this.onGround) {
      this.vy = -oldVy * 0.5;
      if (Math.abs(this.vy) < 1) this.vy = this.vy >= 0 ? 1 : -1;
    }
    // 入水(:24194-24208):vy>0 ×0.95 阻下落,恒 -0.5 上浮,下限 -4
    if (this.inWater) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.5;
      if (this.vy < -4) this.vy = -4;
    }
  }

  /** AI_019 蚁狮 69（NPC.cs:24465-24595）：完全不动（knockBackResist=0）；底部 3 列任一
   *  实心 → 无重力上浮 0.2 出沙面（cs:24543 动态 noTileCollide），否则正常落地；
   *  沙球（cs:24499）：ai[0] 冷却 200、玩家在上方+视线 → 速 12 直射（伤害 10）；
   *  传送带 ConveyorBelt 特例（cs:24526）未引入不移植 */
  private antlionAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (this.ai0 < 0) this.ai0 = 0;
    this.vx *= 0.9;
    if (Math.abs(this.vx) < 0.1) this.vx = 0;
    // 脚下行（取盒内最底行；站地时该行为空气 → 正常落地，半埋沙中才触发浮出）
    const bx = Math.floor(this.cx / TILE), by = Math.floor((this.y + this.h - 1) / TILE);
    let rooted = false;
    for (let i = -1; i <= 1; i++) if (st.isSolid(bx + i, by)) { rooted = true; break; }
    if (rooted) {
      this.vy = -0.2;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (player && !player.dead) {
      this.ai0 += 1;
      if (this.ai0 >= 200 && player.cy < this.cy && this.canSeePlayer(st, player)) {
        this.ai0 = 0;
        game.playSfxFiles(['Item_5'], 1, this.cx, this.cy);   // :24503 开火音（bowShoot 同轨）
        this.shootDart(game, this.cx, this.cy, player.cx - this.cx, player.cy - this.cy, 12, 10, 31);
      }
    }
  }

  /** AI_023 飞行武器 83/84/179（NPC.cs:25316-25395）：块内强制 noGravity+noTileCollide 穿墙。
   *  三态循环：0 冲刺（朝玩家单位向量×9、rotation=atan2+0.785）→ 1 漂移（×0.99/帧，
   *  justHit 直接进 2；100 帧 → 清速进 2）→ 2 蓄转（×0.96/帧，转速 0.1+ai/120*0.4 递增，
   *  justHit 重转；120 帧 → 回 0）。受击永远回蓄转态 */
  private flyingWeaponAI(_game: GameHooks, player: Player | null) {
    if (this.ai0 < 0) this.ai0 = 0;
    if (this.ai0 === 0) {
      if (player && !player.dead) {
        const dx = player.cx - this.cx, dy = player.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 9;
        this.vy = (dy / d) * 9;
        this.visAngle = Math.atan2(this.vy, this.vx) + 0.785;
      } else {
        this.vx = this.facing * 3;
        this.vy = -3;
      }
      this.ai0 = 1;
      this.ai1 = 0;
    } else if (this.ai0 === 1) {
      this.vx *= 0.99;
      this.vy *= 0.99;
      this.ai1 += 1;
      if (this.justHit) { this.ai0 = 2; this.ai1 = 0; }
      else if (this.ai1 >= 100) { this.ai0 = 2; this.ai1 = 0; this.vx = 0; this.vy = 0; }
    } else {
      this.vx *= 0.96;
      this.vy *= 0.96;
      this.ai1 += 1;
      this.visAngle += (0.1 + (this.ai1 / 120) * 0.4) * this.facing; // 越转越快
      if (this.justHit) this.ai1 = 0;
      else if (this.ai1 >= 120) this.ai0 = 0;
    }
    this.x += this.vx;
    this.y += this.vy;
    // ---- 点光（cs:25321-25331 aiStyle23 全族 Center 恒亮）----
    // 83 诅咒锤 (0.2,0.05,0.3) / 179 猩红斧 (0.3,0.15,0.05) / else 84 魔化剑 (0.05,0.2,0.3)
    if (this.vanillaId === 83) this.lightRGB = [0.2, 0.05, 0.3];
    else if (this.vanillaId === 179) this.lightRGB = [0.3, 0.15, 0.05];
    else this.lightRGB = [0.05, 0.2, 0.3];
  }

  /** AI_025 宝箱怪 85/341/629（NPC.cs:25621-25713）：ai[0]=0 伪装（重力站立），玩家进
   *  200px 盒 / life<max / 有速度 → 显形；ai[0]=1 跳跃循环——落地 ai[2] 计数，
   *  不足 12（首跳）/20 帧 vx×0.9 蓄力，然后小跳（vx=dir*3.5, vy=-4）×2 →
   *  第三跳大跳（vx=dir*2.5, vy=-8）清零循环；空中朝 dir 补 |vx|≥1（±0.1/帧）。
   *  341 礼物宝箱怪仅雪月索敌（flag36 = snowMoon，NPC.cs SpawnNPC 传入）——雪月已落地
   *  （MoonEvent），索敌门按 world.moonEvent.kind===1（霜月）判定 */
  private mimicAI(game: GameHooks, player: Player | null) {
    if (this.ai0 < 0) this.ai0 = 0;
    const flag36 = this.vanillaId === 341 && game.world.moonEvent.kind === 1;
    if (this.ai0 === 0) {
      // 同 AI_017：唤醒判定用重力前速度（站立态 vy==0 不误触发）
      const preVy = this.vy;
      const near = !flag36 && player && !player.dead
        && Math.abs(player.cx - this.cx) < 100 + (this.w + player.w) / 2
        && Math.abs(player.cy - this.cy) < 100 + (this.h + player.h) / 2;
      if (near || this.hp < this.maxHp || this.vx !== 0 || preVy < 0 || preVy > 0.3) {
        this.ai0 = 1;
        return;
      }
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    if (player && !player.dead) this.facing = this.seekDirX(player);
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround && this.vy === 0) {
      this.ai2 += 1;
      const wait = this.ai1 === 0 ? 12 : 20;
      if (this.ai2 < wait) { this.vx *= 0.9; return; }
      this.ai2 = 0;
      if (this.ai1 === 2) {           // 第三跳：大跳清零
        this.vx = this.facing * 2.5;
        this.vy = -8;
        this.ai1 = 0;
      } else {
        this.vx = this.facing * 3.5;
        this.vy = -4;
        this.ai1 += 1;
      }
    } else if (this.vy !== 0) {
      if (this.facing === -1 && this.vx > -1) this.vx -= 0.1;
      else if (this.facing === 1 && this.vx < 1) this.vx += 0.1;
    }
  }

  /** AI_039 陆龟族 153/154/417/496/497（NPC.cs:29257-29783）：
   *  justHit → 回待机（417 除外，knockBackResist=0）；
   *  0 待机：远距(>200)+视线蓄力+4/t（496/497 +2），>600 再+10/t，wet 直跳 1000，≥400 → 1；
   *    行走 accel 0.07，近(<400) clamp±1 远 ±1.5（496/497 ±0.5），前方 3×4 无地转身；
   *  1 蓄势：vx×0.5、ai[1]+1(496/497 ×0.5) ≥30 → 3（417 → 6 态滚动）；
   *  3 旋冲：首帧定速 有视线10/无视线6（496/497 ×0.75；瞄准 Y 加 |dx|*0.2、无视线强制
   *    vy=-10），飞行中与玩家 X 重叠 → vx×0.8 停升，否则 vy-=0.22 持续上旋，≥90t → 4；
   *  4 下落：vx×0.96，落地 → 5；
   *  5 复位：vx=0，+1/t(×0.5) ≥30 → 回 0；wet 直接回 3；
   *  6 Sroller 日耀滚动（16/10 定速、≥1200t 或 ai[2]==0 → 5）星柱未引入仅骨架 */
  private tortoiseAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (this.ai0 < 0) this.ai0 = 0;
    const t496 = this.vanillaId === 496 || this.vanillaId === 497;
    const sroller = this.vanillaId === 417;
    if (this.justHit && !sroller && this.ai0 !== 3) { this.ai0 = 0; this.ai1 = 0; }
    const dx = player ? player.cx - this.cx : 0;
    const dy = player ? player.cy - this.cy : 0;
    const dist = player ? Math.hypot(dx, dy) : Infinity;
    const los = !!player && !player.dead && this.canSeePlayer(st, player);
    const inW = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    const gravityStep = () => {
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
    };
    if (this.ai0 === 0 || this.ai0 > 5) {
      // ---- 待机/接近 ----
      if (this.ai0 === 0) {
        if (los && dist > 200) this.ai1 += t496 ? 2 : 4;
        if (dist > 600 && (los || dy > 200)) this.ai1 += t496 ? 4 : 10;
        if (inW) this.ai1 = 1000;
        if (this.ai1 >= 400) { this.ai0 = 1; this.ai1 = 0; return; }
        if (player && !player.dead) this.facing = dx > 0 ? 1 : -1;
        const max = t496 ? 0.5 : dist < 400 ? 1 : 1.5;
        this.vx += this.facing * 0.07;
        this.vx = Math.max(-max, Math.min(max, this.vx));
        // 前方 3 格 × 下 4 格无地面 → 转身（cs:29395-29427）
        const fx = Math.floor((this.cx + this.facing * 24) / TILE);
        const fy = Math.floor((this.y + this.h - 1) / TILE);
        let ground = false;
        for (let k = 1; k <= 4 && !ground; k++) if (st.isSolid(fx, fy + k)) ground = true;
        if (!ground) this.facing *= -1;
        gravityStep();
        return;
      }
      // ---- Sroller 6 态骨架 ----
      if (this.ai1 === 0) {
        const spd = los ? 16 : 10;
        if (player && los) {
          const d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * spd; this.vy = (dy / d) * spd;
        } else { this.vy = -12; this.vx = this.facing * spd * 0.5; }
        this.ai2 = 2 + Math.floor(Math.random() * 3);
      }
      this.ai1 += 1;
      gravityStep();
      if (this.ai2 === 0 || this.ai1 >= 1200) { this.ai0 = 5; this.ai1 = 0; }
      return;
    }
    if (this.ai0 === 1) {
      // ---- 蓄势 ----
      this.vx *= 0.5;
      this.ai1 += t496 ? 0.5 : 1;
      gravityStep();
      if (this.ai1 >= 30) {
        this.ai0 = sroller ? 6 : 3;
        this.ai1 = 0;
        this.ai2 = 0;
      }
      return;
    }
    if (this.ai0 === 3) {
      // ---- 旋转弹射 ----
      if (this.ai1 === 0) {
        const spd = (los ? 10 : 6) * (t496 ? 0.75 : 1);
        if (los && player) {
          const aimY = dy + (dy > 0 ? 0 : Math.abs(dx) * 0.2); // directionY>0 时偏置为 0
          const d = Math.hypot(dx, aimY) || 1;
          this.vx = (dx / d) * spd;
          this.vy = (aimY / d) * spd;
        } else {
          this.vy = -10;
          this.vx = this.facing * spd;
        }
        this.ai3 = this.vx; // 存 vx
      } else {
        if (player && Math.abs(dx) < (this.w + player.w) / 2 + 8) {
          this.vx *= 0.8;
          this.ai3 = 0;
        } else {
          this.vx = this.ai3;
          this.vy -= 0.22;
        }
      }
      this.ai1 += 1;
      gravityStep();
      if (this.ai1 >= 90) { this.ai0 = 4; }
      return;
    }
    if (this.ai0 === 4) {
      // ---- 下落恢复 ----
      this.vx *= 0.96;
      this.ai2 -= 0.01;
      gravityStep();
      if (this.ai2 <= 0 && (this.onGround || inW)) { this.ai0 = 5; this.ai1 = 0; }
      return;
    }
    // ---- 5 复位 ----
    this.vx = 0;
    this.ai1 += t496 ? 0.5 : 1;
    gravityStep();
    if (inW) { this.ai0 = 3; this.ai1 = 0; return; }
    if (this.ai1 >= 30) { this.ai0 = 0; this.ai1 = 0; }
  }

  /** AI_041 赫柏林 174/德普林 177（NPC.cs:30017-30280）：ai[0] 负数倒计时（ai[2]==0 时
   *  置 -100），落地 +5/t（177 +2）+ 距离加速 400/dist×10(177 ×5)（(int) 截断）、cap 30；
   *  ≥0 触发跳：小跳 vy=-5/vx+5dir（177 -7.5/+4dir），第 3/2 跳大跳 vy=-9/vx+3dir
   *  （177 -11.5/+2dir）清零并记 ai[3]=X；原地卡墙（ai[3]==X）→ 转向+ai[2]=300 惩罚；
   *  空中朝 dir 补 |vx| 到 3（177 4）（±0.2/帧）；wet 浮力段略；
   *  378 格格牙炸弹自爆序列（cs:30030-30107 + 跳跃尖叫 :30204）——起爆门（湿/
   *  距玩家<64 → ai[1]=5）→ 引爆态（冻结+扩 160×160 判定盒接触伤害、ai[2]==9 首
   *  tick Item_14 自爆音、ai[2]==1 消散无掉落）+ 每次起跳 Zombie_124 咬齿尖叫 */
  private herplingAI(game: GameHooks, player: Player | null) {
    if (this.ai2 === 0) { this.ai0 = -100; this.ai2 = 1; }
    else if (this.ai2 > 1) this.ai2 -= 1;
    const derpling = this.vanillaId === 177;
    const bomb = this.vanillaId === 378;
    if (player && !player.dead) this.facing = this.seekDirX(player);
    const dist = player ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : Infinity;
    // ---- 378 引爆态（cs:30044-30082）----
    if (bomb && this.ai1 === 5) {
      this.vx = 0; this.vy = 0;
      // 判定盒扩 160×160（:30050-30053,接触伤害 200 = def.damage 数据自带）
      this.x = this.cx - 80; this.y = this.cy - 80;
      this.w = 160; this.h = 160;
      this.dontTakeDamage = true;
      if (this.ai2 > 7) {
        // 8× dust 31（:30056-30060）+ 32×2 dust 6（:30062-30073,×3/×2 速档近似）
        for (let i = 0; i < 8; i++) game.spawnDust?.(this.x, this.y, this.w, this.h, 31, 0, 0, 100, null, 1.5);
        for (let i = 0; i < 32; i++) {
          game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 3, 3, 100, null, 2.5);
          game.spawnDust?.(this.x, this.y, this.w, this.h, 6, 2, 2, 100, null, 1.5);
        }
        for (let i = 0; i < 2; i++) {   // 2× gore 61-63（:30075-30083）
          GorePiece.newGore(61 + Math.floor(Math.random() * 3),
            this.x + this.w * Math.random() - 10, this.y + this.h * Math.random() - 10,
            0, 0, 1);
        }
        if (this.ai2 === 9) game.playSfxWav?.('Item_14', 1, this.cx, this.cy);  // :30082 自爆音
      }
      if (this.ai2 === 1) this.dead = true;   // life=-1+active=false（:30087-30090,不走掉落/死亡管线）
      return;
    }
    // ---- 378 起爆门（cs:30098-30107）：湿 / 距玩家 <64 → 引爆态 ----
    if (bomb && (this.wet || (player != null && !player.dead && dist < 64))) {
      this.ai1 = 5;
      this.ai2 = 10;
      return;
    }
    // ---- 378 引信火花（cs:30034-30043,1/3）：dust 6 上飘 ----
    if (bomb && Math.floor(Math.random() * 3) === 0) {
      game.spawnDust?.(this.cx - 6 * this.facing - 5, this.cy - 15, 4, 4, 6, 0, -1, 0, null, 1.5);
    }
    // ---- wet 段（cs:30105-30120，177 Derpling 除外）：撞墙翻向；纵向碰撞 → 重新索敌 +
    // 上撞 vy=5 / 落水 vy-=2；随后 vy>0 ×0.95、恒 -0.3 上浮钳 -4——赫柏林入水上浮。
    // collideX/Y 读上一 tick 碰撞（原版 AI 先于 UpdateCollision）
    if (this.wet && !derpling) {
      if (this.hitWall) this.facing *= -1;
      if (this.onGround || this.hitHead) {
        if (player) this.facing = this.seekDirX(player);
        if (this.vy < 0) this.vy = 5;
        else this.vy -= 2;
      }
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.3;
      if (this.vy < -4) this.vy = -4;
    }
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround && this.vy === 0) {
      this.vx *= 0.8;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (this.ai3 === this.x && this.ai3 !== 0) { // 原地白跳：转向 + 冷却惩罚
        this.facing *= -1;
        this.ai2 = 300;
      }
      this.ai0 += derpling ? 2 : 5;
      if (player && Number.isFinite(dist) && dist > 0) {
        this.ai0 += Math.trunc((400 / dist) * (derpling ? 5 : 10));
      }
      if (this.ai0 > 30) this.ai0 = 30;
      if (this.ai0 >= 0) {
        // 378 起跳咬齿尖叫（cs:30204 PlaySound(29,x,y,124) = Zombie_124,音量无修正）
        if (bomb) game.playSfxWav?.('Zombie_124', 1, this.cx, this.cy);
        if (player && dist > 200 && dist < 350) this.vx += this.facing;
        const bigAt = derpling ? 2 : 3;
        if (this.ai1 === bigAt) {
          this.vy = derpling ? -11.5 : -9;
          this.vx += (derpling ? 2 : 3) * this.facing;
          this.ai0 = -200;
          this.ai1 = 0;
          this.ai3 = this.x;
        } else {
          this.vy = derpling ? -7.5 : -5;
          this.vx += (derpling ? 4 : 5) * this.facing;
          this.ai0 = -120;
          this.ai1 += 1;
        }
      }
    } else {
      const cap = derpling ? 4 : 3;
      if (this.facing === -1 && this.vx > -cap) {
        this.vx -= 0.2;
        if (this.vx > 0) this.vx -= 0.2;
      } else if (this.facing === 1 && this.vx < cap) {
        this.vx += 0.2;
        if (this.vx < 0) this.vx += 0.2;
      }
    }
  }

  /** AI_044 飞鱼 224/巨蚁狮蜂 509/蚁狮蜂 581（NPC.cs:30999-31268）：无重力分轴限速追击。
   *  LOS 计时 ai[0]：有视线=90，无视线每帧 -1，≤0 垂直逃逸（maxX×0.8/accel×0.7，
   *  目标 Y 偏 ±1000）；|dx|>yGate 时目标 Y 再抬高 yGate/2；撞墙 direction 翻转 vx=±1。
   *  参数表（xAccel/yAccel/maxX/maxY/xGate/yGate）：224 0.05/0.01/3/1/30/100、
   *  509 0.08/0.03/4.5/2/40/150、581 0.06/0.02/4/2/40/150。
   *  同型个体分离（cs:31108）与穿平台（cs:94137）未移植（注释备案） */
  private flyingSwarmerAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const T = this.vanillaId === 509
      ? { ax: 0.08, ay: 0.03, mx: 4.5, my: 2, gx: 40, gy: 150 }
      : this.vanillaId === 581
        ? { ax: 0.06, ay: 0.02, mx: 4, my: 2, gx: 40, gy: 150 }
        : { ax: 0.05, ay: 0.01, mx: 3, my: 1, gx: 30, gy: 100 };
    const los = !!player && !player.dead && this.canSeePlayer(st, player);
    if (los) this.ai0 = 90;
    else if (this.ai0 > -1000) this.ai0 -= 1;
    let mx = T.mx, ax = T.ax;
    let ty: number;
    if (this.ai0 <= 0) {
      // 失视逃逸：垂直爬升/俯冲远离
      mx *= 0.8; ax *= 0.7;
      ty = this.cy + Math.sign(this.vx || 1) * 1000;
    } else {
      ty = player ? player.y - this.h / 2 : this.cy - 200;
      if (player && Math.abs(player.cx - this.cx) > T.gy) ty -= T.gy / 2;
    }
    const dx = player ? player.cx - this.cx : this.facing * 200;
    if (Math.abs(dx) > T.gx) {
      if (dx < 0 && this.vx > -mx) {
        this.vx -= ax;
        if (this.vx > 0) this.vx -= ax;
        if (this.vx < -mx) this.vx = -mx;
      } else if (dx > 0 && this.vx < mx) {
        this.vx += ax;
        if (this.vx < 0) this.vx += ax;
        if (this.vx > mx) this.vx = mx;
      }
    }
    if (this.vy > ty - 4) {
      this.vy -= T.ay;
      if (this.vy < 0 && ty > this.cy) this.vy -= T.ay;
    } else if (this.vy < ty + 4) {
      this.vy += T.ay;
      if (this.vy > 0 && ty < this.cy) this.vy += T.ay;
    }
    this.vy = Math.max(-T.my, Math.min(T.my, this.vy));
    if (this.vx > 0.1) this.facing = 1; else if (this.vx < -0.1) this.facing = -1;
    // wet 浮力（cs:31256-31266，587 飞鱼眼除外）：vy>0 ×0.95、恒 -0.5 上浮钳 -4
    if (this.wet && this.vanillaId !== 587) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.5;
      if (this.vy < -4) this.vy = -4;
    }
    const oldVy = this.vy;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) {
      this.facing *= -1;
      this.vx = this.facing; // cs:31002 反弹后单位速
    }
    if (this.hitHead || this.onGround) this.vy = oldVy < 0 ? 1 : -1;
  }

  /** AI_056 地牢之魂 288（NPC.cs:32915-32936）：穿墙（SetDefaults noTileCollide+noGravity）
   *  惯性追踪——期望速度=朝玩家单位向量×12，velocity=(v*100+期望)/101（0.99 平滑、
   *  巨大惯性转向极慢）；rotation=atan2(dy,dx)-π/2 */
  private dungeonSpiritAI(_game: GameHooks, player: Player | null) {
    let ex: number, ey: number;
    if (player && !player.dead) {
      this.facing = this.seekDirX(player);
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy) || 1;
      ex = ((player.cx - this.cx) / d) * 12;
      ey = ((player.cy - this.cy) / d) * 12;
    } else {
      ex = this.facing * 6;
      ey = -6;
    }
    this.vx = (this.vx * 100 + ex) / 101;
    this.vy = (this.vy * 100 + ey) / 101;
    this.visAngle = Math.atan2(this.vy, this.vx) - Math.PI / 2;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_008 法师族（Fire Imp 24 / Goblin Sorcerer 29 / Dark Caster 32）：
   *  悬浮 + 周期传送（原版 ai[0] 计时到阈值或目标不可见时 TeleportSearch）+ 三连弹幕（原版 ai[1] volley）。
   *  弹幕复用 Dart（命中玩家）；传送条件：4-16 格内有地面 + 上下净空（原版 100 次随机试探） */
  /** AI_002_FloatingEye 通用核（NPC.cs:19118-19440）：
   *  分轴非对称加速 X±4 / Y±2.5（Wandering Eye 133 半血以下激怒 ±6/±4）；
   *  撞墙/撞地按 旧速度*-0.5 反弹并保证最小弹速（L19124-19140）；
   *  白天地表驱散（cs:52707/53152 昼散表）：EncourageDespawn(10)+保持水平方向上飞 */
  private floatEyeAI(game: GameHooks, player: Player | null) {
    // 猪龙 grunt（AI_002 :52677-52680）：170/171/180 → PlaySound(29,9)=Zombie_9 1/1000
    if ((this.vanillaId === 170 || this.vanillaId === 171 || this.vanillaId === 180)
      && Math.floor(Math.random() * 1000) === 0) {
      game.playSfxWav?.('Zombie_9', 1, this.cx, this.cy);
    }
    // 撞墙反弹（collideX/Y → hitWall/hitHead/onGround + 上一帧速度近似 oldVelocity）
    const oldVx = this.vx, oldVy = this.vy;
    // ---- 白天地表驱散（cs:52707-52715 + IsDiscouraged :53152）：
    // 白天 && y≤worldSurface && 类型 ∈ 眼族昼散表 → EncourageDespawn(10) +
    // 保持水平运动方向、directionY=-1 向上飞离（离屏后 CheckActive ~10t 清除）。
    // 墓地豁免（:53154 `!Main.player[target].ZoneGraveyard` 首条件）：目标玩家在墓地时
    // 恶魔眼白天不驱散（scene 为本地玩家快照，单人下等价）
    const day = game.world.clock.isDay && !game.world.scene?.zoneGraveyard;
    const eyeDiscouraged = day && this.cy <= game.world.groundLevel * TILE
      && this.vanillaId != null && EYE_DAY_DESPAWN.has(this.vanillaId);
    let dirX: number, dirY: number, cx: number, cy: number;
    if (eyeDiscouraged) {
      this.encourageDespawn(10);
      dirX = oldVx > 0 ? 1 : -1;   // 原版保持水平方向（direction=-1，vx>0 时翻 1）
      dirY = -1;
      cx = 4; cy = 2.5;
    } else if (!player) {
      dirX = -Math.sign(oldVx || 1);
      dirY = -1;
      cx = 4; cy = 2.5;
    } else {
      // TargetClosest（confused 反转 X；directionY 原版不反转）
      dirX = this.seekDirX(player);
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
    // wet 浮力尾段（cs:53117-53127）：wet 且非 170/171/180（猪龙三色变种，照常潜行）→
    // vy>0 ×0.95 阻下落、恒 -0.5 上浮、下限 -4 并重新索敌——飘浮眼入水弹出水面
    // 而非照常追击；此前缺失（"怪物下水照常攻击"主诉的飞行侧成因）
    if (this.wet && this.vanillaId !== 170 && this.vanillaId !== 171 && this.vanillaId !== 180) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.5;
      if (this.vy < -4) this.vy = -4;
      if (player) this.facing = this.seekDirX(player);   // TargetClosest
    }
    // ---- 点光（cs:52826-52828）：116 饿魂 II（脱落追击态）Center (0.3,0.2,0.1) 恒亮
    if (this.vanillaId === 116) this.lightRGB = [0.3, 0.2, 0.1];
  }

  /** AI_005 噬魂怪族（NPC.cs:17567-17790）"蜂群"AI：
   *  目标方向 8px 网格量化 → 期望速度 = 归一化方向 × maxSpd；
   *  ai[0] 环绕摆动（>0 加 vy、|>100| 加 vx，±200 循环）产生盘旋蜂群感（L17742-17752）；
   *  近距(<150) 附加 0.007×期望速度制导（L17754-17757）；
   *  各轴以 accel 步进逼近期望速度（L17774-17789）。
   *  速度表（L17610-17617）：Eater of Souls(6)/Crimera(173) 4/0.02，默认 6/0.05 */
  /** AI_013 植物/攀爬者族(NPC.cs:22604-22700 一比一):锚点格(ai0/ai1)固定,
   *  朝玩家伸展(range 内钳制),逆向加速 ×1.5;锚点格被挖掉即死;300-450 tick 周期 range ×1.3。
   *  攀爬者 101: range 175、accel 0.035、noTileCollide 幽灵位移(穿墙摆动)。 */
  private plantAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    // 未初始化(-1120)自愈：绕过 VanillaSpawner 锚点传参的生成路径(fromVanilla/
    // spawnNpcByVanilla/微光 Transform 等)从这里进——用当前格补锚点,否则下方
    // ai0<0 判定会即刻误杀(2026-08-13 ai0 陷阱清查)
    if (this.ai0 === -1120) {
      this.ai0 = Math.floor(this.cx / TILE);
      this.ai1 = Math.floor(this.cy / TILE);
    }
    // 锚点格失活 → 死亡(原版 :22608-22620)
    if (this.ai0 < 0 || this.ai1 < 0 || !st.inBounds(this.ai0, this.ai1)
      || st.type[st.idx(this.ai0, this.ai1)] === 0) {
      this.dead = true;
      return;
    }
    let range = 150;  // 默认 num218(:22632)；族内覆盖(:22636-22658)
    let accel = 0.035; // num217(:22630)
    if (this.vanillaId === 43) range = 250;          // 食人怪（getGoodWorld 350 未接入）
    else if (this.vanillaId === 101) range = 175;    // 邪恶触手
    else if (this.vanillaId === 259) range = 100;    // 真菌球
    else if (this.vanillaId === 175) { range = 500; accel = 0.05; }   // 怒牙捕兽草
    else if (this.vanillaId === 260) { range = 350; accel = 0.15; }   // 巨型真菌球
    // ai2:300-450 tick 周期 → range ×1.3(:22644-22653)
    this.ai2 += 1;
    if (this.ai2 > 300) {
      range = Math.floor(range * 1.3);
      if (this.ai2 > 450) this.ai2 = 0;
    }
    const ax = this.ai0 * 16 + 8, ay = this.ai1 * 16 + 8;
    // 目标点 = 锚点 + 朝玩家偏移(钳制在 range 内,:22655-22665)
    let ox = 0, oy = 0;
    if (player) {
      ox = player.cx - this.w / 2 - ax;
      oy = player.cy - this.h / 2 - ay;
      const d = Math.hypot(ox, oy);
      if (d > range) { ox = ox / d * range; oy = oy / d * range; }
    }
    // 各轴逼近,逆向 ×1.5(:22666-22699)
    const tx = ax + ox, ty = ay + oy;
    if (this.x < tx) {
      this.vx += accel;
      if (this.vx < 0 && ox > 0) this.vx += accel * 1.5;
    } else if (this.x > tx) {
      this.vx -= accel;
      if (this.vx > 0 && ox < 0) this.vx -= accel * 1.5;
    }
    if (this.y < ty) {
      this.vy += accel;
      if (this.vy < 0 && oy > 0) this.vy += accel * 1.5;
    } else if (this.y > ty) {
      this.vy -= accel;
      if (this.vy > 0 && oy < 0) this.vy -= accel * 1.5;
    }
    this.facing = this.vx > 0 ? 1 : -1;
    // ---- 头部旋转（cs:22778-22794）：259/260 真菌球恒 +π/2；其余（43 食人怪/101 触手/175）
    // 朝玩家伸展方向 atan2(num220,num219)，目标在左（num219<0）+π 且 spriteDirection=-1——
    // 旋转+镜像组合保证头从不倒挂（此前只镜像不旋转 → 横向硬转）
    if (this.vanillaId === 259 || this.vanillaId === 260) {
      this.visAngle = Math.atan2(oy, ox) + Math.PI / 2;
    } else {
      if (ox > 0) { this.facing = 1; this.visAngle = Math.atan2(oy, ox); }
      else if (ox < 0) { this.facing = -1; this.visAngle = Math.atan2(oy, ox) + Math.PI; }
    }
    // ---- 爬行者 101 诅咒焰（cs:22823-22856）：ai[3] 每 tick +1，≥120 且自身未嵌实心
    // 且有视线 → 喷诅咒焰（速 10、伤 22、散布 ±10）；条件不满足回退 ai[3]=100（20t 重试）
    if (this.vanillaId === 101 && player && !player.dead) {
      this.ai3 += 1;
      if (this.ai3 >= 120) {
        let embedded = false;
        for (let tx = Math.floor(this.x / TILE); tx <= Math.floor((this.x + this.w - 0.01) / TILE) && !embedded; tx++) {
          for (let ty = Math.floor(this.y / TILE); ty <= Math.floor((this.y + this.h - 0.01) / TILE); ty++) {
            if (st.isSolid(tx, ty)) { embedded = true; break; }
          }
        }
        if (!embedded && this.canSeePlayer(st, player)) {
          this.shootDart(game, this.cx, this.cy,
            player.cx - this.cx + (Math.random() * 20 - 10),
            player.cy - this.cy + (Math.random() * 20 - 10), 10, 22, 96);
          this.ai3 = 0;
        } else this.ai3 = 100;
      }
    }
    // noTileCollide:幽灵位移(原版 plants 不做 tile 碰撞)
    this.x += this.vx;
    this.y += this.vy;
  }

  private swarmerAI(game: GameHooks, player: Player | null) {
    // ---- Mechdusa 探针挂链(NPC.cs AI_005 :50866-50920):ai3≠0 = 召唤链出生的
    //      挂链探针 → 绕毁灭者头公转锁位(queen 在场时无敌);失效即脱落回常规 ----
    if (this.vanillaId === 139 && this.ai3 !== 0 && mechProbeLock(this, game, player)) return;
    const isEater = this.vanillaId === 6 || this.vanillaId === 173 || this.vanillaId === 139;
    // 蜜蜂（210/211，L50768-50784）：ai[1] 计数爬坡 num3=(ai1-60)/60≤1；
    // 暖机期（num3<1）逐轴速度钳 ±6；速度档 5 / 加速 0.1×num3
    const isBee = this.vanillaId === 210 || this.vanillaId === 211;
    let maxSpd = isEater ? 4 : this.vanillaId === 94 ? 4.2 : this.vanillaId === 5 ? 5 : 6;
    // 619 血鱿鱼（:50702-50705）：num=6 / num2=0.1（默认档 6/0.05 → 加速翻倍）
    let accel = isEater ? 0.02 : this.vanillaId === 94 ? 0.022 : this.vanillaId === 5 ? 0.03
      : this.vanillaId === 619 ? 0.1 : 0.05;
    if (isBee) {
      this.ai1 += 1;
      let ramp = (this.ai1 - 60) / 60;
      if (ramp > 1) ramp = 1;
      else if (this.vx > 6) this.vx = 6;
      else if (this.vx < -6) this.vx = -6;
      if (ramp < 1) {
        if (this.vy > 6) this.vy = 6;
        else if (this.vy < -6) this.vy = -6;
      }
      maxSpd = 5;
      accel = 0.1 * ramp;
    }
    // flag4（L50829）：非 173/6/42/231-235/94/139/619 = 双步加速（蜂族真；eater 族假）
    const vid = this.vanillaId ?? 0;   // swarmerAI 仅数据驱动路径可达，vanillaId 恒非空
    const flag4 = !isEater && vid !== 94 && vid !== 619
      && vid !== 42 && !(vid >= 231 && vid <= 235) && vid !== 139;
    const tx = player ? player.cx : this.cx + this.facing * 100;
    const ty = player ? player.cy : this.cy - 100;
    // 8px 网格量化（L17705-17710）
    const dx = Math.floor(tx / 8) * 8 - Math.floor(this.cx / 8) * 8;
    const dy = Math.floor(ty / 8) * 8 - Math.floor(this.cy / 8) * 8;
    const dist = Math.hypot(dx, dy) || 1;
    const sx = (dx / dist) * maxSpd;
    const sy = (dy / dist) * maxSpd;
    // 摆动项（L50837-50848）：num8 族（6/139/173/205）需 dist>100；flag3 族
    // （42/94/619/176/210/211/231-235，含蜜蜂）无条件摆动
    const swarmGated = isEater || this.vanillaId === 205;
    const swarmAlways = vid === 42 || vid === 94 || vid === 619
      || vid === 176 || isBee || (vid >= 231 && vid <= 235);
    if ((swarmGated && dist > 100) || swarmAlways) {
      if (this.ai0 < -200) this.ai0 = 0; // 类默认 -1120 钳回原版下界（振荡相位漂移 ~22s,2026-08-13 清查）
      this.ai0 += 1;
      if (this.ai0 > 200) this.ai0 = -200;
      this.vy += this.ai0 > 0 ? 0.023 : -0.023;
      this.vx += Math.abs(this.ai0) > 100 ? 0.023 : -0.023;
    } else if (swarmGated) {
      this.ai0 = 0; // 近距无摆动
    }
    // 近距制导（6/94/173/619）
    if (dist < 150 && (isEater || this.vanillaId === 94 || this.vanillaId === 619)) {
      this.vx += sx * 0.007;
      this.vy += sy * 0.007;
    }
    // 各轴步进逼近期望速度（L50924-50961）：flag4 族逆向时追加一步（num2 再乘一次）
    if (this.vx < sx) {
      this.vx += accel;
      if (flag4 && this.vx < 0 && sx > 0) this.vx += accel;
    } else if (this.vx > sx) {
      this.vx -= accel;
      if (flag4 && this.vx > 0 && sx < 0) this.vx -= accel;
    }
    if (this.vy < sy) {
      this.vy += accel;
      if (flag4 && this.vy < 0 && sy > 0) this.vy += accel;
    } else if (this.vy > sy) {
      this.vy -= accel;
      if (flag4 && this.vy > 0 && sy < 0) this.vy -= accel;
    }
    this.facing = this.vx > 0 ? 1 : -1;
    // 旋转角来源分族（cs:51022/51045-51052）：6/94/173/619 用**指向目标的期望速度**
    // (sx,sy)——噬魂怪永远盯着目标转头，惯性环绕/漂移时头不乱摆（此前误用当前速度，
    // 观感"AI 不对"的最大来源）；其余全转头成员（仆从 5 等）原版用当前速度角。
    // 符号取原版 −π/2（:51029/:51045）：本族贴图（NPC_4/NPC_5 实测瞳孔偏帧下半）
    // 正面朝帧底（+Y），canvas rotate 正角顺时针下 −π/2 恰把帧底转向运动方向；
    // 此前 +π/2 把正面调转 180° = "球屁股朝前"（rotationDriven 禁镜像，无翻转可抵）
    const faceTarget = vid === 6 || vid === 94 || vid === 173 || vid === 619;
    const fax = faceTarget ? sx : this.vx;
    const fay = faceTarget ? sy : this.vy;
    this.visAngle = Math.atan2(fay, fax) - Math.PI * 0.5;
    // ---- 黄蜂毒刺（cs:51125-51213：42/176/231-235）：ai[1] 每 tick +rand(5,20)×0.1
    // （苔藓黄蜂 176 ×2）；玩家待机未挥动（原版 itemAnimation==0 && stealth==0 门）清零；
    // ≥130 且有视线且朝向与移动方向一致 → 毒刺（速 8、伤 10×scale/176 30×scale、
    // 散布 ±20），ai[1]=101 次帧清零（原版此处播音效 Item17）
    // ---- 腐化者 94 唾液（cs:51257-51276）：ai[2] 每 tick +1，==180 且有视线 → VileSpit
    // （原版 NewNPC 112 aiStyle 9 追踪球速 7，此处 Dart 直飞近似、伤害取 NPC 112 数据）
    const st = game.world.store;
    const isHornet = vid === 42 || vid === 176 || (vid >= 231 && vid <= 235);
    if (player && !player.dead && (isHornet || vid === 94)) {
      if (this.ai1 === 101) { this.ai1 = 0; game.playSfxFiles(['Item_17'], 1, this.cx, this.cy); } // :51147 发射音
      if (isHornet) {
        this.ai1 += (Math.random() * 15 + 5) * 0.1;
        if (vid === 176) this.ai1 += (Math.random() * 15 + 5) * 0.1;
        if (player.useTime === 0) this.ai1 = 0; // 待机清零（原版潜行/挥动门）
        if (this.ai1 >= 130 && this.canSeePlayer(st, player)) {
          const sxp = player.cx - this.cx + (Math.random() * 40 - 20);
          const syp = player.cy - this.cy + (Math.random() * 40 - 20);
          if ((sxp < 0 && this.vx < 0) || (sxp > 0 && this.vx > 0)) {
            const vScale = this.vanilla?.scale ?? 1;
            this.shootDart(game, this.cx, this.cy, sxp, syp, 8, Math.round((vid === 176 ? 30 : 10) * vScale), 55);
            this.ai1 = 101;
          } else this.ai1 = 0;
        }
      } else {
        this.ai2 += 1;
        if (this.ai2 === 180 && this.canSeePlayer(st, player)) {
          // VileSpit（原版 NewNPC 112，cs:51257-51276——aiStyle 9 直飞球速 7）：
          // AI_009 已 1:1，改出真 NPC 112（此前 Dart 直飞近似、伤害取 NPC 112 数据）
          const spit = Enemy.fromVanilla(112, this.cx, this.cy);
          if (spit) addEnemy(game, spit);
          this.ai2 = 0;
        }
      }
    }
    // ---- 探针 139 专属射击段（NPC.cs AI_005 :50975-51007,在位移/反弹之前）：
    //  localAI[0] +1/t（挂链 +3 已在 mechProbeLock）、受击清零；cadence 120(常规)
    //  /360(mech 世界)；84 号弹 25 伤——mech 弹道 = 目标中心-自身中心-玩家速度×20
    //  归一 ×8（预判直飞），常规 = 期望速度直飞（noTileCollide 早退在前,须置于此） */
    if (vid === 139) {
      this.lai0 += 1;
      if (this.justHitT > 0) this.lai0 = 0;
      if (this.lai0 >= (mechQueenUp() ? 360 : 120)) {
        this.lai0 = 0;
        if (player && losClear(game, this.cx, this.cy, player.cx, player.cy)) {
          let pvx = sx, pvy = sy;
          if (mechQueenUp()) {
            const ddx = player.cx - this.cx - player.vx * 20;
            const ddy = player.cy - this.cy - player.vy * 20;
            const dl = Math.hypot(ddx, ddy) || 1;
            pvx = ddx / dl * 8; pvy = ddy / dl * 8;
          }
          shoot(game, this.cx, this.cy, pvx, pvy,
            getAttackDamageForProjectiles(25, 22, this.difficulty), 84);
        }
      }
      if (mechQueenUp()) {
        // :51206-51224 远距(>600)朝目标增速 mech 钳 5（常规 12）,逆向 ×0.9
        if (dist > 600) {
          if ((this.vx > 0 && sx > 0) || (this.vx < 0 && sx < 0)) {
            if (Math.abs(this.vx) < 5) this.vx *= 1.05;
          } else {
            this.vx *= 0.9;
          }
        }
        // :51225-51234 mech && ai2==0（身体段掉落的散探针）：距玩家 <120 →
        // 沿连线推到 120px 外（贴脸风筝位）
        if (this.ai2 === 0 && player) {
          const kx = player.cx - this.cx, ky = player.cy - this.cy;
          const kl = Math.hypot(kx, ky);
          if (kl < 120) {
            this.x = player.cx - kx / (kl || 1) * 120 - this.w / 2;
            this.y = player.cy - ky / (kl || 1) * 120 - this.h / 2;
          }
        }
      }
    }
    // noTileCollide 成员(仆从 type 5 等)原版幽灵位移:直积分、无碰撞无反弹——
    // 曾对所有成员 moveAndCollide+反弹,仆从撞墙弹跳完全不像原版(穿墙追击)
    if (this.vanilla?.noTileCollide) {
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 撞墙/撞地反弹 1:1（cs:51041-51066）：6/173 ×0.4、其余 ×0.7；
    // collideX 朝 direction 保底 ±2、collideY |vy|<1.5 保底 ±2（此前最小弹速略）
    const bounce = isEater ? 0.4 : 0.7;
    if (this.hitWall) {
      this.vx = -this.vx * bounce;
      if (this.facing === -1 && this.vx > 0 && this.vx < 2) this.vx = 2;
      if (this.facing === 1 && this.vx < 0 && this.vx > -2) this.vx = -2;
    }
    if (this.onGround || this.hitHead) {
      this.vy = -this.vy * bounce;
      if (this.vy > 0 && this.vy < 1.5) this.vy = 2;
      if (this.vy < 0 && this.vy > -1.5) this.vy = -2;
    }
    // ---- wet 浮力（cs:51106-51136）：噬魂怪族(6/94/173/619) vy>0 ×0.95、-0.3、钳 -2
    // （入水即上浮不沉底）；黄蜂族(42/176/231-235) -0.5 钳 -4
    const inW = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 0;
    if (inW && (vid === 6 || vid === 94 || vid === 173)) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.3;
      if (this.vy < -2) this.vy = -2;
    } else if (inW && (vid === 42 || vid === 176 || (vid >= 231 && vid <= 235))) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.5;
      if (this.vy < -4) this.vy = -4;
    }
    // ---- 环境拖尾尘（cs:51083-51091）：非蜂族 1/20 出下半身尘（dust 18 紫；
    // 173 Crimera dust 5 红），vel.X×0.5/Y×0.1 近似
    if (!isHornet && vid !== 205 && Math.random() < 1 / 20) {
      game.spawnParticles(this.cx, this.y + this.h * 0.5,
        vid === 173 ? '#8A3030' : '#7A4FA8', 1, 0.3, { life: 30, damp: 0.9, grav: 0 });
    }
    // ---- 点光（cs:51006-51017）：**139 探针专属**（AI_005 内 type==139 段——
    //  非全族！）：中心格在世界内且非实心 → Center (0.3,0.1,0.05)
    if (vid === 139) {
      const ltx = Math.floor(this.cx / TILE), lty = Math.floor(this.cy / TILE);
      if (st.inBounds(ltx, lty) && !st.isSolid(ltx, lty)) {
        this.lightRGB = [0.3, 0.1, 0.05];
      }
    }
  }

  /** AI_010 诅咒头骨（NPC.145.cs:21553+；type 34 路径，书怪 694/魔法骷髅 289 分支未达）：
   *  距离分档速度（>350:5/0.3 >300:3/0.2 >250:1.5/0.1 其余 1/0.011，L21655-21672）；
   *  <250 环绕摆动（ai[0] +=0.9、vy ±0.019、|ai0|>100 时 vx 反向，L21636-21651）；
   *  ai[1] 追击计数 >600 加速档（×8/速度4）>650 清零；贴脸 <100 时 ai[1]=-60（L21620-21634）；
   *  noTileCollide 穿墙直移 */
  private cursedSkullAI(game: GameHooks, player: Player | null) {
    // AI_010 全块 1:1（NPC.cs:21552-21888）。flag9 族员 = 694 水书宝箱怪（多状态机）；
    // 34 诅咒头骨/289 巨型诅咒颅走通用悬浮档
    const isMimic = this.vanillaId === 694;
    let maxSpd = 1, accel = 0.011;                 // num145/num146（:21562-21563）
    const num147 = 600, num148 = 650;              // 脱离加速门（:21564-21565）
    let dx = player ? player.cx - this.cx : this.facing * 100;
    let dy = player ? player.cy - this.cy : -100;
    const dist = Math.hypot(dx, dy) || 1;          // num153
    if (this.ai3 !== 3) this.ai1 += 1;             // :21577-21579
    const flag13 = this.ai2 >= 0 && this.ai3 === 2;   // 冲刺态（694 专属）
    const flag14 = this.ai2 >= 0 && this.ai3 === 1;   // 咒球态（694 专属）
    const flag15 = this.ai1 > num147;
    const flag16 = this.ai1 < -30;
    const flag17 = isMimic && !flag13 && !flag14 && !flag15 && flag16;  // 逃逸档
    // 帧机（FindFrame case 694 :77905-77980——AI 侧维护，customFrameIdx 供渲染端直读；
    // 34/289 单帧恒 0 由渲染端缺省，不进此链）
    if (isMimic) this.mimic694Frame();
    // ---- 伪装态 ai[3]==3（:21581-21590）：钉死成"放着的书"——静止、无旋转、
    //      击退免疫；受击 → ai[3]=4 觉醒。AI 早退（不移动不索敌）----
    if (this.ai3 === 3) {
      this.facing = 1; this.visAngle = 0;
      this.vx = 0; this.vy = 0;
      this.kbResistOverride = 0;                   // knockBackResist=0f（:21586）
      if (this.justHit) this.ai3 = 4;              // :21587-21589（frameCounter 清零在帧机）
      return;
    }
    // ---- 觉醒态 ai[3]==4（:21592-21601）：翻书动画 80t，静止，结束转 0----
    if (this.ai3 === 4) {
      this.facing = 1; this.visAngle = 0;
      this.vx = 0; this.vy = 0;
      this.kbResistOverride = 1;                   // knockBackResist=1f（:21597）
      if (this.ai1 > 80) { this.ai1 = 0; this.ai3 = 0; }   // :21598-21600 num149=80
      return;
    }
    if (isMimic) this.kbResistOverride = null;     // :21603-21605 knockBackResist=0.2（def 数据）
    // ---- 逼近/悬停段（:21607-21636；冲刺态跳过）----
    if (!flag13) {
      if (flag15) {
        accel *= 8; maxSpd = 4;                    // 超时脱离加速（:21609-21611）
        if (this.ai1 > num148) this.ai1 = 0;
      } else if (isMimic && player && dist < 100 && this.ai1 >= 0) {
        this.ai1 = -60;                            // 贴脸重置冷却（:21615-21621 flag10 专属）
      } else if (dist < 250) {
        this.ai0 += 0.9;                           // 近距 8 字漂移（:21622-21635）
        if (this.ai0 < -200) this.ai0 = 0;         // 类默认 -1120 钳回（同 swarmerAI 清查）
        this.vy += this.ai0 > 0 ? 0.019 : -0.019;
        this.vx += (this.ai0 < -100 || this.ai0 > 100) ? 0.019 : -0.019;
        if (this.ai0 > 200) this.ai0 = -200;
      }
    }
    // 速度档（:21638-21658）：逃逸 8/0.25 → >350 5/0.3 → >300 3/0.2 → >250 1.5/0.1 → 默认 1/0.011
    if (flag17) { maxSpd = 8; accel = 0.25; }
    else if (dist > 350) { maxSpd = 5; accel = 0.3; }
    else if (dist > 300) { maxSpd = 3; accel = 0.2; }
    else if (dist > 250) { maxSpd = 1.5; accel = 0.1; }
    let sx = (dx / dist) * maxSpd, sy = (dy / dist) * maxSpd;   // num150/num151
    const num154 = sx, num155 = sy;                // 未反向的目标方向（朝向判据）
    if (flag17) { sx = -sx; sy = -sy; }            // :21662-21665 逃逸反向
    if (!player) { sx = this.facing * maxSpd / 2; sy = -maxSpd / 2; }  // 玩家死亡漂移（:21666-21669）
    if (flag13) {
      // 冲刺态速度（:21700-21711）：前 10t 速度 ×0.5（≥18t 归零）；之后以 14px/t
      // 直线冲（方向 = 当前速度，慢于 0.1 时改取朝玩家）
      const n156 = this.ai2;
      if (n156 < 10) {
        this.vx *= 0.5; this.vy *= 0.5;
        if (n156 >= 18) { this.vx = 0; this.vy = 0; }
      } else {
        let vx2 = this.vx, vy2 = this.vy;
        if (Math.hypot(this.vx, this.vy) < 0.1) { vx2 = player!.cx - this.cx; vy2 = player!.cy - this.cy; }
        const vl = Math.hypot(vx2, vy2) || 1;
        this.vx = (vx2 / vl) * 14;
        this.vy = (vy2 / vl) * 14;
      }
    } else {
      if (this.vx < sx) this.vx += accel;
      else if (this.vx > sx) this.vx -= accel;
      if (this.vy < sy) this.vy += accel;
      else if (this.vy > sy) this.vy -= accel;
    }
    // 朝向/旋转（:21713-21727；冲刺态冻结）：num154>0 → 右向不翻 + atan2；
    // <0 → 翻转 + atan2+π；694 的 spriteDirection 再取反（贴图口朝向与 34 相反）
    if (!flag13) {
      if (num154 > 0) { this.facing = -1; this.visAngle = Math.atan2(num155, num154); }
      else if (num154 < 0) { this.facing = 1; this.visAngle = Math.atan2(num155, num154) + Math.PI; }
      if (isMimic) this.facing *= -1;
    }
    // ---- 巨型诅咒颅 289 暗影焰（:21730-21761）：justHit 清态 + ≤500px 状态机
    //      （0 累计 120t → 1 冲刺段 40t），冲刺段 ai[2]==20 发射暗影焰（速 6、伤 25）----
    if (this.vanillaId === 289) {
      if (this.justHit) { this.ai2 = 0; this.ai3 = 0; }    // :21733-21735（受击打断蓄力）
      dx = player ? player.cx - this.cx : this.facing * 100;
      dy = player ? player.cy - this.cy : -100;
      const d289 = Math.hypot(dx, dy) || 1;
      if (player && d289 <= 500) {
        this.ai2 += 1;
        if (this.ai3 === 0) {
          if (this.ai2 > 120) { this.ai2 = 0; this.ai3 = 1; }
        } else {
          if (this.ai2 === 20) this.shootDart(game, this.cx, this.cy, dx, dy, 6, 25, 299);
          if (this.ai2 > 40) { this.ai3 = 0; this.ai2 = 0; }
        }
      } else { this.ai2 = 0; this.ai3 = 0; }
    }
    this.x += this.vx;
    this.y += this.vy;
    // ---- 694 水书宝箱怪攻击状态机（:21763-21888）----
    if (!isMimic) return;
    if (this.justHit) { this.ai2 = 0; this.ai3 = 0; }      // :21765-21767
    const mcx = this.cx, mcy = this.cy + 10;               // center4 = Center+(0,10)（:21768）
    const mdx = player ? player.cx - mcx : this.facing * 100;
    const mdy = player ? player.cy - mcy : -100;
    const md = Math.hypot(mdx, mdy);                       // num152
    // :21776-21783 flag18 = 中距带[100,300]+态 0/2（冲刺蓄力）;flag19 = ≤500+态 0/1（咒球蓄力）
    const flag18 = md >= 100 && md <= 300 && this.ai2 >= 0 && (this.ai3 === 0 || this.ai3 === 2);
    const flag19 = md <= 500 && this.ai2 >= 0 && (this.ai3 === 0 || this.ai3 === 1);
    if (flag18 && (!flag19 || Math.floor(Math.random() * 3) === 0)) {
      // 冲刺链（:21786-21797）：态 0 蓄 120t → 态 2 冲刺 60t → ai[2]=-300 冷却
      this.ai2 += 1;
      if (this.ai3 === 0) {
        if (this.ai2 > 120) { this.ai2 = 0; this.ai3 = 2; }
      } else if (this.ai3 === 2 && this.ai2 > 60) {
        this.ai2 = -300; this.ai3 = 0;
      }
    } else if (flag19) {
      // 咒球链（:21798-21827）：态 0 蓄 120t → 态 1 发射段；态 1 内 30t 结束，
      // ai[2]==17 时 Center+(0,10) 出一颗水球 33（NewNPC :21820-21824）
      this.ai2 += 1;
      if (this.ai3 === 0) {
        if (this.ai2 > 120) { this.ai2 = 0; this.ai3 = 1; }
      } else if (this.ai3 === 1) {
        if (this.ai2 > 30) { this.ai2 = 0; this.ai3 = 0; }
        if (this.ai2 === 17) {
          game.playSfxFiles(['Item_8'], 1, this.cx, this.cy);
          // NewNPC 锚 = 底边对齐 center4（16px 球 → 中心再 -8）
          const ball = Enemy.fromVanilla(33, mcx, mcy - 8);
          if (ball) addEnemy(game, ball);
        }
      }
    } else {
      // 脱档衰减（:21879-21886）：ai[2] 归零、态回 0
      this.ai2 += 1;
      if (this.ai2 > 0) this.ai2 = 0;
      this.ai3 = 0;
    }
  }

  /** 694 帧机（FindFrame case 694，NPC.cs:77905-77980）：
   *  态 3 伪装 → 帧 0；态 4 觉醒 → 帧 0..16（5t/帧）；态 2 冲刺 → 17..19(<40t)/..23；
   *  态 1 咒球 → 24..29；态 0 巡航 → 17/22/23 三帧循环（6t/帧）。
   *  npcFrameT = frameCounter（态切换清零），customFrameIdx 供渲染端直读 */
  private mimic694Frame(): void {
    this.npcFrameT += 1;
    let n = this.customFrameIdx ?? 0;
    if (this.ai3 === 3) {
      n = 0; this.npcFrameT = 0;
    } else if (this.ai3 === 4) {
      if (this.npcFrameT >= 5) { this.npcFrameT = 0; n = Math.min(16, n + 1); }
    } else if (this.ai3 === 2) {
      if (this.ai2 === 0) n = 17;
      if (n < 17 || n > 23) n = 17;
      if (this.npcFrameT >= 5) {
        this.npcFrameT = 0; n += 1;
        if (this.ai2 < 40 && n > 19) n = 19;
        if (n > 23) n = 23;
      }
    } else if (this.ai3 === 1) {
      if (n < 24 || n > 29) n = 24;
      if (this.npcFrameT >= 5) { this.npcFrameT = 0; n = Math.min(29, n + 1); }
    } else {
      if (n < 17 || n > 23) n = 17;
      if (this.npcFrameT >= 6) {
        this.npcFrameT = 0;
        n = n === 17 ? 22 : n === 22 ? 23 : 17;
      }
      if (n >= 30) n = 0;
    }
    this.customFrameIdx = n;
  }

  // AI_011 骷髅王(35)战斗状态机在 bossAI.ts skeletronBossAI；68 守卫走下方专用分支

  /** AI_011 地牢守卫(68)（NPC.145.cs:21937-21941, 22277-22288）：
   *  恒 ai[1]=2：伤害 9999、恒速 8 直线追击；玩家死/超 2000px → ai[1]=3 下坠脱场。
   *  noTileCollide 直移。生成瞬间一声 Roar（:21929-21933 localAI[0]==0 单次——
   *  地牢守卫是全游戏唯一"非物品召唤也咆哮"的生成点） */
  private dungeonGuardianAI(game: GameHooks, player: Player | null) {
    if (!this.aiInit) {
      this.aiInit = true; this.ai0 = 1;   // 初始化（L21910；68 无手 NPC）
      game.playSfx('roar', 1, this.cx, this.cy);
    }
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
    if (!this.aiInit) { this.aiInit = true;
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
    if (!this.aiInit) { this.aiInit = true;
      if ((game as unknown as { player?: Player }).player) {
        const p = (game as unknown as { player: Player }).player;
        this.facing = this.seekDirX(p);
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
    // ---- 点光（cs:24722-24724）：aiStyle21 全族（=72 火轮）火焰光
    //  (0.9, 0.3+num306, 0.2)，num306=(270−mouseTextColor)/400（190-255 三角波 → 0.0375-0.1375）
    if (this.vanillaId === 72) {
      const num306 = (270 - mouseTextColorApprox()) / 400;
      this.lightRGB = [0.9, 0.3 + num306, 0.2];
    }
  }

  /** AI_026 独角兽/冲锋族（NPC.cs:25863-26292）：
   *  冲锋 walker：accel 0.07 / maxSpd 6（num7/num8，独角兽 315 配置 L26100-26116）；
   *  逆向阻尼 0.95、超速落地 ×0.8；卡墙 30 tick 折返（ai[3]≥num1，玩家 <200px 重置 L25936-25941）；
   *  台阶步升 16.1 同战士（L26182-26207）；跳梯 -8.5/-7.5/-7/-6/-8（L26245-26279，
   *  前方探测含 (w/2+2)×dir + 5×vx 提前量 L26226-26227） */
  private chargerAI(game: GameHooks, player: Player | null, maxSpd = 6) {
    const st = game.world.store;
    // 游泳化 620 地精鲨（AI_107_ImprovedWalkers flag27=wet，cs:64122/:64300-64336）：
    // 游泳块在 walker 逻辑之前且 return 接管本 tick——wet 时跳过冲锋/跳跃
    if (this.vanillaId === 620 && this.wetSwimStep(game, player, 620)) return;
    // ---- 点光（cs:62852-62865）：type==315 无头骑士骑手段——Center (0.4,0.36,0.2)
    //  恒亮（南瓜灯头；在 type==315 块内、于 1001 骑手弹幕计时之后）
    if (this.vanillaId === 315) this.lightRGB = [0.4, 0.36, 0.2];
    const solidAt = (x: number, y: number) => x >= 0 && y >= 0 && x < st.w && y < st.h && st.isSolid(x, y);
    // 方向：卡墙 ≥30 tick 折返；玩家 200px 内重置计数并朝玩家冲
    if (this.stuckT >= 30) { this.facing *= -1; this.stuckT = 0; }
    if (player && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 200) {
      this.stuckT = 0;
      this.facing = this.seekDirX(player);
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
    this.applyGravity(game);
    const xBefore = this.x;
    moveAndCollide(this, game.world, this.vx, this.vy);
    // 怒滚虫 546 追击跳（AI_026 :63012-63017）：落地(vy==0) + |vx|>3 + 朝玩家侧 →
    // vy-=4 + PlaySound(3,11)=NPC_Hit_11（跳沙坑声）
    if (this.vanillaId === 546 && this.vy === 0 && Math.abs(this.vx) > 3 && player
      && ((this.cx < player.cx && this.vx > 0) || (this.cx > player.cx && this.vx < 0))) {
      this.vy -= 4;
      game.playSfxWav?.('NPC_Hit_11', 1, this.cx, this.cy);
    }
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
    const vampireBat = this.vanillaId === 158;
    let dirX: number, dirY: number;
    if (player) { dirX = player.cx > this.cx ? 1 : -1; dirY = player.cy > this.cy ? 1 : -1; }
    else { dirX = this.facing; dirY = -1; }
    // 吸血蝙蝠白天离场（cs:22944-22949）：158 且在地表之上 && 白天 && 非日食 →
    // directionY=-1 上飞、direction 翻转水平远离（曾缺——白天吸血蝙蝠赖场不退）
    if (vampireBat && this.y < game.world.groundLevel * TILE
      && game.world.clock.isDay && !game.world.clock.eclipse) {
      dirY = -1;
      dirX = -dirX;
    }
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
    // ---- wet 浮力（cs:23232-23243 蝙蝠/恶魔/巨狐蝠/孢子蝠族 + cs:23380-23392 哈比 48）：
    // 入水 vy>0 ×0.95、恒 -0.5 上浮、钳 -4 并重新索敌——飞行族扎水后弹出水面而非
    // 照常追击。表外 aiStyle14（158 吸血蝙蝠等）原版无此段
    if (this.wet && this.vanillaId !== null && AI014_SWIM_UP.has(this.vanillaId)) {
      if (this.vy > 0) this.vy *= 0.95;
      this.vy -= 0.5;
      if (this.vy < -4) this.vy = -4;
      if (player) this.facing = this.seekDirX(player);   // TargetClosest
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
    // ---- 吸血蝙蝠俯袭击变形（cs:23393-23402）：玩家在下方 200px 内且有视线 →
    // 落地化作人形吸血鬼（159，AI_003 战士 + 离远化回）
    if (vampireBat && player && !player.dead) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d < 200 && this.y + this.h < player.y + player.h && this.canSeePlayer(game.world.store, player)) {
        this.tryTransformTo(159, game.world.store, false, game);
      }
    }
    // ---- 飞行射击族（cs:23463-23543，逐发要求视线；轮空后 ai[0] 达随机阈值归零——
    // 阈值缓存 ai[2]）：哈比 48 羽毛 38（30/60/90 连三、速 6、伤 15、±100、归零 400+rand400）/
    // 恶魔 62/66 飞镰 44（20/40/60/80 连四、伤 21、±100、300+rand300；弹速 0.2 起步,
    // AI_018 加速 ×1.06@ai0[30,100) 见 Dart.ts DART_STYLE[44]）/ 红恶魔 156 三叉戟 115
    // （20/40/60/80/100 连五、伤 80、±50、250+rand250；弹速 0.2 起步 AI_027 ×1.125@ai0<30；
    // 出生点沿弹向前移 100px cs:23538-23540）
    const shooter = this.vanillaId === 48
      ? { ticks: [30, 60, 90], spd: 6, dmg: 15, spread: 100, reset: 400, proj: 38, lead: 0 }
      : this.vanillaId === 62 || this.vanillaId === 66
        ? { ticks: [20, 40, 60, 80], spd: 0.2, dmg: 21, spread: 100, reset: 300, proj: 44, lead: 0 }
        : this.vanillaId === 156
          ? { ticks: [20, 40, 60, 80, 100], spd: 0.2, dmg: 80, spread: 50, reset: 250, proj: 115, lead: 100 }
          : null;
    if (shooter && player && !player.dead) {
      if (this.ai0 < 0) this.ai0 = 0; // 类字段默认 -1120 是史莱姆初值；原版 ai[0] 从 0 起步
      this.ai0 += 1;
      if (shooter.ticks.includes(this.ai0)) {
        if (this.canSeePlayer(game.world.store, player)) {
          const ox = player.cx - this.cx + (Math.random() * 2 - 1) * shooter.spread;
          const oy = player.cy - this.cy + (Math.random() * 2 - 1) * shooter.spread;
          const d = Math.hypot(ox, oy) || 1;
          // 出生点沿弹向偏移 lead px（原版 vector25 += dir*100,cs:23538）
          this.shootDart(game, this.cx + (ox / d) * shooter.lead, this.cy + (oy / d) * shooter.lead,
            ox, oy, shooter.spd, shooter.dmg, shooter.proj);
        }
      } else if (this.ai0 > shooter.ticks[shooter.ticks.length - 1]) {
        if (this.ai2 === 0) this.ai2 = shooter.reset + Math.floor(Math.random() * shooter.reset);
        if (this.ai0 >= this.ai2) { this.ai0 = 0; this.ai2 = 0; }
      }
    }
  }

  /** AI_016 游泳族（1.4.5.6 NPC.145.cs:23549+）：鲨鱼/食人鱼/琵琶鱼等
   *  通用档水中 accel 0.1/0.1、上限 X±3/Y±2（L23883-23897）；Arapaima(157) 0.25/0.2、±7/±4（L23831+）；
   *  撞墙掉头；离水缓慢上浮。螺旋转向/专家模式特化略 */
  private swimAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    // wet = 原版 Collision.WetCollision（npcLiquid 每 tick 写；中心小盒判水线，
    // 浅水/贴面与中心格 liquid>80 近似有别——水面行为以此为准）
    const inWater = this.wet;
    if (player) this.facing = this.seekDirX(player);
    const dirX = player ? this.facing : (this.vx >= 0 ? 1 : -1);
    const dirY = player ? (player.cy > this.cy ? 1 : -1) : 0;
    const ara = this.vanillaId === 157;
    const ax = ara ? 0.25 : 0.1, ay = ara ? 0.2 : 0.1;
    const cx = ara ? 7 : 3, cy = ara ? 4 : 2;
    // ---- 河鲀 688 膨胀（cs:23555-23620）：受击进入膨胀 180t——缓速悬浮贴水面，
    // 期间不吃通用鱼逻辑（简化为阻尼漂浮，贴水线钉法省略）
    if (this.vanillaId === 688) {
      if (this.justHit && this.ai2 === 0) { this.ai2 = 1; this.ai3 = 180; }
      if (this.ai2 === 1) {
        this.vx *= 0.98;
        this.vy = inWater ? Math.max(this.vy - 0.3, -10) : Math.min(this.vy + 0.3, 10);
        this.vy *= 0.98;
        this.ai3 -= 1;
        if (this.ai3 <= 0) this.ai2 = 0;
        moveAndCollide(this, game.world, this.vx, this.vy);
        return;
      }
    }
    // ---- 海豚 615 周期跃出（cs:23629-23747）：每 300-1199t 触发，水中持续上冲
    //  （vy-=0.4 限 -6）出水后抛物线落回
    if (this.vanillaId === 615) {
      if (this.ai2 !== 1) {
        this.ai1 += 1;
        if (this.ai1 >= 300 + Math.random() * 900 && inWater) { this.ai2 = 1; this.ai1 = 0; }
      } else {
        if (inWater) {
          this.vy -= 0.4;
          if (this.vy < -6) this.vy = -6;
          // 跃出叫声（cs:23735-23740）：ai[3] 每 tick +1（≥300 清零回落），
          // ==60 且 1/2 掷 → (45)=Zombie_109 海豚音
          this.ai3 += 1;
          if (this.ai3 >= 300) { this.ai2 = 0; this.ai3 = 0; this.vy = 4; }
          else if (this.ai3 === 60 && Math.floor(Math.random() * 2) === 0) {
            game.playSfxWav?.('Zombie_109', 1, this.cx, this.cy);
          }
        } else {
          this.vy = Math.min(this.vy + 0.3, 10); // 出水抛物线
        }
        if (this.onGround || this.hitWall) this.ai2 = 0;
        moveAndCollide(this, game.world, this.vx, this.vy);
        return;
      }
    }
    if (inWater) {
      this.vx += dirX * ax;
      this.vy += dirY * ay;
      this.vx = Math.max(-cx, Math.min(cx, this.vx));
      this.vy = Math.max(-cy, Math.min(cy, this.vy));
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.hitWall) { this.facing *= -1; this.vx = -this.vx * 0.8; } // 撞墙掉头
    } else {
      // 离水（cs:24019-24034）：vy==0 → 拍打挣扎 vy=rand(-5,-2)/vx=rand(-2,2)
      // （65 食人鱼/692 貌鱼例外：只 ×0.94 阻尼不蹦）；重力 0.3 钳 10
      if (this.vy === 0) {
        if (this.vanillaId === 65 || this.vanillaId === 692) {
          this.vx *= 0.94;
          if (Math.abs(this.vx) < 0.2) this.vx = 0;
        } else {
          this.vy = -5 + Math.random() * 3;   // rand(-50,-20) × 0.1
          this.vx = -2 + Math.random() * 4;   // rand(-20,20) × 0.1
        }
      }
      this.vy = Math.min(this.vy + 0.3, 10);
      moveAndCollide(this, game.world, this.vx, this.vy);
    }
    // ---- 102 灯笼鱼额前小灯（cs:23820-23822）：面朝方向前 (width+8)px、y+2 处
    //  0.07/0.04/0.025 微光（钓竿诱饵）——位置偏移走 lightRGBAt ----
    if (this.vanillaId === 102) {
      this.lightRGB = [0.07, 0.04, 0.025];
      this.lightRGBAt = { x: this.x + this.w / 2 + this.facing * (this.w + 8), y: this.y + 2 };
    }
  }

  /** AI_018 水母族 1:1（cs:24212-24474）：潜伏（专家）+ 水中追击脉冲 + 上下漂移。
   *  潜伏 lurk（cs:24215-24269，仅专家且 63/64/103/242）：
   *   - ai[1]=1 潜伏中 → dontTakeDamage（不可击）且 AI 提前 return（原地悬浮）；
   *   - 玩家湿身+视线+150px 内：非潜伏 ai[2]+2（提前触发）/潜伏中 ai[2]−0.25（延长）；
   *   - 非潜伏 ai[2]≥420 → 入潜伏（ai[1]=1, ai[2]=0）；潜伏 ai[2]≥120 → 出潜伏；
   *   - 离水 → ai[1]=ai[2]=0（潜伏态清零）。发光 ×1.5（num274）。
   *  水中（cs:24330-24457）：撞轴反弹（collideX/collideY 原文 ± 反转）；玩家湿身+视线
   *   → 攻击形：阻尼（0.98 + 逐族再乘）+ 静止阈值 num277（63/64=0.2、103=0.6、221=1、
   *   242=3）内重定向脉冲 num278（7/103 9）；否则漂移形：vx+=dir×0.02 钳 ±1、
   *   rotation=vx×0.4、ai[0] 上下振荡（0.01 步进 ±1 阈值）+ 液深探测（上格液>128 且
   *   下 1-2 格有实心 → 转向上）。
   *  离水（cs:24459-24474）：rotation+=vx×0.1、vy==0 时 vx 阻尼归零、重力 0.2 钳 10
   *  ——水母离水只坠不蹦（与 aiStyle16 鱼的拍打挣扎不同） */
  private jellyfishAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const vid = this.vanillaId ?? 63;
    const inWater = this.wet;
    // ---- 潜伏态（专家 + 63/64/103/242，cs:24215）----
    const lurkCapable = mainExpertMode(game.world) && (vid === 63 || vid === 64 || vid === 103 || vid === 242);
    let lurking = false;
    if (inWater && this.ai1 === 1) lurking = true;
    else this.dontTakeDamage = false;                     // :24224 else 分支
    const playerWet = !!player && !player.dead && player.inWater;
    const near = !!player && !player.dead && playerWet
      && this.canSeePlayer(st, player)
      && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 150;  // :24229-24236
    if (lurkCapable) {
      if (inWater) {
        if (near) {
          if (this.ai1 === 0) this.ai2 += 2;              // 非潜伏：提前触发
          else this.ai2 -= 0.25;                          // 潜伏中：延长
        }
        if (lurking) {
          this.dontTakeDamage = true;                     // :24247
          this.ai2 += 1;
          if (this.ai2 >= 120) this.ai1 = 0;              // :24252 出潜伏
        } else {
          this.ai2 += 1;
          if (this.ai2 >= 420) { this.ai1 = 1; this.ai2 = 0; }  // :24257 入潜伏
        }
      } else {
        this.ai1 = 0; this.ai2 = 0;                       // :24262 离水清零
      }
      lurking = inWater && this.ai1 === 1;
    }
    // ---- 发光（cs:24272-24290，num274 = 1 + 潜伏 0.5）----
    const lum = lurking ? 1.5 : 1;
    if (vid === 63) this.lightRGB = [0.05 * lum, 0.15 * lum, 0.4 * lum];
    else if (vid === 103) this.lightRGB = [0.05 * lum, 0.45 * lum, 0.1 * lum];
    else if (vid !== 221 && vid !== 242) this.lightRGB = [0.35 * lum, 0.05 * lum, 0.2 * lum];
    // ---- 潜伏中：原地悬浮（AI 提前 return，velocity 保持 → 缓漂）----
    if (lurking) return;
    if (inWater) {
      // 撞轴反弹（cs:24333-24363：collideX/collideY 原速反转；坡面翻转由
      // moveAndCollide 的 slopeCollide 承担，方向翻转近似）
      if (this.hitWall) { this.vx *= -1; this.facing *= -1; }
      if (this.onGround) { if (this.vy > 0) { this.vy = -Math.abs(this.vy); this.ai0 = -1; } }
      else if (this.hitHead) { if (this.vy < 0) { this.vy = Math.abs(this.vy); this.ai0 = 1; } }
      // 玩家湿身 + 视线 → 攻击形（cs:24366-24420 flag24）
      if (playerWet && player && this.canSeePlayer(st, player)) {
        let damp = 0.98;
        let still = 0.2;                                   // num277：静止阈值
        if (vid === 103) { damp *= 0.98; still = 0.6; }
        if (vid === 221) { damp *= 0.99; still = 1; }
        if (vid === 242) { damp *= 0.995; still = 3; }
        this.visAngle = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        this.vx *= damp; this.vy *= damp;
        if (Math.abs(this.vx) < still && Math.abs(this.vy) < still) {
          if (player) {
            this.facing = this.seekDirX(player);          // TargetClosest
            const spd = vid === 103 ? 9 : 7;              // num278
            const dx = player.cx - this.cx, dy = player.cy - this.cy;
            const d = Math.hypot(dx, dy) || 1;
            this.vx = (dx / d) * spd;
            this.vy = (dy / d) * spd;
          }
        }
        moveAndCollide(this, game.world, this.vx, this.vy);
        return;
      }
      // 漂移形（cs:24421-24457）
      this.vx += this.facing * 0.02;
      this.visAngle = this.vx * 0.4;
      if (this.vx < -1 || this.vx > 1) this.vx *= 0.95;
      if (this.ai0 === -1) {
        this.vy -= 0.01;
        if (this.vy < -1) this.ai0 = 1;
      } else {
        this.vy += 0.01;
        if (this.vy > 1) this.ai0 = -1;
      }
      // 液深探测（cs:24440-24455）：中心上格液>128 且下 1-2 格实心 → 转向上
      const cx = Math.floor(this.cx / TILE), cy = Math.floor(this.cy / TILE);
      if (st.inBounds(cx, cy) && st.liquid[st.idx(cx, cy - 1)] > 128) {
        if ((st.inBounds(cx, cy + 1) && st.isActive(cx, cy + 1))
          || (st.inBounds(cx, cy + 2) && st.isActive(cx, cy + 2))) this.ai0 = -1;
      } else {
        this.ai0 = 1;
      }
      if (this.vy > 1.2 || this.vy < -1.2) this.vy *= 0.99;
      if (this.facing === 0) this.facing = player && player.cx > this.cx ? 1 : -1;
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    // ---- 离水（cs:24459-24474）----
    this.visAngle += this.vx * 0.1;
    if (this.vy === 0) {
      this.vx *= 0.98;
      if (Math.abs(this.vx) < 0.01) this.vx = 0;
    }
    this.vy = Math.min(this.vy + 0.2, 10);
    this.ai0 = 1;
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_022 幽灵族（NPC.145.cs:24726+）：穿墙缓速追击
   *  目标速度 = 归一化方向×7（num312），Lerp 系数 0.0125（num317）——飘忽逼近的手感 */
  private ghostAI(game: GameHooks, player: Player | null) {
    // ---- 点光（cs:24858-24860 蜗牛怪 / cs:24934-24936 冰雪元素，Center，恒亮）----
    if (this.vanillaId === 122) this.lightRGB = [0.4, 0, 0.25];
    else if (this.vanillaId === 169) this.lightRGB = [0, 0.6, 0.75];
    // 小精灵 75 环境声（cs:24928）：1/40 掷 → PlaySound(27)=Pixie.wav（闪烁伴随 55 尘
    //   1/6 已在通用尘段;音频在 type==75 专属块）
    if (this.vanillaId === 75 && Math.floor(Math.random() * 40) === 0) {
      game.playSfxWav?.('Pixie', 1, this.cx, this.cy);
    }
    // 幽灵 316 消散（cs:24750-24758）：ai[3]==1 首帧 → NPCDeath55
    if (this.vanillaId === 316 && this.ai3 === 1 && !(this as unknown as { _g316snd?: boolean })._g316snd) {
      (this as unknown as { _g316snd?: boolean })._g316snd = true;
      game.playSfxFiles(['NPC_Killed_55'], 1, this.cx, this.cy);
    }
    if (!player) { this.vx *= 0.95; this.vy *= 0.95; return; }
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += ((dx / d) * 7 - this.vx) * 0.0125;
    this.vy += ((dy / d) * 7 - this.vy) * 0.0125;
    this.facing = this.vx > 0 ? 1 : -1;
    // ---- 漂浮射击三族（cs:24854-25048）----
    // 蜗牛怪 122 粉激光 / 冰雪元素 169 霜爆：同一充能机——待机计数(localAI[1]→ai[2])
    // >120 且有视线 → 充能(ai[3]=1)；充能中出射程即取消、满 64 归零；受击清空；
    // 122 在 ai[3]==32 发射（速 7、伤 25、射程 700、RotatedByRandom(0.0785) 微散布），
    // 169 在 ai[3]==16 发射（速 5、伤 45）
    // 脓水粘怪 268 金雨：ai[3] 每 tick +1（受击置 -45），≥60+rand(60) 且有视线 →
    // 喷（速 10、伤 40、|dx|×0.1 下坠补偿、枪口 (cx-4, y+h×0.7)、散布 x±10/y-30..20）
    const st = game.world.store;
    if (this.vanillaId === 122 || this.vanillaId === 169) {
      const fireAt = this.vanillaId === 122 ? 32 : 16;
      if (this.iframes > 0 && this.iframes % 4 === 0) { this.ai3 = 0; this.ai2 = 0; } // justHit 清充能
      if (this.ai3 === fireAt && d < 700) {
        const spd = this.vanillaId === 122 ? 7 : 5;
        const dmg = this.vanillaId === 122 ? 25 : 45;
        const ang = Math.atan2(dy, dx) + (this.vanillaId === 122 ? (Math.random() - 0.5) * 0.157 : 0);
        const angDart = new Dart(this.cx, this.cy, Math.cos(ang) * spd, Math.sin(ang) * spd, dmg,
          this.vanillaId === 122 ? 84 : 128);
        angDart.hostile = true; // 122 粉激光眼/169 冰元素直构弹——敌怪弹（v5 bit7）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities
          .add(angDart, 'projectiles');
      }
      if (this.ai3 > 0) {
        this.ai3++;
        if (d >= 700) this.ai3 = 0; // 出射程取消充能
        if (this.ai3 >= 64) this.ai3 = 0;
      }
      if (this.ai3 === 0) {
        this.ai2++;
        if (this.ai2 > 120 && this.canSeePlayer(st, player)) { this.ai2 = 0; this.ai3 = 1; }
      }
    } else if (this.vanillaId === 268) {
      this.ai3++;
      if (this.iframes > 0 && this.iframes % 4 === 0) this.ai3 = -45; // 受击冷却
      if (this.ai2 === 0) this.ai2 = 60 + Math.floor(Math.random() * 60);
      if (this.ai3 >= this.ai2 && this.canSeePlayer(st, player)) {
        const ox = this.cx - 4, oy = this.y + this.h * 0.7;
        const tx = player.cx - ox + (Math.random() * 20 - 10);
        const ty = player.cy - oy - Math.abs(player.cx - ox) * 0.1 + (Math.random() * 50 - 30);
        this.shootDart(game, ox, oy, tx, ty, 10, 40, 288);
        this.ai3 = 0; this.ai2 = 0;
      }
    }
    // 幽灵族 noTileCollide：直接位移
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_122 海盗幽灵 662（NPC.cs:45177-45210 1:1；SetDefaults :17302-17317
   *  noGravity+noTileCollide+lavaImmune+trapImmune——此前误落 default zombieAI 成
   *  地面怪，2026-08-17 修正）：
   *  - localAI[0]==0 → 一次性出场音 NPCHit6（:45179-45183）；
   *  - 失标（玩家死亡/无效，TargetClosest 后仍无目标，:45184-45202）：velocity×0.9、
   *    alpha +5/t 渐隐，至 255 → StrikeNPCNoInteraction(9999) 自灭；
   *  - 有标：alpha −5/t 渐显（:45204）；targetPos = 指向玩家向量限长 4
   *    （Vector2.Zero.MoveTowards(Δ,4)），velocity 以 2/15 步进趋近（MoveTowards）；
   *  - 同型互斥（:45206-45219）：50px 内另一只 662 → velocity −= unit×0.1、
   *    X 再 −= unit.X×1（合计 X 推离 0.2 / Y 0.1）；
   *  - noGravity+noTileCollide → 无重力直接积分位移（ghostAI 同款先例）。
   *  FindFrame case 122（:74305，spriteDirection/rotation=vx×0.05/8t 三帧）渲染侧
   *  未接，登记。 */
  private pirateGhostAI(game: GameHooks, player: Player | null) {
    const x = lunarLocalAI(this);
    if (x[0] === 0) {
      x[0] = 1;
      game.playSfxFiles(['NPC_Hit_6'], 1, this.cx, this.cy);
    }
    if (!player) {
      this.vx *= 0.9;
      this.vy *= 0.9;
      this.spawnAlpha = Math.min(255, this.spawnAlpha + 5);
      if (this.spawnAlpha >= 255) this.hurt(9999, 0, 0, game); // 走标准死亡管线
      return;
    }
    this.spawnAlpha = Math.max(0, this.spawnAlpha - 5);
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const d = Math.hypot(dx, dy);
    const tx = d > 4 ? (dx / d) * 4 : dx;   // MoveTowards(Zero, Δ, 4)：限长 4
    const ty = d > 4 ? (dy / d) * 4 : dy;
    const step = 2 / 15;                    // velocity.MoveTowards(targetPos, 2/15)
    const mv = (cur: number, tgt: number) => {
      const diff = tgt - cur;
      return Math.abs(diff) <= step ? tgt : cur + Math.sign(diff) * step;
    };
    this.vx = mv(this.vx, tx);
    this.vy = mv(this.vy, ty);
    for (const o of game.enemies() as Enemy[]) {
      if (o === this || o.dead || o.vanillaId !== 662) continue;
      const ox = o.cx - this.cx, oy = o.cy - this.cy;
      const od = Math.hypot(ox, oy);
      if (od > 0 && od < 50) {
        const ux = (ox / od) * 0.1, uy = (oy / od) * 0.1;
        this.vx -= ux; this.vx -= ux;   // −unit×0.1 后 X 再 −unit.X×1 → X 合计 0.2
        this.vy -= uy;
      }
    }
    if (this.vx !== 0) this.facing = this.vx > 0 ? 1 : -1;
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_024 鸟（NPC.cs:25396-25622 1:1）：三态——0 地面站立 / 1 飞行 / 2 降落。
   *  鸮族(611/689)专属：出生即飞行；夜间栖息城镇 NPC 屋檐(ai0=2)；689 夜间
   *  玩家 <80px 有视线 → Transform(317 魔眼)。
   *  飞行：X 轴 0.1 步进,帽 3(丛林鸟 671-675 帽 4,:25495-25499);Y 轴前方
   *  下探 15 格——全空 vy+=0.05 缓沉,受阻 vy-=0.1,近障 5 格内再 -0.2(:25568-25605);
   *  撞墙 direction 反转 + 旧速×-0.5(最小 ±(cap-1)/±1);湿态上浮(:25596-25610)。
   *  鸟粪弹(BirdThatCanPoop→proj 1080,:25398-25407)未接——缺小动物→弹幕钩子,备案 */
  private birdAI(game: GameHooks, player: Player | null) {
    // ai0===0/2 等值门：类默认 -1120 全空转 = 鸟永久滞空（地面/降落态成死代码）
    if (this.ai0 < 0) this.ai0 = 0;
    const st = game.world.store;
    const oldVx = this.vx, oldVy = this.vy;
    const id = this.vanillaId ?? 0;
    const owl = id === 611 || id === 689;
    const day = game.world.clock.isDay;
    const cloud = (game.world.weather.cloudAlpha ?? 0) > 0;
    // ---- 鸮族专属段（:25408-25451）----
    // 689 夜间玩家 <80px 有视线 → Transform(317 魔眼)（:25409-25416）
    if (id === 689 && !day && player && !player.dead
      && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 80
      && canHit(st, this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)) {
      this.tryTransformTo(317, st, false, game);
      return;
    }
    // 出生即飞行（localAI[0]==0 → TargetClosest+ai[0]=1,:25410-25416）
    if (owl && !this.owlAirborneInit) {
      this.owlAirborneInit = true;
      this.ai0 = 1;
      if (player) this.facing = player.cx > this.cx ? 1 : -1;
    } else if (owl && this.ai0 === 1 && !cloud && !day) {
      // 夜间晴空栖息轮（:25426-25451）：城镇 NPC 下方（|dx|<96、dy 32-320、无视线）
      // → ai0=2 降落栖息；同型非飞行个体 320px 内 → 回 ai0=1 防扎堆
      for (const n of (game.npcs?.() ?? []) as Array<{ x: number; y: number; w: number; h: number; dead?: boolean }>) {
        if ((n as { dead?: boolean }).dead) continue;
        const ncx = n.x + n.w / 2, ncy = n.y + n.h / 2;
        if (Math.abs(this.cx - ncx) < 96) {
          const dy = ncy - this.cy;
          if (dy > 32 && dy < 320
            && !canHit(st, this.x, this.y, this.w, this.h, n.x, n.y, n.w, n.h)) {
            this.ai0 = 2;
          }
        }
      }
      for (const c of (game.critters?.() ?? []) as Array<{ cx?: number; x?: number; w?: number; vanillaId?: number; ai0?: number; dead?: boolean }>) {
        if ((c as { dead?: boolean }).dead || c === (this as unknown) || c.vanillaId !== id || c.ai0 === 1) continue;
        const ccx = (c.cx ?? (c.x ?? 0) + (c.w ?? 0) / 2);
        if (Math.abs(this.cx - ccx) < 320) { this.ai0 = 1; break; }
      }
    }
    if (this.ai0 === 0) {
      // 地面态（NPC.cs:25453-25481 1:1）：重力站立，**不踱步**——原版 vx 恒 0
      // （降落态 :25488 归零后不再赋值），FindFrame 站定门 vx==0&&vy==0 → 站立帧。
      // 曾自创 ±0.7 随机踱步 → vx 永不为 0，地面恒播飞行动画（2026-08-18 报）。
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      // 鸮族白天/阴天自动起飞（:25456-25459）——不翻向不设速
      if (owl && (day || cloud)) {
        this.ai0 = 1;
      } else if (this.vx !== 0 || this.vy < 0 || this.vy > 0.3) {
        // 被释放/被推动 → 起飞 + 翻向（:25463-25468；releaseOwner 未建字段,
        // 释放路径落速即触发生效）
        this.ai0 = 1;
        this.facing = -(this.facing || 1);
      } else if (!owl && player && !player.dead) {
        // 玩家进 ±100px 盒（:25472 position-100±(w+200) 相交）或受伤 → 起飞：
        // vy-=6 + direction 翻转（TargetClosest 朝玩家后取反 = 远离玩家）
        const near = player.x < this.x + this.w + 100 && player.x + player.w > this.x - 100
          && player.y < this.y + this.h + 100 && player.y + player.h > this.y - 100;
        if (near || this.hp !== this.maxHp) {
          this.ai0 = 1;
          this.vy -= 6;
          this.facing = player.cx > this.cx ? -1 : 1;
        }
      }
    } else if (this.ai0 === 2) {
      // 降落态（:25482-25493）：vx×0.98 缓降 vy+0.05 帽 2;落地（vy==0 检查在重力前,
      // onGround 旗标等价）→ 回地面态 + vx 归零（站定门的保证）
      this.vx *= 0.98;
      this.vy = Math.min(this.vy + 0.05, 2);
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.onGround) { this.ai0 = 0; this.vx = 0; }
    } else if (player && !player.dead) {
      // 飞行态（:25495-25595;目标玩家死亡时整段跳过——鸟保持惯性）
      const dir = this.facing;
      const cap = (id >= 671 && id <= 675) ? 4 : 3;   // num356:丛林鸟 4 其余 3
      if (dir === -1 && this.vx > -cap) {
        this.vx -= 0.1;
        if (this.vx > 0) this.vx -= 0.05;
        if (this.vx < -cap) this.vx = -cap;
      } else if (dir === 1 && this.vx < cap) {
        this.vx += 0.1;
        if (this.vx < 0) this.vx += 0.05;
        if (this.vx > cap) this.vx = cap;
      }
      // Y 轴：前方 15 格下探（:25568-25602）
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
    // 湿态上浮（:25596-25610,三态通用）：ai[1]=0 + vy>0×0.95 + vy-=0.5 钳 -4
    //  + TargetClosest（朝玩家）
    if (this.wet) {
      this.vy = (this.vy > 0 ? this.vy * 0.95 : this.vy) - 0.5;
      if (this.vy < -4) this.vy = -4;
      if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
    }
  }

  /** AI_065 蝶/萤（NPC.cs:34488 AI_065_Butterflies）：正弦游荡漂移 */
  /** AI_065 蝴蝶族（AI_065_Butterflies cs:45231）：ai[0]/ai[1]=目标速度分量，漂移速度
   *  0.26-3.0 每 60-179 帧重选（近距 90-239 帧）；平滑 v=(v*59+目标)/60（cs:45231 系数 60）；
   *  垂直避障：向下 4 格实心/液体 → 反向，向上 30 格无实心 → 反向；collideX → vx×-0.2 翻 ai0；
   *  主动避敌（每 15 帧 cs:45395-45427）：100px 内敌怪叠加反向速度（上限 16）。
   *  ★661 帝皇蝶 ai2 = 离神圣渐隐计数（cs:45253，专用——见 lacewingFadeStep），
   *  漂移重选计时对该 id 移 lai0（= 原版 localAI[0]，:45312-45315 本就是族漂移计时），
   *  其余蝴蝶族 ai2 沿用漂移计时不变。 */
  private butterflyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) { this.aiInit = true; this.ai0 = 0; this.ai1 = 0; this.ai2 = 0; }
    const isLacewing = this.vanillaId === 661;
    // ---- 物种槽（cs:45292-45307）：ai[2]==0 且非 661 → 加权掷八物种
    //  （Next(100) 映射:1%→5/2%→1/6%→2/10%→7/15%→3/19%→6/25%→0/其余 22%→4），
    //  ai[2]=1+物种；释放入口带 Style 直存（ReleaseNPC case 356 ai[2]=Style——
    //  捕获物 1994-2001 → placeStyle=1+item-1994）不掷 ----
    if (!isLacewing && this.ai2 < 1) {
      const r100 = Math.floor(Math.random() * 100);
      const sp = r100 === 0 ? 5 : r100 < 3 ? 1 : r100 < 9 ? 2 : r100 < 19 ? 7
        : r100 < 34 ? 3 : r100 < 53 ? 6 : r100 >= 75 ? 0 : 4;
      this.ai2 = 1 + sp;
    }
    // ---- 点光（AI_065_Butterflies，cs:45233-45241 / :45448-45453）----
    if (isLacewing) {
      // :45233-45237 光皇蝴蝶：hslToRgb(GlobalTimeWrappedHourly×0.33 % 1, 1, 0.5)×0.3
      //  + 白 0.1。GlobalTimeWrappedHourly 1 游戏小时 = 54000 帧 → 色相周期 ≈163636 帧
      const [hr, hg, hb] = hslToRgb((visEffectFrames() / 54000) * 0.33, 1, 0.5);
      this.lightRGB = [hr * 0.3 + 0.1, hg * 0.3 + 0.1, hb * 0.3 + 0.1];
    } else if (this.vanillaId === 653) {
      this.lightRGB = [0.6, 0.3, 0.1];      // :45448-45453 地狱蝴蝶恒亮 + 尘 6 号 1/60
    }
    // ---- 661 渐隐计数（cs:45235-45291，段内 return = 原版 active=false 消散）----
    if (isLacewing) {
      let cap = 50;                                            // num4（cs:45242）
      // cs:45244-45247：目标失效或中心距 ≥300 → 渐隐（本仓目标=主角，死亡由分发传 null）
      let fading = !player
        || Math.hypot(player.cx - this.cx, player.cy - this.cy) >= 300;
      // cs:45248-45252：非 remix 世界（本仓无 remix）且目标玩家不在神圣 → 上限抬 60 且渐隐
      //（scene 缺席按"在神圣"处理——不因快照缺失误触发渐隐）
      if (player && game.scene && !game.scene.zoneHallow) { cap = 60; fading = true; }
      const f = lacewingFadeStep(this.ai2, fading, cap);
      this.ai2 = f.ai2;
      if (f.despawn) { this.dead = true; return; }             // cs:45254-45262
      this.spawnAlpha = Math.round((1 - f.opacity) * 255);     // cs:45263 Opacity → alpha
      this.dontTakeDamage = this.ai2 >= cap / 2;               // cs:45290 渐隐过半不可击
      if (this.ai2 > 0 && Math.floor(Math.random() * 5) === 0) {
        // cs:45264-45289 尘 267 双份（彩虹原色 + 半幅白叠）→ 单粒近似
        game.spawnParticles(this.cx, this.cy, '#E8B0FF', 1, 0.5, { life: 30, damp: 0.94 });
      }
    }
    // 漂移目标重选（计时槽 = localAI[0]（cs:45310 lai0 递减）——ai[2] 留给
    //  蝴蝶物种/661 渐隐，曾误把蝴蝶漂移计时也写 ai2（会随重选覆写物种带））
    const driftGet = (): number => this.lai0;
    const driftSet = (v: number): void => { this.lai0 = v; };
    if (driftGet() <= 0) {
      this.ai0 = (Math.random() * 2 - 1) * (0.26 + Math.random() * 2.74);
      this.ai1 = (Math.random() * 2 - 1) * (0.26 + Math.random() * 2.74);
      driftSet(60 + Math.floor(Math.random() * 120));
    }
    driftSet(driftGet() - 1);
    // 避敌（每 15 帧）
    if (this.aiT % 15 === 0) {
      for (const o of game.enemies()) {
        const e = o as Enemy;
        if (e === this || e.dead || e.def.damage <= 0) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < 100 && d > 0.01) {
          this.ai0 += ((this.cx - e.cx) / d) * 2;
          this.ai1 += ((this.cy - e.cy) / d) * 2;
        }
      }
      const spd = Math.hypot(this.ai0, this.ai1);
      if (spd > 16) { this.ai0 = (this.ai0 / spd) * 16; this.ai1 = (this.ai1 / spd) * 16; }
    }
    // 垂直避障
    const cx = Math.floor(this.cx / TILE), cy = Math.floor(this.cy / TILE);
    // (:34427-34448) vy>0 查下方 4 格(实心/液体 → 翻转目标+vy×0.9);
    // (:34450-34464) vy<0 查下方 30 格(**下方**非上方——曾写反成 cy-k,
    // 空旷世界恒"上方空" → 向上目标被每帧强制翻正 → 萤火虫确定性下沉)
    if (this.vy > 0) {
      let belowHit = false;
      for (let k = 0; k <= 4 && !belowHit; k++) {
        if (st.isSolid(cx, cy + k) || st.liquid[st.idx(cx, cy + k)] > 0) belowHit = true;
      }
      if (belowHit) { this.ai1 = -this.ai1; this.vy *= 0.9; }
    } else if (this.vy < 0) {
      let belowClear = true;
      for (let k = 0; k <= 30 && belowClear; k++) if (st.isSolid(cx, cy + k)) belowClear = false;
      if (belowClear) { this.ai1 = -this.ai1; this.vy *= 0.9; }
    }
    // 平滑逼近
    this.vx = (this.vx * 59 + this.ai0) / 60;
    this.vy = (this.vy * 59 + this.ai1) / 60;
    this.facing = this.vx > 0 ? 1 : -1;
    const oldVx = this.vx;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) {
      this.vx = oldVx * -0.2;
      this.ai0 = -this.ai0;
      driftSet(0);
    }
  }

  /** 小动物路由：按 aiStyle 精确分流到各家族 1:1 实现（AI_001/016 复用既有精确 AI） */
  private critterWanderAI(game: GameHooks, player: Player | null) {
    switch (this.vanilla?.aiStyle ?? 0) {
      case 24: this.birdAI(game, player); return;                        // AI_024 鸟
      case 1: this.slimeAI(game, player); return;                         // AI_001 蚱蜢（含专属差异项）
      case 16: this.swimAI(game, player); return;                         // AI_016 鱼类小动物（含河鲀/海豚特化）
      case 64: this.fireflyAI(game, player); return;                      // AI_064 萤火虫
      case 65: this.butterflyAI(game, player); return;                    // AI_065 蝴蝶
      case 66: this.wormCritterAI(game); return;                          // AI_066 蠕虫
      case 67: this.snailAI(game); return;                                // AI_067 蜗牛
      case 68: this.duckFlyAI(game, player); return;                      // AI_068 鸭飞形
      case 112: this.fairyAI(game, player); return;                       // AI_112 仙灵
      case 113: this.windyBalloonAI(game, player); return;                // AI_113 风气球（cs:43036 挂史莱姆）
      case 114: this.dragonflyAI(game, player); return;                   // AI_114 蜻蜓
      case 119: this.dandelionAI(game, player); return;                   // AI_119 蒲公英（cs:43254 喷籽）
      case 115: this.ladybugAI(game, player); return;                     // AI_115 瓢虫/椿象
      case 116: this.waterStriderAI(game); return;                        // AI_116 水黾
      case 118: this.seahorseAI(game); return;                            // AI_118 海马
      default: this.townCritterWalkAI(game, player); return;              // AI_007 小动物行走
    }
  }

  /** AI_007 小动物行走（NPC.cs:53366+ 的 TownCritter 分支）：站/走循环 + 台阶跳 + 危险逃离。
   *  速度表（cs:54280-54326）：默认 1/0.07；松鼠族(299/538/539/639-645) 1.5；
   *  龟(616/617/625) 陆 0.5、水中 2（625 2.5）；鼠类(300/447/610) 2/1 不跳改转身；
   *  青蛙(361/445/687) 水中 |v|<0.05 时 vx += maxX*10*dir 否则 ×0.9（cs:54333-54342）。
   *  钉水面（cs:55586-55620 flag12&&wet）：龟/蛙 Center 钉 GetWaterLine 液面（蛙走计时→50）。
   *  节奏（cs:54030）：站→走 200+rand300+rand(200,400)、走→站 300+rand300-rand100。
   *  跳跃（cs:54315-54417）：前方 1 格实心+净空 → vy=-5、2 格 → -6、半砖 → -4.4，
   *  否则危险中 ai0=8 僵立 240t / 平时掉头；上升 ×1.2（非鼠类）。
   *  危险扫描（cs:53884-54028，每 15t）：200px 内敌怪+视线 → 逃离 120+rand120。
   *  鸭/海鸥/鷿鷈行走形(362/364/602/608)：wet 或 |vy|>4 → Transform(+1) 飞形（cs:53585） */
  private townCritterWalkAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const vid = this.vanillaId ?? 0;
    // ---- 松鼠黑化彩蛋（NPC.cs:53797-53812）：CritterThatCanTurnOnPlayers
    //  （NPCID.cs:4779 = 松鼠 299/红 538/金 539 + 宝石松鼠 639-645）玩家 CanHit
    //  内 RollOnlyBadLuckExtreme(3000)==0 → ai[3]=2 → lifeMax 25/防+6/伤 20/
    //  aiStyle=3 反咬（永久转战士；IsThisCenx 彩蛋不移植）----
    if (CRITTER_TURN_ON_PLAYERS.has(vid)) {
      if (this.ai3 !== 2 && player && !player.dead
        && canHit(st, this.x, this.y, this.w, this.h, player.x, player.y, player.w, player.h)
        && rollOnlyBadLuckExtreme((player as unknown as { luck: number }).luck, 3000) === 0) {
        this.ai3 = 2;
      }
      if (this.ai3 === 2) {
        if (this.maxHp === 5) {           // lifeMax==5 门（一次性升级）
          this.maxHp = 25;
          this.hp = 25;
          this.def.defense = (this.def.defense ?? 0) + 6;   // defense 可选字段,复合赋值须空合并
          this.def.damage = 20;
        }
        this.fighterAI(game, player);     // aiStyle=3 转战士核
        return;
      }
    }
    // 687 神秘青蛙点光（NPC.cs:55974-55979：type==683||687 → (0.25,0.25,0.1)×
    //  Utils.WrappedLerp(0.75,1,t%120/120)；683 黄城镇史莱姆在 TownNPC 桶自报）
    if (vid === 687) {
      const p120 = (visEffectFrames() % 120) / 120;
      const tri = p120 * 2 > 1 ? 2 - p120 * 2 : p120 * 2;
      const l = 0.75 + 0.25 * tri;
      this.lightRGB = [0.25 * l, 0.25 * l, 0.1 * l];
    }
    if (this.ai0 < 0 || this.ai0 > 8) this.ai0 = 0;
    if (this.ai1 < 0) this.ai1 = 100; // 初值：站立约 100t 后开始游走
    // 危险扫描（每 15t）
    if (this.aiT % 15 === 0) {
      for (const o of game.enemies()) {
        const e = o as Enemy;
        if (e === this || e.dead || e.def.damage <= 0) continue;
        if (Math.hypot(e.cx - this.cx, e.cy - this.cy) < 200) {
          this.ai0 = 1;
          this.ai1 = 120 + Math.random() * 120;
          this.facing = e.cx > this.cx ? -1 : 1;
          break;
        }
      }
    }
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    // 形态链：行走鸭族遇水/坠落 → 飞形（cs:53585-53589）
    if ((vid === 362 || vid === 364 || vid === 602 || vid === 608) && (inWater || Math.abs(this.vy) > 4)) {
      this.tryTransformTo(vid + 1, st, false, game);
      return;
    }
    // 速度表
    const squirrel = vid === 299 || vid === 538 || vid === 539 || (vid >= 639 && vid <= 645);
    const turtle = vid === 616 || vid === 617 || vid === 625;
    const rat = vid === 300 || vid === 447 || vid === 610;
    const frog = vid === 361 || vid === 445 || vid === 687;
    let maxX = 1, acc = 0.07;
    if (squirrel) maxX = 1.5;
    else if (turtle) { maxX = inWater ? (vid === 625 ? 2.5 : 2) : 0.5; if (inWater) acc = 1; }
    else if (rat) { maxX = 2; acc = 1; }
    // 状态流转
    this.ai1 -= 1;
    if (this.ai0 === 0) {
      this.vx *= 0.8;
      if (this.ai1 <= 0) { // 站→走
        this.ai0 = 1;
        this.ai1 = 300 + Math.random() * 300 - Math.random() * 100;
        if (Math.random() < 0.5) this.facing *= -1;
      }
    } else {
      this.vx += this.facing * acc;
      this.vx = Math.max(-maxX, Math.min(maxX, this.vx));
      // 青蛙水中窜游（cs:54333-54342 flag9&&wet：|vx| 且 |vy| 均 <0.05 才补一窜，否则 ×0.9）
      if (frog && inWater) {
        if (Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05) this.vx += maxX * 10 * this.facing;
        else this.vx *= 0.9;
      }
      if (this.ai1 <= 0) { // 走→站
        this.ai0 = 0;
        this.ai1 = 200 + Math.random() * 300 + 200 + Math.random() * 200;
        this.vx = 0;
      }
    }
    // 台阶跳跃判定（碰撞前速度符号门略——小动物无冲撞语义）
    const frontX = Math.floor((this.cx + this.facing * (this.w / 2 + 8)) / TILE);
    const footY = Math.floor((this.y + this.h - 1) / TILE);
    if (this.onGround && this.vx !== 0 && st.isSolid(frontX, footY)) {
      if (rat) { // 鼠类不跳，转身
        this.facing *= -1;
        this.vx = 0;
      } else if (!st.isSolid(frontX, footY - 1) && !st.isSolid(frontX, footY - 2)) {
        this.vy = -5;
        this.vy *= 1.2; // TownCritter 上升补偿（cs:54398-54405）
      } else if (st.isSolid(frontX, footY - 1) && !st.isSolid(frontX, footY - 3)) {
        this.vy = -6;
        this.vy *= 1.2;
      } else {
        this.facing *= -1; // 跳不过去：掉头
      }
    }
    // ---- 龟/蛙钉水面（cs:55586-55620 flag12&&wet，AI_007 顶层非状态分支）----
    // flag12 = 龟族(616/617/625) ∪ 蛙族(361/445/687)。湿身时 Center 钉在 GetWaterLine
    // 线上（Collision.cs:1501，液面 = 行×16 − liquid/16 整除）：线下 → 上浮 0.8 钳 −4
    // 且不过线（num95=Center+1）；线上 → 只允许落到线。蛙另把走计时砍到 50（连窜）。
    // 撞墙/贴图边 → 掉头 ×−0.25。无液面可钉（中心上 2 行仍有液=深处/越界）→ vy−0.2。
    // 重力走原版湿侧（UpdateNPC_UpdateGravity :91936：0.2/落速帽 7）——干侧 0.4 会让
    // 钉面失衡下沉（0.4−0.2=净沉），此为 GRAVITY 偏差登记的定点补偿
    const pinSurface = (turtle || frog) && this.wet;
    this.vy = Math.min(this.vy + (pinSurface ? 0.2 : GRAVITY), pinSurface ? 7 : MAX_FALL_SPEED);
    if (pinSurface) {
      if (frog) this.ai1 = 50;
      const ctx = Math.floor(this.cx / TILE);
      if (this.hitWall || (ctx < 5 && this.facing === -1) || (ctx > st.w - 5 && this.facing === 1)) {
        this.facing *= -1;
        this.vx *= -0.25;
      }
      const { found, line } = getWaterLine(st, ctx, Math.floor(this.cy / TILE));
      if (found) {
        const anchor = this.cy + 1;                       // num95
        if (this.cy > line) {
          this.vy -= 0.8;
          if (this.vy < -4) this.vy = -4;
          if (anchor + this.vy < line) this.vy = line - anchor;
        } else {
          this.vy = Math.min(this.vy, line - anchor);
        }
      } else {
        this.vy -= 0.2;                                   // 与湿侧重力 0.2 抵消 → 深水中性悬浮
      }
    }
    moveAndCollide(this, game.world, this.vx, this.vy);
    // （原版行走态无地面摩擦：velocity.X 持续到 cap，仅站立刻车 ±0.1——旧
    //  `onGround && vx*=0.85` 自创衰减把巡航压到 0.397px/t（稳态 0.07/0.15），
    //  约为原版 1.0 的一半，已删）
    if (this.hitWall && !rat) this.facing *= -1;
  }

  /** AI_064 萤火虫族（cs:34256-34486）：ai[0]/ai[1]=目标速度、ai[2]=漂移重选计时；
   *  远距（>700px）漂移 0.5-1.5、近距 0.05-1.5，Y 偏向上（-100..+250）；
   *  平滑 v=(v*79+目标)/80；垂直避障（下 4 格实心/液体、上 30 格全空 → 反向）；
   *  collideX → vx×-0.2 翻 ai0。677 仙尘：敌怪 100px/玩家 150px 内逃逸叠加（上限 8）。
   *  白天不消失只不发光（发光在 cs:34416 由 !dayTime 门——光照层未接入小动物，备案） */
  private fireflyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) {
      this.aiInit = true;
      this.ai0 = 0; this.ai1 = 0; this.ai2 = 60 + Math.floor(Math.random() * 120);
      // 随机 scale 0.75-1.11（cs 内 ai[3]，影响光照强度与渲染尺寸）
      this.ai3 = 0.75 + Math.random() * 0.36;
      this.vanillaScale = this.ai3;
    }
    // ---- 闪烁发光（cs:34412-34423）：间隔 30-180 帧；!白天 或 地下(y>worldSurface+10)
    // 时进入 10-30 帧发光段；lightRGB 仅在发光剩余 >3 帧时非空（色表 cs:34395-34407）
    if (this.lai1 > 0) {
      if (this.lai1 > 3) {
        const s = this.ai3;
        this.lightRGB = this.vanillaId === 358 ? [0.10125 * s, 0.21375 * s, 0.225 * s]
          : this.vanillaId === 654 ? [0.225 * s, 0.105 * s, 0.06 * s]
            : [0.1095 * s, 0.15 * s, 0.0615 * s];
      }
      this.lai1 -= 1;
    } else if (this.lai0 > 0) {
      this.lai0 -= 1;
    } else {
      this.lai0 = 30 + Math.floor(Math.random() * 150);
      if (!game.world.clock.isDay || this.cy / TILE > game.world.groundLevel + 10) {
        this.lai1 = 10 + Math.floor(Math.random() * 20);
      }
    }
    if (this.ai2 <= 0) {
      const far = player ? Math.abs(player.cx - this.cx) > 700 : true;
      const spd = far ? 0.5 + Math.random() : 0.05 + Math.random() * 1.45;
      const ang = Math.random() * Math.PI * 2;
      this.ai0 = Math.cos(ang) * spd;
      // Y 偏置(:34296-34300)仅"有玩家且自身在玩家下方"时施加(寻的上抬);
      // ★曾无条件加 -0.35+rand*1.2(均值 +0.25 向下) → 无玩家场景(测试/荒野)
      // 萤火虫缓慢下沉,200tick 漂移超容差
      const yBias = (player && this.y > player.y - 100) ? -0.35 + Math.random() * 1.2 : 0;
      this.ai1 = Math.sin(ang) * spd + yBias;
      this.ai2 = 60 + Math.floor(Math.random() * 120);
    }
    this.ai2 -= 1;
    if (this.vanillaId === 677 && this.aiT % 15 === 0) { // Faeling 逃逸
      let fx = 0, fy = 0;
      for (const o of game.enemies()) {
        const e = o as Enemy;
        if (e === this || e.dead || e.def.damage <= 0) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < 100 && d > 0.01) { fx += (this.cx - e.cx) / d; fy += (this.cy - e.cy) / d; }
      }
      if (player && !player.dead) {
        const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
        if (d < 150 && d > 0.01) { fx += (this.cx - player.cx) / d; fy += (this.cy - player.cy) / d; }
      }
      const m = Math.hypot(fx, fy);
      if (m > 0.01) { this.ai0 += (fx / m) * Math.min(8, m); this.ai1 += (fy / m) * Math.min(8, m); }
    }
    // (垂直避障已在上方 :34427-34464 修正块统一处理;本旧块扫描方向写反
    //  (cy-k 查"上方")且无条件强制 ai1>0,是萤火虫确定性下沉的残根——删除)
    this.vx = (this.vx * 79 + this.ai0) / 80;
    this.vy = (this.vy * 79 + this.ai1) / 80;
    this.facing = this.vx > 0 ? 1 : -1;
    const oldVx = this.vx;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.vx = oldVx * -0.2; this.ai0 = -this.ai0; this.ai2 = 0; }
  }

  /** AI_066 蠕虫族（cs:34490-34586）：ai[0]=0 静止/1 蠕动、ai[1]=切换计时；
   *  静止 300-899 帧 → 蠕动 600-1799 帧；蠕动速度 方向×0.2（485=0.25/486=0.325/487=0.4，
   *  374 ×3）；collideX 翻向。374 松露虫：玩家 160px 内 ai[1] 累计到 90 → Transform(375)
   *  钻地逃走（cs:34560-34584），静止期不被随机蠕动惊扰 */
  private wormCritterAI(game: GameHooks) {
    const st = game.world.store;
    // 484 魔化夜爬虫点光（cs:34492-34497）：num1047 = Next(90,111)×0.01 × (essScale+0.5)/2，
    // 紫光。essScale = Main.cs:61703-61713 三角波 0.7↔1.0（每帧 ±0.01，周期 60 帧）
    if (this.vanillaId === 484) {
      const t = visEffectFrames() % 60;
      const ess = t < 30 ? 1 - t / 100 : 0.7 + (t - 30) / 100;
      const f = (0.9 + Math.random() * 0.2) * ((ess + 0.5) / 2);
      this.lightRGB = [0.3 * f, 0.1 * f, 0.25 * f];
    }
    if (this.ai0 < 0) this.ai0 = 0;
    if (this.ai1 < 0) this.ai1 = 300 + Math.random() * 600;
    const player = (game as unknown as { player: Player }).player;
    // 松露虫受惊钻地
    if (this.vanillaId === 374) {
      if (player && !player.dead && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 160) {
        this.ai2 += 1;
        if (this.ai2 >= 90) {
          this.ai2 = 0;
          this.y += TILE;
          // 375 钻地形态本就要嵌进地里（穿墙蠕虫），跳过实心适配检查
          this.tryTransformTo(375, st, true, game);
          return;
        }
      } else this.ai2 = 0;
    }
    this.ai1 -= 1;
    if (this.ai1 <= 0) {
      this.ai0 = this.ai0 === 0 ? 1 : 0;
      this.ai1 = this.ai0 === 1 ? 600 + Math.random() * 1200 : 300 + Math.random() * 600;
      if (this.ai0 === 1 && Math.random() < 0.5) this.facing *= -1;
    }
    if (this.ai0 === 1) {
      const mult = this.vanillaId === 485 ? 0.25 : this.vanillaId === 486 ? 0.325
        : this.vanillaId === 487 ? 0.4 : this.vanillaId === 374 ? 0.6 : 0.2;
      this.vx = this.facing * mult;
    } else this.vx = 0;
    this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) this.facing *= -1;
  }

  /** AI_067 蜗牛族（cs:34586-34861）：ai[2]=0 贴墙爬（noGravity、速度=(spd*dir, spd*dirY)，
   *  撞墙/撞地翻 direction/directionY）；ai[2]>0 惊扰逃跑（重力、1/7200 随机或腾空 5t 触发，
   *  cs:34646-34666）。速度：普通 0.3、发光/岩浆 0.6。（四象限 rotation 视觉未接，备案） */
  private snailAI(game: GameHooks) {
    const st = game.world.store;
    const spd = this.vanillaId === 360 || this.vanillaId === 655 ? 0.6 : 0.3;
    // 点光（cs:34623-34630）：360 发光蜗牛 (0.1,0.2,0.7)、655 熔岩蜗牛 (0.6,0.3,0.1)，恒定
    if (this.vanillaId === 360) this.lightRGB = [0.1, 0.2, 0.7];
    else if (this.vanillaId === 655) this.lightRGB = [0.6, 0.3, 0.1];
    if (this.ai2 <= 0) {
      // 贴墙爬
      if (Math.random() < 1 / 7200) this.ai2 = 1; // 随机受惊
      this.vx = spd * this.facing;
      this.vy = spd * this.dirY;
      this.x += this.vx;
      this.y += this.vy;
      if (this.hitWall) this.facing *= -1;
      // 前方无支撑（墙面尽头）→ 翻爬行方向
      const fx = Math.floor((this.cx + this.facing * (this.w / 2 + 2)) / TILE);
      const fy = Math.floor((this.cy + this.dirY * (this.h / 2 + 2)) / TILE);
      if (!st.isSolid(fx, fy)) this.dirY = this.dirY === 0 ? 1 : -this.dirY;
      this.dirY = Math.max(-1, Math.min(1, this.dirY));
    } else {
      // 惊扰逃跑：正常重力爬地
      if (this.onGround) this.ai2 = 0;
      this.vx = this.facing * spd;
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.hitWall) this.facing *= -1;
    }
  }

  /** AI_068 鸭飞形 363/365/603/609（cs:34861-35117）：整族 noGravity，仅 ai[0]=0 且非 wet
   *  时有重力。水中：X 平滑到 dir×2、前方无水/实心翻向、钉水面；脱离水 → 起飞翻向；
   *  玩家 200px 盒或受伤 → 起飞（vy-=6 翻向）。飞行：X 渐近 ±3、前方 15 格下探避障
   *  （5 格内障碍 -0.2/有障碍 -0.1/无 +0.1，Y 限 [-4,3]）；ai[1]>=300 且落地/落水 →
   *  Transform(type-1) 回行走形（cs:35000） */
  private duckFlyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (this.ai0 < 0) this.ai0 = 0;
    if (this.ai1 < 0) this.ai1 = 0;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    if (this.ai0 === 0) {
      // ---- 水面模式（cs:34886-34983 wet 分支）----
      // wet：vx Lerp 到 direction×2（1/20）；前方 (体半宽+8)×dir 处实心/无水/贴图边 →
      // 掉头；下沉 vy×0.5；钉水面——内联 GetWaterLine（:34934-34971）再 −6，
      // Center 在线下 → vy−0.1 钳 −8 且不过线，线上 → vy 直接=线差。
      // !wet（完全离水）→ 立即起飞翻向（cs:34975-34980，不等落地）；
      // 玩家 100px 盒或残血 → 起飞 vy−6 翻向（cs:34981-34988）
      if (this.wet) {
        this.vx = (this.vx * 19 + 2 * this.facing) / 20;
        const aheadX = Math.floor((this.cx + (this.w / 2 + 8) * this.facing) / TILE);
        const midY = Math.floor(this.cy / TILE);
        const topY = Math.floor(this.y / TILE), botY = Math.floor((this.y + this.h) / TILE);
        if (aheadX < 5 || aheadX > st.w - 5
          || st.isSolid(aheadX, midY) || st.isSolid(aheadX, topY) || st.isSolid(aheadX, botY)
          || !(st.inBounds(aheadX, botY) && st.liquid[st.idx(aheadX, botY)] > 0)) {
          this.facing *= -1;
        }
        if (this.vy > 0) this.vy *= 0.5;
        // 内联液面探测（cs:34934-34958）——★非 GetWaterLine：无"上 2 行有液→false"
        // 早退，深水同样给出最近液面（行×16 − liquid/16 整除），三行皆无液才退盒底−6
        const ccx = Math.floor(this.cx / TILE);
        const liqRow = (ty: number) => (st.inBounds(ccx, ty) ? st.liquid[st.idx(ccx, ty)] : 0);
        const upL = liqRow(midY - 1), midL = liqRow(midY), dnL = liqRow(midY + 1);
        let surface = this.y + this.h;
        if (upL > 0) surface = midY * TILE - Math.trunc(upL / 16);
        else if (midL > 0) surface = (midY + 1) * TILE - Math.trunc(midL / 16);
        else if (dnL > 0) surface = (midY + 2) * TILE - Math.trunc(dnL / 16);
        surface -= 6;                                       // num1069 −6（吃水线）
        if (this.cy > surface) {
          this.vy -= 0.1;
          if (this.vy < -8) this.vy = -8;
          if (this.cy + this.vy < surface) this.vy = surface - this.cy;
        } else {
          this.vy = surface - this.cy;
        }
        const scared = !!player && !player.dead
          && Math.abs(player.cx - this.cx) < 100 + (this.w + player.w) / 2
          && Math.abs(player.cy - this.cy) < 100 + (this.h + player.h) / 2;
        if (scared || this.hp < this.maxHp) {
          this.ai0 = 1; this.vy -= 6; this.facing *= -1;
        }
        moveAndCollide(this, game.world, this.vx, this.vy);
        return;
      }
      // 离水（cs:34887 noGravity=false → 有重力）：陆行待起飞
      this.applyGravity(game);
      if (Math.abs(this.vx) < 2) this.vx += this.facing * 0.1;
      if (player && !player.dead
        && Math.abs(player.cx - this.cx) < 100 + (this.w + player.w) / 2
        && Math.abs(player.cy - this.cy) < 100 + (this.h + player.h) / 2) {
        this.ai0 = 1; this.vy -= 6; this.facing *= -1;
      }
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.onGround && !this.wet) { // 陆上：起飞回飞形
        this.ai0 = 1; this.vy -= 6;
      }
      return;
    }
    // 飞行
    this.ai1 += 1;
    if (player && !player.dead) this.facing = player.cx > this.cx ? -1 : 1; // 远离玩家
    if (this.facing === -1 && this.vx > -3) this.vx -= 0.1;
    else if (this.facing === 1 && this.vx < 3) this.vx += 0.1;
    const aheadX = Math.floor((this.cx + this.facing * 24) / TILE);
    const footY = Math.floor(this.cy / TILE);
    let obstruction = 0;
    for (let k = 0; k < 15; k++) {
      if (st.isSolid(aheadX, footY + k) || st.liquid[st.idx(aheadX, footY + k)] > 0) { obstruction = k + 1; break; }
    }
    if (obstruction > 0 && obstruction <= 5) this.vy -= 0.2;
    else if (obstruction > 0) this.vy -= 0.1;
    else this.vy += 0.1;
    this.vy = Math.max(-4, Math.min(3, this.vy));
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.vx *= -0.5; this.facing *= -1; }
    if ((this.hitHead || this.onGround || inWater) && this.ai1 >= 300) {
      this.ai0 = 0;
      this.ai1 = 200 + Math.random() * 200;
      // 回行走形（cs:35000 Transform(type-1)，363→362/365→364/603→602/609→608）
      this.tryTransformTo((this.vanillaId ?? 363) - 1, st, false, game);
    }
  }

  /** AI_112 仙灵 583-585（AI_112_FairyCritter cs:48453）：状态 0 绕出生点 20px 微漂、
   *  玩家 250px 内 → 状态 1 追随飞（X 渐近 dir×4.5、前方 20×8 扫描定 Y、限 [-5,3]）；
   *  存在 18000 帧（5 分钟）强制离场消失（cs:48457-48473）。
   *  （状态 2-7 宝箱引导链需要宝箱搜索基建，未移植备案） */
  private fairyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) { this.aiInit = true; this.ai0 = this.cx; this.ai1 = this.cy; this.ai2 = 0; this.ai3 = 0; }
    // ---- 点光（cs:48991-49010）：value3 主色 ×0.7（value4 仅尘色不进光）
    //  583 粉仙灵 HotPink(255,105,180) / 584 绿仙灵 LimeGreen(50,205,50) /
    //  585 蓝仙灵 RoyalBlue(65,105,225)
    if (this.vanillaId === 583) this.lightRGB = [(255 / 255) * 0.7, (105 / 255) * 0.7, (180 / 255) * 0.7];
    else if (this.vanillaId === 584) this.lightRGB = [(50 / 255) * 0.7, (205 / 255) * 0.7, (50 / 255) * 0.7];
    else if (this.vanillaId === 585) this.lightRGB = [(65 / 255) * 0.7, (105 / 255) * 0.7, (225 / 255) * 0.7];
    this.ai3 += 1;
    if (this.ai3 >= 18000) { this.dead = true; return; } // 存在期满离场
    if (this.ai2 === 0) {
      // 绕锚点微漂
      const dx = this.ai0 - this.cx, dy = this.ai1 - this.cy;
      if (Math.hypot(dx, dy) > 20) { this.vx += Math.sign(dx) * 0.04; this.vy += Math.sign(dy) * 0.04; }
      else { this.vx += (Math.random() - 0.5) * 0.04; this.vy += (Math.random() - 0.5) * 0.04; }
      this.vy = Math.max(-2, Math.min(2, this.vy));
      if (player && !player.dead && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 250) this.ai2 = 1;
    } else if (this.ai2 === 1) {
      // 追随飞（cs:48453 状态 1）；接触玩家锚盒 → 状态 2 引导（:48505-48516）
      if (player && !player.dead && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 40) {
        this.ai2 = 2; this.ai3 = 0;
      }
      if (player && !player.dead) this.facing = this.seekDirX(player);
      const target = this.facing * 4.5;
      this.vx += Math.sign(target - this.vx) * 0.1;
      const aheadX = Math.floor((this.cx + this.facing * 24) / TILE);
      const cy = Math.floor(this.cy / TILE);
      let obstruction = 0;
      for (let k = 0; k < 8; k++) {
        if (st.isSolid(aheadX, cy + k) || st.liquid[st.idx(aheadX, cy + k)] > 0) { obstruction = k + 1; break; }
      }
      if (obstruction > 0 && obstruction <= 5) this.vy -= 0.3;
      else if (obstruction > 0) this.vy -= 0.2;
      else this.vy += 0.05;
      this.vy = Math.max(-5, Math.min(3, this.vy));
    } else if (this.ai2 === 2) {
      // ---- 状态 2 玩家引导（:48602-48684）：飞向玩家锚盒；接触 → 宝箱搜索 →
      //      命中 → 状态 3 绕目标，未命中 → 状态 6 找不到宝箱态 ----
      this.noTileCollide = true;
      if (player && player.dead) { this.ai2 = 1; this.ai3 = 0; }
      else if (player) {
        const rCx = player.cx, rCy = player.cy - player.h / 4;
        const rw = player.w + 60, rh = player.h / 2;
        if (this.x < rCx + rw / 2 && this.x + this.w > rCx - rw / 2
          && this.y < rCy + rh / 2 && this.y + this.h > rCy - rh / 2) {
          const treasure = fairyTreasureCoords(st, this.cx, this.cy);
          if (treasure) { this.ai0 = treasure[0]; this.ai1 = treasure[1]; this.ai2 = 3; this.ai3 = 0; }
          else { this.ai2 = 6; this.ai3 = 0; }
        } else {
          const dx = rCx - this.cx, dy = rCy - this.cy;
          const d = Math.hypot(dx, dy) || 1;
          let spd = 2;
          if (d > 150) spd = 4; else if (d > 80) spd = 3;
          const tvx = dx / d * spd, tvy = dy / d * spd;
          this.vx += (tvx - this.vx) * 0.07;
          this.vy += (tvy - this.vy) * 0.07;
        }
      }
    } else if (this.ai2 === 3) {
      // ---- 状态 3 绕目标宝箱圆舞（:48688-48742）：210t（音 27@15t 起）；
      //      毕 → 状态 4 带路；目标失效 → 状态 1 ----
      this.noTileCollide = true;
      if (this.ai3 === 15) game.playSfxWav?.('Pixie', 1, this.cx, this.cy);   // :48692 音27=Pixie(曾误 roar 近似)
      if (this.ai3 <= 15) { this.vx *= 0.9; this.vy *= 0.9; }
      else {
        // 简化圆舞：绕目标顺时针环绕（原版 GetFairyCircleOffset 三段摆）
        const tx = this.ai0 * TILE + 8, ty = this.ai1 * TILE + 8;
        const ang = (this.ai3 - 15) / 65 * Math.PI;
        const r2 = 18;
        const nx = tx + Math.cos(ang) * r2, ny = ty + Math.sin(ang) * r2 - 14;
        this.vx = nx - this.cx; this.vy = ny - this.cy;
        if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
      }
      this.ai3 += 1;
      if (this.ai3 >= 210) { this.ai2 = 4; this.ai3 = 0; }
    } else if (this.ai2 === 4) {
      // ---- 状态 4 带路（:48779-48925）：飞向宝箱；距玩家 >300 → 召唤脉冲等玩家；
      //      到宝箱 5×5 盒 → 状态 5 终演；玩家死 → 状态 1 ----
      this.noTileCollide = true;
      if (player && player.dead) { this.ai2 = 1; this.ai3 = 0; }
      else {
        const tx = this.ai0 * TILE + 8, ty = this.ai1 * TILE + 8;
        // 到达宝箱 5×5 盒 → 终演
        if (Math.abs(this.cx - tx) < 40 && Math.abs(this.cy - ty) < 40) {
          this.ai2 = 5; this.ai3 = 0;
        } else if (player) {
          const dp = Math.hypot(player.cx - this.cx, player.cy - this.cy);
          if (dp > 300) {
            // 等玩家（环形徘徊 + 召唤音 1/30,:48839 音27=Pixie）
            if (Math.random() < 1 / 30) game.playSfxWav?.('Pixie', 1, this.cx, this.cy);
            const d2 = Math.hypot(this.cx - tx, this.cy - ty) || 1;
            this.vx += (this.cx - tx) / d2 * 0.1;
            this.vy += (this.cy - ty) / d2 * 0.1;
          } else {
            const d2 = Math.hypot(tx - this.cx, ty - this.cy) || 1;
            this.vx += (tx - this.cx) / d2 * 0.1;
            this.vy += (ty - this.cy) / d2 * 0.1;
          }
          const spd = Math.hypot(this.vx, this.vy);
          if (spd > 6) { this.vx *= 6 / spd; this.vy *= 6 / spd; }
        }
      }
    } else if (this.ai2 === 5) {
      // ---- 状态 5 终演（:48897-48955）：目标格失效 → 提前毕；>200t →
      //      消失 + FairyEffects（尘 278×40 爆散 + 音 Item4）----
      this.noTileCollide = true;
      const valid = fairyTreasureValidAt(st, this.ai0, this.ai1);
      if (this.ai3 === 15) game.playSfxWav?.('Pixie', 1, this.cx, this.cy);   // :48913 音27=Pixie
      if (this.ai3 <= 15) { this.vx *= 0.9; this.vy *= 0.9; }
      else {
        // 绕目标小圆舞（同状态 3 简化）
        const tx = this.ai0 * TILE + 8, ty = this.ai1 * TILE + 8;
        const ang = (this.ai3 - 15) / 65 * Math.PI;
        const nx = tx + Math.cos(ang) * 18, ny = ty + Math.sin(ang) * 18 - 14;
        this.vx = nx - this.cx; this.vy = ny - this.cy;
      }
      this.ai3 += 1;
      if (!valid) this.ai3 = Math.max(this.ai3, 201);   // 目标没了提前毕
      if (this.ai3 > 200) {
        // FairyEffects（:49021-49052）：尘 278×40 Lerp 主色/副色 0.65 scale 爆散
        const fairyCols: Record<number, [string, string]> = {
          583: ['#FF69B4', '#FFB6C1'], 584: ['#32CD32', '#20B2AA'], 585: ['#4169E1', '#ADD8E6'],
        };
        const [c1, c2] = fairyCols[this.vanillaId ?? 583] ?? fairyCols[583];
        for (let k = 0; k < 40; k++) {
          const col = k % 2 === 0 ? c1 : c2;
          game.spawnParticles(this.cx, this.cy, col, 1, 2.2, { life: 32, grav: 0, size: 2 });
        }
        game.playSfxFiles(['Item_4'], 1, this.cx, this.cy);
        this.dead = true; return;
      }
    } else if (this.ai2 === 6) {
      // ---- 状态 6 找不到宝箱（:48746-48790）：跟玩家 >100px → 回状态 2 重试 ----
      this.noTileCollide = true;
      if (player) {
        const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
        if (d > 100) { this.ai2 = 2; this.ai3 = 0; }
        else if (d > 20) {
          const d2 = d || 1;
          this.vx += Math.sign(player.cx - this.cx) * 0.04;
          this.vy += Math.sign(player.cy - this.cy) * 0.04;
          this.vy = Math.max(-2, Math.min(2, this.vy));
        }
        // 每 150t 重搜宝箱（原版 :48769）
        if (this.ai3 % 150 === 0 && this.ai3 > 0) {
          const treasure = fairyTreasureCoords(st, this.cx, this.cy);
          if (treasure) { this.ai0 = treasure[0]; this.ai1 = treasure[1]; this.ai2 = 3; this.ai3 = 0; }
        }
        this.ai3 += 1;
      }
    } else if (this.ai2 === 7) {
      // ---- 状态 7 离场（:48950-48958）：加速飞离 + 提前消亡 ----
      this.noTileCollide = true;
      this.vx += 0.05 * this.facing;
      this.vx = Math.max(-10, Math.min(10, this.vx));
      this.vy -= 0.025;
      this.vy = Math.max(-5, Math.min(5, this.vy));
    }
    this.facing = this.vx > 0 ? 1 : -1;
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_114 蜻蜓族 595-601（AI_114_Dragonflies cs:48080）：ai[0]=0 悬停/1 突进，
   *  ai[1]=计时、ai[2]/ai[3]=锚点。悬停：v×0.94，每 60-119 帧结束；离锚 >96px →
   *  朝锚突进×3、16-96px → ×1+抖动；突进 4 帧（离锚 >112px 延长 200 帧）；
   *  向下 3 格实心/液体 → vy-=0.2 且 v×0.9、向上 30 格无实心 → v×0.9；wet → vy=-3 弹出；
   *  避敌（每 15 帧）：100px 敌/150px 玩家叠加逃逸（上限 16）并把锚点挪向逃逸方向 */
  /** AI_113 风气球 594（NPC.cs:43036-43175）：首帧挂载史莱姆（1/180 金 -4 / 1/10 母 -7 /
   *  1/3 绿 -3，ai[0]=-999 冻结 :61441）；横速朝向加速至 2+|wind|×2；前方 8 格探测升降；
   *  玩家 400px 内跟随 Y；湿/撞 → 爆（HitEffect :82590 解冻 slave ai[0]=0 落地开打）；
   *  slave 亡 → 自由上飘随风漂移 */
  private windyBalloonAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const wind = game.world.weather.windSpeedTarget;
    if (!this.aiInit) {
      this.aiInit = true;
      this.ai2 = 1 + Math.floor(Math.random() * 7); // ai[2] 装饰随机
      const slave = Enemy.fromVanilla(1, this.cx, this.cy);
      if (slave) {
        // 变体覆盖（SetDefaults case -3/:7658、-4/:7668、-7/:7699：
        // SetDefaults_ForNetId(scale) + 属性/颜色/kbResist 覆写）。
        // kbResist 乘子（:7665/:7675/:7705）直乘"承受比例"（def 已存原版语义）
        const kbMul = (m: number) => {
          slave.def.knockbackResist = Math.max(0, slave.def.knockbackResist * m);
        };
        const r = Math.random();
        if (r < 1 / 180) { // 金史莱姆 -4：scale 0.6/dmg 5/def 5/hp 150/kb×1.4
          //（曾除以已更新的 vanillaScale → 缩放自抵消不缩身，已改同 -7/-3 直乘）
          slave.w = Math.round(slave.w * 0.6); slave.h = Math.round(slave.h * 0.6);
          slave.vanillaScale = 0.6;
          slave.hp = slave.maxHp = 150; slave.def.damage = 5; slave.def.defense = 5;
          slave.colorRGBA = [250, 30, 90, 90]; kbMul(1.4);
        } else if (r < 1 / 10) { // 母史莱姆 -7（SetDefaults case -7 :7699：scale 1.2/
          // damage 12/defense 6/life 40/kbResist×0.9/color 200,0,255,150——曾近似成纯 scale 1.05）
          slave.vanillaScale = 1.2; slave.w = Math.round(slave.w * 1.2); slave.h = Math.round(slave.h * 1.2);
          slave.hp = slave.maxHp = 40; slave.def.damage = 12; slave.def.defense = 6;
          slave.colorRGBA = [200, 0, 255, 150]; kbMul(0.9);
        } else if (r < 1 / 3) { // 绿史莱姆 -3
          slave.vanillaScale = 0.9; slave.w = Math.round(slave.w * 0.9); slave.h = Math.round(slave.h * 0.9);
          slave.hp = slave.maxHp = 14; slave.def.damage = 6; slave.def.defense = 0;
          slave.colorRGBA = [0, 220, 40, 100]; kbMul(1.2);
        }
        slave.ai0 = -999; // 挂载冻结标记（slimeAI 首行放行）
        slave.id = (game as unknown as { entities: { nextId: number; add(e: unknown, b: string): void } }).entities.nextId++;
        (game as unknown as { entities: { add(e: unknown, b: string): void } }).entities.add(slave, 'enemies');
        this.ai3 = slave.id;
        this.vanillaScale = slave.vanillaScale ?? 1; // ai[1] = slave.scale（气球随之缩放）
      }
    }
    const scale = this.vanillaScale ?? 1;
    const enemies = game.enemies() as Enemy[];
    const slave = enemies.find((n) => n.id === this.ai3 && !n.dead && n.vanillaId === 1 && n.ai0 === -999) ?? null;
    this.visAngle = this.vx * 0.05; // rotation（cs:43076）
    const pop = () => {
      if (slave) { slave.ai0 = 0; slave.y -= 10; } // HitEffect :82590 解冻落地
      this.dead = true;
      game.playSfxFiles(this.def.killedSound, 1, this.cx, this.cy);
    };
    if (slave) {
      // 湿/入墙 → 爆（cs:43089-43102）
      const selfSolid = st.isSolid(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE));
      if (this.inWater || slave.inWater || selfSolid) { pop(); return; }
      // X 朝向 = 原版 direction（TargetClosest 首帧 :48257 / 爆支 :48309 / collideY :48322
      // → SetTargetTrackingValues :78559-78567：目标中心 X ≥ 本体中心 X 取 1 否则 -1）；
      // 无有效目标保留原 direction（原版无顺风兜底，旧行为是无玩家时顺风）
      if (player && !player.dead) this.facing = player.cx >= this.cx ? 1 : -1;
      const dir = this.facing;
      const num5 = 2 + Math.abs(wind) * 2;
      if (Math.sign(this.vx) !== dir || Math.abs(this.vx) < num5) {
        this.vx += dir * 0.01;
        if (this.vx * dir < 0) this.vx += Math.abs(this.vx) > num5 ? dir * 0.1 : dir * 0.05;
        else if (Math.abs(this.vx) > num5) this.vx = dir * num5;
      }
      // 目标相对本体底边的高差（cs:48292-48303）：zero = 目标中心 − 本体底边；
      // 目标在上(zy<0)时 num3 = (int)zy / -16（目标高出本体底边多少格）；
      // num2 = zero.Length()（底边到目标中心的距离，非中心距）；direction 与目标方位
      // 不一致则 num3 归 0
      let num3 = 0, num2 = Infinity;
      if (player && !player.dead) {
        const zx = player.cx - this.cx;
        const zy = player.cy - (this.y + this.h);
        if (zy < 0) num3 = Math.trunc(Math.trunc(zy) / -16);
        num2 = Math.hypot(zx, zy);
        if (dir !== Math.sign(zx)) num3 = 0;
      }
      // 前方探测（num6/num7，cs:48344-48364：深度 num8 = 8 + num3，
      // 近距判定线 num7 + 5 + num3）
      const num6 = Math.floor((this.x + this.w / 2) / TILE) + dir;
      const num7 = Math.floor((this.y + this.h) / TILE);
      const num8 = 8 + num3;
      let open = true, near = false;
      for (let i = num7; i < num7 + num8; i++) {
        if (!st.inBounds(num6, i)) break;
        const ii = st.idx(num6, i);
        if (st.isSolid(num6, i) || st.liquid[ii] > 0) {
          if (i < num7 + 5 + num3) near = true;
          open = false;
          break;
        }
      }
      // 目标 400px 内且有视线（cs:48365-48385：num2<400 && Collision.CanHit）→ 跟随 Y；
      // 比较位 = 本体 Center.Y+height/4 对 目标 position.Y+height/4（非中心对中心）；
      // 否则探测升降（+0.05/-0.1/-0.2 钳 [-4,2]）
      if (num2 < 400 && player && this.canSeePlayer(st, player)) {
        const by = this.cy + this.h / 4, py = player.cy - player.h / 4;
        if (by > py && this.vy > -2) this.vy -= this.vy > 0 ? 0.07 : 0.035;
        else if (by < py && this.vy < 2) this.vy += this.vy < 0 ? 0.07 : 0.035;
      } else {
        if (open) this.vy += 0.05; else this.vy -= 0.1;
        if (near) this.vy -= 0.2;
        this.vy = Math.max(-4, Math.min(2, this.vy));
      }
      this.x += this.vx; this.y += this.vy;
      // slave 挂气球下（cs:43177 nPC.Center = Bottom + (0,-8+56*scale)）
      slave.x = this.cx - slave.w / 2;
      slave.y = this.y + this.h - 8 + 56 * scale - slave.h / 2;
      slave.vx = this.vx; slave.vy = this.vy;
    } else {
      // 无 slave：自由上飘随风（cs:43179-43193）；撞墙爆
      this.vy = Math.max(-8, Math.min(8, this.vy - 0.2));
      this.vx = Math.max(-4, Math.min(4, this.vx + wind * 0.3));
      this.x += this.vx; this.y += this.vy;
      if (st.isSolid(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) { pop(); return; }
    }
  }

  /** AI_125 笨笨气球史莱姆 686（NPC.cs:44009-44139 1:1）：noGravity+noTileCollide
   *  漂浮体（原版 SetDefaults :17559-17570：lifeMax 1/damage 0）——水平朝
   *  direction 加速 0.04 至 3+|wind|×2；垂直两态：玩家 400px 内且 CanHit →
   *  ±0.035 追平高度（±2 钳内），否则前方一列（中心+direction）自底向下扫
   *  8+num2 格——实心/液体命中 5+num2 内=近距；开阔 vy+0.05 / 有阻 vy-0.1 /
   *  近距再 -0.2，钳 [-4,2]。湿 → 爆裂死亡（原版另含 collideX/collideY↑ 两支
   *  ——noTileCollide 下恒 false 不可达；本仓以"嵌入实心"为 collideX 的生成
   *  兜底等价）。死链 Transform(680)+解锁旗在 Game.onEnemyKilled 686 支。 */
  private balloonSlimeAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (player && !player.dead) this.facing = player.cx >= this.cx ? 1 : -1;
    const dir = this.facing;
    this.visAngle = this.vx * 0.05;                     // rotation（cs:44019）
    if (this.inWater
      || st.isSolid(Math.floor(this.cx / TILE), Math.floor((this.y + 4) / TILE))) {
      // life=-1+active=false → CheckDead 死链——走 die()（hurt 死亡管线）保证
      // onEnemyKilled 触发（Game 侧 686 支 = Transform(680)+解锁旗+气球碎粒子）
      this.die(game);
      return;
    }
    // 水平（cs:44055-44070）：加速 0.04；逆行段 0.15/0.1 补偿（125 档，比 113 的
    // 0.01/0.1/0.05 快——两气球非同参）
    const num4 = 3 + Math.abs(game.world.weather.windSpeedTarget) * 2;
    if (Math.sign(this.vx) !== dir || Math.abs(this.vx) < num4) {
      this.vx += dir * 0.04;
      if (this.vx * dir < 0) this.vx += Math.abs(this.vx) > num4 ? dir * 0.15 : dir * 0.1;
      else if (Math.abs(this.vx) > num4) this.vx = dir * num4;
    }
    // 目标高差（cs:44017-44031）：zero = 目标中心 − 本体底边；目标在上时
    // num2 = 高出格数；direction 与目标方位不一致则归 0
    let num2 = 0, dist = Infinity;
    if (player && !player.dead) {
      const zx = player.cx - this.cx, zy = player.cy - (this.y + this.h);
      if (zy < 0) num2 = Math.trunc(Math.trunc(zy) / -16);
      dist = Math.hypot(zx, zy);
      if (dir !== Math.sign(zx)) num2 = 0;
    }
    // 前方一列下扫（cs:44072-44092）：深度 8+num2，近距线 5+num2
    const num5 = Math.floor((this.x + this.w / 2) / TILE) + dir;
    const num6 = Math.floor((this.y + this.h) / TILE);
    let open = true, near = false;
    for (let i = num6; i < num6 + 8 + num2; i++) {
      if (!st.inBounds(num5, i)) break;
      const ii = st.idx(num5, i);
      if ((st.flags[ii] !== 0 && st.isSolid(num5, i)) || st.liquid[ii] > 0) {
        if (i < num6 + 5 + num2) near = true;
        open = false;
        break;
      }
    }
    // 垂直（cs:44093-44138）
    if (player && !player.dead && dist < 400
      && canHit(st, this.cx, this.cy, this.w, this.h, player.cx, player.cy, player.w, player.h)) {
      if (this.cy + this.h / 4 > player.cy + player.h / 4 && this.vy > -2) {
        this.vy -= 0.035;
        if (this.vy > 0) this.vy -= 0.035;
      } else if (this.cy + this.h / 4 < player.cy + player.h / 4 && this.vy < 2) {
        this.vy += 0.035;
        if (this.vy < 0) this.vy += 0.035;
      }
    } else {
      if (open) this.vy += 0.05;
      else this.vy -= 0.1;
      if (near) this.vy -= 0.2;
      if (this.vy > 2) this.vy = 2;
      if (this.vy < -4) this.vy = -4;
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_119 蒲公英 628（NPC.cs:43254-43318）：非风日快速消散（timeLeft=10）；
   *  玩家在下风 600px 内且 |dy|<100 → 喷籽态 ai[0]=1：计数 40 发 1-3 枚种子
   *  （proj 836 伤 7——Dart 近似），>80 回待机。本体无位移（原版仅状态机+弹幕） */
  private dandelionAI(game: GameHooks, player: Player | null) {
    // ai0===0/1 等值门：类默认 -1120 会全空转 = 蒲公英永不喷籽（2026-08-13 ai0陷阱清查）
    if (this.ai0 < 0) this.ai0 = 0;
    const wt = game.world.weather;
    if (!wt.shouldUseWindyDayMusic) this.encourageDespawn(10); // :43257
    if (!player || player.dead) return;
    const dx = player.cx - this.cx;
    const flag = Math.abs(player.cy - this.cy) < 100 && Math.abs(dx) < 600
      && ((dx > 0 && wt.windSpeedCurrent > 0) || (dx < 0 && wt.windSpeedCurrent < 0));
    if (this.ai0 === 0) {
      if (flag) this.ai0 = 1;
      this.ai1 = 0;
    } else if (this.ai0 === 1) {
      if (!flag) { this.ai0 = 0; return; }
      this.ai1++;
      if (this.ai1 > 80) { this.ai0 = 0; return; }
      if (this.ai1 === 40) {
        // :43291-43308 种子：vector=(dir*Next(-2,10), 10+Next(-6,6))×0.25 + (dir*2,-2)，vy 保底 -3
        const dir = dx > 0 ? 1 : -1;
        const n = 1 + Math.floor(Math.random() * 3);
        const ents = (game as unknown as { entities: { add(e: unknown, b: string): void } }).entities;
        for (let i = 0; i < n; i++) {
          const vx = dir * 2 + dir * (Math.floor(Math.random() * 12) - 2) * 0.25;
          let vy = -2 + (10 + Math.floor(Math.random() * 12) - 6) * 0.25;
          if (vy > -3) vy = -3;
          const seedDart = new Dart(this.cx + dir * 6, this.cy, vx, vy, 7, 836);
          seedDart.hostile = true; // 628 蒲公英籽直构弹——敌怪弹（v5 bit7）
          ents.add(seedDart, 'projectiles');
        }
      }
    }
  }

  /** AI_126 雕像宝箱怪 690（NPC.cs:43760-44010）：SetDefaults immortal+dontTakeDamage
   *  （:17615，fromVanilla 侧已置 dontTakeDamage）。伪装态 ai[0]=0：timeLeft=60 恒续命、
   *  direction 冻结、玩家 96px+CanHit 唤醒；每 10t 屏外向玩家屏带内更近落点传送
   *  （候选=双格实心底+净空3+不可见，SolidTile2 下扫 ≤10）。激活态：Scare 惊吓音 →
   *  地面 ai[2] 倒数 20 节奏跳（vy=-9.01-高差/40 钳10、vx=(4+|dx|/50 钳12)×dir）；
   *  跳跃/上升/玩家正上 noTileCollide 穿墙（直接位移）；玩家正下俯冲 vy=16；
   *  玩家死 Laugh+300t 强制俯冲。绘制侧恒为雕像形态（Tiles_105 切片，见 Renderer）。 */
  private statueMimicAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (this.ai0 < 0) this.ai0 = 0;                       // 类默认 -1120 → 伪装态 0（ai0 初值坑）
    if (!this.aiInit) {
      // 首帧：ai[1] = 随机雕像样式（localAI[1] 分支 :43771-43775 ←
      // WorldGen.GetRandomStatueStyleForStatueMimics :37934 Next(83) 拒绝 43-49）
      this.aiInit = true;
      let s = Math.floor(Math.random() * 83);
      while (s >= 43 && s <= 49) s = Math.floor(Math.random() * 83);
      this.ai1 = s;
    }
    // 位置参考 = 真身（含尸体——原版 Main.player[target] 不因死亡失位；主 switch 传参
    // 玩家死亡即 null，故走 game.player 兜底，与 case 4 EoC 例外同型）
    const pp: Player | null = (game as unknown as { player: Player | null }).player ?? player ?? null;
    const alive = !!pp && !pp.dead;
    const tgt = alive ? pp : null;
    if (this.ai0 === 0) {
      // 伪装态：不消散（原版 timeLeft=60 每帧续命 :43765）
      this.despawnTimer = 750;
      this.despawnEncouraged = false;
      if (tgt && Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) < 96 && this.canSeePlayer(st, tgt)) {
        this.ai0 = 1;                                     // 唤醒（:43780-43788）
        this.dontTakeDamage = false;                      // immortal=false（:43873）
        game.playSfx('statueMimicScare', 0.8, this.cx, this.cy);
        return;
      }
      // 屏外传送（每 10t 一掷；本体不可见才动 :43789-43877）。可见门近似 = 与
      // despawn 同款固定屏盒（62×35 格）；band = 玩家 ±960/±600px（sWidth/sHeight 静态）
      if (++this.lai0 < 10) return;
      this.lai0 = 0;
      if (!tgt) return;
      const vis = (wx: number, wy: number) =>
        Math.abs(wx - tgt.cx) < TILE * 62 && Math.abs(wy - tgt.cy) < TILE * 35;
      if (vis(this.cx, this.cy)) return;
      const halfW = 1920 / 2, halfH = 1200 / 2;
      let x2: number, x3: number;
      if (Math.abs(tgt.cx - this.cx) < halfW) { x2 = (tgt.cx - halfW) / TILE; x3 = (tgt.cx + halfW) / TILE; }
      else if (tgt.cx < this.cx) { x2 = (tgt.cx + halfW) / TILE; x3 = this.cx / TILE; }
      else { x2 = this.cx / TILE; x3 = (tgt.cx - halfW) / TILE; }
      let y4: number, y5: number;
      if (Math.abs(tgt.cy - this.cy) < halfH) { y4 = (tgt.cy - halfH) / TILE; y5 = (tgt.cy + halfH) / TILE; }
      else if (tgt.cy < this.cy) { y4 = (tgt.cy + halfH) / TILE; y5 = this.cy / TILE; }
      else { y4 = this.cy / TILE; y5 = (tgt.cy - halfH) / TILE; }
      const solid2 = (tx: number, ty: number): boolean =>
        st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] !== 0 && !!TILE_DEFS[st.type[st.idx(tx, ty)]]?.solid;
      const clearAbove = (tx: number, ty: number): boolean => {   // IsThisAGoodPlaceForAStatueMimic（:43751）
        for (let dy = 1; dy <= 3; dy++) {
          if (!st.inBounds(tx, ty - dy)) continue;
          if (st.flags[st.idx(tx, ty - dy)] !== 0) return false;
        }
        return true;
      };
      for (let attempt = 10; attempt > 0; attempt--) {
        const cx0 = Math.floor(x2 + Math.random() * (x3 - x2));
        let cy0 = Math.floor(y4 + Math.random() * (y5 - y4));
        let ground = -1;
        for (let i = 0; i < 10; i++) {                     // 下扫找双格实心底
          if (solid2(cx0, cy0) && solid2(cx0 + 1, cy0)) { ground = cy0; break; }
          cy0++;
        }
        if (ground < 0 || !clearAbove(cx0, ground) || !clearAbove(cx0 + 1, ground)) continue;
        if (vis((cx0 + 1) * TILE, ground * TILE)) continue;   // CanAnyPlayerSeeThisTile 近似
        const nx = cx0 * TILE + TILE - this.w / 2, ny = ground * TILE - this.h;
        const dNew = Math.hypot(nx + this.w / 2 - tgt.cx, ny + this.h / 2 - tgt.cy);
        const dOld = Math.hypot(this.cx - tgt.cx, this.cy - tgt.cy);
        if (dNew < dOld) {
          if (nx < this.x) this.facing = -1;               // direction 朝来向（:43872-43876）
          else if (nx > this.x) this.facing = 1;
          this.x = nx; this.y = ny; this.vx = 0; this.vy = 0;
          return;
        }
      }
      return;
    }
    // ---- 激活态（:43872-44010）----
    let jump = false;
    if (tgt && this.vy > 0 && this.y > tgt.y + tgt.h) {
      // 下落中且已落到玩家脚下（Top>玩家 Bottom）且身体陷实心 → 立即再跳
      const bx0 = Math.floor(this.x / TILE), bx1 = Math.floor((this.x + this.w - 0.01) / TILE);
      const by0 = Math.floor(this.y / TILE), by1 = Math.floor((this.y + this.h - 0.01) / TILE);
      let inSolid = false;
      outer: for (let tx = bx0; tx <= bx1; tx++) for (let ty = by0; ty <= by1; ty++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { inSolid = true; break outer; }
      }
      if (inSolid) {
        jump = true;
        game.playSfx('statueMimicJump', 0.3, this.cx, this.cy);
      }
    } else if (this.vy === 0) {
      // 地面节奏：ai[2]==20 预告音 → 递减 → ≤0 重置 20 并跳（首落地 ai2=0 立即跳）
      if (this.ai2 === 20) game.playSfx('statueMimicJump', 0.3, this.cx, this.cy);
      this.vx = 0;
      if (--this.ai2 <= 0) { this.ai2 = 20; jump = true; }
    }
    // flag3：与玩家水平重叠（:43912-43925，尸体照算）；本体底在玩家顶上方时削弱横/升速
    let overX = false;
    if (pp && this.x + this.w >= pp.x && this.x <= pp.x + pp.w) {
      if (this.y + this.h < pp.y) {
        this.vx *= 0.75;
        if (this.vy < 0) this.vy *= 0.75;
      }
      overX = true;
    }
    if (!alive) {
      // 玩家死亡：Laugh（ai[3]==0 播一次）+ >200t 强制 flag3 俯冲撤离（:43926-43938）
      if (this.ai3 === 0) { game.playSfx('statueMimicLaugh', 0.8, this.cx, this.cy); this.ai3 = 300; }
      if (this.ai3 > 200) { overX = true; this.ai3 -= 1; }
    } else if (this.ai3 > 0) this.ai3 -= 1;
    if (jump) {
      // 跳跃（:43940-43955）：noTileCollide 穿墙直接位移；
      // vy = -9.01 - (Bottom差/40 钳 0..10，死亡取 0)；vx = (4+|dx|/50 钳 12)×direction
      let dir = this.facing;
      if (pp) dir = Math.sign(pp.cx - this.cx) || 1;
      this.facing = dir;
      let lift = 0;
      if (pp && alive) lift = Math.max(0, Math.min(10, (this.y + this.h - (pp.y + pp.h)) / 40));
      this.vy = -9.01 - lift;
      const drive = pp ? Math.min(12, Math.abs(this.cx - pp.cx) / 50) : 12;
      this.vx = (4 + drive) * dir;
      this.x += this.vx;
      this.y += this.vy;
      return;
    }
    // 非跳跃帧（:43958-44008）：vy==0 立返；玩家正下俯冲 vy=16；
    // 否则下落加重力 + 朝向越顶衰减 ×0.96（活玩家才衰减）
    if (this.vy === 0) return;
    let phase: boolean | null = null;                      // 本帧 noTileCollide 目标态
    if (!alive && overX && pp && this.y + this.h < pp.y + pp.h) {
      this.vy = 16;                                        // 死亡撤离俯冲（Bottom < 尸体 Bottom）
      phase = true;
    } else if (overX && pp && this.y + this.h < pp.y) {
      this.vy = 16;                                        // 玩家正下俯冲
      phase = true;
    } else {
      if (this.vy > 0) this.applyGravity(game);
      if (alive && pp) {
        if (this.facing > 0 && this.cx > pp.cx) { this.vx *= 0.96; this.vy *= 0.96; }
        if (this.facing < 0 && this.cx < pp.cx) { this.vx *= 0.96; this.vy *= 0.96; }
      }
      // noTileCollide：上升 或 (水平重叠且在玩家上方) → 穿墙；身体离实心 → 复原
      if (this.vy < 0 || (overX && pp && this.y + this.h < pp.y)) phase = true;
    }
    if (phase === null) {
      const bx0 = Math.floor(this.x / TILE), bx1 = Math.floor((this.x + this.w - 0.01) / TILE);
      const by0 = Math.floor(this.y / TILE), by1 = Math.floor((this.y + this.h - 0.01) / TILE);
      let inSolid = false;
      outer2: for (let tx = bx0; tx <= bx1; tx++) for (let ty = by0; ty <= by1; ty++) {
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { inSolid = true; break outer2; }
      }
      // 原版仅在 !SolidCollision 时清 noTileCollide（陷实心维持穿墙态防卡墙）
      phase = !inSolid;
    }
    if (phase) { this.x += this.vx; this.y += this.vy; }   // 穿墙直接位移
    else moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_117 恐惧鹦鹉螺 618（NPC.cs:47488-47835）：血月钓鱼小 Boss。
   *  常量（:47490-47499）：加速 0.15 / 巡航 7.5 / 悬停 60 / 冲刺蓄力 90+180 /
   *  血弹蓄力 90+90（3 脉冲）/ 召唤 180。出场 ai[0]=-1：升空 vy=-2.5+渐显
   *  （-10/t，陷实心回补 +15 钳 150）50t。悬停 0：绕目标侧后方（-ai[2]×300,-200）
   *  SimpleFly；60t 后按 ai[3] 轮换：/7==3→召唤 3；偶→血弹 2；奇→冲刺 1（均 Item170）。
   *  冲刺 1：蓄力 90t 反向旋进（reflectsProjectiles=true 反弹玩家弹幕）+Item172；
   *  后 180t mouth 反向 -16 冲撞（嘴=rotation+0.4712×spriteDir，spriteDir=-1 再 +π）。
   *  血弹 2：蓄力 90t 吸尘；后每 30t 一脉冲（后坐 -8 + 5-10 发弹 814，
   *  mouthDir×10±6，伤 GetAttackDamage_ForProjectiles(30,25)）。召唤 3：定身发光
   *  （light 1,0.5,0.5 脉冲）+10/20/30t CallForHelp（≤3 只 619，落点搜索 ±20 格）。
   *  白天/非血月目标失效（悬停漂移）；noTileCollide 直接位移。 */
  private bloodNautilusAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const HOVER_T = 60, CHARGE_WIND = 90, CHARGE_T = 180, BLOOD_WIND = 90, BLOOD_T = 90;
    const SUMMON_T = 180, FLY_SPD = 7.5, FLY_ACC = 0.15;
    // 位置参考 = 真身（含尸体——同 690 处理；Main.player[target] 不因死亡失位）
    const pp: Player | null = (game as unknown as { player: Player | null }).player ?? player ?? null;
    const alive = !!pp && !pp.dead;
    // 目标失效（:47526-47530）：白天或非血月 → 无目标悬停
    const w = game.world;
    const bloodNight = !w.clock.isDay && w.clock.bloodMoon;
    const hasT = alive && bloodNight;
    const tx = hasT ? pp!.cx : 0, ty = hasT ? pp!.cy : 0;
    if (!this.aiInit) {                       // localAI[0]==0（:47502-47509）
      this.aiInit = true;
      this.ai0 = -1;
      this.spawnAlpha = 255;                  // alpha=255 出场渐显
      // 首帧 target==255 分支（:47521-47524）在 case -1 计数起步前补 ai[2]=direction
      this.ai2 = hasT ? (Math.sign(pp!.cx - this.cx) || 1) : 1;
    }
    // 嘴部（NPC.cs:67025-67034）：mouthAngle = rotation+0.4712×spriteDirection
    // （spriteDirection==-1 再 +π）；mouthPos = Center+mouthDir×50。
    // spriteDirection ↔ 本仓 facing（1=贴图水平翻转=朝右）
    const mouthAngle = () => this.visAngle + 0.47123894 * this.facing + (this.facing === -1 ? Math.PI : 0);
    let reflect = false;
    let next = -1;
    // 圆周角工具：AngleTowards（步长钳）/ AngleLerp（圆周插值）
    const angTowards = (a: number, b: number, max: number) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + Math.max(-max, Math.min(max, d));
    };
    const angLerp = (a: number, b: number, t: number) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    };
    switch (this.ai0) {
      case -1: {
        // 出场（:47534-47575）：减速 + 朝向目标（spriteDirection=-direction）
        this.vx *= 0.98; this.vy *= 0.98;
        if (hasT) {
          const d = Math.sign(tx - this.cx) || 1;
          this.facing = -d;                   // spriteDirection = -direction
        }
        if (this.ai2 > 5) {
          this.vy = -2.5;
          this.spawnAlpha -= 10;
          // 陷实心回补（:47560-47566 Collision.SolidCollision）
          const bx0 = Math.floor(this.x / TILE), bx1 = Math.floor((this.x + this.w - 0.01) / TILE);
          const by0 = Math.floor(this.y / TILE), by1 = Math.floor((this.y + this.h - 0.01) / TILE);
          let inSolid = false;
          outerN: for (let xx = bx0; xx <= bx1; xx++) for (let yy = by0; yy <= by1; yy++) {
            if (st.inBounds(xx, yy) && st.isSolid(xx, yy)) { inSolid = true; break outerN; }
          }
          if (inSolid) this.spawnAlpha = Math.min(150, this.spawnAlpha + 15);
          if (this.spawnAlpha < 0) this.spawnAlpha = 0;
        }
        this.ai2 += 1;
        if (this.ai2 >= 50) {
          // 出场结束四槽清零（:47572-47577）——ai[2]=direction 由悬停态迁出时
          // （next==0 分支）重新赋值，此处保持 0
          this.ai0 = 0; this.ai1 = 0; this.ai2 = 0; this.ai3 = 0;
        }
        break;
      }
      case 0: {
        // 悬停伺机（:47601-47633）：目标侧后方 (-ai[2]×300,-200) 巡航
        if (hasT) {
          const destX = tx - this.ai2 * 300, destY = ty - 200;
          if (Math.hypot(destX - this.cx, destY - this.cy) > 50) {
            // SimpleFlyMovement（:78100 逐轴 ±moveSpeed，过零双步）
            const dx = destX - this.cx, dy = destY - this.cy;
            const dl = Math.hypot(dx, dy) || 1;
            const wantVx = (dx / dl) * FLY_SPD, wantVy = (dy / dl) * FLY_SPD;
            if (this.vx < wantVx) { this.vx += FLY_ACC; if (this.vx < 0 && wantVx > 0) this.vx += FLY_ACC; }
            else if (this.vx > wantVx) { this.vx -= FLY_ACC; if (this.vx > 0 && wantVx < 0) this.vx -= FLY_ACC; }
            if (this.vy < wantVy) { this.vy += FLY_ACC; if (this.vy < 0 && wantVy > 0) this.vy += FLY_ACC; }
            else if (this.vy > wantVy) { this.vy -= FLY_ACC; if (this.vy > 0 && wantVy < 0) this.vy -= FLY_ACC; }
          }
          const dir = this.cx < tx ? 1 : -1;
          let want = Math.atan2(ty - this.cy, tx - this.cx) - 0.47123894 * this.facing;
          if (this.facing === -1) want += Math.PI;
          if (this.facing !== dir) { this.facing = dir; this.visAngle = -this.visAngle; want = -want; }
          this.visAngle = angTowards(this.visAngle, want, 0.02);
        }
        this.ai1 += 1;
        if (this.ai1 > HOVER_T) {
          const n3 = this.ai3 | 0;
          if (n3 % 7 === 3) next = 3;
          else {
            game.playSfxFile?.('Item_170', 1, this.cx, this.cy);
            next = n3 % 2 === 0 ? 2 : 1;
          }
        }
        break;
      }
      case 1: {
        // 冲刺（:47636-47700）：direction=背向目标；蓄力期朝反向旋进（反弹弹幕）
        const dir = !(this.cx < tx) ? 1 : -1;   // 注意：与悬停态相反（背向）
        let want = Math.atan2(this.cy - ty, this.cx - tx) - 0.47123894 * this.facing;
        if (this.facing === -1) want += Math.PI;
        const windup = this.ai1 < CHARGE_WIND;
        if (this.facing !== dir && windup) { this.facing = dir; this.visAngle = -this.visAngle; want = -want; }
        if (windup) {
          if (this.ai1 === CHARGE_WIND - 1) game.playSfxFile?.('Item_172', 1, this.cx, this.cy);
          reflect = true;                       // reflectsProjectiles（:47834）
          this.vx *= 0.95; this.vy *= 0.95;
          this.visAngle = angLerp(this.visAngle, want, 0.02);
          if (Math.random() < 0.4) {            // 吸入尘近似（mouth 前方红色尘）
            const ma = mouthAngle();
            game.spawnParticles(this.cx + Math.cos(ma) * 80, this.cy + Math.sin(ma) * 80,
              '#C83848', 1, 1.2, { life: 20 });
          }
        } else if (this.ai1 < CHARGE_WIND + CHARGE_T) {
          this.visAngle = angLerp(this.visAngle, want, 0.05);
          if (hasT && Math.hypot(tx - this.cx, ty - this.cy) > 150) {
            // 反嘴冲刺：v = -mouthDir×16 + 朝目标×1.5（:47679-47682）
            const ma = mouthAngle();
            this.vx = -Math.cos(ma) * 16 + Math.sign(tx - this.cx) * 1.5;
            this.vy = -Math.sin(ma) * 16 + Math.sign(ty - this.cy) * 1.5;
          }
          if (Math.random() < 0.6) {            // 喷尾尘
            const ma = mouthAngle();
            game.spawnParticles(this.cx + Math.cos(ma) * 100, this.cy + Math.sin(ma) * 100,
              '#A82838', 1, 1.6, { life: 18 });
          }
        }
        this.ai1 += 1;
        if (this.ai1 >= CHARGE_WIND + CHARGE_T) next = 0;
        break;
      }
      case 2: {
        // 血弹齐射（:47703-47766）：蓄力 90t 吸尘 → 90t 内每 30t 一脉冲
        if (hasT) {
          const dir = this.cx < tx ? 1 : -1;
          let want = Math.atan2(ty - this.cy, tx - this.cx) - 0.47123894 * this.facing;
          if (this.facing === -1) want += Math.PI;
          if (this.facing !== dir) { this.facing = dir; this.visAngle = -this.visAngle; want = -want; }
          this.visAngle = angLerp(this.visAngle, want, 0.2);
        }
        if (this.ai1 < BLOOD_WIND) {
          this.vx *= 0.95; this.vy *= 0.95;
          if (Math.random() < 0.5) {
            const ma = mouthAngle();
            game.spawnParticles(this.cx + Math.cos(ma) * 80, this.cy + Math.sin(ma) * 80,
              '#C83848', 1, 1.2, { life: 20 });
          }
        } else if (this.ai1 < BLOOD_WIND + BLOOD_T) {
          this.vx *= 0.9; this.vy *= 0.9;
          const pulse = (this.ai1 - BLOOD_WIND) % (BLOOD_T / 3);
          if (pulse === 0) {
            const ma = mouthAngle();
            const mx = this.cx + Math.cos(ma) * 50, my = this.cy + Math.sin(ma) * 50;
            // 后坐（:47742 velocity += mouthDir×-8）
            this.vx += -Math.cos(ma) * 8; this.vy += -Math.sin(ma) * 8;
            const n = 5 + Math.floor(Math.random() * 6);   // Next(5,11)
            const dmg = getAttackDamageForProjectiles(30, 25, this.difficulty);
            const ents = (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities;
            for (let k = 0; k < n; k++) {
              const vx = Math.cos(ma) * 10 + (Math.random() * 12 - 6);
              const vy = Math.sin(ma) * 10 + (Math.random() * 12 - 6);
              const dart = new Dart(mx - Math.cos(ma) * 5, my - Math.sin(ma) * 5, vx, vy, dmg, 814);
              dart.hostile = true;             // 敌怪弹（v5 bit7）
              ents.add(dart, 'projectiles');
            }
            for (let k = 0; k < 4; k++) game.spawnParticles(mx, my, '#B03040', 1, 2, { life: 22 });
          }
        }
        this.ai1 += 1;
        if (this.ai1 >= BLOOD_WIND + BLOOD_T) next = 0;
        break;
      }
      case 3: {
        // 召唤（:47769-47808）：定身 + 旋转归零 + 红光脉冲；10/20/30t CallForHelp
        if (hasT) this.facing = this.cx < tx ? 1 : -1;
        if (this.ai1 < SUMMON_T) {
          this.vx = 0; this.vy = 0;
          this.visAngle = angLerp(this.visAngle, 0, 0.02);
          const t01 = Math.min(1, this.ai1 / SUMMON_T);
          const pulse = Math.max(0, 1 - Math.abs(t01 - 0.5) * 2);  // GetLerpValue(0,.5,t)×(.5→1 反向)
          this.lightRGB = [1 * pulse, 0.5 * pulse, 0.5 * pulse];   // Lighting.AddLight（:47792）
          if (Math.random() < 0.6) {
            game.spawnParticles(this.cx + this.facing * 12, this.cy + 12, '#C83848', 1, 0.6, { life: 20 });
          }
        }
        if (this.ai1 === 10 || this.ai1 === 20 || this.ai1 === 30) this.bloodNautilusCallForHelp(game);
        this.ai1 += 1;
        if (this.ai1 >= SUMMON_T) next = 0;
        break;
      }
      default: this.ai0 = 0; break;
    }
    if (next !== -1) {                          // 状态迁移（:47810-47822）
      this.ai0 = next;
      this.ai1 = 0;
      this.ai2 = 0;
      if (next === 0) this.ai2 = this.facing;   // ai[2] = direction（悬停侧向记忆）
      else this.ai3 += 1;
    }
    this.reflectsProjectiles = reflect;         // :47834
    // noTileCollide（json）：直接位移
    this.x += this.vx;
    this.y += this.vy;
  }

  /** AI_117 CallForHelp（NPC.cs:47841-47879）：≤3 只 619 在场才召；落点 =
   *  本体 ±20 格、离本体/玩家各 >8/>3 格、非实心非岩浆、±2 格无实心、对玩家有
   *  视线；掷弹 813（血云 90t 后出鱿鱼）。100 次尝试。 */
  private bloodNautilusCallForHelp(game: GameHooks) {
    const st = game.world.store;
    const pp: Player | null = (game as unknown as { player: Player | null }).player ?? null;
    if (!pp || pp.dead) return;
    if (Math.hypot(pp.cx - this.cx, pp.cy - this.cy) > 2000) return;
    const squids = (game.enemies() as Enemy[]).filter((n) => !n.dead && n.vanillaId === 619).length;
    if (squids >= 3) return;
    const cxT = Math.floor(this.cx / TILE), cyT = Math.floor(this.cy / TILE);
    const pxT = Math.floor(pp.cx / TILE), pyT = Math.floor(pp.cy / TILE);
    const solid2 = (tx: number, ty: number) =>
      st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] !== 0 && !!TILE_DEFS[st.type[st.idx(tx, ty)]]?.solid;
    const active = (tx: number, ty: number) => st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] !== 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = cxT + Math.floor(Math.random() * 41) - 20;
      const y = cyT + Math.floor(Math.random() * 41) - 20;
      // 双排除环（:47855-47857）：离本体 ±8 / 离玩家 ±3 之外
      if (Math.abs(y - cyT) <= 8 && Math.abs(x - cxT) <= 8) continue;
      if (Math.abs(y - pyT) <= 3 && Math.abs(x - pxT) <= 3) continue;
      if (active(x, y)) continue;               // nactive() = active&&!inActive 近似
      if (st.inBounds(x, y) && st.liquid[st.idx(x, y)] === 2) continue;   // lava
      let clear = true;                         // Collision.SolidTiles ±2
      for (let xx = x - 2; xx <= x + 2 && clear; xx++) {
        for (let yy = y - 2; yy <= y + 2; yy++) {
          if (solid2(xx, yy)) { clear = false; break; }
        }
      }
      if (!clear) continue;
      // 视线（CanHitLine 本体→玩家；point 重载按 0×0 盒）
      if (!canHit(st, this.cx, this.cy, 0, 0, pp.cx, pp.cy, 0, 0)) continue;
      const cloud = new SquidCloud(x * TILE + 8, y * TILE + 8);
      (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(cloud, 'projectiles');
      return;
    }
  }

  private dragonflyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) { this.aiInit = true; this.ai0 = 1; this.ai1 = 0; this.ai2 = this.cx; this.ai3 = this.cy; }
    if (this.aiT % 15 === 0) { // 避敌
      let fx = 0, fy = 0;
      for (const o of game.enemies()) {
        const e = o as Enemy;
        if (e === this || e.dead || e.def.damage <= 0) continue;
        const d = Math.hypot(e.cx - this.cx, e.cy - this.cy);
        if (d < 100 && d > 0.01) { fx += (this.cx - e.cx) / d * 2; fy += (this.cy - e.cy) / d * 2; }
      }
      if (player && !player.dead) {
        const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
        if (d < 150 && d > 0.01) { fx += (this.cx - player.cx) / d * 2; fy += (this.cy - player.cy) / d * 2; }
      }
      const m = Math.hypot(fx, fy);
      if (m > 0.01) {
        this.vx = Math.max(-16, Math.min(16, this.vx + fx));
        this.vy = Math.max(-16, Math.min(16, this.vy + fy));
        this.ai2 = this.cx + fx * 10; // 锚点迁移
        this.ai3 = this.cy + fy * 10;
      }
    }
    const anchD = Math.hypot(this.ai2 - this.cx, this.ai3 - this.cy);
    if (this.ai0 === 0) {
      this.vx *= 0.94; this.vy *= 0.94;
      this.ai1 -= 1;
      if (this.ai1 <= 0) {
        if (anchD > 96) {
          this.vx = ((this.ai2 - this.cx) / (anchD || 1)) * 3;
          this.vy = ((this.ai3 - this.cy) / (anchD || 1)) * 3;
          this.ai0 = 1;
          this.ai1 = anchD > 112 ? 200 : 4;
        } else {
          this.vx += (Math.random() - 0.5) * 1;
          this.vy += (Math.random() - 0.5) * 1;
          this.ai1 = 60 + Math.floor(Math.random() * 60);
        }
      }
    } else {
      this.ai1 -= 1;
      const cx = Math.floor(this.cx / TILE), cy = Math.floor(this.cy / TILE);
      let below = false;
      for (let k = 1; k <= 3; k++) if (st.isSolid(cx, cy + k) || st.liquid[st.idx(cx, cy + k)] > 0) { below = true; break; }
      if (below) { this.vy -= 0.2; this.vx *= 0.9; this.vy *= 0.9; }
      let aboveClear = true;
      for (let k = 1; k <= 30 && aboveClear; k++) if (st.isSolid(cx, cy - k)) aboveClear = false;
      if (aboveClear) { this.vx *= 0.9; this.vy *= 0.9; }
      if (this.inWater) this.vy = -3;
      if (this.ai1 <= 0) { this.ai0 = 0; this.ai1 = 60 + Math.floor(Math.random() * 60); }
    }
    this.facing = this.vx > 0 ? 1 : -1;
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_115 瓢虫/椿象 604/605/669（AI_115_LadyBugs cs:47944）：ai[0]=飞行方向角、
   *  ai[2]=0 飞/1 陆行、localAI 重选 60-180 帧 1/5 概率切换。飞行：v → Lerp(角向×1, v, 0.0125)
   *  慢飞、垂直避障同蝶族、collideX → 角反射+vx×-0.2；陆行：一跳一跳 Lerp(UnitX*dir, 0.05)
   *  +vy+=0.2、前方 1 格下 4 格有水 → 起飞（cs:48036-48075） */
  private ladybugAI(game: GameHooks, _player: Player | null) {
    const st = game.world.store;
    // 玩家身体接触活瓢虫 → 好运（NPC.UpdateNPC 接触段 cs:78730-78732 →
    // LadyBugLuck :82366：800px 内按距离^6 衰减，详见 LuckState.ladyBugTouched；
    // 仅 604/605——同 AI_115 的椿象 669 不参与）
    if (_player && !_player.dead && (this.vanillaId === 604 || this.vanillaId === 605)) {
      if (this.x < _player.x + _player.w && this.x + this.w > _player.x
        && this.y < _player.y + _player.h && this.y + this.h > _player.y) {
        _player.luckState?.ladyBugTouched(
          Math.hypot(this.cx - _player.cx, this.cy - _player.cy), this.vanillaId === 605);
      }
    }
    if (!this.aiInit) { this.aiInit = true; this.ai0 = Math.random() * Math.PI * 2; this.ai1 = 60 + Math.floor(Math.random() * 120); this.ai2 = 0; }
    this.ai1 -= 1;
    if (this.ai1 <= 0) {
      this.ai1 = 60 + Math.floor(Math.random() * 120);
      if (Math.random() < 0.2) this.ai2 = this.ai2 === 0 ? 1 : 0;
      if (this.ai2 === 0) this.ai0 = Math.random() * Math.PI * 2;
    }
    if (this.ai2 === 0) {
      // 飞行
      const tx = Math.cos(this.ai0), ty = Math.sin(this.ai0);
      this.vx += (tx - this.vx) * 0.0125;
      this.vy += (ty - this.vy) * 0.0125;
      const cx = Math.floor(this.cx / TILE), cy = Math.floor(this.cy / TILE);
      let belowSolid = false;
      for (let k = 1; k <= 4; k++) if (st.isSolid(cx, cy + k) || st.liquid[st.idx(cx, cy + k)] > 0) { belowSolid = true; break; }
      if (belowSolid) this.ai0 = -this.ai0;
      let aboveClear = true;
      for (let k = 1; k <= 30 && aboveClear; k++) if (st.isSolid(cx, cy - k)) aboveClear = false;
      if (aboveClear) this.ai0 = Math.PI - this.ai0;
      this.facing = this.vx > 0 ? 1 : -1;
      const oldVx = this.vx;
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.hitWall) { this.vx = oldVx * -0.2; this.ai0 = Math.PI - this.ai0; }
      return;
    }
    // 陆行
    const fx = Math.floor((this.cx + this.facing * (this.w / 2 + 8)) / TILE);
    const fy = Math.floor(this.cy / TILE);
    let waterAhead = false;
    for (let k = 1; k <= 4; k++) if (st.liquid[st.idx(fx, fy + k)] > 80) { waterAhead = true; break; }
    if (waterAhead) { this.ai2 = 0; this.ai0 = Math.random() * Math.PI * 2; return; }
    if (this.vy !== 0) {
      this.vx *= 0.98;
      this.vy += (2 - this.vy) * 0.05;
    } else {
      this.vx += (this.facing * 0.05 - this.vx) * 0.1;
      this.vy += 0.2; // 一跳一跳
    }
    this.vy = Math.min(this.vy, 10);
    const oldVx = this.vx;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.facing *= -1; this.vx = oldVx * -0.2; }
  }

  /** AI_116 水黾 612/613（AI_116_WaterStriders cs:47882）：钉水面（Center.Y > 水面 →
   *  vy-=0.8 限 -4；反之钳到水面）+ 每 120-240 帧随机方向 ×5 冲刺（不在水面/未 wet 时
   *  60-240，着地顺带 vy=-2 起跳，cs:47910-47941） */
  private waterStriderAI(game: GameHooks) {
    const st = game.world.store;
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    const liq = st.liquid[st.idx(tx, ty)];
    let onSurface = false;
    if (liq > 80) {
      // 本格液面高度 → 水面 Y 近似（液量比例）
      const waterY = ty * TILE + (TILE - (liq / 255) * TILE);
      if (this.cy > waterY) { this.vy -= 0.8; if (this.vy < -4) this.vy = -4; }
      else { this.vy = Math.min(this.vy, waterY - (this.y + this.h - 1)); onSurface = true; }
    } else if (this.inWater) {
      this.vy -= 0.2;
    }
    this.ai1 += 1;
    this.vx *= 0.9;
    if (this.onGround) this.vx *= 0.6;
    const interval = onSurface ? 120 + Math.floor(Math.random() * 120) : 60 + Math.floor(Math.random() * 180);
    if (this.ai1 >= interval) {
      this.ai1 = 0;
      this.vx = (Math.random() < 0.5 ? -1 : 1) * 5;
      this.facing = this.vx > 0 ? 1 : -1;
      if (!onSurface && this.onGround) { this.vy = -2; this.ai1 = 60; }
    }
    // 水黾离水才落（wet 态浮沉本 AI 自管 :5568-5576，不走通用湿档）
    if (!(this.inWater || liq > 80)) this.applyGravity(game);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_118 海马 626/627（AI_118_Seahorses cs:47432）：noGravity=wet；水中 ai[1] 冷却
   *  归零时沿 ai[0] 角 +0.06 加速、合速超 ±3 → 重随机角（450-600 帧）；非冲刺帧 v×0.95；
   *  接近水面时新角朝下则折回；离水 vy==0 时 vx×0.95 瘫软；碰撞反射对应轴（cs:47470） */
  private seahorseAI(game: GameHooks) {
    const st = game.world.store;
    // 类默认 -1120 当角度用 = 出生朝向固化 ~92°(2026-08-13 清查)——归 0 交由下方
    // 原版自愈(==0 → 随机角)接管,与 NewNPC ai[0]=0 起步语义一致
    if (this.ai0 < 0) this.ai0 = 0;
    if (this.ai0 === 0 || Math.abs(this.ai0) < 0.01) this.ai0 = Math.random() * Math.PI * 2;
    if (this.ai1 <= 0) this.ai1 = 450 + Math.floor(Math.random() * 150);
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    if (inWater) {
      this.ai1 -= 1;
      if (this.ai1 <= 0) {
        this.vx += Math.cos(this.ai0) * 0.06;
        this.vy += Math.sin(this.ai0) * 0.06;
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 3) {
          this.ai0 = Math.random() * Math.PI * 2;
          this.ai1 = 450 + Math.floor(Math.random() * 150);
        }
        // 接近水面且新角朝下 → 折回
        const ty = Math.floor(this.cy / TILE);
        const liq = st.liquid[st.idx(Math.floor(this.cx / TILE), ty)];
        const waterY = ty * TILE + (TILE - (liq / 255) * TILE);
        if (this.y - waterY < 20 && Math.sin(this.ai0) > 0) this.ai0 -= Math.PI;
      } else {
        this.vx *= 0.95;
        this.vy *= 0.95;
      }
    } else {
      this.applyGravity(game);
      if (this.vy === 0) this.vx *= 0.95;
    }
    this.facing = this.vx > 0 ? 1 : -1;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.vx *= -1; this.ai0 = Math.PI - this.ai0; }
    if (this.onGround || this.hitHead) { this.vy *= -1; this.ai0 = -this.ai0; }
  }

  /** Caster 族传送双端爆发（:20818-20867 旧位 / :20901-20967 新位）：
   *  Item8 + 50 尘，尘 id→近似色按族映射。 */
  private static readonly CASTER_TP_DUST: Record<number, string> = {
    29: '#7A5AC8', 45: '#7A5AC8',      // dust 27 阴影焰（scale 1-2）
    32: '#9AC8E8',                     // dust 172
    693: '#F0F0F0',                    // dust 269 白（noLight）
    283: '#5AC86A', 284: '#5AC86A',    // dust 173（速度 ×2）
    285: '#E8705A', 286: '#E8705A',    // dust 174
    281: '#8AE8C8', 282: '#8AE8C8',    // dust 175
    172: '#E8C85A',                    // dust 106（scale 2.5）
    533: '#7A5AC8',                    // dust 27（scale 2.5）
  };
  private casterTeleportBurst(game: GameHooks) {
    const color = Enemy.CASTER_TP_DUST[this.vanillaId ?? -1] ?? '#FFA040'; // 默认 dust 6 火把焰
    game.playSfxFiles(['Item_8'], 1, this.cx, this.cy);   // :20818/:20901 双端各一次
    game.spawnParticles(this.cx, this.cy, color, 50, 3, { life: 30 });    // :20819-20885 ×50
  }

  private casterAI(game: GameHooks, player: Player | null) {
    const vid = this.vanillaId ?? -1;
    if (!this.aiInit) {
      this.aiInit = true;
      this.ai0 = 500;                        // :20799-20801 初始 500
      this.ai1 = 0; this.ai2 = 0; this.ai3 = 0;
      if (vid === 172) this.spawnAlpha = 255;  // :20797-20804 alpha 0 起步（spawnAlpha=255 对应不可见）
    }
    // 172 符文法师淡入（:20797-20809：alpha 每帧 +1 ≈ spawnAlpha -1/t；受击归零重淡）
    if (vid === 172) {
      if (this.justHit) this.spawnAlpha = 255;
      if (this.spawnAlpha > 0) this.spawnAlpha = Math.max(0, this.spawnAlpha - 1);
    }
    // ---- ① 传送执行（:20811-20968）：目的地待执行 → 双端 FX + 改写 ----
    if (this.ai2 !== 0 && this.ai3 !== 0) {
      this.casterTeleportBurst(game);
      this.x = this.ai2 * TILE - this.w / 2 + 8;   // :20888-20889（+8 为贴图格内偏移）
      this.y = this.ai3 * TILE - this.h;
      this.vx = 0; this.vy = 0;
      this.ai2 = 0; this.ai3 = 0;
      this.casterTeleportBurst(game);
    }
    this.ai0 += 1;                                 // :20971 每帧计时
    // :20777-20784 RedHat 变体（红帽骷髅王 35 ai[3]==1 在场 → localAI[3]=1 置位永不清；
    // 帧侧整带 +3、计时双倍）。本仓红帽召唤链未实装（Enemy.redHat 恒 false）→ 恒 0
    // （enemies 可选访问：测试桩 hooks 可能未实现）
    if (vid === 32 && this.lai3 === 0) {
      const enemiesOf = (game as { enemies?: () => unknown[] }).enemies;
      const sk = enemiesOf
        ? (enemiesOf.call(game) as Enemy[]).find((n) => n.vanillaId === 35 && !n.dead)
        : undefined;
      if (sk?.redHat) this.lai3 = 1;
    }
    // :20787-20791 X 摩擦 0.93 + |vx|<0.1 归零（Y 不阻尼——重力由引擎共享段承担）
    this.vx *= 0.93;
    if (this.vx > -0.1 && this.vx < 0.1) this.vx = 0;
    // 物理：全族 SetDefaults 均无 noGravity/noTileCollide → 受重力+瓦片碰撞
    // （传送落点即站面、受击呈正常抛物线回落）。旧实现 vx/vy 同乘 0.9 裸积分——
    // 无重力无碰撞，受击 vy<0 只缓衰减不回落 = "被击退就往上飞"（2026-08-17 用户报告）
    if (!this.vanilla?.noGravity) {
      this.applyGravity(game);
      moveAndCollide(this, game.world, this.vx, this.vy);
    } else {
      this.x += this.vx; this.y += this.vy;        // 数据侧若标 noGravity 则保悬浮直移
    }
    // ---- 点光（cs:21274-21341 粉尘链后的 AddLight 分支，在移动后每帧执行）----
    if (vid === 693) {
      // :21272-21276 图书管理员骷髅：num116=Remap(ai[0],0,60,0,1)²>0 时 Top 位
      // （0.91/0.82/0.57)×num116——传送后 ai[0] 归 1 再涨 60 帧到 1，常态恒满
      const ramp = Math.min(Math.max(this.ai0 / 60, 0), 1);
      const n116 = ramp * ramp;
      if (n116 > 0) {
        this.lightRGB = [0.91 * n116, 0.82 * n116, 0.57 * n116];
        this.lightRGBAt = { x: this.cx, y: this.y };          // base.Top
      }
    } else if (vid === 533) {
      this.lightRGB = [0.6, 0.6, 0.3];                        // :21331-21333 沙漠幽魂 Top
      this.lightRGBAt = { x: this.cx, y: this.y };
    } else if (vid !== 172) {
      // :21336-21338 兜底（24 火妖/29 哥布林术士/32 黑暗施法者/45 Tim/281-286 地牢
      // 法师）Center 0.6/0.39/0.24；172 符文法师走粉尘分支不发光
      this.lightRGB = [0.6, 0.39, 0.24];
    }
    if (!player) return;
    this.facing = this.seekDirX(player);
    // ---- ② 攻击蓄力点（:20984-21054）→ ai1=30（下帧起倒数，==25 发射）----
    const at = (pts: number[]) => { if (pts.includes(this.ai0)) this.ai1 = 30; };
    if (vid === 283 || vid === 284) at([100, 150, 200, 250, 300]);
    else if (vid === 172) at([75, 150, 225, 300, 375, 450]);
    else if (vid === 281 || vid === 282) at([100, 120, 140, 200, 220, 240, 300, 320, 340]);
    else if (vid === 533) { if (this.ai0 === 180) this.ai1 = 181; }   // :21006 特殊循环支
    else {
      // :21033-21037 flag4（RedHat 变体 32）双倍计时：+1 后奇数回退 → 恒落偶数、
      // 净 +2/t（蓄力点 100/200/300 均偶数照常命中 = 红帽法师整轮 2 倍速）。
      // （getGood+24+血肉墙在场的同型双倍档 :21029-21032 未接，FTW 种子消费登记）
      if (this.lai3 === 1) { this.ai0 += 1; if (this.ai0 % 2 === 1) this.ai0 -= 1; }
      at([100, 200, 300]);                          // :21042 默认（24/29/32/45/285-286/693）
    }
    // ---- ③ 提前传送上限（族内阈值 → 直拉 650/700 档）----
    if ((vid === 283 || vid === 284) && this.ai0 >= 450) this.ai0 = 700;    // :20991
    else if ((vid === 281 || vid === 282) && this.ai0 >= 540) this.ai0 = 700; // :21019
    else if ((vid === 285 || vid === 286) && this.ai0 > 400) this.ai0 = 650;  // :21048
    else if (vid === 533 && this.ai0 >= 360) this.ai0 = 650;                  // :21052
    // ---- ④ 传送触发（:21056-21078）：≥650 → ai0=1 + 采样落点（失败=整轮重来）----
    if (this.ai0 >= 650) {
      this.ai0 = 1;
      // :21068-21072 693 图书管理员骷髅：先尝试贴书落点（NearBooks 30 格窗，
      // AI_AttemptToFindTeleportSpotNearBooks :18948），失败落回通用法师传送
      const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
      let spot = vid === 693
        ? attemptToFindTeleportSpotNearBooks(this, game, ptx, pty, 30) : null;
      if (!spot) {
        spot = attemptToFindTeleportSpot(this, game, ptx, pty,
          20, 5, { dungeonWallGate: vid === 32 || (vid >= 281 && vid <= 286) });  // :21070 caster 参数 telefrag=5
      }
      if (spot) {
        this.ai1 = vid === 24 ? 5 : 20;            // :21062-21066（Imp 短冷却 → 跳过 ==25 发射门）
        this.ai2 = spot.x; this.ai3 = spot.y;
      }
    }
    // ---- ⑤ 弹幕（:21080-21240）：ai1>0 递减；533 每 30t 循环支；Imp ==10 专属；其余 ==25 ----
    if (this.ai1 > 0) {
      this.ai1 -= 1;
      if (vid === 533) {
        if (this.ai1 % 30 === 0 && this.ai1 / 30 < 5) this.fireCasterVolley(game, player);
      } else if (vid === 24) {
        if (this.ai1 === 10) this.fireCasterVolley(game, player);   // :21131-21136
      } else if (this.ai1 === 25) {
        this.fireCasterVolley(game, player);                         // :21139
      }
    }
  }

  /** Caster 族单发弹幕（:21139-21240 volley）：蓄力 30t 倒数至 25/10 时发射 + Item8（172 无声） */
  private fireCasterVolley(game: GameHooks, player: Player) {
      const vid = this.vanillaId ?? -1;
      // 弹跳球系法师（NPC.cs:21136/:21199-21206）：火妖 24→25 焰球 / 哥布林术士
      // 29→30 混沌球 / 水球术士 32→33 水球 / 黑暗法师 45→665 混沌球(Tim 变体)——
      // 原版每轮 volley 只 NewNPC 一球（AI_009 自带出膛定速），其余法师走 Dart 三连
      const ballByCaster: Record<number, number> = { 24: 25, 29: 30, 32: 33, 45: 665 };
      const ballId = ballByCaster[this.vanillaId ?? -1];
      if (ballId) {
        // 出膛锚（NewNPC :81547 Bottom 锚点换算回中心）：其余 = (X+width/2, Y-8)
        // → 中心 y = top-16；Imp 25 = (X+width/2+dir*8, Y+20) → 中心 y = top+12
        // （:21134/:21199-21201；曾用 cy±偏移 → 球生在法师躯体中部）
        const ball = Enemy.fromVanilla(ballId,
          this.cx + (ballId === 25 ? this.facing * 8 : 0),
          this.y + (ballId === 25 ? 12 : -16));
        if (ball) {
          // :21204 NewNPC(33,...,flag4?1:0) → 末参 ai[3]：RedHat 变体标记（球侧
          // RedHatSkeletronAdjustmentsEnabled 消费，getGood 提速档用）
          if (vid === 32) ball.ai3 = this.lai3 === 1 ? 1 : 0;
          addEnemy(game, ball);
        }
      } else if (this.vanillaId != null && this.vanillaId >= 281 && this.vanillaId <= 286) {
        // 史后三法师（NPC.cs:21146-21191 num100/104/105）：布道者 281/282 迷失之魂 293
        // （速 4、伤 40、timeLeft 300）;死灵法师 283/284 暗影束 290（速 6、伤 30,散布 ±30
        // + 目标速度前置补偿 ×10）;魔法师 285/286 地狱火弹 291（速 8、伤 40）。
        // 枪口 = (cx, y)（vector13 = 顶部中心）
        const vid = this.vanillaId;
        const proj = vid <= 282 ? 293 : vid <= 284 ? 290 : 291;
        const spd = vid <= 282 ? 4 : vid <= 284 ? 6 : 8;
        // :21180 num104 = GetAttackDamage_ForProjectiles(num104, num104*0.8) =
        // Remap(difficulty, Classic, Expert, 基线, 基线×0.8)（大师钳在 Expert 端）。
        // 弹体基线【不】用缩放后的 def.damage——命中玩家的难度乘区在
        // projTargets.hitPlayer（Projectile.cs:13770）统一做，双乘会 ×4
        const dmg = getAttackDamageForProjectiles(
          vid <= 282 || vid >= 285 ? 40 : 30,
          (vid <= 282 || vid >= 285 ? 40 : 30) * 0.8, this.difficulty);
        let dx = player.cx - this.cx, dy = player.cy - this.cy;
        if (vid === 283 || vid === 284) {           // :21163-21166 散布 + 前置补偿
          dx += (Math.random() * 60 - 30) - player.vx * 10;
          dy += (Math.random() * 60 - 30) - player.vy * 10;
        }
        const d = Math.hypot(dx, dy) || 1;
        const dart = new Dart(this.cx, this.y, (dx / d) * spd, (dy / d) * spd, dmg, proj);
        dart.hostile = true; // 史后三法师直构弹——敌怪弹（v5 bit7）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(dart, 'projectiles');
      } else if (vid === 533) {
        // 沙漠精灵（:21104-21135）：落点采样=玩家 ±6 格（排除玩家/自身 6×6 邻域 + 非激活格
        //  + 非岩浆 + ±2 无实心），50 次，>2000px 放行 → 在落点原位放追踪弹 596（零初速）
        const st = game.world.store;
        const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
        const mtx = Math.floor(this.cx / TILE), mty = Math.floor(this.cy / TILE);
        const far = Math.abs(this.cx - player.cx) + Math.abs(this.cy - player.cy) > 2000; // :21100
        for (let att = 0; att < 50 && !far; att++) {
          const sx = ptx + Math.floor(Math.random() * 13) - 6;
          const sy = pty + Math.floor(Math.random() * 13) - 6;
          if (Math.abs(sy - pty) <= 6 && Math.abs(sx - ptx) <= 6) continue;   // 玩家邻域排
          if (Math.abs(sy - mty) <= 6 && Math.abs(sx - mtx) <= 6) continue;   // 自身邻域排
          if (!st.inBounds(sx, sy) || st.get(sx, sy) !== 0) continue;
          if (st.liquid[st.idx(sx, sy)] > 0 && st.liquidType[st.idx(sx, sy)] === 2) continue;
          let ok = true;
          for (let dx2 = -2; dx2 <= 2 && ok; dx2++) {
            for (let dy2 = -2; dy2 <= 2; dy2++) {
              if (st.inBounds(sx + dx2, sy + dy2) && st.isSolid(sx + dx2, sy + dy2)) { ok = false; break; }
            }
          }
          if (!ok) continue;
          const curse = new Dart(sx * TILE + 8, sy * TILE + 8, 0, 0, this.baseDamage, 596);
          curse.hostile = true;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(curse, 'projectiles');
          break;
        }
        if (far) {
          const curse = new Dart(this.cx, this.cy, 0, 0, this.baseDamage, 596);
          curse.hostile = true;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(curse, 'projectiles');
        }
      } else if (vid === 172) {
        // 符文法师（:21228-21240）：单发符文爆弹 129——速 10、伤 40、瞄准 ±10 抖动、
        //  timeLeft 300；发射音 21196 例外门已在外层跳过（172 无声）
        let dx = player.cx - this.cx + (Math.random() * 20 - 10);
        let dy = player.cy - this.cy + (Math.random() * 20 - 10);
        const d = Math.hypot(dx, dy) || 1;
        dx = (dx / d) * 10; dy = (dy / d) * 10;
        const dmg172 = getAttackDamageForProjectiles(40, 32, this.difficulty);
        const blast = new Dart(this.cx, this.cy, dx, dy, dmg172, 129);
        blast.hostile = true;
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(blast, 'projectiles');
      } else if (vid === 693) {
        // 图书管理员骷髅（NPC.cs:21208-21215）：书锚 = AI_FindNearbyBook（tile 50 放置书
        // = 本仓 v_50_books，Center−(10,20) 起 20×30 窗随机一本，:26275-62804）——
        // 书由玩家放置（书架 101 掉书物 → 桌面/书架放置），无书走原版兜底
        // Center+NextVector2Circular(30,15)。弹 1092 书弹 dmg 13 原值（无难度包装），
        // 零初速、ai1=45、ai2=target——三态 AI 见 BookProj（Projectile.cs:23742-23809）
        const st = game.world.store;
        const mtx = Math.floor(this.cx / TILE), mty = Math.floor(this.cy / TILE);
        let bx = this.cx, by = this.cy;
        const books: Array<[number, number]> = [];
        for (let sy = Math.max(0, mty - 20); sy < Math.min(st.h, mty + 10); sy++) {
          for (let sx = Math.max(0, mtx - 10); sx < Math.min(st.w, mtx + 10); sx++) {
            const t = st.get(sx, sy);
            if (t && TILE_DEFS[t]?.vanilla?.sheet === 50) books.push([sx, sy]);
          }
        }
        if (books.length > 0) {
          // 随机一本（closestBook=false 分支 :2733-2740）→ 书格中心
          const [bx2, by2] = books[Math.floor(Math.random() * books.length)];
          bx = bx2 * TILE + 8; by = by2 * TILE + 8;
        } else {
          // NextVector2Circular(30,15)（Utils.cs：单位角×(30,15)×NextFloat）
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random();
          bx += Math.cos(ang) * 30 * rad;
          by += Math.sin(ang) * 15 * rad;
        }
        const book = new BookProj(bx - 8, by - 8, 13, player);
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(book, 'projectiles');
      } else {
        // 原版通用分支无兜底发射（NPC.cs:21196-21241 的 if 链外零弹）——法师族全员
        // （24/29/32/45/281-286/533/693/172）均有专属分支，此处仅防守性静默
      }
    if (this.vanillaId !== 172) {
      game.playSfxFiles(['Item_8'], 1, this.cx, this.cy);   // :21196 发射音（172 例外）
    }
  }

  private flyAI(game: GameHooks, player: Player | null, steer: number) {
    // 恶魔眼式飞行 AI：
    // 游荡时自主调整航向（朝巡航点平滑转向、到点即换新目标、撞墙自动绕开）；
    // 玩家进入索敌范围后：朝向玩家明显加速逼近；脱离后回落游荡。
    const dist = player ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : Infinity;
    const aggro = 18 * 16; // 18 格索敌（仓内近似门——原版 aiStyle 2 无距离索敌）
    // 卡墙脱困：追击中持续撞墙/贴地/顶头 → 暂时退回游荡重新选航向（冷却内不再贴脸），
    // 防止顶在崖壁/坑洞里原地抖动
    if (this.stuckCd > 0) this.stuckCd--;
    if (this.state === 1 && (this.hitWall || this.onGround || this.hitHead)) {
      if (++this.stuckT > 18) { this.stuckT = 0; this.stuckCd = 45; this.state = 0; this.target = null; }
    } else this.stuckT = 0;
    // 索敌门走统一入口 canTargetPlayerAt：有效距离按原版公式减 player.aggro
    // （NPC.cs:78485-78492）——潜行装（星璇 -1200/蘑菇矿 -750/变态刀 -750）拉远
    // 索敌，脱潜（挥击/移出潜行）恢复正常。★原版 aiStyle 2 飞行族索敌无距离门
    // （TargetClosest 无条件锁定唯一玩家），18 格为仓内近似，仅门内挂 aggro 消费
    if (player && this.canTargetPlayerAt(player, aggro) && this.stuckCd === 0) {
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

  /**
   * AI_004 克苏鲁之眼 1:1（1456 NPC.cs:19909-20757；经典+专家双档，getGoodWorld
   * （for the worthy）分支全量实装；netcode 跳过）。
   *  ai 槽位映射：ai0=ai[0]（0 P1 / 1 变身段一 / 2 段二 / 3 P2）、state=ai[1]（态号，
   *  变身期闲置）、ai2=ai[2]（态内计时，本函数内自增——不用自动预增的 aiT，保证与
   *  原版"先判后增"逐 tick 对齐）、spinSpeed=变身段 ai[2]（自旋角速度）、
   *  servantT/chargesLeft 共享 ai[3]（P1 仆从累计 / P2 冲撞计数，两段互斥不并存，
   *  原版各清零点照抄）、phase 仅为仓内 umbrella（变身起置 2，legacy 渲染路径消费）。
   *  P1 悬浮(上方 200px, 5/0.04；专家 7/0.15) → 600t(专家 210t) → 3 连冲(6/专家 7,
   *  冲程 150t/专家 100t, 40t 后 0.98 摩擦+专家再 ×0.985);
   *  悬浮期 NPC 在玩家上方且 <500px(专家仅距离门) 累计 110t(专家 44t) 召仆从
   *  (速 5/专家 6) + NPCHit(3); HP<50%(专家 65%) → 变身两段各 100t（段一加速自旋+
   *  gore 8/7/6×2/尘 20/NPCHit+Roar，段二减速收尾）→ P2;
   *  P2 每 tick 覆写 defense=0 / damage=LerpBetweenFinalValues(23,18)+CappedAtMaster
   *  （经典 23 / 专家 36 / 大师 54；专家 hp<12% 防 -15、<4% lerp 上限 20+防 -30）;
   *  悬浮(上方 120px, 6/0.07, 专家按 400/600/800px 距离爬坡 +1/+0.05) → 200t →
   *  3 连冲(6.8, 专家 2/3 冲 ×1.15/×1.30, 冲程 130/专家 90t, 50t 摩擦) → 专家 hp<50%
   *  转 ai[1]=3 预测连冲（速 20、冲程 20t、5 连、hp<12% 悬玩家下方 600px 回冲 ×4
   *  提前量、<4% 双倍提前量）;
   *  白天/玩家死亡: vy-=0.04 漂离 + EncourageDespawn(10)，状态机冻结。
   *  旋转: 恒定速率线性步进追脸(cs:19975-20012)，分档表 cs:19939-19966（专家 ×1.5）。
   */

  /** 原版轴伺服（cs:20050-20081）：分轴逼近期望速度,符号相反时双倍加速 */
  private servoTo(tx: number, ty: number, spd: number, accel: number): void {
    const d0 = Math.hypot(tx - this.cx, ty - this.cy) || 1;
    const ex = ((tx - this.cx) / d0) * spd;
    const ey = ((ty - this.cy) / d0) * spd;
    if (this.vx < ex) {
      this.vx += accel;
      if (this.vx < 0 && ex > 0) this.vx += accel;
    } else if (this.vx > ex) {
      this.vx -= accel;
      if (this.vx > 0 && ex < 0) this.vx -= accel;
    }
    if (this.vy < ey) {
      this.vy += accel;
      if (this.vy < 0 && ey > 0) this.vy += accel;
    } else if (this.vy > ey) {
      this.vy -= accel;
      if (this.vy > 0 && ey < 0) this.vy -= accel;
    }
  }

  /** EoC 旋转追踪（cs:19975-20012 1:1）：向 target 以恒定 rate 线性步进（最短弧，
   *  环绕判定用原版 3.1415 字面量），步进后归一到 [0,6.283) 并在 |Δ|<rate 吸附带内
   *  直接对齐。rate=0（expert 且 hp<4%）时冻结朝向不步进。
   *  此前为 diff×min(1,rate*10) 指数逼近——快速档直接瞬移、慢速档永不到位，均偏离原版。 */
  private applyEocRotation(target: number, rate: number): void {
    let t = target;
    while (t < 0) t += Math.PI * 2;
    while (t >= Math.PI * 2) t -= Math.PI * 2;
    let a = this.visAngle;
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    if (rate > 0) {
      if (a < t) {
        if (t - a > 3.1415) a -= rate; else a += rate;
      } else if (a > t) {
        if (a - t > 3.1415) a += rate; else a -= rate;
      }
      // 归一（cs:20001-20008 单步）+ 吸附带（cs:19997-20000/20009-20011 两次判定）
      if (a < 0) a += 6.283;
      else if (a > 6.283) a -= 6.283;
      if (a > t - rate && a < t + rate) a = t;
    }
    this.visAngle = a;
  }

  private eocAI(game: GameHooks, player: Player | null) {
    const T = TILE;
    if (!player) return;
    // 类字段默认 ai0=-1120 是史莱姆族约定初值;原版 ai[0] 从 0 起步(NewNPC 清零)。
    // 缺此归一时 ai0∉{0,1,2,3} 状态机无分支匹配 → 夜晚整段 P1/P2 全空转 =
    // 眼悬停不动(F6 面板/自然刷怪两路都会触发)。同 bInit 复位族(kingSlime/queenBee)
    // 的入口级归一——2026-08-13 用户报"克眼呆在空中"
    if (this.ai0 < 0) this.ai0 = 0;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy) || 1;
    // Main.Difficulty / Main.expertMode（:19903 起；getGoodWorld 抬档同义）
    const diff = mainDifficulty(game.world);
    const expert = mainExpertMode(game.world);
    // Main.getGoodWorld（for the worthy 种子）——11 处抬档分支（:20037-20691）
    const ftw = !!game.world.seedFlags?.getGoodWorld;
    // flag2/flag3（:19906-19915，专家档专用）：hp<12% / hp<4%
    const flag2 = expert && this.hp < this.maxHp * 0.12;
    const flag3 = expert && this.hp < this.maxHp * 0.04;
    // num4（:19917-19921）：连冲冲程，狂暴档减半
    let num4 = 20;
    if (flag3) num4 = 10;

    // num7（:19927-19934）：脸向角 = atan2(player→NPC) + π/2 ≡ atan2(NPC→player) − π/2
    const face = Math.atan2(dy, dx) - Math.PI * 0.5;

    // ---- 旋转追踪速率表（:19939-19966）：默认 0；专家 ×1.5；狂暴归 0 锁脸 ----
    // 此前恒 0.02 起步 + 悬浮 40t 抬 0.05——与原版分档表不符（悬浮 40t 档属冲刺态）
    let rotRate = 0;
    if (this.ai0 === 0 && this.state === 0) rotRate = 0.02;
    if (this.ai0 === 0 && this.state === 2 && this.ai2 > 40) rotRate = 0.05;
    if (this.ai0 === 3 && this.state === 0) rotRate = 0.05;
    if (this.ai0 === 3 && this.state === 2 && this.ai2 > 40) rotRate = 0.08;
    if (this.ai0 === 3 && this.state === 4 && this.ai2 > num4) rotRate = 0.15;
    if (this.ai0 === 3 && this.state === 5) rotRate = 0.05;
    if (expert) rotRate *= 1.5;
    if (flag3 && expert) rotRate = 0;
    this.applyEocRotation(face, rotRate);

    // reflectsProjectiles 每 tick 复位（:20029）——变身段 getGoodWorld 下置 true
    // （:20258-20261）反弹玩家弹幕；出变身段后由本行自然清回
    this.reflectsProjectiles = false;

    // ---- 白天/玩家死亡：向上漂离 + EncourageDespawn(10)（:20020-20025） ----
    // 原版在旋转段之后 return：状态机与 ai[2] 全部冻结，复活后从冻结处继续
    if (game.world.clock.isDay || player.dead) {
      this.vy -= 0.04;
      this.encourageDespawn(10);
      this.x += this.vx; this.y += this.vy;
      if (dist > T * 120) this.dead = true;   // 漂远后兜底消失
      return;
    }

    if (this.ai0 === 0) {
      // ================= P1（ai[0]==0，:20026-20236） =================
      if (this.state === 0) {
        // ---- 悬浮伺服（:20030-20081）：5/0.04；专家 7/0.15；FTW +1/+0.05（:20037-20041） ----
        this.dashing = false;
        let num10 = 5, num11 = 0.04;
        if (expert) { num11 = 0.15; num10 = 7; }
        if (ftw) { num11 += 0.05; num10 += 1; }
        this.servoTo(player.cx, player.cy - 200, num10, num11);
        this.facing = dx > 0 ? 1 : -1;
        this.ai2 += 1;
        // num15（:20046-20047）= 到悬浮目标点(玩家中心−200y)的距离——仆从门专用
        const hoverDist = Math.hypot(player.cx - this.cx, player.cy - 200 - this.cy);
        // 悬浮计时 600t 出冲（:20083-20095；专家 ×0.35 = 210）
        let num16 = 600;
        if (expert) num16 *= 0.35;
        if (this.ai2 >= num16) {
          this.state = 1; this.ai2 = 0; this.chargesLeft = 0; this.servantT = 0;
        } else if ((this.y + this.h < player.y && hoverDist < 500) || (expert && hoverDist < 500)) {
          // 仆从累计（:20096-20111）：NPC 在玩家上方且 num15<500（专家仅距离门）——
          // num15 = 到【悬浮目标点】(玩家中心−200y)的距离（:20046-20047），非到玩家中心；
          // 110t（专家 ×0.4；FTW 再 ×0.8 = 35.2t）召一只，速度 5 / 专家 6
          if (!player.dead) this.servantT += 1;
          let num17 = 110;
          if (expert) num17 *= 0.4;
          if (ftw) num17 *= 0.8;                    // :20107-20110
          if (this.servantT >= num17) {
            this.servantT = 0;
            const num18 = expert ? 6 : 5;
            const s = Enemy.fromVanilla(5, this.cx + (dx / dist) * 10, this.cy + (dy / dist) * 10);
            if (s) {
              s.vx = (dx / dist) * num18;
              s.vy = (dy / dist) * num18;
              (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(s, 'enemies');
              // SoundID 3 = NPCHit（:20140，原版在仆从落点播，非召唤音）
              game.playSfxFiles(['NPC_Hit_1'], 1, this.cx, this.cy);
              game.spawnParticles(s.cx, s.cy, '#9A8FA0', 10, 2);
            }
          }
        }
      } else if (this.state === 1) {
        // ---- 冲刺预备（:20148-20169）：锁脸即发，速 6 / 专家 7 / FTW +1 ----
        this.visAngle = face;
        let num23 = expert ? 7 : 6;
        if (ftw) num23 += 1;                        // :20156-20159
        this.vx = (dx / dist) * num23;
        this.vy = (dy / dist) * num23;
        this.state = 2; this.ai2 = 0;
        this.dashing = true;
      } else if (this.state === 2) {
        // ---- 冲刺（:20170-20222）：40t 后 0.98 摩擦（专家再 ×0.985）；冲程 150 / 专家 100 ----
        this.dashing = true;
        if (this.ai2 % 2 === 0) {
          game.spawnParticles(this.cx, this.cy, '#D0D0D0', 2, 2);
        }
        this.ai2 += 1;
        if (this.ai2 >= 40) {
          this.vx *= 0.98; this.vy *= 0.98;
          if (expert) { this.vx *= 0.985; this.vy *= 0.985; }
          if (ftw) { this.vx *= 0.99; this.vy *= 0.99; }   // :20180-20183
          if (this.vx > -0.1 && this.vx < 0.1) this.vx = 0;
          if (this.vy > -0.1 && this.vy < 0.1) this.vy = 0;
        } else {
          // 冲刺前 40t 旋转锁移动方向（:20195）
          this.visAngle = Math.atan2(this.vy, this.vx) - Math.PI * 0.5;
        }
        let num27 = expert ? 100 : 150;
        if (ftw) num27 -= 15;                       // :20202-20205 冲程 −15
        if (this.ai2 >= num27) {
          this.chargesLeft += 1;
          this.ai2 = 0;
          this.visAngle = face;
          if (this.chargesLeft >= 3) {
            this.state = 0; this.chargesLeft = 0;   // 3 连结束回悬浮（:20212-20216）
          } else {
            this.state = 1;                          // 再冲
          }
        }
      } else {
        this.state = 0; this.ai2 = 0; this.chargesLeft = 0;
      }
      // 变身阈值（:20223-20235）：hp < 50%（专家 65%）→ 段一加速自旋（速度不清零，
      // 由变身段 0.98/t 阻尼自然收尾——原版语义）
      const num28 = expert ? 0.65 : 0.5;
      if (this.hp < this.maxHp * num28) {
        this.ai0 = 1; this.state = 0; this.ai2 = 0;
        this.chargesLeft = 0; this.servantT = 0;
        this.spinSpeed = 0;
        this.phase = 2;                 // 仓内 umbrella：变身起即二阶段（legacy 渲染消费）
        this.dashing = false;
      }
    } else if (this.ai0 === 1 || this.ai0 === 2) {
      // ================= 变身两段（ai[0]==1/2，:20238-20344） =================
      // 段一（ai0==1）加速：ai[2] +=0.005 钳 0.5；段二（ai0==2）减速：-0.005 钳 0。
      // getGoodWorld 再循环旗标 ai[3]==1（本仓 chargesLeft）走加速支（:20241-20250）
      this.dashing = false;
      // FTW 变身段反射玩家弹幕（:20258-20261）——每 tick 先在旋转段后复位
      if (ftw) this.reflectsProjectiles = true;
      if (this.ai0 === 1 || this.chargesLeft === 1) {
        this.spinSpeed = Math.min(0.5, this.spinSpeed + 0.005);
      } else {
        this.spinSpeed = Math.max(0, this.spinSpeed - 0.005);
      }
      this.visAngle += this.spinSpeed;
      this.ai2 += 1;                    // 原 ai[1]：段内计时
      // 专家自旋期每 num29t 甩一只仆从（:20262-20300）：随机向 ±200（FTW ×3）归一到速
      // 5、落点 +10；num29 = 20，FTW 且 hp<1/3 时 10（:20263-20266）
      const num29 = ftw && this.hp < this.maxHp / 3 ? 10 : 20;
      if (expert && this.ai2 % num29 === 0) {
        let rx = Math.random() * 400 - 200, ry = Math.random() * 400 - 200;
        if (ftw) { rx *= 3; ry *= 3; }   // :20273-20277 散布 ±600
        const rl = Math.hypot(rx, ry) || 1;
        const s = Enemy.fromVanilla(5, this.cx + (rx / rl) * 10, this.cy + (ry / rl) * 10);
        if (s) {
          s.vx = (rx / rl) * 5;
          s.vy = (ry / rl) * 5;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(s, 'enemies');
          game.spawnParticles(s.cx, s.cy, '#9A8FA0', 10, 2);
        }
      }
      if (this.ai2 >= 100) {
        if (this.chargesLeft === 1) {
          // 再自旋一轮满 100t（:20305-20310）：旗标与计时归零，留在段二减速收尾
          this.chargesLeft = 0;
          this.ai2 = 0;
        } else {
          this.ai0 += 1;
          this.ai2 = 0;
          if (this.ai0 === 3) {
            // 段二满 100t → P2（:20312-20315）：ai[2] 清零收住残余自旋
            this.spinSpeed = 0;
          } else {
            // 段一满 100t（:20316-20330）：NPCHit(3) + gore 8/7/6 ×2 + 尘 20 + Roar(15)
            game.playSfxFiles(['NPC_Hit_1'], 1, this.cx, this.cy);
            game.playSfx('roar');
            game.spawnParticles(this.cx, this.cy, '#8A1A1A', 12, 3);   // gore 8/7/6 ×2 份
            game.spawnParticles(this.cx, this.cy, '#FF3030', 20, 2.5); // 尘 20
          }
        }
      }
      // 速度 0.98/t 阻尼 + 小值清零（:20333-20343）
      this.vx *= 0.98; this.vy *= 0.98;
      if (this.vx > -0.1 && this.vx < 0.1) this.vx = 0;
      if (this.vy > -0.1 && this.vy < 0.1) this.vy = 0;
    } else if (this.ai0 === 3) {
      // ================= P2（ai[0]==3，:20346-20756） =================
      // ---- 伤害/防御每 tick 覆写（:20346-20362，猪鲨同款先例） ----
      // legacy 路径 def 是 ENEMY_DEFS 共享引用——覆写前先拷成实例私有（vanilla 路径
      // fromVanilla 已是拷贝，恒等判断最多拷一次）
      if (this.def === (ENEMY_DEFS[this.key] ?? PLACEHOLDER_DEF)) this.def = { ...this.def };
      this.def.defense = 0;
      let num38 = 18;
      if (expert) {
        if (flag2) this.def.defense = -15;                      // 专家 hp<12%
        if (flag3) { num38 = 20; this.def.defense = -30; }      // 专家 hp<4%
      }
      // GetAttackDamage_LerpBetweenFinalValues(23, num38)（:7026 = Remap Classic→Expert）
      // 再 CappedAtMaster（:7020）：经典 23 / 专家 36 / 大师 54
      this.def.damage = getAttackDamageCappedAtMaster(
        Math.trunc(remap(diff, GDL.CLASSIC, GDL.EXPERT, 23, num38)), diff);

      // 专家 hp<12% 起手即走"悬下方回冲"（:20363-20366；ai[2] 不清零为原版怪癖）
      if (this.state === 0 && flag2) this.state = 5;

      if (this.state === 0) {
        // ---- 悬浮（:20367-20430）：6/0.07；专家按 400/600/800px 距离爬坡 +1/+0.05；
        //      FTW +1/+0.1（:20390-20394） ----
        this.dashing = false;
        let num39 = 6, num40 = 0.07;
        if (dist > 400 && expert) {
          num39 += 1; num40 += 0.05;
          if (dist > 600) {
            num39 += 1; num40 += 0.05;
            if (dist > 800) { num39 += 1; num40 += 0.05; }
          }
        }
        if (ftw) { num39 += 1; num40 += 0.1; }
        this.servoTo(player.cx, player.cy - 120, num39, num40);
        this.facing = dx > 0 ? 1 : -1;
        this.ai2 += 1;
        if (this.ai2 >= 200) {
          this.state = 1; this.ai2 = 0; this.chargesLeft = 0;
          if (expert && this.hp < this.maxHp * 0.35) this.state = 3;   // :20436-20439 → 连冲
        }
        if (expert && flag3) {
          // :20443-20450 狂暴：直接转连冲，ai[3] −1000（计数远不达 5 → 持续连冲）
          this.state = 3; this.ai2 = 0; this.chargesLeft -= 1000;
        }
      } else if (this.state === 1) {
        // ---- 冲刺预备（:20452-20478）：ForceRoar(36) style0 = Roar_0 满响带坐标衰减；
        //      6.8（专家第 2/3 冲 ×1.15/×1.30；FTW ×1.2 :20465-20468） ----
        game.playSfx('roar', 1, this.cx, this.cy);
        this.visAngle = face;
        let num44 = 6.8;
        if (expert && this.chargesLeft === 1) num44 *= 1.15;
        if (expert && this.chargesLeft === 2) num44 *= 1.3;
        if (ftw) num44 *= 1.2;
        this.vx = (dx / dist) * num44;
        this.vy = (dy / dist) * num44;
        this.state = 2; this.ai2 = 0;
        this.dashing = true;
      } else if (this.state === 2) {
        // ---- 冲刺（:20479-20534）：50t(专家)后 0.97 摩擦(+专家 ×0.98)；冲程 130 / 专家 90 ----
        this.dashing = true;
        if (this.ai2 % 2 === 0) {
          game.spawnParticles(this.cx, this.cy, '#FF4040', 2, 2);
        }
        this.ai2 += 1;
        const num48 = expert ? 50 : 40;
        if (this.ai2 >= num48) {
          this.vx *= 0.97; this.vy *= 0.97;
          if (expert) { this.vx *= 0.98; this.vy *= 0.98; }
          if (this.vx > -0.1 && this.vx < 0.1) this.vx = 0;
          if (this.vy > -0.1 && this.vy < 0.1) this.vy = 0;
        } else {
          this.visAngle = Math.atan2(this.vy, this.vx) - Math.PI * 0.5;
        }
        const num49 = expert ? 90 : 130;
        if (this.ai2 >= num49) {
          this.chargesLeft += 1;
          this.ai2 = 0;
          this.visAngle = face;
          if (this.chargesLeft >= 3) {
            this.state = 0; this.chargesLeft = 0;   // 3 连结束回悬浮（:20518-20521）
            if (expert && this.hp < this.maxHp * 0.5) {
              // :20522-20526 专家 hp<50% → 预测连冲，起手计数 +Next(1,4)
              this.state = 3;
              this.chargesLeft += 1 + Math.floor(Math.random() * 3);
            }
          } else {
            this.state = 1;                          // 再冲
          }
        }
      } else if (this.state === 3) {
        // ---- 预测连冲预备（:20535-20644，专家专属态）：带玩家速度提前量直冲 ----
        if (this.chargesLeft === 4 && flag2 && this.cy > player.cy) {
          // :20537-20544 已连冲 4 次且漂到玩家下方 → 回悬浮（防无限连冲）
          this.state = 0; this.ai2 = 0; this.chargesLeft = 0;
          this.dashing = false;
        } else {
          let num50 = 20;                  // 冲速
          let num51 = dx, num52 = dy;      // 指向玩家
          // 提前量系数（:20552-20561）：|pvx|+|pvy|/4 再 +=10−self ≡ 恒 10（钳 5..15 原文照抄）
          let num53 = Math.abs(player.vx) + Math.abs(player.vy) / 4;
          num53 += 10 - num53;
          if (num53 < 5) num53 = 5;
          if (num53 > 15) num53 = 15;
          if (this.ai2 === -1 && !flag3) { num53 *= 4; num50 *= 1.3; }   // :20562-20566 悬下方回冲
          if (flag3) num53 *= 2;                                          // :20567-20570 狂暴双倍
          num51 -= player.vx * num53;
          num52 -= player.vy * num53 / 4;
          num51 *= 1 + (Math.random() * 21 - 10) * 0.01;                  // :20573-20574 ±10% 散布
          num52 *= 1 + (Math.random() * 21 - 10) * 0.01;
          if (flag3) {
            num51 *= 1 + (Math.random() * 21 - 10) * 0.01;
            num52 *= 1 + (Math.random() * 21 - 10) * 0.01;
          }
          const num54 = Math.hypot(num51, num52) || 1;
          const num55 = num54;
          this.vx = (num51 / num54) * num50;
          this.vy = (num52 / num54) * num50;
          this.vx += (Math.random() * 41 - 20) * 0.1;                     // :20585-20586 ±2 抖动
          this.vy += (Math.random() * 41 - 20) * 0.1;
          if (flag3) {
            // 狂暴（:20587-20607）：再抖 ±5 → 十字翻折（|v| 分量互换带侧向符号）→ 归一 ×num50
            this.vx += (Math.random() * 101 - 50) * 0.1;
            this.vy += (Math.random() * 101 - 50) * 0.1;
            let num56 = Math.abs(this.vx), num57 = Math.abs(this.vy);
            if (this.cx > player.cx) num57 *= -1;
            if (this.cy > player.cy) num56 *= -1;
            this.vx = num57 + this.vx;
            this.vy = num56 + this.vy;
            const vl = Math.hypot(this.vx, this.vy) || 1;
            this.vx = (this.vx / vl) * num50;
            this.vy = (this.vy / vl) * num50;
            this.vx += (Math.random() * 41 - 20) * 0.1;
            this.vy += (Math.random() * 41 - 20) * 0.1;
          } else if (num55 < 100) {
            // 近距（:20608-20625）：水平冲 → 垂直翻折（v 分量互换带侧向符号）
            if (Math.abs(this.vx) > Math.abs(this.vy)) {
              let num58 = Math.abs(this.vx), num59 = Math.abs(this.vy);
              if (this.cx > player.cx) num59 *= -1;
              if (this.cy > player.cy) num58 *= -1;
              this.vx = num59;
              this.vy = num58;
            }
          } else if (Math.abs(this.vx) > Math.abs(this.vy)) {
            // 远距水平（:20626-20640）：斜 45° 折冲
            let num60 = (Math.abs(this.vx) + Math.abs(this.vy)) / 2;
            let num61 = num60;
            if (this.cx > player.cx) num61 *= -1;
            if (this.cy > player.cy) num60 *= -1;
            this.vx = num61;
            this.vy = num60;
          }
          this.state = 4;
          this.dashing = true;
        }
      } else if (this.state === 4) {
        // ---- 连冲（:20645-20698）：冲程 num4（20 / 狂暴 10），+13t 摩擦尾，5 连后回悬浮 ----
        // SoundID 36 ForceRoar style-1（:20647-20650/:1312-1325）= Roar_0 满响 + pitch0.6
        // （升调吼——playWavFile 第 5 参直传 2^0.6;曾 0.7 音量+无变调,2026-08-18 对账修）
        if (this.ai2 === 0) game.playSfxWav?.('Roar_0', 1, this.cx, this.cy, 0.6);
        this.dashing = true;
        if (this.ai2 % 2 === 0) {
          game.spawnParticles(this.cx, this.cy, '#FF4040', 2, 2);
        }
        const num62 = num4;
        this.ai2 += 1;
        if (this.ai2 === num62 && Math.hypot(this.x - player.x, this.y - player.y) < 200) {
          this.ai2 -= 1;   // :20653-20656 贴脸 <200px 原地延时一格
        }
        if (this.ai2 >= num62) {
          this.vx *= 0.95; this.vy *= 0.95;
          if (this.vx > -0.1 && this.vx < 0.1) this.vx = 0;
          if (this.vy > -0.1 && this.vy < 0.1) this.vy = 0;
        } else {
          this.visAngle = Math.atan2(this.vy, this.vx) - Math.PI * 0.5;
        }
        const num63 = num62 + 13;
        if (this.ai2 >= num63) {
          this.chargesLeft += 1;
          this.ai2 = 0;
          if (this.chargesLeft >= 5) {
            // 5 连结束（:20679-20682）回悬浮；FTW 且与玩家有视线 → Roar 后重启
            // 变身段二自旋（:20683-20691：ai[0]=2 / ai[1]=0 / ai[2]=0 / ai[3]=1，
            // 再循环旗标落在本仓 chargesLeft，变身段加速支复跑一轮）。CanHit 玩家
            // 矩形传 boss 自身 w/h（原版即如此，:20686）
            if (ftw && canHit(game.world.store, this.x, this.y, this.w, this.h,
              player.x, player.y, this.w, this.h)) {
              game.playSfx('roar');
              this.ai0 = 2; this.state = 0; this.ai2 = 0;
              this.spinSpeed = 0; this.chargesLeft = 1;
            } else {
              this.state = 0; this.chargesLeft = 0;
            }
            this.dashing = false;
          } else {
            this.state = 3;                          // 继续连冲
          }
        }
      } else if (this.state === 5) {
        // ---- 悬玩家下方 600px（:20699-20752，专家 hp<12% 狂暴态）：9/0.3 快伺服 ----
        this.dashing = false;
        this.servoTo(player.cx, player.cy + 600, 9, 0.3);
        this.facing = dx > 0 ? 1 : -1;
        this.ai2 += 1;
        if (this.ai2 >= 70) {
          this.state = 3;
          this.ai2 = -1;                                        // → 连冲预备走 ×4 提前量支（:20562）
          this.chargesLeft = Math.floor(Math.random() * 4) - 3;  // Next(-3,1) ∈ [-3,0]
        }
      } else {
        this.state = 0; this.ai2 = 0; this.chargesLeft = 0;
      }
      // 狂暴档不允许停留悬下方态（:20753-20755）
      if (flag3 && this.state === 5) this.state = 3;
    }

    // 移动：EoC 全程 noTileCollide——AI 内自积分（:5717 的 noTileCollide 分支属
    // flyAI,非通用物理;此处是唯一积分点,曾误删致 EoC 定格）+ 世界边界钳制
    this.x += this.vx; this.y += this.vy;
    this.onGround = false; this.hitWall = false; this.hitHead = false;
    const maxX = game.world.w * T - this.w, maxY = game.world.h * T - this.h;
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  /** AI_094 星璇四塔（NPC.cs:41029-41443，1:1）。塔 = NPC（非 tile entity）。
   *  原版 dontTakeDamage（盾>0 完全免伤，:41162-41176 每 tick 重算）用 iframes=2 每 tick
   *  刷新近似（同 bossAI 克脑一阶段先例）。血尽先由 hurt() 转 ai2=1 死亡演出（checkDead
   *  :78867-78875），180t 渐隐后走标准死亡管线（碎片掉落/塔灭公告）。
   *  分塔支线（493 星尘标记/422 星旋传送门/517 日耀耀斑）按文档简化许可折叠为
   *  "直接在标记点 spawnNPC"（540/578/579 传送门演出二期补） */
  private towerAI(game: GameHooks, player: Player | null) {
    const w = game.world;
    const key = TOWER_KEY[this.vanillaId ?? -1];
    if (!key || this.dead) return;   // 真死后不再跑（防死亡管线重复触发）
    const le = w.lunarEvent;
    const st = w.store;
    const count = (id: number): number => {
      let n = 0;
      for (const o of game.enemies() as Enemy[]) {
        if (!o.dead && o.vanillaId === id) n++;
      }
      return n;
    };
    const distTo = (px: number, py: number) => Math.hypot(px - this.cx, py - this.cy);

    // ---- 1. 死亡演出（ai2==1，:41031-41128）----
    if (this.ai2 === 1) {
      // velocity = UnitY * velocity.Length()（:41033）：保留速率只留 +Y 分量，±0.25 钳（步进 0.02）
      const spd = Math.hypot(this.vx, this.vy);
      this.vx = 0;
      this.vy = spd;
      if (this.vy < 0.25) this.vy += 0.02;
      if (this.vy > 0.25) this.vy -= 0.02;
      this.iframes = 2;                                  // dontTakeDamage = true（:41042）
      this.ai1++;
      if (this.ai1 > 120) {
        // Opacity = 1-(ai1-120)/60（:41046）→ 本仓 spawnAlpha（0..255，越大越透明）
        const opacity = Math.max(0, 1 - (this.ai1 - 120) / 60);
        this.spawnAlpha = Math.round((1 - opacity) * 255);
      }
      // 分塔爆散尘（:41048-41117：三组粒子 + 241 白尘；此处按塔色近似两组）
      const dustCol = this.vanillaId === 517 ? '#FFB060' : this.vanillaId === 422 ? '#8CE8C8'
        : this.vanillaId === 507 ? '#E070E0' : '#7CB8FF';
      if (Math.random() < 0.2 && this.ai1 < 120) {
        game.spawnParticles(this.cx + (Math.random() - 0.5) * this.w, this.cy, dustCol, 3, 1.2,
          { life: 40, grav: -0.02 });
      }
      if (Math.random() < 0.2 && this.ai1 < 150) {
        game.spawnParticles(this.cx, this.y - 20, dustCol, 6, 2.4, { life: 40, grav: -0.05 });
        game.spawnParticles(this.cx, this.cy, '#F0F0F0', 1, 0.8, { life: 30, grav: 0.02 });
      }
      // 每 60t 音效（:41118-41121 SoundID 4/22 双音——NPC_Killed_1 + Unlock，roar 近似销核）
      if (this.ai1 % 60 === 1) {
        game.playSfxFiles(['NPC_Killed_1'], 1, this.cx, this.cy);
        game.playSfxFile?.('Unlock', 1, this.cx, this.cy);
      }
      this.x += this.vx;
      this.y += this.vy;
      if (this.ai1 >= 180) {
        // life=0 + HitEffect + checkDead（:41122-41127）→ 真死（碎片 3456-3459 + 塔灭公告）
        this.iframes = 0;
        this.hurt(1e9, 0, 0, game);
      }
      return;
    }

    // ---- 2. 受击闪光 ai3>0（:41130-41161；ai3 由扣盾置 1，>120 归零）----
    if (this.ai3 > 0) {
      if (this.ai3 === 1) game.playSfxFiles(['NPC_Killed_3'], 1, this.cx, this.cy); // :41152-41155
      this.ai3++;
      if (this.ai3 > 120) this.ai3 = 0;
    }
    // ---- 3. 盾判定（:41162-41176）：dontTakeDamage = 本塔 ShieldStrength>0（每帧重算）----
    // （盾破瞬间的 NPCDeath58 音效由 Game.onEnemyKilled 扣盾归零处播放——等价 :41148-41151）
    if (le.shield[key] > 0) this.iframes = 2;

    // ---- 4. 远离自愈（:41177-41191）----
    if (player && distTo(player.cx, player.cy) > 2000) this.lai0++;
    if (this.lai0 >= 60) {
      this.lai0 = 0;
      this.hp = Math.max(0, Math.min(this.maxHp, this.hp + 200));
    } else {
      this.lai0 = 0;   // 原版 else 每 tick 清零（:41188-41191）——自愈实际不可达，照抄不"修"
    }

    // ---- 5. 悬停（:41192）+ 贴地（:41193-41214）----
    this.vx = 0;
    this.vy = Math.sin(Math.PI * 2 * (this.ai0 / 300)) * 0.5;
    const ox = Math.floor(this.cx / TILE);
    const oy = Math.floor((this.y + this.h) / TILE);
    const solidDown = (maxDist: number): number => {
      for (let d = 0; d <= maxDist; d++) {
        const yy = oy + d;
        if (!st.inBounds(ox, yy)) return -1;
        if (st.isSolid(ox, yy)) return yy;
      }
      return -1;
    };
    const near = solidDown(10);
    if (near >= 0) {
      // 近（≤10 格）：按距离比下沉 1.5×（:41200-41204，塔底压向地面）
      this.y -= 1.5 * (1 - Math.abs(oy - near) / 10);
    } else if (solidDown(20) < 0) {
      // 远（>20 格）：上浮 1.5×，20-30 格间线性插值（:41205-41213）
      let f = 1;
      const far = solidDown(30);
      if (far >= 0) f = Math.max(0, Math.min(1, (Math.abs(oy - far) - 20) / 10));
      this.y += 1.5 * f;
    }

    // ---- 6. 世界边界钳制（:41215-41238；60 格边距 + 80px 内推）----
    // 原版 Y 上限也取 maxTilesX*16（:41215-41216 的 num1489 怪癖）——照抄
    const limX = w.w * TILE;
    const limY = w.w * TILE;
    const m = 60 * TILE;
    if (this.cx < m) this.x = m + 80 - this.w / 2;
    if (this.cx > limX - m) this.x = limX - m - 80 - this.w / 2;
    if (this.cy < m) this.y = m + 80 - this.h / 2;
    if (this.cy > limY - m) this.y = limY - m - 80 - this.h / 2;
    // 普通世界塔底 ≤ worldSurface*16-100（:41247-41250）
    if (this.y + this.h > w.groundLevel * TILE - 100) {
      this.y = w.groundLevel * TILE - this.h - 100;
    }

    this.ai0++;
    if (this.ai0 >= 300) this.ai0 = 0;   // :41251-41256

    // ---- 7. 分塔支线 ----
    if (this.vanillaId === 493) {
      // 星尘（:41257-41286）：环境尘略；SpawnStardustMark_StardustTower（:44142-44228）
      if (this.ai1 > 0) this.ai1--;
      if (this.ai1 <= 0 && player && !player.dead
        && distTo(player.cx, player.cy) < 1080 && player.y - this.y < 400) {
        const pool: number[] = [];
        if (count(405) + count(406) < 2) pool.push(405);
        if (count(402) < 2) pool.push(402);
        if (count(407) < 1) pool.push(407);
        if (pool.length > 0) {
          const pick = pool[(Math.random() * pool.length) | 0];
          this.ai1 = 30 * (5 + ((Math.random() * 11) | 0));   // 30*Next(5,16)
          // 投射物 540 星尘标记 → 末端生成该 NPC：折叠为塔顶随机点直接 spawn（无飞行演出）。
          // （真 540 链已落地 StardustMarkProj.spawnStardustMarks——蠕虫 402 侧已接，
          //  塔侧差异仅根锚点 Top−120 与 402 池 <2，二期迁移时可直换）
          const mark = spawnPart(game, this, pick);
          if (mark) {
            mark.x = this.cx + (Math.random() - 0.5) * 160 - mark.w / 2;
            mark.y = this.y - 120 - mark.h / 2;
          }
        } else {
          this.ai1 = 30;   // :44225-44227
        }
      }
    } else if (this.vanillaId === 422) {
      // 星旋（:41310-41407）：玩家头顶传送门 + 空中随机点传送门
      if (this.ai1 > 0) this.ai1--;
      // 支线 a（:41336-41361）：3240px 内（原版还要求 !CanHitLine 视线阻隔——未接，省略）→
      // 玩家头顶门；n428+n427+n426<14 → 579 门（90t 后生 2× Alien Hornet 427）否则 578 门（只放电）
      if (this.ai1 <= 0 && player && !player.dead && distTo(player.cx, player.cy) < 3240) {
        this.ai1 = 60 + ((Math.random() * 120) | 0);
        if (count(428) + count(427) + count(426) < 14) {
          const ptx = Math.floor(player.cx / TILE);
          let py = Math.floor(player.y / TILE);
          for (let i = 0; i < 10; i++) {
            if (!st.inBounds(ptx, py) || st.isSolid(ptx, py) || py <= 10) break;
            py--;
          }
          for (let i = 0; i < 2; i++) {
            const hornet = spawnPart(game, this, 427);
            if (!hornet) continue;
            hornet.x = ptx * TILE + 8 - hornet.w / 2;
            hornet.y = py * TILE + 24 - hornet.h;
            const a = Math.random() * Math.PI * 2;
            const sp = 4 + Math.random() * 5;               // Next(4,9)
            hornet.vx = Math.cos(a) * sp;
            hornet.vy = Math.sin(a) * sp - 2;               // - Vector2.UnitY*2
          }
        }
      }
      // 支线 b（:41362-41406）：1080px 内且低于塔顶 400px、n427+n426*3+n428<20 →
      // 玩家 ±20 格随机空中点 579 门（2× 427）
      if (this.ai1 <= 0 && player && !player.dead
        && distTo(player.cx, player.cy) < 1080 && player.y - this.y < 400
        && count(427) + count(426) * 3 + count(428) < 20) {
        this.ai1 = 420 + ((Math.random() * 360) | 0);
        const ptx = Math.floor(player.cx / TILE);
        const pty = Math.floor(player.cy / TILE);
        const ttx = Math.floor(this.cx / TILE);
        const tty = Math.floor(this.cy / TILE);
        for (let attempt = 0; attempt < 100; attempt++) {
          const mx = ptx - 20 + ((Math.random() * 41) | 0);
          const my = pty - 20 + ((Math.random() * 41) | 0);
          if (Math.abs(my - pty) <= 8 && Math.abs(mx - ptx) <= 8) continue;   // :41383 玩家 8 格禁圈
          if (Math.abs(my - tty) <= 3 && Math.abs(mx - ttx) <= 3) continue;   // :41383 塔 3 格禁圈
          if (!st.inBounds(mx, my) || st.isSolid(mx, my)) continue;
          for (let i = 0; i < 2; i++) {
            const hornet = spawnPart(game, this, 427);
            if (!hornet) continue;
            hornet.x = mx * TILE + 8 - hornet.w / 2;
            hornet.y = my * TILE + 8 - hornet.h / 2;
            const a = Math.random() * Math.PI * 2;
            const sp = 4 + Math.random() * 5;
            hornet.vx = Math.cos(a) * sp;
            hornet.vy = Math.sin(a) * sp - 2;
          }
          break;
        }
      }
    } else if (this.vanillaId === 517) {
      // 日耀（:41431-41443）：1080px 内且低于塔顶 700px → 塔顶直投 519（斜抛 7-12px/t）
      if (this.ai1 > 0) this.ai1--;
      if (this.ai1 <= 0 && player && !player.dead
        && distTo(player.cx, player.cy) < 1080 && player.y - this.y < 700) {
        const flare = spawnPart(game, this, 519);
        if (flare) {
          flare.x = this.x - this.w * 0.33 + Math.random() * this.w * 0.66 - flare.w / 2;
          flare.y = this.y - 20;
          const theta = (Math.random() * 2 - 1) * 0.7853981852531433;   // RotatedByRandom(0.785)
          const sp = 7 + Math.random() * 5;
          flare.vx = Math.sin(theta) * sp;      // -UnitY 旋转 θ：(sinθ, -cosθ)
          flare.vy = -Math.cos(theta) * sp;
        }
        this.ai1 = 60;
      }
    }
    // 507 星云仅环境粒子（:41287-41309），怪全靠 Zone 刷怪表——略

    // noTileCollide + noGravity：直接位移（原版速度由引擎积分）
    this.x += this.vx;
    this.y += this.vy;
    this.onGround = false;
  }

  /** 受击。返回是否死亡 */
  hurt(dmg: number, kbx: number, kby: number, game: GameHooks, armorPen = 0, crit = false, pierce = 0, fromPlayer = false, penPercent = 0): boolean {
    // pierce 语义（Projectile.cs:11903-11907/13152-13155 Damage_PVE）：
    //   0   = 近战/荆棘等非弹幕 → 命中设免疫 10t（原版 immune[owner] 默认档）；
    //   1   = 单发弹（maxPenetrate==1，flag3）→ **无视免疫且命中后不设帧**
    //         ——同 tick 多发（霰弹/多随从）全部生效,不再互挡（旧全局 iframes=8
    //         致 8 发四管霰弹只吃 1 发,DPS≈1/8,2026-08-13 修）；
    //   >1  = 穿透弹 → 设 10t;同弹重复命中由弹侧 hitSet 拦（原版 per-owner 槽单人
    //         近似;弹型覆写 1-8 表 :13032 未接,登记）
    // Critter 兼容：critters 桶的调用方按 Critter.hurt(game) 单参调用；
    // 原版小动物是 Enemy 进该桶，这里把 Game 对象重映射回 game 参、伤害取固定 5
    if (typeof dmg === 'object' && dmg !== null) {
      game = dmg as unknown as GameHooks;
      dmg = 5; kbx = 0; kby = 0;
    }
    const rawDmg = dmg; // 傀儡上报用原始值（下方 def 凘认算只做一次，双端一致）
    // 死亡单次门(用户报"多弹头武器打出双份僵尸碎块"):pierce=1 豁免免疫帧后,
    // 同 tick 多弹头(霰弹/食人鱼咬+随从)会全部进 hurt——首发致死后,后续弹头
    // 对"已死未出列"的敌怪二次触发死亡管线(碎块/掉落/音效翻倍)。原版由
    // Damage_PVE 的 npc.active 前置门(Projectile.cs:11869)天然防重;此处等价。
    if (this.dead) return false;
    if (pierce !== 1 && this.iframes > 0) return false; // 单发弹豁免免疫检查（flag3）
    // 旗 buff 加伤（Main.GetBannerBuffEffect → StrikeNPC 乘区,ItemID.cs:11-44 普通族:
    // 经典 ×1.5/专家 ×2;DD2 0.2 族不区分,登记）——统一入口=StrikeNPC 全通道语义
    if (this.vanillaId != null && (game as { bannerNpcActive?: (n: number) => boolean }).bannerNpcActive?.(this.vanillaId)) {
      const g = game as { world?: { flags?: Record<string, boolean> } };
      dmg = Math.max(1, Math.round(dmg * (g.world?.flags?.hardMode ? 2 : 1.5)));
    }
    if (this.dontTakeDamage) return false; // 原版 NPC.dontTakeDamage（StrikeNPC 早退）
    this.justHitT = 2; // 原版 justHit 单帧旗标（AI_023 飞行武器/陆龟受击回态消费）
    // 训练假人（NPC 488，cs:83498 localAI 赋值）：immortal 永不死，
    // 受击只记摇晃强度+方向（渲染帧端消费），掉血由 dummyAI 回满
    if (this.vanillaId === 488) {
      this.dummyShake = Math.max(20, Math.min(120, dmg));
      this.dummyHitDir = Math.sign(kbx) || this.dummyHitDir;
      this.iframes = 8;
      return true;
    }
    // 猪鲨爆裂泡泡（NPC 371，StrikeNPC cs:82102-82107）：伤害清零(num=0)不扣血，
    // 直接转入爆炸态 ai[0]=1/ai[1]=4 + dontTakeDamage——"被击即爆"而非"被打死"；
    // aiStyle 70 (:35180-35194) 据此扩 100×100 并 EncourageDespawn(3) 消散
    if (this.vanillaId === 371) {
      this.ai0 = 1; this.ai1 = 4;
      this.iframes = 8; // dontTakeDamage（爆炸 4t 内不可再受击）
      return true;
    }
    // 原版结算序（Projectile.cs:12796-12808 + Main.cs:65626-65635）：
    //   弹幕侧最终伤 num12 先 += checkArmorPenetration（穿甲加成【加进伤害】，
    //   单池：弹幕/玩家 armorPen（Arrow.settlePen 即此参）+ ichor15 + brokenArmor20
    //   + betsysCurse40 + (int)(def×pct)——NPC.cs:81913-81938，池>def 钳 def/2、
    //   池≤0 或 def≤0 早退 0）→ 再入 StrikeNPC 的 CalculateDamageNPCsTake：
    //   max(1, dmg + pen − def×0.5)。pen/2 上限=def/2 ⇒ 穿甲永不把伤害推过全额
    //   （旧自造"def 钳 2×dmg"删除，下限 1 由本式承担）；负防御 def≤0 不吃穿甲
    //   但 −def×0.5 为增伤（原版直算式,2026-08-13 对齐保留）。
    //   已知偏差登记：crit ×2 原版在防后（StrikeNPC :81990），仓内调用侧预倍——
    //   crit 会连带翻倍 pen/防（Game.ts 挥击侧,并行会话领走未动）
    const def = this.def.defense ?? 0;
    const penAdd = npcCheckArmorPenetration(def, armorPen, penPercent, {
      ichor: this.ichorT > 0, brokenArmor: this.brokenArmorT > 0, betsysCurse: this.betsysCurseT > 0,
    });
    dmg = Math.max(1, Math.round(dmg + penAdd - def * 0.5));
    // takenDamageMultiplier（NPC.StrikeNPC cs:81997-82000）：防御结算后 >1 时 ×N
    // （419 旋刃怪冲刺中 ×3，cs:57172）
    if (this.takenDamageMultiplier > 1) dmg = Math.max(1, Math.round(dmg * this.takenDamageMultiplier));
    // realLife 共享生命（StrikeNPC :82132-82137）：伤害扣主段,本段 hp/maxHp 镜像
    // ——毁灭者族打任意节都扣头 80000 总血,节不可单独打死
    if (this.realLifeHost && !this.realLifeHost.dead) {
      this.realLifeHost.hp -= dmg;
      this.hp = this.realLifeHost.hp;
      this.maxHp = this.realLifeHost.maxHp;
    } else {
      this.hp -= dmg;
    }
    // DPS 计累计(Projectile.cs:12817-12818/Player.cs:20165-20168 两调用点均
    // accDreamCatcher 门禁+fromPlayer 标记;全仓伤害漏斗单点收口)
    if (fromPlayer) {
      const pl = game.player as Player | null;
      pl?.addDPS(dmg);
      this.playerInteracted = true;  // AnyInteractions（playerInteraction 位）——雕像门 :79651
    }
    // 毁灭者身段受击出探针（HitEffect :90265-90281：135 身段存活受击时,ai[2]==0
    // （本段未出过探针）掷 1/25（Mechdusa 合体态 1/50）→ 置 ai[2]=1 并于段底中心
    // 生成探针 139——每身段至多一只）
    if (this.vanillaId === 135 && this.hp > 0 && this.ai2 === 0) {
      const max = mechQueenUp() ? 50 : 25;
      if (Math.floor(Math.random() * max) === 0) {
        this.ai2 = 1;
        const probe = Enemy.fromVanilla(139, this.cx, this.y + this.h);
        if (probe) addEnemy(game, probe);
      }
    }
    this.iframes = pierce === 1 ? 0 : 10; // 通用档 10t（:13152 默认;单发弹不设帧 flag3;旧恒 8）
    this.hpBarT = 240; // 受击后血条持续显示 4 秒
    // 击退管线（NPC.cs:82144-82239 1:1）。武器路径（kby===0，kbx=方向×力度）：
    //   num3 = kb×resist（:82145 ★resist 先乘、五段软封顶作用在乘后值——旧实现
    //   封顶算在裸 kb 上再乘 resist，顺序反）→ onFire2（诅咒焰 buff39，cursedT 代）
    //   ×1.1（:82148）→ 五段封顶 8/10/12/14/16（:82152-82175）→ crit×1.4（:82181）
    //   → num8 = (int)防后最终伤 ×10（专家 ×15，:82183-82187）
    //   num8>lifeMax = 轻路（大伤害打小怪，:82188-82226）：X 减法收敛（同向不足
    //   才推、同号余速 ×2 步、钳 ±num3，:82189-82206）→ 小丑 185 num3×1.5
    //   （:82209-82212，★仅轻路——旧实现放在共享段）→ num3 翻负（noGravity
    //   ×-0.5 / 有重力 ×-0.75，:82217）→ Y 加法钳（vy>num3 才 += 并钳下限，
    //   :82220-82225——下落/静止中挨打才起跳，上升中不追加）
    //   否则重路（:82227-82237）：直接赋值 vy=-num3×(0.75|0.5)×resist、
    //   vx=num3×dir×resist（★resist 二次乘=原版如此,num3 已含一次）
    // kby!==0 = 爆炸/光环等非武器冲量 → 加法冲量（原版同走 StrikeNPC 管线，
    //   仓内双参冲量约定，登记）
    const resist = this.kbResistOverride ?? this.def.knockbackResist;
    // :82217/:82228 读【运行时】noGravity（AI_017 秃鹫飞行态/AI_087 空中态/AI_091
    // 浮游态按态置位）——def.flying 仅静态兜底（数据 noGravity + aiStyle 2/5/14/23/44）
    const kbFlying = this.noGravity || this.def.flying;
    if (kby !== 0) {
      if (resist > 0) { this.vx += kbx * resist; this.vy += kby * resist; }
    } else if (Math.abs(kbx) > 0 && resist > 0) {   // :82144 knockBack>0 && resist>0 双门
      const hitDir = Math.sign(kbx) || 1;
      let num3 = Math.abs(kbx) * resist;            // :82145 kb×resist
      if (this.cursedT > 0) num3 *= 1.1;            // :82148 onFire2=诅咒焰（buff 39）
      if (num3 > 8) num3 = 8 + (num3 - 8) * 0.9;    // :82152-82156 五段软封顶
      if (num3 > 10) num3 = 10 + (num3 - 10) * 0.8; // :82157-82161
      if (num3 > 12) num3 = 12 + (num3 - 12) * 0.7; // :82162-82166
      if (num3 > 14) num3 = 14 + (num3 - 14) * 0.6; // :82167-82171
      if (num3 > 16) num3 = 16;                     // :82172-82175
      if (crit) num3 *= 1.4;                        // :82179-82182
      const num8 = Math.trunc(dmg) * (mainExpertMode(game.world) ? 15 : 10); // :82183-82187
      if (num8 > this.maxHp) {                      // 轻路 :82188
        if (hitDir < 0 && this.vx > -num3) {        // :82189-82197 X 减法收敛
          if (this.vx > 0) this.vx -= num3;
          this.vx -= num3;
          if (this.vx < -num3) this.vx = -num3;
        } else if (hitDir > 0 && this.vx < num3) {  // :82198-82206
          if (this.vx < 0) this.vx += num3;
          this.vx += num3;
          if (this.vx > num3) this.vx = num3;
        }
        if (this.vanillaId === 185) num3 *= 1.5;    // :82209-82212 小丑特例
        num3 = kbFlying ? num3 * -0.5 : num3 * -0.75; // :82217 noGravity 运行时档
        if (this.vy > num3) {                       // :82220-82225 Y 加法钳
          this.vy += num3;
          if (this.vy < num3) this.vy = num3;
        }
      } else {                                      // 重路 :82227-82237
        this.vy = -num3 * (kbFlying ? 0.5 : 0.75) * resist; // :82228-82233
        this.vx = num3 * hitDir * resist;           // :82235 resist 二次乘
      }
    }
    // 法师族受击打断（StrikeNPC cs:82061-82088：aiStyle 8 受击即跳 ai[0]——已过全部
    // 蓄力点(100/200/300)、650 传送前不再发射 = "攻击中挨一下就取消本轮齐射"）：
    // 172→450 / 283·284 掷 1/2→390 / 533 掷 2/3→181 / 其余（24/29/32/45/281-286）→400
    // （693 的 localAI[1]/[2] 受击段 :82083-82087 未接，登记）
    if (this.vanilla?.aiStyle === 8) {
      if (this.vanillaId === 172) this.ai0 = 450;
      else if (this.vanillaId === 283 || this.vanillaId === 284) {
        if (Math.random() < 0.5) this.ai0 = 390;
      } else if (this.vanillaId === 533) {
        if (Math.random() < 2 / 3) this.ai0 = 181;
      } else this.ai0 = 400;
    }
    // 联机傀儡受击：上报房主权威结算（本地视觉反馈已生效：扣血/飘字/击退）
    if (this.netPuppet) entityNet.reportStrike?.(this.netId, rawDmg, kbx, kby);
    if (this.hp <= 0) {
      // 月总族(396/397/398)血尽不直死:原版 checkDead(:78841-78867)转为闭眼残肢/死亡演出,
      // 转换逻辑在各自 AI 首行(hp<=0 → ai0 置态+满血续命),此处放行让 AI 下一 tick 接管
      if (this.vanillaId === 396 || this.vanillaId === 397 || this.vanillaId === 398) return false;
      // 石巨人族(245/246/247/248):血尽转换在各 AI 首行(本体死亡演出/头转自由态),同样放行
      if (this.vanillaId === 245 || this.vanillaId === 246 || this.vanillaId === 247 || this.vanillaId === 248) return false;
      // 星璇四塔(517/422/507/493)：checkDead（NPC.cs:78867-78875）血尽转 ai2=1 死亡演出
      // （ai1=0、满血续命 + dontTakeDamage），180t 上升渐隐后由 towerAI 走标准死亡管线（掉碎片）
      if (this.vanillaId != null && this.vanillaId in TOWER_KEY && this.ai2 !== 1) {
        this.ai2 = 1; this.ai1 = 0; this.hp = this.maxHp; this.iframes = 2;
        return false;
      }
      this.dead = true;
      // 瓢虫被杀 → 坏运（NPC.checkDead cs:78838-78840 → LadyBugKilled :82332）：
      // 604 普通 / 605 金瓢虫（距离衰减公式见 LuckState.ladyBugKilled）；
      // 副产物 ladyBugRainBoost +1800 钳 18000（cs:82334-82338，雨调度提前开雨）
      if (this.vanillaId === 604 || this.vanillaId === 605) {
        const pl = (game as unknown as { player?: Player }).player;
        if (pl && !pl.dead) {
          pl.luckState?.ladyBugKilled(Math.hypot(this.cx - pl.cx, this.cy - pl.cy), this.vanillaId === 605);
        }
        const w = game.world.weather;
        w.ladyBugRainBoost = Math.min(18000, w.ladyBugRainBoost + 1800);
      }
      // 风气球 594 爆裂：解冻挂载史莱姆（原版 HitEffect :82586-82594 slave ai[0]=0 + 上移 10）
      if (this.vanillaId === 594) {
        const slave = (game.enemies() as Enemy[]).find((n) => n.id === this.ai3 && n.ai0 === -999);
        if (slave) { slave.ai0 = 0; slave.y -= 10; }
      }
      // 饥饿者 115 死亡 → 饿魂 116（NPC.HitEffect :88333-88335：type==115 且 life<=0 →
      // NewNPC(底部中心, 116)——aiStyle 2 飘浮眼独立追击，80hp/防6，不锚定墙）。
      // 联机傀儡跳过（分裂权威在房主，同母史莱姆门）
      if (this.vanillaId === 115 && !this.netPuppet) {
        const h2 = Enemy.fromVanilla(116, this.cx, this.y + this.h);
        if (h2) {
          h2.x = this.cx - h2.w / 2;   // NewNPC Bottom 锚点（NPC.cs:81547）
          (game as unknown as { entities?: { add?: (en: unknown, b: string) => void } })
            .entities?.add?.(h2, 'enemies');
        }
      }
      // 母史莱姆死亡分裂（Wiki 权威：1-3 只 Baby Slime，netID -5 = 半透明灰黑小史莱姆；
      // SetDefaultsFromNetId -5：base 1 × scale 0.9 + color(0,0,0,50) + alpha 120，hp30/dmg13/def4）。
      // 联机傀儡跳过：分裂权威在房主（其真身分裂后经 msg23 快照下发，本地生成会留幽灵实体）
      if (this.vanillaId === 16 && !this.netPuppet) {
        const n = 1 + Math.floor(Math.random() * 3);
        const add = (game as unknown as { entities?: { add: (en: unknown, bucket: string) => void; nextId?: number } }).entities;
        for (let k = 0; k < n; k++) {
          const b = Enemy.fromVanilla(1, this.cx + (Math.random() - 0.5) * 28, this.cy - 6);
          if (!b) continue;
          b.vanillaNetId = -5;
          b.vanillaScale = 0.9;
          b.colorRGBA = [0, 0, 0, 50];
          b.spawnAlpha = 120;
          b.hp = b.maxHp = 30;
          b.def.damage = 13;
          b.def.defense = 4;
          b.vx = (Math.random() - 0.5) * 4;
          b.vy = -3 - Math.random() * 2;
          add?.add(b, 'enemies');
        }
      }
      // 蠕虫任一段死亡 → 整链同死（原版 realLife 共享生命，L18152-18156）
      // 例外：EoW 13/14/15 realLife=-1（:51524-51527）各段独立——杀中段拆两条、
      // 邻段晋升/自灭由 eowAI 每 tick 自查（:51874-51914），此处不传染
      if ((this.wormNext || this.wormFollow)
        && !(this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15)) {
        let head: Enemy = this;
        while (head.wormFollow) head = head.wormFollow;
        for (let s: Enemy | null = head; s; s = s.wormNext) s.dead = true;
      }
      // npc.boss 位（checkDead :78984-78987 DropEoWLoot :79212-79228）：EoW 三段仅
      // "场上再无 13/14/15"（本段即最后一段，i != whoAmI）才置位——全套 Boss 掉落
      // （宝袋/纪念章/宠物/魔矿 20-60/面具/奖旗）与 downedBoss2 都挂此位；中间段
      // 只出非门控小额（86/56 每段独立掷）。其余怪 = def.boss
      const eowId = this.vanillaId !== null && this.vanillaId >= 13 && this.vanillaId <= 15;
      this.killBossFlag = eowId
        ? !(game.enemies() as Enemy[]).some((o) => o !== this && !o.dead
          && o.vanillaId !== null && o.vanillaId >= 13 && o.vanillaId <= 15)
        : !!this.def.boss;
      // 掉落：1.4.5.6 ItemDropDatabase 规则树 + 钱币/心星管线（src/drops/NpcDrops.ts）
      // 求值序对照 NPCLoot(:79628)：规则 → 钱币 → 心星（Boss 另有药水+心）。
      // 联机傀儡跳过：掉落权威在房主（真身死亡掉落经 msg21 广播，本地生成会被
      // 自己的 netDropSweep 当作本端掉落二次广播 → 幽灵物品+重复掉落）
      const rng = new RNG(Math.floor(Math.random() * 1e9));
      if (this.vanillaId && !this.netPuppet) {
        // 雕像产怪战利品门（NPCLoot :79648-79654）：肉前集合 / StatueSpawnedDropRarity
        // 概率门外 → 整单不出（连钱带心星一起跳过，原版直接 return）
        const statueSkip = this.spawnedFromStatue && (() => {
          if (STATUE_NO_EARLYMODE_LOOT.has(this.vanillaId!) && !game.world.flags.hardMode) return true;
          const rarity = STATUE_DROP_RARITY[this.vanillaId!] ?? -1;
          // :79651 `rand >= rarity || !AnyInteractions()`——掷中还需玩家曾交互
          // （岩浆/陷阱杀的雕像怪即便掷中也不出；近似：hurt fromPlayer 生效置位）
          return rarity >= 0 && (rng.next() >= rarity || !this.playerInteracted);
        })();
        if (!statueSkip) {
        const w = game.world;
        const p = game.player;
        // 专家/大师判定读**世界难度**（Main.expertMode/masterMode = GameMode 1/2，
        // Main.cs:2775/:2779）——角色难度（软/中/硬核）只管死亡惩罚，不参与掉落
        // （曾错接 p.appearance.difficulty：专家掉落/宝袋被角色难度误触发）
        // vanillaNetId 默认 0=无变体：netId/value 查表都要把 0 归一到 type
        const netId = this.vanillaNetId !== 0 ? this.vanillaNetId : this.vanillaId;
        const ctx: NpcDropCtx = {
          rng,
          netId,
          type: this.vanillaId,
          isExpert: w.isExpert, isMaster: w.isMaster,
          hardMode: !!w.flags.hardMode, crimson: !!w.crimson,
          flags: w.flags,
          x: this.cx, y: this.cy,
          worldSurfaceTile: w.groundLevel, rockLayerTile: w.rockLevel,
          underworldTileY: w.lavaLine || w.h - 200,
          maxTilesX: w.w, maxTilesY: w.h,
          lifeMax: this.maxHp, friendly: false, boss: this.killBossFlag,
          damage: this.def.damage ?? 0,
          // value：ScaleStats 后的缩放值（def.value，NPC.cs:18110 EnemyMoneyDropMultiplier）；
          // 雕像产怪 value=0（Wiring.cs:2479）——雕像归零优先于难度缩放。
          // ★负 netID 变体走 npcValueOf(netId) 原值：原版 SetDefaultsFromNetId（NPC.cs:7633+）
          //   先 SetDefaults_ForNetId（含 ScaleStats）再硬覆写 damage/life/value 常数，
          //   覆写后【不再缩放】→ 变体 value 是未缩放原值，不得用基底缩放值顶掉
          value: this.spawnedFromStatue ? 0
            : (netId === this.vanillaId ? (this.def.value ?? npcValueOf(netId)) : npcValueOf(netId)),
          statueSpawned: this.spawnedFromStatue,
          hp: p.hp, hpMax: p.maxHp, mana: p.mana, manaMax: p.maxMana,
          luck: p.luck,
          moonEvent: game.moonEventCtx?.() ?? undefined,
          ai3: this.ai3, // NPC ai[3]：RedHatSkeletron / 光之女皇暴怒掉落条件
          ai1: this.ai1, // NPC ai[1]：史莱姆体内物品 id（SlimeBodyItemDropRule 数据源，
          //  Enemy.slimeRollContainedItem 首帧掷定；-1=掷过为空，0=未掷）
          // NPC.HasPlayerTarget（NPC.cs:6603）：TryTrackingTarget 无距离门，
          // 单人 = 玩家存活非 ghost——悠悠球五条件（Conditions.cs:1136-1244）数据源
          hasPlayerTarget: !!p && !p.dead,
          anyNpcOfType: (t) => game.enemies().some((o) => {
            const e2 = o as Enemy;
            return e2 !== this && !e2.dead && e2.vanillaId === t;
          }), // NPC.AnyNPCs：MissingTwin（先死的那只眼不掉）
          extras: game.dropContext?.(),
        };
        const unmapped = (id: number) => {
          if (!UNMAPPED_WARNED.has(id)) { UNMAPPED_WARNED.add(id); console.warn(`[NpcDrops] 物品 ${id} 无 key 映射，跳过`); }
        };
        const spawn = (id: number, n: number): ItemDrop | null => {
          const key = VANILLA_ITEM_KEY_BY_ID[id];
          if (!key) { unmapped(id); return null; }
          const v = dropVelocity(rng, id);
          const drop = game.spawnDrop(this.cx, this.cy, key, n, v.vx, v.vy);
          // 心(58)/星(184) 标记为 pickup：触碰回血/回蓝，不进背包
          if (drop) {
            if (id === 58) drop.pickup = 'heart';
            else if (id === 184) drop.pickup = 'star';
          }
          return drop;
        };
        const res = resolveDrops(ctx);
        for (const d of res.drops) {
          const drop = spawn(d.id, d.n);
          // 凝胶染色（CommonCode.ModifyItemDropFromNPC）：gel(item 23) 由 type 1 掉落且
          // netID∉{-1,-2,-5,-6} → item.color = npc.color（当前渐变色）
          if (drop && d.id === 23 && this.vanillaId === 1
            && this.vanillaNetId !== -1 && this.vanillaNetId !== -2
            && this.vanillaNetId !== -5 && this.vanillaNetId !== -6 && this.colorRGBA) {
            drop.color = [...this.colorRGBA];
          }
        }
        // 地牢之魂（DoDeathEvents_SummonDungeonSpirit，NPC.cs:79863-79878）：世纪之花
        // 已击败 + 目标玩家身处地牢，击杀 lifeMax>100、value>0、非 288 的敌怪 →
        // closestPlayer.RollLuck(13/专家9)==0（★luck 改掷，2026-08-15 前误为均匀掷）
        // 且【本 NPC 中心格墙为地牢墙】（Main.wallDungeon 7/8/9/94-99——原版双门，
        // 此前缺墙门=误在砖外刷魂）→ 原地刷 288
        if (this.vanillaId !== 288 && ctx.lifeMax > 100 && ctx.value > 0 && ctx.hasPlayerTarget
          && ctx.hardMode && ctx.flags['downed_262']
          && (game as unknown as { scene?: { zoneDungeon?: boolean } }).scene?.zoneDungeon
          && rollLuck(ctx.luck ?? 0, ctx.isExpert ? 9 : 13, () => rng.next()) === 0) {
          const st2 = game.world.store;
          const wx = Math.floor(this.cx / TILE), wy = Math.floor(this.cy / TILE);
          if (st2.inBounds(wx, wy) && DUNGEON_WALL_IDS.has(st2.wall[st2.idx(wx, wy)])) {
            spawnPart(game, this, 288);
          }
        }
        // 双子 BeforeLoot（NPC.cs DoDeathEvents_BeforeLoot :79761）：另一只眼还活着时
        // value=0 + boss=false——钱与 Boss 药水/心只给后死的那只（先死的只出规则掉落）
        const twinSuppressed = (this.vanillaId === 125 || this.vanillaId === 126)
          && game.enemies().some((o) => {
            const e = o as Enemy;
            return e !== this && !e.dead
              && e.vanillaId === (this.vanillaId === 125 ? 126 : 125);
          });
        // 钱币（规则未清零 value 时走 NPCLoot_DropMoney 管线）
        const value = res.zeroValue || twinSuppressed ? 0 : ctx.value;
        if (value > 0) for (const c of rollCoins(value, ctx, !!ctx.extras?.bloodMoon, this.midasT > 0)) spawn(c.id, c.n);
        // 心/星（NPCLoot_DropCommonLifeAndMana）
        for (const h of rollHeartsAndStars(ctx)) spawn(h.id, h.n);
        // Boss 药水+心（DoDeathEvents_DropBossPotionsAndHearts，boss 门 :80307）——
        // EoW 中间段 killBossFlag=false 不出（仅最后一段）
        if (this.killBossFlag && !twinSuppressed) for (const b of rollBossPotionsAndHearts(ctx)) spawn(b.id, b.n);
        }
      } else {
        for (const d of this.def.drops) {
          if (rng.next() < d.chance) {
            const n = rng.int(d.min, d.max);
            if (n > 0) game.spawnDrop(this.cx, this.cy, d.item, n, rng.range(-1.5, 1.5), -2);
          }
        }
      }
      game.onEnemyKilled(this.key, this);
      // 死亡声 = 本体 DeathSound（NPC.Strike :48316 全 NPC 同链，Boss 亦然——
      // 血肉墙 NPCDeath10 / 机械族 NPCDeath14 / 克脑 NPCDeath11 / 猪鲨 NPCDeath20 /
      // 光皇 65 / 史后 64 / 异教徒 59 / 月总头手 62 / Betsy DD2 / 鹿角怪专属）。
      // HitEffect 里唯一额外 Boss 咆哮 = EoC（NPC.cs:88205-88210：gore 循环体内
      // PlaySound(15)，×2 次迭代 → 连播两声）；月总核心 398 DeathSound=null 无声。
      // （旧"Boss 一律咆哮吞掉 DeathSound"2026-08-14 对账修正）
      if (this.vanillaId === 4) {
        game.playSfx('roar', 1, this.cx, this.cy);
        game.playSfx('roar', 1, this.cx, this.cy);
      }
      if (this.vanillaId !== 398) {
        if (this.def.killedSound.length) game.playSfxFiles(this.def.killedSound, 1, this.cx, this.cy);
        else game.playSfx('killed', 1, this.cx, this.cy);
      }
      // 原版死亡 gore 碎块（NPC.HitEffect life<=0 段全表，NPC.cs:82421-:90873 →
      // tools/extract-gore.mjs → src/data/vanilla-gore.json）：查表炸 GorePiece
      // （位置/速度/ai 门/gates 守卫/post 后处理 1:1，Gore.NewGore 随机扰动在
      // GorePiece.newGore 内）。spriteDirection = 本仓 facing（同符号约定，表内
      // `spriteDirection != -1` 类镜像分支门用）。无表项 = 原版只出尘不出块
      // （史莱姆族等）→ 只走下方彩色粒子近似
      spawnNpcDeathGore(this, game, Math.sign(kbx) || 1, this.facing);
      // 死亡碎裂：与主角同款物理粒子（喷溅/落地反弹/停驻淡出），颜色按怪物类型
      // （兼作原版 HitEffect 的血尘近似，与 gore 碎块叠加）
      const [c1, c2, c3] = this.def.gore;
      const big = this.killBossFlag || this.w > 40;
      game.spawnParticles(this.cx, this.y + this.h * 0.3, c1, big ? 26 : 12, big ? 3.4 : 2.6, { life: 240, damp: 0.988, grav: 0.09 });
      game.spawnParticles(this.cx, this.cy, c2, big ? 18 : 8, big ? 2.6 : 2.0, { life: 220, damp: 0.985, grav: 0.09 });
      game.spawnParticles(this.cx, this.cy - this.h * 0.2, c3, big ? 12 : 6, big ? 3.0 : 2.3, { life: 200, damp: 0.988, grav: 0.09 });
      return true;
    }
    // 受击：少量碎屑零散溅落（不大面积）
    game.spawnParticles(this.cx, this.cy, this.def.gore[0], 5, 1.4, { life: 60 });
    return false;
  }

  /** AI 触发的标准死亡（EoW 断链自灭，NPC.cs:51876-51905 的 life=0 + HitEffect +
   *  checkDead 语义）：清无敌帧后走 hurt 全管线（掉落/记账/音效/粒子）——
   *  原版直改 life 不经 StrikeNPC，故 iframes 不应阻塞 */
  die(game: GameHooks): void {
    this.hp = 0;
    this.iframes = 0;
    this.hurt(this.maxHp + 9999, 0, 0, game);
  }

  draw() { /* Renderer 统一绘制 */ }
}
bindEnemyCtor(Enemy);

// ===================== 仙灵宝箱搜索（GetFairyTreasureCoords NPC.cs:48794-48852 1:1）=====================

/** FriendlyFairyCanLureTo（TileID.cs:409）：仙灵可引导到的宝箱/家具 tile 表 */
const FAIRY_LURE_SHEETS = new Set([8, 169, 21, 467, 107, 108, 111, 221, 222, 223, 211, 12, 665, 639, 236, 702, 227]);

/** tileOreFinderPriority（Main.cs:6356-6391）：引导优先级——同优先级取最近，
 *  矿石族 3×3 计数 ≥40 才有效（大矿脉才算"宝藏"） */
const FAIRY_LURE_PRIORITY: Record<number, number> = {
  28: 100, 407: 150, 404: 150, 7: 200, 166: 210, 6: 220, 167: 230, 9: 240,
  168: 250, 8: 260, 169: 270, 22: 300, 204: 310, 37: 400, 21: 500, 467: 500,
  441: 500, 468: 500, 12: 550, 665: 550, 639: 550, 107: 600, 221: 610,
  108: 620, 222: 630, 111: 640, 223: 650, 129: 675, 211: 700, 227: 750,
};

/** IsValidForOreFinder（SceneMetrics.cs:904-919）：227 生命果仅 272≤frameX≤374、
 *  129 宝箱仅 frameX≥324 才算 */
function fairyOreFinderValid(sheet: number, frameX: number): boolean {
  if (sheet === 227) return frameX >= 272 && frameX <= 374;
  if (sheet === 129) return frameX >= 324;
  return true;
}

/** 宝箱/引导目标搜索（GetFairyTreasureCoords :48794-48852）：中心 ±75×±50 窗
 *  （钳世界缘 40），按优先级取最高（同优先取最近）；矿石族 3×3 同类计数 ≥40 */
export function fairyTreasureCoords(
  st: import('../world/TileStore').TileStore, cx: number, cy: number,
): [number, number] | null {
  const px = Math.floor(cx / 16), py = Math.floor(cy / 16);
  const x0 = Math.max(40, px - 75), x1 = Math.min(st.w - 41, px + 75);
  const y0 = Math.max(40, py - 50), y1 = Math.min(st.h - 41, py + 50);
  let bestPrio = -1, bestD = -1, bx = -1, by = -1;
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      const idx = st.idx(i, j);
      const sheet = st.flags[idx] ? (TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? 0) : 0;
      if (!sheet || !FAIRY_LURE_SHEETS.has(sheet)) continue;
      if (!fairyOreFinderValid(sheet, st.frameX[idx])) continue;
      let prio = FAIRY_LURE_PRIORITY[sheet] ?? -1;
      if (prio < 0) continue;
      if (bestPrio <= prio) {
        const d = Math.hypot(i * 16 + 8 - cx, j * 16 + 8 - cy);
        if (bestPrio !== prio || d < bestD) {
          bestPrio = prio; bestD = d; bx = i; by = j;
        }
      }
    }
  }
  return bx >= 0 ? [bx, by] : null;
}

/** 宝箱格当前是否仍有效（状态 5 的 :48905 失效门） */
export function fairyTreasureValidAt(
  st: import('../world/TileStore').TileStore, x: number, y: number,
): boolean {
  if (!st.inBounds(x, y)) return false;
  const idx = st.idx(x, y);
  const sheet = st.flags[idx] ? (TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? 0) : 0;
  return !!sheet && FAIRY_LURE_SHEETS.has(sheet) && fairyOreFinderValid(sheet, st.frameX[idx]);
}

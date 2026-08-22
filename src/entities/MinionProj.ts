// 召唤物实体（R6）：随从（飞行/地面通用 AI 近似）与哨兵（定点炮台）。
// 原版各随从 aiStyle（62/66/26/121/156/164/197…）行为高度定制，本实体按三大类
// 近似（数值=武器 combat 表；上限/驱逐/召回语义取 Player.maxMinions 链）：
//   flying：悬停玩家侧后环形槽位 → 锁定最近敌 ≤700px 俯冲突进（接触伤害+同敌冷却）
//           → >1300px 瞬移回玩家（原版 minion 回收语义）
//   ground ：重力+碰撞，地面追击最近敌，接触伤害
//   sentry ：定点（施法点）。aiStyle 53 三族 1:1（初冷 120、射速 60/60/90、扇区炮口）；
//            OOA 四塔（AI_130/134/137/138）与 aiStyle 123（月门/彩虹水晶）各按原版
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { BuffType } from '../stats/Buffs';
import { canHit, canHitLine } from '../physics/LineOfSight';
import { Arrow, projFrameImg, projFrameCount } from './Arrow';
import { resolveWhipTagHit, SUMMON_TAG_MUL } from './WhipTag';
import { applyProjStatus } from './projStatus';
import { projDrawOffsetFor } from './WeaponProj';
import { projectileData } from '../data/vanillaProjectiles';
import { soundTrackFiles } from '../data/vanillaNpcs';
import { playerCanHitEnemy } from './projTargets';

/** 爆炸烈焰塔三档（3818/3819/3820 → proj 663/665/667，AI_130）：帧 0 待机、
 *  帧 1-6 开火动画、第 12t 出火球 668 */
const FLAMEBURST_TOWER = new Set([663, 665, 667]);
/** 弩车三档（AI_134 :65584）：帧 0 待机、帧 1-5 开火（每 5t）、第 12t 出弩箭 680
 *  （速 16，T2 21）、25t 结束、冷却 GetBallistraShotDelay */
const BALLISTA_TOWER = new Set([677, 678, 679]);
/** GetBallistraShotDelay 1:1（1457 :69721-69735；1456 :65707 同体）：
 *  基础 160 → 侍从 T3 套装 100 → 弩车恐慌（ballistaPanic）60 → 双真 30。
 *  本仓 setSquireT3/ballistaPanic（DD2 套装/哨兵背包恐慌位）未实装 → 恒 160 档，
 *  档位结构先落（旗标接线随 DD2 套装批） */
function ballistraShotDelayOf(player: object): number {
  const p = player as { setSquireT3?: boolean; ballistaPanic?: boolean };
  let result = 160;
  if (p.setSquireT3) result = 100;
  if (p.ballistaPanic) result = 60;
  if (p.ballistaPanic && p.setSquireT3) result = 30;
  return result;
}
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
  387: [4, 3, 0],  388: [4, 3, 0], // 双子眼球：fc>3 → frame++，cap 2（:28878-28888）
  533: [2, 3, 0],   // 致命球：fc>1 → frame++，cap 2
  755: [6, 5, 0],   // 血红杖：fc≥6 循环 5 帧
  759: [6, 4, 0],   // 雀杖：fc≥6，cap projFrames-1=4
  831: [4, 6, 0],   // 沙漠虎：fc≥4，frame≥6 → 0
  970: [4, 6, 0],   // 阿比盖尔：fc≥4，frame≥6 → 0
  1025: [8, 4, 0],  // 藤壶：慢循环
};

/** 朝向语义表（原版 spriteDirection/rotation 真值，2026-08-17 镜像修复批）：
 *  - AI62_LEFT_ART：AI_062（:62983-62990）velocity.X>0 → spriteDirection=-1
 *    ——贴图朝左、右行才翻转 → facing=-sign(vx)（曾误 facing=sign(vx) 全族镜像）
 *  - MINION_NO_FLIP：AI_026/AI_164 零 spriteDirection 赋值（俾格米191-194/
 *    宝宝史莱姆266/蜘蛛313·379·390·391/计数器831·970）恒不翻转。
 *    1094 Foxparks 已移出（2026-08-22）：flag8=1094 有专属赋值——喷火态
 *    Projectile.cs:56111-56120 spriteDirection=(velocity.X>0?1:-1) 再取反、
 *    跟随态 :57698 spriteDirection=player.direction——按 velocity 翻转
 *  - MINION_ROT_ONLY：旋转制不与翻转叠用（原版 dir 恒 None）——双子387/388
 *    （vel+π）、致命球533、雪花917、龙链625-628、同伴方块653 */
const AI62_LEFT_ART = new Set([373, 375, 407, 423, 613]);
/** AI_062 射手族（SetDefaults aiStyle=62 全表 :4295/:4319/:4610/:4692/:6324/:8829，
 *  963 阿比盖尔另档）——索敌射程/视线门分档用（1456 :62362-62375） */
const AI62_SHOOTERS = new Set([373, 375, 407, 423, 613]);
const MINION_NO_FLIP = new Set([191, 192, 193, 194, 266, 313, 379, 390, 391, 392, 831, 970,
  112, 959, 1003, 1004, 1095, 1096]);   // AI_026 零 spriteDirection 赋值族(2026-08-19 补漏;1094 移出:56111)
const MINION_ROT_ONLY = new Set([387, 388, 533, 917, 625, 626, 627, 628, 653]);

/** 远程射击随从表（Projectile.cs AI_062/AI_026/aiStyle66 射击分支提取）：
 *  shot=射出弹幕 speed=弹速 cd=冷却 t(源码 ai[1] 递增率折算：373 rand(1,4)/t>90≈36；
 *  375/407/423/613 +1~2/t 折算) range=射击门距 dmgMul=伤害倍率 jitter=瞄准随机抖动 px
 *  muzzleY=出生锚点相对本体中心的 Y 偏移（AI_026 vector15 = Center-8 :58764；
 *  Foxparks 分支再 -2 :58784）；life=出生 timeLeft 覆写（AI_062 全族 300 :63210，
 *  唯 423→433 分支不覆写→433 SetDefaults 100）。
 *  373 黄蜂→374 毒刺(:63116 sp10)；375 小鬼→376 火球(sp11)；
 *  407 风暴(鲨鱼龙卷)→408(sp20)；423 Xeno UFO→433 光束(sp4,≤400px 门,:63136)；
 *  613 星尘细胞→614(sp14,≤500px 门)；
 *  191-194 俾格米→195 掷矛(AI_026 :58795,sp11,CD30,射程800,抖动±20)；
 *  387 双子激光眼→389(:28982 sp8 ×1.15 伤,CD~45,需视线)；
 *  1094 Foxparks→1097 火球(:58815 sp11 CD42 无抖动) */
const MINION_SHOOT: Record<number, { shot: number; speed: number; cd: number; range: number; dmgMul?: number; jitter?: number; grav?: number; life?: number; muzzleY?: number; burn?: 'fire' | 'hellfire'; search?: number }> = {
  // 373/375/407 range=2000：AI_062 索敌档（:62371）且原版命中即射（:63193-63206
  // 无距门,仅 423 ≤400 :63142 / 613 ≤500 :63157 有显式门）——range 兼射击门,
  // 随索敌档同步,否则 1000-2000 段出现"追而不射"
  373: { shot: 374, speed: 10, cd: 36, range: 2000, life: 300 },
  375: { shot: 376, speed: 11, cd: 68, range: 2000, life: 300 },  // AI 覆写 300 压过 SetDefaults 100（:63210）
  407: { shot: 408, speed: 20, cd: 30, range: 2000, life: 300 },
  423: { shot: 433, speed: 4, cd: 24, range: 400, life: 100 },    // 423 分支无覆写 → SetDefaults 100
  613: { shot: 614, speed: 14, cd: 36, range: 500, life: 300 },   // 613 分支覆写 300（:63175）
  191: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8 }, // 掷矛抛物线(aiStyle 1) 手部高度 :58764
  192: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8 },
  193: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8 },
  194: { shot: 195, speed: 11, cd: 30, range: 800, jitter: 20, grav: 0.3, life: 300, muzzleY: -8 },
  387: { shot: 389, speed: 8, cd: 45, range: 1000, dmgMul: 1.15, life: 300 },  // timeLeft=300(:28981)
  // Foxparks 族（AI_062 flag10 段 :62573-62750）：cd num135 42/30（1113 :62573）；
  // 射程门 num139<800+num134（1113 num134+=360 :62672 → 1160）； muzzleY = h/2-8 再 -2
  // （:62740 vector14.Y-=2）；burn：1097 命中 ai[1]>0 → OnFire3(323)/否则 OnFire(24)
  // （:11315-11318）——1094 ai[1]=0 恒火、1113 ai[1]=3/1 恒地狱火（:62744-62752）
  1094: { shot: 1097, speed: 11, cd: 42, range: 800, life: 300, muzzleY: -10, burn: 'fire' }, // Foxparks 分支 :58784 再 -2
  // 1113 索敌检索 1160（:62672 num134+=360 → num139<800+360；approach num151=450+180）
  1113: { shot: 1097, speed: 11, cd: 30, range: 1160, search: 1160, life: 300, muzzleY: -10, burn: 'hellfire' }, // 6149 可靠的火绒狐（1457 新）
};

/** aiStyle 53 定点哨兵表（AI :27172-27382 1:1）：初冷 ai[0]=120（:27180），
 *  射速 ai[0] 归零重置 60（966 猎犬 90，:27282-27288），弹速 9/9/12.5。
 *  炮口按瞄准扇区偏移（:27289-27305，见 sentry53Fire）；射程门 1000
 *  （AI_053_HandleSentryNPCTargeting :37845 默认 maxDistance=1000，无视线门） */
const SENTRY53: Record<number, { shot: number; speed: number; cd: number }> = {
  308: { shot: 309, speed: 9, cd: 60 },   // 冰九头蛇 → 309 冰弹
  377: { shot: 378, speed: 9, cd: 60 },   // 蜘蛛皇后 → 378 蛛卵
  966: { shot: 967, speed: 12.5, cd: 90 }, // 猎犬（Houndius）→ 967
};
/** aiStyle 123 哨兵射击表（:33819-34020 提取；射程门 1000）：
 *  641 月门→642 传送门弹 CD30；643 彩虹水晶→644×3 目标区随机落点 CD50
 *  （:34005 三连，距离越远散布越大） */
const SENTRY_SHOOT: Record<number, { shot: number; speed: number; cd: number; volley?: number }> = {
  641: { shot: 642, speed: 9, cd: 30 },
  643: { shot: 644, speed: 0, cd: 50, volley: 3 },
};

/** 随从/哨兵专属召唤音（生成后首帧起按 at 节拍各播一次）——原版来源：
 *  · 970 阿比盖尔计数：物品 5114 UseSound=AbigailSummon（Item.cs:40946）
 *  · 1022 蘑菇随从：物品 5456 UseSound=DeadCellsMushroomSummon（音量 0.35，:1081）
 *  · 1093/1094/1112/1113 Pal 随从：弹幕 AI soundDelay 双声（Projectile.cs:488 初值 0，
 *    `--soundDelay == -20` 第 20 拍家族叫声 PalCattiva :50893-50898 / PalFoxparks
 *    :59128-59131，音量 0.35=SoundID.cs:1049/:1061；`== -1` 首拍 PalSummon
 *    :50896/:59131，音量 0.15=SoundID.cs:1047）——tick1=PalSummon、tick20=家族叫声
 *    （1093/1094 与 1112/1113 同序，曾登记相反已订正）
 *  · OOA 十二哨兵 663-693：物品 3818-3834 UseSound=DD2_DefenseTowerSpawn（Item.cs:33794）
 *  其余随从族原版统一 UseSound=Item44（Game 侧 summon 通道已播，此处不重复） */
const MINION_SUMMON_SFX: Record<number, Array<{ track: string; vol: number; at: number }>> = {
  970: [{ track: 'abigail_summon', vol: 0.9, at: 1 }],
  1022: [{ track: 'deadcells_mushroom_summon', vol: 0.35, at: 1 }],
  1093: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_cattiva', vol: 0.35, at: 20 }],
  1094: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_foxparks', vol: 0.35, at: 20 }],
  1112: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_cattiva', vol: 0.35, at: 20 }],
  1113: [{ track: 'pal_summon', vol: 0.15, at: 1 }, { track: 'pal_foxparks', vol: 0.35, at: 20 }],
  ...Object.fromEntries([663, 665, 667, 677, 678, 679, 688, 689, 690, 691, 692, 693]
    .map((id) => [id, [{ track: 'dd2_defense_tower_spawn', vol: 0.7, at: 1 }]])),
};

/** 随从射弹出膛音（原版在弹幕 AI 首帧 localAI[0]==0 处 PlaySound，等效落射弹生成帧）：
 *  374 毒刺 Item_17（:52670）/ 376 小鬼火球 Item_20（:52684）/ 378 蛛卵 Item_17（:23398）/
 *  967 猎犬弹 Item_60（:24971）。408/433/614/195/389/642 原版无出膛音（AI 无 PlaySound） */
const MINION_SHOT_SFX: Record<number, { track: string; vol: number }> = {
  374: { track: 'Item_17', vol: 0.7 },
  376: { track: 'Item_20', vol: 0.7 },
  378: { track: 'Item_17', vol: 0.7 },
  967: { track: 'Item_60', vol: 0.7 },
};

/** 敌人最小形状（鸭子类型，避免与 Enemy 循环依赖） */
interface EnemyLike {
  cx: number; cy: number; x: number; y: number; w: number; h: number; id: number;
  dead: boolean;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean, penPercent?: number) => boolean;
}

/** Utils.Remap（AI_120 :42222 用；value 截断映射 [from1..to1] → [from2..to2]） */
const remap01 = (value: number, from1: number, to1: number, from2: number, to2: number): number => {
  if (value <= from1) return from2;
  if (value >= to1) return to2;
  return from2 + (to2 - from2) * (value - from1) / (to1 - from1);
};

/** XNA Vector2.CatmullRom（AI_162 :44091 样条插值） */
const catmullRom = (
  v1: { x: number; y: number }, v2: { x: number; y: number },
  v3: { x: number; y: number }, v4: { x: number; y: number }, t: number,
): { x: number; y: number } => {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * (2 * v2.x + (-v1.x + v3.x) * t + (2 * v1.x - 5 * v2.x + 4 * v3.x - v4.x) * t2 + (-v1.x + 3 * v2.x - 3 * v3.x + v4.x) * t3),
    y: 0.5 * (2 * v2.y + (-v1.y + v3.y) * t + (2 * v1.y - 5 * v2.y + 4 * v3.y - v4.y) * t2 + (-v1.y + 3 * v2.y - 3 * v3.y + v4.y) * t3),
  };
};

/** 接触伤害的每敌冷却（原版 localNPCImmunity 1:1）：
 *  - Projectile.Update :15330 每 update 先整体衰减（DecrementLocalImmuneTimeCounters
 *    :15926-15941），再跑碰撞（Damage_PVE :11878-11884 要求 array[i]==0）
 *  - 命中写入 immuneArray[victimIndex] = localNPCHitCooldown（:13152-13154，
 *    同时 targetNPC.immune[owner]=0 —— 不吃玩家的全局受击免疫）
 *  ⇒ 命中后恰好 cd 个 tick 再命中（cd=3 → 每 3t 一跳；旧实现"先判后减"多出 1t） */
export class MinionHitCd {
  private map = new Map<number, number>();
  ready(id: number, cd: number): boolean {
    const t = this.map.get(id) ?? 0;
    if (t > 1) { this.map.set(id, t - 1); return false; }
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
  /** aiStyle 53 一次性初始化门（localAI[0]==0 → ai[0]=120，:27176-27181） */
  sInit = 0;
  /** 闪电光环方形场边长（AI_137 :65972-65981 净空测量；0=未测）与场中心 Y（地面点） */
  auraSide = 0;
  auraCy = 0;
  /** 朝向（哨兵 spriteDirection / 随从渲染翻转） */
  facing = 1;
  /** 攻击闪光 tick（AI_062 小鬼攻击帧 +4 门：命中后 24t） */
  attackFlash = 0;
  /** 随从世界点光（Game 实体光通道读 lightRGB——原版各 AI 的 Lighting.AddLight）：
   *  755 血蝙蝠 = Crimson CastLightOpen（:48604 GetColor=Color.Crimson(220,20,60)）；
   *  613 星尘细胞 (0.2,0.6,0.7)（:62191）；623 守护者 (0.9,0.9,0.7)（:41997）；
   *  1094 Foxparks (0.5,0.3,0.1)（:55275）；533 致命球 ai0%3≠2 橙/≡2 青（:28542-
   *  28551，无态机取橙档）；653 同伴方块白光 0.5（:46598 档位近似）。387/388/
   *  373/375/407/423/266/蜘蛛/虎/阿比盖尔/龙链原版零自发光。 */
  get lightRGB(): [number, number, number] | null {
    switch (this.projId) {
      case 755: return [220 / 255, 20 / 255, 60 / 255];
      case 613: return [0.2, 0.6, 0.7];
      case 623: return [0.9, 0.9, 0.7];
      case 1094: return [0.5, 0.3, 0.1];
      case 533: return [0.8, 0.3, 0.1];
      case 653: return [0.5, 0.5, 0.5];
      default: return null;
    }
  }
  /** 不占随从槽位（沙漠虎/阿比盖尔本体、龙身体段、星尘守护者——原版 minionSlots=0/不统计） */
  noSlot = false;
  /** 龙链父段引用（626/627/628 跟随前段） */
  parentRef: (() => MinionProj | null) | null = null;
  /** 虎扑链状态（AI_067）：ai[0] 4=链发后等待 / ai[1]=剩余等待 tick（:46702-46718） */
  private tigerA0 = 0;
  private tigerA1 = 0;
  /** 守护者 AI_120 状态（ai[0]/ai[1]/frameCounter/retarget 计数） */
  private gA0 = 0;
  private gA1 = -1;
  private gFc = 0;
  private gFrame = 0;
  private gRetarget = 0;
  /** 乌鸦 AI_054 状态（ai[0] 归位态 / ai[1] 扑击计时 / 帧区 0=飞 1=扑） */
  private rA0 = 0;
  private rA1 = 0;
  /** 原版 Projectile.friendly 字段镜像（AI_054 内动态翻转：跟随期 :27474 true→
   *  :27519 false、扑击倒数 :27566 false、冲刺帧 :27547 true——下一 tick 的
   *  归位门 :27423 读上一 tick 末值） */
  private rFriendly = false;
  ravenZone = 0;
  /** 致命球 533 相位机（AI_066，ai[0]/ai[1]/localAI[0] 镜像）：
   *  ai[0] 0-2 待机 / 3-5 蓄力 / 6-8 冲刺 / 9-11 归位冲刺；自旋与待机帧动画只在
   *  ai[0]<3 || ≥9（:28874-28877/:28891-28893——3-8 冲刺段不自旋） */
  private dA0 = 0;
  private dA1 = 0;
  private dLai0 = 0;
  /** AI_120 当前状态（ai[0]：0 跟随 / 2 冲刺拳击；诊断与回归用） */
  get ai120State(): number { return this.gA0; }
  /** 家族一次性初始化（龙链生成） */
  private spawned = false;
  /** 阿比盖尔 970 升级音一次性门（Projectile.cs:43971 localAI[0]==0 语义） */
  private abigailUpgChecked = false;
  /** Foxparks 喷火弹 1106 出膛音三发一门（Projectile.cs:38956 whoAmI%3==0） */
  private foxFlameN = 0;
  /** 渲染旋转（龙链：段朝向 = 指向父段 +PI/2，同原版 rotation=velocity.ToRotation()+PI/2） */
  rot = 0;
  /** Foxparks 5664 手持喷火通道（AI_026 ai[0]>=1000：每 4t 发 1106，Game 每帧置 true+瞄准） */
  foxChannel = false;
  foxAimX = 0; foxAimY = 0;
  private foxT = 0;
  private pounceCd = 0;
  /** 帕鲁出场淡入（DoPalAppearEffect :39509-39515：SetDefaults alpha=255 起每 tick
   *  -15，17t 全显——1112 :10377 / 1113 :10400 / 1118 :10485；其余随从 0=不淡入） */
  alphaFade = 0;
  // ---- 帕鲁地面随从 1112/1118（AI_067 flag8/flag9 态机，ai[0]/ai[1] 镜像）----
  /** ai[0]：0 地面跟随/索敌 / 2 扑击（1 归位飞行与 5 Boss 追击见 palGroundStep 注） */
  private palA0 = 0;
  /** ai[1]：扑击剩余 tick（num10 初值 16/30，:50490/:50499） */
  private palA1 = 0;
  // ---- 同伴方块 653（AI_067,Projectile.cs:46657/46804-46860/47055-47830）----
  private cubeA0 = 0;     // ai[0]：0 地面跟随 / 1 归位悬浮
  private cubeLai0 = 0;    // localAI[0]：岩浆尖叫计数 0..20（近主清零 :47088）
  private cubeLai1 = 0;    // localAI[1]：黑暗计数 -3600..120（阈值后捅人）
  private cubeRot = 0;     // rotation（+=vx/20 :46805；贴靠时 AngleTowards 0）
  /** _CompanionCubeScreamCooldown[owner]（静态 float[256]——单人取模块级等价） */
  private static cubeScreamCd = 0;

  // ---- 旗舰家族分支（行号见各方法注释；均在通用运动前 return）----

  /** 星尘龙头（aiStyle 121 :40138-40403）：加速追敌（acc 0.4/0.6/0.8 ×1.5=0.6/0.9/1.2
   *  限速 30，穿墙穿敌）/ 跟随玩家（限速 15，>2000px 传送）；伤害 ×(1+0.23×localAI[0])
   *  （:12097，localAI[0]=距尾段数，头=全段数）；首次生成 626→627→628 链（段距 16px），
   *  全链共用一张命中表（7t/敌） */
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
    const scale = 1 + 0.23 * this.dragonLocalAI0(game);
    const tgt = this.nearestEnemy(game, 1000);
    if (tgt) {
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const d = Math.hypot(dx, dy) || 1;
      // 1456 :40229-40236：acc 档 0.4/0.6/0.8 ×1.5 → 0.6/0.9/1.2
      const acc0 = d < 300 ? 0.8 : d < 600 ? 0.6 : 0.4;
      // :40237-40244 距敌 > 敌判定盒对角线×0.75 才推进；推进后 Dot(velocity,vector)<0.25
      // （vector 未归一）→ velocity×0.8 阻尼（横向/背向减速）
      if (d > Math.hypot(tgt.w, tgt.h) * 0.75) {
        this.vx += (dx / d) * acc0 * 1.5;
        this.vy += (dy / d) * acc0 * 1.5;
        if (this.vx * dx + this.vy * dy < 0.25) { this.vx *= 0.8; this.vy *= 0.8; }
      }
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

  /** 召唤入口后置射击冷却（shootCd = 本仓 ai[0]/localAI[0] 射击槽等价）：
   *  6149→1113 `Main.projectile[num145].localAI[0] = 30f`（Player.cs:48945）/
   *  6164→1119 SpawnMinionOnCursor `case 6164: ai = 45f`（:50115，AI_206 首轮
   *  开火循环前置 45t :38272）。1094 的 :56155 同语义走 lockAfterFoxChannel */
  armSpawnCooldown(t: number): void { this.shootCd = Math.max(this.shootCd, t); }

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

  /** 星尘龙 localAI[0] 等价（1456 Projectile.cs:40342 每段找父后 parent.localAI[0]=
   *  self+1——链自尾向头传播：尾 628=0、627=1、626=2、头 625=3（基础龙 3 段）；
   *  再召唤插段同式累加）。伤害 ×(1+0.23×clamp(localAI[0],0,50))（:12097-12102，
   *  scale=1+localAI[0]×0.01 → value=(scale-1)×100）——逐段各自档位，非全链同值 */
  private dragonLocalAI0(game: GameHooks): number {
    const total = this.peerCount(game, 626) + this.peerCount(game, 627) + this.peerCount(game, 628);
    if (this.projId === 625) return Math.min(50, total); // 头 = 全段数
    let k = 0;
    let cur: MinionProj | null = this;
    while (cur && cur.projId !== 625 && k <= total) { cur = cur.parentRef?.() ?? null; k++; }
    return Math.min(50, Math.max(0, total - k));        // 段 = 全段数 − 距头步数
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
    this.contact(game, dmg0 * (1 + 0.23 * this.dragonLocalAI0(game)), 7);
  }

  /** 计数器（831 虎宝石 / 970 阿比盖尔计数，AI_164 :43946）：头顶环绕吸附、不攻击；
   *  派生唯一本体（档位随同类数），本体 noSlot 不占上限 */
  private counterHover(game: GameHooks, p: Player, dmg0: number): void {
    void dmg0;
    const projs = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles;
    // 升级音（:43974）：970 首帧且同类 >1 → AbigailUpgrade（音量 0.5，SoundID.cs:1027）
    if (this.projId === 970 && !this.abigailUpgChecked) {
      this.abigailUpgChecked = true;
      if (this.peerCount(game, 970) > 1) {
        game.playSfxFiles(soundTrackFiles('abigail_upgrade'), 0.5, this.cx, this.cy);
      }
    }
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

  /** 沙漠虎本体（833/834/835，aiStyle 67）：地面追击 + 周期 818 多段扑击链
   *  （AI_067_TigerSpecialAttack :46383-46479 1:1，链长 = 宝石数+1）。
   *  冷却 localAI[0]（:46705-46712：成功 833→360/834→300/835→240、失败 10t 重试）；
   *  链发后本体瞬移末段并进入 ai[0]=4 等待（:46475-46478、:46702-46718，等待期
   *  无接触伤 Damage_CanDealDamage :11782）。接触伤害 ×(1+0.4×(宝石数-1))
   *  （StormTiger 集 :12101-12105）；818 弹伤 ×(1.5+0.4n)（:12107-12111） */
  private tigerBody(game: GameHooks, p: Player, dmg0: number): void {
    const gems = Math.max(1, this.peerCount(game, 831));
    const scale = 1 + 0.4 * (gems - 1);
    // ai[0]==4 等待态（:46702-46718）
    if (this.tigerA0 === 4) {
      this.vx = this.vy = 0;
      if (--this.tigerA1 <= 0) { this.tigerA0 = 0; this.tigerA1 = 0; }
      return;
    }
    // 特殊攻击门（:46705-46712：localAI[0]≤0 且 damage!=0 → 尝试；成功按档冷却/失败 10t）
    if (this.pounceCd > 0) this.pounceCd--;
    else {
      const cd = this.projId === 834 ? 300 : this.projId === 835 ? 240 : 360;
      if (this.tigerSpecialAttack(game, p, dmg0)) { this.pounceCd = cd; return; }
      this.pounceCd = 10;
    }
    // 地面追击（AI_067 地面段近似）
    const tgt = this.nearestEnemy(game, 800);
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

  /** AI_067_TigerSpecialAttack（:46383-46479）：多段 818 链 1:1。
   *  目标池 = 玩家周 1600×800 盒（:46389-46399）；nPC2 距玩家最近收尾、nPC3 距本体
   *  最近首发，其余随机带 4×序号速度前置补位（list2 ≤ 宝石数+1，:46401-46451）；
   *  末段落点实心则追加玩家中心（:46455-46459）；逐段 818（ai[0]=-累计t×4 延迟、
   *  ai[1]=段时长×4，段时长 = min(min(20,30/段数), 4+ceil(距离/50)) 下限 5，
   *  :46461-46472） */
  private tigerSpecialAttack(game: GameHooks, p: Player, dmg0: number): boolean {
    const ents = (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities;
    const gems = Math.max(1, this.peerCount(game, 831));
    const num = gems + 1; // :46388（ownedProjectileCounts[831]+1）
    const pool: (EnemyLike & { vx?: number; vy?: number })[] = [];
    for (const e of game.enemies()) {
      const en = e as EnemyLike & { vx?: number; vy?: number };
      if (!playerCanHitEnemy(e, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
      if (!en.dead && Math.abs(en.cx - p.cx) <= 800 && Math.abs(en.cy - p.cy) <= 400) pool.push(en);
    }
    if (!pool.length) return false;
    // nPC2：距玩家最近（:46402-46412）
    let n2 = pool[0];
    for (let j = 1; j < pool.length; j++) {
      if (Math.hypot(n2.cx - p.cx, n2.cy - p.cy) > Math.hypot(pool[j].cx - p.cx, pool[j].cy - p.cy)) n2 = pool[j];
    }
    pool.splice(pool.indexOf(n2), 1);
    // nPC3：距本体最近（:46414-46426）
    let n3: (EnemyLike & { vx?: number; vy?: number }) | null = null;
    if (pool.length) {
      n3 = pool[0];
      for (let k = 1; k < pool.length; k++) {
        if (Math.hypot(n3.cx - this.cx, n3.cy - this.cy) > Math.hypot(pool[k].cx - this.cx, pool[k].cy - this.cy)) n3 = pool[k];
      }
      pool.splice(pool.indexOf(n3), 1);
    }
    const hops: { x: number; y: number }[] = [];
    if (n3) hops.push({ x: n3.cx, y: n3.cy }); // :46428-46431
    let lead = 0;
    while (pool.length > 0 && hops.length < num - 1) { // :46433-46441（速度前置 4×(序号+1)）
      const idx = Math.floor(Math.random() * pool.length);
      const en = pool[idx];
      hops.push({ x: en.cx + (en.vx ?? 0) * 4 * (lead + 1), y: en.cy + (en.vy ?? 0) * 4 * (lead + 1) });
      pool.splice(idx, 1);
      lead++;
    }
    hops.push({ x: n2.cx, y: n2.cy }); // :46443-46447（收尾 = 距玩家最近）
    // 末段落点实心 → 追加玩家中心（:46448-46452）
    const st = game.world.store;
    const lastT = Math.floor(hops[hops.length - 1].x / TILE), lastY = Math.floor(hops[hops.length - 1].y / TILE);
    if (st.inBounds(lastT, lastY) && st.isSolid(lastT, lastY)) hops.push({ x: p.cx, y: p.cy });
    const num3 = Math.min(20, 30 / hops.length); // :46455-46457
    let cx0 = this.cx, cy0 = this.cy, num4 = 0;
    const add = (el: unknown) => ents.add(el, 'projectiles');
    for (const h of hops) {
      const hx = h.x + (cx0 < h.x ? 20 : -20); // :46459-46462（X 向前偏 20px）
      const dx = hx - cx0, dy = h.y - cy0;
      const dist = Math.hypot(dx, dy);
      let num6 = Math.min(num3, 4 + Math.ceil(dist / 50)); // :46463-46468
      if (num6 < 5) num6 = 5;
      add(new TigerPounce(cx0, cy0, dx, dy, dmg0, () => this.ownerRef(), -num4 * 4, num6 * 4)); // :46470
      cx0 = hx; cy0 = h.y;
      num4 += num6; // :46473-46474
    }
    this.x = cx0 - this.w / 2; this.y = cy0 - this.h / 2; // base.Center = vector2（:46475）
    this.vx = this.vy = 0;
    this.tigerA0 = 4; this.tigerA1 = num4; // ai[0]=4 / ai[1]=总时长（:46476-46477）
    return true;
  }

  /** 帕鲁地面随从 1112 可靠的捣蛋猫 / 1118 黏土蓓蕾（AI_067 flag8/flag9 分支折算，
   *  Projectile.cs:50014-52160；1093 同 flag8 段共用——本仓 1093 暂走通用飞行近似，
   *  并入随其审计项）。判定盒本仓统一 16×16（原版 14×22 :10368-10377/:10478-10487）。
   *  · 态机 ai[0]：0 地面跟随+索敌（num2=800/500 :50030/:50052，Minion_FindTargetInRange
   *    skipIfCannotHitWithOwnBody=true :50496-50504 → 视线门）→ 距敌侧翼点 <20px 入
   *    扑击 ai[0]=2（:51166-51177 num30=20）；2 扑击（friendly=true 才有接触伤
   *    :50444 置 false/:50904 置 true，帧 3-6 :50912，1112 追敌悬浮 PingPong
   *    :50920-50926，ai[1]==num10-1 减速 :50905-50910）；1 归位（flag8 特例=瞬移
   *    主肩硬锚 MountedCenter+(-8dir,-24) :50841-50853，主落地退出 :50686-50692；
   *    flag9 常规飞行 :50636-50712）；5 Boss>600px 追击（:51152-51158）——flag8/9
   *    无目标检索档（flag16 :50505-50508 仅 0/2）→ 次 tick 即自清（:50957-50962），
   *    净效果 0 tick，不折算
   *  · 跟随锚（:50285-50310）：主中心 -(30|24+w/2)×dir - 组序×20×dir；Y 落地扫描
   *    20 格 + 视线截断 + 距离钳（:51204-51260）；归位门 = 距主>500 或 |dy|>300
   *    （num3/num4 :50031-50033）
   *  · 移动档（:51296-51340）：无目标 0.5/4/4；有目标 flag8=0.3/6/6（1112=9/12/9
   *    :51310-51313）、flag9=0.2/3/3；主速更快 → 0.7/主速（:51342-51345）；重力
   *    0.4 封顶 10（:51553-51557）；跳梯 -5.1/-7.1/-9.1/-10.1/-11.1（:51470-51490）
   *    + 目标高出距离表 -6..-16（:51492-51527，TryJumpingToTarget flag8 段
   *    :51126-51151 高差>100 起跳 sqrt(2×0.4h)+1 封顶 26）
   *  · 帧（:51742-51840）：立 0（抚摸 13/16）/ 走 7-12|8-14（fc+=|vx|+1>10 翻页）/
   *    空中 1（下落 2）/ 扑击 3-6|3-7；接触伤冷却 9/30（localNPCHitCooldown
   *    :10375/:10483）
   *  · 未折算：ai[0]=3 帮工意图（TryAssigningHelp :52208 依赖 IntentionGuesser
   *    智能光标系统，本仓无）、HitIntention 采掘（:52167 同门）、抚摸 Joy 音
   *    （petting 未接随从族）、湿身 vy×2（:51545 wet 判定链未接） */
  private palGroundStep(game: GameHooks, p: Player, dmg0: number): void {
    const flag8 = this.projId === 1112;
    const num10 = flag8 ? 16 : 30;            // 扑击时长（:50490/:50499）
    const num2 = flag8 ? 800 : 500;           // 索敌射程（:50030/:50052）
    // ---- ai[0]==1 归位（:50636-50853；先于地面段——原版该态不索敌不行走）----
    if (this.palA0 === 1) {
      const dpx1 = p.cx - this.cx, dpy1 = p.cy - this.cy;
      const pSpd1 = Math.abs(p.vx) + Math.abs(p.vy);
      if (flag8) {
        // 主肩硬锚（:50841-50853）：Center=MountedCenter+(-8dir,-24)、速度清零；
        // 主落地退出（:50686-50692 num21<200 且 vy==0 → ai[0]=0）
        this.x = p.cx - p.facing * 8 - this.w / 2;
        this.y = p.cy - 24 - this.h / 2;   // MountedCenter = 玩家中心（p.cy）
        this.vx = 0; this.vy = 0;
        this.facing = p.facing;
        if (p.vy === 0) { this.palA0 = 0; this.palA1 = 0; }
        return;
      }
      // flag9 常规飞行（:50636-50712）：tileCollide=false、加速 0.2、限速 10/主速
      const sp = Math.max(10, pSpd1);
      const dl = Math.hypot(dpx1, dpy1) || 1;
      if (dl > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.h / 2; } // :50660-50662
      else {
        this.vx += Math.max(-0.3, Math.min(0.3, dpx1 / dl * sp - this.vx)); // :50722-50752 acc 0.2（反向 ×1.5 补）
        this.vy += Math.max(-0.3, Math.min(0.3, dpy1 / dl * sp - this.vy));
        if (Math.abs(dpx1) < 60) this.vx *= 0.9;
        this.x += this.vx; this.y += this.vy;
      }
      this.facing = this.vx !== 0 ? (this.vx > 0 ? 1 : -1) : p.facing;   // :50754-50756
      const st1 = game.world.store;
      if (Math.hypot(dpx1, dpy1) < 200 && p.vy === 0
        && this.y + this.h <= p.y + p.h
        && !st1.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16))) {
        this.palA0 = 0; this.palA1 = 0;                    // :50668-50676 落地净空退出
        if (this.vy < -6) this.vy = -6;
      }
      return;
    }
    // ---- 索敌（:50496-50508：ai[0]==0||2 才检索；视线门=skipIfCannotHitWithOwnBody）----
    const tgt = this.palA0 === 0 || this.palA0 === 2 ? this.nearestEnemy(game, num2, 'line') : null;
    // ---- ai[0]==2 扑击（:50901-50956）----
    if (this.palA0 === 2) {
      this.palA1--;                           // :50953
      if (this.palA1 === num10 - 1) {
        if (this.onGround) this.vx *= 0.1;    // :50905-50907（velocity.Y==0=贴地语义）
        if (flag8) { this.vx *= 0.1; this.vy *= 0.1; } // :50908-50910（1112 双轴刹）
      }
      // 1112 扑击追踪（:50920-50926）：敌心 + PingPong(ai1/num10)×-10 悬浮，20 速趋近
      if (flag8 && tgt) {
        const t = Math.max(0, Math.min(0.9999, this.palA1 / num10));
        const ping = t < 0.5 ? t * 2 : 2 - t * 2; // Utils.PingPongFrom01To010 :246-256
        const tx = tgt.cx, ty = tgt.cy - ping * 10;
        const dx = tx - this.cx, dy = ty - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(20, d);
        this.vx = dx / d * step; this.vy = dy / d * step;
        this.facing = tx >= this.cx ? 1 : -1;
      }
      this.vy = Math.min(this.vy + 0.4, 10);  // :50951-50953
      moveAndCollide(this, game.world, this.vx, this.vy);
      this.contact(game, dmg0, flag8 ? 9 : 30); // friendly=true 段（:50904）；冷却 :10375/:10483
      if (this.palA1 <= 0) { this.palA0 = 0; this.palA1 = 0; } // num9=0 → 直回 0（:50954-50956）
      return;
    }
    // ---- ai[0]==0：目标侧翼点 / 跟随锚（:51003-51199 与 :50285-50310）----
    let ax: number, ay: number;
    if (tgt) {
      // 侧翼点（:51020-51024）：敌近侧外 10px（num30=20），Y 钳敌盒内
      const side = tgt.cx > this.cx ? tgt.cx + 10 : tgt.cx - 10;
      ax = side;
      ay = Math.max(tgt.y + this.h / 2, Math.min(this.cy, tgt.y + tgt.h - this.h / 2));
      // 高差起跳（TryJumpingToTarget flag8 段 :51126-51151：下落中且敌高 100+ →
      // sqrt(2×0.4×h)+1 封顶 26）
      if (flag8 && this.vy > 1 && tgt.y + tgt.h - (this.y + this.h) < -100) {
        const h = (this.y + this.h) - (tgt.y + tgt.h);
        this.vy = -Math.min(26, Math.sqrt(Math.max(0, h) * 2 * 0.4) + 1);
        this.vx += (Math.random() * 2 - 1) * Math.random() * 5;
      }
      // 距敌 <20 → 入扑击（:51166-51177）
      if (Math.hypot(ax - this.cx, ay - this.cy) < 20) {
        this.palA0 = 2;
        this.palA1 = num10;
        this.facing = tgt.cx - this.cx > 0 ? 1 : -1; // :51175-51176
        return;
      }
    } else {
      // 跟随锚（:50285-50310 家族偏移；组序=同型在场序 minionPos 等价）
      const peers = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles
        .filter((m) => m instanceof MinionProj && !m.dead && m.projId === this.projId);
      const groupIdx = peers.indexOf(this);
      ax = p.cx - ((flag8 ? 30 : 24) + p.w / 2) * p.facing - groupIdx * 20 * p.facing;
      ay = p.cy;
      // 落地扫描（:51204-51212 最多 20 格）+ 视线截断（:51214-51224 5% 步进近似）
      const st = game.world.store;
      for (let k = 0; k < 20; k++) {
        if (st.isSolid(Math.floor(ax / 16), Math.floor(ay / 16))) break;
        ay += 16;
      }
      {
        const dx = ax - p.cx, dy = ay - p.cy;
        for (let t = 0.05; t <= 1.001; t += 0.05) {
          if (st.isSolid(Math.floor((p.cx + dx * t) / 16), Math.floor((p.cy + dy * t) / 16))) break;
          ax = p.cx + dx * t; ay = p.cy + dy * t;
        }
      }
    }
    // 归位门（:51199-51211）：距主 >500（num3）或 |dy|>300（num4）→ ai[0]=1
    const dpx = p.cx - this.cx, dpy = p.cy - this.cy;
    if (!tgt && (Math.hypot(dpx, dpy) > 500 || Math.abs(dpy) > 300)) {
      this.palA0 = 1;
      return;
    }
    // ---- 地面移动（:51212-51557）----
    const withTgt = tgt !== null;
    let acc = 0.5, vmax = 4, clamp = 4;               // :51296-51300 缺省档
    if (withTgt) {
      if (flag8) { acc = this.projId === 1112 ? 9 : 0.3; vmax = this.projId === 1112 ? 12 : 6; clamp = this.projId === 1112 ? 9 : 6; }
      else { acc = 0.2; vmax = 3; clamp = 3; }        // :51330-51334 flag9
    }
    const pSpd = Math.abs(p.vx) + Math.abs(p.vy);
    if (clamp < pSpd) { clamp = pSpd; acc = 0.7; }    // :51342-51345 主速 catch-up
    const dx = ax - this.cx;
    if (Math.abs(dx) > 5) {
      if (dx < 0) { this.vx -= this.vx > -vmax ? acc : 0.1; }
      else { this.vx += this.vx < vmax ? acc : 0.1; } // :51348-51362（num53=0.1 超速缓档）
    } else {
      this.vx *= 0.9;                                 // :51406-51410
      if (Math.abs(this.vx) < acc * 2) this.vx = 0;
    }
    this.vx = Math.max(-clamp, Math.min(clamp, this.vx));
    // 跳梯（:51424-51527）：flag20 跳跃意图档 flag8/9 恒 false（:51384-51387）——
    // 仅前方实心探测（num55≠0 且 flag21=|dx|>=64 ||（dy<=-48 且 |dx|>=8）:51424-51457）
    let jump = false;
    const dyA = ay - this.cy;
    const gate = Math.abs(dx) >= 64 || (dyA <= -48 && Math.abs(dx) >= 8);
    if (Math.abs(dx) > 5 && gate) {
      const st = game.world.store;
      const dir = Math.sign(dx);
      const col = Math.floor((this.x + this.w / 2) / 16) + dir + Math.round(this.vx);
      for (let row = Math.floor(this.y / 16); row <= Math.floor(this.y / 16) + this.h / 16 + 1; row++) {
        if (st.isSolid(col, row)) { jump = true; break; }   // :51448-51457
      }
    }
    this.vy = Math.min(this.vy + 0.4, 10);                  // :51553-51556（num=0.4，先加后移=原版 AI 末重力+Update 积分序）
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) {
      if (jump) {
        const st = game.world.store;
        const col = Math.floor((this.x + this.w / 2) / 16) + Math.sign(dx || 1);
        const row = Math.floor((this.y + this.h / 2) / 16);
        const solid = (oy: number) => st.isSolid(col, row + oy);
        if (!solid(-1) && !solid(-2)) this.vy = -5.1;       // :51470-51490
        else if (!solid(-2)) this.vy = -7.1;
        else if (solid(-5)) this.vy = -11.1;
        else if (solid(-4)) this.vy = -10.1;
        else this.vy = -9.1;
      }
      if (dyA < -48) {                                      // :51492-51527 目标高出距离表
        const d = -dyA;
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
    }
    // 朝向（:51558-51568：vx 定向，静止朝主）
    if (this.vx < 0) this.facing = -1;
    else if (this.vx > 0) this.facing = 1;
    else this.facing = p.cx > this.cx ? 1 : -1;
  }

  /** 阿比盖尔本体 963（aiStyle 62 前段 :62109-63100）：飞行近战，<50px 挥击
   *  （20t/敌）；伤害 ×(1+num9×(n-1))——1456 Projectile.cs:12116-12125：
   *  num9=0.55，Main.hardMode → 1.3（困难档不折半） */
  private abigailBody(game: GameHooks, p: Player, dmg0: number): void {
    const n = Math.max(1, this.peerCount(game, 970));
    // Main.hardMode（world.flags.hardMode；?. 防测试 mock 缺 flags）
    const num9 = game.world.flags?.hardMode === true ? 1.3 : 0.55; // :12119-12124
    const scale = 1 + num9 * (n - 1);
    // 索敌 700 + 视线门（:62372-62375 num12=700；:62455/:62477 963 走 Collision.CanHit 1×1）
    const tgt = this.nearestEnemy(game, 700, 'point');
    if (tgt) {
      const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
      const spd = d > 200 ? 7.4 : d > 50 ? 5.4 : 0; // 6+1.4n / 4+1.4n（n=1 档）
      this.vx = (tgt.cx - this.cx) / d * spd;
      this.vy = (tgt.cy - this.cy) / d * spd;
      if (d < 50) {
        // 挥击起手音（:62549 ai[0]==2 一拍一声；attackFlash 0→24 边沿等价）+ 随机哭声
        // （:62538 移动中 1/1500/t）——AbigailAttack 音量 0.35 / AbigailCry 0.4（SoundID.cs）
        if (this.attackFlash === 0) game.playSfxFiles(['abigail_attack'], 0.35, this.cx, this.cy);
        this.attackFlash = 24;
      }
      this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
      if (Math.hypot(this.vx, this.vy) > 0.1 && Math.random() < 1 / 1500) {
        game.playSfxFiles(soundTrackFiles('abigail_cry'), 0.4, this.cx, this.cy);
      }
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

  /** 乌鸦 317（aiStyle 54，AI :27383-27590 1:1）：同类 28px 内互推 0.05
   *  （:27397-27416）；归位门（:27422-27430）：曼哈顿 >num440（500；ai[1]≠0 扑击态
   *  或 friendly（冲刺帧）→ 1400）→ ai[0]=1。
   *  攻击态索敌 900 曼哈顿 + 视线（:27433-27485）；无目标 → 跟随玩家上方 60px
   *  （速 8/12，317 距>100 提速 12/15，velocity=(v×20+dir)/21 :27499-27536，
   *  >2000 瞬移 :27519-27522，<70 漂移 ×1.01 :27537-27540）；有目标 → 扑击循环
   *  （ai[1]==-1→17 倒数，归零后以 16/10 速冲向目标 :27557-27580，帧 4-7）。
   *  仅扑击中有接触伤（friendly 门 :27568/:27581），localNPCHitCooldown=10（:3836）；
   *  命中重置 ai[1]=-1（case 317 :12777-12780） */
  private ravenBody(game: GameHooks, p: Player, dmg0: number): void {
    // 同类分离（:27397-27416）
    const projs = (game as unknown as { entities: { projectiles: MinionProj[] } }).entities.projectiles;
    for (const m of projs) {
      if (m === this || !(m instanceof MinionProj) || m.dead || m.projId !== 317) continue;
      if (Math.abs(this.x - m.x) + Math.abs(this.y - m.y) < this.w) {
        this.vx += this.x < m.x ? -0.05 : 0.05;
        this.vy += this.y < m.y ? -0.05 : 0.05;
      }
    }
    // 归位门（:27422-27430）：num440=500；ai[1]≠0（扑击倒数/命中重置态）或
    // friendly（上一 tick 冲刺帧置位 :27547）→ 1400
    const num440 = this.rA1 !== 0 || this.rFriendly ? 1400 : 500;
    if (Math.abs(this.cx - p.cx) + Math.abs(this.cy - p.cy) > num440) this.rA0 = 1;
    // 索敌（仅 ai[0]==0：num439=900 曼哈顿 + CanHit 视线，:27433-27485）
    let tgt: EnemyLike | null = null;
    if (this.rA0 === 0) {
      let best = 900;
      for (const e of game.enemies()) {
        const en = e as EnemyLike;
        if (!playerCanHitEnemy(e, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
        if (en.dead) continue;
        const d = Math.abs(this.cx - en.cx) + Math.abs(this.cy - en.cy);
        if (d < best && canHit(game.world.store, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) {
          best = d; tgt = en;
        }
      }
    }
    if (!tgt) {
      // 跟随玩家上方 60px（:27501-27545）
      const dx = p.cx - this.cx, dy = p.cy - 60 - this.cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 100 && this.rA0 === 1) this.rA0 = 0; // :27512-27517（归位态近身回攻击态）
      if (dist > 2000) { this.x = p.cx - this.w / 2; this.y = p.cy - this.w / 2; } // :27519-27522
      let spd = this.rA0 === 1 ? 12 : 8;              // :27501-27503
      if (dist > 100) spd = this.rA0 === 1 ? 15 : 12; // :27524-27531（317 专属提速）
      if (dist > 70) {
        this.vx = (this.vx * 20 + (dx / dist) * spd) / 21; // :27533-27535
        this.vy = (this.vy * 20 + (dy / dist) * spd) / 21;
      } else {
        if (this.vx === 0 && this.vy === 0) { this.vx = -0.15; this.vy = -0.05; } // :27537-27539
        this.vx *= 1.01; this.vy *= 1.01;                                            // :27540
      }
      this.rot = this.vx * 0.05; // :27542
      this.ravenZone = 0;        // 帧 0-3（:27543-27549）
      if (Math.abs(this.vx) > 0.2) this.facing = -Math.sign(this.vx); // :27551-27553（spriteDirection=-direction）
      this.x += this.vx; this.y += this.vy;
      this.rFriendly = false; // :27519（跟随期收尾 friendly=false——下一 tick 归位门读此值）
      return; // friendly=false（:27544）——跟随期无接触伤
    }
    // 扑击循环（:27557-27590）
    if (this.rA1 === -1) this.rA1 = 17; // :27557-27559
    if (this.rA1 > 0) this.rA1--;
    let charging = false;
    if (this.rA1 === 0) {
      // 冲刺（friendly=true :27547-27580）：速 16，距<100 → 10；velocity=(v×14+dir)/15
      const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const spd = dist < 100 ? 10 : 16;
      this.vx = (this.vx * 14 + (dx / dist) * spd) / 15;
      this.vy = (this.vy * 14 + (dy / dist) * spd) / 15;
      charging = true;
      this.rFriendly = true; // :27547（冲刺帧 friendly=true）
    } else {
      this.rFriendly = false;           // :27566（倒数帧 friendly=false）
      if (Math.abs(this.vx) + Math.abs(this.vy) < 10) {
        this.vx *= 1.05; this.vy *= 1.05; // :27582-27585
      }
    }
    this.rot = this.vx * 0.05; // :27587
    this.ravenZone = 1;        // 帧 4-7（:27588-27594）
    if (Math.abs(this.vx) > 0.2) this.facing = -Math.sign(this.vx);
    this.x += this.vx; this.y += this.vy;
    if (charging && this.contact(game, dmg0, 10)) this.rA1 = -1; // 命中重置（:12777-12780）
  }

  /** 致命球 533 相位推进（AI_066 :28497-28689/:28741-28753/:28998-29039 1:1 折算）：
   *  0-2 待机 → 敌 <800 且冷却好 → 第 1-3 击入 6/7/8 冲刺（localAI[0]<3，:29029-29038）、
   *  每 3 击后入 4/5/3 蓄力（localAI[0]≥3 → ai[0]+=4（6→3）并清零，:29020-29028）；
   *  3-5 蓄力 ai[1]>16 → ai[0]-=3（:28624-28628）、6-8 冲刺 ai[1]>40/30/30 →
   *  ai[0]-=6 + localAI[0]++（:28658-28666）；距玩家 >1500 → ai[0]+=3×(3-⌊ai[0]/3⌋)
   *  入 9-11 归位（:28741-28753），<450 落位 ai[0]-=9（:28824-28834）；攻击间隔
   *  ai[1] 1→10 自增归零（:28958-28967） */
  private deadlySpherePhase(game: GameHooks, p: Player, tgt: EnemyLike | null): void {
    const distP = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    if (this.dA0 >= 3 && this.dA0 <= 5) {
      // 蓄力段（:28581-28629）：velocity×0.9/update + ai[1] 计时
      this.dA1++;
      this.vx *= 0.81; this.vy *= 0.81; // ×0.9 每 update ×2 update/tick
      if (this.dA1 > 16) { this.dA0 -= 3; this.dA1 = 0; } // :28624-28628（num564×8）
      return;
    }
    if (this.dA0 >= 6 && this.dA0 <= 8) {
      // 冲刺段（:28630-28685）：ai[1] 计时（6→40t、7/8→30t）
      this.dA1++;
      if (this.dA1 > (this.dA0 === 6 ? 40 : 30)) { this.dA1 = 1; this.dA0 -= 6; this.dLai0++; }
      return;
    }
    // 攻击间隔（:28958-28967）
    if (this.dA1 > 0 && ++this.dA1 > 10) this.dA1 = 0;
    // 归位落位（:28824-28834：距玩家 <450 且脚下非实心 → ai[0]-9 回待机）
    if (this.dA0 >= 9 && distP < 450
      && !game.world.store.isSolid(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) {
      this.dA0 -= 9;
    }
    // 距玩家过远 → 归位冲刺（:28735-28753：num574 = 有目标 1500 / 无目标 900）
    if (this.dA0 < 3 && distP > (tgt ? 1500 : 900)) {
      this.dA0 += 3 * (3 - Math.floor(this.dA0 / 3));
      return;
    }
    // 攻击触发（:29005-29038：ai[0]<9、冷却好、敌 <800）
    if (this.dA0 < 3 && this.dA1 === 0 && tgt) {
      if (Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) < 800) {
        this.dA1++;
        if (this.dLai0 >= 3) { this.dA0 += 4; if (this.dA0 === 6) this.dA0 = 3; this.dLai0 = 0; }
        else this.dA0 += 6;
      }
    }
  }

  /** 星尘守护者 623（套装奖励，AI_120_StardustGuardian :41969-42299 1:1）：
   *  ai[0] 状态机——0=贴身跟随（Lerp 0.05 至玩家侧后 -(5+w/2)×dir,-25，索敌 500
   *  （|Δx-锚|≤170 门 :42036-42039）， leash 步进 0.1 :42053-42068）→ 2=冲刺拳击
   *  （绕到目标背侧 npc-(dir×(w/2+70),-10)，velocity.MoveTowards(≤6×Remap(50..400,1..4),32)
   *  :42220-42225，每 4t 重锁 :42227-42238）→ 失去目标/超 500 回 0。
   *  状态 1/3 需 HasMinionRestTarget（:42079/:42250，本作无该系统——原版无目标时
   *  即刻回退 ai[0]=0 :42255-42257，故不实装）。
   *  命中仅状态 2：80×40 拳盒于 Center+direction×40（Colliding :14294-14300），
   *  localNPCHitCooldown=5（:6433）；伤害走 resolveWhipTagHit（623 是 minion） */
  private guardianBody(game: GameHooks, p: Player, dmg0: number): void {
    const add = (e: unknown) =>
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
    const restX = p.cx - (5 + p.w / 2) * p.facing; // :41995（(5+player.width/2)×direction）
    const restY = p.cy - 25;                        // :41996
    if (this.gA0 === 2) {
      // ---- 状态 2：冲刺拳击 ----
      const tgt = this.enemyById(game, this.gA1);
      const inRange = tgt && Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) <= 500; // :42203（Distance > num3=500 作废）
      const nearPlayer = Math.hypot(p.cx - this.cx, p.cy - this.cy) < 500;          // :42196（flag5）
      if (!tgt || !inRange || !nearPlayer) {
        this.gA0 = 0; this.gA1 = -1; // :42208-42212
        this.gFrame = 18;            // :42213-42216（收拳帧）
      } else {
        const dirX = tgt.cx - p.cx > 1 ? 1 : -1;    // :42220
        // :42221 目标位 = 敌心 + (-dirX×(敌宽/2+70), -10)
        const relX = tgt.cx - dirX * (tgt.w / 2 + 70) - this.cx;
        const relY = tgt.cy - 10 - this.cy;
        // :42222 maxAmount = 6×Remap(dist, 50→400, 1→4)
        const dist = Math.hypot(relX, relY);
        const maxAmt = 6 * remap01(dist, 50, 400, 1, 4);
        const dl = Math.hypot(relX, relY);
        const desX = dl <= maxAmt ? relX : relX / dl * maxAmt; // MoveTowards(Zero, rel, maxAmt)
        const desY = dl <= maxAmt ? relY : relY / dl * maxAmt;
        // :42224-42225 velocity.MoveTowards(desired, 32)
        const vl = Math.hypot(desX - this.vx, desY - this.vy);
        if (vl > 32) { this.vx += (desX - this.vx) / vl * 32; this.vy += (desY - this.vy) / vl * 32; }
        else { this.vx = desX; this.vy = desY; }
        this.facing = dirX; // :42226
        this.x += this.vx; this.y += this.vy;
        // 每 4t 重锁 500 内最近敌（:42227-42238）
        if (++this.gRetarget >= 4) {
          this.gRetarget = 0;
          const nt = this.nearestEnemy(game, 500);
          if (nt) this.gA1 = nt.id;
        }
        // 攻击帧 12-19（12/13 快速、14 后保持 :42173-42191）
        if (this.gFrame < 12) this.gFrame = 12;
        const rate = this.gFrame === 12 || this.gFrame === 13 ? 8 : 3;
        if (++this.gFc >= rate) { this.gFc = 0; if (++this.gFrame >= 19) this.gFrame = 14; }
        // 拳盒命中（:14294-14300：状态 2 才有碰撞，80×40 @ Center+direction×40）
        for (const ent of game.enemies()) {
          if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
          const en = ent as never as EnemyLike & import('./WhipTag').WhipTagged;
          if (en.dead) continue;
          const bx = this.cx + this.facing * 40 - 40, by = this.cy - 20;
          if (en.x + en.w <= bx || en.x >= bx + 80 || en.y + en.h <= by || en.y >= by + 40) continue;
          if (!this.hitCd.ready(en.id, 5)) continue; // localNPCHitCooldown=5（:6433）
          const res = resolveWhipTagHit(en, dmg0, game, add, SUMMON_TAG_MUL[623] ?? 1, en.cx, en.cy,
            this.ownerRef());
          en.hurt(res.dmg, Math.sign(en.cx - this.cx) * this.knockback, -1, game, 0, false, 1); // 随从=单发弹语义(不设敌方帧)
          applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
          this.attackFlash = 24;
        }
      }
      return;
    }
    // ---- 状态 0：贴身跟随 + 索敌 ----
    this.x += (restX - this.cx) * 0.05; // :42022 Lerp(Center, vector, 0.05)
    this.y += (restY - this.cy) * 0.05;
    this.vx *= 0.5; this.vy *= 0.5;     // :42023
    this.facing = p.facing;             // :42024
    if (++this.gFc >= 9) { this.gFc = 0; if (++this.gFrame >= 8) this.gFrame = 0; } // :42025-42032
    let tgt: EnemyLike | null = null;
    if (Math.abs(this.cx - restX) <= 170) tgt = this.nearestEnemy(game, 500); // :42036-42043（num+20 门 / num2=500）
    if (tgt) {
      const dirX = tgt.cx > this.cx ? 1 : -1; // :42047
      this.facing = dirX;
      const num6 = Math.abs(restX - this.cx);
      const num7 = Math.abs(tgt.cx - this.cx);
      const num8 = Math.abs(restY - this.cy);
      const num9 = Math.abs(tgt.cy - (this.y + this.h)); // npc.Y - Bottom
      const dirY = tgt.cy > this.y + this.h ? 1 : -1;
      // X leash（:42053-42056）：锚内或反向 且 20<|Δx|<150-锚偏+100 → 步进 0.1，否则衰减
      if ((num6 < 150 || (restX - this.cx) * dirX < 0) && num7 > 20 && num7 < 150 - num6 + 100) {
        this.vx += 0.1 * dirX;
      } else this.vx *= 0.7;
      // Y leash（:42061-42064，num4=100）
      if ((num8 < 100 || (restY - (this.y + this.h)) * dirY < 0) && num9 > 10 && num9 < 100 - num8 + 10) {
        this.vy += 0.1 * dirY;
      } else this.vy *= 0.7;
      if (num7 < 500) { this.gA0 = 2; this.gA1 = tgt.id; } // :42069-42073（num3=500 → 冲刺）
    }
    this.x += this.vx; this.y += this.vy; // 标准位移（velocity 持续衰减）
  }

  /** 接触伤害通用（pad=判定盒外扩）；鞭 tag + TagCrit + proc 统一走 resolveWhipTagHit
   *  （TagEffectState.ModifyHit :216-228 / OnHit :230-243，含黑收成 OnTaggedHit 与
   *  火鞭/星陨/花瓣/月主弹 proc 首跳）。返回是否命中过（乌鸦命中重置扑击计时） */
  private contact(game: GameHooks, dmg: number, cd: number, pad = 0): boolean {
    const add = (e: unknown, b: string) =>
      (game as unknown as { entities: { add: (x: unknown, y: string) => void } }).entities.add(e, b);
    let anyHit = false;
    for (const e of game.enemies()) {
      if (!playerCanHitEnemy(e, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const en = e as never as EnemyLike & import('./WhipTag').WhipTagged & {
        hurtFx?: (d: number) => void;
      };
      if (en.dead) continue;
      if (!(this.x - pad < en.x + en.w && this.x + this.w + pad > en.x
        && this.y - pad < en.y + en.h && this.y + this.h + pad > en.y)) continue;
      if (!this.hitCd.ready(en.id, cd)) continue;
      // 黑收成 OnTaggedHit 直伤通道（916 等价）
      en.hurtFx = (d: number) => { en.hurt(d, Math.sign(en.cx - this.cx), -1, game); };
      const res = resolveWhipTagHit(en, dmg, game,
        (el) => add(el, 'projectiles'), SUMMON_TAG_MUL[this.projId] ?? 1, en.cx, en.cy,
        this.ownerRef());
      // 圣殿骑士背包 6176（accGolemSentryBackpack :12963-12967）：sentry/SentryShot
      // 命中 10% 强制暴击（×2,与 TagCrit 暴击同通道）
      let golemCrit = false;
      const gOwn = this.ownerRef();
      if (this.sentry && gOwn?.equipStats.accGolemSentryBackpack && Math.random() < 0.1) golemCrit = true;
      // 击退 = 武器 kb×0.5（本作接触系数）+ minionKB 加算（GetWeaponKnockback :52477-52482：
      // 大力士甲虫/纸莎草 +2——首版聚合了 equipStats.minionKB 但漏消费，终审补接；
      // buff 段 = 醉酒 +1 :11520 / 饥饿 -0.5 / 极饿 -1 :11570/:11594，2026-08-20 饥饿链补）
      const owner0 = this.ownerRef();
      const o0 = owner0 as unknown as { equipStats?: { minionKB?: number }; buffs?: { minionKbBonus?: number } } | null;
      const mkb = (o0?.equipStats?.minionKB ?? 0) + (o0?.buffs?.minionKbBonus ?? 0);
      const pen0 = ((owner0 as unknown as { equipStats?: { armorPen?: number } } | null)?.equipStats?.armorPen ?? 0)
        + (projectileData(this.projId)?.armorPenetration ?? 0); // StrikeNPC :12068:玩家AP+弹幕AP 两源
      en.hurt(golemCrit ? res.dmg * 2 : res.dmg,
        Math.sign(en.cx - this.cx) * (this.knockback + mkb), 0, game, pen0); // 裸kb+minionKB(:52477)——0.5 自造已摘
      applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
      this.attackFlash = 24;
      anyHit = true;
    }
    return anyHit;
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

  /** 生成不占槽实体（计数器派生本体/守护者）。
   *  1457 UpdateAbigailStatus/UpdateStormTigerStatus（Player.cs:12380/:12421）：
   *  本体重生弹 knockBack 由 0f → 继承 projectile2.knockBack（计数器 kb）——
   *  本仓 spawnBody 恒传 this.knockback（计数器出生即持法杖 kb,Game 'summon'
   *  分支 spawnMinion 传 cw.knockback）→ 1457 语义已天然满足 */
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
    // 帕鲁三件出场淡入（SetDefaults alpha=255：1112 :10377/1113 :10400/1118 :10485）
    this.alphaFade = projId === 1112 || projId === 1113 || projId === 1118 ? 255 : 0;
  }

  /** 按 id 取敌（AI_120 ai[1] 目标槽 :42198-42207 等价） */
  private enemyById(game: GameHooks, id: number): EnemyLike | null {
    if (id < 0) return null;
    for (const e of game.enemies()) {
      const en = e as EnemyLike;
      if (!en.dead && en.id === id) return en;
    }
    return null;
  }

  /** 最近敌人（无目标 null）。鞭 tag 优先（原版随从锁定被鞭标记目标：
   *  Projectile.ApplyTag → npc.whipSet/whipTime，随从 TargetSlot 优先取 tag 敌）。
   *  sight：AI_062 族视线门（1456 :62434 CanHitLine 盒线 / :62455/:62477 963 走
   *  Collision.CanHit 中心 1×1）——'none' 缺省无门（其余 AI 族各自语义） */
  private nearestEnemy(game: GameHooks, maxRange: number,
    sight: 'none' | 'line' | 'point' = 'none'): EnemyLike | null {
    const p = this.ownerRef();
    if (!p) return null;
    let best: EnemyLike | null = null;
    let bestD = maxRange;
    let tagged: EnemyLike | null = null;
    let taggedD = maxRange;
    // 鞭 tag 查询走玩家栈（1457 TagEffectStack——敌实体不再存 tag 态）
    const stack = p.tagEffectStack;
    for (const e of game.enemies()) {
      const en = e as never as EnemyLike & { dead: boolean };
      if (!playerCanHitEnemy(e, game)) continue;   // CanBeChasedBy :91070——友好 NPC 不入索敌（防追踪睡渔夫）
      if (!en || en.dead) continue;
      const d = Math.hypot(en.cx - this.cx, en.cy - this.cy);
      if (d < bestD) {
        // 视线门不过 = 非候选（:62434/:62477 CanHitLine/CanHit 内联于候选判定）
        if (sight === 'line' && !canHitLine(game.world.store, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) continue;
        if (sight === 'point' && !canHit(game.world.store, this.cx, this.cy, 0, 0, en.cx, en.cy, 0, 0)) continue;
        bestD = d; best = en;
      }
      if (stack.anyTagged(en.id) && d < taggedD) { taggedD = d; tagged = en; }
    }
    // 右键集火优先（OwnerMinionAttackTargetNPC 模板 :27431：有效且距本随从 <900；
    //  AI_062 集火同样过视线门 :62417/:62455）
    const focus = (p as unknown as { minionTargetId?: number }).minionTargetId ?? -1;
    if (focus >= 0) {
      for (const e of game.enemies()) {
        const en = e as never as EnemyLike;
        if (!en.dead && en.id === focus && Math.hypot(en.cx - this.cx, en.cy - this.cy) < 900) {
          if (sight === 'line' && !canHitLine(game.world.store, this.x, this.y, this.w, this.h, en.x, en.y, en.w, en.h)) break;
          if (sight === 'point' && !canHit(game.world.store, this.cx, this.cy, 0, 0, en.cx, en.cy, 0, 0)) break;
          return en;
        }
      }
    }
    return tagged ?? best;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    this.age++;
    if (this.attackFlash > 0) this.attackFlash--;
    // ---- 族专属召唤音（生成后首帧起按 at 节拍各一次，见 MINION_SUMMON_SFX 注） ----
    const summonSfx = MINION_SUMMON_SFX[this.projId];
    if (summonSfx) {
      for (const st of summonSfx) {
        if (st.at === this.age) game.playSfxFiles(soundTrackFiles(st.track), st.vol, this.cx, this.cy);
      }
    }
    // 帕鲁出场淡入（DoPalAppearEffect :39509-39515：alpha -= 15/tick，17t 全显）
    if (this.alphaFade > 0) this.alphaFade = Math.max(0, this.alphaFade - 15);
    if (this.projId === 653) { this.companionCubeStep(game); return; }
    if (this.sentry) {
      if (--this.life <= 0) { this.dead = true; return; }
      // 落地（AI_130 尾部 :65420：tileCollide=true + velocity.Y += 0.2）
      this.vy = Math.min(this.vy + 0.2, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, 0, this.vy);
      const owner = this.ownerRef();
      // 随从/哨兵伤害：武器基伤 × summonDamageMult（live 刷新，换装即时生效，
      // Projectile.cs:15368 语义）+ 护甲穿透（对随从弹幕生效 :12068）
      const dmgOf = () => Math.max(1, Math.round(this.damage * (owner ? owner.summonDamageMult : 1))); // ⑥ pen 移 hit 时
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
            game.playSfxFiles(soundTrackFiles('dd2_flameburst_tower_shot'), 0.9, this.cx, this.cy); // AI_131 :65536（弹幕首帧）
            const mx = this.cx + this.facing * 6, my = this.y + this.h - 46; // 炮口（:65316）
            let vx = this.facing * 9, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
              vx = ((tgt.cx - mx) / d) * 9; vy = ((tgt.cy - my) / d) * 9;
            }
            // 668 烈焰弹 16×16（SetDefaults）→ 炮口 − 8（曾 -5 偏 3px）
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(mx - 8, my - 8, vx, vy, dmgOf(), this.knockback, 668, null, { grav: 0.2 }), { whipTagShot: true }),
              'projectiles');
          }
          if (++this.sFireT >= 24) { this.sFire = 0; this.sCool = 60; } // num6*num7=24、num8=60
        }
        return;
      }
      // 弩车族（AI_134）：帧 0 待机 → 帧表 1-5（每 5t）→ 第 12t 弩箭 680（速 16）
      // → 25t 结束 → 冷却 GetBallistraShotDelay
      if (BALLISTA_TOWER.has(this.projId)) {
        // 1457 :69599-69609（1456 :65607-65617 ai[1]=0）:落位首帧 ai[1]=shotDelay——
        // 放置后不再立即射第一箭,先等满一档装填（160/100/60/30）
        if (this.sInit === 0) {
          this.sInit = 1;
          this.sCool = ballistraShotDelayOf(game.player);
        }
        if (this.sFire === 0) {
          const tgt = this.nearestEnemy(game, 900);
          if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
          if (tgt && this.sCool <= 0) { this.sFire = 1; this.sFireT = 0; }
          if (this.sCool > 0) this.sCool--;
        } else {
          if (this.sFireT === 12) {
            const tgt = this.nearestEnemy(game, 900);
            game.playSfxFiles(soundTrackFiles('dd2_ballista_tower_shot'), 0.9, this.cx, this.cy); // AI_134 :65674（开火帧同弩箭）
            // 原版瞄准与出弹都从本体 Center（:65590 center=base.Center → :65693
            // NewProjectile(center)；680 弩箭 16×16 → 左上 = Center−8。曾误把
            // (cx, y+20) 当左上角传 → 弹心恒偏右下半格+炮口近似高度）
            let vx = this.facing * 16, vy = 0;
            if (tgt) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
              vx = ((tgt.cx - this.cx) / d) * 16; vy = ((tgt.cy - this.cy) / d) * 16;
            }
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              // 680 弩箭：AI_001 默认档（0.1@15 缓坠）——重力缺省走规格链（2026-08-14 对账）
              Object.assign(new Arrow(this.cx - 8, this.cy - 8, vx, vy, dmgOf(), this.knockback, 680, null), { whipTagShot: true }),
              'projectiles');
          }
          if (++this.sFireT >= 25) { this.sFire = 0; this.sCool = ballistraShotDelayOf(game.player); }
        }
        return;
      }
      // 闪电光环族（AI_137_LightningAura :65910-66060 1:1）：非射击场伤——
      // 落地后一次性测净空：脚下找地面（下搜 500 格）、头顶找天花板（上搜 num=10 格），
      // 边长 = 净空px 截断 [num5×16=64, num×16=160] 再 ×2（:65953-65978，width=height
      // 封顶 999）——即以塔为中心的方形光环场（64~320px），不再是固定 4 格盒。
      // 每 tick 接触判定（Colliding :14537-14553：方形盒相交 + 距中心 < height/2-20 +
      // AI_137_CanHit 视线），localNPCHitCooldown=3（:7055）→ 每 3t 一跳
      if (AURA_TOWER.has(this.projId)) {
        if (this.sInit === 0) {
          this.sInit = 1;
          const st = game.world.store;
          const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
          let groundY = -1;
          for (let y = ty; y < Math.min(st.h, ty + 500); y++) { // Searches.Down(500)
            if (st.inBounds(tx, y) && st.isSolid(tx, y)) { groundY = y; break; }
          }
          if (groundY < 0) { this.y += 16; return; } // 无地面（:65948-65952）
          let ceilY = -1;
          for (let y = groundY - 1; y >= groundY - 10; y--) { // Searches.Up(num=10)
            if (y >= 0 && st.inBounds(tx, y) && st.isSolid(tx, y)) { ceilY = y; break; }
          }
          if (ceilY < 0) ceilY = ty - 11; // :65956-65958（无天花板 → origin-num-1）
          const centerY = groundY * TILE; // result.ToWorldCoordinates(8f, num6)（半砖 +8 未实装）
          const topY = ceilY * TILE;      // result2.ToWorldCoordinates(8f, 0f)
          let side = centerY - topY;      // :65970 base.Size = (1, center.Y - top.Y)
          side = Math.max(64, Math.min(160, side)); // :65972-65977 [num5×16, num×16]
          side *= 2;                      // :65978 height *= 2（width=height，封顶 999）
          this.auraSide = Math.min(999, side);
          this.auraCy = centerY; // base.Center = center（:65980）
        }
        const side = this.auraSide;
        if (side > 0) {
          let zapped = false;   // 电弧音（:65947 场内有敌 DD2_LightningAuraZap）按伤害节拍播
          for (const ent of game.enemies()) {
            if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
            const en = ent as EnemyLike & { dead: boolean } & import('./WhipTag').WhipTagged;
            if (en.dead) continue;
            const ax = this.cx - side / 2, ay = this.auraCy - side / 2;
            // myRect.Intersects(targetRect)（方形场盒）
            if (en.x + en.w <= ax || en.x >= ax + side || en.y + en.h <= ay || en.y >= ay + side) continue;
            // targetRect.Distance(Center) < height/2-20（:14540，敌 AABB 到中心最近点距）
            const nx = Math.max(en.x, Math.min(en.x + en.w, this.cx));
            const ny = Math.max(en.y, Math.min(en.y + en.h, this.auraCy));
            if (Math.hypot(this.cx - nx, this.auraCy - ny) >= side / 2 - 20) continue;
            // AI_137_CanHit（:67170-67195）：塔顶+20 到敌中心的视线（两次弧线绕行未实装）
            if (!canHit(game.world.store, this.cx, this.auraCy - 20, 0, 0, en.cx, en.cy, 0, 0)) continue;
            if (!this.hitCd.ready(en.id, 3)) continue; // localNPCHitCooldown=3（:7055）
            zapped = true;
            // 命中 armorPenetrationPercent=1（100% 护穿，:12443——penPercent 通道
            // 2026-08-13 接通）;tag 伤 ×SummonTagDamageMultiplier 0.5（ProjectileID.cs:31）
            const res = resolveWhipTagHit(en, dmgOf(), game,
              (el) => (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(el, 'projectiles'),
              SUMMON_TAG_MUL[this.projId] ?? 1, en.cx, en.cy, this.ownerRef());
            en.hurt(res.dmg, 0, 0, game, 0, false, 1, false, 1); // 哨兵射击=单发弹语义;penPercent=1(:12443)
            applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
          }
          // 原版是 tracked 循环声（每 tick 场内有敌即续播）——单次 wav 按命中节拍近似，
          // 每 tick 至多一声
          if (zapped) game.playSfxFiles(soundTrackFiles('dd2_lightning_aura_zap'), 0.5, this.cx, this.auraCy);
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
            game.playSfxFiles(soundTrackFiles('dd2_explosive_trap_explode'), 0.9); // AI_138 :66104（无位置参数）
            // 原版塔体 691/692/693 生成【爆炸弹】694/695/696（AI_138 :66063-66073）,
            // StatusNPC 走爆炸弹型号——Oiled 门在 694 族(:10786,setHuntressT2 套装门)
            const boomProj = 694 + (this.projId - 691);
            const ownerH = (this.ownerRef() as unknown as { equipStats?: { huntressT2?: boolean } } | null)
              ?.equipStats?.huntressT2 ?? false;
            let boom = 0;
            for (const ent of game.enemies()) {
              if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
              const en = ent as EnemyLike & { dead: boolean };
              if (en.dead) continue;
              if (Math.abs(en.cx - ecx) < 72 + en.w / 2 && Math.abs(en.cy - ecy) < 72 + en.h / 2) {
                en.hurt(dmgOf(), Math.sign(en.cx - this.cx) * this.knockback, -2, game, 0, false, 1); // 单发弹语义
                applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
                applyProjStatus(boomProj, en as unknown as Record<string, number>, { setHuntressT2: ownerH });
                boom++;
              }
            }
            void boom;
            game.spawnParticles(ecx, ecy, '#FFB040', 18, 4, { life: 36 });
            game.playSfx('explosion', 1, this.cx, this.cy);
          }
        }
        return;
      }
      // aiStyle 53 定点哨兵三族（Projectile.cs:27172-27382 1:1）：
      // 初冷 ai[0]=120 → 锁定目标转向（瞄准扇区 num424 :27258-27279）→
      // ai[0]≤0 开火（射速 60/60/90，弹速 9/9/12.5，:27282-27311）→ ai[0] 每 tick 递减
      const s53 = SENTRY53[this.projId];
      if (s53) {
        if (this.sInit === 0) { this.sInit = 1; this.sCool = 120; } // localAI[0]==0 → ai[0]=120（:27176-27181）
        const tgt = this.nearestEnemy(game, 1000); // AI_053_HandleSentryNPCTargeting maxDistance=1000
        let sector = 2;
        if (tgt) {
          const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
          if (dx < 0) this.facing = -1; else this.facing = 1; // :27264-27268
          // 瞄准扇区（:27269）：dy>0→0；|dy|>|dx|×3→4；×2→3；|dx|≤|dy|×3→（|dx|>|dy|×2→1，否则 2）；否则 0
          sector = dy > 0 ? 0
            : Math.abs(dy) > Math.abs(dx) * 3 ? 4
              : Math.abs(dy) > Math.abs(dx) * 2 ? 3
                : Math.abs(dx) > Math.abs(dy) * 3 ? 0
                  : Math.abs(dx) > Math.abs(dy) * 2 ? 1 : 2;
        }
        if (tgt && this.sCool <= 0) {
          this.sCool = s53.cd; // :27282-27288（num427=60，966→90）
          // 炮口偏移（:27290-27347）：966 flag24 分支 zero 保持 (0,0)=本体中心；
          // 308/377 按扇区，朝左再 +10X（!flag24 && spriteDirection<0 :27351-27354）
          let ox = 0, oy = 0;
          if (this.projId !== 966) {
            switch (sector) {
              case 0: ox = 24 * this.facing; oy = 12; break;
              case 1: ox = 24 * this.facing; oy = 0; break;
              case 2: ox = 24 * this.facing; oy = -2; break;
              case 3: ox = 14 * this.facing; oy = -6; break;
              default: ox = 2 * this.facing; oy = -14; break;
            }
            if (this.facing < 0) ox += 10;
          }
          const mx = this.cx + ox, my = this.cy + oy;
          const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
          const shotSfx = MINION_SHOT_SFX[s53.shot];
          if (shotSfx) game.playSfxFiles(soundTrackFiles(shotSfx.track), shotSfx.vol, this.cx, this.cy);
          // 出弹锚点 = 炮口 − 弹型判定盒/2（:27357 vector34=Center+zero；
          // 309/967 = 14×14、378 = 16×16——曾写死 -5 偏 2-3px）
          const sp53 = projectileData(s53.shot);
          const s53hw = (sp53?.width ?? 10) / 2, s53hh = (sp53?.height ?? 10) / 2;
          const s53life = sp53?.timeLeft ?? 1200;
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            Object.assign(new Arrow(mx - s53hw, my - s53hh, ((tgt.cx - mx) / d) * s53.speed, ((tgt.cy - my) / d) * s53.speed,
              dmgOf(), this.knockback, s53.shot, null, { grav: 0, life: s53life }), { whipTagShot: true }), // SentryShot 吃鞭 tag（ProjectileID.cs:199）
            'projectiles');
        }
        if (this.sCool > 0) this.sCool--; // :27377-27380（目标有无均递减）
        return;
      }
      // 其他哨兵（aiStyle 123：月门/彩虹水晶）
      const ss = SENTRY_SHOOT[this.projId];
      if (ss) {
        const tgt = this.nearestEnemy(game, 1000);
        if (tgt) this.facing = tgt.cx >= this.cx ? 1 : -1;
        if (tgt && this.sCool <= 0) {
          this.sCool = ss.cd;
          // 炮口（641 月门 = 本体 Center :33993；643 彩虹水晶走 volley 落点分支）
          const mx = this.cx;
          const my = this.cy;
          if (ss.volley) {
            // 彩虹水晶 643：3 连目标区随机落点（:34005——距离越远散布越大 0.5-1.25×）
            for (let i = 0; i < ss.volley; i++) {
              const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy) || 1;
              const spread = 0.1 + 0.65 * Math.max(0, Math.min(1, (800 - Math.min(800, d)) / 600));
              const px = tgt.cx + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              const py = tgt.cy + (Math.random() - 0.5) * 2 * (20 + spread * 60);
              // 644 是原地爆裂弹（零速生成,短时引爆）→ 落点直接 AoE
              for (const ent of game.enemies()) {
                if (!playerCanHitEnemy(ent, game, this.projId)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
                const en = ent as EnemyLike & { dead: boolean };
                if (en.dead) continue;
                if (Math.abs(en.cx - px) < 14 + en.w / 2 && Math.abs(en.cy - py) < 14 + en.h / 2) {
                  en.hurt(dmgOf(), Math.sign(en.cx - px) * this.knockback, -2, game, 0, false, 1); // 单发弹语义
                  applyProjStatus(this.projId, en as unknown as Record<string, number>, { catalystBand: this.ownerRef()?.equipStats.catalystBand }); // StatusNPC(:10555)+6185 催化指环 398
                }
              }
              game.spawnParticles(px, py, `hsl(${Math.floor(Math.random() * 360)},90%,65%)`, 8, 2.4, { life: 26 });
            }
          } else {
            const d = Math.hypot(tgt.cx - mx, tgt.cy - my) || 1;
            // 641 月门原版锚点 = 本体 Center（:33993），642 传送门弹 18×18 → −9
            // （曾 mx-5 写死 + 锚点 -2 近似 → 弹心偏移半格）
            (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
              Object.assign(new Arrow(mx - 9, my - 9, ((tgt.cx - mx) / d) * ss.speed, ((tgt.cy - my) / d) * ss.speed,
                dmgOf(), this.knockback, ss.shot, null, { grav: 0 }), { whipTagShot: true }),
              'projectiles');
          }
        }
        if (this.sCool > 0) this.sCool--;
        return;
      }
      // 其余哨兵兜底（当前武器表内无使用者——aiStyle 53/123/130/134/137/138 全覆盖；
      //  数值沿用 aiStyle 53 默认：初冷 120、射速 60，:27176-27181/:27286）
      const tgt = this.nearestEnemy(game, 600);
      if (tgt) {
        if (this.sInit === 0) { this.sInit = 1; this.shootCd = 120; }
        this.shootCd--;
        if (this.shootCd <= 0) {
          this.shootCd = 60;
          const ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
            Object.assign(new Arrow(this.cx - 5, this.cy - 5, Math.cos(ang) * 6, Math.sin(ang) * 6, dmgOf(), this.knockback, this.projId, null), { whipTagShot: true }),
            'projectiles');
        }
      }
      return;
    }
    // 随从
    const p = this.ownerRef();
    if (!p) { this.dead = true; return; }
    // 索敌射程分档（1456 AI_062 :62362-62375）：num12 缺省 400 → 无条件覆盖 2000
    // （=射手族档，423/613 的 300 覆盖同为死赋值）、963=700；其余 AI 族沿用旧近似
    // （AI_026 俾格米 800 等在 MINION_SHOOT 表注）。射手族/963 加视线门（:62434/
    //  :62455-62477——407/613/423 与 373/375 走 CanHitLine，963 走 CanHit 1×1）
    const ai62 = AI62_SHOOTERS.has(this.projId);
    const tgt = ai62 ? this.nearestEnemy(game, 2000, 'line')
      : this.nearestEnemy(game, MINION_SHOOT[this.projId]?.search
        ?? (MINION_SHOOT[this.projId] ? 1000 : 700));
    // 基础伤害（每 tick 按当前装备 live 重算 = Projectile.cs:15368；+armorPen）
    const dmg0 = Math.max(1, Math.round(this.damage * p.summonDamageMult)); // ⑥ pen 移 hit 时
    // ---- 旗舰家族分发（源码行号见各方法注释；先于通用运动）----
    if (this.projId >= 626 && this.projId <= 628) { this.dragonSegment(game, p, dmg0); return; }
    if (this.projId === 625) { this.dragonHead(game, p, dmg0); return; }
    if (this.projId === 831 || this.projId === 970) { this.counterHover(game, p, dmg0); return; }
    if (this.projId >= 833 && this.projId <= 835) { this.tigerBody(game, p, dmg0); return; }
    if (this.projId === 963) { this.abigailBody(game, p, dmg0); return; }
    if (this.projId === 623) { this.guardianBody(game, p, dmg0); return; }
    if (this.projId === 317) { this.ravenBody(game, p, dmg0); return; }
    if (this.projId === 533) this.deadlySpherePhase(game, p, tgt); // AI_066 相位机（自旋门 :28874）
    // Cool Whip 雪花哨兵 917（buff 312 维持）与 Cobwhip 蜘蛛 1036（buff 365 维持）：
    // 独立索敌 400/环绕，伤害吃 summonDamageMult
    // Foxparks 1094/1113 喷火态（PR:56081-56159 / 1457 :60064-60135：ai[0] 1000-1003
    // 每 4t 一发 1106；伤 = dmg（1456 :56133 ×0.75 → 1457 :60068 全额）×命中 0.85
    // (:12620)；OnFire 300t(:11002)；penetrate 4；寿命 72t/54t 后不伤——Arrow 无
    // extraUpdates，速度×3/life÷3 等价换算。1113 弹速 num17=10.5（:60074，1094=5）
    // → ×3=31.5；idStaticNPCHitCooldown=10（:60100）两型同）
    if ((this.projId === 1094 || this.projId === 1113) && this.foxChannel) {
      // 1456 :56111-56120（flag8=1094 喷火态）：direction=spriteDirection=
      // (velocity.X>0?1:-1)（vx==0 → player.direction :56112-56115）→
      // :56120 spriteDirection=-direction——喷火朝向反向贴图
      this.facing = -(Math.sign(this.foxAimX) || p.facing);
      if (++this.foxT % 4 === 1) {
        const flameSpd = this.projId === 1113 ? 31.5 : 15; // num17 ×3 补偿（:60072/:60074）
        const flame = new Arrow(this.cx - 3, this.cy - 3, this.foxAimX * flameSpd, this.foxAimY * flameSpd,
          Math.max(1, Math.round(dmg0 * 0.85)), 0, 1106, null,
          { grav: 0, life: 24, pierce: 4 });
        flame.ignite = true; // 命中 OnFire 300t（PR:11002-11004）
        // 喷火嘶声（Projectile.cs:38958）：1106 弹 whoAmI%3==0 才播——三发一门近似；
        // FoxparksFlame=Item_34 音量 0.15（SoundID.cs:1073）
        if ((this.foxFlameN = (this.foxFlameN + 1) % 3) === 1) {
          game.playSfxFiles(['Item_34'], 0.15, this.cx, this.cy);
        }
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(flame, 'projectiles');
      }
      return; // 喷火态跳过常规索敌/移动（position 锚玩家由 Game/悬停链处理近似）
    }
    // ---- 1457 禁戒魂灵 1119（6164 Forbidden Minion,aiStyle 206）----
    // AI_206_ForbiddenMinion（Projectile.cs:38182-38395）1:1 折算：
    //  · 悬停锚 = player.Top+(−dir×16,−25) + 群体环形偏移（:38195-38220,本仓
    //    slot 槽位近似 index/total）；距玩家 >2000 瞬移（:38194）
    //  · 索敌 800px + CanHitLine 门（:38199 Minion_FindTargetInRange + :38177
    //    CustomEliminationCheck）；有敌 → 朝敌 MoveTowards(200) + rotation 朝敌
    //  · 开火循环 ai[0]：归零且索敌 → 150;倒数到 120 发 1120 ForbiddenMinionShot
    //    （GemStaffFeatures FastThenSlow 位,32 速朝敌）+ 反冲 velocity=−dir×0.3
    //    （:38258-38277）;>120 段移速 ×Remap(ai0,150,120,1,0) 渐停（:38282-38286）
    if (this.projId === 1119) {
      const tgtF = this.nearestEnemy(game, 800);
      // 悬停锚（:38196 vec = player.Top + (−dir×16,−25) + 群体偏移）
      const orbA = this.age * 0.03 + this.slot * 1.7;
      let hx = p.cx - p.facing * 16;
      let hy = p.cy - p.h / 2 - 25 + Math.sin(orbA) * 10;
      if (tgtF) {
        // :38236-38244 朝敌 MoveTowards(200)+朝向/旋转
        const dx = tgtF.cx - this.cx, dy = tgtF.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        hx = tgtF.cx - dx / d * Math.max(0, d - 120);
        hy = tgtF.cy - dy / d * Math.max(0, d - 120);
        this.facing = tgtF.cx > this.cx ? 1 : -1;
        this.rot = Math.atan2(dy, dx) + (this.facing === -1 ? Math.PI : 0);
      } else {
        this.rot = 0;
        this.facing = p.facing;
      }
      // 开火循环（:38258-38286）：shootCd 复用 ai[0] 语义（150 归零→150;120 出弹）
      if (this.shootCd > 0) this.shootCd--;
      if (tgtF && this.shootCd === 0) this.shootCd = 150;
      if (tgtF && this.shootCd === 120) {
        const dx = tgtF.cx - this.cx, dy = tgtF.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const shot = new Arrow(this.cx - 5, this.cy - 5, dx / d * 32, dy / d * 32,
          Math.max(1, Math.round(dmg0)), this.knockback, 1120, null,
          { grav: 0, life: 300, pierce: 2, gem: { fastThenSlow: true } });
        shot.whipTagShot = true;   // MinionShot（ProjectileID.Sets.MinionShot[1120] :291）
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
        this.vx = -dx / d * 0.3 * 32;   // :38276 velocity = −vector5×0.3（vector5=32 速向）
        this.vy = -dy / d * 0.3 * 32;
      }
      // 移动（:38282-38289）：v MoveTowards(锚向×16, 2);开火后段渐停
      const mdx = hx - this.cx, mdy = hy - this.cy;
      const mdl = Math.hypot(mdx, mdy) || 1;
      const spd = 16 * (this.shootCd > 120
        ? Math.max(0, 1 - (this.shootCd - 120) / 30) : 1);
      const tvx = mdx / mdl * Math.min(spd, mdl), tvy = mdy / mdl * Math.min(spd, mdl);
      this.vx += Math.max(-2, Math.min(2, tvx - this.vx));
      this.vy += Math.max(-2, Math.min(2, tvy - this.vy));
      this.x += this.vx; this.y += this.vy;
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 2000) {   // :38194 瞬移门
        this.x = p.cx; this.y = p.cy - 40;
      }
      this.contact(game, dmg0, 30);   // localNPCHitCooldown 30（:10452-10464）
      return;
    }
    // ---- 1457 帕鲁地面随从 1112/1118（6148/6161，AI_067 flag8/flag9 折算）----
    if (this.projId === 1112 || this.projId === 1118) { this.palGroundStep(game, p, dmg0); return; }
    if (this.projId === 917 || this.projId === 1036) {
      // 生命与玩家 buff 绑定（AI_177 :42468：coolWhipBuff/cobWhipBuff → timeLeft=2 续命）
      if (!p.whipBuffs[this.projId === 917 ? 312 : 365]) { this.dead = true; return; }
      // 917 雪花 wobble：rotation = vx*0.0125（AI_177 :42571 旋转制不翻转）
      if (this.projId === 917) this.rot = this.vx * 0.0125;
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
      this.contact(game, dmg0, 20); // armorPen 30（:9494）由 contact 内 pen0 两源通道结算
      return;
    }
    if (!this.ground) {
      // 飞行：无目标 → 环形槽位悬停玩家侧后；有目标 → 俯冲
      if (tgt) {
        const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 5;
        this.vy = (dy / d) * 5;
      } else if (this.projId === 387 || this.projId === 388) {
        // 双子专属悬停（AI_66 :28790-28860）：锚点 = 玩家中心+(0,-60)；距锚
        // >70px 才有阻尼趋近（v=(v×15+dir×spd)/16，spd 跟随玩家速度链），≤70px
        // 【无任何驱动力】——这是互斥自由区，±0.05/t 的互推累积把两眼分开到
        // 曼哈顿 ~40px 并保持（通用槽位硬弹簧会压回互斥，曾致两眼恒叠）
        const hx = p.cx, hy = p.cy - 60;
        const dx = hx - this.cx, dy = hy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 70) {
          const spd = Math.max(15, Math.abs(p.vx) + Math.abs(p.vy));   // :28806-28814
          this.vx = (this.vx * 15 + (dx / d) * spd) / 16;
          this.vy = (this.vy * 15 + (dy / d) * spd) / 16;
        } else if (this.vx === 0 && this.vy === 0) {
          this.vx = -0.15; this.vy = -0.05;                            // :28846-28849
        }
        if (Math.hypot(this.vx, this.vy) > 15) { this.vx *= 0.95; this.vy *= 0.95; }  // :28853-28856
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
      // 双子互斥（AI_66 :28514-28539）：同主另一只双子（387/388）曼哈顿距 <
      // 判定盒宽(40) → 双轴速度各互推 ±0.05/t——原版两只眼不叠在一起的本体机制。
      // 精确同位（成对出生同点）时按 id 决胜一侧，防对称死锁（原版靠浮点噪声散开）
      if (this.projId === 387 || this.projId === 388) {
        for (const ent of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
          const o = ent as MinionProj;
          if (!(o instanceof MinionProj) || o === this || o.dead) continue;
          if (o.projId !== 387 && o.projId !== 388) continue;
          if (o.ownerRef() !== p) continue;                  // 同主
          if (Math.abs(this.x - o.x) + Math.abs(this.y - o.y) >= this.w) continue;
          const ltx = this.x < o.x || (this.x === o.x && this.id < o.id);
          const lty = this.y < o.y || (this.y === o.y && this.id < o.id);
          this.vx += ltx ? -0.05 : 0.05;
          this.vy += lty ? -0.05 : 0.05;
        }
      }
      this.x += this.vx;
      this.y += this.vy;
      // 回收（1456 AI_062 :62786-62790：num35>2000 → 瞬移回玩家中心；曾写 >1300）
      if (Math.hypot(this.cx - p.cx, this.cy - p.cy) > 2000) {
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
    // 朝向（AI_062 :62983-62990：velocity.X>0 → spriteDirection=-1——贴图朝左，
    // 右行才翻转 = facing 取 -sign(vx)；963 阿比盖尔特判 ×-1 自带朝右贴图已在其
    // 专属分支）。原版在移动后的 FindFrame 取 velocity——故置于移动段之后。
    // AI_026/164 族（俾格米/宝宝史莱姆/蜘蛛/计数器/Foxparks）零 spriteDirection
    // 赋值恒不翻——渲染端 MINION_NO_FLIP 表承接
    {
      const dirX = Math.sign(this.vx);
      if (dirX !== 0) this.facing = AI62_LEFT_ART.has(this.projId) ? -dirX : dirX;
    }
    // 旋转制族：双子 387/388 rotation = velocity.ToRotation()+π（:28859-28861/
    // :28864-28868——贴图朝左 +π 补偿；387 交战中朝 LOS 目标 :28867）；
    // 533 致命球滚动 rotation += vx*0.04——仅 ai[0]<3 || ≥9（:28874-28877，
    // 3-8 冲刺段不自旋，相位机见 deadlySpherePhase）
    if (this.projId === 387 || this.projId === 388) {
      let ang = Math.atan2(this.vy, this.vx);
      if (this.projId === 387 && tgt
        && canHit(game.world.store, this.x, this.y, this.w, this.h, tgt.x, tgt.y, tgt.w, tgt.h)) {
        ang = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
      }
      this.rot = ang + Math.PI;
    } else if (this.projId === 533) {
      if (this.dA0 < 3 || this.dA0 >= 9) this.rot += this.vx * 0.04;
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
          // 出弹锚点 = 本体 Center + 表内 muzzleY（NewProjectile @Center，:28977-
          // 38981/:63209；俾格米/Foxparks AI_026 有 -8/-10 手部高度 :58764/:58784）
          // → 弹体左上角 = 锚点 − 弹型判定盒/2（曾写死 -5 按 10×10 假设：389 激光
          // 4×4 → 恒偏左上 3px；376 火球 12×12/614 细胞弹 16×16 各有偏差）
          const ps = projectileData(shooter.shot);
          const hw = (ps?.width ?? 10) / 2, hh = (ps?.height ?? 10) / 2;
          const ay0 = this.cy + (shooter.muzzleY ?? 0);
          const shot = new Arrow(this.cx - hw, ay0 - hh, (ax / al) * shooter.speed, (ay / al) * shooter.speed,
            dmg, this.knockback, shooter.shot, null, { grav: shooter.grav ?? 0, life: shooter.life ?? 1200 });
          shot.whipTagShot = true; // MinionShot 吃鞭 tag（WhipTagEffect.cs:73-84）
          // 1097 火球命中按生成侧 ai[1] 分档（Projectile.cs:11315-11318）：ai[1]>0 →
          // OnFire3(323) 300-600t / 否则 OnFire(24)——1094 ai[1]=0 恒火、1113 ai[1]=3/1
          // 地狱火（:62744-62752 num159）
          if (shooter.burn === 'fire') shot.ignite = true;
          else if (shooter.burn === 'hellfire') shot.igniteHellfire = true;
          const shotSfx = MINION_SHOT_SFX[shooter.shot];
          if (shotSfx) game.playSfxFiles(soundTrackFiles(shotSfx.track), shotSfx.vol, this.cx, this.cy);
          (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(shot, 'projectiles');
        }
      }
    }
    // 接触伤害（tag + TagCrit 语义见 contact()）。同型静态免疫冷却按弹型：
    // 双子 387=16t / 388=12t（idStaticNPCHitCooldown :4436/:4451——激光眼也有
    // 近身接触伤，非纯远程；388 另有 25 穿甲由 contact 内弹型数据通道自动带）；
    // 其余随从沿用 20t 近似
    this.contact(game, dmg0, this.projId === 387 ? 16 : this.projId === 388 ? 12 : 20);
    // 玩家死亡/过远不消失（原版随从持续到上限驱逐或卸装）——仅跟随
    void TILE;
  }

  /** 同伴方块 653（AI_067 的 light-pet 路径,Projectile.cs 1:1）：
   *  · 生命期（:46657-46662）：buff 191 活 → 续命；玩家死/无 buff → 消失
   *  · 特殊段（:46804-46860）：rot+=vx/20；岩浆内 lai0++（≥20 且尖叫冷却归零 →
   *    NPCDeath59/61 叫一声,冷却 3600t）；全黑（自身+玩家格光照 <0.15）lai1++ 否则
   *    递减（钳 -3600..120）；超过阈值 且玩家静止/无无敌 → 1/5 尖叫(Item16)否则
   *    捅人 Hurt(3, ByOther(6)) + 无敌帧清零（免疫穿透）——死因 DeathText.Stabbed
   *  · 跟随（:47407+/47055+）：vector=玩家中心；>300px 或 |dy|>300 → ai0=1 悬浮直飞
   *    （tileCollide=false,加速 0.2,近主 <200 且主落地且头顶净空 → 回地面态）；
   *    地面态：贴主（|dx|<150 摩停下,rot→0）否则水平加速 0.5/上限 4(玩家速钳制),
   *    |vx|>3 触发跳跃,目标高出 48px 按距离表起跳（-6..-16）,湿身 vy×2 */
  private companionCubeStep(game: import('./types').GameHooks): void {
    const owner = this.ownerRef();
    const w = game.world;
    const st = w.store;
    // ---- 生命期（:46657-46662 companionCube 旗= buff 191）----
    if (!owner || owner.dead || !owner.buffs.has(BuffType.CompanionCube)) { this.dead = true; return; }
    this.w = 30; this.h = 30; // SetDefaults（:6733-6741）

    // ---- 特殊段（:46804-46860）----
    this.cubeRot += this.vx / 20;
    if (MinionProj.cubeScreamCd > 0) MinionProj.cubeScreamCd--;
    // 岩浆计数（:46812-46827）
    const cti = st.idx(Math.floor(this.cx / 16), Math.floor(this.cy / 16));
    if (st.liquid[cti] > 0 && st.liquidType[cti] === 2) this.cubeLai0++;
    else this.cubeLai0--;
    this.cubeLai0 = Math.max(0, Math.min(20, this.cubeLai0));
    if (this.cubeLai0 >= 20 && MinionProj.cubeScreamCd === 0) {
      MinionProj.cubeScreamCd = 3600;
      game.playSfxFiles([Math.random() < 0.1 ? 'NPC_Killed_61' : 'NPC_Killed_59'], 1, this.cx, this.cy);
    }
    // 黑暗捅人（:46835-46860——仅本地玩家侧）----
    const lit: { c: number; p: number } = (() => {
      const lg = (game as unknown as { lighting?: { lightAt: (tx: number, ty: number) => [number, number, number] } | null }).lighting;
      if (!lg) return { c: 1, p: 1 }; // 无光照引擎(探针)视作亮,不触发
      const at = (wx: number, wy: number) => {
        const [r, g, b] = lg.lightAt(Math.floor(wx / 16), Math.floor(wy / 16));
        return Math.hypot(r, g, b) / 255; // Lighting.GetColor().ToVector3().Length()
      };
      return { c: at(this.cx, this.cy), p: at(owner.cx, owner.cy) };
    })();
    if (lit.c < 0.15 && lit.p < 0.15) this.cubeLai1++;
    else if (this.cubeLai1 > 0) this.cubeLai1--;
    this.cubeLai1 = Math.max(-3600, Math.min(120, this.cubeLai1));
    const pSpeed = Math.abs(owner.vx) + Math.abs(owner.vy);
    if (this.cubeLai1 > 30 + Math.floor(Math.random() * 90) && owner.iframes <= 0 && pSpeed === 0) {
      if (Math.random() < 0.2) {
        game.playSfxFiles(['Item_16'], 1, this.cx, this.cy);
        this.cubeLai1 = -600;
      } else {
        game.playSfxFiles(['Item_1'], 1, this.cx, this.cy);
        owner.lastDamageCause = { kind: 'stabbed' };
        owner.damage(3, this.cx, this.cy, false);
        owner.iframes = 0; // :46857-46858 immune=false/immuneTime=0（穿透无敌）
        this.cubeLai1 = -300 - Math.floor(Math.random() * 30) * 10;
      }
    }

    // ---- 跟随核心（light-pet 族,flag12=false 路径）----
    let vx = this.vx, vy = this.vy;
    const pcx = owner.cx, pcy = owner.cy;
    const dpx = pcx - this.cx, dpy = pcy - this.cy;
    const distP = Math.hypot(dpx, dpy);
    if (distP > 2000) { // :47414 超远直传
      this.x = pcx - this.w / 2; this.y = pcy - this.h / 2;
      vx = 0; vy = 0;
    }
    // 目标（:46718 vector=player.Center;653 仅覆写 X=player.Center.X=同值）
    let tx = pcx, ty = pcy;
    if (this.cubeA0 === 0) {
      if (distP > 300 || Math.abs(dpy) > 300) { this.cubeA0 = 1; } // :47413 num3/num4=300
    } else {
      // ---- 悬浮归位态 ai0=1（:47050-47160）----
      // tileCollide=false；加速 0.2 逼近;近主 <200 且主落地且自身净空 → 回地面态
      if (distP < 200 && owner.vy === 0 && this.y + this.h <= owner.y + owner.h
        && !st.isSolid(Math.floor(this.cx / 16), Math.floor(this.cy / 16))) {
        this.cubeA0 = 0;
        if (vy < -6) vy = -6;
      }
      if (distP >= 60) {
        const num19 = Math.max(10, pSpeed);
        const spx = (dpx / (distP || 1)) * num19, spy = (dpy / (distP || 1)) * num19;
        const acc = 0.2, acc15 = acc * 1.5;
        if (vx < spx) { vx += acc; if (vx < 0) vx += acc15; }
        else if (vx > spx) { vx -= acc; if (vx > 0) vx -= acc15; }
        if (vy < spy) { vy += acc; if (vy < 0) vy += acc15; }
        else if (vy > spy) { vy -= acc; if (vy > 0) vy -= acc15; }
      } else {
        this.cubeLai0 = 0; // :47088 近主清零（与岩浆计数共用槽）
      }
      if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
      this.x += vx; this.y += vy;
      this.vx = vx; this.vy = vy;
      return;
    }
    // ---- 地面态 ai0=0（:47407+/47536+）----
    // 目标下探（:47458-47465 最多 20 格找地面）
    for (let k = 0; k < 20; k++) {
      if (st.isSolid(Math.floor(tx / 16), Math.floor(ty / 16))) break;
      ty += 16;
    }
    // 目标视线截断（:47468 TileCollision 5% 步进近似——遇实心停在墙前）
    {
      const dx = tx - pcx, dy2 = ty - pcy;
      let nx = pcx, ny = pcy;
      for (let t = 0.05; t <= 1.001; t += 0.05) {
        const sx = pcx + dx * t, sy = pcy + dy2 * t;
        if (st.isSolid(Math.floor(sx / 16), Math.floor(sy / 16))) break;
        nx = sx; ny = sy;
      }
      tx = nx; ty = ny;
    }
    const dtx = tx - this.cx, dty = ty - this.cy;
    const distT = Math.hypot(dtx, dty);
    // :47446 贴身且玩家更近 → 以自身为锚（防抖）
    if (distT < 32 && distP < distT) { tx = this.cx; ty = this.cy; }
    // 水平步进参数（:47496-47537 num34/35/36/37）
    let acc = 0.5, vmax = 4, clamp = 4, accSlow = 0.1;
    {
      const ps = Math.abs(owner.vx) + Math.abs(owner.vy);
      if (ps > 0 && ps < clamp) clamp = ps; // 653 特例（:47536-47543）
    }
    const num41 = tx - this.cx;
    let jumpGate = false;
    if (Math.abs(num41) < 150) { // 653 贴靠（:47589-47595）
      // rotation → 0（AngleTowards 0.2）
      this.cubeRot = angleTowards(this.cubeRot, 0, 0.2);
      vx *= 0.9;
      if (Math.abs(vx) < 0.1) vx = 0;
    } else if (Math.abs(num41) > 5) { // :47597-47610
      if (num41 < 0) { vx -= (vx > -vmax ? acc : accSlow); if (num41 < 0 && vx > 0) vx -= accSlow; }
      else { vx += (vx < vmax ? acc : accSlow); if (num41 > 0 && vx < 0) vx += accSlow; }
      if (Math.abs(vx) > 3) jumpGate = true; // :47695 653 跳跃门
    } else {
      vx *= 0.9;
      if (Math.abs(vx) < acc * 2) vx = 0;
    }
    vx = Math.max(-clamp, Math.min(clamp, vx));
    if (vx !== 0) this.facing = vx > 0 ? 1 : -1;
    // 重力 + 碰撞（tileCollide=true）
    vy = Math.min(vy + 0.3, MAX_FALL_SPEED);
    this.vx = vx; this.vy = vy;
    moveAndCollide(this, w, vx, vy);
    const onGround = this.onGround;
    if (onGround && vy === 0) {
      // 跳跃梯（:47751-47760 按 2/5 格上方障碍选 -5.1..-11.1）
      if (jumpGate) {
        const fx = Math.floor((this.x + this.w / 2) / 16) + this.facing + Math.round(vx);
        const fy = Math.floor((this.y + this.h / 2) / 16);
        const solid = (oy: number) => st.isSolid(fx, fy + oy);
        if (!solid(-1) && !solid(-2)) this.vy = -5.1;
        else if (!solid(-2)) this.vy = -7.1;
        else if (solid(-5)) this.vy = -11.1;
        else if (solid(-4)) this.vy = -10.1;
        else this.vy = -9.1;
      }
      // 目标高出 48px → 距离表起跳（:47765-47808）
      if (ty - this.cy < -48) {
        const d = -(ty - this.cy);
        this.vy = d < 60 ? -6 : d < 80 ? -7 : d < 100 ? -8 : d < 120 ? -9
          : d < 140 ? -10 : d < 160 ? -11 : d < 190 ? -12 : d < 210 ? -13
          : d < 270 ? -14 : d < 310 ? -15 : -16;
      }
    }
  }

  draw(r: import('../render/Renderer').Renderer): void {
    // 世界坐标绘制（Renderer 实体循环在世界变换内）——投射物贴图懒加载通道同 Arrow。
    // 原版投射物贴图是竖向多帧行（projFrames 表）：按帧高切片，1:1 像素尺寸。
    // 爆炸烈焰塔走 AI_130 帧状态机（待机帧 0 / 开火帧 1-6 每 4t），其余哨兵/随从
    // age/8 匀速循环；哨兵按 facing 翻转（原版 spriteDirection）
    const ctx = r.ctx;
    if (!ctx) return;
    const frames = projFrameCount(this.projId);
    let frame: number;
    if (this.projId === 623) {
      frame = this.gA0 === 2 ? this.gFrame : this.gFrame % 8; // AI_120：攻击 12-19 / 行走 0-7
    } else if (this.projId === 317) {
      // AI_054：4fc 循环（0-3 飞 / 4-7 扑，:27543-27594）
      frame = (this.ravenZone === 1 ? 4 : 0) + (Math.floor(this.age / 4) % 4);
    } else if (this.sentry && FLAMEBURST_TOWER.has(this.projId)) {
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
    // 帕鲁出场淡入（Projectile alpha 通道：绘制色 = 原色 × (255-α)/255——
    // DoPalAppearEffect 每 tick α-15，17t 全显 :39509-39515）
    if (this.alphaFade > 0) ctx.globalAlpha = Math.max(0, (255 - this.alphaFade) / 255);
    // ---- 原版偏移表消费（Main.cs:29375-29826 num143/144 + 通用绘制 :34040）----
    // 全型号统一走公式（2026-08-19 清零近似）：有表项用 num143/144,未登记 = 0/0
    // → 贴图左上角 = (盒左+num144, 盒上−num143) = 盒左上对齐（曾一律盒心居中近似,
    // 已废）。AI_026 族 spriteDirection 恒 −1（零赋值）→ 动态项 dirX=−1;
    // 旋转族(rotation)绕 anchor 旋转 = 原版 spriteBatch(anchor,origin,rotation) 同构
    const off3 = img ? (projDrawOffsetFor(this.projId, -1, this.h) ?? [0, 0, 0]) : null;
    const num145 = off3 && img ? (img.width + this.w) / 2 : 0;
    if (off3) ctx.translate(this.cx - this.w / 2 + num145 + off3[1], this.cy);
    else ctx.translate(this.cx, this.cy);
    ctx.imageSmoothingEnabled = false;
    // 旋转制族（双子/致命球/雪花/龙链/方块，MINION_ROT_ONLY）：rotation 绘制、
    // 恒不水平翻转（原版 dir=SpriteEffects.None）；翻转制族 spriteDirection=-1
    // 才翻（AI_026/164 族零赋值恒不翻，MINION_NO_FLIP）
    if (this.rot !== 0 || MINION_ROT_ONLY.has(this.projId)) ctx.rotate(this.rot);
    else if (this.facing < 0 && !MINION_NO_FLIP.has(this.projId)) ctx.scale(-1, 1);
    if (this.projId === 653) {
      // 同伴方块：SetDefaults scale=0.8（:6740）+ rotation 独立累计（cubeRot,
      // rotation+=vx/20——不走龙链 rot,直接套用）;34×34 单帧
      if (this.cubeRot !== 0) ctx.rotate(this.cubeRot);
      ctx.scale(0.8, 0.8);
    }
    if (img) {
      if (off3) ctx.drawImage(img, -num145, -(this.h / 2 + off3[0]), img.width, img.height);
      else ctx.drawImage(img, -img.width / 2, -img.height / 2);   // 贴图未就绪兜底(无偏移量可依)
    } else {
      // 兜底：召唤符记色块（哨兵紫 / 随从金）——贴图缺失或懒加载未就绪
      ctx.fillStyle = this.sentry ? '#B080FF' : '#FFD060';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(-8, -8, 16, 16);
    }
    // 755 血蝙蝠红晕（Main.cs:30669-30678）：AI_156_GetColor = Crimson(220,20,60)
    // α=120，沿旋转垂直向 4 向各偏 2px 叠画 4 层染色本体——"发红光"的视觉主体
    if (this.projId === 755 && img) {
      const halo = tintFrameCache(img, 'rgb(220,20,60)');
      if (halo) {
        ctx.globalAlpha = 120 / 255;
        for (let k = 0; k < 4; k++) {
          const off = this.rot + (Math.PI / 2) * k;
          ctx.save();
          ctx.translate(Math.cos(off) * 2, Math.sin(off) * 2);
          ctx.drawImage(halo, -halo.width / 2, -halo.height / 2);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}

/** 帧图整体染色缓存（755 红晕用：source-atop 填色剪影） */
const HALO_TINT = new Map<HTMLCanvasElement, HTMLCanvasElement>();
function tintFrameCache(src: HTMLCanvasElement, color: string): HTMLCanvasElement | null {
  let c = HALO_TINT.get(src);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const cx2 = c.getContext('2d');
  if (!cx2) return null;
  cx2.drawImage(src, 0, 0);
  cx2.globalCompositeOperation = 'source-atop';
  cx2.fillStyle = color;
  cx2.fillRect(0, 0, c.width, c.height);
  if (HALO_TINT.size > 64) HALO_TINT.clear();   // 帧图缓存换代会自然重建
  HALO_TINT.set(src, c);
  return c;
}

/**
 * 沙漠虎扑击弹 818（AI_162_TigerPounce :44056-44123 1:1）：
 *  132×132 判定盒（:7725-7726）、ai[0]<0 延迟隐身（每 update +1，extraUpdates=3 →
 *  每 tick 4 update :44058-44063）、起始点→(起始+velocity) 的 CatmullRom 弧线
 *  （垂度 y=距离×1.5，端点外扩 ±0.1 :44073-44078）、ai[0] += 1/ai[1] 每 update
 *  （:44090，时长 = ai[1]/4 tick）→ ai[0]≥1 消亡（:44119-44122）。
 *  伤害 ×(1.5+0.4×(宝石数-1))（:12107-12111）、每敌一次（localNPCHitCooldown=-1
 *  :7733）、818 ∈ MinionShot（ProjectileID.cs:197）→ 吃鞭 tag。
 */
export class TigerPounce extends Entity {
  w = 132; h = 132;
  dead = false;
  rot = 0;
  private damage: number;
  private ivx: number;
  private ivy: number;
  /** ai[0]：负=延迟计数 / 正=进度（0..1）；ai[1]：时长（update 数） */
  private a0: number;
  private a1: number;
  /** 起始中心（localAI[0]/[1] :44069-44070） */
  private sx = 0;
  private sy = 0;
  private started = false;
  /** Opacity（:44079-44082 每 update +0.1） */
  private op = 0;
  private hitSet = new Set<number>();
  private ownerRef: () => Player | null;

  constructor(
    x: number, y: number, vx: number, vy: number, damage: number,
    owner: () => Player | null, ai0: number, ai1: number,
  ) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.ivx = vx;
    this.ivy = vy;
    this.damage = damage;
    this.ownerRef = owner;
    this.a0 = ai0;
    this.a1 = ai1;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (this.a0 < 0) { this.a0 += 4; return; } // 延迟隐身（:44058-44063，Opacity=0）
    if (!this.started) { this.started = true; this.sx = this.cx; this.sy = this.cy; } // :44066-44072
    // CatmullRom 控制点（:44073-44078：端点 -0.1/+1.1 外扩，垂度 = 距离×1.5）
    const ex = this.sx + this.ivx, ey = this.sy + this.ivy;
    const sag = Math.hypot(this.ivx, this.ivy) * 1.5;
    const p1 = { x: this.sx + (ex - this.sx) * -0.1, y: this.sy + (ey - this.sy) * -0.1 + sag };
    const p4 = { x: this.sx + (ex - this.sx) * 1.1, y: this.sy + (ey - this.sy) * 1.1 + sag };
    if (this.op < 1) this.op += 0.4; // :44079-44082（4 update/tick 折算）
    this.rot += Math.sign(this.ivx) * -0.8; // :44083-44085（-0.2×4 update）
    if (this.a1 < 1) this.a1 = 60; // :44086-44089
    this.a0 += 4 / this.a1;        // :44090（每 update 1/ai[1]，4 update/tick）
    const t = Math.max(0, Math.min(1, this.a0));
    const pos = catmullRom(p1, { x: this.sx, y: this.sy }, { x: ex, y: ey }, p4, t);
    this.x = pos.x - this.w / 2;
    this.y = pos.y - this.h / 2;
    if (this.a0 >= 1) { this.dead = true; return; } // :44119-44122
    // 接触（Damage 全程可伤：Damage_CanDealDamage 仅 ai[0]<1 拦截 :11782，此处已过门）
    const gems = countStormTigerGems(game);
    const mul = 1.5 + 0.4 * Math.max(0, gems - 1); // :12107-12111
    const add = (e: unknown) =>
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(e, 'projectiles');
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const en = ent as never as EnemyLike & import('./WhipTag').WhipTagged & { hurtFx?: (d: number) => void };
      if (en.dead || this.hitSet.has(en.id)) continue; // localNPCHitCooldown=-1 每敌一次
      if (this.x >= en.x + en.w || this.x + this.w <= en.x
        || this.y >= en.y + en.h || this.y + this.h <= en.y) continue;
      this.hitSet.add(en.id);
      en.hurtFx = (d: number) => { en.hurt(d, 0, -1, game); };
      const res = resolveWhipTagHit(en, Math.max(1, Math.round(this.damage * mul)), game,
        add, SUMMON_TAG_MUL[818] ?? 1, en.cx, en.cy, this.ownerRef());
      en.hurt(res.dmg, 0, -1, game); // knockBack=0（:46470 生成传 0）
    }
    void this.ownerRef;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projFrameImg(818, 0);
    ctx.save();
    ctx.globalAlpha = this.op;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    if (img) ctx.drawImage(img, -img.width / 2, -img.height / 2);
    else {
      ctx.fillStyle = '#E8C060';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

/** 玩家持有沙漠虎宝石数（ownedProjectileCounts[831]，:12107/:46388 等价） */
function countStormTigerGems(game: GameHooks): number {
  let n = 0;
  for (const e of (game as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles) {
    const m = e as MinionProj;
    if (m instanceof MinionProj && !m.dead && m.projId === 831) n++;
  }
  return n;
}

/** MathHelper.AngleTowards（:47591 cubeRot 用）：向 target 步进 maxAngle（最短弧） */
function angleTowards(cur: number, target: number, maxAngle: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-maxAngle, Math.min(maxAngle, d));
  return cur + step;
}

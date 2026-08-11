// 敌人实体：统一类 + 按 key 分支行为（史莱姆/僵尸/恶魔眼/蝙蝠/克苏鲁之眼及其仆从）
// + 原版 NPC 数据驱动路径（vanillaId）：属性/AI/音效/贴图来自 vanilla-npcs.json（SetDefaults 提取）
import { Entity } from './Entity';
import { entityNet } from '../net/entitySyncHooks';
import { TILE_BY_KEY } from '../data/tiles';
import { liquidCollision } from '../stats/TouchDamage';
import { NPC_LAVA_IMMUNE } from '../data/npcLavaImmune';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { ENEMY_DEFS, EnemyDef } from '../data/enemies';
import { vanillaNpc, vanillaSoundName, type VanillaNpc } from '../data/vanillaNpcs';
import { GRAVITY, MAX_FALL_SPEED, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { Dart } from './Dart';
import { avoidWater } from './waterAvoid';
import { bindEnemyCtor, skeletronBossAI, skeletronHandAI, kingSlimeAI, brainOfCthulhuAI, creeperAI, twinsAI, skeletronPrimeAI, primePartAI, destroyerAI, spawnPart, addEnemy } from './bossAI';
import { wallOfFleshAI, wofEyeAI, hungryAI } from './bossAI_wof';
import { lunaticCultistAI, empressOfLightAI, queenSlimeAI, ancientLightAI, ancientDoomAI } from './bossAI_lategame';
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
  dd2LightningBugAI,
} from './bossAI_dd2';
import {
  moonLordFreeEyeAI, moonLeechAI, cultistTabletAI, lunaticDevoteeAI,
  cultistArcherStandbyAI, cultistArcherWake, phantomAI, bigMimicAI,
  mothronAI, mothronEggAI, babyMothronAI, graniteElementalAI,
} from './bossAI_lunar_misc';
import { RNG } from '../core/rng';
import { TOWER_KEY } from '../world/LunarEvent';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import type { ItemDrop } from './ItemDrop';
import {
  resolveDrops, rollCoins, rollHeartsAndStars, rollBossPotionsAndHearts,
  dropVelocity, npcValueOf, type NpcDropCtx,
} from '../drops/NpcDrops';

/** 无 key 映射的原版物品 id（一次性告警用） */
const UNMAPPED_WARNED = new Set<number>();
/** 有原生实现的原版物品 id → 原生 key（钱币=货币计数/凝胶火把晶状体=配方素材，
 *  必须走原生 def 而非 vi_ 占位注册） */
const NATIVE_DROP_KEY: Record<number, string> = {
  71: 'coin_copper', 72: 'coin_silver', 73: 'coin_gold', 74: 'coin_platinum',
  23: 'gel', 8: 'torch', 236: 'lens', 3: 'stone_block', 2: 'dirt_block', 9: 'wood',
  28: 'lesser_healing_potion',
};
/** 雕像产怪战利品门（NPCID.Sets，NPC.cs :79648-79654 NPCLoot 早退用） */
const STATUE_NO_EARLYMODE_LOOT = new Set([480, 82, 86, 170, 180, 171]);
/** DoesntDespawnToInactivity 名单（NPC.cs:78584-78641）中本批涉及的仪式/月总链类型——
 *  神秘石碑 437/忠实信徒 438/弓手 379,380（拜月仪式链条，离屏消失会断 439 召唤链）与
 *  月总游离眼 400（锚核心 398 生命周期，自身不参与离屏消散） */
const NO_DESPAWN_IDS = new Set([379, 380, 400, 437, 438]);
/** StatueSpawnedDropRarity（NPCID.cs:4795）：-1=不受限；≥0=按该概率整单出战利品 */
const STATUE_DROP_RARITY: Record<number, number> = {
  480: 0.05, 82: 0.05, 86: 0.05, 48: 0.05, 490: 0.05, 489: 0.05,
  170: 0.05, 180: 0.05, 171: 0.05, 167: 0.25, 73: 0.01, 24: 0.05,
  481: 0.05, 42: 0.05, 6: 0.05, 2: 0.05, 49: 0.2, 3: 0.2, 58: 0.2,
  21: 0.2, 65: 0.2, 449: 0.2, 482: 0.2, 103: 0.2, 64: 0.2, 63: 0.2, 85: 0,
};

/** 原版 Boss 头/主体 id（部件不标记:击杀部件不应出 Boss 退场流程）。
 *  EoC4/世吞13-15(头13 为 Boss,身14尾15 不标)/骷髅王35+手36/地牢守卫68/史莱姆王50/
 *  血肉墙113/双子125,126/骷髅Prime127/毁灭者134/蜂后222/石巨人245/世纪之花262/克脑266/
 *  猪鲨370/火星飞碟395(SetDefaults boss=true,:13993)/月总核心398/异教徒439/光皇636/
 *  史莱姆皇后657 */
const VANILLA_BOSS_IDS = new Set([4, 13, 35, 50, 68, 113, 125, 126, 127, 134, 222, 245, 262, 266, 370, 395, 398, 439, 636, 657,
  // 月事件 Boss（原版 NPCID.boss 族,SetDefaults boss=true）：哀木 325 / 南瓜王 327 /
  // 常绿尖叫怪 344 之外的三王——冰女王 345 / 圣诞坦克 346（血条/咆哮/击败记账）
  325, 327, 345, 346]);
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
  /** 雕像产怪（Wiring.cs:2480 SpawnedFromStatue）：value=0 不掉钱、
   *  肉前集合不掉战利品、StatueSpawnedDropRarity 概率门（NPCLoot :79648-79654） */
  spawnedFromStatue = false;
  /** 原版 NPC 全体走 Collision.StepUp（NPC.cs:54382） */
  stepUp = true;
  // ---- 蠕虫多段体（AI_006，NPC.cs:18046）：头 aiStyle 6，编号约定 头+1=身 头+2=尾 ----
  /** 链上紧随本段的一段（头 → 身×n → 尾） */
  wormNext: Enemy | null = null;
  /** 本段跟随的前一段（非空 = 本段是身体段，跳过 AI 只做跟随） */
  wormFollow: Enemy | null = null;
  /** 上一 tick 位置（段跟随用：段复制前一段的旧位置 = 经典贪吃蛇链） */
  prevX = 0; prevY = 0;

  /** AI_006 头部（L18645 通用常数 maxSpd=8 accel=0.07；穿墙直行；段链跟随） */
  private wormAI(game: GameHooks, player: Player | null) {
    // 玩家死亡（:51532-51539）：TargetClosest 落空 → EncourageDespawn(300) 缓慢消散
    // （EoW flag=false 不加速下钻——靠 despawn 系统离屏倒数收尾）
    if (!player) {
      this.encourageDespawn(300);
      this.vx *= 0.97; this.vy *= 0.97;
      this.x += this.vx; this.y += this.vy;
      this.visAngle = Math.atan2(this.vy, this.vx) + Math.PI * 0.5;
      return;
    }
    const maxSpd = 8, accel = 0.07;
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
      // friendly（被缚 NPC 等城镇系）与 critter 一样零接触伤害——原版 friendly 旗
      name: v.name, hp: v.lifeMax, damage: (v.critter || v.friendly) ? 0 : v.damage, defense: v.defense,
      // 原版 knockBackResist 是"承受击退的比例"（0.5=吃一半）；本仓库语义是
      // "抗性"（hurt(): resist<0.9 才生效，kbx*(1-resist)）→ 换算 1-比例
      knockbackResist: Math.max(0, Math.min(0.89, 1 - (v.knockBackResist ?? 0.5))),
      width: Math.round(v.width * (v.scale ?? 1)), height: Math.round(v.height * (v.scale ?? 1)), flying,
      boss: VANILLA_BOSS_IDS.has(id),
      nightOnly: v.aiStyle === 2 || v.aiStyle === 5, underground: false,
      mapColor: '#9A8FA0', gore: ['#9A8FA0', '#5E5566', '#C4BACC'],
      hitSound: [hit], killedSound: [kill], drops: [], // 掉落走 NpcDrops 规则树（击杀时求值，不再预展开）
      // 小动物：无接触伤害、不夜行
      ...(v.critter ? { damage: 0, nightOnly: false } : {}),
    };
    e.hp = v.lifeMax;
    e.maxHp = v.lifeMax;
    // 碰撞盒乘 npc.scale(NPC.cs:17747-17748 width/height=(int)(×scale))——
    // 史莱姆王/毁灭者 1.25、血肉墙 1.2:此前未乘,贴图放大了盒子没放大,
    // 判定区比视觉小一圈(与渲染 scale 不一致的"盒贴图不匹配"来源)
    const vScale = v.scale ?? 1;
    e.w = Math.round(v.width * vScale);
    e.h = Math.round(v.height * vScale);
    e.spawnAlpha = v.alpha ?? 0; // 原版 SetDefaults alpha（静态不透明度，NPC.Opacity=1-alpha/255）
    // EoW 族 alpha=255 = 出生全透明渐显标记（其余 alpha 为静态不透明度,勿动）：
    // 钳到 254 并置 alphaFade,由 fixedUpdate 逐 tick 减回 0（原版 AI_006 渐显）
    if (e.spawnAlpha >= 255) { e.spawnAlpha = 254; e.alphaFade = true; }
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
  /** 武器浸剂 debuff（R2，近战命中施加；单位=秒）
   *  DoT 对应 NPC.cs UpdateNPC_BuffApplyDOTs（lifeRegen/2 = HP/s）：
   *  poison lifeRegen-12→6HP/s(:92590)、venom -60→30(:92706)、cursed(onFire2) -48→24(:92690) */
  poisonT = 0;
  venomT = 0;
  cursedT = 0;
  poisonDoT = 0;
  venomDoT = 0;
  cursedDoT = 0;
  /** ichor(69)：受击时防御 -15（ArmorPenetration += 15 :92096） */
  ichorT = 0;
  /** midas(72)：掉钱 ×1.1-1.5（NPC.cs:80424） */
  midasT = 0;
  /** confused(31)：纳米药剂——AI 反向（近似：每秒翻转水平速度） */
  confusedT = 0;
  private confuseFlip = 0;
  /** 本 tick 实体点光（原版 Lighting.AddLight，Game 渲染前扫描落入光照引擎）；
   *  AI 每帧重写，null=不发光（萤火虫闪烁/发光蜗牛/魔化夜 crawler） */
  lightRGB: [number, number, number] | null = null;
  lai0 = 0;              // localAI 语义位（萤火虫：闪烁间隔计时）
  lai1 = 0;              // localAI 语义位（萤火虫：发光剩余帧）
  /** 原版 justHit 语义（本 tick 内受过击） */
  get justHit(): boolean { return this.justHitT > 0; }
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
    // 联机傀儡（房主权威快照驱动）：无本地 AI——P3.2 插值/外推推进 + 动画计时，
    // 打击/拾取等交互经 entityNet 上报房主结算
    if (this.netPuppet) {
      this.aiT++;
      this.animT++;
      this.netPuppetStep();
      this.onGround = Math.abs(this.vy) < 0.6;
      if (Math.abs(this.vx) > 0.05) this.walkCycleT += Math.abs(this.vx);
      if (this.iframes > 0) this.iframes--;
      return;
    }
    this.aiT++;
    if (this.iframes > 0) this.iframes--;
    if (this.justHitT > 0) this.justHitT--;
    this.lightRGB = null; // 点光由 AI 每帧重写（不残留上一帧状态）
    if (this.hpBarT > 0) this.hpBarT--;
    if (this.squash !== 0) this.squash *= 0.85;
    this.animT++;
    this.walkCycleT += Math.abs(this.vx); // 原版 zombie/fighter 行走帧按 |vx| 累加（L77072/L70216）

    // EoW 族出生渐显（每 tick alpha-1;原版 AI_006）——静态半透明不受影响
    if (this.alphaFade) {
      this.spawnAlpha = Math.max(0, this.spawnAlpha - 1);
      if (this.spawnAlpha === 0) this.alphaFade = false;
    }

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
          // AI_003 火星尾段（bossAI_martian.ts）：军官 383 带盾无敌/补盾、工程师 386 放炮塔
          if (this.vanillaId === 383 || this.vanillaId === 386) martianFighterExtras(this, game, p);
          break;                                                        // AI_003 战士族（原版通用核）
        // EoC 传参例外:玩家死亡也要传原对象(cs:19931 dead 判定走逃离分支,
        // 冲刺计时合法冻结;传 null 会让 aiT 照走、状态机停摆 → 首冲时长翻倍)
        case 4: this.eocAI(game, (game as unknown as { player: Player }).player ?? null); break; // AI_004 克苏鲁之眼（NPC.cs:19909）
        case 5: this.swarmerAI(game, p); break;                         // AI_005 噬魂怪族（原版蜂群核）
        case 6: this.wormAI(game, p); break;                           // AI_006 蠕虫族（头）
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
        case 41: this.herplingAI(game, p); break;                         // AI_041 赫柏林/德普林（cs:30017 低跳连扑；378 炸弹自爆略）
        case 44: this.flyingSwarmerAI(game, p); break;                    // AI_044 飞鱼/蚁狮蜂（cs:30999 分轴限速追+失视逃逸）
        case 56: this.dungeonSpiritAI(game, p); break;                    // AI_056 地牢之魂（cs:32915 穿墙0.99惯性追踪）
        case 26: this.chargerAI(game, p); break;                        // AI_026 独角兽/冲锋族（原版核）
        case 107: this.chargerAI(game, p, 1); break;                    // AI_107 ImprovedWalkers（0.07/±1.0 walker 档，NPC.145.cs:43153 引擎核同构）
        case 94: this.towerAI(game, p); break;                          // AI_094 星璇四塔（NPC.cs:41029-41443，核心 1:1）
        // ---- 星璇塔四组专属怪 AI 一期近似（docs/event-lunar-pillars.md §4）----
        // 74 穿心者（悬浮俯冲）→ AI_002 飘浮眼核；75 日耀骑手 → AI_003 战士核；
        // 85 星细胞/星云头蟹、95 小星细胞、96 水流入侵者、99 日耀耀斑（漂浮追击族）→ AI_005 蜂群核；
        // 97 星云悬浮脑（瞬移+弹幕）→ AI_008 法师核。二期按各自 AI_0XX 1:1 补齐
        // （74/75 已由火星批 bossAI_martian.ts 1:1 落位：388 无人机/418 Corite、
        //   390 骑手/392-394 飞碟部件/416 日耀骑手——见下方火星族分发）
        case 85: case 95: case 96: case 99: this.swarmerAI(game, p); break;
        case 97: this.casterAI(game, p); break;
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

    // 岩浆接触（NPC.cs:94520-94545）：30t 独立冷却（immune[255],不受普通受击 iframes 影响）,
    // onFire 7s + 50 直伤;lavaImmune 族（NPC_LAVA_IMMUNE,SetDefaults 提取）完全豁免
    if (this.vanillaId === null || !NPC_LAVA_IMMUNE.has(this.vanillaId)) {
      if (this.lavaCd > 0) this.lavaCd--;
      const inLava = liquidCollision(game.world.store, this.x, this.y, this.w, this.h, 2);
      if (inLava) {
        this.lavaWet = true;
        if (this.lavaCd <= 0) {
          this.lavaCd = 30;
          this.onFireT = Math.max(this.onFireT, 7); // AddBuff(24,420)
          this.hurt(50, 0, 0, game);                // StrikeNPCNoInteraction(50)
          game.spawnParticles(this.cx, this.cy, '#FF9A3C', 10, 1.6, { life: 30, grav: -0.05 });
        }
      } else {
        this.lavaWet = false;
      }
    } else {
      this.lavaWet = false;
    }
    // 入水熄灭 onFire（NPC.cs:94284 TryRemovingWaterPerishableEffects:水湿(非岩浆)→DelBuff 24）
    if (this.inWater && !this.lavaWet) this.onFireT = 0;
    // onFire DoT（NPC.cs:92619:lifeRegen-8 = 4 HP/s,无防御结算）+ 火尘粒子（:92187）
    if (this.onFireT > 0) {
      this.onFireT -= dt;
      this.onFireDoT += 4 * dt;
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

    // ---- 武器浸剂 debuff 滴血（R2，NPC.cs:92585/92697/92708 DoT 同 onFire 模式） ----
    if (this.poisonT > 0) { this.poisonT -= dt; this.poisonDoT += 6 * dt; }
    if (this.venomT > 0) { this.venomT -= dt; this.venomDoT += 30 * dt; }
    if (this.cursedT > 0) { this.cursedT -= dt; this.cursedDoT += 24 * dt; }
    for (const [tKey, dKey] of [['poisonT', 'poisonDoT'], ['venomT', 'venomDoT'], ['cursedT', 'cursedDoT']] as const) {
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
    if (this.confusedT > 0) {
      this.confusedT -= dt;
      // 纳米（confused 近似）：每 60t 翻转水平速度方向（原版 AI 反向 :29811）
      this.confuseFlip += dt;
      if (this.confuseFlip >= 1) { this.confuseFlip = 0; this.vx *= -1; }
    }

    // 接触伤害（带上攻击者引用，供荆棘反伤）。damage=0（小动物等友好生物）不触发——
    // 否则 damagePlayer(0) 仍会击退/闪红，表现为"兔子撞我有攻击性"
    if (hasPlayer && this.aabbOverlaps(player) && this.def.damage > 0) {
      game.damagePlayer(this.def.damage, this.cx, this.cy, this);
    }

    // Despawn 系统（原版 CheckActive, NPC.cs:78669-78798 + EncourageDespawn :7228-7235）：
    // timeLeft(activeTime=750) 屏内矩形每 tick 重置+清鼓励旗；离屏从当前值倒数，归零即消失。
    // EncourageDespawn(10) 封顶后离屏 ~10t 即消；屏内每 tick 被重置抵挡——
    // 僵尸/眼球白天游荡或上飞，一离屏就消失（原版天亮清夜怪的实际语义）。
    // Boss 默认豁免，但 despawnEncouraged（骷髅王离场/原版通用 EncourageDespawn）后
    // 同样倒数——且玩家死亡（player=null）时视为离屏（原版 CheckActive 不依赖玩家存活）
    if (this.vanillaId === 488 || (this.vanillaId != null && this.vanillaId in TOWER_KEY)
      || (this.vanillaId != null && NO_DESPAWN_IDS.has(this.vanillaId))) {
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
      if (dxp < TILE * 62 && dyp < TILE * 35) {
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
        }
      }
    }
  }

  /** 原版 EncourageDespawn(despawnTime)（NPC.cs:7228-7235）：timeLeft 封顶 + 置鼓励旗 */
  encourageDespawn(despawnTime: number): void {
    if (this.despawnTimer > despawnTime) this.despawnTimer = despawnTime;
    this.despawnEncouraged = true;
  }

  /** 敌怪弹幕发射辅助：从 (ox,oy) 朝 (tx,ty) 偏移方向以 speed 定速发射敌对 Dart */
  private shootDart(game: GameHooks, ox: number, oy: number, tx: number, ty: number, speed: number, dmg: number): void {
    const d = Math.hypot(tx, ty) || 1;
    (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities
      .add(new Dart(ox, oy, (tx / d) * speed, (ty / d) * speed, dmg), 'projectiles');
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
    // ai[0]==-999：风气球挂载冻结（NPC.cs:61441 帧0不行动，位置由气球驱动）
    if (this.ai0 === -999) return;
    const st = game.world.store;
    const underground = this.cy / TILE > game.world.groundLevel;
    const grasshopper = this.vanillaId === 377 || this.vanillaId === 446;
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    // flag3 激愤判定（L61446-61448）
    const hurt = this.hp < this.maxHp;
    let flag3 = !game.world.clock.isDay || hurt || underground;
    if (grasshopper) {
      // 蚱蜢（cs:61479-61483）：只有玩家 200px 内且非 wet 才激愤蹦跳，平时走路档
      flag3 = !!player && !player.dead && !inWater
        && Math.hypot(player.cx - this.cx, player.cy - this.cy) <= 200;
    }
    // ai[2] 卡墙冷却期间不索敌（L61938）
    if (this.ai2 > 0) this.ai2--;
    // 激愤时索敌：direction 朝玩家；被动时保持现方向
    if (flag3 && this.ai2 === 0 && player) {
      this.facing = player.cx > this.cx ? 1 : -1;
    }
    // 蚱蜢被动档（cs:61479）：无激愤时走"走路档"——0.2 慢爬不进跳循环
    if (grasshopper && !flag3) {
      this.vx += this.facing * 0.02;
      this.vx = Math.max(-0.2, Math.min(0.2, this.vx));
      this.groundPhysics(game, 0, 0.12, 1, true);
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
        this.shootDart(game, this.cx, this.cy, player.cx - this.cx, aimY, 4.5, 9);
        this.ai3 = 50;
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
  /** AI_092 训练假人（NPC 488，NPC.cs:40871-40914）：静止站立于锚定 tile（tile 378，
   *  ai0/ai1 = 锚点 tile 坐标）；锚 tile 被破坏 → 消失。受击显示伤害数字+播声音+
   *  摇晃动画（shake = clamp(dmg,20,120)，帧由渲染层读取），永不死亡（immortal）。 */
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
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    this.vx = 0;
    moveAndCollide(this, game.world, this.vx, this.vy);
    this.hp = this.maxHp; // immortal：血量恒满（cs:14535 lifeMax=1000 + immortal）
  }

  private fighterAI(game: GameHooks, player: Player | null) {    const st = game.world.store;
    // ---- 白天地表驱散（cs:57732-57775 + NotDiscouraged :60694）：
    // 白天 && y<worldSurface && 类型不在昼行豁免表 → 停止索敌 + EncourageDespawn(10)，
    // 沿原方向游荡（站定 2t 转向），离屏后由 CheckActive ~10t 清除
    const daySurface = game.world.clock.isDay && this.cy < game.world.groundLevel * TILE;
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
      // 方向：朝玩家（无玩家则保持）
      this.facing = player.cx > this.cx ? 1 : -1;
    }
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
    // ---- 蜘蛛上墙形态切换（NPC.cs:59273-59293）：站定（velocity.Y==0）且身边有
    // 背景墙（NPCCanStickToWalls）→ Transform 成爬墙形态（164→165 等）——
    // 蜘蛛洞里贴墙爬的就是这一步，地表无背景墙自然不触发
    if (this.vy === 0 && this.vanillaId != null) {
      const wallForm = Enemy.SPIDER_WALL_FORM[this.vanillaId];
      if (wallForm !== undefined && this.npcCanStickToWalls(st)) {
        this.tryTransformTo(wallForm, st);
      }
    }
    // ---- 吸血鬼离远 → 化回蝙蝠（cs:59236-59244：type 159 距玩家 >300 → Transform(158)）
    if (this.vanillaId === 159 && player
      && Math.hypot(player.cx - this.cx, player.cy - this.cy) > 300) {
      this.tryTransformTo(158, st);
    }
    // ---- 蜥蜴人激怒（cs:57422-57425：type 198 HP≤55% → Transform(199 LihzahrdCrawler)，
    //  爬行姿态更快更狠；同段的 Nutcracker 348→349 霜月未引入不移植）
    if (this.vanillaId === 198 && this.hp <= this.maxHp * 0.55) {
      this.tryTransformTo(199, st);
    }
    // 地面摩擦（原版经由 SlopeCollision 的速度衰减近似）
    if (this.onGround) this.vx *= 0.85;
    // ---- 战士族远程攻击（NPC.cs:59464-60085：落地 + 视线 + 距离<射程 → 举枪蓄力，
    // 半程发射；justHit 打断蓄力 cs:59489。覆盖入侵弓手 + 地牢/沙漠常驻射击怪）----
    // ai[1]=蓄力倒数(ai0)、ai[2]=瞄准姿态(ai3)
    if (player && this.vanillaId != null && Enemy.RANGED_FIGHTERS.has(this.vanillaId)) {
      const R = Enemy.RANGED_TABLE[this.vanillaId];
      const fireAt = R.burst ? R.cooldown - 1 : R.cooldown >> 1; // 292 在 num163-1 连发（cs:59967）
      const spread = R.spread ?? 40;
      if (this.ai3 > 0) {           // 瞄准中：减速 + 半程发射
        if (this.ai0 > 0) this.ai0--;
        this.vx *= 0.9;
        this.facing = player.cx > this.cx ? 1 : -1;
        if (this.ai0 === fireAt && this.ai0 > 0) {
          const ox = this.cx, oy = this.cy + (R.oy ?? 0);
          const shots = R.burst ?? 1;
          for (let b = 0; b < shots; b++) {
            // 预判点（cs:59700-59790）：目标中心 + 下坠补偿（默认 |dx|×0.1，各 type 修正）
            // + 散布（默认 ±40，291 狙击 ±8）——弹体直飞（Dart 敌我对全敌对）
            let tx = player.cx - ox;
            let ty = player.cy - oy - Math.abs(tx) * (R.drop ?? 0.1);
            tx += Math.random() * spread * 2 - spread;
            ty += Math.random() * spread * 2 - spread;
            this.shootDart(game, ox, oy, tx, ty, R.speed, R.dmg);
          }
        }
        // 移动/冷却尽 → 解除瞄准（cs:60005-60009）
        if ((this.vy !== 0 && (R.drop ?? 0.1) > 0) || this.ai0 <= 0) { this.ai3 = 0; this.ai0 = 0; }
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
        this.shootDart(game, this.cx, this.cy,
          player.cx - this.cx + (Math.random() * 80 - 40),
          player.cy - this.cy + (Math.random() * 80 - 40), 15, 32);
        this.ai2 = 0; this.ai3 = 0;
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
          this.shootDart(game, this.cx, this.cy - 8, player.cx - this.cx, player.cy - this.cy, jit, 20);
        }
        if (this.ai2 >= 100) this.ai2 = 0;
      } else this.ai2 = 0;
    }
  }

  /** AI_003 远程战士参数（NPC.cs:59464-60095 各 type 修正汇总）：
   *  cooldown=蓄力时长（num163，半程发射 num165）/ speed=弹速（num166）/
   *  dmg=弹伤（num171）/ range=开瞄距离（num181 默认 700）/
   *  drop=下坠补偿系数（num168，默认 0.1；0=直射）/ spread=散布 ±px（num167 后修正）/
   *  oy=枪口 Y 偏移 / burst=连发数（292 战术骷髅 ×4 各自重新瞄准，cs:59967） */
  private static readonly RANGED_FIGHTERS = new Set([
    111, 214, 215, 216,                       // 入侵：哥布林弓手/海盗三件
    110, 206, 290, 291, 292, 293,             // 骷髅弓手/冰鱼人/圣骑士/神射/战术/爆破
    449, 450, 451, 452, 481,                  // 投骨骷髅×4/希腊骷髅
    498, 499, 500, 501, 502, 503, 504, 505, 506, // 蝾螈族
    379, 380,                                 // 拜月教弓手（cs:56575 仪式待机解除后射击，num163=80）
  ]);
  private static readonly RANGED_TABLE: Record<number, {
    cooldown: number; speed: number; dmg: number; range: number;
    drop?: number; spread?: number; oy?: number; burst?: number;
  }> = {
    111: { cooldown: 180, speed: 9, dmg: 11, range: 700, drop: 0.1 },
    379: { cooldown: 80, speed: 11, dmg: 35, range: 700, drop: 0.1 },  // 拜月教弓手（cs:59494/59609/59797/59823 修正后值,弹 WoodenArrowHostile 81）
    380: { cooldown: 80, speed: 11, dmg: 35, range: 700, drop: 0.1 },
    214: { cooldown: 50, speed: 10, dmg: 25, range: 500, drop: 0, spread: 45 },
    215: { cooldown: 90, speed: 14, dmg: 35, range: 650, drop: 0.08 },
    216: { cooldown: 180, speed: 9, dmg: 30, range: 700, drop: 0.1 },
    110: { cooldown: 70, speed: 11, dmg: 35, range: 700, drop: 0.1 },          // 骷髅弓手 火焰箭
    206: { cooldown: 50, speed: 7, dmg: 37, range: 700, drop: 0.1, oy: -10 },  // 冰鱼人 冰水吐息
    290: { cooldown: 30, speed: 9, dmg: 60, range: 700, drop: 0, oy: -10 },    // 圣骑士 圣锤
    291: { cooldown: 200, speed: 4, dmg: 100, range: 700, drop: 0, spread: 8 },// 骷髅神射 狙击弹
    292: { cooldown: 120, speed: 12, dmg: 50, range: 700, drop: 0, burst: 4 }, // 战术骷髅 4 连弹
    293: { cooldown: 90, speed: 4, dmg: 60, range: 700, drop: 0.1 },           // 骷髅爆破 火箭
    449: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16 }, // 投骨骷髅（drop 原版 rand 0.10-0.49）
    450: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16 },
    451: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16 },
    452: { cooldown: 70, speed: 7, dmg: 15, range: 200, drop: 0.25, spread: 16 },
    481: { cooldown: 100, speed: 8, dmg: 18, range: 400, drop: 0, spread: 16, oy: -14 }, // 希腊骷髅 标枪（drop 原版 ±0.035 随机）
    498: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 }, // 蝾螈吐息
    499: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    500: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    501: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    502: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    503: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    504: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    505: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
    506: { cooldown: 70, speed: 7, dmg: 14, range: 190, drop: 0.01, spread: 12, oy: -8 },
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
   *  新碰撞盒与实心块重叠则放弃（原版换尺寸失败语义） */
  private tryTransformTo(id: number, st: GameHooks['world']['store'], allowEmbedded = false): boolean {
    const v = vanillaNpc(id);
    if (!v) return false;
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
    this.def = {
      ...this.def,
      name: v.name, hp: v.lifeMax, damage: v.damage, defense: v.defense,
      width: nw, height: nh,
      flying: v.noGravity || v.aiStyle === 2 || v.aiStyle === 5 || v.aiStyle === 14,
      boss: VANILLA_BOSS_IDS.has(id),
      hitSound: [vanillaSoundName(v.HitSound) ?? 'NPC_Hit_1'],
      killedSound: [vanillaSoundName(v.DeathSound) ?? 'NPC_Killed_1'],
      drops: [], // 掉落走 NpcDrops 规则树（击杀时求值，不再预展开）
    };
    this.ai0 = 0; this.ai1 = 0; this.ai2 = 0; this.ai3 = 0;
    return true;
  }

  /** 外部 AI 文件的 Transform 入口（骑手 390 失坐骑 → 382,cs:36291） */
  transformTo(id: number, st: GameHooks['world']['store']): boolean {
    return this.tryTransformTo(id, st);
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
    if (alive) this.facing = player!.cx > this.cx ? 1 : -1;
    const los = alive ? this.canSeePlayer(st, player!) : false;
    if (!los) {
      // 无视线：振荡漂移（:29833-29878）——ai[0] 驱动的 X/Y 交替扰动 + 微弱趋目标分量
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
      this.tryTransformTo(groundForm, st);
    }
  }

  /** Collision.CanHit 近似：路径上被任一实心块阻挡即无视线（背景墙不阻挡） */
  private canSeePlayer(st: GameHooks['world']['store'], p: Player): boolean {
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    const steps = Math.ceil(Math.hypot(dx, dy) / (TILE / 2));
    for (let s = 1; s < steps; s++) {
      const lx = Math.floor((this.cx + (dx * s) / steps) / TILE);
      const ly = Math.floor((this.cy + (dy * s) / steps) / TILE);
      if (!st.inBounds(lx, ly)) return false;
      if (st.isSolid(lx, ly)) return false;
    }
    return true;
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
        if (this.tryTransformTo(196, st)) return;
      }
    }
    // 静止站立 + 重力（原版 AI_042 无任何速度代码）
    this.vx = 0;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_000 被缚 NPC（NPC.cs:19774-19893）：105/106/123/354 静态站立（面朝玩家+摩擦，
   *  无任何移动）；376 睡渔夫/579 醉酒酒保水上漂流（wet → vy=-0.4 上浮 + 缓漂）。
   *  解救（对话 Transform 成对应城镇 NPC）在 TownNPC 侧；Enemy 侧仅防御性兜底 */
  private boundNPCAI(game: GameHooks, player: Player | null) {
    if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
    this.vx *= 0.93;
    if (Math.abs(this.vx) < 0.1) this.vx = 0;
    const st = game.world.store;
    const inW = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 0;
    if ((this.vanillaId === 376 || this.vanillaId === 579) && inW) {
      this.vy = -0.4;                       // 水面漂流（cs:19818-19883）
      this.vx *= 0.99;
      this.x += this.vx; this.y += this.vy;
      return;
    }
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_017 秃鹫 61（Raven 301 同块，NPC.cs:24079-24209）：ai[0]=0 栖息（重力站立），
   *  200px 盒与玩家相交 / life<max / 有速度 → 起飞（vy-=6）单向 0→1 不回落；
   *  飞行态无重力：X accel 0.1 clamp±3，Y 目标=玩家上方（|dx|>50 再抬高 100）accel 0.05 clamp±3；
   *  碰撞反弹旧速×-0.5（X 朝 direction 保底 2 / Y 保底 1） */
  private vultureAI(game: GameHooks, player: Player | null) {
    if (this.ai0 < 0) this.ai0 = 0;
    if (this.ai0 === 0) {
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
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
    const dir = this.facing;
    if (dir === -1 && this.vx > -3) {
      this.vx -= 0.1;
      if (this.vx > 0) this.vx -= 0.1;
      if (this.vx < -3) this.vx = -3;
    } else if (dir === 1 && this.vx < 3) {
      this.vx += 0.1;
      if (this.vx < 0) this.vx += 0.1;
      if (this.vx > 3) this.vx = 3;
    }
    // 悬停目标(:24172-24174):player.Y - h/2;水平距离>50 → 再抬 100px。
    // ★曾写成【vy】与【世界坐标 ty】比较(单位错位恒 false → 永远 vy+=0.05 向下
    // 加速):秃鹫唤醒后不悬停,贴地乱撞冲向玩家。原版比较的是 position.Y 与 ty
    let ty = player && !player.dead ? player.y - this.h / 2 : this.cy - 100;
    if (player && Math.abs(player.cx - this.cx) > 50) ty -= 100;
    if (this.y < ty) {
      this.vy += 0.05;
      if (this.vy < 0) this.vy -= 0.01;
    } else {
      this.vy -= 0.05;
      if (this.vy > 0) this.vy -= 0.01;
    }
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
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (player && !player.dead) {
      this.ai0 += 1;
      if (this.ai0 >= 200 && player.cy < this.cy && this.canSeePlayer(st, player)) {
        this.ai0 = 0;
        this.shootDart(game, this.cx, this.cy, player.cx - this.cx, player.cy - this.cy, 12, 10);
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
  }

  /** AI_025 宝箱怪 85/341/629（NPC.cs:25621-25713）：ai[0]=0 伪装（重力站立），玩家进
   *  200px 盒 / life<max / 有速度 → 显形；ai[0]=1 跳跃循环——落地 ai[2] 计数，
   *  不足 12（首跳）/20 帧 vx×0.9 蓄力，然后小跳（vx=dir*3.5, vy=-4）×2 →
   *  第三跳大跳（vx=dir*2.5, vy=-8）清零循环；空中朝 dir 补 |vx|≥1（±0.1/帧）。
   *  341 礼物宝箱怪仅雪月索敌（flag36）——雪月未引入，保持伪装不索敌近似 */
  private mimicAI(game: GameHooks, player: Player | null) {
    if (this.ai0 < 0) this.ai0 = 0;
    const flag36 = this.vanillaId === 341;
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
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      moveAndCollide(this, game.world, this.vx, this.vy);
      return;
    }
    if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
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
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
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
   *  378 格格牙炸弹自爆序列（cs:30044）DD2 未引入不移植 */
  private herplingAI(game: GameHooks, player: Player | null) {
    if (this.ai2 === 0) { this.ai0 = -100; this.ai2 = 1; }
    else if (this.ai2 > 1) this.ai2 -= 1;
    const derpling = this.vanillaId === 177;
    if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
    const dist = player ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : Infinity;
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
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
      this.facing = player.cx > this.cx ? 1 : -1;
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
    // 撞墙反弹（collideX/Y → hitWall/hitHead/onGround + 上一帧速度近似 oldVelocity）
    const oldVx = this.vx, oldVy = this.vy;
    // ---- 白天地表驱散（cs:52707-52715 + IsDiscouraged :53152）：
    // 白天 && y≤worldSurface && 类型 ∈ 眼族昼散表 → EncourageDespawn(10) +
    // 保持水平运动方向、directionY=-1 向上飞离（离屏后 CheckActive ~10t 清除）
    const day = game.world.clock.isDay;
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
  /** AI_013 植物/攀爬者族(NPC.cs:22604-22700 一比一):锚点格(ai0/ai1)固定,
   *  朝玩家伸展(range 内钳制),逆向加速 ×1.5;锚点格被挖掉即死;300-450 tick 周期 range ×1.3。
   *  攀爬者 101: range 175、accel 0.035、noTileCollide 幽灵位移(穿墙摆动)。 */
  private plantAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
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
            player.cy - this.cy + (Math.random() * 20 - 10), 10, 22);
          this.ai3 = 0;
        } else this.ai3 = 100;
      }
    }
    // noTileCollide:幽灵位移(原版 plants 不做 tile 碰撞)
    this.x += this.vx;
    this.y += this.vy;
  }

  private swarmerAI(game: GameHooks, player: Player | null) {
    const isEater = this.vanillaId === 6 || this.vanillaId === 173 || this.vanillaId === 139;
    // 蜜蜂（210/211，L50768-50784）：ai[1] 计数爬坡 num3=(ai1-60)/60≤1；
    // 暖机期（num3<1）逐轴速度钳 ±6；速度档 5 / 加速 0.1×num3
    const isBee = this.vanillaId === 210 || this.vanillaId === 211;
    let maxSpd = isEater ? 4 : this.vanillaId === 94 ? 4.2 : this.vanillaId === 5 ? 5 : 6;
    let accel = isEater ? 0.02 : this.vanillaId === 94 ? 0.022 : this.vanillaId === 5 ? 0.03 : 0.05;
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
    // +π/2 为该族贴图正面朝上的实测符号（原版 −π/2 叠默认镜像等价）
    const faceTarget = vid === 6 || vid === 94 || vid === 173 || vid === 619;
    const fax = faceTarget ? sx : this.vx;
    const fay = faceTarget ? sy : this.vy;
    this.visAngle = Math.atan2(fay, fax) + Math.PI * 0.5;
    // ---- 黄蜂毒刺（cs:51125-51213：42/176/231-235）：ai[1] 每 tick +rand(5,20)×0.1
    // （苔藓黄蜂 176 ×2）；玩家待机未挥动（原版 itemAnimation==0 && stealth==0 门）清零；
    // ≥130 且有视线且朝向与移动方向一致 → 毒刺（速 8、伤 10×scale/176 30×scale、
    // 散布 ±20），ai[1]=101 次帧清零（原版此处播音效 Item17）
    // ---- 腐化者 94 唾液（cs:51257-51276）：ai[2] 每 tick +1，==180 且有视线 → VileSpit
    // （原版 NewNPC 112 aiStyle 9 追踪球速 7，此处 Dart 直飞近似、伤害取 NPC 112 数据）
    const st = game.world.store;
    const isHornet = vid === 42 || vid === 176 || (vid >= 231 && vid <= 235);
    if (player && !player.dead && (isHornet || vid === 94)) {
      if (this.ai1 === 101) this.ai1 = 0; // 上一发余音帧
      if (isHornet) {
        this.ai1 += (Math.random() * 15 + 5) * 0.1;
        if (vid === 176) this.ai1 += (Math.random() * 15 + 5) * 0.1;
        if (player.useTime === 0) this.ai1 = 0; // 待机清零（原版潜行/挥动门）
        if (this.ai1 >= 130 && this.canSeePlayer(st, player)) {
          const sxp = player.cx - this.cx + (Math.random() * 40 - 20);
          const syp = player.cy - this.cy + (Math.random() * 40 - 20);
          if ((sxp < 0 && this.vx < 0) || (sxp > 0 && this.vx > 0)) {
            const vScale = this.vanilla?.scale ?? 1;
            this.shootDart(game, this.cx, this.cy, sxp, syp, 8, Math.round((vid === 176 ? 30 : 10) * vScale));
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
    // ---- 巨型诅咒颅 289 暗影焰（cs:21762-21790）：≤500px 时 ai[3] 状态机
    // （0 累计 120t → 1 冲刺段 40t），冲刺段 ai[2]==20 发射暗影焰（速 6、伤 25，
    // 无视线门——冲刺贴脸语义）；脱距双清
    if (this.vanillaId === 289) {
      if (player && dist <= 500) {
        this.ai2 += 1;
        if (this.ai3 === 0) {
          if (this.ai2 > 120) { this.ai2 = 0; this.ai3 = 1; }
        } else {
          if (this.ai2 === 20) this.shootDart(game, this.cx, this.cy, dx, dy, 6, 25);
          if (this.ai2 > 40) { this.ai3 = 0; this.ai2 = 0; }
        }
      } else { this.ai2 = 0; this.ai3 = 0; }
    }
    this.x += this.vx;
    this.y += this.vy;
  }

  // AI_011 骷髅王(35)战斗状态机在 bossAI.ts skeletronBossAI；68 守卫走下方专用分支

  /** AI_011 地牢守卫(68)（NPC.145.cs:21937-21941, 22277-22288）：
   *  恒 ai[1]=2：伤害 9999、恒速 8 直线追击；玩家死/超 2000px → ai[1]=3 下坠脱场。
   *  noTileCollide 直移 */
  private dungeonGuardianAI(game: GameHooks, player: Player | null) {
    if (!this.aiInit) { this.aiInit = true; this.ai0 = 1; } // 初始化（L21910；68 无手 NPC）
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
    const vampireBat = this.vanillaId === 158;
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
    // ---- 吸血蝙蝠俯袭击变形（cs:23393-23402）：玩家在下方 200px 内且有视线 →
    // 落地化作人形吸血鬼（159，AI_003 战士 + 离远化回）
    if (vampireBat && player && !player.dead) {
      const d = Math.hypot(player.cx - this.cx, player.cy - this.cy);
      if (d < 200 && this.y + this.h < player.y + player.h && this.canSeePlayer(game.world.store, player)) {
        this.tryTransformTo(159, game.world.store);
      }
    }
    // ---- 飞行射击族（cs:23463-23543，逐发要求视线；轮空后 ai[0] 达随机阈值归零——
    // 阈值缓存 ai[2]）：哈比 48 羽毛（30/60/90 连三、速 6、伤 15、±100、归零 400+rand400）/
    // 恶魔 62/66 飞镰（20/40/60/80 连四、伤 21、±100、300+rand300；原版弹 0.2 起步自加速，
    // Dart 无加速取直飞 6 近似）/ 红恶魔 156 三叉戟（20/40/60/80/100 连五、伤 80、±50、
    // 250+rand250；出生点沿弹向前移 100px）
    const shooter = this.vanillaId === 48
      ? { ticks: [30, 60, 90], spd: 6, dmg: 15, spread: 100, reset: 400 }
      : this.vanillaId === 62 || this.vanillaId === 66
        ? { ticks: [20, 40, 60, 80], spd: 6, dmg: 21, spread: 100, reset: 300 }
        : this.vanillaId === 156
          ? { ticks: [20, 40, 60, 80, 100], spd: 7, dmg: 80, spread: 50, reset: 250 }
          : null;
    if (shooter && player && !player.dead) {
      if (this.ai0 < 0) this.ai0 = 0; // 类字段默认 -1120 是史莱姆初值；原版 ai[0] 从 0 起步
      this.ai0 += 1;
      if (shooter.ticks.includes(this.ai0)) {
        if (this.canSeePlayer(game.world.store, player)) {
          const ox = player.cx - this.cx + (Math.random() * 2 - 1) * shooter.spread;
          const oy = player.cy - this.cy + (Math.random() * 2 - 1) * shooter.spread;
          this.shootDart(game, this.cx, this.cy, ox, oy, shooter.spd, shooter.dmg);
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
    const inWater = st.liquid[st.idx(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))] > 80;
    if (player) this.facing = player.cx > this.cx ? 1 : -1;
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
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities
          .add(new Dart(this.cx, this.cy, Math.cos(ang) * spd, Math.sin(ang) * spd, dmg), 'projectiles');
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
        this.shootDart(game, ox, oy, tx, ty, 10, 40);
        this.ai3 = 0; this.ai2 = 0;
      }
    }
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
  /** AI_065 蝴蝶族（AI_065_Butterflies cs:45231）：ai[0]/ai[1]=目标速度分量，漂移速度
   *  0.26-3.0 每 60-179 帧重选（近距 90-239 帧）；平滑 v=(v*59+目标)/60（cs:45231 系数 60）；
   *  垂直避障：向下 4 格实心/液体 → 反向，向上 30 格无实心 → 反向；collideX → vx×-0.2 翻 ai0；
   *  主动避敌（每 15 帧 cs:45395-45427）：100px 内敌怪叠加反向速度（上限 16）。
   *  （661 帝皇蝶离神圣渐隐、356 花色变体/catchItem 在掉落与虫网侧，不在 AI 内） */
  private butterflyAI(game: GameHooks, _player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) { this.aiInit = true; this.ai0 = 0; this.ai1 = 0; this.ai2 = 0; }
    // 漂移目标重选
    if (this.ai2 <= 0) {
      this.ai0 = (Math.random() * 2 - 1) * (0.26 + Math.random() * 2.74);
      this.ai1 = (Math.random() * 2 - 1) * (0.26 + Math.random() * 2.74);
      this.ai2 = 60 + Math.floor(Math.random() * 120);
    }
    this.ai2 -= 1;
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
      this.ai2 = 0;
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
   *  青蛙(361/445/687) 水中低速 vx += maxX*10*dir（cs:54333-54342）。
   *  节奏（cs:54030）：站→走 200+rand300+rand(200,400)、走→站 300+rand300-rand100。
   *  跳跃（cs:54315-54417）：前方 1 格实心+净空 → vy=-5、2 格 → -6、半砖 → -4.4，
   *  否则危险中 ai0=8 僵立 240t / 平时掉头；上升 ×1.2（非鼠类）。
   *  危险扫描（cs:53884-54028，每 15t）：200px 内敌怪+视线 → 逃离 120+rand120。
   *  鸭/海鸥/鷿鷈行走形(362/364/602/608)：wet 或 |vy|>4 → Transform(+1) 飞形（cs:53585） */
  private townCritterWalkAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    const vid = this.vanillaId ?? 0;
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
      this.tryTransformTo(vid + 1, st);
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
      // 青蛙水中窜游
      if (frog && inWater && Math.abs(this.vx) < maxX * 0.5) this.vx += maxX * 10 * this.facing;
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
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.onGround) this.vx *= 0.85;
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
    // 484 魔化夜爬虫点光（cs:34492-34497）：每帧 90-111% 抖动 ×(essScale+0.5)/2
    // （essScale 赋能默认 0.5 → 系数 0.5），紫光
    if (this.vanillaId === 484) {
      const f = (0.9 + Math.random() * 0.2) * 0.5;
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
          this.tryTransformTo(375, st, true);
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
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
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
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
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
      // 游泳/陆行
      if (!inWater) this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      if (Math.abs(this.vx) < 2) this.vx += this.facing * 0.1;
      if (player && !player.dead
        && Math.abs(player.cx - this.cx) < 100 + (this.w + player.w) / 2
        && Math.abs(player.cy - this.cy) < 100 + (this.h + player.h) / 2) {
        this.ai0 = 1; this.vy -= 6; this.facing *= -1;
      }
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.onGround && !inWater) { // 陆上：起飞回飞形
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
      this.tryTransformTo((this.vanillaId ?? 363) - 1, st);
    }
  }

  /** AI_112 仙灵 583-585（AI_112_FairyCritter cs:48453）：状态 0 绕出生点 20px 微漂、
   *  玩家 250px 内 → 状态 1 追随飞（X 渐近 dir×4.5、前方 20×8 扫描定 Y、限 [-5,3]）；
   *  存在 18000 帧（5 分钟）强制离场消失（cs:48457-48473）。
   *  （状态 2-7 宝箱引导链需要宝箱搜索基建，未移植备案） */
  private fairyAI(game: GameHooks, player: Player | null) {
    const st = game.world.store;
    if (!this.aiInit) { this.aiInit = true; this.ai0 = this.cx; this.ai1 = this.cy; this.ai2 = 0; this.ai3 = 0; }
    this.ai3 += 1;
    if (this.ai3 >= 18000) { this.dead = true; return; } // 存在期满离场
    if (this.ai2 === 0) {
      // 绕锚点微漂
      const dx = this.ai0 - this.cx, dy = this.ai1 - this.cy;
      if (Math.hypot(dx, dy) > 20) { this.vx += Math.sign(dx) * 0.04; this.vy += Math.sign(dy) * 0.04; }
      else { this.vx += (Math.random() - 0.5) * 0.04; this.vy += (Math.random() - 0.5) * 0.04; }
      this.vy = Math.max(-2, Math.min(2, this.vy));
      if (player && !player.dead && Math.hypot(player.cx - this.cx, player.cy - this.cy) < 250) this.ai2 = 1;
    } else {
      // 追随飞（cs:48453 状态 1）
      if (player && !player.dead) this.facing = player.cx > this.cx ? 1 : -1;
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
        // 变体近似（SetDefaultsFromNetId -4/-7/-3：scale + 属性/颜色覆盖）
        const r = Math.random();
        if (r < 1 / 180) { // 金史莱姆 -4
          slave.vanillaScale = 0.6; slave.w = Math.round(slave.w * 0.6 / (slave.vanillaScale || 1));
          slave.hp = slave.maxHp = 150; slave.def.damage = 5; slave.def.defense = 5;
          slave.colorRGBA = [250, 30, 90, 90];
        } else if (r < 1 / 10) { // 母史莱姆 -7（纯 scale 1.05）
          slave.vanillaScale = 1.05; slave.w = Math.round(slave.w * 1.05); slave.h = Math.round(slave.h * 1.05);
        } else if (r < 1 / 3) { // 绿史莱姆 -3
          slave.vanillaScale = 0.9; slave.w = Math.round(slave.w * 0.9); slave.h = Math.round(slave.h * 0.9);
          slave.hp = slave.maxHp = 14; slave.def.damage = 6; slave.def.defense = 0;
          slave.colorRGBA = [0, 220, 40, 100];
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
      // X 朝向（TargetClosest 近似：有玩家朝玩家，否则顺风）加速至 num5（cs:43114-43128）
      const dir = player && !player.dead ? (player.cx > this.cx ? 1 : -1) : (wind > 0 ? 1 : -1);
      this.facing = dir;
      const num5 = 2 + Math.abs(wind) * 2;
      if (Math.sign(this.vx) !== dir || Math.abs(this.vx) < num5) {
        this.vx += dir * 0.01;
        if (this.vx * dir < 0) this.vx += Math.abs(this.vx) > num5 ? dir * 0.1 : dir * 0.05;
        else if (Math.abs(this.vx) > num5) this.vx = dir * num5;
      }
      // 前方探测（num6/num7，8+num3 格 → num3 简化 0，cs:43130-43153）
      const num6 = Math.floor((this.x + this.w / 2) / TILE) + dir;
      const num7 = Math.floor((this.y + this.h) / TILE);
      let open = true, near = false;
      for (let i = num7; i < num7 + 8; i++) {
        if (!st.inBounds(num6, i)) break;
        const ii = st.idx(num6, i);
        if (st.isSolid(num6, i) || st.liquid[ii] > 0) {
          if (i < num7 + 5) near = true;
          open = false;
          break;
        }
      }
      // 玩家 400px 内 → 跟随 Y（±0.035，cs:43155-43175）；否则探测升降（+0.05/-0.1/-0.2 钳 [-4,2]）
      const pD = player && !player.dead ? Math.hypot(player.cx - this.cx, player.cy - this.cy) : Infinity;
      if (pD < 400) {
        if (this.cy + this.h / 4 > player!.cy && this.vy > -2) this.vy -= this.vy > 0 ? 0.07 : 0.035;
        else if (this.cy + this.h / 4 < player!.cy && this.vy < 2) this.vy += this.vy < 0 ? 0.07 : 0.035;
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

  /** AI_119 蒲公英 628（NPC.cs:43254-43318）：非风日快速消散（timeLeft=10）；
   *  玩家在下风 600px 内且 |dy|<100 → 喷籽态 ai[0]=1：计数 40 发 1-3 枚种子
   *  （proj 836 伤 7——Dart 近似），>80 回待机。本体无位移（原版仅状态机+弹幕） */
  private dandelionAI(game: GameHooks, player: Player | null) {
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
          ents.add(new Dart(this.cx + dir * 6, this.cy, vx, vy, 7), 'projectiles');
        }
      }
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
    this.vy = this.inWater || liq > 80 ? this.vy : Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(this, game.world, this.vx, this.vy);
  }

  /** AI_118 海马 626/627（AI_118_Seahorses cs:47432）：noGravity=wet；水中 ai[1] 冷却
   *  归零时沿 ai[0] 角 +0.06 加速、合速超 ±3 → 重随机角（450-600 帧）；非冲刺帧 v×0.95；
   *  接近水面时新角朝下则折回；离水 vy==0 时 vx×0.95 瘫软；碰撞反射对应轴（cs:47470） */
  private seahorseAI(game: GameHooks) {
    const st = game.world.store;
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
      this.vy = Math.min(this.vy + GRAVITY, MAX_FALL_SPEED);
      if (this.vy === 0) this.vx *= 0.95;
    }
    this.facing = this.vx > 0 ? 1 : -1;
    moveAndCollide(this, game.world, this.vx, this.vy);
    if (this.hitWall) { this.vx *= -1; this.ai0 = Math.PI - this.ai0; }
    if (this.onGround || this.hitHead) { this.vy *= -1; this.ai0 = -this.ai0; }
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
      // 弹跳球系法师（NPC.cs:21136/:21199-21206）：火妖 24→25 焰球 / 哥布林术士
      // 29→30 混沌球 / 水球术士 32→33 水球 / 黑暗法师 45→665 混沌球(Tim 变体)——
      // 原版每轮 volley 只 NewNPC 一球（AI_009 自带出膛定速），其余法师走 Dart 三连
      const ballByCaster: Record<number, number> = { 24: 25, 29: 30, 32: 33, 45: 665 };
      const ballId = ballByCaster[this.vanillaId ?? -1];
      if (ballId) {
        if (this.aiT === 15) {
          const ball = Enemy.fromVanilla(ballId,
            this.cx + (ballId === 25 ? this.facing * 8 : 0),
            this.cy + (ballId === 25 ? 20 : -8));
          if (ball) addEnemy(game, ball);
        }
      } else {
        const dx = player.cx - this.cx, dy = player.cy - this.cy;
        const d = Math.hypot(dx, dy) || 1;
        const spd = 3.4;
        const dart = new Dart(this.cx, this.cy, (dx / d) * spd, (dy / d) * spd, this.def.damage);
        (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(dart, 'projectiles');
      }
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

  /**
   * AI_004 克苏鲁之眼 1:1（1456 NPC.cs:19909-20757，普通模式数值；专家分支未启用）。
   *  P1 悬浮(NPC 上方 200px, 5/0.04 伺服) → 600 tick → 3 连冲(6.0, 冲程 150t, 40t 后 0.98 摩擦);
   *  悬浮期间 NPC 在玩家上方且 <500px 时累计 110t 召一只仆从(vel=dir*5);
   *  HP≤50% → 自旋变速(0.005→0.5 rad/tick ×100t, 再减速 100t)+gore/咆哮 → P2;
   *  P2 悬浮(上方 120px, 6/0.07) → 200 tick → 3 连冲(6.8, 冲程 130t);
   *  白天/玩家死亡: vy-=0.04 漂离 + 远距 despawn(原版 EncourageDespawn 语义)。
   *  旋转: 悬浮追 atan2(dy,dx)+π/2、冲刺锁 atan2(v)-π/2, 速率 0.02(新悬浮)/0.05(cs:19943-19966)
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

  /** EoC 旋转追踪：visAngle 向 target 以 rate 步进（最短弧，cs:19975-20000） */
  private applyEocRotation(target: number, rate: number): void {
    let t = target;
    while (t < 0) t += Math.PI * 2;
    while (t > Math.PI * 2) t -= Math.PI * 2;
    let a = this.visAngle;
    while (a < 0) a += Math.PI * 2;
    while (a > Math.PI * 2) a -= Math.PI * 2;
    let diff = t - a;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.visAngle = a + diff * Math.min(1, rate * 10);
  }

  private eocAI(game: GameHooks, player: Player | null) {
    const T = TILE;
    if (!player) return;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy) || 1;

    // ---- 白天/玩家死亡：向上漂离 + EncourageDespawn(10)（cs:20020-20025） ----
    if (game.world.clock.isDay || player.dead) {
      this.vy -= 0.04;
      this.encourageDespawn(10);
      this.applyEocRotation(Math.atan2(dy, dx) - Math.PI * 0.5, 0.02);
      this.x += this.vx; this.y += this.vy;
      // 原版此处 return 在状态机之前:ai[2](本作 aiT)不推进 = 冲刺/悬浮计时冻结,
      // 复活后从冻结处继续(fixedUpdate 头部的 aiT++ 在此抵消)
      this.aiT--;
      if (dist > T * 120) this.dead = true;   // 漂远后兜底消失
      return;
    }

    // ---- 二阶段触发：HP≤50%(cs:20228) → 自旋(加速段) ----
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2; this.state = 5; this.aiT = 0;
      this.spinSpeed = 0;
      this.vx = 0; this.vy = 0;
      game.spawnParticles(this.cx, this.cy, '#C02020', 20, 3);
    }

    // 旋转追踪速率(cs:19943-19966)：新悬浮 0.02;悬浮 40t 后/冲刺预备 0.05
    let rotRate = 0.02;

    switch (this.state) {
      case 0: {
        // ---- 悬浮：伺服逼近玩家上方(P1 -200px / P2 -120px, cs:20030-20044/20369-20373) ----
        const hoverY = this.phase === 1 ? -200 : -120;
        const spd = this.phase === 1 ? 5 : 6;
        const accel = this.phase === 1 ? 0.04 : 0.07;
        this.servoTo(player.cx, player.cy + hoverY, spd, accel);
        this.facing = dx > 0 ? 1 : -1;
        // 残余自旋衰减(cs:20249-20256 else 支):变身后 ai2 保留 0.5,
        // P2 悬浮期每帧 -0.005 → "边转边停"的标志性收尾
        if (this.spinSpeed > 0) {
          this.spinSpeed = Math.max(0, this.spinSpeed - 0.005);
          this.visAngle += this.spinSpeed;
        }
        // 仆从(P1 专属, cs:20096-20145):NPC 在玩家上方且 <500px 时累计,110t 召一只
        if (this.phase === 1) {
          if (this.y + this.h < player.y && dist < 500) {
            if (++this.servantT >= 110) {
              this.servantT = 0;
              const d0 = dist;
              const svx = (dx / d0) * 5, svy = (dy / d0) * 5;
              const s = Enemy.fromVanilla(5, this.cx + (dx / d0) * 10, this.cy + (dy / d0) * 10);
              if (s) {
                s.vx = svx; s.vy = svy;
                (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(s, 'enemies');
                game.playSfx('spawn');
                game.spawnParticles(s.cx, s.cy, '#9A8FA0', 10, 2);
              }
            }
          }
        }
        // 悬浮计时:600t(P1)/200t(P2) → 冲刺连段(cs:20083-20095/20430-20442)
        if (this.aiT >= (this.phase === 1 ? 600 : 200)) {
          this.state = 1; this.aiT = 0; this.chargesLeft = 0;
        }
        if (this.aiT > 40) rotRate = 0.05;
        break;
      }
      case 1: {
        // ---- 冲刺预备(cs:20148-20169/20452-20478):锁定方向即发,P2 起手吼声 ----
        this.applyEocRotation(Math.atan2(dy, dx) - Math.PI * 0.5, 0.05);
        const dashSpd = this.phase === 1 ? 6 : 6.8;
        this.vx = (dx / dist) * dashSpd;
        this.vy = (dy / dist) * dashSpd;
        this.state = 2; this.aiT = 0;
        this.dashing = true;
        if (this.phase === 2) game.playSfx('roar', 0.7);
        break;
      }
      case 2: {
        // ---- 冲刺(cs:20170-20222/20479-20534):40t 后 0.98/0.97 摩擦,
        //     冲程 150t(P1)/130t(P2),3 连后回悬浮 ----
        this.dashing = true;
        if (this.aiT % 2 === 0) {
          game.spawnParticles(this.cx, this.cy, this.phase === 1 ? '#D0D0D0' : '#FF4040', 2, 2);
        }
        if (this.aiT >= 40) {
          this.vx *= this.phase === 1 ? 0.98 : 0.97;
          this.vy *= this.phase === 1 ? 0.98 : 0.97;
        }
        // 冲刺中旋转锁移动方向(cs:20195/20505)
        this.visAngle = Math.atan2(this.vy, this.vx) - Math.PI * 0.5;
        const dashDur = this.phase === 1 ? 150 : 130;
        if (this.aiT >= dashDur) {
          this.chargesLeft++;
          this.aiT = 0;
          if (this.chargesLeft >= 3) {
            this.state = 0; this.chargesLeft = 0;   // 3 连结束回悬浮(cs:20212-20216/20518-20521)
          } else {
            this.state = 1;                          // 再冲
          }
        }
        break;
      }
      case 5: {
        // ---- 自旋变身(cs:20238-20344):★单段加速 100t(ai2 +=0.005 钳 0.5,
        //     速度 0.98 阻尼)。100t 到点【立即变身】P2:SoundID 3 + gore×6 +
        //     尘×20 + 吼声(15)——残余自旋在 P2 悬浮中按 -0.005/帧 衰减
        //     (原版"边转边停")。曾做成 加速100t+减速100t 共 200t 才变身,节奏翻倍 ----
        this.spinSpeed = Math.min(0.5, this.spinSpeed + 0.005);
        this.visAngle += this.spinSpeed;
        this.vx *= 0.98; this.vy *= 0.98;
        if (this.aiT >= 100) {
          this.aiT = 0;
          this.state = 0;                       // 直接进 P2 悬浮(cs:20309)
          this.spinPhase = 0;
          game.playSfx('roar');                 // SoundID 15
          game.spawnParticles(this.cx, this.cy, '#8A1A1A', 12, 3);   // gore 3×2 份
          game.spawnParticles(this.cx, this.cy, '#FF3030', 20, 2.5); // 尘 20
        }
        break;
      }
      default: {
        this.state = 0; this.aiT = 0;
        break;
      }
    }

    // ---- 悬浮/非冲刺态的旋转追踪(最短弧;速率分档) ----
    if (this.state !== 2 && this.state !== 5) {
      this.applyEocRotation(Math.atan2(dy, dx) - Math.PI * 0.5, rotRate);
    }

    // 移动：EoC 全程无视地形——悬浮飞行体贴图块边缘会卡顿、冲撞后残留在
    // 图块内也会受碰撞影响，统一直接积分 + 世界边界钳制（撞墙/嵌入问题全部消除）
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
      // 每 60t 音效（:41118-41121 SoundID 4/22 碎裂；音效未接 → 低响咆哮近似）
      if (this.ai1 % 60 === 1) game.playSfx('roar', 0.3, this.cx, this.cy);
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
          // 投射物 540 星尘标记 → 末端生成该 NPC：折叠为塔顶随机点直接 spawn（无飞行演出）
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
  hurt(dmg: number, kbx: number, kby: number, game: GameHooks): boolean {
    // Critter 兼容：critters 桶的调用方按 Critter.hurt(game) 单参调用；
    // 原版小动物是 Enemy 进该桶，这里把 Game 对象重映射回 game 参、伤害取固定 5
    if (typeof dmg === 'object' && dmg !== null) {
      game = dmg as unknown as GameHooks;
      dmg = 5; kbx = 0; kby = 0;
    }
    const rawDmg = dmg; // 傀儡上报用原始值（下方 def 凘认算只做一次，双端一致）
    if (this.iframes > 0) return false;
    this.justHitT = 2; // 原版 justHit 单帧旗标（AI_023 飞行武器/陆龟受击回态消费）
    // 训练假人（NPC 488，cs:83498 localAI 赋值）：immortal 永不死，
    // 受击只记摇晃强度+方向（渲染帧端消费），掉血由 dummyAI 回满
    if (this.vanillaId === 488) {
      this.dummyShake = Math.max(20, Math.min(120, dmg));
      this.dummyHitDir = Math.sign(kbx) || this.dummyHitDir;
      this.iframes = 8;
      return true;
    }
    // 原版 Main.CalculateDamageNPCsTake：dmg - defense*0.5，下限 1
    const def = this.def.defense ?? 0;
    // ichor（灵液药剂）：NPC.checkArmorPenetration（NPC.cs:81913-81938）——
    // armorPenetration += 15，结算 (armorPenetration/2) 整除 = +7 直伤；
    // 超防钳制（def>2×dmg 时按 dmg 上限，防穿透把伤害推到全额以上）
    const pen = this.ichorT > 0 ? 7 : 0;
    const effDef = def > dmg * 2 ? dmg * 2 : def;
    dmg = Math.max(1, Math.round(dmg - effDef * 0.5 + pen));
    this.hp -= dmg;
    this.iframes = 8;
    this.hpBarT = 240; // 受击后血条持续显示 4 秒
    const resist = this.def.knockbackResist;
    if (resist < 0.9) {
      this.vx += kbx * (1 - resist);
      this.vy += kby * (1 - resist);
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
      // 风气球 594 爆裂：解冻挂载史莱姆（原版 HitEffect :82586-82594 slave ai[0]=0 + 上移 10）
      if (this.vanillaId === 594) {
        const slave = (game.enemies() as Enemy[]).find((n) => n.id === this.ai3 && n.ai0 === -999);
        if (slave) { slave.ai0 = 0; slave.y -= 10; }
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
      if (this.wormNext || this.wormFollow) {
        let head: Enemy = this;
        while (head.wormFollow) head = head.wormFollow;
        for (let s: Enemy | null = head; s; s = s.wormNext) s.dead = true;
      }
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
          return rarity >= 0 && rng.next() >= rarity;
        })();
        if (!statueSkip) {
        const w = game.world;
        const p = game.player;
        const diff = p.appearance?.difficulty ?? 0;
        // vanillaNetId 默认 0=无变体：netId/value 查表都要把 0 归一到 type
        const netId = this.vanillaNetId !== 0 ? this.vanillaNetId : this.vanillaId;
        const ctx: NpcDropCtx = {
          rng,
          netId,
          type: this.vanillaId,
          isExpert: diff >= 2, isMaster: diff >= 3,
          hardMode: !!w.flags.hardMode, crimson: !!w.crimson,
          flags: w.flags,
          x: this.cx, y: this.cy,
          worldSurfaceTile: w.groundLevel, rockLayerTile: w.rockLevel,
          underworldTileY: w.lavaLine || w.h - 200,
          maxTilesX: w.w, maxTilesY: w.h,
          lifeMax: this.maxHp, friendly: false, boss: !!this.def.boss,
          damage: this.def.damage ?? 0,
          value: this.spawnedFromStatue ? 0 : npcValueOf(netId), // 雕像产怪 value=0（Wiring.cs:2479）
          statueSpawned: this.spawnedFromStatue,
          hp: p.hp, hpMax: p.maxHp, mana: p.mana, manaMax: p.maxMana,
          luck: p.luck,
          moonEvent: game.moonEventCtx?.() ?? undefined,
          ai3: this.ai3, // NPC ai[3]：RedHatSkeletron / 光之女皇暴怒掉落条件
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
          const key = NATIVE_DROP_KEY[id] ?? VANILLA_ITEM_KEY_BY_ID[id];
          if (!key) { unmapped(id); return null; }
          const v = dropVelocity(rng);
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
        // Boss 药水+心（DoDeathEvents_DropBossPotionsAndHearts，boss 门 :80307）
        if (this.def.boss && !twinSuppressed) for (const b of rollBossPotionsAndHearts(ctx)) spawn(b.id, b.n);
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
      // 死亡专属声：Boss 咆哮；普通怪优先专属 killedSound，无则通用
      if (this.def.boss) game.playSfx('roar', 1, this.cx, this.cy);
      else if (this.def.killedSound.length) game.playSfxFiles(this.def.killedSound, 1, this.cx, this.cy);
      else game.playSfx('killed', 1, this.cx, this.cy);
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
bindEnemyCtor(Enemy);

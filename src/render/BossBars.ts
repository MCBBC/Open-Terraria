// 泰拉瑞亚 1.4.5.6 Boss 特化血条族 1:1 移植（单文件表驱动）。
// 标杆：Terarria1456/Terraria.GameContent.UI.BigProgressBar/ 全目录 20 文件——
//   基础设施 5：IBigProgressBar(接口) / BigProgressBarInfo(锚 NPC 槽) /
//     BigProgressBarCache(Life/Shield 四槽) / BigProgressBarHelper(DrawFancyBar
//     两重载：行0-3 生命条 + 行4-5 盾量叠层) / BigProgressBarSystem(跟踪+分派)。
//   条类 15：Common / Twins / EaterOfWorlds / BrainOfCthulu / GolemHead / MoonLord /
//     LunarPillar(抽象基类)+Solar/Vortex/Nebula/Stardust 四子 / NeverValid /
//     PirateShip / MartianSaucer / Deerclops。
//   （Helper.DrawBareBonesBar 全反编译无消费方——纯公共调试件，不移植）
//
// 数值链要点（各条"显示什么"）：
//   Common     本体 life/lifeMax（BossHeadTextures 无头像的 NPC 不显示；
//              头像取 bossHeadIndexOf 动态值——教徒仪式隐身态 -1=条消失）
//   Twins      两体【和】血：跟踪体 + 首个找到的另一只（live lifeMax 相加）
//   EoW        分子=全场 13-15 段 HP 和；分母=SetDefaults(14).lifeMax×(段数+2)
//              恒定（段数=专家 70/普通 65，杀段只缩分子）；锚死自动换段续显
//   BoC        本体 + 全场 Creeper(267) HP 和；分母=本体 lifeMax+爬行者参照
//              lifeMax×数量（普通 20/FTW 40）
//   Golem      245 拳+246 头在场件 HP 和 ÷ 两件参照 lifeMax 和
//   MoonLord   396/397/398 非 BadAI 件 HP 和 ÷ ref398+ref396+2×ref397；
//              BadAI=398 的 ai0∈{2,-1} 或 localAI[3]==0、任一件 ai0∈{-2,-3}
//   四塔       本体 life 条 + 盾量叠层（ShieldStrengthTower*÷ShieldStrengthTowerMax
//              =100，downedMoonlord 减半 50）；玩家 4000px 战区内且 ai[2]!=1 才显示
//   Saucer     专家含核心 395；分母=(专家?ref395)+2×ref394+2×ref393
//   PirateShip 4 炮（船 ai[0..3] 引用）HP 和 ÷ 4×ref492；锚 492 死自动换船
//   Deerclops  本体条 + IsDeerclopsHostile 门（ai0∈{6,7,8} 时须命中盒交屏+960）
//   NeverValid 249(飞天石巨人头)/440(教徒克隆)/548/549(DD2 传送门族)/68(地牢守卫)
//              恒不显示（字典显式压制，防 Common 兜底误显）
//
// 跟踪模型（BigProgressBarSystem.Update :82-92）：无当前条时全场扫描——命中盒与
// 屏幕矩形（外扩 5000px）相交的 NPC 中取【离玩家最近】者走 TryTracking 分派；
// 已跟踪条每帧重校验，失效即断（本帧不画、下帧重扫）。
import type { DrawRect } from '../assets/SpriteAtlas';
import { drawItemStackBorderString, itemStackMeasure } from './CombatTextFont';
import { vanillaNpc } from '../data/vanillaNpcs';
import { VANILLA_BOSS_IDS } from '../entities/Enemy';
import {
  applySeedAdjustments, scaleStats, scaleStatsWorld,
  type ScaleStatsWorld, type ScalingStats, type SeedAdjustStats,
} from '../stats/ScaleStats';

// ---------------------------------------------------------------------------
// NPCID.Sets.BossHeadTextures（NPCID.cs:4861，CreateIntSet(-1, ...) 全 40 对）
//   npc type → NPC_Head_Boss_N 头像索引基表；-1 = 无头像（Common 条不显示）。
//   动态覆写见 bossHeadIndexOf（NPC.cs:7536-7584 GetBossHeadTextureIndex）：
//   Common/Twins/四塔/鹿角怪条按跟踪体实时态取值（原版同名调用），其余条直取
//   基表值（原版各 .cs 写死 BossHeadTextures[x]）。
// ---------------------------------------------------------------------------
export const BOSS_HEAD_TEXTURES: Readonly<Record<number, number>> = {
  4: 0, 13: 2, 344: 3, 370: 4, 246: 5, 249: 5, 345: 6, 50: 7, 396: 8, 395: 9,
  325: 10, 262: 11, 327: 13, 222: 14, 125: 15, 126: 20, 346: 17, 127: 18,
  35: 19, 68: 19, 113: 22, 266: 23, 439: 24, 440: 24, 134: 25, 491: 26, 517: 27,
  422: 28, 507: 29, 493: 30, 549: 35, 564: 32, 565: 32, 576: 33, 577: 33,
  551: 34, 548: 36, 636: 37, 657: 38, 668: 39,
};

/** GetBossHeadTextureIndex 基表查值（NPCID.Sets.BossHeadTextures[type]；-1=无） */
export function bossHeadTextureIndex(type: number): number {
  return BOSS_HEAD_TEXTURES[type] ?? -1;
}

/** bossHeadIndexOf 的入参（BarNpc 的结构子集——Common/Twins/四塔/鹿角怪条按
 *  跟踪体实时态取头像；其余条走静态基表值，同原版各 .cs 的直取写法） */
export interface BossHeadNpc {
  /** 原版 npc.type（vanillaId） */
  type: number;
  ai0: number;
  ai1: number;
  life: number;
  lifeMax: number;
  /** npc.localAI[2]（266 克脑二阶段入场门）——BarNpc 投影未含，缺省按 0；
   *  BoC 条走静态基表（BrainOfCthuluBigProgressBar.cs:49 直取 [266]），
   *  本 case 现仅作函数级 1:1 备档 */
  localAI2?: number;
}

/** 拜月教徒仪式隐身窗（439/440 的 alpha==255 判定）。原版 GetBossHeadTextureIndex
 *  读 alpha，而 AI_084 仪式态 alpha 是 ai1 的确定函数（NPC.cs:65586-65716）：
 *  ai1∈[0,30) 渐隐 (int)(ai1/30*255)→0..246 / [30,90) 恒 255 / [90,120) 渐显
 *  255→0（ai1=90 恰 255）/ [120,420) 恒 0（被打断 justHit 归零重来 :65012-65015）。
 *  故 alpha==255 ⟺ ai1∈[30,90]——经 (ai0,ai1) 表达与逐帧读 alpha 等价。 */
function cultistRitualInvisible(ai1: number): boolean {
  return ai1 >= 30 && ai1 <= 90;
}

/** GetBossHeadTextureIndex（NPC.cs:7536-7584）：基表 + 动态覆写。
 *  - 4   克眼 ai0≥2（二阶段）→ 1
 *  - 266 克脑 ai0<0（二阶段）或 localAI[2]>0 → -1
 *  - 262 世纪之花 life≤lifeMax/2（二阶段）→ 12
 *  - 125 视网膜怪 ai0≥3 → 16；126 普兰黛拉 ai0≥3 → 21（双子二阶段头像）
 *  - 439 教徒仪式态全隐身 → -1（条消失）；440 克隆体非仪式可显态 → -1
 *  消费端：Common/Twins/四塔/鹿角怪条（各 .cs 经 nPC.GetBossHeadTextureIndex()）；
 *  EoW/克脑/石巨人/月总/碟子/海盗船条用静态基表值（直取 BossHeadTextures[x]）。 */
export function bossHeadIndexOf(e: BossHeadNpc): number {
  const result = bossHeadTextureIndex(e.type);
  switch (e.type) {
    case 4:
      if (e.ai0 >= 2) return 1;
      break;
    case 266:
      if (e.ai0 < 0 || (e.localAI2 ?? 0) > 0) return -1;
      break;
    case 262:
      if (e.life <= e.lifeMax / 2) return 12;
      break;
    case 125:
      if (e.ai0 >= 3) return 16;
      break;
    case 126:
      if (e.ai0 >= 3) return 21;
      break;
    case 439:
      if (e.ai0 === 5 && cultistRitualInvisible(e.ai1)) return -1;
      break;
    case 440:
      if (e.ai0 !== 5 || cultistRitualInvisible(e.ai1)) return -1;
      break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 数据接口（渲染层把 Enemy 投影成 BarNpc——本模块不依赖 Enemy/Renderer，
// 聚合逻辑可被测试以字面量直接驱动）
// ---------------------------------------------------------------------------
export interface BarNpc {
  /** 本仓实体号（海盗船 ai[0..3] 引用） */
  id: number;
  /** 原版 npc.type（vanillaId） */
  type: number;
  /** npc.active */
  active: boolean;
  life: number;
  lifeMax: number;
  ai0: number;
  /** 海盗船 ai[0..3] = 4 炮实体号 */
  ai1: number;
  /** 塔死亡演出位（npc.ai[2]==1） */
  ai2: number;
  ai3: number;
  /** npc.localAI[3]（月总核心首帧哨兵） */
  localAI3: number;
  /** 命中盒（世界 px） */
  x: number; y: number; w: number; h: number;
  cx: number; cy: number;
  /** npc.difficulty（参照假人 difficultyOverride） */
  difficulty: number;
}

export interface BarContext {
  npcs: readonly BarNpc[];
  playerCx: number;
  playerCy: number;
  /** 屏幕矩形（世界 px，未外扩；扫描外扩 5000 / 鹿角怪门 960 由本模块自加） */
  screen: { x: number; y: number; w: number; h: number };
  /** Main.expertMode（EoW 段数 / 碟子核心计入与分母） */
  expertMode: boolean;
  /** Main.getGoodWorld（BoC 爬行者 40） */
  getGoodWorld: boolean;
  /** NPC.ShieldStrengthTowerMax（宿主经 LunarEvent.shieldMax(world)：100 /
   *  downedMoonlord 减半 50，NPC.cs:6723-6734） */
  shieldMax: number;
  /** NPC.ShieldStrengthTower*（按塔 id 取当前盾量） */
  shieldOf: (towerId: number) => number;
  /** SetDefaults(type, GetMatchingSpawnParams()) 参照假人 lifeMax——
   *  difficultyOverride=null 时取世界档（与活体生成同管线） */
  refLifeMax: (type: number, difficultyOverride: number | null) => number;
}

/** 一帧采集产物（= BigProgressBarCache 四槽 + 头像索引 + 可选换锚） */
export interface CollectInfo {
  life: number;
  lifeMax: number;
  shield?: { cur: number; max: number };
  headIndex: number;
  /** 校验中换锚（EoW/Golem/月总/碟子/海盗船的 TryFindingAnotherPiece 链，
   *  对应原版 `info.npcIndexToAimAt = i`——系统据此更新跟踪目标） */
  retrack?: BarNpc;
}

/** IBigProgressBar */
export interface BigProgressBar {
  readonly key: string;
  validateAndCollect(tracked: BarNpc, ctx: BarContext): CollectInfo | null;
}

// ---------------------------------------------------------------------------
// 参照假人（SetDefaults(type, nPC.GetMatchingSpawnParams()) :18071-18078 →
// ScaleStats :18081-18105）。与 Enemy.fromVanilla 同管线（种子档调整 →
// ScaleStats 难度/专家肉后/人数乘区），lifeMax 与同场活体逐值相等。
// ---------------------------------------------------------------------------
export function refLifeMaxOf(
  type: number,
  difficultyOverride: number | null,
  ctx: ScaleStatsWorld = scaleStatsWorld(),
): number {
  const v = vanillaNpc(type);
  if (!v) return 0;
  const seedS: SeedAdjustStats = {
    type, scale: v.scale ?? 1, lifeMax: v.lifeMax, defense: v.defense, damage: v.damage,
  };
  applySeedAdjustments(seedS, ctx);
  const ss: ScalingStats = {
    type, lifeMax: seedS.lifeMax, damage: seedS.damage, value: 0, defense: seedS.defense,
    knockBackResist: v.knockBackResist ?? 1, boss: VANILLA_BOSS_IDS.has(type),
    friendly: !!v.friendly, townNPC: !!v.townNPC, scale: seedS.scale, difficulty: 0,
  };
  scaleStats(ss, ctx, undefined, difficultyOverride);
  return ss.lifeMax;
}

// ---------------------------------------------------------------------------
// 通用小工具
// ---------------------------------------------------------------------------
function hitboxIntersectsRect(n: BarNpc, r: { x: number; y: number; w: number; h: number }, inflate: number): boolean {
  return n.x < r.x + r.w + inflate && n.x + n.w > r.x - inflate
    && n.y < r.y + r.h + inflate && n.y + n.h > r.y - inflate;
}

/** SceneMetrics.WithinRangeOfNPC(type, 4000)（SceneMetrics.cs:921-929 +
 *  NPCEventZoneRadius=4000 :130——ClosestNPCPosition 为最近一只该类 NPC 中心） */
function playerNearNpcOfType(npcs: readonly BarNpc[], type: number, pcx: number, pcy: number): boolean {
  let best = Infinity;
  for (const n of npcs) {
    if (n.type !== type || !n.active) continue;   // SceneMetrics.Scan 仅收 active
    const d = Math.hypot(n.cx - pcx, n.cy - pcy);
    if (d < best) best = d;
  }
  return best <= 4000;
}

// ---------------------------------------------------------------------------
// 1. CommonBossBigProgressBar（兜底：本体条；无头像即不显）
// ---------------------------------------------------------------------------
export const COMMON_BAR: BigProgressBar = {
  key: 'common',
  validateAndCollect(tracked, ctx) {
    void ctx;
    if (!tracked.active) return null;
    const headIndex = bossHeadIndexOf(tracked);            // CommonBossBigProgressBar.cs:23
    if (headIndex === -1) return null;
    return { life: tracked.life, lifeMax: tracked.lifeMax, headIndex };
  },
};

// ---------------------------------------------------------------------------
// 2. TwinsBigProgressBar（双子合血：跟踪体 + 首个另一只；live lifeMax 相加）
// ---------------------------------------------------------------------------
export const TWINS_BAR: BigProgressBar = {
  key: 'twins',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active) return null;
    const otherType = tracked.type === 126 ? 125 : 126;   // :23
    let lifeMax = tracked.lifeMax;
    let life = tracked.life;
    for (const n of ctx.npcs) {                            // :26-35（首中 break）
      if (n.active && n.type === otherType) {
        lifeMax += n.lifeMax;
        life += n.life;
        break;
      }
    }
    return { life, lifeMax, headIndex: bossHeadIndexOf(tracked) };   // TwinsBigProgressBar.cs:37
  },
};

// ---------------------------------------------------------------------------
// 3. EaterOfWorldsProgressBar（分母恒定 = ref14×(段数+2)；锚死换段续显）
// ---------------------------------------------------------------------------
export const EOW_BAR: BigProgressBar = {
  key: 'eow',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active) {
      const alt = ctx.npcs.find((n) => n.active && n.type >= 13 && n.type <= 15);
      if (!alt) return null;                               // TryFindingAnotherEOWPiece
      return { ...EOW_BAR.validateAndCollect(alt, ctx)!, retrack: alt };
    }
    const refBody = ctx.refLifeMax(14, tracked.difficulty);
    const segments = ctx.expertMode ? 70 : 65;             // GetEaterOfWorldsSegmentsCount
    let life = 0;
    for (const n of ctx.npcs) {
      if (n.active && n.type >= 13 && n.type <= 15) life += n.life;
    }
    return { life, lifeMax: refBody * (segments + 2), headIndex: BOSS_HEAD_TEXTURES[13] };
  },
};

// ---------------------------------------------------------------------------
// 4. BrainOfCthuluBigProgressBar（本体 + 全场 Creeper；分母含爬行者参照×20/40）
// ---------------------------------------------------------------------------
export const BOC_BAR: BigProgressBar = {
  key: 'boc',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active) return null;
    const creepers = ctx.getGoodWorld ? 40 : 20;           // GetBrainOfCthuluCreepersCount
    const refCreeper = ctx.refLifeMax(267, tracked.difficulty);
    let life = tracked.life;
    for (const n of ctx.npcs) {
      if (n.active && n.type === 267) life += n.life;
    }
    return {
      life, lifeMax: tracked.lifeMax + refCreeper * creepers,
      headIndex: BOSS_HEAD_TEXTURES[266],
    };
  },
};

// ---------------------------------------------------------------------------
// 5. GolemHeadProgressBar（245 拳 + 246 头在场件和 ÷ 两件参照和）
// ---------------------------------------------------------------------------
const GOLEM_VALID = new Set([245, 246]);
// 自由态排除(2026-08-21 用户报"最后阶段底部血条不对"):本仓头原体变身自由态
// vanillaId 仍 246(ai3=1),原版是 NewNPC(249) 新实体且 249→neverValid(条消失)。
// 曾把自由头当 246 继续算条 = 自由头满血 ÷(245+246 参照和) 恒半条不死。
const golemBarPiece = (n: BarNpc) => n.active && GOLEM_VALID.has(n.type) && n.ai3 !== 1;
export const GOLEM_BAR: BigProgressBar = {
  key: 'golem',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active || tracked.ai3 === 1) {
      const alt = ctx.npcs.find(golemBarPiece);
      if (!alt) return null;   // 原版 TryFindingAnotherGolemPiece 找不到 → 条消失
      return { ...GOLEM_BAR.validateAndCollect(alt, ctx)!, retrack: alt };
    }
    const refFist = ctx.refLifeMax(245, tracked.difficulty);
    const refHead = ctx.refLifeMax(246, tracked.difficulty);
    let life = 0;
    for (const n of ctx.npcs) {
      if (golemBarPiece(n)) life += n.life;
    }
    return { life, lifeMax: refFist + refHead, headIndex: BOSS_HEAD_TEXTURES[246] };
  },
};

// ---------------------------------------------------------------------------
// 6. MoonLordProgressBar（四件和 ÷ ref398+ref396+2×ref397；BadAI 件剔除）
// ---------------------------------------------------------------------------
const ML_VALID = new Set([396, 397, 398]);
function mlBadAI(n: BarNpc): boolean {
  if (n.type === 398 && (n.ai0 === 2 || n.ai0 === -1)) return true;   // 死亡/出生演出
  if (n.type === 398 && n.localAI3 === 0) return true;                // 首帧哨兵未立
  return n.ai0 === -2 || n.ai0 === -3;                                // 闭眼残肢/永闭
}
export const MOONLORD_BAR: BigProgressBar = {
  key: 'moonlord',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active || mlBadAI(tracked)) {
      const alt = ctx.npcs.find((n) => n.active && ML_VALID.has(n.type) && !mlBadAI(n));
      if (!alt) return null;
      return { ...MOONLORD_BAR.validateAndCollect(alt, ctx)!, retrack: alt };
    }
    const ref398 = ctx.refLifeMax(398, tracked.difficulty);
    const ref396 = ctx.refLifeMax(396, tracked.difficulty);
    const ref397 = ctx.refLifeMax(397, tracked.difficulty);
    let life = 0;
    for (const n of ctx.npcs) {
      if (n.active && ML_VALID.has(n.type) && !mlBadAI(n)) life += n.life;
    }
    // :34-40 尾部 397 参照连续加两次 = 双手
    return { life, lifeMax: ref398 + ref396 + ref397 + ref397, headIndex: BOSS_HEAD_TEXTURES[396] };
  },
};

// ---------------------------------------------------------------------------
// 7. LunarPillarBigProgessBar + 四子（本体条 + 盾量叠层；战区门 ai2 门）
//    NPC.LunarShieldPowerNormal = 100；ShieldStrengthTowerMax = downed ? 50 : 100
//    （NPC.cs:6723-6734；盾值运行时在 World.lunarEvent.shield，宿主注入）
// ---------------------------------------------------------------------------
function makeLunarPillarBar(towerId: number, key: string): BigProgressBar {
  return {
    key,
    validateAndCollect(tracked, ctx) {
      if (!tracked.active) return null;
      const headIndex = bossHeadIndexOf(tracked);          // LunarPillarBigProgessBar.cs:23
      if (headIndex === -1) return null;
      if (!playerNearNpcOfType(ctx.npcs, towerId, ctx.playerCx, ctx.playerCy)) return null;
      if (tracked.ai2 === 1) return null;                  // 死亡演出中
      return {
        life: tracked.life, lifeMax: tracked.lifeMax,
        shield: { cur: ctx.shieldOf(towerId), max: ctx.shieldMax },
        headIndex,
      };
    },
  };
}
export const SOLAR_PILLAR_BAR = makeLunarPillarBar(517, 'pillar-solar');
export const VORTEX_PILLAR_BAR = makeLunarPillarBar(422, 'pillar-vortex');
export const NEBULA_PILLAR_BAR = makeLunarPillarBar(507, 'pillar-nebula');
export const STARDUST_PILLAR_BAR = makeLunarPillarBar(493, 'pillar-stardust');

// ---------------------------------------------------------------------------
// 8. MartianSaucerBigProgressBar（专家才计核心；分母=(专家?ref395)+2×ref394+2×ref393）
// ---------------------------------------------------------------------------
const SAUCER_SCAN = new Set([393, 394, 395]);
export const MARTIAN_SAUCER_BAR: BigProgressBar = {
  key: 'saucer',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active || tracked.type !== 395) {
      const alt = ctx.npcs.find((n) => n.active && n.type === 395);
      if (!alt) return null;
      return { ...MARTIAN_SAUCER_BAR.validateAndCollect(alt, ctx)!, retrack: alt };
    }
    const ref395 = ctx.refLifeMax(395, tracked.difficulty);
    const ref394 = ctx.refLifeMax(394, tracked.difficulty);
    const ref393 = ctx.refLifeMax(393, tracked.difficulty);
    let life = 0;
    for (const n of ctx.npcs) {
      if (n.active && SAUCER_SCAN.has(n.type) && (ctx.expertMode || n.type !== 395)) life += n.life;
    }
    return {
      life,
      lifeMax: (ctx.expertMode ? ref395 : 0) + ref394 * 2 + ref393 * 2,
      headIndex: BOSS_HEAD_TEXTURES[395],
    };
  },
};

// ---------------------------------------------------------------------------
// 9. PirateShipBigProgressBar（船 ai[0..3] 引用的 4 炮 HP 和 ÷ 4×ref492）
// ---------------------------------------------------------------------------
export const PIRATE_SHIP_BAR: BigProgressBar = {
  key: 'pirate-ship',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active || tracked.type !== 491) {
      const alt = ctx.npcs.find((n) => n.active && n.type === 491);
      if (!alt) return null;
      return { ...PIRATE_SHIP_BAR.validateAndCollect(alt, ctx)!, retrack: alt };
    }
    const ref492 = ctx.refLifeMax(492, tracked.difficulty);
    let life = 0;
    const ai = [tracked.ai0, tracked.ai1, tracked.ai2, tracked.ai3];   // (int)nPC.ai[i]
    for (let i = 0; i < 4; i++) {
      const piece = ctx.npcs.find((n) => n.id === Math.trunc(ai[i]));
      if (piece && piece.active && piece.type === 492) life += piece.life;
    }
    return { life, lifeMax: ref492 * 4, headIndex: BOSS_HEAD_TEXTURES[491] };
  },
};

// ---------------------------------------------------------------------------
// 10. DeerclopsBigProgressBar（本体条 + IsDeerclopsHostile 门）
//     NPC.IsDeerclopsHostile :44314-44337：跟踪体即 668（deerclopsBoss 槽）；
//     ai0∈{6,7,8}（撤退/传送/消散）时须命中盒交屏幕矩形外扩 960
// ---------------------------------------------------------------------------
export const DEERCLOPS_BAR: BigProgressBar = {
  key: 'deerclops',
  validateAndCollect(tracked, ctx) {
    if (!tracked.active) return null;
    const headIndex = bossHeadIndexOf(tracked);            // DeerclopsBigProgressBar.cs:23
    if (headIndex === -1) return null;
    const a = Math.trunc(tracked.ai0);
    if (a === 6 || a === 7 || a === 8) {
      if (!hitboxIntersectsRect(tracked, ctx.screen, 960)) return null;
    }
    return { life: tracked.life, lifeMax: tracked.lifeMax, headIndex };
  },
};

// ---------------------------------------------------------------------------
// 11. NeverValidProgressBar（恒不显——辅助件压制）
// ---------------------------------------------------------------------------
export const NEVER_VALID_BAR: BigProgressBar = {
  key: 'never',
  validateAndCollect() { return null; },
};

// ---------------------------------------------------------------------------
// 分派表（BigProgressBarSystem._bossBarsByNpcNetId :44-72，26 项原序）
// ---------------------------------------------------------------------------
export const BOSS_BARS_BY_NPC_NET_ID: Readonly<Record<number, BigProgressBar>> = {
  125: TWINS_BAR, 126: TWINS_BAR,
  13: EOW_BAR, 14: EOW_BAR, 15: EOW_BAR,
  266: BOC_BAR,
  245: GOLEM_BAR, 246: GOLEM_BAR,
  249: NEVER_VALID_BAR,
  517: SOLAR_PILLAR_BAR, 422: VORTEX_PILLAR_BAR, 507: NEBULA_PILLAR_BAR, 493: STARDUST_PILLAR_BAR,
  398: MOONLORD_BAR, 396: MOONLORD_BAR, 397: MOONLORD_BAR,
  548: NEVER_VALID_BAR, 549: NEVER_VALID_BAR,
  491: PIRATE_SHIP_BAR, 492: PIRATE_SHIP_BAR,
  440: NEVER_VALID_BAR,
  395: MARTIAN_SAUCER_BAR, 393: MARTIAN_SAUCER_BAR, 394: MARTIAN_SAUCER_BAR,
  68: NEVER_VALID_BAR,
  668: DEERCLOPS_BAR,
};

/** TryTracking 的条选择（:136-140：字典缺项回落 _bossBar=Common） */
export function bossBarFor(type: number): BigProgressBar {
  return BOSS_BARS_BY_NPC_NET_ID[type] ?? COMMON_BAR;
}

// ---------------------------------------------------------------------------
// BigProgressBarSystem（Update :82-92 / TryFindingNPCToTrack :102-119 /
// TryTracking :121-149）。跟踪体按引用保持（原版存 npcIndex 槽位）。
// ---------------------------------------------------------------------------
export class BigProgressBarSystem {
  /** 跟踪体实体号（原版存 npcIndex 槽位——槽位稳定可重读活态；本仓实体号同语义） */
  private trackedId = 0;
  /** 最近一次跟踪快照（实体被移出表后的换锚校验需要 difficulty 等冻结字段） */
  private lastSnapshot: BarNpc | null = null;
  private bar: BigProgressBar | null = null;

  /** 每帧 Update+采集；返回 null=本帧无条可画（原版 Update 清条后 Draw 即跳过） */
  tick(ctx: BarContext): CollectInfo | null {
    if (!this.trackedId) this.tryFindingNPCToTrack(ctx);
    if (this.trackedId && this.bar) {
      // 按实体号重取【本帧】快照（宿主传入的是逐帧重建的投影数组）；
      // 已移出表 = 视作 inactive（死体字段仍可被换锚链消费，difficulty 冻结值等价）
      const tracked = ctx.npcs.find((n) => n.id === this.trackedId)
        ?? (this.lastSnapshot ? { ...this.lastSnapshot, active: false } : null);
      if (!tracked) return null;
      const r = this.bar.validateAndCollect(tracked, ctx);
      if (!r) {
        this.trackedId = 0;
        this.lastSnapshot = null;
        this.bar = null;
        return null;
      }
      const anchor = r.retrack ?? tracked;
      this.trackedId = anchor.id;
      this.lastSnapshot = anchor;
      delete r.retrack;
      return r;
    }
    return null;
  }

  private tryFindingNPCToTrack(ctx: BarContext): void {
    let bestD = Infinity;
    for (const n of ctx.npcs) {
      if (!n.active || !hitboxIntersectsRect(n, ctx.screen, 5000)) continue;
      const d = Math.hypot(n.cx - ctx.playerCx, n.cy - ctx.playerCy);
      if (d < bestD && this.tryTracking(n, ctx)) bestD = d;   // 更近者成事才夺位
    }
  }

  private tryTracking(npc: BarNpc, ctx: BarContext): boolean {
    const bar = bossBarFor(npc.type);
    const r = bar.validateAndCollect(npc, ctx);
    if (!r) return false;
    const anchor = r.retrack ?? npc;   // 换锚在校验内完成（info.npcIndexToAimAt = i）
    this.trackedId = anchor.id;
    this.lastSnapshot = anchor;
    this.bar = bar;
    delete r.retrack;
    return true;
  }
}

// ---------------------------------------------------------------------------
// BigProgressBarHelper.DrawFancyBar（:26-60 生命重载 / :78-134 盾量重载合并）
//   UI_BossBar.png 516×348=1×6 行 58px 帧：行0 整框(头像槽) / 行1 生命端盖 /
//   行2 生命填充段(2px 源横向拉伸) / 行3 背景(×0.2) / 行4 盾端盖 / 行5 盾填充段。
//   条 456×22 居中于 (W/2, H-50)；填充宽=(int)(456×占比) 取偶；头像净左上 =
//   框左上-(32,24)+(4,20)。文本：盾>0 显盾否则显命（:123-133），FontAssets.
//   ItemStack 位图字体（CombatTextFont 注册表）三段 DrawBorderStringFourWay。
// ---------------------------------------------------------------------------
const FH = 58, BW = 456, BH = 22, IX = 32, IY = 24;

export interface BarTextures {
  bar: DrawRect | null;
  head: DrawRect | null;
}

export function drawBigProgressBar(
  c: CanvasRenderingContext2D,
  tex: BarTextures,
  viewW: number,
  viewH: number,
  info: CollectInfo,
  showText = true,
): void {
  const bar = tex.bar;
  const rect = { x: Math.round(viewW / 2 - BW / 2), y: Math.round(viewH - 50 - BH / 2), w: BW, h: BH };
  const vec = { x: rect.x - IX, y: rect.y - IY };
  // 占比钳 0..1（原版不钳：超界瞬时值会画出条框外的翻转载样——负 scale 翻转/
  // 溢出类毛刺，正常 0..1 域内与本式逐值相同；沿旧实现防线）
  const fill = Math.trunc(BW * Math.max(0, Math.min(1, info.life / info.lifeMax || 0)));
  const lifeW = fill - (fill % 2);                                   // num2 -= num2 % 2
  c.save();
  c.imageSmoothingEnabled = false;
  if (bar) {
    // 行3 背景 ×0.2（:114）
    c.globalAlpha = 0.2;
    c.drawImage(bar.img, bar.sx, bar.sy + 3 * FH, bar.sw, FH, vec.x, vec.y, bar.sw, FH);
    c.globalAlpha = 1;
    // 行2 生命填充段拉伸（:115）+ 行1 端盖（:116——fill=0 时端盖仍画在 -2 偏移，原版同）
    if (lifeW > 0) {
      c.drawImage(bar.img, bar.sx + IX, bar.sy + 2 * FH + IY, 2, BH, rect.x, rect.y, lifeW, BH);
    }
    c.drawImage(bar.img, bar.sx + IX, bar.sy + 1 * FH + IY, 2, BH, rect.x + lifeW - 2, rect.y, 2, BH);
    if (info.shield) {
      const sfill = Math.trunc(BW * Math.max(0, Math.min(1, info.shield.cur / info.shield.max || 0)));
      const shieldW = sfill - (sfill % 2);                           // num4 -= num4 % 2
      if (shieldW > 0) {
        c.drawImage(bar.img, bar.sx + IX, bar.sy + 5 * FH + IY, 2, BH, rect.x, rect.y, shieldW, BH);
      }
      c.drawImage(bar.img, bar.sx + IX, bar.sy + 4 * FH + IY, 2, BH, rect.x + shieldW - 2, rect.y, 2, BH);
    }
    // 行0 整框（:119）
    c.drawImage(bar.img, bar.sx, bar.sy, bar.sw, FH, vec.x, vec.y, bar.sw, FH);
  } else {
    // 贴图未就绪兜底：几何暗条（不闪断）
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(rect.x, rect.y, BW, BH);
    c.fillStyle = '#C03030';
    c.fillRect(rect.x, rect.y, Math.max(2, lifeW), BH);
  }
  // 头像（:55：net 左上 = vec + (4,20)，锚=图标半宽）
  const head = tex.head;
  if (head) {
    c.drawImage(head.img, head.sx, head.sy, head.sw, head.sh, vec.x + 4, vec.y + 20, head.sw, head.sh);
  }
  if (showText) {
    // DrawHealthText（:62-76 + 盾量版 :123-133：盾>0 显盾）。字体 =
    // FontAssets.ItemStack（AssetInitializer.cs:110）位图字体（CombatTextFont
    // 注册表第三字体,数字+"/" 裁片）;三段各一次 DrawBorderStringFourWay:
    // "/" 居中 / cur 右对齐(锚点 center-5) / max 左对齐(锚点 center+5),
    // origin.y = 行盒高(lineSpacing)/2,锚点 = 条中心 +(0,1)。
    const showShield = info.shield != null && info.shield.cur > 0;
    const cur = Math.trunc(showShield ? info.shield!.cur : info.life);   // (int)current
    const max = Math.trunc(showShield ? info.shield!.max : info.lifeMax);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2 + 1;
    drawBarText(c, '/', cx, cy, 0.5);
    drawBarText(c, String(cur), cx - 5, cy, 1);
    drawBarText(c, String(max), cx + 5, cy, 0);
  }
  c.restore();
}

/** DrawHealthText 单段（Utils.DrawBorderStringFourWay :2600-2628 + 各段 origin:
 *  "/"=Measure*0.5 / cur=Measure*(1,0.5) / max=Measure*(0,0.5)） */
function drawBarText(
  c: CanvasRenderingContext2D, text: string, x: number, y: number, alignX: number,
): void {
  const m = itemStackMeasure(text);
  drawItemStackBorderString(c, text, x, y, m.w * alignX, m.h / 2);
}

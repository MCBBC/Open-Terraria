// 原版南瓜月/霜月事件（1.4.5.6 1:1，Terarria1456）。
// 反编译字段：南瓜月 = Main.pumpkinMoon，霜月 = Main.snowMoon（不是 frostMoon）。
// 两事件共用 20 波分数表、同一黎明结算、同一进度条管线，只差触发物品与怪池/计分表。
//
// 源码锚点：
// - 分数表 MoonEventRequiredPointsPerWaveLookup      NPC.cs:6534-6538
// - 计分/进波/公告 CheckProgressFrostMoon            NPC.cs:79245-79372
// -                CheckProgressPumpkinMoon          NPC.cs:79487-79513
// - 难度乘区 GetMoonEventPointScalar                  NPC.cs:79230-79241（专家×2/大师×2.5）
// - 入侵组号 GetNPCInvasionGroup 尾段                 NPC.cs:79140-79174（305-315/325-330→-2，338-352→-1）
// - 启动 startPumpkinMoon/startSnowMoon               Main.cs:10903-10940
// - 结束 stopMoonEvent                                Main.cs:10879-10901
// - 黎明结算 UpdateTime_StartDay                      Main.cs:64867-64871（分数→季节→stop）
// - 强制季节 CheckForMoonEventsStartingTemporarySeasons Main.cs:10827-10862
// - 总分展示 CheckForMoonEventsScoreDisplay           Main.cs:10865-10877
//
// 状态挂 World.moonEvent（运行时字段，**不进存档**——对齐原版：pumpkinMoon/snowMoon/
// waveNumber/waveKills/totalInvasionPoints 均不写 WorldFile，主菜单即重置 Main.cs:48332）。
import type { World } from './World';
import { Lang } from '../i18n/Lang';

/** 事件种类（kind 同时是 ReportInvasionProgress 的 icon：1=霜月 2=南瓜月，Main.cs:47006/47038） */
export const MOON_KIND_FROST = 1;
export const MOON_KIND_PUMPKIN = 2;

/** 月事件运行时状态（World.moonEvent；serialize/load 均不碰） */
export interface MoonEventState {
  /** 0=无事件 1=霜月 2=南瓜月 */
  kind: 0 | 1 | 2;
  /** 当前波（1..20；20 为终波，lookup[20]=0 不再推进） */
  waveNumber: number;
  /** 当前波已得分（浮点——专家/大师乘区可出 0.5 分） */
  waveKills: number;
  /** 本次事件累计总分（黎明广播 Misc.*MoonScore 用） */
  totalInvasionPoints: number;
}

export function newMoonEventState(): MoonEventState {
  return { kind: 0, waveNumber: 0, waveKills: 0, totalInvasionPoints: 0 };
}

/** 事件进行中 */
export function moonEventActive(w: World): boolean {
  return w.moonEvent.kind !== 0;
}

/** 每波所需分数（NPC.cs:6534-6538；索引 0 与 20 为哨兵 0） */
export const REQUIRED_POINTS: readonly number[] = [
  0, 25, 40, 50, 80, 100, 160, 180, 200, 250,
  300, 375, 450, 525, 675, 850, 1025, 1325, 1550, 2000,
  0,
];

/** 南瓜月每怪分值（CheckProgressPumpkinMoon switch，NPC.cs:79455-79488）：
 *  稻草人 305-314=1 树精 326=2 地狱犬 329=5 胡闹鬼 330=10
 *  无头骑士 315=50 哀木 325=75 南瓜王 327=150；其余 id num2 恒 0 */
export const PUMPKIN_POINTS_BY_NPC: Record<number, number> = {
  305: 1, 306: 1, 307: 1, 308: 1, 309: 1, 310: 1, 311: 1, 312: 1, 313: 1, 314: 1,
  315: 50, 325: 75, 326: 2, 327: 150, 329: 5, 330: 10,
};

/** 霜月每怪分值（CheckProgressFrostMoon switch，NPC.cs:79312-79354）：
 *  精灵僵尸 338-340=1 姜饼人 342=2 精灵弓手 350=3 胡桃夹士 348/349=4
 *  弗洛科 352=5 精灵直升机 347=8 坎卜斯 351=10 雪怪 343=18 礼物宝箱怪 341=20
 *  常绿尖叫怪 344=50 圣诞坦克 346=100 冰雪女王 345=150 */
export const FROST_POINTS_BY_NPC: Record<number, number> = {
  338: 1, 339: 1, 340: 1, 341: 20, 342: 2, 343: 18, 344: 50, 345: 150,
  346: 100, 347: 8, 348: 4, 349: 4, 350: 3, 351: 10, 352: 5,
};

/** 分值表按事件取用（index = MOON_KIND_*）。原版 CheckProgress 是两个独立 switch，
 *  各只认本事件的怪——异事件 id 在进行中的事件里 num2 恒 0（见 addMoonEventKill） */
const POINTS_BY_KIND: Record<number, Record<number, number>> = {
  [MOON_KIND_PUMPKIN]: PUMPKIN_POINTS_BY_NPC,
  [MOON_KIND_FROST]: FROST_POINTS_BY_NPC,
};

/** 两表合并视图（观测/调试用；计分请走 POINTS_BY_KIND 的事件分表） */
export const POINTS_BY_NPC: Record<number, number> = {
  ...PUMPKIN_POINTS_BY_NPC, ...FROST_POINTS_BY_NPC,
};

/** NPC → 月事件组号（GetNPCInvasionGroup 尾段 NPC.cs:79140-79174）：
 *  -1=霜月（338-352）、-2=南瓜月（305-315/325/326/327/329/330）。
 *  进度条显示门与黎明 EncourageDespawn 都按此组号筛选 */
export const MOON_EVENT_GROUP: Record<number, number> = (() => {
  const g: Record<number, number> = {};
  for (const id of [305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 325, 326, 327, 329, 330]) g[id] = -2;
  for (const id of [338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352]) g[id] = -1;
  return g;
})();

/** 波次公告（Lang.GetInvasionWaveText 的 wave 参数 + 怪名 id 列表）。
 *  键 = 即将进入的波号：启动广播 1；CheckProgress 进波广播「旧波号 + 1」
 *  （switch 在 waveNumber++ 之前取的旧值，NPC.cs:79252-79315 / 79398-79452）；
 *  进入 20 波时 wave 参数为 -1 = FinalWave。20 波后再无公告（lookup[20]=0 不再进波）。 */
export interface WaveAnnounce { wave: number; ids: number[]; }

const PUMPKIN_ANNOUNCE: Record<number, WaveAnnounce> = {
  1: { wave: 1, ids: [305] },
  2: { wave: 2, ids: [326, 305] },
  3: { wave: 3, ids: [329, 326] },
  4: { wave: 4, ids: [330, 326, 305] },
  5: { wave: 5, ids: [315, 329] },
  6: { wave: 6, ids: [325, 326, 305] },
  7: { wave: 7, ids: [325, 330, 329] },
  8: { wave: 8, ids: [315, 330, 329] },
  9: { wave: 9, ids: [325, 330, 329, 326, 305] },
  10: { wave: 10, ids: [327, 329, 326] },
  11: { wave: 11, ids: [325, 330, 326] },
  12: { wave: 12, ids: [327, 330] },
  13: { wave: 13, ids: [325, 315, 330, 329, 326] },
  14: { wave: 14, ids: [327, 325, 315, 330, 329, 326, 305] },
  15: { wave: 15, ids: [327, 325, 330, 326, 305] },
  16: { wave: 16, ids: [327, 315, 330, 329, 326] },
  17: { wave: 17, ids: [327, 325, 315, 330, 329] },
  18: { wave: 18, ids: [327, 325, 315, 330] },
  19: { wave: 19, ids: [327, 325, 315] },
  20: { wave: -1, ids: [327, 325, 315] },
};

const FROST_ANNOUNCE: Record<number, WaveAnnounce> = {
  1: { wave: 1, ids: [338, 342] },
  2: { wave: 2, ids: [338, 350] },
  3: { wave: 3, ids: [338, 350, 342, 348] },
  4: { wave: 4, ids: [344, 338, 350, 342] },
  5: { wave: 5, ids: [344, 338, 350, 348] },
  6: { wave: 6, ids: [344, 350, 348, 347] },
  7: { wave: 7, ids: [346, 342, 350, 338] },
  8: { wave: 8, ids: [346, 347, 350, 348, 351] },
  9: { wave: 9, ids: [346, 344, 348, 347, 342] },
  10: { wave: 10, ids: [346, 344, 351, 338, 347] },
  11: { wave: 11, ids: [345, 352, 338, 342] },
  12: { wave: 12, ids: [345, 344, 342, 343, 338] },
  13: { wave: 13, ids: [345, 346, 342, 352, 343, 347] },
  14: { wave: 14, ids: [345, 346, 344, 343, 351] },
  15: { wave: 15, ids: [345, 346, 344, 343, 347] },
  16: { wave: 16, ids: [345, 346, 344, 343, 352] },
  17: { wave: 17, ids: [345, 346, 344, 343, 351, 347] },
  18: { wave: 18, ids: [345, 346, 344, 343, 348, 351] },
  19: { wave: 19, ids: [345, 346, 344, 343] },
  20: { wave: -1, ids: [345, 346, 344] },
};

export const WAVE_ANNOUNCE: Record<number, Record<number, WaveAnnounce>> = {
  [MOON_KIND_FROST]: FROST_ANNOUNCE,
  [MOON_KIND_PUMPKIN]: PUMPKIN_ANNOUNCE,
};

/** Lang.GetInvasionWaveText（Lang.cs:1131-1153）：Game.FinalWave(-1)/FirstWave(1)/Wave(n)
 *  + Game.InvasionWave_TypeN（N=id 数，1..6 个怪名） */
export function invasionWaveText(a: WaveAnnounce): string {
  const label = a.wave < 0 ? Lang.text('Game.FinalWave')
    : a.wave === 1 ? Lang.text('Game.FirstWave')
      : Lang.text('Game.Wave', a.wave);
  const names = a.ids.map((id) => Lang.npcName(id) ?? String(id));
  return Lang.text(`Game.InvasionWave_Type${a.ids.length}`, label, ...names);
}

/** startPumpkinMoon / startSnowMoon（Main.cs:10903-10940）：
 *  置位 + 清另一事件 + 清血月 + wave=1 + 广播 wave 1 文案。
 *  调用方须先过门（夜晚 && 无进行中事件）。返回 wave 1 公告（已激活则 null） */
export function startMoonEvent(w: World, kind: 1 | 2): WaveAnnounce | null {
  const me = w.moonEvent;
  if (me.kind !== 0) return null;
  me.kind = kind;
  me.totalInvasionPoints = 0;
  me.waveKills = 0;
  me.waveNumber = 1;
  w.clock.bloodMoon = false;   // Main.cs:10905-10906 / 10925-10926
  return WAVE_ANNOUNCE[kind][1];
}

/** stopMoonEvent（Main.cs:10879-10901）：清事件 + 三字段归零（单机 netMode!=1 分支） */
export function stopMoonEvent(w: World): void {
  const me = w.moonEvent;
  if (me.kind === 0) return;
  me.kind = 0;
  me.totalInvasionPoints = 0;
  me.waveKills = 0;
  me.waveNumber = 0;
}

/** GetMoonEventPointScalar（NPC.cs:79230-79241）：大师 ×2.5 / 专家 ×2 / 普通 ×1 */
function pointScalar(expert: boolean, master: boolean): number {
  if (master) return 2.5;
  if (expert) return 2;
  return 1;
}

/**
 * CheckProgressFrostMoon / CheckProgressPumpkinMoon（NPC.cs:79245-79372 / 79487-79513）。
 * 击杀计分：0 分怪直接 return；得分累入 waveKills 与 totalInvasionPoints；
 * waveKills ≥ lookup[wave] 且 lookup[wave]≠0 → waveKills 清零（**溢出分数不结转**）、
 * waveNumber+1，返回新波公告（wave 20 后 lookup=0 不再进波 → null）。
 * 必须在掉落结算之后同帧调用（原版 checkDead：NPCLoot → CheckProgress，NPC.cs:79020-79021），
 * 保证本波掉落用的是进波前的 wave。
 */
export function addMoonEventKill(
  w: World, vanillaId: number, expert = false, master = false,
): WaveAnnounce | null {
  const me = w.moonEvent;
  if (me.kind === 0) return null;
  // 分值只查【本事件】的 switch（原版 CheckProgressFrostMoon / CheckProgressPumpkinMoon
  // 是两个独立方法，各自只列本事件怪）——异事件 id（如南瓜月期间的 338）num2 恒 0
  const pts = POINTS_BY_KIND[me.kind]?.[vanillaId];
  if (!pts) return null;   // 未列出 = 0 分，原版 num2 恒 0 → 不动进度也不刷进度条
  const need = REQUIRED_POINTS[me.waveNumber] ?? 0;
  // 公告文案在进波判定【之前】按旧波号取（switch 用的 waveNumber 是旧值）
  const announce = WAVE_ANNOUNCE[me.kind]?.[me.waveNumber + 1] ?? null;
  const gained = pts * pointScalar(expert, master);
  me.waveKills += gained;
  me.totalInvasionPoints += gained;
  if (me.waveKills >= need && need !== 0) {
    me.waveKills = 0;
    me.waveNumber++;
    return announce;
  }
  return null;
}

// ============================================================================
// 波次出怪表（SpawnNPC 内霜月/南瓜月分支，NPC.cs:2714-3132 / 3134-3457，1:1 逐行转录）
// 这是两事件的**权威**转录；VanillaSpawner.pickFrostMoonSpawn/pickPumpkinMoonSpawn
// 即本表的消费方。签名收窄为显式依赖注入，便于逐波回归测试（tests/pumpkin-frost.test.ts）。
//
// ⚠ 语句结构照抄：南瓜月 14/15/17/18 波的南瓜王（327）判定是**独立 if**，与后续
// if/else-if 链并列（NPC.cs:3172-3188 / 3190-3211 / 3234-3255 / 3256-3285）——命中后
// 链仍执行，同一刷怪刻可产出【两】只怪（327 + 链上一只）。任何把首支并入 else-if
// 链的"简化"都会丢掉这次双刷。
// ============================================================================

/** 出怪表依赖（调用方注入；rng 语义对齐 src/core/rng.ts 约定） */
export interface MoonSpawnDeps {
  /** CountNPCS(id)（NPC.cs:60142）——场上同 id 存活数 */
  count: (id: number) => number;
  /** AnyNPCs(id)（NPC.cs:60153）——场上有无该 id；CountNPCS(id)<1 等价 */
  any: (id: number) => boolean;
  /** reachedInvasionBossCap（Spawner 构造器 NPC.cs:159-183）：
   *  Boss 族{315,325,327,328,344,345,346} npcSlots 和 ≥ 玩家数×⌊5×(2+0.3n)⌋ */
  bossCap: boolean;
  /** NextDouble()——Main.rand.Next(n)==0 判定用（< 1/n 命中） */
  next: () => number;
  /** Next(lo,hi+1) 闭区间均匀（稻草人 305-314 / 精灵僵尸 338-340 选型） */
  int: (lo: number, hi: number) => number;
}

/**
 * 霜月波次出怪（NPC.cs:2714-3132）。返回 netId 数组：0 个 = 本刻空刷
 * （14 波全 Boss 门被占、20 波 bossCap 满时的原版行为，勿加兜底）。
 * 全表均为 if/else-if 链（无独立双刷支）；任意波先掷 1/30 且 CountNPCS(341)<4 →
 * 礼物宝箱怪 341 提前返回（NPC.cs:2717-2721）。
 */
export function pickFrostMoonSpawns(wave: number, d: MoonSpawnDeps): number[] {
  const N = (n: number) => d.next() < 1 / n;      // Main.rand.Next(n)==0
  const C = d.count;
  if (N(30) && C(341) < 4) return [341];          // :2717-2721（spawn 后即 return）
  if (wave >= 20) {                               // :2722-2741
    const roll = d.int(0, 2);                     // Next(3)，bossCap 检查前先掷
    if (!d.bossCap) {
      if (roll === 0) return [345];               // 冰雪女王
      if (roll === 1) return [346];               // 圣诞坦克
      return [344];                               // 常世吼（圣诞树）
    }
    return [];
  }
  if (wave >= 19) {                               // :2742-2761
    if (N(10) && C(345) < 4) return [345];
    if (N(10) && C(346) < 5) return [346];
    if (N(10) && C(344) < 7) return [344];
    return [343];                                 // 雪怪兜底
  }
  if (wave >= 18) {                               // :2762-2789
    if (N(10) && C(345) < 3) return [345];
    if (N(10) && C(346) < 4) return [346];
    if (N(10) && C(344) < 6) return [344];
    if (N(3)) return [348];                       // 胡桃夹人
    if (N(3)) return [351];                       // 坎卜斯
    return [343];
  }
  if (wave >= 17) {                               // :2790-2817
    if (N(10) && C(345) < 2) return [345];
    if (N(10) && C(346) < 3) return [346];
    if (N(10) && C(344) < 5) return [344];
    if (N(4)) return [347];                       // 玩具直升机
    if (N(2)) return [351];
    return [343];
  }
  if (wave >= 16) {                               // :2818-2841
    if (N(10) && C(345) < 2) return [345];
    if (N(10) && C(346) < 2) return [346];
    if (N(10) && C(344) < 4) return [344];
    if (N(2)) return [352];                       // 弗洛科
    return [343];
  }
  if (wave >= 15) {                               // :2842-2865
    if (N(10) && !d.any(345)) return [345];       // AnyNPCs = 场上唯一
    if (N(10) && C(346) < 2) return [346];
    if (N(10) && C(344) < 3) return [344];
    if (N(3)) return [347];
    return [343];
  }
  switch (wave) {
    case 14:                                      // :2868-2885（无 else 兜底——全落空即空刷）
      if (N(10) && !d.any(345)) return [345];
      if (N(10) && !d.any(346)) return [346];
      if (N(10) && !d.any(344)) return [344];
      if (N(3)) return [343];
      return [];
    case 13:                                      // :2886-2911
      if (N(10) && !d.any(345)) return [345];
      if (N(10) && !d.any(346)) return [346];
      if (N(3)) return [352];
      if (N(6)) return [343];
      if (N(3)) return [342];                     // 姜饼人
      return [347];
    case 12:                                      // :2912-2933
      if (N(10) && !d.any(345)) return [345];
      if (N(10) && !d.any(344)) return [344];
      if (N(8)) return [343];
      if (N(3)) return [342];
      return [d.int(338, 340)];                   // Next(338,341) 精灵僵尸三型
    case 11:                                      // :2934-2951
      if (N(10) && !d.any(345)) return [345];
      if (N(6)) return [352];
      if (N(2)) return [342];
      return [d.int(338, 340)];
    case 10:                                      // :2952-2977
      if (N(10) && !d.any(346)) return [346];
      if (N(10) && C(344) < 2) return [344];
      if (N(6)) return [351];
      if (N(3)) return [348];
      if (N(3)) return [347];
      return [d.int(338, 340)];
    case 9:                                       // :2978-2999
      if (N(10) && !d.any(346)) return [346];
      if (N(10) && !d.any(344)) return [344];
      if (N(2)) return [348];
      if (N(3)) return [347];
      return [342];
    case 8:                                       // :3000-3021
      if (N(10) && !d.any(346)) return [346];
      if (N(8)) return [351];
      if (N(3)) return [348];
      if (N(3)) return [347];
      return [350];                               // 精灵弓手
    case 7:                                       // :3022-3039
      if (N(10) && !d.any(346)) return [346];
      if (N(3)) return [342];
      if (N(4)) return [350];
      return [d.int(338, 340)];
    case 6:                                       // :3040-3057
      if (N(10) && C(344) < 2) return [344];
      if (N(4)) return [347];
      if (N(2)) return [348];
      return [350];
    case 5:                                       // :3058-3075
      if (N(10) && !d.any(344)) return [344];
      if (N(4)) return [350];
      if (N(8)) return [348];
      return [d.int(338, 340)];
    case 4:                                       // :3076-3093
      if (N(10) && !d.any(344)) return [344];
      if (N(4)) return [350];
      if (N(3)) return [342];
      return [d.int(338, 340)];
    case 3:                                       // :3094-3111
      if (N(8)) return [348];
      if (N(4)) return [350];
      if (N(3)) return [342];
      return [d.int(338, 340)];
    case 2:                                       // :3112-3121
      if (N(3)) return [350];
      return [d.int(338, 340)];
    default:                                      // wave 1 :3122-3131
      if (N(3)) return [342];
      return [d.int(338, 340)];
  }
}

/**
 * 南瓜月波次出怪（NPC.cs:3134-3457）。返回 netId 数组：0 个 = 本刻空刷
 * （19 波 bossCap 后 / 20 波 bossCap 满）。14/15/17/18 波可能返回 2 个
 * （327 独立 if 双刷，见文件头注释）。
 */
export function pickPumpkinMoonSpawns(wave: number, d: MoonSpawnDeps): number[] {
  const N = (n: number) => d.next() < 1 / n;
  const C = d.count;
  if (wave >= 20) {                               // :3137-3155
    if (!d.bossCap) {
      if (N(2) && C(327) < 2) return [327];       // 南瓜王
      if (d.next() >= 1 / 3 && C(325) < 2) return [325];  // Next(3)!=0 → 哀木
      if (C(315) < 3) return [315];               // 无头骑士
    }
    return [];
  }
  const out: number[] = [];
  switch (wave) {
    case 19:                                      // :3158-3171（无 else——全落空即空刷）
      if (N(5) && C(327) < 2) return [327];
      if (N(5) && C(325) < 2) return [325];
      if (!d.bossCap && C(315) < 5) return [315];
      return [];
    case 18:                                      // :3172-3189 ★327 独立 if 双刷
      if (N(7) && C(327) < 2) out.push(327);
      if (N(7) && C(325) < 2) out.push(325);
      else if (N(7) && C(315) < 3) out.push(315);
      else out.push(330);                         // 胡闹鬼兜底
      return out;
    case 17:                                      // :3190-3211 ★独立 if 双刷
      if (N(7) && C(327) < 2) out.push(327);
      if (N(7) && C(325) < 2) out.push(325);
      else if (N(7) && C(315) < 2) out.push(315);
      else if (N(3)) out.push(330);
      else out.push(329);                         // 地狱犬
      return out;
    case 16:                                      // :3212-3233
      if (N(10) && C(327) < 2) return [327];
      if (N(10) && C(315) < 2) return [315];
      if (N(6)) return [330];
      if (N(3)) return [329];
      return [326];                               // 树精
    case 15:                                      // :3234-3255 ★独立 if 双刷
      if (N(10) && !d.any(327)) out.push(327);
      if (N(7) && C(325) < 2) out.push(325);
      else if (N(5)) out.push(330);
      else if (N(3)) out.push(326);
      else out.push(d.int(305, 314));             // Next(305,315) 稻草人十型
      return out;
    case 14:                                      // :3256-3285 ★独立 if 双刷
      if (N(10) && !d.any(327)) out.push(327);
      if (N(7) && C(325) < 2) out.push(325);
      else if (N(10) && !d.any(315)) out.push(315);
      else if (N(10)) out.push(330);
      else if (N(7)) out.push(329);
      else if (N(3)) out.push(326);
      else out.push(d.int(305, 314));
      return out;
    case 13:                                      // :3286-3307
      if (N(7) && C(325) < 2) return [325];
      if (N(10) && C(315) < 2) return [315];
      if (N(6)) return [330];
      if (N(3)) return [329];
      return [326];
    case 12:                                      // :3308-3317
      if (N(5) && !d.any(327)) return [327];
      return [330];
    case 11:                                      // :3318-3331
      if (N(7) && C(325) < 2) return [325];
      if (N(3)) return [330];
      return [326];
    case 10:                                      // :3332-3345
      if (N(10) && !d.any(327)) return [327];
      if (N(3)) return [329];
      return [d.int(305, 314)];
    case 9:                                       // :3346-3367
      if (N(10) && C(325) < 2) return [325];
      if (N(8)) return [330];
      if (N(5)) return [329];
      if (N(2)) return [326];
      return [d.int(305, 314)];
    case 8:                                       // :3368-3381
      if (N(8) && C(315) < 2) return [315];
      if (N(4)) return [330];
      return [329];
    case 7:                                       // :3382-3395
      if (N(7) && C(325) < 2) return [325];
      if (N(4)) return [330];
      return [329];
    case 6:                                       // :3396-3409
      if (N(7) && C(325) < 2) return [325];
      if (N(2)) return [326];
      return [d.int(305, 314)];
    case 5:                                       // :3410-3419
      if (N(10) && !d.any(315)) return [315];
      return [329];
    case 4:                                       // :3420-3433
      // 原版怪癖：判定 !AnyNPCs(325)（哀木唯一）却刷 330（胡闹鬼）——疑似
      // 复制粘贴笔误，照抄源码不"修"（NPC.cs:3421-3423）
      if (N(8) && !d.any(325)) return [330];
      if (N(2)) return [326];
      return [d.int(305, 314)];
    case 3:                                       // :3434-3443
      if (N(3)) return [329];
      return [326];
    case 2:                                       // :3444-3453
      if (N(3)) return [326];
      return [d.int(305, 314)];
    default:                                      // wave 1 :3454-3456
      return [d.int(305, 314)];
  }
}

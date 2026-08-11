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

/** 每怪分值（两表合并；未列出 = 0 分直接 return）。
 *  南瓜月 NPC.cs:79453-79484：稻草人 305-314=1 树怪 326=2 地狱犬 329=5 胡闹鬼 330=10
 *   无头骑士 315=50 悲木 325=75 南瓜王 327=150
 *  霜月 NPC.cs:79274-79305：精灵僵尸 338-340=1 姜饼人 342=2 弓手 350=3 胡桃夹子 348/349=4
 *   弗洛科 352=5 直升机 347=8 坎卜斯 351=10 雪怪 343=18 礼物窃贼 341=20
 *   常世吼 344=50 圣诞坦克 346=100 冰女王 345=150 */
export const POINTS_BY_NPC: Record<number, number> = {
  // 南瓜月
  305: 1, 306: 1, 307: 1, 308: 1, 309: 1, 310: 1, 311: 1, 312: 1, 313: 1, 314: 1,
  315: 50, 325: 75, 326: 2, 327: 150, 329: 5, 330: 10,
  // 霜月
  338: 1, 339: 1, 340: 1, 341: 20, 342: 2, 343: 18, 344: 50, 345: 150,
  346: 100, 347: 8, 348: 4, 349: 4, 350: 3, 351: 10, 352: 5,
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
  const pts = POINTS_BY_NPC[vanillaId];
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

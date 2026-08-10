// 原版入侵系统核心（Main.cs:63775-63962 + NPC.cs:79021-79180，1.4.5.6 1:1）。
// 状态五元组持久化在 World（invasionType/Size/SizeStart/X/Delay，WorldFile.cs:1306-1339）；
// invasionWarn 是运行时字段（Game 持有，不存档——读档后立即广播一次，同原版）。
import type { World } from './World';

/** 入侵类型（InvasionID.cs） */
export const INVASION_NONE = 0;
export const INVASION_GOBLIN = 1;
export const INVASION_SNOW_LEGION = 2;
export const INVASION_PIRATE = 3;
// INVASION_MARTIAN = 4 —— 火星疯狂后续单独一期（探测器 399 + 飞碟 395）

/** NPC → 入侵组号表（NPC.GetNPCInvasionGroup, NPC.cs:79095-79180）。
 *  组 1=哥布林 2=雪人 3=海盗（含召唤物/部件：472 幻影/492 飞船炮/662 海盗幽灵） */
export const INVASION_GROUP: Record<number, number> = (() => {
  const g: Record<number, number> = {};
  for (const id of [26, 27, 28, 29, 111, 471, 472]) g[id] = 1;
  for (const id of [143, 144, 145]) g[id] = 2;
  for (const id of [212, 213, 214, 215, 216, 252, 491, 492, 662]) g[id] = 3;
  return g;
})();

/** 击杀扣分权重（NPC.cs:79026-79050；默认 1，船长 216=5，召唤师 471=10） */
export const KILL_WEIGHT: Record<number, number> = { 216: 5, 471: 10, 491: 10 };

/** 入侵进行中（SpawnHomelessNPC/SpawnTravelNPC 压制门，WorldGen.cs:4987） */
export function invasionActive(w: World): boolean {
  return w.invasionType > 0 && w.invasionDelay === 0 && w.invasionSize > 0;
}

/** CanStartInvasion（Main.cs:63863-63881）：无进行中 + 冷却为 0（ignoreDelay 可跳）+ 生命上限≥200。
 *  单人 n=1；规模公式（StartInvasion :63904-63913）按合格玩家人数，单人固定档 */
export function canStartInvasion(w: World, playerMaxHp: number, ignoreDelay = false): boolean {
  if (w.invasionType !== 0) return false;
  if (w.invasionDelay !== 0 && !ignoreDelay) return false;
  return playerMaxHp >= 200;
}

/** StartInvasion（Main.cs:63884-63933）。返回公告用的 misc 编号（approaching west/east）
 *  供调用方 newText——文案本身无参数，方向由 invasionX 决定 */
export function startInvasion(w: World, type: number): number | null {
  if (w.invasionType !== 0 && w.invasionSize === 0) w.invasionType = INVASION_NONE; // 允许胜利后立刻开
  if (w.invasionType !== 0) return null;
  const n = 1; // 单人
  w.invasionSize = 80 + 40 * n;
  if (type === INVASION_PIRATE) w.invasionSize += 40 + 20 * n;   // 海盗 120+60n
  w.invasionSizeStart = w.invasionSize;
  // invasionX（:63920-63932）：非火星 50/50 世界左右边缘；与 spawnX 的相对方向决定公告文案
  w.invasionX = Math.random() < 0.5 ? 0 : w.store.w;
  w.invasionType = type;
  return invasionWarningMisc(w);
}

/**
 * InvasionWarning 文案选择（Main.cs:63853-63862）：按剩余量与前线方向返回 LegacyMisc 编号。
 *  misc 0/1/2/3 = 哥布林 defeated/西来/东来/抵达；4-7 雪人；24-27 海盗
 */
export function invasionWarningMisc(w: World): number {
  const fromWest = w.invasionX < w.spawnX;
  const arrived = w.invasionX === w.spawnX;
  const defeated = w.invasionSize <= 0;
  switch (w.invasionType) {
    case INVASION_GOBLIN:
      return defeated ? 0 : arrived ? 3 : fromWest ? 1 : 2;
    case INVASION_SNOW_LEGION:
      return defeated ? 4 : arrived ? 7 : fromWest ? 5 : 6;
    case INVASION_PIRATE:
      return defeated ? 24 : arrived ? 27 : fromWest ? 25 : 26;
    default:
      return -1;
  }
}

/** UpdateInvasion 的状态推进（Main.cs:63775-63851，每帧调）。
 *  返回 announce = 本帧应广播的 misc 编号（null=不播）；won = 胜利帧的入侵类型
 *  （0=未胜利；类型已在本函数内清零，故用返回值传达）。公告渲染/胜利旗标副作用由调用方完成。
 *  warn 计数由调用方持有（原版 invasionWarn 字段，3600 帧周期重播） */
export function tickInvasion(w: World, warn: number): { warn: number; announce: number | null; won: number } {
  if (w.invasionType <= 0) return { warn, announce: null, won: 0 };
  let announce: number | null = null;
  // 胜利判定（:63782-63810）
  if (w.invasionSize <= 0) {
    const wonType = w.invasionType;
    announce = invasionWarningMisc(w);            // defeated 文案
    w.invasionType = INVASION_NONE;
    w.invasionDelay = 0;
    return { warn: 0, announce, won: wonType };
  }
  // 前线推进（:63813-63845）：1 tile/帧 向 spawnTileX；首次抵达即公告 arrived，
  // 且 warn 只在推进中递减（抵达后冻结——原版 warn-- 在推进分支内，抵达不再周期重播）
  if (w.invasionX !== w.spawnX) {
    if (w.invasionX < w.spawnX) w.invasionX = Math.min(w.spawnX, w.invasionX + 1);
    else w.invasionX = Math.max(w.spawnX, w.invasionX - 1);
    if (w.invasionX === w.spawnX) announce = invasionWarningMisc(w);   // arrived
    else warn--;
  }
  // 周期公告（:63846-63850）：warn<=0 → 重置 3600 并播报
  if (warn <= 0) {
    announce = announce ?? invasionWarningMisc(w);
    return { warn: 3600, announce, won: 0 };
  }
  return { warn, announce, won: 0 };
}

/** ShouldSpawnInvasionEnemies（NPC.cs:352-374）：玩家侧 invaders 判定。
 *  玩家在地面（地表+屏高内）且距前线 ±3000px；
 *  次级条件（:366-375）：前线已达地图中线 ±5 格时，玩家 ±3000px 内有城镇 NPC
 *  → 2/3 概率也判 invaders（前线过半后城镇同样被袭击） */
export function shouldSpawnInvasionEnemies(
  w: World, px: number, py: number, screenHPx: number,
  townNpcXs: number[] = [],
): boolean {
  if (!invasionActive(w)) return false;
  if (py > w.groundLevel * 16 + screenHPx && w.spawnY <= w.groundLevel) return false; // 地下
  if (Math.abs(px - w.invasionX * 16) <= 3000) return true;
  const mid = w.store.w / 2;
  if (Math.abs(w.invasionX - mid) <= 5 && townNpcXs.some((tx) => Math.abs(px - tx) < 3000)) {
    return Math.random() >= 1 / 3;   // rand.Next(3)==0 → break（false）
  }
  return false;
}

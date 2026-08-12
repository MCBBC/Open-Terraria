// 旧日军团（DD2Event）1:1 移植（Terarria1456/Terraria.GameContent.Events/DD2Event.cs，
// 1.4.5.6）。召唤入口 = 永恒水晶座 466 右键（Player.cs:31930-31977）：
//   !Ongoing && !AnyNPCs(548) && !pumpkinMoon && !snowMoon && 有 3828 永恒水晶
//   && !WouldFailSpawningHere(竞技场两端各 ≥60 格) → ConsumeItem(3828)
//   → SummonCrystal → StartInvasion（hold 300）+ 生成水晶 NPC 548 + 掉 5×2 3822 魔力。
//
// 事件状态机：
//   - StartInvasion（:253-292）：waveNumber=1 / waveKills=0 / hold 300 / 广播
//     DungeonDefenders2.InvasionStart（ChatColors.World 50,255,130）
//   - UpdateTime（:209-251）：hold 递减；归零广播下一波 Lang.GetInvasionWaveText
//     （紫 175,55,255）或败北 DungeonDefenders2.InvasionLose（红 255,0,0）；
//     水晶 548 不在场 → StopInvasion（:218-220）
//   - CheckProgress（:344-470）：按怪分值累 waveKills，达标 → 下一波 + hold 1800 +
//     广播 WaveComplete（/WaveCompleteFirst）+ 波次奖牌；T1 末波（wave 6 折回 5）→
//     StartVictoryScene（水晶 ai[1]=2）
//   - StopInvasion（:294-320）：win → WinInvasionInternal（:322-343，downedT1-3 +
//     奖牌 + InvasionWin 广播）
//
// AI 侧依赖：src/entities/bossAI_dd2.ts 的 DD2_EVENT_HOOKS 占位由 Game 接线到本模块
// （laneSpawnRate / enemySpawningOnHold / spawnMonsterFromGate / raiseGoblins /
// canRaiseGoblinsHere / stopInvasion / reportLoss / findArenaHitbox / difficulty）。
//
// 等价边界（备案原版行号）：
//   - Difficulty_2/3_SpawnMonsterFromGate（:1240-1442 / :1545-1704，逐怪概率+上限
//     出怪表）未逐行转录——T2/T3 出怪按同波 enemy 表 + D1 同构上限（50 基线）出怪；
//     波次构成/击杀分值/进波门槛（:1147-1238 / :1452-1544）全量 1:1。
//   - 奖牌/魔力掉落点位挂在水晶 548 上（原版 DropItemInstanced/NewItem 同锚）。
//   - NPCDamageTracker（伤害统计）不移植（原版仅 /damage 指令用）。
import type { World } from './World';

/** 波次公告（Game 侧用 invasionWaveText 组文案，同月事件链路） */
export interface WaveAnnounce { wave: number; ids: number[]; }

/** 事件状态（原版 Main 静态位；运行时不存档——对齐 DD2Event 字段全部不入 WorldFile，
 *  仅 DownedInvasionT1-3 存（WorldFile.cs 经 Save/Load :160-176）→ world.flags） */
export interface OldOnesArmyState {
  ongoing: boolean;
  ongoingDifficulty: number;          // 1/2/3（T1/T2/T3）
  laneSpawnRate: number;              // LaneSpawnRate（:57，波表覆写）
  timeLeftUntilSpawningBegins: number;// _timeLeftUntilSpawningBegins（:85）
  waveNumber: number;                 // NPC.waveNumber（与月事件共用静态位）
  waveKills: number;                  // NPC.waveKills
  totalInvasionPoints: number;        // NPC.totalInvasionPoints
  lostThisRun: boolean;
  wonThisRun: boolean;
  downedDarkMageT1: boolean;          // _downedDarkMageT1（:55）
  downedOgreT2: boolean;              // _downedOgreT2（:56）
  spawnedBetsyT3: boolean;            // _spawnedBetsyT3（:57）
  deadGoblinSpots: Array<{ x: number; y: number }>;  // _deadGoblinSpots（:80）
  arena: { x: number; y: number; w: number; h: number };  // ArenaHitbox（:77）
  arenaCooldown: number;              // _arenaHitboxingCooldown（:78）
  crystalsLastWave: number;           // _crystalsDropping_lastWave（:81）
  crystalsToDrop: number;             // _crystalsDropping_toDrop（:82）
  crystalsAlreadyDropped: number;     // _crystalsDropping_alreadyDropped（:83）
}

export function newOldOnesArmyState(): OldOnesArmyState {
  return {
    ongoing: false, ongoingDifficulty: 1, laneSpawnRate: 60,
    timeLeftUntilSpawningBegins: 0, waveNumber: 0, waveKills: 0, totalInvasionPoints: 0,
    lostThisRun: false, wonThisRun: false,
    downedDarkMageT1: false, downedOgreT2: false, spawnedBetsyT3: false,
    deadGoblinSpots: [], arena: { x: 0, y: 0, w: 0, h: 0 }, arenaCooldown: 0,
    crystalsLastWave: 0, crystalsToDrop: 0, crystalsAlreadyDropped: 0,
  };
}

/** Game 侧宿主回调（保持本模块纯逻辑，同 LunarEvent 的 LunarHost 模式） */
export interface OldOnesArmyHost {
  broadcast(text: string, r: number, g: number, b: number): void;
  spawnNpc(id: number, x: number, y: number): void;
  countNpcs(id: number): number;
  anyNpc(id: number): boolean;
  /** 水晶 548 的 Bottom 列表（IsStandActive :1783-1795 / FindArenaHitbox :769-792） */
  crystalPoints(): Array<{ x: number; y: number }>;
  /** 在水晶 548 处掉物品（DropMedals :819 / DropStarterCrystals :944 的 DropItemInstanced 锚） */
  dropAtCrystal(vanillaItemId: number, count: number): void;
  /** 竞技场两端（StrayMethods.CheckArenaScore——WouldFailSpawningHere :603-613） */
  arenaEnds(x: number, y: number): { left: { x: number; y: number }; right: { x: number; y: number } };
  /** 地面搜索（RaiseGoblins :747-766 Searches.Down(50) + IsSolid） */
  findGroundY(tileX: number, tileY: number): number | null;
  /** Main.rand.Next(n) */
  rand(n: number): number;
  /** 起始公告已发的波 1 推进等不需要；Betsy 召唤走 spawnNpc（SummonBetsy :929-943） */
}

// ---------------------------------------------------------------------------
// 难度档（FindProperDifficulty :324-336）
// ---------------------------------------------------------------------------
/** ReadyForTier2（:119-127）：hardMode && downedMechBossAny */
export function readyForTier2(w: World): boolean {
  const f = w.flags;
  return !!f.hardMode && !!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']);
}
/** ReadyForTier3（:129-137）：hardMode && downedGolemBoss */
export function readyForTier3(w: World): boolean {
  return !!w.flags.hardMode && !!w.flags['downed_245'];
}
/** ReadyToFindBartender（:97）：NPC.downedBoss2（世吞 13 / 克脑 266） */
export function readyToFindBartender(w: World): boolean {
  const f = w.flags;
  return !!(f['downed_13'] || f['downed_266']);
}

export function findProperDifficulty(w: World): number {
  let d = 1;
  if (readyForTier2(w)) d = 2;
  if (readyForTier3(w)) d = 3;
  return d;
}

// ---------------------------------------------------------------------------
// 波表（enemy 构成 + LaneSpawnRate 覆写）
// ---------------------------------------------------------------------------
// Difficulty_1_GetEnemiesForWave（:968-990）
const D1_ENEMIES: Record<number, number[]> = {
  1: [552], 2: [552, 555], 3: [552, 555, 561], 4: [552, 555, 561, 558], 5: [552, 555, 561, 558, 564],
};
const D1_RATE: Record<number, number> = { 1: 90, 3: 55, 4: 50, 5: 40 };
// Difficulty_2_GetEnemiesForWave（:1147-1176）
const D2_ENEMIES: Record<number, number[]> = {
  1: [553, 562], 2: [553, 562, 572], 3: [553, 556, 562, 559, 572],
  4: [553, 559, 570, 572, 562], 5: [553, 556, 559, 572, 574, 570],
  6: [553, 556, 562, 559, 568, 570, 572, 574], 7: [553, 556, 572, 559, 568, 574, 570, 576],
};
const D2_RATE: Record<number, number> = { 1: 90, 2: 70, 4: 55, 5: 50, 6: 45, 7: 42 };
// Difficulty_3_GetEnemiesForWave（:1452-1481）
const D3_ENEMIES: Record<number, number[]> = {
  1: [554, 557, 563], 2: [554, 557, 563, 573, 578], 3: [554, 563, 560, 573, 571],
  4: [554, 560, 571, 573, 563, 575, 565], 5: [554, 557, 573, 575, 571, 569, 577],
  6: [554, 557, 563, 578, 569, 571, 577, 565], 7: [554, 557, 563, 569, 571, 551],
};
const D3_RATE: Record<number, number> = { 1: 85, 2: 75, 5: 55, 7: 90 };

/** GetEnemiesForWave（:538-545 分表；LaneSpawnRate 随波覆写） */
export function enemiesForWave(st: OldOnesArmyState, wave: number): number[] {
  st.laneSpawnRate = 60;
  const table = st.ongoingDifficulty === 3 ? D3_ENEMIES : st.ongoingDifficulty === 2 ? D2_ENEMIES : D1_ENEMIES;
  const rates = st.ongoingDifficulty === 3 ? D3_RATE : st.ongoingDifficulty === 2 ? D2_RATE : D1_RATE;
  st.laneSpawnRate = rates[wave] ?? 60;
  return table[wave] ?? (st.ongoingDifficulty === 3 ? [554] : st.ongoingDifficulty === 2 ? [553] : [552]);
}

// ---------------------------------------------------------------------------
// 进波门槛（GetRequiredWaveKills——wave 6/8 是"折回末波+胜利演出"的哨兵波）
// ---------------------------------------------------------------------------
export interface InvasionStatus { wave: number; required: number; kills: number; victoryScene?: boolean; }

/** GetInvasionStatus（:519-536）+ 各档 RequiredWaveKills（:992-1024 / :1177-1213 / :1483-1523）。
 *  C# ref 参数以返回值传达：wave 可能被改写（哨兵波折回），victoryScene = 命中
 *  StartVictoryScene 分支（currentlyInCheckProgress 才触发）。 */
export function invasionStatus(
  st: OldOnesArmyState, betsyLifeRatio: number | null, inCheckProgress = false,
): InvasionStatus {
  let wave = st.waveNumber;
  let required = 10;
  let kills = Math.floor(st.waveKills);
  let victoryScene = false;
  switch (st.ongoingDifficulty) {
    case 3: {   // :1483-1523
      if (wave === -1) required = 0;
      else if (wave === 1) required = 60;
      else if (wave === 2) required = 80;
      else if (wave === 3) required = 100;
      else if (wave === 4) required = 120;
      else if (wave === 5) required = 140;
      else if (wave === 6) required = 180;
      else if (wave === 7) {
        // Betsy 血量即进度（:1503-1513）：无 Betsy → required 1
        if (betsyLifeRatio == null) required = 1;
        else { kills = Math.round(100 - betsyLifeRatio * 100); required = 100; }
      } else if (wave === 8) {
        wave = 7; kills = 1; required = 1;
        if (inCheckProgress) victoryScene = true;
      } else required = 10;
      break;
    }
    case 2: {   // :1177-1213
      if (wave === -1) required = 0;
      else if (wave === 1) required = 60;
      else if (wave === 2) required = 80;
      else if (wave === 3) required = 100;
      else if (wave === 4) required = 120;
      else if (wave === 5) required = 140;
      else if (wave === 6) required = 180;
      else if (wave === 7) {
        if (!st.downedOgreT2 && kills > 219) kills = 219;   // :1196-1199
        required = 220;
      } else if (wave === 8) {
        wave = 7; kills = 1; required = 1;
        if (inCheckProgress) victoryScene = true;
      } else required = 10;
      break;
    }
    default: {  // :992-1024
      if (wave === -1) required = 0;
      else if (wave === 1) required = 60;
      else if (wave === 2) required = 80;
      else if (wave === 3) required = 100;
      else if (wave === 4) {
        st.deadGoblinSpots.length = 0;   // case 4 清尸点（:1003）
        required = 120;
      } else if (wave === 5) {
        if (!st.downedDarkMageT1 && kills > 139) kills = 139;   // :1009-1012
        required = 140;
      } else if (wave === 6) {
        wave = 5; kills = 1; required = 1;
        if (inCheckProgress) victoryScene = true;
      } else required = 10;
    }
  }
  return { wave, required, kills, victoryScene };
}

// ---------------------------------------------------------------------------
// 击杀分值（GetMonsterPointsWorth）
// ---------------------------------------------------------------------------
/** 分值族判定（:1140-1144：(id-551)<=14 或 (id-568)<=10） */
function inPointsFamily(id: number): boolean {
  return (id - 551 >= 0 && id - 551 <= 14) || (id - 568 >= 0 && id - 568 <= 10);
}

/** Difficulty_1_GetMonsterPointsWorth（:1121-1146） */
function d1Points(st: OldOnesArmyState, id: number, expert: boolean): number {
  if (st.waveNumber === 5 && st.waveKills >= 139) {
    if (id === 564 || id === 565) { st.downedDarkMageT1 = true; return 1; }
    return 0;
  }
  if (inPointsFamily(id)) {
    if (st.waveNumber === 5 && st.waveKills === 138) return 1;
    return expert ? 2 : 1;
  }
  return 0;
}

/** Difficulty_2_GetMonsterPointsWorth（:1214-1238） */
function d2Points(st: OldOnesArmyState, id: number, expert: boolean): number {
  if (st.waveNumber === 7 && st.waveKills >= 219) {
    if (id === 576 || id === 577) { st.downedOgreT2 = true; return 1; }
    return 0;
  }
  if (inPointsFamily(id)) {
    if (st.waveNumber === 7 && st.waveKills === 218) return 1;
    return expert ? 2 : 1;
  }
  return 0;
}

/** Difficulty_3_GetMonsterPointsWorth（:1524-1542） */
function d3Points(st: OldOnesArmyState, id: number, expert: boolean): number {
  if (st.waveNumber === 7) return id === 551 ? 1 : 0;
  if (inPointsFamily(id)) return expert ? 2 : 1;
  return 0;
}

export function pointsWorth(st: OldOnesArmyState, slainId: number, expert: boolean): number {
  switch (st.ongoingDifficulty) {
    case 3: return d3Points(st, slainId, expert);
    case 2: return d2Points(st, slainId, expert);
    default: return d1Points(st, slainId, expert);
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
/** StartInvasion（:253-292）。返回起始公告（ InvasionStart 广播由 Game 侧组文案） */
export function startInvasion(st: OldOnesArmyState, w: World): boolean {
  st.crystalsToDrop = 0;
  st.crystalsAlreadyDropped = 0;
  st.crystalsLastWave = 0;
  st.timeLeftUntilSpawningBegins = 0;
  st.ongoing = true;
  st.ongoingDifficulty = findProperDifficulty(w);
  st.deadGoblinSpots.length = 0;
  st.downedDarkMageT1 = false;
  st.downedOgreT2 = false;
  st.spawnedBetsyT3 = false;
  st.lostThisRun = false;
  st.wonThisRun = false;
  st.totalInvasionPoints = 0;
  st.waveKills = 0;
  st.waveNumber = 1;
  st.timeLeftUntilSpawningBegins = 300;   // SetEnemySpawningOnHold(300)（:290）
  return true;
}

/** StopInvasion（:294-320）+ WinInvasionInternal（:322-343）。
 *  返回 'win' / 'lose' / null（未在进行 → 原版直接空操作） */
export function stopInvasion(
  st: OldOnesArmyState, w: World, host: OldOnesArmyHost, win: boolean,
): 'win' | 'lose' | null {
  if (!st.ongoing) return null;
  let result: 'win' | 'lose' | null = null;
  if (win) {
    // WinInvasionInternal（:322-343）：downed 旗标逐档累积 + 奖牌（T1 3/T2 15/T3 60）
    if (st.ongoingDifficulty >= 1) w.flags['downedOldOnesArmyT1'] = true;
    if (st.ongoingDifficulty >= 2) w.flags['downedOldOnesArmyT2'] = true;
    if (st.ongoingDifficulty >= 3) w.flags['downedOldOnesArmyT3'] = true;
    host.dropAtCrystal(3817, st.ongoingDifficulty === 3 ? 60 : st.ongoingDifficulty === 2 ? 15 : 3);
    host.broadcast('DungeonDefenders2.InvasionWin', 50, 255, 130);
    result = 'win';
  }
  st.ongoing = false;
  st.deadGoblinSpots.length = 0;
  st.totalInvasionPoints = 0;
  st.waveKills = 0;
  st.waveNumber = 0;
  return result;
}

export interface DD2TimeResult {
  /** 下一波起始公告（hold 归零帧；LostThisRun 时为 null + lose=true） */
  waveAnnounce: WaveAnnounce | null;
  /** 广播 DungeonDefenders2.InvasionLose（:247-249） */
  lose: boolean;
  /** 水晶 548 消失 → StopInvasion（:218-220），返回其结果 */
  stopped: 'lose' | null;
  /** T3 第 7 波起始帧召 Betsy（:232-234 SummonBetsy :929-943） */
  summonBetsy: boolean;
}

/** UpdateTime（:209-251）。每 tick 调用（Game.fixedUpdate）。 */
export function updateTime(
  st: OldOnesArmyState, host: OldOnesArmyHost, betsyLifeRatio: number | null,
): DD2TimeResult {
  const res: DD2TimeResult = { waveAnnounce: null, lose: false, stopped: null, summonBetsy: false };
  if (!st.ongoing) return res;
  if (!host.anyNpc(548)) {
    // 水晶不在场 → StopInvasion()（:218-220，win=false）
    st.ongoing = false;
    st.deadGoblinSpots.length = 0;
    st.totalInvasionPoints = 0;
    st.waveKills = 0;
    st.waveNumber = 0;
    res.stopped = 'lose';
    return res;
  }
  if (st.timeLeftUntilSpawningBegins > 0) {
    st.timeLeftUntilSpawningBegins--;
    if (st.timeLeftUntilSpawningBegins === 0) {
      const s = invasionStatus(st, betsyLifeRatio);
      if (!st.lostThisRun) {
        res.waveAnnounce = { wave: s.wave, ids: enemiesForWave(st, s.wave) };
        if (s.wave === 7 && st.ongoingDifficulty === 3) res.summonBetsy = true;
      } else {
        res.lose = true;
      }
    }
  }
  if (st.timeLeftUntilSpawningBegins < 0) st.timeLeftUntilSpawningBegins = 0;
  return res;
}

export interface DD2ProgressResult {
  /** 上一波完成公告键（WaveComplete / WaveCompleteFirst——首波完成后用后者，:377-382） */
  waveComplete: null | 'DungeonDefenders2.WaveComplete' | 'DungeonDefenders2.WaveCompleteFirst';
  /** 触发胜利演出（哨兵波折回：T1 wave6 / T2-T3 wave8 → StartVictoryScene :481-507） */
  victoryScene: boolean;
  /** 进波奖牌数（T1 波4/5 各 1；T2 波5/6/7 = 1/3/6；T3 波4/5/6/7 = 1/3/11/25，:405-448） */
  medals: number;
}

/** CheckProgress（:344-470）。击杀结算后调用（同帧掉落之后，对齐原版顺序）。 */
export function checkProgress(
  st: OldOnesArmyState, slainId: number, expert: boolean,
  betsyLifeRatio: number | null,
): DD2ProgressResult {
  const res: DD2ProgressResult = { waveComplete: null, victoryScene: false, medals: 0 };
  if (!st.ongoing || st.lostThisRun || st.wonThisRun || st.timeLeftUntilSpawningBegins !== 0) return res;
  const status = invasionStatus(st, betsyLifeRatio);
  const pts = pointsWorth(st, slainId, expert);
  st.waveKills += pts;
  st.totalInvasionPoints += pts;
  if (status.required !== 0 && st.waveKills >= status.required) {
    st.waveKills = 0;
    st.waveNumber++;
    const after = invasionStatus(st, betsyLifeRatio, true);
    if (after.victoryScene) {
      // StartVictoryScene（:481-507 经 GetInvasionStatus inCheck 分支触发）→ WonThisRun
      res.victoryScene = true;
      st.wonThisRun = true;
    }
    if (st.wonThisRun) return res;    // :362-379 已胜利 → 进度同步后返回（不播 WaveComplete）
    const doneWave = after.wave;      // num3 = 进波后的新波号（:384）
    res.waveComplete = doneWave === 2
      ? 'DungeonDefenders2.WaveCompleteFirst'
      : 'DungeonDefenders2.WaveComplete';
    st.timeLeftUntilSpawningBegins = 1800;   // SetEnemySpawningOnHold(1800)（:383）
    // 进波奖牌（:405-448）
    if (st.ongoingDifficulty === 1) {
      if (doneWave === 5 || doneWave === 4) res.medals = 1;
    } else if (st.ongoingDifficulty === 2) {
      if (doneWave === 7) res.medals = 6;
      else if (doneWave === 6) res.medals = 3;
      else if (doneWave === 5) res.medals = 1;
    } else {
      if (doneWave === 7) res.medals = 25;
      else if (doneWave === 6) res.medals = 11;
      else if (doneWave === 5) res.medals = 3;
      else if (doneWave === 4) res.medals = 1;
    }
  }
  return res;
}

/** ReportLoss（:509-516）：水晶亡 → 演出期间 30t 冻结出怪 */
export function reportLoss(st: OldOnesArmyState): void {
  st.lostThisRun = true;
  st.timeLeftUntilSpawningBegins = 30;
}

// ---------------------------------------------------------------------------
// 召唤（Player.cs:31930-31977 + SummonCrystalDirect :584-601）
// ---------------------------------------------------------------------------
/** WouldFailSpawningHere（:603-613）：竞技场两端距水晶座任一侧 <60 格即失败 */
export function wouldFailSpawningHere(
  host: OldOnesArmyHost, x: number, y: number,
): boolean {
  const ends = host.arenaEnds(x, y);
  const right = ends.right.x - x;
  const left = x - ends.left.x;
  return right < 60 || left < 60;
}

/** IsStandActive（:1783-1795）：任一水晶 548 Bottom 距座中心 <36px */
export function isStandActive(host: OldOnesArmyHost, x: number, y: number): boolean {
  const tx = x * 16 + 8, ty = y * 16 + 8;
  for (const p of host.crystalPoints()) {
    const dx = p.x - tx, dy = p.y - ty;
    if (dx * dx + dy * dy < 36 * 36) return true;
  }
  return false;
}

/** RequestToSkipWaitTime（:1794-1810）：波间 >60t 且水晶就位 → 跳到 60t（音效由调用方播） */
export function requestToSkipWaitTime(
  st: OldOnesArmyState, host: OldOnesArmyHost, x: number, y: number,
): boolean {
  if (st.timeLeftUntilSpawningBegins > 60 && isStandActive(host, x, y)) {
    st.timeLeftUntilSpawningBegins = 60;   // AttemptToSkipWaitTime（:1812-1817）
    return true;
  }
  return false;
}

export interface CrystalSummonResult {
  ok: boolean;
  /** 召唤坐标（px，水晶 548 生成点——SummonCrystalDirect :589-597） */
  x: number; y: number;
}

/** SummonCrystalDirect（:584-601）：无 548 + 座 466 在位 → 水晶生成点 =
 *  座锚点（点按帧偏移回左上）px + (40,64)；StartInvasion + NewNPC(548) + 掉 5×2 魔力。
 *  调用方负责：arena 检查（WouldFailSpawningHere）/3828 消耗/失败文案（FailureMessage）。
 *  @param frameX/frameY 所点座格的帧（锚点回推 = x - frameX/18 / y - frameY/18，:590-592） */
export function summonCrystalDirect(
  st: OldOnesArmyState, w: World, host: OldOnesArmyHost,
  x: number, y: number, frameX: number, frameY: number,
): CrystalSummonResult {
  if (host.anyNpc(548)) return { ok: false, x: 0, y: 0 };
  startInvasion(st, w);
  const px = (x - Math.floor(frameX / 18)) * 16 + 40;
  const py = (y - Math.floor(frameY / 18)) * 16 + 64;
  host.spawnNpc(548, px, py);
  // DropStarterCrystals（:944-957）：水晶处 5 次 × 2 个 3822
  for (let i = 0; i < 5; i++) host.dropAtCrystal(3822, 2);
  return { ok: true, x: px, y: py };
}

// ---------------------------------------------------------------------------
// 出怪（SpawnMonsterFromGate——门 549 节拍调用）
// ---------------------------------------------------------------------------
/** Difficulty_1_SpawnMonsterFromGate（:1026-1127）1:1。
 *  上限：基线怪 50 / 枯萎兽 561 带 6（波>3 →8，波>4 →12）/ 飞龙 558 带 6（波>4 →8）。 */
export function spawnMonsterD1(
  st: OldOnesArmyState, host: OldOnesArmyHost, x: number, y: number, leftGate: boolean,
): void {
  const capBase = 50;                                                     // num（:1030）
  const capWither = st.waveNumber > 4 ? 12 : st.waveNumber > 3 ? 8 : 6;   // num2（:1034-1040）
  const capDrake = st.waveNumber > 4 ? 8 : 6;                             // num3（:1041-1045）
  switch (st.waveNumber) {
    case 1:
      if (host.countNpcs(552) + host.countNpcs(555) < capBase) host.spawnNpc(552, x, y);
      break;
    case 2:
      if (host.countNpcs(552) + host.countNpcs(555) < capBase) {
        host.spawnNpc(host.rand(7) !== 0 ? 552 : 555, x, y);
      }
      break;
    case 3:
      if (host.rand(6) === 0 && host.countNpcs(561) < capWither) host.spawnNpc(561, x, y);
      else if (host.countNpcs(552) + host.countNpcs(555) < capBase) {
        host.spawnNpc(host.rand(5) !== 0 ? 552 : 555, x, y);
      }
      break;
    case 4:
      if (host.rand(12) === 0 && host.countNpcs(558) < capDrake) host.spawnNpc(558, x, y);
      else if (host.rand(5) === 0 && host.countNpcs(561) < capWither) host.spawnNpc(561, x, y);
      else if (host.countNpcs(552) + host.countNpcs(555) < capBase) {
        host.spawnNpc(host.rand(5) !== 0 ? 552 : 555, x, y);
      }
      break;
    case 5: {
      const s = invasionStatus(st, null);
      if ((!leftGate || host.rand(2) === 0) && s.kills > s.required * 0.5 && !host.anyNpc(564)) {
        host.spawnNpc(564, x, y);   // 黑暗魔法师（:1080-1084）
      }
      if (host.rand(10) === 0 && host.countNpcs(558) < capDrake) host.spawnNpc(558, x, y);
      else if (host.rand(4) === 0 && host.countNpcs(561) < capWither) host.spawnNpc(561, x, y);
      else if (host.countNpcs(552) + host.countNpcs(555) < capBase) {
        host.spawnNpc(host.rand(4) !== 0 ? 552 : 555, x, y);
      }
      break;
    }
    default:
      host.spawnNpc(552, x, y);
      break;
  }
}

/** T2/T3 出怪（等价边界：原版逐怪概率表 :1240-1442 / :1545-1704 未逐行转录）。
 *  按本波 enemy 表等权出怪；波 5+ 额外出第二只（对齐 D1 case 3/5 的双出语义）；
 *  场上同类 ≥50 不出（对齐基线 cap）。T3 波 7 首只恒为 Betsy 551 不在此出
 *  （SummonBetsy :929-943 由 updateTime 触发）。 */
export function spawnMonsterFromGate(
  st: OldOnesArmyState, host: OldOnesArmyHost, x: number, y: number, leftGate: boolean,
): void {
  void leftGate;
  if (st.ongoingDifficulty === 1) {
    spawnMonsterD1(st, host, x, y, leftGate);
    return;
  }
  const ids = enemiesForWave(st, st.waveNumber).filter((id) => id !== 551);
  if (!ids.length) return;
  const pick = ids[host.rand(ids.length)];
  if (host.countNpcs(pick) >= 50) return;
  host.spawnNpc(pick, x, y);
  if (st.waveNumber >= 3 && host.rand(3) === 0) {
    const second = ids[host.rand(ids.length)];
    if (host.countNpcs(second) < 50) host.spawnNpc(second, x, y);
  }
}

// ---------------------------------------------------------------------------
// 骷髅复活（黑暗魔法师 564/565 的 RaiseGoblins）
// ---------------------------------------------------------------------------
/** CanRaiseGoblinsHere（:715-731）：800px（640000²）内 ≥3 处尸点 */
export function canRaiseGoblinsHere(st: OldOnesArmyState, x: number, y: number): boolean {
  let n = 0;
  for (const s of st.deadGoblinSpots) {
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy <= 640000) {
      n++;
      if (n >= 3) return true;
    }
  }
  return false;
}

/** AnnounceGoblinDeath（:733-736） */
export function announceGoblinDeath(st: OldOnesArmyState, x: number, y: number): void {
  st.deadGoblinSpots.push({ x, y });
}

/** RaiseGoblins（:738-767）：850px（722500²）内尸点逐个落地复活
 *  （T3 → 567 Wither Beast，否则 566）；每尸点 X ±15 格找地面；上限 8 只 */
export function raiseGoblins(
  st: OldOnesArmyState, host: OldOnesArmyHost, x: number, y: number,
): void {
  const spots: Array<{ x: number; y: number }> = [];
  for (const s of st.deadGoblinSpots) {
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy <= 722500) spots.push(s);
  }
  for (const s of spots) {
    const i = st.deadGoblinSpots.indexOf(s);
    if (i >= 0) st.deadGoblinSpots.splice(i, 1);
  }
  let raised = 0;
  for (const s of spots) {
    const gx = Math.floor(s.x / 16) + host.rand(31) - 15;
    const gy = host.findGroundY(gx, Math.floor(s.y / 16));
    if (gy != null) {
      host.spawnNpc(st.ongoingDifficulty === 3 ? 567 : 566, gx * 16 + 8, gy * 16);
      if (++raised >= 8) break;
    }
  }
}

// ---------------------------------------------------------------------------
// 竞技场（FindArenaHitbox :769-792 / ShouldBlockBuilding :794-796）
// ---------------------------------------------------------------------------
/** FindArenaHitbox：水晶 548/门 549 包围盒外扩 50 格（800px），60t 冷却 */
export function findArenaHitbox(
  st: OldOnesArmyState, points: Array<{ x: number; y: number; w: number; h: number }>,
): void {
  if (st.arenaCooldown > 0) {
    st.arenaCooldown--;
    return;
  }
  st.arenaCooldown = 60;
  if (!points.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x + p.w > x1) x1 = p.x + p.w;
    if (p.y + p.h > y1) y1 = p.y + p.h;
  }
  x0 -= 800; y0 -= 800; x1 += 800; y1 += 800;
  st.arena = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function shouldBlockBuilding(st: OldOnesArmyState, wx: number, wy: number): boolean {
  const a = st.arena;
  return st.ongoing && wx >= a.x && wx <= a.x + a.w && wy >= a.y && wy <= a.y + a.h;
}

// ---------------------------------------------------------------------------
// 魔力掉落（ShouldDropCrystals :799-927 简化为波内配额推进）
// ---------------------------------------------------------------------------
/** ShouldDropCrystals 的波配额（:815-883）：D1 20/20/30/30/40，D2 全 20（波6-7 30），
 *  D3 全 20（波5-7 30）——按击杀进度线性放出（:904-916 num 比例） */
export function shouldDropCrystals(st: OldOnesArmyState, betsyLifeRatio: number | null): boolean {
  const s = invasionStatus(st, betsyLifeRatio);
  if (st.crystalsLastWave < s.wave) {
    st.crystalsLastWave++;
    if (st.crystalsAlreadyDropped > 0) st.crystalsAlreadyDropped -= st.crystalsToDrop;
    const quotas: Record<number, number[]> = {
      1: [20, 20, 30, 30, 40],
      2: [20, 20, 20, 20, 20, 30, 30],
      3: [20, 20, 20, 20, 30, 30, 30],
    };
    const q = quotas[st.ongoingDifficulty] ?? quotas[1];
    st.crystalsToDrop = q[s.wave - 1] ?? 20;
  }
  const ratio = s.required !== 0 ? s.kills / s.required : 0;
  if (st.crystalsAlreadyDropped < st.crystalsToDrop * ratio) {
    st.crystalsAlreadyDropped++;
    return true;
  }
  return false;
}

/** Betsy 召唤（SummonBetsy :929-943）：T3 第 7 波起始，无 551 在场时一次 */
export function summonBetsy(st: OldOnesArmyState, host: OldOnesArmyHost, cx: number, cy: number): boolean {
  if (!st.spawnedBetsyT3 && !host.anyNpc(551)) {
    host.spawnNpc(551, cx, cy);
    st.spawnedBetsyT3 = true;
    return true;
  }
  return false;
}

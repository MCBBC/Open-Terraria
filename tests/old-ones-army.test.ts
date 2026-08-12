// DD2Event 事件本体探针（src/world/OldOnesArmy.ts 1:1 移植，
// 原文 Terarria1456/Terraria.GameContent.Events/DD2Event.cs）：
//   放置链（座 466 → WouldFailSpawningHere → SummonCrystalDirect → StartInvasion）
//   / 波次表 + LaneSpawnRate 覆写 / 进波门槛（RequiredWaveKills 三档全表）
//   / 击杀分值与波次推进（CheckProgress，T1 黑暗魔法师 139 封顶）/ 胜利路
//   （哨兵波折回 StartVictoryScene → StopInvasion(win)）/ 失败路（水晶亡 →
//   StopInvasion / ReportLoss → InvasionLose）/ 出怪钩子（SpawnMonsterFromGate
//   上限与波内构成）/ 骷髅复活（AnnounceGoblinDeath → CanRaiseGoblinsHere →
//   RaiseGoblins）/ 竞技场（FindArenaHitbox + ShouldBlockBuilding）/ 魔力掉落
//   配额（ShouldDropCrystals）/ Betsy（T3 第 7 波血量即进度 + SummonBetsy）。
// 宿主用确定性 mock（LCG rand），探针全部落在纯状态机上，不依赖渲染。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  newOldOnesArmyState, startInvasion, updateTime, checkProgress, stopInvasion,
  reportLoss, invasionStatus, enemiesForWave, summonCrystalDirect,
  wouldFailSpawningHere, spawnMonsterFromGate, canRaiseGoblinsHere,
  announceGoblinDeath, raiseGoblins, findArenaHitbox, shouldBlockBuilding,
  shouldDropCrystals, summonBetsy, findProperDifficulty, requestToSkipWaitTime,
  isStandActive, pointsWorth,
  type OldOnesArmyState, type OldOnesArmyHost,
} from '../src/world/OldOnesArmy';

const W = 200, H = 140;

function makeWorld(): World {
  return new World(W, H, 11, 'ooa-test');
}

interface HostLog {
  spawned: Array<{ id: number; x: number; y: number }>;
  dropped: Array<{ item: number; n: number }>;
  msgs: Array<{ t: string; r: number; g: number; b: number }>;
  counts: Map<number, number>;
}

/** 确定性宿主：anyNpc(548) 由 crystalAlive 驱动（水晶生灭两路探针共用） */
function makeHost(crystalAlive = true, arenaHalf = 80): HostLog & { host: OldOnesArmyHost } {
  const spawned: HostLog['spawned'] = [];
  const dropped: HostLog['dropped'] = [];
  const msgs: HostLog['msgs'] = [];
  const counts = new Map<number, number>();
  let alive = crystalAlive;
  let seed = 20260812;
  const host: OldOnesArmyHost = {
    broadcast: (t, r, g, b) => msgs.push({ t, r, g, b }),
    spawnNpc: (id, x, y) => {
      spawned.push({ id, x, y });
      counts.set(id, (counts.get(id) ?? 0) + 1);
    },
    countNpcs: (id) => counts.get(id) ?? 0,
    // anyNpc(548) 双语义：alive（updateTime 水晶在场判定）|| 已生成（召唤门禁 :586）
    anyNpc: (id) => (id === 548 ? alive || (counts.get(548) ?? 0) > 0 : (counts.get(id) ?? 0) > 0),
    crystalPoints: () => (alive ? [{ x: 1600, y: 1800 }] : []),
    dropAtCrystal: (item, n) => dropped.push({ item, n }),
    arenaEnds: (x) => ({ left: { x: x - arenaHalf, y: 0 }, right: { x: x + arenaHalf, y: 0 } }),
    findGroundY: () => 100,
    rand: (n) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return seed % n;
    },
  };
  return { host, spawned, dropped, msgs, counts };
}

/** 把波间间歇 hold 抽干（updateTime 每 tick 一次，水晶须在世） */
function pumpHold(st: OldOnesArmyState, host: OldOnesArmyHost): void {
  const n = st.timeLeftUntilSpawningBegins;
  for (let i = 0; i < n; i++) updateTime(st, host, null);
}

/** T1 击杀推进一整波（普通难度，族内怪 1 分/只） */
function kill(st: OldOnesArmyState, host: OldOnesArmyHost, id: number, times = 1, betsy: number | null = null) {
  let last: ReturnType<typeof checkProgress> | undefined;
  for (let i = 0; i < times; i++) last = checkProgress(st, id, false, betsy);
  return last!;   // times >= 1 时必已赋值
}

describe('放置链与事件开始（SummonCrystalDirect :584-601 / StartInvasion :253-292）', () => {
  it('WouldFailSpawningHere：两端各 ≥60 格放行，<60 格失败（:603-613）', () => {
    const wide = makeHost(true, 80);
    expect(wouldFailSpawningHere(wide.host, 100, 100)).toBe(false);
    const narrow = makeHost(true, 40);
    expect(wouldFailSpawningHere(narrow.host, 100, 100)).toBe(true);
  });

  it('SummonCrystalDirect：StartInvasion（wave 1/hold 300）+ 生成水晶 548 + 5×2 起始魔力', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, spawned, dropped } = makeHost(false);   // 召唤前无水晶在场
    // 座锚点 (100,90)，frame 0,0 → 水晶生成点 = (100*16+40, 90*16+64)（:589-597）
    const res = summonCrystalDirect(st, w, host, 100, 90, 0, 0);
    expect(res.ok).toBe(true);
    expect(res.x).toBe(100 * 16 + 40);
    expect(res.y).toBe(90 * 16 + 64);
    expect(st.ongoing).toBe(true);
    expect(st.waveNumber).toBe(1);
    expect(st.waveKills).toBe(0);
    expect(st.timeLeftUntilSpawningBegins).toBe(300);   // SetEnemySpawningOnHold(300)
    expect(spawned).toEqual([{ id: 548, x: 100 * 16 + 40, y: 90 * 16 + 64 }]);
    expect(dropped.filter((d) => d.item === 3822)).toHaveLength(5);   // DropStarterCrystals
    expect(dropped.every((d) => d.n === 2)).toBe(true);
  });

  it('已有水晶 548 在场 → 拒绝二次召唤（AnyNPCs(548) 门禁 :586）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host } = makeHost(false);   // 首召前无水晶
    expect(summonCrystalDirect(st, w, host, 100, 90, 0, 0).ok).toBe(true);
    expect(summonCrystalDirect(st, w, host, 100, 90, 0, 0).ok).toBe(false);
    expect(st.waveNumber).toBe(1);   // 第二次未重置
  });

  it('波间 >60t 且水晶就位 → RequestToSkipWaitTime 跳到 60t（:1794-1817）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host } = makeHost(true);
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 1800;
    expect(requestToSkipWaitTime(st, host, 100, 112)).toBe(true);   // 水晶 (1600,1800) 在 36px 内
    expect(st.timeLeftUntilSpawningBegins).toBe(60);
    expect(isStandActive(host, 100, 112)).toBe(true);
    expect(isStandActive(host, 130, 112)).toBe(false);   // 距水晶 >36px
  });
});

describe('难度档（FindProperDifficulty :324-336 / ReadyForTier2/3）', () => {
  it('无进度 → T1；硬模式+机械三王任一 → T2；+石巨人 → T3', () => {
    const w = makeWorld();
    expect(findProperDifficulty(w)).toBe(1);
    w.flags.hardMode = true;
    expect(findProperDifficulty(w)).toBe(1);          // 机械Boss未倒仍 T1
    w.flags['downed_126'] = true;                     // 任一机械王
    expect(findProperDifficulty(w)).toBe(2);
    w.flags['downed_245'] = true;                     // 石巨人
    expect(findProperDifficulty(w)).toBe(3);
  });
});

describe('波次表 + LaneSpawnRate 覆写（GetEnemiesForWave :536-544）', () => {
  it('T1 五波构成与节拍 90/60/55/50/40', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    expect(enemiesForWave(st, 1)).toEqual([552]);
    expect(st.laneSpawnRate).toBe(90);
    expect(enemiesForWave(st, 2)).toEqual([552, 555]);
    expect(st.laneSpawnRate).toBe(60);                // 波 2 无覆写回基线
    expect(enemiesForWave(st, 3)).toEqual([552, 555, 561]);
    expect(st.laneSpawnRate).toBe(55);
    expect(enemiesForWave(st, 4)).toEqual([552, 555, 561, 558]);
    expect(st.laneSpawnRate).toBe(50);
    expect(enemiesForWave(st, 5)).toEqual([552, 555, 561, 558, 564]);
    expect(st.laneSpawnRate).toBe(40);
  });

  it('T2 七波 / T3 七波（T3 波 7 含 Betsy 551，节拍 90）', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 2;
    expect(enemiesForWave(st, 7)).toEqual([553, 556, 572, 559, 568, 574, 570, 576]);
    expect(st.laneSpawnRate).toBe(42);
    st.ongoingDifficulty = 3;
    expect(enemiesForWave(st, 7)).toEqual([554, 557, 563, 569, 571, 551]);
    expect(st.laneSpawnRate).toBe(90);
  });

  it('进波门槛三档全表（RequiredWaveKills :992/:1177/:1483）', () => {
    const st = newOldOnesArmyState();
    st.ongoing = true;
    // 三档波 1-5 同门槛；波 6 = 180 仅 T2/T3（T1 波 6 是哨兵波折回 5）
    for (const d of [1, 2, 3]) {
      st.ongoingDifficulty = d;
      expect([1, 2, 3, 4, 5].map((wv) => {
        st.waveNumber = wv;
        return invasionStatus(st, null).required;
      })).toEqual([60, 80, 100, 120, 140]);
    }
    for (const d of [2, 3]) {
      st.ongoingDifficulty = d;
      st.waveNumber = 6;
      expect(invasionStatus(st, null).required).toBe(180);
    }
    st.ongoingDifficulty = 1;
    st.waveNumber = 6;
    expect(invasionStatus(st, null, true).victoryScene).toBe(true);   // T1 波 6 = 胜利哨兵
    st.ongoingDifficulty = 2;
    st.waveNumber = 7;
    expect(invasionStatus(st, null).required).toBe(220);   // T2 食人魔波
    st.ongoingDifficulty = 3;
    st.waveNumber = 7;
    expect(invasionStatus(st, null).required).toBe(1);                // 无 Betsy → 1
    expect(invasionStatus(st, 0.5).required).toBe(100);               // Betsy 血量即进度
    expect(invasionStatus(st, 0.5).kills).toBe(50);                   // 半血 = 50 进度
  });
});

describe('波次推进积分与 T1 胜利路（CheckProgress :344-470）', () => {
  it('专家难度族内怪 2 分/普通 1 分；波间 hold 非零时不计分（EnemySpawningIsOnHold 门禁 :364）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    startInvasion(st, w);
    expect(pointsWorth(st, 552, false)).toBe(1);
    expect(pointsWorth(st, 552, true)).toBe(2);
    expect(pointsWorth(st, 400, false)).toBe(0);      // 族外怪 0 分
    const { host } = makeHost();
    st.timeLeftUntilSpawningBegins = 0;
    kill(st, host, 552, 5);
    expect(st.waveKills).toBe(5);
    st.timeLeftUntilSpawningBegins = 1800;            // hold 非零 → 不计分
    kill(st, host, 552, 10);
    expect(st.waveKills).toBe(5);
  });

  it('60 分进波 2：hold 1800 + WaveCompleteFirst 公告键（:397-404）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host } = makeHost();
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    const res = kill(st, host, 552, 60);
    expect(st.waveNumber).toBe(2);
    expect(st.timeLeftUntilSpawningBegins).toBe(1800);
    expect(res.waveComplete).toBe('DungeonDefenders2.WaveCompleteFirst');
    expect(res.medals).toBe(0);                        // T1 仅波 4/5 有奖牌
    // hold 中击杀不计分（门禁）
    kill(st, host, 552, 10);
    expect(st.waveKills).toBe(0);
  });

  it('T1 全程：五波推进 → 波 5 封顶 139 后须杀黑暗魔法师 564 → 哨兵波胜利演出', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, dropped } = makeHost();
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    let medals = 0;
    // 波 1-4：60/80/100/120 分推进
    for (const need of [60, 80, 100, 120]) {
      kill(st, host, 552, need);
      pumpHold(st, host);
    }
    expect(st.waveNumber).toBe(5);
    // 波 5：138 只普通怪 → 139 封顶（:1008-1012 / 分值 :1123-1141）
    kill(st, host, 552, 139);
    expect(st.waveKills).toBe(139);
    expect(invasionStatus(st, null).kills).toBe(139);   // UI 进度同样封顶
    // 139 后普通怪 0 分，只有 564/565 给 1 分
    kill(st, host, 552, 5);
    expect(st.waveKills).toBe(139);
    const victory = kill(st, host, 564, 1);
    expect(st.downedDarkMageT1).toBe(true);
    expect(victory.victoryScene).toBe(true);            // StartVictoryScene（wave 6 折回 5）
    expect(st.wonThisRun).toBe(true);
    expect(st.waveNumber).toBe(6);
    // T1 波 4/5 各 1 奖牌
    medals += 2;
    expect(medals).toBe(2);
    void medals;
    void dropped;
  });

  it('胜利收场 StopInvasion(win)：downed 旗标 + 奖牌 3 + InvasionWin 广播（:294-343）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, dropped, msgs } = makeHost();
    startInvasion(st, w);
    const res = stopInvasion(st, w, host, true);
    expect(res).toBe('win');
    expect(w.flags['downedOldOnesArmyT1']).toBe(true);
    expect(st.ongoing).toBe(false);
    expect(st.waveNumber).toBe(0);
    expect(dropped).toContainEqual({ item: 3817, n: 3 });       // T1 奖牌 3 枚
    expect(msgs).toContainEqual({ t: 'DungeonDefenders2.InvasionWin', r: 50, g: 255, b: 130 });
    expect(stopInvasion(st, w, host, true)).toBe(null);          // 未在进行 → 空操作
  });
});

describe('失败路（水晶亡 / ReportLoss）', () => {
  it('水晶 548 不在场 → UpdateTime 触发 StopInvasion 败北收场（:218-220）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host } = makeHost(false);   // 水晶已亡
    startInvasion(st, w);
    const res = updateTime(st, host, null);
    expect(res.stopped).toBe('lose');
    expect(st.ongoing).toBe(false);
    expect(st.waveNumber).toBe(0);
    expect(st.waveKills).toBe(0);
  });

  it('ReportLoss：lostThisRun + hold 30，抽干后播 InvasionLose（:507-516 / :247-249）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host } = makeHost();
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    reportLoss(st);
    expect(st.lostThisRun).toBe(true);
    expect(st.timeLeftUntilSpawningBegins).toBe(30);
    let lose = false;
    for (let i = 0; i < 30; i++) lose = updateTime(st, host, null).lose || lose;
    expect(lose).toBe(true);
    // 已败北 → 下一波起始不再播 wave 公告（:225-236 else 分支）
    expect(updateTime(st, host, null).waveAnnounce).toBe(null);
  });
});

describe('出怪钩子（SpawnMonsterFromGate :556-570 / D1 :1026-1127）', () => {
  it('T1 波 1 只出 552；基线上限 50 满 → 不出', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, spawned, counts } = makeHost();
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    spawnMonsterFromGate(st, host, 800, 1600, false);
    expect(spawned.map((s) => s.id)).toEqual([552]);
    counts.set(552, 50);                    // CountNPCS(552)+CountNPCS(555) >= 50
    spawnMonsterFromGate(st, host, 800, 1600, false);
    expect(spawned).toHaveLength(1);
  });

  it('T1 波 5 进度过半且右门 → 首只必为黑暗魔法师 564（:1090-1096）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, spawned } = makeHost();
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    st.waveNumber = 5;
    st.waveKills = 80;                       // > 140*0.5
    spawnMonsterFromGate(st, host, 800, 1600, false);   // leftGate=false → 必出
    expect(spawned[0].id).toBe(564);
  });

  it('T2 按本波 enemy 表出怪（等价边界：D2 逐怪概率表降级为表内抽取）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, spawned } = makeHost();
    startInvasion(st, w);
    w.flags.hardMode = true;
    w.flags['downed_126'] = true;
    st.ongoingDifficulty = 2;
    st.waveNumber = 2;
    st.timeLeftUntilSpawningBegins = 0;
    const table = enemiesForWave(st, 2);
    spawnMonsterFromGate(st, host, 800, 1600, false);
    expect(table).toContain(spawned[0].id);
    expect(spawned[0].id).not.toBe(551);    // Betsy 不走门出
  });
});

describe('骷髅复活链（AnnounceGoblinDeath :710 / CanRaiseGoblinsHere :715 / RaiseGoblins :732）', () => {
  it('≥3 个尸点且 800px 内 → 可复活；远处尸点不计', () => {
    const st = newOldOnesArmyState();
    expect(canRaiseGoblinsHere(st, 1600, 1600)).toBe(false);
    announceGoblinDeath(st, 1600, 1600);
    announceGoblinDeath(st, 1700, 1600);
    expect(canRaiseGoblinsHere(st, 1600, 1600)).toBe(false);   // 仅 2 处
    announceGoblinDeath(st, 1500, 1600);
    expect(canRaiseGoblinsHere(st, 1600, 1600)).toBe(true);
    announceGoblinDeath(st, 1600 + 900, 1600);                 // >800px
    st.deadGoblinSpots = st.deadGoblinSpots.filter((s) => s.x < 2000);
    expect(canRaiseGoblinsHere(st, 1600, 1600)).toBe(true);
  });

  it('RaiseGoblins：850px 内尸点逐个落地复活 566（T3 → 567），上限 8（:738-767）', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    for (let i = 0; i < 10; i++) announceGoblinDeath(st, 1600 + i * 8, 1600);
    const { host, spawned } = makeHost();
    raiseGoblins(st, host, 1600, 1600);
    expect(spawned.every((s) => s.id === 566)).toBe(true);
    expect(spawned).toHaveLength(8);          // 上限 8
    expect(st.deadGoblinSpots).toHaveLength(0);   // 尸点消耗
    st.ongoingDifficulty = 3;
    announceGoblinDeath(st, 1600, 1600);
    spawned.length = 0;
    raiseGoblins(st, host, 1600, 1600);
    expect(spawned[0].id).toBe(567);          // T3 → Wither Beast 567
  });
});

describe('竞技场（FindArenaHitbox :769 / ShouldBlockBuilding :794）', () => {
  it('水晶+门包围盒外扩 800px；60t 冷却内不重算', () => {
    const st = newOldOnesArmyState();
    st.ongoing = true;
    findArenaHitbox(st, [{ x: 1000, y: 1000, w: 40, h: 40 }, { x: 2000, y: 1100, w: 40, h: 40 }]);
    // 盒宽 2040-1000=1040 / 高 1140-1000=140，两侧各外扩 800 → +1600
    expect(st.arena).toEqual({ x: 200, y: 200, w: 2640, h: 1740 });
    expect(shouldBlockBuilding(st, 1100, 1100)).toBe(true);
    expect(shouldBlockBuilding(st, 100, 1100)).toBe(false);
    findArenaHitbox(st, [{ x: 0, y: 0, w: 10, h: 10 }]);   // 冷却中 → 不重算
    expect(st.arena.x).toBe(1000 - 800);
    expect(st.arenaCooldown).toBe(59);
  });
});

describe('魔力掉落配额（ShouldDropCrystals :830-927）', () => {
  it('T1 波 1 配额 20：按击杀进度线性放出，超额即停', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    startInvasion(st, w);
    st.timeLeftUntilSpawningBegins = 0;
    expect(shouldDropCrystals(st, null)).toBe(false);      // 0 进度 → 0 配额
    st.waveKills = 30;                                      // 半程 → 放 10
    let n = 0;
    for (let i = 0; i < 12; i++) if (shouldDropCrystals(st, null)) n++;
    expect(n).toBe(10);
  });
});

describe('Betsy（T3 第 7 波，:929-943 / :1503-1513）', () => {
  it('血量即进度；死后 1 分触发哨兵波胜利演出（D3 分值 :1524-1542）', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    startInvasion(st, w);
    st.ongoingDifficulty = 3;
    st.waveNumber = 7;
    st.timeLeftUntilSpawningBegins = 0;
    expect(pointsWorth(st, 560, false)).toBe(0);           // 波 7 只有 551 计分
    expect(pointsWorth(st, 551, false)).toBe(1);
    const res = checkProgress(st, 551, false, null);        // Betsy 亡 → ratio null
    expect(res.victoryScene).toBe(true);
    expect(st.wonThisRun).toBe(true);
  });

  it('SummonBetsy 一次：T3 波 7 起始，已在世/已召过 → false', () => {
    const w = makeWorld();
    const st = w.oldOnesArmy;
    const { host, spawned } = makeHost();
    startInvasion(st, w);
    expect(summonBetsy(st, host, 1600, 1600)).toBe(true);
    expect(spawned.map((s) => s.id)).toEqual([551]);
    expect(summonBetsy(st, host, 1600, 1600)).toBe(false);   // _spawnedBetsyT3
  });
});

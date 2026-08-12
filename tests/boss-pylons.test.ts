// D 组 Boss 召唤台三件 1:1 回归：蜥蜴祭坛 237→石巨人 245 / 永恒水晶座 466→
// 旧日军团（DD2Event）/ 传送晶塔 597（TeleportPylonsSystem）。
// 纯逻辑层（world/BossSummonStations.ts / world/OldOnesArmy.ts / world/TeleportPylons.ts）
// + 数据/i18n 键完整性。Game 右键分发链（interactAt → use* 方法）在 DOM 环境，
// 不在此实例化——其调用的全部决策函数均在本文件覆盖。
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- .mjs 无类型声明
import { resolvePackKey } from '../tools/l10n-audit.mjs';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE } from '../src/core/constants';
import { EMPTY_SCENE } from '../src/world/SceneMetrics';
import { golemSpawnFromAltar, eterniaStandBottomRow } from '../src/world/BossSummonStations';
import {
  newOldOnesArmyState, startInvasion, invasionStatus, enemiesForWave,
  checkProgress, updateTime, stopInvasion, summonCrystalDirect, wouldFailSpawningHere,
  requestToSkipWaitTime, isStandActive, spawnMonsterD1, canRaiseGoblinsHere,
  announceGoblinDeath, raiseGoblins, findArenaHitbox, shouldDropCrystals,
  type OldOnesArmyHost,
} from '../src/world/OldOnesArmy';
import {
  scanPylons, pylonAnchorAt, pylonStyleFromFrame, pylonItemTypeFromStyle,
  mapFocusRect, checkPylonTeleport, positionHasEnoughNpcs, npcsNeeded,
  pylonAcceptsTeleportation, PYLON,
  type TeleportPylonInfo, type NpcHomeLike,
} from '../src/world/TeleportPylons';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeWorld(w = 300, h = 200): World {
  return new World(w, h, 7, 'pylon-test');
}

/** DD2 宿主桩：记录生成/掉落/广播，可注入竞技场两端与水晶在场状态 */
interface HostSpy extends OldOnesArmyHost {
  spawned: Array<{ id: number; x: number; y: number }>;
  drops: Array<{ id: number; count: number }>;
  messages: Array<{ text: string; r: number; g: number; b: number }>;
  npcCounts: Map<number, number>;
  hasCrystal: boolean;
}
function makeHost(over: Partial<OldOnesArmyHost> = {}): HostSpy {
  const spy: HostSpy = {
    spawned: [], drops: [], messages: [], npcCounts: new Map(), hasCrystal: true,
    broadcast: (text, r, g, b) => { spy.messages.push({ text, r, g, b }); },
    spawnNpc: (id, x, y) => { spy.spawned.push({ id, x, y }); },
    countNpcs: (id) => spy.npcCounts.get(id) ?? 0,
    anyNpc: (id) => (id === 548 ? spy.hasCrystal : (spy.npcCounts.get(id) ?? 0) > 0),
    crystalPoints: () => (spy.hasCrystal ? [{ x: 100, y: 120 }] : []),
    dropAtCrystal: (id, count) => { spy.drops.push({ id, count }); },
    arenaEnds: () => ({ left: { x: 50, y: 60 }, right: { x: 150, y: 60 } }),
    findGroundY: (_x, y) => y + 3,
    rand: () => 0,
    ...over,
  };
  return spy;
}

describe('蜥蜴祭坛 237 → 石巨人 245（NPC.cs:81284-81330）', () => {
  const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar'];
  it('祭坛 tile/电池物品注册在册（237/1293）', () => {
    expect(ALTAR).toBeTruthy();
    expect(ITEM_BY_KEY['vi_1293_lihzahrd_power_cell']).toBeGreaterThanOrEqual(0);
    expect(VANILLA_ITEM_KEY_BY_ID[1293]).toBe('vi_1293_lihzahrd_power_cell');
  });

  it('落位：±20 格找顶中格(frameX18/frameY0)，y=(上+上+下)/3 向上偏置', () => {
    const w = makeWorld();
    const st = w.store;
    // 祭坛 3×2：顶中格 (100,50)；上方最近实心 49，下方最近实心 51 → gy=(49+49+51)/3=49
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) st.setTile(100 + dx, 50 + dy, ALTAR, dx * 18, dy * 18);
    }
    for (let y = 40; y < 50; y++) st.setTile(100, y, 1);
    for (let y = 51; y <= 70; y++) st.setTile(100, y, 1);
    const spot = golemSpawnFromAltar(st, ALTAR, 100, 52);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBe(100 * TILE + 8);    // NewNPC x = 祭坛列中心（:81325）
    expect(spot!.y).toBe(49 * TILE);          // gy（:81324）
    expect(spot!.altarX).toBe(100);
    expect(spot!.altarY).toBe(50);
  });

  it('边界防御：无顶中格 / 祭坛在 ±20 格外 → null（:81308-81311）', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTile(100, 50, ALTAR, 0, 0);   // 只有左上格，无 (18,0) 顶中格
    expect(golemSpawnFromAltar(st, ALTAR, 100, 52)).toBeNull();
    st.setTile(70, 50, ALTAR, 18, 0);   // 顶中格距玩家 30 格（>20）
    expect(golemSpawnFromAltar(st, ALTAR, 100, 52)).toBeNull();
  });

  it('上下皆无实心 → 初值 num5-15 回退（:81313-81314）', () => {
    const w = makeWorld();
    const st = w.store;
    st.setTile(100, 50, ALTAR, 18, 0);
    const spot = golemSpawnFromAltar(st, ALTAR, 100, 52);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBe(35 * TILE);   // (35+35+35)/3 = 35
  });
});

describe('永恒水晶座 466 → 旧日军团（Player.cs:31930-31977 + DD2Event.cs）', () => {
  it('水晶座/水晶/魔力/奖牌物品注册在册（466/3828/3822/3817）', () => {
    expect(TILE_BY_KEY['v_466_elder_cystal_stand']).toBeTruthy();
    expect(ITEM_BY_KEY['vi_3828_eternia_crystal']).toBeGreaterThanOrEqual(0);
    expect(VANILLA_ITEM_KEY_BY_ID[3828]).toBe('vi_3828_eternia_crystal');
    expect(VANILLA_ITEM_KEY_BY_ID[3822]).toBe('vi_3822_etherian_mana');
    expect(VANILLA_ITEM_KEY_BY_ID[3817]).toBe('vi_3817_defender_medal');
  });

  it('num28 底行回推（:31938-31946）：frameY 0/18/36/54 → +3/+2/+1/+0', () => {
    expect(eterniaStandBottomRow(0)).toBe(3);
    expect(eterniaStandBottomRow(18)).toBe(2);
    expect(eterniaStandBottomRow(36)).toBe(1);
    expect(eterniaStandBottomRow(54)).toBe(0);
  });

  it('竞技场门（WouldFailSpawningHere :603-613）：任一侧 <60 格失败，恰 60 通过', () => {
    const host = makeHost();   // 两端 50/150：距 x=100 各 50 → 失败
    expect(wouldFailSpawningHere(host, 100, 60)).toBe(true);
    const wide = makeHost({ arenaEnds: () => ({ left: { x: 20, y: 60 }, right: { x: 200, y: 60 } }) });
    expect(wouldFailSpawningHere(wide, 100, 60)).toBe(false);
    const edge = makeHost({ arenaEnds: () => ({ left: { x: 40, y: 60 }, right: { x: 160, y: 60 } }) });
    expect(wouldFailSpawningHere(edge, 100, 60)).toBe(false);   // 60 不触发 <60
  });

  it('SummonCrystalDirect（:584-601）：水晶 548 落位 + 5×2 魔力 + StartInvasion 状态', () => {
    const w = makeWorld();
    const st = newOldOnesArmyState();
    const host = makeHost();
    const res = summonCrystalDirect(st, w, host, 100, 63, 18, 54);
    expect(res.ok).toBe(true);
    // 落位 = 锚点(100-1, 63-3)px + (40,64)（:589-594）
    expect(res.x).toBe(99 * TILE + 40);
    expect(res.y).toBe(60 * TILE + 64);
    expect(host.spawned).toEqual([{ id: 548, x: res.x, y: res.y }]);
    // DropStarterCrystals（:944-957）：5 次 × stack 2 的 3822
    expect(host.drops.filter((d) => d.id === 3822)).toHaveLength(5);
    expect(host.drops.every((d) => d.count === 2)).toBe(true);
    // StartInvasion（:253-292）：wave1 + hold 300 + T1
    expect(st.ongoing).toBe(true);
    expect(st.waveNumber).toBe(1);
    expect(st.waveKills).toBe(0);
    expect(st.timeLeftUntilSpawningBegins).toBe(300);
    expect(st.ongoingDifficulty).toBe(1);
  });

  it('门禁：水晶 548 已在场 → 召唤拒绝且不开事件（:585-587）', () => {
    const w = makeWorld();
    const st = newOldOnesArmyState();
    const host = makeHost({ anyNpc: (id) => id === 548 });
    expect(summonCrystalDirect(st, w, host, 100, 63, 18, 54).ok).toBe(false);
    expect(st.ongoing).toBe(false);
    expect(host.spawned).toHaveLength(0);
  });

  it('难度档（FindProperDifficulty :324-336）：机械任一→T2，石巨人→T3', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    let st = newOldOnesArmyState();
    startInvasion(st, w);
    expect(st.ongoingDifficulty).toBe(1);
    w.flags['downed_127'] = true;
    st = newOldOnesArmyState();
    startInvasion(st, w);
    expect(st.ongoingDifficulty).toBe(2);
    w.flags['downed_245'] = true;
    st = newOldOnesArmyState();
    startInvasion(st, w);
    expect(st.ongoingDifficulty).toBe(3);
  });

  it('T1 波表（:968-990）：wave1 只出 552 且 LaneSpawnRate=90；wave5 五怪 40', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    expect(enemiesForWave(st, 1)).toEqual([552]);
    expect(st.laneSpawnRate).toBe(90);
    expect(enemiesForWave(st, 3)).toEqual([552, 555, 561]);
    expect(st.laneSpawnRate).toBe(55);
    expect(enemiesForWave(st, 5)).toEqual([552, 555, 561, 558, 564]);
    expect(st.laneSpawnRate).toBe(40);
  });

  it('T1 进波门槛（:992-1024）：60/80/100/120/140；wave6 折回 5 + 胜利演出', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    const req = (wave: number) => { st.waveNumber = wave; return invasionStatus(st, null).required; };
    expect(req(1)).toBe(60);
    expect(req(2)).toBe(80);
    expect(req(3)).toBe(100);
    expect(req(4)).toBe(120);
    expect(req(5)).toBe(140);
    st.waveNumber = 6;
    const s = invasionStatus(st, null, true);
    expect(s.wave).toBe(5);              // 哨兵波折回（:1019-1024）
    expect(s.victoryScene).toBe(true);   // inCheckProgress → StartVictoryScene（:481-507）
  });

  it('CheckProgress（:344-470）：击杀累计 → 进波 + hold 1800 + 首波 WaveCompleteFirst', () => {
    const st = newOldOnesArmyState();
    startInvasion(st, makeWorld());
    st.timeLeftUntilSpawningBegins = 0;   // 出怪中才计分（:347 门禁）
    let r = checkProgress(st, 552, false, null);
    expect(st.waveKills).toBe(1);         // 普通模式每怪 1 分（:1140-1146）
    expect(r.waveComplete).toBeNull();
    st.waveKills = 59;
    r = checkProgress(st, 552, false, null);
    expect(r.waveComplete).toBe('DungeonDefenders2.WaveCompleteFirst');   // num3==2（:377-382）
    expect(st.waveNumber).toBe(2);
    expect(st.timeLeftUntilSpawningBegins).toBe(1800);                    // :383
    expect(r.medals).toBe(0);            // T1 只有波 4/5 完成给奖牌（:405-409）
  });

  it('CheckProgress：专家分值 ×2（:1141-1145）；非军团怪 0 分', () => {
    const st = newOldOnesArmyState();
    st.ongoing = true;
    st.timeLeftUntilSpawningBegins = 0;
    checkProgress(st, 552, true, null);
    expect(st.waveKills).toBe(2);
    checkProgress(st, 3, true, null);    // 僵尸等非军团怪不分（:1146-1147）
    expect(st.waveKills).toBe(2);
  });

  it('T1 末波：wave5 满 140 → 胜利演出；WonThisRun 后不再计分（:347/:362-379）', () => {
    const st = newOldOnesArmyState();
    st.ongoing = true;
    st.waveNumber = 5;
    st.timeLeftUntilSpawningBegins = 0;
    st.waveKills = 139;
    const r = checkProgress(st, 552, false, null);
    expect(r.victoryScene).toBe(true);
    expect(st.wonThisRun).toBe(true);
    expect(checkProgress(st, 552, false, null).waveComplete).toBeNull();
  });

  it('StopInvasion(win)（:294-343）：downed 旗标 + T1 奖牌 3 + InvasionWin 广播', () => {
    const w = makeWorld();
    const st = newOldOnesArmyState();
    st.ongoing = true;
    st.ongoingDifficulty = 1;
    const host = makeHost();
    expect(stopInvasion(st, w, host, true)).toBe('win');
    expect(w.flags['downedOldOnesArmyT1']).toBe(true);
    expect(w.flags['downedOldOnesArmyT2']).toBeUndefined();
    expect(host.drops.find((d) => d.id === 3817)?.count).toBe(3);
    expect(host.messages[0]?.text).toBe('DungeonDefenders2.InvasionWin');
    expect(st.ongoing).toBe(false);
    expect(st.waveNumber).toBe(0);
  });

  it('UpdateTime（:209-251）：hold 递减归零 → wave1 公告；水晶消失 → 事件终止', () => {
    const w = makeWorld();
    const st = newOldOnesArmyState();
    startInvasion(st, w);
    const host = makeHost();
    for (let i = 0; i < 299; i++) {
      expect(updateTime(st, host, null).waveAnnounce).toBeNull();
    }
    const done = updateTime(st, host, null);
    expect(done.waveAnnounce).toEqual({ wave: 1, ids: [552] });
    expect(done.lose).toBe(false);
    host.hasCrystal = false;
    expect(updateTime(st, host, null).stopped).toBe('lose');   // :218-220
    expect(st.ongoing).toBe(false);
  });

  it('RequestToSkipWaitTime（:1794-1817）：波间 >60 且水晶在座 → 跳到 60', () => {
    const st = newOldOnesArmyState();
    st.timeLeftUntilSpawningBegins = 1800;
    const host = makeHost();
    expect(isStandActive(host, 6, 7)).toBe(true);   // 水晶 (100,120) 距座中心 (104,120) <36px
    expect(requestToSkipWaitTime(st, host, 6, 7)).toBe(true);
    expect(st.timeLeftUntilSpawningBegins).toBe(60);
    host.hasCrystal = false;                        // 水晶不在座 → 拒绝
    st.timeLeftUntilSpawningBegins = 1800;
    expect(requestToSkipWaitTime(st, host, 6, 7)).toBe(false);
    expect(st.timeLeftUntilSpawningBegins).toBe(1800);
    host.hasCrystal = true;
    st.timeLeftUntilSpawningBegins = 60;            // 波间 ≤60 → 拒绝
    expect(requestToSkipWaitTime(st, host, 6, 7)).toBe(false);
  });

  it('D1 出怪（:1026-1127）：wave1 基线上限 50；wave5 血线门出黑暗魔法师 564', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    st.waveNumber = 1;
    const host = makeHost();
    spawnMonsterD1(st, host, 100, 1000, true);
    expect(host.spawned).toEqual([{ id: 552, x: 100, y: 1000 }]);
    host.npcCounts.set(552, 50);                    // 基线满 50 → 停出（:1064-1066）
    host.spawned.length = 0;
    spawnMonsterD1(st, host, 100, 1000, true);
    expect(host.spawned).toHaveLength(0);
    st.waveNumber = 5;
    st.waveKills = 75;                              // 75/140 > 0.5（:1081）
    host.npcCounts.clear();
    host.spawned.length = 0;
    spawnMonsterD1(st, host, 100, 1000, true);
    expect(host.spawned.some((s) => s.id === 564)).toBe(true);
  });

  it('骷髅复活（:715-767）：≥3 尸点可召；T1 出 566、尸点清空', () => {
    const st = newOldOnesArmyState();
    announceGoblinDeath(st, 1000, 1000);
    announceGoblinDeath(st, 1010, 1000);
    expect(canRaiseGoblinsHere(st, 1005, 1000)).toBe(false);   // 仅 2 处（800px 内）
    announceGoblinDeath(st, 1020, 1000);
    expect(canRaiseGoblinsHere(st, 1005, 1000)).toBe(true);
    const host = makeHost();
    raiseGoblins(st, host, 1005, 1000);
    expect(host.spawned.map((s) => s.id)).toEqual([566, 566, 566]);
    expect(st.deadGoblinSpots).toHaveLength(0);                // :748-755 消费即清
  });

  it('FindArenaHitbox（:769-792）：548/549 包围盒外扩 800px + 60t 冷却', () => {
    const st = newOldOnesArmyState();
    findArenaHitbox(st, [
      { x: 1000, y: 2000, w: 20, h: 40 },
      { x: 3000, y: 2200, w: 30, h: 60 },
    ]);
    expect(st.arena).toEqual({ x: 200, y: 1200, w: 2830, h: 2060 });
    expect(st.arenaCooldown).toBe(60);
  });

  it('魔力配额（:815-916）：wave1 配额 20，按击杀进度比例放出', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 1;
    st.waveNumber = 1;
    st.waveKills = 0;
    expect(shouldDropCrystals(st, null)).toBe(false);   // 0/60 → 0 < 20×0 不成立
    st.crystalsAlreadyDropped = 0;
    st.crystalsLastWave = 1;                            // 配额已立（20）
    st.crystalsToDrop = 20;
    st.waveKills = 30;                                  // 50% → 阈值 10
    let dropped = 0;
    for (let i = 0; i < 12; i++) if (shouldDropCrystals(st, null)) dropped++;
    expect(dropped).toBe(10);
  });
});

describe('传送晶塔 597（TeleportPylonsSystem.cs）', () => {
  it('样式/物品映射（TETeleportationPylon.cs:128-152）', () => {
    expect(TILE_BY_KEY['v_597_pylons']).toBeTruthy();
    expect(pylonStyleFromFrame(0)).toBe(0);
    expect(pylonStyleFromFrame(54)).toBe(1);
    expect(pylonStyleFromFrame(540)).toBe(10);
    expect(pylonItemTypeFromStyle(0)).toBe(4876);   // Purity
    expect(pylonItemTypeFromStyle(1)).toBe(4875);   // Jungle
    expect(pylonItemTypeFromStyle(2)).toBe(4916);   // Hallow
    expect(pylonItemTypeFromStyle(8)).toBe(4951);   // Victory
    expect(pylonItemTypeFromStyle(9)).toBe(5652);   // Underworld
    expect(pylonItemTypeFromStyle(10)).toBe(5653);  // Shimmer
  });

  /** 放一座 3×4 晶塔（style 帧 = type*54，TETeleportationPylon 3×4 布局） */
  function placePylon(w: World, x: number, y: number, type: number): void {
    const t = TILE_BY_KEY['v_597_pylons'];
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 4; dy++) w.store.setTile(x + dx, y + dy, t, type * 54 + dx * 18, dy * 18);
    }
  }

  it('scanPylons：仅锚点入表（frameY0 且 frameX%54==0），样式直转塔型', () => {
    const w = makeWorld();
    placePylon(w, 50, 60, 0);    // 纯净
    placePylon(w, 150, 80, 8);   // Victory
    const list = scanPylons(w);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ x: 50, y: 60, type: 0 });
    expect(list[1]).toEqual({ x: 150, y: 80, type: 8 });
  });

  it('pylonAnchorAt：点击任意格回推 3×4 锚点（Player.cs:31713-31715）', () => {
    const w = makeWorld();
    placePylon(w, 50, 60, 3);
    expect(pylonAnchorAt(w, 52, 63)).toEqual({ x: 50, y: 60 });
    expect(pylonAnchorAt(w, 51, 61)).toEqual({ x: 50, y: 60 });
    expect(pylonAnchorAt(w, 10, 10)).toBeNull();
  });

  it('NPC 门（:224-247/:314-323）：Victory 塔 0 只；其余 2 只；窗内+不离家 100 格', () => {
    expect(npcsNeeded(PYLON.Victory)).toBe(0);
    expect(npcsNeeded(PYLON.Jungle)).toBe(2);
    const near: NpcHomeLike[] = [
      { homeX: 100, homeY: 100, x: 100, y: 101 },
      { homeX: 102, homeY: 100, x: 102, y: 101 },
    ];
    expect(positionHasEnoughNpcs(2, 100, 100, near)).toBe(true);
    // 家在 169×124 窗外不计（:236-239）
    expect(positionHasEnoughNpcs(2, 100, 100, [
      near[0], { homeX: 300, homeY: 100, x: 300, y: 101 },
    ])).toBe(false);
    // NPC 现位距家 ≥100 格不计（:240-243）
    expect(positionHasEnoughNpcs(2, 100, 100, [
      near[0], { homeX: 101, homeY: 100, x: 250, y: 100 },
    ])).toBe(false);
  });

  it('群系要求（DoesPylonAcceptTeleportation :254-312）', () => {
    const w = makeWorld(300, 400);
    w.groundLevel = 50;
    const pure = { ...EMPTY_SCENE };
    expect(pylonAcceptsTeleportation(PYLON.SurfacePurity, w, pure, 100, 40)).toBe(true);
    // 纯净塔：地下拒绝（:264-266）/ 群系 tile 达标拒绝（:270-273）/ 世界边缘 380 拒绝（:269）
    expect(pylonAcceptsTeleportation(PYLON.SurfacePurity, w, pure, 100, 60)).toBe(false);
    expect(pylonAcceptsTeleportation(PYLON.SurfacePurity, w, { ...EMPTY_SCENE, zoneJungle: true }, 100, 40)).toBe(false);
    expect(pylonAcceptsTeleportation(PYLON.SurfacePurity, w, pure, 100, 40 + 380)).toBe(false);
    expect(pylonAcceptsTeleportation(PYLON.SurfacePurity, w, pure, 299, 40)).toBe(false);
    // 丛林/神圣/雪原/沙漠塔 = Zone 判定（:278-296）
    expect(pylonAcceptsTeleportation(PYLON.Jungle, w, { ...EMPTY_SCENE, zoneJungle: true }, 100, 100)).toBe(true);
    expect(pylonAcceptsTeleportation(PYLON.Jungle, w, pure, 100, 100)).toBe(false);
    expect(pylonAcceptsTeleportation(PYLON.Hallow, w, { ...EMPTY_SCENE, zoneHallow: true }, 100, 100)).toBe(true);
    expect(pylonAcceptsTeleportation(PYLON.Snow, w, { ...EMPTY_SCENE, zoneSnow: true }, 100, 100)).toBe(true);
    expect(pylonAcceptsTeleportation(PYLON.Desert, w, { ...EMPTY_SCENE, zoneDesert: true }, 100, 100)).toBe(true);
    // Victory 恒真（:300）；地下塔 worldSurface 含（:298）
    expect(pylonAcceptsTeleportation(PYLON.Victory, w, pure, 100, 300)).toBe(true);
    expect(pylonAcceptsTeleportation(PYLON.Underground, w, pure, 100, 50)).toBe(true);
    expect(pylonAcceptsTeleportation(PYLON.Underground, w, pure, 100, 49)).toBe(false);
    // 地狱塔 = UnderworldLayer（maxTilesY-200 = 200，:302）
    expect(pylonAcceptsTeleportation(PYLON.Underworld, w, pure, 100, 195)).toBe(false);
    expect(pylonAcceptsTeleportation(PYLON.Underworld, w, pure, 100, 250)).toBe(true);
  });

  it('门禁五连（HandleTeleportRequest :100-205）：失败文案逐档', () => {
    const w = makeWorld();
    w.groundLevel = 50;
    const target: TeleportPylonInfo = { x: 200, y: 40, type: PYLON.Victory };
    const current: TeleportPylonInfo = { x: 100, y: 40, type: PYLON.Victory };
    const base = {
      playerTileX: 100, playerTileY: 41,
      target, current,
      npcs: [] as NpcHomeLike[],
      targetScene: { ...EMPTY_SCENE },
      currentScene: { ...EMPTY_SCENE },
      downedPlantBoss: true,
    };
    // Victory 塔免 NPC 门 → 全过（:206）
    expect(checkPylonTeleport(w, base).ok).toBe(true);
    // 1) 无当前塔（玩家不在任何晶塔 ±60 格内）→ NotNearAPylon（:105-109）
    expect(checkPylonTeleport(w, { ...base, current: null }).fail)
      .toBe('Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon');
    // 2) 非 Victory 塔缺 NPC → NotEnoughNPCs（:111-118）
    expect(checkPylonTeleport(w, { ...base, target: { x: 200, y: 40, type: PYLON.Jungle } }).fail)
      .toBe('Net.CannotTeleportToPylonBecauseNotEnoughNPCs');
    // 3) 蜥蜴神庙早入（未败世花 + 墙 87 + 地下）→ Early（:120-128）
    const w2 = makeWorld();
    w2.groundLevel = 50;
    for (let dx = 0; dx < 3; dx++) w2.store.setWall(200 + dx, 100, 87);
    expect(checkPylonTeleport(w2, {
      ...base, downedPlantBoss: false, target: { x: 200, y: 100, type: PYLON.Victory },
    }).fail).toBe('Net.CannotTeleportToPylonBecauseAccessingLihzahrdTempleEarly');
    // 4) 目标塔群系不符（地下纯净塔）→ BiomeRequirements（:130-136）
    //    NPC 门先过：目标塔旁给 2 名入住 NPC（家在 169×124 窗内、不离家）
    const housed: NpcHomeLike[] = [
      { homeX: 200, homeY: 39, x: 200, y: 40 }, { homeX: 201, homeY: 39, x: 201, y: 40 },
      { homeX: 100, homeY: 39, x: 100, y: 40 }, { homeX: 101, homeY: 39, x: 101, y: 40 },
    ];
    expect(checkPylonTeleport(w, {
      ...base, npcs: housed, target: { x: 200, y: 100, type: PYLON.SurfacePurity },
    }).fail).toBe('Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements');
    // 5) 当前塔缺 NPC（目标 Victory 免检）→ AtCurrentPylon（:155-192）
    expect(checkPylonTeleport(w, {
      ...base,
      npcs: [{ homeX: 200, homeY: 39, x: 200, y: 40 }, { homeX: 201, homeY: 39, x: 201, y: 40 }],
      current: { x: 100, y: 40, type: PYLON.Jungle },
    }).fail).toBe('Net.CannotTeleportToPylonBecauseNotEnoughNPCsAtCurrentPylon');
  });

  it('地图对焦（Player.cs:31717-31747）：包围盒外扩 20 + (屏-40)/盒 取小', () => {
    const pylons: TeleportPylonInfo[] = [
      { x: 100, y: 60, type: 0 },
      { x: 300, y: 100, type: 8 },
    ];
    const f = mapFocusRect(pylons, { x: 100, y: 60 }, 1920, 1080);
    // 盒 = (80,40)-(320,120) → 中心 (200,80)；scale = min(1880/240, 1040/80) = 13
    expect(f.cx).toBe(200);
    expect(f.cy).toBe(80);
    expect(f.scale).toBeCloseTo(13, 5);
  });
});

describe('i18n 键完整性（zh-Hans 合并包）', () => {
  const loadPack = async (): Promise<Record<string, unknown>> =>
    (await import(join(ROOT, 'public/l10n/zh-Hans.json'), { with: { type: 'json' } })).default as Record<string, unknown>;

  it('三件召唤台用到的全部原版键在包内命中', async () => {
    const pack = await loadPack();
    const keys = [
      // 旧日军团（DD2Event.cs 广播/失败文案）
      'DungeonDefenders2.InvasionStart',
      'DungeonDefenders2.InvasionWin',
      'DungeonDefenders2.InvasionLose',
      'DungeonDefenders2.WaveComplete',
      'DungeonDefenders2.WaveCompleteFirst',
      'DungeonDefenders2.BartenderWarning',
      // 波次公告（Lang.GetInvasionWaveText Lang.cs:1131-1153）
      'Game.Wave', 'Game.FirstWave', 'Game.FinalWave', 'Game.InvasionWave_Type1',
      // 晶塔门禁文案（TeleportPylonsSystem.cs HandleTeleportRequest :100-205）
      'Net.CannotTeleportToPylonBecausePlayerIsNotNearAPylon',
      'Net.CannotTeleportToPylonBecauseNotEnoughNPCs',
      'Net.CannotTeleportToPylonBecauseNotEnoughNPCsAtCurrentPylon',
      'Net.CannotTeleportToPylonBecauseNotMeetingBiomeRequirements',
      'Net.CannotTeleportToPylonBecauseAccessingLihzahrdTempleEarly',
      // 石巨人公告（NPC.cs:81325-81326）
      'Announcement.HasAwoken',
    ];
    for (const k of keys) {
      expect(resolvePackKey(pack, k), `缺键: ${k}`).toBeTypeOf('string');
    }
  });

  it('DD2 三物品名（ItemName.*）在包内命中（物品栏显示走 vi_ 桥接）', async () => {
    const pack = await loadPack();
    for (const k of ['ItemName.DD2ElderCrystal', 'ItemName.DD2EnergyCrystal', 'ItemName.DefenderMedal']) {
      expect(resolvePackKey(pack, k), `缺键: ${k}`).toBeTypeOf('string');
    }
  });
});

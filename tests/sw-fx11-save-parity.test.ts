// SW-FX11（2026-09-10）存档对齐补债批回归：
//  ① SaveData 面 round-trip 全等（pillarNpcs / pressurePlates / chest name）
//  ② 旧档缺字段兼容（缺段=undefined,读档零迁移）
//  ③ 变异证红（破坏载荷→断言翻红,证测试判别力）
//  ④ wld 导出→解析 round-trip（SavesAndLoads 四塔段/压力板段/ShimmeredTownNPCs
//     名单/箱名/oreTiersPH/savedOreTiers/combatBook 键域归一/vampireSeed 域归一）
//  ⑤ respawnMissingTowers 兜底重生成（towerActive 在场无塔位→补塔;塔在场→零动作）
//
// 反编译锚（1457 终值）：
//  - WF:1744-1755 SaveNPCs 尾 SavesAndLoads 段（bool true+i32 netID+f32×2 position 循环）
//    /:2937-2955 LoadNPCs 对称读;集合=NPCID.Sets.SavesAndLoads NPCID.cs:4807
//    CreateBoolSet(422,507,517,493)=天界四塔
//  - WF:3374-3386 SaveWeightedPressurePlates / :3388-3398 Load;读档首拍 PokeLocation
//    →Wiring.HitSwitch 一次性重触发（PressurePlateHelper.cs:19-31/:156-164）
//  - WF:1660 chest.name 随箱段持久（SaveChests）
//  - WF:1712-1720 ShimmeredTownNPCs 名单 / :2899-2906 Load
//  - WF:1394-1397 SavedOreTiers.Copper/Iron/Silver/Gold i32×4（v216）/ :2351-2361 读
//  - WF:1321-1323 SavedOreTiers.Cobalt/Mythril/Adamantite i32×3
//  - WF:1386/:1413/:1414 NPC.combatBookWasUsed/combatBookVolumeTwoWasUsed/
//    peddlersSatchelWasUsed;WF:1426-1427 Main.vampireSeed/infectedSeed
import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import { respawnMissingTowers, TOWER_SOLAR, TOWER_VORTEX, TOWER_NEBULA, TOWER_STARDUST } from '../src/world/LunarEvent';
import { plateKeysToPositions } from '../src/core/Game';
import type { SaveData } from '../src/save/serialize';
import type { LunarHost } from '../src/world/LunarEvent';

describe('SW-FX11 ① SaveData round-trip（serializeSave→loadSaveData 全等）', () => {
  it('pillarNpcs 四塔原位+pressurePlates 按压位+箱名 往返逐位全等', () => {
    const world = new World(64, 32, 42, '测试');
    world.chests = [{ x: 3, y: 4, items: [null], name: '战利品箱' }];
    const player = new Player(100, 100, new Inventory());
    const pillarNpcs = [
      { id: TOWER_SOLAR, x: 123.5, y: 678.25 },
      { id: TOWER_VORTEX, x: 404, y: 512 },
      { id: TOWER_NEBULA, x: 800.125, y: 90.5 },
      { id: TOWER_STARDUST, x: 1024, y: 300 },
    ];
    const pressurePlates = [{ x: 10, y: 20 }, { x: 11, y: 20 }];
    const json = saveGame(world, player, 0, [], undefined, pillarNpcs, pressurePlates);
    const back = loadSave(json);
    expect(back.world.pendingPillarNpcs).toEqual(pillarNpcs);
    expect(back.world.pendingPlatePokes).toEqual(pressurePlates);
    expect(back.world.chests[0].name).toBe('战利品箱');
  });

  it('空段不落键（pillarNpcs/pressurePlates 缺省=undefined,与旧档同形）', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0)) as Record<string, unknown>;
    expect(data.pillarNpcs).toBeUndefined();
    expect(data.pressurePlates).toBeUndefined();
    const back = loadSave(JSON.stringify(data));
    expect(back.world.pendingPillarNpcs).toBeUndefined();
    expect(back.world.pendingPlatePokes).toBeUndefined();
  });

  it('旧档缺字段兼容（删除新键后读档零迁移不炸）', () => {
    const world = new World(64, 32, 42, '测试');
    const player = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0, [], undefined,
      [{ id: TOWER_NEBULA, x: 1, y: 2 }], [{ x: 3, y: 4 }])) as Record<string, unknown>;
    delete data.pillarNpcs;
    delete data.pressurePlates;
    const back = loadSave(JSON.stringify(data));
    expect(back.world.pendingPillarNpcs).toBeUndefined();
    expect(back.world.pendingPlatePokes).toBeUndefined();
  });

  it('变异证红：载荷改动→往返可观测（判别力自证）', () => {
    const world = new World(64, 32, 42, '测试');
    world.chests = [{ x: 0, y: 0, items: [null], name: '原名' }];
    const player = new Player(100, 100, new Inventory());
    const json = saveGame(world, player, 0, [], undefined,
      [{ id: TOWER_SOLAR, x: 100, y: 100 }], []);
    // 箱名变异
    const mutated = JSON.parse(json) as SaveData;
    (mutated.chests[0] as { name?: string }).name = '改名';
    expect(loadSave(JSON.stringify(mutated)).world.chests[0].name).toBe('改名');
    // 塔位变异
    const m2 = JSON.parse(json) as SaveData;
    m2.pillarNpcs![0].x = 999.75;
    expect(loadSave(JSON.stringify(m2)).world.pendingPillarNpcs![0].x).toBe(999.75);
    // 压力板变异
    const m3 = JSON.parse(json) as SaveData;
    m3.pressurePlates = [{ x: 7, y: 8 }];
    expect(loadSave(JSON.stringify(m3)).world.pendingPlatePokes).toEqual([{ x: 7, y: 8 }]);
  });

  it('plateKeysToPositions：真 latch 键格式 "<id>|tx,ty" 解析+去重（switchTilesScan :25684）', () => {
    // 玩家路真键（plateLatch 供给形态）
    expect(plateKeysToPositions(['3|10,20', '3|11,20'])).toEqual([{ x: 10, y: 20 }, { x: 11, y: 20 }]);
    // 同板多实体键 → 去重（原版单 Point 键集同域）
    expect(plateKeysToPositions(['3|10,20', '7|10,20'])).toEqual([{ x: 10, y: 20 }]);
    // 脏键容忍
    expect(plateKeysToPositions(['badkey', '', '3|10'])).toEqual([]);
    // 变异：键格式若退化为无 id 前缀,解析仍须等价（防御键格式漂移）
    expect(plateKeysToPositions(['10,20'])).toEqual([{ x: 10, y: 20 }]);
  });
});

describe('SW-FX11 ④ wld 导出→解析 round-trip（新段+键域归一）', () => {
  function mkSave(extra: Partial<SaveData>): SaveData {
    return {
      format: 'sandboxworld.save', version: 5,
      header: {
        name: 'FX11 世界', seed: 42, width: 60, height: 40,
        spawn: [30, 18], groundLevel: 20, rockLevel: 24,
        created: 1700000000000, playTimeMs: 0,
      },
      clock: { timeOfDay: 0.25, dayCount: 3, moonPhase: 0, bloodMoon: false, eclipse: false },
      player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
      tiles: '', walls: '', liquid: '', liquidType: '',
      chests: [], flags: {},
      ...extra,
    } as unknown as SaveData;
  }

  it('SavesAndLoads 四塔段：位置逐值往返；集合外 id 不写出', () => {
    const save = mkSave({
      pillarNpcs: [
        { id: TOWER_SOLAR, x: 123.5, y: 678.25 },
        { id: TOWER_VORTEX, x: 404, y: 512 },
      ],
    });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.pillarNpcs).toEqual([
      { id: TOWER_SOLAR, x: 123.5, y: 678.25 },
      { id: TOWER_VORTEX, x: 404, y: 512 },
    ]);
    // 变异：集合外 id（绿史莱姆 1）不得进段（原版集合只含四塔）
    const bad = mkSave({ pillarNpcs: [{ id: 1, x: 5, y: 6 }, { id: TOWER_NEBULA, x: 7, y: 8 }] });
    const back2 = parseWldToSave(exportWld(bad));
    expect(back2.save.pillarNpcs).toEqual([{ id: TOWER_NEBULA, x: 7, y: 8 }]);
  });

  it('按压压力板段：坐标往返（WF:3374-3386 段格式 i32 n + n×(i32,i32)）', () => {
    const save = mkSave({ pressurePlates: [{ x: 10, y: 20 }, { x: 11, y: 21 }, { x: 12, y: 22 }] });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.pressurePlates).toEqual([{ x: 10, y: 20 }, { x: 11, y: 21 }, { x: 12, y: 22 }]);
  });

  it('ShimmeredTownNPCs 名单：npcs[].shimmered=true → 导出名单 → 导入回填同键', () => {
    const save = mkSave({
      npcs: [{ key: 'merchant', x: 500, y: 300, home: [41, 19], givenName: '微光商人', shimmered: true },
        { key: 'nurse', x: 520, y: 300, home: [43, 19] }],
    });
    const bytes = exportWld(save);
    // 解析层：名单含商人 17（TOWN_NPC_KEY_BY_ID 反查）不含护士 18
    const parsed = parseWld(bytes);
    expect(parsed.shimmered).toContain(17);
    expect(parsed.shimmered).not.toContain(18);
    // 导入层：映射回 SaveData.npcs[].shimmered（消费面 Game.ts:6638 微光变体恢复）
    const back = parseWldToSave(bytes);
    const merchant = back.save.npcs.find((n) => n.key === 'merchant');
    const nurse = back.save.npcs.find((n) => n.key === 'nurse');
    expect(merchant?.shimmered).toBe(true);
    expect(nurse?.shimmered).toBeUndefined();
  });

  it('chest name 往返（WF:1660）——导入回显 + 导出零漂移', () => {
    const save = mkSave({ chests: [{ x: 40, y: 19, items: [null], name: '杂货箱' }] });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.chests[0].name).toBe('杂货箱');
  });

  it('oreTiersPH 醉酒替代矿往返（WF:1394-1397;军火商钨弹门消费面）', () => {
    const save = mkSave({ oreTiersPH: { copper: 166, iron: 167, silver: 168, gold: 169 } });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.oreTiersPH).toEqual({ copper: 166, iron: 167, silver: 168, gold: 169 });
  });

  it('savedOreTiers 困难矿档位往返（WF:1321-1323;曾恒 -1 导出即丢）', () => {
    const save = mkSave({ savedOreTiers: { cobalt: 107, mythril: 108, adamantite: 111 } });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.savedOreTiers).toEqual({ cobalt: 107, mythril: 108, adamantite: 111 });
  });

  it('combatBook 家族键域归一：导出读运行时键,解析产同键（曾 combatBook/combatBook2/peddler 三域断链）', () => {
    const save = mkSave({
      flags: { combatBookWasUsed: true, combatBookVolumeTwoWasUsed: true, peddlersSatchelUsed: true },
    });
    const parsed = parseWld(exportWld(save));
    // 解析域=运行时键（Game.ts:38711 进度门/:35811 旅商股票/:15562 使用侧直接消费）
    expect(parsed.flags.combatBookWasUsed).toBe(true);
    expect(parsed.flags.combatBookVolumeTwoWasUsed).toBe(true);
    expect(parsed.flags.peddlersSatchelUsed).toBe(true);
    // 旧短键不再存在（键域归一,无影子键）
    expect(parsed.flags.combatBook).toBeUndefined();
    expect(parsed.flags.combatBook2).toBeUndefined();
    expect(parsed.flags.peddler).toBeUndefined();
    // 变异：假位翻红（真键 false 时解析域不得出现 true）
    const neg = mkSave({ flags: { combatBookWasUsed: false } });
    expect(parseWld(exportWld(neg)).flags.combatBookWasUsed).toBeUndefined();
  });

  it('vampireSeed/infectedSeed 域归一：seedFlags 域往返（曾落 flags.vampire/infected 死域）', () => {
    const save = mkSave({
      header: {
        name: 'FX11 世界', seed: 42, width: 60, height: 40,
        spawn: [30, 18], groundLevel: 20, rockLevel: 24,
        created: 1700000000000, playTimeMs: 0,
        seedFlags: { vampireSeed: true, infectedSeed: true },
      },
    });
    const back = parseWldToSave(exportWld(save));
    // 消费域=seedFlags（Player.ts:8384/SceneMetrics.ts:346/Game.ts:28853/mainFlow.ts:218）
    expect(back.save.header.seedFlags?.vampireSeed).toBe(true);
    expect(back.save.header.seedFlags?.infectedSeed).toBe(true);
  });
});

describe('SW-FX11 ⑤ respawnMissingTowers 兜底重生成（读档塔实体缺失面）', () => {
  function mkTowerWorld(): World {
    const w = new World(64, 32, 42, '测试');
    w.groundLevel = 60;   // surface=60:向下扫描窗 y>100 恒假 → 恒走 (num3, surface-40) 兜底位（确定性）
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive.solar = true;
    w.lunarEvent.towerActive.vortex = true;
    w.lunarEvent.towerActive.nebula = true;
    w.lunarEvent.towerActive.stardust = true;
    return w;
  }
  function mkHost(): { host: LunarHost; spawned: Array<[number, number, number]> } {
    const spawned: Array<[number, number, number]> = [];
    return {
      spawned,
      host: {
        spawnTowerNpc: (id, tx, ty) => { spawned.push([id, tx, ty]); },
        broadcast: () => undefined,
        clearCultists: () => undefined,
      },
    };
  }

  it('四塔活动而场上无实体 → 逐塔补位（防 updateLunarApocalypse 首帧全灭+误启 doom）', () => {
    const w = mkTowerWorld();
    const { host, spawned } = mkHost();
    respawnMissingTowers(w, { int: () => 0 } as never, host, () => false);
    expect(spawned.map((s) => s[0]).sort()).toEqual(
      [TOWER_SOLAR, TOWER_VORTEX, TOWER_NEBULA, TOWER_STARDUST].sort());
    expect(spawned.every((s) => s[2] === 20)).toBe(true);   // surface-40 兜底 y
  });

  it('塔实体已在场（has=true）→ 零动作（原版同态）', () => {
    const w = mkTowerWorld();
    const { host, spawned } = mkHost();
    respawnMissingTowers(w, { int: () => 0 } as never, host, () => true);
    expect(spawned).toEqual([]);
  });

  it('事件未激活 → 早退零动作（lunarApocalypseUp=false 世界零触碰）', () => {
    const w = mkTowerWorld();
    w.lunarEvent.active = false;
    const { host, spawned } = mkHost();
    respawnMissingTowers(w, { int: () => 0 } as never, host, () => false);
    expect(spawned).toEqual([]);
  });

  it('部分塔已倒（towerActive=false）→ 只补活动缺位塔', () => {
    const w = mkTowerWorld();
    w.lunarEvent.towerActive.solar = false;
    w.lunarEvent.towerActive.vortex = false;
    const { host, spawned } = mkHost();
    respawnMissingTowers(w, { int: () => 0 } as never, host, () => false);
    expect(spawned.map((s) => s[0]).sort()).toEqual([TOWER_NEBULA, TOWER_STARDUST].sort());
  });
});

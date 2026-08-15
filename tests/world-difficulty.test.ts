// 世界难度（Main.GameMode）错接修复回归 —— 26 机制审计 #10：
// 全部 expert/master 判定曾读 player.appearance.difficulty（角色难度 0软/1中/2硬/3旅），
// 本批拆成两条独立轴（原版语义）：
//   世界难度（Main.GameMode，Main.cs:2677：0 经典 1 专家 2 大师 3 旅程）
//     → 掉落 isExpert/isMaster / 吸血预算 / 掉钱档 / 旅行商店 / 瓦罐心 / 旅程时间倍率
//   角色难度（Player.difficulty：0 软核 1 中核 2 硬核 3 旅程）
//     → 死亡惩罚：软核掉钱（DropCoins）/ 中核掉全部物品 / 硬核角色消亡
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World, deathCoinKeepFraction } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Enemy } from '../src/entities/Enemy';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { parseWldToSave } from '../src/wld/WldImport';
import { packWorld } from '../src/workers/worldPacket';
import { dropInventoryOnDeath } from '../src/core/Game';
import {
  validateAppearance, defaultAppearance,
  dropsAllItemsOnDeath, dropsCoinsOnDeath,
} from '../src/player/Appearance';
import type { GameHooks } from '../src/entities/types';

describe('世界难度 getter 枚举（Main.cs:2696/:2775-2780）', () => {
  it('四档：经典 0 全 false / 专家 1 / 大师 2 / 旅程 3 只 isJourney', () => {
    const w = new World(32, 32, 1, 't');
    w.difficulty = 0;
    expect([w.isExpert, w.isMaster, w.isJourney]).toEqual([false, false, false]);
    w.difficulty = 1;
    expect([w.isExpert, w.isMaster, w.isJourney]).toEqual([true, false, false]);
    w.difficulty = 2;
    expect([w.isExpert, w.isMaster, w.isJourney]).toEqual([true, true, false]);
    w.difficulty = 3;   // 旅程：Main.Difficulty 回经典档（Main.cs:2771-2782 无 GameMode==3 分支）
    expect([w.isExpert, w.isMaster, w.isJourney]).toEqual([false, false, true]);
  });
});

describe('死亡掉钱：世界难度定档 × 角色难度定是否掉（Player.cs:38318 + DropCoins :53351）', () => {
  it('掉钱档位（Player.cs:53351-53380 num2=保留份额）：经典留 1/2 / 专家留 1/4（掉 3/4）/ 大师全掉', () => {
    expect(deathCoinKeepFraction(0)).toBe(0.5);
    expect(deathCoinKeepFraction(3)).toBe(0.5);   // 旅程世界按经典
    expect(deathCoinKeepFraction(1)).toBe(0.25);  // 专家：掉 3/4（曾误写 0.75 掉 1/4）
    expect(deathCoinKeepFraction(2)).toBe(0);     // 大师全掉（曾误写 1 不掉）
  });

  it('角色门：软核/旅程走 DropCoins，中核/硬核不走（钱随物品全掉）', () => {
    expect(dropsCoinsOnDeath(0)).toBe(true);
    expect(dropsCoinsOnDeath(3)).toBe(true);
    expect(dropsCoinsOnDeath(1)).toBe(false);
    expect(dropsCoinsOnDeath(2)).toBe(false);
    // 普通世界+硬核角色：不掉钱管线（deathCoinKeepFraction 不参与），死亡即消亡
    expect(dropsCoinsOnDeath(2) && deathCoinKeepFraction(0) === 0.5).toBe(false);
  });
});

describe('中核死亡掉物品（Player.cs:38254 DropItems(gemsOnly=false)）', () => {
  it('dropsAllItemsOnDeath：中核/硬核 true，软核/旅程 false', () => {
    expect(dropsAllItemsOnDeath(0)).toBe(false);
    expect(dropsAllItemsOnDeath(3)).toBe(false);
    expect(dropsAllItemsOnDeath(1)).toBe(true);
    expect(dropsAllItemsOnDeath(2)).toBe(true);
  });

  it('dropInventoryOnDeath：背包/盔甲/染料/杂项全掉 + 清空 + 发还铜三件（:53463）', () => {
    const inv = new Inventory();
    const torch = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]]!;
    const pick = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]]!;
    inv.slots[5] = { id: torch, stack: 30 };
    inv.slots[10] = { id: pick, stack: 1 };
    inv.armor[0] = { id: pick, stack: 1 };
    inv.dye[0] = { id: torch, stack: 1 };
    inv.miscEquips[0] = { id: torch, stack: 2 };
    inv.loadouts[1].armor[3] = { id: torch, stack: 4 };
    const dropped: Array<[string, number]> = [];
    dropInventoryOnDeath(inv, (key, stack) => dropped.push([key, stack]));
    // 5 件掉（含 Loadout 备份仓）——slots[10] 的 3509 镐走 TurnToAir 不掉
    // （:53414-53418 起始三件门【只在 inventory 主循环】；armor/dye/misc/loadouts
    //  无条件掉，故 armor[0] 的 3509 照掉）
    expect(dropped.length).toBe(5);
    expect(dropped.some(([k, n]) => k === VANILLA_ITEM_KEY_BY_ID[8] && n === 30)).toBe(true);
    expect(dropped.some(([k, n]) => k === VANILLA_ITEM_KEY_BY_ID[3509] && n === 1)).toBe(true);
    // 槽位清空
    expect(inv.slots.every((s) => s === null)).toBe(false);   // [0-2] 被发还起始三件
    expect(inv.slots.slice(3).every((s) => s === null)).toBe(true);
    expect(inv.armor.every((s) => s === null)).toBe(true);
    expect(inv.dye.every((s) => s === null)).toBe(true);
    expect(inv.miscEquips.every((s) => s === null)).toBe(true);
    expect(inv.loadouts[1].armor.every((s) => s === null)).toBe(true);
    // 发还铜制起始三件套（原版 3507 短剑 / 3509 镐 / 3506 斧，Player.cs:53463-53468）
    expect(VANILLA_ITEM_KEY_BY_ID[3507]).toBeDefined();
    expect(inv.slots[0]?.stack).toBe(1);
    expect(inv.slots[1]?.stack).toBe(1);
    expect(inv.slots[2]?.stack).toBe(1);
  });
});

describe('硬核角色消亡标记（Player.cs:38255 HardcoreDeathPenalty）', () => {
  it('validateAppearance 保留 hardcoreDead；普通角色缺省未消亡', () => {
    const dead = validateAppearance({ ...defaultAppearance('亡魂'), difficulty: 2, hardcoreDead: true });
    expect(dead.hardcoreDead).toBe(true);
    const alive = validateAppearance({ ...defaultAppearance('新人'), difficulty: 2 });
    expect(alive.hardcoreDead).toBeUndefined();
    // 旧数据非布尔值 → 归未消亡
    expect(validateAppearance({ ...defaultAppearance(), hardcoreDead: 1 as unknown as boolean }).hardcoreDead)
      .toBeUndefined();
  });
});

describe('敌怪掉落 isExpert/isMaster 读世界难度（Enemy.ts 消费点）', () => {
  const killEoc = (worldDifficulty: number, charDifficulty: number): string[] => {
    const world = new World(64, 64, 42, '测试');
    world.difficulty = worldDifficulty;
    world.lavaLine = 40;
    const drops: string[] = [];
    const player = new Player(0, 0, new Inventory());
    player.appearance = { ...defaultAppearance('测试'), difficulty: charDifficulty as 0 };
    const game = {
      world, player,
      enemies: () => [], critters: () => [],
      spawnDrop: (_x: number, _y: number, key: string) => { drops.push(key); return null; },
      damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, notifyInventoryChanged: () => {},
      showPickupLabel: () => {},
    } as unknown as GameHooks;
    const eoc = Enemy.fromVanilla(4, 32 * 16, 32 * 16)!;   // Eye of Cthulhu（boss）
    eoc.hurt(999999, 0, 0, game);
    return drops;
  };
  const bagKey = VANILLA_ITEM_KEY_BY_ID[3319];   // TreasureBag（bossBag 规则，仅专家分支）

  it('专家世界 + 软核角色 → 专家掉落生效（宝袋 3319）', () => {
    expect(killEoc(1, 0)).toContain(bagKey);
  });

  it('经典世界 + 软核角色 → 无专家分支（不掉宝袋）', () => {
    expect(killEoc(0, 0)).not.toContain(bagKey);
  });

  it('修复回归：经典世界 + 硬核角色（difficulty=2）不再误触专家分支', () => {
    // 修复前 Enemy.ts 读 p.appearance.difficulty>=2 → 硬核角色在经典世界也掉宝袋
    expect(killEoc(0, 2)).not.toContain(bagKey);
  });

  it('大师世界 → isMaster 分支可达（大师专属掉落门输入 true）', () => {
    const world = new World(64, 64, 42, '大师');
    world.difficulty = 2;
    expect(world.isMaster).toBe(true);
  });
});

describe('存档往返：header.difficulty + 旅程时间倍率持久化', () => {
  it('saveGame → loadSave 保留专家世界难度与旅程字段', () => {
    const world = new World(32, 32, 7, '专家世界');
    world.difficulty = 1;
    world.journeyTimeRate = 8;
    world.journeyFreezeTime = true;
    const player = new Player(0, 0, new Inventory());
    const json = saveGame(world, player, 0);
    const { world: w2 } = loadSave(json);
    expect(w2.difficulty).toBe(1);
    expect(w2.isExpert).toBe(true);
    expect(w2.journeyTimeRate).toBe(8);
    expect(w2.journeyFreezeTime).toBe(true);
  });

  it('旧档（无 header.difficulty）缺省经典', () => {
    const world = new World(32, 32, 7, '旧世界');
    const player = new Player(0, 0, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0));
    delete data.header.difficulty;
    delete data.header.journeyTimeRate;
    delete data.header.journeyFreezeTime;
    const { world: w2 } = loadSave(JSON.stringify(data));
    expect(w2.difficulty).toBe(0);
    expect(w2.isExpert).toBe(false);
    expect(w2.journeyTimeScale()).toBe(1);
  });
});

describe('wld 导入回填（WldParser.gameMode → save.header.difficulty）', () => {
  const WLD = join(__dirname, '..', 'Starter_World Master.wld');
  it.skipIf(!existsSync(WLD))('Starter_World Master.wld → 大师世界（GameMode 2）', () => {
    const buf = new Uint8Array(readFileSync(WLD));
    const { save, gameMode } = parseWldToSave(buf);
    expect(gameMode).toBe(2);
    expect(save.header.difficulty).toBe(2);
    const { world } = loadSave(JSON.stringify(save));
    expect(world.difficulty).toBe(2);
    expect(world.isMaster).toBe(true);
    expect(world.isExpert).toBe(true);   // Main.expertMode：大师也满足 ≥Expert（Main.cs:2775）
  });
});

describe('Journey 时间倍率（CreativePowers.cs:866/:1448 + Main.cs:6278）', () => {
  it('journeyTimeScale：冻结 0 / 倍率直通；clock 按倍率推进', () => {
    const w = new World(32, 32, 1, '旅程');
    w.difficulty = 3;
    expect(w.isJourney).toBe(true);
    expect(w.journeyTimeScale()).toBe(1);
    w.journeyTimeRate = 24;
    expect(w.journeyTimeScale()).toBe(24);
    w.journeyFreezeTime = true;
    expect(w.journeyTimeScale()).toBe(0);
    // fixedUpdate 的推进公式（Game：clock.tick(dt*1000*scale)）
    const before = w.clock.timeOfDay;
    w.clock.tick(1000 * w.journeyTimeScale());
    expect(w.clock.timeOfDay).toBe(before);                       // 冻结不推进
    w.journeyFreezeTime = false;
    const b2 = w.clock.timeOfDay;
    w.clock.tick(1000 * w.journeyTimeScale());
    expect(w.clock.timeOfDay).toBeCloseTo(b2 + 24000 / w.clock.dayLengthMs, 9);  // ×24
  });
});

describe('worker 生成/读档包：difficulty 随 WorldPacket 往返', () => {
  it('packWorld → fromPacket 保留世界难度（worker 生成路径消费）', () => {
    const w = new World(16, 16, 3, '大师');
    w.difficulty = 2;
    // packWorld 取走 buffer 所有权——重建一份 store 再比对（difficulty 在 packet 顶层）
    const { packet } = packWorld(w);
    const w2 = World.fromPacket({ ...packet, buf: packet.buf });
    expect(w2.difficulty).toBe(2);
    expect(w2.isMaster).toBe(true);
  });
});

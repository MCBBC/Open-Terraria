// BJ575 恶魔之心饰品槽持久化（用户实报：恶魔之心加的饰品槽重进游戏失效，卸下饰品后槽位消失）
// ============================================================================
// 原版四环定谳（Terarria1457 反编译亲读）：
//  ①使用面  Player.cs:45579-45582 ItemCheck：3335 ∧ itemAnimation>0 ∧ !extraAccessory
//            ∧ Main.expertMode ∧ ItemTimeIsZero → extraAccessory=true+消耗；
//            CanUse 拒 :52689：3335 ∧ (extraAccessorory∨!Main.expertMode) → false
//            （本仓 Game.ts case 3335 同式：经典世界整支不可用,专家/大师才置位）
//  ②存档面  Player.cs:55430 fileIO.Write(newPlayer.extraAccessory)（SavePlayer,
//            序在 statLifeMax 系后/unlockedBiomeTorches·ateArtisanBread·usedAegisCrystal 前）
//  ③读档面  Player.cs:55891 newPlayer.extraAccessory = fileIO.ReadBoolean()（release≥125）
//  ④槽位面  ResetEffects :18401-18409：extraAccessory∧(Main.expertMode∨Main.gameMenu)
//            → extraAccessorySlots=1,else 0（经典世界旗在格不生效）；
//            显隐 :4259-4281 CanDemonHeartAccessoryBeShown：锁∧armor[8]/[18]空
//            → dye[8].type>0;else true（占格臂=经典世界带专家档存物也显示,只是不生效）
// 本仓失效环=②存档面 worker 支：SaveClient.doSave（生产保存主路径）第二份手抄
//  playerData 漏 permanentUpgrades（extraAccessory 打头）等 14 键 → worker JSON 无键
//  → CharacterStore 随身态同步（mainFlow doSave→setState JSON.parse(json).player）/
//  世界槽位/快速保存三面全缺 → 重进 applyPlayer（mainFlow.ts pu.extraAccessory !==
//  undefined 门）不回灌 → ③读档面饿死 → 恶魔心第 6 配饰槽（armor[8]/染料[18]）恒锁。
//  卸下饰品后 armor[8]/[18]/dye[8] 全空 → ④显隐只剩解锁臂=false → 格消失=症状第二面。
// 落刀=玩家段装配单源化 buildPlayerSaveData（SaveFile.ts；saveGame/SaveClient 共用）。
// 判别面：既有全量 round-trip 测试都走 saveGame（完整路径）——worker 装配漂移零覆盖，
// 本文件以桩 Worker 直驱 SaveClient.doSave worker 分支（生产数据流,save.worker 同核
// serializeSave 重建,save.worker.ts:120-141 同式）复现/回归。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave, playerFromDiskForm } from '../src/save/SaveFile';
import { serializeSave } from '../src/save/serialize';
import { SaveClient } from '../src/workers/SaveClient';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = join(dirname(fileURLToPath(new URL(import.meta.url))), '../..');
const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const saveFileSrc = readFileSync(new URL('../src/save/SaveFile.ts', import.meta.url), 'utf8');
const saveClientSrc = readFileSync(new URL('../src/workers/SaveClient.ts', import.meta.url), 'utf8');
const mainFlowSrc = readFileSync(new URL('../src/mainFlow.ts', import.meta.url), 'utf8');
const vanillaPlayerCs = readFileSync(join(ROOT, 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8');

/** vid → 内部 id 权威反查（demon-heart-slots.test.ts 同口径） */
const vidIdx = (vid: number): number =>
  ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** BJ575 场景玩家：已使用恶魔之心（extraAccessory 置位） */
const mkHeartPlayer = (world: World): { player: Player; inv: Inventory } => {
  const inv = new Inventory();
  inv.extraAccessory = true;
  void world;
  return { player: new Player(100, 100, inv), inv };
};

// ============ 原版金标锚（防标杆漂移;sw-rb12a 同款反编译直读） ============
describe('原版 1457 金标锚（Terarria1457/Terraria/Player.cs 亲读）', () => {
  it('②存档面 :55430 fileIO.Write(newPlayer.extraAccessory) 在档', () => {
    expect(vanillaPlayerCs).toContain('fileIO.Write(newPlayer.extraAccessory);');
  });
  it('③读档面 :55891 release≥125 ReadBoolean 还原', () => {
    expect(vanillaPlayerCs).toContain('newPlayer.extraAccessory = fileIO.ReadBoolean();');
  });
  it('①使用面 :45579-45582 专家门+!extraAccessory 门', () => {
    expect(vanillaPlayerCs).toContain('sItem.type == 3335 && itemAnimation > 0 && !extraAccessory && Main.expertMode && ItemTimeIsZero');
  });
  it('④槽位面 :18402 extraAccessory∧(expertMode∨gameMenu) → extraAccessorySlots=1', () => {
    expect(vanillaPlayerCs).toContain('if (extraAccessory && (Main.expertMode || Main.gameMenu))');
    expect(vanillaPlayerCs).toContain('extraAccessorySlots = 1;');
  });
});

// ============ ① 使用面（效果位;使用臂本体 consumable-remainder.test.ts 已源守卫） ============
describe('① 使用恶魔之心 → 槽位出现（专家世界,无占格依赖）', () => {
  it('Game case 3335 专家门+置位臂在位（源守卫）', () => {
    expect(gameSrc).toContain("case 3335: // 恶魔之心");
    expect(gameSrc).toContain('if (!(this.world.isExpert || this.world.isMaster)) break;');
    expect(gameSrc).toContain('if (!p.inv.extraAccessory) flagOnce(() => { p.inv.extraAccessory = true; });');
  });
  it('效果位：使用前（专家世界）8 号格锁+不显示;置位后解锁+显示（shownExtraCount=1,无需占格）', () => {
    const inv = new Inventory();
    inv.gateExpert = true;
    // ★使用前判别臂（extraAccessory 门）：专家世界未吃恶魔心=格不出
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(false);
    expect(inv.extraSlotShown().heart).toBe(false);
    inv.extraAccessory = true;                                 // ← 使用面置位
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(true);
    expect(inv.extraSlotShown().heart).toBe(true);
    expect(inv.shownExtraCount()).toBe(1);
  });
});

// ============ ②⑤ 存档序列化面（sync 路径 round-trip） ============
describe('② 存读档 → 槽位保持（saveGame sync 路径 round-trip）', () => {
  it('extraAccessory=true 落盘 permanentUpgrades 并还原（⑤序列化面）', () => {
    const world = new World(64, 32, 42, 'bj575');
    const { player } = mkHeartPlayer(world);
    const json = saveGame(world, player, 0);
    const data = JSON.parse(json);
    expect(data.player.permanentUpgrades?.extraAccessory).toBe(true);
    expect(loadSave(json).player.permanentUpgrades?.extraAccessory).toBe(true);
  });
  it('未使用=false 显式落盘（非 undefined——原版 bool 位缺省语义）', () => {
    const world = new World(64, 32, 42, 'bj575f');
    const json = saveGame(world, new Player(100, 100, new Inventory()), 0);
    expect(JSON.parse(json).player.permanentUpgrades?.extraAccessory).toBe(false);
  });
  it('角色随身态读面:playerFromDiskForm 保持 permanentUpgrades（CharacterStore→applyPlayer 通道）', () => {
    const world = new World(64, 32, 42, 'bj575c');
    const { player } = mkHeartPlayer(world);
    // doSave→charStore.setState(cid, JSON.parse(json).player) 同形（磁盘稳定 id 形）
    const diskForm = JSON.parse(saveGame(world, player, 0)).player;
    expect(playerFromDiskForm(diskForm).permanentUpgrades?.extraAccessory).toBe(true);
  });
  it('读档面回灌线在位（mainFlow.applyPlayer 源守卫）', () => {
    expect(mainFlowSrc).toContain('if (pu.extraAccessory !== undefined) g.player.inv.extraAccessory = pu.extraAccessory;');
  });
});

// ============ ★真凶判别面：worker 生产主路径（SaveClient.doSave worker 分支） ============
/** 桩 Worker：与 save.worker 同核（serializeSave 纯核心 + :120-141 视图重建同式），
 *  回包走微任务——SaveClient.ensure 的 onmessage 消费。不经真线程,数据流同构：
 *  doSave 组装 player/meta → postMessage → worker serializeSave → saved(json)。
 *  reqs 记录到达请求——★防夹具喂幻影（BJ89 族）：断言 worker 分支真实到达,
 *  ensure 失败静默回退 saveGame 会把判别面做虚（M2 变异实验实证过此坑）。 */
class FakeSaveWorker {
  static reqs: any[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate(): void { /* 桩 */ }
  postMessage(msg: any): void {
    FakeSaveWorker.reqs.push(msg);
    if (msg?.type !== 'save') return;   // applyModIds fire-and-forget 忽略
    const req = msg;
    const n = Math.floor(req.bufs.type.byteLength / 2);
    const view = {
      type: new Uint16Array(req.bufs.type),
      flags: new Uint8Array(req.bufs.flags),
      frameX: new Uint16Array(req.bufs.frameX),
      frameY: new Uint16Array(req.bufs.frameY),
      wall: new Uint16Array(req.bufs.wall),
      liquid: new Uint8Array(req.bufs.liquid),
      liquidType: new Uint8Array(req.bufs.liquidType),
      wire: new Uint8Array(req.bufs.wire),
      half: new Uint8Array(req.bufs.half),
      slope: new Uint8Array(req.bufs.slope),
      paint: new Uint8Array(req.bufs.paint ?? new ArrayBuffer(n)),
      paintWall: new Uint8Array(req.bufs.paintWall ?? new ArrayBuffer(n)),
      coat: req.bufs.coat ? new Uint8Array(req.bufs.coat) : undefined,
      explored: req.bufs.explored ? new Uint8Array(req.bufs.explored) : undefined,
    };
    const json = serializeSave(
      view, { ...req.meta, w: req.w, h: req.h }, req.player, req.playTimeMs,
      req.townNpcs, req.events, req.pillarNpcs, req.pressurePlates);
    queueMicrotask(() => this.onmessage?.({ data: { type: 'saved', id: req.id, json } }));
  }
}

describe('★BJ575 真凶判别面：worker 生产主路径 extraAccessory 落盘（修复前恒缺键）', () => {
  it('SaveClient.doSave worker 分支:permanentUpgrades.extraAccessory=true 进 JSON 并可读档还原', async () => {
    vi.stubGlobal('Worker', FakeSaveWorker);
    FakeSaveWorker.reqs = [];
    try {
      const world = new World(64, 32, 42, 'bj575w');
      const { player } = mkHeartPlayer(world);
      const sc = new SaveClient();
      sc.ensure();   // mainFlow.doSave 同款显式懒建（漏调=静默同步回退,判别面做虚）
      const json = await sc.save(world, player, 0);
      // ★分支到达断言：save 请求真实进了 worker 分支（非 ensure 失败回退 saveGame）
      expect(FakeSaveWorker.reqs.some((r) => r?.type === 'save')).toBe(true);
      const data = JSON.parse(json);
      expect(data.player.permanentUpgrades?.extraAccessory).toBe(true);
      expect(loadSave(json).player.permanentUpgrades?.extraAccessory).toBe(true);
      sc.release();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('worker/sync 两路玩家段语义对拍（装配单源同构;header.created 冻结对齐）', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.stubGlobal('Worker', FakeSaveWorker);
    FakeSaveWorker.reqs = [];
    try {
      const world = new World(64, 32, 42, 'bj575p');
      const { player } = mkHeartPlayer(world);
      const syncJson = saveGame(world, player, 0);
      const sc = new SaveClient();
      sc.ensure();
      const workerJson = await sc.save(world, player, 0);
      sc.release();
      expect(FakeSaveWorker.reqs.some((r) => r?.type === 'save')).toBe(true);
      expect(JSON.parse(workerJson).player).toEqual(JSON.parse(syncJson).player);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
  it('装配单源守卫:SaveClient 禁回抄内联 playerData（BJ71 家族纪律）', () => {
    expect(saveClientSrc).toContain('buildPlayerSaveData(world, player)');
    expect(saveClientSrc).not.toContain("const playerData: SaveData['player'] = {");
    expect(saveFileSrc).toContain('export function buildPlayerSaveData');
  });
});

// ============ ③④ 槽位显示面（Player.cs:18401-18409/:4259-4281） ============
describe('③ 卸下饰品 → 槽位保持（extraAccessory 持久,解锁臂顶上）', () => {
  it('占格卸下后 8 号格仍解锁+显示', () => {
    const inv = new Inventory();
    const acc = vidIdx(5452);
    inv.extraAccessory = true;
    inv.gateExpert = true;
    inv.armor[8] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().heart).toBe(true);
    inv.armor[8] = null;                                     // ← 卸下饰品
    expect(inv.extraSlotShown().heart).toBe(true);           // 解锁臂顶上=槽位不消失
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(true);
  });
  it('④经典世界（无专家门）：格不生效（cs:18402 else 臂）但占格仍显示（cs:4261 占格臂）', () => {
    const inv = new Inventory();
    inv.extraAccessory = true;                               // 旗在,专家世界外不生效
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(false);
    const acc = vidIdx(5452);
    inv.armor[8] = { id: acc, stack: 1 };
    expect(inv.extraSlotShown().heart).toBe(true);           // 经典世界带专家档存物也显示
  });
  it('④大师世界无恶魔心：9 号格开 8 号格锁（extraAccessory 门判别臂,cs:18402 同式）', () => {
    const inv = new Inventory();
    inv.gateMaster = true;
    expect(inv.isItemSlotUnlockedAndUsable(9)).toBe(true);   // 大师水晶槽无道具门
    expect(inv.isItemSlotUnlockedAndUsable(8)).toBe(false);  // 恶魔心门在此（M3 变异翻真位）
  });
});

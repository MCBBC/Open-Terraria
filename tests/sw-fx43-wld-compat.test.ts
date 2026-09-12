// SW-FX43（2026-09-12）wld-compat P1：快照通道 + caveBackX + teSnap/townRooms 存档链携行。
// 金标锚（Terarria1457 亲读）：
//   - wldSnap 快照通道（FX33 定谳清偿）：全仓唯一生产点=WldImport wldSnap 组装（差量
//     携行裁断见彼处注）；携行链=WldImport → loadSaveData(World) → buildSaveParts/
//     saveGame/SaveClient.doSave(SaveMeta) → serializeSave(JSON) → exportWld
//     writeHeader fieldValue 快照优先（WldHeaderFields.ts :244-250）。
//   - caveBackX：WF:1266-1268 写/:2065-2067 读；原版独立掷 RandomizeCaveBackgrounds
//     （WorldGen.cs:8141-8210）——与 treeX 无派生关系；自建=WorldGen ⑫ 掷流位同段掷值。
//   - worldId：WF:1244 写/:1977 读；自建=WorldGen.cs:11364 genRand.Next(int.MaxValue)；
//     footer 必须与 header 同值（LoadFooter :3003-3015，BadFooter=整档拒载）。
//   - teSnap 载入侧淘汰：WF:3349-3359 尾扫（!InWorld ‖ !CheckValidTile）；逐型判据=
//     TETrainingDummy.cs:93-99（378+frameY==0+frameX%36==0）/TELogicSensor.cs:152-158
//     （423+frameX%18==0+frameY%18==0）/TETeleportationPylon.cs:136-137
//     （597+frameY==0+frameX%54==0）。
//   - TreeTops slot5=jungleBG（TreeTopsInfo.cs:222 `_variations[5]=WorldGen.jungleBG`）。
// 判据：round-trip 全等（export→import→repo 存档链→export 逐字段+段字节）为主判据 +
//   变异证红（快照键错位/TE 错位必须被检出）+ 真档验证 + 旧档兼容。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import {
  loadSaveData, saveGame,
  bytesToB64, rleTiles, rlePairs,
  type SaveData,
} from '../src/save/SaveFile';
import { TILE_BY_KEY, TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';

const W = 48, H = 16;

function mkSave(over?: Partial<SaveData>): SaveData {
  const n = W * H;
  const type = new Uint16Array(n);
  const frameX = new Uint16Array(n);
  const frameY = new Uint16Array(n);
  // TE 三类承载 tile（teSnap 载入侧 CheckValidTile 淘汰的判据面）：
  //   假人 378（frameY==0+frameX%36==0）/传感器 423（frameX%18==0+frameY%18==0）/
  //   晶塔 597（frameY==0+frameX%54==0）——锚格帧按各 ValidTile 带宽对齐
  const put = (x: number, y: number, key: string, fx = 0, fy = 0) => {
    const i = y * W + x;
    type[i] = TILE_BY_KEY[key];
    frameX[i] = fx; frameY[i] = fy;
  };
  put(30, 4, 'v_378_target_dummy');
  put(31, 4, 'v_423_logicsensor', 18, 0);
  put(33, 4, 'v_597_pylons', 54, 0);
  return {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: 'FX43回环', seed: 7, width: W, height: H,
      spawn: [8, 6], groundLevel: 6, rockLevel: 9,
      crimson: false, dungeonX: 2, dungeonY: 5,
      treeX: [12, 24, 36], treeStyle: [1, 2, 3, 4],
      // ★SW-FX43：caveBackX 真值（原版 RandomizeCaveBackgrounds 独立掷的等价占位——
      //  有意与 treeX 不同值,证明导出走建模值而非 treeX 派生）
      caveBackX: [13, 25, 37],
      worldId: 777123456,
      created: 1700000000000, playTimeMs: 0, moonType: 3, difficulty: 0,
      bgStyles: { cave: [1, 2, 3, 0], ice: 1, jungle: 2, hell: 3, mushroom: 1, underworld: 3, bg10: 0, bg11: 0, bg12: 0, forest: [2, 3, 4], desert: 2, ocean: 5, corrupt: 2, snow: 3, hallow: 1, crimson: 4, jungleBG: 5 },
    },
    clock: { timeOfDay: 0.25, dayCount: 1, moonPhase: 0, bloodMoon: false, eclipse: false },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    events: { partyManual: false, lanternManual: false, lanternGenuine: false, lanternNext: false, lanternCooldown: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(new Uint16Array(n))),
    liquid: bytesToB64(rlePairs(new Uint16Array(n))),
    liquidType: bytesToB64(rlePairs(new Uint8Array(n))),
    wire: bytesToB64(rlePairs(new Uint16Array(n))),
    blocks: bytesToB64(rlePairs(new Uint8Array(n))),
    paint: bytesToB64(rlePairs(new Uint8Array(n))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(n))),
    coat: bytesToB64(rlePairs(new Uint8Array(n))),
    chests: [], signs: [], npcs: [], flags: {},
    ...over,
  } as unknown as SaveData;
}

/** ★SW-FX43 差量快照键集（WldImport 生产点同集——键名=WldHeaderFields 台账 name） */
const SNAP: NonNullable<SaveData['wldSnap']> = {
  seedText: '05162020notthebees',
  worldGenVersion: '1395864371202',          // ≠常量 1395864371201（证明快照优先于台账常量）
  guid: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',  // 非 16 零字节（证明非 GUID.Zero 回退）
  CreationTime: '6383000000000123456',       // >2^53——字符串域（Number 化即失真,证精度）
  manifest: '{" schemes ":"vanilla","mods":[]}',   // 非空串（证明非台账 '' 缺省）
  worldSurface: 331.7,                       // 带小数（证明非 floor 化 header.groundLevel）
  rockLayer: 654.3,
};

const TE_SNAP: NonNullable<SaveData['teSnap']> = [
  { type: 0, x: 30, y: 4, npc: -1 },
  { type: 2, x: 31, y: 4, logicCheck: 3, on: true },
  { type: 7, x: 33, y: 4 },
];
const TOWN_ROOMS: NonNullable<SaveData['townRooms']> = [
  { npc: 17, x: 3, y: 6 }, { npc: 20, x: 9, y: 6 },
];

/** 生产保存路径同形桩 player（saveGame 仅读槽位/计数,零行为面） */
function stubPlayer(): Parameters<typeof saveGame>[1] {
  return {
    hp: 100, x: 0, y: 0, baseMaxHp: 100, baseMaxMana: 20, mana: 40,
    inv: {
      slots: Array(40).fill(null), selected: 0, armor: [], dye: [], trash: null,
      miscEquips: [], miscDyes: [], loadouts: [], currentLoadout: 0, extraAccessory: false,
    },
    buffs: { toSave: () => [] },
    taxMoney: 0, golferScoreAccumulated: 0, anglerQuestsFinished: 0,
    deathsPve: 0, deathsPvp: 0, team: 0, dead: false, respawnTimer: 0,
    hairDye: 0, hbLocked: false, enabledSuperCart: true,
    builderAccStatus: new Array(12).fill(0),
    usedAegisCrystal: false, usedAegisFruit: false, usedArcaneCrystal: false,
    usedGummyWorm: false, usedAmbrosia: false, luckState: { usedGalaxyPearl: false },
  } as unknown as Parameters<typeof saveGame>[1];
}

/** repo 存档链一跳（生产 saveGame 路径——SaveClient.doSave 同形）：SaveData →
 *  loadSaveData → saveGame → JSON 串 */
function repoChain(save: SaveData, play?: (w: ReturnType<typeof loadSaveData>['world']) => void): string {
  const { world } = loadSaveData(JSON.parse(JSON.stringify(save)) as SaveData);
  play?.(world);
  return saveGame(world, stubPlayer(), 0);
}

describe('SW-FX43 快照通道差量携行（repo 存档链 round-trip）', () => {
  const save = mkSave({ wldSnap: SNAP, teSnap: TE_SNAP, townRooms: TOWN_ROOMS } as Partial<SaveData>);

  it('export→import→repo 链→export→parse：快照七键+worldId+caveBackX 逐字段全等', () => {
    const json = repoChain(save);
    const j = JSON.parse(json) as SaveData;
    // ① 快照/三通道确实落盘（FX33 定谳的「零生产者」断链本刀闭合）
    expect(j.wldSnap).toEqual(SNAP);
    expect(j.teSnap).toEqual(TE_SNAP);
    expect(j.townRooms).toEqual(TOWN_ROOMS);
    expect(j.header.worldId).toBe(777123456);
    expect(j.header.caveBackX).toEqual([13, 25, 37]);
    // ② reload（再进世界）后 World 侧仍携行
    const l2 = loadSaveData(JSON.parse(json));
    expect(l2.world.wldSnap).toEqual(SNAP);
    expect(l2.world.teSnap).toEqual(TE_SNAP);
    expect(l2.world.townRooms).toEqual(TOWN_ROOMS);
    // ③ 存档链产物导出 → 原版域读回：逐字段全等
    const bytes = exportWld(JSON.parse(json));
    const wld = parseWld(bytes);
    expect(wld.seed).toBe(SNAP.seedText);                       // 种子原文文本（非数值派生）
    expect(wld.worldGenVersion).toBe(BigInt(SNAP.worldGenVersion));
    expect(wld.guid).toBe(SNAP.guid);
    expect(wld.creationTime).toBe(BigInt(SNAP.CreationTime));   // >2^53 ticks 零失真
    expect(wld.manifest).toBe(SNAP.manifest);
    expect(wld.groundLevel).toBe(SNAP.worldSurface);            // f64 原值（非 floor）
    expect(wld.rockLevel).toBe(SNAP.rockLayer);
    expect(wld.worldId).toBe(777123456);
    expect(wld.caveBackX).toEqual([13, 25, 37]);
    expect(wld.jungleBG).toBe(5);
    // ④ 导出文件再导入：快照通道自身闭环（重捕获=原快照）
    const back = parseWldToSave(bytes).save;
    expect(back.wldSnap).toEqual(SNAP);
  });

  it('repo 链前后导出段字节全等（pointers[2] 起——header 时变位除外,同 FX35 判据）', () => {
    const json = repoChain(save);
    const b1 = exportWld(save);                 // 导入形态 SaveData 直出
    const b2 = exportWld(JSON.parse(json));     // repo 存档链形态直出
    const p2 = (b: Uint8Array) => new DataView(b.buffer).getInt32(26 + 4, true);   // pointers[2]=tiles 起
    expect(p2(b2)).toBeGreaterThanOrEqual(p2(b1) - 64);
    const tail1 = b1.subarray(p2(b1)), tail2 = b2.subarray(p2(b2));
    expect(tail2.length).toBe(tail1.length);
    expect(Buffer.from(tail2).equals(Buffer.from(tail1))).toBe(true);
  });

  it('差量裁断：活态字段不被快照钉死（游玩后导出=建模现值）', () => {
    const json = repoChain(save, (world) => {
      // 模拟游玩：击杀克眼/推进时间/入侵进行中
      world.flags.downed_4 = true;
      world.clock.timeOfDay = 0.5;
      world.invasionSize = 77;
      world.invasionType = 1;
    });
    const wld = parseWld(exportWld(JSON.parse(json)));
    // boss 旗/入侵/时间为建模活路——若全字段携行,此处将回退导入值（反面破坏）
    expect(wld.flags.downed_4).toBe(true);
    expect(wld.invasion.size).toBe(77);
    expect(wld.invasion.type).toBe(1);
    // timeOfDay 0.5 → 昼支 time=(0.5-0.1875)×108000=33700?（0.3125×108000=33750,dyadic 精确）
    expect(wld.time).toBe(33750);
  });

  it('变异证红：快照键值/teSnap 错位必须被检出', () => {
    const json = repoChain(save);
    // ① guid 单 hex 错位 → 导出域读回必不等（判据敏感度）
    const mutated = JSON.parse(json) as SaveData;
    mutated.wldSnap = { ...SNAP, guid: '1f1e2d3c4b5a69788796a5b4c3d2e1f0' };
    const wldMut = parseWld(exportWld(mutated));
    expect(wldMut.guid).not.toBe(SNAP.guid);
    // ② CreationTime 末位错位 → 大整数精度敏感（Number 域会丢位,字符串域可检出）
    const mut2 = JSON.parse(json) as SaveData;
    mut2.wldSnap = { ...SNAP, CreationTime: '6383000000000123457' };
    expect(parseWld(exportWld(mut2)).creationTime).not.toBe(BigInt(SNAP.CreationTime));
    // ③ teSnap 坐标错位 → 载入侧 CheckValidTile 淘汰（TE 错位应红）
    const mut3 = JSON.parse(json) as SaveData;
    mut3.teSnap = TE_SNAP.map((t) => ({ ...t, x: t.x + 1 }));
    const l3 = loadSaveData(mut3);
    expect(l3.world.teSnap?.length ?? 0).toBe(0);
  });
});

describe('SW-FX43 teSnap 载入侧淘汰（CheckValidTile 1:1,WF:3349-3359）', () => {
  it('界内+锚帧判据全过 → 保留；锚格无 tile/帧错带 → 逐型淘汰', () => {
    // 全部合法（mkSave 已按各 ValidTile 带宽放 tile）→ 三件全保留
    const ok = loadSaveData(mkSave({ teSnap: TE_SNAP } as Partial<SaveData>));
    expect(ok.world.teSnap).toEqual(TE_SNAP);
    // 淘汰面：假人锚格无 tile（InWorld 内但 type=0）/晶塔 frameX 不在 54 带
    const bad: NonNullable<SaveData['teSnap']> = [
      { type: 0, x: 40, y: 4, npc: 5 },                       // 空气锚格
      { type: 2, x: 31, y: 4, logicCheck: 0, on: false },     // 传感器锚帧 18（18%18==0 合法→保留）
      { type: 7, x: 33, y: 4 },                               // 晶塔合法（54%54==0）
    ];
    const half = loadSaveData(mkSave({ teSnap: bad } as Partial<SaveData>));
    expect(half.world.teSnap?.length).toBe(2);
    // 越界（InWorld(1) 门）
    const outside = loadSaveData(mkSave({ teSnap: [{ type: 7, x: W + 3, y: 4 }] } as Partial<SaveData>));
    expect(outside.world.teSnap).toBeUndefined();
  });
});

describe('SW-FX43 caveBackX/worldId 真值链', () => {
  it('caveBackX：建模真值优先,旧档缺省回退 treeX 派生（FX33 既有近似）', () => {
    // ① 建模真值：header.caveBackX=[13,25,37]（≠treeX[12,24,36]）→ 导出走真值
    expect(parseWld(exportWld(mkSave())).caveBackX).toEqual([13, 25, 37]);
    // ② 旧档：无 caveBackX → treeX 派生回退（零行为变化）
    const legacy = mkSave();
    delete (legacy.header as { caveBackX?: number[] }).caveBackX;
    expect(parseWld(exportWld(legacy)).caveBackX).toEqual([12, 24, 36]);
  });

  it('worldId：建模真值优先,旧档缺省回退 created-XOR 派生；footer 与 header 同值', () => {
    const bytes = exportWld(mkSave());
    const wld = parseWld(bytes);
    expect(wld.worldId).toBe(777123456);
    // footer（WF:1759 true+name+worldId）起点=pointers[10]（creativePowers 尾）
    const dv = new DataView(bytes.buffer);
    const fp = dv.getInt32(26 + 10 * 4, true);
    expect(bytes[fp]).toBe(1);   // bool true
    let p = fp + 1;
    let len = 0, shift = 0;
    for (;;) { const b = bytes[p++]; len |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
    p += len;                    // worldName
    expect(dv.getInt32(p, true)).toBe(777123456);   // LoadFooter :3003-3015 同值硬校验
    // 旧档派生回退：worldId 缺省 → created XOR 派生（JS ToInt32 语义与台账一致）
    const legacy = mkSave();
    delete (legacy.header as { worldId?: number }).worldId;
    const legacySave = exportWld(legacy);
    const created = (JSON.parse(JSON.stringify(legacy)) as SaveData).header.created ?? 0;
    expect(parseWld(legacySave).worldId).toBe(((created ^ 0x55555555) & 0x7fffffff));
  });
});

describe('SW-FX43 旧档/自建世界兼容（无快照零迁移）', () => {
  it('无 wldSnap/teSnap/townRooms 的旧档：落盘无键、导出全回退路径不炸', () => {
    const legacy = mkSave();
    delete (legacy as { wldSnap?: unknown }).wldSnap;
    delete (legacy.header as { caveBackX?: number[] }).caveBackX;   // 旧档无建模值→回退
    // R16-5 时代旧档：bgStyles 在而无 jungleBG 键（键为本刀新增）
    delete (legacy.header as { bgStyles?: { jungleBG?: number } }).bgStyles?.jungleBG;
    const json = repoChain(legacy);
    const j = JSON.parse(json) as SaveData;
    expect('wldSnap' in j).toBe(false);
    expect('teSnap' in j).toBe(false);
    expect('townRooms' in j).toBe(false);
    const wld = parseWld(exportWld(j));
    expect(wld.caveBackX).toEqual([12, 24, 36]);       // treeX 派生回退
    expect(wld.jungleBG).toBe(0);                      // 无键 → 台账 0（原缺省语义）
    expect(wld.manifest).toBe('');                     // 台账空串（WorldManifest 容错域）
    // TreeTops 派生 slot5：无 jungleBG 键 → 0（sw-fx33 既有金丝雀语义不变）
    expect(wld.treeTops).toEqual([1, 2, 3, 4, 2, 0, 3, 1, 4, 2, 5, 1, 3]);
  });

  it('有 jungleBG 键自建/导入档：TreeTops 派生 slot5 写真值（TreeTopsInfo.cs:222）', () => {
    const save = mkSave();
    delete (save.header as { treeTops?: number[] }).treeTops;
    expect(parseWld(exportWld(save)).treeTops).toEqual([1, 2, 3, 4, 2, 5, 3, 1, 4, 2, 5, 1, 3]);
  });
});

// ---- 自建世界集成（generateWorld 全管线——「自建=原版同款派生」终判） ----
describe('SW-FX43 自建世界 caveBackX/worldId 全管线（generateWorld 4200×1200）', () => {
  it('worldgen 掷值入档,导出与原版 4200 尺寸分支同构（WorldGen.cs:8150-8158/11364）', async () => {
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const world = await generateWorld({ width: 4200, height: 1200, seedText: 'fx43gen', evil: 0 });
    // 原版 4200 分支（WorldGen.cs:8146-8158）：caveBackX[0]=Next(1050,3150)、[1]=[2]=4200
    expect(world.caveBackX?.length).toBe(3);
    expect(world.caveBackX![0]).toBeGreaterThanOrEqual(1050);
    expect(world.caveBackX![0]).toBeLessThan(3150);
    expect(world.caveBackX![1]).toBe(4200);
    expect(world.caveBackX![2]).toBe(4200);
    // worldId=Reset ⑫ 掷流位（WorldGen.cs:11364 Next(int.MaxValue) 值域）
    expect(world.worldId).toBeGreaterThanOrEqual(0);
    expect(world.worldId).toBeLessThan(2147483648);
    // 生成→存档链→导出→解析：caveBackX/worldId 零漂移（自建不再按 treeX 派生）
    const json = saveGame(world, stubPlayer(), 0);
    const wld = parseWld(exportWld(JSON.parse(json)));
    expect(wld.caveBackX).toEqual(world.caveBackX);
    expect(wld.worldId).toBe(world.worldId);
  }, 600000);
});

// ---- 真档验证（round-trip 全等终判） ----
const REAL = join(__dirname, 'golden', 'wld', '12345世界.wld');

describe.skipIf(!existsSync(REAL))('SW-FX43 真档验证（12345世界.wld 导入→repo 链→导出）', () => {
  const buf = new Uint8Array(readFileSync(REAL));
  const wld0 = parseWld(buf);
  const { save } = parseWldToSave(buf);
  const json = repoChain(save);
  const wld2 = parseWld(exportWld(JSON.parse(json)));

  it('header 身份/精度快照七键零漂移', () => {
    expect(wld2.title).toBe(wld0.title);
    expect(wld2.seed).toBe(wld0.seed);                       // seedText 快照
    expect(wld2.worldGenVersion).toBe(wld0.worldGenVersion); // 捕获（曾恒写常量）
    expect(wld2.guid).toBe(wld0.guid);                       // 捕获（曾恒 16 零字节）
    expect(wld2.creationTime).toBe(wld0.creationTime);       // ticks 零失真（曾 ms 化）
    expect(wld2.manifest).toBe(wld0.manifest);               // 捕获（曾恒写 ''）
    expect(wld2.groundLevel).toBe(wld0.groundLevel);         // f64 原值（曾 floor）
    expect(wld2.rockLevel).toBe(wld0.rockLevel);
  });

  it('caveBackX/worldId/背景样式/树表/出生点逐项全等', () => {
    expect(wld2.caveBackX).toEqual(wld0.caveBackX);          // 本刀主判据（曾 treeX 派生漂移）
    expect(wld2.worldId).toBe(wld0.worldId);
    expect(wld2.caveBackStyle).toEqual(wld0.caveBackStyle);
    expect(wld2.iceBackStyle).toBe(wld0.iceBackStyle);
    expect(wld2.jungleBackStyle).toBe(wld0.jungleBackStyle);
    expect(wld2.hellBackStyle).toBe(wld0.hellBackStyle);
    expect(wld2.jungleBG).toBe(wld0.jungleBG);
    expect(wld2.treeX).toEqual(wld0.treeX);
    expect(wld2.treeStyle).toEqual(wld0.treeStyle);
    expect(wld2.treeTops).toEqual(wld0.treeTops);
    expect(wld2.spawnX).toBe(wld0.spawnX);
    expect(wld2.spawnY).toBe(wld0.spawnY);
    expect(wld2.dungeonX).toBe(wld0.dungeonX);
    expect(wld2.dungeonY).toBe(wld0.dungeonY);
    expect(wld2.moonType).toBe(wld0.moonType);
    expect(wld2.moonPhase).toBe(wld0.moonPhase);
    expect(wld2.bloodMoon).toBe(wld0.bloodMoon);
    expect(wld2.eclipse).toBe(wld0.eclipse);
    expect(wld2.cultistDelay).toBe(wld0.cultistDelay);
    expect(wld2.meteorShowerCount).toBe(wld0.meteorShowerCount);   // 捕获（曾读位即弃）
    expect(wld2.sandstorm).toEqual(wld0.sandstorm);                // 捕获（曾读位即弃）
  });

  it('入侵五元组/渔夫/天气零漂移 + _tempTime 分数表示 ulp 边界内', () => {
    expect(wld2.invasion).toEqual(wld0.invasion);            // 捕获（曾读位即弃）
    expect(wld2.anglerQuest).toBe(wld0.anglerQuest);
    expect(wld2.anglerWhoFinishedToday).toEqual(wld0.anglerWhoFinishedToday);
    expect(wld2.dayTime).toBe(wld0.dayTime);
    // _tempTime：clock.timeOfDay 分数表示的逆变换 G(F(t)) 有 ~1e-11 ulp 误差
    // （建模表示边界,登记债——原版自身 save→load 精确）
    expect(Math.abs(wld2.time - wld0.time)).toBeLessThan(1e-6);
    expect(wld2.weather?.raining).toBe(wld0.weather?.raining);
    expect(wld2.weather?.rainTime).toBe(wld0.weather?.rainTime);
    expect(wld2.weather?.maxRaining).toBeCloseTo(wld0.weather?.maxRaining ?? 0, 5);
  });

  it('teSnap 三类/townRooms 透传零漂移（含载入侧淘汰后存活）', () => {
    const snap0 = wld0.tileEntities.filter((t) => t.type === 0 || t.type === 2 || t.type === 7);
    const snap2 = wld2.tileEntities.filter((t) => t.type === 0 || t.type === 2 || t.type === 7);
    expect(snap2.length).toBe(snap0.length);
    for (let i = 0; i < snap0.length; i++) {
      expect(snap2[i].type).toBe(snap0[i].type);
      expect(snap2[i].x).toBe(snap0[i].x);
      expect(snap2[i].y).toBe(snap0[i].y);
      expect(snap2[i].dummy).toEqual(snap0[i].dummy);
      expect(snap2[i].sensor).toEqual(snap0[i].sensor);
    }
    expect(wld2.townRooms).toEqual(wld0.townRooms);
  });
});

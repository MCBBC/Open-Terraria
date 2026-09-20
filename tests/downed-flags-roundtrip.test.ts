// downed* 旗面 round-trip 回归（2026-09-14 审计批）——用户关切:已击败 BOSS 的世界
// 存档存储是否正常,避免打败后又反复出现/进度丢失。
//
// 审计锚（1457 终值）:
//  - 写点:NPC.checkDead switch（NPC.cs:80100-80310）——case 517/422/507/493 四塔
//    downedTower*(:80137-80156)、245(:80162)/370(:80165)/636(:80168)/668(:80171)/
//    657(:80174)、109 downedClown(:80193-80196)、222(:80203)、439(:80210)、398(:80214)、
//    50(:80232)、125/126 downedMechBoss2+downedMechBossAny(:80239-80244)、262(:80249)、
//    4(:80257)、13/14/15/266 downedBoss2(:80266-80279)、35(:80281-80285)、
//    127(:80287-80291)、134(:80293-80297)、113 hardMode(:80299-80310);
//    五节日 Boss DoDeathEvents（NPC.cs:80029-80053）;入侵四连 Main.UpdateInvasion
//    （Main.cs:65305-65326）;DD2 三档 DD2Event.Save（DD2Event.cs:151-157,WF:1369 段）。
//  - 序列化:WorldFile.SaveWorldFlags(:1264-1437) 逐位 bool ↔ 本仓 save.flags Record
//    （JSON 全键往返,SaveFile.ts meta.flags / serialize.ts :565 / 读回 :417）。
//  - 本仓键约定:boss 击败链写 `downed_<vanillaId>`（Game.ts `downed_${vanillaId}`,双子
//    归一 125）;.wld 导入/导出域经 WldParser/WldHeaderFields 双向映射。
//
// 本测试锁四面:
//  ① 本仓存档 JSON round-trip:flags Record 全键等价(写→存→读→位相等);
//  ② 运行时键态 → exportWld → 解析:vid 键唯一表真的位(BoC/小丑/五节日/DD2 旧键/
//     机械任一)导出后 vanilla 位不丢(本次审计补的 getter 并读+运行时双写);
//  ③ 导入域命名键态(旧导入档) → 导出 → 解析:驼峰键仍表真(旧档兼容);
//  ④ 变异证红:翻一位→对应 vanilla 位翻转(判别力自证);
//  ⑤ 消费面:EmoteMenu.emotesBosses 双键并读(vid 键/命名键两态都解锁 54-58/133)。
import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { emotesBosses, type EmoteGateFlags } from '../src/ui/EmoteMenu';
import type { SaveData } from '../src/save/serialize';

/** 本仓 downed 键全集（双键约定并集:vid 键+原版名+入侵/四塔/DD2/运行时态）。 */
const DOWNED_KEYS: Record<string, boolean> = {
  // boss 击败链键 downed_<vanillaId>（Game.ts 通用链;双子归一 125）
  downed_4: true, downedEyeOfCthulhu: true,            // downedBoss1 EoC
  downed_13: true, downed_266: true,                   // downedBoss2 EoW|BoC（单旗双键）
  downed_35: true, downedSkeletron: true,              // downedBoss3 骷髅王
  downed_50: true, downedSlimeKing: true,              // downedSlimeKing
  downed_222: true,                                    // downedQueenBee
  downed_134: true, downed_125: true, downed_127: true, // downedMechBoss1/2/3
  downedMechBossAny: true,
  downed_262: true,                                    // downedPlantBoss
  downed_245: true,                                    // downedGolemBoss
  downed_370: true, downedFishron: true,               // downedFishron
  downed_439: true,                                    // downedAncientCultist
  downed_398: true,                                    // downedMoonlord
  downed_636: true,                                    // downedEmpressOfLight
  downed_657: true,                                    // downedQueenSlime
  downed_668: true,                                    // downedDeerclops
  downed_109: true, downedClown: true,                 // 小丑（checkDead case 109）
  // 入侵四连（Main.cs:65305-65326 命名键直写）
  downedGoblins: true, downedFrost: true, downedPirates: true, downedMartians: true,
  // 五节日 Boss（NPC.cs:80029-80053）——运行时双键（vid+命名）
  downed_327: true, downedHalloweenKing: true,
  downed_325: true, downedHalloweenTree: true,
  downed_344: true, downedChristmasTree: true,
  downed_345: true, downedChristmasIceQueen: true,
  downed_346: true, downedChristmasSantank: true,
  // 四塔（NPC.cs:80137-80156;LunarEvent onTowerKilled 命名键直写）
  downedTowerSolar: true, downedTowerVortex: true, downedTowerNebula: true, downedTowerStardust: true,
  // DD2 三档（DD2Event.cs:151-157;OldOnesArmy WinInvasionInternal 双键）
  downedOldOnesArmyT1: true, downedOldOnesArmyT2: true, downedOldOnesArmyT3: true,
  dd2DownedT1: true, dd2DownedT2: true, dd2DownedT3: true,
  // ★RB28-F2：酒保位与 dd2DownedT1 并存=合法驻留态（脏键态 dd2DownedT1∧!savedBartender
  //  经 loadSaveData 读回即被搬键归正,见 ⑥——全集态必须自洽才可锁 round-trip 全等）
  savedBartender: true,
  // 世界域伴生位（round-trip 面一并锁）
  hardMode: true, shadowOrbSmashed: true,
};

function mkWorldFlags(flags: Record<string, boolean>): { world: World; player: Player } {
  const world = new World(64, 32, 42, 'downed 测试');
  world.flags = { ...world.flags, ...flags };
  const player = new Player(100, 100, new Inventory());
  return { world, player };
}

/** 最小 SaveData 形（wld 导出测试同款,fx11 mkSave 契约）。 */
function mkSave(flags: Record<string, boolean>): SaveData {
  return {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: 'downed 导出世界', seed: 42, width: 60, height: 40,
      spawn: [30, 18], groundLevel: 20, rockLevel: 24,
      created: 1700000000000, playTimeMs: 0,
    },
    clock: { timeOfDay: 0.25, dayCount: 3, moonPhase: 0, bloodMoon: false, eclipse: false },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: '', walls: '', liquid: '', liquidType: '',
    chests: [], flags,
  } as unknown as SaveData;
}

describe('downed ① 本仓存档 round-trip（saveGame→loadSave 全键等价）', () => {
  it('downed 键全集 写→存→读→位相等', () => {
    const { world, player } = mkWorldFlags(DOWNED_KEYS);
    const back = loadSave(saveGame(world, player, 0));
    const got = back.world.flags;
    for (const [k, v] of Object.entries(DOWNED_KEYS)) {
      expect(got[k], `键 ${k} round-trip 后应=${v}`).toBe(v);
    }
  });

  it('未击败（键缺省=false）读回 false——缺位=缺省不炸', () => {
    const { world, player } = mkWorldFlags({});   // 全新世界:一个 boss 都没杀
    const back = loadSave(saveGame(world, player, 0));
    for (const k of Object.keys(DOWNED_KEYS)) {
      expect(back.world.flags[k] ?? false, `键 ${k} 缺省应=false`).toBe(false);
    }
  });

  it('变异证红:写入≠读回必爆红(判别力自证)', () => {
    const { world, player } = mkWorldFlags({ downed_668: true });   // Deerclops
    const json = saveGame(world, player, 0);
    const mutated = JSON.parse(json) as SaveData;
    delete (mutated.flags as Record<string, boolean>).downed_668;
    const back = loadSave(JSON.stringify(mutated));
    // 存档链丢弃 downed_668 的话,下方断言翻红(鹿角怪雨夜 1/4 门 Game.ts 恒关变恒开)
    expect(back.world.flags.downed_668 ?? false).toBe(false);
    expect(back.world.flags.downed_668).toBe(undefined);   // 严格:键确已不在
  });
});

describe('downed ② 运行时键态 → exportWld → 解析（vid 键唯一表真不丢位）', () => {
  it('自建国度全 boss vid 键导出后逐 vanilla 位为真', () => {
    // 形态=运行时写点（不含导入域驼峰键）：BoC 只写 downed_266、小丑只写 downed_109、
    // 五节日只写 vid 键、DD2 只写 downedOldOnesArmyT1、机械任一不含 downedMechBossAny
    const save = mkSave({
      downed_4: true, downed_266: true, downed_35: true, downed_222: true,
      downed_134: true, downed_125: true, downed_127: true,
      downed_262: true, downed_245: true, downed_50: true, downed_370: true,
      downed_439: true, downed_398: true, downed_636: true, downed_657: true, downed_668: true,
      downed_109: true,
      downedGoblins: true, downedFrost: true, downedPirates: true, downedMartians: true,
      downed_327: true, downed_325: true, downed_344: true, downed_345: true, downed_346: true,
      downedTowerSolar: true, downedTowerVortex: true, downedTowerNebula: true, downedTowerStardust: true,
      downedOldOnesArmyT1: true,
      hardMode: true,
    });
    const back = parseWldToSave(exportWld(save));
    const f = back.save.flags;
    // boss 十连 + v118 史王 + v131 三位 + 五节日 + 四塔 + v223/240 三位 + DD2
    expect(f.downed_4).toBe(true);            // downedBoss1
    expect(f.downed_13).toBe(true);           // downedBoss2 ← BoC-only(downed_266) 导出位
    expect(f.downed_266).toBe(true);
    expect(f.downed_35).toBe(true);           // downedBoss3
    expect(f.downed_222).toBe(true);          // downedQueenBee
    expect(f.downed_134).toBe(true);          // downedMechBoss1
    expect(f.downed_125).toBe(true);          // downedMechBoss2
    expect(f.downed_127).toBe(true);          // downedMechBoss3
    expect(f.downedMechBossAny).toBe(true);   // ← 由 vid 键派生(曾漏=导出恒 false)
    expect(f.downed_262).toBe(true);          // downedPlantBoss
    expect(f.downed_245).toBe(true);          // downedGolemBoss
    expect(f.downed_50).toBe(true);           // downedSlimeKing(v118)
    expect(f.downed_370).toBe(true);          // downedFishron
    expect(f.downed_439).toBe(true);          // downedAncientCultist(v131)
    expect(f.downed_398).toBe(true);          // downedMoonlord(v131)
    expect(f.downed_636).toBe(true);          // downedEmpressOfLight(v223)
    expect(f.downed_657).toBe(true);          // downedQueenSlime(v223)
    expect(f.downed_668).toBe(true);          // downedDeerclops(v240)
    expect(f.downed_109).toBe(true);          // downedClown ← vid 键派生(曾漏)
    expect(f.downedGoblins).toBe(true);
    expect(f.downedFrost).toBe(true);
    expect(f.downedPirates).toBe(true);
    expect(f.downedMartians).toBe(true);
    expect(f.downed_327).toBe(true);          // 南瓜王 ← vid 键派生(曾漏)
    expect(f.downed_325).toBe(true);          // 哀木
    expect(f.downed_344).toBe(true);          // 常绿尖叫树
    expect(f.downed_345).toBe(true);          // 冰雪女王
    expect(f.downed_346).toBe(true);          // 圣诞坦克
    expect(f.downedTowerSolar).toBe(true);
    expect(f.downedTowerVortex).toBe(true);
    expect(f.downedTowerNebula).toBe(true);
    expect(f.downedTowerStardust).toBe(true);
    expect(f.dd2DownedT1).toBe(true);         // DD2 T1 ← downedOldOnesArmyT1 派生(曾漏)
    expect(f.hardMode).toBe(true);
  });

  it('变异证红:导出 getter 丢键→vanilla 位翻红(判别力自证)', () => {
    // 若 downedBoss2 getter 退回单读 downed_13(审计前形态),BoC-only 位导出即 false
    const save = mkSave({ downed_266: true });
    const back = parseWldToSave(exportWld(save));
    expect(back.save.flags.downed_13).toBe(true);
  });
});

describe('downed ③ 导入域命名键态(旧导入档) → 导出 → 解析(旧档兼容)', () => {
  it('★RB28-F1 三 getter 补并读:仅命名键/别名键 → 导出位真+现行键对照不变', () => {
    // downedBoss1:仅命名键 downedEyeOfCthulhu(审计前导入形态)→ 位真;对照 vid 键不回归
    const eocNamed = parseWldToSave(exportWld(mkSave({ downedEyeOfCthulhu: true })));
    expect(eocNamed.save.flags.downed_4).toBe(true);
    expect(eocNamed.save.flags.downedEyeOfCthulhu).toBe(true);
    expect(parseWldToSave(exportWld(mkSave({ downed_4: true }))).save.flags.downed_4).toBe(true);
    // downedBoss3:仅命名键 downedSkeletron;对照 vid 键不回归
    const skelNamed = parseWldToSave(exportWld(mkSave({ downedSkeletron: true })));
    expect(skelNamed.save.flags.downed_35).toBe(true);
    expect(parseWldToSave(exportWld(mkSave({ downed_35: true }))).save.flags.downed_35).toBe(true);
    // downedMechBoss2:仅别名键 downed_126（双子 Spazmatism;击败链归一写 125,旧档可携 126）
    const twins126 = parseWldToSave(exportWld(mkSave({ downed_126: true })));
    expect(twins126.save.flags.downed_125).toBe(true);
    expect(parseWldToSave(exportWld(mkSave({ downed_125: true }))).save.flags.downed_125).toBe(true);
  });

  it('驼峰键(审计前导入形态)仍逐位表真', () => {
    const save = mkSave({
      downedHalloweenKing: true, downedChristmasIceQueen: true, downedChristmasSantank: true,
      downedClown: true, dd2DownedT1: true, dd2DownedT2: true, dd2DownedT3: true,
      downedFishron: true, downedMechBossAny: true,
    });
    const back = parseWldToSave(exportWld(save));
    const f = back.save.flags;
    expect(f.downed_327).toBe(true);
    expect(f.downed_345).toBe(true);
    expect(f.downed_346).toBe(true);
    expect(f.downed_109).toBe(true);
    expect(f.dd2DownedT1).toBe(true);
    expect(f.dd2DownedT2).toBe(true);
    expect(f.dd2DownedT3).toBe(true);
    expect(f.downed_370).toBe(true);
    expect(f.downedMechBossAny).toBe(true);
  });
});

describe('downed ⑤ 消费面（表情解锁门双键并读）', () => {
  it('vid 键态与命名键态都解锁 54-58 与 DD2 133', () => {
    const vidOnly: EmoteGateFlags = {
      downed_325: true, downed_327: true, downed_344: true, downed_345: true,
      downed_346: true, downedOldOnesArmyT1: true,
    };
    const namedOnly: EmoteGateFlags = {
      downedHalloweenTree: true, downedHalloweenKing: true, downedChristmasTree: true,
      downedChristmasIceQueen: true, downedChristmasSantank: true, dd2DownedT1: true,
    };
    for (const [label, f] of [['vid 键', vidOnly], ['命名键(旧导入档)', namedOnly]] as const) {
      const got = emotesBosses(f);
      for (const id of [54, 55, 56, 57, 58, 133]) {
        expect(got, `${label}: 表情 ${id} 应解锁`).toContain(id);
      }
    }
  });

  it('未击败不解锁(门仍有判别力)', () => {
    expect(emotesBosses({})).not.toContain(54);
    expect(emotesBosses({})).not.toContain(133);
  });
});

describe('downed ⑥ RB28-F2 旧导入档 dd2DownedT1 脏键一次性归正(loadSaveData 读回侧)', () => {
  it('脏键态(dd2DownedT1=true ∧ savedBartender 缺失)→ 搬键 savedBartender=true+脏键删除', () => {
    // 债锚 WldParser.ts:501-505:2026-09-06 前解析器把流第 1 位(savedBartender)
    // 标成 dd2DownedT1——脏键承载的是酒保位,搬键后酒保入住链/表情解锁面归正
    const { world, player } = mkWorldFlags({ dd2DownedT1: true });
    const back = loadSave(saveGame(world, player, 0));
    expect(back.world.flags.savedBartender).toBe(true);
    expect(back.world.flags['dd2DownedT1']).toBe(undefined);   // 严格:键确已不在
  });

  it('新写档键序不动:双键并存/纯 savedBartender 态原样往返(不误伤真 DD2 T1 位)', () => {
    const coherent = mkWorldFlags({ dd2DownedT1: true, savedBartender: true, dd2DownedT2: true });
    const backA = loadSave(saveGame(coherent.world, coherent.player, 0));
    expect(backA.world.flags['dd2DownedT1']).toBe(true);
    expect(backA.world.flags.savedBartender).toBe(true);
    expect(backA.world.flags['dd2DownedT2']).toBe(true);
    const clean = mkWorldFlags({ savedBartender: true });
    const backB = loadSave(saveGame(clean.world, clean.player, 0));
    expect(backB.world.flags.savedBartender).toBe(true);
    expect(backB.world.flags['dd2DownedT1']).toBe(undefined);
  });
});

describe('downed ⑦ BJ214 双子键一次性归正(loadSaveData 读回侧:旧档 downed_126-only)', () => {
  it('旧档脏态(downed_126=true ∧ downed_125 缺)→ 补写 downed_125(mechAll 复活)', () => {
    // 债锚 Game.ts twinsPart(3da58b52,2026-08-14):此前击败记账按后死之眼裸写
    // vanillaId——125 先死+126 收尾的旧档只有 downed_126 → 三王全灭门(世花球茎
    // 238/mechAll)永假且双眼已死不可再触发。原版 NPC.cs:80223-80229 双 case 同写
    // downedMechBoss2 单旗 → downed_126∧!downed_125 为不可能态,读档即补 125。
    const { world, player } = mkWorldFlags({ hardMode: true, downed_134: true, downed_126: true, downed_127: true });
    const back = loadSave(saveGame(world, player, 0));
    expect(back.world.flags['downed_125'], 'mechAll 门键复活').toBe(true);
    expect(back.world.flags['downed_126'], '126 键保留(mechAny/导出 OR 口径)').toBe(true);
    expect(back.world.flags.hardMode).toBe(true);
  });

  it('新写档键序不动:downed_125 已真(现行击败链形态)不派生 126;全无键不误触发', () => {
    const modern = mkWorldFlags({ downed_134: true, downed_125: true, downed_127: true, hardMode: true });
    const backA = loadSave(saveGame(modern.world, modern.player, 0));
    expect(backA.world.flags['downed_125']).toBe(true);
    expect(backA.world.flags['downed_126'], '125 真时无 126 派生').toBe(undefined);
    const fresh = mkWorldFlags({});
    const backB = loadSave(saveGame(fresh.world, fresh.player, 0));
    expect(backB.world.flags['downed_125'] ?? false).toBe(false);
    expect(backB.world.flags['downed_126'] ?? false).toBe(false);
  });
});

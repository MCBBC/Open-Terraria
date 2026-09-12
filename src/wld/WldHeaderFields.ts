// .wld header 字段台账(2026-09-06,原版互通 P0 产出)。
// 唯一真值源:Terarria1457/Terraria.IO/WorldFile.cs SaveWorldFlags(:1264-1437)+
// SaveWorldHeader(:1230-1240)+LoadHeader(:1959)/LoadWorldFlags(:1988-2518) 读侧对称核验。
// 每项:[原版字段名, 写类型, 版本门(0=无门), 取值函数(SaveData→字节值)]。
// 类型集:i32/f64/bool/u8/i16/str/i64/u32(对应 BinaryWriterLE 同名方法)。
// ★快照优先:save.wldSnap?[原版字段名] 存在时用快照值(原版导入档零漂移),
//   否则用映射函数(自建世界建模值/缺省)。快照键=本表 name。
import type { SaveData } from '../save/serialize';

export type WldVal = number | boolean | string | bigint;
export interface WldField {
  name: string;                    // 原版字段名(=wldSnap 快照键)
  type: 'i32' | 'f64' | 'f32' | 'bool' | 'u8' | 'i16' | 'str' | 'i64' | 'u32' | 'bytes16';
  ver: number;                     // 版本门(写侧恒 325,记录原版引入版本供读侧对照)
  get: (save: SaveData) => WldVal; // 无快照时的取值(建模映射/缺省)
}

/** ★SW-RB14c：.NET DateTime 纪元偏移（0001-01-01→1970-01-01 = 621355968000000000
 *  ticks，100ns/tick）+ Kind 位（DateTime.cs KindUtc=0x4000000000000000/KindLocal=
 *  0x8000000000000000；ToBinary/FromBinary WF:1261/:2020） */
const NET_TICKS_EPOCH = 621355968000000000n;

/** flags/短键取值帮手 */
const F = (save: SaveData): Record<string, boolean> => save.flags ?? {};
const B = (fl: Record<string, boolean>, k: string) => !!fl[k];
const SF = (save: SaveData): Record<string, boolean> => save.header.seedFlags ?? {};
const BG = (save: SaveData): NonNullable<SaveData['header']['bgStyles']> => save.header.bgStyles ?? ({} as never);
const WT = (save: SaveData): NonNullable<SaveData['weather']> => save.weather ?? ({} as never);
const EV = (save: SaveData): NonNullable<SaveData['events']> => save.events ?? ({} as never);
const CK = (save: SaveData): NonNullable<SaveData['clock']> => save.clock ?? ({} as never);
const IV = (save: SaveData): NonNullable<SaveData['invasion']> => save.invasion ?? ({ type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 } as never);
const H = (save: SaveData): SaveData['header'] => save.header;

/** SaveWorldHeader 非 flags 前缀(title..maxTilesX,WF:1230-1240) */
export const HEADER_PRE: WldField[] = [
  { name: 'title', type: 'str', ver: 0, get: (s) => H(s).name || 'World' },
  { name: 'seedText', type: 'str', ver: 179, get: (s) => String(H(s).seed ?? '') },
  // ★SW-FX33:原版建世界恒写 Main.WorldGeneratorVersion 常量(WorldFile.cs:606;
  //  Main.cs:228 = 1395864371201)。写 0 会使原版 WorldFileData.HasValidSeed=false
  //  (WorldFileData.cs:104,唯一消费=服务器控制台 seed 命令 Main.cs:6233 显示
  //  "NoValidSeed")——曾写 0n
  { name: 'worldGenVersion', type: 'i64', ver: 179, get: () => 1395864371201n },
  { name: 'guid', type: 'bytes16', ver: 181, get: () => 0 } as unknown as WldField,
  // ★SW-FX43（2026-09-12）：worldId 真值链——header.worldId（自建=WorldGen.cs:11364
  //  genRand.Next(int.MaxValue) 掷值/导入=wld 原值）优先;旧档缺省回退 created-XOR
  //  派生（既有近似）。footer 必须同值（LoadFooter :3003-3015,BadFooter=整档拒载）
  { name: 'worldId', type: 'i32', ver: 0, get: (s) => H(s).worldId ?? (((H(s).created ?? 0) ^ 0x55555555) & 0x7fffffff) },
  { name: 'leftWorld', type: 'i32', ver: 0, get: () => 0 },
  { name: 'rightWorld', type: 'i32', ver: 0, get: (s) => H(s).width * 16 },
  { name: 'topWorld', type: 'i32', ver: 0, get: () => 0 },
  { name: 'bottomWorld', type: 'i32', ver: 0, get: (s) => H(s).height * 16 },
  { name: 'maxTilesY', type: 'i32', ver: 0, get: (s) => H(s).height },
  { name: 'maxTilesX', type: 'i32', ver: 0, get: (s) => H(s).width },
];

/** SaveWorldFlags 全字段(WF:1264-1437 逐行;顺序即流序,禁重排) */
export const HEADER_FLAGS: WldField[] = [
  { name: 'GameMode', type: 'i32', ver: 209, get: (s) => H(s).difficulty ?? 0 },
  { name: 'drunkWorld', type: 'bool', ver: 222, get: (s) => B(SF(s), 'drunkWorld') },
  { name: 'getGoodWorld', type: 'bool', ver: 227, get: (s) => B(SF(s), 'getGoodWorld') },
  { name: 'tenthAnniversaryWorld', type: 'bool', ver: 238, get: (s) => B(SF(s), 'tenthAnniversary') },
  { name: 'dontStarveWorld', type: 'bool', ver: 239, get: (s) => B(SF(s), 'theConstant') },
  { name: 'notTheBeesWorld', type: 'bool', ver: 241, get: (s) => B(SF(s), 'notTheBees') },
  { name: 'remixWorld', type: 'bool', ver: 249, get: (s) => B(SF(s), 'remix') },
  { name: 'noTrapsWorld', type: 'bool', ver: 266, get: (s) => B(SF(s), 'noTraps') },
  { name: 'zenithWorld', type: 'bool', ver: 267, get: (s) => B(SF(s), 'everything') },
  { name: 'skyblockWorld', type: 'bool', ver: 302, get: (s) => B(SF(s), 'skyblock') },
  // ★SW-RB14c 纪元勘误:.NET DateTime ticks 纪元=0001-01-01（非 Unix 1970），且
  //  ToBinary() 顶 2 位编 Kind（0x4000..=Utc）——WF:601 `CreationTime=DateTime.Now`
  //  /WF:1261 `DateTime.UtcNow.ToBinary()`。曾直写 Unix-ms×1e4（≈1.79e16）→ 原版
  //  FromBinary 解出公元 57 年（世界列表创建日期/Age 全错）。快照域(导入档)不受
  //  此影响（原值回写）；本行只服务自建世界回退。
  { name: 'CreationTime', type: 'i64', ver: 141, get: (s) => NET_TICKS_EPOCH + BigInt(Math.floor(H(s).created ?? 0)) * 10000n + 0x4000000000000000n },
  { name: 'lastSavedTime(utc)', type: 'i64', ver: 284, get: () => NET_TICKS_EPOCH + BigInt(Date.now()) * 10000n + 0x4000000000000000n },
  { name: 'moonType', type: 'u8', ver: 0, get: (s) => H(s).moonType ?? 0 },
  { name: 'treeX[0]', type: 'i32', ver: 0, get: (s) => treeX(s)[0] },
  { name: 'treeX[1]', type: 'i32', ver: 0, get: (s) => treeX(s)[1] },
  { name: 'treeX[2]', type: 'i32', ver: 0, get: (s) => treeX(s)[2] },
  { name: 'treeStyle[0]', type: 'i32', ver: 0, get: (s) => treeStyle(s)[0] },
  { name: 'treeStyle[1]', type: 'i32', ver: 0, get: (s) => treeStyle(s)[1] },
  { name: 'treeStyle[2]', type: 'i32', ver: 0, get: (s) => treeStyle(s)[2] },
  { name: 'treeStyle[3]', type: 'i32', ver: 0, get: (s) => treeStyle(s)[3] },
  // ★SW-FX43（2026-09-12）：caveBackX 真值链——header.caveBackX（导入捕获/自建
  //  worldgen 掷值 RandomizeCaveBackgrounds）优先;旧档缺省回退 treeX 派生（既有
  //  近似——原版两者无派生关系,WorldGen.cs:8141-8210 独立掷,FX33 登记债清偿）
  { name: 'caveBackX[0]', type: 'i32', ver: 0, get: (s) => H(s).caveBackX?.[0] ?? treeX(s)[0] },
  { name: 'caveBackX[1]', type: 'i32', ver: 0, get: (s) => H(s).caveBackX?.[1] ?? treeX(s)[1] },
  { name: 'caveBackX[2]', type: 'i32', ver: 0, get: (s) => H(s).caveBackX?.[2] ?? treeX(s)[2] },
  { name: 'caveBackStyle[0]', type: 'i32', ver: 0, get: (s) => BG(s).cave?.[0] ?? 0 },
  { name: 'caveBackStyle[1]', type: 'i32', ver: 0, get: (s) => BG(s).cave?.[1] ?? 0 },
  { name: 'caveBackStyle[2]', type: 'i32', ver: 0, get: (s) => BG(s).cave?.[2] ?? 0 },
  { name: 'caveBackStyle[3]', type: 'i32', ver: 0, get: (s) => BG(s).cave?.[3] ?? 0 },
  { name: 'iceBackStyle', type: 'i32', ver: 0, get: (s) => BG(s).ice ?? 0 },
  { name: 'jungleBackStyle', type: 'i32', ver: 0, get: (s) => BG(s).jungle ?? 0 },
  { name: 'hellBackStyle', type: 'i32', ver: 0, get: (s) => BG(s).hell ?? 0 },
  { name: 'spawnTileX', type: 'i32', ver: 0, get: (s) => H(s).spawn?.[0] ?? (H(s).width >> 1) },
  { name: 'spawnTileY', type: 'i32', ver: 0, get: (s) => H(s).spawn?.[1] ?? 0 },
  { name: 'worldSurface', type: 'f64', ver: 0, get: (s) => H(s).groundLevel ?? 0.3 * H(s).height },
  { name: 'rockLayer', type: 'f64', ver: 0, get: (s) => H(s).rockLevel ?? 0.6 * H(s).height },
  { name: '_tempTime', type: 'f64', ver: 0, get: (s) => timeOf(s).time },
  { name: '_tempDayTime', type: 'bool', ver: 0, get: (s) => timeOf(s).dayTime },
  { name: '_tempMoonPhase', type: 'i32', ver: 0, get: (s) => CK(s).moonPhase ?? 0 },
  { name: '_tempBloodMoon', type: 'bool', ver: 0, get: (s) => !!CK(s).bloodMoon },
  { name: '_tempEclipse', type: 'bool', ver: 0, get: (s) => !!CK(s).eclipse },
  { name: 'dungeonX', type: 'i32', ver: 0, get: (s) => H(s).dungeonX ?? 0 },
  { name: 'dungeonY', type: 'i32', ver: 0, get: (s) => H(s).dungeonY ?? 0 },
  { name: 'crimson', type: 'bool', ver: 0, get: (s) => !!H(s).crimson },
  { name: 'downedBoss1', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_4') },
  { name: 'downedBoss2', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_13') },
  { name: 'downedBoss3', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_35') },
  { name: 'downedQueenBee', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_222') },
  { name: 'downedMechBoss1', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_134') },
  { name: 'downedMechBoss2', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_125') },
  { name: 'downedMechBoss3', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_127') },
  { name: 'downedMechBossAny', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedMechBossAny') },
  { name: 'downedPlantBoss', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_262') },
  { name: 'downedGolemBoss', type: 'bool', ver: 0, get: (s) => B(F(s), 'downed_245') },
  { name: 'downedSlimeKing', type: 'bool', ver: 118, get: (s) => B(F(s), 'downed_50') },
  { name: 'savedGoblin', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedGoblin') },
  { name: 'savedWizard', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedWizard') },
  { name: 'savedMech', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedMech') },
  { name: 'downedGoblins', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedGoblins') },
  { name: 'downedClown', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedClown') },
  { name: 'downedFrost', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedFrost') },
  { name: 'downedPirates', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedPirates') },
  { name: 'shadowOrbSmashed', type: 'bool', ver: 0, get: (s) => B(F(s), 'shadowOrbSmashed') },
  { name: 'spawnMeteor', type: 'bool', ver: 0, get: (s) => B(F(s), 'spawnMeteor') },
  { name: 'shadowOrbCount', type: 'u8', ver: 0, get: (s) => (s as { shadowOrbCount?: number }).shadowOrbCount ?? 0 },   // ★P2-9:数据在顶层(serialize.ts :123),曾读 H(s)(header 无此键)恒 0
  { name: 'altarCount', type: 'i32', ver: 0, get: (s) => (s as { altarCount?: number }).altarCount ?? 0 },
  { name: 'hardMode', type: 'bool', ver: 0, get: (s) => B(F(s), 'hardMode') },
  { name: 'afterPartyOfDoom', type: 'bool', ver: 257, get: (s) => B(F(s), 'afterPartyOfDoom') },
  { name: 'invasionDelay', type: 'i32', ver: 0, get: (s) => IV(s).delay },
  { name: 'invasionSize', type: 'i32', ver: 0, get: (s) => IV(s).size },
  { name: 'invasionType', type: 'i32', ver: 0, get: (s) => IV(s).type },
  { name: 'invasionX', type: 'f64', ver: 0, get: (s) => IV(s).x },   // Main.invasionX=double(Main.cs:1993)
  { name: 'slimeRainTime', type: 'f64', ver: 118, get: (s) => WT(s).slimeRainTime ?? 0 },
  { name: 'sundialCooldown', type: 'u8', ver: 113, get: (s) => H(s).sundialCooldown ?? 0 },
  { name: '_tempRaining', type: 'bool', ver: 0, get: (s) => !!WT(s).raining },
  { name: '_tempRainTime', type: 'i32', ver: 0, get: (s) => WT(s).rainTime ?? 0 },
  { name: '_tempMaxRain', type: 'f32', ver: 0, get: (s) => WT(s).maxRaining ?? 0 },
  // ★SW-FX11（2026-09-10）：曾恒 -1（=未砸过祭坛）→ 自建世界砸祭坛掷定的困难矿
  //  档位导出即丢（SaveData.savedOreTiers 既有,serialize.ts :120/:449）。缺省 -1
  //  保留（旧档缺省语义）
  { name: 'SavedOreTiers.Cobalt', type: 'i32', ver: 0, get: (s) => s.savedOreTiers?.cobalt ?? -1 },
  { name: 'SavedOreTiers.Mythril', type: 'i32', ver: 0, get: (s) => s.savedOreTiers?.mythril ?? -1 },
  { name: 'SavedOreTiers.Adamantite', type: 'i32', ver: 0, get: (s) => s.savedOreTiers?.adamantite ?? -1 },
  { name: 'treeBG1', type: 'u8', ver: 0, get: (s) => BG(s).forest?.[0] ?? 0 },
  { name: 'corruptBG', type: 'u8', ver: 0, get: (s) => BG(s).corrupt ?? 0 },
  // ★SW-FX43（2026-09-12）：BgStylesSave.jungleBG 键补齐（WF:1327 setBG(2) 地表丛林
  //  0-6;与 BG.jungle=WF:1274 jungleBackStyle 地下域不同族）——原「无键写 0」登记
  //  偏差清偿;自建世界缺省仍落 0（同 corrupt/snow 等自建缺省语义）
  { name: 'jungleBG', type: 'u8', ver: 0, get: (s) => BG(s).jungleBG ?? 0 },
  { name: 'snowBG', type: 'u8', ver: 0, get: (s) => BG(s).snow ?? 0 },
  { name: 'hallowsBG', type: 'u8', ver: 0, get: (s) => BG(s).hallow ?? 0 },
  { name: 'crimsonBG', type: 'u8', ver: 0, get: (s) => BG(s).crimson ?? 0 },
  { name: 'desertBG', type: 'u8', ver: 0, get: (s) => BG(s).desert ?? 0 },
  { name: 'oceanBG', type: 'u8', ver: 0, get: (s) => BG(s).ocean ?? 0 },
  { name: 'cloudBGActive', type: 'i32', ver: 0, get: (s) => WT(s).cloudBGActive ?? 0 },
  { name: 'numClouds', type: 'i16', ver: 0, get: (s) => WT(s).numClouds ?? 0 },
  { name: 'windSpeedTarget', type: 'f32', ver: 0, get: (s) => WT(s).windSpeedTarget ?? 0 },
  // anglerWhoFinishedToday list(动态,n 由 list 闭合,不进表——writeHeader 特例)
  { name: 'savedAngler', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedAngler') },
  { name: 'anglerQuest', type: 'i32', ver: 0, get: (s) => (s as { angler?: { quest?: number } }).angler?.quest ?? 0 },   // ★P2-10:曾恒 0
  { name: 'savedStylist', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedStylist') },
  { name: 'savedTaxCollector', type: 'bool', ver: 129, get: (s) => B(F(s), 'savedTaxCollector') },
  { name: 'savedGolfer', type: 'bool', ver: 201, get: (s) => B(F(s), 'savedGolfer') },
  { name: 'invasionSizeStart', type: 'i32', ver: 107, get: (s) => IV(s).sizeStart },
  { name: '_tempCultistDelay', type: 'i32', ver: 108, get: (s) => (s as { cultistDelay?: number }).cultistDelay ?? 86400 },   // ★P2-10:曾恒 86400(石巨人后拜月教倒计时清零;数据在顶层 serialize.ts :113)
  // banners list(动态,writeHeader 特例;键=下标 1..292)
  { name: 'fastForwardTimeToDawn', type: 'bool', ver: 128, get: (s) => !!H(s).fastForwardTimeToDawn },
  { name: 'downedFishron', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedFishron') || B(F(s), 'downed_370') },
  { name: 'downedMartians', type: 'bool', ver: 131, get: (s) => B(F(s), 'downedMartians') },
  { name: 'downedAncientCultist', type: 'bool', ver: 131, get: (s) => B(F(s), 'downed_439') },
  { name: 'downedMoonlord', type: 'bool', ver: 131, get: (s) => B(F(s), 'downed_398') },
  { name: 'downedHalloweenKing', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedHalloweenKing') },
  { name: 'downedHalloweenTree', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedHalloweenTree') },
  { name: 'downedChristmasIceQueen', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedChristmasIceQueen') },
  { name: 'downedChristmasSantank', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedChristmasSantank') },
  { name: 'downedChristmasTree', type: 'bool', ver: 0, get: (s) => B(F(s), 'downedChristmasTree') },
  { name: 'downedTowerSolar', type: 'bool', ver: 140, get: (s) => B(F(s), 'downedTowerSolar') },
  { name: 'downedTowerVortex', type: 'bool', ver: 140, get: (s) => B(F(s), 'downedTowerVortex') },
  { name: 'downedTowerNebula', type: 'bool', ver: 140, get: (s) => B(F(s), 'downedTowerNebula') },
  { name: 'downedTowerStardust', type: 'bool', ver: 140, get: (s) => B(F(s), 'downedTowerStardust') },
  { name: 'TowerActiveSolar', type: 'bool', ver: 140, get: (s) => B(F(s), 'towerActiveSolar') },
  { name: 'TowerActiveVortex', type: 'bool', ver: 140, get: (s) => B(F(s), 'towerActiveVortex') },
  { name: 'TowerActiveNebula', type: 'bool', ver: 140, get: (s) => B(F(s), 'towerActiveNebula') },
  { name: 'TowerActiveStardust', type: 'bool', ver: 140, get: (s) => B(F(s), 'towerActiveStardust') },
  { name: 'LunarApocalypseIsUp', type: 'bool', ver: 0, get: (s) => B(F(s), 'lunarApocalypseUp') },
  { name: '_tempPartyManual', type: 'bool', ver: 170, get: (s) => !!EV(s).partyManual },
  { name: '_tempPartyGenuine', type: 'bool', ver: 170, get: (s) => !!EV(s).partyGenuine },
  { name: '_tempPartyCooldown', type: 'i32', ver: 170, get: (s) => EV(s).partyCooldown ?? 0 },
  // TempPartyCelebratingNPCs list(动态,writeHeader 特例)
  { name: '_tempSandstormHappening', type: 'bool', ver: 174, get: (s) => !!(WT(s) as { sand?: { happening?: boolean } }).sand?.happening },   // ★P2-10:WeatherSave 键=sand.*
  { name: '_tempSandstormTimeLeft', type: 'i32', ver: 174, get: (s) => (WT(s) as { sand?: { timeLeft?: number } }).sand?.timeLeft ?? 0 },
    { name: '_tempSandstormSeverity', type: 'f32', ver: 174, get: (s) => (WT(s) as { sand?: { severity?: number } }).sand?.severity ?? 0 },   // ★红队复核补:曾恒 0
  { name: '_tempSandstormIntendedSeverity', type: 'f32', ver: 174, get: (s) => (WT(s) as { sand?: { intendedSeverity?: number } }).sand?.intendedSeverity ?? 0 },
  { name: 'savedBartender', type: 'bool', ver: 0, get: (s) => B(F(s), 'savedBartender') },
  // DD2Event.Save:3 bool(T1/T2/T3)——**无第 4 个**(DD2Event.cs:151-157;曾误写 Any=多 1B)
  { name: 'DD2_DownedInvasionT1', type: 'bool', ver: 178, get: (s) => B(F(s), 'dd2DownedT1') },
  { name: 'DD2_DownedInvasionT2', type: 'bool', ver: 178, get: (s) => B(F(s), 'dd2DownedT2') },
  { name: 'DD2_DownedInvasionT3', type: 'bool', ver: 178, get: (s) => B(F(s), 'dd2DownedT3') },
  { name: 'mushroomBG', type: 'u8', ver: 195, get: (s) => BG(s).mushroom ?? 0 },
  { name: 'underworldBG', type: 'u8', ver: 215, get: (s) => BG(s).underworld ?? 0 },
  { name: 'treeBG2', type: 'u8', ver: 204, get: (s) => BG(s).forest?.[1] ?? 0 },
  { name: 'treeBG3', type: 'u8', ver: 204, get: (s) => BG(s).forest?.[2] ?? 0 },
  { name: 'treeBG4', type: 'u8', ver: 204, get: (s) => BG(s).forest?.[3] ?? 0 },
  { name: 'combatBookWasUsed', type: 'bool', ver: 204, get: (s) => B(F(s), 'combatBookWasUsed') },   // ★SW-FX11 键域归一(曾读 'combatBook' 短键=断链)
  { name: '_tempLanternNightCooldown', type: 'i32', ver: 207, get: (s) => EV(s).lanternCooldown ?? 0 },
  { name: '_tempLanternNightGenuine', type: 'bool', ver: 207, get: (s) => !!EV(s).lanternGenuine },
  { name: '_tempLanternNightManual', type: 'bool', ver: 207, get: (s) => !!EV(s).lanternManual },
  { name: '_tempLanternNightNextNightIsGenuine', type: 'bool', ver: 207, get: (s) => !!EV(s).lanternNext },
  { name: 'forceHalloweenForToday', type: 'bool', ver: 212, get: (s) => B(F(s), 'forceHalloweenForToday') },
  { name: 'forceXMasForToday', type: 'bool', ver: 212, get: (s) => B(F(s), 'forceXMasForToday') },
  // ★SW-FX11（2026-09-10）：曾恒 7/6/9/8 标准矿 → 醉酒世界替代矿 166/167/168/169
  //  导出即丢（SaveData.oreTiersPH 既有,serialize.ts :121/:450;军火商银弹/钨弹分支
  //  Game.ts:34531 消费）。缺省 7/6/9/8=原版标准档
  { name: 'SavedOreTiers.Copper', type: 'i32', ver: 216, get: (s) => s.oreTiersPH?.copper ?? 7 },
  { name: 'SavedOreTiers.Iron', type: 'i32', ver: 216, get: (s) => s.oreTiersPH?.iron ?? 6 },
  { name: 'SavedOreTiers.Silver', type: 'i32', ver: 216, get: (s) => s.oreTiersPH?.silver ?? 9 },
  { name: 'SavedOreTiers.Gold', type: 'i32', ver: 216, get: (s) => s.oreTiersPH?.gold ?? 8 },
  { name: 'boughtCat', type: 'bool', ver: 217, get: (s) => B(F(s), 'boughtCat') },
  { name: 'boughtDog', type: 'bool', ver: 217, get: (s) => B(F(s), 'boughtDog') },
  { name: 'boughtBunny', type: 'bool', ver: 217, get: (s) => B(F(s), 'boughtBunny') },
  { name: 'downedEmpressOfLight', type: 'bool', ver: 223, get: (s) => B(F(s), 'downed_636') },
  { name: 'downedQueenSlime', type: 'bool', ver: 223, get: (s) => B(F(s), 'downed_657') },
  { name: 'downedDeerclops', type: 'bool', ver: 240, get: (s) => B(F(s), 'downed_668') },
  { name: 'unlockedSlimeBlueSpawn', type: 'bool', ver: 250, get: (s) => B(F(s), 'unlockedSlimeBlueSpawn') },
  { name: 'unlockedMerchantSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedMerchantSpawn') },
  { name: 'unlockedDemolitionistSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedDemolitionistSpawn') },
  { name: 'unlockedPartyGirlSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedPartyGirlSpawn') },
  { name: 'unlockedDyeTraderSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedDyeTraderSpawn') },
  { name: 'unlockedTruffleSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedTruffleSpawn') },
  { name: 'unlockedArmsDealerSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedArmsDealerSpawn') },
  { name: 'unlockedNurseSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedNurseSpawn') },
  { name: 'unlockedPrincessSpawn', type: 'bool', ver: 251, get: (s) => B(F(s), 'unlockedPrincessSpawn') },
  { name: 'combatBookVolumeTwoWasUsed', type: 'bool', ver: 259, get: (s) => B(F(s), 'combatBookVolumeTwoWasUsed') },   // ★SW-FX11 键域归一(曾读 'combatBook2')
  { name: 'peddlersSatchelWasUsed', type: 'bool', ver: 260, get: (s) => B(F(s), 'peddlersSatchelUsed') },   // ★SW-FX11 键域归一(曾读 'peddler';运行时键见 Game.ts:13674/:35811)
  { name: 'unlockedSlimeGreenSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeGreenSpawn') },
  { name: 'unlockedSlimeOldSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeOldSpawn') },
  { name: 'unlockedSlimePurpleSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimePurpleSpawn') },
  { name: 'unlockedSlimeRainbowSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeRainbowSpawn') },
  { name: 'unlockedSlimeRedSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeRedSpawn') },
  { name: 'unlockedSlimeYellowSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeYellowSpawn') },
  { name: 'unlockedSlimeCopperSpawn', type: 'bool', ver: 261, get: (s) => B(F(s), 'unlockedSlimeCopperSpawn') },
  { name: 'fastForwardTimeToDusk', type: 'bool', ver: 264, get: (s) => !!H(s).fastForwardTimeToDusk },
  { name: 'moondialCooldown', type: 'u8', ver: 264, get: (s) => H(s).moondialCooldown ?? 0 },
  { name: 'forceHalloweenForever', type: 'bool', ver: 287, get: (s) => B(F(s), 'forceHalloweenForever') },
  { name: 'forceXMasForever', type: 'bool', ver: 287, get: (s) => B(F(s), 'forceXMasForever') },
  { name: 'vampireSeed', type: 'bool', ver: 288, get: (s) => B(SF(s), 'vampireSeed') },   // ★SW-FX11 域归一(曾读 flags.'vampire';种子旗真域=seedFlags,消费面 Player.ts:8384 等)
  { name: 'infectedSeed', type: 'bool', ver: 296, get: (s) => B(SF(s), 'infectedSeed') },   // ★SW-FX11 域归一(曾读 flags.'infected')
  { name: '_tempMeteorShowerCount', type: 'i32', ver: 291, get: (s) => (s as { meteorShowerCount?: number }).meteorShowerCount ?? 0 },   // ★P2-10:曾恒 0(serialize.ts :104)
  { name: '_tempCoinRain', type: 'i32', ver: 291, get: () => 0 },
  { name: 'teamBasedSpawnsSeed', type: 'bool', ver: 297, get: (s) => B(F(s), 'teamBasedSpawnsSeed') },
  // ExtraSpawnPointManager.Write(动态:u8 n+n×(i16,i16),writeHeader 特例)
  { name: 'dualDungeonsSeed', type: 'bool', ver: 304, get: (s) => B(SF(s), 'dualDungeons') },
  { name: 'moreLightningSeed', type: 'bool', ver: 323, get: (s) => B(SF(s), 'moreLightning') },
  { name: 'noLightningSeed', type: 'bool', ver: 323, get: (s) => B(SF(s), 'noLightning') },
  // WorldGen.Manifest.Serialize()(动态:varint 长度+UTF8 JSON;写 "" 合法——
  //   原版 version<299 即传 "" 给 Deserialize(WorldFile.cs:2523),容错已证)
  { name: 'manifest', type: 'str', ver: 299, get: () => '' },
];

/** 快照取值:save.wldSnap?[name] 存在则优先(原版导入档零漂移) */
export function fieldValue(save: SaveData, f: WldField): WldVal {
  const snap = (save as { wldSnap?: Record<string, WldVal> }).wldSnap;
  const v = snap?.[f.name];
  if (v !== undefined) return v;
  return f.get(save);
}

function treeX(s: SaveData): number[] {
  const w = H(s).width;
  const t = H(s).treeX;
  return t && t.length >= 3 ? t : [w >> 2, w >> 1, (w * 3) >> 3];
}
function treeStyle(s: SaveData): number[] {
  const t = H(s).treeStyle;
  return t && t.length >= 4 ? t : [0, 0, 0, 0];
}
/** timeOfDay → (time, dayTime)(WldImport :743-754 正变换逆) */
function timeOf(s: SaveData): { time: number; dayTime: boolean } {
  const tod = CK(s).timeOfDay ?? 0.25;
  if (tod >= 0.1875 && tod < 0.6875) return { time: ((tod - 0.1875) / 0.5) * 54000, dayTime: true };
  return { time: (((tod - 0.6875 + 1) % 1) / 0.5) * 32400, dayTime: false };
}

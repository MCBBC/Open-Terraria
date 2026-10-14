// 自有存档格式：JSON 外壳（人可读）+ RLE 二进制 tile 段（base64）
// 序列化纯核心在 ./serialize(无 DOM/World 依赖,主线程与 save.worker.ts 共用同一实现);
// 本文件保留 SaveData 类型/读档解码与主线程同步 saveGame(兼容入口,worker 不可用时回退)。
import type { World } from '../world/World';
import { World as WorldClass, CHEST_MAX_ITEMS } from '../world/World';
import type { Player } from '../entities/Player';
import { assembleSave, serializeSave } from './serialize';
import type { SaveData, SaveStoreView, SaveMeta } from './serialize';
import { getSaveModEntries, getEnabledModIds, getCurrentAlloc } from '../mods/bridge';
import { serializeModTEs, restoreModTEs } from '../mods/tileEntities';   // ★TE 梯队
import { TILE_INTERNAL_OF_STABLE, TILE_BY_KEY, WALL_DEFS } from '../data/tiles';
import { ITEM_INTERNAL_OF_STABLE, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { LEGACY_KEY_OF_INTERNAL_V3, viIdOfRetired } from '../data/itemMigration';
import type { SavedItem as SavedItemT } from './serialize';
import { weatherToSave } from '../world/weather/Weather';
import { applyLunarSave } from '../world/LunarEvent';
import { furnitureFromSave } from '../world/FurnitureItems';
import { repairLegacyContainerAnchorsInStore } from '../world/repairIndexFrames';

export { bytesToB64, rlePairs, rleTiles, serializeSave } from './serialize';
export type { SaveData, SaveStoreView, SaveMeta } from './serialize';

// ★方案 A disk-0 迁移锚（BJ264 2026-09-22，阶段 2·唯一真险点）：
//   旧 serialize `it.id === 0 ? 0` 特判把【旧 internal 0 号位物品】落盘为磁盘 0——
//   重排前 0 号位 = vi_109 魔力水晶，故 v3+ 稳定域槽位（inventory/banks/chests）
//   的磁盘 id 0 ≡ 魔力水晶。方案 A 重排后 0 号位 = 原版 netID 0 语义（空洞、无 def），
//   读档 `.get(0)` 将静默归 0 丢水晶 → 读档边界显式迁移：磁盘 0 → vi_109 内部 id。
//   新档水晶落盘即 109（serialize 特判已撤），磁盘 0 仅剩 `?? 0` 未知 id 兜底面——
//   迁移臂把它读成水晶与旧行为（未知→internal 0→水晶）完全同相（零恶化不新增）。
//   ★v2 直读裸下标分支（`: it` 透传）不挂迁移：v2 id 域=旧版注册序裸下标（既有
//   「接受破损」政策），磁盘 0 归空洞（0 号位无 def）——比旧漂移（旧 0 号位物品
//   被读成当期 0 号位=错件幽灵）干净。
//   ★v3 armor/dye/trash/misc 裸下标段（mapLegacySlot）不在此迁移：其磁盘 0 走
//   LEGACY_KEY_OF_INTERNAL_V3 快照键链（快照[0]='dirt_block'→退役链 vi_2）——
//   快照域语义独立且顺序无关，重排零波及。
const MANA_CRYSTAL_IID: number = (() => {
  const k = VANILLA_ITEM_KEY_BY_ID[109] ?? 'vi_109_mana_crystal';
  return ITEM_BY_KEY[k] ?? 0;
})();

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function readVarint(u8: Uint8Array, pos: { i: number }): number {
  let v = 0, shift = 0;
  while (pos.i < u8.length) {
    const b = u8[pos.i++];
    v |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return v;
}

/** ★BJ575（2026-10-08）：玩家段装配单源——saveGame（主线程同步路径/worker 回退）
 *  与 SaveClient.doSave（worker 生产主路径）共用本函数。定谳：SaveClient 曾第二份
 *  手抄 playerData 漏 permanentUpgrades（恶魔之心 3335 旗 extraAccessory 打头）等
 *  14 键 → worker 生产存档 JSON 无键 → CharacterStore 随身态同步（mainFlow doSave→
 *  setState JSON.parse(json).player）/世界槽位/快速保存三面全缺 → 重进游戏
 *  applyPlayer（mainFlow.ts `pu.extraAccessory !== undefined` 门）不回灌 → 恶魔心
 *  第 6 配饰槽（armor[8]/染料[18]）恒锁=用户实报「重进失效」；显隐占格臂
 *  （Player.cs:4259-4281 CanDemonHeartAccessoryBeShown）只剩 armor/dye 占格显示=
 *  「卸下饰品后槽位消失」。
 *  原版锚：Player.cs:55430 fileIO.Write(newPlayer.extraAccessory)（SavePlayer,
 *  序在 statLifeMax 系后/unlockedBiomeTorches·ateArtisanBread·usedAegisCrystal 前）
 *  /:55891 读（release≥125）。键序即 PL:55404-55588 段序（R16-14 注同源）。
 *  ⚠️BJ71 家族纪律：本函数是玩家段【唯一】装配点——新玩家字段在此加键,
 *  严禁在 SaveClient 另抄一份。 */
export function buildPlayerSaveData(world: World, player: Player): SaveData['player'] {
  return {
    hp: player.hp, x: player.x, y: player.y,
    inventory: player.inv.slots, selected: player.inv.selected,
    baseMaxHp: player.baseMaxHp, baseMaxMana: player.baseMaxMana, mana: player.mana,
    banks: player.banks,
    armor: player.inv.armor,
    dye: player.inv.dye,
    trash: player.inv.trash,
    miscEquips: player.inv.miscEquips,
    miscDyes: player.inv.miscDyes,
    loadouts: player.inv.loadouts,
    currentLoadout: player.inv.currentLoadout,
    buffs: player.buffs?.toSave?.() ?? [],  // buffType+buffTime 槽（PL:53913-53925;桩 player 容忍）
    taxMoney: player.taxMoney ?? 0,         // PL:53839
    golferScoreAccumulated: player.golferScoreAccumulated ?? 0, // PL:1792
    deathsPve: player.deathsPve ?? 0,       // PL:53840
    // ★R16-14（2026-08-24）：SavePlayer 缺失字段补落（PL57:55404-55588 序）
    deathsPvp: player.deathsPvp ?? 0,       // numberOfDeathsPVP（PL:55444;msg16 尾段已在跑中继,存档侧曾只落 Pve）
    team: player.team ?? 0,                 // PvP 队伍（PL:55411;0 无/1-5 队色）
    dead: player.dead ?? false,             // 死亡态（PL:55558——死亡瞬存档曾=免死复活满状态）
    respawnTimer: player.respawnTimer ?? 0, // PL:55559-55562
    // 旅程力量·玩家侧（IPersistentPerPlayerContent，CreativePowerManager.cs:183-195
    // SaveToPlayer 等价——单人共用 World.journeyPowers 存储，落盘拆到 player 段）
    journeyPowers: {
      godmode: world.journeyPowers.godmode,
      farPlacementRange: world.journeyPowers.farPlacementRange,
      spawnRateSlider: world.journeyPowers.spawnRateSlider,
    },
    permanentUpgrades: {
      extraAccessory: player.inv.extraAccessory,   // ★BJ575 恶魔之心 3335 旗（PL:55430 写/:55891 读 v≥125）
      usedAegisCrystal: player.usedAegisCrystal,
      usedAegisFruit: player.usedAegisFruit,
      usedArcaneCrystal: player.usedArcaneCrystal,
      usedGalaxyPearl: player.luckState.usedGalaxyPearl,   // PL:53835/:54303（银河珍珠 5340）
      usedGummyWorm: player.usedGummyWorm,
      usedAmbrosia: player.usedAmbrosia,
    },
    anglerQuestsFinished: player.anglerQuestsFinished ?? 0,     // PL:1790（渔夫奖励阶梯）
    hideInfo: player.hideInfo ?? undefined,     // PL:776 hideInfo[13](DrawInfoAccs 行开关)
    // PL:53813-53819 hideVisibleAccessory[10] 位打包（本仓布尔数组直存;仅配饰段
    // 3-9 有效,全 false 时省略=旧档缺省语义）
    hideVisibleAccessory: player.hideVisibleAccessory?.some(Boolean)
      ? [...player.hideVisibleAccessory]
      : undefined,
    hairDye: player.hairDye ?? 0,               // PL:53805-53808 hairDye byte（发色剂槽）
    hbLocked: player.hbLocked ?? false,         // SW-FX10 债⑪:PL:55543 hbLocked bool
    enabledSuperCart: player.enabledSuperCart ?? true,  // SW-FX10 债⑩:PL:55572 位[1] enabledSuperCart
    builderAccStatus: [...player.builderAccStatus],     // SW-FX19 债:PL:55553-55555 builderAccStatus[12]
    // ★SW-FX38b：火把神恩宠解锁旗（Player.unlockedBiomeTorches,PL:55430 写/:55895 读）。
    //  原版角色字段随身跨世界;本仓在-session 权威=world.flags（原版语义=Player 域,
    //  但本仓 TorchGod/Game.usingBiomeTorches 消费面均挂 world.flags）——快照在此
    //  回填,CharacterStore 同步（doSave→setState JSON.parse(json).player）与 .plr
    //  导出（exportPlr）同吃该字段。旧档缺省 undefined=false
    unlockedBiomeTorches: !!world.flags.unlockedBiomeTorches,
    // ★BJ285-②：匠师面包吃旗（Player.ateArtisanBread,PL:55433 写/:55899 读）——
    //  在-session 权威=world.flags（Game 用途支+旅商股票消费面）,快照在此回填,
    //  applyPlayer 读档单调回灌;.plr 导出 exportPlr 同吃该字段（旧恒 false 债清偿）
    ateArtisanBread: !!world.flags.ateArtisanBread,
  };
}

/** 主线程同步存档(兼容入口/worker 回退路径)。常规保存请走 SaveClient.saveAsync */
/** ★BJ620 件6-F9（BJ616 F9 实测落刀,探针=scripts/_bj620-f9-parse-probe.mjs）：
 *  同步路径 parts 形——saveGame 的 json+player 切片（data.player=serializeSave 变换后
 *  的稳定 id 磁盘形,与 json.player 全等;worker 不可用回退时 mainFlow 的
 *  charStore.setState 同享免整档 JSON.parse 面）。★命名注：与服务器 ioWorker 路径的
 *  buildSaveParts(world)（view/meta/player 装配形）无涉——本函数=saveGame 全量对。 */
export function buildSaveGameParts(world: World, player: Player, playTimeMs: number, townNpcs?: SaveData['npcs'], events?: SaveData['events'],
  // ★SW-FX11（2026-09-10）：天界四塔 NPC 段（WF:1744-1755）+ 按压压力板段（WF:3374-3386）
  pillarNpcs?: SaveData['pillarNpcs'], pressurePlates?: SaveData['pressurePlates']): { json: string; player: SaveData['player'] } {
  const st = world.store;
  const view: SaveStoreView = {
    type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
    wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
    half: st.half, slope: st.slope,
    paint: st.paint, paintWall: st.paintWall,   // 油漆双通道（WF:1474-1491）
    coat: st.coat,                              // 涂层四位（WF:1539-1552）
    explored: world.explored,                   // 战争迷雾（原版 .twld MapHelper 段等价）
  };
  const meta: SaveMeta = {
    name: world.name, seed: world.seed, w: st.w, h: st.h,
    spawnX: world.spawnX, spawnY: world.spawnY,
      spawnX0: world.spawnX0, spawnY0: world.spawnY0,   // 原始出生点（床 RemoveSpawn 回退）
    groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
    timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
    bloodMoon: world.clock.bloodMoon, eclipse: world.clock.eclipse,
    moonPhase: world.clock.moonPhase, moonType: world.moonType,
    seedFlags: { ...world.seedFlags },
    starterSwapMigrated: world.starterSwapMigrated,   // ★IIIII20b 换人一次性迁移标
    difficulty: world.difficulty,   // Main.GameMode（Main.cs:2677）
    journeyTimeRate: world.journeyTimeRate, journeyFreezeTime: world.journeyFreezeTime,
    // 旅程力量·世界侧（IPersistentPerWorldContent；玩家侧三件走 player 段下方）
    journeyPowers: {
      freezeRain: world.journeyPowers.freezeRain,
      freezeWind: world.journeyPowers.freezeWind,
      stopBiomeSpread: world.journeyPowers.stopBiomeSpread,
      difficultySlider: world.journeyPowers.difficultySlider,
    },
    sundialCooldown: world.sundialCooldown, moondialCooldown: world.moondialCooldown,
    fastForwardTimeToDawn: world.fastForwardTimeToDawn,
    fastForwardTimeToDusk: world.fastForwardTimeToDusk,
    chests: world.chests, signs: world.signs, flags: world.flags,
    weather: weatherToSave(world.weather),
    invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
      x: world.invasionX, delay: world.invasionDelay },
    altarCount: world.altarCount,   // WorldGen.altarCount（WorldFile.cs:1303/2100）
    meteorShowerCount: world.meteorShowerCount,   // WorldGen.meteorShowerCount（WorldFile.cs:1069/:177）
    // 夜间小动物概率五件套（setFireFlyChance；旧档缺省=代表值，当晚重掷）
    critterChances: { fireFly: world.fireFlyChance, fireFlyFriendly: world.fireFlyFriendly,
      fireFlyMultiple: world.fireFlyMultiple, butterfly: world.butterflyChance, stinkBug: world.stinkBugChance },
    cultistDelay: world.cultistDelay,   // CultistRitual.delay（WF:1340 写/:2192 读）
    angler: { quest: world.anglerQuest, whoFinishedToday: [...world.anglerWhoFinishedToday] },  // WF:1329-1335
    savedOreTiers: { ...world.savedOreTiers },  // WorldGen.SavedOreTiers（WF:1305-1307）
    oreTiersPH: { ...world.oreTiersPH },        // 肉前四档（WF:11294-11320,军火商钨弹门）
    shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    // ★BJ90 勘误（2026-09-15，BJ71 登记③）：原注「BannerSystem.cs:32 随存档」锚错——
    //  BannerSystem.cs:25-32 区是 NetBannersModule 网络包写手（WriteKillCountPacket/
    //  WriteKillCountUpdate），非世界档持久化。真锚=WorldFile.cs:1347 BannerSystem.Save
    //  （:171-79 i16 n + n×i32）/:2210 Load（:183-97 v<109 无段）；1458 同段零变更。
    bannerKills: world.bannerKills,   // BannerSystem.killCount（WF:1347 Save/:2210 Load 随世界档）
    // ★SW-FX43（2026-09-12）：wld-compat 五通道随档（World→SaveMeta→serializeSave）：
    //  caveBackX/worldId（建模值:自建=worldgen 掷值/导入=原值）+ wldSnap 差量快照
    //  + teSnap/townRooms/bgStyles 透传（FX35 剩债:repo 存档链曾不携行——bgStyles 同族
    //  断链系本刀 round-trip 真档验证炸出:R16-5 落盘值只在 SaveData 层,meta 装配三处
    //  均未喂入 → 导入→游玩→存档→导出 13 档背景样式全回 0）
    worldId: world.worldId,
    caveBackX: world.caveBackX ? [...world.caveBackX] : undefined,
    bgStyles: world.bgStyles ? { ...world.bgStyles, cave: [...world.bgStyles.cave] } : undefined,
    wldSnap: world.wldSnap,
    teSnap: world.teSnap,
    townRooms: world.townRooms,
    // ★mod 清单（2026-10-04 P1）：三处 meta 装配之一（主线程同步回退路径;BJ71 防漏喂）
    mods: getSaveModEntries() ?? undefined,
    // 挂物族存放物（内部 id；serializeSave 内过稳定 id 表）
    // 挂物族存放物：内部 id 直传（serializeSave 内统一过稳定 id 表，与 chests 同路径）
    furniture: world.furnitureItems,
  };
  // ★BJ575（2026-10-08）：玩家段装配单源化——原内联块（R16-14 全字段）迁出为
  //  buildPlayerSaveData，与 SaveClient.doSave（worker 生产主路径）共用。见该函数头注。
  const playerData = buildPlayerSaveData(world, player);
  // ★TE 梯队(2026-10-14):mod tile entity 实例段(meta 供数;与 mods 同族防漏喂)
  meta.teMods = serializeModTEs(world.store);
  const data = assembleSave(view, meta, playerData, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates);
  return { json: JSON.stringify(data), player: data.player };
}

/** 旧签名薄壳（json 串;parts 形见 buildSaveParts）。 */
export function saveGame(world: World, player: Player, playTimeMs: number, townNpcs?: SaveData['npcs'], events?: SaveData['events'],
  pillarNpcs?: SaveData['pillarNpcs'], pressurePlates?: SaveData['pressurePlates']): string {
  return buildSaveGameParts(world, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates).json;
}

export function loadSave(json: string): ReturnType<typeof loadSaveData> {
  return loadSaveData(JSON.parse(json) as SaveData);
}

/** 服务器侧世界-only 存档（P3.1 持久化）：tile/箱子/clock/flags/天气，不含玩家/城镇NPC。
 *  player 字段以空壳占位（格式必填；语义上服务器档无玩家，加载方忽略）。
 *  注：serializeSave 现零就地写（幽灵保域批删除了写侧幽灵净化），活存储不受影响。 */
export function saveWorldOnly(world: World): string {
  const parts = buildSaveParts(world);
  return serializeSave(parts.view, parts.meta, parts.player, 0);
}

/** 只构建序列化输入(视图+元数据+占位玩家),不做 RLE/stringify——ioWorker 路径用:
 *  主线程出 parts(廉价视图引用)→ worker 克隆 memcpy 后做重的 RLE 编码+stringify
 *  (server/src/workers/ioWorkerClient.ts)。saveWorldOnly 语义不变(同源部件) */
export function buildSaveParts(world: World): {
  view: SaveStoreView; meta: SaveMeta; player: SaveData['player'];
} {
  const st = world.store;
  const view: SaveStoreView = {
    type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
    wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
    half: st.half, slope: st.slope,
    paint: st.paint, paintWall: st.paintWall,   // 油漆双通道（WF:1474-1491）
    coat: st.coat,                              // 涂层四位（WF:1539-1552）
    explored: world.explored,                   // 战争迷雾（服务器档随世界下发）
  };
  const meta: SaveMeta = {
    name: world.name, seed: world.seed, w: st.w, h: st.h,
    spawnX: world.spawnX, spawnY: world.spawnY,
      spawnX0: world.spawnX0, spawnY0: world.spawnY0,   // 原始出生点（床 RemoveSpawn 回退）
    groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
    timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
    difficulty: world.difficulty,   // Main.GameMode（Main.cs:2677）——服务器档随世界下发
    // ★IIIII20b 换人一次性迁移标（★BJ90 2026-09-15 补喂,BJ71 登记①）——服务器/件路径
    // 同缝（BJ71 判例:凡 meta 装配多轨必逐轨核对喂入面）
    starterSwapMigrated: world.starterSwapMigrated,
    chests: world.chests, signs: world.signs, flags: world.flags,
    weather: weatherToSave(world.weather),
    invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
      x: world.invasionX, delay: world.invasionDelay },
    altarCount: world.altarCount,
    meteorShowerCount: world.meteorShowerCount,
    // 夜间小动物概率五件套（setFireFlyChance；服务器档随世界下发）
    critterChances: { fireFly: world.fireFlyChance, fireFlyFriendly: world.fireFlyFriendly,
      fireFlyMultiple: world.fireFlyMultiple, butterfly: world.butterflyChance, stinkBug: world.stinkBugChance },
    cultistDelay: world.cultistDelay,   // CultistRitual.delay（WF:1340 写/:2192 读）
    angler: { quest: world.anglerQuest, whoFinishedToday: [...world.anglerWhoFinishedToday] },  // WF:1329-1335
    savedOreTiers: { ...world.savedOreTiers },  // WorldGen.SavedOreTiers（WF:1305-1307）
    oreTiersPH: { ...world.oreTiersPH },        // 肉前四档（WF:11294-11320,军火商钨弹门）
    shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
    sundialCooldown: world.sundialCooldown, moondialCooldown: world.moondialCooldown,
    fastForwardTimeToDawn: world.fastForwardTimeToDawn,
    fastForwardTimeToDusk: world.fastForwardTimeToDusk,
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    // ★BJ90 勘误（2026-09-15，BJ71 登记③）：注同上——真锚=WF:1347 BannerSystem.Save/:2210
    //  Load（BannerSystem.cs:32 区是网络包写手,非存档位）
    bannerKills: world.bannerKills,   // BannerSystem.killCount（WF:1347 Save/:2210 Load 随世界档）
    // ★SW-FX43：wld-compat 五通道随档（服务器/worker 件路径与 saveGame 同源,注同上;
    //  bgStyles 同族断链=round-trip 真档验证炸出,一并接通）
    worldId: world.worldId,
    caveBackX: world.caveBackX ? [...world.caveBackX] : undefined,
    bgStyles: world.bgStyles ? { ...world.bgStyles, cave: [...world.bgStyles.cave] } : undefined,
    wldSnap: world.wldSnap,
    teSnap: world.teSnap,
    townRooms: world.townRooms,
    // ★mod 清单（2026-10-04 P1）：三处 meta 装配之一（服务器/件路径;BJ71 防漏喂）
    mods: getSaveModEntries() ?? undefined,
    // 挂物族存放物：内部 id 直传（serializeSave 内统一过稳定 id 表，与 chests 同路径）
    furniture: world.furnitureItems,
  };
  const placeholderPlayer: SaveData['player'] = {
    hp: 0, x: world.spawnX * 16, y: world.spawnY * 16,
    inventory: [], selected: 0,
  };
  return { view, meta, player: placeholderPlayer };
}

/** 直接从内存 SaveData 构建(导入 .wld 路径用——跳过 stringify→parse 双拷贝,
 *  2026-08 审计 #3:该往返单次 20~50MB×2) */
/** player 段槽位 id 还原(磁盘稳定 id → 内部 id;v3 裸下标/v2 直读兼容)。
 *  loadSaveData 主路径与角色随身态(CharacterStore.getState → playerFromDiskForm)
 *  共用同一映射——保证两条读入路径物品 id 语义一致。 */
function remapPlayerSlots(p: SaveData['player'], v3: boolean, v4: boolean): SaveData['player'] {
  // ★方案 A disk-0 迁移（BJ264）：`it.id === 0 ? 0` → `it.id === 0 ? MANA_CRYSTAL_IID`
  //   （旧档磁盘 0=旧 internal 0=魔力水晶,重排后显式迁移;见 MANA_CRYSTAL_IID 头注）
  const mapItem = (it: SavedItemT | null): SavedItemT | null =>
    it && v3 ? { ...it, id: it.id === 0 ? MANA_CRYSTAL_IID : ITEM_INTERNAL_OF_STABLE.get(it.id) ?? 0 } : it;
  const mapLegacySlot = (it: SavedItemT | null): SavedItemT | null => {
    if (!it) return it;
    if (v4) return mapItem(it);
    if (!v3) return it; // v2 及更早:裸下标直读
    // v3:armor/dye/trash/misc/loadouts 段 = 保存时构建的裸内部下标
    // ★SW-BO1 2026-09-07（RB5b 建议清偿）：越界裸下标（≥ 快照表长——物品表冻结后
    //  新增件、或旧存档下标超出当前表）无键可考。原 `return it` 会把越界裸下标
    //  直接当当前内部 id 消费=错件幽灵（下标撞进新表其它物品）；落 0（空槽）与
    //  下方退役键归 0 面同归，宁缺不错。
    if (it.id < 0 || it.id >= LEGACY_KEY_OF_INTERNAL_V3.length) return { ...it, id: 0 };
    const key = LEGACY_KEY_OF_INTERNAL_V3[it.id];
    if (key === undefined) return it;
    if (/^vi_(\d+)_/.test(key)) {
      // vi_ 键:键本身仍在注册表(蛇形/驼峰双注册内容等价),直接反查内部 id。
      // ★ 不能经 ITEM_STABLE_OF_INTERNAL[裸下标] —— 本地 184 条删除后下标整体左移
      const id = ITEM_BY_KEY[key];
      return id !== undefined ? { ...it, id } : it;
    }
    // 本地键:退役映射(→vi_);纯自创删除键→归 0
    const viId = viIdOfRetired(key);
    return { ...it, id: viId > 0 ? viId : 0 };
  };
  return {
    ...p,
    inventory: p.inventory.map(mapItem),
    banks: p.banks?.map((b) => b.map(mapItem)),
    armor: p.armor?.map(mapLegacySlot),
    dye: p.dye?.map(mapLegacySlot),
    trash: mapLegacySlot(p.trash ?? null),
    miscEquips: p.miscEquips?.map(mapLegacySlot),
    miscDyes: p.miscDyes?.map(mapLegacySlot),
    loadouts: p.loadouts?.map((l) => ({
      armor: l.armor.map(mapLegacySlot),
      dye: l.dye.map(mapLegacySlot),
    })),
  };
}

/** 角色随身态(磁盘稳定 id 形)→ 内部 id 形。CharacterStore 存的态由当前版本
 *  序列化链产出(v4+ 稳定 id),恒走 v3/v4 映射。 */
export function playerFromDiskForm(p: SaveData['player']): SaveData['player'] {
  return remapPlayerSlots(p, true, true);
}

export function loadSaveData(data: SaveData, onTilesProgress?: (p: number) => void): { world: World; player: SaveData['player']; data: SaveData } {
  // ★mod 清单缺失检测（2026-10-04 P1）：存档记录 mod vs 当前启用集对账。缺失=
  //  mod 内容读档静默降级（stable id ?? 0 兜底语义）——只告警不阻断（占位物语义
  //  的告警面;显式占位物显示=P2）。worker 态 enabled=null=跳过检测
  const enabledModIds = getEnabledModIds();
  if (data.mods?.length && enabledModIds) {
    const missing = data.mods.filter((m) => !enabledModIds.includes(m.id));
    if (missing.length > 0) {
      console.warn(`[mods] 存档依赖缺失 mod（内容将静默降级）: ${missing.map((m) => `${m.id}@${m.version}`).join(', ')}`);
      // ★R-C-F5(2026-10-14):缺失面升格为可见提示(worker 域无 toast 面=存
      //  warning 窗口;mainFlow 读档完成后消费弹 toast——旧=仅 console,用户
      //  错过后进世界 autosave 洗档不可逆)
      (globalThis as unknown as { __swMissingModsWarn?: Array<{ id: string; version: string }> }).__swMissingModsWarn = missing;
    }
  }
  // ★P5 id 平移完整解（2026-10-04）：存档头 itemIds/tileIds 分配映射 × 当前分配
  //  （mods/bridge getCurrentAlloc——主线程 loader 直写/worker applyModIds 携带）
  //  → savedStable→currentStable 重映射。卸/换前排位 mod 时后位 mod 的 id 平移
  //  在此纠偏;映射缺键=内容已移除 → 落既有 ??0 占位。仅 mod 段有键,原版域零扰动。
  let itemRemap: Map<number, number> | null = null;
  let tileRemap: Map<number, number> | null = null;
  // ★D16(2026-10-13):墙域 P5 平移同族(wallIds 随档 × 当前分配=墙 id 错位纠偏;
  //  旧档无键=零迁移;墙 id=internal=stable 零恒等表,映射域仅 mod 段)
  let wallRemap: Map<number, number> | null = null;
  const modCur = getCurrentAlloc();
  if (data.mods?.length && modCur) {
    for (const m of data.mods) {
      for (const [fk, sid] of m.itemIds ?? []) {
        const cur = modCur.itemKeys.get(fk);
        if (cur !== undefined && cur !== sid) (itemRemap ??= new Map()).set(sid, cur);
      }
      for (const [fk, sid] of m.tileIds ?? []) {
        const cur = modCur.tileKeys.get(fk);
        if (cur !== undefined && cur !== sid) (tileRemap ??= new Map()).set(sid, cur);
      }
      for (const [fk, sid] of m.wallIds ?? []) {
        const cur = modCur.wallKeys?.get(fk);
        if (cur !== undefined && cur !== sid) (wallRemap ??= new Map()).set(sid, cur);
      }
    }
  }
  const remapItemId = (id: number): number => (itemRemap ? itemRemap.get(id) ?? id : id);
  if (itemRemap && data.player) {
    // 就地纠偏读档侧全部物品槽(decode 既有链 stable→internal 零改):
    // 背包/银行/盔甲/染料/垃圾/杂项/配装 + 箱子 + 挂物
    const fix = (slots?: Array<{ id: number } | null> | null): void => {
      if (!slots) return;
      for (const s of slots) if (s && typeof s.id === 'number') s.id = remapItemId(s.id);
    };
    fix(data.player.inventory);
    for (const b of data.player.banks ?? []) fix(b);
    fix(data.player.armor); fix(data.player.dye);
    if (data.player.trash) data.player.trash.id = remapItemId(data.player.trash.id);   // 单槽(serialize.ts:183)
    fix(data.player.miscEquips); fix(data.player.miscDyes);
    for (const l of data.player.loadouts ?? []) { fix(l.armor); fix(l.dye); }
    for (const c of data.chests ?? []) fix(c.items);
    for (const f of data.furniture ?? []) fix(f.slots);
  }
  // ★二进制兼容(2026-09-06):binary 存档的通道以 Uint8Array 直出(免 base64 解码),
  //  旧 JSON 档的通道以 base64 string 存放(走 b64ToBytes 解码)。统一由此入口转换。
  const asBytes = (v: string | Uint8Array | undefined): Uint8Array =>
    v instanceof Uint8Array ? v : b64ToBytes(v ?? '');
  // 物品 id 还原(箱子/背包/储物就地重写):v3+ 走稳定 id;v2 旧档直读(接受破损政策)。
  // v4 起 armor/dye/trash/misc/loadouts 也是稳定 id;v3 恰为裸内部下标——用迁移锚
  // 快照(LEGACY_KEY_OF_INTERNAL_V3)反查 key 再转 vi_/原定义(本地物品退役兼容层)
  const v3 = (data.version ?? 1) >= 3;
  const v4 = (data.version ?? 1) >= 4;
  const mapItem = (it: SavedItemT | null): SavedItemT | null =>
    it && v3 ? { ...it, id: it.id === 0 ? MANA_CRYSTAL_IID : ITEM_INTERNAL_OF_STABLE.get(it.id) ?? 0 } : it;
  // v3 稳定 id → 内部 id(含 locked 透传);★曾未接线直接用 data.chests——
  // 现有物品 stable≡internal 掩盖,自定义物品进箱即错
  // R21：旧档箱恒 10 槽 → 读档统一补齐到 CHEST_MAX_ITEMS=40（原版 Chest.cs:58
  //  DefaultMaxItems=40;旧档零迁移——补的全是 null,存档回写自然带满）
  const padChestItems = (items: Array<SavedItemT | null>): Array<SavedItemT | null> => {
    const out = items.slice(0, CHEST_MAX_ITEMS);
    while (out.length < CHEST_MAX_ITEMS) out.push(null);
    return out;
  };
  const v3Chests = (data.chests ?? [])   // ★R16-16 缺段守卫（截断 JSON 曾 .map 即抛）
    .map((c) => (v3
      ? { x: c.x, y: c.y, locked: c.locked, name: c.name, items: padChestItems(c.items.map(mapItem)) }
      : { x: c.x, y: c.y, locked: c.locked, name: c.name, items: padChestItems(c.items) }));
  if (v3 && data.player) {
    data.player = remapPlayerSlots(data.player, v3, v4);
  }
  const world = new WorldClass(data.header.width, data.header.height, data.header.seed, data.header.name);
  // ★mod 清单随档（2026-10-04 P3）：data.mods → world.saveMods（enterGame 对账弹缺失 toast）
  world.saveMods = data.mods?.map((m) => ({ id: m.id, version: m.version })) ?? undefined;
  world.spawnX = data.header.spawn[0];
  world.spawnY = data.header.spawn[1];
  // 原始出生点：旧档无 spawn0 → 回退当前 spawn（床移除重生点后第一次存档前的近似）
  world.spawnX0 = data.header.spawn0?.[0] ?? world.spawnX;
  world.spawnY0 = data.header.spawn0?.[1] ?? world.spawnY;
  world.groundLevel = data.header.groundLevel;
  world.rockLevel = data.header.rockLevel;
  // 旧档缺 lavaLine（原版 UnderworldLayer = maxTilesY-200）
  world.lavaLine = data.header.lavaLine ?? data.header.height - 200;
  if (data.header.treeX) world.treeX = data.header.treeX;
  if (data.header.treeStyle) world.treeStyle = data.header.treeStyle;
  if (data.header.treeTops?.length) world.treeTops = data.header.treeTops;
  // ★SW-FX43（2026-09-12）：wld-compat 四通道回填（旧档缺省=undefined →
  //  WldHeaderFields 缺省映射回退:caveBackX→treeX 派生/worldId→created XOR 派生）。
  //  teSnap 载入后按原版 CheckValidTile 淘汰（见 tiles 解码后的 prune 段）
  if (data.header.caveBackX?.length === 3) world.caveBackX = [...data.header.caveBackX];
  if (data.header.worldId !== undefined) world.worldId = data.header.worldId;
  world.wldSnap = data.wldSnap;
  world.teSnap = data.teSnap;
  world.townRooms = data.townRooms;
  if (data.header.crimson !== undefined) world.crimson = data.header.crimson;
  if (data.header.dungeonX !== undefined) world.dungeonX = data.header.dungeonX;
  // dungeonY 缺省（旧档/导入）回退地表线：CheckToSpawnDungeonEnemies 的 pY<dungeonY+40 门槛近似成立
  if (data.header.dungeonY !== undefined && data.header.dungeonY > 0) world.dungeonY = data.header.dungeonY;
  else world.dungeonY = world.groundLevel;
  if (data.header.jungleX !== undefined) world.jungleX = data.header.jungleX;
  // ★R16-16（2026-08-24）：三必填段缺省守卫（手编/截断 JSON 曾 undefined 直赋 →
  //  首个旗标访问即抛;与 wire/blocks/paint/coat/explored 的缺段容忍同口径）
  world.clock.timeOfDay = Number.isFinite(data.clock?.timeOfDay) ? data.clock.timeOfDay : 0.1875;
  world.clock.dayCount = data.clock.dayCount;
  // 原版 header _temp 三件套（WF:1276-1278）;旧档缺省=无血月/无日食/满月
  if (data.clock.bloodMoon !== undefined) world.clock.bloodMoon = data.clock.bloodMoon;
  if (data.clock.eclipse !== undefined) world.clock.eclipse = data.clock.eclipse;
  if (data.clock.moonPhase !== undefined) world.clock.moonPhase = data.clock.moonPhase;
  if (data.header.moonType !== undefined) world.moonType = data.header.moonType;
  if (data.header.seedFlags) world.seedFlags = { ...data.header.seedFlags };
  // ★IIIII20b：StarterNPC 换人一次性迁移标记（只落真值，旧档缺省=未迁移）
  if (data.header.starterSwapMigrated) world.starterSwapMigrated = true;
  // 世界难度（Main.GameMode，Main.cs:2677）——旧档缺省 0=经典
  if (data.header.difficulty !== undefined) world.difficulty = data.header.difficulty;
  // 旅程时间倍率/冻结（CreativePowers.cs:866/:1448）——旧档缺省 1/false
  if (data.header.journeyTimeRate !== undefined) world.journeyTimeRate = data.header.journeyTimeRate;
  if (data.header.journeyFreezeTime !== undefined) world.journeyFreezeTime = data.header.journeyFreezeTime;
  // 旅程力量·世界侧（IPersistentPerWorldContent；旧档缺段=构造器默认）——
  // 读档后立即钳制滑杆值（对应原版 Load → UpdateInfoFromSliderValueCache 链）
  if (data.header.journeyPowers) {
    world.journeyPowers.freezeRain = data.header.journeyPowers.freezeRain;
    world.journeyPowers.freezeWind = data.header.journeyPowers.freezeWind;
    world.journeyPowers.stopBiomeSpread = data.header.journeyPowers.stopBiomeSpread;
    const s = data.header.journeyPowers.difficultySlider;
    world.journeyPowers.difficultySlider = Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0;
  }
  // 旅程力量·玩家侧（IPersistentPerPlayerContent，CreativePowerManager.cs:197-215
  // LoadToPlayer + ApplyLoadedDataToOutOfPlayerFields——单人运行时载体 =
  // world.journeyPowers，此处统一合并覆盖 worker/主线程全部读档路径）
  if (data.player?.journeyPowers) {
    world.journeyPowers.godmode = data.player.journeyPowers.godmode;
    world.journeyPowers.farPlacementRange = data.player.journeyPowers.farPlacementRange;
    const s = data.player.journeyPowers.spawnRateSlider;
    world.journeyPowers.spawnRateSlider = Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0.5;
  }
  // 日晷/月晷四件套（WorldFile.cs:1311/1342/1416-1417；旧档缺省=无快进无冷却）
  if (data.header.sundialCooldown !== undefined) world.sundialCooldown = data.header.sundialCooldown;
  if (data.header.moondialCooldown !== undefined) world.moondialCooldown = data.header.moondialCooldown;
  if (data.header.fastForwardTimeToDawn !== undefined) world.fastForwardTimeToDawn = data.header.fastForwardTimeToDawn;
  if (data.header.fastForwardTimeToDusk !== undefined) world.fastForwardTimeToDusk = data.header.fastForwardTimeToDusk;
  // ★R16-5：背景样式落盘值回填（setBG 0-12；旧档缺省=undefined → BiomeBackground
  //  按 seed 派生不变。underworldBG 有既有 World 消费端，其余走 world.bgStyles
  //  由 BiomeBackground.seedFor 优先取用）
  if (data.header.bgStyles) {
    world.bgStyles = { ...data.header.bgStyles, cave: [...data.header.bgStyles.cave] };
    if (Number.isFinite(data.header.bgStyles.underworld)) world.underworldBG = data.header.bgStyles.underworld;
  }
  if (data.invasion) { // 入侵五元组回填（旧档缺省=无入侵）
    world.invasionType = data.invasion.type;
    world.invasionSize = data.invasion.size;
    world.invasionSizeStart = data.invasion.sizeStart;
    world.invasionX = data.invasion.x;
    world.invasionDelay = data.invasion.delay;
  }
  if (data.altarCount != null) world.altarCount = data.altarCount; // 旧档缺省 0
  if (data.meteorShowerCount != null) world.meteorShowerCount = data.meteorShowerCount; // 旧档缺省 0
  // 夜间小动物概率五件套（setFireFlyChance；旧档缺省=代表值，当晚 StartNight 重掷）
  if (data.critterChances) {
    world.fireFlyChance = data.critterChances.fireFly;
    world.fireFlyFriendly = data.critterChances.fireFlyFriendly;
    world.fireFlyMultiple = data.critterChances.fireFlyMultiple;
    world.butterflyChance = data.critterChances.butterfly;
    world.stinkBugChance = data.critterChances.stinkBug;
  }
  // 缺省走构造器 86400（= delayStart，v108 前旧档同值 WF:2188）
  if (data.cultistDelay != null) world.cultistDelay = data.cultistDelay;
  // 渔夫任务链（WorldFile.cs:2147-2161）：当日任务鱼索引 + 今日已交付名单；
  // anglerQuestFinished 不回填——原版读档 loadTempInfo 重置 false（WF:628-629）
  if (data.angler) {
    world.anglerQuest = data.angler.quest ?? 0;
    world.anglerWhoFinishedToday = [...(data.angler.whoFinishedToday ?? [])];
  }
  if (data.savedOreTiers != null) world.savedOreTiers = { ...data.savedOreTiers }; // 旧档缺省 -1 未砸过
  if (data.oreTiersPH != null) world.oreTiersPH = { ...data.oreTiersPH };          // 旧档缺省 7/6/9/8
  if (data.shadowOrbCount != null) world.shadowOrbCount = data.shadowOrbCount;      // 旧档缺省 0
  world.applyBestiary(data.bestiary); // 图鉴三桶（旧档缺省=空）
  if (data.bannerKills) world.bannerKills = data.bannerKills;   // 旗击杀计数（旧档缺省=空）
  world.chests = v3Chests ?? [];   // v3 id 翻译+locked 透传（★R16-16 缺段守卫）
  // ★TE 梯队(2026-10-14):mod tile entity 实例回填(load 钩恢复;缺 mod=静默降级)
  restoreModTEs(world.store, data.teMods);
  if (data.weather) world.applyWeather(data.weather); // 天气回填（旧档缺省=晴）
  world.flags = data.flags ?? {};   // ★R16-16
  // ★RB28-F2（2026-09-14）旧导入档脏键一次性归正（债锚 WldParser.ts:501-505）：
  //  2026-09-06 前 WldParser 曾把流第 1 位（原版 savedBartender,WF:1369）标成
  //  dd2DownedT1（语义错位）——旧档 dd2DownedT1=true 实为「酒保已解救」。检测
  //  「dd2DownedT1=true ∧ savedBartender 缺失」→ 搬键（savedBartender=true+脏键删除）：
  //  酒保入住链（VanillaSpawner:2074/Game.ts:32473）与表情解锁面即归正。新写档键序
  //  不动（现解析器 4 位语义正确;旧日军团双写面 downedOldOnesArmyT1-3 并存不受扰,
  //  DD2 导出/表情门走 OR 并读仍表真）。★不动 data.flags（入参纯度判例
  //  loadsavedata-input-purity——夹具共享面,归正只落 world 侧新对象,再存档即落盘）
  if (world.flags['dd2DownedT1'] && !world.flags.savedBartender) {
    const healed = { ...world.flags };
    delete healed['dd2DownedT1'];
    healed.savedBartender = true;
    world.flags = healed;
  }
  // ★BJ214（2026-09-20）双子键一次性归正：2026-08-14（3da58b52）前击败记账按后死之眼
  //  裸写 vanillaId——125 先死+126 收尾的旧档只有 downed_126 缺 downed_125 → mechAll
  //  （世花球茎 238 门 WorldEvolution:mechAll / 三王全灭判定）永假,且双眼已死不可再
  //  触发击败链=永久死态。原版语义（NPC.cs:80223-80229 case 125/126 同写
  //  downedMechBoss2 单旗）下 downed_126=true 而 downed_125=false 是不可能态=旧 bug
  //  残留 → 补写 downed_125。126 键保留（mechAny/.wld 导出 OR 口径不动）。★入参纯度
  //  同 RB28-F2：归正只落 world 侧新对象,再存档即落盘。
  if (world.flags['downed_126'] && !world.flags['downed_125']) {
    world.flags = { ...world.flags, downed_125: true };
  }
  // 星璇塔运行时态回填（WorldFile.cs:2220-2255 尾段：downedTower*/towerActive*/lunarApocalypseUp
  // 三类 bool 走 flags 落盘；盾值不存——TowerActive=true 读档重置满盾）
  applyLunarSave(world);
  // 城镇 NPC 段（原版 NPC 段 WF:1703-1750;旧档/曾断链=空数组 → 走新世界出生分支）
  if (data.npcs?.length) world.pendingTownNpcs = data.npcs;
  // ★SW-FX11（2026-09-10）：NPC 段尾 SavesAndLoads 四塔位（WF:2937-2955 Load 语义=读档
  //  即原位重生成）+ 按压压力板位（WF:3388-3398 Load→首拍 PokeLocation 一次性重触发）。
  //  恢复执行在 Game.afterWorldLoad（实体侧）；旧档缺省=无段
  if (data.pillarNpcs?.length) world.pendingPillarNpcs = data.pillarNpcs;
  if (data.pressurePlates?.length) world.pendingPlatePokes = data.pressurePlates;
  if (data.signs) world.signs = data.signs;
  // 挂物族存放物（v3 稳定 id → 内部 id；未知 id 归 0 由 furnitureFromSave 置空槽）
  world.furnitureItems = furnitureFromSave(
    data.furniture,
    (id) => (v3 ? ITEM_INTERNAL_OF_STABLE.get(id) ?? 0 : id),
  );

  const st = world.store;
  // ★热循环局部化(2026-08-13 零风险优化:5M 格×4 写=decode 主体):typed array 引用
  // 提局部 + 盒装 pos 对象改内联游标(逐字节等价)
  const tyT = st.type, tyF = st.flags, tyFX = st.frameX, tyFY = st.frameY;
  const tyW = st.wall, tyWr = st.wire, tyH = st.half, tySl = st.slope;
  const tyLt = st.liquidType, tyLq = st.liquid;
  const tyP = st.paint, tyPw = st.paintWall;
  const nAll = tyT.length;
  // tiles(v3:RLE 里的 type 是稳定 id,查 INTERNAL_OF_STABLE 还原;v2 旧档=内部下标直读)
  {
    const v3 = (data.version ?? 1) >= 3;
    const u8 = asBytes(data.tiles);
    // ★SW-BJ4 2026-09-07 定谳：loadSaveData 禁就地释放入参通道。dae304d4 曾在11 个通道
    //  解码后写 `data.X = ''/undefined` 释放 base64——同一 SaveData 二次载入即静默全空
    //  图（tiles 段先毁→帧/type 全零）：tests/wld-tileentity-import ×2 +
    //  tests/wld-weapon-rack-import ×4（两文件共享 save 多次 loadSaveData）全数爆红,
    //  且「先毁后断言」用例呈伪红误导排查（曾误疑 items.ts BK1/BN1）。内存面由调用方
    //  自管：worldGen.worker 载完即 `data = null`（:179 既有）;主线程 importWld/
    //  loadSave 的 SaveData 作用域出口即 GC。
    let p = 0, i = 0;
    let nextMilestone = onTilesProgress ? nAll / 100 : Infinity;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let tRaw = 0; s = 0;
      for (;;) { const b = u8[p++]; tRaw |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      // ★P4 红蓝修正(C2 读侧失步):fx/fy 消费门改为 tRaw!==0(与写侧「stable≠0
      //   必写帧」对齐)——旧实现按【解码值】t!==0 跳帧,未知 stable(缺 mod/缺桥)
      //   经 Uint16Array 读出 0 → 跳过 fx/fy → 自首个未知 tile 起整流错位=全图损坏,
      //   且 BJ280 worldDirty 语义下自动存档把损坏解码回写覆盖好档(不可逆)。
      //   未知槽落空气(占位语义),流零损伤。
      //   ★P5 id 平移解:先经 tileRemap(savedStable→currentStable)再查表。
      const tS = v3 && tRaw !== 0 && tileRemap ? tileRemap.get(tRaw) ?? tRaw : tRaw;
      let t: number;
      if (!v3) t = tRaw;
      else if (tS === 0) t = 0;
      else t = TILE_INTERNAL_OF_STABLE[tS] || 0;   // 未映射(0)→空气,帧照消费
      let fx = 0, fy = 0;
      if (tRaw !== 0) {
        s = 0;
        for (;;) { const b = u8[p++]; fx |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
        s = 0;
        for (;;) { const b = u8[p++]; fy |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      }
      const flag = t !== 0 ? 1 : 0;
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) {
        tyT[i] = t; tyF[i] = flag;
        tyFX[i] = fx; tyFY[i] = fy;
      }
      // 原版 LoadWorldTiles 逐列 statusText(:2514-2518)——RLE 游程按目标索引
      // 累进等效列进度;每 ~1% 回调一次防 postMessage 风暴
      if (onTilesProgress && i >= nextMilestone) {
        onTilesProgress(i / nAll);
        nextMilestone += nAll / 100;
      }
    }
  }
  // ★BJ377（2026-09-28）存量 .wld 导入档容器锚格误写批修（467 箱族/88 梳妆台锚
  //  被旧导入兜底强写成 21 保帧 → 左上格贴图错/破坏链碎片化/误锁 37 锚）。
  //  纯函数幂等（修后锚 type≠21 恒跳过,合法世界零写）；只在本文件收口=worker 与
  //  主线程两条读档链一次覆盖。v3 门：v2 旧内部下标域与现行 TILE_BY_KEY 无保序
  //  契约不判（v2 档首存转 v5 后下一读档自动入修）。
  if (v3) {
    const repaired = repairLegacyContainerAnchorsInStore(st, world.chests);
    if (repaired) console.log(`[load] BJ377 容器锚修复 ${repaired} 锚（467/88 家族归位）`);
  }
  // ★幽灵保域（v5）：active 位差分通道（serialize.ts rleTileActiveDiff 的逆变换）。
  //   v[i]=1 → 活位与"type≠0 即激活"派生式取反：幽灵格（type≠0 未激活）保持
  //   未激活存活、幻影活性（type=0 带活位）还原活位。缺段（≤v4 旧档）=保持
  //   派生式，语义与旧「写侧幽灵净化」一致（旧档本就无幽灵）。
  {
    const u8 = asBytes(data.tileActive ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      if (v) {
        for (; i < end; i++) tyF[i] ^= 1;
      } else {
        i = end;
      }
    }
  }
  // walls（version<2 的旧档墙值迁移：1=土→2, 2=石→1, 3=木→4（现为原版 id））
  //  ★D16(2026-10-13):migrate 后再过 wallRemap(mod 墙 savedId→currentId;
  //  legacy 迁移只触原版 1-4 域,mod 域 367+ 恒等穿过,序安全)
  {
    const legacy = (data.version ?? 1) < 2;
    const migrate = (v: number) => (legacy ? (v === 1 ? 2 : v === 2 ? 1 : v === 3 ? 4 : v) : v);
    const u8 = asBytes(data.walls);
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let vr = 0; s = 0;
      for (;;) { const b = u8[p++]; vr |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const mv = migrate(vr);
      let v = wallRemap ? wallRemap.get(mv) ?? mv : mv;
      // ★R-A-F1(2026-10-14):残值「再收割」告警——remap miss 且残值命中【当前
      //  在册】mod 墙 id(=卸载 mod 残留与后位 mod 新墙 id 重合,渲染错墙+吃他 meta;
      //  取舍=保残值换重启用恢复,此处 warn 留痕)
      if (v >= 367 && wallRemap && !wallRemap.has(mv) && WALL_DEFS[v]) {
        console.warn(`[mods] 墙 id 残值命中在册 mod 墙(${mv}→${v},卸载 mod 残留与现装 mod 重合——渲染/锤墙将按现装墙语义)`);
      }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyW[i] = v;
    }
  }
  // wire 电路位（旧存档缺此字段 → 全 0 = 无导线，缺字段容忍同 liquidType）
  {
    const u8 = asBytes(data.wire ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyWr[i] = v;
    }
  }
  // half/slope(旧存档缺 → 全整砖;v3+ 语义)
  {
    const u8 = asBytes(data.blocks ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const hv = v === 1 ? 1 : 0;
      const sv = v >= 2 && v <= 5 ? v - 1 : 0;
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) {
        tyH[i] = hv;
        tySl[i] = sv;
      }
    }
  }
  // liquid type（旧存档缺此字段 → 全 0，由液体模拟按 1=水 补全）
  {
    const u8 = asBytes(data.liquidType ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyLt[i] = v;
    }
  }
  // 油漆双通道（WF:1474-1491 独立字节位；旧档缺字段 → 全 0 = 无漆）。
  // 值域 0-31 与 5bit 位域等价，解码后钳 &31 防脏数据越出 PaintID 域
  {
    const u8 = asBytes(data.paint ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyP[i] = v & 31;
    }
  }
  {
    const u8 = asBytes(data.paintWall ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyPw[i] = v & 31;
    }
  }
  // 涂层四位（WF:1539-1552 存档位 2/4/8/16；旧档缺字段 → 全 0 = 无涂层，同 paint 容忍）
  {
    const tyC = st.coat;
    const u8 = asBytes(data.coat ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyC[i] = v & 31;
    }
    // 废弃荧光漆迁移（ConvertIlluminantPaintToNewField，WorldFile.cs:2806-2825）：
    // paint 31 → paint 0 + fullbrightBlock / wallColor 31 → 0 + fullbrightWall
    for (let i = 0; i < nAll; i++) {
      if (tyP[i] === 31) { tyP[i] = 0; tyC[i] |= 8; }   // :2811-2815
      if (tyPw[i] === 31) { tyPw[i] = 0; tyC[i] |= 16; } // :2816-2820
    }
  }
  // 战争迷雾（0/1 位图；旧档缺段 → 全 0 未探索 = 旧行为，不迁移不报错。
  // explored 已由构造器按 w*h 全零分配，RLE 游程未覆盖的尾部保持 0——同 wire 缺段容忍）
  {
    const ex = world.explored;
    const u8 = asBytes(data.explored ?? '');
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      const on = v ? 1 : 0;   // 钳位 0/1 域：非零脏数据按"已探索"归 1
      for (; i < end; i++) ex[i] = on;
    }
  }
  // liquid
  {
    const u8 = asBytes(data.liquid);
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let v = 0; s = 0;
      for (;;) { const b = u8[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyLq[i] = v;
    }
  }
  // ★幽灵净化(2026-09-07 方案B,读档边界):v5 差分还原后的残留幽灵
  //  (flags=0+type≠0)清零对齐原版读档语义——原版 SaveTile 对非活格不写 type,
  //  读档后本就无幽灵(详见 TileStore.purgeGhostTiles 注)。净化点在差分还原
  //  **之后**(旧档 v5 差分先还原 flags=0,再净化清 type=正确迁移)。
  const purgedGhosts = world.store.purgeGhostTiles();
  if (purgedGhosts > 0) console.log(`[load] 幽灵格净化 ${purgedGhosts} 格(对齐原版读档语义)`);
  // ★SW-FX43：teSnap 载入侧淘汰（1:1 LoadTileEntities 尾扫 WF:3349-3359——
  //  !WorldGen.InWorld(x,y,1) 或 !TileEntitiesManager.CheckValidTile(type,x,y)
  //  （:3352-3357 分派各型 IsTileValidForEntity）即除名。逐型判据=各自 ValidTile：
  //  假人 TETrainingDummy.cs:93-99（378+frameY==0+frameX%36==0）/逻辑传感器
  //  TELogicSensor.cs:152-158（423+frameX%18==0+frameY%18==0）/晶塔
  //  TETeleportationPylon.cs:136-137（597+frameY==0+frameX%54==0））。
  //  曾无淘汰=拆掉假人/晶塔后 teSnap 残影随档永久回写（原版载入即淘汰）。
  //  tile 域=内部 id（st.type 解码产物,未知键防 undefined 恒不等）。
  if (world.teSnap?.length) {
    const stT = world.store;
    const dummyT = TILE_BY_KEY['v_378_target_dummy'];
    const sensorT = TILE_BY_KEY['v_423_logicsensor'];
    const pylonT = TILE_BY_KEY['v_597_pylons'];
    const kept = world.teSnap.filter((t) => {
      if (!(t.x >= 0 && t.y >= 0 && t.x < stT.w && t.y < stT.h)) return false;   // InWorld 门
      const i = t.y * stT.w + t.x;
      const ty = stT.type[i], fx = stT.frameX[i], fy = stT.frameY[i];
      if (t.type === 0) return ty === dummyT && fy === 0 && fx % 36 === 0;
      if (t.type === 2) return ty === sensorT && fx % 18 === 0 && fy % 18 === 0;
      if (t.type === 7) return ty === pylonT && fy === 0 && fx % 54 === 0;
      return true;
    });
    world.teSnap = kept.length ? kept : undefined;
  }
  return { world, player: data.player, data };
}

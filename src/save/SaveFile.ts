// 自有存档格式：JSON 外壳（人可读）+ RLE 二进制 tile 段（base64）
// 序列化纯核心在 ./serialize(无 DOM/World 依赖,主线程与 save.worker.ts 共用同一实现);
// 本文件保留 SaveData 类型/读档解码与主线程同步 saveGame(兼容入口,worker 不可用时回退)。
import type { World } from '../world/World';
import { World as WorldClass } from '../world/World';
import type { Player } from '../entities/Player';
import { serializeSave } from './serialize';
import type { SaveData, SaveStoreView, SaveMeta } from './serialize';
import { TILE_INTERNAL_OF_STABLE } from '../data/tiles';
import { ITEM_INTERNAL_OF_STABLE, ITEM_BY_KEY } from '../data/items';
import { LEGACY_KEY_OF_INTERNAL_V3, viIdOfRetired } from '../data/itemMigration';
import type { SavedItem as SavedItemT } from './serialize';
import { weatherToSave } from '../world/weather/Weather';
import { applyLunarSave } from '../world/LunarEvent';
import { furnitureFromSave } from '../world/FurnitureItems';

export { bytesToB64, rlePairs, rleTiles, serializeSave } from './serialize';
export type { SaveData, SaveStoreView, SaveMeta } from './serialize';

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

/** 主线程同步存档(兼容入口/worker 回退路径)。常规保存请走 SaveClient.saveAsync */
export function saveGame(world: World, player: Player, playTimeMs: number, townNpcs?: SaveData['npcs'], events?: SaveData['events']): string {
  const st = world.store;
  const view: SaveStoreView = {
    type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
    wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
    half: st.half, slope: st.slope,
    paint: st.paint, paintWall: st.paintWall,   // 油漆双通道（WF:1474-1491）
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
    shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    bannerKills: world.bannerKills,   // BannerSystem.killCount（BannerSystem.cs:32 随存档）
    // 挂物族存放物（内部 id；serializeSave 内过稳定 id 表）
    // 挂物族存放物：内部 id 直传（serializeSave 内统一过稳定 id 表，与 chests 同路径）
    furniture: world.furnitureItems,
  };
  const playerData: SaveData['player'] = {
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
    // 旅程力量·玩家侧（IPersistentPerPlayerContent，CreativePowerManager.cs:183-195
    // SaveToPlayer 等价——单人共用 World.journeyPowers 存储，落盘拆到 player 段）
    journeyPowers: {
      godmode: world.journeyPowers.godmode,
      farPlacementRange: world.journeyPowers.farPlacementRange,
      spawnRateSlider: world.journeyPowers.spawnRateSlider,
    },
    permanentUpgrades: {
      extraAccessory: player.inv.extraAccessory,
      usedAegisCrystal: player.usedAegisCrystal,
      usedAegisFruit: player.usedAegisFruit,
      usedArcaneCrystal: player.usedArcaneCrystal,
      usedGummyWorm: player.usedGummyWorm,
      usedAmbrosia: player.usedAmbrosia,
    },
    anglerQuestsFinished: player.anglerQuestsFinished ?? 0,     // PL:1790（渔夫奖励阶梯）
    hideInfo: player.hideInfo ?? undefined,     // PL:776 hideInfo[13](DrawInfoAccs 行开关)
    hairDye: player.hairDye ?? 0,               // PL:53805-53808 hairDye byte（发色剂槽）
  };
  return serializeSave(view, meta, playerData, playTimeMs, townNpcs, events);
}

export function loadSave(json: string): ReturnType<typeof loadSaveData> {
  return loadSaveData(JSON.parse(json) as SaveData);
}

/** 服务器侧世界-only 存档（P3.1 持久化）：tile/箱子/clock/flags/天气，不含玩家/城镇NPC。
 *  player 字段以空壳占位（格式必填；语义上服务器档无玩家，加载方忽略）。
 *  注意：serializeSave 的幽灵净化会就地写 store——服务器存储由 setTileSilent/
 *  loadSaveData 保持 type/flags 一致，该循环为 no-op，活存储不受影响。 */
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
    shadowOrbCount: world.shadowOrbCount,          // WorldGen.shadowOrbCount（WF:1302/2099）
    sundialCooldown: world.sundialCooldown, moondialCooldown: world.moondialCooldown,
    fastForwardTimeToDawn: world.fastForwardTimeToDawn,
    fastForwardTimeToDusk: world.fastForwardTimeToDusk,
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    bannerKills: world.bannerKills,   // BannerSystem.killCount（BannerSystem.cs:32 随存档）
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
export function loadSaveData(data: SaveData, onTilesProgress?: (p: number) => void): { world: World; player: SaveData['player']; data: SaveData } {
  // 物品 id 还原(箱子/背包/储物就地重写):v3+ 走稳定 id;v2 旧档直读(接受破损政策)。
  // v4 起 armor/dye/trash/misc/loadouts 也是稳定 id;v3 恰为裸内部下标——用迁移锚
  // 快照(LEGACY_KEY_OF_INTERNAL_V3)反查 key 再转 vi_/原定义(本地物品退役兼容层)
  const v3 = (data.version ?? 1) >= 3;
  const v4 = (data.version ?? 1) >= 4;
  const mapItem = (it: SavedItemT | null): SavedItemT | null =>
    it && v3 ? { ...it, id: it.id === 0 ? 0 : ITEM_INTERNAL_OF_STABLE.get(it.id) ?? 0 } : it;
  const mapLegacySlot = (it: SavedItemT | null): SavedItemT | null => {
    if (!it) return it;
    if (v4) return mapItem(it);
    if (!v3) return it; // v2 及更早:裸下标直读
    // v3:armor/dye/trash/misc/loadouts 段 = 保存时构建的裸内部下标
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
  // v3 稳定 id → 内部 id(含 locked 透传);★曾未接线直接用 data.chests——
  // 现有物品 stable≡internal 掩盖,自定义物品进箱即错
  const v3Chests = v3
    ? data.chests.map((c) => ({ x: c.x, y: c.y, locked: c.locked, items: c.items.map(mapItem) }))
    : data.chests;
  if (v3 && data.player) {
    data.player = {
      ...data.player,
      inventory: data.player.inventory.map(mapItem),
      banks: data.player.banks?.map((b) => b.map(mapItem)),
      armor: data.player.armor?.map(mapLegacySlot),
      dye: data.player.dye?.map(mapLegacySlot),
      trash: mapLegacySlot(data.player.trash ?? null),
      miscEquips: data.player.miscEquips?.map(mapLegacySlot),
      miscDyes: data.player.miscDyes?.map(mapLegacySlot),
      loadouts: data.player.loadouts?.map((l) => ({
        armor: l.armor.map(mapLegacySlot),
        dye: l.dye.map(mapLegacySlot),
      })),
    };
  }
  const world = new WorldClass(data.header.width, data.header.height, data.header.seed, data.header.name);
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
  if (data.header.crimson !== undefined) world.crimson = data.header.crimson;
  if (data.header.dungeonX !== undefined) world.dungeonX = data.header.dungeonX;
  // dungeonY 缺省（旧档/导入）回退地表线：CheckToSpawnDungeonEnemies 的 pY<dungeonY+40 门槛近似成立
  if (data.header.dungeonY !== undefined && data.header.dungeonY > 0) world.dungeonY = data.header.dungeonY;
  else world.dungeonY = world.groundLevel;
  if (data.header.jungleX !== undefined) world.jungleX = data.header.jungleX;
  world.clock.timeOfDay = data.clock.timeOfDay;
  world.clock.dayCount = data.clock.dayCount;
  // 原版 header _temp 三件套（WF:1276-1278）;旧档缺省=无血月/无日食/满月
  if (data.clock.bloodMoon !== undefined) world.clock.bloodMoon = data.clock.bloodMoon;
  if (data.clock.eclipse !== undefined) world.clock.eclipse = data.clock.eclipse;
  if (data.clock.moonPhase !== undefined) world.clock.moonPhase = data.clock.moonPhase;
  if (data.header.moonType !== undefined) world.moonType = data.header.moonType;
  if (data.header.seedFlags) world.seedFlags = { ...data.header.seedFlags };
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
  if (data.shadowOrbCount != null) world.shadowOrbCount = data.shadowOrbCount;      // 旧档缺省 0
  world.applyBestiary(data.bestiary); // 图鉴三桶（旧档缺省=空）
  if (data.bannerKills) world.bannerKills = data.bannerKills;   // 旗击杀计数（旧档缺省=空）
  world.chests = v3Chests;      // v3 id 翻译+locked 透传
  if (data.weather) world.applyWeather(data.weather); // 天气回填（旧档缺省=晴）
  world.flags = data.flags;
  // 星璇塔运行时态回填（WorldFile.cs:2220-2255 尾段：downedTower*/towerActive*/lunarApocalypseUp
  // 三类 bool 走 flags 落盘；盾值不存——TowerActive=true 读档重置满盾）
  applyLunarSave(world);
  // 城镇 NPC 段（原版 NPC 段 WF:1703-1750;旧档/曾断链=空数组 → 走新世界出生分支）
  if (data.npcs?.length) world.pendingTownNpcs = data.npcs;
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
    const u8 = b64ToBytes(data.tiles);
    let p = 0, i = 0;
    let nextMilestone = onTilesProgress ? nAll / 100 : Infinity;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let tRaw = 0; s = 0;
      for (;;) { const b = u8[p++]; tRaw |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const t = v3 ? (tRaw === 0 ? 0 : TILE_INTERNAL_OF_STABLE[tRaw]) : tRaw;
      let fx = 0, fy = 0;
      if (t !== 0) {
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
  // walls（version<2 的旧档墙值迁移：1=土→2, 2=石→1, 3=木→4（现为原版 id））
  {
    const legacy = (data.version ?? 1) < 2;
    const migrate = (v: number) => (legacy ? (v === 1 ? 2 : v === 2 ? 1 : v === 3 ? 4 : v) : v);
    const u8 = b64ToBytes(data.walls);
    let p = 0, i = 0;
    while (i < nAll && p < u8.length) {
      let run = 0, s = 0;
      for (;;) { const b = u8[p++]; run |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      let vr = 0; s = 0;
      for (;;) { const b = u8[p++]; vr |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; }
      const v = migrate(vr);
      const end = Math.min(i + run + 1, nAll);
      for (; i < end; i++) tyW[i] = v;
    }
  }
  // wire 电路位（旧存档缺此字段 → 全 0 = 无导线，缺字段容忍同 liquidType）
  {
    const u8 = b64ToBytes(data.wire ?? '');
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
    const u8 = b64ToBytes(data.blocks ?? '');
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
    const u8 = b64ToBytes(data.liquidType ?? '');
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
    const u8 = b64ToBytes(data.paint ?? '');
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
    const u8 = b64ToBytes(data.paintWall ?? '');
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
  // 战争迷雾（0/1 位图；旧档缺段 → 全 0 未探索 = 旧行为，不迁移不报错。
  // explored 已由构造器按 w*h 全零分配，RLE 游程未覆盖的尾部保持 0——同 wire 缺段容忍）
  {
    const ex = world.explored;
    const u8 = b64ToBytes(data.explored ?? '');
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
    const u8 = b64ToBytes(data.liquid);
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
  return { world, player: data.player, data };
}

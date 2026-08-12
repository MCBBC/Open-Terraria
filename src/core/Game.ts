// 游戏主控制器：状态、主循环、挖掘/放置/战斗/生成/存档的总装
import { TILE, SPAWN_MIN_DIST, SPAWN_MAX_DIST, GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX, PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS } from './constants';
import { moveAndCollide } from '../physics/TileCollision';
import { plates428Pressed } from '../render/VanillaTiler';
import { imageToGrid, findArtPlacement, placeArt } from '../dev/PixelArtImport';
import { stepConveyor, conveyorCarriesEnemy } from '../physics/Conveyor';
import { RNG } from './rng';
import { Input } from './Input';
import { buildAssets, AssetBundle } from '../assets/AssetGen';
import { Clock, World, ChestData, deathCoinKeepFraction } from '../world/World';
import { breakHiveBlock, larvaSummonInRange } from '../world/hive';
import { generateWorld } from '../world/gen/WorldGen';
import { openDoor, closeDoor, clearDoorAt, shiftTallGate } from '../world/Door';
import { torchAnchorFrame, torchStillAnchored, torchStyleOfItemKey, isWaterTorchStyle } from '../world/Torch';
import { TorchGodEvent } from '../world/TorchGod';
import { findFreeHouse, WALL_HOUSE } from '../world/Housing';
import {
  INVASION_GOBLIN, INVASION_NONE, INVASION_PIRATE, INVASION_SNOW_LEGION, INVASION_MARTIAN,
  INVASION_GROUP, KILL_WEIGHT, invasionActive, canStartInvasion, startInvasion,
  tickInvasion, invasionWarningMisc, shouldSpawnInvasionEnemies,
} from '../world/Invasion';
import {
  MOON_KIND_FROST, MOON_KIND_PUMPKIN, MOON_EVENT_GROUP, REQUIRED_POINTS,
  moonEventActive, startMoonEvent, stopMoonEvent, addMoonEventKill,
  invasionWaveText,
} from '../world/MoonEvent';
import {
  TOWER_KEY, TOWER_ZONE_RADIUS, isTowerId, isTowerMinion,
  triggerLunarApocalypse, onTowerKilled,
  towerBoltTarget, onTowerBoltHit, tickMoonLordCountdown, type LunarHost,
} from '../world/LunarEvent';
import {
  updateTime as dd2UpdateTime, checkProgress as dd2CheckProgress, reportLoss as dd2ReportLoss,
  stopInvasion as dd2StopInvasion, summonCrystalDirect as dd2SummonCrystalDirect,
  wouldFailSpawningHere as dd2WouldFailSpawningHere, requestToSkipWaitTime as dd2RequestToSkipWaitTime,
  spawnMonsterFromGate as dd2SpawnMonsterFromGate, raiseGoblins as dd2RaiseGoblins,
  canRaiseGoblinsHere as dd2CanRaiseGoblinsHere, findArenaHitbox as dd2FindArenaHitbox,
  announceGoblinDeath as dd2AnnounceGoblinDeath, shouldDropCrystals as dd2ShouldDropCrystals,
  summonBetsy as dd2SummonBetsy, shouldBlockBuilding, type OldOnesArmyHost,
} from '../world/OldOnesArmy';
import {
  scanPylons, pylonAnchorAt, mapFocusRect, checkPylonTeleport,
  pylonItemTypeFromStyle, pylonStyleFromFrame, hasPylonOfType,
  type TeleportPylonInfo, type NpcHomeLike,
} from '../world/TeleportPylons';
import { DD2_EVENT_HOOKS, checkArenaScore } from '../entities/bossAI_dd2';
import { golemSpawnFromAltar, eterniaStandBottomRow } from '../world/BossSummonStations';
import shopstockJson from '../data/vanilla-shopstock.json';
import travelshopJson from '../data/vanilla-travelshop.json';
import { TileStore } from '../world/TileStore';
import { Wiring, TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR, TOOL_CUTTER } from '../world/Wiring';
import {
  attachDevices, geyserTrap, switchMB, switchFountain, switchMonolith,
  musicBoxRecordItem, musicBoxDropItemOf, fountainDropItemOf, announcementBoxMessage,
  MUSIC_BOX_EMPTY_VID,
} from '../world/wiring/devices';
import { newPartyState, partyIsUp, toggleManualParty, partyCheckNight, partyWorldClear, type PartyState } from '../world/wiring/party';
import { LanternNight } from '../world/LanternNight';
import type { SaveData } from '../save/serialize';
import { placePortal as placePortalAt, portalRegistry, clearPortals, type Portal } from '../entities/Portal';
import {
  rollExtractinatorDrop, extractinatorMode, extractinatorUseTime, mathRand,
  CHLOROPHYTE_TRADES, COIN_KEY_BY_VID, findExtractinatorChest,
  extractinatorConsumeFromChest, type ExtractDrop,
} from '../world/Extractinator';
import { ITEM_MAP } from '../wld/WldImport';
import { TILE_DEFS, T, TILE_BY_KEY } from '../data/tiles';
import { furnitureStyleBase } from '../world/FurnitureStyle';
import {
  FURNITURE_TILE_KIND, furnitureAnchor, furniturePlaceSingle, furniturePopSingle,
  furnitureTryBreak, furnitureTakeFirst, dollPlace, hatRackPlace, removeFurnitureAt,
  furnitureSlotCount, fitsFurniture, type FurnitureKind,
} from '../world/FurnitureItems';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { vanillaNpc, TOWN_NPC_IDS, getGemSquirrelToSpawn, getGemBunnyToSpawn } from '../data/vanillaNpcs';
import { itemCombat, AMMO_ARROW, combatWeapon, thrownCombat, viIdFromKey, projGravity, rangedAmmoWeapon, type CombatWeapon } from '../data/vanillaItemCombat';
import { itemFuncOfVid, itemFuncOfInternal } from '../data/vanillaItemFunc';
import { dropsAllItemsOnDeath, dropsCoinsOnDeath } from '../player/Appearance';
/** 原版 buff id → BuffType 反查（vi_ 药水桥接用；BUFF_DEFS.vanillaBuff 与原版编号一致） */
const BUFF_BY_VANILLA = new Map<number, BuffType>();
for (const [bt, d] of Object.entries(BUFF_DEFS)) BUFF_BY_VANILLA.set(d.vanillaBuff, Number(bt) as BuffType);
import { projectileData } from '../data/vanillaProjectiles';
import { VanillaSpawner, MOON_BOSS_IDS, type LunarSpawnCtx } from '../world/spawn/VanillaSpawner';
import { ENEMY_DEFS } from '../data/enemies';
import { RECIPES } from '../data/recipes';
import { availableRecipes, consumeMaterials, vanillaItemKey as recipeItemKey, type VanillaRecipeLike } from '../data/vanillaRecipes';
import { rollablePrefixes, rollPrefix, prefixStat } from '../data/vanillaPrefixes';
import vanillaValueJson from '../data/vanilla-itemvalue.json';
const ITEM_VALUE = vanillaValueJson as Record<string, number>;
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { scanScene, EMPTY_SCENE, type SceneFlags } from '../world/SceneMetrics';
import { scanLuckScene, rollLuck } from '../stats/Luck';
import { pickMusic, newMusicState, bossMusicFor, MUSIC, type MusicState } from '../data/Music';
import { Tombstone } from '../entities/Tombstone';
import { Lang } from '../i18n/Lang';
import { clearPaperDollCache } from '../player/PaperDoll';
import { portraitUrl } from '../data/npcPortraits';
import { tileRunner } from '../world/gen/vanilla/TileRunner';
import { growGemTree } from '../world/gen/vanilla/TreePass';
import { lastGenState } from '../world/gen/WorldGen';
import { spawnEmote, tickEmotes } from '../render/EmoteBubble';
import { createDeathText } from '../i18n/RandomText';
import { Critter } from '../entities/Critter';
import { HealProj } from '../entities/HealProj';
/** 血月腐化变换表（AttemptToConvertNPCToEvil :93122-93149：[腐化, 猩红]）——
 *  兔 46/企鹅 303/海鸥 337/蚱蜢? 443/鼠 540 → 47/464；金鱼族 55/230/592/593 → 57/465；
 *  松鼠 148/149 → 168/470 */
const BLOOD_MOON_EVIL = new Map<number, readonly [number, number]>([
  [46, [47, 464]], [303, [47, 464]], [337, [47, 464]], [443, [47, 464]], [540, [47, 464]],
  [55, [57, 465]], [230, [57, 465]], [592, [57, 465]], [593, [57, 465]],
  [148, [168, 470]], [149, [168, 470]],
]);
import { CRITTER_DEFS } from '../data/critters';
import { EntityManager, Entity } from '../entities/Entity';
import { Camera } from '../render/Camera';
import { countsAsACritter, isNpcValidForBestiaryKillCredit, bestiaryEntries, bestiaryCreditId } from '../data/Bestiary';

// F10 瞬移落脚搜索参数(角色 20×42 ≈ 2 宽×3 高净空 + 脚下实心)
const TELEPORT_FIT_W = 2, TELEPORT_FIT_H = 3, TELEPORT_RING_MAX = 60;
import { ChunkCache } from '../render/ChunkCache';
import { Renderer, Particle, DamageNumber, Minimap } from '../render/Renderer';
import { LightingEngine } from '../lighting/LightingEngine';
import { updateLightDecay } from '../lighting/lightTables';
import { Inventory, INV_SIZE, ACC_ARMOR_START } from '../items/Inventory';

// 导入的原版树族 tile（fellImportedTree 整棵砍伐）：普通树 + 宝石树 + 装饰树 + 灰烬树
const IMPORTED_TREE_TYPES = new Set<number>(
  ['v_5_trees',
    'v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree',
    'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree',
    'v_596_vanity_tree_sakura', 'v_616_vanity_tree_yellow_willow', 'v_634_ash_tree',
    'v_72_mushroom_tree', 'v_323_palm_trees']
    .map((k) => TILE_BY_KEY[k])
    .filter((v): v is number => v !== undefined),
);
import { LiquidSim } from '../world/liquid/LiquidSim';
import { WorldEvolution } from '../world/evolution/WorldEvolution';
import { settleWorldLiquids } from '../world/liquid/settle';
import { WorldGenClient, WorldGenUnavailable } from '../workers/WorldGenClient';
import { ClientNet, RemotePlayerState, type NpcSnap, type ProjSnap, type ItemOpMsg } from '../net/ClientNet';
import { entityNet, makeNetId, netIdLocal } from '../net/entitySyncHooks';
import { BuffType, BUFF_DEFS } from '../stats/Buffs';
import { options } from './Options';
import { SmartCursor, smartCursorArrowAllowed, type SmartCursorSettings } from '../player/SmartCursor';
import { SmartSelect, wetCollision, smartSelectSlotOf, EMPTY_SLOT, type SmartSelectEnv, type SmartSelectHost, type SmartSelectSlot } from '../player/SmartSelect';
import { VUI } from '../vui/VUI';
import { SpriteAtlas, VANILLA_ITEM_ICON_MAP, atlasIconForKey } from '../assets/SpriteAtlas';
import { AutoTiler } from '../render/AutoTiler';
import { VanillaWallTiler } from '../render/VanillaWallTiler';
import { windSway } from '../render/WindSway';
import { natureParticles } from '../render/NatureParticles';
import { TILE_PARTICLE_RULES } from '../render/TileParticles';
import { Sfx, SfxName } from './Sfx';
import { HitTile } from './HitTile';
import type { GameHooks } from '../entities/types';
import { Dart } from '../entities/Dart';
import { TrapShot, TowerBolt } from '../entities/Dart';
import type { TrapShotKind } from '../entities/Dart';
import { Arrow } from '../entities/Arrow';
import { hitPlayer, statusPlayer } from '../entities/projTargets';
import { DukeSharknadoBolt, DukeSharknadoTornado, MLDeathray } from '../entities/bossAI_duke_moonlord';
import { LunarOrb } from '../entities/bossAI_lunar_misc';
import { Boomerang, SpearProj, YoyoProj, GrenadeProj, GlowstickProj, TorchGodProj, PowderProj } from '../entities/WeaponProj';
import { MinionProj } from '../entities/MinionProj';
import { WhipProj } from '../entities/WhipProj';
import { Bobber } from '../entities/Bobber';
import { GolfBall, GOLF_CLUBS, golfShot, golfBallInStance } from '../entities/GolfBall';
import { Minecart, CART_TEXTURES, DEFAULT_CART_TEXTURE } from '../entities/Minecart';
import { getOnTrack, frameTrack, frameTrackArea, placeTrack, trackItemId, TRACK_SHEET } from '../world/MinecartTrack';
import { canHitLine } from '../physics/LineOfSight';
import { FallingBlock } from '../entities/FallingBlock';
import { MagicProj } from '../entities/MagicProj';
import type { DropExtras } from '../drops/NpcDrops';

const FIXED_DT = 1 / 60;
/** 原版 AmmoID.Bullet（与 AMMO_ARROW=40 同源，AmmoID.cs） */
const AMMO_BULLET = 14;

/** 枪族专属 UseSound 武器（Item.cs SetDefaults）：
 *  Item_36 霰弹枪族（Shotgun 534 / Boomstick 964 / OnyxBlaster 3788 / QuadBarrel 4703）；
 *  Item_41 手枪族（Handgun 164 / PhoenixBlaster 219 / VenusMagnum 1255 / ChainGun 1929 /
 *  Revolver 2269 / Gatligator 2270）。其余枪械走 Item_11 通用枪声 */
const GUN_SHOTGUN_VIDS = new Set([534, 964, 3788, 4703]);
const GUN_HANDGUN_VIDS = new Set([164, 219, 1255, 1929, 2269, 2270]);

/** 粉末族物品 → 弹体（ItemID.cs: PurificationPowder 66 → ProjectileID 10 / VilePowder 67
 *  → 11 / ViciousPowder 2886 → 463；Item.cs SetDefaults shoot）。注：其余 shoot=10 的
 *  物品（96/98/434 等）弹体不是粉末云语义，不在此表——按物品 id 精确门禁 */
const POWDER_PROJ_BY_ITEM: Record<number, number> = { 66: 10, 67: 11, 2886: 463 };

/** legacy（无 vid）物品的原版 useStyle 补表——Boss 召唤物与生命水晶在
 *  Item.cs SetDefaults 均为 4（举过头）：544/556/557 机械三王、560 史莱姆王冠、
 *  70 蠕虫食物、1331 血腥脊椎、29 生命水晶、88 可疑眼球 */
const LEGACY_USE_STYLE: Record<string, number> = {
  suspicious_eye: 4, worm_food: 4, bloody_spine: 4, slime_crown: 4,
  mechanical_worm: 4, mechanical_eye: 4, mechanical_skull: 4, life_crystal: 4,
};

/** 旅行商人动态商店池（Chest.SetupTravelShop_GetItem/GetPainting 提取，tools/extract-travelshop.mjs） */
const TRAVEL_POOL = travelshopJson as {
  items: Array<{ id: number; tier: number; cond: string | null }>;
  paintings: Array<{ id: number; tier: number; cond: string | null }>;
};
/** 物品 value 表（vanilla-shopstock.json 附带；旅行商定价用） */
const ITEM_VALUES = (shopstockJson as { values: Record<string, number> }).values;

/** 旅行商人稀有度降档（Chest.SetupTravelShop_AdjustSlotRarities :919-947 1:1）：
 *  逐槽阈值递减（高槽先降），当次尝试数超阈值且槽位 >1 才降 1。原版首件环与
 *  末件画环共用同一 rarity 数组（同引用）→ 降档跨环持久 */
export function travelAdjustSlotRarities(rarity: number[], slotItemAttempts: number): void {
  if (rarity[5] > 1 && slotItemAttempts > 4700) rarity[5] = 1;
  if (rarity[4] > 1 && slotItemAttempts > 4600) rarity[4] = 1;
  if (rarity[3] > 1 && slotItemAttempts > 4500) rarity[3] = 1;
  if (rarity[2] > 1 && slotItemAttempts > 4400) rarity[2] = 1;
  if (rarity[1] > 1 && slotItemAttempts > 4300) rarity[1] = 1;
  if (rarity[0] > 1 && slotItemAttempts > 4200) rarity[0] = 1;
}

/** 树苗扫描切片计划（growSaplings 消费）。原版 WorldGen.UpdateWorld 每 tick 在全图
 *  均匀采样（地下 (w×h)×1.5e-05 格 :71622-71631；地表 (w×h)×3e-05 格 :71549-71555，
 *  worldUpdateRate=1）——单苗每 tick 被采中概率 = rate×(w×h)/区格数。本仓 300 tick
 *  一轮、按列切片轮转（每轮预算 cellsPerRound 格，K 轮覆盖全图），每苗每轮命中概率
 *  gemP/sapP = K×300×rate×(w×h)/区格数（×590 命中再掷 1/5、20 苗命中掷 1/20），
 *  单 tick 期望 = gemP/(K×300) 与原版逐点相等——数值等价实现（等价推导登记于
 *  growSaplings 函数头），空间上不再限域玩家附近 */
export function saplingScanPlan(wTiles: number, hTiles: number, groundLevel: number,
  round: number, cellsPerRound = 120000, raining = false): {
  K: number; sliceW: number; x0: number; x1: number;
  underY0: number; underY1: number; overY0: number; overY1: number;
  gemP: number; sapP: number;
} {
  // 采样区格数（原版 y 取值域宽度 × w）：地下 j∈[worldSurface-1, h-20)，
  // 地表 j∈[10, worldSurface-1)（WorldGen.cs:71553-71555/:71627-71629）
  const underTiles = Math.max(1, (hTiles - Math.floor(groundLevel) - 19) * wTiles);
  const overTiles = Math.max(1, (Math.floor(groundLevel) - 11) * wTiles);
  // 每列需扫行数（地表带+地下带）→ 每轮列数预算 → K 轮覆盖全图
  const rows = Math.max(1, Math.max(0, Math.floor(groundLevel) - 11)
    + Math.max(0, hTiles - Math.floor(groundLevel) - 19));
  const sliceW = Math.max(1, Math.floor(cellsPerRound / rows));
  const K = Math.max(1, Math.ceil(wTiles / sliceW));
  const slice = round % K;
  const x0 = Math.max(0, slice * sliceW);
  const x1 = Math.min(wTiles, x0 + sliceW);
  return {
    K, sliceW, x0, x1,
    underY0: Math.floor(groundLevel) - 1, underY1: hTiles - 20,   // [gl-1, h-21]
    overY0: 10, overY1: Math.floor(groundLevel) - 1,              // [10, gl-2]
    // 每苗每轮命中概率（K 轮一访 × 300 tick/轮 × 原版单 tick 采样率 × 命中掷骰）
    gemP: Math.min(1, K * 300 * 1.5e-05 * (wTiles * hTiles) / underTiles * 0.2),
    sapP: Math.min(1, K * 300 * 3e-05 * (wTiles * hTiles) / overTiles * (1 / 20)
      * (raining ? 1.5 : 1)),
  };
}

/** Boss netID → 首胜事件 id（NPC.cs:80014-80291 SetEventFlagCleared 实参）：
 *  击败 Boss 除记账外还触发 OnGameEventClearedForTheFirstTime → 次夜灯笼夜预约
 *  （排除集 4 哀木/21 圣诞树/22 圣诞坦克不在本表）。石人双体/双子双体等
 *  多 netID Boss 映射到同一事件 id。 */
const BOSS_GAME_EVENT_BY_NPC: Record<number, number> = {
  50: 11,          // KingSlime
  222: 8,          // QueenBee
  4: 13,           // EyeOfCthulhu（downedBoss1）
  13: 14, 266: 14, // EaterOfWorlds / BrainOfCthulhu（downedBoss2）
  35: 15,          // SkeletronHead（downedBoss3）
  113: 19,         // WallOfFlesh（StartHardmode）
  262: 12,         // Plantera
  245: 6, 246: 6,  // Golem 头/身
  370: 7,          // DukeFishron
  439: 9,          // LunaticCultist
  398: 10,         // MoonLordCore
  657: 24,         // QueenSlime
  636: 23,         // EmpressOfLight
  668: 25,         // Deerclops
  134: 16,         // Destroyer（downedMechBoss1）
  125: 17, 126: 17,// Retinazer / Spazmatism（downedMechBoss2）
  127: 18,         // SkeletronPrime（downedMechBoss3）
};

// ---- 原版 Main.tileCut 可砍集合（Main.cs:7312-7754 全表 38 项，经 vanilla.sheet 反查内部 id） ----
// 挥击范围内命中即 KillTile：杂草/藤蔓/药草芽等直接碎，瓦罐(28)走整罐碎裂+掉落
const TILE_CUT_VANILLA = new Set([
  654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61, 62, 69, 655,
  71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638, 444, 485,
]);
// ---- 原版挖掘表（vanilla sheet id）----
// tileNoFail（Main.cs:7138/7142-7152/7313-7338/7392/7772-8318/9407-9411/9498/10197-10198）：
// 花草/藤蔓/苔藓/蘑菇/雪泥/宝石树芽/回声家具等——原版每击 100 直接破坏
const TILE_NO_FAIL_SHEETS = new Set([
  3, 4, 24, 32, 35, 50, 51, 52, 61, 62, 69, 73, 74, 81, 82, 83, 84, 110, 113, 115, 129,
  162, 165, 184, 185, 186, 187, 192, 201, 205, 227, 233, 254, 324, 330, 331, 332, 333,
  373, 374, 375, 382, 384, 461, 481, 482, 483, 484, 485, 518, 519, 528, 529, 530, 549,
  624, 636, 637, 638, 654, 655, 656, 666, 697, 700, 701, 705, 709,
]);
// tileAxe（Main.cs:7157-7172）：树/仙人掌/棕榈/宝石树/训练假人——斧族专属
const TILE_AXE_SHEETS = new Set([5, 72, 80, 323, 488, 583, 584, 585, 586, 587, 589, 596, 616, 634, 704]);
// 地牢砖族（Main.tileDungeon + 41/43/44 裂纹变体）：除数 /2 + 门槛 100
const TILE_DUNGEON_SHEETS = new Set([41, 43, 44, 481, 482, 483]);
// Main.wallDungeon 墙表（Main.cs:10507-10515：7/8/9/94-99）——KillWall_CheckFailure
// （WorldGen.cs:60436）未败骷髅王时地牢墙不可锤/不可被 TileReplacement 替换
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
// 上表 → 内部 tile id（vanilla.sheet 反查）
const sheetToInternal = (sheet: number): number => {
  const d = TILE_DEFS.find((t) => t?.vanilla?.sheet === sheet);
  return d ? TILE_DEFS.indexOf(d) : -1;
};
const TILE_NO_FAIL = new Set<number>([...TILE_NO_FAIL_SHEETS].map(sheetToInternal).filter((v) => v >= 0));

const TILE_CUT = new Set<number>(
  TILE_DEFS.reduce<number[]>((acc, d, id) => {
    if (d.vanilla && TILE_CUT_VANILLA.has(d.vanilla.sheet)) acc.push(id);
    return acc;
  }, []),
);
const POT_TILE = TILE_BY_KEY['pot'] ?? -1;
/** NPC.MechSpawn 等价组（NPC.cs:7415-7453）：组内任一 type 互计配额 */
const NPC_MECH_GROUPS: ReadonlyArray<readonly number[]> = [
  [74, 297, 298],      // 蛇
  [46, 540, 303, 337], // 骷髅
  [362, 363, 364, 365],// 鸟
  [602, 603], [608, 609], [616, 617],
];
/** 掉落物 → 原版物品 id（vi_NNN 前缀解析；原生 key 走稳定表反查） */
const NATIVE_ITEM_VID: Record<string, number> = {
  coin_copper: 71, coin_silver: 72, coin_gold: 73, coin_platinum: 74,
  gel: 23, torch: 8, lens: 236, stone_block: 3, dirt_block: 2, wood: 9,
  lesser_healing_potion: 28,
};
function dropVanillaId(d: ItemDrop): number {
  return slotVanillaId(d.itemId);
}

/** 内部 item id → 原版 item id（vi_<id>_ 键解析；原生 key 走 NATIVE_ITEM_VID） */
function slotVanillaId(itemId: number): number {
  const key = ITEM_DEFS[itemId]?.key ?? '';
  const vid = viIdFromKey(key);
  if (vid >= 0) return vid;
  return NATIVE_ITEM_VID[key] ?? -1;
}

/** 玩家储物族 tile key → bank 索引（原版 Player.cs:32598+：29→bank / 97→bank2 /
 *  463→bank3 / 491→bank4，chest 槽位约定 -2..-5） */
const BANK_TILES: ReadonlyArray<readonly [string, number]> = [
  ['v_29_piggy_bank', 0], ['v_97_safe', 1], ['v_463_defenders_forge', 2], ['v_491_void_vault', 3],
];

/** 就地剔除 life<=0 的粒子/飘字(保序零分配,2026-08 审计 G9) */
function compactByLife<T extends { life: number }>(list: T[]): void {
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    if (list[r].life > 0) list[w++] = list[r];
  }
  list.length = w;
}

/** 中核/硬核死亡掉落全部物品（Player.DropItems :53398-53470 gemsOnly=false 分支）：
 *  背包+盔甲+染料+杂项装备+杂项染料+三套 Loadout 全部以掉落物形式撒在死亡点
 *  （TryDroppingSingleItem :53480-53496：随机抛射速度由调用方注入），随后发还
 *  铜制起始三件套（:53463-53468 inventory[0]=3507 短剑/[1]=3509 镐/[2]=3506 斧）。
 *  软核/旅程走 gemsOnly=true 只掉宝石（1522-1527/3643）——本仓无背包宝石，近似为不掉。
 *  spawn 回调注入使其可脱离 Game 实例单测（key+stack 逐件回调） */
export function dropInventoryOnDeath(
  inv: import('../items/Inventory').Inventory,
  spawn: (key: string, stack: number) => void,
): void {
  const drop = (slots: Array<{ id: number; stack: number } | null>) => {
    for (const s of slots) {
      if (!s || s.id === 0 || s.stack <= 0) continue;
      // 槽位存的是内部 id → 先查内部表（自定义物品 key 唯一权威）；
      // VANILLA_ITEM_KEY_BY_ID 以 vanilla id 为键，不能反过来用（内部 id 撞号会掉错物品）
      const key = ITEM_DEFS[s.id]?.key ?? VANILLA_ITEM_KEY_BY_ID[s.id];
      if (key) spawn(key, s.stack);
    }
  };
  drop(inv.slots);
  drop(inv.armor);
  drop(inv.dye);
  drop(inv.miscEquips);
  drop(inv.miscDyes);
  for (const l of inv.loadouts) { drop(l.armor); drop(l.dye); }  // EquipmentLoadout.TryDroppingItems
  inv.slots.fill(null);
  inv.armor.fill(null);
  inv.dye.fill(null);
  inv.miscEquips.fill(null);
  inv.miscDyes.fill(null);
  for (const l of inv.loadouts) { l.armor.fill(null); l.dye.fill(null); }
  // 发还铜制起始三件套（原版 1:1 顺序：[0]短剑 3507 / [1]镐 3509 / [2]斧 3506）
  const starter = [VANILLA_ITEM_KEY_BY_ID[3507] ?? 'copper_sword',
    VANILLA_ITEM_KEY_BY_ID[3509] ?? 'copper_pickaxe', VANILLA_ITEM_KEY_BY_ID[3506] ?? 'copper_axe'];
  starter.forEach((key, i) => {
    const id = ITEM_BY_KEY[key];
    if (id !== undefined) inv.slots[i] = { id, stack: 1 };
  });
}

export interface GameCallbacks {
  onWorldReady: () => void;
  onInventoryChanged: () => void;
  onToast: (msg: string) => void;
  /** 原版 Main.NewText 消息列(Main.cs:64095 → LegacyChatMonitor;RGB 0-255) */
  /** width = NewTextMultiline WidthLimit（-1 不限；广播盒 460） */
  onChat?: (text: string, r: number, g: number, b: number, width?: number) => void;
  /** NPC 对话框(SetTalkNPC):name/chat/buttons → UI 渲染 */
  onNpcDialog?: (name: string, chat: string, buttons: Array<{ id: 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'close'; label: string }>, portrait?: string | null) => void;
  onNpcDialogClose?: () => void;
  /** 哥布林重铸界面（Main.InReforgeMenu） */
  onReforgeOpen?: () => void;
  /** 商店面板(SetupShop):条目(图标由 UI 按原版 id 补)+ 当前铜币 */
  onNpcShop?: (title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number }>, copper: number) => void;
  onBuffsChanged?: () => void;
  /** 读墓碑/告示牌（Sign 阅读界面） */
  onReadSign?: (text: string) => void;
  /** 广播盒右键（Player.cs:32231-32250 OpenSign）：开文本编辑面板（锚点+现文本） */
  onEditSign?: (x: number, y: number, text: string) => void;
  onDayNight?: (isDay: boolean) => void;
  /** 环境选曲变化（MusicID；0=静音）。原版 UpdateAudio_DecideOnNewMusic 驱动 */
  onMusic?: (musicId: number) => void;
  /** 硬核角色死亡消亡（Player.cs:38255 HardcoreDeathPenalty）：外观已标 hardcoreDead，
   *  由流程层回写 CharacterStore 持久化（原版 KillMeForGood :38173+ 直接删 .plr 档） */
  onHardcoreDeath?: (appearance: import('../player/Appearance').Appearance) => void;
}

/** Main.time 口径（Main.cs 昼夜计时）：黎明 4:30（timeOfDay 0.25）归零，
 *  白天 54000 ticks、夜晚 32400 ticks。WorldGen.IsAlchemyPlantHarvestable（:66214）用。 */
function vanillaMainTime(timeOfDay: number): number {
  // timeOfDay↔Main.time：tick 恒速 86400t/周期 → 昼 (t-DAWN)*86400 / 夜 (t-DUSK mod 1)*86400
  if (timeOfDay >= Clock.DAWN && timeOfDay < Clock.DUSK) return (timeOfDay - Clock.DAWN) * 86400;
  return (((timeOfDay - Clock.DUSK) % 1) + 1) % 1 * 86400;
}

export class Game implements GameHooks {
  assets: AssetBundle;
  atlas: SpriteAtlas | null = null;
  autotiler: AutoTiler | null = null;
  world!: World;
  player!: Player;
  camera!: Camera;
  renderer: Renderer;
  chunks!: ChunkCache;
  lighting!: LightingEngine;
  liquid!: LiquidSim;
  /** 世界运行时演化（WorldGen.UpdateWorld 移植）：草蔓延/藤蔓/药草/邪恶扩散 */
  evolution!: WorldEvolution;
  /** Torch God 彩蛋事件（Player.cs:17585-17770）：>100 根点燃火把地下触发 */
  torchGod!: TorchGodEvent;
  /** 黑暗视野（buff 80 Blackout）：updateLightDecay ×0.85 */
  blackout = false;
  entities = new EntityManager();
  input: Input;
  cb: GameCallbacks;
  sfx = new Sfx();

  running = false;
  paused = false;
  private acc = 0;
  private lastTime = 0;
  /** 最近 60 个 rAF 帧间隔（ms）——F5 调试报告 fps 的唯一数据源 */
  private frameDts: number[] = [];
  /** 上一 tick 的 clock.timeOfDay（昼夜跨越检测） */
  private _lastClockT = 0.3;
  private _prevRightDown = false;
  /** 入侵周期公告倒计时（原版 Main.invasionWarn，3600 帧一轮；不存档） */
  private invasionWarn = 0;
  /** 月事件 wave≥15 胜利后的当日强制季节（原版 Main.forceHalloweenForToday /
   *  forceXMasForToday，运行时不存档；每黎明先清再按事件重设，Main.cs:10833-10846） */
  private forceHalloweenForToday = false;
  private forceXMasForToday = false;
  private tickCount = 0;

  // 挖掘状态
  private mining: { x: number; y: number; progress: number } | null = null;
  /** 当前挖掘目标的硬度缓存（进度归一化用） */
  private hardnessCache = 1;
  /** 原版 HitTile 伤害积累（劈砍/挖掘通用，阈值 100） */
  private hitTiles = new HitTile();
  private lastMineHitTick = -999;
  swing: {
    t: number; dur: number; item: number; dmg?: number; kb?: number;
    /** useStyle 分族（Player.cs:49939 ApplyUseStyle switch）：1 挥砍 / 2 咀嚼 /
     *  3 雨伞 / 4 举过头 / 5 朝鼠标静持 / 6 饮用旋转 / 9 举杯 / 13 短剑突刺 /
     *  14-15 头侧持（不改 bodyFrame）/ 16 静持。缺省 1（Renderer drawUseStyle 路由） */
    useStyle?: number;
    /** useStyle 5/13 的瞄准角（世界系 atan2；Renderer 姿势与 bodyFrame 行档用它） */
    aim?: number;
  } | null = null;
  /** 上一帧鼠标左键状态（非 autoReuse 近战武器需点击沿触发新挥，原版 autoReuse 语义） */
  prevSwingMouse = false;
  private swingHitSet = new Set<number>();
  /** 同一挥击内 tileCut 格只处理一次（与 swingHitSet 同生命周期） */
  private swingTileCutSet = new Set<number>();

  /** 滚动 FPS（最近 60 帧均值；样本不足返回 null）——F5 调试报告 meta/perf 段 */
  get fps(): number | null {
    const n = this.frameDts.length;
    if (n < 2) return null;
    let sum = 0;
    for (const d of this.frameDts) sum += d;
    return sum / n > 0 ? 1000 / (sum / n) : null;
  }

  /** 私有运行时状态一次性打包（F5 调试报告 systems 段；私有字段只从这里出） */
  debugSnapshot() {
    return {
      fps: this.fps,
      frameDtMs: this.frameDts.slice(),
      hitTilesSize: this.hitTiles.size(),
      hitTilesTop: this.hitTiles.dumpTop(10),
      mining: this.mining ? { x: this.mining.x, y: this.mining.y, progress: this.mining.progress } : null,
      swing: this.swing
        ? { t: this.swing.t, dur: this.swing.dur, item: this.swing.item, dmg: this.swing.dmg ?? null, kb: this.swing.kb ?? null, useStyle: this.swing.useStyle ?? null, aim: this.swing.aim ?? null }
        : null,
      invasionWarn: this.invasionWarn,
      tickCount: this.tickCount,
    };
  }

  // 弹药
  particles: Particle[] = [];
  dmgNumbers: DamageNumber[] = [];

  // 敌人生成
  boss: Enemy | null = null;
  /** 本局世界是否新生成(NPC 入驻公告只在新世界播) */
  private freshlyCreated = false;
  /** 原版 Spawner 移植实例（VanillaSpawner.ts） */
  vanillaSpawner: VanillaSpawner | null = null;
  /** 世界生成 worker 客户端（懒建；不可用时 newWorld 走主线程 fallback） */
  private genClient: WorldGenClient | null = null;
  /** 多人联机客户端（netMode==1；单机 null）。docs/multiplayer-design.md §4 */
  net: ClientNet | null = null;
  // ---- v3 房间制保护门禁（集中点，低耦合）：策略存于 net.policy，门禁只在操作入口查询 ----
  /** 破坏保护：单人/房主/未开启保护时放行 */
  netCanEditTile(): boolean {
    return !this.net || this.net.policy.isHost || !this.net.policy.protectTiles;
  }
  /** 物品保护：宝箱取放等受控（自动拾取不门禁——需求明确豁免） */
  netCanChestInteract(): boolean {
    return !this.net || this.net.policy.isHost || !this.net.policy.protectItems;
  }
  /** 门禁拒绝提示（2s 节流防刷屏） */
  private netDenyAt = 0;
  netDeny(msg: string) {
    const now = Date.now();
    if (now - this.netDenyAt > 2000) {
      this.netDenyAt = now;
      this.cb.onToast?.(msg);
    }
    this.input.rightDown = false;
  }
  // ---- 箱子同步（msg31/32，服务器权威） ----
  /** 待开箱（msg31 已发、等回包后自动开面板） */
  private netPendingChest: { x: number; y: number } | null = null;
  /** 已登记箱子差分基准（postUpdate 轮询 → msg32 槽位编辑上报） */
  private netChestWatch: Array<{ chest: ChestData; idx: number; last: Array<{ id: number; stack: number } | null> }> = [];

  /** msg32 回包：登记/更新 world.chests（服务器权威），待开箱自动开面板 */
  private netApplyChest(chestIdx: number, x: number, y: number, items: Array<{ id: number; stack: number } | null>) {
    const w = this.world;
    let chest = w.chests.find((ch) => ch.x === x && ch.y === y);
    if (!chest) {
      chest = { x, y, items: Array(10).fill(null) };
      w.chests.push(chest);
    }
    for (let i = 0; i < items.length; i++) {
      // 稀疏数组：单槽广播只带变更槽，undefined = 未涉及（全量帧才每槽都有值）
      if (items[i] === undefined || i >= chest.items.length) continue;
      chest.items[i] = items[i] ? { ...items[i]! } : null;
    }
    this.net?.chestIndexByPos.set(`${x},${y}`, chestIdx);
    let watch = this.netChestWatch.find((wch) => wch.chest === chest);
    if (!watch) {
      watch = { chest, idx: chestIdx, last: chest.items.map((it) => it ? { ...it } : null) };
      this.netChestWatch.push(watch);
    } else {
      watch.last = chest.items.map((it) => it ? { ...it } : null);
    }
    if (this.netPendingChest && this.netPendingChest.x === x && this.netPendingChest.y === y) {
      this.netPendingChest = null;
      this.tryOpenChest(chest); // 服务器已下发内容 = 通过了 protectItems 门
    }
    this.cb.onInventoryChanged?.(); // 面板打开中时刷新槽位显示
  }

  /** postUpdate 每 15 tick：箱子槽位差分上报（含他人广播回写后的再同步收敛） */
  private netChestPoll() {
    const net = this.net;
    if (!net?.active) return;
    for (const wch of this.netChestWatch) {
      for (let i = 0; i < wch.chest.items.length; i++) {
        const a = wch.chest.items[i], b = wch.last[i];
        if ((a?.id ?? 0) !== (b?.id ?? 0) || (a?.stack ?? 0) !== (b?.stack ?? 0)) {
          net.sendChestSlot(wch.idx, wch.chest.x, wch.chest.y, i, a?.id ?? 0, a?.stack ?? 0);
          wch.last[i] = a ? { ...a } : null;
        }
      }
    }
  }

  // ================= v3 实体同步（房主权威 NPC + 双向掉落/弹幕；msg16/21/23/27/42） =================
  // 模型：房主客户端跑完整模拟（刷怪/AI/掉落，与单人同码），快照经服务器中继；
  // 访客渲染傀儡实体（无本地 AI），打击/拾取经上报由房主权威结算。
  // netId = 拥有者 slot<<24 | 本地实体 id（entitySyncHooks.makeNetId，防跨端撞号）

  private netNpcPuppets = new Map<number, { e: Enemy; seen: number }>();
  private netDropPuppets = new Map<number, { d: ItemDrop; seen: number }>();
  private netProjPuppets = new Map<number, { p: Entity; seen: number }>();
  private netNpcLast = new Map<number, { x: number; y: number; hp: number; t: number }>();
  private netProjLast = new Map<number, { x: number; y: number; t: number }>();
  private netDropSeen = new Map<number, ItemDrop>();

  /** 快照广播轮转游标（review C4：固定遍历序 + >=24 break 会让第 25 个起的实体
   *  永远拿不到快照（入侵/血月 >24 同屏移动怪时后段集体饿死被误清）。游标本轮
   *  断在哪、下轮从哪继续，公平轮转） */
  private netNpcCursor = 0;
  private netProjCursor = 0;

  /** 房主：NPC 快照广播（15Hz，变化驱动 + 2s 兜底；对齐原版 msg23 netUpdate 思想） */
  private netNpcBroadcast() {
    const net = this.net!;
    const snaps: NpcSnap[] = [];
    const list = this.entities.enemies;
    const n = list.length;
    let examined = 0;
    for (; examined < n && snaps.length < 24; examined++) {
      const e = list[(this.netNpcCursor + examined) % n] as Enemy;
      if (e.netPuppet) continue;
      let last = this.netNpcLast.get(e.id);
      if (!last) {
        last = { x: e.x, y: e.y, hp: e.hp, t: this.tickCount };
        this.netNpcLast.set(e.id, last);
      }
      const moved = Math.abs(e.x - last.x) > 0.5 || Math.abs(e.y - last.y) > 0.5 || e.hp !== last.hp;
      if (!moved && this.tickCount - last.t < 120) continue; // 2s 全量兜底
      last.x = e.x; last.y = e.y; last.hp = e.hp; last.t = this.tickCount;
      snaps.push({
        netId: makeNetId(net.mySlot, e.id), key: e.key,
        x: e.x, y: e.y, vx: e.vx, vy: e.vy,
        hp: e.hp, maxHp: e.maxHp, animT: e.animT,
        flags: e.def.boss ? 1 : 0,
      });
    }
    this.netNpcCursor = (this.netNpcCursor + examined) % Math.max(1, n);
    // 清理已消亡敌人的差分基准（游标轮转下无条件跑——成本与主循环同阶）
    {
      const alive = new Set<number>();
      for (const ent of this.entities.enemies) alive.add((ent as Enemy).id);
      for (const id of this.netNpcLast.keys()) if (!alive.has(id)) this.netNpcLast.delete(id);
    }
    net.sendNpcSnapshot(snaps);
  }

  /** 双向：本地弹幕快照（15Hz 变化驱动；kind: 0=Arrow 1=WeaponProj族 2=Dart 3=TrapShot
   *  4=MagicProj；v6 增 5=DukeSharknadoBolt 6=龙卷 7=MLDeathray 8=LunarOrb——见 netMakeProj） */
  private netProjBroadcast() {
    const net = this.net!;
    const snaps: ProjSnap[] = [];
    const list = this.entities.projectiles;
    const n = list.length;
    let examined = 0;
    for (; examined < n && snaps.length < 24; examined++) {
      const p = list[(this.netProjCursor + examined) % n] as Entity & { projId?: number; damage?: number; kind?: string; color?: string; life?: number };
      if (p.netPuppet || p.dead) continue;
      let last = this.netProjLast.get(p.id);
      if (!last) {
        last = { x: p.x, y: p.y, t: this.tickCount };
        this.netProjLast.set(p.id, last);
      }
      if (Math.abs(p.x - last.x) < 1 && Math.abs(p.y - last.y) < 1 && this.tickCount - last.t < 60) continue;
      last.x = p.x; last.y = p.y; last.t = this.tickCount;
      let kind = -1, tag = '', dmg = Math.max(-32768, Math.min(32767, Math.round(p.damage ?? 0))), aux = 0;
      let exVx: number | undefined, exVy: number | undefined; // v6：meta 通道的角度方向覆写
      if (p instanceof Arrow) {
        kind = 0; tag = String(p.projId ?? 1);
        // v5：敌对弹带 bit7（原版 Projectile.hostile）——访客端据此本地结算 Damage_EVP
        if (p.hostile) kind |= 0x80;
      }
      else if (p instanceof Dart) {
        kind = 2; tag = String(p.projId ?? 0);
        if (p.hostile) kind |= 0x80; // 射击怪弹（!style.friendly）——review F1：此前整族漏覆盖
      }
      else if (p.projId !== undefined) { kind = 1; tag = String(p.projId); }
      else if (p instanceof TrapShot) {
        kind = 3; tag = p.kind ?? 'dart';
        if (p.hostile) kind |= 0x80; // 机关/陷阱弹（环境危害，原版伤所有玩家）
      }
      else if (p.color !== undefined) { kind = 4; tag = p.color; aux = Math.max(0, Math.min(32767, p.life ?? 600)); }
      else if (typeof (p as { netProjMeta?: unknown }).netProjMeta === 'function') {
        // v6：Boss 锚定弹体族（DukeSharknadoBolt/龙卷/MLDeathray/LunarOrb）——
        // 访客重建真类、本地跑确定性 AI（锚=msg23 傀儡，见 netMakeProj case 5-8）
        const m = (p as unknown as { netProjMeta: () => import('../entities/bossAI_duke_moonlord').NetProjMeta }).netProjMeta();
        kind = m.kind; tag = m.tag.slice(0, 32); aux = m.aux; dmg = m.dmg;
        if (m.exVx !== undefined) { exVx = m.exVx; exVy = m.exVy ?? 0; }
      }
      if (kind < 0) continue; // 未知弹幕类不同步（渲染缺类）
      snaps.push({ netId: makeNetId(net.mySlot, p.id), kind, tag, dmg, aux, x: p.x, y: p.y, vx: exVx ?? p.vx, vy: exVy ?? p.vy });
    }
    this.netProjCursor = (this.netProjCursor + examined) % Math.max(1, n);
    // review F9：清理已消亡弹幕的差分基准（对照 NPC 侧——否则 Map 随会话无界增长）。
    // ⑤ msg28：消亡即上报——接收端即时移除傀儡（消幽灵弹 180t 窗口 + 消亡闪烁）
    {
      const alive = new Set<number>();
      for (const ent of this.entities.projectiles) alive.add(ent.id);
      const despawns: number[] = [];
      for (const id of this.netProjLast.keys()) {
        if (!alive.has(id)) {
          this.netProjLast.delete(id);
          despawns.push(makeNetId(net.mySlot, id));
        }
      }
      if (despawns.length) net.sendProjDespawn(despawns);
    }
    net.sendProjectileBatch(snaps);
  }

  /** 双向：本地真掉落诞生上报 + 消失（拾取/寿命）广播——扫描差分 */
  private netDropSweep() {
    const net = this.net!;
    const cur = new Map<number, ItemDrop>();
    for (const ent of this.entities.drops) {
      const d = ent as ItemDrop;
      if (d.netPuppet) continue;
      if (!d.netId) {
        d.netId = makeNetId(net.mySlot, d.id);
        net.sendItemOp(0, d.netId, ITEM_DEFS[d.itemId]?.key ?? '', d.stack, d.x, d.y, d.vx, d.vy);
      }
      cur.set(d.netId, d);
    }
    for (const netId of this.netDropSeen.keys()) {
      if (!cur.has(netId)) net.sendItemOp(1, netId); // 上轮在、本轮没 = 拾取/过期 → take
    }
    this.netDropSeen = cur;
  }

  /** msg23 回包：NPC 傀儡 upsert（首次创建入桶；boss 置 this.boss 供血条） */
  private netApplyNpcSnaps(snaps: NpcSnap[]) {
    for (const s of snaps) {
      let pup = this.netNpcPuppets.get(s.netId);
      if (!pup || pup.e.dead) {
        // v_* 键走 fromVanilla（防御/伤害等权威属性——占位 def 会让 hurt 双端分叉）；
        // 原生键退普通构造
        const vm = s.key.match(/^v_(\d+)$/);
        const e = vm ? Enemy.fromVanilla(parseInt(vm[1], 10), s.x, s.y) : new Enemy(s.key, s.x, s.y);
        if (!e) continue; // review C2：未知 vanillaId（数据表缺口）只丢这一条，勿中止整批（否则同帧其余傀儡饿死被误清）
        e.x = s.x; e.y = s.y; // 快照坐标=左上（Enemy 构造按中心偏移，直接覆写）
        e.netPuppet = true;
        e.netId = s.netId;
        e.hp = s.hp; e.maxHp = s.maxHp;
        this.entities.add(e, 'enemies');
        if (e.def.boss) this.boss = e;
        pup = { e, seen: this.tickCount };
        this.netNpcPuppets.set(s.netId, pup);
      }
      const e = pup.e;
      e.netSnapTo(s.x, s.y); // P3.2：渲染位平滑追踪快照；逻辑位（netAx/netAy）= 最新快照
      e.vx = s.vx; e.vy = s.vy;
      e.hp = s.hp; e.maxHp = s.maxHp;
      e.animT = s.animT;
      if (Math.abs(s.vx) > 0.1) e.facing = Math.sign(s.vx);
      pup.seen = this.tickCount;
    }
  }

  /** msg21 回包：掉落物傀儡 upsert / take 移除（含拥有者本地真掉落被他人拾取） */
  private netApplyItemOp(op: ItemOpMsg) {
    if (op.op === 0) {
      const id = ITEM_BY_KEY[op.key];
      if (id === undefined) return;
      let pup = this.netDropPuppets.get(op.netId);
      if (!pup) {
        const d = new ItemDrop(op.x, op.y, id, Math.max(1, op.stack), op.vx, op.vy);
        d.netPuppet = true;
        d.netId = op.netId;
        this.entities.add(d, 'drops');
        pup = { d, seen: this.tickCount };
        this.netDropPuppets.set(op.netId, pup);
      }
      pup.d.x = op.x; pup.d.y = op.y;
      pup.d.vx = op.vx; pup.d.vy = op.vy;
      pup.seen = this.tickCount;
    } else {
      const pup = this.netDropPuppets.get(op.netId);
      if (pup) {
        pup.d.dead = true;
        this.netDropPuppets.delete(op.netId);
        return;
      }
      // 拥有者的真掉落被他人拾取（访客 take 上报 → 房主在此移除真身）
      for (const ent of this.entities.drops) {
        const d = ent as ItemDrop;
        if (!d.netPuppet && d.netId === op.netId) { d.dead = true; break; }
      }
    }
  }

  /** msg27 回包：弹幕傀儡 upsert（按 kind 重建真类；kind0-4 纯视觉，5-8 本地跑确定性 AI） */
  private netApplyProjSnaps(snaps: ProjSnap[]) {
    for (const s of snaps) {
      let pup = this.netProjPuppets.get(s.netId);
      if (!pup || pup.p.dead) {
        const p = this.netMakeProj(s);
        if (!p) continue;
        p.netPuppet = true;
        p.netId = s.netId;
        this.entities.add(p, 'projectiles');
        pup = { p, seen: this.tickCount };
        this.netProjPuppets.set(s.netId, pup);
      }
      pup.p.netSnapTo(s.x, s.y); // P3.2：插值追踪（弹幕周期短，intervalTicks 默认 4）
      pup.p.vx = s.vx; pup.p.vy = s.vy;
      pup.seen = this.tickCount;
    }
  }

  /** v6：按 netId 找锚定 NPC 傀儡（Boss 锚定弹体的 src/parent；sender slot 取自弹幕 netId 高位） */
  private netFindAnchor(s: ProjSnap, srcId?: number): Enemy | null {
    if (srcId === undefined || srcId <= 0) return null;
    // 终审 L1：乘法而非位运算合成——((slot)<<24)|id 在 slot≥128 溢出 int32 成负数，
    // 与傀儡 netId(r.u32() 正值)永不相等 → v6 锚定全部失效(js-bitwise-int32-traps 同族)
    const anchorNetId = (s.netId >>> 24) * 0x1000000 + (srcId & 0xffffff);
    for (const [, pup] of this.netNpcPuppets) if (pup.e.netId === anchorNetId) return pup.e;
    return null;
  }

  private netMakeProj(s: ProjSnap): Entity | null {
    // v5：bit7 = hostile（原版 Projectile.hostile，kind0/2/3 携带——Arrow 敌弹/Dart 射击怪/
    // TrapShot 机关；服务器剥除非房主置位）——访客端据此本地结算 Damage_EVP（见 netPuppetProjContact）
    const hostile = (s.kind & 0x80) !== 0;
    switch (s.kind & 0x7f) {
      case 0: return new Arrow(s.x, s.y, s.vx, s.vy, s.dmg, 0, parseInt(s.tag, 10) || 1, null, { hostile });
      case 1: return new Boomerang(s.x, s.y, s.vx, s.vy, s.dmg, 0, parseInt(s.tag, 10) || 1); // WeaponProj 族共用 drawProj(projId) 渲染，取代表类重建
      case 2: { const d = new Dart(s.x, s.y, s.vx, s.vy, s.dmg, parseInt(s.tag, 10) || 0); d.hostile = hostile; return d; }
      case 3: { const t = new TrapShot(s.x, s.y, s.vx, s.vy, s.dmg, (s.tag || 'dart') as TrapShotKind); t.hostile = hostile; return t; }
      case 4: return new MagicProj(s.x, s.y, s.vx, s.vy, s.dmg, Math.max(60, s.aux), s.tag || '#8090FF');
      // ---- v6：Boss 锚定弹体——重建真类，本地跑确定性 AI（锚=msg23 傀儡）。
      // 终审 M3：Bolt/Orb 构造函数按**中心**坐标入参，快照是左上角——须换算，
      // 否则访客端整体偏移 (-w/2,-h/2) 且快照不写 x/y 无法自纠 ----
      case 5: return new DukeSharknadoBolt(s.x + 15, s.y + 15, s.vx, s.vy, s.tag[0] === '1', false, null as unknown as Enemy);
      case 6: {
        // 近似收紧②：tag=`${big},${ai1},${ai0}`——中途入视野的龙卷按快照恢复生长态
        const [bigBit, ai1s, ai0s] = s.tag.split(',').map(Number);
        const t = new DukeSharknadoTornado(s.x, s.y, bigBit === 1, null as unknown as Enemy);
        t.netStateSync(ai1s, ai0s, s.x, s.y);
        return t;
      }
      case 7: {
        const [srcId, kindBit] = s.tag.split(',').map(Number);
        const m = new MLDeathray(this.netFindAnchor(s, srcId), kindBit === 0 ? 'head' : 'core',
          Math.atan2(s.vy, s.vx), (s.aux || 0) / 10000, s.dmg, s.x, s.y);
        m.srcNetId = (s.netId >>> 24) * 0x1000000 + ((srcId || 0) & 0xffffff); // 锚未到也不死等（傀儡随后到即接上）
        return m;
      }
      case 8: {
        const [kind, parentId] = s.tag.split(',').map(Number);
        const is574 = kind === 574;
        // Orb 尺寸按 kind（539=18×30 / 574=18×18），中心换算同 M3
        const o = new LunarOrb(this.netFindAnchor(s, parentId), is574 ? 574 : 539, s.vx, s.vy, s.dmg, s.x + 9, s.y + (is574 ? 9 : 15));
        o.parentNetId = (s.netId >>> 24) * 0x1000000 + ((parentId || 0) & 0xffffff);
        return o;
      }
      default: return null;
    }
  }

  /** msg42 回包（房主）：访客打击权威结算——按 netId 找真身应用 hurt（防御减算在此一次） */
  private netApplyStrike(netId: number, rawDmg: number, kbx: number, kby: number) {
    const localId = netIdLocal(netId);
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (e.netPuppet || e.id !== localId) continue;
      e.hurt(rawDmg, kbx, kby, this);
      const dealt = Math.max(1, Math.round(rawDmg - (e.def.defense ?? 0) * 0.5));
      this.addDamageNumber(e.cx, e.y, dealt, false, '#FF7060');
      return;
    }
  }

  /** msg28 回包：弹幕消亡即时移除傀儡（v6——替代纯超时清扫的补刀路径） */
  private netRemoveProjPuppets(ids: number[]) {
    for (const id of ids) {
      const pup = this.netProjPuppets.get(id);
      if (pup) {
        pup.p.dead = true;
        this.netProjPuppets.delete(id);
      }
    }
  }

  /** v6 msg201：SSC 服务器角色档应用（--ssc 房）——覆盖本地角色后重 dump 对齐服务器快照。
   *  语义=原版 ServerSideCharacter：角色进度存服务器、跨设备恢复；信任模型同原版（非反作弊） */
  private netApplySSC(recordJson: string) {
    try {
      const rec = JSON.parse(recordJson) as {
        hp: number; maxHp: number; x: number; y: number;
        inv: Array<{ id: number; stack: number } | null>;
        armor: Array<{ id: number; stack: number } | null>;
        dye: Array<{ id: number; stack: number } | null>;
      };
      const p = this.player;
      if (rec.hp > 0) p.hp = rec.hp;
      if (rec.maxHp >= 100) p.baseMaxHp = rec.maxHp;
      if (Number.isFinite(rec.x) && Number.isFinite(rec.y)) { p.x = rec.x; p.y = rec.y; }
      if (Array.isArray(rec.inv)) p.inv.slots = rec.inv;
      if (Array.isArray(rec.armor)) p.inv.armor = rec.armor;
      if (Array.isArray(rec.dye)) p.inv.dye = rec.dye;
      this.cb.onInventoryChanged?.();
      this.net?.tick(); // 重 dump：服务器累积快照与本端对齐
    } catch { /* 损坏档忽略，保持本地角色 */ }
  }

  /** 傀儡清扫：死亡/超时无快照（掉线房主、宿主清场）→ 移除 */
  private netSweepPuppets() {
    for (const [id, pup] of this.netNpcPuppets) {
      if (pup.e.dead || this.tickCount - pup.seen > 300) {
        pup.e.dead = true;
        if (this.boss === pup.e) this.boss = null;
        this.netNpcPuppets.delete(id);
      }
    }
    for (const [id, pup] of this.netDropPuppets) {
      if (pup.d.dead) {
        // 傀儡消失两源：本地拾取（dead 由 ItemDrop 置位）→ 上报 take 让房主移除真身；
        // 寿命/远端 take → netApplyItemOp 已删映射，不会走到这
        this.net?.sendItemOp(1, id);
        this.netDropPuppets.delete(id);
        continue;
      }
      if (this.tickCount - pup.seen > 300) {
        pup.d.dead = true;
        this.netDropPuppets.delete(id);
      }
    }
    for (const [id, pup] of this.netProjPuppets) {
      if (pup.p.dead || this.tickCount - pup.seen > 180) {
        pup.p.dead = true;
        this.netProjPuppets.delete(id);
      }
    }
  }

  /** 访客：傀儡 NPC 接触伤害（房主 AI 只对房主结算；访客本地判 AABB，HP 客户端权威+msg16 中继）。
   *  P3.2：判定用权威位 netAx/netAy（渲染位在插值途中，最多滞后一个快照周期 66ms） */
  private netPuppetContact() {
    const p = this.player;
    if (p.dead) return;
    for (const [, pup] of this.netNpcPuppets) {
      const e = pup.e;
      if (e.dead || e.iframes > 0) continue;
      const dmg = e.def.damage ?? 0;
      if (dmg <= 0) continue;
      // 手工 AABB（权威位 vs 本地玩家），不经插值渲染位
      if (!(e.netAx < p.x + p.w && e.netAx + e.w > p.x && e.netAy < p.y + p.h && e.netAy + e.h > p.y)) continue;
      this.damagePlayer(dmg, e.cx, e.cy, e);
      e.iframes = 8;
    }
  }

  /** 访客：敌对弹幕傀儡本地结算（原版 Projectile.Damage_EVP，Projectile.cs:13706-13830）。
   *  语义与近战接触伤害同模型：玩家 HP 客户端权威 + msg16 中继（原版玩家伤害即本地
   *  结算——每端各自跑弹幕命中本地玩家判定）。hitPlayer 内含原版门禁链：
   *  hostile + dmg>0 / player.immune(iframes) / AABB 相交；命中【不消耗穿透】
   *  （:13811-13829 特判除外），弹体照常飞行；debuff 授予以实际伤害为准（statusPlayer）。 */
  private netPuppetProjContact() {
    for (const [, pup] of this.netProjPuppets) {
      const pr = pup.p as Entity & { hostile?: boolean; damage?: number; projId?: number };
      if (!pr.hostile || pr.dead) continue;
      // 判定用渲染位（插值+速度外推）而非权威位：原版各端本地模拟，"所见即所中"
      // 才是客户端权威语义；权威位在差分快照间隔内（慢速弹最长 60t）会冻结在过期
      // 位置——review F3 改权威位实测造成慢速敌弹系统性漏判（ax 漂出玩家盒仍判不中）
      if (hitPlayer(pr, this, pr.damage ?? 0)) {
        statusPlayer(this, pr.projId ?? 0);
      }
    }
  }
  /** 远端玩家渲染代理（net.players → drawPlayer 可用形状，net 激活时每帧同步） */
  private remotePlayerProxies: import('../entities/Player').Player[] = [];
  /** tile key → id 反查表（调试句柄/wld 导入映射用） */
  tileByKey = TILE_BY_KEY;

  /** 开发者模式：全部道具入包（溢出的落在展示区上方）+ 出生点右侧摆放所有可放置图块供检验 */
  setupDevMode() {
    const p = this.player;
    const st = this.world.store;
    // ---- 1) 全道具入包 ----
    const overflow: Array<[string, number]> = [];
    for (const def of ITEM_DEFS) {
      const n = def.maxStack === 1 ? 1 : Math.min(def.maxStack, 99);
      const left = p.inv.add(ITEM_BY_KEY[def.key], n);
      if (left > 0) overflow.push([def.key, left]);
    }
    // ---- 2) 展示区：出生点右侧清空并逐行摆放全部可放置图块 ----
    const sx = this.world.spawnX, sy = this.world.spawnY;
    const x0 = sx + 6, x1 = sx + 70, yBot = sy - 2, yTop = sy - 40;
    for (let x = x0; x <= x1; x++) {
      for (let y = yTop; y <= yBot; y++) {
        st.setTile(x, y, 0);
        st.setLiquid(x, y, 0, 0);
      }
      st.setTile(x, yBot, T.STONE);
      st.setTile(x, yBot + 1, T.STONE);
    }
    // 收集可放置 tile（有物品指向，去重）
    const placeable: number[] = [];
    const seen = new Set<number>();
    for (const def of ITEM_DEFS) {
      if (!def.tile) continue;
      const tid = TILE_BY_KEY[def.tile];
      if (tid === undefined || tid === 0 || seen.has(tid)) continue;
      seen.add(tid);
      placeable.push(tid);
    }
    // 逐行摆放：行高 7（最高家具 5 格 + 间隙），每行放满换行并铺新地板
    let cx = x0 + 1, cy = yBot - 1;
    const rowH = 7;
    for (const tid of placeable) {
      const td = TILE_DEFS[tid];
      const w = td.vanilla?.fw ?? td.w ?? 1;
      const h = td.vanilla?.fh ?? td.h ?? 1;
      if (cx + w > x1 - 1) {
        cx = x0 + 1;
        cy -= rowH;
        for (let x = x0; x <= x1; x++) st.setTile(x, cy, T.STONE);
      }
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          // 原版帧语义（TileObject.Place）：顶行 frameY=0，底行最大——
          // 此处 cy 是底部行，dy=0 是底行 → frameY = (h-1-dy)*18
          st.setTile(cx + dx, cy - dy, tid, td.vanilla ? dx * 18 : dx, td.vanilla ? (h - 1 - dy) * 18 : dy);
        }
      }
      cx += w + 1;
    }
    // ---- 3) 溢出道具以掉落物排在展示区上方（背包 40 格装不下的部分） ----
    let dxDrop = x0;
    let dyDrop = yTop + 3;
    for (const [key, n] of overflow) {
      this.spawnDrop(dxDrop * TILE + 8, dyDrop * TILE, key, n, 0, 0);
      dxDrop += 2;
      if (dxDrop > x1 - 1) { dxDrop = x0; dyDrop += 3; }
    }
    this.cb.onInventoryChanged();
    this.cb.onToast(`开发者模式：${overflow.length} 种道具背包装不下，已排在展示区上方；全部可放置图块在出生点右侧`);
  }

  // NPC 系统
  private housingCheckTimer = 0;
  guideSpawned = false;
  private lastWasDay: boolean | null = null;
  /** 环境采样结果（SceneMetrics；BGM/群系背景共用），每 15 tick 刷新 */
  scene: SceneFlags = { ...EMPTY_SCENE };
  private musicState: MusicState = newMusicState();
  /** 派对态（BirthdayParty 精简核：ManualParty；派对纪念碑 455 驱动） */
  private partyState: PartyState = newPartyState();
  private lastMusic = -1;
  private _mapClickLatch = false;
  private _mapClickLatch2 = false;
  /** 地图内按压起点（松开时与当前位置比对 <6px 判定为点击，否则是拖动） */
  private _mapPressX = 0;
  private _mapPressY = 0;
  private _tpTarget: { x: number; y: number } | null = null;
  // ---- 传送晶塔（Player.cs:31707-31747 / TeleportPylonsSystem.cs）----
  /** 已放置晶塔缓存（scanPylons 整表扫——右键晶塔/放置/破坏时刷新；原版
   *  UpdatePylonsListAndBroadcastChanges 每 10s 扫 TileEntity 表的等价） */
  pylons: TeleportPylonInfo[] = [];
  /** 右键晶塔时记下的"当前塔"锚点（原版 Main.MapPylonTile，地图连线起点） */
  mapPylonTile: { x: number; y: number } | null = null;
  private _dd2HooksWired = false;
  // 方块标注模式（F5）：点击标记问题方块，导出标注+地图给开发者定位
  annotateMode = false;
  waterCandleNear = false;
  /** 和平蜡烛光环在場（光环扫描写入；getSpawnRate ×1.3/×0.7，NPC.cs:645） */
  peaceCandleNear = false;
  heldWaterCandle = false;
  trackTile = TILE_BY_KEY['v_314_minecart_track'] ?? 0;
  minecart: import('../entities/Minecart').Minecart | null = null;
  /** 坐骑键（R）边沿锁（上/下车都只吃一次按下） */
  private cartKeyLatch = false;

  /** 物品 → 矿车贴图（矿车族召唤物；含内部占位 minecart_item = vanilla 2343） */
  private cartTextureOfItem(internalId: number): string | null {
    const key = ITEM_DEFS[internalId]?.key ?? '';
    if (key === 'minecart_item') return DEFAULT_CART_TEXTURE;
    const vid = viIdFromKey(key);
    return vid >= 0 ? CART_TEXTURES[vid] ?? null : null;
  }

  /** 上车（TrackHook proj 403 语义：GetOnTrack 吸附 + 落点实心门 :22407）。
   *  返回 false = 落点被实心卡住，上车失败 */
  private mountMinecartAt(tx: number, ty: number, texture: string): boolean {
    if (this.minecart) return false;
    const st = this.world.store;
    const cart = new Minecart();
    cart.texture = texture;
    cart.superCart = this.superCartUnlocked();
    const snap = getOnTrack(st, tx, ty, this.player.x, this.player.y, cart.w, cart.h);
    if (snap) { cart.x = snap.x; cart.y = snap.y; }
    else { cart.x = tx * TILE + 8 - cart.w / 2; cart.y = (ty + 1) * TILE - cart.h; }
    // 落点实心门（Projectile 403：!Collision.SolidCollision(Position, width, height-20)）
    for (let sx = Math.floor(cart.x / TILE); sx <= Math.floor((cart.x + cart.w - 1) / TILE); sx++) {
      for (let sy = Math.floor((cart.y + 20) / TILE); sy <= Math.floor((cart.y + cart.h - 1) / TILE); sy++) {
        if (st.inBounds(sx, sy) && st.isSolid(sx, sy)) return false;
      }
    }
    cart.mounted = true;
    this.entities.add(cart, 'props');
    this.minecart = cart;
    this.player.ridingCart = true;
    this.player.cart = cart;
    // 上车声（DelegateMethods.Minecart.LandingSound = SoundID.Item53）
    this.playSfxFile('Item_53', 0.7, cart.x, cart.y);
    return true;
  }

  /** 下车（Mount.TryDismount：位置保持、坐骑消失——矿车 buff 结束即移除） */
  private dismountMinecart(): void {
    const cart = this.minecart;
    if (!cart) return;
    const p = this.player;
    p.x = cart.x;
    p.y = cart.y;
    p.vx = 0;
    p.vy = 0;
    p.ridingCart = false;
    p.cart = null;
    cart.mounted = false;
    cart.dead = true;
    this.minecart = null;
  }

  /** QuickMinecart（Player.cs:5796-5827）：射程内取视线可达的最近轨道格上车 */
  private tryQuickMinecart(): void {
    if (this.minecart) return;
    const st = this.world.store;
    const p = this.player;
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);
    // TileReachCheckSettings.Simple 同款射程盒（inTileRange 口径：x 5 / y 3 + tileBoost）
    const tb = (p.equipStats.tileRange ? 3 : 0) + (p.buffs.has(BuffType.Builder) ? 1 : 0);
    const rx = Math.min(20, 5) + tb, ry = Math.min(20, 3) + tb;
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let x = ptx - rx; x <= ptx + rx; x++) {
      for (let y = pty - ry; y <= pty + ry; y++) {
        if (!st.inBounds(x, y) || st.type[st.idx(x, y)] !== this.trackTile) continue;
        const wx = x * TILE + 8, wy = y * TILE + 8;
        const d = Math.hypot(wx - p.cx, wy - p.cy);
        if (d < bestD && canHitLine(st, p.cx, p.cy, 0, 0, wx, wy, 0, 0)) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) {
      // 贴图优先级：矿车装备槽（miscEquips[2]）> 手持 > 背包首件（TrackHook 近似）
      const tex = this.bestCartTexture();
      if (tex) this.mountMinecartAt(best.x, best.y, tex);
    }
  }

  /** 玩家可用的矿车贴图（miscEquips[2] 装备矿车 > 手持 > 背包扫描；无矿车返回 null） */
  private bestCartTexture(): string | null {
    const misc = this.player.inv.miscEquips?.[2];
    if (misc) {
      const t = this.cartTextureOfItem(misc.id);
      if (t) return t;
    }
    const held = this.player.inv.heldItem();
    if (held) {
      const t = this.cartTextureOfItem(held.id);
      if (t) return t;
    }
    for (const s of this.player.inv.slots) {
      if (!s) continue;
      const t = this.cartTextureOfItem(s.id);
      if (t) return t;
    }
    return null;
  }

  /** 矿车升级套件解锁态（Player.unlockedSuperCart；持久化于世界 flags） */
  private superCartUnlocked(): boolean {
    return !!(this.world.flags as Record<string, boolean>).superCart;
  }
  trapCooldown = new Map<string, number>();
  plateLatch = new Set<string>();
  /** 压板/测重板每 tick 复用缓冲(2026-08 审计 G9,清零复用) */
  private _platePressed = new Set<string>();
  private _weightedStanding = new Set<number>();
  private _entityPlatePressed = new Set<string>();
  /** 电路系统(Wiring.cs 移植) */
  wiring: Wiring | null = null;
  /** 智能光标（SmartCursorHelper.cs 全量移植；状态机 + 39 策略链） */
  smartCursor = new SmartCursor();
  /** 智能选取（Smart Select，Player.cs:17283-17562 1:1；Shift 按住自动换手持工具/光源） */
  smartSelect = new SmartSelect();
  /** SelectedItemState.Hotbar 镜像（Player.cs:391）：最近一次 0-9 快捷栏选择 */
  private smartSelectHotbar = 0;
  /** Smart Select 槽画像复用缓冲（smartSelectSlots 每帧原地填充） */
  private _smartSelectSlots: SmartSelectSlot[] = Array.from({ length: INV_SIZE }, () => ({ ...EMPTY_SLOT }));
  /** 多彩扳手/宏伟蓝图当前模式(TOOL_* 位组合;R 键循环) */
  wireToolMode = TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW;
  /** 宏伟蓝图拖拽锚点(tile 坐标) */
  grandAnchor: [number, number] | null = null;
  /** 测重板踩踏状态(原版 PressurePlateHelper 进/离双触发) */
  weightedLatch = new Set<number>();
  /** 触发源登记(idx):428 测重板 / 423 感应器 */
  triggerTiles428 = new Set<number>();
  /** 热喷泉 443 登记（原版岩浆流过自动喷发——Main 逐帧扫描上方格；此处 15 tick 采样近似） */
  private geyserTiles = new Set<number>();
  private geyserCd = new Map<number, number>();
  triggerTiles423 = new Set<number>();
  /** 实体踩板去重键(实体id|格):小动物触发压板 + 巨石触发压板/弹幕垫板 */
  private entityPlateLatch = new Set<string>();
  /** F7 强制显示导线 */
  forceShowWires = false;
  // 贴图纠错子模式：点击方块弹出该图块的完整原版贴图表供选帧
  fixTexMode = false;
  // 敌人生成开关（F8）：关闭后不再生成新怪物（已有的不受影响）
  enemySpawnEnabled = true;

  /** F10 调试瞬移:鼠标世界位置落脚(须容纳角色:2 宽×3 高净空 + 脚下实心)。
   *  鼠标点本身不可落脚时,以鼠标点为中心【就近优先】环形 BFS 找最近可落脚点
   *  (悬空落在正下方地面、点进实体送到旁边的地表/洞穴地面——统一按距离最近算)。
   *  相机不硬切:由每帧 camera.follow(0.15 指数缓动)平滑飞过去。 */
  teleportToMouse(): void {
    // 参考坐标 = 鼠标指针落点(不依赖 Input 缓存/相机 viewW 单位语义):
    // 直接用 canvas 的 CSS 矩形 + 相机中心/缩放换算,保证以指针为起点
    const rect = this.renderer.canvas.getBoundingClientRect();
    const sx = (this.input.mouseX || rect.width / 2) - rect.width / 2;
    const sy = (this.input.mouseY || rect.height / 2) - rect.height / 2;
    const z = this.camera.zoom;
    const wx = sx / z + this.camera.x;
    const wy = sy / z + this.camera.y;
    const st = this.world.store;
    // fits(tx, ty):ty = 脚下实心行,其上 3 行 2 列净空(树干等非实心不挡)
    const fits = (tx: number, ty: number): boolean => {
      if (!st.inBounds(tx, ty) || !st.inBounds(tx + TELEPORT_FIT_W - 1, ty - TELEPORT_FIT_H)) return false;
      for (let dx = 0; dx < TELEPORT_FIT_W; dx++) {
        if (!st.isSolid(tx + dx, ty)) return false;
        for (let dy = 1; dy <= TELEPORT_FIT_H; dy++) {
          if (st.isActive(tx + dx, ty - dy)) return false;
        }
      }
      return true;
    };
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    let land: [number, number] | null = fits(tx, ty) ? [tx, ty] : null;
    // 环形 BFS(Chebyshev 距离逐环外扩):第 r 环上的全部格按"上边→下边→左边→右边"
    // 顺序找,保证命中的是距鼠标最近的落脚点(同环内顺序只影响并列情形)
    outer: for (let r = 1; r <= TELEPORT_RING_MAX && !land; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dy of [-r, r]) {
          if (fits(tx + dx, ty + dy)) { land = [tx + dx, ty + dy]; break outer; }
        }
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        for (const dx of [-r, r]) {
          if (fits(tx + dx, ty + dy)) { land = [tx + dx, ty + dy]; break outer; }
        }
      }
    }
    if (!land) {
      this.cb.onToast?.('瞬移失败:附近没有可落脚点');
      return;
    }
    const p = this.player;
    p.x = land[0] * TILE;                    // 盒左对齐脚下格
    p.y = land[1] * TILE - p.h;              // 盒底贴【脚下格顶面】(land 行是实心地面,
                                              // 其顶 = land*TILE;曾多减一格 → 卡半身)
    p.vx = 0; p.vy = 0;
    p.netOffX = 0; p.netOffY = 0;            // 清联机平滑偏移(本地瞬移不插值)
    p.clearFall?.();                         // 清坠落起点:瞬移不结算摔伤
    // 相机交给每帧 camera.follow 缓动飞过去(不硬切)
    this.lighting.liquidDirty = true;
    const liq = st.liquid[st.idx(land[0], land[1] - 1)];
    this.cb.onToast?.(liq > 0 && st.liquidType[st.idx(land[0], land[1] - 1)] === 2
      ? `已瞬移至 (${land[0]}, ${land[1]})——脚下是岩浆!` : `已瞬移至 (${land[0]}, ${land[1]})`);
  }
  marks: Array<{ x: number; y: number }> = [];
  private _annoLatch = false;

  constructor(root: HTMLElement, cb: GameCallbacks, atlas?: SpriteAtlas | null) {
    this.assets = buildAssets();
    if (atlas) {
      this.atlas = atlas;
      this.autotiler = new AutoTiler(atlas);
    }
    this.renderer = new Renderer(this.assets, atlas);
    this.renderer.attach(root);
    // 音效按需加载（2026-08-10）：不在此预读——播放未命中时后台 fetch+decode、
    // 首播合成兜底；常用战斗/交互声在世界就绪后小集合预热（见 afterWorldLoad），
    // 怪物专属声效随首次受击懒加载
    this.input = new Input(this.renderer.canvas);
    this.cb = cb;
    // 快捷栏数字键：事件驱动（避免单帧内 down+up 被轮询漏掉）
    this.input.keydownHandlers.push((code) => {
      if (this.player && /^Digit[0-9]$/.test(code)) {
        this.player.inv.selected = code === 'Digit0' ? 9 : Number(code.slice(5)) - 1;
        this.cb.onInventoryChanged();
      }
      // 缩放调节
      if (code === 'Equal' || code === 'NumpadAdd') this.setZoom(this.camera?.zoomTarget + 0.15);
      if (code === 'Minus' || code === 'NumpadSubtract') this.setZoom(this.camera?.zoomTarget - 0.15);
      // F2:图片 → 像素方块群导入(自研创意工具,原版无;Input 已 preventDefault)。
      // 原 F11 与系统/浏览器全屏冲突,2026-08-12 改 F2
      if (code === 'F2') this.openPixelArtImport();
      // T:旅程模式时间倍率循环（CreativePowers.ModifyTimeRate.TargetTimeRate 1-24×，
      // CreativePowers.cs:866-884；Main.cs:6278 UpdateTimeRate 消费）——仅旅程世界可用，
      // 原版为时间菜单滑杆，此处取最小实现：按键循环常用档 + toast
      if (code === 'KeyT' && this.world?.isJourney) {
        const rates = [1, 2, 4, 8, 16, 24];
        const cur = rates.indexOf(this.world.journeyTimeRate);
        this.world.journeyTimeRate = rates[(cur + 1) % rates.length];
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.JourneyTimeRate', String(this.world.journeyTimeRate)));
      }
      // R:五彩扳手/宏伟蓝图模式循环(红蓝绿黄→剪线→致动器→剪致动器)
      if (code === 'KeyR') {
        const held = this.player?.inv.heldItem();
        if (held && ITEM_DEFS[held.id]?.wireTool && (ITEM_DEFS[held.id]?.key === 'multicolor_wrench' || ITEM_DEFS[held.id]?.key === 'grand_design')) {
          const modes = [
            [TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW],
            [TOOL_CUTTER, TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW],
            [TOOL_ACTUATOR],
            [TOOL_CUTTER, TOOL_ACTUATOR],
          ];
          const cur = modes.findIndex((m) => m.reduce((a, b) => a | b, 0) === this.wireToolMode);
          const next = modes[(cur + 1) % modes.length].reduce((a, b) => a | b, 0);
          this.wireToolMode = next;
          const name = next & TOOL_CUTTER
            ? (next & TOOL_ACTUATOR ? Lang.text('Mods.SandboxWorld.Wire.CutActuator') : Lang.text('Mods.SandboxWorld.Wire.Cut'))
            : next & TOOL_ACTUATOR ? Lang.text('Mods.SandboxWorld.Wire.Actuator') : Lang.text('Mods.SandboxWorld.Wire.All');
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Wire.ToolMode', name));
        }
      }
    });
  }

  // ================= 生命周期 =================

  async newWorld(seedText: string, width: number, height: number, onProgress?: (label: string, p: number) => void, opts?: { name?: string; evil?: -1 | 0 | 1; /** 世界难度 = Main.GameMode（Main.cs:2677：0 经典 1 专家 2 大师 3 旅程） */ difficulty?: number; onWorldPartial?: (world: import('../world/World').World, passIndex: number, passName: string) => void; /** worker 路径的降采样预览帧回调（位图模式） */ onPreview?: (f: import('../workers/WorldGenClient').PreviewFrame) => void }) {
    this.freshlyCreated = true; // NPC 入驻公告只在新生成的世界播(WorldGen 语义)
    const settleLabel = () => Lang.text('Mods.SandboxWorld.Progress.SettleLiquids');
    // 世界难度（Main.GameMode，Main.cs:2677）：worker/主线程两路生成完成后统一灌入——
    // worker GenConfig 不带此字段，fromPacket 回 0，此处覆盖（创建 UI 已选档）
    const applyDifficulty = () => { if (opts?.difficulty !== undefined) this.world.difficulty = opts.difficulty; };
    // ---- worker 路径（generate + settle 一条链在后台完成，UI 全程不卡） ----
    if (!this.genClient) this.genClient = new WorldGenClient();
    if (await this.genClient.probe()) {
      try {
        this.world = await this.genClient.generate(
          { width, height, seedText, name: opts?.name, evil: opts?.evil, preview: !!opts?.onPreview },
          {
            onPreview: opts?.onPreview,
            // 进度区间映射与主线程路径一致：generate 0–0.7、settle 0.72–0.87
            onProgress: (phase, label, p) => {
              if (phase === 'generate') onProgress?.(label, p * 0.7);
              else onProgress?.(settleLabel(), 0.72 + p * 0.15);
            },
          },
        );
        await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.87 + p * 0.13));
        onProgress?.(Lang.text('Mods.SandboxWorld.Progress.Done'), 1);
        applyDifficulty();
        this.afterWorldLoad();
        this.cb.onWorldReady();
        return;
      } catch (e) {
        if (!(e instanceof WorldGenUnavailable)) throw e; // 真实业务错误（如 OOM）不吞
        // worker 失败 → 落回主线程路径
      }
    }
    // ---- 主线程 fallback（原路径原样保留：worker 不可用 + 探针依赖） ----
    this.world = await generateWorld({ width, height, seedText, name: opts?.name, evil: opts?.evil, onWorldPartial: opts?.onWorldPartial }, (label, p) => onProgress?.(label, p * 0.7));
    // 水体预沉降：创建世界时全图激活+步进至稳定，带进度条
    onProgress?.(settleLabel(), 0.72);
    await this.settleLiquids((p) => onProgress?.(settleLabel(), 0.72 + p * 0.15));
    // 进图前贴图预载(用户要求:不进图后才动态加载)
    await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.87 + p * 0.13));
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.Done'), 1);
    applyDifficulty();
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  /** 进图前统一预载:onWorldReady 之前把首帧画面涉及的贴图全部就位。
   *  图块/墙表按【出生点区域类型扫描】精确预载(半径 240 实测仅 22/378 张表,
   *  而非全量 ~250MB)——远行遇到的类型走懒加载,onVImageLoaded 回调全量标脏
   *  chunk 自动重烘焙;物品图标全量(18MB);角色 = Player_ 全量 + 当前装备的
   *  3 张 Armor 表(换装走懒加载);出生点森林背景 */
  private async preloadSceneAssets(onProgress?: (label: string, p: number) => void): Promise<void> {
    const a = this.atlas;
    if (!a) return;
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadWorldTex'), 0.05);
    // 出生点半径类型扫描:只预载画面涉及的图块/墙表
    const st = this.world.store;
    const { tileSheets, wallIds } = this.collectSheetsAround(this.world.spawnX, this.world.spawnY, 240);
    await Promise.all([
      a.preloadTileSheetsFor(tileSheets, wallIds),
      a.preloadMiscAndNpcs(),
    ]);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadItemIcons'), 0.15);
    // 物品图标（6059 张/24MB）改为后台补齐——不再阻塞进图：渲染/道具栏走
    // vicon→ensureVImage 懒加载（未就绪回退程序化图标，paintSlot 每次刷新自愈升级）；
    // 补齐完成后触发一次背包刷新，把兜底图标原地替换为原版图标
    void a.preloadIcons().then(() => this.cb.onInventoryChanged?.());
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadCharTex'), 0.7);
    // Player_ 全量(纸娃娃全部身体通道) + 仅当前装备的 Armor 表;
    // 换装时 vui 懒加载 + PaperDoll 就绪预检自动兜住
    const armorFiles = new Set<string>();
    for (const id of this.playerPreviewArmor()) {
      if (id == null) continue;
      const def = ITEM_DEFS[id];
      if (!def) continue;
      const vid = VANILLA_ITEM_ICON_MAP[def.key] ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : NaN);
      const entry = Number.isFinite(vid) ? a.vanilla.armorIndex?.[String(vid)] : null;
      if (!entry) continue;
      if (entry.head) armorFiles.add(`Armor_Head_${entry.head}.png`);
      if (entry.body) armorFiles.add(`Armor_Armor_${entry.body}.png`);
      if (entry.legs) armorFiles.add(`Armor_Legs_${entry.legs}.png`);
    }
    await a.preloadUiPrefix(['Player_']);
    await a.preloadUiFiles(armorFiles);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadBg'), 0.9);
    await this.renderer.biomeBg.preloadInitial(this.world);
    onProgress?.(Lang.text('Mods.SandboxWorld.Progress.LoadBg'), 1);
  }

  /** 区域类型扫描:中心 ±R 内出现的图块 sheet id + 墙 id 集合(出生点预载/传送门共用) */
  private collectSheetsAround(cx: number, cy: number, R: number): { tileSheets: Set<number>; wallIds: Set<number> } {
    const st = this.world.store;
    const tileSheets = new Set<number>();
    const wallIds = new Set<number>();
    for (let x = Math.max(0, cx - R); x < Math.min(st.w, cx + R); x++) {
      for (let y = Math.max(0, cy - R); y < Math.min(st.h, cy + R); y++) {
        const i = st.idx(x, y);
        if (st.flags[i]) {
          const vs = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
          if (vs !== undefined) tileSheets.add(vs);
        }
        if (st.wall[i] > 0) wallIds.add(st.wall[i]);
      }
    }
    // 兜底常驻:草/泥/石表全时有(暴露地表转草、autotile 邻接)
    for (const k of ['dirt', 'stone', 'grass']) {
      const vs = TILE_DEFS[TILE_BY_KEY[k]]?.vanilla?.sheet;
      if (vs !== undefined) tileSheets.add(vs);
    }
    return { tileSheets, wallIds };
  }

  /** 预载期的装备槽位(此时 player 尚未创建,读初始装备常量:afterWorldLoad 同源) */
  private playerPreviewArmor(): Array<number | null> {
    // 与 afterWorldLoad 初始装备一致:铁三件(头/胸/腿)
    const ids: Array<number | null> = [null, null, null];
    const order = ['iron_helmet', 'iron_chainmail', 'iron_greaves'];
    for (let k = 0; k < 3; k++) {
      const id = ITEM_BY_KEY[order[k]];
      ids[k] = id !== undefined ? id : null;
    }
    return ids;
  }

  /** 全图液体沉降（薄封装 → settleWorldLiquids，主线程 fallback 与 worker 共用同一实现）。
   *  mode 语义见 src/world/liquid/settle.ts 头注释 */
  private settleLiquids(onProgress?: (p: number) => void, mode: 'gen' | 'load' = 'gen') {
    return settleWorldLiquids(this.world, mode, onProgress);
  }

  async loadWorld(world: World, onProgress?: (label: string, p: number) => void, opts?: { settled?: boolean }) {
    this.freshlyCreated = false;
    this.world = world;
    if (!opts?.settled) {
      onProgress?.(Lang.text('Mods.SandboxWorld.Progress.SettleLiquids'), 0.5);
      // 读档模式：原版 WorldFile 单轮语义（存档水体已静止，QuickWater+WaterCheck 后
      // 活水极少，单轮快速收敛；残留交给运行时——不再跑生成期的 10 轮全沉降）
      await this.settleLiquids((p) => onProgress?.(Lang.text('Mods.SandboxWorld.Progress.SettleLiquids'), p * 0.8), 'load');
    }
    await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.8 + p * 0.2));
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  private afterWorldLoad() {
    const w = this.world;
    // 旧日军团事件依赖接线（bossAI_dd2.ts DD2_EVENT_HOOKS 占位正式落地）
    this.wireDD2Hooks();
    // 晶塔表首扫（wld 导入的既有晶塔即刻可点；放置/破坏时 refreshPylons 增量刷）
    this.refreshPylons();
    // 常用声效小集合预热（按需加载体系下的目标预热，异步不阻塞：
    // 战斗/挖掘/拾取等开局即用的 ~20 个小 wav；怪物专属声仍随首次受击懒加载）
    this.sfx.preloadNames(['hit', 'hurt', 'killed', 'pkilled', 'pickup', 'dig', 'place',
      'chop', 'tink', 'shatter', 'coin', 'door_open', 'door_close', 'splash', 'bowShoot', 'throw', 'roar', 'thunder',
      'explosion', 'summon', 'whipCrack']); // Item_14 爆炸/Item_44 召唤/Item_152 鞭——不预热则首播静音
    this.sfx.preloadFiles(['Drip_0', 'Drip_1', 'Drip_2']); // 滴水溅落（SoundID 39，Gore 碰撞/入水）
    // 敌怪弹幕发射音（Dart DART_STYLE sfx 直放文件名）：箭 Item_5 已在 bowShoot 预热,
    // 其余不预热则各射击怪本局首射静音
    this.sfx.preloadFiles(['Item_8', 'Item_11', 'Item_12', 'Item_17', 'Item_20', 'Item_28', 'Item_154']);
    // 滴水溅落音钩子（Gore.cs :971-984：落地 Drip_0/1 随机、入水 Drip_2、位置 +8；
    // 带坐标走 2500px 距离衰减，flag4 水型已在 NatureParticles 内静音）
    natureParticles.onDripSplash = (x, y, wet) => {
      this.sfx.playFiles(wet ? ['Drip_2'] : ['Drip_0', 'Drip_1'], 1, x, y);
    };
    // ---- 天气系统接线：状态机已在 world.weather（存档/wld 导入回填）；
    //  天空云联动 + 雨滴/沙尘渲染器 attach；hooks 字段每帧由 fixedUpdate 刷新 ----
    this.renderer.sky.attachWeather(w.weather);
    this.renderer.sky.moonType = this.world.moonType;   // 原版 header moonType（WF:1252）
    this.weatherHooks = {
      lightAt: (tx, ty) => this.lighting ? this.lighting.lightAt(tx, ty) : [255, 255, 255],
      atmo: 1,
      snowRatio: 0,
      bossDanger: false,
      sandstormVisuals: false,
      desertSandTiles: 0,
      emitSand: (x, y, vx, vy, color) => {
        this.particles.push({
          x, y, vx, vy, life: 40 + Math.random() * 30, maxLife: 70,
          color, size: 2, damp: 0.995, grav: 0,
        });
      },
      sandColors: () => {
        const s = this.scene;
        return [
          { color: '#C8A014', weight: 1 },
          { color: '#67627A', weight: s.zoneHallow ? 1 : 0.02 },
          { color: '#872B22', weight: s.zoneCrimson ? 1 : 0.02 },
          { color: '#D5C4C5', weight: s.zoneCorrupt ? 1 : 0.02 },
        ];
      },
    };
    this.renderer.weatherFx.attach(w.weather, this.weatherHooks);
    this.renderer.weatherFxActive = true;
    // 天气预设回调（小地图天气面板按钮 → applyWeatherPreset）
    this.renderer.weatherPreset = (name) => this.applyWeatherPreset(name);
    // 原版墙渲染器（TEdit WallFraming 移植；墙 id 直用 wld id，贴图 Wall_N.png）
    const wallTiler = this.atlas ? new VanillaWallTiler(this.atlas) : null;
    this.chunks = new ChunkCache(w, this.assets.tileSheets, this.autotiler, wallTiler);
    // 懒加载晚到的【图块/墙表】→ 全量标脏重烘焙:出生点子集预载后,远行遇到
    // 新类型时 vframe 先返回 null(fallback 烤进 chunk),表到位后此回调修正。
    // 必须按文件名过滤——图标/NPC/弹幕贴图不进 chunk，此前任何 vimage 晚到都
    // invalidateAll（后台补齐 6059 张图标 = 6059 次全图重烘焙标记，进图后持续帧尖峰）
    if (this.atlas) {
      this.atlas.onVImageLoaded = (file: string) => {
        if (file.startsWith('vanilla/Tiles_') || file.startsWith('vanilla/Wall_')) {
          this.chunks.invalidateAll();
        }
        // 物品图标图集晚到 → 标记 UI 待刷（fixedUpdate 节流后刷背包/快捷栏/宝箱，
        // 把空图标升格为原版图标——否则图标未就绪时 paintSlot 写空 src，直到下次
        // 用户点击才自愈）。Tiles_ 表同样要刷：place_v_* 家具类物品的图标取自
        // 图块表首帧（atlasIconForKey → vframeAt），此前只认 Item_Atlas → 开宝箱
        // 时这类物品永久回退
        if (file.includes('Item_Atlas') || file.startsWith('vanilla/Tiles_')) this.iconUiDirty = true;
      };
    }
    // 电路系统(Wiring.cs 移植):器件表 + 触发源登记(测重板 428/感应器 423)
    this.wiring = new Wiring(w.store);
    this.wiring.worldSurface = w.groundLevel;
    attachDevices(this.wiring, this.makeDeviceCtx());
    this.scanTriggerTiles();
    this.lighting = new LightingEngine(w);
    this.renderer.lighting = this.lighting; // 岩浆瀑布 AddLight 等渲染端光源注入
    this.liquid = new LiquidSim(w);
    // 世界运行时演化（WorldGen.UpdateWorld 1:1）：草蔓延/藤蔓/药草/邪恶神圣扩散等
    this.evolution = new WorldEvolution({
      store: w.store,
      worldSurface: w.groundLevel,
      rockLevel: w.rockLevel,
      flags: w.flags,
      crimson: w.crimson,
      get isDay() { return w.clock.isDay; },
      get raining() { return !!w.weather?.raining; },
      get maxRaining() { return w.weather?.maxRaining ?? 0; },
      get windSpeedCurrent() { return w.weather?.windSpeedCurrent ?? 0; },
      playerTile: () => ({ x: this.player.cx / TILE, y: this.player.cy / TILE }),
    });
    // Torch God 彩蛋事件（触发扫描/熄灭/弹幕 949/复燃/掉 5043）
    this.torchGod = new TorchGodEvent({
      store: w.store,
      worldSurface: w.groundLevel,
      playerTile: () => ({ x: this.player.cx / TILE, y: this.player.cy / TILE }),
      hasVanillaItem: (vid) => {
        const key = VANILLA_ITEM_KEY_BY_ID[vid];
        const id = key ? ITEM_BY_KEY[key] : undefined;
        if (id === undefined) return false;
        return this.player.inv.slots.some((sl) => sl && sl.id === id && sl.stack > 0);
      },
      spawnTorchBolt: (x, y, vx, vy, rangePx) => {
        const e = new TorchGodProj(x, y, vx, vy, rangePx);
        e.id = this.entities.nextId++;
        this.entities.add(e, 'projectiles');
      },
      dropVanillaItem: (vid, px, py) => {
        const key = VANILLA_ITEM_KEY_BY_ID[vid];
        if (key) this.spawnDrop(px, py, key, 1);
      },
      setBlackout: (on) => { this.blackout = on; },
    });
    // 1456 AddWater/WaterCheck 尾部 KillTile（液体冲毁火把等）：走 breakTile（掉落+音效+帧刷新）
    this.liquid.killTile = (x, y) => {
      // 水炬豁免（CheckWaterDeath subtile 8/11/17 WaterDeath=false）：水冲不灭
      const i = w.store.idx(x, y);
      if (TILE_DEFS[w.store.type[i]]?.vanilla?.sheet === 4 && isWaterTorchStyle(w.store.frameY[i])) return;
      this.breakTile(x, y);
    };
    // 液体交互音（WorldGen.PlayLiquidChangeSound :4577-4599，六种配对）：
    // LavaWater{水,岩浆}/HoneyWater{水,蜜}/HoneyLava{岩浆,蜜} = liquids_* 专属轨
    // （SoundID.cs:823-827 CreateTrackable 各 3 变体，素材已从 Sounds/Custom/ 落位
    // public/sounds/——登记销核）；Shimmer×3{微光,水/岩浆/蜜} 原版即 PlaySound(19,…,4)
    // = Splash_4（LegacySoundPlayer.cs:885 音量 ×0.75）。
    // 本仓库液体编码 1水/2岩浆/3蜂蜜/4微光，配对任意序
    this.liquid.liquidChangeSound = (x, y, a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (lo < 1 || hi > 4 || lo === hi) return; // 同类/越界不发声
      const px = x * TILE + 8, py = y * TILE + 8;   // :4582 x*16+count*8（count 取 1）
      if (hi === 4) { this.sfx.play('shimmerSplash', 0.75, px, py); return; }
      const name = lo === 1 && hi === 2 ? 'liquidWaterLava'
        : lo === 1 && hi === 3 ? 'liquidHoneyWater' : 'liquidHoneyLava';
      this.sfx.play(name, 1, px, py);
    };
    this.liquid.waterCheck(); // 原版读档末尾的 WaterCheck：把沉降后仍可流动的少量格子交给运行时收敛
    this.camera = new Camera(w.w, w.h);
    this.renderer.minimap = new Minimap(w);
    // 火把锚定（TileObjectData tile4）：支撑被挖掉时火把掉落（WorldGen.TileFrame 火把语义）
    w.store.onTileChanged((x, y) => this.checkTorchDetach(x, y));
    // 训练假人（tile 378 + NPC 488，TETrainingDummy L131 语义）：
    // 世界就绪时全图扫描锚点（frameX%36==0 && frameY==0）生成静止假人 NPC；
    // 放置时单点生成；锚 tile 破坏时由 dummyAI 自行消亡
    this.spawnAllDummies();
    // 下落沙:任何格变化 → 检查其上方是否为失去支撑的沙族(级联由转换时的
    // setTile 再次触发本监听器自然完成;生成/导入期 setTileSilent 不触发)
    this.sandQueue.length = 0;
    w.store.onTileChanged((x, y) => {
      const above = TILE_DEFS[w.store.type[w.store.idx(x, Math.max(0, y - 1))]];
      if (above && Game.FALLING_TILES.has(w.store.type[w.store.idx(x, Math.max(0, y - 1))])) {
        this.sandQueue.push([x, y - 1]);
      }
    });
    this.entities.clear();
    clearPortals();                 // 传送门为世界内实体，切世界/重载一并清（BirthdayParty.WorldClear 同位）
    partyWorldClear(this.partyState);
    LanternNight.worldClear();      // LanternNight.WorldClear（Main.cs:51656）：运行时态不进存档
    this.player = new Player(w.spawnX * TILE + 8, (w.spawnY - 3) * TILE, new Inventory()); // 主角 3 格高，抬高出生点
    // 初始装备 = 原版经典开局三件套（铜镐/铜斧/铜剑），其余一概不给——
    // 调试用道具经背包面板的"搜索添加"按钮获取（UI.ts 道具搜索器）
    this.player.inv.add(ITEM_BY_KEY['copper_pickaxe'], 1);
    this.player.inv.add(ITEM_BY_KEY['copper_axe'], 1);
    this.player.inv.add(ITEM_BY_KEY['copper_sword'], 1);
    this.camera.x = this.player.cx;
    this.camera.y = this.player.cy;
    this.boss = null;
    // ---- 历史存档索引帧修复 ----
    // 旧版生成代码曾把多格家具的格内偏移写成【格索引】(0/1)而非【像素】(0/18)，
    // 渲染端 ofx=1 只偏 1px → 2×2 宝箱四格显示同一贴图。特征：多格 vanilla framed
    // 物体的全部格帧 <18 且非全 0（合法块必有一格 ≥18；全 0 由渲染端锚点扫描重建）
    this.repairIndexFrames();

    // ---- 城镇 NPC 恢复（原版 WorldFile 加载：存档里的 town NPC 原位生成）----
    const savedNpcs = this.world.pendingTownNpcs ?? [];
    this.world.pendingTownNpcs = [];
    this.guideSpawned = true;
    if (savedNpcs.length > 0) {
      for (const n of savedNpcs) {
        const t = new TownNPC(n.key, n.x, n.y);
        t.bound = !!n.bound;
        if (n.givenName) t.givenName = n.givenName;
        if (n.home) { t.home = { x: n.home[0], y: n.home[1] }; t.leashHome = true; }
        this.entities.add(t, 'npcs');
      }
      // 向导：存档无向导条目才按新世界语义出生（WorldGen.cs:20036）
      if (!savedNpcs.some((n) => n.key === 'guide')) {
        this.entities.add(new TownNPC('guide', this.world.spawnX * 16 + 8, (this.world.spawnY - 2) * 16), 'npcs');
      }
      // 守卫老人：存档未击败骷髅王时按原地牢口位置恢复（存档无条目则重扫地牢口）
      if (this.world.dungeonX > 0 && !this.world.flags.downedSkeletron
        && !savedNpcs.some((n) => n.key === 'old_man')) {
        this.maybeRespawnOldMan();
      }
      // bound 救援 NPC 已由存档条目覆盖（含 bound 态与已获救态），不再重新放置
    } else {
      // 新世界：向导随世界出生(WorldGen.cs:20036)——唯一初始城镇 NPC,无家(homeless)。
      // 商人/护士等由 checkTownArrival 按原版条件 + 房屋系统入住(见 updateTownNpcArrival)
      if (!this.entities.npcs.some((n) => n instanceof TownNPC && n.npcKey === 'guide' && !n.dead)) {
        this.entities.add(new TownNPC('guide', this.world.spawnX * 16 + 8, (this.world.spawnY - 2) * 16), 'npcs');
      }
      // 守卫老人(NPC 37):地牢门口常驻;白天只对话,夜晚对话「诅咒」召唤骷髅王。
      if (this.world.dungeonX > 0 && !this.world.flags.downedSkeletron) {
        this.maybeRespawnOldMan();
      }
      // 救援 NPC（bound）：世界生成期放置（原版 WorldGen 放置 BoundGoblin/BoundMechanic/
      // WebbedStylist/Golfer，TaxCollector 为地狱酷刑者——此处近似为直接 bound 解救）
      this.placeBoundRescueNpcs();
    }
    // 昼夜事件基线：季节旗标 + 时钟快照
    this.checkSeasonal();
    this._lastClockT = this.world.clock.timeOfDay;
    this.cb.onInventoryChanged();
  }

  /** 救援 NPC 放置（原版世界生成放置 bound NPC：哥布林/巫师=洞穴层、机械师=地牢内部、
   *  造型师=蜘蛛巢(墙62)、高尔夫球手=地下沙漠(墙216/217/187)、税务员=地狱；
   *  巫师仅困难模式。
   *  近似与原版差异（依赖登记）：
   *  ① 原版为独立 NPC 类型 105 BoundGoblin / 106 BoundWizard / 123 BoundMechanic /
   *    354 WebbedStylist / 589 GolferRescue，本作以 TownNPC.bound 统一近似——
   *    渲染已按真帧走五张捆绑姿态表 + 税务官 534 酷刑者表（Renderer.BOUND_NPC_SHEET）；
   *  ② 税务官原版是地狱 DemonTaxCollector(534) 被净化粉（弹体 10，PowderProj）命中 →
   *    NPC.Transform(441)（Projectile.cs:13650-13657）——链已实装（Game.applyPowder）；
   *    右键对话解救保留为便捷兜底（原版 534 是敌怪不可对话，差异登记）；
   *  ③ 净化粉本身树妖商店未进货（vanilla-shopstock.json 无 66/67/2886），获取链缺（登记） */
  private placeBoundRescueNpcs() {
    const st = this.world.store;
    // 机械师：地牢入口向下找地牢墙内空气落脚
    if (this.world.dungeonX > 0) {
      const DUNG_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
      const dx = this.world.dungeonX;
      const y0 = (this.world.dungeonY || Math.floor(this.world.groundLevel)) + 60;
      for (let y = y0; y < Math.min(st.h - 60, y0 + 300); y++) {
        if (st.isSolid(dx, y) || !DUNG_WALLS.has(st.wall[st.idx(dx, y)])) continue;
        if (st.isSolid(dx, y - 1) || st.isSolid(dx, y - 2)) continue;
        if (this.placeBoundNpc('mechanic', 'savedMech', dx, y - 1)) break;
      }
    }
    // 按墙类型扫描落脚（蜘蛛巢 62 / 地下沙漠 216/217/187）
    const findByWall = (walls: Set<number>, key: string, flag: string): boolean => {
      for (let x = 20; x < st.w - 20; x += 7) {
        for (let y = Math.floor(this.world.rockLevel) + 20; y < st.h - 260; y += 3) {
          if (st.isSolid(x, y) || !walls.has(st.wall[st.idx(x, y)])) continue;
          if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || !st.isSolid(x, y + 1)) continue;
          if (this.placeBoundNpc(key, flag, x, y - 1)) return true;
        }
      }
      return false;
    };
    findByWall(new Set([62]), 'stylist', 'savedStylist');
    findByWall(new Set([216, 217, 187]), 'golfer', 'savedGolfer');
    // 哥布林：洞穴层（岩石层下 60..h-350）随机列扫落脚
    const g = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
    if (g) this.placeBoundNpc('goblin_tinkerer', 'savedGoblin', g[0], g[1]);
    // 税务员：地狱层（h-170..h-60；原版为 DemonTaxCollector 534 + 净化粉弹体 10 命中
    // Transform(441)——见函数头登记的近似差异②）
    const t = this.findBoundSpotByDepth(st.h - 170, st.h - 60);
    if (t) this.placeBoundNpc('tax_collector', 'savedTaxCollector', t[0], t[1]);
    // 巫师：仅困难模式（入驻轮里 hardMode 开启后补放）
    if (this.world.flags.hardMode) {
      const wz = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
      if (wz) this.placeBoundNpc('wizard', 'savedWizard', wz[0], wz[1]);
    }
  }

  /** 深度带内找 bound 落脚点（空气×2 + 下方实心），返回 [x, 脚底上一格y] */
  private findBoundSpotByDepth(yTop: number, yBot: number): [number, number] | null {
    const st = this.world.store;
    const x0 = Math.floor(st.w * 0.15), x1 = Math.floor(st.w * 0.85);
    for (let x = x0; x < x1; x += 5) {
      for (let y = yTop; y < yBot; y += 3) {
        if (st.isSolid(x, y) || st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;
        if (!st.isSolid(x, y + 1)) continue;
        return [x, y - 1];
      }
    }
    return null;
  }

  /** 放置一名 bound 救援 NPC（已解救/已在场/落点无效时跳过）。x,y = 脚底上一格 */
  private placeBoundNpc(key: string, savedFlag: string, x: number, y: number): boolean {
    const st = this.world.store;
    if (this.world.flags[savedFlag]) return false;
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === key)) return false;
    if (x < 3 || y < 3 || x > st.w - 4 || y > st.h - 4) return false;
    if (st.isSolid(x, y) || st.isSolid(x, y - 1)) return false;
    const npc = new TownNPC(key, x * TILE + 8, (y + 1) * TILE);
    npc.bound = true;
    this.entities.add(npc, 'npcs');
    return true;
  }

  /** 右键解救 bound NPC（原版 bound 类型右键 → 转正 + AI_007_UpdateSavedStates 置 saved 旗标） */
  private freeBoundNpc(npc: TownNPC): void {
    npc.bound = false;
    const flagByKey: Record<string, string> = {
      goblin_tinkerer: 'savedGoblin', wizard: 'savedWizard', mechanic: 'savedMech',
      stylist: 'savedStylist', tax_collector: 'savedTaxCollector', golfer: 'savedGolfer',
    };
    const flag = flagByKey[npc.npcKey];
    if (flag) this.world.flags[flag] = true;
    const name = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    this.newText(Lang.text('Mods.SandboxWorld.NPC.Rescued', name), 50, 125, 255);
    this.spawnParticles(npc.cx, npc.cy, '#9AE85A', 14, 2);
    this.playSfxFiles(['NPC_Hit_1'], 0.6);
  }

  /** 粉末云实效（PowderProj 每帧回调；原版 AI_006 cs:22460-22533 逐格 Convert +
   *  Damage_TryUsingPowders cs:13646-13680 NPC 转化）：
   *  proj 10 净化 → Convert case 11；11 → 腐化 1；463 → 猩红 4（均 tiles+walls）
   *  NPC 转化：10 命中 bound 税务官（原版地狱酷刑者 534 → Transform 441，:13651-13655）
   *  → 走 freeBoundNpc 转正。687 城镇史莱姆黄 → 683 链无对应实体（未实装，登记）；
   *  11/463 的 AttemptToConvertNPCToEvil（兔/企鹅击杀等）未接（登记） */
  applyPowder(projId: number, x: number, y: number, w: number, h: number): void {
    const convType = projId === 10 ? 11 : projId === 11 ? 1 : projId === 463 ? 4 : -1;
    if (convType > 0) {
      const st = this.world.store;
      // 命中盒外扩 ±1 格的遍历窗（cs:22460-22466），窗内再做盒-格矩形相交判定
      const x0 = Math.max(0, Math.floor(x / TILE) - 1);
      const x1 = Math.min(st.w - 1, Math.floor((x + w) / TILE) + 1);
      const y0 = Math.max(0, Math.floor(y / TILE) - 1);
      const y1 = Math.min(st.h - 1, Math.floor((y + h) / TILE) + 1);
      for (let i = x0; i <= x1; i++) {
        for (let j = y0; j <= y1; j++) {
          const tx = i * TILE, ty = j * TILE;
          if (x + w <= tx || x >= tx + TILE || y + h <= ty || y >= ty + TILE) continue;
          this.evolution.convert(i, j, convType);
        }
      }
    }
    if (projId !== 10) return;
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (!(npc instanceof TownNPC) || npc.dead || !npc.bound) continue;
      if (npc.npcKey !== 'tax_collector') continue; // 原版 534 是唯一受净化粉转化的 NPC
      if (x < npc.x + npc.w && x + w > npc.x && y < npc.y + npc.h && y + h > npc.y) {
        this.freeBoundNpc(npc);
      }
    }
  }

  /** 守卫老人(NPC 37)生成/重生（原版 dungeonX/Y = 入口站立点 cs L72510-72527）。
   *  诅咒召唤时被置 dead；骷髅王离场/被击败未记账时原版会让他重新出现——
   *  Boss 战斗结束块调用本方法（已在场/已击败时直接跳过） */
  private maybeRespawnOldMan() {
    if (this.world.dungeonX <= 0 || this.world.flags.downedSkeletron) return;
    if (this.entities.npcs.some((n) => n instanceof TownNPC && n.npcKey === 'old_man' && !n.dead)) return;
    const st = this.world.store;
    const dX = this.world.dungeonX;
    const dY = this.world.dungeonY || Math.floor(this.world.groundLevel);
    // 双侧由外向内扫门 tile(外廊门或塔基门),取最外侧一扇
    let doorX = -1, doorY = -1;
    for (let r = 70; r >= 3 && doorX < 0; r--) {
      for (const sd of [1, -1]) {
        const x = dX + sd * r;
        if (x < 3 || x > st.w - 4) continue;
        for (let y = Math.max(4, dY - 45); y < Math.min(st.h - 3, dY + 45); y++) {
          if (st.type[st.idx(x, y)] === T.DOOR_CLOSED) { doorX = x; doorY = y; break; }
        }
        if (doorX > 0) break;
      }
    }
    // 落位候选(按优先级):门外开阔侧 3 格 > 门内 1 格 > 门外 6/10 格 > 门内 4 格 >
    // 塔心入口扫描 > 裸兜底。每候选:向下 ≤10 格找地面 + 头顶 3 格净空(身高 40px)
    // + 3 宽地板(左右也实心,防站在竖井/悬崖边缘)
    const standSpot = (sx: number, syTop: number): { x: number; y: number } | null => {
      if (sx < 3 || sx > st.w - 4) return null;
      let yy = Math.max(4, syTop);
      const limit = Math.min(st.h - 3, syTop + 10);
      while (yy < limit && !st.isSolid(sx, yy)) yy++;
      if (yy >= limit) return null;
      if (!st.isSolid(sx - 1, yy) || !st.isSolid(sx + 1, yy)) return null;
      for (let k = 1; k <= 3; k++) if (st.isSolid(sx, yy - k)) return null;
      return { x: sx, y: yy - 3 };
    };
    const side = doorX >= dX ? 1 : -1; // 门相对塔心的方位,外侧 = 再往外
    const baseY = (doorY > 0 ? doorY : dY) - 2;
    // 首选 dungeonX/Y 本身(=门厅站立点);其余候选为门扫描兜底
    const cands: Array<[number, number]> = [[dX, dY - 3], [doorX + side * 3, baseY],
      [doorX - side, baseY], [doorX + side * 6, baseY],
      [doorX + side * 10, baseY], [doorX - side * 4, baseY], [dX, dY - 10]];
    let spot = cands.map(([cx0, cy0]) => standSpot(cx0, cy0)).find((s) => s) ?? null;
    if (!spot) {
      // 末级兜底①:门高平面 ±70 列扫任一有效落脚
      for (let r = 1; r <= 70 && !spot; r++) {
        for (const sd of [1, -1]) {
          spot = standSpot(dX + sd * r, baseY);
          if (spot) break;
        }
      }
    }
    if (!spot) {
      // 末级兜底②:门口悬空(地牢在陡坡上) → 塔外 20-70 列从天空向下扫地表,
      // 站到门外山坡(依然在门口视野内);再不行站塔顶
      for (let r = 20; r <= 70 && !spot; r++) {
        for (const sd of [1, -1]) {
          spot = standSpot(dX + sd * r, 8);
          if (spot) break;
        }
      }
    }
    if (!spot) spot = standSpot(dX, 8) ?? { x: dX, y: dY - 3 };
    const oldMan = new TownNPC('old_man', spot.x * 16 - 8, spot.y * 16);
    oldMan.home = { x: spot.x, y: spot.y }; // 锚定门口
    oldMan.leashHome = true; // 白天在门口走廊附近游走,不远离(原版老人不离地牢)
    oldMan.id = this.entities.nextId++;
    this.entities.add(oldMan, 'npcs');
  }

  /** 销毁：停止循环并移除画布（退出到主菜单时调用） */
  destroy() {
    // R7：联机断开（否则幽灵玩家 + gameWorld 数百 MB 无法回收）
    this.net?.disconnect();
    this.net = null;
    this.remotePlayerProxies = [];
    entityNet.reportStrike = null; // v3 实体钩子随生命周期摘除
    this.running = false;
    // 天气：雨声层静音 + 渲染器 detach（防下个世界复用旧状态）
    this.sfx.setRain(0);
    this.renderer.weatherFxActive = false;
    this.renderer.weatherFx.detach();
    this.renderer.sky.weatherRef = null;
    natureParticles.clear(); // 落叶/滴水粒子不跨世界残留
    natureParticles.onDripSplash = null;
    // 月总震屏滤镜解除（倒计时中退世界 → 菜单不留红色脉冲）
    this.renderer.moonLordShake = null;
    // 资源释放链(缺一不可,见各 dispose 注释):连续多次读档曾因不释放
    // 累积数百 MB 显存 → contextlost/contextrestored 风暴卡死(2026-08-10 trace)
    this.input.destroy();
    this.chunks?.dispose();
    this.renderer.dispose();
    this.renderer.canvas.remove();
    // 纸娃娃合成缓存:contextlost 后缓存内容归零且不重画——不清则
    // "角色/装备/时装全部隐形"(选人界面与游戏内 alike)
    clearPaperDollCache();
    // 智能光标状态复位（防指针帧/黄框残留到主菜单）
    this.smartCursor.wanted = false;
    this.smartCursor.showing = false;
    VUI.smartCursorOn = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(now: number) {
    const dtMs = now - this.lastTime;
    this.frameDts.push(dtMs);
    if (this.frameDts.length > 60) this.frameDts.shift();
    const elapsed = Math.min(dtMs / 1000, 0.25);
    this.lastTime = now;
    windSway.active = !this.paused; // _isActiveAndNotPaused（暂停不喷落叶；物理随 !paused 冻结）
    // 调试桥：暴露 app 实例（HMR 双实例防探针误读——EmoteBubble 同款教训）
    (window as unknown as { __swNatureParticles?: typeof natureParticles }).__swNatureParticles = natureParticles;
    if (!this.paused) {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.fixedUpdate(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
    }
    this.render();
  }

  // ================= 固定步逻辑 =================

  private fixedUpdate(dt: number) {
    this.tickCount++;
    // 对话距离保持:离开 NPC 超过 6 格自动关闭(原版 SetTalkNPC(-1) 语义)
    if (this.dialogNpc) {
      const dn = this.dialogNpc;
      if (dn.dead || Math.hypot(dn.cx - this.player.cx, dn.cy - this.player.cy) > TILE * 6) {
        this.closeNpcDialog();
      }
    }
    // 原版 HitTile 衰减（每 2 tick 一次——原版按帧衰减配原版 ~27 帧挥速；
    // 我们的挥击间隔更长，等比减半保持"连击可积累、停手会消退"）
    if (this.tickCount % 2 === 0) this.hitTiles.update();
    const w = this.world;
    // 下落沙:消费候选队列(有界,防止沙漠整柱同帧转换尖峰)
    if (this.sandQueue.length) this.drainSandQueue();
    // 旅程时间倍率（Main.cs:6278-6294 UpdateTimeRate：dayRate = TargetTimeRate、
    // FreezeTime 开启时 0——时间推进按倍率缩放；非旅程世界恒 1 不变速）
    w.clock.tick(dt * 1000 * w.journeyTimeScale());
    // ---- 天气系统推进（原版 UpdateWeather/UpdateTime 每帧；60Hz tick 语义） ----
    this.updateWeather();
    // 昼夜切换：公告走原版消息列（Main.NewText→LegacyChatMonitor；ChatColors.World 50,255,130）
    const isDay = w.clock.isDay;
    if (isDay !== this.lastWasDay) {
      if (this.lastWasDay !== null) {
        this.newText(isDay ? Lang.text('Mods.SandboxWorld.Toast.DayStart') : Lang.text('Mods.SandboxWorld.Toast.NightFall'), 50, 255, 130);
        this.cb.onDayNight?.(isDay);
        // 昼/夜逻辑感应器(423)触发
        this.triggerDayNightSensors();
      }
      this.lastWasDay = isDay;
    }
    // ---- 热喷泉自动喷发（原版 Main 扫描：上方格岩浆流过即喷；15 tick 采样 + 120 tick 冷却） ----
    if (this.tickCount % 15 === 0 && this.geyserTiles.size) {
      const st2 = w.store;
      for (const gi of this.geyserTiles) {
        if ((this.geyserCd.get(gi) ?? 0) > 0) continue;
        const gx = gi % st2.w, gy = (gi / st2.w) | 0;
        const above = st2.idx(gx, gy - 1);
        if (st2.liquid[above] > 0 && st2.liquidType[above] === 2) {
          this.geyserCd.set(gi, 120);
          this.wiring?.hitSwitch(gx, gy);
        }
      }
    }
    if (this.tickCount % 15 === 0) {
      for (const [, v] of this.geyserCd) { /* 冷却递减在下一行统一 */ }
      for (const k of [...this.geyserCd.keys()]) {
        const v = this.geyserCd.get(k)! - 15;
        if (v <= 0) this.geyserCd.delete(k); else this.geyserCd.set(k, v);
      }
    }
    // 世界声监听器（原版 Main.Camera.Center）：世界坐标声按此衰减（2500px，LegacySoundPlayer）
    this.sfx.setListener(this.camera.x, this.camera.y);
    // ---- 原版环境采样 + BGM 选曲（SceneMetrics/UpdateAudio_DecideOnNewMusic；15 tick 刷新） ----
    if (this.tickCount % 15 === 0) {
      // 城镇 NPC 计数为"距离盒"语义（SceneMetrics.cs:755-757/:18：CenteredRectangle(Center,
      // AssumedConstantScreenSize×2)=±1920×±1080px 内的 townNPC）——全图存活数会让
      // 46/47 城镇曲盖住一切群系 BGM
      const townNPCCount = this.entities.npcs.filter((n) => {
        const tn = n as TownNPC;
        return !tn.dead && Math.abs(tn.cx - this.player.cx) <= 1920 && Math.abs(tn.cy - this.player.cy) <= 1080;
      }).length;
      this.scene = scanScene(w, this.player.cx, this.player.cy, townNPCCount, partyIsUp(this.partyState));
      w.scene = this.scene; // Enemy 等只读消费（zoneGraveyard 攻门门等）
      this.player.zoneDesert = this.scene.zoneDesert; // 沙漠区旗标（沙丘行者靴已改消费 runningOnSand，:26225-26231）
      // ---- 幸运度环境扫描（Player.TryRecalculatingTorchLuck :17580-17939 净效果版）----
      // 火炬窗 81×81（原版每 tick 一行、81 tick 一轮——15t 整窗直扫节流等价）+
      // 地精窗 169×124（SceneMetrics _tileCounts[567]）；群系判定复用 scene（Zone 标志），
      // oceanDepths 以 zoneBeach 同式近似。手持火把 placeStyle 计入 nearbyTorch（:17775-17778）
      {
        const s = this.scene;
        // 手持火把物品（inventory[selectedItem].createTile==4）才计 placeStyle（:17775-17778）
        const held = this.player.inv.slots[this.player.inv.selected];
        const heldDef = held ? ITEM_DEFS[held.id] : undefined;
        const heldTorchStyle = heldDef?.tile != null && TILE_BY_KEY[heldDef.tile] === T.TORCH
          ? torchStyleOfItemKey(heldDef.key) : null;
        const luckScan = scanLuckScene({
          store: w.store,
          tx: Math.floor(this.player.cx / TILE), ty: Math.floor(this.player.cy / TILE),
          belowSurface: this.player.cy / TILE > w.groundLevel,
          zones: {
            dungeon: s.zoneDungeon, temple: s.zoneTemple, snow: s.zoneSnow, desert: s.zoneDesert,
            jungle: s.zoneJungle, glowshroom: s.zoneGlowshroom, corrupt: s.zoneCorrupt,
            crimson: s.zoneCrimson, hallow: s.zoneHallow, ocean: s.zoneBeach,
          },
          heldTorchStyle,
        });
        this.player.luckState.torchLuck = luckScan.torchLuck;
        this.player.luckState.hasGardenGnomeNearby = luckScan.hasGardenGnome;
      }
      // 群系背景预测性预热:进入新群系前把该群系视差贴图后台取齐
      // (否则跨群系旅行首帧背景闪空;仅 fire-and-forget,不阻塞主循环)
      this.renderer.biomeBg.warm(this.scene);
      // Boss 专属 BGM（Main.cs:12155-12312：屏盒内 Boss 的专属曲，盒半径默认 5000；
      // 异教徒仪式态两族例外用 1600——CultistDevote 438 ai[1]==1（:12212-12217）与
      // CultistArcher 379 ai[3]>=0（:12220-12225）→ num3=20 → 音乐 94（与 439 本体同曲）。
      // 仪式态由异教徒仪式 AI 置位（未移植——当前不可达，公式先 1:1 在位）
      let bossMusic = 0;
      for (const e of this.entities.enemies) {
        const en = e as unknown as { x: number; y: number; def?: { boss?: boolean }; vanillaId?: number | null; ai1?: number; ai3?: number };
        // 仪式态判定（438 ai[1]==1 / 379 ai[3]>=0）——两族无 boss 标记，显式并入
        const ceremony = (en.vanillaId === 438 && en.ai1 === 1) || (en.vanillaId === 379 && (en.ai3 ?? 0) >= 0);
        if (!en.def?.boss && !ceremony) continue;
        // 盒半径（Main.cs:12155 默认 5000；仪式态 :12215/:12222 收窄 1600）
        const box = ceremony ? 1600 : 5000;
        if (Math.abs(en.x - this.player.cx) < box && Math.abs(en.y - this.player.cy) < box) {
          bossMusic = bossMusicFor(en.vanillaId ?? 0);
          break;
        }
      }
      // 入侵 BGM（Main.cs:12186-12192+12478-12566：屏内 ±5000px 入侵组 NPC 驱动；
      // 海盗 35 > 哥布林 39，雪人走 Boss3 13）
      let invasionMusic = 0;
      if (w.invasionType > 0) {
        for (const e of this.entities.enemies) {
          const en = e as unknown as { x: number; y: number; vanillaId?: number | null };
          if (en.vanillaId == null) continue;
          const g = INVASION_GROUP[en.vanillaId];
          if (g !== w.invasionType) continue;
          if (Math.abs(en.x - this.player.cx) >= 5000 || Math.abs(en.y - this.player.cy) >= 5000) continue;
          invasionMusic = g === INVASION_PIRATE ? 35 : g === INVASION_SNOW_LEGION ? 13 : 39;
          break;
        }
      }
      // 旧日军团 BGM（Main.cs 音乐链入侵组 -3 分支：GetNPCInvasionGroup -3 =
      // BelongsToInvasionOldOnesArmy + DD2Event.Ongoing → MusicID.OldOnesArmy 41；
      // 屏内 ±5000px 有军团 NPC 即切曲，与入侵 BGM同层）
      if (w.oldOnesArmy.ongoing) {
        for (const e of this.entities.enemies) {
          const en = e as Enemy;
          if (en.dead || en.vanillaId == null) continue;
          const id = en.vanillaId;
          // BelongsToInvasionOldOnesArmy：551-578（550 酒馆老板除外）+ 548 水晶/549 门
          const isDD2 = (id >= 551 && id <= 578) || id === 548 || id === 549;
          if (!isDD2) continue;
          if (Math.abs(en.cx - this.player.cx) >= 5000 || Math.abs(en.cy - this.player.cy) >= 5000) continue;
          invasionMusic = MUSIC.OldOnesArmy;
          break;
        }
      }
      // 月事件 BGM（Main.cs:12914-12921，链尾最高优先级）：相机在地表
      // worldSurface+10 格带内时覆盖一切（含 Boss 曲）；南瓜月 30 / 霜月 32
      const moonMusic = w.moonEvent.kind === MOON_KIND_PUMPKIN ? 30
        : w.moonEvent.kind === MOON_KIND_FROST ? 32 : 0;
      const moonMusicGated = moonMusic && this.player.cy / TILE < w.groundLevel + 10 ? moonMusic : 0;
      // 星璇塔 BGM（Main.cs:12243-12247 num3=10 → :12479-12493 flag11 → 34 LunarPillars）：
      // 屏内 ±5000px 有塔即切曲。优先级：398 月总（flag8→38）在源码链里先于塔曲，
      // 故 pickMusic 内 lunarMusic 排在 bossMusic 之后（文档 §5"与 moonMusic 同层"以源码为准）
      let lunarMusic = 0;
      if (w.lunarEvent.active) {
        for (const e of this.entities.enemies) {
          const en = e as Enemy;
          if (en.dead || !isTowerId(en.vanillaId)) continue;
          if (Math.abs(en.cx - this.player.cx) >= 5000 || Math.abs(en.cy - this.player.cy) >= 5000) continue;
          lunarMusic = 34;
          break;
        }
      }
      const music = pickMusic({
        scene: this.scene, isDay, bossMusic, invasionMusic, moonMusic: moonMusicGated,
        lunarMusic, musicBox: this.scene.musicBoxStyle,
        worldSurface: w.groundLevel, rockLevel: w.rockLevel, lavaLine: w.lavaLine || w.store.h - 200,
        maxTilesX: w.store.w, centerX: this.player.cx, centerY: this.player.cy, ocean: this.scene.zoneBeach,
        state: this.musicState, bloodMoon: !!w.clock.bloodMoon, eclipse: !!w.clock.eclipse,
        weather: {
          storm: w.weather.shouldUseStormMusic,
          rain: w.weather.cloudAlpha > 0,
          windy: w.weather.shouldUseWindyDayMusic,
          timeOfDay01: w.clock.timeOfDay,
        },
      });
      if (music !== this.lastMusic) {
        this.lastMusic = music;
        this.cb.onMusic?.(music);
      }
    }
    const player = this.player;

    // ---- 八音盒录音（Player.cs:15053-15366 ApplyEquipFunctional 1:1）：配饰槽
    // armor[3-9]（原版 :12543-12550 for m=3..9）装备空盒 576 时，每 tick 掷 1/540
    // （Main.rand.Next(540)==0）——当前 BGM ∈(0,105] 且 CanBeRecorded 即命中。
    // 原版先播 Item166 再走变身 if-chain（无映射曲只响声不变身），此处同序；
    // 变身目标 = musicBoxRecordItem（curMusic→style→vid，WorldGen :43138 逆表） ----
    if (this.lastMusic > 0 && this.lastMusic <= 105) {
      for (let acc = ACC_ARMOR_START; acc < ACC_ARMOR_START + 7; acc++) {
        const slot = player.inv.armor[acc];
        if (!slot) continue;
        const heldDef = ITEM_DEFS[slot.id];
        if (!heldDef || viIdFromKey(heldDef.key) !== MUSIC_BOX_EMPTY_VID) continue;
        if (Math.floor(Math.random() * 540) !== 0) continue;
        this.sfx.play('record');   // SoundID.Item166（录音完成音）
        const recKey = VANILLA_ITEM_KEY_BY_ID[musicBoxRecordItem(this.lastMusic)];
        const recId = recKey !== undefined ? ITEM_BY_KEY[recKey] : undefined;
        if (recId === undefined) continue;   // 曲目无映射（如 50 TitleIntro）/唱片未注册
        player.inv.armor[acc] = { id: recId, stack: 1 };
        this.cb.onInventoryChanged();
      }
    }

    // ---- 玩家输入 ----
    const inp = this.input;
    // 点击右上角小地图 → 开关全屏地图
    if (inp.mouseDown && !this._mapClickLatch) {
      const r = this.renderer.minimapRect;
      const fm = this.renderer.fullMap;
      const inMap = inp.mouseX >= r.x && inp.mouseX <= r.x + r.w && inp.mouseY >= r.y && inp.mouseY <= r.y + r.h;
      if (!fm.open && inMap && !inp.uiBlocking && !this.renderer.minimapUiHover) {
        fm.open = true;
        // 晶塔表刷新（图标层 TeleportPylonsMapLayer 恒绘制——小地图入口打开也可点塔）
        this.refreshPylons();
        // 打开即放大到主角：锚点 = 主角 tile 坐标 → 屏幕中心，
        // zoom 从 0.5 缓动到 2，缓动期间 applyMapAnchor 每帧补偿 pan，主角始终居中
        fm.zoom = 0.5;
        fm.zoomTarget = 2;
        fm.anchorU = player.cx / TILE;
        fm.anchorV = player.cy / TILE;
        fm.anchorMX = this.renderer.canvas.width / 2;
        fm.anchorMY = this.renderer.canvas.height / 2;
        // 预置 pan（此时 _fmWorldW 可能还是 0，不能等 easeFullMap 反解，首帧会跳）
        fm.panX = (this.world.w * fm.zoom) / 2 - fm.anchorU * fm.zoom;
        fm.panY = (this.world.h * fm.zoom) / 2 - fm.anchorV * fm.zoom;
        this.renderer['_mapInit'] = false;
        // 打开地图的这次点击不算拖拽（否则按住期间 drawFullMap 会把锚点重设到点击处，飞向主角变飞向点击处）
        this.renderer['_mapOpenClick'] = true;
        this._mapClickLatch = true;
      }
    }
    if (!inp.mouseDown) this._mapClickLatch = false;
    // 全屏地图：点击传送（两次确认）——第一次预选标记，第二次传送。
    // 按下只记起点，松开时位移 < 6px 才算"点击"（拖动平移、打开地图的按压都不误触传送）
    if (this.renderer.fullMap.open && !inp.uiBlocking) {
      if (inp.mouseDown && !this._mapClickLatch2 && !this._mapClickLatch && !this.renderer['_mapOpenClick']) {
        this._mapClickLatch2 = true;
        this._mapPressX = inp.mouseX;
        this._mapPressY = inp.mouseY;
      }
      if (!inp.mouseDown && this._mapClickLatch2) {
        this._mapClickLatch2 = false;
        const moved = Math.hypot(inp.mouseX - this._mapPressX, inp.mouseY - this._mapPressY);
        if (moved < 6) {
          const fm = this.renderer.fullMap;
          // 屏幕坐标 → 地图源坐标（与 zoomFullMapAt 的逆变换一致）
          const viewW = this.renderer.canvas.width, viewH = this.renderer.canvas.height;
          const cx0 = viewW / 2 - (this.world.w * fm.zoom) / 2 + fm.panX;
          const cy0 = viewH / 2 - (this.world.h * fm.zoom) / 2 + fm.panY;
          // 地图绘制：mapW = world.w * zoom（1 tile = zoom 像素）——直接除 zoom 得 tile 坐标
          const tx = Math.floor((inp.mouseX - cx0) / fm.zoom);
          const ty = Math.floor((inp.mouseY - cy0) / fm.zoom);
          if (tx >= 0 && ty >= 0 && tx < this.world.w && ty < this.world.h) {
            // 晶塔图标优先（TeleportPylonsMapLayer.cs:77-127：点中图标 → 门禁 → 传送/
            // 失败文案；图标悬停时原版取消普通选点 cancelWormHole :97）
            if (this.tryPylonMapTeleport(tx, ty)) {
              this._tpTarget = null;
              this.renderer.tpMark = null;
            } else if (this._tpTarget && this._tpTarget.x === tx && this._tpTarget.y === ty) {
              // 第二次点击同一点 → 先就位目标区域贴图再传送(落地即完美,
              // 不出现 fallback 色块闪烁);失败不关图、保留标记可重试
              void this.teleportWhenReady(tx, ty);
            } else {
              this._tpTarget = { x: tx, y: ty };
              this.renderer.tpMark = { x: tx, y: ty };
              this.cb.onToast(`已选传送点 (${tx}, ${ty})，再次点击确认`);
            }
          }
        }
      }
    } else {
      this._mapClickLatch2 = false;
    }
    // ---- 标注模式：点击标记方块（优先于挖掘/放置/使用） ----
    if (this.annotateMode && inp.mouseDown && !this._annoLatch && !inp.uiBlocking && !this.renderer.fullMap.open && !this.renderer.timeUiHover && !this.renderer.weatherUiHover) {
      this._annoLatch = true;
      const [tx, ty] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
      if (this.fixTexMode) {
        // 贴图纠错子模式：点击弹出该图块的完整原版贴图表
        if (this.world.store.inBounds(tx, ty)) {
          (window as unknown as { __swUI?: { openTexPicker?: (x: number, y: number) => void } }).__swUI?.openTexPicker?.(tx, ty);
        }
      } else if (this.world.store.inBounds(tx, ty)) {
        const existed = this.marks.some((m) => m.x === tx && m.y === ty);
        this.marks = this.marks.filter((m) => m.x !== tx || m.y !== ty); // 同格重复点 = 取消
        if (!existed) this.marks.push({ x: tx, y: ty });
        this.cb.onToast(existed ? `已取消标记 (${tx}, ${ty})` : `已标记 (${tx}, ${ty})，再次点击取消`);
        (window as unknown as { __swUI?: { updateAnnotateCount: (n: number) => void } }).__swUI?.updateAnnotateCount(this.marks.length);
      }
    }
    if (!inp.mouseDown) this._annoLatch = false;
    player.inputX = (inp.down('KeyA') || inp.down('ArrowLeft') ? -1 : 0) + (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0);
    player.inputJump = inp.down('Space') || inp.down('KeyW') || inp.down('ArrowUp');
    player.inputDown = inp.down('KeyS') || inp.down('ArrowDown');
    player.inputUp = inp.down('KeyW') || inp.down('ArrowUp');
    // 重力药水（buff 18，:9720）：Up 边沿切换 gravDir（按住不连切）
    if (player.buffs.has(BuffType.Gravitation) && player.inputUp && !this.gravLatch) {
      player.gravDir = player.gravDir === 1 ? -1 : 1;
      this.gravLatch = true;
    }
    if (!player.inputUp) this.gravLatch = false;

    // 滚轮：全屏地图打开时缩放地图，否则缩放游戏画面
    if (inp.wheelDelta !== 0) {
      if (this.renderer.fullMap.open) {
        // 以鼠标为锚点缩放（缩放不乱飞）
        this.renderer.zoomFullMapAt(
          this.renderer.fullMap.zoom * (inp.wheelDelta > 0 ? 0.85 : 1.18),
          inp.mouseX, inp.mouseY,
        );
      } else {
        this.setZoom(this.camera.zoomTarget * (inp.wheelDelta > 0 ? 0.94 : 1.064));
      }
    }

    // itemAnimation 等效注入（CheckDrowning 芦苇管门禁用；swing 在 postUpdate 递减，
    // 此处读到上一帧尾值，≤1 tick 偏差）
    player.itemAnimTicks = this.swing?.t ?? 0;
    player.fixedUpdate(dt, this);
    // 图鉴遇数（Main.cs:17747 BestiaryTracker.Sights.ScanWorldForFinds，每 tick）：
    // 仅小动物（CountsAsACritter）命中盒与玩家判定盒相交即首遇记账——判定盒取原版
    // Player.HitboxForBestiaryNearbyCheck（Player.cs:3165：玩家盒外扩 300×200）
    {
      const px = player.x - 300, py = player.y - 200;
      const pw = player.w + 600, ph = player.h + 400;
      for (const n of this.entities.npcs) {
        const e = n as Enemy;
        if (e.dead || e instanceof TownNPC || e.vanillaId == null) continue;
        if (!countsAsACritter(e.vanillaId)) continue;
        if (e.x < px + pw && e.x + e.w > px && e.y < py + ph && e.y + e.h > py) {
          w.bestiary.registerSight(e.vanillaNetId !== 0 ? e.vanillaNetId : e.vanillaId);
        }
      }
    }
    // ④ 右键集火（ItemCheck_MinionAltFeatureUse :48952 + MinionNPCTargetAim :55975：
    // 召唤杖右键 → hitbox 距鼠标最近敌；同目标再右键取消 toggle）
    if (inp.rightDown && !this._prevRightDown) {
      const held0 = this.player.inv.heldItem();
      const cw0 = held0 ? combatWeapon(ITEM_DEFS[held0.id]) : null;
      if (cw0 && cw0.kind === 'summon') {
        const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
        let bestId = -1, bestD = Infinity;
        for (const e of this.entities.enemies) {
          const en = e as Enemy;
          if (en.dead) continue;
          if (Math.hypot(en.cx - this.player.cx, en.cy - this.player.cy) > 3000) continue;
          const d = Math.hypot(en.cx - wx, en.cy - wy);
          if (d < bestD) { bestD = d; bestId = en.id; }
        }
        this.player.minionTargetId = this.player.minionTargetId === bestId ? -1 : bestId;
      }
    }
    this._prevRightDown = inp.rightDown;
    this.updateNebulaBoosters();
    // ⑤ Foxparks 5664 手持喷火通道（PC:42669-42690 TryUsingFoxsparksAbility：
    // 按住期间已有 1094 进 ai[0]=1000 喷火态 + SetDummyItemTime(2) 锁 useTime）
    {
      const heldF = this.player.inv.heldItem();
      const fDef = heldF ? ITEM_DEFS[heldF.id] : null;
      const fVid = fDef ? (fDef.vid ?? viIdFromKey(fDef.key)) : -1;
      const channeling = fVid === 5664 && inp.mouseDown && !inp.uiBlocking && !this.player.dead;
      for (const e of this.entities.projectiles) {
        const m = e as MinionProj;
        if (!(m instanceof MinionProj) || m.dead || m.projId !== 1094) continue;
        if (channeling) {
          const [fwx, fwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
          const fdx = fwx - this.player.cx, fdy = fwy - this.player.cy;
          const fl = Math.hypot(fdx, fdy) || 1;
          m.foxChannel = true;
          m.foxAimX = fdx / fl; m.foxAimY = fdy / fl;
          m.x = this.player.cx - m.w / 2; m.y = this.player.cy - m.h / 2; // position=MountedCenter-Size/2(:56120)
          this.player.useTime = Math.max(this.player.useTime, 2); // SetDummyItemTime(2)
        } else if (m.foxChannel) {
          m.foxChannel = false;
          m.lockAfterFoxChannel(); // localAI[0]=30 喷火后攻击锁（:56155）
        }
      }
    }
    // ---- 高尔夫球杆蓄力（AI_150_GolfClubHelper :49498-49627 + GolfHelper）：
    //      channel 语义（DefaultToGolfClub :48130）——按住=瞄准（力度=光标距球/300，
    //      与时长无关），松开=击球（CalculateShotStrength 椭圆钳×32）；右键取消。
    {
      const heldG = this.player.inv.heldItem();
      const gDef = heldG ? ITEM_DEFS[heldG.id] : null;
      const gm2 = /^vi_(\d+)_/.exec(gDef?.key ?? '');
      const gVid = gm2 ? +gm2[1] : 0;
      const club = gVid > 0 ? GOLF_CLUBS[gVid] : undefined;
      const myBall = (): GolfBall | null => {
        for (const e of this.entities.projectiles) {
          const b = e as GolfBall;
          if (b instanceof GolfBall && !b.dead) return b;
        }
        return null;
      };
      if (club && !inp.uiBlocking && !this.player.dead && this.player.gravDir === 1) {
        const [mwx, mwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
        if (!this.golfAim && inp.mouseDown && this.player.useTime === 0) {
          // 开瞄：站位盒内有球（ValidateShot :444-448）；无球且 500px 内无球 →
          // 自动摆球（TryPlacingAGolfBallNearANearbyTee :49512-49525：5×5 找球座 494）
          let ball = myBall();
          if (!ball || Math.hypot(ball.cx - this.player.cx, ball.cy - this.player.cy) > 500
            || !golfBallInStance(ball, this.player)) {
            const st = this.world.store;
            const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor((this.player.y + this.player.h) / TILE);
            let tee: [number, number] | null = null;
            outer: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
              const x = ptx + dx, y = pty + dy;
              if (!st.inBounds(x, y)) continue;
              if (TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet === 494) { tee = [x, y]; break outer; }
            }
            if (tee) {
              if (ball) ball.dead = true;
              // GetPreferredGolfBallToUse（:48919-48950）：手持→背包首个球族，默认 721
              let projId = 721;
              for (let i = 0; i < this.player.inv.slots.length; i++) {
                const sl = this.player.inv.slots[i];
                if (!sl) continue;
                const km = /^vi_(\d+)_/.exec(ITEM_DEFS[sl.id].key);
                const kv = km ? +km[1] : 0;
                if (kv === 3989 || (kv >= 4242 && kv <= 4253)) {
                  projId = kv === 3989 ? 721 : 739 + (kv - 4242);
                  this.player.inv.removeAt(i, 1);
                  break;
                }
              }
              const own = this.player;
              ball = new GolfBall(tee[0] * TILE + 3, (tee[1] + 1) * TILE - 10, projId, () => own);
              this.entities.add(ball, 'projectiles');
            }
          }
          if (ball && golfBallInStance(ball, this.player)) {
            this.golfAim = true;
            this.golfAimBall = ball;
            this.player.facing = mwx >= this.player.cx ? 1 : -1; // ChangeDir（:49606-49616）
          }
        }
        if (this.golfAim) {
          const ball = this.golfAimBall && !this.golfAimBall.dead ? this.golfAimBall : null;
          if (inp.rightDown) {
            // 右键取消（:49592-49601）：不出手
            this.golfAim = false; this.golfAimBall = null;
            this.player.useTime = 0;
          } else if (!ball) {
            this.golfAim = false; this.golfAimBall = null;
          } else if (inp.mouseDown) {
            // 瞄准维持（SetDummyItemTime :49624-49627）
            this.player.useTime = Math.max(this.player.useTime, 12);
            const shot = golfShot(mwx, mwy, ball, club);
            this.renderer.golfPower = { x: this.player.cx, y: this.player.y + this.player.h + 8, rel: shot.rel, ball };
            this.useSwing(gDef, Math.atan2(mwy - this.player.cy, mwx - this.player.cx));
          } else {
            // 松开 → 击球（:49527-49560）：公式击出 + 地面阻尼（HitGolfBall :451-474）
            const shot = golfShot(mwx, mwy, ball, club);
            const st = this.world.store;
            const btx = Math.floor((ball.x + ball.w / 2) / TILE);
            const bty = Math.floor((ball.y + ball.h + 1) / TILE);
            const solidBelow = st.inBounds(btx, bty) && st.isSolid(btx, bty);
            ball.clubHit(shot.vx, shot.vy, club.rough, solidBelow);
            this.sfx.play('tink', 0.8, ball.cx, ball.cy);
            this.golfScoreTime = 0; // RecordSwing（一杆进洞折扣计时清零）
            this.golfAim = false; this.golfAimBall = null;
            this.renderer.golfPower = null;
            this.player.useTime = 42; // useAnimation 12 + 后摇 30（:49561-49567）
          }
        }
      } else if (this.golfAim) {
        this.golfAim = false; this.golfAimBall = null;
        this.renderer.golfPower = null;
      }
      if (!this.golfAim && this.renderer.golfPower && (!club || !inp.mouseDown)) {
        this.renderer.golfPower = null;
      }
    }
    // ---- 召唤上限缩水驱逐（Projectile.cs:15370-15392：每帧按实体序登记，超限自裁——
    // 实际效果=最后召唤的先死）。召唤时腾位驱逐在 useCombatWeapon 内（最旧先死）。
    // noSlot 实体（虎/阿比盖尔本体、龙身、守护者）不参与。
    {
      let n = 0;
      for (const e of this.entities.projectiles) {
        const m = e as MinionProj;
        if (!(m instanceof MinionProj) || m.dead || m.sentry || m.noSlot) continue;
        if (++n > this.player.maxMinions) m.dead = true;
      }
      n = 0;
      for (const e of this.entities.projectiles) {
        const m = e as MinionProj;
        if (!(m instanceof MinionProj) || m.dead || !m.sentry || m.noSlot) continue;
        if (++n > this.player.maxSentries) m.dead = true;
      }
    }
    // ---- 星尘套装守护者（Player.cs:16195-16212：套装在身 → 常驻 proj 623，base 30 伤；
    //      伤害走 live 刷新吃 summonDamageMult；脱装 → buff 187 撤除守护者死亡）。
    //      buff 187 展示层从略。
    {
      const guardianOn = !!this.player.equipStats.summonSet?.guardian && !this.player.dead;
      const g623 = this.entities.projectiles.find((e) => {
        const m = e as MinionProj;
        return m instanceof MinionProj && !m.dead && m.projId === 623;
      }) as MinionProj | undefined;
      if (guardianOn && !g623) {
        const owner = this.player;
        const g = new MinionProj(owner.cx, owner.cy, 623, 30, 10, false, 0, false,
          () => (owner.dead ? null : owner));
        g.noSlot = true;
        this.entities.add(g, 'projectiles');
      } else if (!guardianOn && g623) g623.dead = true;
    }
    // ---- 起爆器 411 坠落触发（Player.cs:34368 TryLandingOnDetonator）：落地冲击 vy≥3 且
    // 脚下格（Bottom 左下角 +0.01）是 411 未触发态（frameY==0 && frameX<36）→ Wiring.HitSwitch
    if (player.landImpactVy >= 3 && this.wiring) {
      const dx = Math.floor(player.x / TILE), dy = Math.floor((player.y + player.h + 0.01) / TILE);
      const di = this.world.store.idx(dx, dy);
      if (this.wiring.sheetOf(dx, dy) === 411
        && this.world.store.frameY[di] === 0 && this.world.store.frameX[di] < 36) {
        this.wiring.hitSwitch(dx, dy);
      }
      player.landImpactVy = 0; // 消费（防多帧重复）
    }
    // ---- 血月小动物腐化（UpdateNPC_BloodMoonTransformations :93107-93149：血月中
    //      每格 NPC 尝试 AttemptToConvertNPCToEvil——兔/企鹅/海鸥/金鱼/松鼠族 →
    //      腐化变体（猩红世界换猩红表）。敌怪走 transformTo，小动物实体替换为敌怪）----
    if (w.clock.bloodMoon) {
      for (const n of this.entities.enemies) {
        const e = n as Enemy;
        if (e.dead) continue;
        const id = e.vanillaId ?? -1;
        const pair = BLOOD_MOON_EVIL.get(id);
        if (pair) e.transformTo(w.crimson ? pair[1] : pair[0], w.store);
      }
      for (const c of this.entities.critters) {
        const cr = c as Critter;
        if (cr.dead) continue;
        const pair = BLOOD_MOON_EVIL.get(cr.def.npc);
        if (pair) {
          cr.dead = true;
          const en = Enemy.fromVanilla(w.crimson ? pair[1] : pair[0], cr.x, cr.y);
          if (en) this.entities.add(en, 'enemies');
        }
      }
    }
    this.updateTallGateAuto();
    if (player.dead) {
      // 死亡瞬间：红色粉碎粒子 + 原地留墓碑（只处理一次）
      if (!this._deathHandled) {
        this._deathHandled = true;
        this.handlePlayerDeath();
      }
      // 死亡画面淡入 ramp（Player.cs:16873 immuneAlpha += 2 钳 255）
      if (player.immuneAlpha < 255) player.immuneAlpha = Math.min(255, player.immuneAlpha + 2);
      // 重生计时
      player.respawnTimer++;
      if (player.respawnTimer > 180) this.respawnPlayer();
    } else {
      this._deathHandled = false;
    }

    // ---- 智能光标（每帧 lookup；结果供 updateUse 覆盖目标格 + 渲染黄框） ----
    this.updateSmartCursor();
    // ---- 智能选取（Player.cs:24923 selectedItemState.Update：Shift 按住自动换手持
    //      工具/光源；须在 updateUse 前跑，同帧换选即被使用路径看到） ----
    this.updateSmartSelect();
    // ---- 使用物品（鼠标） ----
    this.updateUse(dt);
    this.prevSwingMouse = !!this.input?.mouseDown; // 挥剑点击沿（非 autoReuse 武器需重新点击）

    // ---- 实体 ----
    this.entities.update(dt, this);

    // ---- 传送带实体输送（Collision.StepConveyorBelt, Collision.cs:4215-4351）----
    // 原版在各自碰撞段内调用（Player.cs:27920 / NPC.cs:93774 / WorldItem.cs:938），
    // 这里统一为实体更新后的后处理：每 tick 末等价，对各自 moveAndCollide 无侵入。
    // 掉落物走 itemMode（ApplyConveyorBeltMovementToVelocity :3936-4211，改 vx 逼近
    // 档位目标）；敌怪带 NPCID.Sets.ConveyorBeltCollision 门（NPCID.cs:4789，
    // 普通敌怪原版不吃带）；联机傀儡是快照驱动，本地不动。
    {
      const cst = this.world.store;
      if (!player.dead) stepConveyor(player, cst, player.gravDir);
      for (const e of this.entities.npcs) if (!e.netPuppet) stepConveyor(e, cst, 1);
      for (const e of this.entities.critters) if (!e.netPuppet) stepConveyor(e, cst, 1);
      for (const e of this.entities.drops) if (!e.netPuppet) stepConveyor(e, cst, 1, true);
      for (const e of this.entities.enemies) {
        if (!e.netPuppet && conveyorCarriesEnemy(e as Enemy)) stepConveyor(e, cst, 1);
      }
    }

    // ---- 液体（原版每 2 tick 一次 UpdateLiquid）----
    if (this.tickCount % 2 === 0) {
      this.liquid.step();
      // 液体直接写数组绕过 store 监听：有活动液体时手动通知光照衰减变化
      if (this.liquid.numLiquid > 0) this.lighting.liquidDirty = true;
    }

    // ---- 敌人生成（F8 可关闭；频率语义见 trySpawnEnemy，每帧概率门） ----
    // 水蜡烛(Main.waterCandle 语义):手持或 32 格内有放置态 → 刷怪率修正（getSpawnRate 内）
    const held2 = this.player.inv.heldItem();
    const heldWC = !!held2 && ITEM_DEFS[held2.id]?.key === 'water_candle';
    this.heldWaterCandle = heldWC;
    let nearWC = false;
    if (this.tickCount % 30 === 0) {
      nearWC = false;
      const st2 = this.world.store;
      const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
      const WCT = TILE_BY_KEY['water_candle'];
      for (let dx = -32; dx <= 32 && !nearWC; dx += 4) {
        for (let dy = -24; dy <= 24; dy += 4) {
          if (st2.get(ptx + dx, pty + dy) === WCT) { nearWC = true; break; }
        }
      }
      this.waterCandleNear = nearWC;
    }
    // 篝火/心灯光环:篝火 lifeRegen+1 = 0.5 HP/s;心灯(灯笼 tile42 frameY 324-358,
    // SceneMetrics.cs:207-208)lifeRegen+2 = 1 HP/s,两者独立
    if (this.tickCount % 20 === 0) {
      const ptx2 = Math.floor(this.player.cx / TILE), pty2 = Math.floor(this.player.cy / TILE);
      let fire = false, heart = false;
      const FIRE = TILE_BY_KEY['v_215_campfires'];
      const LANTERN = TILE_BY_KEY['lantern'];
      const st3 = this.world.store;
      for (let dx = -48; dx <= 48 && !(fire && heart); dx += 3) {
        for (let dy = -36; dy <= 36; dy += 3) {
          const lx = ptx2 + dx, ly = pty2 + dy;
          if (!st3.inBounds(lx, ly)) continue;
          const li = st3.idx(lx, ly);
          if (st3.type[li] === FIRE && st3.frameX[li] < 18) fire = true;
          if (st3.type[li] === LANTERN && st3.frameY[li] >= 324 && st3.frameY[li] <= 358) heart = true;
          if (fire && heart) break;
        }
      }
      if (fire) this.player.buffs.apply(BuffType.Campfire, 0.5);
      this.player.buffs.lanternHeal = heart ? 1 : 0;
    }
    // ---- 环境光环四族（SceneMetrics.cs:385-411 + Player.cs:25235-25266 授予链）：
    // 瓶中星(42 frameY 252-286→158)、向日葵(27→146，墓园覆盖略)、猫堡垒(506 frameX<72→215)、
    // 和平蜡烛(372 frameX<18→157)——AddBuff 2t 自动续
    if (this.tickCount % 20 === 0) {
      const ptx3 = Math.floor(this.player.cx / TILE), pty3 = Math.floor(this.player.cy / TILE);
      let star = false, sun = false, bast = false, peace = false;
      const st4 = this.world.store;
      for (let dx = -48; dx <= 48 && !(star && sun && bast && peace); dx += 3) {
        for (let dy = -36; dy <= 36; dy += 3) {
          const sx = ptx3 + dx, sy = pty3 + dy;
          if (!st4.inBounds(sx, sy)) continue;
          const si = st4.idx(sx, sy);
          const sheet = TILE_DEFS[st4.type[si]]?.vanilla?.sheet ?? -1;
          if (sheet === 42 && st4.frameY[si] >= 252 && st4.frameY[si] <= 286) star = true;
          else if (sheet === 27) sun = true;
          else if (sheet === 506 && st4.frameX[si] < 72) bast = true;
          else if (sheet === 372 && st4.frameX[si] < 18) peace = true;
        }
      }
      const b = this.player.buffs;
      if (star) b.apply(BuffType.StarInBottle, 0.5);
      if (sun) b.apply(BuffType.Sunflower, 0.5);
      if (bast) b.apply(BuffType.CatBast, 0.5);
      if (peace) b.apply(BuffType.PeaceCandle, 0.5);
      this.peaceCandleNear = peace;
    }
    // 原版 Main.SpawnNPC 每帧调用（Main.cs:17724），概率门在 TrySpawnAnNPC L30
    // （Next(spawnRate)==0；spawnRate 修正表见 VanillaSpawner.getSpawnRate）。
    // 水蜡烛（heldWaterCandle/waterCandleNear）在 getSpawnRate 内修正，不再改节流
    if (this.enemySpawnEnabled) {
      // 史莱姆雨天空落怪（NPC.cs:192-195：每帧先 SlimeRainSpawns 再常规链，独立概率门）
      if (this.world.weather.slimeRain) {
        const sp = this.vanillaSpawner ?? (this.vanillaSpawner = new VanillaSpawner(w));
        const vw = this.camera.viewW / (this.camera.zoom || 1);
        const vh = this.camera.viewH / (this.camera.zoom || 1);
        const slime = sp.slimeRainSpawns(player.cx, player.cy,
          this.entities.enemies.reduce((s, e) => s + ((e as Enemy).vanilla?.npcSlots ?? 1), 0),
          vw, vh, new RNG((Math.random() * 1e9) | 0), this.world.isExpert); // NPC.cs:5829 expertMode（曾硬编码 false）
        if (slime) {
          slime.id = this.entities.nextId++;
          this.entities.enemies.push(slime);
        }
      }
      this.trySpawnEnemy();
    }

    // ---- 压力板触发 ----
    this.checkPressurePlates();

    // ---- 电路系统:冷却注册递减(计时器周期) + 测重板/感应器 ----
    this.wiring?.updateMech();
    this.updateTriggerTiles();
    this.updateEntityPlates();

    // ---- 月总倒计时（Main.cs:64437-64459：四塔全灭 → StartImpendingDoom(3600)，
    //      每 tick -1，归零 SpawnOnPlayer(最近玩家, 398)）----
    if (tickMoonLordCountdown(w)) this.spawnMoonLordOnPlayer();
    // MoonLordShake 震屏滤镜（Main.cs:64437-64447 1:1）：倒计时>0 时
    // num5 = clamp(sin(cd/60×0.5)×2, 0, 1) × (0.75 − 0.5×cd/MaxMoonLordCountdown)
    // 作为滤镜强度（激活点 = 玩家位置）；归零/无倒计时自动解除（renderer 侧脉冲近似）
    {
      const cd = w.lunarEvent.moonLordCountdown;
      let intensity = 0;
      if (cd > 0) {
        intensity = Math.max(0, Math.min(1, Math.sin(cd / 60 * 0.5) * 2));
        intensity *= 0.75 - 0.5 * (cd / (w.lunarEvent.moonLordCountdownMax || 3600));
      }
      this.renderer.moonLordShake = intensity > 0
        ? { t: intensity, x: player.cx, y: player.cy } : null;
    }

    // ---- 灯笼夜 UpdateTime（Main.cs:64429 = LanternNight.UpdateTime 每帧位）：
    //      真灯笼不再满足 LanternsCanPersist（血月/入侵/月总倒计时/刷出 Boss）即提前收场。
    //      入夜 CheckNight / 黎明 CheckMorning 在下方昼夜事件 crossing 段触发 ----
    LanternNight.updateTime(this.lanternCtx());

    // ---- Boss 逻辑 ----
    if (this.boss) {
      // 原版无通用"日出剔除 Boss"机制：EoC 白天走 AI_004 自漂离、骷髅王族白天狂暴、
      // 其余 Boss（史莱姆王/世吞/克脑/蜂后/机械三王…）白天照常战斗——
      // 此前的通用 dayKill 会把白天召唤的史莱姆王秒删（史莱姆王冠原版任意时间可用）
      if (this.boss.dead) {
        // 注意:?? 与 || 混用必须加括号(esbuild 语法限制)
        const bname = ((this.boss.vanillaId != null ? Lang.npcName(this.boss.vanillaId) : null) ?? this.boss.def.name) || 'Boss';
        if (this.boss.bossFled) {
          // 离场逃走(天亮撤离/玩家死后 EncourageDespawn 消散/毁灭者黎明钻地):
          // 非击杀——不播击败公告、不写 downed 标志(原版 EncourageDespawn 语义)
          this.newText(`${bname}逃走了…`, 150, 150, 150);
        } else {
          // 通用记账:按 Boss 名写 downed 标志(原版 NPC.downedBoss 表)
          // NPC.cs:79833 BroadcastChatMessage("Announcement.HasBeenDefeated_Single", ChatColors.BossOrEvent)
          this.newText(Lang.text('Announcement.HasBeenDefeated_Single', bname), 175, 75, 255);
          const downedKey = `downed_${this.boss.vanillaId ?? 0}`;
          w.flags[downedKey] = true;
          // 首胜灯笼夜预约（NPC.cs NPCLoot 各 case SetEventFlagCleared 实参 →
          // OnGameEventClearedForTheFirstTime default/10/16-18 翻转；4/21/22 排除）。
          // id 表：11 史王 8 蜂后 13 EoC 14 世吞|克脑 15 骷髅王 19 肉山 12 世纪之花
          // 6 石头人 7 猪鲨 9 邪教徒 10 月总 24 史后 23 光女 25 鹿角怪 16/17/18 三王
          if (this.boss.vanillaId != null) {
            const ev = BOSS_GAME_EVENT_BY_NPC[this.boss.vanillaId];
            if (ev !== undefined) LanternNight.onGameEventCleared(ev);
          }
          // 星璇塔触发（NPC.cs:80194-80197：教徒 439 死 → TriggerLunarApocalypse——
          // downed_439 通用置位处直接追加，四塔就位 + 满盾 + misc[43] 公告）
          if (this.boss.vanillaId === 439) this.triggerLunarApocalypse();
        }
        // 骷髅王战斗结束（无论胜负）且未击败 → 守卫老人次日重新出现在地牢门口
        // （原版：老人在诅咒时消失，骷髅王离场/未被击败后重新生成；击败后转为裁缝）
        if (this.boss.vanillaId === 35 && !w.flags.downedSkeletron) {
          this.maybeRespawnOldMan();
        }
        this.boss = null;
      }
    }

    // ---- 树苗生长（每 5 秒扫一次） ----
    if (this.tickCount % 300 === 0) this.growSaplings();
    // ---- 城镇 NPC 入驻评估（原版 Main.cs:65021 每 7200 tick 一轮；载入后 10s 首轮
    //      ≈ UpdateTime_SpawnTownNPCs(forceUpdate)） ----
    if (this.tickCount % 7200 === 600) this.updateTownNpcArrival();
    // ---- 昼夜事件（UpdateTime_StartNight :64817 / StartDay :64876 语义） ----
    {
      const ct = w.clock.timeOfDay, pt = this._lastClockT;
      this._lastClockT = ct;
      const crossed = (a: number) => pt < a && ct >= a;
      if (crossed(Clock.DAWN)) {
        // 黎明：月相推进 + 血月清除 + 季节重算（Main.cs:64877-64890）
        w.clock.moonPhase = (w.clock.moonPhase + 1) % 8;
        w.clock.bloodMoon = false;
        // drunkWorld 黎明翻转世界邪恶类型（Main.cs:64883-64886：!dayTime 期交替腐化/猩红）
        if (w.seedFlags?.drunkWorld) w.crimson = !w.crimson;
        // 自然召唤旗白天清除（UpdateTime :64625-64626）
        this.spawnEyePending = false;
        this.spawnHardBossPending = 0;
        // 灯笼夜对黎明事件 roll 的压制（Main.cs:64541 ShouldNormalEventsBeAbleToStart
        // 在 StartDay 之前求值——此时 CheckMorning 未跑，LanternsUp 仍为真 → stopEvents）
        const lanternStopEvents = LanternNight.lanternsUp;
        // 灯笼夜黎明收场（Main.cs:64854 = LanternNight.CheckMorning）：双旗清零
        LanternNight.checkMorning();
        // ---- 月事件黎明结算（UpdateTime_StartDay :64867-64871，顺序固定：
        //      总分广播 → 强制季节 → stop；须在下方日食 roll 之前）----
        // CheckForMoonEventsStartingTemporarySeasons（Main.cs:10833-10862 1:1）：
        // 先记昨日值 → 清 ForToday → wave≥15 按事件重设 → Forever 位压制（:10845-10849，
        // 永久季种子位，随存档 flags 持久化）→ 与昨日值不同才广播 Started/Ended（:10855-10861）
        const prevForceHalloween = this.forceHalloweenForToday;
        const prevForceXMas = this.forceXMasForToday;
        this.forceHalloweenForToday = false;
        this.forceXMasForToday = false;
        if (moonEventActive(w)) {
          // CheckForMoonEventsScoreDisplay（Main.cs:10865-10877）：Misc.*MoonScore
          this.newText(
            Lang.text(w.moonEvent.kind === MOON_KIND_PUMPKIN
              ? 'Misc.PumpkinMoonScore' : 'Misc.FrostMoonScore',
            Math.floor(w.moonEvent.totalInvasionPoints)), 175, 75, 255);
          // wave≥15 → 当日强制季节（:10837-10843：南瓜月→万圣 / 霜月→圣诞）
          if (w.moonEvent.waveNumber >= 15) {
            if (w.moonEvent.kind === MOON_KIND_PUMPKIN) this.forceHalloweenForToday = true;
            else this.forceXMasForToday = true;
          }
          // stopMoonEvent（Main.cs:10879-10901）：三字段清零（不进存档）
          stopMoonEvent(w);
          // 场上事件怪离场（NPC.cs:63029：事件结束后 Charger 族 EncourageDespawn；
          // 此处对全组号 -1/-2 近似，交由各自 despawn 倒数收尾）
          for (const e of this.entities.enemies) {
            const en = e as Enemy;
            if (!en.dead && en.vanillaId != null && MOON_EVENT_GROUP[en.vanillaId] !== undefined) {
              en.encourageDespawn(10);
            }
          }
        }
        // 永久季压制（Main.cs:10845-10849：Forever 置位时清当日临时位——两态互斥）
        if (w.flags.forceHalloweenForever) this.forceHalloweenForToday = false;
        if (w.flags.forceXMasForever) this.forceXMasForToday = false;
        // 变更公告（:10855-10861：与昨日值不同即广播，含次日自动结束的 Ended 文案）
        if (prevForceHalloween !== this.forceHalloweenForToday) {
          this.newText(Lang.text(this.forceHalloweenForToday
            ? 'Misc.StartedVictoryHalloween' : 'Misc.EndedVictoryHalloween'), 50, 255, 130);
        }
        if (prevForceXMas !== this.forceXMasForToday) {
          this.newText(Lang.text(this.forceXMasForToday
            ? 'Misc.StartedVictoryXmas' : 'Misc.EndedVictoryXmas'), 50, 255, 130);
        }
        this.checkSeasonal();
        // 入侵冷却递减（Main.cs:64846-64849；1.4.5.6 无置位点，仅保留语义）
        if (w.invasionDelay > 0) w.invasionDelay--;
        // 日食自然 roll（Main.cs:64898-64920）：hardMode && downedMechBossAny &&
        // 1/20 → eclipse=true + 公告 LegacyMisc.20（remix 的 misc.106 无对应世界）。
        // 原版与当日哥布林/海盗 roll 互斥（同一段 if/else）——命中日食则跳过入侵 roll。
        // 灯笼夜压掉整段（StartDay 头部 stopEvents → return，:64893-64895）
        const mechAny = !!(w.flags['downed_125'] || w.flags['downed_126']
          || w.flags['downed_127'] || w.flags['downed_134']);
        if (!lanternStopEvents && w.flags.hardMode && mechAny && Math.random() < 1 / 20) {
          w.clock.eclipse = true;
          this.newText(Lang.misc(20), 50, 255, 130);   // ChatColors.World
        } else if (!lanternStopEvents) {
          // 哥布林军队自然 roll（Main.cs:64927-64936）：需砸过暗影珠/猩红之心；
          // 未击败过 1/3，已击败 hardMode 1/60 否则 1/30
          if (w.flags.shadowOrbSmashed && w.invasionType === INVASION_NONE
            && canStartInvasion(w, player.maxHp)) {
            const p = w.flags['downedGoblins']
              ? (w.flags.hardMode ? 1 / 60 : 1 / 30) : 1 / 3;
            if (Math.random() < p) this.startInvasionAndAnnounce(INVASION_GOBLIN);
          }
          // 海盗自然 roll（Main.cs:64938-64944 1:1）：hardMode 且砸过祭坛
          // （altarCount>0，随存档持久化）；已击败 1/60 否则 1/30。
          // 原版另有 Skyblock.lowTiles 分支（天顶空岛世界恒真），本仓库无该种子体系
          if (w.flags.hardMode && w.altarCount > 0 && w.invasionType === INVASION_NONE
            && canStartInvasion(w, player.maxHp)) {
            const p = w.flags['downedPirates'] ? 1 / 60 : 1 / 30;
            if (Math.random() < p) this.startInvasionAndAnnounce(INVASION_PIRATE);
          }
        }
      }
      if (crossed(Clock.DUSK)) {
        // 夜幕：日食清除（Main.cs:64721——日食全天持续，入夜即结束；
        // UpdateTime_StartNight 内位于血月 roll 之前）
        w.clock.eclipse = false;
        // 灯笼夜入夜兑现（Main.cs:64709 = LanternNight.CheckNight → NaturalAttempt）：
        // 首胜预约 NextNightIsLanternNight 或月总已杀后的 1/14 自然 roll（冷却 5-10 夜）
        LanternNight.checkNight(this.lanternCtx());
        // 派对入夜结算（BirthdayParty.CheckNight :40-53）：进行中则结束 + 粉字广播 misc[99]
        if (partyCheckNight(this.partyState)) {
          this.newText(Lang.misc(99), 255, 0, 160);
        }
      }
      // EoC 自然召唤 roll（StartNight :64732-64764）：!downedBoss1（BossesKeepSpawning
      // = getGood×dontStarve×非十周年 / 天顶 noAltars 豁免）&& maxHp>=200 && def>10 &&
      // 1/3（天顶 1/10）&& 城镇 NPC>=4 → spawnEye + misc[9]（入夜事件压制同血月）
      this.spawnEyePending = false;
      this.spawnHardBossPending = 0;
      if (crossed(Clock.DUSK) && !LanternNight.lanternsUp) {
        const sf = w.seedFlags ?? {};
        const bossesKeepSpawning = !!(sf.getGoodWorld && sf.theConstant && !sf.tenthAnniversary);
        const eocEligible = !w.flags['downed_4'] || bossesKeepSpawning || !!sf.skyblock;
        const townCount = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead).length;
        if (eocEligible && player.maxHp >= 200 && player.defense > 10
          && townCount >= 4 && Math.random() < (sf.skyblock ? 1 / 10 : 1 / 3)) {
          this.spawnEyePending = true;
          this.newText(Lang.misc(9), 50, 255, 130);
        } else if (!this.spawnEyePending && w.flags.hardMode && w.altarCount > 0
          && w.moonEvent.kind === 0 && !this.boss
          && !(w.flags['downed_125'] && w.flags['downed_126'] && w.flags['downed_127'])
          && Math.random() < 1 / 10) {
          // 机械 Boss 自然召唤 roll（:64765-64811）：1/10、无月事件、场上无 Boss、
          // 三机械未全灭 → 三选一（只选未击败；1000 次重抽语义）+ misc[28/29/30]
          for (let k = 0; k < 1000; k++) {
            const n = 1 + Math.floor(Math.random() * 3);
            const flag = n === 1 ? 'downed_125' : n === 2 ? 'downed_126' : 'downed_127';
            if (!w.flags[flag] || bossesKeepSpawning) {
              this.spawnHardBossPending = n;
              this.newText(Lang.misc(27 + n), 50, 255, 130);
              break;
            }
          }
        }
      }
      // 入夜事件压制（Main.cs:64717：LanternNight.LanternsUp → stopEvents=true，
      // 血月/入夜 Boss 召唤等 roll 整段跳过；须在 CheckNight 之后判读——当夜刚兑现也算）
      if (crossed(Clock.DUSK)
        && !LanternNight.lanternsUp
        && !this.spawnEyePending // 血月与 EoC 同夜互斥（:64818 !WorldGen.spawnEye 门）
        && !w.clock.bloodMoon && w.clock.moonPhase !== 4
        && w.moonEvent.kind === 0      // 月事件进行中不 roll 血月（Main.cs:64300-64306 压制）
        && player.maxHp > 120 && Math.random() < 1 / (w.seedFlags?.tenthAnniversary ? 6 : 9)) {
        // 黄昏血月 roll（Main.cs:64813-64831：1/9（十周年种子 1/6 :64815-64817），
        // 新月不行，需生命上限>120；spawnEye 门（:64818）见入夜 EoC roll——同夜命中则本 roll 整体跳过）
        w.clock.bloodMoon = true;
        this.newText(Lang.misc(8), 50, 255, 130);
      }
    }
    // ---- 高尔夫计时推进（GolfState.cs:30-36 每帧+1，封顶 3600）----
    if (this.golfScoreTime < 3600) this.golfScoreTime++;
    // ---- 自然 Boss 夜间生成（UpdateTime :64547-64621：夜间 time>4860 后每 tick；
    //      玩家条件 = active && !dead && y<worldSurface*16(或出生点在地下) &&
    //      4500px 内无月总(CanSpawnEnemiesNear :255)；EoC 命中即清旗，机械一次性）----
    if (!w.clock.isDay && !player.dead) {
      const nightTicks = (((w.clock.timeOfDay - Clock.DUSK) % 1 + 1) % 1) / (1 - (Clock.DUSK - Clock.DAWN)) * 32400;
      const nearMoonLord = this.entities.enemies.some((e) => {
        const en = e as Enemy;
        return !en.dead && en.vanillaId === 398
          && Math.hypot(en.cx - player.cx, en.cy - player.cy) < 4500;
      });
      const surfaceOk = player.y < w.groundLevel * TILE || w.spawnY > w.groundLevel;
      if (nightTicks > 4860 && surfaceOk && !nearMoonLord) {
        const offCols = Math.ceil((this.camera.viewW / this.camera.zoom / 2 + 300) / TILE);
        const offTx = Math.floor(player.cx / TILE) + (Math.random() < 0.5 ? -1 : 1) * offCols;
        if (this.spawnEyePending) {
          this.spawnEyePending = false; // 清旗无条件（:64553-64555）
          this.summonBossAtTx('eye_of_cthulhu', offTx);
        } else if (this.spawnHardBossPending > 0) {
          const n = this.spawnHardBossPending;
          this.spawnHardBossPending = 0; // 一次性机会：无论成败清零（:64596）
          if (!this.boss) {
            this.summonBossAtTx(n === 1 ? 'destroyer' : n === 2 ? 'twins' : 'skeletron_prime', offTx);
          }
        }
      }
    }
    // ---- 税务员税款累积（Main.cs:64462-64470：在场时每 3600 tick(游戏 1 小时)
    //      +50 铜 × 已入住城镇 NPC 数，上限 25 金(250000 铜)；Player.CollectTaxes :23854） ----
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === 'tax_collector')) {
      this.player.taxTimer++;
      if (this.player.taxTimer >= 3600) {
        this.player.taxTimer -= 3600;
        const housed = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead && (n as TownNPC).home).length;
        this.player.taxMoney = Math.min(250000, this.player.taxMoney + 50 * housed);
      }
    }
    // ---- 入侵状态推进（Main.cs:63775 UpdateInvasion：前线推进+胜利判定+周期公告） ----
    {
      // 旧日军团 UpdateTime（Main.cs:64431 DD2Event.UpdateTime：波间间歇/水晶在场判定）
      this.tickOldOnesArmy();
      const inv = tickInvasion(w, this.invasionWarn);
      this.invasionWarn = inv.warn;
      if (inv.announce != null && inv.announce >= 0) {
        this.newText(Lang.misc(inv.announce), 175, 75, 255);   // ChatColors.BossOrEvent 紫
      }
      if (inv.won) {
        // SetEventFlagCleared（NPC.cs:79557-79564）：首次胜利置旗；原版首胜还会经
        // OnGameEventClearedForTheFirstTime → LanternNight.NextNightIsLanternNight = true
        // （次夜灯笼夜：LanternsUp 状态 + 灯笼视觉 + 向导 Lantern1/2 对话段）。
        if (inv.won === INVASION_GOBLIN) w.flags['downedGoblins'] = true;
        else if (inv.won === INVASION_SNOW_LEGION) w.flags['downedFrost'] = true;
        else if (inv.won === INVASION_PIRATE) w.flags['downedPirates'] = true;
        else if (inv.won === INVASION_MARTIAN) w.flags['downedMartians'] = true;
        // 首胜事件 id（Main.cs:63785-63800 SetEventFlagCleared 实参）：goblin 0 /
        // frost 1 / pirates 2 / martians 3——均落入 switch default → 预约次夜灯笼夜
        const eventId = inv.won === INVASION_GOBLIN ? 0
          : inv.won === INVASION_SNOW_LEGION ? 1
            : inv.won === INVASION_PIRATE ? 2 : 3;
        LanternNight.onGameEventCleared(eventId);
      }
    }
    // ---- 旅行商人（Main.cs:64484-64505 + WorldGen.SpawnTravelNPC :5188）：
    // 白天上午(昼内进度<27000/54000)每 tick 1/108000、城镇 NPC≥2(不含老人/骷髅商)→
    // 在随机入住者家旁生成；白天过 48600(=0.65)或入夜后离屏消失 ----
    this.updateTravellingMerchant();

    // ---- 战争迷雾：玩家周围探索标记（每 15 tick） ----
    if (this.tickCount % 15 === 0) {
      w.markExplored(Math.floor(player.cx / TILE), Math.floor(player.cy / TILE), 28);
    }

    // ---- Buff 状态栏刷新（每秒） ----
    if (this.tickCount % 60 === 0) this.cb.onBuffsChanged?.();

    // ---- 相机 / 光照 ----
    this.camera.follow(player.cx, player.cy);
    this.camera.easeZoom();
    this.camera.clamp();
    this.chunks.flushDirty();
    this.chunks.advanceAnim(); // 动画陈设（制冰机/固化机/篝火/熔炉等）：换帧 tick 重建含动画 chunk
    tickEmotes();
    this.tickNpcEmotes();
    const viewTW = Math.ceil(this.camera.viewW / this.camera.zoom / TILE) + 2;
    const viewTH = Math.ceil(this.camera.viewH / this.camera.zoom / TILE) + 2;
    // 风摆动相位钟 + 玩家扰动网格（TileDrawing.Update 1:1）。网格按视区尺寸建格
    //（原版 EnsureWindGridSize 传屏幕绘制区 + 取模环形寻址，非全图）
    windSway.update(this.world.weather?.windSpeedCurrent ?? 0,
      { x: player.x, y: player.y, w: player.w, h: player.h, vx: player.vx, vy: player.vy, dead: player.dead },
      viewTW, viewTH);
    // 自然层粒子（落叶/滴水 Gore 物理）：绑定世界 + 推进
    natureParticles.bindStore(this.world.store);
    natureParticles.updateLeaves(windSway.wind, this.world.groundLevel * TILE);
    natureParticles.updateDrips(this.world.groundLevel * TILE);
    this.lighting.ensureRegion(player.cx, player.cy, viewTW, viewTH);
    // 光衰减每帧覆盖（LightingEngine.UpdateLightDecay :137-187）：群系水色 RGB 衰减表
    // + 夜枭 nightVision（air/solid ×1.03）——水下/洞穴视野随药水与群系变化
    updateLightDecay(this.renderer.waterStyle, player.buffs.has(BuffType.NightOwl), this.blackout);
    // 手持光源（原版 ItemCheck_EmitHeldItemLight Player.cs:48990）：
    // (Torches[type] && !wet) || WaterTorches[type] 才发光——入水熄灭；
    // 颜色 = TorchID.TorchColor(torchId)（TorchID.cs _lights 全表：
    // 火把 0=(1,0.95,0.8) 蓝 1=(0,0.1,1.3) 红 2=(1,0.1,0.1) 绿 3=(0,1,0.1) 紫 4=(0.9,0,0.9)
    // 超亮 5=(1.4³) 黄 6=(0.9,0.9,0) 恶魔 8=(1,1.6,0.5) 冰 9=(0.75,0.85,1.4) 沙漠 10=(1,0.5,0)
    // 丛林 11=(1.4,1.4,0.7) 腐化 12/猩红 13/神圣 15 …）；蜡烛 105/713 = (1,0.95,0.8)。
    // 生物群系火把映射（EmitHeldItemLight 显式 case + item≥427 → torchId=item-426）
    const heldDef = player.inv.heldDef();
    const TORCH_LIGHT: Record<number, [number, number, number]> = {
      0: [1, 0.95, 0.8], 1: [0, 0.1, 1.3], 2: [1, 0.1, 0.1], 3: [0, 1, 0.1], 4: [0.9, 0, 0.9],
      5: [1.4, 1.4, 1.4], 6: [0.9, 0.9, 0], 8: [1, 1.6, 0.5], 9: [0.75, 0.85, 1.4],
      10: [1, 0.5, 0], 11: [1.4, 1.4, 0.7], 12: [0.75, 1.35, 1.5], 13: [0.95, 0.75, 1.3],
      15: [1, 0, 1], 16: [1.4, 0.85, 0.55], 17: [0.25, 1.3, 0.8], 18: [0.95, 0.4, 1.4],
      19: [1.4, 0.7, 0.5], 20: [1.25, 0.6, 1.2], 21: [0.75, 1.45, 0.9], 22: [0.3, 0.78, 1.2],
    };
    let heldRGB: [number, number, number] | null = null;
    // 荧光棒族手持光（EmitHeldItemLight 各 case，Player.cs:49288-49430）：仅 !pulley 门、
    // **无湿门——水下也亮**（与火把的 (Torches&&!wet) 不同）：282=(0.7,1,0.8) /
    // 286=(0.7,0.8,1) / 3112=(1,0.6,0.85) / 3002=(1.05,0.95,0.55) / 4776=(0.9,0.35,1)
    // （附 4.5 格泛光近似省略）；5643 彩虹 = Disco 轮转
    if (heldDef) {
      const gvid = heldDef.key === 'torch' ? -1 : viIdFromKey(heldDef.key);
      const GLOWSTICK_LIGHT: Record<number, [number, number, number]> = {
        282: [0.7, 1, 0.8], 286: [0.7, 0.8, 1], 3112: [1, 0.6, 0.85],
        3002: [1.05, 0.95, 0.55], 4776: [0.9, 0.35, 1],
      };
      if (gvid === 5643) {
        const ph = Math.floor(this.tickCount / 10) % 6;
        heldRGB = ([[1, 0.2, 0.2], [1, 1, 0.2], [0.2, 1, 0.2], [0.2, 1, 1], [0.2, 0.2, 1], [1, 0.2, 1]] as Array<[number, number, number]>)[ph];
      } else if (gvid >= 0 && GLOWSTICK_LIGHT[gvid]) {
        heldRGB = GLOWSTICK_LIGHT[gvid];
      }
    }
    // 水炬三色（ItemID.Sets.WaterTorches = 523/1333/4384，ItemID.cs:1194）：
    // EmitHeldItemLight 的 (Torches && !wet) || WaterTorches——水炬水下也亮
    const WATER_TORCH_ITEMS = new Set([523, 1333, 4384]);
    const heldVid0 = heldDef ? (heldDef.key === 'torch' ? 8 : viIdFromKey(heldDef.key)) : -1;
    if (!heldRGB && heldDef && WATER_TORCH_ITEMS.has(heldVid0)) {
      const BIOME_TORCH_ITEM2: Record<number, number> = {
        523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
        4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
      };
      const t = BIOME_TORCH_ITEM2[heldVid0];
      const c = t !== undefined ? TORCH_LIGHT[t] : undefined;
      heldRGB = c ? [...c] as [number, number, number] : [1, 0.95, 0.8];
    }
    if (!heldRGB && heldDef && !player.inWater) {
      const vid = heldDef.key === 'torch' ? 8 : viIdFromKey(heldDef.key);
      if (Number.isFinite(vid)) {
        // 蜡烛（ItemCheck 尾段 type 105/713）：同火把基色
        if (vid === 105 || vid === 713) heldRGB = [1, 0.95, 0.8];
        else if (vid === 8) heldRGB = TORCH_LIGHT[0]!;
        else {
          // 火把物品集（ItemID.Sets.Torches；TEdit items 实名核对）→ torchId：
          // 彩色火把 427-433 = id-426；群系火把显式 case（523→8,974→9,1245→10,1333→11,
          // 2274→12,3004→13,3045→14,3114→15,4383-4388→16-21,5293→22,5353→23）
          const BIOME_TORCH_ITEM: Record<number, number> = {
            523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
            4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
          };
          const torchId = vid >= 427 && vid <= 433 ? vid - 426 : BIOME_TORCH_ITEM[vid];
          if (torchId !== undefined) {
            const c = TORCH_LIGHT[torchId];
            if (c) heldRGB = c;
            else if (torchId === 7) heldRGB = [1, 1.6, 0.5];      // 恶魔火把(动画光源近似)
            else if (torchId === 14) {                             // 彩虹火把:Disco 轮转近似
              const ph = Math.floor(this.tickCount / 10) % 6;
              heldRGB = ([[1, 0.2, 0.2], [1, 1, 0.2], [0.2, 1, 0.2], [0.2, 1, 1], [0.2, 0.2, 1], [1, 0.2, 1]] as Array<[number, number, number]>)[ph];
            } else if (torchId === 23) heldRGB = [0.4, 0.85, 1.4]; // 微光火把(Shimmer 近似)
          }
        }
      }
    }
    // 光芒药水（buff 11 shine，Player.cs:9872 Light.AddLight 玩家格 1.3/1.3/1.3）与
    // 狱火药水（:9899 0.65/0.4/0.1）——无条件常亮，与手持火把同通道
    if (!heldRGB && player.buffs.has(BuffType.Shine)) heldRGB = [1.3, 1.3, 1.3];
    if (!heldRGB && player.buffs.has(BuffType.Inferno)) heldRGB = [0.65, 0.4, 0.1];
    const torchOn = !!heldRGB;
    const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
    const prevLight = this.lighting.heldLight;
    this.lighting.heldLight = heldRGB ? { tx: ptx, ty: pty, r: heldRGB[0], g: heldRGB[1], b: heldRGB[2] } : null;
    if (torchOn !== !!prevLight ||
      (torchOn && prevLight && (prevLight.tx !== ptx || prevLight.ty !== pty
        || prevLight.r !== heldRGB![0] || prevLight.g !== heldRGB![1] || prevLight.b !== heldRGB![2]))) {
      this.lighting.dirty = true;
    }
    // 弹幕动态点光(原版 Projectile.ProjLight() cs:14809：light 标量 × 逐类型
    // RGB 乘区表；荧光棒/燃烧箭/火花/火焰镖等飞行中发光——均暴露 projId)。
    // 荧光棒族颜色表（cs:15060-15091，与手持光同色）：
    //   50=(0.7,1,0.8) 53=(0.7,0.8,1) 473=(1.05,0.95,0.55) 515=(1,0.6,0.85)
    //   870=(0.9,0.35,1) 1089=Disco 轮转
    const PROJ_LIGHT_RGB: Record<number, [number, number, number]> = {
      50: [0.7, 1, 0.8], 53: [0.7, 0.8, 1], 473: [1.05, 0.95, 0.55],
      515: [1, 0.6, 0.85], 870: [0.9, 0.35, 1],
    };
    for (const p of this.entities.projectiles) {
      const pid = (p as { projId?: number }).projId;
      if (pid == null) continue;
      const l = projectileData(pid)?.light;
      if (!l || l <= 0) continue;
      const pe = p as unknown as { x: number; y: number; w: number; h: number };
      const rgb = pid === 1089
        ? ([[1, 0.2, 0.2], [1, 1, 0.2], [0.2, 1, 0.2], [0.2, 1, 1], [0.2, 0.2, 1], [1, 0.2, 1]] as Array<[number, number, number]>)[Math.floor(this.tickCount / 10) % 6]
        : PROJ_LIGHT_RGB[pid] ?? [1, 1, 1];
      this.lighting.addLight(
        Math.floor((pe.x + pe.w / 2) / TILE), Math.floor((pe.y + pe.h / 2) / TILE),
        l * rgb[0], l * rgb[1], l * rgb[2],
      );
    }
    // 掉落物点光（WorldItem.UpdateItem_VisualEffects :1467-1471 + :1455-1461 + :1684-1703）：
    // createTile==4 火把族 → TorchColor；蜡烛(105) → [1,0.95,0.8]；均 !wet。
    // 荧光棒族（282/286/3002）：水中也发光（原版分支无 !wet 门控）
    for (const dent of this.entities.drops) {
      const d = dent as ItemDrop;
      const def = ITEM_DEFS[d.itemId];
      if (!def) continue;
      const tx = Math.floor((d.x + d.w / 2) / TILE), ty = Math.floor((d.y + d.h / 2) / TILE);
      const dst = this.world.store;
      if (!dst.inBounds(tx, ty)) continue;
      const isTorch = def.tile === 'torch';
      const isCandle = def.tile === 'candle';
      if (isTorch || isCandle) {
        if (dst.liquid[dst.idx(tx, ty)] > 100) continue; // !wet
        this.lighting.addLight(tx, ty, 1, 0.95, 0.8);
        continue;
      }
      // 荧光棒族（vi id → 原版色；无 wet 门控）
      const vid = viIdFromKey(def.key);
      if (vid === 282) this.lighting.addLight(tx, ty, 0.7, 1, 0.8);
      else if (vid === 286) this.lighting.addLight(tx, ty, 0.7, 0.8, 1);
      else if (vid === 3002) this.lighting.addLight(tx, ty, 1.05, 0.95, 0.55);
      else if (vid === 75) this.lighting.addLight(tx, ty, 0.8, 0.7, 0.1);      // 坠落之星 :1719
      else if (vid === 183) this.lighting.addLight(tx, ty, 0.15, 0.45, 0.9);   // 陨石锭 :1715
    }
    // 实体点光（原版 Lighting.AddLight 的 NPC 侧调用）：AI 每 tick 写 lightRGB——
    // 萤火虫族闪烁（NPC.cs:34395-34407，昼地表不亮）、发光蜗牛/熔岩蜗牛恒定（:34623-34630）、
    // 魔化夜 crawler 抖动（:34492）；敌怪与小动物两桶同扫
    for (const bucket of [this.entities.enemies, this.entities.critters, this.entities.projectiles]) {
      for (const ent of bucket) {
        const l = (ent as Enemy).lightRGB;
        if (!l) continue;
        const e2 = ent as Enemy;
        // 光源像素坐标覆盖（火把僵尸 590/591 手持火把偏移格；缺省=实体中心）
        const at = (ent as Enemy).lightRGBAt;
        const tx2 = Math.floor((at ? at.x : e2.cx) / TILE), ty2 = Math.floor((at ? at.y : e2.cy) / TILE);
        if (this.world.store.inBounds(tx2, ty2)) this.lighting.addLight(tx2, ty2, l[0], l[1], l[2]);
      }
    }
    // 水母潜水装备浸水发光（Player.cs:14682-14688：wet 时中心 AddLight 1.8/0.4/1.2）
    if (this.player.inWater && this.player.equipStats.jellyfishGlow) {
      this.lighting.addLight(
        Math.floor(this.player.cx / TILE), Math.floor(this.player.cy / TILE), 1.8, 0.4, 1.2);
    }
    this.lighting.compute(w.clock.dayFactor);

    // ---- 粒子与飘字 ----
    this.flushInvNotify();
    // 世界运行时演化（原版 WorldGen.UpdateWorld 1:1，见 src/world/evolution/）：
    // 草蔓延/藤蔓/仙人掌/药草/苔藓/蛛网/贝壳/困难模式邪恶神圣蔓延+水晶叶绿
    this.evolution.update();
    this.torchGod.update();
    // ---- 幸运度时序（Player.UpdateLuckFactors :28656-28670：瓢虫/钱币/碎镜衰减）----
    const pl = this.player.luckState;
    pl.lanternsUp = LanternNight.lanternsUp;   // RecalculateLuck :28679（每帧读边）
    pl.update();
    // ---- 吸血预算回充（Player.cs:24196-24216：专家 +0.5/t 钳 70；普通 +0.6/t 钳 80）----
    // 专家判定读**世界难度** Main.expertMode（Main.cs:2775：GameMode 1/2）——
    // 角色难度（软/中/硬核）只管死亡惩罚，不参与此处（曾错接 appearance.difficulty）
    {
      const expert = w.isExpert;
      this.player.lifeSteal = Math.min(expert ? 70 : 80, this.player.lifeSteal + (expert ? 0.5 : 0.6));
    }
    // 小动物环境生成：按昼夜在地表视野外生成，上限 8 只
    if (this.tickCount % 120 === 0 && this.entities.critters.length < 8) {
      this.spawnCritter();
    }
    // 怪物碾压小动物：任意敌人身体接触即杀死（不视为交战）
    if (this.tickCount % 4 === 0 && this.entities.critters.length) {
      for (const cent of this.entities.critters) {
        const c = cent as Critter;
        if (c.dead) continue;
        for (const eent of this.entities.enemies) {
          const e = eent as Enemy;
          if (c.x < e.x + e.w && c.x + c.w > e.x && c.y < e.y + e.h && c.y + c.h > e.y) {
            c.hurt(this);
            break;
          }
        }
      }
    }
    // 僵尸环境呻吟：附近有僵尸时偶发（每 ~4-8 秒）
    if (this.tickCount % 300 === 0) {
      for (const ent of this.entities.enemies) {
        const e = ent as Enemy;
        if (e.key !== 'zombie' && e.key !== 'magma_zombie') continue;
        if (Math.hypot(e.cx - this.player.cx, e.cy - this.player.cy) < TILE * 30) {
          this.sfx.playWav('zombie', 0.6, e.cx, e.cy);
          break;
        }
      }
    }
    // 火把火苗：视内点燃火把随机飘出火星（火点在格顶上方 20px 精灵的火焰处）
    this.emitTorchSparks();
    this.emitTileParticles();
    for (const p of this.particles) {
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; } // 空气阻力：喷溅后缓慢减速飘散
      // 地形碰撞：目标位置实心则反弹（冲击大）或停驻地表（冲击小，重力归零缓慢淡出）
      const st = this.world.store;
      const solidAt = (x: number, y: number) => {
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        return st.inBounds(tx, ty) && st.isSolid(tx, ty);
      };
      let nx = p.x + p.vx;
      if (solidAt(nx, p.y)) { p.vx *= -0.4; nx = p.x; }
      let ny = p.y + p.vy;
      if (solidAt(nx, ny)) {
        if (p.vy > 1.6) {
          p.vy = -p.vy * 0.35; // 溅落反弹
          p.vx *= 0.6;
        } else {
          p.vy = 0; p.vx *= 0.5; p.grav = 0; // 停驻地表
        }
        ny = p.y;
      }
      p.x = nx; p.y = ny;
    }
    // 就地压缩(2026-08 审计 G9:此前每 tick 两个 filter 新数组)
    compactByLife(this.particles);
    for (const d of this.dmgNumbers) {
      d.life--;
      d.y += d.vy;
      d.vy *= 0.94;
    }
    compactByLife(this.dmgNumbers);

    inp.endFrame();

    // 挥剑命中判定（实体更新后）
    this.postUpdate();
  }

  // ================= 物品使用：挖掘 / 放置 / 攻击 / 使用 =================

  /** vi_ 工具桥接（vanilla-itemfunc.json pick/axe/hammer → tool def）。
   *  双工具族（Hamaxe 579/990/1294/2176 = pick+axe；The Axe 132 等 6 件 = axe+hammer）
   *  按 Player.cs:45040-45045 语义单物品同时携带多力：主类型仍取 pick>axe>hammer
   *  供挥击/智能光标用，三力附在 pickPower/axePower/hammerPower 上——挖掘入口
   *  dualToolResolve 按目标 tile 族（tileAxe/tileHammer）分流取对应力 */
  /** 魔力花族自动喝蓝（manaFlower：施法魔力不足时自动消耗背包魔力药水，
   *  Player.cs QuickMana 原理同 QuickHeal；返回 true=已补蓝可重试施法） */
  private tryAutoManaPotion(): boolean {
    const inv = this.player.inv;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      const def = ITEM_DEFS[s.id];
      if (!def) continue;
      const m = /^vi_(\d+)_/.exec(def.key);
      if (!m) continue;
      const f = itemFuncOfVid(+m[1]);
      if (f?.healMana && f.consumable && !f.createTile) {
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + f.healMana);
        this.player.buffs.apply(BuffType.ManaSickness, 5); // 魔力眩晕（300t/瓶）
        inv.removeAt(i, 1);
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
        return true;
      }
    }
    return false;
  }

  private itemFuncTool(id: number): (typeof ITEM_DEFS)[number]['tool'] {
    const def = ITEM_DEFS[id];
    if (!def) return undefined;
    const m = /^vi_(\d+)_/.exec(def.key);
    if (!m) return undefined;
    const f = itemFuncOfVid(+m[1]);
    if (!f || !(f.pick || f.axe || f.hammer)) return undefined;
    const c = itemCombat(+m[1]);
    return {
      type: f.pick ? 'pick' : f.axe ? 'axe' : 'hammer',
      power: f.pick ?? f.axe ?? f.hammer,
      damage: c?.damage ?? 5,
      speed: c?.useAnimation ?? 25,
      useTime: c?.useTime ?? 20,
      knockback: c?.knockBack ?? 3,
      // 双工具副力（单工具时与主 power 同值，dualToolResolve 只在多力时改道）
      pickPower: f.pick ?? undefined,
      axePower: f.axe ?? undefined,
      hammerPower: f.hammer ?? undefined,
    } as NonNullable<(typeof ITEM_DEFS)[number]['tool']>;
  }

  /** 通用消耗品语义门（vanilla-itemfunc）：必须确有 heal/buff 语义才允许占用
   *  else-if 槽位——生命水晶(29)/魔力水晶(109)/生命果(1291)/弓枪族等无此语义，
   *  若被本分支空认领会把链条后续分支全部饿死（else-if 匹配即终止） */
  private consumableFuncGate(def: (typeof ITEM_DEFS)[number]): boolean {
    const fm = /^vi_(\d+)_/.exec(def.key);
    const ff = fm ? itemFuncOfVid(+fm[1]) : null;
    return !!ff?.consumable && !ff.createTile && !ff.shoot && !ff.pick && !ff.axe && !ff.hammer
      && (!!ff.healLife || !!ff.healMana || !!(ff.buffType && ff.buffType > 0));
  }

  /** 手持物 useStyle 分族（Player.cs:49939 ItemCheck_ApplyUseStyle switch）：
   *  vi_ → vanilla-itemfunc.useStyle（2141 件分布 1:1504 / 4:74 / 5:243 / 9:70 …）；
   *  legacy 药水无 vid → 9（Item.DefaultToHealingPotion：useStyle=9 举杯）；
   *  其余 legacy 缺数据 → 1（挥砍）。返回值供 Renderer 姿势/身体行路由 */
  private heldUseStyle(def: (typeof ITEM_DEFS)[number] | null): number {
    if (!def) return 1;
    const vid = def.vid ?? viIdFromKey(def.key);
    if (vid >= 0) return itemFuncOfVid(vid)?.useStyle ?? 1;
    if (def.potion || def.heal) return 9; // 治疗类（含仅标 heal 的 legacy）
    // legacy 无 vid 的原版 4 族（Boss 召唤物/生命水晶，Item.cs SetDefaults useStyle=4）
    return LEGACY_USE_STYLE[def.key] ?? 1;
  }

  /** 使用动画时长（Player.itemAnimationMax = item.useAnimation）：
   *  vi_ 取 vanilla-itemcombat.useAnimation；legacy 工具 def.tool.speed；
   *  无数据 → 30（原版绝大多数消耗品 useAnimation 15-45 的中位近似） */
  private heldUseAnimation(def: (typeof ITEM_DEFS)[number] | null): number {
    if (!def) return 30;
    if (def.tool?.speed) return Math.max(10, def.tool.speed);
    const vid = def.vid ?? viIdFromKey(def.key);
    if (vid >= 0) {
      const ua = itemCombat(vid)?.useAnimation;
      if (ua && ua > 0) return Math.max(4, ua);
    }
    return 30;
  }

  /** 启动一次使用动画（itemAnimation>0 的本项目等价）。
   *  useStyle 5/13（弓/枪/法杖/短剑）附 aim 瞄准角——Renderer 持物姿势与
   *  bodyFrame 行档（Player.cs:35986 useStyle==5 的 itemRotation*direction 档）依赖 */
  private useSwing(def: (typeof ITEM_DEFS)[number] | null, aim?: number): void {
    if (!def) return;
    const us = this.heldUseStyle(def);
    const dur = this.heldUseAnimation(def);
    this.swing = {
      t: dur, dur, item: ITEM_BY_KEY[def.key] ?? 0,
      useStyle: us,
      aim: us === 5 || us === 13 ? aim : undefined,
    };
    this.swingHitSet.clear();
    this.swingTileCutSet.clear();
  }

  /** 双工具分流（Player.cs:45040-45045：tileHammer→锤力 / tileAxe→斧力 / 其余→镐力）。
   *  Hamaxe 族（pick+axe）对树族用斧力、对矿石用镐力；The Axe 族（axe+hammer）
   *  对树族用斧力、其余（锤墙/坡面）走锤。单工具原样返回 */
  private dualToolResolve(
    tool: NonNullable<(typeof ITEM_DEFS)[number]['tool']>,
    targetType: number,
  ): { type: 'pick' | 'axe' | 'hammer'; power: number } {
    const d = tool as NonNullable<(typeof ITEM_DEFS)[number]['tool']> & {
      pickPower?: number; axePower?: number; hammerPower?: number;
    };
    const multi = !!((d.pickPower && d.axePower) || (d.axePower && d.hammerPower) || (d.pickPower && d.hammerPower));
    if (!multi) return { type: tool.type as 'pick' | 'axe' | 'hammer', power: tool.power ?? 10 };
    const sheet = TILE_DEFS[targetType]?.vanilla?.sheet ?? -1;
    if (TILE_AXE_SHEETS.has(sheet) && d.axePower) return { type: 'axe', power: d.axePower };
    if (d.pickPower) return { type: 'pick', power: d.pickPower };
    return { type: 'hammer', power: d.hammerPower ?? tool.power ?? 10 };
  }

  /** 智能光标设置（对齐原版 Player.SmartCursorSettings + Main.cs:49705 设置结构） */
  private smartSettings(): SmartCursorSettings {
    const d = options.data;
    return {
      toggleMode: d.smartCursorMode === 'toggle',
      smartAxeAfterPickaxe: !!d.smartAxeAfterPickaxe,
      smartBlocksEnabled: !!d.smartBlocksEnabled,
      holdCanReleaseMidUse: !!d.smartHoldCanReleaseMidUse,
    };
  }

  /**
   * 智能光标每帧驱动（Player.cs:25159-25163 每帧 SmartCursorLookup + :28344-28374 Toggle/Hold 状态机）。
   * Ctrl 按下沿翻转（Toggle）/跟随（Hold）；切换播音效 12（menuTick）。
   * 必须在 updateUse 之前跑——同帧 lookup 结果即被挖掘/放置路径覆盖 tx/ty。
   */
  private updateSmartCursor() {
    const inp = this.input;
    const sc = this.smartCursor;
    const s = this.smartSettings();
    const controlSmart = inp.down('ControlLeft') || inp.down('ControlRight');
    if (sc.updateWanted(controlSmart, !!inp.mouseDown, s)) this.sfx.play('menuTick');
    const blocked = inp.uiBlocking || this.player.dead || !!this.minecart
      || this.renderer.fullMap.open || this.renderer.timeUiHover || this.renderer.weatherUiHover
      || this.annotateMode;
    if (blocked || !sc.wanted) { sc.showing = false; VUI.smartCursorOn = false; return; }
    const held = this.player.inv.heldItem();
    const heldDef = held ? ITEM_DEFS[held.id] : null;
    const tool = heldDef?.tool ?? (held ? this.itemFuncTool(held.id) : undefined);
    const [mx, my] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
    const p = this.player;
    // 放置物才有 blockRange（原版 SmartCursorLookup :95-98 createWall/createTile 才加）；
    // 工具 tileBoost=0
    const placing = heldDef?.tile != null || heldDef?.wallId != null;
    const tb = placing
      ? (p.equipStats.tileRange ? 3 : 0) + (p.buffs.has(BuffType.Builder) ? 1 : 0)
      : 0;
    // EmptyTile 的占位实体（玩家 + 敌怪 + 城镇 NPC）
    const occupants: Array<{ x: number; y: number; w: number; h: number }> = [
      { x: p.x, y: p.y, w: p.w, h: p.h },
    ];
    for (const e of this.entities.enemies) occupants.push({ x: e.x, y: e.y, w: e.w, h: e.h });
    for (const e of this.entities.npcs) occupants.push({ x: e.x, y: e.y, w: e.w, h: e.h });
    sc.lookup({
      st: this.world.store,
      mouse: { x: mx, y: my },
      actor: { x: p.x, y: p.y, w: p.w, h: p.h, cx: p.cx, cy: p.cy, facing: p.facing },
      held: { def: heldDef, tool: tool ? { type: tool.type, power: tool.power ?? 0 } : null },
      settings: s,
      tileBoost: tb,
      wireToolMode: this.wireToolMode,
      occupants,
      controlUseItem: !!inp.mouseDown,
      // Step_AlchemySeeds 成熟药草判定（WorldGen.cs:66198-66225 IsAlchemyPlantHarvestable）
      // 所需世界态；Main.time 口径 = 白天 (t-0.25)*54000 / 夜晚 (t-0.75 / t+0.25)*32400
      alchemy: {
        dayTime: this.world.clock.isDay,
        bloodMoon: this.world.clock.bloodMoon,
        moonPhase: this.world.clock.moonPhase,
        raining: this.world.weather.raining,
        cloudAlpha: this.world.weather.cloudAlpha,
        time: vanillaMainTime(this.world.clock.timeOfDay),
        worldSurface: this.world.groundLevel,
        remixWorld: false,
        maxTilesY: this.world.store.h,
      },
    });
    // 指针切到 Cursors[12] 智能光标帧（Main.cs:47442-47513 num=11+smart.ToInt()）
    VUI.smartCursorOn = sc.showing;
  }

  /**
   * 智能选取每帧驱动（Player.cs:17283-17562 SmartSelectLookup 族）。
   * 与智能光标独立、可同按：Shift（键绑定 "SmartSelect" = LeftShift，PlayerInput.cs:1898）
   * 按住 → 按鼠标所指格的策略优先级（提取机 7 / 大炮 6 / 锤 1 / 斧 2 / 刮漆 8 / 镐 3 /
   * 湿格水下光源 4）在 0-49 找对应工具自动切过去；松开还原原槽（SelectedItemState.overridden）。
   * 与智能光标共存：两系统互不知晓，同一帧可各自生效。
   */
  private updateSmartSelect() {
    const inp = this.input;
    const p = this.player;
    if (!inp || !p) return;
    // controlTorch（TriggersSet.cs:794）。Input.down 自带 uiBlocking 门 = 原版
    // 键盘 UI 模式/mouseInterface 让位（TriggersSet.cs:782-784）的等价；
    // 全屏地图打开时输入归地图（对应原版 MapFullscreen 输入模式无 SmartSelect 触发）
    const controlTorch = inp.down('ShiftLeft') && !this.renderer.fullMap.open;
    const [mx, my] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
    const canvas = this.renderer.canvas;
    // Main.screenPosition（视区左上角世界坐标；camera.x/y 是视区中心）
    const screenTopY = this.camera.y - canvas.height / 2 / this.camera.zoom;
    const env: SmartSelectEnv = {
      controlTorch,
      usingGamepad: false,                       // PlayerInput.UsingGamepad（本作无手柄）
      st: this.world.store,
      mouseX: mx, mouseY: my,
      screenTopY,
      screenHeight: canvas.height / this.camera.zoom,
      player: {
        x: p.x, y: p.y, w: p.w, h: p.h,
        gravDir: 1,                              // 反重力未实装（同 SmartCursor 口径）
        // Player.wet（Player.cs:27540 经 Collision.WetCollision Collision.cs:1575 判定）；
        // p.inWater 为脚部液量>100 的简化门，此处按原版命中盒中心盒求交精确复刻
        wet: p.inWater || wetCollision(this.world.store, p.x, p.y, p.w, p.h),
      },
      slots: this.smartSelectSlots(),
      selectedItem: p.inv.selected,
      // IsInTileInteractionRange（Player.cs:31548，Simple 档 tileRangeX=5/tileRangeY=3 + TB）
      inRange: (tx, ty, tb) => this.inTileRange(tx, ty, tb),
    };
    // SelectedItemState（Player.cs:383-517）宿主：换选/还原由 SmartSelect 代管
    // SelectedItemState.Hotbar（:391）= 最近一次 0-9 快捷栏选择（Select :437-439 item<10 时记）；
    // 本作数字键直写 inv.selected，故在此跟随记录
    if (p.inv.selected <= 9) this.smartSelectHotbar = p.inv.selected;
    const host: SmartSelectHost = {
      selected: p.inv.selected,
      hotbar: this.smartSelectHotbar,
      canChangeImmediately: !this.swing && p.useTime === 0,
      // CanChangeSelectedItemImmediately（Player.cs:386-393）：itemAnimation/itemTime 空——
      // 本作 swing = itemAnimation、player.useTime = itemTime；reuseDelay/channel/
      // pendingItemReuse 未实装
      isSlotEmpty: (i) => !p.inv.slots[i],
      onSelectionChanged: () => this.cb.onInventoryChanged(),
    };
    this.smartSelect.update(env, host);
    p.inv.selected = host.selected;
  }

  /**
   * inventory 0-57 的 Smart Select 槽画像（Player.cs:17326 的 inventory[i].type 等窄视图）。
   * 0-49 背包 + 50-53 钱币 + 54-57 弹药——case 4/5 信号枪弹药门扫到 57（:17374/:17410）。
   * 三力取 vanilla-itemfunc 全量（Hamaxe 斧+锤 / Drax 镐+斧 副力保留），legacy def.tool
   * 画像只覆盖自身类型主力（与 updateUse 的工具判定同序）。
   * 结果写入复用缓冲（每帧调用，防分配热点——perf-audit-2026-08 口径）。
   */
  private smartSelectSlots(): SmartSelectSlot[] {
    const inv = this.player.inv;
    for (let i = 0; i < INV_SIZE; i++) {
      const it = inv.slots[i];
      const buf = this._smartSelectSlots[i];
      if (!it) { this._smartSelectSlots[i] = EMPTY_SLOT; continue; }
      const def = ITEM_DEFS[it.id];
      this._smartSelectSlots[i] = smartSelectSlotOf(
        def,
        it.stack,
        itemFuncOfInternal(it.id, def?.key ?? ''),
        def?.tool ? { type: def.tool.type as 'pick' | 'axe' | 'hammer', power: def.tool.power ?? 0 } : null,
        buf === EMPTY_SLOT ? undefined : buf,
      );
    }
    return this._smartSelectSlots;
  }

  private updateUse(_dt: number) {
    const inp = this.input;
    // ---- 矿车坐骑（Mount 6 + Minecart.cs 轨道运动学；物理在 Minecart.fixedUpdate）----
    if (this.minecart) {
      const cart = this.minecart;
      const [mtx, mty] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
      const mType = this.world.store.get(mtx, mty);
      // R（坐骑键）：骑乘中下车（Player.TryToDismount 路径 :5768-5776）
      if (inp.down('KeyR') && !this.cartKeyLatch) {
        this.dismountMinecart();
        this.cartKeyLatch = true;
      }
      if (!inp.down('KeyR')) this.cartKeyLatch = false;
      // 右键轨道：骑乘中 → 下车（Player.cs:32806-32812 type==314 && mount.Cart 分支）
      if (inp.rightDown && mType === this.trackTile && this.trackTile !== 0) {
        this.dismountMinecart();
        this.input.rightDown = false;
      }
      if (cart.dead || !cart.mounted) {
        this.minecart = null;
        this.player.ridingCart = false;
        this.player.cart = null;
      }
      return;
    }
    // R（坐骑键）：未骑乘 + 附近有轨道 → QuickMinecart 上车（Player.cs:5796-5827：
    // 射程内取最近轨道格 + CanHitLine 视线门）
    if (inp.down('KeyR') && !this.cartKeyLatch && this.trackTile !== 0) {
      this.cartKeyLatch = true;
      this.tryQuickMinecart();
    }
    if (!inp.down('KeyR')) this.cartKeyLatch = false;
    // 全屏地图打开时鼠标交给地图（拖动/缩放/传送），不触发挖掘/放置/攻击/使用。
    // 时间调整按钮/面板悬停同理（renderer.timeUiHover 渲染期写入）
    if (inp.uiBlocking || this.player.dead || this.renderer.fullMap.open || this.renderer.timeUiHover || this.renderer.weatherUiHover) {
      this.mining = null;
      return;
    }
    const held = this.player.inv.heldItem();
    const heldDef = held ? ITEM_DEFS[held.id] : null;
    const [rawTx, rawTy] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
    let tx = rawTx, ty = rawTy;
    // 工具判定：legacy def.tool 优先；vi_ 镐/斧/锤经 vanilla-itemfunc 桥接（数值取 combat 表）
    const tool = heldDef?.tool ?? (held ? this.itemFuncTool(held.id) : undefined);
    const vw2 = this.renderer.canvas.width, vh2 = this.renderer.canvas.height;

    // 右键轨道：(最优先,防 NPC 交谈拦截) → 附近宝箱 → NPC 交谈 → 交互
    //（Player.cs:32806-32812：右键轨道格 → LaunchMinecartHook——与手持物品无关，
    //  用"最佳矿车"（装备槽 > 手持 > 背包）；矿车是坐骑召唤物，不消耗）
    const type = this.world.store.get(tx, ty);
    if (inp.rightDown && !this.minecart && type === this.trackTile && this.trackTile !== 0) {
      const tex = this.bestCartTexture();
      if (tex) {
        if (this.mountMinecartAt(tx, ty, tex)) this.input.rightDown = false;
        return;
      }
    }
    if (inp.rightDown) {
      // 光标格本身是蜥蜴祭坛时跳过 ±1 格宝箱搜索——神庙宝箱全庙随机散布可能
      // 贴着祭坛，原版无 ±1 搜索（点到箱本体才开箱）；不跳过则右键祭坛变成开箱
      const cursorIsAltar = type === TILE_BY_KEY['v_237_lihzahrd_altar'];
      const nearChest = cursorIsAltar ? null : this.findChestNear(tx, ty);
      if (nearChest) {
        this.tryOpenChest(nearChest);
        this.input.rightDown = false;
      } else if (this.talkToNearbyNpc(tx, ty)) {
        this.input.rightDown = false;
      } else if (heldDef && viIdFromKey(heldDef.key) === 5289) {
        // 矿车升级套件（Item 5289 MinecartPowerup → Player.unlockedSuperCart = true）：
        // 永久解锁 SuperCart 档（runSpeed 20/accel 0.1/jump 5.15，Mount.cs:371-379），
        // 持久化于世界 flags；已解锁时不再消耗
        if (!this.superCartUnlocked()) {
          (this.world.flags as Record<string, boolean>).superCart = true;
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.SuperCartUnlocked'));
        }
        this.input.rightDown = false;
      } else if (heldDef?.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.input.rightDown = false;
      } else {
        this.interactAt(tx, ty);
      }
    }

    // 智能光标覆盖（SmartCursorHelper.cs:157-162）：只影响左键使用路径（挖掘/放置/电路工具），
    // 右键交互（宝箱/门/NPC 交谈）上面已用原始鼠标格 rawTx/rawTy 处理完毕
    if (this.smartCursor.showing) {
      tx = this.smartCursor.x;
      ty = this.smartCursor.y;
    }

    if (!inp.mouseDown || this.annotateMode) {
      this.mining = null;
      return;
    }

    // 近战挥剑（vi_ 数据驱动近战武器同走挥击，数值取 combat 表；攻速配饰：猛爪手套 ×2）
    const cw = heldDef ? combatWeapon(heldDef) : null;
    const cwMelee = cw?.kind === 'melee' ? cw : null;
    if (tool?.type === 'sword' || cwMelee) {
      // ★挥击时长 = useAnimation、复用冷却 = useTime（Player.ItemCheck：itemAnimationMax 与
      // itemTime 分立；1790 件 vi 武器两者不同——此前把 useTime 当动画时长，挥速虚快 35%+）
      // autoReuse 持按链式：useTime<useAnimation 时原版会在动画未走完时重置弧线（下挥被截）
      const nativeSpd = tool?.speed;
      const animSpd = nativeSpd != null
        ? Math.max(12, Math.round(nativeSpd / this.player.attackSpeedMult))
        : Math.max(4, Math.round((cwMelee!.useAnimation) / this.player.attackSpeedMult));
      const reuseSpd = nativeSpd != null
        ? animSpd
        : Math.max(2, Math.round((cwMelee!.useTime) / this.player.attackSpeedMult));
      const autoReuse = cwMelee ? cwMelee.autoReuse : true; // 原生 legacy sword 保持持按连挥
      const clickEdge = inp.mouseDown && !this.prevSwingMouse;
      const canChain = autoReuse || clickEdge; // 非 autoReuse 武器需重新点击（原版语义）
      // 词缀乘区（Item.Prefix :551：damage=round(damage×dmg)、knockBack×kb）
      const ps = this.heldPrefixStat();
      // ★ 重启门含 swing.t<=1（原版 itemAnimation 归零同帧即重启挥动,NPC AI 永远看不到 0 帧；
      //   此前 !this.swing 硬门让每挥击周期漏出 1 帧 useTime==0——黄蜂 ai[1] 每周期清零,
      //   永远攒不到 130 → 战斗中黄蜂从不射毒刺(NPC.cs:51165 的 itemAnimation 门因此误判"待机")）
      const swingOver = !this.swing || this.swing.t <= 1;
      if (this.player.useTime === 0 && canChain && (swingOver || reuseSpd < animSpd)) {
        this.swing = {
          t: animSpd, dur: animSpd, item: held!.id,
          dmg: cwMelee ? Math.max(1, Math.round(cwMelee.damage * (ps?.dmg ?? 1))) : undefined,
          kb: cwMelee ? cwMelee.knockback * (ps?.kb ?? 1) : undefined,
        };
        this.player.useTime = reuseSpd;
        this.swingHitSet.clear();
        this.swingTileCutSet.clear();
        // ★ melee+shoot 剑族（附魔剑 989/波刃 190 等，Player.cs:42880 flag4 语义）：
        // 挥砍为主 + 挥击启动帧朝鼠标射出 item.shoot（useTime 节奏=每次挥击一弹）；
        // 弹体走通用 Arrow（贴图/穿透/寿命取投射物表），伤害与本体挥击同源
        if (cwMelee?.shoot && cwMelee.shootSpeed != null) {
          const ang2 = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
          const pd = projectileData(cwMelee.shoot);
          let pen = pd?.penetrate ?? 1;
          if (pen < 0) pen = 3;
          pen = Math.max(1, Math.min(pen, 3));
          this.entities.add(new Arrow(
            this.player.cx + Math.cos(ang2) * 14, this.player.cy - 4 + Math.sin(ang2) * 14,
            Math.cos(ang2) * cwMelee.shootSpeed, Math.sin(ang2) * cwMelee.shootSpeed,
            this.swing.dmg ?? 1, this.swing.kb ?? 3, cwMelee.shoot, null,
            { grav: projGravity(cwMelee.shoot), life: pd?.timeLeft ?? 600, pierce: pen }), 'projectiles');
        }
      }
      this.mining = null;
      return;
    }

    // 镐/斧/锤：挖掘（按住累计）+ 同时作为武器挥击（伤害低于剑）。
    // 双工具族（Hamaxe/The Axe）先按目标 tile 族分流出生效类型与力（dualToolResolve）
    if (tool && (tool.type === 'pick' || tool.type === 'axe' || tool.type === 'hammer')) {
      const spd = Math.max(14, Math.round((tool.speed ?? 46) / this.player.attackSpeedMult));
      const dual = this.dualToolResolve(tool, this.world.store.get(tx, ty));
      // 同剑系：swing.t<=1 放行同帧重启（防黄蜂 ai[1] 每周期清零,见上）
      if (this.player.useTime === 0 && (!this.swing || this.swing.t <= 1)) {
        this.swing = { t: spd, dur: spd, item: held!.id };
        this.player.useTime = spd;
        this.swingHitSet.clear();
        this.swingTileCutSet.clear();
        // 每次挥砍一声：斧砍植物纤维、镐按材质区分土闷/石金（跟随挥砍节奏，不再密集连响）。
        // 没有生效对象（镐没对准可挖方块 / 斧没对准树）则不出声
        const hType = this.world.store.get(tx, ty);
        const hovered = TILE_DEFS[hType];
        const axeOnTarget = hType === T.TREE || TILE_AXE_SHEETS.has(hovered?.vanilla?.sheet ?? -1)
          || (hovered?.decor ?? false);
        const pickOnTarget = hType !== 0 && this.toolCanBreak(hType, dual.power, dual.type);
        if (dual.type === 'axe' ? axeOnTarget : pickOnTarget) {
          if (dual.type === 'axe') this.sfx.play('chop');
          else if (hovered && /stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(hovered.key)) this.sfx.play('tink');
          else this.sfx.play('dig');
        }
      }
      // HitTile 节流窗 = 实际挥击间隔（含攻速配饰加成），保证一挥一击
      this.tryMine(tx, ty, dual.power, dual.type, spd, tool.useTime ?? spd);
      return;
    }

    // 提取机（Player.cs:41008 PlaceThing_ItemInExtractinator——先于 PlaceThing_Tiles）：
    // 手持可提取物（泥沙/雪泥/沙漠化石/垃圾/苔藓/粪块/蜂巢/贝壳堆/黑曜石，ItemID.cs:1104）
    // 对准 219/642 左键使用 → 转化；642 先查矿物兑换表。useTime 冷却 = 10×(642?0.33:1)
    if (inp.mouseDown && !inp.rightDown && this.player.useTime === 0
      && this.inTileRange(tx, ty, (this.player.equipStats.tileRange ? 3 : 0) + (this.player.buffs.has(BuffType.Builder) ? 1 : 0))) {
      const esh = this.wiring?.sheetOf(tx, ty) ?? -1;
      if (esh === 219 || esh === 642) {
        if (this.useExtractinator(tx, ty, true)) {
          // useAnimation 15（Item.cs:6301 泥沙/MakeUsableWithChlorophyteExtractinator:48120）
          this.swing = { t: 15, dur: 15, item: held!.id };
          this.swingHitSet.clear();
          this.swingTileCutSet.clear();
          return;
        }
      }
    }

    // 电路工具(扳手/剪线钳/致动器/致动魔杖/五彩扳手/宏伟蓝图):左键,目标格可被占用
    if (heldDef?.wireTool && inp.mouseDown && !inp.rightDown) {
      this.useWireTool(tx, ty, heldDef);
      return;
    }

    // 可放置物品：左键放置
    // 墙面物品（Player.PlaceThing_Walls，Player.cs:38937）：左键铺墙
    if (heldDef?.wallId != null && inp.mouseDown && !inp.rightDown) {
      this.tryPlaceWall(tx, ty, heldDef);
      return;
    }
    if (heldDef?.tile && !inp.rightDown) {
      this.tryPlace(tx, ty, heldDef);
      return;
    }

    // 其它物品（药水/食物/镜子/召唤物等）：左键使用，useStyle 分族姿势
    // （Player.ItemCheck：itemAnimationMax = useAnimation，ApplyUseStyle 按 useStyle
    //  路由——4 举过头（镜子/机械三王召唤）/5 朝鼠标静持（火把族非放置路径）/
    //  9 举杯（增益药水 DefaultToHealingPotion）/2 咀嚼（食物 DefaultToFood）/
    //  6 饮用旋转（回归药水）；此前的统一 30t 挥砍对 395 件 4/5/9 族全错族）
    // （召唤武器例外——交给下方 cw 分发 kind='summon'）
    if (heldDef && inp.mouseDown && this.player.useTime === 0 && !heldDef.tool
      && cw?.kind !== 'summon') {
      this.useSwing(heldDef);
      // 召唤道具（原版左键使用）
      if (heldDef.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.player.useTime = 30;
      }
    }
    // 药水饮用（移植自 Maples：点击饮用，治疗类受耐药性封锁）
    if (heldDef?.potion && inp.mouseDown && this.player.useTime === 0) {
      const p = heldDef.potion;
      const buffTypeMap: Record<string, BuffType> = {
        agility: BuffType.Agility, ironskin: BuffType.Ironskin,
        resistance: BuffType.Resistance, thorns: BuffType.Thorns, regen: BuffType.Regen,
        obsidianSkin: BuffType.ObsidianSkin, gills: BuffType.Gills,
        manaRegen: BuffType.ManaRegen, magicPower: BuffType.MagicPower,
        featherfall: BuffType.Featherfall, waterWalking: BuffType.WaterWalking,
        archery: BuffType.Archery, nightOwl: BuffType.NightOwl,
      };
      if (p.isHealType && this.player.buffs.healBlocked) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.HealBlock'));
        this.player.useTime = 30;
      } else {
        const bt = buffTypeMap[p.buff];
        // 贤者之石（pStone：药水 CD -25%，Player.pStone → PotionSickness 2850→2140）
        this.player.buffs.apply(bt, Math.round(p.duration * (this.player.equipStats.pStone ? 0.75 : 1)));
        if (heldDef.heal) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + heldDef.heal);
          this.addDamageNumber(this.player.cx, this.player.y, heldDef.heal, false, '#40E080');
        }
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
        this.cb.onToast(`${heldDef.name}：${p.duration} 秒`);
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && (heldDef.key === 'life_crystal' || heldDef.key === 'vi_29_LifeCrystal')) {
      // 物品态生命水晶(Player.cs:29358:item 29,statLifeMax<400 → +20)
      if (this.player.baseMaxHp >= 400) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached'));
      } else {
        this.player.baseMaxHp += 20;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
        this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#40E080');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && heldDef.key === 'vi_109_mana_crystal') {
      // 魔力水晶(Player.cs:44655:statManaMax<200 → +20 上限并回复)
      if (this.player.baseMaxMana >= 200) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ManaMaxReached'));
      } else {
        this.player.baseMaxMana += 20;
        this.player.mana = Math.min(this.player.maxMana, this.player.mana + 20);
        this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#4080FF');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && heldDef.key === 'vi_1291_life_fruit') {
      // 生命果(Player.cs:44665:statLifeMax≥400 且 <500 → +5)
      if (this.player.baseMaxHp < 400) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedLifeCrystalFirst'));
      } else if (this.player.baseMaxHp >= 500) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached500'));
      } else {
        this.player.baseMaxHp += 5;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 5);
        this.addDamageNumber(this.player.cx, this.player.y, 5, false, '#40E080');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 30;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
      }
      this.player.useTime = Math.max(this.player.useTime, 30);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && heldDef.key === 'vi_5340_galaxy_pearl') {
      // 银河珍珠（Player.cs:44786-44789：一次性 usedGalaxyPearl → luck +0.03 :28676-28678；
      // 已用过 → 无动作不消耗，原版 !usedGalaxyPearl 门）
      if (!this.player.luckState.usedGalaxyPearl) {
        this.player.luckState.usedGalaxyPearl = true;
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.cb.onInventoryChanged();
      }
      this.player.useTime = 45;   // Item 5340 useTime（Item.cs:42342）
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && this.consumableFuncGate(heldDef)) {
      // vi_ 药水/食物桥接（vanilla-itemfunc：healLife/healMana/buffType → 治疗/回魔/Buff）。
      // 纯消耗品门（consumable 且无放置/射击/工具语义——宠物坐骑等 buffType 物品不在此列）
      const fm = /^vi_(\d+)_/.exec(heldDef.key);
      const ff = fm ? itemFuncOfVid(+fm[1]) : null;
      // ★ 无消耗品语义（水晶/果/弓族等）不得空占本 else-if 槽位——否则链条后续
      // 全部分支被饿死（else-if 匹配即终止）。命中才处理，否则落空交还链条
      if (ff?.consumable && !ff.createTile && !ff.shoot && !ff.pick && !ff.axe && !ff.hammer
        && (ff.healLife || ff.healMana || (ff.buffType && ff.buffType > 0))) {
        if (ff.healLife && this.player.buffs.healBlocked) {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.HealBlock'));
          this.player.useTime = 30;
        } else {
          // 原版 buff id → BuffType（BUFF_DEFS 反查；耐药性 21 是治疗副作用不主动施加）
          if (ff.buffType && ff.buffType > 0) {
            const bt = BUFF_BY_VANILLA.get(ff.buffType);
            if (bt !== undefined && bt !== BuffType.Resistance) {
              this.player.buffs.apply(bt, Math.round((ff.buffTime ?? 7200) / 60)); // tick→秒
            }
          }
          if (ff.healLife) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + ff.healLife);
            this.addDamageNumber(this.player.cx, this.player.y, ff.healLife, false, '#40E080');
            this.player.buffs.apply(BuffType.Resistance, 60); // 药水病（PotionSickness 近似）
          }
          if (ff.healMana) {
            this.player.mana = Math.min(this.player.maxMana, this.player.mana + ff.healMana);
            this.player.buffs.apply(BuffType.ManaSickness, 5); // 魔力眩晕（300t/瓶,max 合并）
          }
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.player.useTime = 60;
          this.sfx.play('drink');
          this.cb.onInventoryChanged();
        }
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0
      && (heldDef.ranged || rangedAmmoWeapon(heldDef))) {
      // 远程武器（弓/枪/吹箭筒）：PickAmmo + ItemCheck_Shoot 1:1（Player.cs:52590+/46426）
      //   速度 = 弓 shootSpeed + 弹药 shootSpeed；伤害 = 弓 damage + 弹药 damage；
      //   击退 = 弓 kb + 弹药 kb；投射物类型 = 弹药 shoot；音效 = 弓 UseSound(Item5)
      //   弹药查找：原版先扫 54-57 弹药栏（Inventory.add 已把弹药归入 54-57），再扫背包 0-53 第一组
      //   ★ vi_ 枪族（164 手枪/964 火铳/1319 雪球炮/281 吹箭筒等 useAmmo 武器）此前
      //   combatWeapon 按 useAmmo 排除后无人接管 = 静默失效；此处经
      //   vanilla-itemcombat.useAmmo 数据驱动接入（930 信号枪 useAmmo=-1 原版语义不接）
      const rg = heldDef.ranged ?? null;
      const bowVid = rg?.vid ?? viIdFromKey(heldDef.key);
      const bowC = bowVid >= 0 ? itemCombat(bowVid) : null;
      const useAmmo = bowC?.useAmmo ?? AMMO_ARROW;
      // PickAmmo：弹药栏 54-57 优先，再背包 0-53 第一组 useAmmo 匹配
      // （def.ammoId = legacy 注册；vi_ 弹药经 combat.ammo 反查）
      const ammoOf = (d: (typeof ITEM_DEFS)[number]): number =>
        d.ammoId ?? (d.vid != null || viIdFromKey(d.key) >= 0 ? itemCombat(d.vid ?? viIdFromKey(d.key))?.ammo ?? 0 : 0);
      let ammoSlot = -1;
      let ammoDef: (typeof ITEM_DEFS)[number] | null = null;
      for (const [from, to] of [[54, 58], [0, 54]] as const) {
        for (let i = from; i < to; i++) {
          const sl = this.player.inv.slots[i];
          if (!sl || sl.stack <= 0) continue;
          const d = ITEM_DEFS[sl.id];
          if (d && ammoOf(d) === useAmmo) { ammoSlot = i; ammoDef = d; break; }
        }
        if (ammoSlot >= 0) break;
      }
      if (ammoSlot >= 0 && ammoDef) {
        const ammoC = ammoDef.vid != null || viIdFromKey(ammoDef.key) >= 0
          ? itemCombat(ammoDef.vid ?? viIdFromKey(ammoDef.key)) : null;
        // 箭速：射手 buff ×1.2（cap 20，:52717）+ 箭袋族 ×1.1（:52711）——仅箭族吃
        const isArrowKind = bowC?.useAmmo !== 97 && bowC?.useAmmo !== 771 && bowC?.useAmmo !== 283;
        let speed = (bowC?.shootSpeed ?? rg?.projSpeed ?? 7) + (ammoC?.shootSpeed ?? 0);
        if (isArrowKind) speed = Math.min(20, speed * this.player.buffs.arrowSpeedMult
          * (this.player.equipStats.quiver ? 1.1 : 1));
        // 词缀乘区只作用于武器基伤（GetWeaponDamage：item.damage 含词缀，弹药另加）；
        // 装备远程伤害乘区（侦察镜/复仇者徽章等）
        const ps = this.heldPrefixStat();
        // 弹药分道（Player.cs:3820 bowEffectiveDamage 拆分）：箭吃箭袋/射手/蘑菇矿箭头，
      // 弹/火箭吃对应蘑菇矿头；Archery 不再误伤枪械
      const rKind = bowC?.useAmmo === 97 ? 'bullet' : bowC?.useAmmo === 771 ? 'rocket' : bowC?.useAmmo === 283 ? 'other' : 'arrow';
      let damage = Math.round((bowC?.damage ?? rg?.damage ?? 1) * (ps?.dmg ?? 1) * this.player.rangedDamageMult(rKind)) + (ammoC?.damage ?? 0) + this.player.equipStats.armorPen;
        let knockback = (bowC?.knockBack ?? rg?.knockback ?? 2) * (ps?.kb ?? 1) + (ammoC?.knockBack ?? 0);
        if (isArrowKind && this.player.equipStats.quiver) knockback *= 1.1; // 箭袋击退 ×1.1（:52713）
        const projId = ammoC?.shoot ?? bowC?.shoot ?? 1; // PickAmmo：projToShoot = 弹药 shoot
        if (isArrowKind && this.player.equipStats.moltenQuiver && projId === 1) damage += 2; // 熔箭袋木箭→火矢+2（:52700，火矢 proj 换体从略）
        const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
        const ax = this.player.cx + Math.cos(ang) * 14;
        const ay = this.player.cy - 4 + Math.sin(ang) * 14;
        // 回收掉落：仅木箭（原版燃烧箭 Kill 不掉；子弹/飞镖不可回收）
        const dropKey = projId === 1 ? ammoDef.key : null;
        this.entities.add(new Arrow(ax, ay, Math.cos(ang) * speed, Math.sin(ang) * speed,
          damage, knockback, projId, dropKey), 'projectiles');
        // 弹药节约（ammoCost80：20% 概率不耗弹——蘑菇矿胸甲族，Player.PickAmmo 语义）
        if (!(((this.player.equipStats.ammoSave || this.player.buffs.has(BuffType.AmmoReservation)) && Math.random() < 0.2))) {
          this.player.inv.removeAt(ammoSlot, 1);
        }
        this.player.useTime = bowC?.useTime ?? rg?.speed ?? 30;
        // useStyle 5（弓枪族恒 5）：朝鼠标静持姿势 + 身体行档（Player.cs:46708 itemRotation=瞄准角）
        this.useSwing(heldDef, ang);
        // 发射音（原版 Item.cs UseSound）：弓（useAmmo 40）=Item_5；枪械通用=Item_11；
        // 霰弹枪族 534/964/3788/4703=Item_36；手枪族 164/219/1255/1929/2269/2270=Item_41
        // （Item_36/41 此前登记"素材未提取"，现已落位 public/sounds/——销核）
        this.sfx.play(useAmmo === AMMO_ARROW ? 'bowShoot'
          : GUN_SHOTGUN_VIDS.has(bowVid) ? 'gunShotgun'
          : GUN_HANDGUN_VIDS.has(bowVid) ? 'gunHandgun' : 'gunShot');
        this.cb.onInventoryChanged();
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && cw && cw.kind !== 'melee') {
      // vi_* 数据驱动武器（1456 aiStyle 家族）：回旋镖/长矛/悠悠球/连枷/手雷/魔法/直射兜底。
      // 必须排在 thrownCombat 之前——手雷(166 等)满足投掷判定但语义是 ai16 弹跳引信
      this.useCombatWeapon(cw, heldDef);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && thrownCombat(heldDef)) {
      // 消耗型投掷武器（手里剑/飞刀/毒刀等，Item.shoot + consumable + noMelee 且无 useAmmo）：
      // 朝鼠标投出 item.shoot 投射物，消耗 1 个，数值全取 vanilla-itemcombat.json；
      // 投射物复用 Arrow（重力 0.3/tick = 原版 aiStyle 2 抛物线同值；命中可回收）
      const tc = thrownCombat(heldDef)!;
      const vid = heldDef.vid ?? viIdFromKey(heldDef.key);
      const c = itemCombat(vid);
      const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
      const px = this.player.cx + Math.cos(ang) * 14;
      const py = this.player.cy - 4 + Math.sin(ang) * 14;
      // 粉末族（净化粉 66 / 邪恶粉 67 / 猩红粉 2886）：proj 10/11/463 是 aiStyle 6
      // 粉末云（64×64 无碰撞盒、180 tick、无重力），不是 aiStyle 2 抛物投掷物——
      // 必须先于下方 Arrow 分流，否则退化成"可回收的投掷刀"（GAP 补齐）。
      // 云体以玩家为中心生成（原版 ItemCheck_Shoot 弹心 = 人物中心）
      const powderProj = POWDER_PROJ_BY_ITEM[vid];
      if (powderProj) {
        this.entities.add(new PowderProj(this.player.cx - 32, this.player.cy - 32,
          Math.cos(ang) * (c?.shootSpeed ?? 4), Math.sin(ang) * (c?.shootSpeed ?? 4), powderProj), 'projectiles');
      } else {
        // 穿透取原版 penetrate（手里剑 4；-1 无限上限 6）。
        // ★伤害对账：1.4.4+ 投掷系并入 melee（Item 277 手里剑 SetDefaults melee=true）——
        // 乘区=近战链×词缀+armorPen（此前裸 tc.damage 完全无乘区）
        const psT = this.heldPrefixStat();
        const dmgT = Math.max(1, Math.round(tc.damage * (psT?.dmg ?? 1) * this.player.damageMult('melee'))
          + this.player.equipStats.armorPen + this.player.meleeArmorPen); // 磨刀穿甲含投掷
        let pen = projectileData(tc.shoot)?.penetrate ?? 1;
        if (pen < 0) pen = 6;
        pen = Math.max(1, Math.min(pen, 6));
        this.entities.add(new Arrow(px, py,
          Math.cos(ang) * (c?.shootSpeed ?? 9), Math.sin(ang) * (c?.shootSpeed ?? 9),
          dmgT, (c?.knockBack ?? 0) * (psT?.kb ?? 1), tc.shoot, heldDef.key, { pierce: pen }), 'projectiles');
      }
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = c?.useTime ?? 15;
      this.sfx.play('throw');
      this.cb.onInventoryChanged();
    } else if (heldDef && (heldDef.key === 'worm_food' || heldDef.key === 'bloody_spine' || heldDef.key === 'slime_crown')
      && inp.mouseDown && this.player.useTime === 0) {
      // Boss 召唤物(原版 worm food/bloody spine/slime crown)
      if (heldDef.key === 'worm_food') this.summonBoss('eater_of_worlds_head');
      else if (heldDef.key === 'bloody_spine') this.summonBoss('brain_of_cthulhu');
      else this.summonBoss('king_slime');
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = 60;
      this.cb.onInventoryChanged();
      this.input.mouseDown = false;
    } else if (heldDef && (heldDef.key === 'mechanical_worm' || heldDef.key === 'mechanical_eye' || heldDef.key === 'mechanical_skull')
      && inp.mouseDown && this.player.useTime === 0) {
      // 机械三王召唤物(原版 556/544/557:需困难模式+夜晚)
      if (!this.world.flags.hardMode) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.MechNotAwake'));
      } else if (this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      } else {
        if (heldDef.key === 'mechanical_worm') this.summonBoss('destroyer');
        else if (heldDef.key === 'mechanical_eye') this.summonBoss('twins');
        else this.summonBoss('skeletron_prime');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && heldDef.key === 'vi_2767_solar_tablet'
      && inp.mouseDown && this.player.useTime === 0) {
      // 日耀碑牌（Player.cs:43308/51431：dayTime && !eclipse && hardMode 才可用，
      // 成功 → Main.eclipse=true + Lang.misc[20] 公告；非白天/已日食/肉前静默不可用）
      if (this.world.flags.hardMode && this.world.clock.isDay && !this.world.clock.eclipse) {
        this.world.clock.eclipse = true;
        this.newText(Lang.misc(20), 50, 255, 130);   // ChatColors.World
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      } else if (!this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      }
      this.input.mouseDown = false;
    } else if (heldDef && (heldDef.key === 'goblin_battle_standard' || heldDef.key === 'snow_globe' || heldDef.key === 'pirate_map')
      && inp.mouseDown && this.player.useTime === 0) {
      // 入侵触发物品（Player.ItemCheck_UseEventItems，Player.cs:43243/43260/43277：
      // 战旗 ignoreDelay，成功才消耗）
      const type = heldDef.key === 'goblin_battle_standard' ? INVASION_GOBLIN
        : heldDef.key === 'snow_globe' ? INVASION_SNOW_LEGION : INVASION_PIRATE;
      if (this.startInvasionAndAnnounce(type, true)) {
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && (heldDef.key === 'vi_1844_PumpkinMoonMedallion' || heldDef.key === 'vi_1958_NaughtyPresent')
      && inp.mouseDown && this.player.useTime === 0) {
      // 南瓜月/霜月召唤物（1844 PumpkinMoonMedallion / 1958 NaughtyPresent，
      //  Player.cs:43294/43361 ItemCheck + Main.startPumpkinMoon/startSnowMoon :10903-10940）：
      //  门 = !dayTime && !pumpkinMoon && !snowMoon；成功 → 置位 + 清血月 + 广播 wave 1 文案。
      //  useTime 45（Item.cs:20377-20385 / 21121-21128）。军队入侵进行中不开
      //  （invaders 与月事件刷怪段互斥，避免两事件打架——原版 DD2 同门）
      const kind = heldDef.key === 'vi_1844_PumpkinMoonMedallion' ? MOON_KIND_PUMPKIN : MOON_KIND_FROST;
      if (this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      } else if (this.world.moonEvent.kind === 0 && this.world.invasionType === 0) {
        const ann = startMoonEvent(this.world, kind);
        if (ann) this.newText(invasionWaveText(ann), 175, 75, 255);
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 45;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef?.magic && inp.mouseDown && this.player.useTime === 0) {
      // 魔法武器:消耗 mana → 发射魔法弹(Player.ItemCheck_Shoot 语义)
      const mg = heldDef.magic;
      // 魔力花族：耗魔 -8%（manaCost -= 0.08，Player.cs:14040）；不足时自动喝蓝
      // 魔力花族 -8% + 丛林套 manaCostMul（:14040 / :15878）
      const mgCost = Math.max(1, Math.round(mg.manaCost * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul));
      if (this.player.mana < mgCost) {
        if (!(this.player.equipStats.manaFlower && this.tryAutoManaPotion() && this.player.mana >= mgCost)) {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NoMana'));
          this.input.mouseDown = false;
        }
      }
      if (this.player.mana >= mgCost) {
        this.player.mana -= mgCost;
        // （星云叠层已改为 booster 掉落拾取链 nebulaCb/nebulaLevelup——耗魔直叠旧路径移除）
        const ang = Math.atan2(inp.mouseY - vh2 / 2, inp.mouseX - vw2 / 2);
        const mx = this.player.cx + Math.cos(ang) * 14;
        const my = this.player.cy - 4 + Math.sin(ang) * 14;
        const color = mg.proj === 'bolt' ? '#A040FF' : '#FFB040';
        const proj = new MagicProj(mx, my, Math.cos(ang) * mg.projSpeed, Math.sin(ang) * mg.projSpeed, mg.damage, 45, color);
        this.entities.add(proj, 'projectiles');
        this.player.useTime = mg.speed;
        this.player.onManaItemUsed(); // 用魔动画窗（manaRegenDelay 重置期，:42131-42137）
        // 法杖 useStyle 5：朝鼠标静持姿势（Player.cs:46708 itemRotation=瞄准角）
        this.useSwing(heldDef, ang);
        this.sfx.play('tink');
        this.input.mouseDown = false;
      }
    } else if (heldDef && (heldDef.key === 'empty_bucket' || heldDef.key === 'water_bucket'
      || heldDef.key === 'lava_bucket' || heldDef.key === 'honey_bucket')) {
      this.useBucket(heldDef.key, tx, ty);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0) {
      // ---- 高尔夫球放置（物品 3989/染色彩蛋 4242-4253 → proj 721/739+）：
      //      指针格净空且下方实心 → 落球（每玩家同时一球：旧球回收）
      const bm = /^vi_(\d+)_/.exec(heldDef.key);
      const bvid = bm ? +bm[1] : 0;
      if (bvid === 3989 || (bvid >= 4242 && bvid <= 4253)) {
        const st = this.world.store;
        const gx = Math.floor(inp.mouseX / this.camera.zoom + this.camera.x - this.renderer.canvas.width / this.camera.zoom / 2);
        const gy = Math.floor(inp.mouseY / this.camera.zoom + this.camera.y - this.renderer.canvas.height / this.camera.zoom / 2);
        const btx = Math.floor(gx / TILE), bty = Math.floor(gy / TILE);
        const air = st.inBounds(btx, bty) && !st.flags[st.idx(btx, bty)];
        const floorOk = st.inBounds(btx, bty + 1) && st.isSolid(btx, bty + 1);
        if (air && floorOk) {
          for (const e of this.entities.projectiles) {
            if (e instanceof GolfBall && !e.dead) e.dead = true;
          }
          const ownerRef = this.player;
          const projId = bvid === 3989 ? 721 : 739 + (bvid - 4242);
          this.entities.add(new GolfBall(btx * TILE + 3, (bty + 1) * TILE - 10, projId,
            () => ownerRef), 'projectiles');
          this.player.useTime = 15;
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.sfx.play('dig', 0.7);
          this.cb.onInventoryChanged?.();
        }
        this.input.mouseDown = false;
      }
      // ---- 战斗书 4382/5336（Player.cs:44703-44730 ItemCheck_UseCombatBook）：
      //      世界级一次性旗标 + 世界公告；不消耗（ApplyItemTime 仅冷却）
      else if (bvid === 4382 || bvid === 5336) {
        const flagKey = bvid === 4382 ? 'combatBookWasUsed' : 'combatBookVolumeTwoWasUsed';
        if (!this.world.flags[flagKey]) {
          this.world.flags[flagKey] = true;
          this.newText(Lang.text(bvid === 4382 ? 'Misc.CombatBookUsed' : 'Misc.CombatBookVolumeTwoUsed'), 50, 255, 130);
          this.player.useTime = 30;
          // 场上城镇 NPC 立即吃到增益（NPC.cs:53419：lifeMax+250/伤×0.8/速+0.25/防+8）
          for (const n of this.entities.npcs) {
            const tn = n as TownNPC;
            if (tn instanceof TownNPC && !tn.dead) tn.applyCombatBook();
          }
        }
        this.input.mouseDown = false;
      }
      // ---- 血泪 4271（Player.cs:43329-43345 + CanUseItem :51435）：夜且非血月可用 →
      //      StartBloodMoon：sound 15、moonPhase==4(新月)时拨到 5、misc[8] 公告。
      //      昼/血月中不可用（原版 CanUseItem 返回 false = 静默无效）。
      if (/^vi_4271_/.test(heldDef.key)) {
        const wk = this.world;
        if (!wk.clock.isDay && !wk.clock.bloodMoon) {
          this.sfx.play('throw'); // SoundID 15 ≈ Item_1（throw 通道）
          wk.clock.bloodMoon = true;
          if (wk.clock.moonPhase === 4) wk.clock.moonPhase = 5;
          this.newText(Lang.misc(8), 50, 255, 130);
          this.player.useTime = 30;
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged?.();
        }
        this.input.mouseDown = false;
      }
      // ---- 钓鱼（R7）：钓竿抛/收（vanilla-itemfunc fishingPole>0；AI_61 浮标）----
      const fm = /^vi_(\d+)_/.exec(heldDef.key);
      const ff = fm ? itemFuncOfVid(+fm[1]) : null;
      if (ff?.fishingPole) {
        this.player.useTime = 30;
        // 已有浮标 → 收竿（咬钩中给渔获，否则收回）
        const bobber = this.entities.projectiles.find((e) => e instanceof Bobber && !e.dead) as Bobber | undefined;
        if (bobber) {
          this.reelBobber(bobber);
        } else {
          // 抛竿：需背包有鱼饵（bait>0），取第一个
          let baitSlot = -1, baitPower = 0;
          for (let i = 0; i < this.player.inv.slots.length; i++) {
            const sl = this.player.inv.slots[i];
            if (!sl) continue;
            const dm = /^vi_(\d+)_/.exec(ITEM_DEFS[sl.id].key);
            const df = dm ? itemFuncOfVid(+dm[1]) : null;
            if (df?.bait) { baitSlot = i; baitPower = df.bait; break; }
          }
          if (baitSlot < 0) {
            this.cb.onToast('需要鱼饵才能钓鱼！');
          } else {
            const ang = Math.atan2(inp.mouseY - vh2 / 2, inp.mouseX - vw2 / 2);
            const owner = this.player;
            const bob = new Bobber(
              this.player.cx + Math.cos(ang) * 12, this.player.cy - 6,
              Math.cos(ang) * 9, Math.sin(ang) * 9 - 3,
              ff.fishingPole, baitSlot, baitPower,
              () => (owner.dead ? null : owner),
            );
            bob.poleVid = fm ? +fm[1] : 0; // 血肉抛竿 4325 敌怪概率判定用
            this.entities.add(bob, 'projectiles');
            this.sfx.play('throw');
          }
        }
        this.input.mouseDown = false;
      }
    }
    this.mining = null;
  }

  /** vi_* 数据驱动武器使用派发（combatWeapon 解析出的 aiStyle 家族）。
   *  数值全部取 vanilla-itemcombat.json（damage/knockBack/useTime/shootSpeed/mana），
   *  行为取 1456 aiStyle 语义（WeaponProj.ts 各实体） */
  /** 手持物词缀属性（Item.Prefix 持久在物品实例上；无词缀=全 1） */
  private heldPrefixStat() {
    const pfx = this.player.inv.heldItem()?.prefix;
    return pfx ? prefixStat(pfx) : null;
  }

  private useCombatWeapon(cwIn: Exclude<CombatWeapon, { kind: 'melee' }>, def: (typeof ITEM_DEFS)[number]) {
    const inp = this.input;
    const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
    const px = this.player.cx + Math.cos(ang) * 14;
    const py = this.player.cy - 4 + Math.sin(ang) * 14;
    const consume = () => {
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.cb.onInventoryChanged();
    };
    // 词缀乘区（Item.Prefix :551-557）：damage=round(×dmg)、knockBack×kb——
    // 手雷兜底下限在乘区后取 max，与原版（damage 先乘再判 0）一致；
    // 装备全系伤害乘区（徽章/险恶词缀等）：近战族=melee、魔法=magic、其余=ranged
    const ps = this.heldPrefixStat();
    const dmgKind = cwIn.kind === 'magic' ? 'magic' : (cwIn.kind === 'boomerang' || cwIn.kind === 'spear' || cwIn.kind === 'yoyo' || cwIn.kind === 'flail') ? 'melee' as const : 'ranged' as const;
    const cw = {
      ...cwIn,
      damage: Math.max(1, Math.round(cwIn.damage * (ps?.dmg ?? 1) * this.player.damageMult(dmgKind)) + this.player.equipStats.armorPen),
      knockback: cwIn.knockback * (ps?.kb ?? 1),
    };
    // 使用姿势（Player.ItemCheck：itemAnimation>0 期间持物可见）。
    // ★ spear/yoyo/flail/boomerang 族源码 noUseGraphic=true（DefaultToSpear :47637 等
    //   202 处）——投射物即本体，挥动再画持物会重影，这四族不加 swing
    if (cw.kind === 'grenade' || cw.kind === 'magic' || cw.kind === 'shot' || cw.kind === 'summon') {
      this.useSwing(def, ang);
    }
    switch (cw.kind) {
      case 'grenade': {
        // AI_016：引信 timeLeft（Projectile.SetDefaults：炸弹28=150/炸药棍29=135/手雷30=180）
        // ——此前 29/30 映射对调（炸药棍拿了炸弹的 150、手雷拿了炸药棍的 135）
        const fuse = cw.shoot === 28 ? 150 : cw.shoot === 29 ? 135 : 180;
        // 爆炸伤害（Projectile.SetDefaults）：炸弹28=100/炸药棍29=250/手雷30=60；
        // 此前手雷误取 250
        const dmg = cw.shoot === 28 ? 100 : cw.shoot === 29 ? 250 : Math.max(cw.damage, 60);
        // 地形破坏半径（Projectile.cs:75262 表）：炸弹族28/37/516/519=4、炸药棍族
        // 29/470/637=7；**手雷族(30 等)不在 ExplodeTiles 判定表内=不破坏地形**
        const er = Game.EXPLODE_RADIUS[cw.shoot] ?? 0;
        // 实体伤害盒(Projectile.Kill :74885/:74951):炸弹 28/手雷 30 = 22×22 盒半宽 11;
        // 炸药棍 29 = 200×200 盒半宽 100——与地形破坏半径【无关】
        const hurtBox = cw.shoot === 29 ? 100 : 11;
        this.entities.add(new GrenadeProj(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          dmg, fuse, cw.shoot, (ex, ey, edmg) => this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE), edmg, er, er > 0, hurtBox)), 'projectiles');
        consume();
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'glowstick': {
        // aiStyle 14（AI_014 弹跳物理/粘性粘墙/妖精排斥场）：消耗 1 支掷出；
        // 光照走通用弹幕点光（projectileData.light=1）
        this.entities.add(new GlowstickProj(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.shoot), 'projectiles');
        consume();
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'boomerang': {
        // AI_003：飞出减速→返回主角（非消耗，回手即消失）
        this.entities.add(new Boomerang(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'spear': {
        // AI_019：随角色前刺（一个 useTime 周期伸缩一次）
        const reach = Math.min(170, 60 + cw.shootSpeed * 12);
        this.entities.add(new SpearProj(Math.cos(ang), Math.sin(ang), reach, cw.useTime,
          cw.damage, cw.knockback, cw.shoot), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        break;
      }
      case 'whip': {
        // 鞭（ProjectileAI_Whip 主干简化）：从玩家朝鼠标甩出/收回（时长=useAnimation），
        // 命中敌人伤害+tag（UniqueTagEffects TagDamage，240t 内随从对该敌 +N）。
        // ★伤害取武器基伤×词缀（GetWeaponDamage summon → minionDamage 单次乘区）——
        // 不能用 wrapper 预乘后的 cw.damage（那已含 ranged 乘区，WhipProj 再乘
        // summonDamageMult 会双乘；armorPen 同理由命中侧加）
        const whip = cw as Extract<typeof cw, { kind: 'whip' }>;
        const owner = this.player;
        this.entities.add(new WhipProj(
          owner.cx, owner.cy, ang, whip.shoot, whip.itemId,
          Math.max(1, Math.round(cwIn.damage * (ps?.dmg ?? 1))),
          whip.knockback, whip.useTime, whip.shootSpeed,
          () => (owner.dead ? null : owner),
          // 月主鞭补鞭实时瞄准（Projectile.cs:45045-45046 朝鼠标方向重掷）
          () => Math.atan2(inp.mouseY - this.renderer.canvas.height / 2,
            inp.mouseX - this.renderer.canvas.width / 2),
        ), 'projectiles');
        // 鞭攻速（SetItemAnimation :4266：summonerWeaponSpeedBonus × whipUseTimeMultiplier，
        // 封顶 3×——summonerWeaponSpeedBonus 来自鞭 buff 311/308/314，黑曜套给 wutm）
        const swb = (owner.whipBuffs[311] ? 0.35 : 0) + (owner.whipBuffs[308] ? 0.25 : 0)
          + (owner.whipBuffs[314] ? 0.12 : 0);
        const whipAtk = Math.min(3, 1 + swb * owner.equipStats.whipSpd);
        this.player.useTime = Math.max(1, Math.round(whip.useTime / whipAtk));
        this.sfx.playWav('whipCrack', 0.9, owner.cx, owner.cy); // DefaultToWhip UseSound=Item152（鞭响）
        this.input.mouseDown = false;
        break;
      }
      case 'summon': {
        // 召唤：上限链 = Player.maxMinions（1+buff+散件+套装）/ maxSentries；
        // 超限驱逐最旧（原版 FreeUpPetsAndMinions 最便宜优先——本作全 1 槽=最旧先死）；
        // damage 传武器基伤——随从每 tick 按当时装备重算（Projectile.cs:15368 live 刷新）
        const minions = this.entities.projectiles.filter((e) => e instanceof MinionProj && !e.sentry && !(e as MinionProj).noSlot) as MinionProj[];
        // 星尘龙：已有龙头 → 不出新头，尾前插 2 段（SpawnMinionOnCursor :47906-47963）
        if (cw.shoot === 625) {
          const head = minions.find((m) => m.projId === 625);
          if (head && !head.dead) {
            head.extendDragon(this);
            this.player.useTime = cw.useTime;
            this.sfx.playWav('summon', 0.9, this.player.cx, this.player.cy);
            this.input.mouseDown = false;
            break;
          }
        }
        if (!cw.sentry) {
          if (minions.length >= this.player.maxMinions) minions[0].dead = true; // 驱逐最旧
        } else {
          const sentries = this.entities.projectiles.filter((e) => e instanceof MinionProj && e.sentry) as MinionProj[];
          if (sentries.length >= this.player.maxSentries) sentries[0].dead = true;
        }
        const owner = this.player;
        this.entities.add(new MinionProj(
          px, py, cw.shoot, Math.max(1, Math.round(cwIn.damage * (ps?.dmg ?? 1))), // 基伤×词缀（乘区由 MinionProj live 结算，勿用预乘的 cw.damage）
          cw.knockback, !!cw.sentry,
          this.entities.projectiles.filter((e) => e instanceof MinionProj && !(e as MinionProj).sentry).length,
          false, // 地面型判定省略：统一飞行（地面 3 件的 walk 近似后续按 aiStyle 细分）
          () => (owner.dead ? null : owner),
        ), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.playWav('summon', 0.9, this.player.cx, this.player.cy); // 召唤杖 UseSound=Item44
        this.input.mouseDown = false;
        break;
      }
      case 'yoyo':
      case 'flail': {
        // AI_099 channel：同物品已有悠悠球在场则不重复掷出（原版每把悠悠球仅一个）
        const flail = cw.kind === 'flail';
        const itemId = ITEM_BY_KEY[def.key];
        for (const e of this.entities.projectiles) {
          const y = e as YoyoProj;
          if (y instanceof YoyoProj && y.projId === cw.shoot) return;
        }
        // 悠悠球线（yoyoString：射程 +60%，YoyoBag 语义）
        const stringLen = (flail ? 200 + cw.shootSpeed * 10 : 220 + cw.shootSpeed * 10)
          * (this.player.equipStats.yoyoString ? 1.6 : 1);
        const yoyo = new YoyoProj(px, py, cw.damage, cw.knockback, cw.shoot, stringLen,
          () => this.input.mouseDown && !this.input.uiBlocking && this.player.inv.heldItem()?.id === itemId,
          () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
          flail);
        // 配重球（counterWeight：悠悠球命中时落配重投射物，原版环绕弹的直线坠落近似）
        if (this.player.equipStats.counterWeight) {
          (yoyo as unknown as { spawnWeight?: (x: number, y: number, dmg: number) => void }).spawnWeight =
            (wx, wy, wdmg) => {
              this.entities.add(new Arrow(wx, wy, (Math.random() - 0.5) * 2, -1.5,
                wdmg, 2, 556 + Math.floor(Math.random() * 6), null), 'projectiles');
            };
        }
        this.entities.add(yoyo, 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        this.input.mouseDown = false; // 本击只负责掷出，滞留由 channel 回调判定
        break;
      }
      case 'magic': {
        // 魔法：消耗 mana（原版 mana 字段）→ 发射 item.shoot（贴图/穿透/寿命取投射物表）
        // 魔力花族：耗魔 -8%；不足时自动喝蓝重试
        const cwCost = Math.max(1, Math.round((cw.mana ?? 0) * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul));
        if (this.player.mana < cwCost) {
          if (!(this.player.equipStats.manaFlower && this.tryAutoManaPotion() && this.player.mana >= cwCost)) {
            this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NoMana'));
            this.input.mouseDown = false;
            return;
          }
        }
        this.player.mana -= cwCost;
        const pd = projectileData(cw.shoot);
        let pen = pd?.penetrate ?? 1;
        if (pen < 0) pen = 3;
        pen = Math.max(1, Math.min(pen, 3));
        const mArrow = new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: projGravity(cw.shoot), life: pd?.timeLeft ?? 600, pierce: pen });
        // 星云 booster（StrikeNPC :12892-12905：魔法弹命中、套装在身、CD=0、1/3 → 掉 booster）
        mArrow.nebulaCb = () => {
          if (!this.player.equipStats.nebulaSet || this.player.nebulaCD > 0 || Math.random() >= 1 / 3) return;
          this.player.nebulaCD = 30; // :12895
          this.spawnNebulaBooster(mArrow.cx, mArrow.cy);
        };
        this.entities.add(mArrow, 'projectiles');
        this.player.useTime = cw.useTime;
        this.player.onManaItemUsed(); // 用魔动画窗（manaRegenDelay 重置期，:42131-42137）
        this.sfx.play('tink');
        this.input.mouseDown = false;
        break;
      }
      case 'shot': {
        // 兜底直射（附魔剑光束等 melee/ranged+shoot 未归族项）：重力按 aiStyle
        const pd = projectileData(cw.shoot);
        this.entities.add(new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: projGravity(cw.shoot), life: pd?.timeLeft ?? 600, pierce: 1 }), 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('bowShoot');
        break;
      }
      default:
        return;
    }
    void def;
  }

  private toolCanBreak(type: number, power: number, toolType: string): boolean {
    const d = TILE_DEFS[type];
    if (!d) return false;
    if (toolType === 'pick') return d.pick >= 0 && power >= d.pick;
    if (toolType === 'axe') return d.axe >= 0;
    return false;
  }

  /** 原版 IsInTileInteractionRange（Player.cs:31548）+ GetTileRegion
   * （TileReachCheckSettings.cs:53）1:1：玩家盒外扩 tileRangeX=5 / tileRangeY=3
   * （+tileBoost）的【矩形】判定（Simple 档 multiplier=1/上限 20）。非圆形距离 */
  private inTileRange(tx: number, ty: number, tb = 0): boolean {
    const p = this.player;
    const x = Math.min(20, 5) + tb, y = Math.min(20, 3) + tb;
    const LX = Math.floor(p.x / TILE) - x;
    const HX = Math.ceil((p.x + p.w) / TILE) - 1 + x;
    const LY = Math.floor(p.y / TILE) - y;
    const HY = Math.ceil((p.y + p.h) / TILE) - 1 + y;
    return tx >= LX && tx <= HX && ty >= LY && ty <= HY;
  }

  /** 砸祭坛 = 原版 KillTile case 26 → SmashAltar（WorldGen.cs:48949）1:1：
   *  altarCount%3 选矿档(0 钴/钯、1 秘银/山铜、2 精金/钛)，/3+1 为波次衰减；
   *  矿脉数 num3 = w/4200×310 − 85×档 ×0.85 ÷ 波次；深度带随档位加深
   *  （ws / rock / (rock×2+h)/3）；每脉 OreRunner 5..(9+w/4200)；最后生成
   *  1-2 只幽灵(82)。祭坛 3×2 整体移除。
   *  计数存 world.altarCount（原版 WorldGen.altarCount 静态位，WorldFile.cs:1303/2100
   *  随存档持久化——跨会话保留；海盗入侵自然 roll 的 >0 门同源 Main.cs:64938） */
  private smashAltar(tx: number, ty: number): void {
    const st = this.world.store;
    const ALTAR = TILE_BY_KEY['v_26_altars'];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 2; dy++) {
        if (!st.inBounds(tx + dx, ty + dy)) continue;
        if (st.type[st.idx(tx + dx, ty + dy)] === ALTAR) st.setTileSilent(tx + dx, ty + dy, 0);
      }
    }
    this.spawnParticles(tx * TILE + 24, ty * TILE + 8, '#B080FF', 14, 2.5);
    this.sfx.play('hit', 1);
    const tier = this.world.altarCount % 3;
    const wave = Math.floor(this.world.altarCount / 3) + 1;
    let veins = (st.w / 4200) * 310 - 85 * tier;
    veins *= 0.85;
    veins /= wave;
    const sheetKeys = tier === 0 ? ['ore_cobalt', 'ore_palladium'] : tier === 1 ? ['ore_mythril', 'ore_orichalcum'] : ['ore_adamantite', 'ore_titanium'];
    const ore = TILE_BY_KEY[sheetKeys[Math.floor(Math.random() * 2)]] ?? TILE_BY_KEY['ore_cobalt'];
    const band = tier === 0 ? this.world.groundLevel : tier === 1 ? this.world.rockLevel : (this.world.rockLevel * 2 + st.h) / 3;
    const rng = new RNG((Math.random() * 1e9) | 0);
    const cap = Math.floor(veins);
    for (let k = 0; k < cap; k++) {
      const x = 100 + Math.floor(Math.random() * (st.w - 200));
      const y = Math.floor(band) + Math.floor(Math.random() * Math.max(1, st.h - 150 - Math.floor(band)));
      const r = 5 + Math.floor(Math.random() * (4 + Math.floor(st.w / 4200)));
      tileRunner(st, rng, lastGenState() ?? { worldSurface: this.world.groundLevel, lavaLine: st.h - 200, waterLine: this.world.groundLevel } as never, x, y, { strength: r, steps: r, type: ore, addTile: true });
    }
    const wraiths = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < wraiths; k++) {
      const e = Enemy.fromVanilla(82, this.player.cx + (Math.random() - 0.5) * 64, this.player.y - 32);
      if (e) {
        e.id = this.entities.nextId++;
        this.entities.enemies.push(e);
      }
    }
    this.world.altarCount++;
  }

  private tryMine(tx: number, ty: number, power: number, toolType: 'pick' | 'axe' | 'hammer', speed: number, useTime?: number) {
    // 联机破坏保护（v3 房间制）：非房主禁挖/禁锤墙
    if (!this.netCanEditTile()) { this.mining = null; this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    // 范围检查
    if (!this.inTileRange(tx, ty)) { this.mining = null; return; }
    const type = this.world.store.get(tx, ty);
    // 恶魔祭坛（tile 26，原版 Player.cs:45058）：镐不可破坏（def pick:-1 拦）；
    // 锤 ≥80 锤力且困难模式 → SmashAltar（砸碎=困难矿三档轮换+幽灵）；
    // 否则进度清零 + 玩家受 statLife/2 电击（ByOther(4)）
    if (type === TILE_BY_KEY['v_26_altars']) {
      this.mining = null;
      if (toolType === 'hammer' && power >= 80 && this.world.flags.hardMode) {
        this.smashAltar(tx, ty);
      } else if (toolType === 'hammer') {
        const p = this.player;
        const dmg = Math.max(1, Math.floor(p.maxHp / 2));
        p.damage(dmg, p.cx - p.facing * 8, p.cy, false);
        this.addDamageNumber(p.cx, p.y, dmg, false, '#B080FF');
        this.sfx.play('hit', 0.8);
      }
      return;
    }
    // 锤：敲除背景墙（无墙则无事发生；也可清装饰）
    if (toolType === 'hammer') {
      // 矿车轨道锤击（Player.cs:45442-45447）：FrameTrack(pound) 循环切换连接/加速向
      if (type === this.trackTile && this.trackTile !== 0) {
        if (this.tickCount - this.lastMineHitTick >= Math.max(8, speed)) {
          this.lastMineHitTick = this.tickCount;
          frameTrack(this.world.store, tx, ty, true);
          this.sfx.play('tink');
        }
        this.mining = null;
        return;
      }
      // 原版锤循环（Player.cs:45625-45695）：整砖→半砖→slope1→2→3→4→整砖。
      // 方向感知：右实左空 → 先 slope2；上实下空（天花板模式）→ 先 slope3/4。
      // 平台族的锤循环（:45394-45440 平台坡面/楼梯）未接入——依赖登记：
      // 平台 slope 帧的楼梯绘制 + 对应坡面碰撞（平台 slope1-4 的可行走楼梯几何）
      const hd = TILE_DEFS[type];
      const poundable = type !== 0 && !!hd && hd.solid && !hd.platform && !hd.framed;
      if (poundable && this.world.store.isSolid(tx, ty) && this.tickCount - this.lastMineHitTick >= Math.max(8, speed)) {
        this.lastMineHitTick = this.tickCount;
        const st = this.world.store;
        const i = st.idx(tx, ty);
        // WorldGen.SolidTile：active && tileSolid && !solidTop && !half && slope==0
        const solidFull = (x: number, y: number) => {
          if (!st.inBounds(x, y)) return false;
          const j = st.idx(x, y);
          const dj = TILE_DEFS[st.type[j]];
          return !!st.flags[j] && !!dj && dj.solid && !dj.platform && !st.half[j] && st.slope[j] === 0;
        };
        if (st.half[i] || st.slope[i] !== 0) {
          let num11 = 1, num12 = 1, num13 = 2;
          if ((solidFull(tx + 1, ty) || st.slope[st.idx(tx + 1, ty)] === 1 || st.slope[st.idx(tx + 1, ty)] === 3)
            && !solidFull(tx - 1, ty)) { num12 = 2; num13 = 1; }
          if (solidFull(tx, ty - 1) && !solidFull(tx, ty + 1)) num11 = -1;
          const s = st.slope[i];
          const next = num11 === 1
            ? (s === 0 ? num12 : s === num12 ? num13 : s === num13 ? num12 + 2 : s === num12 + 2 ? num13 + 2 : 0)
            : (s === 0 ? num12 + 2 : s === num12 + 2 ? num13 + 2 : s === num13 + 2 ? num12 : s === num12 ? num13 : 0);
          st.setSlope(tx, ty, next); // setSlope 无条件清 half——与原版 SlopeTile 一致
        } else {
          st.setHalfBrick(tx, ty, true); // PoundTile：整砖→半砖
        }
        this.sfx.play('tink');
        this.mining = null;
        return;
      }
      // 墙读取不受前景 tile 影响（原版：火把/平台/门后的墙可锤；实心块已被上方
      // 半砖分支拦截——实心块后的墙原版同样不可直接锤，语义一致）
      const wall = this.world.store.wall[this.world.store.idx(tx, ty)];
      if (type !== 0 && TILE_DEFS[type]?.decor) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      if (!wall) { this.mining = null; return; }
      // HitTile 制（type 2 = 墙）：每挥一击，阈值 100
      if (this.tickCount - this.lastMineHitTick < Math.max(8, speed)) {
        this.hardnessCache = 100;
        this.mining = { x: tx, y: ty, progress: this.hitTiles.getDamage(tx, ty, 2) };
        return;
      }
      this.lastMineHitTick = this.tickCount;
      const total = this.hitTiles.addDamage(tx, ty, Math.round(power * 2), 2); // 锤墙：木 5 击 / 铜 2 击
      this.hardnessCache = 100;
      this.mining = { x: tx, y: ty, progress: total };
      this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 2, 1.2);
      if (total >= 100) {
        this.hitTiles.clear(tx, ty, 2);
        this.world.store.setWall(tx, ty, 0);
        this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 8, 1.8);
        this.sfx.play('chop');
        this.mining = null;
      }
      return;
    }
    if (type === 0 || !this.toolCanBreak(type, power, toolType)) {
      // 装饰物（杂草等）任意工具/武器一下清掉并掉落
      if (type !== 0 && TILE_DEFS[type]?.decor && (toolType === 'pick' || toolType === 'axe')) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      this.mining = null;
      return;
    }
    // ---- 原版 HitTile 制 1:1（Player.cs:45032-45120 ItemCheck_UseMiningTools_ActuallyUseMiningTool
    //      + :52981 GetPickaxeDamage）：每击积累、阈值 100 破坏；冷却 = useTime
    //      （原版 toolTime=ApplyItemTime(useTime)，非 useAnimation）。
    //      采矿加速（TileSpeedAcc 砌砖刀/建筑师背包族：冷却 -25%）----
    const tileSpeedMult = (this.player.equipStats.tileSpeed || this.player.buffs.has(BuffType.Mining)) ? 0.75 : 1;
    // 食物 pickSpeed -= 5/10/15%（Player.cs:11534+）× 风筝 −15%（:9616）→
    // 冷却按原版 useTime/pickSpeed 缩短
    const pickMult = this.player.buffs.pickSpeedMult;
    const cooldown = Math.max(8, Math.round((useTime ?? speed) / this.player.attackSpeedMult) * tileSpeedMult / pickMult);
    if (this.tickCount - this.lastMineHitTick < cooldown) {
      // 节流窗内：只刷新裂缝显示，不积累
      this.hardnessCache = 100;
      this.mining = { x: tx, y: ty, progress: this.hitTiles.getDamage(tx, ty) };
      return;
    }
    this.lastMineHitTick = this.tickCount;
    const d = TILE_DEFS[type];
    const sheet = d?.vanilla?.sheet ?? -1;
    let dmg: number;
    if (TILE_NO_FAIL.has(sheet)) {
      // tileNoFail（Main.cs:7138-10198 表）：一次挥击直接破坏（原版 num2=100）
      dmg = 100;
    } else if (TILE_AXE_SHEETS.has(sheet)) {
      // 斧族 tile（树/仙人掌/棕榈/宝石树等，Main.cs:7157-7172 tileAxe 表）：
      // 仅斧有效（原版 pick 分支被 tileAxe 排除——镐不能砍树）；
      // 伤害 = int(斧力×1.2)（仙人掌 80 ×3 再 ×1.2，Player.cs:45098-45100）
      dmg = toolType === 'axe' ? Math.floor((sheet === 80 ? power * 3 : power) * 1.2) : 0;
    } else if (toolType === 'pick') {
      // 镐族：伤害 = 镐力，分档除数（GetPickaxeDamage:52981-53015）
      dmg = power;
      if (sheet === 107 || sheet === 221) dmg = Math.floor(power / 2);        // 钴/钯金矿
      else if (sheet === 108 || sheet === 222) dmg = Math.floor(power / 3);    // 秘银/山铜矿
      else if (sheet === 111 || sheet === 223) dmg = Math.floor(power / 4);    // 精金/钛金矿
      else if (sheet === 211) dmg = Math.floor(power / 5);                     // 绿藻矿
      else if (sheet === 226 || sheet === 237) dmg = Math.floor(power / 4);    // 蜥蜴砖
      else if (sheet === 25 || sheet === 203 || sheet === 117 || sheet === 58
        || TILE_DUNGEON_SHEETS.has(sheet)) dmg = Math.floor(power / 2);        // 黑檀/猩红/狱岩/地狱石砖/地牢砖
      else if (sheet === 48 || sheet === 232) dmg = power * 2;                 // 云块
      // 门槛归零（GetPickaxeDamage:53017-53075 gate 段——镐力不足=无伤害）
      const underSurf = ty > this.world.groundLevel;
      if (sheet === 211 && power < 200) dmg = 0;                              // 绿藻 200
      else if ((sheet === 25 || sheet === 203) && power < (underSurf ? 55 : 65)) dmg = 0;
      else if (sheet === 117 && power < 65) dmg = 0;
      else if (sheet === 37 && power < 50) dmg = 0;                            // 陨石 50
      else if ((sheet === 22 || sheet === 204) && underSurf && power < 55) dmg = 0; // 地下魔金/猩红矿
      else if (sheet === 56 && power < 55) dmg = 0;                            // 黑曜石 55
      else if (sheet === 77 && power < 65 && ty >= (this.world.lavaLine || this.world.h - 200)) dmg = 0;
      else if (sheet === 58 && power < 65) dmg = 0;                            // 狱岩 65
      else if ((sheet === 226 || sheet === 237) && power < 210) dmg = 0;       // 蜥蜴砖 210
      else if (TILE_DUNGEON_SHEETS.has(sheet) && power < 100 && underSurf) dmg = 0; // 地牢砖 100
    } else {
      // 斧/锤点在非斧族 tile：原版该分支无伤害（hammer 墙路径在上方已分流）
      dmg = 0;
    }
    const total = this.hitTiles.addDamage(tx, ty, dmg);
    this.hardnessCache = 100;
    this.mining = { x: tx, y: ty, progress: total }; // 裂缝显示 = 积累进度
    this.spawnParticles(tx * TILE + 8, ty * TILE + 8, d.mapColor, 2, 1.2);
    if (total >= 100) {
      this.hitTiles.clear(tx, ty);
      this.breakTile(tx, ty);
      this.mining = null;
      // 破坏完成音：按材质区分
      if (toolType === 'axe') this.sfx.play('chop');
      else if (/stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(d.key)) this.sfx.play('tink');
      else this.sfx.play('dig');
    }
  }

  private tileHardness(type: number): number {
    const d = TILE_DEFS[type];
    // 铜镐基准（52/tick）：泥土 ~0.25s / 石 ~0.6s / 铜矿 ~0.8s / 金矿 ~1.6s
    // 树（斧）：木斧 ~2s / 铜斧 ~1s / 金斧 ~0.4s
    if (type === T.TREE) return 3400;
    if (type === T.LEAVES) return 40;
    if (d.decor) return 60;
    if (d.framed && !d.solid) return 300;               // 工作台/铁砧等
    switch (type) {
      case T.DIRT: case T.GRASS: case T.SAND: case T.SNOW: return 780;
      case T.STONE: return 1870;
      case T.WOOD: case T.PLATFORM: return 1250;
      case T.ORE_COPPER: return 2500;
      case T.ORE_IRON: return 3100;
      case T.ORE_SILVER: return 4100;
      case T.ORE_GOLD: return 5000;
      default: return 1000;
    }
  }

  /** 破坏 tile：处理树整体砍伐与 object 锚点 */
  breakTile(x: number, y: number) {
    const st = this.world.store;
    const type = st.get(x, y);
    if (type === 0) return;
    const def = TILE_DEFS[type];

    // 树：砍树干 → 整棵树倒下（自有树 + 导入的原版树族）
    if (type === T.TREE) {
      this.fellTree(x, y);
      return;
    }
    // 暗影之球/恶魔之心：整体破碎（原版 WorldGen.CheckOrb 移植）
    if (type === TILE_BY_KEY['v_31_orb_heart']) {
      this.smashOrbHeart(x, y);
      return;
    }
    // 瓦罐：统一走 smashPot（整罐洪水填充 + loot）。
    // 不能落入下方 object 锚点分支——瓦罐帧编码是【底行 frameY=0、顶行 frameY=18】
    // （贴图表视觉 Y 偏移，与家具的"顶行 0"相反），锚点公式会按 gy 上移 →
    // 清掉罐底下一格的地面、罐体留在原地 → 可重复破坏刷战利品
    if (type === POT_TILE) {
      this.smashPot(x, y);
      return;
    }
    if (IMPORTED_TREE_TYPES.has(type)) {
      this.fellImportedTree(x, y, type);
      return;
    }
    // 幼虫（原版 KillTile case 231, WorldGen.cs:53254-53280）：整件破碎无掉落，
    // 300 格内召蜂后——须在 object 锚点分支前拦（否则按家具掉 place_ 物品）
    if (type === TILE_BY_KEY['v_231_larva']) {
      this.breakLarva(x, y);
      return;
    }
    // 蜂巢块（原版 KillTile case 225, WorldGen.cs:65524-65545）：1/3 变满蜂蜜
    // （打破流蜜），否则掉蜂巢物品 + 1/2 概率出 1-2 只蜜蜂
    if (type === TILE_BY_KEY['v_225_hive_block']) {
      this.breakHive(x, y);
      return;
    }
    // 传送晶塔：整件破碎（TETeleportationPylon.Framing_CheckTile :77-125——
    // 3×4 任一格破坏即整塔清除并掉放置物品）+ 晶塔表刷新（OnRemoved →
    // RequestImmediateUpdate，:105-108）
    if (type === TILE_BY_KEY['v_597_pylons']) {
      this.breakPylon(x, y);
      return;
    }
    // 附魔剑圣地之剑（原版 KillTile case 187/706, WorldGen.cs:49676/49838-49848）：
    // 真 187 style17（锚点帧 918-970）→ 1/30 泰拉魔刃(4144) 否则附魔剑(989)；
    // 706 回声恒掉 4144。假剑 186 style15 无掉落走 def.drop:null 兜底，不在此拦。
    // 须在 object 锚点分支前拦（否则锚点路径掉落被 drop:null 吞掉）
    if (type === TILE_BY_KEY['v_187_decos_3x2_group_2'] || type === TILE_BY_KEY['v_706_terragrim_shrine_echo']) {
      this.breakShrineSword(x, y, type);
      return;
    }
    // 世花球茎/生命果植物（KillTile 尾段，WorldGen.cs:48013-48036）：
    // 238 破坏 = 2×2 整件清除 + 50 格内有玩家 → SpawnOnPlayer(262) 召唤世花；
    // 236 破坏 = 掉生命果(1291)。须在 object 锚点分支前拦（drop:null 会吞掉掉落）
    if (type === TILE_BY_KEY['v_238_plantera_s_bulb'] || type === TILE_BY_KEY['v_236_life_fruit_plant']) {
      const i0 = st.idx(x, y);
      const ax = x - Math.floor(st.frameX[i0] / 18), ay = y - Math.floor(st.frameY[i0] / 18);
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          if (st.inBounds(ax + dx, ay + dy) && st.get(ax + dx, ay + dy) === type) st.setTile(ax + dx, ay + dy, 0);
        }
      }
      if (type === TILE_BY_KEY['v_238_plantera_s_bulb']) {
        if (Math.abs(this.player.cx - (ax * 16 + 16)) + Math.abs(this.player.cy - (ay * 16 + 16)) < 50 * 16) {
          this.summonBoss('plantera');
        }
      } else {
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'vi_1291_life_fruit', 1);
      }
      this.spawnParticles(x * TILE + 8, y * TILE + 8, '#E180CE', 8, 1.8);
      return;
    }
    // 矿车轨道（KillTile 314）：清除 + 六邻重 framing（邻线自动改道）+ 按
    // 轨道类型掉对应物品（Minecart.GetTrackItem：普通 2340 / 压板 2492 / 加速 2739）
    if (type === this.trackTile && this.trackTile !== 0) {
      const i0 = st.idx(x, y);
      const frame = st.frameX[i0] >= 36 ? 0 : st.frameX[i0];
      const vid = trackItemId(frame);
      const dropKey = vid === 2340 ? 'vi_2340_minecart_track'
        : vid === 2492 ? 'vi_2492_PressureTrack'
        : vid === 2739 ? 'vi_2739_BoosterTrack'
        : 'place_v_314_minecart_track';
      st.setTile(x, y, 0);
      frameTrackArea(st, x, y);
      this.spawnDrop(x * TILE + 8, y * TILE + 8, dropKey, 1);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, '#B5A47D', 6, 1.5);
      this.sfx.play('dig');
      return;
    }
    // 门：竖排帧布局（Door.ts），通用锚点算法不适用，整扇移除
    const doorAnchor = clearDoorAt(st, x, y);
    if (doorAnchor) {
      this.spawnDrop(doorAnchor[0] * TILE + 8, doorAnchor[1] * TILE, def.drop ?? 'door', 1);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 8, 1.8);
      return;
    }
    // 挂物族（原版 KillTile 前置特例，WorldGen.cs:63703-63746）：
    //  框/武器架/食物盘/展示罐【有物】→ 本次击打只弹出存放物、方块保留
    //   （KillTile_DropItems :63703-63738 DropItem 后提前 return；第二击才真正破坏）；
    //  模特/帽架【有物】→ 整件不可破坏（TEDisplayDoll.IsBreakable :877-891 /
    //   TEHatRack.IsBreakable :369-376 → WorldGen.cs:62540-62560
    //   CheckTileBreakability2_ShouldTileSurvive）
    if (FURNITURE_TILE_KIND.has(type)) {
      const fKind = FURNITURE_TILE_KIND.get(type)!;
      const [fax, fay] = furnitureAnchor(st, fKind, x, y);
      const fbr = furnitureTryBreak(this.world.furnitureItems, fKind, fax, fay);
      if (fbr.result === 'pop') {
        if (fbr.item) {
          this.spawnDrop(fax * TILE + 8, fay * TILE, ITEM_DEFS[fbr.item.id].key, fbr.item.stack, 0, -2);
        }
        this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 4, 1.2);
        return;
      }
      if (fbr.result === 'blocked') return;
      // 'break'：空物 → 落入下方 object/普通清除路径，记录在清除点移除
    }
    // object：找锚点整体移除。锚点 = 命中格 (2w-1)×(2h-1) 邻域内同类型、帧相位为 (0,0)
    // （fv%(w*18)==0 且 fyv%(h*18)==0，兼容 style 偏移）、且 w×h 框包含命中格的候选中
    // 帧最小的格——两个同款物体紧邻时也能选对所属的那件（全局最小帧会误选隔壁那件）；
    // 候选落空回退帧最小格（约定无关：家具顶行锚/陶罐底行锚均可）
    if ((def.w ?? 1) > 1 || (def.h ?? 1) > 1) {
      const ow = def.w ?? 1, oh = def.h ?? 1;
      // 破坏前帧捕获（八音盒/喷泉按帧带定掉落物；清格会归零帧）
      const preFrameX = st.frameX[st.idx(x, y)], preFrameY = st.frameY[st.idx(x, y)];
      let ax = x, ay = y, best = Infinity, hasCandidate = false;
      for (let dx = -(ow - 1); dx <= ow - 1; dx++) {
        for (let dy = -(oh - 1); dy <= oh - 1; dy++) {
          const nx = x + dx, ny = y + dy;
          if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== type) continue;
          const ni = st.idx(nx, ny);
          const key = st.frameY[ni] * 4096 + st.frameX[ni];
          const phaseAnchor = st.frameX[ni] % (ow * 18) === 0 && st.frameY[ni] % (oh * 18) === 0;
          const boxContains = nx <= x && nx + ow > x && ny <= y && ny + oh > y;
          if (phaseAnchor && boxContains) {
            // 合格候选：相位 (0,0) 且框包含命中格
            if (!hasCandidate || key < best) { hasCandidate = true; best = key; ax = nx; ay = ny; }
          } else if (!hasCandidate && key < best) {
            best = key; ax = nx; ay = ny;
          }
        }
      }
      for (let dx = 0; dx < ow; dx++) {
        for (let dy = 0; dy < oh; dy++) {
          st.setTile(ax + dx, ay + dy, 0);
        }
      }
      // 掉落:drop:null = 显式无掉落(原版装饰类,如 165 冰凌/蛛网卵袋);仅 undefined
      // 才走 v_ 回收兜底(place_v_ 再放置)。曾用 ?? ——null 同样触发兜底,null 语义失效
      let dropKey = def.drop === undefined ? (def.key.startsWith('v_') ? 'place_' + def.key : '') : def.drop;
      // 八音盒/喷泉按帧带掉对应唱片/喷泉（CheckMB :51288-51292 /
      // Check2xX :38199-38226——139 style=frameY/36、207 style=frameX/36；
      // KillTile_GetItemDrops 两 tile 均在无掉落表里，掉落全走帧检分支）
      const framedSheet = def.vanilla?.sheet ?? -1;
      if (framedSheet === 139) {
        dropKey = VANILLA_ITEM_KEY_BY_ID[musicBoxDropItemOf(Math.floor(preFrameY / 36))] ?? dropKey;
      } else if (framedSheet === 207) {
        const fDrop = fountainDropItemOf(Math.floor(preFrameX / 36));
        if (fDrop > 0) dropKey = VANILLA_ITEM_KEY_BY_ID[fDrop] ?? dropKey;
      }
      if (dropKey) this.spawnDrop(ax * TILE + 8, ay * TILE, dropKey, 1);
      // 告示牌族（Main.tileSign {55,85,425,573}，Main.cs:9990-9993）破坏 → 注销
      // 牌面文本登记（WorldGen.cs:43733 Sign.KillSign，帧检分支）
      if (framedSheet === 55 || framedSheet === 85 || framedSheet === 425 || framedSheet === 573) {
        this.world.signs = this.world.signs.filter((s) => !(s.x === ax && s.y === ay));
      }
      // 宝箱内容物掉出
      if (type === T.CHEST) this.dumpChest(ax, ay);
      // 挂物族：空物破坏 → 移除存放记录（TileEntityType.Kill，TileEntity.cs:110-116；
      //  挂物族锚点公式与通用锚点算法在这些 tile 上一致，直接用 ax/ay）
      if (FURNITURE_TILE_KIND.has(type)) removeFurnitureAt(this.world.furnitureItems, ax, ay);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 8, 1.8);
      return;
    }
    // 可砍植物（Main.tileCut）：清格 + 拂草声（SoundID 6 = Grass.wav）。
    // 蘑菇类例外可采集（KillTile_GetItemDrops，WorldGen.cs:65041-65076）：
    //   tile 3 帧 144（蘑菇）→ item 5 / tile 24 帧 144（邪恶蘑菇）→ item 60
    //   tile 201 帧 270（血腥蘑菇）→ item 2887
    //   tile 71 发光蘑菇株 → case 71/72（WorldGen.cs:65697-65707）：
    //     1/40 蘑菇草种子(194) / 否则 1/2 发光蘑菇(183) / 否则无掉落
    //   ——其余 plant 类无掉落
    if (type !== POT_TILE && TILE_CUT.has(type)) {
      // ★ 帧必须在清格前捕获：setTile(0) 会把 frameX/frameY 归零，
      //   曾在清格后读帧 → fx 恒 0，蘑菇（帧 144）永远判不中 → 不掉落
      const sheet = def.vanilla?.sheet;
      const fx = st.frameX[st.idx(x, y)];
      st.setTile(x, y, 0);
      this.sfx.play('chop', 1, x * TILE + 8, y * TILE + 8);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 5, 1.4);
      // 原版 Main.rand：Next(40)==0 → 种子；否则 Next(2)==0 → 发光蘑菇
      const roll = sheet === 71 ? new RNG((Math.random() * 1e9) | 0) : null;
      const mushroomDrop =
        sheet === 3 && fx === 144 ? 'mushroom_item'
          : sheet === 24 && fx === 144 ? VANILLA_ITEM_KEY_BY_ID[60]
            : sheet === 201 && fx === 270 ? VANILLA_ITEM_KEY_BY_ID[2887]
              : sheet === 71 && roll
                ? (roll.nextInt(40) === 0 ? 'mushroom_grass_seeds'
                  : roll.nextInt(2) === 0 ? 'vi_183_glowing_mushroom' : null)
                : null;
      if (mushroomDrop && ITEM_BY_KEY[mushroomDrop] !== undefined) {
        this.spawnDrop(x * TILE + 8, y * TILE + 8, mushroomDrop, 1);
      }
      return;
    }
    // 瓦罐分支已上移到函数顶部（smashPot 统一处理）；此处到达即防御性清格
    if (type === POT_TILE) {
      st.setTile(x, y, 0);
      return;
    }
    // 普通（★ 帧必须在清格前捕获——setTile(0) 清零 frameX）
    const fxHere = st.frameX[st.idx(x, y)];
    st.setTile(x, y, 0);
    // 挂物族 1×1（食物盘 520）：破坏 → 移除存放记录（TileEntityType.Kill）
    if (FURNITURE_TILE_KIND.has(type)) removeFurnitureAt(this.world.furnitureItems, x, y);
    // 宝石暴露晶簇（KillTile_GetItemDrops case 178，:65545-65569）：
    // style=frameX/18 → 0紫181/1黄180/2蓝177/3翠179/4红178/5钻182/6琥珀999
    if (def.vanilla?.sheet === 178) {
      const gemId = [181, 180, 177, 179, 178, 182, 999][Math.floor(fxHere / 18)] ?? 181;
      const gemKey = VANILLA_ITEM_KEY_BY_ID[gemId];
      if (gemKey && ITEM_BY_KEY[gemKey] !== undefined) {
        this.spawnDrop(x * TILE + 8, y * TILE + 8, gemKey, 1);
      }
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 6, 1.5);
      return;
    }
    // 破坏树木正下方的支撑方块 → 整棵树倒下（掉木材）
    const treeOnTop = this.world.trees.find((t) => t.x === x && t.y + t.h === y);
    if (treeOnTop) this.fellTree(x, y - 1);
    if (def.drop) this.spawnDrop(x * TILE + 8, y * TILE + 8, def.drop, 1);
    else if (def.key.startsWith('v_')) this.spawnDrop(x * TILE + 8, y * TILE + 8, 'place_' + def.key, 1);
    this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 6, 1.5);
  }

  /** 蜂巢块破坏（KillTile case 225 → world/hive.ts）：流蜜或掉物+出蜂 */
  private breakHive(x: number, y: number) {
    const st = this.world.store;
    const rng = new RNG((Math.random() * 1e9) | 0);
    const hive = TILE_BY_KEY['v_225_hive_block']!;
    breakHiveBlock(st, x, y, rng, {
      dropHiveItem: (px, py) => this.spawnDrop(px, py, 'place_v_225_hive_block', 1),
      spawnBee: (px, py, r) => {
        // type=Next(210,212)；初速 ±0.4（Next(-200,201)*0.002）
        const bee = Enemy.fromVanilla(r.next() < 0.5 ? 210 : 211, px, py);
        if (!bee) return;
        bee.vx = (r.next() - 0.5) * 0.8;
        bee.vy = (r.next() - 0.5) * 0.8;
        bee.id = this.entities.nextId++;
        this.entities.add(bee, 'enemies');
      },
    });
    this.spawnParticles(x * TILE + 8, y * TILE + 8, TILE_DEFS[hive].mapColor, 6, 1.5);
  }

  /** 幼虫破坏（KillTile case 231）：3×3 整件清除 + 300 格内召蜂后（无掉落） */
  /** 圣地之剑破坏（KillTile case 187 style17 / 706，WorldGen.cs:49676/49838-49848 1:1）：
   *  187 真 187 style17（锚点帧 918-970）→ Main.rand.Next(30)==0 泰拉魔刃(4144)，
   *  否则附魔剑(989)；706 回声恒掉 4144。其他 style（蜘蛛巢覆饰等）不掉落。
   *  锚点帧必须在清格前捕获 */
  private breakShrineSword(x: number, y: number, type: number) {
    const st = this.world.store;
    const def = TILE_DEFS[type];
    const ow = def?.w ?? 1, oh = def?.h ?? 1;
    // 锚点（同 breakTile 通用算法）：相位 (0,0) 且框包含命中格，取帧最小
    let ax = x, ay = y, best = Infinity;
    for (let dx = -(ow - 1); dx <= ow - 1; dx++) {
      for (let dy = -(oh - 1); dy <= oh - 1; dy++) {
        const nx = x + dx, ny = y + dy;
        if (!st.inBounds(nx, ny) || st.type[st.idx(nx, ny)] !== type) continue;
        const ni = st.idx(nx, ny);
        const phaseAnchor = st.frameX[ni] % (ow * 18) === 0 && st.frameY[ni] % (oh * 18) === 0;
        const boxContains = nx <= x && nx + ow > x && ny <= y && ny + oh > y;
        if (phaseAnchor && boxContains) {
          const key = st.frameY[ni] * 4096 + st.frameX[ni];
          if (key < best) { best = key; ax = nx; ay = ny; }
        }
      }
    }
    const fx = st.frameX[st.idx(ax, ay)];
    for (let dx = 0; dx < ow; dx++) {
      for (let dy = 0; dy < oh; dy++) {
        if (st.inBounds(ax + dx, ay + dy)) st.setTile(ax + dx, ay + dy, 0);
      }
    }
    // 掉落判定（帧区间取锚点帧：187 style17 = 918..970，case 用 Main.rand）
    let dropKey: string | null = null;
    if (type === TILE_BY_KEY['v_706_terragrim_shrine_echo']) {
      dropKey = VANILLA_ITEM_KEY_BY_ID[4144] ?? null;
    } else if (fx >= 918 && fx <= 970) {
      dropKey = VANILLA_ITEM_KEY_BY_ID[Math.random() < 1 / 30 ? 4144 : 989] ?? null;
    }
    if (dropKey && ITEM_BY_KEY[dropKey] !== undefined) {
      this.spawnDrop(ax * TILE + 8, ay * TILE, dropKey, 1);
    }
    this.spawnParticles(x * TILE + 8, y * TILE + 8, def?.mapColor ?? '#C8C8C8', 8, 1.8);
  }

  private breakLarva(x: number, y: number) {
    const st = this.world.store;
    const larva = TILE_BY_KEY['v_231_larva']!;
    // 命中格 ±2 邻域内同类型全清（幼虫恒为单件 3×3，紧邻第二件的场景不存在）
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (st.inBounds(x + dx, y + dy) && st.get(x + dx, y + dy) === larva) st.setTile(x + dx, y + dy, 0);
      }
    }
    this.spawnParticles(x * TILE + 8, y * TILE + 8, '#E0C265', 10, 2);
    // 距离判定 + 蜂后召唤（原版 SpawnOnPlayer(222)；boss 流程复用 summonBoss）
    if (larvaSummonInRange(this.player.x, this.player.y, x, y)) {
      this.summonBoss('queen_bee');
    }
  }

  private fellTree(x: number, y: number) {
    // 向上找树顶（同列 TREE tile），向下到 Grass
    const st = this.world.store;
    let top = y;
    while (st.get(x, top - 1) === T.TREE) top--;
    let bottom = y;
    while (st.get(x, bottom + 1) === T.TREE) bottom++;
    const height = bottom - top + 1;
    // 树冠 80×80 以树顶为中心外扩 2-3 格：显式区域标脏，
    // 否则不含树干格的邻 chunk 不会重绘 → 树叶残留
    this.chunks.markDirtyArea(x - 4, top - 4, x + 4, bottom + 1);
    // 清除树干 + 两侧树枝（支干只在紧邻树干处生成，不会误伤邻树），并记录枝干位置
    const branchSpots: Array<{ x: number; y: number }> = [];
    for (let yy = top; yy <= bottom; yy++) {
      st.setTile(x, yy, 0);
      for (const s of [-1, 1]) {
        if (st.get(x + s, yy) === T.TREE) {
          branchSpots.push({ x: x + s, y: yy });
          st.setTile(x + s, yy, 0);
        }
      }
    }
    // 清除树冠（树顶周围半径 3 的 LEAVES）
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -4; dy <= 1; dy++) {
        if (st.get(x + dx, top + dy) === T.LEAVES) st.setTile(x + dx, top + dy, 0);
      }
    }
    // 掉木材：树干每段 1 个独立掉落物沿干散落；每根枝干也额外掉 1 份（掉在枝干处）
    const wood = Math.max(1, Math.floor(height * 0.8));
    for (let p = 0; p < wood; p++) {
      const dropY = (top + Math.floor((p + 0.5) * height / wood)) * TILE;
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    for (const b of branchSpots) {
      this.spawnDrop(b.x * TILE + 8, b.y * TILE + 8, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：较大概率（75%）掉 2-3 颗，沿树冠区域散落供补种
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'acorn', 1, (Math.random() - 0.5) * 3, -3 - Math.random());
      }
    }
    this.spawnParticles(x * TILE + 8, top * TILE + 8, '#2E8B3D', 14, 2.2);
    // 从登记表移除
    const t = this.world.trees.findIndex((tr) => tr.x === x && Math.abs(tr.y - top) <= 2);
    if (t >= 0) this.world.trees.splice(t, 1);
  }

  /** 砍导入的原版树（tile 5 / 宝石树 / 装饰树 / 灰烬树）：
   *  同列同类型连续段 = 整棵树（含顶部树冠标记格），整棵移除 + 掉木材。
   *  首击即倒（不做倒树动画——动画实体绑定自有树的登记表结构） */
  /** 暗影之球/恶魔之心整体破碎（原版 WorldGen.CheckOrb 移植，WorldGen.cs:31813-31960）：
   *  帧锚点定位（frameX∈{0,36} 是左列）→ 2×2 四格一起清除；
   *  战利品：首破固定（暗影之球:恶魔之心 + 凝胶100；恶魔之心:生命水晶 + 凝胶100），
   *  之后 5 选 1 随机；无原版物品的部分用现有道具近似 */
  private smashOrbHeart(x: number, y: number) {
    const st = this.world.store;
    const orbId = TILE_BY_KEY['v_31_orb_heart'];
    const i = st.idx(x, y);
    const fx = st.frameX[i];
    const isDemonHeart = fx >= 36; // 原版：frameX ≥ 36 = 恶魔之心（猩红世界）
    const ax = (fx === 0 || fx === 36) ? x : x - 1;
    const ay = st.frameY[i] !== 0 ? y - 1 : y;
    this.chunks.markDirtyArea(ax - 1, ay - 1, ax + 2, ay + 2);
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) st.setTile(ax + dx, ay + dy, 0);
    }
    // 战利品（近似：首破固定 + 之后随机）
    const drops: Array<[string, number]> = !this.world.flags.shadowOrbSmashed
      ? (isDemonHeart ? [['coin_gold', 1], ['gel', 100]] : [['suspicious_eye', 1], ['gel', 100]])
      : [['coin_silver', 5], ['gel', 60]];
    for (const [key, n] of drops) {
      this.spawnDrop(ax * TILE + 8, ay * TILE + 8, key, n, (Math.random() - 0.5) * 3, -3);
    }
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, isDemonHeart ? '#FF4060' : '#9A6AE0', 16, 2.5);
    this.sfx.play('tink');
    this.cb.onToast(isDemonHeart ? Lang.text('Mods.SandboxWorld.Toast.DemonHeartSmashed') : Lang.text('Mods.SandboxWorld.Toast.ShadowOrbSmashed'));
    if (!this.world.flags.shadowOrbSmashed) {
      this.world.flags.shadowOrbSmashed = true;
    }
  }

  private fellImportedTree(x: number, y: number, type: number) {
    const st = this.world.store;
    let top = y;
    while (st.get(x, top - 1) === type) top--;
    let bottom = y;
    while (st.get(x, bottom + 1) === type) bottom++;
    const height = bottom - top + 1;
    this.chunks.markDirtyArea(x - 6, top - 7, x + 6, bottom + 1);
    // 清树干列 + 紧邻的侧枝（同类型，仅 ±1 防 "格洞" 残留）
    for (let yy = top; yy <= bottom; yy++) {
      st.setTile(x, yy, 0);
      for (const s of [-1, 1]) {
        if (st.get(x + s, yy) === type) st.setTile(x + s, yy, 0);
      }
    }
    // 蘑菇树（sheet 72）：不走树干木材/橡实——原版 KillTile_GetTreeDrops 仅覆盖
    // tile 5/596/616/634（WorldGen.cs:65267），72 走 case 71/72 掷骰（:65697-65707）：
    //   每格 1/40 蘑菇草种子(194) / 否则 1/2 发光蘑菇(183) / 否则无掉落
    if (TILE_DEFS[type]?.vanilla?.sheet === 72) {
      const roll = new RNG((Math.random() * 1e9) | 0);
      for (let yy = top; yy <= bottom; yy++) {
        const key = roll.nextInt(40) === 0 ? 'mushroom_grass_seeds'
          : roll.nextInt(2) === 0 ? 'vi_183_glowing_mushroom' : null;
        if (key && ITEM_BY_KEY[key] !== undefined) {
          this.spawnDrop(x * TILE + 8, yy * TILE + 8, key, 1, (Math.random() - 0.5) * 2, -2 - Math.random());
        }
      }
      this.spawnParticles(x * TILE + 8, top * TILE + 8, TILE_DEFS[type]?.mapColor ?? '#2E8B3D', 14, 2.2);
      return;
    }
    // 宝石树（sheet 583-589；KillTile_GetItemDrops :65754-65802 + SetGemTreeDrops :66149-66163）：
    // 每格 1/10 对应宝石×1 / 否则石块×1-2；干基格（frameX≥22 && frameY≥198）50% gemcorn
    const gemSheet = TILE_DEFS[type]?.vanilla?.sheet ?? 0;
    if (gemSheet >= 583 && gemSheet <= 589) {
      // 干基帧在清格前捕获（setTile(0) 清零 frame）
      const baseFi = st.idx(x, bottom);
      const isBase = st.frameX[baseFi] >= 22 && st.frameY[baseFi] >= 198;
      const gemOf: Record<number, [number, number]> = {
        583: [180, 4851], 584: [181, 4852], 585: [177, 4853],
        586: [179, 4854], 587: [178, 4855], 588: [182, 4856], 589: [999, 4857],
      };
      const [gemId, seedId] = gemOf[gemSheet];
      const height2 = bottom - top + 1;
      for (let yy = top; yy <= bottom; yy++) {
        const dropId = Math.random() < 0.1 ? gemId : 3;   // 1/10 宝石 / 9/10 石块
        const stack = dropId === 3 ? 1 + Math.floor(Math.random() * 2) : 1;
        const key = dropId === 3 ? 'stone_block' : VANILLA_ITEM_KEY_BY_ID[dropId];
        if (key && ITEM_BY_KEY[key] !== undefined) {
          this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, yy * TILE,
            key, stack, (Math.random() - 0.5) * 2, -2 - Math.random());
        }
      }
      // 干基格 50% gemcorn（树苗种子；frameX≥22 即主干底格）
      if (isBase && Math.random() < 0.5) {
        const seedKey = VANILLA_ITEM_KEY_BY_ID[seedId];
        if (seedKey && ITEM_BY_KEY[seedKey] !== undefined) {
          this.spawnDrop(x * TILE + 8, bottom * TILE, seedKey, 1, (Math.random() - 0.5) * 2, -2 - Math.random());
        }
      }
      void height2;
      this.spawnParticles(x * TILE + 8, top * TILE + 8, '#B46BD8', 14, 2.2);
      return;
    }
    // 掉木材（与自有树同比例）+ 树顶枝条额外几份
    const wood = Math.max(1, Math.floor(height * 0.8));
    for (let p = 0; p < wood; p++) {
      const dropY = (top + Math.floor((p + 0.5) * height / wood)) * TILE;
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：与自有树同规则（75% 掉 2-3 颗，沿树冠区域散落供补种）
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'acorn', 1, (Math.random() - 0.5) * 3, -3 - Math.random());
      }
    }
    this.spawnParticles(x * TILE + 8, top * TILE + 8, '#2E8B3D', 14, 2.2);
  }

  /** 电路工具使用(原版 Player.cs:30289-30444 ItemCheck_UseWiringTools) */
  private useWireTool(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    if (!this.netCanEditTile()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (!this.inTileRange(tx, ty, 20)) return; // 原版多彩扳手/蓝图 tileBoost=20
    if (this.player.useTime > 0) return;
    const wt = itemDef.wireTool!;
    const inv = this.player.inv;

    // 致动魔杖:手动翻转(useTime 防连按)
    if (wt.rod) {
      if (w.actuate(tx, ty)) {
        this.player.useTime = 15;
        this.sfx.play('tink');
      }
      return;
    }
    // 剪线钳:按优先级移除一件(致动器>黄>绿>蓝>红)
    if (wt.cutter) {
      const done =
        w.killActuator(tx, ty) ||
        w.killWire(tx, ty, TileStore.WIRE_YELLOW) ||
        w.killWire(tx, ty, TileStore.WIRE_GREEN) ||
        w.killWire(tx, ty, TileStore.WIRE_BLUE) ||
        w.killWire(tx, ty, TileStore.WIRE_RED);
      if (done) { this.player.useTime = 5; this.sfx.play('dig'); }
      return;
    }
    // 宏伟蓝图:按下记锚点,松开执行 L 形批量
    if (wt.grand) {
      if (!this.grandAnchor) { this.grandAnchor = [tx, ty]; return; }
      const a = this.grandAnchor;
      this.grandAnchor = null;
      const mode = this.wireToolMode;
      const wires = mode & TOOL_CUTTER ? 9999 : inv.countOf(ITEM_BY_KEY['wire'] ?? -1);
      const actuators = mode & TOOL_CUTTER ? 9999 : inv.countOf(ITEM_BY_KEY['actuator_item'] ?? -1);
      const res = w.massWireOperation(a, [tx, ty], mode, wires, actuators);
      if (!(mode & TOOL_CUTTER)) {
        if (res.wire > 0) inv.remove(ITEM_BY_KEY['wire'] ?? -1, res.wire);
        if (res.actuator > 0) inv.remove(ITEM_BY_KEY['actuator_item'] ?? -1, res.actuator);
      }
      this.player.useTime = 10;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
      return;
    }
    // 五彩扳手:单点,用当前模式
    const mode = itemDef.key === 'multicolor_wrench' ? this.wireToolMode : (wt.place ?? 0);
    if (mode & TOOL_CUTTER) {
      const done =
        (mode & TOOL_ACTUATOR ? w.killActuator(tx, ty) : false) ||
        (mode & TOOL_YELLOW ? w.killWire(tx, ty, TileStore.WIRE_YELLOW) : false) ||
        (mode & TOOL_GREEN ? w.killWire(tx, ty, TileStore.WIRE_GREEN) : false) ||
        (mode & TOOL_BLUE ? w.killWire(tx, ty, TileStore.WIRE_BLUE) : false) ||
        (mode & TOOL_RED ? w.killWire(tx, ty, TileStore.WIRE_RED) : false);
      if (done) { this.player.useTime = 5; this.sfx.play('dig'); }
      return;
    }
    // 扳手/致动器放置
    let needWire = 0, needActuator = 0;
    const colorBits: Array<[number, number]> = [
      [TOOL_RED, TileStore.WIRE_RED], [TOOL_GREEN, TileStore.WIRE_GREEN],
      [TOOL_BLUE, TileStore.WIRE_BLUE], [TOOL_YELLOW, TileStore.WIRE_YELLOW],
    ];
    for (const [m, bit] of colorBits) if (mode & m && !(st.wire[st.idx(tx, ty)] & bit)) needWire++;
    if (mode & TOOL_ACTUATOR && !(st.wire[st.idx(tx, ty)] & TileStore.WIRE_ACTUATOR)) needActuator++;
    const wireHave = inv.countOf(ITEM_BY_KEY['wire'] ?? -1);
    const actHave = inv.countOf(ITEM_BY_KEY['actuator_item'] ?? -1);
    if (needWire > wireHave || needActuator > actHave) {
      this.cb.onToast(needActuator > actHave ? Lang.text('Mods.SandboxWorld.Toast.NoActuator') : Lang.text('Mods.SandboxWorld.Toast.NoWire'));
      return;
    }
    let placed = false;
    for (const [m, bit] of colorBits) {
      if (mode & m && w.placeWire(tx, ty, bit)) placed = true;
    }
    if (mode & TOOL_ACTUATOR && w.placeActuator(tx, ty)) placed = true;
    if (placed) {
      if (needWire > 0) inv.remove(ITEM_BY_KEY['wire'] ?? -1, needWire);
      if (needActuator > 0) inv.remove(ITEM_BY_KEY['actuator_item'] ?? -1, needActuator);
      this.player.useTime = 5;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
    }
    void dy;
  }

  /**
   * 铺设背景墙（Player.PlaceThing_Walls，Player.cs:38937-39071 + WorldGen.PlaceWall :75189 1:1）：
   *  ①射程内 && useTime 冷却 ②邻接门：四邻至少一格有实心 tile 或已有墙（防悬空墙）
   *  ③目标格无墙，或走 TileReplacement 替换（PlaceThing_TryReplacingWalls :39157-39166 →
   *    WorldGen.ReplaceWall :62562：NearFriendlyWall 门 + 可破坏墙门，成功直接换墙收货）
   *  ④PlaceWall 成功 → 消耗 + useTime
   *  ⑤FillEmptySpace（:38973）：stack>1 时，四邻中"空墙且其四邻全是本墙"的格自动补铺
   *  （消耗逐格扣）——原版铺墙手感"一笔涂一片"的核心
   */
  private tryPlaceWall(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    if (!this.netCanEditTile()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // 射程（ItemReach，与 tryPlace 一致 5.5 格）
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (!this.inTileRange(tx, ty, (this.player.equipStats.tileRange ? 3 : 0) + (this.player.buffs.has(BuffType.Builder) ? 1 : 0))) return;
    if (this.player.useTime > 0) return;
    const wallId = itemDef.wallId!;
    const i0 = st.idx(tx, ty);
    if (st.wall[i0] === wallId) return;  // 已是同墙
    // 邻接门（cs:38943-38952）：四邻至少一格 active 或 wall>0
    const adj = (ax: number, ay: number) =>
      st.inBounds(ax, ay) && ((st.flags[st.idx(ax, ay)] && st.type[st.idx(ax, ay)] !== 0) || st.wall[st.idx(ax, ay)] > 0);
    if (!adj(tx + 1, ty) && !adj(tx - 1, ty) && !adj(tx, ty + 1) && !adj(tx, ty - 1)) return;
    // TileReplacement（Player.TileReplacementEnabled，cs:3225——builderAccStatus[10] 全程
    // 默认 0=恒开）：目标已有墙时先试替换（PlaceThing_TryReplacingWalls → ReplaceWall）。
    // 门 = NearFriendlyWall（WorldGen.cs:52290：自身或四邻墙为空/房墙）+ 墙可破坏
    // （KillWall_CheckFailure :60434：地牢墙需 downedBoss3 / 87 蜥蜴墙需 downedGolemBoss）
    // + 墙 ≠ 350。成功：旧墙尘 + 换墙 + 消耗（KillWall_DropItems 墙掉落表未移植——
    // 旧墙物品不掉，登记依赖）
    if (st.wall[i0] !== 0) {
      const oldWall = st.wall[i0];
      if (oldWall === 350) return;
      if (WALL_DUNGEON.has(oldWall) && !this.world.flags.downedSkeletron) return;
      if (oldWall === 87 && !this.world.flags['downed_245']) return;
      // NearFriendlyWall：自身/四邻任一格墙为空或房墙（WALL_HOUSE 表）
      const friendly = (ax: number, ay: number) =>
        !st.inBounds(ax, ay) || st.wall[st.idx(ax, ay)] === 0 || WALL_HOUSE.has(st.wall[st.idx(ax, ay)]);
      if (!(friendly(tx, ty) || friendly(tx - 1, ty) || friendly(tx + 1, ty)
        || friendly(tx, ty - 1) || friendly(tx, ty + 1))) return;
      st.setWall(tx, ty, wallId);
      this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 6, 1.5); // KillWall_MakeWallDust×10 近似
      this.sfx.play('chop', 1, tx * TILE + 8, ty * TILE + 8);               // KillWall_PlaySounds
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = Math.max(4, Math.round(15 * ((this.player.equipStats.wallSpeed || this.player.buffs.has(BuffType.Builder)) ? 0.75 : 1)));
      this.cb.onInventoryChanged();
      return;
    }
    // WorldGen.PlaceWall（:75189-75205）：仅 wall==0 可放；成功才继续
    st.setWall(tx, ty, wallId);
    this.sfx.play('dig', 1, tx * TILE + 8, ty * TILE + 8);
    this.player.inv.removeAt(this.player.inv.selected, 1);
    // wallSpeed=1（Player.cs:2336），铺墙节奏 ≈ 常规放置；便携水泥机族 WallSpeedAcc 冷却 -25%
    this.player.useTime = Math.max(4, Math.round(15 * ((this.player.equipStats.wallSpeed || this.player.buffs.has(BuffType.Builder)) ? 0.75 : 1)));
    this.cb.onInventoryChanged();
    // FillEmptySpace（cs:38973-39025）：stack>1 时补铺被本墙四面包围的空洞
    if (this.player.inv.heldItem()?.stack ?? 0 > 1) {
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = tx + ox, ny = ty + oy;
        if (!st.inBounds(nx, ny) || st.wall[st.idx(nx, ny)] !== 0) continue;
        let surround = 0;
        for (const [qx, qy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const qx2 = nx + qx, qy2 = ny + qy;
          if (st.inBounds(qx2, qy2) && st.wall[st.idx(qx2, qy2)] === wallId) surround++;
        }
        if (surround !== 4) continue;
        st.setWall(nx, ny, wallId);
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.cb.onInventoryChanged();
      }
    }
  }

  private tryPlace(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    if (!this.netCanEditTile()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // 距离
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (!this.inTileRange(tx, ty, (this.player.equipStats.tileRange ? 3 : 0) + (this.player.buffs.has(BuffType.Builder) ? 1 : 0))) return;
    const tileId = TILE_BY_KEY[itemDef.tile!];
    const def = TILE_DEFS[tileId];
    // 旧日军团竞技场建造封锁（Player.cs:25669-25672：DD2Event.Ongoing &&
    // ShouldBlockBuilding → 禁改方块，DD2Event.cs:794-796 包围盒判定）
    if (this.world.oldOnesArmy.ongoing
      && shouldBlockBuilding(this.world.oldOnesArmy, tx * TILE + 8, ty * TILE + 8)) {
      return;
    }
    // 传送晶塔放置门（TETeleportationPylon.PlacementPreviewHook_CheckIfCanPlace :158-166）：
    // 同型晶塔全图仅一座（HasPylonOfType TeleportPylonsSystem.cs:41-44）
    if (def?.vanilla?.sheet === 597) {
      this.refreshPylons();
      const style = itemDef.placeStyle ?? 0;
      if (hasPylonOfType(this.pylons, style)) return;
    }
    // 橡实: 只能种在草块正上方
    if (itemDef.key === 'acorn' && st.get(tx, ty + 1) !== T.GRASS) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.AcornGrassOnly'));
      return;
    }
    const ow = def.w ?? 1, oh = def.h ?? 1;
    // 绳索(RopeCoil 语义):从放置点向下延伸至实心/最多 10 格
    if (itemDef.key === 'rope') {
      const ropeTile = TILE_BY_KEY['v_213_rope']!;
      let placed = 0;
      for (let y = ty; y < ty + 10; y++) {
        if (!st.inBounds(tx, y) || st.isActive(tx, y)) break;
        st.setTile(tx, y, ropeTile, 0, 0);
        placed++;
      }
      if (placed > 0) {
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 14;
        this.sfx.play('place');
        this.cb.onInventoryChanged();
      }
      return;
    }
    // 火把锚定（TileObjectData tile4 + TileObject.CanPlace 1:1）：
    // 底锚(0)→左锚(22)→右锚(44)→墙锚(0)；普通火把液体中拒绝、水炬 8/11/17 允许
    if (tileId === T.TORCH) {
      if (this.player.useTime > 0) return;
      if (st.isActive(tx, ty)) return;
      const frame = torchAnchorFrame(st, tx, ty);
      // placeStyle（Item.cs placeStyle→TileObjectData subtile）：彩色 427-433 /
      // 群系火把显式表 / 水炬 8/11/17——此前恒 0 = 群系火把放成普通火把（色光全失）
      const style = torchStyleOfItemKey(itemDef.key);
      if (frame < 0) return;
      // 液体门（WaterPlacement）：普通火把 NotAllowed、水炬三色 Allowed
      if (st.liquid[st.idx(tx, ty)] > 0 && !isWaterTorchStyle(style * 22)) return;
      st.setTile(tx, ty, tileId, frame, style * 22);
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = 14;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
      return;
    }
    // 放置空间检查
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        if (!st.inBounds(px, py)) return;
        if (st.isActive(px, py)) return;
        // 实心物不能与玩家重叠
        if (def.solid && this.overlapsEntity(px, py)) return;
      }
    }
    // 支撑检查：非漂浮。原版权威 = TileObjectData.CanPlace（TileObjectData.cs 每_tile
    // 锚点表：AnchorTop/Bottom/Wall/AlternateTiles + 方向备选），全量锚点表未提取——
    // 此处以"下/上/侧邻任一格有内容或墙"近似（依赖登记：TileObjectData 锚点类型表）。
    // 矿车轨道（314）例外：无锚点可悬空铺设（TileObjectData 314 无 Anchor 项）
    const isTrack = def.vanilla?.sheet === TRACK_SHEET;
    const needSupport = !isTrack && (def.solid || def.platform || def.framed);
    if (needSupport && !this.hasSupport(tx, ty, ow, oh)) return;
    if (this.player.useTime > 0) return;

    // 矿车轨道（WorldGen.PlaceTile case 314 → Minecart.PlaceTrack + SquareTileFrame：
    // frameX/frameY 是连接 ID 非 18px 像素偏移，随后 FrameTrack 按邻接定型；
    // style = placeStyle：0 普通 / 1 压板(2492) / 2 左加速(2739)；声效 Item52）
    if (isTrack) {
      const style = Math.max(0, Math.min(3, itemDef.placeStyle ?? 0));
      placeTrack(st, tx, ty, style);
      frameTrackArea(st, tx, ty);
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = 14;
      this.playSfxFile('Item_52', 0.8, tx * TILE, ty * TILE);
      this.cb.onInventoryChanged();
      return;
    }

    // 放置
    const isVanillaStyle = !!def.vanilla && def.vanilla.frame === 'style';
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        // 原版多格家具：帧用 18px 步长偏移（与 .wld 原生一致，渲染端直用）。
        // 原版帧语义（TileObject.Place L74-102）：frameY 从【顶行 = 0】向下递增；
        // ty 是顶部行（放置时鼠标指向顶部锚点）→ dy2=0 即顶行，frameY = dy2*18 正确
        if (isVanillaStyle) {
          // placeStyle → 样式基偏移:权威布局表(FurnitureStyle.ts;竖排族写 Y,
          // 旧公式 style*fw*18 一刀切会把灯笼/蜡烛/吊灯等写成非法帧)
          const [bx2, by2] = furnitureStyleBase(def.vanilla?.sheet ?? -1, itemDef.placeStyle ?? 0, def.vanilla?.fw ?? 1);
          st.setTile(px, py, tileId, bx2 + dx2 * 18, by2 + dy2 * 18);
        } else {
          st.setTile(px, py, tileId, dx2, dy2);
        }
        // 水被方块挤出：水量转移到相邻可容纳的格子（上/左/右），
        // 而不是被方块吞掉消失。封闭无处可去时才消失
        const pi = st.idx(px, py);
        const liq = st.liquid[pi];
        if (liq > 0) {
          const ltype = st.liquidType[pi];
          st.setLiquid(px, py, 0, 0);
          let remaining = liq;
          for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0]] as const) {
            if (remaining <= 0) break;
            const nx = px + ox, ny = py + oy;
            if (!st.inBounds(nx, ny)) continue;
            const nd = TILE_DEFS[st.type[st.idx(nx, ny)]];
            if (nd && nd.solid) continue;
            const ni = st.idx(nx, ny);
            const cap = 255 - st.liquid[ni];
            if (cap <= 0) continue;
            const t = Math.min(remaining, cap);
            st.setLiquid(nx, ny, st.liquid[ni] + t, ltype || st.liquidType[ni] || 1);
            remaining -= t;
          }
        }
      }
    }
    if (tileId === T.CHEST) {
      this.world.chests.push({ x: tx, y: ty, items: Array(10).fill(null) });
    }
    // 挂物族放置登记（原版 TileLoader.PlaceTile → TE*.Hook_AfterPlacement：
    //  TEItemFrame.cs:15 / TEWeaponsRack.cs:40 / TEDisplayDoll.cs:123 / TEHatRack.cs:31 /
    //  TEFoodPlatter.cs:15 / TEDeadCellsDisplayJar.cs:15 → TileEntityType.Place）。
    //  记录在放置点(=锚点左上格)登记；空记录等价于无物，交互侧取用时也会按需补建
    if (FURNITURE_TILE_KIND.has(tileId)) {
      const fKind = FURNITURE_TILE_KIND.get(tileId)!;
      this.world.furnitureItems.push({
        x: tx, y: ty, kind: fKind,
        slots: new Array(furnitureSlotCount(fKind)).fill(null),
      });
    }
    // 陷阱(137)朝向 = 放置时玩家面朝方向（Player.cs:40209 PlaceThing_Tiles_PlaceIt_SpinTraps：
    // direction==1 → frameX += 18）。全样式通用（frameY=种类，frameX=方向）；放置后不可再调向
    if (def.vanilla?.sheet === 137 && this.player.facing === 1) {
      const ti = st.idx(tx, ty);
      st.setTile(tx, ty, tileId, st.frameX[ti] + 18, st.frameY[ti]);
    }
    // 椅子(15)朝向同款（Player.cs:40193 PlaceThing_Tiles_PlaceIt_SpinChairs）：
    // direction==1 → 上下两格 frameX 各 += 18（1×2 两行都要）
    if (def.vanilla?.sheet === 15 && this.player.facing === 1) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const py = ty + dy2;
        if (!st.inBounds(tx, py)) continue;
        const ti = st.idx(tx, py);
        st.setTile(tx, py, tileId, st.frameX[ti] + 18, st.frameY[ti]);
      }
    }
    // 浴缸(90)朝向（TileObjectData Direction=PlaceLeft/Right 备选锚点 + 素材双方向带实证：
    // Tiles_90 每样式带 144px 宽 = 方向1 0-71 / 方向2 72-143，GetTileDrawData addFrX+=144*band；
    // 原版 wld frameX 同时存在 0-54 与 72-126 两组）：direction==1 → 全部格子 frameX += 72
    if (def.vanilla?.sheet === 90 && this.player.facing === 1) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        for (let dx3 = 0; dx3 < ow; dx3++) {
          const px2 = tx + dx3, py2 = ty + dy2;
          if (!st.inBounds(px2, py2)) continue;
          const ti = st.idx(px2, py2);
          st.setTile(px2, py2, tileId, st.frameX[ti] + 72, st.frameY[ti]);
        }
      }
    }
    // 马桶(497)朝向（TileObjectData :4189 StyleHorizontal+WrapLimit2+Direction=PlaceLeft：
    // 方向占一个样式列——变体步长 36、方向 +18；素材 72px=2变体×2方向 吻合）：
    // 重写帧 = placeStyle*36(变体带) + (facing==1?18:0) + 列内偏移
    if (def.vanilla?.sheet === 497) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        for (let dx3 = 0; dx3 < ow; dx3++) {
          const px2 = tx + dx3, py2 = ty + dy2;
          if (!st.inBounds(px2, py2)) continue;
          st.setTile(px2, py2, tileId,
            (itemDef.placeStyle ?? 0) * 36 + (this.player.facing === 1 ? 18 : 0) + dx3 * 18,
            dy2 * 18);
        }
      }
    }
    // 训练假人放置：锚点生成假人 NPC（TETrainingDummy.Activate）
    if (tileId === TILE_BY_KEY['v_378_target_dummy']) this.spawnDummyAt(tx, ty);
    this.player.inv.removeAt(this.player.inv.selected, 1);
    this.player.useTime = 14;
    this.sfx.play('place');
    this.cb.onInventoryChanged();
  }

  private overlapsEntity(px: number, py: number): boolean {
    const rx = px * TILE, ry = py * TILE;
    if (this.player.x < rx + TILE && this.player.x + this.player.w > rx && this.player.y < ry + TILE && this.player.y + this.player.h > ry) return true;
    for (const e of this.entities.enemies) {
      if (e.x < rx + TILE && e.x + e.w > rx && e.y < ry + TILE && e.y + e.h > ry) return true;
    }
    return false;
  }

  private hasSupport(x: number, y: number, w: number, h: number): boolean {
    const st = this.world.store;
    // 下方
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y + h) || st.isSolid(x + dx, y + h) || st.wall[st.idx(x + dx, y + h)] !== 0) return true;
    }
    // 上方（火把等贴墙物）
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y - 1)) return true;
    }
    // 侧邻
    for (let dy = 0; dy < h; dy++) {
      if (st.isActive(x - 1, y + dy) || st.isActive(x + w, y + dy)) return true;
    }
    return false;
  }

  /**
   * 挂物族右键交互（Player.cs:32093-32121 → TE*.OnPlayerInteraction 1:1）：
   *  手持可放且未收藏 → 放入（单槽族 TryPlacing :83-100：占位物先弹出为掉落，
   *   再写入新物 stack=1，手持 -1；模特/帽架 TryFitting :680-725/:337-369：
   *   多叠放 1 克隆/单叠整槽交换，回写手持格）；
   *  否则 → 取出（单槽族 = OnPlayerInteraction else 分支 :134-151 →
   *   KillTile(fail:true) → KillTile_DropItems :63703 提前 return：存放物弹为
   *   世界掉落、方块保留；模特/帽架原版此时打开槽位 UI（BasicOpenCloseInteraction
   *   TileEntity.cs:250-285），本作无该 UI，最小等价 = 按原版槽位序取首个非空，
   *   空手优先回手持格（保留词缀），否则入包、装不下掉落）
   */
  private useFurnitureInteraction(tx: number, ty: number, kind: FurnitureKind) {
    const st = this.world.store;
    const [ax, ay] = furnitureAnchor(st, kind, tx, ty);
    const list = this.world.furnitureItems;
    const held = this.player.inv.heldItem();
    const vid = held ? slotVanillaId(held.id) : -1;
    if (held && vid > 0 && !held.favorited && fitsFurniture(kind, vid)) {
      if (kind === 'display_doll') {
        const r = dollPlace(list, ax, ay, held, vid);
        if (r) {
          if (r.swappedOut) {
            // 整槽交换（Utils.Swap）：换出物回手持格，取消收藏（TEDisplayDoll.cs:707）
            this.player.inv.slots[this.player.inv.selected] = { ...r.swappedOut, favorited: false };
          } else if (held.stack <= 0) {
            this.player.inv.slots[this.player.inv.selected] = null;
          }
          this.sfx.play('pickup'); // SoundID 7（TryFitting :698）
          this.cb.onInventoryChanged();
        }
      } else if (kind === 'hat_rack') {
        const r = hatRackPlace(list, ax, ay, held, vid);
        if (r) {
          if (r.swappedOut) this.player.inv.slots[this.player.inv.selected] = { ...r.swappedOut, favorited: false };
          else if (held.stack <= 0) this.player.inv.slots[this.player.inv.selected] = null;
          this.sfx.play('pickup'); // SoundID 7（TEHatRack.cs:351）
          this.cb.onInventoryChanged();
        }
      } else {
        const r = furniturePlaceSingle(list, kind, ax, ay, held, vid);
        if (r.ok) {
          // 占位旧物先弹出（TryPlacing :91-93 result.DropItem → 世界掉落）
          if (r.replaced) {
            this.spawnDrop(ax * TILE + 8, ay * TILE, ITEM_DEFS[r.replaced.id].key, r.replaced.stack, 0, -2);
          }
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        }
      }
      this.input.rightDown = false;
      return;
    }
    // 取出
    if (kind === 'display_doll' || kind === 'hat_rack') {
      const taken = furnitureTakeFirst(list, kind, ax, ay);
      if (taken) {
        const sel = this.player.inv.selected;
        if (!this.player.inv.slots[sel]) {
          this.player.inv.slots[sel] = { id: taken.item.id, stack: taken.item.stack, prefix: taken.item.prefix };
        } else {
          const left = this.player.inv.add(taken.item.id, taken.item.stack);
          if (left > 0) this.spawnDrop(ax * TILE + 8, ay * TILE, ITEM_DEFS[taken.item.id].key, left, 0, -2);
        }
        this.cb.onInventoryChanged();
      }
    } else {
      const popped = furniturePopSingle(list, kind, ax, ay);
      if (popped) {
        this.spawnDrop(ax * TILE + 8, ay * TILE, ITEM_DEFS[popped.id].key, popped.stack, 0, -2);
      }
    }
    this.input.rightDown = false;
  }

  private interactAt(tx: number, ty: number) {
    const st = this.world.store;
    // 距离门（原版 Player.IsInTileInteractionRange Simple：约 5 格）——此前整个
    // interactAt 无距离检查，隔全图右键可开储物/设床重生点
    {
      const dx = tx - Math.floor(this.player.cx / TILE);
      const dy = ty - Math.floor(this.player.cy / TILE);
      if (!this.inTileRange(tx, ty, (this.player.equipStats.tileRange ? 3 : 0) + (this.player.buffs.has(BuffType.Builder) ? 1 : 0))) { this.input.rightDown = false; return; }
    }
    const type = st.get(tx, ty);
    // 原版 tile sheet（八音盒/喷泉/天塔柱/派对柱右键分支用）
    const sh = this.wiring?.sheetOf(tx, ty) ?? -1;
    // 联机保护门禁（v3 房间制）：以下右键操作会改方块/世界状态——非房主在保护房拒绝。
    // 玩家储物族/读碑文/设床不受限（前者是玩家自有物品，后两者不改方块）。
    const editDenied = !this.netCanEditTile() && (
      type === T.DOOR_CLOSED || type === T.DOOR_OPEN || type === TILE_BY_KEY['v_83_herbs_mature']
      || type === TILE_BY_KEY['v_84_herbs_bloom'] || type === TILE_BY_KEY['crystal_heart']
      || type === TILE_BY_KEY['v_132_lever'] || type === TILE_BY_KEY['v_136_switch'] || type === TILE_BY_KEY['v_144_timers']
      || FURNITURE_TILE_KIND.has(type) // 挂物族右键会改存放物（世界状态）
      || sh === 35 || sh === 139 || sh === 207 || sh === 410 || sh === 480 || sh === 509 || sh === 455
      || sh === 425
    );
    if (editDenied) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    // ---- 挂物族（物品框 395/武器架 471/模特 470/帽架 475/食物盘 520/展示罐 698；
    //  Player.cs:32093-32121 右键分支 → TE*.OnPlayerInteraction，全量语义在
    //  world/FurnitureItems.ts）----
    if (FURNITURE_TILE_KIND.has(type)) {
      this.useFurnitureInteraction(tx, ty, FURNITURE_TILE_KIND.get(type)!);
      return;
    }
    // ---- 提取机（tile 219 普通版 / 642 叶绿版；Player.cs:41008-41049
    //  PlaceThing_ItemInExtractinator 1:1，全量转化表见 world/Extractinator.ts）----
    if (type === (TILE_BY_KEY['v_219_extractinator'] ?? -1)
      || type === (TILE_BY_KEY['v_642_chlorophyte_extractinator'] ?? -1)) {
      this.useExtractinator(tx, ty, false);
      this.input.rightDown = false;
      return;
    }
    // ---- 玩家储物族（原版 Player.cs:32598+）：29→bank / 97→bank2 / 463→bank3 / 491→bank4。
    //  内容随玩家存档（banks[0..3]），不随方块；复用宝箱面板（x 用 -2..-5 标识容器来源，
    //  与原版 player.chest = -2..-5 同约定）----
    for (const [key, bi] of BANK_TILES) {
      if (type === (TILE_BY_KEY[key] ?? -1)) {
        this.openChest?.({ x: -2 - bi, y: 0, items: this.player.banks[bi] });
        this.sfx.play('tink');
        this.input.rightDown = false;
        return;
      }
    }
    if (type === T.DOOR_CLOSED) {
      this.toggleDoor(tx, ty, true);
    } else if (type === T.DOOR_OPEN) {
      this.toggleDoor(tx, ty, false);
    } else if (type === T.CHEST || this.wiring?.sheetOf(tx, ty) === 441 || this.wiring?.sheetOf(tx, ty) === 468) {
      // 陷阱箱 441/468 也走开箱流程(tryOpenChest 内触发电路+射镖)
      // 打开宝箱：精确命中或 3×3 容差（点击宝箱边缘也算）
      const chest = this.findChest(tx, ty) ?? this.findChestNear(tx, ty);
      if (chest) this.tryOpenChest(chest);
      else if (this.net) {
        // 联机：本地无箱数据（msg7 不传 chests，权威在服务器）→ msg31 请求，
        // onChestSync 回包后登记 world.chests 并自动开面板
        this.netPendingChest = { x: tx, y: ty };
        this.net.requestChestOpen(tx, ty);
        this.input.rightDown = false;
      }
    } else if (sh === 425) {
      // 广播盒右键（Player.cs:32231-32250 tileSign 分支 → OpenSign）：按帧回算
      // 2×2 锚点（:32240-32245 frameX/18、frameY/18），Sign.ReadSign(anchor,
      // CreateIfMissing:true) 懒建空牌项 → 文本编辑面板（保存走 setSignText）
      const iBox = st.idx(tx, ty);
      this.openSignEditor(tx - Math.floor(st.frameX[iBox] / 18), ty - Math.floor(st.frameY[iBox] / 18));
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['tombstone_v']) {
      // 墓碑：读碑文（原版 Sign 阅读；碑文在 2×2 锚点登记，点任意一格都能读到）
      const sign = this.world.signs.find((s) =>
        tx >= s.x && tx <= s.x + 1 && ty >= s.y && ty <= s.y + 1);
      if (sign) this.cb.onReadSign?.(sign.text);
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['crystal_heart']) {
      // 生命水晶(放置态):右键使用(Player.cs ItemCheck_UseLifeCrystal L29358)
      // statLifeMax<400 → +20 上限并回满该部分,放置物消耗
      this.usePlacedLifeCrystal(tx, ty);
    } else if (type === TILE_BY_KEY['bed']) {
      // 床:设重生点(vanilla Player.FindBed 语义;敌怪环绕检查略)
      this.world.spawnX = tx + 1;
      this.world.spawnY = ty - 1;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.SpawnSet'));
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_125_crystal_ball'] || type === TILE_BY_KEY['v_354_bewitching_table']
      || type === TILE_BY_KEY['v_377_sharpening_station'] || type === TILE_BY_KEY['v_287_ammo_box']
      || type === TILE_BY_KEY['v_464_war_table'] || type === TILE_BY_KEY['v_621_slice_of_cake']) {
      // 工位 buff（Player.cs:32126-32162 右键授予）：水晶球 29(1800s)/附魔台 150/磨刀石 159/
      // 弹药箱 93/战争桌 348 均 108000t=1800s；蛋糕 192=7200t=120s
      const dur = type === TILE_BY_KEY['v_621_slice_of_cake'] ? 120 : 1800;
      const bt = type === TILE_BY_KEY['v_125_crystal_ball'] ? BuffType.Clairvoyance
        : type === TILE_BY_KEY['v_354_bewitching_table'] ? BuffType.Bewitched
          : type === TILE_BY_KEY['v_377_sharpening_station'] ? BuffType.Sharpened
            : type === TILE_BY_KEY['v_287_ammo_box'] ? BuffType.AmmoBox
              : type === TILE_BY_KEY['v_464_war_table'] ? BuffType.WarTable : BuffType.SugarRush;
      this.player.buffs.apply(bt, dur);
      this.sfx.play('drink'); // 原版 SoundID.Item4（药水/授予类 UseSound 占位）
      this.cb.onInventoryChanged();
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_132_lever'] || type === TILE_BY_KEY['v_136_switch'] || type === TILE_BY_KEY['v_144_timers']
      || type === TILE_BY_KEY['v_411_detonator']) {
      // 拉杆/开关/计时器：HitSwitch（Wiring.cs:163-252 1:1）——帧翻转 + tripWire
      // 四色信号 BFS（hitWire :693-827，沿导线网络传播），沿线全部器件真实触发；
      // 非"直线可见"近似（旧注释已过期，电路系统全量移植后语义为导线连通）
      // 起爆器 411：原版为"对准使用任意物品"触发（Player.cs:31865）+ 坠落触发（:34368，
      // 已接 Game.fixedUpdate landImpactVy）——本作并入右键交互
      this.toggleSwitch(tx, ty, type);
    } else if (type === TILE_BY_KEY['v_83_herbs_mature'] || type === TILE_BY_KEY['v_84_herbs_bloom']) {
      // 药草收获:成熟/开花态右键 → 掉种子(style = frameX/18,WorldGen.cs:38731)
      const i = st.idx(tx, ty);
      const style = Math.floor(st.frameX[i] / 18);
      st.setTile(tx, ty, 0);
      const seedKeys = ['vi_307_daybloom_seeds', 'vi_308_moonglow_seeds', 'vi_309_blinkroot_seeds',
        'vi_311_waterleaf_seeds', 'vi_310_deathweed_seeds', 'vi_312_fireblossom_seeds', 'vi_2357_shiverthorn_seeds'];
      const sk = seedKeys[style] ?? seedKeys[0];
      this.spawnDrop(tx * 16 + 8, ty * 16, sk, 1);
      this.input.rightDown = false;
    } else if (sh === 35 || sh === 139) {
      // 八音盒/南瓜灯右键（Player.cs:31759-31764）：SoundID 28 + SwitchMB（与电路共用）
      this.sfxAt('mech', tx * 16 + 8, ty * 16 + 8);
      this.wiring && switchMB(this.wiring, tx, ty);
      this.input.rightDown = false;
    } else if (sh === 207) {
      // 喷泉右键（Player.cs:31796-31800）
      this.sfxAt('mech', tx * 16 + 8, ty * 16 + 8);
      this.wiring && switchFountain(this.wiring, tx, ty);
      this.input.rightDown = false;
    } else if (sh === 410 || sh === 480 || sh === 509 || sh === 657 || sh === 658 || sh === 720 || sh === 721 || sh === 725 || sh === 733) {
      // 天塔柱族右键（Player.cs:31801-31808）
      this.sfxAt('mech', tx * 16 + 8, ty * 16 + 8);
      this.wiring && switchMonolith(this.wiring, tx, ty);
      this.input.rightDown = false;
    } else if (sh === 455) {
      // 派对纪念碑右键（Player.cs:31809-31814 → ToggleManualParty）
      this.sfxAt('mech', tx * 16 + 8, ty * 16 + 8);
      toggleManualParty(this.partyState);
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_237_lihzahrd_altar']) {
      // 蜥蜴祭坛 237（Player.cs:32303-32335）：消耗蜥蜴能量电池召石巨人
      this.useLihzahrdAltar(tx, ty);
    } else if (type === TILE_BY_KEY['v_466_elder_cystal_stand']) {
      // 永恒水晶座 466（Player.cs:31930-31977）：永恒水晶 → 旧日军团
      this.useEterniaStand(tx, ty);
    } else if (type === TILE_BY_KEY['v_597_pylons']) {
      // 传送晶塔 597（Player.cs:31707-31747）：开全屏地图选其它晶塔传送
      this.usePylon(tx, ty);
    }
  }

  /**
   * 提取机对准使用（Player.cs:41008-41049 PlaceThing_ItemInExtractinator 1:1）。
   * 优先级：642 叶绿版先查矿物兑换表（ItemTrader.ChlorophyteExtractinator，
   * Player.cs:41024-41033 / ItemTrader.cs:82-108），命中则 1:1 兑换（SkipItemConsumption
   * 语义——本方法自扣 stack）；否则按 ExtractinatorMode（ItemID.cs:1104）走转化表
   * （:41034-41044 → ExtractinatorHelper.RollExtractinatorDrop，全表在
   * world/Extractinator.ts）。原版消耗走通用 consumable 扣减（Player.cs:42602），此处等价
   * 为手持格扣 1。642 使用间隔 ×0.33（:41018-41020）。
   * @param viaUse true = 左键使用链（updateUse，受 useTime 冷却）；false = 右键交互
   * @returns 是否成功转化/兑换（false 时调用方应回落到普通放置/使用）
   */
  private useExtractinator(tx: number, ty: number, viaUse: boolean): boolean {
    const sheet = this.wiring?.sheetOf(tx, ty) ?? -1;
    if (sheet !== 219 && sheet !== 642) return false;
    const held = this.player.inv.heldItem();
    if (!held) {
      if (!viaUse) this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedExtractMaterial'));
      return false;
    }
    const vid = slotVanillaId(held.id);
    // 642 矿物兑换表优先（Player.cs:41024-41033：itemTrader.TryGetTradeOption）
    if (sheet === 642) {
      const give = CHLOROPHYTE_TRADES[vid];
      if (give !== undefined) {
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.cb.onInventoryChanged();
        this.dropFromExtractinator({ itemType: give, stack: 1 }, tx, ty);
        this.sfx.play('pickup'); // SoundID 7（:41025 Grab）
        if (viaUse) this.player.useTime = extractinatorUseTime(10, sheet);
        return true;
      }
    }
    const mode = extractinatorMode(vid);
    if (mode < 0) {
      // 手持不可提取物：use 链回落到放置/挥砍；interact 提示
      if (!viaUse) this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedExtractMaterial'));
      return false;
    }
    const drop = rollExtractinatorDrop(mode, sheet, mathRand(), this.world.flags.hardMode);
    this.player.inv.removeAt(this.player.inv.selected, 1);
    this.cb.onInventoryChanged();
    this.dropFromExtractinator(drop, tx, ty);
    this.sfx.play('pickup'); // SoundID 7（Player.cs:41040）
    if (viaUse) this.player.useTime = extractinatorUseTime(10, sheet);
    return true;
  }

  /** 转化产物掉落（Player.cs:41426-41436 DropItemFromExtractinator：鼠标世界坐标生成；
   *  此处落在提取机顶格上方，带向上初速便于拾取） */
  private dropFromExtractinator(drop: ExtractDrop, tx: number, ty: number): void {
    if (drop.itemType <= 0) return;
    const key = COIN_KEY_BY_VID[drop.itemType] ?? VANILLA_ITEM_KEY_BY_ID[drop.itemType];
    if (key && ITEM_BY_KEY[key] !== undefined) {
      this.spawnDrop(tx * TILE + 24, (ty - 1) * TILE, key, drop.stack, 0, -2);
    }
  }

  /**
   * 提取机通电消耗源（Wiring.cs:2572-2592）。箱子查找/箱内消耗为纯函数
   * （world/Extractinator.ts，对应 TryFindChestForExtractinator :2596-2622 与
   * :2575-2592）；此处补两条引擎侧门禁——箱子正被玩家打开（Chest.UsingChest，:2571）
   * 不转化，箱子格存的内部 id 经 slotVanillaId 转回原版 id。
   */
  private extractinatorPullImpl(ax: number, ay: number, blockType: number): ExtractDrop | null {
    const chest = findExtractinatorChest(this.world.chests, ax, ay);
    if (!chest) return null;
    if (this.openChestRef?.() === chest) return null;
    return extractinatorConsumeFromChest(
      chest, blockType, mathRand(), this.world.flags.hardMode, slotVanillaId);
  }

  /** 提取机通电产物掉落（Wiring.cs:2588 Item.NewItem 32×32 判定框中心） */
  private dropItemStackImpl(vanillaItemId: number, stack: number, px: number, py: number): void {
    const key = COIN_KEY_BY_VID[vanillaItemId] ?? VANILLA_ITEM_KEY_BY_ID[vanillaItemId];
    if (key && ITEM_BY_KEY[key] !== undefined) this.spawnDrop(px, py, key, stack, 0, -2);
  }

  /** 放置态生命水晶使用(Player.cs:29358:statLifeMax≥400 拒绝,+20 上限+回复,消耗) */
  private usePlacedLifeCrystal(tx: number, ty: number): void {
    const st = this.world.store;
    const def = TILE_DEFS[st.get(tx, ty)];
    if (this.player.baseMaxHp >= 400) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.LifeMaxReached'));
      this.input.rightDown = false;
      return;
    }
    this.player.baseMaxHp += 20;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
    this.addDamageNumber(this.player.cx, this.player.y, 20, false, '#40E080');
    // 消耗放置物(2×2)
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (st.get(tx + dx, ty + dy) === TILE_BY_KEY['crystal_heart']) st.setTile(tx + dx, ty + dy, 0);
      }
    }
    this.sfx.play('drink');
    this.input.rightDown = false;
    void def;
  }

  /** 开宝箱统一入口:锁定箱(原版 Chest.locked)需金钥匙,首次开启消耗 */
  private tryOpenChest(chest: { locked?: boolean }): void {
    // 物品保护（v3 房间制）：非房主禁开宝箱（v1 无箱子内容同步，取放全在本地——门禁开箱即拦截）
    if (!this.netCanChestInteract()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectItems')); return; }
    if (chest.locked) {
      const keyId = ITEM_BY_KEY['vi_327_golden_key'];
      let keySlot = -1;
      for (let i = 0; i < this.player.inv.slots.length; i++) {
        const sl = this.player.inv.slots[i];
        if (sl && sl.id === keyId && sl.stack > 0) { keySlot = i; break; }
      }
      if (keySlot < 0) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestLocked')); this.input.rightDown = false; return; }
      this.player.inv.removeAt(keySlot, 1);
      chest.locked = false;
      this.sfx.play('tink');
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestUnlocked'));
      this.cb.onInventoryChanged();
    }
    // 陷阱箱 441/468(Player.cs:21303 语义):开启即触发电路 + 向玩家八方射镖
    const cxy = chest as { x?: number; y?: number };
    const csh = cxy.x !== undefined && cxy.y !== undefined ? this.wiring?.sheetOf(cxy.x, cxy.y) ?? -1 : -1;
    if ((csh === 441 || csh === 468) && cxy.x !== undefined && cxy.y !== undefined) {
      this.wiring?.hitSwitch(cxy.x, cxy.y);
      const cxp = cxy.x * TILE + 16, cyp = cxy.y * TILE + 16;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        this.entities.add(new TrapShot(cxp, cyp, Math.cos(ang) * 6, Math.sin(ang) * 6, 20, 'dart'), 'projectiles');
      }
      this.sfx.play('tink');
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestTrapped'));
    }
    this.openChest?.(chest as never);
    this.input.rightDown = false;
  }

  /** 拉杆/开关/计时器:右键 → Wiring.HitSwitch(Wiring.cs:163-252) */
  /** 拉杆/开关/计时器/起爆器:右键 → Wiring.hitSwitch(Wiring.cs:163-252 1:1)。
   *  hitSwitch 内按 sheet 分派帧翻转（开关 136 frameY 0↔18 / 计时器 144 注册冷却 /
   *  拉杆 132 等），再 tripWire 沿四色导线 BFS 传播信号触发沿线器件 */
  private toggleSwitch(x: number, y: number, type: number): void {
    void type;
    this.wiring?.hitSwitch(x, y);
    this.sfx.play('tink');
    this.input.rightDown = false;
  }

  // ================= 蜥蜴祭坛 237 / 永恒水晶座 466 / 传送晶塔 597 =================

  /** 蜥蜴祭坛右键（Player.cs:32303-32335 1:1）：条件门 !AnyNPCs(245) && hardMode
   *  && downedPlantBoss → 顺序扫背包消耗蜥蜴能量电池 1293（:32309-32319）→
   *  SoundID 15 Roar（:32328）→ NPC.SpawnOnPlayer(245)。
   *  条件不满足时原版**静默**（无提示文本——flag8=false 直接无事发生）。 */
  private useLihzahrdAltar(tx: number, ty: number): void {
    void tx; void ty;
    const w = this.world;
    // 条件门（:32307；原版静默——本作按惯例给反馈，偏差已记录）
    if (this.hasNpcId(245)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
      this.input.rightDown = false;
      return;
    }
    if (!w.flags.hardMode) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedHardMode'));
      this.input.rightDown = false;
      return;
    }
    if (!w.flags['downed_262']) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedDownedPlant'));
      this.input.rightDown = false;
      return;
    }
    // 电池消耗（:32309-32319：inventory 顺序首个 type==1293 → stack-1 → 空则整格清空）
    if (!this.consumeVanillaItem(1293)) { this.input.rightDown = false; return; }
    this.sfx.playWav('roar');   // SoundID 15（:32328）
    this.spawnGolemFromAltar();
    this.input.rightDown = false;
  }

  /** 原版物品 id 的背包消耗（Player.ConsumeItem 语义的顺序扫描版：首格命中扣 1，
   *  空则清格——祭坛 1293 :32309-32319 / 水晶座 3828 :31968 同构） */
  private consumeVanillaItem(vid: number): boolean {
    const slots = this.player.inv.slots;
    for (let n = 0; n < slots.length; n++) {
      const it = slots[n];
      if (it && slotVanillaId(it.id) === vid) {
        it.stack--;
        if (it.stack <= 0) slots[n] = null;
        this.cb.onInventoryChanged?.();
        return true;
      }
    }
    return false;
  }

  /** 原版物品 id 的背包计数（HasItemInInventoryOrOpenVoidBag :31961 的背包段） */
  private countVanillaItem(vid: number): number {
    let n = 0;
    for (const it of this.player.inv.slots) {
      if (it && slotVanillaId(it.id) === vid) n += it.stack;
    }
    return n;
  }

  /** SpawnOnPlayer case 245（NPC.cs:81284-81330，落位计算在 world/BossSummonStations.ts）：
   *  NewNPC + 广播 Announcement.HasAwoken（:81325-81326；ChatColors.BossOrEvent）。 */
  private spawnGolemFromAltar(): void {
    const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar'];
    if (!ALTAR) return;
    const pcx = Math.floor(this.player.cx / TILE), pcy = Math.floor(this.player.cy / TILE);
    const spot = golemSpawnFromAltar(this.world.store, ALTAR, pcx, pcy);
    if (!spot) return;   // ±20 格内无祭坛（:81308-81311）——已扣电池同原版不返还
    const head = Enemy.fromVanilla(245, spot.x, spot.y);
    if (!head) return;
    head.id = this.entities.nextId++;
    this.entities.add(head, 'enemies');
    if (!this.boss) this.boss = head;   // 等价边界：单 Boss 槽（见报告）
    this.newText(Lang.text('Announcement.HasAwoken', Lang.npcName(245) ?? 'Golem'), 175, 75, 255);
  }

  /** 永恒水晶座右键（Player.cs:31930-31977 1:1）：
   *   num28 = 所点行 frameY 回推底行（0→+3 / 18→+2 / 36→+1 / 54→+0，:31938-31946）
   *   进行中 → RequestToSkipWaitTime（DD2Event.cs:1794-1810）
   *   否则门禁：!AnyNPCs(548) && 无南瓜/霜月 && 背包有 3828（HasItem）→
   *   竞技场检查（WouldFailSpawningHere——失败播 BartenderWarning 黄字）→
   *   ConsumeItem(3828) → SummonCrystal（StartInvasion + 水晶 548 + 起始魔力）。 */
  private useEterniaStand(tx: number, ty: number): void {
    const w = this.world;
    const st = w.store;
    const i = st.idx(tx, ty);
    const fy = st.frameY[i];
    // num28（:31938-31946，计算在 world/BossSummonStations.ts）
    const by = ty + eterniaStandBottomRow(fy);
    const oa = w.oldOnesArmy;
    if (oa.ongoing) {
      // RequestToSkipWaitTime（:31948-31950）：波间 >60t 且水晶在座 → 直接跳到 60t
      if (dd2RequestToSkipWaitTime(oa, this.dd2Host(), tx, ty)) {
        this.sfx.play('killed', 0.8, tx * TILE + 8, ty * TILE + 8);  // SoundID.NPCDeath7
      }
      this.input.rightDown = false;
      return;
    }
    // flag6 门禁链（:31954-31961）
    const gated = !this.hasNpcId(548) && w.moonEvent.kind === 0
      && this.countVanillaItem(3828) > 0;
    if (gated) {
      if (dd2WouldFailSpawningHere(this.dd2Host(), tx, by)) {
        // FailureMessage（DD2Event.cs:615-626，黄 255,255,0）
        this.newText(Lang.text('DungeonDefenders2.BartenderWarning'), 255, 255, 0);
        this.input.rightDown = false;
        return;
      }
      // ConsumeItem(3828)（:31968-31970）
      this.consumeVanillaItem(3828);
      dd2SummonCrystalDirect(oa, w, this.dd2Host(), tx, by, st.frameX[i], fy);
      // InvasionStart 广播（DD2Event.cs:285，ChatColors.World 50,255,130）
      this.newText(Lang.text('DungeonDefenders2.InvasionStart'), 50, 255, 130);
    }
    this.input.rightDown = false;
  }

  /** 传送晶塔右键（Player.cs:31707-31747 1:1）：开全屏地图 + MapPylonTile =
   *  点击格按帧回推的 3×4 锚点；视口对焦"本塔+全部晶塔"包围盒外扩 20 格
   *  （:31717-31740：中心 = 盒心，缩放只下钳 (屏-40)/盒宽高） */
  private usePylon(tx: number, ty: number): void {
    const anchor = pylonAnchorAt(this.world, tx, ty);
    if (!anchor) { this.input.rightDown = false; return; }
    this.refreshPylons();
    this.mapPylonTile = anchor;
    const fm = this.renderer.fullMap;
    const viewW = this.renderer.canvas.width, viewH = this.renderer.canvas.height;
    fm.open = true;                       // TryOpeningFullscreenMap（:31710）
    const focus = mapFocusRect(this.pylons, anchor, viewW, viewH);
    // 只下钳（:31733-31742）：scale = min(当前目标缩放, (屏-40)/盒宽高)
    const scale = Math.min(Math.max(fm.zoomTarget, 0.5), Math.max(focus.scale, 0.5));
    fm.zoom = scale;
    fm.zoomTarget = scale;
    fm.anchorU = focus.cx;
    fm.anchorV = focus.cy;
    fm.anchorMX = viewW / 2;
    fm.anchorMY = viewH / 2;
    fm.panX = (this.world.w * scale) / 2 - focus.cx * scale;
    fm.panY = (this.world.h * scale) / 2 - focus.cy * scale;
    this.renderer['_mapInit'] = false;
    this.renderer['_mapOpenClick'] = true;   // 打开地图的这次按压不算拖拽
    // 渲染层图标/连线数据（TeleportPylonsMapLayer.cs:52-75）
    this.renderer.pylons = this.pylons;
    this.renderer.mapPylonTile = anchor;
    this._mapClickLatch = true;
    this.input.rightDown = false;
  }

  /** 晶塔表刷新（放置/破坏晶塔与右键时调用） */
  refreshPylons(): void {
    this.pylons = scanPylons(this.world);
    this.renderer.pylons = this.pylons;
  }

  /** 晶塔整件破碎（TETeleportationPylon.Framing_CheckTile :77-125）：
   *  按帧回推 3×4 锚点 → 清整塔 → 掉对应样式的放置物品（GetPylonItemTypeFromTileStyle） */
  private breakPylon(x: number, y: number): void {
    const st = this.world.store;
    const anchor = pylonAnchorAt(this.world, x, y);
    if (!anchor) { st.setTile(x, y, 0); return; }
    const i0 = st.idx(x, y);
    const style = pylonStyleFromFrame(st.frameX[i0]);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 4; dy++) {
        if (st.inBounds(anchor.x + dx, anchor.y + dy)
          && st.get(anchor.x + dx, anchor.y + dy) === TILE_BY_KEY['v_597_pylons']) {
          st.setTile(anchor.x + dx, anchor.y + dy, 0);
        }
      }
    }
    this.chunks.markDirtyArea(anchor.x - 1, anchor.y - 1, anchor.x + 3, anchor.y + 4);
    const key = VANILLA_ITEM_KEY_BY_ID[pylonItemTypeFromStyle(style)];
    if (key) this.spawnDrop(anchor.x * TILE + 24, anchor.y * TILE, key, 1, 0, -2);
    this.sfx.play('place');
    this.refreshPylons();
  }

  /** 全屏地图上点晶塔图标 → HandleTeleportRequest 门禁（TeleportPylonsSystem.cs:100-205）。
   *  地图无论经晶塔右键还是小地图打开，图标层恒在（TeleportPylonsMapLayer 每帧绘制）；
   *  玩家不在任何晶塔 ±60 格内时门禁第 1 档自然拒绝。
   *  返回 true = 已消费本次点击（传送或失败文案），false = 未点中图标（回落普通选点） */
  private tryPylonMapTeleport(tx: number, ty: number): boolean {
    // 图标中心 = 锚点 + (1.5, 2)（TeleportPylonsMapLayer.cs:56/63 PositionInTiles+(1.5,2)）
    let hit: TeleportPylonInfo | null = null;
    for (const p of this.pylons) {
      if (Math.abs(tx - (p.x + 1.5)) <= 2 && Math.abs(ty - (p.y + 2)) <= 2) { hit = p; break; }
    }
    if (!hit) return false;
    // 当前塔：原版按"玩家可达范围内且过 NPC/群系门的塔"求（:155-192）——单人语义 =
    // 玩家 ±60 格内的塔（IsPlayerNearAPylon）
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    const current = this.pylons.find((p) => {
      const LX = ptx - 60, HX = ptx + 1 + 60, LY = pty - 60, HY = pty + 2 + 60;
      return p.x + 2 >= LX && p.x <= HX && p.y + 3 >= LY && p.y <= HY;
    }) ?? null;
    const npcs: NpcHomeLike[] = this.entities.npcs
      .filter((n): n is TownNPC => n instanceof TownNPC)
      .filter((n) => !n.dead && !n.bound && n.home)
      .map((n) => ({
        homeX: n.home!.x, homeY: n.home!.y,
        x: Math.floor(n.cx / TILE), y: Math.floor(n.cy / TILE),
      }));
    const check = checkPylonTeleport(this.world, {
      playerTileX: ptx, playerTileY: pty,
      target: hit,
      current,
      npcs,
      targetScene: scanScene(this.world, hit.x * TILE + 24, hit.y * TILE + 32, 0),
      currentScene: current
        ? scanScene(this.world, current.x * TILE + 24, current.y * TILE + 32, 0)
        : { ...EMPTY_SCENE },
      downedPlantBoss: !!this.world.flags['downed_262'],
    });
    if (!check.ok) {
      // ChatHelper.SendChatMessageToClient → ChatColors.ServerMessage 255,240,20（:203-205）
      this.newText(Lang.text(check.fail!), 255, 240, 20);
      return true;
    }
    // 传送（:194-200：落位 = 塔锚 ToWorldCoordinates()）+ SoundID 11（地图关闭音，
    // TeleportPylonsMapLayer.cs:119）——贴图预载+找位由 teleportWhenReady 统一处理
    this.sfx.playWav('menuClose');
    this.mapPylonTile = null;
    this.renderer.mapPylonTile = null;
    void this.teleportWhenReady(hit.x, hit.y);
    return true;
  }

  /** DD2Event 宿主回调（OldOnesArmy.ts 纯逻辑 ↔ Game 副作用桥） */
  private dd2Host(): OldOnesArmyHost {
    return {
      broadcast: (text, r, g, b) => this.newText(Lang.text(text), r, g, b),
      spawnNpc: (id, x, y) => {
        const e = Enemy.fromVanilla(id, x, y);
        if (!e) return;
        e.id = this.entities.nextId++;
        this.entities.add(e, 'enemies');
      },
      countNpcs: (id) => (this.entities.enemies as Enemy[]).reduce(
        (n, e) => n + (e.dead || e.vanillaId !== id ? 0 : 1), 0),
      anyNpc: (id) => this.hasNpcId(id),
      crystalPoints: () => (this.entities.enemies as Enemy[])
        .filter((e) => !e.dead && e.vanillaId === 548)
        .map((e) => ({ x: e.cx, y: e.y + e.h })),
      dropAtCrystal: (vanillaItemId, count) => {
        const key = VANILLA_ITEM_KEY_BY_ID[vanillaItemId];
        const crystal = (this.entities.enemies as Enemy[]).find((e) => !e.dead && e.vanillaId === 548);
        if (!key || !crystal) return;
        this.spawnDrop(crystal.cx, crystal.cy + 8, key, count, 0, -2);
      },
      arenaEnds: (x, y) => checkArenaScore(this, x * TILE + 8, y * TILE + 8),
      findGroundY: (tileX, tileY) => {
        const st = this.world.store;
        for (let y = tileY; y < Math.min(st.h, tileY + 50); y++) {
          if (st.inBounds(tileX, y) && st.isSolid(tileX, y)) return y;
        }
        return null;
      },
      rand: (n) => Math.floor(Math.random() * n),
    };
  }

  /** DD2_EVENT_HOOKS 接线（bossAI_dd2.ts 的占位正式落地——AI 家族批次的既定依赖） */
  private wireDD2Hooks(): void {
    if (this._dd2HooksWired) return;
    this._dd2HooksWired = true;
    DD2_EVENT_HOOKS.laneSpawnRate = () => this.world.oldOnesArmy.laneSpawnRate;
    DD2_EVENT_HOOKS.enemySpawningOnHold = () => this.world.oldOnesArmy.timeLeftUntilSpawningBegins !== 0;
    DD2_EVENT_HOOKS.spawnMonsterFromGate = (g, x, y, left) => {
      const st = this.world.oldOnesArmy;
      if (!st.ongoing) return;
      dd2SpawnMonsterFromGate(st, this.dd2Host(), x, y, left);
      void g;
    };
    DD2_EVENT_HOOKS.raiseGoblins = (_g, x, y) => dd2RaiseGoblins(this.world.oldOnesArmy, this.dd2Host(), x, y);
    DD2_EVENT_HOOKS.canRaiseGoblinsHere = (_g, x, y) => dd2CanRaiseGoblinsHere(this.world.oldOnesArmy, x, y);
    DD2_EVENT_HOOKS.stopInvasion = (_g, win) => {
      // StopInvasion（:294-320）+ WinInvasionInternal（:322-343；win 时 downed 旗标/
      // 奖牌/InvasionWin 广播在模块内完成，host 落副作用）
      dd2StopInvasion(this.world.oldOnesArmy, this.world, this.dd2Host(), win);
    };
    DD2_EVENT_HOOKS.reportLoss = () => dd2ReportLoss(this.world.oldOnesArmy);
    DD2_EVENT_HOOKS.findArenaHitbox = () => {
      const pts = (this.entities.enemies as Enemy[])
        .filter((e) => !e.dead && (e.vanillaId === 548 || e.vanillaId === 549))
        .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }));
      dd2FindArenaHitbox(this.world.oldOnesArmy, pts);
    };
    DD2_EVENT_HOOKS.difficulty = () => this.world.oldOnesArmy.ongoingDifficulty;
  }

  /** 压力板 135:踩上瞬间 HitSwitch(Collision.SwitchTiles 玩家语义;敌人触发见 Enemy 侧) */
  private checkPressurePlates(): void {
    // 原版 Collision.SwitchTiles(Player.cs:18439):扫玩家 AABB 覆盖的全部格,
    // 命中压板 135 边沿触发(踩上/离开各一次,plateLatch 按格去重)
    const p = this.player;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 1) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
    // 复用 Set(2026-08 审计 G9:此前每 tick new Set + [...spread],60Hz 恒定分配)
    const pressed = this._platePressed; pressed.clear();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.wiring?.sheetOf(tx, ty) === 135) {
          const key = tx + ',' + ty;
          pressed.add(key);
          if (!this.plateLatch.has(key)) this.wiring?.hitSwitch(tx, ty);
        }
      }
    }
    for (const key of pressed) this.plateLatch.add(key);
    // Set 迭代中删除当前元素是安全的——省去 [...spread] 复制
    for (const key of this.plateLatch) {
      if (!pressed.has(key)) this.plateLatch.delete(key);
    }
  }

  /** 测重板 428(原版 PressurePlateHelper 进/离双触发)+ 感应器 423(玩家上方/昼夜)。
   *  触发源由 scanTriggerTiles 登记,onTileChanged 增量维护 */
  private updateTriggerTiles(): void {
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const p = this.player;
    // 测重板:玩家 AABB 覆盖格(原版 PressurePlateHelper 16×10 底部判定)
    const standing = this._weightedStanding; standing.clear();
    const px0 = Math.floor(p.x / TILE), px1 = Math.floor((p.x + p.w - 1) / TILE);
    const py0 = Math.floor(p.y / TILE), py1 = Math.floor((p.y + p.h - 1) / TILE);
    for (const idx of this.triggerTiles428) {
      const x = idx % st.w, y = (idx / st.w) | 0;
      if (x >= px0 && x <= px1 && y >= py0 && y <= py1) standing.add(idx);
    }
    for (const idx of standing) {
      if (!this.weightedLatch.has(idx)) {
        this.weightedLatch.add(idx);
        w.blockPlayerTeleportationForOneIteration = true; // 原版 MoveInto(:135-142)
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
    // 镜像踩踏态到渲染模块(428 被踩帧偏移,VanillaTiler.plates428Pressed)
    plates428Pressed.clear();
    for (const idx of this.weightedLatch) plates428Pressed.add(idx);
    for (const idx of this.weightedLatch) {
      if (!standing.has(idx)) {
        this.weightedLatch.delete(idx);
        w.blockPlayerTeleportationForOneIteration = true; // 原版 MoveAwayFrom 双触发
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
    // 感应器 423:玩家上方(frameY 0=昼 36=夜 72=玩家出入上方,placeStyle 0-2 → frameY/18%3)
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor((p.y + p.h) / TILE);
    for (const idx of this.triggerTiles423) {
      const x = idx % st.w, y = (idx / st.w) | 0;
      const mode = Math.floor(st.frameY[idx] / 18) % 3;
      if (mode === 2 && x === ptx && pty > y && pty - y <= 8) {
        w.hitSwitch(x, y);
      }
      // 昼/夜感应由 onDayNight 回调驱动(见 triggerDayNightSensors)
    }
  }

  /** 昼/夜切换时触发全部对应感应器(原版逻辑在 Projectile.LogicSensor 驱动) */
  triggerDayNightSensors() {
    const w = this.wiring;
    if (!w) return;
    const st = this.world.store;
    const isDay = this.world.clock.isDay;
    for (const idx of this.triggerTiles423) {
      const mode = Math.floor(st.frameY[idx] / 18) % 3;
      // mode 0=昼感应器:日出触发;1=夜:日落触发
      if ((mode === 0 && isDay) || (mode === 1 && !isDay)) {
        w.hitSwitch(idx % st.w, (idx / st.w) | 0);
      }
    }
  }

  /** 实体踩板(Collision.SwitchTiles objType 2/3 语义):
   *  小动物族触发压板 135(NPC.cs:47613 白名单由 critters 桶近似);
   *  巨石弹幕(原版 type 99,Projectile.cs:11833)触发 135 与弹幕垫板 442 */
  private updateEntityPlates(): void {
    const w = this.wiring;
    if (!w) return;
    const pressed = this._entityPlatePressed; pressed.clear();
    const scan = (e: Entity, checkPad: boolean) => {
      const x0 = Math.floor(e.x / TILE), x1 = Math.floor((e.x + e.w - 1) / TILE);
      const y0 = Math.floor(e.y / TILE), y1 = Math.floor((e.y + e.h - 1) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const sh = w.sheetOf(tx, ty);
          if (sh === 135 || (checkPad && sh === 442)) {
            const key = e.id + '|' + tx + ',' + ty;
            pressed.add(key);
            if (!this.entityPlateLatch.has(key)) w.hitSwitch(tx, ty);
          }
        }
      }
    };
    for (const c of this.entities.critters) scan(c, false);
    for (const e of this.entities.projectiles) {
      // duck-typing 判巨石(勿用 instanceof:跨模块实例会判失败)
      if ((e as TrapShot).kind === 'boulder') scan(e, true);
    }
    for (const key of pressed) this.entityPlateLatch.add(key);
    for (const key of this.entityPlateLatch) {
      if (!pressed.has(key)) this.entityPlateLatch.delete(key);
    }
  }

  /** 天气 hooks（afterWorldLoad 构造；字段每帧在 updateWeather 刷新） */
  private weatherHooks: import('../render/WeatherRenderer').WeatherFxHooks | null = null;
  /** 史莱姆雨延迟公告倒计时（Main.slimeWarningTime/Delay=420，UpdateSlimeRainWarning :64984） */
  private slimeWarningTime = 0;
  /** 本次死亡掉落钱数（LocalPlayer.lostCoins；死亡 UI"掉了{0}"用） */
  lostCoins = 0;
  /** 重力切换边沿锁（buff 18：Up 按住只切一次） */
  private gravLatch = false;
  /** 狱火光环 tick 计数（buff 116，:9896 infernoCounter） */
  private infernoCounter = 0;

  /** 天气推进（原版 Main.UpdateWeather + updateCloudLayer + 雨调度/沙尘暴，60Hz）：
   *  atmo = 玩家深度线性近似（worldSurface 以上 1 / rockLevel 以下 0）；雷声按距离衰减；
   *  雨声层 gain = cloudAlpha×atmo；渲染 hooks（雪区比例/沙尘门）随 scene 刷新 */
  /** 墓园视觉强度（SceneState.UpdateGraveyard：lerp(16,36,count) 向目标 0.02/0.1 逼近——持久缓动） */
  private graveyardIntensity = 0;
  /** 自然 Boss 召唤运行时态（WorldGen.spawnEye/spawnHardBoss :4140/:4142——不入存档，
   *  clearWorld 重置=进世界清零；与血月 roll 互斥门 :64818） */
  private spawnEyePending = false;
  /** 高尔夫折扣计时（GolfState.golfScoreTime :30-47：每 tick+1，挥杆清零，
   *  进洞 SetScoreTime=3600；一杆进洞系数 = time/3600） */
  private golfScoreTime = 3600;
  /** 高尔夫瞄准态（AI_150 channel 语义：按住瞄准/松开击球/右键取消） */
  private golfAim = false;
  private golfAimBall: import('../entities/GolfBall').GolfBall | null = null;
  private spawnHardBossPending = 0;

  /** 天气预设（小地图天气面板按钮；面板见 Renderer.drawMinimap 天气段）：
   *  clear=停雨停沙尘停史莱姆 / cloudy=云量 120 / lightrain=0.15 / heavyrain=0.65 /
   *  storm=0.85+大风 / sandstorm=立即沙尘暴 / slimerain=立即史莱姆雨 / random=重掷 */
  applyWeatherPreset(name: string): void {
    const wd = this.world.weather;
    // 反馈走原版消息列（ChatColors.World）；全字面键——vite l10n-audit 插件静态覆盖
    const announce = (key: string) => this.newText(Lang.text(key), 50, 255, 130);
    switch (name) {
      case 'clear':
        wd.stopRain(true);
        wd.sandstorm.happening = false; wd.sandstorm.timeLeft = 0;
        wd.sandstorm.severity = 0; wd.sandstorm.intendedSeverity = 0;
        if (wd.slimeRain) wd.stopSlimeRain();
        announce('Mods.SandboxWorld.Weather.PresetClear');
        break;
      case 'cloudy':
        wd.stopRain(true);
        wd.numClouds = 120; wd.numCloudsTemp = 120;
        announce('Mods.SandboxWorld.Weather.PresetCloudy');
        break;
      case 'lightrain':
        wd.startRain(true, 0.15);
        announce('Mods.SandboxWorld.Weather.PresetLightRain');
        break;
      case 'heavyrain':
        wd.startRain(true, 0.65);
        announce('Mods.SandboxWorld.Weather.PresetHeavyRain');
        break;
      case 'storm':
        wd.startRain(true, 0.85);
        wd.windSpeedTarget = 0.6;
        announce('Mods.SandboxWorld.Weather.PresetStorm');
        break;
      case 'sandstorm':
        wd.sandstorm.happening = true;
        wd.sandstorm.timeLeft = 86400;
        wd.sandstorm.intendedSeverity = 0.8;
        wd.sandstorm.severity = Math.max(wd.sandstorm.severity, 0.5);
        announce('Mods.SandboxWorld.Weather.PresetSandstorm');
        break;
      case 'slimerain':
        wd.startSlimeRain();
        announce('Mods.SandboxWorld.Weather.PresetSlimeRain');
        break;
      case 'random':
        wd.weatherCounter = 1; // 云量周期立即落盘重掷
        if (wd.raining || Math.random() < 0.5) wd.stopRain();
        else wd.startRain();
        announce('Mods.SandboxWorld.Weather.PresetReroll');
        break;
    }
  }

  private updateWeather(): void {
    const w = this.world;
    const weather = w.weather;
    const pty = Math.floor(this.player.cy / TILE);
    const gl = w.groundLevel;
    const rl = Math.max(gl + 1, w.rockLevel);
    // atmo 精确公式（Main.cs:62622：(y/16-(65+10×(maxTilesX/4200)²))/(worldSurface/5)，y=视口中心）；
    // 旧版深度线性近似已废弃
    const cam = this.camera;
    const viewCY = cam ? cam.y : this.player.cy;
    const atmoBase = (viewCY / 16 - (65 + 10 * (w.w / 4200) ** 2)) / Math.max(1, gl / 5);
    const atmo = Math.max(0, Math.min(1, atmoBase));
    // 墓园强度逼近（SceneState.cs:415-418 MoveTowards 0.02/0.1）
    const gyTarget = Math.max(0, Math.min(1, (this.scene.graveyardTileCount - 16) / (36 - 16)));
    const gyStep = this.graveyardIntensity < gyTarget ? 0.02 : 0.1;
    this.graveyardIntensity += Math.max(-gyStep, Math.min(gyStep, gyTarget - this.graveyardIntensity));
    // 白天 tick 进度（原版 time 0-54000 ↔ 我们 timeOfDay 白天前半段 0.25-0.75 线性）
    const dayTimeTicks = w.clock.isDay ? ((w.clock.timeOfDay - 0.25) / 0.5) * 54000 : 0;
    weather.setWorldSize(w.w, w.h);
    weather.update({
      dayRate: w.journeyTimeScale(), // Main.cs:64320-64409 天气全链吃 dayRate（旅程倍率/冻结，曾写死 1）
      dayTime: w.clock.isDay,
      dayTimeTicks,
      playerStrongEnough: this.player.maxHp >= 120,
      playerReadyForKingSlime: this.player.maxHp > 140 && this.player.defense > 8, // Main.cs:64645
      expertMode: w.isExpert,   // Main.expertMode（Main.cs:2775）：史莱姆雨自然触发门（:64373-64409 就绪||专家）
      atmo,
      aboveRockLayer: pty < rl,
      graveyardIntensity: this.graveyardIntensity,
      hardMode: !!w.flags.hardMode,
      noOtherEvent: !w.clock.bloodMoon && this.world.invasionType === 0,
      downedSlimeKing: !!(w.flags.downedSlimeKing ?? w.flags.downed_50),  // 击败键=downed_50(50=史莱姆王)
      maxTilesX: w.w,
      worldSurface: gl,
      viewCenterY: viewCY,
      // Main.BackgroundEnabled（Main.cs:790）：设置项「背景 开/关」（Options.backgrounds，
      // 默认 true）——cloudBGAlpha 阴天渐变门（Main.cs:58783）
      backgroundEnabled: options.data.backgrounds,
      // 灯笼夜天气压制（Main.cs:64288 云钳 30 / :64331 停雨 / :64353 不开新雨 /
      // :58249 风场停掷）
      lanternsUp: LanternNight.lanternsUp,
      nextNightIsLanternNight: LanternNight.nextNightIsLanternNight,
      onCoinRain: (x, y, type, stack) => {
        // 非实心 32×32 门（WorldGen.cs:71847）
        const st = w.store;
        const tx0 = Math.floor(x / 16), ty0 = Math.floor(y / 16);
        let solid = false;
        for (let dx = 0; dx <= 1 && !solid; dx++) for (let dy = 0; dy <= 1; dy++) {
          if (st.inBounds(tx0 + dx, ty0 + dy) && st.isSolid(tx0 + dx, ty0 + dy)) { solid = true; break; }
        }
        if (solid) return;
        const key = type === 71 ? 'coin_silver' : type === 72 ? 'coin_gold' : 'coin_platinum';
        this.spawnDrop(x, y, key, stack, 0, 3);
      },
      onThunder: (distPx) => {
        // 原版 SoundID 43：thunderDistance×15px 处发声——按距离衰减近似
        const vol = Math.max(0.15, 1 - distPx / 2400);
        this.sfx.play('thunder', vol);
      },
      onSandstormToggle: (happening) => {
        // 原版沙尘暴无公告——保留提示但走原版消息列（ChatColors.World）
        this.newText(Lang.text(happening ? 'Mods.SandboxWorld.Weather.SandstormOn' : 'Mods.SandboxWorld.Weather.SandstormOff'), 50, 255, 130);
      },
      onSlimeRainToggle: () => {
        // 原版 UpdateSlimeRainWarning（Main.cs:64984）：切换后 420t 延迟公告
        // Lang.gen[74]（开始）/gen[75]（停止），色 ChatColors.World
        this.slimeWarningTime = 420;
      },
    });
    // 史莱姆雨延迟公告倒计时（UpdateSlimeRainWarning :64988-64996 1:1）
    if (this.slimeWarningTime > 0 && --this.slimeWarningTime === 0) {
      this.newText(Lang.gen(weather.slimeRainTime > 0 ? 74 : 75), 50, 255, 130);
    }
    // 狱火药水（buff 116，Player.cs:9896-9938）：200px 光环烧敌——每 60t 对范围内敌
    // 直伤 20（不绕 iframes）；视觉光效由粒子近似
    if (this.player.buffs.has(BuffType.Inferno)) {
      this.infernoCounter++;
      const hitTick = this.infernoCounter % 60 === 0;
      if (hitTick) this.spawnParticles(this.player.cx, this.player.cy, '#FF8C2A', 4, 1.8, { life: 24, grav: -0.08 });
      for (const eent of this.entities.enemies) {
        const en = eent as Enemy;
        if (en.dead) continue;
        if (Math.hypot(en.cx - this.player.cx, en.cy - this.player.cy) > 200) continue;
        en.cursedT = Math.max(en.cursedT, 2); // AddBuff(323,120) 灼烧 2s
        if (hitTick) en.hurt(Math.max(1, Math.round(20 * this.player.damageMult('melee'))), 0, 0, this);
      }
    }
    // 金币雨公告（StartRain 1/25；原版 ChatHelper Lang.gen[93]→消息列）
    if (weather.coinRainPending) {
      weather.coinRainPending = false;
      this.newText(Lang.gen(93), 50, 255, 130);
    }
    // 雨声层（程序化棕噪近似 XACT 循环层）
    this.sfx.setRain(weather.cloudAlpha * atmo);
    weather.graveyardVisual = this.graveyardIntensity; // 渲染端 ProcessCloudAlpha 基准
    // 渲染 hooks 刷新（SceneMetrics 扫描窗计数直供，旧 zone 级近似已废弃）
    const hooks = this.weatherHooks;
    if (hooks) {
      hooks.atmo = atmo;
      hooks.bossDanger = !!this.boss;
      // 雪区削减（Rain.cs NewRain :182-184）：clamp(SnowTileCount/SnowTileThreshold=1500,0,1)，
      // 平方在渲染端（spawnRain 的 snow = snowRatio²）
      hooks.snowRatio = Math.max(0, Math.min(1, this.scene.snowTileCount / 1500));
      hooks.sandstormVisuals = weather.sandstorm.happening && this.scene.zoneDesert && pty < gl + 30;
      // 沙尘发射门（Sandstorm.EmitDust :147：<100 直接不发射；密度 2000/count 也按真值）
      hooks.desertSandTiles = this.scene.desertSandTileCount;
    }
  }

  /** 全图扫描测重板/感应器登记(读档/生成后一次);增量维护见 worldReadyListener */
  private scanTriggerTiles(): void {
    const st = this.world.store;
    this.triggerTiles428.clear();
    this.triggerTiles423.clear();
    const s428 = TILE_BY_KEY['v_428_weightedpressureplate'] ?? 0;
    const s423 = TILE_BY_KEY['v_423_logicsensor'] ?? 0;
    const s443 = TILE_BY_KEY['v_443_geyser'] ?? 0;
    for (let i = 0; i < st.type.length; i++) {
      if (s428 && st.type[i] === s428) this.triggerTiles428.add(i);
      else if (s423 && st.type[i] === s423) this.triggerTiles423.add(i);
      else if (s443 && st.type[i] === s443) this.geyserTiles.add(i);
    }
    st.onTileChanged((x, y) => {
      const i = st.idx(x, y);
      const t = st.type[i];
      if (t === s428) this.triggerTiles428.add(i);
      else this.triggerTiles428.delete(i);
      if (t === s423) this.triggerTiles423.add(i);
      else this.triggerTiles423.delete(i);
    });
  }

  /** 位置感知音效(原版 SoundEngine.PlaySound(type,x,y) 语义):
   *  超过视野 1.5 倍即静音,范围内线性衰减——世界远处的机关不再全图可闻 */
  private sfxAt(name: SfxName, x: number, y: number): void {
    const R = Math.max(this.camera?.viewW ?? 1280, this.camera?.viewH ?? 800) * 1.5;
    const d = Math.hypot(x - this.player.cx, y - this.player.cy);
    if (d > R) return;
    this.sfx.play(name, Math.max(0, 1 - d / R));
  }

  /** DeviceCtx:器件表与引擎侧能力对接(devices.ts) */
  private makeDeviceCtx() {
    return {
      worldSurface: this.world.groundLevel,
      dropItem: (vanillaItemId: number, px: number, py: number) => {
        const key = VANILLA_ITEM_KEY_BY_ID[vanillaItemId];
        if (!key) return;
        const d = this.spawnDrop(px, py, key, 1);
        // 心/星雕像是 pickup 类物品（ItemID.Sets.IsAPickup）
        if (d && vanillaItemId === 58) d.pickup = 'heart';
        else if (d && vanillaItemId === 184) d.pickup = 'star';
      },
      spawnNpc: (vanillaNpcId: number, px: number, py: number) => {
        const e = Enemy.fromVanilla(vanillaNpcId, px, py);
        if (e) {
          // Wiring.cs:2479-2483：雕像产怪 value=0（不掉钱）+ SpawnedFromStatue
          e.spawnedFromStatue = true;
          this.entities.add(e, 'enemies');
          return true;
        }
        return false;
      },
      mechSpawnOk: (px: number, py: number, type: number) => {
        // NPC.MechSpawn（NPC.cs:7399-7483）：同 type（等价组互计）三阈值拒绝
        const grp = NPC_MECH_GROUPS.find((g) => g.includes(type));
        let total = 0, near = 0, mid = 0;
        for (const o of this.entities.enemies) {
          const en = o as Enemy;
          const t = en.vanillaId;
          if (t == null) continue;
          if (t !== type && !(grp && grp.includes(t)) && !(type === 55 && t === 230)) continue;
          total++;
          const d = Math.hypot(en.x - px, en.y - py);
          if (d < 200) near++;
          if (d < 600) mid++;
          if (near >= 3 || mid >= 6 || total >= 10) return false;
        }
        return true;
      },
      itemSpawnOk: (px: number, py: number, type: number) => {
        // Item.MechSpawn（Item.cs:48982-49013）：同 item 三阈值拒绝
        let total = 0, near = 0, mid = 0;
        for (const o of this.entities.drops) {
          const d = o as ItemDrop;
          if (dropVanillaId(d) !== type) continue;
          total++;
          const dist = Math.hypot(d.x - px, d.y - py);
          if (dist < 300) near++;
          if (dist < 800) mid++;
          if (near >= 3 || mid >= 6 || total >= 10) return false;
        }
        return true;
      },
      shootProjectile: (px: number, py: number, vx: number, vy: number, damage: number, kind: TrapShotKind, form = 0, anchor?: [number, number]) => {
        this.entities.add(new TrapShot(px, py, vx, vy, damage, kind, form, anchor), 'projectiles');
        // 发射音：陷阱族=敲石近似；炮弹族由 TrapShot 首帧按原版播 Item14（Projectile.cs:21542/26830）；
        // 传送门弹 601 首帧无发射音（原版 AI 只有 alpha 段的门色拖尾尘）；
        // 烟花族发射静音——爆花 Item14 在 Kill（Projectile.cs:73437），喷泉/马桶全程无声
        if (kind !== 'cannonball' && kind !== 'bunny' && kind !== 'snowball' && kind !== 'portalbolt'
          && kind !== 'fireworkRocket' && kind !== 'fireworksBoxRocket'
          && kind !== 'fireworkFountain' && kind !== 'toiletPop') this.sfxAt('tink', px, py);
      },
      hasFountainAt: (tx: number, ty: number) => {
        // 喷泉去重（Wiring.cs:1529-1545：场上已存在 aiStyle73 且 ai[0]/ai[1] 同锚点的弹）
        for (const e of this.entities.projectiles) {
          if (e instanceof TrapShot && e.kind === 'fireworkFountain' && !e.dead
            && e.ax === tx && e.ay === ty) return true;
        }
        return false;
      },
      countProjectiles: (kind: 'spiky' | 'bunny', px: number, py: number, radius: number) => {
        let n = 0;
        for (const e of this.entities.projectiles) {
          if (e instanceof TrapShot && e.kind === kind && Math.hypot(e.x - px, e.y - py) < radius) n++;
        }
        return n;
      },
      spikyBudgetPenalty: (px: number, py: number) => {
        // Wiring.cs 1456 :1952-1966:每个场上 185 按距离扣预算
        // (<50→50 <100→15 <200→10 <300→8 <400→6 <500→5 <700→4 <900→3 <1200→2 其余 1)
        let pen = 0;
        for (const e of this.entities.projectiles) {
          if (!(e instanceof TrapShot) || e.kind !== 'spiky' || e.dead) continue;
          const d = Math.hypot(e.x + e.w / 2 - px, e.y + e.h / 2 - py);
          pen += d < 50 ? 50 : d < 100 ? 15 : d < 200 ? 10 : d < 300 ? 8
            : d < 400 ? 6 : d < 500 ? 5 : d < 700 ? 4 : d < 900 ? 3 : d < 1200 ? 2 : 1;
        }
        return pen;
      },
      doorOpen: (x: number, y: number) => {
        // 原版 HitWireSingle 10/11:随机方向 + 反向重试(WorldGen.OpenDoor)
        const dir = Math.random() < 0.5 ? 1 : -1;
        if (!openDoor(this.world.store, x, y, dir)) return openDoor(this.world.store, x, y, -dir) ;
        return true;
      },
      doorClose: (x: number, y: number) => closeDoor(this.world.store, x, y),
      teleportPair: (a: [number, number], b: [number, number]) => this.teleportPairImpl(a, b),
      relocateTownNpc: (group: 0 | 1, px: number, py: number) => {
        // 雕像 40/41 城镇 NPC 白名单(原版两组;此处按 NPC 图鉴顺序取前几个存在的)
        const groups: Array<Array<string>> = [
          ['guide', 'merchant', 'nurse', 'demolitionist', 'dyer', 'arms_dealer'],
          ['dryad', 'painter', 'golfer', 'zoologist', 'pirate', 'stylist'],
        ];
        for (const key of groups[group]) {
          const npc = this.entities.npcs.find((n) => (n as TownNPC).npcKey === key);
          if (npc) {
            npc.x = px - npc.w / 2;
            npc.y = py - npc.h - 1;
            return true;
          }
        }
        return false;
      },
      explode: (tx: number, ty: number, damage: number, radius?: number, destroyTiles?: boolean) =>
        this.explodeAt(tx, ty, damage, radius, destroyTiles),
      extractinatorPull: (ax: number, ay: number, blockType: number) =>
        this.extractinatorPullImpl(ax, ay, blockType),
      dropItemStack: (vid: number, stack: number, px: number, py: number) =>
        this.dropItemStackImpl(vid, stack, px, py),
      toast: (m: string) => this.cb.onToast(m),
      sfx: (n: string, x?: number, y?: number) => {
        if (x !== undefined && y !== undefined) this.sfxAt(n as SfxName, x, y);
        else this.sfx.play(n as SfxName);
      },
      // 广播盒（Wiring.cs:1177-1230 1:1）：Sign.ReadSign(anchor, CreateIfMissing:false)
      // ——锚点精确匹配，无登记/空文本静默；命中 → NewTextMultiline(text, pink, 460)
      // （全链在 announcementBoxMessage，色值/折行宽度同源）
      announce: (x: number, y: number) => {
        const msg = announcementBoxMessage(this.world.signs, x, y);
        if (msg) this.newText(msg.text, msg.r, msg.g, msg.b, msg.width);
      },
      // 派对纪念碑（Wiring.cs:2037-2039 → BirthdayParty.ToggleManualParty）
      toggleParty: () => {
        toggleManualParty(this.partyState);
      },
    };
  }

  /** 广播盒右键（Player.cs:32231-32250）：Sign.ReadSign(anchor, CreateIfMissing:true)
   *  ——锚点无登记则懒建空牌项（Sign.cs:45-59），再开文本编辑面板 */
  private openSignEditor(x: number, y: number): void {
    let sign = this.world.signs.find((s) => s.x === x && s.y === y);
    if (!sign) {
      sign = { x, y, text: '' };
      this.world.signs.push(sign);
    }
    this.cb.onEditSign?.(x, y, sign.text);
  }

  /** 编辑面板保存（Sign.TextSign :63-77：按登记下标写回文本） */
  setSignText(x: number, y: number, text: string): void {
    const sign = this.world.signs.find((s) => s.x === x && s.y === y);
    if (!sign) return;
    sign.text = text;
  }

  /** 传送器对(Wiring.cs:2314-2365):板上 48×48 判定框内实体双向搬迁 */
  private teleportPairImpl(a: [number, number], b: [number, number]) {
    // 太近的竖叠板拒绝(:2316)
    if (Math.abs(a[0] - b[0]) < 3 && a[1] > b[1] - 3 && a[1] < b[1]) return;
    const rect = (pad: [number, number]) => ({
      x: pad[0] * TILE, y: pad[1] * TILE - 48, w: 48, h: 48,
    });
    const hit = (r: { x: number; y: number; w: number; h: number }, e: { x: number; y: number; w: number; h: number }) =>
      e.x < r.x + r.w && e.x + e.w > r.x && e.y < r.y + r.h && e.y + e.h > r.y;
    const ra = rect(a), rb = rect(b);
    const dx = rb.x - ra.x, dy = rb.y - ra.y;
    if (!this.wiring?.blockPlayerTeleportationForOneIteration) {
      const p = this.player;
      if (!p.dead && hit(ra, p)) { p.x += dx; p.y += dy; p.vx = 0; p.vy = 0; this.sfx.play('tink'); }
      else if (!p.dead && hit(rb, p)) { p.x -= dx; p.y -= dy; p.vx = 0; p.vy = 0; this.sfx.play('tink'); }
    }
    for (const e of this.entities.enemies) {
      if (hit(ra, e)) { e.x += dx; e.y += dy; }
      else if (hit(rb, e)) { e.x -= dx; e.y -= dy; }
    }
  }

  /** 爆炸不可炸 tile 表（Projectile.CanExploteTile cs:75764 1:1）：
   *  地牢砖族 tileDungeon{41,43,44,677-679}(Main.cs:7941) + 基础宝箱 BasicChest{21,467}
   *  (TileID.cs:315) + switch 黑名单{26 祭坛,88 柜子,121/122 史莱姆块?,150 蛛网? ,
   *  211 血月砖?,226 蜥蜴砖,237 蜥蜴祭坛,248-250 尖刺?,346/470/475/504 陷阱族,685/686} */
  private static readonly EXPLODE_NEVER = new Set([41, 43, 44, 677, 678, 679, 21, 467,
    26, 88, 121, 122, 150, 211, 226, 237, 248, 249, 250, 346, 470, 475, 504, 685, 686]);
  /** 困难模式矿石（仅 scarab 弹 1086/1087 可炸——未引入恒 false） */
  private static readonly EXPLODE_HM_ORE = new Set([107, 108, 111, 221, 223]);
  /** 爆炸半径表（Projectile.cs:75262）：炸弹族=4、炸药棍族=7、放置炸药 108=10；
   *  表外（手雷 30 等）= 不破坏地形（Kill 判定表 :75260 之外） */
  static readonly EXPLODE_RADIUS: Record<number, number> = {
    28: 4, 37: 4, 516: 4, 519: 4, 29: 7, 470: 7, 637: 7, 108: 10,
  };
  /** CanExploteTile 纯函数版（测试用）：规则见 explodeAt 注释 */
  static canExplodeTile(
    st: World['store'], x: number, y: number, hardMode: boolean, golemDown: boolean, lavaLine: number,
  ): boolean {
    const t = st.get(x, y);
    const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    if (Game.EXPLODE_NEVER.has(sheet)) return false;
    const ii = st.idx(x, y);
    if (st.wall[ii] === 350) return false;
    if (Game.EXPLODE_HM_ORE.has(sheet)) return false;
    if ((sheet === 37 || sheet === 58) && !hardMode) return false;
    if (sheet === 77 && !hardMode && y >= lavaLine) return false;
    if (sheet === 137 && !golemDown) {
      const row = Math.floor(st.frameY[ii] / 18);
      if (row >= 1 && row <= 4) return false; // 神庙门行（:75805 (uint)(num-1)<=3）
    }
    return true;
  }

  /** 爆炸 1:1（Projectile.ExplodeTiles cs:75835 + CanExploteTile cs:75764）：
   *  radius=Projectile.cs:75262 半径表（炸弹族28/37/516/519=4、炸药棍族29/470/637=7、
   *  放置炸药108=10、手雷族不破坏地形→destroyTiles=false）；
   *  免疫表 EXPLODE_NEVER + 困难模式矿石 + 陨石/狱石(37/58)肉前免疫 + 黑檀石(77)肉前
   *  地狱免疫 + 蜥蜴砖(137)石巨人前神庙门行(frameY/18∈1-4)免疫 + 墙350；
   *  破坏走 breakTile（=WorldGen.KillTile 全语义，**含掉落**——曾误注释"不掉物品"）；
   *  墙破坏 ShouldWallExplode(:75739)：盘内任一格无墙 → 每 destroyed 格 3×3 清墙(≠350) */
  /** 传送门弹 601 落门（GameHooks.placePortal；TrapShot 撞块时调用）。
   *  PortalHelper.TryPlacingPortal+AddPortal（entities/Portal.ts）：同 form 旧门与
   *  门线相交门被移除；落点不成（门线无有效支承）静默 */
  placePortal(x: number, y: number, vx: number, vy: number, form: number): void {
    const p: Portal | null = placePortalAt(this.world.store, x, y, vx, vy, form);
    if (p) this.entities.add(p, 'props');
  }

  /** hurtBox:实体伤害盒半宽(Projectile.Kill 各族 Resize 盒的半边)。
   *  原版与地形破坏半径【无关】:炸弹/手雷族(:74885)Resize(22,22)=11px;
   *  炸药棍 29(:74951)200×200=100px;缺省按地形半径兜底(放置炸药 108/器件爆) */
  private explodeAt(tx: number, ty: number, damage: number, radius = 3, destroyTiles = true, hurtBox?: number) {
    const st = this.world.store;
    const R = radius;
    const hardMode = !!this.world.flags.hardMode;
    const golemDown = !!this.world.flags['downed_245'];
    const canExplode = (x: number, y: number): boolean =>
      Game.canExplodeTile(st, x, y, hardMode, golemDown, this.world.lavaLine);
    // 半径内被炸的格：多格 framed 物体按整件清除（锚点邻域扫描，同 breakTile 语义），
    // 防半件残留可重复破坏；炸药(141/142)收集后链式引爆（原版连爆语义，上限 32 防递归）
    const chain: Array<[number, number]> = [];
    if (destroyTiles && R > 0) {
      // ShouldWallExplode(:75739)：盘内任一格无墙 → 墙也可炸
      let wallSplode = false;
      for (let dx = -R; dx <= R && !wallSplode; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          if (dx * dx + dy * dy > R * R) continue;
          const x = tx + dx, y = ty + dy;
          if (st.inBounds(x, y) && st.wall[st.idx(x, y)] === 0) { wallSplode = true; break; }
        }
      }
      for (let dx = -R; dx <= R; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          if (dx * dx + dy * dy > R * R) continue;
          const x = tx + dx, y = ty + dy;
          if (!st.inBounds(x, y)) continue;
          const t = st.get(x, y);
          if (t !== 0) {
            if (!canExplode(x, y)) continue;
            if (t === TILE_BY_KEY['v_141_explosives']) { chain.push([x, y]); continue; }
            this.breakTile(x, y); // KillTile 全语义（掉落/树/罐/幼虫/蜂巢…）
          }
          if (wallSplode) {
            // 每 destroyed 格 3×3 清墙（:75852-75867，墙≠350）
            for (let wx = x - 1; wx <= x + 1; wx++) {
              for (let wy = y - 1; wy <= y + 1; wy++) {
                if (!st.inBounds(wx, wy)) continue;
                const wi = st.idx(wx, wy);
                if (st.wall[wi] > 0 && st.wall[wi] !== 350) st.setWallSilent(wx, wy, 0);
              }
            }
          }
        }
      }
    }
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    for (const e of this.entities.enemies) {
      // 原版语义 = Resize(hurtBox×2) 盒与实体 Hitbox 相交(中心距 < hurtBox+半宽)。
      // ★曾用 R*TILE+16 距离圆:炸弹 80px(原版 11px,近 4 格外的怪也被炸)——半径混用
      const hb = hurtBox ?? R * TILE;
      const en = e as Enemy;
      if (en.hurt && Math.abs((en.cx ?? cx) - cx) < hb + (e.w >> 1)
        && Math.abs((en.cy ?? cy) - cy) < hb + (e.h >> 1)) {
        en.hurt(damage, cx - (en.cx ?? cx), cy - (en.cy ?? cy), this);
      }
    }
    const p = this.player;
    const hb = hurtBox ?? R * TILE;
    if (Math.abs(p.cx - cx) < hb + p.w / 2 && Math.abs(p.cy - cy) < hb + p.h / 2) p.damage(damage, cx, cy);
    // 视觉 1:1(Projectile.Kill 炸弹族 :74886-74916):烟 31×20 慢散 +
    // 火 6×10 对(noGravity 快速) + gore 61-63 四向 4 块(近似灰色块)
    this.spawnParticles(cx, cy, '#9A9A9A', 20, 2, { life: 40, damp: 0.96 });       // 烟(×1.4 慢)
    this.spawnParticles(cx, cy, '#FF9A3C', 20, 5, { life: 30, grav: -0.06, damp: 0.94 }); // 火对(×5/×3 无重力)
    for (let gi = 0; gi < 4; gi++) {
      const a = gi * Math.PI / 2 + Math.PI / 4;
      this.spawnParticles(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, '#D8D8D0', 1, 3,
        { life: 50, damp: 0.98, size: 3 });
    }
    // 原版爆炸声 SoundID.Item14(Projectile.cs 手雷/炸弹/炸药等 20+ 处)——
    // 曾误用 roar(Boss 咆哮);首播静音已由 Sfx 合成分支+预热兜底
    this.sfxAt('explosion', cx, cy);
    // 链式引爆（延后到本爆结算后，防爆心递归；上限防炸药墙死循环）
    let chained = 0;
    while (chain.length && chained < 32) {
      const [ex, ey] = chain.pop()!;
      if (st.get(ex, ey) !== TILE_BY_KEY['v_141_explosives']) continue;
      st.setTile(ex, ey, 0);
      chained++;
      this.explodeAt(ex, ey, 500, 10);
    }
  }

  /** 桶三态（Player.ItemCheck_UseBuckets，Player.cs:45704-45870 1:1）：
   *  空桶舀取（:45726-45802）：目标格有液体且 3×3 同类液体合计 >100 才可舀；
   *    舀空目标格后向四邻同类回吸至满 255（差额随桶带走）；舀蜂蜜→蜂蜜桶/岩浆→岩浆桶
   *  满桶倾倒（:45805-45838）：目标格已有液体 ≥200 拒绝（不覆盖半格液体）；
   *    已有异类液体拒绝；active 且实心且非 solidTop（tile 546 除外）拒绝；倾 255 */
  private useBucket(key: string, tx: number, ty: number): void {
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    const liqTypeMap: Record<string, number> = { water_bucket: 1, lava_bucket: 2, honey_bucket: 3 };
    const swap = (toKey: string) => {
      // 原版语义:桶在手中原格替换(不跳格)
      this.player.inv.slots[this.player.inv.selected] = { id: ITEM_BY_KEY[toKey], stack: 1 };
      this.cb.onInventoryChanged();
      this.player.useTime = 30;
      this.input.rightDown = false;
    };
    if (key === 'empty_bucket') {
      const i = st.idx(tx, ty);
      if (st.liquid[i] <= 0) return;
      const t = st.liquidType[i] || 1;
      if (t === 4) return; // 微光不可舀（:45726：type 205 且 tile.shimmer() → 直接返回）
      // 3×3 同类合计门（:45733-45741：合计 ≤100 的浅洼舀不起）
      let sum = 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(tx + ox, ty + oy)) continue;
          const j = st.idx(tx + ox, ty + oy);
          if ((st.liquidType[j] || 1) === t) sum += st.liquid[j];
        }
      }
      if (sum <= 100) return;
      const scooped = st.liquid[i];
      st.setLiquid(tx, ty, 0, 0);
      // 邻居回吸（:45777-45802）：目标格不足 255 时从 3×3 同类补足，余量进桶消失
      let need = 255 - scooped;
      for (let ox = -1; ox <= 1 && need > 0; ox++) {
        for (let oy = -1; oy <= 1 && need > 0; oy++) {
          if ((ox === 0 && oy === 0) || !st.inBounds(tx + ox, ty + oy)) continue;
          const j = st.idx(tx + ox, ty + oy);
          if (st.liquid[j] <= 0 || (st.liquidType[j] || 1) !== t) continue;
          const take = Math.min(st.liquid[j], need);
          st.setLiquid(tx + ox, ty + oy, st.liquid[j] - take, t);
          need -= take;
        }
      }
      this.sfx.play('splash', 1, tx * TILE + 8, ty * TILE + 8); // SoundID 19（:45774）
      swap(t === 2 ? 'lava_bucket' : t === 3 ? 'honey_bucket' : 'water_bucket');
    } else {
      const i = st.idx(tx, ty);
      const lt = liqTypeMap[key];
      // 倾倒门（:45805-45808）：液体 ≥200 / 异类液体 / 实心块（546 陆地块例外）拒绝
      if (st.liquid[i] >= 200) return;
      if (st.liquid[i] > 0 && (st.liquidType[i] || 1) !== lt) return;
      const td = st.type[i] !== 0 ? TILE_DEFS[st.type[i]] : undefined;
      if (st.flags[i] && td && td.solid && !td.platform && td.vanilla?.sheet !== 546) return;
      st.setLiquid(tx, ty, 255, lt);
      this.sfx.play('splash', 1, tx * TILE + 8, ty * TILE + 8); // SoundID 19（:45816/45833）
      swap('empty_bucket');
    }
  }

  /** 门交互：开门按玩家朝向、失败换反向（原版 Player.cs L20965-20974）；
   *  帧算法/样式保留/方向锚点见 world/Door.ts（原版 OpenDoor L22384 / CloseDoor L15901 语义） */
  private toggleDoor(x: number, y: number, open: boolean) {
    const st = this.world.store;
    if (open) {
      const dir = this.player.facing >= 0 ? 1 : -1;
      if (!openDoor(st, x, y, dir) && !openDoor(st, x, y, -dir)) return;
      this.sfx.play('door_open');
    } else {
      if (!closeDoor(st, x, y, Math.random, (bx, by) => this.overlapsEntity(bx, by))) return;
      this.sfx.play('door_close');
    }
    this.input.rightDown = false;
  }

  openChest: ((c: ChestData) => void) | null = null;
  /** UI 侧当前打开的箱子（Wiring.cs:2571 Chest.UsingChest 判定用；UI.ts 赋值） */
  openChestRef: (() => ChestData | null) | null = null;

  private findChest(tx: number, ty: number): ChestData | null {
    for (const c of this.world.chests) {
      if ((c.x === tx || c.x + 1 === tx) && (c.y === ty || c.y + 1 === ty)) return c;
    }
    return null;
  }

  /** 3×3 邻域内找宝箱（点击容差） */
  private findChestNear(tx: number, ty: number): ChestData | null {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.findChest(tx + dx, ty + dy);
        if (c) return c;
      }
    }
    return null;
  }

  private dumpChest(x: number, y: number) {
    const c = this.findChest(x, y);
    if (!c) return;
    for (const item of c.items) {
      if (item) this.spawnDrop(x * TILE + 16, y * TILE, ITEM_DEFS[item.id].key, item.stack);
    }
    this.world.chests = this.world.chests.filter((cc) => cc !== c);
  }

  // ================= 战斗 =================

  /** 瓦罐碎裂（WorldGen.CheckPot L56807 + SpawnThingsFromPot L57100，肉前普通世界主干）：
   *  任意一格被打破 → 整罐碎裂 + 掉落表（稀有药水 / 蘑菇 / 火把 / 箭 / 凝胶 / 绳 / 钱币），只掉一次。
   *  原版瓦罐自身不掉（KillTile_GetItemDrops 无 case 28），掉落全在本表内。
   *  整罐格收集用相邻聚集（frame 布局方向无关——我们 potPass 的 frameY 上下排与原版相反，
   *  原版锚点公式会把上排漏清，残留格反复触发 = 无限刷 loot，故改为四邻洪水找齐） */
  private smashPot(x: number, y: number) {
    const st = this.world.store;
    if (!st.inBounds(x, y) || st.get(x, y) !== POT_TILE) return;
    const cells: Array<[number, number]> = [];
    const stack: Array<[number, number]> = [[x, y]];
    const seen = new Set<number>([x * 100000 + y]);
    let ax = x, ay = y, minFY = Infinity;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      cells.push([cx, cy]);
      const ci = st.idx(cx, cy);
      if (st.frameY[ci] < minFY) { minFY = st.frameY[ci]; ax = cx; ay = cy; }
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + ddx, ny = cy + ddy, k = nx * 100000 + ny;
        if (!seen.has(k) && st.inBounds(nx, ny) && st.get(nx, ny) === POT_TILE) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    const style = Math.floor(minFY / 36);
    // 直接逐格清除（不再回调 breakTile——那会落入 object 锚点分支清错位置；
    // 瓦罐 frameY=0 在底行，与家具顶行相反）。瓦罐不掉自身（原版 SpawnThingsFromPot 只掉内容物）
    for (const [cx, cy] of cells) st.setTile(cx, cy, 0);
    // CheckPot 音效（普通瓦罐 SoundID 13 = Shatter.wav）+ 陶瓷碎片粒子
    this.sfx.play('shatter');
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#9A6A5A', 10, 2.6, { life: 200, damp: 0.985, grav: 0.09 });
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#C4A48C', 6, 2.0, { life: 180, damp: 0.985, grav: 0.09 });
    this.potLoot(ax, ay, style);
  }

  /** 瓦罐掉落（SpawnThingsFromPot 肉前普通世界分支，WorldGen.cs:57100-57760） */
  private potLoot(x: number, y: number, style: number) {
    const w = this.world;
    const underworldY = w.store.h - 200; // UnderworldLayer ≈ maxTilesY-200
    const flag = y < w.rockLevel;         // 原版 flag：j < rockLayer（地表+泥土层）
    // item id → 我们 key：VANILLA_ITEM_KEY_BY_ID 全量映射（vi_ 表覆盖 6146 件）+
    // 原生 def 覆盖（火把/铜币有原生实现）
    const drop = (itemId: number, n = 1): ItemDrop | null => {
      const override: Record<number, string> = { 8: 'torch', 73: 'coin_copper' };
      const key = override[itemId] ?? VANILLA_ITEM_KEY_BY_ID[itemId];
      if (!key) return null;
      return this.spawnDrop(x * TILE + 8, y * TILE + 8, key, n, (Math.random() - 0.5) * 2.4, -2 - Math.random());
    };
    /** 心 pickup（item 58 是 IsAPickup：触碰回血不进包——此处曾误当蘑菇收集物） */
    const dropHeart = () => { const h = drop(58); if (h) h.pickup = 'heart'; };
    const R = (n: number) => (Math.random() * n) | 0;
    // L57213：1/45 稀有 → 按深度三张药水表
    if (R(45) === 0) {
      if (y < w.groundLevel) {
        const n = R(10);
        if (n <= 3) drop([292, 298, 299, 290][n]);
        else if (n === 4) drop(2322);
        else if (n === 5) drop(2324);
        else if (n === 6) drop(2325);
        else drop(2350, 1 + R(2));
      } else if (flag) {
        const n = R(11);
        if (n === 0) drop(289);
        else if (n <= 6) drop([298, 299, 290, 303, 291, 304][n - 1]);
        else if (n === 7) drop(2322);
        else if (n === 8) drop(2329);
        else drop(2350, 1 + R(2));
        if (R(15) === 0) drop(4870);
      } else {
        const n = R(15);
        if (n === 0) drop(296);
        else if (n === 1) drop(295);
        else if (n <= 13) drop([299, 302, 303, 305, 301, 302, 297, 304, 2322, 2323, 2327, 2329][n - 2]);
        else drop(2350, 1 + R(2));
        if (R(15) === 0) drop(4870);
      }
      return;
    }
    // L57505：num10 = rand(7)（expert 才 -1，WorldGen.cs:57482-57486——曾漏实现此偏移）
    const num10 = R(7) - (this.world.isExpert ? 1 : 0);
    // 载入期液体收敛(waterCheck→killTile→breakTile→smashPot)可能砸水边瓦罐,
    // 此时 player 尚未创建(afterWorldLoad 尾部)——无主角视为"受伤"走蘑菇分支,
    // 掉落物随后被 entities.clear() 清掉,无泄漏
    const pl = this.player;
    if (num10 === 0 && (!pl || pl.hp < pl.maxHp)) {
      // 心 pickup（WorldGen.cs:57511-57531）：1 颗 + 1/2 第二颗；
      // 专家模式（大师也算）再 1/2、1/2 两颗
      dropHeart();
      if (R(2) === 0) dropHeart();
      if ((pl && this.world.isExpert)) {   // WorldGen.cs:57520 Main.expertMode（世界难度）
        if (R(2) === 0) dropHeart();
        if (R(2) === 0) dropHeart();
      }
      return;
    }
    if (num10 === 1 || num10 === 0) {
      // 火把（原版 num10==0 时需背包火把<20，火把计数略；液体中→荧光棒 282）
      const inLiquid = w.store.liquid[w.store.idx(x, y)] > 0;
      drop(inLiquid ? 282 : 8, 2 + R(5));
      return;
    }
    switch (num10) {
      case 2: { // 箭 40×10-20；泥土层半数 42；地狱 265（L57617）
        let t = 40;
        if (flag && R(2) === 0) t = 42;
        if (y > underworldY) t = 265;
        drop(t, 10 + R(11));
        return;
      }
      case 3: // 弱效治疗药水 28（地狱/困难→治疗药水 188）（L57625-57638）
        drop(y > underworldY ? 188 : 28, 1);
        return;
      case 4:
      case 5: // 绳 965×20-40（仅非地狱肉前，L57683）
        if (y < underworldY) { drop(965, 20 + R(21)); return; }
        break;
    }
    // 默认：钱币 num16（L57688+：200±100 × 深度系数 × style 系数 × 多级随机加成）
    let coins = 200 + R(201) - 100;
    if (y < w.groundLevel) coins *= 0.5;
    else if (flag) coins *= 0.75;
    else if (y > w.store.h - 250) coins *= 1.25;
    for (const [den, lo, hi] of [[4, 5, 11], [8, 10, 21], [12, 20, 41], [16, 40, 81], [20, 50, 101]] as const) {
      if (R(den) === 0) coins *= 1 + (lo + R(hi - lo)) / 100;
    }
    // style 系数 num（L57113-57160）→ coins *= (num*2+1)/3
    let num = 1;
    if (style >= 4 && style <= 6) num = 1.25;
    else if (style >= 7 && style <= 9) num = 1.75;
    else if (style >= 10 && style <= 12) num = 1.9;
    else if (style >= 13 && style <= 15) num = 2.1;
    else if (style >= 16 && style <= 18) num = 1.6;
    else if (style >= 19 && style <= 21) num = 3.5;
    else if (style >= 22 && style <= 24) num = 1.6;
    else if (style >= 25 && style <= 27) num = 10;
    else if (style >= 28 && style <= 30) num = 4; // hardMode 才 ×4，肉前应为 1——此处取肉前
    else if (style >= 31 && style <= 33) num = 2;
    else if (style >= 34 && style <= 36) num = 1.25;
    coins *= (num * 2 + 1) / 3;
    if (coins > 1000) coins = 1000; // 防御性上限（原版由 Item.NewItem 内部面值转换）
    drop(73, Math.max(1, Math.round(coins)));
  }

  private updateSwingHits() {
    if (!this.swing) return;
    this.swing.t--;
    if (this.swing.t <= 0) { this.swing = null; return; }
    const held = this.player.inv.heldItem();
    if (!held) return;
    const heldDef = ITEM_DEFS[held.id];
    const tool = heldDef.tool ?? this.itemFuncTool(held.id);
    // ---- 近战整体门（Player.cs:42964）：(damage>=0 && !noMelee) 才进 GetMeleeHitbox，
    // 且 CutTiles/MeleeHitNPCs 都在 damage>0 内（cs:42991-43006）——
    // 此前挥动药水/镜子（damage=0）也带 32×32 近战盒：砍草 + 对敌 1 点伤害 + 对小动物
    // 一击致死，均为原版没有的行为（vi_ 数值取 combat 表，legacy 工具取 def.tool）
    const swingVid = heldDef.vid ?? viIdFromKey(heldDef.key);
    const swingCombat = swingVid >= 0 ? itemCombat(swingVid) : null;
    const meleeDmg = this.swing.dmg ?? tool?.damage ?? swingCombat?.damage ?? 0;
    const noMelee = heldDef.magic || swingCombat?.noMelee;
    if (noMelee || meleeDmg <= 0) return;
    // ---- 原版 ItemCheck_GetMeleeHitbox（Player.cs:44480）1:1：矩形判定非圆形 ----
    // 基础矩形 = ApplyUseStyle 三段 itemLocation（手部位置，公式同 drawUseItem）+ **恒 32×32**
    // （cs:44489 new Rectangle(itemLocation.X, itemLocation.Y, 32, 32) ×adjustedItemScale≈1，
    // 与武器贴图尺寸无关——此前误用贴图帧宽高当基底，小武器欠打大武器超打）；
    // 方向/重力翻转（cs:44506-44513）；useStyle1 三段扩展（cs:44516-44540）：
    // **早段(anim≥0.666max) 宽×2 高×1.4 X 退 1.2宽 / 中段原样 / 晚段(anim<0.333max)
    // 宽×1.4 高×1.1 Y 下移半高**——此前早/晚段扩展对调，注释也反
    const pAnim = Math.min(1, Math.max(0, this.swing.t / this.swing.dur));
    const ar = this.renderer?.atlas ? atlasIconForKey(this.renderer.atlas, ITEM_DEFS[held.id].key) : null;
    const sprW = ar?.sw ?? 16, sprH = ar?.sh ?? 16;
    const xTier = (w: number, phase: 0 | 1 | 2) => phase === 0
      ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 14 : 10
      : phase === 1
        ? w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w > 32 ? 18 : 10
        : w >= 92 ? 38 : w >= 64 ? 28 : w >= 52 ? 24 : w >= 48 ? 18 : w > 32 ? 14 : 6;
    const yTier = (h: number, phase: 0 | 1 | 2) => phase === 0 ? 24
      : h > 64 ? 14 : h > 52 ? 12 : phase === 1 && h > 32 ? 8 : 10;
    let offX: number, offY: number;
    const phase: 0 | 1 | 2 = pAnim > 2 / 3 ? 0 : pAnim > 1 / 3 ? 1 : 2;
    const hitUs = this.swing.useStyle ?? 1;
    if (hitUs === 3) {
      // useStyle 3（雨伞 946/4707）单一持位（cs:50279-50294）：
      // offX = fw/2-4-max(pAnim*fw*1.2-10, 8)、offY = 顶+24
      offX = sprW * 0.5 - 4 - Math.max(pAnim * sprW * 1.2 - 10, 8);
      offY = 24;
    } else if (phase === 0) { offX = sprW * 0.5 - xTier(sprW, 0); offY = yTier(sprH, 0); }
    else if (phase === 1) { offX = sprW * 0.5 - xTier(sprW, 1); offY = yTier(sprH, 1); }
    else { offX = -(sprW * 0.5 - xTier(sprW, 2)); offY = yTier(sprH, 2); }
    const p = this.player;
    let bx = p.cx + p.facing * offX;
    let by = p.y + offY;
    let bw = 32, bh = 32; // 恒定基底（cs:44489），与武器贴图无关
    if (p.facing === -1) bx -= bw;
    by -= bh;
    if (hitUs === 3) {
      // useStyle 3（cs:44545-44560 + :50279-50312）：anim>0.666 收势段 dontAttack；
      // 判定段宽×1.4 / 高×0.6（Y 下移 0.6 高）；雨伞本体再 高+14 宽-10（朝左 X+10）
      if (pAnim > 0.666) return;
      if (p.facing === -1) bx -= Math.floor(bw * 1.4 - bw);
      bw = Math.floor(bw * 1.4);
      by += Math.floor(bh * 0.6);
      bh = Math.floor(bh * 0.6);
      if (swingVid === 946 || swingVid === 4707) {
        bh += 14;
        bw -= 10;
        if (p.facing === -1) bx += 10;
      }
    } else if (phase === 0) {
      // 三段扩展（cs:44516-44540）：早段大盒覆盖抡起区、晚段小盒收势
      if (p.facing === 1) bx -= Math.floor(bw * 1.2);
      bw *= 2;
      by -= Math.floor(bh * 1.4 - bh);
      bh = Math.floor(bh * 1.4);
    } else if (phase === 2) {
      if (p.facing === -1) bx -= Math.floor(bw * 1.4 - bw);
      bw = Math.floor(bw * 1.4);
      by += Math.floor(bh * 0.5);
      bh = Math.floor(bh * 1.1);
    }
    // 原版 ItemCheck_CutTiles（Player.cs:44002）：挥击矩形内所有 tileCut/KillTile
    for (let ty = Math.floor(by / TILE); ty <= Math.floor((by + bh - 1) / TILE); ty++) {
      for (let tx = Math.floor(bx / TILE); tx <= Math.floor((bx + bw - 1) / TILE); tx++) {
        const tk = tx * 100000 + ty;
        if (this.swingTileCutSet.has(tk)) continue;
        const t = this.world.store.get(tx, ty);
        if (t === POT_TILE) {
          this.swingTileCutSet.add(tk);
          this.smashPot(tx, ty);
        } else if (TILE_CUT.has(t)) {
          this.swingTileCutSet.add(tk);
          this.breakTile(tx, ty);
        }
      }
    }
    // 矩形-AABB 相交判定（原版 ItemCheck_MeleeHitNPCs 的 npc.getRect().Intersects(itemRectangle)）
    const prog = 1 - pAnim;
    // 法杖系 noMelee=true 已在入口门整体跳过（含 CutTiles——原版 noMelee 连
    // GetMeleeHitbox 都不进，cs:42964；此前的 magic 后置 return 只挡实体不挡砍草）
    const hitRect = (ex: number, ey: number, ew: number, eh: number) =>
      ex < bx + bw && ex + ew > bx && ey < by + bh && ey + eh > by;
    // 小动物：任何挥击一击致死
    for (const cent of this.entities.critters) {
      const c = cent as Critter;
      if (this.swingHitSet.has(c.id)) continue;
      if (hitRect(c.x, c.y, c.w, c.h)) {
        this.swingHitSet.add(c.id);
        c.hurt(this);
      }
    }
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (this.swingHitSet.has(e.id)) continue;
      if (!hitRect(e.x, e.y, e.w, e.h)) continue;
      this.swingHitSet.add(e.id);
      // 怪物专属受击声（各家族不同）；播放失败回退通用 hit
      if (!this.sfx.playFiles(e.def.hitSound, 1, e.cx, e.cy)) this.sfx.play('hit', 1, e.cx, e.cy);
      const crit = Math.random() < 0.04 + this.player.critChance('melee') / 100; // 基础 4% + 装备/词缀暴击
      // 工具（镐/斧）也有攻击力但远弱于剑：功率/16（铁镐 3 / 铁斧 4，铁剑 16）—— 仅应急；
      // vi_ 数据驱动近战武器优先取挥击时缓存的 combat 表伤害/击退（swing.dmg/kb）；
      // 装备全系伤害乘区（徽章/险恶词缀等，ApplyEquipFunctional dmgMelee 段）
      const baseDmg = ((meleeDmg || Math.max(1, Math.ceil((tool?.power ?? 10) / 16)))
        * this.player.damageMult('melee')) + this.player.equipStats.armorPen + this.player.meleeArmorPen;
      this.player.onMeleeHit(); // 甲虫进攻套蓄能（命中结算前计数无碍）
      // 原版 Main.DamageVar：±15% 浮动（1 + rand(-15..15)/100）
      const dmg = Math.max(1, Math.round((baseDmg + this.player.meleeDamageBonus) * (crit ? 2 : 1) * (1 + (Math.random() * 30 - 15) / 100)));
      const kdir = Math.sign(e.cx - p.cx) || this.player.facing;
      // 击退 = 官方击退值（原版 knockBack 2-5.5 → 速度系数 0.65）；
      // 力量手套族 kbGlove 近战击退翻倍
      const kb = ((this.swing.kb ?? tool?.knockback ?? swingCombat?.knockBack ?? 3)) * 0.65 * (this.player.equipStats.kbGlove ? 2 : 1) * (this.player.buffs.has(BuffType.Titan) ? 1.5 : 1);
      const killed = e.hurt(dmg, kdir * kb, -2.5, this);
      this.addDamageNumber(e.cx, e.y, dmg, crit, crit ? '#FFD040' : '#FF7060');
      // 武器浸剂（meleeEnchant 表 Player.cs:11604 → 敌 debuff :6141-6171 时长 Next(a,b) 秒）
      if (this.player.buffs.has(BuffType.ImbueVenom)) e.venomT = Math.max(e.venomT, 5 + Math.random() * 5);
      if (this.player.buffs.has(BuffType.ImbueCursed)) e.cursedT = Math.max(e.cursedT, 3 + Math.random() * 4);
      if (this.player.buffs.has(BuffType.ImbueFire)) e.onFireT = Math.max(e.onFireT, 3 + Math.random() * 4);
      if (this.player.buffs.has(BuffType.ImbueGold)) e.midasT = 2;
      if (this.player.buffs.has(BuffType.ImbueIchor)) e.ichorT = Math.max(e.ichorT, 10 + Math.random() * 10);
      if (this.player.buffs.has(BuffType.ImbueNano)) e.confusedT = Math.max(e.confusedT, 1 + Math.random() * 3);
      if (this.player.buffs.has(BuffType.ImbuePoison)) e.poisonT = Math.max(e.poisonT, 5 + Math.random() * 5);
      if (this.player.buffs.has(BuffType.ImbueParty)) {
        this.spawnParticles(e.cx, e.cy, ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 });
      }
      // 幸运币（hasLuckyCoin：近战命中 20% 掉 1-5 铜币，Player.SpawnCoins 近似）
      if (this.player.equipStats.luckyCoin && Math.random() < 0.2) {
        this.spawnDrop(e.cx, e.y, 'coin_copper', 1 + Math.floor(Math.random() * 5), 0, -2);
      }
      if (killed && e.def.boss) { /* boss 死亡处理在 fixedUpdate */ }
    }
    void prog;
  }

  // ================= 生成 =================

  private trySpawnEnemy() {
    // 联机模式：刷怪归房主权威（房主跑完整模拟，快照广播给访客；访客不本地刷怪）
    if (this.net && !this.net.policy.isHost) return;
    const w = this.world;
    const p = this.player;
    if (p.dead) return;
    if (this.boss) return;

    // 原版 Spawner 1:1（VanillaSpawner.ts）：选点+选怪全部按 SpawnAnNPC 链
    if (!this.vanillaSpawner) this.vanillaSpawner = new VanillaSpawner(w);
    // 原版 Spawner.SetSpawnFlags：地牢旗标取玩家 SceneMetrics（15 tick 刷新的 scene），
    // downedBoss3（杀过骷髅王）决定地牢出 守卫/常规池；
    // invaders = ShouldSpawnInvasionEnemies（NPC.cs:352：入侵前线 3000px 内的地表玩家）；
    // activeIds = 场上存活 NPC 集（入侵选表 AnyNPCs 去重）
    const invaders = shouldSpawnInvasionEnemies(w, p.cx, p.cy, this.camera.viewH / (this.camera.zoom || 1),
      this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead).map((n) => (n as TownNPC).cx));
    const activeIds = new Set<number>();
    // 月事件选怪需要 CountNPCS（场上同 id 数量）与 Boss 族 npcSlots 总和
    // （reachedInvasionBossCap，NPC.cs:159-183）——activeIds 只去重不够，同轮统计
    const moonCounts = new Map<number, number>();
    let moonBossSlotSum = 0;
    for (const e of this.entities.enemies) {
      const en = e as Enemy;
      if (en.dead || en.vanillaId == null) continue;
      activeIds.add(en.vanillaId);
      moonCounts.set(en.vanillaId, (moonCounts.get(en.vanillaId) ?? 0) + 1);
      if (MOON_BOSS_IDS.has(en.vanillaId)) moonBossSlotSum += en.vanilla?.npcSlots ?? 1;
    }
    const moonCtx = w.moonEvent.kind !== 0
      ? { kind: w.moonEvent.kind, wave: w.moonEvent.waveNumber, counts: moonCounts, bossSlotSum: moonBossSlotSum }
      : null;
    // 星璇塔 Zone（SceneMetrics.cs:276-282：玩家与场上塔 NPC 距离 <4000px）+
    // 选表 CountNPCS 复用上面统计的 counts 表。任一塔 Zone → spawner 走 invaders 语义
    // （SetSpawnFlags :315-318）+ SpawnAnNPC 链头四塔选怪段
    let lunar: LunarSpawnCtx | null = null;
    if (w.lunarEvent.active) {
      const zone = { solar: false, vortex: false, nebula: false, stardust: false };
      for (const e of this.entities.enemies) {
        const en = e as Enemy;
        if (en.dead || en.vanillaId == null) continue;
        const k = TOWER_KEY[en.vanillaId];
        if (!k) continue;
        if (Math.hypot(en.cx - p.cx, en.cy - p.cy) < TOWER_ZONE_RADIUS) zone[k] = true;
      }
      if (zone.solar || zone.vortex || zone.nebula || zone.stardust) {
        lunar = { zone, counts: moonCounts };
      }
    }
    this.vanillaSpawner.setPlayerFlags(!!this.scene?.zoneDungeon, !!w.flags.downedSkeletron, invaders, activeIds, moonCtx, lunar, this.player.maxHp);
    // 天气注入（雪原雨刷怪率修正 + 沙尘暴怪池门）
    this.vanillaSpawner.setWeather(
      w.weather.cloudAlpha,
      w.weather.sandstorm.happening,
      !!this.scene?.zoneDesert && p.cy / 16 < w.groundLevel + 30,
    );
    // TrySpawnAnNPC L23：nearbyActiveNPCs >= maxSpawns 拒绝
    // （原版 nearbyActiveNPCs = 附近 NPC 的 npcSlots 加权和；我们的怪全部由 spawner 生成
    //  在玩家附近，直接全量求和。蠕虫段也是独立 NPC，原版同样计入）
    const nearby = this.entities.enemies.reduce((s, e) => {
      const en = e as Enemy;
      if (en.def.boss) return s;
      return s + (en.vanilla?.npcSlots ?? 1);
    }, 0);
    const sHeightPx = this.camera.viewH / (this.camera.zoom || 1);
    // 联机远端玩家注入（原版 CheckNotSpawningOnScreen L5344-5366 遍历全部玩家扩展屏）
    VanillaSpawner.remotePlayers = this.net?.active
      ? [...this.net.players.values()].filter((q) => q.active).map((q) => ({ x: q.x + 10, y: q.y + 21 }))
      : [];
    // townNPCs（Player.townNPCs = SceneMetrics.TownNPCCount）：玩家 ±(85×60) 格内存活
    // 城镇 NPC 数——spawnFriendly 掷骰的门(NPC.cs:711-832)。岛/荒野无 NPC → 0 → 永不出小动物
    const townNPCs = this.entities.npcs.reduce((s, n) => {
      const tn = n as TownNPC;
      return s + (tn instanceof TownNPC && !tn.dead
        && Math.abs(tn.cx - p.cx) < 85 * TILE && Math.abs(tn.cy - p.cy) < 60 * TILE ? 1 : 0);
    }, 0);
    const { spawnRate, maxSpawns } = this.vanillaSpawner.getSpawnRate(
      p.cy, nearby, this.heldWaterCandle || this.waterCandleNear, sHeightPx, p.cx,
      this.peaceCandleNear, p.buffs.has(BuffType.Sunflower),
      p.buffs.has(BuffType.Calming), p.buffs.has(BuffType.Battle),
      townNPCs, w.clock.isDay,
      !!this.scene?.zoneCorrupt || !!this.scene?.zoneCrimson,
      !!w.clock.bloodMoon);
    if (nearby >= maxSpawns) return;
    // TrySpawnAnNPC L30：Main.rand.Next(spawnRate) != 0 拒绝（每帧 1/spawnRate 概率）
    if (Math.floor(Math.random() * spawnRate) !== 0) return;
    const viewHalfW = Math.ceil(this.camera.viewW / (this.camera.zoom || 1) / 2 / TILE);
    const viewHalfH = Math.ceil(this.camera.viewH / (this.camera.zoom || 1) / 2 / TILE);
    const rng = new RNG((Math.random() * 1e9) | 0);
    const picked = this.vanillaSpawner.spawn(p.cx, p.cy, rng, viewHalfW, viewHalfH);
    if (!picked) return;
    // 骷髅商（NPC.cs:4906-4910）：转 TownNPC 进 npcs 桶；场上已有则跳过（CountNPCS(453)==0）
    if (picked.vanillaId === 453) {
      if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === 'skeleton_merchant')) return;
      const sm = new TownNPC('skeleton_merchant', this.vanillaSpawner.currentSpawnX * TILE + 8, (this.vanillaSpawner.currentSpawnY + 1) * TILE);
      this.entities.add(sm, 'npcs');
      return;
    }
    // 放置：原版 SpawnNPC 直接落位；水生/蠕虫分支由链内返回的怪自带 AI 处理落脚
    const st = w.store;
    const ptx = this.vanillaSpawner.currentSpawnX;
    const pty = this.vanillaSpawner.currentSpawnY;
    if (ptx < 2 || pty < 2 || ptx > st.w - 3 || pty > st.h - 3) return;
    if (picked.vanilla?.aiStyle === 6) {
      // 蠕虫族：段链（AI_006 的 NewNPC 链）
      picked.x = ptx * TILE + 8 - picked.w / 2;
      picked.y = pty * TILE + 8 - picked.h / 2;
      picked.id = this.entities.nextId++;
      this.entities.enemies.push(picked);
      const segs = Enemy.spawnWormChain(picked, 5 + ((rng.next() * 4) | 0));
      for (const seg of segs) { seg.id = this.entities.nextId++; this.entities.enemies.push(seg); }
      return;
    }
    if (picked.vanilla?.aiStyle === 16 || picked.vanilla?.aiStyle === 18) {
      // 水生族：找水下格
      for (let dy = -8; dy <= 100; dy++) {
        const yy = pty + dy;
        if (yy < 2 || yy > st.h - 3) continue;
        if (st.liquid[st.idx(ptx, yy)] > 150 && !st.isSolid(ptx, yy)) {
          picked.x = ptx * TILE + 8 - picked.w / 2;
          picked.y = yy * TILE;
          picked.id = this.entities.nextId++;
          this.entities.enemies.push(picked);
          return;
        }
      }
      return;
    }
    if (picked.vanilla?.critter) {
      // 小动物进 critters 桶（不计怪上限）
      let groundY = pty;
      while (groundY > 2 && st.isSolid(ptx, groundY)) groundY--;
      picked.x = ptx * TILE + 8 - picked.w / 2;
      picked.y = groundY * TILE - picked.h;
      picked.id = this.entities.nextId++;
      this.entities.add(picked, 'critters');
      return;
    }
    // 普通怪：落脚位（原版 HasTileSpawnSpace：上方两格净空）
    let spawnY = -1;
    for (let dy = -4; dy <= 8; dy++) {
      const yy = pty + dy;
      if (yy < 2 || yy > st.h - 3) continue;
      const dry = st.liquid[st.idx(ptx, yy)] <= 40 && st.liquid[st.idx(ptx, yy - 1)] <= 40;
      const clear = !st.isSolid(ptx, yy) && !st.isSolid(ptx, yy - 1) && dry;
      const ground = st.isSolid(ptx, yy + 1) || st.isSolid(ptx, yy + 2);
      const flying = picked.def.flying;
      if (flying) {
        if (!st.isSolid(ptx, yy) && dry) { spawnY = yy; break; }
      } else if (clear && ground) {
        spawnY = yy; break;
      }
    }
    if (spawnY < 0) return;
    picked.x = ptx * TILE + 8 - picked.w / 2;
    picked.y = spawnY * TILE + TILE - picked.h;
    picked.id = this.entities.nextId++;
    this.entities.enemies.push(picked);
  }

  // ================= NPC =================

  // ================= 城镇 NPC 入驻系统（Main.UpdateTime_SpawnTownNPCs :65021 +
  // WorldGen.SpawnTownNPC :5345 / SpawnHomelessNPC :4992 语义；房屋判定 Housing.ts） =================

  /** 各 NPC 入驻条件（NPC.SpawnAllowed_* , NPC.cs:7046-7170 1:1） */
  private townNpcSpawnAllowed(key: string): boolean {
    const p = this.player;
    switch (key) {
      case 'guide':
        return true;
      case 'merchant': {
        // SpawnAllowed_Merchant：玩家硬币合计 ≥ 5000 铜（50 银；71铜/72银/73金/74铂）
        let copper = 0;
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          if (def.key === 'coin_copper') copper += s.stack;
          else if (def.key === 'coin_silver') copper += s.stack * 100;
          else if (def.key === 'coin_gold') copper += s.stack * 10000;
          if (copper >= 5000) return true;
        }
        return false;
      }
      case 'nurse':
        // SpawnAllowed_Nurse：statLifeMax/20 > 5（用过生命水晶，生命上限 >100）
        return Math.floor(p.maxHp / 20) > 5;
      case 'arms_dealer': {
        // SpawnAllowed_ArmsDealer：背包有子弹系物品（ammo/useAmmo == AmmoID.Bullet 14）
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          const vid = def.vid ?? viIdFromKey(def.key);
          const c = vid >= 0 ? itemCombat(vid) : null;
          if (c && (c.ammo === AMMO_BULLET || c.useAmmo === AMMO_BULLET)) return true;
        }
        return false;
      }
      case 'demolitionist': {
        // SpawnAllowed_Demolitionist：背包有炸弹系物品（ItemsThatCountAsBombs 表近似）
        const bombKeys = new Set(['bomb', 'vi_166_bomb', 'vi_167_dynamite', 'vi_168_grenade',
          'vi_4423_scarab_bomb', 'vi_4824_wet_bomb', 'vi_453_bomb_statue']);
        return p.inv.slots.some((s) => s && bombKeys.has(ITEM_DEFS[s.id]?.key ?? ''));
      }
      case 'dryad':
        // 任意邪恶 Boss 已败（vanilla downedBoss1/2/3 = EoC/世吞|克脑/骷髅王）
        return !!(this.world.flags['downed_4'] || this.world.flags['downed_13']
          || this.world.flags['downed_266'] || this.world.flags['downed_35']
          || this.world.flags.downedSkeletron || this.world.flags.downedEyeOfCthulhu);
      case 'clothier':
        // 裁缝(cs:65310)：骷髅王已败（击败后守卫老人消失，裁缝解锁）
        return !!(this.world.flags['downed_35'] || this.world.flags.downedSkeletron);
      case 'truffle':
        // 松露人(cs:65322)：困难模式（原版还要求发光蘑菇生物群系有空房，暂按全域找房）
        return !!this.world.flags.hardMode;
      case 'steampunker':
        // 蒸汽朋克(cs:65303)：任一机械 Boss 已败（双子 125/126 / 铁骷髅 127 / 毁灭者 134）
        return !!(this.world.flags['downed_125'] || this.world.flags['downed_126']
          || this.world.flags['downed_127'] || this.world.flags['downed_134']);
      case 'witch_doctor':
        // 巫医(cs:65298)：蜂后已败（NPC 222）
        return !!this.world.flags['downed_222'];
      case 'cyborg':
        // 电子人(cs:65319)：困难模式 + 世纪之花已败（262）
        return !!this.world.flags.hardMode && !!this.world.flags['downed_262'];
      case 'pirate':
        // 海盗(cs:65316)：海盗入侵已胜——入侵胜利记账置 downedPirates（见入侵胜利块），
        // 自然触发走海盗 roll（hardMode + altarCount>0）
        return !!this.world.flags['downedPirates'];
      case 'santa_claus':
        // 圣诞老人(cs:65277)：圣诞季（现实日期 12/15-31，checkXMas）
        return this.world.clock.xMas;
      case 'zoologist':
        // 动物学家(cs:65375)：图鉴完成度 ≥10%（Main.GetBestiaryProgressReport = 已解锁条目/
        // 总条目；数据层 data/Bestiary.ts。原版另有 vampireSeed 世界分支——种子系统未实装）
        return this.world.bestiary.completion().percent >= 0.1;
      case 'party_girl':
        // 派对女孩(cs:65249-65253)：每轮 1/40 重掷（另需在场 NPC ≥20，见优先级链）
        return Math.random() < 1 / 40;
      case 'dyer': {
        // SpawnAllowed_DyeTrader（cs:7096）：背包有染料/染料物（dye>0 或 1107-1120/3385-3388）
        for (const s of p.inv.slots) {
          if (!s) continue;
          const def = ITEM_DEFS[s.id];
          if (!def) continue;
          const vid = def.vid ?? viIdFromKey(def.key);
          if ((vid >= 1107 && vid <= 1120) || (vid >= 3385 && vid <= 3388)) return true;
        }
        return false;
      }
      case 'goblin_tinkerer':
        return !!this.world.flags['savedGoblin']; // 救援系统（bound NPC 解救）置位
      case 'wizard':
        return !!this.world.flags['savedWizard'];
      case 'mechanic':
        return !!this.world.flags['savedMech'];
      case 'stylist':
        return !!this.world.flags['savedStylist'];
      case 'tax_collector':
        return !!this.world.flags['savedTaxCollector'];
      case 'golfer':
        return !!this.world.flags['savedGolfer'];
      case 'princess': {
        // 公主(cs:65241 flag9)：下列全部在场才解锁
        const all = ['merchant', 'nurse', 'dryad', 'arms_dealer', 'guide', 'demolitionist',
          'clothier', 'steampunker', 'dyer', 'party_girl', 'cyborg', 'painter', 'witch_doctor',
          'pirate', 'stylist', 'goblin_tinkerer', 'wizard', 'mechanic', 'truffle',
          'tax_collector', 'golfer', 'zoologist'];
        return all.every((k) => this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === k));
      }
      default:
        return false;
    }
  }

  /** 入驻轮（每 7200 tick）：①无家 NPC 见空房入住（QuickFindHome）
   *  ②按优先级链选一名待入驻者 ③有房则入住房内、无房但有入住者则流浪生成 */
  private updateTownNpcArrival() {
    // 入侵/月事件进行中暂停城镇 NPC 入驻（SpawnHomelessNPC :4987 门；月事件原版经
    // !dayTime 间接压制——本入驻轮无昼夜门，显式补 moonEventActive）
    if (invasionActive(this.world) || moonEventActive(this.world)) return;
    const npcs = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead) as TownNPC[];
    const has = (key: string) => npcs.some((n) => n.npcKey === key);
    const homes = npcs.filter((n) => n.home).map((n) => n.home!);
    const st = this.world.store;

    // ①' 困难模式开启后补放被绑巫师（原版仅困难世界放置）
    if (this.world.flags.hardMode) {
      const s = this.findBoundSpotByDepth(Math.floor(this.world.rockLevel) + 60, st.h - 350);
      if (s) this.placeBoundNpc('wizard', 'savedWizard', s[0], s[1]);
    }

    // ① QuickFindHome（Main.cs:65072：每轮对未安家 NPC 找房入住）
    // bound（被绑待救）不入住不搬动——原版 AI_007 bound 态原地，否则五个救援 NPC
    // 会被塞进同一间空房叠在一点（读档/新世界 7200 tick 后必现）
    for (const n of npcs) {
      if (n.home || n.bound || n.npcKey === 'old_man') continue;
      const house = findFreeHouse(st, homes, this.world.spawnX, this.world.spawnY);
      if (!house) break;
      n.home = { x: house.standX, y: house.standY };
      n.leashHome = true; // 有家者白天在家附近游走
      homes.push(n.home);
      n.x = house.standX * TILE + 8 - n.w / 2;
      n.y = (house.standY + 1) * TILE - n.h;
    }

    // ② 优先级链（Main.cs num42 完整顺序；护士/爆破手要求商人在场，
    //    染料商 ≥4 人、油漆工 ≥8 人、派对女孩 ≥20 人且 1/40 重掷）
    const merchantHere = has('merchant');
    const allow = (key: string) => this.townNpcSpawnAllowed(key);
    const n = npcs.length; // num40：在场城镇 NPC 总数（含守卫老人，原版同）
    const prio: Array<[string, boolean]> = [
      ['guide', !has('guide')],
      ['merchant', !merchantHere && allow('merchant')],
      ['nurse', !has('nurse') && merchantHere && allow('nurse')],
      ['arms_dealer', !has('arms_dealer') && allow('arms_dealer')],
      ['goblin_tinkerer', !has('goblin_tinkerer') && allow('goblin_tinkerer')],
      ['wizard', !has('wizard') && allow('wizard')],
      ['dryad', !has('dryad') && allow('dryad')],
      ['demolitionist', !has('demolitionist') && merchantHere && allow('demolitionist')],
      ['witch_doctor', !has('witch_doctor') && allow('witch_doctor')],
      ['steampunker', !has('steampunker') && allow('steampunker')],
      ['mechanic', !has('mechanic') && allow('mechanic')],
      ['stylist', !has('stylist') && allow('stylist')],
      ['cyborg', !has('cyborg') && allow('cyborg')],
      ['pirate', !has('pirate') && allow('pirate')],
      ['clothier', !has('clothier') && allow('clothier')],
      ['dyer', !has('dyer') && n >= 4 && allow('dyer')],
      ['painter', !has('painter') && n >= 8],
      ['party_girl', !has('party_girl') && n >= 20 && allow('party_girl')],
      ['santa_claus', !has('santa_claus') && allow('santa_claus')],
      ['golfer', !has('golfer') && allow('golfer')],
      ['tax_collector', !has('tax_collector') && allow('tax_collector')],
      ['truffle', !has('truffle') && allow('truffle')],
      ['zoologist', !has('zoologist') && allow('zoologist')],
      ['princess', !has('princess') && allow('princess')],
    ];
    const pick = prio.find(([, ok]) => ok)?.[0];
    if (!pick) return;

    // ③ 入住 / 流浪生成
    const house = findFreeHouse(st, homes, this.world.spawnX, this.world.spawnY);
    const id = TOWN_NPC_IDS[pick].id;
    const name = Lang.npcName(id) ?? pick;
    if (house) {
      // SpawnTownNPC：房间合格且无人 → 生成在房内、安家（Announcement.HasArrived）
      const npc = new TownNPC(pick, house.standX * TILE + 8, (house.standY + 1) * TILE);
      npc.home = { x: house.standX, y: house.standY };
      npc.leashHome = true;
      this.entities.add(npc, 'npcs');
      this.newText(Lang.text('Announcement.HasArrived', name), 50, 125, 255);
    } else {
      // SpawnHomelessNPC（:4992）：白天且当前无流浪 NPC 时，在已入住者的家附近生成；
      // 无人入住（无锚点）则不生成——新世界只有向导（WorldGen.cs:20036 出生）
      if (!this.world.clock.isDay || homes.length === 0) return;
      if (npcs.some((n) => !n.home)) return;
      const anchor = homes[Math.floor(Math.random() * homes.length)];
      const ax = anchor.x + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 50));
      if (ax < 3 || ax > st.w - 4) return;
      let ay = Math.max(4, anchor.y - 20);
      const limit = Math.min(st.h - 3, anchor.y + 20);
      while (ay < limit && !st.isSolid(ax, ay)) ay++;
      if (ay >= limit) return;
      const npc = new TownNPC(pick, ax * TILE + 8, (ay + 1) * TILE);
      this.entities.add(npc, 'npcs');
      this.newText(Lang.text(`Announcement.HomelessArrived_${Math.floor(Math.random() * 6)}`, name), 50, 125, 255);
    }
  }

  /** 右键与附近 NPC 交谈(Player.SetTalkNPC Player.cs:4180 语义:
 *  光标命中 NPC 命中盒(±8px)+ 距离 3.5 格内)→ 打开原版对话框 */
  private talkToNearbyNpc(ctX: number, ctY: number): boolean {
    const p = this.player;
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (Math.hypot(npc.cx - p.cx, npc.cy - p.cy) > TILE * 3.5) continue;
      const mx = (ctX + 0.5) * TILE, my = (ctY + 0.5) * TILE;
      if (mx < npc.x - 8 || mx > npc.x + npc.w + 8 || my < npc.y - 8 || my > npc.y + npc.h + 8) continue;
      if (npc.bound) { this.freeBoundNpc(npc); return true; } // 救援 NPC：右键直接解救
      this.openNpcDialog(npc);
      return true;
    }
    return false;
  }

  // ================= NPC 对话系统(SetTalkNPC + NPC.GetChat NPC.cs:94974 1:1) =================

  private dialogNpc: TownNPC | null = null;

  // ---- 下落沙族(原版 SandBallFalling 系,AI_010) ----
  /** 会下落的 tile(原版 53 沙/112 黑檀沙/116 珍珠沙/234 猩红沙/123 淤泥/224 雪泥) */
  private static readonly FALLING_TILES = new Set<number>(
    ['sand', 'v_112_ebonsand_block', 'v_116_pearlsand_block', 'v_234_crimsand_block', 'silt', 'v_224_slush_block']
      .map((k) => TILE_BY_KEY[k])
      .filter((v): v is number => v !== undefined),
  );
  /** 待检查的下落候选格(监听器入队,fixedUpdate 消费;级联自然发生:
   *  沙转投射物时的 setTile 会再次触发监听器 → 上方沙继续入队) */
  private sandQueue: Array<[number, number]> = [];

  /** 打开对话框:台词/按钮按 NPC 类型生成,UI 经 onNpcDialog 渲染 */
  private openNpcDialog(npc: TownNPC) {
    this.dialogNpc = npc;
    // 图鉴聊天解锁（NPC.cs:45223 SetTalkNPC→RegisterChatStartWith：与城镇 NPC 对话即记）
    this.world.bestiary.registerChat(npc.vanillaId);
    npc.talking = true;  // 原版 AI_007:53721 对话中站定面向玩家
    npc.talkCooldown = 30;
    this.sfx.play('menuOpen'); // 对话面板打开音（原版 UI 面板开合语义 id 10/11）
    const typeName = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    // FullName 语义（NPC.FullName:6657 + Game.NPCTitle，zh "{1}{0}"=类型名+个人名）
    const name = npc.givenName ? Lang.text('Game.NPCTitle', npc.givenName, typeName) : typeName;
    const buttons: Array<{ id: 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'close'; label: string }> = [];
    // 商店按钮(NPCInteractions.cs:489-513 Shop 注册表覆盖的全部 NPC)
    if (Game.SHOPSTOCK[String(npc.vanillaId)]) buttons.push({ id: 'shop', label: Lang.inter(28) });
    if (npc.npcKey === 'nurse') buttons.push({ id: 'heal', label: Lang.inter(54) });       // 治疗
    if (npc.npcKey === 'tax_collector') buttons.push({ id: 'collect', label: Lang.inter(89) }); // 收集税款
    // 哥布林工匠：重铸（NPCChatText_TinkererReforge Main.cs:39431）
    if (npc.npcKey === 'goblin_tinkerer') buttons.push({ id: 'reforge', label: Lang.inter(19) });
    // 守卫老人:夜晚出现「诅咒」(白天只闲聊,原版 GetChat 语义)
    if (npc.npcKey === 'old_man' && !this.world.clock.isDay && !this.world.flags.hardMode) {
      buttons.push({ id: 'curse', label: Lang.inter(50) });                                 // 诅咒
    }
    buttons.push({ id: 'close', label: Lang.inter(52) });                                   // 关闭
    this.cb.onNpcDialog?.(name, this.formatDialogTags(this.townNpcChat(npc)), buttons, portraitUrl(npc.vanillaId));
  }

  /** HasSpecialEventText 类目键（NPC.cs 各分支的字符串字面量：type → "Xxx"）。
   *  仅原版接了事件文案的城镇 NPC 在表；酒馆老板 550/钓鱼娃 369 无对话分支不列 */
  private static readonly SPECIAL_TEXT_CATEGORY: Record<number, string> = {
    17: 'Merchant', 18: 'Nurse', 19: 'ArmsDealer', 20: 'Dryad', 38: 'Demolitionist',
    54: 'Clothier', 107: 'GoblinTinkerer', 108: 'Wizard', 124: 'Mechanic', 22: 'Guide',
    142: 'Santa', 160: 'Truffle', 178: 'Steampunker', 207: 'DyeTrader', 208: 'PartyGirl',
    209: 'Cyborg', 227: 'Painter', 228: 'WitchDoctor', 229: 'Pirate', 353: 'Stylist',
    368: 'TravellingMerchant', 453: 'SkeletonMerchant', 441: 'TaxCollector',
    588: 'Golfer', 633: 'BestiaryGirl', 663: 'Princess',
  };

  /** NPC.HasSpecialEventText（NPC.cs:96081-96105 1:1）：五环境态按原版顺序各 1/3
   *  掷骰，命中且语言包有 "<Cat>SpecialText.<Event>" 池 → 随机一条。
   *  墓园（ZoneGraveyard）→ 派对（PartyIsUp；HasNoPartyText 表未移植——本表 NPC
   *  全部有派对文案）→ 雨（raining 且非风暴）→ 风日（IsItAHappyWindyDay）→ 风暴 */
  private npcSpecialEventText(npc: TownNPC): string | null {
    const cat = Game.SPECIAL_TEXT_CATEGORY[npc.vanillaId];
    if (!cat) return null;
    const wd = this.world.weather;
    const pick = (suffix: string): string | null =>
      (Math.random() < 1 / 3 ? Lang.specialText(`${cat}SpecialText.${suffix}`) : null);
    if (this.scene.zoneGraveyard) { const t = pick('Graveyard'); if (t) return t; }
    if (partyIsUp(this.partyState)) { const t = pick('Party'); if (t) return t; }
    if (wd.raining && !wd.shouldUseStormMusic) { const t = pick('Rain'); if (t) return t; }
    if (wd.shouldUseWindyDayMusic) { const t = pick('Windy'); if (t) return t; }
    if (wd.shouldUseStormMusic) { const t = pick('Storm'); if (t) return t; }
    return null;
  }

  /** 台词 = NPC.GetChat(NPC.cs:94974+) type 17/18/22/37/19/20/38 分支 1:1。
   *  环境事件文案（HasSpecialEventText 墓园/派对/雨/风日/风暴 + 向导日食/史莱姆雨/
   *  灯笼夜 Lantern1/2）已接；DD2 段跳过，走常规池。
   *  曾把未覆盖类型全部落到守卫老人自建文案池——向导会说出"解除诅咒"台词,已修 */
  private townNpcChat(npc: TownNPC): string {
    const p = this.player;
    const w = this.world;
    const dialog = (n: number) => Lang.text(`LegacyDialog.${n}`);
    const rN = (n: number) => Math.floor(Math.random() * n);
    const r3 = () => rN(3);
    const r2 = () => (Math.random() < 0.5 ? 0 : 1);
    // GetChat 在场旗标(cs:94996-95046):其他城镇 NPC 是否在场
    const present = (id: number) =>
      this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.vanillaId === id);
    // downedBoss1/2/3(cs 全局):EoC / 世吞|克脑 / 骷髅王
    const boss1 = !!(w.flags['downed_4'] || w.flags.downedEyeOfCthulhu);
    const boss2 = !!(w.flags['downed_13'] || w.flags['downed_266']);
    const boss3 = !!(w.flags['downed_35'] || w.flags.downedSkeletron);
    // HasSpecialEventText（cs:96081-96105，各类型分支首位）：哥布林/巫师/机械师
    // 的流浪态优先于事件文案（cs:95286/95336/95429 homeless 先行），其余类型事件优先
    const HOMELESS_FIRST = new Set([107, 108, 124]);
    if (!(HOMELESS_FIRST.has(npc.vanillaId) && !npc.home)) {
      const special = this.npcSpecialEventText(npc);
      if (special) return special;
    }
    if (npc.vanillaId === 17) {
      // 商人(NPC.cs:95077-95105)
      if (!boss1 && r3() === 0) {
        if (p.maxHp < 200) return dialog(1);
        if (p.defense > 10) return dialog(3);
        return dialog(2);
      }
      if (w.clock.isDay) {
        const f = (w.clock.timeOfDay - 0.25) / 0.5; // 昼内进度 0-1(原版 Main.time/43200)
        if (f < 16200 / 43200) return dialog(4 + r3());   // 清晨 4-6
        if (f > 37800 / 43200) return dialog(7 + r3());   // 傍晚 7-9
        return dialog(10 + r3());                          // 白昼 10-12
      }
      const nf = (((w.clock.timeOfDay - Clock.DUSK) % 1) + 1) % 1 / 0.375; // 夜内进度 0-1（32400t 窗口）
      if (nf < 9720 / 43200) return dialog(r2() ? 19 : 18);
      if (nf > 22680 / 43200) return dialog(r2() ? 21 : 20);
      return dialog(22 + r3());                            // 深夜 22-24
    }
    if (npc.vanillaId === 18) {
      // 护士(NPC.cs:95104-95190):三成概率提醒老人(!downedBoss3);按血量分档
      if (r3() === 0 && !boss3) return dialog(32);
      const ratio = p.hp / p.maxHp;
      if (ratio < 0.33) return dialog(36 + Math.floor(Math.random() * 5)); // 36-40
      if (ratio < 0.66) return dialog(41 + Math.floor(Math.random() * 7)); // 41-47
      return dialog(48 + Math.floor(Math.random() * 4));                   // 48-51
    }
    if (npc.vanillaId === 22) {
      // 向导(cs:95473-95489)：血月 170-172 → 灯笼夜 Lantern1/2（cs:95480：
      // LanternsUp && !downedMoonlord → Lantern1 / LanternsUp && downedMoonlord →
      // Lantern2）→ 日食 Eclipse → 史莱姆雨 SlimeRain → 夜晚 173 → 白天
      // hardMode Chatter 池（8 选 1）→ 白天 174-176
      if (w.clock.bloodMoon) return dialog(170 + r3());
      if (LanternNight.lanternsUp) {
        return Lang.text(w.flags['downed_398'] ? 'GuideSpecialText.Lantern2' : 'GuideSpecialText.Lantern1');
      }
      if (w.clock.eclipse) return Lang.text('GuideSpecialText.Eclipse');
      if (w.weather.slimeRain) return Lang.text('GuideSpecialText.SlimeRain');
      if (!w.clock.isDay) return dialog(173);
      // hardMode Chatter 池（原版双段：Chatter_1 需税务官在场 / Chatter_2 任意，各 1/8
      // ——此处合并为池随机 1/8）
      if (w.flags.hardMode && Math.random() < 1 / 8) {
        return Lang.chatter('GuideChatter') ?? dialog(174 + r3());
      }
      return dialog(174 + r3());
    }
    if (npc.vanillaId === 37) {
      // 守卫老人(cs:95224-95240):白天 82-84;夜晚(生命<300 或防御<10)85-88,否则 89-92
      if (!w.clock.isDay) {
        return dialog(p.maxHp < 300 || p.defense < 10 ? 85 + Math.floor(Math.random() * 4) : 89 + Math.floor(Math.random() * 4));
      }
      return dialog(82 + r3());
    }
    if (npc.vanillaId === 19) {
      // 军火商(cs:95195-95203):向导在场+已败骷髅王+非困难 58;护士/树妖/爆破手在场随机互cue;
      // 常规池 66-68(血月 64/65 未实现)
      if (present(22) && boss3 && !w.flags.hardMode) return dialog(58);
      if (present(18) && Math.floor(Math.random() * 5) === 0) return dialog(59);
      if (present(18) && Math.floor(Math.random() * 5) === 0) return dialog(60);
      if (present(20) && Math.floor(Math.random() * 5) === 0) return dialog(61);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(62);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(63);
      if (w.clock.bloodMoon) return dialog(rN(2) === 0 ? 64 : 65);   // 血月(cs:95195)
      return dialog(66 + r3());
    }
    if (npc.vanillaId === 20) {
      // 树妖(cs:95204-95245):未败邪恶 Boss 69/332(猩红);军火商/商人/老人在场互cue;
      // 常规池 77-81(非猩红 77 / 猩红 333 起手)
      if (!boss2 && r3() === 0) return dialog(w.crimson ? 332 : 69);
      if (present(19) && Math.floor(Math.random() * 6) === 0) return dialog(70);
      if (present(17) && Math.floor(Math.random() * 6) === 0) return dialog(71);
      if (present(37) && Math.floor(Math.random() * 6) === 0) return dialog(72);
      if (w.clock.bloodMoon) return dialog(73 + rN(4));              // 血月(cs:95204)
      const r = Math.floor(Math.random() * 5);
      return r === 0 ? dialog(w.crimson ? 333 : 77) : dialog(77 + r);
    }
    if (npc.vanillaId === 38) {
      // 爆破手(cs:95246-95266):未败邪恶 Boss 93;军火商/护士/树妖在场互cue;
      // 夜晚 101-104;白天 105-109
      if (!boss2 && r3() === 0) return dialog(93);
      if (w.clock.bloodMoon) return dialog(94 + rN(3));              // 血月(cs:95246)
      if (present(19) && Math.floor(Math.random() * 5) === 0) return dialog(97);
      if (present(19) && Math.floor(Math.random() * 5) === 0) return dialog(98);
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(99);
      if (present(20) && Math.floor(Math.random() * 4) === 0) return dialog(100);
      if (!w.clock.isDay) return dialog(101 + Math.floor(Math.random() * 4));
      return dialog(105 + Math.floor(Math.random() * 5));
    }
    if (npc.vanillaId === 54) {
      // 裁缝(cs:95267-95282):无机械师在场 110;树妖在场 237;护士在场 112;常规 114-119
      // (血月 111 / 玩家头部时装 113 未实现跳过)
      if (!present(124) && Math.floor(Math.random() * 2) === 0) return dialog(110);
      if (present(160) && Math.floor(Math.random() * 6) === 0) return dialog(237);
      if (w.clock.bloodMoon) return dialog(111);                     // 血月(cs:95267)
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(112);
      return dialog(114 + rN(6));
    }
    if (npc.vanillaId === 107) {
      // 哥布林工匠(cs:95283-95323):流浪 121-125;机械师/造型师在场互cue;
      // 常规 夜 127-131 / 昼 132-136 + GoblinTinkererChatter 池
      if (!npc.home) return dialog(121 + rN(5));
      if (present(124) && Math.floor(Math.random() * 5) === 0) return dialog(126);
      if (present(353) && Math.floor(Math.random() * 5) === 0) return dialog(309);
      const r = rN(6); // 5 常规 + Chatter 池 1 条
      if (r >= 5) return Lang.chatter('GoblinTinkererChatter') ?? dialog(127);
      return dialog((w.clock.isDay ? 132 : 127) + r);
    }
    if (npc.vanillaId === 108) {
      // 巫师(cs:95324-95377):流浪 138-141(女性角色 139);互cue 142-147(按角色性别分档);
      // 夜 148-150 / 昼 151-155(幸运/DD2 文本未实现跳过)
      const male = (p.appearance?.skinVariant ?? 0) === 0;
      if (!npc.home) {
        const n5 = rN(3);
        return n5 === 0 ? dialog(138) : n5 === 1 && !male ? dialog(139) : dialog(138 + n5);
      }
      if (male && present(22) && Math.floor(Math.random() * 6) === 0) return dialog(142);
      if (male && present(38) && Math.floor(Math.random() * 6) === 0) return dialog(143);
      if (male && present(107) && Math.floor(Math.random() * 6) === 0) return dialog(144);
      if (!male && present(18) && Math.floor(Math.random() * 6) === 0) return dialog(145);
      if (!male && present(124) && Math.floor(Math.random() * 6) === 0) return dialog(146);
      if (!male && present(20) && Math.floor(Math.random() * 6) === 0) return dialog(147);
      if (w.clock.isDay) return dialog(151 + rN(5));
      return dialog(148 + rN(3));
    }
    if (npc.vanillaId === 124) {
      // 机械师(cs:95377-95420):流浪 157-160;哥布林/军火商互cue 165/166;常规 167-169 + Chatter 池
      if (!npc.home) return dialog(157 + rN(4));
      if (w.clock.bloodMoon) return dialog(161 + rN(4));             // 血月(cs:95377)
      if (present(107) && Math.floor(Math.random() * 6) === 0) return dialog(165);
      if (present(19) && Math.floor(Math.random() * 6) === 0) return dialog(166);
      const r = rN(4); // 3 常规 + Chatter 池 1 条
      if (r >= 3) return Lang.chatter('MechanicChatter') ?? dialog(167);
      return dialog(167 + r);
    }
    if (npc.vanillaId === 142) {
      // 圣诞老人(cs:95490-95509):224-226
      return dialog(224 + rN(3));
    }
    if (npc.vanillaId === 160) {
      // 松露人(cs:95510-95543):树妖/裁缝在场互cue 238/236;常规池 231/233/234/235/240/241
      if (present(20) && Math.floor(Math.random() * 6) === 0) return dialog(238);
      if (present(54) && Math.floor(Math.random() * 6) === 0) return dialog(236);
      return dialog([231, 233, 234, 235, 240, 241][rN(6)]);
    }
    if (npc.vanillaId === 178) {
      // 蒸汽朋克(cs:95544-95567):电子人/海盗在场互cue 246/247;常规池 242-244/248/249
      if (present(209) && Math.floor(Math.random() * 6) === 0) return dialog(246);
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(247);
      return dialog([242, 243, 244, 248, 249][rN(5)]);
    }
    if (npc.vanillaId === 207) {
      // 染料商(cs:95568-95581):海盗在场 260;常规 257-259
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(260);
      return dialog(257 + rN(3));
    }
    if (npc.vanillaId === 208) {
      // 派对女孩(cs:95582-95606):男性角色 268;造型师在场 310;常规池 265-267/269-272
      if ((p.appearance?.skinVariant ?? 0) === 0 && Math.floor(Math.random() * 5) === 0) return dialog(268);
      if (present(353) && Math.floor(Math.random() * 5) === 0) return dialog(310);
      return dialog([265, 266, 267, 269, 270, 271, 272][rN(7)]);
    }
    if (npc.vanillaId === 209) {
      // 电子人(cs:95607-95637):海盗/蒸汽朋克在场互cue 284/283;常规池 280-282/285/286 + Chatter 池
      if (present(229) && Math.floor(Math.random() * 6) === 0) return dialog(284);
      if (present(178) && Math.floor(Math.random() * 6) === 0) return dialog(283);
      const r = rN(6); // 5 常规 + Chatter 池 1 条
      if (r >= 5) return Lang.chatter('CyborgChatter') ?? dialog(280);
      return dialog([280, 281, 282, 285, 286][r]);
    }
    if (npc.vanillaId === 227) {
      // 油漆工(cs:95638-95659):困难 250;派对女孩在场 251;常规 252-256
      if (w.flags.hardMode && Math.floor(Math.random() * 7) === 0) return dialog(250);
      if (present(208) && Math.floor(Math.random() * 6) === 0) return dialog(251);
      return dialog(252 + rN(5));
    }
    if (npc.vanillaId === 228) {
      // 巫医(cs:95660-95682):护士在场 263;常规 261/262/264(DD2 专项文本未实现,档位 3 回落 261)
      if (present(18) && Math.floor(Math.random() * 4) === 0) return dialog(263);
      const r = rN(4);
      return r === 3 ? dialog(261) : dialog([261, 262, 264][r]);
    }
    if (npc.vanillaId === 229) {
      // 海盗(cs:95683-95809):女性角色 276;常规池 273-275/277-279 + Chatter 池
      const r = rN(7); // 6 常规 + Chatter 池 1 条
      if (r >= 6) return Lang.chatter('PirateChatter') ?? dialog(273);
      if ((p.appearance?.skinVariant ?? 0) !== 0 && Math.floor(Math.random() * 5) === 0) return dialog(276);
      return dialog([273, 274, 275, 277, 278, 279][r]);
    }
    if (npc.vanillaId === 353) {
      // 造型师(cs:95810-95958):清晨 311;男性 293/300、女性 291/292/312;
      // 四人组(派对女孩+机械师+护士+军火商)307;派对女孩/爆破手/电子人互cue 302/303/308;
      // 月相常规池(287-290/294 | 295-298 | 299/301/313/314)+ StylistChatter 池
      if (w.clock.bloodMoon) return dialog(304 + rN(3));             // 血月(cs:95820)
      if (w.clock.isDay && (w.clock.timeOfDay - 0.25) / 0.5 < 16200 / 43200 && r3() === 0) return dialog(311);
      const male = (p.appearance?.skinVariant ?? 0) === 0;
      if (male && r3() === 0) return dialog([293, 300][rN(2)]);
      if (!male && r3() === 0) return dialog([291, 292, 312][rN(3)]);
      if (present(208) && present(124) && present(18) && present(19) && Math.floor(Math.random() * 5) === 0) return dialog(307);
      if (present(208) && Math.floor(Math.random() * 5) === 0) return dialog(302);
      if (present(38) && Math.floor(Math.random() * 5) === 0) return dialog(303);
      if (present(209) && Math.floor(Math.random() * 5) === 0) return dialog(308);
      const mp = w.clock.moonPhase;
      const pool = mp < 3 ? [287, 288, 289, 290, 294] : mp < 6 ? [295, 296, 297, 298] : [299, 301, 313, 314];
      const r = rN(pool.length + 1);
      if (r >= pool.length) return Lang.chatter('StylistChatter') ?? dialog(pool[0]);
      return dialog(pool[r]);
    }
    if (npc.vanillaId === 441) {
      // 税务员(cs:95980-95995):树妖/军火商/爆破手/商人在场互cue 371-374;常规 364-370
      if (Math.floor(Math.random() * 6) === 0 && present(20)) return dialog(371);
      if (Math.floor(Math.random() * 6) === 0 && present(19)) return dialog(372);
      if (Math.floor(Math.random() * 6) === 0 && present(38)) return dialog(373);
      if (Math.floor(Math.random() * 6) === 0 && present(17)) return dialog(374);
      return dialog(364 + rN(7));
    }
    if (npc.vanillaId === 588) {
      // 高尔夫球手(cs:95996-96004):1/3 任务分数档闲聊(分数系统未实现 → 初学者档),
      // 其余 GolferChatter 池
      if (r3() === 0) return Lang.chatter('GolferQuestsChatterBeginner') ?? Lang.chatter('GolferChatter') ?? '……';
      return Lang.chatter('GolferChatter') ?? '……';
    }
    if (npc.vanillaId === 633) {
      // 动物学家(cs:96005-96006):血月或满月(moonPhase==0)夜晚变身狐狸用 Lycantrope 池
      const lycan = w.clock.bloodMoon || (!w.clock.isDay && w.clock.moonPhase === 0);
      return Lang.chatter(lycan ? 'BestiaryGirlLycantropeChatter' : 'BestiaryGirlChatter') ?? '……';
    }
    if (npc.vanillaId === 663) {
      // 公主(cs:96007-96008):PrincessChatter 池
      return Lang.chatter('PrincessChatter') ?? '……';
    }
    if (npc.vanillaId === 368) {
      // 旅行商人(cs:95962-95964):向导/商人/裁缝在场互cue 319-321;常规 322-330
      if (present(22) && Math.floor(Math.random() * 5) === 0) return dialog(319);
      if (present(17) && Math.floor(Math.random() * 5) === 0) return dialog(320);
      if (present(54) && Math.floor(Math.random() * 5) === 0) return dialog(321);
      return dialog(322 + rN(9));
    }
    if (npc.vanillaId === 453) {
      // 骷髅商(cs:95948-95959):常规 356-363 + SkeletonMerchantChatter 池
      const r = rN(9); // 8 常规 + Chatter 池 1 条
      if (r >= 8) return Lang.chatter('SkeletonMerchantChatter') ?? dialog(356);
      return dialog(356 + r);
    }
    // 其余类型(旅行商人368/骷髅商453/钓鱼娃369 等非房屋 NPC 未注册,不可达)
    return '……';
  }

  /** LegacyDialog 命名占位符替换（原版 LocalizedText 显示期 Format 语义）：
   *  {PlayerName}=主角名；{Guide} 等 = 对应城镇 NPC 当前名（在场实例带随机名，否则类型名）；
   *  {WorldEvilStone}=黑檀石/猩红石（按世界邪恶） */
  private formatDialogTags(s: string): string {
    const townName = (key: string): string => {
      const inst = this.entities.npcs.find(
        (n) => n instanceof TownNPC && !n.dead && (n as TownNPC).npcKey === key) as TownNPC | undefined;
      const base = Lang.npcName(TOWN_NPC_IDS[key]?.id ?? 0) ?? key;
      return inst?.givenName ? Lang.text('Game.NPCTitle', inst.givenName, base) : base;
    };
    return s
      .replace(/\{PlayerName\}/g, this.player.appearance?.name || '泰拉瑞亚')
      .replace(/\{Guide\}/g, townName('guide'))
      .replace(/\{Nurse\}/g, townName('nurse'))
      .replace(/\{Dryad\}/g, townName('dryad'))
      .replace(/\{Demolitionist\}/g, townName('demolitionist'))
      .replace(/\{ArmsDealer\}/g, townName('arms_dealer'))
      .replace(/\{Merchant\}/g, townName('merchant'))
      .replace(/\{Bartender\}/g, Lang.npcName(550) ?? '酒馆老板') // 酒馆老板未实装,恒用类型名
      .replace(/\{WorldEvilStone\}/g,
        Lang.itemName(this.world.crimson ? 836 : 61)   // ItemID.cs:3211/1661：Crimstone/Ebonstone Block
        ?? (this.world.crimson ? '猩红石' : '黑檀石'));
  }

  /** 对话框按钮(SetTalkNPC 后 UI 回调) */
  npcDialogButton(id: 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'close'): void {
    const npc = this.dialogNpc;
    if (id === 'close' || !npc) { this.closeNpcDialog(); return; }
    if (id === 'shop') { this.openNpcShop(); return; }
    if (id === 'heal') { this.nurseHeal(); return; }
    if (id === 'collect' && npc.npcKey === 'tax_collector') { this.taxCollect(); return; }
    if (id === 'reforge' && npc.npcKey === 'goblin_tinkerer') {
      // 原版 NPCChatText_TinkererReforge（Main.cs:39431）：关对话进重铸界面
      this.closeNpcDialog();
      this.cb.onReforgeOpen?.();
      return;
    }
    if (id === 'curse' && npc.npcKey === 'old_man') {
      if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
      // 原版:释放诅咒时老人消失,击败骷髅王后转为裁缝
      npc.dead = true;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.OldManScream'));
      this.closeNpcDialog();
      this.summonBossAtTx('skeletron_head', Math.floor(npc.cx / TILE));
    }
  }

  /** 城镇 NPC 社交表情（原版 ai[0]=7/19 相邻互发 EmoteBubble 的简化切片，NPC.cs:69936）：
   *  白天、空闲、地面上的 NPC 与 6 格内另一 NPC 配对，低频随机互发表情 */
  private emoteCooldown = 0;
  private tickNpcEmotes(): void {
    if (this.world.clock.isDay && --this.emoteCooldown <= 0) {
      this.emoteCooldown = 600; // 每 10s 窗口一次
      const npcs = this.entities.npcs.filter(
        (n) => n instanceof TownNPC && !n.dead && !n.bound && !n.talking) as TownNPC[];
      if (npcs.length >= 2) {
        for (let i = 0; i < npcs.length - 1; i++) {
          const a = npcs[i];
          for (let j = i + 1; j < npcs.length; j++) {
            const b = npcs[j];
            if (Math.hypot(a.cx - b.cx, a.cy - b.cy) > 6 * TILE) continue;
            // 表情池（EmoteID 实号：25 群系/90 道具/100 火/87 疑惑/89 睡意——原版社交段同源）
            const pool = [25, 90, 100, 87, 89];
            spawnEmote(a, pool[Math.floor(Math.random() * pool.length)], 180);
            spawnEmote(b, pool[Math.floor(Math.random() * pool.length)], 180);
            a.facing = b.cx < a.cx ? -1 : 1;  // 面向对方（原版社交状态朝向）
            b.facing = a.cx < b.cx ? -1 : 1;
            // 原版进入 ai[0]=7 社交态即停走；近似：重置游走计时让双方站定片刻
            a.wanderT = Math.max(a.wanderT, 220); b.wanderT = Math.max(b.wanderT, 220);
            a.vx *= 0.3; b.vx *= 0.3;
            return;
          }
        }
      }
    }
  }

  closeNpcDialog(): void {
    if (this.dialogNpc) this.dialogNpc.talking = false;
    this.dialogNpc = null;
    this.sfx.play('menuClose');
    this.cb.onNpcDialogClose?.();
  }

  // ---- 商店(Chest.SetupShop case 1 = Merchant,Chest.cs:1325+) ----

  /** 各 NPC 商店商品表（Chest.SetupShop 1:1 提取，tools/extract-shops.mjs 生成；
   *  NPCInteractions.cs:489-513 的 type→shop 槽位映射） */
  private static readonly SHOPSTOCK: Record<string, Array<{ id: number; price: number | null; cond: string | null }>> =
    (shopstockJson as { shops: Record<string, Array<{ id: number; price: number | null; cond: string | null }>> }).shops;

  /** 当前对话 NPC 的商店商品表（Chest.SetupShop 数据驱动提取，tools/extract-shops.mjs） */
  private shopStockFor(npc: TownNPC): Array<[number, number]> {
    if (npc.npcKey === 'travelling_merchant') return this.travelStock.slice();  // 动态股票
    const stock = Game.SHOPSTOCK[String(npc.vanillaId)];
    if (!stock) return [];
    const out: Array<[number, number]> = stock.filter((s) => this.shopCondOk(s.cond)).map((s) => [s.id, s.price ?? 100] as [number, number]);
    // 派对女孩灯笼夜专柜（Chest.cs:2282：LanternNight.LanternsUp → 上架 4702 放飞灯笼；
    // extract-shops.mjs 未捕获该 if 门——与 moonPhase 同类缺口，此处直接补）。
    // 原版 SetDefaults(4702) 无价格覆盖 → 按 item value 100 铜出售
    if (npc.vanillaId === 208 && LanternNight.lanternsUp) out.push([4702, 100] as [number, number]);
    // ---- 月相分档专柜（extract-shops.mjs 只记 cond:'moonPhase' 未捕获 case 值——
    //      剔除恒真条目，按 Chest.cs switch 实表补 8 相位档）----
    const phase = this.world.clock.moonPhase;
    const price = (id: number) => ITEM_VALUES[String(id)] ?? 100;
    const day = this.world.clock.isDay;
    const add = (ids: number[]) => { for (const id of ids) out.push([id, price(id)] as [number, number]); };
    if (npc.npcKey !== 'travelling_merchant') {
      // 上述条目按相位重排（JSON 无 moonPhase 条目的 NPC 也进——分档表是权威）
      switch (npc.vanillaId) {
        case 453: { // 骷髅商（Chest.cs:2780-2940）
          add([[284], [946], [3069], [4341], [285], [953], [3068], [3084]][phase]);
          add(phase % 2 === 0 ? [3001] : this.world.flags.hardMode ? [188] : [28]);
          add(!day || phase === 0 ? [3002] : [282]);
          add(phase === 0 || phase === 1 || phase === 4 || phase === 5 ? [3003] : [40]);
          add([[3310], [3313], [3312], [3311]][phase % 4]);
          add(phase === 1 || phase === 2 ? [5640] : phase === 3 || phase === 5 ? [5641] : [5642]);
          if (phase === 0 && !day) add([3043]); // 满月夜魔法灯笼（:2930-2934）
          break;
        }
        case 20: { // 树妖盆栽树（:1650-1697：moonPhase/2 三件套；提取器把相位 switch
          // 摊平成 hardMode/无门条目——先清 out 里的 4430-4441 再按相位补）
          for (let i = out.length - 1; i >= 0; i--) {
            if (out[i][0] >= 4430 && out[i][0] <= 4441) out.splice(i, 1);
          }
          add([4430, 4431, 4432, 4433, 4434, 4435, 4436, 4437, 4438, 4439, 4440, 4441].slice(
            Math.floor(phase / 2) * 3, Math.floor(phase / 2) * 3 + (this.world.flags.hardMode ? 3 : 2)));
          break;
        }
        case 54: // 裁缝套装（:1795-1923）
          if (phase === 0) { add([245, 246]); if (!day) add([1288, 1289]); }
          else if (phase === 1) add([325, 326]);
          else if (this.world.flags.hardMode) {
            if (phase === 2) add([869]);
            else if (phase === 3) add([4994, 4997]);
            else if (phase === 4) add([864, 865]);
            else if (phase === 5) add([4995, 4998]);
            else if (phase === 6) add([873, 874, 875]);
            else add([4996, 4999]);
          }
          break;
        case 124: // 机械师（:2058-2062：渔夫在场且奇相位 → 机械师钓竿）
          if (phase % 2 === 1 && this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.vanillaId === 369)) {
            add([2295]);
          }
          break;
        case 207: if (phase === 0) add([2871, 2872]); break; // 染料商满月暗影/负片染料（:2233-2237）
        case 353: if ((phase % 2 === 0) === day) add([1981]); break; // 造型师时光染料（:2720-2724）
        case 588: { // 高尔夫球手（Chest.cs:3147-3238 分数门槛 + :3216 月相画）
          const gs = this.player.golferScoreAccumulated;
          if (gs > 500) add([4092, 4093, 4094, 4039, 4265, 4599]);
          if (gs > 1000) add([4591, 4592, 4593, 4594, 4600]);
          if (gs >= 2000) {
            add([4595, 4596, 4597, 4598, 4601]);
            if (this.world.flags.downedSkeletron) add([4264]); // :3188 && downedBoss3 → 高尔夫球车
            add([[4658], [4659], [4660], [4661]][Math.floor(phase / 2)]); // 月相四画
          }
          break;
        }
        case 663: // 公主（Chest.cs:3427-3445：十周年+hardMode+击败海盗 → 相位对海盗四件）
          if (this.world.seedFlags?.tenthAnniversary && this.world.flags.hardMode && this.world.flags['downedPirates']
            && ![2584, 854, 855, 905].some((id) => out.some((e) => e[0] === id))) {
            add([[2584], [854], [855], [905]][Math.floor(phase / 2)]);
          }
          break;
        case 633: { // 动物学家 bestiary 进度门全表（Chest.cs:3241-3385：
          // CompletionPercent 阈值 0.03/0.10/0.25/0.30/0.40/0.45/0.50/0.70/1.0 + 事件门）
          const pct = this.world.bestiary.completion().percent;
          const seen = (npcId: number) => this.world.bestiary.unlockState(
            bestiaryEntries().find((e) => e.creditId === bestiaryCreditId(npcId))
              ?? { creditId: '', kind: 'enemy', sources: [], goldGate: false }) > 0;
          // 仙灵火把（:3244/:3524-3544：三仙灵 583/584/585 图鉴均 > NotKnown）
          if (seen(583) && seen(584) && seen(585)) add([4776]);
          add([4767]);                                                    // 勿伤小动物书 :3248
          if (phase === 0 && !day) add([5253]);                           // 满月夜狼人画 :3249
          if (pct >= 0.45) add([5635]);                                   // 辉夜姬画 :3253
          if (pct >= 0.10) add([4759]);                                   // 松鼠钩 :3257
          if (pct >= 0.03) add([4672]);                                   // 平淡鞭 :3261
          add([4829]);                                                    // 猫执照 :3265
          if (pct >= 0.25) add([4830]);                                   // 狗执照 :3266
          if (pct >= 0.45) add([4910]);                                   // 兔执照 :3270
          if (pct >= 0.30) add([4871, 4907]);                             // 樱花/黄柳种子 :3274/:3278
          if (this.world.flags['downedTowerSolar']) add([4677]);          // 蹲爬虫风筝 :3282
          if (pct >= 0.10) add([4676]);                                   // 锦鲤风筝 :3286
          if (pct >= 0.30) add([4762, 4785, 4786, 4787]);                 // 洗发水+三马鞍 :3290/:3298-3308
          if (pct >= 0.30 && this.world.flags.hardMode) add([4788]);      // 马上长枪 :3310
          if (pct >= 0.25) add([4716, 4763]);                             // 软体哨/鼹鼠矿车 :3294/:3314
          if (pct >= 0.40) add([4955]);                                   // 兔子指令 :3318
          if (this.world.flags.hardMode && this.world.clock.bloodMoon) add([4736]); // 满月吱吱玩具 :3322
          if (this.world.flags['downed_262']) add([4701]);                // 泥巴伙伴（世花后）:3326
          if (pct >= 0.50) add([4765, 4766, 5285, 4777]);                 // 树/世界/月球仪+闪电胡萝卜 :3330-3344
          if (pct >= 0.70) add([4735]);                                   // 导线球 :3346
          if (pct >= 1.0) add([4951]);                                    // 图鉴 100% 胜利传送塔 :3350
          if (partyIsUp(this.partyState)) add([5466]);                    // 派对蜂群雷 :3354
          // 兽耳尾套装（:3358-3379 四相位对——原 switch 直取，无进度门）
          add([[4768, 4769], [4770, 4771], [4772, 4773], [4560, 4775]][Math.floor(phase / 2)]);
          if (this.player.golferScoreAccumulated >= 2000) add([4744]);    // :1951 猎人斗篷
          break;
        }
      }
    }
    // Painter 第二商店（case 25 :2456-2587）画作——并入主列表（月相四画 :2482-2506 + 常驻 1490）
    if (npc.vanillaId === 227) {
      add([1490]);
      add([[1481], [1482], [1483], [1484]][Math.floor(phase / 2)]);
      if (this.player.golferScoreAccumulated > 500) add([4743]); // :2250 橄榄球画
    }
    return out;
  }

  /** 商店上架门（Chest.SetupShop if 门 → 本作状态映射；未实现事件门不上架） */
  private shopCondOk(cond: string | null): boolean {
    if (!cond) return true;
    const f = this.world.flags;
    switch (cond) {
      case 'hardMode': return !!f.hardMode;
      case 'downedBoss1': return !!(f['downed_4'] || f.downedEyeOfCthulhu);
      case 'downedBoss2': return !!(f['downed_13'] || f['downed_266']);
      case 'downedBoss3': return !!(f['downed_35'] || f.downedSkeletron);
      case 'downedMechBossAny':
        return !!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']);
      case 'moonPhase':
        // 月相门：extract-shops.mjs 未捕获 case 相位值——恒 false，分档上架由
        // shopStockFor 的相位实表负责（改 true 会全相位重复上架）
        return false;
      case 'night': return !this.world.clock.isDay;
      case 'day': return this.world.clock.isDay;
      case 'zoneSnow': return !!this.scene?.zoneSnow;
      case 'zoneJungle': return !!this.scene?.zoneJungle;
      case 'zoneGraveyard': return !!this.scene?.zoneGraveyard;
      case 'zoneMeteor': return !!this.scene?.zoneMeteor;
      case 'zoneUnderworld': return !!this.scene?.zoneUnderworldHeight;
      case 'crimson': return this.world.crimson;
      case 'bloodMoon': return this.world.clock.bloodMoon;
      case 'xMas': return this.world.clock.xMas;
      case 'eclipse': return !!this.world.clock.eclipse; // 日食（电子人 774 等）
      case 'party': return partyIsUp(this.partyState);   // 派对进行中（派对商品族）
      case 'lanternNight': return LanternNight.lanternsUp; // 灯笼夜（派对女孩 4702 放飞灯笼）
      default: return false;
    }
  }

  // ---- LanternNight 上下文（LanternNight.cs 静态字段读取点 → 本仓世界态映射）----

  /** LanternCtx：LanternsCanStart/Persist 的五门 + BossIsActive（:59-79） */
  private lanternCtx() {
    const w = this.world;
    return {
      bloodMoon: !!w.clock.bloodMoon,
      pumpkinMoon: w.moonEvent.kind === MOON_KIND_PUMPKIN,
      snowMoon: w.moonEvent.kind === MOON_KIND_FROST,
      invasionType: w.invasionType,
      moonLordCountdown: w.lunarEvent.moonLordCountdown,
      // WorldGen.spawnMeteor——本仓陨石坠落系统未移植恒 false（登记：spawnMeteor 位）
      spawnMeteor: false,
      downedMoonlord: !!w.flags['downed_398'],
      // BossIsActive（:68-79）：boss 或 13-15（世吞体节/克脑爬行者）——本仓 Boss 单槽
      // + 入场怪近似为「Boss 槽在场或世吞体节/爬行者在场」
      bossActive: () => {
        if (this.boss && !this.boss.dead) return true;
        return this.entities.enemies.some((n) => {
          const en = n as Enemy;
          return !en.dead && en.vanillaId != null && en.vanillaId >= 13 && en.vanillaId <= 15;
        });
      },
    };
  }

  /** 灯笼夜概率/状态入口（供调试与对话/天气消费方读） */
  get lanternsUp(): boolean { return LanternNight.lanternsUp; }

  private openNpcShop() {
    const npc = this.dialogNpc;
    if (!npc) return;
    const entries = this.shopStockFor(npc).map(([vid, price]) => ({
      key: VANILLA_ITEM_KEY_BY_ID[vid] ?? '',
      vanillaId: vid,
      name: Lang.itemName(vid) ?? VANILLA_ITEM_KEY_BY_ID[vid] ?? String(vid),
      price,
    }));
    this.cb.onNpcShop?.(Lang.inter(28), entries, this.coinsOwned());
  }

  /** 商店购买:扣币 + 入包 + 刷新商店面板(可购态/余额) */
  npcShopBuy(vanillaId: number): void {
    const list = this.dialogNpc ? this.shopStockFor(this.dialogNpc) : [];
    const entry = list.find(([id]) => id === vanillaId);
    if (!entry) return;
    // 折扣卡（discountAvailable：PriceAdjustment 0.8，Main.cs:41028 同源）
    const price = Math.max(1, Math.round(entry[1] * (this.player.equipStats.discount ? 0.8 : 1)));
    if (this.coinsOwned() < price || !this.spendCopper(price)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      this.openNpcShop();
      return;
    }
    const key = VANILLA_ITEM_KEY_BY_ID[vanillaId];
    if (key && ITEM_BY_KEY[key] !== undefined) this.player.inv.add(ITEM_BY_KEY[key], 1);
    this.sfx.play('coin');
    this.cb.onInventoryChanged();
    this.openNpcShop();
  }

  /** 骷髅商离屏计时（CheckActive timeLeft=750 语义） */
  private skeletonMerchantDespawnT = 0;
  /** 旅行商人到访/离场轮（每 tick）。顺带：骷髅商离屏 timeLeft 消失（CheckActive 语义） */
  private updateTravellingMerchant(): void {
    const w = this.world;
    const t = w.clock.timeOfDay;
    // 骷髅商：离屏累计 750 tick 消失（在屏重置——CheckActive 屏内矩形语义；
    // 入侵不影响其消散）
    const sm = this.entities.npcs.find(
      (n) => n instanceof TownNPC && !n.dead && n.npcKey === 'skeleton_merchant') as TownNPC | undefined;
    if (sm) {
      const ds = Math.max(Math.abs(sm.cx - this.player.cx), Math.abs(sm.cy - this.player.cy));
      if (ds > TILE * 62) {
        if (++this.skeletonMerchantDespawnT >= 750) { sm.dead = true; this.skeletonMerchantDespawnT = 0; }
      } else this.skeletonMerchantDespawnT = 0;
    }
    // 入侵/月事件进行中旅行商不到访（SpawnTravelNPC :5189 门；月事件原版经 !dayTime
    // 间接压制——此处同入驻轮显式补）
    if (invasionActive(w) || moonEventActive(w)) return;
    const tm = this.entities.npcs.find(
      (n) => n instanceof TownNPC && !n.dead && n.npcKey === 'travelling_merchant') as TownNPC | undefined;
    if (tm) {
      // 离场：白天过 48600（昼内进度 0.8）或入夜，且玩家离屏后移除（UnspawnTravelNPC）
      if (!w.clock.isDay || (t - Clock.DAWN) / 0.625 > 0.8) { // 昼内进度 >0.8（48600t 语义）
        const d = Math.hypot(tm.cx - this.player.cx, tm.cy - this.player.cy);
        if (d > TILE * 62) {
          tm.dead = true;
          this.newText(Lang.text('LegacyMisc.35', Lang.npcName(368) ?? ''), 50, 125, 255);
        }
      }
      return;
    }
    if (!w.clock.isDay || t >= 0.5) return;                       // 仅上午（Main.time<27000）
    if (Math.random() >= 1 / 108000) return;                      // 每 tick 1/(27000*4)
    const others = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead
      && !['old_man', 'skeleton_merchant', 'travelling_merchant'].includes((n as TownNPC).npcKey));
    if (others.length < 2) return;                                // 需 ≥2 名城镇 NPC
    const housed = others.filter((n) => (n as TownNPC).home);
    const src = housed.length ? housed : others;
    const anchor = src[Math.floor(Math.random() * src.length)] as TownNPC;
    const hx = anchor.home ? anchor.home.x : Math.floor(anchor.cx / TILE);
    const hy = anchor.home ? anchor.home.y : Math.floor(anchor.cy / TILE);
    // 锚点旁 ±(30..80) 列找落脚地（同流浪生成锚定逻辑）
    const st = w.store;
    const ax = hx + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 50));
    if (ax < 3 || ax > st.w - 4) return;
    let ay = Math.max(4, hy - 20);
    const limit = Math.min(st.h - 3, hy + 20);
    while (ay < limit && !st.isSolid(ax, ay)) ay++;
    if (ay >= limit) return;
    const npc = new TownNPC('travelling_merchant', ax * TILE + 8, (ay + 1) * TILE);
    this.entities.add(npc, 'npcs');
    this.travelStock = this.buildTravelStock();                   // SetupTravelShop
    this.newText(Lang.text('Announcement.HasArrived', Lang.npcName(368) ?? ''), 50, 125, 255);
  }

  /** 旅行商人当期股票（Chest.SetupTravelShop :1241-1321 结构 1:1）：
   *  件数 4-6 + 运气/专家加件；首件（仅困难模式）minimumRarity=2 有上限循环；
   *  主件环无尝试上限；末尾 1 幅画另有上限循环。池内按原版 if 链顺序、后命中覆盖。
   *  幸运度已接（Player.luck → Luck.RollLuck 三态，Luck.cs:5-16）：luck>0 时
   *  RollLuck(N) 改掷 [N/2, N)（命中 0 的概率升 ~2 倍期望）、luck<0 改掷 [N, 2N)
   *  （恒不中 0）；件数 num 的 RollLuck(4/8/16/32)==0 加件掷同链（SetupTravelShop :1251-1267）。
   *  AdjustSlotRarities（Chest.cs:919-947）逐槽阈值降档：第 4201-4701 次尝试起各槽
   *  rarity 降 1——原版 rarity 与 array 同引用（:1283-1285/:1310），降档全店持久。
   *  peddlersSatchelWasUsed（:1271 货郎背包 +1）/十周年世界（:1274-1280）未实装 */
  private travelStock: Array<[number, number]> = [];
  private buildTravelStock(): Array<[number, number]> {
    const array = [100, 200, 300, 400, 500, 600];
    const rarity = array;   // 与 array 同引用：AdjustSlotRarities 降档持久到后续环（原版同构）
    const adjustSlotRarities = (slotItemAttempts: number): void => {
      travelAdjustSlotRarities(rarity, slotItemAttempts);
    };
    const luck = this.player.luck;   // Player.GetPlayerWithHighestLuck → 本地玩家（单人）
    const rollZero = (n: number): boolean => rollLuck(luck, n) === 0;
    const condOk = (c: string | null): boolean => {
      const f = this.world.flags;
      switch (c) {
        case null: return true;
        case 'hardMode': return !!f.hardMode;
        case 'downedBoss3': return !!(f['downed_35'] || f.downedSkeletron);
        case 'shadowOrbSmashed': return !!f.shadowOrbSmashed;
        default: return false; // hardModeMech/moonlord/martians/frost/pirates/dontStarve 未达
      }
    };
    const pick = (pool: Array<{ id: number; tier: number; cond: string | null }>, minimumRarity: number): number => {
      let it = 0;
      for (const e of pool) {
        if (e.tier < minimumRarity || e.cond === 'skip' || !condOk(e.cond)) continue;
        if (rollZero(rarity[e.tier])) it = e.id;  // SetupTravelShop_GetItem RollLuck(rarity[t])==0
      }
      return it;
    };
    const stock: number[] = [];
    const canAdd = (id: number) => id > 0 && !stock.includes(id);
    // 件数：4-6 基础 + 运气/专家加件（SetupTravelShop :1245-1280——原版先掷 num 再进
    // 首件环，掷骰次序即 RNG 消费次序，1:1 保持此序）
    let num = 4 + Math.floor(Math.random() * 3);
    if (rollZero(4)) num++;
    if (rollZero(8)) num++;
    if (rollZero(16)) num++;
    if (rollZero(32)) num++;
    if (this.world.isExpert && rollZero(2)) num++; // Chest.cs:1263 Main.expertMode（世界难度）
    // 首件（:1276-1299）：仅 hardMode 才有此环；while num2<5000 + 每轮先降档 +
    // minimumRarity=2；成功入店即 break
    if (this.world.flags.hardMode) {
      let num2 = 0;
      while (num2 < 5000) {
        num2++;
        adjustSlotRarities(num2);
        const it = pick(TRAVEL_POOL.items, 2);
        if (canAdd(it)) { stock.push(it); break; }
      }
    }
    // 主件环（:1300-1308）：added<num 且无尝试上限——原版同（概率上必然终止，
    // 此处仅挂防死循环护栏，正常永不可达）
    let guard = 0;
    while (stock.length < num) {
      const it = pick(TRAVEL_POOL.items, 0);
      if (canAdd(it)) stock.push(it);
      if (++guard > 100000) break;
    }
    // 末件画（:1309-1321）：num2 重置、每轮先降档、while num2<5000
    let num3 = 0;
    while (num3 < 5000) {
      num3++;
      adjustSlotRarities(num3);
      const it = pick(TRAVEL_POOL.paintings, 0);
      if (canAdd(it)) { stock.push(it); break; }
    }
    return stock.map((id) => [id, ITEM_VALUES[String(id)] ?? 100]);
  }

  /** 开启入侵并广播 approaching 公告（StartInvasion + InvasionWarning）。
   *  探针/物品触发共用入口；已进行中返回 false */
  startInvasionAndAnnounce(type: number, ignoreDelay = false): boolean {
    const w = this.world;
    if (!canStartInvasion(w, this.player.maxHp, ignoreDelay)) {
      if (this.player.maxHp < 200) this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.Need200Hp'));
      else this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
      return false;
    }
    const misc = startInvasion(w, type);
    if (misc == null || misc < 0) return false;
    this.invasionWarn = 3600;
    this.newText(Lang.misc(misc), 175, 75, 255);
    return true;
  }

  /** 季节旗标（checkXMas Main.cs:13054-13073 / checkHalloween :13093-13110：
   *  现实日期 ∪ 月事件胜利当日位 ∪ 永久季种子位 三路或——Forever 随存档 flags 持久化） */
  private checkSeasonal() {
    const now = new Date();
    // 现实日期（checkXMas Main.cs:13054 / checkHalloween :13093）∪ 月事件胜利强制位
    // ∪ forceXMas/HalloweenForever（Main.cs:13071/13104，WorldFile.cs:1418/2459 存档位）
    this.world.clock.xMas = (now.getMonth() === 11 && now.getDate() >= 15)
      || this.forceXMasForToday || !!this.world.flags.forceXMasForever;
    this.world.clock.halloween = (now.getMonth() === 9 && now.getDate() >= 10)
      || (now.getMonth() === 10 && now.getDate() <= 1)
      || this.forceHalloweenForToday || !!this.world.flags.forceHalloweenForever;
  }

  /** 税务员收税领取（NPCInteractions TaxCollectorCollectTaxes + Player.CollectTaxes :23854）：
   *  税款由 update 每游戏小时累积（50 铜 × 已入住城镇 NPC 数，上限 25 金），对话领取 */
  private taxCollect() {
    const t = this.player.taxMoney;
    if (t <= 0) { this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.TaxEmpty')); return; }
    this.player.taxMoney = 0;
    this.gainCopper(t);
    this.sfx.play('coin');
    this.cb.onInventoryChanged();
    this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.TaxCollected', t));
  }

  /** 铜币入包（按面额拆分；spendCopper 的镜像） */
  private gainCopper(n: number): void {
    const inv = this.player.inv;
    const gold = Math.floor(n / 10000);
    const silver = Math.floor((n % 10000) / 100);
    const copper = n % 100;
    if (gold) inv.add(ITEM_BY_KEY['coin_gold'], gold);
    if (silver) inv.add(ITEM_BY_KEY['coin_silver'], silver);
    if (copper) inv.add(ITEM_BY_KEY['coin_copper'], copper);
  }

  /** 护士治疗:费用 = 缺失生命 × 0.75 铜(下限 3);满血拒绝 */
  private nurseHeal() {
    const p = this.player;
    if (p.hp >= p.maxHp) { this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealthy')); return; }
    const cost = Math.max(3, Math.round((p.maxHp - p.hp) * 0.75));
    if (this.coinsOwned() < cost || !this.spendCopper(cost)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      return;
    }
    p.hp = p.maxHp;
    this.sfx.play('drink');
    this.cb.onInventoryChanged();
    this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealed'));
  }

  /** 扣铜币:全背包三种币换算清点,整额清空后按面额找零(vanilla BuyItem 语义近似) */
  private spendCopper(n: number): boolean {
    const inv = this.player.inv;
    if (this.coinsOwned() < n) return false;
    const change = this.coinsOwned() - n;
    for (let i = 0; i < inv.slots.length; i++) {
      const sl = inv.slots[i];
      if (!sl) continue;
      if (sl.id === ITEM_BY_KEY['coin_copper'] || sl.id === ITEM_BY_KEY['coin_silver']
        || sl.id === ITEM_BY_KEY['coin_gold'] || sl.id === ITEM_BY_KEY['coin_platinum']
        || sl.id === ITEM_BY_KEY['vi_71_CopperCoin'] || sl.id === ITEM_BY_KEY['vi_72_SilverCoin']
        || sl.id === ITEM_BY_KEY['vi_73_GoldCoin'] || sl.id === ITEM_BY_KEY['vi_74_PlatinumCoin']) {
        inv.slots[i] = null;
      }
    }
    // 按面额回流(铂→金→银→铜,栈内合并)
    const plat = Math.floor(change / 1000000);
    const gold = Math.floor((change % 1000000) / 10000);
    const silver = Math.floor((change % 10000) / 100);
    const copper = change % 100;
    if (plat) inv.add(ITEM_BY_KEY['coin_platinum'], plat);
    if (gold) inv.add(ITEM_BY_KEY['coin_gold'], gold);
    if (silver) inv.add(ITEM_BY_KEY['coin_silver'], silver);
    if (copper) inv.add(ITEM_BY_KEY['coin_copper'], copper);
    return true;
  }

  // （旧 isValidHouse 启发式已删除——房屋判定移至 src/world/Housing.ts，
  //  泛洪填充 + 原版 wallHouse 墙表 + 桌椅灯需求，见 checkRoom/findFreeHouse）

  // ================= GameHooks 实现 =================

  /** 掉落系统补充上下文（灵魂/钥匙/风筝等条件）：玩家 zone + 季节 + 血月 + 风 */
  dropContext(): DropExtras {
    const s = this.scene;
    const c = this.world.clock;
    return {
      zoneHallow: s.zoneHallow, zoneCorrupt: s.zoneCorrupt, zoneCrimson: s.zoneCrimson,
      zoneJungle: s.zoneJungle, zoneSnow: s.zoneSnow, zoneDesert: s.zoneDesert,
      zoneDungeon: s.zoneDungeon, zoneBeach: s.zoneBeach,
      bloodMoon: !!c.bloodMoon, halloween: !!c.halloween, xmas: !!c.xMas,
      windy: Math.abs(this.world.weather.windSpeedCurrent) > 0.5,
    };
  }

  /** 月事件掉落上下文（NpcDrops 四个 wave-gate 条件数据源）；无事件返回 null */
  moonEventCtx(): { kind: 1 | 2; wave: number } | null {
    const me = this.world.moonEvent;
    return me.kind === 0 ? null : { kind: me.kind, wave: me.waveNumber };
  }

  enemies() {
    return this.entities.enemies;
  }

  /** 小动物列表:弹幕命中用(GameHooks.critters) */
  critters() {
    return this.entities.critters;
  }

  /** 弹幕砍 tileCut 物（Projectile.CutTiles 语义）：瓦罐→整罐碎裂，其余→breakTile */
  cutTile(x: number, y: number) {
    const st = this.world.store;
    if (!st.inBounds(x, y)) return;
    const t = st.get(x, y);
    if (t === POT_TILE) this.smashPot(x, y);
    else if (TILE_CUT.has(t)) this.breakTile(x, y);
  }

  spawnDrop(x: number, y: number, itemKey: string, count = 1, vx = 0, vy = -2): ItemDrop | null {
    const id = ITEM_BY_KEY[itemKey];
    if (id === undefined) return null;
    const drop = new ItemDrop(x - 6, y - 6, id, count, vx, vy);
    this.entities.add(drop, 'drops');
    // 原版 Main.item 槽位上限 400,超出移除最旧掉落(Main.UpdateItems 空 slot 回收)——
    // 此前无上限:dev 模式一次 ~500 实体/雕像农场线性堆积(2026-08 审计 #10)
    const drops = this.entities.drops;
    while (drops.length > 400) drops.shift();
    return drop;
  }

  /** 星云 booster 实体（原版是 Item 3453-55：WI:418 重力 0.1；PC:34497 抓取 42px 内
   *  PullItem 速度 12/acc 5；拾取 → NebulaLevelup（3453 伤/3454 命/3455 魔）+ 音效 7） */
  private nebulaBoosters: Array<{ x: number; y: number; vx: number; vy: number; fam: 0 | 1 | 2 | -1 }> = [];
  private spawnNebulaBooster(x: number, y: number): void {
    const fam = (Math.floor(Math.random() * 3) as 0 | 1 | 2); // SelectRandom(3453,3454,3455)
    const side = Math.random() < 0.5 ? -1 : 1;
    this.nebulaBoosters.push({
      x, y,
      vx: (10 + Math.floor(Math.random() * 21)) * 0.2 * side, // :12898
      vy: (-20 + Math.floor(Math.random() * 21)) * 0.2,       // :12897
      fam,
    });
  }
  private updateNebulaBoosters(): void {
    const p = this.player;
    if (p.nebulaCD > 0) p.nebulaCD--;
    for (const b of this.nebulaBoosters) {
      const d = Math.hypot(p.cx - b.x, p.cy - b.y);
      if (d < 42 + 10) { // grabRange 42（PC:2406）→ PullItem 速 12/acc 5（PC:34581-34596）
        b.vx += ((p.cx - b.x) / (d || 1)) * 5;
        b.vy += ((p.cy - b.y) / (d || 1)) * 5;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 12) { b.vx *= 12 / sp; b.vy *= 12 / sp; }
      } else {
        b.vy = Math.min(b.vy + 0.1, 10); // 物品重力（WI:418）
      }
      b.x += b.vx; b.y += b.vy;
      const tb = this.world.store;
      const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
      if (tb.inBounds(tx, ty) && tb.isSolid(tx, ty)) { b.y -= b.vy; b.vy = 0; b.vx *= 0.9; }
      if (d < 20 && b.fam !== -1) { // 碰体拾取（PC:34476-34480;已回收跳过）
        const fam = b.fam; // 收窄 0|1|2(下述 -1 标记回收前留存)
        p.nebulaLevelup(fam);
        this.sfx.play('pickup', 1, -1); // SoundID 7（PC:34601）
        // 先用原 fam 取色再覆盖 -1 标记回收——顺序颠倒会令三色 boosters 全喷粉色
        this.spawnParticles(b.x, b.y, ['#FF6AD5', '#FF3C3C', '#3CB8FF'][fam], 6, 2, { life: 24 });
        b.fam = -1; // 标记回收
      }
    }
    this.nebulaBoosters = this.nebulaBoosters.filter((b) => b.fam !== -1);
  }

  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: Enemy) {
    const p = this.player;
    if (p.dead) return;
    if (attacker) p.lastDamageCause = { kind: 'npc', name: (attacker.vanillaId != null ? Lang.npcName(attacker.vanillaId) : null) ?? attacker.def.name };
    const ok = p.damage(dmg, srcX, srcY);
    if (ok) {
      // 狼人(155)命中施加虚弱 33（1800t=30s：近战-5.1%伤/速、防-4、移-10%）
      if (attacker?.vanillaId === 155) p.buffs.apply(BuffType.Weak, 30);
      // 星星斗篷（Player.SpawnStar 近似）：受击召 3 颗落星砸附近敌人
      if (p.equipStats.starCloak) this.spawnStarCloakStars();
      // 蜂蜜斗篷/蜂巢背带（Player.SpawnBees :2147 近似）：受击放 1-3 只蜂（proj 181/183/189）
      if (p.equipStats.bees) {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const tx = p.cx + (Math.random() - 0.5) * 48;
          const ty = p.cy - 20 + (Math.random() - 0.5) * 24;
          const tgt = this.entities.enemies.find((e) => {
            const en = e as Enemy;
            return !en.dead && Math.abs(en.cx - p.cx) < 500;
          }) as Enemy | undefined;
          const ang = tgt
            ? Math.atan2(tgt.cy - ty, tgt.cx - tx)
            : -Math.PI / 2 + (Math.random() - 0.5);
          this.entities.add(new Arrow(tx, ty, Math.cos(ang) * 3.4, Math.sin(ang) * 3.4,
            Math.round(9 * p.damageMult('melee')), 0.5, 181, null), 'projectiles');
        }
        this.sfx.play('beeSummon');
      }
      // 致死一击：不播受击声，只播死亡声（保证最后听到的音效是死亡）
      if (p.hp <= 0) this.sfx.play('pkilled');
      else this.sfx.play('hurt');
      // 实际扣血 = max(1, dmg - defense*0.5)（在 Player.damage 内）
      const dealt = Math.max(1, dmg - p.defense * 0.5);
      this.addDamageNumber(p.cx, p.y, Math.round(dealt), false, '#FF5050');
      // 荆棘 Buff（1.4.5.6 Player.cs:30910-30944）：thorns=1 → 反弹接触伤害全额
      // （num4 × thorns，上限 1000；num4=接触伤害原值，取受伤前的 dmg 而非扣血后 dealt）
      if (p.thornsActive && attacker && !attacker.dead) {
        const reflect = Math.min(1000, Math.round(dmg));
        attacker.hurt(reflect, Math.sign(attacker.cx - p.cx) || 1, -1.5, this);
        this.addDamageNumber(attacker.cx, attacker.y, reflect, false, '#80FF80');
      }
      if (p.hp <= 0) {
        p.dead = true;
        p.deathsPve++;              // numberOfDeathsPVE（PL:53840,存档持久化）
        p.respawnTimer = 0;
        // 死亡文本/墓碑由 handlePlayerDeath 统一处理（此处不再 toast「你死了」）
        // ==== 死亡惩罚按【角色难度】（Player.difficulty：0 软核 1 中核 2 硬核 3 旅程）====
        // 世界难度不参与死亡惩罚（只管掉落/伤害倍率等），曾两轴混接
        const charDiff = p.appearance?.difficulty ?? 0;
        // 先记死亡时身家（Player.cs:38247-38250 lostCoins=coinsOwned——死亡 UI「掉了{0}」；
        // 软核/旅程随后被 DropCoins 实际掉落额覆盖 :38318-38324，中核/硬核的钱随
        // 物品全掉 → 身家即损失额）
        this.lostCoins = this.coinsOwned();
        // 中核/硬核：掉落全部物品（Player.cs:38254 DropItems(gemsOnly=false)：软核/旅程
        // 才走 gemsOnly=true 只掉宝石——本仓无背包宝石，近似为不掉）
        if (dropsAllItemsOnDeath(charDiff)) {
          dropInventoryOnDeath(p.inv, (key, stack) => {
            this.spawnDrop(p.cx, p.cy, key, stack, (Math.random() - 0.5) * 8, -2 - Math.random() * 2);
          });
        }
        // 硬核：角色消亡（Player.cs:38255-38257 HardcoreDeathPenalty → KillMeForGood :38173+
        // 删 .plr 角色档 + ghost 化 :16894；本仓最小集 = 标记不可重生 + 流程层回写角色存档）
        if (charDiff === 2 && p.appearance && !p.appearance.hardcoreDead) {
          p.appearance = { ...p.appearance, hardcoreDead: true };
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.HardcoreDeath', this.playerName()));
          this.cb.onHardcoreDeath?.(p.appearance);
        }
        // 软核/旅程：掉钱（Player.cs:38318-38326 difficulty==0||3 才走 DropCoins；
        // DropCoins :53351-53390 掉钱档按**世界难度**：经典掉一半/专家 3/4/大师全掉）
        if (dropsCoinsOnDeath(charDiff)) {
          const keep = deathCoinKeepFraction(this.world.difficulty);  // Main.GameMode（Main.cs:2677）
          let lost = 0;
          const face = [1, 100, 10000, 1000000];
          const coinKeys = [
            ['coin_copper', 'vi_71_CopperCoin'], ['coin_silver', 'vi_72_SilverCoin'],
            ['coin_gold', 'vi_73_GoldCoin'], ['coin_platinum', 'vi_74_PlatinumCoin'],
          ];
          coinKeys.forEach(([ck, vk], ci) => {
            for (const k of [ck, vk]) {
              const id = ITEM_BY_KEY[k];
              if (id === undefined) continue;
              const n = p.inv.countOf(id);
              if (n > 0) {
                lost += (n - Math.floor(n * keep)) * face[ci];
                p.inv.remove(id, n - Math.floor(n * keep));
              }
            }
          });
          this.lostCoins = lost; // DrawInterface_35 "掉了{0}"（重生于 respawnPlayer 清零）
        }
        // 垃圾桶死亡清空（Player.cs:53394 mouseItem/trashItem 语义）
        p.inv.trash = null;
      }
    }
  }

  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color = '#FFF') {
    this.dmgNumbers.push({ x, y, vy: -1.6, value: amount, crit, color, life: 50 });
  }

  /** 弹幕消亡钩子（Projectile.Kill 按弹型分发）：
   *  碎镜 1085（Projectile.cs:67554-67574）——弹体命中盒外扩 150px 与玩家矩形
   *  相交 → brokenMirrorBadLuckTime = 25200（luck −0.25 档，UpdateBrokenMirrorLuck
   *  :28700-28711 衰减）。原版此处另有 Gore 1394-1397 碎片与尘 330——未移植，登记 */
  onProjectileDeath(projId: number, x: number, y: number, w = 0, h = 0) {
    if (projId !== 1085) return;
    const R = 150;
    const p = this.player;
    if (x - R < p.x + p.w && x + w + R > p.x && y - R < p.y + p.h && y + h + R > p.y) {
      p.luckState.brokenMirrorBadLuckTime = 25200;
    }
  }

  /** 吸血链（Projectile.vampireHeal :11439-11448 / ghostHeal :11404-11437 1:1）：
   *  回复系数 = 吸血鬼飞刀 0.075 / 幽灵治疗 0.2−numHits×0.05（钳 >0，:11407-11411）；
   *  floor ≥1 且预算 >0 才生效（:11413/:11442），预算扣全额浮点（:11417/:11444）。
   *  ghost 侧旗标门在调用点（:12885 ghostHeal && !moonLeech）——此处双保险；
   *  非魔法弹预算照扣不回复（:11418-11421 原文顺序）。
   *  生效 = 自命中点发射治疗弹（305 吸血 :11447 / 298 鬼疗 :11436），初速 (0,0)、
   *  ai[1]=回复量，飞达目标后结算（aiStyle 52 :27114-27165，见 HealProj）——不再
   *  直回当前玩家。原版鬼疗跨队友选最缺血者（:11424-11434），本仓无队友体系，
   *  目标恒本地玩家（vampireHeal :11447 同为 owner 自己）。canGhostHeal 按恒 true；
   *  ghostHurt 未接 */
  applyLifeSteal(kind: 'vampire' | 'ghost', dmg: number, numHits: number, x: number, y: number, isMagic = false): number {
    const p = this.player;
    if (p.buffs.moonLeech) return 0;                       // 月噬 145 全禁（:12879/:12885/:27124）
    if (kind === 'ghost' && !p.equipStats.setBonus?.ghostHeal) return 0;
    const rate = kind === 'vampire' ? 0.075 : 0.2 - numHits * 0.05;
    if (rate <= 0) return 0;
    const heal = dmg * rate;
    const n = Math.floor(heal);
    if (n <= 0 || p.lifeSteal <= 0) return 0;
    p.lifeSteal -= heal;
    if (kind === 'ghost' && !isMagic) return 0;            // 预算已扣，非魔法不回复
    // NewProjectile(298/305, x, y, 0, 0, ..., ai0=owner, ai1=heal)（:11436/:11447）
    this.entities.add(new HealProj(kind === 'vampire' ? 305 : 298, x, y, heal, p), 'projectiles');
    return n;
  }

  onEnemyKilled(key: string, enemy?: Enemy) {
    // Boss 击败记账已由 Boss 逻辑块通用化(downed_<vanillaId>)
    void key;
    // 图鉴杀数（NPC.cs:79640-79643 NPCLoot→RegisterKill：netID 记账经 GetBestiaryCreditId
    // 归并变体/部位；IsNPCValidForBestiaryKillCredit 门在数据层。原版另有 GetWereThereAnyInteractions
    // 门（雕像产怪无玩家交互不计）——本仓 hurt 无伤害源参数，近似为全部计入，仅环境击杀的
    // 雕像怪是偏差面）
    if (enemy && enemy.vanillaId != null
      && isNpcValidForBestiaryKillCredit(enemy.vanillaId, !!enemy.def.boss)) {
      this.world.bestiary.registerKill(enemy.vanillaNetId !== 0 && enemy.vanillaNetId != null
        ? enemy.vanillaNetId : enemy.vanillaId);
    }
    // 史莱姆雨击杀推进（NPC.cs:79883-79898：slimeRainNPC 击杀 → killCount≥150 且场上无王 → 召王）
    if (enemy && enemy.vanillaId != null && this.world.weather.slimeRain) {
      if (this.world.weather.advanceSlimeRainKill(enemy.vanillaId) && !this.boss) {
        this.summonBoss('king_slime');
      }
    }
    // 月事件计分（NPC.cs CheckProgressFrostMoon/PumpkinMoon :79245/:79487）：
    // 必须在掉落结算之后同帧调用（Enemy.hurt 尾部 onEnemyKilled 即 NPCLoot 之后，
    // 对齐原版 checkDead NPCLoot → CheckProgress 顺序 NPC.cs:79020-79021），
    // 保证本波掉落 gate 用的是进波前的 wave。进波公告由此处广播
    if (enemy && enemy.vanillaId != null && moonEventActive(this.world)) {
      // 专家/大师判定读世界难度（Main.expertMode/masterMode，Main.cs:2775/:2779）
      const ann = addMoonEventKill(this.world, enemy.vanillaId, this.world.isExpert, this.world.isMaster);
      if (ann) this.newText(invasionWaveText(ann), 175, 75, 255);
    }
    // 星璇塔事件（NPC.cs:80080-80146）：
    //  本组专属怪死亡 → 发射 629 TowerDamageBolt → 命中塔盾 -1（归属表 LunarEvent.MINION_TOWER）；
    //  塔真死（180t 死亡演出后）→ downedTower_* + UpdateLunarApocalypse + MessageLunarApocalypse。
    //  与月事件计分同位（掉落结算之后同帧，对齐原版 checkDead 尾段顺序）
    if (enemy && enemy.vanillaId != null) {
      if (isTowerId(enemy.vanillaId)) {
        this.onLunarTowerKilled(enemy.vanillaId);
      } else if (this.world.lunarEvent.active && isTowerMinion(enemy.vanillaId)) {
        this.onLunarMinionKilled(enemy);
      }
    }
    // 入侵击杀扣分（NPC.cs:79021-79054：组号匹配当前入侵类型才计分，加权扣减）
    if (enemy && this.world.invasionType > 0 && enemy.vanillaId != null) {
      const group = INVASION_GROUP[enemy.vanillaId];
      if (group && group === this.world.invasionType) {
        this.world.invasionSize = Math.max(0, this.world.invasionSize - (KILL_WEIGHT[enemy.vanillaId] ?? 1));
      }
    }
    // 旧日军团计分（DD2Event.CheckProgress :344-470 + AnnounceGoblinDeath :733-736）：
    // 与月事件同位（掉落结算之后同帧，对齐原版 checkDead 尾段顺序）
    if (enemy && enemy.vanillaId != null) {
      const oa = this.world.oldOnesArmy;
      if (oa.ongoing) {
        // 小妖精三档死亡登记尸点（黑暗魔法师 RaiseGoblins 的复活源，NPC.cs:80040-80052
        // switch case 552/553/554——仅 Goblin T1/T2/T3；555+ 与 551 不登记）
        if (enemy.vanillaId >= 552 && enemy.vanillaId <= 554) {
          dd2AnnounceGoblinDeath(oa, enemy.cx, enemy.y + enemy.h);
        }
        // 专家判定读世界难度（DD2Event.CheckProgress 的 Main.expertMode，Main.cs:2775）
        const prog = dd2CheckProgress(oa, enemy.vanillaId, this.world.isExpert, this.betsyLifeRatio());
        if (prog.waveComplete) {
          this.newText(Lang.text(prog.waveComplete), 175, 55, 255);   // INFO_NEW_WAVE_COLOR
          if (prog.medals > 0) this.dd2Host().dropAtCrystal(3817, prog.medals);
        }
        if (prog.victoryScene) this.startDD2VictoryScene();
        // 击杀推进中的魔力配额掉落（ShouldDropCrystals :799-927——波内按击杀进度放出）
        if (dd2ShouldDropCrystals(oa, this.betsyLifeRatio())) {
          this.dd2Host().dropAtCrystal(3822, 1);
        }
      }
    }
  }

  /** Betsy 血量比（D3 第 7 波进度 = 100×已损血比，DD2Event.cs:1503-1513；无 Betsy → null） */
  private betsyLifeRatio(): number | null {
    const betsy = (this.entities.enemies as Enemy[]).find((e) => !e.dead && e.vanillaId === 551);
    return betsy ? betsy.hp / betsy.maxHp : null;
  }

  /** StartVictoryScene（DD2Event.cs:481-507）：水晶 548 ai[1]=2 / 门 549 撤收 */
  private startDD2VictoryScene(): void {
    for (const e of this.entities.enemies as Enemy[]) {
      if (e.dead) continue;
      if (e.vanillaId === 548) { e.ai1 = 2; e.ai0 = 2; }
      else if (e.vanillaId === 549) { e.ai0 = 0; e.ai1 = 1; }
    }
  }

  /** UpdateTime（DD2Event.cs:209-251）：每 tick 推进波间间歇/水晶在场判定 */
  private tickOldOnesArmy(): void {
    const oa = this.world.oldOnesArmy;
    if (!oa.ongoing) return;
    const res = dd2UpdateTime(oa, this.dd2Host(), this.betsyLifeRatio());
    if (res.stopped) {
      // 水晶亡 → StopInvasion（:218-220）——败北文案由水晶 AI 演出钩子播
      return;
    }
    if (res.waveAnnounce) {
      this.newText(invasionWaveText(res.waveAnnounce), 175, 55, 255);
      if (res.summonBetsy) {
        // SummonBetsy（:929-943）→ SpawnOnPlayer(551)：SpawnBoss default 分支广播
        // Announcement.HasAwoken（NPC.cs:81466-81472）
        const crystal = (this.entities.enemies as Enemy[]).find((e) => !e.dead && e.vanillaId === 548);
        const cx = crystal ? crystal.cx : this.player.cx;
        const cy = crystal ? crystal.cy : this.player.cy;
        if (dd2SummonBetsy(oa, this.dd2Host(), cx, cy)) {
          this.newText(Lang.text('Announcement.HasAwoken', Lang.npcName(551) ?? 'Betsy'), 175, 75, 255);
        }
      }
    }
    if (res.lose) {
      this.newText(Lang.text('DungeonDefenders2.InvasionLose'), 255, 0, 0);
    }
  }

  // ================= 星璇塔 / 天界入侵（LunarEvent.ts 宿主回调侧） =================

  /** LunarHost：造塔/广播/清教徒（LunarEvent 保持纯逻辑，不反向依赖 Game） */
  private lunarHost(): LunarHost {
    return {
      spawnTowerNpc: (id, tx, ty) => this.spawnLunarTower(id, tx, ty),
      broadcast: (text, r, g, b) => this.newText(text, r, g, b),
      clearCultists: () => {
        // GetRidOfCultists（WorldGen.cs:87508-87521：移除 437/438/379）
        for (const e of this.entities.enemies) {
          const en = e as Enemy;
          if (!en.dead && (en.vanillaId === 437 || en.vanillaId === 438 || en.vanillaId === 379)) {
            en.dead = true;
          }
        }
      },
    };
  }

  // ================= F2 图片 → 像素方块群(自研,原版无;原键 F11 与系统全屏冲突) =================
  /** 隐藏 file input(复用单例,每次置空 value 支持重复上传同一文件) */
  private pixelArtInput: HTMLInputElement | null = null;
  openPixelArtImport(): void {
    if (!this.world) return;
    if (!this.pixelArtInput) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.style.display = 'none';
      inp.addEventListener('change', () => this.onPixelArtFile(inp.files?.[0]));
      document.body.appendChild(inp);
      this.pixelArtInput = inp;
    }
    this.pixelArtInput.value = '';
    this.pixelArtInput.click();
  }
  private async onPixelArtFile(file: File | undefined): Promise<void> {
    if (!file || !this.world) return;
    const toast = (k: string, a: string | number = 0) => this.cb.onToast?.(Lang.text(k, a));
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const grid = imageToGrid(img);
        const st = this.world.store;
        const p = this.player;
        // 锚点:玩家面前(朝向 × 艺术半宽 + 10 格)
        const anchorX = Math.floor(p.cx / TILE) + Math.sign(p.facing || 1) * (10 + (grid.w >> 1));
        const pos = findArtPlacement(st, anchorX, Math.floor(p.cy / TILE), grid.w, grid.h);
        if (!pos) { toast('Mods.SandboxWorld.PixelArt.NoSpace'); return; }
        const n = placeArt(st, grid, pos);
        toast(n > 0 ? 'Mods.SandboxWorld.PixelArt.Placed' : 'Mods.SandboxWorld.PixelArt.NoSpace', n);
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast('Mods.SandboxWorld.PixelArt.BadImage'); };
      img.src = url;
    } catch {
      toast('Mods.SandboxWorld.PixelArt.BadImage');
    }
  }

  /** 塔就位（WorldGen.TriggerLunarApocalypse 内 NewNPC 语义：锚点 = 列中心 + 底部贴格顶） */
  private spawnLunarTower(id: number, tx: number, ty: number): void {
    const e = Enemy.fromVanilla(id, tx * TILE + 8, ty * TILE);
    if (!e) return;
    e.x = tx * TILE + 8 - e.w / 2;
    e.y = ty * TILE - e.h;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
  }

  /** TriggerLunarApocalypse（WorldGen.cs:87371-87436：教徒死调用，见 Boss 逻辑块） */
  triggerLunarApocalypse(): void {
    triggerLunarApocalypse(this.world, new RNG((Math.random() * 1e9) | 0), this.lunarHost());
  }

  /** 场上是否存在存活 NPC id（UpdateLunarApocalypse 的塔/月总在场探测用） */
  private hasNpcId(id: number): boolean {
    return this.entities.enemies.some((e) => {
      const en = e as Enemy;
      return !en.dead && en.vanillaId === id;
    });
  }

  /** 塔真死（NPC.cs:80122-80146：downedTower_* + Update/MessageLunarApocalypse） */
  private onLunarTowerKilled(towerId: number): void {
    onTowerKilled(this.world, towerId, (id) => this.hasNpcId(id), this.lunarHost());
  }

  /** 本组怪死亡 → 朝对应塔发射 629 TowerDamageBolt 真弹体（NPC.cs:80089-80121 发弹 +
   *  Projectile.cs:69784-69819 命中结算）：弹体 5px/t 追塔 + 红尘尾（AI_122 :33747-33778），
   *  命中才扣盾 1；扣盾前盾非 0 → 塔 ai[3]=1 闪光 120t（:69791 等）；盾破瞬间
   *  NPCDeath58（NPC.cs:41148-41151 的 flag99 翻转支） */
  private onLunarMinionKilled(enemy: Enemy): void {
    const towerId = towerBoltTarget(this.world, enemy.vanillaId!);
    if (towerId == null) return;
    // FindFirstNPC(塔) 场上无塔时原版 ai[0]=-1 → 弹体首帧自灭（AI_122 :33753-33761）
    const tower = (this.entities.enemies as Enemy[]).find(
      (e) => !e.dead && e.vanillaId === towerId);
    if (!tower) return;
    const findTower = () => (this.entities.enemies as Enemy[]).find(
      (e) => !e.dead && e.vanillaId === towerId) ?? null;
    this.entities.add(new TowerBolt(enemy.cx, enemy.cy, findTower, (t) => {
      const res = onTowerBoltHit(this.world, towerId);
      if (res.flash) t.ai3 = 1;  // 盾非 0 时塔 ai[3]=1（闪光 120t）
      if (res.shieldZero) this.sfx.play('roar', 0.8, t.cx, t.cy);
    }), 'projectiles');
  }

  /** 倒计时归零召月总（Main.cs:64457：SpawnOnPlayer(FindClosest, 398)——单人即主角头顶）。
   *  入 Boss 槽（专属 BGM 38 / 血条 / 击败记账 downed_398 → shieldMax 减半为 50） */
  private spawnMoonLordOnPlayer(): void {
    if (this.boss) return;   // 已有 Boss 在场（原版 SpawnOnPlayer 同样照召；此处避免双 Boss 槽冲突）
    const p = this.player;
    const e = Enemy.fromVanilla(398, p.cx, p.cy - 160);
    if (!e) return;
    e.x = p.cx - e.w / 2;
    e.y = p.cy - 160 - e.h / 2;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
    this.boss = e;
  }

  /** 小动物生成：视野外地表，按昼夜 + 栖息生态筛选，权重抽取。
   *  地面种：脚底精确贴地表格顶（此前高度>1格的实体被埋进地里卡死）；
   *  飞行种：仅开阔天空（向上 30 格无实心）且地表无水（鸭子除外）；
   *  蝴蝶：低空（地表上 1-4 格），优先附近有花的列。
   *  地表限定（原版 surfaceSpawn 语义，NPC.cs L2277-2290 草丛小动物只在 worldSurface 上）：
   *  玩家在地下/洞穴/地狱时不生成——此前以玩家为中心找地面且无深度守卫，
   *  玩家下地狱后会在灰烬地面上刷出兔子/鸟（biome 兜底默认 forest） */
  private spawnCritter() {
    const st = this.world.store;
    const isDay = this.world.clock.isDay;
    const pty = Math.floor(this.player.cy / TILE);
    if (pty > this.world.groundLevel + 20) return; // 玩家不在地表（±20 容纳丘陵起伏）
    const halfView = Math.ceil((this.camera.viewW / (this.camera.zoom || 1)) / 2 / TILE) + 8;
    const side = Math.random() < 0.5 ? -1 : 1;
    // 找列：蝴蝶优先附近 8 格内有 FLOWER 的列
    let tx = Math.floor(this.player.cx / TILE) + side * (halfView + Math.floor(Math.random() * 18));
    const isButterflyTentative = isDay && Math.random() < 0.35;
    if (isButterflyTentative) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const fx = tx + Math.floor((Math.random() - 0.5) * 16);
        if (fx < 4 || fx >= st.w - 4) continue;
        let found = false;
        for (let dx = -4; dx <= 4 && !found; dx++) {
          for (let y = Math.max(4, Math.floor(this.player.cy / TILE) - 24); y < Math.min(st.h - 4, Math.floor(this.player.cy / TILE) + 30); y++) {
            if (st.type[st.idx(fx + dx, y)] === T.FLOWER) { found = true; break; }
          }
        }
        if (found) { tx = fx; break; }
      }
    }
    if (tx < 4 || tx >= st.w - 4) return;
    // 找地表
    const startY = Math.max(4, Math.floor(this.player.cy / TILE) - 24);
    let groundY = -1;
    for (let y = startY; y < Math.min(st.h - 4, startY + 70); y++) {
      if (st.isSolid(tx, y)) { groundY = y; break; }
    }
    if (groundY < 0) return;
    // 落点也必须在地表：扫描窗从玩家±24 起，玩家在洞口/悬崖时可能找到洞穴顶或
    // 深层地面——直接拒绝（地狱地面 groundY≈h-200 远超 groundLevel+20）
    if (groundY > this.world.groundLevel + 20) return;
    const surfaceWater = st.liquid[st.idx(tx, groundY - 1)] > 80;
    // 生态判定
    const gTile = st.type[st.idx(tx, groundY)];
    let biome: 'forest' | 'snow' | 'sand' = 'forest';
    if (gTile === T.SNOW) biome = 'snow';
    else if (gTile === T.SAND || gTile === TILE_BY_KEY['sandstone'] || gTile === TILE_BY_KEY['hardened_sand']) biome = 'sand';
    const nearWater = surfaceWater || (() => {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (st.liquid[st.idx(tx + dx, groundY + dy)] > 80) return true;
        }
      }
      return false;
    })();
    // 海洋带判定（地图外沿 8%——螃蟹/海鸥 oceanOnly 门，防止进沙漠）
    const inOceanBand = tx < st.w * 0.08 || tx > st.w * 0.92;
    // ---- 雨天小动物（原版 SpawnAnNPC L2288-2311 friendly 段：草族 critter 块雨天
    //  整段替换——金鱼上岸散步 230 主导；L2107-2126 香蒲蜻蜓）。
    //  走本 friendly 通道（原版 FindSpawnTile 独立友好点位，不占敌怪配额）----
    const hallowGrassT = TILE_BY_KEY['v_109_hallowed_grass_block'];
    if (isDay && this.world.weather.raining && Math.abs(this.world.weather.windSpeedTarget) < 0.4
      && !surfaceWater && (gTile === T.GRASS || gTile === T.DIRT || gTile === hallowGrassT)) {
      // 香蒲蜻蜓（FindCattailTop :80977：±30×±20 窗口 reservoir 采样 tile519 顶段 frameX≥180）
      const cattailT = TILE_BY_KEY['v_519_cattails'];
      let cx = tx, cy = groundY, nCattail = 1;
      for (let ix = Math.max(4, tx - 30); ix <= Math.min(st.w - 4, tx + 30); ix++) {
        for (let iy = Math.max(4, groundY - 20); iy <= Math.min(st.h - 4, groundY + 20); iy++) {
          const ii = st.idx(ix, iy);
          if (st.type[ii] === cattailT && st.frameX[ii] >= 180 && Math.random() < 1 / nCattail) {
            cx = ix; cy = iy; nCattail++;
          }
        }
      }
      const spawnVanilla = (id: number, px: number, py: number) => {
        const e = Enemy.fromVanilla(id, px, py);
        if (e) { e.id = this.entities.nextId++; this.entities.add(e, 'critters'); }
      };
      if (nCattail > 1) {
        // 金蜻蜓 601（1/goldCritterChance=400）；池按 tile（RollDragonflyType L5426）；
        // 1/3 附加只 ×2（±16px）——原版 SpawnNPC 多只
        const dfly = () => Math.random() < 1 / 400 ? 601
          : (gTile === T.SAND ? [595, 598, 600][Math.floor(Math.random() * 3)]
            : [596, 597, 599][Math.floor(Math.random() * 3)]);
        spawnVanilla(dfly(), cx * TILE + 8, cy * TILE);
        if (Math.random() < 1 / 3) spawnVanilla(dfly(), cx * TILE - 8, cy * TILE);
        if (Math.random() < 1 / 3) spawnVanilla(dfly(), cx * TILE + 24, cy * TILE);
        return;
      }
      // 上岸金鱼块：1/400 金蚯蚓 448 → 2/3 蚯蚓 357 → 1/400 金金鱼 593 → 兜底 230
      // 洞穴层（deeperThanRockLayer）先走 gem 分支：1/5 松鼠、再 1/5 兔子（:2289-2298）
      const lavaLineT = this.world.lavaLine || st.h - 200;
      if (groundY >= this.world.rockLevel && groundY <= lavaLineT) {
        const gr = Math.random();
        if (gr < 0.2) { spawnVanilla(getGemSquirrelToSpawn(Math.random), tx * TILE + 8, groundY * TILE); return; }
        if (gr < 0.4) { spawnVanilla(getGemBunnyToSpawn(Math.random), tx * TILE + 8, groundY * TILE); return; }
      }
      const rr = Math.random();
      const id = rr < 1 / 400 ? 448 : rr < 2 / 3 ? 357 : Math.random() < 1 / 400 ? 593 : 230;
      spawnVanilla(id, tx * TILE + 8, groundY * TILE);
      return;
    }
    // 宝石小动物·洞穴层主路径（NPC.cs:2466-2531 尾段）：rockLevel≤y≤UnderworldLayer 的
    // 草/土格、昼夜均可：1/3×1/5 gem 松鼠 + 2/3×1/5 gem 兔子（合计 1/5）。
    // 选色纯加权表（:5587-5645，与就近宝石无关）
    if (!surfaceWater && (gTile === T.GRASS || gTile === T.DIRT)
      && groundY >= this.world.rockLevel && groundY <= (this.world.lavaLine || st.h - 200)) {
      const roll = Math.random();
      if (roll < 1 / 3) {
        if (Math.random() < 0.2) {
          const e = Enemy.fromVanilla(getGemSquirrelToSpawn(Math.random), tx * TILE + 8, groundY * TILE);
          if (e) { e.id = this.entities.nextId++; this.entities.add(e, 'critters'); }
          return;
        }
      } else if (Math.random() < 0.2) {
        const e = Enemy.fromVanilla(getGemBunnyToSpawn(Math.random), tx * TILE + 8, groundY * TILE);
        if (e) { e.id = this.entities.nextId++; this.entities.add(e, 'critters'); }
        return;
      }
    }
    // 按昼夜 + 栖息生态过滤（水面列只出 water 生态或飞行种）
    const pool = CRITTER_DEFS.filter((c) => {
      if (c.dayOnly && !isDay) return false;
      if (c.nightOnly && isDay) return false;
      // 鸭子是两栖：水面列可生成（落在岸边浅水/滩涂），其余地面种不能在水列
      if (surfaceWater && !c.water && c.kind !== 'fly' && c.key !== 'duck') return false;
      if (c.oceanOnly && !inOceanBand) return false;
      if (!c.biomes.includes(biome) && !(nearWater && c.biomes.includes('water'))) return false;
      return true;
    });
    if (!pool.length) return;
    // 小动物已由 VanillaSpawner 的 spawnFriendly 段（SpawnAnNPC L2006-2535）接管，
    // 此处仅保留自研 Critter 兜底（过渡期）
    const total = pool.reduce((s2, c) => s2 + c.weight, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const c of pool) { r -= c.weight; if (r <= 0) { pick = c; break; } }

    if (pick.kind === 'fly') {
      // 飞行种：地表不能是水（水面飞鸟/蝴蝶不合理，鸭子除外但鸭子不是 fly）
      if (surfaceWater) return;
      // 开阔天空检查（洞穴/地底不生成）
      for (let k = 2; k <= 30; k++) {
        if (groundY - k < 4) return;
        if (st.isSolid(tx, groundY - k)) return;
      }
      // 蝴蝶低空（1-4 格）、鸟/萤火虫中高空
      const lowFly = pick.key === 'butterfly' || pick.key === 'gold_butterfly';
      const flyY = lowFly ? (groundY - 1 - Math.random() * 3) * TILE : (groundY - 8 - Math.random() * 12) * TILE;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, flyY), 'critters');
    } else if (pick.water && surfaceWater) {
      // 水生种（鸭子）：落在水面上（自上而下第一个液体格），不是湖底
      let surfY = 4;
      while (surfY < st.h - 4 && st.liquid[st.idx(tx, surfY)] <= 80) surfY++;
      if (surfY >= st.h - 4) return;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, surfY * TILE), 'critters');
    } else {
      // 地面种：参数即脚底 y（构造器内减 h），精确站上地表格顶
      const c = new Critter(pick.key, tx * TILE + 8, groundY * TILE);
      // 安全兜底：身体中心在实心块内则放弃（防卡死）
      const ci = st.idx(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE));
      if (st.type[ci] !== 0 && st.isSolid(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE))) return;
      this.entities.add(c, 'critters');
    }
  }

  spawnEnemy(key: string, x: number, y: number) {
    // 联机访客不生成真敌（刷怪/召唤权威在房主；本地生成=幽灵实体永不同步）。
    // 傀儡不在此列（netApplyNpcSnaps 直接入桶）
    if (this.net && !this.net.policy.isHost) return null;
    const e = new Enemy(key, x, y);
    this.entities.add(e, 'enemies');
    if (e.def.boss) this.boss = e;
    return e;
  }

  /** 树苗生长成树。成长节奏数值等价源自 WorldGen.UpdateWorld 全图均匀采样
   *  （:71507-71632）：每 tick 地下区采 (w×h)×1.5e-05 格（:71622-71631，j∈
   *  [worldSurface-1, h-20)）、地表区采 (w×h)×3e-05 格（:71549-71555，j∈[10,
   *  worldSurface-1)，雨天 ×1.5 :71557-71559，worldUpdateRate=1 Main.cs:734）。
   *  本仓 300 tick 一轮 + 按列切片轮转（saplingScanPlan）：K 轮覆盖全图，
   *  每苗每轮命中概率 = K×300×rate×(w×h)/区格数 → 单 tick 期望与原版逐点等价
   *  （p_tick = rate×(w×h)/区格数，见 plan 函数头推导），且玩家视野外的苗同样生长
   *  （旧实现只扫玩家附近 60×40，视野外永不生长——限域近似已废） */
  private growSaplings() {
    const st = this.world.store;
    const grown: Array<[number, number]> = [];
    const plan = saplingScanPlan(st.w, st.h, this.world.groundLevel,
      Math.floor(this.tickCount / 300));
    const gemP = plan.gemP;
    const sapP = Math.min(1, plan.sapP * (this.world.weather.raining ? 1.5 : 1)); // :71557-71559
    // 宝石树苗 590（AttemptToGrowTreeFromSapling case 590，:72924-72960）：必须地下
    // （y>worldSurface）；frameX/54 = 宝石序号 → 对应树 583-589；growGemTree 自带
    // 石/苔基座 + 洞穴墙 + 净空全套判定
    const GEM_SAP = TILE_BY_KEY['v_590_gem_saplings'];
    if (GEM_SAP) {
      for (let x = plan.x0; x < plan.x1; x++) {
        for (let y = plan.underY0; y < plan.underY1; y++) {
          if (st.get(x, y) !== GEM_SAP) continue;
          if (y <= this.world.groundLevel) continue; // 必须 underground（原版硬门）
          if (Math.random() >= gemP) continue;       // 原版每帧采样概率折算（见函数头）
          const ii = st.idx(x, y);
          const kind = Math.floor(st.frameX[ii] / 54); // frame 带宽 54（placeStyle×18×fw?）
          const treeSheet = 583 + Math.min(6, Math.max(0, kind));
          // 树干内部帧带宽查 TREE_DEFS（growGemTree 用的带宽与放置一致）
          const treeType = TILE_DEFS.find((d) => d.vanilla?.sheet === treeSheet)?.key;
          const tid = treeType ? TILE_BY_KEY[treeType] : 0;
          if (!tid) continue;
          if (growGemTree(st, new RNG((Math.random() * 1e9) | 0), x, y, tid)) {
            st.setTile(x, y, 0);
            this.chunks.markDirtyArea(x - 6, y - 14, x + 6, y + 2);
          }
        }
      }
    }
    for (let x = plan.x0; x < plan.x1; x++) {
      for (let y = plan.overY0; y < plan.overY1; y++) {
        if (st.get(x, y) !== T.SAPLING) continue;
        // 上方 2-3 格净空才长
        if (st.isActive(x, y - 1) || st.isActive(x, y - 2) || st.isActive(x, y - 3)) continue;
        if (Math.random() < sapP) { // 地表采样率折算（见函数头，原版 :71550/72471）
          grown.push([x, y]);
        }
      }
    }
    for (const [x, y] of grown) {
      const groundY = y + 1;
      // 原版橡实生长走 WorldGen.GrowTree 全套检查(NPC.cs 之外,WorldGen.cs:29924-29969):
      // 基座整砖(!halfBrick&&slope==0)+ 草族适树 + 至少一侧邻格适树——缺侧根地面不长
      const gi = st.idx(x, groundY);
      const FIT_GRASS = new Set([T.GRASS, TILE_BY_KEY['v_23_corrupt_grass_block'], TILE_BY_KEY['v_199_crimson_grass_block'],
        TILE_BY_KEY['v_60_jungle_grass_block'], TILE_BY_KEY['v_70_mushroom_grass_block'], T.SNOW]);
      const fitTile = (xx: number, yy: number) => {
        if (!st.inBounds(xx, yy)) return false;
        const ii = st.idx(xx, yy);
        return !!st.flags[ii] && !st.half[ii] && st.slope[ii] === 0 && FIT_GRASS.has(st.type[ii]);
      };
      if (!fitTile(x, groundY)) continue;
      if (!fitTile(x - 1, groundY) && !fitTile(x + 1, groundY)) continue;
      const th = 5 + Math.floor(Math.random() * 4);
      st.setTile(x, y, 0);
      for (let dy2 = 1; dy2 <= th; dy2++) {
        if (!st.inBounds(x, groundY - dy2)) break;
        if (st.isActive(x, groundY - dy2)) break;
        st.setTile(x, groundY - dy2, T.TREE, dy2 === th ? 22 : 0, dy2 === th ? 198 : 0); // 原版帧：顶标记(22,198)+干身(0,0)
      }
      this.world.registerTree(x, groundY - th, th);
      this.chunks.markDirtyArea(x - 4, groundY - th - 4, x + 4, groundY);
    }
  }

  /** 索引帧修复（见 afterWorldLoad 注释）：扫一遍全图多格 vanilla framed 物体 */
  private repairIndexFrames(): void {
    const st = this.world.store;
    let fixed = 0;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        const type = st.type[i];
        if (type === 0 || !st.flags[i]) continue;
        const def = TILE_DEFS[type];
        const fw = def?.vanilla?.fw ?? 0, fh = def?.vanilla?.fh ?? 0;
        if (!def?.vanilla || def.vanilla.frame !== 'style' || fw < 2) continue;
        // 物体块帧汇总（fw×fh 邻域内同型格）
        let maxFx = 0, maxFy = 0, cells = 0, anyNonZero = false;
        for (let dy = 0; dy < fh; dy++) {
          for (let dx = 0; dx < fw; dx++) {
            const xx = x + dx, yy = y + dy;
            if (!st.inBounds(xx, yy)) continue;
            const ii = st.idx(xx, yy);
            if (st.type[ii] !== type) continue;
            cells++;
            const fx = st.frameX[ii], fy = st.frameY[ii];
            if (fx > maxFx) maxFx = fx;
            if (fy > maxFy) maxFy = fy;
            if (fx !== 0 || fy !== 0) anyNonZero = true;
          }
        }
        // 索引帧特征：≥2 格且全 <18 且非全 0（全 0 是 wld 残缺帧，渲染端另有重建）
        if (cells < 2 || maxFx >= 18 || maxFy >= 18 || !anyNonZero) continue;
        // 只在左上角格修一次（dx=dy=0 的格），避免重复 ×18
        const li = st.idx(x - 1, y);
        const above = st.idx(x, y - 1);
        if (st.inBounds(x - 1, y) && st.type[li] === type) continue;
        if (st.inBounds(x, y - 1) && st.type[above] === type) continue;
        for (let dy = 0; dy < fh; dy++) {
          for (let dx = 0; dx < fw; dx++) {
            const xx = x + dx, yy = y + dy;
            if (!st.inBounds(xx, yy)) continue;
            const ii = st.idx(xx, yy);
            if (st.type[ii] !== type) continue;
            st.frameX[ii] = st.frameX[ii] * 18;
            st.frameY[ii] = st.frameY[ii] * 18;
            fixed++;
          }
        }
      }
    }
    if (fixed) {
      for (let cy = 0; cy < Math.ceil(st.h / 16); cy++) {
        for (let cx = 0; cx < Math.ceil(st.w / 16); cx++) this.chunks.markDirty(cx, cy);
      }
      console.log(`[repairIndexFrames] 修复 ${fixed} 格历史索引帧（索引→像素 ×18）`);
    }
  }

  /** 城镇 NPC 存档快照（原版 WorldFile town NPC 段：位置+home+bound+自定义名） */
  townNpcsForSave(): Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string }> {
    return this.entities.npcs
      .filter((n): n is TownNPC => n instanceof TownNPC && !n.dead)
      .map((n) => ({
        key: n.npcKey,
        x: Math.round(n.x), y: Math.round(n.y),
        home: n.home ? [n.home.x, n.home.y] : null,
        bound: n.bound || undefined,
        givenName: n.givenName,
      }));
  }

  /** 世界事件态存档（原版 header party/灯笼夜段 WF:1361-1368/1381-1384） */
  eventsForSave(): SaveData['events'] {
    return {
      partyManual: this.partyState.manualParty,
      lanternManual: LanternNight.manualLanterns,
      lanternGenuine: LanternNight.genuineLanterns,
      lanternNext: LanternNight.nextNightIsLanternNight,
      lanternCooldown: LanternNight.lanternNightsOnCooldown,
    };
  }

  /** 读档恢复事件态（旧档缺省=无派对无预约） */
  eventsApplySave(ev: SaveData['events'] | undefined): void {
    if (!ev) return;
    this.partyState.manualParty = !!ev.partyManual;
    LanternNight.manualLanterns = !!ev.lanternManual;
    LanternNight.genuineLanterns = !!ev.lanternGenuine;
    LanternNight.nextNightIsLanternNight = !!ev.lanternNext;
    LanternNight.lanternNightsOnCooldown = ev.lanternCooldown ?? 0;
  }

  /** 拾取物品飘名（主角旁浅白文本）。同一时间只保留一个，
   * 新拾取直接替换旧的 —— 不产生拖影，不会误读为多个物品 */
  showPickupLabel(itemKey: string) {
    const def = ITEM_DEFS[ITEM_BY_KEY[itemKey]];
    if (!def) return;
    this.dmgNumbers = this.dmgNumbers.filter((d) => !d.label);
    this.dmgNumbers.push({
      x: this.player.cx, y: this.player.y - 8, vy: -0.7,
      value: 0, crit: false, color: '#F0F0F0', life: 55, label: Lang.itemNameByKey(def.key),
    });
  }

  playSfx(name: string, vol?: number, x?: number, y?: number) {
    this.sfx.play(name as SfxName, vol ?? 1, x, y);
  }

  playSfxFiles(files: string[], vol?: number, x?: number, y?: number) {
    if (!this.sfx.playFiles(files, vol ?? 1, x, y)) this.sfx.play('hit', vol ?? 1, x, y);
  }

  /** 按原版文件名直播（无合成兜底——音色精确的场景如蜂后吼/仪式圈）：
   *  缓冲未就位时触发后台懒加载，本播静默（下次命中真声） */
  playSfxFile(file: string, vol?: number, x?: number, y?: number) {
    this.sfx.playWavFile(file, vol ?? 1, x, y);
  }

  /** 矿车碾过压板轨道（Minecart.HitTrackSwitch → Wiring.HitSwitch，Minecart.cs:1287-1294）：
   *  路由到 Wiring.hitSwitch——压板/轨道族直接 TripWire（Wiring.cs:167-171） */
  hitTrackSwitch(i: number, j: number): void {
    this.wiring?.hitSwitch(i, j);
  }

  /** 拾取物品后刷新 UI（带轻量节流 + 尾包补发，最多延迟 ~166ms） */
  private invNotifyAt = -100;
  private invNotifyPending = false;
  /** 图标图集晚到标记（onVImageLoaded 置位，flushInvNotify 节流刷 UI） */
  private iconUiDirty = false;
  /** iconUiDirty 上次刷 UI 的 tick（冷却节流用） */
  private iconUiAt = -100;
  /** 新物品入手飘名（主角旁浅白文本） */

  notifyInventoryChanged() {
    // 检测新物品：与上次快照比较，新增的种类在主角旁飘名
    const inv = this.player.inv;
    if (!this._invSnapshot) {
      this._invSnapshot = new Map<number, number>();
      for (const s2 of inv.slots) {
        if (s2) this._invSnapshot.set(s2.id, (this._invSnapshot.get(s2.id) ?? 0) + s2.stack);
      }
      return;
    }
    const now = new Map<number, number>();
    for (const s2 of inv.slots) {
      if (s2) now.set(s2.id, (now.get(s2.id) ?? 0) + s2.stack);
    }
    for (const [id, n] of now) {
      const before = this._invSnapshot.get(id) ?? 0;
      if (n > before && this.tickCount - this.lastNotifiedAt > 30) {
        this.lastNotifiedAt = this.tickCount;
        const def = ITEM_DEFS[id];
        if (def) {
          this.dmgNumbers.push({
            x: this.player.cx, y: this.player.y - 6, vy: -0.9,
            value: 0, crit: false, color: '#FFFFFF', life: 60, label: Lang.itemNameByKey(def.key),
          } as DamageNumber & { label: string });
        }
        break; // 每次 refresh 只飘一个
      }
    }
    this._invSnapshot = now;
    if (this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    } else {
      this.invNotifyPending = true;
    }
  }
  private _invSnapshot: Map<number, number> | null = null;
  private lastNotifiedAt = 0;

  private flushInvNotify() {
    if (this.invNotifyPending && this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    }
    // 图标图集晚到的 UI 补刷（冷却 30t 合并突发；此前 %30 对齐 tick 网格,
    // 晚到后最长还要等 0.5s 才自愈——宝箱面板的回退图标可感知地停留）
    if (this.iconUiDirty && this.tickCount - this.iconUiAt >= 30) {
      this.iconUiAt = this.tickCount;
      this.iconUiDirty = false;
      this.cb.onInventoryChanged();
    }
  }

  /** 火把火星：视区内点燃的火把按概率在火点处飘出上浮火粒 */
  private emitTorchSparks() {
    if (this.tickCount % 3 !== 0) return; // 20Hz 足够，省扫描
    const st = this.world.store;
    const cam = this.camera;
    const z = cam.zoom || 1;
    const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE));
    const tx1 = Math.min(this.world.w - 1, Math.ceil((cam.x + cam.viewW / 2 / z) / TILE));
    const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE));
    const ty1 = Math.min(this.world.h - 1, Math.ceil((cam.y + cam.viewH / 2 / z) / TILE));
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== T.TORCH) continue;
        if (Math.random() >= 0.075) continue; // 原版 1/40/帧@60Hz（TileDrawing:7220）≈ 每 3 tick 0.075
        // 火点位置按锚定帧（TileDrawing.cs:7227-7231）：左锚 22→+6、右锚 44→+2、底/墙→+4
        const fx = st.frameX[i];
        const sparkX = fx === 22 ? 6 : fx === 44 ? 2 : 4;
        this.particles.push({
          x: x * TILE + sparkX + Math.random() * 4,
          y: y * TILE + Math.random() * 4,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.35 - Math.random() * 0.4,   // 原版 velocity.Y -= 1.5（上飘）
          life: 16 + Math.random() * 12, maxLife: 28,
          color: Math.random() < 0.55 ? '#FFB642' : Math.random() < 0.5 ? '#FF8A2A' : '#FFD97A',
          size: 1 + Math.random() * 1.2,
          grav: -0.015,  // 微浮力：火星徐徐上飘
          damp: 0.985,
        });
      }
    }
  }

  /** 方块环境粒子（原版 TileDrawing.DrawTiles_EmitParticles Tier 1/2 移植）：
   *  每 3 tick 扫视口，按 sheet 查规则表发射。与 emitTorchSparks 共用节流（火把独立保留 1:1 实现）。 */
  private emitTileParticles() {
    if (this.tickCount % 3 !== 0) return;
    const st = this.world.store;
    const cam = this.camera;
    const z = cam.zoom || 1;
    const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE));
    const tx1 = Math.min(this.world.w - 1, Math.ceil((cam.x + cam.viewW / 2 / z) / TILE));
    const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE));
    const ty1 = Math.min(this.world.h - 1, Math.ceil((cam.y + cam.viewH / 2 / z) / TILE));
    const sheetCache = new Int16Array(TILE_DEFS.length).fill(-2); // -2 未算 / -1 无 sheet
    const sheetOf = (t: number): number => {
      const c = sheetCache[t];
      if (c !== -2) return c;
      const s = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
      sheetCache[t] = s;
      return s;
    };
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (st.type[i] === 0) continue;
        const rules = TILE_PARTICLE_RULES.get(sheetOf(st.type[i]));
        if (!rules) continue;
        const fx = st.frameX[i], fy = st.frameY[i];
        for (const rule of rules) {
          if (Math.random() >= rule.prob) continue;
          if (rule.fx0 !== undefined && fx !== rule.fx0) continue;
          if (rule.fy0 !== undefined && fy !== rule.fy0) continue;
          if (rule.pred && !rule.pred(fx, fy)) continue;
          if (rule.lightGate !== undefined && this.lighting.lightAt(x, y)[0] <= rule.lightGate) continue;
          const [smin, smax] = rule.size ?? [1.5, 3];
          const life = Math.round((rule.life ?? 40) * (0.7 + Math.random() * 0.6));
          const rise = rule.rise ?? 0.4;
          this.particles.push({
            x: x * TILE + (rule.dx ?? 8) + (Math.random() - 0.5) * 4,
            y: y * TILE + (rule.dy ?? 0) + (Math.random() - 0.5) * 4,
            vx: (rule.sideways ?? 0) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.2,
            vy: -rise * (0.7 + Math.random() * 0.6),
            life, maxLife: life,
            color: rule.color,
            size: smin + Math.random() * (smax - smin),
            grav: rule.grav ?? (rise < 0 ? 0.1 : -0.005),
            damp: rule.damp ?? 0.985,
          });
        }
      }
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  // ================= 高门自动通行（DoorOpeningHelper.cs 1:1 简化） =================
  // 玩家 hitbox 与关闭高门(388)矩形 (16×96) 相交且垂直容纳 → 自动 ShiftTallGate 开门；
  // 离开门区（矩形外扩 1px）→ 自动关闭。仅玩家（NPC/敌怪不触发——原版同）。
  private openTallGates = new Map<number, number>(); // 锚点 idx → 开门时刻（tick）
  private updateTallGateAuto() {
    const st = this.world.store;
    const p = this.player;
    if (p.dead) return;
    const CLOSED = TILE_BY_KEY['v_388_tall_gate_closed'];
    const OPEN = TILE_BY_KEY['v_389_tall_gate_open'];
    if (!CLOSED || !OPEN) return;
    // 玩家覆盖格 ±1 扫关闭高门 → 自动开
    const tx0 = Math.floor((p.x - 2) / TILE), tx1 = Math.floor((p.x + p.w + 2) / TILE);
    const ty0 = Math.floor((p.y - 2) / TILE), ty1 = Math.floor((p.y + p.h + 2) / TILE);
    for (let x = tx0; x <= tx1; x++) {
      for (let y = ty0; y <= ty1; y++) {
        if (!st.inBounds(x, y) || st.type[st.idx(x, y)] !== CLOSED) continue;
        const anchor = shiftTallGate(st, x, y, false, (n: string) => this.sfx.play(n as SfxName));
        if (anchor) this.openTallGates.set(st.idx(anchor[0], anchor[1]), this.tickCount);
      }
    }
    // 已开门离开检测：门矩形（外扩 1px）与玩家 hitbox 不相交 → 关
    for (const ai of Array.from(this.openTallGates.keys())) {
      const ax = ai % st.w, ay = Math.floor(ai / st.w);
      if (st.get(ax, ay) !== OPEN) { this.openTallGates.delete(ai); continue; }
      const rect = { x: ax * TILE - 1, y: ay * TILE, w: TILE + 2, h: 5 * TILE };
      const overlap = p.x < rect.x + rect.w && p.x + p.w > rect.x && p.y < rect.y + rect.h && p.y + p.h > rect.y;
      if (!overlap) {
        if (shiftTallGate(st, ax, ay, true, (n: string) => this.sfx.play(n as SfxName))) this.openTallGates.delete(ai);
      }
    }
  }

  /** 火把锚定检查：格 (x,y) 变化后，检查其四邻与自身的火把是否失去支撑 → 掉落 */
  // ================= 下落沙族(原版 SandBallFalling 系触发侧) =================

  /** 消费下落候选队列(每 tick 上限 128,防沙漠整柱同帧尖峰) */
  private drainSandQueue() {
    const st = this.world.store;
    let n = 0;
    while (this.sandQueue.length && n < 128) {
      const [x, y] = this.sandQueue.shift()!;
      n++;
      const t = st.get(x, y);
      if (!Game.FALLING_TILES.has(t)) continue; // 已转换/被挖走
      // 支撑判定:下方实心或平台 → 稳;液体/空气/非实心装饰 → 坠落
      const below = st.get(x, y + 1);
      if (below !== 0) {
        const bd = TILE_DEFS[below];
        if (bd && (bd.solid || bd.platform)) continue;
      }
      // 转 FallingBlock(AI_010):移除 tile(触发监听器 → 上方级联入队)
      st.setTile(x, y, 0);
      this.entities.add(new FallingBlock(x * TILE + 3, y * TILE + 3, TILE_DEFS[t].key), 'projectiles');
    }
  }

  // ================= 训练假人（tile 378 + NPC 488，TETrainingDummy 1:1） =================
  /** 全图扫描 tile 378 锚点生成假人（原版 WorldFile 加载后的 TileEntity 激活） */
  private spawnAllDummies() {
    const st = this.world.store;
    const DUMMY = TILE_BY_KEY['v_378_target_dummy'];
    if (!DUMMY) return;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== DUMMY || st.frameX[i] % 36 !== 0 || st.frameY[i] !== 0) continue;
        this.spawnDummyAt(x, y);
      }
    }
  }

  /** 在锚点生成假人 NPC（TETrainingDummy.Activate L131：NewNPC(x*16+16, y*16+48, 488)；
   *  ai0/ai1 = 锚点坐标）。已存在同锚点假人则跳过。 */
  spawnDummyAt(x: number, y: number) {
    const dup = this.entities.enemies.some((e) => (e as Enemy).vanillaId === 488
      && (e as Enemy).dummyAnchor?.[0] === x && (e as Enemy).dummyAnchor?.[1] === y && !e.dead);
    if (dup) return;
    const e = Enemy.fromVanilla(488, x * 16 + 16, y * 16 + 48);
    if (!e) return;
    e.dummyAnchor = [x, y];
    e.x = x * 16 + 16 - e.w / 2;
    e.y = y * 16 + 48 - e.h;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
  }

  private checkTorchDetach(x: number, y: number) {
    const st = this.world.store;
    const TORCH_ID = T.TORCH;
    for (const [dx, dy] of [[0, 0], [0, -1], [-1, 0], [1, 0]] as const) {
      const tx = x + dx, ty = y + dy;
      if (!st.inBounds(tx, ty)) continue;
      const i = st.idx(tx, ty);
      if (st.type[i] !== TORCH_ID) continue;
      if (torchStillAnchored(st, tx, ty, st.frameX[i])) continue;
      st.setTile(tx, ty, 0);
      this.spawnDrop(tx * TILE + 8, ty * TILE, 'torch', 1);
      this.sfx.play('dig');
    }
  }

  spawnParticles(
    x: number, y: number, color: string, count: number, speed = 2,
    opts: { life?: number; damp?: number; grav?: number; size?: number } = {},
  ) {
    const base = opts.life ?? 40;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const life = Math.round(base * (0.6 + Math.random() * 0.4));
      this.particles.push({
        x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 1,
        life, maxLife: life, color, size: opts.size ?? 2 + Math.random() * 2,
        damp: opts.damp, grav: opts.grav,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  /** 定向粒子爆发（GameHooks.spawnBurst）：烟花爆花/喷泉/马桶水花的原版 dust
   *  带初速方向与轴向压缩（Projectile.cs Kill/AI 各循环的速度档与 x/y 乘数）。
   *  角度 = dir ± spread；速度系数 0.85+rand*0.2 对齐原版喷泉的
   *  `spinningpoint *= 0.85 + NextDouble()*0.2`（Projectile.cs:29388-29390 等） */
  spawnBurst(
    x: number, y: number, color: string, count: number, speed: number,
    dir: number, spread: number,
    opts: { life?: number; damp?: number; grav?: number; xMul?: number; yMul?: number } = {},
  ) {
    const base = opts.life ?? 40;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * 2 * spread;
      const sp = speed * (0.85 + Math.random() * 0.2);
      const life = Math.round(base * (0.6 + Math.random() * 0.4));
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp * (opts.xMul ?? 1),
        vy: Math.sin(a) * sp * (opts.yMul ?? 1),
        life, maxLife: life, color, size: 2 + Math.random() * 2,
        damp: opts.damp, grav: opts.grav,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  setZoom(z: number) {
    if (!this.camera) return;
    this.camera.setZoomTarget(z);
  }

  // ================= 合成 =================

  itemId(key: string): number {
    return ITEM_BY_KEY[key];
  }

  stationsNearby(): Set<string> {
    const st = this.world.store;
    const px = Math.floor(this.player.cx / TILE), py = Math.floor(this.player.cy / TILE);
    const found = new Set<string>(['hand']);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const t = st.get(px + dx, py + dy);
        if (t === T.WORKBENCH) found.add('workbench');
        if (t === T.FURNACE) found.add('furnace');
        if (t === T.ANVIL) found.add('anvil');
      }
    }
    return found;
  }

  canCraft(r: (typeof RECIPES)[number]): boolean {
    if (!this.stationsNearby().has(r.station)) return false;
    return r.inputs.every(([key, n]) => this.player.inv.countOf(ITEM_BY_KEY[key]) >= n);
  }

  craft(r: (typeof RECIPES)[number]) {
    if (!this.canCraft(r)) return;
    for (const [key, n] of r.inputs) this.player.inv.remove(ITEM_BY_KEY[key], n);
    this.player.inv.add(ITEM_BY_KEY[r.out], r.count);
    this.cb.onInventoryChanged();
  }

  // ================= 原版配方（1456 全量 2688 条） =================

  /** 附近站点集合（内部 tile id）+ 液体/群系 → VanillaCraftCtx（每帧缓存由 UI 调用侧刷新） */
  vanillaNearbyStations(): Set<number> {
    const st = this.world.store;
    const out = new Set<number>();
    const px = Math.floor(this.player.cx / TILE), py = Math.floor(this.player.cy / TILE);
    const ALCHEMY = new Set<number>(); // 炼金台 sheet 355/699
    for (const k of ['v_355_alchemy_table', 'v_699_deadcellspotionstation']) {
      const t = TILE_BY_KEY[k];
      if (t !== undefined) ALCHEMY.add(t);
    }
    // 液体源（Player.cs:35235-35243：liquid>200 且 liquidType 0水/2蜜/1岩浆；
    // CountsAsWaterForCrafting tile 172 水槽/207 也算水）
    this._nearLiquid = { water: false, honey: false, lava: false };
    for (let dx = -20; dx <= 20; dx++) {
      for (let dy = -15; dy <= 15; dy++) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        const ii = st.idx(x, y);
        if (st.isActive(x, y)) {
          const t = st.type[ii];
          out.add(t);
          if (ALCHEMY.has(t)) this._alchemyTable = true;
          // CountsAsWaterForCrafting（水槽 172/207 近似：本仓库按 sheet 判）
          const sheet = TILE_DEFS[t]?.vanilla?.sheet;
          if (sheet === 172 || sheet === 207) this._nearLiquid.water = true;
        }
        if (st.liquid[ii] > 200) {
          // 本仓库 liquidType 编码：1=水 2=岩浆 3=蜂蜜 4=微光（TileStore）——
          // 原版 Player.cs:35235-35243 的 0水/1岩浆/2蜜 不可直抄（曾三支全错：
          // water 落在无类型 0、honey/lava 互反 → 近蜜/近岩浆合成门错配）
          const lt = st.liquidType[ii];
          if (lt === 1) this._nearLiquid.water = true;
          else if (lt === 2) this._nearLiquid.lava = true;
          else if (lt === 3) this._nearLiquid.honey = true;
        }
      }
    }
    return out;
  }
  private _nearLiquid = { water: false, honey: false, lava: false };

  /** 可用原版配方列表（Recipe.UpdateRecipeList 主干；供 UI 列表渲染） */
  private _alchemyTable = false;
  vanillaAvailableRecipes() {
    return availableRecipes(this.player.inv, {
      nearbyInternal: this.vanillaNearbyStations(),
      nearWater: this._nearLiquid.water, nearHoney: this._nearLiquid.honey, nearLava: this._nearLiquid.lava,
      zoneSnow: this.scene.zoneSnow,
      zoneGraveyard: this.scene.zoneGraveyard,
    });
  }

  /** 执行原版配方合成（CraftingRequests.CraftLocally 主干）：扣材料→成品入背包 */
  vanillaCraft(r: VanillaRecipeLike, times = 1) {
    if (!consumeMaterials(this.player.inv, r, times, this._alchemyTable)) return;
    const outKey = recipeItemKey(r.create);
    if (!outKey) return;
    const left = this.player.inv.add(ITEM_BY_KEY[outKey], r.createStack * times);
    if (left > 0) this.spawnDrop(this.player.cx, this.player.y, outKey, left); // 背包装不下→掉落
    this.sfx.play('tink');
    this.cb.onInventoryChanged();
  }

  /** 合成产出入包（vanillaCraft 的产出半段，供现代合成网格的格子合成复用） */
  vanillaCraftOutput(r: VanillaRecipeLike): void {
    const outKey = recipeItemKey(r.create);
    if (!outKey) return;
    const left = this.player.inv.add(ITEM_BY_KEY[outKey], r.createStack);
    if (left > 0) this.spawnDrop(this.player.cx, this.player.y, outKey, left);
    this.sfx.play('tink');
    this.cb.onInventoryChanged?.();
  }

  /** 星星斗篷落星（Player.SpawnStar 近似）：附近敌人上空召 3 颗星（投射物 92，伤 30） */
  private spawnStarCloakStars(): void {
    const p = this.player;
    const targets = this.entities.enemies
      .filter((e) => {
        const en = e as Enemy;
        return !en.dead && Math.abs(en.cx - p.cx) < 420 && Math.abs(en.cy - p.cy) < 300;
      })
      .slice(0, 3) as Enemy[];
    if (!targets.length) return;
    for (const t of targets) {
      this.entities.add(new Arrow(
        t.cx + (Math.random() - 0.5) * 120, t.cy - 320, 0, 0,
        Math.round(30 * p.damageMult('magic')), 3, 92, null,
      ), 'projectiles');
    }
    this.sfx.play('bowShoot');
  }

  // ---- 重铸（哥布林工匠，Main.cs:41024-41042 + ReforgeItemInReforgeSlot :41346） ----

  /** 重铸费用 = value × stack ÷ 3 × 折扣（:41026-41032 discountAvailable 0.8）。
   *  vi_ 物品注册期 value=1 占位——权威值查 vanilla-itemvalue.json（extract-itemrare.mjs） */
  reforgeCost(item: { id: number; stack: number }): number {
    const def = ITEM_DEFS[item.id];
    if (!def) return 0;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    const value = (vid >= 0 ? ITEM_VALUE[String(vid)] : undefined) ?? def.value ?? 0;
    const cost = Math.max(1, Math.floor((value * item.stack) / 3));
    return this.player.equipStats.discount ? Math.max(1, Math.floor(cost * 0.8)) : cost;
  }

  /** 该物品能否重铸（Item.CanHavePrefixes → GetRollablePrefixes != null） */
  canReforge(item: { id: number }): boolean {
    const def = ITEM_DEFS[item.id];
    if (!def) return false;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    if (vid < 0) return false;
    return rollablePrefixes(vid, !!def.accessory) !== null;
  }

  /** 执行重铸（ReforgeItemInReforgeSlot :41346-41351：ResetPrefix + Prefix(-2)）。
   *  成功：扣费、写回 item.prefix 并返回新词缀号；失败（钱不够/不可重铸）返回 -1 */
  doReforge(item: { id: number; stack: number; prefix?: number }): number {
    const def = ITEM_DEFS[item.id];
    if (!def) return -1;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    const pool = vid >= 0 ? rollablePrefixes(vid, !!def.accessory) : null;
    if (!pool || !pool.length) return -1;
    const cost = this.reforgeCost(item);
    if (this.coinsOwned() < cost || !this.spendCopper(cost)) return -1;
    item.prefix = rollPrefix(pool, true);
    this.sfx.play('tink'); // SoundID.Item37（非最优档）；最优档音效未接
    this.cb.onInventoryChanged?.();
    return item.prefix;
  }

  // ================= 召唤 Boss =================

  /** 通用 Boss 召唤:vanilla 数据路径(NPC 13=世吞头带体节链 / 50=史莱姆王 / 266=克脑) */
  /** 进洞计分（GolfHelper.PutBallInCup :85-121 + GolfState.cs:151-160）：
   *  score = ⌊位移tile ÷ (杆数+2)⌋ × 系数（2 杆以上 SetScoreTime→1.0；一杆进洞
   *  golfScoreTime/3600）；>0 才累计；聊天广播 + 计时重置 */
  golfBallScored(ball: GolfBall): void {
    const distTiles = Math.floor(ball.dist / TILE);
    const denom = ball.swings + 2; // hitsMade+2（GolfBallTrackRecord.cs:13-19）
    const factor = ball.swings > 1 ? 1 : this.golfScoreTime / 3600;
    const score = Math.floor(distTiles / denom) * (ball.swings > 1 ? 1 : factor);
    this.golfScoreTime = 0; // ResetScoreTime
    if (ball.swings > 0 && score > 0) {
      this.player.golferScoreAccumulated = Math.min(1e9, this.player.golferScoreAccumulated + Math.floor(score));
      this.newText(Lang.text('Game.BallBounceResultGolf_' + (ball.swings > 1 ? 'Plural' : 'Single'),
        ball.swings, Math.floor(score)), 50, 255, 130);
    }
  }

  /** 收竿结算（Player.cs:51530-51598 ItemCheck_CheckFishingBobber）：物品掉落 /
   *  血月敌怪（浮标处；618 +64px）/ 682 红城镇史莱姆一次性入镇 */
  private reelBobber(bobber: Bobber): void {
    const caught = bobber.reel(this);
    if (caught > 0) {
      const key = VANILLA_ITEM_KEY_BY_ID[caught];
      if (key) this.spawnDrop(bobber.cx, bobber.cy - 8, key, 1, 0, -2);
      this.cb.onInventoryChanged?.();
    } else if (bobber.catchEnemy > 0) {
      const id = bobber.catchEnemy;
      if (id === 682) {
        this.world.flags.unlockedSlimeRedSpawn = true; // 世界级一次性（WorldFile :1413/:2433 持久化）
        const slime = new TownNPC('town_slime_red', bobber.cx, bobber.cy);
        this.entities.add(slime, 'npcs');
        this.cb.onToast(Lang.itemName(682) ?? '红色城镇史莱姆加入了小镇！');
      } else {
        const en = Enemy.fromVanilla(id, bobber.cx - 8, bobber.cy - 8 + (id === 618 ? 64 : 0));
        if (en) this.entities.add(en, 'enemies');
      }
      this.cb.onInventoryChanged?.();
    }
    bobber.dead = true;
  }

  summonBoss(key: string): void {
    if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    this.summonBossAtTx(key, tx);
  }

  /** 指定落点列召唤(summonBoss 的位置化变体;守卫老人诅咒在地牢上空召唤骷髅王) */
  private summonBossAtTx(key: string, tx: number): void {
    if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
    // 联机访客不召唤（Boss 权威在房主——本地召唤=幽灵 Boss 不同步；召唤物也不消耗）
    if (this.net && !this.net.policy.isHost) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossHostOnly'));
      return;
    }
    const st = this.world.store;
    tx = Math.max(2, Math.min(st.w - 3, tx));
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (st.type[st.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    const vanillaId = key === 'eye_of_cthulhu' ? 4 : key === 'eater_of_worlds_head' ? 13 : key === 'king_slime' ? 50 : key === 'brain_of_cthulhu' ? 266
      : key === 'skeletron_head' ? 35 : key === 'queen_bee' ? 222 : key === 'skeletron_prime' ? 127
      : key === 'destroyer' ? 134 : key === 'twins' ? 125 : key === 'wall_of_flesh' ? 113
      : key === 'lunatic_cultist' ? 439 : key === 'empress_of_light' ? 636 : key === 'queen_slime' ? 657
      : key === 'plantera' ? 262 : key === 'duke_fishron' ? 370 : key === 'moon_lord' ? 398 : key === 'golem' ? 245 : -1;
    if (vanillaId >= 0 && Enemy.fromVanilla) {
      const head = Enemy.fromVanilla(vanillaId, tx * TILE + 8, spawnY);
      if (head) {
        this.entities.add(head, 'enemies');
        this.boss = head;
        if (vanillaId === 13) {
          // 世吞体节链(原版 15-30 段)
          const segs = Enemy.spawnWormChain(head, 15 + Math.floor(Math.random() * 16));
          for (const sg of segs) this.entities.add(sg, 'enemies');
        }
        if (vanillaId === 125) {
          // 双子:同场生成第二只 126(原版机械魔眼双召;击败记账以 125 为准)
          const twin = Enemy.fromVanilla(126, (tx + 4) * TILE + 8, spawnY);
          if (twin) { twin.id = this.entities.nextId++; this.entities.add(twin, 'enemies'); }
        }
        if (vanillaId === 134) {
          // 毁灭者:地下落位(原版 SpawnNPC 走地下生成;80 段链由 destroyerAI 首帧补)
          head.y = Math.min(st.h - 10, Math.floor(this.world.rockLevel) + 30) * TILE;
        }
        if (vanillaId === 113) {
          // 血肉墙:地狱层落位(原版向导巫毒娃娃入熔岩;2 眼+11 饥饿者由 AI 首帧补)
          head.y = Math.min(st.h - 30, Math.floor(this.world.lavaLine || st.h - 200) + 5) * TILE;
        }
        // 召唤公告+音效（每 Boss 独立，见 bossSummonAnnounce/注释）
        this.announceBossSummon(vanillaId);
        return;
      }
    }
    this.spawnEnemy(key, tx * TILE + 8, spawnY);
    this.sfx.playWav('roar');
    this.cb.onToast(Lang.misc(9));
  }

  /** Boss 召唤公告 + 音效（1.4.5.6 语义）：
   *  文本：SpawnOnPlayer 末尾 switch（NPC.cs:81495-81511）——default 走
   *  Announcement.HasAwoken（"{名}已苏醒！"）；双子 125 专项 Lang.misc[48]；
   *  126/398（部件/第二只）不播；月总 398 用 Enemies.MoonLord（"月亮领主"）。
   *  颜色 ChatColors.BossOrEvent = (175,75,255)（onChat 未接线时回退 toast）。
   *  音效：ItemCheck_UseBossSpawners（Player.cs:43083+）统一 SoundID 15 Roar；
   *  唯一例外 Abeemination(蜂后) → SoundID.Item173。 */
  private announceBossSummon(vanillaId: number): void {
    const announce = (text: string) => {
      if (this.cb.onChat) this.cb.onChat(text, 175, 75, 255);
      else this.cb.onToast(text);
    };
    if (vanillaId === 125) {
      announce(Lang.misc(48));                              // 双子魔眼已苏醒！
    } else if (vanillaId !== 126) {
      // 398 月总：原版播 Enemies.MoonLord（NPC.cs:81358-81360），不取 MoonLordCore 名
      const name = vanillaId === 398
        ? Lang.text('Enemies.MoonLord')
        : (Lang.npcName(vanillaId) ?? vanillaNpc(vanillaId)?.name ?? '???');
      announce(Lang.text('Announcement.HasAwoken', name));
    }
    this.sfx.playWav(vanillaId === 222 ? 'beeSummon' : 'roar');
  }

  useSuspiciousEye() {
    if (this.world.clock.isDay) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      return;
    }
    if (this.boss) return;
    // 从远处地表生成（离玩家 ~55 格），Boss 会自己飞过来
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (this.world.store.type[this.world.store.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    // fromVanilla(4) 取原版 NPC_4 贴图(6 帧)+rotation;数值与 ENEMY_DEFS 一致(2800/15/12/0)
    const e = Enemy.fromVanilla(4, tx * TILE + 8, spawnY);
    if (e) {
      e.id = this.entities.nextId++;
      this.entities.add(e, 'enemies');
      this.boss = e;
    }
    // 公告+音效与 summonBoss 同语义（EoC → "克苏鲁之眼已苏醒！" + Roar）
    this.announceBossSummon(4);
  }

  /** 地图传送：在目标点附近找可容纳主角的空间（2 格高净空 + 站立地面）。
   *  优先目标点自身，然后螺旋外扩到 24 格内就近安置 */
  /** 传送前贴图就位门:目标区域 ±160 类型扫描 → 预载 → 再落位。
   *  多数表已加载时扫描+命中检查 <10ms(无感);跨群系首传才真正等待加载 */
  private async teleportWhenReady(tx: number, ty: number): Promise<void> {
    const a = this.atlas;
    if (a) {
      const { tileSheets, wallIds } = this.collectSheetsAround(tx, ty, 160);
      // 全部已就位 → 零延迟直传;有缺 → 提示并等待(通常 <1s)
      const missing = [...tileSheets].some((id) => {
        const m = a.vanilla.tiles[String(id)];
        return m && !a.vimages.has(m.sheet);
      }) || [...wallIds].some((id) => {
        const m = a.vanilla.walls[String(id)];
        return m && !a.vimages.has(m.sheet);
      });
      if (missing) this.cb.onToast(Lang.text('Mods.SandboxWorld.Progress.LoadTeleportTex'));
      await a.preloadTileSheetsFor(tileSheets, wallIds);
    }
    if (this.teleportNear(tx, ty)) {
      this._tpTarget = null;
      this.renderer.tpMark = null;
      this.renderer.fullMap.open = false;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.Teleported'));
    }
  }

  private teleportNear(tx: number, ty: number): boolean {
    const st = this.world.store;
    const p = this.player;
    // 玩家盒 20×42（Player.cs:55083）——宽跨 2 列、高跨 3 行，落位必须按实际碰撞盒校验：
    // 此前 y=(ty-1)*TILE 使脚底嵌入地面 10px（(ty-1)*16+42=ty*16+26 越入实心行），
    // 且只查 1 列 2 行 → 头顶/侧向穿墙"卡半格"。现按"脚底贴地面顶"精确对齐。
    const clearBox = (x0: number, yTop: number, yBot: number) => {
      for (const cx of [x0, x0 + 1]) {
        for (let y = yTop; y <= yBot; y++) {
          if (!st.inBounds(cx, y) || st.isSolid(cx, y)) return false;
          if (st.liquid[st.idx(cx, y)] > 100) return false;
        }
      }
      return true;
    };
    // (x, floorY)：floorY 行两列实心 + 其上 3 行两列净空（42px 身高）
    const fitsFloor = (x: number, floorY: number) => {
      for (const cx of [x, x + 1]) {
        if (!st.inBounds(cx, floorY) || !st.isSolid(cx, floorY)) return false;
      }
      return clearBox(x, floorY - 3, floorY - 1);
    };
    // 落位：脚底 = 地面顶（floorY*TILE），盒顶在其上 42px
    const placeOnFloor = (x: number, floorY: number) => {
      p.x = x * TILE; p.y = floorY * TILE - p.h;
      p.vx = 0; p.vy = 0;
      this.camera.x = p.cx; this.camera.y = p.cy;
    };
    if (fitsFloor(tx, ty + 1)) {
      placeOnFloor(tx, ty + 1);
      return true;
    }
    // 螺旋外扩找最近可站位置（floorY 为地面行）
    for (let r = 1; r <= 24; r++) {
      let done = false;
      for (let dx = -r; dx <= r && !done; dx++) {
        for (let dy = -r; dy <= r && !done; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (fitsFloor(tx + dx, ty + dy + 1)) {
            placeOnFloor(tx + dx, ty + dy + 1);
            done = true;
          }
        }
      }
      if (done) return true;
    }
    // 高空/无地面：允许落在空中（两列 × 3 行净空，重力会带下来；脚底对齐格底）
    for (let dy = 0; dy <= 6; dy++) {
      for (const sy of [ty - dy, ty + dy]) {
        if (clearBox(tx, sy - 2, sy)) {
          p.x = tx * TILE; p.y = (sy + 1) * TILE - p.h;
          p.vx = 0; p.vy = 0;
          this.camera.x = p.cx; this.camera.y = p.cy;
          return true;
        }
      }
    }
    this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.TeleportSolid'));
    return false;
  }

  /** Main.NewText(Main.cs:64095):左下角消息列。颜色 = ChatColors.cs 五色。
   *  width = NewTextMultiline 的 WidthLimit（Main.cs:64101，广播盒 460px 折行），
   *  缺省 -1 = 不限（ChatMonitor 默认宽度） */
  newText(text: string, r = 255, g = 255, b = 255, width = -1): void {
    this.cb.onChat?.(text, r, g, b, width);
  }

  /** Announcement 类消息便捷封装(NPC.cs/WorldGen.cs BroadcastChatMessage 语义) */
  announce(key: string, who: string, r: number, g: number, b: number): void {
    this.newText(Lang.text(key, who), r, g, b);
  }

  // ================= 重生 =================

  /** 玩家死亡瞬间：原版死亡文本 + 红色粉碎粒子 + 掉落物理墓碑（Player.DropTombstone） */
  private _deathHandled = false;
  private handlePlayerDeath() {
    const p = this.player;
    // 死亡文本（Lang.CreateDeathMessage 1:1：generic/摔落/溺水/岩浆/凶手 NPC）
    const cause = p.lastDamageCause ?? { kind: 'default' } as const;
    const deathText = createDeathText(this.playerName(), cause);
    // 原版 Player.cs:38312-38313:死亡消息走消息列,色 (225,25,25)
    this.newText(deathText, 225, 25, 25);
    // 红色粉碎粒子：身体范围多层爆散，喷溅落地反弹/停驻后缓慢淡出（约 5 秒）
    this.spawnParticles(p.cx, p.y + 8, '#C02020', 22, 3.2, { life: 300, damp: 0.988, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy, '#8A1010', 16, 2.4, { life: 280, damp: 0.985, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy - 6, '#E85050', 10, 2.8, { life: 260, damp: 0.988, grav: 0.09 });
    // 墓碑（Player.DropTombstone 1:1）：按身家选款式，从死亡点抛射坠落，落格安放+碑文
    this.entities.add(new Tombstone(p.cx, p.cy, this.coinsOwned(), deathText, p.facing), 'props');
  }

  /** 身家（铜币计价）——商店/重铸扣费与墓碑金币门槛（>100000 → 金墓碑 527-531）。
   *  同时计 legacy coin_* 与原版 vi_71-74 两套钱币（wld 导入的钱币是后者） */
  coinsOwned(): number {
    const p = this.player;
    const n = (key: string, mult: number) => {
      const id = ITEM_BY_KEY[key];
      return id !== undefined ? p.inv.countOf(id) * mult : 0;
    };
    return n('coin_copper', 1) + n('coin_silver', 100) + n('coin_gold', 10000) + n('coin_platinum', 1000000)
      + n('vi_71_CopperCoin', 1) + n('vi_72_SilverCoin', 100) + n('vi_73_GoldCoin', 10000) + n('vi_74_PlatinumCoin', 1000000);
  }

  /** 角色名（死亡文本/墓碑碑文用；未命名回退） */
  playerName(): string {
    return this.player.appearance?.name?.trim() || Lang.text('Mods.SandboxWorld.DefaultPlayerName');
  }

  respawnPlayer() {
    const p = this.player;
    // 硬核角色已消亡（Player.cs:16894 difficulty==2 死亡后 ghost=true 不再重生；
    // 本仓最小集 = hardcoreDead 标记 → 不允许重生，死亡画面停留）
    if (p.appearance?.hardcoreDead) return;
    p.hp = p.maxHp;
    p.dead = false;
    p.iframes = 90;
    p.respawnTimer = 0;
    p.immuneAlpha = 0;
    this.lostCoins = 0;
    p.x = this.world.spawnX * TILE + 8;
    p.y = (this.world.spawnY - 3) * TILE;
    p.vx = 0; p.vy = 0;
    // 呼吸/岩浆宽限重置（Player.cs:37158 lavaTime=lavaMax / :37173 breath=breathMax；
    // 旧实现两者都没重置——戴护身符重生后进岩浆会被误判宽限已耗尽）
    p.breath = p.breathMax;
    p.breathCD = 0;
    p.lavaImmuneTicks = p.equipStats.lavaMax;
  }

  // ================= 渲染 =================

  render() {
    const cam = this.camera;
    const L = this.lighting;
    this.renderer.scene = this.scene; // 群系背景（BiomeBackground）每帧注入最新环境采样
    this.renderer.deathLostCoins = this.lostCoins; // 死亡 UI「掉了{0}」每帧注入
    this.renderer.annotateMarks = this.annotateMode ? this.marks : null;
    // 背包开合（Main.playerInventory 语义）→ 呼吸计锚点分支（Main.cs:42838/42845）
    this.renderer.playerInventory =
      (window as unknown as { __swUI?: { inventoryOpen?: boolean } }).__swUI?.inventoryOpen ?? false;
    // 导线可见性:手持电路工具(mech)或 F7 强制(Main.cs:43548 DrawWires 开关语义)
    const held = this.player.inv.heldItem();
    this.renderer.showWires = this.forceShowWires || !!held && !!ITEM_DEFS[held.id]?.wireTool;
    const hover = (this.input.uiBlocking || this.renderer.timeUiHover) ? null : (() => {
      // 智能光标激活：hover 指向策略选出的目标格（渲染层据此画原版黄框 + 方向箭头）
      const sc = this.smartCursor;
      if (sc.showing && this.world.store.inBounds(sc.x, sc.y)) {
        // 方向箭头显示门（Main.cs:46058-46065）：锁向下一格须 !active 或可替换块，
        // 否则传 null——渲染层见 null 即不画箭头（SmartCursor.smartCursorArrowAllowed）
        const arrow = sc.lockedDirection
          && smartCursorArrowAllowed(this.world.store, sc.x, sc.y, sc.lockedDirection)
          ? sc.lockedDirection : null;
        return { x: sc.x, y: sc.y, smart: true as const, arrow };
      }
      const [tx, ty] = cam.tileUnder(this.input.mouseX, this.input.mouseY);
      return this.world.store.inBounds(tx, ty) ? { x: tx, y: ty } : null;
    })();
    // 宏伟蓝图拖拽预览:锚点已按下且鼠标悬停有效格时,把 L 路径交给渲染器
    this.renderer.grandPreview = this.grandAnchor && hover
      ? { from: this.grandAnchor, to: [hover.x, hover.y], mode: this.wireToolMode }
      : null;
    this.renderer.render(
      cam, this.world, this.world.clock, this.chunks,
      L.r, L.g, L.b, L.rx, L.ry, L.rw, L.rh,
      this.player,
      this.entities.all(),
      this.particles, this.dmgNumbers,
      this.swing, hover,
      this.boss ? { name: this.boss.vanillaId != null ? Lang.npcName(this.boss.vanillaId) ?? this.boss.def.name : this.boss.def.name, hp: this.boss.hp, maxHp: this.boss.maxHp, cx: this.boss.cx, cy: this.boss.cy } : null,
      this.input.mouseX, this.input.mouseY, this.input.mouseDown,
      this.mining ? Math.min(1, this.mining.progress / this.hardnessCache) : 0,
      this.lighting.clock, // FlickerClock：资源条亮度/呼吸（mouseTextColor/cursorScale）
      this.remotePlayerProxies,
      // 入侵进度条（DrawInvasionProgress :47071；nearInvasion 显示门=屏内 ±5000px 有本组 NPC）
      (() => {
        const w = this.world;
        // 月事件分支（CheckInvasionProgressDisplay :47006-47016：snowMoon/pumpkinMoon
        // 先于常规入侵；name=LegacyInterface.83 霜月 / 84 南瓜月，pct=waveKills/lookup[wave]；
        // 显示门 = 夜晚 + 玩家在地表 + 屏内 ±5000px 有本组 NPC，组号 -kind）
        if (w.moonEvent.kind !== 0) {
          const group = -w.moonEvent.kind;
          const need = REQUIRED_POINTS[w.moonEvent.waveNumber] ?? 0;
          // wave20 需求恒 0（lookup[20]=0）——原版仍显示（Main.cs:47006-47016 无 need>0 门）：
          // 文案 arg1 换 Game.InvasionPoints（:47163）、进度条满格（:47167-47170）
          if (!w.clock.isDay && this.player.cy <= w.groundLevel * 16) {
            for (const e of this.entities.enemies) {
              const en = e as unknown as { x: number; y: number; vanillaId?: number | null };
              if (en.vanillaId != null && MOON_EVENT_GROUP[en.vanillaId] === group
                && Math.abs(en.x - this.player.cx) < 5000 && Math.abs(en.y - this.player.cy) < 5000) {
                const pct = need > 0 ? Math.min(1, w.moonEvent.waveKills / need) : 1;
                const label = need > 0 ? undefined : Lang.text('Game.WaveMessage',
                  w.moonEvent.waveNumber,
                  Lang.text('Game.InvasionPoints', Math.floor(w.moonEvent.waveKills)));
                return { name: Lang.inter(w.moonEvent.kind === MOON_KIND_PUMPKIN ? 84 : 83),
                  pct, label };
              }
            }
          }
          return null;
        }
        if (w.invasionType <= 0 || w.invasionSizeStart <= 0) return null;
        const nameKey = w.invasionType === INVASION_PIRATE ? 86 : w.invasionType === INVASION_SNOW_LEGION ? 87 : 88;
        for (const e of this.entities.enemies) {
          const en = e as unknown as { x: number; y: number; vanillaId?: number | null };
          if (en.vanillaId != null && INVASION_GROUP[en.vanillaId] === w.invasionType
            && Math.abs(en.x - this.player.cx) < 5000 && Math.abs(en.y - this.player.cy) < 5000) {
            return { name: Lang.inter(nameKey), pct: (w.invasionSizeStart - w.invasionSize) / w.invasionSizeStart };
          }
        }
        return null;
      })(),
    );
  }

  /** 加入联机服务器（mainFlow 的加入流程调用；world 就绪回调内进 loadWorld）。
   *  v3 房间制：url = ws://host:port/<房间码>[?token=<房主令牌>]，hostToken 传入时
   *  Hello 内兜底再传一份（路由层已从 URL 注入） */
  joinNetGame(url: string, onProgress?: (label: string, p: number) => void, hostToken = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null; // R10 握手超时句柄（fail 时清除）
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        net.disconnect();
        if (this.net === net) this.net = null;
        reject(new Error(reason));
      };
      const net = new ClientNet(this, {
        onProgress: (label, p) => onProgress?.(label, p),
        onWorldReady: (world) => {
          this.net = net;
          net.gameWorld = world;
          // 重连自愈（review ③）：世界重组装后清本地真掉落的 netId 与差分基准——
          // 断连窗口丢失的 spawn 上报由此重播，陈旧 netDropSeen 条目也不再发幽灵 take
          for (const ent of this.entities.drops) {
            const d = ent as ItemDrop;
            if (!d.netPuppet) d.netId = 0;
          }
          this.netDropSeen.clear();
          // 终审 H2：傀儡三表+差分基准+箱子 watch+远端代理全清——entities.clear() 后
          // 旧傀儡成孤儿（不在桶里 dead=false），同 netId 快照会命中孤儿只做 netSnapTo
          // 不重新入桶 → 重连后怪/弹幕对访客永久隐形，孤儿 NPC 还能用陈旧 netAx 摸你
          this.netNpcPuppets.clear();
          this.netDropPuppets.clear();
          this.netProjPuppets.clear();
          this.netNpcLast.clear();
          this.netProjLast.clear();
          this.netChestWatch.length = 0;
          this.remotePlayerProxies = [];
          // 进世界（settled：世界已在服务器沉降过；tileReporter 注入上报链）
          world.store.netReporter = (op) => net.reportTileOp(op);
          // 实体同步钩子（Enemy.hurt 傀儡分支 → StrikeNPC 上报）
          entityNet.reportStrike = (netId, rawDmg, kbx, kby) => net.sendStrike(netId, rawDmg, kbx, kby);
          this.loadWorld(world, (label, p) => onProgress?.(label, p), { settled: true }).then(() => {
            // 终审 H1：SSC 暂存消费——loadWorld 完成后新 Player 就绪，此刻应用才不丢
            if (net.pendingSSC) {
              const json = net.pendingSSC;
              net.pendingSSC = null;
              this.netApplySSC(json);
            }
            if (settled) return;
            settled = true;
            resolve();
          }, (e) => fail(`世界加载失败：${(e as Error).message}`));
        },
        onSectionArrived: (rect) => {
          // R3：晚到 strip 标脏（chunk 重烘焙 + 光照；200×20 逐格 mark 低频可接受）
          const st = this.world.store;
          for (let y = rect.y0; y < rect.y0 + rect.h; y += 4) {
            for (let x = rect.x0; x < rect.x0 + rect.w; x += 4) {
              if (st.inBounds(x, y)) this.chunks.markDirtyAround(x, y);
            }
          }
          this.lighting.dirty = true;
        },
        onChat: (text: string, r: number, g: number, b: number) => this.newText(text, r, g, b),
        onKick: (reason) => {
          this.cb.onToast?.(reason);
          fail(reason);
        },
        onPolicy: (policy) => {
          // 保护房提示：非房主告知受控范围（房主静默）
          if (!policy.isHost && (policy.protectTiles || policy.protectItems)) {
            const parts: string[] = [];
            if (policy.protectTiles) parts.push(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles'));
            if (policy.protectItems) parts.push(Lang.text('Mods.SandboxWorld.Toast.RoomProtectItems'));
            this.cb.onToast?.(parts.join('；'));
          }
        },
        onChestSync: (chestIdx, x, y, items) => this.netApplyChest(chestIdx, x, y, items),
        onNpcSnapshot: (snaps) => this.netApplyNpcSnaps(snaps),
        onItemOp: (op) => this.netApplyItemOp(op),
        onProjectileSync: (snaps) => this.netApplyProjSnaps(snaps),
        onProjDespawn: (ids) => this.netRemoveProjPuppets(ids),
        // onSSC 不再即用——msg201 改暂存（net.pendingSSC），loadWorld 完成后应用（终审 H1 竞态）
        onStrike: (netId, dmg, kbx, kby) => this.netApplyStrike(netId, dmg, kbx, kby),
        onHp: (slot, hp, maxHp) => {
          const rp = net.players.get(slot);
          if (rp) { (rp as unknown as { hp?: number }).hp = hp; (rp as unknown as { maxHp?: number }).maxHp = maxHp; }
        },
      });
      net.connect(url, hostToken);
      // R10：30s 握手超时（fail 内统一 clearTimeout,终审 B4 修正：原 void timer 空转）
      timer = setTimeout(() => {
        if (!settled && !net.gameWorld) fail('连接超时');
      }, 30000);
    });
  }

  private lastStripReq = '';

  /** 每逻辑帧后处理挥舞命中（在 fixedUpdate 实体更新后调用） */
  postUpdate() {
    // 联机 pump：tile 上报冲洗 + 玩家状态节流发送（docs §4.2）
    if (this.net?.active) {
      this.net.tick();
      // R3 移动续传：跨条带（200×20）边界时向服务器请求周围 strip
      if (this.tickCount % 30 === 0 && this.net.gameWorld) {
        const sx = Math.floor(this.player.cx / 16 / 200);
        const sy = Math.floor(this.player.cy / 16 / 20);
        const key = sx + ',' + sy;
        if (key !== this.lastStripReq) {
          this.lastStripReq = key;
          this.net.requestSection(this.player.cx, this.player.cy);
        }
      }
    }
    this.updateSwingHits();
    // 远端玩家模拟（每逻辑 tick：控制位驱动物理 + netOffset 平滑，对齐原版远端玩家）
    if (this.net?.active) this.simulateRemotePlayers();
    // 箱子槽位差分上报（15 tick 轮询；UI/快捷堆叠等所有变更源统一捕获）
    if (this.net?.active && this.tickCount % 15 === 0) this.netChestPoll();
    // v3 实体同步：房主 NPC 快照 + 双向弹幕/掉落 + 傀儡清扫/接触伤害
    if (this.net?.active) {
      if (this.tickCount % 4 === 0) {
        if (this.net.policy.isHost) this.netNpcBroadcast();
        this.netProjBroadcast();
        this.netDropSweep();
      }
      if (this.tickCount % 30 === 0) this.netSweepPuppets();
      if (!this.net.policy.isHost) { this.netPuppetContact(); this.netPuppetProjContact(); }
    }
  }

  /**
   * 联机远端玩家模拟（对齐原版 MessageBuffer.cs case 13 + Player.UpdateNetOffset）：
   * 远端玩家在本端用同步的控制位+速度跑移动物理（有移动过程、动画帧由速度派生）；
   * 每个权威包的位置差注入 netOffset，渲染时叠加并逐 tick 收敛（<2px 归零，
   * 每步 max(2, len×0.1)；超 300px=Main.multiplayerNPCSmoothingRange 直接归零）。
   * 物理只取移动子集——环境伤害/液体细判等权威在各自客户端，避免双端分叉。
   */
  private simulateRemotePlayers() {
    const net = this.net!;
    const list: Player[] = [];
    for (const [slot, rp] of net.players) {
      if (!rp.active || slot === net.mySlot) continue;
      let proxy = this.remotePlayerProxies.find((p) => (p as unknown as { __netSlot?: number }).__netSlot === slot);
      if (!proxy) {
        proxy = new Player(rp.x, rp.y, new Inventory()); // R11：独立空背包——不共享本地 inv
        (proxy as unknown as { __netSlot?: number }).__netSlot = slot;
      }
      // 新权威包（原版 case 13：netOffset += 模拟位置 - 权威位置；超限归零；硬设权威 pos/vel）
      if (rp.fresh) {
        rp.fresh = false;
        proxy.netOffX += proxy.x - rp.x;
        proxy.netOffY += proxy.y - rp.y;
        if (Math.hypot(proxy.netOffX, proxy.netOffY) > 300) { proxy.netOffX = 0; proxy.netOffY = 0; }
        proxy.x = rp.x; proxy.y = rp.y;
        proxy.vx = rp.vx; proxy.vy = rp.vy;
      }
      // 控制位 → 输入（原版：远端玩家以同步的 control* 跑 Player.Update）。
      // P1.1 AOI 配套：>1.5s 无 msg13（超出对端视野被过滤/断流）→ 冻结输入，
      // 防陈旧控制位驱动的"幽灵行走"（静止心跳 1s，正常通路不会触发）。
      // review C5：useItem 一并冻结——否则断流后代理原地无限空挥
      const stale = performance.now() - rp.lastFresh > 1500;
      proxy.inputX = stale ? 0 : (rp.left ? -1 : 0) + (rp.right ? 1 : 0);
      proxy.inputJump = !stale && rp.jump;
      proxy.inputDown = !stale && rp.down;
      proxy.inputUp = !stale && rp.up;
      proxy.facing = rp.facing;
      proxy.dead = rp.dead;
      // R11'.外观合并：仅接受含 hair 的完整对象（空对象会令纸娃娃读 X.r 崩溃）。
      // review C10：仅在外观串变化时解析（msg4 才变）——60TPS×每玩家 JSON.parse 纯浪费
      {
        const meta = proxy as unknown as { __netAppearance?: string };
        if (meta.__netAppearance !== rp.appearance) {
          meta.__netAppearance = rp.appearance;
          try {
            const parsed = JSON.parse(rp.appearance) as Record<string, unknown>;
            if (parsed && typeof parsed.hair === 'number') proxy.appearance = parsed as never;
          } catch { /* 保持默认外观 */ }
        }
      }
      // 物品/装备（msg5）：拷入代理背包——手持物 holdStyle/挥舞动画/盔甲纸娃娃渲染依赖。
      // 数组直接共享（代理只读不写，远端真权威在各自客户端）
      const bag = net.remoteItems.get(slot);
      if (bag) {
        proxy.inv.slots = bag.inv;
        proxy.inv.armor = bag.armor;
        proxy.inv.dye = bag.dye;
        proxy.inv.selected = Math.min(rp.selectedItem, 9); // 快捷栏 0-9（heldItem 依赖）
      }
      // useItem 位 → 远端挥舞动画（原版：远端客户端以 controlUseItem 跑 ItemCheck 设置
      // itemAnimation；此处派生等价 swing——时长按本地同公式，攻速配饰差异忽略）
      if (!stale && rp.useItem) {
        const heldId = proxy.inv.heldItem()?.id ?? -1;
        if (!proxy.swingNet || proxy.swingNet.item !== heldId || proxy.swingNet.t <= 0) {
          proxy.swingNet = { t: this.remoteSwingDur(heldId), dur: this.remoteSwingDur(heldId), item: heldId };
        } else proxy.swingNet.t--;
      } else if (proxy.swingNet) {
        proxy.swingNet.t--;
        if (proxy.swingNet.t <= 0) proxy.swingNet = null;
      }
      this.stepRemoteProxy(proxy);
      // netOffset 衰减（UpdateNetOffset :28240-28270 1:1，碰撞安全项略）
      const len = Math.hypot(proxy.netOffX, proxy.netOffY);
      if (len < 2) { proxy.netOffX = 0; proxy.netOffY = 0; }
      else {
        const k = Math.max(0, len - Math.max(2, len * 0.1)) / len;
        proxy.netOffX *= k; proxy.netOffY *= k;
      }
      list.push(proxy);
    }
    this.remotePlayerProxies = list;
  }

  /** 远端挥舞时长（对齐本地各分支公式，Game.useItem 派生处：剑/近战 max(12,useTime)、
   *  镐斧锤 max(14,speed)、其它 30；攻速配饰倍率远端不可见，取基础值） */
  private remoteSwingDur(itemId: number): number {
    if (itemId < 0) return 30;
    const def = ITEM_DEFS[itemId];
    if (!def) return 30;
    const cw = combatWeapon(def);
    if (def.tool?.type === 'sword' || cw?.kind === 'melee') return Math.max(12, cw?.useTime ?? def.tool?.speed ?? 42);
    if (def.tool && (def.tool.type === 'pick' || def.tool.type === 'axe' || def.tool.type === 'hammer')) return Math.max(14, def.tool.speed ?? 46);
    return 30;
  }

  /** 远端代理移动子集物理（与 Player.fixedUpdate 同参数：加速/摩擦/跳跃/重力/碰撞/动画） */
  private stepRemoteProxy(p: Player) {
    const st = this.world.store;
    // 液体粗判（游泳减速/上浮需要；同 Player 采样：脚底上方 4px）
    p.inWater = st.liquid[st.idx(Math.floor(p.cx / TILE), Math.floor((p.y + p.h - 4) / TILE))] > 100;
    const ix = p.inputX;
    if (ix !== 0) {
      p.vx += ix * PLAYER_WALK_ACCEL * (p.inWater ? 0.6 : 1);
      p.facing = ix;
    } else {
      p.vx *= p.onGround ? PLAYER_FRICTION : PLAYER_AIR_FRICTION;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }
    const maxSpd = PLAYER_WALK_MAX * (p.inWater ? 0.55 : 1);
    p.vx = Math.max(-maxSpd, Math.min(maxSpd, p.vx));
    if (p.inWater) {
      if (p.inputJump) p.vy = Math.max(p.vy - 0.62, -4.4);
      p.vy += GRAVITY * 0.3;
      p.vy = Math.max(-4.6, Math.min(3.0, p.vy));
    } else {
      if (p.inputJump && p.onGround) { p.vy = -PLAYER_JUMP_SPEED; p.jumpHold = PLAYER_JUMP_TICKS; }
      if (p.inputJump && p.jumpHold > 0) { p.vy -= 0.22; p.jumpHold--; } else p.jumpHold = 0;
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL_SPEED);
    }
    if (!p.inputJump && p.vy < -2) p.vy = -2;
    p.dropThrough = !!p.inputDown;
    moveAndCollide(p, this.world, p.vx, p.vy);
    if (Math.abs(p.vx) > 0.3 && p.onGround) p.animTime += Math.abs(p.vx);
    else p.animTime = 0;
  }
}

// 游戏主控制器：状态、主循环、挖掘/放置/战斗/生成/存档的总装
import { Achievements } from './Achievements';
import { GrappleProj } from '../entities/GrappleProj';
import { hookItemOf, HOOK_PROJ_STATS } from '../data/grappleHooks';
import { GRAPPLE_LATCH } from '../entities/GrappleProj';
import { Research } from '../stats/Research';
import { PetFollower } from '../entities/PetFollower';
import { alignmentPcts, dryadWorldStatus } from '../world/WorldAlignment';
import { petInfoOfVid } from '../data/vanillaPets';
import { statOfInternal } from '../data/vanillaItemStats';
import { vanillaIdOfItem } from '../stats/Shimmer';
import { computeSellValue, canSellFromShopUi, expectedPrices, itemValueWithPrefix, buybackShelfStack } from '../stats/SellChain';
import { PREFIX_NAMES } from '../data/vanillaPrefixes';
import { TILE, CHUNK, SPAWN_MIN_DIST, SPAWN_MAX_DIST, GRAVITY, MAX_FALL_SPEED, PLAYER_WALK_ACCEL, PLAYER_WALK_MAX, PLAYER_FRICTION, PLAYER_AIR_FRICTION, PLAYER_JUMP_SPEED, PLAYER_JUMP_TICKS } from './constants';
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
import { openDoor, closeDoor, clearDoorAt, shiftTallGate, isLockedDoor, unlockDoor } from '../world/Door';
import { torchAnchorFrame, torchStillAnchored, torchStyleOfItemKey, isWaterTorchStyle } from '../world/Torch';
import { xmasDecorOfItem, xmasCell, xmasDecorStyle, xmasSetDecor, xmasDecorItem } from '../world/XmasTree';
import { TorchGodEvent } from '../world/TorchGod';
import { findFreeHouse, WALL_HOUSE } from '../world/Housing';
import {
  INVASION_GOBLIN, INVASION_NONE, INVASION_PIRATE, INVASION_SNOW_LEGION, INVASION_MARTIAN,
  INVASION_GROUP, KILL_WEIGHT, invasionActive, canStartInvasion, startInvasion,
  tickInvasion, invasionWarningMisc, shouldSpawnInvasionEnemies,
} from '../world/Invasion';
import {
  TreeShakeState, TREE_SHAKEABLE_SHEETS, shakeTree,
  type TreeShakeHost, type TreeShakeSinks, type TreeShakeNpcOpts,
} from '../world/TreeShake';
import {
  MOON_KIND_FROST, MOON_KIND_PUMPKIN, MOON_EVENT_GROUP, REQUIRED_POINTS,
  moonEventActive, startMoonEvent, stopMoonEvent, addMoonEventKill,
  invasionWaveText,
} from '../world/MoonEvent';
import {
  TOWER_KEY, TOWER_ZONE_RADIUS, isTowerId, isTowerMinion,
  triggerLunarApocalypse, onTowerKilled, updateLunarApocalypse,
  towerBoltTarget, onTowerBoltHit, tickMoonLordCountdown, type LunarHost,
} from '../world/LunarEvent';
import {
  dawnEclipseRoll, useSolarTablet, endEclipseAtDusk, type EclipseHost,
} from '../world/Eclipse';
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
import { dryadMoonPhaseStock, skeletonMerchantMoonPriceMul } from '../data/townNpcProfiles';
import travelshopJson from '../data/vanilla-travelshop.json';
import { TileStore, LIQUID_TYPE } from '../world/TileStore';
import { paintTile, paintWall, paintDustColor, type PaintDustHook } from '../world/Paint';
import { Wiring, TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR, TOOL_CUTTER } from '../world/Wiring';
import {
  attachDevices, geyserTrap, switchMB, switchFountain, switchMonolith,
  musicBoxRecordItem, musicBoxDropItemOf, fountainDropItemOf, announcementBoxMessage,
  MUSIC_BOX_EMPTY_VID,
} from '../world/wiring/devices';
import { newPartyState, partyIsUp, toggleManualParty, partyCheckNight, partyWorldClear, partyNaturalAttempt, type PartyState } from '../world/wiring/party';
import { LanternNight } from '../world/LanternNight';
import {
  setFireFlyChance, cultistRitualUpdateTime, cultistTabletDestroyed, cultistWorldClear,
  mysticLogs, type CultistHost, type FairyHost,
} from '../world/evolution/RuntimeEvents';
import type { SaveData } from '../save/serialize';
import { placePortal as placePortalAt, portalRegistry, clearPortals, type Portal } from '../entities/Portal';
import {
  rollExtractinatorDrop, extractinatorMode, extractinatorUseTime, mathRand,
  CHLOROPHYTE_TRADES, findExtractinatorChest,
  extractinatorConsumeFromChest, type ExtractDrop,
} from '../world/Extractinator';
import { TILE_DEFS, T, TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../data/tiles';
import { framedCellFrame } from '../world/FurnitureStyle';
import {
  FURNITURE_TILE_KIND, furnitureAnchor, furniturePlaceSingle, furniturePopSingle,
  furnitureTryBreak, furnitureTakeFirst, dollPlace, hatRackPlace, removeFurnitureAt,
  furnitureSlotCount, fitsFurniture, critterAnchorPlace, critterAnchorBreakDrop,
  kiteAnchorPlace, kiteAnchorBreakDrop, critterAnchorAt, kiteAnchorAt,
  type FurnitureKind,
} from '../world/FurnitureItems';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, PLACE_TILE_ON_ALT_USE } from '../data/items';
import { ANGLER_QUEST_ITEMS, rollAnglerQuest, rollAnglerRewards, seededRng, fishingPowerMultiplier } from '../data/vanillaFishing';
import { VI, VI_ID, VI_KEY } from '../data/itemKeys';
import { vanillaNpc, TOWN_NPC_IDS, getGemSquirrelToSpawn, getGemBunnyToSpawn, soundTrackFiles } from '../data/vanillaNpcs';
import { DebugSummonPanel } from './DebugSummonPanel';
import { itemCombat, AMMO_ARROW, combatWeapon, thrownCombat, viIdFromKey, projGravity, projGravSpec, resolveAmmoProjId, rangedAmmoWeapon, type CombatWeapon } from '../data/vanillaItemCombat';
import { itemUseSoundWav } from '../data/itemUseSound';
import { hairDyeShaderOfItem } from '../data/vanillaHairDyes';
import { applyFrostBurn, applyMagmaStoneSwing } from '../entities/projStatus';
import { itemFuncOfVid, itemFuncOfInternal } from '../data/vanillaItemFunc';
import { dropsAllItemsOnDeath, dropsCoinsOnDeath, FEMALE_VARIANTS } from '../player/Appearance';
/** 原版 buff id → BuffType 反查（vi_ 药水桥接用；BUFF_DEFS.vanillaBuff 与原版编号一致） */
const BUFF_BY_VANILLA = new Map<number, BuffType>();
for (const [bt, d] of Object.entries(BUFF_DEFS)) BUFF_BY_VANILLA.set(d.vanillaBuff, Number(bt) as BuffType);
import { projectileData } from '../data/vanillaProjectiles';
import { VanillaSpawner, MOON_BOSS_IDS, type LunarSpawnCtx } from '../world/spawn/VanillaSpawner';
import { ENEMY_DEFS } from '../data/enemies';
import { availableRecipes, consumeMaterials, craftSourcesFor, vanillaItemKey as recipeItemKey, type CraftItemSource, type VanillaRecipeLike } from '../data/vanillaRecipes';
import { invIndexOfVanilla } from '../data/vanillaRecipes';
import { recordBannerKill, bannerOfNpc, bannerItemId, scanBannerNpcs, bannerReceivedMult } from '../world/Banners';
import { openBossBag, BOSS_BAG_IDS } from '../data/vanillaBossBags';
import { rollablePrefixes, rollPrefix, prefixStat } from '../data/vanillaPrefixes';
import vanillaValueJson from '../data/vanilla-itemvalue.json';
const ITEM_VALUE = vanillaValueJson as Record<string, number>;
import { Player } from '../entities/Player';
import { Enemy, visEffectFrames } from '../entities/Enemy';
import { resetMechQueen, anyMechBossUp } from '../entities/mechQueen';
import { spawnMechQueenEnsemble } from '../entities/bossAI';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { scanScene, EMPTY_SCENE, type SceneFlags } from '../world/SceneMetrics';
import { scanLuckScene, rollLuck } from '../stats/Luck';
import { bindScaleStatsWorld, scaleStatsWorldOf, mainExpertMode, mainMasterMode, damageVar } from '../stats/ScaleStats';
import {
  bindJourneyPowers, journeyPowers, shouldDisableSpawns,
  FAR_PLACEMENT_RANGE_X, FAR_PLACEMENT_RANGE_Y, DEFAULT_TILE_RANGE_X, DEFAULT_TILE_RANGE_Y,
} from '../world/JourneyPowers';
import { pickMusic, newMusicState, MUSIC_SLOT, resolveEventMusic, isOldOnesArmy, type MusicState } from '../data/Music';
import { Tombstone } from '../entities/Tombstone';
import { resetGorePool, liveGorePieces, setGoreScreen, GorePiece } from '../entities/GorePiece';
import { Lang } from '../i18n/Lang';
import { clearPaperDollCache } from '../player/PaperDoll';
import { portraitUrl } from '../data/npcPortraits';
import { tileRunner } from '../world/gen/vanilla/TileRunner';
import { growGemTree } from '../world/gen/vanilla/TreePass';
import { lastGenState } from '../world/gen/WorldGen';
import { spawnEmote, tickEmotes } from '../render/EmoteBubble';
import { createDeathText } from '../i18n/RandomText';
import { inOpposingTeam, meleeEnchantOf, statusPvPMelee, statusPvPProjectile } from '../stats/Pvp';
import { Critter } from '../entities/Critter';
import { attemptToFindTeleportSpot } from '../entities/fighterFamilies';
import { HealProj } from '../entities/HealProj';
import { CoinPortalProj } from '../entities/CoinPortalProj';
import { DebrisProj } from '../entities/DebrisProj';
import { crackedChainKill, isCrackedSheet, isCrackedAt } from '../world/CrackedBricks';
import {
  LeashedEntityManager, KITE_ITEM_PROJ, anchorStyleOfItem, placeStyleOfVid, ITEM_MAKE_NPC,
  LEASHED_SUB_FULL, LEASHED_SUB_PARTIAL, LEASHED_SUB_REMOVE, LEASHED_SUB_PLACE_REQUEST,
  LEASHED_SUB_RETRIEVE_REQUEST,
  LEASHED_KIND_CRITTER, LEASHED_KIND_KITE,
  type LeashedNetMsg, type LeashedCritterEntity, type LeashedKiteEntity,
} from '../entities/LeashedCritter';
import { internalIdOfVid, applyLeashedRetrieve } from '../net/leashedSync';
/** 血月腐化变换表（AttemptToConvertNPCToEvil :93122-93149：[腐化, 猩红]）——
 *  兔 46/企鹅 303/海鸥 337/蚱蜢? 443/鼠 540 → 47/464；金鱼族 55/230/592/593 → 57/465；
 *  松鼠 148/149 → 168/470 */
const BLOOD_MOON_EVIL = new Map<number, readonly [number, number]>([
  [46, [47, 464]], [303, [47, 464]], [337, [47, 464]], [443, [47, 464]], [540, [47, 464]],
  [55, [57, 465]], [230, [57, 465]], [592, [57, 465]], [593, [57, 465]],
  [148, [168, 470]], [149, [168, 470]],
]);
import { CRITTER_DEFS, CRITTER_BY_KEY, CRITTER_CATCH_BY_NPC, CRITTER_RELEASE_BY_ITEM, CRITTER_KEY_BY_NPC } from '../data/critters';
import { EntityManager, Entity } from '../entities/Entity';
import { Camera } from '../render/Camera';
import { countsAsACritter, isNpcValidForBestiaryKillCredit, bestiaryEntries, bestiaryCreditId } from '../data/Bestiary';

// F10 瞬移落脚搜索参数(角色 20×42 ≈ 2 宽×3 高净空 + 脚下实心)
const TELEPORT_FIT_W = 2, TELEPORT_FIT_H = 3, TELEPORT_RING_MAX = 60;
import { ChunkCache } from '../render/ChunkCache';
import { Renderer, Particle, DamageNumber, Minimap } from '../render/Renderer';
import { LightingEngine } from '../lighting/LightingEngine';
import { updateLightDecay } from '../lighting/lightTables';
import { Inventory, INV_SIZE, ACC_ARMOR_START, coinIndexOf, COIN_VALUES, COIN_KEYS } from '../items/Inventory';
import {
  instrumentNotePitch, instrumentUseSound, drumSoundFile, bubbleWandGoreRoll,
} from '../items/FunItems';

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
import { BuffType, BUFF_DEFS, wetFromBubbleContact } from '../stats/Buffs';
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
import { Arrow, prefetchProjectiles, PIRANHA_PROJ, PIRANHA_LIFE } from '../entities/Arrow';
import { resetCageAnim } from '../render/CritterCage';
import { prefetchTrapProjectiles } from '../entities/Dart';
import { hitPlayer, statusPlayer } from '../entities/projTargets';
import { DukeSharknadoBolt, DukeSharknadoTornado, MLDeathray } from '../entities/bossAI_duke_moonlord';
import { LunarOrb } from '../entities/bossAI_lunar_misc';
import { spawnWOF } from '../entities/bossAI_wof';
import { Boomerang, SpearProj, YoyoProj, FlailProj, FlaironSpike, GrenadeProj, GlowstickProj, TorchGodProj, PowderProj, YOYO_RANGE, YOYO_TOP, YOYO_LIFE, CounterweightProj, MolotovProj, DaybreakFlare } from '../entities/WeaponProj';
import { RainbowBolt } from '../entities/RainbowProj';
import { PrismProj, ChargedBlaster } from '../entities/PrismProj';
import { MagicMissileProj, StarfuryStar, FlyingKnifeProj } from '../entities/MissileProj';
import { SkyDragonSpin, SkyDragonSwing, SkyDragonShot, SkyDragonCircle } from '../entities/SkyDragonFury';
import { NebulaBlazeBolt, LunarFlareStar } from '../entities/LunarNebula';
import { Celeb2Muzzle, Celeb2Rocket } from '../entities/Celeb2';
import { SwingArc, TrueNightsEdgeSlash, NightsEdgeFly, ZenithSword, randomFractalProfile, LightsBaneSlash, GrassSlash } from '../entities/SwingArc';
import { SolarEruptionWhip } from '../entities/SolarEruption';
import { TideSlash } from '../entities/TideSlash';
import { FirstFractalSlash } from '../entities/FirstFractal';
import { ChainsawProj } from '../entities/ChainsawProj';
import { MinionProj } from '../entities/MinionProj';
import { WhipProj } from '../entities/WhipProj';
import { Bobber, bobberProjIdFor } from '../entities/Bobber';
import { type InfoAccCtx, mphOf } from '../stats/InfoAccs';
import { npcRarityOf } from '../data/vanillaNpcs';
import { GolfBall, GOLF_CLUBS, golfShot, golfBallInStance } from '../entities/GolfBall';
import { GolfState } from '../world/golf/GolfState';
import { golfVanillaTileId } from '../world/golf/golfPhysics';
import { golferShopScoreGates } from '../world/golf/golferShop';
import { MeteorChunk } from '../entities/MeteorChunk';
import { FallingStar, nightStarfallBoost } from '../entities/FallingStar';
import { dropMeteor, type MeteorHost } from '../world/MeteorFall';
import { computeHappiness, type BiomeZones, type HappinessReportLine } from '../data/vanillaHappiness';
import { Minecart, CART_MOUNT_TEXTURES, DEFAULT_CART_TEXTURE, WOOD_CART_MOUNT } from '../entities/Minecart';
import { mountOfItem, isCartMount, DRILL_PICK_POWER, DRILL_PICK_TIME, smoothSlopeAt } from '../entities/Mounts';
import { getOnTrack, frameTrack, frameTrackArea, placeTrack, trackItemId, TRACK_SHEET } from '../world/MinecartTrack';
import { canHit, canHitLine } from '../physics/LineOfSight';
import { FallingBlock } from '../entities/FallingBlock';
import { MagicProj } from '../entities/MagicProj';
import { firePortalGun } from '../entities/PortalGunBolt';
import type { DropExtras } from '../drops/NpcDrops';
import { npcValueOf } from '../drops/NpcDrops';
import { VanillaDust } from '../fx/VanillaDust';
import { flameParticles } from '../fx/FlameParticles';
import { createBrickBoxForWallOfFlesh, startHardmode } from '../world/gen/vanilla/HardmodePass';

const FIXED_DT = 1 / 60;
/** 原版 AmmoID.Bullet（与 AMMO_ARROW=40 同源，AmmoID.cs） */
const AMMO_BULLET = 14;

/** 枪族专属 UseSound 武器（Item.cs SetDefaults）：
 *  Item_36 霰弹枪族（Shotgun 534 / Boomstick 964 / OnyxBlaster 3788 / QuadBarrel 4703）；
 *  Item_41 手枪族（Handgun 164 / PhoenixBlaster 219 / VenusMagnum 1255 / ChainGun 1929 /
 *  Revolver 2269 / Gatligator 2270）。其余枪械走 Item_11 通用枪声 */
const GUN_SHOTGUN_VIDS = new Set([534, 964, 3788, 4703]);
const GUN_HANDGUN_VIDS = new Set([164, 219, 1255, 1929, 2269, 2270]);
/** 霰弹族弹丸表（Player.cs:47326-47356/47539-47551 提取）：[minN, maxN, 散布幅度, 散布rand上限]
 *  534 爆管 rand(4,6) ±rand(-40,41)×0.05 / 964 霰弹枪 rand(3,5) ±rand(-35,36)×0.04 /
 *  4703 四管 固定 8（1 主 + 7，原版 π/2 旋转扰动近似同表） */
const SHOTGUN_PELLETS: Record<number, [number, number, number, number]> = {
  534: [4, 5, 0.05, 40],
  964: [3, 4, 0.04, 35],
  4703: [8, 8, 0.05, 40],
};

/** AmmoID.Sets 匹配表与解析已抽至 data/vanillaItemCombat.resolveAmmoProjId
 *  （2026-08-14 火箭族对账）——表与优先级链见彼处注释 */

/** 粉末族物品 → 弹体（ItemID.cs: PurificationPowder 66 → ProjectileID 10 / VilePowder 67
 *  → 11 / ViciousPowder 2886 → 463；Item.cs SetDefaults shoot）。注：其余 shoot=10 的
 *  物品（96/98/434 等）弹体不是粉末云语义，不在此表——按物品 id 精确门禁 */
const POWDER_PROJ_BY_ITEM: Record<number, number> = { 66: 10, 67: 11, 2886: 463 };

/** legacy（无 vid）物品的原版 useStyle 补表——Boss 召唤物与生命水晶在
 *  Item.cs SetDefaults 均为 4（举过头）：544/556/557 机械三王、560 史莱姆王冠、
 *  70 蠕虫食物、1331 血腥脊椎、29 生命水晶、88 可疑眼球 */
// (LEGACY_USE_STYLE 本地键表已随本地物品退役移除:vi_ 全量走 itemfunc.useStyle)
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
  // 113 肉山已从本表移除：事件 19 由上方困难模式链按原版语义投递
  // （SetEventFlagCleared 捕获的是 StartHardmode **之前**的 hardMode——仅首次击杀
  // 触发灯笼夜；本通用路径无条件触发会每次击杀都预约，2026-08-13 修正）
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
// ★583-589 七棵宝石树全在原版表内（:7165-7171），此前漏 588 钻石树（可斧性缺失）
const TILE_AXE_SHEETS = new Set([5, 72, 80, 323, 488, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 704]);
// 地牢砖族（Main.tileDungeon + 41/43/44 裂纹变体）：除数 /2 + 门槛 100
const TILE_DUNGEON_SHEETS = new Set([41, 43, 44, 481, 482, 483]);
// Main.wallDungeon 墙表（Main.cs:10507-10515：7/8/9/94-99）——KillWall_CheckFailure
// （WorldGen.cs:60436）未败骷髅王时地牢墙不可锤/不可被 TileReplacement 替换
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
// (已删除 sheetToInternal/TILE_NO_FAIL 内部 id 换算——2026-08-13 审计:唯一消费点
//  传 sheet,换算后的集合 58 项误命中导致大量方块被一击秒挖;消费点已改用
//  TILE_NO_FAIL_SHEETS 原表)

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
// (NATIVE_ITEM_VID 本地键表已随本地物品退役移除:vi_ 前缀解析全覆盖)
/** 传送族物品（Player.cs:42297-42516）：魔镜 50/手机 3124/冰镜 3199/贝壳手机 5358/
 *  回忆药水 2350/传送药水 2351/魔海螺 4263/恶魔海螺 4819/贝壳手机·出生点 5359/
 *  贝壳手机·海洋 5360/贝壳手机·地狱 5361 */
const TELEPORT_ITEM_VIDS = new Set([50, 3124, 3199, 5358, 2350, 2351, 4263, 4819, 5359, 5360, 5361]);
/** 传送目的地分类 */
type RecallKind = 'spawn' | 'ocean' | 'hell';
/** 永久升级/特殊消耗品使用集(UpdatePermanentBoosters 族+特殊单品) */
const PERMANENT_USE_VIDS = new Set([
  3335, 5337, 5338, 5339, 5341, 5342, 5043, 2756, 4870, 678, 1326, 5335, 1133, 4988, 3601,
  4829, 4830, 4910,   // 宠物许可证（猫/狗/兔，Player.cs:44730-44745 ItemCheck_UsePetLicenses）
]);
/** §4 乐器 + §5 趣味使用集（Player.cs:45892-46024 ItemCheck_PlayInstruments +
 *  :44429-44462 泡泡棒 + :50933-50951 通用 UseSound 段）——逻辑在
 *  src/items/FunItems.ts 纯函数层，本表只做 use 链单点分流 */
const FUN_USE_VIDS = new Set([508, 4673, 856, 1450]);
function dropVanillaId(d: ItemDrop): number {
  return slotVanillaId(d.itemId);
}

/** 内部 item id → 原版 item id（vi_<id>_ 键解析;非 vi_ 键恒 -1） */
function slotVanillaId(itemId: number): number {
  return viIdFromKey(ITEM_DEFS[itemId]?.key ?? '');
}

/** 配饰槽（armor[3..9]，原版 ApplyEquipFunctional :12543-12550）→ 原版 item id 列表 */
export function accessoryVanillaIds(p: Player): number[] {
  const out: number[] = [];
  for (let acc = ACC_ARMOR_START; acc < p.inv.accSlotMax; acc++) {
    const s = p.inv.armor[acc];
    if (s) out.push(slotVanillaId(s.id));
  }
  return out;
}

/** 星光斗篷族反击态（Player.cs:37826-37863）：active = 装备任一族件
 *  （starCloak 880 / starVeil 929 / beeCloak 1247 / manaCloak 982——accfx 仅 880/1247
 *  带 starCloak 位，929/982 会漏检，故并入装备 id 扫描）；
 *  projType 按 override 件优先级 manaCloak 723 > beeCloak 724 > starVeil 725 > 726 */
export function starCloakStarInfo(accVids: number[], starCloakFlag: boolean): { active: boolean; projType: number } {
  const veil = accVids.includes(929), bee = accVids.includes(1247), mana = accVids.includes(982);
  return {
    active: starCloakFlag || veil || bee || mana,
    projType: mana ? 723 : bee ? 724 : veil ? 725 : 726,
  };
}

/** 蜂巢族受击反击掷骰（Player.cs:37871-37907）：数量 num19 =
 *  1 + (Next(3)==0) + (Next(3)==0) + (strongBees(HivePack 3333) && Next(3)==0)；
 *  基伤 num20 = strongBees ? 18 : 13（专家 ×1.5/大师 ×2 由调用侧难度档处理） */
export function beeRetaliateRoll(strongBees: boolean, rnd: () => number): { count: number; base: number } {
  let count = 1;
  if (Math.floor(rnd() * 3) === 0) count++;
  if (Math.floor(rnd() * 3) === 0) count++;
  if (strongBees && Math.floor(rnd() * 3) === 0) count++;
  return { count, base: strongBees ? 18 : 13 };
}

/** 幸运币近战命中掉币掷骰（Player.cs:43892-43916）：币种 71 铜 / Next(10)==0 升 72 银 /
 *  Next(100)==0 升 73 金（顺序覆盖）；stack = Next(1,11)（1-10）；
 *  velocity.Y = Next(-20,1)*0.2、X = Next(10,31)*0.2*direction（玩家朝向）。
 *  门（value>0 && hasLuckyCoin && Next(5)==0）由调用侧判定 */
export function luckyCoinRoll(rnd: () => number, direction: number): { key: string; stack: number; vx: number; vy: number } {
  let key = VI_KEY.COIN.COPPER;
  if (Math.floor(rnd() * 10) === 0) key = VI_KEY.COIN.SILVER;
  if (Math.floor(rnd() * 100) === 0) key = VI_KEY.COIN.GOLD;
  return {
    key,
    stack: 1 + Math.floor(rnd() * 10),
    vx: (10 + Math.floor(rnd() * 21)) * 0.2 * direction,
    vy: (Math.floor(rnd() * 21) - 20) * 0.2,
  };
}

/** 瓦罐 style→钱币乘子原始值（SpawnThingsFromPot switch 1:1，WorldGen.cs:57110-57162）。
 *  消费侧一律先过 `(n*2+1)/3` 变换（:57163）：钱币量 num16 *= num（:57714）、
 *  传送门 range = 500/((num+1)/2)（:57185）。金字塔罐 25-27 n=10→×7 与 1/125
 *  双料全游戏最高；28-30 地狱罐 hardMode 才 4（:57152-57156 Main.hardMode）。 */
export function potCoinMul(style: number, hardMode: boolean): number {
  if (style >= 4 && style <= 6) return 1.25;
  if (style >= 7 && style <= 9) return 1.75;
  if (style >= 10 && style <= 12) return 1.9;
  if (style >= 13 && style <= 15) return 2.1;
  if (style >= 16 && style <= 18) return 1.6;
  if (style >= 19 && style <= 21) return 3.5;
  if (style >= 22 && style <= 24) return 1.6;
  if (style >= 25 && style <= 27) return 10;
  if (style >= 28 && style <= 30) return hardMode ? 4 : 1;
  if (style >= 31 && style <= 33) return 2;
  if (style >= 34 && style <= 36) return 1.25;
  return 1;   // style 0-3 及其余
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
  const starter = [VI_KEY.STARTER.SHORTSWORD, VI_KEY.STARTER.PICK, VI_KEY.STARTER.AXE];
  starter.forEach((key, i) => {
    const id = ITEM_BY_KEY[key];
    if (id !== undefined) inv.slots[i] = { id, stack: 1 };
  });
}

/** NPC 对话框按钮 id（与 ui/NpcDialog.ts NpcButtonId 同形；quest = 渔夫任务交付） */
export type NpcButtonId = 'shop' | 'heal' | 'curse' | 'collect' | 'reforge' | 'quest' | 'happiness' | 'status' | 'close';

export interface GameCallbacks {
  onWorldReady: () => void;
  onInventoryChanged: () => void;
  onToast: (msg: string) => void;
  /** 成就解锁弹窗(原版 InGamePopups 底部居中;UI 实现,缺省回退 onToast) */
  onAchievementPopup?: (name: string, title: string) => void;
  /** 原版 Main.NewText 消息列(Main.cs:64095 → LegacyChatMonitor;RGB 0-255) */
  /** width = NewTextMultiline WidthLimit（-1 不限；广播盒 460） */
  onChat?: (text: string, r: number, g: number, b: number, width?: number) => void;
  /** NPC 对话框(SetTalkNPC):name/chat/buttons → UI 渲染 */
  onNpcDialog?: (name: string, chat: string, buttons: Array<{ id: NpcButtonId; label: string }>, portrait?: string | null) => void;
  onNpcDialogClose?: () => void;
  /** 哥布林重铸界面（Main.InReforgeMenu） */
  onReforgeOpen?: () => void;
  /** 商店面板(SetupShop):条目(图标由 UI 按原版 id 补)+ 当前铜币；
   *  happinessMul = 快乐度价格乘子（Main.cs:41231-41243 标题旁表情/百分比显示用）；
   *  buyback = 卖回货架条目下标（Chest.AddItemToShop 的 buyOnce 克隆，购买时
   *  回传给 npcShopBuy 以区分常规货） */
  onNpcShop?: (title: string, items: Array<{ key: string; vanillaId: number; name: string; price: number; buyback?: number }>, copper: number, happinessMul?: number) => void;
  /** NPC 快乐度详情浮层（ReportHappiness.Interact）：报告逐条文案 + 价格乘子 */
  onNpcHappiness?: (info: { name: string; lines: string[]; priceMul: number }) => void;
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
  /** 梳妆台右键更衣窗（Main.OpenClothesWindow Main.cs:43568）：1.4 起梳妆台不是
   *  储物容器（Player.cs:32461-32479 直接开更衣界面），外观随角色存档持久化 */
  onClothesWindow?: (appearance: import('../player/Appearance').Appearance) => void;
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
  /** Journey 研究内核（Research：need 表 6089 条 + 覆盖 12 对 + event 45 半数门） */
  research = new Research();
  /** 成就系统（AchievementManager + AchievementsHelper 移植；跨世界 localStorage 持久化） */
  achievements = new Achievements(
    typeof localStorage !== 'undefined'
      ? { load: () => localStorage.getItem('sbw.achievements.v1'), save: (s) => localStorage.setItem('sbw.achievements.v1', s) }
      : null,
  );
  /** 黑暗视野（buff 80 Blackout）：updateLightDecay ×0.85 */
  blackout = false;
  entities = new EntityManager();
  /** 拴绳实体（LeashedEntity 等价，Main.cs:17895 UpdateEntities/:22163 DrawEntities）：
   *  锚桩 724 拴绳小动物 + 风筝桩 723 风筝——生命周期随 furnitureItems 记录
   *  （放置 spawn / 破坏 removeAt / 读档 respawnAll），实体本身不落盘 */
  leashed = new LeashedEntityManager();
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
  /** 旅程 SkipToTime 落点（相位翻转帧由昼夜事件块收尾应用，Main.SkipToTime :64657） */
  private pendingTimeSkip: number | null = null;
  /** 信息列图标点击边沿(防按住连切) */
  private _infoAccClickLatch = false;
  /** 上一 tick 的夜内时间（0-32400t；鹿角怪 16200t 午夜跨越检测，Main.cs:64602-64603） */
  private _lastNightTicks = 0;
  private _prevRightDown = false;
  private _scopeZoomed = false;
  private _scopePrevZoom = 1;
  /** 狙击镜 1858 / 侦察镜 4005 */
  private hasScopeAcc(): boolean {
    for (let i = 3; i < 10; i++) {
      const s = this.player.inv.armor[i];
      if (!s) continue;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (vid === 1858 || vid === 4005) return true;
    }
    return false;
  }
  private _prevMouseDown = false;
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
  /** 摇树状态（WorldGen.treeShakeX/Y + numTreeShakes，WorldGen.cs:4353-4359）——
   *  每树每日一摇；黎明/换世界清空（Main.cs:64846 / WorldGen.cs:6896） */
  private treeShakes = new TreeShakeState();
  swing: {
    t: number; dur: number; item: number; dmg?: number; kb?: number;
    /** useStyle 分族（Player.cs:49939 ApplyUseStyle switch）：1 挥砍 / 2 咀嚼 /
     *  3 雨伞 / 4 举过头 / 5 朝鼠标静持 / 6 饮用旋转 / 9 举杯 / 13 短剑突刺 /
     *  14-15 头侧持（不改 bodyFrame）/ 16 静持。缺省 1（Renderer drawUseStyle 路由） */
    useStyle?: number;
    /** useStyle 5/13 的瞄准角（世界系 atan2；Renderer 姿势与 bodyFrame 行档用它） */
    aim?: number;
    /** noUseGraphic=true 族(短剑 aiStyle 161,SetDefaults1(6) 模板倒数第二行)——
     *  身体姿势(useStyle 13)保留但【物品贴图不画】:投射物即唯一的剑,再画持物=双贴图 */
    noGraphic?: boolean;
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
  /** 原版 Dust 池（翅膀尘埃批引入；DrawDust 语义见 Renderer.drawVanillaDust） */
  readonly vanillaDust = new VanillaDust();

  // 敌人生成
  boss: Enemy | null = null;
  /** 本局世界是否新生成(NPC 入驻公告只在新世界播) */
  private freshlyCreated = false;
  /** 进图预载用的角色外观(纸娃娃贴图按当前外观收窄用;mainFlow.makeGame 注入,
   *  外观应用 onWorldReady 才发生——预载时取 player.appearance 拿到的是默认值) */
  preloadAppearance: import('../player/Appearance').Appearance | null = null;
  /** 渲染动态加载日志开关(控制台/探针可改;?rlog=0 也可关) */
  renderLoadLog = true;
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
  private netProjPuppets = new Map<number, { p: Entity; seen: number; pvp?: boolean; ownerSlot?: number; pvpImmuneT?: number; kind7?: number; enchant?: number }>();
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
    // v7 PvP：pvpAllowed 房且自己 hostile 时，玩家弹幕（kind0 友方/1 武器族/4 法弹）
    // 携带 kind bit6——被击端傀儡过 InOpposingTeam 门禁后本地结算（victim-settles）
    const pvpOn = net.policy.pvpAllowed && this.player.hostile;
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
        else {
          if (pvpOn) kind |= 0x40;   // v7：玩家 PvP 弹（友方 Arrow = 玩家射出）
          aux = meleeEnchantOf(this.player.buffs);  // StatusPvP 浸剂通道（aux 低 4 位）
        }
      }
      else if (p instanceof Dart) {
        kind = 2; tag = String(p.projId ?? 0);
        if (p.hostile) kind |= 0x80; // 射击怪弹（!style.friendly）——review F1：此前整族漏覆盖
      }
      else if (p instanceof MagicProj) {
        // ★MagicProj 贴图化后带 projId,必须在下方 projId!==undefined 门前拦截,
        //  否则被抢分类 kind 1 → 访客端 Boomerang 重建(贴图旋转模型全错)。
        //  线格式与原 color 分支完全一致(kind 4 + color tag),访客零感知
        kind = 4; tag = p.color; aux = Math.max(0, Math.min(32767, p.life ?? 600));
        if (pvpOn) kind |= 0x40;
      }
      else if (p.projId !== undefined) {
        kind = 1; tag = String(p.projId);
        if (pvpOn) kind |= 0x40;   // v7：武器族弹幕（回旋镖/剑气等，恒玩家来源）
        aux = meleeEnchantOf(this.player.buffs);    // melee 族：浸剂/冰霜/熔岩石均生效
      }
      else if (p instanceof TrapShot) {
        kind = 3; tag = p.kind ?? 'dart';
        if (p.hostile) kind |= 0x80; // 机关/陷阱弹（环境危害，原版伤所有玩家）
      }
      else if (p.color !== undefined) {
        kind = 4; tag = p.color; aux = Math.max(0, Math.min(32767, p.life ?? 600));
        if (pvpOn) kind |= 0x40;   // v7：法弹（恒玩家来源）
      }
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

  // ================= 拴绳实体（msg82 module13；原版 LeashedEntity.NetModule） =================

  /** PartialSync 差分基准（netId → 上次同步 tick；错相 = 各实体出生时刻，与原版
   *  whoAmI 错相（LeashedEntity.cs:463 `(GameUpdateCount + whoAmI) & 0x3FF`）同效——
   *  每实体固定 1024t 周期、出生时间天然错开） */
  private netLeashedLast = new Map<number, number>();

  /**
   * 房主侧每 64t 巡检（= 原版 _UpdateEntities :436-459 的 Update + StreamNetUpdates 段）：
   *  ① PartialSync：距上次同步 ≥1024t 的实体发位置校正（原版每实体 1024t 错相）；
   *  ② 锚格巡检：锚桩 tile 已不存在（访客破坏的 tile 落格不触发本端破坏链——
   *     applyRemote 只写数组）→ 消散实体 + 掉存物（房主权威，走既有 msg21 掉落同步；
   *     = 原版 dedicated server TE DropItemForTileBreak 服务端掉落语义）+ 清 furniture
   *     记录（防存档重读复活已破锚桩 = 存物复制）+ 广播 Remove。
   *  与原版的差异（备案）：a. 原版 TE OnRemoved 由服务器 tile 落格即时触发，本仓
   *  tile 层是客户端权威直通（无服务端 tile 事件回调），故巡检周期 64t（≤1.07s 收敛）；
   *  b. PartialSync 不按房主 section 活性过滤（原版 StreamNetUpdates 只遍历激活 section）
   *  ——本仓房主=玩家（无 dedicated 形态），按房主 section 过滤会让"离房主近访客远"
   *  的实体饿死；实体全为玩家手放量级极小，服务器侧 AOI 过滤已挡掉无关收件人
   */
  private netLeashedHostSweep() {
    const net = this.net;
    if (!net?.active || !net.policy.isHost) return;
    const st = this.world.store;
    const anchorTiles = new Set([TILE_BY_KEY['v_724_critter_anchor'], TILE_BY_KEY['v_723_kite_anchor']]);
    const sweep = (list: Array<LeashedCritterEntity | LeashedKiteEntity>): Array<LeashedCritterEntity | LeashedKiteEntity> => {
      const keep: Array<LeashedCritterEntity | LeashedKiteEntity> = [];
      for (const e of list) {
        // ---- ② 锚格巡检 ----
        if (!st.inBounds(e.ax, e.ay) || !anchorTiles.has(st.type[st.idx(e.ax, e.ay)])) {
          // 存物掉落（房间主权威；访客破坏时破坏端本地无记录不掉，无双份）
          const rec = this.world.furnitureItems.find(
            (r) => r.x === e.ax && r.y === e.ay && (r.kind === 'critter_anchor' || r.kind === 'kite_anchor'));
          const stored = rec?.slots[0] ?? null;
          if (stored) this.spawnDrop(e.ax * TILE + 8, e.ay * TILE, ITEM_DEFS[stored.id].key, stored.stack, 0, -2);
          if (rec) removeFurnitureAt(this.world.furnitureItems, e.ax, e.ay);
          net.sendLeashedRemove(e.netId);
          continue;
        }
        keep.push(e);
        // ---- ① PartialSync（1024t/实体）----
        const last = this.netLeashedLast.get(e.netId) ?? -1024;
        if (this.tickCount - last >= 1024) {
          this.netLeashedLast.set(e.netId, this.tickCount);
          net.sendLeashedPartial(e);
        }
      }
      return keep;
    };
    const keptCritters = sweep(this.leashed.critters);
    const keptKites = sweep(this.leashed.kites);
    if (keptCritters.length !== this.leashed.critters.length
      || keptKites.length !== this.leashed.kites.length) {
      this.leashed.critters = keptCritters as LeashedCritterEntity[];
      this.leashed.kites = keptKites as LeashedKiteEntity[];
    }
    // 差分基准收缩（消亡实体防 Map 无界增长）
    const alive = new Set<number>();
    for (const e of this.leashed.critters) alive.add(e.netId);
    for (const e of this.leashed.kites) alive.add(e.netId);
    for (const id of this.netLeashedLast.keys()) if (!alive.has(id)) this.netLeashedLast.delete(id);
  }

  /** msg82 module13 回包分发（= NetModule.Deserialize :22-41；访客端为主，
   *  sub3/sub4 请求仅房主会收到——服务器定向转发） */
  private netApplyLeashed(msg: LeashedNetMsg) {
    if (msg.sub === LEASHED_SUB_FULL) {
      this.leashed.netApplyFull(msg, this.leashedEnv());
    } else if (msg.sub === LEASHED_SUB_PARTIAL) {
      this.leashed.netApplyPartial(msg);
    } else if (msg.sub === LEASHED_SUB_REMOVE) {
      this.leashed.netRemove(msg.netId);
    } else if (msg.sub === LEASHED_SUB_PLACE_REQUEST) {
      if (this.net?.active && this.net.policy.isHost) this.netApplyLeashedPlace(msg.ax, msg.ay, msg.vid);
    } else if (msg.sub === LEASHED_SUB_RETRIEVE_REQUEST) {
      if (this.net?.active && this.net.policy.isHost) this.retrieveLeashedAnchor(msg.ax, msg.ay, msg.kind);
    }
  }

  /**
   * 锚桩存物取回（sub4 落账 = 房主侧；单人/房主右键同走此链）。
   *  约简逻辑在 net/leashedSync.ts applyLeashedRetrieve（furniture 记录 + 实体 +
   *  掉物/广播回调注入）；掉物走 spawnDrop → 既有 msg21 SyncItem 广播（房主权威，
   *  访客收包拾取），实体消散广播 sub0 Remove（仅房主联机态上行）。锚桩 tile 保留
   *  （空桩可再放置 = 原版 itemType=0 合法态；tile 破坏仍走 msg17 破坏链）。
   *  原版锚桩无 OnPlayerInteraction（TELeashedEntityAnchorWithItem 仅破坏掉物），
   *  右键取回是本仓扩展交互——备案。
   */
  private retrieveLeashedAnchor(ax: number, ay: number, kind: number): boolean {
    return applyLeashedRetrieve({
      records: this.world.furnitureItems,
      netIdsAt: (x, y) => this.leashed.netIdsAt(x, y),
      removeAt: (x, y) => this.leashed.removeAt(x, y),
      dropItem: (x, y, key, stack) => { this.spawnDrop(x, y, key, stack, 0, -2); },
      broadcastRemove: (id) => {
        if (this.net?.active && this.net.policy.isHost) this.net.sendLeashedRemove(id);
      },
      keyOf: (id) => ITEM_DEFS[id]?.key ?? '',
    }, ax, ay, kind);
  }

  /**
   * 访客放置请求落账（sub3；房主侧）。校验链（不裸信访客上报）：
   *  ① 锚格 tile 类型与物品族匹配（724↔捕获小动物 makeNPC / 723↔风筝 shoot）；
   *  ② 该锚点无既有实体（防重复放置刷实体）；
   *  ③ furniture 记录缺位或空槽（防覆写他人存物）。
   *  通过 → 房主写记录 + 生成实体 + 广播 FullSync（= 自身放置链同款，netTryPlace 内联）。
   *  物品消耗由请求端本地完成（其 inv 经 msg5 差分同步），房主不代扣
   */
  private netApplyLeashedPlace(ax: number, ay: number, vid: number) {
    const net = this.net;
    if (!net?.active || !net.policy.isHost) return;
    const st = this.world.store;
    if (!st.inBounds(ax, ay)) return;
    const tileHere = st.type[st.idx(ax, ay)];
    const npcType = ITEM_MAKE_NPC[vid];
    const projType = KITE_ITEM_PROJ[vid];
    if (npcType !== undefined) {
      if (tileHere !== TILE_BY_KEY['v_724_critter_anchor']) return;   // ①
      if (this.leashed.netIdsAt(ax, ay).length) return;               // ②
      const rec = critterAnchorAt(this.world.furnitureItems, ax, ay);
      if (rec?.slots[0]) return;                                      // ③
      const internalId = internalIdOfVid(vid);
      if (internalId <= 0) return;
      if (!rec) critterAnchorPlace(this.world.furnitureItems, ax, ay, { id: internalId, stack: 1 });
      const e = this.leashed.spawnCritter(ax, ay, vid, { placeStyle: placeStyleOfVid(vid) });
      if (e) net.sendLeashedFull(e);
      return;
    }
    if (projType !== undefined) {
      if (tileHere !== TILE_BY_KEY['v_723_kite_anchor']) return;
      if (this.leashed.netIdsAt(ax, ay).length) return;
      const rec = kiteAnchorAt(this.world.furnitureItems, ax, ay);
      if (rec?.slots[0]) return;
      const internalId = internalIdOfVid(vid);
      if (internalId <= 0) return;
      if (!rec) kiteAnchorPlace(this.world.furnitureItems, ax, ay, { id: internalId, stack: 1 });
      const pd = projectileData(projType);
      const e = this.leashed.spawnKite(ax, ay, projType, this.leashedEnv(), pd?.width ?? 4);
      if (e) net.sendLeashedFull(e);
    }
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
        // v7：PvP 弹 meta（kind bit6 + netId 高 8 位归属 + aux 低 4 位浸剂）——
        // netPuppetProjContact 消费
        pup = {
          p, seen: this.tickCount,
          pvp: (s.kind & 0x40) !== 0,
          ownerSlot: s.netId >>> 24,
          kind7: s.kind & 0x3f,   // ★0x3f（bit6=PvP 位勿入 kind 值）
          enchant: s.aux & 15,
        };
        this.netProjPuppets.set(s.netId, pup);
      } else {
        // 已在场的傀儡也跟随发送方 PvP 姿态刷新（hostile 开关后无需弹幕重生）
        pup.pvp = (s.kind & 0x40) !== 0;
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
    // ★掩码必须 0x3f：bit6 已是 v7 PvP 位,0x7f 会令 kind=0x40 的弹 switch 落空建不出傀儡
    // （_pvp-e2e 实抓：B 收到快照但 pups 空）
    const hostile = (s.kind & 0x80) !== 0;
    switch (s.kind & 0x3f) {
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

  /** v7 msg44：PvP 近战命中意向到达（被打端=本地权威结算）。
   *  门禁链 = 原版 MessageBuffer.cs:3864 服务器"双方 hostile"校验的客户端等价 +
   *  InOpposingTeam（Player.cs:4287 全服唯一 PvP 关系判定）：任一门不过即丢弃——
   *  伪造意向包最多触发一次受击表现，扣血与否完全由本地决定（victim-settles）。
   *  伤害走 damagePlayer(pvp)（8t 无敌帧 + pvpDeath 标记），死因 = DeathSource.Player */
  private netApplyStrikePlayer(fromSlot: number, dmg: number, weaponId: number, flags: number) {
    if (!this.net) return;
    const p = this.player;
    if (p.dead) return;
    const rp = this.net.players.get(fromSlot);
    if (!rp || !rp.active) return;
    // ---- bit7 爆炸意向（BombsHurtPlayers :13944-13981 的被炸端结算）----
    // ★原版爆炸无 hostile/InOpposingTeam 门（炸谁都成立）;pvp 参仅投射物 108/1002
    // 为 false(:13964-13967)其余恒 true。伤害=±15% DamageVar 本地掷(:13953 用
    // -luck);命中且未死 → StatusPlayer debuff(:13979-13980);死因 ByProjectile
    // （:13974,weaponId 携投射物型）
    if (flags & 0x80) {
      const projType = weaponId;
      const rolled = Math.max(1, Math.round(dmg * (1 + (Math.random() * 30 - 15) / 100)));
      p.lastDamageCause = { kind: 'projectile', name: Lang.projectileName(projType) ?? 'Explosives' };
      const pvpHit = projType !== 108 && projType !== 1002;
      // ★走 damagePlayer 而非直调 p.damage：死亡结算块（pvpDeath 计数/不掉钱/复活
      // 计时）挂在 damagePlayer 尾部——直调会绕过,_pvp-e2e 实抓"炸死无计数"）
      if (this.damagePlayer(rolled, rp.x, rp.y, undefined, false, pvpHit)) {
        this.playSfx('hit', 1, p.cx, p.cy);
        // ★hostile=false（爆炸无敌我门 :13979-13980——!hostile 分支（285 二块/253/
        // 399-402）唯一可触发路径）
        if (!p.dead && p.hp > 0) statusPlayer(this, projType, false);
      }
      return;
    }
    if (!this.net.policy.pvpAllowed) return;
    // ---- bit5 圣骑士盾转移（Player.cs:37727-37763 受击侧镜像：同队盾持有者承担 25%）----
    // 转移 hurt 为 pvp:false 的独立冷却槽（ImmunityCooldownID.PaladinsShield）——
    // 不吃常规无敌帧；死因 ByOther(20) teamTank。冷却/减伤以独立字段近似（计划备案）
    if (flags & 0x20) {
      if (p.team === 0 || rp.team !== p.team) return;    // CanDefendWithPaladinsShield(team)
      if (!this.hasPaladinShield(p) || p.paladinShieldCd > 0) return;
      p.paladinShieldCd = 40;
      p.lastDamageCause = { kind: 'teamTank' };
      const d = Math.max(1, Math.round(dmg - p.defense * 0.5)); // CalculateDamagePlayersTake 近似（难度防系数未乘,备案）
      p.hp = Math.max(0, p.hp - d);
      this.addDamageNumber(p.cx, p.y, d, false, '#FF7060');
      return;
    }
    // InOpposingTeam（Player.cs:4287）：双方 hostile 且（对方无队或异队）——单调用
    // 完成原版 MessageBuffer.cs:3864 双向 hostile 校验的等价判定
    if (!inOpposingTeam(p, rp)) return;
    // ---- bit6 狱火光环（Player.cs:9931-9946：200px 内敌对玩家 60t 一跳 20 + 323 2s）----
    // 死因 ByOther(16) inferno；per-owner 冷却防伪造刷屏（原版按持有者 infernoCounter 节拍）
    if (flags & 0x40) {
      const cd = this.pvpAuraCd.get(fromSlot) ?? 0;
      if (cd > 0) return;
      this.pvpAuraCd.set(fromSlot, 60);
      p.buffs.apply(BuffType.OnFire3, 2);
      p.lastDamageCause = { kind: 'inferno' };
      this.damagePlayer(dmg, rp.x, rp.y, undefined, false, true);
      return;
    }
    // ---- 近战命中（ItemCheck_MeleeHitPVP）----
    // 死因：凶手名 + 凶器名（DeathSource.Player "{0}，凶手是{1}的{2}。"）
    p.lastDamageCause = { kind: 'player', name: rp.name, weapon: Lang.itemName(weaponId) ?? '?' };
    // StatusToPlayerPvP（Player.cs:6251-6349：相交即授予,在 Hurt 之前 :43414）——
    // 浸剂从 flags bits1-4 还原；frost/magma 从攻击者代理装备还原（msg5 已同步 armor）
    const ownerCtx = this.netPvpOwnerCtx(fromSlot);
    statusPvPMelee(p.buffs, ITEM_DEFS[weaponId]?.vid ?? -1, {
      meleeEnchant: (flags >> 1) & 15,
      frostBurn: ownerCtx.frostBurn,
      magmaStone: ownerCtx.magmaStone,
    });
    this.damagePlayer(dmg, rp.x, rp.y, undefined, false, true);
    this.playSfx('hit', 1, rp.x, rp.y);
  }

  /** 圣骑士盾 938 装备检测（Player.defendedByPaladin——配饰槽 vid 扫描） */
  private hasPaladinShield(pl: { inv: { armor: Array<{ id: number } | null> } }): boolean {
    for (let i = 3; i < pl.inv.armor.length; i++) {
      const s = pl.inv.armor[i];
      if (!s) continue;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (vid === 938 || vid === 3998) return true;
    }
    return false;
  }

  /** 狱火光环 PvP 意向的 per-owner 冷却（tick） */
  private pvpAuraCd = new Map<number, number>();

  /** v7 PvP 弹幕攻击端反馈（Damage_PVP :13497 的本端半边——只做吸血反馈,
   *  扣血权在被击端）：原版 ghostHeal/vampireHeal 消费 Hurt 返回值 =
   *  CalculateDamagePlayersTakeInPVP（DamageVar 掷后取 dmg−def×0.5 下限 1,
   *  :13563/:37954）。吸血鬼刀 304 → vampire；法弹+幽灵套 → ghost（钩子自检
   *  setBonus.ghostHeal 与月噬禁用/预算池）。每弹×每目标一次（键 `${projId}:${slot}`） */
  private pvpProjHitSet = new Set<string>();
  private netPvpProjFeedback() {
    if (!this.net?.active || !this.net.policy.pvpAllowed || !this.player.hostile) return;
    const alive = new Set<number>();
    for (const ent of this.entities.projectiles) {
      const pr = ent as Entity & { projId?: number; damage?: number; hostile?: boolean; netPuppet?: boolean; dead?: boolean; x: number; y: number; w: number; h: number };
      if (!(pr instanceof Arrow) && !(pr instanceof MagicProj)) continue;
      if (pr.netPuppet || pr.dead || (pr as { hostile?: boolean }).hostile) continue;
      alive.add(pr.id);
      const dmg0 = pr.damage ?? 0;
      if (dmg0 <= 0) continue;
      for (const rpEnt of this.remotePlayerProxies) {
        const rp = rpEnt as Player;
        const slot = (rp as unknown as { __netSlot?: number }).__netSlot;
        if (slot === undefined || rp.dead) continue;
        if (!inOpposingTeam(this.player, rp)) continue;
        const key = `${pr.id}:${slot}`;
        if (this.pvpProjHitSet.has(key)) continue;
        if (!(pr.x < rp.x + rp.w && pr.x + pr.w > rp.x && pr.y < rp.y + rp.h && pr.y + pr.h > rp.y)) continue;
        this.pvpProjHitSet.add(key);
        // :13563 Main.DamageVar ±15% → :37954 InPVP 口径
        const num2 = Math.max(1, Math.round(dmg0 * (1 + (Math.random() * 30 - 15) / 100) - rp.defense * 0.5));
        if (pr instanceof MagicProj) this.applyLifeSteal('ghost', num2, 1, rp.cx, rp.cy, true);
        else if (pr.projId === 304) this.applyLifeSteal('vampire', num2, 1, rp.cx, rp.cy, false);
      }
    }
    // 清理已消亡弹的命中键（防 Set 无界）
    if (this.tickCount % 60 === 0) {
      for (const k of this.pvpProjHitSet) {
        if (!alive.has(Number(k.split(':')[0]))) this.pvpProjHitSet.delete(k);
      }
    }
  }

  /** PvP 攻击者侧装备态还原（frostBurn 套装引擎/熔岩石 903——msg5 已同步 armor,
   *  代理 equipStats 现成；熔岩石 accfx 未登记,直接扫配饰槽 vid） */
  private netPvpOwnerCtx(slot: number): { frostBurn: boolean; magmaStone: boolean } {
    const proxy = this.remotePlayerProxies.find((pr) => (pr as unknown as { __netSlot?: number }).__netSlot === slot);
    if (!proxy) return { frostBurn: false, magmaStone: false };
    let magmaStone = false;
    for (let i = 3; i < proxy.inv.armor.length; i++) {
      const s = proxy.inv.armor[i];
      if (!s) continue;
      const d = ITEM_DEFS[s.id];
      const vid = d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      // 岩浆石 1322 / 火焰护手 1343（Player.cs:14787-14790/:14758-14766——曾误查 903）
      if (vid === 1322 || vid === 1343) { magmaStone = true; break; }
    }
    return { frostBurn: proxy.equipStats.frostBurn, magmaStone };
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
      this.damagePlayer(dmg, e.cx, e.cy, e, true);   // 接触伤害（荆棘反伤 eligible）
      e.iframes = 8;
    }
  }

  /** 访客：敌对弹幕傀儡本地结算（原版 Projectile.Damage_EVP，Projectile.cs:13706-13830）。
   *  语义与近战接触伤害同模型：玩家 HP 客户端权威 + msg16 中继（原版玩家伤害即本地
   *  结算——每端各自跑弹幕命中本地玩家判定）。hitPlayer 内含原版门禁链：
   *  hostile + dmg>0 / player.immune(iframes) / AABB 相交；命中【不消耗穿透】
   *  （:13811-13829 特判除外），弹体照常飞行；debuff 授予以实际伤害为准（statusPlayer）。 */
  private netPuppetProjContact() {
    const net = this.net;
    for (const [, pup] of this.netProjPuppets) {
      const pr = pup.p as Entity & { hostile?: boolean; damage?: number; projId?: number };
      if (pr.dead) continue;
      // ---- v7 PvP 弹（kind bit6）：玩家命中链（原版 Projectile.Damage_PVP
      //      :13497-13620 的被打方本地结算等价）。门禁与原版 :13506-13510 同构：
      //      dmg>0 / 跳过自己（netId 高位=own slot 不会出现在傀儡表，天然满足）/
      //      对方 hostile（InOpposingTeam 含双方）/ playerImmune 40t 每弹独立冷却
      //      （:13618——本地单玩家模型下退化为傀儡单计数器）
      if (pup.pvp) {
        if (!net || !net.policy.pvpAllowed) continue;
        if ((pup.pvpImmuneT ?? 0) > 0) { pup.pvpImmuneT = pup.pvpImmuneT! - 1; continue; }
        const dmg0 = pr.damage ?? 0;
        if (dmg0 <= 0) continue;
        const owner = net.players.get(pup.ownerSlot ?? -1);
        if (!owner || !owner.active || !inOpposingTeam(this.player, owner)) continue;
        // CanHitWithMeleeWeapon（:13513-13515 ownerHitCheck 族 + Projectile.cs:11734-11744）：
        // 近战弹（回旋镖/剑气等 kind1）不许隔墙命中——线段被实心格挡即跳过。
        // 箭/弹（kind0）无 ownerHitCheck,原版不检查——此处同构只拦 kind1
        if (pup.kind7 === 1 && !canHitLine(this.world.store, pr.x, pr.y, pr.w, pr.h, this.player.x, this.player.y, this.player.w, this.player.h)) continue;
        // Main.DamageVar（:13563±15% 幅度,打在被击端）+ 死因 player（凶器=弹型名）
        const rolled = Math.max(1, Math.round(dmg0 * (1 + (Math.random() * 30 - 15) / 100)));
        this.player.lastDamageCause = {
          kind: 'player', name: owner.name,
          weapon: Lang.projectileName(pr.projId ?? 0) ?? '?',
        };
        // StatusPvP（Projectile.cs:11092：Hurt 前授予,immune 时跳过 :13561）——
        // 弹幕性质按 kind 还原（0=箭 ranged / 1=武器族 melee / 其余 neither）
        if (this.player.iframes <= 0) {
          const ownerCtx = this.netPvpOwnerCtx(pup.ownerSlot ?? -1);
          statusPvPProjectile(this.player.buffs, pr.projId ?? 0, {
            melee: pup.kind7 === 1, ranged: pup.kind7 === 0,
            meleeEnchant: pup.enchant ?? 0,
            frostBurn: ownerCtx.frostBurn, magmaStone: ownerCtx.magmaStone,
          });
        }
        if (hitPlayer(pr, this, rolled, false, true)) {
          pup.pvpImmuneT = 40;   // :13618 每弹×每玩家独立冷却
          this.playSfx('hit', 1, pr.cx, pr.cy);
        }
        continue;
      }
      if (!pr.hostile) continue;
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
  /** 屏内旗激活的 npcId 集（旗 buff 乘区消费） */
  private _bannerNpcs = new Set<number>();
  private musicState: MusicState = newMusicState();
  /** 派对态（BirthdayParty 精简核：ManualParty；派对纪念碑 455 驱动） */
  private partyState: PartyState = newPartyState();
  // ---- 运行时审计台账六缺口的新增运行时位 ----
  /** NPC.freeCake（NPC.cs:6020 静态位）：生日派对开张置位（BirthdayParty.cs:106），
   *  派对女孩首次对话赠切片蛋糕后清零（ConditionalDialogue.FreeCakeDialogue），
   *  入夜 StartNight 清零（Main.cs:64704）。运行时态不落盘（同原版） */
  freeCake = false;
  /** NPC.EoCKilledToday / WoFKilledToday（NPC.cs:6541/6543 私有静态位）：同日双杀
   *  EoC(4)+WoF(113) 掉 Badger's Hat 5004（NPC.cs:79800-79814）；入夜
   *  ResetBadgerHatTime 清零（Main.cs:64703）。运行时态不落盘（原版不入 WorldFile） */
  private eocKilledToday = false;
  private wofKilledToday = false;
  /** 已记 TabletDestroyed 账的石碑（CultistRitual.TabletDestroyed，NPC.cs:38881——
   *  石碑 ai0==-1 边沿去重；实体死亡随 WeakSet 自动回收） */
  private _cultistTabletDone = new WeakSet<Enemy>();
  /** 倒木重扫延迟旗：breakTile 头部置位，下一 tick updateTime 前消费——
   *  原版 FallenLogDestroyed 在 KillTile【尾部】（tile 清掉之后）才重扫
   *  （WorldGen.cs:49863-49869），曾挂在 breakTile 头部=已毁倒木当夜仍在桩表 */
  private _fallenLogRescan = false;
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

  /** 物品 → 矿车坐骑型（MountID.Sets.Cart 族召唤物 DefaultToMinecart(n)；
   *  非矿车族物品返回 -1） */
  private cartMountOfItem(internalId: number): number {
    const vid = viIdFromKey(ITEM_DEFS[internalId]?.key ?? '');
    if (vid < 0) return -1;
    const m = mountOfItem(vid);
    return m >= 0 && isCartMount(m) ? m : -1;
  }

  /** 上车（TrackHook proj 403 语义：GetOnTrack 吸附 + 落点实心门 :22407）。
   *  mountId 传 -1 = 默认木质矿车 13（Player.cs:22401 `int num4 = 13`——
   *  未装备矿车族物品时也上车，无需任何物品）。
   *  返回 false = 落点被实心卡住，上车失败 */
  private mountMinecartAt(tx: number, ty: number, mountId: number): boolean {
    if (this.minecart) return false;
    const st = this.world.store;
    const cart = new Minecart();
    cart.mountId = mountId >= 0 ? mountId : WOOD_CART_MOUNT;
    cart.applyMountStats();
    cart.texture = CART_MOUNT_TEXTURES[cart.mountId] ?? DEFAULT_CART_TEXTURE;
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
    p.cartDefenseBonus = 0;   // Mount.UpdateEffects 停跑（Mount.cs:4797-4798 加成解除）
    cart.mounted = false;
    cart.dead = true;
    this.minecart = null;
  }

  /** 坐骑召唤（Player.cs:42095：item.mountType != -1 且 flag2 → mount.SetMount）。
   *  召唤物不消耗；再召同型 = 下坐（Player.cs:5768 TryToDismount 链） */
  /** Player.QuickMount（Player.cs:5728-5783）召唤段：QuickMount_GetItemToUse
   * （:5859-5878）miscEquips[3] 坐骑装备槽优先 → 背包顺序扫非矿车坐骑物品。
   * 禁用门（:5757 frozen/tongued/webbed/stoned/死亡）经 setMount 内部 canMount 空间
   * 门+此处 dead 门近似。返回是否找到并上坐（false → 调用方落 QuickMinecart） */
  private quickMount(): boolean {
    const p = this.player;
    const eq = p.inv.miscEquips[3];
    if (eq) {
      const vid = vanillaIdOfItem(eq.id);
      if (mountOfItem(vid) >= 0 && !isCartMount(mountOfItem(vid))) return this.useMountItem(vid);
    }
    for (const s2 of p.inv.slots) {
      if (!s2) continue;
      const vid = vanillaIdOfItem(s2.id);
      const mid = mountOfItem(vid);
      if (mid >= 0 && !isCartMount(mid)) return this.useMountItem(vid);
    }
    return false;
  }

  private useMountItem(vanillaItemId: number): boolean {
    const mountId = mountOfItem(vanillaItemId);
    if (mountId < 0) return false;
    const p = this.player;
    // 矿车族召唤物仍走轨道上车链（Minecart.ts 已接 MountID.Cart 路径，不回退）
    if (isCartMount(mountId)) { this.tryQuickMinecart(); return true; }
    if (p.ridingMount) {
      // 已骑乘：同型下坐；异型换骑（SetMount :6194-6204 先 ClearBuff 再上）。
      // 下坐路径同样吃 useAnimation 冷却——否则按住左键会在同一次按压里
      // 下坐→再上坐来回翻转（ItemCheck 每帧重入）
      if (p.mount.type === mountId) {
        this.tryDismountMount();
        p.useTime = 20;                               // useAnimation 20（Item.cs 鞍族）
        return true;
      }
    }
    if (p.ridingCart) return true;                    // 车上换坐骑需先下车（QuickMount 语义）
    if (!p.mount.setMount(mountId, p, this)) return false;
    // 起坐音效（Item.UseSound：鞍族 Item_25 / 胡萝卜 Item_79 / 猪龙 Item_80 / 史莱姆 Item_81）
    const snd: Record<number, string> = {
      0: 'Item_25', 1: 'Item_79', 2: 'Item_80', 3: 'Item_81', 4: 'Item_25', 5: 'Item_8',
    };
    this.playSfxFile(snd[mountId] ?? 'Item_25', 0.8, p.x, p.y);
    p.useTime = 20;                                   // useAnimation 20（Item.cs 鞍族）
    return true;
  }

  /** 下坐（Mount.TryDismount :6124：空间不足失败 → DoFailedDismountDust 尘 10） */
  /** FailedNoSpace 计数（QuickMount 三连败门，Player.cs:5738-5753） */
  private mountNoSpaceCount = 0;

  private tryDismountMount(): void {
    const p = this.player;
    if (!p.ridingMount) return;
    if (p.mount.tryDismount(p)) {
      this.mountNoSpaceCount = 0;
      return;
    }
    // QuickMount（Player.cs:5738-5753）：失败 1/2 次 = Sound 0 + 尘(计数×20)；第 3 次
    // 强制下坐 + PlayerNoSpaceTeleport（就近可容盒传送）——曾只弹 toast
    this.mountNoSpaceCount++;
    if (this.mountNoSpaceCount < 3) {
      this.sfx.play('dig', 1, p.cx, p.cy);
      this.spawnParticles(p.cx, p.cy, '#C8C8C8', 10 + this.mountNoSpaceCount * 20, 1.2);
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.MountDismountBlocked'));
      return;
    }
    this.mountNoSpaceCount = 0;
    p.mount.dismount(p);
    this.playerNoSpaceTeleport();
  }

  /** PlayerNoSpaceTeleport（Player.cs:5685-5726）：以当前格向上逐行扫可容纳
   *  42px 玩家盒的非实心 3×3 区，找到即传送（原版扫 20 行内 fallback 站立位） */
  private playerNoSpaceTeleport(): void {
    const st = this.world.store;
    const p = this.player;
    const tx = Math.floor(p.cx / TILE);
    const ty = Math.floor(p.y / TILE);
    const fits = (cx: number, cy: number): boolean => {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          if (!st.inBounds(cx + dx, cy + dy) || st.isSolid(cx + dx, cy + dy)) return false;
        }
      }
      return true;
    };
    for (let dy = 0; dy >= -20; dy--) {
      for (let dx = -4; dx <= 4; dx++) {
        if (fits(tx + dx, ty + dy)) {
          p.x = (tx + dx) * TILE;
          p.y = (ty + dy) * TILE;
          p.vx = 0; p.vy = 0;
          return;
        }
      }
    }
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
      // 坐骑型优先级：矿车装备槽（miscEquips[2]）> 手持 > 背包首件（Player.cs:22401-22409
      //  原版只认装备槽；后备两档为本仓无装备槽 UI 时的近似）；全无 → 木质车 13
      this.mountMinecartAt(best.x, best.y, this.bestCartMount());
    }
  }

  /** 玩家可用的矿车坐骑型（miscEquips[2] 装备矿车 > 手持 > 背包扫描；
   *  无矿车族物品 → -1 = 默认木质矿车 13，仍可上车） */
  private bestCartMount(): number {
    const misc = this.player.inv.miscEquips?.[2];
    if (misc) {
      const m = this.cartMountOfItem(misc.id);
      if (m >= 0) return m;
    }
    const held = this.player.inv.heldItem();
    if (held) {
      const m = this.cartMountOfItem(held.id);
      if (m >= 0) return m;
    }
    for (const s of this.player.inv.slots) {
      if (!s) continue;
      const m = this.cartMountOfItem(s.id);
      if (m >= 0) return m;
    }
    return -1;
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
  /** 传送族引导态（Player.cs:42297-42516）：useTime 倒数到 triggerAt 时触发传送 */
  private recallChannel: { vid: number; kind: RecallKind; triggerAt: number; consume: boolean } | null = null;
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
    // 高尔夫宿主注入（GolfBall.host：球体 AI ↔ LocalGolfState/进洞结算链）。
    // playerRef 取函数——换世界会重建 Player 实例，须动态解析
    GolfBall.host = {
      state: this.golfState,
      playerRef: () => this.player,
      onCupCapture: (ball, tx, ty) => this.golfCupCapture(ball, tx, ty),
    };
    if (atlas) {
      this.atlas = atlas;
      this.autotiler = new AutoTiler(atlas);
    }
    this.renderer = new Renderer(this.assets, atlas);
    // GPU 压力自适应(2026-08-14 trace⑦):contextlost → chunk 上限减半 + 立即释放超限
    this.renderer.installGpuPressureGuard();
    this.renderer.cbOnGpuPressure = () => this.shrinkChunks();
    this.renderer.vanillaDust = this.vanillaDust;   // DrawDust 双 pass 消费（lit/全亮）
    this.renderer.attach(root);
    // 音效按需加载（2026-08-10）：不在此预读——播放未命中时后台 fetch+decode、
    // 首播合成兜底；常用战斗/交互声在世界就绪后小集合预热（见 afterWorldLoad），
    // 怪物专属声效随首次受击懒加载
    this.input = new Input(this.renderer.canvas);
    this.cb = cb;
    // 快捷栏数字键：事件驱动（避免单帧内 down+up 被轮询漏掉）。
    // 背包打开时不切栏（原版 inventory 开启时数字键归 UI 导航）
    this.input.keydownHandlers.push((code) => {
      if (this.player && /^Digit[0-9]$/.test(code) && !this.input.uiBlocking) {
        this.player.inv.selected = code === 'Digit0' ? 9 : Number(code.slice(5)) - 1;
        this.cb.onInventoryChanged();
      }
      // 缩放调节
      if (code === 'Equal' || code === 'NumpadAdd') this.setZoom(this.camera?.zoomTarget + 0.15);
      if (code === 'Minus' || code === 'NumpadSubtract') this.setZoom(this.camera?.zoomTarget - 0.15);
      // F2:无敌+无限魔力(调试工具,原版无;Input 已 preventDefault)——F2 原像素
      // 画导入 2026-08-13 让位本键,迁往 F1
      if (code === 'F2') this.toggleDebugGod();
      // F1:图片 → 像素方块群导入(自研创意工具,原版无;Input 已 preventDefault)。
      // 原 F11 与系统全屏冲突 → F2 → 2026-08-13 再迁 F1
      if (code === 'F1') this.openPixelArtImport();
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
        if (held && ITEM_DEFS[held.id]?.wireTool && (viIdFromKey(ITEM_DEFS[held.id]?.key ?? '') === 3625 || viIdFromKey(ITEM_DEFS[held.id]?.key ?? '') === 3611)) {
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
    // 原版 gen[27]"正在安置液体"(SettleLiquids :16219;UIWorldLoadState 经
    // worldgenText('水体沉降') 同键转换,双路一致)
    const settleLabel = () => Lang.text('LegacyWorldGen.27');
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
    // Player_ 全量 545 张(77MB 解码)收窄为【当前外观所需】:纸娃娃 14 通道 × 变体
    // (女性变体缺通道回退男体,故男体常备) + 发型正/帽发各 1 张 ≈ 30 张;
    // 换装/更衣走 vui 懒加载 + PaperDoll 就绪预检自愈(2026-08-13)
    const app = this.preloadAppearance; // ★此时 player 尚未创建(见 playerPreviewArmor 注释),勿读 this.player
    const variant = app?.skinVariant ?? 0;
    const hair = app?.hair ?? 0;
    const playerFiles = new Set<string>();
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]) {
      playerFiles.add(`vanilla-ui/Player_${variant}_${s}.png`);
      if (variant !== 0) playerFiles.add(`vanilla-ui/Player_0_${s}.png`); // 女体缺通道男体回退
    }
    playerFiles.add(`vanilla-ui/Player_Hair_${hair + 1}.png`);
    playerFiles.add(`vanilla-ui/Player_HairAlt_${hair + 1}.png`); // 帽子发型头盔(小图,直接备上)
    await a.preloadUiFiles(playerFiles);
    // 仅当前装备的 Armor 表;换装时 vui 懒加载 + PaperDoll 就绪预检自动兜住
    const armorFiles = new Set<string>();
    for (const id of this.playerPreviewArmor()) {
      if (id == null) continue;
      const def = ITEM_DEFS[id];
      if (!def) continue;
      const vid = VANILLA_ITEM_ICON_MAP[def.key] ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : NaN);
      const entry = Number.isFinite(vid) ? a.vanilla.armorIndex?.[String(vid)] : null;
      if (!entry) continue;
      if (entry.head) armorFiles.add(`vanilla-ui/Armor_Head_${entry.head}.png`);
      if (entry.body) armorFiles.add(`vanilla-ui/Armor_Armor_${entry.body}.png`);
      if (entry.legs) armorFiles.add(`vanilla-ui/Armor_Legs_${entry.legs}.png`);
    }
    // ★此前 armorFiles 用的是键形态(无 vanilla-ui/ 前缀),preloadUiFiles 按路径
    // 直取 → 初始护甲预载一直在静默 404(靠 PaperDoll 懒加载兜底才没暴露)
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
    const order = [VI_KEY.IRON_HELMET, VI_KEY.IRON_CHAINMAIL, VI_KEY.IRON_GREAVES];
    for (let k = 0; k < 3; k++) {
      const id = ITEM_BY_KEY[order[k]];
      ids[k] = id !== undefined ? id : null;
    }
    return ids;
  }

  /** 预热背包全部武器/弹药的弹幕贴图(2026-08-13,用户报"发射阶段回退兜底,
   *  过一会才是正确贴图"):懒加载下首发射击时 Projectile_{id} 未就绪会先画短线
   *  兜底。projId 链 = 弹药 shoot ?? 武器 shoot(fire 路径同式)——背包+装备槽
   *  全扫(≤78 格);afterWorldLoad 与 onInventoryChanged(mainFlow)各调一次,
   *  拾取新弹药/换装自动覆盖 */
  prefetchInvProjectiles(): void {
    // ★player 是 player!: Player(确定赋值断言)——loadWorld :2232 才实例化;
    // onInventoryChanged 在存档异步加载链中可能先于赋值触发(读档时物品入包
    // → 回调 → this.player.inv 崩,2026-08-13 生产构建实锤)。守护退出
    if (!this.player?.inv) return;
    const ids = new Set<number>();
    const scan = (it: { id: number } | null | undefined) => {
      if (!it) return;
      const def = ITEM_DEFS[it.id];
      if (!def) return;
      const vid = def.vid ?? viIdFromKey(def.key);
      if (!Number.isFinite(vid)) return;
      const shoot = itemCombat(vid)?.shoot;
      if (shoot && shoot > 0) {
        ids.add(shoot);
        if (shoot === 707) { ids.add(708); ids.add(709); ids.add(1110); }   // 天龙之怒右键 alt 链族（708 弧/709 弹/1110 圈）
        if (shoot === 714) { ids.add(715); ids.add(716); ids.add(717); ids.add(718); }   // MK2 烟花弹族
        if (shoot === 615) ids.add(616);                                    // 派对机枪彩带弹
      }
    };
    for (const s of this.player.inv.slots) scan(s);
    for (const a of this.player.inv.armor) scan(a);
    if (ids.size) prefetchProjectiles(ids);
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
      // 读档沉降文案=原版 gen[27] 收敛比例 50-100%(WorldFile.cs:762;主线程 fallback
      // 路径与 worker 路径同款——mainFlow.loadProgressLabel)
      const loadSettleLabel = (p: number) =>
        Lang.text('LegacyWorldGen.27') + ' ' + Math.min(100, Math.floor(50 + p * 50)) + '%';
      onProgress?.(loadSettleLabel(0), 0.5);
      // 读档模式：原版 WorldFile 单轮语义（存档水体已静止，QuickWater+WaterCheck 后
      // 活水极少，单轮快速收敛；残留交给运行时——不再跑生成期的 10 轮全沉降）
      await this.settleLiquids((p) => onProgress?.(loadSettleLabel(p), p * 0.8), 'load');
    }
    await this.preloadSceneAssets((label, p) => onProgress?.(label, 0.8 + p * 0.2));
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  /** 内存趋势哨兵(2026-08-14,用户定位"感觉仍有泄漏"):
   *  每 5s 采样 usedJSHeapSize;环比上一采样上涨 >8MB 时打印增量行,
   *  并附当 5s 窗口内 [rload] 加载的贴图数 + chunk 数变化(嫌疑面归因)。
   *  JS 堆只是三维之一(另两维:GPU 显存≈live canvas 数×尺寸、解码位图≈
   *  vimages 数)——snap() 一起看。window.__swMemLog 常开,?mlog=0 关 */
  private memSamplePrev = 0;
  private memRloadPrev = 0;
  attachMemSentinel(): void {
    if (new URLSearchParams(location.search).has('mlog')) return;
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
    setInterval(() => {
      if (!perf.memory) return;
      const now = perf.memory.usedJSHeapSize / 1048576;
      const rloads = this.atlas ? this.atlas.vimages.size : 0;
      const chunks = this.chunks.chunks.size;
      if (this.memSamplePrev > 0) {
        const dHeap = now - this.memSamplePrev;
        const dR = rloads - this.memRloadPrev;
        if (dHeap > 8) {
          console.warn(`[mem] JS堆 ${this.memSamplePrev.toFixed(0)}→${now.toFixed(0)}MB (+${dHeap.toFixed(0)}) | 贴图${dR >= 0 ? '+' : ''}${dR}→${rloads} chunk=${chunks} 实体=${this.entities.all().length} 粒子=${this.particles.length}`);
        }
      }
      this.memSamplePrev = now;
      this.memRloadPrev = rloads;
    }, 5000);
  }

  /** 渲染调试句柄(控制台/探针):window.__swRenderLog
   *  .toggle() 开关日志 | .snap() 一次性状态快照 | .on/.off */
  attachRenderLogHandle(): void {
    const h = {
      on: () => { this.renderLoadLog = true; return '渲染加载日志 ON'; },
      off: () => { this.renderLoadLog = false; return '渲染加载日志 OFF'; },
      toggle: () => { this.renderLoadLog = !this.renderLoadLog; return `渲染加载日志 ${this.renderLoadLog ? 'ON' : 'OFF'}`; },
      snap: () => ({
        tick: this.tickCount,
        jsHeapMB: ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576,
        heapDelta5s: this.memSamplePrev ? undefined : undefined,
        chunkCapNow: (this.chunks.constructor as { MAX_CHUNKS?: number }).MAX_CHUNKS,
        vimages: this.atlas?.vimages.size ?? -1,
        uiimages: this.atlas?.uiimages.size ?? -1,
        chunkCached: this.chunks.chunks.size,
        chunkMax: (this.chunks.constructor as { MAX_CHUNKS?: number }).MAX_CHUNKS,
        dirty: this.chunks.dirtyQueue.length,
        lastFlushMs: +this.chunks.lastFlushMs.toFixed(2),
        lastFlushCount: this.chunks.lastFlushCount,
        arriveInvalidateChunks: this.chunks.arriveInvalidateChunks,
        failedVImages: this.atlas?.failedVImages().length ?? 0,
        entities: this.entities.all().length,
        particles: this.particles.length,
      }),
    };
    (globalThis as unknown as { __swRenderLog?: typeof h }).__swRenderLog = h;
  }

  private afterWorldLoad() {
    const w = this.world;
    // Mechdusa queen 登记复位（WorldGen.clearWorld :6907 NPC.mechQueen=-1）
    resetMechQueen();
    // 摇树状态复位（WorldGen.clearWorld :6896 ResetTreeShakes）+ 绑当前 store
    // （getTreeShake 渲染查询的树底归位需要）
    this.treeShakes.reset();
    this.treeShakes.bind(w.store);
    // 专家/大师强度轴上下文注入（NPC.ScaleStats 的 Main 静态投影，
    // src/stats/ScaleStats.ts；newWorld worker/主线程两路与 loadWorld 都汇到此处）。
    // 存档不持久化缩放值（WorldFile.SaveNPCs :1703-1746 只存城镇 NPC 的
    // active/netID/position），每次 fromVanilla 现场重算——绑对象引用即可读最新档
    bindScaleStatsWorld(scaleStatsWorldOf(w, (type) => this.entities.enemies.some(
      (en) => { const e2 = en as Enemy; return !e2.dead && e2.vanillaId === type; })));
    // 旅程力量状态注入（CreativePowerManager.Instance 静态单例语义——
    // Player.damage 的 Godmode/isExpert 轴等经 journeyPowers() 读此处绑定的对象）
    bindJourneyPowers(w.journeyPowers);
    // 旧日军团事件依赖接线（bossAI_dd2.ts DD2_EVENT_HOOKS 占位正式落地）
    this.wireDD2Hooks();
    // 晶塔表首扫（wld 导入的既有晶塔即刻可点；放置/破坏时 refreshPylons 增量刷）
    this.refreshPylons();
    // 拴绳实体重生（TELeashedEntityAnchor.OnWorldLoaded → RespawnLeashedEntity，
    // TELeashedEntityAnchor.cs:35-40）：实体不落盘，读档从 furnitureItems 的
    // critter_anchor/kite_anchor 单槽记录按 makeNPC/shoot 重建
    this.leashed.attach(w);
    this.leashed.respawnAll(
      w.furnitureItems,
      (id) => viIdFromKey(ITEM_DEFS[id]?.key ?? ''),
      this.leashedEnv(),
    );
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
      // 音量 0.5：LegacySoundPlayer.cs:1356 case 39 专属 `Volume = num2 * 0.5f`
      // （其余 SoundID 均为 num2 原值）——原版滴水恒半量，此前传 1 偏大一倍
      this.sfx.playFiles(wet ? ['Drip_2'] : ['Drip_0', 'Drip_1'], 0.5, x, y);
    };
    // ---- 天气系统接线：状态机已在 world.weather（存档/wld 导入回填）；
    //  天空云联动 + 雨滴/沙尘渲染器 attach；hooks 字段每帧由 fixedUpdate 刷新 ----
    this.renderer.sky.attachWeather(w.weather);
    this.renderer.sky.moonType = this.world.moonType;   // 原版 header moonType（WF:1252）
    this.weatherHooks = {
      lightAt: (tx, ty) => this.lighting ? this.lighting.lightAt(tx, ty) : [255, 255, 255],
      atmo: 1,
      snowRatio: 0,
      snowTileCount: 0,
      bossDanger: false,
      sandstormVisuals: false,
      desertSandTiles: 0,
      emitSand: (x, y, vx, vy, color, size = 2) => {
        this.particles.push({
          x, y, vx, vy, life: 40 + Math.random() * 30, maxLife: 70,
          color, size, damp: 0.995, grav: 0,
        });
      },
      sandColors: () => {
        // EmitDust :171-178 四色按【格数】加权（曾用区旗近似）——沙漠沙景
        // 普通沙占绝对多数;珍珠/黑檀/猩红沙只在对应转化地有计数
        const w = this.scene?.sandColorWeights ?? [1, 0, 0, 0];
        return [
          { color: '#C8A014', weight: w[0] },
          { color: '#67627A', weight: w[1] },
          { color: '#872B22', weight: w[2] },
          { color: '#D5C4C5', weight: w[3] },
        ];
      },
    };
    this.renderer.weatherFx.attach(w.weather, this.weatherHooks);
    this.renderer.weatherFxActive = true;
    // 天气预设回调（小地图天气面板按钮 → applyWeatherPreset）
    this.renderer.weatherPreset = (name) => this.applyWeatherPreset(name);
    // 原版墙渲染器（TEdit WallFraming 移植；墙 id 直用 wld id，贴图 Wall_N.png）
    const wallTiler = this.atlas ? new VanillaWallTiler(this.atlas) : null;
    // atlas 传入 = 烘焙懒取自注册(晚到自动重烘,见 ChunkCache 构造器注释)
    this.chunks = new ChunkCache(w, this.assets.tileSheets, this.autotiler, wallTiler, this.atlas);
    // 懒加载晚到的【图块/墙表】→ 精确重烘:出生点子集预载后,远行遇到新类型时
    // vframe 先返回 null(fallback 烤进 chunk),表到位后此回调修正。
    // 必须按文件名过滤——图标/NPC/弹幕贴图不进 chunk。修正走 ChunkCache 的
    // 烘焙期缺表登记(file→chunks 反查,ChunkCache.onBakeAssetArrived):只重烘
    // 真正烤了 fallback 的 chunk(★全量 invalidateAll = 384 chunk 重烘风暴 =
    // 21 万次图像重解码 → 渲染进程崩溃,2026-08-14 trace 实锤)
    if (this.atlas) {
      this.atlas.onVImageLoaded = (file: string) => {
        // ★渲染动态加载日志(2026-08-14,用户调试用):每次懒加载晚到打印一行,
        //   含引发的重烘 chunk 数与总缓存规模。URL 加 ?rlog=0 静默
        if (this.renderLoadLog && !new URLSearchParams(location.search).has('rlog') ) {
          const cached = this.atlas ? this.atlas.vimages.size : 0;
          console.log(`[rload] ${file} | vimages=${cached}`);
        }
        // 【烘焙路径懒取全集】:凡 chunk 烘焙(VanillaTiler/WallTiler/CritterCage)可能
        // ensureVImage 懒取的文件,晚到都必须进精确重烘链——否则
        // 回退会永久烤进已缓存 chunk(用户问的"物块变化后新贴图没加载"场景)。
        // ① Tiles_/Wall_ 出生点扫描精确预载(主通道);② CageTop_ 笼顶盖/③ Glow_316·317
        // 灰烬树 glowmask:烘焙懒取且【无预载】= 此前的真洞(晚到不重烘=永久缺失);
        // ④ Tree_*/Shroom/Cactus 由 VANILLA_MISC 预载兜底,覆盖仅为预载失败重试成功的边缘。
        // ★勿 blanket 加 'vanilla/Glow_'——NPC glow 叠画是每帧活画,重烘纯属浪费
        if (file.startsWith('vanilla/Tiles_') || file.startsWith('vanilla/Wall_')
          || file.startsWith('vanilla/CageTop_')
          || file === 'vanilla/Glow_316.png' || file === 'vanilla/Glow_317.png'
          || file.startsWith('vanilla/Tree_Tops_') || file.startsWith('vanilla/Tree_Branches_')
          || file === 'vanilla/Shroom_Tops.png'
          || file === 'vanilla/Evil_Cactus.png' || file === 'vanilla/Good_Cactus.png' || file === 'vanilla/Crimson_Cactus.png') {
          // ★路由到按 chunk 精确打击(2026-08-14 trace 实锤:进地牢表批晚到 →
          // 全量 invalidateAll = 384 chunk 重烘风暴 = 21 万次图像重解码 → 崩溃)
          this.chunks.onBakeAssetArrived(file);
        }
        // 物品图标图集晚到 → 标记 UI 待刷（fixedUpdate 节流后刷背包/快捷栏/宝箱，
        // 把空图标升格为原版图标——否则图标未就绪时 paintSlot 写空 src，直到下次
        // 用户点击才自愈）。Tiles_ 表同样要刷：place_v_* 家具类物品的图标取自
        // 图块表首帧（atlasIconForKey → vframeAt），此前只认 Item_Atlas → 开宝箱
        // 时这类物品永久回退
        // ★限频(2026-08-14 trace④):探索期 Tiles_ 表持续晚到,每张都置位→
        // 每 30t 一次全 UI 刷新;元素复用后刷新本身已廉价,这里再限频——一个
        // 500ms 窗口内的多张表只触发一次图标刷新(图标只关心"有没有就位",不关心哪张)
        if (file.includes('Item_Atlas') || file.startsWith('vanilla/Tiles_')) {
          if (!this._iconUiDirtyAt || Date.now() - this._iconUiDirtyAt > 500) {
            this._iconUiDirtyAt = Date.now();
            this.iconUiDirty = true;
          }
        }
      };
    }
    // 电路系统(Wiring.cs 移植):器件表 + 触发源登记(测重板 428/感应器 423)
    this.wiring = new Wiring(w.store);
    this.wiring.worldSurface = w.groundLevel;
    // NPC.downedPlantBoss（Wiring 蜥蜴砖致动/神庙传送器限制解除门，Wiring.cs:3216/:1554）
    this.wiring.planteraDowned = !!w.flags['downed_262'];
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
      dungeonX: w.dungeonX, difficulty: w.difficulty ?? 0,
      flags: w.flags,
      crimson: w.crimson,
      get isDay() { return w.clock.isDay; },
      get raining() { return !!w.weather?.raining; },
      get maxRaining() { return w.weather?.maxRaining ?? 0; },
      get windSpeedCurrent() { return w.weather?.windSpeedCurrent ?? 0; },
      // Main.cs:6270-6294 UpdateTimeRate：快进中 desiredWorldTilesUpdateRate 恒 1（与
      // dayRate=60 解耦）；否则 = dayRate（冻结 0 / TargetTimeRate × 全员熟睡 5）。
      // 再走 GetWorldUpdateRate 封顶 24（WorldGen.cs:72056-72063）——睡觉 ×5 演化加速由此进链
      get worldUpdateRate() { return Math.min(w.isFastForwardingTime() ? 1 : w.dayRate(), 24); },
      playerTile: () => ({ x: this.player.cx / TILE, y: this.player.cy / TILE }),
      // 旅程力量·停止感染蔓延（CreativePowers.StopBiomeSpreadPower，
      // WorldGen.cs:71515-71519 AllowedToSpreadInfections = !Enabled——原版消费点
      // 无 IsJourneyMode 门，状态随世界存档）
      get journeyStopBiomeSpread() { return !!w.journeyPowers?.stopBiomeSpread; },
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
      onBestiaryUnlock: (netId) => { w.bestiary.registerSight(netId); },  // :37109-37116 记 664
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
    let lcTick = -1, lcCount = 0;   // 液体合并音每 tick 节流：读档单轮 settle 残留活水
                                    // 交运行时收敛时，前几秒合并事件集中爆发，不限流会连成轰鸣
    this.liquid.liquidChangeSound = (x, y, a, b) => {
      if (lcTick !== this.tickCount) { lcTick = this.tickCount; lcCount = 0; }
      if (++lcCount > 2) return;    // 每 tick 最多 2 声（载入窗另有 suppress 门，此处管运行期）
      const lo = Math.min(a, b), hi = Math.max(a, b);
      if (lo < 1 || hi > 4 || lo === hi) return; // 同类/越界不发声
      const px = x * TILE + 8, py = y * TILE + 8;   // :4582 x*16+count*8（count 取 1）
      if (hi === 4) { this.sfx.play('shimmerSplash', 1, px, py); return; }
      const name = lo === 1 && hi === 2 ? 'liquidWaterLava'
        : lo === 1 && hi === 3 ? 'liquidHoneyWater' : 'liquidHoneyLava';
      this.sfx.play(name, 1, px, py);
    };
    // 载入窗静音门：waterCheck 全图收敛的 killTile/合并音一律静默（此时玩家/相机未就位，
    // listener=(0,0) 会满响——"进世界音效爆发"根因）；相机就位后解除。
    // 临时 listener 用出生点兜底：万一有漏网发声点，按出生点衰减也远好于 (0,0)。
    this.sfx.suppress = true;
    this.sfx.setListener(w.spawnX * TILE, w.spawnY * TILE);
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
    resetGorePool();                // Gore 池计数同步归零（clear 丢弃引用不置 dead，防 600 槽假满）
    clearPortals();                 // 传送门为世界内实体，切世界/重载一并清（BirthdayParty.WorldClear 同位）
    partyWorldClear(this.partyState);
    LanternNight.worldClear();      // LanternNight.WorldClear（Main.cs:51656）：运行时态不进存档
    mysticLogs.worldClear();        // MysticLogFairiesEvent.WorldClear（WorldGen.cs:6958）：仙女事件态复位
    cultistWorldClear();            // CultistRitual.recheck 运行时位复位（delay 走存档）
    this.golfState.worldClear();    // GolfState.WorldClear（GolfState.cs:69-76）：轨迹记录/跟踪态不进存档
    this.player = new Player(w.spawnX * TILE + 8, (w.spawnY - 3) * TILE, new Inventory()); // 主角 3 格高，抬高出生点
    // 初始装备 = 原版经典开局三件套（铜镐 3509/铜斧 3506/铜短剑 3507），其余一概不给——
    // 调试用道具经背包面板的"搜索添加"按钮获取（UI.ts 道具搜索器）
    this.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.PICK], 1);
    this.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.AXE], 1);
    this.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD], 1);
    this.prefetchInvProjectiles();
    prefetchTrapProjectiles();
    this.attachRenderLogHandle();
    this.attachMemSentinel();
    this.camera.x = this.player.cx;
    this.camera.y = this.player.cy;
    this.sfx.suppress = false;                            // 解除载入静音门
    this.sfx.setListener(this.player.cx, this.player.cy); // 相机/玩家就位即校正 listener（fixedUpdate 每帧兜底）
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
        if (n.shimmered) t.shimmered = true;   // 微光变体恢复（townNpcVariationIndex,WF:2927）
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
      // ★bound 救援 NPC 生成期【不放置】（2026-08-13 对齐原版，实证链）：
      //   ① WorldGen SpawnStarterNPCs（cs:19830-20041）普通种子分支只 NewNPC(22)
      //     向导（最终 else :20037-20041），无任何 bound NPC；
      //   ② bound NPC（105/106/123/354/589/534/685）唯一来源 = NPC.Spawner 链
      //     （三人组 :1994-2008 / 造型师 :1576 / 高尔夫 :1600 / 机械师 :2563 /
      //     税务员 :4777），各带前置门+概率+!saved+!AnyNPCs；
      //   ③ Spawner.SpawnNPC(X,Y,Type)（:5146）= 普通 NewNPC，bound 形态即类型本体。
      //  此前 placeBoundRescueNpcs 在生成期直接放五只 bound（开局即可无门救出全部），
      //  已移除——由 VanillaSpawner 各链 1:1 供给（589/685 走 spawnBound 占位）。
      // 渔夫任务链首掷（WorldGen.cs:22655 → Main.AnglerQuestSwap）+ 沙滩睡渔夫放置
      this.anglerQuestSwap();
      this.placeSleepingAngler();
    }
    // 昼夜事件基线：季节旗标 + 时钟快照
    this.checkSeasonal();
    // MysticLogFairiesEvent.StartWorld（WorldGen.cs:3303 OnWorldLoad）：读图/新世界
    // 扫一次倒木桩（StartNight 会重扫，此为入夜前的首扫）
    mysticLogs.startWorld(this.fairyCtx());
    // setFireFlyChance 读档重掷（WorldFile.cs:770 加载回调末尾 = 液体沉降后；
    // 五静态位不落盘、初值全 0——原版每次读档都重掷，白昼存读当夜值随之刷新）
    setFireFlyChance(this.world);
    this._lastClockT = this.world.clock.timeOfDay;
    // 成就：解锁弹窗（原版 InGamePopups.AchievementUnlockedPopup,InGameNotificationsTracker
    // 底部居中锚 screenHeight-40、300t 寿命——非 Steam 专属;UI 无 popup 钩子时回退 toast）
    // + 进世界基线
    this.achievements.onUnlock = (name) => {
      const disp = Lang.text(`Achievements.${name}_Name`);
      if (this.cb.onAchievementPopup) this.cb.onAchievementPopup(name, disp);
      else this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.AchievementUnlocked', disp));
      // 背包内提示牌即时换下一目标（原版每帧重绘的等价触发）
      this.cb.onInventoryChanged?.();
    };
    // Journey 研究（Research 内核，子代理 E 移植）：成就桥 + 进世界 forced 检查
    // （Player.cs:318 OnEnterWorld forced:true）
    this.research.onProgressionEvent = (ev) => this.achievements.notifyProgressionEvent(ev);
    this.research.checkResearchAchievement(true);
    this.achOnWorldEnter();
    (window as unknown as { __swResearch?: unknown }).__swResearch = this.research;
    this.cb.onInventoryChanged();
  }

  /** 沙滩睡渔夫（NPC 376）放置。原版由 SpawnNPC 海洋段掷出（NPC.cs:1705-1728 海洋
   *  水域 / :1835-1837 沙滩干沙分支——两分支同门：!savedAngler && !AnyNPCs(376) &&
   *  横向边缘 380 格内 && 地表以上）。本仓在生成期与入驻轮确定性补放：就近取出生点
   *  一侧的合格干沙格（空气×2 + 沙格 + 地表以上），差异仅"何时放"不含条件语义。
   *  解救后写 flags.savedAngler（NPC.savedAngler，WF:1334/2160 随存档）。 */
  private placeSleepingAngler(): boolean {
    const w = this.world;
    const st = w.store;
    if (w.flags.savedAngler) return false;   // NPC.savedAngler
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === 'angler')) return false;
    // Main.tileSand（NPC.cs:7177-7180）：黄沙/黑檀沙/珍珠沙/猩红沙
    const sands = new Set(['sand', 'v_112_ebonsand_block', 'v_116_pearlsand_block', 'v_234_crimsand_block']
      .map((k) => TILE_BY_KEY[k]).filter((v): v is number => v !== undefined));
    const surface = Math.floor(w.groundLevel);                              // y < worldSurface 门（:1835）
    const sides: Array<[number, number]> = [[8, 1], [st.w - 9, -1]];        // 双侧海洋，向外到内
    const spawnTx = Math.floor((this.player.cx || w.spawnX * TILE) / TILE);
    sides.sort((a, b) => Math.abs(a[0] - spawnTx) - Math.abs(b[0] - spawnTx));
    for (const [x0, dir] of sides) {
      for (let k = 0; k < 380; k++) {         // WorldGen.beachDistance（WorldGen.cs:4102）
        const x = x0 + dir * k;
        if (x < 8 || x > st.w - 9) break;
        for (let y = Math.max(4, surface - 40); y < surface; y++) {
          if (!sands.has(st.get(x, y)) || st.liquid[st.idx(x, y)] > 0) continue;   // !waterTile
          if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2)) continue;              // 空气×2
          if (this.placeBoundNpc('angler', 'savedAngler', x, y - 1)) return true;
          break;
        }
      }
    }
    return false;
  }

  /** 深度带内找 bound 落脚点（空气×2 + 下方实心），返回 [x, 脚底上一格y] */
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
    // 685 抖箱保真门（Main.cs:42454 + TryFreeingElderSlime :42536-42553）：须消耗金钥匙 327
    if (npc.npcKey === 'town_slime_old') {
      if (!this.consumeVanillaItem(327)) {
        this.cb.onToast?.(Lang.itemName(327) ? `需要${Lang.itemName(327)}！` : '需要金钥匙！');
        return;
      }
    }
    npc.bound = false;
    const flagByKey: Record<string, string> = {
      goblin_tinkerer: 'savedGoblin', wizard: 'savedWizard', mechanic: 'savedMech',
      stylist: 'savedStylist', tax_collector: 'savedTaxCollector', golfer: 'savedGolfer',
      tavernkeep: 'savedBartender',   // 醉酒酒保 579 解救 → Transform 550（:19806）
      angler: 'savedAngler',   // NPC.savedAngler（睡渔夫 376 解救 → 渔夫 369 入镇）
      // 老城镇史莱姆（绑缚 685 → TransformElderSlime :19077-19091 → 679 +
      // unlockedSlimeOldSpawn=true，WF:1410 随存档）——走 flags 即自动持久化，
      // SpawnAnNPC 三人组链的 !unlockedSlimeOldSpawn 门随之关闭
      town_slime_old: 'unlockedSlimeOldSpawn',
      town_slime_clumsy: 'unlockedSlimePurpleSpawn',  // 686 气球绑缚解救（:1347 门旗）
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
    // :13677-13684 净化粉命中神秘青蛙 687 → Poof + Transform(683) 神秘史莱姆 +
    //  unlockedSlimeYellowSpawn 置位（世界级一次性，WorldFile :1414/:2434 持久化）
    for (const cent of this.entities.critters) {
      const c = cent as Critter;
      if (c.dead || CRITTER_BY_KEY[c.key]?.npc !== 687) continue;
      if (x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y) {
        c.dead = true;
        this.spawnParticles(c.cx, c.cy, '#DCE8E2', 10, 1.5, { life: 24 });
        this.world.flags.unlockedSlimeYellowSpawn = true;
        const ms = new TownNPC('town_slime_yellow', c.x, c.y);
        this.entities.add(ms, 'npcs');
        this.cb.onToast?.(Lang.npcName(683) ?? '神秘史莱姆加入了小镇！');
        break;
      }
    }
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (!(npc instanceof TownNPC) || npc.dead || !npc.bound) continue;
      if (npc.npcKey !== 'tax_collector') continue; // 原版 534 是唯一受净化粉转化的 NPC
      if (x < npc.x + npc.w && x + w > npc.x && y < npc.y + npc.h && y + h > npc.y) {
        this.freeBoundNpc(npc);
      }
    }
    // :13649-13657 净化粉命中【敌怪 534】→ NPC.Transform(441)（:81850：SetDefaults
    // 换型 + 保血量比例 + withReposition 底边对齐 + homeless + 地面 home；441 城镇
    // NPC active 后 AI_007_UpdateSavedStates 写 savedTaxCollector 关链门）。
    // ★生成期 bound TownNPC 放置移除（2026-08-13）后，534 由 Spawner 地狱链以
    // 敌怪掷出（NPC.cs:4777）——本段不扫敌怪桶则税务员转化链【断】（弹粉命中的
    // 是 Enemy 而非 bound TownNPC）；上方 npcs 桶扫描保留兜底旧存档的 bound 残留
    for (const n of this.entities.enemies) {
      const en = n as Enemy;
      if (!(en instanceof Enemy) || en.dead || en.vanillaId !== 534) continue;
      if (x < en.x + en.w && x + w > en.x && y < en.y + en.h && y + h > en.y) {
        en.dead = true;                                  // 原 NPC 同槽换型 → 本仓死+新生成等价
        this.world.flags['savedTaxCollector'] = true;    // UpdateSavedStates 链门
        const tc = new TownNPC('tax_collector', en.cx, en.y + en.h);
        tc.x = en.cx - tc.w / 2;
        tc.y = en.y + en.h - tc.h;                       // withReposition 底边对齐
        this.entities.add(tc, 'npcs');
        // TransformVisuals(534, 441)（:81739）：换型尘雾 + 音效
        this.spawnParticles(en.cx, en.cy, '#B79A6B', 20, 2);
        this.playSfxFiles(['NPC_Killed_1'], 0.7);
        this.newText(Lang.text('Mods.SandboxWorld.NPC.Rescued', Lang.npcName(441) ?? 'Tax Collector'), 50, 125, 255);
        break;
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
  /** GPU 压力收缩:释放最旧 chunk 至当前上限(画布 width=0 即归还) */
  shrinkChunks(): void {
    const cc = this.chunks; if (!cc) return;
    while (cc.chunks.size > ChunkCache.MAX_CHUNKS) {
      const oldest = cc.chunks.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      const pair = cc.chunks.get(oldest);
      if (pair) { pair.wall.width = 0; pair.wall.height = 0; pair.tile.width = 0; pair.tile.height = 0; }
      cc.chunks.delete(oldest);
    }
  }

  destroy() {
    // R7：联机断开（否则幽灵玩家 + gameWorld 数百 MB 无法回收）
    this.net?.disconnect();
    this.net = null;
    this.remotePlayerProxies = [];
    entityNet.reportStrike = null; // v3 实体钩子随生命周期摘除
    this.running = false;
    // 天气：雨声层静音 + 环境循环轨停拆 + 渲染器 detach（防下个世界复用旧状态）
    this.stopWeatherLoops();
    this.renderer.weatherFxActive = false;
    this.renderer.weatherFx.detach();
    this.renderer.sky.weatherRef = null;
    this.renderer.sky.clearAmbience();
    natureParticles.clear(); // 落叶/滴水粒子不跨世界残留
    natureParticles.onDripSplash = null;
    flameParticles.clear(); // 山羊火焰 FlameParticle 同理不跨世界残留
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
    resetCageAnim();   // 笼子动画槽位表(键含世界内格坐标)跨世界残留——清(2026-08-13 泄露 review)
    this.summonPanel?.close();   // F6 面板挂 document.body——Game.destroy/quitToMenu
    this.summonPanel = null;     // 均够不着,反复进游戏在 body 上累积(dev-only,2026-08-13)
    this.renderer.resetFxCache();   // 44 彩虹翼烘焙/Extra_156 采样缓存（同 contextlost 归零语义）
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
    // 时间推进倍率（Main.cs:6270-6294 UpdateTimeRate 1:1，经 World.dayRate()）：
    //   快进中（日晷/月晷 IsFastForwardingTime）恒 60；
    //   否则 FreezeTime 0 / TargetTimeRate × 全员熟睡 5（:6280-6285 SleepingPlayersCount
    //   ==ActivePlayersCount && >0——单人 = 本地玩家 FullyFallenAsleep）。
    // 熟睡计时（PlayerSleepingHelper.UpdateState :93-98：睡中 timeSleeping++；被打断归零。
    // DoesPlayerHaveReasonToActUpInBed :44-59 的危险/血月夜/日食昼门在此近似重置）
    if (this.player.sleeping) {
      const actUp = (w.clock.bloodMoon && !w.clock.isDay) || (w.clock.eclipse && w.clock.isDay)
        || w.lunarEvent.moonLordCountdown > 0 || w.invasionType > 0 || moonEventActive(w)
        || w.oldOnesArmy.ongoing || this.player.useTime > 0;
      this.player.timeSleeping = actUp ? 0 : this.player.timeSleeping + 1;
    } else {
      this.player.timeSleeping = 0;
    }
    // FullyFallenAsleep（PlayerSleepingHelper.cs:33-37：isSleeping && timeSleeping>=120）
    w.allSleeping = this.player.sleeping && this.player.timeSleeping >= 120;
    w.clock.tick(dt * 1000 * w.dayRate());
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
    this.sfx.suppress = false;   // 安全网：afterWorldLoad 中段抛异常导致门未解除时，首 tick 自动恢复有声
    this.sfx.setListener(this.camera.x, this.camera.y);
    // ---- 原版环境采样 + BGM 选曲（SceneMetrics/UpdateAudio_DecideOnNewMusic；15 tick 刷新） ----
    if (this.tickCount % 15 === 0) {
      // 城镇 NPC 计数为"距离盒"语义（SceneMetrics.cs:755-757/:12/:18：
      // AssumedConstantScreenSize=1920×**1200**,CenteredRectangle(Center,×2)=
      // ±1920×±1200px 内的 townNPC——曾误用 1080(高偏窄,2026-08-13 对齐)）——
      // 全图存活数会让 46/47 城镇曲盖住一切群系 BGM
      const townNPCCount = this.entities.npcs.filter((n) => {
        const tn = n as TownNPC;
        return !tn.dead && Math.abs(tn.cx - this.player.cx) <= 1920 && Math.abs(tn.cy - this.player.cy) <= 1200;
      }).length;
      this.scene = scanScene(w, this.player.cx, this.player.cy, townNPCCount, partyIsUp(this.partyState));
      // 屏内旗扫描（SceneMetrics.cs:420-443）——每 20tick 随 scene 刷新,旗 buff npc 集
      const bpx = Math.floor(this.player.cx / TILE), bpy = Math.floor(this.player.cy / TILE);
      this._bannerNpcs = scanBannerNpcs(w.store, bpx - 100, bpy - 70, bpx + 100, bpy + 70);
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
      // ★事件曲 flag 链（Main.cs:12150-12566 全 1:1）：屏盒内 NPC 逐个经 type→num3
      //  槽位置位**独立 flag**（多 Boss 并存各置各 flag,非首/末取一——曾 break 首个
      //  =近似,已废）,再由 SLOT_MUSIC_CHAIN 固定 else-if 序裁决。
      //  规则（:12162-12291）：
      //  ① type 表 MUSIC_SLOT 命中即得槽（世吞段/骷髅王手/WoF 眼/毁灭者链/世花钩蔓
      //    等非 boss 段同触发）；438/379 需仪式态（ai[1]==1 / ai[3]>=0）且盒半径
      //    收窄 1600（:12212-12225）;
      //  ② OOA 成员覆写 num3=12（:12281-12283,压过原槽——Betsy 551 等 DD2 族曲 41）;
      //  ③ num3==0 && boss → 槽 1 Boss1 兜底（:12283-12287;578 本仓 VANILLA_BOSS_IDS
      //    消散语义位,原版无 boss → 排除）;
      //  ④ Mechdusa 覆写（:12288-12291 remix+getGood && 125/126/127/134 → 槽 17）;
      //  ⑤ num3==0 skip;盒 = NPC 中心对屏盒求交（:12297-12302,cx/cy 对玩家中心近似）。
      const sfMusic = w.seedFlags ?? {};
      const mechdusaMusicWorld = (!!sfMusic.remix && !!sfMusic.getGoodWorld) || !!sfMusic.everything;
      const eventSlots = new Set<number>();
      for (const e of this.entities.enemies) {
        const en = e as unknown as { cx: number; cy: number; def?: { boss?: boolean }; vanillaId?: number | null; ai1?: number; ai3?: number; dead?: boolean };
        if (en.dead || en.vanillaId == null) continue;
        const id = en.vanillaId;
        const ceremony = (id === 438 && en.ai1 === 1) || (id === 379 && (en.ai3 ?? 0) >= 0);
        let slot = id === 438 || id === 379 ? (ceremony ? 20 : 0) : MUSIC_SLOT[id] ?? 0;
        if (isOldOnesArmy(id)) slot = 12;   // ② OOA 覆写（事件未开时雕像产怪同切曲,原版无 ongoing 门）
        if (slot === 0 && !!en.def?.boss && id !== 578) slot = 1;   // ③ Boss1 兜底
        if (mechdusaMusicWorld && (id === 125 || id === 126 || id === 127 || id === 134)) slot = 17;  // ④
        if (slot === 0) continue;           // ⑤
        const box = ceremony ? 1600 : 5000;
        if (Math.abs(en.cx - this.player.cx) < box && Math.abs(en.cy - this.player.cy) < box) {
          eventSlots.add(slot);
        }
      }
      const eventMusic = resolveEventMusic(eventSlots);
      // 月事件 BGM（Main.cs:12914-12921，链尾最高优先级）：相机在地表
      // worldSurface+10 格带内时覆盖一切（含 Boss 曲）；南瓜月 30 / 霜月 32
      const moonMusic = w.moonEvent.kind === MOON_KIND_PUMPKIN ? 30
        : w.moonEvent.kind === MOON_KIND_FROST ? 32 : 0;
      const moonMusicGated = moonMusic && this.player.cy / TILE < w.groundLevel + 10 ? moonMusic : 0;
      const music = pickMusic({
        scene: this.scene, isDay, eventMusic, moonMusic: moonMusicGated,
        musicBox: this.scene.musicBoxStyle,
        torchGod: this.torchGod?.active ?? false,   // InTorchGodMinigame（Main.cs:12477-12480 → 101）
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
      for (let acc = ACC_ARMOR_START; acc < player.inv.accSlotMax; acc++) {
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
    // 坐骑能力输入（钻头坐骑 8 专用：ItemCheck_HandleMount :52066-52081）：
    // 鼠标世界坐标（AimAbility 的 crosshair）+ 左/右键电平 + 按压边沿
    //（releaseUseItem&&releaseUseTile = 上 tick 双松 + 本 tick 任一按下）
    {
      const [awx, awy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
      player.aimWX = awx;
      player.aimWY = awy;
      player.inputUseItem = !!inp.mouseDown;
      player.inputUseTile = !!inp.rightDown;
    }
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
    // 手持物品 useTurn 注入（Player :19546 移动改向门的豁免旗——工具镐/斧 true，
    // 武器 false；vanilla-itemcombat.json 2026-08-13 提取 1141 件）
    player.itemUseTurn = !!itemCombat(player.inv.heldItem()?.id ?? -1)?.useTurn;
    const achPxBefore = player.x;
    player.fixedUpdate(dt, this);
    // FlameParticle 步进（Main.UpdateParticles Main.cs:3951-3952 的
    // ParticleSystem_World_BehindPlayers——山羊坐骑 47 火焰本体；
    // spawn 在 Player.goatFlames 回调，绘制在 Renderer.drawFlameParticles）
    flameParticles.update();
    // 原版 Dust 步进（UpdateDust :423——customData 跟随差值 = 主角本 tick 位移；
    // 视口世界矩形用于屏底清除）+ 逐尘光照推 LightingEngine
    {
      const vz = this.camera.zoom;
      const vw = this.renderer.canvas.width / vz, vh = this.renderer.canvas.height / vz;
      this.vanillaDust.update(this.camera.x - vw / 2, this.camera.y - vh / 2, vw, vh,
        player.x - player.oldX, player.y - player.oldY,
        // 43 型照度门 Lighting.GetColor（Dust.cs:1475-1484）读光采样器
        (tx, ty) => this.lighting.lightAt(tx, ty),
        // 278 型入实心格收缩（Dust.cs:2264-2268）WorldGen.SolidTile 探针
        (tx, ty) => { const s = this.world.store; return s.inBounds(tx, ty) && s.isSolid(tx, ty); },
        // 主角探针：230 型钻头尘吸向玩家中心（:655-663 customData=mountedPlayer）/
        // 76 型雪尘随玩家下坠（:1814 Main.player[myPlayer].velocity.Y）
        { cx: player.cx, cy: player.cy, vy: player.vy });
      for (const l of this.vanillaDust.lights) {
        const tx = Math.floor(l.x / TILE), ty = Math.floor(l.y / TILE);
        if (this.world.store.inBounds(tx, ty)) this.lighting.addLight(tx, ty, l.r, l.g, l.b);
      }
    }
    // 成就：跑动里程（HandleRunning Player.cs:27925：flag32 && velocity.Y==0——
    // 仅着地跑动计入，空中位移不算）
    if (player.onGround) this.achNotifyRunning(Math.abs(player.x - achPxBefore));
    // 成就：抵达世界顶/底（Player.BordersMovement :23781 顶 y<640 → event 11；
    // :23850 底 y>bottomWorld-640-118-height → event 10）
    if (player.y < 640) {
      this.achievements.handleSpecialEvent(11,
        { statLifeMax: player.maxHp, statManaMax: player.maxMana });
    } else if (player.y > this.world.store.h * TILE - 640 - 118 - player.h) {
      this.achievements.handleSpecialEvent(10,
        { statLifeMax: player.maxHp, statManaMax: player.maxMana });
    }
    // 成就：群系到达（Player.cs:16595-16628 逐帧语义，此处 15t 节流）——
    //  蜂巢墙 86 → 12（蜂蜜）/ 蛛巢墙 62 → 13（蜘蛛）/ 地狱层 y>h-200 → 14（酷热）/
    //  特殊种子 → 26 / 地表发光菇群系 → 15（Funkytown）/ 墓地 → 18
    if (this.tickCount % 15 === 0 && !player.dead) {
      const achPlayer = { statLifeMax: player.maxHp, statManaMax: player.maxMana };
      const px = Math.floor(player.cx / TILE), py = Math.floor(player.cy / TILE);
      if (this.world.store.inBounds(px, py)) {
        const wall = this.world.store.wall[this.world.store.idx(px, py)];
        if (wall === 86) this.achievements.handleSpecialEvent(12, achPlayer);
        else if (wall === 62) this.achievements.handleSpecialEvent(13, achPlayer);
      }
      const sf = this.world.seedFlags ?? {};
      if (sf.drunkWorld || sf.getGoodWorld || sf.tenthAnniversary || sf.notTheBees
        || sf.theConstant || sf.remix || sf.noTraps || sf.everything || sf.skyblock) {
        this.achievements.handleSpecialEvent(26, achPlayer);
      }
      if (py > this.world.store.h - 200) {
        this.achievements.handleSpecialEvent(14, achPlayer);
      } else if (py < this.world.groundLevel && this.scene?.zoneGlowshroom) {
        this.achievements.handleSpecialEvent(15, achPlayer);
      } else if (this.scene?.zoneGraveyard) {
        this.achievements.handleSpecialEvent(18, achPlayer);
      }
    }
    // 成就：定期落盘（原版退出时存 achievements.dat；10s 节流防丢中途进度）
    if (this.tickCount % 600 === 0) this.achievements.flush();
    // 宠物/光宠存续（Player.UpdatePet/UpdatePetLight :17147-17187 每帧语义）：
    // 装备槽 [0]/[1] 有宠物物品且未隐藏 → 确保跟随体；卸装/隐藏/死亡 → 消散
    this.updatePets();
    // Journey 研究：逐帧版本门复查（Player.cs:25418 CheckResearchAchievement——
    // 中途跨半数线当帧触发 event 45，曾只在进世界查）
    this.research.checkResearchAchievement();
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
          this.achCheckBestiary();
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
    // ★_prevMouseDown/_prevRightDown 须在 updateUse 【之后】记录上一帧值——
    // 此前记在 updateUse 之前(= 本帧值),⑩ 边沿门 mouseDown&&!prev 恒 false,
    // 非 autoReuse 武器(链球/回旋镖/悠悠球/长矛)全体掷不出(2026-08-13 实锤)
    this.updateNebulaBoosters();
    if (this.player.sleeping) {
      const bx = Math.floor(this.player.cx / TILE), by = Math.floor((this.player.y + this.player.h + 2) / TILE);
      if (!w.store.inBounds(bx, by) || w.store.type[w.store.idx(bx, by)] !== (TILE_BY_KEY['bed'] ?? -1)) {
        this.player.sleeping = false; // 床格失效（SH:98-101）
      }
    }
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
          // 开瞄（AI_150 :49507-49525）：500×500 盒（玩家中心）内无自有球 → 自动摆球
          const ball500 = this.entities.projectiles.some((e) => {
            const b = e as GolfBall;
            return b instanceof GolfBall && !b.dead && b.isMine
              && Math.abs(b.cx - this.player.cx) <= 250 && Math.abs(b.cy - this.player.cy) <= 250;
          });
          let ball = myBall();
          if (!ball500) {
            // TryPlacingAGolfBallNearANearbyTee（Player.cs:48857-48917，placePosition=玩家中心）
            this.tryPlacingGolfBallNearTee(this.player.cx, this.player.cy, mwx, mwy);
            ball = myBall();
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
            // 松开 → 击球（:49527-49560）：公式击出 + 地面阻尼（HitGolfBall :451-474）。
            // 原版遍历全部自有球逐个 ValidateShot 后击出（:49530-49556）——单人等价 =
            // 站位盒内全部击出
            const st = this.world.store;
            for (const e of this.entities.projectiles) {
              const b = e as GolfBall;
              if (!(b instanceof GolfBall) || b.dead || !b.isMine || !golfBallInStance(b, this.player)) continue;
              const shot = golfShot(mwx, mwy, b, club);
              // HitGolfBall 材质阻尼查球底+1px 格（GolfHelper.cs:453-459：
              // Bottom=(x+w/2,y+h) 再 +1 → 中心X/底+1 取格）
              const btx = Math.floor((b.x + b.w / 2) / TILE);
              const bty = Math.floor((b.y + b.h + 1) / TILE);
              const below = st.inBounds(btx, bty) && st.flags[st.idx(btx, bty)] !== 0
                ? golfVanillaTileId(st, btx, bty) : null;   // 原版 id（材质表键）
              b.clubHit(shot.vx, shot.vy, club.rough, below);
              this.sfx.play('tink', 0.8, b.cx, b.cy);   // Item126 击球音（:49550）
            }
            this.sfx.play('throw', 1, this.player.cx, this.player.cy); // Item1 挥杆音（:49528）
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
      // GetRespawnTime（Player.cs:38384-38422）：600t=10s 基准;专家 ×1.5=900;
      // 场上有存活的 boss 时 +600（:38388 boss 扫描 `!pvp` 门——PvP 死亡不延迟）。
      // 旧恒 180t=3s 惩罚感仅原版 1/3（2026-08-13 修）
      if (player.respawnTimer > 600 * (mainExpertMode(this.world) ? 1.5 : 1)
        + (player.lastPvpDeath ? 0
          : this.entities.enemies.some((en) => (en as unknown as { def?: { boss?: boolean } }).def?.boss && !en.dead) ? 600 : 0)) this.respawnPlayer();
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
    // ⑩ 边沿门的上一帧快照（须在 updateUse 后记录,见上方注记）
    this._prevRightDown = !!inp?.rightDown;
    this._prevMouseDown = !!inp?.mouseDown;

    // ---- 实体 ----
    this.entities.update(dt, this);
    // 弹幕扫掠碎裂砖（Projectile.HandleMovement :16630-16655 等价）：移动扫掠盒内
    // 裂砖 KillTile（CanCutTile AttackProjectile 上下文对普通格恒 true——:87573，
    // 墙 350/下方 78·380·579 豁免面窄不构成主门）。DebrisProj 自身豁免（弹片不碎砖，
    // 原版 :16634 tileCutIgnorance 含自身弹型；其连锁走 Kill 段）
    this.crushCrackedBricksSweptByProjectiles();

    // ---- gore 池推进（Gore.Update 每 tick，Gore.cs:313——Main.Update 全量 gore 遍历
    //      的本仓等价）。此前缺失 = 死亡碎块冻结 + timeLeft 永不衰减（600 槽只进不出，
    //      池满后新 gore 静默丢弃）；2026-08-13 泡泡棒（§5 1450）实装时接通。
    //      Set 迭代期 kill() 删除已访元素安全（未访的不再被访） ----
    for (const gp of liveGorePieces()) gp.fixedUpdate(dt, this);

    // ---- 拴绳实体（LeashedEntity.UpdateEntities，Main.cs:17895）----
    // 锚桩 724 小动物 / 风筝桩 723 风筝的 AI 推进 + 族点光（firefly/fairy/snail/
    // hell/empress 的 Lighting.AddLight 经 env.addLight 直推 LightingEngine）。
    // 距离门见 LeashedEntityManager.streamRadius（≈ vanilla section 流式）
    this.leashed.update(this.world, this.leashedEnv(), this.player.cx, this.player.cy);

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
    const heldWC = !!held2 && viIdFromKey(ITEM_DEFS[held2.id]?.key ?? '') === 148;
    this.heldWaterCandle = heldWC;
    if (this.tickCount % 15 === 0) this.boundTouchCheck();   // 绑缚触碰解救（AI_007 接触语义）
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
    // 瓶中星(42 frameY 252-286→158)、向日葵(27→146，墓地压制见下)、猫堡垒(506 frameX<72→215)、
    // 和平蜡烛(372 frameX<18→157)——AddBuff 2t 自动续。
    // 向日葵 HasSunflower 门（SceneMetrics.cs:626-631）：墓碑计数 > GraveyardTileMin(16)
    // 时 HasSunflower=false——墓地内向日葵不再给"快乐！"buff（:25262-25265）
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
      if (sun && this.scene.hasSunflower) b.apply(BuffType.Sunflower, 0.5);
      if (bast) b.apply(BuffType.CatBast, 0.5);
      if (peace) b.apply(BuffType.PeaceCandle, 0.5);
      this.peaceCandleNear = peace;
    }
    // 原版 Main.SpawnNPC 每帧调用（Main.cs:17724），概率门在 TrySpawnAnNPC L30
    // （Next(spawnRate)==0；spawnRate 修正表见 VanillaSpawner.getSpawnRate）。
    // 水蜡烛（heldWaterCandle/waterCandleNear）在 getSpawnRate 内修正，不再改节流
    if (this.enemySpawnEnabled) {
      // 旅程刷怪率滑杆=0（NPC.SpawnNPC :186-201 CanSpawnEnemiesNear :255-277——
      // IsJourneyMode + GetShouldDisableSpawnsFor：史莱姆雨落怪与常规刷怪同受此门）
      if (!(w.isJourney && shouldDisableSpawns(w.journeyPowers.spawnRateSlider))) {
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
    // ---- 天启态每帧巡检（WorldGen.cs:71523 UpdateWorld 内 UpdateLunarApocalypse，
    //      每帧执行）：场上无对应塔 NPC → TowerActive 置 false；四塔全灭且无 398
    //      → StartImpendingDoom。除塔被击杀（onLunarTowerKilled）外还覆盖塔被
    //      清场/驱散等非击杀退场——此前只挂在击杀链上，退场不触发 doom ----
    updateLunarApocalypse(w, (id) => this.hasNpcId(id), this.lunarHost());
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
    //      入夜 CheckNight / 黎明 CheckMorning 在下方昼夜事件 crossing 段触发。
    //      UpdateTime 尾段其余子系统处置（Main.cs:64427-64434，逐一核实）：
    //      · CultistRitual.UpdateTime（:64427 / CultistRitual.cs:20-47）——已接：
    //        地牢拜月教石碑 437 自然重生计时（hardMode && downedGolemBoss && downedBoss3，
    //        delay/recheck 每帧按 dayRate 递减，双零掷 TrySpawning(dungeonX/Y)）；
    //        delay 随存档（WF:1340/:2192 → World.cultistDelay，缺省 86400=delayStart），
//        TabletDestroyed 账在下方
    //        石碑 ai0==-1 边沿捕获（NPC.cs:38881）
    //      · MysticLogFairiesEvent.UpdateTime（:64433）——已接：倒木桩夜放仙女
    //        （StartNight 开闸 + 扫桩在 DUSK 块）
    //      · CreditsRollEvent.UpdateTime（:64432）——月总死亡制作名单倒计时递减，
    //        纯客户端演出数值（消费端 = 滤镜/联机包）→ 不适用
    //      · PylonSystem.Update（:64434 / TeleportPylonsSystem.cs:29-42）——列表更新冷却
    //        = int.MaxValue，实际语义 = 首帧建表 + TE 放置/拆除时 RequestImmediateUpdate
    //        （:45-52）即时重建；本仓 TeleportPylons.ts:64 按需等价 → 不适用 ----
    LanternNight.updateTime(this.lanternCtx());
    // CultistRitual.UpdateTime（Main.cs:64427 每帧位）。房主权威——访客不跑世界事件计时
    if (!this.net || this.net.policy.isHost) {
      // TabletDestroyed 账（NPC.cs:38881）：石碑召出 439 的同一帧置 delay=43200。
      // 前置门先判（石碑只可能出现在 hardMode+石巨人+骷髅王之后的世界）省一次全实体扫；
      // 原版调用点在 AI_083a 内部，此处以石碑 ai0==-1（"已召邪教徒"标记）边沿等价
      // 捕获，每块石碑只记一次（WeakSet 去重）
      if (w.flags.hardMode && w.flags['downed_245']
        && (w.flags.downedSkeletron || w.flags['downed_35'])) {
        for (const en of this.entities.enemies) {
          const tab = en as Enemy;
          if (tab.vanillaId === 437 && tab.ai0 === -1 && !this._cultistTabletDone.has(tab)) {
            this._cultistTabletDone.add(tab);
            cultistTabletDestroyed(w);
          }
        }
      }
      if (cultistRitualUpdateTime(w, w.dayRate(), this.cultistCtx())) {
        // 重生日志：TrySpawning 命中（437 已在地牢锚落位）
        console.info(`[cultist] 神秘石碑 437 自然重生 @ dungeon (${w.dungeonX}, ${w.dungeonY}), delay=${w.cultistDelay}`);
      }
      // MysticLogFairiesEvent.UpdateTime（Main.cs:64433 每帧位）
      if (this._fallenLogRescan) {
        this._fallenLogRescan = false;
        mysticLogs.fallenLogDestroyed(this.fairyCtx());   // breakTile 延迟消费（清格后重扫）
      }
      mysticLogs.updateTime(w, w.dayRate(), this.fairyCtx());
    }

    // ---- Boss 逻辑 ----
    bossBlock: if (this.boss) {
      // 原版无通用"日出剔除 Boss"机制：EoC 白天走 AI_004 自漂离、骷髅王族白天狂暴、
      // 其余 Boss（史莱姆王/世吞/克脑/蜂后/机械三王…）白天照常战斗——
      // 此前的通用 dayKill 会把白天召唤的史莱姆王秒删（史莱姆王冠原版任意时间可用）
      if (this.boss.dead) {
        // EoW 段死亡 ≠ 战斗结束（realLife=-1 各段独立，:51524-51527）：场上仍有
        // 13/14/15 时换锚到存活段续战（血条/击败记账跟着新锚走）——仅最后一段死
        // （DropEoWLoot boss 位语义）才走下方击败流程。逃走（腐化外下潜整链清除）
        // 不换锚，照常走 bossFled 分支
        const bossVid = this.boss.vanillaId ?? 0;
        if (!this.boss.bossFled && bossVid >= 13 && bossVid <= 15) {
          const rest = (this.entities.enemies as Enemy[]).find((e) => !e.dead
            && (e.vanillaId ?? 0) >= 13 && (e.vanillaId ?? 0) <= 15);
          if (rest) {
            this.boss = rest;
            break bossBlock;
          }
          if (bossVid !== 13) {
            // 记账归一：原版 downedBoss2 单旗覆盖世吞/克脑，本仓键为 downed_13
            this.boss.vanillaId = 13;
          }
        }
        // 双子换锚（DoDeathEvents_BeforeLoot NPC.cs:79716-79724：一只眼死时另一只
        // 还活着 → boss=false——击败公告/掉落门只随最后死的一只）：先死的一只不进
        // 击败流程，血条/槽位跟到幸存眼上
        if (!this.boss.bossFled && (bossVid === 125 || bossVid === 126)) {
          const other = (this.entities.enemies as Enemy[]).find((e) => !e.dead
            && e.vanillaId === (bossVid === 125 ? 126 : 125));
          if (other) {
            this.boss = other;
            break bossBlock;
          }
        }
        // 注意:?? 与 || 混用必须加括号(esbuild 语法限制)
        const bname = ((this.boss.vanillaId != null ? Lang.npcName(this.boss.vanillaId) : null) ?? this.boss.def.name) || 'Boss';
        if (this.boss.bossFled) {
          // 离场逃走(天亮撤离/玩家死后 EncourageDespawn 消散/毁灭者黎明钻地):
          // 非击杀——不播击败公告、不写 downed 标志(原版 EncourageDespawn 语义)
          this.newText(`${bname}逃走了…`, 150, 150, 150);
        } else {
          // 通用记账:按 Boss 名写 downed 标志(原版 NPC.downedBoss 表)。
          // 击败公告（DoDeathEvents_CelebrateBossDeath NPC.cs:79822-79836）：
          // 双子 → Plural + Enemies.TheTwins"双子魔眼已被打败！"；
          // 月总核心 → Single + Enemies.MoonLord"月亮领主已被打败！"（不取
          // MoonLordCore 名）；其余 → Single + 本体名
          const defeatVid = this.boss.vanillaId ?? 0;
          if (defeatVid === 125 || defeatVid === 126) {
            this.newText(Lang.text('Announcement.HasBeenDefeated_Plural', Lang.text('Enemies.TheTwins')), 175, 75, 255);
          } else if (defeatVid === 398) {
            this.newText(Lang.text('Announcement.HasBeenDefeated_Single', Lang.text('Enemies.MoonLord')), 175, 75, 255);
          } else {
            this.newText(Lang.text('Announcement.HasBeenDefeated_Single', bname), 175, 75, 255);
          }
          // 双子 125/126 共写同一家族键（NPC.cs:80223-80229 case 125: case 126: 同写
          // downedMechBoss2）——曾按 vanillaId 裸写,后死之眼写 downed_126 会漏掉
          // downed_125,机械自然 roll 全灭门(:4119)与三王全灭判定永假
          const twinsPart = this.boss.vanillaId === 125 || this.boss.vanillaId === 126;
          const downedKey = `downed_${twinsPart ? 125 : this.boss.vanillaId ?? 0}`;
          // SetEventFlagCleared(NPC.cs:79557) 首次语义:downed 旗标翻转(false→true)
          // 才触发灯笼夜——此前每次击杀都预约(2026-08-13 对齐;肉山 19 在下方链内单独投递)
          const wasDowned = !!w.flags[downedKey];
          w.flags[downedKey] = true;
          // NPC.downedPlantBoss → Wiring 死门接活（Wiring.cs:3216 蜥蜴砖致动 / :1554
          // 神庙传送器捕获：世纪之花前两处 return 拒绝）
          if (this.boss.vanillaId === 262 && this.wiring) this.wiring.planteraDowned = true;
          // 肉山：困难模式世界变换全链（NPC.cs:80281-80292 原序：砖盒 → 捕获旧
          // hardMode → StartHardmode(置位+V 带转化+洞穴墙回填) → 灯笼夜 19(仅首次)
          // → misc[15] 公告 + 成就 9(随本链迁移,2026-08-13 之前击杀即发的旧点已删))
          if (this.boss.vanillaId === 113) {
            const wof = this.boss;
            createBrickBoxForWallOfFlesh(w.store, Math.trunc(wof.cx / 16), Math.trunc(wof.cy / 16), wof.w, w.crimson);
            const { wasHard } = startHardmode(w);
            if (!wasHard) LanternNight.onGameEventCleared(19);
            this.newText(Lang.misc(15), 50, 255, 130);
            this.achievements.notifyProgressionEvent(9);
          }
          // 首胜灯笼夜预约（NPC.cs NPCLoot 各 case SetEventFlagCleared 实参 →
          // OnGameEventClearedForTheFirstTime default/10/16-18 翻转；4/21/22 排除）。
          // id 表：11 史王 8 蜂后 13 EoC 14 世吞|克脑 15 骷髅王 19 肉山 12 世纪之花
          // 6 石头人 7 猪鲨 9 邪教徒 10 月总 24 史后 23 光女 25 鹿角怪 16/17/18 三王
          if (this.boss.vanillaId != null) {
            const ev = BOSS_GAME_EVENT_BY_NPC[this.boss.vanillaId];
            if (ev !== undefined && !wasDowned) LanternNight.onGameEventCleared(ev);
            // 三王全灭 → 保底世花球茎（NPC.cs:79578-79585 case 16/17/18 →
            // WorldGen.GeneratePlanteraBulbOnAllMechsDefeated：netMode!=1 &&
            // hardMode && 三旗齐 → 丛林侧搜索框生成恰好一个灯泡）
            if ((ev === 16 || ev === 17 || ev === 18) && w.flags.hardMode
              && w.flags['downed_134'] && w.flags['downed_125'] && w.flags['downed_127']) {
              this.evolution.planteraBulbBurst();
            }
          }
          // 星璇塔触发（NPC.cs:80194-80197：教徒 439 死 → TriggerLunarApocalypse——
          // downed_439 通用置位处直接追加，四塔就位 + 满盾 + misc[43] 公告）
          if (this.boss.vanillaId === 439) this.triggerLunarApocalypse();
          // Badger's Hat 同日双杀（DoDeathEvents_DropBossPotionsAndHearts 尾段，
          // NPC.cs:79800-79814）：type==4 置 EoCKilledToday / type==113 置 WoFKilledToday
          // （:79805-79811）；双旗齐 → ResetBadgerHatTime + 掉 5004 Badger's Hat
          // （:79812-79814）。记账为运行时态，入夜 StartNight 清零（Main.cs:64703）
          if (this.boss.vanillaId === 4) this.eocKilledToday = true;
          else if (this.boss.vanillaId === 113) this.wofKilledToday = true;
          if (this.eocKilledToday && this.wofKilledToday) {
            this.eocKilledToday = false;
            this.wofKilledToday = false;
            const hat = VI(5004);
            if (hat && ITEM_BY_KEY[hat] !== undefined) {
              this.spawnDrop(this.boss.cx, this.boss.cy, hat, 1);
              this.newText(Lang.itemName(5004) ?? 'Badger’s Hat', 255, 220, 120);
            }
          }
        }
        // 骷髅王战斗结束（无论胜负）且未击败 → 守卫老人次日重新出现在地牢门口
        // （原版：老人在诅咒时消失，骷髅王离场/未被击败后重新生成；击败后转为裁缝）
        if (this.boss.vanillaId === 35 && !w.flags.downedSkeletron) {
          this.maybeRespawnOldMan();
        }
        // EoW/BoC 击杀 → 陨石坠落置位（NPC.cs:80241-80259：
        // 首杀（!downedBoss2）必掉，之后 50%）
        if (this.boss.vanillaId === 13 || this.boss.vanillaId === 266
          || this.boss.vanillaId === 14 || this.boss.vanillaId === 15) {
          const boss2 = !!(w.flags['downed_13'] || w.flags['downed_266']);
          if (!boss2 || Math.random() < 0.5) this.meteorPending = true;
        }
        this.boss = null;
      }
    }

    // ---- 树苗生长（每 5 秒扫一次） ----
    if (this.tickCount % 300 === 0) this.growSaplings();
    // ---- 城镇 NPC 入驻评估（原版 Main.cs:65021 每 7200 tick 一轮；载入后 10s 首轮
    //      ≈ UpdateTime_SpawnTownNPCs(forceUpdate)）。
    //      固定周期 = 原版语义，非偏差（:65032-65036 checkForSpawns++ 攒到
    //      7200/worldUpdateRate 才评估，无随机化）；差异仅在相位锚——原版
    //      StartNight/StartDay 双双清 checkForSpawns（:64711-64712/:64857-64858），
    //      计数锚在昼夜切换点，本仓锚全局 tick，不影响入驻节奏 ----
    if (this.tickCount % 7200 === 600) this.updateTownNpcArrival();
    // ---- 昼夜事件（UpdateTime_StartNight :64817 / StartDay :64876 语义） ----
    {
      const ct = w.clock.timeOfDay, pt = this._lastClockT;
      this._lastClockT = ct;
      const crossed = (a: number) => pt < a && ct >= a;
      if (crossed(Clock.DAWN)) {
        // 摇树表清空（UpdateTime_StartDay 首行 Main.cs:64846 WorldGen.ResetTreeShakes）——
        // 每树每日一摇的门
        this.treeShakes.reset();
        // 日晷快进落点（UpdateTime_StartDay :64844-64847 头部）：清 fastForwardTimeToDawn
        // → dayRate 自动回到常规档（World.dayRate() 每 tick 重算，无需显式 UpdateTimeRate）；
        // 日晷冷却 -1（:64885-64887，使用时置 8 → 8 个黎明后归零可再用）
        if (w.fastForwardTimeToDawn) w.fastForwardTimeToDawn = false;
        if (w.sundialCooldown > 0) w.sundialCooldown--;
        // 渔夫任务每日重掷（UpdateTime_StartDay :64852 → Main.AnglerQuestSwap）：清
        // 今日交付名单/完成旗 + 按世界门（困难/邪恶类型/Boss 进度）重选任务鱼
        this.anglerQuestSwap();
        // 成就：熬过一夜（Main.cs:64894 event 1）+ 血月夜结束（:64862-64866 event 5，
        // 血月旗在清除前求值——本块首两行即原序）
        this.achievements.notifyProgressionEvent(1);
        if (w.clock.bloodMoon) this.achievements.notifyProgressionEvent(5);
        // 黎明：月相推进 + 血月清除 + 季节重算（Main.cs:64877-64890）
        w.clock.moonPhase = (w.clock.moonPhase + 1) % 8;
        w.clock.bloodMoon = false;
        // drunkWorld 黎明翻转世界邪恶类型（Main.cs:64883-64886：!dayTime 期交替腐化/猩红）
        if (w.seedFlags?.drunkWorld) w.crimson = !w.crimson;
        // 自然召唤旗白天清除（UpdateTime :64625-64626）
        this.spawnEyePending = false;
        this.spawnHardBossPending = 0;
        // 普通事件 roll 压制（Main.cs:64652-64660 ShouldNormalEventsBeAbleToStart，在
        // StartDay 之前求值——此时 CheckMorning 未跑，LanternsUp 仍为真；除灯笼夜外
        // 天界入侵进行中/场上有月总/月总倒计时>0 同样置 stopEvents=true）
        const stopEvents = LanternNight.lanternsUp || w.lunarEvent.active
          || w.lunarEvent.moonLordCountdown > 0
          || this.entities.enemies.some((e) => !((e as Enemy).dead) && (e as Enemy).vanillaId === 398);
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
        // 生日自然派对（BirthdayParty.CheckMorning→NaturalAttempt :62-143）：
        // 派对女孩在场 + 冷却 + 1/10 → 在场 ≥5 NPC 时开生日派对。
        // RNG 消费点已接：原版 StartDay 序 = BirthdayParty.CheckMorning(:64853) 先于
        // LanternNight.CheckMorning(:64854)（本仓两调用均在 DAWN 块内，掷骰走
        // Math.random，无顺序敏感）；NaturalAttempt 另置 NPC.freeCake=true(:106)——
        // 已随置位（消费端 = 派对女孩蛋糕对话 townNpcChat，入夜 StartNight 清零）
        {
          const town = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead)
            .map((n) => (n as TownNPC).npcKey);
          const ann = this.newText.bind(this);
          const msg = partyNaturalAttempt(this.partyState, {
            townNpcKeys: town,
            girlPresent: town.includes('party_girl'),
            anniversary: !!w.seedFlags?.tenthAnniversary,
            rng: Math.random,
            int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
          });
          if (msg) {
            ann(msg, 255, 0, 160);
            // BirthdayParty.cs:106：派对开张置 NPC.freeCake（全 NPC 静态位）——派对女孩
            // 首次对话赠切片蛋糕 3750（ConditionalDialogue.FreeCakeDialogue，仅注册于 208）
            this.freeCake = true;
          }
          // 成就：派对进行中（BirthdayParty.CheckForAchievement → prog 25）
          if (partyIsUp(this.partyState)) this.achievements.notifyProgressionEvent(25);
        }
        // 入侵冷却递减（Main.cs:64846-64849；1.4.5.6 无置位点，仅保留语义）
        if (w.invasionDelay > 0) w.invasionDelay--;
        // 日食自然 roll（Main.cs:64899-64920，实现在 world/Eclipse.ts dawnEclipseRoll）：
        // hardMode && downedMechBossAny && 1/20 → eclipse=true + misc[20] 公告 +
        // 两晷冷却清零（:64901-64902）+ 成就 2。原版与当日哥布林/海盗 roll 互斥
        // （同一段 if/else）——命中日食则跳过入侵 roll（stopEvents 压掉整段，
        // StartDay 头部 stopEvents → return，:64893-64898）
        if (dawnEclipseRoll(w, stopEvents, Math.random, this.eclipseHost()) === 'eclipse') {
          // 命中：else 分支（入侵 roll）不可达（Main.cs:64920 if/else 结构）
        } else if (!stopEvents) {
          // 月事件进行中则整段 return（Main.cs:64922-64926 snowMoon||pumpkinMoon||DD2）
          if (!moonEventActive(w) && !w.oldOnesArmy.ongoing) {
            // 哥布林军队自然 roll（Main.cs:64927-64936）：需砸过暗影珠/猩红之心；
            // 未击败过 1/3，已击败 hardMode 1/60 否则 1/30。
            // ★掷骰在门之前（:64929 rand.Next(3) 只要 shadowOrbSmashed 就无条件消耗）：
            // invasionType/生命上限门在 StartInvasion（:63890/:63902）内——曾把门前置
            // 导致少掷一次，RNG 与原版分叉。命中后直接 startInvasion（自带 invasionType
            // 门），不走 startInvasionAndAnnounce（其 canStartInvasion 失败 toast 是
            // 物品召唤语义，自然 roll 原版静默）
            if (w.flags.shadowOrbSmashed) {
              const p = w.flags['downedGoblins']
                ? (w.flags.hardMode ? 1 / 60 : 1 / 30) : 1 / 3;
              if (Math.random() < p && player.maxHp >= 200) this.announceNaturalInvasion(INVASION_GOBLIN);
            }
            // 海盗自然 roll（Main.cs:64938-64944 1:1）：hardMode 且砸过祭坛
            // （altarCount>0，随存档持久化）；已击败 1/60 否则 1/30。
            // 原版另有 Skyblock.lowTiles 分支（天顶空岛世界恒真），本仓库无该种子体系
            if (w.invasionType === INVASION_NONE && w.flags.hardMode && w.altarCount > 0) {
              const p = w.flags['downedPirates'] ? 1 / 60 : 1 / 30;
              if (Math.random() < p) this.announceNaturalInvasion(INVASION_PIRATE);
            }
          }
        }
      }
      if (crossed(Clock.DUSK)) {
        // 月晷快进落点（UpdateTime_StartNight :64691-64694 头部）：清 fastForwardTimeToDusk；
        // 月晷冷却 -1（:64695-64697，使用时置 8 → 8 个夜晚后归零可再用）
        if (w.fastForwardTimeToDusk) w.fastForwardTimeToDusk = false;
        if (w.moondialCooldown > 0) w.moondialCooldown--;
        // StartNight 头部其余杂项处置（:64699-64712，逐一核实）：
        // · :64699-64702 !isThereAWorldSurface → spawnMeteor=false——isThereAWorldSurface
        //   = worldSurface>50（Main.cs:2861），本仓生成器恒有地表（lanternCtx 旁
        //   hasWorldSurface 同式判 groundLevel>50），守卫永不触发 → 跳过
        // · :64703 ResetBadgerHatTime（NPC.cs:79740-79744）= EoCKilledToday/WoFKilledToday
        //   清零（同日双杀 EoC+WoF 掉 Badger's Hat 5004，NPC.cs:79800-79814；记账在
        //   Boss 逻辑块，双杀即掷）——已接
        this.eocKilledToday = false;
        this.wofKilledToday = false;
        // · :64704 NPC.freeCake=false（生日派对开时置位 BirthdayParty.cs:106，消费端 =
        //   派对女孩蛋糕对话 townNpcChat）——已接
        this.freeCake = false;
        // · :64706 setFireFlyChance（NPC.cs:94557-94610：每夜掷萤火虫/蝴蝶/椿象概率，
        //   1/9 高发夜 / 1/3 绝迹夜 / 其余 10-59）——已接（落 World 五字段随存档，
        //   消费端 VanillaSpawner 萤火虫/蝴蝶/椿象分支）
        setFireFlyChance(w);
        // · :64710 mysticLogsEvent.StartNight（MysticLogFairiesEvent.cs:34-41：夜放仙女 +
        //   全图扫倒木桩）——已接（RuntimeEvents.ts mysticLogs，UpdateTime 位在下方
        //   LanternNight.updateTime 旁）
        mysticLogs.startNight(this.fairyCtx());
        // · :64711-64712 prioritizedTownNPCType=0/checkForSpawns=0——本仓入驻走
        //   tickCount %7200 模型（上方注），无计数器可清 → 不适用
        // 夜幕：日食清除（Main.cs:64721-64725——日食全天持续，入夜即结束；
        // 实现在 world/Eclipse.ts endEclipseAtDusk，位于血月 roll 之前）；
        // 成就：挺过日食（event 3，旗在清除前求值 :64722-64724）
        endEclipseAtDusk(w, this.eclipseHost());
        // 灯笼夜入夜兑现（Main.cs:64709 = LanternNight.CheckNight → NaturalAttempt）：
        // 首胜预约 NextNightIsLanternNight 或月总已杀后的 1/14 自然 roll（冷却 5-10 夜）
        LanternNight.checkNight(this.lanternCtx());
        // 派对入夜结算（BirthdayParty.CheckNight :40-53）：进行中则结束 + 粉字广播 misc[99]
        if (partyCheckNight(this.partyState)) {
          this.newText(Lang.misc(99), 255, 0, 160);
        }
      }
      if (crossed(Clock.DUSK)) {
        // Star.NightSetup（Star.cs:41-60）：每夜重掷流星强度（10%→3-5x 流星夜）
        this.starfallBoost = nightStarfallBoost(!!w.seedFlags?.tenthAnniversary);
        this._skyMeteorShown = false;
        // 陨石入夜 roll（StartNight :64713-64716：1/50 且 downedBoss2）。
        // 审计修正 2026-08-13:原版该 roll 在 stopEvents 置位(:64717)之前——
        // 灯笼夜不压制陨石(曾加 !lanternsUp 门,偏离原版)。
        // 台账「陨石落地系统未实装」已过期:落地 1:1 已接(本文件下方
        // HandleMeteorFall 消费块 dropMeteor+陨石雨),另有 EoW/BoC 击杀置位
        // (NPC.cs:80241-80259,Boss 逻辑块)双链路
        if (Math.random() < 1 / 50 && (w.flags['downed_13'] || w.flags['downed_266'])) {
          this.meteorPending = true;
        }
      }
      // EoC 自然召唤 roll（StartNight :64732-64764）：!downedBoss1（BossesKeepSpawning
      // = getGood×dontStarve×非十周年 / 天顶 noAltars 豁免）&& statLifeMax>=200 && def>10 &&
      // 1/3（天顶 1/10）&& 城镇 NPC>=4 → spawnEye + misc[9]。
      // 入夜 roll 整段门 = !IsFastForwardingTime() && !stopEvents（:64728）——晷快进/
      // 灯笼夜/天界入侵/月总在场或倒计时全部压掉（stopEvents 须在 CheckNight 之后
      // 判读——当夜刚兑现的灯笼夜也算）
      this.spawnEyePending = false;
      this.spawnHardBossPending = 0;
      if (crossed(Clock.DUSK) && !w.isFastForwardingTime()
        && !(LanternNight.lanternsUp || w.lunarEvent.active || w.lunarEvent.moonLordCountdown > 0
          || this.entities.enemies.some((e) => !((e as Enemy).dead) && (e as Enemy).vanillaId === 398))) {
        const sf = w.seedFlags ?? {};
        const bossesKeepSpawning = !!(sf.getGoodWorld && sf.theConstant && !sf.tenthAnniversary);
        const eocEligible = !w.flags['downed_4'] || bossesKeepSpawning || !!sf.skyblock;
        const townCount = this.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead).length;
        // statLifeMax>=200（:64737）= 永久上限（baseMaxHp）；maxHp 是 statLifeMax2
        // （含生命力药水等临时加成）——挂错会被一瓶药水提前刷出 EoC
        if (eocEligible && player.baseMaxHp >= 200 && player.defense > 10
          && townCount >= 4 && Math.random() < (sf.skyblock ? 1 / 10 : 1 / 3)) {
          this.spawnEyePending = true;
          this.newText(Lang.misc(9), 50, 255, 130);
        } else if (!this.spawnEyePending && w.flags.hardMode && w.altarCount > 0
          && w.moonEvent.kind === 0 && !this.boss
          && !(w.flags['downed_134'] && w.flags['downed_125'] && w.flags['downed_127'])
          && Math.random() < 1 / 10) {
          // 机械 Boss 自然召唤 roll（:64765-64811）：1/10、无月事件、场上无 Boss、
          // 三机械未全灭 → 三选一（只选未击败；1000 次重抽语义）+ misc[28/29/30]
          // 家族键（vanilla downedMechBoss1/2/3）：n=1 毁灭者 134 / n=2 双子 125 / n=3
          // Prime 127——消费端 :4288 同映射（曾 n=1 键 125=双子 id 错位、门漏 134）
          for (let k = 0; k < 1000; k++) {
            const n = 1 + Math.floor(Math.random() * 3);
            const flag = n === 1 ? 'downed_134' : n === 2 ? 'downed_125' : 'downed_127';
            if (!w.flags[flag] || bossesKeepSpawning) {
              this.spawnHardBossPending = n;
              this.newText(Lang.misc(27 + n), 50, 255, 130);
              break;
            }
          }
        }
      }
      // 入夜事件压制（Main.cs:64728 !IsFastForwardingTime() && !stopEvents——
      // 血月/入夜 Boss 召唤等 roll 整段跳过；灯笼夜/天界入侵/月总在场或倒计时同压；
      // 须在 CheckNight 之后判读——当夜刚兑现也算）
      if (crossed(Clock.DUSK)
        && !w.isFastForwardingTime()
        && !(LanternNight.lanternsUp || w.lunarEvent.active || w.lunarEvent.moonLordCountdown > 0
          || this.entities.enemies.some((e) => !((e as Enemy).dead) && (e as Enemy).vanillaId === 398))
        && !this.spawnEyePending // 血月与 EoC 同夜互斥（:64818 !WorldGen.spawnEye 门）
        && !w.clock.bloodMoon && w.clock.moonPhase !== 4
        && w.moonEvent.kind === 0      // 月事件进行中不 roll 血月（Main.cs:64300-64306 压制）
        && player.maxHp > 120 && Math.random() < 1 / (w.seedFlags?.tenthAnniversary ? 6 : 9)) {
        // 黄昏血月 roll（Main.cs:64813-64831：1/9（十周年种子 1/6 :64815-64817），
        // 新月不行，需生命上限>120；spawnEye 门（:64818）见入夜 EoC roll——同夜命中则本 roll 整体跳过）
        w.clock.bloodMoon = true;
        // 血月清两晷冷却（:64892-64893）：血月夜过后日晷/月晷立即可再用
        w.sundialCooldown = 0;
        w.moondialCooldown = 0;
        this.newText(Lang.misc(8), 50, 255, 130);
      }
      // 旅程 SkipToTime 收尾（上方相位翻转触发完整 StartDay/StartNight 链后落最终时刻）
      if (this.pendingTimeSkip != null) {
        w.clock.timeOfDay = this.pendingTimeSkip;
        this._lastClockT = this.pendingTimeSkip;
        this.pendingTimeSkip = null;
      }
    }
    // ---- 夜间坠星（SpawnFallingObjects :71861-71898：每 tick 概率
    //      p = 10×(w/4200)×boost/8000 = w×boost/3,360,000；运气定向 RollLuck(15)==0
    //      → 玩家±640px——单机用 luck 字段近似）----
    if (!w.clock.isDay && this.starfallBoost > 0) {
      const p = (w.store.w * this.starfallBoost) / 3360000;
      if (Math.random() < p) {
        const st = w.store;
        let sx = (Math.floor(Math.random() * (st.w - 50)) + 100) * TILE;
        const sy = Math.floor(Math.random() * Math.floor(st.h * 0.05)) * TILE;
        // 运气定向（玩家在地表以上 + 幸运命中）
        const homing = !player.dead && player.y < w.groundLevel * TILE && Math.random() < Math.max(0, player.luck) * 0.0667;
        if (homing) sx = player.cx + Math.floor(Math.random() * 1281) - 640;
        if (FallingStar.canSpawnAt(st, sx, sy)) {
          let vx = Math.floor(Math.random() * 201) - 100;
          let vy = Math.floor(Math.random() * 200) + 100;
          const k = 12 / Math.hypot(vx, vy);
          vx *= k; vy *= k;
          this.entities.add(new FallingStar(sx, sy, vx, vy, 180, homing, true), 'projectiles');
        }
      }
      // 流星夜（boost>3）附魔夜行者 484（NPC.cs:2316-2319：云≤55 无云背景 RollLuck(2)==0）
      if (this.starfallBoost > 3 && Math.random() < 0.5 && !player.dead
        && player.y < w.groundLevel * TILE) {
        const e = Enemy.fromVanilla(484, player.cx + (Math.random() - 0.5) * 800, player.y - 200);
        if (e) this.entities.add(e, 'enemies');
      }
    }
    // ---- 陨石坠落消费（HandleMeteorFall :64948-64981：原始 Main.time>16200 即消费
    //      ——夜=午夜后 / 昼=上午 9 点后均可落,白天杀 EoW 当天落是原版行为）----
    if (this.meteorPending) {
      const tod = w.clock.timeOfDay;
      const rawTime = w.clock.isDay
        ? (tod - Clock.DAWN) / (Clock.DUSK - Clock.DAWN) * 54000      // 昼 0-54000
        : (((tod - Clock.DUSK) % 1 + 1) % 1) / (1 - (Clock.DUSK - Clock.DAWN)) * 32400; // 夜 0-32400
      // 天幕流星(HandleMeteorFall :64952-64967:夜 time<15000 置 _canShowMeteorFall,
      // 过 15000 线恰 ForceEntitySpawn 一颗 SkyEntity.Meteor——16200 落地前的窗口前奏;
      // 仅夜间窗口有效,白天无天幕流星)
      if (!w.clock.isDay && rawTime > 15000 && !this._skyMeteorShown) {
        this._skyMeteorShown = true;
        this.renderer?.sky?.spawnSkyMeteor(player.cx, player.cy, w.groundLevel * 16);
      }
      if (rawTime > 16200) {
        this.meteorPending = false;
        const st = w.store;
        const host: MeteorHost = {
          w: st.w, h: st.h, spawnX: w.spawnX,
          groundLevel: w.groundLevel, rockLevel: w.rockLevel, store: st,
          players: player.dead ? [] : [{ x: player.x, y: player.y, w: player.w, h: player.h }],
          npcs: [
            ...this.entities.enemies.filter((e) => !e.dead).map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h })),
            ...this.entities.npcs.filter((n) => !n.dead).map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
          ],  // 原版 Main.npc 全量（敌怪+城镇）
          rand: Math.random,
          int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
          announce: () => this.newText(Lang.gen(59), 50, 255, 130),
        };
        const landed = dropMeteor(host);
        if (landed) {
          // 陨石全走 setTileSilent（不触发 onTileChanged）——手动失效落点 chunk
          this.chunks.markDirtyArea(landed.i - 40, landed.j - 40, landed.i + 40, landed.j + 40);
          this.lighting.dirty = true;   // 审计补缺:crater 全走 silent,光照不标脏则夜落陨石黑块
        } else if (Math.random() < 1 / 3) {
          // 陨石雨（StartMeteorShower :6189-6194：计数=[650,751)×4 持续整夜,
          // 由下方每 tick 消费块掷 1078 伤害碎块——审计修正 2026-08-13:曾为
          // 一次性 8×坠星 burst,且 FallingStar 落地掉 vi_75(流星雨=免费星农场,
          // 偏离原版灾害语义;原版 1078 撞地无掉落))
          w.meteorShowerCount = (650 + Math.floor(Math.random() * 101)) * 4;
          this.newText(Lang.gen(92), 50, 255, 130);
        }
      }
    }
    // ---- 流星雨消费（WorldGen.UpdateWorld :71771-71810,每 tick）----
    if (w.meteorShowerCount > 0) {
      const st = w.store;   // 本块作用域（上方 3179 的 st 在陨石落点块内）
      // 晷快进清零(:71774-71777)
      if (w.isFastForwardingTime()) w.meteorShowerCount = 0;
      else if (Math.random() < 1 / 4) {
        // 出生:随机 x[100,w-50)×16、y<5%h×16;1/2 概率改玩家 ±2400px(clamp 800..)
        const cst = w.store;
        let sx = (100 + Math.floor(Math.random() * (cst.w - 50))) * TILE;
        const sy = Math.floor(Math.random() * Math.floor(cst.h * 0.05)) * TILE;
        if (!player.dead && Math.random() < 0.5) {
          sx = Math.round(player.cx + (Math.floor(Math.random() * 4801) - 2400));
          sx = Math.max(800, Math.min((cst.w - 50) * TILE, sx));
        }
        if (FallingStar.canSpawnAt(cst, sx, sy)) {
          w.meteorShowerCount--;   // !SolidCollision 才计数(:71803 在 spawn 后递减)
          const vx0 = Math.floor(Math.random() * 201) - 100;
          const vy0 = 100 + Math.floor(Math.random() * 200);
          const k0 = 12 / Math.hypot(vx0, vy0);
          this.entities.add(new MeteorChunk(sx, sy, vx0 * k0, vy0 * k0), 'projectiles');
        }
      }
    }
    // ---- 高尔夫状态推进（GolfState.Update :111-134：计时每帧+1 封顶 3600 + 跟踪维护）----
    {
      const heldKey = ITEM_DEFS[this.player.inv.heldItem()?.id ?? -1]?.key ?? '';
      const hm = /^vi_(\d+)_/.exec(heldKey);
      const hv = hm ? +hm[1] : 0;
      // IsAGolfingItem（Item.cs:47566-47577）：球族物品或球杆族（4039/4092-4095/4587-4598）
      const golfing = hv === 3989 || (hv >= 4092 && hv <= 4095) || hv === 4039
        || (hv >= 4242 && hv <= 4253) || (hv >= 4587 && hv <= 4598);
      this.golfState.update(golfing, false);   // 3611 高尔夫球车坐骑未实装（等价边界）
    }
    // ---- 自然 Boss 夜间生成（UpdateTime :64542-64621：整段门 !IsFastForwardingTime() &&
    //      !stopEvents；夜间 time>4860 后每 tick；玩家条件 = active && !dead &&
    //      y<worldSurface*16(或出生点在地下) && 4500px 内无月总(CanSpawnEnemiesNear :255)；
    //      EoC 命中即清旗，机械一次性）----
    const nightTicksNow = !w.clock.isDay
      ? (((w.clock.timeOfDay - Clock.DUSK) % 1 + 1) % 1) / (1 - (Clock.DUSK - Clock.DAWN)) * 32400 : 0;
    const nightTicksPrev = this._lastNightTicks;
    this._lastNightTicks = nightTicksNow;
    if (!w.clock.isDay && !player.dead && !w.isFastForwardingTime()
      && !(LanternNight.lanternsUp || w.lunarEvent.active || w.lunarEvent.moonLordCountdown > 0
        || this.entities.enemies.some((e) => !((e as Enemy).dead) && (e as Enemy).vanillaId === 398))) {
      const nightTicks = nightTicksNow;
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
          // 自然生成无声（Main.cs:64550 SpawnOnPlayer 直调，无 PlaySound）——只公告
          this.summonBossAtTx('eye_of_cthulhu', offTx, false);
        } else if (this.spawnHardBossPending > 0) {
          const n = this.spawnHardBossPending;
          this.spawnHardBossPending = 0; // 一次性机会：无论成败清零（:64596）
          if (!this.boss) {
            // Mechdusa 世界（SpecialSeedFeatures.Mechdusa,Main.cs:64575-64577）：
            // 机械 Boss 自然 roll 一律改召合体（SpawnMechQueen 走玩家位召唤链）
            const sf = this.world.seedFlags ?? {};
            const mechdusaWorld = (!!sf.remix && !!sf.getGoodWorld) || !!sf.everything;
            if (mechdusaWorld) {
              this.summonMechdusa();
            } else {
              // 机械自然生成同无声（Main.cs:64580-64594；Roar 只在物品 :43146 等）
              this.summonBossAtTx(n === 1 ? 'destroyer' : n === 2 ? 'twins' : 'skeletron_prime', offTx, false);
            }
          }
        }
      }
      // ---- 鹿角怪雨天自然生成（Main.cs:64598-64614）：夜间时间越过 16200t（=午夜）的
      //      当 tick + 正在下雨 + (!downedDeerclops || 1/4) → 玩家满足条件即 SpawnOnPlayer(668)。
      //      玩家门 = !dead && y<worldSurface*16 && ZoneSnow && 附近无城镇 NPC(townNPCs<=0) &&
      //      (maxHp>=200 || defense>=9) && CanSpawnEnemiesNear && !AnyDanger()
      //      （AnyDanger :81040 = 月总倒计时>0 ∪ 入侵 ∪ 月事件 ∪ DD2 ∪ 场上有 Boss）----
      if (nightTicksPrev < 16200 && nightTicks >= 16200 && w.weather.raining
        && (!w.flags['downed_668'] || Math.random() < 1 / 4)
        && player.y < w.groundLevel * TILE && this.scene?.zoneSnow
        && !this.entities.npcs.some((n) => {
          const tn = n as TownNPC;
          return tn instanceof TownNPC && !tn.dead
            && Math.abs(tn.cx - player.cx) < 85 * TILE && Math.abs(tn.cy - player.cy) < 60 * TILE;
        })
        && (player.maxHp >= 200 || player.defense >= 9)
        && !nearMoonLord
        && !(w.lunarEvent.moonLordCountdown > 0 || w.invasionType > 0 || moonEventActive(w)
          || w.oldOnesArmy.ongoing || this.boss)) {
        this.spawnDeerclopsOnPlayer();
      }
    }
    // ---- 税务员税款累积（Main.cs:64462-64470：taxTimer += dayRate，每 3600 tick
    //      (游戏 1 小时) +50 铜 × 已入住城镇 NPC 数，上限 25 金(250000 铜)；
    //      Player.CollectTaxes :23854） ----
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === 'tax_collector')) {
      this.player.taxTimer += w.dayRate();
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
        // 成就：入侵胜利 progression event（Main.cs:63786-63800：
        // goblin 10 / pirate 11 / snow legion 12 / martian 13）
        this.achievements.notifyProgressionEvent(
          inv.won === INVASION_GOBLIN ? 10 : inv.won === INVASION_PIRATE ? 11
            : inv.won === INVASION_SNOW_LEGION ? 12 : 13);
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
    // Main.screenPosition/screenWidth/Height 快照（视区左上角世界坐标 + 画布尺寸）——
    // gore 屏幕坐标档（肉山死亡尘幕 NPC.cs:88307-88327）的求值源，实体 tick 前注入
    setGoreScreen(
      this.camera.x - this.camera.viewW / (2 * this.camera.zoom),
      this.camera.y - this.camera.viewH / (2 * this.camera.zoom),
      this.camera.viewW, this.camera.viewH);
    this.chunks.flushDirty();
    // 动画陈设换帧重烘(制冰机/固化机/篝火/熔炉/火把等)。★双门(2026-08-14
    // trace②:站定+暂停仍解码风暴):①暂停冻结(原版单机暂停世界全冻结);
    // ②只重烘视野内 chunk(屏外动画白烘=持续 drawImage 大表慢性驱逐解码缓存)。
    // 屏外 chunk 回到视野时由渲染 get 惰性重烘,动画自然追上
    if (!this.paused) {
      const cam = this.camera;
      const hw = cam.viewW / 2 / cam.zoom + 2 * CHUNK * TILE, hh = cam.viewH / 2 / cam.zoom + 2 * CHUNK * TILE;
      this.chunks.animView = { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
      this.chunks.advanceAnim();
      // 烘焙吞吐日志(每 60 帧汇总):dirty 队列/最近烘焙耗时/画布规模
      if (this.renderLoadLog && this.tickCount % 60 === 0) {
        const cc = this.chunks;
        if (cc.dirtyQueue.length > 4 || cc.lastFlushMs > 2) {  // 1-2=视野内动画 chunk 正常轮转,不刷屏
          console.log(`[rbake] t=${this.tickCount} dirty=${cc.dirtyQueue.length}/${cc.chunks.size} lastFlush=${cc.lastFlushMs.toFixed(1)}ms×${cc.lastFlushCount} arrive=${cc.arriveInvalidateChunks}`);
        }
      }
    }
    tickEmotes();
    this.tickNpcEmotes();
    this.tickInfoAccs();
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
    // 墓地环境云雾（AmbientWindSystem.Update：ZoneGraveyard 门 + 玩家中心 120×30 工作区）
    natureParticles.updateAmbientWind(!!this.scene?.zoneGraveyard, windSway.wind, player.cx, player.cy);
    this.lighting.ensureRegion(player.cx, player.cy, viewTW, viewTH);
    // 光衰减每帧覆盖（LightingEngine.UpdateLightDecay :137-187）：群系水色 RGB 衰减表
    // + 夜枭 nightVision（air/solid ×1.03）——水下/洞穴视野随药水与群系变化
    updateLightDecay(this.renderer.waterStyle, player.buffs.has(BuffType.NightOwl),
      this.blackout || player.buffs.has(BuffType.Blackout),   // buff 80 双源（:190-194）
      player.buffs.has(BuffType.Darkness));                   // buff 22 blind（:185-189 + GlobalBrightness 1.0）
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
      const gvid = viIdFromKey(heldDef.key);
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
    const heldVid0 = heldDef ? viIdFromKey(heldDef.key) : -1;
    if (!heldRGB && heldDef && WATER_TORCH_ITEMS.has(heldVid0)) {
      const BIOME_TORCH_ITEM2: Record<number, number> = {
        523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
        4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
      };
      const t = BIOME_TORCH_ITEM2[heldVid0];
      const c = t !== undefined ? TORCH_LIGHT[t] : undefined;
      heldRGB = c ? [...c] as [number, number, number] : [1, 0.95, 0.8];
    }
    // 手持常亮三件套（Player.cs ItemCheck 点光段，num=1 恒定）：
    //   148 水蜡烛 (0,0.5,1)（:49179-49214，仅 !pulley 门——水下手持也亮）；
    //   5322 (0.2,0.3,0.32)（:49274-49285，!wet && !pulley）；
    //   4952 (1,0.7,0.8)×1.3（:49430-49435，!pulley && !petting——无 wet 门）
    //   （pulley=滑轨乘坐本仓未跟踪，petting 同；dust 172/萤火纯装饰从略）
    if (!heldRGB && heldDef) {
      const hv = viIdFromKey(heldDef.key);
      if (hv === 148) heldRGB = [0, 0.5, 1];
      else if (hv === 5322 && !player.inWater) heldRGB = [0.2, 0.3, 0.32];
      else if (hv === 4952) heldRGB = [1.3, 0.91, 1.04];
    }
    if (!heldRGB && heldDef && !player.inWater) {
      const vid = viIdFromKey(heldDef.key);
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
            // 三个动态火把档 = TorchID 同名 ITorchLightProvider 精确公式（TorchID.cs:
            //  DemonTorchLight :45-51 / DiscoTorchLight :66-72 / ShimmerTorchLight :28-42），
            // 与 TileLightScanner 火把 style 7/14/23 同源——曾为静态近似/六色跳变
            else if (torchId === 7) heldRGB = this.lighting.clock.demonTorchColor();
            else if (torchId === 14) heldRGB = this.lighting.clock.discoColor();
            else if (torchId === 23) heldRGB = this.lighting.clock.shimmerTorchColor();
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
    // 弹幕动态点光 = Projectile.ProjLight() 1:1 全函数逐 case 转写（cs:14809-15309）。
    // 语义：final = light(SetDefaults) × 乘区表（缺省 [1,1,1]）；个别通道被原版
    // 【绝对赋值】（num=0.3f / num3=1f 等）——PROJ_LIGHT_ABS_CHAN 非 null 通道直接
    // 取常量（忽略 light）。动态档专属分支先于表查询：
    //   79/1089  Disco 绝对（num=Disco/255 覆写，:278-283/:349-354）
    //   251      light × (Disco+1)/2（:469-480 先白化再乘回 light）
    //   993      light × Disco（switch 段 :42-46，乘区非绝对）
    //   867/1000 闪烁公式绝对（num4=Next(28,42)×0.005+(270-mouseTextColor)/500，:63-78）
    //   209      ×(0.3,0.4,1.75) 再乘 fade=(255-alpha)/255（:453-462）
    //   211      ×(0.5,0.9,1)；light 帧后自改写（首帧 1.0→次帧 1.5→其后 1.0，:439-452）
    //   259      B×0.1；getGoodWorld 全零（:84-93）
    //   870      ×(0.9, G=0.35 绝对, 1) + FloodFillTile 4.5 穿墙扩散（:487-495）
    // （第二路审计曾仅 5 条乘区致 91 型发光弹白光；后续全表批又漏了绝对通道/动态档
    //  ——44 族 B=1 绝对、251 白化公式、209 alpha 渐变均被当纯乘区）
    const PROJ_LIGHT_MUL: Record<number, [number, number, number]> = {
      // switch 段（:12-46，仅 987-993；993 动态不在此表）
      987: [0.6, 0.5, 0.1], 988: [0.8, 0.35, 0], 989: [0, 0.65, 0],
      990: [0, 0.35, 0.7], 991: [0.9, 0, 0.5], 992: [0.75, 0, 0.75],
      // if-else 链（:48-486；含绝对通道的类型乘区照抄、绝对值见 ABS_CHAN）
      446: [0, 1, 0.8], 493: [1, 0.3, 1], 494: [1, 0.3, 1], 876: [0.1, 0.7, 1],
      // 867/1000 动态绝对；332/259：
      332: [1, 0.6, 0.1], // 259 动态（getGoodWorld 零化）不在此表
      329: [1, 0.9, 0.1], 2: [1, 0.75, 0.55], 82: [1, 0.75, 0.55],
      172: [0.35, 0.55, 1], 308: [0.1, 0.7, 1], 304: [1, 0.2, 0.1], 263: [0.1, 0.7, 1],
      274: [0.7, 0.1, 1], 254: [0.1, 1, 1], 94: [0.5, 0, 1],
      95: [0.35, 1, 0], 96: [0.35, 1, 0], 103: [0.35, 1, 0], 104: [0.35, 1, 0],
      4: [0.5, 0.1, 1], 257: [0.1, 0.9, 1], 9: [1, 0.1, 0.6],
      // 488 全绝对（ABS_CHAN）；92/93：
      92: [0.8, 0.6, 1], 93: [1, 1, 0.01],
      12: [0.9, 0.8, 0.1], 955: [0.9, 0.8, 0.1],
      14: [1, 0.7, 0.1], 110: [1, 0.7, 0.1], 180: [1, 0.7, 0.1], 242: [1, 0.7, 0.1],
      302: [1, 0.7, 0.1], 981: [1, 0.7, 0.7],
      15: [1, 0.4, 0.1], 16: [0.1, 0.4, 1], 27: [0, 0.3, 1], 36: [1, 0.2, 0.6],
      18: [0.6, 0.1, 1], 19: [1, 0.5, 0.1], 20: [0.1, 1, 0.3], 22: [0, 0, 1],
      34: [1, 0.1, 0.1], 41: [1, 0.8, 0.6], 44: [0.6, 0.1, 1], 45: [0.6, 0.1, 1],
      50: [0.7, 1, 0.8], 515: [1, 0.6, 0.85], 53: [0.7, 0.8, 1], 473: [1.05, 0.95, 0.55],
      72: [0.45, 0.75, 1], 73: [0.4, 0.6, 1], 74: [1, 0.4, 0.6],
      76: [1, 0.3, 0.6], 77: [1, 0.3, 0.6], 78: [1, 0.3, 0.6], 80: [0, 0.8, 1],
      83: [0.7, 0, 1], 88: [0.7, 0, 1], 84: [0.8, 0, 0.5], 389: [0.8, 0, 0.5],
      89: [0.05, 0.2, 1], 90: [0.05, 0.2, 1], 86: [1, 0.45, 1], 87: [0.45, 1, 0.75],
      100: [1, 0.5, 0], 106: [0, 0.5, 1], 113: [0.25, 0.75, 1], 114: [0.5, 0.05, 1],
      115: [0.5, 0.05, 1], 116: [1, 1, 0.25], 131: [0.1, 0.4, 1], 132: [0.2, 1, 0.6],
      157: [0.2, 1, 0.6], 156: [1, 0, 0.6], 173: [0.3, 1, 1], 207: [0.4, 1, 0.4],
      253: [0, 0.4, 1], 226: [0.25, 1, 0.5], 221: [0.25, 1, 0.5], 229: [0.25, 1, 0.5],
      278: [1, 1, 0], 279: [1, 1, 0], 283: [0.8, 0.1, 1], 284: [1, 0.1, 0.8],
      285: [0.1, 0.5, 1], 286: [1, 0.5, 0.1], 287: [0.9, 1, 0.4],
      // 211/209/870 动态分支见下（870 乘区 [0.9,1,1]+G 绝对 0.35）
    };
    // 绝对通道表（原版对该通道【赋常量】而非乘 light——num=0.8f / num3=1f 等）：
    // 非 null 通道 final = 常量；其余通道仍走乘区表
    const PROJ_LIGHT_ABS_CHAN: Record<number, [number | null, number | null, number | null]> = {
      15: [1, null, null],              // R 绝对 1（:192-197）
      16: [null, null, 1],              // B 绝对 1（:198-203）
      27: [null, null, 1],              // B 绝对 1（:224-229）
      36: [0.8, null, null],            // R 绝对 0.8（:235-240）
      44: [null, null, 1], 45: [null, null, 1],  // B 绝对 1（:246-251）
      488: [0.3, 0, 0.25],              // 全绝对（:159-164）
      72: [null, null, 1],              // B 绝对 1（:284-289）
      86: [null, null, 0.75],           // B 绝对 0.75（:290-295）
      87: [null, 1, null],              // G 绝对 1（:296-301）
      173: [null, 0.4, null],           // G 绝对 0.4（:423-428）
      // 156 G=0 / 253 R=0 / 22 R=G=0 与乘 0 等价，不列入
    };
    for (const p of this.entities.projectiles) {
      const pe = p as unknown as {
        projId?: number; x: number; y: number; w: number; h: number;
        alpha?: number; age?: number; lightRGB?: unknown;
      };
      const pid = pe.projId;
      if (pid == null) continue;
      // 实体自报点光（AI 侧 AddLight——985 泰拉刃 :39382 / 502 喵刀 :22611-22621）：
      // 由实体光通道结算，此处跳过防双重注入
      if (pe.lightRGB) continue;
      const l = projectileData(pid)?.light;
      if (!l || l <= 0) continue;
      const tx = Math.floor((pe.x + pe.w / 2) / TILE), ty = Math.floor((pe.y + pe.h / 2) / TILE);
      let lr: number, lg: number, lb: number;
      const clock = this.lighting.clock;
      if (pid === 79 || pid === 1089) {
        // Disco 绝对（覆写 num=Disco/255，light 不参与）
        [lr, lg, lb] = clock.discoColor();
      } else if (pid === 251) {
        const d = clock.discoColor();
        lr = (l * (d[0] + 1)) / 2; lg = (l * (d[1] + 1)) / 2; lb = (l * (d[2] + 1)) / 2;
      } else if (pid === 993) {
        const d = clock.discoColor();
        lr = l * d[0]; lg = l * d[1]; lb = l * d[2];
      } else if (pid === 867 || pid === 1000) {
        const n4 = (Math.random() * 14 + 28) * 0.005 + (270 - clock.mouseTextColor) / 500;
        if (pid === 867) { lr = 0.1; lg = 0.3 + n4 / 2; lb = 0.6 + n4; }
        else { lr = 0.3 + n4 * 0.25; lg = 0.35 + n4 * 0.75; lb = 0.5 + n4; }
      } else if (pid === 209) {
        const fade = (255 - (pe.alpha ?? 255)) / 255;
        lr = l * 0.3 * fade; lg = l * 0.4 * fade; lb = l * 1.75 * fade;
      } else if (pid === 211) {
        // light 帧序（:439-452）：帧1 用 SetDefaults 1.0，帧2 用改写后的 1.5，帧3+ 用 1.0
        const l211 = pe.age === 2 ? 1.5 : 1;
        lr = l211 * 0.5; lg = l211 * 0.9; lb = l211;
      } else if (pid === 259) {
        if (this.world.seedFlags?.getGoodWorld) continue;   // FTW 世界不发光（:87-92）
        lr = l; lg = l; lb = l * 0.1;
      } else if (pid === 870) {
        lr = l * 0.9; lg = 0.35; lb = l;   // G 绝对 0.35（:262-266）
        this.addProjFloodLight(tx, ty, lr, lg, lb);
        continue;
      } else {
        const m = PROJ_LIGHT_MUL[pid] ?? [1, 1, 1];
        const a = PROJ_LIGHT_ABS_CHAN[pid];
        lr = a?.[0] != null ? a[0] : l * m[0];
        lg = a?.[1] != null ? a[1] : l * m[1];
        lb = a?.[2] != null ? a[2] : l * m[2];
      }
      this.lighting.addLight(tx, ty, lr, lg, lb);
    }
    // 掉落物点光（WorldItem.UpdateItem_VisualEffects :1286-1505 全分支 1:1）：
    // 亮晶簇/矿族 ×jitter、四柱魂 ×essScale（本仓未跟踪 essScale，取 1 近似——登记）、
    // 彩凝胶 1970-1976 / 凝胶块 2677-2689、蜡烛 105 !wet、火把族 TorchColor(placeStyle)
    // （!wet||水火把门）、荧光棒族无 wet 门控
    for (const dent of this.entities.drops) {
      const d = dent as ItemDrop;
      const def = ITEM_DEFS[d.itemId];
      if (!def) continue;
      const tx = Math.floor((d.x + d.w / 2) / TILE), ty = Math.floor((d.y + d.h / 2) / TILE);
      const dst = this.world.store;
      if (!dst.inBounds(tx, ty)) continue;
      const wet = dst.liquid[dst.idx(tx, ty)] > 100;
      const vid = viIdFromKey(def.key);
      // jitter = Main.rand.Next(a,b) × 0.01（:1288 Next(90,111) 系 / :1294 Next(95,106) 陨石）
      const jit = (a: number, b: number) => (Math.floor(Math.random() * (b - a)) + a) * 0.01;
      const lit = (r: number, g: number, b: number) => this.lighting.addLight(tx, ty, r, g, b);
      if (vid === 5043) { const n = jit(90, 111); lit(0.25 * n, 0.25 * n, 0.25 * n); continue; }
      if (vid === 116) { const n = jit(95, 106); lit(0.56 * n, 0.43 * n, 0.15 * n); continue; }
      if (vid === 3191) { const n = jit(90, 111); lit(0.3 * n, 0.1 * n, 0.25 * n); continue; }
      if (vid === 520 || vid === 3454) { const n = jit(90, 111); lit(0.5 * n, 0.1 * n, 0.25 * n); continue; }
      if (vid === 521 || vid === 3455) { const n = jit(90, 111); lit(0.25 * n, 0.1 * n, 0.5 * n); continue; }
      if (vid === 547 || vid === 3453) { const n = jit(90, 111); lit(0.5 * n, 0.3 * n, 0.05 * n); continue; }
      if (vid === 548) { const n = jit(90, 111); lit(0.1 * n, 0.1 * n, 0.6 * n); continue; }
      if (vid === 575) { const n = jit(90, 111); lit(0.1 * n, 0.3 * n, 0.5 * n); continue; }
      if (vid === 549) { const n = jit(90, 111); lit(0.1 * n, 0.5 * n, 0.2 * n); continue; }
      if (vid === 58 || vid === 1734 || vid === 1867) { const n = jit(90, 111); lit(0.5 * n, 0.1 * n, 0.1 * n); continue; }
      if (vid === 184 || vid === 1735 || vid === 1868 || vid === 4143) { const n = jit(90, 111); lit(0.1 * n, 0.1 * n, 0.5 * n); continue; }
      if (vid === 522) { const n = jit(90, 111); lit(0.5 * n, 1 * n, 0.1 * n); continue; }
      if (vid === 1332) { const n = jit(90, 111); lit(1 * n, 1 * n, 0.1 * n); continue; }
      // 四柱魂（:1372-1386 ×Main.essScale 三角波 0.7-1.0——FlickerClock.essScale 同构）
      {
        const ess = this.lighting.clock.essScale;
        if (vid === 3456) { lit(0.2 * ess, 0.4 * ess, 0.5 * ess); continue; }
        if (vid === 3457) { lit(0.4 * ess, 0.2 * ess, 0.5 * ess); continue; }
        if (vid === 3458) { lit(0.5 * ess, 0.4 * ess, 0.2 * ess); continue; }
        if (vid === 3459) { lit(0.2 * ess, 0.2 * ess, 0.5 * ess); continue; }
      }
      if (vid === 3822) { lit(0.1, 0.3, 0.1); continue; }
      // 彩凝胶（:1970-1976 段）与凝胶块（:2679-2677 段）
      if (vid === 1970) { lit(0.75, 0, 0.75); continue; }
      if (vid === 1971) { lit(0.75, 0.75, 0); continue; }
      if (vid === 1972) { lit(0, 0, 0.75); continue; }
      if (vid === 1973) { lit(0, 0.75, 0); continue; }
      if (vid === 1974) { lit(0.75, 0, 0); continue; }
      if (vid === 1975) { lit(0.75, 0.75, 0.75); continue; }
      if (vid === 1976) { lit(0.75, 0.375, 0); continue; }
      if (vid === 2677) { lit(0.6, 0.375, 0); continue; }
      if (vid === 2679) { lit(0.6, 0, 0.6); continue; }
      if (vid === 2681) { lit(0.6, 0.6, 0.6); continue; }
      if (vid === 2683) { lit(0, 0.6, 0); continue; }
      if (vid === 2685) { lit(0.6, 0, 0); continue; }
      if (vid === 2687) { lit(0, 0, 0.6); continue; }
      if (vid === 2689) { lit(0.6, 0.6, 0); continue; }
      if (vid === 2701) { lit(0.7, 0.65, 0.55); continue; }
      if (def.tile === 'candle') {
        if (!wet) lit(1, 0.95, 0.8);   // 105 !wet（:1455-1461）
        continue;
      }
      if (def.tile === 'torch') {
        // createTile==4 → TorchColor(placeStyle)（:1467-1472）；门 = (!wet&&Torches)||WaterTorches
        const WATER_TORCH = new Set([523, 1333, 4384]);
        if (wet && !WATER_TORCH.has(vid)) continue;
        const BIOME_TORCH_ITEM: Record<number, number> = {
          523: 8, 974: 9, 1245: 10, 1333: 11, 2274: 12, 3004: 13, 3045: 14, 3114: 15,
          4383: 16, 4384: 17, 4385: 18, 4386: 19, 4387: 20, 4388: 21, 5293: 22, 5353: 23,
        };
        const torchId = vid >= 427 && vid <= 433 ? vid - 426 : BIOME_TORCH_ITEM[vid] ?? 0;
        let c: [number, number, number] | undefined;
        if (torchId === 7) c = this.lighting.clock.demonTorchColor();
        else if (torchId === 14) c = this.lighting.clock.discoColor();
        else if (torchId === 23) c = this.lighting.clock.shimmerTorchColor();
        else c = TORCH_LIGHT[torchId];
        if (c) lit(c[0], c[1], c[2]);
        continue;
      }
      // 荧光棒族（无 wet 门控）与坠落之星/陨石锭（:1715-1719）
      if (vid === 282) { lit(0.7, 1, 0.8); continue; }
      if (vid === 286) { lit(0.7, 0.8, 1); continue; }
      if (vid === 3002) { lit(1.05, 0.95, 0.55); continue; }
      if (vid === 75) { lit(0.8, 0.7, 0.1); continue; }
      if (vid === 183) { lit(0.15, 0.45, 0.9); continue; }
    }
    // 实体点光（原版 Lighting.AddLight 的 NPC 侧调用）：AI 每 tick 写 lightRGB——
    // 萤火虫族闪烁（NPC.cs:34395-34407，昼地表不亮）、发光蜗牛/熔岩蜗牛恒定（:34623-34630）、
    // 魔化夜 crawler 抖动（:34492）；敌怪/小动物/弹幕三桶 + 掉落物（微光化物品上浮
    // 白光 WorldItem.cs:511 (1-shimmerTime)*0.8 渐亮，ItemDrop.lightRGB getter）
    for (const bucket of [this.entities.enemies, this.entities.critters, this.entities.projectiles, this.entities.drops, this.entities.npcs]) {
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
    // gore 16/17 火苗点光（Gore.Update 尾段 :1078-1101：light>0 时以中心格 AddLight
    // light*scale，16 号通道 (1,0.8,0.3)、17 号 (0.3,0.6,1)——衰减通道在 GorePiece 内算好）
    for (const gp of liveGorePieces()) {
      const l = gp.lightRGB();
      if (l && this.world.store.inBounds(l.tx, l.ty)) this.lighting.addLight(l.tx, l.ty, l.r, l.g, l.b);
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
          this.sfx.playWav('zombie', 1, e.cx, e.cy);
          break;
        }
      }
    }
    // 火把火苗：视内点燃火把随机飘出火星（火点在格顶上方 20px 精灵的火焰处）
    this.emitTorchSparks();
    this.emitTileParticles();
    // 地形碰撞：目标位置实心则反弹（冲击大）或停驻地表（冲击小，重力归零缓慢淡出）
    // st/solidAt 提循环外(此前每粒子重建闭包,数百粒子/帧的分配税)
    const st = this.world.store;
    const solidAt = (x: number, y: number) => {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    for (const p of this.particles) {
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; } // 空气阻力：喷溅后缓慢减速飘散
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
    // 飘字更新 1:1（CombatText.Update:131-206）。label 类（物品名）走旧轨迹;
    // 数字类:alpha 0.6~1 闪烁 → 速度演化（dot 加重力,暴击双重衰减）→ 寿命内
    // scale 生长（原版 Update :163-165 dot 与普通同链 +0.1×TargetScale 无封顶——
    //  旧 0.5/t+0.8 封顶是 monospace 时代自造近似,位图字体对齐时一并归位）→
    //  寿命归零后 scale 收缩至 0.1 才消亡（暴击每 t 先 +0.07 补偿=净 -0.03,收尾更久,且 alphaDir=-1 淡出）
    let wn = 0;
    for (const d of this.dmgNumbers) {
      if (d.label) {
        d.life--;
        d.y += d.vy;
        d.vy *= 0.94;
        if (d.life > 0) this.dmgNumbers[wn++] = d;
        continue;
      }
      d.alpha = (d.alpha ?? 1) + (d.alphaDir ?? -1) * 0.05;
      if (d.alpha <= 0.6) d.alphaDir = 1;
      if (d.alpha >= 1) { d.alpha = 1; d.alphaDir = -1; }
      if (d.dot) d.vy += 0.15;
      else { d.vy *= 0.92; if (d.crit) d.vy *= 0.92; }
      d.vx = (d.vx ?? 0) * 0.93;
      d.x += d.vx;
      d.y += d.vy;
      // 原版先 lifeTime-- 再判 ≤0（:162-163）:寿命 1→0 那一 tick 即进收缩期
      d.life--;
      if (d.life > 0) {
        if (d.crit) d.rotation = (d.rotation ?? 0) + (d.vx < 0 ? 0.001 : -0.001);
        if (d.dot) d.scale = Math.min(1, (d.scale ?? 0) + 0.1);
        else d.scale = Math.min(1, (d.scale ?? 0) + 0.1);
        this.dmgNumbers[wn++] = d;
      } else {
        d.scale = (d.scale ?? 1) - 0.1;
        if (d.crit) { d.alphaDir = -1; d.scale += 0.07; }
        if ((d.scale ?? 1) >= 0.1) this.dmgNumbers[wn++] = d; // 收缩期保留,scale<0.1 消亡
      }
    }
    this.dmgNumbers.length = wn;

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
    if (vid >= 0) {
      const us = itemFuncOfVid(vid)?.useStyle;
      if (us) return us;
      // itemfunc 提取缺口推断:细剑/短剑族(shoot→aiStyle 161)useStyle=13
      // (SetDefaults1(6) 模板,Item.cs:1379)——缺失时回退 1 会画成普通挥砍姿势
      const sh = itemCombat(vid)?.shoot ?? 0;
      if (sh && projectileData(sh)?.aiStyle === 161) return 13;
      return 1;
    }
    if (def.potion || def.heal) return 9; // 治疗类（仅标 heal 的残余占位）
    return 1;
  }

  /** 手持物 useStyle（按本仓库 item id 入口；规则同 heldUseStyle）——
   *  远端 swingNet 构造用（simulateRemotePlayers 无 ITEM_DEFS 条目时回退 1） */
  private useStyleOfVid(itemId: number): number {
    return this.heldUseStyle(ITEM_DEFS[itemId] ?? null);
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
      noGraphic: us === 13, // 短剑族 noUseGraphic=true(Item.cs SetDefaults1 case 6)——投射物即本体
    };
    this.swingHitSet.clear();
    this.swingTileCutSet.clear();
  }

  /** 709 天龙弹的 1110 星圈挂接（Kill 链 :70218-70290）：亡爆消费 80×80 内
   *  同主旧圈（ai1=1 渐隐）+ 新圈 timeLeft=30×Next(2,6) + 圈音 */
  private hookSkyDragonCircle(shot: SkyDragonShot): void {
    shot.consumeCircles = (x, y) => {
      for (const e of this.entities.projectiles) {
        const c = e as unknown as { dead?: boolean; consume?: () => void; x: number; y: number; w: number; h: number };
        if (c === shot || c.dead || typeof c.consume !== 'function') continue;
        if (!(Math.abs((c.x + c.w / 2) - x) <= 40 + c.w / 2 && Math.abs((c.y + c.h / 2) - y) <= 40 + c.h / 2)) continue;
        c.consume();                                 // ai[1]=1（:70256-70264）
      }
    };
    shot.spawnCircle = (x, y, dmg) => {
      const circle = new SkyDragonCircle(x, y, dmg, 30 * (2 + Math.floor(Math.random() * 4))); // Next(2,6)
      circle.critChance = shot.critChance;
      circle.armorPen = shot.armorPen;
      this.entities.add(circle, 'projectiles');
      this.playSfxFiles(soundTrackFiles('dd2_sky_dragons_fury_circle'), 1, x, y); // :70287-70290
    };
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
      // 油漆 lookup（SmartCursorHelper.cs:167-181 TryFindingPaintInplayerInventory：
      // 仅手持刷/滚（1071/1543/1072/1544）才查 FindPaintOrCoating；刮刀不查）
      paintLookup: (heldDef?.paintTool === 'brush' || heldDef?.paintTool === 'roller')
        ? p.inv.heldPaintLookup() : 0,
      // 钩爪锚点集（SmartCursorHelper.cs:106-115 _grappleTargets：现役锚点 Center 的
      // tile 坐标——镐链射线终点/免挖集；AI_007 实装后由玩家锚点表收集）
      grappleAnchors: p.grappleAnchorTiles(),
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
    // 舌头禁道具（Player.cs:22032 controlUseItem=false——狂卷之舌期间不得使用物品）
    if (this.player.buffs.has(BuffType.TheTongue)) return;
    // 石化/冰冻禁道具（:24942-24950 controlUseItem/UseTile 清零段——stoned 与
    // frozen||webbed 同段;此前 Frozen 只封移动不封使用,本次按原版一并补上）
    if (this.player.buffs.has(BuffType.Stoned) || this.player.buffs.has(BuffType.Frozen)) return;
    // 诅咒(23)：noItems（:11326-11330）→ TryUsingItem 整链禁用（:5757/:5964/:52017）
    if (this.player.buffs.has(BuffType.Cursed)) return;
    // ---- 传送族引导 tick(先于 uiBlocking 早退:引导中开背包不中断,原版同语义) ----
    if (this.recallChannel && this.player.useTime <= this.recallChannel.triggerAt) {
      const c = this.recallChannel;
      this.recallChannel = null;
      this.fireRecallTeleport(c);
    }
    // ---- 高尔夫哨引导 tick（Player.cs:42921-42924：itemAnimation==2 → ResetGolfBall）----
    if (this.golfWhistleAt !== null && this.player.useTime <= this.golfWhistleAt) {
      this.golfWhistleAt = null;
      this.useGolfWhistle();
    }
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
      // 骑乘中不拦使用路径（原版矿车不在 MountID.Sets.DontHoldItems{55,56,61}
      // MountID.cs:27——车上照常挥击/挖掘/放置/交互；此前整段 return 是简化禁用）
    }
    // R（坐骑键）：骑乘非矿车坐骑 → 下坐（Player.TryToDismount :5768-5776；
    //  下坐失败=空间不足，DoFailedDismountDust 尘 10）
    if (inp.down('KeyR') && !this.cartKeyLatch && this.player.ridingMount) {
      this.cartKeyLatch = true;
      this.tryDismountMount();
    }
    // R（坐骑键）：未骑乘 → QuickMount（Player.cs:5728-5783）：QuickMount_GetItemToUse
    // （:5859-5878）装备槽 miscEquips[3] 优先 → 背包 58 格扫【非矿车】坐骑物品 → SetMount；
    // ★无坐骑物品才落 QuickMinecart（原版同序；曾缺此支——背包有鞍按 R 不上车）
    if (inp.down('KeyR') && !this.cartKeyLatch) {
      this.cartKeyLatch = true;
      if (!this.quickMount()) this.tryQuickMinecart();
    }
    if (!inp.down('KeyR')) this.cartKeyLatch = false;
    // 全屏地图打开时鼠标交给地图（拖动/缩放/传送），不触发挖掘/放置/攻击/使用。
    // 时间调整按钮/面板悬停同理（renderer.timeUiHover 渲染期写入）
    if (inp.uiBlocking || this.player.dead || this.renderer.fullMap.open || this.renderer.timeUiHover || this.renderer.weatherUiHover) {
      this.mining = null;
      return;
    }
    // ---- 钻头坐骑（mount 8）：接管整条使用路径（ItemCheck_HandleMount :52066-52081
    //      noItems=true——骑乘钻头时手持物品全部禁用；左键按住挖块/右键按住拆墙，
    //      按压边沿开激光、双松关激光） ----
    if (this.player.ridingMount && this.player.mount.type === 8) {
      this.updateDrillMountUse();
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
      // 无矿车族物品也上车（默认木质车 13，Player.cs:22401）
      if (this.mountMinecartAt(tx, ty, this.bestCartMount())) this.input.rightDown = false;
      return;
    }
    if (inp.rightDown) {
      // 抚摸宠物（Main.cs:37404：右键悬停宠物投射物 → PetAnimal → HandleSpecialEvent
      // 21 PET_THE_PET）。命中宠物/光宠（光标世界点 32px 内）+ 玩家交互距离门
      // （IsProjectileInteractableAndInInteractionRange :22874-22886 = 宠物格在
      // TileReachCheckSettings.Simple 射程内——inTileRange 同款盒）才消费右键——
      // 优先级高于地块交互（原版 petting 判定在 TileInteraction 之前）
      {
        const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
        const pet = [this.petFollower, this.lightPetFollower].find(
          (f) => f && !f.dead && Math.hypot(f.cx - wx, f.cy - wy) < 32
          && this.inTileRange(Math.floor(f.cx / TILE), Math.floor(f.cy / TILE)));
        if (pet) {
          this.achievements.handleSpecialEvent(21,
            { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
          this.spawnParticles(pet.cx, pet.y, '#FF90B0', 4, 1.2, { life: 40 }); // 爱心尘近似
          this.sfx.play('menuTick', 1);
          this.input.rightDown = false;
        }
      }
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
      } else if (heldDef && viIdFromKey(heldDef.key) === 43) {
        if (!this.world.clock.isDay) {
          // 被召唤门拦下（场上已有 NPC 4）时 SummonItemCheck=false → 不消耗（Player.cs:51441-51447）
          if (this.useSuspiciousEye()) {
            this.player.inv.removeAt(this.player.inv.selected, 1);
            this.cb.onInventoryChanged();
          }
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.input.rightDown = false;
      } else if (heldDef?.tile && PLACE_TILE_ON_ALT_USE.has(viIdFromKey(heldDef.key) ?? -1)) {
        // PlaceTileOnAltUse 族右键放置（Player.cs:42842-42847 altFunctionUse==2 →
        // doPlacementAction）：捕获小动物 → 锚桩 724（tryPlace 内登记 TECritterAnchor
        // 等价记录）。不消费 rightDown：按住连放由 tryPlace 的 useTime 门节流
        // （autoReuse，DefaultToCapturedCritter :47614）；放置失败（占位/无支撑）
        // 落空即可，不透传 interactAt
        this.tryPlace(tx, ty, heldDef);
        return;
      } else {
        this.interactAt(tx, ty);
      }
      // 传送门枪右键（form 1 蓝门；Player.cs:48053-48057 altFunctionUse==2 → ai1=1）。
      // 挂在 tile 交互分派之后 = 原版 :31070 !tileInteractionHappened 语义——
      // 右键悬门/箱/祭坛时优先交互不射门（前面分支消费过 rightDown 则跳过）
      if (inp.rightDown && heldDef && viIdFromKey(heldDef.key) === 3384 && this.player.useTime === 0) {
        const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2,
          inp.mouseX - this.renderer.canvas.width / 2);
        this.player.facing = Math.cos(ang) > 0 ? 1 : -1;
        this.entities.add(firePortalGun(this.player, ang, 1), 'projectiles');
        this.useSwing(heldDef, ang);
        this.player.useTime = 20;
        this.input.rightDown = false;
      }
      // 天龙之怒 3858 右键 alt（Player.cs:31170 altFunctionUse 门 + :48127-48141
      // 出生：Damage×0.5 / kb+4 / 速 ×1.5 / ai0=(0.3+0.7r)×24×1.75×dir → 弹 708
      // AI_142 椭圆弧挥舞，anim 2/6/10 各出一发 709；709 亡爆生 1110 滞留圈
      // （同位消费旧圈）。useTime 门 = 原版 alt 复用冷却（useAnimation 30）
      if (inp.rightDown && heldDef && viIdFromKey(heldDef.key) === 3858 && this.player.useTime === 0) {
        const [swx, swy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
        const ang = Math.atan2(swy - this.player.cy, swx - this.player.cx);
        this.player.facing = Math.cos(ang) > 0 ? 1 : -1;
        const swVid = 3858;
        const swPs = this.heldPrefixStat();
        // Damage 参数 = item.damage ×词缀 ×meleeDamage 再 ×0.5；kb+4（:48135）
        const swDmg = Math.max(1, Math.round((itemCombat(swVid)?.damage ?? 140)
          * (swPs?.dmg ?? 1) * this.player.damageMult('melee') * 0.5));
        const swKb = (itemCombat(swVid)?.knockBack ?? 5) * (swPs?.kb ?? 1) + 4;
        const swCrit = 0.04 + (itemCombat(swVid)?.crit ?? 0) / 100;
        const swingP = new SkyDragonSwing(this.player,
          Math.cos(ang) * 24 * 1.5, Math.sin(ang) * 24 * 1.5,  // vector46 ×1.5（:48131/:48134）
          swDmg, swKb,
          () => this.swing?.t ?? 0,
          (sx, sy, svx, svy) => {
            const shot = new SkyDragonShot(sx, sy, svx, svy, swDmg);
            shot.critChance = swCrit;
            shot.armorPen = this.player.equipStats.armorPen;
            this.hookSkyDragonCircle(shot);
            this.entities.add(shot, 'projectiles');
          });
        swingP.critChance = swCrit;
        swingP.armorPen = this.player.equipStats.armorPen;
        this.entities.add(swingP, 'projectiles');
        this.useSwing(heldDef, ang);
        if (this.swing) this.swing.noGraphic = true;    // noUseGraphic（:34091）
        this.player.useTime = 30;
        this.playUseSound(swVid, 'bowShoot');            // UseSound=DD2_SkyDragonsFurySwing
        this.input.rightDown = false;
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

    // 近战挥剑（vi_ 数据驱动近战武器同走挥击，数值取 combat 表；攻速倍率 =
    // Player.attackSpeedMult = CapAttackSpeeds 倒数档，Player.cs:28555-28574）。
    // ★工具豁免：镐/斧/锤同时是 melee(Item.cs melee=true)——cwMelee 会命中,若不豁免
    //  本分支 return 会把挖掘链(tryMine)整个截胡 = 镐斧无法挖掘/砍树(2026-08-13 实锤:
    //  铜镐 tryMine 调用数 0)。工具优先落工具分支(自带低伤挥击打怪),仅无工具的
    //  纯近战(剑/vi_ melee)与本仓库 legacy sword 走本分支
    const cw = heldDef ? combatWeapon(heldDef) : null;
    const cwMelee = cw?.kind === 'melee' ? cw : null;
    if (tool?.type === 'sword' || (cwMelee && !tool)) {
      // ★挥击时长 = useAnimation、复用冷却 = useTime（Player.ItemCheck：itemAnimationMax 与
      // itemTime 分立；1790 件 vi 武器两者不同——此前把 useTime 当动画时长，挥速虚快 35%+）
      // autoReuse 持按链式：useTime<useAnimation 时原版会在动画未走完时重置弧线（下挥被截）
      const nativeSpd = tool?.speed;
      const animSpd = nativeSpd != null
        ? Math.max(12, Math.round(nativeSpd / this.player.attackSpeedMult))
        : Math.max(4, Math.round((cwMelee!.useAnimation) / this.player.attackSpeedMult));
      // ★原版 ApplyItemTime（P:4216-4222）useTime 裸值不乘 meleeSpeed——此前误缩
      // 导致近战连挥随攻速加成变快（原版只有动画变快、冷却恒定），审计 §1/§7 修正
      const reuseSpd = nativeSpd != null
        ? animSpd
        : Math.max(1, Math.round(cwMelee!.useTime));
      // TryAllowingItemReuse（Player.cs:52036-52053）：autoReuseGlove（力量手套族配饰）给
      // 近战武器补自动连挥——唯 type 3030 除外；原生 legacy sword 保持持按连挥
      const heldVid = heldDef?.vid ?? -1;
      const gloveReuse = this.player.equipStats.autoReuseGlove && heldVid !== 3030;
      const autoReuse = cwMelee ? (cwMelee.autoReuse || gloveReuse) : true;
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
        // ★ 真刃系旋斩弧五剑（Player.cs:48265-48317 各专属出生链——先于下方通用
        // shoot 门：368/1826 无 shootSpeed 会被饿死；弧弹自带命中，不再走 Arrow）
        const arcVid = heldDef?.vid ?? viIdFromKey(heldDef?.key ?? '');
        const arcCrit = 0.04 + (itemCombat(arcVid)?.crit ?? 0) / 100
          + this.player.critChance('melee') / 100 + (ps?.crt ?? 0) / 100;
        if (cwMelee?.shoot != null && [972, 973, 982, 983, 997, 933, 974, 976, 1100].includes(cwMelee.shoot)) {
          const angT = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
          this.player.facing = Math.cos(angT) > 0 ? 1 : -1;   // 发射型面向鼠标（:46578）
          const animT = cwMelee.useAnimation ?? cwMelee.useTime ?? 20;
          const scaleT = ps?.size ?? 1;
          const mkArc = (projId: number, dmg: number) => {
            const arc = new SwingArc(this.player, projId, animT, Math.round(dmg), this.player.facing, scaleT);
            arc.critChance = arcCrit;
            arc.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(arc, 'projectiles');
          };
          switch (cwMelee.shoot) {
            case 972: {   // 永夜刃 273（:48265-48274）：972 锚弧 + 972 飞斩（aim 向、ai1=30）
              mkArc(972, this.swing.dmg ?? cwMelee.damage);
              const fly = new NightsEdgeFly(this.player.cx, this.player.cy - 4,
                Math.cos(angT) * (cwMelee.shootSpeed ?? 5), Math.sin(angT) * (cwMelee.shootSpeed ?? 5),
                this.swing.dmg ?? cwMelee.damage, this.player.facing, 30, scaleT);
              fly.critChance = arcCrit;
              fly.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(fly, 'projectiles');
              break;
            }
            case 973: {   // 真永夜刃 675（:48294-48301）：972 锚弧 + 973 伸长斩（aim 向、半伤、ai1=32）
              mkArc(972, this.swing.dmg ?? cwMelee.damage);
              const slash = new TrueNightsEdgeSlash(this.player,
                Math.cos(angT) * (cwMelee.shootSpeed ?? 14), Math.sin(angT) * (cwMelee.shootSpeed ?? 14),
                (this.swing.dmg ?? cwMelee.damage) / 2, this.player.facing, 32, scaleT);
              slash.critChance = arcCrit;
              slash.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(slash, 'projectiles');
              break;
            }
            case 933:
            case 1100: {  // Zenith 4956 / 真铜短剑 5669（Player.cs:48078-48121 同链：
              // 5669 档案恒 3507、Zenith 首 4956 后续表随机）
              const isZenith = cwMelee.shoot === 933;
              const [zwx, zwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
              const cycle = Math.floor((this.swing?.t ?? 0) / (cwMelee.useTime ?? 10));
              let tzx = zwx, tzy = zwy;
              if (cycle >= 1) {
                let best: { cx: number; cy: number } | null = null, bd = 400;
                for (const ent of this.entities.enemies) {
                  const e = ent as unknown as { cx: number; cy: number; dead: boolean; vanillaId?: number | null; hp: number };
                  if (e.dead) continue;
                  const d = Math.hypot(e.cx - zwx, e.cy - zwy);
                  if (d < bd) { bd = d; best = { cx: e.cx, cy: e.cy }; }
                }
                if (best) { tzx = best.cx; tzy = best.cy; }
                if (cycle >= 2 || !best) {
                  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 150;
                  tzx += Math.cos(a) * r; tzy += Math.sin(a) * r;
                }
              }
              const zsword = new ZenithSword(this.player, tzx, tzy,
                this.swing.dmg ?? cwMelee.damage,
                !isZenith ? 3507 : (cycle === 0 ? 4956 : randomFractalProfile()));
              zsword.critChance = arcCrit;
              zsword.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(zsword, 'projectiles');
              break;
            }
            case 974: {   // 魔光剑 46（Player.cs:48242-48264）：生成在瞄准搜索点
              // （MountedCenter+(70,−40)×Directions ±20 散布或 50px 内敌人身上）；
              // ai0=1（暴击掷中→2 且伤害×2 折进斩痕）；伤害×0.5；方向载波不位移
              const [lbwx, lbwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
              const fd = this.player.facing;
              let dvx = fd, dvy = 4;
              const dvl = Math.hypot(dvx, dvy) || 1; dvx /= dvl; dvy /= dvl;
              const jit = (Math.random() * 2 - 1) * 0.05 * Math.PI * 2;
              const jd = Math.cos(jit), js = Math.sin(jit);
              const rdx = dvx * jd - dvy * js, rdy = dvx * js + dvy * jd;
              let sx974 = this.player.cx + fd * 70 - rdx * 10;
              let sy974 = this.player.cy - 40 - rdy * 10;
              let best = null as { cx: number; cy: number } | null, bd = 50;
              for (const ent of this.entities.enemies) {
                const e = ent as unknown as { cx: number; cy: number; dead: boolean };
                if (e.dead) continue;
                const dd = Math.hypot(e.cx - sx974, e.cy - sy974);
                if (dd < bd) { bd = dd; best = e; }
              }
              if (best) { sx974 = best.cx + (Math.random() - 0.5) * 20; sy974 = best.cy + (Math.random() - 0.5) * 20; }
              else { sx974 += (Math.random() * 2 - 1) * 20; sy974 += (Math.random() * 2 - 1) * 20; }
              let ai0974 = 1;
              let dmg974 = (this.swing.dmg ?? cwMelee.damage) * 0.5;
              if (Math.floor(Math.random() * 100) < this.player.critChance('melee') * 100 + 4) { ai0974 = 2; dmg974 *= 2; }
              const lb = new LightsBaneSlash(sx974, sy974, rdx, rdy, Math.round(dmg974), ai0974);
              lb.critChance = arcCrit;
              lb.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(lb, 'projectiles');
              break;
            }
            case 976: {   // 草剑 190（Player.cs:48318-48361）：弧线搜索飞叶
              // 目标 = MountedCenter+(70,−40)±20 散布或 150px 内敌人盒内随机点；
              // 起点沿方向弧线步行（步长 16、旋转 num178/60、上限 60 步）；
              // ai0=每 tick 旋转、伤害×0.25
              const [gx, gy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
              let tx976 = this.player.cx + this.player.facing * 70, ty976 = this.player.cy - 40;
              let best976 = null as { cx: number; cy: number; x: number; y: number; w: number; h: number } | null, bd976 = 150;
              for (const ent of this.entities.enemies) {
                const e = ent as unknown as { cx: number; cy: number; x: number; y: number; w: number; h: number; dead: boolean };
                if (e.dead) continue;
                const dd = Math.hypot(e.cx - tx976, e.cy - ty976);
                if (dd < bd976) { bd976 = dd; best976 = e; }
              }
              if (best976) {
                tx976 = best976.x + Math.random() * best976.w;
                ty976 = best976.y + Math.random() * best976.h;
              } else { tx976 += (Math.random() * 2 - 1) * 20; ty976 += (Math.random() * 2 - 1) * 20; }
              const dir976 = this.player.facing;
              let sx976 = this.player.cx + (Math.random() * 2 - 1) * this.player.w / 2;
              let sy976 = this.player.cy + this.player.h / 2 - 24;   // !zenithTarget 的 Y−=24 分支
              const v6x = tx976 - sx976, v6y = ty976 - sy976;
              let num178 = (Math.PI + Math.PI * 2 * Math.random() * 1.5) * (-dir976);
              const num180 = num178 / 60;
              // 弧线步进：UnitX*16 每步旋转 num180，直到覆盖 |v6| 或 60 步
              let px = 16, py = 0, accX = 0, accY = 0, steps = 0;
              while (Math.hypot(accX, accY) < Math.hypot(v6x, v6y) && steps < 60) {
                steps++;
                accX += px; accY += py;
                const rc = Math.cos(num180), rs = Math.sin(num180);
                const npx = px * rc - py * rs, npy = px * rs + py * rc;
                px = npx; py = npy;
              }
              const num184 = Math.atan2(py, px) - num180;
              let svx = v6x, svy = v6y;
              const svl = Math.hypot(svx, svy) || 1; svx /= svl; svy /= svl;
              const rc2 = Math.cos(-num184), rs2 = Math.sin(-num184);
              let fvx = svx * rc2 - svy * rs2, fvy = svx * rs2 + svy * rc2;
              if (steps === 60) { fvx = dir976; fvy = 0; }
              fvx *= 16; fvy *= 16;
              if (!best976) {
                const rotJit = dir976 * Math.PI * 2 * 0.14;
                const jc = Math.cos(rotJit), js2 = Math.sin(rotJit);
                const jvx = fvx * jc - fvy * js2, jvy = fvx * js2 + fvy * jc;
                fvx = jvx; fvy = jvy;
              }
              const gs = new GrassSlash(sx976, sy976, fvx, fvy,
                Math.round((this.swing.dmg ?? cwMelee.damage) * 0.25), num180);
              gs.critChance = arcCrit;
              gs.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(gs, 'projectiles');
              break;
            }
            case 982: mkArc(982, this.swing.dmg ?? cwMelee.damage); break;          // 圣剑 368（:48280）
            case 997: mkArc(997, this.swing.dmg ?? cwMelee.damage); break;          // 无头骑士剑 1826（:48287）
            case 983: {   // 真断钢剑 674（:48302-48309）：983 弧 + 982【伤害 0】视觉弧
              mkArc(983, this.swing.dmg ?? cwMelee.damage);
              mkArc(982, 0);
              break;
            }
          }
        } else if (cwMelee?.shoot && cwMelee.shootSpeed != null) {
          const ang2 = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
          // 发射型武器面向鼠标（同 useCombatWeapon——ItemCheck_Shoot :46578 语义）
          this.player.facing = Math.cos(ang2) > 0 ? 1 : -1;
          const pd = projectileData(cwMelee.shoot);
          // 穿透取投射物表原值（2026-08-13：去 min-3 钳——喵刀 502 penetrate=5 被
          // 钳成 3 违背原版；-1（无限）沿用 3 近似）
          let pen = pd?.penetrate ?? 1;
          if (pen < 0) pen = 3;
          pen = Math.max(1, pen);
          // 502 喵刀猫（Projectile.cs:5460 AI_008）：前 20t 平飞后重力 0.2（:22656）、
          // timeLeft 默认 180、落地弹跳（Arrow.meowBounceOff）
          const meow = cwMelee.shoot === 502;
          // 飞龙 3827 剑气（Player.cs:46612-46615）：出生点沿瞄准向【垂直】偏移
          // direction×24px（巨剑气的侧向出鞘感）
          let mxAdj = 0, myAdj = 0;
          if (cwMelee.shoot === 684) {
            const vxl = Math.hypot(Math.cos(ang2), Math.sin(ang2)) || 1;
            const ux = Math.cos(ang2) / vxl, uy = Math.sin(ang2) / vxl;
            const px = this.player.facing * -Math.PI / 2;
            mxAdj = (ux * Math.cos(px) - uy * Math.sin(px)) * 24;
            myAdj = (ux * Math.sin(px) + uy * Math.cos(px)) * 24;
          }
          // 屠夫链锯 3098 → 509（AI_020 :23837-23949）：channel 持械——挂手+瞄准
          // 向直写+松链即亡；2 帧旋转+Item189 节奏+尘 31 火花（同链锯族）
          if (cwMelee.shoot === 509 && heldDef) {
            const sawOwner = this.player;
            const sawItemId = heldDef.key;
            const saw = new ChainsawProj(this.player,
              this.swing.dmg ?? cwMelee.damage, cwMelee.knockback,
              () => this.input.mouseHeld && !this.input.uiBlocking
                && sawOwner.inv.heldItem()?.id === ITEM_BY_KEY[sawItemId]
                && !sawOwner.dead,
              () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; });
            saw.critChance = arcCrit;
            saw.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(saw, 'projectiles');
            this.mining = null;
            return;
          }
          // 初代分形剑 4722 → 857（Player.cs:47400-47447）：目标=随机可追敌
          // （+速度×20 预测）或鼠标位钳 700；方向混入玩家速度；速度 12+rand×2；
          // 曲率 ±π/120；出生点=目标−30 步旋转弧（弧尾入场）
          if (cwMelee.shoot === 857) {
            const [ffx, ffy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
            const ffTargets: Array<{ cx: number; cy: number; vx: number; vy: number }> = [];
            for (const ent of this.entities.enemies) {
              const e = ent as unknown as { cx: number; cy: number; vx: number; vy: number; dead: boolean; maxHp: number };
              if (e.dead || e.maxHp <= 5) continue;
              ffTargets.push(e);
            }
            let tx857 = ffx, ty857 = ffy;
            let hasTarget = false;
            if (ffTargets.length > 0) {
              const pick = ffTargets[Math.floor(Math.random() * ffTargets.length)];
              tx857 = pick.cx + pick.vx * 20; ty857 = pick.cy + pick.vy * 20;
              hasTarget = true;
            } else {
              tx857 += (Math.random() * 2 - 1) * 24; ty857 += (Math.random() * 2 - 1) * 24;
              const dx857 = tx857 - this.player.cx, dy857 = ty857 - this.player.cy;
              const dl857 = Math.hypot(dx857, dy857);
              if (dl857 > 700) { tx857 = this.player.cx + dx857 / dl857 * 700; ty857 = this.player.cy + dy857 / dl857 * 700; }
            }
            // 方向：随机单位圆 ×(1−速度混合) + 玩家速度 ×0.8 混合后归一
            let dxa = Math.cos(Math.random() * Math.PI * 2), dya = Math.sin(Math.random() * Math.PI * 2);
            if (!hasTarget) {
              const pspd = Math.hypot(this.player.vx, this.player.vy);
              const mix = Math.min(1, pspd / 6) * 0.8;
              dxa = dxa * (1 - mix) + this.player.vx * mix;
              dya = dya * (1 - mix) + this.player.vy * mix;
              const dl = Math.hypot(dxa, dya) || 1; dxa /= dl; dya /= dl;
            } else { dxa = 0; dya = 0; }   // 有敌：方向由出生弧几何决定（vector35 未用）
            const spd857 = 12 + Math.random() * 2;
            const curv = (Math.random() < 0.5 ? -1 : 1) * Math.PI / 120;
            // 出生点 = 目标 − ∫30 步旋转弧（:47433-47438）
            let ax857 = 0, ay857 = 0;
            let vx857 = dxa * spd857, vy857 = dya * spd857;
            if (hasTarget) {
              vx857 = (tx857 - this.player.cx); vy857 = (ty857 - this.player.cy);
              const vl = Math.hypot(vx857, vy857) || 1;
              vx857 = vx857 / vl * spd857; vy857 = vy857 / vl * spd857;
            }
            for (let k = 0; k < 30; k++) {
              ax857 += vx857; ay857 += vy857;
              const rc = Math.cos(curv), rs = Math.sin(curv);
              const nvx = vx857 * rc - vy857 * rs, nvy = vx857 * rs + vy857 * rc;
              vx857 = nvx; vy857 = nvy;
            }
            const ff = new FirstFractalSlash(tx857 - ax857, ty857 - ay857, vx857, vy857,
              this.swing.dmg ?? cwMelee.damage, curv);
            ff.critChance = arcCrit;
            ff.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(ff, 'projectiles');
          }
          // 波涌之刃 2880 → 451（Player.cs:48616-48618：ai[0]=-1 初值；穿透取表）
          if (cwMelee.shoot === 451) {
            const tide = new TideSlash(
              Math.cos(ang2) * cwMelee.shootSpeed, Math.sin(ang2) * cwMelee.shootSpeed,
              this.swing.dmg ?? cwMelee.damage, cwMelee.knockback,
              Math.max(1, pd?.penetrate ?? 3));
            tide.critChance = arcCrit;
            tide.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(tide, 'projectiles');
          }
          // 日耀喷发 3473 → 611 链鞭（Player.cs:48059-48063）：初速=瞄准向（链
          // 鞭自甩）；ai[1] 抖动在构造内；同 swing 伤害
          if (cwMelee.shoot === 611) {
            const whip = new SolarEruptionWhip(
              Math.cos(ang2) * cwMelee.shootSpeed, Math.sin(ang2) * cwMelee.shootSpeed,
              this.swing.dmg ?? cwMelee.damage);
            whip.critChance = arcCrit;
            whip.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(whip, 'projectiles');
          }
          // 985 泰拉刃光束（Player.cs:48316-48317 出生注入）：初速=瞄准向×5
          // 【非 shootSpeed】、ai[0]=朝向±1、ai[1]=18（寿命 43t）、ai[2]=物品 scale
          // （×词缀 size）；同时伴生 984 旋斩弧（见下 TerraArc）
          const terra = cwMelee.shoot === 985;
          if (terra) {
            const [twx, twy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
            const tdx = twx - this.player.cx, tdy = twy - this.player.cy;
            const tdl = Math.hypot(tdx, tdy) || 1;
            this.entities.add(new Arrow(
              this.player.cx, this.player.cy - 4,
              tdx / tdl * 5, tdy / tdl * 5,          // :48316 (num4,num5)×5f
              this.swing.dmg ?? 1, this.swing.kb ?? 3, 985, null,
              { grav: 0, pierce: Math.max(1, pd?.penetrate ?? 3),
                terra: { ai0: this.player.facing, ai1: 18, ai2: (ps?.size ?? 1) } }),
              'projectiles');
            // 984 旋斩弧（同链首行 NewProjectile 984：方向×重力、itemAnimationMax、
            // 调整 scale——Player 相对锚定的挥砍视觉，TerraArcProj 随 985 同生同灭）
            const arc = new SwingArc(this.player, 984, cwMelee.useTime,
              Math.round((this.swing.dmg ?? 1)), this.player.facing, (ps?.size ?? 1));
            arc.critChance = arcCrit;
            arc.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(arc, 'projectiles');
            this.mining = null;
            return;
          }
          // 老星怒 65 → 9 天降落星（Player.cs:46613-46625 出生链 + :48479-48491
          // type65 块）：出生 = 光标 X + 远离玩家侧 rand(0..200)、玩家上方 600px；
          // 伤害 ×1.5、击退清零；目标线从光标向出生点逐 16px 回退到首个非实心格
          // （aiStyle 5 :22159-22162 越线前穿墙用 Bottom.Y ≥ ai[1]——与 503 的
          // Center.Y > ai[1] 不同）。65 在"仅 ItemAnimationJustStarted 射弹"名单
          // （Player.cs:42783）= 每挥一星
          if (cwMelee.shoot === 9) {
            const [mwx9, mwy9] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
            const num3 = mwx9 < this.player.x ? 1
              : (mwx9 <= this.player.x + this.player.w && Math.random() < 0.5) ? 1 : -1;
            const sx9 = this.player.x + this.player.w / 2 + Math.floor(Math.random() * 201) * num3
              + (mwx9 - this.player.x);
            const sy9 = this.player.cy - 600;
            // 目标线回退（:48483-48488）：vec 从光标沿 normalize(出生点−光标) 步进
            let vx9 = mwx9, vy9 = mwy9;
            let ux9 = sx9 - mwx9, uy9 = sy9 - mwy9;
            const dl9 = Math.hypot(ux9, uy9);
            if (dl9 > 0) { ux9 /= dl9; uy9 /= dl9; } else { ux9 = 0; uy9 = -1; }
            for (let g9 = 0; g9 < 64 && vy9 > sy9; g9++) {
              const tx9 = Math.floor(vx9 / TILE), ty9 = Math.floor(vy9 / TILE);
              if (!this.world.store.inBounds(tx9, ty9) || !this.world.store.isSolid(tx9, ty9)) break;
              vx9 += ux9 * 16; vy9 += uy9 * 16;
            }
            const spd9 = cwMelee.shootSpeed / this.player.attackSpeedMult;
            const dvx9 = mwx9 - sx9, dvy9 = mwy9 - sy9;
            const dvl9 = Math.hypot(dvx9, dvy9) || 1;
            const star9 = new StarfuryStar(sx9, sy9,
              dvx9 / dvl9 * spd9, dvy9 / dvl9 * spd9,
              Math.trunc((this.swing.dmg ?? 1) * 1.5),   // :46624 Damage ×1.5
              Math.max(1, pd?.penetrate ?? 2), vy9);
            star9.critChance = arcCrit;
            star9.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
            this.entities.add(star9, 'projectiles');
            this.mining = null;   // 与 503 分支同语义（提前 return 防下方通用单发补射）
            return;  // 本击只出天降落星，不再走下方通用单发
          }
          // 3065 星怒 → 503 天降三剑（Player.cs:47107-47136）：出生=玩家上方 600px
          // 随机偏后 0-400px、每剑再高 100px；速度朝鼠标且强制向下 |dy|≥20、
          // vy 抖动 ±0.4；目标线 = min(鼠标Y, 玩家cy−200)（线上穿墙越线撞块）
          if (cwMelee.shoot === 503) {
            const [mwx, mwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
            const targetY = Math.min(mwy, this.player.cy - 200);
            const spd503 = cwMelee.shootSpeed / this.player.attackSpeedMult;
            for (let i503 = 0; i503 < 3; i503++) {
              const sx503 = this.player.cx - Math.random() * 401 * this.player.facing;
              const sy503 = this.player.cy - 600 - 100 * i503;
              let dx503 = mwx - sx503;
              let dy503 = Math.abs(mwy - sy503);
              if (dy503 < 20) dy503 = 20;
              const dl503 = Math.hypot(dx503, dy503) || 1;
              this.entities.add(new Arrow(sx503, sy503,
                dx503 / dl503 * spd503,
                dy503 / dl503 * spd503 + (Math.random() * 80 - 40) * 0.02,
                this.swing.dmg ?? 1, this.swing.kb ?? 3, 503, null,
                { grav: 0, life: 900, pierce: Math.max(1, pd?.penetrate ?? 2), star: { targetY } }),
                'projectiles');
            }
            this.mining = null;   // 与分支尾段语义一致（提前 return 防漏）
            return;  // 本击只出天降剑，不再走下方通用单发
          }
          this.entities.add(new Arrow(
            this.player.cx + Math.cos(ang2) * 14 + mxAdj, this.player.cy - 4 + Math.sin(ang2) * 14 + myAdj,
            // ⑨ melee 弹速 /meleeSpeed（P:46431-46434 speed/=meleeSpeed——审计 §1/§9）
            Math.cos(ang2) * cwMelee.shootSpeed / this.player.attackSpeedMult,
            Math.sin(ang2) * cwMelee.shootSpeed / this.player.attackSpeedMult,
            this.swing.dmg ?? 1, this.swing.kb ?? 3, cwMelee.shoot, null,
            // meow 502 = aiStyle8 自档（平飞 20t 后 0.2）；其余走 AI_001 规格链
            (() => { const g = projGravSpec(cwMelee.shoot); return meow
              ? { grav: 0.2, gravDelay: 19, life: 180, pierce: pen }
              : { grav: g.grav, gravDelay: g.delay, grav2: g.grav2, grav2At: g.grav2At,
                  dragAlways: g.drag, life: pd?.timeLeft ?? 600, pierce: pen }; })()), 'projectiles');
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

    // 油漆三件套（Player.cs PlaceThing :38923-38925——先于 Tiles/Walls 分派；
    //  Paintbrush :41254 / PaintRoller :41236 / PaintScrapper :41152）。左键，
    //  目标格可被占用（与电路工具同权，且不进 noBuilding 门）
    if (heldDef?.paintTool && inp.mouseDown && !inp.rightDown) {
      this.tryUsePaintTool(tx, ty, heldDef);
      return;
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
    // PlaceTileOnAltUse 族（ItemID.cs:155：捕获小动物 tile 724 / 风筝 tile 723）左键
    // 不放置——放置只在右键（下方 rightDown 段），左键保留各自使用语义（放生/放飞，
    // Player.cs:42842-42847 altFunctionUse==2 才 doPlacementAction）
    if (heldDef?.tile && !inp.rightDown
      && !PLACE_TILE_ON_ALT_USE.has(viIdFromKey(heldDef.key) ?? -1)) {
      this.tryPlace(tx, ty, heldDef);
      return;
    }

    // 钩爪物品族（HOOK_ITEMS 全 26 件）：左键 = QuickGrapple 发射（Player.cs:27165-27169
    // controlHook → QuickGrapple；物品族 noUseGraphic=true 无挥舞动画，useStyle 5 静持）。
    // 方向 = 鼠标世界位 - 玩家中心（QuickGrapple :6094-6113）；冷却 = useTime（20/骷髅手 25）。
    // 上限门/双钩交替/月亮轮换见 fireGrapple（num7/num8/73↔74/646-649 1:1）
    {
      const hookVid = heldDef ? viIdFromKey(heldDef.key) : -1;
      if (hookVid >= 0 && hookItemOf(hookVid) && inp.mouseDown && !inp.rightDown
        && this.player.useTime === 0) {
        // 方向 = 鼠标世界位 - 玩家中心（QuickGrapple :6094-6105）；零向量回退
        // 朝向（:6106-6108 num11=direction, num12=0）
        const mdx = inp.mouseX - vw2 / 2, mdy = inp.mouseY - vh2 / 2;
        if (mdx === 0 && mdy === 0) {
          this.fireGrapple(hookVid, this.player.facing, 0);
        } else {
          const d = Math.hypot(mdx, mdy);
          this.fireGrapple(hookVid, mdx / d, mdy / d);
        }
        return;
      }
    }

    // 其它物品（药水/食物/镜子/召唤物等）：左键使用，useStyle 分族姿势
    // （Player.ItemCheck：itemAnimationMax = useAnimation，ApplyUseStyle 按 useStyle
    //  路由——4 举过头（镜子/机械三王召唤）/5 朝鼠标静持（火把族非放置路径）/
    //  9 举杯（增益药水 DefaultToHealingPotion）/2 咀嚼（食物 DefaultToFood）/
    //  6 饮用旋转（回归药水）；此前的统一 30t 挥砍对 395 件 4/5/9 族全错族）
    // （召唤武器例外——交给下方 cw 分发 kind='summon'；yoyo/flail/boomerang 与
    //  长矛(aiStyle 19)族原版 noUseGraphic=true（Item.cs case 220 等,DefaultToSpear
    //  :47637 全 202 处）——投射物即本体,此处再画持物 = 角色旁多出一个静态武器图标。
    //  ★短剑族(aiStyle 161)noUseGraphic 未设=false——使用期间【必须画手持剑】
    //  (SetDefaults1(6) 模板无 noUseGraphic),此前随 spear 整族误排除 = 玩家空手+
    //  剑贴图独立飞出 = "抛出"观感,2026-08-13 铜短剑报告根因）
    if (heldDef && inp.mouseDown && this.player.useTime === 0 && !heldDef.tool
      && cw?.kind !== 'summon' && cw?.kind !== 'yoyo'
      && cw?.kind !== 'flail' && cw?.kind !== 'boomerang'
      && !(cw?.kind === 'spear' && projectileData(cw.shoot)?.aiStyle === 19)) {
      // aim 朝鼠标角——useStyle 13(短剑突刺持位)/5 静持需方向化(Renderer case 13)
      // 捕获小动物释放（ItemCheck_ReleaseCritter :43377-43396 + NPC.ReleaseNPC
      //  :80900-80964）：鼠标世界格非实心 → 原地放出 + 消耗 1（consumable）
      {
        const relNpc = CRITTER_RELEASE_BY_ITEM[viIdFromKey(heldDef.key) ?? -1];
        if (relNpc) {
          const relKey = CRITTER_KEY_BY_NPC[relNpc];
          const mtx = Math.floor((this.camera.x + (inp.mouseX - vw2 / 2)) / TILE);
          const mty = Math.floor((this.camera.y + (inp.mouseY - vh2 / 2)) / TILE);
          const st = this.world.store;
          if (relKey && st.inBounds(mtx, mty) && !st.isSolid(mtx, mty)) {
            this.entities.add(new Critter(relKey, mtx * TILE + 8 - 10, mty * TILE + 16 - 10), 'critters');
            this.player.inv.removeAt(this.player.inv.selected, 1);
            this.cb.onInventoryChanged();
            this.player.useTime = 15;                 // useAnimation 15（:47616）
            return;
          }
          return;                                     // 目标格实心：不消耗不放出
        }
      }
      // 坐骑召唤物（Item.cs `mountType = N` 37 件：驯鹿铃铛 1914/绒毛胡萝卜 2428/
      // 带鳞松果 2429/粘鞍 2430/硬鞍 2491/花蜜 2502…）：左键使用即上/下坐（Player.cs:42095）
      if (mountOfItem(viIdFromKey(heldDef.key) ?? -1) >= 0) {
        this.useMountItem(viIdFromKey(heldDef.key)!);
        return;
      }
      this.useSwing(heldDef, Math.atan2(inp.mouseY - vh2 / 2, inp.mouseX - vw2 / 2));
      // 召唤道具（原版左键使用）
      if (viIdFromKey(heldDef.key) === 43) {
        if (!this.world.clock.isDay) {
          // 被召唤门拦下（场上已有 NPC 4）时不消耗（SummonItemCheck，Player.cs:51441-51447）
          if (this.useSuspiciousEye()) {
            this.player.inv.removeAt(this.player.inv.selected, 1);
            this.cb.onInventoryChanged();
          }
        } else {
          this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NothingHappened'));
        }
        this.player.useTime = 30;
      }
    }
    // 发色剂族（Player.cs:42179-42186 `item.hairDye >= 0`：使用即 player.hairDye =
    //  item.hairDye；1990 去除剂 hairDye=0 = 清除。原版无装备槽位，颜色随 .plr 存档）
    if (heldDef && inp.mouseDown && this.player.useTime === 0
      && hairDyeShaderOfItem(viIdFromKey(heldDef.key)) >= 0) {
      const dyeVid = viIdFromKey(heldDef.key);
      const p = this.player;
      p.hairDye = hairDyeShaderOfItem(dyeVid);
      this.net?.resendAppearance();   // msg4 外观重发——远端发色/派对彩纸实时生效（2026-08-14）
      p.inv.removeAt(p.inv.selected, 1);
      p.useTime = 17;   // Item.cs:21223 useTime 17（1990 同 :21276）
      this.playSfxFile(itemUseSoundWav(dyeVid) ?? 'Item_3', 1, p.cx, p.cy);  // UseSound=Item3（:21219/:21272）
      this.cb.onInventoryChanged();
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
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && viIdFromKey(heldDef.key) === 29) {
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
        // 成就：魔力水晶使用（Player.cs:44667 HandleSpecialEvent(1)）
        this.achievements.handleSpecialEvent(1,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
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
        // 成就：生命果使用（Player.cs:44683 HandleSpecialEvent(2)）
        this.achievements.handleSpecialEvent(2,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
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
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0
      && FUN_USE_VIDS.has(viIdFromKey(heldDef.key) ?? -1)) {
      // ---- §4 乐器 + §5 趣味使用族（纯函数层 src/items/FunItems.ts，行号锚在其内）----
      // 508 竖琴 / 4673 鼓槌 / 856 棍上独角兽 / 1450 泡泡棒。
      // 1345 彩带（Item.cs:16620-16629）无 UseSound/shoot/createTile——Player.cs
      // 全源零引用 = 纯合成材料，不在本表（同 2339 锡罐定案）。
      // 5464 Mitey-Titey 走上方 tryPlace 放置链（consumable=false 不消耗，见其尾段门）
      const fvid = viIdFromKey(heldDef.key) ?? -1;
      const p = this.player;
      const axis = Math.min(this.renderer.canvas.width, this.renderer.canvas.height);
      const [mwx, mwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
      const mouseWorldDist = Math.hypot(mwx - p.cx, mwy - p.cy);
      const drumRange = Math.min(1, mouseWorldDist / (axis / 2));  // :46014-46020 只钳上界
      const useTimeOf = (v: number) => itemCombat(v)?.useTime ?? 30;
      switch (fvid) {
        case 508: { // 竖琴（Player.cs:45905-45936）：按鼠标距离 6 档音高 Item26
          this.useSwing(heldDef, Math.atan2(mwy - p.cy, mwx - p.cx));  // useStyle5 静持
          // XNA Pitch 直传（Main.musicPitch）——Sfx.playWavFile 第 5 参 2^pitch 变调
          this.sfx.playWavFile(instrumentUseSound(508), 1, p.cx, p.cy,
            instrumentNotePitch(mouseWorldDist, axis));
          p.useTime = useTimeOf(508);   // 12（Item.cs:7403-7413）
          break;
        }
        case 4673: { // 鼓槌（Player.cs:46003-46023）：站上鼓组 tile 486 才发声，
          // 10 档音色按鼠标距离（PlayDrums）——离鼓组挥空无声（原版同语义）
          this.useSwing(heldDef);
          const st = this.world.store;
          const tx = Math.floor(p.cx / TILE), ty = Math.floor(p.cy / TILE);
          const drumTile = TILE_BY_KEY['v_486_drum_set'];
          if (drumTile !== undefined && st.inBounds(tx, ty) && st.get(tx, ty) === drumTile) {
            this.sfx.playWavFile(drumSoundFile(drumRange), 1, p.cx, p.cy);
          }
          p.useTime = useTimeOf(4673);  // 12（Item.cs:38490-38500）
          break;
        }
        case 856:
          // 棍上独角兽（useStyle16=PlaySound，ItemUseStyleID.cs:37；Item.cs:11387-11399）：
          // 纯声响玩具——UseSound Item196 走通用使用音段（Player.cs:50933-50951）
          this.playUseSound(856, 'pickup');
          p.useTime = useTimeOf(856);   // 10
          break;
        case 1450:
          // 泡泡棒（Player.cs:44429-44462）：noMelee 无 shoot 纯挥动——气泡 gore
          // 在 updateSwingHits 每帧 1/3 掷骰喷出（判定盒内随机点）
          this.useSwing(heldDef);
          p.useTime = useTimeOf(1450);  // 25（Item.cs:17951-17963）
          break;
        default:
          break;
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0
      && PERMANENT_USE_VIDS.has(viIdFromKey(heldDef.key))) {
      // ---- 永久升级/特殊消耗品（Player.cs:44575-44802/:42462/:42516/:42205/:44861/:44609）----
      const pvid = viIdFromKey(heldDef.key);
      const p = this.player;
      const consume = () => { p.inv.removeAt(p.inv.selected, 1); this.cb.onInventoryChanged(); };
      const flagOnce = (setter: () => void) => { setter(); consume(); };
      switch (pvid) {
        case 3335: // 恶魔之心(:44575-44583):解锁第六配饰槽(专家)
          if (this.world.isExpert || this.world.isMaster) flagOnce(() => { p.inv.extraAccessory = true; });
          p.useTime = 30;
          this.sfx.play('pickup');
          break;
        case 5337: if (!p.usedAegisCrystal) flagOnce(() => { p.usedAegisCrystal = true; }); p.useTime = 45; break;
        case 5338: if (!p.usedAegisFruit) flagOnce(() => { p.usedAegisFruit = true; }); p.useTime = 45; break;
        case 5339: if (!p.usedArcaneCrystal) flagOnce(() => { p.usedArcaneCrystal = true; }); p.useTime = 45; break;
        case 5341: if (!p.usedGummyWorm) flagOnce(() => { p.usedGummyWorm = true; }); p.useTime = 45; break;
        case 5342: if (!p.usedAmbrosia) flagOnce(() => { p.usedAmbrosia = true; }); p.useTime = 45; break;
        case 5043: // 火把之神眷顾(:44609-44634):解锁群系火把
          flagOnce(() => { this.world.flags.unlockedBiomeTorches = true; });
          p.useTime = 30; this.sfx.play('pickup');
          break;
        case 5573: { // Torch God's Potion（:10594-10596 → unlockedBiomeTorches 置位,2026-08-13）
          this.world.flags.unlockedBiomeTorches = true;
          p.useTime = 30;
          break;
        }
case 2756: { // 性别转换药水(:42516-42542):Male 翻转
          // 未设置变体(缺省)视作 0(男);特殊套装 2-9 不动只消耗
          if (p.appearance) {
            const v = p.appearance.skinVariant ?? 0;
            if (v === 0 || v === 1) p.appearance.skinVariant = v === 0 ? 1 : 0;
          }
          consume(); p.useTime = 30; this.sfx.play('drink');
          break;
        }
        case 4870: // 回归药水(:42462):传送出生点(床/回归点 stash 未实装→出生点近似,偏差记录)
          this.sfx.play('drink');
          p.x = this.world.spawnX * TILE + 8;
          p.y = (this.world.spawnY - 3) * TILE;
          p.vx = 0; p.vy = 0;
          this.camera.x = p.cx; this.camera.y = p.cy;
          this.recallDust(p, 70, true);
          consume(); p.useTime = 30;
          break;
        case 678: { // 红药水(:42205-42227):普通世界固定 buff 组(20-30/33/68 各 3600s)
          const RED_BUFFS = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 68];
          for (const vb of RED_BUFFS) {
            const bt = BUFF_BY_VANILLA.get(vb);
            if (bt !== undefined) p.buffs.apply(bt, 3600);
          }
          consume(); p.useTime = 30; this.sfx.play('drink');
          break;
        }
        case 3628: { // 同伴方块（Item.cs:32679-32691：useStyle 4/shoot 653/buff 191）
          // 使用：Item_8 声 + AddBuff(191, 3600)（宠物 buff 标准时长）；
          // BuffHandle_SpawnPetIfNeeded（Player.cs:10634）——无存活 653 时在玩家中心生成。
          // 光宠物不占随从槽（noSlot）,不消耗
          this.playSfxFiles(['Item_8'], 1, p.cx, p.cy); // UseSound=Item8（:32688）
          p.buffs.apply(BuffType.CompanionCube, 3600 / 60);
          const has = this.entities.projectiles.some((e) => e instanceof MinionProj && !e.dead && (e as MinionProj).projId === 653);
          if (!has) {
            const owner = p;
            const cube = new MinionProj(owner.cx, owner.cy, 653, 0, 0, false, 0, true,
              () => (owner.dead ? null : owner));
            cube.noSlot = true;
            this.entities.add(cube, 'projectiles');
          }
          p.useTime = 20;
          break;
        }
        case 1326: // 混乱之杖（Player.cs:44861-44913）
        case 5335: { // 和谐之杖（:44902+,type!=1326 直接 return=免费传送）
          // 1:1：首次传送**无任何代价**；ChaosState(88) 360t 每次使用刷新（:44913）；
          // buff 期内再传送 → statLife-=max/7 可致死（:44904-44912,死因 13 或 50%
          // 性别 14/15）+ lifeRegenCount/Time 清零（:44914-44915）。此前两处偏差已修：
          // 自造"首用扣 max/6"（原版无此代价）；混沌期"拒绝传送"（原版允许且扣血）。
          // 未移植注：LimitPointToPlayerReachable/AnyWallOfTypeOnLine(350)/丛林蜥蜴墙 87
          // 门（:44878-44892）——teleportToMouse 用就近落点 BFS（既有近似,传送药水等共用）
          this.teleportToMouse();
          if (pvid === 1326) {
            if (p.buffs.has(BuffType.ChaosState)) {
              const cost = Math.floor(p.maxHp / 7);           // :44904 C# 整除截断
              p.lastDamageCause = { kind: 'teleportFail' };    // :44905 ByOther(13) 默认
              if (Math.random() < 0.5) {                       // :44906-44908 Next(2)==0 → 性别支
                const fem = FEMALE_VARIANTS.includes(p.appearance?.skinVariant ?? 0);
                p.lastDamageCause = { kind: fem ? 'teleportFailFemale' : 'teleportFailMale' };
              }
              p.hp -= cost;                                    // 无下限——可致死（KillMe 语义）
              this.addDamageNumber(p.cx, p.y, cost, false, '#B040FF');
              p.lifeRegenTime = 0;                             // :44914-44915 再生清零
              if (p.hp <= 0) p.hp = 0;
            }
            p.buffs.apply(BuffType.ChaosState, 360 / 60);      // :44913 AddBuff(88,360)
          }
          p.useTime = 20;
          break;
        }
        case 1133: // 蜜蜂分泌物(:43181-43191):召唤蜂王(无门)
          this.summonBoss('queen_bee');
          consume(); p.useTime = 30;
          break;
        case 4988: // 史莱姆皇后水晶(:43210-43224):神圣区+夜晚
          if (!this.world.flags.hardMode || this.world.clock.isDay
            || !(this.scene?.zoneHallow)) {
            this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightHallowOnly') || '需困难模式神圣区夜晚');
          } else {
            this.summonBoss('queen_slime');
            consume();
          }
          p.useTime = 30;
          break;
        case 4829:
        case 4830:
        case 4910: {
          // 宠物许可证（Player.cs:44730-44745 ItemCheck_UsePetLicenses →
          // LicenseOrExchangePet :44720-44728 → NPC.UnlockOrExchangePet :81640+）：
          // ①首次使用 → bought* 置位 + 「已发送许可证」公告 + 消耗；
          // ②已购且宠物在场 → RerollVariation 换外观变体（变体系统未实装，公告备案）
          //   + 消耗；③已购但宠物不在场 → 不触发不消耗（LicenseOrExchangePet 门外）。
          // 使用动画/时长 = Item.cs:39512-39524（useStyle 4/consumable/useTime 45/Item92）
          const petOf: Record<number, [flag: string, pet: number, text: string]> = {
            4829: ['boughtCat', 637, 'Misc.LicenseCatUsed'],
            4830: ['boughtDog', 638, 'Misc.LicenseDogUsed'],
            4910: ['boughtBunny', 656, 'Misc.LicenseBunnyUsed'],
          };
          const [flagKey, petId, textKey] = petOf[pvid]!;
          const petHere = this.entities.npcs.some(
            (n) => n instanceof TownNPC && !n.dead && n.vanillaId === petId);
          if (!this.world.flags[flagKey] || petHere) {
            if (!this.world.flags[flagKey]) {
              this.world.flags[flagKey] = true;   // 入驻链门（Main.cs:65383-65391）
              this.newText(Lang.text(textKey) ?? '', 50, 125, 255);
            } else {
              // RerollVariationForNPCType → 本仓无 townNpcVariationIndex 变体系统，
              // 公告"换装失败"语义近似（原版换皮成功/失败二掷——备案）
              this.newText(Lang.text('Misc.PetExchangeFail') ?? '', 50, 125, 255);
            }
            consume();
          }
          p.useTime = 45;
          this.playSfxFiles(['Item_92'], 1, p.cx, p.cy);   // UseSound=Item92（:39520）
          break;
        }
        case 3601: { // 天界印记(:43348-43360)→WorldGen.StartImpendingDoom(720):月总倒计时
          const s = this.world.lunarEvent;
          s.moonLordCountdownMax = 720;
          s.moonLordCountdown = 720;
          this.sfx.playWav('roar');                    // SoundID 15（:43350，先于 StartImpendingDoom）
          this.newText(Lang.misc(52), 50, 255, 130);   // BroadcastText ChatColors.World
          consume(); p.useTime = 30;
          break;
        }
        default:
          break;
      }
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
        // ---- Celebration 双持械枪（3930 MK2 → 714 / 3475 派对机枪 → 615，AI_075
        //      :63959/:64072）：channel 持械 muzzle——每 volley（8t/5t）自行开火，
        //      弹道变体 = ⌊ai0/volley⌋%7 确定循环（出生相位 5×Next(0,20) 错开），
        //      弹药逐发解析与消耗（PickAmmo 每 volley 等价）。此前按逐点击 Arrow 打
        //      = 无变体循环/无持械节奏（2026-08-14 补）----
        const bowVid2 = bowVid >= 0 ? bowVid : (heldDef?.vid ?? -1);
        if (bowVid2 === 3930 || bowVid2 === 3475) {
          const mzId: 714 | 615 = bowVid2 === 3930 ? 714 : 615;
          const mzAlive = this.entities.projectiles.some(
            (e) => e instanceof Celeb2Muzzle && (e as Celeb2Muzzle).projId === mzId && !e.dead);
          if (!mzAlive) {
            const mzOwner = this.player;
            const mzItemId = ITEM_BY_KEY[heldDef.key];
            const mzBase = bowC?.damage ?? 50;
            const mzKb = bowC?.knockBack ?? 2;
            const muzzle = new Celeb2Muzzle(mzOwner, mzId,
              () => this.input.mouseHeld && !this.input.uiBlocking
                && mzOwner.inv.heldItem()?.id === mzItemId && !mzOwner.dead,
              () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
              (variant, fx, fy, fvx, fvy, fo) => {
                // 每 volley 再解析弹药（弹药栏 54-57 优先 → 背包 0-53）
                let mSlot = -1; let mDef: (typeof ITEM_DEFS)[number] | null = null;
                for (const [from, to] of [[54, 58], [0, 54]] as const) {
                  for (let i = from; i < to; i++) {
                    const sl = this.player.inv.slots[i];
                    if (!sl || sl.stack <= 0) continue;
                    const d2 = ITEM_DEFS[sl.id];
                    const am = d2 ? (d2.ammoId ?? (viIdFromKey(d2.key) >= 0 ? itemCombat(viIdFromKey(d2.key))?.ammo ?? 0 : 0)) : 0;
                    if (d2 && am === useAmmo) { mSlot = i; mDef = d2; break; }
                  }
                  if (mSlot >= 0) break;
                }
                if (!mDef) return false;                       // 无弹药 → muzzle Kill
                const mVid = viIdFromKey(mDef.key);
                const mC = itemCombat(mVid);
                const rKind2 = useAmmo === 97 ? 'bullet' as const : 'rocket' as const;
                const dmg2 = Math.round(mzBase * (ps?.dmg ?? 1) * this.player.rangedDamageMult(rKind2))
                  + (mC?.damage ?? 0);
                const kb2 = mzKb * (ps?.kb ?? 1) + (mC?.knockBack ?? 0);
                if (mzId === 714) {
                  // MK2：烟花弹 715-718（Specific 表解析），变体驱动弹道
                  const pid2 = resolveAmmoProjId(3930, mVid, useAmmo, bowC?.shoot, mC?.shoot);
                  const er2 = Game.EXPLODE_RADIUS[pid2] ?? 0;
                  const shots: Array<{ x: number; y: number; vx: number; vy: number }> =
                    [{ x: fx, y: fy, vx: fvx, vy: fvy }];
                  if (variant === 5) {                          // 三连 ±2π/80（:64163-64174）
                    for (const sgn of [-1, 1]) {
                      const r5 = fo.spreadRot(Math.PI * 2 * sgn / 80);
                      shots.push({ x: fx, y: fy, vx: r5.x, vy: r5.y });
                    }
                  }
                  for (const s of shots) {
                    const rk = new Celeb2Rocket(pid2, variant, s.x, s.y, s.vx, s.vy,
                      dmg2, kb2, fo.bonusAi1,
                      (ex, ey, edmg) => this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE),
                        edmg, er2, er2 > 0, 11, this.player.equipStats.armorPen + (ps?.arpen ?? 0), pid2));
                    rk.critChance = this.player.critChance('ranged') + (bowC?.crit ?? 0) + (mC?.crit ?? 0);
                    rk.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
                    this.entities.add(rk, 'projectiles');
                  }
                } else {
                  // 派对机枪：弹药自定型（默认 14）+ 每 7 轮附赠 616 彩带（+20 伤/×1.25 kb/速 8）
                  const pid2 = mC?.shoot && mC.shoot > 0 ? mC.shoot : 14;
                  const b1 = new Arrow(fx, fy, fvx, fvy, dmg2, kb2, pid2, null, {});
                  b1.critBonus = this.player.critChance('ranged') + (mC?.crit ?? 0);
                  b1.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
                  b1.frostEligible = true;
                  this.entities.add(b1, 'projectiles');
                  if (variant === 0) {                          // ⌊ai0/5⌋%7==0（:63989-63993）
                    const sp3 = 0.3926991 * Math.random() - 0.19634955;
                    const c3 = Math.cos(sp3), s3 = Math.sin(sp3);
                    const b2 = new Arrow(fx, fy, fvx * c3 - fvy * s3, fvx * s3 + fvy * c3,
                      dmg2 + 20, kb2 * 1.25, 616, null, {});
                    b2.critBonus = b1.critBonus;
                    b2.armorPen = b1.armorPen;
                    this.entities.add(b2, 'projectiles');
                  }
                }
                this.player.inv.removeAt(mSlot, 1);
                this.cb.onInventoryChanged();
                return true;
              });
            this.entities.add(muzzle, 'projectiles');
          }
          this.player.useTime = bowC?.useTime ?? rg?.speed ?? 6;
          this.useSwing(heldDef, Math.atan2(inp.mouseY - this.renderer.canvas.height / 2,
            inp.mouseX - this.renderer.canvas.width / 2));
          this.input.mouseDown = false;
          return;
        }
        // 弹药分道（Player.cs:3820 bowEffectiveDamage 拆分）：箭吃箭袋/射手/蘑菇矿箭头，
      // 弹/火箭吃对应蘑菇矿头；Archery 不再误伤枪械
      const rKind = bowC?.useAmmo === 97 ? 'bullet' : bowC?.useAmmo === 771 ? 'rocket' : bowC?.useAmmo === 283 ? 'other' : 'arrow';
      let damage = Math.round((bowC?.damage ?? rg?.damage ?? 1) * (ps?.dmg ?? 1) * this.player.rangedDamageMult(rKind)) + (ammoC?.damage ?? 0); // ⑥ pen 移 hit 时
        let knockback = (bowC?.knockBack ?? rg?.knockback ?? 2) * (ps?.kb ?? 1) + (ammoC?.knockBack ?? 0);
        if (isArrowKind && this.player.equipStats.quiver) knockback *= 1.1; // 箭袋击退 ×1.1（:52713）
        // ---- PickAmmo 弹型解析 1:1（Player.cs:52635-52668，resolveAmmoProjId）----
        let projId = resolveAmmoProjId(bowVid2, viIdFromKey(ammoDef.key), useAmmo, bowC?.shoot, ammoC?.shoot);
        if (bowVid2 === 3019 && projId === 1) projId = 485;   // 炼狱天弓：木箭→狱翼箭（:52660-52663）
        if (bowVid2 === 3052) projId = 495;                    // 暗影焰弓恒 495（:52664-52667）
        if (isArrowKind && this.player.equipStats.moltenQuiver && projId === 1) damage += 2; // 熔箭袋木箭→火矢+2（:52700，火矢 proj 换体从略）
        const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
        // 弓/枪面向鼠标（shoot>0 发射型同款 :46578）
        this.player.facing = Math.cos(ang) > 0 ? 1 : -1;
        const ax = this.player.cx + Math.cos(ang) * 14;
        const ay = this.player.cy - 4 + Math.sin(ang) * 14;
        // 回收掉落：仅木箭（原版燃烧箭 Kill 不掉；子弹/飞镖不可回收）
        const dropKey = projId === 1 ? ammoDef.key : null;
        // grav 按 AI_001 重力链规格（projGravSpec，2026-08-14 对账）：箭族默认
        // 15update 平飞后 +0.1/update 缓坠（终端 16）；子弹/光束 flag3 表直线 0；
        // 逐型档（172=0.085@17、267/478/479=0.075@20、5/639=0 等）。此前 projGravity
        // 对 aiStyle1 一律 0 = 箭完全不下坠（与原版抛物线轨迹不符）
        const gs = projGravSpec(projId);
        // ---- 发射器弹药族（aiStyle 16，AI_016 发射支 :44542-44911）：GrenadeProj
        //      fired 模式（无重力直线/火箭加速/雪人追踪/感应雷布防/撞块语义表），
        //      爆炸半径走 Kill :75260-75300 闸门表（I 型不毁地形，II/III/IV 毁）——
        //      此前误当 Arrow 打（无引信无爆炸直线飞）2026-08-14 修复 ----
        if (projectileData(projId)?.aiStyle === 16) {
          const er16 = Game.EXPLODE_RADIUS[projId] ?? 0;
          // 实体伤害盒 = Kill 尘爆盒半宽（tier1/2 22×22 / tier3-4 80×80，:74484/:74545）
          const hurtBox16 = (projId >= 139 && projId <= 144) || projId === 340 || projId === 341 ? 40 : 11;
          const rocket = new GrenadeProj(ax, ay,
            Math.cos(ang) * speed, Math.sin(ang) * speed,
            damage, 3600, projId,
            (ex, ey, edmg) => {
              this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE), edmg, er16, er16 > 0,
                hurtBox16, this.player.equipStats.armorPen + (ps?.arpen ?? 0), projId);
              // 液体火箭载荷（Kill :74051-74244 同 903-906 四分发）
              const payload16 = Game.BOMB_PAYLOAD[projId];
              if (payload16) {
                const painted = Game.spreadBombPayload(this.world.store, payload16,
                  Math.floor(ex / TILE), Math.floor(ey / TILE));
                if (painted > 0) this.sfxAt('splash', ex, ey);
              }
            });
          rocket.fired = true;
          this.entities.add(rocket, 'projectiles');
          // 段尾与 Arrow 路径共用（消耗→useTime→swing→音效→UI 刷新）
          const ammoVid16 = viIdFromKey(ammoDef.key);
          if (ammoVid16 !== 3103 && ammoVid16 !== 3104
            && !(((this.player.equipStats.ammoSave || this.player.buffs.has(BuffType.AmmoReservation)) && Math.random() < 0.2))) {
            this.player.inv.removeAt(ammoSlot, 1);
          }
          this.player.useTime = bowC?.useTime ?? rg?.speed ?? 30;
          this.useSwing(heldDef, ang);
          const usBow16 = itemUseSoundWav(bowVid2);
          if (usBow16) this.playSfxFile(usBow16);
          else this.sfx.play('gunShot');
          this.cb.onInventoryChanged();
          return;
        }
        const bowArrow = new Arrow(ax, ay, Math.cos(ang) * speed, Math.sin(ang) * speed,
          damage, knockback, projId, dropKey,
          { grav: gs.grav, gravDelay: gs.delay, grav2: gs.grav2, grav2At: gs.grav2At });
        bowArrow.frostEligible = true; // 冰霜盔甲引擎(ranged 门)
        // 暴击链（审计 §6）：rangedCrit(装备/套装/词缀67-68配饰/buff) + 武器&弹药 item.crit
        bowArrow.critBonus = this.player.critChance('ranged')
          + (itemCombat(bowVid2)?.crit ?? 0) + (ammoC?.crit ?? 0) + (ps?.crt ?? 0); // ⑧ 词缀 crt
        bowArrow.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0); // ⑥+⑧ 词缀 arpen
        this.entities.add(bowArrow, 'projectiles');
        // ⑤ 霰弹族多弹丸（Player.cs:47326-47356/47539-47551）：爆管 534 rand(4,6) 发
        // 散布±40×0.05；霰弹枪 964 rand(3,5) ±35×0.04；四管 4703 固定 8 发（同散布，
        // 原版含 π/2 旋转向扰动近似取同表）——此前全族单发化 DPS 差 3-8 倍
        {
          const sg = SHOTGUN_PELLETS[bowVid2];
          if (sg) {
            const n = sg[0] < sg[1] ? sg[0] + Math.floor(Math.random() * (sg[1] - sg[0] + 1)) : sg[0];
            for (let i2 = 1; i2 < n; i2++) {
              const pvx = Math.cos(ang) * speed + (Math.random() * 2 * sg[3] - sg[3]) * sg[2] * 20;
              const pvy = Math.sin(ang) * speed + (Math.random() * 2 * sg[3] - sg[3]) * sg[2] * 20;
              const pa = new Arrow(ax, ay, pvx, pvy, damage, knockback, projId, null,
                { grav: gs.grav, gravDelay: gs.delay, grav2: gs.grav2, grav2At: gs.grav2At });
              pa.critBonus = bowArrow.critBonus;
              this.entities.add(pa, 'projectiles');
            }
          }
        }
        // 弹药节约（ammoCost80：20% 概率不耗弹——蘑菇矿胸甲族，Player.PickAmmo 语义）
        // 无尽袋(3103 箭袋/3104 弹药袋) consumable=false 恒不耗(Item.cs:8232;
        // 旧实现无条件 removeAt 致无尽袋被逐发吞尽,2026-08-13 修)
        const ammoVid = viIdFromKey(ammoDef.key);
        if (ammoVid !== 3103 && ammoVid !== 3104
          && !(((this.player.equipStats.ammoSave || this.player.buffs.has(BuffType.AmmoReservation)) && Math.random() < 0.2))) {
          this.player.inv.removeAt(ammoSlot, 1);
        }
        this.player.useTime = bowC?.useTime ?? rg?.speed ?? 30;
        // useStyle 5（弓枪族恒 5）：朝鼠标静持姿势 + 身体行档（Player.cs:46708 itemRotation=瞄准角）
        this.useSwing(heldDef, ang);
        // 发射音（原版 Item.cs UseSound）：弓（useAmmo 40）=Item_5；枪械通用=Item_11；
        // 霰弹枪族 534/964/3788/4703=Item_36；手枪族 164/219/1255/1929/2269/2270=Item_41
        // （Item_36/41 此前登记"素材未提取"，现已落位 public/sounds/——销核）
        const usBow = itemUseSoundWav(bowVid);
        if (usBow) this.playSfxFile(usBow);   // UseSound 覆盖（弩 Item_98 等）
        else this.sfx.play(useAmmo === AMMO_ARROW ? 'bowShoot'
          : GUN_SHOTGUN_VIDS.has(bowVid) ? 'gunShotgun'
          : GUN_HANDGUN_VIDS.has(bowVid) ? 'gunHandgun' : 'gunShot');
        this.cb.onInventoryChanged();
      }
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && cw && cw.kind !== 'melee'
      && ((cw as { autoReuse?: boolean }).autoReuse || (inp.mouseDown && !this._prevMouseDown))) { // ⑩ autoReuse 门
      // vi_* 数据驱动武器（1456 aiStyle 家族）：回旋镖/长矛/悠悠球/连枷/手雷/魔法/直射兜底。
      // 必须排在 thrownCombat 之前——手雷(166 等)满足投掷判定但语义是 ai16 弹跳引信
      this.useCombatWeapon(cw, heldDef);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0 && thrownCombat(heldDef)
      && (itemCombat(heldDef.vid ?? viIdFromKey(heldDef.key))?.autoReuse || (inp.mouseDown && !this._prevMouseDown))) { // ⑩
      // 消耗型投掷武器（手里剑/飞刀/毒刀等，Item.shoot + consumable + noMelee 且无 useAmmo）：
      // 朝鼠标投出 item.shoot 投射物，消耗 1 个，数值全取 vanilla-itemcombat.json；
      // 投射物复用 Arrow（重力 0.3/tick = 原版 aiStyle 2 抛物线同值；命中可回收）
      const tc = thrownCombat(heldDef)!;
      const vid = heldDef.vid ?? viIdFromKey(heldDef.key);
      const c = itemCombat(vid);
      const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
      // 投掷（shuriken 等 shoot>0）面向鼠标同款 :46578
      this.player.facing = Math.cos(ang) > 0 ? 1 : -1;
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
        // ★伤害对账修正：投掷族是 ranged（手里剑 42/投刀 279/毒刀 287 I:1851-1868
        // ranged=true；277 是长矛非手里剑——曾误认）乘区=远程链×词缀（审计 §5）；
        // ⑥ armorPen 移 hit 时（hurt 第 5 参减防语义），磨刀不适用投掷
        const psT = this.heldPrefixStat();
        const dmgT = Math.max(1, Math.round(tc.damage * (psT?.dmg ?? 1) * this.player.damageMult('ranged')));
        let pen = projectileData(tc.shoot)?.penetrate ?? 1;
        if (pen < 0) pen = 6;
        pen = Math.max(1, Math.min(pen, 6));
        // 物理档 = aiStyle 2 投掷族默认档（Projectile.cs:21955-21977）：前 20t
        // 平飞 → vy+0.4/vx×0.97/tick，终端 32；全体翻滚（:21508），刀族
        // （48/54/93/520/599）平飞期姿态锁定 atan2（:21971-21972）。此前误用
        // 箭矢档（出生即 0.3 重力/无阻力/终端 16）→ 投掷距离偏短
        const THROWN_POSE_LOCK = new Set([48, 54, 93, 520, 599]);
        // 燃烧瓶 2590→399：aiStyle 68 弹跳瓶体，死亡裂开 6 朵火云（:70889-70928）。
        //  火云 = Arrow(bounce 弹跳、穿透 3、360t、grav 0.1) + 命中 OnFire（:10850-10852）
        if (tc.shoot === 399) {
          const mol = new MolotovProj(px, py,
            Math.cos(ang) * (c?.shootSpeed ?? 9), Math.sin(ang) * (c?.shootSpeed ?? 9), dmgT,
            (fx, fy, fdmg, fvx, fvy) => {
              const fire = new Arrow(fx - 7, fy - 7, fvx, fvy, fdmg, 0,
                400 + Math.floor(Math.random() * 3), null,
                { grav: 0.1, life: 360, pierce: 3, bounce: true });
              fire.ignite = true; // 命中 OnFire rand(3,7)s（:10850——Arrow.ignite 5s 档）
              fire.critBonus = this.player.critChance('ranged') + (psT?.crt ?? 0);
              fire.armorPen = this.player.equipStats.armorPen + (psT?.arpen ?? 0);
              this.entities.add(fire, 'projectiles');
            });
          this.entities.add(mol, 'projectiles');
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.player.useTime = c?.useTime ?? 15;
          this.playUseSound(vid, 'throw');
          this.cb.onInventoryChanged();
          this.input.mouseDown = false;
          return;
        }
        const thrownArrow = new Arrow(px, py,
          Math.cos(ang) * (c?.shootSpeed ?? 9), Math.sin(ang) * (c?.shootSpeed ?? 9),
          dmgT, (c?.knockBack ?? 0) * (psT?.kb ?? 1), tc.shoot, heldDef.key,
          { pierce: pen, grav: 0.4, gravDelay: 20, drag: 0.97, maxFall: 32, tumble: true, tumblePoseLock: THROWN_POSE_LOCK.has(tc.shoot) });
        thrownArrow.frostEligible = true; // 投掷并入 melee(:93712 门含 melee)
        thrownArrow.critBonus = this.player.critChance('ranged') + (c?.crit ?? 0) + (psT?.crt ?? 0); // 审计 §6 + ⑧ crt；投掷=ranged 族（§5）
        thrownArrow.armorPen = this.player.equipStats.armorPen + (psT?.arpen ?? 0); // ⑥+⑧
        this.entities.add(thrownArrow, 'projectiles');
      }
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.player.useTime = c?.useTime ?? 15;
      this.playUseSound(vid, 'throw');
      this.cb.onInventoryChanged();
    } else if (heldDef && [70, 1331, 560].includes(viIdFromKey(heldDef.key))
      && inp.mouseDown && this.player.useTime === 0) {
      // Boss 召唤物(原版 Worm Food 70/Bloody Spine 1331/Slime Crown 560)
      // 群系门（Player.cs:43107-43121/:43194-43208）：蠕虫食物需 ZoneCorrupt、
      // 血腥脊椎需 ZoneCrimson——群系外整支不生效（不消耗/不进 useTime/无音效，
      // 原版 if 内才 ApplyItemTime）；史莱姆王冠无门
      const svid = viIdFromKey(heldDef.key);
      const scene = this.scene;
      const zoneOk = svid === 70 ? (scene == null || scene.zoneCorrupt)
        : svid === 1331 ? (scene == null || scene.zoneCrimson) : true;
      if (zoneOk) {
        const summoned = svid === 70 ? this.summonBoss('eater_of_worlds_head')
          : svid === 1331 ? this.summonBoss('brain_of_cthulhu')
            : this.summonBoss('king_slime');
        // 门拦下（同型 Boss 在场/访客）不消耗——原版 SpawnOnPlayer 失败不回滚物品，
        // 本仓以"召唤成功才扣"为准（审计 2026-08-13）
        if (summoned) {
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.player.useTime = 60;
          this.cb.onInventoryChanged();
        }
      }
      this.input.mouseDown = false;
    } else if (heldDef && [556, 544, 557].includes(viIdFromKey(heldDef.key))
      && inp.mouseDown && this.player.useTime === 0) {
      // 机械三王召唤物（原版 556/544/557，Player.cs:43117-43179 ItemCheck_：
      //  门仅 !IsItDay()——**无 hardMode 门**，困难模式前的夜晚原版即可召唤
      //  （系统语义如此,1:1 保留;此前多挂的 hardMode 合取已删）。
      //  白天静默不可用（同原版不消耗））
      if (this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      } else {
        const mvid = viIdFromKey(heldDef.key);
        if (mvid === 556) this.summonBoss('destroyer');
        else if (mvid === 544) this.summonBoss('twins');
        else this.summonBoss('skeletron_prime');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && viIdFromKey(heldDef.key) === 5120
      && inp.mouseDown && this.player.useTime === 0) {
      // 鹿角怪召唤物 Deer Thing（Player.cs:43225-43237：门仅 ZoneSnow——无昼夜门；
      //  成功 → ApplyItemTime(45) + Roar(:43229) + SpawnOnPlayer(668) → 公告走表）。
      //  非雪原【静默】不可用（原版 ZoneSnow 合取外整支不生效，不消耗无提示）
      if (this.scene?.zoneSnow) {
        this.summonBoss('deerclops');
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 45;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && BOSS_BAG_IDS.has(viIdFromKey(heldDef.key))
      && inp.mouseDown && this.player.useTime === 0) {
      // 宝藏袋开包（Player.OpenBossBag :6828-7520 全 19 袋,数据驱动引擎
      // data/vanillaBossBags.ts:概率门/大师门/武器 switch/猩红三元/去重双随机/
      // 月总十选二 + 共享尾段按 boss value 附赠钱币——旧仅世花 3328 手写一例,
      // 专家袋整层不可开,2026-08-13 修）
      {
        const px = this.player.cx, py = this.player.cy;
        openBossBag(viIdFromKey(heldDef.key), (id, n) => {
          const k = VANILLA_ITEM_KEY_BY_ID[id];
          if (k) this.spawnDrop(px, py, k, n ?? 1, 0, -2);
        }, {
          masterMode: mainMasterMode(this.world),
          crimson: this.world.crimson,
          extraAccessory: this.player.inv.extraAccessory,
          hasItem: (id) => { const iid = invIndexOfVanilla(id); return iid >= 0 && this.player.inv.countOf(iid) > 0; },
        });
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && viIdFromKey(heldDef.key) === 3384
      && inp.mouseDown && this.player.useTime === 0) {
      // 传送门枪（Item.cs:30926-30942：useTime 20 / autoReuse / channel / UseSound=null /
      // 不消耗；左键 form 0 橙门）。弹体 PortalGunBolt（601，extraUpdates=30 近瞬达）
      const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2,
        inp.mouseX - this.renderer.canvas.width / 2);
      this.player.facing = Math.cos(ang) > 0 ? 1 : -1;      // :46578 发射型面向鼠标
      this.entities.add(firePortalGun(this.player, ang, 0), 'projectiles');
      this.useSwing(heldDef, ang);                          // useStyle5 静持（原版由 600 holdout 画枪，持物近似）
      this.player.useTime = 20;
      this.input.mouseDown = false;
      this.cb.onInventoryChanged();
    } else if (heldDef && heldDef.key === 'vi_2767_solar_tablet'
      && inp.mouseDown && this.player.useTime === 0) {
      // 日耀碑牌（Player.cs:43308-43328/51431：dayTime && !eclipse && hardMode 才可用，
      // 成功 → Main.eclipse=true + Lang.misc[20] 公告；非白天/已日食/肉前静默不可用——
      // 门判定与公告在 world/Eclipse.ts useSolarTablet）
      if (useSolarTablet(this.world, this.eclipseHost())) {
        this.sfx.playWav('roar');   // SoundID 15（Player.cs:43310，成功即 Roar）
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.cb.onInventoryChanged();
      } else if (!this.world.clock.isDay) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      }
      this.input.mouseDown = false;
    } else if (heldDef && viIdFromKey(heldDef.key) >= 1874 && viIdFromKey(heldDef.key) <= 1905
      && inp.mouseDown && this.player.useTime === 0
      && this.world.store.get(tx, ty) === TILE_BY_KEY['v_171_christmas_tree'] && this.inTileRange(tx, ty)) {
      // 圣诞树装饰 32 件（1874-1877 树顶饰/1878-1883 花环/1884-1894 彩球/1895-1905
      // 串灯；Item.cs:20610-20652 consumable 但装饰不消耗——PlaceThing_XMasTreeTops
      // :41053-41136 无扣减）。门 = 目标格是圣诞树 + 射程（:41055）；
      // 同槽同款不动作（:41063 checkXmasTreeDrop != type 才 ApplyItemTime+换装）
      {
        const dec = xmasDecorOfItem(viIdFromKey(heldDef.key))!;
        const cell = xmasCell(this.world.store, tx, ty);
        if (cell) {
          const cur = xmasDecorStyle(this.world.store, cell.ax, cell.ay, dec.obj);
          if (cur !== dec.style) {
            if (cur > 0) {   // dropXmasTree :39396-39426：旧装饰物掉落回收
              const oldKey = VANILLA_ITEM_KEY_BY_ID[xmasDecorItem(dec.obj, cur)];
              if (oldKey) this.spawnDrop(tx * TILE + 8, ty * TILE, oldKey, 1, 0, -2);
            }
            xmasSetDecor(this.world.store, cell.ax, cell.ay, dec.obj, dec.style);   // setXmasTree :39430
            this.player.useTime = 10;                                  // ApplyItemTime（useTime 10）
          }
        }
      }
      this.input.mouseDown = false;
    } else if (heldDef && [361, 602, 1315].includes(viIdFromKey(heldDef.key))
      && inp.mouseDown && this.player.useTime === 0) {
      // 入侵触发物品（Player.ItemCheck_UseEventItems，Player.cs:43243/43260/43277：
      // 战旗 ignoreDelay，成功才消耗；Goblin Battle Standard 361/Snow Globe 602/Pirate Map 1315）。
      // ★门 = Main.CanStartInvasion(:63863)：无进行中 + 生命上限≥200——**无昼夜门**
      // （海盗地图白天可用，"夜间使用"是常见误传；goTo 下发 -1/-2/-3 三类）
      const ivid = viIdFromKey(heldDef.key);
      const type = ivid === 361 ? INVASION_GOBLIN
        : ivid === 602 ? INVASION_SNOW_LEGION : INVASION_PIRATE;
      if (this.startInvasionAndAnnounce(type, true)) {
        this.sfx.playWav('roar');                     // SoundID 15（:43246/:43263/:43280）
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = itemCombat(ivid)?.useTime ?? 45;  // ApplyItemTime（三件均 45）
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef && viIdFromKey(heldDef.key) === 5644
      && inp.mouseDown && this.player.useTime === 0) {
      // 5644 占卜球（Item.cs:44324-44333：useStyle 15 HoldOrb/holdStyle 8/useTime 100,
      //  不消耗）。Player.ItemCheck :43011-43030：动画首帧 AnyoneToSpectate() 有目标 →
      //  关 UI + Item197 + 观战下一玩家；无目标 → Item198 + Game.SpectateSinglePlayer。
      //  ★观战镜头系统未实装（引擎级缺口,见 docs 登记）——本仓恒走"无目标"支：
      //  音效+聊天文案 1:1,不消耗不入 CD 之外的行为
      this.playSfxFile('Item_198');
      this.newText(Lang.text('Game.SpectateSinglePlayer'), 255, 240, 20);  // ChatColors.ServerMessage
      this.player.useTime = itemCombat(5644)?.useTime ?? 100;              // ApplyItemTime
      this.input.mouseDown = false;
    } else if (heldDef && viIdFromKey(heldDef.key) === 5334
      && inp.mouseDown && this.player.useTime === 0) {
      // 5334 奥库瑞姆剃刀（Item.cs:42276-42287：getfixedboi 秘密种子召唤物,
      //  consumable/useTime 45）。Player.cs:43173-43180 → NPC.SpawnMechQueen :19724-19750：
      //  门①场上有任一机械 Boss(127/125/126/134)→false；门②SpecialSeedFeatures.Mechdusa
      //  （= remixWorld && getGoodWorld,SpecialSeedFeatures.cs 亲核）→ 成功才
      //  ApplyItemTime + SoundID 15 + mechQueen 链召唤（127 主 + 125/126/134 + 2×139 探针
      //  同点,公告 LegacyMisc[107] "机械美杜莎已苏醒!"——SpawnBoss :81492-81496）。
      //  mechQueen 联动 AI 已实装（bossAI.ts mech 分支+蛇发绘制+蛇发段链压缩）;
      //  本仓 getfixedboi 解析不置 remix（SeedEasterEggs）,门以 everything 兜底
      const mechActive = anyMechBossUp(this.entities.enemies);
      const sf = this.world.seedFlags ?? {};
      const mechdusaWorld = (!!sf.remix && !!sf.getGoodWorld) || !!sf.everything;
      if (mechActive) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
      } else if (mechdusaWorld && this.summonMechdusa()) {
        this.sfx.playWav('roar');                          // SoundID 15（:43178）
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = itemCombat(5334)?.useTime ?? 45;
        this.cb.onInventoryChanged();
      }
      // 非 Mechdusa 世界静默不可用（原版 SpawnMechQueen false → 无 ApplyItemTime 无消耗）
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
        this.sfx.playWav('roar');   // SoundID 15（:43297 南瓜 / :43364 霜月，成功即 Roar）
        if (ann) this.newText(invasionWaveText(ann), 175, 75, 255);
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 45;
        this.cb.onInventoryChanged();
      }
      this.input.mouseDown = false;
    } else if (heldDef?.magic && inp.mouseDown && this.player.useTime === 0) { // 原生 magic 无 autoReuse 字段，维持连发
      // 魔法武器:消耗 mana → 发射魔法弹(Player.ItemCheck_Shoot 语义)
      const mg = heldDef.magic;
      // 魔力花族：耗魔 -8%（manaCost -= 0.08，Player.cs:14040）；不足时自动喝蓝
      // 魔力花族 -8% + 丛林套 manaCostMul（:14040 / :15878）
      // ⑪+⑧ 词缀 mcst（I:562 round——cw 链 5374 已接,此 mg 直射链 2026-08-13 补）
      const psM = this.heldPrefixStat();
      const mgCost = Math.trunc(Math.round(mg.manaCost * (psM?.mcst ?? 1))
        * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul);
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
        // 贴图化:vi_ 物品带原版 shoot 时按弹型贴图绘制(缺省 0 = 圆点兜底,同旧观感)
        const mpVid = viIdFromKey(heldDef.key);
        const proj = new MagicProj(mx, my, Math.cos(ang) * mg.projSpeed, Math.sin(ang) * mg.projSpeed, mg.damage, 45, color,
          mpVid >= 0 ? (itemCombat(mpVid)?.shoot ?? 0) : 0);
        this.entities.add(proj, 'projectiles');
        this.player.useTime = mg.speed;
        this.player.onManaItemUsed(); // 用魔动画窗（manaRegenDelay 重置期，:42131-42137）
        // 法杖 useStyle 5：朝鼠标静持姿势（Player.cs:46708 itemRotation=瞄准角）
        this.useSwing(heldDef, ang);
        this.sfx.play('tink');
        this.input.mouseDown = false;
      }
    } else if (heldDef && TELEPORT_ITEM_VIDS.has(viIdFromKey(heldDef.key))
      && inp.mouseDown && this.player.useTime === 0) {
      // ---- 传送族使用（Player.cs:42297-42516 汇总）----
      // 魔镜族 {50,3124,3199,5358}/贝壳手机出生点 5359：引导 useTime 90,半程 Spawn(RecallFromItem);
      // 回忆药水 2350:起始 SoundID.Item3 饮用音+青尘,itemTime==20 时 UseSound+双 70 尘+保留无敌帧+消耗;
      // 传送药水 2351:itemTime==2 随机传送+消耗;海螺族 4263/5360 海洋、4819/5361 地狱:螺旋水尘+半程传送
      const tvid = viIdFromKey(heldDef.key);
      const useTime = itemCombat(tvid)?.useTime ?? 90;
      const kind: RecallKind = tvid === 4263 || tvid === 5360 ? 'ocean'
        : tvid === 4819 || tvid === 5361 ? 'hell' : 'spawn';
      const triggerAt = tvid === 2350 ? 20 : tvid === 2351 ? 2 : Math.floor(useTime / 2);
      this.player.useTime = useTime;                    // ApplyItemTime
      this.player.itemAnimTicks = useTime;              // 引导姿势(useStyle 4/6/9 holdup)
      this.recallChannel = { vid: tvid, kind, triggerAt, consume: tvid === 2350 || tvid === 2351 };
      if (tvid === 2350) {
        this.sfx.play('drink');                         // SoundID.Item3(:42432)
        this.recallDust(this.player, 10);               // 10 青尘(:42434)
      } else {
        // 标准使用音:魔镜族/贝壳手机 Item6、海螺族 Item64(Item.cs UseSound)
        this.sfx.play(kind === 'spawn' ? 'mirror' : 'conch');
      }
      this.input.mouseDown = false;
    } else if (heldDef && [205, 206, 207, 1128, 3031, 3032, 4820, 4872, 5302, 5303, 5304, 5364]
      .includes(viIdFromKey(heldDef.key)) && inp.mouseDown && this.player.useTime === 0) {
      // 桶/海绵族入口门（Player.cs:45706 族表 + :45715 ItemTimeIsZero && controlUseItem）：
      // 原分支无 mouseDown/useTime 门——持桶悬停即每帧倾倒;本次补齐(autoReuse 族
      // 按住连倒是原版语义,门由 useTime 节流)
      this.useBucket(viIdFromKey(heldDef.key), tx, ty);
    } else if (heldDef && inp.mouseDown && this.player.useTime === 0) {
      // ---- 高尔夫球投掷（物品 3989/染色彩蛋 4242-4253 → proj 721/739+）：
      //      Player.cs:46884-46906 三分支——|光标-中心|<100px → 球座自动摆球；
      //      >100px 或无视线 → 以 shootSpeed 12 射向光标；否则原地落球。
      //      不消耗（DefaultToGolfBall :35420-35436 无 consumable；球为可复用弹体）
      const bm = /^vi_(\d+)_/.exec(heldDef.key);
      const bvid = bm ? +bm[1] : 0;
      if (bvid === 3989 || (bvid >= 4242 && bvid <= 4253)) {
        const projId = bvid === 3989 ? 721 : 739 + (bvid - 4242);
        const [mwx, mwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
        const dx = mwx - this.player.cx, dy = mwy - this.player.cy;
        const dist = Math.hypot(dx, dy);
        let placed = false;
        if (dist < 100) {                                   // :46893-46894
          placed = this.tryPlacingGolfBallNearTee(mwx, mwy, mwx, mwy);
        }
        if (!placed) {                                      // :46896
          if (dist > 100 || !canHit(this.world.store, this.player.cx, this.player.cy, 1, 1,
            mwx, mwy, 1, 1)) {                              // :46901 Collision.CanHit
            // 射向光标：normalize(d)×shootSpeed 12（DefaultToGolfBall :35423）
            const n = dist || 1;
            this.spawnGolfBall(this.player.cx, this.player.cy, projId, false,
              (dx / n) * 12, (dy / n) * 12);                // :46902-46903
          } else {
            this.spawnGolfBall(mwx, mwy, projId, false, 0, 0);  // :46905-46906 原地落球
          }
        }
        this.player.useTime = 15;   // useTime/useAnimation 15（:35427-35428）
        this.sfx.play('throw', 1, this.player.cx, this.player.cy); // UseSound Item1（:35426）
        this.input.mouseDown = false;
      }
      // ---- 高尔夫哨 4095（Item.cs:35739-35749：useStyle 4/useTime 10/UseSound Item128；
      //      Player.cs:42921-42924 itemAnimation==2 → ResetGolfBall：球回退上一击点+1 杆）
      else if (bvid === 4095) {
        this.player.useTime = 10;                 // useTime=useAnimation=10（:35743-35744）
        this.player.itemAnimTicks = 10;           // useStyle 4 举持姿势
        this.golfWhistleAt = 8;                   // itemAnimation==2（10-2）
        this.sfx.play('tink', 0.7, this.player.cx, this.player.cy); // UseSound Item128
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
          this.sfx.playWav('roar');   // SoundID 15 Roar（:43331——旧 throw=Item_1 误映射已正）
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
          let baitSlot = -1, baitPower = 0, baitVid = 0;
          for (let i = 0; i < this.player.inv.slots.length; i++) {
            const sl = this.player.inv.slots[i];
            if (!sl) continue;
            const dm = /^vi_(\d+)_/.exec(ITEM_DEFS[sl.id].key);
            const df = dm ? itemFuncOfVid(+dm[1]) : null;
            if (df?.bait && dm) { baitSlot = i; baitPower = df.bait; baitVid = +dm[1]; break; }
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
            bob.baitVid = baitVid;          // IsLavaBait 三源判定用（Projectile.cs:19230）
            // 弹型 = 浮漂饰品覆写优先（ItemCheck :46551-46553：fishingPole>0 且
            // overrideFishingBobber>-1 → projToShoot = 覆写值），否则竿自带 shoot
            bob.projId = this.player.equipStats.overrideFishingBobber > -1
              ? this.player.equipStats.overrideFishingBobber
              : bobberProjIdFor(bob.poleVid);
            this.entities.add(bob, 'projectiles');
            this.sfx.play('throw');
            // 成就：抛竿（Player.cs:48652 HandleSpecialEvent(7) → THROWING_LINES）
            this.achievements.handleSpecialEvent(7,
              { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
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

  /** 870 族 ProjLight 穿墙播光（Projectile.cs:487-495 + Utils.FloodFillTile :2516
   *  + DelegateMethods.SpreadLightOpen_StopForSolids :805）：从弹心 BFS 半径 4.5，
   *  delegate 语义 = 内容格(type!=0，含致动块)/平台/非实心 → 播光并扩展邻居；
   *  空气格不播不扩展（光沿实心侧渗入墙内）；尾段对弹心格恒播一次（:494） */
  private addProjFloodLight(tx: number, ty: number, r: number, g: number, b: number): void {
    const st = this.world.store;
    this.lighting.addLight(tx, ty, r, g, b);
    if (!st.inBounds(tx, ty)) return;
    const MAXD = 4.5, RING = Math.ceil(MAXD) + 1;
    const seen = new Set<number>([st.idx(tx, ty)]);
    let cur = [st.idx(tx, ty)];
    while (cur.length) {
      const nxt: number[] = [];
      for (const i of cur) {
        const x = i % st.w, y = (i / st.w) | 0;
        const d = TILE_DEFS[st.type[i]];
        const expand = st.type[i] !== 0 || !!d?.platform || !(d?.solid ?? false);
        if (!expand) continue;   // 空气格：不播光不扩展
        this.lighting.addLight(x, y, r, g, b);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < tx - RING || nx > tx + RING || ny < ty - RING || ny > ty + RING) continue;
          if (Math.hypot(nx - tx, ny - ty) > MAXD) continue;   // delegate 距离门（:807-810）
          if (!st.inBounds(nx, ny)) continue;
          const ni = st.idx(nx, ny);
          if (seen.has(ni)) continue;
          seen.add(ni);
          nxt.push(ni);
        }
      }
      cur = nxt;
    }
  }

  private useCombatWeapon(cwIn: Exclude<CombatWeapon, { kind: 'melee' }>, def: (typeof ITEM_DEFS)[number]) {
    const inp = this.input;
    const ang = Math.atan2(inp.mouseY - this.renderer.canvas.height / 2, inp.mouseX - this.renderer.canvas.width / 2);
    const px = this.player.cx + Math.cos(ang) * 14;
    const py = this.player.cy - 4 + Math.sin(ang) * 14;
    // 发射型武器使用期间面向鼠标（ItemCheck_Shoot :46578-46590：num=Dot(朝向轴,瞄准向)
    // >0→1 否则 −1；全 itemAnimation 每 useTime tick 重评。723/3611 豁免（:46563））。
    // ★纯近战阔剑不在此列——挥砍期间方向锁定（:19546-19556 useTurn 门）
    this.player.facing = Math.cos(ang) > 0 ? 1 : -1;
    const consume = () => {
      this.player.inv.removeAt(this.player.inv.selected, 1);
      this.cb.onInventoryChanged();
    };
    // 词缀乘区（Item.Prefix :551-557）：damage=round(×dmg)、knockBack×kb——
    // 手雷兜底下限在乘区后取 max，与原版（damage 先乘再判 0）一致；
    // 装备全系伤害乘区（徽章/险恶词缀等）：近战族=melee、魔法=magic、其余=ranged。
    // ★'shot' 兜底里的 melee+noMelee 件（636 破晓/707 天龙之怒——SetDefaults
    //  melee=true）原版走 meleeDamage 乘区，勿笼统归 ranged
    const ps = this.heldPrefixStat();
    const dmgKind = cwIn.kind === 'magic' ? 'magic'
      : (cwIn.kind === 'boomerang' || cwIn.kind === 'spear' || cwIn.kind === 'yoyo' || cwIn.kind === 'flail'
        || (cwIn.kind === 'shot' && !!itemCombat(def.vid ?? viIdFromKey(def.key))?.melee))
        ? 'melee' as const : 'ranged' as const;
    const cw = {
      ...cwIn,
      damage: Math.max(1, Math.round(cwIn.damage * (ps?.dmg ?? 1) * this.player.damageMult(dmgKind))), // ⑥ pen 移 hit 时
      knockback: cwIn.knockback * (ps?.kb ?? 1),
      // ⑧ 词缀乘区出口统一折算（I:558-568）：shtspd→shootSpeed、spd→useTime（I:561）
      shootSpeed: ((cwIn as { shootSpeed?: number }).shootSpeed ?? 0) * (ps?.shtspd ?? 1),
      useTime: Math.max(1, Math.round(((cwIn as { useTime?: number }).useTime ?? 0) * (ps?.spd ?? 1))),
    };
    // GetWeaponCrit（Player.cs:42531 族）= 4 基础 + 武器 item.crit + 装备/buff——
    // 投射物近战四族此前写死 4%（Sunfury item.crit=7 原版应 11%）
    const critVid = def.vid ?? viIdFromKey(def.key);
    const critTotal = 0.04 + (itemCombat(critVid)?.crit ?? 0) / 100
    // 成就：蜜蜂套装持蜂枪使用（Player.cs:16060-16069 → event 3 NOT_THE_BEES：
    // head 160 + body 168 + legs 103 且 itemAnimation 中挥动 1121 BeeGun）
    if (critVid === 1121) {
      const b0 = this.player.inv.armor[0], b1 = this.player.inv.armor[1], b2 = this.player.inv.armor[2];
      if (b0 && b1 && b2
        && statOfInternal(b0.id)?.hs === 160 && statOfInternal(b1.id)?.bs === 168
        && statOfInternal(b2.id)?.ls === 103) {
        this.achievements.handleSpecialEvent(3,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
      }
    }
      + this.player.critChance(dmgKind === 'magic' ? 'magic' : dmgKind === 'ranged' ? 'ranged' : 'melee') / 100
      + (ps?.crt ?? 0) / 100; // ⑧ 词缀 crt（I:566 crit+=crt）
    // 使用姿势（Player.ItemCheck：itemAnimation>0 期间持物可见）。
    // ★ spear/yoyo/flail/boomerang 族源码 noUseGraphic=true（DefaultToSpear :47637 等
    //   202 处）——投射物即本体，挥动再画持物会重影，这四族不加 swing
    if (cw.kind === 'grenade' || cw.kind === 'magic' || cw.kind === 'shot' || cw.kind === 'summon') {
      this.useSwing(def, ang);
    }
    switch (cw.kind) {
      case 'grenade': {
        // AI_016 引信 timeLeft 1:1（SetDefaults :10348-10372）：炸弹 28=180 / 炸药棍
        // 29=300 / 手雷 30=180——曾误写 150/135（引信时长与原版不符的根源）
        // 引信 1:1（SetDefaults :10348-10408）：炸药棍族 {29,470,637}=300,余 180
        const fuse = cw.shoot === 470 || cw.shoot === 637 || cw.shoot === 29 ? 300 : 180;
        // 爆炸伤害（PrepareBombToBlow :44134-44145）：炸弹族 {28,37,516}=100 /
        // 炸药棍族 {29,470,637}=250；手雷族 {30,397,517} 用物品伤害（不低于 60）；
        // 液体/土制炸弹族 {903-906,910,911}=100（:44188-44196 damage=100 显式赋值）
        const isFluidDirt = (cw.shoot >= 903 && cw.shoot <= 906) || cw.shoot === 910 || cw.shoot === 911;
        const dmg = cw.shoot === 28 || cw.shoot === 37 || cw.shoot === 516 ? 100
          : cw.shoot === 29 || cw.shoot === 470 || cw.shoot === 637 ? 250
            : isFluidDirt ? 100
              : Math.max(cw.damage, 60);
        // 地形破坏半径（Projectile.cs:75262 表）：炸弹族28/37/516/519=4、炸药棍族
        // 29/470/637=7；**手雷族(30 等)与液体/土制炸弹族均不在 ExplodeTiles 判定表内
        // =不破坏地形**（后者的"地形效果"走爆炸尾段的液体/泥土 flood-fill 载荷）
        const er = Game.EXPLODE_RADIUS[cw.shoot] ?? 0;
        // 实体伤害盒(PrepareBombToBlow Projectile.cs:44125-44220,非 Kill 还原图):
        // 炸弹族 128×128 盒半宽 64 / 炸药棍族 250×250 半宽 125 / 手雷 22×22 半宽 11 /
        // 液体/土制炸弹族 48×48 半宽 24（:44195-44196）
        // ——与地形破坏半径【无关】;旧值 11/100 致炸弹 AoE 几乎炸不到实体(2026-08-13 修)
        const hurtBox = cw.shoot === 29 || cw.shoot === 470 || cw.shoot === 637 ? 125
          : cw.shoot === 28 || cw.shoot === 37 || cw.shoot === 516 ? 64
            : isFluidDirt ? 24 : 11;
        // 爆炸尾段载荷（Projectile.Kill :74007-74244）：903-906 液体放置/吸收、
        // 910/911 泥土 flood-fill；旧爆炸族无载荷（undefined）
        const payload = Game.BOMB_PAYLOAD[cw.shoot];
        this.entities.add(new GrenadeProj(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          dmg, fuse, cw.shoot, (ex, ey, edmg) => {
            this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE), edmg, er, er > 0, hurtBox, this.player.equipStats.armorPen + (ps?.arpen ?? 0), cw.shoot);
            if (payload) {
              const painted = Game.spreadBombPayload(this.world.store, payload,
                Math.floor(ex / TILE), Math.floor(ey / TILE));
              if (painted > 0) this.sfxAt('splash', ex, ey); // delegate 成功格尘/音近似（:74063-74100 族）
            }
          }), 'projectiles'); // ⑥+⑧
        consume();
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        this.input.mouseDown = false; // 消费点击(⑩ 边沿门防连发,与 flail/yoyo/magic 一致)
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
        this.input.mouseDown = false;
        break;
      }
      case 'boomerang': {
        // AI_003 1:1：出程无摩擦直线/命中·撞墙·计数三门回收/返回段目标速度制/回手消失
        // （AI_003_Boomerang :36623-37352;第 8 参 = 掷出瞬间玩家 facing → 原版 direction,
        //   自旋符号 :37294 起以此为准,勿改回 sign(vx)）
        const bom = new Boomerang(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, this.player.facing);
        bom.critChance = critTotal;
        bom.armorPen = this.player.equipStats.armorPen; // ⑥
        // 301 Bouncing Shield 按 20t/100t 双门需 channel（其余族不用,空挂无害）
        if (cw.shoot === 301) bom.channel = () => this.input.mouseHeld && !this.input.uiBlocking;
        this.entities.add(bom, 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        this.input.mouseDown = false;
        break;
      }
      case 'spear': {
        // AI_019：随角色前刺——伸缩包络按型号参数表(AI_019_Spears_GetSpearOffset),位移=offset×shootSpeed
        const spear = new SpearProj(Math.cos(ang), Math.sin(ang), cw.shootSpeed * (ps?.size ?? 1), cw.useTime, // P:46431 num13=shootSpeed×scale(词缀 size)
          cw.damage, cw.knockback, cw.shoot);
        spear.critChance = critTotal;
        spear.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen; // ⑥ 近战含磨刀
        this.entities.add(spear, 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw');
        this.input.mouseDown = false;
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
        const whipObj = new WhipProj(
          owner.cx, owner.cy, ang, whip.shoot, whip.itemId,
          Math.max(1, Math.round(cwIn.damage * (ps?.dmg ?? 1))),
          whip.knockback, whip.useTime, whip.shootSpeed,
          () => (owner.dead ? null : owner),
          // 月主鞭补鞭实时瞄准（Projectile.cs:45045-45046 朝鼠标方向重掷）
          () => Math.atan2(inp.mouseY - this.renderer.canvas.height / 2,
            inp.mouseX - this.renderer.canvas.width / 2),
        );
        this.entities.add(whipObj, 'projectiles');
        // 鞭攻速（SetItemAnimation :4266：summonerWeaponSpeedBonus × whipUseTimeMultiplier，
        // 封顶 3×——summonerWeaponSpeedBonus 来自鞭 buff 311/308/314，黑曜套给 wutm）
        const swb = (owner.whipBuffs[311] ? 0.35 : 0) + (owner.whipBuffs[308] ? 0.25 : 0)
          + (owner.whipBuffs[314] ? 0.12 : 0);
        const whipAtk = Math.min(3, 1 + swb * owner.equipStats.whipSpd);
        this.player.useTime = Math.max(1, Math.round(whip.useTime / whipAtk));
        whipObj.bonusTagDmg = ps?.tagdmg ?? 0; // I:567 bonusTagDamage
        this.sfx.playWav('whipCrack', 1, owner.cx, owner.cy); // DefaultToWhip UseSound=Item152（鞭响）
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
            this.sfx.playWav('summon', 1, this.player.cx, this.player.cy);
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
        // 成就：9+ 随从（Player.cs:51059 num+num2>=9 → event 6 YOU_AND_WHAT_ARMY；
        //  本作随从恒 1 槽 = 数量口径，召唤后计数）
        if (!cw.sentry
          && this.entities.projectiles.filter((e) => e instanceof MinionProj && !e.sentry).length >= 9) {
          this.achievements.handleSpecialEvent(6,
            { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
        }
        this.player.useTime = cw.useTime;
        this.sfx.playWav('summon', 1, this.player.cx, this.player.cy); // 召唤杖 UseSound=Item44
        this.input.mouseDown = false;
        break;
      }
      case 'flail': {
        // AI_015_Flails（Projectile.cs:41051）：按住=绕体旋转,松手朝鼠标掷出,
        // 撞墙坠落→垂地悬荡→回收全状态机;同物品仅一个球在场
        const itemId = ITEM_BY_KEY[def.key];
        for (const e of this.entities.projectiles) {
          if (e instanceof FlailProj && e.projId === cw.shoot) return;
        }
        const flailP = new FlailProj(px, py, cw.damage, cw.knockback, cw.shoot,
          // ★ channel 用 mouseHeld(电平语义):mouseDown 是边沿消费量,本分支掷出后
          //   即清零,真实按住期间无新 mousedown 事件回填 → channel 恒 false,链球
          //   出生 1 帧即判松手回收消失(阳炎之怒"没起效"根因,2026-08-13)
          () => this.input.mouseHeld && !this.input.uiBlocking && this.player.inv.heldItem()?.id === itemId,
          () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; });
        flailP.critChance = critTotal;
        // AI_015 特例子弹生成回调(247/757/1058;entities.add 不在 GameHooks)。
        // ★sDmg 源自 FlailProj.damage=cw.damage(已含词缀乘区)——再乘 ps?.dmg
        //  = 双乘前缀(review 实锤,2026-08-13);原版 248/928/405 伤=出手时武器伤。
        // 弹型按原版 AI 形态分流(SetDefaults):
        //   248 aiStyle1 箭物理(grav 0.3,射出音 Item17 未提取 GAP);
        //   928 aiStyle14 弹跳球(34×34/grav 0.3/life 250/穿透 2,:8509);
        //   405 aiStyle70 追踪刺(ai0=-10 漂入→650 寻敌→追踪,专属 FlaironSpike)
        flailP.spawnProj = (sx, sy, svx, svy, sProj, sDmg, sKb) => {
          const dmg = Math.max(1, Math.round(sDmg));
          if (sProj === 405) {
            this.entities.add(new FlaironSpike(sx, sy, svx, svy, dmg, sKb), 'projectiles');
            return;
          }
          if (sProj === 928) {
            const bub = new Arrow(sx, sy, svx, svy, dmg, sKb, sProj, null,
              { grav: 0.3, life: 250, pierce: 2, bounce: true });
            bub.w = 34; bub.h = 34; // SetDefaults width/height=34(:8509)
            this.entities.add(bub, 'projectiles');
            return;
          }
          // 248 在 flag3 豁免表（:53106）→ 原版无重力直线（此前 0.3 抛物线未对齐）
          this.entities.add(new Arrow(sx, sy, svx, svy, dmg, sKb, sProj, null,
            { grav: projGravity(sProj), life: 1200 }), 'projectiles');
        };
        flailP.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen; // ⑥
        this.entities.add(flailP, 'projectiles');
        this.player.useTime = cw.useTime;
        this.sfx.play('throw'); // UseSound=SoundID.Item1(Item.cs case 220)
        this.input.mouseDown = false; // 本击只负责掷出,旋转/掷出由 channel 回调判定
        break;
      }
      case 'yoyo': {
        // AI_099 channel：同物品已有悠悠球在场则不重复掷出（原版每把悠悠球仅一个）
        const itemId = ITEM_BY_KEY[def.key];
        for (const e of this.entities.projectiles) {
          const y = e as YoyoProj;
          if (y instanceof YoyoProj && y.projId === cw.shoot) return;
        }
        // 射程/顶速/寿命/惯性全部由 YoyoProj 实体内按 AI_099 公式 1:1 重算
        // （YOYO_RANGE/TOP/LIFE 三表 + meleeSpeed 缩放 + yoyoString 修正）——
        // 此前 Game 侧另算 stringLen/life 双轨,与实体内冲突已统一（2026-08-13）
        const yoyo = new YoyoProj(px, py, cw.damage, cw.knockback, cw.shoot, 0,
          () => this.input.mouseHeld && !this.input.uiBlocking && this.player.inv.heldItem()?.id === itemId,
          () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; });
        yoyo.critChance = critTotal;
        yoyo.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen; // ⑥
        // 配重球（counterWeight：悠悠球命中时落配重投射物，原版环绕弹的直线坠落近似）
        if (this.player.equipStats.counterWeight) {
          (yoyo as unknown as { spawnWeight?: (x: number, y: number, dmg: number) => void }).spawnWeight =
            (wx, wy, wdmg) => {
              // 配重球 = 环绕实体（AI_099_1 :64472-64610 1:1——曾直线坠落 Arrow 近似）
              const cwOwn = () => (this.player.dead ? null : this.player);
              const cwAlive = () => !yoyo.dead && (yoyo as unknown as { dead: boolean }).dead === false;
              const cwE = new CounterweightProj(wx, wy, wdmg, this.player.equipStats.kbGlove ? 4 : 2,
                556 + Math.floor(Math.random() * 6), cwOwn, cwAlive, this.player.equipStats.yoyoString);
              cwE.critChance = critTotal;
              cwE.armorPen = this.player.equipStats.armorPen + this.player.meleeArmorPen;
              this.entities.add(cwE, 'projectiles');
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
        const cwCost = Math.trunc(Math.round((cw.mana ?? 0) * (ps?.mcst ?? 1)) * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul); // ⑪+⑧ 词缀 mcst(I:562 round)
        if (this.player.mana < cwCost) {
          if (!(this.player.equipStats.manaFlower && this.tryAutoManaPotion() && this.player.mana >= cwCost)) {
            this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NoMana'));
            this.input.mouseDown = false;
            return;
          }
        }
        this.player.mana -= cwCost;
        const pd = projectileData(cw.shoot);
        // 彩虹枪 250（aiStyle 46）：专用弹链——隐形飞行头铺 251 彩虹段（40s 持续
        // 伤害带），通用 Arrow 无法表达铺段/恒速拱弧/静态免疫
        if (cw.shoot === 250) {
          const bolt = new RainbowBolt(px, py,
            Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
            cw.damage, cw.knockback);
          bolt.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          bolt.critChance = critTotal;
          this.entities.add(bolt, 'projectiles');
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.playUseSound(critVid, 'tink');
          this.input.mouseDown = false;
          break;
        }
        // 星云烈焰 3542 → 634（普）/635（强）（AI_001 :51577-51762 追踪弹 +
        // Kill :68745 50×50 AoE 爆；20% 强发 Damage×3 否则速 −1，Player.cs:46489-46498）
        if (cw.shoot === 634) {
          const mega = Math.random() * 100 < 20;
          const speed634 = mega ? cw.shootSpeed : cw.shootSpeed - 1;
          const bolt = new NebulaBlazeBolt(px, py,
            Math.cos(ang) * speed634, Math.sin(ang) * speed634,
            mega ? Math.round(cw.damage * 3) : cw.damage, cw.knockback,
            mega ? 635 : 634);
          bolt.critChance = critTotal;
          bolt.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          this.entities.add(bolt, 'projectiles');
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.playUseSound(critVid, 'tink');   // UseSound=Item_20（itemUseSound 表）
          this.input.mouseDown = false;
          break;
        }
        // 月耀 3570 → 645×3 天降（Player.cs:47072-47097）：天顶 Y−600−100i、X 双重
        // 散布、|dy| 钳 ≥20 恒向下、速 ×0.5、ai[1]=鼠标 Y 线（过线开 tileCollide）
        if (cw.shoot === 645) {
          const [mwx645, mwy645] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
          const p645 = this.player;
          for (let i = 0; i < 3; i++) {
            let sx = p645.x + p645.w * 0.5 + Math.floor(Math.random() * 201) * -p645.facing
              + (mwx645 - p645.x);
            sx = (sx + p645.cx) / 2 + Math.floor(Math.random() * 401) - 200;
            const sy = p645.cy - 600 - 100 * i;
            const dx = mwx645 - sx;
            let dy = mwy645 - sy;
            const lineY = dy + sy;                    // ai[1] = 鼠标世界 Y（原符号）
            const ady = Math.max(20, Math.abs(dy));
            const len = Math.hypot(dx, ady) || 1;
            const spd = cw.shootSpeed / len / 2;      // 单位化 ×speed ÷2
            const star = new LunarFlareStar(sx, sy, dx * spd, ady * spd,
              cw.damage, cw.knockback, lineY);
            star.critChance = critTotal;
            star.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
            this.entities.add(star, 'projectiles');
          }
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.playUseSound(critVid, 'tink');   // UseSound=Item_88（itemUseSound 表）
          this.input.mouseDown = false;
          break;
        }
        // 双足翼龙之怒 3870 → 711×3（Player.cs:48156-48170）：出膛 40px（LOS 门）
        // + 三连扇形（0.8×速 + 垂直分量 0/±1，各旋 -π/60×direction）
        if (cw.shoot === 711) {
          const muzzleX = px + Math.cos(ang) * 40;
          const muzzleY = py + Math.sin(ang) * 40;
          const baseVx = Math.cos(ang) * cw.shootSpeed * 0.8;
          const baseVy = Math.sin(ang) * cw.shootSpeed * 0.8;
          const perpX = -Math.sin(ang), perpY = Math.cos(ang);
          const rotStep = Math.PI / 180 * -this.player.facing;
          for (let k = 0; k <= 2; k++) {
            let bvx = baseVx + perpX * k, bvy = baseVy + perpY * k;
            const rot = k * rotStep;
            const rc = Math.cos(rot), rs = Math.sin(rot);
            const nvx = bvx * rc - bvy * rs, nvy = bvx * rs + bvy * rc;
            bvx = nvx; bvy = nvy;
            // 711 重力 = 686/711 两段式（:54640-54659：ai0≥10 +0.1、≥20 再 +0.1、
            // vx×0.99/update）——此前 grav 0 直线未对齐
            const gs711 = projGravSpec(711);
            const bolt = new Arrow(muzzleX, muzzleY, bvx, bvy,
              cw.damage, cw.knockback, 711, null,
              { grav: gs711.grav, gravDelay: gs711.delay, grav2: gs711.grav2, grav2At: gs711.grav2At,
                dragAlways: gs711.drag, life: 600, pierce: 3 });
            bolt.critBonus = this.player.critChance('magic')
              + (itemCombat(critVid)?.crit ?? 0) + (ps?.crt ?? 0);
            bolt.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
            bolt.nebulaCb = () => {
              if (!this.player.equipStats.nebulaSet || this.player.nebulaCD > 0 || Math.random() >= 1 / 3) return;
              this.player.nebulaCD = 30;
              this.spawnNebulaBooster(bolt.cx, bolt.cy);
            };
            this.entities.add(bolt, 'projectiles');
          }
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.playUseSound(critVid, 'tink');
          this.input.mouseDown = false;
          break;
        }
        // 大地法杖 1296 → 261（AI_014 弹跳巨石）：重力 0.3 + ai14 弹跳衰减
        // + extraUpdates 1（pd 驱动）；慢速消亡/墙撞爆岩在 Arrow boulder 模式
        if (cw.shoot === 261) {
          const b261 = new Arrow(px, py,
            Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
            cw.damage, cw.knockback, 261, null,
            { grav: 0.3, bounce: true, life: pd?.timeLeft ?? 600, pierce: 6 });
          b261.frostEligible = false;   // magic 弹
          b261.critBonus = this.player.critChance('magic')
            + (itemCombat(critVid)?.crit ?? 0) + (ps?.crt ?? 0);
          b261.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          b261.nebulaCb = () => {
            if (!this.player.equipStats.nebulaSet || this.player.nebulaCD > 0 || Math.random() >= 1 / 3) return;
            this.player.nebulaCD = 30;
            this.spawnNebulaBooster(b261.cx, b261.cy);
          };
          this.entities.add(b261, 'projectiles');
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.playUseSound(critVid, 'tink');
          this.input.mouseDown = false;
          break;
        }
        // 充能爆破炮 2882 → 460（AI_075 :63442 460 分支）：channel 蓄力 180t
        // 发 461 光束（×1.5 伤）+ 459 小弹节奏（同 payMana 回调）
        if (cw.shoot === 460) {
          const blOwner = this.player;
          const blItemId = def.key;
          const bl = new ChargedBlaster(Math.cos(ang), Math.sin(ang),
            cw.damage, cw.knockback,
            () => this.input.mouseHeld && !this.input.uiBlocking
              && blOwner.inv.heldItem()?.id === ITEM_BY_KEY[blItemId]
              && !blOwner.dead,
            () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
            () => {
              const cost = Math.trunc(Math.round((cw.mana ?? 0) * (ps?.mcst ?? 1))
                * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul);
              if (this.player.mana < cost) return false;
              this.player.mana -= cost;
              return true;
            });
          bl.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          bl.critChance = critTotal;
          this.entities.add(bl, 'projectiles');
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.input.mouseDown = false;
          break;
        }
        // 最后的棱镜 3541 → 633（channel 充能聚束，AI_075 :63626）：
        // 633 晶体挂手 + 6×632 光棱（PrismProj 独占链）。channel=按住（电平语义同
        // 链球 mouseHeld）；魔耗节奏 30→15→5 由 payMana 回调按拍扣
        if (cw.shoot === 633) {
          const prismOwner = this.player;
          const prismItemId = def.key;
          const prism = new PrismProj(Math.cos(ang), Math.sin(ang),
            cw.damage, cw.knockback,
            () => this.input.mouseHeld && !this.input.uiBlocking
              && prismOwner.inv.heldItem()?.id === ITEM_BY_KEY[prismItemId]
              && !prismOwner.dead,
            () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
            () => {
              const cost = Math.trunc(Math.round((cw.mana ?? 0) * (ps?.mcst ?? 1))
                * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul);
              if (this.player.mana < cost) return false;
              this.player.mana -= cost;
              return true;
            });
          prism.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          prism.critChance = critTotal;
          this.entities.add(prism, 'projectiles');
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed();
          this.input.mouseDown = false;
          break;
        }
        // 可控导弹族 aiStyle 9（AI_009_MagicMissiles :40518-40751）：113→16 魔法飞弹、
        // 218→34 Flamelash、495→79 彩虹魔杖——channel 光标操控 + 松手索敌/直飞，
        // 兜底直飞 mArrow 表达不了。持按连发每 useTime 一发新弹（循环重用语义）
        if (pd?.aiStyle === 9) {
          // Flamelash 水中禁射（Player.cs:51274 wet && !lavaWet && shoot∈{85,15,34}——
          // 原版门在扣魔之前，此处已在上方扣过 → 退还）
          if (cw.shoot === 34 && this.player.inWater && !this.player.inLava) {
            this.player.mana += cwCost;
            this.input.mouseDown = false;
            return;
          }
          const missileOwner = this.player;
          const missileItemId = def.key;
          const spawnMissile = (mx: number, my: number, mvx: number, mvy: number) => {
            const m = new MagicMissileProj(mx, my, mvx, mvy, {
              projId: cw.shoot, damage: cw.damage, knockback: cw.knockback, useTime: cw.useTime,
              channelCb: () => this.input.mouseHeld && !this.input.uiBlocking
                && missileOwner.inv.heldItem()?.id === ITEM_BY_KEY[missileItemId]
                && !missileOwner.dead,
              aimCb: () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
              payMana: () => {
                const cost = Math.trunc(Math.round((cw.mana ?? 0) * (ps?.mcst ?? 1))
                  * (this.player.equipStats.manaFlower ? 0.92 : 1) * this.player.equipStats.manaCostMul);
                if (this.player.mana < cost) return false;
                this.player.mana -= cost;
                return true;
              },
              fireExtra: () => {
                // 兄弟弹：枪口 → 当前光标 × shootSpeed（Player.cs:46642-46673 num4/num5 同构）
                const [mwx, mwy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
                const a2 = Math.atan2(mwy - this.player.cy, mwx - this.player.cx);
                const sx = this.player.cx + Math.cos(a2) * 14;
                const sy = this.player.cy - 4 + Math.sin(a2) * 14;
                const dl = Math.hypot(mwx - sx, mwy - sy) || 1;
                spawnMissile(sx, sy, (mwx - sx) / dl * cw.shootSpeed, (mwy - sy) / dl * cw.shootSpeed);
              },
            });
            m.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0); // ⑥+⑧
            m.critChance = critTotal;
            m.nebulaCb = () => {
              if (!this.player.equipStats.nebulaSet || this.player.nebulaCD > 0 || Math.random() >= 1/3) return;
              this.player.nebulaCD = 30; // :12895
              this.spawnNebulaBooster(m.cx, m.cy);
            };
            this.entities.add(m, 'projectiles');
          };
          spawnMissile(px, py, Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed);
          this.player.useTime = cw.useTime;
          this.player.onManaItemUsed(); // 用魔动画窗（manaRegenDelay 重置期，:42131-42137）
          this.playUseSound(critVid, 'tink'); // UseSound 数据驱动（113=Item9/218=Item20/495 各杖专属）
          this.input.mouseDown = false; // 本击只负责首发；持按连发由实体内 useTime 拍驱动
          break;
        }
        let pen = pd?.penetrate ?? 1;
        if (pen < 0) pen = 3;
        pen = Math.max(1, Math.min(pen, 3));
        const gsM = projGravSpec(cw.shoot);
        const mArrow = new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: gsM.grav, gravDelay: gsM.delay, grav2: gsM.grav2, grav2At: gsM.grav2At,
            dragAlways: gsM.drag, life: pd?.timeLeft ?? 600, pierce: pen });
        // 星云 booster（StrikeNPC :12892-12905：魔法弹命中、套装在身、CD=0、1/3 → 掉 booster）
        mArrow.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0); // ⑥+⑧
        mArrow.critBonus = this.player.critChance('magic')
          + (itemCombat(def.vid ?? viIdFromKey(def.key) ?? -1)?.crit ?? 0) + (ps?.crt ?? 0); // 审计 §6 + ⑧
        mArrow.nebulaCb = () => {
          if (!this.player.equipStats.nebulaSet || this.player.nebulaCD > 0 || Math.random() >= 1 / 3) return;
          this.player.nebulaCD = 30; // :12895
          this.spawnNebulaBooster(mArrow.cx, mArrow.cy);
        };
        this.entities.add(mArrow, 'projectiles');
        this.player.useTime = cw.useTime;
        this.player.onManaItemUsed(); // 用魔动画窗（manaRegenDelay 重置期，:42131-42137）
        this.playUseSound(critVid, 'tink'); // UseSound 数据驱动（Item8/12/20/43/92…各杖专属）
        this.input.mouseDown = false;
        break;
      }
      case 'shot': {
        // 兜底直射（附魔剑光束等 melee/ranged+shoot 未归族项）：重力按 aiStyle
        const pd = projectileData(cw.shoot);
        // ★食人鱼枪 1156 → 弹 190（aiStyle 39，GAP G3 行为层）：直飞 Arrow 表达不了
        //  咬住/返回状态机，独占分流。出生数 = 3 − 同主在场数（ItemCheck_Shoot 专支
        //  Player.cs:47768-47786 每次补满 3 条，速度分量各 +Next(−40,41)×0.05 扰动）；
        //  channel=按住电平（mouseHeld，同 PrismProj/FlailProj 先例）——松手由实体
        //  AI 转 ai[0]=1 返回（Projectile.cs:26093-26096）；回收后在场数 <3 的补弹在
        //  实体侧 pTopUp 通道再生（P:42856-42868），本分支只管首发
        if (cw.shoot === PIRANHA_PROJ) {
          const pgItemId = ITEM_BY_KEY[def.key];
          const pgOwner = this.player;
          const pgAlive = this.entities.projectiles.filter(
            (e) => (e as { projId?: number }).projId === PIRANHA_PROJ && !(e as { dead?: boolean }).dead).length;
          const pgCtl = {
            channel: () => this.input.mouseHeld && !this.input.uiBlocking
              && pgOwner.inv.heldItem()?.id === pgItemId && !pgOwner.dead,
            aim: () => {
              const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY);
              return { x: wx, y: wy };
            },
          };
          for (let i = 0; i < 3 - pgAlive; i++) {
            const pg = new Arrow(px, py,
              Math.cos(ang) * cw.shootSpeed + (Math.floor(Math.random() * 81) - 40) * 0.05,
              Math.sin(ang) * cw.shootSpeed + (Math.floor(Math.random() * 81) - 40) * 0.05,
              cw.damage, cw.knockback, PIRANHA_PROJ, null,
              { grav: 0, life: PIRANHA_LIFE, piranha: pgCtl });   // timeLeft 通用默认 3600（:526）
            pg.pShootSpeed = cw.shootSpeed;                        // 精确 shootSpeed（14）供补弹
            pg.critChance = critTotal;
            pg.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
            pg.frostEligible = dmgKind !== 'magic';                // ranged 弹吃冰霜引擎
            this.entities.add(pg, 'projectiles');
          }
          this.player.useTime = cw.useTime;
          this.playUseSound(critVid, 'bowShoot');   // UseSound=Item_10（itemUseSound 表数据驱动）
          this.input.mouseDown = false;
          break;
        }
        // 491 飞刀（item 3030，aiStyle 9 Old 分支 AI_009_MagicMissiles_Old
        // :40753-40910，入口分流 :40520-40524）：channel 光标操控 + 松手回旋回收，
        // 直飞 Arrow 表达不了。3030 melee+noMelee → 本 'shot' 兜底（melee 族门
        // 要求 !noMelee，vanillaItemCombat.ts:218），在此单点分流。3030 无
        // autoReuse（channel 件）——每击一刀，持按转向
        if (cw.shoot === 491) {
          const fkOwner = this.player;
          const fkItemId = def.key;
          const knife = new FlyingKnifeProj(px, py,
            Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
            cw.damage, cw.knockback,
            {
              channelCb: () => this.input.mouseHeld && !this.input.uiBlocking
                && fkOwner.inv.heldItem()?.id === ITEM_BY_KEY[fkItemId]
                && !fkOwner.dead,
              aimCb: () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
            });
          knife.critChance = critTotal;
          knife.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          this.entities.add(knife, 'projectiles');
          this.player.useTime = cw.useTime;
          this.playUseSound(critVid, 'bowShoot');   // 3030 UseSound=Item1（itemUseSound 表）
          this.input.mouseDown = false;
          break;
        }
        // 636 太阳耀斑（Daybreak 长矛 3543，aiStyle 113 AI_113_TargetSticker
        // :38138-38477）：命中即附着 5s，Daybreak(189) 层数 = 场上附着数（NPC.cs
        // :92807-92830，上限 8/敌）——直飞 Arrow 无法表达附着态。3543 同为
        // melee+noMelee → 'shot' 兜底路径，同点分流
        if (cw.shoot === 636) {
          const flare = new DaybreakFlare(px, py,
            Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
            cw.damage, cw.knockback);
          flare.critChance = critTotal;
          flare.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          this.entities.add(flare, 'projectiles');
          this.player.useTime = cw.useTime;
          this.playUseSound(critVid, 'bowShoot');   // 3543 UseSound=Item1（itemUseSound 表）
          this.input.mouseDown = false;
          break;
        }
        // 天龙之怒 3858 左键 → 707（AI_140_MonkStaffT1 :66249-66337）：channel
        // 持械旋剑 50t 两整圈。原版 SetDummyItemTime(2) 冻结物品时间（:66344）→
        // 下一挥须等旋完 + reuseDelay2 = useTime 52 近似；t=25 松手提前收剑时
        // onEnd 把 useTime 钳回 2。右键 alt（708 椭圆弧+709 弹+1110 圈）在
        // 右键分派（viIdFromKey 3858 分支，同传送门枪位）
        if (cw.shoot === 707) {
          const sdAlive = this.entities.projectiles.some(
            (e) => e instanceof SkyDragonSpin && !e.dead);
          if (sdAlive) { this.input.mouseDown = false; break; }
          const sdItemId = ITEM_BY_KEY[def.key];
          const sdOwner = this.player;
          // owner 传玩家本体（cx/cy/facing 实时引用；半程重瞄要写 facing）
          const spin = new SkyDragonSpin(
            sdOwner,
            Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
            cw.damage, cw.knockback,
            () => this.input.mouseHeld && !this.input.uiBlocking
              && sdOwner.inv.heldItem()?.id === sdItemId && !sdOwner.dead,
            () => { const [wx, wy] = this.camera.screenToWorld(inp.mouseX, inp.mouseY); return { x: wx, y: wy }; },
            () => { if (this.player.useTime > 2) this.player.useTime = 2; });
          spin.critChance = critTotal;
          spin.armorPen = this.player.equipStats.armorPen + (ps?.arpen ?? 0);
          this.entities.add(spin, 'projectiles');
          this.useSwing(def, ang);
          if (this.swing) { this.swing.noGraphic = true; this.swing.t = 52; this.swing.dur = 52; } // noUseGraphic(:34091)+持械姿势延展到旋完
          this.player.useTime = 52;
          this.playUseSound(critVid, 'bowShoot');   // UseSound=DD2_SkyDragonsFurySwing（itemUseSound 表）
          this.input.mouseDown = false;
          break;
        }
        const gsS = projGravSpec(cw.shoot);
        const shotArrow = new Arrow(px, py,
          Math.cos(ang) * cw.shootSpeed, Math.sin(ang) * cw.shootSpeed,
          cw.damage, cw.knockback, cw.shoot, null,
          { grav: gsS.grav, gravDelay: gsS.delay, grav2: gsS.grav2, grav2At: gsS.grav2At,
            dragAlways: gsS.drag, life: pd?.timeLeft ?? 600, pierce: 1 });
        shotArrow.frostEligible = dmgKind !== 'magic'; // melee/ranged 兜底弹吃冰霜引擎
        // 暴击链:装备 critChance(dmgKind) + 武器 item.crit(GetWeaponCrit)
        shotArrow.critBonus = this.player.critChance(dmgKind === 'magic' ? 'magic' : dmgKind === 'ranged' ? 'ranged' : 'melee')
          + (itemCombat(critVid)?.crit ?? 0);
        this.entities.add(shotArrow, 'projectiles');
        this.player.useTime = cw.useTime;
        this.playUseSound(critVid, 'bowShoot');
        this.input.mouseDown = false;
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
   * （+tileBoost）的【矩形】判定（Simple 档 multiplier=1/上限 20）。非圆形距离。
   * 旅程扩大放置范围（FarPlacementRangePower，Player.cs:18636-18645 每 tick 重算
   * tileRangeX/Y：×2+8 → 18/14——Main.IsJourneyMode 门）在基础半扩上 +13/+11 */
  private inTileRange(tx: number, ty: number, tb = 0): boolean {
    const p = this.player;
    const far = this.world?.isJourney && journeyPowers().farPlacementRange;
    const x = Math.min(20, 5) + tb + (far ? FAR_PLACEMENT_RANGE_X - DEFAULT_TILE_RANGE_X : 0);
    const y = Math.min(20, 3) + tb + (far ? FAR_PLACEMENT_RANGE_Y - DEFAULT_TILE_RANGE_Y : 0);
    const LX = Math.floor(p.x / TILE) - x;
    const HX = Math.ceil((p.x + p.w) / TILE) - 1 + x;
    const LY = Math.floor(p.y / TILE) - y;
    const HY = Math.ceil((p.y + p.h) / TILE) - 1 + y;
    return tx >= LX && tx <= HX && ty >= LY && ty <= HY;
  }

  /** 祭坛矿脉 OreRunner 双掷（WorldGen.cs:49095 十周年 / :49099 常规）：
   *  strength/steps 两参各独立取一次 genRand.Next(5,10)（[5,9] 闭区间）。
   *  原版不是同一掷值同传两参——单 r 同传会把"脉粗细"与"生长步数"锁死相关。 */
  static altarOreVeinRoll(rng: RNG): { strength: number; steps: number } {
    return { strength: rng.int(5, 9), steps: rng.int(5, 9) };
  }

  /** 砸祭坛 = 原版 KillTile case 26 → SmashAltar（WorldGen.cs:48949）1:1：
   *  altarCount%3 选矿档(0 钴/钯、1 秘银/山铜、2 精金/钛)，/3+1 为波次衰减；
   *  矿脉数 num3 = w/4200×310 − 85×档 ×0.85 ÷ 波次——钴档恒 ×1.05（:49008），
   *  锁定到替代矿(221/222/223)再 ×0.9（:48991 等,替代矿更稀有）；
   *  矿种按世界锁定（SavedOreTiers :48981-49030：每档首砸 roll 一次 genRand.Next(2)==0
   *  → 替代矿,此后全世界固定,随存档持久化 world.savedOreTiers——此前每砸重 roll
   *  会导致同世界混出钴+钯）；深度带按锁定矿种（:49033-49040：107/221=地表线、
   *  108/222=岩层、111/223=(岩层×2+h)/3）；每脉 OreRunner Next(5,10) 双掷恒定区间
   *  （:49095 十周年/:49099 常规——strength/steps 各独立一掷，非同一值；
   *  旧实现的 5..9+w/4200 是误读）;最后生成 1-2 只幽灵(82)。祭坛 3×2 整体移除。
   *  计数存 world.altarCount（原版 WorldGen.altarCount 静态位，WorldFile.cs:1303/2100
   *  随存档持久化——跨会话保留；海盗入侵自然 roll 的 >0 门同源 Main.cs:64938） */
  private smashAltar(tx: number, ty: number): void {
    const st = this.world.store;
    const ALTAR = TILE_BY_KEY['v_26_altars'];
    // 3×2 对象拆除（TileObjectData 语义）：frameX = style×54 + 列×18 → 列号 %3;
    // frameY/18∈{0,1} 行。锚点 = 左上格——此前扫 ±3 邻域会误拆 3 格内相邻祭坛
    const aIdx = st.idx(tx, ty);
    const ax = tx - (Math.floor(st.frameX[aIdx] / 18) % 3);
    const ay = ty - Math.floor(st.frameY[aIdx] / 18);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (!st.inBounds(ax + dx, ay + dy)) continue;
        if (st.type[st.idx(ax + dx, ay + dy)] === ALTAR) st.setTileSilent(ax + dx, ay + dy, 0);
      }
    }
    this.chunks.markDirtyArea(ax - 1, ay - 1, ax + 3, ay + 2);
    this.spawnParticles(tx * TILE + 24, ty * TILE + 8, '#B080FF', 14, 2.5);
    this.sfx.play('hit', 1);
    const tier = this.world.altarCount % 3;
    const wave = Math.floor(this.world.altarCount / 3) + 1;
    // 世界锁定选种（SavedOreTiers）：每档 base/alt 二选一,首砸 roll 后固定
    const TIER_ORES: Array<{ slot: 'cobalt' | 'mythril' | 'adamantite'; base: number; alt: number }> = [
      { slot: 'cobalt', base: 107, alt: 221 },
      { slot: 'mythril', base: 108, alt: 222 },
      { slot: 'adamantite', base: 111, alt: 223 },
    ];
    const td = TIER_ORES[tier];
    if (this.world.savedOreTiers[td.slot] === -1) {
      this.world.savedOreTiers[td.slot] = Math.random() < 0.5 ? td.base : td.alt; // Next(2)==0 → 替代
    }
    const oreSheet = this.world.savedOreTiers[td.slot];
    const ore = TILE_INTERNAL_BY_SHEET.get(oreSheet) ?? TILE_BY_KEY['ore_cobalt'];
    // 世界公告（:48991/:49008/:49021——ChatHelper misc[12/13/14 基础,+9=替代矿变体],
    // 按锁定矿种选文案）
    this.newText(Lang.misc((tier === 0 ? 12 : tier === 1 ? 13 : 14) + (oreSheet !== td.base ? 9 : 0)), 175, 75, 255);
    let veins = (st.w / 4200) * 310 - 85 * tier;
    veins *= 0.85;
    veins /= wave;
    if (tier === 0) veins *= 1.05;              // 钴档恒 ×1.05（:49008）
    if (oreSheet !== td.base) veins *= 0.9;     // 替代矿更稀有（:48991/:49016/:49029）
    const band = tier === 0 ? this.world.groundLevel : tier === 1 ? this.world.rockLevel : (this.world.rockLevel * 2 + st.h) / 3;
    const rng = new RNG((Math.random() * 1e9) | 0);
    const cap = Math.floor(veins);
    for (let k = 0; k < cap; k++) {
      const x = 100 + Math.floor(Math.random() * (st.w - 200));
      const y = Math.floor(band) + Math.floor(Math.random() * Math.max(1, st.h - 150 - Math.floor(band)));
      // 双掷（WorldGen.cs:49095 十周年 / :49099 常规）：OreRunner(i,j,strength,steps)
      // 两参各独立取一次 genRand.Next(5,10)——单 r 同传两用会把脉粗细与长度锁死相关
      const vein = Game.altarOreVeinRoll(rng);
      tileRunner(st, rng, lastGenState() ?? { worldSurface: this.world.groundLevel, lavaLine: st.h - 200, waterLine: this.world.groundLevel } as never, x, y, { strength: vein.strength, steps: vein.steps, type: ore, addTile: true });
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
    // 成就：BEGONE_EVIL（WorldGen.cs:49111 event 6——每次砸祭坛都触发）
    this.achievements.notifyProgressionEvent(6);
  }

  /** 钻头坐骑（mount 8）每 tick 能力驱动（Mount.cs UseDrill/UseAbility/AimAbility +
   *  Player.cs ItemCheck_HandleMount :52066-52081 合并）：
   *  - 按压边沿（上 tick 双松 + 本 tick 任一按下）→ 开激光（原版伴生光标投射物 453，
   *    本仓以 mount.abilityActive 单一真源表达）；双松 → 关。
   *  - 激活期间每 tick AimAbility（二极管朝鼠标）+ UseDrill（左键挖块/右键拆墙，
   *    每束每 tick 一击，最多 2 束齐射）。
   *  挖块走 tryMine(drill)（HitTile 积累 + 镐力门槛表 1:1），拆墙走 drillPickWall。 */
  private updateDrillMountUse(): void {
    const p = this.player;
    const mnt = p.mount;
    const useItem = p.inputUseItem, useTile = p.inputUseTile;
    const pressEdge = (useItem || useTile) && !p.prevUseItem && !p.prevUseTile;
    p.prevUseItem = useItem;
    p.prevUseTile = useTile;
    if (pressEdge) mnt.setDrillActive(true);
    else if (!useItem && !useTile) mnt.setDrillActive(false);
    mnt.updateDrill();
    if (mnt.abilityActive) mnt.aimDrill(p.cx, p.cy, p.aimWX, p.aimWY);
    mnt.useDrill(p, {
      useItem,
      useTile,
      pickTile: (tx, ty) => this.tryMine(tx, ty, DRILL_PICK_POWER, 'pick', DRILL_PICK_TIME, DRILL_PICK_TIME, { drill: true }),
      pickWall: (tx, ty) => this.drillPickWall(tx, ty),
      // 命中尘（Mount.cs :3072-3080/:3131-3137）：dust 230 ×2 粒，方向 = 目标朝向角
      // ±90° 垂直喷溅、速度 2-4、noGravity——原版 dust 池优先，缺省回退定向粒子爆发
      dust: (x, y, n, rot) => {
        const pool = this.vanillaDust;
        if (pool) {
          for (let i = 0; i < n; i++) {
            const ang = rot + (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2);
            const spd = Math.random() * 2 + 2;
            // Mount.cs :3076-3081：noGravity + customData=mountedPlayer（230 型
            // UpdateDust :655-663 据此吸向玩家中心）；fadeIn 不设（原版无——
            // 误设会让 :2148 生长段错误涨 scale）
            const d = pool.spawn(x, y, 0, 0, 230, Math.cos(ang) * spd, Math.sin(ang) * spd);
            if (d) { d.noGravity = true; d.followPlayer = true; }
          }
          return;
        }
        this.spawnBurst(x, y, '#9FD8FF', n, 3, rot + Math.PI / 2, Math.PI / 2, { life: 26, grav: 0 });
      },
      // Tile.SmoothSlope(point, applyToNeighbors=true)（Mount.cs :3083 → Tile.cs :822）：
      // Mounts.smoothSlopeAt 1:1（四邻+自身按实心位形重整半砖/坡面），改格后标脏
      // ChunkCache 重烘焙（VanillaTiler 坡面帧消费 st.slope——不标脏则画面不更新）
      smoothSlope: (tx, ty) => {
        const st = this.world.store;
        smoothSlopeAt(st, tx, ty);
        this.chunks.markDirtyArea(tx - 1, ty - 1, tx + 1, ty + 1);
      },
      // CanKillTile 追加子项上下文（WorldGen.cs:62316-62358）：hardMode 门 +
      // Chest.CanDestroyChest（Chest.cs:590-606——锚格有非空内容不可锁）。
      // 宝箱记录在 world.chests（锚点=左上格），梳妆台共用同表
      killTileCtx: {
        hardMode: !!this.world.flags.hardMode,
        chestDestroyable: (cx, cy) => {
          const c = this.world.chests.find((cc) => cc.x === cx && cc.y === cy);
          if (!c) return true;   // 无登记 = 可毁（Chest.cs:594-597）
          return !c.items.some((it) => it != null && it.id > 0 && it.stack > 0);
        },
      },
    });
    this.mining = null;
  }

  /** 钻头坐骑拆墙（Player.PickWall :45328 1:1：damage 210 直接积累，≥100 即毁墙）。
   *  与锤墙路径（HitTile type-2 / 8t 冷却）不同——钻头无冷却、无 holdPound 语义 */
  private drillPickWall(tx: number, ty: number): void {
    if (!this.netCanEditTile()) return;
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    const wall = st.wall[st.idx(tx, ty)];
    if (wall <= 0 || wall === 350) return;    // 350 = 不可拆墙（CanPlayerSmashWall :45305）
    const total = this.hitTiles.addDamage(tx, ty, DRILL_PICK_POWER, 2);
    this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 2, 1.2);
    if (total >= 100) {
      this.hitTiles.clear(tx, ty, 2);
      st.setWall(tx, ty, 0);
      this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 8, 1.8);
      this.sfx.play('chop');
    }
  }

  private tryMine(tx: number, ty: number, power: number, toolType: 'pick' | 'axe' | 'hammer', speed: number, useTime?: number,
    opts?: { drill?: boolean }) {
    // 联机破坏保护（v3 房间制）：非房主禁挖/禁锤墙
    if (!this.netCanEditTile()) { this.mining = null; this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    // 范围检查（钻头坐骑豁免：Mount.UseDrill → Player.PickTile 无 IsInTileInteractionRange
    // 门，射程由光束自身 256px 钳制——Mount.cs :3155-3162）
    if (!opts?.drill && !this.inTileRange(tx, ty)) { this.mining = null; return; }
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
        p.lastDamageCause = { kind: 'defaultWrap' };  // 祭坛锤反噬:ByOther(3) 同族(applyTouchDamage)
        p.damage(dmg, p.cx - p.facing * 8, p.cy, false);
        this.addDamageNumber(p.cx, p.y, dmg, false, '#B080FF');
        this.sfx.play('hit', 1);
      }
      return;
    }
    // 锤：敲除背景墙（无墙则无事发生；也可清装饰）
    if (toolType === 'hammer') {
      // 矿车轨道锤击（Player.cs:45442-45447）：FrameTrack(pound) 循环切换连接/加速向。
      // 帧有变（FrameTrack 内 flag4）→ KillTile(fail:true)（Minecart.cs:1167-1170）——
      // 走 KillTile_PlaySounds case 314 = SoundID.Item52（WorldGen.cs:66587-66590）
      if (type === this.trackTile && this.trackTile !== 0) {
        if (this.tickCount - this.lastMineHitTick >= Math.max(8, speed)) {
          this.lastMineHitTick = this.tickCount;
          const ti = this.world.store.idx(tx, ty);
          const beforeX = this.world.store.frameX[ti], beforeY = this.world.store.frameY[ti];
          frameTrack(this.world.store, tx, ty, true);
          if (this.world.store.frameX[ti] !== beforeX || this.world.store.frameY[ti] !== beforeY) {
            this.playSfxFile('Item_52', 0.8, tx * TILE, ty * TILE);
          }
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
        this.breakTile(tx, ty, true);
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
        this.breakTile(tx, ty, true);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      this.mining = null;
      return;
    }
    // ---- 原版 HitTile 制 1:1（Player.cs:45032-45120 ItemCheck_UseMiningTools_ActuallyUseMiningTool
    //      + :52981 GetPickaxeDamage）：每击积累、阈值 100 破坏；冷却 = useTime
    //      （原版 toolTime=ApplyItemTime(useTime)，非 useAnimation——meleeSpeed
    //      不作用于 useTime（:4216），故不除 attackSpeedMult）。
    //      tileSpeed（砌砖刀/建筑背包）原版只作用【放置】（:39485），不进挖掘冷却----
    const mineMult = (this.player.buffs.has(BuffType.Mining) ? 0.75 : 1)  // 挖掘药水 -25%（:9818）
      * (this.player.usedAmbrosia ? 0.95 : 1);   // 仙馔蜜酒 pickSpeed-0.05(:12455-12459)
    // 食物 pickSpeed -= 5/10/15%（Player.cs:11534+）× 风筝 −15%（:9616）→
    // 冷却按原版 useTime/pickSpeed 缩短
    const pickMult = this.player.buffs.pickSpeedMult;
    // 钻头坐骑（drillPickTime=1）豁免手持工具的 8t 冷却下限——原版 PickTile 每束每
    // tick 可命中（Mount.cs :3092/:3139），节流由光束自身 cooldown 承担
    const cooldown = opts?.drill
      ? Math.max(1, Math.round(useTime ?? speed) * mineMult / pickMult)
      : Math.max(8, Math.round(useTime ?? speed) * mineMult / pickMult);
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
    // ★口径修正(2026-08-13 id 空间审计):TILE_NO_FAIL 曾被换算成内部 id 集合而
    // 此处传 sheet——68 项意图表仅 7 项碰巧命中,58 种无关方块(雪/冰/锡矿/平台…)
    // 被误判"一击秒挖",真正的 noFail 族(火把/草药)反而失效。改用 sheet 口径原表
    if (TILE_NO_FAIL_SHEETS.has(sheet)) {
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
      if (sheet === 107 || sheet === 221) dmg = Math.floor(power / 2);        // 钴/山铜矿(:52994)
      else if (sheet === 108 || sheet === 222) dmg = Math.floor(power / 3);    // 钯/精金矿(:52993)
      else if (sheet === 111 || sheet === 223) dmg = Math.floor(power / 4);    // 秘银/钛金矿(:52992)
      else if (sheet === 211) dmg = Math.floor(power / 5);                     // 绿藻矿
      else if (sheet === 226 || sheet === 237) dmg = Math.floor(power / 4);    // 蜥蜴砖
      else if (sheet === 25 || sheet === 203 || sheet === 117 || sheet === 58
        || TILE_DUNGEON_SHEETS.has(sheet)) dmg = Math.floor(power / 2);        // 黑檀/猩红/狱岩/地狱石砖/地牢砖
      else if (sheet === 48 || sheet === 232) dmg = power * 2;                 // 云块
      // 门槛归零（GetPickaxeDamage:53017-53075 gate 段——镐力不足=无伤害）
      const underSurf = ty > this.world.groundLevel;
      if (sheet === 211 && power < 200) dmg = 0;                              // 绿藻 200
      else if ((sheet === 107 || sheet === 221) && power < 100) dmg = 0;     // 钴/山铜 100（:53040）
      else if ((sheet === 108 || sheet === 222) && power < 110) dmg = 0;     // 钯/精金 110（:53044）
      else if ((sheet === 111 || sheet === 223) && power < 150) dmg = 0;     // 秘银/钛 150（:53048）
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
      this.breakTile(tx, ty, true);
      this.mining = null;
      // 破坏完成音：按材质区分
      if (toolType === 'axe') this.sfx.play('chop');
      else if (/stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(d.key)) this.sfx.play('tink');
      else this.sfx.play('dig');
    } else if (toolType === 'axe' && TREE_SHAKEABLE_SHEETS.has(sheet)) {
      // 未砍倒的斧击 → WorldGen.KillTile fail 分支（WorldGen.cs:63759）→ ShakeTree(:63169)。
      // 门 = IsShakeable（TileID.cs:163，仙人掌 80/倒木 488/假人 704 在 tileAxe 但不摇）；
      // 原版此路径要求 sItem.axe>0（Player.cs:45104），dual.type==='axe' 已含此语义
      this.tryShakeTree(tx, ty);
    }
  }

  /** 摇树总装（WorldGen.ShakeTree :63169-63462）：宿主世界门 + 掉落/实体落点注入 */
  private tryShakeTree(tx: number, ty: number): void {
    const w = this.world;
    const sf = w.seedFlags ?? {};
    const host: TreeShakeHost = {
      st: w.store,
      isDay: w.clock.isDay,
      // Main.halloween = 季节万圣 ∨ 月事件强制季（此处取并集，等价原版两旗同源）
      halloween: w.clock.halloween || this.forceHalloweenForToday,
      raining: !!w.weather?.raining,
      windyForButterflies: Math.abs(w.weather?.windSpeedTarget ?? 0) >= 0.4,  // NPC.cs:6801
      tenthAnniversary: !!sf.tenthAnniversary,
      getGoodWorld: !!sf.getGoodWorld,
      remixWorld: !!sf.remix,
      notTheBees: !!sf.notTheBees,
      drunkWorld: !!sf.drunkWorld,
      luck: this.player.luck,
    };
    const sinks: TreeShakeSinks = {
      // Item.NewItem 16×16 盒内均匀取点（原版 NewItem 语义）；速度 0 靠重力散落
      item: (vid, px, py, stack) => {
        const key = VI(vid);
        if (key) this.spawnDrop(px + Math.random() * 16, py + Math.random() * 16, key, stack, 0, 0);
      },
      npc: (vid, px, py, o) => this.spawnTreeShakeNpc(vid, px, py, o),
      // 弹 28 炸弹 / 75 快乐炸弹走引信弹通道（AI_016，fuse 180）：
      //  28 = PrepareBombToBlow :44134 炸弹族伤害 100 + ExplodeTiles :75262 半径 4 + 128 盒
      //  75 = :74934 Resize(128,128) 伤害 60 kb8——ExplodeTiles 表(:75262)无 75 → 不毁地形
      bomb: (vid, px, py, vx) => {
        const dmg = vid === 75 ? 60 : 100;
        const radius = vid === 75 ? 0 : (Game.EXPLODE_RADIUS[28] ?? 0);
        const p = new GrenadeProj(px, py, vx, 0, dmg, 180, vid,
          (ex, ey, ed) => this.explodeAt(Math.floor(ex / TILE), Math.floor(ey / TILE), ed,
            radius, radius > 0, 64, this.player.equipStats.armorPen, vid));
        this.entities.add(p, 'projectiles');
      },
      // 弹 655 蜂巢（AI_016 蜂巢裂蜂）未实装——登记跳过（见摇树报告跳过清单）
      beehive: () => { /* engine gap: Projectile 655 */ },
      leaf: (px, py, gore) => natureParticles.spawnLeaf(px, py, gore),
      ashDust: (px, py) => {
        // TreeGrowFX_AshShake :29796-29822 尘 31×~10 + 尘 6×~16 的粒子近似
        this.spawnParticles(px, py, '#8A6A52', 10, 1.6);
        this.spawnParticles(px, py, '#D8845A', 16, 2.2);
      },
    };
    const res = shakeTree(host, sinks, this.treeShakes,
      new RNG((Math.random() * 1e9) | 0), new RNG((Math.random() * 1e9) | 0), tx, ty);
    if (res && res.shook) {
      // 渲染查询喂点（非原版机制；原版命中反馈只有叶爆+裂缝+音）。
      // 键 = (树干列, 地面行) 与 getTreeShake 的树底归位一致；dir = 玩家朝向的反侧
      this.treeShakes.notePulse(res.bottomX, res.groundY, this.tickCount, this.player.facing >= 0 ? -1 : 1);
    }
  }

  /** 摇树小动物/敌怪落点：小动物桶不计怪上限；ai[1]=65（蜂群待命）与
   *  圆周初速 3（Utils.cs:1274）按原版覆写 */
  private spawnTreeShakeNpc(vid: number, px: number, py: number, o?: TreeShakeNpcOpts): void {
    const e = Enemy.fromVanilla(vid, px, py);
    if (!e) return;   // NPC 数据表缺口（见跳过清单）静默丢弃，与生成器同策略
    if (o?.vy !== undefined) e.vy = o.vy;
    if (o?.circularVel3) {
      const a = Math.random() * Math.PI * 2;
      e.vx = Math.cos(a) * 3;
      e.vy = Math.sin(a) * 3;
    }
    e.id = this.entities.nextId++;
    if (e.vanilla?.critter) this.entities.add(e, 'critters');
    else this.entities.add(e, 'enemies');
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

  /** 破坏 tile：处理树整体砍伐与 object 锚点。
   *  byPlayer=true = 玩家工具直接破坏（原版 AchievementsHelper.CurrentlyMining 门）：
   *  触发成就 tile 破坏通知（OOO_SHINY/EXTRA_SHINY/HEART_BREAKER/PHOTOSYNTHESIS）
   *  + BULLDOZER 挖掘计数（HandleMining） */
  breakTile(x: number, y: number, byPlayer = false) {
    const st = this.world.store;
    const type = st.get(x, y);
    if (type === 0) return;
    if (byPlayer) {
      const sheet = TILE_DEFS[type]?.vanilla?.sheet;
      if (sheet != null) this.achievements.notifyTileDestroyed(sheet);
      this.achievements.handleMining();
    }
    const def = TILE_DEFS[type];

    // 倒木（KillTile type 488 → mysticLogsEvent.FallenLogDestroyed，WorldGen.cs:49866）：
    // 仙女事件桩表重扫。原版调用点在 KillTile 尾部（tile 已清）——这里 breakTile
    // 尚未清格，先置延迟旗、下一 tick updateTime 前消费（见 _fallenLogRescan）
    if (type === TILE_BY_KEY['v_488_fallen_log']) {
      this._fallenLogRescan = true;
    }

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
    // 地牢裂砖族（481-483）：连锁崩塌 + Debris 弹片 + 掉同色地牢砖 + 专属音
    // （KillTile :63837-63895 段，见 breakCrackedBrick）。须在 object 锚点/
    // 通用 1×1 路径前拦（drop:null 会吞掉同色砖掉落）
    if (isCrackedSheet(def.vanilla?.sheet)) {
      this.breakCrackedBrick(x, y, true);   // 主动破坏（挖/炸/撞/扫掠/钩爪）默认 noItem=false
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
    // 圣诞树（tile 171）：CheckXmasTree :39647-39703——任一格破坏即整树清除 +
    // 掉圣诞树(1873)；锚点格 KillTile case 171（:65319-65326）逐槽 dropXmasTree
    // 回收装饰物。须在 object 锚点分支前拦：装饰位段写在锚点 frameY（如 1024），
    // 通用相位锚点算法（frameY%144==0）会错选锚点 → 清错 4×8 区域
    if (type === TILE_BY_KEY['v_171_christmas_tree']) {
      this.breakXmasTree(x, y);
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
          // SpawnOnPlayer（WorldGen.cs:48030 → NPC.cs:81273）：玩家屏幕外落点，
          // 非 summonBoss 的地表±55 列顶部扫描（2026-08-13 对齐）
          this.spawnBossOnPlayer(262);
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
      this.sfx.play('dig', 1, x * TILE + 8, y * TILE + 8);
      return;
    }
    // 门：竖排帧布局（Door.ts），通用锚点算法不适用，整扇移除
    const doorAnchor = clearDoorAt(st, x, y);
    if (doorAnchor) {
      this.spawnDrop(doorAnchor[0] * TILE + 8, doorAnchor[1] * TILE, typeof def.drop === 'number' ? VI(def.drop) : (def.drop ?? VI(25)), 1);
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
    // 锚桩 724 / 风筝桩 723（KillTile_DropItems :63739-63744 DropItemForTileBreak，
    //  两 TE 同基类 TELeashedEntityAnchorWithItem）：存物随破同击掉落 + 碎块（与
    //  挂物族两段式 pop 不同）；tile 本体无掉落（GetItemDrop case 723/724
    //  WorldGen.cs:66141-66145 break——drop:null 语义），故此整支路拦截在 1×1 通用
    //  路径之前，防 place_v_72x 幽灵掉落。TE OnRemoved → DespawnLeashedEntity
    //  （TELeashedEntityAnchor.cs:16-21）= 拴绳实体随之消散（leashed.removeAt）
    if (type === TILE_BY_KEY['v_724_critter_anchor'] || type === TILE_BY_KEY['v_723_kite_anchor']) {
      const kind = type === TILE_BY_KEY['v_724_critter_anchor'] ? 'critter_anchor' : 'kite_anchor';
      const stored = kind === 'critter_anchor'
        ? critterAnchorBreakDrop(this.world.furnitureItems, x, y)
        : kiteAnchorBreakDrop(this.world.furnitureItems, x, y);
      if (stored) {
        this.spawnDrop(x * TILE + 8, y * TILE, ITEM_DEFS[stored.id].key, stored.stack, 0, -2);
      }
      // 联机：锚桩消散广播 Remove（= 原版 LeashedEntity.Remove :385-398 → NetModule.Remove）。
      // 房主权威链路才上行（访客破坏走 tile 层 msg17，房主锚格巡检兜底下发 Remove）；
      // 掉落归房主侧生成 → 既有 msg21 掉落同步（原版 dedicated server 同语义）
      const leashedNetIds = this.leashed.netIdsAt(x, y);
      this.leashed.removeAt(x, y);
      if (leashedNetIds.length && this.net?.active && this.net.policy.isHost) {
        for (const id of leashedNetIds) this.net.sendLeashedRemove(id);
      }
      removeFurnitureAt(this.world.furnitureItems, x, y);
      st.setTile(x, y, 0);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 6, 1.5);
      this.sfx.play('dig', 1, x * TILE + 8, y * TILE + 8);
      return;
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
      let dropKey = def.drop === undefined
        ? (def.key.startsWith('v_') ? 'place_' + def.key : '')
        : (typeof def.drop === 'number' ? VI(def.drop) : def.drop);
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
      // 宝箱内容物掉出（BasicChest {21,467}——TileID.cs:315：两表都有战利品登记，
      //  曾只查 T.CHEST → 挖 467 族箱静默吞掉全部内容；陷阱箱 441/468 无内容
      //  记录（放置只登 T.CHEST），无物可掉，等价）
      if (type === T.CHEST || type === TILE_BY_KEY['v_467_chests_group_2']) this.dumpChest(ax, ay);
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
        sheet === 3 && fx === 144 ? VI(5)
          : sheet === 24 && fx === 144 ? VANILLA_ITEM_KEY_BY_ID[60]
            : sheet === 201 && fx === 270 ? VANILLA_ITEM_KEY_BY_ID[2887]
              : sheet === 71 && roll
                ? (roll.nextInt(40) === 0 ? VI_KEY.MUSHROOM_GRASS_SEEDS
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
    if (def.drop) this.spawnDrop(x * TILE + 8, y * TILE + 8, typeof def.drop === 'number' ? VI(def.drop) : def.drop, 1);
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
    // 距离判定 + 蜂后召唤（原版 SpawnOnPlayer(222)；boss 流程复用 summonBoss）。
    // 幼虫破碎无声（WorldGen.cs:53248-53274 只 gore 300-302+尘；Item173 只随
    // 蜜蜂分泌物物品 :43184）——公告 HasAwoken 走表，roar=false
    if (larvaSummonInRange(this.player.x, this.player.y, x, y)) {
      this.summonBoss('queen_bee', { roar: false });
    }
  }

  /** 圣诞树整树破碎（CheckXmasTree :39647-39703 + KillTile case 171 :65319-65326）：
   *  4×8 全清 → 掉圣诞树(1873) + 四槽装饰物逐件回收（dropXmasTree :39396-39426） */
  private breakXmasTree(x: number, y: number) {
    const st = this.world.store;
    const tree = TILE_BY_KEY['v_171_christmas_tree']!;
    const cell = xmasCell(st, x, y);
    if (!cell) { st.setTile(x, y, 0); return; }
    const { ax, ay } = cell;
    // 装饰回收须在清格前读位段（KillTile 逐格触发，锚点格 frameX>=10 才掉）
    const decorDrops: number[] = [];
    for (let obj = 0; obj < 4; obj++) {
      const s = xmasDecorStyle(st, ax, ay, obj);
      if (s > 0) decorDrops.push(xmasDecorItem(obj, s));
    }
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 8; dy++) {
        if (st.inBounds(ax + dx, ay + dy) && st.get(ax + dx, ay + dy) === tree) {
          st.setTile(ax + dx, ay + dy, 0);
        }
      }
    }
    this.chunks.markDirtyArea(ax, ay, ax + 3, ay + 7);
    const treeKey = VANILLA_ITEM_KEY_BY_ID[1873];
    if (treeKey) this.spawnDrop(ax * TILE + 8, ay * TILE, treeKey, 1, 0, -2);
    for (const vid of decorDrops) {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      if (k) this.spawnDrop(ax * TILE + 8, ay * TILE, k, 1, 0, -2);
    }
    this.spawnParticles(x * TILE + 8, y * TILE + 8, '#218755', 10, 2);
    this.sfx.play('dig', 1, x * TILE + 8, y * TILE + 8);
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
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, VI_KEY.WOOD, 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    for (const b of branchSpots) {
      this.spawnDrop(b.x * TILE + 8, b.y * TILE + 8, VI_KEY.WOOD, 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：较大概率（75%）掉 2-3 颗，沿树冠区域散落供补种
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, VI_KEY.ACORN, 1, (Math.random() - 0.5) * 3, -3 - Math.random());
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
  /** 暗影之球/恶魔之心整体破碎 = 原版 WorldGen.CheckOrb（cs:54259-54358）1:1：
   *  帧锚点定位（frameX∈{0,36} 是左列）→ 2×2 四格一起清除；
   *  战利品（:54264-54318）：首破（!shadowOrbSmashed）固定 0 档,之后 rand(5) 五选一
   *  ——腐化{96火枪+凝胶100, 64暗影珠, 162堕落荆棘, 115刺球, 111阳炎之怒} /
   *  猩红{800下作恶者+凝胶100, 1256猩红之心, 802腐叉, 3062, 1290}；
   *  计数 shadowOrbCount 满 3 → 最近玩家处召 EoW(13)/BoC(266) 并归零
   *  （:54320-54352,对侧已存活则跳过）；1/2 颗世界广播 misc[10/11]；
   *  陨石触发在 1.4 语义里不经砸珠（EoW/BoC 击杀链触发,见 boss 死亡段） */
  private smashOrbHeart(x: number, y: number) {
    const st = this.world.store;
    const i = st.idx(x, y);
    const fx = st.frameX[i];
    const isDemonHeart = fx >= 36; // 原版：frameX ≥ 36 = 恶魔之心（猩红世界）
    const ax = (fx === 0 || fx === 36) ? x : x - 1;
    const ay = st.frameY[i] !== 0 ? y - 1 : y;
    this.chunks.markDirtyArea(ax - 1, ay - 1, ax + 2, ay + 2);
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) st.setTile(ax + dx, ay + dy, 0);
    }
    // 战利品五档（首破固定 0 档;item id 走 VANILLA_ITEM_KEY_BY_ID 反查）
    const POOLS: Record<'orb' | 'heart', number[]> = {
      orb: [96, 64, 162, 115, 111],        // 腐化：火枪/暗影珠/堕落荆棘/刺球/阳炎之怒
      heart: [800, 1256, 802, 3062, 1290], // 猩红：下作恶者/猩红之心/腐叉/…
    };
    const first = !this.world.flags.shadowOrbSmashed;
    const roll = first ? 0 : Math.floor(Math.random() * 5);   // Main.rand.Next(5)
    const vid = POOLS[isDemonHeart ? 'heart' : 'orb'][roll];
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    if (key) this.spawnDrop(ax * TILE + 8, ay * TILE + 8, key, 1, (Math.random() - 0.5) * 3, -3);
    if (roll === 0) {
      const gelKey = VANILLA_ITEM_KEY_BY_ID[97];               // 凝胶 ×100（genRand.Next(100,101)）
      if (gelKey) this.spawnDrop(ax * TILE + 8, ay * TILE + 8, gelKey, 100, (Math.random() - 0.5) * 3, -3);
    }
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, isDemonHeart ? '#FF4060' : '#9A6AE0', 16, 2.5);
    this.sfx.play('tink', 1, ax * TILE + 16, ay * TILE + 16);
    this.cb.onToast(isDemonHeart ? Lang.text('Mods.SandboxWorld.Toast.DemonHeartSmashed') : Lang.text('Mods.SandboxWorld.Toast.ShadowOrbSmashed'));
    // 成就：SMASHING_POPPET（:54359 event 7——每次砸珠/心都触发）
    this.achievements.notifyProgressionEvent(7);
    this.world.flags.shadowOrbSmashed = true;
    this.world.shadowOrbCount++;
    if (this.world.shadowOrbCount >= 3) {
      // :54320-54352:第 3 颗召 EoW/BoC（同型在场则跳过）——计数只在【真召出】时
      // 归零（:54326 在召唤分支内）；被跳过时保持 ≥3，下一颗再试（此前无条件清零
      // 会把被吞掉的召唤永久丢失）
      const anyAlive = (id: number) => (this.entities.enemies as Enemy[]).some(
        (e) => !e.dead && e.vanillaId === id);
      if (isDemonHeart ? !anyAlive(266) : !anyAlive(13)) {
        // 第 3 颗暗影珠/猩红之心破坏召唤：生成瞬间无声（WorldGen CheckOrb 链
        // 无 PlaySound；Roar 只在蠕虫食物/血腥脊椎物品 :43112/:43199）
        this.summonBoss(isDemonHeart ? 'brain_of_cthulhu' : 'eater_of_worlds_head', { roar: false });
        this.world.shadowOrbCount = 0;
      }
    } else {
      this.newText(Lang.misc(this.world.shadowOrbCount === 2 ? 11 : 10), 120, 90, 160);
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
        const key = roll.nextInt(40) === 0 ? VI_KEY.MUSHROOM_GRASS_SEEDS
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
        const key = dropId === 3 ? VI_KEY.STONE : VANILLA_ITEM_KEY_BY_ID[dropId];
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
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, VI_KEY.WOOD, 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：与自有树同规则（75% 掉 2-3 颗，沿树冠区域散落供补种）
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, VI_KEY.ACORN, 1, (Math.random() - 0.5) * 3, -3 - Math.random());
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
      const wires = mode & TOOL_CUTTER ? 9999 : inv.countOf(VI_ID(530));
      const actuators = mode & TOOL_CUTTER ? 9999 : inv.countOf(VI_ID(849));
      const res = w.massWireOperation(a, [tx, ty], mode, wires, actuators);
      if (!(mode & TOOL_CUTTER)) {
        if (res.wire > 0) inv.remove(VI_ID(530), res.wire);
        if (res.actuator > 0) inv.remove(VI_ID(849), res.actuator);
      }
      this.player.useTime = 10;
      this.sfx.play('place');
      this.cb.onInventoryChanged();
      return;
    }
    // 五彩扳手:单点,用当前模式
    const mode = viIdFromKey(itemDef.key) === 3625 ? this.wireToolMode : (wt.place ?? 0);
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
    const wireHave = inv.countOf(VI_ID(530));
    const actHave = inv.countOf(VI_ID(849));
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
      if (needWire > 0) inv.remove(VI_ID(530), needWire);
      if (needActuator > 0) inv.remove(VI_ID(849), needActuator);
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

  /**
   * 油漆三件套使用（Player.cs 1:1）：
   *  - PlaceThing 分派序 :38923-38925（先于 Tiles/Walls，且不在 noBuilding 门内）
   *  - PlaceThing_Paintbrush :41254-41270：1071/1543，目标格 active → TryPainting(tile 通道)
   *  - PlaceThing_PaintRoller :41236-41252：1072/1544，目标格 wall>0 → TryPainting(wall 通道)
   *  - PlaceThing_PaintScrapper :41152-41234：1100/1545（IsPaintScraper 集 ItemID.cs:254），
   *    TryScrapping :41215-41234 先 tile 后 wall 清除（不消耗物品）；LongMoss :41166-41213
   *    对 tile 184 KillTile + 1/9 掉苔藓（4349+frameX/22，6-10 档特例 4377/4378/4389/5127/5128）
   *  - TryPainting/ApplyPaint :41291-41369：FindPaintOrCoating（弹药栏 54-57 优先）取油漆，
   *    成功改色才扣 1 个；同色格不消耗（paintTile/paintWall 的 b==color 守卫）
   *  冷却：useTime 10（Item.cs:13354-13373/13536-13545；Spectre 1543-1545 :18571-18583
   *  useTime 同 10 且 tileBoost+3）× tileSpeed/wallSpeed（ApplyItemTime :4221-4230）。
   *  涂层（paintCoating 4668/5344）系统未建——涂层物品不在 FindPaintSlot 判定内，惰性。
   */
  private tryUsePaintTool(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    if (!this.netCanEditTile()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // IsInTileInteractionRange(Simple, tileBoost + blockRange)（:41154/:41238/:41256）：
    // Spectre 三件套 tileBoost+=3（Item.cs:18583）；blockRange 同铺砖铺墙公式
    const spectre = itemDef.vid === 1543 || itemDef.vid === 1544 || itemDef.vid === 1545;
    const tb = (spectre ? 3 : 0)
      + (this.player.equipStats.tileRange ? 3 : 0)
      + (this.player.buffs.has(BuffType.Builder) ? 1 : 0);
    if (!this.inTileRange(tx, ty, tb)) return;
    const p = this.player;
    const i0 = st.idx(tx, ty);
    const paintDust: PaintDustHook = (x, y, np, op) => {
      // paintEffect（WorldGen.cs:44091-44112）：10 颗尘，半数 noGravity×1.2、半数×0.5
      const [r, g, b] = paintDustColor(np, op);
      const col = `rgb(${r},${g},${b})`;
      for (let k = 0; k < 10; k++) {
        this.spawnParticles(x * TILE + Math.random() * TILE, y * TILE + Math.random() * TILE,
          col, 1, k % 2 === 0 ? 1.2 : 0.5, { life: 40, size: 1 });
      }
    };
    const useAnimation = 15; // Item.cs useAnimation 15（三件套与 Spectre 同值）
    const useTimeBase = 10;  // Item.cs useTime 10
    // ApplyItemTime(sItem, tileSpeed/wallSpeed)（Player.cs:4221-4230）：useTime×乘子，下限 1；
    //  同时驱动 useStyle 1 挥动动画（useAnimation 15，autoReuse 持按链式重启）
    const applyItemTime = (multiplier: number) => {
      p.useTime = Math.max(1, Math.round(useTimeBase * multiplier));
      this.swing = { t: useAnimation, dur: useAnimation, item: p.inv.heldItem()?.id ?? 0 };
      this.swingHitSet.clear();
      this.swingTileCutSet.clear();
    };

    if (itemDef.paintTool === 'brush') {
      // :41262 目标格必须 active
      if (!(st.flags[i0] && st.type[i0] !== 0)) return;
      if (p.useTime > 0) return; // :41265 ItemTimeIsZero && itemAnimation>0 && controlUseItem
      applyItemTime(this.paintTileSpeed());
      this.tryPainting(tx, ty, false, paintDust);
      return;
    }
    if (itemDef.paintTool === 'roller') {
      // :41244 目标格必须有墙
      if (st.wall[i0] === 0) return;
      if (p.useTime > 0) return;
      applyItemTime(this.paintWallSpeed());
      this.tryPainting(tx, ty, true, paintDust);
      return;
    }
    // scraper
    // TryScrapping :41218——两通道均无漆 → 直接返回（不挥动不耗冷却）
    const hasPaint = (st.wall[i0] > 0 && st.paintWall[i0] > 0)
      || ((st.flags[i0] && st.type[i0] !== 0) && st.paint[i0] > 0);
    if (hasPaint) {
      if (p.useTime > 0) return;
      // :41225-41232 先 tile 后 wall；成功才 ApplyItemTime（tileSpeed/wallSpeed 各自）
      if (paintTile(st, tx, ty, 0, paintDust)) {
        applyItemTime(this.paintTileSpeed());
      } else if (paintWall(st, tx, ty, 0, paintDust)) {
        applyItemTime(this.paintWallSpeed());
      } else {
        p.useTime = 0; // 双原语都未改色（理论不可达）——不耗冷却
      }
      return;
    }
    // LongMoss :41166-41213：tile 184 → KillTile + 1/9 苔藓掉落
    if (st.type[i0] === (TILE_BY_KEY['v_184_moss_plants'] ?? -1) && st.flags[i0]) {
      if (p.useTime > 0) return;
      const frameX = st.frameX[i0];
      this.breakTile(tx, ty, true);                  // WorldGen.KillTile :41179（含掉落链）
      const i1 = st.idx(tx, ty);
      if (st.flags[i1] && st.type[i1] !== 0) return; // :41180-41183 仍 active → 中止
      applyItemTime(1);                              // ApplyItemTime(sItem)（:41184，无乘子）
      // :41189-41212 1/9 掉苔藓：4349+frameX/22，6-10 档特例
      if (Math.floor(Math.random() * 9) === 0) {
        const col = Math.floor(frameX / 22);
        let mossVid = 4349 + col;
        switch (col) {
          case 6: mossVid = 4377; break;
          case 7: mossVid = 4378; break;
          case 8: mossVid = 4389; break;
          case 9: mossVid = 5127; break;
          case 10: mossVid = 5128; break;
        }
        const mossKey = VANILLA_ITEM_KEY_BY_ID[mossVid];
        const mossId = mossKey !== undefined ? ITEM_BY_KEY[mossKey] : undefined;
        if (mossId !== undefined) {
          p.inv.add(mossId, 1);
          this.cb.onInventoryChanged();
        }
      }
    }
  }

  /** TryPainting/ApplyPaint（Player.cs:41291-41369）：paintingAWall 分通道，
   *  FindPaintOrCoating 取油漆，改色成功扣 1 个（同色不扣） */
  private tryPainting(tx: number, ty: number, paintingAWall: boolean, dust: PaintDustHook) {
    const st = this.world.store;
    const inv = this.player.inv;
    const slot = inv.findPaintSlot();
    if (slot < 0) return;                    // FindPaintOrCoating → null（:41293-41294）
    const paint = ITEM_DEFS[inv.slots[slot]!.id]?.paint ?? 0;
    if (paint === 0) return;
    if (paintingAWall) {
      // :41344 wallColor()!=paint && paintWall(...) → stack--
      if (st.paintWall[st.idx(tx, ty)] !== paint && paintWall(st, tx, ty, paint, dust)) {
        inv.removeAt(slot, 1);
        this.cb.onInventoryChanged();
      }
    } else {
      // :41357 color()!=paint && paintTile(...) → stack--
      if (st.paint[st.idx(tx, ty)] !== paint && paintTile(st, tx, ty, paint, dust)) {
        inv.removeAt(slot, 1);
        this.cb.onInventoryChanged();
      }
    }
  }

  /** Player.tileSpeed（Player.cs:2338 = 1f；Builder 药水/便携水泥机族 +25%，:9842） */
  private paintTileSpeed(): number {
    return this.player.equipStats.tileRange != null || this.player.buffs.has(BuffType.Builder) ? 0.75 : 1;
  }

  /** Player.wallSpeed（Player.cs:2336 = 1f；同上 +25% 加速档） */
  private paintWallSpeed(): number {
    return this.player.equipStats.wallSpeed || this.player.buffs.has(BuffType.Builder) ? 0.75 : 1;
  }

  private tryPlace(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    if (!this.netCanEditTile()) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // ---- 方块交换 Block Swap（1.4.4+,Player.cs:39182/:39260-39383;原版默认开
    //  builderAccStatus[10]==0 → TileReplacementEnabled）。手持放置物对准【可替换
    //  块】→ 先破坏旧块（完整掉落链）再走正常放置。门禁（:39275-39284 + 核心支线）:
    //  放置物黑名单 DoesntPlace{2,60,70,109,199,23,661,662,633}(草/丛/蘑菇族);
    //  目标黑名单 DoesntGetReplaced{58,225,171,127,481,482,483,423}(狱岩/晶簇等);
    //  tileCut 族/家具(frameImportant)非平台不换;同型不换;旧块掉落物==放置物
    //  不换(:39371-39377 防土换土无限);绳索目标仅换轨道/平台(:39354-39359 简化:
    //  绳一律不换)。平台/火把/篝火/箱/柜 style 族分支(:39299-39349)登记未接。
    if (itemDef.tile) {
      const targetType = st.get(tx, ty);
      if (targetType !== 0) {
        const placeVid = viIdFromKey(itemDef.key);
        const tdef = TILE_DEFS[targetType];
        const NO_SWAP_PLACE = new Set([2, 60, 70, 109, 199, 23, 661, 662, 633]);
        const NO_SWAP_TARGET = new Set([58, 225, 171, 127, 481, 482, 483, 423]);
        const tsheet = tdef?.vanilla?.sheet ?? -1;
        // tileCut 族(草类)由 decor 近似覆盖;framed 家具不换;solid!==false 排除非实心
        // (|| 平台 19 族可换——优先级括号已显式)
        const solidish = tdef ? (tdef.solid || tdef.vanilla?.sheet === 19) : false;
        let swapOk = !NO_SWAP_PLACE.has(placeVid) && !NO_SWAP_TARGET.has(tsheet)
          && !(tdef?.decor ?? false) && !tdef?.framed && solidish;
        // style 族交换分支(:39299-39349——平台/火把/篝火/箱/柜的逐 style 换,
        // 同型不同 style 可换;frameX/frameY 偏差超出该 style 的宽 → swap。2026-08-13)
        let styleSwap = false;
        if (!swapOk) {
          const ts = tdef?.vanilla?.sheet ?? -1;
          if (ts === 19 && placeVid >= 0) {
            // 平台(:39299-39301):frameY/18 != placeStyle → 换
            styleSwap = Math.floor(st.frameY[st.idx(tx, ty)] / 18) !== (itemDef.placeStyle ?? 0);
          } else if (ts === 4 && placeVid >= 0) {
            // 火把(:39308-39321):frameY/22 != placeStyle → 换
            styleSwap = Math.floor(st.frameY[st.idx(tx, ty)] / 22) !== (itemDef.placeStyle ?? 0);
          } else if (ts === 215 && placeVid >= 0) {
            // 篝火(:39324-39335):frameX/54 != placeStyle → 换
            styleSwap = Math.floor(st.frameX[st.idx(tx, ty)] / 54) !== (itemDef.placeStyle ?? 0);
          } else if (tdef?.vanilla?.sheet === 21 && placeVid >= 0) {
            // 箱(:39337-39344):frameX/36 != placeStyle → 换
            styleSwap = Math.floor(st.frameX[st.idx(tx, ty)] / 36) !== (itemDef.placeStyle ?? 0);
          } else if (tdef?.vanilla?.sheet === 88 && placeVid >= 0) {
            // 柜(:39346-39349):frameX/54 != placeStyle → 换
            styleSwap = Math.floor(st.frameX[st.idx(tx, ty)] / 54) !== (itemDef.placeStyle ?? 0);
          }
        }
        if (styleSwap) { swapOk = true; }
        if (swapOk) {
          const tileIdHere = TILE_BY_KEY[itemDef.tile!];
          if (tileIdHere !== targetType && tdef?.drop !== itemDef.key) {
            this.breakTile(tx, ty, true);   // 旧块完整掉落链(音效+成就同破坏)
          }
        }
      }
    }
    // 实例级 placeStyle 覆盖（旗 place_v_91:实例存 bannerId,2026-08-13——类级
    // itemDef.placeStyle 缺省 0 会把所有旗放成同一帧,旗 buff 解码失活）
    const heldInst = this.player.inv.heldItem();
    if (heldInst?.placeStyle !== undefined) {
      itemDef = { ...itemDef, placeStyle: heldInst.placeStyle };
    }
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
    if (viIdFromKey(itemDef.key) === 27) {
      if (st.get(tx, ty + 1) !== T.GRASS) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.AcornGrassOnly'));
        return;
      }
      // 成就：种橡实（Player.PlantAcorn → PlantedAcorn，CONSERVATIONIST 计数）
      this.achievements.plantedAcorn();
    }
    const ow = def.w ?? 1, oh = def.h ?? 1;
    // 绳索(RopeCoil 语义):从放置点向下延伸至实心/最多 10 格
    if (viIdFromKey(itemDef.key) === 965) {
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
        // ty 是顶部行（放置时鼠标指向顶部锚点）→ dy2=0 即顶行，frameY = dy2*18 正确。
        // 单格帧合成统一走 framedCellFrame（旗帜 91 逆写 / 竖排族布局表 / 通用
        // style*fw*18）——tests/cage-placement 用同一入口做放置帧锚端到端断言
        if (isVanillaStyle) {
          const [fx2, fy2] = framedCellFrame(
            def.vanilla?.sheet ?? -1, def.vanilla?.fw ?? 1, itemDef.placeStyle ?? 0, dx2, dy2);
          st.setTile(px, py, tileId, fx2, fy2);
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
    // 锚桩 724（TELeashedEntityAnchorWithItem.PlaceFromPlayerPlacementHook :43-58）：
    // 放置即把手持捕获小动物写入 TE（InsertItem(itemType) :60-64 → RespawnLeashedEntity
    // :47-53）——等价记录槽 0 落手持物 + 即刻生成拴绳小动物（InsertItem 链的实体半段，
    // entities/LeashedCritter.ts）。消耗走下方通用的 inv.removeAt（consumable 语义）。
    // 放置帧档 = prototype.anchorStyle（Player.cs:42771-42773 覆写 previewPlaceStyle，
    // 与物品自身 placeStyle 解耦——蝶族物品 placeStyle=物种变体 1-8 而桩档恒 4）
    if (tileId === TILE_BY_KEY['v_724_critter_anchor']) {
      const held = this.player.inv.heldItem();
      if (held) {
        const vid = viIdFromKey(ITEM_DEFS[held.id]?.key ?? '');
        if (vid > 0) {
          st.setTile(tx, ty, tileId, anchorStyleOfItem(vid) * 18, 0);
          // 联机：实体层房主权威（= 原版 AddNewEntity :357-373 netMode==2 → FullSync）。
          // 访客不写本地 furniture 记录也不生成实体——记录/实体唯一权威 = 房主
          //（防访客破坏时本地掉物与房主巡检掉物双份），仅发 PlaceRequest（sub3），
          // 房主校验后落记录+实体并广播 FullSync 回来重建（信任边界见 net/leashedSync.ts）
          if (this.net?.active && !this.net.policy.isHost) {
            this.net.sendLeashedPlaceRequest(tx, ty, vid);
          } else {
            critterAnchorPlace(this.world.furnitureItems, tx, ty, held);
            const e = this.leashed.spawnCritter(tx, ty, vid, { placeStyle: itemDef.placeStyle ?? 0 });
            if (e && this.net?.active) this.net.sendLeashedFull(e);
          }
        }
      }
    }
    // 风筝桩 723（TEKiteAnchor 同基类链 :43-65）：写入手持风筝 + 生成拴绳风筝
    // （projType = item.shoot，CreateLeashedEntity :54-62）。风筝 consumable=false，
    // 但钩子内 --stack（TELeashedEntityAnchorWithItem.cs:46-48）= 放置消耗 1——
    // 与下方通用 removeAt(selected,1) 等量，无需另扣。联机分支同 724（访客仅请求）
    if (tileId === TILE_BY_KEY['v_723_kite_anchor']) {
      const held = this.player.inv.heldItem();
      if (held) {
        const vid = viIdFromKey(ITEM_DEFS[held.id]?.key ?? '');
        const proj = vid > 0 ? KITE_ITEM_PROJ[vid] : undefined;
        if (proj !== undefined) {
          // Size = _dummy.Size（LeashedKite.SetDefaults :32-35 → Projectile.SetDefaults →
          // Projectile.DefaultToKite :10133-10140 width=height=4；提取表缺条目时兜底 4）
          const pd = projectileData(proj);
          if (this.net?.active && !this.net.policy.isHost) {
            this.net.sendLeashedPlaceRequest(tx, ty, vid);
          } else {
            kiteAnchorPlace(this.world.furnitureItems, tx, ty, held);
            const e = this.leashed.spawnKite(tx, ty, proj, this.leashedEnv(), pd?.width ?? 4);
            if (e && this.net?.active) this.net.sendLeashedFull(e);
          }
        }
      }
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
    // 马桶(497)（TileObjectData :4167-4184 与椅 15 同构：Style1x2+WrapLimit2+Multiplier2+
    // PaddingFix(0,2)+Direction=PlaceLeft/PlaceRight；TileDrawing.cs:6344-6350 `tileFrameY/40`
    // 行带实证 → 变体沿 Y 步 40（此前误写 X 步 36）；朝向档 frameX += 18（同椅 15）：
    // 重写帧 = (facing==1?18:0) + 列内偏移，Y = placeStyle*40 + 行内偏移
    if (def.vanilla?.sheet === 497) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        for (let dx3 = 0; dx3 < ow; dx3++) {
          const px2 = tx + dx3, py2 = ty + dy2;
          if (!st.inBounds(px2, py2)) continue;
          st.setTile(px2, py2, tileId,
            (this.player.facing === 1 ? 18 : 0) + dx3 * 18,
            (itemDef.placeStyle ?? 0) * 40 + dy2 * 18);
        }
      }
    }
    // 训练假人放置：锚点生成假人 NPC（TETrainingDummy.Activate）
    if (tileId === TILE_BY_KEY['v_378_target_dummy']) this.spawnDummyAt(tx, ty);
    // 消耗门（Player.cs:42602：itemTime==itemTimeMax && item.consumable 才扣 1）——
    // consumable=false 的放置物放置不消耗：5464 Mitey-Titey（Item.cs:43089 显式
    // 覆写 DefaultToPlaceableTile 的 consumable=true）。数据源 = vanilla-itemcombat
    // （extract-itemfunc 漏录该件的 consumable 键）；legacy/缺条目维持原消耗行为
    if (itemCombat(viIdFromKey(itemDef.key) ?? -1)?.consumable !== false) {
      this.player.inv.removeAt(this.player.inv.selected, 1);
    }
    this.player.useTime = 14;
    this.sfx.play('place');
    this.cb.onInventoryChanged();
  }

  /** LeashedEnv 装配（拴绳实体每帧环境：视觉帧钟/昼夜/风/玩家位/点光通道） */
  private leashedEnv(): import('../entities/LeashedCritter').LeashedEnv {
    const w = this.world;
    return {
      timeForVisualEffects: visEffectFrames(),
      dayTime: w.clock.isDay,
      worldSurface: w.groundLevel,
      // Main.WindForVisuals（视觉平滑风）≈ weather.windSpeedCurrent（renderer 的
      // 风摆共用同一读法，见 renderEnv.wind 注）
      windForVisuals: w.weather?.windSpeedCurrent ?? 0,
      cloudAlpha: w.weather?.cloudAlpha ?? 0,
      playerCx: this.player?.cx ?? 0,   // afterWorldLoad 阶段 player 尚未构造（读档/建世链）
      playerCy: this.player?.cy ?? 0,
      addLight: (i, j, r, g, b) => {
        if (this.world.store.inBounds(i, j)) this.lighting.addLight(i, j, r, g, b);
      },
      // 原版 Dust 池（金系 43 / Recall 15 / 地狱蝶 6 / 帝皇蝶 267 / 妖精 278——
      // LeashedCritter.ts 各族 VisualEffects 源码行号）+ 金系照度门取光
      dust: {
        spawn: (x, y, bw, bh, type, sx = 0, sy = 0, alpha = 0,
          color: { r: number; g: number; b: number; a: number } | null = null, scale = 1) =>
          this.vanillaDust.spawn(x, y, bw, bh, type, sx, sy, alpha,
            color as import('../fx/VanillaDust').DustColor | null, scale),
        clone: (d) =>
          // Dust.CloneDust（Dust.cs:260-288）：字段级复制回池（EmpressButterfly
          // 二段尘 :50-55）——实现归引擎（含 rotation/frame 复制与 noLightEmittance
          // 不复制的原版语义），见 VanillaDust.clone
          this.vanillaDust.clone(d as import('../fx/VanillaDust').VDust),
      },
      lightAt: (i, j) => this.lighting.lightAt(i, j),
    };
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
      || type === TILE_BY_KEY['v_356_enchanted_sundial'] || type === TILE_BY_KEY['v_663_enchanted_moondial'] // 日晷/月晷右键改世界时间态
      || FURNITURE_TILE_KIND.has(type) // 挂物族右键会改存放物（世界状态）
      || sh === 35 || sh === 139 || sh === 207 || sh === 410 || sh === 480 || sh === 509 || sh === 455
      || sh === 425
    );
    if (editDenied) { this.netDeny(Lang.text('Mods.SandboxWorld.Toast.RoomProtectTiles')); return; }
    // ---- 拴绳锚桩 724 / 风筝桩 723 右键取回存物（本仓扩展交互：原版锚桩无
    //  OnPlayerInteraction——TELeashedEntityAnchorWithItem 仅破坏掉物一路，
    //  右键取回为本仓新增，见 net/leashedSync.ts applyLeashedRetrieve 备案）。
    //  房主/单人 = 本地权威直取；访客 = sub4 请求房主代取（furniture 记录只在
    //  房主端，= msg31 箱子请求同款模式），房主弹存物+消散实体后掉物走既有
    //  msg21，访客收包拾取。锚桩 tile 本体不动（破坏仍走 msg17 链）----
    if (type === TILE_BY_KEY['v_724_critter_anchor'] || type === TILE_BY_KEY['v_723_kite_anchor']) {
      const kind = type === TILE_BY_KEY['v_724_critter_anchor'] ? LEASHED_KIND_CRITTER : LEASHED_KIND_KITE;
      if (this.net?.active && !this.net.policy.isHost) {
        this.net.sendLeashedRetrieveRequest(tx, ty, kind);
      } else {
        this.retrieveLeashedAnchor(tx, ty, kind);
      }
      this.input.rightDown = false;
      return;
    }
    // ---- 挂物族（物品框 395/武器架 471/模特 470/帽架 475/食物盘 520/展示罐 698；
    //  Player.cs:32093-32121 右键分支 → TE*.OnPlayerInteraction，全量语义在
    //  world/FurnitureItems.ts）----
    if (FURNITURE_TILE_KIND.has(type)) {
      this.useFurnitureInteraction(tx, ty, FURNITURE_TILE_KIND.get(type)!);
      return;
    }
    // ---- 梳妆台 tile 88（Player.cs:32409-32479 右键分支）----
    // 1.4 起梳妆台不是储物容器：右键下半（frameY!=0）→ Main.OpenClothesWindow
    //（Main.cs:43568 更衣界面：衣服样式+六色+音色，随角色档持久化）；上半（frameY==0）
    // 仅是旧版残留的关箱路径（现代档在梳妆台位找不到 chest，无操作）。
    if (type === TILE_BY_KEY['dresser']) {
      const fy = st.frameY[st.idx(tx, ty)];
      if (fy !== 0) {
        this.closeNpcDialog();   // :32464 SetTalkNPC(-1) + 关牌/清聊天
        if (this.player.appearance) this.cb.onClothesWindow?.(this.player.appearance);
      }
      this.input.rightDown = false;
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
      // 床（PC:32183-32228）：上侧（枕）悬停=设重生点；下侧（脚）悬停=睡觉（无夜间限制）
      const fx = this.world.store.frameX[this.world.store.idx(tx, ty)];
      const bottomSide = (fx % 72 < 36) !== (Math.floor(fx / 72) === 1); // PC:32869-32878
      if (bottomSide && Math.hypot(this.player.cx - (tx + 2) * TILE, this.player.cy - ty * TILE) <= 96) {
        // StartSleeping（SH:155-191）：搬锚点+清速；再点同床=起床（SH:170-173）
        this.player.sleeping = !this.player.sleeping;
        if (this.player.sleeping) {
          this.player.timeSleeping = 0;
          this.player.vx = 0; this.player.vy = 0;
          this.player.x = (tx + 1) * TILE; this.player.y = (ty - 1) * TILE; // 锚点=床上格
          this.player.facing = Math.floor(fx / 72) === 0 ? -1 : 1; // SH:204-210 床朝向
        }
      } else {
        this.world.spawnX = tx + 1;
        this.world.spawnY = ty - 1;
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.SpawnSet'));
      }
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_356_enchanted_sundial']
      || type === TILE_BY_KEY['v_663_enchanted_moondial']) {
      // 附魔日晷/月晷（Player.cs:32166-32183 右键分支 → Main.Sundialing/Moondialing
      // :6240-6268）：冷却为 0 且未在快进 → 置 fastForwardTimeToDawn/Dusk + 冷却 8 天，
      // 时间按 dayRate=60 快进到黎明/黄昏；音效 SoundID.Item4。冷却随存档持久化
      // （WorldFile.cs:1311/1417），血月夜清零（StartNight :64892-64893）
      const sundial = type === TILE_BY_KEY['v_356_enchanted_sundial'];
      if (sundial ? (!this.world.fastForwardTimeToDawn && this.world.sundialCooldown === 0)
        : (!this.world.fastForwardTimeToDusk && this.world.moondialCooldown === 0)) {
        if (sundial) { this.world.fastForwardTimeToDawn = true; this.world.sundialCooldown = 8; }
        else { this.world.fastForwardTimeToDusk = true; this.world.moondialCooldown = 8; }
        this.sfx.play('drink'); // SoundID.Item4
      }
      this.input.rightDown = false;
    } else if (type === TILE_BY_KEY['v_494_golf_tee']) {
      // 高尔夫球座（Player.cs:31871-31882 右键分支）：杀全部自有球 →
      // GetPreferredGolfBallToUse → 在座上重摆（ai[1]=-1 待发态，出手前不走物理）
      for (const e of this.entities.projectiles) {                     // :31874-31880
        const b = e as GolfBall;
        if (b instanceof GolfBall && !b.dead && b.isMine) b.dead = true;
      }
      const projId = this.preferredGolfBallProjId();
      this.spawnGolfBall(tx * 16 + 8.5, ty * 16 + 6, projId, true, 0, 0);  // :31881
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
      // 成就：派对进行中（prog 25，与自然派对同源）
      if (partyIsUp(this.partyState)) this.achievements.notifyProgressionEvent(25);
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
    const key = VANILLA_ITEM_KEY_BY_ID[drop.itemType];
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
    const key = VANILLA_ITEM_KEY_BY_ID[vanillaItemId];
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
    // ---- 锁定箱开锁（Player.cs:32684-32724 钥匙解析 + Chest.Unlock :335-407 样式表 1:1）----
    // 锁定 = 样式属性（Chest.IsLocked :282-297，帧区间集）：tile21 style
    // 2(72-106)=金钥匙327 / 4(144-178)=暗影钥匙329 / 23-27(828-1006)=群系钥匙
    // 1533+style-23 / 36/38/40=金钥匙；tile467 style13=4714（群系钥匙需 downed 世花）
    // 解锁 = 四格 frameX - 偏移（36 / 180）+ Sound 22 + 成就（2→19；23-27/467-13→20）
    const cxy0 = chest as { x?: number; y?: number };
    if (cxy0.x !== undefined && cxy0.y !== undefined) {
      const st = this.world.store;
      const sheet = TILE_DEFS[st.get(cxy0.x, cxy0.y)]?.vanilla?.sheet ?? -1;
      const fx = st.frameX[st.idx(cxy0.x, cxy0.y)];
      const style = Math.floor(fx / 36);
      // 样式锁定集（Chest.IsLocked :288-295）——地狱暗影箱(style 4)无数据旗标也走锁
      const styleLocked = sheet === 21
        ? (fx >= 72 && fx <= 106) || (fx >= 144 && fx <= 178) || (fx >= 828 && fx <= 1006)
          || (fx >= 1296 && fx <= 1330) || (fx >= 1368 && fx <= 1402) || (fx >= 1440 && fx <= 1474)
        : sheet === 467 && style === 13;
      if (!styleLocked && chest.locked) {
        // 陈旧数据旗标（导入存档脏数据）：样式不在锁定集 → 原版 IsLocked=false 视为
        // 未锁，清旗标直开（防误走解锁分支把金箱帧错转到木箱）
        chest.locked = false;
      }
      if (styleLocked) {
      let keyVid = 327;              // 默认金钥匙（num78 初值，:32688）
      let frameDelta = 36;           // 解锁帧回退
      let event = 0;                 // 成就事件（0=无）
      let plantGate = false;
      if (sheet === 21) {
        if (fx >= 144 && fx <= 178) { keyVid = 329; frameDelta = 36; }            // 锁暗影箱→暗影钥匙
        else if (fx >= 828 && fx <= 1006) {
          keyVid = 1533 + (style - 23); frameDelta = 180; plantGate = true;        // 群系锁箱
        } else if (style === 2) { keyVid = 327; frameDelta = 36; event = 19; }     // 锁金箱（36/38/40 无事件）
      } else if (sheet === 467) {
        keyVid = 4714; frameDelta = 36; plantGate = true;                          // 沙漠锁箱
      }
      if (sheet === 467 || (fx >= 828 && fx <= 1006)) event = 20;                  // BIG_BOOTY（:363/:384/:458）
      // 世花门（:357-360/:378-381：未击败拒绝，钥匙不耗）
      if (plantGate && !this.world.flags['downed_262']) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedDownedPlant'));
        this.input.rightDown = false;
        return;
      }
      // ★ 暗影钥匙 329 可重复使用（Player.cs:32716 flag16=num78!=329 → stack-- 只
      //   在非 329 时执行；bank4 分支 :32750 同门）——只验持有不消耗
      if (keyVid === 329 ? this.countVanillaItem(329) <= 0 : !this.consumeVanillaItem(keyVid)) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestLocked'));
        this.input.rightDown = false;
        return;
      }
      chest.locked = false;
      this.sfx.play('tink');   // Sound 22（:389）
      // 四格 frameX 回退（:390-404）——2×2 各格同偏移；直写帧后手动标脏
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          const tx = cxy0.x + dx, ty = cxy0.y + dy;
          if (!st.inBounds(tx, ty)) continue;
          const ti = st.idx(tx, ty);
          st.frameX[ti] = Math.max(0, st.frameX[ti] - frameDelta);
        }
      }
      this.chunks.markDirtyArea(cxy0.x - 1, cxy0.y - 1, cxy0.x + 2, cxy0.y + 2);
      if (event > 0) this.achievements.notifyProgressionEvent(event);
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.ChestUnlocked'));
      this.cb.onInventoryChanged();
      }
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
    // 成就：打开金箱（Player.cs:32782-32790：sheet21 frameX∈[36,72) = 金箱 style1
    // 开箱 → event 16 I_AM_LOOT「在地下找到一个金宝箱并看看里面」）
    if (cxy.x !== undefined && cxy.y !== undefined) {
      const stI = this.world.store;
      const sheetI = TILE_DEFS[stI.get(cxy.x, cxy.y)]?.vanilla?.sheet ?? -1;
      const fxI = stI.frameX[stI.idx(cxy.x, cxy.y)];
      if (sheetI === 21 && fxI >= 36 && fxI < 72) {
        this.achievements.handleSpecialEvent(16,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
      }
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
    // 成就：TEMPLE_RAIDER（WorldGen.cs:37641 event 22——祭坛使用成功）
    this.achievements.notifyProgressionEvent(22);
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
    // 公告 SpawnOnPlayer case 245（NPC.cs:81328）——咆哮已在祭坛使用点播（:32322）
    this.announceBossSummon(245);
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
        this.sfx.play('killed', 1, tx * TILE + 8, ty * TILE + 8);  // SoundID.NPCDeath7
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
        // 原版 NPC.NewNPC 的 Y 是 Bottom 锚（SpawnMonsterFromGate(base.Bottom)
        // NPC.cs:43103 / SummonCrystalDirect :589-597 / RaiseGoblins :766 同语义）;
        // fromVanilla 是中心锚 → 上移半身高,否则食人魔(124px)等高怪出生即半埋,
        // LOS 断链触发 AI_107 flag2 穿墙相位(永远飞不回地面)。
        e.y -= e.h / 2;
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
      // Main.CurrentFrameFlags.ActivePlayersCount（DD2Event.cs:1267/:1578）：本机 + 远端
      activePlayersCount: () => 1 + (this.net?.players.size ?? 0),
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
  /** 天气环境音常驻循环轨（SceneState.cs 暴风雪双轨式：轨不拆、音量每帧跟随；
   *  rain 走既有 setRain（MusicID 28 RainAmbience），其余走 Sfx.playLoop） */
  private weatherLoops: Partial<Record<import('./Sfx').WeatherLoopName, import('./Sfx').SfxLoop>> = {};
  private weatherLoopVol: Record<string, number> = {};
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
  /** 本夜流星强度（Star.starfallBoost——每夜 NightSetup 重掷；坠星频率乘子） */
  private starfallBoost = 1.0;
  /** 本夜天幕流星已掷(_canShowMeteorFall 位;入夜重置) */
  private _skyMeteorShown = false;
  /** 陨石坠落旗标（WorldGen.spawnMeteor :4156——入夜 roll/EoW 击杀置位，夜半消费；
   *  WorldFile :1301/:2098 持久化 → 挂 world.flags 随存档走） */
  private get meteorPending(): boolean { return !!this.world?.flags.spawnMeteor; }
  private set meteorPending(v: boolean) { if (this.world) this.world.flags.spawnMeteor = v; }
  private spawnEyePending = false;
  /** 本地玩家高尔夫状态（Main.LocalGolfState，GolfState.cs 1:1：折扣计时/轨迹分） */
  private readonly golfState = new GolfState();
  /** 高尔夫哨 4095 引导触发点（useAnimation 10 → itemAnimation==2 即 useTime<=8；
   *  Player.cs:42921-42924） */
  private golfWhistleAt: number | null = null;
  /** TEMP-DBG（ucw gate 打点，updateUse 内 ⑯帧计数——调试会话遗留，勿删待其收尾） */
  private _gateDbg?: { n: number; held: number; useT: number; cwOk: number; cwKinds: Record<string, number> };
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
      dayRate: w.dayRate(), // Main.cs:64320-64409 天气全链吃 dayRate（旅程倍率/冻结/全员睡×5/晷快进，曾写死 1）
      dayTime: w.clock.isDay,
      dayTimeTicks,
      playerStrongEnough: this.player.maxHp >= 120,
      playerReadyForKingSlime: this.player.maxHp > 140 && this.player.defense > 8, // Main.cs:64645
      expertMode: w.isExpert,   // Main.expertMode（Main.cs:2775）：史莱姆雨自然触发门（:64373-64409 就绪||专家）
      zoneRain: !!this.scene?.zoneRain,        // ZoneRain 派生位（SceneMetrics.cs:700——暴风雪门 SceneState.cs:102）
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
      // 旅程力量·冻结风/雨（CreativePowers.cs:1482/:1516——Main.cs:58247/:64329/:64357
      // 原版消费点无 IsJourneyMode 门：旅程角色在经典世界开力量同样生效，状态随
      // 该世界存档；非旅程世界缺省 false 无行为差）
      freezeWind: !!w.journeyPowers?.freezeWind,
      freezeRain: !!w.journeyPowers?.freezeRain,
      // 天气环境音循环门（SceneState.cs:101/190-191）：雪原带 + 是否在背景墙后
      zoneSnow: !!this.scene?.zoneSnow,
      behindBackwall: !!this.scene && (() => {
        // SceneMetrics.cs:671 BehindBackwall = 玩家所在格 wall>0
        const st = w.store;
        const ptx = Math.floor(this.player.cx / TILE);
        return st.inBounds(ptx, pty) && st.wall[st.idx(ptx, pty)] !== 0;
      })(),
      onAmbience: (v) => this.applyWeatherLoops(v),
      // 金币雨玩家锚定（WorldGen.cs:71825 FindClosest 单机等价）
      playerForCoinRain: { x: this.player.cx, active: true, dead: this.player.dead },
      onCoinRain: (x, y, type, stack) => {
        // 非实心 32×32 门（WorldGen.cs:71847）
        const st = w.store;
        const tx0 = Math.floor(x / 16), ty0 = Math.floor(y / 16);
        let solid = false;
        for (let dx = 0; dx <= 1 && !solid; dx++) for (let dy = 0; dy <= 1; dy++) {
          if (st.inBounds(tx0 + dx, ty0 + dy) && st.isSolid(tx0 + dx, ty0 + dy)) { solid = true; break; }
        }
        if (solid) return;
        // type 即原版钱币 item id 71/72/73(铜/银/金,Weather.cs 对齐 cs:71836)——
        // 曾整体 +1 错位(铜雨掉银/银雨掉金/金雨掉铂,每次降雨 ×100 通胀)
        const key = VI(type);
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
      // PvP 半边（Player.cs:9931-9946）：hostile 时 200px 内敌对玩家 60t 一跳 20 直伤
      // （死因 16 inferno）+ 地狱火 323 2s——经 msg44 bit6 广播意向、被击端本地结算
      // （光环为 buff 驱动不随弹幕同步,故走独立意向位；被击端 per-owner 60t 冷却）
      if (this.net?.active && this.net.policy.pvpAllowed && this.player.hostile && hitTick) {
        for (const rp of this.remotePlayerProxies) {
          const slot = (rp as unknown as { __netSlot?: number }).__netSlot;
          if (slot === undefined || rp.dead) continue;
          if (!inOpposingTeam(this.player, rp)) continue;
          if (Math.hypot(rp.cx - this.player.cx, rp.cy - this.player.cy) > 200) continue;
          this.net.sendStrikePlayer(slot, 20, 0, 0, -1, 0x40);
        }
      }
    }
    // 金币雨公告（StartRain 1/25；原版 ChatHelper Lang.gen[93]→消息列）
    if (weather.coinRainPending) {
      weather.coinRainPending = false;
      this.newText(Lang.gen(93), 50, 255, 130);
    }
    // 天气环境音循环（SceneState.cs:235-297 暴风雪双轨 + MusicID 28 雨环境音）：
    // 由 weather.update 的 onAmbience 回调每帧驱动 applyWeatherLoops（雨层/暴风雪/沙暴）
    weather.graveyardVisual = this.graveyardIntensity; // 渲染端 ProcessCloudAlpha 基准
    // 渲染 hooks 刷新（SceneMetrics 扫描窗计数直供，旧 zone 级近似已废弃）
    const hooks = this.weatherHooks;
    if (hooks) {
      hooks.atmo = atmo;
      hooks.bossDanger = !!this.boss;
      // 雪区削减（Rain.cs NewRain :182-184）：clamp(SnowTileCount/SnowTileThreshold=1500,0,1)，
      // 平方在渲染端（spawnRain 的 snow = snowRatio²）
      hooks.snowRatio = Math.max(0, Math.min(1, this.scene.snowTileCount / 1500));
      // 原始计数直供雪粒系统（Main.snowing Main.cs:12976 密度指数 count/6000）
      hooks.snowTileCount = this.scene.snowTileCount;
      hooks.sandstormVisuals = weather.sandstorm.happening && this.scene.zoneDesert && pty < gl + 30;
      // 沙尘发射门（Sandstorm.EmitDust :147：<100 直接不发射；密度 2000/count 也按真值）
      hooks.desertSandTiles = this.scene.desertSandTileCount;
    }
  }

  /**
   * 天气环境音循环音量跟随（weather.update 的 onAmbience 每帧回调）：
   *  rain → sfx.setRain（MusicID 28，audios/music/Music_28.mp3 循环层）；
   *  blizzardStrong/blizzardInside → Sfx.playLoop 常驻轨（blizzard_strong_loop /
   *  blizzard_inside_building_loop，SceneState.cs:247/:270 PlayTrackedSound）；
   *  sandstorm → playLoop 恒 null（素材缺失登记，wav 入库后自动生效）。
   *  轨懒建（首帧音量>0 时）且不拆——与原版 SlotId 常驻 + 每帧改 Volume 同构。
   */
  private applyWeatherLoops(v: import('../world/weather/Weather').WeatherLoopVolumes): void {
    // 雨层（既有实现：Music_28 解码循环，音量 cloudAlpha×atmo×0.6）
    this.sfx.setRain(v.rain);
    const vols: Record<import('./Sfx').WeatherLoopName, number> = {
      blizzardStrong: v.blizzardStrong,
      blizzardInside: v.blizzardInside,
      sandstormWind: v.sandstorm,
    };
    for (const name of ['blizzardStrong', 'blizzardInside', 'sandstormWind'] as const) {
      const vol = Math.max(0, Math.min(1, vols[name]));
      if (vol <= 0.001) {
        this.weatherLoopVol[name] = vol;
        // 静音保留轨（原版 _blizzardSoundVolume=0 时也只置 Volume=0 不拆，:284-294）
        this.weatherLoops[name]?.setVolume(0);
        continue;
      }
      let h: import('./Sfx').SfxLoop | null = this.weatherLoops[name] ?? null;
      // 仅终态（stop/加载失败）重建——解码在途(!playing && !dead)保留句柄，
      // 否则每帧新建 GainNode 泄漏
      if (!h || h.dead) {
        h = this.sfx.playLoop(name, vol);
        if (!h) { this.weatherLoopVol[name] = vol; continue; }  // sandstormWind 无素材 → null（登记）
        this.weatherLoops[name] = h;
        this.weatherLoopVol[name] = -1;   // 新轨：下一行必下发一次
      }
      // 音量变化超阈值才下发（setTargetAtTime 每帧调度会堆积自动化事件）
      if (Math.abs(this.weatherLoopVol[name] - vol) > 0.01) {
        h.setVolume(vol);
        this.weatherLoopVol[name] = vol;
      }
    }
  }

  /** 停掉全部天气循环轨（退世界/切档时调用） */
  private stopWeatherLoops(): void {
    for (const k of Object.keys(this.weatherLoops) as Array<import('./Sfx').WeatherLoopName>) {
      this.weatherLoops[k]?.stop();
    }
    this.weatherLoops = {};
    this.weatherLoopVol = {};
    this.sfx.setRain(0);
  }

  /** 全图扫描测重板/感应器/间歇泉登记(读档/生成后一次);增量维护见 onTileChanged */
  private scanTriggerTiles(): void {
    const st = this.world.store;
    this.triggerTiles428.clear();
    this.triggerTiles423.clear();
    this.geyserTiles.clear();
    this.geyserCd.clear(); // 冷却表一并清——geyserTiles 不清则会残留上一世界的索引
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
      // 间歇泉:放置/移除即时跟进(此前漏此分支——放置的 geyser 永不喷发)
      if (t === s443) this.geyserTiles.add(i);
      else { this.geyserTiles.delete(i); this.geyserCd.delete(i); }
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
      explode: (tx: number, ty: number, damage: number, radius?: number, destroyTiles?: boolean, projId?: number) =>
        this.explodeAt(tx, ty, damage, radius, destroyTiles, undefined, 0, projId ?? 108),
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
      // 成就：派对进行中（prog 25，与自然派对同源）
      if (partyIsUp(this.partyState)) this.achievements.notifyProgressionEvent(25);
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
    // 发射器弹药族（Kill :75260-75300 闸门表，2026-08-14 补）：I 型（133/134/135/
    // 139/140/141/338/340/442）不在闸门内 = 不毁地形；II 型 r3；III/IV 型 r5；
    // 集束/干族 796-798/809 r7；MK2 系 716/780-783/804/863 r3、718 r5
    136: 3, 137: 3, 138: 3,
    142: 5, 143: 5, 144: 5, 341: 5, 718: 5,
    716: 3, 780: 3, 781: 3, 782: 3, 804: 3, 783: 3, 863: 3,
    796: 7, 797: 7, 798: 7, 809: 7,
  };
  /** 液体/土制炸弹爆炸载荷（Projectile.Kill :74007-74244 → Kill_DirtAndFluid-
   *  Projectiles_RunDelegateMethodPushUpForHalfBricks :67221-67239 的 size+delegate 对）：
   *   903 湿弹 → SpreadWater（水，r=3）  :74099 DelegateMethods.SpreadWater :601
   *   904 岩浆弹 → SpreadLava（r=3）      :74147 :650
   *   905 蜂蜜弹 → SpreadHoney（r=3）     :74195 :626
   *   906 干燥弹 → SpreadDry（吸液，r=3.5）:74243 :670
   *   910/911 土制弹 → SpreadDirt（r=4.2） :74048 :464
   *  其余爆炸族不在 Kill :74007 之外的分派表内 = 无载荷 */
  static readonly BOMB_PAYLOAD: Record<number, { kind: 'water' | 'lava' | 'honey' | 'dry' | 'dirt'; radius: number }> = {
    903: { kind: 'water', radius: 3 },
    904: { kind: 'lava', radius: 3 },
    905: { kind: 'honey', radius: 3 },
    906: { kind: 'dry', radius: 3.5 },
    910: { kind: 'dirt', radius: 4.2 },
    911: { kind: 'dirt', radius: 4.2 },
    // 液体火箭族（Kill :74051-74244 同四分发：水/岩浆/蜂蜜 r3、干 r3.5——
    // 湿·熔岩·蜂蜜·干火箭 × 759/758/760/1946 四发射器的弹体，2026-08-14 补）
    784: { kind: 'water', radius: 3 }, 785: { kind: 'water', radius: 3 },
    786: { kind: 'water', radius: 3 }, 805: { kind: 'water', radius: 3 },
    787: { kind: 'lava', radius: 3 }, 788: { kind: 'lava', radius: 3 },
    789: { kind: 'lava', radius: 3 }, 806: { kind: 'lava', radius: 3 },
    790: { kind: 'honey', radius: 3 }, 791: { kind: 'honey', radius: 3 },
    792: { kind: 'honey', radius: 3 }, 807: { kind: 'honey', radius: 3 },
    799: { kind: 'dry', radius: 3.5 }, 800: { kind: 'dry', radius: 3.5 },
    801: { kind: 'dry', radius: 3.5 }, 810: { kind: 'dry', radius: 3.5 },
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

  /** 液体/土制炸弹爆炸载荷 1:1（Projectile.Kill :74007-74244 →
   *  Kill_DirtAndFluidProjectiles_RunDelegateMethodPushUpForHalfBricks :67221-67239 +
   *  Utils.FloodFillTile :2516-2559 + DelegateMethods.SpreadWater/Lava/Honey/Dry/Dirt）：
   *   ① 半砖上浮（:67223-67235）：弹心格是半砖 → 上移一格（上格非实心才移）；
   *   ② BFS 四连通 flood-fill（:2528-2557）：从弹心逐层扩散，plot 返回 true 才扩邻居；
   *      plot 首查距弹心 > radius 即 false（:603/:628/:652/:672/:488——距离门在 delegate）；
   *   ③ plot 各族：
   *      water/lava/honey = WorldGen.PlaceLiquid :4524-4574（实心格拒绝 :4536；
   *        空格或同类才倒 :4540，异类不并 → false）
   *      dry = WorldGen.EmptyLiquid :4495-4522（实心格拒绝 :4507，清液体+类型）
   *      dirt = DelegateMethods.SpreadTile :474-499（非泥土实心格拒绝 :494，空格铺泥土）
   *  返回成功涂布格数（供调用方发音效/尘）。 */
  static spreadBombPayload(
    st: World['store'],
    p: { kind: 'water' | 'lava' | 'honey' | 'dry' | 'dirt'; radius: number },
    cx: number, cy: number,
  ): number {
    if (!st.inBounds(cx, cy)) return 0;
    // ① 半砖上浮（:67223-67235）
    const ci = st.idx(cx, cy);
    if (st.flags[ci] && st.half[ci] && cy - 1 >= 0 && !st.isSolid(cx, cy - 1)) cy--;
    const lt = p.kind === 'water' ? LIQUID_TYPE.WATER : p.kind === 'lava' ? LIQUID_TYPE.LAVA
      : p.kind === 'honey' ? LIQUID_TYPE.HONEY : 0;
    const dirtTile = TILE_BY_KEY['dirt'] ?? 0;
    const solidBlocked = (x: number, y: number): boolean => {
      const i = st.idx(x, y);
      const td = st.type[i] !== 0 ? TILE_DEFS[st.type[i]] : undefined;
      // :4536/:4507 nactive && tileSolid && !tileSolidTop（≈ isSolid：平台/非实心放行）
      return !!st.flags[i] && !!td?.solid && !td.platform;
    };
    const plot = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y)) return false;
      if (Math.hypot(x - cx, y - cy) > p.radius) return false;   // delegate 距离门
      const i = st.idx(x, y);
      if (p.kind === 'dry') {
        // SpreadDry :670-690
        if (solidBlocked(x, y) || st.liquid[i] === 0) return false;
        st.setLiquid(x, y, 0, 0);
        return true;
      }
      if (p.kind === 'dirt') {
        // SpreadTile :474-499（overLiquidType<0 直落放置支）：TryKillingReplaceableTile
        // :59336-59364 先杀 tileCut 可替换格（杂草/药草——KillTile 后落铺），
        // 其余活动格拒绝 :494；已是泥土不重复计
        if (st.flags[i] && st.type[i] !== dirtTile && !TILE_CUT.has(st.type[i])) return false;
        if (st.type[i] === dirtTile) return false;
        st.setTile(x, y, dirtTile);
        return true;
      }
      // SpreadWater/Lava/Honey :601-668 = PlaceLiquid
      if (solidBlocked(x, y)) return false;
      const here = st.liquidType[i] || LIQUID_TYPE.WATER;
      if (st.liquid[i] === 0 || here === lt) {
        st.setLiquid(x, y, Math.min(255, st.liquid[i] + 255), lt);
        return true;
      }
      return false;   // 异类液体不并（GetLiquidMergeTypes 并块由 LiquidSim 承接）
    };
    // ② BFS 四连通（:2526-2557：种子 = 弹心，seen 集合防回访）
    const seen = new Set<number>([st.idx(cx, cy)]);
    let queue = [st.idx(cx, cy)];
    let painted = 0;
    while (queue.length) {
      const next: number[] = [];
      for (const i of queue) {
        const x = i % st.w, y = (i / st.w) | 0;
        if (plot(x, y)) {
          painted++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (!st.inBounds(nx, ny)) continue;
            const ni = st.idx(nx, ny);
            if (seen.has(ni)) continue;
            seen.add(ni);
            next.push(ni);
          }
        }
      }
      queue = next;
    }
    return painted;
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
  private explodeAt(tx: number, ty: number, damage: number, radius = 3, destroyTiles = true, hurtBox?: number, pen = 0, projId = 0) {
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
        en.hurt(damage, cx - (en.cx ?? cx), cy - (en.cy ?? cy), this, pen); // ⑥
      }
    }
    const p = this.player;
    const hb = hurtBox ?? R * TILE;
    // 爆炸炸死玩家的死亡归因 = ByProjectile（BombsHurtPlayers :13974）：投射物名
    // 取 Lang.GetProjectileName(projType)——掷出的炸弹/雷管/手雷按型号、电路炸药=108
    // Explosives、地雷=164 Landmine、链爆=108。此前漏设 → 死因残留上一次受击来源
    // （如已反杀的洞穴蝙蝠,"凶手是洞穴蝙蝠"串归因 bug 即此）。
    if (Math.abs(p.cx - cx) < hb + p.w / 2 && Math.abs(p.cy - cy) < hb + p.h / 2) {
      p.lastDamageCause = {
        kind: 'projectile',
        name: Lang.projectileName(projId || 108) ?? 'Explosives',
      };
      p.damage(damage, cx, cy);
    }
    // BombsHurtPlayers 跨端半边（Projectile.cs:13944-13981）：原版各端只结算【本地
    // 玩家】被炸（Main.LocalPlayer）——爆炸天然 victim-settles。远端代理在本端无爆炸
    // 模拟,由爆炸端按同盒广播 msg44 bit7 意向、被炸端本地结算。★原版爆炸无
    // hostile/InOpposingTeam 门（:13948 无 hostile 检查）——pvp 参仅 108/1002 为
    // false（:13964-13967）其余恒 true;故 bit7 走非 PvP 门,服务器亦放行非 pvp 房
    if (this.net?.active) {
      for (const rpEnt of this.remotePlayerProxies) {
        const rp = rpEnt as Player;
        const slot = (rp as unknown as { __netSlot?: number }).__netSlot;
        if (slot === undefined || rp.dead) continue;
        if (Math.abs(rp.cx - cx) < hb + rp.w / 2 && Math.abs(rp.cy - cy) < hb + rp.h / 2) {
          // direction(:13951)=玩家在弹右→1 否则 -1（击退朝远离爆炸侧）
          this.net.sendStrikePlayer(slot, damage, rp.cx < cx ? -1 : 1, 0, projId || 108, 0x80);
        }
      }
    }
    // 视觉 1:1（Projectile.Kill 按类型分档）:
    //   炸弹 28/手雷 30(:74881-74916):烟 31×20(scale1.5 vel×1.4) + 火 6×10 对
    //     (scale2.5 noGrav vel×5 + scale1.5 vel×3) + gore 61-64×4(vel×0.4 对角±1)
    //   炸药棍 29(:74943-75010):200×200 场——烟 50(scale2 vel×1.4) + 火 80 对
    //     (scale3 noGrav vel×5 + scale2 vel×3) + gore 61-64×8(scale1.5 vel±1.5)
    //   此前所有类型共用一套弱视觉且火粒子无重力缺失(用户报"没火焰粒子")。
    //   dust 31=烟(灰) / dust 6=火把焰(黄橙闪烁) / gore 61-64=烟团碎片
    const big = projId === 29 || projId === 470 || projId === 637;
    const nSmoke = big ? 50 : 20;
    const nFire = big ? 40 : 10;
    this.spawnParticles(cx, cy, '#9A9A9A', nSmoke, 1.4,
      { life: big ? 60 : 45, damp: 0.95, size: big ? 4 : 3 });                    // 烟(×1.4 慢散)
    // 火对：noGravity ≈ grav 0 + 高阻尼直飞；色取 torch 焰双档(#FFD24A 亮黄/#FF9A3C 橙)
    this.spawnParticles(cx, cy, '#FFD24A', nFire, 5,
      { life: 30, grav: 0, damp: 0.9, size: big ? 6 : 5 });                       // 快火(vel×5 scale2.5/3)
    this.spawnParticles(cx, cy, '#FF9A3C', nFire, 3,
      { life: 38, grav: 0, damp: 0.92, size: big ? 5 : 4 });                       // 慢火(vel×3 scale1.5/2)
    const nGore = big ? 8 : 4;
    for (let gi = 0; gi < nGore; gi++) {
      const a = gi * (Math.PI * 2 / nGore) + Math.PI / 4;
      const gv = big ? 1.5 : 1;
      this.spawnParticles(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, '#D8D8D0', 1, gv,
        { life: 70, damp: 0.98, size: big ? 5 : 3 });
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
      this.explodeAt(ex, ey, 500, 10, true, undefined, 0, 108);  // 语义=Projectile 108 Explosives
    }
  }

  /** 桶/海绵族 12 件（Player.ItemCheck_UseBuckets，Player.cs:45704-45890 1:1）：
   *  族表（:45706）：205 空桶 / 206 水 / 207 岩浆 / 1128 蜂蜜 / 3031 无底水桶 /
   *    3032 超吸海绵 / 4820 无底岩浆桶 / 4872 岩浆海绵 / 5302 无底蜂蜜桶 /
   *    5303 蜂蜜海绵 / 5304 终极海绵 / 5364 无底微光桶
   *  舀取支入口（:45719）：205 且非微光 / 3032 水|微光 / 4872 岩浆 / 5303 蜂蜜 /
   *    5304 任意液体；合计门（:45733）海绵族豁免；仅 205 换桶（:45738 消耗块
   *    显式排除 3032/4872/5303/5304——海绵族不消耗、无饱和变体）
   *  倾倒支（:45811-45888）：≥200 或 active 实心非 solidTop（546 例外）拒绝（:45813）；
   *    空格或同类才倒（:45819/:45839/:45859/:45877）；无底族不换桶；
   *    5364 = 倒微光 255 不消耗,无额外交互（实体转化走液体侧 ShimmerCheck） */
  private useBucket(bucketVid: number, tx: number, ty: number): void {
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // 射程门（:45706 IsInTileInteractionRange Simple 档 + tileBoost）：无底桶/海绵族
    // tileBoost+=2（Item.cs:28052/:39452/:39648/:42042/:42053/:42534）、5304 +=3（:42062）
    const tb = bucketVid === 5304 ? 3
      : (bucketVid === 3031 || bucketVid === 3032 || bucketVid === 4820
        || bucketVid === 4872 || bucketVid === 5302 || bucketVid === 5303 || bucketVid === 5364) ? 2 : 0;
    if (!this.inTileRange(tx, ty, tb)) return;
    const i = st.idx(tx, ty);
    // 原版 liquidType()==0 ≡ 水（LiquidID.cs:5）；本仓 +1 编码下 0 视同水
    const tHere = st.liquidType[i] || LIQUID_TYPE.WATER;
    // 3×3 同类合计（:45723-45731）
    let sum3x3 = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        if (!st.inBounds(tx + ox, ty + oy)) continue;
        const j = st.idx(tx + ox, ty + oy);
        if ((st.liquidType[j] || LIQUID_TYPE.WATER) === tHere) sum3x3 += st.liquid[j];
      }
    }
    // 倾倒实心门（:45813 nactive && tileSolid && !tileSolidTop && type!=546 的仓库近似）
    const td = st.type[i] !== 0 ? TILE_DEFS[st.type[i]] : undefined;
    const solidBlocked = !!st.flags[i] && !!td && !!td.solid && !td.platform
      && td.vanilla?.sheet !== 546;
    const op = Game.bucketUse(bucketVid, st.liquid[i], tHere, sum3x3, solidBlocked);
    if (op.kind === 'none') return;
    if (op.kind === 'pour') {
      st.setLiquid(tx, ty, 255, op.liquidType!);            // :45823/:45843/:45863/:45881
    } else {
      Game.bucketScoopDrain(st, tx, ty, tHere);             // :45762-45809
    }
    this.sfx.play('splash', 1, tx * TILE + 8, ty * TILE + 8); // SoundID 19（:45760/:45821/:45841/:45861/:45879）
    if (op.swapTo !== undefined) {
      // 原版 sItem.stack-- + PutItemInInventoryFromItemUsage：手中原格替换（不跳格）
      this.player.inv.slots[this.player.inv.selected] = { id: ITEM_BY_KEY[VI(op.swapTo)], stack: 1 };
      this.cb.onInventoryChanged();
    }
    this.player.useTime = op.useTime;                       // ApplyItemTime（:45761/:45830 族）
  }

  /** 桶/海绵族决策纯函数（Player.cs:45719-45888）——输入目标格状态,输出动作。
   *  liquidType 用仓库 +1 编码（1 水/2 岩浆/3 蜂蜜/4 微光,0≡水,LiquidID.cs:5-11 +1）。
   *  kind: none=门拦下 / pour=倾倒 255 / scoop=舀取（含四邻回吸）;useTime=ApplyItemTime 值 */
  static bucketUse(vid: number, liquid: number, liquidType: number, sum3x3: number,
    solidBlocked: boolean): { kind: 'none' | 'pour' | 'scoop'; liquidType?: number; swapTo?: number; useTime: number } {
    const t = liquidType || LIQUID_TYPE.WATER;
    const isSponge = vid === 3032 || vid === 4872 || vid === 5303 || vid === 5304;
    // ---- 舀取支入口（:45719）----
    const scoop = (vid === 205 && t !== LIQUID_TYPE.SHIMMER)
      || (vid === 3032 && (t === LIQUID_TYPE.WATER || t === LIQUID_TYPE.SHIMMER))
      || (vid === 4872 && t === LIQUID_TYPE.LAVA)
      || (vid === 5303 && t === LIQUID_TYPE.HONEY)
      || vid === 5304;                                      // 终极海绵任意液体（:45719 末项恒真）
    if (scoop) {
      // 门（:45733）：无液体拒绝;3×3 同类合计 ≤100 且非海绵拒绝（海绵可吸浅洼）
      if (liquid <= 0 || (sum3x3 <= 100 && !isSponge)) return { kind: 'none', useTime: 0 };
      // 换桶链（:45738-45759）：仅 205——蜜→1128/岩浆→207/水→206（微光已被入口拦）;
      // 海绵族不消耗（消耗块显式排除 3032/4872/5303/5304）
      return {
        kind: 'scoop',
        swapTo: vid === 205
          ? (t === LIQUID_TYPE.HONEY ? 1128 : t === LIQUID_TYPE.LAVA ? 207 : 206) : undefined,
        useTime: itemCombat(vid)?.useTime ?? 10,            // ApplyItemTime（:45761）
      };
    }
    // ---- 倾倒支（:45811-45888）----
    if (liquid >= 200 || solidBlocked) return { kind: 'none', useTime: 0 };  // :45813
    const pourType: Record<number, number> = {
      207: LIQUID_TYPE.LAVA, 4820: LIQUID_TYPE.LAVA,       // :45817-45835
      206: LIQUID_TYPE.WATER, 3031: LIQUID_TYPE.WATER,     // :45837-45855
      1128: LIQUID_TYPE.HONEY, 5302: LIQUID_TYPE.HONEY,    // :45857-45875
      5364: LIQUID_TYPE.SHIMMER,                           // :45877-45888
    };
    const lt = pourType[vid];
    if (lt === undefined) return { kind: 'none', useTime: 0 }; // 205 在微光上/海绵族不进此支
    if (liquid > 0 && t !== lt) return { kind: 'none', useTime: 0 };  // 空格或同类才倒
    // 满桶族回空桶（:45827/:45847/:45867）;无底族 3031/4820/5302/5364 不消耗
    const bottomless = vid === 3031 || vid === 4820 || vid === 5302 || vid === 5364;
    return {
      kind: 'pour',
      liquidType: lt,
      swapTo: bottomless ? undefined : 205,
      useTime: itemCombat(vid)?.useTime ?? 10,              // ApplyItemTime（:45830/:45850/:45870/:45883）
    };
  }

  /** 舀取执行（:45762-45809）：清目标格;不足 255 时从 3×3 同类邻居回吸补足,余液
   *  留在地里。海绵与空桶共用同一舀取体——同样只吸到 255 为止（非清空 3×3）。
   *  返回舀走总量。 */
  static bucketScoopDrain(st: TileStore, tx: number, ty: number, tHere: number): number {
    const i = st.idx(tx, ty);
    let got = st.liquid[i];
    st.setLiquid(tx, ty, 0, 0);
    if (got >= 255) return got;                             // :45775 目标已满则不回吸
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        if ((ox === 0 && oy === 0) || !st.inBounds(tx + ox, ty + oy)) continue;
        const j = st.idx(tx + ox, ty + oy);
        if (st.liquid[j] <= 0 || (st.liquidType[j] || LIQUID_TYPE.WATER) !== tHere) continue;
        const take = Math.min(st.liquid[j], 255 - got);     // :45785-45788
        if (take <= 0) continue;                            // 已吸满 255,余格不动（:45786 归零）
        got += take;
        st.setLiquid(tx + ox, ty + oy, st.liquid[j] - take, tHere);
      }
    }
    return got;
  }

  /** 传送族青尘（回忆药水 Cyan / 魔镜族白尘 dust 15，:42299/:42434 近似） */
  private recallDust(p: import('../entities/Player').Player, n: number, cyan = false): void {
    for (let i = 0; i < n; i++) {
      this.spawnParticles(
        p.x + Math.random() * p.w, p.y + Math.random() * p.h,
        cyan ? '#60E8E8' : '#D8E8FF', 1, 1.2,
        { life: 26 + Math.random() * 14, grav: -0.02, damp: 0.94 },
      );
    }
  }

  /** 传送落点检查（Utils.CheckForGoodTeleportationSpot :55250-55320 的最小移植）：
   *  玩家盒(20×42→2×3 格)全空 + 底部实心 + 无岩浆/无伤害块。失败返回 null */
  private findTeleportSpot(x0: number, x1: number, y0: number, y1: number): { x: number; y: number } | null {
    const st = this.world.store;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const tx = x0 + Math.floor(Math.random() * Math.max(1, x1 - x0));
      const ty = y0 + Math.floor(Math.random() * Math.max(1, y1 - y0));
      let ok = true;
      for (let dx = 0; dx < 2 && ok; dx++) {
        for (let dy = 0; dy < 3 && ok; dy++) {
          const i = st.idx(tx + dx, ty + dy);
          if (st.flags[i] && st.isSolid(tx + dx, ty + dy)) ok = false;
          if (st.liquid[i] > 0 && st.liquidType[i] === 2) ok = false; // avoidLava
        }
      }
      if (!ok || !st.isSolid(tx, ty + 3)) continue; // mostlySolidFloor
      return { x: tx * TILE + 6, y: ty * TILE };
    }
    return null;
  }

  /** 传送族触发（引导到期）：音效+尘+落点+消耗。语义对标 Player.cs:42297-42516 */
  private fireRecallTeleport(c: { vid: number; kind: RecallKind; triggerAt: number; consume: boolean }): void {
    const p = this.player;
    const st = this.world.store;
    let dest: { x: number; y: number } | null = null;
    if (c.kind === 'spawn') {
      // Spawn(RecallFromItem)：出生点上方 3 格（respawnPlayer 同式）
      dest = { x: this.world.spawnX * TILE + 8, y: (this.world.spawnY - 3) * TILE };
    } else if (c.kind === 'ocean') {
      // MagicConch：对侧海滩带（beachDistance-100；近似取世界两缘 380 格带内找地表落点）
      const right = p.x / TILE < st.w / 2;
      const bx0 = right ? st.w - 380 : 60, bx1 = right ? st.w - 60 : 380;
      dest = this.findTeleportSpot(bx0, bx1, 30, Math.floor(this.world.rockLevel));
    } else {
      // DemonConch：中心 ±50，[UnderworldLayer+20, +100]，实心底/避液
      const cx = Math.floor(st.w / 2);
      const y0 = Math.floor((this.world.lavaLine || st.h - 200)) + 20;
      dest = this.findTeleportSpot(cx - 50, cx + 50, y0, y0 + 80);
    }
    if (!dest) {
      // 原版找点失败保持原地（canSpawn=false 分支）；消耗品不消耗
      this.recallChannel = null;
      return;
    }
    if (c.vid === 2350) this.sfx.play('mirror');      // HeldItem.UseSound（:42444）
    else if (c.kind !== 'spawn') this.sfx.play('conch'); // 海螺族传送瞬间（MagicConch 内 Teleport 音）
    this.recallDust(p, 70, c.vid === 2350);            // 传送前 70 尘
    const keepIframes = p.iframes;                     // 回忆药水保留无敌帧（:42449-42451）
    p.x = dest.x; p.y = dest.y; p.vx = 0; p.vy = 0;
    if (c.vid === 2350) p.iframes = keepIframes;
    this.recallDust(p, 70, c.vid === 2350);            // 传送后 70 尘
    if (c.consume) p.inv.removeAt(p.inv.selected, 1);
    this.camera.x = p.cx; this.camera.y = p.cy;        // 相机直跟（无缓动瞬移）
    this.cb.onInventoryChanged?.();
  }

  /** 门交互：开门按玩家朝向、失败换反向（原版 Player.cs L20965-20974）；
   *  帧算法/样式保留/方向锚点见 world/Door.ts（原版 OpenDoor L22384 / CloseDoor L15901 语义） */
  private toggleDoor(x: number, y: number, open: boolean) {
    const st = this.world.store;
    // 神庙锁门（IsLockedDoor cs:69248）：开锁消耗神庙钥匙 1141（Player.cs:32332-32357）
    // ——消耗+UnlockDoor（frameY 三格 +54 出锁区）后继续开门;无钥匙拒绝。
    // 2026-08-13:此前锁门无锁语义,世花前可自由进出神庙（拜祭坛/开箱绕过进度门）
    // 锁段向上扫三格：IsLockedDoor 只认顶格帧段（frameY∈[594,646]）,而 interactAt
    // 的点击坐标不归一到门主格——点中/底格也须命中锁（原版 SmartInteract 归一,此处扫描等价）
    let lockY = -1;
    for (let dy2 = 0; dy2 < 3; dy2++) {
      if (isLockedDoor(st, x, y - dy2)) { lockY = y - dy2; break; }
    }
    if (open && lockY >= 0) {
      const keyIid = invIndexOfVanilla(1141);
      if (keyIid < 0 || this.player.inv.countOf(keyIid) <= 0) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NeedTempleKey'));
        this.input.rightDown = false;
        return;
      }
      this.player.inv.remove(keyIid, 1);
      unlockDoor(st, x, lockY, (n) => this.sfx.play(n as 'unlock'));
    }
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

  /** 地牢裂砖族破坏链（KillTile :63837-63895 段 1:1）：
   *  ① 掉落：同色普通地牢砖（:67003：481→275 / 482→276 / 483→277）——仅主动破坏
   *    （挖/炸/撞碎/弹幕扫掠/钩爪，原版 KillTile 默认 noItem=false）；连锁格 noItem 不掉。
   *  ② 连锁崩塌（:63838-63866）：8 邻域掷签——正上 1/3、其余 1/6，命中 KillTile(noItem)
   *    递归链式（crackedChainKill）。
   *  ③ 每块喷 Debris 弹片（:63887-63895：proj 736-738，伤 20，v=(0,0.41)）。
   *  ④ 专属音 Item_127（:66551 sound switch）。原序=连锁先、弹片后。 */
  private breakCrackedBrick(x: number, y: number, dropLoot: boolean): void {
    const st = this.world.store;
    const t = st.get(x, y);
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    if (!isCrackedSheet(sheet)) return;
    const mapColor = TILE_DEFS[t]?.mapColor ?? '#888';
    st.setTile(x, y, 0);
    if (dropLoot) {
      const key = VANILLA_ITEM_KEY_BY_ID[sheet! - 481 + 275];   // 同色地牢砖物品
      if (key) this.spawnDrop(x * TILE + 8, y * TILE + 8, key, 1);
    }
    const fx = (fx: number, fy: number, sh: number) => {
      this.playSfxFiles(['Item_127'], 1, fx * TILE + 8, fy * TILE + 8);
      this.entities.add(new DebrisProj(sh, fx * TILE + 8, fy * TILE + 8), 'projectiles');
      this.spawnParticles(fx * TILE + 8, fy * TILE + 8, mapColor, 3, 1.4);
    };
    const killed = crackedChainKill(st, x, y);   // 连锁（noItem——掉落门在此）
    fx(x, y, sheet!);                             // 首格弹片（:63887 在连锁段后）
    for (const [kx, ky, ksh] of killed) fx(kx, ky, ksh);
  }

  /** 弹幕移动扫掠盒内裂砖切碎（Projectile.HandleMovement :16630-16655 等价：
   *  移动前后包围盒内 CrackedBricks 逐格 KillTile——CanCutTile AttackProjectile
   *  上下文（:87573）：墙 350 / 正下 78·380·579 豁免，其余可切）。DebrisProj 豁免
   *  （自身弹片不碎砖，其连锁走 Kill 段 :75347）。快照长度迭代——链上追加的
   *  弹片不参与本轮扫掠。 */
  private crushCrackedBricksSweptByProjectiles(): void {
    const st = this.world.store;
    const projs = this.entities.projectiles;
    const n = projs.length;
    for (let pi = 0; pi < n; pi++) {
      const p = projs[pi] as { x: number; y: number; w: number; h: number; vx: number; vy: number; dead: boolean };
      if (p.dead || p instanceof DebrisProj) continue;
      if (p.vx === 0 && p.vy === 0) continue;
      const x0 = Math.floor(Math.min(p.x, p.x + p.vx) / TILE);
      const x1 = Math.floor((Math.max(p.x, p.x + p.vx) + p.w) / TILE);
      const y0 = Math.floor(Math.min(p.y, p.y + p.vy) / TILE);
      const y1 = Math.floor((Math.max(p.y, p.y + p.vy) + p.h) / TILE);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (!isCrackedAt(st, x, y)) continue;
          if (st.wall[st.idx(x, y)] === 350) continue;          // CanCutTile 墙 350 门
          if (st.inBounds(x, y + 1)) {
            const below = st.get(x, y + 1);
            if (below !== 0) {
              const bs = TILE_DEFS[below]?.vanilla?.sheet;
              if (bs === 78 || bs === 380 || bs === 579) continue;  // 下方种植族不切
            }
          }
          this.breakTile(x, y);   // KillTile（默认 noItem=false——掉同色地牢砖）
        }
      }
    }
  }

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
    this.sfx.play('shatter', 1, ax * TILE + 16, ay * TILE + 16);
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#9A6A5A', 10, 2.6, { life: 200, damp: 0.985, grav: 0.09 });
    this.spawnParticles(ax * TILE + 16, ay * TILE + 16, '#C4A48C', 6, 2.0, { life: 180, damp: 0.985, grav: 0.09 });
    this.potLoot(ax, ay, style);
  }

  /** 瓦罐掉落（SpawnThingsFromPot 肉前普通世界分支，WorldGen.cs:57100-57760） */
  private potLoot(x: number, y: number, style: number) {
    const w = this.world;
    const underworldY = w.store.h - 200; // UnderworldLayer ≈ maxTilesY-200
    const flag = y < w.rockLevel;         // 原版 flag：j < rockLayer（地表+泥土层）
    // ★钱币传送门大奖（WorldGen.cs:57186-57194，先于 1/45 药水掷）：
    // range = 500/((num+1)/2)，num 为过 (n*2+1)/3 变换值（:57163）——
    // 金字塔罐 25-27→125（wiki 1/125 即此）、普通罐→500；
    // 最近玩家 RollLuck(range)==0 → 弹 518 CoinPortal（i*16+16 中心、v=(0,-12)）并短路。
    // isGeneratingOrLoadingWorld 门（:57187）：载入期 player 未建→跳过（原版直接 return）。
    {
      const plr = this.player;
      const numT = (potCoinMul(style, w.flags.hardMode) * 2 + 1) / 3;
      if (plr && rollLuck(plr.luck, Math.floor(500 / ((numT + 1) / 2))) === 0) {
        this.entities.add(new CoinPortalProj(x * TILE + 16, y * TILE + 16), 'projectiles');
        return;
      }
    }
    // item id → 我们 key：VANILLA_ITEM_KEY_BY_ID 全量映射（vi_ 表覆盖 6146 件）。
    // 原生 def 覆盖段已退役（曾把火把/金币折到本地键,后者还把 73 金折成铜币——既有 bug）
    const drop = (itemId: number, n = 1): ItemDrop | null => {
      const key = VANILLA_ITEM_KEY_BY_ID[itemId];
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
    // style 系数 num（L57113-57160）→ coins *= (num*2+1)/3（num16 *= num :57714）
    // 28-30 地狱罐 hardMode 才 4（曾无条件 ×4，随 potCoinMul 抽出顺带修正）
    coins *= (potCoinMul(style, w.flags.hardMode) * 2 + 1) / 3;
    if (coins > 1000) coins = 1000; // 防御性上限（原版由 Item.NewItem 内部面值转换）
    drop(73, Math.max(1, Math.round(coins)));
  }

  /** 捕虫网捕捉（NPC.CatchNPC :80684-80721）：catchItem>0 才可捕（螃蟹无 = 无效）；
   *  捕获物掉在【玩家中心】可秒拾（noGrabDelay）；687 神秘青蛙永远传送逃走
   *  （TryTeleportingCaughtMysticFrog :80657-80682：±15 格采样 telefrag 8，
   *   Teleport style 13 = 每侧 Item8 + 21 尘 27；失败 PoofOfSmoke 消散）。 */
  private netCatchCritter(c: Critter): void {
    const def = CRITTER_BY_KEY[c.key];
    const npcId = def?.npc ?? -1;
    if (npcId === 687) {
      const spot = attemptToFindTeleportSpot(
        c as unknown as Enemy, this as unknown as GameHooks,
        Math.floor(c.cx / TILE), Math.floor(c.cy / TILE), 15, 8);
      if (spot) {
        const tpFx = () => {
          this.playSfxFiles(['Item_8'], 1, c.cx, c.cy);
          this.spawnParticles(c.cx, c.cy, '#7A5AC8', 21, 1.75, { life: 30 });
        };
        tpFx();                                       // 旧位置（TeleportEffect case 13）
        c.x = spot.x * TILE - c.w / 2;
        c.y = spot.y * TILE - c.h;
        tpFx();                                       // 新位置
      } else {
        this.spawnParticles(c.cx - 20, c.cy - 20, '#B0B0A0', 10, 1, { life: 24 }); // PoofOfSmoke
        c.dead = true;
      }
      return;
    }
    const catchItemId = def ? CRITTER_CATCH_BY_NPC[npcId] : undefined;
    if (!catchItemId) return;                          // :44084 catchItem<=0 跳过（不伤不死）
    const key = VANILLA_ITEM_KEY_BY_ID[catchItemId];
    if (key) this.spawnDrop(this.player.cx - 8, this.player.cy - 8, key, 1, 0, -1);
    this.spawnParticles(c.cx, c.cy, '#D8D8C8', 8, 1.5, { life: 20 });
    c.dead = true;                                     // :80719 active=false（非 Kill 不掉落）
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
    // 一击致死，均为原版没有的行为（vi_ 数值取 combat 表，legacy 工具取 def.tool）。
    // ★门位下移到判定盒算完之后：原版顺序 ItemCheck_GetMeleeHitboxParticles
    // （:42958-42961）在近战门（:42962）**之前**——泡泡棒 1450 noMelee 但要吃
    // 判定盒喷气泡，门放这里会把它饿死（门的 return 移至判定盒之后，无副作用差）
    const swingVid = heldDef.vid ?? viIdFromKey(heldDef.key);
    const swingCombat = swingVid >= 0 ? itemCombat(swingVid) : null;
    const meleeDmg = this.swing.dmg ?? tool?.damage ?? swingCombat?.damage ?? 0;
    const noMelee = heldDef.magic || swingCombat?.noMelee;
    const isNet = swingVid === 1991 || swingVid === 3183 || swingVid === 4821;  // :42962 网特判
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
    // ★两套三段阈值同源但产物不同，须拆开：命中盒扩展 phase（cs:44520-44541：
    // 早段(anim≥0.666max ⟺ pAnim≥2/3)×2/×1.4、晚段(anim<0.333max ⟺ pAnim≤1/3)×1.4/×1.1）
    // 与基座持位 tier（cs:49957-50095，同 Renderer.drawUseItem case 1——末段→前持位、
    // 起手→后举位）。此前共用一个 phase，把基座持位也接反（早段取了前持位）
    const phase: 0 | 1 | 2 = pAnim > 2 / 3 ? 0 : pAnim > 1 / 3 ? 1 : 2;
    const tier: 0 | 1 | 2 = pAnim <= 1 / 3 ? 0 : pAnim < 2 / 3 ? 1 : 2;
    const hitUs = this.swing.useStyle ?? 1;
    if (hitUs === 3) {
      // useStyle 3（雨伞 946/4707）单一持位（cs:50279-50294）：
      // offX = fw/2-4-max(pAnim*fw*1.2-10, 8)、offY = 顶+24
      offX = sprW * 0.5 - 4 - Math.max(pAnim * sprW * 1.2 - 10, 8);
      offY = 24;
    } else if (tier === 0) { offX = sprW * 0.5 - xTier(sprW, 0); offY = yTier(sprH, 0); }
    else if (tier === 1) { offX = sprW * 0.5 - xTier(sprW, 1); offY = yTier(sprH, 1); }
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
    // ---- §5 1450 泡泡棒（Player.cs:44431-44461，ItemCheck_GetMeleeHitboxParticles
    //      的 1450 支）：挥动期每帧 1/3 掷骰 → 判定盒内随机点喷气泡 gore。
    //      档位链 415/414/413/412/411（1/500/250/80/10/3）+ scale 0.51-1.00 见
    //      FunItems.bubbleWandGoreRoll；NewGore 尾段把 411-415 随机扩散到全部四族
    //      （Gore.cs:1427-1435，GorePiece.newGore 内）。后处理 :44459-44460：
    //      vx += direction*2、vy *= 0.3（NewGore 完成后回写）
    if (swingVid === 1450 && Math.floor(Math.random() * 3) === 0) {
      const roll = bubbleWandGoreRoll(Math.random);
      if (roll) {
        const g = GorePiece.newGore(roll.goreType,
          bx + Math.floor(Math.random() * bw),
          by + Math.floor(Math.random() * bh),
          0, 0, roll.scale);            // 常规 NewGore（非 Perfect）：含 :1347-1348 初速扰动
        if (g) { g.vx += p.facing * 2; g.vy *= 0.3; }
      }
    }
    // ---- 近战整体门（原 :42962，门位见上注——判定盒算完才判，noMelee/damage=0
    //      只跳过砍草与命中，不影响上方粒子支）
    if (!isNet && (noMelee || meleeDmg <= 0)) return;
    // 原版 ItemCheck_CutTiles（Player.cs:44002 + :42972-42976：仅金/防火网调
    //  CutTiles(cutExtraTiles)，普通虫网 1991 不砍草）
    if (swingVid !== 1991) for (let ty = Math.floor(by / TILE); ty <= Math.floor((by + bh - 1) / TILE); ty++) {
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
    // 小动物：网 → 捕捉（ItemCheck_CatchCritters :44079-44112）；其余挥击一击致死
    for (const cent of this.entities.critters) {
      const c = cent as Critter;
      if (this.swingHitSet.has(c.id)) continue;
      if (hitRect(c.x, c.y, c.w, c.h)) {
        this.swingHitSet.add(c.id);
        if (isNet) this.netCatchCritter(c);
        else c.hurt(this);
      }
    }
    if (isNet) return;   // 网不砍草不打怪（金/防火网的 cutExtraTiles 登记近似省略）
    // 城镇 NPC:巫毒窄门(原版 ApplyItemToNPC/Damage_PVE_Inner :11970-11972——
    // 向导 22 需装备向导巫毒娃娃 267、裁缝师 54 需裁缝娃 1307,其余免疫玩家近战);
    // 同一挥击只中一次(swingHitSet 按 Entity.id 去重)
    for (const nent of this.entities.npcs) {
      const tn = nent as TownNPC;
      if (!(tn instanceof TownNPC) || tn.dead || tn.bound) continue;
      if (this.swingHitSet.has(tn.id)) continue;
      const eq = this.player.equipStats;
      const doll = tn.vanillaId === 22 ? eq.killGuide : tn.vanillaId === 54 ? eq.killClothier : false;
      if (!doll || !hitRect(tn.x, tn.y, tn.w, tn.h)) continue;
      this.swingHitSet.add(tn.id);
      const swBase = ((meleeDmg || Math.max(1, Math.ceil((tool?.power ?? 10) / 16)))
        * this.player.damageMult('melee')); // ⑥ pen 移 hit 时（挥击处传）
      const swDmg = Math.max(1, Math.round(swBase * (1 + (Math.random() * 30 - 15) / 100)));
      tn.hurt(swDmg, (Math.sign(tn.cx - p.cx) || this.player.facing) * 2, 0, this);
    }
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (this.swingHitSet.has(e.id)) continue;
      if (!hitRect(e.x, e.y, e.w, e.h)) continue;
      this.swingHitSet.add(e.id);
      // 怪物专属受击声（各家族不同）；播放失败回退通用 hit
      if (!this.sfx.playFiles(e.def.hitSound, 1, e.cx, e.cy)) this.sfx.play('hit', 1, e.cx, e.cy);
      const crit = Math.random() < 0.04 + this.player.critChance('melee') / 100
        // ★武器 item.crit(GetWeaponCrit:4 基础+武器+装备)——vi_ 数据驱动近战武器 crit
        // 字段此前未入链(挥砍侧全族只有装备 crit)
        + (itemCombat(this.swing ? (ITEM_DEFS[this.swing.item]?.vid ?? viIdFromKey(ITEM_DEFS[this.swing.item]?.key ?? '')) : -1)?.crit ?? 0) / 100;
      // 工具（镐/斧）也有攻击力但远弱于剑：功率/16（铁镐 3 / 铁斧 4，铁剑 16）—— 仅应急；
      // vi_ 数据驱动近战武器优先取挥击时缓存的 combat 表伤害/击退（swing.dmg/kb）；
      // 装备全系伤害乘区（徽章/险恶词缀等，ApplyEquipFunctional dmgMelee 段）
      const baseDmg = ((meleeDmg || Math.max(1, Math.ceil((tool?.power ?? 10) / 16)))
        * this.player.damageMult('melee')); // ⑥ pen 移 hit 时（挥击处传）
      this.player.onMeleeHit(); // 甲虫进攻套蓄能（命中结算前计数无碍）
      // 原版 Main.DamageVar：±15% 浮动（1 + rand(-15..15)/100）
      const dmg = Math.max(1, Math.round(baseDmg * (crit ? 2 : 1) * (1 + (Math.random() * 30 - 15) / 100)));
      const kdir = Math.sign(e.cx - p.cx) || this.player.facing;
      // 击退 = 官方击退值（原版 knockBack 2-5.5 → 速度系数 0.65）；
      // 力量手套族 kbGlove 近战击退翻倍
      const kb = ((this.swing.kb ?? tool?.knockback ?? swingCombat?.knockBack ?? 3)) * (this.player.equipStats.kbGlove ? 2 : 1) * (this.player.buffs.has(BuffType.Titan) ? 1.5 : 1); // 0.65 自造已摘（glove×2/Titan×1.5=P:52477-52498）
      const killed = e.hurt(dmg, kdir * kb, 0, this, this.player.equipStats.armorPen + this.player.meleeArmorPen, crit, 0, true); // kby=0 走原版 X/Y 语义;fromPlayer=DPS 计(Player.cs:20165)
      this.addDamageNumber(e.cx, e.y, dmg, crit, crit ? '#FFD040' : '#FF7060');
      // 武器浸剂（meleeEnchant 表 Player.cs:11604 → 敌 debuff :6141-6171 时长 Next(a,b) 秒）
      if (this.player.buffs.has(BuffType.ImbueVenom)) e.venomT = Math.max(e.venomT, 5 + Math.random() * 5);
      if (this.player.buffs.has(BuffType.ImbueCursed)) e.cursedT = Math.max(e.cursedT, 3 + Math.random() * 4);
      if (this.player.buffs.has(BuffType.ImbueFire)) e.onFireT = Math.max(e.onFireT, 3 + Math.random() * 4);
      if (this.player.buffs.has(BuffType.ImbueGold)) e.midasT = 2;
      if (this.player.buffs.has(BuffType.ImbueIchor)) e.ichorT = Math.max(e.ichorT, 10 + Math.random() * 10);
      if (this.player.buffs.has(BuffType.ImbueNano)) e.confusedT = Math.max(e.confusedT, 1 + Math.random() * 3);
      if (this.player.buffs.has(BuffType.ImbuePoison)) e.poisonT = Math.max(e.poisonT, 5 + Math.random() * 5);
      // 冰霜盔甲引擎(melee 挥砍门,StatusNPC :93712-93716 → Frostburn2 5-14s)
      applyFrostBurn(this.player.equipStats.frostBurn, e as unknown as Record<string, number>);
      // 岩浆石/火焰护手（Player.cs:6184-6198 三段掷：1/4→6s / 3/8→4s / 3/8→1s OnFire3）
      applyMagmaStoneSwing(this.player.equipStats.magmaStone, e as unknown as Record<string, number>);
      if (this.player.buffs.has(BuffType.ImbueParty)) {
        this.spawnParticles(e.cx, e.cy, ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)], 6, 2.4, { life: 40, damp: 0.96 });
      }
      // 幸运币（Player.cs:43892-43916，近战 on-hit）：门 = NPC.value>0（雕像产怪
      // value=0，Wiring.cs:2479）&& hasLuckyCoin && rand.Next(5)==0；
      // 币种 71 铜、rand.Next(10)==0 升 72 银、rand.Next(100)==0 升 73 金（顺序覆盖）；
      // stack = rand.Next(1, 11)（1-10，旧"1-5 铜"近似已退役）；
      // velocity.Y = Next(-20,1)*0.2、X = Next(10,31)*0.2*direction（玩家朝向）
      const luckyNetId = e.vanillaNetId !== 0 ? e.vanillaNetId : (e.vanillaId ?? 0);
      if (!e.spawnedFromStatue && npcValueOf(luckyNetId) > 0
        && this.player.equipStats.luckyCoin && Math.floor(Math.random() * 5) === 0) {
        const coin = luckyCoinRoll(Math.random, this.player.facing);
        this.spawnDrop(e.cx, e.y, coin.key, coin.stack, coin.vx, coin.vy);
      }
      if (killed && e.def.boss) { /* boss 死亡处理在 fixedUpdate */ }
    }
    // ---- 近战 PvP：远端玩家命中（原版 ItemCheck_MeleeHitPVP Player.cs:43401-43415）----
    // 权威=被打方本地结算（victim-settles）：本端只检测相交并广播 msg44 意向，
    // 不对 proxy 扣血（proxy.hp 由被击端 msg16 回报刷新）。门禁：pvpAllowed 房 +
    // 自己 hostile + 对方 hostile/异队（InOpposingTeam）——与 Damage_PVP :13506-13510
    // 同构（原版 :43409 同队门 team!=0&&equal）
    if (this.net?.active && this.net.policy.pvpAllowed && this.player.hostile && !isNet) {
      for (const rpEnt of this.remotePlayerProxies) {
        const rp = rpEnt as Player;
        const slot = (rp as unknown as { __netSlot?: number }).__netSlot;
        if (slot === undefined || rp.dead) continue;
        if (this.swingHitSet.has(rp.id)) continue;             // 同一挥击只中一次
        if (!inOpposingTeam(this.player, rp)) continue;         // :4287（含双方 hostile 门）
        if (!hitRect(rp.x, rp.y, rp.w, rp.h)) continue;
        this.swingHitSet.add(rp.id);
        // 命中意向：裸伤（对方端自行结算防御/endurance/无敌帧）+ 击退方向 + 凶器 id。
        // ★原版近战 PvP 暴击 = 恒 10%（:43410 Next(1,101)<=10,不吃 meleeCrit 装备链）
        const crit = Math.random() * 100 < 10;
        const rawDmg = Math.max(1, Math.round((meleeDmg || Math.max(1, Math.ceil((tool?.power ?? 10) / 16)))
          * this.player.damageMult('melee') * (crit ? 2 : 1) * (1 + (Math.random() * 30 - 15) / 100)));
        const kdir = Math.sign(rp.cx - p.cx) || this.player.facing;
        // flags: bit0=crit / bits1-4=武器浸剂 meleeEnchant（被击端 StatusPvP 消费）
        const enchant = meleeEnchantOf(this.player.buffs);
        this.net.sendStrikePlayer(slot, rawDmg, kdir, 0, this.swing?.item ?? -1,
          (enchant << 1) | (crit ? 1 : 0));
        // 攻击端命中后效（ItemCheck_MeleeHitPvP :43420-43457,与原版同在 Hurt 后）：
        // ①甲虫进攻套窗口刷新（beetleCounter+=num2 :43434——本仓时间蓄能模型近似）
        this.player.onMeleeHit();
        // ②派对浸剂（enchant 7）彩纸（原版 spawn 弹 289——纯视觉,粒子近似,同敌怪侧）
        if (enchant === 7) {
          this.spawnParticles(rp.cx, rp.cy, ['#FF6090', '#60FF90', '#6090FF', '#FFD040'][Math.floor(Math.random() * 4)],
            6, 2.4, { life: 40, damp: 0.96 });
        }
        // ③蝙蝠棒 5097（BatBat_TryLifeLeeching :43518-43525：命中且 hp<max → Heal(1)）
        // ④变态刀 3106（:43455-43460）：命中玩家 → stealth=1 满潜行
        const pvpHeldVid = ITEM_DEFS[this.swing?.item ?? -1]?.vid ?? -1;
        if (pvpHeldVid === 5097 && this.player.hp < this.player.maxHp) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
        }
        if (pvpHeldVid === 3106) this.player.stealth = 1;
        // 本端反馈：受击音 + InPVP 公式预览飘字（Main.cs:65636：dmg−def×0.5 下限 1，
        // 与 Hurt 返回值同源——实扣以被击端为准）
        this.sfx.play('hit', 1, rp.cx, rp.cy);
        this.addDamageNumber(rp.cx, rp.y, Math.max(1, Math.round(rawDmg - rp.defense * 0.5)), crit, crit ? '#FFD040' : '#FF7060');
      }
    }
    void prog;
  }

  /** Main.SkipToTime（Main.cs:64657-64671，CreativePowers StartDay/Noon/Night/Midnight
   *  :774-864 调用）：while(setIsDayTime != dayTime) 逐次跑 UpdateTime_StartDay/Night
   *  完整链（血月 roll/渔夫任务重掷/月相推进…）再落时刻。本仓实现：先把时钟拨到
   *  目标相位边界（_lastClockT 置边界前值 → 本帧 crossed 检测自然触发完整链），
   *  pendingTimeSkip 由昼夜事件块收尾落到最终时刻——同帧内等价原版同步语义 */
  skipToTime(timeOfDay: number, setIsDayTime: boolean): void {
    const w = this.world;
    const boundary = setIsDayTime ? Clock.DAWN : Clock.DUSK;
    if (setIsDayTime !== w.clock.isDay) {
      // 相位翻转：跨午夜回绕时 dayCount++（Clock.tick 的 wrap 语义）
      if (w.clock.timeOfDay > boundary) w.clock.dayCount++;
      w.clock.timeOfDay = boundary + 1e-6;
      this._lastClockT = boundary - 1e-6;   // 保证 crossed() 命中
      this.pendingTimeSkip = timeOfDay;
    } else {
      // 同相跳时刻：原版 while 不进——不触发昼夜事件
      w.clock.timeOfDay = timeOfDay;
      this._lastClockT = timeOfDay;
    }
  }

  // ================= 生成 =================

  /** 绑缚救援族 → bound TownNPC（原版为独立被缚 NPC 类型，本仓以 TownNPC.bound
   *  近似；同 453 模式转桶；VanillaSpawner.spawnBound 只交付占位体——589/685/686
   *  json 缺条目，105/106/123/354 为真条目）。覆盖全部（2026-08-13 扩展：生成期
   *  placeBoundRescueNpcs 移除后，123 机械师/354 造型师/589 高尔夫球手的链命中
   *  也走本转换；534 税务员除外——原版是地狱敌怪 + 净化粉 Transform(441) 链）：
   *    105 BoundGoblin(:1996) / 106 BoundWizard(:1999) / 685 BoundTownSlimeOld(:2002)
   *    354 WebbedStylist(:1576) / 589 GolferRescue(:1600) / 123 BoundMechanic(:2563)
   *  已在场则跳过——activeIds 的反查登记（BOUND_TOWN_NPC_ID）通常已在上游拦下，
   *  此处双保险。返回 true = 已消费该 picked（调用方不再走通用放置） */
  trySpawnBoundTownNpc(picked: Enemy): boolean {
    const boundKey = picked.vanillaId === 105 ? 'goblin_tinkerer'
      : picked.vanillaId === 106 ? 'wizard'
        : picked.vanillaId === 685 ? 'town_slime_old'
          : picked.vanillaId === 686 ? 'town_slime_clumsy'
          : picked.vanillaId === 354 ? 'stylist'
            : picked.vanillaId === 589 ? 'golfer'
              : picked.vanillaId === 579 ? 'tavernkeep'
                : picked.vanillaId === 123 ? 'mechanic' : null;
    if (!boundKey) return false;
    if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === boundKey)) return true;
    // 落位：currentSpawnY = 落脚实心面（findSpawnTile 向下找的首个实心格，与
    // placeBoundNpc 的"脚底上一格+1"同义）→ 脚底 = 该格顶。
    // vanillaSpawner 在调用点（trySpawnEnemy 头部）必已初始化
    const vs = this.vanillaSpawner!;
    const tn = new TownNPC(boundKey, vs.currentSpawnX * TILE + 8, vs.currentSpawnY * TILE);
    tn.bound = true;
    this.entities.add(tn, 'npcs');
    return true;
  }

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
    // bound TownNPC → 绑缚原版 id 登记（原版被缚 NPC 本体就是 105/106/123/354/589/685
    // 类型，AnyNPCs 直接可见；本仓 bound 态以 TownNPC 近似 → 反查登记，使三人组链的
    // !AnyNPCs(105/106/685) 场上唯一门与机械师/造型师/高尔夫球手各支同语义）
    for (const n of this.entities.npcs) {
      const tn = n as TownNPC;
      if (!(tn instanceof TownNPC) || tn.dead || !tn.bound) continue;
      const boundId = Game.BOUND_TOWN_NPC_ID[tn.npcKey];
      if (boundId !== undefined) activeIds.add(boundId);
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
    // NPC.AnyHelpfulFairies（NPC.cs:90885）：跟随态仙女（583/584/585 且 ai[2]>1）
    // 在场 → 地下仙女链关门。spawner 无实体桶访问，本侧每周期喂入
    this.vanillaSpawner.fairyHelpfulActive = this.entities.enemies.some((n) => {
      const en = n as Enemy;
      return !en.dead && (en.vanillaId === 583 || en.vanillaId === 584 || en.vanillaId === 585)
        && en.ai2 > 1;
    }) || this.entities.critters.some((n) => {
      const c = n as Critter;
      const cn = CRITTER_BY_KEY[c.key]?.npc ?? 0;
      return !c.dead && cn >= 583 && cn <= 585;
    });
    // downedBoss3 双键（骷髅王击杀链写 downed_35，旧档/导入可能写 downedSkeletron——
    // 此前只传 downedSkeletron 恒 false，地牢守卫池永不切换、绑缚三人组 685 门不开）
    // 双地牢越界（NPC.cs:313 = dualDungeonsSeed && insideUnbreakableWalls && 档位比较）：
    // 扫描态由 Player.updateUnbreakableWallScan 维护（内部 20t 冷却幂等）；
    // DangerousDungeonCurse.cs 双表 1:1——needs=所在区档 / can=进度可安全档
    this.player.updateUnbreakableWallScan(w);
    const ddNeeds = this.scene?.zoneTemple ? 5 : this.scene?.zoneHallow ? 4
      : this.scene?.zoneDungeon ? 3 : this.scene?.zoneJungle ? 2
        : (this.scene?.zoneCrimson || this.scene?.zoneCorrupt) ? 1 : 0;
    const ddCan = (w.flags['downed_134'] || w.flags['downed_125'] || w.flags['downed_127']
      || w.flags['downed_657']) ? 5
      : (w.flags.downedSkeletron || w.flags['downed_35'] || w.flags.hardMode) ? 4
        : w.flags['downed_222'] ? 3
          : (w.flags['downed_13'] || w.flags['downed_266']) ? 2
            : (w.flags.downedSlimeKing || w.flags['downed_50'] || w.flags['downed_4']
              || w.flags.downedEyeOfCthulhu) ? 1 : 0;
    this.vanillaSpawner.setPlayerFlags(!!this.scene?.zoneDungeon,
      !!(w.flags.downedSkeletron || w.flags['downed_35']),
      invaders, activeIds, moonCtx, lunar, this.player.maxHp, this.player.luck,
      !!w.seedFlags?.everything && this.player.insideUnbreakableWalls && ddCan < ddNeeds,
      partyIsUp(this.partyState));
    // 天气注入（雪原雨刷怪率修正 + 沙尘暴怪池门）。第三参 = NPC.cs:302 读
    // player.ZoneSandstorm（SceneMetrics zoneSandstorm 派生位——已含地表大气门，
    // 旧 zoneDesert&&<groundLevel+30 近似退役）
    this.vanillaSpawner.setWeather(
      w.weather.cloudAlpha,
      w.weather.sandstorm.happening,
      !!this.scene?.zoneSandstorm,
    );
    // 狙击镜扩圈（GetSpawnArea :846-862）：手持 1254/1299 或装备 1299 → num3 档
    {
      const heldV = viIdFromKey(ITEM_DEFS[p.inv.heldItem()?.id ?? -1]?.key ?? '') ?? -1;
      const scopeAcc = p.inv.equippedAccessories()
        .some((id) => viIdFromKey(ITEM_DEFS[id]?.key ?? '') === 1299);
      this.vanillaSpawner.scopeNum3 = (heldV === 1254 || heldV === 1299 || scopeAcc)
        ? (heldV === 1254 && scopeAcc ? 1.25 : (heldV === 1254 || heldV === 1299) ? 1.5 : 2.0)
        : 0;
    }
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
      !!w.clock.bloodMoon,
      p.buffs.has(BuffType.Invisibility),          // 隐身（:611-615）
      p.equipStats.anglerSetSpawnReduction,       // 渔夫套（:627-630）
      this.scene?.zoneShadowCandle ?? false);     // ShadowCandle(:328-333)
    if (nearby >= maxSpawns) return;
    // TrySpawnAnNPC L30：Main.rand.Next(spawnRate) != 0 拒绝（每帧 1/spawnRate 概率）
    if (Math.floor(Math.random() * spawnRate) !== 0) return;
    const viewHalfW = Math.ceil(this.camera.viewW / (this.camera.zoom || 1) / 2 / TILE);
    const viewHalfH = Math.ceil(this.camera.viewH / (this.camera.zoom || 1) / 2 / TILE);
    const rng = new RNG((Math.random() * 1e9) | 0);
    const picked = this.vanillaSpawner.spawn(p.cx, p.cy, rng, viewHalfW, viewHalfH);
    if (!picked) {
      // SpawnFrog 687 交付（:5521-5535）：无 Enemy 数据条目 → 转 Critter；
      // AnyNPCs(687) 去重的 Critter 侧补判（activeIds 不含小动物桶）
      const ck = this.vanillaSpawner.pendingCritterKey;
      if (ck) {
        this.vanillaSpawner.pendingCritterKey = null;
        const dupe = this.entities.critters.some((n) => {
          const c = n as Critter;
          return !c.dead && CRITTER_BY_KEY[c.key]?.npc === 687;
        });
        if (!dupe) {
          this.entities.add(new Critter(ck,
            this.vanillaSpawner.currentSpawnX * TILE + 8,
            this.vanillaSpawner.currentSpawnY * TILE), 'critters');
        }
      }
      return;
    }
    // 骷髅商（NPC.cs:4906-4910）：转 TownNPC 进 npcs 桶；场上已有则跳过（CountNPCS(453)==0）
    if (picked.vanillaId === 453) {
      if (this.entities.npcs.some((n) => n instanceof TownNPC && !n.dead && n.npcKey === 'skeleton_merchant')) return;
      const sm = new TownNPC('skeleton_merchant', this.vanillaSpawner.currentSpawnX * TILE + 8, (this.vanillaSpawner.currentSpawnY + 1) * TILE);
      this.entities.add(sm, 'npcs');
      return;
    }
    // 绑缚救援族 → bound TownNPC（见 trySpawnBoundTownNpc；六+一只全表与门注释在那里）
    if (this.trySpawnBoundTownNpc(picked)) return;
    // 放置：原版 SpawnNPC 直接落位；水生/蠕虫分支由链内返回的怪自带 AI 处理落脚
    const st = w.store;
    const ptx = this.vanillaSpawner.currentSpawnX;
    const pty = this.vanillaSpawner.currentSpawnY;
    if (ptx < 2 || pty < 2 || ptx > st.w - 3 || pty > st.h - 3) return;
    // 萤火虫成群附加消费（原版 :2327-2344/:4419-4433/:5767-5782 主只后四向
    // SpawnNPC——spawner 单返回值 API 的侧信道队列；按原版像素坐标直放）
    const extras = this.vanillaSpawner.pendingCritterExtras;
    if (extras.length > 0) {
      this.vanillaSpawner.pendingCritterExtras = [];
      for (const ex of extras) {
        const e2 = Enemy.fromVanilla(ex.npc, ptx * TILE + 8 + ex.dx, pty * TILE + ex.dy);
        if (!e2) continue;
        if (e2.vanilla?.critter) { e2.x -= e2.w / 2; this.entities.add(e2, 'critters'); }
        else this.entities.add(e2, 'enemies');
      }
    }
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

  /** 各 NPC 入驻条件（NPC.SpawnAllowed_* , NPC.cs:7046-7170 1:1）。
   *  五个 SpawnAllowed_* 首位都查 unlocked* 旗（到访一次即永久置位，WorldGen.cs
   *  :5510-5560 生成点 switch；随存档）——曾漏：商人到访后花光钱再死亡就永不回归 */
  private townNpcSpawnAllowed(key: string): boolean {
    const p = this.player;
    const uf = this.world.flags;
    switch (key) {
      case 'guide':
        return true;
      case 'merchant': {
        // SpawnAllowed_Merchant：unlockedMerchantSpawn 或 玩家硬币合计 ≥ 5000 铜（50 银）
        if (uf.unlockedMerchantSpawn) return true;
        let copper = 0;
        for (const s of p.inv.slots) {
          if (!s) continue;
          const ci = coinIndexOf(s.id);
          if (ci < 0) continue;
          copper += s.stack * COIN_VALUES[ci];
          if (copper >= 5000) return true;
        }
        return false;
      }
      case 'nurse':
        // SpawnAllowed_Nurse：unlockedNurseSpawn 或 statLifeMax/20 > 5（用过生命水晶）
        return !!uf.unlockedNurseSpawn || Math.floor(p.maxHp / 20) > 5;
      case 'arms_dealer': {
        // SpawnAllowed_ArmsDealer：unlockedArmsDealerSpawn 或 背包有子弹系物品
        if (uf.unlockedArmsDealerSpawn) return true;
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
        // SpawnAllowed_Demolitionist：unlockedDemolitionistSpawn 或 背包有炸弹系物品
        if (uf.unlockedDemolitionistSpawn) return true;
        const bombKeys = new Set(['vi_166_bomb', 'vi_167_dynamite', 'vi_168_grenade',
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
        // 圣诞老人(cs:65277)：霜军团已胜（NPC.downedFrost——雪军团入侵胜利置位，
        // Game 入侵胜利块 flags.downedFrost）**且**圣诞季（xMas）——曾漏 downedFrost
        return !!this.world.flags['downedFrost'] && this.world.clock.xMas;
      case 'tavernkeep':
        // 酒保(cs:65283)：savedBartender（579 醉酒酒保链解救置位，:1565/:19806）
        return !!this.world.flags['savedBartender'];
      case 'angler':
        // 渔夫(cs:65292)：savedAngler（睡渔夫 376 解救置位）——解救后死亡的重生门
        return !!this.world.flags['savedAngler'];
      case 'zoologist':
        // 动物学家(cs:65375)：图鉴完成度 ≥10%（Main.GetBestiaryProgressReport = 已解锁条目/
        // 总条目；数据层 data/Bestiary.ts。原版另有 vampireSeed 世界分支——种子系统未实装）
        return this.world.bestiary.completion().percent >= 0.1;
      case 'party_girl':
        // 派对女孩(cs:65249-65253)：unlockedPartyGirlSpawn 直通（十周年/醉酒世界
        // 置位，普通种子恒假）或每轮 1/40 重掷（另需在场 NPC ≥20，见优先级链）
        return !!this.world.flags.unlockedPartyGirlSpawn || Math.random() < 1 / 40;
      case 'dyer': {
        // SpawnAllowed_DyeTrader（cs:7096）：unlockedDyeTraderSpawn 或 背包有染料/染料物
        if (uf.unlockedDyeTraderSpawn) return true;
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
        // 公主(cs:65241-65252 flag9)：下列全部在场才解锁（Main.cs num2-num27 全 26
        // 计数器——含渔夫 369 与酒保 550，2026-08-13 补齐）
        const all = ['merchant', 'nurse', 'dryad', 'arms_dealer', 'guide', 'demolitionist',
          'clothier', 'steampunker', 'dyer', 'party_girl', 'cyborg', 'painter', 'witch_doctor',
          'pirate', 'stylist', 'goblin_tinkerer', 'wizard', 'mechanic', 'truffle',
          'tax_collector', 'golfer', 'zoologist', 'angler', 'tavernkeep'];
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
    // npcId 随 home 携带（ScoreRoom 占用豁免 CanNPCsLiveWithEachOther 用）
    const homes = npcs.filter((n) => n.home)
      .map((n) => ({ x: n.home!.x, y: n.home!.y, npcId: n.vanillaId }));
    const st = this.world.store;
    // 入驻锚点（SpawnHomelessNPC :5014-5033）：已安家 townNPC 的 home 随机取一——
    // 原版房表口径 townNPC && type!=37 && !homeless（:5019）：宠物算锚（宠物
    // townNPC=true，NPC.cs:17145）；old_man(type 37) 虽有地牢驻点 home 也不可作锚
    // （否则全图锚点被地牢劫持，出生点旁的房永不可见）。
    // 冷启（无任何可作锚的已安家 NPC）回退出生点（原版静态 LastFoundHouse(0,0) 必
    // 失败后走 randomNext homes，无家可取时 :5041 直接 return——本仓出生点兜底保证
    // 第一间出生点旁的房可被发现，见 findFreeHouse ±10 窗注释）
    const anchorPool = homes.filter((h) => h.npcId !== 37);   // 37 = Old Man（:5019 排除）
    const pickAnchor = (): { x: number; y: number } =>
      anchorPool.length > 0 ? anchorPool[Math.floor(Math.random() * anchorPool.length)]
        : { x: this.world.spawnX, y: this.world.spawnY };

    // ①' 被绑巫师【不补放】（2026-08-13 对齐原版）：106 BoundWizard 唯一来源 =
    // SpawnAnNPC 三人组链（NPC.cs:1999-2002，hardMode && 1/20 && 洞穴层深处门），
    // VanillaSpawner 已 1:1——困难模式开启后由链自然掷出，入驻轮直接补放非原版
    // （生成期 placeBoundRescueNpcs 同批移除，实证见 onWorldReady 注释）
    // ①'' 睡渔夫补放（原版 SpawnNPC 海洋/沙滩分支每轮掷——补放近似其"未解救则持续在场"）
    this.placeSleepingAngler();

    // ① QuickFindHome（Main.cs:65072：每轮对未安家 NPC 找房入住）
    // bound（被绑待救）不入住不搬动——原版 AI_007 bound 态原地，否则五个救援 NPC
    // 会被塞进同一间空房叠在一点（读档/新世界 7200 tick 后必现）
    for (const n of npcs) {
      if (n.home || n.bound || n.npcKey === 'old_man') continue;
      const anchor = pickAnchor();
      const house = findFreeHouse(st, homes, anchor.x, anchor.y, n.vanillaId);
      if (!house) continue; // 该锚点 ±10 窗内无房：NPC 留 homeless，下一 NPC 换锚点重试（锚点各异不整体放弃）
      n.home = { x: house.standX, y: house.standY };
      n.leashHome = true; // 有家者白天在家附近游走
      homes.push({ x: house.standX, y: house.standY, npcId: n.vanillaId });
      n.x = house.standX * TILE + 8 - n.w / 2;
      n.y = (house.standY + 1) * TILE - n.h;
    }

    // ② 优先级链（Main.cs num42 完整顺序；护士/爆破手要求商人在场，
    //    染料商 ≥4 人、油漆工 ≥8 人、派对女孩 ≥20 人且 1/40 重掷）
    const merchantHere = has('merchant');
    const allow = (key: string) => this.townNpcSpawnAllowed(key);
    const n = npcs.length; // num40：在场城镇 NPC 总数（含守卫老人，原版同）
    // 严格按 Main.cs:65458-65570 num42 优先链原序（2026-08-13 对齐：补 angler
    // 369/酒保 550、造型师归位到裁缝后、史莱姆第二轮按 :65557-65574 原序重排）
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
      ['angler', !has('angler') && allow('angler')],            // :65489（369）
      ['cyborg', !has('cyborg') && allow('cyborg')],
      ['pirate', !has('pirate') && allow('pirate')],
      ['clothier', !has('clothier') && allow('clothier')],
      ['stylist', !has('stylist') && allow('stylist')],         // :65506（354，裁缝后）
      ['dyer', !has('dyer') && n >= 4 && allow('dyer')],
      ['painter', !has('painter') && n >= 8],
      ['party_girl', !has('party_girl') && n >= 20 && allow('party_girl')],
      ['santa_claus', !has('santa_claus') && allow('santa_claus')],
      ['tavernkeep', !has('tavernkeep') && allow('tavernkeep')],  // :65516（550）
      ['golfer', !has('golfer') && allow('golfer')],
      ['tax_collector', !has('tax_collector') && allow('tax_collector')],
      ['truffle', !has('truffle') && allow('truffle')],
      ['zoologist', !has('zoologist') && allow('zoologist')],
      ['princess', !has('princess') && allow('princess')],
      // ---- 城镇史莱姆族第二轮（Main.cs:65391-65422 + :65557-65574 原序：
      //  铜侍从 684 → 蓝 670 → 酷 678 → 老 679 → 紫 680 → 红 682 → 黄 683 → 彩虹 681；
      //  兔 656/猫 637/狗 638 的 bought* 旗依赖许可证商店未实装，登记缺失）----
      ['town_slime_squire', !has('town_slime_squire') && !!this.world.flags.unlockedSlimeCopperSpawn],
      ['town_slime_blue', !has('town_slime_blue') && !!this.world.flags.unlockedSlimeBlueSpawn],
      ['town_slime_cool', !has('town_slime_cool')
        && (!!this.partyState.genuineParty || !!this.world.flags.unlockedSlimeGreenSpawn)],  // :65274 真派对门
      ['town_slime_old', !has('town_slime_old') && !!this.world.flags.unlockedSlimeOldSpawn],
      ['town_slime_clumsy', !has('town_slime_clumsy') && !!this.world.flags.unlockedSlimePurpleSpawn],
      ['town_slime_red', !has('town_slime_red') && !!this.world.flags.unlockedSlimeRedSpawn],
      ['town_slime_yellow', !has('town_slime_yellow') && !!this.world.flags.unlockedSlimeYellowSpawn],
      ['town_slime_diva', !has('town_slime_diva') && !!this.world.flags.unlockedSlimeRainbowSpawn],
      // ---- 宠物三只（:65567-65574 序：兔 656 → 猫 637 → 狗 638；bought* 旗由
      //  许可证使用置位——Chest.cs:3265-3280 动物学家进货：4829 无门/4830 图鉴
      //  ≥25%/4910 ≥45%；NPCID.Sets.IsTownPet 含宠物+全部城镇史莱姆=免房入住）----
      ['town_bunny', !has('town_bunny') && !!this.world.flags.boughtBunny],
      ['town_cat', !has('town_cat') && !!this.world.flags.boughtCat],
      ['town_dog', !has('town_dog') && !!this.world.flags.boughtDog],
    ];
    const pick = prio.find(([, ok]) => ok)?.[0];
    if (!pick) return;
    if (pick === 'town_slime_cool') this.world.flags.unlockedSlimeGreenSpawn = true;  // WorldGen.cs:5543

    // ③ 入住 / 流浪生成（askingNpcId = 待生成者，占用豁免/同房避让用）。
    // 锚点同 ①（pickAnchor：已安家 home 随机取一/冷启出生点）——原版此处为
    // SpawnTownNPC(LastFoundHouse) 失败后走 :5014-5033 randomNext homes，
    // 新 NPC 落锚点后经 QuickFindHome(:5135) 在锚点 ±10 窗内找房
    const id = TOWN_NPC_IDS[pick].id;
    const anchor = pickAnchor();
    const house = findFreeHouse(st, homes, anchor.x, anchor.y, id);
    const name = Lang.npcName(id) ?? pick;
    // NPCID.Sets.IsTownPet（NPCID.cs:4444）= 宠物三只+全部城镇史莱姆：WorldGen.
    // IsThereASpawnablePrioritizedTownNPC(:4855) 对本集免房放行——无房时在出生点
    // 附近流浪生成（不设 home），不占用 SpawnHomelessNPC 的白天/有家锚点门
    const TOWN_PET_KEYS = new Set(['town_bunny', 'town_cat', 'town_dog',
      'town_slime_blue', 'town_slime_cool', 'town_slime_old', 'town_slime_clumsy',
      'town_slime_diva', 'town_slime_red', 'town_slime_yellow', 'town_slime_squire']);
    if (!house && TOWN_PET_KEYS.has(pick)) {
      const ax = this.world.spawnX + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.floor(Math.random() * 40));
      if (ax > 3 && ax < st.w - 4) {
        let ay = Math.max(4, this.world.spawnY - 20);
        const limit = Math.min(st.h - 3, this.world.spawnY + 20);
        while (ay < limit && !st.isSolid(ax, ay)) ay++;
        if (ay < limit) {
          const npc = new TownNPC(pick, ax * TILE + 8, (ay + 1) * TILE);
          this.entities.add(npc, 'npcs');
          this.newText(Lang.text('Announcement.HasArrived', name), 50, 125, 255);
        }
      }
      return;
    }
    // 松露人特判（WorldGen.CheckSpecialTownNPCSpawningConditions :4919-4946）：
    // unlockedTruffleSpawn 未置时房间须整体在地表（roomY2 ≤ worldSurface），
    // 且房内蘑菇族 tile（70 草/71 植/72 树/528 藤）≥ SceneMetrics.
    // MushroomTileThreshold(=100)——此前按全域找房（备案），现 1:1；不满足则本轮跳过
    if (house && pick === 'truffle') {
      const MUSH = [TILE_BY_KEY['v_70_mushroom_grass_block'], TILE_BY_KEY['v_71_mushroom_plant'],
        TILE_BY_KEY['v_72_mushroom_tree'], TILE_BY_KEY['v_528_mushroom_vines']].filter(
        (v): v is number => v !== undefined);
      let mush = 0;
      let roomBottom = 0;
      for (const ti of house.tiles) {
        const ty = Math.floor(ti / st.w);
        if (ty > roomBottom) roomBottom = ty;
        if (MUSH.includes(st.type[ti])) mush++;
      }
      const surfOk = !!this.world.flags.unlockedTruffleSpawn
        || roomBottom <= Math.floor(this.world.groundLevel);
      if (!surfOk || mush < 100) return;   // 房不合格：本轮放弃（下轮重试）
    }
    if (house) {
      // SpawnTownNPC：房间合格且无人 → 生成在房内、安家（Announcement.HasArrived）。
      // 到访一次即写 unlocked* 永久旗（WorldGen.cs:5510-5560 生成点 switch——
      // 商人/护士/军火/爆破/染料/松露/派对/公主/酷史莱姆的 SpawnAllowed 直通门）
      const ARRIVE_UNLOCK_FLAG: Record<string, string> = {
        merchant: 'unlockedMerchantSpawn', nurse: 'unlockedNurseSpawn',
        arms_dealer: 'unlockedArmsDealerSpawn', demolitionist: 'unlockedDemolitionistSpawn',
        dyer: 'unlockedDyeTraderSpawn', truffle: 'unlockedTruffleSpawn',
        party_girl: 'unlockedPartyGirlSpawn', princess: 'unlockedPrincessSpawn',
        town_slime_cool: 'unlockedSlimeGreenSpawn',
      };
      if (ARRIVE_UNLOCK_FLAG[pick]) this.world.flags[ARRIVE_UNLOCK_FLAG[pick]] = true;
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
      const homeAnchor = homes[Math.floor(Math.random() * homes.length)];  // 同 pickAnchor 口径（此处已保证 homes 非空）
      const ax = homeAnchor.x + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.floor(Math.random() * 50));
      if (ax < 3 || ax > st.w - 4) return;
      let ay = Math.max(4, homeAnchor.y - 20);
      const limit = Math.min(st.h - 3, homeAnchor.y + 20);
      while (ay < limit && !st.isSolid(ax, ay)) ay++;
      if (ay >= limit) return;
      const npc = new TownNPC(pick, ax * TILE + 8, (ay + 1) * TILE);
      this.entities.add(npc, 'npcs');
      this.newText(Lang.text(`Announcement.HomelessArrived_${Math.floor(Math.random() * 6)}`, name), 50, 125, 255);
    }
  }

  /** 绑缚 NPC 触碰解救（原版 AI_007 玩家接触 bound → 转正；右键解救保留为便捷兜底）：
   *  玩家 AABB 与 bound TownNPC 相交即 freeBoundNpc（534 税务官例外——需净化粉）。 */
  private boundTouchCheck(): void {
    const p = this.player;
    if (p.dead) return;
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (!(npc instanceof TownNPC) || npc.dead || !npc.bound) continue;
      if (npc.npcKey === 'tax_collector') continue;   // 原版 534 只吃净化粉
      if (p.x < npc.x + npc.w && p.x + p.w > npc.x && p.y < npc.y + npc.h && p.y + p.h > npc.y) {
        this.freeBoundNpc(npc);
      }
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
    this.achCheckBestiary();
    // 快乐度快照（Player.SetTalkNPC Player.cs:4189-4193：GetShoppingSettings 一次算好，
    // currentShoppingSettings 供商店价格/心情报告/成就共用）
    this.dialogHappiness = this.computeShopHappiness(npc);
    // 成就：与最大快乐度 NPC 对话（Player.cs:4195-4197 PriceAdjustment<=0.82 → event 20）
    if (this.dialogHappiness.priceMul <= 0.82) {
      this.achievements.handleSpecialEvent(20, {
        statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana,
      });
    }
    npc.talking = true;  // 原版 AI_007:53721 对话中站定面向玩家
    npc.talkCooldown = 30;
    this.sfx.play('menuOpen'); // 对话面板打开音（原版 UI 面板开合语义 id 10/11）
    const typeName = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    // FullName 语义（NPC.FullName:6657 + Game.NPCTitle，zh "{1}{0}"=类型名+个人名）
    const name = npc.givenName ? Lang.text('Game.NPCTitle', npc.givenName, typeName) : typeName;
    this.cb.onNpcDialog?.(name, this.formatDialogTags(this.townNpcChat(npc)),
      this.npcDialogButtons(npc), portraitUrl(npc.vanillaId));
  }

  /** 对话框按钮组（NPCInteractions.cs 各 NPCInteraction 注册序）：商店/治疗/收税/
   *  重铸/诅咒/渔夫任务（AnglerQuest :134-152，标签 Lang.inter[64]「任务」） */
  private npcDialogButtons(npc: TownNPC): Array<{ id: NpcButtonId; label: string }> {
    const buttons: Array<{ id: NpcButtonId; label: string }> = [];
    // 商店按钮(NPCInteractions.cs:489-513 Shop 注册表覆盖的全部 NPC)
    if (Game.SHOPSTOCK[String(npc.vanillaId)]) buttons.push({ id: 'shop', label: Lang.inter(28) });
    if (npc.npcKey === 'nurse') buttons.push({ id: 'heal', label: Lang.inter(54) });       // 治疗
    // 树妖：世界状态（NPCInteractions.cs:124-129 Register Status——注册序在商店后）
    if (npc.npcKey === 'dryad') buttons.push({ id: 'status', label: '世界状态' });
    if (npc.npcKey === 'tax_collector') buttons.push({ id: 'collect', label: Lang.inter(89) }); // 收集税款
    // 哥布林工匠：重铸（NPCChatText_TinkererReforge Main.cs:39431）
    if (npc.npcKey === 'goblin_tinkerer') buttons.push({ id: 'reforge', label: Lang.inter(19) });
    // 守卫老人:夜晚出现「诅咒」(白天只闲聊,原版 GetChat 语义)
    if (npc.npcKey === 'old_man' && !this.world.clock.isDay && !this.world.flags.hardMode) {
      buttons.push({ id: 'curse', label: Lang.inter(50) });                                 // 诅咒
    }
    // 渔夫：任务交付（NPCInteractions.AnglerQuest.GetText = Lang.inter[64]）
    if (npc.vanillaId === 369) buttons.push({ id: 'quest', label: Lang.inter(64) });
    // 快乐度（ReportHappiness，NPCInteractions.cs:289-314；注册序在全部商店/其它交互之后）：
    // 无家 NPC 换成 RequestHome 不显示（NPC.CanShowHomelessText NPC.cs:96048-96060），
    // 旅行商/骷髅商/老人 HappinessReport 为空也不显示
    if (!this.canShowHomelessText(npc) && (this.dialogHappiness?.report.length ?? 0) > 0) {
      buttons.push({ id: 'happiness', label: Lang.text('UI.NPCCheckHappiness') });
    }
    buttons.push({ id: 'close', label: Lang.inter(52) });                                   // 关闭
    return buttons;
  }

  /** NPC.CanShowHomelessText（NPC.cs:96048-96060）：无家且非 37/368/453 → true
   *  （此时 ReportHappiness 让位 RequestHome，快乐度按钮不显示） */
  private canShowHomelessText(npc: TownNPC): boolean {
    return !npc.home && npc.vanillaId !== 37 && npc.vanillaId !== 368 && npc.vanillaId !== 453;
  }

  /** 已开对话框的台词区重绘（交付结算后替换为 AnglerQuestChat 文案，不重开面板） */
  private refreshNpcDialog(npc: TownNPC, chat: string): void {
    const typeName = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    const name = npc.givenName ? Lang.text('Game.NPCTitle', npc.givenName, typeName) : typeName;
    this.cb.onNpcDialog?.(name, this.formatDialogTags(chat),
      this.npcDialogButtons(npc), portraitUrl(npc.vanillaId));
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

  /** bound TownNPC npcKey → 绑缚态原版 NPC id（本仓 bound 近似的反查表）：
   *  105 BoundGoblin（NPCID.cs:11275）/ 106 BoundWizard(:11277)/ 123 BoundMechanic /
   *  354 WebbedStylist / 589 GolferRescue / 534 DemonTaxCollector（酷刑者）/
   *  685 BoundTownSlimeOld(:12435)。trySpawnEnemy 把 bound TownNPC 登记进 activeIds，
   *  使 SpawnAnNPC 各被缚支的 !AnyNPCs(id) 场上唯一门成立 */
  private static readonly BOUND_TOWN_NPC_ID: Record<string, number> = {
    goblin_tinkerer: 105, wizard: 106, mechanic: 123, stylist: 354,
    golfer: 589, tax_collector: 534, town_slime_old: 685, town_slime_clumsy: 686,
    tavernkeep: 579,   // BartenderUnconscious（SpawnAnNPC :1565 链；触碰 Transform 550）
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
    // FreeCakeDialogue（ConditionalDialogue.cs:42-61）：原版 GetChat 第一句即
    // nextDialogue 先行（NPC.cs:94974-94978，nextDialogue 每帧刷新于 :91579）——
    // 蛋糕台词压过包括事件文案在内的一切分支。仅注册于派对女孩 208（:115）：
    // 生日派对开张（NPC.freeCake=true，BirthdayParty.cs:106）后首次对话 →
    // PartyGirlSpecialText.Cake1-3 + 直接入包切片蛋糕 3750（QuickSpawnItem
    // EntitySource_Gift）+ 清旗（联机 msg51 广播位不适用单机）。
    // 曾排在 npcSpecialEventText 之后=优先级反了（派对+血月同存时先出血月文案）
    if (npc.vanillaId === 208 && this.freeCake) {
      this.freeCake = false;
      const cake = VI(3750);
      if (cake && ITEM_BY_KEY[cake] !== undefined) this.player.inv.add(ITEM_BY_KEY[cake], 1);
      return Lang.specialText('PartyGirlSpecialText.Cake')
        ?? Lang.text('PartyGirlSpecialText.Cake1');
    }
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
      // 高尔夫球手(cs:95996-96004):1/3 任务分数档闲聊——档位按累计分
      // （NPC.cs:96008：>=2000 大师 / >=1000 老手 / <500 初学 / 其余 学徒），
      // 其余 GolferChatter 池
      if (r3() === 0) {
        const gs = this.player.golferScoreAccumulated;                 // :96008
        const tier = gs >= 2000 ? 'Master' : gs >= 1000 ? 'Journeyman'
          : gs < 500 ? 'Beginner' : 'Apprentice';
        return Lang.chatter('GolferQuestsChatter' + tier) ?? Lang.chatter('GolferChatter') ?? '……';
      }
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
  npcDialogButton(id: NpcButtonId): void {
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
      // 原版:释放诅咒时老人消失,击败骷髅王后转为裁缝。诅咒召唤无声——
      // NPCInteractions.OldManCurse :191 直调 SpawnSkeletron（无 PlaySound；
      // 骷髅王咆哮只在黎明逃跑/转头阶段，NPC.cs:21946/:22157）
      npc.dead = true;
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.OldManScream'));
      this.closeNpcDialog();
      this.summonBossAtTx('skeletron_head', Math.floor(npc.cx / TILE), false);
      return;
    }
    if (id === 'quest' && npc.vanillaId === 369) { this.anglerQuestTurnIn(); return; }
    // 快乐度详情（ReportHappiness.Interact NPCInteractions.cs:303-313：音效 12 + 报告展示）
    if (id === 'happiness') {
      this.sfx.play('menuTick');
      this.openNpcHappinessPanel();
      return;
    }
    if (id === 'status') {
      // 树妖世界状态（NPCInteractions.cs:124-129 Actions.GetDryadWorldStatus：
      // GetDryadWorldStatusDialog → 纯净世界触发 HandleSpecialEvent(27)）
      this.sfx.play('menuTick');
      // 星露谷彩蛋（DryadText_WorldPurityOrStardewValleyBit Main.cs:39697-39700：
      // 手持 Joja Cola 5275（CanDryadPlayStardewAnimation :39885-39894：held==5275
      // && npc.type==20）→ 消耗可乐 + event 46 INTERDIMENSIONAL_RECYCLING——优先于纯净门）
      const heldNow = this.player.inv.heldItem();
      if (heldNow && vanillaIdOfItem(heldNow.id) === 5275) {
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.JojaCola'));
        this.achievements.notifyProgressionEvent(46);
        this.cb.onInventoryChanged?.();
        return;
      }
      const pcts = alignmentPcts(this.world.store, Math.floor(this.world.groundLevel));
      const { text, pure } = dryadWorldStatus(pcts, this.world.name);
      this.cb.onNpcDialog?.(Lang.npcName(20) ?? '树妖', text,
        this.npcDialogButtons(this.dialogNpc!), portraitUrl(this.dialogNpc!.vanillaId));
      if (pure) {
        this.achievements.handleSpecialEvent(27,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
      }
      return;
    }
  }

  // ================= 渔夫任务链（Main.anglerQuest* + Player.GetAnglerReward）=================

  /** 当日任务鱼 id（Main.anglerQuestItemNetIDs[Main.anglerQuest]，Main.cs:20091 同式） */
  anglerQuestItemId(): number { return ANGLER_QUEST_ITEMS[this.world.anglerQuest] ?? 0; }

  /** Main.AnglerQuestSwap（Main.cs:3799-3947）：清今日交付名单/完成旗 + 按世界门重掷。
   *  调用点 = 黎明（UpdateTime_StartDay :64852）+ 新世界（WorldGen.cs:22655）。
   *  掷骰注入按「种子 ^ 天数」播种的独立 UnifiedRandom → 同种子同天数同任务鱼
   *  （读档/联机一致；原版掷 Main.rand 不可复现，拒绝语义逐条不变） */
  anglerQuestSwap(): void {
    const w = this.world;
    const f = w.flags;
    w.anglerWhoFinishedToday = [];          // :3805
    w.anglerQuestFinished = false;          // :3806
    // :3807 flag = downedBoss1||downedBoss2||downedBoss3||hardMode||downedSlimeKing||downedQueenBee
    const anyBoss = !!(f['downed_4'] || f.downedEyeOfCthulhu          // downedBoss1（EoC）
      || f['downed_13'] || f['downed_266']                            // downedBoss2（世吞/克脑）
      || f.downedSkeletron || f['downed_35']                          // downedBoss3（骷髅王）
      || f.hardMode
      || f.downedSlimeKing || f['downed_50']                          // downedSlimeKing
      || f['downed_222']);                                            // downedQueenBee
    w.anglerQuest = rollAnglerQuest({
      hardMode: !!f.hardMode,
      evil: w.crimson ? 'crimson' : 'corrupt',
      anyBoss,
      hasWorldSurface: w.groundLevel > 50,  // Main.isThereAWorldSurface（Main.cs:2861）
    }, seededRng((w.seed ^ Math.imul(w.clock.dayCount, 0x9E3779B1)) | 0));
  }

  /** 「任务」按钮（NPCInteractions.AnglerQuest.Interact → Main.NPCChatText_DoAnglerQuest
   *  Main.cs:39654-39690）1:1：交付门 → 扣鱼 → 计数++ → 四段奖励 → 台词替换 */
  anglerQuestTurnIn(): void {
    const w = this.world;
    const p = this.player;
    const npc = this.dialogNpc;
    if (!npc) return;
    let done = false;
    // :39659 门：今日任务未交 且 本玩家今日未交（多人各限一次）
    if (!w.anglerQuestFinished && !w.anglerWhoFinishedToday.includes(this.playerName())) {
      const questId = this.anglerQuestItemId();
      const internal = VI_ID(questId);
      const slot = p.inv.slots.findIndex((s) => s && s.id === internal && s.stack > 0);  // FindItem :39661
      if (slot >= 0) {
        p.inv.removeAt(slot, 1);            // :39664-39668（stack 归零即清槽）
        done = true;
        p.anglerQuestsFinished++;           // :39671
        this.grantAnglerRewards(npc, questId);   // GetAnglerReward :39672
      }
    }
    // 台词（Lang.AnglerQuestChat Lang.cs:430-443）：成功 → TurnIn 池；今日已交/未带鱼 →
    // NoQuest 池；否则 Quest_<物品内名>（item 内名 = vi_<id>_<Name> 键尾段）
    let chat: string;
    if (done) {
      chat = Lang.specialText('AnglerQuestText.TurnIn_') ?? Lang.text('Mods.SandboxWorld.NPC.AnglerTurnIn');
      w.anglerQuestFinished = true;         // :39678
      w.anglerWhoFinishedToday.push(this.playerName());   // :39685（单人即本地名）
    } else if (w.anglerQuestFinished) {
      chat = Lang.specialText('AnglerQuestText.NoQuest_') ?? Lang.text('Mods.SandboxWorld.NPC.AnglerNoQuest');
    } else {
      const key = VANILLA_ITEM_KEY_BY_ID[this.anglerQuestItemId()] ?? '';
      const internal = key.split('_')[2] ?? '';
      chat = Lang.text(`AnglerQuestText.Quest_${internal}`)
        || Lang.text('Mods.SandboxWorld.NPC.AnglerNoQuest');
    }
    this.sfx.play('menuTick');
    this.refreshNpcDialog(npc, chat);
    this.cb.onInventoryChanged?.();
  }

  /** Player.GetAnglerReward（Player.cs:55351-55361）四段奖励落物：主奖励/装饰/金币/鱼饵
   *  全部经 rollAnglerRewards 纯函数结算（数值逐条行号见 data/vanillaFishing.ts），
   *  在渔夫脚旁生成（QuickSpawnItem → 本仓 spawnDrop） */
  private grantAnglerRewards(npc: TownNPC, questItemType: number): void {
    const p = this.player;
    // DropAnglerAccByMissing 的持有集（Player.cs:55647-55685：inventory+armor+bank×4+loadouts）
    const owned = new Set<number>();
    const collect = (it: { id: number; stack: number } | null) => {
      const key = it ? ITEM_DEFS[it.id]?.key : undefined;
      const m = key ? /^vi_(\d+)_/.exec(key) : null;
      if (m) owned.add(+m[1]);
    };
    p.inv.slots.forEach(collect);
    p.inv.armor?.forEach(collect);
    p.banks?.forEach((b) => b?.forEach(collect));
    p.inv.loadouts?.forEach((l) => { l?.armor.forEach(collect); });
    for (const g of rollAnglerRewards({
      questsDone: p.anglerQuestsFinished,
      questItemType,
      hardMode: !!this.world.flags.hardMode,
      ownedTypes: owned,
    })) {
      const key = VI(g.id);
      if (key) this.spawnDrop(npc.cx, npc.cy - 8, key, g.stack, 0, -2);
    }
  }

  /** 城镇 NPC 社交表情（原版 ai[0]=7/19 相邻互发 EmoteBubble 的简化切片，NPC.cs:69936）：
   *  白天、空闲、地面上的 NPC 与 6 格内另一 NPC 配对，低频随机互发表情 */
  private emoteCooldown = 0;

  /** NPC.dontCountMe 全表(雷达行不计入):1456 SetDefaults 仅 10 处赋 true——
   *  type 8/9/11/12/14/15/40/41/88/89(NPC.cs:8740/8769/8815/8833/8872/8892/9191/9209/9905/9923) */
  private static readonly NPC_DONT_COUNT_ME = new Set([8, 9, 11, 12, 14, 15, 40, 41, 88, 89]);

  /** PlayerFishingConditions(Player.cs:41528-41556)1:1 切片——渔情行无浮标时的
   *  FinalFishingLevel 现算:GetBestFishingPole(手持竿优先,否则全包最高)/GetBait
   *  (弹药位 54-57 先于主包 0-49,取先见者);松露虫饵提前返回 level=0;
   *  level = ⌊(饵+竿+skill+Tipsy5+漂浮5) × 乘区⌋(坐姿 +5 未跟踪) */
  playerFishingConditions(): { polePower: number; poleType: number; baitPower: number; baitType: number; level: number } {
    const p = this.player;
    const slots = p.inv.slots;
    const fn = (id: number) => {
      const m = /^vi_(\d+)_/.exec(ITEM_DEFS[id].key);
      return m ? itemFuncOfVid(+m[1]) : null;
    };
    // Fishing_GetBestFishingPole(:41634-41651):手持非 0 即用,否则扫全包取最高
    const sel = slots[p.inv.selected];
    let polePower = 0, poleType = 0;
    if (sel) { polePower = fn(sel.id)?.fishingPole ?? 0; poleType = polePower > 0 ? +(/^vi_(\d+)_/.exec(ITEM_DEFS[sel.id].key)?.[1] ?? 0) : 0; }
    if (polePower === 0) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s) continue;
        const pp = fn(s.id)?.fishingPole ?? 0;
        if (pp > polePower) {
          polePower = pp;
          poleType = +(/^vi_(\d+)_/.exec(ITEM_DEFS[s.id].key)?.[1] ?? 0);
        }
      }
    }
    // Fishing_GetBait(:41606-41632):弹药 54-57 先扫,再主包 0-49,均取先见者
    let baitPower = 0, baitType = 0;
    const scanBait = (from: number, to: number) => {
      for (let i = from; i < to && i < slots.length; i++) {
        const s = slots[i];
        if (!s || s.stack <= 0) continue;
        const b = fn(s.id)?.bait ?? 0;
        if (b > 0) { baitPower = b; baitType = +(/^vi_(\d+)_/.exec(ITEM_DEFS[s.id].key)?.[1] ?? 0); break; }
      }
    };
    scanBait(54, 58);
    if (baitPower === 0 && baitType === 0) scanBait(0, 50);
    if (baitType === 2673) return { polePower, poleType, baitPower, baitType, level: 0 };
    if (baitPower === 0 || polePower === 0) return { polePower, poleType, baitPower, baitType, level: 0 };
    const w = this.world;
    const t = w.clock.timeOfDay;
    const isDay = w.clock.isDay;
    let bonus = 0;
    if (p.buffs.has(BuffType.Tipsy)) bonus += 5;     // :41542-41545
    if (p.equipStats.waterWalk) bonus += 5;          // canFloatInWater&&wet(:41546;近似取 waterWalk 资格)
    const base = baitPower + polePower + p.equipStats.fishingSkill
      + (p.buffs.has(BuffType.Fishing) ? 15 : 0) + bonus;
    const level = Math.floor(base * fishingPowerMultiplier({
      raining: !!w.weather?.raining,
      cloudBGAlpha: w.weather?.cloudBGAlpha ?? 0,
      dayTime: isDay,
      time: isDay ? ((t - 0.25) / 0.5) * 54000 : ((((t - 0.75) + 1) % 1) / 0.5) * 32400,
      moonPhase: w.clock.moonPhase,
      bloodMoon: !!w.clock.bloodMoon,
    }));
    return { polePower, poleType, baitPower, baitType, level };
  }

  /** 信息显示列数据组装(DrawInfoAccs 的运行时侧):节流计数 + InfoAccCtx 注入。
   *  渔情(:46296-46316):浮标在场 → displayedFishingInfo 粘性缓存只读;
   *  无浮标 → playerFishingConditions 现算刷缓存(松露虫 → 警告文本不刷)。 */
  private tickInfoAccs(): void {
    const p = this.player;
    const gates = p.equipStats.infoAccs;
    const w = this.world;
    const r = this.renderer;
    const clock = w.clock;
    // 渔情(Main.cs:46296-46316):浮标在场(含飞行中)→ 只显示粘性缓存不更新;
    // 无浮标 → 现算 FinalFishingLevel 并刷缓存;松露虫饵 → FishingWarning 不刷缓存
    let fishingText: string | null = null;
    if (gates.accFishFinder) {
      const bobber = this.entities.projectiles.find((e) => e instanceof Bobber && !e.dead) as Bobber | undefined;
      if (bobber) {
        fishingText = p.displayedFishingInfo || null;
      } else {
        const cond = this.playerFishingConditions();
        if (cond.baitType === 2673) {
          fishingText = Lang.text('GameUI.FishingWarning');
        } else {
          p.displayedFishingInfo = Lang.text('GameUI.FishingPower', cond.level);
          fishingText = p.displayedFishingInfo || null;
        }
      }
    } else {
      p.displayedFishingInfo = '';
    }
    // 金属探测器(SceneMetrics.bestOre;渲染器持有 scene)
    const scene = r.scene;
    let oreText: string | null = null;
    if (scene && scene.bestOreSheet >= 0) {
      oreText = Lang.tileName(scene.bestOreSheet);
    }
    // 击杀数(BannerSystem.BannerToNPC + GetKillCount :46421-46430)
    let killText: string | null = null;
    if (p.lastCreatureHit > 0) {
      const banner = bannerOfNpc(p.lastCreatureHit);
      const kills = banner != null ? (w.bannerKills[banner] ?? 0) : 0;
      killText = `${Lang.npcName(p.lastCreatureHit)}: ${kills}`;
    }
    // ctx
    r.infoAccCtx = {
      gates,
      mainTime: clock.timeOfDay * 86400,
      dayTime: clock.isDay,
      weather: {
        storming: !!w.weather?.shouldUseStormMusic,   // IsItStorming => _shouldUseStormMusic(Main.cs:2978)
        maxRaining: w.weather?.maxRaining ?? 0,
        cloudBGActive: w.weather?.cloudBGActive ?? 0,
        numClouds: w.weather?.numClouds ?? 200,
        windSpeedCurrent: w.weather?.windSpeedCurrent ?? 0,
        sandstorm: !!w.weather?.sandstorm.happening,
        globalTimeSec: performance.now() / 1000,   // GlobalTimeWrappedHourly(:16777)
      },
      moonPhase: clock.moonPhase, bloodMoon: !!clock.bloodMoon, eclipse: !!clock.eclipse,
      fishingText, oreText,
      rareText: p.accCritterGuideText,
      rareVid: p.accCritterGuideVid,
      enemyCount: p.accThirdEyeNumber,
      killText,
      dps: p.getDPS(),
      mph: gates.accStopwatch ? mphOf(r.infoAccs ? r.infoAccs.speedAvg : 0, {
        honey: p.inHoney, shimmer: p.inShimmer, water: p.inWater, merman: p.merman,
        ignoreWater: p.equipStats.waterWalk || p.buffs.has(BuffType.WaterWalking),  // :46484 整块门
        trident: /^vi_277_/.test(p.inv.heldDef()?.key ?? ''),                        // :46494 手持三叉戟
      }) : NaN,
      centerX: p.cx, bottomY: p.y + p.h,
      worldSurface: w.groundLevel, rockLevel: w.rockLevel,
      maxTilesX: w.store.w, maxTilesY: w.store.h,
    };
    // 层 tick(节流计数 + speedSlice 推进);雷达谓词=原版四门
    // (active/!friendly/damage>0/lifeMax>5/!dontCountMe :46401;dontCountMe 全表
    // 仅 10 id:NPC.cs SetDefaults type 8/9/11/12/14/15/40/41/88/89)
    r.infoAccs.tick(p, this.entities.enemies as never, this.entities.critters as never,
      p.cx, p.cy,
      (e) => {
        const en = e as unknown as { vanillaId: number | null; def?: { damage?: number; lifeMax?: number } };
        return (en.def?.damage ?? 0) > 0 && (en.def?.lifeMax ?? 0) > 5
          && !Game.NPC_DONT_COUNT_ME.has(en.vanillaId ?? -1);
      },
      (vid) => npcRarityOf(vid as number | null),
      (vid) => vid != null ? Lang.npcName(vid as number) : null,
      (vx, vy) => Math.hypot(vx, vy),
      { accThirdEye: gates.accThirdEye, accCritterGuide: gates.accCritterGuide, accStopwatch: gates.accStopwatch },
    );
    // ResetEffects(Player.cs:12623-12626):卸下雷达 → accThirdEyeCounter 归零,
    // 重装备时立即重扫(CritterGuide 无此重置——保持原版不对称)
    if (!gates.accThirdEye) p.accThirdEyeCounter = 0;
    // 悬停行;背包内点图标切换 hideInfo(Main.cs:46547-46573:Sound 12 + 翻转;
    // num==8 已在 buildInfoAccRows 归并 7)
    r.infoAccHover = r.infoAccs.hitTest(this.input.mouseX, this.input.mouseY);
    const hovering = r.infoAccHover >= 0 && r.infoAccs.state.inventoryOpen;
    if (hovering) {
      // 吞挖掘/放置点击(与 timeUiHover 同语义)
      this.renderer.timeUiHover = true;
      if (this.input.mouseDown && !this._infoAccClickLatch) {
        const row = r.infoAccs.state.rows[r.infoAccHover];
        if (row) {
          p.hideInfo[row.hideIndex] = !p.hideInfo[row.hideIndex];
          this.sfx.play('menuTick', 1);
        }
        this._infoAccClickLatch = true;
      }
      if (!this.input.mouseDown) this._infoAccClickLatch = false;
    } else {
      this._infoAccClickLatch = false;
    }
  }

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
      // 空闲随机冒泡(原版散落情境 NewBubble 的可见子集;emote 均匀 0..120,
      // 240t)——单 NPC 也冒泡,喂同一 EmoteBubble 模块(TownNPC 内联版已退役)
      if (npcs.length >= 1 && Math.random() < 0.5) {
        const n = npcs[Math.floor(Math.random() * npcs.length)];
        spawnEmote(n, Math.floor(Math.random() * 121), 240);
      }
    }
  }

  closeNpcDialog(): void {
    if (this.dialogNpc) this.dialogNpc.talking = false;
    this.dialogNpc = null;
    this.dialogHappiness = null;   // currentShoppingSettings = NotInShop（Player.cs:4189）
    this.npcShopClose();           // 店面板随对话关闭（Main.npcShop=-1 + 回购记清）
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
    // 油漆师基础 12 色（Chest.cs:2424-2428 `for (int j = 1073; j <= 1084; j++)` 循环上架——
    // extract-shops.mjs 不展开 for 循环，vanilla-shopstock.json 缺 1073-1084，
    // 与 4702/moonPhase 同类提取缺口，此处按原版循环直补；价格 25 = Item.value（Item.cs:13374））
    if (npc.vanillaId === 227) {
      for (let j = 1073; j <= 1084; j++) out.push([j, 25] as [number, number]);
    }
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
        case 20: { // 树妖月相轮换货（Chest.cs:1650-1697；NPCInteractions.cs:491
          // `Shop(20, 3)` 槽位 3=树妖(20)——提取器把相位 switch 摊平成 hardMode/
          // !hardMode 条目，先清 out 里的 4430-4441 再按相位补；
          // 逐相实表提纯到 townNpcProfiles.dryadMoonPhaseStock）
          for (let i = out.length - 1; i >= 0; i--) {
            if (out[i][0] >= 4430 && out[i][0] <= 4441) out.splice(i, 1);
          }
          add(dryadMoonPhaseStock(phase, !!this.world.flags.hardMode));
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
        case 588: // 高尔夫球手（Chest.cs:3135-3245 case 22 分数门槛 + 月相画）——
          // 门槛表提纯到 world/golf/golferShop.ts（含 >500/>1000/>2000/>=1000/>=2000 五档）
          add(golferShopScoreGates(this.player.golferScoreAccumulated, phase,
            !!(this.world.flags['downed_35'] || this.world.flags.downedSkeletron)));
          break;
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
    // 顶层 OR（extract-shops.mjs 2026-08-13 OR 感知产出,如军火商银子弹
    // `downedBoss2&&night||hardMode`）:任一支成立即上架（|| 优先级低于 &&）
    if (cond.includes('||')) return cond.split('||').some((c) => this.shopCondOk(c));
    // 复合门（extract-shops.mjs parseGate：嵌套 if 的全部开门按 '&&' 连接，
    // 如 `hardMode && ZoneGraveyard`——外层与内层同时成立才上架）
    if (cond.includes('&&')) return cond.split('&&').every((c) => this.shopCondOk(c));
    // 取反 token（extract-shops.mjs else-if 互斥链生成，如 '!zoneGraveyard&&day'
    // = 非墓地白天）：Chest.SetupShop 的 else-if 分支只在全部前支不成立时执行。
    // 未知 token 取反同样 false（无法证明成立 → 保守不上架，与正向 default 同策略）
    if (cond.startsWith('!')) return !this.shopCondOk(cond.slice(1));
    const f = this.world.flags;
    switch (cond) {
      case 'hardMode': return !!f.hardMode;
      case 'downedBoss1': return !!(f['downed_4'] || f.downedEyeOfCthulhu);
      case 'downedBoss2': return !!(f['downed_13'] || f['downed_266']);
      case 'downedBoss3': return !!(f['downed_35'] || f.downedSkeletron);
      case 'downedMechBossAny':
        return !!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']);
      // 单机械王（造型师 1985 染发剂 = hardMode && 三机械全灭 等,Chest.cs:2737）。
      // vanilla 语义(NPC.cs:80256-80277)：mech1=毁灭者 134 / mech2=双子 125(126 旧档
      // 兼容读) / mech3=Prime 127——曾 125/126/127 顺位错指三家
      case 'downedMechBoss1': return !!f['downed_134'];
      case 'downedMechBoss2': return !!(f['downed_125'] || f['downed_126']);
      case 'downedMechBoss3': return !!f['downed_127'];
      // NPC.downedPlantBoss（世纪之花商店门：爆破专家地雷 937 / 松露自动锤 1551 /
      // 巫医 Tiki 套·灵液瓶·叶翼 / 画家回声涂层 5344 / 动物学家泥芽 4701）
      case 'downedPlantBoss': return !!f['downed_262'];
      case 'downedPirates': return !!f.downedPirates;
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
      // 动物学家图鉴门（Chest.cs:3265-3280：狗狗许可证 4830 ≥25% / 兔兔许可证
      // 4910 ≥45%；猫咪许可证 4829 无门）——提取器未捕获，shopstock 手工补条
      case 'bestiary25': return this.world.bestiary.completion().percent >= 0.25;
      case 'bestiary45': return this.world.bestiary.completion().percent >= 0.45;
      default: return false;
    }
  }

  // ---- LanternNight 上下文（LanternNight.cs 静态字段读取点 → 本仓世界态映射）----

  /** LanternCtx：LanternsCanStart/Persist 的五门 + BossIsActive（:59-79） */
  private lanternCtx() {
    const w = this.world;
    return {
      dayTime: !!w.clock.isDay,   // Main.dayTime（LanternsCanPersist :52 白天恒 false）
      bloodMoon: !!w.clock.bloodMoon,
      pumpkinMoon: w.moonEvent.kind === MOON_KIND_PUMPKIN,
      snowMoon: w.moonEvent.kind === MOON_KIND_FROST,
      invasionType: w.invasionType,
      moonLordCountdown: w.lunarEvent.moonLordCountdown,
      spawnMeteor: this.meteorPending,
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

  /** CultistRitual 宿主上下文（RuntimeEvents.CultistHost）——437 自然重生链 */
  private cultistCtx(): CultistHost {
    const w = this.world;
    return {
      world: w,
      dungeonX: w.dungeonX,
      dungeonY: w.dungeonY,
      hardMode: !!w.flags.hardMode,
      downedGolem: !!w.flags['downed_245'],                 // NPC.downedGolemBoss
      downedBoss3: !!(w.flags.downedSkeletron || w.flags['downed_35']),
      anyTablet: () => this.entities.enemies.some((n) => {
        const en = n as Enemy;
        return !en.dead && en.vanillaId === 437;
      }),
      // NPC.AnyDanger（NPC.cs:81040+）：月总倒计时/入侵/月事件/旧军/活跃 Boss。
      // DangerThatPreventsOtherDangers 小集合未跟踪（近似面，登记 RuntimeEvents.ts）
      // AnyDanger（NPC.cs:81040-81084）：月总倒计时/入侵/月事件/旧军/boss 外，
      // 还认 DangerThatPreventsOtherDangers（NPCID.cs:4869）={四天界柱 517/422/
      // 507/493, 月总核心 399, 世吞体 13/14/15}——天启四柱阶段/lunarEvent 未开
      // 倒计时时该集合是唯一危险源（此前缺它→石碑 recheck 只有 600 而非 ×6）
      anyDanger: () => w.lunarEvent.moonLordCountdown > 0 || w.invasionType > 0
        || w.moonEvent.kind !== 0 || w.oldOnesArmy.ongoing
        || this.entities.enemies.some((n) => {
          const en = n as Enemy;
          if (en.dead) return false;
          if (en.def.boss) return true;
          const vid = en.vanillaId ?? -1;
          return vid === 517 || vid === 422 || vid === 507 || vid === 493
            || vid === 399 || vid === 13 || vid === 14 || vid === 15;
        }),
      // WorldGen.PlayerLOS 近似（WorldEvolution.playerLOS 同款：50 格内视为可见）
      // WorldGen.PlayerLOS（:69500-69515）真义 = 点 16×16 矩形 ∩ 以玩家为中心
      // sWidth*1.2 × sHeight*1.2 屏幕矩形（非视线）——曾 ±50×±40 格硬编码盒，
      // 宽屏少挡/小窗多挡，现按相机视口 ×1.2 精确对齐
      playerLOS: (x, y) => {
        const p = this.player;
        if (p.dead) return false;
        const hx = this.camera.viewW / (this.camera.zoom || 1) * 0.6 + 8;
        const hy = this.camera.viewH / (this.camera.zoom || 1) * 0.6 + 8;
        return Math.abs(x * TILE + TILE / 2 - p.cx) < hx
          && Math.abs(y * TILE + TILE / 2 - p.cy) < hy;
      },
      // NPC.NewNPC(new EntitySource_WorldEvent(), x, y, 437)——底部锚点已由
      // RuntimeEvents 换算（(y-4)*16-8），此处只落位
      spawnTablet: (x, y) => {
        const e = Enemy.fromVanilla(437, x, y);
        if (!e) return false;
        this.entities.add(e, 'enemies');   // add 内自派 id（手写 nextId++ 是双派死码）
        return true;
      },
    };
  }

  /** MysticLogFairiesEvent 宿主上下文（RuntimeEvents.FairyHost）——倒木夜放仙女 */
  private fairyCtx(): FairyHost {
    const w = this.world;
    return {
      world: w,
      maxRaining: w.weather.maxRaining,   // Main.maxRaining（不雨时为 0，:123 初值）
      bloodMoon: !!w.clock.bloodMoon,
      moonLordCountdown: w.lunarEvent.moonLordCountdown,
      snowMoon: w.moonEvent.kind === MOON_KIND_FROST,
      pumpkinMoon: w.moonEvent.kind === MOON_KIND_PUMPKIN,
      invasionType: w.invasionType,
      // WorldGen.PlayerLOS（:69500-69515）真义 = 点 16×16 矩形 ∩ 以玩家为中心
      // sWidth*1.2 × sHeight*1.2 屏幕矩形（非视线）——曾 ±50×±40 格硬编码盒，
      // 宽屏少挡/小窗多挡，现按相机视口 ×1.2 精确对齐
      playerLOS: (x, y) => {
        const p = this.player;
        if (p.dead) return false;
        const hx = this.camera.viewW / (this.camera.zoom || 1) * 0.6 + 8;
        const hy = this.camera.viewH / (this.camera.zoom || 1) * 0.6 + 8;
        return Math.abs(x * TILE + TILE / 2 - p.cx) < hx
          && Math.abs(y * TILE + TILE / 2 - p.cy) < hy;
      },
      spawnFairy: (id, x, y) => {
        const e = Enemy.fromVanilla(id, x, y);
        if (!e) return;
        this.entities.add(e, 'critters');   // 仙女族（583-585）= 小动物桶，不计怪上限；add 内自派 id
      },
    };
  }

  private openNpcShop() {
    const npc = this.dialogNpc;
    if (!npc) return;
    // 快乐度价格乘子：Player.SetTalkNPC（Player.cs:4189-4193）在开对话时快照
    // currentShoppingSettings，开店/购买/心情报告共用同一份——本仓 openNpcDialog 缓存
    let mul = this.dialogHappiness?.priceMul ?? 1;
    // 骷髅商(453)月相定价（ShopHelper.cs:64-88 GetSkeletonMerchantPrices 逐分支抄，
    // 系数在 townNpcProfiles.skeletonMerchantMoonPriceMul）：相0=1.0 → 1/7=1.1 →
    // 2/6=1.2 → 3/5=1.3 → 相4=1.4（新月最贵），白天再 +0.1。
    // ★1456 考古：该方法在 1.4.5.6 全源零调用点——ProcessMood（ShopHelper.cs:107）
    // 对 npc.type==453 提前 return，PriceAdjustment 恒 1f；按任务要求复现该表，
    // 回退 1456 死码语义删下面一行即可。
    if (npc.vanillaId === 453) {
      mul = skeletonMerchantMoonPriceMul(this.world.clock.moonPhase, this.world.clock.isDay);
    }
    this.shopHappinessMul = mul;
    this.npcShopOpen = true;    // Main.npcShop = npc 槽位（开店门，ItemSlot.cs:187）
    // 显示价 = GetItemExpectedPrice 的 calcForBuying（商店条目悬停 tooltip 同链：
    // Main.cs:20307-20309 context 15 → HoverItem.buy → num=calcForBuying）——
    // Player.cs:34916-34935 逐行：折扣 (int)(×0.8f) 截断（:34921）→ ×PriceAdjustment
    // Math.Round 银行家舍入（:34935）；显示侧再 min-1（Main.cs:20341-20343 num6<1→1）
    const entries: Array<{ key: string; vanillaId: number; name: string; price: number; buyback?: number }> =
      this.shopStockFor(npc).map(([vid, price]) => ({
      key: VANILLA_ITEM_KEY_BY_ID[vid] ?? '',
      vanillaId: vid,
      name: Lang.itemName(vid) ?? VANILLA_ITEM_KEY_BY_ID[vid] ?? String(vid),
      price: Math.max(1, expectedPrices(price, {
        priceAdjustment: mul,
        discountAvailable: this.player.equipStats.discount,
      }).buying),
    }));
    // 卖回货架条目（Chest.AddItemToShop Chest.cs:658-663 克隆 buyOnce）追加在常规
    // 货之后（原版落 item[0-39] 首空位）。买回价 = buyOnce 分支（Player.cs:34930
    // round(value/pa) → :34940 ÷5 → :34941-34944 min1；折扣不参与——:34920 的
    // discount 门要求 !buyOnce）。value 含词缀缩放（Item.cs:596-597）
    for (let i = 0; i < this.shopBuybackStock.length; i++) {
      const bb = this.shopBuybackStock[i];
      const nm = (bb.prefix ? Game.prefixNameOf(bb.prefix) : '')
        + (Lang.itemName(bb.vid) ?? String(bb.vid));
      entries.push({
        key: VANILLA_ITEM_KEY_BY_ID[bb.vid] ?? '',
        vanillaId: bb.vid,
        name: bb.stack > 1 ? `${nm} ×${bb.stack}` : nm,
        price: Math.max(1, expectedPrices(itemValueWithPrefix(bb.vid, bb.prefix),
          { buyOnce: true, priceAdjustment: mul }).buying),
        buyback: i,
      });
    }
    // 第 4 参 = 快乐度价格百分比（Main.cs:41231-41243 商店标题旁表情/价格显示）
    this.cb.onNpcShop?.(Lang.inter(28), entries, this.coinsOwned(), mul);
  }

  /** ShopHelper.ProcessMood 输入装配（:99-180——同屋/村扫描 + zone 快照 + 危险群系） */
  private computeShopHappiness(npc: TownNPC) {
    const w = this.world;
    const home = npc.home;
    const cx = Math.floor(npc.cx / TILE), cy = Math.floor(npc.cy / TILE);
    // 同屋（<25）/村（25-120）计数 + 同屋目标列表（:295-332：以 home 为锚；
    // 过滤不可计价 NPC 37 老人/368 旅行商/453 骷髅商 :312）
    let inHouse = 0, inVillage = 0;
    const nearby: number[] = [];
    for (const n of this.entities.npcs) {
      const tn = n as TownNPC;
      if (!(tn instanceof TownNPC) || tn === npc || tn.dead) continue;
      if (tn.vanillaId === 37 || tn.vanillaId === 368 || tn.vanillaId === 453) continue;
      const anchor = home ?? { x: cx, y: cy };
      const tnAnchor = tn.home ?? { x: Math.floor(tn.cx / TILE), y: Math.floor(tn.cy / TILE) };
      const d = Math.hypot(tnAnchor.x - anchor.x, tnAnchor.y - anchor.y);
      if (d < 25) { inHouse++; nearby.push(tn.vanillaId); }
      else if (d < 120) inVillage++;
    }
    const sc = this.scene;
    const zones: BiomeZones = {
      // ShoppingZone_Forest（Player.cs:3660-3683）= !AnyBiome && !BelowSurface——
      // ★泥土层也算 BelowSurface（曾漏 zoneDirtLayerHeight：地下泥土层被误判森林）
      forest: !!(sc && !sc.zoneCorrupt && !sc.zoneCrimson && !sc.zoneHallow && !sc.zoneSnow
        && !sc.zoneJungle && !sc.zoneDesert && !sc.zoneGlowshroom && !sc.zoneBeach
        && !sc.zoneDungeon && !sc.zoneDirtLayerHeight && !sc.zoneRockLayerHeight),
      ocean: !!sc?.zoneBeach, snow: !!sc?.zoneSnow, desert: !!sc?.zoneDesert,
      jungle: !!sc?.zoneJungle, underground: !!sc?.zoneDirtLayerHeight || !!sc?.zoneRockLayerHeight,
      hallow: !!sc?.zoneHallow, mushroom: !!sc?.zoneGlowshroom,
    };
    return computeHappiness({
      npcVanillaId: npc.vanillaId,
      homeless: !home,
      distFromHome: home ? Math.hypot(cx - home.x, cy - home.y) : 0,
      playerInCorrupt: !!sc?.zoneCorrupt, playerInCrimson: !!sc?.zoneCrimson, playerInDungeon: !!sc?.zoneDungeon,
      zones,
      npcsInHouse: inHouse, npcsInVillage: inVillage,
      nearby, isPrincess: npc.vanillaId === 663,
      rand: Math.random,
    });
  }

  /** 当前对话 NPC 的快乐度价格乘子（ShopHelper.GetShoppingSettings——缓存到开店时） */
  private shopHappinessMul = 1;

  /** 商店面板是否打开（Main.npcShop > 0 的等价门；ItemSlot.GetSellOrTrash :187 用它
   *  分流 Sell/垃圾桶）。开店置位、面板/对话关闭清零（见 npcShopClose） */
  npcShopOpen = false;

  /** 店内回购记（Main.shopSellbackHelper，ItemShopSellbackHelper.cs:10-64）：
   *  key = `${vid}:${prefix}`（ItemMemo.type+prefix :10-29），value = 本次开店会话
   *  内从该店购入数量。买时记（ItemSlot.cs:1919-1922）→ 卖时按买价原额退
   *  （Player.cs:34739-34743）→ 换店/关店清（Main.cs:18056-18064 UpdateOldNPCShop） */
  private shopSellbackMemo = new Map<string, number>();

  /** 卖回 buyOnce 货架（Chest.AddItemToShop Chest.cs:651-670 的会话投影）：卖出/
   *  白送物品克隆进商店 item[0-39] 首空位（buyOnce=true、stack-=回购记覆盖量；记全
   *  覆盖则不上架 :653-656）。开店会话态——买/卖刷新不重跑（原版仅 Main.OpenShop
   *  Main.cs:39895-39903 点击商店按钮才 SetupShop 重建货架），关店清（npcShopClose）。
   *  上限 39 条（:654 首空位扫 0-38，末格不收） */
  private shopBuybackStock: Array<{ vid: number; prefix: number; stack: number }> = [];

  /** 对话 NPC 的快乐度快照（Player.currentShoppingSettings，SetTalkNPC 时计算；
   *  价格乘子 + 心情报告行，商店/购买/心情浮层共用） */
  private dialogHappiness: { priceMul: number; report: HappinessReportLine[] } | null = null;

  /** 心情报告行 → l10n 文案（ShopHelper.AddHappinessReportText :194-203 的渲染侧）：
   *  {BiomeName} ← TownNPCMoodBiomes.<nameKey>，{NPCName} ← NPC.GetFullnameByID（Lang.npcName） */
  private happinessLineText(l: HappinessReportLine): string {
    let s = Lang.text(l.key);
    if (l.biomeNameKey !== undefined) {
      s = s.replace('{BiomeName}', Lang.text(`TownNPCMoodBiomes.${l.biomeNameKey}`));
    }
    if (l.npcId !== undefined) {
      s = s.replace('{NPCName}', Lang.npcName(l.npcId) ?? '');
    }
    return s;
  }

  /** 「快乐度」按钮（ReportHappiness.Interact，NPCInteractions.cs:289-313）：
   *  打开详情浮层——报告逐条 + 价格倍率（原版把 HappinessReport 写进 npcChatText） */
  private openNpcHappinessPanel(): void {
    const npc = this.dialogNpc;
    if (!npc || !this.dialogHappiness || this.dialogHappiness.report.length === 0) return;
    const typeName = Lang.npcName(npc.vanillaId) ?? npc.npcKey;
    const name = npc.givenName ? Lang.text('Game.NPCTitle', npc.givenName, typeName) : typeName;
    this.cb.onNpcHappiness?.({
      name,
      lines: this.dialogHappiness.report.map((l) => this.happinessLineText(l)),
      priceMul: this.dialogHappiness.priceMul,
    });
  }

  /** 商店购买（ItemSlot.HandleShopSlot ItemSlot.cs:1870-1931）：左键买入 =
   *  :1894 GetItemExpectedPrice（买价 calcForBuying）→ :1895 BuyItem（扣币）→
   *  :1910-1923 入光标/背包 + 记回购 → :1925-1928 buyOnce 减库存归零下架。
   *  buybackIndex = 卖回货架条目下标（缺省 = 常规货）；held = 光标持有物
   *  （PickItemMovementAction case 15 ItemSlot.cs:1426-1439：空手→3 买入；同型
   *  CanStack（Item.cs:49446-4954 type+prefix 全等）且未满叠（:1890-1893）→ 3 买入
   *  叠到光标；异型 → result -1 整链无动作）。返回是否成交 */
  npcShopBuy(vanillaId: number, buybackIndex?: number,
    held?: { id: number; stack: number; prefix?: number }): boolean {
    const bb = buybackIndex === undefined ? undefined : this.shopBuybackStock[buybackIndex];
    if (buybackIndex !== undefined && (!bb || bb.vid !== vanillaId)) return false;
    const prefix = bb ? bb.prefix : 0;
    // 光标持有门（:1878 !CanStack 早退 + :1890-1893 满叠停买）
    if (held) {
      const hd = ITEM_DEFS[held.id];
      if (!hd || vanillaIdOfItem(held.id) !== vanillaId) return false;
      if ((held.prefix ?? 0) !== prefix) return false;
      if (held.stack >= (hd.maxStack ?? 1)) return false;
    }
    let price: number;
    if (bb) {
      // buyOnce 买回价（Player.cs:34930 round(value/pa) → :34940 ÷5 → :34941-34944
      // min1；折扣卡不参与——:34919-34921 的 discount 门要求 !buyOnce）；
      // value 含词缀缩放（卖出克隆带的 scaled value，Item.cs:596-597）
      price = expectedPrices(itemValueWithPrefix(bb.vid, bb.prefix),
        { buyOnce: true, priceAdjustment: this.shopHappinessMul }).buying;
    } else {
      const list = this.dialogNpc ? this.shopStockFor(this.dialogNpc) : [];
      const entry = list.find(([id]) => id === vanillaId);
      if (!entry) return false;
      // 常规买价 1:1（Player.GetItemExpectedPrice Player.cs:34916-34935）：
      //   :34921 折扣 (int)(calcForBuying × 0.8f) ——(int) 向零截断，先截后乘
      //   :34935 calcForBuying = (int)Math.Round(× PriceAdjustment) ——银行家舍入
      //   ★无 min-1 钳制：calcForBuying 原值直接进 BuyItem（:34948 CoinsCount <
      //     price 才拒付）；仅显示侧有 min1（Main.cs:20341-20343）
      price = expectedPrices(entry[1], {
        priceAdjustment: this.shopHappinessMul,
        discountAvailable: this.player.equipStats.discount,
      }).buying;
    }
    if (this.coinsOwned() < price || !this.spendCopper(price)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      this.openNpcShop();
      return false;
    }
    const key = VANILLA_ITEM_KEY_BY_ID[vanillaId];
    if (held) held.stack++;   // :1910-1923 买叠到光标（CanStack 门已保证 prefix 全等）
    else if (key && ITEM_BY_KEY[key] !== undefined) {
      this.player.inv.add(ITEM_BY_KEY[key], 1, prefix || undefined);  // :1912-1916 货架词缀随行
    }
    if (bb) {
      // buyOnce 不进回购记（:1919-1922 !buyOnce 门）；减库存归零下架（:1925-1928）
      if (--bb.stack <= 0) this.shopBuybackStock.splice(buybackIndex!, 1);
    } else {
      // 店内回购记（ItemSlot.cs:1919-1922：!buyOnce && shopSpecialCurrency==-1 → Add；
      // 本仓常规商店条目两者恒假/无自定义币种 → 无条件记。prefix 恒 0：货架购买不带词缀）
      const memoKey = `${vanillaId}:0`;
      this.shopSellbackMemo.set(memoKey, (this.shopSellbackMemo.get(memoKey) ?? 0) + 1);
    }
    this.sfx.play('coin');    // :1899-1908 value>0 → 18 Coins（本仓表无 value-0 货）
    this.cb.onInventoryChanged();
    this.openNpcShop();
    return true;
  }

  /** 关闭商店面板（UI 回调；原版 Main.npcShop=-1）。换店/关店清回购记
   *  （Main.UpdateOldNPCShop Main.cs:18056-18064：npcShop != oldNPCShop → Clear）
   *  与 buyOnce 货架（原版重开走 Main.OpenShop → SetupShop 重建货架
   *  Main.cs:39895-39903，卖回条目不跨会话存活） */
  npcShopClose(): void {
    this.npcShopOpen = false;
    this.shopSellbackMemo.clear();
    this.shopBuybackStock = [];
  }

  /** 商店出售（Player.SellItem Player.cs:34716-34878 + ItemSlot.OverrideLeftClick
   *  cursorOverride==10 分支 ItemSlot.cs:780-798）：Shift+左键背包格整叠卖出。
   *  返回是否消费了该次点击——原版该分支恒 return true（:798），卖不掉也不回落
   *  垃圾桶；调用方（UI.shiftClick）据此短路 */
  npcShopSell(slot: number): boolean {
    if (!this.npcShopOpen) return false;          // GetSellOrTrash :187-190 店外走垃圾桶
    const inv = this.player.inv;
    const it = inv.slots[slot];
    if (!it) return true;                          // 空格无动作（IsAir 早退 ItemSlot.cs:535）
    if (it.favorited) return true;                 // 收藏禁 Shift 转移（ItemSlot.cs:566）
    const vid = vanillaIdOfItem(it.id);
    if (vid < 0) return true;
    if (!canSellFromShopUi(vid)) return true;      // 钱币 71-74 → null 不动作（:191-194）
    const memoKey = `${vid}:${it.prefix ?? 0}`;
    const quote = computeSellValue(vid, it.stack, {
      prefix: it.prefix ?? 0,                       // 词缀 value 缩放（Item.cs:596-597）
      priceAdjustment: this.shopHappinessMul,       // currentShoppingSettings.PriceAdjustment
      discountAvailable: this.player.equipStats.discount, // :34917 discountAvailable
      sellbackAmount: this.shopSellbackMemo.get(memoKey) ?? 0, // :34739 GetAmount
    });
    if (!quote.sellable) {
      // SellItem false 且 value==0 → 白送入店（ItemSlot.cs:790-795 AddItemToShop + 音效 7）
      this.addItemToShopShelf(memoKey, vid, it.prefix ?? 0, it.stack);
      inv.slots[slot] = null;                       // item.TurnToAir()（:794）
      this.sfx.play('pickup');                      // SoundID 7 = Grab（:795）
      this.cb.onInventoryChanged();
      if (this.dialogNpc) this.openNpcShop();
      return true;
    }
    const before = this.coinsOwned();
    inv.slots[slot] = null;                         // 先腾格再入币（:787 TurnToAir 在结算后）
    this.gainCopper(quote.copper);                  // :34745-34868 铂/金/银/铜换装
    if (this.coinsOwned() - before !== quote.copper) {
      // 装不下所有币 → 整体回滚（Player.cs:34727-34731 全仓克隆 + :34869-34876 还原；
      // 本仓等价实现 = 撤回已入币 + 复原物品格），物品不动、回购记不动、货架不动
      // （SellItem false 在先 → chest.AddItemToShop 根本不执行，ItemSlot.cs:783 门）
      const gained = this.coinsOwned() - before;
      if (gained > 0) this.spendCopper(gained);
      inv.slots[slot] = it;
      return true;
    }
    this.addItemToShopShelf(memoKey, vid, it.prefix ?? 0, it.stack);  // chest.AddItemToShop（:785）
    this.sfx.play('coin');                          // SoundID 18 = Coins（:788）
    this.cb.onInventoryChanged();
    if (this.dialogNpc) this.openNpcShop();         // 刷新面板余额（同 npcShopBuy）
    return true;
  }

  /** 光标持有物整叠卖出（ItemSlot.LeftClick case 4，ItemSlot.cs:1110-1129）：
   *  触发门 = PickItemMovementAction case 15（:1435-1438）——mouseItem 非空、点中
   *  的商店格为空、type 非钱币 71-74 → result 4。结算：
   *  :1113 SellItem(mouseItem) 成功 → :1115 AddItemToShop + :1116 mouseItem 清空 +
   *  :1117 音效 18；value==0 → :1120-1126 白送入店 + 音效 7。
   *  返回 true = 已售出/白送（调用方清光标）；false = 无动作/币装不下（光标原样） */
  npcShopSellHeld(held: { id: number; stack: number; prefix?: number }): boolean {
    if (!this.npcShopOpen) return false;
    const vid = vanillaIdOfItem(held.id);
    if (vid < 0) return false;
    if (!canSellFromShopUi(vid)) return false;      // 钱币 71-74 → result -1（:1435）
    const prefix = held.prefix ?? 0;
    const memoKey = `${vid}:${prefix}`;
    const quote = computeSellValue(vid, held.stack, {
      prefix,
      priceAdjustment: this.shopHappinessMul,
      discountAvailable: this.player.equipStats.discount,
      sellbackAmount: this.shopSellbackMemo.get(memoKey) ?? 0, // :34739 GetAmount
    });
    if (!quote.sellable) {
      this.addItemToShopShelf(memoKey, vid, prefix, held.stack);  // :1122 白送入店
      this.sfx.play('pickup');                                    // :1124 音效 7
      this.cb.onInventoryChanged();
      if (this.dialogNpc) this.openNpcShop();
      return true;                                                // :1123 mouseItem 清空
    }
    const before = this.coinsOwned();
    this.gainCopper(quote.copper);                  // :34745-34868 铂/金/银/铜换装
    if (this.coinsOwned() - before !== quote.copper) {
      // 装不下 → SellItem false → mouseItem 原样保留（:1113 门，货也不回架）
      const gained = this.coinsOwned() - before;
      if (gained > 0) this.spendCopper(gained);
      return false;
    }
    this.addItemToShopShelf(memoKey, vid, prefix, held.stack);     // :1115 AddItemToShop
    this.sfx.play('coin');                                          // :1117 音效 18
    this.cb.onInventoryChanged();
    if (this.dialogNpc) this.openNpcShop();
    return true;                                                    // :1116 SetDefaults(0)
  }

  /** Chest.AddItemToShop（Chest.cs:651-670）1:1 会话投影：先扣回购记（:652 Remove，
   *  ItemShopSellbackHelper.cs:52-63 实扣 = min(记账, stack)）→ 记账全覆盖不上架
   *  （:653-656）→ 残量克隆进 buyOnce 货架（:658-663 buyOnce=true、favorited=false、
   *  stack-=num；:654 首空位扫 0-38 → 上限 39 条） */
  private addItemToShopShelf(memoKey: string, vid: number, prefix: number, stack: number): void {
    const memoBefore = this.shopSellbackMemo.get(memoKey) ?? 0;
    this.consumeSellbackMemo(memoKey, stack);
    const shelf = buybackShelfStack(stack, memoBefore);
    if (shelf > 0 && this.shopBuybackStock.length < 39) {
      this.shopBuybackStock.push({ vid, prefix, stack: shelf });
    }
  }

  /** 词缀显示名（Lang.GetPrefixedItemName 渲染侧："Prefix.{ConstName} + 物品名"，
   *  与 UI.prefixDisplayName 同式）——卖回货架条目名带词缀 */
  private static prefixNameOf(prefix: number): string {
    const key = PREFIX_NAMES[String(prefix)];
    if (!key) return '';
    const t = Lang.text(`Prefix.${key}`);
    return t && t !== `Prefix.${key}` ? `${t} ` : `${key} `;
  }

  /** ItemShopSellbackHelper.Remove（ItemShopSellbackHelper.cs:45-63）：扣减记账，
   *  余量 <=0 删键 */
  private consumeSellbackMemo(memoKey: string, stack: number): void {
    const left = (this.shopSellbackMemo.get(memoKey) ?? 0) - stack;
    if (left <= 0) this.shopSellbackMemo.delete(memoKey);
    else this.shopSellbackMemo.set(memoKey, left);
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
      // 离场：白天过 48600 或入夜，且玩家离屏后移除（UnspawnTravelNPC）。
      // 48600/54000 = 0.9（昼内进度，Main.cs:64477——曾误按 0.8 = 43200 提前一小时赶人）
      if (!w.clock.isDay || (t - Clock.DAWN) / 0.625 > 0.9) {
        const d = Math.hypot(tm.cx - this.player.cx, tm.cy - this.player.cy);
        if (d > TILE * 62) {
          tm.dead = true;
          this.newText(Lang.text('LegacyMisc.35', Lang.npcName(368) ?? ''), 50, 125, 255);
        }
      }
      return;
    }
    // 到访 roll 门（Main.cs:64483-64484）：!IsFastForwardingTime()（晷快进中不刷）&& 白天上午
    if (w.isFastForwardingTime()) return;
    if (!w.clock.isDay || t >= 0.5) return;                       // 仅上午（Main.time<27000）
    // 概率吃 dayRate（Main.cs:64484-64491）：num6=max(dayRate,1)、num7=(27000/num6)×4，
    // rand.Next(num7)==0 → P = dayRate/108000（旅程倍率/全员睡×5 时到访同倍提速）
    const travelDr = Math.max(1, w.dayRate());
    if (Math.random() >= travelDr / (27000 * 4)) return;
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
    // 首件（Player.cs:55747-55785）：hardMode 时走**显式清单**单次随机
    // （非 GetItem 池 RollLuck——此前误用池+重试环）。世纪之花后 +4 妖火染料
    // （2878/2879/2884/2885）；三机械/火星/月总各加成段同块
    if (this.world.flags.hardMode) {
      const f = this.world.flags;
      const list = [3039, 3038, 3598, 3597, 3600, 3042, 3533, 3561];
      if (!!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134'])) list.push(2883, 2869, 2873, 2870);
      if (f['downed_262']) list.push(2878, 2879, 2884, 2885);
      if (f['downedMartians']) list.push(2864, 3556);
      if (f['downed_398']) list.push(3024);
      stock.push(list[Math.floor(Math.random() * list.length)]);
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

  /** 黎明自然 roll 命中后的静默开入侵（Main.cs:64933/:64944 直呼 StartInvasion：
   *  invasionType≠0 时内部 no-op，无失败 toast——toast 是物品召唤的 canStartInvasion 语义） */
  private announceNaturalInvasion(type: number): boolean {
    const misc = startInvasion(this.world, type);
    if (misc == null || misc < 0) return false;
    this.invasionWarn = 3600;
    this.newText(Lang.misc(misc), 175, 75, 255);
    return true;
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

  /** 实体侧入侵通道（GameHooks.startInvasionWithAnnounce）:火星探测器逃逸触发——
   *  与物品/自然 roll 同入口(逼近公告+invasionWarn);调用方已过 canStartInvasion
   *  门,失败静默 false(回退方自行 startInvasion) */
  startInvasionWithAnnounce(type: number, ignoreDelay = false): boolean {
    return this.startInvasionAndAnnounce(type, ignoreDelay);
  }

  /** PunchCameraModifier 近似（GameHooks.punchCamera）：鹿角怪震屏源——
   *  Camera.addPunch,渲染帧统一衰减(强度向量叠加,同 CameraModifiers 列表) */
  punchCamera(dirX: number, dirY: number, frames = 30, strength = 20): void {
    this.camera.addPunch(dirX, dirY, strength, frames);
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

  /** 铜币入包（按面额拆分含铂金档；spendCopper 的镜像；vi_71-74 单轨） */
  private gainCopper(n: number): void {
    const inv = this.player.inv;
    const plat = Math.floor(n / 1000000);
    const gold = Math.floor((n % 1000000) / 10000);
    const silver = Math.floor((n % 10000) / 100);
    const copper = n % 100;
    if (plat) inv.add(ITEM_BY_KEY[VI_KEY.COIN.PLATINUM], plat);
    if (gold) inv.add(ITEM_BY_KEY[VI_KEY.COIN.GOLD], gold);
    if (silver) inv.add(ITEM_BY_KEY[VI_KEY.COIN.SILVER], silver);
    if (copper) inv.add(ITEM_BY_KEY[VI_KEY.COIN.COPPER], copper);
  }

  /** 护士治疗:费用 = 缺失生命 × 0.75 铜(下限 3);满血拒绝 */
  /** Main.GetNurseHealCost（Main.cs:39463-39511）1:1：(缺血 + 100×可移除 debuff)
   *  × 进度倍率链（石头人200/世花150/三王100/困难60/骷髅王|蜂后25/世吞|克脑10/
   *  EoC 3）× 专家 2 ×（折扣 0.8 未实装——discountAvailable 恒 false，登记） */
  private nurseHealCost(): number {
    const p = this.player;
    const f = this.world.flags;
    let num = p.maxHp - p.hp;
    // 可移除 debuff：buffTime>60 且非 NurseCannotRemoveDebuff 表——本仓 debuff 族
    // 全部可移除（该排除表多为 boss 专属 debuff，未实装，登记）
    num += 100 * p.buffs.debuffCount(60);
    if (f['downed_245']) num *= 200;        // Golem
    else if (f['downed_262']) num *= 150;   // Plantera
    else if (f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']) num *= 100;
    else if (f.hardMode) num *= 60;
    else if (f.downedSkeletron || f['downed_222']) num *= 25;   // Boss3 | QueenBee
    else if (f['downed_13'] || f['downed_14'] || f['downed_15']) num *= 10;  // EoW/BoC
    else if (f['downed_4']) num *= 3;       // EoC
    if (this.world.isExpert) num *= 2;
    return Math.floor(num);
  }

  private nurseHeal() {
    const p = this.player;
    if (p.hp >= p.maxHp && p.buffs.debuffCount(60) === 0) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealthy'));
      return;
    }
    const cost = this.nurseHealCost();
    if (cost <= 0 || this.coinsOwned() < cost || !this.spendCopper(cost)) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NotEnoughCoins'));
      return;
    }
    p.hp = p.maxHp;
    p.buffs.clearDebuffs();   // 护士同时清 debuff（NPCChatText_DoNurseHeal 语义）
    this.sfx.play('drink');
    this.cb.onBuffsChanged?.();
    this.cb.onInventoryChanged();
    this.cb.onToast(Lang.text('Mods.SandboxWorld.NPC.NurseHealed'));
    // 成就：护士付费累计（AchievementsHelper.HandleNurseService → FREQUENT_FLYER
    // 10000 铜；NurseChat 治疗结算点）
    this.achievements.handleNurseService(cost);
  }

  /** 扣铜币:全背包四档币换算清点,整额清空后按面额找零(vanilla BuyItem 语义;vi_71-74 单轨) */
  private spendCopper(n: number): boolean {
    const inv = this.player.inv;
    if (this.coinsOwned() < n) return false;
    const change = this.coinsOwned() - n;
    for (let i = 0; i < inv.slots.length; i++) {
      const sl = inv.slots[i];
      if (sl && coinIndexOf(sl.id) >= 0) inv.slots[i] = null;
    }
    // 按面额回流(铂→金→银→铜,栈内合并)
    const plat = Math.floor(change / 1000000);
    const gold = Math.floor((change % 1000000) / 10000);
    const silver = Math.floor((change % 10000) / 100);
    const copper = change % 100;
    if (plat) inv.add(ITEM_BY_KEY[VI_KEY.COIN.PLATINUM], plat);
    if (gold) inv.add(ITEM_BY_KEY[VI_KEY.COIN.GOLD], gold);
    if (silver) inv.add(ITEM_BY_KEY[VI_KEY.COIN.SILVER], silver);
    if (copper) inv.add(ITEM_BY_KEY[VI_KEY.COIN.COPPER], copper);
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

  /** 城镇 NPC 列表(GameHooks.npcs;受击判定用) */
  npcs() {
    return this.entities.npcs;
  }

  /** 城镇 NPC 自卫弹入投射物桶(GameHooks.spawnTownShot) */
  spawnTownShot(shot: import('../entities/TownShot').TownShot) {
    this.entities.add(shot, 'projectiles');
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

  spawnDrop(x: number, y: number, itemKey: string, count = 1, vx = 0, vy = -2, placeStyle?: number): ItemDrop | null {
    const id = ITEM_BY_KEY[itemKey];
    if (id === undefined) return null;
    const drop = new ItemDrop(x - 6, y - 6, id, count, vx, vy);
    if (placeStyle !== undefined) drop.placeStyle = placeStyle;
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

  /** contactOnly：伤害源是 NPC **接触**（Player.cs:30880-30970 的 Main.npc[i] 循环）——
   *  荆棘反伤/狼人虚弱只在该分支结算；弹幕命中只带 attacker 做死亡归因，不触发反伤 */
  /** 返回实际扣除 HP（0=未受伤——damage() 返回值直通;爆炸/近战 PvP 接收端按此
   *  决定 StatusPlayer debuff 与受击音,对齐原版 Hurt>0 语义 :13979） */
  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: Enemy, contactOnly = false, pvp = false): number {
    const p = this.player;
    if (p.dead) return 0;
    if (attacker) p.lastDamageCause = { kind: 'npc', name: (attacker.vanillaId != null ? Lang.npcName(attacker.vanillaId) : null) ?? attacker.def.name };
    // 旗 buff 接触减伤（Player.cs:30930-30933 GetBannerBuffEffect:经典 ×0.75/专家 ×0.5）
    if (attacker && attacker.vanillaId != null && contactOnly && this.bannerNpcActive(attacker.vanillaId)) {
      dmg = Math.max(1, Math.round(dmg * bannerReceivedMult(mainExpertMode(this.world))));
    }
    // 日曜护盾反击（:37706-37716 ConsumeSolarFlare 后 NewProjectile 608：
    // 150×meleeDamage + kb15 朝攻击者——608 追踪弹未实装,直伤近似,登记）
    const shieldsBefore = p.solarShields;
    const ok = p.damage(dmg, srcX, srcY, true, pvp);
    // 圣骑士盾 25% 转移（Player.cs:37727-37763）：本人装 938 + 有队友（同队 team≠0）
    // 800px 内也装 938 → 该次伤 25% 改由队友承担（死因 teamTank 20）。
    // 本地先全额结算再退还 25%（等价于原版 num2×0.75 前置）；转移额经 msg44 bit5
    // 发给队友、由其本地结算（victim-settles）。门：实扣 ≥4 且非 9999 级直死
    // （ok 现为 damage() 返回的实扣值——含 endurance/日曜/甲虫后,与原版 num2 同口径）
    if (ok >= 4 && dmg < 9999 && p.team !== 0 && this.hasPaladinShield(p) && this.net?.active) {
      const holder = this.remotePlayerProxies.find((pr) => {
        const s = (pr as unknown as { __netSlot?: number }).__netSlot;
        return s !== undefined && pr.team === p.team && !pr.dead
          && Math.hypot(pr.cx - p.cx, pr.cy - p.cy) <= 800
          && this.hasPaladinShield(pr);
      });
      if (holder) {
        const transfer = Math.floor(ok * 0.25);
        if (transfer > 0) {
          p.hp = Math.min(p.maxHp, p.hp + transfer);   // 退还 25%（原版前置 ×0.75 等价）
          this.net.sendStrikePlayer(
            (holder as unknown as { __netSlot: number }).__netSlot,
            transfer, 0, 0, -1, 0x20);
        }
      }
    }
    if (ok && p.solarShields < shieldsBefore && attacker && !attacker.dead) {
      const retaliation = Math.max(1, Math.round(150 * p.damageMult('melee')));
      attacker.hurt(retaliation, Math.sign(attacker.cx - p.cx) * 10, -3, this);
      this.addDamageNumber(attacker.cx, attacker.y, retaliation, false, '#FFC040');
    }
    if (ok) {
      // 狼人(155)命中施加虚弱 33（1800t=30s：近战-5.1%伤/速、防-4、移-10%）
      if (attacker?.vanillaId === 155) p.buffs.apply(BuffType.Weak, 30);
      // 爆裂泡泡 371 接触施加潮湿 103（StatusFromNPC Player.cs:22239-22242：
      // AddBuff(103, 60×Next(3,8)) = 180-420t 即 3-7s——猪鲨仔 MountFishronSpecial
      // 的 dripping 增益 + 火系免疫 24/323/67 两处消费）。★371 走通用接触伤害链
      //（Enemy.fixedUpdate → damagePlayer），此处统一汇入即可覆盖本地/傀儡两路
      if (attacker?.vanillaId === 371) {
        p.buffs.apply(BuffType.Wet, wetFromBubbleContact());
      }
      // 星星斗篷族受击反击（Player.cs:37826-37870）：3 颗星，出点 x=position.X+Next(-400,400)、
      // y=position.Y-Next(500,800)，速度 = 朝(玩家中心 X 再 ±100 抖动)归一化到 23 速；
      // 弹型按装备 override 件取（manaCloak 723 > beeCloak 724 > starVeil 725 > starCloak 726），
      // 伤害 num18=75、大师 ×3（:37861-37863）/ 专家 ×2（:37864-37866）、击退 5；
      // NewProjectile 尾参 ai1=position.Y（:37870 落点线：星落到该 Y 才触发
      // FallingStar 落地判定）——Arrow 无 ai 槽，登记依赖。
      // ★ Main.masterMode/expertMode 经 mainMasterMode/mainExpertMode 求值
      //   （Main.cs:2760/2762 = Difficulty>=Master/Expert；getGoodWorld 抬档同样生效）
      const accVids = accessoryVanillaIds(p);
      const star = starCloakStarInfo(accVids, p.equipStats.starCloak);
      if (star.active) {
        let starDmg = 75;
        if (mainMasterMode(this.world)) starDmg *= 3;
        else if (mainExpertMode(this.world)) starDmg *= 2;
        for (let k = 0; k < 3; k++) {
          const sx = p.x + (Math.floor(Math.random() * 800) - 400);
          const sy = p.y - (500 + Math.floor(Math.random() * 300));
          let n15 = (p.x + p.w / 2) - sx + (Math.floor(Math.random() * 201) - 100);
          let n16 = (p.y + p.h / 2) - sy;
          const n17 = 23 / Math.hypot(n15, n16);
          n15 *= n17; n16 *= n17;
          this.entities.add(new Arrow(sx, sy, n15, n16, starDmg, 5, star.projType, null), 'projectiles');
        }
      }
      // 蜂蜜斗篷/蜂巢族受击反击（Player.cs:37871-37907）：
      //   数量 num19 = 1 + (Next(3)==0) + (Next(3)==0) + (strongBees && Next(3)==0)
      //     （1/2/3/4 只，概率 4/9·4/9·2/9·…，非旧"1-3 均匀"）；
      //   基伤 num20 = strongBees ? 18 : 13（专家 ×1.5/大师 ×2）；
      //   beeType（:12006-12015）strongBees 且 Next(2)==0 → 566（巨蜂），否则 181；
      //   beeDamage（:12017-12025）入参 (int)num20（:37899 截断后）→ 181 +Next(2)、566 +Next(1,4)；
      //   beeKB（:12026-12032）566 → 0.5、181 → 0；出点 = 玩家左上角（position.X/Y）；
      //   初速 = Next(-35,36)*0.02（aiStyle 36 追踪 AI 未建模，以下方瞄敌近似，登记）；
      //   反击后 AddBuff(48 Honey, 300t=5s)（:37906）；原版此处无声效（旧 beeSummon 已删）
      if (p.equipStats.bees) {
        const strong = accVids.includes(3333);
        const roll = beeRetaliateRoll(strong, Math.random);
        const num19 = roll.count;
        // num20 = strongBees ? 18 : 13，再按世界难度缩放（:37884-37891）：
        //   大师 ×2 / 专家 ×1.5（Main.masterMode/expertMode，getGoodWorld 抬档同生效）
        const num20 = mainMasterMode(this.world) ? roll.base * 2
          : mainExpertMode(this.world) ? roll.base * 1.5
            : roll.base;
        for (let k = 0; k < num19; k++) {
          const makeStrong = strong && Math.floor(Math.random() * 2) === 0;
          const beeType = makeStrong ? 566 : 181;
          const beeDmg = makeStrong ? Math.trunc(num20) + 1 + Math.floor(Math.random() * 3)
            : Math.trunc(num20) + Math.floor(Math.random() * 2);
          const beeKb = makeStrong ? 0.5 : 0;
          const tgt = this.entities.enemies.find((e) => {
            const en = e as Enemy;
            return !en.dead && Math.abs(en.cx - p.cx) < 500;
          }) as Enemy | undefined;
          const ang = tgt
            ? Math.atan2(tgt.cy - p.cy, tgt.cx - p.cx)
            : -Math.PI / 2 + (Math.random() - 0.5);
          const spd = 3.4; // aiStyle 36 追踪档出速占位（真值 ±0.7 抖动由追踪 AI 接管）
          this.entities.add(new Arrow(p.x, p.y, Math.cos(ang) * spd, Math.sin(ang) * spd,
            beeDmg, beeKb, beeType, null), 'projectiles');
        }
        p.buffs.apply(BuffType.Honey, 5);
      }
      // 致死一击：不播受击声，只播死亡声（保证最后听到的音效是死亡）
      if (p.hp <= 0) this.sfx.play('pkilled');
      else this.sfx.play('hurt');
      // 实际扣血 = max(1, dmg - defense*0.5)（在 Player.damage 内）
      const dealt = Math.max(1, dmg - p.defense * 0.5);
      this.addDamageNumber(p.cx, p.y, Math.round(dealt), false, '#FF5050');
      // 荆棘 Buff（1.4.5.6 Player.cs:30910-30944，NPC 接触分支内——contactOnly 门：
      // 弹幕命中不反伤）：thorns=1 → 反弹 num4 × thorns，上限 1000。
      // num4 = Main.DamageVar(npc.damage, -luck)（:30934，±15% 浮动）——我们的接触伤害
      // 传的是 def.damage 原值（未浮动），此处补同式 DamageVar 与原版对齐；
      // 击退 = ApplyDamageToNPC(knockback=10, -num3)（:30930/:30944）：纯水平方向
      // （num3=怪在玩家左则 +1，反推 -1）× 10（×0.65 速度系数同武器击退链），不上抛
      // 反伤两段（Player.cs:30940-30958 两个【独立 if】,海龟+仙人掌可叠加）:
      //  ① thorns 链:反=实际受伤×num2(荆棘药水 1/海龟套 2)钳 1000
      //  ② cactusThorns:仙人掌套定值 15/专家 30/大师 45（不乘伤害）
      if (attacker && contactOnly && !attacker.dead) {
            // 格挡盾反击（Player.cs:30910-30920 CanParryAgainst:shieldParryTimeLeft>0
    // 且面向来敌 → 本次免伤 + 反伤 2×(kb 5),清格挡窗口）
    if (attacker && contactOnly && p.shieldParryTimeLeft > 0) {
      const facing = attacker.cx + attacker.w / 2 < p.cx + p.w / 2 ? -1 : 1;
      if (p.facing === facing) {
        p.shieldParryTimeLeft = 0;
        const reflect = Math.max(1, Math.round(dmg * 2));
        attacker.hurt(reflect, -facing * 5, -2, this);
        this.addDamageNumber(attacker.cx, attacker.y, reflect, false, '#FFD080');
        return 0;   // 完全免伤
      }
    }
    const num3 = attacker.cx + attacker.w / 2 < p.cx + p.w / 2 ? 1 : -1; // :30928-30932
        if (p.thornsActive) {
          const num2 = (p.buffs.hasThorns ? 1 : 0) + (p.turtleSet ? 1 : 0);   // :30911-30916
          // Main.DamageVar :65597-65620（±15% + luck 重掷——曾裸随机丢重掷段）
          // Player.cs:30929 DamageVar(dmg×mult, -luck)——负幸运劣化重掷（曾传 +luck 方向反）
          const reflect = Math.min(1000, damageVar(dmg * num2, -p.luck));
          attacker.hurt(reflect, -num3 * 10 * 0.65, 0, this);
          this.addDamageNumber(attacker.cx, attacker.y, reflect, false, '#80FF80');
        }
        if (p.cactusSet) {
          const cactus = mainMasterMode(this.world) ? 45 : mainExpertMode(this.world) ? 30 : 15;
          attacker.hurt(cactus, -num3 * 10 * 0.65, 0, this);
          this.addDamageNumber(attacker.cx, attacker.y, cactus, false, '#A0FF60');
        }
      }
      if (p.hp <= 0) {
        p.dead = true;
        // KillMe :38228-38235：pvpDeath 分道计数（numberOfDeathsPVP/PVE）
        if (p.lastPvpDeath) p.deathsPvp++;
        else p.deathsPve++;         // numberOfDeathsPVE（PL:53840,存档持久化）
        p.respawnTimer = 0;
        // 死亡文本/墓碑由 handlePlayerDeath 统一处理（此处不再 toast「你死了」）
        // ==== 死亡惩罚按【角色难度】（Player.difficulty：0 软核 1 中核 2 硬核 3 旅程）====
        // 世界难度不参与死亡惩罚（只管掉落/伤害倍率等），曾两轴混接
        const charDiff = p.appearance?.difficulty ?? 0;
        // PvP 死亡不掉钱（KillMe :38318-38326：pvp → lostCoins=0 跳过 DropCoins）
        const pvpDeathNoCoins = p.lastPvpDeath;
        // 先记死亡时身家（Player.cs:38247-38250 lostCoins=coinsOwned——死亡 UI「掉了{0}」；
        // 软核/旅程随后被 DropCoins 实际掉落额覆盖 :38318-38324，中核/硬核的钱随
        // 物品全掉 → 身家即损失额）
        this.lostCoins = pvpDeathNoCoins ? 0 : this.coinsOwned();
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
        // PvP 死亡不掉（:38321-38322 pvp → lostCoins=0，无 DropCoins）
        if (dropsCoinsOnDeath(charDiff) && !pvpDeathNoCoins) {
          // 死亡掉钱档（Player.DropCoins :53351-53380 读 Main.expertMode/masterMode =
          // Difficulty 轴——旅程强度滑杆 ≥2× 同样按专家/大师掉钱）
          const keep = deathCoinKeepFraction(this.world.isMaster ? 2 : this.world.isExpert ? 1 : 0);
          let lost = 0;
          const face = [1, 100, 10000, 1000000];
          // vi_71-74 单轨(本地 coin_* 双轨兼容段已随退役移除)
          COIN_KEYS.forEach((ck, ci) => {
            const id = ITEM_BY_KEY[ck];
            if (id === undefined) return;
            const n = p.inv.countOf(id);
            if (n > 0) {
              const dropN = n - Math.floor(n * keep);
              lost += dropN * face[ci];
              p.inv.remove(id, dropN);
              // ★ 掉出的钱要落地（DropCoins→TryDroppingSingleItem :53386 掉的是
              //   coin 物品实体，死亡点可拾回——此前只 remove 没生成=钱凭空蒸发）
              if (dropN > 0) {
                this.spawnDrop(p.cx, p.cy, ck, dropN, (Math.random() - 0.5) * 8, -2 - Math.random() * 2);
              }
            }
          });
          this.lostCoins = lost; // DrawInterface_35 "掉了{0}"（重生于 respawnPlayer 清零）
        }
        // 垃圾桶死亡清空（Player.cs:53394 mouseItem/trashItem 语义）
        p.inv.trash = null;
      }
    }
    return ok;
  }

  /** CombatText.NewText 1:1（CombatText.cs:59-118）：普通 vy=-7/life=60、暴击
   *  vy=-14/life=120 + 水平漂移 vx±1.25 + 0.12rad 初始旋转（随 vx 正负）、
   *  dot vy=-4/life=40;scale=0 起、alpha=1 起闪烁;盒内随机偏移防连发数字完全
   *  叠加（原版 ±W/2,±H/2,此处取 ±8/±6 近似） */
  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color = '#FFF', dot = false) {
    const vx = crit ? (Math.floor(Math.random() * 51) - 25) * 0.05 : 0; // rand(-25,26)*0.05
    this.dmgNumbers.push({
      x: x + Math.random() * 16 - 8,
      y: y + Math.random() * 12 - 6,
      vx,
      vy: dot ? -4 : crit ? -14 : -7,
      value: amount, crit, dot, color,
      life: dot ? 40 : crit ? 120 : 60,
      scale: 0, alpha: 1, alphaDir: -1,
      rotation: crit ? 0.12 * (vx < 0 ? -1 : 1) : 0, // lifeTime/2*0.002 = 0.12
    });
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
    // 成就：NPC 击杀通知（NotifyNPCKilledDirect）+ MechaMayhem 推进。
    // 双子语义（CountKillForAchievements NPC.cs:80631-80640）：125/126 需另一只
    // 也已死（!AnyNPCs(另一只)）才通知/计杀——单眼死亡不计
    if (enemy?.vanillaId != null) {
      const id = enemy.vanillaId;
      const active = (this.entities.enemies as Enemy[])
        .filter((e) => !e.dead && e.vanillaId != null).map((e) => e.vanillaId!);
      if (id === 125 || id === 126) {
        const otherAlive = active.includes(id === 125 ? 126 : 125);
        if (!otherAlive) {
          this.achievements.notifyNPCKilled(enemy.vanillaNetId ?? id);
          this.achievements.mechaMayhemKill(id, active);
        }
      } else {
        this.achievements.notifyNPCKilled(enemy.vanillaNetId ?? id);
        if (id === 127 || id === 134) this.achievements.mechaMayhemKill(id, active);
      }
    }
    // Boss 击败记账已由 Boss 逻辑块通用化(downed_<vanillaId>)
    void key;
    // 图鉴杀数（NPC.cs:79640-79643 NPCLoot→RegisterKill：netID 记账经 GetBestiaryCreditId
    // 归并变体/部位；IsNPCValidForBestiaryKillCredit 门在数据层。原版另有 GetWereThereAnyInteractions
    // 门（雕像产怪无玩家交互不计）——本仓 hurt 无伤害源参数，近似为全部计入，仅环境击杀的
    // 雕像怪是偏差面）
    if (enemy && enemy.vanillaId != null
      && isNpcValidForBestiaryKillCredit(enemy.vanillaId, enemy.killBossFlag)) {
      this.world.bestiary.registerKill(enemy.vanillaNetId !== 0 && enemy.vanillaNetId != null
        ? enemy.vanillaNetId : enemy.vanillaId);
      this.achCheckBestiary();
      // TryGrantingBestiary100Percent（AchievementsHelper.cs:80-87）：完成度达 100%
      // → HandleSpecialEvent(29 BOOK_WORM;此前 100% 不触发,2026-08-13 接）
      if (this.world.bestiary.completion().percent >= 1) {
        this.achievements?.handleSpecialEvent(29,
          { statLifeMax: this.player.maxHp, statManaMax: this.player.maxMana });
      }
    }
    // 踩死帝皇蝶 661 → 光女苏醒（checkDead case 661，NPC.cs:80294-80303）：
    // 门 = GetWereThereAnyInteractions（:80616-80625 → 本体 playerInteraction 位，
    // 由玩家伤害置位 Enemy.hurt fromPlayer → playerInteracted——玩家曾碰过即算,
    // 死因不限玩家直接击杀,环境/岩浆死同触发）；!AnyNPCs(636) 独占 +
    // 出生点 = 蝶 Center+(0,-200)+randCircular(50,50)。
    // SpawnBoss default → "光之女皇已苏醒！" 公告，无咆哮（原版生成路径无声）
    if (enemy && enemy.vanillaId === 661 && enemy.playerInteracted && !this.hasNpcId(636)) {
      const px = enemy.cx + (Math.random() * 100 - 50);
      const py = enemy.cy - 200 + (Math.random() * 100 - 50);
      const eol = Enemy.fromVanilla(636, px, py);
      if (eol) {
        eol.id = this.entities.nextId++;
        eol.despawnTimer = 15000;   // SpawnBoss timeLeft = activeTime×20（NPC.cs:81485）
        this.entities.add(eol, 'enemies');
        if (!this.boss) this.boss = eol;
        this.announceBossSummon(636);
      }
    }
    // 旗帜击杀记账（BannerSystem.AddNPCKillBy :193-216——达标公告+掉一面旗;原版
    // claimable+对话领取,本仓自动授予近似,登记）
    if (enemy && enemy.vanillaId != null) {
      // 计数器行"最近击杀"(Player.lastCreatureHit :2458;写入点 Player.cs:20175/:43750)
      this.player.lastCreatureHit = enemy.vanillaNetId !== 0 ? enemy.vanillaNetId : enemy.vanillaId;
      const grant = recordBannerKill(this.world.bannerKills, enemy.vanillaNetId !== 0 ? enemy.vanillaNetId : enemy.vanillaId);
      if (grant) {
        const banner = bannerOfNpc(enemy.vanillaNetId !== 0 ? enemy.vanillaNetId : enemy.vanillaId);
        const name = Lang.npcName(bannerItemId(banner) ? (enemy.vanillaNetId !== 0 ? enemy.vanillaNetId : enemy.vanillaId) : enemy.vanillaId);
        this.newText(`${name} 旗帜已就绪!`, 250, 250, 0);
        const _bannerItemVid = bannerItemId(banner);
        const _bannerKey = VANILLA_ITEM_KEY_BY_ID[_bannerItemVid] ?? 'place_v_91_banners';
        this.spawnDrop(this.player.cx, this.player.cy, _bannerKey, 1, 0, -3, banner);
      }
    }
    // 史莱姆王死亡砸出书呆子史莱姆 670（NPC.cs:80206-80222 case 50 + ViolentlySpawnNerdySlime
    //  :80317-80330）：!unlockedSlimeBlueSpawn → 置旗 + 原地上抛生成
    if (enemy && enemy.vanillaId === 50 && !this.world.flags.unlockedSlimeBlueSpawn) {
      this.world.flags.unlockedSlimeBlueSpawn = true;
      const nerdy = new TownNPC('town_slime_blue', enemy.cx, enemy.cy - 20);
      nerdy.vy = -3 - Math.random() * 3;
      this.entities.add(nerdy, 'npcs');
      this.cb.onToast?.(Lang.npcName(670) ?? '书呆子史莱姆加入了小镇！');
    }
    // 史莱姆雨击杀推进（NPC.cs:79880-79897：阈值 150、杀过王减半 75；场上无王 → 召王）。
    // 自然召王无公告无咆哮（SpawnOnPlayer(50) → SpawnBoss case 50 静默 :81504；
    // Roar 只随史莱姆王冠物品 :43080）
    if (enemy && enemy.vanillaId != null && this.world.weather.slimeRain) {
      const downedSK = !!(this.world.flags as Record<string, boolean>).downedSlimeKing;
      if (this.world.weather.advanceSlimeRainKill(enemy.vanillaId, downedSK) && !this.boss) {
        this.summonBoss('king_slime', { roar: false });
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
      // SetEventFlagCleared（NPC.cs:80011-80033，各 case 带月别门）：南瓜月
      // 327→event 5 / 325→4；霜月 344→21 / 345→20 / 346→22——首杀置 downed_* 旗
      // 并投递灯笼夜预约（4/21/22 在排除集不预约，仅置旗；此前缺本段 = 南瓜王/
      // 冰女王首杀后次夜灯笼夜不触发，2026-08-13 review 补）
      const meFlag: Record<number, { ev: number; pumpkin: boolean }> = {
        327: { ev: 5, pumpkin: true }, 325: { ev: 4, pumpkin: true },
        344: { ev: 21, pumpkin: false }, 345: { ev: 20, pumpkin: false },
        346: { ev: 22, pumpkin: false },
      };
      const mf = meFlag[enemy.vanillaId];
      const meKind = this.world.moonEvent.kind;
      if (mf && (mf.pumpkin ? meKind === MOON_KIND_PUMPKIN : meKind === MOON_KIND_FROST)) {
        const key = `downed_${enemy.vanillaId}`;
        if (!this.world.flags[key]) {
          this.world.flags[key] = true;
          LanternNight.onGameEventCleared(mf.ev);
        }
      }
      // 成就：月事件 15 波（NPC.cs:79369 霜月 event 14 / :79503 南瓜月 event 15——
      // 进波公告非 Empty 且 waveNumber==15 时触发）
      if (this.world.moonEvent.waveNumber >= 15) {
        this.achievements.notifyProgressionEvent(this.world.moonEvent.kind === MOON_KIND_PUMPKIN ? 15 : 14);
      }
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

  // ================= 成就系统钩子（AchievementsHelper 移植） =================

  /** 进世界成就基线（AchievementsHelper.OnPlayerEnteredWorld :100-192）：
   *  背包/装备/染料/杂项全量"拾取"通知 + 装备态检查（含进包即满足的旗标成就） */
  achOnWorldEnter(): void {
    // GOING_OLDSCHOOL B1（子代理 E 集成点）：成就实例挂窗口——标题屏日月拖拽
    //（TitleMenu.classicTitleAchievement 优先读 __swAchievements）进过世界后可达
    if (typeof window !== 'undefined') {
      (window as unknown as { __swAchievements?: unknown }).__swAchievements = this.achievements;
    }
    const inv = this.player.inv;
    const notifyAll = (arr: ReadonlyArray<{ id: number; stack: number } | null>) => {
      for (const s of arr) {
        if (!s) continue;
        const vid = vanillaIdOfItem(s.id);
        if (vid > 0) this.achievements.notifyItemPickup(vid);
      }
    };
    notifyAll(inv.slots); notifyAll(inv.armor); notifyAll(inv.dye);
    notifyAll(inv.miscEquips); notifyAll(inv.miscDyes);
    if (this.player.maxMana > 20) this.achievements.completeFlag('STAR_POWER', 'Use');
    this.achCheckEquipState();
  }

  /** 装备态成就检查（OnPlayerEnteredWorld :166-191 + HandleOnEquip :247-281 合并求值）：
   *  抓钩→HOLD_ON_TIGHT / 坐骑→THE_CAVALRY / 翅膀→HEAD_IN_THE_CLOUDS /
   *  三件套→MATCHING_ATTIRE / 时装三件→FASHION_STATEMENT / 全染料→DYE_HARD /
   *  Torch God 恩惠→GAIN_TORCH_GODS_FAVOR（unlockedBiomeTorches 等价：包内持有 5043） */
  achCheckEquipState(): void {
    const inv = this.player.inv;
    const a = this.achievements;
    if (inv.miscEquips[4]) a.completeFlag('HOLD_ON_TIGHT', 'Equip');
    if (inv.miscEquips[3]) a.completeFlag('THE_CAVALRY', 'Equip');
    for (const s of inv.armor) {
      if (s && (statOfInternal(s.id)?.wing ?? 0) > 0) { a.completeFlag('HEAD_IN_THE_CLOUDS', 'Equip'); break; }
    }
    if (inv.armor[0] && inv.armor[1] && inv.armor[2]) a.completeFlag('MATCHING_ATTIRE', 'Equip');
    if (inv.armor[10] && inv.armor[11] && inv.armor[12]) a.completeFlag('FASHION_STATEMENT', 'Equip');
    let allDye = inv.dye.every((s) => !!s);
    if (allDye) allDye = inv.miscDyes.every((s) => !!s);
    if (allDye) a.completeFlag('DYE_HARD', 'Equip');
    if (inv.slots.some((s) => s && vanillaIdOfItem(s.id) === 5043)) {
      a.completeFlag('GAIN_TORCH_GODS_FAVOR', 'Use');
    }
    // 生命/魔力双满 → TOPPED_OFF（:139-143）
    if (this.player.maxHp >= 500 && this.player.maxMana >= 200) a.completeFlag('TOPPED_OFF', 'Use');
  }

  /** UI 装备变更后调用（HandleOnEquip 语义合并进 achCheckEquipState） */
  achNotifyEquipChanged(): void { this.achCheckEquipState(); }

  /** 跑动里程（AchievementsHelper.HandleRunning——MARATHON_MEDALIST） */
  achNotifyRunning(px: number): void { this.achievements.handleRunning(px); }

  /** 图鉴 100%（TryGrantingBestiary100PercentAchievement → prog 29 BOOK_WORM；
   *  杀/遇/对话三处登记后调用） */
  achCheckBestiary(): void {
    if (this.world.bestiary.completion().percent >= 1) {
      this.achievements.notifyProgressionEvent(29);
    }
  }

  // ================= 移动端虚拟控件快捷动作 =================

  /** 智能光标键同步脉冲（移动端按钮 down/up 直调 updateWanted——不依赖 tick
   *  窗口消化电平，极速点按也可靠翻转；tick 内的常规调用见到 prev 已更新，
   *  edge=false 不会双翻） */
  pulseSmartCursor(level: boolean): void {
    this.smartCursor.updateWanted(level, !!this.input.mouseDown, this.smartSettings());
  }

  // ================= 宠物系统（vanity/light pet） =================

  /** 宠物跟随体（槽 0）/ 光宠跟随体（槽 1）——updatePets 每帧维护 */
  petFollower: PetFollower | null = null;
  lightPetFollower: PetFollower | null = null;
  /** 隐藏旗（原版 Player.hideMisc[0]/[1]，TogglePet/ToggleLight :17191-17208 翻转） */
  petHidden = false;
  lightPetHidden = false;

  /** 每帧宠物存续维护（UpdatePet :17147-17162 / UpdatePetLight :17164-17187）。
   *  光宠点光（Projectile light 族：Fairy 等 7 款照明宠物恒发光——近似暖光 1.1/1.0/0.85；
   *  逐款色差登记二期） */
  private updatePets(): void {
    this.petFollower = this.updatePetSlot(0, !this.petHidden, this.petFollower);
    this.lightPetFollower = this.updatePetSlot(1, !this.lightPetHidden, this.lightPetFollower);
    if (this.lightPetFollower && !this.lightPetFollower.dead) {
      this.lighting.addLight(
        Math.floor(this.lightPetFollower.cx / TILE), Math.floor(this.lightPetFollower.cy / TILE),
        1.1, 1.0, 0.85,
      );
    }
  }

  private updatePetSlot(slot: 0 | 1, visible: boolean, cur: PetFollower | null): PetFollower | null {
    const item = this.player.inv.miscEquips[slot];
    const info = item ? petInfoOfVid(vanillaIdOfItem(item.id)) : null;
    const want = info && visible && !this.player.dead;
    if (!want) {
      if (cur && !cur.dead) cur.dead = true;
      return null;
    }
    // 已在役且同款 → 保留；换款/首次 → 重生
    if (cur && !cur.dead && cur.projId === info.proj) return cur;
    if (cur && !cur.dead) cur.dead = true;
    const f = new PetFollower(this.player.cx, this.player.y - 30, info.proj,
      () => (this.player.dead ? null : this.player));
    this.entities.add(f, 'npcs');
    return f;
  }

  /** 宠物召唤/收回（Player.TogglePet :17191-17196 + ToggleLight :17199-17208
   *  的 hideMisc 翻转语义；移动端坐骑/宠物键入口。坐骑引擎未实装——槽 3 装备
   *  时仅提示） */
  togglePets(): void {
    if (this.player.inv.miscEquips[0]) this.togglePetSlot(0);
    else if (this.player.inv.miscEquips[1]) this.togglePetSlot(1);
  }

  /** 槽位化切换（原版 TogglePet/ToggleLight 各管各槽——Main.cs:40682-40691 装备
   *  界面眼睛图标点击；桌面端入口，移动端聚合键走 togglePets） */
  togglePetSlot(slot: 0 | 1): void {
    if (!this.player.inv.miscEquips[slot]) return;
    if (slot === 0) this.petHidden = !this.petHidden;
    else this.lightPetHidden = !this.lightPetHidden;
    this.sfx.play('menuTick', 1);   // UI 点击 Sound 12（Main.cs:40688）
  }

  /** 装备钩爪发射（miscEquips[4]，移动端虚拟键）。方向 = 摇杆轴或角色朝向。
   *  Player.QuickGrapple_GetItemToUse（Player.cs:6118-6132）：装备槽优先，否则
   *  背包首个钩爪物品。发射走 fireGrapple（QuickGrapple 上限门/交替轮换 1:1）；
   *  原版无"全部收回"动作——释放统一走跳键（GrappleMovement :22463-22480） */
  useEquippedGrapple(dirX: number | null, dirY: number | null): void {
    const p = this.player;
    let vid = 0;
    const equipped = p.inv.miscEquips[4];
    if (equipped) {
      const hi = hookItemOf(vanillaIdOfItem(equipped.id));
      if (hi) vid = vanillaIdOfItem(equipped.id);
    }
    if (!vid) {
      for (const s of p.inv.slots) {
        if (!s) continue;
        const v = vanillaIdOfItem(s.id);
        if (hookItemOf(v)) { vid = v; break; }
      }
    }
    if (!vid) return;
    const dx = dirX ?? p.facing;
    const dy = dirY ?? -0.35;                          // 摇杆无纵轴时略朝上（移动端近似）
    const d = Math.hypot(dx, dy) || 1;
    this.fireGrapple(vid, dx / d, dy / d);
  }

  /** Player.QuickGrapple 发射段（Player.cs:5971-6116）1:1：
   *  ① 统计在役钩（在飞 num5 / 已锚 num6）与最旧（timeLeft 最小 num3/num4 :5976-5987）
   *  ② 上限门：num7 = max(1, quickMax - 已锚数)，在飞数 ≥ num7 → 拒发（:5989-6015）
   *  ③ 总数门：已锚+在飞 ≥ quickTotal → 先杀最旧（:6041-6044）
   *  ④ 双钩 73：场上有蓝钩 → 发红钩 74（:6057-6065）
   *  ⑤ 月亮钩 3572：取 timeLeft 最大（最旧）的 646-649 依次轮换（:6067-6092）
   *  ⑥ 速度 = 方向 × item.shootSpeed（:6110-6113） */
  fireGrapple(itemVid: number, dirX: number, dirY: number): boolean {
    const p = this.player;
    const hi = hookItemOf(itemVid);
    if (!hi) return false;
    const stats = HOOK_PROJ_STATS[hi.shoot];
    let oldest: GrappleProj | null = null;
    let oldestTL = 100000;
    let inflight = 0;                                  // num5
    let latched = 0;                                   // num6
    for (const g of p.grappleProjs) {                  // :5976-5987
      if (g.ai0 === GRAPPLE_LATCH) latched++;
      else inflight++;
      if (g.timeLeft < oldestTL) { oldest = g; oldestTL = g.timeLeft; }
    }
    let shootType = hi.shoot;                          // num2
    // :6012 num7 = Math.Max(1, num7 - num6)
    const maxInflight = Math.max(1, stats.quickMax - latched);
    if (inflight >= maxInflight) return false;         // :6013-6015
    p.updateBlacklistedTilesForGrappling();            // :6018
    this.sfx.play('throw', 1);                       // :6019 item.UseSound = Item1
    // :6041-6044 总数门 → 杀最旧
    if (oldest && latched + inflight >= stats.quickTotal) oldest.kill();
    // :6057-6065 双钩交替
    if (shootType === 73 && p.grappleProjs.some((g) => g.projType === 73)) shootType = 74;
    // :6067-6092 月亮钩轮换（最旧 646-649 的下一色）
    if (itemVid === 3572) {
      let cur = -1;
      let curTL = -1;
      for (const g of p.grappleProjs) {
        if (g.projType >= 646 && g.projType <= 649 && (curTL === -1 || curTL < g.timeLeft)) {
          cur = g.projType;
          curTL = g.timeLeft;
        }
      }
      shootType = cur === 646 ? 647 : cur === 647 ? 648 : cur === 648 ? 649 : 646;
    }
    // 弹体尺寸（Projectile.SetDefaults；vanilla-projectiles.json 全量提取）——出生点
    // = 玩家 MountedCenter（QuickGrapple :6110 vector = position + Size×0.5）
    const sz = projectileData(shootType);
    const projW = sz?.width ?? 18;
    const projH = sz?.height ?? 18;
    const proj = new GrappleProj(
      p.cx - projW / 2, p.cy - projH / 2, dirX * hi.shootSpeed, dirY * hi.shootSpeed,
      shootType, () => (p.dead ? null : p));           // :6110-6115 NewProjectile（玩家中心）
    this.entities.add(proj, 'projectiles');
    p.registerGrappleProj(proj);
    p.useTime = hi.useTime;                            // ItemCheck_TryStartUse 冷却
    return true;
  }

  /** 快捷药水（移动端药水键）：背包首瓶匹配药水直饮。效果链 = updateUse 的
   *  vi_ 消耗品桥接段（vanilla-itemfunc healLife/healMana/buffType）同构镜像 */
  quickDrinkPotion(kind: 'heal' | 'mana'): void {
    const p = this.player;
    if (p.useTime > 0) return;
    let slot = -1;
    for (let i = 0; i < p.inv.slots.length; i++) {
      const s = p.inv.slots[i];
      if (!s) continue;
      const ff = itemFuncOfVid(vanillaIdOfItem(s.id));
      if (!ff?.consumable || ff.createTile || ff.shoot || ff.pick || ff.axe || ff.hammer) continue;
      if (kind === 'heal' ? !ff.healLife : !ff.healMana) continue;
      slot = i;
      break;
    }
    if (slot < 0) return;
    if (kind === 'heal' && p.buffs.healBlocked) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.HealBlock'));
      p.useTime = 30;
      return;
    }
    const s = p.inv.slots[slot]!;
    const ff = itemFuncOfVid(vanillaIdOfItem(s.id))!;
    if (ff.buffType && ff.buffType > 0) {
      const bt = BUFF_BY_VANILLA.get(ff.buffType);
      if (bt !== undefined && bt !== BuffType.Resistance) {
        p.buffs.apply(bt, Math.round((ff.buffTime ?? 7200) / 60));
      }
    }
    if (ff.healLife) {
      p.hp = Math.min(p.maxHp, p.hp + ff.healLife);
      this.addDamageNumber(p.cx, p.y, ff.healLife, false, '#40E080');
      p.buffs.apply(BuffType.Resistance, 60);         // 药水病
    }
    if (ff.healMana) {
      p.mana = Math.min(p.maxMana, p.mana + ff.healMana);
      p.buffs.apply(BuffType.ManaSickness, 5);
    }
    p.inv.removeAt(slot, 1);
    p.useTime = 60;
    this.sfx.play('drink');
    this.cb.onInventoryChanged();
  }


  /** StartVictoryScene（DD2Event.cs:481-507）：水晶 548 ai[1]=2 / 门 549 撤收 */
  private startDD2VictoryScene(): void {
    // 成就：DD2 T3 胜利（DD2Event.cs:338 event 23 → DEFEAT_OLD_ONES_ARMY_TIER3）
    this.achievements.notifyProgressionEvent(23);
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
        // SummonBetsy（DD2Event.cs:929-943）→ SpawnOnPlayer(551) → SpawnBoss
        // case 551 静默（NPC.cs:81504-81506 case-break 组）——无 "已苏醒" 公告
        // 无咆哮（Betsy 551 无 boss 位 :16448，BGM 走 DD2 军团曲 41）
        const crystal = (this.entities.enemies as Enemy[]).find((e) => !e.dead && e.vanillaId === 548);
        const cx = crystal ? crystal.cx : this.player.cx;
        const cy = crystal ? crystal.cy : this.player.cy;
        dd2SummonBetsy(oa, this.dd2Host(), cx, cy);
      }
    }
    if (res.lose) {
      this.newText(Lang.text('DungeonDefenders2.InvasionLose'), 255, 0, 0);
    }
  }

  // ================= 星璇塔 / 天界入侵（LunarEvent.ts 宿主回调侧） =================

  /** EclipseHost：公告/成就（world/Eclipse.ts 保持纯逻辑，不反向依赖 Game） */
  private eclipseHost(): EclipseHost {
    return {
      broadcast: (text, r, g, b) => this.newText(text, r, g, b),
      notifyProgressionEvent: (n) => this.achievements.notifyProgressionEvent(n),
    };
  }

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

  // ================= 调试工具:F6 召唤面板 / F2 无敌+无限魔力(均原版无) =================

  summonPanel: DebugSummonPanel | null = null;

  /** F6:无条件召唤任意 NPC(怪物/Boss/小动物/城镇 NPC)——面板见 DebugSummonPanel */
  toggleSummonPanel(): void {
    if (!this.summonPanel) {
      this.summonPanel = new DebugSummonPanel({
        spawn: (id, count, atMouse) => this.debugSpawnNpc(id, count, atMouse),
        clearEnemies: () => this.debugClearEnemies(),
        nameOf: (id) => Lang.npcName(id) ?? '',
        events: [
          { key: 'bloodMoon', label: '血月' },
          { key: 'eclipse', label: '日食' },
          { key: 'meteor', label: '陨石坠落' },
          { key: 'meteorShower', label: '流星雨' },
          { key: 'goblin', label: '哥布林入侵' },
          { key: 'pirate', label: '海盗入侵' },
        ],
        triggerEvent: (key) => this.debugTriggerEvent(key),
      });
    }
    this.summonPanel.toggle();
    this.input.uiBlocking = this.summonPanel.open;
  }

  /** F6 事件触发(调试):全部走**自然事件入口**——与自然 roll 命中同路径/同公告/
   *  同清旗点,不绕过保护门与昼夜消费时序,自然流程零破坏:
   *  - 血月 = 黄昏 roll 命中体(bloodMoon+清晷冷却+misc[8],Main.cs:64813-64831);
   *    夜间生效、黎明自然清除——白天按下 = 当晚升起
   *  - 日食 = 黎明 roll 命中体(eclipse+misc[20],Main.cs:64898-64920);黄昏自然清除,
   *    夜间按下会被即刻清除故拦下
   *  - 陨石 = 仅置 meteorPending(同 EoW 击杀/入夜 1/50 的旗位),消费仍走
   *    HandleMeteorFall 原始 time>16200 门(夜=午夜后/昼=9AM 后)+落点保护
   *  - 流星雨 = StartMeteorShower(:6189-6194) 计数 [650,751)×4
   *  - 入侵 = announceNaturalInvasion(StartInvasion 门:生命上限/Boss 在场/进行中) */
  debugTriggerEvent(key: string): string | null {
    const w = this.world;
    if (!w) return '世界未就绪';
    // 联机访客拦下(事件权威在房主,同 summonBossAtTx 的 Boss 门)
    if (this.net && !this.net.policy.isHost) return '仅房主可触发事件';
    switch (key) {
      case 'bloodMoon':
        w.clock.bloodMoon = true;
        w.sundialCooldown = 0; w.moondialCooldown = 0;   // 血月清晷冷却（:64892-64893）
        this.newText(Lang.misc(8), 50, 255, 130);
        return null;
      case 'eclipse':
        // 日食是困难模式专属事件（自然黎明 roll 门 hardMode && mechAny,Main.cs:64898；
        // 日耀碑牌亦困难模式物品）——调试触发同样过 hardMode 门,肉前强开会刷
        // 吸血鬼/科学怪人（出怪分支本身无门,原版靠事件不可达保证隔离）
        if (!w.flags.hardMode) return '日食是困难模式事件——需先击败血肉墙';
        if (!w.clock.isDay) return '现在是夜晚——日食黄昏即被自然清除,请白天触发';
        w.clock.eclipse = true;
        this.newText(Lang.misc(20), 50, 255, 130);
        return null;
      case 'meteor':
        this.meteorPending = true;   // 消费门:夜午夜后/昼 9AM 后,落点走保护/上限
        return null;
      case 'meteorShower':
        w.meteorShowerCount = (650 + Math.floor(Math.random() * 101)) * 4;
        this.newText(Lang.gen(92), 50, 255, 130);
        return null;
      case 'goblin':
      case 'pirate': {
        // 带门公共入口(哥布林战旗/海盗地图同款):hp≥200/Boss 不在场/无进行中入侵
        // ——自然 roll 的 hp 门在调用点而非 startInvasion 内,直通会漏门
        const ok = this.startInvasionAndAnnounce(key === 'goblin' ? INVASION_GOBLIN : INVASION_PIRATE);
        return ok ? null : '无法开启(见提示:生命上限<200/Boss 在场/已有入侵)';
      }
      default:
        return `未知事件 ${key}`;
    }
  }

  /** 面板生成动作:Enemy.fromVanilla 全量 + NewNPC 底锚 + Boss 槽接管 + 世吞链 */
  debugSpawnNpc(id: number, count: number, atMouse: boolean): string | null {
    if (!this.world) return '世界未就绪';
    const st = this.world.store;
    let bx = this.player.cx, by = this.player.cy - 24;
    if (atMouse) {
      const [wx, wy] = this.camera.screenToWorld(this.input.mouseX, this.input.mouseY);
      bx = wx; by = wy;
    }
    const townKey = Object.entries(TOWN_NPC_IDS).find(([, v]) => v.id === id)?.[0];
    for (let i = 0; i < count; i++) {
      const ox = (i % 5) * 44 - 88, oy = Math.floor(i / 5) * 44;
      const x = Math.max(TILE, Math.min((st.w - 2) * TILE, bx + ox));
      const y = Math.max(TILE, Math.min((st.h - 2) * TILE, by + oy));
      if (townKey) {
        this.entities.add(new TownNPC(townKey, x, y), 'npcs');
        continue;
      }
      const e = Enemy.fromVanilla(id, x, y);
      if (!e) return `${id} 无 vanilla-npcs 数据(如 473-476/686 台账)`;
      e.y = y - e.h;                       // NewNPC 底锚(NPC.cs:46596-46597,同 spawnNPC)
      e.id = this.entities.nextId++;
      this.entities.add(e, 'enemies');
      if (e.def.boss) {
        this.boss = e;                     // 接管 Boss 槽(血条/死亡记账)
        // 世界消息广播(左下角 ChatMonitor,同召唤链 announceBossSummon):
        // SpawnOnPlayer 末尾 HasAwoken 开关(NPC.cs:81495-81511)。WoF 113 走
        // SpawnWOF 专属链(公告无咆哮)——此处仅补文本
        if (id === 113) {
          this.newText(Lang.text('Announcement.HasAwoken', Lang.npcName(113) ?? '???'), 175, 75, 255);
        } else {
          this.announceBossSummon(id);
        }
      }
      if (id === 13) {                     // 世吞:体节链随头召唤(同 summonBossAtTx)
        const segs = Enemy.spawnWormChain(e, 15 + Math.floor(Math.random() * 16));
        for (const sg of segs) { sg.id = this.entities.nextId++; this.entities.add(sg, 'enemies'); }
      }
    }
    return null;
  }

  /** 面板清怪:直置 dead 跳过掉落;Boss 槽一并清空防误记账 */
  debugClearEnemies(): number {
    let n = 0;
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (!e.dead) { e.hp = 0; e.dead = true; n++; }
    }
    this.boss = null;
    return n;
  }

  /** F2:无敌 + 无限魔力(Player.debugGod:damage() 早退 + 每 tick 血蓝回满) */
  toggleDebugGod(): void {
    const p = this.player;
    if (!p) return;
    p.debugGod = !p.debugGod;
    if (p.debugGod) { p.hp = p.maxHp; p.mana = p.maxMana; }
    this.cb.onToast(p.debugGod ? '调试：无敌 + 无限魔力 已开启' : '调试：无敌 + 无限魔力 已关闭');
  }

  // ================= F1 图片 → 像素方块群(自研,原版无;原键 F11 与系统全屏冲突) =================
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
    const e = Enemy.fromVanilla(398, p.cx, p.cy - 150);  // SpawnOnPlayer case 398：玩家上方 150px
    if (!e) return;
    e.x = p.cx - e.w / 2;
    e.y = p.cy - 150 - e.h / 2;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
    this.boss = e;
    this.announceBossSummon(398);   // SpawnOnPlayer(398) → Enemies.MoonLord HasAwoken 公告
  }

  /** 鹿角怪(668)雨天自然生成（NPC.SpawnOnPlayer 语义：直接落在玩家身上，
   *  Main.cs:64612——午夜 16200t + 下雨 + 雪原无城镇等门全过后调用） */
  private spawnDeerclopsOnPlayer(): void {
    if (this.boss) return;
    const p = this.player;
    const e = Enemy.fromVanilla(668, p.cx, p.cy);
    if (!e) return;
    e.x = p.cx - e.w / 2;
    e.y = p.cy - e.h / 2;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
    this.boss = e;
    this.announceBossSummon(668);   // SpawnOnPlayer 末尾 HasAwoken 公告(:81495-81511)
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

  /** 按原版 NPC id 出生（小动物入微光 NPC.GetShimmered→Transform、WorldItem 放生
   *  ReleaseNPC 的落点）。联机访客拒绝——转化权威在房主（同 spawnEnemy 门禁）。
   *  入 critters 桶：spawnCritter 的 spawnVanilla 同语义（原版小动物表全量走桶） */
  spawnNpcByVanilla(id: number, x: number, y: number): Enemy | null {
    if (this.net && !this.net.policy.isHost) return null;
    // 城镇史莱姆族（670/678-684 townNPC=true）→ TownNPC 落 npcs 桶（WorldItem 681 微光链等）
    const townKey = Object.entries(TOWN_NPC_IDS).find(([, v]) => v.id === id)?.[0];
    if (townKey && id >= 670 && id <= 684) {
      const tn = new TownNPC(townKey, x, y);
      this.entities.add(tn, 'npcs');
      return tn as unknown as Enemy;
    }
    const e = Enemy.fromVanilla(id, x, y);
    if (!e) return null;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'critters');
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
        // 圣诞树 171 豁免：wld 原生就是"索引帧"约定（锚点 frameX=10 哨兵 + 列/行
        // 裸索引，PlaceXmasTree_Direct :39584-39593）+ 锚点 frameY 装饰位段
        // （setXmasTree :39430）——×18 会同时毁掉两者（位段溢出 uint16 成垃圾）
        if (def.vanilla.sheet === 171) continue;
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
  townNpcsForSave(): Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string; shimmered?: boolean }> {
    return this.entities.npcs
      .filter((n): n is TownNPC => n instanceof TownNPC && !n.dead)
      .map((n) => ({
        key: n.npcKey,
        x: Math.round(n.x), y: Math.round(n.y),
        home: n.home ? [n.home.x, n.home.y] : null,
        bound: n.bound || undefined,
        givenName: n.givenName,
        // 微光变体（原版 townNpcVariationIndex,WF:1732 写/:2927 读——本仓 shimmered 布尔承接）
        shimmered: n.shimmered || undefined,
      }));
  }

  /** 世界事件态存档（原版 header party/灯笼夜段 WF:1361-1368/1381-1384） */
  eventsForSave(): SaveData['events'] {
    return {
      partyManual: this.partyState.manualParty,
      partyCooldown: this.partyState.daysOnCooldown,
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
    this.partyState.daysOnCooldown = ev.partyCooldown ?? 0;
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

  /** Lang.GetProjectileName（cs:444）——GameHooks.projectileName 实现（死亡归因用） */
  projectileName(id: number) {
    return Lang.projectileName(id);
  }

  /** PlayTrackedLoopedSound 实现（GameHooks.startTrackedLoop——AI_016 引信嘶声） */
  startTrackedLoop(name: string, vol: number, x: number, y: number) {
    return this.sfx.startTrackedLoop(name as SfxName, vol, x, y);
  }

  playSfxFiles(files: string[], vol?: number, x?: number, y?: number) {
    if (!this.sfx.playFiles(files, vol ?? 1, x, y)) this.sfx.play('hit', vol ?? 1, x, y);
  }

  /** 按原版文件名直播（无合成兜底——音色精确的场景如蜂后吼/仪式圈）：
   *  缓冲未就位时触发后台懒加载，本播静默（下次命中真声） */
  playSfxFile(file: string, vol?: number, x?: number, y?: number) {
    this.sfx.playWavFile(file, vol ?? 1, x, y);
  }

  /** GameHooks.spawnDust：原版 Dust 池直入（Dust.NewDust 签名对齐 + 调用侧
   *  后置字段覆写——Gore.cs:922-927 气泡爆裂尘的 noGravity/alpha/scale 三件套
   *  在 NewDust 之后逐尘赋值，NewDust 本身不带这些参）。DrawDust 双 pass 消费。
   *  返回入池尘供调用侧做 DelegateMethods 式后置（矿车轮火花）；池满 null */
  spawnDust(
    x: number, y: number, w: number, h: number, type: number,
    speedX = 0, speedY = 0, alpha = 0,
    color: { r: number; g: number; b: number; a: number } | null = null,
    scale = 1, noGravity = false,
  ): import('../fx/VanillaDust').VDust | null {
    const d = this.vanillaDust.spawn(x, y, w, h, type, speedX, speedY, alpha,
      color as import('../fx/VanillaDust').DustColor | null, scale);
    if (d && noGravity) d.noGravity = true;
    return d ?? null;
  }

  /** GameHooks.pickPowerEnough（Player.cs:52964-52979 HasEnoughPickPowerToHurtTile）：
   *  GetBestPickaxe（:39439-39450：前五十格 stack>0 且 pick 最高的镐）非空且
   *  GetPickaxeDamage>0 ——后者以 tileNoFail 表（恒 100 伤）或 TILE_DEFS.pick
   *  门槛近似（挖掘模型 1:1 的 d.pick 即原版逐型门槛） */
  pickPowerEnough(x: number, y: number): boolean {
    const power = this.bestPickaxePower();
    if (power <= 0) return false;                    // GetBestPickaxe == null
    const st = this.world.store;
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    if (!(st.flags[k] & 1)) return true;             // 空气格：pickPower>0 即可伤
    const d = TILE_DEFS[st.type[k]];
    if (!d) return false;
    if (d.vanilla && TILE_NO_FAIL_SHEETS.has(d.vanilla.sheet)) return true;   // num=100
    return d.pick >= 0 && power >= d.pick;           // GetPickaxeDamage 主门槛
  }

  /** Player.GetBestPickaxe（Player.cs:39439-39450）：0-49 格内最高 pick（vi_ 表
   *  itemFunc.pick；0 = 无镐） */
  private bestPickaxePower(): number {
    let best = 0;
    for (let i = 0; i < 50; i++) {
      const s = this.player.inv.slots[i];
      if (!s || s.stack <= 0) continue;
      const def = ITEM_DEFS[s.id];
      if (!def) continue;
      const vid = def.vid ?? viIdFromKey(def.key);
      if (vid < 0) continue;
      const pick = itemFuncOfVid(vid)?.pick ?? 0;
      if (pick > best) best = pick;
    }
    return best;
  }

  /** 武器使用音（2026-08-13 特效音效审计）：Item.cs SetDefaults 显式 UseSound
   *  优先（vanilla-itemusesound.json 582 件全量提取，含 Item_2 镰刀/Item_8 恶魔镰
   *  Item_12 激光枪/Item_43 魔镜反弹/Item_92 水矢 等），无显式回落各路径原通道音 */
  playUseSound(vid: number, fallback: string, vol?: number): void {
    const wav = itemUseSoundWav(vid);
    if (wav) this.playSfxFile(wav, vol);
    else this.sfx.play(fallback as 'throw', vol);
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
  /** iconUiDirty 限频时戳(500ms 窗口合一,2026-08-14 trace④) */
  private _iconUiDirtyAt = 0;
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
      this.spawnDrop(tx * TILE + 8, ty * TILE, VI_KEY.TORCH, 1);
      this.sfx.play('dig', 1, tx * TILE + 8, ty * TILE + 8);
    }
  }

  /** GameHooks.addLightAt：世界坐标光源（翅膀 28 微光等实体侧 AddLight） */
  addLightAt(x: number, y: number, r: number, g: number, b: number): void {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.world?.store.inBounds(tx, ty)) this.lighting?.addLight(tx, ty, r, g, b);
  }

  /** GameHooks.lightAt：读侧光照采样（翅膀 49 Heroicis 门 z=Remap(亮度,0.2,0.4)，
   *  Player.cs:30163/:30173 的 rgbToHsl(Lighting.GetColor).Z 消费——亮度=(max+min)/2） */
  lightAt(x: number, y: number): [number, number, number] | null {
    if (!this.lighting) return null;
    return this.lighting.lightAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** GameHooks.playSfxAt：实体侧 SoundEngine.PlaySound（距离衰减走 Sfx 内建公式） */
  playSfxAt(name: import('./Sfx').SfxName, x: number, y: number): void {
    this.sfx?.play(name, 1, x, y);
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

  // (canCraft/craft 自制配方链已随 RECIPES 表退役移除——合成统一走 vanillaCraft)

  // ================= 原版配方（1456 全量 3309 条） =================

  /** 附近站点集合（内部 tile id）+ 液体/群系 → VanillaCraftCtx（每帧缓存由 UI 调用侧刷新） */
  vanillaNearbyStations(): Set<number> {
    // Player.cs:35218 AdjTiles() 每帧先清 alchemyTable=false 再扫描——否则靠近过
    // 一次后永久享受 1/3 材料折扣（旧"只置位不清零"粘滞 bug,2026-08-13 修）
    this._alchemyTable = false;
    this.player.buffs.deadCells = false;   // DeadCellsPotionStation(:5206)
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
          // CountsAsWaterForCrafting（TileID.cs:281 = CreateBoolSet(172, 207)，仅水槽 172
          // 与 207 两档；本仓 vanilla.sheet 即原版 tile id，sheet∈{172,207} 与该 Set 等值，
          // 非近似。消费点 Player.cs AdjTiles :35230-35232 → adjWaterSource）
          const sheet = TILE_DEFS[t]?.vanilla?.sheet;
          if (sheet === 699) this.player.buffs.deadCells = true;   // DeadCellsPotionStation(:5206 buff ×1.2)
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
  /** 附近合成材料源（Recipe._recipeChests，craftSourcesFor 1:1：开箱→虚空袋→附近 bank→600px 箱） */
  private _craftCache: { tick: number; src: CraftItemSource[] } | null = null;
  /** 每 tick 缓存（箱/bank 内容为活引用，扣料直写可见；列表位置只随移动/开箱变） */
  private _craftSourcesCache(): CraftItemSource[] {
    if (this._craftCache && this._craftCache.tick === this.tickCount) return this._craftCache.src;
    const src = this.craftSources();
    this._craftCache = { tick: this.tickCount, src };
    return src;
  }
  private craftSources() {
    const p = this.player;
    const heldVids = new Set(p.inv.slots.filter(Boolean).map((s) => {
      const d = ITEM_DEFS[(s as { id: number }).id];
      return d?.vid ?? (d?.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    }));
    const open = this.openChestRef?.() ?? null;
    return craftSourcesFor(this.world.chests, p.x, p.y, {
      openChest: open,
      banks: p.banks.map((b) => ({ items: b })),   // bank 裸数组 → CraftItemSource 包装
      voidBagHeld: heldVids.has(4131),
      voidVaultHeld: heldVids.has(5325),
      openIsBank4: false,   // 本仓开 bank 走 openChest({x:-2-bi}) 而非 chest 槽——虚空袋重复计入门不适用
      store: this.world.store,
      centerTileX: Math.floor(p.cx / TILE),
      centerTileY: Math.floor(p.cy / TILE),
    });
  }
  vanillaAvailableRecipes() {
    return availableRecipes(this.player.inv, {
      nearbyInternal: this.vanillaNearbyStations(),
      nearWater: this._nearLiquid.water, nearHoney: this._nearLiquid.honey, nearLava: this._nearLiquid.lava,
      zoneSnow: this.scene.zoneSnow,
      zoneGraveyard: this.scene.zoneGraveyard,
    }, this._craftSourcesCache());
  }

  /** 执行原版配方合成（CraftingRequests.CraftLocally 主干）：扣材料→成品入背包 */
  vanillaCraft(r: VanillaRecipeLike, times = 1) {
    if (!consumeMaterials(this.player.inv, r, times, this._alchemyTable, this._craftSourcesCache())) return;
    const outKey = recipeItemKey(r.create);
    if (!outKey) return;
    const left = this.player.inv.add(ITEM_BY_KEY[outKey], r.createStack * times);
    if (left > 0) this.spawnDrop(this.player.cx, this.player.y, outKey, left); // 背包装不下→掉落
    this.achNotifyCraft(outKey);
    this.sfx.play('pickup'); // SoundID 7 物品抓取（原版合成成品上鼠标的 grab 声）
    this.cb.onInventoryChanged();
  }

  /** 合成产出入包（vanillaCraft 的产出半段，供现代合成网格的格子合成复用） */
  vanillaCraftOutput(r: VanillaRecipeLike): void {
    const outKey = recipeItemKey(r.create);
    if (!outKey) return;
    const left = this.player.inv.add(ITEM_BY_KEY[outKey], r.createStack);
    if (left > 0) this.spawnDrop(this.player.cx, this.player.y, outKey, left);
    this.achNotifyCraft(outKey);
    this.sfx.play('pickup'); // SoundID 7（同 vanillaCraft）
    this.cb.onInventoryChanged?.();
  }

  /** 成就：合成通知（AchievementsHelper.NotifyItemCraft——内部 item key 版） */
  private achNotifyCraft(outKey: string): void {
    const id = ITEM_BY_KEY[outKey];
    if (id === undefined) return;
    const vid = vanillaIdOfItem(id);
    if (vid != null) this.achievements.notifyItemCraft(vid);
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
  /** 进洞计分（GolfHelper.PutBallInCup :86-115 + GolfState.cs:151-160）：
   *  门 = 本地玩家球 && ShouldScoreHole（golfScoreTime>=90，GolfState.cs:32）；
   *  >1 杆 → SetScoreTime=3600（折扣系数 1.0）；RecordBallInfo→LandBall 记终点 →
   *  GetGolfBallScore（⌊轨迹分 × time/3600⌋）→ >0 杆才 AccumulateGolfingScore（上限 1e9，
   *  Player.cs:4723-4731）→ 公告 → ResetScoreTime → Wiring.HitSwitch（球洞=电路开关，
   *  Wiring.cs:167-171）。杀球由 GolfBall.fixedUpdate 承担（proj.Kill :114） */
  private golfCupCapture(ball: GolfBall, tileX: number, tileY: number): void {
    if (!ball.isMine || !this.golfState.shouldScoreHole) return;   // :88
    const swings = ball.swings;                                    // num = ai[1]（:92）
    if (swings > 1) this.golfState.setScoreTime();                 // :95-97
    this.golfState.recordBallInfo(ball);                           // :98
    this.golfState.landBall(ball);                                 // :99
    const score = this.golfState.getGolfBallScore(ball);           // :100
    if (swings > 0) {                                              // :101-104
      // AccumulateGolfingScore（Player.cs:4723-4731）：溢出截断到 1e9
      const room = 1_000_000_000 - this.player.golferScoreAccumulated;
      this.player.golferScoreAccumulated += Math.min(score, Math.max(0, room));
    }
    // PutBallInCup_TextAndEffects（:117-135）：>0 杆才有公告；单/复数键切换。
    // 参数序 = (玩家名, 球名, 杆数)（:127/:131 NetworkText.FromKey）
    if (swings !== 0) {
      this.sfx.play('tink', 0.9, ball.cx, ball.cy);                // Item129 进洞音（:168）
      const ballName = Lang.projectileName(ball.projId) ?? '';
      this.newText(swings === 1
        ? Lang.text('Game.BallBounceResultGolf_Single', this.playerName(), ballName)
        : Lang.text('Game.BallBounceResultGolf_Plural', this.playerName(), ballName, swings),
      255, 240, 20);
    }
    this.golfState.resetScoreTime();                               // :106
    this.wiring?.hitSwitch(tileX, tileY);                          // :107（msg59 单机无对端）
  }

  /** TryPlacingAGolfBallNearANearbyTee（Player.cs:48857-48917）：placePosition 5×5 找全部
   *  球座 494 → 取离光标最近者 → 玩家触及范围内才摆球（旧自有球全杀 + ai[1]=-1 待发）。
   *  placeX/placeY = 摆位中心（球杆=玩家中心 :49525 / 投掷=光标 :46894） */
  private tryPlacingGolfBallNearTee(
    placeX: number, placeY: number, mouseX: number, mouseY: number,
  ): boolean {
    const st = this.world.store;
    const ptx = Math.floor(placeX / TILE), pty = Math.floor(placeY / TILE);   // :48872
    const tees: Array<[number, number]> = [];
    for (let j = -2; j <= 2; j++) {                                           // :48878-48890
      for (let i = -2; i <= 2; i++) {
        const x = ptx + i, y = pty + j;
        if (x >= 1 && y >= 1 && x < st.w - 1 && y < st.h - 1                  // InWorld(num,num2,1)
          && st.flags[st.idx(x, y)] !== 0
          && TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet === 494) {
          tees.push([x, y]);
          break;                                                              // :48887（行内首个即止）
        }
      }
    }
    if (tees.length === 0) return false;                                      // :48892
    // 取离光标最近的球座（:48896-48906）
    let best = tees[0], bestD = -1;
    for (const t of tees) {
      const d = Math.hypot(t[0] * 16 + 8 - mouseX, t[1] * 16 + 8 - mouseY);
      if (bestD === -1 || d < bestD) { bestD = d; best = t; }
    }
    // 玩家触及范围门（Collision.InTileBounds :49008——TileReachCheckSettings.Simple 5 格）
    if (!this.inTileRange(best[0], best[1], 0)) return false;                 // :49009
    for (const e of this.entities.projectiles) {                              // :49010-49015
      const b = e as GolfBall;
      if (b instanceof GolfBall && !b.dead && b.isMine) b.dead = true;        // Kill 自有球
    }
    const projId = this.preferredGolfBallProjId();                            // GetPreferredGolfBallToUse
    // NewProjectile((tx*16)+8.5, ty*16+6, ai0=0, ai1=-1)（:49016）
    this.spawnGolfBall(best[0] * 16 + 8.5, best[1] * 16 + 6, projId, true, 0, 0);
    return true;
  }

  /** GetPreferredGolfBallToUse（Player.cs:48919-48950）：手持 → 盔甲槽(19→0 逆序) →
   *  背包(0→49)。球族 = shoot 为高尔夫球弹体的物品（3989→721 / 4242-4253→739+） */
  private preferredGolfBallProjId(): number {
    const held = this.player.inv.heldItem();                                  // :48923
    if (held) {
      const m = /^vi_(\d+)_/.exec(ITEM_DEFS[held.id]?.key ?? '');
      const v = m ? +m[1] : 0;
      if (v === 3989) return 721;                                             // :48925-48928
      if (v >= 4242 && v <= 4253) return 739 + (v - 4242);
    }
    for (let i = 0; i < this.player.inv.slots.length; i++) {                  // :48942-48949
      const sl = this.player.inv.slots[i];
      if (!sl) continue;
      const m = /^vi_(\d+)_/.exec(ITEM_DEFS[sl.id]?.key ?? '');
      const v = m ? +m[1] : 0;
      if (v === 3989) return 721;
      if (v >= 4242 && v <= 4253) return 739 + (v - 4242);
    }
    return 721;                                                               // :48921 缺省泥球
  }

  /** 生成高尔夫球（Projectile.NewProjectile 721/739-752 族）：中心入参；
   *  同时执行 Projectile.cs:10313-10330 的自有球 >10 驱逐（timeLeft 最小者先杀） */
  private spawnGolfBall(cx: number, cy: number, projId: number, onTee: boolean,
    vx: number, vy: number): GolfBall {
    const balls: GolfBall[] = [];
    for (const e of this.entities.projectiles) {
      const b = e as GolfBall;
      if (b instanceof GolfBall && !b.dead && b.isMine) balls.push(b);
    }
    if (balls.length > 10) {                                                  // :10322-10330
      let oldest = balls[0];
      for (const b of balls) if (b.id < oldest.id) oldest = b;                // timeLeft 最小≈最早
      oldest.dead = true;
    }
    const own = this.player;
    const ball = new GolfBall(cx, cy, projId, () => own, onTee);
    ball.vx = vx; ball.vy = vy;
    this.entities.add(ball, 'projectiles');
    return ball;
  }

  /** 高尔夫哨 4095（Player.cs:42921-42924：itemAnimation==2 时 ResetGolfBall——
   *  球已离手则回退上一击点并 +1 杆罚；未动则无操作） */
  private useGolfWhistle(): void {
    this.golfState.resetGolfBall();                                           // GolfState.cs:162-173
  }

  /** 收竿结算（Player.cs:51530-51598 ItemCheck_CheckFishingBobber）：物品掉落 /
   *  血月敌怪（浮标处；618 +64px）/ 682 红城镇史莱姆一次性入镇 */
  private reelBobber(bobber: Bobber): void {
    const caught = bobber.reel(this);
    if (caught === -1) {
      // 松露虫咬钩收竿（PullBobber :51563-51576 → SpawnOnPlayer case 370 :81335-81353）：
      // Duke 落在浮标 Center 下方 100px + HasAwoken 公告
      const duke = Enemy.fromVanilla(370, bobber.cx, bobber.cy + 100);
      if (duke) {
        duke.x = bobber.cx - duke.w / 2;
        duke.y = bobber.cy + 100 - duke.h / 2;
        duke.despawnTimer = 15000;
        this.entities.add(duke, 'enemies');
        this.boss = duke;
        this.announceBossSummon(370);
      }
      this.cb.onInventoryChanged?.();
    } else if (caught > 0) {
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

  /** SpawnOnPlayer 等价（NPC.cs:81273-81506）：灯泡破坏召唤走此链——在玩家
   *  【屏幕外】找点（500 次尝试，最后一次强制落点），非地表顶部扫描；
   *  SpawnBoss 段 timeLeft×20=15000、AnyNPCs 独占、HasAwoken 公告。
   *  与 summonBoss(地表±55 列)的分野：物品召唤维持既有路径（后续统一迁移）。 */
  spawnBossOnPlayer(vanillaId: number): void {
    if (this.boss) { this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive')); return; }
    if (this.net && !this.net.policy.isHost) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossHostOnly'));
      return;
    }
    const st = this.world.store;
    const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
    const halfW = Math.ceil(this.camera.viewW / (this.camera.zoom || 1) / 2 / TILE) + 5;
    const halfH = Math.ceil(this.camera.viewH / (this.camera.zoom || 1) / 2 / TILE) + 5;
    let sx = ptx, sy = pty;
    for (let t = 0; t < 500; t++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      let tx = ptx + side * (halfW + Math.floor(Math.random() * 45));
      let ty = pty + Math.floor((Math.random() * 2 - 1) * (halfH + 45));
      if (t === 499) { tx = ptx + side * (halfW + 20); ty = pty; }   // 末次强制落点
      tx = Math.max(2, Math.min(st.w - 3, tx));
      ty = Math.max(4, Math.min(st.h - 10, ty));
      // 落点区块无实心（非安全点拒绝；强制落点例外）
      let blocked = t !== 499;
      if (blocked) {
        blocked = false;
        for (let ax = 0; ax <= 5 && !blocked; ax++) {
          for (let ay = 0; ay <= 5; ay++) {
            if (st.inBounds(tx + ax, ty + ay) && st.isSolid(tx + ax, ty + ay)) { blocked = true; break; }
          }
        }
      }
      if (!blocked) { sx = tx; sy = ty; break; }
    }
    const head = Enemy.fromVanilla(vanillaId, sx * TILE + 8, sy * TILE + 8);
    if (!head) return;
    head.despawnTimer = 15000;   // SpawnBoss timeLeft = activeTime(750)×20（NPC.cs:81485）
    this.entities.add(head, 'enemies');
    this.boss = head;
    this.announceBossSummon(vanillaId);
  }

  /** 机械美杜莎链召唤（NPC.SpawnMechQueen :19724-19750，奥库瑞姆剃刀 5334 专用）：
   *  mechQueen=-2 标记 → SpawnOnPlayer(127)（SpawnBoss :81469-81473 走 Start=100 专属
   *  分支 + LegacyMisc[107] "机械美杜莎已苏醒!"公告）→ 以其 Center 同点 NewNPC
   *  125/126/134（Start=1）+ 2×139 探针（ai2=毁灭者引用,ai3=∓1 侧位）。
   *  调用方已过双门（anyMechBossUp + Mechdusa 种子）。返回是否落位成功 */
  private summonMechdusa(): boolean {
    if (this.net && !this.net.policy.isHost) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossHostOnly'));
      return false;
    }
    const st = this.world.store;
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.max(2, Math.min(st.w - 3, Math.floor((this.player.cx + side * 55 * TILE) / TILE)));
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (st.type[st.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    // 链召唤（spawnMechQueenEnsemble = :19739-19748:queen 标记 + 同点伴随 + 探针挂链）
    const prime = spawnMechQueenEnsemble(this, tx * TILE + 8, spawnY);
    if (!prime) return false;
    prime.despawnTimer = 15000;   // SpawnBoss timeLeft = activeTime(750)×20（:81485）
    this.boss = prime;
    // 公告（SpawnBoss :81492-81496：127 且 mechQueen 命中 → misc[107]，非 HasAwoken）
    if (this.cb.onChat) this.cb.onChat(Lang.misc(107), 175, 75, 255);
    else this.cb.onToast(Lang.misc(107));
    return true;
  }

  /** Boss 同型家族表（"任意 Boss 活跃"门 → 同型门，审计 2026-08-13）：
   *  EoW {13,14,15} / BoC {266,267}——同型在场才拦（原版 Worm Food/Bloody Spine
   *  对已活 Boss 照召 SpawnOnPlayer :43107-43208 无门；本仓单 Boss 槽，
   *  跨型召唤放行、同型拦下防双刷）；未列出的 boss key 维持原"任意 Boss"门 */
  private static readonly BOSS_FAMILY: Record<string, number[]> = {
    eater_of_worlds_head: [13, 14, 15],
    brain_of_cthulhu: [266, 267],
  };

  /** 同型家族在场判定（NPC.AnyNPCs 族扫描） */
  private bossFamilyActive(family: number[]): boolean {
    return (this.entities.enemies as Enemy[]).some((e) => !e.dead
      && e.vanillaId != null && family.includes(e.vanillaId));
  }

  /** 召唤入口（物品使用默认带 Roar——ItemCheck_UseBossSpawners 语义；
   *  自然/剧情路径传 { roar: false }：原版生成瞬间无声，见 announceBossSummon 注） */
  summonBoss(key: string, opts: { roar?: boolean } = {}): boolean {
    const family = Game.BOSS_FAMILY[key];
    if (family) {
      if (this.bossFamilyActive(family)) {
        this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
        return false;
      }
    } else if (this.boss) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
      return false;
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    return this.summonBossAtTx(key, tx, opts.roar ?? true);
  }

  /** 指定落点列召唤(summonBoss 的位置化变体;守卫老人诅咒在地牢上空召唤骷髅王)。
   *  roar = 是否播召唤咆哮（物品召唤 true；自然/灯泡/诅咒等生成路径 false）。
   *  返回是否真的召唤成功（false = 门拦下/访客/落位失败）——召唤物消耗方据此决定扣不扣 */
  private summonBossAtTx(key: string, tx: number, roar = true): boolean {
    const family = Game.BOSS_FAMILY[key];
    if (family ? this.bossFamilyActive(family) : !!this.boss) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossActive'));
      return false;
    }
    // 联机访客不召唤（Boss 权威在房主——本地召唤=幽灵 Boss 不同步；召唤物也不消耗）
    if (this.net && !this.net.policy.isHost) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.BossHostOnly'));
      return false;
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
      : key === 'plantera' ? 262 : key === 'duke_fishron' ? 370 : key === 'moon_lord' ? 398 : key === 'golem' ? 245
      : key === 'deerclops' ? 668 : -1;
    // 血肉墙：走 SpawnWOF 1:1（NPC.cs:81112-81191，向导巫毒娃娃入熔岩的召唤链）。
    // 落位扫描/推进方向/公告全部以"娃娃位置"为种子——调试键以选中列 + 地狱层 Y
    // 充当娃娃；SpawnWOF 自带 HasAwoken 公告且不播 Roar（原版即无声，尖啸由
    // WOFTongue 见到玩家时播），故不落进下方 announceBossSummon
    if (vanillaId === 113) {
      const dollY = Math.min(st.h - 30, Math.floor(this.world.lavaLine || st.h - 200) + 5) * TILE;
      const wof = spawnWOF(this as unknown as GameHooks, tx * TILE + 8, dollY);
      if (wof) { this.boss = wof; return true; }
      return false;
    }
    if (vanillaId >= 0 && Enemy.fromVanilla) {
      const head = Enemy.fromVanilla(vanillaId, tx * TILE + 8, spawnY);
      if (head) {
        // 成就：MechaMayhem Clear（SpawnBoss NPC.cs:81470-81474——生成【前】扫描，
        // 场上无 Mech（Twins 需双眼同在）→ 重置三旗。126 由 125 召唤分支随带，
        // 125 命中即覆盖双子召唤）
        if (vanillaId === 125 || vanillaId === 127 || vanillaId === 134) {
          this.achievements.mechaMayhemClear(
            (this.entities.enemies as Enemy[]).filter((e) => !e.dead && e.vanillaId != null)
              .map((e) => e.vanillaId!));
        }
        this.entities.add(head, 'enemies');
        this.boss = head;
        if (vanillaId === 13) {
          // 世吞体节数（NPC.cs:51321-51328 GetEaterOfWorldsSegmentsCount + :51712）：
          // 头 ai[2]=65(普通)/70(专家) → 链 = 65/70 身段 + 1 尾（:51696-51761
          // ai[2] 逐段 -1，归零段转生尾 15）。spawnWormChain 的 count = 身段+尾
          const bodies = this.world.isExpert ? 70 : 65;
          const segs = Enemy.spawnWormChain(head, bodies + 1);
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
        // （血肉墙 113 已在上方 SpawnWOF 分支单独处理，不落通用路径）
        // 成就：MechaMayhem 启动判定（Mech 入场时扫描场上三机械是否齐备；
        // 126 由 125 召唤分支同帧入列，扫描读实体表自然包含）
        if (vanillaId === 125 || vanillaId === 127 || vanillaId === 134) {
          this.achievements.mechaMayhemStart(
            (this.entities.enemies as Enemy[]).filter((e) => !e.dead && e.vanillaId != null)
              .map((e) => e.vanillaId!));
        }
        // 召唤公告+（物品路径）咆哮（见 announceBossSummon 注释：roar 只在物品使用时播）
        this.announceBossSummon(vanillaId, roar);
        return true;
      }
    }
    this.spawnEnemy(key, tx * TILE + 8, spawnY);
    this.sfx.playWav('roar');
    this.cb.onToast(Lang.misc(9));
    return true;
  }

  /** 生成公告静默集（两组合并）：
   *  ① SpawnBoss switch case-break 组（NPC.cs:81505-81512）：50 史王 / 82 幽灵 /
   *    126 帕拉丁之眼(双子由 125 一次性公告) / 316 幽灵 / 551 Betsy / 662 海盗幽灵；
   *  ② 从不经 SpawnBoss 的生成路径（实际游戏永不公告）：68 地牢守卫（地牢入口
   *    刷怪链直接 NewNPC）/ 395 火星飞碟（事件刷怪链）/ 439 拜月教邪教徒（石碑
   *    仪式 NewNPC :38877）/ 396/397 月总头与手（核心 398 的 AI 生成）/
   *    664 火把神（小游戏结束演出 NewNPC）。
   *    398 经 SpawnBoss 同静默，但唯一生成路径 SpawnOnPlayer(:81358-81360)
   *    专项播 Enemies.MoonLord，单列。 */
  private static readonly BOSS_SPAWN_SILENT = new Set([50, 82, 126, 316, 551, 662, 68, 395, 439, 396, 397, 664]);

  /** 物品召唤咆哮集（ItemCheck_UseBossSpawners Player.cs:43080-43232 +
   *  石巨人能量电池祭坛 :32322——全表 SoundID 15 Roar，唯一例外 222 蜂后
   *  Item173 :43184。双子一次使用召 125+126 两体、咆哮一声）。生成路径
   *  （自然 roll/暗影珠/幼虫/老人诅咒/巫毒娃娃/松露虫/月总倒计时/踩死虹萤）
   *  原版全部无声——本集只作冻结对账锚（tests/boss-music-parity.test.ts）。 */
  static readonly BOSS_ITEM_SUMMON_ROAR = new Set([4, 13, 50, 125, 126, 127, 134, 222, 245, 266, 657, 668]);

  /** Boss 召唤公告（+可选咆哮）。文本 = SpawnBoss 末尾 switch（NPC.cs:81497-81513）：
   *  default → Announcement.HasAwoken（"{名}已苏醒！"）；125 双子专项 Lang.misc[48]；
   *  398 月总用 Enemies.MoonLord（SpawnOnPlayer :81358-81360，"月亮领主已苏醒！"）；
   *  静默集（50/82/126/316/551/662）无公告。颜色 ChatColors.BossOrEvent=(175,75,255)。
   *  ★音效与公告解耦（2026-08-14 对账）：原版 Roar 只在【物品使用】瞬间播
   *  （ItemCheck_UseBossSpawners Player.cs:43080-43232 + 石巨人祭坛 :32322 +
   *  事件物 :43246-43364）——生成路径（自然/灯泡/幼虫/老人诅咒/娃娃/浮标/月总
   *  倒计时/光女踩虫）全部无声，唯一例外 Item173=蜂后蜜蜂分泌物(:43184)。
   *  故 roar=true 仅由物品召唤点传入。 */
  private announceBossSummon(vanillaId: number, roar = false): void {
    const announce = (text: string) => {
      if (this.cb.onChat) this.cb.onChat(text, 175, 75, 255);
      else this.cb.onToast(text);
    };
    const kind = Game.bossSummonAnnounceKind(vanillaId);
    if (kind === 'misc48') {
      announce(Lang.misc(48));                              // 双子魔眼已苏醒！（misc[48]）
    } else if (kind === 'moonlord') {
      announce(Lang.text('Announcement.HasAwoken', Lang.text('Enemies.MoonLord')));
    } else if (kind === 'awoken') {
      const name = Lang.npcName(vanillaId) ?? vanillaNpc(vanillaId)?.name ?? '???';
      announce(Lang.text('Announcement.HasAwoken', name));
    }
    if (roar) this.sfx.playWav(vanillaId === 222 ? 'beeSummon' : 'roar');
  }

  /** Boss 生成公告类型（SpawnBoss switch NPC.cs:81492-81511 的纯函数化，
   *  供 tests/boss-music-parity.test.ts 冻结对账）：
   *  'misc48'  = 双子 125 专项（126 静默）
   *  'moonlord'= 398 月总（SpawnOnPlayer :81358-81360 → Enemies.MoonLord）
   *  'awoken'  = default → Announcement.HasAwoken（"{名}已苏醒！"）
   *  null      = 静默集（50/82/126/316/551/662 case-break） */
  static bossSummonAnnounceKind(vanillaId: number): 'misc48' | 'moonlord' | 'awoken' | null {
    if (vanillaId === 125) return 'misc48';
    if (vanillaId === 398) return 'moonlord';
    return Game.BOSS_SPAWN_SILENT.has(vanillaId) ? null : 'awoken';
  }

  /** @returns 是否真正消耗（被召唤门拦下/白天时不消耗物品） */
  useSuspiciousEye(): boolean {
    if (this.world.clock.isDay) {
      this.cb.onToast(Lang.text('Mods.SandboxWorld.Toast.NightOnly'));
      return false;
    }
    // SummonItemCheck（Player.cs:41514-41526）：物品 43 只查场上【是否已有 NPC 4】——
    // 与其他 Boss 是否在场无关（原版逐物品↔NPC 对照表 43↔4/70↔13/560↔50/…）。
    // 拦下时 ItemCheck 置 flag=false：物品不使用也不消耗。此前误用 this.boss 全 Boss 门
    // （其他 Boss 在场会白吞眼球）
    if (this.entities.enemies.some((en) => {
      const e2 = en as Enemy;
      return !e2.dead && e2.vanillaId === 4;
    })) return false;
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
    if (!e) return false;
    e.id = this.entities.nextId++;
    this.entities.add(e, 'enemies');
    this.boss = e;
    // 物品召唤（可疑眼球 43）：公告 + Roar（Player.cs:43095 PlaySound(15)）
    this.announceBossSummon(4, true);
    return true;
  }

  /** 地图传送：在目标点附近找可容纳主角的空间（2 格高净空 + 站立地面）。
   *  优先目标点自身，然后螺旋外扩到 24 格内就近安置 */
  /** 传送前贴图就位门:目标区域 ±160 类型扫描 → 预载 → 再落位。
   *  多数表已加载时扫描+命中检查 <10ms(无感);跨群系首传才真正等待加载 */
  /** 传送串行门(2026-08-14:调试快速连点地图=多个 teleportWhenReady 并发,
   *  反复相机跳转→chunk 集高频换血→画布分配/释放churn;在飞中忽略新目标) */
  private _tpInFlight = false;
  private async teleportWhenReady(tx: number, ty: number): Promise<void> {
    if (this._tpInFlight) return;
    this._tpInFlight = true;
    try {
      await this.teleportWhenReadyInner(tx, ty);
    } finally {
      this._tpInFlight = false;
    }
  }

  private async teleportWhenReadyInner(tx: number, ty: number): Promise<void> {
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
    // other=255（无凶手/无特定源）→ Slain（Lang.cs:1124-1126）
    const cause = p.lastDamageCause ?? { kind: 'slain' } as const;
    const deathText = createDeathText(this.playerName(), cause, this.world?.name ?? '');
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
   *  vi_71-74 单轨（本地 coin_* 双轨段已随退役移除） */
  coinsOwned(): number {
    const p = this.player;
    let total = 0;
    for (const s of p.inv.slots) {
      if (!s) continue;
      const ci = coinIndexOf(s.id);
      if (ci >= 0) total += s.stack * COIN_VALUES[ci];
    }
    return total;
  }

  /** 角色名（死亡文本/墓碑碑文用；未命名回退） */
  playerName(): string {
    return this.player.appearance?.name?.trim() || Lang.text('Mods.SandboxWorld.DefaultPlayerName');
  }

  /** 旗 buff：该 npc 是否被屏内旗覆盖（ItemID.Sets.BannerStrength 普通族） */
  bannerNpcActive(npcId: number): boolean { return this._bannerNpcs.has(npcId); }

  respawnPlayer() {
    const p = this.player;
    // 硬核角色已消亡（Player.cs:16894 difficulty==2 死亡后 ghost=true 不再重生；
    // 本仓最小集 = hardcoreDead 标记 → 不允许重生，死亡画面停留）
    if (p.appearance?.hardcoreDead) return;
    // Player.Spawn :37223-37235：pvpDeath → 满血 + immuneTime=300（5s）并清标记；
    // 否则 ReviveFromDeath 180t（Player.cs:37229-37235;旧 90t/1.5s）
    const wasPvpDeath = p.lastPvpDeath;
    p.lastPvpDeath = false;
    p.hp = p.maxHp;
    p.dead = false;
    p.iframes = wasPvpDeath ? 300 : 180;
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
    this.renderer._worldPaused = this.paused; // 暂停镜像:冻结天气物理/滤镜状态机
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
    // Main.netMode != 0 近似（DyeInitializer.cs:334 队伍发色剂单机恒白）
    this.renderer.netActive = !!this.net?.active;
    this.renderer.render(
      cam, this.world, this.world.clock, this.chunks,
      L.r, L.g, L.b, L.rx, L.ry, L.rw, L.rh,
      this.player,
      this.entities.all(),
      this.particles, this.dmgNumbers,
      this.swing, hover,
      // Boss 血条数据：EoW 族（13-15）走原版聚合条（EaterOfWorldsProgressBar
      // :29-45:全场段 HP 之和 ÷ 恒定分母 (段数+2)×150——打身体段总条同步降,
      // 锚死自动换段续显）,其余 boss 单锚 hp
      this.boss ? (() => {
        const bv = this.boss!.vanillaId ?? 0;
        const base = {
          name: this.boss!.vanillaId != null ? Lang.npcName(this.boss!.vanillaId) ?? this.boss!.def.name : this.boss!.def.name,
          cx: this.boss!.cx, cy: this.boss!.cy,
        };
        if (bv >= 13 && bv <= 15) {
          let hp = 0, segs = 0, denom = 0;
          for (const en of this.entities.enemies as Enemy[]) {
            const e = en as Enemy;
            if (e.dead || e.vanillaId == null || e.vanillaId < 13 || e.vanillaId > 15) continue;
            hp += Math.max(0, e.hp);
            segs++;
            denom = Math.max(denom, e.eowChainMax);
          }
          return { ...base, hp, maxHp: (denom || segs) * 150 };
        }
        return { ...base, hp: this.boss!.hp, maxHp: this.boss!.maxHp };
      })() : null,
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
      // 拴绳实体（锚桩 724 小动物 / 风筝桩 723 风筝）——Renderer 3.8 段绘制
      this.leashed,
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
            // msg82 module13 暂存冲放（同 H1 竞态：组装期 FullSync 若即用会被
            // afterWorldLoad → respawnAll 的 clear() 抹掉——实体永久丢失）。
            // 冲放后才开直通（leashedReady）——后续 PartialSync/Remove 不再进暂存
            net.drainPendingLeashed((msg) => this.netApplyLeashed(msg));
            net.leashedReady = true;
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
        // 拴绳实体（msg82 module13；世界就绪后直通——组装期帧在 pendingLeashed）
        onLeashedSync: (msg) => this.netApplyLeashed(msg),
        onItemOp: (op) => this.netApplyItemOp(op),
        onProjectileSync: (snaps) => this.netApplyProjSnaps(snaps),
        onProjDespawn: (ids) => this.netRemoveProjPuppets(ids),
        // onSSC 不再即用——msg201 改暂存（net.pendingSSC），loadWorld 完成后应用（终审 H1 竞态）
        onStrike: (netId, dmg, kbx, kby) => this.netApplyStrike(netId, dmg, kbx, kby),
        onStrikePlayer: (fromSlot, _targetSlot, dmg, _kbx, _kby, weaponId, flags) =>
          this.netApplyStrikePlayer(fromSlot, dmg, weaponId, flags),
        onHp: (slot, hp, maxHp) => {
          // ClientNet.msg16 已缓存进 RemotePlayerState；此处仅兜底（正常恒同步命中）
          const rp = net.players.get(slot);
          if (rp) { rp.hp = hp; rp.maxHp = maxHp; }
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
      // 拴绳实体（msg82 module13）：房主周期 PartialSync（= 原版 StreamNetUpdates
      // :461-467，每 1024t 逐实体）+ 锚格巡检（访客破坏的 tile 落格不触发房主破坏链，
      // 实体/记录须巡检兜底——见 netLeashedHostSweep）
      if (this.net.policy.isHost && this.tickCount % 64 === 0) this.netLeashedHostSweep();
      if (this.tickCount % 4 === 0) {
        if (this.net.policy.isHost) this.netNpcBroadcast();
        this.netProjBroadcast();
        this.netDropSweep();
      }
      if (this.tickCount % 30 === 0) this.netSweepPuppets();
      if (!this.net.policy.isHost) { this.netPuppetContact(); this.netPuppetProjContact(); }
      this.netPvpProjFeedback();
      // PvP 冷却递减（圣骑士盾独立槽近似 + 狱火光环 per-owner）
      if (this.player.paladinShieldCd > 0) this.player.paladinShieldCd--;
      for (const [k, v] of this.pvpAuraCd) {
        if (v <= 1) this.pvpAuraCd.delete(k);
        else this.pvpAuraCd.set(k, v - 1);
      }
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
      // PvP（v7）：hostile/team 拷入代理——命中链 InOpposingTeam 门禁与头顶血条消费；
      // hp/maxHp 为 msg16 中继的权威值（proxy 无 buff 同步，baseMaxHp 直写即可令
      // maxHp getter 吻合——头顶血条按 hp/maxHp 比例画）
      proxy.hostile = rp.hostile;
      proxy.team = rp.team;
      proxy.hp = rp.hp;
      proxy.baseMaxHp = Math.max(1, rp.maxHp);
      // R11'.外观合并：仅接受含 hair 的完整对象（空对象会令纸娃娃读 X.r 崩溃）。
      // review C10：仅在外观串变化时解析（msg4 才变）——60TPS×每玩家 JSON.parse 纯浪费
      {
        const meta = proxy as unknown as { __netAppearance?: string };
        if (meta.__netAppearance !== rp.appearance) {
          meta.__netAppearance = rp.appearance;
          try {
            const parsed = JSON.parse(rp.appearance) as Record<string, unknown>;
            if (parsed && typeof parsed.hair === 'number') proxy.appearance = parsed as never;
            // hairDye（msg4 外观 JSON 携带，2026-08-14）：Renderer.hairDyeRenderColor
            // 读 Player.hairDye → 远端发色实时生效；派对染发剂彩纸走代理
            // fixedUpdate（本地模拟同款 1/45 尘）自然同步
            if (parsed && typeof parsed.hairDye === 'number') proxy.hairDye = parsed.hairDye;
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
      // itemAnimation；此处派生等价 swing——时长按本地同公式，攻速配饰倍率取代理自身
      // equipStats（msg5 已同步远端盔甲/配饰，Player.attackSpeedMult = CapAttackSpeeds
      // 倒数档，Player.cs:28555-28574））
      if (!stale && rp.useItem) {
        const heldId = proxy.inv.heldItem()?.id ?? -1;
        if (!proxy.swingNet || proxy.swingNet.item !== heldId || proxy.swingNet.t <= 0) {
          const dur = this.remoteSwingDur(heldId, proxy);
          // useStyle/aim 与本地 useSwing 同构：远端 msg13 不带瞄准角，aim 取 0（正前方）——
          // 缺这两字段时 Renderer 退化为剑挥（远端喝药/开枪/举火把全错）
          const us = this.useStyleOfVid(heldId);
          proxy.swingNet = { t: dur, dur, item: heldId, useStyle: us, aim: us === 5 || us === 13 ? 0 : undefined };
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
   *  镐斧锤 max(14,speed)、其它 30；近战/工具分支除以代理自身 attackSpeedMult——
   *  远端盔甲/配饰经 msg5 已拷入代理背包，CapAttackSpeeds 倒数档同本地公式） */
  private remoteSwingDur(itemId: number, proxy?: Player): number {
    if (itemId < 0) return 30;
    const def = ITEM_DEFS[itemId];
    if (!def) return 30;
    const spd = proxy ? proxy.attackSpeedMult : 1;
    if (def.tool?.type === 'sword' || combatWeapon(def)?.kind === 'melee') {
      const cw = combatWeapon(def);
      return Math.max(12, Math.round((cw?.useTime ?? def.tool?.speed ?? 42) / spd));
    }
    if (def.tool && (def.tool.type === 'pick' || def.tool.type === 'axe' || def.tool.type === 'hammer')) {
      return Math.max(14, Math.round((def.tool.speed ?? 46) / spd));
    }
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

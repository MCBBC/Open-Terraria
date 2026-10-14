// mod 全域注册表 teardown(★D11 热重载,2026-10-14)——启停/装卸后免整页 reload。
// 形态:unloadModsForHotReload() 一口清全部 mod 域注册表+数据表 mod 段,随后
// loadModsPhase1() 重跑=全新分配。与 _reset*ForTests 家族的区别:teardown 是
// 【生产语义】——世界/游戏实例不动(mod 数据面在世界里已实例化的部分[TE state/
// 已放 tile]由下一批语义决定:启停=占位降级;★R-C-F5 勘误(2026-10-14):「存档键保留(重启用=恢复)」仅当缺 mod
//  期间【从未存档】成立——进世界即 autosave=物品/TE/tile 三面洗档不可逆(tML
//  UnloadedItem 占位语义,本仓归 0=既有语义非本批引入;缺 mod 存档警告面=登记)。
// 清偿面(哨兵清单,D11 债):
//   hooks 15 表/buffs/music/rarity/pets/gore/walls/mounts*/hairs*/dusts/
//   tileEntities/modAchievements/infoDisplay/kbdNav/ui(panels)/drawspecs/
//   数据表:ITEM_DEFS 30000+ 洞化+byKey mod_ 前缀摘/TILE_BY_KEY+WALL_DEFS 367+/
//   VANILLA_NPCS 800+/TOWN_NPC_IDS mod 段/equip overlay/shops/recipes/armorSets/
//   biomeFlags/bestiary entryCache/sceneMetrics 域注册面
//   *mounts/hairs 的 countMax 顶:重置回原版常量(重装载时 bump 回来)
import { _resetModHooksForTests } from './hooks';
import { _resetModBuffsForTests } from './buffs';
import { _resetModMusicForTests } from './music';
import { _resetModRarityForTests } from './rarity';
import { _resetModPetsForTests } from './pets';
import { _resetModGoreForTests } from './gore';
import { _resetModWallsForTests } from './walls';
import { _resetModDustsForTests } from './dusts';
import { _resetModTEsForTests } from './tileEntities';
import { _resetModAchievementsForTests } from './modAchievements';
import { _resetModInfoDisplaysForTests } from './infoDisplay';
import { _resetModKbdNavForTests } from './kbdNav';
import { _resetModUiForTests } from './ui';
import { _resetModLoaderForTests } from './loader';
import { _resetModEquipKindsForTests } from '../data/vanillaEquip';
import { _resetModHairsForTests } from './hairs';
import { _resetModMountsForTests } from './mounts';
import { _resetModDrawSpecsForTests } from './drawspecs';
import { _resetModShopsForTests } from './shops';
import { _resetModRecipesForTests } from '../data/vanillaRecipes';
import { _resetModSummonEntriesForTests } from '../core/DebugSummonPanel';
import { _resetModBossRegForTests } from '../entities/Enemy';
import { _resetModBiomeFlagsForTests } from '../world/SceneMetrics';
import { _resetBestiaryEntryCacheForTests } from '../data/Bestiary';
import { _resetModAchDefsForTests } from '../core/Achievements';
import { Game } from '../core/Game';
// ★红队第七轮 M1/M2/M4 清偿面
import { _resetModTilesForTests } from '../data/tiles';
import { _resetModNpcRulesForTests } from '../drops/NpcDrops';
import { _resetModSpawnRulesForTests } from '../world/spawn/VanillaSpawner';
import { _resetPendingBiomeFlagsForTests, } from './register';
import { _resetModArmorSetsForTests } from '../data/vanillaArmorSets';
import { _resetModStatsForTests } from '../data/vanillaItemStats';
import { _resetModItemFuncForTests } from '../data/vanillaItemFunc';
import { _resetModCombatForTests } from '../data/vanillaItemCombat';
import { _resetModWingStatsForTests } from '../data/vanillaWingStats';
import { _resetModResearchForTests } from '../stats/Research';
import { _resetModItemToMountForTests } from '../entities/Mounts';
import { _resetModTownNpcRegForTests } from '../data/vanillaNpcs';
import { _resetModBuffReverseForTests } from '../stats/Buffs';
import { _resetLiveModConfigsForTests } from './config';
import { _resetModPortraitsForTests } from '../data/npcPortraits';
import { _resetModKeybindsForTests } from '../core/Keybinds';
import { _resetModRecipeSideTablesForTests } from '../data/vanillaRecipes';
import { ITEM_DEFS, ITEM_BY_KEY, ITEM_INTERNAL_OF_STABLE } from '../data/items';
import { TILE_BY_KEY, TILE_DEFS, WALL_DEFS, WALL_BY_KEY } from '../data/tiles';
import { VANILLA_NPCS, TOWN_NPC_IDS } from '../data/vanillaNpcs';
import { MOD_ITEM_STABLE_BASE, MOD_WALL_STABLE_BASE } from './types';

/** 数据表 teardown:mod 段洞化/摘键。幂等。 */
function teardownDataTables(): void {
  // 物品:30000+ 洞化 + byKey mod_ 前缀摘 + 稳定映射摘
  for (let i = MOD_ITEM_STABLE_BASE; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (d?.key?.startsWith('mod_')) {
      delete ITEM_BY_KEY[d.key];
      ITEM_INTERNAL_OF_STABLE.delete(i);
      ITEM_DEFS[i] = undefined as never;
    }
  }
  // tile:mod 段(1030+ 段由 TILE_STABLE 域约定;按 key 前缀摘更稳)
  for (const [k, id] of Object.entries(TILE_BY_KEY)) {
    if (k.startsWith('mod_')) { delete TILE_BY_KEY[k]; if (TILE_DEFS[id]) TILE_DEFS[id] = undefined as never; }
  }
  // 墙:367+ 清
  for (let i = MOD_WALL_STABLE_BASE; i < WALL_DEFS.length; i++) {
    const w = WALL_DEFS[i];
    if (w) { delete WALL_BY_KEY[w.key]; WALL_DEFS[i] = undefined as never; }
  }
  // NPC:800+ 清 + 城镇 mod 段 + 头贴索引段
  for (const k of Object.keys(VANILLA_NPCS)) {
    if (Number(k) >= 800) delete VANILLA_NPCS[k];
  }
  for (const k of Object.keys(TOWN_NPC_IDS)) {
    if (String(TOWN_NPC_IDS[k]!.id).length >= 3 && TOWN_NPC_IDS[k]!.id >= 800) delete TOWN_NPC_IDS[k];
  }
}

/** 一口 teardown(D11:装卸/启停沿调,随后 loadModsPhase1 重跑) */
export function unloadModsForHotReload(): void {
  teardownDataTables();
  _resetModHooksForTests();
  _resetModBuffsForTests();
  _resetModMusicForTests();
  _resetModRarityForTests();
  _resetModPetsForTests();
  _resetModGoreForTests();
  _resetModWallsForTests();
  _resetModDustsForTests();
  _resetModTEsForTests();
  _resetModAchievementsForTests();
  _resetModInfoDisplaysForTests();
  _resetModKbdNavForTests();
  _resetModUiForTests();
  _resetModEquipKindsForTests();
  _resetModHairsForTests();   // 内部含 _hairCountMax=228 重置
  _resetModMountsForTests();  // MOUNT_DATA 66+ 段+countMax 顶
  _resetModDrawSpecsForTests();
  _resetModShopsForTests();
  _resetModRecipesForTests();
  _resetModSummonEntriesForTests();
  _resetModBossRegForTests();
  _resetModBiomeFlagsForTests();
  // ★红队第七轮 M1/M2/M4(tile 域/push 面/旁表五域+town npc 五面)
  _resetModTilesForTests();
  _resetModNpcRulesForTests();
  _resetModSpawnRulesForTests();
  _resetPendingBiomeFlagsForTests();
  _resetModArmorSetsForTests();
  _resetModStatsForTests();
  _resetModItemFuncForTests();
  _resetModCombatForTests();
  _resetModWingStatsForTests();
  _resetModResearchForTests();
  _resetModItemToMountForTests();
  _resetModTownNpcRegForTests();
  // ★R-A-Me3/Me4:buff 反查/活配置实例(旧=幽灵 buff/幽灵配置项)
  _resetModBuffReverseForTests();
  _resetLiveModConfigsForTests();
  // ★R-A-Low 族:portraits/keybinds/配方旁表
  _resetModPortraitsForTests();
  _resetModKeybindsForTests();
  _resetModRecipeSideTablesForTests();
  // 引擎侧缓存哨兵(D11 清单)
  _resetModAchDefsForTests();
  _resetBestiaryEntryCacheForTests();
  Game._resetPetBuffKindCachesForTests();
  _resetModLoaderForTests();
}

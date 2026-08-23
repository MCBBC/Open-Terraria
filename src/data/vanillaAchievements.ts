// 原版成就注册表 1:1（AchievementInitializer.cs;1456/1457 同值——1457 无成就系统变更）。
// 条件语义（AchievementInitializer.cs AddCondition/AddConditions）：
//   flag(name)          CustomFlagCondition.Create(name) —— HandleSpecialEvent/装备检查置位
//   int(name, v)        CustomIntCondition.Create(name, v) —— 计数 ≥ v 完成
//   float(name, v)      CustomFloatCondition.Create(name, v) —— 浮点累计 ≥ v
//   pickup(ids...)      ItemPickupCondition.Create(ids) —— 任一 id 拾取即完成
//   craft(ids...)       ItemCraftCondition.Create(ids) —— 任一 id 合成即完成
//   killed(ids...)      NPCKilledCondition.Create(ids) —— 任一 id 击杀即完成
//   killedMany(ids...)  NPCKilledCondition.CreateMany(ids) —— 每个 id 独立条件，全击杀完成
//   prog(n)             ProgressionEventCondition.Create(n) —— 事件 n 触发即完成
//   destroyed(ids...)   TileDestroyedCondition.Create(ids) —— 任一 tile id 破坏即完成
// 成就完成 = 全部条件完成。killedMany 逐 id 追踪（STAR_DESTROYER/GELATIN_WORLD_TOUR 族）。

export type AchCondKind =
  | 'flag' | 'int' | 'float'
  | 'itemCraft' | 'itemPickup' | 'npcKilled' | 'progressionEvent' | 'tileDestroyed';

export interface AchCondDef {
  kind: AchCondKind;
  /** 条件名（CustomFlag/Int/Float 的 name；其余恒 null） */
  name: string | null;
  /** id 集（itemCraft/itemPickup/npcKilled/tileDestroyed） */
  ids?: number[];
  /** int/float 阈值 */
  value?: number;
  /** npcKilled 的 CreateMany：逐 id 独立条件全完成 */
  many?: boolean;
}

export interface AchDef {
  name: string;
  conditions: AchCondDef[];
  category: number;   // 0=Slayer 1=Collector 2=Explorer 3=Challenger（-1=NoCategory）
}

const flag = (name: string): AchCondDef => ({ kind: 'flag', name });
const intC = (name: string, value: number): AchCondDef => ({ kind: 'int', name, value });
const floatC = (name: string, value: number): AchCondDef => ({ kind: 'float', name, value });
const pickup = (...ids: number[]): AchCondDef => ({ kind: 'itemPickup', name: null, ids });
const craft = (...ids: number[]): AchCondDef => ({ kind: 'itemCraft', name: null, ids });
const killed = (...ids: number[]): AchCondDef => ({ kind: 'npcKilled', name: null, ids });
const killedMany = (...ids: number[]): AchCondDef => ({ kind: 'npcKilled', name: null, ids, many: true });
const prog = (n: number): AchCondDef => ({ kind: 'progressionEvent', name: null, ids: [n] });
const destroyed = (...ids: number[]): AchCondDef => ({ kind: 'tileDestroyed', name: null, ids });

/** AchievementCategory（UIAchievementsMenu.cs:115-119 映射） */
export const ACH_CATEGORY = { Slayer: 0, Collector: 1, Explorer: 2, Challenger: 3, NoCategory: -1 } as const;

/** ItemID.Sets.Workbenches（ItemID.cs:1200，44 项）——BENCHED 条件 id 集 */
export const WORKBENCH_ITEMS = [
  36, 635, 636, 637, 673, 811, 812, 813, 814, 815,
  916, 1145, 1398, 1401, 1404, 1461, 1511, 1795, 1817, 2229,
  2251, 2252, 2253, 2534, 2631, 2632, 2633, 2826, 3156, 3157,
  3158, 3909, 3910, 3949, 3975, 4163, 4184, 4205, 4226, 4315,
  4584, 5166, 5187, 5208,
];

type RawDef = [name: string, conditions: AchCondDef[]];

// ---- 注册（AchievementInitializer.cs:16-445 原序） ----
const RAW: RawDef[] = [
  ['TIMBER', [pickup(9, 619, 2504, 620, 2503, 2260, 621, 911, 1729, 5215)]],
  ['BENCHED', [craft(...WORKBENCH_ITEMS)]],
  ['NO_HOBO', [prog(8)]],
  ['OBTAIN_HAMMER', [pickup(2775, 2746, 5283, 3505, 654, 3517, 7, 3493, 2780, 1513, 2516, 660, 3481, 657, 922, 3511, 2785, 3499, 3487, 196, 367, 104, 797, 2320, 787, 1234, 1262, 3465, 204, 217, 1507, 3524, 3522, 3525, 3523, 4317, 1305)]],
  ['OOO_SHINY', [destroyed(7, 6, 9, 8, 166, 167, 168, 169, 22, 204, 58, 107, 108, 111, 221, 222, 223, 211)]],
  ['HEART_BREAKER', [destroyed(12)]],
  ['HEAVY_METAL', [pickup(35, 716)]],
  ['I_AM_LOOT', [flag('Peek')]],
  ['STAR_POWER', [flag('Use')]],
  ['HOLD_ON_TIGHT', [flag('Equip')]],
  ['EYE_ON_YOU', [killed(4)]],
  ['SMASHING_POPPET', [prog(7)]],
  ['WORM_FODDER', [killed(13, 14, 15)]],
  ['MASTERMIND', [killed(266)]],
  ['WHERES_MY_HONEY', [flag('Reach')]],
  ['STING_OPERATION', [killed(222)]],
  ['BONED', [killed(35)]],
  ['DUNGEON_HEIST', [pickup(327), prog(19)]],
  ['ITS_GETTING_HOT_IN_HERE', [flag('Reach')]],
  ['MINER_FOR_FIRE', [craft(122)]],
  ['STILL_HUNGRY', [killed(113, 114)]],
  ['ITS_HARD', [prog(9)]],
  ['BEGONE_EVIL', [prog(6)]],
  ['EXTRA_SHINY', [destroyed(107, 108, 111, 221, 222, 223)]],
  ['HEAD_IN_THE_CLOUDS', [flag('Equip')]],
  ['LIKE_A_BOSS', [pickup(1133, 1331, 1307, 267, 1293, 5334, 557, 544, 556, 560, 43, 70, 3601, 5120, 4961, 4988, 2673)]],
  ['BUCKETS_OF_BOLTS', [killed(125, 126), killedMany(127, 134)]],
  ['DRAX_ATTAX', [craft(579, 990)]],
  ['PHOTOSYNTHESIS', [destroyed(211)]],
  ['GET_A_LIFE', [flag('Use')]],
  ['THE_GREAT_SOUTHERN_PLANTKILL', [killed(262)]],
  ['TEMPLE_RAIDER', [prog(22)]],
  ['LIHZAHRDIAN_IDOL', [killed(245)]],
  ['ROBBING_THE_GRAVE', [pickup(1513, 938, 963, 977, 1300, 1254, 1514, 679, 759, 1446, 1445, 1444, 1183, 1266, 671, 3291, 4679, 4789)]],
  ['BIG_BOOTY', [prog(20)]],
  ['FISH_OUT_OF_WATER', [killed(370)]],
  ['OBSESSIVE_DEVOTION', [killed(439)]],
  ['STAR_DESTROYER', [killedMany(517, 422, 507, 493)]],
  ['CHAMPION_OF_TERRARIA', [killed(398)]],
  ['BLOODBATH', [prog(5)]],
  ['SLIPPERY_SHINOBI', [killed(50)]],
  ['GOBLIN_PUNTER', [prog(10)]],
  ['WALK_THE_PLANK', [prog(11)]],
  ['KILL_THE_SUN', [prog(3)]],
  ['DO_YOU_WANT_TO_SLAY_A_SNOWMAN', [prog(12)]],
  ['TIN_FOIL_HATTER', [prog(13)]],
  ['BALEFUL_HARVEST', [prog(15)]],
  ['ICE_SCREAM', [prog(14)]],
  ['STICKY_SITUATION', [prog(16)]],
  ['REAL_ESTATE_AGENT', [prog(17)]],
  ['NOT_THE_BEES', [flag('Use')]],
  ['JEEPERS_CREEPERS', [flag('Reach')]],
  ['FUNKYTOWN', [flag('Reach')]],
  ['INTO_ORBIT', [flag('Reach')]],
  ['ROCK_BOTTOM', [flag('Reach')]],
  ['MECHA_MAYHEM', [prog(21)]],
  ['GELATIN_WORLD_TOUR', [killedMany(-5, -6, 1, 81, 71, -3, 147, 138, -10, 50, 59, 16, -7, 244, -8, -1, -2, 184, 204, 225, -9, 141), killed(183, -24, -25), killed(-4)]],
  ['FASHION_STATEMENT', [flag('Equip')]],
  ['VEHICULAR_MANSLAUGHTER', [flag('Hit')]],
  ['BULLDOZER', [intC('Pick', 10000)]],
  ['THERE_ARE_SOME_WHO_CALL_HIM', [killed(45)]],
  ['DECEIVER_OF_FOOLS', [killed(196)]],
  ['SWORD_OF_THE_HERO', [pickup(757)]],
  ['LUCKY_BREAK', [flag('Hit')]],
  ['THROWING_LINES', [flag('Use')]],
  ['DYE_HARD', [flag('Equip')]],
  ['SICK_THROW', [pickup(3389)]],
  ['FREQUENT_FLYER', [floatC('Pay', 10000)]],
  ['THE_CAVALRY', [flag('Equip')]],
  ['COMPLETELY_AWESOME', [pickup(98)]],
  ['TIL_DEATH', [killed(53)]],
  ['ARCHAEOLOGIST', [killed(52)]],
  ['PRETTY_IN_PINK', [killed(-4)]],
  ['RAINBOWS_AND_UNICORNS', [flag('Use')]],
  ['YOU_AND_WHAT_ARMY', [flag('Spawn')]],
  ['PRISMANCER', [pickup(495)]],
  ['IT_CAN_TALK', [prog(18)]],
  ['WATCH_YOUR_STEP', [flag('Hit')]],
  ['MARATHON_MEDALIST', [floatC('Move', 1106688)]],
  ['GLORIOUS_GOLDEN_POLE', [pickup(2294)]],
  ['SERVANT_IN_TRAINING', [flag('Finish')]],
  ['GOOD_LITTLE_SLAVE', [intC('Finish', 10)]],
  ['TROUT_MONKEY', [intC('Finish', 25)]],
  ['FAST_AND_FISHIOUS', [intC('Finish', 50)]],
  ['SUPREME_HELPER_MINION', [intC('Finish', 200)]],
  ['TOPPED_OFF', [flag('Use')]],
  ['SLAYER_OF_WORLDS', [killed(13, 14, 15), killed(113, 114), killed(125, 126), killedMany(4, 266, 35, 50, 222, 134, 127, 262, 245, 439, 398, 370)]],
  ['YOU_CAN_DO_IT', [prog(1)]],
  ['MATCHING_ATTIRE', [flag('Equip')]],
  ['DEFEAT_EMPRESS_OF_LIGHT', [killed(636)]],
  ['DEFEAT_QUEEN_SLIME', [killed(657)]],
  ['DEFEAT_DREADNAUTILUS', [killed(618)]],
  ['DEFEAT_OLD_ONES_ARMY_TIER3', [prog(23)]],
  ['GET_ZENITH', [pickup(4956)]],
  ['GET_TERRASPARK_BOOTS', [pickup(5000)]],
  ['FLY_A_KITE_ON_A_WINDY_DAY', [flag('Use')]],
  ['FOUND_GRAVEYARD', [flag('Reach')]],
  ['GO_LAVA_FISHING', [flag('Do')]],
  ['TURN_GNOME_TO_STATUE', [prog(24)]],
  ['TALK_TO_NPC_AT_MAX_HAPPINESS', [flag('Do')]],
  ['PET_THE_PET', [flag('Do')]],
  ['FIND_A_FAIRY', [flag('Do')]],
  ['THROW_A_PARTY', [prog(25)]],
  ['DIE_TO_DEAD_MANS_CHEST', [flag('Do')]],
  ['DEFEAT_DEERCLOPS', [killed(668)]],
  ['GET_GOLDEN_DELIGHT', [pickup(4022)]],
  ['DRINK_BOTTLED_WATER_WHILE_DROWNING', [flag('Use')]],
  ['GET_CELL_PHONE', [pickup(3124)]],
  ['GET_ANKH_SHIELD', [pickup(1613)]],
  ['GAIN_TORCH_GODS_FAVOR', [flag('Use')]],
  ['PLAY_ON_A_SPECIAL_SEED', [flag('Do')]],
  ['ALL_TOWN_SLIMES', [prog(26)]],
  ['TRANSMUTE_ITEM', [prog(27)]],
  ['PURIFY_ENTIRE_WORLD', [flag('Do')]],
  ['TO_INFINITY_AND_BEYOND', [flag('Do')]],
  ['BOOK_WORM', [prog(29)]],
  ['BOULDER_LORD', [prog(30)]],
  ['QUEEN_MACHINE', [prog(31)]],
  ['ROLLIN_IN_YOUR_GRAVE', [prog(32)]],
  ['FEAR_THE_SUN', [prog(33)]],
  ['ITS_SHALING_OUTSIDE', [prog(34)]],
  ['EXTRA_LIFE', [prog(35)]],
  ['GRAVE_MISTAKE', [prog(36)]],
  ['SPICY_LICKS', [prog(37)]],
  ['ORGANIZED_CHAOS', [pickup(1326)]],
  ['ON_FLEEK', [prog(38)]],
  ['FORTUNE_FAVORS_THE_BOULD', [prog(39)]],
  ['TRAINING_DAY', [prog(40)]],
  ['MINI_ME', [prog(41)]],
  ['TERRARIST', [prog(42)]],
  ['NEW_DIGS', [prog(43)]],
  ['MY_PEOPLE_NEED_ME', [prog(44)]],
  ['GOING_OLDSCHOOL', [flag('Do')]],
  ['SEA_YOU_LATER', [pickup(5358)]],
  ['TRASH_COMPACTOR', [prog(45)]],
  ['CONSERVATIONIST', [intC('Do', 100)]],
  ['INTERDIMENSIONAL_RECYCLING', [prog(46)]],
];

// ---- 类别注册（AchievementInitializer.cs:582-737 原序） ----
const SLAYER = [
  'EYE_ON_YOU', 'SLIPPERY_SHINOBI', 'WORM_FODDER', 'MASTERMIND', 'STING_OPERATION',
  'DEFEAT_DEERCLOPS', 'BONED', 'STILL_HUNGRY', 'DEFEAT_DREADNAUTILUS', 'DEFEAT_QUEEN_SLIME',
  'BUCKETS_OF_BOLTS', 'THE_GREAT_SOUTHERN_PLANTKILL', 'LIHZAHRDIAN_IDOL', 'FISH_OUT_OF_WATER',
  'DEFEAT_EMPRESS_OF_LIGHT', 'OBSESSIVE_DEVOTION', 'STAR_DESTROYER', 'CHAMPION_OF_TERRARIA',
  'GOBLIN_PUNTER', 'DO_YOU_WANT_TO_SLAY_A_SNOWMAN', 'WALK_THE_PLANK', 'BALEFUL_HARVEST',
  'ICE_SCREAM', 'TIN_FOIL_HATTER', 'DEFEAT_OLD_ONES_ARMY_TIER3', 'TIL_DEATH',
  'THERE_ARE_SOME_WHO_CALL_HIM', 'ARCHAEOLOGIST', 'PRETTY_IN_PINK', 'DECEIVER_OF_FOOLS',
  'VEHICULAR_MANSLAUGHTER',
];
const EXPLORER = [
  'SMASHING_POPPET', 'BEGONE_EVIL', 'FOUND_GRAVEYARD', 'ITS_HARD', 'FUNKYTOWN',
  'WATCH_YOUR_STEP', 'YOU_CAN_DO_IT', 'BLOODBATH', 'KILL_THE_SUN', 'STICKY_SITUATION',
  'ITS_SHALING_OUTSIDE', 'NO_HOBO', 'IT_CAN_TALK', 'TRAINING_DAY', 'HEART_BREAKER',
  'I_AM_LOOT', 'ROBBING_THE_GRAVE', 'GET_A_LIFE', 'FIND_A_FAIRY', 'TRANSMUTE_ITEM',
  'FORTUNE_FAVORS_THE_BOULD', 'JEEPERS_CREEPERS', 'WHERES_MY_HONEY', 'DUNGEON_HEIST',
  'BIG_BOOTY', 'ITS_GETTING_HOT_IN_HERE', 'INTO_ORBIT', 'ROCK_BOTTOM', 'OOO_SHINY',
  'EXTRA_SHINY', 'PHOTOSYNTHESIS', 'PLAY_ON_A_SPECIAL_SEED',
];
const CHALLENGER = [
  'GELATIN_WORLD_TOUR', 'SLAYER_OF_WORLDS', 'REAL_ESTATE_AGENT', 'ALL_TOWN_SLIMES',
  'YOU_AND_WHAT_ARMY', 'TOPPED_OFF', 'MECHA_MAYHEM', 'BULLDOZER', 'PURIFY_ENTIRE_WORLD',
  'QUEEN_MACHINE', 'TRASH_COMPACTOR', 'BOOK_WORM', 'BOULDER_LORD', 'NOT_THE_BEES',
  'FLY_A_KITE_ON_A_WINDY_DAY', 'DIE_TO_DEAD_MANS_CHEST', 'GO_LAVA_FISHING',
  'RAINBOWS_AND_UNICORNS', 'THROWING_LINES', 'TURN_GNOME_TO_STATUE',
  'TALK_TO_NPC_AT_MAX_HAPPINESS', 'FREQUENT_FLYER', 'LUCKY_BREAK', 'MARATHON_MEDALIST',
  'PET_THE_PET', 'THROW_A_PARTY', 'DRINK_BOTTLED_WATER_WHILE_DROWNING',
  'TO_INFINITY_AND_BEYOND', 'ROLLIN_IN_YOUR_GRAVE', 'FEAR_THE_SUN', 'EXTRA_LIFE',
  'GRAVE_MISTAKE', 'MY_PEOPLE_NEED_ME', 'TERRARIST', 'SPICY_LICKS', 'GOING_OLDSCHOOL',
  'CONSERVATIONIST', 'INTERDIMENSIONAL_RECYCLING', 'SERVANT_IN_TRAINING',
  'GOOD_LITTLE_SLAVE', 'TROUT_MONKEY', 'FAST_AND_FISHIOUS', 'SUPREME_HELPER_MINION',
];
const COLLECTOR = [
  'OBTAIN_HAMMER', 'BENCHED', 'HEAVY_METAL', 'STAR_POWER', 'GET_GOLDEN_DELIGHT',
  'MINER_FOR_FIRE', 'HEAD_IN_THE_CLOUDS', 'GET_TERRASPARK_BOOTS', 'GET_CELL_PHONE',
  'GET_ANKH_SHIELD', 'DRAX_ATTAX', 'PRISMANCER', 'SWORD_OF_THE_HERO', 'GET_ZENITH',
  'SEA_YOU_LATER', 'HOLD_ON_TIGHT', 'THE_CAVALRY', 'DYE_HARD', 'MATCHING_ATTIRE',
  'FASHION_STATEMENT', 'ON_FLEEK', 'MINI_ME', 'COMPLETELY_AWESOME', 'NEW_DIGS', 'TIMBER',
  'SICK_THROW', 'GLORIOUS_GOLDEN_POLE', 'TEMPLE_RAIDER', 'LIKE_A_BOSS', 'ORGANIZED_CHAOS',
];

// ---- 图标序（AchievementInitializer.cs:444-545 RegisterIconIndex num++ 原序） ----
export const ACH_ICON_ORDER = [
  'TIMBER', 'NO_HOBO', 'OBTAIN_HAMMER', 'HEART_BREAKER', 'OOO_SHINY', 'HEAVY_METAL',
  'I_AM_LOOT', 'STAR_POWER', 'HOLD_ON_TIGHT', 'EYE_ON_YOU', 'SMASHING_POPPET',
  'WORM_FODDER', 'MASTERMIND', 'WHERES_MY_HONEY', 'STING_OPERATION', 'BONED',
  'DUNGEON_HEIST', 'ITS_GETTING_HOT_IN_HERE', 'MINER_FOR_FIRE', 'STILL_HUNGRY',
  'ITS_HARD', 'BEGONE_EVIL', 'EXTRA_SHINY', 'HEAD_IN_THE_CLOUDS', 'LIKE_A_BOSS',
  'BUCKETS_OF_BOLTS', 'DRAX_ATTAX', 'PHOTOSYNTHESIS', 'GET_A_LIFE',
  'THE_GREAT_SOUTHERN_PLANTKILL', 'TEMPLE_RAIDER', 'LIHZAHRDIAN_IDOL', 'ROBBING_THE_GRAVE',
  'BIG_BOOTY', 'FISH_OUT_OF_WATER', 'OBSESSIVE_DEVOTION', 'STAR_DESTROYER',
  'CHAMPION_OF_TERRARIA', 'BLOODBATH', 'GOBLIN_PUNTER', 'KILL_THE_SUN', 'WALK_THE_PLANK',
  'DO_YOU_WANT_TO_SLAY_A_SNOWMAN', 'TIN_FOIL_HATTER', 'BALEFUL_HARVEST', 'ICE_SCREAM',
  'SLIPPERY_SHINOBI', 'STICKY_SITUATION', 'REAL_ESTATE_AGENT', 'NOT_THE_BEES',
  'JEEPERS_CREEPERS', 'FUNKYTOWN', 'INTO_ORBIT', 'ROCK_BOTTOM', 'MECHA_MAYHEM',
  'GELATIN_WORLD_TOUR', 'FASHION_STATEMENT', 'VEHICULAR_MANSLAUGHTER', 'BULLDOZER',
  'THERE_ARE_SOME_WHO_CALL_HIM', 'DECEIVER_OF_FOOLS', 'SWORD_OF_THE_HERO', 'LUCKY_BREAK',
  'THROWING_LINES', 'DYE_HARD', 'FREQUENT_FLYER', 'THE_CAVALRY', 'COMPLETELY_AWESOME',
  'TIL_DEATH', 'ARCHAEOLOGIST', 'PRETTY_IN_PINK', 'RAINBOWS_AND_UNICORNS',
  'YOU_AND_WHAT_ARMY', 'PRISMANCER', 'IT_CAN_TALK', 'WATCH_YOUR_STEP', 'MARATHON_MEDALIST',
  'GLORIOUS_GOLDEN_POLE', 'SERVANT_IN_TRAINING', 'GOOD_LITTLE_SLAVE', 'TROUT_MONKEY',
  'FAST_AND_FISHIOUS', 'SUPREME_HELPER_MINION', 'TOPPED_OFF', 'SLAYER_OF_WORLDS',
  'YOU_CAN_DO_IT', 'SICK_THROW', 'MATCHING_ATTIRE', 'BENCHED', 'DEFEAT_QUEEN_SLIME',
  'DEFEAT_EMPRESS_OF_LIGHT', 'GET_ZENITH', 'FIND_A_FAIRY', 'DEFEAT_DREADNAUTILUS',
  'DEFEAT_OLD_ONES_ARMY_TIER3', 'FLY_A_KITE_ON_A_WINDY_DAY', 'TURN_GNOME_TO_STATUE',
  'TALK_TO_NPC_AT_MAX_HAPPINESS', 'GET_TERRASPARK_BOOTS', 'THROW_A_PARTY', 'PET_THE_PET',
  'GO_LAVA_FISHING', 'FOUND_GRAVEYARD', 'DIE_TO_DEAD_MANS_CHEST', 'DEFEAT_DEERCLOPS',
  'GET_GOLDEN_DELIGHT', 'DRINK_BOTTLED_WATER_WHILE_DROWNING', 'GET_CELL_PHONE',
  'GET_ANKH_SHIELD', 'GAIN_TORCH_GODS_FAVOR', 'PLAY_ON_A_SPECIAL_SEED', 'ALL_TOWN_SLIMES',
  'TRANSMUTE_ITEM', 'PURIFY_ENTIRE_WORLD', 'TO_INFINITY_AND_BEYOND', 'BOOK_WORM',
  'BOULDER_LORD', 'QUEEN_MACHINE', 'ROLLIN_IN_YOUR_GRAVE', 'FEAR_THE_SUN',
  'ITS_SHALING_OUTSIDE', 'EXTRA_LIFE', 'GRAVE_MISTAKE', 'SPICY_LICKS', 'ORGANIZED_CHAOS',
  'ON_FLEEK', 'FORTUNE_FAVORS_THE_BOULD', 'TRAINING_DAY', 'MINI_ME', 'TERRARIST',
  'NEW_DIGS', 'MY_PEOPLE_NEED_ME', 'GOING_OLDSCHOOL', 'SEA_YOU_LATER', 'TRASH_COMPACTOR',
  'CONSERVATIONIST', 'INTERDIMENSIONAL_RECYCLING',
];

/** 图标图集内坐标（UIAchievementListItem.cs:57-60：64px 帧、66px 步长、每行 8 帧；
 *  锁定态 = 同位置 X+528 灰阶列块） */
export function achIconFrame(iconIndex: number): { x: number; y: number } {
  return { x: (iconIndex % 8) * 66, y: Math.floor(iconIndex / 8) * 66 };
}
export const ACH_ICON_LOCKED_DX = 528;

function categoryOf(name: string): number {
  if (SLAYER.includes(name)) return ACH_CATEGORY.Slayer;
  if (EXPLORER.includes(name)) return ACH_CATEGORY.Explorer;
  if (CHALLENGER.includes(name)) return ACH_CATEGORY.Challenger;
  if (COLLECTOR.includes(name)) return ACH_CATEGORY.Collector;
  return ACH_CATEGORY.NoCategory;
}

/** 全量成就定义（注册原序 = 菜单列表序，CreateAchievementsList 同序） */
export const ACH_DEFS: AchDef[] = RAW.map(([name, conditions]) => ({
  name, conditions, category: categoryOf(name),
}));

export const ACH_ICON_INDEX: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  ACH_ICON_ORDER.forEach((n, i) => { m[n] = i; });
  return m;
})();

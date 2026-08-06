// .wld → 自有存档格式转换（导入后即可进入游戏）
// tile/wall/item 的 id 映射基于 Terraria 1.4 的事实数据；未映射内容做可玩性降级。
import { parseWld, WldWorld } from './WldParser';
import { SaveData, rleTiles, rlePairs, bytesToB64 } from '../save/SaveFile';
import { TILE_BY_KEY, WALL_BY_KEY, T } from '../data/tiles';
import { ITEM_BY_KEY } from '../data/items';

// wld tile id → 内部 tile key（null = 清空丢弃；copyFrame = 原版 framed 家具，18px 帧直拷）
type MapEntry = string | { key: string; copyFrame?: boolean } | null;
const TILE_MAP: Record<number, MapEntry> = {
  0: 'dirt',          // Dirt
  1: 'stone',         // Stone
  2: 'grass',         // Grass
  3: 'tallgrass',     // Plants（地表植物）
  4: { key: 'torch', copyFrame: true },  // Torch（保留原版墙面/熄灭变体帧）
  5: 'tree',          // Tree
  6: 'ore_iron',      // Iron
  7: 'ore_copper',    // Copper
  8: 'ore_gold',      // Gold
  9: 'ore_silver',    // Silver
  10: 'door_closed',  // Closed Door
  16: 'anvil',        // Anvil
  17: 'anvil',        // Mythril Anvil
  18: 'workbench',    // Work Bench
  19: 'platform',     // Wood Platform
  21: 'chest',        // Chest
  53: 'sand',         // Sand
  59: 'mud',          // Mud
  60: 'grass',        // Jungle Grass
  73: 'tallgrass',    // Plants 2
  147: 'snow',        // Snow
  // ---- 原版素材批次（Tiles_N 表 + TEdit framing） ----
  57: 'ash', 123: 'silt', 40: 'clay', 54: 'glass', 56: 'obsidian',
  38: 'gray_brick', 39: 'red_brick',
  161: 'ice', 162: 'thin_ice', 206: 'ice_brick', 148: 'snow_brick',
  396: 'sandstone', 397: 'hardened_sand', 404: 'desert_fossil',
  166: 'ore_tin', 167: 'ore_lead', 168: 'ore_tungsten', 169: 'ore_platinum',
  22: 'ore_demonite', 37: 'ore_meteorite', 58: 'ore_hellstone', 204: 'ore_crimtane',
  107: 'ore_cobalt', 108: 'ore_mythril', 111: 'ore_adamantite',
  221: 'ore_palladium', 222: 'ore_orichalcum', 223: 'ore_titanium', 211: 'ore_chlorophyte',
  63: 'gem_sapphire', 64: 'gem_ruby', 65: 'gem_emerald',
  66: 'gem_topaz', 67: 'gem_amethyst', 68: 'gem_diamond',
  // 家具（framed：18px 帧/样式直拷，渲染端原样使用）
  14: { key: 'table', copyFrame: true },
  15: { key: 'chair', copyFrame: true },
  79: { key: 'bed', copyFrame: true },
  33: { key: 'candle', copyFrame: true },
  34: { key: 'chandelier', copyFrame: true },
  42: { key: 'lantern', copyFrame: true },
  100: { key: 'candelabra', copyFrame: true },
  101: { key: 'bookcase', copyFrame: true },
  104: { key: 'grandfather_clock', copyFrame: true },
  87: { key: 'piano', copyFrame: true },
  88: { key: 'dresser', copyFrame: true },
  89: { key: 'bench', copyFrame: true },
  90: { key: 'bathtub', copyFrame: true },
  94: { key: 'keg', copyFrame: true },
  95: { key: 'chinese_lantern', copyFrame: true },
  96: { key: 'cooking_pot', copyFrame: true },
  98: { key: 'skull_lantern', copyFrame: true },
  78: { key: 'clay_pot', copyFrame: true },
  85: { key: 'tombstone_v', copyFrame: true },
  12: { key: 'crystal_heart', copyFrame: true },
  49: { key: 'water_candle', copyFrame: true },
  // 降级为 stone 的常见方块
  23: 'stone', 24: 'stone', 25: 'stone',  // corruption
  31: 'stone', 32: 'stone', 27: 'stone',  // crimson
  41: 'stone', 43: 'stone', 44: 'stone',  // dungeon bricks
  75: 'stone',
  199: 'stone', 200: 'stone', 201: 'stone', 202: 'stone', 203: 'stone',
  // ---- 全量补全（compat-report 驱动，187 种）----
  165: { key: 'v_165_cave_decos', copyFrame: true },  // Cave Decos
  51: 'v_51_cobweb',  // Cobweb
  368: 'v_368_granite_block',  // Granite Block
  226: 'v_226_lihzahrd_brick',  // Lihzahrd Brick
  367: 'v_367_marble_block',  // Marble Block
  184: { key: 'v_184_moss_plants', copyFrame: true },  // Moss Plants
  633: 'v_633_ash_grass_block',  // Ash Grass Block
  181: 'v_181_red_moss_block',  // Red Moss Block
  189: 'v_189_cloud_block',  // Cloud Block
  183: 'v_183_purple_moss_block',  // Purple Moss Block
  536: 'v_536_xenon_moss_block',  // Xenon Moss Block
  225: 'v_225_hive_block',  // Hive Block
  483: 'v_483_cracked_pink_brick',  // Cracked Pink Brick
  638: 'v_638_ash_vines',  // Ash Vines
  224: 'v_224_slush_block',  // Slush Block
  383: 'v_383_living_mahogany_block',  // Living Mahogany Block
  179: 'v_179_green_moss_block',  // Green Moss Block
  314: { key: 'v_314_minecart_track', copyFrame: true },  // Minecart Track
  384: 'v_384_living_mahogany_leaves_block',  // Living Mahogany Leaves Block
  185: { key: 'v_185_small_decos', copyFrame: true },  // Small Decos
  373: { key: 'v_373_water_drip', copyFrame: true },  // Water Drip
  273: 'v_273_stone_slab',  // Stone Slab
  187: { key: 'v_187_decos_3x2_group_2', copyFrame: true },  // Decos (3x2) (Group 2)
  484: { key: 'v_484_rolling_cactus', copyFrame: true },  // Rolling Cactus
  374: { key: 'v_374_lava_drip', copyFrame: true },  // Lava Drip
  381: 'v_381_lava_moss',  // Lava Moss
  48: 'v_48_spike',  // Spike
  192: 'v_192_living_leaf_block',  // Living Leaf Block
  191: 'v_191_living_wood_block',  // Living Wood Block
  233: { key: 'v_233_jungle_large_plants', copyFrame: true },  // Jungle Large Plants
  528: 'v_528_mushroom_vines',  // Mushroom Vines
  105: { key: 'v_105_statue', copyFrame: true },  // Statue
  186: { key: 'v_186_decos_3x2', copyFrame: true },  // Decos (3x2)
  196: 'v_196_rain_cloud_block',  // Rain Cloud Block
  461: { key: 'v_461_sand_drip', copyFrame: true },  // Sand Drip
  382: 'v_382_flower_vines',  // Flower Vines
  178: { key: 'v_178_gems', copyFrame: true },  // Gems
  118: 'v_118_pearlstone_brick',  // Pearlstone Brick
  485: { key: 'v_485_antlion_larva', copyFrame: true },  // Antlion Larva
  321: 'v_321_boreal_wood',  // Boreal Wood
  637: { key: 'v_637_ash_short_plants', copyFrame: true },  // Ash Short Plants
  444: { key: 'v_444_bee_hive', copyFrame: true },  // Bee Hive
  240: { key: 'v_240_wall_hangings_3x3', copyFrame: true },  // Wall Hangings 3x3
  152: 'v_152_ebonstone_brick',  // Ebonstone Brick
  124: 'v_124_wooden_beam',  // Wooden Beam
  158: 'v_158_rich_mahogany',  // Rich Mahogany
  519: { key: 'v_519_cattails', copyFrame: true },  // Cattails
  357: 'v_357_smooth_marble_block',  // Smooth Marble Block
  272: 'v_272_cog_block',  // Cog Block
  229: 'v_229_honey_block',  // Honey Block
  138: { key: 'v_138_boulder', copyFrame: true },  // Boulder
  634: { key: 'v_634_ash_tree', copyFrame: true },  // Ash Tree
  575: 'v_575_rich_mahogany_beam',  // Rich Mahogany Beam
  26: { key: 'v_26_altars', copyFrame: true },  // Altars
  311: 'v_311_dynasty_wood',  // Dynasty Wood
  130: 'v_130_active_stone_block',  // Active Stone Block
  82: { key: 'v_82_herbs_sprout', copyFrame: true },  // Herbs (Sprout)
  193: 'v_193_slime_block',  // Slime Block
  323: { key: 'v_323_palm_trees', copyFrame: true },  // Palm Trees
  190: 'v_190_glowing_mushroom_block',  // Glowing Mushroom Block
  350: 'v_350_martian_conduit_plating',  // Martian Conduit Plating
  369: 'v_369_smooth_granite_block',  // Smooth Granite Block
  135: { key: 'v_135_pressure_plates', copyFrame: true },  // Pressure Plates
  91: { key: 'v_91_banners', copyFrame: true },  // Banners
  242: { key: 'v_242_paintings_6x4', copyFrame: true },  // Paintings 6x4
  50: { key: 'v_50_books', copyFrame: true },  // Books
  93: { key: 'v_93_lamps', copyFrame: true },  // Lamps
  549: { key: 'v_549_seaweed', copyFrame: true },  // Seaweed
  137: { key: 'v_137_traps', copyFrame: true },  // Traps
  117: 'v_117_pearlstone_block',  // Pearlstone Block
  112: 'v_112_ebonsand_block',  // Ebonsand Block
  254: { key: 'v_254_pumpkin_plant', copyFrame: true },  // Pumpkin Plant
  571: { key: 'v_571_bamboo', copyFrame: true },  // Bamboo
  232: 'v_232_wooden_spike',  // Wooden Spike
  274: 'v_274_sandstone_slab',  // Sandstone Slab
  246: { key: 'v_246_paintings_3x2', copyFrame: true },  // Paintings 3x2
  213: 'v_213_rope',  // Rope
  245: { key: 'v_245_paintings_2x3', copyFrame: true },  // Paintings 2x3
  322: 'v_322_palm_wood',  // Palm Wood
  586: { key: 'v_586_emerald_tree', copyFrame: true },  // Emerald Tree
  596: { key: 'v_596_vanity_tree_sakura', copyFrame: true },  // Vanity Tree Sakura
  636: 'v_636_corrupt_vines',  // Corrupt Vines
  574: 'v_574_boreal_beam',  // Boreal Beam
  467: { key: 'v_467_chests_group_2', copyFrame: true },  // Chests (Group 2)
  109: 'v_109_hallowed_grass_block',  // Hallowed Grass Block
  443: { key: 'v_443_geyser', copyFrame: true },  // Geyser
  312: 'v_312_red_dynasty_shingles',  // Red Dynasty Shingles
  589: { key: 'v_589_amber_tree', copyFrame: true },  // Amber Tree
  411: { key: 'v_411_detonator', copyFrame: true },  // Detonator
  518: { key: 'v_518_lily_pads', copyFrame: true },  // Lily Pads
  588: { key: 'v_588_diamond_tree', copyFrame: true },  // Diamond Tree
  422: 'v_422_conveyor_belt_ccw',  // Conveyor Belt (CCW)
  585: { key: 'v_585_sapphire_tree', copyFrame: true },  // Sapphire Tree
  583: { key: 'v_583_topaz_tree', copyFrame: true },  // Topaz Tree
  13: { key: 'v_13_placed_bottles', copyFrame: true },  // Placed Bottles
  530: { key: 'v_530_oasis_plants', copyFrame: true },  // Oasis Plants
  495: 'v_495_shell_pile_block',  // Shell Pile Block
  479: 'v_479_smooth_sandstone_block',  // Smooth Sandstone Block
  616: { key: 'v_616_vanity_tree_yellow_willow', copyFrame: true },  // Vanity Tree Yellow Willow
  215: { key: 'v_215_campfires', copyFrame: true },  // Campfires
  141: { key: 'v_141_explosives', copyFrame: true },  // Explosives
  333: 'v_333_platinum_coin_pile',  // Platinum Coin Pile
  597: { key: 'v_597_pylons', copyFrame: true },  // Pylons
  592: { key: 'v_592_hanging_brazier', copyFrame: true },  // Hanging Brazier
  375: { key: 'v_375_honey_drip', copyFrame: true },  // Honey Drip
  227: { key: 'v_227_dye_plants', copyFrame: true },  // Dye Plants
  353: 'v_353_vine_rope',  // Vine Rope
  584: { key: 'v_584_amethyst_tree', copyFrame: true },  // Amethyst Tree
  231: { key: 'v_231_larva', copyFrame: true },  // Larva
  332: 'v_332_gold_coin_pile',  // Gold Coin Pile
  395: { key: 'v_395_item_frame', copyFrame: true },  // Item Frame
  241: { key: 'v_241_catacombs', copyFrame: true },  // Catacombs
  587: { key: 'v_587_ruby_tree', copyFrame: true },  // Ruby Tree
  86: { key: 'v_86_loom', copyFrame: true },  // Loom
  477: 'v_477_mowed_grass_block',  // Mowed Grass Block
  376: { key: 'v_376_fishing_crates', copyFrame: true },  // Fishing Crates
  470: { key: 'v_470_mannequins', copyFrame: true },  // Mannequins
  577: 'v_577_sandstone_column',  // Sandstone Column
  561: 'v_561_marble_column',  // Marble Column
  324: { key: 'v_324_seashells', copyFrame: true },  // Seashells
  81: { key: 'v_81_coral', copyFrame: true },  // Coral
  576: 'v_576_granite_column',  // Granite Column
  214: 'v_214_chain',  // Chain
  380: { key: 'v_380_planter_boxes', copyFrame: true },  // Planter Boxes
  136: { key: 'v_136_switch', copyFrame: true },  // Switch
  355: { key: 'v_355_alchemy_table', copyFrame: true },  // Alchemy Table
  354: { key: 'v_354_bewitching_table', copyFrame: true },  // Bewitching Table
  103: { key: 'v_103_bowls', copyFrame: true },  // Bowls
  529: { key: 'v_529_sea_oats', copyFrame: true },  // Sea Oats
  506: { key: 'v_506_bast_statue', copyFrame: true },  // Bast Statue
  349: { key: 'v_349_mushroom_statue', copyFrame: true },  // Mushroom Statue
  377: { key: 'v_377_sharpening_station', copyFrame: true },  // Sharpening Station
  613: { key: 'v_613_potted_lava_plants', copyFrame: true },  // Potted Lava Plants
  230: 'v_230_crispy_honey_block',  // Crispy Honey Block
  219: { key: 'v_219_extractinator', copyFrame: true },  // Extractinator
  388: { key: 'v_388_tall_gate_closed', copyFrame: true },  // Tall Gate (Closed)
  129: { key: 'v_129_crystal_shard', copyFrame: true },  // Crystal Shard
  466: { key: 'v_466_elder_cystal_stand', copyFrame: true },  // Elder Cystal Stand
  562: 'v_562_bamboo_block',  // Bamboo Block
  220: { key: 'v_220_solidifier', copyFrame: true },  // Solidifier
  303: { key: 'v_303_lihzahrd_furnace', copyFrame: true },  // Lihzahrd Furnace
  469: { key: 'v_469_tables_group_2', copyFrame: true },  // Tables (Group 2)
  304: { key: 'v_304_living_loom', copyFrame: true },  // Living Loom
  488: { key: 'v_488_fallen_log', copyFrame: true },  // Fallen Log
  548: { key: 'v_548_potted_trees_group_2', copyFrame: true },  // Potted Trees (Group 2)
  614: { key: 'v_614_potted_ember_tendrils', copyFrame: true },  // Potted Ember Tendrils
  598: { key: 'v_598_lava_serpent_bowl', copyFrame: true },  // Lava Serpent Bowl
  371: 'v_371_pink_slime_block',  // Pink Slime Block
  406: { key: 'v_406_chimney', copyFrame: true },  // Chimney
  305: { key: 'v_305_sky_mill', copyFrame: true },  // Sky Mill
  300: { key: 'v_300_bone_welder', copyFrame: true },  // Bone Welder
  302: { key: 'v_302_glass_kiln', copyFrame: true },  // Glass Kiln
  306: { key: 'v_306_ice_machine', copyFrame: true },  // Ice Machine
  247: { key: 'v_247_autohammer', copyFrame: true },  // Autohammer
  491: { key: 'v_491_void_vault', copyFrame: true },  // Void Vault
  106: { key: 'v_106_sawmill', copyFrame: true },  // Sawmill
  642: { key: 'v_642_chlorophyte_extractinator', copyFrame: true },  // Chlorophyte Extractinator
  319: { key: 'v_319_ship_in_a_bottle', copyFrame: true },  // Ship in a Bottle
  487: { key: 'v_487_picnic_tables', copyFrame: true },  // Picnic Tables
  97: { key: 'v_97_safe', copyFrame: true },  // Safe
  668: 'v_668_the_dirtiest_block',  // The Dirtiest Block
  320: { key: 'v_320_seaweed_planter', copyFrame: true },  // Seaweed Planter
  405: { key: 'v_405_fireplace', copyFrame: true },  // Fireplace
  378: { key: 'v_378_target_dummy', copyFrame: true },  // Target Dummy
  218: { key: 'v_218_meat_grinder', copyFrame: true },  // Meat Grinder
  356: { key: 'v_356_enchanted_sundial', copyFrame: true },  // Enchanted Sundial
  114: { key: 'v_114_tinkerer_s_workshop', copyFrame: true },  // Tinkerer's Workshop
  578: 'v_578_mushroom_beam',  // Mushroom Beam
  237: { key: 'v_237_lihzahrd_altar', copyFrame: true },  // Lihzahrd Altar
  110: { key: 'v_110_hallow_short_plants', copyFrame: true },  // Hallow Short Plants
  621: { key: 'v_621_slice_of_cake', copyFrame: true },  // Slice of Cake
  387: { key: 'v_387_trap_door_closed', copyFrame: true },  // Trap Door (Closed)
  316: { key: 'v_316_blue_jellyfish_jar', copyFrame: true },  // Blue Jellyfish Jar
  125: { key: 'v_125_crystal_ball', copyFrame: true },  // Crystal Ball
  287: { key: 'v_287_ammo_box', copyFrame: true },  // Ammo Box
  294: { key: 'v_294_zebra_swallowtail_butterfly_jar', copyFrame: true },  // Zebra Swallowtail Butterfly Jar
  291: { key: 'v_291_ulysses_butterfly_jar', copyFrame: true },  // Ulysses Butterfly Jar
  292: { key: 'v_292_sulphur_butterfly_jar', copyFrame: true },  // Sulphur Butterfly Jar
  289: { key: 'v_289_purple_emperor_butterfly_jar', copyFrame: true },  // Purple Emperor Butterfly Jar
  172: { key: 'v_172_sinks', copyFrame: true },  // Sinks
  656: { key: 'v_656_glow_tulip', copyFrame: true },  // Glow Tulip
  113: { key: 'v_113_hallow_tall_plants', copyFrame: true },  // Hallow Tall Plants
  235: { key: 'v_235_teleporter', copyFrame: true },  // Teleporter
  567: { key: 'v_567_garden_gnome', copyFrame: true },  // Garden Gnome
  398: 'v_398_corrupt_hardened_sand_block',  // Corrupt Hardened Sand Block
  379: 'v_379_bubble',  // Bubble
  618: 'v_618_stone_accent_slab',  // Stone Accent Slab
  // 清空的装饰/不可表示物
  11: 'door_open',  // Open Door（我们有开态门tile）
  28: { key: 'pot', copyFrame: true }, 29: null, 30: 'wood',  // Pots(原版) / Piggy Bank(暂无) / Wood→木材
  52: 'v_52_vines', 55: null,  // 藤蔓 / 乐器架
  61: 'tallgrass', 62: 'v_62_jungle_vines', 69: 'v_69_jungle_thorns', // jungle plants(草化)/藤蔓/荆棘
  70: 'grass', 71: 'mushroom', 72: 'tree',   // mushroom grass / Mushroom Plant→蘑菇 / mushroom tree
  74: 'tallgrass', 76: { key: 'furnace', copyFrame: true }, 77: { key: 'furnace', copyFrame: true }, 80: 'flower', // plants2→草 / Hellforge→熔炉 / 陨铁 / herbs bloom→花
  83: 'flower', 84: 'flower', // herbs mature→花 / bloom→花
};

// wld wall id → 内部 wall key
const WALL_MAP: Record<number, string> = {
  1: 'stone_wall',   // Stone (natural)
  2: 'dirt_wall',    // Dirt (natural)
  3: 'stone_wall',   // Ebonstone
  4: 'wood_wall',    // Wood
  5: 'stone_wall', 6: 'stone_wall', 7: 'stone_wall', 8: 'stone_wall', 9: 'stone_wall',
  10: 'stone_wall', 11: 'stone_wall', 12: 'stone_wall', 13: 'stone_wall', 14: 'stone_wall',
  15: 'dirt_wall', 16: 'dirt_wall',
};

// wld item id → 内部 item key（宝箱战利品用）
const ITEM_MAP: Record<number, string> = {
  2: 'dirt_block', 8: 'torch', 9: 'wood', 175: 'stone_block',
  11: 'iron_ore', 12: 'copper_ore', 13: 'gold_ore', 14: 'silver_ore',
  20: 'copper_bar', 22: 'iron_bar', 23: 'gel',
  28: 'lesser_healing_potion', 38: 'lens',
  71: 'coin_copper', 72: 'coin_copper', 73: 'coin_copper', 74: 'coin_copper',
  // 原版批次材料
  699: 'tin_ore', 700: 'lead_ore', 701: 'tungsten_ore', 702: 'platinum_ore',
  703: 'tin_bar', 704: 'lead_bar', 705: 'tungsten_bar', 706: 'platinum_bar',
  177: 'sapphire', 178: 'ruby', 179: 'emerald', 180: 'topaz', 181: 'amethyst', 182: 'diamond',
  664: 'ice_block', 883: 'ice_brick', 594: 'snow_brick',
  133: 'clay_block', 170: 'glass', 173: 'obsidian', 129: 'gray_brick', 131: 'red_brick',
  32: 'table', 34: 'chair', 224: 'bed', 354: 'bookcase', 359: 'grandfather_clock',
  105: 'candle', 136: 'lantern', 349: 'candelabra', 222: 'clay_pot', 29: 'life_crystal',
  5: 'mushroom_item', 27: 'acorn',
  // ---- 全量补全（compat-report 驱动）----
  2350: 'vi_2350_recall_potion',  // Recall Potion
  188: 'vi_188_healing_potion',  // Healing Potion
  282: 'vi_282_glowstick',  // Glowstick
  41: 'vi_41_flaming_arrow',  // Flaming Arrow
  167: 'vi_167_dynamite',  // Dynamite
  279: 'vi_279_throwing_knife',  // Throwing Knife
  51: 'vi_51_jester_s_arrow',  // Jester's Arrow
  19: 'vi_19_gold_bar',  // Gold Bar
  302: 'vi_302_water_walking_potion',  // Water Walking Potion
  305: 'vi_305_gravitation_potion',  // Gravitation Potion
  43: 'vi_43_suspicious_looking_eye',  // Suspicious Looking Eye
  296: 'vi_296_spelunker_potion',  // Spelunker Potion
  299: 'vi_299_night_owl_potion',  // Night Owl Potion
  965: 'vi_965_rope',  // Rope
  303: 'vi_303_archery_potion',  // Archery Potion
  304: 'vi_304_hunter_potion',  // Hunter Potion
  50: 'vi_50_magic_mirror',  // Magic Mirror
  42: 'vi_42_shuriken',  // Shuriken
  295: 'vi_295_featherfall_potion',  // Featherfall Potion
  53: 'vi_53_cloud_in_a_bottle',  // Cloud in a Bottle
  2329: 'vi_2329_dangersense_potion',  // Dangersense Potion
  40: 'vi_40_wooden_arrow',  // Wooden Arrow
  975: 'vi_975_shoe_spikes',  // Shoe Spikes
  54: 'vi_54_hermes_boots',  // Hermes Boots
  301: 'vi_301_thorns_potion',  // Thorns Potion
  49: 'vi_49_band_of_regeneration',  // Band of Regeneration
  2326: 'vi_2326_titan_potion',  // Titan Potion
  297: 'vi_297_invisibility_potion',  // Invisibility Potion
  166: 'vi_166_bomb',  // Bomb
  5011: 'vi_5011_mace',  // Mace
  4425: 'vi_4425_shark_bait',  // Shark Bait
  2351: 'vi_2351_teleportation_potion',  // Teleportation Potion
  4460: 'vi_4460_sandcastle_bucket',  // Sandcastle Bucket
  168: 'vi_168_grenade',  // Grenade
  227: 'vi_227_restoration_potion',  // Restoration Potion
  930: 'vi_930_flare_gun',  // Flare Gun
  931: 'vi_931_flare',  // Flare
  997: 'vi_997_extractinator',  // Extractinator
  52: 'vi_52_angel_statue',  // Angel Statue
  265: 'vi_265_hellfire_arrow',  // Hellfire Arrow
  298: 'vi_298_shine_potion',  // Shine Potion
  5007: 'vi_5007_dead_man_s_sweater',  // Dead Man's Sweater
  117: 'vi_117_meteorite_bar',  // Meteorite Bar
  186: 'vi_186_breathing_reed',  // Breathing Reed
  329: 'vi_329_shadow_key',  // Shadow Key
  974: 'vi_974_ice_torch',  // Ice Torch
  2322: 'vi_2322_mining_potion',  // Mining Potion
  4915: 'vi_4915_tungsten_bullet',  // Tungsten Bullet
  946: 'vi_946_umbrella',  // Umbrella
  939: 'vi_939_web_slinger',  // Web Slinger
  4870: 'vi_4870_potion_of_return',  // Potion of Return
  288: 'vi_288_obsidian_skin_potion',  // Obsidian Skin Potion
  31: 'vi_31_bottle',  // Bottle
  211: 'vi_211_feral_claws',  // Feral Claws
  4404: 'vi_4404_inner_tube',  // Inner Tube
  187: 'vi_187_flipper',  // Flipper
  2198: 'vi_2198_ice_machine',  // Ice Machine
  274: 'vi_274_dark_lance',  // Dark Lance
  285: 'vi_285_aglet',  // Aglet
  213: 'vi_213_staff_of_regrowth',  // Staff of Regrowth
  964: 'vi_964_boomstick',  // Boomstick
  1293: 'vi_1293_lihzahrd_power_cell',  // Lihzahrd Power Cell
  2195: 'vi_2195_lihzahrd_furnace',  // Lihzahrd Furnace
  2766: 'vi_2766_solar_tablet_fragment',  // Solar Tablet Fragment
  300: 'vi_300_battle_potion',  // Battle Potion
  2348: 'vi_2348_inferno_potion',  // Inferno Potion
  218: 'vi_218_flamelash',  // Flamelash
  3019: 'vi_3019_hellwing_bow',  // Hellwing Bow
  112: 'vi_112_flower_of_fire',  // Flower of Fire
  220: 'vi_220_sunfury',  // Sunfury
  4345: 'vi_4345_can_of_worms',  // Can Of Worms
  953: 'vi_953_climbing_claws',  // Climbing Claws
  3069: 'vi_3069_wand_of_sparking',  // Wand of Sparking
  212: 'vi_212_anklet_of_the_wind',  // Anklet of the Wind
  2204: 'vi_2204_honey_dispenser',  // Honey Dispenser
  277: 'vi_277_trident',  // Trident
  863: 'vi_863_water_walking_boots',  // Water Walking Boots
  751: 'vi_751_cloud',  // Cloud
  155: 'vi_155_muramasa',  // Muramasa
  289: 'vi_289_regeneration_potion',  // Regeneration Potion
  906: 'vi_906_lava_charm',  // Lava Charm
  4055: 'vi_4055_dunerider_boots',  // Dunerider Boots
  724: 'vi_724_ice_blade',  // Ice Blade
  670: 'vi_670_ice_boomerang',  // Ice Boomerang
  4061: 'vi_4061_storm_spear',  // Storm Spear
  987: 'vi_987_blizzard_in_a_bottle',  // Blizzard in a Bottle
  4551: 'vi_4551_slice_of_hell_cake',  // Slice of Hell Cake
  5010: 'vi_5010_treasure_magnet',  // Treasure Magnet
  2323: 'vi_2323_heartreach_potion',  // Heartreach Potion
  2345: 'vi_2345_lifeforce_potion',  // Lifeforce Potion
  290: 'vi_290_swiftness_potion',  // Swiftness Potion
  291: 'vi_291_gills_potion',  // Gills Potion
  280: 'vi_280_spear',  // Spear
  2325: 'vi_2325_builder_potion',  // Builder Potion
  284: 'vi_284_wooden_boomerang',  // Wooden Boomerang
  2192: 'vi_2192_bone_welder',  // Bone Welder
  5234: 'vi_5234_remnants_of_devotion',  // Remnants of Devotion
  156: 'vi_156_cobalt_shield',  // Cobalt Shield
  157: 'vi_157_aqua_scepter',  // Aqua Scepter
  163: 'vi_163_blue_moon',  // Blue Moon
  113: 'vi_113_magic_missile',  // Magic Missile
  3317: 'vi_3317_valor',  // Valor
  327: 'vi_327_golden_key',  // Golden Key
  164: 'vi_164_handgun',  // Handgun
  294: 'vi_294_magic_power_potion',  // Magic Power Potion
  4263: 'vi_4263_magic_conch',  // Magic Conch
  4062: 'vi_4062_thunder_zapper',  // Thunder Zapper
  1579: 'vi_1579_flurry_boots',  // Flurry Boots
  4056: 'vi_4056_ancient_chisel',  // Ancient Chisel
  4346: 'vi_4346_encumbering_stone',  // Encumbering Stone
  1319: 'vi_1319_snowball_cannon',  // Snowball Cannon
  3199: 'vi_3199_ice_mirror',  // Ice Mirror
  950: 'vi_950_ice_skates',  // Ice Skates
  4443: 'vi_4443_demonic_hellcart',  // Demonic Hellcart
  4737: 'vi_4737_ornate_shadow_key',  // Ornate Shadow Key
  4276: 'vi_4276_bast_statue',  // Bast Statue
  4262: 'vi_4262_snake_charmer_s_flute',  // Snake Charmer's Flute
  3093: 'vi_3093_herb_bag',  // Herb Bag
  292: 'vi_292_ironskin_potion',  // Ironskin Potion
  3084: 'vi_3084_radar',  // Radar
  4341: 'vi_4341_step_stool',  // Step Stool
  4978: 'vi_4978_fledgling_wings',  // Fledgling Wings
  2197: 'vi_2197_sky_mill',  // Sky Mill
  158: 'vi_158_lucky_horseshoe',  // Lucky Horseshoe
  5254: 'vi_5254_blessing_from_the_heavens',  // Blessing from the Heavens
  1156: 'vi_1156_piranha_gun',  // Piranha Gun
  1571: 'vi_1571_scourge_of_the_corruptor',  // Scourge of the Corruptor
  1260: 'vi_1260_rainbow_gun',  // Rainbow Gun
  1572: 'vi_1572_staff_of_the_frost_hydra',  // Staff of the Frost Hydra
  4607: 'vi_4607_desert_tiger_staff',  // Desert Tiger Staff
  933: 'vi_933_leaf_wand',  // Leaf Wand
  832: 'vi_832_living_wood_wand',  // Living Wood Wand
  4066: 'vi_4066_desert_minecart',  // Desert Minecart
  4450: 'vi_4450_shroom_minecart',  // Shroom Minecart
  4423: 'vi_4423_scarab_bomb',  // Scarab Bomb
  159: 'vi_159_shiny_red_balloon',  // Shiny Red Balloon
  5258: 'vi_5258_see_the_world_for_what_it_is',  // See The World For What It Is
  65: 'vi_65_starfury',  // Starfury
  5388: 'vi_5388_eye_of_the_sun',  // Eye of the Sun
  2219: 'vi_2219_celestial_magnet',  // Celestial Magnet
  5255: 'vi_5255_love_is_in_the_trash_slot',  // Love is in the Trash Slot
  4426: 'vi_4426_bee_minecart',  // Bee Minecart
  3017: 'vi_3017_flower_boots',  // Flower Boots
  3360: 'vi_3360_living_mahogany_wand',  // Living Mahogany Wand
  3361: 'vi_3361_rich_mahogany_leaf_wand',  // Rich Mahogany Leaf Wand
  1309: 'vi_1309_slime_staff',  // Slime Staff
  1845: 'vi_1845_necromantic_scroll',  // Necromantic Scroll
  1864: 'vi_1864_papyrus_scarab',  // Papyrus Scarab
  1158: 'vi_1158_pygmy_necklace',  // Pygmy Necklace
  3034: 'vi_3034_coin_ring',  // Coin Ring
  308: 'vi_308_moonglow_seeds',  // Moonglow Seeds
  312: 'vi_312_fireblossom_seeds',  // Fireblossom Seeds
  310: 'vi_310_deathweed_seeds',  // Deathweed Seeds
  307: 'vi_307_daybloom_seeds',  // Daybloom Seeds
  309: 'vi_309_blinkroot_seeds',  // Blinkroot Seeds
  2357: 'vi_2357_shiverthorn_seeds',  // Shiverthorn Seeds
  311: 'vi_311_waterleaf_seeds',  // Waterleaf Seeds
  1828: 'vi_1828_pumpkin_seed',  // Pumpkin Seed
  126: 'vi_126_bottled_water',  // Bottled Water
  1134: 'vi_1134_bottled_honey',  // Bottled Honey
  3068: 'vi_3068_guide_to_plant_fiber_cordage',  // Guide to Plant Fiber Cordage
  4779: 'vi_4779_mushroom_hat',  // Mushroom Hat
  4780: 'vi_4780_mushroom_vest',  // Mushroom Vest
  4781: 'vi_4781_mushroom_pants',  // Mushroom Pants
};

export interface CompatEntry { id: number; name: string | null; count: number; action: string }
export interface CompatReport {
  worldName: string; wldVersion: number; size: [number, number];
  tilesDegraded: CompatEntry[];  // 未映射 tile → 降级石块
  tilesCleared: CompatEntry[];   // 映射为 null → 清空丢弃
  itemsSkipped: CompatEntry[];   // 宝箱内未映射物品 → 跳过
}
export interface ImportResult { save: SaveData; warnings: string[]; report: CompatReport }

export function parseWldToSave(buf: Uint8Array): ImportResult {
  const wld: WldWorld = parseWld(buf);
  const warnings: string[] = [];
  const tileNames = vanillaTileNames;
  const itemNames = vanillaItemNames;
  const deg = new Map<number, number>(), clr = new Map<number, number>(), itm = new Map<number, number>();
  const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1);

  const w = wld.tilesWide, h = wld.tilesHigh;
  const n = w * h;
  const type = new Uint16Array(n);
  const frameX = new Uint16Array(n);
  const frameY = new Uint16Array(n);
  const wall = new Uint8Array(n);
  const liquidArr = new Uint8Array(n);

  const chestAt = new Map<string, { x: number; y: number }>();
  for (const c of wld.chests) chestAt.set(`${c.x},${c.y}`, c);

  let unmapped = 0;
  for (let i = 0; i < n; i++) {
    const wt = wld.tiles.type[i];
    if (wld.tiles.active[i]) {
      const mapped = TILE_MAP[wt];
      if (mapped === undefined) {
        // 未映射：framed 物体丢弃，方块降级为 stone（保持地形完整可玩）
        unmapped++;
        bump(deg, wt);
        type[i] = T.STONE;
      } else if (mapped === null) {
        bump(clr, wt);
        type[i] = 0;
      } else if (typeof mapped === 'string') {
        type[i] = TILE_BY_KEY[mapped] ?? 0;
      } else {
        // 原版 framed 家具：18px 帧/样式偏移直拷（与 .wld 原生一致，渲染端零换算）
        type[i] = TILE_BY_KEY[mapped.key] ?? 0;
        if (mapped.copyFrame) {
          frameX[i] = wld.tiles.frameX[i];
          frameY[i] = wld.tiles.frameY[i];
        }
      }
    }
    const ww = wld.tiles.wall[i];
    if (ww !== 0) {
      wall[i] = WALL_BY_KEY[WALL_MAP[ww] ?? 'stone_wall'] ?? 0;
    }
    const lq = wld.tiles.liquid[i];
    if (lq > 0) liquidArr[i] = lq;
  }
  if (unmapped > 0) warnings.push(`${unmapped} 个未知 tile 已降级为石块`);

  // 宝箱：转内部格式（锚点 + 战利品）
  const chests: SaveData['chests'] = [];
  for (const c of wld.chests) {
    // 在 chest 周围找锚点（wld chest 坐标可能是左上）
    type[c.y * w + c.x] = TILE_BY_KEY['chest'];
    frameX[c.y * w + c.x] = 0;
    frameY[c.y * w + c.x] = 0;
    if (c.x + 1 < w) { type[c.y * w + c.x + 1] = TILE_BY_KEY['chest']; frameX[c.y * w + c.x + 1] = 1; frameY[c.y * w + c.x + 1] = 0; }
    if (c.y + 1 < h) { type[(c.y + 1) * w + c.x] = TILE_BY_KEY['chest']; frameX[(c.y + 1) * w + c.x] = 0; frameY[(c.y + 1) * w + c.x] = 1; }
    if (c.x + 1 < w && c.y + 1 < h) { type[(c.y + 1) * w + c.x + 1] = TILE_BY_KEY['chest']; frameX[(c.y + 1) * w + c.x + 1] = 1; frameY[(c.y + 1) * w + c.x + 1] = 1; }
    const items: Array<{ id: number; stack: number } | null> = [];
    for (const it of c.items.slice(0, 10)) {
      if (!it) { items.push(null); continue; }
      const key = ITEM_MAP[it.id];
      if (key && ITEM_BY_KEY[key] !== undefined) {
        items.push({ id: ITEM_BY_KEY[key], stack: Math.min(999, it.stack) });
      } else {
        bump(itm, it.id);
        items.push(null);
      }
    }
    while (items.length < 10) items.push(null);
    chests.push({ x: c.x, y: c.y, items });
  }

  // 时间换算：wld time 0 = 4:30AM（白天起点）
  let timeOfDay: number;
  if (wld.dayTime) {
    timeOfDay = 0.1875 + (wld.time % 1) * 0.5;
  } else {
    timeOfDay = 0.6875 + (wld.time % 1) * 0.5;
  }
  timeOfDay = timeOfDay % 1;

  const save: SaveData = {
    format: 'sandboxworld.save',
    version: 1,
    header: {
      name: wld.title || '导入的地图',
      seed: 0,
      width: w,
      height: h,
      spawn: [wld.spawnX, wld.spawnY],
      groundLevel: Math.floor(wld.groundLevel),
      rockLevel: Math.floor(wld.rockLevel),
      created: Date.now(),
      playTimeMs: 0,
      wldVersion: wld.version,
    },
    clock: { timeOfDay, dayCount: 1 },
    tiles: bytesToB64(rleTiles({ type, frameX, frameY })),
    walls: bytesToB64(rlePairs(wall)),
    liquid: bytesToB64(rlePairs(liquidArr)),
    chests,
    player: {
      hp: 100,
      x: wld.spawnX * 16 + 8,
      y: (wld.spawnY - 2) * 16,
      inventory: Array(40).fill(null),
      selected: 0,
    },
    npcs: [],
    flags: { downedEyeOfCthulhu: false },
  };
  const toEntries = (m: Map<number, number>, names: Record<string, string>): CompatEntry[] =>
    [...m.entries()].map(([id, count]) => ({ id, name: names[String(id)] ?? null, count, action: '' }))
      .sort((a, b) => b.count - a.count);
  const report: CompatReport = {
    worldName: wld.title || '导入的地图',
    wldVersion: wld.version,
    size: [w, h],
    tilesDegraded: toEntries(deg, tileNames).map((e) => ({ ...e, action: 'degraded-to-stone' })),
    tilesCleared: toEntries(clr, tileNames).map((e) => ({ ...e, action: 'cleared' })),
    itemsSkipped: toEntries(itm, itemNames).map((e) => ({ ...e, action: 'skipped' })),
  };
  void warnings;
  void chestAt;
  return { save, warnings, report };
}

// 全量名称表（vanilla.json 生成时从 TEdit tiles/items.json 提取）
import vanillaJson from '../../public/sprites/vanilla.json';
const vanillaData = vanillaJson as unknown as { tileNames?: Record<string, string>; itemNames?: Record<string, string> };
const vanillaTileNames = vanillaData.tileNames ?? {};
const vanillaItemNames = vanillaData.itemNames ?? {};

// 物品注册表
export type ToolType = 'pick' | 'axe' | 'sword' | 'hammer';
// Buff 类型（药水饮用后生效）
export type PotionBuff = 'agility' | 'ironskin' | 'resistance' | 'thorns' | 'regen'
  | 'obsidianSkin' | 'gills' | 'manaRegen' | 'magicPower' | 'featherfall' | 'waterWalking' | 'archery' | 'nightOwl';
// 盔甲部位：0 头盔 1 胸甲 2 胫甲（与 Inventory.armorSlotReq 的格位对应）
export type ArmorSlot = 0 | 1 | 2;

export interface ItemDef {
  key: string;
  name: string;
  maxStack: number;
  tile?: string;          // 放置的 tile key
  placeStyle?: number;     // 放置的样式索引(vanilla style 帧 X 偏移 = style*fw*18)
  magic?: {               // 魔法武器:消耗 mana 发射投射物
    damage: number;
    speed: number;        // 使用冷却 tick
    manaCost: number;
    projSpeed: number;
    proj?: 'spark' | 'bolt'; // 投射物外观
  };
  ranged?: {              // 远程武器:消耗 ammo 弹药发射投射物
    damage: number;
    speed: number;        // 使用冷却 tick
    knockback: number;
    ammo: string;         // 弹药 item key(箭)
    projSpeed: number;    // 投射物速度 px/tick
    /** 原版 item id（PickAmmo/ItemCheck_Shoot 数值以 vanilla-itemcombat.json 为准） */
    vid?: number;
  };
  /** 原版 AmmoID（40=箭；弹药物品自身标识，PickAmmo 匹配弓 useAmmo） */
  ammoId?: number;
  /** 原版 item id（战斗数值数据源） */
  vid?: number;
  wall?: string;          // 放置的 wall key
  /** 原版 createWall（Item.cs SetDefaults）：放置的背景墙 vanilla id。
   *  vanilla-wallitems.json 全量 292 项（tools/extract-wallitems.mjs 提取） */
  wallId?: number;
  tool?: {
    type: ToolType;
    power?: number;       // 工具力（镐/斧/锤）
    damage?: number;      // 武器伤害
    speed?: number;       // 挥砍动画 tick（≈原版 useAnimation）
    /** 原版 useTime（Item.cs SetDefaults）：挖掘每击冷却——原版挖掘节奏的真基准，
     *  铜 15-23 / 铁 13-20 / 银 11-19 / 金 17-23（applyItemTime 冷却=useTime） */
    useTime?: number;
    knockback?: number;
    reach?: number;       // 攻击/作用半径（px）
    /** 三力全量（Game.itemFuncTool 同形）：dualToolResolve 的 multi 判定读的是
     *  tool 对象内的 pickPower/axePower/hammerPower 三字段——只写主 power 时
     *  双工具（Drax/镐斧/锤斧族）multi 恒假 = 副力失效（F2,2026-08-22 工具审计） */
    pickPower?: number;
    axePower?: number;
    hammerPower?: number;
  };
  /** 副工具力（Hamaxe 系双工具：主 tool.type 外的另一力，挖掘入口按主类型判定） */
  axePower?: number;
  /** aiStyle20 持械工具弹（链锯/钻/插孔锤族，Item.cs SetDefaults useStyle5+channel
   *  +shoot：1262 :15631-15650 / 3098 :30931-30946）——shoot = 持械弹 id（252 插孔
   *  锤 / 509 链锯）、channel = 持械门。Game 工具分支按住生成持械弹体
   *  （entities/ChainsawProj，AI_020 :23837-23942）承载接触伤害；挖掘由 tool 力
   *  并行结算（原版 channel 期 ItemCheck_UseMiningTools :45009 照常跑，弹体不挖块）。
   *  缺省时 Game 回退 itemCombat(vid).shoot（3098 无显式字段同走此路） */
  shoot?: number;
  channel?: boolean;
  heal?: number;          // 食用/饮用回复
  potion?: {
    buff: PotionBuff;
    duration: number;     // 秒
    isHealType: boolean;  // 受"耐药性"封锁
  };
  accessory?: 'lucky_horseshoe' | 'feral_claws'; // 配饰效果
  armor?: { slot: ArmorSlot; defense: number };   // 盔甲（可穿装备/时装格，仅装备格计防御）
  value?: number;         // 钱币价值（铜币）
  wireTool?: {            // 电路工具（原版 Player.cs:30289-30444 ItemCheck_UseWiringTools）
    place?: number;       // 单击放置的导线位掩码(TOOL_RED/BLUE/GREEN/YELLOW/ACTUATOR)
    cutter?: boolean;     // 剪线钳:按优先级移除一件(致动器>黄>绿>蓝>红)
    rod?: boolean;        // 致动魔杖:手动翻转致动状态
    grand?: boolean;      // 宏伟蓝图:拖拽批量(R 键切模式)
  };
  /** 油漆 id（Item.paint，Item.cs:118；SetDefaults 13374-13535/21168-21185 赋值）。
   *  1073-1099 → 1-27、1966/1967/1968 → 28/29/30（PaintID.cs）。0/缺省=非油漆。
   *  Item 上无 paintWall 字段——刷墙/刷块由工具决定（Player.cs:41236/:41254） */
  paint?: number;
  /** 涂层 id（Item.paintCoating，Item.cs:120；SetDefaults :38471/:42387 赋值）。
   *  4668 夜明涂料 → 1（fullbright 位）、5344 回声涂料 → 2（invisible 位）。
   *  0/缺省=非涂层。与 paint 互斥（原版无双持物品）；由刷/滚工具消耗（Player.cs:41291） */
  paintCoating?: number;
  /** 油漆工具族（Player.cs PlaceThing_Paintbrush/Roller/Scrapper :41254/:41236/:41152）：
   *  brush=1071/1543 刷方块、roller=1072/1544 刷墙、scraper=1100/1545 清除 */
  paintTool?: 'brush' | 'roller' | 'scraper';
  desc?: string;
}

export const ITEM_DEFS: ItemDef[] = [];
const byKey: Record<string, number> = {};
export const ITEM_BY_KEY: Record<string, number> = byKey;

/** 1.4.5.6 堆叠上限（Item.cs:66 CommonMaxStack=9999 默认 + SetDefaults 全链仅 11 处覆盖；
 *  1405 有 1844 处逐物品赋值,1.4.4 改制统一为 9999）。vi_ 物品一律按此表,
 *  手写 maxStack 对 vi_ 键不生效——反编译源为准 */
const VANILLA_MAX_STACK: Record<number, number> = {
  71: 100, 72: 100, 73: 100,            // 铜银金币（白金 74 无覆盖=9999,DoCoins 只对 71-73 :38570）
  58: 1, 184: 1,                        // 早期特殊件
  1734: 1, 1735: 1, 1867: 1, 1868: 1, 1922: 1, 3388: 1,  // 任务/钥匙族
};
const vanillaMaxStackOf = (key: string): number | undefined => {
  const m = /^vi_(\d+)_/.exec(key);
  if (!m) return undefined;                 // 非 vi_:legacy 手写值管辖
  return VANILLA_MAX_STACK[Number(m[1])] ?? 9999;
};

function item(d: Partial<ItemDef> & { key: string; name: string }) {
  byKey[d.key] = ITEM_DEFS.length;
  // vi_ 物品:原版堆叠表权威（覆盖表 ?? 9999,手写 maxStack 一律忽略——1.4.4 改制
  // 后逐物品值已废弃,仅 11 处例外）;legacy/place_ 物品维持手写值(缺省 999)
  const base = vanillaMaxStackOf(d.key) ?? (d.maxStack ?? 999);
  ITEM_DEFS.push({ ...d, maxStack: base } as ItemDef);
}

// ---- 基础方块 ----













// ---- 材料 ----

















 // 金币雨（WorldGen.cs:71848）

// ---- 药水（Buff 来源;buffType/buffTime 对齐 Item.cs case 288-305——1456/1457 该段逐字节同,已 diff 核验）----
// 时长换算:buffTime/60 = 秒(Regeneration/Swiftness/Ironskin/Thorns 均 28800t=480s=8min)





// ---- 药水 buff 族第二批（Item.cs case 288/291/293/294/295/302/303 buffTime/60 = 秒）----
   // 21600t
          // 14400t
      // 28800t
     // 14400t
    // 36000t
   // 36000t
        // 28800t
       // 36000t(Item 299→buff 12)

// ---- 配饰（移植自 Maples Accessory）----



// ---- 盔甲（铜/铁/银/金三件套，防御取原版）----
// (本地盔甲循环定义已退役——vi_89-92/80-83/76-79 原版盔甲经 vanilla-itemstats 自动接装备)

// ---- 工具/武器（数值 = 官方原版 1.4.0.5 Item.cs SetDefaults，铜币价值）----
// 木镐/木斧为自定义低档（原版无对应）；木剑(24)=官方 7 伤、木锤(196)=官方 25 锤力




// 铜（3509/3506/3508/3505）




// 铁（1/10/4/7）




// 银（3515/3512/3514/3511）




// 金（3521/3518/3520/3517）





// ===================== 原版素材批次：新材料 / 方块 / 家具 =====================
// ---- 替代矿与困难模式矿（先做美术/掉落） ----




















// ---- 宝石 ----







// ---- 冰雪 / 沙漠 / 基础方块 ----














// ---- 家具 ----














// 上限扩容三件套（Player.cs:44655-44700 ItemCheck_Use*；vi_ 前缀自动映射原版图标）
item({ key: 'vi_109_mana_crystal', name: '魔力水晶', desc: '使用：魔力上限 +20（上限 200）', value: 1 }); // ←vi_109_ManaCrystal 独有字段搬移(批次A)
item({ key: 'vi_1291_life_fruit', name: '生命果', desc: '生命上限 ≥400 时使用：+5（上限 500）', value: 1 }); // ←vi_1291_LifeFruit 独有字段搬移(批次A)







// 瓦罐战利品



export interface ItemStack { id: number; stack: number; }
export function mkStack(key: string, stack = 1): ItemStack | null {
  const id = byKey[key];
  if (id === undefined) return null;
  return { id, stack };
}

// ===================== wld 导入补全物品（compat-report 驱动） =====================
// 这些物品目前只做图标与存档保留（占位），后续按需实装功能
item({ key: 'vi_2350_recall_potion', name: '', value: 1 });
item({ key: 'vi_188_healing_potion', name: '', value: 1 });
item({ key: 'vi_282_glowstick', name: '', value: 1 });
item({ key: 'vi_41_flaming_arrow', name: '', value: 1 });
item({ key: 'vi_167_dynamite', name: '', value: 1 });
item({ key: 'vi_279_throwing_knife', name: '', value: 1 });
item({ key: 'vi_51_jester_s_arrow', name: '', value: 1 });
item({ key: 'vi_19_gold_bar', name: '', value: 1 });
item({ key: 'vi_302_water_walking_potion', name: '', value: 1 });
item({ key: 'vi_305_gravitation_potion', name: '', value: 1 });
item({ key: 'vi_43_suspicious_looking_eye', name: '', value: 1 });
item({ key: 'vi_296_spelunker_potion', name: '', value: 1 });
item({ key: 'vi_299_night_owl_potion', name: '', value: 1 });
item({ key: 'vi_965_rope', name: '', value: 1 });
item({ key: 'vi_303_archery_potion', name: '', value: 1 });
item({ key: 'vi_304_hunter_potion', name: '', value: 1 });
item({ key: 'vi_50_magic_mirror', name: '', value: 1 });
item({ key: 'vi_42_shuriken', name: '', value: 1 });
item({ key: 'vi_295_featherfall_potion', name: '', value: 1 });
item({ key: 'vi_53_cloud_in_a_bottle', name: '', value: 1 });
item({ key: 'vi_2329_dangersense_potion', name: '', value: 1 });
item({ key: 'vi_40_wooden_arrow', name: '', value: 1 });
item({ key: 'vi_975_shoe_spikes', name: '', value: 1 });
item({ key: 'vi_54_hermes_boots', name: '', value: 1 });
item({ key: 'vi_301_thorns_potion', name: '', value: 1 });
item({ key: 'vi_49_band_of_regeneration', name: '', value: 1 });
item({ key: 'vi_2326_titan_potion', name: '', value: 1 });
item({ key: 'vi_297_invisibility_potion', name: '', value: 1 });
item({ key: 'vi_166_bomb', name: '', value: 1 });
item({ key: 'vi_5011_mace', name: '', value: 1 });
item({ key: 'vi_4425_shark_bait', name: '', value: 1 });
item({ key: 'vi_2351_teleportation_potion', name: '', value: 1 });
item({ key: 'vi_4460_sandcastle_bucket', name: '', value: 1 });
item({ key: 'vi_168_grenade', name: '', value: 1 });
item({ key: 'vi_227_restoration_potion', name: '', value: 1 });
item({ key: 'vi_930_flare_gun', name: '', value: 1 });
item({ key: 'vi_931_flare', name: '', value: 1 });
item({ key: 'vi_997_extractinator', name: '', value: 1 });
item({ key: 'vi_52_angel_statue', name: '', value: 1 });
item({ key: 'vi_265_hellfire_arrow', name: '', value: 1 });
item({ key: 'vi_298_shine_potion', name: '', value: 1 });
item({ key: 'vi_5007_dead_man_s_sweater', name: '', value: 1 });
item({ key: 'vi_117_meteorite_bar', name: '', value: 1 });
item({ key: 'vi_186_breathing_reed', name: '', value: 1 });
// ---- 浮漂饰品 5139-5146（Item.cs:41803-41840 DefaultToAccessory + glowMask 318-324）：
//      装备 → accFishingBobber（fishingSkill+10，Player.cs:12552-12554/:14121-14124）
//      + 浮标弹型覆写（UpdateFishingBobber :36244-36272 → overrideFishingBobber=986-993；
//      ItemCheck :46551-46553 抛竿时 projToShoot 改走覆写）----
item({ key: 'vi_5139_classic_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5140_amber_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5141_orange_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5142_green_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5143_blue_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5144_pink_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5145_purple_bobber', name: '', value: 1, maxStack: 1 });
item({ key: 'vi_5146_rainbow_bobber', name: '', value: 1, maxStack: 1 });
// ---- 呼吸族（CheckDrowning 装备链，2026-08 补齐；stats/装备归属/图标全走 vanilla 数据自动接线）----
item({ key: 'vi_250_fish_bowl', name: '', value: 1 });            // 鱼缸头盔：戴着恒淹（:22917）
item({ key: 'vi_4275_gold_goldfish_bowl', name: '', value: 1 });  // 金金鱼缸：同上
item({ key: 'vi_268_diving_helmet', name: '', value: 1 });        // accDivingHelm：breathCDMax ×6（:12829）
item({ key: 'vi_394_diving_gear', name: '', value: 1 });          // 潜水装备：divingHelm+flipper（:14652）
item({ key: 'vi_1860_jellyfish_diving_gear', name: '', value: 1 }); // :14689（浸水发光 :14686）
item({ key: 'vi_1861_arctic_diving_gear', name: '', value: 1 });  // :14701（+arcticDivingGear 冰水免疫）
item({ key: 'vi_497_neptune_s_shell', name: '', value: 1 });      // accMerman（:15019）
item({ key: 'vi_861_moon_shell', name: '', value: 1 });           // accMerman+狼人夜变（:14587）
item({ key: 'vi_3110_celestial_shell', name: '', value: 1 });     // accMerman+狼人夜变（:14855）
item({ key: 'vi_329_shadow_key', name: '', value: 1 });
item({ key: 'vi_974_ice_torch', name: '', value: 1 });
item({ key: 'vi_2322_mining_potion', name: '', value: 1 });
item({ key: 'vi_4915_tungsten_bullet', name: '', value: 1 });
item({ key: 'vi_946_umbrella', name: '', value: 1 });
item({ key: 'vi_939_web_slinger', name: '', value: 1 });
item({ key: 'vi_4870_potion_of_return', name: '', value: 1 });
item({ key: 'vi_288_obsidian_skin_potion', name: '', value: 1 });
item({ key: 'vi_31_bottle', name: '', value: 1 });
item({ key: 'vi_211_feral_claws', name: '', value: 1 });
item({ key: 'vi_4404_inner_tube', name: '', value: 1 });
item({ key: 'vi_187_flipper', name: '', value: 1 });
item({ key: 'vi_2198_ice_machine', name: '', value: 1 });
item({ key: 'vi_274_dark_lance', name: '', value: 1 });
item({ key: 'vi_285_aglet', name: '', value: 1 });
item({ key: 'vi_213_staff_of_regrowth', name: '', value: 1 });
item({ key: 'vi_964_boomstick', name: '', value: 1 });
item({ key: 'vi_1293_lihzahrd_power_cell', name: '', value: 1 });
// 旧日军团三件（ItemID.cs：3817 奖牌 / 3822 埃特尼亚魔力 / 3828 永恒水晶）无需手工
// 注册——下方 vanilla.json 自动注册循环已建 vi_<id>_<PascalKey> 条目；
// Game 侧按原版 id 寻物（slotVanillaId），见 useLihzahrdAltar/useEterniaStand。
item({ key: 'vi_2195_lihzahrd_furnace', name: '', value: 1 });
item({ key: 'vi_2766_solar_tablet_fragment', name: '', value: 1 });
item({ key: 'vi_300_battle_potion', name: '', value: 1 });
item({ key: 'vi_2348_inferno_potion', name: '', value: 1 });
item({ key: 'vi_218_flamelash', name: '', value: 1 });
item({ key: 'vi_3019_hellwing_bow', name: '', value: 1 });
item({ key: 'vi_112_flower_of_fire', name: '', value: 1 });
item({ key: 'vi_220_sunfury', name: '', value: 1 });
item({ key: 'vi_4345_can_of_worms', name: '', value: 1 });
item({ key: 'vi_953_climbing_claws', name: '', value: 1 });
item({ key: 'vi_3069_wand_of_sparking', name: '', value: 1 });
item({ key: 'vi_212_anklet_of_the_wind', name: '', value: 1 });
item({ key: 'vi_2204_honey_dispenser', name: '', value: 1 });
item({ key: 'vi_277_trident', name: '', value: 1 });
item({ key: 'vi_863_water_walking_boots', name: '', value: 1 });
item({ key: 'vi_751_cloud', name: '', value: 1 });
item({ key: 'vi_155_muramasa', name: '', value: 1 });
item({ key: 'vi_289_regeneration_potion', name: '', value: 1 });
item({ key: 'vi_906_lava_charm', name: '', value: 1 });
item({ key: 'vi_4055_dunerider_boots', name: '', value: 1 });
item({ key: 'vi_724_ice_blade', name: '', value: 1 });
item({ key: 'vi_670_ice_boomerang', name: '', value: 1 });
item({ key: 'vi_4061_storm_spear', name: '', value: 1 });
item({ key: 'vi_987_blizzard_in_a_bottle', name: '', value: 1 });
item({ key: 'vi_4551_slice_of_hell_cake', name: '', value: 1 });
item({ key: 'vi_5010_treasure_magnet', name: '', value: 1 });
// ---- 建筑族配饰（Player.cs:14714-14746 ApplyEquipFunctional:砌砖刀=放置提速/
// 加长握爪=射程+3+2/喷漆器=autoPaint/水泥机=铺墙提速/发明背包=全家桶/创造之手=
// 全家桶+treasureMagnet+chiselSpeed;407 工具腰带=装备生效 blockRange++ :14873）----
item({ key: 'vi_407_toolbelt', name: '', value: 1 });
item({ key: 'vi_2214_brick_layer', name: '', value: 1 });
item({ key: 'vi_2215_extendo_grip', name: '', value: 1 });
item({ key: 'vi_2216_paint_sprayer', name: '', value: 1 });
item({ key: 'vi_2217_portable_cement_mixer', name: '', value: 1 });
item({ key: 'vi_3061_architect_gizmo_pack', name: '', value: 1 });
item({ key: 'vi_5126_hand_of_creation', name: '', value: 1 });
item({ key: 'vi_2323_heartreach_potion', name: '', value: 1 });
item({ key: 'vi_2345_lifeforce_potion', name: '', value: 1 });
item({ key: 'vi_290_swiftness_potion', name: '', value: 1 });
item({ key: 'vi_291_gills_potion', name: '', value: 1 });
item({ key: 'vi_280_spear', name: '', value: 1 });
item({ key: 'vi_2325_builder_potion', name: '', value: 1 });
item({ key: 'vi_284_wooden_boomerang', name: '', value: 1 });
item({ key: 'vi_2192_bone_welder', name: '', value: 1 });
item({ key: 'vi_5234_remnants_of_devotion', name: '', value: 1 });
item({ key: 'vi_156_cobalt_shield', name: '', value: 1 });
item({ key: 'vi_157_aqua_scepter', name: '', value: 1 });
item({ key: 'vi_163_blue_moon', name: '', value: 1 });
item({ key: 'vi_113_magic_missile', name: '', value: 1 });
item({ key: 'vi_3317_valor', name: '', value: 1 });
item({ key: 'vi_327_golden_key', name: '', value: 1 });
item({ key: 'vi_164_handgun', name: '', value: 1 });
item({ key: 'vi_294_magic_power_potion', name: '', value: 1 });
item({ key: 'vi_4263_magic_conch', name: '', value: 1 });
item({ key: 'vi_4062_thunder_zapper', name: '', value: 1 });
item({ key: 'vi_1579_flurry_boots', name: '', value: 1 });
item({ key: 'vi_4056_ancient_chisel', name: '', value: 1 });
item({ key: 'vi_4346_encumbering_stone', name: '', value: 1 });
item({ key: 'vi_1319_snowball_cannon', name: '', value: 1 });
// 雪球弹 949（AmmoID.Snowball=AmmoID.cs:134；雪球炮 1319 useAmmo=949，Item.cs:16318——
// combat.ammo=949 供 PickAmmo 反查；此前未注册 = 雪球炮无弹可装）
item({ key: 'vi_949_snowball', name: '', value: 1 });
item({ key: 'vi_3199_ice_mirror', name: '', value: 1 });
item({ key: 'vi_950_ice_skates', name: '', value: 1 });
item({ key: 'vi_4443_demonic_hellcart', name: '', value: 1 });
item({ key: 'vi_4737_ornate_shadow_key', name: '', value: 1 });
item({ key: 'vi_4276_bast_statue', name: '', value: 1 });
item({ key: 'vi_4262_snake_charmer_s_flute', name: '', value: 1 });
item({ key: 'vi_3093_herb_bag', name: '', value: 1 });
item({ key: 'vi_292_ironskin_potion', name: '', value: 1 });
item({ key: 'vi_3084_radar', name: '', value: 1 });
item({ key: 'vi_15_copper_watch', name: '', value: 1 });
item({ key: 'vi_16_silver_watch', name: '', value: 1 });
item({ key: 'vi_17_gold_watch', name: '', value: 1 });
item({ key: 'vi_18_depth_meter', name: '', value: 1 });
item({ key: 'vi_393_compass', name: '', value: 1 });
item({ key: 'vi_395_gps', name: '', value: 1 });
item({ key: 'vi_707_tin_watch', name: '', value: 1 });
item({ key: 'vi_708_tungsten_watch', name: '', value: 1 });
item({ key: 'vi_709_platinum_watch', name: '', value: 1 });
item({ key: 'vi_3036_fish_finder', name: '', value: 1 });
item({ key: 'vi_3037_weather_radio', name: '', value: 1 });
item({ key: 'vi_3095_tally_counter', name: '', value: 1 });
item({ key: 'vi_3096_sextant', name: '', value: 1 });
item({ key: 'vi_3099_stopwatch', name: '', value: 1 });
item({ key: 'vi_3102_metal_detector', name: '', value: 1 });
item({ key: 'vi_3118_lifeform_analyzer', name: '', value: 1 });
item({ key: 'vi_3119_dps_meter', name: '', value: 1 });
item({ key: 'vi_3120_fishermans_guide', name: '', value: 1 });
item({ key: 'vi_3121_goblin_tech', name: '', value: 1 });
item({ key: 'vi_3122_rek_3000', name: '', value: 1 });
item({ key: 'vi_3123_pda', name: '', value: 1 });
item({ key: 'vi_5358_shellphone', name: '', value: 1 });
item({ key: 'vi_5359_shellphone_spawn', name: '', value: 1 });
item({ key: 'vi_5360_shellphone_ocean', name: '', value: 1 });
item({ key: 'vi_5361_shellphone_hell', name: '', value: 1 });
item({ key: 'vi_4341_step_stool', name: '', value: 1 });
item({ key: 'vi_4978_fledgling_wings', name: '', value: 1 });
item({ key: 'vi_2197_sky_mill', name: '', value: 1 });
item({ key: 'vi_158_lucky_horseshoe', name: '', value: 1 });
item({ key: 'vi_5254_blessing_from_the_heavens', name: '', value: 1 });
item({ key: 'vi_1156_piranha_gun', name: '', value: 1 });
item({ key: 'vi_1571_scourge_of_the_corruptor', name: '', value: 1 });
item({ key: 'vi_1260_rainbow_gun', name: '', value: 1 });
item({ key: 'vi_1572_staff_of_the_frost_hydra', name: '', value: 1 });
item({ key: 'vi_4607_desert_tiger_staff', name: '', value: 1 });
item({ key: 'vi_933_leaf_wand', name: '', value: 1 });
item({ key: 'vi_832_living_wood_wand', name: '', value: 1 });
item({ key: 'vi_4066_desert_minecart', name: '', value: 1 });
item({ key: 'vi_4450_shroom_minecart', name: '', value: 1 });
item({ key: 'vi_4423_scarab_bomb', name: '', value: 1 });
item({ key: 'vi_159_shiny_red_balloon', name: '', value: 1 });
item({ key: 'vi_5258_see_the_world_for_what_it_is', name: '', value: 1 });
item({ key: 'vi_65_starfury', name: '', value: 1 });
item({ key: 'vi_5388_eye_of_the_sun', name: '', value: 1 });
item({ key: 'vi_2219_celestial_magnet', name: '', value: 1 });
item({ key: 'vi_5255_love_is_in_the_trash_slot', name: '', value: 1 });
item({ key: 'vi_4426_bee_minecart', name: '', value: 1 });
item({ key: 'vi_3017_flower_boots', name: '', value: 1 });
item({ key: 'vi_3360_living_mahogany_wand', name: '', value: 1 });
item({ key: 'vi_3361_rich_mahogany_leaf_wand', name: '', value: 1 });
item({ key: 'vi_1309_slime_staff', name: '', value: 1 });
item({ key: 'vi_1845_necromantic_scroll', name: '', value: 1 });
item({ key: 'vi_1864_papyrus_scarab', name: '', value: 1 });
item({ key: 'vi_1158_pygmy_necklace', name: '', value: 1 });
item({ key: 'vi_3034_coin_ring', name: '', value: 1 });
item({ key: 'vi_308_moonglow_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 1 });
item({ key: 'vi_312_fireblossom_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 5 });
item({ key: 'vi_310_deathweed_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 4 });
item({ key: 'vi_307_daybloom_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 0 });
item({ key: 'vi_309_blinkroot_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 2 });
item({ key: 'vi_2357_shiverthorn_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 6 });
item({ key: 'vi_311_waterleaf_seeds', name: '', value: 1, tile: 'v_83_herbs_mature', placeStyle: 3 });
item({ key: 'vi_1828_pumpkin_seed', name: '', value: 1 });
item({ key: 'vi_126_bottled_water', name: '', value: 1 });
item({ key: 'vi_1134_bottled_honey', name: '', value: 1 });
item({ key: 'vi_3068_guide_to_plant_fiber_cordage', name: '', value: 1 });
item({ key: 'vi_4779_mushroom_hat', name: '', value: 1 });
item({ key: 'vi_4780_mushroom_vest', name: '', value: 1 });
item({ key: 'vi_4781_mushroom_pants', name: '', value: 1 });

// ===================== FTW_V2 补全物品（占位收集品） =====================
item({ key: 'vi_678_red_potion', name: '', value: 1 });
item({ key: 'vi_281_blowpipe', name: '', value: 1 });
item({ key: 'vi_293_mana_regeneration_potion', name: '', value: 1 });
item({ key: 'vi_2767_solar_tablet', name: '', value: 1 });
item({ key: 'vi_3213_money_trough', name: '', value: 1 });
item({ key: 'vi_2757_vortex_helmet', name: '', value: 1 });
item({ key: 'vi_4989_soaring_insignia', name: '', value: 1 });
item({ key: 'vi_3383_stardust_leggings', name: '', value: 1 });
item({ key: 'vi_4914_kaleidoscope', name: '', value: 1 });
item({ key: 'vi_1991_bug_net', name: '', value: 1 });
item({ key: 'vi_4828_superheated_blood', name: '', value: 1 });
item({ key: 'vi_3509_copper_pickaxe', name: '', value: 1 });
item({ key: 'vi_3507_copper_shortsword', name: '', value: 1 });
item({ key: 'vi_4755_grox_the_great_s_horned_cowl', name: '', value: 1 });
item({ key: 'vi_4756_grox_the_great_s_chestplate', name: '', value: 1 });
item({ key: 'vi_4757_grox_the_great_s_greaves', name: '', value: 1 });
item({ key: 'vi_5000_terraspark_boots', name: '', value: 1 });
item({ key: 'vi_5339_arcane_crystal', name: '', value: 1 });
// 永久幸运消耗品（Player.cs:44786-44789：一次性 usedGalaxyPearl → luck +0.03 :28676-28678）
item({ key: 'vi_5340_galaxy_pearl', name: '', value: 1 });
// 漂亮镜子（Item 5577：投掷消耗品，shoot 1085；碎裂近身 150px → brokenMirrorBadLuckTime
// 25200，Projectile.cs:67554-67574）——投掷走 thrownCombat 通用管线
item({ key: 'vi_5577_pretty_mirror', name: '', value: 1 });
item({ key: 'vi_5391_uncumbering_stone', name: '', value: 1 });
item({ key: 'vi_2585_slime_hook', name: '', value: 1 });
item({ key: 'vi_313_daybloom', name: '', value: 1 });
item({ key: 'vi_267_guide_voodoo_doll', name: '', value: 1 });
item({ key: 'vi_2649_steampunk_candle', name: '', value: 1 });
item({ key: 'vi_286_sticky_glowstick', name: '', value: 1 });
item({ key: 'vi_3002_spelunker_glowstick', name: '', value: 1 });
item({ key: 'vi_4819_demon_conch', name: '', value: 1 });
item({ key: 'vi_1802_raven_staff', name: '', value: 1 });
item({ key: 'vi_3382_stardust_plate', name: '', value: 1 });
item({ key: 'vi_3270_item_frame', name: '', value: 1 });
item({ key: 'vi_3771_ancient_horn', name: '', value: 1 });
item({ key: 'vi_4281_finch_staff', name: '', value: 1 });
item({ key: 'vi_5407_star_royale_brick', name: '', value: 1, tile: 'v_675_star_royale_brick' });
item({ key: 'vi_5401_lunar_rust_brick', name: '', value: 1, tile: 'v_669_lunar_rust_brick' });
// 月相砖族补全（3461 微光转化目标，ItemID.cs:5401-5408;★曾缺 5402/5406/5408 →
// 转化到这三相静默丢物;tile 744-751? 见 vanilla sheet 注册——砖块放置链按需接）
item({ key: 'vi_5402_dark_celestial_brick', name: '', value: 1, tile: 'v_670_dark_celestial_brick' });
item({ key: 'vi_5406_mercury_brick', name: '', value: 1, tile: 'v_674_mercury_brick' });
item({ key: 'vi_5408_heavenforge_brick', name: '', value: 1, tile: 'v_676_heavenforge_brick' });
item({ key: 'vi_4716_mollusk_whistle', name: '', value: 1 });
item({ key: 'vi_3540_phantasm', name: '', value: 1 });
item({ key: 'vi_2176_shroomite_digging_claw', name: '', value: 1 });
item({ key: 'vi_2349_wrath_potion', name: '', value: 1 });
item({ key: 'vi_4679_morning_star', name: '', value: 1 });
item({ key: 'vi_1169_bone_key', name: '', value: 1 });
item({ key: 'vi_3863_betsy_mask', name: '', value: 1 });
item({ key: 'vi_3124_cell_phone', name: '', value: 1 });
item({ key: 'vi_3506_copper_axe', name: '', value: 1 });
item({ key: 'vi_4680_dark_harvest', name: '', value: 1 });
item({ key: 'vi_543_brown_pressure_plate', name: '', value: 1 });
item({ key: 'vi_171_sign', name: '', value: 1 });
item({ key: 'vi_1723_living_wood_wall', name: '', value: 1 });
item({ key: 'vi_4754_grox_the_great_s_wings', name: '', value: 1 });
item({ key: 'vi_3353_mechanical_cart', name: '', value: 1 });
item({ key: 'vi_2287_winter_cape', name: '', value: 1 });
item({ key: 'vi_1179_chlorophyte_bullet', name: '', value: 1 });
item({ key: 'vi_4766_world_globe', name: '', value: 1 });
item({ key: 'vi_4954_celestial_starboard', name: '', value: 1 });
// ---- 原版翅膀全量注册（vanilla-itemstats wing 槽 47 只补齐 42 缺——
// 属性链 wingSlot→wingStatOf 1:1 已备，图标 atlas 全覆盖；2026-08-13 ----
item({ key: 'vi_492_恶魔之翼', name: '', value: 1 });
item({ key: 'vi_493_天使之翼', name: '', value: 1 });
item({ key: 'vi_665_red的翅膀', name: '', value: 1 });
item({ key: 'vi_748_jetpack', name: '', value: 1 });
item({ key: 'vi_749_蝴蝶之翼', name: '', value: 1 });
item({ key: 'vi_761_仙灵之翼', name: '', value: 1 });
item({ key: 'vi_785_鸟妖之翼', name: '', value: 1 });
item({ key: 'vi_786_骨之翼', name: '', value: 1 });
item({ key: 'vi_821_烈焰之翼', name: '', value: 1 });
item({ key: 'vi_822_冰冻之翼', name: '', value: 1 });
item({ key: 'vi_823_幽灵之翼', name: '', value: 1 });
item({ key: 'vi_948_蒸汽朋克之翼', name: '', value: 1 });
item({ key: 'vi_1162_叶之翼', name: '', value: 1 });
item({ key: 'vi_1165_蝙蝠之翼', name: '', value: 1 });
item({ key: 'vi_1515_蜜蜂之翼', name: '', value: 1 });
item({ key: 'vi_1583_dtownswings', name: '', value: 1 });
item({ key: 'vi_1584_will的翅膀', name: '', value: 1 });
item({ key: 'vi_1585_crowno的翅膀', name: '', value: 1 });
item({ key: 'vi_1586_cenx的翅膀', name: '', value: 1 });
item({ key: 'vi_1797_褴褛仙灵之翼', name: '', value: 1 });
item({ key: 'vi_1830_阴森之翼', name: '', value: 1 });
item({ key: 'vi_1866_hoverboard', name: '', value: 1 });
item({ key: 'vi_1871_喜庆之翼', name: '', value: 1 });
item({ key: 'vi_2280_甲虫之翼', name: '', value: 1 });
item({ key: 'vi_2494_鳍翼', name: '', value: 1 });
item({ key: 'vi_2609_猪龙鱼之翼', name: '', value: 1 });
item({ key: 'vi_2770_蛾怪之翼', name: '', value: 1 });
item({ key: 'vi_3228_lazure的屏障台', name: '', value: 1 });
item({ key: 'vi_3580_yoraiz0r的魔法', name: '', value: 1 });
item({ key: 'vi_3582_jim的翅膀', name: '', value: 1 });
item({ key: 'vi_3588_skiphs的爪子', name: '', value: 1 });
item({ key: 'vi_3592_loki的翅膀', name: '', value: 1 });
item({ key: 'vi_3883_双足翼龙之翼', name: '', value: 1 });
item({ key: 'vi_3924_arkhalis的飞翼', name: '', value: 1 });
item({ key: 'vi_3928_leinfors的卷缠斗篷', name: '', value: 1 });
item({ key: 'vi_4746_safeman的毛毯斗篷', name: '', value: 1 });
item({ key: 'vi_4823_女皇之翼', name: '', value: 1 });
item({ key: 'vi_5586_鸡骨翅膀', name: '', value: 1 });
item({ key: 'vi_5627_花栗鼠斗篷', name: '', value: 1 });
item({ key: 'vi_5659_英雄翅膀', name: '', value: 1 });
item({ key: 'vi_5686_卡兹默德斯之翼', name: '', value: 1 });
item({ key: 'vi_6140_露娜的符文妖精翅膀', name: '', value: 1 });
// ---- 月总前四翅膀（3468-3471，Item.cs:31072-31082 `wingSlot = (sbyte)(29 + type
// - 3468)` 算式族——提取器表达式槽位补齐后入表 wing 29-32；配方@远古操纵机
// vanilla-recipes 已备；2026-08-19）----
item({ key: 'vi_3468_solar_wings', name: '', value: 1 });
item({ key: 'vi_3469_vortex_booster', name: '', value: 1 });
item({ key: 'vi_3470_nebula_mantle', name: '', value: 1 });
item({ key: 'vi_3471_stardust_wings', name: '', value: 1 });
item({ key: 'vi_5669_true_copper_shortsword', name: '', value: 1 });
item({ key: 'vi_1296_earth_staff', name: '', value: 1 });
item({ key: 'vi_3473_solar_eruption', name: '', value: 1 });
item({ key: 'vi_2880_influx_waver', name: '', value: 1 });
item({ key: 'vi_4722_first_fractal', name: '', value: 1 });
item({ key: 'vi_3870_betsys_wrath', name: '', value: 1 });
item({ key: 'vi_3098_butchers_chainsaw', name: '', value: 1 });
// ---- 原版远程武器+弹药全量注册（useAmmo 族对账 2026-08-13：枪 24/弓弩 39/
// 发射器 7/吹箭 4——此前仅 6 把，弹链数据驱动已备）----
// ★键名卫生（2026-08-23 备案遗留③）：下列 vi_ 键后缀曾张冠李戴（泥灰墙/彩虹砖墙/
// 铂金砖墙/地牢砖墙/纯数字垃圾段），本次按 1457 ItemID.cs 常量 + 官方 zh-Hans 译名
// 改正（:1624 WoodenBow=39/:1634 DemonBow=44/:1640 UnholyArrow=47/:1736
// FlintlockPistol=95/:1738 Musket=96/:1740 MusketBall=97/:1742 Minishark=98/
// :1744 IronBow=99/:1786 MoltenFury=120/:2014 MeteorShot=234/:2102 SilverBullet=278）。
// ★vid 一律不动——稳定 id 表只取 vi_<id>_ 前缀（本文件尾 ITEM_STABLE_OF_INTERNAL 段
// :2043-2054），存档 v3/v4 走数值稳定 id、v2 裸下标走冻结快照
// legacyItemIndex.generated.json（经查不含旧键）→ 改后缀零存档兼容风险,无需别名映射。
// 显示名走 vi_<id>_ 前缀解析（Lang.ts:93-100）同样不受后缀影响。全库 grep 消费点:
// 仅本文件定义 + idNames.generated.ts 生成表 1 处（已同步）;诊断脚本均按 /^vi_NNN_/
// 前缀正则匹配,不受影响。
item({ key: 'vi_95_燧发枪', name: '', value: 1 });      // FlintlockPistol（曾误名"地牢砖墙"）
item({ key: 'vi_96_火枪', name: '', value: 1 });        // Musket（曾误名"地牢砖墙"）
item({ key: 'vi_98_迷你鲨', name: '', value: 1 });      // Minishark（曾误名"地牢砖墙"）
item({ key: 'vi_219_凤凰爆破枪', name: '', value: 1 });
item({ key: 'vi_434_发条式突击步枪', name: '', value: 1 });
item({ key: 'vi_533_megashark', name: '', value: 1 });
item({ key: 'vi_534_shotgun', name: '', value: 1 });
item({ key: 'vi_679_战术霰弹枪', name: '', value: 1 });
item({ key: 'vi_800_夺命枪', name: '', value: 1 });
item({ key: 'vi_1254_狙击步枪', name: '', value: 1 });
item({ key: 'vi_1255_维纳斯万能枪', name: '', value: 1 });
item({ key: 'vi_1265_uzi', name: '', value: 1 });
item({ key: 'vi_1553_太空海豚机枪', name: '', value: 1 });
item({ key: 'vi_1870_红莱德枪', name: '', value: 1 });
item({ key: 'vi_1929_链式机枪', name: '', value: 1 });
item({ key: 'vi_2269_revolver', name: '', value: 1 });
item({ key: 'vi_2270_gatligator', name: '', value: 1 });
item({ key: 'vi_2797_xenopopper', name: '', value: 1 });
item({ key: 'vi_3475_星旋机枪', name: '', value: 1 });
item({ key: 'vi_3788_玛瑙爆破枪', name: '', value: 1 });
// 四管霰弹枪 4703（Item.cs:38628-38640 DefaultToRangedWeapon(14,Bullet,55,7f)——
// 战斗数值已回填 vanilla-itemcombat.json 键"4703"；图标经 vi_ 键回退 vanilla.json items['4703'].icon）
item({ key: 'vi_4703_四管霰弹枪', name: '', value: 1 });
item({ key: 'vi_5117_气喇叭', name: '', value: 1 });
// ---- 备案遗留④五枪（2026-08-23，数值全在 vanilla-itemcombat.json 1457 终值，
//      图标经 vi_ 键回退 vanilla.json items['<id>'].icon）----
// 127 太空枪（Item.cs:2911-2929：magic/mana6/shoot 20 灰色电弧/伤20/速17/use17——
//   UseSound=Item157，任务书里"shoot157?"系 UseSound 误记）
item({ key: 'vi_127_太空枪', name: '', value: 1 });
// 514 激光枪（Item.cs:7498-7516：magic/mana8/shoot 88 紫激光/伤29/速17/use12）
item({ key: 'vi_514_激光枪', name: '', value: 1 });
// 3107 钉枪（Item.cs:28758-28774：ranged/useAmmo 3108 钉弹/shoot 514/伤85/use15；
//   散布 ±Next(-40,41)×0.02 见 Game.ts 逐枪散布表）
item({ key: 'vi_3107_钉枪', name: '', value: 1 });
item({ key: 'vi_3108_钉', name: '', value: 1 });   // Nail 弹药（Item.cs:28775-28787：shoot 514/伤30/速6）
// 1782 糖果玉米步枪（Item.cs:19751-19771：ranged/useAmmo 1783/shoot 311/伤60/
//   crit+6/use9；1/3 省弹 GUN_AMMO_SAVE 已录）
item({ key: 'vi_1782_糖果玉米步枪', name: '', value: 1 });
item({ key: 'vi_1783_糖果玉米', name: '', value: 1 });   // CandyCorn 弹药（Item.cs:19772-19784：shoot 311/伤9/速4）
// 1258 刺炮发射器 Stynger（Item.cs:15588-15605：ranged/useAmmo 1261 刺炮弹/
//   shoot 246/伤45/kb5/use22；弹 246 Kill 爆炸+撒 249 破片链已在
//   Game.onProjectileDeath 246 分支；散布 ±0.01+出生点抖动见 Game.ts）
item({ key: 'vi_1258_刺炮发射器', name: '', value: 1 });
item({ key: 'vi_1261_刺炮弹', name: '', value: 1 });   // StyngerBolt 弹药（Item.cs:1261 段：shoot 246/伤17/速2）
item({ key: 'vi_39_木弓', name: '', value: 1 });        // WoodenBow（曾误名"泥灰墙"）
item({ key: 'vi_44_恶魔弓', name: '', value: 1 });      // DemonBow（曾误名"彩虹砖墙"）
item({ key: 'vi_99_铁弓', name: '', value: 1 });        // IronBow（曾误名"地牢砖墙"）
item({ key: 'vi_120_熔火之怒', name: '', value: 1 });   // MoltenFury（曾误名"1952"纯数字垃圾段）
item({ key: 'vi_435_钴连弩', name: '', value: 1 });
item({ key: 'vi_436_秘银连弩', name: '', value: 1 });
item({ key: 'vi_481_精金连弩', name: '', value: 1 });
item({ key: 'vi_578_神圣连弩', name: '', value: 1 });
item({ key: 'vi_655_乌木弓', name: '', value: 1 });
item({ key: 'vi_658_红木弓', name: '', value: 1 });
item({ key: 'vi_661_珍珠木弓', name: '', value: 1 });
item({ key: 'vi_682_marrow', name: '', value: 1 });
item({ key: 'vi_725_冰雪弓', name: '', value: 1 });
item({ key: 'vi_796_肌腱弓', name: '', value: 1 });
item({ key: 'vi_923_暗影木弓', name: '', value: 1 });
item({ key: 'vi_1187_钯金连弩', name: '', value: 1 });
item({ key: 'vi_1194_山铜连弩', name: '', value: 1 });
item({ key: 'vi_1201_钛金连弩', name: '', value: 1 });
item({ key: 'vi_1229_叶绿连弩', name: '', value: 1 });
item({ key: 'vi_2223_脉冲弓', name: '', value: 1 });
item({ key: 'vi_2515_棕榈木弓', name: '', value: 1 });
item({ key: 'vi_2624_tsunami', name: '', value: 1 });
item({ key: 'vi_2747_针叶木弓', name: '', value: 1 });
item({ key: 'vi_2888_蜂膝弓', name: '', value: 1 });
item({ key: 'vi_3029_代达罗斯风暴弓', name: '', value: 1 });
item({ key: 'vi_3052_暗影焰弓', name: '', value: 1 });
item({ key: 'vi_3480_铂金弓', name: '', value: 1 });
item({ key: 'vi_3486_钨弓', name: '', value: 1 });
item({ key: 'vi_3492_铅弓', name: '', value: 1 });
item({ key: 'vi_3498_锡弓', name: '', value: 1 });
item({ key: 'vi_3504_铜弓', name: '', value: 1 });
item({ key: 'vi_3510_银弓', name: '', value: 1 });
item({ key: 'vi_3516_金弓', name: '', value: 1 });
item({ key: 'vi_3854_幽灵凤凰', name: '', value: 1 });
item({ key: 'vi_3859_空中祸害', name: '', value: 1 });
item({ key: 'vi_4953_eventide', name: '', value: 1 });
item({ key: 'vi_5282_灰烬木弓', name: '', value: 1 });
item({ key: 'vi_758_榴弹发射器', name: '', value: 1 });
item({ key: 'vi_759_火箭发射器', name: '', value: 1 });
item({ key: 'vi_760_感应雷发射器', name: '', value: 1 });
item({ key: 'vi_1946_雪人炮', name: '', value: 1 });
item({ key: 'vi_2796_电圈发射器', name: '', value: 1 });
item({ key: 'vi_3546_celebration', name: '', value: 1 });
item({ key: 'vi_3930_喜庆弹射器mk2', name: '', value: 1 });
item({ key: 'vi_986_blowgun', name: '', value: 1 });
item({ key: 'vi_3007_飞镖手枪', name: '', value: 1 });
item({ key: 'vi_3008_飞镖步枪', name: '', value: 1 });
// ---- 远程弹药全量（ammo 字段族：子弹 16/箭 15/火箭 12/飞镖 5——PickAmmo 背包/弹药栏扫描用）----
item({ key: 'vi_97_火枪子弹', name: '', value: 1 });    // MusketBall（曾误名"地牢砖墙"）
item({ key: 'vi_234_流星弹', name: '', value: 1 });     // MeteorShot（曾误名"4052"垃圾段）
item({ key: 'vi_278_银子弹', name: '', value: 1 });     // SilverBullet（曾误名"4515"垃圾段）
item({ key: 'vi_515_水晶子弹', name: '', value: 1 });
item({ key: 'vi_546_诅咒弹', name: '', value: 1 });
item({ key: 'vi_1302_高速子弹', name: '', value: 1 });
item({ key: 'vi_1335_灵液弹', name: '', value: 1 });
item({ key: 'vi_1342_毒液弹', name: '', value: 1 });
item({ key: 'vi_1349_派对弹', name: '', value: 1 });
item({ key: 'vi_1350_纳米弹', name: '', value: 1 });
item({ key: 'vi_1351_爆破弹', name: '', value: 1 });
item({ key: 'vi_1352_金子弹', name: '', value: 1 });
item({ key: 'vi_3104_无尽火枪袋', name: '', value: 1 });
item({ key: 'vi_3567_夜明弹', name: '', value: 1 });
item({ key: 'vi_47_邪箭', name: '', value: 1 });        // UnholyArrow（曾误名"铂金砖墙"）
item({ key: 'vi_516_圣箭', name: '', value: 1 });
item({ key: 'vi_545_诅咒箭', name: '', value: 1 });
item({ key: 'vi_988_霜冻箭', name: '', value: 1 });
item({ key: 'vi_1235_叶绿箭', name: '', value: 1 });
item({ key: 'vi_1334_灵液箭', name: '', value: 1 });
item({ key: 'vi_1341_毒液箭', name: '', value: 1 });
item({ key: 'vi_3003_骨箭', name: '', value: 1 });
item({ key: 'vi_3103_无尽箭袋', name: '', value: 1 });
item({ key: 'vi_3568_夜明箭', name: '', value: 1 });
item({ key: 'vi_5348_微光箭', name: '', value: 1 });
item({ key: 'vi_771_火箭一型', name: '', value: 1 });
item({ key: 'vi_772_火箭二型', name: '', value: 1 });
item({ key: 'vi_773_火箭三型', name: '', value: 1 });
item({ key: 'vi_774_火箭四型', name: '', value: 1 });
item({ key: 'vi_4445_集束火箭一型', name: '', value: 1 });
item({ key: 'vi_4446_集束火箭二型', name: '', value: 1 });
item({ key: 'vi_4447_湿火箭', name: '', value: 1 });
item({ key: 'vi_4448_熔岩火箭', name: '', value: 1 });
item({ key: 'vi_4449_蜂蜜火箭', name: '', value: 1 });
item({ key: 'vi_4457_迷你核弹一型', name: '', value: 1 });
item({ key: 'vi_4458_迷你核弹二型', name: '', value: 1 });
item({ key: 'vi_4459_干火箭', name: '', value: 1 });
item({ key: 'vi_1310_毒镖', name: '', value: 1 });
item({ key: 'vi_3009_水晶镖', name: '', value: 1 });
item({ key: 'vi_3010_诅咒镖', name: '', value: 1 });
item({ key: 'vi_3011_灵液镖', name: '', value: 1 });
item({ key: 'vi_4730_ghostar_s_infinity_eight', name: '', value: 1 });
item({ key: 'vi_4758_blade_staff', name: '', value: 1 });
item({ key: 'vi_4765_tree_globe', name: '', value: 1 });
item({ key: 'vi_5342_ambrosia', name: '', value: 1 });
item({ key: 'vi_5328_chest_lock', name: '', value: 1 });
item({ key: 'vi_5343_peddler_s_satchel', name: '', value: 1 });
item({ key: 'vi_5285_moon_globe', name: '', value: 1 });
item({ key: 'vi_5289_minecart_upgrade_kit', name: '', value: 1 });
item({ key: 'vi_5336_advanced_combat_techniques_volume_two', name: '', value: 1 });
item({ key: 'vi_5451_kwad_racer_drone', name: '', value: 1 });
item({ key: 'vi_5359_shellphone_spawn', name: '', value: 1 });
item({ key: 'vi_3032_super_absorbant_sponge', name: '', value: 1 });
item({ key: 'vi_3031_bottomless_water_bucket', name: '', value: 1 });
// 桶/海绵族第二批（Player.ItemCheck_UseBuckets Player.cs:45704-45890 族表 :45706；
// 行为见 core/Game.ts useBucket——无底桶倾倒不消耗/海绵吸液不消耗无饱和变体）：
// 4820 无底岩浆桶（Item.cs:39442）/4872 岩浆海绵（:39637）/5302 无底蜂蜜桶（:42032）/
// 5303 蜂蜜海绵（:42044）/5304 终极海绵（:42056,useTime 3）/5364 无底微光桶（:42524）
item({ key: 'vi_4820_bottomless_lava_bucket', name: '', value: 1 });
item({ key: 'vi_4872_lava_absorbant_sponge', name: '', value: 1 });
item({ key: 'vi_5302_bottomless_honey_bucket', name: '', value: 1 });
item({ key: 'vi_5303_honey_absorbant_sponge', name: '', value: 1 });
item({ key: 'vi_5304_ultra_absorbant_sponge', name: '', value: 1 });
item({ key: 'vi_5364_bottomless_shimmer_bucket', name: '', value: 1 });
item({ key: 'vi_509_red_wrench', name: '', value: 1, wireTool: { place: 1 } }); // ←vi_509_Wrench 独有字段搬移(批次A)
item({ key: 'vi_4741_butcher_s_bloodstained_apron', name: '', value: 1 });
item({ key: 'vi_3065_star_wrath', name: '', value: 1 });
item({ key: 'vi_3063_meowmere', name: '', value: 1 });
item({ key: 'vi_3372_lunatic_cultist_mask', name: '', value: 1 });
// 3373 月亮领主面具：与 3372 同一 case 共享体（Item.cs:30798-30808
// `headSlot = type + 186 - 3372` 算式 → 186/187），2026-08-19 表达式槽位补齐
item({ key: 'vi_3373_moon_lord_mask', name: '', value: 1 });
item({ key: 'vi_1504_spectre_robe', name: '', value: 1 });
item({ key: 'vi_2769_cosmic_car_key', name: '', value: 1 });
item({ key: 'vi_216_shackle', name: '', value: 1 });
item({ key: 'vi_4415_stone_door', name: '', value: 1 });
item({ key: 'vi_1681_skeleton_banner', name: '', value: 1 });
item({ key: 'vi_283_seed', name: '', value: 1 });
item({ key: 'vi_1173_grave_marker', name: '', value: 1 });
item({ key: 'vi_4379_wyvern_kite', name: '', value: 1, tile: 'v_723_kite_anchor' }); // ←vi_4379_KiteWyvern 独有字段搬移(批次A)
item({ key: 'vi_4378_xenon_moss', name: '', value: 1 });
item({ key: 'vi_4377_krypton_moss', name: '', value: 1 });
item({ key: 'vi_4376_rat_cage', name: '', value: 1, tile: 'v_533_rat_cage' });  // createTile=533 placeStyle=0（Item.cs:37240-37244）——笼族放置链样板：物种=tile id、无捕获机制，详见 render/CritterCage.ts GAP ①
item({ key: 'vi_4375_rat', name: '', value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // ←vi_4375_Rat 独有字段搬移(批次A)
item({ key: 'vi_4484_1_2_second_timer', name: '', value: 1 });
item({ key: 'vi_4824_wet_bomb', name: '', value: 1 });
item({ key: 'vi_4485_1_4_second_timer', name: '', value: 1 });
item({ key: 'vi_5378_cursed_flare', name: '', value: 1 });
item({ key: 'vi_5354_reflective_shades', name: '', value: 1 });
item({ key: 'vi_5387_raynbro_s_pants', name: '', value: 1 });
item({ key: 'vi_5386_raynbro_s_hoodie', name: '', value: 1 });
item({ key: 'vi_5390_raynbro_s_hood', name: '', value: 1 });
item({ key: 'vi_5338_aegis_fruit', name: '', value: 1 });
item({ key: 'vi_5404_cosmic_ember_brick', name: '', value: 1, tile: 'v_672_cosmic_ember_brick' });
item({ key: 'vi_5405_cryocore_brick', name: '', value: 1, tile: 'v_673_cryocore_brick' });
item({ key: 'vi_5403_astra_brick', name: '', value: 1, tile: 'v_671_astra_brick' });
item({ key: 'vi_346_safe', name: '', value: 1 });
item({ key: 'vi_4829_cat_license', name: '', value: 1 });
item({ key: 'vi_4830_dog_license', name: '', value: 1 });
item({ key: 'vi_4910_bunny_license', name: '', value: 1 });
item({ key: 'vi_3335_demon_heart', name: '', value: 1 });
item({ key: 'vi_4750_foodbarbarian_s_tattered_dragon_wings', name: '', value: 1 });
item({ key: 'vi_3042_phase_dye', name: '', value: 1 });
item({ key: 'vi_3024_skiphs_blood', name: '', value: 1 });
item({ key: 'vi_3054_shadowflame_knife', name: '', value: 1 });
item({ key: 'vi_5275_joja_cola', name: '', value: 1 });
item({ key: 'vi_5278_pomegranate', name: '', value: 1 });
item({ key: 'vi_5277_spicy_pepper', name: '', value: 1 });
item({ key: 'vi_5437_shellphone', name: '', value: 1 });
item({ key: 'vi_1507_spectre_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 90 }, axePower: 30 }); // ←vi_1507_SpectreHamaxe 独有字段搬移(批次A)
item({ key: 'vi_2250_steampunk_chest', name: '', value: 1 });
item({ key: 'vi_392_glass_wall', name: '', value: 1 });
item({ key: 'vi_2699_weapon_rack', name: '', value: 1 });
item({ key: 'vi_3552_blue_flame_and_silver_dye', name: '', value: 1 });
item({ key: 'vi_5005_terraprisma', name: '', value: 1 });
item({ key: 'vi_4604_exotic_chew_toy', name: '', value: 1 });
item({ key: 'vi_4611_world_feeder_kite', name: '', value: 1, tile: 'v_723_kite_anchor' }); // ←vi_4611_KiteWorldFeeder 独有字段搬移(批次A)
item({ key: 'vi_4649_blue_jellyfish_kite', name: '', value: 1, tile: 'v_723_kite_anchor' }); // ←vi_4649_KiteJellyfishBlue 独有字段搬移(批次A)
item({ key: 'vi_4796_dark_mage_s_tome', name: '', value: 1 });
item({ key: 'vi_4553_plasma_lamp', name: '', value: 1 });
item({ key: 'vi_4365_celestial_wand', name: '', value: 1 });
item({ key: 'vi_331_jungle_spores', name: '', value: 1 });
item({ key: 'vi_2430_slimy_saddle', name: '', value: 1 });
item({ key: 'vi_4956_zenith', name: '', value: 1 });
item({ key: 'vi_2798_laser_drill', name: '', value: 1 });
item({ key: 'vi_2814_martian_chest', name: '', value: 1 });
item({ key: 'vi_210_vine', name: '', value: 1 });
item({ key: 'vi_4371_yellow_kite', name: '', value: 1, tile: 'v_723_kite_anchor' }); // ←vi_4371_KiteYellow 独有字段搬移(批次A)
item({ key: 'vi_4291_lemon', name: '', value: 1 });
item({ key: 'vi_2493_king_slime_mask', name: '', value: 1 });
item({ key: 'vi_1919_sugar_cookie', name: '', value: 1 });
item({ key: 'vi_1912_eggnog', name: '', value: 1 });
item({ key: 'vi_4023_grapes', name: '', value: 1 });
item({ key: 'vi_4792_the_black_spot', name: '', value: 1 });
item({ key: 'vi_3066_smooth_marble_block', name: '', value: 1 });
item({ key: 'vi_1103_slush_block', name: '', value: 1 });
item({ key: 'vi_2119_stone_slab', name: '', value: 1 });
item({ key: 'vi_593_snow_block', name: '', value: 1 });
item({ key: 'vi_3081_marble_block', name: '', value: 1 });
item({ key: 'vi_1111_blue_berries', name: '', value: 1 });
item({ key: 'vi_1115_red_husk', name: '', value: 1 });
item({ key: 'vi_217_molten_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 70 }, axePower: 30 }); // ←vi_217_MoltenHamaxe 独有字段搬移(批次A)
item({ key: 'vi_122_molten_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 100 } }); // ←vi_122_MoltenPickaxe 独有字段搬移(批次A)
item({ key: 'vi_1827_bladed_glove', name: '', value: 1 });
item({ key: 'vi_2263_white_dynasty_wall', name: '', value: 1 });
item({ key: 'vi_330_obsidian_brick_wall', name: '', value: 1 });
item({ key: 'vi_2433_stone_slab_wall', name: '', value: 1 });
item({ key: 'vi_452_hornet_statue', name: '', value: 1 });
item({ key: 'vi_453_bomb_statue', name: '', value: 1 });
item({ key: 'vi_360_armor_statue', name: '', value: 1 });
item({ key: 'vi_3711_wraith_statue', name: '', value: 1 });
item({ key: 'vi_438_star_statue', name: '', value: 1 });
item({ key: 'vi_446_skeleton_statue', name: '', value: 1 });
item({ key: 'vi_458_cross_statue', name: '', value: 1 });
item({ key: 'vi_3655_scorpion_statue', name: '', value: 1 });
item({ key: 'vi_328_shadow_chest', name: '', value: 1 });
item({ key: 'vi_2196_living_loom', name: '', value: 1 });
item({ key: 'vi_916_shadewood_work_bench', name: '', value: 1 });
item({ key: 'vi_35_iron_anvil', name: '', value: 1 });
item({ key: 'vi_36_work_bench', name: '', value: 1 });
item({ key: 'vi_3240_tall_gate', name: '', value: 1 });
item({ key: 'vi_337_red_banner', name: '', value: 1 });
item({ key: 'vi_3381_stardust_helmet', name: '', value: 1 });
item({ key: 'vi_1765_vampire_pants', name: '', value: 1 });
item({ key: 'vi_2859_lunar_cultist_robe', name: '', value: 1 });
item({ key: 'vi_2857_lunar_cultist_hood', name: '', value: 1 });
item({ key: 'vi_2998_summoner_emblem', name: '', value: 1 });
item({ key: 'vi_1175_headstone', name: '', value: 1 });
item({ key: 'vi_25_wooden_door', name: '', value: 1 });
item({ key: 'vi_46_light_s_bane', name: '', value: 1 });
item({ key: 'vi_2340_minecart_track', name: '', value: 1 });
// 轨道族放置物（Minecart.PlaceTrack style：0 普通 / 1 压板(2492) / 2 左加速(2739)）。
// key 沿用全量注册的 vanilla.json 命名（vi_<id>_<key>），只补 tile/placeStyle
item({ key: 'vi_2492_PressureTrack', name: '', value: 1, tile: 'v_314_minecart_track', placeStyle: 1 });
item({ key: 'vi_2739_BoosterTrack', name: '', value: 1, tile: 'v_314_minecart_track', placeStyle: 2 });
// 模特（Mannequin 498）：Item.cs:7291-7302 case 498 体内 createTile 被赋值两次
//（128 → 470，后者生效 = 1.4 DisplayDoll 改版）；extract-itemfunc 只抓到死代码的
// 128，故此处按源码最终态补 createTile=470 / placeStyle=0（原先缺 tile 放置无效）
item({ key: 'vi_498_mannequin', name: '', value: 1, tile: 'v_470_mannequins', placeStyle: 0 });
// 女模特（Womannequin 1989）/帽架（HatRack 3977）：同 498 血案——Item.cs case 体内
// createTile 被赋值两次（1989: :21260 269 → :21264 470+placeStyle 2；3977: :35327 269 →
// :35331 475），extract-itemfunc 只抓首值 269（legacy 女模特 tile）——帽架会放成女模特、
// 帽架 TE 存储类永不触发。按源码最终态补（2026-08-22 补 A 审计）
item({ key: 'vi_1989_Womannquin', name: '', value: 1, tile: 'v_470_mannequins', placeStyle: 2 });
item({ key: 'vi_3977_HatRack', name: '', value: 1, tile: 'v_475_hat_rack', placeStyle: 0 });
item({ key: 'vi_4721_mushroom_beam', name: '', value: 1 });
item({ key: 'vi_819_living_wood_door', name: '', value: 1 });
item({ key: 'vi_1458_obsidian_door', name: '', value: 1 });
item({ key: 'vi_3763_0x33_s_aviators', name: '', value: 1 });
item({ key: 'vi_176_mud_block', name: '', value: 1 });
item({ key: 'vi_1569_vampire_knives', name: '', value: 1 });
item({ key: 'vi_857_sandstorm_in_a_bottle', name: '', value: 1 });
item({ key: 'vi_2292_fiberglass_fishing_pole', name: '', value: 1 });
item({ key: 'vi_5238_constellation', name: '', value: 1 });
item({ key: 'vi_753_seaweed', name: '', value: 1 });
// FTW_V2 物品补全（第二轮）
item({ key: 'vi_3_stone_block', name: '', value: 1 });
item({ key: 'vi_94_wood_platform', name: '', value: 1 });
item({ key: 'vi_75_fallen_star', name: '', value: 1 });
item({ key: 'vi_26_stone_wall', name: '', value: 1 });
item({ key: 'vi_214_hellstone_brick', name: '', value: 1 });
item({ key: 'vi_93_wood_wall', name: '', value: 1 });
item({ key: 'vi_172_ash_block', name: '', value: 1 });
item({ key: 'vi_118_hook', name: '', value: 1 });
item({ key: 'vi_529_red_pressure_plate', name: '', value: 1 });
item({ key: 'vi_183_glowing_mushroom', name: '', value: 1 });
item({ key: 'vi_130_gray_brick_wall', name: '', value: 1 });
item({ key: 'vi_352_keg', name: '', value: 1 });

// 不负责任的女妖啤酒厂 补全物品（占位收集品）
item({ key: 'vi_5120_deer_thing', name: '', value: 1 });
item({ key: 'vi_5508_grim_old_barb', name: '', value: 1 });
item({ key: 'vi_5465_ram_rune', name: '', value: 1 });
item({ key: 'vi_5500_goat_s_tuft', name: '', value: 1 });
item({ key: 'vi_5499_froggy_neckband', name: '', value: 1 });
item({ key: 'vi_5507_balloony_beads', name: '', value: 1 });
item({ key: 'vi_5485_chicken_charm', name: '', value: 1 });
item({ key: 'vi_5502_cat_chime', name: '', value: 1 });
item({ key: 'vi_5504_turkey_wattle_necklace', name: '', value: 1 });
item({ key: 'vi_5506_crow_s_beak', name: '', value: 1 });
item({ key: 'vi_5503_dog_collar', name: '', value: 1 });
item({ key: 'vi_5534_fairy_choker', name: '', value: 1 });
item({ key: 'vi_5484_cow_bell', name: '', value: 1 });
item({ key: 'vi_5501_old_companion_locket', name: '', value: 1 });
item({ key: 'vi_5509_vampire_pendant', name: '', value: 1 });
item({ key: 'vi_5505_mean_goblin_s_spikes', name: '', value: 1 });
item({ key: 'vi_5525_cursed_piper_flute', name: '', value: 1 });


// ---- 阶段 5:v_ 图块放置物品自动注册 + 掉落连线 ----
// 每个 v_ 图块注册 place_v_<key> 放置物品(tryPlace 走 vanilla style 帧语义);
// 无掉落的 v_ 图块 drop 连到该物品(破坏可回收再放置)。
import { TILE_DEFS, TILE_BY_KEY } from './tiles';
for (const td of TILE_DEFS) {
  if (!td.key.startsWith('v_')) continue;
  const ik = 'place_' + td.key;
  if (byKey[ik] === undefined) {
    item({ key: ik, name: '', maxStack: 999, value: 1, tile: td.key });
  }
  // 掉落连线在读取端回退(World.breakTileAt),避免多模块实例下改写失效
}
void 0;

// ---- 阶段 5:生物群系草种子(种出对应草块)----






// ---- 阶段 5:原版物品全量注册(6146 件,图标走 atlas.vicon(id) 回退) ----
import vanillaItemMeta from '../../public/sprites/vanilla.json';
import { MUSIC_BOX_ITEM_BY_STYLE } from '../world/wiring/devices';
/** 原版物品 id → 注册 key（wld 导入兜底映射：ITEM_MAP 之外的 id 不再跳过） */
// ===================== 原版工具力道具补齐（锤/镐梯度,Item.cs 提取） =====================
item({ key: 'vi_103_nightmare_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 65 } }); // ←vi_103_NightmarePickaxe 独有字段搬移(批次A)
item({ key: 'vi_104_the_breaker', name: '', value: 1, tool: { type: 'hammer', power: 55 } }); // ←vi_104_TheBreaker 独有字段搬移(批次A)
item({ key: 'vi_122_molten_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 100 } }); // ←vi_122_MoltenPickaxe 独有字段搬移(批次A)
item({ key: 'vi_204_meteor_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 60 }, axePower: 20 }); // ←vi_204_MeteorHamaxe 独有字段搬移(批次A)
item({ key: 'vi_217_molten_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 70 }, axePower: 30 }); // ←vi_217_MoltenHamaxe 独有字段搬移(批次A)
item({ key: 'vi_367_pwnhammer', name: '', value: 1, tool: { type: 'hammer', power: 80 } }); // ←vi_367_Pwnhammer 独有字段搬移(批次A)
item({ key: 'vi_579_drax', name: '', value: 1, tool: { type: 'pick', power: 200 }, axePower: 22 }); // ←vi_579_Drax 独有字段搬移(批次A)
item({ key: 'vi_654_ebonwood_hammer', name: '', value: 1, tool: { type: 'hammer', power: 40 } }); // ←vi_654_EbonwoodHammer 独有字段搬移(批次A)
item({ key: 'vi_657_rich_mahogany_hammer', name: '', value: 1, tool: { type: 'hammer', power: 35 } }); // ←vi_657_RichMahoganyHammer 独有字段搬移(批次A)
item({ key: 'vi_660_pearlwood_hammer', name: '', value: 1, tool: { type: 'hammer', power: 55 } }); // ←vi_660_PearlwoodHammer 独有字段搬移(批次A)
item({ key: 'vi_776_cobalt_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 110 } }); // ←vi_776_CobaltPickaxe 独有字段搬移(批次A)
item({ key: 'vi_777_mythril_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 150 } }); // ←vi_777_MythrilPickaxe 独有字段搬移(批次A)
item({ key: 'vi_778_adamantite_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 180 } }); // ←vi_778_AdamantitePickaxe 独有字段搬移(批次A)
item({ key: 'vi_787_hammush', name: '', value: 1, tool: { type: 'hammer', power: 85 } }); // ←vi_787_Hammush 独有字段搬移(批次A)
item({ key: 'vi_797_flesh_grinder', name: '', value: 1, tool: { type: 'hammer', power: 55 } }); // ←vi_797_FleshGrinder 独有字段搬移(批次A)
item({ key: 'vi_798_deathbringer_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 70 } }); // ←vi_798_DeathbringerPickaxe 独有字段搬移(批次A)
item({ key: 'vi_922_shadewood_hammer', name: '', value: 1, tool: { type: 'hammer', power: 40 } }); // ←vi_922_ShadewoodHammer 独有字段搬移(批次A)
item({ key: 'vi_990_pickaxe_axe', name: '', value: 1, tool: { type: 'pick', power: 200 }, axePower: 22 }); // ←vi_990_PickaxeAxe 独有字段搬移(批次A)
item({ key: 'vi_1188_palladium_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 130 } }); // ←vi_1188_PalladiumPickaxe 独有字段搬移(批次A)
item({ key: 'vi_1195_orichalcum_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 165 } }); // ←vi_1195_OrichalcumPickaxe 独有字段搬移(批次A)
item({ key: 'vi_1202_titanium_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 190 } }); // ←vi_1202_TitaniumPickaxe 独有字段搬移(批次A)
item({ key: 'vi_1234_chlorophyte_warhammer', name: '', value: 1, tool: { type: 'hammer', power: 90 } }); // ←vi_1234_ChlorophyteWarhammer 独有字段搬移(批次A)
// 叶绿插孔锤 1262（Item.cs:15631-15650）：useStyle5/channel/shoot 252（AI_020 插孔机
// :23837-23942）/damage45/knockBack5.2/useTime7/useAnimation25/hammer90/noUseGraphic
// ——shoot/channel 驱动持械弹体（entities/ChainsawProj，接触伤害）；tool.useTime=7
// 为挖掘节奏（channel 期 ItemCheck_UseMiningTools toolTime 循环 :42891-42899）
item({ key: 'vi_1262_chlorophyte_jackhammer', name: '', value: 1,
  tool: { type: 'hammer', power: 90, useTime: 7 }, shoot: 252, channel: true }); // ←vi_1262_ChlorophyteJackhammer 独有字段搬移(批次A)
item({ key: 'vi_1305_the_axe', name: '', value: 1, tool: { type: 'hammer', power: 100 }, axePower: 35 }); // ←vi_1305_TheAxe 独有字段搬移(批次A)
item({ key: 'vi_1506_spectre_pickaxe', name: '', value: 1, tool: { type: 'pick', power: 200 } }); // ←vi_1506_SpectrePickaxe 独有字段搬移(批次A)
item({ key: 'vi_1507_spectre_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 90 }, axePower: 30 }); // ←vi_1507_SpectreHamaxe 独有字段搬移(批次A)
item({ key: 'vi_3481_platinum_hammer', name: '', value: 1, tool: { type: 'hammer', power: 59 } }); // ←vi_3481_PlatinumHammer 独有字段搬移(批次A)
item({ key: 'vi_3487_tungsten_hammer', name: '', value: 1, tool: { type: 'hammer', power: 50 } }); // ←vi_3487_TungstenHammer 独有字段搬移(批次A)
item({ key: 'vi_3493_lead_hammer', name: '', value: 1, tool: { type: 'hammer', power: 43 } }); // ←vi_3493_LeadHammer 独有字段搬移(批次A)
item({ key: 'vi_3499_tin_hammer', name: '', value: 1, tool: { type: 'hammer', power: 38 } }); // ←vi_3499_TinHammer 独有字段搬移(批次A)
item({ key: 'vi_3505_copper_hammer', name: '', value: 1, tool: { type: 'hammer', power: 35 } }); // ←vi_3505_CopperHammer 独有字段搬移(批次A)
item({ key: 'vi_3511_silver_hammer', name: '', value: 1, tool: { type: 'hammer', power: 45 } }); // ←vi_3511_SilverHammer 独有字段搬移(批次A)
item({ key: 'vi_3517_gold_hammer', name: '', value: 1, tool: { type: 'hammer', power: 55 } }); // ←vi_3517_GoldHammer 独有字段搬移(批次A)
item({ key: 'vi_3525_stardust_hamaxe', name: '', value: 1, tool: { type: 'hammer', power: 100 }, axePower: 30 }); // ←vi_3525_LunarHamaxeStardust 独有字段搬移(批次A)
item({ key: 'vi_4317_haemorrhaxe', name: '', value: 1, tool: { type: 'hammer', power: 80 } }); // ←vi_4317_BloodHamaxe 独有字段搬移(批次A)

// 月事件触发物品（Player.cs:43294/43361：夜晚 && 无进行中月事件；Main.startPumpkinMoon/
// startSnowMoon :10903-10940）。键用 vanilla.json 权威驼峰键（下方自动注册循环按此键
// 跳过，避免同 vid 双注册）；原版 maxStack 20 / useTime 45（Item.cs:20377-21128）
item({ key: 'vi_1844_PumpkinMoonMedallion', name: '', vid: 1844, value: 1, desc: '夜晚使用:召唤南瓜月' });
item({ key: 'vi_1958_NaughtyPresent', name: '', vid: 1958, value: 1, desc: '夜晚使用:召唤霜月' });

// （屎堆 5395 见下方 BLOCK_TILE_BACKFILL——★勿在此 item() 手写：ITEM_DEFS id=数组
//  下标，自动注册循环【前】插条会把后续全部物品 id 平移+1（2026-08-18 金鱼掉恐惧
//  之魂事故根因）；补 tile 走回填表零位移）

export const VANILLA_ITEM_KEY_BY_ID: Record<number, string> = {};
const _vim = (vanillaItemMeta as unknown as { items: Record<string, { name: string; key: string }> }).items ?? {};
// vid → 既有 def 键：本循环键是 Pascal（vi_167_Dynamite），桥接批手写键是 snake
// （vi_167_dynamite）——旧去重按整键精确比、大小写不同全漏 → 1246 组同 vid 双注册
// （道具搜索双行"雷管"根因，2026-08-21）。ITEM_DEFS id=数组下标不可删（平移事故
// 先例），存量双条目保留、由消费端按 vid 归一；此处按 vid 堵新注册，并把权威
// 反查指向既有 def（内容等价且常更富：tile/tool/伤害等独有字段在桥接批侧）。
const VID_SEEN_IDX = new Map<number, number>();
for (const k of Object.keys(byKey)) {
  const vm = /^vi_(\d+)_/.exec(k);
  if (vm && !VID_SEEN_IDX.has(Number(vm[1]))) VID_SEEN_IDX.set(Number(vm[1]), byKey[k]);
}
for (const [idStr, m] of Object.entries(_vim)) {
  if (!m || typeof m.key !== 'string' || !m.key) continue;
  const vid = Number(idStr);
  const ik = 'vi_' + idStr + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  const existingIdx = VID_SEEN_IDX.get(vid);
  if (existingIdx !== undefined) {
    // 同 vid 已注册（桥接批 snake 键）：不再注册重复 def（内部 id 平移对存档无影响
    // ——v3 起磁盘走稳定 id），Pascal 键【别名】到既有 def 下标——UI.ts 药水表等
    // 硬编码 Pascal 键与 wld 导入反查全部继续解析（指向内容更富的桥接 def）
    byKey[ik] = existingIdx;
    VANILLA_ITEM_KEY_BY_ID[vid] = ik;
    continue;
  }
  VANILLA_ITEM_KEY_BY_ID[vid] = ik; // 已注册的同样入表（wld 导入按 id 反查）
  item({ key: ik, name: '', value: 1 });
  VID_SEEN_IDX.set(vid, ITEM_DEFS.length - 1);
}

// ---- 音乐盒唱片全量 101 曲（Item.cs DefaultToMusicBox：createTile=139、
// placeStyle=曲目 style、accessory；style 表 = WorldGen.GetItemDrop_MusicBoxes
// :43138-43366 逆表）。6145 彩虹巨石/6146 静音盒无素材不在 vanilla.json，单独注册。
// 放置帧走 FurnitureStyle case 139（frameY = style*36）；录音变身链见
// world/wiring/devices.ts musicBoxRecordItem（Player.cs:15053） ----
const MB_NO_SPRITE: Record<number, number> = { 6145: 99, 6146: 100 };
for (const [mbVid, mbStyle] of Object.entries(MB_NO_SPRITE)) {
  const mbKey = `vi_${mbVid}_MusicBox${Number(mbVid) === 6146 ? 'Silence' : 'RainbowBoulder'}`;
  VANILLA_ITEM_KEY_BY_ID[Number(mbVid)] = mbKey; // 掉落/录音链按 vid 反查
  item({ key: mbKey, name: '', value: 100000, tile: 'v_139_musicboxes', placeStyle: mbStyle });
}

for (let mbStyle = 0; mbStyle < 100; mbStyle++) {
  const mbKey = VANILLA_ITEM_KEY_BY_ID[MUSIC_BOX_ITEM_BY_STYLE[mbStyle]];
  if (mbKey === undefined) continue; // 6145/6146 无素材，上方单独注册
  const mbDef = ITEM_DEFS[byKey[mbKey]];
  if (!mbDef) continue;
  mbDef.tile = 'v_139_musicboxes';
  mbDef.placeStyle = mbStyle;
  // maxStack 不覆写：DefaultToMusicBox（1456 :48250-48267）不设 maxStack → 默认 9999（1456/1457 同值,1457 Item.cs:85/:49020）
  mbDef.value = 100000; // DefaultToMusicBox value = 10 金
}

// ---- 水喷泉全量 10 色（Item.cs createTile=207：909 纯净/910 沙漠 940-945 丛林·
// 冰雪·腐化·猩红·神圣·血月/4922 洞穴/4417 绿洲；placeStyle 0-9 =
// WorldGen.Check2xX :38199-38226 掉落表逆表）。放置帧 X 向 style*36（fw=2，
// FurnitureStyle default 分支即正确） ----
const FOUNTAIN_ITEM_STYLE: Array<[number, number]> = [
  [909, 0], [910, 1], [940, 2], [941, 3], [942, 4], [943, 5], [944, 6], [945, 7], [4922, 8], [4417, 9],
];
for (const [fnVid, fnStyle] of FOUNTAIN_ITEM_STYLE) {
  const fnKey = VANILLA_ITEM_KEY_BY_ID[fnVid];
  if (fnKey === undefined) continue;
  const fnDef = ITEM_DEFS[byKey[fnKey]];
  if (!fnDef) continue;
  fnDef.tile = 'v_207_water_fountains';
  fnDef.placeStyle = fnStyle;
  // maxStack 不覆写：喷泉 case 无 maxStack 赋值 → 1456/1457 同值默认 9999
}

// ---- DefaultTo* 双参 helper 提取盲区回填（R21 系统性缺口，2026-08-24）----
//  Item.cs 的 DefaultToPlaceableTile(tileID, style)/共享 case 算式（placeStyle=type-N）
//  不在 vanilla-itemfunc.json 单值提取面内 → 这些物品 placeStyle 全缺=0：
//  ① 七件逻辑感应器（:32542-32555 `placeStyle=type-3613`、:33032-33046
//     `placeStyle=type-3726+3`；3615/3729 有 createTile=423 无 placeStyle）；
//  ② 十一座传送晶塔（Item.cs:39691-44406 DefaultToPlaceableTile(597,N) 全表）——
//     曾全放成 frameX=0 纯净帧 → 唯一性门只查 style0=全世界只能立一座任何晶塔、
//     群系门按纯净判、破坏恒返 4876；
//  ③ 门族 32 件无 itemfunc 条目（DefaultToPlaceableTile((ushort)10,N)，N=33..68，
//     石门 4415→44 起）——曾连 tile 都缺=无法放置。其余 32 件老门 itemfunc 已带
//     placeStyle 不在表内。放置帧轴 = FurnitureStyle case 10/423（同批修）。
//  仅填 undefined/0 缺口（手写字段优先），与上方 createTile 双源回填同口径。
const PLACE_STYLE_BACKFILL_1458: ReadonlyArray<readonly [number, string, number]> = [
  // 逻辑感应器 423（style=frameY/18 档位）
  [3613, 'v_423_logicsensor', 0], [3614, 'v_423_logicsensor', 1], [3615, 'v_423_logicsensor', 2],
  [3726, 'v_423_logicsensor', 3], [3727, 'v_423_logicsensor', 4],
  [3728, 'v_423_logicsensor', 5], [3729, 'v_423_logicsensor', 6],
  // 传送晶塔 597（style=frameX/54 型号）
  [4876, 'v_597_pylons', 0], [4875, 'v_597_pylons', 1], [4916, 'v_597_pylons', 2],
  [4917, 'v_597_pylons', 3], [4918, 'v_597_pylons', 4], [4919, 'v_597_pylons', 5],
  [4920, 'v_597_pylons', 6], [4921, 'v_597_pylons', 7], [4951, 'v_597_pylons', 8],
  [5652, 'v_597_pylons', 9], [5653, 'v_597_pylons', 10],
  // 门 10（style 列带 = PlaceDoor 54*(style/36)+54*(style%36)）
  ...([3129, 3130].map((vid) => [vid, 'door_closed', 33] as const)),
  ...([[4155, 39], [4176, 40], [4197, 41], [4218, 42], [4307, 43], [4415, 44], [4576, 45],
    [5158, 46], [5179, 47], [5200, 48], [5558, 49], [5611, 50], [5699, 51], [5722, 52],
    [5747, 53], [5765, 54], [5786, 55], [5807, 56], [5828, 57], [5867, 58], [5907, 59],
    [5941, 60], [5964, 61], [5984, 62], [6007, 63], [6030, 64], [6053, 65], [6076, 66],
    [6098, 67], [6120, 68]] as const).map(([vid, st]) => [vid, 'door_closed', st] as const),
];
for (const [vid, tk, ps] of PLACE_STYLE_BACKFILL_1458) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (!d) continue;
  if (d.tile === undefined && tk !== undefined) d.tile = tk;
  if (!d.placeStyle) d.placeStyle = ps;
}
void 0;

// ---- 放置块 tile 回填补遗（2026-08-13 实装缺口扫描 §3）：vanilla.json
//  .items 的 createTile 有值、extract-itemfunc 提取漏（共享 case 段算式不在
//  单值提取面内）→ def.tile 未回填 = 放置静默无效。5 件以 TEdit 数据为权威
//  （vanilla.json createTile 逐件核对一致），tile def 均已存在：
//  3576 星尘碎片块(418) / 3637 白队块(434) / 3738 呆头绿气球块(448) /
//  2755 活性超亮火块(344) / 2262 蓝王朝瓦(313)。
//  +5464 Mitey-Titey(693,Item.cs:43085-43093 DefaultToPlaceableTile(693,0) 后
//   consumable=false 覆写——放置不消耗,消耗门见 Game.tryPlace) ----
// （2026-08-18 退役）BLOCK_TILE_BACKFILL 手表 [3576/3637/3738/2755/2262/5464/5395]
// 七条已全部被上方 createTile 双源回填的 vanilla.json 源覆盖（逐条核验值一致）——
// 手维护面归零；覆盖完整性由 tests/item-id-stability.test.ts 覆盖闸门守门，
// 再出现"提取漏"时先落 vanilla.json 数据而非新增手表。
void 0;
//  油漆 1073-1099 → PaintID 1-27（:13374-13535，含深层 13-24），
//  棕/暗影/负相 1966/1967/1968 → 28/29/30（:21168-21185）。
//  工具族 paintTool（Player.cs PlaceThing 分派 :41152/:41236/:41254）：1071/1543 刷、
//  1072/1544 滚、1100/1545 刮（IsPaintScraper 集 ItemID.cs:254）。涂层 4668/5344 走
//  paintCoating 位（Item.cs:38471/:42387，见 COATING_ITEM_TABLE）----
const PAINT_ITEM_TABLE: ReadonlyArray<readonly [number, number]> = [
  ...Array.from({ length: 27 }, (_, i) => [1073 + i, i + 1] as const),   // 1073-1099 → 1-27
  [1966, 28], [1967, 29], [1968, 30],
];
for (const [vid, p] of PAINT_ITEM_TABLE) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (d) d.paint = p;
}
// 涂层（Item.cs SetDefaults：4668 paintCoating=1 :38471 / 5344 paintCoating=2 :42387）
const COATING_ITEM_TABLE: ReadonlyArray<readonly [number, number]> = [
  [4668, 1], [5344, 2],
];
for (const [vid, c] of COATING_ITEM_TABLE) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (d) d.paintCoating = c;
}
const PAINT_TOOL_TABLE: ReadonlyArray<readonly [number, NonNullable<ItemDef['paintTool']>]> = [
  [1071, 'brush'], [1543, 'brush'],
  [1072, 'roller'], [1544, 'roller'],
  [1100, 'scraper'], [1545, 'scraper'],
];
for (const [vid, t] of PAINT_TOOL_TABLE) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (d) d.paintTool = t;
}

// ---- 宝石系统：gemcorn 4851-4857（Item.cs createTile=590 宝石树苗，style=宝石序号；
// 种在石/苔上必须地下长成宝石树，见 growSaplings）----
item({ key: 'vi_4851_GemTreeTopazSeed', name: '黄玉宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 0 });
item({ key: 'vi_4852_GemTreeAmethystSeed', name: '紫水晶宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 1 });
item({ key: 'vi_4853_GemTreeSapphireSeed', name: '蓝宝石宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 2 });
item({ key: 'vi_4854_GemTreeEmeraldSeed', name: '翡翠宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 3 });
item({ key: 'vi_4855_GemTreeRubySeed', name: '红宝石宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 4 });
item({ key: 'vi_4856_GemTreeDiamondSeed', name: '钻石宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 5 });
item({ key: 'vi_4857_GemTreeAmberSeed', name: '琥珀宝石橡实', value: 100, tile: 'v_590_gem_saplings', placeStyle: 6 });

// ---- 阶段 6:功能道具(桶三态/绳圈) ----





// ---- 阶段 6 第三轮:替代矿工具链(官方数值,与铜/铁/银/金同档) ----













// ---- 阶段 6 第五轮:弓箭系统(官方数值 Item.cs:2996-3010:木弓伤4/UseTime30/射速6.1/击退0) ----





// ---- 阶段 6 第六轮:矿车 ----


// ---- 阶段 6 第八轮:魔法武器(官方 Item.cs:30765-30778,火花法杖=ItemID 3069:伤14/魔力2/UseTime26/射速7/暴击10) ----



// ---- 阶段 6 第九轮:Boss 召唤物(官方:蠕虫食物 70/血腥脊椎 1331/史莱姆王冠 560) ----

// 入侵触发物品（Player.ItemCheck_UseEventItems，Player.cs:43243/43260/43277）






// ---- 机械三王召唤物(官方 556 机械蠕虫/544 机械魔眼/557 机械骷髅头;需夜晚+困难模式) ----




// ---- 电路工具(原版 530 电线/509,850,851,3612 扳手/510 剪线钳/849 致动器/3620 致动魔杖/3625 五彩扳手/3611 宏伟蓝图) ----
// 位掩码见 world/Wiring.ts TOOL_*。扳手消耗背包中的 wire(原版语义:找第一组 530 扣 1)。
// ★2026-08-13 补登记:此前本段是空壳注释——运行时链(Game.ts:5313 使用派发/:15326
//  显示导线/:1842 R 键切模式/UseWiringTools 全分支)只等这张表,整族曾为死路径
// (手持扳手无任何效果)。语义对照 Player.cs:30289-30444 ItemCheck_UseWiringTools。
import { TOOL_RED, TOOL_GREEN, TOOL_BLUE, TOOL_YELLOW, TOOL_ACTUATOR } from '../world/Wiring';
const WIRE_TOOL_TABLE: ReadonlyArray<readonly [number, NonNullable<ItemDef['wireTool']>]> = [
  [509, { place: TOOL_RED }],
  [850, { place: TOOL_BLUE }],
  [851, { place: TOOL_GREEN }],
  [3612, { place: TOOL_YELLOW }],
  [510, { cutter: true }],
  [849, { place: TOOL_ACTUATOR }],   // 手持致动器单放一枚;放置分支按 countOf(849) 扣 1(与原版耗持有物等价)
  [3620, { rod: true }],
  // 3625 五彩扳手:place 为载体值(运行时 :7727 按 wireToolMode 特例覆写);3611 蓝图 grand
  [3625, { place: TOOL_RED | TOOL_GREEN | TOOL_BLUE | TOOL_YELLOW }],
  [3611, { grand: true }],
];
for (const [vid, wt] of WIRE_TOOL_TABLE) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (d) d.wireTool = wt;
}












// ===================== 存档稳定 id(根治 ITEM_DEFS 数组下标漂移;存档 v3 起生效) =====================
// vi_* 稳定 id = 原版物品 id(key 内嵌);自造物品 = 私有段 10000+(下表,2026-08 冻结快照)。
// ★ PRIV_ITEM_STABLE 冻结表 append-only:新自造物品只许表尾追加,已分配号码永不复用/改派。
// (本地物品退役后本表保留为纯数据:读档 remap 的 10000+ 段→vi_ 解码源,见 data/itemMigration.ts)
export const PRIV_ITEM_STABLE: Record<string, number> = {
  'dirt_block': 10000, 'stone_block': 10001, 'wood': 10002, 'sand_block': 10003,
  'snow_block': 10004, 'platform': 10005, 'torch': 10006, 'door': 10007,
  'workbench': 10008, 'furnace': 10009, 'anvil': 10010, 'chest': 10011,
  'gel': 10012, 'acorn': 10013, 'mushroom_item': 10014, 'copper_ore': 10015,
  'iron_ore': 10016, 'silver_ore': 10017, 'gold_ore': 10018, 'copper_bar': 10019,
  'iron_bar': 10020, 'silver_bar': 10021, 'gold_bar': 10022, 'lens': 10023,
  'suspicious_eye': 10024, 'lesser_healing_potion': 10025, 'coin_copper': 10026, 'coin_silver': 10027,
  'coin_gold': 10028, 'heal_potion': 10029, 'agility_potion': 10030, 'ironskin_potion': 10031,
  'thorns_potion': 10032, 'regen_potion': 10033, 'lucky_horseshoe': 10034, 'feral_claws': 10035,
  'copper_helmet': 10036, 'copper_chainmail': 10037, 'copper_greaves': 10038, 'iron_helmet': 10039,
  'iron_chainmail': 10040, 'iron_greaves': 10041, 'silver_helmet': 10042, 'silver_chainmail': 10043,
  'silver_greaves': 10044, 'gold_helmet': 10045, 'gold_chainmail': 10046, 'gold_greaves': 10047,
  'wood_pickaxe': 10048, 'wood_axe': 10049, 'wood_sword': 10050, 'wood_hammer': 10051,
  'copper_pickaxe': 10052, 'copper_axe': 10053, 'copper_sword': 10054, 'copper_hammer': 10055,
  'iron_pickaxe': 10056, 'iron_axe': 10057, 'iron_sword': 10058, 'iron_hammer': 10059,
  'silver_pickaxe': 10060, 'silver_axe': 10061, 'silver_sword': 10062, 'silver_hammer': 10063,
  'gold_pickaxe': 10064, 'gold_axe': 10065, 'gold_sword': 10066, 'gold_hammer': 10067,
  'tin_ore': 10068, 'lead_ore': 10069, 'tungsten_ore': 10070, 'platinum_ore': 10071,
  'tin_bar': 10072, 'lead_bar': 10073, 'tungsten_bar': 10074, 'platinum_bar': 10075,
  'demonite_ore': 10076, 'meteorite': 10077, 'hellstone': 10078, 'crimtane_ore': 10079,
  'cobalt_ore': 10080, 'mythril_ore': 10081, 'adamantite_ore': 10082, 'palladium_ore': 10083,
  'orichalcum_ore': 10084, 'titanium_ore': 10085, 'chlorophyte_ore': 10086, 'sapphire': 10087,
  'ruby': 10088, 'emerald': 10089, 'topaz': 10090, 'amethyst': 10091,
  'diamond': 10092, 'ice_block': 10093, 'ice_brick': 10094, 'snow_brick': 10095,
  'sandstone_block': 10096, 'hardened_sand_block': 10097, 'desert_fossil': 10098, 'clay_block': 10099,
  'glass': 10100, 'obsidian': 10101, 'gray_brick': 10102, 'red_brick': 10103,
  'mud_block': 10104, 'silt_block': 10105, 'table': 10106, 'chair': 10107,
  'bed': 10108, 'bookcase': 10109, 'grandfather_clock': 10110, 'piano': 10111,
  'dresser': 10112, 'bench': 10113, 'bathtub': 10114, 'keg': 10115,
  'cooking_pot': 10116, 'clay_pot': 10117, 'tombstone': 10118, 'life_crystal': 10119,
  'candle': 10120, 'chandelier': 10121, 'lantern': 10122, 'candelabra': 10123,
  'chinese_lantern': 10124, 'skull_lantern': 10125, 'water_candle': 10126, 'bomb': 10127,
  'rope': 10128, 'place_v_29_piggy_bank': 10129, 'place_v_463_defenders_forge': 10130, 'place_v_51_cobweb': 10131,
  'place_v_368_granite_block': 10132, 'place_v_226_lihzahrd_brick': 10133, 'place_v_367_marble_block': 10134, 'place_v_633_ash_grass_block': 10135,
  'place_v_181_red_moss_block': 10136, 'place_v_189_cloud_block': 10137, 'place_v_183_purple_moss_block': 10138, 'place_v_536_xenon_moss_block': 10139,
  'place_v_225_hive_block': 10140, 'place_v_483_cracked_pink_brick': 10141, 'place_v_224_slush_block': 10142, 'place_v_383_living_mahogany_block': 10143,
  'place_v_179_green_moss_block': 10144, 'place_v_384_living_mahogany_leaves_block': 10145, 'place_v_273_stone_slab': 10146, 'place_v_381_lava_moss': 10147,
  'place_v_48_spike': 10148, 'place_v_192_living_leaf_block': 10149, 'place_v_191_living_wood_block': 10150, 'place_v_196_rain_cloud_block': 10151,
  'place_v_118_pearlstone_brick': 10152, 'place_v_321_boreal_wood': 10153, 'place_v_152_ebonstone_brick': 10154, 'place_v_158_rich_mahogany': 10155,
  'place_v_357_smooth_marble_block': 10156, 'place_v_272_cog_block': 10157, 'place_v_229_honey_block': 10158, 'place_v_311_dynasty_wood': 10159,
  'place_v_130_active_stone_block': 10160, 'place_v_193_slime_block': 10161, 'place_v_190_glowing_mushroom_block': 10162, 'place_v_350_martian_conduit_plating': 10163,
  'place_v_369_smooth_granite_block': 10164, 'place_v_137_traps': 10165, 'place_v_117_pearlstone_block': 10166, 'place_v_112_ebonsand_block': 10167,
  'place_v_232_wooden_spike': 10168, 'place_v_274_sandstone_slab': 10169, 'place_v_322_palm_wood': 10170, 'place_v_109_hallowed_grass_block': 10171,
  'place_v_312_red_dynasty_shingles': 10172, 'place_v_422_conveyor_belt_ccw': 10173, 'place_v_495_shell_pile_block': 10174, 'place_v_479_smooth_sandstone_block': 10175,
  'place_v_353_vine_rope': 10176, 'place_v_477_mowed_grass_block': 10177, 'place_v_380_planter_boxes': 10178, 'place_v_230_crispy_honey_block': 10179,
  'place_v_562_bamboo_block': 10180, 'place_v_371_pink_slime_block': 10181, 'place_v_668_the_dirtiest_block': 10182, 'place_v_398_corrupt_hardened_sand_block': 10183,
  'place_v_379_bubble': 10184, 'place_v_618_stone_accent_slab': 10185, 'place_v_165_cave_decos': 10186, 'place_v_184_moss_plants': 10187,
  'place_v_314_minecart_track': 10188, 'place_v_185_small_decos': 10189, 'place_v_373_water_drip': 10190, 'place_v_187_decos_3x2_group_2': 10191,
  'place_v_484_rolling_cactus': 10192, 'place_v_374_lava_drip': 10193, 'place_v_233_jungle_large_plants': 10194, 'place_v_105_statue': 10195,
  'place_v_186_decos_3x2': 10196, 'place_v_461_sand_drip': 10197, 'place_v_178_gems': 10198, 'place_v_485_antlion_larva': 10199,
  'place_v_637_ash_short_plants': 10200, 'place_v_444_bee_hive': 10201, 'place_v_240_wall_hangings_3x3': 10202, 'place_v_519_cattails': 10203,
  'place_v_138_boulder': 10204, 'place_v_634_ash_tree': 10205, 'place_v_26_altars': 10206, 'place_v_82_herbs_sprout': 10207,
  'place_v_323_palm_trees': 10208, 'place_v_135_pressure_plates': 10209, 'place_v_91_banners': 10210, 'place_v_242_paintings_6x4': 10211,
  'place_v_50_books': 10212, 'place_v_93_lamps': 10213, 'place_v_549_seaweed': 10214, 'place_v_254_pumpkin_plant': 10215,
  'place_v_571_bamboo': 10216, 'place_v_246_paintings_3x2': 10217, 'place_v_245_paintings_2x3': 10218, 'place_v_586_emerald_tree': 10219,
  'place_v_596_vanity_tree_sakura': 10220, 'place_v_467_chests_group_2': 10221, 'place_v_443_geyser': 10222, 'place_v_589_amber_tree': 10223,
  'place_v_411_detonator': 10224, 'place_v_518_lily_pads': 10225, 'place_v_588_diamond_tree': 10226, 'place_v_585_sapphire_tree': 10227,
  'place_v_583_topaz_tree': 10228, 'place_v_13_placed_bottles': 10229, 'place_v_530_oasis_plants': 10230, 'place_v_616_vanity_tree_yellow_willow': 10231,
  'place_v_215_campfires': 10232, 'place_v_141_explosives': 10233, 'place_v_597_pylons': 10234, 'place_v_592_hanging_brazier': 10235,
  'place_v_375_honey_drip': 10236, 'place_v_227_dye_plants': 10237, 'place_v_584_amethyst_tree': 10238, 'place_v_231_larva': 10239,
  'place_v_395_item_frame': 10240, 'place_v_241_catacombs': 10241, 'place_v_587_ruby_tree': 10242, 'place_v_86_loom': 10243,
  'place_v_376_fishing_crates': 10244, 'place_v_470_mannequins': 10245, 'place_v_324_seashells': 10246, 'place_v_81_coral': 10247,
  'place_v_136_switch': 10248, 'place_v_355_alchemy_table': 10249, 'place_v_354_bewitching_table': 10250, 'place_v_103_bowls': 10251,
  'place_v_529_sea_oats': 10252, 'place_v_506_bast_statue': 10253, 'place_v_349_mushroom_statue': 10254, 'place_v_377_sharpening_station': 10255,
  'place_v_613_potted_lava_plants': 10256, 'place_v_219_extractinator': 10257, 'place_v_388_tall_gate_closed': 10258, 'place_v_389_tall_gate_open': 10259,
  'place_v_129_crystal_shard': 10260, 'place_v_466_elder_cystal_stand': 10261, 'place_v_220_solidifier': 10262, 'place_v_303_lihzahrd_furnace': 10263,
  'place_v_469_tables_group_2': 10264, 'place_v_304_living_loom': 10265, 'place_v_488_fallen_log': 10266, 'place_v_548_potted_trees_group_2': 10267,
  'place_v_614_potted_ember_tendrils': 10268, 'place_v_598_lava_serpent_bowl': 10269, 'place_v_406_chimney': 10270, 'place_v_305_sky_mill': 10271,
  'place_v_300_bone_welder': 10272, 'place_v_302_glass_kiln': 10273, 'place_v_306_ice_machine': 10274, 'place_v_247_autohammer': 10275,
  'place_v_491_void_vault': 10276, 'place_v_106_sawmill': 10277, 'place_v_642_chlorophyte_extractinator': 10278, 'place_v_319_ship_in_a_bottle': 10279,
  'place_v_487_picnic_tables': 10280, 'place_v_97_safe': 10281, 'place_v_320_seaweed_planter': 10282, 'place_v_405_fireplace': 10283,
  'place_v_378_target_dummy': 10284, 'place_v_218_meat_grinder': 10285, 'place_v_356_enchanted_sundial': 10286, 'place_v_114_tinkerer_s_workshop': 10287,
  'place_v_237_lihzahrd_altar': 10288, 'place_v_110_hallow_short_plants': 10289, 'place_v_621_slice_of_cake': 10290, 'place_v_387_trap_door_closed': 10291,
  'place_v_316_blue_jellyfish_jar': 10292, 'place_v_125_crystal_ball': 10293, 'place_v_287_ammo_box': 10294, 'place_v_294_zebra_swallowtail_butterfly_jar': 10295,
  'place_v_291_ulysses_butterfly_jar': 10296, 'place_v_292_sulphur_butterfly_jar': 10297, 'place_v_289_purple_emperor_butterfly_jar': 10298, 'place_v_172_sinks': 10299,
  'place_v_656_glow_tulip': 10300, 'place_v_113_hallow_tall_plants': 10301, 'place_v_235_teleporter': 10302, 'place_v_567_garden_gnome': 10303,
  'place_v_638_ash_vines': 10304, 'place_v_528_mushroom_vines': 10305, 'place_v_382_flower_vines': 10306, 'place_v_124_wooden_beam': 10307,
  'place_v_575_rich_mahogany_beam': 10308, 'place_v_213_rope': 10309, 'place_v_636_corrupt_vines': 10310, 'place_v_574_boreal_beam': 10311,
  'place_v_333_platinum_coin_pile': 10312, 'place_v_332_gold_coin_pile': 10313, 'place_v_577_sandstone_column': 10314, 'place_v_561_marble_column': 10315,
  'place_v_576_granite_column': 10316, 'place_v_214_chain': 10317, 'place_v_578_mushroom_beam': 10318, 'place_v_52_vines': 10319,
  'place_v_62_jungle_vines': 10320, 'place_v_69_jungle_thorns': 10321, 'place_v_625_neon_moss_block': 10322, 'place_v_151_sandstone_brick': 10323,
  'place_v_234_crimsand_block': 10324, 'place_v_182_blue_moss_block': 10325, 'place_v_205_crimson_vines': 10326, 'place_v_45_gold_brick': 10327,
  'place_v_399_crimson_hardened_sand_block': 10328, 'place_v_352_crimtane_thorns': 10329, 'place_v_248_palladium_column': 10330, 'place_v_340_living_cursed_fire_block': 10331,
  'place_v_207_water_fountains': 10332, 'place_v_144_timers': 10333, 'place_v_475_hat_rack': 10334, 'place_v_175_tin_brick': 10335,
  'place_v_132_lever': 10336, 'place_v_539_argon_moss_block': 10337, 'place_v_481_cracked_blue_brick': 10338, 'place_v_120_mudstone_brick': 10339,
  'place_v_714_spider_boulder': 10340, 'place_v_752_chillet_egg': 10341, 'place_v_751_sleeping_digtoise': 10342, 'place_v_664_bouncy_boulder': 10343,
  'place_v_711_rainbow_boulder': 10344, 'place_v_715_ghoulder': 10345, 'place_v_716_friendly_boulder': 10346, 'place_v_713_lava_boulder': 10347,
  'place_v_23_corrupt_grass_block': 10348, 'place_v_31_orb_heart': 10349, 'place_v_41_blue_brick': 10350, 'place_v_75_obsidian_brick': 10351,
  'place_v_199_crimson_grass_block': 10352, 'place_v_60_jungle_grass_block': 10353, 'place_v_70_mushroom_grass_block': 10354, 'place_v_25_ebonstone_block': 10355,
  'place_v_202_sunplate_block': 10356, 'place_v_71_mushroom_plant': 10357, 'place_v_24_corruption_short_plants': 10358, 'place_v_32_corruption_thorns': 10359,
  'place_v_27_sunflower': 10360, 'place_v_5_trees': 10361, 'place_v_80_cactus': 10362, 'place_v_3_forest_short_plants': 10363,
  'place_v_73_forest_tall_plants': 10364, 'place_v_61_jungle_short_plants': 10365, 'place_v_74_jungle_tall_plants': 10366, 'place_v_83_herbs_mature': 10367,
  'place_v_84_herbs_bloom': 10368, 'place_v_72_mushroom_tree': 10369, 'place_v_43_green_brick': 10370, 'place_v_44_pink_brick': 10371,
  'place_v_203_crimstone_block': 10372, 'place_v_201_crimson_short_plants': 10373, 'place_v_35_jackolanterns': 10374, 'place_v_92_lampposts': 10375,
  'place_v_126_discoball': 10376, 'place_v_131_inactivestoneblock': 10377, 'place_v_139_musicboxes': 10378, 'place_v_142_inletpump': 10379,
  'place_v_143_outletpump': 10380, 'place_v_149_holidaylights': 10381, 'place_v_173_platinumcandelabra': 10382, 'place_v_174_platinumcandle': 10383,
  'place_v_209_cannon': 10384, 'place_v_210_landmine': 10385, 'place_v_212_snowballlauncher': 10386, 'place_v_216_firework': 10387,
  'place_v_244_bubblemachine': 10388, 'place_v_255_amethystgemsparkoff': 10389, 'place_v_256_topazgemsparkoff': 10390, 'place_v_257_sapphiregemsparkoff': 10391,
  'place_v_258_emeraldgemsparkoff': 10392, 'place_v_259_rubygemsparkoff': 10393, 'place_v_260_diamondgemsparkoff': 10394, 'place_v_261_ambergemsparkoff': 10395,
  'place_v_262_amethystgemspark': 10396, 'place_v_263_topazgemspark': 10397, 'place_v_264_sapphiregemspark': 10398, 'place_v_265_emeraldgemspark': 10399,
  'place_v_266_rubygemspark': 10400, 'place_v_267_diamondgemspark': 10401, 'place_v_268_ambergemspark': 10402, 'place_v_335_fireworksbox': 10403,
  'place_v_338_fireworkfountain': 10404, 'place_v_372_peacecandle': 10405, 'place_v_386_trapdooropen': 10406, 'place_v_389_tallgateopen': 10407,
  // (⚠️5 2026-08-23：v_389_tallgateopen def 已退役——唯一消费点 devices.ShiftTallGate 改用
  //  v_389_tall_gate_open;def 槽位保留防 TILE_DEFS 内部 id 平移（world-final-hash 金标锁
  //  raw 数组）,place 物品随 def 自动注册故本号保留,10407 冻结不复用)
  'place_v_410_lunarmonolith': 10408, 'place_v_419_logicgatelamp': 10409, 'place_v_420_logicgate': 10410, 'place_v_421_conveyorbeltleft': 10411,
  'place_v_423_logicsensor': 10412, 'place_v_424_wirepipe': 10413, 'place_v_425_announcementbox': 10414, 'place_v_428_weightedpressureplate': 10415,
  'place_v_429_wirebulb': 10416, 'place_v_440_gemlocks': 10417, 'place_v_441_fakecontainers': 10418, 'place_v_442_projectilepressurepad': 10419,
  'place_v_445_pixelbox': 10420, 'place_v_452_sillyballoonmachine': 10421, 'place_v_455_partymonolith': 10422, 'place_v_468_fakecontainers2': 10423,
  'place_v_476_golfhole': 10424, 'place_v_480_bloodmoonmonolith': 10425, 'place_v_497_toilets': 10426, 'place_v_509_voidmonolith': 10427,
  'place_v_531_boulderstatue': 10428, 'place_v_546_grate': 10429, 'place_v_557_grateclosed': 10430, 'place_v_564_plasmalamp': 10431,
  'place_v_565_fogmachine': 10432, 'place_v_593_volcanosmall': 10433, 'place_v_594_volcanolarge': 10434, 'place_v_482_cracked_green_brick': 10435,
  'place_v_163_purple_ice_block': 10436, 'place_v_200_red_ice_block': 10437, 'place_v_116_pearlsand_block': 10438, 'place_v_76_hellstone_brick': 10439,
  'place_v_77_hellforge': 10440, 'place_v_55_signs': 10441, 'place_v_301_flesh_cloning_vat': 10442, 'place_v_307_steampunk_boiler': 10443,
  'place_v_308_honey_dispenser': 10444, 'place_v_499_decay_chamber': 10445, 'corrupt_grass_seeds': 10446, 'crimson_grass_seeds': 10447,
  'jungle_grass_seeds': 10448, 'mushroom_grass_seeds': 10449, 'empty_bucket': 10450, 'water_bucket': 10451,
  'lava_bucket': 10452, 'honey_bucket': 10453, 'tin_pickaxe': 10454, 'tin_axe': 10455,
  'tin_sword': 10456, 'lead_pickaxe': 10457, 'lead_axe': 10458, 'lead_sword': 10459,
  'tungsten_pickaxe': 10460, 'tungsten_axe': 10461, 'tungsten_sword': 10462, 'platinum_pickaxe': 10463,
  'platinum_axe': 10464, 'platinum_sword': 10465, 'wooden_bow': 10466, 'wooden_arrow': 10467,
  'flaming_arrow': 10468, 'iron_bow': 10469, 'minecart_item': 10470, 'wand_of_sparking': 10471,
  'amethyst_bolt': 10472, 'worm_food': 10473, 'bloody_spine': 10474, 'slime_crown': 10475,
  'mechanical_worm': 10476, 'mechanical_eye': 10477, 'mechanical_skull': 10478, 'wire': 10479,
  'red_wrench': 10480, 'blue_wrench': 10481, 'green_wrench': 10482, 'yellow_wrench': 10483,
  'wire_cutter': 10484, 'actuator_item': 10485, 'actuation_rod': 10486, 'multicolor_wrench': 10487,
  'grand_design': 10488,
  'goblin_battle_standard': 10489, 'snow_globe': 10490, 'pirate_map': 10491,
  'coin_platinum': 10492,
  'place_v_119_iridescent_brick': 10493,
  'obsidian_skin_potion': 10494, 'gills_potion': 10495, 'mana_regen_potion': 10496,
  'magic_power_potion': 10497, 'featherfall_potion': 10498, 'water_walking_potion': 10499,
  'archery_potion': 10500,
  'night_owl_potion': 10501,
};

// ---- 墙面物品全量（vanilla-wallitems.json = Item.cs createWall 提取,292 项）：
// 已注册的 vi_ 墙物品补 wallId；缺的按 vi_ 命名注册（稳定 id = 物品 id 自动派生）
import wallItemsJson from './vanilla-wallitems.json';
for (const wi of Object.values(wallItemsJson as Record<string, { wall: number; key: string }>)) {
  const existing = byKey[wi.key];
  if (existing !== undefined) { ITEM_DEFS[existing].wallId = wi.wall; continue; }
  item({ key: wi.key, name: '', maxStack: 999, value: 1, wallId: wi.wall });
}
// 稳定 id 表构建在【文件尾】（D1 修复,2026-08-21）——见文件尾 ITEM_STABLE_OF_INTERNAL 段。
// 曾建在 :1330（墙面物品注册后）:其后追加的敌旗 290/钓鱼 35/具名 5 件落在表外,
// serialize.ts `ITEM_STABLE_OF_INTERNAL[it.id] ?? 0` 存盘写 0 → 读档 id 0 静默丢失。
// ---- 原版工具力表补齐(Item.cs SetDefaults 提取)→ vi_ 道具 tool 元数据 ----
// 条件破坏链的道具入口:圣锤 80 砸祭坛/邪恶石 65 需梦魇镐/神庙砖 210 需 Picksaw 级等
// ⚠ axe 单位=源码原值(斧力%÷5,如 Drax axe=22=110%)——消费端 int(axe*1.2);
//   曾误存 70(当全百分比)致双工具砍树快 3 倍,2026-08-13 对齐 Player.cs:45098
export const VANILLA_TOOL_POWERS: Record<number, { pick?: number; hammer?: number; axe?: number }> = JSON.parse("{\"103\":{\"pick\":65},\"104\":{\"hammer\":55},\"122\":{\"pick\":100},\"204\":{\"hammer\":60,\"axe\":20},\"217\":{\"hammer\":70,\"axe\":30},\"367\":{\"hammer\":80},\"579\":{\"pick\":200,\"axe\":22},\"654\":{\"hammer\":40},\"657\":{\"hammer\":35},\"660\":{\"hammer\":55},\"776\":{\"pick\":110},\"777\":{\"pick\":150},\"778\":{\"pick\":180},\"787\":{\"hammer\":85},\"797\":{\"hammer\":55},\"798\":{\"pick\":70},\"922\":{\"hammer\":40},\"990\":{\"pick\":200,\"axe\":22},\"1188\":{\"pick\":130},\"1195\":{\"pick\":165},\"1202\":{\"pick\":190},\"1234\":{\"hammer\":90},\"1262\":{\"hammer\":90},\"1305\":{\"hammer\":100,\"axe\":35},\"1506\":{\"pick\":200},\"1507\":{\"hammer\":90,\"axe\":30},\"3481\":{\"hammer\":59},\"3487\":{\"hammer\":50},\"3493\":{\"hammer\":43},\"3499\":{\"hammer\":38},\"3505\":{\"hammer\":35},\"3511\":{\"hammer\":45},\"3517\":{\"hammer\":55},\"3525\":{\"hammer\":100,\"axe\":30},\"4317\":{\"hammer\":80,\"axe\":30}}");
import { itemCombat } from './vanillaItemCombat';
for (const [idS, tp] of Object.entries(VANILLA_TOOL_POWERS)) {
  const key = VANILLA_ITEM_KEY_BY_ID[Number(idS)];
  if (!key) continue;
  const def = ITEM_DEFS[ITEM_BY_KEY[key]];
  if (!def) continue;
  const type = tp.pick !== undefined ? 'pick' : 'hammer';
  // F1（2026-08-22 工具审计）：speed/useTime/damage/knockback 从 itemCombat 桥入——
  //  此前只写 {type,power}，Game.updateUse 工具分支 tool.speed??46（:7835）与
  //  tool.useTime??spd（:7853）双双回落 46t：35 件（梦魇/熔岩/钴/秘银/精金/钯/山铜/
  //  钛/幽魂镐、Drax、镐斧、圣锤、全部 def.tool 锤斧）挖掘冷却 46t（原版 7-25t，
  //  慢 1.8-6.6 倍）。数值 = Item.cs SetDefaults 逐件终值（itemCombat 与源码逐件一致，
  //  审计抽查 14 件全中）。模块加载期变体层未灌入 → 恒取常规世界基值（remix 变体
  //  useTime 覆写仅 itemFuncTool 63 件桥接受益；工具族无变体 useTime 差，无行为差）。
  // F2：三力全量写进 tool 对象（dualToolResolve 只认 tool 内 pick/axe/hammer 三力，
  //  只写主 power 时 multi 恒假 = 8 件双工具副斧力失效不能砍树）。
  const c = itemCombat(Number(idS));
  def.tool = {
    type: type as ToolType,
    power: tp.pick ?? tp.hammer ?? 0,
    speed: c?.useAnimation,
    useTime: c?.useTime,
    damage: c?.damage,
    knockback: c?.knockBack,
    pickPower: tp.pick,
    axePower: tp.axe,
    hammerPower: tp.hammer,
  };
  if (tp.axe !== undefined) def.axePower = tp.axe;
}

// ---- 敌旗独立物品(290 件,原版 BannerToItem 映射 1:1,2026-08-13) ----
item({ key: 'vi_1615_banner_b1', name: '', maxStack: 99, value: 1 }); // 敌旗 banner1→item 1615
item({ key: 'vi_1616_banner_b2', name: '', maxStack: 99, value: 1 }); // 敌旗 banner2→item 1616
item({ key: 'vi_1617_banner_b3', name: '', maxStack: 99, value: 1 }); // 敌旗 banner3→item 1617
item({ key: 'vi_1618_banner_b4', name: '', maxStack: 99, value: 1 }); // 敌旗 banner4→item 1618
item({ key: 'vi_1619_banner_b5', name: '', maxStack: 99, value: 1 }); // 敌旗 banner5→item 1619
item({ key: 'vi_1620_banner_b6', name: '', maxStack: 99, value: 1 }); // 敌旗 banner6→item 1620
item({ key: 'vi_1621_banner_b7', name: '', maxStack: 99, value: 1 }); // 敌旗 banner7→item 1621
item({ key: 'vi_1622_banner_b8', name: '', maxStack: 99, value: 1 }); // 敌旗 banner8→item 1622
item({ key: 'vi_1623_banner_b9', name: '', maxStack: 99, value: 1 }); // 敌旗 banner9→item 1623
item({ key: 'vi_1624_banner_b10', name: '', maxStack: 99, value: 1 }); // 敌旗 banner10→item 1624
item({ key: 'vi_1625_banner_b11', name: '', maxStack: 99, value: 1 }); // 敌旗 banner11→item 1625
item({ key: 'vi_1626_banner_b12', name: '', maxStack: 99, value: 1 }); // 敌旗 banner12→item 1626
item({ key: 'vi_1627_banner_b13', name: '', maxStack: 99, value: 1 }); // 敌旗 banner13→item 1627
item({ key: 'vi_1628_banner_b14', name: '', maxStack: 99, value: 1 }); // 敌旗 banner14→item 1628
item({ key: 'vi_1629_banner_b15', name: '', maxStack: 99, value: 1 }); // 敌旗 banner15→item 1629
item({ key: 'vi_1630_banner_b16', name: '', maxStack: 99, value: 1 }); // 敌旗 banner16→item 1630
item({ key: 'vi_1631_banner_b17', name: '', maxStack: 99, value: 1 }); // 敌旗 banner17→item 1631
item({ key: 'vi_1632_banner_b18', name: '', maxStack: 99, value: 1 }); // 敌旗 banner18→item 1632
item({ key: 'vi_1633_banner_b19', name: '', maxStack: 99, value: 1 }); // 敌旗 banner19→item 1633
item({ key: 'vi_1634_banner_b20', name: '', maxStack: 99, value: 1 }); // 敌旗 banner20→item 1634
item({ key: 'vi_1635_banner_b21', name: '', maxStack: 99, value: 1 }); // 敌旗 banner21→item 1635
item({ key: 'vi_1636_banner_b22', name: '', maxStack: 99, value: 1 }); // 敌旗 banner22→item 1636
item({ key: 'vi_1637_banner_b23', name: '', maxStack: 99, value: 1 }); // 敌旗 banner23→item 1637
item({ key: 'vi_1638_banner_b24', name: '', maxStack: 99, value: 1 }); // 敌旗 banner24→item 1638
item({ key: 'vi_1639_banner_b25', name: '', maxStack: 99, value: 1 }); // 敌旗 banner25→item 1639
item({ key: 'vi_1640_banner_b26', name: '', maxStack: 99, value: 1 }); // 敌旗 banner26→item 1640
item({ key: 'vi_1641_banner_b27', name: '', maxStack: 99, value: 1 }); // 敌旗 banner27→item 1641
item({ key: 'vi_1642_banner_b28', name: '', maxStack: 99, value: 1 }); // 敌旗 banner28→item 1642
item({ key: 'vi_1643_banner_b29', name: '', maxStack: 99, value: 1 }); // 敌旗 banner29→item 1643
item({ key: 'vi_1644_banner_b30', name: '', maxStack: 99, value: 1 }); // 敌旗 banner30→item 1644
item({ key: 'vi_1645_banner_b31', name: '', maxStack: 99, value: 1 }); // 敌旗 banner31→item 1645
item({ key: 'vi_1646_banner_b32', name: '', maxStack: 99, value: 1 }); // 敌旗 banner32→item 1646
item({ key: 'vi_1647_banner_b33', name: '', maxStack: 99, value: 1 }); // 敌旗 banner33→item 1647
item({ key: 'vi_1648_banner_b34', name: '', maxStack: 99, value: 1 }); // 敌旗 banner34→item 1648
item({ key: 'vi_1649_banner_b35', name: '', maxStack: 99, value: 1 }); // 敌旗 banner35→item 1649
item({ key: 'vi_1650_banner_b36', name: '', maxStack: 99, value: 1 }); // 敌旗 banner36→item 1650
item({ key: 'vi_1651_banner_b37', name: '', maxStack: 99, value: 1 }); // 敌旗 banner37→item 1651
item({ key: 'vi_1652_banner_b38', name: '', maxStack: 99, value: 1 }); // 敌旗 banner38→item 1652
item({ key: 'vi_1653_banner_b39', name: '', maxStack: 99, value: 1 }); // 敌旗 banner39→item 1653
item({ key: 'vi_1654_banner_b40', name: '', maxStack: 99, value: 1 }); // 敌旗 banner40→item 1654
item({ key: 'vi_1655_banner_b41', name: '', maxStack: 99, value: 1 }); // 敌旗 banner41→item 1655
item({ key: 'vi_1656_banner_b42', name: '', maxStack: 99, value: 1 }); // 敌旗 banner42→item 1656
item({ key: 'vi_1657_banner_b43', name: '', maxStack: 99, value: 1 }); // 敌旗 banner43→item 1657
item({ key: 'vi_1658_banner_b44', name: '', maxStack: 99, value: 1 }); // 敌旗 banner44→item 1658
item({ key: 'vi_1659_banner_b45', name: '', maxStack: 99, value: 1 }); // 敌旗 banner45→item 1659
item({ key: 'vi_1660_banner_b46', name: '', maxStack: 99, value: 1 }); // 敌旗 banner46→item 1660
item({ key: 'vi_1661_banner_b47', name: '', maxStack: 99, value: 1 }); // 敌旗 banner47→item 1661
item({ key: 'vi_1662_banner_b48', name: '', maxStack: 99, value: 1 }); // 敌旗 banner48→item 1662
item({ key: 'vi_1663_banner_b49', name: '', maxStack: 99, value: 1 }); // 敌旗 banner49→item 1663
item({ key: 'vi_1664_banner_b50', name: '', maxStack: 99, value: 1 }); // 敌旗 banner50→item 1664
item({ key: 'vi_1665_banner_b51', name: '', maxStack: 99, value: 1 }); // 敌旗 banner51→item 1665
item({ key: 'vi_1666_banner_b52', name: '', maxStack: 99, value: 1 }); // 敌旗 banner52→item 1666
item({ key: 'vi_1667_banner_b53', name: '', maxStack: 99, value: 1 }); // 敌旗 banner53→item 1667
item({ key: 'vi_1668_banner_b54', name: '', maxStack: 99, value: 1 }); // 敌旗 banner54→item 1668
item({ key: 'vi_1669_banner_b55', name: '', maxStack: 99, value: 1 }); // 敌旗 banner55→item 1669
item({ key: 'vi_1670_banner_b56', name: '', maxStack: 99, value: 1 }); // 敌旗 banner56→item 1670
item({ key: 'vi_1671_banner_b57', name: '', maxStack: 99, value: 1 }); // 敌旗 banner57→item 1671
item({ key: 'vi_1672_banner_b58', name: '', maxStack: 99, value: 1 }); // 敌旗 banner58→item 1672
item({ key: 'vi_1673_banner_b59', name: '', maxStack: 99, value: 1 }); // 敌旗 banner59→item 1673
item({ key: 'vi_1674_banner_b60', name: '', maxStack: 99, value: 1 }); // 敌旗 banner60→item 1674
item({ key: 'vi_1675_banner_b61', name: '', maxStack: 99, value: 1 }); // 敌旗 banner61→item 1675
item({ key: 'vi_1676_banner_b62', name: '', maxStack: 99, value: 1 }); // 敌旗 banner62→item 1676
item({ key: 'vi_1677_banner_b63', name: '', maxStack: 99, value: 1 }); // 敌旗 banner63→item 1677
item({ key: 'vi_1678_banner_b64', name: '', maxStack: 99, value: 1 }); // 敌旗 banner64→item 1678
item({ key: 'vi_1679_banner_b65', name: '', maxStack: 99, value: 1 }); // 敌旗 banner65→item 1679
item({ key: 'vi_1680_banner_b66', name: '', maxStack: 99, value: 1 }); // 敌旗 banner66→item 1680
item({ key: 'vi_1681_banner_b67', name: '', maxStack: 99, value: 1 }); // 敌旗 banner67→item 1681
item({ key: 'vi_1682_banner_b68', name: '', maxStack: 99, value: 1 }); // 敌旗 banner68→item 1682
item({ key: 'vi_1683_banner_b69', name: '', maxStack: 99, value: 1 }); // 敌旗 banner69→item 1683
item({ key: 'vi_1684_banner_b70', name: '', maxStack: 99, value: 1 }); // 敌旗 banner70→item 1684
item({ key: 'vi_1685_banner_b71', name: '', maxStack: 99, value: 1 }); // 敌旗 banner71→item 1685
item({ key: 'vi_1686_banner_b72', name: '', maxStack: 99, value: 1 }); // 敌旗 banner72→item 1686
item({ key: 'vi_1687_banner_b73', name: '', maxStack: 99, value: 1 }); // 敌旗 banner73→item 1687
item({ key: 'vi_1688_banner_b74', name: '', maxStack: 99, value: 1 }); // 敌旗 banner74→item 1688
item({ key: 'vi_1689_banner_b75', name: '', maxStack: 99, value: 1 }); // 敌旗 banner75→item 1689
item({ key: 'vi_1690_banner_b76', name: '', maxStack: 99, value: 1 }); // 敌旗 banner76→item 1690
item({ key: 'vi_1691_banner_b77', name: '', maxStack: 99, value: 1 }); // 敌旗 banner77→item 1691
item({ key: 'vi_1692_banner_b78', name: '', maxStack: 99, value: 1 }); // 敌旗 banner78→item 1692
item({ key: 'vi_1693_banner_b79', name: '', maxStack: 99, value: 1 }); // 敌旗 banner79→item 1693
item({ key: 'vi_1694_banner_b80', name: '', maxStack: 99, value: 1 }); // 敌旗 banner80→item 1694
item({ key: 'vi_1695_banner_b81', name: '', maxStack: 99, value: 1 }); // 敌旗 banner81→item 1695
item({ key: 'vi_1696_banner_b82', name: '', maxStack: 99, value: 1 }); // 敌旗 banner82→item 1696
item({ key: 'vi_1697_banner_b83', name: '', maxStack: 99, value: 1 }); // 敌旗 banner83→item 1697
item({ key: 'vi_1698_banner_b84', name: '', maxStack: 99, value: 1 }); // 敌旗 banner84→item 1698
item({ key: 'vi_1699_banner_b85', name: '', maxStack: 99, value: 1 }); // 敌旗 banner85→item 1699
item({ key: 'vi_1700_banner_b86', name: '', maxStack: 99, value: 1 }); // 敌旗 banner86→item 1700
item({ key: 'vi_1701_banner_b87', name: '', maxStack: 99, value: 1 }); // 敌旗 banner87→item 1701
item({ key: 'vi_2897_banner_b88', name: '', maxStack: 99, value: 1 }); // 敌旗 banner88→item 2897
item({ key: 'vi_2898_banner_b89', name: '', maxStack: 99, value: 1 }); // 敌旗 banner89→item 2898
item({ key: 'vi_2899_banner_b90', name: '', maxStack: 99, value: 1 }); // 敌旗 banner90→item 2899
item({ key: 'vi_2900_banner_b91', name: '', maxStack: 99, value: 1 }); // 敌旗 banner91→item 2900
item({ key: 'vi_2901_banner_b92', name: '', maxStack: 99, value: 1 }); // 敌旗 banner92→item 2901
item({ key: 'vi_2902_banner_b93', name: '', maxStack: 99, value: 1 }); // 敌旗 banner93→item 2902
item({ key: 'vi_2903_banner_b94', name: '', maxStack: 99, value: 1 }); // 敌旗 banner94→item 2903
item({ key: 'vi_2904_banner_b95', name: '', maxStack: 99, value: 1 }); // 敌旗 banner95→item 2904
item({ key: 'vi_2905_banner_b96', name: '', maxStack: 99, value: 1 }); // 敌旗 banner96→item 2905
item({ key: 'vi_2906_banner_b97', name: '', maxStack: 99, value: 1 }); // 敌旗 banner97→item 2906
item({ key: 'vi_2907_banner_b98', name: '', maxStack: 99, value: 1 }); // 敌旗 banner98→item 2907
item({ key: 'vi_2908_banner_b99', name: '', maxStack: 99, value: 1 }); // 敌旗 banner99→item 2908
item({ key: 'vi_2909_banner_b100', name: '', maxStack: 99, value: 1 }); // 敌旗 banner100→item 2909
item({ key: 'vi_2910_banner_b101', name: '', maxStack: 99, value: 1 }); // 敌旗 banner101→item 2910
item({ key: 'vi_2911_banner_b102', name: '', maxStack: 99, value: 1 }); // 敌旗 banner102→item 2911
item({ key: 'vi_2912_banner_b103', name: '', maxStack: 99, value: 1 }); // 敌旗 banner103→item 2912
item({ key: 'vi_2913_banner_b104', name: '', maxStack: 99, value: 1 }); // 敌旗 banner104→item 2913
item({ key: 'vi_2914_banner_b105', name: '', maxStack: 99, value: 1 }); // 敌旗 banner105→item 2914
item({ key: 'vi_2915_banner_b106', name: '', maxStack: 99, value: 1 }); // 敌旗 banner106→item 2915
item({ key: 'vi_2916_banner_b107', name: '', maxStack: 99, value: 1 }); // 敌旗 banner107→item 2916
item({ key: 'vi_2917_banner_b108', name: '', maxStack: 99, value: 1 }); // 敌旗 banner108→item 2917
item({ key: 'vi_2918_banner_b109', name: '', maxStack: 99, value: 1 }); // 敌旗 banner109→item 2918
item({ key: 'vi_2919_banner_b110', name: '', maxStack: 99, value: 1 }); // 敌旗 banner110→item 2919
item({ key: 'vi_2920_banner_b111', name: '', maxStack: 99, value: 1 }); // 敌旗 banner111→item 2920
item({ key: 'vi_2921_banner_b112', name: '', maxStack: 99, value: 1 }); // 敌旗 banner112→item 2921
item({ key: 'vi_2922_banner_b113', name: '', maxStack: 99, value: 1 }); // 敌旗 banner113→item 2922
item({ key: 'vi_2923_banner_b114', name: '', maxStack: 99, value: 1 }); // 敌旗 banner114→item 2923
item({ key: 'vi_2924_banner_b115', name: '', maxStack: 99, value: 1 }); // 敌旗 banner115→item 2924
item({ key: 'vi_2925_banner_b116', name: '', maxStack: 99, value: 1 }); // 敌旗 banner116→item 2925
item({ key: 'vi_2926_banner_b117', name: '', maxStack: 99, value: 1 }); // 敌旗 banner117→item 2926
item({ key: 'vi_2927_banner_b118', name: '', maxStack: 99, value: 1 }); // 敌旗 banner118→item 2927
item({ key: 'vi_2928_banner_b119', name: '', maxStack: 99, value: 1 }); // 敌旗 banner119→item 2928
item({ key: 'vi_2929_banner_b120', name: '', maxStack: 99, value: 1 }); // 敌旗 banner120→item 2929
item({ key: 'vi_2930_banner_b121', name: '', maxStack: 99, value: 1 }); // 敌旗 banner121→item 2930
item({ key: 'vi_2931_banner_b122', name: '', maxStack: 99, value: 1 }); // 敌旗 banner122→item 2931
item({ key: 'vi_2932_banner_b123', name: '', maxStack: 99, value: 1 }); // 敌旗 banner123→item 2932
item({ key: 'vi_2933_banner_b124', name: '', maxStack: 99, value: 1 }); // 敌旗 banner124→item 2933
item({ key: 'vi_2934_banner_b125', name: '', maxStack: 99, value: 1 }); // 敌旗 banner125→item 2934
item({ key: 'vi_2935_banner_b126', name: '', maxStack: 99, value: 1 }); // 敌旗 banner126→item 2935
item({ key: 'vi_2936_banner_b127', name: '', maxStack: 99, value: 1 }); // 敌旗 banner127→item 2936
item({ key: 'vi_2937_banner_b128', name: '', maxStack: 99, value: 1 }); // 敌旗 banner128→item 2937
item({ key: 'vi_2938_banner_b129', name: '', maxStack: 99, value: 1 }); // 敌旗 banner129→item 2938
item({ key: 'vi_2939_banner_b130', name: '', maxStack: 99, value: 1 }); // 敌旗 banner130→item 2939
item({ key: 'vi_2940_banner_b131', name: '', maxStack: 99, value: 1 }); // 敌旗 banner131→item 2940
item({ key: 'vi_2941_banner_b132', name: '', maxStack: 99, value: 1 }); // 敌旗 banner132→item 2941
item({ key: 'vi_2942_banner_b133', name: '', maxStack: 99, value: 1 }); // 敌旗 banner133→item 2942
item({ key: 'vi_2943_banner_b134', name: '', maxStack: 99, value: 1 }); // 敌旗 banner134→item 2943
item({ key: 'vi_2944_banner_b135', name: '', maxStack: 99, value: 1 }); // 敌旗 banner135→item 2944
item({ key: 'vi_2945_banner_b136', name: '', maxStack: 99, value: 1 }); // 敌旗 banner136→item 2945
item({ key: 'vi_2946_banner_b137', name: '', maxStack: 99, value: 1 }); // 敌旗 banner137→item 2946
item({ key: 'vi_2947_banner_b138', name: '', maxStack: 99, value: 1 }); // 敌旗 banner138→item 2947
item({ key: 'vi_2948_banner_b139', name: '', maxStack: 99, value: 1 }); // 敌旗 banner139→item 2948
item({ key: 'vi_2949_banner_b140', name: '', maxStack: 99, value: 1 }); // 敌旗 banner140→item 2949
item({ key: 'vi_2950_banner_b141', name: '', maxStack: 99, value: 1 }); // 敌旗 banner141→item 2950
item({ key: 'vi_2951_banner_b142', name: '', maxStack: 99, value: 1 }); // 敌旗 banner142→item 2951
item({ key: 'vi_2952_banner_b143', name: '', maxStack: 99, value: 1 }); // 敌旗 banner143→item 2952
item({ key: 'vi_2953_banner_b144', name: '', maxStack: 99, value: 1 }); // 敌旗 banner144→item 2953
item({ key: 'vi_2954_banner_b145', name: '', maxStack: 99, value: 1 }); // 敌旗 banner145→item 2954
item({ key: 'vi_2955_banner_b146', name: '', maxStack: 99, value: 1 }); // 敌旗 banner146→item 2955
item({ key: 'vi_2956_banner_b147', name: '', maxStack: 99, value: 1 }); // 敌旗 banner147→item 2956
item({ key: 'vi_2957_banner_b148', name: '', maxStack: 99, value: 1 }); // 敌旗 banner148→item 2957
item({ key: 'vi_2958_banner_b149', name: '', maxStack: 99, value: 1 }); // 敌旗 banner149→item 2958
item({ key: 'vi_2959_banner_b150', name: '', maxStack: 99, value: 1 }); // 敌旗 banner150→item 2959
item({ key: 'vi_2960_banner_b151', name: '', maxStack: 99, value: 1 }); // 敌旗 banner151→item 2960
item({ key: 'vi_2961_banner_b152', name: '', maxStack: 99, value: 1 }); // 敌旗 banner152→item 2961
item({ key: 'vi_2962_banner_b153', name: '', maxStack: 99, value: 1 }); // 敌旗 banner153→item 2962
item({ key: 'vi_2963_banner_b154', name: '', maxStack: 99, value: 1 }); // 敌旗 banner154→item 2963
item({ key: 'vi_2964_banner_b155', name: '', maxStack: 99, value: 1 }); // 敌旗 banner155→item 2964
item({ key: 'vi_2965_banner_b156', name: '', maxStack: 99, value: 1 }); // 敌旗 banner156→item 2965
item({ key: 'vi_2966_banner_b157', name: '', maxStack: 99, value: 1 }); // 敌旗 banner157→item 2966
item({ key: 'vi_2967_banner_b158', name: '', maxStack: 99, value: 1 }); // 敌旗 banner158→item 2967
item({ key: 'vi_2968_banner_b159', name: '', maxStack: 99, value: 1 }); // 敌旗 banner159→item 2968
item({ key: 'vi_2969_banner_b160', name: '', maxStack: 99, value: 1 }); // 敌旗 banner160→item 2969
item({ key: 'vi_2970_banner_b161', name: '', maxStack: 99, value: 1 }); // 敌旗 banner161→item 2970
item({ key: 'vi_2971_banner_b162', name: '', maxStack: 99, value: 1 }); // 敌旗 banner162→item 2971
item({ key: 'vi_2972_banner_b163', name: '', maxStack: 99, value: 1 }); // 敌旗 banner163→item 2972
item({ key: 'vi_2973_banner_b164', name: '', maxStack: 99, value: 1 }); // 敌旗 banner164→item 2973
item({ key: 'vi_2974_banner_b165', name: '', maxStack: 99, value: 1 }); // 敌旗 banner165→item 2974
item({ key: 'vi_2975_banner_b166', name: '', maxStack: 99, value: 1 }); // 敌旗 banner166→item 2975
item({ key: 'vi_2976_banner_b167', name: '', maxStack: 99, value: 1 }); // 敌旗 banner167→item 2976
item({ key: 'vi_2977_banner_b168', name: '', maxStack: 99, value: 1 }); // 敌旗 banner168→item 2977
item({ key: 'vi_2978_banner_b169', name: '', maxStack: 99, value: 1 }); // 敌旗 banner169→item 2978
item({ key: 'vi_2979_banner_b170', name: '', maxStack: 99, value: 1 }); // 敌旗 banner170→item 2979
item({ key: 'vi_2980_banner_b171', name: '', maxStack: 99, value: 1 }); // 敌旗 banner171→item 2980
item({ key: 'vi_2981_banner_b172', name: '', maxStack: 99, value: 1 }); // 敌旗 banner172→item 2981
item({ key: 'vi_2982_banner_b173', name: '', maxStack: 99, value: 1 }); // 敌旗 banner173→item 2982
item({ key: 'vi_2983_banner_b174', name: '', maxStack: 99, value: 1 }); // 敌旗 banner174→item 2983
item({ key: 'vi_2984_banner_b175', name: '', maxStack: 99, value: 1 }); // 敌旗 banner175→item 2984
item({ key: 'vi_2985_banner_b176', name: '', maxStack: 99, value: 1 }); // 敌旗 banner176→item 2985
item({ key: 'vi_2986_banner_b177', name: '', maxStack: 99, value: 1 }); // 敌旗 banner177→item 2986
item({ key: 'vi_2987_banner_b178', name: '', maxStack: 99, value: 1 }); // 敌旗 banner178→item 2987
item({ key: 'vi_2988_banner_b179', name: '', maxStack: 99, value: 1 }); // 敌旗 banner179→item 2988
item({ key: 'vi_2989_banner_b180', name: '', maxStack: 99, value: 1 }); // 敌旗 banner180→item 2989
item({ key: 'vi_2990_banner_b181', name: '', maxStack: 99, value: 1 }); // 敌旗 banner181→item 2990
item({ key: 'vi_2991_banner_b182', name: '', maxStack: 99, value: 1 }); // 敌旗 banner182→item 2991
item({ key: 'vi_2992_banner_b183', name: '', maxStack: 99, value: 1 }); // 敌旗 banner183→item 2992
item({ key: 'vi_2993_banner_b184', name: '', maxStack: 99, value: 1 }); // 敌旗 banner184→item 2993
item({ key: 'vi_2994_banner_b185', name: '', maxStack: 99, value: 1 }); // 敌旗 banner185→item 2994
item({ key: 'vi_3390_banner_b186', name: '', maxStack: 99, value: 1 }); // 敌旗 banner186→item 3390
item({ key: 'vi_3391_banner_b187', name: '', maxStack: 99, value: 1 }); // 敌旗 banner187→item 3391
item({ key: 'vi_3392_banner_b188', name: '', maxStack: 99, value: 1 }); // 敌旗 banner188→item 3392
item({ key: 'vi_3393_banner_b189', name: '', maxStack: 99, value: 1 }); // 敌旗 banner189→item 3393
item({ key: 'vi_3394_banner_b190', name: '', maxStack: 99, value: 1 }); // 敌旗 banner190→item 3394
item({ key: 'vi_3395_banner_b191', name: '', maxStack: 99, value: 1 }); // 敌旗 banner191→item 3395
item({ key: 'vi_3396_banner_b192', name: '', maxStack: 99, value: 1 }); // 敌旗 banner192→item 3396
item({ key: 'vi_3397_banner_b193', name: '', maxStack: 99, value: 1 }); // 敌旗 banner193→item 3397
item({ key: 'vi_3398_banner_b194', name: '', maxStack: 99, value: 1 }); // 敌旗 banner194→item 3398
item({ key: 'vi_3399_banner_b195', name: '', maxStack: 99, value: 1 }); // 敌旗 banner195→item 3399
item({ key: 'vi_3400_banner_b196', name: '', maxStack: 99, value: 1 }); // 敌旗 banner196→item 3400
item({ key: 'vi_3401_banner_b197', name: '', maxStack: 99, value: 1 }); // 敌旗 banner197→item 3401
item({ key: 'vi_3402_banner_b198', name: '', maxStack: 99, value: 1 }); // 敌旗 banner198→item 3402
item({ key: 'vi_3403_banner_b199', name: '', maxStack: 99, value: 1 }); // 敌旗 banner199→item 3403
item({ key: 'vi_3404_banner_b200', name: '', maxStack: 99, value: 1 }); // 敌旗 banner200→item 3404
item({ key: 'vi_3405_banner_b201', name: '', maxStack: 99, value: 1 }); // 敌旗 banner201→item 3405
item({ key: 'vi_3406_banner_b202', name: '', maxStack: 99, value: 1 }); // 敌旗 banner202→item 3406
item({ key: 'vi_3407_banner_b203', name: '', maxStack: 99, value: 1 }); // 敌旗 banner203→item 3407
item({ key: 'vi_3408_banner_b204', name: '', maxStack: 99, value: 1 }); // 敌旗 banner204→item 3408
item({ key: 'vi_3409_banner_b205', name: '', maxStack: 99, value: 1 }); // 敌旗 banner205→item 3409
item({ key: 'vi_3410_banner_b206', name: '', maxStack: 99, value: 1 }); // 敌旗 banner206→item 3410
item({ key: 'vi_3411_banner_b207', name: '', maxStack: 99, value: 1 }); // 敌旗 banner207→item 3411
item({ key: 'vi_3412_banner_b208', name: '', maxStack: 99, value: 1 }); // 敌旗 banner208→item 3412
item({ key: 'vi_3413_banner_b209', name: '', maxStack: 99, value: 1 }); // 敌旗 banner209→item 3413
item({ key: 'vi_3414_banner_b210', name: '', maxStack: 99, value: 1 }); // 敌旗 banner210→item 3414
item({ key: 'vi_3415_banner_b211', name: '', maxStack: 99, value: 1 }); // 敌旗 banner211→item 3415
item({ key: 'vi_3416_banner_b212', name: '', maxStack: 99, value: 1 }); // 敌旗 banner212→item 3416
item({ key: 'vi_3417_banner_b213', name: '', maxStack: 99, value: 1 }); // 敌旗 banner213→item 3417
item({ key: 'vi_3418_banner_b214', name: '', maxStack: 99, value: 1 }); // 敌旗 banner214→item 3418
item({ key: 'vi_3419_banner_b215', name: '', maxStack: 99, value: 1 }); // 敌旗 banner215→item 3419
item({ key: 'vi_3420_banner_b216', name: '', maxStack: 99, value: 1 }); // 敌旗 banner216→item 3420
item({ key: 'vi_3421_banner_b217', name: '', maxStack: 99, value: 1 }); // 敌旗 banner217→item 3421
item({ key: 'vi_3422_banner_b218', name: '', maxStack: 99, value: 1 }); // 敌旗 banner218→item 3422
item({ key: 'vi_3423_banner_b219', name: '', maxStack: 99, value: 1 }); // 敌旗 banner219→item 3423
item({ key: 'vi_3424_banner_b220', name: '', maxStack: 99, value: 1 }); // 敌旗 banner220→item 3424
item({ key: 'vi_3425_banner_b221', name: '', maxStack: 99, value: 1 }); // 敌旗 banner221→item 3425
item({ key: 'vi_3426_banner_b222', name: '', maxStack: 99, value: 1 }); // 敌旗 banner222→item 3426
item({ key: 'vi_3427_banner_b223', name: '', maxStack: 99, value: 1 }); // 敌旗 banner223→item 3427
item({ key: 'vi_3428_banner_b224', name: '', maxStack: 99, value: 1 }); // 敌旗 banner224→item 3428
item({ key: 'vi_3429_banner_b225', name: '', maxStack: 99, value: 1 }); // 敌旗 banner225→item 3429
item({ key: 'vi_3430_banner_b226', name: '', maxStack: 99, value: 1 }); // 敌旗 banner226→item 3430
item({ key: 'vi_3431_banner_b227', name: '', maxStack: 99, value: 1 }); // 敌旗 banner227→item 3431
item({ key: 'vi_3432_banner_b228', name: '', maxStack: 99, value: 1 }); // 敌旗 banner228→item 3432
item({ key: 'vi_3433_banner_b229', name: '', maxStack: 99, value: 1 }); // 敌旗 banner229→item 3433
item({ key: 'vi_3434_banner_b230', name: '', maxStack: 99, value: 1 }); // 敌旗 banner230→item 3434
item({ key: 'vi_3435_banner_b231', name: '', maxStack: 99, value: 1 }); // 敌旗 banner231→item 3435
item({ key: 'vi_3436_banner_b232', name: '', maxStack: 99, value: 1 }); // 敌旗 banner232→item 3436
item({ key: 'vi_3437_banner_b233', name: '', maxStack: 99, value: 1 }); // 敌旗 banner233→item 3437
item({ key: 'vi_3438_banner_b234', name: '', maxStack: 99, value: 1 }); // 敌旗 banner234→item 3438
item({ key: 'vi_3439_banner_b235', name: '', maxStack: 99, value: 1 }); // 敌旗 banner235→item 3439
item({ key: 'vi_3440_banner_b236', name: '', maxStack: 99, value: 1 }); // 敌旗 banner236→item 3440
item({ key: 'vi_3441_banner_b237', name: '', maxStack: 99, value: 1 }); // 敌旗 banner237→item 3441
item({ key: 'vi_3442_banner_b238', name: '', maxStack: 99, value: 1 }); // 敌旗 banner238→item 3442
item({ key: 'vi_3443_banner_b239', name: '', maxStack: 99, value: 1 }); // 敌旗 banner239→item 3443
item({ key: 'vi_3444_banner_b240', name: '', maxStack: 99, value: 1 }); // 敌旗 banner240→item 3444
item({ key: 'vi_3445_banner_b241', name: '', maxStack: 99, value: 1 }); // 敌旗 banner241→item 3445
item({ key: 'vi_3446_banner_b242', name: '', maxStack: 99, value: 1 }); // 敌旗 banner242→item 3446
item({ key: 'vi_3447_banner_b243', name: '', maxStack: 99, value: 1 }); // 敌旗 banner243→item 3447
item({ key: 'vi_3448_banner_b244', name: '', maxStack: 99, value: 1 }); // 敌旗 banner244→item 3448
item({ key: 'vi_3449_banner_b245', name: '', maxStack: 99, value: 1 }); // 敌旗 banner245→item 3449
item({ key: 'vi_3450_banner_b246', name: '', maxStack: 99, value: 1 }); // 敌旗 banner246→item 3450
item({ key: 'vi_3451_banner_b247', name: '', maxStack: 99, value: 1 }); // 敌旗 banner247→item 3451
item({ key: 'vi_3452_banner_b248', name: '', maxStack: 99, value: 1 }); // 敌旗 banner248→item 3452
item({ key: 'vi_3593_banner_b249', name: '', maxStack: 99, value: 1 }); // 敌旗 banner249→item 3593
item({ key: 'vi_3594_banner_b250', name: '', maxStack: 99, value: 1 }); // 敌旗 banner250→item 3594
item({ key: 'vi_3780_banner_b251', name: '', maxStack: 99, value: 1 }); // 敌旗 banner251→item 3780
item({ key: 'vi_3789_banner_b252', name: '', maxStack: 99, value: 1 }); // 敌旗 banner252→item 3789
item({ key: 'vi_3790_banner_b253', name: '', maxStack: 99, value: 1 }); // 敌旗 banner253→item 3790
item({ key: 'vi_3791_banner_b254', name: '', maxStack: 99, value: 1 }); // 敌旗 banner254→item 3791
item({ key: 'vi_3792_banner_b255', name: '', maxStack: 99, value: 1 }); // 敌旗 banner255→item 3792
item({ key: 'vi_3793_banner_b256', name: '', maxStack: 99, value: 1 }); // 敌旗 banner256→item 3793
item({ key: 'vi_3837_banner_b257', name: '', maxStack: 99, value: 1 }); // 敌旗 banner257→item 3837
item({ key: 'vi_3838_banner_b258', name: '', maxStack: 99, value: 1 }); // 敌旗 banner258→item 3838
item({ key: 'vi_3839_banner_b259', name: '', maxStack: 99, value: 1 }); // 敌旗 banner259→item 3839
item({ key: 'vi_3840_banner_b260', name: '', maxStack: 99, value: 1 }); // 敌旗 banner260→item 3840
item({ key: 'vi_3841_banner_b261', name: '', maxStack: 99, value: 1 }); // 敌旗 banner261→item 3841
item({ key: 'vi_3842_banner_b262', name: '', maxStack: 99, value: 1 }); // 敌旗 banner262→item 3842
item({ key: 'vi_3843_banner_b263', name: '', maxStack: 99, value: 1 }); // 敌旗 banner263→item 3843
item({ key: 'vi_3844_banner_b264', name: '', maxStack: 99, value: 1 }); // 敌旗 banner264→item 3844
item({ key: 'vi_3845_banner_b265', name: '', maxStack: 99, value: 1 }); // 敌旗 banner265→item 3845
item({ key: 'vi_3846_banner_b266', name: '', maxStack: 99, value: 1 }); // 敌旗 banner266→item 3846
item({ key: 'vi_4541_banner_b267', name: '', maxStack: 99, value: 1 }); // 敌旗 banner267→item 4541
item({ key: 'vi_4542_banner_b268', name: '', maxStack: 99, value: 1 }); // 敌旗 banner268→item 4542
item({ key: 'vi_4543_banner_b269', name: '', maxStack: 99, value: 1 }); // 敌旗 banner269→item 4543
item({ key: 'vi_4544_banner_b270', name: '', maxStack: 99, value: 1 }); // 敌旗 banner270→item 4544
item({ key: 'vi_4545_banner_b271', name: '', maxStack: 99, value: 1 }); // 敌旗 banner271→item 4545
item({ key: 'vi_4546_banner_b272', name: '', maxStack: 99, value: 1 }); // 敌旗 banner272→item 4546
item({ key: 'vi_4602_banner_b273', name: '', maxStack: 99, value: 1 }); // 敌旗 banner273→item 4602
item({ key: 'vi_4687_banner_b274', name: '', maxStack: 99, value: 1 }); // 敌旗 banner274→item 4687
item({ key: 'vi_4688_banner_b275', name: '', maxStack: 99, value: 1 }); // 敌旗 banner275→item 4688
item({ key: 'vi_4965_banner_b276', name: '', maxStack: 99, value: 1 }); // 敌旗 banner276→item 4965
item({ key: 'vi_4966_banner_b277', name: '', maxStack: 99, value: 1 }); // 敌旗 banner277→item 4966
item({ key: 'vi_4967_banner_b278', name: '', maxStack: 99, value: 1 }); // 敌旗 banner278→item 4967
item({ key: 'vi_4968_banner_b279', name: '', maxStack: 99, value: 1 }); // 敌旗 banner279→item 4968
item({ key: 'vi_4969_banner_b280', name: '', maxStack: 99, value: 1 }); // 敌旗 banner280→item 4969
item({ key: 'vi_4970_banner_b281', name: '', maxStack: 99, value: 1 }); // 敌旗 banner281→item 4970
item({ key: 'vi_4971_banner_b282', name: '', maxStack: 99, value: 1 }); // 敌旗 banner282→item 4971
item({ key: 'vi_4972_banner_b283', name: '', maxStack: 99, value: 1 }); // 敌旗 banner283→item 4972
item({ key: 'vi_4973_banner_b284', name: '', maxStack: 99, value: 1 }); // 敌旗 banner284→item 4973
item({ key: 'vi_4974_banner_b285', name: '', maxStack: 99, value: 1 }); // 敌旗 banner285→item 4974
item({ key: 'vi_4975_banner_b286', name: '', maxStack: 99, value: 1 }); // 敌旗 banner286→item 4975
item({ key: 'vi_4976_banner_b287', name: '', maxStack: 99, value: 1 }); // 敌旗 banner287→item 4976
item({ key: 'vi_4977_banner_b288', name: '', maxStack: 99, value: 1 }); // 敌旗 banner288→item 4977
item({ key: 'vi_5352_banner_b289', name: '', maxStack: 99, value: 1 }); // 敌旗 banner289→item 5352
item({ key: 'vi_5651_banner_b290', name: '', maxStack: 99, value: 1 }); // 敌旗 banner290→item 5651
// ---- 放置语义全量回填(vanilla-itemfunc.json Item.cs createTile/placeStyle 提取)：
// tryPlace(Game)要求 def.tile,vi_ 骨架此前只有手写特例能放置。此处注册期把
// itemfunc.createTile(=原版 TileID)经 sheet 反查落到 v_ tile key——蛇形/驼峰
// 双注册都刷,仅填 undefined(手写字段优先)。1040 条 createTile 全部可解析(753 sheet)。
import { itemFuncOfVid } from './vanillaItemFunc';
import { TILE_KEY_BY_SHEET } from './tiles';
{
  let filled = 0;
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const m = /^vi_(\d+)_/.exec(ITEM_DEFS[i].key);
    if (!m) continue;
    const vid = Number(m[1]);
    const f = itemFuncOfVid(vid);
    const d = ITEM_DEFS[i];
    // createTile 双源：itemfunc 提取优先；缺时回退 vanilla.json .items.createTile
    // （游戏数据导出的【最终态】——共享算式段提取器解不开的 2189 件由此覆盖；
    // 双源交集 1042 件中 1039 一致，3 件分歧均为源码二次赋值、vanilla.json 是
    // 终态更准（498=470 见 :853 注），此处不覆写已提取值、仅补缺）
    let ct = f?.createTile;
    if (ct === undefined || ct === -1) {
      const vm = _vim[String(vid)] as { createTile?: number } | undefined;
      if (vm && vm.createTile !== undefined && vm.createTile !== -1) ct = vm.createTile;
    }
    if (d.tile === undefined && ct !== undefined && ct !== -1) {
      const tk = TILE_KEY_BY_SHEET.get(ct);
      if (tk !== undefined) { d.tile = tk; filled++; }
    }
    if (f?.placeStyle !== undefined && f.placeStyle !== 0 && d.placeStyle === undefined) {
      d.placeStyle = f.placeStyle;
    }
  }
  // 钱币 71-73 maxStack=100 已由 item() 的 VANILLA_MAX_STACK 表覆盖;
  // 铂 74 无覆盖 = 9999（DoCoins :38570 只对 71-73 在恰 100 进位,铂币可堆至 9999）
  void filled;
}

// ---- 小动物笼/缸族放置链（createTile 全量 92 条，1:1 Item.cs）：
//  数据反查 = TEdit items.json createTile 列（92/92 吻合），源码侧交叉校验了
//  extract-itemfunc.mjs 解不开的三种写法——共享 case 段算式
//  （:22078-22093 `createTile = 275 + type - 2162` 兔笼族、:39692-39706
//  `DefaultToPlaceableTile(599 + (type - 4882))` 宝石笼、:37046-37052
//  `(ushort)(type - 4327 + 521)` 蜻蜓罐）、if 区间段（:24098-24108 水母罐
//  2439-2441 → 316+type-2439）、单参 DefaultToPlaceableTile 重载（placeStyle=0）。
//  故此族 92 条只有 5 条落进 itemfunc（直赋 createTile 的 250/2741/3565/3566/4275），
//  其余 87 条以本表为权威。每物种独立 tile id、placeStyle 恒 0（DefaultToPlaceableTile
//  双参重载缺省），放置链 = 普通家具（GAP ① 见 render/CritterCage.ts）
export const CAGE_ITEM_SHEET: ReadonlyArray<readonly [number, number]> = [
  [250, 282],                        // Fish Bowl（鱼缸，:4378 直赋）
  [2162, 275], [2163, 276], [2164, 277], [2165, 278], [2166, 279], [2167, 280], [2168, 281],
  [2174, 285], [2175, 286],
  [2178, 288], [2179, 289], [2180, 290], [2181, 291], [2182, 292], [2183, 293], [2184, 294], [2185, 295],
  [2186, 296], [2187, 297], [2190, 298], [2191, 299], [2206, 309], [2207, 310],
  [2439, 316], [2440, 317], [2441, 318],
  [2741, 339],
  [3070, 358], [3071, 359], [3072, 360], [3073, 361], [3074, 362], [3075, 363], [3076, 364],
  [3254, 391], [3255, 392], [3256, 393], [3257, 394],
  [3565, 413], [3566, 414],
  [4275, 505],
  [4327, 521], [4328, 522], [4329, 523], [4330, 524], [4331, 525], [4332, 526], [4333, 527],
  [4364, 532], [4376, 533], [4380, 538], [4396, 542], [4398, 543], [4399, 544],
  [4461, 550], [4462, 551], [4473, 553], [4474, 554], [4475, 555], [4476, 556],
  [4481, 558], [4483, 559],
  [4655, 568], [4656, 569], [4657, 570],
  [4846, 580], [4850, 582], [4880, 598],
  [4882, 599], [4883, 600], [4884, 601], [4885, 602], [4886, 603], [4887, 604], [4888, 605],
  [4889, 606], [4890, 607], [4891, 608], [4892, 609], [4893, 610], [4894, 611], [4895, 612],
  [4963, 619], [4964, 620],
  [5133, 629], [5213, 632], [5301, 640], [5314, 643], [5315, 644], [5316, 645],
  [5512, 710],
];
for (const [vid, sheet] of CAGE_ITEM_SHEET) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (!d || d.tile !== undefined) continue;   // 手写链接优先（vi_4376_rat_cage 样板等）
  const tk = TILE_KEY_BY_SHEET.get(sheet);
  if (tk !== undefined) d.tile = tk;
}

// ---- 有真实原版放置物品的 tile key 集（createTile 三源并集 → sheet 反查,惰性建表）----
//  多格破坏返还判据（Game.breakTile object 分支）：原版 Check* 帧检只对【有放置物品】
//  的 tile 返还物件（TileObjectData 族——雕像 105/画 240-247/旗帜 91/地狱熔炉 77/
//  提取器 219/水晶球 125/日晷 356/训练假人 378…）；纯世界生成装饰无物品可还
//  （165 冰凌/233 丛林大植物/529 海燕麦/647-652 瓦砾/751·752 蜥蛋等 27 族——
//  itemfunc 与 vanilla.json items.createTile 均无该 tile）。
//  ★取原始数据并集而非 ITEM_DEFS.tile 反查：与注册顺序/手写链接解耦。双源分歧 3 件
//  （498/1989/3977 源码二次赋值,见上方回填注）恰是 legacy 模特族——并集语义下
//  128/269 仍判「有物返还」，与原版 CheckMan :46589 掉 498 / CheckWoman 掉 1989 一致
//  （返还判据按 tile 族,不按终态由哪件物品放置）。惰性 = 首次调用才建表
import itemFuncRaw from './vanilla-itemfunc.json';
let _vanillaPlaceableTiles: ReadonlySet<string> | null = null;
export function vanillaPlaceableTileKeys(): ReadonlySet<string> {
  if (_vanillaPlaceableTiles === null) {
    const s = new Set<string>();
    const add = (sheet: number) => {
      const tk = TILE_KEY_BY_SHEET.get(sheet);
      if (tk !== undefined) s.add(tk);
    };
    for (const f of Object.values(itemFuncRaw) as Array<{ createTile?: number }>) {
      if (f.createTile != null && f.createTile !== -1) add(f.createTile);
    }
    for (const it of Object.values(vanillaItemMeta.items) as Array<{ createTile?: number }>) {
      if (it.createTile != null) add(it.createTile);
    }
    for (const [, sheet] of CAGE_ITEM_SHEET) add(sheet);
    _vanillaPlaceableTiles = s;
  }
  return _vanillaPlaceableTiles;
}

// ---- 捕获小动物 → 通用锚桩 tile 724（Item.DefaultToCapturedCritter :47613-47626：
//  createTile=724 + makeNPC=npcId + consumable，全 93 件；TEdit createTile=724
//  93/93 吻合）。原版 TECritterAnchor（TileEntity）存物品 id，由 LeashedEntity
//  系统在锚桩周遭生成拴绳小动物；本仓以挂物记录 FurnitureItems 'critter_anchor'
//  槽 0 近似 TE 存储（GAP ③ 见 render/CritterCage.ts）。放置触发 = 右键
//  （PLACE_TILE_ON_ALT_USE），左键保留放生（ItemCheck_ReleaseCritter :43377）
const CRITTER_ANCHOR_TILE = 'v_724_critter_anchor';
/** placeStyle = 物品自身 placeStyle（放置帧档的**缺省**来源；蝴蝶族 1994-2001 =
 *  物种变体 1-8，Item.cs:21303 `placeStyle = 1 + type - 1994`）。锚桩放置帧档在
 *  原版由 Player.cs:42771-42773 **覆写**为 prototype.anchorStyle（与物品自身
 *  placeStyle 解耦）——本仓由 Game.tryPlace 的 724 分支按
 *  entities/LeashedCritter.ts anchorStyleOfItem 覆写 frameX，此处仅承载物品自身值。
 *  非 Butterfly 族物品的 Item.placeStyle 原版恒 0，但为让通用 framedCellFrame
 *  路径也落对帧，此处按 prototype 继承链全量写 anchorStyle（等价值）：
 *   1 = Crawler + Runner + Snail（Crawler 子类，SnailLeashedCritter.cs:9）
 *   2 = Bird **及 Waterfowl 子类**（BirdLeashedCritter 派生——anchorStyle 继承 2）
 *   3 = Fish
 *   4 = Flyer 及其全部派生（Fly 蝶/萤/地狱蝶/帝皇蝶/微光蝇 + Dragonfly +
 *       CrawlingFly + Fairy——FlyerLeashedCritter.cs:25 anchorStyle=4 为全族基值）
 *  其余原型（Walker/Jumper/WaterStrider）未覆写 = 0。
 *  ★本表曾只列 19 件（Flyer 档漏 25 件、Waterfowl 档漏 4 件、Snail 档漏 3 件）——
 *  由 tests/leashed-critters.test.ts 的 anchorStyle 交叉对账抓回（2026-08-13） */
const CRITTER_ANCHOR_STYLE: Readonly<Record<number, number>> = {
  // 1 = Crawler（2002/2895/3191-3194/4363/4464/4465）+ Runner（2003/2894/4375）
  //     + Snail（2006/2007/4849）
  2002: 1, 2003: 1, 2894: 1, 2895: 1, 3191: 1, 3192: 1, 3193: 1, 3194: 1,
  4363: 1, 4375: 1, 4464: 1, 4465: 1, 2006: 1, 2007: 1, 4849: 1,
  // 2 = Bird（2015-2017/2889/4395/5212/5300/5311-5313）+ Waterfowl（2122/2123/4359/4374）
  2015: 2, 2016: 2, 2017: 2, 2889: 2, 4395: 2, 5212: 2, 5300: 2, 5311: 2, 5312: 2, 5313: 2,
  2122: 2, 2123: 2, 4359: 2, 4374: 2,
  // 3 = Fish
  261: 3, 4274: 3, 4373: 3, 4480: 3, 4482: 3, 5511: 3,
  // 4 = Flyer 全族：萤 1992+2004+4847 / 金蝶 2891 / 地狱蝶 4845 / 帝皇蝶 4961 /
  //     微光蝇 5350 / 蜻蜓 4334-4340 / 爬蝇+椿象 4361+4362+5132 / 妖精 4068-4070
  1992: 4, 2004: 4, 2891: 4, 4845: 4, 4847: 4, 4961: 4, 5350: 4,
  4334: 4, 4335: 4, 4336: 4, 4337: 4, 4338: 4, 4339: 4, 4340: 4,
  4361: 4, 4362: 4, 5132: 4,
  4068: 4, 4069: 4, 4070: 4,
};
/** 蝶族八色物品（1994-2001）：Item.placeStyle = 物种变体 1-8（Item.cs:21303），
 *  NormalButterflyLeashedCritter.SetDefaults 取作绘制物种窗（ai[2]，NPC.cs:73454）。
 *  放置帧档走 anchorStyle 覆写（见上注），此处不可写 4 */
const BUTTERFLY_VARIANT_ITEMS: ReadonlyArray<number> = [1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001];
/** createTile=724 全量 93 件（DefaultToCapturedCritter 全调用点 + 区间展开） */
const CRITTER_ANCHOR_ITEMS: ReadonlyArray<number> = [
  261, 1338,
  1992, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2006, 2007,
  2015, 2016, 2017, 2018, 2019,
  2121, 2122, 2123, 2156, 2157, 2205, 2673, 2740,
  2889, 2890, 2891, 2892, 2893, 2894, 2895,
  3191, 3192, 3193, 3194, 3563, 3564,
  4068, 4069, 4070, 4274,
  4334, 4335, 4336, 4337, 4338, 4339, 4340,
  4359, 4361, 4362, 4363, 4373, 4374, 4375, 4395,
  4418, 4419, 4464, 4465, 4480, 4482,
  4831, 4832, 4833, 4834, 4835, 4836, 4837, 4838, 4839, 4840, 4841, 4842, 4843, 4844,
  4845, 4847, 4849, 4961, 5132, 5212,
  5300, 5311, 5312, 5313, 5350, 5511,
];
for (const vid of CRITTER_ANCHOR_ITEMS) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  // tile 双源回填（vanilla.json createTile=724）已先置同名 tile——只在指向
  // 【别的】tile 时跳过；placeStyle（锚桩帧档）必须照写（2026-08-18 双源
  // 回填落地后此门曾把 261 等锚桩物品的 placeStyle 吞掉）
  if (!d || (d.tile !== undefined && d.tile !== CRITTER_ANCHOR_TILE)) continue;
  d.tile = CRITTER_ANCHOR_TILE;
  // 蝶族：placeStyle = 物种变体（绘制窗），锚桩帧档由放置钩按 anchorStyle 覆写
  if (BUTTERFLY_VARIANT_ITEMS.includes(vid)) {
    if (d.placeStyle === undefined) d.placeStyle = 1 + vid - 1994;
    continue;
  }
  const st = CRITTER_ANCHOR_STYLE[vid];
  if (st !== undefined && st !== 0 && d.placeStyle === undefined) d.placeStyle = st;
}

// ---- 风筝族 → 通用风筝锚桩 tile 723（Item.DefaultToKite :47457-47468：
//  DefaultToThrownWeapon(projId) + createTile=723 + consumable=false，24 件；
//  ItemID.Sets.IsAKite = 同 24 id）。projType（= item.shoot）全表在
//  entities/LeashedCritter.ts KITE_ITEM_PROJ（放置 → TEKiteAnchor 存物品 id →
//  LeashedKite 拴绳风筝）。placeStyle 恒 0（DefaultToKite 不赋值 → style 0
//  下锚档；TileObjectData.cs:4508 前段 StyleHorizontal×5 的 1-4 档为上下/侧墙锚）
const KITE_ANCHOR_TILE = 'v_723_kite_anchor';
const KITE_ANCHOR_ITEMS: ReadonlyArray<number> = [
  4367, 4368, 4369, 4370, 4371, 4379,
  4610, 4611, 4612, 4613,
  4648, 4649, 4650, 4651,
  4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684,
];
for (const vid of KITE_ANCHOR_ITEMS) {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const d = k !== undefined ? ITEM_DEFS[byKey[k]] : undefined;
  if (!d || d.tile !== undefined) continue;   // 手写链接优先
  d.tile = KITE_ANCHOR_TILE;
}

/** ItemID.Sets.PlaceTileOnAltUse（ItemID.cs:155 原文 117 id）：右键放置、左键走
 *  使用语义（Player.cs:42842-42847 altFunctionUse==2 → doPlacementAction）。
 *  成员 = 捕获小动物 93 件（tile 724，左键=放生）+ 风筝 24 件（tile 723，左键=放飞），
 *  两族 createTile 物品链均已接（上文 CRITTER_ANCHOR_ITEMS / KITE_ANCHOR_ITEMS） */
export const PLACE_TILE_ON_ALT_USE: ReadonlySet<number> = new Set<number>([
  4367, 4368, 4369, 4370, 4371, 4379, 4610, 4611, 4612, 4613, 4648, 4649, 4650, 4651,
  4669, 4670, 4671, 4674, 4675, 4676, 4677, 4681, 4683, 4684,
  261, 1338,
  1992, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2006, 2007,
  2015, 2016, 2017, 2018, 2019,
  2121, 2122, 2123, 2156, 2157, 2205, 2673, 2740,
  2889, 2890, 2891, 2892, 2893, 2894, 2895,
  3191, 3192, 3193, 3194, 3563, 3564,
  4068, 4069, 4070, 4274,
  4334, 4335, 4336, 4337, 4338, 4339, 4340,
  4359, 4361, 4362, 4363, 4373, 4374, 4375, 4395,
  4418, 4419, 4464, 4465, 4480, 4482,
  4831, 4832, 4833, 4834, 4835, 4836, 4837, 4838, 4839, 4840, 4841, 4842, 4843, 4844,
  4845, 4847, 4849, 4961, 5132, 5212,
  5300, 5311, 5312, 5313, 5350, 5511,
]);

item({ key: 'vi_5573_torch_gods_potion', name: '', maxStack: 30, value: 1 }); // 火把神药水(Torch God's Potion——:10594-10596 授 TorchGodsFavor)
// 格挡盾族（Player.cs:31254-31280 shield 旗标 + :30979 CanParryAgainst——2026-08-13）
item({ key: 'vi_3823_brand_of_the_inferno', name: '', maxStack: 1, value: 1 });
item({ key: 'vi_4760_sergeants_united_shield', name: '', maxStack: 1, value: 1 });
// ---- 钓鱼链物品补齐
item({ key: 'vi_4608_chum_bucket', name: '', maxStack: 99, value: 1 }); // 鱼饵桶(Chum Bucket——抛入水增渔力 +11/+6/+3,:19231-19242)(2026-08-13:饵/竿/药水/渔获——此前正常玩法无法抛竿,B26 断链) ----
item({ key: 'vi_2422_hotline_fishing_hook', name: '', maxStack: 1, value: 1 }); // 熔线钓钩(Hotline Fishing Hook——岩浆钓三源之一,:19230/:19375-19378)
item({ key: 'vi_1992_f1992', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 4 }); // 饵(黑蜻蜓)——数值/名走 itemfunc+l10n 链 // ←vi_1992_Firefly 独有字段搬移(批次A)
item({ key: 'vi_2001_f2001', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 8 }); // 饵(紫蜻蜓)——数值/名走 itemfunc+l10n 链 // ←vi_2001_JuliaButterfly 独有字段搬移(批次A)
item({ key: 'vi_2002_f2002', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 饵(红蜻蜓?)——数值/名走 itemfunc+l10n 链 // ←vi_2002_Worm 独有字段搬移(批次A)
item({ key: 'vi_2004_f2004', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 4 }); // 饵(蜻蜓)——数值/名走 itemfunc+l10n 链 // ←vi_2004_LightningBug 独有字段搬移(批次A)
item({ key: 'vi_2006_f2006', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 饵(蜻蜓)——数值/名走 itemfunc+l10n 链 // ←vi_2006_Snail 独有字段搬移(批次A)
item({ key: 'vi_2007_f2007', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 饵(瓢虫?)——数值/名走 itemfunc+l10n 链 // ←vi_2007_GlowingSnail 独有字段搬移(批次A)
item({ key: 'vi_2156_f2156', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor' }); // 饵(萤火虫)——数值/名走 itemfunc+l10n 链 // ←vi_2156_BlackScorpion 独有字段搬移(批次A)
item({ key: 'vi_2157_f2157', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor' }); // 饵(萤火虫)——数值/名走 itemfunc+l10n 链 // ←vi_2157_Scorpion 独有字段搬移(批次A)
item({ key: 'vi_2289_f2289', name: '', maxStack: 999, value: 1 }); // 竿(木质钓竿)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2291_f2291', name: '', maxStack: 999, value: 1 }); // 竿(强化钓竿?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2293_f2293', name: '', maxStack: 999, value: 1 }); // 竿(渔夫钓竿?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2294_f2294', name: '', maxStack: 999, value: 1 }); // 竿(灵魂钓手?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2295_f2295', name: '', maxStack: 999, value: 1 }); // 竿(玻璃钢钓竿?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2296_f2296', name: '', maxStack: 999, value: 1 }); // 竿(机械师钓竿?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2354_f2354', name: '', maxStack: 999, value: 1 }); // 药水(钓鱼药水)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2355_f2355', name: '', maxStack: 999, value: 1 }); // 药水(声呐药水)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2356_f2356', name: '', maxStack: 999, value: 1 }); // 药水(宝匣药水)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2438_f2438', name: '', maxStack: 999, value: 1 }); // 饵(蜗牛?)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2613_f2613', name: '', maxStack: 999, value: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2673_f2673', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor' }); // 饵(松露虫)——数值/名走 itemfunc+l10n 链 // ←vi_2673_TruffleWorm 独有字段搬移(批次A)
item({ key: 'vi_2674_f2674', name: '', maxStack: 999, value: 1 }); // 饵(学徒饵)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2675_f2675', name: '', maxStack: 999, value: 1 }); // 饵(行家饵)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2676_f2676', name: '', maxStack: 999, value: 1 }); // 饵(大师饵)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_2740_f2740', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor' }); // 饵(幼虫?)——数值/名走 itemfunc+l10n 链 // ←vi_2740_Grasshopper 独有字段搬移(批次A)
item({ key: 'vi_2895_f2895', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 饵(蠕虫?)——数值/名走 itemfunc+l10n 链 // ←vi_2895_GoldWorm 独有字段搬移(批次A)
item({ key: 'vi_3191_f3191', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链 // ←vi_3191_EnchantedNightcrawler 独有字段搬移(批次A)
item({ key: 'vi_3192_f3192', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链 // ←vi_3192_Grubby 独有字段搬移(批次A)
item({ key: 'vi_3193_f3193', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链 // ←vi_3193_Sluggy 独有字段搬移(批次A)
item({ key: 'vi_3194_f3194', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链 // ←vi_3194_Buggy 独有字段搬移(批次A)
item({ key: 'vi_3392_f3392', name: '', maxStack: 999, value: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_3393_f3393', name: '', maxStack: 999, value: 1 }); // 渔获/杂(??)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_4325_f4325', name: '', maxStack: 999, value: 1 }); // 竿(血肉捕手)——数值/名走 itemfunc+l10n 链
item({ key: 'vi_4339_f4339', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 4 }); // 饵(熔岩萤火虫?)——数值/名走 itemfunc+l10n 链 // ←vi_4339_YellowDragonfly 独有字段搬移(批次A)
item({ key: 'vi_4340_f4340', name: '', maxStack: 999, value: 1, tile: 'v_724_critter_anchor', placeStyle: 4 }); // 饵(地狱蝴蝶?)——数值/名走 itemfunc+l10n 链 // ←vi_4340_GoldDragonfly 独有字段搬移(批次A)
item({ key: 'vi_4442_f4442', name: '', maxStack: 999, value: 1 }); // 竿(深渊钓竿?)——数值/名走 itemfunc+l10n 链

// ---- 1457 批 B 素材到位后的注册收口（2026-08-21）----
// 6147-6195 已随 TEdit items.json(+49) 进 vanilla.json → 由上方自动注册循环注册
// （vi_6153_GlacierFang / vi_6156_SilverBracer / vi_6158_MobiusStrip /
//   vi_6165_PoisonBarb 等,键与原手写完全一致）。原 ITEMS_1457_NO_SPRITE 手写
// def 注册删除——它在自动注册循环之后、无 vid 去重,素材收编后会同 vid 双注册
// （2026-08-21 盘点报告 A 组附带发现）。此处只做两件零下标平移的收尾：
// ① 卖价回填（SetShopValues(rare, sellPrice/buyPrice(...)) 的 value,自动 def 缺省 value=1；
//   rare 已由 vanilla-itemrare.json 全 49 条覆盖,配饰槽位在 vanillaItemStats
//   ACC_STATS_1457,武器战斗数值在 vanillaItemCombat json+EXTRACT_PATCH——此处只补 value）。
//   ★sellPrice(plat,gold,silver,copper) = (c+100s+1e4g+1e6p)×5、buyPrice 同式不 ×5
//   （1457 Item.cs:49421-49429）——旧表 4 条曾把第 3 参当铜币算（6153=200 等,
//   全族系统性 ÷100,2026-08-23 全量重提取时修正）。饰品效果位（SilverBracer 召唤
//   标记/PoisonBarb accPoisonBarb 等）在 1457 ApplyEquipFunctional 6147-6195 族,
//   本批不移植（登记）。
const ITEMS_1457_VALUE: Record<number, number> = {
  6147: 2500,   // 巨型提基 buyPrice(0,0,25)=25银（Item.cs:47342）
  6148: 50000,  // 可靠的捣蛋猫 sellPrice(0,1)=1金×5（:47355）
  6149: 50000,  // 可靠的火绒狐 sellPrice(0,1)（:47375）
  6150: 500,    // 可靠的疾旋鼬 sellPrice(0,0,1)=1银×5（:47386）
  6151: 500,    // 可靠的疾旋火鼬 sellPrice(0,0,1)（:47399）
  6152: 1,      // 太阳花法杖 buyPrice(0,0,1)=1铜（:47412）
  6153: 20000,  // 冰川之牙 sellPrice(0,0,40)=40银×5（:47424;旧 200 系参序误读）
  6154: 75000,  // 神秘绽放 sellPrice(0,1,50)=(50×100+1e4)×5（:47436）
  6155: 50000,  // 闪电之击 sellPrice(0,1)（:47450）
  6156: 87500,  // 银护腕 sellPrice(0,1,75)（:47454;旧 875 同上）
  6157: 100000, // 蛇形手环 sellPrice(0,2)（:47460）
  6158: 250000, // 莫比乌斯带 sellPrice(0,5)=5金×5（:47465;旧 2500 同上）
  6159: 100000, // 邪恶臂环 sellPrice(0,2)（:47469）
  6160: 50000,  // 锐刺 sellPrice(0,1)（:47474）
  6161: 500,    // 黏土蓓蕾法杖 sellPrice(0,0,1)（:47498）
  6162: 175000, // 衔尾蛇指环 sellPrice(0,3,50)（:47478）
  6163: 112500, // 暮光之握 sellPrice(0,2,25)（:47483）
  6164: 50000,  // 毁灭法杖 sellPrice(0,1)（:47507）
  6165: 37500,  // 淬毒刺 sellPrice(0,0,75)（:47526;旧 375 同上）
  6166: 32500,  // 鹰身女妖护符 sellPrice(0,0,65)（:47530）
  6167: 75000,  // 碎裂之石 sellPrice(0,1,50)（:47534）
  6168: 400000, // 混沌弹筒 sellPrice(0,8)（:47541,6168/6169/6193/6194 共享 case）
  6169: 400000, // 混沌弹筒（满载） 同上（:47541）
  6170: 50000,  // 附魔计时器 sellPrice(0,1)（:47545）
  6171: 50000,  // 宝石法杖 sellPrice(0,1)（:47554）
  6172: 50000,  // 重型投石索 sellPrice(0,1)（:47549）
  6173: 50000,  // 电弧涌动 sellPrice(0,1)（:47560）
  6174: 50000,  // 可靠的碎岩龟 sellPrice(0,1)（:47574）
  6175: 212500, // 斥候投石索 sellPrice(0,4,25)（:47580）
  6176: 187500, // 圣殿骑士投石索 sellPrice(0,3,75)（:47584）
  6177: 75000,  // 皇家卫队护具 sellPrice(0,1,50)（:47588）
  6178: 100000, // 火山碎屑石 sellPrice(0,2)（:47594）
  6179: 100000, // 毁灭臂环 sellPrice(0,2)（:47598）
  6180: 75000,  // 炽天使项链 sellPrice(0,1,50)（:47603）
  6181: 225000, // 凤凰箭袋 sellPrice(0,4,50)（:47608）
  6182: 75000,  // 邪恶之爪 sellPrice(0,1,50)（:47613）
  6183: 87500,  // 银盾 sellPrice(0,1,75)（:47619）
  6184: 75000,  // 甜蜜倒刺 sellPrice(0,1,50)（:47625）
  6185: 75000,  // 催化手环 sellPrice(0,1,50)（:47629）
  6186: 100000, // 德鲁伊蛇纹斗篷 sellPrice(0,2)（:47634）
  6187: 75000,  // 交错心形项链 sellPrice(0,1,50)（:47640）
  6188: 75000,  // 恢复之盾 sellPrice(0,1,50)（:47645）
  6189: 100000, // 秘术腰带 sellPrice(0,2)（:47652）
  6190: 350000, // 旧世界跑酷指南 sellPrice(0,7)（:47657）
  6191: 0,      // 小亲情桃 sellPrice()=0（:47662）
  6192: 0,      // 亲情桃 sellPrice()=0（:47667）
  6193: 400000, // 混沌弹筒（随机） sellPrice(0,8)（:47541 共享 case）
  6194: 400000, // 混沌弹筒（简易） 同上（:47541）
  6195: 350000, // 旧世界跑酷指南（未激活） sellPrice(0,7)（:47672）
};
for (const [vid, val] of Object.entries(ITEMS_1457_VALUE)) {
  const k = VANILLA_ITEM_KEY_BY_ID[Number(vid)];
  const def = k === undefined ? undefined : ITEM_DEFS[byKey[k]];
  if (def) def.value = val;
}
// ② 6153 兜底注册:仅当 atlas 链断（vanilla.json 未收编 6153,自动循环没注册）时
//    补占位 def——保证冰箱池掷中它 vid 不再 -1 静默丢弃。文件尾追加,零下标平移。
if (VANILLA_ITEM_KEY_BY_ID[6153] === undefined) {
  const ik = 'vi_6153_GlacierFang';
  VANILLA_ITEM_KEY_BY_ID[6153] = ik;
  item({ key: ik, name: '', value: ITEMS_1457_VALUE[6153] ?? 1 });
}

// ---- R29 移交注册项收尾（R30/R31 合并批,2026-08-25）：4058 骷髅弓（Skeleton Bow,
// Terraria.ID/ItemID.cs:9662；骷髅商人 10 金出售,Item.cs:35653-35657 DefaultToBow(17,11f)
// +SetWeaponValues(8,5f)——combat 数值已补 vanillaItemCombat.EXTRACT_PATCH['4058'],
// 换弹支 resolveBowProjOverride 木箭→骨箭 117 已由 R29 落地）。★vanilla.json
// （TEdit items.json 快照）无此件 → 自动注册循环没有 def = 全链死路径;此处按 6153
// 同款兜底注册（文件尾追加零下标平移;显示名走 vi_<id>_ 前缀 id-maps 解析不受
// 键名影响;图标无 atlas 条目走 drawProj 兜底色块——素材到位后可删本段交自动循环）。
// R30/R31 审计其余 ~65 件近战投掷/召唤杖经查 vanilla.json 全量自动注册已在
// （items.ts:1061-1077 循环）,掉落/配方/装备链全通,无需逐件手注。----
if (VANILLA_ITEM_KEY_BY_ID[4058] === undefined) {
  const sk = 'vi_4058_SkeletonBow';
  VANILLA_ITEM_KEY_BY_ID[4058] = sk;
  item({ key: sk, name: '', value: 100000 }); // buyPrice(0,10)=10 金=100000 铜（buyPrice 不 ×5,:49421-49429 同 6147 档式）
}

// ---- 可放置物品 → 图块/墙 sheet 解析（合成/入包预取用,2026-08-21）----
// 用户报"合成工作台后放置:音效即响、贴图过一会才显示"——放置物 tile sheet 走
// 出生点扫描预载 + 烘焙懒取（ChunkCache bakeTracker）,合成产出时该表多半未载
// （工作台 Tiles_18 不在出生画面扫描集内）→ 首放必经"fallback 烤进 chunk →
// 表晚到 500ms 去抖重烘"的白窗。合成/入包时即按 def.tile/wallId 反查 sheet
// 预取（纯函数 node 可测;消费方 Game.prefetchPlaceableSheets → atlas.preloadFiles,
// 已载早退零重复请求）——放置首烘即真图;兜底 = bakeTracker 晚到重烘链（已在,
// 只覆盖预取仍在飞行/漏网的时序）。
/** 物品 id 集 → 需预取的图块 sheet 号集 + 原版墙 id 集（非放置物品/未注册 tile 跳过） */
export function placeableSheetsForItems(itemIds: Iterable<number>): { tileSheets: Set<number>; wallIds: Set<number> } {
  const tileSheets = new Set<number>();
  const wallIds = new Set<number>();
  for (const id of itemIds) {
    const def = ITEM_DEFS[id];
    if (!def) continue;
    if (def.tile) {
      const tid = TILE_BY_KEY[def.tile];
      const vs = tid !== undefined ? TILE_DEFS[tid]?.vanilla?.sheet : undefined;
      if (vs !== undefined) tileSheets.add(vs);
    }
    if (def.wallId) wallIds.add(def.wallId);
  }
  return { tileSheets, wallIds };
}

// ---- 稳定 id 表构建【必须最后】（D1 修复,2026-08-21）----
// internal id → 稳定 id(保存方向;0=无映射,不应出现)。serialize.ts:324/:399 存盘走
// `ITEM_STABLE_OF_INTERNAL[it.id] ?? 0`、SaveFile.ts 读档走 ITEM_INTERNAL_OF_STABLE——
// 表若建在注册中途,其后追加的 def（敌旗 290/钓鱼 35/具名 5,曾含 6153/6156/6158/6165）
// 落在 Uint16Array 长度之外 → 读出 undefined → 存 0 → 读档 id 0 静默丢物。
// ★本表必须建在本文件全部 item() 注册之后；新增注册段一律写在上方、勿移到本段后。
// 零下标平移：只挪构建时机,ITEM_DEFS 数组序/内部 id 一律不变（平移事故先例,见
// :980 注）。闸门测试：tests/item-retirement.test.ts「全 def 必有稳定 id」。
/** internal id → 稳定 id(保存方向;0=无映射,不应出现) */
/** ItemID.Sets.IsAPickup（ItemID.cs:248 BoolSet）——pickup 类掉落物（心/星/币/
 *  星云 booster/4143 等）：Main.item 满槽时 NewItem 优先回收其中最老者的槽位
 *  （Item.cs:49781-49800），普通掉落从不被抢占 */
export const ITEM_IS_A_PICKUP = new Set([58, 184, 1734, 1735, 1867, 1868, 3453, 3454, 3455, 4143]);

export const ITEM_STABLE_OF_INTERNAL = new Uint16Array(ITEM_DEFS.length);
/** 稳定 id → internal id(加载方向;同 vid 重复注册时归一到首个 def——内容等价) */
export const ITEM_INTERNAL_OF_STABLE = new Map<number, number>();
for (let i = 0; i < ITEM_DEFS.length; i++) {
  const k = ITEM_DEFS[i].key;
  const vm = /^vi_(\d+)_/.exec(k);
  // place_v_N_* 未在 PRIV 表登记时按 sheet 派生 20000+N(确定性,与表内显式号不冲突:
  // 表尾已到 10500,20000+ 区段独占)——新注册 tile 的放置物不再逐个补表
  const pm = !vm ? /^place_v_(\d+)_/.exec(k) : null;
  const s = vm ? Number(vm[1]) : PRIV_ITEM_STABLE[k] ?? (pm ? 20000 + Number(pm[1]) : undefined);
  if (s === undefined) { console.error(`[stable-id] item 缺稳定 id: ${k}`); continue; }
  ITEM_STABLE_OF_INTERNAL[i] = s;
  if (!ITEM_INTERNAL_OF_STABLE.has(s)) ITEM_INTERNAL_OF_STABLE.set(s, i);
}

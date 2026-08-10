export const ITEM_DEFS = [];
const byKey = {};
export const ITEM_BY_KEY = byKey;
function item(d) {
    byKey[d.key] = ITEM_DEFS.length;
    ITEM_DEFS.push({ maxStack: 999, ...d });
}
// ---- 基础方块 ----
item({ key: 'dirt_block', name: '泥土块', tile: 'dirt' });
item({ key: 'stone_block', name: '石块', tile: 'stone' });
item({ key: 'wood', name: '木材', tile: 'wood' });
item({ key: 'sand_block', name: '沙块', tile: 'sand' });
item({ key: 'snow_block', name: '雪块', tile: 'snow' });
item({ key: 'platform', name: '木平台', tile: 'platform', maxStack: 999 });
item({ key: 'torch', name: '火把', tile: 'torch' });
item({ key: 'door', name: '木门', tile: 'door_closed', maxStack: 99 });
item({ key: 'workbench', name: '工作台', tile: 'workbench', maxStack: 99 });
item({ key: 'furnace', name: '熔炉', tile: 'furnace', maxStack: 99 });
item({ key: 'anvil', name: '铁砧', tile: 'anvil', maxStack: 99 });
item({ key: 'chest', name: '宝箱', tile: 'chest', maxStack: 99 });
// ---- 材料 ----
item({ key: 'gel', name: '凝胶', desc: '史莱姆的残留物' });
item({ key: 'acorn', name: '橡实', desc: '种在草块上会长成树', maxStack: 99, tile: 'acorn_sapling' });
item({ key: 'mushroom_item', name: '蘑菇', heal: 15, value: 1 });
item({ key: 'copper_ore', name: '铜矿', desc: '可在熔炉炼成铜锭' });
item({ key: 'iron_ore', name: '铁矿' });
item({ key: 'silver_ore', name: '银矿' });
item({ key: 'gold_ore', name: '金矿' });
item({ key: 'copper_bar', name: '铜锭' });
item({ key: 'iron_bar', name: '铁锭' });
item({ key: 'silver_bar', name: '银锭' });
item({ key: 'gold_bar', name: '金锭' });
item({ key: 'lens', name: '晶状体', desc: '恶魔眼的眼睛' });
item({ key: 'suspicious_eye', name: '可疑的眼球', desc: '夜间使用会召唤不祥之物…', maxStack: 20 });
item({ key: 'lesser_healing_potion', name: '弱效治疗药水', heal: 50, maxStack: 30 });
item({ key: 'coin_copper', name: '铜币', maxStack: 999, value: 1 });
item({ key: 'coin_silver', name: '银币', maxStack: 999, value: 100 });
item({ key: 'coin_gold', name: '金币', maxStack: 999, value: 10000 });
// ---- 药水（Buff 来源，数值移植自 Maples Potions/*.asset）----
item({ key: 'heal_potion', name: '治疗药水', maxStack: 30, heal: 100, desc: '回复 100 生命',
    potion: { buff: 'resistance', duration: 60, isHealType: true } });
item({ key: 'agility_potion', name: '敏捷药水', maxStack: 30, desc: '移速 +25%，持续 4 分钟',
    potion: { buff: 'agility', duration: 240, isHealType: false } });
item({ key: 'ironskin_potion', name: '铁皮药水', maxStack: 30, desc: '防御 +6，持续 5 分钟',
    potion: { buff: 'ironskin', duration: 300, isHealType: false } });
item({ key: 'thorns_potion', name: '荆棘药水', maxStack: 30, desc: '受击反弹 2 伤害，持续 2 分钟',
    potion: { buff: 'thorns', duration: 120, isHealType: false } });
item({ key: 'regen_potion', name: '恢复药水', maxStack: 30, desc: '每 5 秒回复 10 生命，持续 2 分钟',
    potion: { buff: 'regen', duration: 120, isHealType: true } });
// ---- 配饰（移植自 Maples Accessory）----
item({ key: 'lucky_horseshoe', name: '幸运马掌', maxStack: 1, accessory: 'lucky_horseshoe',
    desc: '免疫摔落伤害' });
item({ key: 'feral_claws', name: '猛爪手套', maxStack: 1, accessory: 'feral_claws',
    desc: '近战攻速 ×2，伤害 +5' });
// ---- 盔甲（铜/铁/银/金三件套，防御取原版）----
const armorTiers = [
    // key 前缀, 显示前缀, [头盔, 胸甲, 胫甲] 防御
    ['copper', '铜', [1, 2, 1]],
    ['iron', '铁', [2, 3, 2]],
    ['silver', '银', [3, 4, 3]],
    ['gold', '金', [4, 5, 4]],
];
const armorParts = [
    ['helmet', '头盔', 0], ['chainmail', '胸甲', 1], ['greaves', '胫甲', 2],
];
for (const [prefix, cn, defs] of armorTiers) {
    armorParts.forEach(([suffix, cnPart, slot], k) => {
        item({
            key: `${prefix}_${suffix}`, name: `${cn}${cnPart}`, maxStack: 1,
            armor: { slot, defense: defs[k] },
            desc: `防御 +${defs[k]}`,
        });
    });
}
// ---- 工具/武器（数值 = 官方原版 1.4.0.5 Item.cs SetDefaults，铜币价值）----
// 木镐/木斧为自定义低档（原版无对应）；木剑(24)=官方 7 伤、木锤(196)=官方 25 锤力
item({ key: 'wood_pickaxe', name: '木镐', maxStack: 1, value: 50,
    tool: { type: 'pick', power: 12, damage: 2, speed: 23, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'wood_axe', name: '木斧', maxStack: 1, value: 50,
    tool: { type: 'axe', power: 4, damage: 2, speed: 30, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'wood_sword', name: '木剑', maxStack: 1, value: 100,
    tool: { type: 'sword', damage: 7, speed: 25, knockback: 4, reach: 2.2 * 16 } });
item({ key: 'wood_hammer', name: '木锤', maxStack: 1, value: 50,
    tool: { type: 'hammer', power: 25, damage: 2, speed: 37, knockback: 5.5, reach: 2.4 * 16 },
    desc: '敲除背景墙' });
// 铜（3509/3506/3508/3505）
item({ key: 'copper_pickaxe', name: '铜镐', maxStack: 1, value: 500,
    tool: { type: 'pick', power: 35, damage: 4, speed: 23, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'copper_axe', name: '铜斧', maxStack: 1, value: 400,
    tool: { type: 'axe', power: 7, damage: 3, speed: 30, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'copper_sword', name: '铜剑', maxStack: 1, value: 450,
    tool: { type: 'sword', damage: 8, speed: 23, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'copper_hammer', name: '铜锤', maxStack: 1, value: 400,
    tool: { type: 'hammer', power: 35, damage: 4, speed: 33, knockback: 5.5, reach: 2.4 * 16 },
    desc: '敲除背景墙' });
// 铁（1/10/4/7）
item({ key: 'iron_pickaxe', name: '铁镐', maxStack: 1, value: 2000,
    tool: { type: 'pick', power: 40, damage: 5, speed: 20, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'iron_axe', name: '铁斧', maxStack: 1, value: 1600,
    tool: { type: 'axe', power: 9, damage: 5, speed: 27, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'iron_sword', name: '铁剑', maxStack: 1, value: 1800,
    tool: { type: 'sword', damage: 10, speed: 21, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'iron_hammer', name: '铁锤', maxStack: 1, value: 1600,
    tool: { type: 'hammer', power: 40, damage: 7, speed: 30, knockback: 5.5, reach: 2.4 * 16 },
    desc: '敲除背景墙' });
// 银（3515/3512/3514/3511）
item({ key: 'silver_pickaxe', name: '银镐', maxStack: 1, value: 5000,
    tool: { type: 'pick', power: 45, damage: 6, speed: 19, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'silver_axe', name: '银斧', maxStack: 1, value: 4000,
    tool: { type: 'axe', power: 10, damage: 6, speed: 26, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'silver_sword', name: '银剑', maxStack: 1, value: 4500,
    tool: { type: 'sword', damage: 11, speed: 21, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'silver_hammer', name: '银锤', maxStack: 1, value: 4000,
    tool: { type: 'hammer', power: 45, damage: 9, speed: 29, knockback: 5.5, reach: 2.4 * 16 },
    desc: '敲除背景墙' });
// 金（3521/3518/3520/3517）
item({ key: 'gold_pickaxe', name: '金镐', maxStack: 1, value: 10000,
    tool: { type: 'pick', power: 55, damage: 6, speed: 20, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'gold_axe', name: '金斧', maxStack: 1, value: 8000,
    tool: { type: 'axe', power: 11, damage: 7, speed: 26, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'gold_sword', name: '金剑', maxStack: 1, value: 9000,
    tool: { type: 'sword', damage: 13, speed: 20, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'gold_hammer', name: '金锤', maxStack: 1, value: 8000,
    tool: { type: 'hammer', power: 55, damage: 9, speed: 28, knockback: 5.5, reach: 2.4 * 16 },
    desc: '敲除背景墙' });
// ===================== 原版素材批次：新材料 / 方块 / 家具 =====================
// ---- 替代矿与困难模式矿（先做美术/掉落） ----
item({ key: 'tin_ore', name: '锡矿' });
item({ key: 'lead_ore', name: '铅矿' });
item({ key: 'tungsten_ore', name: '钨矿' });
item({ key: 'platinum_ore', name: '铂金矿' });
item({ key: 'tin_bar', name: '锡锭' });
item({ key: 'lead_bar', name: '铅锭' });
item({ key: 'tungsten_bar', name: '钨锭' });
item({ key: 'platinum_bar', name: '铂金锭' });
item({ key: 'demonite_ore', name: '魔矿' });
item({ key: 'meteorite', name: '陨石' });
item({ key: 'hellstone', name: '狱石' });
item({ key: 'crimtane_ore', name: '猩红矿' });
item({ key: 'cobalt_ore', name: '钴矿' });
item({ key: 'mythril_ore', name: '秘银矿' });
item({ key: 'adamantite_ore', name: '精金矿' });
item({ key: 'palladium_ore', name: '钯金矿' });
item({ key: 'orichalcum_ore', name: '山铜矿' });
item({ key: 'titanium_ore', name: '钛矿' });
item({ key: 'chlorophyte_ore', name: '叶绿矿' });
// ---- 宝石 ----
item({ key: 'sapphire', name: '蓝宝石', value: 15 });
item({ key: 'ruby', name: '红宝石', value: 22 });
item({ key: 'emerald', name: '翡翠', value: 15 });
item({ key: 'topaz', name: '黄玉', value: 11 });
item({ key: 'amethyst', name: '紫水晶', value: 11 });
item({ key: 'diamond', name: '钻石', value: 30 });
// ---- 冰雪 / 沙漠 / 基础方块 ----
item({ key: 'ice_block', name: '冰块', tile: 'ice' });
item({ key: 'ice_brick', name: '冰砖', tile: 'ice_brick' });
item({ key: 'snow_brick', name: '雪砖', tile: 'snow_brick' });
item({ key: 'sandstone_block', name: '沙岩', tile: 'sandstone' });
item({ key: 'hardened_sand_block', name: '硬化沙块', tile: 'hardened_sand' });
item({ key: 'desert_fossil', name: '沙漠化石' });
item({ key: 'clay_block', name: '粘土块', tile: 'clay' });
item({ key: 'glass', name: '玻璃', tile: 'glass' });
item({ key: 'obsidian', name: '黑曜石', tile: 'obsidian' });
item({ key: 'gray_brick', name: '灰砖', tile: 'gray_brick' });
item({ key: 'red_brick', name: '红砖', tile: 'red_brick' });
item({ key: 'mud_block', name: '泥块', tile: 'mud' });
item({ key: 'silt_block', name: '淤泥块', tile: 'silt' });
// ---- 家具 ----
item({ key: 'table', name: '木桌', tile: 'table', maxStack: 99 });
item({ key: 'chair', name: '木椅', tile: 'chair', maxStack: 99 });
item({ key: 'bed', name: '床', tile: 'bed', maxStack: 99 });
item({ key: 'bookcase', name: '书架', tile: 'bookcase', maxStack: 99 });
item({ key: 'grandfather_clock', name: '落地钟', tile: 'grandfather_clock', maxStack: 99 });
item({ key: 'piano', name: '钢琴', tile: 'piano', maxStack: 99 });
item({ key: 'dresser', name: '梳妆台', tile: 'dresser', maxStack: 99 });
item({ key: 'bench', name: '长凳', tile: 'bench', maxStack: 99 });
item({ key: 'bathtub', name: '浴缸', tile: 'bathtub', maxStack: 99 });
item({ key: 'keg', name: '酒桶', tile: 'keg', maxStack: 99 });
item({ key: 'cooking_pot', name: '汤锅', tile: 'cooking_pot', maxStack: 99 });
item({ key: 'clay_pot', name: '陶盆', tile: 'clay_pot', maxStack: 99 });
item({ key: 'tombstone', name: '墓碑', tile: 'tombstone_v', maxStack: 99 });
item({ key: 'life_crystal', name: '水晶之心', maxStack: 99, desc: '古老的生命结晶' });
item({ key: 'candle', name: '蜡烛', tile: 'candle', maxStack: 99 });
item({ key: 'chandelier', name: '吊灯', tile: 'chandelier', maxStack: 99 });
item({ key: 'lantern', name: '吊挂灯笼', tile: 'lantern', maxStack: 99 });
item({ key: 'candelabra', name: '烛台', tile: 'candelabra', maxStack: 99 });
item({ key: 'chinese_lantern', name: '中式灯笼', tile: 'chinese_lantern', maxStack: 99 });
item({ key: 'skull_lantern', name: '骷髅灯笼', tile: 'skull_lantern', maxStack: 99 });
item({ key: 'water_candle', name: '水蜡烛', tile: 'water_candle', maxStack: 99 });
// 瓦罐战利品
item({ key: 'bomb', name: '小型炸弹', maxStack: 99, desc: '用力扔出去会爆炸…（待实装）', value: 5 });
item({ key: 'rope', name: '攀爬绳', maxStack: 999, desc: '左键放置绳列,触碰可攀爬', value: 1, tile: 'v_213_rope' });
export function mkStack(key, stack = 1) {
    const id = byKey[key];
    if (id === undefined)
        return null;
    return { id, stack };
}
// ===================== wld 导入补全物品（compat-report 驱动） =====================
// 这些物品目前只做图标与存档保留（占位），后续按需实装功能
item({ key: 'vi_2350_recall_potion', name: 'Recall Potion', maxStack: 999, value: 1 });
item({ key: 'vi_188_healing_potion', name: 'Healing Potion', maxStack: 999, value: 1 });
item({ key: 'vi_282_glowstick', name: 'Glowstick', maxStack: 999, value: 1 });
item({ key: 'vi_41_flaming_arrow', name: 'Flaming Arrow', maxStack: 999, value: 1 });
item({ key: 'vi_167_dynamite', name: 'Dynamite', maxStack: 999, value: 1 });
item({ key: 'vi_279_throwing_knife', name: 'Throwing Knife', maxStack: 999, value: 1 });
item({ key: 'vi_51_jester_s_arrow', name: 'Jester\'s Arrow', maxStack: 999, value: 1 });
item({ key: 'vi_19_gold_bar', name: 'Gold Bar', maxStack: 999, value: 1 });
item({ key: 'vi_302_water_walking_potion', name: 'Water Walking Potion', maxStack: 999, value: 1 });
item({ key: 'vi_305_gravitation_potion', name: 'Gravitation Potion', maxStack: 999, value: 1 });
item({ key: 'vi_43_suspicious_looking_eye', name: 'Suspicious Looking Eye', maxStack: 999, value: 1 });
item({ key: 'vi_296_spelunker_potion', name: 'Spelunker Potion', maxStack: 999, value: 1 });
item({ key: 'vi_299_night_owl_potion', name: 'Night Owl Potion', maxStack: 999, value: 1 });
item({ key: 'vi_965_rope', name: 'Rope', maxStack: 999, value: 1 });
item({ key: 'vi_303_archery_potion', name: 'Archery Potion', maxStack: 999, value: 1 });
item({ key: 'vi_304_hunter_potion', name: 'Hunter Potion', maxStack: 999, value: 1 });
item({ key: 'vi_50_magic_mirror', name: 'Magic Mirror', maxStack: 999, value: 1 });
item({ key: 'vi_42_shuriken', name: 'Shuriken', maxStack: 999, value: 1 });
item({ key: 'vi_295_featherfall_potion', name: 'Featherfall Potion', maxStack: 999, value: 1 });
item({ key: 'vi_53_cloud_in_a_bottle', name: 'Cloud in a Bottle', maxStack: 999, value: 1 });
item({ key: 'vi_2329_dangersense_potion', name: 'Dangersense Potion', maxStack: 999, value: 1 });
item({ key: 'vi_40_wooden_arrow', name: 'Wooden Arrow', maxStack: 999, value: 1 });
item({ key: 'vi_975_shoe_spikes', name: 'Shoe Spikes', maxStack: 999, value: 1 });
item({ key: 'vi_54_hermes_boots', name: 'Hermes Boots', maxStack: 999, value: 1 });
item({ key: 'vi_301_thorns_potion', name: 'Thorns Potion', maxStack: 999, value: 1 });
item({ key: 'vi_49_band_of_regeneration', name: 'Band of Regeneration', maxStack: 999, value: 1 });
item({ key: 'vi_2326_titan_potion', name: 'Titan Potion', maxStack: 999, value: 1 });
item({ key: 'vi_297_invisibility_potion', name: 'Invisibility Potion', maxStack: 999, value: 1 });
item({ key: 'vi_166_bomb', name: 'Bomb', maxStack: 999, value: 1 });
item({ key: 'vi_5011_mace', name: 'Mace', maxStack: 999, value: 1 });
item({ key: 'vi_4425_shark_bait', name: 'Shark Bait', maxStack: 999, value: 1 });
item({ key: 'vi_2351_teleportation_potion', name: 'Teleportation Potion', maxStack: 999, value: 1 });
item({ key: 'vi_4460_sandcastle_bucket', name: 'Sandcastle Bucket', maxStack: 999, value: 1 });
item({ key: 'vi_168_grenade', name: 'Grenade', maxStack: 999, value: 1 });
item({ key: 'vi_227_restoration_potion', name: 'Restoration Potion', maxStack: 999, value: 1 });
item({ key: 'vi_930_flare_gun', name: 'Flare Gun', maxStack: 999, value: 1 });
item({ key: 'vi_931_flare', name: 'Flare', maxStack: 999, value: 1 });
item({ key: 'vi_997_extractinator', name: 'Extractinator', maxStack: 999, value: 1 });
item({ key: 'vi_52_angel_statue', name: 'Angel Statue', maxStack: 999, value: 1 });
item({ key: 'vi_265_hellfire_arrow', name: 'Hellfire Arrow', maxStack: 999, value: 1 });
item({ key: 'vi_298_shine_potion', name: 'Shine Potion', maxStack: 999, value: 1 });
item({ key: 'vi_5007_dead_man_s_sweater', name: 'Dead Man\'s Sweater', maxStack: 999, value: 1 });
item({ key: 'vi_117_meteorite_bar', name: 'Meteorite Bar', maxStack: 999, value: 1 });
item({ key: 'vi_186_breathing_reed', name: 'Breathing Reed', maxStack: 999, value: 1 });
item({ key: 'vi_329_shadow_key', name: 'Shadow Key', maxStack: 999, value: 1 });
item({ key: 'vi_974_ice_torch', name: 'Ice Torch', maxStack: 999, value: 1 });
item({ key: 'vi_2322_mining_potion', name: 'Mining Potion', maxStack: 999, value: 1 });
item({ key: 'vi_4915_tungsten_bullet', name: 'Tungsten Bullet', maxStack: 999, value: 1 });
item({ key: 'vi_946_umbrella', name: 'Umbrella', maxStack: 999, value: 1 });
item({ key: 'vi_939_web_slinger', name: 'Web Slinger', maxStack: 999, value: 1 });
item({ key: 'vi_4870_potion_of_return', name: 'Potion of Return', maxStack: 999, value: 1 });
item({ key: 'vi_288_obsidian_skin_potion', name: 'Obsidian Skin Potion', maxStack: 999, value: 1 });
item({ key: 'vi_31_bottle', name: 'Bottle', maxStack: 999, value: 1 });
item({ key: 'vi_211_feral_claws', name: 'Feral Claws', maxStack: 999, value: 1 });
item({ key: 'vi_4404_inner_tube', name: 'Inner Tube', maxStack: 999, value: 1 });
item({ key: 'vi_187_flipper', name: 'Flipper', maxStack: 999, value: 1 });
item({ key: 'vi_2198_ice_machine', name: 'Ice Machine', maxStack: 999, value: 1 });
item({ key: 'vi_274_dark_lance', name: 'Dark Lance', maxStack: 999, value: 1 });
item({ key: 'vi_285_aglet', name: 'Aglet', maxStack: 999, value: 1 });
item({ key: 'vi_213_staff_of_regrowth', name: 'Staff of Regrowth', maxStack: 999, value: 1 });
item({ key: 'vi_964_boomstick', name: 'Boomstick', maxStack: 999, value: 1 });
item({ key: 'vi_1293_lihzahrd_power_cell', name: 'Lihzahrd Power Cell', maxStack: 999, value: 1 });
item({ key: 'vi_2195_lihzahrd_furnace', name: 'Lihzahrd Furnace', maxStack: 999, value: 1 });
item({ key: 'vi_2766_solar_tablet_fragment', name: 'Solar Tablet Fragment', maxStack: 999, value: 1 });
item({ key: 'vi_300_battle_potion', name: 'Battle Potion', maxStack: 999, value: 1 });
item({ key: 'vi_2348_inferno_potion', name: 'Inferno Potion', maxStack: 999, value: 1 });
item({ key: 'vi_218_flamelash', name: 'Flamelash', maxStack: 999, value: 1 });
item({ key: 'vi_3019_hellwing_bow', name: 'Hellwing Bow', maxStack: 999, value: 1 });
item({ key: 'vi_112_flower_of_fire', name: 'Flower of Fire', maxStack: 999, value: 1 });
item({ key: 'vi_220_sunfury', name: 'Sunfury', maxStack: 999, value: 1 });
item({ key: 'vi_4345_can_of_worms', name: 'Can Of Worms', maxStack: 999, value: 1 });
item({ key: 'vi_953_climbing_claws', name: 'Climbing Claws', maxStack: 999, value: 1 });
item({ key: 'vi_3069_wand_of_sparking', name: 'Wand of Sparking', maxStack: 999, value: 1 });
item({ key: 'vi_212_anklet_of_the_wind', name: 'Anklet of the Wind', maxStack: 999, value: 1 });
item({ key: 'vi_2204_honey_dispenser', name: 'Honey Dispenser', maxStack: 999, value: 1 });
item({ key: 'vi_277_trident', name: 'Trident', maxStack: 999, value: 1 });
item({ key: 'vi_863_water_walking_boots', name: 'Water Walking Boots', maxStack: 999, value: 1 });
item({ key: 'vi_751_cloud', name: 'Cloud', maxStack: 999, value: 1 });
item({ key: 'vi_155_muramasa', name: 'Muramasa', maxStack: 999, value: 1 });
item({ key: 'vi_289_regeneration_potion', name: 'Regeneration Potion', maxStack: 999, value: 1 });
item({ key: 'vi_906_lava_charm', name: 'Lava Charm', maxStack: 999, value: 1 });
item({ key: 'vi_4055_dunerider_boots', name: 'Dunerider Boots', maxStack: 999, value: 1 });
item({ key: 'vi_724_ice_blade', name: 'Ice Blade', maxStack: 999, value: 1 });
item({ key: 'vi_670_ice_boomerang', name: 'Ice Boomerang', maxStack: 999, value: 1 });
item({ key: 'vi_4061_storm_spear', name: 'Storm Spear', maxStack: 999, value: 1 });
item({ key: 'vi_987_blizzard_in_a_bottle', name: 'Blizzard in a Bottle', maxStack: 999, value: 1 });
item({ key: 'vi_4551_slice_of_hell_cake', name: 'Slice of Hell Cake', maxStack: 999, value: 1 });
item({ key: 'vi_5010_treasure_magnet', name: 'Treasure Magnet', maxStack: 999, value: 1 });
item({ key: 'vi_2323_heartreach_potion', name: 'Heartreach Potion', maxStack: 999, value: 1 });
item({ key: 'vi_2345_lifeforce_potion', name: 'Lifeforce Potion', maxStack: 999, value: 1 });
item({ key: 'vi_290_swiftness_potion', name: 'Swiftness Potion', maxStack: 999, value: 1 });
item({ key: 'vi_291_gills_potion', name: 'Gills Potion', maxStack: 999, value: 1 });
item({ key: 'vi_280_spear', name: 'Spear', maxStack: 999, value: 1 });
item({ key: 'vi_2325_builder_potion', name: 'Builder Potion', maxStack: 999, value: 1 });
item({ key: 'vi_284_wooden_boomerang', name: 'Wooden Boomerang', maxStack: 999, value: 1 });
item({ key: 'vi_2192_bone_welder', name: 'Bone Welder', maxStack: 999, value: 1 });
item({ key: 'vi_5234_remnants_of_devotion', name: 'Remnants of Devotion', maxStack: 999, value: 1 });
item({ key: 'vi_156_cobalt_shield', name: 'Cobalt Shield', maxStack: 999, value: 1 });
item({ key: 'vi_157_aqua_scepter', name: 'Aqua Scepter', maxStack: 999, value: 1 });
item({ key: 'vi_163_blue_moon', name: 'Blue Moon', maxStack: 999, value: 1 });
item({ key: 'vi_113_magic_missile', name: 'Magic Missile', maxStack: 999, value: 1 });
item({ key: 'vi_3317_valor', name: 'Valor', maxStack: 999, value: 1 });
item({ key: 'vi_327_golden_key', name: 'Golden Key', maxStack: 999, value: 1 });
item({ key: 'vi_164_handgun', name: 'Handgun', maxStack: 999, value: 1 });
item({ key: 'vi_294_magic_power_potion', name: 'Magic Power Potion', maxStack: 999, value: 1 });
item({ key: 'vi_4263_magic_conch', name: 'Magic Conch', maxStack: 999, value: 1 });
item({ key: 'vi_4062_thunder_zapper', name: 'Thunder Zapper', maxStack: 999, value: 1 });
item({ key: 'vi_1579_flurry_boots', name: 'Flurry Boots', maxStack: 999, value: 1 });
item({ key: 'vi_4056_ancient_chisel', name: 'Ancient Chisel', maxStack: 999, value: 1 });
item({ key: 'vi_4346_encumbering_stone', name: 'Encumbering Stone', maxStack: 999, value: 1 });
item({ key: 'vi_1319_snowball_cannon', name: 'Snowball Cannon', maxStack: 999, value: 1 });
item({ key: 'vi_3199_ice_mirror', name: 'Ice Mirror', maxStack: 999, value: 1 });
item({ key: 'vi_950_ice_skates', name: 'Ice Skates', maxStack: 999, value: 1 });
item({ key: 'vi_4443_demonic_hellcart', name: 'Demonic Hellcart', maxStack: 999, value: 1 });
item({ key: 'vi_4737_ornate_shadow_key', name: 'Ornate Shadow Key', maxStack: 999, value: 1 });
item({ key: 'vi_4276_bast_statue', name: 'Bast Statue', maxStack: 999, value: 1 });
item({ key: 'vi_4262_snake_charmer_s_flute', name: 'Snake Charmer\'s Flute', maxStack: 999, value: 1 });
item({ key: 'vi_3093_herb_bag', name: 'Herb Bag', maxStack: 999, value: 1 });
item({ key: 'vi_292_ironskin_potion', name: 'Ironskin Potion', maxStack: 999, value: 1 });
item({ key: 'vi_3084_radar', name: 'Radar', maxStack: 999, value: 1 });
item({ key: 'vi_4341_step_stool', name: 'Step Stool', maxStack: 999, value: 1 });
item({ key: 'vi_4978_fledgling_wings', name: 'Fledgling Wings', maxStack: 999, value: 1 });
item({ key: 'vi_2197_sky_mill', name: 'Sky Mill', maxStack: 999, value: 1 });
item({ key: 'vi_158_lucky_horseshoe', name: 'Lucky Horseshoe', maxStack: 999, value: 1 });
item({ key: 'vi_5254_blessing_from_the_heavens', name: 'Blessing from the Heavens', maxStack: 999, value: 1 });
item({ key: 'vi_1156_piranha_gun', name: 'Piranha Gun', maxStack: 999, value: 1 });
item({ key: 'vi_1571_scourge_of_the_corruptor', name: 'Scourge of the Corruptor', maxStack: 999, value: 1 });
item({ key: 'vi_1260_rainbow_gun', name: 'Rainbow Gun', maxStack: 999, value: 1 });
item({ key: 'vi_1572_staff_of_the_frost_hydra', name: 'Staff of the Frost Hydra', maxStack: 999, value: 1 });
item({ key: 'vi_4607_desert_tiger_staff', name: 'Desert Tiger Staff', maxStack: 999, value: 1 });
item({ key: 'vi_933_leaf_wand', name: 'Leaf Wand', maxStack: 999, value: 1 });
item({ key: 'vi_832_living_wood_wand', name: 'Living Wood Wand', maxStack: 999, value: 1 });
item({ key: 'vi_4066_desert_minecart', name: 'Desert Minecart', maxStack: 999, value: 1 });
item({ key: 'vi_4450_shroom_minecart', name: 'Shroom Minecart', maxStack: 999, value: 1 });
item({ key: 'vi_4423_scarab_bomb', name: 'Scarab Bomb', maxStack: 999, value: 1 });
item({ key: 'vi_159_shiny_red_balloon', name: 'Shiny Red Balloon', maxStack: 999, value: 1 });
item({ key: 'vi_5258_see_the_world_for_what_it_is', name: 'See The World For What It Is', maxStack: 999, value: 1 });
item({ key: 'vi_65_starfury', name: 'Starfury', maxStack: 999, value: 1 });
item({ key: 'vi_5388_eye_of_the_sun', name: 'Eye of the Sun', maxStack: 999, value: 1 });
item({ key: 'vi_2219_celestial_magnet', name: 'Celestial Magnet', maxStack: 999, value: 1 });
item({ key: 'vi_5255_love_is_in_the_trash_slot', name: 'Love is in the Trash Slot', maxStack: 999, value: 1 });
item({ key: 'vi_4426_bee_minecart', name: 'Bee Minecart', maxStack: 999, value: 1 });
item({ key: 'vi_3017_flower_boots', name: 'Flower Boots', maxStack: 999, value: 1 });
item({ key: 'vi_3360_living_mahogany_wand', name: 'Living Mahogany Wand', maxStack: 999, value: 1 });
item({ key: 'vi_3361_rich_mahogany_leaf_wand', name: 'Rich Mahogany Leaf Wand', maxStack: 999, value: 1 });
item({ key: 'vi_1309_slime_staff', name: 'Slime Staff', maxStack: 999, value: 1 });
item({ key: 'vi_1845_necromantic_scroll', name: 'Necromantic Scroll', maxStack: 999, value: 1 });
item({ key: 'vi_1864_papyrus_scarab', name: 'Papyrus Scarab', maxStack: 999, value: 1 });
item({ key: 'vi_1158_pygmy_necklace', name: 'Pygmy Necklace', maxStack: 999, value: 1 });
item({ key: 'vi_3034_coin_ring', name: 'Coin Ring', maxStack: 999, value: 1 });
item({ key: 'vi_308_moonglow_seeds', name: 'Moonglow Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 1 });
item({ key: 'vi_312_fireblossom_seeds', name: 'Fireblossom Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 5 });
item({ key: 'vi_310_deathweed_seeds', name: 'Deathweed Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 4 });
item({ key: 'vi_307_daybloom_seeds', name: 'Daybloom Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 0 });
item({ key: 'vi_309_blinkroot_seeds', name: 'Blinkroot Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 2 });
item({ key: 'vi_2357_shiverthorn_seeds', name: 'Shiverthorn Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 6 });
item({ key: 'vi_311_waterleaf_seeds', name: 'Waterleaf Seeds', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 3 });
item({ key: 'vi_1828_pumpkin_seed', name: 'Pumpkin Seed', maxStack: 999, value: 1 });
item({ key: 'vi_126_bottled_water', name: 'Bottled Water', maxStack: 999, value: 1 });
item({ key: 'vi_1134_bottled_honey', name: 'Bottled Honey', maxStack: 999, value: 1 });
item({ key: 'vi_3068_guide_to_plant_fiber_cordage', name: 'Guide to Plant Fiber Cordage', maxStack: 999, value: 1 });
item({ key: 'vi_4779_mushroom_hat', name: 'Mushroom Hat', maxStack: 999, value: 1 });
item({ key: 'vi_4780_mushroom_vest', name: 'Mushroom Vest', maxStack: 999, value: 1 });
item({ key: 'vi_4781_mushroom_pants', name: 'Mushroom Pants', maxStack: 999, value: 1 });
// ===================== FTW_V2 补全物品（占位收集品） =====================
item({ key: 'vi_678_red_potion', name: 'Red Potion', maxStack: 999, value: 1 });
item({ key: 'vi_281_blowpipe', name: 'Blowpipe', maxStack: 999, value: 1 });
item({ key: 'vi_293_mana_regeneration_potion', name: 'Mana Regeneration Potion', maxStack: 999, value: 1 });
item({ key: 'vi_2767_solar_tablet', name: 'Solar Tablet', maxStack: 999, value: 1 });
item({ key: 'vi_3213_money_trough', name: 'Money Trough', maxStack: 999, value: 1 });
item({ key: 'vi_2757_vortex_helmet', name: 'Vortex Helmet', maxStack: 999, value: 1 });
item({ key: 'vi_4989_soaring_insignia', name: 'Soaring Insignia', maxStack: 999, value: 1 });
item({ key: 'vi_3383_stardust_leggings', name: 'Stardust Leggings', maxStack: 999, value: 1 });
item({ key: 'vi_4914_kaleidoscope', name: 'Kaleidoscope', maxStack: 999, value: 1 });
item({ key: 'vi_1991_bug_net', name: 'Bug Net', maxStack: 999, value: 1 });
item({ key: 'vi_4828_superheated_blood', name: 'Superheated Blood', maxStack: 999, value: 1 });
item({ key: 'vi_3509_copper_pickaxe', name: 'Copper Pickaxe', maxStack: 999, value: 1 });
item({ key: 'vi_3507_copper_shortsword', name: 'Copper Shortsword', maxStack: 999, value: 1 });
item({ key: 'vi_4755_grox_the_great_s_horned_cowl', name: 'Grox The Great\'s Horned Cowl', maxStack: 999, value: 1 });
item({ key: 'vi_4756_grox_the_great_s_chestplate', name: 'Grox The Great\'s Chestplate', maxStack: 999, value: 1 });
item({ key: 'vi_4757_grox_the_great_s_greaves', name: 'Grox The Great\'s Greaves', maxStack: 999, value: 1 });
item({ key: 'vi_5000_terraspark_boots', name: 'Terraspark Boots', maxStack: 999, value: 1 });
item({ key: 'vi_5339_arcane_crystal', name: 'Arcane Crystal', maxStack: 999, value: 1 });
item({ key: 'vi_5391_uncumbering_stone', name: 'Uncumbering Stone', maxStack: 999, value: 1 });
item({ key: 'vi_2585_slime_hook', name: 'Slime Hook', maxStack: 999, value: 1 });
item({ key: 'vi_313_daybloom', name: 'Daybloom', maxStack: 999, value: 1 });
item({ key: 'vi_267_guide_voodoo_doll', name: 'Guide Voodoo Doll', maxStack: 999, value: 1 });
item({ key: 'vi_2649_steampunk_candle', name: 'Steampunk Candle', maxStack: 999, value: 1 });
item({ key: 'vi_286_sticky_glowstick', name: 'Sticky Glowstick', maxStack: 999, value: 1 });
item({ key: 'vi_3002_spelunker_glowstick', name: 'Spelunker Glowstick', maxStack: 999, value: 1 });
item({ key: 'vi_4819_demon_conch', name: 'Demon Conch', maxStack: 999, value: 1 });
item({ key: 'vi_1802_raven_staff', name: 'Raven Staff', maxStack: 999, value: 1 });
item({ key: 'vi_3382_stardust_plate', name: 'Stardust Plate', maxStack: 999, value: 1 });
item({ key: 'vi_3270_item_frame', name: 'Item Frame', maxStack: 999, value: 1 });
item({ key: 'vi_3771_ancient_horn', name: 'Ancient Horn', maxStack: 999, value: 1 });
item({ key: 'vi_4281_finch_staff', name: 'Finch Staff', maxStack: 999, value: 1 });
item({ key: 'vi_5407_star_royale_brick', name: 'Star Royale Brick', maxStack: 999, value: 1 });
item({ key: 'vi_5401_lunar_rust_brick', name: 'Lunar Rust Brick', maxStack: 999, value: 1 });
item({ key: 'vi_4716_mollusk_whistle', name: 'Mollusk Whistle', maxStack: 999, value: 1 });
item({ key: 'vi_3540_phantasm', name: 'Phantasm', maxStack: 999, value: 1 });
item({ key: 'vi_2176_shroomite_digging_claw', name: 'Shroomite Digging Claw', maxStack: 999, value: 1 });
item({ key: 'vi_2349_wrath_potion', name: 'Wrath Potion', maxStack: 999, value: 1 });
item({ key: 'vi_4679_morning_star', name: 'Morning Star', maxStack: 999, value: 1 });
item({ key: 'vi_1169_bone_key', name: 'Bone Key', maxStack: 999, value: 1 });
item({ key: 'vi_3863_betsy_mask', name: 'Betsy Mask', maxStack: 999, value: 1 });
item({ key: 'vi_3124_cell_phone', name: 'Cell Phone', maxStack: 999, value: 1 });
item({ key: 'vi_3506_copper_axe', name: 'Copper Axe', maxStack: 999, value: 1 });
item({ key: 'vi_4680_dark_harvest', name: 'Dark Harvest', maxStack: 999, value: 1 });
item({ key: 'vi_543_brown_pressure_plate', name: 'Brown Pressure Plate', maxStack: 999, value: 1 });
item({ key: 'vi_171_sign', name: 'Sign', maxStack: 999, value: 1 });
item({ key: 'vi_1723_living_wood_wall', name: 'Living Wood Wall', maxStack: 999, value: 1 });
item({ key: 'vi_4754_grox_the_great_s_wings', name: 'Grox The Great\'s Wings', maxStack: 999, value: 1 });
item({ key: 'vi_3353_mechanical_cart', name: 'Mechanical Cart', maxStack: 999, value: 1 });
item({ key: 'vi_2287_winter_cape', name: 'Winter Cape', maxStack: 999, value: 1 });
item({ key: 'vi_1179_chlorophyte_bullet', name: 'Chlorophyte Bullet', maxStack: 999, value: 1 });
item({ key: 'vi_4766_world_globe', name: 'World Globe', maxStack: 999, value: 1 });
item({ key: 'vi_4954_celestial_starboard', name: 'Celestial Starboard', maxStack: 999, value: 1 });
item({ key: 'vi_4730_ghostar_s_infinity_eight', name: 'Ghostar\'s Infinity Eight', maxStack: 999, value: 1 });
item({ key: 'vi_4758_blade_staff', name: 'Blade Staff', maxStack: 999, value: 1 });
item({ key: 'vi_4765_tree_globe', name: 'Tree Globe', maxStack: 999, value: 1 });
item({ key: 'vi_5342_ambrosia', name: 'Ambrosia', maxStack: 999, value: 1 });
item({ key: 'vi_5328_chest_lock', name: 'Chest Lock', maxStack: 999, value: 1 });
item({ key: 'vi_5343_peddler_s_satchel', name: 'Peddler\'s Satchel', maxStack: 999, value: 1 });
item({ key: 'vi_5285_moon_globe', name: 'Moon Globe', maxStack: 999, value: 1 });
item({ key: 'vi_5289_minecart_upgrade_kit', name: 'Minecart Upgrade Kit', maxStack: 999, value: 1 });
item({ key: 'vi_5336_advanced_combat_techniques_volume_two', name: 'Advanced Combat Techniques: Volume Two', maxStack: 999, value: 1 });
item({ key: 'vi_5451_kwad_racer_drone', name: 'Kwad Racer Drone', maxStack: 999, value: 1 });
item({ key: 'vi_5359_shellphone_spawn', name: 'Shellphone (Spawn)', maxStack: 999, value: 1 });
item({ key: 'vi_3032_super_absorbant_sponge', name: 'Super Absorbant Sponge', maxStack: 999, value: 1 });
item({ key: 'vi_3031_bottomless_water_bucket', name: 'Bottomless Water Bucket', maxStack: 999, value: 1 });
item({ key: 'vi_509_red_wrench', name: 'Red Wrench', maxStack: 999, value: 1 });
item({ key: 'vi_4741_butcher_s_bloodstained_apron', name: 'Butcher\'s Bloodstained Apron', maxStack: 999, value: 1 });
item({ key: 'vi_3065_star_wrath', name: 'Star Wrath', maxStack: 999, value: 1 });
item({ key: 'vi_3063_meowmere', name: 'Meowmere', maxStack: 999, value: 1 });
item({ key: 'vi_3372_lunatic_cultist_mask', name: 'Lunatic Cultist Mask', maxStack: 999, value: 1 });
item({ key: 'vi_1504_spectre_robe', name: 'Spectre Robe', maxStack: 999, value: 1 });
item({ key: 'vi_2769_cosmic_car_key', name: 'Cosmic Car Key', maxStack: 999, value: 1 });
item({ key: 'vi_216_shackle', name: 'Shackle', maxStack: 999, value: 1 });
item({ key: 'vi_4415_stone_door', name: 'Stone Door', maxStack: 999, value: 1 });
item({ key: 'vi_1681_skeleton_banner', name: 'Skeleton Banner', maxStack: 999, value: 1 });
item({ key: 'vi_283_seed', name: 'Seed', maxStack: 999, value: 1 });
item({ key: 'vi_1173_grave_marker', name: 'Grave Marker', maxStack: 999, value: 1 });
item({ key: 'vi_4379_wyvern_kite', name: 'Wyvern Kite', maxStack: 999, value: 1 });
item({ key: 'vi_4378_xenon_moss', name: 'Xenon Moss', maxStack: 999, value: 1 });
item({ key: 'vi_4377_krypton_moss', name: 'Krypton Moss', maxStack: 999, value: 1 });
item({ key: 'vi_4376_rat_cage', name: 'Rat Cage', maxStack: 999, value: 1 });
item({ key: 'vi_4375_rat', name: 'Rat', maxStack: 999, value: 1 });
item({ key: 'vi_4484_1_2_second_timer', name: '1/2 Second Timer', maxStack: 999, value: 1 });
item({ key: 'vi_4824_wet_bomb', name: 'Wet Bomb', maxStack: 999, value: 1 });
item({ key: 'vi_4485_1_4_second_timer', name: '1/4 Second Timer', maxStack: 999, value: 1 });
item({ key: 'vi_5378_cursed_flare', name: 'Cursed Flare', maxStack: 999, value: 1 });
item({ key: 'vi_5354_reflective_shades', name: 'Reflective Shades', maxStack: 999, value: 1 });
item({ key: 'vi_5387_raynbro_s_pants', name: 'Raynbro\'s Pants', maxStack: 999, value: 1 });
item({ key: 'vi_5386_raynbro_s_hoodie', name: 'Raynbro\'s Hoodie', maxStack: 999, value: 1 });
item({ key: 'vi_5390_raynbro_s_hood', name: 'Raynbro\'s Hood', maxStack: 999, value: 1 });
item({ key: 'vi_5338_aegis_fruit', name: 'Aegis Fruit', maxStack: 999, value: 1 });
item({ key: 'vi_5404_cosmic_ember_brick', name: 'Cosmic Ember Brick', maxStack: 999, value: 1 });
item({ key: 'vi_5405_cryocore_brick', name: 'Cryocore Brick', maxStack: 999, value: 1 });
item({ key: 'vi_5403_astra_brick', name: 'Astra Brick', maxStack: 999, value: 1 });
item({ key: 'vi_346_safe', name: 'Safe', maxStack: 999, value: 1 });
item({ key: 'vi_4829_cat_license', name: 'Cat License', maxStack: 999, value: 1 });
item({ key: 'vi_3335_demon_heart', name: 'Demon Heart', maxStack: 999, value: 1 });
item({ key: 'vi_4750_foodbarbarian_s_tattered_dragon_wings', name: 'FoodBarbarian\'s Tattered Dragon Wings', maxStack: 999, value: 1 });
item({ key: 'vi_3042_phase_dye', name: 'Phase Dye', maxStack: 999, value: 1 });
item({ key: 'vi_3024_skiphs_blood', name: 'Skiphs\' Blood', maxStack: 999, value: 1 });
item({ key: 'vi_3054_shadowflame_knife', name: 'Shadowflame Knife', maxStack: 999, value: 1 });
item({ key: 'vi_5275_joja_cola', name: 'Joja Cola', maxStack: 999, value: 1 });
item({ key: 'vi_5278_pomegranate', name: 'Pomegranate', maxStack: 999, value: 1 });
item({ key: 'vi_5277_spicy_pepper', name: 'Spicy Pepper', maxStack: 999, value: 1 });
item({ key: 'vi_5437_shellphone', name: 'Shellphone', maxStack: 999, value: 1 });
item({ key: 'vi_1507_spectre_hamaxe', name: 'Spectre Hamaxe', maxStack: 999, value: 1 });
item({ key: 'vi_2250_steampunk_chest', name: 'Steampunk Chest', maxStack: 999, value: 1 });
item({ key: 'vi_392_glass_wall', name: 'Glass Wall', maxStack: 999, value: 1 });
item({ key: 'vi_2699_weapon_rack', name: 'Weapon Rack', maxStack: 999, value: 1 });
item({ key: 'vi_3552_blue_flame_and_silver_dye', name: 'Blue Flame and Silver Dye', maxStack: 999, value: 1 });
item({ key: 'vi_5005_terraprisma', name: 'Terraprisma', maxStack: 999, value: 1 });
item({ key: 'vi_4604_exotic_chew_toy', name: 'Exotic Chew Toy', maxStack: 999, value: 1 });
item({ key: 'vi_4611_world_feeder_kite', name: 'World Feeder Kite', maxStack: 999, value: 1 });
item({ key: 'vi_4649_blue_jellyfish_kite', name: 'Blue Jellyfish Kite', maxStack: 999, value: 1 });
item({ key: 'vi_4796_dark_mage_s_tome', name: 'Dark Mage\'s Tome', maxStack: 999, value: 1 });
item({ key: 'vi_4553_plasma_lamp', name: 'Plasma Lamp', maxStack: 999, value: 1 });
item({ key: 'vi_4365_celestial_wand', name: 'Celestial Wand', maxStack: 999, value: 1 });
item({ key: 'vi_331_jungle_spores', name: 'Jungle Spores', maxStack: 999, value: 1 });
item({ key: 'vi_2430_slimy_saddle', name: 'Slimy Saddle', maxStack: 999, value: 1 });
item({ key: 'vi_4956_zenith', name: 'Zenith', maxStack: 999, value: 1 });
item({ key: 'vi_2798_laser_drill', name: 'Laser Drill', maxStack: 999, value: 1 });
item({ key: 'vi_2814_martian_chest', name: 'Martian Chest', maxStack: 999, value: 1 });
item({ key: 'vi_210_vine', name: 'Vine', maxStack: 999, value: 1 });
item({ key: 'vi_4371_yellow_kite', name: 'Yellow Kite', maxStack: 999, value: 1 });
item({ key: 'vi_4291_lemon', name: 'Lemon', maxStack: 999, value: 1 });
item({ key: 'vi_2493_king_slime_mask', name: 'King Slime Mask', maxStack: 999, value: 1 });
item({ key: 'vi_1919_sugar_cookie', name: 'Sugar Cookie', maxStack: 999, value: 1 });
item({ key: 'vi_1912_eggnog', name: 'Eggnog', maxStack: 999, value: 1 });
item({ key: 'vi_4023_grapes', name: 'Grapes', maxStack: 999, value: 1 });
item({ key: 'vi_4792_the_black_spot', name: 'The Black Spot', maxStack: 999, value: 1 });
item({ key: 'vi_3066_smooth_marble_block', name: 'Smooth Marble Block', maxStack: 999, value: 1 });
item({ key: 'vi_1103_slush_block', name: 'Slush Block', maxStack: 999, value: 1 });
item({ key: 'vi_2119_stone_slab', name: 'Stone Slab', maxStack: 999, value: 1 });
item({ key: 'vi_593_snow_block', name: 'Snow Block', maxStack: 999, value: 1 });
item({ key: 'vi_3081_marble_block', name: 'Marble Block', maxStack: 999, value: 1 });
item({ key: 'vi_1111_blue_berries', name: 'Blue Berries', maxStack: 999, value: 1 });
item({ key: 'vi_1115_red_husk', name: 'Red Husk', maxStack: 999, value: 1 });
item({ key: 'vi_217_molten_hamaxe', name: 'Molten Hamaxe', maxStack: 999, value: 1 });
item({ key: 'vi_122_molten_pickaxe', name: 'Molten Pickaxe', maxStack: 999, value: 1 });
item({ key: 'vi_1827_bladed_glove', name: 'Bladed Glove', maxStack: 999, value: 1 });
item({ key: 'vi_2263_white_dynasty_wall', name: 'White Dynasty Wall', maxStack: 999, value: 1 });
item({ key: 'vi_330_obsidian_brick_wall', name: 'Obsidian Brick Wall', maxStack: 999, value: 1 });
item({ key: 'vi_2433_stone_slab_wall', name: 'Stone Slab Wall', maxStack: 999, value: 1 });
item({ key: 'vi_452_hornet_statue', name: 'Hornet Statue', maxStack: 999, value: 1 });
item({ key: 'vi_453_bomb_statue', name: 'Bomb Statue', maxStack: 999, value: 1 });
item({ key: 'vi_360_armor_statue', name: 'Armor Statue', maxStack: 999, value: 1 });
item({ key: 'vi_3711_wraith_statue', name: 'Wraith Statue', maxStack: 999, value: 1 });
item({ key: 'vi_438_star_statue', name: 'Star Statue', maxStack: 999, value: 1 });
item({ key: 'vi_446_skeleton_statue', name: 'Skeleton Statue', maxStack: 999, value: 1 });
item({ key: 'vi_458_cross_statue', name: 'Cross Statue', maxStack: 999, value: 1 });
item({ key: 'vi_3655_scorpion_statue', name: 'Scorpion Statue', maxStack: 999, value: 1 });
item({ key: 'vi_328_shadow_chest', name: 'Shadow Chest', maxStack: 999, value: 1 });
item({ key: 'vi_2196_living_loom', name: 'Living Loom', maxStack: 999, value: 1 });
item({ key: 'vi_916_shadewood_work_bench', name: 'Shadewood Work Bench', maxStack: 999, value: 1 });
item({ key: 'vi_35_iron_anvil', name: 'Iron Anvil', maxStack: 999, value: 1 });
item({ key: 'vi_36_work_bench', name: 'Work Bench', maxStack: 999, value: 1 });
item({ key: 'vi_3240_tall_gate', name: 'Tall Gate', maxStack: 999, value: 1 });
item({ key: 'vi_337_red_banner', name: 'Red Banner', maxStack: 999, value: 1 });
item({ key: 'vi_3381_stardust_helmet', name: 'Stardust Helmet', maxStack: 999, value: 1 });
item({ key: 'vi_1765_vampire_pants', name: 'Vampire Pants', maxStack: 999, value: 1 });
item({ key: 'vi_2859_lunar_cultist_robe', name: 'Lunar Cultist Robe', maxStack: 999, value: 1 });
item({ key: 'vi_2857_lunar_cultist_hood', name: 'Lunar Cultist Hood', maxStack: 999, value: 1 });
item({ key: 'vi_2998_summoner_emblem', name: 'Summoner Emblem', maxStack: 999, value: 1 });
item({ key: 'vi_1175_headstone', name: 'Headstone', maxStack: 999, value: 1 });
item({ key: 'vi_25_wooden_door', name: 'Wooden Door', maxStack: 999, value: 1 });
item({ key: 'vi_46_light_s_bane', name: 'Light\'s Bane', maxStack: 999, value: 1 });
item({ key: 'vi_2340_minecart_track', name: 'Minecart Track', maxStack: 999, value: 1 });
item({ key: 'vi_498_mannequin', name: 'Mannequin', maxStack: 999, value: 1 });
item({ key: 'vi_4721_mushroom_beam', name: 'Mushroom Beam', maxStack: 999, value: 1 });
item({ key: 'vi_819_living_wood_door', name: 'Living Wood Door', maxStack: 999, value: 1 });
item({ key: 'vi_1458_obsidian_door', name: 'Obsidian Door', maxStack: 999, value: 1 });
item({ key: 'vi_3763_0x33_s_aviators', name: '0x33\'s Aviators', maxStack: 999, value: 1 });
item({ key: 'vi_176_mud_block', name: 'Mud Block', maxStack: 999, value: 1 });
item({ key: 'vi_1569_vampire_knives', name: 'Vampire Knives', maxStack: 999, value: 1 });
item({ key: 'vi_857_sandstorm_in_a_bottle', name: 'Sandstorm in a Bottle', maxStack: 999, value: 1 });
item({ key: 'vi_2292_fiberglass_fishing_pole', name: 'Fiberglass Fishing Pole', maxStack: 999, value: 1 });
item({ key: 'vi_5238_constellation', name: 'Constellation', maxStack: 999, value: 1 });
item({ key: 'vi_753_seaweed', name: 'Seaweed', maxStack: 999, value: 1 });
// FTW_V2 物品补全（第二轮）
item({ key: 'vi_3_stone_block', name: 'Stone Block', maxStack: 999, value: 1 });
item({ key: 'vi_94_wood_platform', name: 'Wood Platform', maxStack: 999, value: 1 });
item({ key: 'vi_75_fallen_star', name: 'Fallen Star', maxStack: 999, value: 1 });
item({ key: 'vi_26_stone_wall', name: 'Stone Wall', maxStack: 999, value: 1 });
item({ key: 'vi_214_hellstone_brick', name: 'Hellstone Brick', maxStack: 999, value: 1 });
item({ key: 'vi_93_wood_wall', name: 'Wood Wall', maxStack: 999, value: 1 });
item({ key: 'vi_172_ash_block', name: 'Ash Block', maxStack: 999, value: 1 });
item({ key: 'vi_118_hook', name: 'Hook', maxStack: 999, value: 1 });
item({ key: 'vi_529_red_pressure_plate', name: 'Red Pressure Plate', maxStack: 999, value: 1 });
item({ key: 'vi_183_glowing_mushroom', name: 'Glowing Mushroom', maxStack: 999, value: 1 });
item({ key: 'vi_130_gray_brick_wall', name: 'Gray Brick Wall', maxStack: 999, value: 1 });
item({ key: 'vi_352_keg', name: 'Keg', maxStack: 999, value: 1 });
// 不负责任的女妖啤酒厂 补全物品（占位收集品）
item({ key: 'vi_5120_deer_thing', name: 'Deer Thing', maxStack: 999, value: 1 });
item({ key: 'vi_5508_grim_old_barb', name: 'Grim Old Barb', maxStack: 999, value: 1 });
item({ key: 'vi_5465_ram_rune', name: 'Ram Rune', maxStack: 999, value: 1 });
item({ key: 'vi_5500_goat_s_tuft', name: 'Goat\'s Tuft', maxStack: 999, value: 1 });
item({ key: 'vi_5499_froggy_neckband', name: 'Froggy Neckband', maxStack: 999, value: 1 });
item({ key: 'vi_5507_balloony_beads', name: 'Balloony Beads', maxStack: 999, value: 1 });
item({ key: 'vi_5485_chicken_charm', name: 'Chicken Charm', maxStack: 999, value: 1 });
item({ key: 'vi_5502_cat_chime', name: 'Cat Chime', maxStack: 999, value: 1 });
item({ key: 'vi_5504_turkey_wattle_necklace', name: 'Turkey Wattle Necklace', maxStack: 999, value: 1 });
item({ key: 'vi_5506_crow_s_beak', name: 'Crow\'s Beak', maxStack: 999, value: 1 });
item({ key: 'vi_5503_dog_collar', name: 'Dog Collar', maxStack: 999, value: 1 });
item({ key: 'vi_5534_fairy_choker', name: 'Fairy Choker', maxStack: 999, value: 1 });
item({ key: 'vi_5484_cow_bell', name: 'Cow Bell', maxStack: 999, value: 1 });
item({ key: 'vi_5501_old_companion_locket', name: 'Old Companion Locket', maxStack: 999, value: 1 });
item({ key: 'vi_5509_vampire_pendant', name: 'Vampire Pendant', maxStack: 999, value: 1 });
item({ key: 'vi_5505_mean_goblin_s_spikes', name: 'Mean Goblin\'s Spikes', maxStack: 999, value: 1 });
item({ key: 'vi_5525_cursed_piper_flute', name: 'Cursed Piper Flute', maxStack: 999, value: 1 });
// ---- 阶段 5:v_ 图块放置物品自动注册 + 掉落连线 ----
// 每个 v_ 图块注册 place_v_<key> 放置物品(tryPlace 走 vanilla style 帧语义);
// 无掉落的 v_ 图块 drop 连到该物品(破坏可回收再放置)。
import { TILE_DEFS } from './tiles';
for (const td of TILE_DEFS) {
    if (!td.key.startsWith('v_'))
        continue;
    const ik = 'place_' + td.key;
    if (byKey[ik] === undefined) {
        item({ key: ik, name: td.name, maxStack: 999, value: 1, tile: td.key });
    }
    // 掉落连线在读取端回退(World.breakTileAt),避免多模块实例下改写失效
}
void 0;
// ---- 阶段 5:生物群系草种子(种出对应草块)----
item({ key: 'corrupt_grass_seeds', name: '腐化草地种子', maxStack: 999, value: 1, tile: 'v_23_corrupt_grass_block' });
item({ key: 'crimson_grass_seeds', name: '猩红草地种子', maxStack: 999, value: 1, tile: 'v_199_crimson_grass_block' });
item({ key: 'jungle_grass_seeds', name: '丛林草地种子', maxStack: 999, value: 1, tile: 'v_60_jungle_grass_block' });
item({ key: 'mushroom_grass_seeds', name: '蘑菇草地种子', maxStack: 999, value: 1, tile: 'v_70_mushroom_grass_block' });
// ---- 阶段 5:原版物品全量注册(6146 件,图标走 atlas.vicon(id) 回退) ----
import vanillaItemMeta from '../../public/sprites/vanilla.json';
const _vim = vanillaItemMeta.items ?? {};
for (const [idStr, m] of Object.entries(_vim)) {
    if (!m || typeof m.key !== 'string' || !m.key)
        continue;
    const ik = 'vi_' + idStr + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
    if (byKey[ik] !== undefined)
        continue;
    item({ key: ik, name: m.name, maxStack: 999, value: 1 });
}
void 0;
// ---- 阶段 6:功能道具(桶三态/绳圈) ----
item({ key: 'empty_bucket', name: '空桶', maxStack: 99, value: 1, desc: '右键舀取液体' });
item({ key: 'water_bucket', name: '水桶', maxStack: 1, value: 1, desc: '右键放置水' });
item({ key: 'lava_bucket', name: '岩浆桶', maxStack: 1, value: 1, desc: '右键放置岩浆' });
item({ key: 'honey_bucket', name: '蜂蜜桶', maxStack: 1, value: 1, desc: '右键放置蜂蜜' });
// ---- 阶段 6 第三轮:替代矿工具链(官方数值,与铜/铁/银/金同档) ----
item({ key: 'tin_pickaxe', name: '锡镐', maxStack: 1, value: 400,
    tool: { type: 'pick', power: 35, damage: 4, speed: 23, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'tin_axe', name: '锡斧', maxStack: 1, value: 350,
    tool: { type: 'axe', power: 7, damage: 3, speed: 30, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'tin_sword', name: '锡剑', maxStack: 1, value: 450,
    tool: { type: 'sword', damage: 8, speed: 23, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'lead_pickaxe', name: '铅镐', maxStack: 1, value: 900,
    tool: { type: 'pick', power: 45, damage: 5, speed: 22, knockback: 2.5, reach: 2.6 * 16 } });
item({ key: 'lead_axe', name: '铅斧', maxStack: 1, value: 800,
    tool: { type: 'axe', power: 9, damage: 4, speed: 30, knockback: 5, reach: 2.4 * 16 } });
item({ key: 'lead_sword', name: '铅剑', maxStack: 1, value: 900,
    tool: { type: 'sword', damage: 10, speed: 23, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'tungsten_pickaxe', name: '钨镐', maxStack: 1, value: 1800,
    tool: { type: 'pick', power: 55, damage: 6, speed: 21, knockback: 2.5, reach: 2.6 * 16 } });
item({ key: 'tungsten_axe', name: '钨斧', maxStack: 1, value: 1600,
    tool: { type: 'axe', power: 11, damage: 5, speed: 29, knockback: 5.5, reach: 2.4 * 16 } });
item({ key: 'tungsten_sword', name: '钨剑', maxStack: 1, value: 1800,
    tool: { type: 'sword', damage: 13, speed: 22, knockback: 5.5, reach: 2.2 * 16 } });
item({ key: 'platinum_pickaxe', name: '铂金镐', maxStack: 1, value: 3600,
    tool: { type: 'pick', power: 59, damage: 7, speed: 20, knockback: 3, reach: 2.6 * 16 } });
item({ key: 'platinum_axe', name: '铂金斧', maxStack: 1, value: 3200,
    tool: { type: 'axe', power: 13, damage: 6, speed: 28, knockback: 6, reach: 2.4 * 16 } });
item({ key: 'platinum_sword', name: '铂金剑', maxStack: 1, value: 3600,
    tool: { type: 'sword', damage: 15, speed: 22, knockback: 6, reach: 2.2 * 16 } });
// ---- 阶段 6 第五轮:弓箭系统(官方数值 Item.cs:2996-3010:木弓伤4/UseTime30/射速6.1/击退0) ----
item({ key: 'wooden_bow', name: '木弓', maxStack: 1, value: 100,
    ranged: { damage: 4, speed: 30, knockback: 0, ammo: 'wooden_arrow', projSpeed: 6.1 } });
item({ key: 'wooden_arrow', name: '木箭', maxStack: 999, value: 1 });
item({ key: 'flaming_arrow', name: '燃烧箭', maxStack: 999, value: 1 });
item({ key: 'iron_bow', name: '铁弓', maxStack: 1, value: 360,
    ranged: { damage: 11, speed: 25, knockback: 1.5, ammo: 'wooden_arrow', projSpeed: 11 } });
// ---- 阶段 6 第六轮:矿车 ----
item({ key: 'minecart_item', name: '矿车', maxStack: 99, value: 1, desc: '右键轨道放置并骑乘' });
// ---- 阶段 6 第八轮:魔法武器(官方 Item.cs:30765-30778,火花法杖=ItemID 3069:伤14/魔力2/UseTime26/射速7/暴击10) ----
item({ key: 'wand_of_sparking', name: '火花法杖', maxStack: 1, value: 100,
    magic: { damage: 14, speed: 26, manaCost: 2, projSpeed: 7, proj: 'spark' } });
item({ key: 'amethyst_bolt', name: '紫晶法杖', maxStack: 1, value: 900,
    magic: { damage: 14, speed: 26, manaCost: 5, projSpeed: 9, proj: 'bolt' } });
// ---- 阶段 6 第九轮:Boss 召唤物(官方:蠕虫食物 70/血腥脊椎 1331/史莱姆王冠 560) ----
item({ key: 'worm_food', name: '蠕虫食物', maxStack: 20, value: 1, desc: '腐化之地使用:召唤世界吞噬者' });
item({ key: 'bloody_spine', name: '血腥脊椎', maxStack: 20, value: 1, desc: '猩红之地使用:召唤克苏鲁之脑' });
item({ key: 'slime_crown', name: '史莱姆王冠', maxStack: 20, value: 1, desc: '任意时刻:召唤史莱姆王' });
// ---- 电路工具(原版 530 电线/509,850,851,3612 扳手/510 剪线钳/849 致动器/3620 致动魔杖/3625 五彩扳手/3611 宏伟蓝图) ----
// 位掩码见 world/Wiring.ts TOOL_*。扳手消耗背包中的 wire(原版语义:找第一组 530 扣 1)
item({ key: 'wire', name: '电线', maxStack: 999, value: 1, desc: '四色扳手与宏伟蓝图的耗材' });
item({ key: 'red_wrench', name: '红扳手', maxStack: 1, value: 1, wireTool: { place: 1 }, desc: '左键铺红线(消耗电线)' });
item({ key: 'blue_wrench', name: '蓝扳手', maxStack: 1, value: 1, wireTool: { place: 2 }, desc: '左键铺蓝线(消耗电线)' });
item({ key: 'green_wrench', name: '绿扳手', maxStack: 1, value: 1, wireTool: { place: 4 }, desc: '左键铺绿线(消耗电线)' });
item({ key: 'yellow_wrench', name: '黄扳手', maxStack: 1, value: 1, wireTool: { place: 8 }, desc: '左键铺黄线(消耗电线)' });
item({ key: 'wire_cutter', name: '钢丝钳', maxStack: 1, value: 1, wireTool: { cutter: true }, desc: '左键剪线(优先级:致动器>黄>绿>蓝>红)' });
item({ key: 'actuator_item', name: '致动器', maxStack: 999, value: 1, wireTool: { place: 16 }, desc: '左键给方块装致动器,通电缩入' });
item({ key: 'actuation_rod', name: '致动魔杖', maxStack: 1, value: 1, wireTool: { rod: true }, desc: '左键手动翻转方块致动状态' });
item({ key: 'multicolor_wrench', name: '五彩扳手', maxStack: 1, value: 1, wireTool: { place: 15, grand: false }, desc: 'R 键切换模式(四色/剪线/致动器),左键单点' });
item({ key: 'grand_design', name: '宏伟蓝图', maxStack: 1, value: 1, wireTool: { place: 15, grand: true }, desc: '拖拽批量铺线(R 键切换模式)' });

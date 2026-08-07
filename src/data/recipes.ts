// 配方表。station: 'hand' | 'workbench' | 'furnace' | 'anvil'
export type Station = 'hand' | 'workbench' | 'furnace' | 'anvil';

export interface Recipe {
  out: string;          // 产物 item key
  count: number;
  station: Station;
  inputs: Array<[string, number]>; // [itemKey, 数量]
}

export const RECIPES: Recipe[] = [
  { out: 'workbench', count: 1, station: 'hand', inputs: [['wood', 10]] },
  { out: 'torch', count: 3, station: 'hand', inputs: [['wood', 1], ['gel', 1]] },
  { out: 'platform', count: 2, station: 'workbench', inputs: [['wood', 1]] },
  { out: 'door', count: 1, station: 'workbench', inputs: [['wood', 6]] },
  { out: 'chest', count: 1, station: 'workbench', inputs: [['wood', 8], ['iron_bar', 2]] },
  { out: 'furnace', count: 1, station: 'workbench', inputs: [['stone_block', 20], ['wood', 4], ['torch', 3]] },
  { out: 'wood_pickaxe', count: 1, station: 'workbench', inputs: [['wood', 12]] },
  { out: 'wood_axe', count: 1, station: 'workbench', inputs: [['wood', 9]] },
  { out: 'wood_sword', count: 1, station: 'workbench', inputs: [['wood', 7]] },
  // 熔炼
  { out: 'copper_bar', count: 1, station: 'furnace', inputs: [['copper_ore', 3]] },
  { out: 'iron_bar', count: 1, station: 'furnace', inputs: [['iron_ore', 3]] },
  { out: 'silver_bar', count: 1, station: 'furnace', inputs: [['silver_ore', 4]] },
  { out: 'gold_bar', count: 1, station: 'furnace', inputs: [['gold_ore', 4]] },
  { out: 'anvil', count: 1, station: 'workbench', inputs: [['iron_bar', 5]] },
  // 金属工具链
  { out: 'copper_pickaxe', count: 1, station: 'anvil', inputs: [['copper_bar', 8], ['wood', 3]] },
  { out: 'copper_axe', count: 1, station: 'anvil', inputs: [['copper_bar', 6], ['wood', 3]] },
  { out: 'copper_sword', count: 1, station: 'anvil', inputs: [['copper_bar', 7]] },
  { out: 'iron_pickaxe', count: 1, station: 'anvil', inputs: [['iron_bar', 8], ['wood', 3]] },
  { out: 'iron_axe', count: 1, station: 'anvil', inputs: [['iron_bar', 6], ['wood', 3]] },
  { out: 'iron_sword', count: 1, station: 'anvil', inputs: [['iron_bar', 7]] },
  { out: 'wood_hammer', count: 1, station: 'workbench', inputs: [['wood', 8]] },
  { out: 'iron_hammer', count: 1, station: 'anvil', inputs: [['iron_bar', 6], ['wood', 3]] },
  { out: 'silver_pickaxe', count: 1, station: 'anvil', inputs: [['silver_bar', 8], ['wood', 3]] },
  { out: 'silver_sword', count: 1, station: 'anvil', inputs: [['silver_bar', 7]] },
  { out: 'gold_pickaxe', count: 1, station: 'anvil', inputs: [['gold_bar', 8], ['wood', 3]] },
  { out: 'gold_sword', count: 1, station: 'anvil', inputs: [['gold_bar', 7]] },
  // 盔甲（铁砧）
  { out: 'copper_helmet', count: 1, station: 'anvil', inputs: [['copper_bar', 15]] },
  { out: 'copper_chainmail', count: 1, station: 'anvil', inputs: [['copper_bar', 20]] },
  { out: 'copper_greaves', count: 1, station: 'anvil', inputs: [['copper_bar', 15]] },
  { out: 'iron_helmet', count: 1, station: 'anvil', inputs: [['iron_bar', 20]] },
  { out: 'iron_chainmail', count: 1, station: 'anvil', inputs: [['iron_bar', 25]] },
  { out: 'iron_greaves', count: 1, station: 'anvil', inputs: [['iron_bar', 20]] },
  { out: 'silver_helmet', count: 1, station: 'anvil', inputs: [['silver_bar', 15]] },
  { out: 'silver_chainmail', count: 1, station: 'anvil', inputs: [['silver_bar', 20]] },
  { out: 'silver_greaves', count: 1, station: 'anvil', inputs: [['silver_bar', 15]] },
  { out: 'gold_helmet', count: 1, station: 'anvil', inputs: [['gold_bar', 10]] },
  { out: 'gold_chainmail', count: 1, station: 'anvil', inputs: [['gold_bar', 15]] },
  { out: 'gold_greaves', count: 1, station: 'anvil', inputs: [['gold_bar', 10]] },
  // 杂项
  { out: 'suspicious_eye', count: 1, station: 'workbench', inputs: [['lens', 6]] },
  { out: 'lesser_healing_potion', count: 1, station: 'workbench', inputs: [['gel', 2], ['mushroom_item', 1]] },
  // 药水链（移植自 Maples 合成表 + 扩展）
  { out: 'heal_potion', count: 1, station: 'workbench', inputs: [['lesser_healing_potion', 2], ['gel', 1]] },
  { out: 'regen_potion', count: 1, station: 'workbench', inputs: [['gel', 2], ['mushroom_item', 2]] },
  { out: 'agility_potion', count: 1, station: 'workbench', inputs: [['mushroom_item', 1], ['iron_bar', 1]] },
  { out: 'ironskin_potion', count: 1, station: 'workbench', inputs: [['stone_block', 5], ['iron_bar', 1]] },
  { out: 'thorns_potion', count: 1, station: 'workbench', inputs: [['wood', 5], ['lens', 1]] },
  // ---- 原版素材批次：方块 / 家具 / 熔炼 ----
  // 替代矿熔炼
  { out: 'tin_bar', count: 1, station: 'furnace', inputs: [['tin_ore', 3]] },
  { out: 'lead_bar', count: 1, station: 'furnace', inputs: [['lead_ore', 3]] },
  { out: 'tungsten_bar', count: 1, station: 'furnace', inputs: [['tungsten_ore', 4]] },
  { out: 'platinum_bar', count: 1, station: 'furnace', inputs: [['platinum_ore', 4]] },
  // 方块加工
  { out: 'glass', count: 1, station: 'furnace', inputs: [['sand_block', 2]] },
  { out: 'gray_brick', count: 2, station: 'furnace', inputs: [['stone_block', 2]] },
  { out: 'red_brick', count: 2, station: 'furnace', inputs: [['clay_block', 2]] },
  { out: 'sandstone_block', count: 1, station: 'furnace', inputs: [['sand_block', 4]] },
  { out: 'ice_brick', count: 1, station: 'furnace', inputs: [['ice_block', 1]] },
  { out: 'snow_brick', count: 1, station: 'furnace', inputs: [['snow_block', 1]] },
  // 家具
  { out: 'table', count: 1, station: 'workbench', inputs: [['wood', 8]] },
  { out: 'chair', count: 1, station: 'workbench', inputs: [['wood', 4]] },
  { out: 'bed', count: 1, station: 'workbench', inputs: [['wood', 15]] },
  { out: 'bookcase', count: 1, station: 'workbench', inputs: [['wood', 20]] },
  { out: 'grandfather_clock', count: 1, station: 'workbench', inputs: [['wood', 10], ['iron_bar', 3]] },
  { out: 'piano', count: 1, station: 'workbench', inputs: [['wood', 15], ['iron_bar', 2]] },
  { out: 'dresser', count: 1, station: 'workbench', inputs: [['wood', 12]] },
  { out: 'bench', count: 1, station: 'workbench', inputs: [['wood', 8]] },
  { out: 'bathtub', count: 1, station: 'workbench', inputs: [['clay_block', 6]] },
  { out: 'keg', count: 1, station: 'workbench', inputs: [['wood', 14]] },
  { out: 'cooking_pot', count: 1, station: 'workbench', inputs: [['iron_bar', 2], ['wood', 4]] },
  { out: 'clay_pot', count: 1, station: 'workbench', inputs: [['clay_block', 5]] },
  { out: 'tombstone', count: 1, station: 'workbench', inputs: [['stone_block', 5]] },
  // 灯具
  { out: 'candle', count: 4, station: 'workbench', inputs: [['torch', 1], ['gel', 1]] },
  { out: 'chandelier', count: 1, station: 'anvil', inputs: [['torch', 4], ['iron_bar', 3]] },
  { out: 'lantern', count: 1, station: 'anvil', inputs: [['torch', 1], ['iron_bar', 1]] },
  { out: 'candelabra', count: 1, station: 'anvil', inputs: [['torch', 3], ['iron_bar', 1]] },
  { out: 'chinese_lantern', count: 1, station: 'workbench', inputs: [['torch', 1], ['wood', 3]] },
  { out: 'skull_lantern', count: 1, station: 'anvil', inputs: [['torch', 2], ['iron_bar', 1]] },
];

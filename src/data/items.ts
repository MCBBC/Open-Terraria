// 物品注册表
export type ToolType = 'pick' | 'axe' | 'sword' | 'hammer';
// Buff 类型（药水饮用后生效）
export type PotionBuff = 'agility' | 'ironskin' | 'resistance' | 'thorns' | 'regen';

export interface ItemDef {
  key: string;
  name: string;
  maxStack: number;
  tile?: string;          // 放置的 tile key
  wall?: string;          // 放置的 wall key
  tool?: {
    type: ToolType;
    power?: number;       // 工具力（镐/斧/锤）
    damage?: number;      // 武器伤害
    speed?: number;       // 使用间隔 tick
    knockback?: number;
    reach?: number;       // 攻击/作用半径（px）
  };
  heal?: number;          // 食用/饮用回复
  potion?: {
    buff: PotionBuff;
    duration: number;     // 秒
    isHealType: boolean;  // 受"耐药性"封锁
  };
  accessory?: 'lucky_horseshoe' | 'feral_claws'; // 配饰效果
  value?: number;         // 钱币价值（铜币）
  desc?: string;
}

export const ITEM_DEFS: ItemDef[] = [];
const byKey: Record<string, number> = {};
export const ITEM_BY_KEY: Record<string, number> = byKey;

function item(d: Partial<ItemDef> & { key: string; name: string }) {
  byKey[d.key] = ITEM_DEFS.length;
  ITEM_DEFS.push({ maxStack: 999, ...d } as ItemDef);
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

// ---- 药水（Buff 来源，数值移植自 Maples Potions/*.asset）----
item({ key: 'heal_potion', name: '治疗药水', maxStack: 30, heal: 80, desc: '回复 80 生命',
  potion: { buff: 'resistance', duration: 60, isHealType: true } });
item({ key: 'agility_potion', name: '敏捷药水', maxStack: 30, desc: '移速 +25%，持续 3 分钟',
  potion: { buff: 'agility', duration: 180, isHealType: false } });
item({ key: 'ironskin_potion', name: '铁皮药水', maxStack: 30, desc: '防御 +6，持续 3 分钟',
  potion: { buff: 'ironskin', duration: 180, isHealType: false } });
item({ key: 'thorns_potion', name: '荆棘药水', maxStack: 30, desc: '受击反弹 2 伤害，持续 3 分钟',
  potion: { buff: 'thorns', duration: 180, isHealType: false } });
item({ key: 'regen_potion', name: '恢复药水', maxStack: 30, desc: '每 5 秒回复 10 生命，持续 30 秒',
  potion: { buff: 'regen', duration: 30, isHealType: true } });

// ---- 配饰（移植自 Maples Accessory）----
item({ key: 'lucky_horseshoe', name: '幸运马掌', maxStack: 1, accessory: 'lucky_horseshoe',
  desc: '免疫摔落伤害' });
item({ key: 'feral_claws', name: '猛爪手套', maxStack: 1, accessory: 'feral_claws',
  desc: '近战攻速 ×2，伤害 +5' });

// ---- 工具（power：镐力/斧力；damage：武器伤害）----
const tiers: Array<[string, string, number, number, number]> = [
  // key 前缀, 显示前缀, 颜色档, 镐力, 斧力
  ['wood', '木', 0, 10, 15],
  ['copper', '铜', 1, 30, 40],
  ['iron', '铁', 2, 45, 55],
  ['silver', '银', 3, 60, 70],
  ['gold', '金', 4, 80, 90],
];
const swordDmg = [8, 12, 16, 21, 27];
for (const [prefix, cn, tier, pickP, axeP] of tiers) {
  item({
    key: `${prefix}_pickaxe`, name: `${cn}镐`, maxStack: 1,
    tool: { type: 'pick', power: pickP, speed: 46, reach: 2.6 * 16 },
  });
  item({
    key: `${prefix}_axe`, name: `${cn}斧`, maxStack: 1,
    tool: { type: 'axe', power: axeP, speed: 50, reach: 2.4 * 16 },
  });
  item({
    key: `${prefix}_sword`, name: `${cn}剑`, maxStack: 1,
    tool: { type: 'sword', damage: swordDmg[tier], speed: 42, knockback: 3.5, reach: 2.2 * 16 },
  });
  item({
    key: `${prefix}_hammer`, name: `${cn}锤`, maxStack: 1,
    tool: { type: 'hammer', power: pickP, speed: 48, reach: 2.4 * 16 },
    desc: '敲除背景墙',
  });
}

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
item({ key: 'rope', name: '攀爬绳', maxStack: 999, desc: '用于垂降（待实装）', value: 1 });

export interface ItemStack { id: number; stack: number; }
export function mkStack(key: string, stack = 1): ItemStack | null {
  const id = byKey[key];
  if (id === undefined) return null;
  return { id, stack };
}

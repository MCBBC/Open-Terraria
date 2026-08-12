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
   *  vanilla-wallitems.json 全量 124 项（tools/extract-wallitems.mjs 提取） */
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
  };
  /** 副工具力（Hamaxe 系双工具：主 tool.type 外的另一力，挖掘入口按主类型判定） */
  axePower?: number;
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
item({ key: 'mushroom_item', name: '蘑菇', heal: 15, value: 1,
  // 原版 item 5（Item.cs:1424）：useStyle 2 咀嚼、healLife 15、potion=true（触发药水病）
  potion: { buff: 'resistance', duration: 60, isHealType: true } });
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
item({ key: 'lesser_healing_potion', name: '弱效治疗药水', heal: 50, maxStack: 30,
  // 原版 188 治疗药水族（DefaultToHealingPotion）：useStyle 9 举杯、potion=true
  potion: { buff: 'resistance', duration: 60, isHealType: true } });
item({ key: 'coin_copper', name: '铜币', maxStack: 999, value: 1 });
item({ key: 'coin_silver', name: '银币', maxStack: 999, value: 100 });
item({ key: 'coin_gold', name: '金币', maxStack: 999, value: 10000 });
item({ key: 'coin_platinum', name: '铂金币', maxStack: 999, value: 1000000, vid: 73 }); // 金币雨（WorldGen.cs:71848）

// ---- 药水（Buff 来源;buffType/buffTime 对齐 1456 Item.cs case 288-305）----
// 时长换算:buffTime/60 = 秒(Regeneration/Swiftness/Ironskin/Thorns 均 28800t=480s=8min)
item({ key: 'heal_potion', name: '治疗药水', maxStack: 30, heal: 100, desc: '回复 100 生命',
  potion: { buff: 'resistance', duration: 60, isHealType: true } });
item({ key: 'agility_potion', name: '敏捷药水', maxStack: 30, desc: '移速 +25%，持续 8 分钟',
  potion: { buff: 'agility', duration: 480, isHealType: false } });
item({ key: 'ironskin_potion', name: '铁皮药水', maxStack: 30, desc: '防御 +8，持续 8 分钟',
  potion: { buff: 'ironskin', duration: 480, isHealType: false } });
item({ key: 'thorns_potion', name: '荆棘药水', maxStack: 30, desc: '受击反弹全额接触伤害，持续 8 分钟',
  potion: { buff: 'thorns', duration: 480, isHealType: false } });
item({ key: 'regen_potion', name: '恢复药水', maxStack: 30, desc: '每秒回复 2 生命，持续 8 分钟',
  // 原版 Regeneration Potion 是 buff 药水(heal=0),不触发 PotionSickness → isHealType:false
  potion: { buff: 'regen', duration: 480, isHealType: false } });
// ---- 药水 buff 族第二批（Item.cs case 288/291/293/294/295/302/303 buffTime/60 = 秒）----
item({ key: 'obsidian_skin_potion', name: '黑曜石皮药水', maxStack: 30, desc: '免疫岩浆与灼烧，持续 6 分钟',
  potion: { buff: 'obsidianSkin', duration: 360, isHealType: false } });   // 21600t
item({ key: 'gills_potion', name: '鱼鳃药水', maxStack: 30, desc: '可在水下呼吸，持续 4 分钟',
  potion: { buff: 'gills', duration: 240, isHealType: false } });          // 14400t
item({ key: 'mana_regen_potion', name: '魔力再生药水', maxStack: 30, desc: '大幅提升魔力恢复，持续 8 分钟',
  potion: { buff: 'manaRegen', duration: 480, isHealType: false } });      // 28800t
item({ key: 'magic_power_potion', name: '魔法力量药水', maxStack: 30, desc: '魔法伤害 +20%，持续 4 分钟',
  potion: { buff: 'magicPower', duration: 240, isHealType: false } });     // 14400t
item({ key: 'featherfall_potion', name: '羽落药水', maxStack: 30, desc: '减缓下落速度，持续 10 分钟',
  potion: { buff: 'featherfall', duration: 600, isHealType: false } });    // 36000t
item({ key: 'water_walking_potion', name: '水上行走药水', maxStack: 30, desc: '可在水面行走，持续 10 分钟',
  potion: { buff: 'waterWalking', duration: 600, isHealType: false } });   // 36000t
item({ key: 'archery_potion', name: '射手药水', maxStack: 30, desc: '箭伤害 ×1.1，持续 8 分钟',
  potion: { buff: 'archery', duration: 480, isHealType: false } });        // 28800t
item({ key: 'night_owl_potion', name: '夜枭药水', maxStack: 30, desc: '改善黑暗与水下视觉，持续 10 分钟',
  potion: { buff: 'nightOwl', duration: 600, isHealType: false } });       // 36000t(Item 299→buff 12)

// ---- 配饰（移植自 Maples Accessory）----
item({ key: 'lucky_horseshoe', name: '幸运马掌', maxStack: 1, accessory: 'lucky_horseshoe',
  desc: '免疫摔落伤害' });
item({ key: 'feral_claws', name: '猛爪手套', maxStack: 1, accessory: 'feral_claws',
  desc: '近战攻速 ×2，伤害 +5' });

// ---- 盔甲（铜/铁/银/金三件套，防御取原版）----
const armorTiers: Array<[string, string, [number, number, number]]> = [
  // key 前缀, 显示前缀, [头盔, 胸甲, 胫甲] 防御
  ['copper', '铜', [1, 2, 1]],
  ['iron', '铁', [2, 3, 2]],
  ['silver', '银', [3, 4, 3]],
  ['gold', '金', [4, 5, 4]],
];
const armorParts: Array<[string, string, ArmorSlot]> = [
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
  tool: { type: 'pick', power: 12, damage: 2, speed: 23, useTime: 17, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'wood_axe', name: '木斧', maxStack: 1, value: 50,
  tool: { type: 'axe', power: 4, damage: 2, speed: 30, useTime: 22, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'wood_sword', name: '木剑', maxStack: 1, value: 100,
  tool: { type: 'sword', damage: 7, speed: 25, useTime: 25, knockback: 4, reach: 2.2 * 16 } });
item({ key: 'wood_hammer', name: '木锤', maxStack: 1, value: 50,
  tool: { type: 'hammer', power: 25, damage: 2, speed: 37, useTime: 25, knockback: 5.5, reach: 2.4 * 16 },
  desc: '敲除背景墙' });
// 铜（3509/3506/3508/3505）
item({ key: 'copper_pickaxe', name: '铜镐', maxStack: 1, value: 500,
  tool: { type: 'pick', power: 35, damage: 4, speed: 23, useTime: 15, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'copper_axe', name: '铜斧', maxStack: 1, value: 400,
  tool: { type: 'axe', power: 7, damage: 3, speed: 30, useTime: 21, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'copper_sword', name: '铜剑', maxStack: 1, value: 450,
  tool: { type: 'sword', damage: 8, speed: 23, useTime: 23, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'copper_hammer', name: '铜锤', maxStack: 1, value: 400,
  tool: { type: 'hammer', power: 35, damage: 4, speed: 33, useTime: 23, knockback: 5.5, reach: 2.4 * 16 },
  desc: '敲除背景墙' });
// 铁（1/10/4/7）
item({ key: 'iron_pickaxe', name: '铁镐', maxStack: 1, value: 2000,
  tool: { type: 'pick', power: 40, damage: 5, speed: 20, useTime: 13, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'iron_axe', name: '铁斧', maxStack: 1, value: 1600,
  tool: { type: 'axe', power: 9, damage: 5, speed: 27, useTime: 19, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'iron_sword', name: '铁剑', maxStack: 1, value: 1800,
  tool: { type: 'sword', damage: 10, speed: 21, useTime: 20, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'iron_hammer', name: '铁锤', maxStack: 1, value: 1600,
  tool: { type: 'hammer', power: 40, damage: 7, speed: 30, useTime: 20, knockback: 5.5, reach: 2.4 * 16 },
  desc: '敲除背景墙' });
// 银（3515/3512/3514/3511）
item({ key: 'silver_pickaxe', name: '银镐', maxStack: 1, value: 5000,
  tool: { type: 'pick', power: 45, damage: 6, speed: 19, useTime: 11, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'silver_axe', name: '银斧', maxStack: 1, value: 4000,
  tool: { type: 'axe', power: 10, damage: 6, speed: 26, useTime: 18, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'silver_sword', name: '银剑', maxStack: 1, value: 4500,
  tool: { type: 'sword', damage: 11, speed: 21, useTime: 20, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'silver_hammer', name: '银锤', maxStack: 1, value: 4000,
  tool: { type: 'hammer', power: 45, damage: 9, speed: 29, useTime: 19, knockback: 5.5, reach: 2.4 * 16 },
  desc: '敲除背景墙' });
// 金（3521/3518/3520/3517）
item({ key: 'gold_pickaxe', name: '金镐', maxStack: 1, value: 10000,
  tool: { type: 'pick', power: 55, damage: 6, speed: 20, useTime: 17, knockback: 2, reach: 2.6 * 16 } });
item({ key: 'gold_axe', name: '金斧', maxStack: 1, value: 8000,
  tool: { type: 'axe', power: 11, damage: 7, speed: 26, useTime: 18, knockback: 4.5, reach: 2.4 * 16 } });
item({ key: 'gold_sword', name: '金剑', maxStack: 1, value: 9000,
  tool: { type: 'sword', damage: 13, speed: 20, useTime: 20, knockback: 5, reach: 2.2 * 16 } });
item({ key: 'gold_hammer', name: '金锤', maxStack: 1, value: 8000,
  tool: { type: 'hammer', power: 55, damage: 9, speed: 28, useTime: 23, knockback: 5.5, reach: 2.4 * 16 },
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
// 上限扩容三件套（Player.cs:44655-44700 ItemCheck_Use*；vi_ 前缀自动映射原版图标）
item({ key: 'vi_109_mana_crystal', name: '魔力水晶', maxStack: 99, desc: '使用：魔力上限 +20（上限 200）' });
item({ key: 'vi_1291_life_fruit', name: '生命果', maxStack: 99, desc: '生命上限 ≥400 时使用：+5（上限 500）' });
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

export interface ItemStack { id: number; stack: number; }
export function mkStack(key: string, stack = 1): ItemStack | null {
  const id = byKey[key];
  if (id === undefined) return null;
  return { id, stack };
}

// ===================== wld 导入补全物品（compat-report 驱动） =====================
// 这些物品目前只做图标与存档保留（占位），后续按需实装功能
item({ key: 'vi_2350_recall_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_188_healing_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_282_glowstick', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_41_flaming_arrow', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_167_dynamite', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_279_throwing_knife', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_51_jester_s_arrow', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_19_gold_bar', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_302_water_walking_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_305_gravitation_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_43_suspicious_looking_eye', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_296_spelunker_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_299_night_owl_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_965_rope', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_303_archery_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_304_hunter_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_50_magic_mirror', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_42_shuriken', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_295_featherfall_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_53_cloud_in_a_bottle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2329_dangersense_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_40_wooden_arrow', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_975_shoe_spikes', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_54_hermes_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_301_thorns_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_49_band_of_regeneration', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2326_titan_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_297_invisibility_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_166_bomb', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5011_mace', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4425_shark_bait', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2351_teleportation_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4460_sandcastle_bucket', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_168_grenade', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_227_restoration_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_930_flare_gun', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_931_flare', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_997_extractinator', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_52_angel_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_265_hellfire_arrow', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_298_shine_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5007_dead_man_s_sweater', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_117_meteorite_bar', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_186_breathing_reed', name: '', maxStack: 999, value: 1 });
// ---- 呼吸族（CheckDrowning 装备链，2026-08 补齐；stats/装备归属/图标全走 vanilla 数据自动接线）----
item({ key: 'vi_250_fish_bowl', name: '', maxStack: 999, value: 1 });            // 鱼缸头盔：戴着恒淹（:22917）
item({ key: 'vi_4275_gold_goldfish_bowl', name: '', maxStack: 999, value: 1 });  // 金金鱼缸：同上
item({ key: 'vi_268_diving_helmet', name: '', maxStack: 999, value: 1 });        // accDivingHelm：breathCDMax ×6（:12829）
item({ key: 'vi_394_diving_gear', name: '', maxStack: 999, value: 1 });          // 潜水装备：divingHelm+flipper（:14652）
item({ key: 'vi_1860_jellyfish_diving_gear', name: '', maxStack: 999, value: 1 }); // :14689（浸水发光 :14686）
item({ key: 'vi_1861_arctic_diving_gear', name: '', maxStack: 999, value: 1 });  // :14701（+arcticDivingGear 冰水免疫）
item({ key: 'vi_497_neptune_s_shell', name: '', maxStack: 999, value: 1 });      // accMerman（:15019）
item({ key: 'vi_861_moon_shell', name: '', maxStack: 999, value: 1 });           // accMerman+狼人夜变（:14587）
item({ key: 'vi_3110_celestial_shell', name: '', maxStack: 999, value: 1 });     // accMerman+狼人夜变（:14855）
item({ key: 'vi_329_shadow_key', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_974_ice_torch', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2322_mining_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4915_tungsten_bullet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_946_umbrella', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_939_web_slinger', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4870_potion_of_return', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_288_obsidian_skin_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_31_bottle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_211_feral_claws', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4404_inner_tube', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_187_flipper', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2198_ice_machine', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_274_dark_lance', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_285_aglet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_213_staff_of_regrowth', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_964_boomstick', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1293_lihzahrd_power_cell', name: '', maxStack: 999, value: 1 });
// 旧日军团三件（ItemID.cs：3817 奖牌 / 3822 埃特尼亚魔力 / 3828 永恒水晶）无需手工
// 注册——下方 vanilla.json 自动注册循环已建 vi_<id>_<PascalKey> 条目；
// Game 侧按原版 id 寻物（slotVanillaId），见 useLihzahrdAltar/useEterniaStand。
item({ key: 'vi_2195_lihzahrd_furnace', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2766_solar_tablet_fragment', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_300_battle_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2348_inferno_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_218_flamelash', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3019_hellwing_bow', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_112_flower_of_fire', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_220_sunfury', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4345_can_of_worms', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_953_climbing_claws', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3069_wand_of_sparking', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_212_anklet_of_the_wind', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2204_honey_dispenser', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_277_trident', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_863_water_walking_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_751_cloud', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_155_muramasa', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_289_regeneration_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_906_lava_charm', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4055_dunerider_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_724_ice_blade', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_670_ice_boomerang', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4061_storm_spear', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_987_blizzard_in_a_bottle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4551_slice_of_hell_cake', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5010_treasure_magnet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2323_heartreach_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2345_lifeforce_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_290_swiftness_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_291_gills_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_280_spear', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2325_builder_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_284_wooden_boomerang', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2192_bone_welder', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5234_remnants_of_devotion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_156_cobalt_shield', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_157_aqua_scepter', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_163_blue_moon', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_113_magic_missile', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3317_valor', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_327_golden_key', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_164_handgun', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_294_magic_power_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4263_magic_conch', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4062_thunder_zapper', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1579_flurry_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4056_ancient_chisel', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4346_encumbering_stone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1319_snowball_cannon', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3199_ice_mirror', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_950_ice_skates', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4443_demonic_hellcart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4737_ornate_shadow_key', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4276_bast_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4262_snake_charmer_s_flute', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3093_herb_bag', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_292_ironskin_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3084_radar', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4341_step_stool', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4978_fledgling_wings', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2197_sky_mill', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_158_lucky_horseshoe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5254_blessing_from_the_heavens', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1156_piranha_gun', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1571_scourge_of_the_corruptor', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1260_rainbow_gun', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1572_staff_of_the_frost_hydra', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4607_desert_tiger_staff', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_933_leaf_wand', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_832_living_wood_wand', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4066_desert_minecart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4450_shroom_minecart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4423_scarab_bomb', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_159_shiny_red_balloon', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5258_see_the_world_for_what_it_is', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_65_starfury', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5388_eye_of_the_sun', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2219_celestial_magnet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5255_love_is_in_the_trash_slot', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4426_bee_minecart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3017_flower_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3360_living_mahogany_wand', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3361_rich_mahogany_leaf_wand', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1309_slime_staff', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1845_necromantic_scroll', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1864_papyrus_scarab', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1158_pygmy_necklace', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3034_coin_ring', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_308_moonglow_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 1 });
item({ key: 'vi_312_fireblossom_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 5 });
item({ key: 'vi_310_deathweed_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 4 });
item({ key: 'vi_307_daybloom_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 0 });
item({ key: 'vi_309_blinkroot_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 2 });
item({ key: 'vi_2357_shiverthorn_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 6 });
item({ key: 'vi_311_waterleaf_seeds', name: '', maxStack: 999, value: 1, tile: 'v_83_herbs_mature', placeStyle: 3 });
item({ key: 'vi_1828_pumpkin_seed', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_126_bottled_water', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1134_bottled_honey', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3068_guide_to_plant_fiber_cordage', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4779_mushroom_hat', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4780_mushroom_vest', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4781_mushroom_pants', name: '', maxStack: 999, value: 1 });

// ===================== FTW_V2 补全物品（占位收集品） =====================
item({ key: 'vi_678_red_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_281_blowpipe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_293_mana_regeneration_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2767_solar_tablet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3213_money_trough', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2757_vortex_helmet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4989_soaring_insignia', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3383_stardust_leggings', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4914_kaleidoscope', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1991_bug_net', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4828_superheated_blood', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3509_copper_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3507_copper_shortsword', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4755_grox_the_great_s_horned_cowl', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4756_grox_the_great_s_chestplate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4757_grox_the_great_s_greaves', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5000_terraspark_boots', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5339_arcane_crystal', name: '', maxStack: 999, value: 1 });
// 永久幸运消耗品（Player.cs:44786-44789：一次性 usedGalaxyPearl → luck +0.03 :28676-28678）
item({ key: 'vi_5340_galaxy_pearl', name: '', maxStack: 999, value: 1 });
// 漂亮镜子（Item 5577：投掷消耗品，shoot 1085；碎裂近身 150px → brokenMirrorBadLuckTime
// 25200，Projectile.cs:67554-67574）——投掷走 thrownCombat 通用管线
item({ key: 'vi_5577_pretty_mirror', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5391_uncumbering_stone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2585_slime_hook', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_313_daybloom', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_267_guide_voodoo_doll', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2649_steampunk_candle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_286_sticky_glowstick', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3002_spelunker_glowstick', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4819_demon_conch', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1802_raven_staff', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3382_stardust_plate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3270_item_frame', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3771_ancient_horn', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4281_finch_staff', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5407_star_royale_brick', name: '', maxStack: 999, value: 1, tile: 'v_675_star_royale_brick' });
item({ key: 'vi_5401_lunar_rust_brick', name: '', maxStack: 999, value: 1, tile: 'v_669_lunar_rust_brick' });
// 月相砖族补全（3461 微光转化目标，ItemID.cs:5401-5408;★曾缺 5402/5406/5408 →
// 转化到这三相静默丢物;tile 744-751? 见 vanilla sheet 注册——砖块放置链按需接）
item({ key: 'vi_5402_dark_celestial_brick', name: '', maxStack: 999, value: 1, tile: 'v_670_dark_celestial_brick' });
item({ key: 'vi_5406_mercury_brick', name: '', maxStack: 999, value: 1, tile: 'v_674_mercury_brick' });
item({ key: 'vi_5408_heavenforge_brick', name: '', maxStack: 999, value: 1, tile: 'v_676_heavenforge_brick' });
item({ key: 'vi_4716_mollusk_whistle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3540_phantasm', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2176_shroomite_digging_claw', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2349_wrath_potion', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4679_morning_star', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1169_bone_key', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3863_betsy_mask', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3124_cell_phone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3506_copper_axe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4680_dark_harvest', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_543_brown_pressure_plate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_171_sign', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1723_living_wood_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4754_grox_the_great_s_wings', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3353_mechanical_cart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2287_winter_cape', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1179_chlorophyte_bullet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4766_world_globe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4954_celestial_starboard', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4730_ghostar_s_infinity_eight', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4758_blade_staff', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4765_tree_globe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5342_ambrosia', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5328_chest_lock', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5343_peddler_s_satchel', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5285_moon_globe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5289_minecart_upgrade_kit', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5336_advanced_combat_techniques_volume_two', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5451_kwad_racer_drone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5359_shellphone_spawn', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3032_super_absorbant_sponge', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3031_bottomless_water_bucket', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_509_red_wrench', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4741_butcher_s_bloodstained_apron', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3065_star_wrath', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3063_meowmere', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3372_lunatic_cultist_mask', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1504_spectre_robe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2769_cosmic_car_key', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_216_shackle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4415_stone_door', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1681_skeleton_banner', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_283_seed', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1173_grave_marker', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4379_wyvern_kite', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4378_xenon_moss', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4377_krypton_moss', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4376_rat_cage', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4375_rat', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4484_1_2_second_timer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4824_wet_bomb', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4485_1_4_second_timer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5378_cursed_flare', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5354_reflective_shades', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5387_raynbro_s_pants', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5386_raynbro_s_hoodie', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5390_raynbro_s_hood', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5338_aegis_fruit', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5404_cosmic_ember_brick', name: '', maxStack: 999, value: 1, tile: 'v_672_cosmic_ember_brick' });
item({ key: 'vi_5405_cryocore_brick', name: '', maxStack: 999, value: 1, tile: 'v_673_cryocore_brick' });
item({ key: 'vi_5403_astra_brick', name: '', maxStack: 999, value: 1, tile: 'v_671_astra_brick' });
item({ key: 'vi_346_safe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4829_cat_license', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3335_demon_heart', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4750_foodbarbarian_s_tattered_dragon_wings', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3042_phase_dye', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3024_skiphs_blood', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3054_shadowflame_knife', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5275_joja_cola', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5278_pomegranate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5277_spicy_pepper', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5437_shellphone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1507_spectre_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2250_steampunk_chest', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_392_glass_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2699_weapon_rack', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3552_blue_flame_and_silver_dye', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5005_terraprisma', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4604_exotic_chew_toy', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4611_world_feeder_kite', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4649_blue_jellyfish_kite', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4796_dark_mage_s_tome', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4553_plasma_lamp', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4365_celestial_wand', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_331_jungle_spores', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2430_slimy_saddle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4956_zenith', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2798_laser_drill', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2814_martian_chest', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_210_vine', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4371_yellow_kite', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4291_lemon', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2493_king_slime_mask', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1919_sugar_cookie', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1912_eggnog', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4023_grapes', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4792_the_black_spot', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3066_smooth_marble_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1103_slush_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2119_stone_slab', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_593_snow_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3081_marble_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1111_blue_berries', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1115_red_husk', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_217_molten_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_122_molten_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1827_bladed_glove', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2263_white_dynasty_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_330_obsidian_brick_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2433_stone_slab_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_452_hornet_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_453_bomb_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_360_armor_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3711_wraith_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_438_star_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_446_skeleton_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_458_cross_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3655_scorpion_statue', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_328_shadow_chest', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2196_living_loom', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_916_shadewood_work_bench', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_35_iron_anvil', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_36_work_bench', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3240_tall_gate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_337_red_banner', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3381_stardust_helmet', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1765_vampire_pants', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2859_lunar_cultist_robe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2857_lunar_cultist_hood', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2998_summoner_emblem', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1175_headstone', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_25_wooden_door', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_46_light_s_bane', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2340_minecart_track', name: '', maxStack: 999, value: 1 });
// 轨道族放置物（Minecart.PlaceTrack style：0 普通 / 1 压板(2492) / 2 左加速(2739)）。
// key 沿用全量注册的 vanilla.json 命名（vi_<id>_<key>），只补 tile/placeStyle
item({ key: 'vi_2492_PressureTrack', name: '', maxStack: 999, value: 1, tile: 'v_314_minecart_track', placeStyle: 1 });
item({ key: 'vi_2739_BoosterTrack', name: '', maxStack: 999, value: 1, tile: 'v_314_minecart_track', placeStyle: 2 });
item({ key: 'vi_498_mannequin', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4721_mushroom_beam', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_819_living_wood_door', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1458_obsidian_door', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3763_0x33_s_aviators', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_176_mud_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1569_vampire_knives', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_857_sandstorm_in_a_bottle', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_2292_fiberglass_fishing_pole', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5238_constellation', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_753_seaweed', name: '', maxStack: 999, value: 1 });
// FTW_V2 物品补全（第二轮）
item({ key: 'vi_3_stone_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_94_wood_platform', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_75_fallen_star', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_26_stone_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_214_hellstone_brick', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_93_wood_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_172_ash_block', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_118_hook', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_529_red_pressure_plate', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_183_glowing_mushroom', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_130_gray_brick_wall', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_352_keg', name: '', maxStack: 999, value: 1 });

// 不负责任的女妖啤酒厂 补全物品（占位收集品）
item({ key: 'vi_5120_deer_thing', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5508_grim_old_barb', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5465_ram_rune', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5500_goat_s_tuft', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5499_froggy_neckband', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5507_balloony_beads', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5485_chicken_charm', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5502_cat_chime', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5504_turkey_wattle_necklace', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5506_crow_s_beak', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5503_dog_collar', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5534_fairy_choker', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5484_cow_bell', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5501_old_companion_locket', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5509_vampire_pendant', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5505_mean_goblin_s_spikes', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_5525_cursed_piper_flute', name: '', maxStack: 999, value: 1 });


// ---- 阶段 5:v_ 图块放置物品自动注册 + 掉落连线 ----
// 每个 v_ 图块注册 place_v_<key> 放置物品(tryPlace 走 vanilla style 帧语义);
// 无掉落的 v_ 图块 drop 连到该物品(破坏可回收再放置)。
import { TILE_DEFS } from './tiles';
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
item({ key: 'corrupt_grass_seeds', name: '腐化草地种子', maxStack: 999, value: 1, tile: 'v_23_corrupt_grass_block' });
item({ key: 'crimson_grass_seeds', name: '猩红草地种子', maxStack: 999, value: 1, tile: 'v_199_crimson_grass_block' });
item({ key: 'jungle_grass_seeds', name: '丛林草地种子', maxStack: 999, value: 1, tile: 'v_60_jungle_grass_block' });
item({ key: 'mushroom_grass_seeds', name: '蘑菇草地种子', maxStack: 999, value: 1, tile: 'v_70_mushroom_grass_block' });


// ---- 阶段 5:原版物品全量注册(6146 件,图标走 atlas.vicon(id) 回退) ----
import vanillaItemMeta from '../../public/sprites/vanilla.json';
import { MUSIC_BOX_ITEM_BY_STYLE } from '../world/wiring/devices';
/** 原版物品 id → 注册 key（wld 导入兜底映射：ITEM_MAP 之外的 id 不再跳过） */
// ===================== 原版工具力道具补齐（锤/镐梯度,Item.cs 提取） =====================
item({ key: 'vi_103_nightmare_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_104_the_breaker', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_122_molten_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_204_meteor_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_217_molten_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_367_pwnhammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_579_drax', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_654_ebonwood_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_657_rich_mahogany_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_660_pearlwood_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_776_cobalt_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_777_mythril_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_778_adamantite_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_787_hammush', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_797_flesh_grinder', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_798_deathbringer_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_922_shadewood_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_990_pickaxe_axe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1188_palladium_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1195_orichalcum_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1202_titanium_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1234_chlorophyte_warhammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1262_chlorophyte_jackhammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1305_the_axe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1506_spectre_pickaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_1507_spectre_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3481_platinum_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3487_tungsten_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3493_lead_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3499_tin_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3505_copper_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3511_silver_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3517_gold_hammer', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_3525_stardust_hamaxe', name: '', maxStack: 999, value: 1 });
item({ key: 'vi_4317_haemorrhaxe', name: '', maxStack: 999, value: 1 });

// 月事件触发物品（Player.cs:43294/43361：夜晚 && 无进行中月事件；Main.startPumpkinMoon/
// startSnowMoon :10903-10940）。键用 vanilla.json 权威驼峰键（下方自动注册循环按此键
// 跳过，避免同 vid 双注册）；原版 maxStack 20 / useTime 45（Item.cs:20377-21128）
item({ key: 'vi_1844_PumpkinMoonMedallion', name: '', vid: 1844, maxStack: 20, value: 1, desc: '夜晚使用:召唤南瓜月' });
item({ key: 'vi_1958_NaughtyPresent', name: '', vid: 1958, maxStack: 20, value: 1, desc: '夜晚使用:召唤霜月' });

export const VANILLA_ITEM_KEY_BY_ID: Record<number, string> = {};
const _vim = (vanillaItemMeta as unknown as { items: Record<string, { name: string; key: string }> }).items ?? {};
for (const [idStr, m] of Object.entries(_vim)) {
  if (!m || typeof m.key !== 'string' || !m.key) continue;
  const ik = 'vi_' + idStr + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  VANILLA_ITEM_KEY_BY_ID[Number(idStr)] = ik; // 已注册的同样入表（wld 导入按 id 反查）
  if (byKey[ik] !== undefined) continue;
  item({ key: ik, name: '', maxStack: 999, value: 1 });
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
  item({ key: mbKey, name: '', maxStack: 1, value: 100000, tile: 'v_139_musicboxes', placeStyle: mbStyle });
}
for (let mbStyle = 0; mbStyle < 100; mbStyle++) {
  const mbKey = VANILLA_ITEM_KEY_BY_ID[MUSIC_BOX_ITEM_BY_STYLE[mbStyle]];
  if (mbKey === undefined) continue; // 6145/6146 无素材，上方单独注册
  const mbDef = ITEM_DEFS[byKey[mbKey]];
  if (!mbDef) continue;
  mbDef.tile = 'v_139_musicboxes';
  mbDef.placeStyle = mbStyle;
  mbDef.maxStack = 1;   // 原版唱片 maxStack 1（DefaultToMusicBox 非 stackable）
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
  fnDef.maxStack = 99;
}
void 0;

// ---- 宝石系统：gemcorn 4851-4857（Item.cs createTile=590 宝石树苗，style=宝石序号；
// 种在石/苔上必须地下长成宝石树，见 growSaplings）----
item({ key: 'vi_4851_GemTreeTopazSeed', name: '黄玉宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 0 });
item({ key: 'vi_4852_GemTreeAmethystSeed', name: '紫水晶宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 1 });
item({ key: 'vi_4853_GemTreeSapphireSeed', name: '蓝宝石宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 2 });
item({ key: 'vi_4854_GemTreeEmeraldSeed', name: '翡翠宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 3 });
item({ key: 'vi_4855_GemTreeRubySeed', name: '红宝石宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 4 });
item({ key: 'vi_4856_GemTreeDiamondSeed', name: '钻石宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 5 });
item({ key: 'vi_4857_GemTreeAmberSeed', name: '琥珀宝石橡实', maxStack: 999, value: 100, tile: 'v_590_gem_saplings', placeStyle: 6 });

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
item({ key: 'wooden_bow', name: '木弓', maxStack: 1, value: 100, vid: 39,
  ranged: { damage: 4, speed: 30, knockback: 0, ammo: 'wooden_arrow', projSpeed: 6.1, vid: 39 } });
item({ key: 'wooden_arrow', name: '木箭', maxStack: 999, value: 1, vid: 40, ammoId: 40 });
item({ key: 'flaming_arrow', name: '燃烧箭', maxStack: 999, value: 1, vid: 41, ammoId: 40 });
item({ key: 'iron_bow', name: '铁弓', maxStack: 1, value: 360, vid: 99,
  ranged: { damage: 8, speed: 28, knockback: 0, ammo: 'wooden_arrow', projSpeed: 6.6, vid: 99 } });

// ---- 阶段 6 第六轮:矿车 ----
item({ key: 'minecart_item', name: '矿车', maxStack: 99, value: 1, desc: '右键轨道放置并骑乘' });

// ---- 阶段 6 第八轮:魔法武器(官方 Item.cs:30765-30778,火花法杖=ItemID 3069:伤14/魔力2/UseTime26/射速7/暴击10) ----
item({ key: 'wand_of_sparking', name: '火花法杖', maxStack: 1, value: 100,
  magic: { damage: 14, speed: 26, manaCost: 2, projSpeed: 7, proj: 'spark' } });
item({ key: 'amethyst_bolt', name: '紫晶法杖', maxStack: 1, value: 900,
  magic: { damage: 14, speed: 26, manaCost: 5, projSpeed: 9, proj: 'bolt' } });

// ---- 阶段 6 第九轮:Boss 召唤物(官方:蠕虫食物 70/血腥脊椎 1331/史莱姆王冠 560) ----
item({ key: 'worm_food', name: '蠕虫食物', maxStack: 20, value: 1, desc: '腐化之地使用:召唤世界吞噬者' });
// 入侵触发物品（Player.ItemCheck_UseEventItems，Player.cs:43243/43260/43277）
item({ key: 'goblin_battle_standard', name: '哥布林战旗', vid: 361, maxStack: 20, value: 1, desc: '任意时刻:召唤哥布林军队' });
item({ key: 'snow_globe', name: '雪球', vid: 602, maxStack: 20, value: 1, desc: '使用:召唤雪人军团' });
item({ key: 'pirate_map', name: '海盗地图', vid: 1301, maxStack: 20, value: 1, desc: '使用:召唤海盗入侵' });
item({ key: 'bloody_spine', name: '血腥脊椎', maxStack: 20, value: 1, desc: '猩红之地使用:召唤克苏鲁之脑' });
item({ key: 'slime_crown', name: '史莱姆王冠', maxStack: 20, value: 1, desc: '任意时刻:召唤史莱姆王' });

// ---- 机械三王召唤物(官方 556 机械蠕虫/544 机械魔眼/557 机械骷髅头;需夜晚+困难模式) ----
item({ key: 'mechanical_worm', name: '机械蠕虫', maxStack: 20, value: 1, vid: 556, desc: '夜晚使用:召唤毁灭者' });
item({ key: 'mechanical_eye', name: '机械魔眼', maxStack: 20, value: 1, vid: 544, desc: '夜晚使用:召唤双子魔眼' });
item({ key: 'mechanical_skull', name: '机械骷髅头', maxStack: 20, value: 1, vid: 557, desc: '夜晚使用:召唤机械骷髅王' });

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

// ---- 墙面物品全量（vanilla-wallitems.json = Item.cs createWall 提取，124 项）：
// 已注册的 vi_ 墙物品补 wallId；缺的按 vi_ 命名注册（稳定 id = 物品 id 自动派生）
import wallItemsJson from './vanilla-wallitems.json';
for (const wi of Object.values(wallItemsJson as Record<string, { wall: number; key: string }>)) {
  const existing = byKey[wi.key];
  if (existing !== undefined) { ITEM_DEFS[existing].wallId = wi.wall; continue; }
  item({ key: wi.key, name: '', maxStack: 999, value: 1, wallId: wi.wall });
}
/** internal id → 稳定 id(保存方向;0=无映射,不应出现) */
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
// ---- 原版工具力表补齐(Item.cs SetDefaults 提取)→ vi_ 道具 tool 元数据 ----
// 条件破坏链的道具入口:圣锤 80 砸祭坛/邪恶石 65 需梦魇镐/神庙砖 210 需 Picksaw 级等
const VANILLA_TOOL_POWERS: Record<number, { pick?: number; hammer?: number; axe?: number }> = JSON.parse("{\"103\":{\"pick\":65},\"104\":{\"hammer\":55},\"122\":{\"pick\":100},\"204\":{\"hammer\":60,\"axe\":60},\"217\":{\"hammer\":70,\"axe\":70},\"367\":{\"hammer\":80},\"579\":{\"pick\":200,\"axe\":70},\"654\":{\"hammer\":40},\"657\":{\"hammer\":35},\"660\":{\"hammer\":55},\"776\":{\"pick\":110},\"777\":{\"pick\":150},\"778\":{\"pick\":180},\"787\":{\"hammer\":85},\"797\":{\"hammer\":55},\"798\":{\"pick\":70},\"922\":{\"hammer\":40},\"990\":{\"pick\":200,\"axe\":70},\"1188\":{\"pick\":130},\"1195\":{\"pick\":165},\"1202\":{\"pick\":190},\"1234\":{\"hammer\":90},\"1262\":{\"hammer\":90},\"1305\":{\"hammer\":100,\"axe\":70},\"1506\":{\"pick\":200},\"1507\":{\"hammer\":90,\"axe\":70},\"3481\":{\"hammer\":59},\"3487\":{\"hammer\":50},\"3493\":{\"hammer\":43},\"3499\":{\"hammer\":38},\"3505\":{\"hammer\":35},\"3511\":{\"hammer\":45},\"3517\":{\"hammer\":55},\"3525\":{\"hammer\":100,\"axe\":70},\"4317\":{\"hammer\":80}}");
for (const [idS, tp] of Object.entries(VANILLA_TOOL_POWERS)) {
  const key = VANILLA_ITEM_KEY_BY_ID[Number(idS)];
  if (!key) continue;
  const def = ITEM_DEFS[ITEM_BY_KEY[key]];
  if (!def) continue;
  const type = tp.pick !== undefined ? 'pick' : 'hammer';
  def.tool = { type: type as ToolType, power: tp.pick ?? tp.hammer ?? 0 };
  if (tp.axe !== undefined) def.axePower = tp.axe;
}

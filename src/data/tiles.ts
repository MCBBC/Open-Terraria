// 内部 tile / wall 注册表。id 即数组下标。
// 数值（硬度/光照）为原创平衡设计；mapColor 参考 TEdit tiles.json 的地图配色后重新取整。

export interface TileDef {
  key: string;
  name: string;
  solid: boolean;        // 参与碰撞
  platform: boolean;     // 单向平台（下跳可穿）
  decor: boolean;        // 装饰物（不碰撞、可被任何工具秒清）
  framed: boolean;       // 多格框架物体（使用 frameX/frameY 定位贴图）
  opacity: number;       // 光照阻挡 0-1
  light?: [number, number, number]; // 自发光 RGB
  pick: number;          // 所需镐力（-1 不可挖）
  axe: number;           // 所需斧力
  mapColor: string;      // 小地图颜色
  drop?: string;         // 破坏掉落 item key（缺省掉同名 key）
  blend: boolean;        // 是否参与同类边缘融合
  attach?: 'ground' | 'wall'; // 装饰物附着需求
  w?: number; h?: number;     // framed 物体占格数
  vanilla?: {                 // 原版素材渲染（terraria-assets + TEdit 数据）
    sheet: number;            // Tiles_N 表 id
    frame: 'auto' | 'style';  // auto=1x1 实心块现场 8 向 framing；style=多格家具用显式 18px 帧偏移
    fw?: number; fh?: number; // style 类的占格数（TEdit frameSize）
  };
}

export const T = {
  EMPTY: 0, DIRT: 1, STONE: 2, GRASS: 3,
  ORE_COPPER: 4, ORE_IRON: 5, ORE_SILVER: 6, ORE_GOLD: 7,
  TREE: 8, LEAVES: 9, WOOD: 10, PLATFORM: 11,
  TORCH: 12, WORKBENCH: 13, FURNACE: 14, ANVIL: 15,
  CHEST: 16, DOOR_CLOSED: 17, DOOR_OPEN: 18,
  MUSHROOM: 19, FLOWER: 20, TALLGRASS: 21, SAND: 22, SNOW: 23,
  SAPLING: 24, ASH: 25,
} as const;

export const TILE_DEFS: TileDef[] = [];
function def(d: Partial<TileDef> & { key: string }): number {
  const id = TILE_DEFS.length;
  TILE_DEFS.push({
    name: d.key, solid: false, platform: false, decor: false, framed: false,
    opacity: 0, pick: -1, axe: -1, mapColor: '#000', blend: false, ...d, id,
  } as TileDef);
  return id;
}
// 保证 id 与 T 常量一致（按顺序注册）
def({ key: 'empty', name: '空气' });
def({ key: 'dirt', name: '泥土', solid: true, opacity: 1, pick: 0, mapColor: '#976B4B', blend: true, drop: 'dirt_block' });
def({ key: 'stone', name: '石块', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: 'stone_block' });
def({ key: 'grass', name: '草块', solid: true, opacity: 1, pick: 0, mapColor: '#1CD85E', blend: true, drop: 'dirt_block' });
def({ key: 'ore_copper', name: '铜矿', solid: true, opacity: 1, pick: 0, mapColor: '#964316', blend: false, drop: 'copper_ore', vanilla: { sheet: 7, frame: 'auto' } });
def({ key: 'ore_iron', name: '铁矿', solid: true, opacity: 1, pick: 0, mapColor: '#8C6A56', blend: false, drop: 'iron_ore' });
def({ key: 'ore_silver', name: '银矿', solid: true, opacity: 1, pick: 20, mapColor: '#B9C2C3', blend: false, drop: 'silver_ore', vanilla: { sheet: 9, frame: 'auto' } });
def({ key: 'ore_gold', name: '金矿', solid: true, opacity: 1, pick: 40, mapColor: '#B9A417', blend: false, drop: 'gold_ore', vanilla: { sheet: 8, frame: 'auto' } });
def({ key: 'tree', name: '树干', solid: false, framed: true, opacity: 0.1, axe: 0, mapColor: '#6B4A2B', drop: 'wood' });
def({ key: 'leaves', name: '树叶', decor: true, framed: true, opacity: 0.05, pick: 0, axe: 0, mapColor: '#2E8B3D', drop: null as unknown as string });
def({ key: 'wood', name: '木材块', solid: true, opacity: 1, pick: 0, mapColor: '#A97D4E', blend: true, drop: 'wood', vanilla: { sheet: 30, frame: 'auto' } });
def({ key: 'platform', name: '木平台', platform: true, opacity: 0.15, pick: 0, axe: 0, mapColor: '#B0885A', drop: 'platform', vanilla: { sheet: 19, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'torch', name: '火把', decor: true, framed: true, opacity: 0, pick: 0, light: [255, 225, 150], mapColor: '#FDDD03', drop: 'torch', vanilla: { sheet: 4, frame: 'style', fw: 1, fh: 1 } });
// 注：火把光值见下（更亮版本）
def({ key: 'workbench', name: '工作台', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#A97D4E', drop: 'workbench', vanilla: { sheet: 18, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'furnace', name: '熔炉', solid: true, framed: true, opacity: 1, pick: 0, w: 3, h: 2, light: [255, 140, 70], mapColor: '#5A5A5A', drop: 'furnace', vanilla: { sheet: 17, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'anvil', name: '铁砧', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#6E6E78', drop: 'anvil', vanilla: { sheet: 16, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'chest', name: '宝箱', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#D4A017', drop: 'chest', vanilla: { sheet: 21, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'door_closed', name: '门', solid: true, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#A97D4E', drop: 'door', vanilla: { sheet: 10, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'door_open', name: '门(开)', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#A97D4E', drop: 'door', vanilla: { sheet: 11, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'mushroom', name: '蘑菇', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#C36927', drop: 'mushroom_item' });
def({ key: 'flower', name: '花', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#D0699E', drop: null as unknown as string });
def({ key: 'tallgrass', name: '草丛', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#1E9648', drop: 'acorn' });
def({ key: 'sand', name: '沙块', solid: true, opacity: 1, pick: 0, mapColor: '#FFDA38', blend: true, drop: 'sand_block', vanilla: { sheet: 53, frame: 'auto' } });
def({ key: 'snow', name: '雪块', solid: true, opacity: 1, pick: 0, mapColor: '#E8F0F4', blend: true, drop: 'snow_block' });
def({ key: 'acorn_sapling', name: '树苗', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#6B4A2B', drop: 'acorn' });
def({ key: 'ash', name: '灰烬块', solid: true, opacity: 1, pick: 0, mapColor: '#44444C', blend: true, drop: 'stone_block', vanilla: { sheet: 57, frame: 'auto' } });

// ===================== 原版素材图块（terraria-assets + TEdit 数据） =====================
// 4a：矿石 / 宝石 / 冰雪 / 沙漠 / 基础方块（1x1 实心，frame:'auto' 8 向贴合）
// mapColor/pick 取自 TEdit tiles.json；sheet = 原版 Tiles_N 表 id

// ---- 矿石（含替代矿与困难模式矿，后者先只做美术） ----
def({ key: 'ore_tin', name: '锡矿', solid: true, opacity: 1, pick: 0, mapColor: '#817D5D', drop: 'tin_ore', vanilla: { sheet: 166, frame: 'auto' } });
def({ key: 'ore_lead', name: '铅矿', solid: true, opacity: 1, pick: 0, mapColor: '#3E5272', drop: 'lead_ore', vanilla: { sheet: 167, frame: 'auto' } });
def({ key: 'ore_tungsten', name: '钨矿', solid: true, opacity: 1, pick: 20, mapColor: '#849D7F', drop: 'tungsten_ore', vanilla: { sheet: 168, frame: 'auto' } });
def({ key: 'ore_platinum', name: '铂金矿', solid: true, opacity: 1, pick: 40, mapColor: '#98ABC6', drop: 'platinum_ore', vanilla: { sheet: 169, frame: 'auto' } });
def({ key: 'ore_demonite', name: '魔矿', solid: true, opacity: 1, pick: 55, mapColor: '#625FA7', drop: 'demonite_ore', vanilla: { sheet: 22, frame: 'auto' } });
def({ key: 'ore_meteorite', name: '陨石', solid: true, opacity: 1, pick: 50, mapColor: '#685654', drop: 'meteorite', vanilla: { sheet: 37, frame: 'auto' } });
def({ key: 'ore_hellstone', name: '狱石', solid: true, opacity: 1, pick: 70, mapColor: '#8E4242', drop: 'hellstone', light: [255, 90, 40], vanilla: { sheet: 58, frame: 'auto' } });
def({ key: 'ore_crimtane', name: '猩红矿', solid: true, opacity: 1, pick: 65, mapColor: '#7D3741', drop: 'crimtane_ore', vanilla: { sheet: 204, frame: 'auto' } });
def({ key: 'ore_cobalt', name: '钴矿', solid: true, opacity: 1, pick: 65, mapColor: '#0B508F', drop: 'cobalt_ore', vanilla: { sheet: 107, frame: 'auto' } });
def({ key: 'ore_mythril', name: '秘银矿', solid: true, opacity: 1, pick: 65, mapColor: '#5BA9A9', drop: 'mythril_ore', vanilla: { sheet: 108, frame: 'auto' } });
def({ key: 'ore_adamantite', name: '精金矿', solid: true, opacity: 1, pick: 65, mapColor: '#801A34', drop: 'adamantite_ore', vanilla: { sheet: 111, frame: 'auto' } });
def({ key: 'ore_palladium', name: '钯金矿', solid: true, opacity: 1, pick: 65, mapColor: '#EF5A32', drop: 'palladium_ore', vanilla: { sheet: 221, frame: 'auto' } });
def({ key: 'ore_orichalcum', name: '山铜矿', solid: true, opacity: 1, pick: 65, mapColor: '#E760E4', drop: 'orichalcum_ore', vanilla: { sheet: 222, frame: 'auto' } });
def({ key: 'ore_titanium', name: '钛矿', solid: true, opacity: 1, pick: 65, mapColor: '#395565', drop: 'titanium_ore', vanilla: { sheet: 223, frame: 'auto' } });
def({ key: 'ore_chlorophyte', name: '叶绿矿', solid: true, opacity: 1, pick: 65, mapColor: '#BFE973', drop: 'chlorophyte_ore', vanilla: { sheet: 211, frame: 'auto' } });

// ---- 宝石矿（掉对应宝石） ----
def({ key: 'gem_sapphire', name: '蓝宝石矿', solid: true, opacity: 1, pick: 30, mapColor: '#6E8CB6', drop: 'sapphire', vanilla: { sheet: 63, frame: 'auto' } });
def({ key: 'gem_ruby', name: '红宝石矿', solid: true, opacity: 1, pick: 30, mapColor: '#C46072', drop: 'ruby', vanilla: { sheet: 64, frame: 'auto' } });
def({ key: 'gem_emerald', name: '翡翠矿', solid: true, opacity: 1, pick: 30, mapColor: '#389661', drop: 'emerald', vanilla: { sheet: 65, frame: 'auto' } });
def({ key: 'gem_topaz', name: '黄玉矿', solid: true, opacity: 1, pick: 30, mapColor: '#A0763A', drop: 'topaz', vanilla: { sheet: 66, frame: 'auto' } });
def({ key: 'gem_amethyst', name: '紫水晶矿', solid: true, opacity: 1, pick: 30, mapColor: '#8C3AA6', drop: 'amethyst', vanilla: { sheet: 67, frame: 'auto' } });
def({ key: 'gem_diamond', name: '钻石矿', solid: true, opacity: 1, pick: 30, mapColor: '#7DBFC5', drop: 'diamond', vanilla: { sheet: 68, frame: 'auto' } });

// ---- 冰雪 ----
def({ key: 'ice', name: '冰块', solid: true, opacity: 1, pick: 0, mapColor: '#90C3E8', blend: true, drop: 'ice_block', vanilla: { sheet: 161, frame: 'auto' } });
def({ key: 'thin_ice', name: '薄冰', solid: true, opacity: 1, pick: 0, mapColor: '#B8DBF0', blend: true, drop: 'ice_block', vanilla: { sheet: 162, frame: 'auto' } });
def({ key: 'ice_brick', name: '冰砖', solid: true, opacity: 1, pick: 0, mapColor: '#7CAFC9', blend: true, drop: 'ice_brick', vanilla: { sheet: 206, frame: 'auto' } });
def({ key: 'snow_brick', name: '雪砖', solid: true, opacity: 1, pick: 0, mapColor: '#B5D3D2', blend: true, drop: 'snow_brick', vanilla: { sheet: 148, frame: 'auto' } });

// ---- 沙漠 / 基础方块 ----
def({ key: 'sandstone', name: '沙岩', solid: true, opacity: 1, pick: 0, mapColor: '#C67C4E', blend: true, drop: 'sandstone_block', vanilla: { sheet: 396, frame: 'auto' } });
def({ key: 'hardened_sand', name: '硬化沙块', solid: true, opacity: 1, pick: 0, mapColor: '#D4C064', blend: true, drop: 'hardened_sand_block', vanilla: { sheet: 397, frame: 'auto' } });
def({ key: 'desert_fossil', name: '沙漠化石', solid: true, opacity: 1, pick: 0, mapColor: '#8C543C', blend: true, drop: 'desert_fossil', vanilla: { sheet: 404, frame: 'auto' } });
def({ key: 'clay', name: '粘土块', solid: true, opacity: 1, pick: 0, mapColor: '#925144', blend: true, drop: 'clay_block', vanilla: { sheet: 40, frame: 'auto' } });
def({ key: 'glass', name: '玻璃', solid: true, opacity: 0.15, pick: 0, mapColor: '#C8F6FE', drop: 'glass', vanilla: { sheet: 54, frame: 'auto' } });
def({ key: 'obsidian', name: '黑曜石', solid: true, opacity: 1, pick: 40, mapColor: '#2B2854', blend: true, drop: 'obsidian', vanilla: { sheet: 56, frame: 'auto' } });
def({ key: 'gray_brick', name: '灰砖', solid: true, opacity: 1, pick: 0, mapColor: '#909090', blend: true, drop: 'gray_brick', vanilla: { sheet: 38, frame: 'auto' } });
def({ key: 'red_brick', name: '红砖', solid: true, opacity: 1, pick: 0, mapColor: '#B53E3B', blend: true, drop: 'red_brick', vanilla: { sheet: 39, frame: 'auto' } });
def({ key: 'mud', name: '泥块', solid: true, opacity: 1, pick: 0, mapColor: '#5C4449', blend: true, drop: 'mud_block', vanilla: { sheet: 59, frame: 'auto' } });
def({ key: 'silt', name: '淤泥块', solid: true, opacity: 1, pick: 0, mapColor: '#6A6B76', blend: true, drop: 'silt_block', vanilla: { sheet: 123, frame: 'auto' } });

// 4b：家具 / 装饰（多格 framed，frame:'style' 显式 18px 帧；w/h = TEdit frameSize）
const VAN = (sheet: number, w: number, h: number) => ({ vanilla: { sheet, frame: 'style' as const, fw: w, fh: h } });

def({ key: 'table', name: '木桌', framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: 'table', ...VAN(14, 3, 2) });
def({ key: 'chair', name: '木椅', framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#BF8E6F', drop: 'chair', ...VAN(15, 1, 2) });
def({ key: 'bed', name: '床', framed: true, opacity: 0.05, pick: 0, w: 4, h: 2, mapColor: '#BF8E6F', drop: 'bed', ...VAN(79, 4, 2) });
def({ key: 'bookcase', name: '书架', framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#BF8E6F', drop: 'bookcase', ...VAN(101, 3, 4) });
def({ key: 'grandfather_clock', name: '落地钟', framed: true, opacity: 0.05, pick: 0, w: 2, h: 5, mapColor: '#BF8E6F', drop: 'grandfather_clock', ...VAN(104, 2, 5) });
def({ key: 'piano', name: '钢琴', framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: 'piano', ...VAN(87, 3, 2) });
def({ key: 'dresser', name: '梳妆台', framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: 'dresser', ...VAN(88, 3, 2) });
def({ key: 'bench', name: '长凳', framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: 'bench', ...VAN(89, 3, 2) });
def({ key: 'bathtub', name: '浴缸', framed: true, opacity: 0.05, pick: 0, w: 4, h: 2, mapColor: '#909490', drop: 'bathtub', ...VAN(90, 4, 2) });
def({ key: 'keg', name: '酒桶', framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#BF8E6F', drop: 'keg', ...VAN(94, 2, 2) });
def({ key: 'cooking_pot', name: '汤锅', framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: 'cooking_pot', ...VAN(96, 2, 2) });
def({ key: 'clay_pot', name: '陶盆', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#796E61', drop: 'clay_pot', ...VAN(78, 1, 1) });
def({ key: 'tombstone_v', name: '墓碑', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#C0C0C0', drop: 'tombstone', ...VAN(85, 2, 2) });
def({ key: 'crystal_heart', name: '水晶之心', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#AE1845', drop: 'life_crystal', light: [255, 60, 90], ...VAN(12, 2, 2) });
// 发光灯具
def({ key: 'candle', name: '蜡烛', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#FDDD03', drop: 'candle', light: [255, 185, 110], ...VAN(33, 1, 1) });
def({ key: 'chandelier', name: '吊灯', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 3, mapColor: '#EBA687', drop: 'chandelier', light: [255, 190, 120], ...VAN(34, 3, 3) });
def({ key: 'lantern', name: '吊挂灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 2, mapColor: '#FBEB7F', drop: 'lantern', light: [255, 170, 90], ...VAN(42, 1, 2) });
def({ key: 'candelabra', name: '烛台', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FDDD03', drop: 'candelabra', light: [255, 185, 110], ...VAN(100, 2, 2) });
def({ key: 'chinese_lantern', name: '中式灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FFA21F', drop: 'chinese_lantern', light: [255, 160, 70], ...VAN(95, 2, 2) });
def({ key: 'skull_lantern', name: '骷髅灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FDDD03', drop: 'skull_lantern', light: [255, 160, 70], ...VAN(98, 2, 2) });
def({ key: 'water_candle', name: '水蜡烛', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#2B8FFF', drop: 'water_candle', light: [140, 180, 255], ...VAN(49, 1, 1) });
// 瓦罐（世界生成散布）：打破掉随机常用道具（breakTile 特判），不做放置物
def({ key: 'pot', name: '瓦罐', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#974F50', drop: null as unknown as string, vanilla: { sheet: 28, frame: 'style', fw: 2, fh: 2 } });

export const TILE_BY_KEY: Record<string, number> = {};
// 注意：构建必须放在文件末尾（所有 def() 之后），v_ 批量补全定义在下方，
// 此处先注册占位，末尾 rebuildTILE_BY_KEY() 统一回填
export function isSolidTile(type: number): boolean {
  const d = TILE_DEFS[type];
  return !!d && d.solid;
}

// ---- 墙 ----
export interface WallDef { key: string; name: string; mapColor: string; opacity: number; }
export const W = { NONE: 0, DIRT: 1, STONE: 2, WOOD: 3 } as const;
export const WALL_DEFS: WallDef[] = [
  { key: 'none', name: '无', mapColor: '#000', opacity: 0 },
  { key: 'dirt_wall', name: '土墙', mapColor: '#5C4128', opacity: 1 },
  { key: 'stone_wall', name: '石墙', mapColor: '#4A4A4A', opacity: 1 },
  { key: 'wood_wall', name: '木墙', mapColor: '#6B4A2B', opacity: 1 },
];
export const WALL_BY_KEY: Record<string, number> = {};
WALL_DEFS.forEach((d, i) => (WALL_BY_KEY[d.key] = i));

// ===================== wld 导入全量补全（compat-report 驱动） =====================
// 实心 1x1 方块（frame:auto 8 向贴合）
def({ key: 'v_51_cobweb', name: 'Cobweb', solid: true, opacity: 1, pick: 0, mapColor: '#C0CACB', blend: true, drop: null as unknown as string, vanilla: { sheet: 51, frame: 'auto' } });
def({ key: 'v_368_granite_block', name: 'Granite Block', solid: true, opacity: 1, pick: 0, mapColor: '#322E68', blend: true, drop: null as unknown as string, vanilla: { sheet: 368, frame: 'auto' } });
def({ key: 'v_226_lihzahrd_brick', name: 'Lihzahrd Brick', solid: true, opacity: 1, pick: 0, mapColor: '#8D3800', blend: true, drop: null as unknown as string, vanilla: { sheet: 226, frame: 'auto' } });
def({ key: 'v_367_marble_block', name: 'Marble Block', solid: true, opacity: 1, pick: 0, mapColor: '#A8B2CC', blend: true, drop: null as unknown as string, vanilla: { sheet: 367, frame: 'auto' } });
def({ key: 'v_633_ash_grass_block', name: 'Ash Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#66474A', blend: true, drop: null as unknown as string, vanilla: { sheet: 633, frame: 'auto' } });
def({ key: 'v_181_red_moss_block', name: 'Red Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#863B31', blend: true, drop: null as unknown as string, vanilla: { sheet: 181, frame: 'auto' } });
def({ key: 'v_189_cloud_block', name: 'Cloud Block', solid: true, opacity: 1, pick: 0, mapColor: '#DFFFFF', blend: true, drop: null as unknown as string, vanilla: { sheet: 189, frame: 'auto' } });
def({ key: 'v_183_purple_moss_block', name: 'Purple Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#793186', blend: true, drop: null as unknown as string, vanilla: { sheet: 183, frame: 'auto' } });
def({ key: 'v_536_xenon_moss_block', name: 'Xenon Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#589498', blend: true, drop: null as unknown as string, vanilla: { sheet: 536, frame: 'auto' } });
def({ key: 'v_225_hive_block', name: 'Hive Block', solid: true, opacity: 1, pick: 0, mapColor: '#E37D16', blend: true, drop: null as unknown as string, vanilla: { sheet: 225, frame: 'auto' } });
def({ key: 'v_483_cracked_pink_brick', name: 'Cracked Pink Brick', solid: true, opacity: 1, pick: 0, mapColor: '#7A405F', blend: true, drop: null as unknown as string, vanilla: { sheet: 483, frame: 'auto' } });
def({ key: 'v_224_slush_block', name: 'Slush Block', solid: true, opacity: 1, pick: 0, mapColor: '#6B848B', blend: true, drop: null as unknown as string, vanilla: { sheet: 224, frame: 'auto' } });
def({ key: 'v_383_living_mahogany_block', name: 'Living Mahogany Block', solid: true, opacity: 1, pick: 0, mapColor: '#DD8890', blend: true, drop: null as unknown as string, vanilla: { sheet: 383, frame: 'auto' } });
def({ key: 'v_179_green_moss_block', name: 'Green Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#318672', blend: true, drop: null as unknown as string, vanilla: { sheet: 179, frame: 'auto' } });
def({ key: 'v_384_living_mahogany_leaves_block', name: 'Living Mahogany Leaves Block', solid: true, opacity: 1, pick: 0, mapColor: '#83CE0C', blend: true, drop: null as unknown as string, vanilla: { sheet: 384, frame: 'auto' } });
def({ key: 'v_273_stone_slab', name: 'Stone Slab', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: null as unknown as string, vanilla: { sheet: 273, frame: 'auto' } });
def({ key: 'v_381_lava_moss', name: 'Lava Moss', solid: true, opacity: 1, pick: 0, mapColor: '#FE7902', blend: true, drop: null as unknown as string, light: [255, 120, 30], vanilla: { sheet: 381, frame: 'auto' } });
def({ key: 'v_48_spike', name: 'Spike', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: null as unknown as string, vanilla: { sheet: 48, frame: 'auto' } });
def({ key: 'v_192_living_leaf_block', name: 'Living Leaf Block', solid: true, opacity: 1, pick: 0, mapColor: '#1AC454', blend: true, drop: null as unknown as string, vanilla: { sheet: 192, frame: 'auto' } });
def({ key: 'v_191_living_wood_block', name: 'Living Wood Block', solid: true, opacity: 1, pick: 0, mapColor: '#976B4B', blend: true, drop: null as unknown as string, vanilla: { sheet: 191, frame: 'auto' } });
def({ key: 'v_196_rain_cloud_block', name: 'Rain Cloud Block', solid: true, opacity: 1, pick: 0, mapColor: '#9390B2', blend: true, drop: null as unknown as string, vanilla: { sheet: 196, frame: 'auto' } });
def({ key: 'v_118_pearlstone_brick', name: 'Pearlstone Brick', solid: true, opacity: 1, pick: 0, mapColor: '#EEE1DA', blend: true, drop: null as unknown as string, vanilla: { sheet: 118, frame: 'auto' } });
def({ key: 'v_321_boreal_wood', name: 'Boreal Wood', solid: true, opacity: 1, pick: 0, mapColor: '#604D40', blend: true, drop: null as unknown as string, vanilla: { sheet: 321, frame: 'auto' } });
def({ key: 'v_152_ebonstone_brick', name: 'Ebonstone Brick', solid: true, opacity: 1, pick: 0, mapColor: '#8085B8', blend: true, drop: null as unknown as string, vanilla: { sheet: 152, frame: 'auto' } });
def({ key: 'v_158_rich_mahogany', name: 'Rich Mahogany', solid: true, opacity: 1, pick: 0, mapColor: '#915155', blend: true, drop: null as unknown as string, vanilla: { sheet: 158, frame: 'auto' } });
def({ key: 'v_357_smooth_marble_block', name: 'Smooth Marble Block', solid: true, opacity: 1, pick: 0, mapColor: '#A8B2CC', blend: true, drop: null as unknown as string, vanilla: { sheet: 357, frame: 'auto' } });
def({ key: 'v_272_cog_block', name: 'Cog Block', solid: true, opacity: 1, pick: 0, mapColor: '#797765', blend: true, drop: null as unknown as string, vanilla: { sheet: 272, frame: 'auto' } });
def({ key: 'v_229_honey_block', name: 'Honey Block', solid: true, opacity: 1, pick: 0, mapColor: '#FF9C0C', blend: true, drop: null as unknown as string, vanilla: { sheet: 229, frame: 'auto' } });
def({ key: 'v_311_dynasty_wood', name: 'Dynasty Wood', solid: true, opacity: 1, pick: 0, mapColor: '#753D19', blend: true, drop: null as unknown as string, vanilla: { sheet: 311, frame: 'auto' } });
def({ key: 'v_130_active_stone_block', name: 'Active Stone Block', solid: true, opacity: 1, pick: 0, mapColor: '#A0A0A0', blend: true, drop: null as unknown as string, vanilla: { sheet: 130, frame: 'auto' } });
def({ key: 'v_193_slime_block', name: 'Slime Block', solid: true, opacity: 1, pick: 0, mapColor: '#3879FF', blend: true, drop: null as unknown as string, vanilla: { sheet: 193, frame: 'auto' } });
def({ key: 'v_190_glowing_mushroom_block', name: 'Glowing Mushroom Block', solid: true, opacity: 1, pick: 0, mapColor: '#B6AF82', blend: true, drop: null as unknown as string, light: [120, 110, 180], vanilla: { sheet: 190, frame: 'auto' } });
def({ key: 'v_350_martian_conduit_plating', name: 'Martian Conduit Plating', solid: true, opacity: 1, pick: 0, mapColor: '#37619B', blend: true, drop: null as unknown as string, vanilla: { sheet: 350, frame: 'auto' } });
def({ key: 'v_369_smooth_granite_block', name: 'Smooth Granite Block', solid: true, opacity: 1, pick: 0, mapColor: '#322E68', blend: true, drop: null as unknown as string, vanilla: { sheet: 369, frame: 'auto' } });
def({ key: 'v_137_traps', name: 'Traps', solid: true, opacity: 1, pick: 0, mapColor: '#909490', blend: true, drop: null as unknown as string, vanilla: { sheet: 137, frame: 'auto' } });
def({ key: 'v_117_pearlstone_block', name: 'Pearlstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#B5ACBE', blend: true, drop: null as unknown as string, vanilla: { sheet: 117, frame: 'auto' } });
def({ key: 'v_112_ebonsand_block', name: 'Ebonsand Block', solid: true, opacity: 1, pick: 0, mapColor: '#67627A', blend: true, drop: null as unknown as string, vanilla: { sheet: 112, frame: 'auto' } });
def({ key: 'v_232_wooden_spike', name: 'Wooden Spike', solid: true, opacity: 1, pick: 0, mapColor: '#915155', blend: true, drop: null as unknown as string, vanilla: { sheet: 232, frame: 'auto' } });
def({ key: 'v_274_sandstone_slab', name: 'Sandstone Slab', solid: true, opacity: 1, pick: 0, mapColor: '#BEAB5E', blend: true, drop: null as unknown as string, vanilla: { sheet: 274, frame: 'auto' } });
def({ key: 'v_322_palm_wood', name: 'Palm Wood', solid: true, opacity: 1, pick: 0, mapColor: '#C6AA68', blend: true, drop: null as unknown as string, vanilla: { sheet: 322, frame: 'auto' } });
def({ key: 'v_109_hallowed_grass_block', name: 'Hallowed Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#4EC1E3', blend: true, drop: null as unknown as string, vanilla: { sheet: 109, frame: 'auto' } });
def({ key: 'v_312_red_dynasty_shingles', name: 'Red Dynasty Shingles', solid: true, opacity: 1, pick: 0, mapColor: '#CC5D49', blend: true, drop: null as unknown as string, vanilla: { sheet: 312, frame: 'auto' } });
def({ key: 'v_422_conveyor_belt_ccw', name: 'Conveyor Belt (CCW)', solid: true, opacity: 1, pick: 0, mapColor: '#494646', blend: true, drop: null as unknown as string, vanilla: { sheet: 422, frame: 'auto' } });
def({ key: 'v_495_shell_pile_block', name: 'Shell Pile Block', solid: true, opacity: 1, pick: 0, mapColor: '#AF976E', blend: true, drop: null as unknown as string, vanilla: { sheet: 495, frame: 'auto' } });
def({ key: 'v_479_smooth_sandstone_block', name: 'Smooth Sandstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#BC7347', blend: true, drop: null as unknown as string, vanilla: { sheet: 479, frame: 'auto' } });
def({ key: 'v_353_vine_rope', name: 'Vine Rope', solid: true, opacity: 1, pick: 0, mapColor: '#1CD85E', blend: true, drop: null as unknown as string, vanilla: { sheet: 353, frame: 'auto' } });
def({ key: 'v_477_mowed_grass_block', name: 'Mowed Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#607044', blend: true, drop: null as unknown as string, vanilla: { sheet: 477, frame: 'auto' } });
def({ key: 'v_380_planter_boxes', name: 'Planter Boxes', solid: true, opacity: 1, pick: 0, mapColor: '#BF8E6F', blend: true, drop: null as unknown as string, vanilla: { sheet: 380, frame: 'auto' } });
def({ key: 'v_230_crispy_honey_block', name: 'Crispy Honey Block', solid: true, opacity: 1, pick: 0, mapColor: '#834F0D', blend: true, drop: null as unknown as string, vanilla: { sheet: 230, frame: 'auto' } });
def({ key: 'v_562_bamboo_block', name: 'Bamboo Block', solid: true, opacity: 1, pick: 0, mapColor: '#737A2D', blend: true, drop: null as unknown as string, vanilla: { sheet: 562, frame: 'auto' } });
def({ key: 'v_371_pink_slime_block', name: 'Pink Slime Block', solid: true, opacity: 1, pick: 0, mapColor: '#F965BD', blend: true, drop: null as unknown as string, vanilla: { sheet: 371, frame: 'auto' } });
def({ key: 'v_668_the_dirtiest_block', name: 'The Dirtiest Block', solid: true, opacity: 1, pick: 0, mapColor: '#bf8e6f', blend: true, drop: null as unknown as string, vanilla: { sheet: 668, frame: 'auto' } });
def({ key: 'v_398_corrupt_hardened_sand_block', name: 'Corrupt Hardened Sand Block', solid: true, opacity: 1, pick: 0, mapColor: '#64527E', blend: true, drop: null as unknown as string, vanilla: { sheet: 398, frame: 'auto' } });
def({ key: 'v_379_bubble', name: 'Bubble', solid: true, opacity: 1, pick: 0, mapColor: '#FBD1F0', blend: true, drop: null as unknown as string, vanilla: { sheet: 379, frame: 'auto' } });
def({ key: 'v_618_stone_accent_slab', name: 'Stone Accent Slab', solid: true, opacity: 1, pick: 0, mapColor: '#828282', blend: true, drop: null as unknown as string, vanilla: { sheet: 618, frame: 'auto' } });

// framed 物体（frame:style 显式 18px 帧）
def({ key: 'v_165_cave_decos', name: 'Cave Decos', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#646464', drop: null as unknown as string, vanilla: { sheet: 165, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_184_moss_plants', name: 'Moss Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#646464', drop: null as unknown as string, vanilla: { sheet: 184, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_314_minecart_track', name: 'Minecart Track', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#B5A47D', drop: null as unknown as string, vanilla: { sheet: 314, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_185_small_decos', name: 'Small Decos', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#959573', drop: null as unknown as string, vanilla: { sheet: 185, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_373_water_drip', name: 'Water Drip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#093DBF', drop: null as unknown as string, vanilla: { sheet: 373, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_187_decos_3x2_group_2', name: 'Decos (3x2) (Group 2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null as unknown as string, vanilla: { sheet: 187, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_484_rolling_cactus', name: 'Rolling Cactus', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#737E3D', drop: null as unknown as string, vanilla: { sheet: 484, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_374_lava_drip', name: 'Lava Drip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FD2003', drop: null as unknown as string, vanilla: { sheet: 374, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_233_jungle_large_plants', name: 'Jungle Large Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null as unknown as string, vanilla: { sheet: 233, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_105_statue', name: 'Statue', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 105, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_186_decos_3x2', name: 'Decos (3x2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null as unknown as string, vanilla: { sheet: 186, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_461_sand_drip', name: 'Sand Drip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FFDE64', drop: null as unknown as string, vanilla: { sheet: 461, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_178_gems', name: 'Gems', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF00FF', drop: null as unknown as string, vanilla: { sheet: 178, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_485_antlion_larva', name: 'Antlion Larva', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#A17956', drop: null as unknown as string, vanilla: { sheet: 485, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_637_ash_short_plants', name: 'Ash Short Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#884338', drop: null as unknown as string, vanilla: { sheet: 637, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_444_bee_hive', name: 'Bee Hive', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#bfb07c', drop: null as unknown as string, vanilla: { sheet: 444, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_240_wall_hangings_3x3', name: 'Wall Hangings 3x3', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#63321E', drop: null as unknown as string, vanilla: { sheet: 240, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_519_cattails', name: 'Cattails', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#7F7F99', drop: null as unknown as string, vanilla: { sheet: 519, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_138_boulder', name: 'Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#606060', drop: null as unknown as string, vanilla: { sheet: 138, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_634_ash_tree', name: 'Ash Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#7D5453', drop: null as unknown as string, vanilla: { sheet: 634, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_26_altars', name: 'Altars', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#77657D', drop: null as unknown as string, vanilla: { sheet: 26, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_82_herbs_sprout', name: 'Herbs (Sprout)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF7800', drop: null as unknown as string, vanilla: { sheet: 82, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_323_palm_trees', name: 'Palm Trees', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#B68D56', drop: null as unknown as string, vanilla: { sheet: 323, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_135_pressure_plates', name: 'Pressure Plates', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FD7272', drop: null as unknown as string, vanilla: { sheet: 135, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_91_banners', name: 'Banners', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#0D5882', drop: null as unknown as string, vanilla: { sheet: 91, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'v_242_paintings_6x4', name: 'Paintings 6x4', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 4, mapColor: '#63321E', drop: null as unknown as string, vanilla: { sheet: 242, frame: 'style', fw: 6, fh: 4 } });
def({ key: 'v_50_books', name: 'Books', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#AA3072', drop: null as unknown as string, vanilla: { sheet: 50, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_93_lamps', name: 'Lamps', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#FDDD03', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 93, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'v_549_seaweed', name: 'Seaweed', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#385806', drop: null as unknown as string, vanilla: { sheet: 549, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_254_pumpkin_plant', name: 'Pumpkin Plant', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#F89E5C', drop: null as unknown as string, vanilla: { sheet: 254, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_571_bamboo', name: 'Bamboo', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#638017', drop: null as unknown as string, vanilla: { sheet: 571, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_246_paintings_3x2', name: 'Paintings 3x2', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#63321E', drop: null as unknown as string, vanilla: { sheet: 246, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_245_paintings_2x3', name: 'Paintings 2x3', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#63321E', drop: null as unknown as string, vanilla: { sheet: 245, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_586_emerald_tree', name: 'Emerald Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 586, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_596_vanity_tree_sakura', name: 'Vanity Tree Sakura', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#6E5B4D', drop: null as unknown as string, vanilla: { sheet: 596, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_467_chests_group_2', name: 'Chests (Group 2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E9CF5E', drop: null as unknown as string, vanilla: { sheet: 467, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_443_geyser', name: 'Geyser', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#7b7b7b', drop: null as unknown as string, vanilla: { sheet: 443, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_589_amber_tree', name: 'Amber Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 589, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_411_detonator', name: 'Detonator', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E32E2E', drop: null as unknown as string, vanilla: { sheet: 411, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_518_lily_pads', name: 'Lily Pads', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#6C5F84', drop: null as unknown as string, vanilla: { sheet: 518, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_588_diamond_tree', name: 'Diamond Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 588, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_585_sapphire_tree', name: 'Sapphire Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 585, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_583_topaz_tree', name: 'Topaz Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 583, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_13_placed_bottles', name: 'Placed Bottles', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#85D5F7', drop: null as unknown as string, vanilla: { sheet: 13, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_530_oasis_plants', name: 'Oasis Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#5B546C', drop: null as unknown as string, vanilla: { sheet: 530, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_616_vanity_tree_yellow_willow', name: 'Vanity Tree Yellow Willow', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#854F4D', drop: null as unknown as string, vanilla: { sheet: 616, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_215_campfires', name: 'Campfires', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FE7902', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 215, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_141_explosives', name: 'Explosives', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#C03B3B', drop: null as unknown as string, vanilla: { sheet: 141, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_597_pylons', name: 'Pylons', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#787F4B', drop: null as unknown as string, vanilla: { sheet: 597, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_592_hanging_brazier', name: 'Hanging Brazier', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#A57345', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 592, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_375_honey_drip', name: 'Honey Drip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF9C0C', drop: null as unknown as string, vanilla: { sheet: 375, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_227_dye_plants', name: 'Dye Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null as unknown as string, vanilla: { sheet: 227, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_584_amethyst_tree', name: 'Amethyst Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 584, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_231_larva', name: 'Larva', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#E0C265', drop: null as unknown as string, vanilla: { sheet: 231, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_395_item_frame', name: 'Item Frame', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 395, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_241_catacombs', name: 'Catacombs', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 3, mapColor: '#4D4A48', drop: null as unknown as string, vanilla: { sheet: 241, frame: 'style', fw: 4, fh: 3 } });
def({ key: 'v_587_ruby_tree', name: 'Ruby Tree', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 587, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_86_loom', name: 'Loom', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 86, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_376_fishing_crates', name: 'Fishing Crates', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#A0785C', drop: null as unknown as string, vanilla: { sheet: 376, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_470_mannequins', name: 'Mannequins', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#7B5B44', drop: null as unknown as string, vanilla: { sheet: 470, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_324_seashells', name: 'Seashells', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#E4D5AD', drop: null as unknown as string, vanilla: { sheet: 324, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_81_coral', name: 'Coral', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#F585BF', drop: null as unknown as string, vanilla: { sheet: 81, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_136_switch', name: 'Switch', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#D5CBCC', drop: null as unknown as string, vanilla: { sheet: 136, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_355_alchemy_table', name: 'Alchemy Table', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8D6B59', drop: null as unknown as string, vanilla: { sheet: 355, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_354_bewitching_table', name: 'Bewitching Table', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8D6B59', drop: null as unknown as string, vanilla: { sheet: 354, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_103_bowls', name: 'Bowls', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#8D624D', drop: null as unknown as string, vanilla: { sheet: 103, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_529_sea_oats', name: 'Sea Oats', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#675874', drop: null as unknown as string, vanilla: { sheet: 529, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_506_bast_statue', name: 'Bast Statue', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#291C13', drop: null as unknown as string, vanilla: { sheet: 506, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_349_mushroom_statue', name: 'Mushroom Statue', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 349, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_377_sharpening_station', name: 'Sharpening Station', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 377, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_613_potted_lava_plants', name: 'Potted Lava Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 5, mapColor: '#885D34', drop: null as unknown as string, vanilla: { sheet: 613, frame: 'style', fw: 3, fh: 5 } });
def({ key: 'v_219_extractinator', name: 'Extractinator', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 219, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_388_tall_gate_closed', name: 'Tall Gate (Closed)', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 5, mapColor: '#7F5C45', drop: null as unknown as string, vanilla: { sheet: 388, frame: 'style', fw: 1, fh: 5 } });
def({ key: 'v_129_crystal_shard', name: 'Crystal Shard', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF75E0', drop: null as unknown as string, vanilla: { sheet: 129, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_466_elder_cystal_stand', name: 'Elder Cystal Stand', solid: false, framed: true, opacity: 0.05, pick: 0, w: 5, h: 4, mapColor: '#CD9949', drop: null as unknown as string, vanilla: { sheet: 466, frame: 'style', fw: 5, fh: 4 } });
def({ key: 'v_220_solidifier', name: 'Solidifier', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 220, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_303_lihzahrd_furnace', name: 'Lihzahrd Furnace', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 303, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_469_tables_group_2', name: 'Tables (Group 2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 469, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_304_living_loom', name: 'Living Loom', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 304, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_488_fallen_log', name: 'Fallen Log', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#72654F', drop: null as unknown as string, vanilla: { sheet: 488, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_548_potted_trees_group_2', name: 'Potted Trees (Group 2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 6, mapColor: '#866036', drop: null as unknown as string, vanilla: { sheet: 548, frame: 'style', fw: 3, fh: 6 } });
def({ key: 'v_614_potted_ember_tendrils', name: 'Potted Ember Tendrils', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 6, mapColor: '#724D31', drop: null as unknown as string, vanilla: { sheet: 614, frame: 'style', fw: 3, fh: 6 } });
def({ key: 'v_598_lava_serpent_bowl', name: 'Lava Serpent Bowl', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#92726F', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 598, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_406_chimney', name: 'Chimney', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#787878', drop: null as unknown as string, vanilla: { sheet: 406, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_305_sky_mill', name: 'Sky Mill', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 305, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_300_bone_welder', name: 'Bone Welder', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 300, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_302_glass_kiln', name: 'Glass Kiln', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 302, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_306_ice_machine', name: 'Ice Machine', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 306, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_247_autohammer', name: 'Autohammer', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8C9696', drop: null as unknown as string, vanilla: { sheet: 247, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_491_void_vault', name: 'Void Vault', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8149B1', drop: null as unknown as string, vanilla: { sheet: 491, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_106_sawmill', name: 'Sawmill', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 106, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_642_chlorophyte_extractinator', name: 'Chlorophyte Extractinator', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#6E8B81', drop: null as unknown as string, vanilla: { sheet: 642, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_319_ship_in_a_bottle', name: 'Ship in a Bottle', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#604430', drop: null as unknown as string, vanilla: { sheet: 319, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_487_picnic_tables', name: 'Picnic Tables', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 2, mapColor: '#8D5A57', drop: null as unknown as string, vanilla: { sheet: 487, frame: 'style', fw: 4, fh: 2 } });
def({ key: 'v_97_safe', name: 'Safe', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 97, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_320_seaweed_planter', name: 'Seaweed Planter', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#CBB997', drop: null as unknown as string, vanilla: { sheet: 320, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_405_fireplace', name: 'Fireplace', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#8C8C8C', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 405, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_378_target_dummy', name: 'Target Dummy', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#A07864', drop: null as unknown as string, vanilla: { sheet: 378, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_218_meat_grinder', name: 'Meat Grinder', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 218, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_356_enchanted_sundial', name: 'Enchanted Sundial', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#E9CB18', drop: null as unknown as string, vanilla: { sheet: 356, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_114_tinkerer_s_workshop', name: 'Tinkerer\'s Workshop', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 114, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_237_lihzahrd_altar', name: 'Lihzahrd Altar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FFF133', drop: null as unknown as string, vanilla: { sheet: 237, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_110_hallow_short_plants', name: 'Hallow Short Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#30BA87', drop: null as unknown as string, vanilla: { sheet: 110, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_621_slice_of_cake', name: 'Slice of Cake', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#8E6A67', drop: null as unknown as string, vanilla: { sheet: 621, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_387_trap_door_closed', name: 'Trap Door (Closed)', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 1, mapColor: '#7F5C45', drop: null as unknown as string, vanilla: { sheet: 387, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_316_blue_jellyfish_jar', name: 'Blue Jellyfish Jar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null as unknown as string, vanilla: { sheet: 316, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_125_crystal_ball', name: 'Crystal Ball', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#8DAFFF', drop: null as unknown as string, vanilla: { sheet: 125, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_287_ammo_box', name: 'Ammo Box', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#4F8011', drop: null as unknown as string, vanilla: { sheet: 287, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_294_zebra_swallowtail_butterfly_jar', name: 'Zebra Swallowtail Butterfly Jar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null as unknown as string, vanilla: { sheet: 294, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_291_ulysses_butterfly_jar', name: 'Ulysses Butterfly Jar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null as unknown as string, vanilla: { sheet: 291, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_292_sulphur_butterfly_jar', name: 'Sulphur Butterfly Jar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null as unknown as string, vanilla: { sheet: 292, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_289_purple_emperor_butterfly_jar', name: 'Purple Emperor Butterfly Jar', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null as unknown as string, vanilla: { sheet: 289, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_172_sinks', name: 'Sinks', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#B5C2D9', drop: null as unknown as string, vanilla: { sheet: 172, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_656_glow_tulip', name: 'Glow Tulip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#3995B3', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 656, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_113_hallow_tall_plants', name: 'Hallow Tall Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#30D0EA', drop: null as unknown as string, vanilla: { sheet: 113, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_235_teleporter', name: 'Teleporter', solid: true, framed: true, opacity: 1, pick: 0, w: 3, h: 1, mapColor: '#D6B82E', drop: null as unknown as string, vanilla: { sheet: 235, frame: 'style', fw: 3, fh: 1 } });
def({ key: 'v_567_garden_gnome', name: 'Garden Gnome', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#938381', drop: null as unknown as string, vanilla: { sheet: 567, frame: 'style', fw: 1, fh: 2 } });

// 装饰/植物/藤蔓（非实心非framed）
def({ key: 'v_638_ash_vines', name: 'Ash Vines', decor: true, opacity: 0, pick: 0, mapColor: '#844A3C', drop: null as unknown as string, vanilla: { sheet: 638, frame: 'auto' } });
def({ key: 'v_528_mushroom_vines', name: 'Mushroom Vines', decor: true, opacity: 0, pick: 0, mapColor: '#827E5D', drop: null as unknown as string, vanilla: { sheet: 528, frame: 'auto' } });
def({ key: 'v_382_flower_vines', name: 'Flower Vines', decor: true, opacity: 0, pick: 0, mapColor: '#1CD85E', drop: null as unknown as string, vanilla: { sheet: 382, frame: 'auto' } });
def({ key: 'v_124_wooden_beam', name: 'Wooden Beam', decor: true, opacity: 0, pick: 0, mapColor: '#493324', drop: null as unknown as string, vanilla: { sheet: 124, frame: 'auto' } });
def({ key: 'v_575_rich_mahogany_beam', name: 'Rich Mahogany Beam', decor: true, opacity: 0, pick: 0, mapColor: '#60393C', drop: null as unknown as string, vanilla: { sheet: 575, frame: 'auto' } });
def({ key: 'v_213_rope', name: 'Rope', decor: true, opacity: 0, pick: 0, mapColor: '#897843', drop: null as unknown as string, vanilla: { sheet: 213, frame: 'auto' } });
def({ key: 'v_636_corrupt_vines', name: 'Corrupt Vines', decor: true, opacity: 0, pick: 0, mapColor: '#746CA3', drop: null as unknown as string, vanilla: { sheet: 636, frame: 'auto' } });
def({ key: 'v_574_boreal_beam', name: 'Boreal Beam', decor: true, opacity: 0, pick: 0, mapColor: '#44372F', drop: null as unknown as string, vanilla: { sheet: 574, frame: 'auto' } });
def({ key: 'v_333_platinum_coin_pile', name: 'Platinum Coin Pile', decor: true, opacity: 0, pick: 0, mapColor: '#BEBEB2', drop: null as unknown as string, vanilla: { sheet: 333, frame: 'auto' } });
def({ key: 'v_332_gold_coin_pile', name: 'Gold Coin Pile', decor: true, opacity: 0, pick: 0, mapColor: '#CCB548', drop: null as unknown as string, vanilla: { sheet: 332, frame: 'auto' } });
def({ key: 'v_577_sandstone_column', name: 'Sandstone Column', decor: true, opacity: 0, pick: 0, mapColor: '#885635', drop: null as unknown as string, vanilla: { sheet: 577, frame: 'auto' } });
def({ key: 'v_561_marble_column', name: 'Marble Column', decor: true, opacity: 0, pick: 0, mapColor: '#6E7482', drop: null as unknown as string, vanilla: { sheet: 561, frame: 'auto' } });
def({ key: 'v_576_granite_column', name: 'Granite Column', decor: true, opacity: 0, pick: 0, mapColor: '#242659', drop: null as unknown as string, vanilla: { sheet: 576, frame: 'auto' } });
def({ key: 'v_214_chain', name: 'Chain', decor: true, opacity: 0, pick: 0, mapColor: '#676767', drop: null as unknown as string, vanilla: { sheet: 214, frame: 'auto' } });
def({ key: 'v_578_mushroom_beam', name: 'Mushroom Beam', decor: true, opacity: 0, pick: 0, mapColor: '#575340', drop: null as unknown as string, vanilla: { sheet: 578, frame: 'auto' } });

// cleared 组补全（藤蔓/荆棘，原版 51/52/62/69）
def({ key: 'v_52_vines', name: 'Vines', decor: true, opacity: 0, pick: 0, mapColor: '#3E7A2E', drop: null as unknown as string, vanilla: { sheet: 52, frame: 'auto' } });
def({ key: 'v_62_jungle_vines', name: 'Jungle Vines', decor: true, opacity: 0, pick: 0, mapColor: '#2E8B3D', drop: null as unknown as string, vanilla: { sheet: 62, frame: 'auto' } });
def({ key: 'v_69_jungle_thorns', name: 'Jungle Thorns', decor: true, opacity: 0, pick: 0, mapColor: '#4A5E3E', drop: null as unknown as string, vanilla: { sheet: 69, frame: 'auto' } });

// ===================== FTW_V2 兼容补全 =====================
def({ key: 'v_625_neon_moss_block', name: 'Neon Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#906094', blend: true, drop: null as unknown as string, vanilla: { sheet: 625, frame: 'auto' } });
def({ key: 'v_151_sandstone_brick', name: 'Sandstone Brick', solid: true, opacity: 1, pick: 0, mapColor: '#BEAB5E', blend: true, drop: null as unknown as string, vanilla: { sheet: 151, frame: 'auto' } });
def({ key: 'v_234_crimsand_block', name: 'Crimsand Block', solid: true, opacity: 1, pick: 0, mapColor: '#352C29', blend: true, drop: null as unknown as string, vanilla: { sheet: 234, frame: 'auto' } });
def({ key: 'v_182_blue_moss_block', name: 'Blue Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#2B568C', blend: true, drop: null as unknown as string, vanilla: { sheet: 182, frame: 'auto' } });
def({ key: 'v_205_crimson_vines', name: 'Crimson Vines', solid: true, opacity: 1, pick: 0, mapColor: '#BA3234', blend: true, drop: null as unknown as string, vanilla: { sheet: 205, frame: 'auto' } });
def({ key: 'v_45_gold_brick', name: 'Gold Brick', solid: true, opacity: 1, pick: 0, mapColor: '#B9A417', blend: true, drop: null as unknown as string, vanilla: { sheet: 45, frame: 'auto' } });
def({ key: 'v_399_crimson_hardened_sand_block', name: 'Crimson Hardened Sand Block', solid: true, opacity: 1, pick: 0, mapColor: '#4D4C42', blend: true, drop: null as unknown as string, vanilla: { sheet: 399, frame: 'auto' } });
def({ key: 'v_352_crimtane_thorns', name: 'Crimtane Thorns', solid: true, opacity: 1, pick: 0, mapColor: '#EE615E', blend: true, drop: null as unknown as string, vanilla: { sheet: 352, frame: 'auto' } });
def({ key: 'v_248_palladium_column', name: 'Palladium Column', solid: true, opacity: 1, pick: 0, mapColor: '#DB4726', blend: true, drop: null as unknown as string, vanilla: { sheet: 248, frame: 'auto' } });
def({ key: 'v_340_living_cursed_fire_block', name: 'Living Cursed Fire Block', solid: true, opacity: 1, pick: 0, mapColor: '#60F802', blend: true, drop: null as unknown as string, vanilla: { sheet: 340, frame: 'auto' } });
def({ key: 'v_207_water_fountains', name: 'Water Fountains', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 4, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 207, frame: 'style', fw: 2, fh: 4 } });
def({ key: 'v_144_timers', name: 'Timers', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 144, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_475_hat_rack', name: 'Hat Rack', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#6B4F3B', drop: null as unknown as string, vanilla: { sheet: 475, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_175_tin_brick', name: 'Tin Brick', solid: true, opacity: 1, pick: 0, mapColor: '#817D5D', blend: true, drop: null as unknown as string, vanilla: { sheet: 175, frame: 'auto' } });
def({ key: 'v_132_lever', name: 'Lever', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null as unknown as string, vanilla: { sheet: 132, frame: 'style', fw: 2, fh: 2 } });

// ===================== 不负责任的女妖啤酒厂 兼容补全 =====================
def({ key: 'v_539_argon_moss_block', name: 'Argon Moss Block', solid: true, opacity: 1, pick: 0, mapColor: '#9A6387', blend: true, drop: null as unknown as string, vanilla: { sheet: 539, frame: 'auto' } });
def({ key: 'v_481_cracked_blue_brick', name: 'Cracked Blue Brick', solid: true, opacity: 1, pick: 0, mapColor: '#383E50', blend: true, drop: null as unknown as string, vanilla: { sheet: 481, frame: 'auto' } });
def({ key: 'v_120_mudstone_brick', name: 'Mudstone Brick', solid: true, opacity: 1, pick: 0, mapColor: '#5C4449', blend: true, drop: null as unknown as string, vanilla: { sheet: 120, frame: 'auto' } });
def({ key: 'v_714_spider_boulder', name: 'Spider Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null as unknown as string, vanilla: { sheet: 714, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_752_chillet_egg', name: 'Chillet Egg', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null as unknown as string, vanilla: { sheet: 752, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_751_sleeping_digtoise', name: 'Sleeping Digtoise', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#baa854', drop: null as unknown as string, vanilla: { sheet: 751, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_664_bouncy_boulder', name: 'Bouncy Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#497811', drop: null as unknown as string, vanilla: { sheet: 664, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_711_rainbow_boulder', name: 'Rainbow Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#b6af82', drop: null as unknown as string, vanilla: { sheet: 711, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_715_ghoulder', name: 'Ghoulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null as unknown as string, vanilla: { sheet: 715, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_716_friendly_boulder', name: 'Friendly Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null as unknown as string, vanilla: { sheet: 716, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_713_lava_boulder', name: 'Lava Boulder', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null as unknown as string, vanilla: { sheet: 713, frame: 'style', fw: 2, fh: 2 } });

// ===================== wld 独立映射修复（原为错误复用） =====================
def({ key: 'v_23_corrupt_grass_block', name: 'Corrupt Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#8D89DF', blend: true, drop: null as unknown as string, vanilla: { sheet: 23, frame: 'auto' } });
def({ key: 'v_31_orb_heart', name: 'Orb Heart', solid: true, opacity: 1, pick: 0, mapColor: '#8D78A8', blend: true, drop: null as unknown as string, vanilla: { sheet: 31, frame: 'auto' } });
def({ key: 'v_41_blue_brick', name: 'Blue Brick', solid: true, opacity: 1, pick: 0, mapColor: '#42546D', blend: true, drop: null as unknown as string, vanilla: { sheet: 41, frame: 'auto' } });
def({ key: 'v_75_obsidian_brick', name: 'Obsidian Brick', solid: true, opacity: 1, pick: 0, mapColor: '#242424', blend: true, drop: null as unknown as string, vanilla: { sheet: 75, frame: 'auto' } });
def({ key: 'v_199_crimson_grass_block', name: 'Crimson Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#D05050', blend: true, drop: null as unknown as string, vanilla: { sheet: 199, frame: 'auto' } });
def({ key: 'v_60_jungle_grass_block', name: 'Jungle Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#8FD71D', blend: true, drop: null as unknown as string, vanilla: { sheet: 60, frame: 'auto' } });
def({ key: 'v_70_mushroom_grass_block', name: 'Mushroom Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#5D7FFF', blend: true, drop: null as unknown as string, vanilla: { sheet: 70, frame: 'auto' } });

def({ key: 'v_25_ebonstone_block', name: 'Ebonstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#6D5A80', blend: true, drop: null as unknown as string, vanilla: { sheet: 25, frame: 'auto' } });
def({ key: 'v_202_sunplate_block', name: 'Sunplate Block', solid: true, opacity: 1, pick: 0, mapColor: '#D5B21C', blend: true, drop: null as unknown as string, vanilla: { sheet: 202, frame: 'auto' } });
def({ key: 'v_71_mushroom_plant', name: 'Mushroom Plant', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#B6AF82', drop: null as unknown as string, vanilla: { sheet: 71, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_24_corruption_short_plants', name: 'Corruption Short Plants', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#7A74DA', drop: null as unknown as string, vanilla: { sheet: 24, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_32_corruption_thorns', name: 'Corruption Thorns', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9787B7', drop: null as unknown as string, vanilla: { sheet: 32, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_27_sunflower', name: 'Sunflower', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 4, mapColor: '#E2C431', drop: null as unknown as string, vanilla: { sheet: 27, frame: 'style', fw: 2, fh: 4 } });
def({ key: 'v_5_trees', name: 'Trees', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#6B4A2B', drop: null as unknown as string, vanilla: { sheet: 5, frame: 'style', fw: 1, fh: 1 } });

// 所有 def() 注册完毕后统一回填 key→id 映射（必须位于文件末尾）
TILE_DEFS.forEach((d, i) => (TILE_BY_KEY[d.key] = i));

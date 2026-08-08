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
    frame: 'auto' | 'style' | 'blend'; // auto=47 表 8 向；style=显式帧；blend=BlendRules 合并分帧（泥土/石/草族）
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
def({ key: 'dirt', name: '泥土', solid: true, opacity: 1, pick: 0, mapColor: '#976B4B', blend: true, drop: 'dirt_block', vanilla: { sheet: 0, frame: 'blend' } });
def({ key: 'stone', name: '石块', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: 'stone_block', vanilla: { sheet: 1, frame: 'blend' } });
def({ key: 'grass', name: '草块', solid: true, opacity: 1, pick: 0, mapColor: '#1CD85E', blend: true, drop: 'dirt_block', vanilla: { sheet: 2, frame: 'blend' } });
def({ key: 'ore_copper', name: '铜矿', solid: true, opacity: 1, pick: 0, mapColor: '#964316', blend: false, drop: 'copper_ore', vanilla: { sheet: 7, frame: 'auto' } });
def({ key: 'ore_iron', name: '铁矿', solid: true, opacity: 1, pick: 0, mapColor: '#8C6A56', blend: false, drop: 'iron_ore', vanilla: { sheet: 6, frame: 'auto' } });
def({ key: 'ore_silver', name: '银矿', solid: true, opacity: 1, pick: 20, mapColor: '#B9C2C3', blend: false, drop: 'silver_ore', vanilla: { sheet: 9, frame: 'auto' } });
def({ key: 'ore_gold', name: '金矿', solid: true, opacity: 1, pick: 40, mapColor: '#B9A417', blend: false, drop: 'gold_ore', vanilla: { sheet: 8, frame: 'auto' } });
def({ key: 'tree', name: '树干', solid: false, framed: true, opacity: 0.1, axe: 0, mapColor: '#6B4A2B', drop: 'wood', vanilla: { sheet: 5, frame: 'style', fw: 1, fh: 1 } });
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
def({ key: 'mushroom', name: '蘑菇', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#C36927', drop: 'mushroom_item', vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'flower', name: '花', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#D0699E', drop: null as unknown as string, vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'tallgrass', name: '草丛', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#1E9648', drop: 'acorn', vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'sand', name: '沙块', solid: true, opacity: 1, pick: 0, mapColor: '#FFDA38', blend: true, drop: 'sand_block', vanilla: { sheet: 53, frame: 'blend' } });
def({ key: 'snow', name: '雪块', solid: true, opacity: 1, pick: 0, mapColor: '#E8F0F4', blend: true, drop: 'snow_block', vanilla: { sheet: 147, frame: 'blend' } });
def({ key: 'acorn_sapling', name: '树苗', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#6B4A2B', drop: 'acorn', vanilla: { sheet: 20, frame: 'style', fw: 1, fh: 1 } });
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
def({ key: 'mud', name: '泥块', solid: true, opacity: 1, pick: 0, mapColor: '#5C4449', blend: true, drop: 'mud_block', vanilla: { sheet: 59, frame: 'blend' } });
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

// ---- 墙（id 直用原版 wld 墙 id：0 空 / 1 石墙 / 2 土墙(天然) / 3 黑檀石 / 4 木墙 …）----
export interface WallDef { id: number; key: string; name: string; mapColor: string; opacity: number; largeFrame?: 0 | 1 | 2; }
export const W = { NONE: 0, STONE: 1, DIRT: 2, WOOD: 4 } as const;
export const WALL_DEFS: WallDef[] = [];
export function wallDef(d: WallDef) { WALL_DEFS[d.id] = d; }
export const WALL_BY_KEY: Record<string, number> = {};

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
def({ key: 'v_117_pearlstone_block', name: 'Pearlstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#B5ACBE', blend: true, drop: null as unknown as string, vanilla: { sheet: 117, frame: 'blend' } });
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
def({ key: 'v_634_ash_tree', name: 'Ash Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#7D5453', drop: null as unknown as string, vanilla: { sheet: 634, frame: 'style', fw: 1, fh: 1 } });
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
def({ key: 'v_586_emerald_tree', name: 'Emerald Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 586, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_596_vanity_tree_sakura', name: 'Vanity Tree Sakura', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#6E5B4D', drop: null as unknown as string, vanilla: { sheet: 596, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_467_chests_group_2', name: 'Chests (Group 2)', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E9CF5E', drop: null as unknown as string, vanilla: { sheet: 467, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_443_geyser', name: 'Geyser', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#7b7b7b', drop: null as unknown as string, vanilla: { sheet: 443, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_589_amber_tree', name: 'Amber Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 589, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_411_detonator', name: 'Detonator', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E32E2E', drop: null as unknown as string, vanilla: { sheet: 411, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_518_lily_pads', name: 'Lily Pads', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#6C5F84', drop: null as unknown as string, vanilla: { sheet: 518, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_588_diamond_tree', name: 'Diamond Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 588, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_585_sapphire_tree', name: 'Sapphire Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 585, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_583_topaz_tree', name: 'Topaz Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 583, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_13_placed_bottles', name: 'Placed Bottles', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#85D5F7', drop: null as unknown as string, vanilla: { sheet: 13, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_530_oasis_plants', name: 'Oasis Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#5B546C', drop: null as unknown as string, vanilla: { sheet: 530, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_616_vanity_tree_yellow_willow', name: 'Vanity Tree Yellow Willow', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#854F4D', drop: null as unknown as string, vanilla: { sheet: 616, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_215_campfires', name: 'Campfires', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FE7902', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 215, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_141_explosives', name: 'Explosives', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#C03B3B', drop: null as unknown as string, vanilla: { sheet: 141, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_597_pylons', name: 'Pylons', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#787F4B', drop: null as unknown as string, vanilla: { sheet: 597, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_592_hanging_brazier', name: 'Hanging Brazier', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#A57345', drop: null as unknown as string, light: [255, 185, 110], vanilla: { sheet: 592, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_375_honey_drip', name: 'Honey Drip', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF9C0C', drop: null as unknown as string, vanilla: { sheet: 375, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_227_dye_plants', name: 'Dye Plants', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null as unknown as string, vanilla: { sheet: 227, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_584_amethyst_tree', name: 'Amethyst Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 584, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_231_larva', name: 'Larva', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#E0C265', drop: null as unknown as string, vanilla: { sheet: 231, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_395_item_frame', name: 'Item Frame', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#BF8E6F', drop: null as unknown as string, vanilla: { sheet: 395, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_241_catacombs', name: 'Catacombs', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 3, mapColor: '#4D4A48', drop: null as unknown as string, vanilla: { sheet: 241, frame: 'style', fw: 4, fh: 3 } });
def({ key: 'v_587_ruby_tree', name: 'Ruby Tree', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null as unknown as string, vanilla: { sheet: 587, frame: 'style', fw: 1, fh: 1 } });
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
def({ key: 'v_23_corrupt_grass_block', name: 'Corrupt Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#8D89DF', blend: true, drop: null as unknown as string, vanilla: { sheet: 23, frame: 'blend' } });
def({ key: 'v_31_orb_heart', name: 'Orb Heart', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#8D78A8', drop: null as unknown as string, vanilla: { sheet: 31, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_41_blue_brick', name: 'Blue Brick', solid: true, opacity: 1, pick: 0, mapColor: '#42546D', blend: true, drop: null as unknown as string, vanilla: { sheet: 41, frame: 'auto' } });
def({ key: 'v_75_obsidian_brick', name: 'Obsidian Brick', solid: true, opacity: 1, pick: 0, mapColor: '#242424', blend: true, drop: null as unknown as string, vanilla: { sheet: 75, frame: 'auto' } });
def({ key: 'v_199_crimson_grass_block', name: 'Crimson Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#D05050', blend: true, drop: null as unknown as string, vanilla: { sheet: 199, frame: 'blend' } });
def({ key: 'v_60_jungle_grass_block', name: 'Jungle Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#8FD71D', blend: true, drop: null as unknown as string, vanilla: { sheet: 60, frame: 'blend' } });
def({ key: 'v_70_mushroom_grass_block', name: 'Mushroom Grass Block', solid: true, opacity: 1, pick: 0, mapColor: '#5D7FFF', blend: true, drop: null as unknown as string, vanilla: { sheet: 70, frame: 'blend' } });

def({ key: 'v_25_ebonstone_block', name: 'Ebonstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#6D5A80', blend: true, drop: null as unknown as string, vanilla: { sheet: 25, frame: 'blend' } });
def({ key: 'v_202_sunplate_block', name: 'Sunplate Block', solid: true, opacity: 1, pick: 0, mapColor: '#D5B21C', blend: true, drop: null as unknown as string, vanilla: { sheet: 202, frame: 'auto' } });
def({ key: 'v_71_mushroom_plant', name: 'Mushroom Plant', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#B6AF82', drop: null as unknown as string, vanilla: { sheet: 71, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_24_corruption_short_plants', name: 'Corruption Short Plants', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#7A74DA', drop: null as unknown as string, vanilla: { sheet: 24, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_32_corruption_thorns', name: 'Corruption Thorns', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9787B7', drop: null as unknown as string, vanilla: { sheet: 32, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_27_sunflower', name: 'Sunflower', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 4, mapColor: '#E2C431', drop: null as unknown as string, vanilla: { sheet: 27, frame: 'style', fw: 2, fh: 4 } });
def({ key: 'v_5_trees', name: 'Trees', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#6B4A2B', drop: null as unknown as string, vanilla: { sheet: 5, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_80_cactus', name: 'Cactus Plant', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#5A7A3A', drop: null as unknown as string, vanilla: { sheet: 80, frame: 'style', fw: 1, fh: 1 } });

def({ key: 'v_3_forest_short_plants', name: 'Forest Short Plants', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null as unknown as string, vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_73_forest_tall_plants', name: 'Forest Tall Plants', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null as unknown as string, vanilla: { sheet: 73, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_83_herbs_mature', name: 'Herbs (Mature)', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9BC924', drop: null as unknown as string, vanilla: { sheet: 83, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_84_herbs_bloom', name: 'Herbs (Bloom)', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9BC924', drop: null as unknown as string, vanilla: { sheet: 84, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_72_mushroom_tree', name: 'Mushroom Tree', decor: true, framed: true, opacity: 0, pick: -1, axe: 0, mapColor: '#5D7FFF', drop: null as unknown as string, vanilla: { sheet: 72, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_43_green_brick', name: 'Green Brick', solid: true, opacity: 1, pick: 0, mapColor: '#3E6046', blend: true, drop: null as unknown as string, vanilla: { sheet: 43, frame: 'auto' } });
def({ key: 'v_44_pink_brick', name: 'Pink Brick', solid: true, opacity: 1, pick: 0, mapColor: '#6B4463', blend: true, drop: null as unknown as string, vanilla: { sheet: 44, frame: 'auto' } });
def({ key: 'v_203_crimstone_block', name: 'Crimstone Block', solid: true, opacity: 1, pick: 0, mapColor: '#802C2D', blend: true, drop: null as unknown as string, vanilla: { sheet: 203, frame: 'blend' } });
def({ key: 'v_201_crimson_short_plants', name: 'Crimson Short Plants', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#CB3D40', drop: null as unknown as string, vanilla: { sheet: 201, frame: 'style', fw: 1, fh: 1 } });

// 所有 def() 注册完毕后统一回填 key→id 映射（必须位于文件末尾）
TILE_DEFS.forEach((d, i) => (TILE_BY_KEY[d.key] = i));

// ===================== 墙注册表（TEdit walls.json 全量生成） =====================
wallDef({ id: 0, key: 'w0_none', name: 'Sky', mapColor: '#000000', opacity: 0 });
wallDef({ id: 1, key: 'w1_stone', name: 'Stone Wall', mapColor: '#353535', opacity: 1 });
wallDef({ id: 2, key: 'w2_dirtunsafe', name: 'Dirt Wall (natural)', mapColor: '#573C30', opacity: 1 });
wallDef({ id: 3, key: 'w3_ebonstoneunsafe', name: 'Ebonstone Wall (natural)', mapColor: '#2F2935', opacity: 1 });
wallDef({ id: 4, key: 'w4_wood', name: 'Wood Wall', mapColor: '#453225', opacity: 1 });
wallDef({ id: 5, key: 'w5_graybrick', name: 'Gray Brick Wall', mapColor: '#3B3B3B', opacity: 1 });
wallDef({ id: 6, key: 'w6_redbrick', name: 'Red Brick Wall', mapColor: '#4C2C29', opacity: 1 });
wallDef({ id: 7, key: 'w7_bluedungeonunsafe', name: 'Cursed Blue Brick Wall', mapColor: '#2E3243', opacity: 1 });
wallDef({ id: 8, key: 'w8_greendungeonunsafe', name: 'Cursed Green Brick Wall', mapColor: '#313D3D', opacity: 1 });
wallDef({ id: 9, key: 'w9_pinkdungeonunsafe', name: 'Cursed Pink Brick Wall', mapColor: '#4B2E46', opacity: 1 });
wallDef({ id: 10, key: 'w10_goldbrick', name: 'Gold Brick Wall', mapColor: '#6B5B22', opacity: 1 });
wallDef({ id: 11, key: 'w11_silverbrick', name: 'Silver Brick Wall', mapColor: '#4F5556', opacity: 1 });
wallDef({ id: 12, key: 'w12_copperbrick', name: 'Copper Brick Wall', mapColor: '#653919', opacity: 1 });
wallDef({ id: 13, key: 'w13_hellstonebrickunsafe', name: 'Hellstone Brick Wall (natural)', mapColor: '#4D302B', opacity: 1 });
wallDef({ id: 14, key: 'w14_obsidianbrickunsafe', name: 'Obsidian Brick Wall (natural)', mapColor: '#0C0C0C', opacity: 1 });
wallDef({ id: 15, key: 'w15_mudunsafe', name: 'Mud Wall (natural)', mapColor: '#312B2C', opacity: 1 });
wallDef({ id: 16, key: 'w16_dirt', name: 'Dirt Wall', mapColor: '#513F36', opacity: 1 });
wallDef({ id: 17, key: 'w17_bluedungeon', name: 'Blue Brick Wall', mapColor: '#2E3243', opacity: 1 });
wallDef({ id: 18, key: 'w18_greendungeon', name: 'Green Brick Wall', mapColor: '#313D3D', opacity: 1 });
wallDef({ id: 19, key: 'w19_pinkdungeon', name: 'Pink Brick Wall', mapColor: '#4B2E46', opacity: 1 });
wallDef({ id: 20, key: 'w20_obsidianbrick', name: 'Obsidian Brick Wall', mapColor: '#0C0C0C', opacity: 1 });
wallDef({ id: 21, key: 'w21_glass', name: 'Glass Wall', mapColor: '#365962', opacity: 1 });
wallDef({ id: 22, key: 'w22_pearlstonebrick', name: 'Pearlstone Brick Wall', mapColor: '#615C5E', opacity: 1 });
wallDef({ id: 23, key: 'w23_iridescentbrick', name: 'Iridescent Brick Wall', mapColor: '#382C3A', opacity: 1 });
wallDef({ id: 24, key: 'w24_mudstonebrick', name: 'Mudstone Brick Wall', mapColor: '#31282A', opacity: 1 });
wallDef({ id: 25, key: 'w25_cobaltbrick', name: 'Cobalt Brick Wall', mapColor: '#124262', opacity: 1 });
wallDef({ id: 26, key: 'w26_mythrilbrick', name: 'Mythril Brick Wall', mapColor: '#224036', opacity: 1 });
wallDef({ id: 27, key: 'w27_planked', name: 'Planked Wall', mapColor: '#3A302A', opacity: 1 });
wallDef({ id: 28, key: 'w28_pearlstonebrickunsafe', name: 'Pearlstone Wall (natural)', mapColor: '#4D4651', opacity: 1 });
wallDef({ id: 29, key: 'w29_candycane', name: 'Red Candy Cane Wall', mapColor: '#703A44', opacity: 1 });
wallDef({ id: 30, key: 'w30_greencandycane', name: 'Green Candy Cane Wall', mapColor: '#387350', opacity: 1 });
wallDef({ id: 31, key: 'w31_snowbrick', name: 'Snow Brick Wall', mapColor: '#5E656C', opacity: 1 });
wallDef({ id: 32, key: 'w32_adamantitebeam', name: 'Adamantite Beam Wall', mapColor: '#661430', opacity: 1 });
wallDef({ id: 33, key: 'w33_demonitebrick', name: 'Demonite Brick Wall', mapColor: '#303049', opacity: 1 });
wallDef({ id: 34, key: 'w34_sandstonebrick', name: 'Sandstone Brick Wall', mapColor: '#565339', opacity: 1 });
wallDef({ id: 35, key: 'w35_ebonstonebrick', name: 'Ebonstone Brick Wall', mapColor: '#363B52', opacity: 1 });
wallDef({ id: 36, key: 'w36_redstucco', name: 'Red Stucco Wall', mapColor: '#7C463F', opacity: 1 });
wallDef({ id: 37, key: 'w37_yellowstucco', name: 'Yellow Stucco Wall', mapColor: '#595437', opacity: 1 });
wallDef({ id: 38, key: 'w38_greenstucco', name: 'Green Stucco Wall', mapColor: '#3C5A46', opacity: 1 });
wallDef({ id: 39, key: 'w39_gray', name: 'Gray Stucco Wall', mapColor: '#595954', opacity: 1 });
wallDef({ id: 40, key: 'w40_snowwallunsafe', name: 'Snow Wall (natural)', mapColor: '#647681', opacity: 1 });
wallDef({ id: 41, key: 'w41_ebonwood', name: 'Ebonwood Wall', mapColor: '#393740', opacity: 1 });
wallDef({ id: 42, key: 'w42_richmaogany', name: 'Rich Mahogany Wall', mapColor: '#3E191B', opacity: 1 });
wallDef({ id: 43, key: 'w43_pearlwood', name: 'Pearlwood Wall', mapColor: '#3C372C', opacity: 1 });
wallDef({ id: 44, key: 'w44_rainbowbrick', name: 'Rainbow Brick Wall', mapColor: '#333333', opacity: 1 });
wallDef({ id: 45, key: 'w45_tinbrick', name: 'Tin Brick Wall', mapColor: '#413F39', opacity: 1 });
wallDef({ id: 46, key: 'w46_tungstenbrick', name: 'Tungsten Brick Wall', mapColor: '#445345', opacity: 1 });
wallDef({ id: 47, key: 'w47_platinumbrick', name: 'Platinum Brick Wall', mapColor: '#424652', opacity: 1 });
wallDef({ id: 48, key: 'w48_amethystunsafe', name: 'Amethyst Wall (natural)', mapColor: '#4E4553', opacity: 1 });
wallDef({ id: 49, key: 'w49_topazunsafe', name: 'Topaz Wall (natural)', mapColor: '#514A3F', opacity: 1 });
wallDef({ id: 50, key: 'w50_sapphireunsafe', name: 'Sapphire Wall (natural)', mapColor: '#384251', opacity: 1 });
wallDef({ id: 51, key: 'w51_emeraldunsafe', name: 'Emerald Wall (natural)', mapColor: '#32493B', opacity: 1 });
wallDef({ id: 52, key: 'w52_rubyunsafe', name: 'Ruby Wall (natural)', mapColor: '#523B40', opacity: 1 });
wallDef({ id: 53, key: 'w53_diamondunsafe', name: 'Diamond Wall (natural)', mapColor: '#464F51', opacity: 1 });
wallDef({ id: 54, key: 'w54_caveunsafe', name: 'Green Mossy Wall (natural)', mapColor: '#2E3A36', opacity: 1 });
wallDef({ id: 55, key: 'w55_cave2unsafe', name: 'Brown Mossy Wall (natural)', mapColor: '#38382E', opacity: 1 });
wallDef({ id: 56, key: 'w56_cave3unsafe', name: 'Red Mossy Wall (natural)', mapColor: '#393131', opacity: 1 });
wallDef({ id: 57, key: 'w57_cave4unsafe', name: 'Blue Mossy Wall (natural)', mapColor: '#2D3338', opacity: 1 });
wallDef({ id: 58, key: 'w58_cave5unsafe', name: 'Purple Mossy Wall (natural)', mapColor: '#38303B', opacity: 1 });
wallDef({ id: 59, key: 'w59_cave6unsafe', name: 'Rocky Dirt Wall (natural)', mapColor: '#503F37', opacity: 1 });
wallDef({ id: 60, key: 'w60_livingleaf', name: 'Living Leaf Wall (natural)', mapColor: '#003111', opacity: 1 });
wallDef({ id: 61, key: 'w61_cave7unsafe', name: 'Old Stone Wall (natural)', mapColor: '#37281C', opacity: 1 });
wallDef({ id: 62, key: 'w62_spiderunsafe', name: 'Infested Spider Wall', mapColor: '#201C16', opacity: 1 });
wallDef({ id: 63, key: 'w63_grassunsafe', name: 'Grass Wall (natural)', mapColor: '#194326', opacity: 1 });
wallDef({ id: 64, key: 'w64_jungleunsafe', name: 'Jungle Wall (natural)', mapColor: '#2F4319', opacity: 1 });
wallDef({ id: 65, key: 'w65_flowerunsafe', name: 'Flower Wall (natural)', mapColor: '#194326', opacity: 1 });
wallDef({ id: 66, key: 'w66_grass', name: 'Grass Wall', mapColor: '#194326', opacity: 1 });
wallDef({ id: 67, key: 'w67_jungle', name: 'Jungle Wall', mapColor: '#2F4319', opacity: 1 });
wallDef({ id: 68, key: 'w68_flower', name: 'Flower Wall', mapColor: '#194326', opacity: 1 });
wallDef({ id: 69, key: 'w69_corruptgrassunsafe', name: 'Corrupt Grass Wall (natural)', mapColor: '#242539', opacity: 1 });
wallDef({ id: 70, key: 'w70_hallowedgrassunsafe', name: 'Hallowed Grass Wall (natural)', mapColor: '#193D43', opacity: 1 });
wallDef({ id: 71, key: 'w71_iceunsafe', name: 'Ice Wall (natural)', mapColor: '#526C86', opacity: 1 });
wallDef({ id: 72, key: 'w72_cactus', name: 'Cactus Wall', mapColor: '#2D5418', opacity: 1 });
wallDef({ id: 73, key: 'w73_cloud', name: 'Cloud Wall', mapColor: '#D3D9DB', opacity: 1 });
wallDef({ id: 74, key: 'w74_mushroom', name: 'Mushroom Wall', mapColor: '#363C71', opacity: 1 });
wallDef({ id: 75, key: 'w75_bone', name: 'Bone Block Wall', mapColor: '#3D3D2C', opacity: 1 });
wallDef({ id: 76, key: 'w76_slime', name: 'Slime Block Wall', mapColor: '#1A336F', opacity: 1 });
wallDef({ id: 77, key: 'w77_flesh', name: 'Flesh Block Wall', mapColor: '#4B1216', opacity: 1 });
wallDef({ id: 78, key: 'w78_livingwood', name: 'Living Wood Wall', mapColor: '#3A2318', opacity: 1 });
wallDef({ id: 79, key: 'w79_obsidianbackunsafe', name: 'Obsidian Back Wall (natural)', mapColor: '#242141', opacity: 1 });
wallDef({ id: 80, key: 'w80_mushroomunsafe', name: 'Mushroom Wall (natural)', mapColor: '#363C71', opacity: 1 });
wallDef({ id: 81, key: 'w81_crimsongrassunsafe', name: 'Crimson Grass Wall (natural)', mapColor: '#653434', opacity: 1 });
wallDef({ id: 82, key: 'w82_discwall', name: 'Disc Wall', mapColor: '#381300', opacity: 1 });
wallDef({ id: 83, key: 'w83_crimstoneunsafe', name: 'Crimstone Wall (natural)', mapColor: '#3E2C2D', opacity: 1 });
wallDef({ id: 84, key: 'w84_icebrick', name: 'Ice Brick Wall', mapColor: '#4E6983', opacity: 1 });
wallDef({ id: 85, key: 'w85_shadewood', name: 'Shadewood Wall', mapColor: '#20272D', opacity: 1 });
wallDef({ id: 86, key: 'w86_hiveunsafe', name: 'Hive Wall (natural)', mapColor: '#795024', opacity: 1 });
wallDef({ id: 87, key: 'w87_lihzahrdbrickunsafe', name: 'Forbidden Lihzahrd Brick Wall', mapColor: '#1C080A', opacity: 1 });
wallDef({ id: 88, key: 'w88_purplestainedglass', name: 'Purple Stained Glass', mapColor: '#73447C', opacity: 1 });
wallDef({ id: 89, key: 'w89_yellowstainedglass', name: 'Yellow Stained Glass', mapColor: '#81724A', opacity: 1 });
wallDef({ id: 90, key: 'w90_bluestainedglass', name: 'Blue Stained Glass', mapColor: '#3E567B', opacity: 1 });
wallDef({ id: 91, key: 'w91_greenstainedglass', name: 'Green Stained Glass', mapColor: '#5A795E', opacity: 1 });
wallDef({ id: 92, key: 'w92_redstainedglass', name: 'Red Stained Glass', mapColor: '#873E3D', opacity: 1 });
wallDef({ id: 93, key: 'w93_rainbowstainedglass', name: 'Multicolored Stained Glass', mapColor: '#646067', opacity: 1 });
wallDef({ id: 94, key: 'w94_bluedungeonslabunsafe', name: 'Cursed Blue Slab Wall', mapColor: '#243039', opacity: 1 });
wallDef({ id: 95, key: 'w95_bluedungeontileunsafe', name: 'Cursed Blue Tiled Wall', mapColor: '#302E3A', opacity: 1 });
wallDef({ id: 96, key: 'w96_pinkdungeonslabunsafe', name: 'Cursed Pink Slab Wall', mapColor: '#472E49', opacity: 1 });
wallDef({ id: 97, key: 'w97_pinkdungeontileunsafe', name: 'Cursed Pink Tiled Wall', mapColor: '#4C2E40', opacity: 1 });
wallDef({ id: 98, key: 'w98_greendungeonslabunsafe', name: 'Cursed Green Slab Wall', mapColor: '#333F39', opacity: 1 });
wallDef({ id: 99, key: 'w99_greendungeontileunsafe', name: 'Cursed Green Tiled Wall', mapColor: '#313A40', opacity: 1 });
wallDef({ id: 100, key: 'w100_bluedungeonslab', name: 'Blue Slab Wall', mapColor: '#243039', opacity: 1 });
wallDef({ id: 101, key: 'w101_bluedungeontile', name: 'Blue Tiled Wall', mapColor: '#302E3A', opacity: 1 });
wallDef({ id: 102, key: 'w102_pinkdungeonslab', name: 'Pink Slab Wall', mapColor: '#472E49', opacity: 1 });
wallDef({ id: 103, key: 'w103_pinkdungeontile', name: 'Pink Tiled Wall', mapColor: '#4C2E40', opacity: 1 });
wallDef({ id: 104, key: 'w104_greendungeonslab', name: 'Green Slab Wall', mapColor: '#333F39', opacity: 1 });
wallDef({ id: 105, key: 'w105_greendungeontile', name: 'Green Tiled Wall', mapColor: '#313A40', opacity: 1 });
wallDef({ id: 106, key: 'w106_woodenfence', name: 'Wooden Fence', mapColor: '#614833', opacity: 1 });
wallDef({ id: 107, key: 'w107_metalfence', name: 'Lead Fence', mapColor: '#353535', opacity: 1 });
wallDef({ id: 108, key: 'w108_hive', name: 'Hive Wall', mapColor: '#795024', opacity: 1 });
wallDef({ id: 109, key: 'w109_palladiumcolumn', name: 'Palladium Column Wall', mapColor: '#6E2513', opacity: 1 });
wallDef({ id: 110, key: 'w110_bubblegumblock', name: 'Bubblegum Block Wall', mapColor: '#873989', opacity: 1 });
wallDef({ id: 111, key: 'w111_titanstoneblock', name: 'Titanstone Block Wall', mapColor: '#211915', opacity: 1 });
wallDef({ id: 112, key: 'w112_lihzahrdbrick', name: 'Lihzahrd Brick Wall', mapColor: '#1C080A', opacity: 1 });
wallDef({ id: 113, key: 'w113_pumpkin', name: 'Pumpkin Wall', mapColor: '#A04B07', opacity: 1 });
wallDef({ id: 114, key: 'w114_hay', name: 'Hay Wall', mapColor: '#362A13', opacity: 1 });
wallDef({ id: 115, key: 'w115_spookywood', name: 'Spooky Wood Wall', mapColor: '#2A1E35', opacity: 1 });
wallDef({ id: 116, key: 'w116_christmastreewallpaper', name: 'Christmas Tree Wallpaper', mapColor: '#3C2219', opacity: 1 });
wallDef({ id: 117, key: 'w117_ornamentwallpaper', name: 'Ornament Wallpaper', mapColor: '#5B5340', opacity: 1 });
wallDef({ id: 118, key: 'w118_candycanewallpaper', name: 'Candy Cane Wallpaper', mapColor: '#3B3D36', opacity: 1 });
wallDef({ id: 119, key: 'w119_festivewallpaper', name: 'Festive Wallpaper', mapColor: '#2F2719', opacity: 1 });
wallDef({ id: 120, key: 'w120_starswallpaper', name: 'Stars Wallpaper', mapColor: '#50586F', opacity: 1 });
wallDef({ id: 121, key: 'w121_squiggleswallpaper', name: 'Squiggles Wallpaper', mapColor: '#BAA78A', opacity: 1 });
wallDef({ id: 122, key: 'w122_snowflakewallpaper', name: 'Snowflake Wallpaper', mapColor: '#6E778F', opacity: 1 });
wallDef({ id: 123, key: 'w123_krampushornwallpaper', name: 'Krampus Horn Wallpaper', mapColor: '#8A806E', opacity: 1 });
wallDef({ id: 124, key: 'w124_bluegreenwallpaper', name: 'Bluegreen Wallpaper', mapColor: '#07301E', opacity: 1 });
wallDef({ id: 125, key: 'w125_grinchfingerwallpaper', name: 'Grinch Finger Wallpaper', mapColor: '#4E6746', opacity: 1 });
wallDef({ id: 126, key: 'w126_fancygraywallpaper', name: 'Fancy Gray Wallpaper', mapColor: '#6D6F7B', opacity: 1 });
wallDef({ id: 127, key: 'w127_icefloewallpaper', name: 'Ice Floe Wallpaper', mapColor: '#70A6E2', opacity: 1 });
wallDef({ id: 128, key: 'w128_musicwallpaper', name: 'Music Wallpaper', mapColor: '#45388C', opacity: 1 });
wallDef({ id: 129, key: 'w129_purplerainwallpaper', name: 'Purple Rain Wallpaper', mapColor: '#482C91', opacity: 1 });
wallDef({ id: 130, key: 'w130_rainbowwallpaper', name: 'Rainbow Wallpaper', mapColor: '#725579', opacity: 1 });
wallDef({ id: 131, key: 'w131_sparklestonewallpaper', name: 'Sparkle Stone Wallpaper', mapColor: '#68779E', opacity: 1 });
wallDef({ id: 132, key: 'w132_starlitheavenwallpaper', name: 'Starlit Heaven Wallpaper', mapColor: '#4A4A4A', opacity: 1 });
wallDef({ id: 133, key: 'w133_bubblewallpaper', name: 'Bubble Wallpaper', mapColor: '#5F77BF', opacity: 1 });
wallDef({ id: 134, key: 'w134_copperpipewallpaper', name: 'Copper Pipe Wallpaper', mapColor: '#904F16', opacity: 1 });
wallDef({ id: 135, key: 'w135_duckywallpaper', name: 'Ducky Wallpaper', mapColor: '#3E828A', opacity: 1 });
wallDef({ id: 136, key: 'w136_waterfall', name: 'Waterfall Wall', mapColor: '#3D62A9', opacity: 1 });
wallDef({ id: 137, key: 'w137_lavafall', name: 'Lavafall Wall', mapColor: '#B7540E', opacity: 1 });
wallDef({ id: 138, key: 'w138_ebonwoodfence', name: 'Ebonwood Fence', mapColor: '#3D3945', opacity: 1 });
wallDef({ id: 139, key: 'w139_richmahoganyfence', name: 'Rich Mahogany Fence', mapColor: '#4A2022', opacity: 1 });
wallDef({ id: 140, key: 'w140_pearlwoodfence', name: 'Pearlwood Fence', mapColor: '#6E644C', opacity: 1 });
wallDef({ id: 141, key: 'w141_shadewoodfence', name: 'Shadewood Fence', mapColor: '#42463C', opacity: 1 });
wallDef({ id: 142, key: 'w142_whitedynasty', name: 'White Dynasty Wall', mapColor: '#D6CEBB', opacity: 1 });
wallDef({ id: 143, key: 'w143_bluedynasty', name: 'Blue Dynasty Wall', mapColor: '#536A63', opacity: 1 });
wallDef({ id: 144, key: 'w144_arcanerunes', name: 'Arcane Rune Wall', mapColor: '#594344', opacity: 1 });
wallDef({ id: 145, key: 'w145_ironfence', name: 'Iron Fence', mapColor: '#787878', opacity: 1 });
wallDef({ id: 146, key: 'w146_copperplating', name: 'Copper Plating Wall', mapColor: '#673718', opacity: 1, largeFrame: 1 });
wallDef({ id: 147, key: 'w147_stoneslab', name: 'Stone Slab Wall', mapColor: '#4D4D4D', opacity: 1, largeFrame: 1 });
wallDef({ id: 148, key: 'w148_sail', name: 'Sail', mapColor: '#E5DAA1', opacity: 1 });
wallDef({ id: 149, key: 'w149_borealwood', name: 'Boreal Wood Wall', mapColor: '#524641', opacity: 1 });
wallDef({ id: 150, key: 'w150_borealwoodfence', name: 'Boreal Wood Fence', mapColor: '#51453E', opacity: 1 });
wallDef({ id: 151, key: 'w151_palmwood', name: 'Palm Wood Wall', mapColor: '#674C24', opacity: 1 });
wallDef({ id: 152, key: 'w152_palmwoodfence', name: 'Palm Wood Fence', mapColor: '#674C24', opacity: 1 });
wallDef({ id: 153, key: 'w153_ambergemspark', name: 'Amber Gemspark Wall', mapColor: '#FF743F', opacity: 1 });
wallDef({ id: 154, key: 'w154_amethystgemspark', name: 'Amethyst Gemspark Wall', mapColor: '#BF3FFF', opacity: 1 });
wallDef({ id: 155, key: 'w155_diamondgemspark', name: 'Diamond Gemspark Wall', mapColor: '#DBDBE8', opacity: 1 });
wallDef({ id: 156, key: 'w156_emeraldgemspark', name: 'Emerald Gemspark Wall', mapColor: '#3FFF47', opacity: 1 });
wallDef({ id: 157, key: 'w157_ambergemsparkoff', name: 'Offline Amber Gemspark Wall', mapColor: '#763F25', opacity: 1 });
wallDef({ id: 158, key: 'w158_amethystgemsparkoff', name: 'Offline Amethyst Gemspark Wall', mapColor: '#512576', opacity: 1 });
wallDef({ id: 159, key: 'w159_diamondgemsparkoff', name: 'Offline Diamond Gemspark Wall', mapColor: '#404359', opacity: 1 });
wallDef({ id: 160, key: 'w160_emeraldgemsparkoff', name: 'Offline Emerald Gemspark Wall', mapColor: '#257634', opacity: 1 });
wallDef({ id: 161, key: 'w161_rubygemsparkoff', name: 'Offline Ruby Gemspark Wall', mapColor: '#76253A', opacity: 1 });
wallDef({ id: 162, key: 'w162_sapphiregemsparkoff', name: 'Offline Sapphire Gemspark Wall', mapColor: '#252576', opacity: 1 });
wallDef({ id: 163, key: 'w163_topazgemsparkoff', name: 'Offline Topaz Gemspark Wall', mapColor: '#767125', opacity: 1 });
wallDef({ id: 164, key: 'w164_rubygemspark', name: 'Ruby Gemspark Wall', mapColor: '#FF3F3F', opacity: 1 });
wallDef({ id: 165, key: 'w165_sapphiregemspark', name: 'Sapphire Gemspark Wall', mapColor: '#3F51FF', opacity: 1 });
wallDef({ id: 166, key: 'w166_topazgemspark', name: 'Topaz Gemspark Wall', mapColor: '#EFFF3F', opacity: 1 });
wallDef({ id: 167, key: 'w167_tinplating', name: 'Tin Plating Wall', mapColor: '#4E4D3A', opacity: 1, largeFrame: 1 });
wallDef({ id: 168, key: 'w168_confetti', name: 'Confetti Wall', mapColor: '#546154', opacity: 1 });
wallDef({ id: 169, key: 'w169_confettiblack', name: 'Midnight Confetti Wall', mapColor: '#5C695A', opacity: 1 });
wallDef({ id: 170, key: 'w170_cavewall', name: 'Cave Dirt Wall (natural)', mapColor: '#5D442F', opacity: 1 });
wallDef({ id: 171, key: 'w171_cavewall2', name: 'Rough Dirt Wall (natural)', mapColor: '#543C27', opacity: 1 });
wallDef({ id: 172, key: 'w172_honeyfall', name: 'Honeyfall Wall', mapColor: '#A87D00', opacity: 1 });
wallDef({ id: 173, key: 'w173_chlorophytebrick', name: 'Chlorophyte Brick Wall', mapColor: '#316919', opacity: 1 });
wallDef({ id: 174, key: 'w174_crimtanebrick', name: 'Crimtane Brick Wall', mapColor: '#453036', opacity: 1 });
wallDef({ id: 175, key: 'w175_shroomiteplating', name: 'Shroomite Plating Wall', mapColor: '#2132BC', opacity: 1 });
wallDef({ id: 176, key: 'w176_martianconduit', name: 'Martian Conduit Wall', mapColor: '#4B8094', opacity: 1 });
wallDef({ id: 177, key: 'w177_hellstonebrick', name: 'Hellstone Brick Wall', mapColor: '#48322E', opacity: 1 });
wallDef({ id: 178, key: 'w178_marbleunsafe', name: 'Marble Wall (natural)', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 179, key: 'w179_marbleblock', name: 'Smooth Marble Wall', mapColor: '#7C8394', opacity: 1, largeFrame: 1 });
wallDef({ id: 180, key: 'w180_graniteunsafe', name: 'Granite Wall (natural)', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 181, key: 'w181_graniteblock', name: 'Smooth Granite Wall', mapColor: '#1F1F4A', opacity: 1 });
wallDef({ id: 182, key: 'w182_meteoritebrick', name: 'Meteorite Brick Wall', mapColor: '#393763', opacity: 1 });
wallDef({ id: 183, key: 'w183_marble', name: 'Marble Wall', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 184, key: 'w184_granite', name: 'Granite Wall', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 185, key: 'w185_cave8unsafe', name: 'Craggy Stone Wall (natural)', mapColor: '#3D3D3D', opacity: 1, largeFrame: 2 });
wallDef({ id: 186, key: 'w186_crystal', name: 'Crystal Block Wall', mapColor: '#371764', opacity: 1 });
wallDef({ id: 187, key: 'w187_sandstone', name: 'Treacherous Sandstone Wall', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 188, key: 'w188_corruptionunsafe1', name: 'Corrupt Growth Wall (natural)', mapColor: '#3F2F3F', opacity: 1 });
wallDef({ id: 189, key: 'w189_corruptionunsafe2', name: 'Corrupt Mass Wall (natural)', mapColor: '#41334D', opacity: 1 });
wallDef({ id: 190, key: 'w190_corruptionunsafe3', name: 'Corrupt Pustule Wall (natural)', mapColor: '#43483B', opacity: 1 });
wallDef({ id: 191, key: 'w191_corruptionunsafe4', name: 'Corrupt Tendril Wall (natural)', mapColor: '#3C2643', opacity: 1 });
wallDef({ id: 192, key: 'w192_crimsonunsafe1', name: 'Crimson Crust Wall (natural)', mapColor: '#7B382F', opacity: 1 });
wallDef({ id: 193, key: 'w193_crimsonunsafe2', name: 'Crimson Scab Wall (natural)', mapColor: '#57181A', opacity: 1 });
wallDef({ id: 194, key: 'w194_crimsonunsafe3', name: 'Crimson Teeth Wall (natural)', mapColor: '#664035', opacity: 1 });
wallDef({ id: 195, key: 'w195_crimsonunsafe4', name: 'Crimson Blister Wall (natural)', mapColor: '#7A2E36', opacity: 1 });
wallDef({ id: 196, key: 'w196_dirtunsafe1', name: 'Layered Dirt Wall (natural)', mapColor: '#634637', opacity: 1 });
wallDef({ id: 197, key: 'w197_dirtunsafe2', name: 'Crumbling Dirt Wall (natural)', mapColor: '#664939', opacity: 1 });
wallDef({ id: 198, key: 'w198_dirtunsafe3', name: 'Cracked Dirt Wall (natural)', mapColor: '#5C4131', opacity: 1 });
wallDef({ id: 199, key: 'w199_dirtunsafe4', name: 'Wavy Dirt Wall (natural)', mapColor: '#6A4B3A', opacity: 1 });
wallDef({ id: 200, key: 'w200_hallowunsafe1', name: 'Hallowed Prism Wall (natural)', mapColor: '#512153', opacity: 1 });
wallDef({ id: 201, key: 'w201_hallowunsafe2', name: 'Hallowed Cavern Wall (natural)', mapColor: '#604F63', opacity: 1 });
wallDef({ id: 202, key: 'w202_hallowunsafe3', name: 'Hallowed Shard Wall (natural)', mapColor: '#7C2A68', opacity: 1 });
wallDef({ id: 203, key: 'w203_hallowunsafe4', name: 'Hallowed Crystalline Wall (natural)', mapColor: '#6F3670', opacity: 1 });
wallDef({ id: 204, key: 'w204_jungleunsafe1', name: 'Lichen Stone Wall (natural)', mapColor: '#4B4437', opacity: 1 });
wallDef({ id: 205, key: 'w205_jungleunsafe2', name: 'Leafy Jungle Wall (natural)', mapColor: '#53533B', opacity: 1 });
wallDef({ id: 206, key: 'w206_jungleunsafe3', name: 'Ivy Stone Wall (natural)', mapColor: '#27432C', opacity: 1 });
wallDef({ id: 207, key: 'w207_jungleunsafe4', name: 'Jungle Vine Wall (natural)', mapColor: '#4D4D37', opacity: 1 });
wallDef({ id: 208, key: 'w208_lavaunsafe1', name: 'Ember Wall (natural)', mapColor: '#5C241C', opacity: 1 });
wallDef({ id: 209, key: 'w209_lavaunsafe2', name: 'Cinder Wall (natural)', mapColor: '#603027', opacity: 1 });
wallDef({ id: 210, key: 'w210_lavaunsafe3', name: 'Magma Wall (natural)', mapColor: '#6C2C1A', opacity: 1 });
wallDef({ id: 211, key: 'w211_lavaunsafe4', name: 'Smouldering Stone Wall (natural)', mapColor: '#6A2A26', opacity: 1 });
wallDef({ id: 212, key: 'w212_rocksunsafe1', name: 'Worn Stone Wall (natural)', mapColor: '#46453D', opacity: 1 });
wallDef({ id: 213, key: 'w213_rocksunsafe2', name: 'Stalactite Stone Wall (natural)', mapColor: '#393C39', opacity: 1 });
wallDef({ id: 214, key: 'w214_rocksunsafe3', name: 'Mottled Stone Wall (natural)', mapColor: '#45393B', opacity: 1 });
wallDef({ id: 215, key: 'w215_rocksunsafe4', name: 'Fractured Stone Wall (natural)', mapColor: '#473C42', opacity: 1 });
wallDef({ id: 216, key: 'w216_hardenedsand', name: 'Treacherous Hardened Sand Wall', mapColor: '#945D34', opacity: 1 });
wallDef({ id: 217, key: 'w217_corrupthardenedsand', name: 'Treacherous Hardened Ebonsand Wall', mapColor: '#332641', opacity: 1 });
wallDef({ id: 218, key: 'w218_crimsonhardenedsand', name: 'Treacherous Hardened Crimsand Wall', mapColor: '#2B1816', opacity: 1 });
wallDef({ id: 219, key: 'w219_hallowhardenedsand', name: 'Treacherous Hardened Pearlsand Wall', mapColor: '#4E4972', opacity: 1 });
wallDef({ id: 220, key: 'w220_corruptsandstone', name: 'Treacherous Ebonsandstone Wall', mapColor: '#362444', opacity: 1 });
wallDef({ id: 221, key: 'w221_crimsonsandstone', name: 'Treacherous Crimsandstone Wall', mapColor: '#49120C', opacity: 1 });
wallDef({ id: 222, key: 'w222_hallowsandstone', name: 'Treacherous Pearlsandstone Wall', mapColor: '#3A2F51', opacity: 1 });
wallDef({ id: 223, key: 'w223_desertfossil', name: 'Desert Fossil Wall (natural)', mapColor: '#734122', opacity: 1 });
wallDef({ id: 224, key: 'w224_lunarbrickwall', name: 'Luminite Brick Wall', mapColor: '#677068', opacity: 1, largeFrame: 2 });
wallDef({ id: 225, key: 'w225_cogwall', name: 'Cog Wall', mapColor: '#4C4738', opacity: 1 });
wallDef({ id: 226, key: 'w226_sandfall', name: 'Sandfall Wall', mapColor: '#857C42', opacity: 1 });
wallDef({ id: 227, key: 'w227_snowfall', name: 'Snowfall Wall', mapColor: '#536570', opacity: 1 });
wallDef({ id: 228, key: 'w228_sillyballoonpinkwall', name: 'Silly Pink Balloon Wall', mapColor: '#8B0040', opacity: 1 });
wallDef({ id: 229, key: 'w229_sillyballoonpurplewall', name: 'Silly Purple Balloon Wall', mapColor: '#500CA2', opacity: 1 });
wallDef({ id: 230, key: 'w230_sillyballoongreenwall', name: 'Silly Green Balloon Wall', mapColor: '#005D51', opacity: 1 });
wallDef({ id: 231, key: 'w231_ironbrick', name: 'Iron Brick Wall', mapColor: '#51443E', opacity: 1 });
wallDef({ id: 232, key: 'w232_leadbrick', name: 'Lead Brick Wall', mapColor: '#252F39', opacity: 1 });
wallDef({ id: 233, key: 'w233_lesionblock', name: 'Lesion Block Wall', mapColor: '#483537', opacity: 1 });
wallDef({ id: 234, key: 'w234_crimstonebrick', name: 'Crimstone Brick Wall', mapColor: '#672E30', opacity: 1 });
wallDef({ id: 235, key: 'w235_smoothsandstone', name: 'Smooth Sandstone Wall', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 236, key: 'w236_spider', name: 'Spider Nest Wall', mapColor: '#3F2322', opacity: 1 });
wallDef({ id: 237, key: 'w237_solarbrick', name: 'Solar Brick Wall', mapColor: '#392221', opacity: 1 });
wallDef({ id: 238, key: 'w238_vortexbrick', name: 'Vortex Brick Wall', mapColor: '#2D2E36', opacity: 1 });
wallDef({ id: 239, key: 'w239_nebulabrick', name: 'Nebula Brick Wall', mapColor: '#2B3438', opacity: 1 });
wallDef({ id: 240, key: 'w240_stardustbrick', name: 'Stardust Brick Wall', mapColor: '#3E2D21', opacity: 1 });
wallDef({ id: 241, key: 'w241_orangestainedglass', name: 'Orange Stained Glass', mapColor: '#925F35', opacity: 1 });
wallDef({ id: 242, key: 'w242_goldstarryglasswall', name: 'Gold Starry Wall', mapColor: '#4E4537', opacity: 1 });
wallDef({ id: 243, key: 'w243_bluestarryglasswall', name: 'Blue Starry Wall', mapColor: '#173456', opacity: 1 });
wallDef({ id: 244, key: 'w244_livingwoodunsafe', name: 'Living Wood Wall (natural)', mapColor: '#3A2318', opacity: 1 });
wallDef({ id: 245, key: 'w245_wroughtironfence', name: 'Wrought Iron Fence', mapColor: '#4A4A4A', opacity: 1 });
wallDef({ id: 246, key: 'w246_ebonstoneecho', name: 'Ebonstone Wall', mapColor: '#2F2935', opacity: 1 });
wallDef({ id: 247, key: 'w247_mudwallecho', name: 'Mud Wall', mapColor: '#312B2C', opacity: 1 });
wallDef({ id: 248, key: 'w248_pearlstoneecho', name: 'Pearlstone Wall', mapColor: '#4D4651', opacity: 1 });
wallDef({ id: 249, key: 'w249_snowwallecho', name: 'Snow Wall', mapColor: '#647681', opacity: 1 });
wallDef({ id: 250, key: 'w250_amethystecho', name: 'Amethyst Stone Wall', mapColor: '#4E4553', opacity: 1 });
wallDef({ id: 251, key: 'w251_topazecho', name: 'Topaz Stone Wall', mapColor: '#514A3F', opacity: 1 });
wallDef({ id: 252, key: 'w252_sapphireecho', name: 'Sapphire Stone Wall', mapColor: '#384251', opacity: 1 });
wallDef({ id: 253, key: 'w253_emeraldecho', name: 'Emerald Stone Wall', mapColor: '#32493B', opacity: 1 });
wallDef({ id: 254, key: 'w254_rubyecho', name: 'Ruby Stone Wall', mapColor: '#523B40', opacity: 1 });
wallDef({ id: 255, key: 'w255_diamondecho', name: 'Diamond Stone Wall', mapColor: '#464F51', opacity: 1 });
wallDef({ id: 256, key: 'w256_cave1echo', name: 'Green Mossy Wall', mapColor: '#2E3A36', opacity: 1 });
wallDef({ id: 257, key: 'w257_cave2echo', name: 'Brown Mossy Wall', mapColor: '#38382E', opacity: 1 });
wallDef({ id: 258, key: 'w258_cave3echo', name: 'Red Mossy Wall', mapColor: '#393131', opacity: 1 });
wallDef({ id: 259, key: 'w259_cave4echo', name: 'Blue Mossy Wall', mapColor: '#2D3338', opacity: 1 });
wallDef({ id: 260, key: 'w260_cave5echo', name: 'Purple Mossy Wall', mapColor: '#38303B', opacity: 1 });
wallDef({ id: 261, key: 'w261_cave6echo', name: 'Rocky Dirt Wall', mapColor: '#503F37', opacity: 1 });
wallDef({ id: 262, key: 'w262_cave7echo', name: 'Old Stone Wall', mapColor: '#37281C', opacity: 1 });
wallDef({ id: 263, key: 'w263_spiderecho', name: 'Spider Wall', mapColor: '#201C16', opacity: 1 });
wallDef({ id: 264, key: 'w264_corruptgrassecho', name: 'Corrupt Grass Wall', mapColor: '#242539', opacity: 1 });
wallDef({ id: 265, key: 'w265_hallowedgrassecho', name: 'Hallowed Grass Wall', mapColor: '#193D43', opacity: 1 });
wallDef({ id: 266, key: 'w266_iceecho', name: 'Ice Wall', mapColor: '#526C86', opacity: 1 });
wallDef({ id: 267, key: 'w267_obsidianbackecho', name: 'Obsidian Wall', mapColor: '#242141', opacity: 1 });
wallDef({ id: 268, key: 'w268_crimsongrassecho', name: 'Crimson Grass Wall', mapColor: '#653434', opacity: 1 });
wallDef({ id: 269, key: 'w269_crimstoneecho', name: 'Crimstone Wall', mapColor: '#3E2C2D', opacity: 1 });
wallDef({ id: 270, key: 'w270_cavewall1echo', name: 'Cave Dirt Wall', mapColor: '#5D442F', opacity: 1 });
wallDef({ id: 271, key: 'w271_cavewall2echo', name: 'Rough Dirt Wall', mapColor: '#543C27', opacity: 1 });
wallDef({ id: 272, key: 'w272_marbleechounused', name: 'Marble Wall (unused)', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 273, key: 'w273_graniteechounused', name: 'Granite Wall (unused)', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 274, key: 'w274_cave8echo', name: 'Craggy Stone Wall', mapColor: '#3D3D3D', opacity: 1, largeFrame: 2 });
wallDef({ id: 275, key: 'w275_sandstoneecho', name: 'Sandstone Wall', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 276, key: 'w276_corruption1echo', name: 'Corrupt Growth Wall', mapColor: '#3F2F3F', opacity: 1 });
wallDef({ id: 277, key: 'w277_corruption2echo', name: 'Corrupt Mass Wall', mapColor: '#41334D', opacity: 1 });
wallDef({ id: 278, key: 'w278_corruption3echo', name: 'Corrupt Pustule Wall', mapColor: '#43483B', opacity: 1 });
wallDef({ id: 279, key: 'w279_corruption4echo', name: 'Corrupt Tendril Wall', mapColor: '#3C2643', opacity: 1 });
wallDef({ id: 280, key: 'w280_crimson1echo', name: 'Crimson Crust Wall', mapColor: '#7B382F', opacity: 1 });
wallDef({ id: 281, key: 'w281_crimson2echo', name: 'Crimson Scab Wall', mapColor: '#57181A', opacity: 1 });
wallDef({ id: 282, key: 'w282_crimson3echo', name: 'Crimson Teeth Wall', mapColor: '#664035', opacity: 1 });
wallDef({ id: 283, key: 'w283_crimson4echo', name: 'Crimson Blister Wall', mapColor: '#7A2E36', opacity: 1 });
wallDef({ id: 284, key: 'w284_dirt1echo', name: 'Layered Dirt Wall', mapColor: '#634637', opacity: 1 });
wallDef({ id: 285, key: 'w285_dirt2echo', name: 'Crumbling Dirt Wall', mapColor: '#664939', opacity: 1 });
wallDef({ id: 286, key: 'w286_dirt3echo', name: 'Cracked Dirt Wall', mapColor: '#5C4131', opacity: 1 });
wallDef({ id: 287, key: 'w287_dirt4echo', name: 'Wavy Dirt Wall', mapColor: '#6A4B3A', opacity: 1 });
wallDef({ id: 288, key: 'w288_hallow1echo', name: 'Hallowed Prism Wall', mapColor: '#512153', opacity: 1 });
wallDef({ id: 289, key: 'w289_hallow2echo', name: 'Hallowed Cavern Wall', mapColor: '#604F63', opacity: 1 });
wallDef({ id: 290, key: 'w290_hallow3echo', name: 'Hallowed Shard Wall', mapColor: '#7C2A68', opacity: 1 });
wallDef({ id: 291, key: 'w291_hallow4echo', name: 'Hallowed Crystalline Wall', mapColor: '#6F3670', opacity: 1 });
wallDef({ id: 292, key: 'w292_jungle1echo', name: 'Lichen Stone Wall', mapColor: '#4B4437', opacity: 1 });
wallDef({ id: 293, key: 'w293_jungle2echo', name: 'Leafy Jungle Wall', mapColor: '#53533B', opacity: 1 });
wallDef({ id: 294, key: 'w294_jungle3echo', name: 'Ivy Stone Wall', mapColor: '#27432C', opacity: 1 });
wallDef({ id: 295, key: 'w295_jungle4echo', name: 'Jungle Vine Wall', mapColor: '#4D4D37', opacity: 1 });
wallDef({ id: 296, key: 'w296_lava1echo', name: 'Ember Wall', mapColor: '#5C241C', opacity: 1 });
wallDef({ id: 297, key: 'w297_lava2echo', name: 'Cinder Wall', mapColor: '#603027', opacity: 1 });
wallDef({ id: 298, key: 'w298_lava3echo', name: 'Magma Wall', mapColor: '#6C2C1A', opacity: 1 });
wallDef({ id: 299, key: 'w299_lava4echo', name: 'Smouldering Stone Wall', mapColor: '#6A2A26', opacity: 1 });
wallDef({ id: 300, key: 'w300_rocks1echo', name: 'Worn Stone Wall', mapColor: '#46453D', opacity: 1 });
wallDef({ id: 301, key: 'w301_rocks2echo', name: 'Stalactite Stone Wall', mapColor: '#393C39', opacity: 1 });
wallDef({ id: 302, key: 'w302_rocks3echo', name: 'Mottled Stone Wall', mapColor: '#45393B', opacity: 1 });
wallDef({ id: 303, key: 'w303_rocks4echo', name: 'Fractured Stone Wall', mapColor: '#473C42', opacity: 1 });
wallDef({ id: 304, key: 'w304_hardenedsandecho', name: 'Hardened Sand Wall', mapColor: '#945D34', opacity: 1 });
wallDef({ id: 305, key: 'w305_corrupthardenedsandecho', name: 'Hardened Ebonsand Wall', mapColor: '#332641', opacity: 1 });
wallDef({ id: 306, key: 'w306_crimsonhardenedsandecho', name: 'Hardened Crimsand Wall', mapColor: '#2B1816', opacity: 1 });
wallDef({ id: 307, key: 'w307_hallowhardenedsandecho', name: 'Hardened Pearlsand Wall', mapColor: '#4E4972', opacity: 1 });
wallDef({ id: 308, key: 'w308_corruptsandstoneecho', name: 'Ebonsandstone Wall', mapColor: '#362444', opacity: 1 });
wallDef({ id: 309, key: 'w309_crimsonsandstoneecho', name: 'Crimsandstone Wall', mapColor: '#49120C', opacity: 1 });
wallDef({ id: 310, key: 'w310_hallowsandstoneecho', name: 'Pearlsandstone Wall', mapColor: '#3A2F51', opacity: 1 });
wallDef({ id: 311, key: 'w311_desertfossilecho', name: 'Desert Fossil Wall', mapColor: '#734122', opacity: 1 });
wallDef({ id: 312, key: 'w312_bambooblockwall', name: 'Bamboo Wall', mapColor: '#244110', opacity: 1 });
wallDef({ id: 313, key: 'w313_largebambooblockwall', name: 'Large Bamboo Wall', mapColor: '#213D13', opacity: 1 });
wallDef({ id: 314, key: 'w314_amberstonewallecho', name: 'Amber Stone Wall', mapColor: '#4A3A2C', opacity: 1 });
wallDef({ id: 315, key: 'w315_bamboofence', name: 'Bamboo Fence', mapColor: '#72782D', opacity: 1 });
wallDef({ id: 316, key: 'w316_ashwood', name: 'Ash Wood Wall', mapColor: '#3A3440', opacity: 1 });
wallDef({ id: 317, key: 'w317_ashwoodfence', name: 'Ash Wood Fence', mapColor: '#504652', opacity: 1 });
wallDef({ id: 318, key: 'w318_echowall', name: 'Echo Wall', mapColor: '#060622', opacity: 1 });
wallDef({ id: 319, key: 'w319_reefwall', name: 'Reef Wall', mapColor: '#5B3052', opacity: 1 });
wallDef({ id: 320, key: 'w320_poopwall', name: 'Poo Wall', mapColor: '#42271B', opacity: 1 });
wallDef({ id: 321, key: 'w321_shimmerblockwall', name: 'Aetherium Wall', mapColor: '#3E536C', opacity: 1 });
wallDef({ id: 322, key: 'w322_shimmerbrickwall', name: 'Aetherium Brick Wall', mapColor: '#3A5473', opacity: 1 });
wallDef({ id: 323, key: 'w323_lunarrustbrickwall', name: 'Lunar Rust Brick Wall', mapColor: '#635E69', opacity: 1, largeFrame: 2 });
wallDef({ id: 324, key: 'w324_darkcelestialbrickwall', name: 'Dark Celestial Brick Wall', mapColor: '#505C68', opacity: 1, largeFrame: 2 });
wallDef({ id: 325, key: 'w325_astrabrickwall', name: 'Astra Brick Wall', mapColor: '#385F7C', opacity: 1, largeFrame: 2 });
wallDef({ id: 326, key: 'w326_cosmicemberbrickwall', name: 'Cosmic Ember Brick Wall', mapColor: '#5C5E50', opacity: 1, largeFrame: 2 });
wallDef({ id: 327, key: 'w327_cryocorebrickwall', name: 'Cryocore Brick Wall', mapColor: '#3E6674', opacity: 1, largeFrame: 2 });
wallDef({ id: 328, key: 'w328_mercurybrickwall', name: 'Mercury Brick Wall', mapColor: '#626769', opacity: 1, largeFrame: 2 });
wallDef({ id: 329, key: 'w329_starroyalebrickwall', name: 'Star Royale Brick Wall', mapColor: '#575C76', opacity: 1, largeFrame: 2 });
wallDef({ id: 330, key: 'w330_heavenforgebrickwall', name: 'Heavenforge Brick Wall', mapColor: '#545969', opacity: 1, largeFrame: 2 });
wallDef({ id: 331, key: 'w331_ancientbluebrickwall', name: 'Ancient Blue Brick Wall', mapColor: '#2A2C51', opacity: 1 });
wallDef({ id: 332, key: 'w332_ancientgreenbrickwall', name: 'Ancient Green Brick Wall', mapColor: '#22421A', opacity: 1 });
wallDef({ id: 333, key: 'w333_ancientpinkbrickwall', name: 'Ancient Pink Brick Wall', mapColor: '#401931', opacity: 1 });
wallDef({ id: 334, key: 'w334_ancientgoldbrickwall', name: 'Ancient Gold Brick Wall', mapColor: '#4C4220', opacity: 1 });
wallDef({ id: 335, key: 'w335_ancientsilverbrickwall', name: 'Ancient Silver Brick Wall', mapColor: '#3C4143', opacity: 1 });
wallDef({ id: 336, key: 'w336_ancientcopperbrickwall', name: 'Ancient Copper Brick Wall', mapColor: '#4C2D20', opacity: 1 });
wallDef({ id: 337, key: 'w337_ancientobsidianbrickwall', name: 'Ancient Obsidian Brick Wall', mapColor: '#25243B', opacity: 1 });
wallDef({ id: 338, key: 'w338_ancienthellstonebrickwall', name: 'Ancient Hellstone Brick Wall', mapColor: '#392220', opacity: 1 });
wallDef({ id: 339, key: 'w339_ancientcobaltbrickwall', name: 'Ancient Cobalt Brick Wall', mapColor: '#132B3C', opacity: 1 });
wallDef({ id: 340, key: 'w340_ancientmythrilbrickwall', name: 'Ancient Mythril Brick Wall', mapColor: '#2A433C', opacity: 1 });
wallDef({ id: 341, key: 'w341_lavamossblockwall', name: 'Lava Moss Brick Wall', mapColor: '#681700', opacity: 1 });
wallDef({ id: 342, key: 'w342_argonmossblockwall', name: 'Argon Moss Brick Wall', mapColor: '#5B0941', opacity: 1 });
wallDef({ id: 343, key: 'w343_kryptonmossblockwall', name: 'Krypton Moss Brick Wall', mapColor: '#11592B', opacity: 1 });
wallDef({ id: 344, key: 'w344_xenonmossblockwall', name: 'Xenon Moss Brick Wall', mapColor: '#05415E', opacity: 1 });
wallDef({ id: 345, key: 'w345_violetmossblockwall', name: 'Neon Moss Brick Wall', mapColor: '#3A0651', opacity: 1 });
wallDef({ id: 346, key: 'w346_rainbowmossblockwall', name: 'Helium Moss Brick Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 347, key: 'w347_shimmerfall', name: 'Shimmerfall Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 348, key: 'w348_fallenstarwall', name: 'Fallen Star Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 349, key: 'w349_stoneunsafe', name: 'Wall_349', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 350, key: 'w350_unbreakableblockwall', name: 'Wall_350', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 351, key: 'w351_feywoodwall', name: 'Feywood Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 352, key: 'w352_hallowedbrickwall', name: 'Hallowed Brick Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 353, key: 'w353_pinetreeblockwall', name: 'Pine Tree Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 354, key: 'w354_easterblockwall', name: 'Easter Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 1 });
wallDef({ id: 355, key: 'w355_gothicbrickwall', name: 'Gothic Brick Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 356, key: 'w356_flinxfurblockwall', name: 'Flinx Fur Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 357, key: 'w357_jellyfishblockwall', name: 'Jellyfish Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 358, key: 'w358_pinewoodblockwall', name: 'Pine Wood Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 359, key: 'w359_harpyblockwall', name: 'Harpy Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 360, key: 'w360_moonplateblockwall', name: 'Crescent Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 361, key: 'w361_librarianblockwall', name: 'Librarian Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 362, key: 'w362_spikeblockwall', name: 'Spike Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 363, key: 'w363_officeblockwall', name: 'Office Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 364, key: 'w364_forbiddenblockwall', name: 'Forbidden Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 365, key: 'w365_waterblockwall', name: 'Aquarium Wall', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 366, key: 'w366_boulderblockwall', name: 'Boulder Wall', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });

// 墙 key→id 回填（id 即原版 wld 墙 id）
WALL_DEFS.forEach((d) => { if (d) WALL_BY_KEY[d.key] = d.id; });

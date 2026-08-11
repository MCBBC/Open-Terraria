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
  drop?: string | null;   // 破坏掉落 item key（缺省掉同名 key；null = 显式无掉落,原版装饰类）
  rope?: boolean;        // 绳索类（攀爬判定）
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
def({ key: 'leaves', name: '树叶', decor: true, framed: true, opacity: 0.05, pick: 0, axe: 0, mapColor: '#2E8B3D', drop: null });
def({ key: 'wood', name: '木材块', solid: true, opacity: 1, pick: 0, mapColor: '#A97D4E', blend: true, drop: 'wood', vanilla: { sheet: 30, frame: 'auto' } });
def({ key: 'platform', name: '木平台', platform: true, opacity: 0.15, pick: 0, axe: 0, mapColor: '#B0885A', drop: 'platform', vanilla: { sheet: 19, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'torch', name: '火把', decor: true, framed: true, opacity: 0, pick: 0, light: [255, 225, 150], mapColor: '#FDDD03', drop: 'torch', vanilla: { sheet: 4, frame: 'style', fw: 1, fh: 1 } });
// 注：火把光值见下（更亮版本）
def({ key: 'workbench', name: '工作台', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#A97D4E', drop: 'workbench', vanilla: { sheet: 18, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'furnace', name: '熔炉', solid: false, /* 原版 tileSolid[17]=false：熔炉可通行 */ framed: true, opacity: 1, pick: 0, w: 3, h: 2, light: [255, 140, 70], mapColor: '#5A5A5A', drop: 'furnace', vanilla: { sheet: 17, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'anvil', name: '铁砧', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#6E6E78', drop: 'anvil', vanilla: { sheet: 16, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'chest', name: '宝箱', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#D4A017', drop: 'chest', vanilla: { sheet: 21, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'door_closed', name: '门', solid: true, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#A97D4E', drop: 'door', vanilla: { sheet: 10, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'door_open', name: '门(开)', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#A97D4E', drop: 'door', vanilla: { sheet: 11, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'mushroom', name: '蘑菇', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#C36927', drop: 'mushroom_item', vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'flower', name: '花', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#D0699E', drop: null, vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
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
def({ key: 'ore_demonite', name: '魔矿', solid: true, opacity: 1, pick: 55, mapColor: '#625FA7', drop: 'demonite_ore', light: [255, 255, 153], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 22, frame: 'auto' } });
def({ key: 'ore_meteorite', name: '陨石', solid: true, opacity: 1, pick: 50, mapColor: '#685654', drop: 'meteorite', light: [143, 110, 38], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 37, frame: 'auto' } });
def({ key: 'ore_hellstone', name: '狱石', solid: true, opacity: 1, pick: 65, mapColor: '#8E4242', drop: 'hellstone', light: [255, 90, 40], vanilla: { sheet: 58, frame: 'auto' } });
def({ key: 'ore_crimtane', name: '猩红矿', solid: true, opacity: 1, pick: 55, mapColor: '#7D3741', drop: 'crimtane_ore', light: [89, 0, 0], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 204, frame: 'auto' } });
def({ key: 'ore_cobalt', name: '钴矿', solid: true, opacity: 1, pick: 100, mapColor: '#0B508F', drop: 'cobalt_ore', vanilla: { sheet: 107, frame: 'auto' } });
def({ key: 'ore_mythril', name: '秘银矿', solid: true, opacity: 1, pick: 110, mapColor: '#5BA9A9', drop: 'mythril_ore', vanilla: { sheet: 108, frame: 'auto' } });
def({ key: 'ore_adamantite', name: '精金矿', solid: true, opacity: 1, pick: 150, mapColor: '#801A34', drop: 'adamantite_ore', vanilla: { sheet: 111, frame: 'auto' } });
def({ key: 'ore_palladium', name: '钯金矿', solid: true, opacity: 1, pick: 100, mapColor: '#EF5A32', drop: 'palladium_ore', vanilla: { sheet: 221, frame: 'auto' } });
def({ key: 'ore_orichalcum', name: '山铜矿', solid: true, opacity: 1, pick: 110, mapColor: '#E760E4', drop: 'orichalcum_ore', vanilla: { sheet: 222, frame: 'auto' } });
def({ key: 'ore_titanium', name: '钛矿', solid: true, opacity: 1, pick: 150, mapColor: '#395565', drop: 'titanium_ore', vanilla: { sheet: 223, frame: 'auto' } });
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
def({ key: 'obsidian', name: '黑曜石', solid: true, opacity: 1, pick: 55, mapColor: '#2B2854', blend: true, drop: 'obsidian', vanilla: { sheet: 56, frame: 'auto' } });
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
def({ key: 'lantern', name: '吊挂灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 2, mapColor: '#FBEB7F', drop: 'lantern', ...VAN(42, 1, 2) });
// 灯笼发光 = TileLightScanner specialTileLight case 42(样式色表+灭档门控),不走 def.light 静态色
def({ key: 'candelabra', name: '烛台', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FDDD03', drop: 'candelabra', light: [255, 185, 110], ...VAN(100, 2, 2) });
def({ key: 'chinese_lantern', name: '中式灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FFA21F', drop: 'chinese_lantern', light: [255, 160, 70], ...VAN(95, 2, 2) });
def({ key: 'skull_lantern', name: '骷髅灯笼', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FDDD03', drop: 'skull_lantern', light: [255, 160, 70], ...VAN(98, 2, 2) });
def({ key: 'water_candle', name: '水蜡烛', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#2B8FFF', drop: 'water_candle', light: [140, 180, 255], ...VAN(49, 1, 1) });
// 瓦罐（世界生成散布）：打破掉随机常用道具（breakTile 特判），不做放置物
def({ key: 'pot', name: '瓦罐', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#974F50', drop: null, vanilla: { sheet: 28, frame: 'style', fw: 2, fh: 2 } });
// ---- 玩家储物族（原版 Player.cs:32598 右键绑定：29→bank / 97→bank2 / 463→bank3 / 491→bank4）----
// drop 不写 → 破坏走 place_v_ 回退回收（储物内容在玩家 bank 数据里，不随方块掉落——原版同语义）
def({ key: 'v_29_piggy_bank', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#AF6980', vanilla: { sheet: 29, frame: 'style', fw: 2, fh: 1 } }); // 存钱罐（compat-report 补全：导入曾清空丢弃）
def({ key: 'v_463_defenders_forge', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#9BD6F0', light: [51, 102, 204], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 463, frame: 'style', fw: 3, fh: 4 } }); // 守护者熔炉（bank3）

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
def({ key: 'v_51_cobweb', name: '', solid: false, /* 原版非实心：蛛网减速不阻挡 */ opacity: 1, pick: 0, mapColor: '#C0CACB', blend: true, drop: null, vanilla: { sheet: 51, frame: 'auto' } });
def({ key: 'v_368_granite_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#322E68', blend: true, drop: null, vanilla: { sheet: 368, frame: 'auto' } });
def({ key: 'v_226_lihzahrd_brick', name: '', solid: true, opacity: 1, pick: 210, mapColor: '#8D3800', blend: true, drop: null, vanilla: { sheet: 226, frame: 'auto' } });
def({ key: 'v_367_marble_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A8B2CC', blend: true, drop: null, vanilla: { sheet: 367, frame: 'auto' } });
def({ key: 'v_633_ash_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#66474A', blend: true, drop: null, light: [83, 38, 13], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 633, frame: 'auto' } });
def({ key: 'v_181_red_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#863B31', blend: true, drop: null, vanilla: { sheet: 181, frame: 'auto' } });
def({ key: 'v_189_cloud_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#DFFFFF', blend: true, drop: null, vanilla: { sheet: 189, frame: 'auto' } });
def({ key: 'v_183_purple_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#793186', blend: true, drop: null, vanilla: { sheet: 183, frame: 'auto' } });
def({ key: 'v_536_xenon_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#589498', blend: true, drop: null, light: [0, 41, 87], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 536, frame: 'auto' } });
def({ key: 'v_225_hive_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#E37D16', blend: true, drop: null, vanilla: { sheet: 225, frame: 'auto' } });
def({ key: 'v_483_cracked_pink_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7A405F', blend: true, drop: null, vanilla: { sheet: 483, frame: 'auto' } });
def({ key: 'v_224_slush_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#6B848B', blend: true, drop: null, vanilla: { sheet: 224, frame: 'auto' } });
def({ key: 'v_383_living_mahogany_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#DD8890', blend: true, drop: null, vanilla: { sheet: 383, frame: 'auto' } });
def({ key: 'v_179_green_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#318672', blend: true, drop: null, vanilla: { sheet: 179, frame: 'auto' } });
def({ key: 'v_384_living_mahogany_leaves_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#83CE0C', blend: true, drop: null, vanilla: { sheet: 384, frame: 'auto' } });
def({ key: 'v_273_stone_slab', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: null, vanilla: { sheet: 273, frame: 'auto' } });
def({ key: 'v_381_lava_moss', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FE7902', blend: true, drop: null, light: [255, 120, 30], vanilla: { sheet: 381, frame: 'auto' } });
def({ key: 'v_48_spike', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#808080', blend: true, drop: null, vanilla: { sheet: 48, frame: 'auto' } });
def({ key: 'v_192_living_leaf_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#1AC454', blend: true, drop: null, vanilla: { sheet: 192, frame: 'auto' } });
def({ key: 'v_191_living_wood_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#976B4B', blend: true, drop: null, vanilla: { sheet: 191, frame: 'auto' } });
def({ key: 'v_196_rain_cloud_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#9390B2', blend: true, drop: null, vanilla: { sheet: 196, frame: 'auto' } });
def({ key: 'v_118_pearlstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#EEE1DA', blend: true, drop: null, vanilla: { sheet: 118, frame: 'auto' } });
def({ key: 'v_321_boreal_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#604D40', blend: true, drop: null, vanilla: { sheet: 321, frame: 'auto' } });
def({ key: 'v_152_ebonstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8085B8', blend: true, drop: null, vanilla: { sheet: 152, frame: 'auto' } });
def({ key: 'v_158_rich_mahogany', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#915155', blend: true, drop: null, vanilla: { sheet: 158, frame: 'auto' } });
def({ key: 'v_357_smooth_marble_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A8B2CC', blend: true, drop: null, vanilla: { sheet: 357, frame: 'auto' } });
def({ key: 'v_272_cog_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#797765', blend: true, drop: null, vanilla: { sheet: 272, frame: 'auto' } });
def({ key: 'v_229_honey_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FF9C0C', blend: true, drop: null, vanilla: { sheet: 229, frame: 'auto' } });
def({ key: 'v_311_dynasty_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#753D19', blend: true, drop: null, vanilla: { sheet: 311, frame: 'auto' } });
def({ key: 'v_130_active_stone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A0A0A0', blend: true, drop: null, vanilla: { sheet: 130, frame: 'auto' } });
def({ key: 'v_193_slime_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3879FF', blend: true, drop: null, vanilla: { sheet: 193, frame: 'auto' } });
def({ key: 'v_190_glowing_mushroom_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#B6AF82', blend: true, drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner.cs:2938 蘑菇组 R=0 G=0.2+ B=1） */ vanilla: { sheet: 190, frame: 'auto' } });
def({ key: 'v_350_martian_conduit_plating', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#37619B', blend: true, drop: null, light: [26, 26, 26], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 350, frame: 'auto' } });
def({ key: 'v_369_smooth_granite_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#322E68', blend: true, drop: null, vanilla: { sheet: 369, frame: 'auto' } });
def({ key: 'v_137_traps', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#909490', drop: null, vanilla: { sheet: 137, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_117_pearlstone_block', name: '', solid: true, opacity: 1, pick: 65, mapColor: '#B5ACBE', blend: true, drop: null, vanilla: { sheet: 117, frame: 'blend' } });
def({ key: 'v_112_ebonsand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#67627A', blend: true, drop: null, vanilla: { sheet: 112, frame: 'auto' } });
def({ key: 'v_232_wooden_spike', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#915155', blend: true, drop: null, vanilla: { sheet: 232, frame: 'auto' } });
def({ key: 'v_274_sandstone_slab', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BEAB5E', blend: true, drop: null, vanilla: { sheet: 274, frame: 'auto' } });
def({ key: 'v_322_palm_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#C6AA68', blend: true, drop: null, vanilla: { sheet: 322, frame: 'auto' } });
def({ key: 'v_109_hallowed_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4EC1E3', blend: true, drop: null, vanilla: { sheet: 109, frame: 'auto' } });
def({ key: 'v_312_red_dynasty_shingles', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#CC5D49', blend: true, drop: null, vanilla: { sheet: 312, frame: 'auto' } });
def({ key: 'v_422_conveyor_belt_ccw', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#494646', blend: true, drop: null, vanilla: { sheet: 422, frame: 'auto' } });
def({ key: 'v_495_shell_pile_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#AF976E', blend: true, drop: null, vanilla: { sheet: 495, frame: 'auto' } });
def({ key: 'v_479_smooth_sandstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BC7347', blend: true, drop: null, vanilla: { sheet: 479, frame: 'auto' } });
def({ key: 'v_353_vine_rope', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#1CD85E', blend: true, drop: null, rope: true, vanilla: { sheet: 353, frame: 'auto' } });
def({ key: 'v_477_mowed_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#607044', blend: true, drop: null, vanilla: { sheet: 477, frame: 'auto' } });
def({ key: 'v_380_planter_boxes', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BF8E6F', blend: true, drop: null, vanilla: { sheet: 380, frame: 'auto' } });
def({ key: 'v_230_crispy_honey_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#834F0D', blend: true, drop: null, vanilla: { sheet: 230, frame: 'auto' } });
def({ key: 'v_562_bamboo_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#737A2D', blend: true, drop: null, vanilla: { sheet: 562, frame: 'auto' } });
def({ key: 'v_371_pink_slime_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#F965BD', blend: true, drop: null, vanilla: { sheet: 371, frame: 'auto' } });
def({ key: 'v_668_the_dirtiest_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#bf8e6f', blend: true, drop: null, vanilla: { sheet: 668, frame: 'auto' } });
def({ key: 'v_398_corrupt_hardened_sand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#64527E', blend: true, drop: null, vanilla: { sheet: 398, frame: 'auto' } });
def({ key: 'v_379_bubble', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FBD1F0', blend: true, drop: null, vanilla: { sheet: 379, frame: 'auto' } });
def({ key: 'v_618_stone_accent_slab', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#828282', blend: true, drop: null, vanilla: { sheet: 618, frame: 'auto' } });

// framed 物体（frame:style 显式 18px 帧）
def({ key: 'v_165_cave_decos', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#646464', drop: null, vanilla: { sheet: 165, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_184_moss_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#646464', drop: null, light: [77, 0, 89], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 184, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_314_minecart_track', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#B5A47D', drop: null, vanilla: { sheet: 314, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_185_small_decos', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#959573', drop: null, vanilla: { sheet: 185, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_373_water_drip', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#093DBF', drop: null, vanilla: { sheet: 373, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_187_decos_3x2_group_2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null, vanilla: { sheet: 187, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_484_rolling_cactus', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#737E3D', drop: null, vanilla: { sheet: 484, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_374_lava_drip', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FD2003', drop: null, vanilla: { sheet: 374, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_233_jungle_large_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null, vanilla: { sheet: 233, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_105_statue', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 105, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_186_decos_3x2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FF00FF', drop: null, vanilla: { sheet: 186, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_461_sand_drip', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FFDE64', drop: null, vanilla: { sheet: 461, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_178_gems', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF00FF', drop: null, vanilla: { sheet: 178, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_485_antlion_larva', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#A17956', drop: null, vanilla: { sheet: 485, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_637_ash_short_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#884338', drop: null, light: [83, 38, 13], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 637, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_444_bee_hive', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#bfb07c', drop: null, vanilla: { sheet: 444, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_240_wall_hangings_3x3', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#63321E', drop: null, vanilla: { sheet: 240, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_519_cattails', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#7F7F99', drop: null, light: [26, 51, 179], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 519, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_138_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#606060', drop: null, vanilla: { sheet: 138, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_634_ash_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#7D5453', drop: null, light: [166, 77, 26], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 634, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_26_altars', name: '', solid: false, framed: true, opacity: 0.05, pick: -1,  // 原版祭坛镐不可破坏(仅锤≥80+hardMode,Player.cs:45058)
  w: 3, h: 2, mapColor: '#77657D', drop: null, light: [79, 26, 112], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 26, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_82_herbs_sprout', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF7800', drop: null, vanilla: { sheet: 82, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_323_palm_trees', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#B68D56', drop: null, vanilla: { sheet: 323, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_135_pressure_plates', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FD7272', drop: null, vanilla: { sheet: 135, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_91_banners', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#0D5882', drop: null, vanilla: { sheet: 91, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'v_242_paintings_6x4', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 4, mapColor: '#63321E', drop: null, vanilla: { sheet: 242, frame: 'style', fw: 6, fh: 4 } });
def({ key: 'v_50_books', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#AA3072', drop: null, vanilla: { sheet: 50, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_93_lamps', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 6, mapColor: '#FDDD03', drop: null, light: [255, 185, 110], vanilla: { sheet: 93, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'v_549_seaweed', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#385806', drop: null, vanilla: { sheet: 549, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_254_pumpkin_plant', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#F89E5C', drop: null, vanilla: { sheet: 254, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_571_bamboo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#638017', drop: null, vanilla: { sheet: 571, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_246_paintings_3x2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#63321E', drop: null, vanilla: { sheet: 246, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_245_paintings_2x3', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#63321E', drop: null, vanilla: { sheet: 245, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_586_emerald_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 586, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_596_vanity_tree_sakura', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#6E5B4D', drop: null, vanilla: { sheet: 596, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_467_chests_group_2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E9CF5E', drop: null, vanilla: { sheet: 467, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_443_geyser', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#7b7b7b', drop: null, vanilla: { sheet: 443, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_589_amber_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 589, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_411_detonator', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E32E2E', drop: null, vanilla: { sheet: 411, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_518_lily_pads', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#6C5F84', drop: null, vanilla: { sheet: 518, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_588_diamond_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 588, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_585_sapphire_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 585, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_583_topaz_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 583, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_13_placed_bottles', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#85D5F7', drop: null, vanilla: { sheet: 13, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_530_oasis_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#5B546C', drop: null, vanilla: { sheet: 530, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_616_vanity_tree_yellow_willow', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#854F4D', drop: null, vanilla: { sheet: 616, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_215_campfires', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#FE7902', drop: null, light: [255, 185, 110], vanilla: { sheet: 215, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_141_explosives', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#C03B3B', drop: null, vanilla: { sheet: 141, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_597_pylons', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#787F4B', drop: null, light: [13, 204, 77], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 597, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_592_hanging_brazier', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#A57345', drop: null, light: [255, 185, 110], vanilla: { sheet: 592, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_375_honey_drip', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF9C0C', drop: null, vanilla: { sheet: 375, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_227_dye_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 227, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_584_amethyst_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 584, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_231_larva', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#E0C265', drop: null, vanilla: { sheet: 231, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_395_item_frame', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 395, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_241_catacombs', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 3, mapColor: '#4D4A48', drop: null, vanilla: { sheet: 241, frame: 'style', fw: 4, fh: 3 } });
def({ key: 'v_587_ruby_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: -1, axe: 0, w: 1, h: 1, mapColor: '#717171', drop: null, vanilla: { sheet: 587, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_86_loom', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 86, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_376_fishing_crates', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#A0785C', drop: null, vanilla: { sheet: 376, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_470_mannequins', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#7B5B44', drop: null, vanilla: { sheet: 470, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_324_seashells', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#E4D5AD', drop: null, vanilla: { sheet: 324, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_81_coral', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#F585BF', drop: null, vanilla: { sheet: 81, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_136_switch', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#D5CBCC', drop: null, vanilla: { sheet: 136, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_355_alchemy_table', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8D6B59', drop: null, vanilla: { sheet: 355, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_354_bewitching_table', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8D6B59', drop: null, light: [166, 89, 38], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 354, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_103_bowls', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#8D624D', drop: null, vanilla: { sheet: 103, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_529_sea_oats', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#675874', drop: null, vanilla: { sheet: 529, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_506_bast_statue', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#291C13', drop: null, vanilla: { sheet: 506, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_349_mushroom_statue', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#909490', drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 349, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_377_sharpening_station', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 377, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_613_potted_lava_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 5, mapColor: '#885D34', drop: null, light: [179, 77, 51], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 613, frame: 'style', fw: 3, fh: 5 } });
def({ key: 'v_219_extractinator', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 219, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_388_tall_gate_closed', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 5, mapColor: '#7F5C45', drop: null, vanilla: { sheet: 388, frame: 'style', fw: 1, fh: 5 } });
def({ key: 'v_389_tall_gate_open', name: '', solid: false, framed: true, opacity: 1, pick: 0, w: 1, h: 5, mapColor: '#7F5C45', drop: null, vanilla: { sheet: 389, frame: 'style', fw: 1, fh: 5 } }); // 高门开启态：原版 389 未设 tileSolid → 可通行
def({ key: 'v_129_crystal_shard', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#FF75E0', drop: null, light: [0, 13, 64], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 129, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_466_elder_cystal_stand', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 5, h: 4, mapColor: '#CD9949', drop: null, vanilla: { sheet: 466, frame: 'style', fw: 5, fh: 4 } });
def({ key: 'v_220_solidifier', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 220, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_303_lihzahrd_furnace', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 303, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_469_tables_group_2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 469, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_304_living_loom', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 304, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_488_fallen_log', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#72654F', drop: null, vanilla: { sheet: 488, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_548_potted_trees_group_2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 6, mapColor: '#866036', drop: null, light: [179, 77, 51], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 548, frame: 'style', fw: 3, fh: 6 } });
def({ key: 'v_614_potted_ember_tendrils', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 6, mapColor: '#724D31', drop: null, light: [179, 77, 51], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 614, frame: 'style', fw: 3, fh: 6 } });
def({ key: 'v_598_lava_serpent_bowl', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#92726F', drop: null, light: [255, 185, 110], vanilla: { sheet: 598, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_406_chimney', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#787878', drop: null, vanilla: { sheet: 406, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_305_sky_mill', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 305, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_300_bone_welder', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 300, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_302_glass_kiln', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, light: [212, 153, 128], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 302, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_306_ice_machine', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 306, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_247_autohammer', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8C9696', drop: null, vanilla: { sheet: 247, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_491_void_vault', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8149B1', light: [128, 102, 179], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 491, frame: 'style', fw: 3, fh: 3 } }); // 虚空保险库（bank4；破坏回收见储物族注释）
def({ key: 'v_106_sawmill', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 106, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_642_chlorophyte_extractinator', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#6E8B81', drop: null, vanilla: { sheet: 642, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_319_ship_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#604430', drop: null, vanilla: { sheet: 319, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_487_picnic_tables', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 2, mapColor: '#8D5A57', drop: null, vanilla: { sheet: 487, frame: 'style', fw: 4, fh: 2 } });
def({ key: 'v_97_safe', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', vanilla: { sheet: 97, frame: 'style', fw: 2, fh: 2 } }); // 保险箱（bank2；破坏回收见储物族注释）
def({ key: 'v_320_seaweed_planter', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#CBB997', drop: null, vanilla: { sheet: 320, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_405_fireplace', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#8C8C8C', drop: null, light: [255, 185, 110], vanilla: { sheet: 405, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_378_target_dummy', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#A07864', drop: null, vanilla: { sheet: 378, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_218_meat_grinder', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 218, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_356_enchanted_sundial', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#E9CB18', drop: null, light: [115, 64, 0], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 356, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_114_tinkerer_s_workshop', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 114, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_237_lihzahrd_altar', name: '', solid: false, framed: true, opacity: 0.05, pick: 210, w: 3, h: 2, mapColor: '#FFF133', drop: null, light: [26, 26, 0], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 237, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_110_hallow_short_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#30BA87', drop: null, vanilla: { sheet: 110, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_621_slice_of_cake', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#8E6A67', drop: null, vanilla: { sheet: 621, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_387_trap_door_closed', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 1, mapColor: '#7F5C45', drop: null, vanilla: { sheet: 387, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_316_blue_jellyfish_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, light: [102, 26, 64], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 316, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_125_crystal_ball', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#8DAFFF', drop: null, light: [0, 27, 54], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 125, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_287_ammo_box', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#4F8011', drop: null, vanilla: { sheet: 287, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_294_zebra_swallowtail_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 294, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_291_ulysses_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 291, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_292_sulphur_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 292, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_289_purple_emperor_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 289, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_172_sinks', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#B5C2D9', drop: null, vanilla: { sheet: 172, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_656_glow_tulip', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#3995B3', drop: null, light: [255, 185, 110], vanilla: { sheet: 656, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_113_hallow_tall_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#30D0EA', drop: null, vanilla: { sheet: 113, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_235_teleporter', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 3, h: 1, mapColor: '#D6B82E', drop: null, vanilla: { sheet: 235, frame: 'style', fw: 3, fh: 1 } });
def({ key: 'v_567_garden_gnome', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#938381', drop: null, vanilla: { sheet: 567, frame: 'style', fw: 1, fh: 2 } });

// 装饰/植物/藤蔓（非实心非framed）
def({ key: 'v_638_ash_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#844A3C', drop: null, light: [83, 38, 13], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 638, frame: 'auto' } });
def({ key: 'v_528_mushroom_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#827E5D', drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 528, frame: 'auto' } });
def({ key: 'v_382_flower_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#1CD85E', drop: null, vanilla: { sheet: 382, frame: 'auto' } });
def({ key: 'v_124_wooden_beam', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#493324', drop: null, vanilla: { sheet: 124, frame: 'auto' } });
def({ key: 'v_575_rich_mahogany_beam', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#60393C', drop: null, vanilla: { sheet: 575, frame: 'auto' } });
def({ key: 'v_213_rope', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#897843', drop: null, rope: true, vanilla: { sheet: 213, frame: 'auto' } });
def({ key: 'v_636_corrupt_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#746CA3', drop: null, vanilla: { sheet: 636, frame: 'auto' } });
def({ key: 'v_574_boreal_beam', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#44372F', drop: null, vanilla: { sheet: 574, frame: 'auto' } });
def({ key: 'v_333_platinum_coin_pile', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#BEBEB2', drop: null, vanilla: { sheet: 333, frame: 'auto' } });
def({ key: 'v_332_gold_coin_pile', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#CCB548', drop: null, vanilla: { sheet: 332, frame: 'auto' } });
def({ key: 'v_577_sandstone_column', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#885635', drop: null, vanilla: { sheet: 577, frame: 'auto' } });
def({ key: 'v_561_marble_column', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#6E7482', drop: null, vanilla: { sheet: 561, frame: 'auto' } });
def({ key: 'v_576_granite_column', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#242659', drop: null, vanilla: { sheet: 576, frame: 'auto' } });
def({ key: 'v_214_chain', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#676767', drop: null, vanilla: { sheet: 214, frame: 'auto' } });
def({ key: 'v_578_mushroom_beam', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#575340', drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 578, frame: 'auto' } });

// cleared 组补全（藤蔓/荆棘，原版 51/52/62/69）
def({ key: 'v_52_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#3E7A2E', drop: null, vanilla: { sheet: 52, frame: 'auto' } });
def({ key: 'v_62_jungle_vines', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#2E8B3D', drop: null, vanilla: { sheet: 62, frame: 'auto' } });
def({ key: 'v_69_jungle_thorns', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#4A5E3E', drop: null, vanilla: { sheet: 69, frame: 'auto' } });

// ===================== FTW_V2 兼容补全 =====================
def({ key: 'v_625_neon_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#906094', blend: true, drop: null, light: [77, 0, 89], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 625, frame: 'auto' } });
def({ key: 'v_151_sandstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BEAB5E', blend: true, drop: null, vanilla: { sheet: 151, frame: 'auto' } });
def({ key: 'v_234_crimsand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#352C29', blend: true, drop: null, vanilla: { sheet: 234, frame: 'auto' } });
def({ key: 'v_182_blue_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#2B568C', blend: true, drop: null, vanilla: { sheet: 182, frame: 'auto' } });
def({ key: 'v_205_crimson_vines', name: '', solid: false, /* 原版非实心 */ opacity: 1, pick: 0, mapColor: '#BA3234', blend: true, drop: null, vanilla: { sheet: 205, frame: 'auto' } });
def({ key: 'v_45_gold_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#B9A417', blend: true, drop: null, vanilla: { sheet: 45, frame: 'auto' } });
def({ key: 'v_399_crimson_hardened_sand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4D4C42', blend: true, drop: null, vanilla: { sheet: 399, frame: 'auto' } });
def({ key: 'v_352_crimtane_thorns', name: '', solid: false, /* 原版非实心：荆棘只伤不挡 */ opacity: 1, pick: 0, mapColor: '#EE615E', blend: true, drop: null, vanilla: { sheet: 352, frame: 'auto' } });
def({ key: 'v_248_palladium_column', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#DB4726', blend: true, drop: null, vanilla: { sheet: 248, frame: 'auto' } });
def({ key: 'v_340_living_cursed_fire_block', name: '', solid: false, /* 原版非实心：活性诅咒火可穿 */ opacity: 1, pick: 0, mapColor: '#60F802', blend: true, drop: null, light: [115, 255, 115], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 340, frame: 'auto' } });
def({ key: 'v_207_water_fountains', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 4, mapColor: '#909490', drop: null, vanilla: { sheet: 207, frame: 'style', fw: 2, fh: 4 } });
def({ key: 'v_144_timers', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#909490', drop: null, vanilla: { sheet: 144, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_475_hat_rack', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#6B4F3B', drop: null, vanilla: { sheet: 475, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_175_tin_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#817D5D', blend: true, drop: null, vanilla: { sheet: 175, frame: 'auto' } });
def({ key: 'v_132_lever', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 132, frame: 'style', fw: 2, fh: 2 } });

// ===================== 不负责任的女妖啤酒厂 兼容补全 =====================
def({ key: 'v_539_argon_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#9A6387', blend: true, drop: null, light: [77, 0, 43], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 539, frame: 'auto' } });
def({ key: 'v_481_cracked_blue_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#383E50', blend: true, drop: null, vanilla: { sheet: 481, frame: 'auto' } });
def({ key: 'v_119_iridescent_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8890A0', blend: true, drop: null, vanilla: { sheet: 119, frame: 'auto' } });
def({ key: 'v_120_mudstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5C4449', blend: true, drop: null, vanilla: { sheet: 120, frame: 'auto' } });
def({ key: 'v_714_spider_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null, vanilla: { sheet: 714, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_752_chillet_egg', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null, vanilla: { sheet: 752, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_751_sleeping_digtoise', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#baa854', drop: null, vanilla: { sheet: 751, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_664_bouncy_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#497811', drop: null, vanilla: { sheet: 664, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_711_rainbow_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#b6af82', drop: null, light: [3, 3, 3], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 711, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_715_ghoulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null, vanilla: { sheet: 715, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_716_friendly_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null, vanilla: { sheet: 716, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_713_lava_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#7ad9e8', drop: null, vanilla: { sheet: 713, frame: 'style', fw: 2, fh: 2 } });

// ===================== wld 独立映射修复（原为错误复用） =====================
def({ key: 'v_23_corrupt_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8D89DF', blend: true, drop: null, vanilla: { sheet: 23, frame: 'blend' } });
def({ key: 'v_31_orb_heart', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#8D78A8', drop: null, light: [79, 26, 112], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 31, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_41_blue_brick', name: '', solid: true, opacity: 1, pick: 100, mapColor: '#42546D', blend: true, drop: null, vanilla: { sheet: 41, frame: 'auto' } });
def({ key: 'v_75_obsidian_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#242424', blend: true, drop: null, vanilla: { sheet: 75, frame: 'auto' } });
def({ key: 'v_199_crimson_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#D05050', blend: true, drop: null, vanilla: { sheet: 199, frame: 'blend' } });
def({ key: 'v_60_jungle_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8FD71D', blend: true, drop: null, vanilla: { sheet: 60, frame: 'blend' } });
def({ key: 'v_70_mushroom_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5D7FFF', blend: true, drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 70, frame: 'blend' } });

def({ key: 'v_25_ebonstone_block', name: '', solid: true, opacity: 1, pick: 65, mapColor: '#6D5A80', blend: true, drop: null, vanilla: { sheet: 25, frame: 'blend' } });
def({ key: 'v_202_sunplate_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#D5B21C', blend: true, drop: null, vanilla: { sheet: 202, frame: 'auto' } });
def({ key: 'v_71_mushroom_plant', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#B6AF82', drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 71, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_24_corruption_short_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#7A74DA', drop: null, vanilla: { sheet: 24, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_32_corruption_thorns', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9787B7', drop: null, vanilla: { sheet: 32, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_27_sunflower', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 4, mapColor: '#E2C431', drop: null, light: [255, 242, 166], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 27, frame: 'style', fw: 2, fh: 4 } });
def({ key: 'v_5_trees', name: '', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#6B4A2B', drop: null, vanilla: { sheet: 5, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_80_cactus', name: '', decor: true, framed: true, opacity: 0, pick: 0, axe: 0, mapColor: '#5A7A3A', drop: null, vanilla: { sheet: 80, frame: 'style', fw: 1, fh: 1 } });

def({ key: 'v_3_forest_short_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null, vanilla: { sheet: 3, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_73_forest_tall_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null, vanilla: { sheet: 73, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_61_jungle_short_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null, light: [107, 207, 133], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 61, frame: 'style', fw: 1, fh: 1 } }); // 丛林矮草（16x20 表）
def({ key: 'v_74_jungle_tall_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#3D7A2E', drop: null, vanilla: { sheet: 74, frame: 'style', fw: 1, fh: 2 } }); // 丛林高草（16x32 两格高）
def({ key: 'v_83_herbs_mature', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9BC924', drop: null, light: [230, 184, 46], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 83, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_84_herbs_bloom', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#9BC924', drop: null, vanilla: { sheet: 84, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_72_mushroom_tree', name: '', decor: true, framed: true, opacity: 0, pick: -1, axe: 0, mapColor: '#5D7FFF', drop: null, light: [0, 51, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 72, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_43_green_brick', name: '', solid: true, opacity: 1, pick: 100, mapColor: '#3E6046', blend: true, drop: null, vanilla: { sheet: 43, frame: 'auto' } });
def({ key: 'v_44_pink_brick', name: '', solid: true, opacity: 1, pick: 100, mapColor: '#6B4463', blend: true, drop: null, vanilla: { sheet: 44, frame: 'auto' } });
def({ key: 'v_203_crimstone_block', name: '', solid: true, opacity: 1, pick: 65, mapColor: '#802C2D', blend: true, drop: null, vanilla: { sheet: 203, frame: 'blend' } });
def({ key: 'v_201_crimson_short_plants', name: '', decor: true, framed: true, opacity: 0, pick: 0, mapColor: '#CB3D40', drop: null, vanilla: { sheet: 201, frame: 'style', fw: 1, fh: 1 } });

// 所有 def() 注册完毕后统一回填 key→id 映射（必须位于文件末尾）
// ===================== 电路系统器件(Wiring.cs HitWireSingle 器件表配套) =====================
def({ key: 'v_35_jackolanterns', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#C5D8DB', drop: null, light: [179, 153, 230], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 35, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_92_lampposts', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 6, mapColor: '#D5E5ED', drop: null, light: [255, 255, 255], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 92, frame: 'style', fw: 1, fh: 6 } });
def({ key: 'v_126_discoball', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#9FD1E5', drop: null, vanilla: { sheet: 126, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_131_inactivestoneblock', name: '', solid: false, /* 致动关闭态=inactive：不参与碰撞 */ opacity: 1, pick: 0, blend: true, mapColor: '#343434', drop: null, vanilla: { sheet: 131, frame: 'auto' } });
def({ key: 'v_139_musicboxes', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 139, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_142_inletpump', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 142, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_143_outletpump', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 143, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_149_holidaylights', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#DC3232', drop: null, light: [26, 51, 128], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 149, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_173_platinumcandelabra', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FDDD03', drop: null, light: [255, 242, 166], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 173, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_174_platinumcandle', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#FDDD03', drop: null, light: [255, 242, 166], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 174, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_209_cannon', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 4, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 209, frame: 'style', fw: 4, fh: 3 } });
def({ key: 'v_210_landmine', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#C03B3B', drop: null, vanilla: { sheet: 210, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_212_snowballlauncher', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 212, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_216_firework', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 2, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 216, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_244_bubblemachine', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 2, mapColor: '#C8F5FD', drop: null, vanilla: { sheet: 244, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_255_amethystgemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#6B319A', drop: null, vanilla: { sheet: 255, frame: 'auto' } });
def({ key: 'v_256_topazgemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#9A9431', drop: null, vanilla: { sheet: 256, frame: 'auto' } });
def({ key: 'v_257_sapphiregemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#31319A', drop: null, vanilla: { sheet: 257, frame: 'auto' } });
def({ key: 'v_258_emeraldgemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#319A44', drop: null, vanilla: { sheet: 258, frame: 'auto' } });
def({ key: 'v_259_rubygemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#9A314D', drop: null, vanilla: { sheet: 259, frame: 'auto' } });
def({ key: 'v_260_diamondgemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#555976', drop: null, vanilla: { sheet: 260, frame: 'auto' } });
def({ key: 'v_261_ambergemsparkoff', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#9A5331', drop: null, vanilla: { sheet: 261, frame: 'auto' } });
def({ key: 'v_262_amethystgemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#DD4FFF', drop: null, vanilla: { sheet: 262, frame: 'auto' } });
def({ key: 'v_263_topazgemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#FAFF4F', drop: null, vanilla: { sheet: 263, frame: 'auto' } });
def({ key: 'v_264_sapphiregemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#4F66FF', drop: null, vanilla: { sheet: 264, frame: 'auto' } });
def({ key: 'v_265_emeraldgemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#4FFF59', drop: null, vanilla: { sheet: 265, frame: 'auto' } });
def({ key: 'v_266_rubygemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#FF4F4F', drop: null, vanilla: { sheet: 266, frame: 'auto' } });
def({ key: 'v_267_diamondgemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#F0F0F7', drop: null, vanilla: { sheet: 267, frame: 'auto' } });
def({ key: 'v_268_ambergemspark', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#FF914F', drop: null, vanilla: { sheet: 268, frame: 'auto' } });
def({ key: 'v_335_fireworksbox', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#D9AE89', drop: null, vanilla: { sheet: 335, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_338_fireworkfountain', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 2, mapColor: '#55FFA0', drop: null, vanilla: { sheet: 338, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_372_peacecandle', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#FC80C9', drop: null, light: [230, 26, 191], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 372, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_386_trapdooropen', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#7F5C45', drop: null, vanilla: { sheet: 386, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_389_tallgateopen', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 5, mapColor: '#7F5C45', drop: null, vanilla: { sheet: 389, frame: 'style', fw: 1, fh: 5 } });
def({ key: 'v_410_lunarmonolith', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#4B8BA6', drop: null, vanilla: { sheet: 410, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_419_logicgatelamp', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#757D97', drop: null, vanilla: { sheet: 419, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_420_logicgate', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 420, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_421_conveyorbeltleft', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#494646', drop: null, vanilla: { sheet: 421, frame: 'auto' } });
def({ key: 'v_423_logicsensor', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 423, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_424_wirepipe', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#929BBB', drop: null, vanilla: { sheet: 424, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_425_announcementbox', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#AEC3D7', drop: null, vanilla: { sheet: 425, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_428_weightedpressureplate', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 428, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_429_wirebulb', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#3F3F3F', drop: null, vanilla: { sheet: 429, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_440_gemlocks', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 3, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 440, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_441_fakecontainers', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 441, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_442_projectilepressurepad', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#0390C9', drop: null, vanilla: { sheet: 442, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_445_pixelbox', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#373749', drop: null, vanilla: { sheet: 445, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_452_sillyballoonmachine', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 3, mapColor: '#FF96B5', drop: null, vanilla: { sheet: 452, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_455_partymonolith', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 3, h: 3, mapColor: '#30FF6E', drop: null, vanilla: { sheet: 455, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_468_fakecontainers2', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 468, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_476_golfhole', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#85909A', drop: null, vanilla: { sheet: 476, frame: 'style', fw: 1, fh: 1 } }); // 原版 tileSolid[476]=true
def({ key: 'v_480_bloodmoonmonolith', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#827C7F', drop: null, vanilla: { sheet: 480, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_497_toilets', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 2, mapColor: '#356D40', drop: null, vanilla: { sheet: 497, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_509_voidmonolith', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#36363A', drop: null, vanilla: { sheet: 509, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_531_boulderstatue', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 3, mapColor: '#6B6B6B', drop: null, vanilla: { sheet: 531, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_546_grate', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#87695E', drop: null, vanilla: { sheet: 546, frame: 'auto' } });
def({ key: 'v_557_grateclosed', name: '', solid: true, opacity: 1, pick: 0, blend: true, mapColor: '#624840', drop: null, vanilla: { sheet: 557, frame: 'auto' } });
def({ key: 'v_564_plasmalamp', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#575C70', drop: null, light: [13, 77, 140], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 564, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_565_fogmachine', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#628195', drop: null, vanilla: { sheet: 565, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_593_volcanosmall', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 1, h: 1, mapColor: '#684C43', drop: null, light: [204, 77, 26], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 593, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_594_volcanolarge', name: '', decor: true, framed: true, opacity: 0, pick: 0, w: 2, h: 2, mapColor: '#745540', drop: null, light: [204, 77, 26], /* 原版 tileLighted 发光色（TileLightScanner ApplyTileLight 提取） */ vanilla: { sheet: 594, frame: 'style', fw: 2, fh: 2 } });

def({ key: 'v_482_cracked_green_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3E5E42', blend: true, drop: null, vanilla: { sheet: 482, frame: 'auto' } });
def({ key: 'v_163_purple_ice_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8A7AB8', blend: true, drop: null, vanilla: { sheet: 163, frame: 'auto' } });
def({ key: 'v_200_red_ice_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A85A5A', blend: true, drop: null, vanilla: { sheet: 200, frame: 'auto' } });
def({ key: 'v_116_pearlsand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#C8C8D8', blend: true, drop: null, vanilla: { sheet: 116, frame: 'auto' } });
def({ key: 'v_76_hellstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#762427', blend: true, drop: null, vanilla: { sheet: 76, frame: 'auto' } });
def({ key: 'v_77_hellforge', name: '', solid: false, framed: true, opacity: 1, pick: 65, light: [255, 140, 70], mapColor: '#EE5546', drop: null, vanilla: { sheet: 77, frame: 'style', fw: 3, fh: 2 } }); // 地狱熔炉（原版专属表 Tiles_77；tileSolid 未设=可通行，火光同熔炉）
def({ key: 'v_55_signs', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#B08050', drop: null, vanilla: { sheet: 55, frame: 'style', fw: 2, fh: 2 } });
// 动画制作台补全（原版 AnimateTiles 300-308 组 + 499；TEdit 实名 301/307/308 曾在素材表提取缺口）
def({ key: 'v_301_flesh_cloning_vat', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 301, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_307_steampunk_boiler', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 307, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_308_honey_dispenser', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 308, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_499_decay_chamber', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8F9475', drop: null, vanilla: { sheet: 499, frame: 'style', fw: 3, fh: 3 } });

// ===================== TEdit 全量补齐（缺失 sheet 程序生成，勿手改） =====================
def({ key: 'v_36_presents', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#E6595C', drop: null, vanilla: { sheet: 36, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_46_silver_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#B9C2C3', blend: true, drop: null, vanilla: { sheet: 46, frame: 'auto' } });
def({ key: 'v_47_copper_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#964316', blend: true, drop: null, vanilla: { sheet: 47, frame: 'auto' } });
def({ key: 'v_99_trash_can', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 99, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_102_throne', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#E5D449', drop: null, vanilla: { sheet: 102, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_115_hallowed_vines', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#21ABCF', blend: true, drop: null, vanilla: { sheet: 115, frame: 'auto' } });
def({ key: 'v_121_cobalt_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#0B508F', blend: true, drop: null, vanilla: { sheet: 121, frame: 'auto' } });
def({ key: 'v_122_mythril_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5BA9A9', blend: true, drop: null, vanilla: { sheet: 122, frame: 'auto' } });
def({ key: 'v_127_ice_ice_rod', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#80CCE6', blend: true, drop: null, vanilla: { sheet: 127, frame: 'auto' } });
def({ key: 'v_128_mannequin_legacy', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 128, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_133_forges', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#E73538', drop: null, vanilla: { sheet: 133, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_134_anvils_hardmode', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#A6BB99', drop: null, vanilla: { sheet: 134, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_140_demonite_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#625FA7', blend: true, drop: null, vanilla: { sheet: 140, frame: 'auto' } });
def({ key: 'v_145_red_candy_cane_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#C01E1E', blend: true, drop: null, vanilla: { sheet: 145, frame: 'auto' } });
def({ key: 'v_146_green_candy_cane_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#2BC01E', blend: true, drop: null, vanilla: { sheet: 146, frame: 'auto' } });
def({ key: 'v_150_adamantite_beam', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#801A34', blend: true, drop: null, vanilla: { sheet: 150, frame: 'auto' } });
def({ key: 'v_153_red_stucco', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#EF8D7E', blend: true, drop: null, vanilla: { sheet: 153, frame: 'auto' } });
def({ key: 'v_154_yellow_stucco', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BEAB5E', blend: true, drop: null, vanilla: { sheet: 154, frame: 'auto' } });
def({ key: 'v_155_green_stucco', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#83A2A1', blend: true, drop: null, vanilla: { sheet: 155, frame: 'auto' } });
def({ key: 'v_156_gray_stucco', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#AAAB9D', blend: true, drop: null, vanilla: { sheet: 156, frame: 'auto' } });
def({ key: 'v_157_ebonwood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#68647E', blend: true, drop: null, vanilla: { sheet: 157, frame: 'auto' } });
def({ key: 'v_159_pearlwood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#948562', blend: true, drop: null, vanilla: { sheet: 159, frame: 'auto' } });
def({ key: 'v_160_rainbow_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#0000C8', blend: true, drop: null, vanilla: { sheet: 160, frame: 'auto' } });
def({ key: 'v_164_pink_ice_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#DAB6CC', blend: true, drop: null, vanilla: { sheet: 164, frame: 'auto' } });
def({ key: 'v_170_pine_tree_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#E4DBA2', blend: true, drop: null, vanilla: { sheet: 170, frame: 'auto' } });
def({ key: 'v_171_christmas_tree', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 8, mapColor: '#218755', drop: null, vanilla: { sheet: 171, frame: 'style', fw: 4, fh: 8 } });
def({ key: 'v_176_tungsten_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#849D7F', blend: true, drop: null, vanilla: { sheet: 176, frame: 'auto' } });
def({ key: 'v_177_platinum_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#98ABC6', blend: true, drop: null, vanilla: { sheet: 177, frame: 'auto' } });
def({ key: 'v_180_yellow_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7E8631', blend: true, drop: null, vanilla: { sheet: 180, frame: 'auto' } });
def({ key: 'v_188_cactus_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#497811', blend: true, drop: null, vanilla: { sheet: 188, frame: 'auto' } });
def({ key: 'v_194_bone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#9D9D6B', blend: true, drop: null, vanilla: { sheet: 194, frame: 'auto' } });
def({ key: 'v_195_flesh_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#861622', blend: true, drop: null, vanilla: { sheet: 195, frame: 'auto' } });
def({ key: 'v_197_frozen_slime_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#61C8E1', blend: true, drop: null, vanilla: { sheet: 197, frame: 'auto' } });
def({ key: 'v_198_asphalt_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3E3D34', blend: true, drop: null, vanilla: { sheet: 198, frame: 'auto' } });
def({ key: 'v_208_shadewood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#586976', blend: true, drop: null, vanilla: { sheet: 208, frame: 'auto' } });
def({ key: 'v_217_blend_o_matic', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#909490', drop: null, vanilla: { sheet: 217, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_228_dye_vat', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 228, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_236_life_fruit_plant', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#95E857', drop: null, vanilla: { sheet: 236, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_238_plantera_s_bulb', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#E180CE', drop: null, vanilla: { sheet: 238, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_239_ore_bars', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#E0C265', drop: null, vanilla: { sheet: 239, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_243_imbuing_station', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#8CB3FE', drop: null, vanilla: { sheet: 243, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_249_bubblegum_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#F934F3', blend: true, drop: null, vanilla: { sheet: 249, frame: 'auto' } });
def({ key: 'v_250_titanstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4C4A53', blend: true, drop: null, vanilla: { sheet: 250, frame: 'auto' } });
def({ key: 'v_251_pumpkin_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#EB9617', blend: true, drop: null, vanilla: { sheet: 251, frame: 'auto' } });
def({ key: 'v_252_hay_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#99832C', blend: true, drop: null, vanilla: { sheet: 252, frame: 'auto' } });
def({ key: 'v_253_spooky_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#393061', blend: true, drop: null, vanilla: { sheet: 253, frame: 'auto' } });
def({ key: 'v_269_womannequin_legacy', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 269, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_270_firefly_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 270, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_271_lightning_bug_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 271, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_275_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 275, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_276_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 276, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_277_mallard_duck_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 277, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_278_duck_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 278, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_279_bird_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 279, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_280_blue_jay_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 280, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_281_cardinal_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 281, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_282_fish_bowl', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 282, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_283_heavy_work_bench', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#808080', drop: null, vanilla: { sheet: 283, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_284_copper_plating', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#964316', blend: true, drop: null, vanilla: { sheet: 284, frame: 'auto' } });
def({ key: 'v_285_snail_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 285, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_286_glowing_snail_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 286, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_288_monarch_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 288, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_290_red_admiral_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 290, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_293_tree_nymph_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 293, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_295_julia_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 295, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_296_scorpion_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 296, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_297_black_scorpion_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 297, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_298_frog_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 298, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_299_mouse_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 299, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_309_penguin_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 309, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_310_worm_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 310, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_313_blue_dynasty_shingles', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#57969A', blend: true, drop: null, vanilla: { sheet: 313, frame: 'auto' } });
def({ key: 'v_315_coralstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#EB7250', blend: true, drop: null, vanilla: { sheet: 315, frame: 'auto' } });
def({ key: 'v_317_green_jellyfish_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 317, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_318_pink_jellyfish_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 318, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_325_tin_plating', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#817D5D', blend: true, drop: null, vanilla: { sheet: 325, frame: 'auto' } });
def({ key: 'v_326_waterfall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#093DBF', blend: true, drop: null, vanilla: { sheet: 326, frame: 'auto' } });
def({ key: 'v_327_lavafall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FD2003', blend: true, drop: null, vanilla: { sheet: 327, frame: 'auto' } });
def({ key: 'v_328_confetti_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#C8F6FE', blend: true, drop: null, vanilla: { sheet: 328, frame: 'auto' } });
def({ key: 'v_329_midnight_confetti_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#0F0F0F', blend: true, drop: null, vanilla: { sheet: 329, frame: 'auto' } });
def({ key: 'v_330_copper_coin_pile', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#E2764C', drop: null, vanilla: { sheet: 330, frame: 'auto' } });
def({ key: 'v_331_silver_coin_pile', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#A1ACAD', drop: null, vanilla: { sheet: 331, frame: 'auto' } });
def({ key: 'v_334_weapon_rack_legacy_do_not_use', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#BF8E6F', drop: null, vanilla: { sheet: 334, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_336_living_fire_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FD3E03', blend: true, drop: null, vanilla: { sheet: 336, frame: 'auto' } });
def({ key: 'v_337_text_statue', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#909490', drop: null, vanilla: { sheet: 337, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_339_grasshopper_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 339, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_341_living_demon_fire_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#694ACA', blend: true, drop: null, vanilla: { sheet: 341, frame: 'auto' } });
def({ key: 'v_342_living_frost_fire_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#1DF0FF', blend: true, drop: null, vanilla: { sheet: 342, frame: 'auto' } });
def({ key: 'v_343_living_ichor_fire_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FECA50', blend: true, drop: null, vanilla: { sheet: 343, frame: 'auto' } });
def({ key: 'v_344_living_ultrabright_fire_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#83FCF5', blend: true, drop: null, vanilla: { sheet: 344, frame: 'auto' } });
def({ key: 'v_345_honeyfall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FF9C0C', blend: true, drop: null, vanilla: { sheet: 345, frame: 'auto' } });
def({ key: 'v_346_chlorophyte_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#95D459', blend: true, drop: null, vanilla: { sheet: 346, frame: 'auto' } });
def({ key: 'v_347_crimtane_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#EC4A4F', blend: true, drop: null, vanilla: { sheet: 347, frame: 'auto' } });
def({ key: 'v_348_shroomite_plating', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#2C1AE9', blend: true, drop: null, light: [0, 51, 255], /* 原版 tileLighted[348]（Main.cs:9923）+ 蘑菇组发光色（TileLightScanner.cs:2938） */ vanilla: { sheet: 348, frame: 'auto' } });
def({ key: 'v_351_smoke_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#1F1F1F', blend: true, drop: null, vanilla: { sheet: 351, frame: 'auto' } });
def({ key: 'v_358_gold_bird_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 358, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_359_gold_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 359, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_360_gold_butterfly_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 360, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_361_gold_frog_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 361, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_362_gold_grasshopper_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 362, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_363_gold_mouse_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 363, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_364_gold_worm_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 364, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_365_silk_rope', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#9288CD', blend: true, drop: null, vanilla: { sheet: 365, frame: 'auto' } });
def({ key: 'v_366_web_rope', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#DFE8E9', blend: true, drop: null, vanilla: { sheet: 366, frame: 'auto' } });
def({ key: 'v_370_meteorite_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7F74C2', blend: true, drop: null, vanilla: { sheet: 370, frame: 'auto' } });
def({ key: 'v_385_crystal_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#571590', blend: true, drop: null, vanilla: { sheet: 385, frame: 'auto' } });
def({ key: 'v_390_lava_lamp', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#FD2003', drop: null, vanilla: { sheet: 390, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_391_cage_enchanted_nightcrawler', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 391, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_392_buggy_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 392, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_393_grubby_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 393, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_394_sluggy_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 394, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_400_corrupt_sandstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#604475', blend: true, drop: null, vanilla: { sheet: 400, frame: 'auto' } });
def({ key: 'v_401_crimson_sandstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#443C33', blend: true, drop: null, vanilla: { sheet: 401, frame: 'auto' } });
def({ key: 'v_402_hallow_hardened_sand_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#AEA8BA', blend: true, drop: null, vanilla: { sheet: 402, frame: 'auto' } });
def({ key: 'v_403_hallow_sandstone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#CD98BA', blend: true, drop: null, vanilla: { sheet: 403, frame: 'auto' } });
def({ key: 'v_407_sturdy_fossil_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FFE384', blend: true, drop: null, vanilla: { sheet: 407, frame: 'auto' } });
def({ key: 'v_408_luminite_ore', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#555352', blend: true, drop: null, vanilla: { sheet: 408, frame: 'auto' } });
def({ key: 'v_409_luminite_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#555352', blend: true, drop: null, vanilla: { sheet: 409, frame: 'auto' } });
def({ key: 'v_412_lunar_crafting_station', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#4B8BA6', drop: null, vanilla: { sheet: 412, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_413_red_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 413, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_414_gold_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7AD9E8', drop: null, vanilla: { sheet: 414, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_415_solar_fragment_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#F94B07', blend: true, drop: null, vanilla: { sheet: 415, frame: 'auto' } });
def({ key: 'v_416_vortex_fragment_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#00A0AA', blend: true, drop: null, vanilla: { sheet: 416, frame: 'auto' } });
def({ key: 'v_417_nebula_fragment_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A057EA', blend: true, drop: null, vanilla: { sheet: 417, frame: 'auto' } });
def({ key: 'v_418_stardust_fragment_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#16ADFE', blend: true, drop: null, vanilla: { sheet: 418, frame: 'auto' } });
def({ key: 'v_426_red_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4d0b23', blend: true, drop: null, vanilla: { sheet: 426, frame: 'auto' } });
def({ key: 'v_427_red_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#771634', drop: null, vanilla: { sheet: 427, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_430_green_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#17774f', blend: true, drop: null, vanilla: { sheet: 430, frame: 'auto' } });
def({ key: 'v_431_blue_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#173677', blend: true, drop: null, vanilla: { sheet: 431, frame: 'auto' } });
def({ key: 'v_432_yellow_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#774417', blend: true, drop: null, vanilla: { sheet: 432, frame: 'auto' } });
def({ key: 'v_433_pink_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4a1777', blend: true, drop: null, vanilla: { sheet: 433, frame: 'auto' } });
def({ key: 'v_434_white_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4e526d', blend: true, drop: null, vanilla: { sheet: 434, frame: 'auto' } });
def({ key: 'v_435_green_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#27a860', drop: null, vanilla: { sheet: 435, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_436_blue_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#275ea8', drop: null, vanilla: { sheet: 436, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_437_yellow_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#a87927', drop: null, vanilla: { sheet: 437, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_438_pink_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#6f27a8', drop: null, vanilla: { sheet: 438, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_439_white_team_platform', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#9694ae', drop: null, vanilla: { sheet: 439, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_446_silly_pink_balloon_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#FF4298', blend: true, drop: null, vanilla: { sheet: 446, frame: 'auto' } });
def({ key: 'v_447_silly_purple_balloon_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#B384FF', blend: true, drop: null, vanilla: { sheet: 447, frame: 'auto' } });
def({ key: 'v_448_silly_green_balloon_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#00CEB4', blend: true, drop: null, vanilla: { sheet: 448, frame: 'auto' } });
def({ key: 'v_449_blue_streamer', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5bbaf0', blend: true, drop: null, vanilla: { sheet: 449, frame: 'auto' } });
def({ key: 'v_450_green_streamer', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5cf05b', blend: true, drop: null, vanilla: { sheet: 450, frame: 'auto' } });
def({ key: 'v_451_pink_streamer', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#f05b93', blend: true, drop: null, vanilla: { sheet: 451, frame: 'auto' } });
def({ key: 'v_453_silly_tied_balloon', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 3, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 453, frame: 'style', fw: 1, fh: 3 } });
def({ key: 'v_454_pigronata', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 3, mapColor: '#ae10b0', drop: null, vanilla: { sheet: 454, frame: 'style', fw: 4, fh: 3 } });
def({ key: 'v_456_silly_tied_bundle_of_balloons', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#b384ff', drop: null, vanilla: { sheet: 456, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_457_party_presents', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#FFFFFF', drop: null, vanilla: { sheet: 457, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_458_sandfall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#d3c66f', blend: true, drop: null, vanilla: { sheet: 458, frame: 'auto' } });
def({ key: 'v_459_snowfall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#bedfe8', blend: true, drop: null, vanilla: { sheet: 459, frame: 'auto' } });
def({ key: 'v_460_snow_cloud_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8da3b5', blend: true, drop: null, vanilla: { sheet: 460, frame: 'auto' } });
def({ key: 'v_462_desert_spirit_lamp', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#E7B21C', drop: null, vanilla: { sheet: 462, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_464_war_table', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 5, h: 4, mapColor: '#E9B780', drop: null, vanilla: { sheet: 464, frame: 'style', fw: 5, fh: 4 } });
def({ key: 'v_465_war_table_banner', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#3354C3', drop: null, vanilla: { sheet: 465, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_471_weapon_rack', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#6F513A', drop: null, vanilla: { sheet: 471, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_472_iron_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8D796F', blend: true, drop: null, vanilla: { sheet: 472, frame: 'auto' } });
def({ key: 'v_473_lead_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#42505E', blend: true, drop: null, vanilla: { sheet: 473, frame: 'auto' } });
def({ key: 'v_474_lesion_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#755E60', blend: true, drop: null, vanilla: { sheet: 474, frame: 'auto' } });
def({ key: 'v_478_crimstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A55557', blend: true, drop: null, vanilla: { sheet: 478, frame: 'auto' } });
def({ key: 'v_486_drum_set', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#7A775C', drop: null, vanilla: { sheet: 486, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_489_pin_wheel', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#545A83', drop: null, vanilla: { sheet: 489, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_490_weather_vane', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#808789', drop: null, vanilla: { sheet: 490, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_492_hallowed_mowed_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#686C63', blend: true, drop: null, vanilla: { sheet: 492, frame: 'auto' } });
def({ key: 'v_493_pin_flags', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#8855A1', drop: null, vanilla: { sheet: 493, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_494_golf_tee', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#A5A4B6', drop: null, vanilla: { sheet: 494, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_496_anti_portal_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#655A54', blend: true, drop: null, vanilla: { sheet: 496, frame: 'auto' } });
def({ key: 'v_498_spider_nest_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8E614D', blend: true, drop: null, vanilla: { sheet: 498, frame: 'auto' } });
def({ key: 'v_500_solar_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7B463E', blend: true, drop: null, vanilla: { sheet: 500, frame: 'auto' } });
def({ key: 'v_501_vortex_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#6B6772', blend: true, drop: null, vanilla: { sheet: 501, frame: 'auto' } });
def({ key: 'v_502_nebula_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7995AB', blend: true, drop: null, vanilla: { sheet: 502, frame: 'auto' } });
def({ key: 'v_503_stardust_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#BC8C53', blend: true, drop: null, vanilla: { sheet: 503, frame: 'auto' } });
def({ key: 'v_504_mystic_snake_rope', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#5C4B76', drop: null, vanilla: { sheet: 504, frame: 'auto' } });
def({ key: 'v_505_gold_fish_bowl', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#73898C', drop: null, vanilla: { sheet: 505, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_507_gold_starry_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#66503D', blend: true, drop: null, vanilla: { sheet: 507, frame: 'auto' } });
def({ key: 'v_508_blue_starry_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#1F3862', blend: true, drop: null, vanilla: { sheet: 508, frame: 'auto' } });
def({ key: 'v_510_arrow_sign', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#73533C', drop: null, vanilla: { sheet: 510, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_511_painted_arrow_sign', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#875E63', drop: null, vanilla: { sheet: 511, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_512_green_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#537069', blend: true, drop: null, vanilla: { sheet: 512, frame: 'auto' } });
def({ key: 'v_513_brown_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#6C6E57', blend: true, drop: null, vanilla: { sheet: 513, frame: 'auto' } });
def({ key: 'v_514_red_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7E7063', blend: true, drop: null, vanilla: { sheet: 514, frame: 'auto' } });
def({ key: 'v_515_blue_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4C6470', blend: true, drop: null, vanilla: { sheet: 515, frame: 'auto' } });
def({ key: 'v_516_purple_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#6A5278', blend: true, drop: null, vanilla: { sheet: 516, frame: 'auto' } });
def({ key: 'v_517_lava_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A1704F', blend: true, drop: null, vanilla: { sheet: 517, frame: 'auto' } });
def({ key: 'v_520_plate', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#87929C', drop: null, vanilla: { sheet: 520, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_521_black_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#496A6E', drop: null, vanilla: { sheet: 521, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_522_blue_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#49727D', drop: null, vanilla: { sheet: 522, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_523_green_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#477874', drop: null, vanilla: { sheet: 523, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_524_orange_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#5E7167', drop: null, vanilla: { sheet: 524, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_525_red_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#576870', drop: null, vanilla: { sheet: 525, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_526_yellow_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#516D5F', drop: null, vanilla: { sheet: 526, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_527_gold_dragonfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#627C5A', drop: null, vanilla: { sheet: 527, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_532_maggot_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#59756E', drop: null, vanilla: { sheet: 532, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_533_rat_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#697476', drop: null, vanilla: { sheet: 533, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_534_krypton_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#81A05F', blend: true, drop: null, vanilla: { sheet: 534, frame: 'auto' } });
def({ key: 'v_535_krypton_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#68904E', blend: true, drop: null, vanilla: { sheet: 535, frame: 'auto' } });
def({ key: 'v_537_xenon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#41838D', blend: true, drop: null, vanilla: { sheet: 537, frame: 'auto' } });
def({ key: 'v_538_ladybug_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#555F60', drop: null, vanilla: { sheet: 538, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_540_argon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8E4B7C', blend: true, drop: null, vanilla: { sheet: 540, frame: 'auto' } });
def({ key: 'v_541_echo_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#326BC5', blend: true, drop: null, vanilla: { sheet: 541, frame: 'auto' } });
def({ key: 'v_542_owl_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6A7867', drop: null, vanilla: { sheet: 542, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_543_pupfish_bowl', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#509DB7', drop: null, vanilla: { sheet: 543, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_544_gold_ladybug_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#657D60', drop: null, vanilla: { sheet: 544, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_545_lawn_flamingo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#AE4C67', drop: null, vanilla: { sheet: 545, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_547_potted_trees', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 5, mapColor: '#505D21', drop: null, vanilla: { sheet: 547, frame: 'style', fw: 2, fh: 5 } });
def({ key: 'v_550_turtle_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#476B65', drop: null, vanilla: { sheet: 550, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_551_jungle_turtle_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#42735F', drop: null, vanilla: { sheet: 551, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_552_sandcastle_bucket', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#888042', drop: null, vanilla: { sheet: 552, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_553_grebe_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#616B64', drop: null, vanilla: { sheet: 553, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_554_seagull_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6F817B', drop: null, vanilla: { sheet: 554, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_555_water_strider_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#497B90', drop: null, vanilla: { sheet: 555, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_556_gold_water_strider_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#6A886F', drop: null, vanilla: { sheet: 556, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_558_seahorse_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#657F89', drop: null, vanilla: { sheet: 558, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_559_gold_seahorse_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#71927E', drop: null, vanilla: { sheet: 559, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_560_golf_trophies', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#907F3B', drop: null, vanilla: { sheet: 560, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_563_large_bamboo_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#737A2D', blend: true, drop: null, vanilla: { sheet: 563, frame: 'auto' } });
def({ key: 'v_566_amber_stone_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#A88A64', blend: true, drop: null, vanilla: { sheet: 566, frame: 'auto' } });
def({ key: 'v_568_pink_fairy_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7E88A0', drop: null, vanilla: { sheet: 568, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_569_green_fairy_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7798A4', drop: null, vanilla: { sheet: 569, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_570_blue_fairy_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#7594A7', drop: null, vanilla: { sheet: 570, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_572_souls_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#827995', drop: null, vanilla: { sheet: 572, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_573_tattered_wood_sign', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#5E4736', drop: null, vanilla: { sheet: 573, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_579_rock_golem_head', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#557D64', drop: null, vanilla: { sheet: 579, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_580_hell_butterfly_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#6E5D5D', drop: null, vanilla: { sheet: 580, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_581_lavafly_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#747179', drop: null, vanilla: { sheet: 581, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_582_magma_snail_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#6A6769', drop: null, vanilla: { sheet: 582, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_590_gem_saplings', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#8E714F', drop: null, vanilla: { sheet: 590, frame: 'style', fw: 3, fh: 2 } }); // fw3 = 带宽 54px（原版 frameX/54 宝石序号，:72924 树苗成长判定）
def({ key: 'v_591_hanging_pots', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#915438', drop: null, vanilla: { sheet: 591, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_595_sakura_sapling', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#935E68', drop: null, vanilla: { sheet: 595, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_599_amethyst_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7886A1', drop: null, vanilla: { sheet: 599, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_600_topaz_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7B8E85', drop: null, vanilla: { sheet: 600, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_601_sapphire_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#638B9C', drop: null, vanilla: { sheet: 601, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_602_emerald_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#628F90', drop: null, vanilla: { sheet: 602, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_603_ruby_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7B838A', drop: null, vanilla: { sheet: 603, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_604_diamond_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#73909F', drop: null, vanilla: { sheet: 604, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_605_amber_bunny_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7A8B84', drop: null, vanilla: { sheet: 605, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_606_amethyst_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#7F8CA5', drop: null, vanilla: { sheet: 606, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_607_topaz_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#839587', drop: null, vanilla: { sheet: 607, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_608_sapphire_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6B93A5', drop: null, vanilla: { sheet: 608, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_609_emerald_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6D9990', drop: null, vanilla: { sheet: 609, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_610_ruby_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#84888C', drop: null, vanilla: { sheet: 610, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_611_diamond_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#73939E', drop: null, vanilla: { sheet: 611, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_612_amber_squirrel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#838C82', drop: null, vanilla: { sheet: 612, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_615_yellow_willow_sapling', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#966C4A', drop: null, vanilla: { sheet: 615, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_617_relic_base', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 4, mapColor: '#7E6C2C', drop: null, vanilla: { sheet: 617, frame: 'style', fw: 3, fh: 4 } });
def({ key: 'v_619_truffle_worm_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#557381', drop: null, vanilla: { sheet: 619, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_620_prismatic_lacewing_jar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#485563', drop: null, vanilla: { sheet: 620, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_622_teapot', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#918D6A', drop: null, vanilla: { sheet: 622, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_623_potted_crystal_plants', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 5, mapColor: '#B2919E', drop: null, vanilla: { sheet: 623, frame: 'style', fw: 2, fh: 5 } });
def({ key: 'v_624_abigail_s_flower', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#BC5543', drop: null, vanilla: { sheet: 624, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_626_neon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#86598D', blend: true, drop: null, vanilla: { sheet: 626, frame: 'auto' } });
def({ key: 'v_627_helium_moss_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#969696', blend: true, drop: null, vanilla: { sheet: 627, frame: 'auto' } });
def({ key: 'v_628_helium_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#858585', blend: true, drop: null, vanilla: { sheet: 628, frame: 'auto' } });
def({ key: 'v_629_stinkbug_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#4C6C60', drop: null, vanilla: { sheet: 629, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_630_stinkbug_blocker', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#555E36', drop: null, vanilla: { sheet: 630, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_631_ghostly_stinkbug_blocker', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#449DB6', drop: null, vanilla: { sheet: 631, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_632_scarlet_macaw_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6D7B71', drop: null, vanilla: { sheet: 632, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_635_ash_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5F525C', blend: true, drop: null, vanilla: { sheet: 635, frame: 'auto' } });
def({ key: 'v_639_mana_crystal', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#5357A1', drop: null, vanilla: { sheet: 639, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_640_blue_macaw_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#678478', drop: null, vanilla: { sheet: 640, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_641_reef_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#CD7987', blend: true, drop: null, vanilla: { sheet: 641, frame: 'auto' } });
def({ key: 'v_643_toucan_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#767A6E', drop: null, vanilla: { sheet: 643, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_644_yellow_cockatiel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#757D67', drop: null, vanilla: { sheet: 644, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_645_gray_cockatiel_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#6A7D6E', drop: null, vanilla: { sheet: 645, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_646_shadow_candle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#54544D', drop: null, vanilla: { sheet: 646, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_647_large_rubble_3x2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#828268', drop: null, vanilla: { sheet: 647, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_648_large_rubble_3x2_group_2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#5F7A40', drop: null, vanilla: { sheet: 648, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_649_medium_rubble_2x1', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 1, mapColor: '#5C5C5C', drop: null, vanilla: { sheet: 649, frame: 'style', fw: 2, fh: 1 } });
def({ key: 'v_650_small_rubble_1x1', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#646464', drop: null, vanilla: { sheet: 650, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_651_large_rubble_3x2_group_3', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#578807', drop: null, vanilla: { sheet: 651, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_652_medium_rubble_2x2', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#4A810A', drop: null, vanilla: { sheet: 652, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_653_pots_rubblemaker', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#533830', drop: null, vanilla: { sheet: 653, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_654_tnt_barrel', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#8F6768', drop: null, vanilla: { sheet: 654, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_655_plantera_thorns', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#A85386', drop: null, vanilla: { sheet: 655, frame: 'auto' } });
def({ key: 'v_657_echo_chamber', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#3D3F4B', drop: null, vanilla: { sheet: 657, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_658_aether_monolith', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#AB8DCE', drop: null, vanilla: { sheet: 658, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_659_aetherium_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#C7C9CB', blend: true, drop: null, vanilla: { sheet: 659, frame: 'auto' } });
def({ key: 'v_660_faeling_in_a_bottle', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#783232', drop: null, vanilla: { sheet: 660, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_661_corrupt_jungle_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#42546d', blend: true, drop: null, vanilla: { sheet: 661, frame: 'auto' } });
def({ key: 'v_662_crimson_jungle_grass_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#54643f', blend: true, drop: null, vanilla: { sheet: 662, frame: 'auto' } });
def({ key: 'v_663_enchanted_moondial', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#6b4463', drop: null, vanilla: { sheet: 663, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_665_life_crystal_boulder', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#c68658', drop: null, vanilla: { sheet: 665, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_666_poo', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#bf8e6f', blend: true, drop: null, vanilla: { sheet: 666, frame: 'auto' } });
def({ key: 'v_667_aetherium_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#bf8e6f', blend: true, drop: null, vanilla: { sheet: 667, frame: 'auto' } });
def({ key: 'v_669_lunar_rust_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7f5c45', blend: true, drop: null, vanilla: { sheet: 669, frame: 'auto' } });
def({ key: 'v_670_dark_celestial_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#ff1d88', blend: true, drop: null, vanilla: { sheet: 670, frame: 'auto' } });
def({ key: 'v_671_astra_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#d3d3d3', blend: true, drop: null, vanilla: { sheet: 671, frame: 'auto' } });
def({ key: 'v_672_cosmic_ember_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3c14a0', blend: true, drop: null, vanilla: { sheet: 672, frame: 'auto' } });
def({ key: 'v_673_cryocore_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4ec1e3', blend: true, drop: null, vanilla: { sheet: 673, frame: 'auto' } });
def({ key: 'v_674_mercury_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#faf9fc', blend: true, drop: null, vanilla: { sheet: 674, frame: 'auto' } });
def({ key: 'v_675_star_royale_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#f05a5a', blend: true, drop: null, vanilla: { sheet: 675, frame: 'auto' } });
def({ key: 'v_676_heavenforge_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#62e65c', blend: true, drop: null, vanilla: { sheet: 676, frame: 'auto' } });
def({ key: 'v_677_ancient_blue_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#5fc5ee', blend: true, drop: null, vanilla: { sheet: 677, frame: 'auto' } });
def({ key: 'v_678_ancient_green_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#f1dd64', blend: true, drop: null, vanilla: { sheet: 678, frame: 'auto' } });
def({ key: 'v_679_ancient_pink_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#d55ced', blend: true, drop: null, vanilla: { sheet: 679, frame: 'auto' } });
def({ key: 'v_680_ancient_gold_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#e0dbec', blend: true, drop: null, vanilla: { sheet: 680, frame: 'auto' } });
def({ key: 'v_681_ancient_silver_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#fde3d7', blend: true, drop: null, vanilla: { sheet: 681, frame: 'auto' } });
def({ key: 'v_682_ancient_copper_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#a59f99', blend: true, drop: null, vanilla: { sheet: 682, frame: 'auto' } });
def({ key: 'v_683_ancient_obsidian_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#bf8e6f', blend: true, drop: null, vanilla: { sheet: 683, frame: 'auto' } });
def({ key: 'v_684_ancient_hellstone_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#caaea5', blend: true, drop: null, vanilla: { sheet: 684, frame: 'auto' } });
def({ key: 'v_685_ancient_cobalt_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#a0bb8e', blend: true, drop: null, vanilla: { sheet: 685, frame: 'auto' } });
def({ key: 'v_686_ancient_mythril_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#fe9e23', blend: true, drop: null, vanilla: { sheet: 686, frame: 'auto' } });
def({ key: 'v_687_lava_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#22dd97', blend: true, drop: null, vanilla: { sheet: 687, frame: 'auto' } });
def({ key: 'v_688_argon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#f9aaec', blend: true, drop: null, vanilla: { sheet: 688, frame: 'auto' } });
def({ key: 'v_689_krypton_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#23c8fe', blend: true, drop: null, vanilla: { sheet: 689, frame: 'auto' } });
def({ key: 'v_690_xenon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 690, frame: 'auto' } });
def({ key: 'v_691_neon_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3d3d3d', blend: true, drop: null, vanilla: { sheet: 691, frame: 'auto' } });
def({ key: 'v_692_helium_moss_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#050505', blend: true, drop: null, vanilla: { sheet: 692, frame: 'auto' } });
def({ key: 'v_693_mitey_titey', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#050505', drop: null, vanilla: { sheet: 693, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_694_stalactite_1x2_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#32323c', drop: null, vanilla: { sheet: 694, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_695_replica_demon_altar', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#bf8e6f', drop: null, vanilla: { sheet: 695, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_696_replica_shadow_orb', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#bb444a', drop: null, vanilla: { sheet: 696, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_697_decorative_cobweb', name: '', decor: true, opacity: 0, pick: 0, mapColor: '#318672', drop: null, vanilla: { sheet: 697, frame: 'auto' } });
def({ key: 'v_698_item_flask', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 2, mapColor: '#7e8631', drop: null, vanilla: { sheet: 698, frame: 'style', fw: 1, fh: 2 } });
def({ key: 'v_699_alchemy_flask', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 4, h: 4, mapColor: '#863b31', drop: null, vanilla: { sheet: 699, frame: 'style', fw: 4, fh: 4 } });
def({ key: 'v_700_abigails_flower_replica', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#2b568c', drop: null, vanilla: { sheet: 700, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_701_glow_tulip_replica', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#793186', drop: null, vanilla: { sheet: 701, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_702_life_fruit_replica', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 2, mapColor: '#fe7902', drop: null, vanilla: { sheet: 702, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_703_jungle_plants_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#1ac454', drop: null, vanilla: { sheet: 703, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_704_fallen_log_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#30d0ea', drop: null, vanilla: { sheet: 704, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_705_oasis_plants_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#87c41a', drop: null, vanilla: { sheet: 705, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_706_terragrim_shrine_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 2, mapColor: '#1cd86d', drop: null, vanilla: { sheet: 706, frame: 'style', fw: 3, fh: 2 } });
def({ key: 'v_707_books_echo', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#6bb600', drop: null, vanilla: { sheet: 707, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_708_shimmerfall_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#4bb8e6', blend: true, drop: null, vanilla: { sheet: 708, frame: 'auto' } });
def({ key: 'v_709_magic_shimmer_dropper', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#d05050', drop: null, vanilla: { sheet: 709, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_710_pufferfish_cage', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 6, h: 3, mapColor: '#8d89df', drop: null, vanilla: { sheet: 710, frame: 'style', fw: 6, fh: 3 } });
def({ key: 'v_712_poo_boulder', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 2, h: 2, mapColor: '#e0dbec', drop: null, vanilla: { sheet: 712, frame: 'style', fw: 2, fh: 2 } });
def({ key: 'v_717_lava_cloud', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 717, frame: 'auto' } });
def({ key: 'v_718_star_cloud', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 718, frame: 'auto' } });
def({ key: 'v_719_rainbow_cloud', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 719, frame: 'auto' } });
def({ key: 'v_720_crt_monolith', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#b6af82', drop: null, vanilla: { sheet: 720, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_721_retro_monolith', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#639608', drop: null, vanilla: { sheet: 721, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_722_fallen_star_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#8b9a40', blend: true, drop: null, vanilla: { sheet: 722, frame: 'auto' } });
def({ key: 'v_723_kite_anchor', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#2281a8', drop: null, vanilla: { sheet: 723, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_724_critter_anchor', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 1, h: 1, mapColor: '#b45252', drop: null, vanilla: { sheet: 724, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_725_film_projector', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 2, h: 3, mapColor: '#716ccd', drop: null, vanilla: { sheet: 725, frame: 'style', fw: 2, fh: 3 } });
def({ key: 'v_726_cannonball', name: '', solid: true, framed: true, opacity: 1, pick: 0, w: 1, h: 1, mapColor: '#6bb600', drop: null, vanilla: { sheet: 726, frame: 'style', fw: 1, fh: 1 } });
def({ key: 'v_727_dull_red_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#179ad1', blend: true, drop: null, vanilla: { sheet: 727, frame: 'auto' } });
def({ key: 'v_728_dull_green_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#ee615e', blend: true, drop: null, vanilla: { sheet: 728, frame: 'auto' } });
def({ key: 'v_729_dull_blue_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#716ccd', blend: true, drop: null, vanilla: { sheet: 729, frame: 'auto' } });
def({ key: 'v_730_dull_yellow_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#909490', blend: true, drop: null, vanilla: { sheet: 730, frame: 'auto' } });
def({ key: 'v_731_dull_pink_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 731, frame: 'auto' } });
def({ key: 'v_732_dull_white_team_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 732, frame: 'auto' } });
def({ key: 'v_733_radio_thing', name: '', solid: false, framed: true, opacity: 0.05, pick: 0, w: 3, h: 3, mapColor: '#72fe02', drop: null, vanilla: { sheet: 733, frame: 'style', fw: 3, fh: 3 } });
def({ key: 'v_734_feywood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#72fe02', blend: true, drop: null, vanilla: { sheet: 734, frame: 'auto' } });
def({ key: 'v_735_hallowed_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#00c5d0', blend: true, drop: null, vanilla: { sheet: 735, frame: 'auto' } });
def({ key: 'v_736_easter_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#00c5d0', blend: true, drop: null, vanilla: { sheet: 736, frame: 'auto' } });
def({ key: 'v_737_gothic_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 737, frame: 'auto' } });
def({ key: 'v_738_flinx_fur_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#d0007e', blend: true, drop: null, vanilla: { sheet: 738, frame: 'auto' } });
def({ key: 'v_739_jellyfish_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#d0007e', blend: true, drop: null, vanilla: { sheet: 739, frame: 'auto' } });
def({ key: 'v_740_toybreaker_brick', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 740, frame: 'auto' } });
def({ key: 'v_741_pine_wood', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 741, frame: 'auto' } });
def({ key: 'v_742_harpy_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 742, frame: 'auto' } });
def({ key: 'v_743_moonplate_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#ff7e91', blend: true, drop: null, vanilla: { sheet: 743, frame: 'auto' } });
def({ key: 'v_744_librarian_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#3c3c3c', blend: true, drop: null, vanilla: { sheet: 744, frame: 'auto' } });
def({ key: 'v_745_spike_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#786e64', blend: true, drop: null, vanilla: { sheet: 745, frame: 'auto' } });
def({ key: 'v_746_office_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#786e64', blend: true, drop: null, vanilla: { sheet: 746, frame: 'auto' } });
def({ key: 'v_747_forbidden_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#fa6432', blend: true, drop: null, vanilla: { sheet: 747, frame: 'auto' } });
def({ key: 'v_748_aquarium_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#365314', blend: true, drop: null, vanilla: { sheet: 748, frame: 'auto' } });
def({ key: 'v_749_boulder_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 749, frame: 'auto' } });
def({ key: 'v_750_sharp_spike_block', name: '', solid: true, opacity: 1, pick: 0, mapColor: '#7ad9e8', blend: true, drop: null, vanilla: { sheet: 750, frame: 'auto' } });
TILE_DEFS.forEach((d, i) => (TILE_BY_KEY[d.key] = i));

// ===================== 存档稳定 id(根治 TILE_DEFS 数组下标漂移;存档 v3 起生效) =====================
// 磁盘存"稳定 id":原版 tile 真身 = vanilla sheet id(1-752);下列自造/借用/变体 def = 私有段 1000+。
// 运行时仍用数组下标——SaveFile 保存/加载两个收口点经此双表映射,TILE_DEFS 顺序从此自由。
// ★ PRIV_TILE_STABLE 冻结表 append-only:新条目只许表尾追加,已分配号码永不复用/改派。
const PRIV_TILE_STABLE: Record<string, number> = {
  empty: 1000, leaves: 1001, table: 1002, chair: 1003, bed: 1004, bookcase: 1005,
  grandfather_clock: 1006, piano: 1007, dresser: 1008, bench: 1009, bathtub: 1010,
  keg: 1011, cooking_pot: 1012, clay_pot: 1013, tombstone_v: 1014, crystal_heart: 1015,
  candle: 1016, chandelier: 1017, lantern: 1018, candelabra: 1019, chinese_lantern: 1020,
  skull_lantern: 1021, water_candle: 1022,
  mushroom: 1023, flower: 1024, tallgrass: 1025,  // 自造装饰(真身 v_3_forest_short_plants 独占 sheet 3)
  tree: 1026,                                      // 自有树(真身 v_5_trees 独占 sheet 5)
  'v_389_tall_gate_open': 1027,                    // 开门态变体(真身 v_389_tallgateopen 独占 389)
  dirt: 1028,                                      // sheet=0 让位存档 air 哨兵
};
/** internal id → 稳定 id(保存方向;serialize 内联查表) */
export const TILE_STABLE_OF_INTERNAL = new Uint16Array(TILE_DEFS.length);
/** 稳定 id → internal id(加载方向;0=air 未映射) */
export const TILE_INTERNAL_OF_STABLE = new Uint16Array(2048);
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  const s = PRIV_TILE_STABLE[d.key] ?? d.vanilla?.sheet;
  if (s === undefined || s === 0) { console.error(`[stable-id] tile 缺稳定 id: ${d.key}`); continue; }
  if (TILE_INTERNAL_OF_STABLE[s] !== 0) {
    console.error(`[stable-id] 稳定 id 冲突 ${s}: ${TILE_DEFS[TILE_INTERNAL_OF_STABLE[s]].key} / ${d.key}`);
    continue;
  }
  TILE_STABLE_OF_INTERNAL[i] = s;
  TILE_INTERNAL_OF_STABLE[s] = i;
}

// ===================== 墙注册表（TEdit walls.json 全量生成） =====================
wallDef({ id: 0, key: 'w0_none', name: '', mapColor: '#000000', opacity: 0 });
wallDef({ id: 1, key: 'w1_stone', name: '', mapColor: '#353535', opacity: 1 });
wallDef({ id: 2, key: 'w2_dirtunsafe', name: '', mapColor: '#573C30', opacity: 1 });
wallDef({ id: 3, key: 'w3_ebonstoneunsafe', name: '', mapColor: '#2F2935', opacity: 1 });
wallDef({ id: 4, key: 'w4_wood', name: '', mapColor: '#453225', opacity: 1 });
wallDef({ id: 5, key: 'w5_graybrick', name: '', mapColor: '#3B3B3B', opacity: 1 });
wallDef({ id: 6, key: 'w6_redbrick', name: '', mapColor: '#4C2C29', opacity: 1 });
wallDef({ id: 7, key: 'w7_bluedungeonunsafe', name: '', mapColor: '#2E3243', opacity: 1 });
wallDef({ id: 8, key: 'w8_greendungeonunsafe', name: '', mapColor: '#313D3D', opacity: 1 });
wallDef({ id: 9, key: 'w9_pinkdungeonunsafe', name: '', mapColor: '#4B2E46', opacity: 1 });
wallDef({ id: 10, key: 'w10_goldbrick', name: '', mapColor: '#6B5B22', opacity: 1 });
wallDef({ id: 11, key: 'w11_silverbrick', name: '', mapColor: '#4F5556', opacity: 1 });
wallDef({ id: 12, key: 'w12_copperbrick', name: '', mapColor: '#653919', opacity: 1 });
wallDef({ id: 13, key: 'w13_hellstonebrickunsafe', name: '', mapColor: '#4D302B', opacity: 1 });
wallDef({ id: 14, key: 'w14_obsidianbrickunsafe', name: '', mapColor: '#0C0C0C', opacity: 1 });
wallDef({ id: 15, key: 'w15_mudunsafe', name: '', mapColor: '#312B2C', opacity: 1 });
wallDef({ id: 16, key: 'w16_dirt', name: '', mapColor: '#513F36', opacity: 1 });
wallDef({ id: 17, key: 'w17_bluedungeon', name: '', mapColor: '#2E3243', opacity: 1 });
wallDef({ id: 18, key: 'w18_greendungeon', name: '', mapColor: '#313D3D', opacity: 1 });
wallDef({ id: 19, key: 'w19_pinkdungeon', name: '', mapColor: '#4B2E46', opacity: 1 });
wallDef({ id: 20, key: 'w20_obsidianbrick', name: '', mapColor: '#0C0C0C', opacity: 1 });
wallDef({ id: 21, key: 'w21_glass', name: '', mapColor: '#365962', opacity: 1 });
wallDef({ id: 22, key: 'w22_pearlstonebrick', name: '', mapColor: '#615C5E', opacity: 1 });
wallDef({ id: 23, key: 'w23_iridescentbrick', name: '', mapColor: '#382C3A', opacity: 1 });
wallDef({ id: 24, key: 'w24_mudstonebrick', name: '', mapColor: '#31282A', opacity: 1 });
wallDef({ id: 25, key: 'w25_cobaltbrick', name: '', mapColor: '#124262', opacity: 1 });
wallDef({ id: 26, key: 'w26_mythrilbrick', name: '', mapColor: '#224036', opacity: 1 });
wallDef({ id: 27, key: 'w27_planked', name: '', mapColor: '#3A302A', opacity: 1 });
wallDef({ id: 28, key: 'w28_pearlstonebrickunsafe', name: '', mapColor: '#4D4651', opacity: 1 });
wallDef({ id: 29, key: 'w29_candycane', name: '', mapColor: '#703A44', opacity: 1 });
wallDef({ id: 30, key: 'w30_greencandycane', name: '', mapColor: '#387350', opacity: 1 });
wallDef({ id: 31, key: 'w31_snowbrick', name: '', mapColor: '#5E656C', opacity: 1 });
wallDef({ id: 32, key: 'w32_adamantitebeam', name: '', mapColor: '#661430', opacity: 1 });
wallDef({ id: 33, key: 'w33_demonitebrick', name: '', mapColor: '#303049', opacity: 1 });
wallDef({ id: 34, key: 'w34_sandstonebrick', name: '', mapColor: '#565339', opacity: 1 });
wallDef({ id: 35, key: 'w35_ebonstonebrick', name: '', mapColor: '#363B52', opacity: 1 });
wallDef({ id: 36, key: 'w36_redstucco', name: '', mapColor: '#7C463F', opacity: 1 });
wallDef({ id: 37, key: 'w37_yellowstucco', name: '', mapColor: '#595437', opacity: 1 });
wallDef({ id: 38, key: 'w38_greenstucco', name: '', mapColor: '#3C5A46', opacity: 1 });
wallDef({ id: 39, key: 'w39_gray', name: '', mapColor: '#595954', opacity: 1 });
wallDef({ id: 40, key: 'w40_snowwallunsafe', name: '', mapColor: '#647681', opacity: 1 });
wallDef({ id: 41, key: 'w41_ebonwood', name: '', mapColor: '#393740', opacity: 1 });
wallDef({ id: 42, key: 'w42_richmaogany', name: '', mapColor: '#3E191B', opacity: 1 });
wallDef({ id: 43, key: 'w43_pearlwood', name: '', mapColor: '#3C372C', opacity: 1 });
wallDef({ id: 44, key: 'w44_rainbowbrick', name: '', mapColor: '#333333', opacity: 1 });
wallDef({ id: 45, key: 'w45_tinbrick', name: '', mapColor: '#413F39', opacity: 1 });
wallDef({ id: 46, key: 'w46_tungstenbrick', name: '', mapColor: '#445345', opacity: 1 });
wallDef({ id: 47, key: 'w47_platinumbrick', name: '', mapColor: '#424652', opacity: 1 });
wallDef({ id: 48, key: 'w48_amethystunsafe', name: '', mapColor: '#4E4553', opacity: 1 });
wallDef({ id: 49, key: 'w49_topazunsafe', name: '', mapColor: '#514A3F', opacity: 1 });
wallDef({ id: 50, key: 'w50_sapphireunsafe', name: '', mapColor: '#384251', opacity: 1 });
wallDef({ id: 51, key: 'w51_emeraldunsafe', name: '', mapColor: '#32493B', opacity: 1 });
wallDef({ id: 52, key: 'w52_rubyunsafe', name: '', mapColor: '#523B40', opacity: 1 });
wallDef({ id: 53, key: 'w53_diamondunsafe', name: '', mapColor: '#464F51', opacity: 1 });
wallDef({ id: 54, key: 'w54_caveunsafe', name: '', mapColor: '#2E3A36', opacity: 1 });
wallDef({ id: 55, key: 'w55_cave2unsafe', name: '', mapColor: '#38382E', opacity: 1 });
wallDef({ id: 56, key: 'w56_cave3unsafe', name: '', mapColor: '#393131', opacity: 1 });
wallDef({ id: 57, key: 'w57_cave4unsafe', name: '', mapColor: '#2D3338', opacity: 1 });
wallDef({ id: 58, key: 'w58_cave5unsafe', name: '', mapColor: '#38303B', opacity: 1 });
wallDef({ id: 59, key: 'w59_cave6unsafe', name: '', mapColor: '#503F37', opacity: 1 });
wallDef({ id: 60, key: 'w60_livingleaf', name: '', mapColor: '#003111', opacity: 1 });
wallDef({ id: 61, key: 'w61_cave7unsafe', name: '', mapColor: '#37281C', opacity: 1 });
wallDef({ id: 62, key: 'w62_spiderunsafe', name: '', mapColor: '#201C16', opacity: 1 });
wallDef({ id: 63, key: 'w63_grassunsafe', name: '', mapColor: '#194326', opacity: 1 });
wallDef({ id: 64, key: 'w64_jungleunsafe', name: '', mapColor: '#2F4319', opacity: 1 });
wallDef({ id: 65, key: 'w65_flowerunsafe', name: '', mapColor: '#194326', opacity: 1 });
wallDef({ id: 66, key: 'w66_grass', name: '', mapColor: '#194326', opacity: 1 });
wallDef({ id: 67, key: 'w67_jungle', name: '', mapColor: '#2F4319', opacity: 1 });
wallDef({ id: 68, key: 'w68_flower', name: '', mapColor: '#194326', opacity: 1 });
wallDef({ id: 69, key: 'w69_corruptgrassunsafe', name: '', mapColor: '#242539', opacity: 1 });
wallDef({ id: 70, key: 'w70_hallowedgrassunsafe', name: '', mapColor: '#193D43', opacity: 1 });
wallDef({ id: 71, key: 'w71_iceunsafe', name: '', mapColor: '#526C86', opacity: 1 });
wallDef({ id: 72, key: 'w72_cactus', name: '', mapColor: '#2D5418', opacity: 1 });
wallDef({ id: 73, key: 'w73_cloud', name: '', mapColor: '#D3D9DB', opacity: 1 });
wallDef({ id: 74, key: 'w74_mushroom', name: '', mapColor: '#363C71', opacity: 1 });
wallDef({ id: 75, key: 'w75_bone', name: '', mapColor: '#3D3D2C', opacity: 1 });
wallDef({ id: 76, key: 'w76_slime', name: '', mapColor: '#1A336F', opacity: 1 });
wallDef({ id: 77, key: 'w77_flesh', name: '', mapColor: '#4B1216', opacity: 1 });
wallDef({ id: 78, key: 'w78_livingwood', name: '', mapColor: '#3A2318', opacity: 1 });
wallDef({ id: 79, key: 'w79_obsidianbackunsafe', name: '', mapColor: '#242141', opacity: 1 });
wallDef({ id: 80, key: 'w80_mushroomunsafe', name: '', mapColor: '#363C71', opacity: 1 });
wallDef({ id: 81, key: 'w81_crimsongrassunsafe', name: '', mapColor: '#653434', opacity: 1 });
wallDef({ id: 82, key: 'w82_discwall', name: '', mapColor: '#381300', opacity: 1 });
wallDef({ id: 83, key: 'w83_crimstoneunsafe', name: '', mapColor: '#3E2C2D', opacity: 1 });
wallDef({ id: 84, key: 'w84_icebrick', name: '', mapColor: '#4E6983', opacity: 1 });
wallDef({ id: 85, key: 'w85_shadewood', name: '', mapColor: '#20272D', opacity: 1 });
wallDef({ id: 86, key: 'w86_hiveunsafe', name: '', mapColor: '#795024', opacity: 1 });
wallDef({ id: 87, key: 'w87_lihzahrdbrickunsafe', name: '', mapColor: '#1C080A', opacity: 1 });
wallDef({ id: 88, key: 'w88_purplestainedglass', name: '', mapColor: '#73447C', opacity: 1 });
wallDef({ id: 89, key: 'w89_yellowstainedglass', name: '', mapColor: '#81724A', opacity: 1 });
wallDef({ id: 90, key: 'w90_bluestainedglass', name: '', mapColor: '#3E567B', opacity: 1 });
wallDef({ id: 91, key: 'w91_greenstainedglass', name: '', mapColor: '#5A795E', opacity: 1 });
wallDef({ id: 92, key: 'w92_redstainedglass', name: '', mapColor: '#873E3D', opacity: 1 });
wallDef({ id: 93, key: 'w93_rainbowstainedglass', name: '', mapColor: '#646067', opacity: 1 });
wallDef({ id: 94, key: 'w94_bluedungeonslabunsafe', name: '', mapColor: '#243039', opacity: 1 });
wallDef({ id: 95, key: 'w95_bluedungeontileunsafe', name: '', mapColor: '#302E3A', opacity: 1 });
wallDef({ id: 96, key: 'w96_pinkdungeonslabunsafe', name: '', mapColor: '#472E49', opacity: 1 });
wallDef({ id: 97, key: 'w97_pinkdungeontileunsafe', name: '', mapColor: '#4C2E40', opacity: 1 });
wallDef({ id: 98, key: 'w98_greendungeonslabunsafe', name: '', mapColor: '#333F39', opacity: 1 });
wallDef({ id: 99, key: 'w99_greendungeontileunsafe', name: '', mapColor: '#313A40', opacity: 1 });
wallDef({ id: 100, key: 'w100_bluedungeonslab', name: '', mapColor: '#243039', opacity: 1 });
wallDef({ id: 101, key: 'w101_bluedungeontile', name: '', mapColor: '#302E3A', opacity: 1 });
wallDef({ id: 102, key: 'w102_pinkdungeonslab', name: '', mapColor: '#472E49', opacity: 1 });
wallDef({ id: 103, key: 'w103_pinkdungeontile', name: '', mapColor: '#4C2E40', opacity: 1 });
wallDef({ id: 104, key: 'w104_greendungeonslab', name: '', mapColor: '#333F39', opacity: 1 });
wallDef({ id: 105, key: 'w105_greendungeontile', name: '', mapColor: '#313A40', opacity: 1 });
wallDef({ id: 106, key: 'w106_woodenfence', name: '', mapColor: '#614833', opacity: 1 });
wallDef({ id: 107, key: 'w107_metalfence', name: '', mapColor: '#353535', opacity: 1 });
wallDef({ id: 108, key: 'w108_hive', name: '', mapColor: '#795024', opacity: 1 });
wallDef({ id: 109, key: 'w109_palladiumcolumn', name: '', mapColor: '#6E2513', opacity: 1 });
wallDef({ id: 110, key: 'w110_bubblegumblock', name: '', mapColor: '#873989', opacity: 1 });
wallDef({ id: 111, key: 'w111_titanstoneblock', name: '', mapColor: '#211915', opacity: 1 });
wallDef({ id: 112, key: 'w112_lihzahrdbrick', name: '', mapColor: '#1C080A', opacity: 1 });
wallDef({ id: 113, key: 'w113_pumpkin', name: '', mapColor: '#A04B07', opacity: 1 });
wallDef({ id: 114, key: 'w114_hay', name: '', mapColor: '#362A13', opacity: 1 });
wallDef({ id: 115, key: 'w115_spookywood', name: '', mapColor: '#2A1E35', opacity: 1 });
wallDef({ id: 116, key: 'w116_christmastreewallpaper', name: '', mapColor: '#3C2219', opacity: 1 });
wallDef({ id: 117, key: 'w117_ornamentwallpaper', name: '', mapColor: '#5B5340', opacity: 1 });
wallDef({ id: 118, key: 'w118_candycanewallpaper', name: '', mapColor: '#3B3D36', opacity: 1 });
wallDef({ id: 119, key: 'w119_festivewallpaper', name: '', mapColor: '#2F2719', opacity: 1 });
wallDef({ id: 120, key: 'w120_starswallpaper', name: '', mapColor: '#50586F', opacity: 1 });
wallDef({ id: 121, key: 'w121_squiggleswallpaper', name: '', mapColor: '#BAA78A', opacity: 1 });
wallDef({ id: 122, key: 'w122_snowflakewallpaper', name: '', mapColor: '#6E778F', opacity: 1 });
wallDef({ id: 123, key: 'w123_krampushornwallpaper', name: '', mapColor: '#8A806E', opacity: 1 });
wallDef({ id: 124, key: 'w124_bluegreenwallpaper', name: '', mapColor: '#07301E', opacity: 1 });
wallDef({ id: 125, key: 'w125_grinchfingerwallpaper', name: '', mapColor: '#4E6746', opacity: 1 });
wallDef({ id: 126, key: 'w126_fancygraywallpaper', name: '', mapColor: '#6D6F7B', opacity: 1 });
wallDef({ id: 127, key: 'w127_icefloewallpaper', name: '', mapColor: '#70A6E2', opacity: 1 });
wallDef({ id: 128, key: 'w128_musicwallpaper', name: '', mapColor: '#45388C', opacity: 1 });
wallDef({ id: 129, key: 'w129_purplerainwallpaper', name: '', mapColor: '#482C91', opacity: 1 });
wallDef({ id: 130, key: 'w130_rainbowwallpaper', name: '', mapColor: '#725579', opacity: 1 });
wallDef({ id: 131, key: 'w131_sparklestonewallpaper', name: '', mapColor: '#68779E', opacity: 1 });
wallDef({ id: 132, key: 'w132_starlitheavenwallpaper', name: '', mapColor: '#4A4A4A', opacity: 1 });
wallDef({ id: 133, key: 'w133_bubblewallpaper', name: '', mapColor: '#5F77BF', opacity: 1 });
wallDef({ id: 134, key: 'w134_copperpipewallpaper', name: '', mapColor: '#904F16', opacity: 1 });
wallDef({ id: 135, key: 'w135_duckywallpaper', name: '', mapColor: '#3E828A', opacity: 1 });
wallDef({ id: 136, key: 'w136_waterfall', name: '', mapColor: '#3D62A9', opacity: 1 });
wallDef({ id: 137, key: 'w137_lavafall', name: '', mapColor: '#B7540E', opacity: 1 });
wallDef({ id: 138, key: 'w138_ebonwoodfence', name: '', mapColor: '#3D3945', opacity: 1 });
wallDef({ id: 139, key: 'w139_richmahoganyfence', name: '', mapColor: '#4A2022', opacity: 1 });
wallDef({ id: 140, key: 'w140_pearlwoodfence', name: '', mapColor: '#6E644C', opacity: 1 });
wallDef({ id: 141, key: 'w141_shadewoodfence', name: '', mapColor: '#42463C', opacity: 1 });
wallDef({ id: 142, key: 'w142_whitedynasty', name: '', mapColor: '#D6CEBB', opacity: 1 });
wallDef({ id: 143, key: 'w143_bluedynasty', name: '', mapColor: '#536A63', opacity: 1 });
wallDef({ id: 144, key: 'w144_arcanerunes', name: '', mapColor: '#594344', opacity: 1 });
wallDef({ id: 145, key: 'w145_ironfence', name: '', mapColor: '#787878', opacity: 1 });
wallDef({ id: 146, key: 'w146_copperplating', name: '', mapColor: '#673718', opacity: 1, largeFrame: 1 });
wallDef({ id: 147, key: 'w147_stoneslab', name: '', mapColor: '#4D4D4D', opacity: 1, largeFrame: 1 });
wallDef({ id: 148, key: 'w148_sail', name: '', mapColor: '#E5DAA1', opacity: 1 });
wallDef({ id: 149, key: 'w149_borealwood', name: '', mapColor: '#524641', opacity: 1 });
wallDef({ id: 150, key: 'w150_borealwoodfence', name: '', mapColor: '#51453E', opacity: 1 });
wallDef({ id: 151, key: 'w151_palmwood', name: '', mapColor: '#674C24', opacity: 1 });
wallDef({ id: 152, key: 'w152_palmwoodfence', name: '', mapColor: '#674C24', opacity: 1 });
wallDef({ id: 153, key: 'w153_ambergemspark', name: '', mapColor: '#FF743F', opacity: 1 });
wallDef({ id: 154, key: 'w154_amethystgemspark', name: '', mapColor: '#BF3FFF', opacity: 1 });
wallDef({ id: 155, key: 'w155_diamondgemspark', name: '', mapColor: '#DBDBE8', opacity: 1 });
wallDef({ id: 156, key: 'w156_emeraldgemspark', name: '', mapColor: '#3FFF47', opacity: 1 });
wallDef({ id: 157, key: 'w157_ambergemsparkoff', name: '', mapColor: '#763F25', opacity: 1 });
wallDef({ id: 158, key: 'w158_amethystgemsparkoff', name: '', mapColor: '#512576', opacity: 1 });
wallDef({ id: 159, key: 'w159_diamondgemsparkoff', name: '', mapColor: '#404359', opacity: 1 });
wallDef({ id: 160, key: 'w160_emeraldgemsparkoff', name: '', mapColor: '#257634', opacity: 1 });
wallDef({ id: 161, key: 'w161_rubygemsparkoff', name: '', mapColor: '#76253A', opacity: 1 });
wallDef({ id: 162, key: 'w162_sapphiregemsparkoff', name: '', mapColor: '#252576', opacity: 1 });
wallDef({ id: 163, key: 'w163_topazgemsparkoff', name: '', mapColor: '#767125', opacity: 1 });
wallDef({ id: 164, key: 'w164_rubygemspark', name: '', mapColor: '#FF3F3F', opacity: 1 });
wallDef({ id: 165, key: 'w165_sapphiregemspark', name: '', mapColor: '#3F51FF', opacity: 1 });
wallDef({ id: 166, key: 'w166_topazgemspark', name: '', mapColor: '#EFFF3F', opacity: 1 });
wallDef({ id: 167, key: 'w167_tinplating', name: '', mapColor: '#4E4D3A', opacity: 1, largeFrame: 1 });
wallDef({ id: 168, key: 'w168_confetti', name: '', mapColor: '#546154', opacity: 1 });
wallDef({ id: 169, key: 'w169_confettiblack', name: '', mapColor: '#5C695A', opacity: 1 });
wallDef({ id: 170, key: 'w170_cavewall', name: '', mapColor: '#5D442F', opacity: 1 });
wallDef({ id: 171, key: 'w171_cavewall2', name: '', mapColor: '#543C27', opacity: 1 });
wallDef({ id: 172, key: 'w172_honeyfall', name: '', mapColor: '#A87D00', opacity: 1 });
wallDef({ id: 173, key: 'w173_chlorophytebrick', name: '', mapColor: '#316919', opacity: 1 });
wallDef({ id: 174, key: 'w174_crimtanebrick', name: '', mapColor: '#453036', opacity: 1 });
wallDef({ id: 175, key: 'w175_shroomiteplating', name: '', mapColor: '#2132BC', opacity: 1 });
wallDef({ id: 176, key: 'w176_martianconduit', name: '', mapColor: '#4B8094', opacity: 1 });
wallDef({ id: 177, key: 'w177_hellstonebrick', name: '', mapColor: '#48322E', opacity: 1 });
wallDef({ id: 178, key: 'w178_marbleunsafe', name: '', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 179, key: 'w179_marbleblock', name: '', mapColor: '#7C8394', opacity: 1, largeFrame: 1 });
wallDef({ id: 180, key: 'w180_graniteunsafe', name: '', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 181, key: 'w181_graniteblock', name: '', mapColor: '#1F1F4A', opacity: 1 });
wallDef({ id: 182, key: 'w182_meteoritebrick', name: '', mapColor: '#393763', opacity: 1 });
wallDef({ id: 183, key: 'w183_marble', name: '', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 184, key: 'w184_granite', name: '', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 185, key: 'w185_cave8unsafe', name: '', mapColor: '#3D3D3D', opacity: 1, largeFrame: 2 });
wallDef({ id: 186, key: 'w186_crystal', name: '', mapColor: '#371764', opacity: 1 });
wallDef({ id: 187, key: 'w187_sandstone', name: '', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 188, key: 'w188_corruptionunsafe1', name: '', mapColor: '#3F2F3F', opacity: 1 });
wallDef({ id: 189, key: 'w189_corruptionunsafe2', name: '', mapColor: '#41334D', opacity: 1 });
wallDef({ id: 190, key: 'w190_corruptionunsafe3', name: '', mapColor: '#43483B', opacity: 1 });
wallDef({ id: 191, key: 'w191_corruptionunsafe4', name: '', mapColor: '#3C2643', opacity: 1 });
wallDef({ id: 192, key: 'w192_crimsonunsafe1', name: '', mapColor: '#7B382F', opacity: 1 });
wallDef({ id: 193, key: 'w193_crimsonunsafe2', name: '', mapColor: '#57181A', opacity: 1 });
wallDef({ id: 194, key: 'w194_crimsonunsafe3', name: '', mapColor: '#664035', opacity: 1 });
wallDef({ id: 195, key: 'w195_crimsonunsafe4', name: '', mapColor: '#7A2E36', opacity: 1 });
wallDef({ id: 196, key: 'w196_dirtunsafe1', name: '', mapColor: '#634637', opacity: 1 });
wallDef({ id: 197, key: 'w197_dirtunsafe2', name: '', mapColor: '#664939', opacity: 1 });
wallDef({ id: 198, key: 'w198_dirtunsafe3', name: '', mapColor: '#5C4131', opacity: 1 });
wallDef({ id: 199, key: 'w199_dirtunsafe4', name: '', mapColor: '#6A4B3A', opacity: 1 });
wallDef({ id: 200, key: 'w200_hallowunsafe1', name: '', mapColor: '#512153', opacity: 1 });
wallDef({ id: 201, key: 'w201_hallowunsafe2', name: '', mapColor: '#604F63', opacity: 1 });
wallDef({ id: 202, key: 'w202_hallowunsafe3', name: '', mapColor: '#7C2A68', opacity: 1 });
wallDef({ id: 203, key: 'w203_hallowunsafe4', name: '', mapColor: '#6F3670', opacity: 1 });
wallDef({ id: 204, key: 'w204_jungleunsafe1', name: '', mapColor: '#4B4437', opacity: 1 });
wallDef({ id: 205, key: 'w205_jungleunsafe2', name: '', mapColor: '#53533B', opacity: 1 });
wallDef({ id: 206, key: 'w206_jungleunsafe3', name: '', mapColor: '#27432C', opacity: 1 });
wallDef({ id: 207, key: 'w207_jungleunsafe4', name: '', mapColor: '#4D4D37', opacity: 1 });
wallDef({ id: 208, key: 'w208_lavaunsafe1', name: '', mapColor: '#5C241C', opacity: 1 });
wallDef({ id: 209, key: 'w209_lavaunsafe2', name: '', mapColor: '#603027', opacity: 1 });
wallDef({ id: 210, key: 'w210_lavaunsafe3', name: '', mapColor: '#6C2C1A', opacity: 1 });
wallDef({ id: 211, key: 'w211_lavaunsafe4', name: '', mapColor: '#6A2A26', opacity: 1 });
wallDef({ id: 212, key: 'w212_rocksunsafe1', name: '', mapColor: '#46453D', opacity: 1 });
wallDef({ id: 213, key: 'w213_rocksunsafe2', name: '', mapColor: '#393C39', opacity: 1 });
wallDef({ id: 214, key: 'w214_rocksunsafe3', name: '', mapColor: '#45393B', opacity: 1 });
wallDef({ id: 215, key: 'w215_rocksunsafe4', name: '', mapColor: '#473C42', opacity: 1 });
wallDef({ id: 216, key: 'w216_hardenedsand', name: '', mapColor: '#945D34', opacity: 1 });
wallDef({ id: 217, key: 'w217_corrupthardenedsand', name: '', mapColor: '#332641', opacity: 1 });
wallDef({ id: 218, key: 'w218_crimsonhardenedsand', name: '', mapColor: '#2B1816', opacity: 1 });
wallDef({ id: 219, key: 'w219_hallowhardenedsand', name: '', mapColor: '#4E4972', opacity: 1 });
wallDef({ id: 220, key: 'w220_corruptsandstone', name: '', mapColor: '#362444', opacity: 1 });
wallDef({ id: 221, key: 'w221_crimsonsandstone', name: '', mapColor: '#49120C', opacity: 1 });
wallDef({ id: 222, key: 'w222_hallowsandstone', name: '', mapColor: '#3A2F51', opacity: 1 });
wallDef({ id: 223, key: 'w223_desertfossil', name: '', mapColor: '#734122', opacity: 1 });
wallDef({ id: 224, key: 'w224_lunarbrickwall', name: '', mapColor: '#677068', opacity: 1, largeFrame: 2 });
wallDef({ id: 225, key: 'w225_cogwall', name: '', mapColor: '#4C4738', opacity: 1 });
wallDef({ id: 226, key: 'w226_sandfall', name: '', mapColor: '#857C42', opacity: 1 });
wallDef({ id: 227, key: 'w227_snowfall', name: '', mapColor: '#536570', opacity: 1 });
wallDef({ id: 228, key: 'w228_sillyballoonpinkwall', name: '', mapColor: '#8B0040', opacity: 1 });
wallDef({ id: 229, key: 'w229_sillyballoonpurplewall', name: '', mapColor: '#500CA2', opacity: 1 });
wallDef({ id: 230, key: 'w230_sillyballoongreenwall', name: '', mapColor: '#005D51', opacity: 1 });
wallDef({ id: 231, key: 'w231_ironbrick', name: '', mapColor: '#51443E', opacity: 1 });
wallDef({ id: 232, key: 'w232_leadbrick', name: '', mapColor: '#252F39', opacity: 1 });
wallDef({ id: 233, key: 'w233_lesionblock', name: '', mapColor: '#483537', opacity: 1 });
wallDef({ id: 234, key: 'w234_crimstonebrick', name: '', mapColor: '#672E30', opacity: 1 });
wallDef({ id: 235, key: 'w235_smoothsandstone', name: '', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 236, key: 'w236_spider', name: '', mapColor: '#3F2322', opacity: 1 });
wallDef({ id: 237, key: 'w237_solarbrick', name: '', mapColor: '#392221', opacity: 1 });
wallDef({ id: 238, key: 'w238_vortexbrick', name: '', mapColor: '#2D2E36', opacity: 1 });
wallDef({ id: 239, key: 'w239_nebulabrick', name: '', mapColor: '#2B3438', opacity: 1 });
wallDef({ id: 240, key: 'w240_stardustbrick', name: '', mapColor: '#3E2D21', opacity: 1 });
wallDef({ id: 241, key: 'w241_orangestainedglass', name: '', mapColor: '#925F35', opacity: 1 });
wallDef({ id: 242, key: 'w242_goldstarryglasswall', name: '', mapColor: '#4E4537', opacity: 1 });
wallDef({ id: 243, key: 'w243_bluestarryglasswall', name: '', mapColor: '#173456', opacity: 1 });
wallDef({ id: 244, key: 'w244_livingwoodunsafe', name: '', mapColor: '#3A2318', opacity: 1 });
wallDef({ id: 245, key: 'w245_wroughtironfence', name: '', mapColor: '#4A4A4A', opacity: 1 });
wallDef({ id: 246, key: 'w246_ebonstoneecho', name: '', mapColor: '#2F2935', opacity: 1 });
wallDef({ id: 247, key: 'w247_mudwallecho', name: '', mapColor: '#312B2C', opacity: 1 });
wallDef({ id: 248, key: 'w248_pearlstoneecho', name: '', mapColor: '#4D4651', opacity: 1 });
wallDef({ id: 249, key: 'w249_snowwallecho', name: '', mapColor: '#647681', opacity: 1 });
wallDef({ id: 250, key: 'w250_amethystecho', name: '', mapColor: '#4E4553', opacity: 1 });
wallDef({ id: 251, key: 'w251_topazecho', name: '', mapColor: '#514A3F', opacity: 1 });
wallDef({ id: 252, key: 'w252_sapphireecho', name: '', mapColor: '#384251', opacity: 1 });
wallDef({ id: 253, key: 'w253_emeraldecho', name: '', mapColor: '#32493B', opacity: 1 });
wallDef({ id: 254, key: 'w254_rubyecho', name: '', mapColor: '#523B40', opacity: 1 });
wallDef({ id: 255, key: 'w255_diamondecho', name: '', mapColor: '#464F51', opacity: 1 });
wallDef({ id: 256, key: 'w256_cave1echo', name: '', mapColor: '#2E3A36', opacity: 1 });
wallDef({ id: 257, key: 'w257_cave2echo', name: '', mapColor: '#38382E', opacity: 1 });
wallDef({ id: 258, key: 'w258_cave3echo', name: '', mapColor: '#393131', opacity: 1 });
wallDef({ id: 259, key: 'w259_cave4echo', name: '', mapColor: '#2D3338', opacity: 1 });
wallDef({ id: 260, key: 'w260_cave5echo', name: '', mapColor: '#38303B', opacity: 1 });
wallDef({ id: 261, key: 'w261_cave6echo', name: '', mapColor: '#503F37', opacity: 1 });
wallDef({ id: 262, key: 'w262_cave7echo', name: '', mapColor: '#37281C', opacity: 1 });
wallDef({ id: 263, key: 'w263_spiderecho', name: '', mapColor: '#201C16', opacity: 1 });
wallDef({ id: 264, key: 'w264_corruptgrassecho', name: '', mapColor: '#242539', opacity: 1 });
wallDef({ id: 265, key: 'w265_hallowedgrassecho', name: '', mapColor: '#193D43', opacity: 1 });
wallDef({ id: 266, key: 'w266_iceecho', name: '', mapColor: '#526C86', opacity: 1 });
wallDef({ id: 267, key: 'w267_obsidianbackecho', name: '', mapColor: '#242141', opacity: 1 });
wallDef({ id: 268, key: 'w268_crimsongrassecho', name: '', mapColor: '#653434', opacity: 1 });
wallDef({ id: 269, key: 'w269_crimstoneecho', name: '', mapColor: '#3E2C2D', opacity: 1 });
wallDef({ id: 270, key: 'w270_cavewall1echo', name: '', mapColor: '#5D442F', opacity: 1 });
wallDef({ id: 271, key: 'w271_cavewall2echo', name: '', mapColor: '#543C27', opacity: 1 });
wallDef({ id: 272, key: 'w272_marbleechounused', name: '', mapColor: '#787F8F', opacity: 1 });
wallDef({ id: 273, key: 'w273_graniteechounused', name: '', mapColor: '#0F102D', opacity: 1 });
wallDef({ id: 274, key: 'w274_cave8echo', name: '', mapColor: '#3D3D3D', opacity: 1, largeFrame: 2 });
wallDef({ id: 275, key: 'w275_sandstoneecho', name: '', mapColor: '#7E442B', opacity: 1 });
wallDef({ id: 276, key: 'w276_corruption1echo', name: '', mapColor: '#3F2F3F', opacity: 1 });
wallDef({ id: 277, key: 'w277_corruption2echo', name: '', mapColor: '#41334D', opacity: 1 });
wallDef({ id: 278, key: 'w278_corruption3echo', name: '', mapColor: '#43483B', opacity: 1 });
wallDef({ id: 279, key: 'w279_corruption4echo', name: '', mapColor: '#3C2643', opacity: 1 });
wallDef({ id: 280, key: 'w280_crimson1echo', name: '', mapColor: '#7B382F', opacity: 1 });
wallDef({ id: 281, key: 'w281_crimson2echo', name: '', mapColor: '#57181A', opacity: 1 });
wallDef({ id: 282, key: 'w282_crimson3echo', name: '', mapColor: '#664035', opacity: 1 });
wallDef({ id: 283, key: 'w283_crimson4echo', name: '', mapColor: '#7A2E36', opacity: 1 });
wallDef({ id: 284, key: 'w284_dirt1echo', name: '', mapColor: '#634637', opacity: 1 });
wallDef({ id: 285, key: 'w285_dirt2echo', name: '', mapColor: '#664939', opacity: 1 });
wallDef({ id: 286, key: 'w286_dirt3echo', name: '', mapColor: '#5C4131', opacity: 1 });
wallDef({ id: 287, key: 'w287_dirt4echo', name: '', mapColor: '#6A4B3A', opacity: 1 });
wallDef({ id: 288, key: 'w288_hallow1echo', name: '', mapColor: '#512153', opacity: 1 });
wallDef({ id: 289, key: 'w289_hallow2echo', name: '', mapColor: '#604F63', opacity: 1 });
wallDef({ id: 290, key: 'w290_hallow3echo', name: '', mapColor: '#7C2A68', opacity: 1 });
wallDef({ id: 291, key: 'w291_hallow4echo', name: '', mapColor: '#6F3670', opacity: 1 });
wallDef({ id: 292, key: 'w292_jungle1echo', name: '', mapColor: '#4B4437', opacity: 1 });
wallDef({ id: 293, key: 'w293_jungle2echo', name: '', mapColor: '#53533B', opacity: 1 });
wallDef({ id: 294, key: 'w294_jungle3echo', name: '', mapColor: '#27432C', opacity: 1 });
wallDef({ id: 295, key: 'w295_jungle4echo', name: '', mapColor: '#4D4D37', opacity: 1 });
wallDef({ id: 296, key: 'w296_lava1echo', name: '', mapColor: '#5C241C', opacity: 1 });
wallDef({ id: 297, key: 'w297_lava2echo', name: '', mapColor: '#603027', opacity: 1 });
wallDef({ id: 298, key: 'w298_lava3echo', name: '', mapColor: '#6C2C1A', opacity: 1 });
wallDef({ id: 299, key: 'w299_lava4echo', name: '', mapColor: '#6A2A26', opacity: 1 });
wallDef({ id: 300, key: 'w300_rocks1echo', name: '', mapColor: '#46453D', opacity: 1 });
wallDef({ id: 301, key: 'w301_rocks2echo', name: '', mapColor: '#393C39', opacity: 1 });
wallDef({ id: 302, key: 'w302_rocks3echo', name: '', mapColor: '#45393B', opacity: 1 });
wallDef({ id: 303, key: 'w303_rocks4echo', name: '', mapColor: '#473C42', opacity: 1 });
wallDef({ id: 304, key: 'w304_hardenedsandecho', name: '', mapColor: '#945D34', opacity: 1 });
wallDef({ id: 305, key: 'w305_corrupthardenedsandecho', name: '', mapColor: '#332641', opacity: 1 });
wallDef({ id: 306, key: 'w306_crimsonhardenedsandecho', name: '', mapColor: '#2B1816', opacity: 1 });
wallDef({ id: 307, key: 'w307_hallowhardenedsandecho', name: '', mapColor: '#4E4972', opacity: 1 });
wallDef({ id: 308, key: 'w308_corruptsandstoneecho', name: '', mapColor: '#362444', opacity: 1 });
wallDef({ id: 309, key: 'w309_crimsonsandstoneecho', name: '', mapColor: '#49120C', opacity: 1 });
wallDef({ id: 310, key: 'w310_hallowsandstoneecho', name: '', mapColor: '#3A2F51', opacity: 1 });
wallDef({ id: 311, key: 'w311_desertfossilecho', name: '', mapColor: '#734122', opacity: 1 });
wallDef({ id: 312, key: 'w312_bambooblockwall', name: '', mapColor: '#244110', opacity: 1 });
wallDef({ id: 313, key: 'w313_largebambooblockwall', name: '', mapColor: '#213D13', opacity: 1 });
wallDef({ id: 314, key: 'w314_amberstonewallecho', name: '', mapColor: '#4A3A2C', opacity: 1 });
wallDef({ id: 315, key: 'w315_bamboofence', name: '', mapColor: '#72782D', opacity: 1 });
wallDef({ id: 316, key: 'w316_ashwood', name: '', mapColor: '#3A3440', opacity: 1 });
wallDef({ id: 317, key: 'w317_ashwoodfence', name: '', mapColor: '#504652', opacity: 1 });
wallDef({ id: 318, key: 'w318_echowall', name: '', mapColor: '#060622', opacity: 1 });
wallDef({ id: 319, key: 'w319_reefwall', name: '', mapColor: '#5B3052', opacity: 1 });
wallDef({ id: 320, key: 'w320_poopwall', name: '', mapColor: '#42271B', opacity: 1 });
wallDef({ id: 321, key: 'w321_shimmerblockwall', name: '', mapColor: '#3E536C', opacity: 1 });
wallDef({ id: 322, key: 'w322_shimmerbrickwall', name: '', mapColor: '#3A5473', opacity: 1 });
wallDef({ id: 323, key: 'w323_lunarrustbrickwall', name: '', mapColor: '#635E69', opacity: 1, largeFrame: 2 });
wallDef({ id: 324, key: 'w324_darkcelestialbrickwall', name: '', mapColor: '#505C68', opacity: 1, largeFrame: 2 });
wallDef({ id: 325, key: 'w325_astrabrickwall', name: '', mapColor: '#385F7C', opacity: 1, largeFrame: 2 });
wallDef({ id: 326, key: 'w326_cosmicemberbrickwall', name: '', mapColor: '#5C5E50', opacity: 1, largeFrame: 2 });
wallDef({ id: 327, key: 'w327_cryocorebrickwall', name: '', mapColor: '#3E6674', opacity: 1, largeFrame: 2 });
wallDef({ id: 328, key: 'w328_mercurybrickwall', name: '', mapColor: '#626769', opacity: 1, largeFrame: 2 });
wallDef({ id: 329, key: 'w329_starroyalebrickwall', name: '', mapColor: '#575C76', opacity: 1, largeFrame: 2 });
wallDef({ id: 330, key: 'w330_heavenforgebrickwall', name: '', mapColor: '#545969', opacity: 1, largeFrame: 2 });
wallDef({ id: 331, key: 'w331_ancientbluebrickwall', name: '', mapColor: '#2A2C51', opacity: 1 });
wallDef({ id: 332, key: 'w332_ancientgreenbrickwall', name: '', mapColor: '#22421A', opacity: 1 });
wallDef({ id: 333, key: 'w333_ancientpinkbrickwall', name: '', mapColor: '#401931', opacity: 1 });
wallDef({ id: 334, key: 'w334_ancientgoldbrickwall', name: '', mapColor: '#4C4220', opacity: 1 });
wallDef({ id: 335, key: 'w335_ancientsilverbrickwall', name: '', mapColor: '#3C4143', opacity: 1 });
wallDef({ id: 336, key: 'w336_ancientcopperbrickwall', name: '', mapColor: '#4C2D20', opacity: 1 });
wallDef({ id: 337, key: 'w337_ancientobsidianbrickwall', name: '', mapColor: '#25243B', opacity: 1 });
wallDef({ id: 338, key: 'w338_ancienthellstonebrickwall', name: '', mapColor: '#392220', opacity: 1 });
wallDef({ id: 339, key: 'w339_ancientcobaltbrickwall', name: '', mapColor: '#132B3C', opacity: 1 });
wallDef({ id: 340, key: 'w340_ancientmythrilbrickwall', name: '', mapColor: '#2A433C', opacity: 1 });
wallDef({ id: 341, key: 'w341_lavamossblockwall', name: '', mapColor: '#681700', opacity: 1 });
wallDef({ id: 342, key: 'w342_argonmossblockwall', name: '', mapColor: '#5B0941', opacity: 1 });
wallDef({ id: 343, key: 'w343_kryptonmossblockwall', name: '', mapColor: '#11592B', opacity: 1 });
wallDef({ id: 344, key: 'w344_xenonmossblockwall', name: '', mapColor: '#05415E', opacity: 1 });
wallDef({ id: 345, key: 'w345_violetmossblockwall', name: '', mapColor: '#3A0651', opacity: 1 });
wallDef({ id: 346, key: 'w346_rainbowmossblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 347, key: 'w347_shimmerfall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 348, key: 'w348_fallenstarwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 349, key: 'w349_stoneunsafe', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 350, key: 'w350_unbreakableblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 351, key: 'w351_feywoodwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 352, key: 'w352_hallowedbrickwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 353, key: 'w353_pinetreeblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 354, key: 'w354_easterblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 1 });
wallDef({ id: 355, key: 'w355_gothicbrickwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 356, key: 'w356_flinxfurblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 357, key: 'w357_jellyfishblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 358, key: 'w358_pinewoodblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 359, key: 'w359_harpyblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 360, key: 'w360_moonplateblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 361, key: 'w361_librarianblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 362, key: 'w362_spikeblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 363, key: 'w363_officeblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });
wallDef({ id: 364, key: 'w364_forbiddenblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 365, key: 'w365_waterblockwall', name: '', mapColor: '#FF00FF', opacity: 1 });
wallDef({ id: 366, key: 'w366_boulderblockwall', name: '', mapColor: '#FF00FF', opacity: 1, largeFrame: 2 });

// 墙 key→id 回填（id 即原版 wld 墙 id）
WALL_DEFS.forEach((d) => { if (d) WALL_BY_KEY[d.key] = d.id; });

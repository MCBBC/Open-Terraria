// Unity 素材图集运行时加载器
// 数据由 scripts/build-atlas.mjs 生成（public/sprites/atlas.json + resources.json）
// 原版素材由 scripts/vanilla-atlas.mjs 生成（public/sprites/vanilla.json，独立命名空间、无 Unity y 翻转）
// 注意：Unity 精灵 rect 的 y 轴原点在【左下】，Canvas 在【左上】，取用时要翻转。
import atlasJson from '../../public/sprites/atlas.json';
import resourcesJson from '../../public/sprites/resources.json';
import vanillaJson from '../../public/sprites/vanilla.json';

export interface SpriteRect { name: string; x: number; y: number; w: number; h: number; }
export interface SpriteRef { file: string; sprite: string; }
export interface RuleDef {
  id: number;
  sprites: SpriteRef[];
  neighbors: number[];
  positions: Array<[number, number]>;
  transform: number;
  output: number;
}
export interface RuleTileDef { defaultSprite: SpriteRef | null; tilingRules: RuleDef[]; }

export interface AtlasFile { guid: string; sprites: SpriteRect[]; idToName: Record<string, string>; }
export interface AtlasData {
  files: Record<string, AtlasFile>;
  guidToFile: Record<string, string>;
}
export interface ResourcesData {
  items: Array<{ name: string; type: string; iconGuid: string | null; placeTile: string | null; funcList: string }>;
  tiles: Array<{ name: string; tileGuid: string; layer: string; digList: string; digTime: string; dropItemGuid: string }>;
  potions: Array<{ name: string; type: string; iconGuid: string | null; buffType: number | null; duration: number | null; isHealType: string }>;
  accessories: Array<{ name: string; type: string; iconGuid: string | null }>;
  buffs: Array<{ name: string; iconGuid: string | null }>;
  anims: Record<string, SpriteRef[]>;
  rules: Record<string, RuleTileDef>;
}

export interface DrawRect { img: HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; }

// ---- 原版素材命名空间（vanilla.json，TEdit 数据驱动） ----
export interface VanillaTileMeta {
  name: string; key: string; sheet: string;
  solid: boolean; blend: boolean; framed: boolean; light: boolean;
  color: string; placement: string | null;
  grid: [number, number];      // 帧像素尺寸（蜡烛类 [16,20]）
  stride: [number, number];    // 表内帧步长（grid+gap，如 [18,18]）
  frameSize: Array<[number, number]>; // 每个 style 的占格数
  cols: number; rows: number;
}
export interface VanillaItemMeta { name: string; key: string; icon: string; createTile: number | null; }
export interface VanillaWallMeta {
  name: string; key: string; sheet: string; color: string;
  grid: [number, number]; stride: [number, number]; cols: number; rows: number;
}
export interface VanillaData {
  tiles: Record<string, VanillaTileMeta>;
  items: Record<string, VanillaItemMeta>;
  walls: Record<string, VanillaWallMeta>;
}

/** 整图硬 alpha：alpha ≥128 → 255，<128 → 0（并清零 RGB），消除提取 PNG 的半透明镶边 */
function hardAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] >= 128) px[i + 3] = 255;
    else {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

export class SpriteAtlas {
  data = atlasJson as unknown as AtlasData;
  resources = resourcesJson as unknown as ResourcesData;
  vanilla = vanillaJson as unknown as VanillaData;
  images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  vimages = new Map<string, HTMLImageElement>(); // 原版 PNG（干净像素，不做 hardAlpha）
  /** 人工标注（annotator.html 导出）：sheet → spriteName → 方位标签 */
  annotations: Record<string, Record<string, string>> = {};

  async load(onProgress?: (p: number) => void): Promise<void> {
    const files = Object.keys(this.data.files);
    const vfiles = [
      ...Object.values(this.vanilla.tiles).map((t) => t.sheet),
      ...Object.values(this.vanilla.items).map((i) => i.icon),
      ...Object.values(this.vanilla.walls).map((w) => w.sheet),
    ];
    let done = 0;
    const total = files.length + vfiles.length;
    await Promise.all([
      ...files.map((f) => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // 根源处理：整图硬 alpha —— 抗锯齿半透明像素（提取 PNG 的灰/黑镶边来源）
          // 二值化为 0/255，所有消费方（tile/墙/图标/角色）统一获得干净像素
          this.images.set(f, hardAlpha(img));
          done++;
          onProgress?.(done / total);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = `sprites/${encodeURI(f)}`;
      })),
      // 原版素材：并行加载，失败跳过（vframe/vicon 返回 null 兜底）
      ...vfiles.map((f) => new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { this.vimages.set(f, img); done++; onProgress?.(done / total); resolve(); };
        img.onerror = () => resolve();
        img.src = `sprites/${encodeURI(f)}`;
      })),
    ]);
    // 人工标注（可选，缺失时回退）
    try {
      const r = await fetch('sprites/annotations.json');
      if (r.ok) this.annotations = await r.json();
    } catch { /* 无标注 */ }
  }

  // ---- 原版素材 API（无 Unity y 翻转，按 TEdit 网格寻址） ----

  /** 原版图块元数据 */
  vmeta(sheetId: number): VanillaTileMeta | null {
    return this.vanilla.tiles[String(sheetId)] ?? null;
  }

  /** 原版图块表取帧（col,row 从 0 起）。越界/缺失返回 null */
  vframe(sheetId: number, col: number, row: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    const img = this.vimages.get(m.sheet);
    if (!img) return null;
    if (col < 0 || row < 0 || col >= m.cols || row >= m.rows) return null;
    return { img, sx: col * m.stride[0], sy: row * m.stride[1], sw: m.grid[0], sh: m.grid[1] };
  }

  /** 原版表内任意像素偏移取帧（style/显式帧：18px 步长的 frameX/frameY 直用） */
  vframeAt(sheetId: number, fx: number, fy: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    const img = this.vimages.get(m.sheet);
    if (!img) return null;
    if (fx < 0 || fy < 0 || fx + m.grid[0] > img.width || fy + m.grid[1] > img.height) return null;
    return { img, sx: fx, sy: fy, sw: m.grid[0], sh: m.grid[1] };
  }

  /** 原版物品图标（整图） */
  vicon(itemId: number): DrawRect | null {
    const m = this.vanilla.items[String(itemId)];
    if (!m) return null;
    const img = this.vimages.get(m.icon);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  has(file: string): boolean {
    return this.images.has(file);
  }

  /** 取精灵绘制矩形（Unity y 翻转已处理）。找不到返回 null。 */
  rect(file: string, sprite: string): DrawRect | null {
    const img = this.images.get(file);
    const entry = this.data.files[file];
    if (!img || !entry) return null;
    const s = entry.sprites.find((x) => x.name === sprite);
    if (!s) return null;
    return { img, sx: s.x, sy: img.height - s.y - s.h, sw: s.w, sh: s.h };
  }

  /** 按资源名取整图（物品/Buff 图标等单图资源） */
  byGuid(guid: string | null | undefined): DrawRect | null {
    if (!guid) return null;
    const file = this.data.guidToFile[guid];
    if (!file) return null;
    const img = this.images.get(file);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  animFrames(anim: string): DrawRect[] {
    const frames = this.resources.anims[anim] ?? [];
    return frames.map((f) => this.rect(f.file, f.sprite)).filter(Boolean) as DrawRect[];
  }
}

// ---- 资源名（resources.json 的 name 字段是 \uXXXX 转义，JSON.parse 已还原）----
export function itemIconByType(atlas: SpriteAtlas, typeNum: number): DrawRect | null {
  const it = atlas.resources.items.find((x) => Number(x.type) === typeNum);
  return atlas.byGuid(it?.iconGuid ?? null);
}

export function findItem(atlas: SpriteAtlas, name: string) {
  return atlas.resources.items.find((x) => x.name === name);
}

// 我们的 item key → Maples 物品资源名（图标替换表）
export const ITEM_ICON_MAP: Record<string, string> = {
  dirt_block: '泥土', stone_block: '石头', wood: '木材', torch: '火把',
  workbench: '工作台', furnace: '熔炉', anvil: '铁砧',
  iron_sword: '铁剑', iron_pickaxe: '铁镐', iron_axe: '铁斧', iron_ore: '铁矿', iron_bar: '铁锭',
  heal_potion: '治疗药水', agility_potion: '敏捷药水', ironskin_potion: '铁皮药水',
  thorns_potion: '荆棘药水', regen_potion: '恢复药水',
  lucky_horseshoe: '幸运马掌', feral_claws: '猛爪手套',
};

// 特殊手动映射（无 .asset 登记的图标）
const ITEM_DIRECT_MAP: Record<string, { file: string; sprite: string }> = {
  acorn: { file: 'UI/工具/Item_62.png', sprite: 'Item_62_0' }, // 树种
};

/** 按我们的 item key 取 Maples 图标矩形（搜索 items + potions + accessories 三个来源）。
 *  Maples 没有的回退原版 Item_N 图标（第二查找层，id 实读自 TEdit items.json） */
export function atlasIconForKey(atlas: SpriteAtlas, key: string): DrawRect | null {
  const direct = ITEM_DIRECT_MAP[key];
  if (direct) return atlas.rect(direct.file, direct.sprite);
  const resName = ITEM_ICON_MAP[key];
  if (resName) {
    const r = atlas.resources;
    const res =
      r.items.find((x) => x.name === resName) ??
      (r.potions ?? []).find((x) => x.name === resName) ??
      (r.accessories ?? []).find((x) => x.name === resName);
    const m = atlas.byGuid(res?.iconGuid ?? null);
    if (m) return m;
  }
  const vid = VANILLA_ITEM_ICON_MAP[key];
  if (vid !== undefined) return atlas.vicon(vid);
  return null;
}

// 我们的 item key → 原版物品图标 id（TEdit items.json 核实；Maples 缺图标的用这层）
export const VANILLA_ITEM_ICON_MAP: Record<string, number> = {
  dirt_block: 2, stone_block: 3, sand_block: 169, snow_block: 593,
  platform: 94, door: 25, chest: 48, torch: 8,
  mushroom_item: 5, gel: 23, acorn: 27,
  copper_ore: 12, iron_ore: 11, silver_ore: 14, gold_ore: 13,
  copper_bar: 20, iron_bar: 22, silver_bar: 21, gold_bar: 19,
  lens: 38, suspicious_eye: 43,
  lesser_healing_potion: 28, coin_copper: 71,
  heal_potion: 188, agility_potion: 290, ironskin_potion: 292,
  thorns_potion: 301, regen_potion: 289,
  wood_sword: 24, wood_hammer: 196,
  copper_pickaxe: 3509, copper_axe: 3506, copper_sword: 3508, copper_hammer: 3505,
  iron_pickaxe: 1, iron_axe: 10, silver_pickaxe: 3515, silver_axe: 3512,
  silver_hammer: 3511, gold_pickaxe: 3521, gold_axe: 3518, gold_hammer: 3517,
  // ---- 原版批次新材料 / 方块 / 家具 ----
  tin_ore: 699, lead_ore: 700, tungsten_ore: 701, platinum_ore: 702,
  tin_bar: 703, lead_bar: 704, tungsten_bar: 705, platinum_bar: 706,
  demonite_ore: 56, meteorite: 116, hellstone: 174,
  crimtane_ore: 880, cobalt_ore: 364, mythril_ore: 365, adamantite_ore: 366,
  palladium_ore: 1104, orichalcum_ore: 1105, titanium_ore: 1106, chlorophyte_ore: 947,
  sapphire: 177, ruby: 178, emerald: 179, topaz: 180, amethyst: 181, diamond: 182,
  ice_block: 664, ice_brick: 883, snow_brick: 594,
  sandstone_block: 3271, hardened_sand_block: 3272, desert_fossil: 3347,
  clay_block: 133, glass: 170, obsidian: 173, gray_brick: 129, red_brick: 131,
  mud_block: 176, silt_block: 424,
  table: 32, chair: 34, bed: 224, bookcase: 354, grandfather_clock: 359,
  piano: 333, dresser: 334, bench: 335, bathtub: 336, keg: 352, cooking_pot: 345,
  clay_pot: 222, tombstone: 321, life_crystal: 29,
  candle: 105, chandelier: 106, lantern: 136, candelabra: 349,
  chinese_lantern: 344, skull_lantern: 347, water_candle: 148,
};

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

// 杂项单图素材（非表驱动，直接整图使用）
// 树木专用：Tree_Tops/Branches（树冠树枝，TEdit style 0-10）+ Tiles_5_N（生物群系树干）
export const VANILLA_MISC = [
  'vanilla/Bubble.png',
  ...Array.from({ length: 11 }, (_, i) => `vanilla/Tree_Tops_${i}.png`),
  ...Array.from({ length: 11 }, (_, i) => `vanilla/Tree_Branches_${i}.png`),
  ...Array.from({ length: 7 }, (_, i) => `vanilla/Tiles_5_${i}.png`),
  'vanilla/Evil_Cactus.png', 'vanilla/Good_Cactus.png', 'vanilla/Crimson_Cactus.png',
];
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
  largeFrame?: number;
}
// NPC 贴图表（纵向帧条：小动物等）
export interface VanillaNpcMeta { sheet: string; frameW: number; frameH: number; count: number; }
export interface VanillaData {
  tiles: Record<string, VanillaTileMeta>;
  items: Record<string, VanillaItemMeta>;
  walls: Record<string, VanillaWallMeta>;
  npcs?: Record<string, VanillaNpcMeta>;
  tileNames?: Record<string, string>;  // 全量原版 tile id → 英文名（兼容报告用）
  itemNames?: Record<string, string>;
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
      ...Object.values(this.vanilla.npcs ?? {}).map((n) => n.sheet),
      ...VANILLA_MISC, // 杂项单图（呼吸气泡等）
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

  /** 原版表内任意矩形（多格物体整体取图，如墓碑 2×2 = 34×34px） */
  vrect(sheetId: number, fx: number, fy: number, w: number, h: number): DrawRect | null {
    const m = this.vmeta(sheetId);
    if (!m) return null;
    const img = this.vimages.get(m.sheet);
    if (!img) return null;
    if (fx < 0 || fy < 0 || fx + w > img.width || fy + h > img.height) return null;
    return { img, sx: fx, sy: fy, sw: w, sh: h };
  }

  /** 原版 NPC 贴图表取帧（小动物：纵向帧条，frameIdx 0-based） */
  vnpc(npcId: number, frameIdx: number): DrawRect | null {
    const m = this.vanilla.npcs?.[String(npcId)];
    if (!m) return null;
    const img = this.vimages.get(m.sheet);
    if (!img) return null;
    const idx = Math.max(0, Math.min(m.count - 1, frameIdx));
    return { img, sx: 0, sy: idx * m.frameH, sw: m.frameW, sh: m.frameH };
  }

  /** 原版 tile/item 英文名（全量表，未白名单的也有） */
  vTileName(id: number): string | null { return this.vanilla.tileNames?.[String(id)] ?? null; }
  vItemName(id: number): string | null { return this.vanilla.itemNames?.[String(id)] ?? null; }

  vnpcMeta(npcId: number): VanillaNpcMeta | null {
    return this.vanilla.npcs?.[String(npcId)] ?? null;
  }

  /** 原版杂项单图（呼吸气泡等） */
  vmisc(path: string): DrawRect | null {
    const img = this.vimages.get(path);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
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
const ITEM_DIRECT_MAP: Record<string, { file: string; sprite: string }> = {};

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
  // 盔甲三件套（原版 id：胫甲 76-79 / 胸甲 80-83 / 头盔 89-92）
  copper_greaves: 76, iron_greaves: 77, silver_greaves: 78, gold_greaves: 79,
  copper_chainmail: 80, iron_chainmail: 81, silver_chainmail: 82, gold_chainmail: 83,
  copper_helmet: 89, iron_helmet: 90, silver_helmet: 91, gold_helmet: 92,
  coin_silver: 72, coin_gold: 73,
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
  bomb: 166, rope: 965,
  // wld 导入补全物品图标
  vi_2350_recall_potion: 2350,
  vi_188_healing_potion: 188,
  vi_282_glowstick: 282,
  vi_41_flaming_arrow: 41,
  vi_167_dynamite: 167,
  vi_279_throwing_knife: 279,
  vi_51_jester_s_arrow: 51,
  vi_19_gold_bar: 19,
  vi_302_water_walking_potion: 302,
  vi_305_gravitation_potion: 305,
  vi_43_suspicious_looking_eye: 43,
  vi_296_spelunker_potion: 296,
  vi_299_night_owl_potion: 299,
  vi_965_rope: 965,
  vi_303_archery_potion: 303,
  vi_304_hunter_potion: 304,
  vi_50_magic_mirror: 50,
  vi_42_shuriken: 42,
  vi_295_featherfall_potion: 295,
  vi_53_cloud_in_a_bottle: 53,
  vi_2329_dangersense_potion: 2329,
  vi_40_wooden_arrow: 40,
  vi_975_shoe_spikes: 975,
  vi_54_hermes_boots: 54,
  vi_301_thorns_potion: 301,
  vi_49_band_of_regeneration: 49,
  vi_2326_titan_potion: 2326,
  vi_297_invisibility_potion: 297,
  vi_166_bomb: 166,
  vi_5011_mace: 5011,
  vi_4425_shark_bait: 4425,
  vi_2351_teleportation_potion: 2351,
  vi_4460_sandcastle_bucket: 4460,
  vi_168_grenade: 168,
  vi_227_restoration_potion: 227,
  vi_930_flare_gun: 930,
  vi_931_flare: 931,
  vi_997_extractinator: 997,
  vi_52_angel_statue: 52,
  vi_265_hellfire_arrow: 265,
  vi_298_shine_potion: 298,
  vi_5007_dead_man_s_sweater: 5007,
  vi_117_meteorite_bar: 117,
  vi_186_breathing_reed: 186,
  vi_329_shadow_key: 329,
  vi_974_ice_torch: 974,
  vi_2322_mining_potion: 2322,
  vi_4915_tungsten_bullet: 4915,
  vi_946_umbrella: 946,
  vi_939_web_slinger: 939,
  vi_4870_potion_of_return: 4870,
  vi_288_obsidian_skin_potion: 288,
  vi_31_bottle: 31,
  vi_211_feral_claws: 211,
  vi_4404_inner_tube: 4404,
  vi_187_flipper: 187,
  vi_2198_ice_machine: 2198,
  vi_274_dark_lance: 274,
  vi_285_aglet: 285,
  vi_213_staff_of_regrowth: 213,
  vi_964_boomstick: 964,
  vi_1293_lihzahrd_power_cell: 1293,
  vi_2195_lihzahrd_furnace: 2195,
  vi_2766_solar_tablet_fragment: 2766,
  vi_300_battle_potion: 300,
  vi_2348_inferno_potion: 2348,
  vi_218_flamelash: 218,
  vi_3019_hellwing_bow: 3019,
  vi_112_flower_of_fire: 112,
  vi_220_sunfury: 220,
  vi_4345_can_of_worms: 4345,
  vi_953_climbing_claws: 953,
  vi_3069_wand_of_sparking: 3069,
  vi_212_anklet_of_the_wind: 212,
  vi_2204_honey_dispenser: 2204,
  vi_277_trident: 277,
  vi_863_water_walking_boots: 863,
  vi_751_cloud: 751,
  vi_155_muramasa: 155,
  vi_289_regeneration_potion: 289,
  vi_906_lava_charm: 906,
  vi_4055_dunerider_boots: 4055,
  vi_724_ice_blade: 724,
  vi_670_ice_boomerang: 670,
  vi_4061_storm_spear: 4061,
  vi_987_blizzard_in_a_bottle: 987,
  vi_4551_slice_of_hell_cake: 4551,
  vi_5010_treasure_magnet: 5010,
  vi_2323_heartreach_potion: 2323,
  vi_2345_lifeforce_potion: 2345,
  vi_290_swiftness_potion: 290,
  vi_291_gills_potion: 291,
  vi_280_spear: 280,
  vi_2325_builder_potion: 2325,
  vi_284_wooden_boomerang: 284,
  vi_2192_bone_welder: 2192,
  vi_5234_remnants_of_devotion: 5234,
  vi_156_cobalt_shield: 156,
  vi_157_aqua_scepter: 157,
  vi_163_blue_moon: 163,
  vi_113_magic_missile: 113,
  vi_3317_valor: 3317,
  vi_327_golden_key: 327,
  vi_164_handgun: 164,
  vi_294_magic_power_potion: 294,
  vi_4263_magic_conch: 4263,
  vi_4062_thunder_zapper: 4062,
  vi_1579_flurry_boots: 1579,
  vi_4056_ancient_chisel: 4056,
  vi_4346_encumbering_stone: 4346,
  vi_1319_snowball_cannon: 1319,
  vi_3199_ice_mirror: 3199,
  vi_950_ice_skates: 950,
  vi_4443_demonic_hellcart: 4443,
  vi_4737_ornate_shadow_key: 4737,
  vi_4276_bast_statue: 4276,
  vi_4262_snake_charmer_s_flute: 4262,
  vi_3093_herb_bag: 3093,
  vi_292_ironskin_potion: 292,
  vi_3084_radar: 3084,
  vi_4341_step_stool: 4341,
  vi_4978_fledgling_wings: 4978,
  vi_2197_sky_mill: 2197,
  vi_158_lucky_horseshoe: 158,
  vi_5254_blessing_from_the_heavens: 5254,
  vi_1156_piranha_gun: 1156,
  vi_1571_scourge_of_the_corruptor: 1571,
  vi_1260_rainbow_gun: 1260,
  vi_1572_staff_of_the_frost_hydra: 1572,
  vi_4607_desert_tiger_staff: 4607,
  vi_933_leaf_wand: 933,
  vi_832_living_wood_wand: 832,
  vi_4066_desert_minecart: 4066,
  vi_4450_shroom_minecart: 4450,
  vi_4423_scarab_bomb: 4423,
  vi_159_shiny_red_balloon: 159,
  vi_5258_see_the_world_for_what_it_is: 5258,
  vi_65_starfury: 65,
  vi_5388_eye_of_the_sun: 5388,
  vi_2219_celestial_magnet: 2219,
  vi_5255_love_is_in_the_trash_slot: 5255,
  vi_4426_bee_minecart: 4426,
  vi_3017_flower_boots: 3017,
  vi_3360_living_mahogany_wand: 3360,
  vi_3361_rich_mahogany_leaf_wand: 3361,
  vi_1309_slime_staff: 1309,
  vi_1845_necromantic_scroll: 1845,
  vi_1864_papyrus_scarab: 1864,
  vi_1158_pygmy_necklace: 1158,
  vi_3034_coin_ring: 3034,
  vi_308_moonglow_seeds: 308,
  vi_312_fireblossom_seeds: 312,
  vi_310_deathweed_seeds: 310,
  vi_307_daybloom_seeds: 307,
  vi_309_blinkroot_seeds: 309,
  vi_2357_shiverthorn_seeds: 2357,
  vi_311_waterleaf_seeds: 311,
  vi_1828_pumpkin_seed: 1828,
  vi_126_bottled_water: 126,
  vi_1134_bottled_honey: 1134,
  vi_3068_guide_to_plant_fiber_cordage: 3068,
  vi_4779_mushroom_hat: 4779,
  vi_4780_mushroom_vest: 4780,
  vi_4781_mushroom_pants: 4781,
vi_678_red_potion: 678,
  vi_281_blowpipe: 281,
  vi_293_mana_regeneration_potion: 293,
  vi_2767_solar_tablet: 2767,
  vi_3_stone_block: 3,
  vi_3213_money_trough: 3213,
  vi_94_wood_platform: 94,
  vi_2757_vortex_helmet: 2757,
  vi_4989_soaring_insignia: 4989,
  vi_75_fallen_star: 75,
  vi_3383_stardust_leggings: 3383,
  vi_4914_kaleidoscope: 4914,
  vi_26_stone_wall: 26,
  vi_1991_bug_net: 1991,
  vi_4828_superheated_blood: 4828,
  vi_3509_copper_pickaxe: 3509,
  vi_3507_copper_shortsword: 3507,
  vi_4755_grox_the_great_s_horned_cowl: 4755,
  vi_4756_grox_the_great_s_chestplate: 4756,
  vi_4757_grox_the_great_s_greaves: 4757,
  vi_214_hellstone_brick: 214,
  vi_5000_terraspark_boots: 5000,
  vi_5339_arcane_crystal: 5339,
  vi_5391_uncumbering_stone: 5391,
  vi_2585_slime_hook: 2585,
  vi_313_daybloom: 313,
  vi_267_guide_voodoo_doll: 267,
  vi_2649_steampunk_candle: 2649,
  vi_286_sticky_glowstick: 286,
  vi_3002_spelunker_glowstick: 3002,
  vi_4819_demon_conch: 4819,
  vi_1802_raven_staff: 1802,
  vi_3382_stardust_plate: 3382,
  vi_3270_item_frame: 3270,
  vi_3771_ancient_horn: 3771,
  vi_93_wood_wall: 93,
  vi_4281_finch_staff: 4281,
  vi_5407_star_royale_brick: 5407,
  vi_5401_lunar_rust_brick: 5401,
  vi_4716_mollusk_whistle: 4716,
  vi_3540_phantasm: 3540,
  vi_2176_shroomite_digging_claw: 2176,
  vi_2349_wrath_potion: 2349,
  vi_4679_morning_star: 4679,
  vi_1169_bone_key: 1169,
  vi_3863_betsy_mask: 3863,
  vi_3124_cell_phone: 3124,
  vi_3506_copper_axe: 3506,
  vi_4680_dark_harvest: 4680,
  vi_543_brown_pressure_plate: 543,
  vi_172_ash_block: 172,
  vi_171_sign: 171,
  vi_1723_living_wood_wall: 1723,
  vi_4754_grox_the_great_s_wings: 4754,
  vi_3353_mechanical_cart: 3353,
  vi_2287_winter_cape: 2287,
  vi_1179_chlorophyte_bullet: 1179,
  vi_4766_world_globe: 4766,
  vi_4954_celestial_starboard: 4954,
  vi_4730_ghostar_s_infinity_eight: 4730,
  vi_4758_blade_staff: 4758,
  vi_4765_tree_globe: 4765,
  vi_5342_ambrosia: 5342,
  vi_5328_chest_lock: 5328,
  vi_5343_peddler_s_satchel: 5343,
  vi_5285_moon_globe: 5285,
  vi_5289_minecart_upgrade_kit: 5289,
  vi_5336_advanced_combat_techniques_volume_two: 5336,
  vi_5451_kwad_racer_drone: 5451,
  vi_5359_shellphone_spawn: 5359,
  vi_3032_super_absorbant_sponge: 3032,
  vi_3031_bottomless_water_bucket: 3031,
  vi_509_red_wrench: 509,
  vi_4741_butcher_s_bloodstained_apron: 4741,
  vi_3065_star_wrath: 3065,
  vi_3063_meowmere: 3063,
  vi_3372_lunatic_cultist_mask: 3372,
  vi_1504_spectre_robe: 1504,
  vi_2769_cosmic_car_key: 2769,
  vi_216_shackle: 216,
  vi_4415_stone_door: 4415,
  vi_118_hook: 118,
  vi_1681_skeleton_banner: 1681,
  vi_283_seed: 283,
  vi_1173_grave_marker: 1173,
  vi_4379_wyvern_kite: 4379,
  vi_4378_xenon_moss: 4378,
  vi_4377_krypton_moss: 4377,
  vi_4376_rat_cage: 4376,
  vi_4375_rat: 4375,
  vi_4484_1_2_second_timer: 4484,
  vi_4824_wet_bomb: 4824,
  vi_4485_1_4_second_timer: 4485,
  vi_5378_cursed_flare: 5378,
  vi_5354_reflective_shades: 5354,
  vi_5387_raynbro_s_pants: 5387,
  vi_5386_raynbro_s_hoodie: 5386,
  vi_5390_raynbro_s_hood: 5390,
  vi_5338_aegis_fruit: 5338,
  vi_5404_cosmic_ember_brick: 5404,
  vi_5405_cryocore_brick: 5405,
  vi_5403_astra_brick: 5403,
  vi_346_safe: 346,
  vi_4829_cat_license: 4829,
  vi_3335_demon_heart: 3335,
  vi_4750_foodbarbarian_s_tattered_dragon_wings: 4750,
  vi_3042_phase_dye: 3042,
  vi_3024_skiphs_blood: 3024,
  vi_3054_shadowflame_knife: 3054,
  vi_5275_joja_cola: 5275,
  vi_5278_pomegranate: 5278,
  vi_5277_spicy_pepper: 5277,
  vi_5437_shellphone: 5437,
  vi_1507_spectre_hamaxe: 1507,
  vi_2250_steampunk_chest: 2250,
  vi_392_glass_wall: 392,
  vi_2699_weapon_rack: 2699,
  vi_3552_blue_flame_and_silver_dye: 3552,
  vi_5005_terraprisma: 5005,
  vi_4604_exotic_chew_toy: 4604,
  vi_4611_world_feeder_kite: 4611,
  vi_4649_blue_jellyfish_kite: 4649,
  vi_4796_dark_mage_s_tome: 4796,
  vi_4553_plasma_lamp: 4553,
  vi_4365_celestial_wand: 4365,
  vi_331_jungle_spores: 331,
  vi_2430_slimy_saddle: 2430,
  vi_4956_zenith: 4956,
  vi_2798_laser_drill: 2798,
  vi_2814_martian_chest: 2814,
  vi_210_vine: 210,
  vi_4371_yellow_kite: 4371,
  vi_4291_lemon: 4291,
  vi_2493_king_slime_mask: 2493,
  vi_1919_sugar_cookie: 1919,
  vi_1912_eggnog: 1912,
  vi_4023_grapes: 4023,
  vi_4792_the_black_spot: 4792,
  vi_529_red_pressure_plate: 529,
  vi_3066_smooth_marble_block: 3066,
  vi_183_glowing_mushroom: 183,
  vi_1103_slush_block: 1103,
  vi_2119_stone_slab: 2119,
  vi_593_snow_block: 593,
  vi_3081_marble_block: 3081,
  vi_1111_blue_berries: 1111,
  vi_1115_red_husk: 1115,
  vi_217_molten_hamaxe: 217,
  vi_122_molten_pickaxe: 122,
  vi_1827_bladed_glove: 1827,
  vi_2263_white_dynasty_wall: 2263,
  vi_330_obsidian_brick_wall: 330,
  vi_130_gray_brick_wall: 130,
  vi_2433_stone_slab_wall: 2433,
  vi_452_hornet_statue: 452,
  vi_453_bomb_statue: 453,
  vi_360_armor_statue: 360,
  vi_3711_wraith_statue: 3711,
  vi_438_star_statue: 438,
  vi_446_skeleton_statue: 446,
  vi_458_cross_statue: 458,
  vi_3655_scorpion_statue: 3655,
  vi_328_shadow_chest: 328,
  vi_2196_living_loom: 2196,
  vi_916_shadewood_work_bench: 916,
  vi_35_iron_anvil: 35,
  vi_36_work_bench: 36,
  vi_3240_tall_gate: 3240,
  vi_337_red_banner: 337,
  vi_3381_stardust_helmet: 3381,
  vi_1765_vampire_pants: 1765,
  vi_2859_lunar_cultist_robe: 2859,
  vi_2857_lunar_cultist_hood: 2857,
  vi_2998_summoner_emblem: 2998,
  vi_1175_headstone: 1175,
  vi_25_wooden_door: 25,
  vi_46_light_s_bane: 46,
  vi_352_keg: 352,
  vi_2340_minecart_track: 2340,
  vi_498_mannequin: 498,
  vi_4721_mushroom_beam: 4721,
  vi_819_living_wood_door: 819,
  vi_1458_obsidian_door: 1458,
  vi_3763_0x33_s_aviators: 3763,
  vi_176_mud_block: 176,
  vi_1569_vampire_knives: 1569,
  vi_857_sandstorm_in_a_bottle: 857,
  vi_2292_fiberglass_fishing_pole: 2292,
  vi_5238_constellation: 5238,
  vi_753_seaweed: 753,
  vi_5120_deer_thing: 5120,
  vi_5508_grim_old_barb: 5508,
  vi_5465_ram_rune: 5465,
  vi_5500_goat_s_tuft: 5500,
  vi_5499_froggy_neckband: 5499,
  vi_5507_balloony_beads: 5507,
  vi_5485_chicken_charm: 5485,
  vi_5502_cat_chime: 5502,
  vi_5504_turkey_wattle_necklace: 5504,
  vi_5506_crow_s_beak: 5506,
  vi_5503_dog_collar: 5503,
  vi_5534_fairy_choker: 5534,
  vi_5484_cow_bell: 5484,
  vi_5501_old_companion_locket: 5501,
  vi_5509_vampire_pendant: 5509,
  vi_5505_mean_goblin_s_spikes: 5505,
  vi_5525_cursed_piper_flute: 5525,
};

// 原版文案查询门面。1:1 对照 Terarria1456/Terraria/Lang.cs 的便捷方法,
// 核心在 LanguageManager.ts(对照 LanguageManager.cs)。
//
// 数据 = public/l10n/<culture>.json(scripts/build-l10n.mjs 构建,扁平
// { [category]: { [key]: value } },全键 = category + '.' + key,已做英文兜底 overlay)。
// 例:Lang.text('UI.Play')、Lang.text('ItemName.HealingPotion')、Lang.text('LegacyWorldGen.9')
import { languageManager } from './LanguageManager';
import { ITEM_KEY_TO_ID, ITEM_NAME_BY_ID, NPC_NAME_BY_ID, BUFF_NAME_BY_ID, PROJECTILE_NAME_BY_ID, TILE_NAME_BY_ID, TILE_NAME_ITEM_BY_SHEET } from './idNames.generated';
import { ITEM_BY_KEY, ITEM_DEFS } from '../data/items';
import { worldgenProgressKey } from './worldgenKeys';

export const Lang = {
  get loaded(): boolean { return languageManager.loaded; },
  /** 语言列表(设置面板数据源,来自 l10n/index.json) */
  get cultures() { return languageManager.cultures; },
  get activeCultureName(): string | null { return languageManager.activeCulture?.name ?? null; },
  get onChange() { return (fn: () => void) => languageManager.onChange(fn); },

  /** 启动初始化(默认 zh-Hans);load() 为旧签名兼容 */
  init(lang?: string | number): Promise<boolean> { return languageManager.init(lang); },
  async load(): Promise<boolean> { return Lang.init(); },

  /** 切换语言并广播(onLanguageChanged);失败返回 false 不改变状态 */
  setLanguage(culture: string | number): Promise<boolean> { return languageManager.setLanguage(culture); },

  /** 点路径取文案(全键 = category.key)。支持 {0}/{1} 占位符。缺失回退 key 本身并 warn 一次 */
  text(path: string, ...args: (string | number)[]): string {
    return languageManager.getTextValue(path, ...args);
  },

  has(path: string): boolean { return languageManager.exists(path); },

  // ---- Legacy 数组等价物(Lang.cs:475-551 InitializeLegacyLocalization)----
  /** gen[i] → LegacyWorldGen.i */
  gen(i: number): string { return languageManager.getTextValue(`LegacyWorldGen.${i}`); },
  /** menu[j] → LegacyMenu.j */
  menu(j: number): string { return languageManager.getTextValue(`LegacyMenu.${j}`); },
  /** inter[k] → LegacyInterface.k */
  inter(k: number): string { return languageManager.getTextValue(`LegacyInterface.${k}`); },
  /** misc[l] → LegacyMisc.l */
  misc(l: number): string { return languageManager.getTextValue(`LegacyMisc.${l}`); },

  /** 世界生成进度文案:pass 名 → LegacyWorldGen 条目(worldgenKeys 映射) */
  worldgenText(passKey: string): string {
    const legacyKey = worldgenProgressKey[passKey];
    return legacyKey != null ? Lang.text(`LegacyWorldGen.${legacyKey}`) : passKey;
  },

  /** Language.RandomFromCategory 便捷门面：类别内等概率随机一条。缺失返回 fallback */
  randomFrom(path: string, fallback = ''): string {
    return languageManager.randomFromCategory(path) ?? fallback;
  },

  // ---- 名字类便捷方法(Lang.cs FillNameCacheArray:键 = category + ID 常量名)----

  /** 物品名(原版 id)。缺失回退 null */
  itemName(id: number): string | null {
    const internal = ITEM_NAME_BY_ID[id];
    return internal && Lang.has(`ItemName.${internal}`) ? Lang.text(`ItemName.${internal}`) : null;
  },

  /** 物品名(本仓库 item key)。解析链：
   *  ① vi_<id>_ 前缀/ITEM_KEY_TO_ID → 原版 ItemName（12 语言官方译文）
   *  ② Mods.SandboxWorld.ItemName.<PascalKey>（l10n-custom 自有物品——原版不存在的发明物）
   *  ③ ItemDef.name 硬编码兜底 */
  itemNameByKey(key: string): string {
    const vi = key.match(/^vi_(\d+)_/);
    const id = vi ? Number(vi[1]) : ITEM_KEY_TO_ID[key];
    if (id != null) {
      const n = Lang.itemName(id);
      if (n) return n;
    }
    const custom = `Mods.SandboxWorld.ItemName.${key.replace(/(^|_)([a-z0-9])/g, (_, p, c) => (p ? c.toUpperCase() : c.toUpperCase()))}`;
    if (Lang.has(custom)) return Lang.text(custom);
    return ITEM_DEFS[ITEM_BY_KEY[key]]?.name ?? key;
  },

  /**
   * NPC 名(原版 netID,Lang.cs:175 GetNPCName)。
   * 正 id → NPCName.<Internal>;负 id(变种史莱姆)暂按 -netId 正查近似——
   * 原版 65 条 _negativeNpcNameCache 硬表(Lang.cs:520-535)待 NPC 变种移植时补全。
   */
  npcName(netId: number): string | null {
    const id = netId > 0 ? netId : -netId;
    const internal = NPC_NAME_BY_ID[id];
    return internal && Lang.has(`NPCName.${internal}`) ? Lang.text(`NPCName.${internal}`) : null;
  },

  /** Buff 名(Lang.cs:236 GetBuffName;BuffName 在 Game 分片) */
  buffName(id: number): string | null {
    const internal = BUFF_NAME_BY_ID[id];
    return internal && Lang.has(`BuffName.${internal}`) ? Lang.text(`BuffName.${internal}`) : null;
  },

  /** Buff 描述(Lang.cs:241 GetBuffDescription;BuffDescription 跨 Game/Items 分片) */
  buffDesc(id: number): string | null {
    const internal = BUFF_NAME_BY_ID[id];
    return internal && Lang.has(`BuffDescription.${internal}`) ? Lang.text(`BuffDescription.${internal}`) : null;
  },

  /** 投射物名(Lang.cs:444 GetProjectileName;ProjectileName 在 Projectiles 分片) */
  projectileName(id: number): string | null {
    const internal = PROJECTILE_NAME_BY_ID[id];
    return internal && Lang.has(`ProjectileName.${internal}`) ? Lang.text(`ProjectileName.${internal}`) : null;
  },

  /**
   * 图块名。解析链(1.4.4+ 原版语义:方块无独立显示名——Tiles 分节为空)：
   * ① 放置它的物品名(TILE_NAME_ITEM_BY_SHEET:Item.createTile 反查,取基础款最小 id；
   *    如 tile14 表 → 木桌 WoodenTable)——官方译名权威来源
   * ② MapObject 族名(Lang.cs:77 GetMapObjectName 系,仅 79 键,族级泛称如"桌子")
   * ③ null(调用方回退 TILE_DEFS[].name)
   */
  tileName(id: number): string | null {
    const placer = TILE_NAME_ITEM_BY_SHEET[id];
    if (placer !== undefined) {
      const n = Lang.itemName(placer);
      if (n) return n;
    }
    const internal = TILE_NAME_BY_ID[id];
    return internal && Lang.has(`MapObject.${internal}`) ? Lang.text(`MapObject.${internal}`) : null;
  },

  /** 类别内取模循环取值(原版 IndexedFromCategory) */
  indexedFromCategory(category: string, index: number): string | null {
    return languageManager.indexedFromCategory(category, index);
  },

  /** 类别内随机(原版 RandomFromCategory,如小贴士 LoadingTips_Default) */
  randomFromCategory(category: string, rng?: () => number): string | null {
    return languageManager.randomFromCategory(category, rng);
  },
};

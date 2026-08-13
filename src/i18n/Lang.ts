// 原版文案查询门面。1:1 对照 Terarria1456/Terraria/Lang.cs 的便捷方法,
// 核心在 LanguageManager.ts(对照 LanguageManager.cs)。
//
// 数据 = public/l10n/<culture>.json(scripts/build-l10n.mjs 构建,扁平
// { [category]: { [key]: value } },全键 = category + '.' + key,已做英文兜底 overlay)。
// 例:Lang.text('UI.Play')、Lang.text('ItemName.HealingPotion')、Lang.text('LegacyWorldGen.9')
import { languageManager } from './LanguageManager';
import { ITEM_KEY_TO_ID, ITEM_NAME_BY_ID, NPC_NAME_BY_ID, BUFF_NAME_BY_ID, PROJECTILE_NAME_BY_ID, TILE_NAME_BY_ID, TILE_NAME_ITEM_BY_SHEET, TILE_NAME_ZH_BY_ID, TILE_NAME_EN_BY_ID, ITEM_NAME_ZH_BY_ID, ITEM_NAME_EN_BY_ID, WALL_NAME_ITEM_BY_WALL, WALL_NAME_ZH_BY_ID, WALL_NAME_EN_BY_ID } from './idNames.generated';
import { ITEM_BY_KEY, ITEM_DEFS } from '../data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import { worldgenProgressKey, worldgenProgressStringKey } from './worldgenKeys';

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

  /** Main.ValueToCoins（Main.cs:54649-54689 1:1）：铜币总值 →
   *  "N 铂金 N 金 N 银 N 铜"（非零档空格拼接，Currency.* 文案 toLowerCase，
   *  去尾空格；0 → 空串）。死亡掉钱行（Game.DroppedCoins {0}）与价格显示用 */
  valueToCoins(value: number): string {
    let rest = Math.max(0, Math.floor(value));
    let plat = 0, gold = 0, silver = 0;
    while (rest >= 1000000) { rest -= 1000000; plat++; }
    while (rest >= 10000) { rest -= 10000; gold++; }
    while (rest >= 100) { rest -= 100; silver++; }
    const copper = rest;
    let text = '';
    if (plat > 0) text += `${plat} ${Lang.text('Currency.Platinum').toLowerCase()} `;
    if (gold > 0) text += `${gold} ${Lang.text('Currency.Gold').toLowerCase()} `;
    if (silver > 0) text += `${silver} ${Lang.text('Currency.Silver').toLowerCase()} `;
    if (copper > 0) text += `${copper} ${Lang.text('Currency.Copper').toLowerCase()} `;
    if (text.length > 0) text = text.slice(0, -1);
    return text;
  },

  has(path: string): boolean { return languageManager.exists(path); },

  /** 聊天池随机一条（XxxChatter 类目；原版 Language.SelectRandom(Lang.CreateDialogFilter)） */
  chatter(category: string): string | null { return languageManager.randomFromCategory(category); },

  /** CreateDialogFilter 前缀随机（NPC.HasSpecialEventText 的 "XxxSpecialText.Yyy" 族；
   *  原版 Language.SelectRandom(Lang.CreateDialogFilter(prefix))，Lang.cs:425-428） */
  specialText(prefix: string): string | null { return languageManager.randomFromPrefix(prefix); },

  // ---- Legacy 数组等价物(Lang.cs:475-551 InitializeLegacyLocalization)----
  /** gen[i] → LegacyWorldGen.i */
  gen(i: number): string { return languageManager.getTextValue(`LegacyWorldGen.${i}`); },
  /** menu[j] → LegacyMenu.j */
  menu(j: number): string { return languageManager.getTextValue(`LegacyMenu.${j}`); },
  /** inter[k] → LegacyInterface.k */
  inter(k: number): string { return languageManager.getTextValue(`LegacyInterface.${k}`); },
  /** misc[l] → LegacyMisc.l */
  misc(l: number): string { return languageManager.getTextValue(`LegacyMisc.${l}`); },

  /** 世界生成进度文案:pass 名 → 原版条目(worldgenKeys 映射;数字=LegacyWorldGen.N,
   *  字符串=完整 l10n 键如 WorldGeneration.Oasis;无映射回退 pass 名原文) */
  worldgenText(passKey: string): string {
    const strKey = worldgenProgressStringKey[passKey];
    if (strKey) return Lang.text(strKey);
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
   *  ①.5 place_v_* → 其放置的 tile sheet → Lang.tileName（放置物品无独立名，
   *      原版语义=方块名，如 place_v_144_timers → 1秒计时器）
   *  ② Mods.SandboxWorld.ItemName.<PascalKey>（l10n-custom 自有物品——原版不存在的发明物）
   *  ③ ItemDef.name 硬编码兜底 */
  itemNameByKey(key: string): string {
    const vi = key.match(/^vi_(\d+)_/);
    const id = vi ? Number(vi[1]) : ITEM_KEY_TO_ID[key];
    if (id != null) {
      const n = Lang.itemName(id);
      if (n) return n;
      // id-maps 兜底（l10n 缺译的少数 id；zh 系取 zh 其余取 en）
      const isZh = (languageManager.activeCulture?.name ?? '').startsWith('zh');
      const fb = isZh ? ITEM_NAME_ZH_BY_ID[id] : ITEM_NAME_EN_BY_ID[id];
      if (fb) return fb;
    }
    if (key.startsWith('place_v_')) {
      const tileKey = ITEM_DEFS[ITEM_BY_KEY[key]]?.tile;
      const sheet = tileKey !== undefined ? TILE_DEFS[TILE_BY_KEY[tileKey]]?.vanilla?.sheet : undefined;
      if (sheet !== undefined) {
        const n = Lang.tileName(sheet);
        if (n) return n;
      }
    }
    const custom = `Mods.SandboxWorld.ItemName.${key.replace(/(^|_)([a-z0-9])/g, (_, p, c) => (p ? c.toUpperCase() : c.toUpperCase()))}`;
    if (Lang.has(custom)) return Lang.text(custom);
    return ITEM_DEFS[ITEM_BY_KEY[key]]?.name || key;
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
   *    如 tile14 表 → 木桌 WoodenTable)——12 语言官方译名权威来源
   * ② MapObject 族名(Lang.cs:77 GetMapObjectName 系,仅 79 键,族级泛称如"桌子")
   * ③ id-maps 方块名(TILE_NAME_ZH/EN_BY_ID：世界生成专属块——树/藤蔓/药草等
   *    无放置物品且 MapObject 缺失；原版对它们无 UI 显示名,此为唯一译名来源。
   *    zh 系语言取 zh,其余语言取 en)
   * ④ null(调用方回退 TILE_DEFS[].name)
   */
  tileName(id: number): string | null {
    const placer = TILE_NAME_ITEM_BY_SHEET[id];
    if (placer !== undefined) {
      const n = Lang.itemName(Number(placer));
      if (n) return n;
    }
    const internal = TILE_NAME_BY_ID[id];
    if (internal && Lang.has(`MapObject.${internal}`)) return Lang.text(`MapObject.${internal}`);
    const isZh = (languageManager.activeCulture?.name ?? '').startsWith('zh');
    const fallback = isZh ? TILE_NAME_ZH_BY_ID[id] : TILE_NAME_EN_BY_ID[id];
    return fallback ?? null;
  },

  /**
   * 墙名。与 tileName 同构（原版墙无独立显示名）：
   * ① 放置它的物品名（WALL_NAME_ITEM_BY_WALL：Item.createWall 反查，取最小 id）
   * ② id-maps walls 的 zh/en（自然墙无放置物品——泥土墙/石墙等）
   * ③ null（调用方回退 WALL_DEFS[].name）
   */
  wallName(id: number): string | null {
    const placer = WALL_NAME_ITEM_BY_WALL[id];
    if (placer !== undefined) {
      const n = Lang.itemName(Number(placer));
      if (n) return n;
    }
    const isZh = (languageManager.activeCulture?.name ?? '').startsWith('zh');
    return (isZh ? WALL_NAME_ZH_BY_ID[id] : WALL_NAME_EN_BY_ID[id]) ?? null;
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

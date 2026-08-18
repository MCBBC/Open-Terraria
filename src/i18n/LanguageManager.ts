// 语言包运行时核心。1:1 对照 Terarria1456/Terraria.Localization/LanguageManager.cs。
//
// 与原版的差异(有意为之,构建管线 scripts/build-l10n.mjs 已承担):
// - 原版 ReloadLanguage(L102)的"值重置为 key → 加载 en-US → 加载目标语言"回退,
//   在构建期完成(目标语言包已按 en 基线 overlay 缺失键),运行时单文件单请求。
// - {$Key} 跨键复制(L158)与 {?Cond} 条件标记也已构建期处理。
// - 本文件保留 loadPackJson 顺序加载语义(测试可连续注入模拟原版双载)。

import { DEFAULT_CULTURE_NAME, GameCulture, normalizeLang } from './GameCulture';

type Pack = Record<string, Record<string, string>>; // { [category]: { [key]: value } }

export interface LangCultureInfo {
  name: string;
  legacyId: number;
  displayNameKey: string;
}

/** 语言包数据表 + 类别索引(共用 full key 字符串引用,不复制内存) */
interface LoadedPack {
  texts: Map<string, string>;                  // full key = category + '.' + key
  groupedKeys: Map<string, string[]>;          // category → full keys(保插入序)
  variations: Map<string, Map<string, string>>; // base key → { variant: value }(LanguageManager.cs:300)
}

const MAX_PACK_CACHE = 2; // LRU 上限(性能审计:语言包 ~1MB/份,不无限缓存)

// ===================== 全局替换表（Lang.cs:86-160 RegisterGlobalSubstitution）=====================
// 原版 GetTextValue → LocalizedText.Format 对 {Token} 逐个查 _globalSubstitutions。
// 键盘档键位名（本作无手柄；PlayerInput.cs:1880+ 默认键盘绑定 + GenerateInputTag
// → LocalizeKey：仅 Mouse1/Mouse2 走 Controls.*，其余按绑定名展示；键盘未绑
// 触发器（LockOn/Radial*/Hotbar±）GenerateRawInputList 空列表 → 空串）：
//   MouseRight=Mouse2 → Controls.RightClick、MouseLeft=Mouse1 → Controls.LeftClick、
//   SmartCursor=LeftControl → Controls.Control、SmartSelect=LeftShift → Controls.Shift、
//   Grapple/QuickEquip=E、QuickMount=R（UI.BuildFromInventory 同 QuickMount）、
//   Trash=Controls.Shift、FavoriteItem=Alt。
// NPC 名替换（:102-110）：{Nurse}/{Merchant}/... → 场上第一名该类型城镇 NPC 的
// 随机名——经 setNpcNameResolver 注入实体桶访问；缺位/无该 NPC 保留 token（原版
// GetFirstNPCNameOrNull → null 不替换语义）。
let npcNameResolver: ((npcType: number) => string | null) | null = null;
/** 动态值注入器（Lang.cs:124-144 的 Main.* / Player.* 读取——由 Game 活取） */
export interface GlobalSubstitutionContext {
  worldName: () => string;
  playerName: () => string;
  /** Main.cInv（Inventory 键位名,键盘默认 Escape） */
  inventoryKey: () => string;
  /** Player.anglerQuestsFinished */
  anglerQuests: () => number;
  /** Player.numberOfDeathsPVE */
  totalDeaths: () => number;
  /** WorldGen.crimson（false=黑檀石 Ebonstone / true=猩红石 Crimstone） */
  crimson: () => boolean;
  /** Main.ReversedUpDownArmorSetBonuses（false=Key.DOWN / true=Key.UP） */
  reversedArmorBonusKey: () => boolean;
}
let subCtx: GlobalSubstitutionContext | null = null;

/** Game.afterWorldLoad 注入（闭包活取,幂等） */
export function setGlobalSubstitutionContext(ctx: GlobalSubstitutionContext): void {
  subCtx = ctx;
}

interface LangTextSource {
  getText(key: string): string;
  getTextValue(key: string, ...args: (string | number)[]): string;
}

/** Game 侧注入（afterWorldLoad 后每帧或事件驱动重设均可；幂等） */
export function setNpcNameResolver(fn: (npcType: number) => string | null): void {
  npcNameResolver = fn;
}

function buildGlobalSubstitutions(lang: LangTextSource): Map<string, () => string | null> {
  const m = new Map<string, () => string | null>();
  const k = (code: string) => () => code;                     // 原样键名（E/R 等）
  const l = (key: string) => () => lang.getTextValue(key);    // Controls.* 本地化键名
  // 键位（Lang.cs:146-160，键盘分支）
  m.set('InputTrigger_ToggleOrOpen', l('Controls.RightClick'));
  m.set('InputTrigger_InteractWithTile', l('Controls.RightClick'));
  m.set('InputTrigger_InteractWithTileUI', l('Controls.RightClick'));
  m.set('InputTrigger_UseOrAttack', l('Controls.LeftClick'));
  m.set('InputTrigger_SmartCursor', l('Controls.Control'));
  m.set('InputTrigger_Grapple', k('E'));
  m.set('InputTrigger_QuickEquip', k('E'));
  m.set('InputTrigger_SmartSelect', l('Controls.Shift'));
  m.set('InputTrigger_LockOn', k(''));
  m.set('InputTrigger_RadialQuickbar', k(''));
  m.set('InputTrigger_RadialHotbar', k(''));
  m.set('InputTriggerUI_BuildFromInventory', k('R'));
  m.set('InputTriggerUI_FavoriteItem', k('Alt'));
  m.set('InputTriggerUI_Trash', l('Controls.Shift'));
  // NPC 名（Lang.cs:101-125 全 23 名——GetFirstNPCNameOrNull,缺位 null 保留 token）
  const npc = (type: number) => () => npcNameResolver?.(type) ?? null;
  m.set('Nurse', npc(18)); m.set('Merchant', npc(17)); m.set('ArmsDealer', npc(19));
  m.set('Dryad', npc(20)); m.set('Demolitionist', npc(38)); m.set('Clothier', npc(54));
  m.set('Guide', npc(22)); m.set('Wizard', npc(108)); m.set('GoblinTinkerer', npc(107));
  m.set('Mechanic', npc(124)); m.set('Truffle', npc(160)); m.set('Steampunker', npc(178));
  m.set('DyeTrader', npc(207)); m.set('PartyGirl', npc(208)); m.set('Cyborg', npc(209));
  m.set('Painter', npc(227)); m.set('WitchDoctor', npc(228)); m.set('Pirate', npc(229));
  m.set('Stylist', npc(353)); m.set('TravelingMerchant', npc(368)); m.set('Angler', npc(369));
  m.set('Bartender', npc(550)); m.set('GolfGuy', npc(588)); m.set('TaxCollector', npc(441));
  // 动态值（Lang.cs:126-144）——注入器缺位保留 token（null 语义同 NPC 名）
  const dyn = (fn: () => string | number | boolean | null) => () => {
    const v = subCtx ? fn() : null;
    return v === null || v === undefined ? null : String(v);
  };
  m.set('WorldName', dyn(() => subCtx!.worldName()));
  m.set('PlayerName', dyn(() => subCtx!.playerName()));
  m.set('InventoryKey', dyn(() => subCtx!.inventoryKey()));
  m.set('AnglerCompletedQuestsCount', dyn(() => subCtx!.anglerQuests()));
  m.set('TotalDeathsCount', dyn(() => subCtx!.totalDeaths()));
  // WorldEvilStone（:142-143）: Misc.Ebonstone / Misc.Crimstone
  m.set('WorldEvilStone', () => lang.getTextValue(subCtx?.crimson() ? 'Misc.Crimstone' : 'Misc.Ebonstone'));
  // ToggleArmorSetBonusKey（:161）: Key.DOWN（默认）/ Key.UP（ReversedUpDown 选项）
  m.set('ToggleArmorSetBonusKey', () => lang.getTextValue(subCtx?.reversedArmorBonusKey() ? 'Key.UP' : 'Key.DOWN'));
  return m;
}

const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

let substitutionTable: Map<string, () => string | null> | null = null;

/** LocalizedText.Format 的 {Token} 段：注册表内替换（null=保留原文 token），
 *  未注册 token 原样保留（与原版一致——{0} 数字位已被上一段消化）。
 *  表惰性建一次（closure 捕获单例 lang，NPC 名经 resolver 活取） */
function applyGlobalSubstitutions(s: string, lang: LangTextSource): string {
  if (s.indexOf('{') < 0) return s;   // 快路径
  if (!substitutionTable) substitutionTable = buildGlobalSubstitutions(lang);
  return s.replace(TOKEN_RE, (whole, tok: string) => {
    const gen = substitutionTable!.get(tok);
    if (!gen) return whole;
    const v = gen();
    return v === null ? whole : v;
  });
}

function buildTables(pack: Pack): LoadedPack {
  const texts = new Map<string, string>();
  const groupedKeys = new Map<string, string[]>();
  const variations = new Map<string, Map<string, string>>();
  for (const [cat, entries] of Object.entries(pack)) {
    const list: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
      // 旧坏包自愈(NeedTempleKey 裸键事故):{"整键":{"":"文本"}} 假类别按类别名登记,
      // 拿到对象值不丢文案(正确包恒 string,本分支恒不触发;构建期闸门另守)
      if (value !== null && typeof value === 'object' && typeof (value as Record<string, unknown>)[''] === 'string') {
        texts.set(cat, (value as Record<string, string>)['']);
        list.push(cat);
        continue;
      }
      const fullKey = `${cat}.${key}`;
      // $ 变体键(如 ItemName.Chair$Gender)入变体表,不进正文(LanguageManager.cs:303-317)
      const dollar = key.indexOf('$');
      if (dollar > 0) {
        const base = `${cat}.${key.slice(0, dollar)}`;
        let variants = variations.get(base);
        if (!variants) { variants = new Map(); variations.set(base, variants); }
        variants.set(key.slice(dollar + 1), value);
        continue;
      }
      texts.set(fullKey, value);
      list.push(fullKey);
    }
    groupedKeys.set(cat, list);
  }
  return { texts, groupedKeys, variations };
}

class LanguageManager {
  activeCulture: LangCultureInfo | null = null;
  cultures: LangCultureInfo[] = [];            // 来自 public/l10n/index.json(设置面板数据源)
  private pack: LoadedPack = { texts: new Map(), groupedKeys: new Map(), variations: new Map() };
  private packCache = new Map<string, LoadedPack>(); // name → LoadedPack,Map 序即 LRU 序
  private listeners: Array<() => void> = [];
  private warned = new Set<string>();
  loaded = false;

  /**
   * 启动初始化:加载语言列表 + 当前语言包。
   * lang 未指定时用 DEFAULT_LANG(zh-Hans);非法值归一到 en-US。
   */
  async init(lang?: string | number): Promise<boolean> {
    await this.loadIndex();
    return this.setLanguage(lang ?? 'zh-Hans');
  }

  private async loadIndex() {
    if (this.cultures.length) return;
    try {
      const r = await fetch('l10n/index.json');
      if (r.ok) this.cultures = await r.json();
    } catch { /* 列表缺失时仍可用 GameCulture 静态表 */
      if (!this.cultures.length) {
        const { CULTURES } = await import('./GameCulture');
        this.cultures = CULTURES;
      }
    }
  }

  /** 切换语言(culture 对象 | culture 名 | legacyId;LanguageManager.cs:54/60/92) */
  async setLanguage(culture: LangCultureInfo | string | number): Promise<boolean> {
    const name = typeof culture === 'object' ? culture.name : normalizeLang(culture);
    if (this.activeCulture?.name === name && this.loaded) return true;
    const tables = await this.fetchPack(name);
    if (!tables) return false;
    this.pack = tables;
    this.activeCulture = this.cultures.find((c) => c.name === name) ?? { name, legacyId: 0, displayNameKey: '' };
    this.loaded = true;
    this.warned.clear();
    this.emit();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('sw:langchange'));
    return true;
  }

  private async fetchPack(name: string): Promise<LoadedPack | null> {
    const cached = this.packCache.get(name);
    if (cached) {
      this.packCache.delete(name);
      this.packCache.set(name, cached); // 刷新 LRU 序
      return cached;
    }
    try {
      const r = await fetch(`l10n/${name}.json`);
      if (!r.ok) return null;
      const pack = (await r.json()) as Pack;
      const tables = buildTables(pack);
      this.packCache.set(name, tables);
      while (this.packCache.size > MAX_PACK_CACHE) {
        const oldest = this.packCache.keys().next().value as string;
        if (oldest === name) break;
        this.packCache.delete(oldest);
      }
      return tables;
    } catch {
      return null;
    }
  }

  /** 测试注入入口(对标 LoadLanguageFromFileTextJson:可连续调用模拟原版顺序加载覆盖) */
  loadPackJson(pack: Pack) {
    for (const [cat, entries] of Object.entries(pack)) {
      const list = this.pack.groupedKeys.get(cat) ?? [];
      for (const [key, value] of Object.entries(entries)) {
        const fullKey = `${cat}.${key}`;
        const dollar = key.indexOf('$');
        if (dollar > 0) {
          const base = `${cat}.${key.slice(0, dollar)}`;
          let variants = this.pack.variations.get(base);
          if (!variants) { variants = new Map(); this.pack.variations.set(base, variants); }
          variants.set(key.slice(dollar + 1), value);
          continue;
        }
        if (!this.pack.texts.has(fullKey)) list.push(fullKey);
        this.pack.texts.set(fullKey, value);
      }
      this.pack.groupedKeys.set(cat, list);
    }
  }

  /** 重置为测试初始态(含 pack 缓存;全局替换表注入器/缓存一并清) */
  resetForTest() {
    this.pack = { texts: new Map(), groupedKeys: new Map(), variations: new Map() };
    this.activeCulture = null;
    this.loaded = false;
    this.warned.clear();
    this.packCache.clear();
    npcNameResolver = null;
    subCtx = null;
    substitutionTable = null;
  }

  exists(key: string): boolean {
    return this.pack.texts.has(key);
  }

  /** 取原文(不做 {0} 参数替换)。缺失返回 key 本身(LanguageManager.cs:446-453) */
  getText(key: string): string {
    const v = this.pack.texts.get(key);
    if (v === undefined) {
      if (!this.warned.has(key)) { this.warned.add(key); console.warn(`[Lang] 缺失 key: ${key}`); }
      return key;
    }
    return v;
  }

  /** 取文案并做 {0}/{1} 位置参数替换 + **全局替换表**（LanguageManager.cs:455-498
   *  GetTextValue → LocalizedText.Format：先位置参数后 {Token} 全局替换——
   *  Lang.cs:102-110 NPC 名 / :146-160 InputTrigger 键位名，此前未移植导致
   *  171 条 ItemTooltip 裸显 "{InputTrigger_ToggleOrOpen} to open打开"） */
  getTextValue(key: string, ...args: (string | number)[]): string {
    let s = this.getText(key);
    for (let i = 0; i < args.length; i++) s = s.split(`{${i}}`).join(String(args[i]));
    return applyGlobalSubstitutions(s, this);
  }

  /** $ 变体查询(对标 TryGetVariation,LanguageManager.cs:509) */
  tryGetVariation(baseKey: string, variant: string): string | null {
    return this.pack.variations.get(baseKey)?.get(variant) ?? null;
  }

  /** 类别内取模循环取值(对标 IndexedFromCategory,LanguageManager.cs:431) */
  indexedFromCategory(category: string, index: number): string | null {
    const list = this.pack.groupedKeys.get(category);
    if (!list || !list.length) return null;
    const i = ((index % list.length) + list.length) % list.length;
    return this.pack.texts.get(list[i]) ?? null;
  }

  /** 类别内随机(对标 RandomFromCategory,LanguageManager.cs:422) */
  randomFromCategory(category: string, rng: () => number = Math.random): string | null {
    const list = this.pack.groupedKeys.get(category);
    if (!list || !list.length) return null;
    return this.pack.texts.get(list[Math.floor(rng() * list.length)]) ?? null;
  }

  /** Lang.CreateDialogFilter(startsWith)（Lang.cs:425-428）+ Language.SelectRandom：
   *  类目内全键前缀匹配后随机一条（NPC.HasSpecialEventText 的
   *  "XxxSpecialText.Yyy" 族——键形如 MerchantSpecialText.Rain1/Rain2） */
  randomFromPrefix(prefix: string, rng: () => number = Math.random): string | null {
    const dot = prefix.indexOf('.');
    if (dot <= 0) return null;
    const list = this.pack.groupedKeys.get(prefix.slice(0, dot));
    if (!list || !list.length) return null;
    const hits = list.filter((k) => k.startsWith(prefix));
    if (!hits.length) return null;
    return this.pack.texts.get(hits[Math.floor(rng() * hits.length)]) ?? null;
  }

  categorySize(category: string): number {
    return this.pack.groupedKeys.get(category)?.length ?? 0;
  }

  /** OnLanguageChanged(LanguageManager.cs:38)。返回退订函数 */
  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export const languageManager = new LanguageManager();
export { DEFAULT_CULTURE_NAME };
export type { GameCulture };

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

function buildTables(pack: Pack): LoadedPack {
  const texts = new Map<string, string>();
  const groupedKeys = new Map<string, string[]>();
  const variations = new Map<string, Map<string, string>>();
  for (const [cat, entries] of Object.entries(pack)) {
    const list: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
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

  /** 重置为测试初始态(含 pack 缓存) */
  resetForTest() {
    this.pack = { texts: new Map(), groupedKeys: new Map(), variations: new Map() };
    this.activeCulture = null;
    this.loaded = false;
    this.warned.clear();
    this.packCache.clear();
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

  /** 取文案并做 {0}/{1} 位置参数替换(LanguageManager.cs:455-498 GetTextValue) */
  getTextValue(key: string, ...args: (string | number)[]): string {
    let s = this.getText(key);
    for (let i = 0; i < args.length; i++) s = s.split(`{${i}}`).join(String(args[i]));
    return s;
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

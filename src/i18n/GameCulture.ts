// 语言注册表。1:1 对照 Terarria1456/Terraria.Localization/GameCulture.cs:67-121。
// CultureName 枚举值 == LegacyId;DefaultCulture = en-US(GameCulture.cs:120)。
// 与 public/l10n/index.json 同源(scripts/build-l10n.mjs 的 CULTURES 表)。

export interface GameCulture {
  name: string;          // culture 名(= 文件名/设置持久化值)
  legacyId: number;      // LegacyId,1-12(GameCulture.cs:9-24)
  displayNameKey: string; // 显示名键(各语言包 Language 类别自带本地化名)
}

export const CULTURES: GameCulture[] = [
  { name: 'en-US', legacyId: 1, displayNameKey: 'Language.English' },
  { name: 'de-DE', legacyId: 2, displayNameKey: 'Language.German' },
  { name: 'it-IT', legacyId: 3, displayNameKey: 'Language.Italian' },
  { name: 'fr-FR', legacyId: 4, displayNameKey: 'Language.French' },
  { name: 'es-ES', legacyId: 5, displayNameKey: 'Language.Spanish' },
  { name: 'ru-RU', legacyId: 6, displayNameKey: 'Language.Russian' },
  { name: 'zh-Hans', legacyId: 7, displayNameKey: 'Language.Chinese' },
  { name: 'pt-BR', legacyId: 8, displayNameKey: 'Language.Portuguese' },
  { name: 'pl-PL', legacyId: 9, displayNameKey: 'Language.Polish' },
  { name: 'ja-JP', legacyId: 10, displayNameKey: 'Language.Japanese' },
  { name: 'ko-KR', legacyId: 11, displayNameKey: 'Language.Korean' },
  { name: 'zh-Hant', legacyId: 12, displayNameKey: 'Language.ChineseTraditional' },
];

export const DEFAULT_CULTURE_NAME = 'en-US';   // 兜底 culture(GameCulture.cs:120)
export const DEFAULT_LANG = 'zh-Hans';          // 本项目默认语言(用户约定)

const byName = new Map(CULTURES.map((c) => [c.name, c]));
const byId = new Map(CULTURES.map((c) => [c.legacyId, c]));

/** 按 culture 名查找;查无返回 null(调用方落 DEFAULT) */
export function fromName(name: string): GameCulture | null {
  return byName.get(name) ?? null;
}

/** 按 LegacyId 查找(GameCulture.cs:49-54:id<1 钳到 1,查不到返回 Default) */
export function fromLegacyId(id: number): GameCulture {
  if (id < 1) id = 1;
  return byId.get(id) ?? byName.get(DEFAULT_CULTURE_NAME)!;
}

/** 持久化值归一化:数字 legacyId → culture 名(对齐原版 config.json 兼容旧数字) */
export function normalizeLang(value: string | number | undefined): string {
  if (typeof value === 'number') return fromLegacyId(value).name;
  if (!value) return DEFAULT_LANG;
  return byName.has(value) ? value : DEFAULT_CULTURE_NAME;
}

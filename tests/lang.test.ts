// LanguageManager 核心语义单测(对标 Terarria1456/Terraria.Localization/LanguageManager.cs)。
import { describe, it, expect, beforeEach } from 'vitest';
import { languageManager } from '../src/i18n/LanguageManager';
import { fromLegacyId, fromName, normalizeLang, DEFAULT_LANG, CULTURES } from '../src/i18n/GameCulture';

describe('GameCulture(GameCulture.cs:67-121)', () => {
  it('12 culture 注册,LegacyId 1-12 与枚举一致', () => {
    expect(CULTURES).toHaveLength(12);
    expect(CULTURES.map((c) => c.legacyId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(CULTURES.find((c) => c.name === 'zh-Hans')!.legacyId).toBe(7);
  });

  it('FromLegacyId:id<1 钳到 1,未知落 en-US(GameCulture.cs:49-54)', () => {
    expect(fromLegacyId(0).name).toBe('en-US');
    expect(fromLegacyId(-3).name).toBe('en-US');
    expect(fromLegacyId(999).name).toBe('en-US');
    expect(fromLegacyId(7).name).toBe('zh-Hans');
  });

  it('FromName 查无返回 null;normalizeLang 未知值落 en-US', () => {
    expect(fromName('zh-Hans')!.displayNameKey).toBe('Language.Chinese');
    expect(fromName('xx-XX')).toBeNull();
    expect(normalizeLang(undefined)).toBe(DEFAULT_LANG);
    expect(normalizeLang('xx-XX')).toBe('en-US');
    expect(normalizeLang(7)).toBe('zh-Hans'); // 旧数字兼容(对齐原版 config.json)
  });
});

describe('LanguageManager', () => {
  beforeEach(() => {
    languageManager.resetForTest();
  });

  it('loadPackJson 顺序加载覆盖:后载覆盖先载(原版 en→target 语义,LanguageManager.cs:102)', () => {
    languageManager.loadPackJson({ UI: { Play: 'Play' } });
    languageManager.loadPackJson({ UI: { Play: '开始游戏', New: '新建' } });
    expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
    expect(languageManager.getTextValue('UI.New')).toBe('新建');
  });

  it('缺失键返回 key 本身(LanguageManager.cs:446)', () => {
    languageManager.loadPackJson({ UI: { Play: '开始游戏' } });
    expect(languageManager.getTextValue('UI.NotExist')).toBe('UI.NotExist');
    expect(languageManager.exists('UI.NotExist')).toBe(false);
    expect(languageManager.exists('UI.Play')).toBe(true);
  });

  it('{0}/{1} 位置参数(GetTextValue,LanguageManager.cs:455)', () => {
    languageManager.loadPackJson({ UI: { Greet: '你好 {0},你有 {1} 个苹果' } });
    expect(languageManager.getTextValue('UI.Greet', '小明', 3)).toBe('你好 小明,你有 3 个苹果');
  });

  it('$ 变体键入变体表,不进正文(UpdateTextValue,LanguageManager.cs:303)', () => {
    languageManager.loadPackJson({ ItemName: { Chair: '椅子', 'Chair$Gender': '阴性' } });
    expect(languageManager.exists('ItemName.Chair')).toBe(true);
    expect(languageManager.getTextValue('ItemName.Chair')).toBe('椅子');
    expect(languageManager.tryGetVariation('ItemName.Chair', 'Gender')).toBe('阴性');
    expect(languageManager.tryGetVariation('ItemName.Chair', 'Nope')).toBeNull();
  });

  it('IndexedFromCategory 取模循环(LanguageManager.cs:431)', () => {
    languageManager.loadPackJson({ RandomWorldName_Noun: { '1': '森林', '2': '岛' } });
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', 0)).toBe('森林');
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', 2)).toBe('森林');
    expect(languageManager.indexedFromCategory('RandomWorldName_Noun', -1)).toBe('岛');
    expect(languageManager.indexedFromCategory('Empty', 0)).toBeNull();
  });

  it('RandomFromCategory 保类别内随机可命中', () => {
    languageManager.loadPackJson({ LoadingTips_Default: { '0': 'A', '1': 'B', '2': 'C' } });
    const seen = new Set<string>();
    let seed = 0.123;
    const rng = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 30; i++) seen.add(languageManager.randomFromCategory('LoadingTips_Default', rng)!);
    expect(seen.has('A')).toBe(true);
    expect(languageManager.categorySize('LoadingTips_Default')).toBe(3);
  });

  it('setLanguage:fetch 语言包 + 广播 OnLanguageChanged + 重复切换幂等(LanguageManager.cs:38/92)', async () => {
    const calls: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ UI: { Play: url.includes('zh-Hans') ? '开始游戏' : 'Play' } }) } as Response;
    }) as typeof fetch;
    try {
      const events: string[] = [];
      const off = languageManager.onChange(() => events.push('changed'));
      await languageManager.setLanguage('zh-Hans');
      expect(languageManager.activeCulture?.name).toBe('zh-Hans');
      expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
      expect(events).toEqual(['changed']);
      // 同语言重复切换:早退,不重复 fetch/广播
      events.length = 0;
      await languageManager.setLanguage('zh-Hans');
      expect(events).toEqual([]);
      // 退订后不再收
      off();
      await languageManager.setLanguage('en-US');
      expect(events).toEqual([]);
      expect(languageManager.getTextValue('UI.Play')).toBe('Play');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('缺失语言包返回 false 不改变当前状态', async () => {
    languageManager.loadPackJson({ UI: { Play: '开始游戏' } });
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as typeof fetch;
    try {
      const ok = await languageManager.setLanguage('en-US');
      expect(ok).toBe(false);
      expect(languageManager.getTextValue('UI.Play')).toBe('开始游戏');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

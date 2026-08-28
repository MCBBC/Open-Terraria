// 首访浏览器语言探测（GameCulture.detectBrowserLang，2026-08-28 用户要求）：
// navigator.languages 优先级逐个匹配 → 完整 culture 名直命中 / 中文区细分 /
// 主子标签映射；无命中 null（调用方落 DEFAULT_LANG）。设置面板显式选择后持久化
// （options.set('lang')），探测仅在持久化设置无 lang 键时生效。
import { describe, it, expect } from 'vitest';
import { detectBrowserLang } from '../src/i18n/GameCulture';

/** stub navigator（vitest 环境 jsdom 无 navigator.languages 写入口，直接换对象） */
function withNavigator(navs: string[] | undefined, language: string | undefined): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { languages: navs, language }, configurable: true, writable: true,
  });
}

describe('detectBrowserLang', () => {
  it('完整 culture 名直命中（大小写不敏感）', () => {
    withNavigator(['zh-Hans', 'en'], 'zh-Hans');
    expect(detectBrowserLang()).toBe('zh-Hans');
    withNavigator(['en-us'], 'en-us');
    expect(detectBrowserLang()).toBe('en-US');
  });

  it('主子标签映射 12 语言', () => {
    for (const [tag, want] of [
      ['en', 'en-US'], ['de-AT', 'de-DE'], ['it-IT', 'it-IT'], ['fr', 'fr-FR'],
      ['es-MX', 'es-ES'], ['ru', 'ru-RU'], ['pt-BR', 'pt-BR'], ['pl', 'pl-PL'],
      ['ja-JP', 'ja-JP'], ['ko-KR', 'ko-KR'],
    ] as const) {
      withNavigator([tag], tag);
      expect(detectBrowserLang()).toBe(want);
    }
  });

  it('中文区细分：大陆/裸 zh → 简体；TW/HK/Hant → 繁体', () => {
    withNavigator(['zh-CN'], 'zh-CN');
    expect(detectBrowserLang()).toBe('zh-Hans');
    withNavigator(['zh'], 'zh');
    expect(detectBrowserLang()).toBe('zh-Hans');
    withNavigator(['zh-TW'], 'zh-TW');
    expect(detectBrowserLang()).toBe('zh-Hant');
    withNavigator(['zh-HK'], 'zh-HK');
    expect(detectBrowserLang()).toBe('zh-Hant');
  });

  it('优先级：languages 列表顺序生效（zh 在前的英文系统 → 简体）', () => {
    withNavigator(['zh-CN', 'en-US'], 'en-US');
    expect(detectBrowserLang()).toBe('zh-Hans');
    withNavigator(['en-US', 'zh-CN'], 'en-US');
    expect(detectBrowserLang()).toBe('en-US');
  });

  it('未注册语言（如 fr 命中后回退链外语种）→ 逐个尝试到命中或 null', () => {
    withNavigator(['sv-SE', 'de-DE'], 'sv-SE');   // sv 未注册 → 落到 de
    expect(detectBrowserLang()).toBe('de-DE');
    withNavigator(['sv-SE'], 'sv-SE');
    expect(detectBrowserLang()).toBeNull();        // 全未注册 → null（调用方落缺省）
  });

  it('无 navigator（SSR）→ null', () => {
    const nav = globalThis.navigator;
    // @ts-expect-error 测试桩
    delete globalThis.navigator;
    expect(detectBrowserLang()).toBeNull();
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  });
});

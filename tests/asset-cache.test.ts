// SW 资产预载驱动器单测(2026-08-13):版本稳定性 + 优先级清单枚举 + 顺序。
import { describe, it, expect } from 'vitest';
import {
  fnv1a32, assetVersion, menuWarmUrls, worldWarmUrls, miscWarmUrls,
  soundsWarmUrls, musicWarmUrls, priorityPlan, initAssetCache, assetCacheState,
} from '../src/net/AssetCache';
import vanillaJson from '../public/sprites/vanilla.json';
import vanillaUiJson from '../public/sprites/vanilla-ui.json';
import assetsIndex from '../public/assets-index.json';

const UI_FILES = (vanillaUiJson as { files: Record<string, string> }).files;
const VANILLA = vanillaJson as Parameters<typeof worldWarmUrls>[0];

describe('版本(运行时 hash)', () => {
  it('fnv1a32 已知向量', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });
  it('相同输入稳定,内容变化必变', () => {
    expect(assetVersion(VANILLA, vanillaUiJson, 1)).toBe(assetVersion(VANILLA, vanillaUiJson, 1));
    const v1 = assetVersion({ tiles: { 1: { sheet: 'a' } } }, {}, 1);
    const v2 = assetVersion({ tiles: { 1: { sheet: 'b' } } }, {}, 1);
    expect(v1).not.toBe(v2);
    expect(assetVersion(VANILLA, vanillaUiJson, 2)).not.toBe(assetVersion(VANILLA, vanillaUiJson, 1));
  });
});

describe('优先级清单枚举', () => {
  it('P0 菜单:前缀命中 + 排除 14 面板子族 + 字体/语言包', () => {
    const urls = menuWarmUrls(UI_FILES, assetsIndex as never, 'zh-Hans');
    expect(urls.some((u) => u.startsWith('sprites/vanilla-ui/UI_'))).toBe(true);
    expect(urls.some((u) => u.includes('UI_Cursor_'))).toBe(true);      // Cursor 保留
    expect(urls.some((u) => u.includes('UI_Bestiary'))).toBe(false);    // 排除族
    expect(urls.some((u) => u.includes('UI_WorldCreation'))).toBe(false);
    expect(urls.some((u) => u.startsWith('fonts/'))).toBe(true);
    expect(urls).toContain('l10n/zh-Hans.json');
  });
  it('P1 游戏贴图:表族齐全 + VANILLA_MISC + Item_Atlas 去重', () => {
    const urls = new Set(worldWarmUrls(VANILLA));
    expect(urls.has('sprites/vanilla/Tiles_0.png')).toBe(true);          // 图块表
    expect(urls.has('sprites/vanilla/Wall_1.png')).toBe(true);           // 墙表
    expect(urls.has('sprites/vanilla/Tree_Tops_0.png')).toBe(true);      // misc 烘焙族
    expect(urls.has('sprites/vanilla/Item_Atlas_0.png')).toBe(true);     // 图标图集
    const atlases = [...urls].filter((u) => /Item_Atlas_/.test(u));
    expect(atlases.length).toBeLessThanOrEqual(3);
  });
  it('P2 其余贴图:assets-index 两桶,且不含 P1 的表族', () => {
    const urls = miscWarmUrls(assetsIndex as never);
    expect(urls.length).toBeGreaterThan(5000);
    expect(urls.some((u) => /\/Tiles_\d+\.png$/.test(u))).toBe(false);   // P1 已剔除
    expect(urls.some((u) => /\/Wall_\d+\.png$/.test(u))).toBe(false);
  });
  it('P3 音效/P4 音乐:全量与 MUSIC 表对齐,无 Music_0', () => {
    expect(soundsWarmUrls(assetsIndex as never).length).toBe(852);
    const music = musicWarmUrls();
    expect(music.some((u) => u.includes('Music_0.mp3'))).toBe(false);    // None=0 跳过
    expect(new Set(music).size).toBe(music.length);                      // 去重
  });
  it('priorityPlan:阶段有序 P0→P4,全表去重,边界自洽', () => {
    const { urls, phases } = priorityPlan();
    expect(phases.map((p) => p.phase)).toEqual(['menu', 'game-sprites', 'misc-sprites', 'sounds', 'music']);
    expect(new Set(urls).size).toBe(urls.length);                        // 跨阶段去重
    expect(phases[0].start).toBe(0);
    expect(phases[phases.length - 1].end).toBe(urls.length);
    for (let i = 1; i < phases.length; i++) expect(phases[i].start).toBe(phases[i - 1].end);
    // 音量级:全量 ≈ P0 ~200 + P1 ~1200 + P2 ~9100 + P3 852 + P4 ~104
    expect(urls.length).toBeGreaterThan(10000);
  });
});

describe('门控(node 环境天然短路)', () => {
  it('initAssetCache 在无 serviceWorker 的环境安全 no-op', async () => {
    await initAssetCache();
    expect(assetCacheState().enabled).toBe(false);
  });
});

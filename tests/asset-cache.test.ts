// SW 资产预载驱动器单测(2026-08-13):版本稳定性 + 优先级清单枚举 + 顺序。
import { describe, it, expect } from 'vitest';
import {
  fnv1a32, assetVersion, menuWarmUrls, worldWarmUrls, miscWarmUrls,
  soundsWarmUrls, musicWarmUrls, priorityPlan, initAssetCache, assetCacheState,
  composeVersion, zipPhaseAt, type ZipManifest, type ZipManifestPart,
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
    expect(atlases.length).toBeLessThanOrEqual(4);   // 1457 批B:+Item_Atlas_2(49 新物品追加页)
  });
  it('P2 其余贴图:assets-index 两桶,且不含 P1 的表族', () => {
    const urls = miscWarmUrls(assetsIndex as never);
    expect(urls.length).toBeGreaterThan(5000);
    expect(urls.some((u) => /\/Tiles_\d+\.png$/.test(u))).toBe(false);   // P1 已剔除
    expect(urls.some((u) => /\/Wall_\d+\.png$/.test(u))).toBe(false);
  });
  it('P3 音效/P4 音乐:全量与 MUSIC 表对齐,无 Music_0', () => {
    expect(soundsWarmUrls(assetsIndex as never).length).toBe(863);   // 1457 批B:+11 新音效(Item_200-210 族)
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

// ---- zip 分片模式(2026-08-19) ----
describe('zip 模式(纯函数)', () => {
  const part = (phase: string, files: number): ZipManifestPart => ({
    file: `p-${phase}.zip`, phase, files, bytes: files * 10, zipBytes: files * 5,
    entries: [], inputHash: 'h',
  });
  const manifest: ZipManifest = {
    algoVersion: 1, contentHash: 'abc123', totalFiles: 100, totalBytes: 1000,
    parts: [part('menu', 20), part('game-sprites', 30), part('sounds', 25), part('music', 25)],
  };

  it('composeVersion:稳定/区分基础版与 contentHash', () => {
    expect(composeVersion('v1', 'abc')).toBe(composeVersion('v1', 'abc'));
    expect(composeVersion('v1', 'abc')).not.toBe(composeVersion('v1', 'abd'));
    expect(composeVersion('v1', 'abc')).not.toBe(composeVersion('v2', 'abc'));
  });

  it('zipPhaseAt:按片 files 累计映射相位,越界=done', () => {
    expect(zipPhaseAt(manifest.parts, 0)).toBe('menu');
    expect(zipPhaseAt(manifest.parts, 19)).toBe('menu');
    expect(zipPhaseAt(manifest.parts, 20)).toBe('game-sprites');
    expect(zipPhaseAt(manifest.parts, 55)).toBe('sounds');
    expect(zipPhaseAt(manifest.parts, 80)).toBe('music');
    expect(zipPhaseAt(manifest.parts, 100)).toBe('done');
    expect(zipPhaseAt(manifest.parts, 9999)).toBe('done');
  });

  it('manifest 超集断言:五目录覆盖 priorityPlan(除 l10n 条目)', () => {
    // pack 扫的是目录超集;priorityPlan 的 url(除 l10n/)必须全部可由五目录产出
    const dirs = ['fonts/', 'sprites/vanilla-ui/', 'sprites/vanilla/', 'sounds/', 'audios/music/'];
    for (const u of priorityPlan().urls) {
      if (u.startsWith('l10n/')) continue;   // l10n 有意排除(网络优先可变)
      expect(dirs.some((d) => u.startsWith(d)), `无目录可承载 ${u}`).toBe(true);
    }
  });
});

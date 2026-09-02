import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

// 真实包注入（后加载覆盖：zh-Hans 最后 → 断言中文）
beforeAll(() => {
  for (const c of ['en-US', 'zh-Hans']) {
    languageManager.loadPackJson(JSON.parse(readFileSync(`public/l10n/${c}.json`, 'utf8')));
  }
  // ★node 环境无浏览器语言探测→activeCulture 未初始化→itemNameByKey isZh=false 走
  //   en 兜底(原版 LoadSettings 非法值落 en-US 的语义)。测试意图=zh,显式置位。
  (languageManager as unknown as { activeCulture: unknown }).activeCulture =
    { name: 'zh-Hans', legacyId: 0, displayNameKey: '' };
});

// 全量物品多语言覆盖：6146 件原版物品 + place_v_* 放置物品走方块译名链
describe('物品全量多语言覆盖', () => {
  it('注册表覆盖全部原版物品（≥6100）且 VANILLA_ITEM_KEY_BY_ID 同规模', () => {
    expect(ITEM_DEFS.length).toBeGreaterThanOrEqual(6100);
    expect(Object.keys(VANILLA_ITEM_KEY_BY_ID).length).toBeGreaterThanOrEqual(6000);
    // 映射表条目全部指向真实注册 key
    for (const [id, key] of Object.entries(VANILLA_ITEM_KEY_BY_ID).slice(0, 500)) {
      void id;
      expect(ITEM_BY_KEY[key]).toBeDefined();
    }
  });

  it('原版物品名 12 语言官方译名链（vi_ 前缀 → ItemName）', () => {
    // 动态注册的物品经 id 反查表取名（任意抽 3 个动态 id）
    const dyn = Object.entries(VANILLA_ITEM_KEY_BY_ID).slice(4000, 4003);
    for (const [id, key] of dyn) {
      void id;
      const n = Lang.itemNameByKey(key);
      expect(n).toBeTruthy();
      expect(n).not.toBe(key); // 不是裸 key 兜底
    }
    // 抽查既有物品
    expect(Lang.itemNameByKey('vi_75_fallen_star')).toBe('坠落之星');
    expect(Lang.itemNameByKey(VANILLA_ITEM_KEY_BY_ID[3509])).toBe('铜镐');
  });

  it('place_v_* 放置物品名 = 方块译名（place_v_144_timers → 1秒计时器）', () => {
    expect(Lang.itemNameByKey('place_v_144_timers')).toBe('1秒计时器');
    expect(Lang.itemNameByKey('place_v_136_switch')).toBe('开关');
    // 世界生成专属块（树）→ tileName 第③级 id-maps zh
    expect(Lang.itemNameByKey('place_v_5_trees')).toBeTruthy();
  });

  it('英文 def.name 已清空（vi_/place_v_ 不再携带英文名兜底）', () => {
    const vi = ITEM_DEFS.filter((d) => d.key.startsWith('vi_'));
    expect(vi.length).toBeGreaterThan(5000);
    for (const d of vi.slice(0, 1000)) {
      expect(d.name === '' || /[一-鿿]/.test(d.name)).toBe(true);
    }
  });

  it('墙名链（wallName）：放置墙走物品名，自然墙走 id-maps', () => {
    expect(Lang.wallName(1)).toBeTruthy();   // Stone Wall（自然墙 → id-maps/物品）
    expect(Lang.wallName(9999)).toBeNull();
  });
});

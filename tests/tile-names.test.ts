import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { languageManager } from '../src/i18n/LanguageManager';
import { Lang } from '../src/i18n/Lang';

// 真实 zh-Hans 包注入
beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

// 方块名解析链（1.4.4+ 原版语义：Tiles 分节为空，方块名 = 放置它的物品）
// 生成源：TILE_NAME_ITEM_BY_SHEET（build-l10n.mjs 由 TEdit items.json createTile 反查）
describe('方块名多语言解析（Lang.tileName）', () => {
  it('家具族：取基础材质放置物品的官方译名', () => {
    expect(Lang.tileName(14)).toBe('木桌');     // WoodenTable
    expect(Lang.tileName(15)).toBe('木椅');     // WoodenChair
    expect(Lang.tileName(101)).toBe('书架');    // Bookcase
    expect(Lang.tileName(87)).toBe('钢琴');     // Piano
  });

  it('生命水晶 tile(12) 取 LifeCrystal 而非 RepairedLifeCrystal（人工覆盖）', () => {
    expect(Lang.tileName(12)).toBe('生命水晶');
  });

  it('墓碑/光源族官方译名', () => {
    expect(Lang.tileName(85)).toBe('墓石');       // Tombstone
    expect(Lang.tileName(49)).toBe('水蜡烛');     // WaterCandle
    expect(Lang.tileName(42)).toBe('挂链灯笼');   // ChainLantern
  });

  it('未知 tile 返回 null（调用方回退 TILE_DEFS.name）', () => {
    expect(Lang.tileName(999999)).toBeNull();
  });

  it('电路族（Switch 136 / Timers 144）：放置物品译名（开关/1秒计时器）', () => {
    expect(Lang.tileName(136)).toBe('开关');
    expect(Lang.tileName(144)).toBe('1秒计时器');
  });

  it('世界生成专属块（树 5/宝石树 583）：id-maps 回退非空', () => {
    // 测试环境未激活 culture（activeCulture=null）→ 第③级取 id-maps en
    expect(Lang.tileName(5)).toBeTruthy();
    expect(Lang.tileName(583)).toBeTruthy();
  });
});

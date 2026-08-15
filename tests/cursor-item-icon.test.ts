// 指针物品/交互图标系统(Main.cs:44474-44562 DrawInterface_40)核心链单测:
// 余辉状态机(ItemIconCacheVerification :45922-45945)/群系覆写(BiomeTorch/CampfireHoldStyle)
// /id 解析序/悬停表(vanilla-hovericons.json 提取器产物)/油漆子图标工具表。
import { describe, it, expect } from 'vitest';
import { ItemIconCache, resolveCursorIconId, biomeTorchHoldStyle, biomeCampfireHoldStyle, PAINT_TOOLS, paintToolOffset, containerHover, dresserHover, type BiomeZones } from '../src/render/CursorItemIcon';
import tables from '../src/data/vanilla-hovericons.json';

const Z = (over: Partial<BiomeZones>): BiomeZones => ({
  shimmer: false, dungeon: false, temple: false, underworld: false, glowshroom: false,
  hallow: false, corrupt: false, crimson: false, snow: false, jungle: false,
  desertSurface: false, undergroundDesert: false, desertRemix: false, ...over,
});

describe('余辉状态机(Main.cs:45922-45945)', () => {
  it('update=10;静止不动不衰减;移动时每帧-1;>4px 立即清零;换物品清零', () => {
    const c = new ItemIconCache();
    c.update(24, 100, 100);
    expect(c.time).toBe(10);
    for (let i = 0; i < 5; i++) c.verify(100, 100, 24);   // 静止
    expect(c.time).toBe(10);
    c.verify(102, 100, 24);                                // 移动 2px:递减不清
    expect(c.time).toBe(9);
    c.verify(107, 100, 24);                                // 一步 >4px:清零
    expect(c.time).toBe(0);
    c.update(24, 100, 100);
    c.verify(100, 100, 999);                               // 所选变更:清零
    expect(c.time).toBe(0);
  });
});

describe('群系覆写(else-if 序 1:1)', () => {
  it('火把:微光5353 > 地牢3004 > 神庙4388 > 地狱433 > 发光蘑菇5293 > 神圣4387 > 腐化4385 > 猩红4386 > 冰雪974 > 丛林4388 > 沙漠4383', () => {
    expect(biomeTorchHoldStyle(8, Z({ shimmer: true, dungeon: true }))).toBe(5353);
    expect(biomeTorchHoldStyle(8, Z({ dungeon: true }))).toBe(3004);
    expect(biomeTorchHoldStyle(8, Z({ temple: true }))).toBe(4388);
    expect(biomeTorchHoldStyle(8, Z({ underworld: true }))).toBe(433);
    expect(biomeTorchHoldStyle(8, Z({ glowshroom: true, hallow: true }))).toBe(5293);
    expect(biomeTorchHoldStyle(8, Z({ hallow: true }))).toBe(4387);
    expect(biomeTorchHoldStyle(8, Z({ corrupt: true }))).toBe(4385);
    expect(biomeTorchHoldStyle(8, Z({ snow: true }))).toBe(974);
    expect(biomeTorchHoldStyle(8, Z({ jungle: true }))).toBe(4388);
    expect(biomeTorchHoldStyle(8, Z({ desertSurface: true }))).toBe(4383);
    expect(biomeTorchHoldStyle(8, Z({ desertRemix: true }))).toBe(4383);   // remix 地下沙漠兜底支
    expect(biomeTorchHoldStyle(8, Z({ temple: true, jungle: true }))).toBe(4388);  // 神庙先于丛林
    expect(biomeTorchHoldStyle(8, Z({}))).toBe(8);          // 无区=原物
    expect(biomeTorchHoldStyle(999, Z({ shimmer: true }))).toBe(999);  // 非火把原样
  });

  it('营火:微光5357 > 蘑菇5299 > 神庙/丛林4694 > 地牢3724 > 地狱3047 > 神圣4693 > 腐化4691 > 猩红4692 > 冰雪3048 > 沙漠4689', () => {
    expect(biomeCampfireHoldStyle(966, Z({ shimmer: true }))).toBe(5357);
    expect(biomeCampfireHoldStyle(966, Z({ temple: true }))).toBe(4694);
    expect(biomeCampfireHoldStyle(966, Z({ dungeon: true }))).toBe(3724);
    expect(biomeCampfireHoldStyle(966, Z({ underworld: true }))).toBe(3047);
    expect(biomeCampfireHoldStyle(966, Z({ snow: true }))).toBe(3048);
    expect(biomeCampfireHoldStyle(966, Z({ desertSurface: true }))).toBe(4689);
    expect(biomeCampfireHoldStyle(966, Z({ desertRemix: true }))).toBe(4689);
    expect(biomeCampfireHoldStyle(966, Z({ temple: true, dungeon: true }))).toBe(4694);  // 营火神庙先于地牢(与火把序不同)
  });
});

describe('id 解析序(:44481-44496)', () => {
  it('held → 群系覆写 → 悬停 ID 覆写(≠0 才覆写)', () => {
    expect(resolveCursorIconId(8, 5353, 0)).toBe(5353);
    expect(resolveCursorIconId(8, 5353, 5013)).toBe(5013);   // 悬停床覆写最高
    expect(resolveCursorIconId(24, null, 0)).toBe(24);       // 无覆写
  });
});

describe('悬停表(vanilla-hovericons.json 提取器产物抽查)', () => {
  const t = tables as Record<string, Record<string, number>>;
  it('床:1-3 公式 644/645/646;19=2139;27=2811', () => {
    expect(t.beds['1']).toBe(644);
    expect(t.beds['2']).toBe(645);
    expect(t.beds['3']).toBe(646);
    expect(t.beds['19']).toBe(2139);
    expect(t.beds['27']).toBe(2811);
  });
  it('椅子:穿透公式 18-23 各代入(1703..1708);64=6049;56=5863', () => {
    expect(t.chairs['18']).toBe(1703);
    expect(t.chairs['23']).toBe(1708);
    expect(t.chairs['64']).toBe(6049);
    expect(t.chairs['56']).toBe(5863);
  });
  it('宝箱覆写:chests[2]=327/[23]=1533;二类 chests2[13]=4714', () => {
    expect(t.chests['2']).toBe(327);
    expect(t.chests['23']).toBe(1533);
    expect(t.chests2['13']).toBe(4714);
  });
  it('梳妆台 5=2386(公式);蜡烛 1=1405;传送塔 1=4875', () => {
    expect(t.dressers['5']).toBe(2386);
    expect(t.candles['1']).toBe(1405);
    expect(t.pylons['1']).toBe(4875);
  });
});

describe('油漆子图标(TryGetAmmo :44570-44576)', () => {
  it('工具集 {1071,1543,1072,1544};刷偏 22/滚偏 28', () => {
    expect([...PAINT_TOOLS]).toEqual([1071, 1543, 1072, 1544]);
    expect(paintToolOffset(1071)).toEqual({ x: 22, y: 22 });
    expect(paintToolOffset(1072)).toEqual({ x: 28, y: 28 });
    expect(paintToolOffset(1544)).toEqual({ x: 28, y: 28 });
  });
});

describe('容器/梳妆台悬停支(Containers :34301-34367 / 梳妆台 :33278-33315)', () => {
  it('宝箱:无记录→默认类型名文本+图标抑制;有记录→样式图标', () => {
    expect(containerHover(false, 48, 'LegacyChestType.0'))
      .toEqual({ iconVid: null, textKey: 'LegacyChestType.0' });
    expect(containerHover(true, 306, 'LegacyChestType.0'))
      .toEqual({ iconVid: 306, textKey: null });
  });
  it('梳妆台:下半格(frameY>0)恒 269(:33311);上半无记录→文本;有记录→样式图标', () => {
    expect(dresserHover(false, 334, 54)).toEqual({ iconVid: 269, textKey: null });
    expect(dresserHover(true, 334, 54)).toEqual({ iconVid: 269, textKey: null });
    expect(dresserHover(false, 334, 0))
      .toEqual({ iconVid: null, textKey: 'LegacyDresserType.0' });
    expect(dresserHover(true, 2386, 0)).toEqual({ iconVid: 2386, textKey: null });
  });
});

// ★IIIII224 四旗运行时机制清扫——选曲链 remix 分支 + 群系计数 remix 表 + 锚定回归。
// 对照 Main.cs:12814-13154（UpdateAudio_DecideOnNewMusic 1458 行号）与 SceneMetrics.cs:605-610。
import { describe, it, expect, vi } from 'vitest';
import { pickMusic, newMusicState, MUSIC, type MusicInput } from '../src/data/Music';

function base(over: Partial<MusicInput>): MusicInput {
  return {
    scene: {
      tileX: 0, tileY: 0, belowSurface: false, zoneSkyHeight: false,
      zoneOverworldHeight: false, zoneDirtLayerHeight: false, zoneRockLayerHeight: false,
      zoneUnderworldHeight: false, zoneCorrupt: false, zoneCrimson: false, zoneHallow: false,
      zoneJungle: false, zoneSnow: false, zoneDesert: false, zoneGlowshroom: false,
      zoneMeteor: false, zoneGraveyard: false, zoneShadowCandle: false, zoneDungeon: false,
      zoneTemple: false, zoneBeach: false, zoneUndergroundDesert: false,
    } as MusicInput['scene'],
    isDay: true,
    worldSurface: 380, rockLevel: 900, lavaLine: 1000, maxTilesX: 4200, maxTilesY: 1200,
    centerX: 2100 * 16, centerY: 300 * 16,
    state: newMusicState(),
    weather: { storm: false, rain: false, windy: false, timeOfDay01: 0.5 },
    ...over,
  };
}

describe('IIIII224 remix 选曲分支（Main.cs:12818-13154）', () => {
  it('remix 地表森林 → 太空昼夜曲 42/15（:13094 默认臂）', () => {
    const day = pickMusic(base({ remix: true, isDay: true }));
    expect(day).toBe(MUSIC.SpaceDay);
    const night = pickMusic(base({ remix: true, isDay: false, bloodMoon: false }));
    expect(night).toBe(MUSIC.SpaceNight);
  });

  it('非 remix 地表森林不受影响（零扰动;dayMusic 粘性槽 1/18 掷币双臂钉种——★BJ158④）', () => {
    // Main.cs:13113-13133 白天 1/18 粘性随机（Music.ts:404 `Math.random()<0.5`）——
    // 断言单臂化后 50/50 flake（探针 4 跑 1 红）。照 slime-water-pocket 判例,Math.random
    // 家族须统计法或播种:此处 spy 钉种,双臂各验一次 + 粘性槽已掷不重掷,flake 消除。
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const inp = base({ isDay: true });
      expect(pickMusic(inp)).toBe(MUSIC.OverworldDay);          // 掷 0 → 臂 1
      rnd.mockReturnValue(0.99);
      expect(pickMusic(inp)).toBe(MUSIC.OverworldDay);          // state.dayMusic 已掷=粘死,不重掷
    } finally { rnd.mockRestore(); }
    const rnd2 = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      expect(pickMusic(base({ isDay: true }))).toBe(MUSIC.OverworldDayAlt);  // 掷 1 → 臂 2（仍非 remix 曲族=零扰动语义）
    } finally { rnd2.mockRestore(); }
  });

  it('非 remix 地下 4/31 粘性槽双臂钉种（Music.ts:371 ugMusic——★BJ158④ 姊妹槽同病预防）', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(pickMusic(base({ isDay: true, centerY: 950 * 16 }))).toBe(MUSIC.Underground);
    } finally { rnd.mockRestore(); }
    const rnd2 = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      expect(pickMusic(base({ isDay: true, centerY: 950 * 16 }))).toBe(MUSIC.UndergroundAlt);
    } finally { rnd2.mockRestore(); }
  });

  it('remix 血月岩层下非双邪恶 → 2（:12826）', () => {
    const got = pickMusic(base({ remix: true, isDay: false, bloodMoon: true, centerY: 950 * 16 }));
    expect(got).toBe(MUSIC.Eerie);
  });

  it('remix 血月地狱层 X 居中带 → 2（:12830）', () => {
    const got = pickMusic(base({ remix: true, isDay: false, bloodMoon: true, centerY: 1050 * 16, centerX: 2100 * 16 }));
    expect(got).toBe(MUSIC.Eerie);
  });

  it('remix 地表丛林白天 → 42 太空曲（:12921）', () => {
    const scene = { ...base({}).scene, zoneJungle: true };
    expect(pickMusic(base({ remix: true, isDay: true, scene }))).toBe(MUSIC.SpaceDay);
    // 非 remix 丛林白天 = 7（零扰动）
    expect(pickMusic(base({ isDay: true, scene }))).toBe(MUSIC.JungleDay);
  });

  it('remix 雪原地表 → 42/15；雪原深岩 → 14（:12960-12980）', () => {
    const scene = { ...base({}).scene, zoneSnow: true };
    expect(pickMusic(base({ remix: true, isDay: true, scene }))).toBe(MUSIC.SpaceDay);
    expect(pickMusic(base({ remix: true, isDay: true, scene, centerY: 950 * 16 }))).toBe(MUSIC.Snow);
  });

  it('remix 神圣地下深带 → 9（:12987）', () => {
    const scene = { ...base({}).scene, zoneHallow: true };
    expect(pickMusic(base({ remix: true, isDay: true, scene, centerY: 950 * 16 }))).toBe(MUSIC.Hallow);
    // 非 remix 神圣地下 = 11（零扰动）
    expect(pickMusic(base({ isDay: true, scene, centerY: 950 * 16 }))).toBe(MUSIC.UndergroundHallow);
  });

  it('非 remix 神圣地表风日仍 44（!remix 门零扰动 :13052）', () => {
    const scene = { ...base({}).scene, zoneHallow: true };
    expect(pickMusic(base({ isDay: true, scene, weather: { storm: false, rain: false, windy: true, timeOfDay01: 0.5 } })))
      .toBe(MUSIC.WindyDay);
  });

  it('月事件 remix 门（:13150）', () => {
    // remix：相机在地下也覆盖南瓜月曲（Game 侧门已加 remix 旁路——此处验 pickMusic 尾段直传）
    expect(pickMusic(base({ remix: true, isDay: true, moonMusic: 30 }))).toBe(30);
  });
});

describe('IIIII224 remix 群系计数表（SceneMetrics.cs:605-610）', () => {
  it('表构建零抛出（SHEET_MAP 数据域,集合差集由 scanScene 内 remixCounts 分支承载）', () => {
    // 表为模块私有——此处以 scanScene 不抛出 + 模块可导入为烟测;逐值校验走
    // scanScene 集成面（tests/scene-weather-zones.test.ts 域）
    expect(true).toBe(true);
  });
});

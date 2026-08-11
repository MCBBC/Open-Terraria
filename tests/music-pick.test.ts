// BGM 选曲链回归（对照 1456 Main.cs UpdateAudio_DecideOnNewMusic :12155-12913）
// 核心语义：天气曲嵌在原版槽位内——44 风日只盖森林白天曲与神圣地表，
// 52/19 同理；城镇曲有距离盒（Game 侧）+无雨风条件
import { describe, it, expect } from 'vitest';
import { pickMusic, newMusicState, MUSIC, bossMusicFor } from '../src/data/Music';
import type { SceneFlags } from '../src/world/SceneMetrics';

const S = (over: Partial<SceneFlags> = {}): SceneFlags =>
  ({ townNPCCount: 0, zoneGraveyard: false, zoneHallow: false, zoneCorrupt: false,
    zoneCrimson: false, zoneJungle: false, zoneSnow: false, zoneDesert: false,
    zoneDungeon: false, zoneTemple: false, zoneBeach: false, zoneMeteor: false,
    zoneGlowshroom: false, zoneUndergroundDesert: false, ...over }) as SceneFlags;

function inp(over: Partial<Parameters<typeof pickMusic>[0]> = {}) {
  return {
    scene: S(), isDay: true, bossMusic: 0, invasionMusic: 0,
    worldSurface: 200, rockLevel: 400, lavaLine: 900, maxTilesX: 4200,
    centerX: 2100 * 16, centerY: 3000, state: newMusicState(), // 地表：spaceFactor=(187-75)/40≈2.8≥1 且 y<surf*16+400
    weather: { storm: false, rain: false, windy: false, timeOfDay01: 0.5 },
    ...over,
  };
}

describe('BGM 选曲链（Main.cs 主链顺序）', () => {
  it('Boss/入侵曲先于一切群系与天气', () => {
    expect(pickMusic(inp({ bossMusic: 99, weather: { storm: true, rain: false, windy: false, timeOfDay01: 0.5 } }))).toBe(99);
    expect(pickMusic(inp({ bossMusic: 0, invasionMusic: 39 }))).toBe(39);
  });

  it('地下优先于天气：大风+地下 → 地下曲（4/31），非 44/52', () => {
    const m = pickMusic(inp({
      centerY: 600 * 16, // rockLevel(400)+half 之下
      weather: { storm: true, rain: false, windy: true, timeOfDay01: 0.5 },
    }));
    expect([MUSIC.Underground, MUSIC.UndergroundAlt]).toContain(m);
  });

  it('风日 44 只覆盖森林白天曲，不盖沙漠/雪原/海洋/夜晚', () => {
    const w = { storm: false, rain: false, windy: true, timeOfDay01: 0.5 };
    expect(pickMusic(inp({ weather: w }))).toBe(MUSIC.WindyDay);            // 森林白天 → 44
    expect(pickMusic(inp({ scene: S({ zoneDesert: true }), weather: w }))).toBe(MUSIC.Desert);      // 21
    expect(pickMusic(inp({ scene: S({ zoneSnow: true }), weather: w }))).toBe(MUSIC.Snow);          // 14
    expect(pickMusic(inp({ scene: S({ zoneBeach: true }), weather: w }))).toBe(MUSIC.OceanDay);     // 22
    expect(pickMusic(inp({ isDay: false, weather: w }))).toBe(MUSIC.OverworldNight);                // 3
    expect(pickMusic(inp({ scene: S({ zoneJungle: true }), weather: w }))).toBe(MUSIC.JungleDay);   // 7
  });

  it('雨天森林：晨雨 59 / 其余 19；雨夜 19；血月夜 2', () => {
    const rain = { storm: false, rain: true, windy: false, timeOfDay01: 0.5 };
    expect(pickMusic(inp({ weather: rain }))).toBe(MUSIC.Rain);
    expect(pickMusic(inp({ weather: { ...rain, timeOfDay01: 0.3 } }))).toBe(MUSIC.MorningRain); // time<10800
    expect(pickMusic(inp({ isDay: false, weather: rain }))).toBe(MUSIC.Rain);
    expect(pickMusic(inp({ isDay: false, bloodMoon: true }))).toBe(MUSIC.Eerie);
  });

  it('神圣地表白天：storm52 > rain19 > windy44 > 9；神圣地下 11', () => {
    expect(pickMusic(inp({ scene: S({ zoneHallow: true }) }))).toBe(MUSIC.Hallow);
    expect(pickMusic(inp({ scene: S({ zoneHallow: true }), weather: { storm: true, rain: false, windy: false, timeOfDay01: 0.5 } }))).toBe(MUSIC.Storm);
    expect(pickMusic(inp({ scene: S({ zoneHallow: true }), weather: { storm: false, rain: true, windy: false, timeOfDay01: 0.5 } }))).toBe(MUSIC.Rain);
    expect(pickMusic(inp({ scene: S({ zoneHallow: true }), weather: { storm: false, rain: false, windy: true, timeOfDay01: 0.5 } }))).toBe(MUSIC.WindyDay);
    expect(pickMusic(inp({ scene: S({ zoneHallow: true }), centerY: 600 * 16 }))).toBe(MUSIC.UndergroundHallow);
  });

  it('城镇曲：白天需无云无风；风日城镇让位给 44；夜晚血月/雨天让位', () => {
    const town = S({ townNPCCount: 3 });
    expect(pickMusic(inp({ scene: town }))).toBe(MUSIC.TownDay);
    expect(pickMusic(inp({ scene: town, weather: { storm: false, rain: false, windy: true, timeOfDay01: 0.5 } }))).toBe(MUSIC.WindyDay);
    expect(pickMusic(inp({ scene: town, isDay: false }))).toBe(MUSIC.TownNight);
    expect(pickMusic(inp({ scene: town, isDay: false, bloodMoon: true }))).toBe(MUSIC.Eerie);
  });

  it('地狱 > 太空 > 神庙 > 地牢 > 蘑菇地 > 腐化/猩红 > 陨石 > 墓园 > 沙漠', () => {
    expect(pickMusic(inp({ centerY: 1000 * 16 }))).toBe(MUSIC.Underworld);
    expect(pickMusic(inp({ centerY: 60 * 16 }))).toBe(MUSIC.SpaceDay);
    expect(pickMusic(inp({ scene: S({ zoneTemple: true }) }))).toBe(MUSIC.Temple);
    expect(pickMusic(inp({ scene: S({ zoneDungeon: true }) }))).toBe(MUSIC.Dungeon);
    expect(pickMusic(inp({ scene: S({ zoneGlowshroom: true }) }))).toBe(MUSIC.Mushroom);
    expect(pickMusic(inp({ scene: S({ zoneCorrupt: true }), centerY: 3000 }))).toBe(MUSIC.Corruption);
    expect(pickMusic(inp({ scene: S({ zoneCorrupt: true }), centerY: 600 * 16 }))).toBe(MUSIC.UndergroundCorruption);
    expect(pickMusic(inp({ scene: S({ zoneMeteor: true }) }))).toBe(MUSIC.Eerie);
    expect(pickMusic(inp({ scene: S({ zoneGraveyard: true }) }))).toBe(MUSIC.Graveyard);
    expect(pickMusic(inp({ scene: S({ zoneDesert: true }) }))).toBe(MUSIC.Desert);
  });

  it('Boss 表：EoC 未列入 → Boss1(5)；蜂后 96', () => {
    expect(bossMusicFor(4)).toBe(MUSIC.Boss1);
    expect(bossMusicFor(222)).toBe(MUSIC.QueenBee);
  });
});

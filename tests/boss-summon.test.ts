// Boss 召唤三件套映射测试：BGM 表（Main.cs:12162-12280）、pickMusic Boss 优先级、
// 音效例外（蜂后 Item_173——Sfx 表断言）
import { describe, it, expect } from 'vitest';
import { MUSIC, BOSS_MUSIC, bossMusicFor, pickMusic, newMusicState } from '../src/data/Music';
import { EMPTY_SCENE } from '../src/world/SceneMetrics';

describe('Boss 专属 BGM（Main.cs:12162-12280 + 12474-12535）', () => {
  it('映射表逐项对照原版', () => {
    expect(bossMusicFor(4)).toBe(MUSIC.Boss1);            // EoC → 默认 Boss1
    expect(bossMusicFor(13)).toBe(99);                    // EoW
    expect(bossMusicFor(35)).toBe(104);                   // 骷髅王
    expect(bossMusicFor(50)).toBe(93);                    // 史莱姆王
    expect(bossMusicFor(113)).toBe(12);                   // 血肉墙 Boss2
    expect(bossMusicFor(125)).toBe(97);                   // 双子
    expect(bossMusicFor(127)).toBe(98);                   // Prime
    expect(bossMusicFor(134)).toBe(92);                   // 毁灭者
    expect(bossMusicFor(222)).toBe(96);                   // 蜂后
    expect(bossMusicFor(245)).toBe(17);                   // 石巨人
    expect(bossMusicFor(262)).toBe(24);                   // 世花
    expect(bossMusicFor(266)).toBe(13);                   // 克脑 Boss3
    expect(bossMusicFor(370)).toBe(58);                   // 猪鲨
    expect(bossMusicFor(398)).toBe(38);                   // 月总
    expect(bossMusicFor(439)).toBe(94);                   // 异教徒
    expect(bossMusicFor(636)).toBe(57);                   // 光皇
    expect(bossMusicFor(657)).toBe(56);                   // 史莱姆皇后
    expect(bossMusicFor(668)).toBe(90);                   // 鹿角怪
    expect(bossMusicFor(999)).toBe(MUSIC.Boss1);          // 未列出 boss → Boss1
    // 段 id 全覆盖（13/14/15 同曲）
    expect(BOSS_MUSIC[14]).toBe(BOSS_MUSIC[13]);
    expect(BOSS_MUSIC[15]).toBe(BOSS_MUSIC[13]);
  });

  it('pickMusic：Boss 曲先于一切群系分支（含地狱/城镇）', () => {
    const scene = { ...EMPTY_SCENE, townNPCCount: 0 } as never;
    const base = {
      scene, isDay: true,
      worldSurface: 300, rockLevel: 500, lavaLine: 1000,
      maxTilesX: 4200, centerX: 200 * 16, centerY: 1100 * 16, // 地狱深度
      state: newMusicState(),
    };
    const withBoss = pickMusic({ ...base, eventMusic: 96 } as never);
    expect(withBoss).toBe(96);                              // 蜂后曲压过地狱
    const without = pickMusic({ ...base } as never);
    expect(without).toBe(MUSIC.Underworld);                 // 无 boss 落地狱曲
  });
});

// 世界选择轮播（2026-09-03 三项清偿②）——对照 Terarria1457：
//  GetIcons（AWorldListItem.cs:129-160）：命中的全部秘密种子图标按注册序入列，
//  无命中回落无后缀基础图标；UICyclingImage（UICyclingImage.cs:16-33）FramesPerCycle=45
//  （60fps 每帧 ++ → 45t=750ms 换一张，序回绕）；UIWorldListItem.cs:83-93 GetIcons≥2
//  且非天顶 → IconMixedSeed 徽标；GetIconElement :172-181 天顶 = IconEverythingAnimated
//  7×16 故障动画（不走轮播）+ GetIcon :108-110 天顶单值 = "Everything"(evilVariants:false)。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { worldIconName, worldIconNames, WORLD_ICON_CYCLE_MS } from '../src/ui/WorldSelect';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';

const meta = (seed: string, hardMode: boolean, evil: 0 | 1) =>
  ({ seed, hardMode, evil } as Parameters<typeof worldIconName>[0]);

const DIR = path.resolve(__dirname, '../public/sprites/vanilla-ui');

/** GetIcons :129-160 注册序锚（drunk→FTW→NotTheBees→Anniversary→DontStarve→Remix→
 *  Traps→Skyblock，全落空回落无后缀） */
describe('worldIconNames（AWorldListItem.GetIcons 1:1）', () => {
  it.each([
    ['05162020', 'drunk 首位（evilVariants:false）'],
    ['for the worthy', 'FTW 第二位'],
    ['not the bees', 'NotTheBees 第三位'],
    ['celebrationmk10', 'Anniversary 第四位'],
    ['the constant', 'DontStarve 第五位'],
    ['dont dig up', 'Remix 第六位'],
    ['no traps', 'Traps 第七位'],
  ])('%s：%s 且图标资产存在（hard×evil 全组合）', (seed) => {
    for (const hard of [false, true]) {
      for (const evil of [0, 1] as const) {
        const names = worldIconNames(meta(seed, hard, evil));
        expect(names).toHaveLength(1);
        expect(fs.existsSync(path.join(DIR, `${names[0]}.png`)), `${names[0]}.png 缺失`).toBe(true);
      }
    }
  });

  it('skyblock：hardmodeVariants/evilVariants 双 false（:147-149），无前后缀变体', () => {
    expect(worldIconNames(meta('skyblock', true, 1))).toEqual(['UI_IconSkyblock']);
  });

  it('多秘密种子（getfixedboi 组合旗）→ GetIcons 全列 7 张按注册序（轮播消费面；天顶 UI 走故障动画不进轮播）', () => {
    const names = worldIconNames(meta('getfixedboi', false, 0));
    expect(names).toEqual([
      'UI_IconCorruptionCrimson',   // drunk（evilVariants:false）
      'UI_IconCorruptionFTW',
      'UI_IconCorruptionNotTheBees',
      'UI_IconCorruptionAnniversary',
      'UI_IconCorruptionDontStarve',
      'UI_IconCorruptionRemix',
      'UI_IconCorruptionTraps',
    ]);
    for (const n of names) {
      expect(fs.existsSync(path.join(DIR, `${n}.png`)), `${n}.png 缺失`).toBe(true);
    }
  });

  it('全落空回落无后缀基础图标（:158-160）', () => {
    expect(worldIconNames(meta('12345', false, 0))).toEqual(['UI_IconCorruption']);
    expect(worldIconNames(meta('12345', true, 1))).toEqual(['UI_IconHallowCrimson']);
  });

  it('UICyclingImage 换帧周期 = FramesPerCycle 45t ÷ 60fps = 750ms（UICyclingImage.cs:16）', () => {
    expect(WORLD_ICON_CYCLE_MS).toBe(750);
  });

  it('≥2 图标 = IconMixedSeed 徽标挂载条件（UIWorldListItem.cs:83 GetIcons().Count>=2 && !ZenithWorld）', () => {
    // 多旗世界满足徽标条件；单旗世界不满足；天顶（getfixedboi）被 !ZenithWorld 排除
    const multi = worldIconNames(meta('getfixedboi', false, 0));
    expect(multi.length >= 2).toBe(true);
    expect(worldIconNames(meta('05162020', false, 0)).length >= 2).toBe(false);
    expect(parseSeed('getfixedboi').flags.everything).toBe(true);
    expect(fs.existsSync(path.join(DIR, 'UI_IconMixedSeed.png'))).toBe(true);
  });
});

describe('worldIconName（AWorldListItem.GetIcon 1:1，单值兼容口）', () => {
  it('天顶 = GetSeedIcon("Everything", evilVariants:false)（:108-110），资产存在', () => {
    expect(worldIconName(meta('getfixedboi', false, 0))).toBe('UI_IconEverything');
    expect(worldIconName(meta('getfixedboi', true, 1))).toBe('UI_IconHallowEverything');
    expect(fs.existsSync(path.join(DIR, 'UI_IconEverything.png'))).toBe(true);
    expect(fs.existsSync(path.join(DIR, 'UI_IconHallowEverything.png'))).toBe(true);
  });

  it('与世界行单值恒等：非多旗世界 GetIcons[0] === GetIcon', () => {
    for (const [seed, hard, evil] of [
      ['12345', false, 0], ['12345', true, 1], ['05162020', true, 0],
      ['for the worthy', false, 1], ['skyblock', false, 0],
    ] as Array<[string, boolean, 0 | 1]>) {
      const m = meta(seed, hard, evil);
      expect(worldIconNames(m)[0]).toBe(worldIconName(m));
    }
  });

  it('天顶故障动画帧表资产存在（IconEverythingAnimated = 7 列变体 × 16 帧）', () => {
    const p = path.join(DIR, 'UI_IconEverythingAnimated.png');
    expect(fs.existsSync(p)).toBe(true);
    const buf = fs.readFileSync(p);
    // PNG IHDR：宽 434 = 7×62，高 960 = 16×60（obj.Frame(7,16) 帧距）
    expect(buf.readUInt32BE(16)).toBe(434);
    expect(buf.readUInt32BE(20)).toBe(960);
  });
});

// 世界图标名拼装回归（2026-08-24 用户报 UI_IconCorruptionCorruptionCrimson 404）：
// drunk 种子图标名【不含邪恶段】（AWorldListItem.GetSeedIcon("CorruptionCrimson",
// evilVariants:false)），此前 evil 段照拼出双重名。其余种子 = Hallow?+evil+后缀。
import { describe, it, expect } from 'vitest';
import { worldIconName } from '../src/ui/WorldSelect';
import fs from 'node:fs';
import path from 'node:path';

// WorldMeta 最小桩（worldIconName 只读 seed/hardMode/evil 三字段）
const meta = (seed: string, hardMode: boolean, evil: 0 | 1) =>
  ({ seed, hardMode, evil } as Parameters<typeof worldIconName>[0]);

const SEEDS: Array<[string, string, boolean]> = [
  ['普通', '', true],
  ['drunk', 'CorruptionCrimson', false],   // evilVariants:false（原版 AWorldListItem.cs:133）
  ['FTW', 'FTW', true],
  ['NotTheBees', 'NotTheBees', true],
  ['Anniversary', 'Anniversary', true],
  ['DontStarve', 'DontStarve', true],
  ['Remix', 'Remix', true],
  ['Traps', 'Traps', true],
];

describe('世界图标资产存在性（worldIconName 组合表）', () => {
  const dir = path.resolve(__dirname, '../public/sprites/vanilla-ui');

  it.each(SEEDS)('%s 种子：hard×evil 全组合图标存在', (_label, seed, evilVariants) => {
    for (const hard of [false, true]) {
      for (const evil of [0, 1] as const) {
        const name = worldIconName(meta(seed, hard, evil));
        expect(fs.existsSync(path.join(dir, `${name}.png`)), `${name}.png 缺失`).toBe(true);
      }
    }
  });

  it('drunk 图标名不含双重段（回归：CorruptionCorruptionCrimson）', () => {
    const f = (hard: boolean) => worldIconName(meta('05162020', hard, 0));
    expect(f(false)).toBe('UI_IconCorruptionCrimson');
    expect(f(true)).toBe('UI_IconHallowCorruptionCrimson');
    expect(fs.existsSync(path.join(dir, 'UI_IconCorruptionCorruptionCrimson.png'))).toBe(false);
  });

  it('skyblock 专用图标存在', () => {
    expect(fs.existsSync(path.join(dir, 'UI_IconSkyblock.png'))).toBe(true);
  });
});

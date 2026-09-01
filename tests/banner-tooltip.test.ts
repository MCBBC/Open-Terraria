// 旗帜 buff tooltip 名单（Main.cs:21558-21612 bannerMouseOver 第二循环的 DOM 化）：
// 升序 npcId 逐个翻名、缺名剔除、'\n' 分行——静态文案之外的第二段。
import { describe, it, expect } from 'vitest';
import { bannerBuffNames } from '../src/stats/Buffs';

describe('bannerBuffNames', () => {
  it('升序排列 + \\n 分行（BannerSystem 枚举序等价）', () => {
    const names: Record<number, string> = { 3: '僵尸', 1: '史莱姆', 2: '恶魔眼' };
    expect(bannerBuffNames([3, 1, 2], (id) => names[id] ?? null)).toBe('史莱姆\n恶魔眼\n僵尸');
  });
  it('缺名 id 剔除（NPC_NAME_BY_ID 缺口防御）', () => {
    const names: Record<number, string> = { 7: '史莱姆女王' };
    expect(bannerBuffNames([7, 8, 9], (id) => names[id] ?? null)).toBe('史莱姆女王');
  });
  it('空覆盖集 → 空串（UI 端不追加名单段）', () => {
    expect(bannerBuffNames([], () => null)).toBe('');
  });
});

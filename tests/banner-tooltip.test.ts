// 旗帜 buff tooltip 名单（Main.cs:21558-21612 bannerMouseOver 第二循环的 DOM 化）：
// 升序 npcId 逐个翻名、缺名剔除、'\n' 分行——静态文案之外的第二段。
import { describe, it, expect } from 'vitest';
import { bannerBuffNames } from '../src/stats/Buffs';
import { scanBannerReps, scanBannerNpcs } from '../src/world/Banners';
import { TILE_BY_KEY, TILE_KEY_BY_SHEET } from '../src/data/tiles';

// r21 同款 mock store（帧解码复用）
function fakeStore(cells: Array<{ x: number; y: number; t: number; fx: number; fy: number }>) {
  const map = new Map<string, { t: number; fx: number; fy: number }>();
  for (const c of cells) map.set(String(c.x * 100000 + c.y), { t: c.t, fx: c.fx, fy: c.fy });
  return {
    idx: (x: number, y: number) => x * 100000 + y,
    isActive: (x: number, y: number) => map.has(String(x * 100000 + y)),
    type: new Proxy({}, { get: (_t, p) => map.get(String(p))?.t ?? 0 }),
    frameX: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fx ?? 0 }),
    frameY: new Proxy({}, { get: (_t, p) => map.get(String(p))?.fy ?? 0 }),
  } as unknown as Parameters<typeof scanBannerNpcs>[0];
}

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

describe('scanBannerReps：每旗种一枚代表 NPC（Main.cs:21563 BannerToNPC(i) 一旗一行）', () => {
  const bannerTile = TILE_BY_KEY['v_91_banners'];

  it('多 NPC 旗（僵尸旗覆盖多僵尸变体 id）→ 代表集仅 1 枚（名单不逐变体重复）', () => {
    const st = fakeStore([{ x: 10, y: 10, t: bannerTile, fx: (87 + 21) * 18, fy: 0 }]);
    const full = scanBannerNpcs(st, 0, 0, 20, 20);       // 效果覆盖集:全部变体 id
    const reps = scanBannerReps(st, 0, 0, 20, 20);       // 名单集:每旗一枚代表
    expect(full.size).toBeGreaterThanOrEqual(1);
    expect(reps.size).toBe(1);
    // 代表 ∈ 覆盖集且为最小 id（BannerToNPC 注册序 ≈ id 升序确定性等价）
    const rep = [...reps][0];
    expect(full.has(rep)).toBe(true);
    expect(rep).toBe(Math.min(...full));
  });

  it('同种旗两面 → 同一代表（旗种级去重）；异种旗 → 各一枚', () => {
    const st = fakeStore([
      { x: 10, y: 10, t: bannerTile, fx: (87 + 21) * 18, fy: 0 },   // 僵尸旗
      { x: 12, y: 10, t: bannerTile, fx: (87 + 21) * 18, fy: 0 },   // 僵尸旗再挂一面
      { x: 14, y: 10, t: bannerTile, fx: (2 + 21) * 18, fy: 0 },    // 恶魔眼旗(banner 2? npcToBanner 表驱动)
    ]);
    const reps = [...scanBannerReps(st, 0, 0, 20, 20)].sort((a, b) => a - b);
    expect(new Set(reps).size).toBe(reps.length);        // 无重复
    expect(reps.length).toBe(2);                         // 两种旗 = 两枚代表
  });
});

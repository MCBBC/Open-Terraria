// 史莱姆体内物品掉落的类型门回归（2026-08-19 用户实报"打死兔子掉珍珠石砖"）：
// 根因 = slimeBody 是【全局规则】（ItemDropDatabase.cs:684），原版 CanDrop 首判
// SlimeCanContainItems[type]（NPCID.cs:4791 = {1,59,147,184,537}）；本仓曾把类型门
// 外包给"只有史莱姆掷 ai[1]"——但 ai[1] 是全 NPC 族共享槽（兔子行走计时 120-898、
// 战士/蝙蝠计数都写它），任何怪死时 ai1 恰落 1..6146 即被当作物品 id 掉出
// （兔子 ai1=412 → 珍珠石砖 item 412）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveDrops } from '../src/drops/NpcDrops';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

// ★SW-BN6 2026-09-08 电池族 RNG 统一播种（范式=seeded-rng.ts,推广自 slime-item-ladder-parity）:
// 本文件掷面走注入 rng（baseCtx.rng）不依赖 Math.random,播种为电池族统一卫生面
// （防未来用例改动引入序列依赖时跨文件顺序漂移复发）。
beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const baseCtx = {
  type: 46, netId: 46,
  rng: { next: () => 0.5, int: (_a: number, _b: number) => 1, nextInt: (n: number) => 0, range: (a: number, _b: number) => a },
  luck: 0, isExpert: false,
  hp: 100, hpMax: 100, mana: 20, manaMax: 20,
  hardMode: false, value: 25,
  downed: () => false,
};

describe('slimeBody 类型门（SlimeCanContainItems[type]）', () => {
  it('兔子(46) ai1=412（行走计时被误读为物品 id）→ 不掉', () => {
    const out = resolveDrops({ ...baseCtx, type: 46, ai1: 412 } as never);
    expect(out.drops.some((d) => d.id === 412)).toBe(false);   // 珍珠石砖
    expect(out.drops.length).toBe(0);                          // 兔子无任何规则掉落
  });

  it('非史莱姆族全档（僵尸 3/蝙蝠 49/法师 29 兔 46 金兔 47）ai1 任意正数 → 不掉', () => {
    for (const type of [3, 49, 29, 46, 47, 121, 353]) {
      for (const ai1 of [1, 100, 412, 576, 4000, 6000]) {
        const out = resolveDrops({ ...baseCtx, type, ai1 } as never);
        expect(out.drops.some((d) => d.id === ai1)).toBe(false);
      }
    }
  });

  it('史莱姆族（1/59/147/184/537）ai1>0 → 照掉（类型门不误伤）', () => {
    for (const type of [1, 59, 147, 184, 537]) {
      const out = resolveDrops({ ...baseCtx, type, ai1: 412 } as never);
      expect(out.drops.some((d) => d.id === 412)).toBe(true);
    }
  });
});

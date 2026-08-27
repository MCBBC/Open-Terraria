// BiomeBackground 风格档兜底回归（2026-08-27 用户实报：帧循环 halt
// "Cannot read properties of undefined (reading 'filter')" @ Td.warm）。
// 根因家族 = seedPick 负模数历史案同源（FOREST_STYLES[-2]→undefined→渲染停摆，
// 类内 seedPick 注记）；当时补了 pickStyle 防御层但 warm/warmStyle/tint 三处
// 仍裸读表。修 = styleRow 统一兜底读（越界回退 [0]+fallbackWarn 留现场）。
import { describe, it, expect, vi } from 'vitest';
import { BiomeBackground } from '../src/render/BiomeBackground';

const scene = (over: Record<string, boolean>) => over as never;

function mk() {
  const bg = new BiomeBackground(false);
  (bg as unknown as { loadBg: unknown }).loadBg = () => Promise.resolve();   // 免 Image/document
  return bg;
}

describe('BiomeBackground styleRow 兜底', () => {
  it('corruptStyle 越界：warm 不抛、回退 CORRUPT_STYLES[0]、fallbackWarn 留现场', () => {
    const bg = mk();
    const b = bg as unknown as Record<string, unknown>;
    b.seededFor = 12345;
    b.corruptStyle = 9999;                       // 人为越界
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let loaded: number[] | null = null;
    b.loadBg = (ids: number[]) => { loaded = ids; return Promise.resolve(); };
    expect(() => bg.warm(scene({ zoneCorrupt: true }))).not.toThrow();
    expect(w).toHaveBeenCalledTimes(1);
    expect(String(w.mock.calls[0][0])).toContain('styleRow-corrupt');
    expect(loaded).toEqual([12, 13, 14]);        // 回退 [0]
    w.mockRestore();
  });
  it('正常路径不变：合法档加载对应贴图集（不触发告警）', () => {
    const bg = mk();
    (bg as unknown as Record<string, unknown>).seededFor = 12345;
    (bg as unknown as Record<string, unknown>).corruptStyle = 2;
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let loaded: number[] | null = null;
    (bg as unknown as { loadBg: (ids: number[]) => Promise<void> }).loadBg =
      (ids: number[]) => { loaded = ids; return Promise.resolve(); };
    bg.warm(scene({ zoneCorrupt: true }));
    expect(loaded).toEqual([211, 212, 213]);
    expect(w).not.toHaveBeenCalled();
    w.mockRestore();
  });
  it('种子暴力扫描×全群系：含负种子/跨零点，warm 全程无异常', () => {
    const zones = ['zoneCorrupt', 'zoneCrimson', 'zoneJungle', 'zoneSnow',
      'zoneHallow', 'zoneGlowshroom', 'zoneDesert', 'zoneBeach'] as const;
    for (let seed = -5; seed < 300; seed++) {
      const bg = mk();
      const rec = bg as unknown as { seededFor: number; seedFor?: (w: unknown) => void };
      rec.seededFor = seed;
      rec.seedFor?.({ seed, treeStyle: [0, 1, 2, 3] });
      for (const z of zones) {
        expect(() => bg.warm(scene({ [z]: true }))).not.toThrow();
      }
    }
  });
});

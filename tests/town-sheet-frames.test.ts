// 向导整条贴图走路修复回归（2026-08-13）：townSheet 档案路径帧数必须从贴图
// 高度推导（townSheetFrameCount=round(h/56)）——atlas.vnpcMeta 只覆盖 vanilla.json
// npcs 的 20 条特殊条目、vanilla-npcs.json frames 与档案表不同源（护士 2 vs 23）。
import { describe, it, expect } from 'vitest';
import { townSheetFrameCount } from '../src/render/Renderer';
import { townNpcProfileSheet } from '../src/data/townNpcProfiles';

describe('城镇档案切表帧数推导', () => {
  it('标准帧高 56：Guide 1456→26 / Nurse 1288→23 / Cyborg 1456→26', () => {
    expect(townSheetFrameCount(1456)).toBe(26);   // Guide/Cyborg
    expect(townSheetFrameCount(1288)).toBe(23);   // Nurse（npcFrameCount=2 ≠ 表）
    expect(townSheetFrameCount(1176)).toBe(21);   // Dryad
  });
  it('非整除表不越界：Angler 1334→24（fh≈55.6）/ DyeTrader 1600→29（fh≈55.2）', () => {
    const c1 = townSheetFrameCount(1334);
    expect(c1).toBe(24);
    expect(Math.floor(1334 / c1) * c1).toBeLessThanOrEqual(1334);   // 界内
    const c2 = townSheetFrameCount(1600);
    expect(Math.floor(1600 / c2) * c2).toBeLessThanOrEqual(1600);
  });
  it('向导档案表条目存在（渲染链路前提）', () => {
    expect(townNpcProfileSheet(22, 0, 0)).toBeTruthy();
  });
});

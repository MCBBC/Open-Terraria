// 向导整条贴图走路修复回归（2026-08-13）：townSheet 档案路径帧数必须回退
// vanilla-npcs.json frames（atlas.vnpcMeta 只覆盖 20 条特殊条目,城镇 NPC 不在其中）
import { describe, it, expect } from 'vitest';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';
import { townNpcProfileSheet } from '../data/townNpcProfiles';

describe('城镇档案切表帧数回退', () => {
  it('向导 22/护士 35/机械师 123：frames 均非 1（vnpcMeta 未登记者靠此回退）', () => {
    for (const id of [22, 35, 123, 207, 108]) {
      const f = VANILLA_NPCS[String(id)]?.frames ?? 1;
      expect(f, `npc ${id}`).toBeGreaterThanOrEqual(20);   // 城镇族帧数 20-30
    }
  });
  it('向导档案表条目存在且切片非 null（渲染链路前提）', () => {
    expect(townNpcProfileSheet(22, 0, 0)).toBeTruthy();
  });
});

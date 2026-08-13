// 向导整条贴图走路修复回归（2026-08-13）：townSheet 档案路径帧数必须取
// vanilla-npcs.json frames（=Main.npcFrameCount）。根因：atlas.vnpcMeta 只覆盖
// vanilla.json npcs 的 20 条特殊条目,城镇 NPC 不在其中 → ??1 → 帧高=整条。
// 二轮教训：高/56 反推对城镇史莱姆必错（670 表 476px/14 帧,帧高 34px）。
import { describe, it, expect } from 'vitest';
import { townSheetFrameCount } from '../src/render/Renderer';
import { VANILLA_NPCS } from '../src/data/vanillaNpcs';
import { townNpcProfileSheet } from '../src/data/townNpcProfiles';

describe('城镇档案切表帧数口径', () => {
  it('人形城镇族：Guide 26 / Nurse 23 / Mechanic 23 / Dryad 21', () => {
    expect(townSheetFrameCount(22)).toBe(26);
    expect(townSheetFrameCount(18)).toBe(23);
    expect(townSheetFrameCount(124)).toBe(23);
    expect(townSheetFrameCount(20)).toBe(21);
  });
  it('城镇史莱姆：14 帧（帧高 34-44px 可变,高/56 反推在此必错——回归锚）', () => {
    for (const id of [670, 678, 679, 680, 681, 682, 683, 684]) {
      expect(townSheetFrameCount(id)).toBe(14);
    }
  });
  it('未知 id 安全兜底 1（不炸、整条显示而非 NaN）', () => {
    expect(townSheetFrameCount(99999)).toBe(1);
  });
  it('向导档案表条目存在（渲染链路前提）', () => {
    expect(townNpcProfileSheet(22, 0, 0)).toBeTruthy();
  });
  it('全档案 id 帧数下限门（≥8,防再出 ??1 整条走路的静默回归）', () => {
    for (const [k, v] of Object.entries(VANILLA_NPCS)) {
      const id = Number(k);
      if (!townNpcProfileSheet(id, 0, 0)) continue;
      expect(v.frames, `npc ${id}`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('全量 NPC 帧数石锤（2026-08-13 复核批）', () => {
  it('修复 4 条 + 补 13 条：129/130=2、408=4、668=8；589=13（被困高尔夫球手）', () => {
    expect(townSheetFrameCount(129)).toBe(2);
    expect(townSheetFrameCount(130)).toBe(2);
    expect(townSheetFrameCount(408)).toBe(4);
    expect(townSheetFrameCount(668)).toBe(8);    // 鹿角怪（曾被误填 25）
    expect(townSheetFrameCount(589)).toBe(13);   // 此前 json 缺 → spawner 静默丢弃
    expect(townSheetFrameCount(624)).toBe(11);   // 地精
    expect(townSheetFrameCount(694)).toBe(30);   // 水矢宝箱怪
  });
  it('json 全量帧数 = Main.npcFrameCount（嵌入权威子集锚点,防再漂移）', () => {
    // 抽查跨段锚点:起步段/城镇段/肉山/月总/新增段（值=Main.npcFrameCount[697] 机械提取）
    for (const [id, fr] of [[3, 3], [22, 26], [113, 2], [398, 5], [668, 8], [694, 30]] as const) {
      expect(VANILLA_NPCS[String(id)].frames, `npc ${id}`).toBe(fr);
    }
    // 全 json 帧数下限门（=1 仅允许单帧怪；0/负必炸）
    for (const v of Object.values(VANILLA_NPCS)) {
      expect(v.frames).toBeGreaterThanOrEqual(1);
    }
  });
});

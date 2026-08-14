// 批次A回归（docs/dual-key-cleanup-plan.md 第 1 步 · 2026-08-14）：
// 双键注册 = 蛇形显式键（vi_832_living_wood_wand）+ 驼峰自动键（vi_832_LivingWoodWand，
// items.ts 自动注册循环）。删除驼峰条目前必须先搬移其独有字段——本套件锁死搬移成果：
// **任一双键对中，驼峰 def 的全部有效字段必须已被蛇形 def 覆盖（驼峰独有字段数 = 0）**。
// 搬移史：60 蛇形键 / 63 行补丁（tool×35 + axePower×7 + value×2 + wireTool×1 +
// tile×22 + placeStyle×14 = 81 字段，注释标来源驼峰键）。
// 已知不在本锁范围：10 处值冲突（蛇形为手工修正值：草药籽 tile/placeStyle、人偶 tile）、
// 14 个重复键异常（清理方案第 3 步，另行处理）。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';

const STRUCTURAL = new Set(['key', 'name', 'maxStack']); // maxStack 对 vi_ 键由 VANILLA_MAX_STACK 表恒等
const effectiveFields = (d: (typeof ITEM_DEFS)[number]) => {
  const o: Record<string, unknown> = {};
  for (const [f, v] of Object.entries(d)) if (!STRUCTURAL.has(f) && v !== undefined) o[f] = v;
  return o;
};

/** 全部双键对（同 vid 蛇形+驼峰齐备；蛇形取首注册 def） */
const dualPairs = (() => {
  const byVid = new Map<number, { snake: number[]; camel: number[] }>();
  ITEM_DEFS.forEach((d, i) => {
    const m = /^vi_(\d+)_(.+)$/.exec(d.key);
    if (!m) return;
    const vid = Number(m[1]);
    if (!byVid.has(vid)) byVid.set(vid, { snake: [], camel: [] });
    (/^[A-Z]/.test(m[2]) ? byVid.get(vid)!.camel : byVid.get(vid)!.snake).push(i);
  });
  return [...byVid.values()].filter((g) => g.snake.length && g.camel.length);
})();

describe('双键清理批次A：字段搬移差异清零', () => {
  it('配对基数就位（≥1200 对）——防止空转假绿', () => {
    expect(dualPairs.length).toBeGreaterThanOrEqual(1200);
  });

  it('驼峰 def 无任何蛇形未覆盖字段（搬移后差异清零）', () => {
    const uncovered: string[] = [];
    for (const g of dualPairs) {
      const snake = effectiveFields(ITEM_DEFS[g.snake[0]]);
      const camel = effectiveFields(ITEM_DEFS[g.camel[0]]);
      for (const f of Object.keys(camel))
        if (!(f in snake)) uncovered.push(`vid 对 ${ITEM_DEFS[g.snake[0]].key} 缺驼峰独有字段 ${f}（来源 ${ITEM_DEFS[g.camel[0]].key}）`);
    }
    expect(uncovered, `驼峰独有字段 ${uncovered.length} 个未搬移:\n${uncovered.join('\n')}`).toEqual([]);
  });

  it('搬移抽验：挖掘力三件套（tool/axePower）落进蛇形 def', () => {
    // vi_579_drax：pick 200 + axe 22（VANILLA_TOOL_POWERS 源数据，曾只落在驼峰 def）
    const drax = ITEM_DEFS[ITEM_BY_KEY['vi_579_drax']];
    expect(drax.tool).toEqual({ type: 'pick', power: 200 });
    expect(drax.axePower).toBe(22);
    // vi_122_molten_pickaxe：pick 100
    const molten = ITEM_DEFS[ITEM_BY_KEY['vi_122_molten_pickaxe']];
    expect(molten.tool).toEqual({ type: 'pick', power: 100 });
    // vi_1305_the_axe：hammer 100 + axe 35
    const axe = ITEM_DEFS[ITEM_BY_KEY['vi_1305_the_axe']];
    expect(axe.tool).toEqual({ type: 'hammer', power: 100 });
    expect(axe.axePower).toBe(35);
  });

  it('搬移抽验：value / wireTool / 锚桩 tile 落进蛇形 def', () => {
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_109_mana_crystal']].value).toBe(1);
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_1291_life_fruit']].value).toBe(1);
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_509_red_wrench']].wireTool).toEqual({ place: 1 });
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4379_wyvern_kite']].tile).toBe('v_723_kite_anchor');
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_4375_rat']].tile).toBe('v_724_critter_anchor');
    expect(ITEM_DEFS[ITEM_BY_KEY['vi_2001_f2001']].placeStyle).toBe(8); // 蝶族变体 1+2001-1994
  });
});

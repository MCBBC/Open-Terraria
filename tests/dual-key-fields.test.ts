// 批次A回归（docs/dual-key-cleanup-plan.md 第 1 步 · 2026-08-14）：
// 双键注册 = 蛇形显式键（vi_832_living_wood_wand）+ 驼峰自动键（vi_832_LivingWoodWand，
// items.ts 自动注册循环）。删除驼峰条目前必须先搬移其独有字段——本套件锁死搬移成果：
// **任一双键对中，驼峰 def 的全部有效字段必须已被蛇形 def 覆盖（驼峰独有字段数 = 0）**。
// 搬移史：60 蛇形键 / 63 行补丁（tool×35 + axePower×7 + value×2 + wireTool×1 +
// tile×22 + placeStyle×14 = 81 字段，注释标来源驼峰键）。
// 已知不在本锁范围：10 处值冲突（蛇形为手工修正值：草药籽 tile/placeStyle、人偶 tile）、
// 14 个重复键异常（清理方案第 3 步，另行处理）。
// ★2026-09-02 考古定性（本套件两红 → 守卫对齐当前阶段，依据 docs/dual-key-cleanup-plan.md
// 状态节同日考古条目；工作树实测仪=esbuild 打包 items 逐提交复算 dualPairs/差异）：
// ①基数红（611<1200）：阈值 1200 钉的是批次A时点基数（2026-08-14 实测 1227 对——彼时自动
//   注册循环对所有 vanilla.json vid 补驼峰 def＝同 vid 双注册并存，恰是清理方案要拔的病根）。
//   288267a5（2026-08-21）把该循环改按 vid 去重（VID_SEEN_IDX）+ Pascal 键别名到蛇形 def
//   （修「道具搜索双行雷管」＝1246 组同 vid 双注册，且避免 ITEM_DEFS 下标平移事故）→
//   双键对 1227→611。余对＝注册序晚于自动循环的蛇形族（banner×289＋f 兜底×33＋墙纸等×289）。
//   此与方案第 3 步「删驼峰注册」/第 6 步终态「同 vid 多键=0」同向，属计划内推进非回归 →
//   基数守卫按当前阶段基线 611 改 ≥600；第 3 步余量（f 兜底族等）若继续去重，对数会再降，
//   届时应重推基线或让本守卫随套件退役（重复键异常仍存：蛇形自身双注册 vid 122/217/1507/
//   1681/3392/3393/5359＋驼峰双 def vid 4851-4857，仍属第 3 步范围）。
// ②vi_2613 tile 红：51fefa56（2026-08-18）createTile 双源回填（itemfunc 提取优先、缺时回退
//   vanilla.json .items.createTile）令驼峰 def vi_2613_PinkDungeonChest 获 tile='chest'
//   （2613 不在 itemfunc 提取内，createTile 21→TILE_KEY_BY_SHEET 'chest'），而蛇形
//   vi_2613_f2613 注册在回填循环（items.ts 注册尾段）之后未被刷到 → 本次把 tile='chest'
//   追补进蛇形 def（行尾注释标来源驼峰键，同批次A惯例；金标 item-stats-golden-1457 守恒）。
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
  it('配对基数就位（当前阶段 ≥600 对；2026-08-21 按 vid 去重后基线 611）——防止空转假绿', () => {
    // 1200=批次A时点双注册基数，288267a5（2026-08-21）计划内去重后余 611，见文件头考古注
    expect(dualPairs.length).toBeGreaterThanOrEqual(600);
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
    // vi_579_drax：pick 200 + axe 22（VANILLA_TOOL_POWERS 源数据，曾只落在驼峰 def）。
    // 2026-08-22 F1 工具节奏修复：回填循环把 itemCombat 的 speed/useTime/damage/
    // knockback + 三力（pickPower/axePower/hammerPower）一并桥进 tool——此处按
    // Object.asymmetricMatch 抽核心力/节奏字段，不再钉全对象形状
    const drax = ITEM_DEFS[ITEM_BY_KEY['vi_579_drax']];
    expect(drax.tool).toMatchObject({ type: 'pick', power: 200, pickPower: 200, axePower: 22, useTime: 7, speed: 25 });
    expect(drax.axePower).toBe(22);
    // vi_122_molten_pickaxe：pick 100
    const molten = ITEM_DEFS[ITEM_BY_KEY['vi_122_molten_pickaxe']];
    expect(molten.tool).toMatchObject({ type: 'pick', power: 100, useTime: 18, speed: 23 });
    // vi_1305_the_axe：hammer 100 + axe 35
    const axe = ITEM_DEFS[ITEM_BY_KEY['vi_1305_the_axe']];
    expect(axe.tool).toMatchObject({ type: 'hammer', power: 100, hammerPower: 100, axePower: 35, useTime: 7 });
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

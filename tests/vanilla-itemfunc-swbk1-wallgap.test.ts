// SW-BK1 2026-09-06：vanilla-itemfunc.json createWall 向上归因守卫（永久守卫测试）。
// 缺口根因：提取器只认 `createWall = (\d+);` 字面——①共享 case 段/嵌套 case 专属段
// 的共享算式 `createWall = 116 + type - 1948;`（Item.cs:21139/21428/22090/22370/
// 24086/26651/33328 七处,1457/1458 同位）不被命中 → fallthrough 组非末支 26 件整缺、
// 组末支 7 件缺 createWall 键;②default 支内 if 区间块（:22764-22769,2263/2264 白/
// 蓝朝佰墙）整段丢弃 → 2 件整缺。
// 修 = tools/extract-itemfunc.mjs：evalArithExpr（extract-wallitems.mjs evalExpr 同构,
// evalFields fill-when-undefined）+ structuralIfRanges（wallitems 路径 B 同构,仅收
// createWall 体）。对账权威 = vanilla-wallitems.json（292 项,独立提取器,1456 基准）。
// 影响面：itemTooltip placeable 判定 / JourneyBrowser Walls 分组（cw）/
// Game.useTurn 兜底档（createWall 分支）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const RAW = JSON.parse(
  readFileSync(new URL('../src/data/vanilla-itemfunc.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, number>>;
const WALLITEMS = JSON.parse(
  readFileSync(new URL('../src/data/vanilla-wallitems.json', import.meta.url), 'utf8'),
) as Record<string, { wall: number }>;

// 35 件缺口面（SW-BK1 任务书 vids 分组）——每件应含 createWall,值 = wallitems 权威
const GAP_GROUPS: Array<[number, number]> = [
  [1948, 1957], [2008, 2014], [2158, 2160], [2210, 2213],
  [2263, 2264], [2432, 2434], [2789, 2791], [3760, 3762],
];
const GAP_VIDS: number[] = GAP_GROUPS.flatMap(([a, b]) => {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
});

describe('vanilla-itemfunc.json SW-BK1 createWall 向上归因', () => {
  it('35 件缺口逐件 createWall = vanilla-wallitems.json 权威值（共享算式 per-id 求值）', () => {
    expect(GAP_VIDS.length).toBe(35);
    for (const vid of GAP_VIDS) {
      const f = RAW[String(vid)];
      expect(f, `vid ${vid} 缺条目`).toBeTruthy();
      expect(f.createWall, `vid ${vid} createWall`).toBe(WALLITEMS[String(vid)].wall);
    }
  });

  it('28 件整缺条目按基态整条落表（与组末支同键面：useStyle/autoReuse/consumable）', () => {
    // 组末支（1957/2014/2160/2213/2434/2791/3762）此前已有这四键;新落表成员应同构
    // （useTurn 由 EXTRA_USETURN 后置叠加,1948 组 case 体显式 useTurn=true）
    for (const vid of [1948, 2008, 2158, 2210, 2263, 2432, 2789, 3760]) {
      const f = RAW[String(vid)];
      expect(f.useStyle, `vid ${vid} useStyle`).toBe(1);
      expect(f.autoReuse, `vid ${vid} autoReuse`).toBe(1);
      expect(f.consumable, `vid ${vid} consumable`).toBe(1);
      expect(f.useTurn, `vid ${vid} useTurn`).toBe(1);
    }
  });

  it('createWall 全域覆盖 = vanilla-wallitems.json（292=292,vid 集与值全等——双提取器对账）', () => {
    const funcCW = new Map(
      Object.entries(RAW).filter(([, v]) => v.createWall !== undefined).map(([k, v]) => [Number(k), v.createWall]),
    );
    const wallCW = new Map(Object.entries(WALLITEMS).map(([k, v]) => [Number(k), v.wall]));
    expect(funcCW.size).toBe(wallCW.size);
    for (const [vid, wall] of wallCW) expect(funcCW.get(vid), `vid ${vid}`).toBe(wall);
    for (const vid of funcCW.keys()) expect(wallCW.has(vid), `vid ${vid} 仅在 itemfunc`).toBe(true);
  });

  it('共享算式抽样锚（Item.cs 行号级）：116/126/133/138/142/146/173/228 基值族', () => {
    // Item.cs:21139 `createWall = 116 + type - 1948` → 1948=116 … 1957=125
    expect(RAW['1948']?.createWall).toBe(116);
    expect(RAW['1956']?.createWall).toBe(124);
    // :21428 / :22090 / :22370 / :22795 / :24086 / :26651 / :33328
    expect(RAW['2008']?.createWall).toBe(126);
    expect(RAW['2158']?.createWall).toBe(133);
    expect(RAW['2263']?.createWall).toBe(142);
    expect(RAW['2264']?.createWall).toBe(143);
    expect(RAW['2432']?.createWall).toBe(146);
    expect(RAW['2789']?.createWall).toBe(173);
    expect(RAW['3760']?.createWall).toBe(228);
  });
});

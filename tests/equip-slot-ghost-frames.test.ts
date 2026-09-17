// 装备面板空槽幽灵帧表 1:1 回归（BJ115 2026-09-17 用户实报"9 行面板末行中格无底图"）。
// 权威 = Terarria1457/Terraria.UI/ItemSlot.cs :2443-2478（1458 本域 diff 为空）：
//   · num15 映射 switch（:2443-2476）: case 8 盔甲 slot0/1/2→0/6/12；
//     case 10/24 配饰→11（无槽位条件）；case 9 时装盔甲 10/11/12→3/9/15；
//     case 11 时装配饰→2（★:2471-2473 无 slot 上限——13..19 全段同帧，
//     曾误帽 i≤17 ⇒ 恶魔心 18/大师 19 槽丢底图）；case 12/25/27/33 染料→1；
//     case 19 宠物→10 / 20 光源→17 / 18 矿车→7 / 17 坐骑→13 / 16 抓钩→4；
//     case 7 材料槽→18。
//   · 绘制门（:2451-2482）: item.IsAir && num15 != -1 → Extra[54].Frame(3,7)
//     34px 格取 32px（Width/Height-=2）、α 0.35、槽心居中。
// 本仓映射单源 = src/ui/UI.ts slotGhostFrame（misc 数组序 = miscEquips
// 宠物/光源/矿车/坐骑/抓钩 ↔ context 19/20/18/17/16，Main.cs:40616-40672 EquipPage 2）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { slotGhostFrame } from '../src/ui/UI';

const HERE = fileURLToPath(new URL('.', import.meta.url));

describe('装备面板空槽幽灵帧（ItemSlot.cs:2443-2478 → Extra[54] EquipIcons）', () => {
  it('装备盔甲 context 8：slot 0/1/2 → 帧 0/6/12（:2444-2450）', () => {
    expect(slotGhostFrame('armor', 0)).toBe(0);
    expect(slotGhostFrame('armor', 1)).toBe(6);
    expect(slotGhostFrame('armor', 2)).toBe(12);
  });

  it('装备配饰 context 10：slot 3-9 → 帧 11（:2454-2456 case 10 无槽位条件）', () => {
    for (let i = 3; i <= 9; i++) expect(slotGhostFrame('armor', i)).toBe(11);
  });

  it('时装盔甲 context 9：slot 10/11/12 → 帧 3/9/15（:2457-2465）', () => {
    expect(slotGhostFrame('armor', 10)).toBe(3);
    expect(slotGhostFrame('armor', 11)).toBe(9);
    expect(slotGhostFrame('armor', 12)).toBe(15);
  });

  it('★时装配饰 context 11：slot 13-19 全段 → 帧 2（:2471-2473 case 11 无槽位上限）', () => {
    // BJ115 回归钉：恶魔心 18 / 大师 19 槽曾漏（i≤17 误帽）→ 9 行面板末行中格无底图
    for (let i = 13; i <= 19; i++) expect(slotGhostFrame('armor', i)).toBe(2);
  });

  it('染料 context 12/33：dye/miscDye 全槽 → 帧 1（:2466-2470 case 12/33）', () => {
    for (let i = 0; i < 10; i++) {
      expect(slotGhostFrame('dye', i)).toBe(1);
      expect(slotGhostFrame('miscDye', i)).toBe(1);
    }
  });

  it('杂项 misc 0-4 = context 19/20/18/17/16 → 帧 10/17/7/13/4（:2443-2476 尾段）', () => {
    expect(slotGhostFrame('misc', 0)).toBe(10);   // 宠物 case 19
    expect(slotGhostFrame('misc', 1)).toBe(17);   // 光源 case 20
    expect(slotGhostFrame('misc', 2)).toBe(7);    // 矿车 case 18
    expect(slotGhostFrame('misc', 3)).toBe(13);   // 坐骑 case 17
    expect(slotGhostFrame('misc', 4)).toBe(4);    // 抓钩 case 16
  });

  it('背包/钱币/弹药语境无映射（num15 恒 -1 = 不画幽灵）', () => {
    expect(slotGhostFrame('inv', 0)).toBe(-1);
    expect(slotGhostFrame('inv', 49)).toBe(-1);
    expect(slotGhostFrame('chest', 0)).toBe(-1);
  });

  it('绘制接线面（源文本钉）：makeSlotEl 挂 ghost / paint 空槽门 / Extra_54 0.35 α', () => {
    const src = readFileSync(HERE + '../src/ui/UI.ts', 'utf8');
    // makeSlotEl：帧号 ≥0 才挂幽灵元素（ItemSlot.cs:2451 item.IsAir && num15 != -1 等价）
    expect(src).toMatch(/const ghostFrame = slotGhostFrame\(where, i\);\s*\n\s*if \(ghostFrame >= 0\) s\.appendChild\(makeSlotGhostEl\(ghostFrame\)\);/);
    // 幽灵元素：Extra_54 图集 + 0.35 α + 32px 内缩格（:2478-2482 num19/rectangle.Width-=2）
    expect(src).toMatch(/background:url\(sprites\/vanilla\/Extra_54\.png\) \$\{-col \* 34\}px \$\{-row \* 34\}px/);
    expect(src).toMatch(/opacity:0\.35/);
    // 有物隐藏（:2312 `item.type <= 0 || stack <= 0` 门等价——paint 链翻 display）
    expect(src).toMatch(/ghost\)\s*\(ghost as HTMLElement\)\.style\.display = content \? 'none' : 'block';/);
  });
});

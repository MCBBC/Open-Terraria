// SW-BJ58（2026-09-10）创造之手（vid5126 handOn23/handOff15）"不明物体横排"回归锁。
//
// 症状：装备创造之手,玩家静止面朝侧出现水平一排 6-9 个小工具精灵（世界层）。
// 定谳：非 UI 层泄漏、非 FX19 图标列、非尘/粒子——是玩家配饰身架层
// drawAccBodyFrame 对合成网格族贴图（Acc_HandsOn/HandsOff_*.png 360×224 = 9 列×4 行
// 的 40×56 格）按 sw=tex.width 整幅 9 列横排一次画出；且旧行守卫
// tex.height<56*(row+1) 在行走行(bodyRow≥4)早退整层不画 → "静止的时候面朝方向才有"。
// 原版金标：ArmorIDs.HandOn.Sets.UsesNewFramingCode 1-32 全真（ArmorIDs.cs:1583）/
// HandOff :1665 → 走 composite 路径,源矩形 = compFrontArmFrame/compBackArmFrame
// = CreateCompositeFrameRect(pt) = (pt.X*40, pt.Y*56, 40, 56)
//（PlayerDrawSet.cs:2247-2250;handOn×compFrontArmFrame PlayerDrawLayers.cs:3851,
// handOff×compBackArmFrame :1423-1427,后臂行=前臂行+2 PlayerDrawSet.cs:2046-2047;
// 列映射 = CreateCompositeData switch :1979-2007,站立=row0→列2）。
// 实机证据链：scripts/_bj58*.mjs（修前整幅 sw=360 ×18/3帧@(玩家锚,618,369)、
// 停 drawPlayer/drawAcc 层横排消失、修后 sw=40 单格 + rowBox 橙斑回落基线）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACC_COMP_ARM_CELL, accCompositeArmSrcRect } from '../src/data/vanillaAccDrawslots';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('SW-BJ58 合成臂格映射表（PlayerDrawSet.cs:1979-2007 字面移植）', () => {
  it('行 0-4：站立(2,0)/走A(3,0)/走B(4,0)/走C(5,0)/走D(6,0)', () => {
    expect(ACC_COMP_ARM_CELL.slice(0, 5)).toEqual([[2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]);
  });
  it('行 5-9：跳(2,1)/落(3,1)/走循环 7-10 全(4,1)', () => {
    expect(ACC_COMP_ARM_CELL.slice(5, 10)).toEqual([[2, 1], [3, 1], [4, 1], [4, 1], [4, 1]]);
  });
  it('行 10-19：11-13(3,1)/14(5,1)/15-16(6,1)/17(5,1)/18-19(3,1)', () => {
    expect(ACC_COMP_ARM_CELL.slice(10, 20)).toEqual([
      [4, 1], [3, 1], [3, 1], [3, 1], [5, 1], [6, 1], [6, 1], [5, 1], [3, 1], [3, 1],
    ]);
    expect(ACC_COMP_ARM_CELL).toHaveLength(20);
  });
});

describe('SW-BJ58 accCompositeArmSrcRect（CreateCompositeFrameRect 单格取样）', () => {
  const W = 360, H = 224;   // Acc_HandsOn_23.png / Acc_HandsOff_15.png 实测尺寸

  it('站立（row0）前臂带 = (80,0,40,56)——列 2（★变异点:旧 bug 值 sw=360 必红）', () => {
    const r = accCompositeArmSrcRect(W, H, 0, 0);
    expect(r).toEqual({ sx: 80, sy: 0, sw: 40, sh: 56 });
  });
  it('站立（row0）后臂带 = (80,112,40,56)——后臂行=前臂行+2（:2046-2047）', () => {
    const r = accCompositeArmSrcRect(W, H, 0, 2);
    expect(r).toEqual({ sx: 80, sy: 112, sw: 40, sh: 56 });
  });
  it('行走行（row7-10）→ (4,1) 单格;旧实现此行整层早退（"静止才有"症状）', () => {
    for (const row of [7, 8, 9, 10]) {
      const r = accCompositeArmSrcRect(W, H, row, 0);
      expect(r).toEqual({ sx: 160, sy: 56, sw: 40, sh: 56 });
    }
  });
  it('行 15-16 → 列 6;行 18-19 → 列 3（switch 尾段）', () => {
    expect(accCompositeArmSrcRect(W, H, 15, 0)).toMatchObject({ sx: 240, sy: 56 });
    expect(accCompositeArmSrcRect(W, H, 16, 0)).toMatchObject({ sx: 240, sy: 56 });
    expect(accCompositeArmSrcRect(W, H, 19, 2)).toMatchObject({ sx: 120, sy: 168 });
  });
  it('越界行钳制：row<0→row0 格、row>19→row19 格（不早退）', () => {
    expect(accCompositeArmSrcRect(W, H, -5, 0)).toEqual(accCompositeArmSrcRect(W, H, 0, 0));
    expect(accCompositeArmSrcRect(W, H, 99, 0)).toEqual(accCompositeArmSrcRect(W, H, 19, 0));
  });
  it('后臂带行钳制：3 行残表（texH=168）band2 → 钳到末行,不出界', () => {
    const r = accCompositeArmSrcRect(W, 168, 0, 2);
    expect(r).toMatchObject({ sy: 112, sh: 56 });   // (rows-1)*56 = 2*56
  });
  it('非合成网格族返回 null（40 宽竖条/气球 52/异宽 42——旧路径不受影响）', () => {
    expect(accCompositeArmSrcRect(40, 1120, 0, 0)).toBeNull();   // Acc_Back_35 竖条
    expect(accCompositeArmSrcRect(52, 224, 0, 0)).toBeNull();    // Acc_Balloon 竖条
    expect(accCompositeArmSrcRect(42, 1120, 0, 0)).toBeNull();   // 异宽竖条
    expect(accCompositeArmSrcRect(360, 224, 0, 0)).not.toBeNull();
  });
  it('朝向无关性：源矩形是纯几何(无 facing 入参),两次求值逐位相等——镜像由调用方 ctx 变换承担', () => {
    const a = accCompositeArmSrcRect(W, H, 0, 0);
    const b = accCompositeArmSrcRect(W, H, 0, 0);
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
    // 面朝左/右都画同一源格（玩家 draw 以 scale(facing) 镜像整层）
    expect(a!.sx % 40).toBe(0);
  });
});

describe('SW-BJ58 源码 tripwire（Renderer 配饰层接线防回退）', () => {
  const src = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');

  it('handOn 调用带前臂带参（…, 0)）且 handOff 带后臂带参（…, 2)）', () => {
    const handOn = src.split('\n').find((l) => l.includes('dyeHandOn') && l.includes('drawAccBodyFrame'));
    const handOff = src.split('\n').find((l) => l.includes('dyeHandOff') && l.includes('drawAccBodyFrame'));
    expect(handOn, 'handOn 调用行').toBeTruthy();
    expect(handOff, 'handOff 调用行').toBeTruthy();
    expect(handOn!.trim().endsWith(', 0);')).toBe(true);
    expect(handOff!.trim().endsWith(', 2);')).toBe(true);
  });
  it('合成网格族不再整幅取样：drawAccBodyFrame 源矩形消费 accCompositeArmSrcRect', () => {
    expect(src).toContain('accCompositeArmSrcRect(tex.width, tex.height, row, compBand)');
    // 旧实现签名（无 compBand 形参）不得回归
    expect(src).toMatch(/compBand: 0 \| 2 \| null = null/);
  });
});

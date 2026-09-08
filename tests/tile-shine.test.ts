// TileShine 通道金标测试（蓝队 2026-09-07 生命水晶暗处可见性修复）
//  权威面：Terarria1457/Terraria/Main.cs:21868-21951 Main.shine(ref Vector3) +
//  TileDrawing.cs:4429-4441 GetFinalLight / :4443-4471 ShouldTileShine +
//  Main.cs:7276-7331 等散点 tileShine2 赋值。纯函数抽测（乘区表/门逻辑/delta）。
import { describe, expect, it } from 'vitest';
import {
  SHINE2_SHEETS, shineMultiplier, shimmerTailMultiplier,
  shouldTileShine, shineDelta, isPulseShineSheet, isAdditiveShineSheet, SHINE_ADDITIVE,
} from '../src/render/TileShine';

const close3 = (got: [number, number, number], want: [number, number, number], id: string) => {
  expect(got[0], `${id}.R`).toBeCloseTo(want[0], 10);
  expect(got[1], `${id}.G`).toBeCloseTo(want[1], 10);
  expect(got[2], `${id}.B`).toBeCloseTo(want[2], 10);
};

describe('TileShine — Main.tileShine2 / Main.shine 移植', () => {
  it('tileShine2 全表 = 59 静态型 + 2 动态型（185/186）= 61 条目（Main.cs 赋值点逐一对账）', () => {
    expect(SHINE2_SHEETS.size).toBe(61);
    const all = [6, 7, 8, 9, 12, 21, 22, 25, 45, 46, 47,
      63, 64, 65, 66, 67, 68, 107, 108, 111, 117, 121, 122,
      147, 161, 163, 164, 166, 167, 168, 169, 178, 204, 211,
      221, 222, 223, 262, 263, 264, 265, 266, 267, 268,
      346, 347, 348, 370, 407, 441, 467, 468, 566, 639, 680, 681, 682, 685, 686];
    expect(all.length).toBe(59);
    for (const s of all) {
      expect(SHINE2_SHEETS.has(s), `sheet ${s} 应在 tileShine2 表`).toBe(true);
    }
    // 常见非成员（土/石/草/火把/树/门/工作台/平台）恒不在表
    for (const s of [0, 1, 2, 4, 5, 10, 17, 18, 19]) {
      expect(SHINE2_SHEETS.has(s), `sheet ${s} 不应在表`).toBe(false);
    }
    // ★F6a（2026-09-08 销账）：185/186（SmallPiles/LargePiles）Main.cs 无【静态】
    // 赋值，但 TileDrawing.cs:5223-5231/:5239-5247 GetTileDrawData 按堆叠帧【动态】
    // 写表（旧注"全库 grep 零命中→不在表"系截断假象）→ 入表 + shouldTileShine 帧门
    expect(SHINE2_SHEETS.has(185)).toBe(true);
    expect(SHINE2_SHEETS.has(186)).toBe(true);
  });

  it('★F6a 185/186 动态帧门（TileDrawing.cs:5223-5231/:5239-5247,上界闭区间）', () => {
    // 185 = frameY==18 ∧ frameX∈[576,882]（双端【闭】——与 467/468 的 <178 开区间不同源）
    expect(shouldTileShine(185, 576, false, 0, 18)).toBe(true);
    expect(shouldTileShine(185, 882, false, 0, 18)).toBe(true);   // 上界闭
    expect(shouldTileShine(185, 575, false, 0, 18)).toBe(false);
    expect(shouldTileShine(185, 883, false, 0, 18)).toBe(false);
    expect(shouldTileShine(185, 700, false, 0, 0)).toBe(false);   // frameY≠18 拒
    expect(shouldTileShine(185, 700, false, 0, 36)).toBe(false);
    // 186 = frameX∈[864,1170]（无 frameY 条件）
    expect(shouldTileShine(186, 864, false, 0, 0)).toBe(true);
    expect(shouldTileShine(186, 1170, false, 0, 0)).toBe(true);   // 上界闭
    expect(shouldTileShine(186, 863, false, 0, 0)).toBe(false);
    expect(shouldTileShine(186, 1171, false, 0, 0)).toBe(false);
    expect(shouldTileShine(186, 900, false, 0, 54)).toBe(true);   // frameY 无关
    // 乘区 case ×1.3（Main.cs:21913-21919）与 delta 联动（成员资格 × 帧门双闸）
    close3(shineDelta(185, 0, 0)!, [0.3, 0.3, 0.3], '185 ×1.3 delta');
    close3(shineDelta(186, 0, 0)!, [0.3, 0.3, 0.3], '186 ×1.3 delta');
  });

  it('Main.shine 乘区表逐 case（Main.cs:21874-21931）', () => {
    close3(shineMultiplier(12, 255), [1.6, 1.6, 1.6], '12 default ×1.6');   // 生命水晶
    close3(shineMultiplier(6, 255), [1.6, 1.6, 1.6], '6 default ×1.6');     // 铁矿
    close3(shineMultiplier(639, 255), [1.6, 1.6, 1.6], '639 default ×1.6'); // 魔力水晶
    close3(shineMultiplier(1, 255), [1, 1, 1], '1 石非成员恒等');
    close3(shineMultiplier(25, 255), [0.95, 0.85, 1.1], '25 Ebonstone');
    close3(shineMultiplier(117, 255), [1.1, 1, 1.2], '117 Pearlstone（Y 不动）');
    close3(shineMultiplier(147, 255), [1.1, 1.12, 1.15], '147 SnowBlock');
    close3(shineMultiplier(161, 255), [1.1, 1.12, 1.15], '161 IceBlock（147 同支）');
    close3(shineMultiplier(163, 255), [1.05, 1.1, 1.15], '163 CorruptIce');
    close3(shineMultiplier(164, 255), [1.1, 1.1, 1.2], '164 HallowedIce');
    close3(shineMultiplier(178, 255), [1.5, 1.5, 1.5], '178 ExposedGems（num4=0.5）');
    close3(shineMultiplier(185, 255), [1.3, 1.3, 1.3], '185 SmallPiles');
    close3(shineMultiplier(186, 255), [1.3, 1.3, 1.3], '186 LargePiles（同支）');
    close3(shineMultiplier(262, 255), [1, 1, 1], '262 Gemspark 加法支不走乘法');
    close3(shineMultiplier(268, 255), [1, 1, 1], '268 同支');
    // 脉动支：num = 0.3 + mouseTextColor/300（Main.cs:21886/:21892）
    const num = 0.3 + 255 / 300;
    close3(shineMultiplier(204, 255), [1.3 * num, 1, 1], '204 Crimtane（仅 R）');
    close3(shineMultiplier(211, 255), [1, 1.5 * num, 1.1 * num], '211 Chlorophyte（G/B）');
  });

  it('shimmer 尾段 lerp 乘子（Main.cs:21940-21953 → (1+0.2a,1,1+0.6a)）', () => {
    close3(shimmerTailMultiplier(0), [1, 1, 1], 'a=0 恒等');
    close3(shimmerTailMultiplier(1), [1.2, 1, 1.6], 'a=1 → shimmerShine 全量');
    close3(shimmerTailMultiplier(0.5), [1.1, 1, 1.3], 'a=0.5 中点');
  });

  it('ShouldTileShine 门（TileDrawing.cs:4443-4471）', () => {
    // tileShine2 成员 default true（帧无关）
    expect(shouldTileShine(12, 0, false, 0)).toBe(true);
    expect(shouldTileShine(12, 500, false, 0)).toBe(true);
    // 非 shine2 成员（石/空气）恒 false（shimmerAlpha=0）
    expect(shouldTileShine(1, 0, true, 0)).toBe(false);
    expect(shouldTileShine(0, 0, false, 0)).toBe(false);
    // 165 Stalactite / 693/694 Echo 硬编码支（非 shine2 也 true）
    expect(shouldTileShine(165, 0, false, 0)).toBe(true);
    expect(shouldTileShine(693, 0, false, 0)).toBe(true);
    expect(shouldTileShine(694, 0, false, 0)).toBe(true);
    // frameX 门：467/468 ∈ [144,178)
    expect(shouldTileShine(467, 0, false, 0)).toBe(false);
    expect(shouldTileShine(467, 143, false, 0)).toBe(false);
    expect(shouldTileShine(467, 144, false, 0)).toBe(true);
    expect(shouldTileShine(468, 177, false, 0)).toBe(true);
    expect(shouldTileShine(468, 178, false, 0)).toBe(false);
    // frameX 门：21/441 ∈ [36,178)
    expect(shouldTileShine(21, 0, false, 0)).toBe(false);
    expect(shouldTileShine(21, 35, false, 0)).toBe(false);
    expect(shouldTileShine(21, 36, false, 0)).toBe(true);
    expect(shouldTileShine(21, 162, false, 0)).toBe(true);
    expect(shouldTileShine(21, 178, false, 0)).toBe(false);
    expect(shouldTileShine(441, 36, false, 0)).toBe(true);
    // shimmer 支：shimmerAlpha>0 ∧ tileSolid → true（非 shine2 实心块也算）
    expect(shouldTileShine(1, 0, true, 0.001)).toBe(true);
    expect(shouldTileShine(1, 0, false, 0.5)).toBe(false);
    // shimmer 支与 tileShine2/frameX 门独立（先于 tileShine2 判定）
    expect(shouldTileShine(1, 0, true, 0.001)).toBe(true);
  });

  it('shineDelta = (k−1)⁺（负通道钳 0；shimmer 尾段并入）', () => {
    close3(shineDelta(12, 0, 0)!, [0.6, 0.6, 0.6], '12 ×1.6 delta');
    expect(shineDelta(1, 0, 0)).toBeNull();                    // 非成员零 delta
    expect(shineDelta(1, 0, 0)).toBeNull();
    const ebon = shineDelta(25, 0, 0)!;                        // (−0.05,−0.15,+0.1) 钳负
    expect(ebon[0]).toBe(0);
    expect(ebon[1]).toBe(0);
    expect(ebon[2]).toBeCloseTo(0.1, 10);
    // 非 shine2 实心块在 a=1 时 delta = 尾段 −1 = (0.2, 0, 0.6)
    close3(shineDelta(1, 0, 1)!, [0.2, 0, 0.6], 'shimmer 支实心块');
    // 脉动矿 204：R 支 delta
    const crim = shineDelta(204, 255, 0)!;
    expect(crim[0]).toBeCloseTo(1.3 * (0.3 + 255 / 300) - 1, 10);
    expect(crim[1]).toBe(0);
    expect(crim[2]).toBe(0);
  });

  it('支路谓词与常量', () => {
    expect(isPulseShineSheet(204)).toBe(true);
    expect(isPulseShineSheet(211)).toBe(true);
    expect(isPulseShineSheet(12)).toBe(false);
    expect(isPulseShineSheet(639)).toBe(false);
    expect(isAdditiveShineSheet(262)).toBe(true);
    expect(isAdditiveShineSheet(268)).toBe(true);
    expect(isAdditiveShineSheet(261)).toBe(false);
    expect(isAdditiveShineSheet(269)).toBe(false);
    expect(SHINE_ADDITIVE).toBeCloseTo(0.39, 10);
  });
});

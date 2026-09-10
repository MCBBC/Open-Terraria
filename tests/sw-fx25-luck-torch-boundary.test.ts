// SW-FX25：火炬幸运「地下扫描」门界定谳回归（TryRecalculatingTorchLuck 1457
// Player.cs:17859-17862 + :18032）。
//
// 定谳（本批三笔之一）：
//   原式 `nextTorchLuckCheckCenter.Y < Main.worldSurface * 16.0` → 地表支（Consume,
//   torchLuck=0）；反形 = 地下支 ⟺ **Center.Y ≥ worldSurface*16**。
//   锚 = 玩家盒【中心】（:18032 `_nextTorchLuckCheckCenter = base.Center`）。
//   任务线传入的"原版 position.Y≤worldSurface（顶边锚）/ 21px 中心锚偏"处方
//   【被反编译证伪】：顶边锚（position.Y）属同域另两门——TorchAttack :17935 /
//   torchGod 触发 :18182（RB9a 已按顶边另修）——与坠星 :72410 同款；torchLuck
//   归零界不在其列。按顶边锚改会新造 21px 偏差。
//   真偏差（已修）：旧仓 `cy/16 > groundLevel`（开区间 >）把界值拍
//   cy == worldSurface*16 误归地表支（原版 `<` 反形 = 闭区间 ≥）。
import { describe, it, expect } from 'vitest';
import { torchLuckCheckCenterBelowSurface } from '../src/stats/Luck';

describe('SW-FX25 torchLuck 地下门界（Center.Y ≥ worldSurface*16,1457:17859-17862）', () => {
  it('界值拍（centerY == worldSurface*16）进地下支（原版 `<` 反形 = ≥）——旧 `>` 偏差点', () => {
    expect(torchLuckCheckCenterBelowSurface(5760, 360)).toBe(true);   // 360*16=5760 界值拍
    expect(torchLuckCheckCenterBelowSurface(5760.5, 360)).toBe(true);
    expect(torchLuckCheckCenterBelowSurface(5759.999, 360)).toBe(false); // 中心 < 界 → 地表支
  });

  it('非整 worldSurface（生成面 0.5 格档）同式：界 = ws*16 精确闭区间', () => {
    // vanilla worldSurface 为 double（如 335.5）→ *16 = 5368 整;若 ws 本身带小数,
    // 界值仍按 ws*16 逐位比较（无 tile 取整——原式直乘 16.0 不取整）
    expect(torchLuckCheckCenterBelowSurface(5368, 335.5)).toBe(true);
    expect(torchLuckCheckCenterBelowSurface(5367.75, 335.484375)).toBe(true);  // 335.484375*16=5367.75
    expect(torchLuckCheckCenterBelowSurface(5367.7, 335.484375)).toBe(false);
  });

  it('地下深处/深空两端不回退（修后回归保护）', () => {
    expect(torchLuckCheckCenterBelowSurface(900 * 16, 360)).toBe(true);   // 深地下
    expect(torchLuckCheckCenterBelowSurface(10 * 16, 360)).toBe(false);   // 地表上空
  });
});

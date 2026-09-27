// 血月水体染色作用域——语义回归锁（2026-09-27，血月×微光湖坡面红浸润定谳案）。
// 【定谳】用户实报"血月期间微光湖底坡面出现红色水浸润、微光不应变红"→ 定谳 =
//  原版行为：红洼 cell = 水（liquidType 1），血月水色 style9 只作用于 Type0 水；
//  微光在原版与本体均【不可达】血月红（机制级排除）。
// 【vanilla 锚（1457 反编译唯一标杆）】
//  - Main.cs:57820 `waterStyleOverride = (bloodMoon ? 9 : biome.WaterStyle)`；
//  - LiquidRenderer.cs DrawNormalLiquids :655-661 switch(num2)：仅 case 0（水）
//    remap 成 waterStyle；case 1/2（岩浆/蜂蜜）保自有表；
//  - LiquidRenderer.cs PrepareDraw :587-613：Type 3（微光）cell 整体搬出
//    _drawCache → _drawCacheForShimmer，DrawNormalLiquids 永不触碰微光格；
//  - Main.cs:58403 DrawShimmer 独立绘制路径，签名无 waterStyle；其顶点色
//    SetShimmerVertexColors :745-759 = 光照 × GetShimmerBaseColor :803-807
//    （薰衣草 lerp，无任何血月输入）；
//  - 浸润带同构：TileDrawing.cs DrawTile_LiquidBehindTile :3940-4053 邻液类型
//    case 0→flag6（终局 num10==0 → Main.waterStyle =9 红）、case 3→num10=14。
// 【实机对拍】scripts/_bm-shimmer-lab3.mjs / _bm-shimmer-ab.mjs：血月夜同帧
//  水池 [154,13,10] 血红、微光池 [195,138,236] 淡紫（无血月 [185,145,248] 同域）；
//  liqgl ON/OFF 双臂定性一致（红=水格语义与批化刀无关）。
// 本锁面 = 贴图选择纯函数（血月 style9 不得外溢到非水液体）+ 微光表常值。
import { describe, it, expect } from 'vitest';
import { waterSheet, liquidSlopeSheet } from '../src/render/VanillaLiquidRenderer';

describe('★血月水体染色作用域（style9 只染 Type0 水；微光/岩浆/蜂蜜不可达）', () => {
  it('水(vt0) 吃血月水色：style9 → Misc_water_9（血红表）', () => {
    expect(waterSheet(0, 9)).toBe('vanilla/Misc_water_9.png');
    // 对照：无血月地表 style0 → 蓝水表
    expect(waterSheet(0, 0)).toBe('vanilla/Misc_water_0.png');
  });

  it('微光(vt3) 恒 Misc_water_14——任何 waterStyle（含血月 9）不可染红', () => {
    expect(waterSheet(3, 9)).toBe('vanilla/Misc_water_14.png');
    expect(waterSheet(3, 0)).toBe('vanilla/Misc_water_14.png');
    expect(waterSheet(3, 13)).toBe('vanilla/Misc_water_14.png');
  });

  it('岩浆(vt1)/蜂蜜(vt2) 同样不吃 waterStyle（血月 9 不外溢）', () => {
    expect(waterSheet(1, 9)).toBe('vanilla/Misc_water_1.png');
    expect(waterSheet(2, 9)).toBe('vanilla/Misc_water_11.png');
  });

  it('浸润带/LiquidSlope 斜面表同构：微光=14 恒定，水=群系色（血月 9）', () => {
    // vt=原版 LiquidType 0水/1岩浆/2蜂蜜/3微光（drawLiquidBehindTilesOnly texFor/slopeTexFor 消费域）
    expect(liquidSlopeSheet(0, 9)).toBe('vanilla/LiquidSlope_9.png');   // 水→血月红（原版同款）
    expect(liquidSlopeSheet(3, 9)).toBe('vanilla/LiquidSlope_14.png');  // 微光→14 不变
    expect(liquidSlopeSheet(3, 0)).toBe('vanilla/LiquidSlope_14.png');
    expect(liquidSlopeSheet(1, 9)).toBe('vanilla/LiquidSlope_1.png');   // 岩浆
    expect(liquidSlopeSheet(2, 9)).toBe('vanilla/LiquidSlope_11.png');  // 蜂蜜
  });
});

// 极光天空(AuroraSky.cs)锁测试——月相门 / _lastSkyColor 赋值 / 首尾 180tick
// 淡入出 / opacity×0.08 tileColor 渗入 / 淡入淡出速率。
// 锚:AuroraSky.cs:69-75(gate)/:85-123(月相 switch)/:191-402(段几何) /
// :33-56(Update)/:376-379(_lastSkyColor)/:410-422(ModifyTileColor);
// Main.cs:63356-63361(SetBackColor 尾调用序);Main.hslToRgb :47266-47296。
import { describe, it, expect } from 'vitest';
import {
  auroraMode, auroraGatedOpacity, auroraLastSkyColor, AuroraSky, AURORA_SEG,
} from '../src/render/AuroraSky';
import {
  colorOfTheSkies, skySeed, setFrameAurora, setFrameHorizon, setFrameBiome,
  setFrameCloudDim, setFrameLightning,
} from '../src/lighting/SkyColor';

describe('AuroraSky 月相门(AuroraSky.cs:85-123 switch)', () => {
  it('QuarterAtLeft(:102)/HalfAtRight(:113)return 不画', () => {
    expect(auroraMode(3)).toBeNull();
    expect(auroraMode(6)).toBeNull();
  });
  it('带数/α乘子/饱和度:Full=3带、3QL/QR=2带+flag5、HalfL/3QR=3带+×0.5、Empty=3带', () => {
    expect(auroraMode(0)).toMatchObject({ bands: 3, full: true, alphaMul: 1, saturation: 1, hueFreq: 2.5 });
    expect(auroraMode(1)).toMatchObject({ bands: 2, twoBand: true, alphaMul: 1, saturation: 1 });
    expect(auroraMode(2)).toMatchObject({ bands: 3, emptyLike: true, halfLike: true, dim: true, alphaMul: 0.5, saturation: 1, hueFreq: 0.5, hueOffset: 0.02 });
    expect(auroraMode(4)).toMatchObject({ bands: 3, emptyLike: true, halfLike: false, alphaMul: 1, saturation: 1, hueFreq: 1, hueOffset: 0.45 });
    expect(auroraMode(5)).toMatchObject({ bands: 2, twoBand: true, alphaMul: 1, saturation: 0.5 });
    expect(auroraMode(7)).toMatchObject({ bands: 3, alphaMul: 0.5, saturation: 0.5, hueFreq: 0.5, hueOffset: 0.02 });
  });
});

describe('AuroraSky 首尾 180tick 淡入出(:69-75)', () => {
  it('夜 90t → ×0.5;32310t → ×0.5(尾段对称);mid-night → ×1;白天 → 0', () => {
    expect(auroraGatedOpacity(1, 90, false)).toBeCloseTo(0.5, 12);
    expect(auroraGatedOpacity(1, 32400 - 90, false)).toBeCloseTo(0.5, 12);
    expect(auroraGatedOpacity(1, 16200, false)).toBeCloseTo(1, 12);
    expect(auroraGatedOpacity(1, 100, true)).toBe(0);            // :72 白天 return
    expect(auroraGatedOpacity(0.005, 16200, false)).toBe(0);     // ≤0.01 return
  });
});

describe('_lastSkyColor 赋值(:376-379:带0/段 num9=19 的 color)', () => {
  // num10=19/140;color = hslToRgb((num5 + cos(num10·2π·num7)·0.1)%1, saturation, 0.5)
  // 参考值经 C# 式独立计算锚定(num5 = 12.34·60/60 = globalTime 740.4s/60)
  const gt = 740.4;
  it('满月/左三分之二:num7=2.5 → cos=−0.5320 → 绿色系', () => {
    expect(auroraLastSkyColor(0, gt)).toEqual([71, 255, 0]);
    expect(auroraLastSkyColor(1, gt)).toEqual([71, 255, 0]);
  });
  it('半月族:num7=0.5 → cos=+0.9105;空月族:num7=1', () => {
    expect(auroraLastSkyColor(2, gt)).toEqual([0, 255, 150]);
    expect(auroraLastSkyColor(4, gt)).toEqual([0, 255, 111]);
  });
  it('右四分之一:饱和度 0.5(:111);右三分之二:0.5 饱和+num7=0.5(:121-122)', () => {
    expect(auroraLastSkyColor(5, gt)).toEqual([99, 191, 64]);
    expect(auroraLastSkyColor(7, gt)).toEqual([64, 191, 139]);
  });
  it('不画月相 → (0,0,0)(默认 Color,ModifyTileColor 强制 A=255 后即黑)', () => {
    expect(auroraLastSkyColor(3, gt)).toEqual([0, 0, 0]);
    expect(auroraLastSkyColor(6, gt)).toEqual([0, 0, 0]);
  });
  it('段常量:140(AuroraSky.cs:135 num6)', () => {
    expect(AURORA_SEG).toBe(140);
  });
});

describe('AuroraSky.Update 淡入淡出(:33-56)', () => {
  it('淡入 +0.3/s 钳 1(:50-54);淡出 −0.5/s 归零停(:41-46)', () => {
    const a = new AuroraSky();
    a.setActive(true);
    expect(a.opacity).toBe(0);
    a.update(1);
    expect(a.opacity).toBeCloseTo(0.3, 12);
    a.update(2);                        // 0.3+0.6=0.9
    expect(a.opacity).toBeCloseTo(0.9, 12);
    a.update(1);                        // 1.2 → 钳 1
    expect(a.opacity).toBe(1);
    a.setActive(false);                 // Deactivate:_isLeaving=true(:432)
    a.update(1);                        // 1−0.5
    expect(a.opacity).toBeCloseTo(0.5, 12);
    expect(a.isActive).toBe(true);      // 淡出中 _isActive 仍 true(:44 归零才翻)
    a.update(1.5);                      // 0.5−0.75<0 → 归零停
    expect(a.opacity).toBe(0);
    expect(a.isActive).toBe(false);
  });
  it('淡出中重入不重 Activate(ManageSpecialBiomeVisuals :123-133 的 IsActive 守卫)', () => {
    const a = new AuroraSky();
    a.setActive(true);
    a.update(2);                        // 0.6
    a.setActive(false);                 // leaving
    a.update(0.2);                      // 0.6−0.1=0.5,_isActive 仍 true
    a.setActive(true);                  // on === IsActive() → 无操作(原版怪癖)
    a.update(0.2);
    expect(a.opacity).toBeCloseTo(0.4, 12);   // 仍在淡出
    a.update(1);                        // 归零
    expect(a.isActive).toBe(false);
    a.setActive(true);                  // 完全停下后才可重激活
    expect(a.isActive).toBe(true);
  });
  it('tileColorState:opacity≤0 → null(:412 门)', () => {
    const a = new AuroraSky();
    expect(a.tileColorState()).toBeNull();
    a.setActive(true);
    a.update(1);
    expect(a.tileColorState()).toMatchObject({ opacity: 0.3 });
  });
});

describe('ModifyTileColor 渗入(Main.cs:63360,序在 :63356 ModifyHorizonLight 后)', () => {
  // 深夜 timeOfDay=0:setBackColor → [5,5,5] → 满月地板 19 → [19,19,19]
  // (与 horizon-parity 同源锚);极光 [200,50,50]×opacity0.5 → k=0.04
  resetFrameState();
  it('cots 三通道 lerp 0.04(:419 opacity×0.08)', () => {
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 0 });
    const c = colorOfTheSkies(0, 1, false, false, 0);
    expect(c[0]).toBeCloseTo(19 + (200 - 19) * 0.04, 10);
    expect(c[1]).toBeCloseTo(19 + (50 - 19) * 0.04, 10);
    expect(c[2]).toBeCloseTo(19 + (50 - 19) * 0.04, 10);
  });
  it('月相 QuarterAtLeft(:415)直通;null 态直通', () => {
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 3 });
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
    setFrameAurora(null);
    expect(colorOfTheSkies(0, 1, false, false, 0)).toEqual([19, 19, 19]);
  });
  it('skySeed(tileColor :62608)同链消费:lerp 后 [26.24,20.24,20.24] 加权均值', () => {
    const base = skySeed(0, 1, false, false, 0);
    expect(base[0]).toBeCloseTo(190 / 2550, 12);   // (19·3+7·19)/10/255
    setFrameAurora({ rgb: [200, 50, 50], opacity: 0.5, phase: 0 });
    const withAur = skySeed(0, 1, false, false, 0);
    // bg=[26.24,20.24,20.24] → R=(66.72+7·26.24)/10/255、G=(66.72+7·20.24)/10/255
    expect(withAur[0]).toBeCloseTo(250.4 / 2550, 9);
    expect(withAur[1]).toBeCloseTo(208.4 / 2550, 9);
  });
});

/** 模块帧状态复位(测试间隔离——Renderer 每帧都会重写,此处显式归零) */
function resetFrameState(): void {
  setFrameAurora(null);
  setFrameHorizon(null);
  setFrameBiome(null);
  setFrameCloudDim(1);
  setFrameLightning(0);
}

// SW-BJ27 2026-09-07：沙漠高温热扭曲（HeatDistortion 沙漠支）1:1 移植回归。
// 原版链（1457 行号;1456 = −3）：
//  ① SceneState.cs:107 flag3 沙漠门 = TileCenter.Y < worldSurface && ZoneDesert
//     && !ZoneRain && !ZoneSandstorm（无 dayTime 项——昼夜差由天空色亮度承载）
//  ② SceneState.cs:125-126 激活 = Main.UseHeatDistortion & ((flag2|flag3) || sunScorch>0)
//  ③ SceneState.cs:201-207 沙漠强度 val3 = outsideWeatherEffectIntensity × 4
//     × max(0, 0.5−cloudAlpha) × num9（num9 = Main.tileColor 三通道均值）；
//     ★else-if——flag2（地狱）优先,沙漠支只在非地狱带求值
//  ④ Main.tileColor = ApplyColorOfTheSkiesToTiles（Main.cs:64134-64142,Draw :62929
//     在 SetBackColor 后调用）逐通道 C=(Σrgb+7C)/10 + SkyManager.ProcessTileColor
//     （SkyManager.cs:92-99——活跃天空 OnTileColor,柱族五天覆盖;本仓未接=登记债）
//  ⑤ SceneState.cs:208-209 UseIntensity(num8)/IsHidden = num8≤0 → Filter.IsVisible
//     （Filter.cs:61-68）= false：激活与斜坡照常,只是不画
//  ⑥ outsideWeatherEffectIntensity（SceneState.cs:178-179）= MoveTowards(
//     BehindBackwall ? −0.1 : 1.1, 0.005) 钳 [0,1] —— weather.outsideWeatherEffect 同源
// ★翻案备案：本仓旧注"Main.tileColor 全源码无赋值 → 沙漠支死支"系 head 截断 grep
//   误判（Main.cs:64137-64141 每帧赋值,1456/1457 同在）——用户实报"原版沙漠有热
//   扭曲"与反编译一致,本批把强度支扶正。
import { describe, it, expect } from 'vitest';
import {
  MonolithFilters, emptyMonolithScene,
  type MonolithEnv,
} from '../src/render/MonolithFilters';
import { tileColor } from '../src/lighting/SkyColor';

function baseEnv(over: Partial<MonolithEnv> = {}): MonolithEnv {
  return {
    worldSurface: 100, rockLevel: 160, screenTileY: 60,
    dayTime: true, hour24: 12, nightElapsed01: 0,
    fullMoon: false, worldBloodMoon: false, cloudAlpha: 0,
    heatTileCenterY: 60, heatMaxTilesY: 600,
    ...over,
  };
}

function step(mf: MonolithFilters, ms: number, over: Partial<MonolithEnv>): void {
  mf.update(ms, emptyMonolithScene(), baseEnv(over));
}

/** 沙漠白天基准环境：白天空 num9=1、露天、无云 */
const DESERT_DAY = {
  heatZoneDesert: true, heatZoneRain: false, heatZoneSandstorm: false,
  heatTileColor: [255, 255, 255] as const, heatOutsideWeather: 1, cloudAlpha: 0,
};

describe('SW-BJ27 沙漠热扭曲触发矩阵（SceneState.cs:107/:125-126）', () => {
  it('沙漠域内（地表）激活;域外不激活', () => {
    const inZone = new MonolithFilters();
    step(inZone, 100, DESERT_DAY);
    expect(inZone.heatActive).toBe(true);
    expect(inZone.heatIntensity).toBeCloseTo(2.0, 6);   // 1×4×0.5×1
    const outZone = new MonolithFilters();
    step(outZone, 100, { ...DESERT_DAY, heatZoneDesert: false });
    expect(outZone.heatActive).toBe(false);
    expect(outZone.heatIntensity).toBe(0);
  });

  it('地下（TileCenter.Y ≥ worldSurface）不算沙漠带——flag3 高度门 :107', () => {
    const under = new MonolithFilters();
    step(under, 100, { ...DESERT_DAY, heatTileCenterY: 100 });   // 恰在 worldSurface
    expect(under.heatActive).toBe(false);                        // < 严格比较
    const deep = new MonolithFilters();
    step(deep, 100, { ...DESERT_DAY, heatTileCenterY: 150 });
    expect(deep.heatActive).toBe(false);
  });

  it('下雨（ZoneRain）/沙暴（ZoneSandstorm）各自独立关死激活门 :107', () => {
    const rain = new MonolithFilters();
    step(rain, 100, { ...DESERT_DAY, heatZoneRain: true });
    expect(rain.heatActive).toBe(false);
    const storm = new MonolithFilters();
    step(storm, 100, { ...DESERT_DAY, heatZoneSandstorm: true });
    expect(storm.heatActive).toBe(false);
  });

  it('昼夜：无硬昼夜门——夜天空暗 → num9 小 → 弱扭曲仍可见（:107 无 dayTime 项）', () => {
    // 深夜天空 (20,30,40)：num9 = 90/3/255 ≈ 0.1176 → val3 ≈ 0.235 > 0 → 可见
    const night = new MonolithFilters();
    step(night, 100, {
      ...DESERT_DAY, dayTime: false,
      heatTileColor: [20, 30, 40] as const,
    });
    expect(night.heatActive).toBe(true);
    expect(night.heatIntensity).toBeCloseTo(4 * 0.5 * ((20 + 30 + 40) / 3 / 255), 6);
    expect(night.heatVisible).toBe(true);
    // 白天基准（num9=1）比深夜强 8.5 倍
    const day = new MonolithFilters();
    step(day, 100, DESERT_DAY);
    expect(day.heatIntensity).toBeGreaterThan(night.heatIntensity * 8);
  });

  it('useHeatDistortion=false 视频开关总闸（:126 Main.UseHeatDistortion）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { ...DESERT_DAY, useHeatDistortion: false });
    expect(mf.heatActive).toBe(false);
  });
});

describe('SW-BJ27 沙漠强度档（SceneState.cs:201-207 val3 公式）', () => {
  it('val3 = 室外强度 ×4 × max(0,0.5−cloudAlpha) × num9——逐因子数值锚', () => {
    // num9 扫描：天空均值 128 → num9=128/255
    const mf = new MonolithFilters();
    step(mf, 100, { ...DESERT_DAY, heatTileColor: [128, 128, 128] as const });
    expect(mf.heatIntensity).toBeCloseTo(4 * 0.5 * (128 / 255), 6);
    // cloudAlpha 渐进：0.3 → 系数 0.2
    const c3 = new MonolithFilters();
    step(c3, 100, { ...DESERT_DAY, cloudAlpha: 0.3 });
    expect(c3.heatIntensity).toBeCloseTo(4 * 0.2 * 1, 6);
    // cloudAlpha 恰 0.5 → 0；>0.5 → max 钳 0
    const c5 = new MonolithFilters();
    step(c5, 100, { ...DESERT_DAY, cloudAlpha: 0.5 });
    expect(c5.heatIntensity).toBe(0);
    const c9 = new MonolithFilters();
    step(c9, 100, { ...DESERT_DAY, cloudAlpha: 0.9 });
    expect(c9.heatIntensity).toBe(0);
    // 室外强度线性：半程 0.5 → 减半
    const half = new MonolithFilters();
    step(half, 100, { ...DESERT_DAY, heatOutsideWeather: 0.5 });
    expect(half.heatIntensity).toBeCloseTo(1.0, 6);
  });

  it('num9 恒等式：tileColor((Σ+7C)/10) 三通道均值 = 天空色均值/255（Main.cs:64138-64140）', () => {
    // 本仓 SkyColor.tileColor 即 ApplyColorOfTheSkiesToTiles 逐通道式（0-1 归一）。
    // 均值恒等：avg_i[(Σ+7C_i)/10] = (3Σ+7Σ)/30/255 = Σ/3/255——7C 倾斜相消。
    // 故 SceneState.cs:203-204 的 num9 可直接吃 ColorOfTheSkies 均值。
    for (const bg of [[100, 150, 255], [230, 220, 220], [35, 35, 35], [255, 80, 60]]) {
      const tc = tileColor(bg as [number, number, number]);
      const meanTile = (tc[0] + tc[1] + tc[2]) / 3;
      const meanSky = (bg[0] + bg[1] + bg[2]) / 3 / 255;
      expect(meanTile).toBeCloseTo(meanSky, 10);
    }
  });

  it('tileColor 缺省（首帧）→ num9=0：激活但 IsHidden（原版 default(Color) 同态）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, {
      heatZoneDesert: true, heatZoneRain: false, heatZoneSandstorm: false,
      heatOutsideWeather: 1, cloudAlpha: 0,
      // heatTileColor 不传 = Renderer 首帧前态
    });
    expect(mf.heatActive).toBe(true);
    expect(mf.heatOpacity).toBeCloseTo(0.1, 5);   // 斜坡照常走（FilterManager :95-101）
    expect(mf.heatIntensity).toBe(0);
    expect(mf.heatVisible).toBe(false);           // :209 IsHidden → Filter.cs:61-68 不画
  });

  it('IsHidden 只门可见性：强度归零后激活期斜坡仍上走、离带后保末值淡出', () => {
    const mf = new MonolithFilters();
    // 激活但 hidden（云厚）持续 1s → opacity 满格
    for (let i = 0; i < 10; i++) {
      step(mf, 100, { ...DESERT_DAY, cloudAlpha: 0.9 });
    }
    expect(mf.heatActive).toBe(true);
    expect(mf.heatOpacity).toBeCloseTo(1, 6);     // 10×0.1s 累计 FP 漂移
    expect(mf.heatVisible).toBe(false);
    // 云散 → 同一激活态内强度恢复（intensity 每 Active 帧刷新 :208）
    step(mf, 16, DESERT_DAY);
    expect(mf.heatIntensity).toBeCloseTo(2.0, 6);
    expect(mf.heatVisible).toBe(true);
    // 离带 → inactive：opacity 下斜,强度保末值（UseIntensity 仅 IsActive 块内刷新 :187）
    step(mf, 100, { heatZoneDesert: false });
    expect(mf.heatActive).toBe(false);
    expect(mf.heatIntensity).toBeCloseTo(2.0, 6);   // 冻结
    expect(mf.heatInUse).toBe(true);                // 淡出中
  });
});

describe('SW-BJ27 与地狱支（flag2）互作——else-if 优先序（:195-207）', () => {
  it('地狱带 + 沙漠旗同时成立 → 只走地狱支 val2（沙漠支不求值）', () => {
    // 合成环境：tcY = maxY-320+1（val2 = 2/120 ≈ 0.0167）≪ 沙漠 val3=2——
    // 若误改 max 并集,强度会跳 2;原版 else-if 下沙漠支被跳过
    const mf = new MonolithFilters();
    step(mf, 100, {
      ...DESERT_DAY,
      heatTileCenterY: 600 - 320 + 1,   // > maxY-320（注意同时 < worldSurface 已不真,
      worldSurface: 1000,               //   合成 worldSurface 抬高让两门同真——仅验优先序）
    });
    expect(mf.heatActive).toBe(true);
    expect(mf.heatIntensity).toBeCloseTo(2 / 120, 6);   // val2,非 val3
  });

  it('sunScorch 与沙漠支取 max（:190-194 vs :201-207）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { ...DESERT_DAY, heatSunScorch: 300 });   // scorch=4 > val3=2
    expect(mf.heatIntensity).toBeCloseTo(4.0, 6);
    const mf2 = new MonolithFilters();
    step(mf2, 100, { ...DESERT_DAY, heatSunScorch: 50 });   // scorch=(50/300)×4≈0.667 < 2
    expect(mf2.heatIntensity).toBeCloseTo(2.0, 6);
  });
});

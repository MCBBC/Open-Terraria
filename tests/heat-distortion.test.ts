// HeatDistortion 滤镜全链锁定（ScreenShader.cso FilterHeatDistortion :839-871）：
//  ① SceneState 激活门/强度（SceneState.cs:122-123/:183-207）+ FilterManager 斜坡
//  ② 像素公式数值锚（preshader/def 常量 + 纯函数：GLSL 与 2D 回退同源）
//  ③ MonolithFilters vs 字节码审计结论表（MONOLITH_FILTER_AUDIT）锁定
//  ④ GLSL 源含字节码衍生常量（防手滑改漂）
import { describe, it, expect } from 'vitest';
import {
  MonolithFilters, emptyMonolithScene, MONOLITH_FILTER_AUDIT,
  HEAT_TIME_SCROLL, HEAT_DELTA_BIAS,
  heatNoiseUv, heatOffset, heatUvOut,
  type MonolithEnv,
} from '../src/render/MonolithFilters';
import { SCREEN_FX_FRAGS } from '../src/render/GLScreenFilters';

function env(over: Partial<MonolithEnv> = {}): MonolithEnv {
  return {
    worldSurface: 100, rockLevel: 160, screenTileY: 60,
    dayTime: true, hour24: 12, nightElapsed01: 0,
    fullMoon: false, worldBloodMoon: false, cloudAlpha: 0,
    ...over,
  };
}

/** maxTilesY=600 世界（地狱带 = Y > 280；worldSurface=100） */
const MAX_TY = 600;

function step(mf: MonolithFilters, ms: number, over: Partial<MonolithEnv> = {}): void {
  mf.update(ms, emptyMonolithScene(), env(over));
}

describe('FilterHeatDistortion 状态机（SceneState.cs:122-123/:186-207）', () => {
  it('地狱带 flag2：TileCenter.Y > maxTilesY-320 激活 + 1/s 斜坡（FilterManager.cs:95-101）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { heatTileCenterY: MAX_TY - 320 + 1, heatMaxTilesY: MAX_TY });
    expect(mf.heatActive).toBe(true);
    expect(mf.heatOpacity).toBeCloseTo(0.1, 5);
    step(mf, 1000, { heatTileCenterY: MAX_TY - 320 + 1, heatMaxTilesY: MAX_TY });
    expect(mf.heatOpacity).toBe(1);          // 夹 1
    // 离带 → 下斜
    step(mf, 500, { heatTileCenterY: 60, heatMaxTilesY: MAX_TY });
    expect(mf.heatActive).toBe(false);
    expect(mf.heatOpacity).toBeCloseTo(0.5, 5);
    expect(mf.heatInUse).toBe(true);         // 淡出中仍在用
    // 原版 UseIntensity/IsHidden 仅在 IsActive() 块内刷新（:183-207）——
    // 淡出期保留末次强度（末帧 tcY=带线+1 → 2/120）= 扭曲持续可见直到 opacity 归零
    expect(mf.heatIntensity).toBeCloseTo(2 / 120, 5);
    expect(mf.heatVisible).toBe(true);
  });

  it('边界恰在带线上不激活（> 严格比较 :103）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { heatTileCenterY: MAX_TY - 320, heatMaxTilesY: MAX_TY });
    expect(mf.heatActive).toBe(false);
  });

  it('地狱强度 val2 = min(1,(tcY-(maxY-320))/120)·2（:192-197）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { heatTileCenterY: MAX_TY - 320 + 60, heatMaxTilesY: MAX_TY });
    expect(mf.heatIntensity).toBeCloseTo(1.0, 5);      // (60/120=0.5)×2
    step(mf, 100, { heatTileCenterY: MAX_TY - 320 + 600, heatMaxTilesY: MAX_TY });
    expect(mf.heatIntensity).toBeCloseTo(2.0, 5);      // min(1, 5)×2 封顶
    // 带线内 1 tile：强度≈0 → IsHidden（:206）不可见
    step(mf, 100, { heatTileCenterY: MAX_TY - 320 + 1, heatMaxTilesY: MAX_TY });
    expect(mf.heatIntensity).toBeCloseTo(2 / 120, 5);
  });

  it('sunScorch 强度 = GetLerpValue(0,300,scorch)·4（:187-191）且与地狱带取 max', () => {
    const mf = new MonolithFilters();
    step(mf, 100, { heatTileCenterY: 60, heatMaxTilesY: MAX_TY, heatSunScorch: 150 });
    expect(mf.heatActive).toBe(true);
    expect(mf.heatIntensity).toBeCloseTo(2.0, 5);      // (150/300)×4
    step(mf, 100, { heatTileCenterY: 60, heatMaxTilesY: MAX_TY, heatSunScorch: 300 });
    expect(mf.heatIntensity).toBeCloseTo(4.0, 5);      // 上限 = 初始化 UseIntensity(4f)
    // 双源取 max：地狱 2 vs scorch 1.33 → 2
    step(mf, 100, {
      heatTileCenterY: MAX_TY - 320 + 600, heatMaxTilesY: MAX_TY, heatSunScorch: 100,
    });
    expect(mf.heatIntensity).toBeCloseTo(2.0, 5);
  });

  it('沙漠 flag3：激活但强度恒 0（Main.tileColor 全源码无赋值 → 死支 :198-204）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, {
      heatTileCenterY: 60, heatMaxTilesY: MAX_TY,
      heatZoneDesert: true, heatZoneRain: false, heatZoneSandstorm: false,
    });
    expect(mf.heatActive).toBe(true);
    expect(mf.heatOpacity).toBeCloseTo(0.1, 5);
    expect(mf.heatIntensity).toBe(0);
    expect(mf.heatVisible).toBe(false);     // IsHidden = num8 <= 0（:206）
  });

  it('flag3 三条件：非沙漠/下雨/沙暴均不激活（:104）', () => {
    const a = new MonolithFilters();
    step(a, 100, { heatTileCenterY: 60, heatMaxTilesY: MAX_TY });   // 非沙漠
    expect(a.heatActive).toBe(false);
    const b = new MonolithFilters();
    step(b, 100, {
      heatTileCenterY: 60, heatMaxTilesY: MAX_TY, heatZoneDesert: true,
      heatZoneRain: true,
    });
    expect(b.heatActive).toBe(false);
    const c = new MonolithFilters();
    step(c, 100, {
      heatTileCenterY: 60, heatMaxTilesY: MAX_TY, heatZoneDesert: true,
      heatZoneSandstorm: true,
    });
    expect(c.heatActive).toBe(false);
    // 地下沙漠（TileCenter.Y ≥ worldSurface）不算 flag3
    const d = new MonolithFilters();
    step(d, 100, {
      heatTileCenterY: 150, heatMaxTilesY: MAX_TY, heatZoneDesert: true,
    });
    expect(d.heatActive).toBe(false);
  });

  it('useHeatDistortion=false 总门关闭（Main.UseHeatDistortion :123）', () => {
    const mf = new MonolithFilters();
    step(mf, 100, {
      heatTileCenterY: MAX_TY - 320 + 600, heatMaxTilesY: MAX_TY,
      heatSunScorch: 300, useHeatDistortion: false,
    });
    expect(mf.heatActive).toBe(false);
  });
});

describe('FilterHeatDistortion 像素公式（obj18 字节码/preshader）', () => {
  it('preshader 常量：时间滚动 ±0.04（:865-866）、delta 偏置 −0.5（def c6.y :857）', () => {
    expect(HEAT_TIME_SCROLL).toBe(0.04);
    expect(HEAT_DELTA_BIAS).toBe(-0.5);
  });

  it('c3 = (uIntensity·uOpacity)/uScreenRes（preshader :867 flat-slot 语义）', () => {
    // 初始化 UseIntensity(4f) × 全不透明 @1920×1080 UnscaledScreenSize
    expect(heatOffset(4, 1, [1920, 1080])).toEqual([4 / 1920, 4 / 1080]);
    // 斜坡半程强度减半
    expect(heatOffset(4, 0.5, [1920, 1080])).toEqual([2 / 1920, 2 / 1080]);
    // RenderZoom=2 → UnscaledScreenSize 减半 → 偏移加倍（zoom 后扭曲世界尺度不变）
    expect(heatOffset(2, 1, [960, 540])).toEqual([2 / 960, 2 / 540]);
  });

  it('噪声 UV = (uv·uScreenRes + uScreenPos)/噪声尺寸×0.5（:846-851）世界锚定', () => {
    const [nx, ny] = heatNoiseUv(0.5, 0.5, [1920, 1080], [100, 200], 256, 256);
    expect(nx).toBeCloseTo(((0.5 * 1920 + 100) / 256) * 0.5, 6);
    expect(ny).toBeCloseTo(((0.5 * 1080 + 200) / 256) * 0.5, 6);
    // 屏幕移动 → 噪声场随世界移动（不动屏）：uScreenPos 平移 256 世界px = 噪声半周期
    const [mx] = heatNoiseUv(0.5, 0.5, [1920, 1080], [356, 200], 256, 256);
    expect(mx - nx).toBeCloseTo(0.5, 6);
  });

  it('t=0 时 delta ≡ −0.5（双噪声场重合 → uvOut = uv − 0.5·offset）', () => {
    const off = heatOffset(4, 1, [1920, 1080]);
    const [ox, oy] = heatUvOut(0.3, 0.7, 0.8, 0.6, 0.8, 0.6, off);   // nA=nB
    expect(ox).toBeCloseTo(0.3 - 0.5 * off[0], 7);
    expect(oy).toBeCloseTo(0.7 - 0.5 * off[1], 7);
  });

  it('对称噪声差分全幅：delta ∈ [−0.5−1, −0.5+1]（nA,nB∈[0,1]）', () => {
    const off = heatOffset(4, 1, [1920, 1080]);
    const [ox] = heatUvOut(0.5, 0.5, 1, 1, 0, 0, off);
    expect(ox).toBeCloseTo(0.5 + 0.5 * off[0], 7);   // nA−nB=+1
    const [ox2] = heatUvOut(0.5, 0.5, 0, 0, 1, 1, off);
    expect(ox2).toBeCloseTo(0.5 - 1.5 * off[0], 7);  // nA−nB=−1
  });

  it('最大位移上限：intensity 4 × |delta|≤1.5 → ≤6 无缩放屏幕px', () => {
    // uvOut−uv = delta·offset；换算屏幕px = delta·offset·viewW = delta·(4·op)（z=1）
    const off = heatOffset(4, 1, [1920, 1080]);
    const px = 1.5 * off[0] * 1920;
    expect(px).toBeCloseTo(6, 6);
  });
});

describe('monolith 审计结论表（MONOLITH_FILTER_AUDIT）', () => {
  it('六个 pass GL 字节码 1:1 就位，三个 pass 登记未端口', () => {
    const exact = MONOLITH_FILTER_AUDIT.filter((r) => r.glExact).map((r) => r.pass).sort();
    expect(exact).toEqual(['FilterBloodMoon', 'FilterCRT', 'FilterGraveyard',
      'FilterHeatDistortion', 'FilterMiniTower', 'FilterTest2']);
    // FilterMoonLord 两行：MonolithMoonLord（柱）+ MoonLord（月总战滤镜，
    // SceneState.cs:109）同 pass 同字节码（ScreenEffectInitializer.cs:22-24 唯一
    // 差异=aimAtPlayer）——未端口登记共用
    const pending = MONOLITH_FILTER_AUDIT.filter((r) => !r.glExact).map((r) => r.pass);
    expect(pending).toEqual(['FilterMoonLord', 'FilterMoonLord', 'FilterSepia', 'FilterNoir']);
  });

  it('登记项均注明未端口根因（非空 note）', () => {
    for (const r of MONOLITH_FILTER_AUDIT) {
      expect(r.note.length).toBeGreaterThan(10);
      expect(r.key).toBeTruthy();
      expect(r.pass).toBeTruthy();
    }
  });
});

describe('GLSL 源锁字节码衍生常量（防漂移）', () => {
  it('FilterHeatDistortion：±滚动/偏置/半尺/重采样链', () => {
    const f = SCREEN_FX_FRAGS['FilterHeatDistortion'];
    expect(f).toContain('nA - nB - 0.5');
    expect(f).toContain('* 0.5');                    // 噪声半尺 :849,851
    expect(f).toContain('delta * uOffset');
    expect(f).toContain('uTimeScroll');              // 0.04·time 注入侧
  });

  it('FilterMiniTower：V+min 度量 + lerp(color,1−color,s) 分档', () => {
    const f = SCREEN_FX_FRAGS['FilterMiniTower'];
    expect(f).toContain('V + mn');
    expect(f).toContain('sum - 1.0');
    expect(f).toContain('vec3(1.0) - uColor');
    expect(f).toContain('tgt * s.a');
  });

  it('FilterTest2：GB 四阶调色板字节码字面量（c2/c3/c4/c5）', () => {
    const f = SCREEN_FX_FRAGS['FilterTest2'];
    expect(f).toContain('0.55');                     // c1.x 度量系数
    expect(f).toContain('0.607843, 0.737255, 0.058824');   // c2 155,188,15
    expect(f).toContain('0.545098, 0.674510, 0.058824');   // c5 139,172,15
    expect(f).toContain('0.188235, 0.384314, 0.188235');   // c4 48,98,48
    expect(f).toContain('0.058824, 0.219608, 0.058824');   // c3 15,56,15
    expect(f).toContain('0.75');
  });

  it('FilterBloodMoon：径向 0.3/2.0 + V+min 分档 + 0.3A+0.7A²', () => {
    const f = SCREEN_FX_FRAGS['FilterBloodMoon'];
    expect(f).toContain('d - 0.3');
    expect(f).toContain('1.0 - 2.0 * (d - 0.3)');
    expect(f).toContain('1.5 - 0.5 * sum');
    expect(f).toContain('0.166667');
    expect(f).toContain('0.3 * A + 0.7 * A * A');
    expect(f).toContain('* 0.7');
  });

  it('FilterCRT：桶形 1/7 + 扫描线 0.222656/0.13/0.16', () => {
    const f = SCREEN_FX_FRAGS['FilterCRT'];
    expect(f).toContain('/ 7.0');
    expect(f).toContain('0.222656');
    expect(f).toContain('0.13');
    expect(f).toContain('0.16');
    expect(f).toContain('mod(duv, 1.0)');
  });

  it('FilterGraveyard：intensity 标定灰度 + progress 去饱和', () => {
    const f = SCREEN_FX_FRAGS['FilterGraveyard'];
    expect(f).toContain('* uIntensity * 0.333333');
    expect(f).toContain('uProgress');
    expect(f).toContain('desat * s.a');
  });
});

// SW-BJ41 2026-09-09：以太表现链回归——
//   ① shimmerAlpha 驱动状态机（SceneState.UpdateShimmer :332-357 金标；
//      MonolithFilters.update 消费 env.zoneShimmer = Renderer 每帧注入）
//   ② BGM 槽位（Main.cs:12834 ZoneShimmer → MusicID.Aether 91,MusicID.cs:194）
//   ③ 接线 tripwire：Renderer env 喂点 / 人工星空 pass / 零光 α 门（防再发——
//      本次事故即 env 漏喂 + 表现层整缺,SkyRenderer 旧注"恒 0=1:1"系误判）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MonolithFilters, emptyMonolithScene } from '../src/render/MonolithFilters';
import { pickMusic, newMusicState } from '../src/data/Music';
import { EMPTY_SCENE } from '../src/world/SceneMetrics';

const TICK = 1000 / 60;   // 60Hz 原版 tick

/** 基础 env（MonolithEnv 必填面） */
function baseEnv(): Parameters<MonolithFilters['update']>[2] {
  return {
    worldSurface: 120, rockLevel: 200, screenTileY: 250,
    dayTime: true, hour24: 12, nightElapsed01: 0, fullMoon: false,
    worldBloodMoon: false, cloudAlpha: 0,
  };
}

describe('SW-BJ41 shimmerAlpha 驱动（SceneState.UpdateShimmer :332-357）', () => {
  it('zoneShimmer=true：0.025/tick 上升，40 tick 到 1（:337 MoveTowards 步长）', () => {
    const mf = new MonolithFilters();
    for (let t = 1; t <= 40; t++) {
      mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
      if (t < 40) expect(mf.shimmerAlpha).toBeCloseTo(t * 0.025, 6);
    }
    expect(mf.shimmerAlpha).toBe(1);
  });

  it('上升期 α≥0.5 → shimmerDarken 同步上升 + brightenDelay=4（:338-341）', () => {
    const mf = new MonolithFilters();
    for (let t = 1; t <= 19; t++) {
      mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
      expect(mf.shimmerAlpha).toBeCloseTo(t * 0.025, 6);
    }
    // t=20：alpha 恰 0.5 → 同拍 darken 已起步 0.025、delay=4（:337-341 同拍序）
    mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
    expect(mf.shimmerAlpha).toBeCloseTo(0.5, 6);
    expect(mf.shimmerDarken).toBeCloseTo(0.025, 6);
    expect(mf.shimmerBrightenDelay).toBe(4);
    for (let t = 21; t <= 40; t++) {
      mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
      expect(mf.shimmerDarken).toBeCloseTo(Math.min(1, (t - 19) * 0.025), 6);
      expect(mf.shimmerBrightenDelay).toBe(4);
    }
  });

  it('flag 撤销：darken 先归零(0.05/tick)→delay 归零→alpha 才衰减(0.05/tick)（:343-351 序）', () => {
    const mf = new MonolithFilters();
    for (let t = 0; t < 60; t++) mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
    expect(mf.shimmerAlpha).toBe(1);
    // 撤旗后 20 tick：darken 1→0,alpha 冻结
    for (let t = 1; t <= 20; t++) {
      mf.update(TICK, emptyMonolithScene(), baseEnv());
      expect(mf.shimmerDarken).toBeCloseTo(Math.max(0, 1 - t * 0.05), 6);
      expect(mf.shimmerAlpha).toBe(1);
    }
    // t=20 起 darken==0 → delay 4→0 需 4 拍（t=20..23）;delay 归零拍 alpha 同拍起步
    // → alpha 冻结至 t=22,t=23 起 0.05/tick → 20 拍归零
    for (let t = 21; t <= 22; t++) {
      mf.update(TICK, emptyMonolithScene(), baseEnv());
      expect(mf.shimmerAlpha).toBe(1);
    }
    for (let t = 23; t <= 42; t++) {
      mf.update(TICK, emptyMonolithScene(), baseEnv());
      expect(mf.shimmerAlpha).toBeCloseTo(Math.max(0, 1 - (t - 22) * 0.05), 6);
    }
    expect(mf.shimmerAlpha).toBe(0);
  });

  it('独石臂：ShimmerMonolithState=1 同样驱动（:331）；state=2 显式压暗所有臂（:332-334）', () => {
    const scan1 = emptyMonolithScene();
    scan1.shimmerMonolithState = 1;
    const mf = new MonolithFilters();
    mf.update(TICK, scan1, baseEnv());
    expect(mf.shimmerAlpha).toBeCloseTo(0.025, 6);
    // state=2 → flag=false：即便 zoneShimmer=true 也走衰减臂
    const scan2 = emptyMonolithScene();
    scan2.shimmerMonolithState = 2;
    const mf2 = new MonolithFilters();
    mf2.update(TICK, scan2, { ...baseEnv(), zoneShimmer: true });
    expect(mf2.shimmerAlpha).toBe(0);
  });

  it('★变异实验：步长错成 0.05（衰减值冒充上升值）→ 首拍即红', () => {
    const mf = new MonolithFilters();
    mf.update(TICK, emptyMonolithScene(), { ...baseEnv(), zoneShimmer: true });
    // 金标 0.025（SceneState.cs:337）；若实现漂到 0.05 本断言红
    expect(mf.shimmerAlpha).toBeCloseTo(0.025, 6);
    expect(mf.shimmerAlpha).not.toBeCloseTo(0.05, 6);
  });
});

describe('SW-BJ41 以太 BGM 槽位（Main.cs:12834 → MusicID.Aether 91）', () => {
  /** 地下深度带内玩家（204<Y<404,worldSurface=120/lavaLine=600）——不触发太空/地狱支 */
  const WORLD = { worldSurface: 120, rockLevel: 200, lavaLine: 600, maxTilesX: 4200, centerX: 3200, centerY: 4000 };
  it('zoneShimmer → 91；优先级压过城镇昼曲（:12834 在 :12840 前）', () => {
    const s = { ...EMPTY_SCENE, zoneShimmer: true, townNPCCount: 5 };
    expect(pickMusic({ scene: s, isDay: true, state: newMusicState(), ...WORLD })).toBe(91);
    expect(pickMusic({ scene: s, isDay: false, state: newMusicState(), ...WORLD })).toBe(91);
  });

  it('非微光域不误触发 91（链尾正常回落）', () => {
    const r = pickMusic({ scene: { ...EMPTY_SCENE }, isDay: true, state: newMusicState(), ...WORLD });
    expect(r).not.toBe(91);
  });
});

describe('SW-BJ41 接线 tripwire（env 漏喂/表现层回退防再发）', () => {
  const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

  it('Renderer 每帧把 scene.zoneShimmer 喂进 monoFilters.update env（本次事故主根因）', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r).toMatch(/zoneShimmer:\s*!!this\.scene\?\.zoneShimmer/);
  });

  it('黑幕+人工星空 pass 在位（Main.cs:63132-63153 → Renderer 主画布段）', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r).toMatch(/monoFilters\.shimmerAlpha/);
    expect(r).toMatch(/drawShimmerStars\(ctx, viewW, viewH, cam\.y, shimA0\)/);
  });

  it('SkyRenderer 人工星 pass 与自然星微光衰减在位（:63034/:64003-64057）', () => {
    const s = src('../src/render/SkyRenderer.ts');
    expect(s).toMatch(/drawShimmerStars\(ctx: CanvasRenderingContext2D/);
    expect(s).toMatch(/shimmerAlpha \* meanF/);           // 人工星 ×num
    expect(s).toMatch(/\(1 - shimmerAlpha\) \* meanF/);   // 自然星 ×(1−num)
    expect(s).not.toMatch(/本仓无微光天空态,恒 0/);        // 旧误判注不得回潮
    //（旧注原文「…恒 0=原版跳过=1:1」——SW-BJ41 判定其误判并清辞;
    //  现文只允许以「作废引述」形式出现）
  });

  it('零光 α 门（DrawBlack 跳过 :58831 + 零光图格不画）双路径在位', () => {
    const r = src('../src/render/Renderer.ts');
    const g = src('../src/render/GLWorldLight.ts');
    expect(r).toMatch(/const darkSkip = this\.monoFilters\.shimmerAlpha >= 1 \? 1 : 0;/);
    expect(r).toMatch(/darkSkip && lSum <= 0/);           // CPU 回退路径
    expect(g).toMatch(/uDarkSkip/);
    expect(g).toMatch(/step\(1\.0 \/ 255\.0/);             // GL 路径阈值 = 光字节 <1
  });

  it('地下背景淡出/整层跳过在位（Main.cs:53608-53612/:54134/:54453/:54573）', () => {
    const r = src('../src/render/Renderer.ts');
    expect(r).toMatch(/shimA < 1/);
  });
});

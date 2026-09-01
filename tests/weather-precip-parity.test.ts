// 天气 precip 1:1 回归锚（2026-08-31/09-01 dust268"绿树叶"定谳 + 同族复盘批）：
// 锚定四个曾整文件覆写回退过的修复点，任何陈旧基线回写立刻爆红：
//   ① Dust.png 帧公式（Dust.cs:176-191）——dust 268 真帧 (680, 60+10×rand3) 8×8
//     灰十字；(680,20) 是 dust 68 的蓝十字格，蓝×沙色=暗绿（勿再手算内联）；
//   ② rain.type = waterStyle×3+rand(3)（Rain.cs:165/210）——曾硬编码 0-2；
//   ③ 雨溅花尘映射 dustWater()（Dust.cs:405-421）；
//   ④ 落叶 SpriteFrame(32,8) CurrentColumn = 树格油漆（TileDrawing:8027）。
// 全部纯函数/池驱动，无 DOM 依赖。
import { describe, it, expect } from 'vitest';
import { dustFrameOf } from '../src/fx/VanillaDust';
import { dustWaterFor, WeatherRenderer } from '../src/render/WeatherRenderer';
import { natureParticles, LEAF_GORES } from '../src/render/NatureParticles';

// ---------- ① Dust.png 帧公式 ----------
describe('dustFrameOf（Dust.cs:176-191 唯一权威）', () => {
  it('dust 268 沙尘：fx=680、fy∈{60,70,80}（双重 while 各减 100 加 30）', () => {
    for (let i = 0; i < 30; i++) {
      const f = dustFrameOf(268);
      expect(f.fx).toBe(680);
      expect([60, 70, 80]).toContain(f.fy);
    }
  });

  it('dust 76 雪：fx=760、fy∈{0,10,20}（<100 无 while 轮）', () => {
    for (let i = 0; i < 20; i++) {
      const f = dustFrameOf(76);
      expect(f.fx).toBe(760);
      expect([0, 10, 20]).toContain(f.fy);
    }
  });

  it('dust 68 = (680,0/10/20) 蓝十字陷阱格——(680,20) 真身是它（68<100 零轮 while），与 268 同列不同行勿混', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) seen.add(dustFrameOf(68).fy);
    expect(dustFrameOf(68).fx).toBe(680);
    expect([...seen].sort()).toEqual([0, 10, 20]);
  });

  it('纯水溅花尘 33：fx=330、fy∈{0,10,20}', () => {
    const f = dustFrameOf(33);
    expect(f.fx).toBe(330);
    expect([0, 10, 20]).toContain(f.fy);
  });
});

// ---------- ② rain.type = waterStyle×3 + rand(3) ----------
describe('rain 列选型（Rain.cs:165/210）', () => {
  const fakeWeather = { sandstorm: { happening: false, severity: 0, timeLeft: 0, intendedSeverity: 0 }, cloudAlpha: 0.8, windSpeedCurrent: 1, raining: false } as never;
  const hooksFor = (waterStyle: number) => ({
    lightAt: () => [255, 255, 255] as [number, number, number],
    atmo: 1, snowRatio: 0, snowTileCount: 0, bossDanger: false,
    waterStyle, shimmerAlpha: 0,
    splashDust() {}, sandstormVisuals: false, desertSandTiles: 0,
    sandColors: () => [],
  });

  it('spawnRain：type 落在 [waterStyle×3, waterStyle×3+2]（雪原 ws=1 → 3-5，非 0-2）', () => {
    for (const ws of [0, 1, 3]) {
      const inst = new WeatherRenderer();
      inst.attach(fakeWeather, hooksFor(ws) as never);
      (inst as unknown as { ensurePool: (n: number) => void }).ensurePool(8);
      for (let i = 0; i < 24; i++) {
        (inst as unknown as { spawnRain: (x: number, y: number) => void }).spawnRain(0, 0);
      }
      const types = (inst as unknown as { pool: Array<{ active: boolean; type: number }> }).pool
        .filter((d) => d.active).map((d) => d.type);
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) {
        expect(t).toBeGreaterThanOrEqual(ws * 3);
        expect(t).toBeLessThanOrEqual(ws * 3 + 2);
      }
    }
  });

  it('newRainForced（眼球伞）：同 waterStyle×3+rand(3) 语义', () => {
    const inst = new WeatherRenderer();
    inst.attach(fakeWeather, hooksFor(2) as never);
    (inst as unknown as { ensurePool: (n: number) => void }).ensurePool(4);
    inst.newRainForced(0, 0, 0, 10);
    const d = (inst as unknown as { pool: Array<{ active: boolean; type: number }> }).pool[0];
    expect(d.active).toBe(true);
    expect(d.type).toBeGreaterThanOrEqual(6);
    expect(d.type).toBeLessThanOrEqual(8);
  });
});

// ---------- ③ Dust.dustWater() 映射 ----------
describe('dustWaterFor（Dust.cs:405-421）', () => {
  it('全表逐值', () => {
    expect(dustWaterFor(0)).toBe(33);
    expect(dustWaterFor(1)).toBe(33);
    expect(dustWaterFor(2)).toBe(98);
    expect(dustWaterFor(3)).toBe(99);
    expect(dustWaterFor(4)).toBe(100);
    expect(dustWaterFor(5)).toBe(101);
    expect(dustWaterFor(6)).toBe(102);
    expect(dustWaterFor(7)).toBe(103);
    expect(dustWaterFor(8)).toBe(104);
    expect(dustWaterFor(9)).toBe(105);
    expect(dustWaterFor(10)).toBe(123);
    expect(dustWaterFor(11)).toBe(33);
    expect(dustWaterFor(12)).toBe(288);
    expect(dustWaterFor(13)).toBe(33);
  });
});

// ---------- ④ 落叶油漆列 ----------
describe('spawnLeaf CurrentColumn（TileDrawing:8027）', () => {
  it('paint 入参写入 col；缺省 0', () => {
    expect(natureParticles.leaves.length).toBe(0);
    natureParticles.spawnLeaf(100, 100, 910);          // 缺省 = 未上漆
    expect(natureParticles.leaves[natureParticles.leaves.length - 1]?.col).toBe(0);
    natureParticles.spawnLeaf(100, 100, 910, 7);       // 油漆 7 → 列 7
    expect(natureParticles.leaves[natureParticles.leaves.length - 1]?.col).toBe(7);
    natureParticles.clear();
  });

  it('非落叶 gore 拒收（LEAF_GORES 门不受 paint 影响）', () => {
    const n0 = natureParticles.leaves.length;
    natureParticles.spawnLeaf(0, 0, 706, 5);           // 706 = drip 族
    expect(natureParticles.leaves.length).toBe(n0);
    expect(LEAF_GORES.has(910)).toBe(true);
    expect(LEAF_GORES.has(706)).toBe(false);
  });
});

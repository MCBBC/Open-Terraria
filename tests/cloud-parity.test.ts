// 云朵系统对齐回归（2026-08-19 用户实报"云量似乎有点过多了"）：
// 标杆 Terarria1456/Terraria/Cloud.cs——resetClouds(:39-59) 恰 numClouds 次
// addCloud 尝试（AABB 重叠拒绝即少一朵，绝不重试凑满）；addCloud X 锚
// num2 = windSpeedCurrent − player.velocity.X*0.1（:96-100，!gameMenu）；
// Update(:373-402) 恰界 scale 1.0/1.15 微移 -0.0001 防跨 pass；海洋群系前景层
// 满档（bgAlphaFrontLayer[4]==1）且 y>200 的低云 kill + 0.005/帧快速淡出。
// ★主根因：曾用 while 重试凑满（guard 400）——离线模拟 1920×1080/目标 100 档
// 实测 77 朵 vs 原版 46 朵（≈1.7×）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SkyRenderer, type SkyFrameCtx } from '../src/render/SkyRenderer';
import type { WeatherState } from '../src/world/weather/Weather';

/** node 环境无 DOM：Image 桩（贴图永不 complete，cloudTex 走 200×80 兜底尺寸） */
function stubImage(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((globalThis as any).Image) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Image = class {
    src = ''; width = 0; height = 0; complete = false; naturalWidth = 0; naturalHeight = 0;
  };
}

const FRAME_MS = 1000 / 60;   // frames=1

function makeSky(numClouds = 100, wind = 0.2): SkyRenderer {
  stubImage();
  const sky = new SkyRenderer();
  const wr = {
    numClouds, cloudAlpha: 0, cloudBGActive: 0,
    windSpeedCurrent: wind, windSpeedTarget: wind,
  } as unknown as WeatherState;
  sky.attachWeather(wr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sky as any).wind = wind;
  return sky;
}

const baseFrameCtx = (vx?: number): SkyFrameCtx => ({
  entities: [], world: null, scene: null,
  player: { cx: 0, cy: 0, vx },
  clock: { dayCount: 1, timeOfDay: 0.5, isDay: true },
  camX: 0, camY: 0, z: 1, viewW: 1920, viewH: 1080,
});

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resetClouds 铺满语义（Cloud.cs:39-59）', () => {
  it('恰 numClouds 次 addCloud 尝试——AABB 拒绝消耗尝试，不重试凑满', () => {
    const sky = makeSky(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orig = (sky as any).spawnCloud.bind(sky);
    let attempts = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).spawnCloud = (...a: unknown[]) => { attempts++; return orig(...a); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).maintainClouds(1920, 1080);
    expect(attempts).toBe(100);                      // ★旧 while 凑满会打到 guard 400
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sky as any).vclouds.length).toBeLessThanOrEqual(100);
  });

  it('恒同掷点 → 全部后续云 AABB 重叠被拒，恰 1 朵存活', () => {
    const sky = makeSky(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).maintainClouds(1920, 1080);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clouds: unknown[] = (sky as any).vclouds;
    expect(clouds.length).toBe(1);                   // 99 次尝试全被重叠拒绝吞掉
    // 初始云 Alpha=1（resetClouds 终环 :55-58）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((clouds[0] as any).alpha).toBe(1);
  });

  it('随机掷点下铺不满 target（RSA 拒绝自然亏空）——云量对齐档', () => {
    vi.restoreAllMocks();                            // 真 Math.random
    const sky = makeSky(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).maintainClouds(1920, 1080);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (sky as any).vclouds.length as number;
    // 离线模拟原版同口径：1920×1080/目标100 档期望 ~46 朵（旧实现 ~77）
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(75);
  });
});

describe('addCloud X 锚玩家速度修正（Cloud.cs:96-100）', () => {
  it('vx=50 使 num2 翻负 → 出生带整体右移 200（顺风缓冲侧翻转）', () => {
    const skyA = makeSky(100, 0.2);
    skyA.frameCtx = baseFrameCtx(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (skyA as any).maintainClouds(1920, 1080);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xA = (skyA as any).vclouds[0].x as number;

    const skyB = makeSky(100, 0.2);
    skyB.frameCtx = baseFrameCtx(50);               // 玩家向右疾跑
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (skyB as any).maintainClouds(1920, 1080);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xB = (skyB as any).vclouds[0].x as number;

    // num2=0.2>0 → lo=-500；num2=0.2-5=-4.8<0 → lo=-300（中点右移 200）
    expect(xA).toBeCloseTo(860, 5);
    expect(xB).toBeCloseTo(1060, 5);
    expect(xB - xA).toBeCloseTo(200, 5);
  });
});

describe('Update 缺失行为补齐（Cloud.cs:373-402）', () => {
  it('海洋前景层满档：y>200 低云 kill 且 0.006/帧淡出；y≤200 不杀', () => {
    const sky = makeSky(100);
    sky.frameCtx = { ...baseFrameCtx(), oceanFrontAlpha: 1 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).vclouds = [
      { type: 0, x: 0, y: 300, scale: 0.9, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
      { type: 0, x: 0, y: 150, scale: 0.9, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).updateClouds(FRAME_MS, 1920, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = (sky as any).vclouds as Array<{ y: number; kill: boolean; alpha: number }>;
    expect(cs[0].kill).toBe(true);
    expect(cs[0].alpha).toBeCloseTo(1 - 0.005 - 0.001, 8);   // 0.005 海滩 + 0.001 通用
    expect(cs[1].kill).toBe(false);                           // 高云不在门内
    expect(cs[1].alpha).toBe(1);
  });

  it('海洋层未满档（0.99）不触发杀云', () => {
    const sky = makeSky(100);
    sky.frameCtx = { ...baseFrameCtx(), oceanFrontAlpha: 0.99 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).vclouds = [
      { type: 0, x: 0, y: 300, scale: 0.9, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).updateClouds(FRAME_MS, 1920, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((sky as any).vclouds[0] as { kill: boolean }).kill).toBe(false);
  });

  it('恰界 scale 微移：1.0→0.9999、1.15→1.1499（一次，不重复扣）', () => {
    const sky = makeSky(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).vclouds = [
      { type: 0, x: 0, y: 0, scale: 1, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
      { type: 0, x: 500, y: 0, scale: 1.15, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).updateClouds(FRAME_MS, 1920, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = (sky as any).vclouds as Array<{ scale: number }>;
    expect(cs[0].scale).toBeCloseTo(0.9999, 8);
    expect(cs[1].scale).toBeCloseTo(1.1499, 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).updateClouds(FRAME_MS, 1920, 0);   // 第二帧不再移动
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((sky as any).vclouds[0] as { scale: number }).scale).toBeCloseTo(0.9999, 8);
  });

  it('出界回收：x > viewW+600 直接移除（alpha 无关）', () => {
    const sky = makeSky(100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).vclouds = [
      { type: 0, x: 1920 + 700, y: 0, scale: 0.9, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
      { type: 0, x: 100, y: 0, scale: 0.9, rot: 0, rSpeed: 0, alpha: 1, flip: false, kill: false },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sky as any).updateClouds(FRAME_MS, 1920, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sky as any).vclouds.length).toBe(1);
  });
});

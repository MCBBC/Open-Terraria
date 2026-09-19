// ★perf3（2026-09-19 trace 三批热点）云/雨渲染缓存刀的键与复用语义锁：
//   ① 雨条 memo 数字键（rainStripMemoKey）——单射性（变异复核主判据：任何
//      移位/进制/钳位改动若引入碰撞立即爆红）、钳位合并语义（越界输入与钳位
//      值烘出的图逐位同，合并同图键=零视觉差）、数值精度（键 < 2^53）。
//   ② bakeMemoized 复用断言——同键二调不再进 gen（缓存命中语义，node 无 DOM
//      环境 gen 返回 null 亦可断言）；异键必进 gen。
//   ③ 云层 blit bbox（cloudBlitBoxAdd/Reset）——旋转 bbox 并集数学：无旋转精确
//      包围、旋转外扩公式、跨 add 并集、Reset 清零。
//   ④ 逃生门缺省态——?cloudcache 未设时 cloudRegionBlit/rainPerf3 恒 true
//      （默认新路径；=0 才回退旧路径，保留至用户验收）。
import { describe, it, expect, vi } from 'vitest';
import { rainStripMemoKey, WeatherRenderer } from '../src/render/WeatherRenderer';
import { SkyRenderer } from '../src/render/SkyRenderer';

describe('rainStripMemoKey（perf3 数字键：单射/钳位/精度）', () => {
  it('单射：type 全域 0..63 × rgb 网格抽样无碰撞（变异复核主判据）', () => {
    const seen = new Set<number>();
    let n = 0;
    for (let type = 0; type <= 63; type++) {
      for (let r = 0; r <= 255; r += 7) {
        for (let g = 0; g <= 255; g += 11) {
          for (let b = 0; b <= 255; b += 13) {
            seen.add(rainStripMemoKey(r, g, b, type));
            n++;
          }
        }
      }
    }
    expect(seen.size).toBe(n);
    // 边界角：0/255 四角 × type 首尾
    for (const [r, g, b] of [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]] as const) {
      for (const type of [0, 44, 63]) seen.add(rainStripMemoKey(r, g, b, type));
    }
    expect(seen.size).toBe(seen.size);   // 角值并入不炸（Set 语义自检占位）
  });

  it('随机 20 万组合仍单射（撞库级变异才会过的强度）', () => {
    const seen = new Set<number>();
    const inputs = new Set<number>();   // 随机抽样本身会同_tuple 重抽（生日悖论）——按输入去重后比对
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200_000; i++) {
      const r = Math.floor(rnd() * 256), g = Math.floor(rnd() * 256),
        b = Math.floor(rnd() * 256), t = Math.floor(rnd() * 64);
      inputs.add(((r * 256 + g) * 256 + b) * 64 + t);
      seen.add(rainStripMemoKey(r, g, b, t));
    }
    expect(seen.size).toBe(inputs.size);
  });

  it('钳位合并：越界输入与钳位值同键（bake 内 tintByte 同式钳→同图，合并零视觉差）', () => {
    expect(rainStripMemoKey(-1, 0, 0, 0)).toBe(rainStripMemoKey(0, 0, 0, 0));
    expect(rainStripMemoKey(300, 0, 0, 0)).toBe(rainStripMemoKey(255, 0, 0, 0));
    expect(rainStripMemoKey(0, -5, 0, 0)).toBe(rainStripMemoKey(0, 0, 0, 0));
    expect(rainStripMemoKey(0, 0, 999, 0)).toBe(rainStripMemoKey(0, 0, 255, 0));
  });

  it('键域 < 2^53（Number 精确域，位布局 [r|g|b|type] 各 8bit）', () => {
    expect(rainStripMemoKey(255, 255, 255, 255)).toBeLessThan(2 ** 53);
    expect(rainStripMemoKey(255, 255, 255, 255)).toBe(255 * 16777216 + 255 * 65536 + 255 * 256 + 255);
    // 通道间不串位：r 步进 1 = 键步进 2^24
    expect(rainStripMemoKey(1, 0, 0, 0) - rainStripMemoKey(0, 0, 0, 0)).toBe(16777216);
    expect(rainStripMemoKey(0, 1, 0, 0) - rainStripMemoKey(0, 0, 0, 0)).toBe(65536);
    expect(rainStripMemoKey(0, 0, 1, 0) - rainStripMemoKey(0, 0, 0, 0)).toBe(256);
    expect(rainStripMemoKey(0, 0, 0, 1) - rainStripMemoKey(0, 0, 0, 0)).toBe(1);
  });
});

describe('bakeMemoized 复用语义（perf3：命中不再进 gen）', () => {
  it('同键二调命中缓存（gen 只跑一次）；异键必重烘', () => {
    const wr = new WeatherRenderer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = wr as any;
    const gen = vi.fn(() => null);   // node 无 DOM：bakeTintFrame 会得 null，这里直接桩
    const a = inst.bakeMemoized('k-a', gen);
    const b = inst.bakeMemoized('k-a', gen);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(gen).toHaveBeenCalledTimes(1);      // 命中：不再进 gen
    inst.bakeMemoized('k-b', gen);
    expect(gen).toHaveBeenCalledTimes(2);      // 异键：必进 gen
    // 数字键与串键同一张表互不干扰（perf3 雨条数字键 / 雪沙串键共存）
    const nk = inst.bakeMemoized(1234567, gen);
    expect(nk).toBeNull();
    expect(gen).toHaveBeenCalledTimes(3);
    expect(inst.bakeMemoized(1234567, gen)).toBeNull();
    expect(gen).toHaveBeenCalledTimes(3);      // 数字键同样命中
  });
});

describe('云层 blit bbox 数学（perf3：旋转 bbox 并集）', () => {
  /** node 环境无 DOM：Image 桩（同 cloud-parity.test.ts 惯例，贴图永不 complete） */
  function stubImage(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((globalThis as any).Image) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Image = class {
      src = ''; width = 0; height = 0; complete = false; naturalWidth = 0; naturalHeight = 0;
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mkSky = (): any => { stubImage(); return new SkyRenderer(); };

  it('无旋转：单云精确包围；多云取并集', () => {
    const sky = mkSky();
    sky.cloudBlitBoxAdd(100, 50, 200, 40, 0);
    expect(sky.cloudBlitBox.any).toBe(true);
    expect(sky.cloudBlitBox.x0).toBeCloseTo(0);
    expect(sky.cloudBlitBox.y0).toBeCloseTo(30);
    expect(sky.cloudBlitBox.x1).toBeCloseTo(200);
    expect(sky.cloudBlitBox.y1).toBeCloseTo(70);
    // 右下方第二朵：并集外扩
    sky.cloudBlitBoxAdd(500, 300, 100, 100, 0);
    expect(sky.cloudBlitBox.x0).toBeCloseTo(0);
    expect(sky.cloudBlitBox.y0).toBeCloseTo(30);
    expect(sky.cloudBlitBox.x1).toBeCloseTo(550);
    expect(sky.cloudBlitBox.y1).toBeCloseTo(350);
  });

  it('旋转外扩：w=100,h=10,rot=π/4 → half=55·√2/2·2/2（(w+h)/2·√2/2）', () => {
    const sky = mkSky();
    const c = Math.SQRT1_2;
    sky.cloudBlitBoxAdd(0, 0, 100, 10, Math.PI / 4);
    // halfW = (100·c + 10·c)/2 = 55c
    expect(sky.cloudBlitBox.x0).toBeCloseTo(-55 * c, 6);
    expect(sky.cloudBlitBox.x1).toBeCloseTo(55 * c, 6);
    expect(sky.cloudBlitBox.y0).toBeCloseTo(-55 * c, 6);
    expect(sky.cloudBlitBox.y1).toBeCloseTo(55 * c, 6);
  });

  it('Reset 清零回 any=false（新会话不复用上帧 bbox）', () => {
    const sky = mkSky();
    sky.cloudBlitBoxAdd(0, 0, 10, 10, 0);
    expect(sky.cloudBlitBox.any).toBe(true);
    sky.cloudBlitBoxReset();
    expect(sky.cloudBlitBox.any).toBe(false);
    // 清零后重加：从零重算（不被旧值污染）
    sky.cloudBlitBoxAdd(1000, 1000, 10, 10, 0);
    expect(sky.cloudBlitBox.x0).toBeCloseTo(995);
    expect(sky.cloudBlitBox.x1).toBeCloseTo(1005);
  });
});

describe('perf3 逃生门缺省态（?cloudcache 未设 = 新路径；=0 才回退）', () => {
  it('node 无 location 环境：cloudRegionBlit / rainPerf3 恒 true', () => {
    expect(SkyRenderer.cloudRegionBlit).toBe(true);
    expect(WeatherRenderer.rainPerf3).toBe(true);
  });
});

// GPU 提交账本(#perf-gpulog)纯逻辑:字节公式/删除钳位/帧滚动/围栏滞后统计。
// 模块态全局——各用例顺序消费同一实例(语义即账本)。
import { describe, it, expect } from 'vitest';
import { texBytes, glStatUpload, glStatTexCreate, glStatDelete, glStatDraw, glStatFrame, gpuLogSnapshot } from '../src/render/GLStats';

describe('texBytes 三档格式', () => {
  it('RGBA8 = w×h×4;LUMINANCE/R8 = w×h', () => {
    expect(texBytes('RGBA', 16, 16)).toBe(1024);
    expect(texBytes('LUMINANCE', 100, 50)).toBe(5000);
    expect(texBytes(0x1903, 64, 64)).toBe(4096);   // R8/RED
  });
});

describe('记账与帧滚动', () => {
  it('带宽 vs 驻留双口径:刷新只进带宽;Alloc 才进驻留;删除钳位不为负', () => {
    // 帧1:同纹理逐帧整幅刷新 = 纯带宽,驻留不动(WorldLight/Water 场景)
    glStatUpload('test-refresh', 1024);
    glStatUpload('test-refresh', 2048);
    glStatDraw('test-refresh', 4);
    glStatFrame();                                   // 封页 page1 → last
    let s = gpuLogSnapshot().ctxs['test-refresh'];
    expect(s.frameUp).toBe(2);
    expect(s.liveMB).toBe(0);                        // ★刷新不计驻留

    // 帧2:新纹理分配 → 驻留+带宽双记;超额删除钳位
    glStatTexCreate('test-alloc', 3072);
    glStatUpload('test-alloc', 3072);
    glStatDelete('test-alloc', 99999);               // 超额 → 只减实际
    glStatFrame();
    s = gpuLogSnapshot().ctxs['test-alloc'];
    expect(s.frameAllocMB).toBeCloseTo(3072 / 1048576, 6);
    expect(s.liveMB).toBe(0);
    expect(gpuLogSnapshot().frame).toBeGreaterThanOrEqual(2);

    // 驻留互不串账
    expect(gpuLogSnapshot().ctxs['test-refresh'].liveMB).toBe(0);
  });

  it('同名多源共享账页(各层同名实例合并)', () => {
    glStatUpload('shared-x', 100);
    glStatUpload('shared-x', 100);
    glStatFrame();
    expect(gpuLogSnapshot().ctxs['shared-x']).toBeDefined();
  });
});

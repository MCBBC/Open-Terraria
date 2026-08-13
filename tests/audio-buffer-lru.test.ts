// Audio buffers LRU 回归(2026-08-13 性能异常扫描批次二)。
// 缺陷:buffers Map 解码即常驻永不释放(每首 30-45MB PCM,104 首 GB 级)。
// 修法:上限 3 首,新解码完成时淘汰最旧可淘汰者(跳过失败哨兵 null 与
// pool 播放/淡化中曲目)。node 环境桩掉 rAF/window 直驱私有字段测淘汰逻辑。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '../src/core/Audio';

// AudioSystem 构造器立即 startLoop() → requestAnimationFrame;audio() 读 window
const rafBackup = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
const windowBackup = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 0;
  (globalThis as { window?: unknown }).window = {}; // AudioContext 缺失 → audio() 返回 null
});
afterEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = rafBackup;
  (globalThis as { window?: unknown }).window = windowBackup;
});

function fakeBuf(): AudioBuffer {
  return { duration: 120 } as AudioBuffer;
}

function priv(sys: AudioSystem) {
  return sys as unknown as {
    buffers: Map<number, AudioBuffer | null>;
    pool: Map<number, unknown>;
    evictOld: () => void;
    MAX_BUFFERS: number;
  };
}

describe('Audio buffers LRU(批次二)', () => {
  it('超上限删最旧,最新 3 首保留', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    for (const id of [10, 11, 12]) p.buffers.set(id, fakeBuf());
    expect(p.buffers.size).toBe(3);
    p.buffers.set(13, fakeBuf());
    p.evictOld();
    expect(p.buffers.has(10)).toBe(false);      // 最旧被淘汰
    expect([...p.buffers.keys()]).toEqual([11, 12, 13]);
  });

  it('失败哨兵 null 不参与淘汰(清了会重发 404)', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.buffers.set(10, null);
    p.buffers.set(11, fakeBuf());
    p.buffers.set(12, fakeBuf());
    p.buffers.set(13, fakeBuf());
    p.evictOld();
    // 总数 4>3:可淘汰的是 11-13,删最旧的 11;null 10 保留
    expect(p.buffers.get(10)).toBeNull();
    expect(p.buffers.has(11)).toBe(false);
    expect(p.buffers.size).toBe(3);
  });

  it('pool 播放中的曲目跳过(不使 track() 失源)', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.pool.set(10, {}); // 假装 10 在播放
    p.buffers.set(10, fakeBuf());
    p.buffers.set(11, fakeBuf());
    p.buffers.set(12, fakeBuf());
    p.buffers.set(13, fakeBuf());
    p.evictOld();
    expect(p.buffers.has(10)).toBe(true);       // 播放中保留
    expect(p.buffers.has(11)).toBe(false);      // 落到次旧
  });

  it('未超限时不动作', () => {
    const sys = new AudioSystem();
    const p = priv(sys);
    p.buffers.set(1, fakeBuf());
    p.buffers.set(2, fakeBuf());
    p.evictOld();
    expect(p.buffers.size).toBe(2);
  });
});

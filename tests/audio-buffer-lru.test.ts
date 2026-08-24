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

  it('解码失败不再写入永久 null 哨兵(R22:改限时负缓存,不占缓存位)', () => {
    const sys = new AudioSystem();
    const p = priv(sys) as ReturnType<typeof priv> & { failed: Set<number>; markFailed: (id: number) => void };
    p.markFailed(10);
    expect(p.failed.has(10)).toBe(true);
    // buffers 只存真实解码结果——失败走 failed/failedAt 集,evictOld 无需跳过 null
    for (const id of [11, 12, 13, 14]) p.buffers.set(id, fakeBuf());
    p.evictOld();
    expect(p.buffers.get(10)).toBeUndefined();   // 失败曲目从未入缓存
    expect(p.buffers.has(11)).toBe(false);       // 最旧真实缓存被淘汰
    expect([...p.buffers.keys()]).toEqual([12, 13, 14]);
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

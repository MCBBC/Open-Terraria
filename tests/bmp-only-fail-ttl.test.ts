// loadBitmapOnly 失败 TTL 负缓存回归(2026-08-26 用户实报"进页面数千 404"):
// 发布形态 sprites/vanilla 无散件(prune-dist),SW 分片暖缓存就位前 cache-miss
// → 网络回退恒 404;消费方(BiomeBackground.img/SkyRenderer.cloudTex 等全部
// 16 处)都是绘制路径 if(!缓存) 调用——onerror 只清 pending 时每帧重发 =
// 云族 ~60 req/s × N 文件的 404 风暴。修后失败文件 10s 冷却内早退,
// 暖缓存落地后下个重试窗自愈。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadBitmapOnly } from '../src/assets/SpriteAtlas';

/** 桩 Image:赋 src 记一次请求,默认同步 onerror(404 语义);stub.fail=false 走 onload */
function stubImage() {
  const srcs: string[] = [];
  const stub = { fail: true };
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 4; height = 4;
    set src(v: string) {
      srcs.push(v);
      if (stub.fail) this.onerror?.();
      else this.onload?.();
    }
    get src(): string { return ''; }
  }
  const g = globalThis as unknown as { Image?: new () => HTMLImageElement };
  const prev = g.Image;
  g.Image = FakeImage as unknown as new () => HTMLImageElement;
  return { srcs, stub, restore: () => { g.Image = prev; } };
}

describe('loadBitmapOnly 失败 TTL', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('404 后 10s 冷却内重调不再发请求;过期后放行一个新请求', () => {
    vi.useFakeTimers();
    const { srcs, restore } = stubImage();
    try {
      const has = () => false;
      const store = () => { /* 404 不会 store */ };
      // 绘制路径连续多帧调用 → 在飞/失败冷却双重闸,只发 1 个请求
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      expect(srcs.length).toBe(1);
      // 9.9s:仍在冷却
      vi.advanceTimersByTime(9_900);
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      expect(srcs.length).toBe(1);
      // 过 10s 冷却:下个绘制帧放行重试(风暴→节流的核心断言)
      vi.advanceTimersByTime(200);
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      expect(srcs.length).toBe(2);
      // 冷却期内其他调用方继续被闸
      loadBitmapOnly('vanilla/Cloud_2.png', has, store);
      expect(srcs.length).toBe(2);
      expect(srcs[0]).toBe('sprites/vanilla/Cloud_2.png');
    } finally { restore(); }
  });

  it('成功落地后 has()=true 早退且不再发请求;失败态被清', () => {
    vi.useFakeTimers();
    const { srcs, stub, restore } = stubImage();
    try {
      let img: ImageBitmap | HTMLImageElement | null = null;
      stub.fail = false;                       // 200 语义:同步 onload
      const has = () => img != null;
      loadBitmapOnly('vanilla/Background_8.png', has, (x) => { img = x; });
      expect(srcs.length).toBe(1);
      expect(img).not.toBeNull();
      loadBitmapOnly('vanilla/Background_8.png', has, () => {});
      expect(srcs.length).toBe(1);             // 命中缓存,零请求
    } finally { restore(); }
  });
});

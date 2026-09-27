// ★G类 共享事件源双计（2026-09-27,worldGl 家族续刀）:
//  installGpuPressureGuard 同一 onLost 闭包注册两路——主画布 addEventListener +
//  window capture 哨兵。主画布 contextlost 事件捕获阶段先过 window、再达目标画布
//  →onLost 同事件执行两次:losses.push×2（熔断阈值 3=1.5 次真丢失即触发）+
//  ChunkCache.MAX_CHUNKS 每事件腰斩两次+写一次缓存失效扫双跑。
//  修=事件对象身份 WeakSet 去重（双注册面保留:window 哨兵覆盖无守卫画布的语义不变）。
//  行为面属 onLost 闭包内部态,以源锚锁+接线不变式固化（p0c 源锚判例）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ENG = readFileSync(new URL('../src/render/Renderer.ts', import.meta.url), 'utf8');

describe('GPU 压力守卫 contextlost 双路去重', () => {
  it('onLost 入口按事件身份去重（同一事件恒计一次）', () => {
    expect(ENG).toContain('const seenLossEvents = new WeakSet<Event>();');
    expect(ENG).toContain('if (seenLossEvents.has(e)) return;');
    expect(ENG).toContain('seenLossEvents.add(e);');
  });
  it('双注册面保留:主画布监听+window capture 哨兵（覆盖无守卫画布语义不变）', () => {
    expect(ENG).toContain("this.canvas.addEventListener('contextlost', onLost)");
    expect(ENG).toContain("window.addEventListener('contextlost', onLost, true)");
  });
  it('去重位在失效扫/计数之前（双跑副作用面全部被门住）', () => {
    const onLostIdx = ENG.indexOf('const onLost = (e: Event) => {');
    const dedupeIdx = ENG.indexOf('seenLossEvents.add(e);');
    const sweepIdx = ENG.indexOf('clearPaperDollCache();', onLostIdx);
    const pushIdx = ENG.indexOf('losses.push(now);', onLostIdx);
    expect(dedupeIdx).toBeGreaterThan(onLostIdx);
    expect(dedupeIdx).toBeLessThan(sweepIdx);
    expect(dedupeIdx).toBeLessThan(pushIdx);
  });
});

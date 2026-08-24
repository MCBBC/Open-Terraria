// AudioContext 首次手势解锁回归(2026-08-24 用户报告:标题曲被浏览器自动播放
// 策略拦截后点击任意处不出声)。缺陷:audio() 里的 resume 在无手势时被拒后
// 无人重试,已起的源静默空转。修法:AudioSystem 构造即挂 window 捕获态
// pointerdown/keydown/touchstart,首次手势 resume 成功即自摘监听。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AudioSystem } from '../src/core/Audio';

const rafBackup = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
const windowBackup = (globalThis as { window?: unknown }).window;

class FakeAC {
  state: 'suspended' | 'running' = 'suspended';
  resumeCalls = 0;
  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
}

/** 可录制的 window 桩:addEventListener/removeEventListener 记账 */
function stubWindow() {
  const added = new Map<string, EventListener>();
  const removed = new Map<string, EventListener>();
  const win = {
    addEventListener(type: string, fn: EventListener) { added.set(type, fn); },
    removeEventListener(type: string, fn: EventListener) { removed.set(type, fn); },
  };
  (globalThis as { window?: unknown }).window = win;
  return { added, removed };
}

function priv(sys: AudioSystem) {
  return sys as unknown as {
    ac: FakeAC | null;
    unlockBound: Array<[string, EventListener]> | null;
  };
}

beforeEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = () => 0;
});
afterEach(() => {
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = rafBackup;
  (globalThis as { window?: unknown }).window = windowBackup;
});

describe('AudioContext 首次手势解锁', () => {
  it('构造即挂 pointerdown/keydown/touchstart 三监听', () => {
    const { added } = stubWindow();
    new AudioSystem();
    expect([...added.keys()].sort()).toEqual(['keydown', 'pointerdown', 'touchstart']);
  });

  it('挂起态点击 → resume → running → 监听自摘(再点不重复触发)', async () => {
    const { added, removed } = stubWindow();
    const sys = new AudioSystem();
    const ac = new FakeAC();
    priv(sys).ac = ac;
    const fn = added.get('pointerdown')!;
    fn(new Event('pointerdown'));
    await new Promise((r) => setTimeout(r, 0));
    expect(ac.resumeCalls).toBe(1);
    expect(priv(sys).unlockBound).toBeNull();          // 自摘
    expect(removed.has('pointerdown')).toBe(true);
    fn(new Event('pointerdown'));                       // 已摘:再点不再 resume
    await new Promise((r) => setTimeout(r, 0));
    expect(ac.resumeCalls).toBe(1);
  });

  it('resume 被拒(仍挂起)→ 监听保留,下次手势再试', async () => {
    const { added } = stubWindow();
    const sys = new AudioSystem();
    let rejectNext = true;
    const ac = new FakeAC();
    ac.resume = () => {
      ac.resumeCalls++;
      if (rejectNext) return Promise.reject(new Error('gesture required'));
      ac.state = 'running';
      return Promise.resolve();
    };
    priv(sys).ac = ac;
    const fn = added.get('keydown')!;
    fn(new Event('keydown'));
    await new Promise((r) => setTimeout(r, 0));
    expect(priv(sys).unlockBound).not.toBeNull();       // 被拒:监听保留
    rejectNext = false;
    fn(new Event('keydown'));
    await new Promise((r) => setTimeout(r, 0));
    expect(ac.resumeCalls).toBe(2);
    expect(priv(sys).unlockBound).toBeNull();           // 二次成功:自摘
  });

  it('上下文已 running 的手势 → 直接自摘不调 resume', () => {
    const { added } = stubWindow();
    const sys = new AudioSystem();
    const ac = new FakeAC();
    ac.state = 'running';
    priv(sys).ac = ac;
    added.get('touchstart')!(new Event('touchstart'));
    expect(ac.resumeCalls).toBe(0);
    expect(priv(sys).unlockBound).toBeNull();
  });

  it('上下文未建(ac=null)的手势 → 监听保留(等 play 建上下文后兜底)', () => {
    const { added } = stubWindow();
    const sys = new AudioSystem();
    priv(sys).ac = null;
    added.get('pointerdown')!(new Event('pointerdown'));
    expect(priv(sys).unlockBound).not.toBeNull();
  });

  it('window 缺 addEventListener(node {} 桩)→ 构造不炸不挂监听', () => {
    (globalThis as { window?: unknown }).window = {};
    const sys = new AudioSystem();
    expect(priv(sys).unlockBound).toBeNull();
  });
});

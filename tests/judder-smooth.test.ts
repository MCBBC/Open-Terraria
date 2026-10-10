// ★juddersmooth 机械闸(2026-10-10,?smooth=1 灰度)——迟到帧半步混合(judder smoothing):
//  纯判定表+帧尾序列账面(乒乓捕获/跳槽混合/断流卫生/resize 重建)。node 桩画布
//  (canvasFactory 注入缝);生产 canvasEnv.mkCanvas。像素级等价由实机探针兜底
//  (liquid-render-prepare-cache 先例)。
// 运行:npx vitest run tests/judder-smooth.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import {
  judderMissFrame, judderFrameEnd, judderSmoothSetForTest, judderResetForTest,
  judderClockForTest, judderCanvasFactoryForTest, JUDDER_MISS_RATIO, JUDDER_BLEND_ALPHA,
} from '../src/render/JudderSmooth';

/** 记录桩 ctx(canvas 尺寸可变;drawImage/globalAlpha/setTransform/save/restore 记账;
 *  记账面=主 ctx(混合面);捕获面记账在 stubFactory 的槽 ctx(cap:tag)) */
function recordingCtx(w = 64, h = 64, ext?: string[]) {
  const calls = ext ?? [];
  const canv = {
    width: w, height: h,
    getContext: () => null,
  };
  const ctx = {
    canvas: canv,
    globalAlpha: 1,
    drawImage(src: unknown, _x: number, _y: number) { calls.push(`draw:${(src as { __tag?: string }).__tag ?? '?'}@a${(ctx.globalAlpha as number).toFixed(2)}`); },
    setTransform() { calls.push('setTransform'); },
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    clearRect() { /* 捕获槽清屏(记账噪声,不列) */ },
  };
  return { ctx: ctx as unknown as Parameters<typeof judderFrameEnd>[0], calls, canv };
}

/** 桩画布工厂:每个 (w,h) 新建带 __tag 的独立画布(乒乓槽身份可断言);槽 ctx 的
 *  drawImage 记账 `cap:tag`(捕获事件=写进哪个槽) */
function stubFactory(calls?: string[]) {
  let n = 0;
  return (w: number, h: number) => {
    const tag = `c${++n}`;
    const capCtx = {
      clearRect() {},
      drawImage() { calls?.push(`cap:${tag}`); },
    };
    const c = { __tag: tag, width: w, height: h, getContext: () => capCtx };
    return c as unknown as ReturnType<NonNullable<Parameters<typeof judderCanvasFactoryForTest>[0]>>;
  };
}

const P120 = 1000 / 120;

afterEach(() => {
  judderSmoothSetForTest(false);
  judderResetForTest();
  judderClockForTest(() => performance.now());
  judderCanvasFactoryForTest(() => null);
});

describe('judderMissFrame 纯判定表', () => {
  it('120 档:正常抖动 10ms=否/单跳槽 17ms=是/断流 300ms=否/长停顿 75ms(>周期×8)=否/首帧 -1=否/period 0=旁路', () => {
    expect(JUDDER_MISS_RATIO).toBe(1.5);
    expect(judderMissFrame(10, P120)).toBe(false);      // 12.5 线下
    expect(judderMissFrame(17, P120)).toBe(true);       // 单跳槽(16.7 交付间隔)
    expect(judderMissFrame(300, P120)).toBe(false);     // 断流
    expect(judderMissFrame(75, P120)).toBe(false);      // >8×8.33=66.6 长停顿
    expect(judderMissFrame(60, P120)).toBe(true);       // 66.6 线内深跳槽(多槽)
    expect(judderMissFrame(-1, P120)).toBe(false);      // 首帧
    expect(judderMissFrame(17, 0)).toBe(false);         // 跟满/未锚定旁路
    expect(judderMissFrame(17, -1)).toBe(false);
  });
  it('60 档:正常 16.7=否/跳槽 33.3=是(判据随档周期缩放,非绝对量纲)', () => {
    const p = 1000 / 60;
    expect(judderMissFrame(17, p)).toBe(false);
    expect(judderMissFrame(33.3, p)).toBe(true);
  });
});

describe('judderFrameEnd 帧尾序列(桩画布账面)', () => {
  it('旗关=完全旁路(零调用)', () => {
    judderSmoothSetForTest(false);
    const { ctx, calls } = recordingCtx();
    judderFrameEnd(ctx, P120, 100);
    expect(calls).toEqual([]);
  });

  it('period 0(跟满/未锚定)=旁路', () => {
    judderSmoothSetForTest(true);
    const { ctx, calls } = recordingCtx();
    judderFrameEnd(ctx, 0, 100);
    expect(calls).toEqual([]);
  });

  it('序列:首帧只捕获→正常帧只捕获(乒乓换槽)→跳槽帧混合(α=0.5,源=上一真帧槽)→捕获在前混合在后', () => {
    judderSmoothSetForTest(true);
    const calls: string[] = [];
    judderCanvasFactoryForTest(stubFactory(calls));
    const { ctx } = recordingCtx(64, 64, calls);            // 单一时间线(捕获+混合同数组)
    let t = 0;
    judderFrameEnd(ctx, P120, t);            // 首帧:gap=-1 只捕获(c1)
    expect(calls).toEqual(['cap:c1']);
    t += 8;                                   // 正常帧(gap 8<12.5):只捕获(c2,乒乓换槽)
    judderFrameEnd(ctx, P120, t);
    expect(calls).toEqual(['cap:c1', 'cap:c2']);
    t += 17;                                  // 跳槽帧(gap 17>12.5):先捕获(c1,乒乓回位)再混合(c2@α.5)
    judderFrameEnd(ctx, P120, t);
    expect(calls).toEqual(['cap:c1', 'cap:c2', 'cap:c1', 'save', 'setTransform', 'draw:c2@a0.50', 'restore']);
    // α 复位由真 ctx 的 save/restore 保证（桩 restore 不回写值,序列末 restore 即证）
  });

  it('断流(gap>250ms)=不混合只捕获;长停顿(gap>周期×8)同;连续跳槽无拖影累积(每次混合源=上一真帧)', () => {
    judderSmoothSetForTest(true);
    const calls: string[] = [];
    judderCanvasFactoryForTest(stubFactory(calls));
    const { ctx } = recordingCtx(64, 64, calls);
    let t = 0;
    judderFrameEnd(ctx, P120, t);            // c1
    t += 300;                                 // 断流
    judderFrameEnd(ctx, P120, t);            // c2(无混合)
    t += 8;
    judderFrameEnd(ctx, P120, t);            // c1
    t += 17;
    judderFrameEnd(ctx, P120, t);            // 跳槽:混 c2
    t += 17;
    judderFrameEnd(ctx, P120, t);            // 连续跳槽:混 c1(上一真帧,非混合帧)
    const blends = calls.filter((c) => c.startsWith('draw:'));
    expect(blends).toEqual(['draw:c1@a0.50', 'draw:c2@a0.50']);   // 源轮转=真帧乒乓(无 0.25^k 累积)
  });

  it('resize(canvas 尺寸变化)=整组重建,首帧不混合只捕获', () => {
    judderSmoothSetForTest(true);
    const calls: string[] = [];
    judderCanvasFactoryForTest(stubFactory(calls));
    const { ctx, canv } = recordingCtx(64, 64, calls);
    let t = 0;
    judderFrameEnd(ctx, P120, t);            // c1
    t += 8;
    judderFrameEnd(ctx, P120, t);            // c2
    canv.width = 128;                         // resize
    t += 17;                                  // gap 够跳槽,但重建后无真帧
    judderFrameEnd(ctx, P120, t);
    expect(calls.filter((c) => c.startsWith('draw:'))).toEqual([]);   // 重建帧零混合
    expect(calls[calls.length - 1]).toBe('cap:c3');                             // 新画布组捕获
  });

  it('跳槽混合不污染捕获(混合发生在捕获后):跳槽帧的捕获内容=本帧真值(混合前的 visible)', () => {
    judderSmoothSetForTest(true);
    const calls: string[] = [];
    judderCanvasFactoryForTest(stubFactory(calls));
    const { ctx } = recordingCtx(64, 64, calls);
    let t = 0;
    judderFrameEnd(ctx, P120, t);
    t += 8;
    judderFrameEnd(ctx, P120, t);
    t += 17;
    judderFrameEnd(ctx, P120, t);
    // 跳槽帧的调用序:捕获(cap:c1,本帧真值)先于混合(draw:c2@0.5)——prevRaw 恒真帧的机制保证
    expect(calls.indexOf('draw:c2@a0.50')).toBeGreaterThan(calls.lastIndexOf('cap:c1'));
    expect(JUDDER_BLEND_ALPHA).toBe(0.5);
  });
});

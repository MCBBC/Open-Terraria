// ★motionblur 机械闸（2026-10-14 二次调版,?mblur=1 灰度）——速度门控世界域运动模糊:
//  纯判定表 + 帧序账面（懒武装乒乓/EMA 平滑/方向位移双档/卫生旁路）。
//  ★帧序口径:①首调用=锚定帧（dt 无效零 op）;②armed/α 消费【EMA 平滑速度】
//  （τ=80ms——60Hz 逻辑步进下瞬时 speed=0/2 锯齿,直接驱动=拖影抖动本体,用户
//  实报定谳）→武装需 EMA 收敛（700px/s 阶跃 ≈5 帧过阈,15 帧近稳态 α 饱和 0.3）;
//  单帧回落不闪（EMA 缓降）,连续慢帧才降到阈下。爆表门用瞬时值（传送须即时）。
// 运行:npx vitest run tests/motionblur.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import {
  mblurAlpha, mblurSetForTest, mblurResetForTest, mblurTuneForTest,
  mblurCanvasFactoryForTest, mblurStats, motionBlurStep,
  MBLUR_V_MIN, MBLUR_V_MAX, MBLUR_A_MAX, MBLUR_V_HARD,
} from '../src/render/MotionBlur';
import type { Ctx2D } from '../src/render/canvasEnv';

function recordingCtx(w = 64, h = 64, calls?: string[]) {
  const ctx = {
    canvas: { width: w, height: h },
    globalAlpha: 1,
    drawImage(_src: unknown, _x: number, _y: number) {
      calls?.push(`draw@${(ctx.globalAlpha as number).toFixed(2)}`);
    },
    setTransform() { calls?.push('setTransform'); },
    save() { calls?.push('save'); },
    restore() { calls?.push('restore'); },
  };
  return ctx as unknown as Ctx2D;
}

function stubFactory(calls?: string[], gcos?: string[]) {
  let n = 0;
  return (w: number, h: number) => {
    const tag = `m${++n}`;
    const capCtx = { drawImage() { calls?.push(`cap:${tag}`); } };
    Object.defineProperty(capCtx, 'globalCompositeOperation', {
      get() { return this.__v ?? 'source-over'; },
      set(v: string) { this.__v = v; gcos?.push(v); },
    });
    return { width: w, height: h, getContext: () => capCtx } as never;
  };
}

const F = 16.7;   // 60 档帧距

/** 帧驱动器:锚定帧+`n` 帧恒速 `v` px/s(纯 x 向)。返回末时刻/位置。 */
function drive(ctx: Ctx2D, n: number, v: number, t0 = 0, x0 = 0) {
  let t = t0, x = x0;
  motionBlurStep(ctx, x, 0, t);                    // 锚定
  for (let i = 0; i < n; i++) { t += F; x += v * F / 1000; motionBlurStep(ctx, x, 0, t); }
  return { t, x };
}

afterEach(() => {
  mblurSetForTest(false);
  mblurResetForTest();
  mblurTuneForTest(250, 550, 0.3, 2000);
  mblurCanvasFactoryForTest(() => null);
});

describe('mblurAlpha 纯判定表', () => {
  it('速度门控曲线:阈下=0,区间线性,满速=aMax(双档总=×1.5)', () => {
    // ★标定勘误(2026-10-14):1500/12000 系 mph 换算错误(原版 px/tick 积分——裸走
    //   180/靴族 360-405/翼飞同域);重标 250/550。二次调 α 0.4→0.3(用户一报过浓)。
    expect(MBLUR_V_MIN).toBe(250);
    expect(MBLUR_V_MAX).toBe(550);
    expect(MBLUR_A_MAX).toBe(0.3);
    expect(mblurAlpha(0)).toBe(0);
    expect(mblurAlpha(250)).toBe(0);                     // 阈下（> 判定）
    expect(mblurAlpha(400)).toBeCloseTo(0.3 * 150 / 300, 3);   // 靴族域=半 α
    expect(mblurAlpha(550)).toBe(0.3);                   // 满速（翼飞/矿车域）
    expect(mblurAlpha(1000)).toBe(0.3);                  // 超满速钳上限
    expect(mblurAlpha(-1)).toBe(0);
  });
  it('爆表阈恒量（钩爪/极速域,瞬时值判定;真传送走 tpVeil 渲染门）', () => {
    expect(MBLUR_V_HARD).toBe(2500);
  });
});

describe('motionBlurStep 帧序账面（EMA 平滑+懒武装乒乓）', () => {
  it('旗关/锚定帧/静止期=零调用（懒武装:EMA 阈下全旁路）', () => {
    mblurSetForTest(false);
    const calls: string[] = [];
    const ctx = recordingCtx(64, 64, calls);
    motionBlurStep(ctx, 0, 0, 0);
    motionBlurStep(ctx, 10, 0, F);
    expect(calls).toEqual([]);
    mblurSetForTest(true);
    mblurCanvasFactoryForTest(stubFactory());
    motionBlurStep(ctx, 0, 0, 0);   // 锚定
    for (let i = 0; i < 12; i++) { motionBlurStep(ctx, 100 * i * F / 1000, 0, i * F + F); }   // 100px/s
    expect(calls).toEqual([]);
  });

  it('★EMA 收敛武装:恒速 700px/s 阶跃 ≈5 帧过阈武装,稳态 α 饱和 0.3+双档衰减', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    drive(ctx, 15, 700);   // 锚定+15 帧 700px/s:EMA 670+(近稳态)
    const s = mblurStats();
    expect(s.armCount).toBe(1);
    expect(s.blends).toBeGreaterThanOrEqual(8);          // 武装第 2 帧起持续混合
    expect(s.armed).toBe(true);
    // 稳态尾部:α=0.3 饱和,档 2=×0.5
    expect(calls).toContain('draw@0.30');
    expect(calls).toContain('draw@0.15');
  });

  it('★锯齿速度(0/2 交替)不闪:EMA 平滑下 armed 稳定、连续混合', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    // 模拟 120fps 渲染 60Hz 步进:位移 0,13.4,0,13.4…（均速 400px/s,瞬时 0/800 锯齿）
    let t = 0, x = 0;
    motionBlurStep(ctx, x, 0, t);
    for (let i = 0; i < 30; i++) {
      t += F;
      if (i % 2 === 1) x += 800 * F / 1000;
      motionBlurStep(ctx, x, 0, t);
    }
    const s = mblurStats();
    expect(s.armCount).toBe(1);                          // 单次武装（不闪退）
    expect(s.blends).toBeGreaterThanOrEqual(10);         // 连续混合
    // ★断言口径=稳态段（尾部 12 个 draw@）:EMA≈均值 400 → α≈0.15 附近稳定;
    //   早期收敛段 α 从 0 爬坡=正常（非振荡）。若用瞬时值,交替 0 帧会 α=0 与
    //   800 帧 α=0.3 交替=抖动本体——EMA 保证稳态下界。
    const alphas = calls.filter((c) => c.startsWith('draw@')).map((c) => Number(c.slice(5)));
    const tail = alphas.slice(-12);
    // ★EMA 稳态在锯齿下波动范围 ~0.05-0.19（τ=80ms 压不完全灭=设计内;瞬时值方案
    //   会 0↔0.3 全幅振荡）。断言=无掉 0（min>0.03）+ 无全幅振荡（极差<0.2）。
    expect(Math.min(...tail)).toBeGreaterThan(0.03);     // 无掉 0 帧
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.2);
  });

  it('★先捕获后叠加序（干净帧晋升 prev=固定重影不累积）', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    drive(ctx, 15, 700);
    const lastCap = Math.max(...calls.map((c, i) => (c.startsWith('cap:') ? i : -1)));
    const lastDraw = Math.max(...calls.map((c, i) => (c.startsWith('draw@') ? i : -1)));
    expect(lastCap).toBeLessThan(lastDraw);              // 捕获先于叠加（同帧序）
  });

  it('★连续慢帧降阈:EMA 缓降过阈下后停叠加（单帧回落不闪=EMA 惯性,多帧才停）', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    const { t, x } = drive(ctx, 15, 700);                // 稳态武装
    const blends0 = mblurStats().blends;
    let tt = t, xx = x;
    for (let i = 0; i < 3; i++) { tt += F; xx += 100 * F / 1000; motionBlurStep(ctx, xx, 0, tt); }
    // 3 帧慢速:EMA 仍在阈上(670→~450)——继续叠加（不闪,设计语义）
    expect(mblurStats().blends).toBeGreaterThan(blends0);
    for (let i = 0; i < 8; i++) { tt += F; xx += 100 * F / 1000; motionBlurStep(ctx, xx, 0, tt); }
    // 11 帧慢速后:EMA≈120<250——停叠加,捕获继续(武装保持窗内)
    const blends1 = mblurStats().blends;
    const capCount = calls.filter((c) => c.startsWith('cap:')).length;
    for (let i = 0; i < 3; i++) { tt += F; xx += 100 * F / 1000; motionBlurStep(ctx, xx, 0, tt); }
    expect(mblurStats().blends).toBe(blends1);
    expect(calls.filter((c) => c.startsWith('cap:')).length).toBeGreaterThan(capCount);
  });

  it('★静默退役:末次超阈后 2s 退役+prev 清位（再起速重新武装不混陈旧帧）', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    const { t, x } = drive(ctx, 15, 700);
    const mark = calls.length;
    let tt = t + 2001, xx = x + 100 * 2001 / 1000;      // 2s 静默帧:退役
    motionBlurStep(ctx, xx, 0, tt);
    const mark2 = calls.length;
    expect(calls.slice(mark, mark2)).toEqual([]);
    tt += F; xx += 100 * F / 1000;
    motionBlurStep(ctx, xx, 0, tt);                      // 退役后:零调用
    expect(calls.slice(mark2)).toEqual([]);
    const { t: t3, x: x3 } = drive(ctx, 15, 700, tt, xx);   // 再起速:EMA 重新收敛武装
    expect(mblurStats().armCount).toBe(2);
    void t3; void x3;
    // ★陈旧 prev 不混=重武装【首帧】无叠加（arm 时 prevCanvas=null 机制）;武装后
    //   第 2 帧起新 prev 正常混合（blends>0）——全程零 draw 是错误期望（首版断言错）。
    expect(mblurStats().blends).toBeGreaterThan(0);
  });

  it('★传送爆表(瞬时值):旁路叠加+prev 重置;下一帧起恢复模糊', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    const { t, x } = drive(ctx, 15, 700);
    const blends0 = mblurStats().blends;
    const mark = calls.length;
    let tt = t + F, xx = x + 3000 * F / 1000;            // 3000px/s 瞬时爆表
    motionBlurStep(ctx, xx, 0, tt);
    expect(mblurStats().teleportSkips).toBe(1);
    expect(calls.slice(mark).some((c) => c.startsWith('draw@'))).toBe(false);
    tt += F; xx += 700 * F / 1000;                        // 恢复:prev=爆表帧=正常模糊
    motionBlurStep(ctx, xx, 0, tt);
    expect(mblurStats().blends).toBe(blends0 + 1);
  });

  it('★暂停/死亡旁路:暂停保状态;死亡重置 prev（恢复帧无叠加）', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    const { t, x } = drive(ctx, 15, 700);
    const mark = calls.length;
    let tt = t + F, xx = x + 700 * F / 1000;
    motionBlurStep(ctx, xx, 0, tt, true, false);          // 暂停:旁路保状态（EMA 冻结）
    expect(calls.slice(mark)).toEqual([]);
    tt += F; xx += 700 * F / 1000;
    motionBlurStep(ctx, xx, 0, tt, false, true);          // 死亡:旁路+prev 重置
    expect(calls.slice(mark)).toEqual([]);
    tt += F; xx += 700 * F / 1000;
    motionBlurStep(ctx, xx, 0, tt);                       // 恢复:无 prev 只捕获
    const tail = calls.slice(mark);
    expect(tail.filter((c) => c.startsWith('cap:')).length).toBe(1);
    expect(tail.some((c) => c.startsWith('draw@'))).toBe(false);
  });

  it('★捕获单 op 化:copy gco 整幅替换（judder v3\' 同判例）+复位成对', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    const gcos: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls, gcos));
    const ctx = recordingCtx(64, 64, calls);
    drive(ctx, 15, 700);
    const caps = gcos.filter((g) => g === 'copy').length;
    const resets = gcos.filter((g) => g === 'source-over').length;
    expect(caps).toBeGreaterThanOrEqual(10);
    expect(resets).toBe(caps);                            // 每捕获 1 copy+1 复位成对
  });

  it('★resize（武装期尺寸变化）=槽组重建,当帧无叠加', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    const dynCtx = { canvas: { width: 64, height: 64 }, globalAlpha: 1,
      drawImage() { calls.push(`draw@${dynCtx.globalAlpha.toFixed(2)}`); },
      setTransform() { calls.push('setTransform'); }, save() {}, restore() {} };
    mblurCanvasFactoryForTest(stubFactory(calls));
    const c = dynCtx as unknown as Ctx2D;
    const { t, x } = drive(c, 15, 700);
    const mark = calls.length;
    (dynCtx.canvas as { width: number }).width = 128;
    let tt = t + F, xx = x + 700 * F / 1000;
    motionBlurStep(c, xx, 0, tt);
    expect(calls.slice(mark).some((s) => s.startsWith('draw@'))).toBe(false);
    expect(calls.slice(mark).some((s) => s.startsWith('cap:'))).toBe(true);
  });

  it('★计数器:frames/armedFrames/blends/armCount 累计', () => {
    mblurSetForTest(true);
    const calls: string[] = [];
    mblurCanvasFactoryForTest(stubFactory(calls));
    const ctx = recordingCtx(64, 64, calls);
    drive(ctx, 20, 700);                                  // 锚定+20 帧
    const s = mblurStats();
    expect(s.frames).toBe(21);
    expect(s.armCount).toBe(1);
    expect(s.armedFrames).toBeGreaterThan(10);            // EMA 收敛后持续
    expect(s.blends).toBeGreaterThan(8);
    expect(s.armed).toBe(true);
  });
});

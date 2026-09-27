// ★调度面修复刃(2026-09-28):帧模式 subtle 档确定性节拍对齐——FrameBeat 纯状态机单测
//  + 三档语义锁(vanilla 1457 亲读锚,见 FrameBeat.ts 头注) + 修前/修后节拍 digest 模拟。
//  判别指标=「帧距序列的跳变次数」(用户实报"高于 60fps 仍卡一下"=节拍摆动):
//  修前被动门(阈值 1000/cap-1 落 vsync 整数倍±抖动带)与修前 SuppressDraw(0 步进帧
//  跳绘=累计器相位随机游走)在抖动流上高频翻转;修后帧序计数落拍=帧距恒定。
//  模拟器口径:rAF 回调在 vsync 边界触发(±抖动),渲染占用推迟后续回调(busyUntil)
//  ——修前/修后喂同一回调时间流(同一 LCG 抖动/成本序列),公平 A/B。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FrameBeat, GRID_MS, UPGRADE_HOLD_MS } from '../src/core/FrameBeat';

const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const BEAT = readFileSync(new URL('../src/core/FrameBeat.ts', import.meta.url), 'utf8');

/** 确定性 LCG(单测须可复现,禁 Math.random) */
function lcgOf(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

const HZ120 = 1000 / 120;
const HZ60 = 1000 / 60;

/** 显示网格 interval 流(按绝对网格步索引;修前/修后共享同一物理显示节拍=公平 A/B) */
function makeIntervals(vsync: number, jitter: number, n: number, seed: number) {
  const lcg = lcgOf(seed);
  return Array.from({ length: n }, () => vsync * (1 + jitter * (2 * lcg() - 1)));
}

/**
 * 引擎驱动器:回调时间流喂 FrameBeat,返回渲染帧起点序列。
 * 回调时点模型(真实 Chrome):rAF 只在「上一回调之后的下一网格点」触发;渲染超支
 * 越过网格点时,迟帧的回调在解堵点(busy)即跑,再下一回调回到网格——时间戳单调。
 */
function runBeat(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0 } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const beat = new FrameBeat();
  let step = 0;
  let grid = 0;
  let busy = 0;
  let prevT = -1;
  const rendered: number[] = [];
  for (let i = 0; i < callbacks; i++) {
    while (grid <= prevT) grid += intervals[step++ % intervals.length];
    const t = Math.max(grid, busy);
    prevT = t;
    beat.observeVsync(t, cap);
    if (beat.shouldRender(t)) {
      beat.beginRender(t);
      rendered.push(t);
      const c = typeof cost === 'function' ? cost(i, t) : cost;
      busy = t + c;
      beat.endRender(t + c);
    }
  }
  return { beat, rendered };
}

/** 修前行为复刻(修复前 Game.ts start()/frame() 逐行对译;判据=公平 A/B 的旧侧) */
function runOld(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0 } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const FIXED = GRID_MS / 1000;
  let step = 0;
  let grid = 0;
  let busy = 0;
  let prevT = -1;
  let lastCapTs = 0;
  let lastTime = 0;
  let acc = 0;
  const rendered: number[] = [];
  for (let i = 0; i < callbacks; i++) {
    while (grid <= prevT) grid += intervals[step++ % intervals.length];
    const t = Math.max(grid, busy);
    prevT = t;
    // 旧被动 frameCap 门(原式:cap>0 且 1000/cap-1ms 未到即跳)
    if (cap > 0 && t - lastCapTs < 1000 / cap - 1) continue;
    lastCapTs = t;
    // frame() 逻辑面:累计器恒 60Hz + subtle 0 步进帧 SuppressDraw(旧分支)
    const dtMs = t - lastTime;
    lastTime = t;
    acc += Math.min(dtMs / 1000, 0.25);
    let steps = 0;
    while (acc >= FIXED && steps < 5) { acc -= FIXED; steps++; }
    if (steps === 0) continue; // 旧 SuppressDraw:0 步进帧不重绘
    rendered.push(t);
    const c = typeof cost === 'function' ? cost(i, t) : cost;
    busy = t + c;
  }
  return { rendered };
}

/** 帧距序列指标:p50/标准差/跳变次数(|相邻帧距差|>jumpMs) */
function gapStats(rendered: number[], jumpMs = 4) {
  const gaps: number[] = [];
  for (let i = 1; i < rendered.length; i++) gaps.push(rendered[i] - rendered[i - 1]);
  const s = [...gaps].sort((a, b) => a - b);
  const p50 = s[Math.floor(s.length / 2)] ?? 0;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
  let jumps = 0;
  for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > jumpMs) jumps++;
  return { p50, std, jumps, gaps };
}

describe('拍选择纯函数(minK:容量→拍)', () => {
  it.each([
    ['60Hz 屏 cap60 → 每帧', HZ60, 60, 1],
    ['60Hz 屏 cap90 → cap 高于网格,网格地板绑定 → 每帧', HZ60, 90, 1],
    ['120Hz 屏 cap60 → 每 2 vsync(60Hz 拍)', HZ120, 60, 2],
    ['120Hz 屏 cap0 → 网格地板 → 每 2 vsync', HZ120, 0, 2],
    ['120Hz 屏 cap120 → cap 不低于网格,与 cap0 同界', HZ120, 120, 2],
    ['120Hz 屏 cap30 → cap 压拍 → 每 4 vsync', HZ120, 30, 4],
    ['90Hz 屏 cap0 → 每 2 vsync(45fps 确定拍)', 1000 / 90, 0, 2],
    ['144Hz 屏 cap0 → 每 3 vsync(50fps 确定拍)', 1000 / 144, 0, 3],
    ['240Hz 屏 cap0 → 每 4 vsync(60Hz 拍)', 1000 / 240, 0, 4],
  ])('%s', (_name, vsync, cap, want) => {
    const { beat } = runBeat({ vsync, cap, cost: 2, callbacks: 120 });
    expect(beat.k).toBe(want);
  });

  it('shouldRender 时间护栏不参与正常拍(拍周期已达目标时纯序数,护栏不因抖动自造跳帧)', () => {
    const beat = new FrameBeat();
    beat.observeVsync(0, 60);
    beat.observeVsync(HZ120, 60);           // vsync 估计 → 8.33
    beat.observeVsync(2 * HZ120 - 3, 60);   // 回调早到 3ms(抖动)
    expect(beat.shouldRender(2 * HZ120 - 3)).toBe(true);   // 序数 3≥2 即拍
  });
});

describe('确定性节拍(帧距恒定)', () => {
  it('120Hz cap60:帧距恒 ≈16.7ms,零跳变', () => {
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 60, cost: 5, callbacks: 2400 });
    expect(beat.k).toBe(2);
    const st = gapStats(rendered.slice(40));   // 去 vsync 估计预热段
    expect(st.p50).toBeGreaterThan(GRID_MS - 1);
    expect(st.p50).toBeLessThan(GRID_MS + 1);
    expect(st.jumps).toBe(0);
  });

  it('60Hz cap60:每帧拍,帧距恒 ≈16.7ms', () => {
    const { beat, rendered } = runBeat({ vsync: HZ60, cap: 60, cost: 5, callbacks: 1200 });
    expect(beat.k).toBe(1);
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(HZ60 - 1);
    expect(st.p50).toBeLessThan(HZ60 + 1);
  });

  it('cap30@120Hz:拍=4 vsync,帧距恒 ≈33.3ms', () => {
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 30, cost: 5, callbacks: 2400 });
    expect(beat.k).toBe(4);
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(1000 / 30 - 1);
    expect(st.p50).toBeLessThan(1000 / 30 + 1);
  });
});

describe('容量降拍(超预算即降)', () => {
  it('60Hz 单帧成本 20ms>预算 16.7 → 立即降到 k=2,帧距稳 33.3', () => {
    const { beat, rendered } = runBeat({ vsync: HZ60, cap: 0, cost: 20, callbacks: 600 });
    expect(beat.k).toBe(2);
    expect(beat.lastReason).toBe('overbudget');
    const st = gapStats(rendered.slice(40));
    expect(st.p50).toBeGreaterThan(2 * HZ60 - 2);
    expect(st.p50).toBeLessThan(2 * HZ60 + 2);
  });

  it('持续 22ms@60Hz → 稳在 k=2(33.3 预算容纳,不连降)', () => {
    const { beat } = runBeat({ vsync: HZ60, cap: 0, cost: 22, callbacks: 600, seed: 11 });
    expect(beat.k).toBe(2);
  });

  it('拍地板:cap 收紧即时抬高拍(vsync 8.33,cap 0→30 → k 2→4)', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    let cap = 0;
    for (let i = 0; i < 160; i++) {
      if (i === 80) cap = 30;                 // 运行期收紧
      while (grid <= prevT) grid += HZ120;
      const t = Math.max(grid, busy);
      prevT = t;
      beat.observeVsync(t, cap);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        busy = t + 5;
        beat.endRender(t + 5);
      }
      if (i === 79) expect(beat.k).toBe(2);   // 收紧前稳在网格拍
    }
    expect(beat.k).toBe(4);                   // 收紧后地板抬到 4
    expect(beat.lastReason).toBe('floor');
  });
});

describe('滞回升拍(降快升慢)', () => {
  it('重载压到 k=4,成本回落后需 p95 清窗+持续保持才逐级升(10s 只升一级)', () => {
    const { beat } = runBeat({
      vsync: HZ120, cap: 60, callbacks: 1200,
      cost: (_i, t) => (t < 1000 ? 30 : 5),   // 前 1s 重载压拍,之后轻载
    });
    expect(beat.k).toBe(2);                    // 4→3→2(清窗 2s+保持 2s/级,10s 两级)
    expect(beat.lastReason).toBe('upgrade');
  });

  it('升拍保持期内单帧超预算 → 立即降回;清窗+保持后锯齿回升(有界震荡)', () => {
    // 场景(60Hz 屏):22ms 重载(不越 2 拍 33.3,回调流干净)压到容量拍 k=2;
    // 轻载后 p95 清窗+保持 2s 升回 k=1;保持后首帧注入 20ms>预算(16.7) → 立即降回;
    // 再清窗+保持 → 锯齿回升 k=1(降快升慢,震荡有界)
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    let phase: 'heavy' | 'light' = 'heavy';
    let spiked = false;
    for (let i = 0; i < 900; i++) {
      while (grid <= prevT) grid += HZ60;
      const t = Math.max(grid, busy);
      prevT = t;
      beat.observeVsync(t, 0);
      if (phase === 'heavy' && beat.k === 2 && i > 30) phase = 'light';   // 已压满,转轻载
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        let c = 5;
        if (phase === 'heavy') c = 22;
        else if (!spiked && beat.k === 1 && beat.lastReason === 'upgrade') {
          c = 20; spiked = true;              // 升回 k=1 后注入一帧超预算(>16.7)
        }
        busy = t + c;
        beat.endRender(t + c);
      }
    }
    expect(spiked).toBe(true);                 // 场景必现:重载压 2 → 轻载升 1 → 尖峰
    expect(beat.k).toBe(1);                    // 尖峰降回 2 后清窗+2s 保持又升回 1
    expect(beat.lastReason).toBe('upgrade');
  });
});

describe('失拍吸附(不追赶中途)', () => {
  it('单次失拍:拍不变;失拍帧照录,下一渲染吸附下一拍(帧距=拍,不补.render)', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    const rendered: number[] = [];
    for (let i = 0; i < 600; i++) {
      while (grid <= prevT) grid += HZ120;
      let t = Math.max(grid, busy);
      if (i === 300) t += 30;                  // 合成器侧停滞 30ms(回调断流一次)
      prevT = t;
      beat.observeVsync(t, 60);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        busy = t + 5;
        beat.endRender(t + 5);
      }
    }
    expect(beat.k).toBe(2);                    // 单次失拍不降档
    const gaps = rendered.slice(1).map((r, i) => r - rendered[i]);
    const missIdx = gaps.findIndex((g) => g > (2 + 0.7) * HZ120);
    expect(missIdx).toBeGreaterThan(0);        // 失拍确被记账(帧距>2.7 拍)
    // 吸附语义:失拍帧(迟到 30ms,占用了后续网格点)之后,下一渲染仍落【下一个
    // 序数槽】——帧距自然短于整拍(迟到帧已吃掉相角),但绝不立即追赶补.render
    // (那会是 busy 解堵即画,帧距≈成本 5ms)也不跨槽跳过
    const next = gaps[missIdx + 1];
    expect(next).toBeGreaterThan(HZ120 - 2);       // ≥1 个回调之后(非解堵即画)
    expect(next).toBeLessThan(3 * HZ120 + 3);      // ≤3 拍(无跨槽跳过)
  });

  it('连续失拍:容量不足 → 降拍(miss-streak)', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    let stallRenders = 0;
    for (let i = 0; i < 220; i++) {
      while (grid <= prevT) grid += HZ120;
      let t = Math.max(grid, busy);
      if (i >= 100 && i < 103) t += 30;        // 停滞小段:连续失拍恰好 2 次→降一级(3 回调止盈防级联)
      prevT = t;
      beat.observeVsync(t, 60);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        busy = t + 5;
        beat.endRender(t + 5);
        if (i >= 100) stallRenders++;
      }
    }
    expect(stallRenders).toBeGreaterThanOrEqual(3);
    expect(beat.k).toBe(3);
    expect(beat.lastReason).toBe('miss-streak');
  });
});

describe('★digest 修前/修后节拍对照(帧距序列跳变次数=判别指标)', () => {
  const N = 2400;        // 20s@120Hz / 40s@60Hz 仿真
  const jitter = 0.1;    // ±10% rAF 回调抖动(真实 rAF 常见量级)
  const TRIM = 40;       // 去 vsync 估计/拍选择预热段
  const costFn = (lcg: ReturnType<typeof lcgOf>) =>
    () => (lcg() < 0.25 ? 12 : 4);         // 基础 4ms,25% 帧尖峰 12ms

  it('120Hz cap60(缺省档,用户实报场景):修后跳变≪修前,p50 不变,方差降', () => {
    const seed = 42;
    const neo = runBeat({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(Math.max(2, stO.jumps * 0.2));
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(3);
    expect(stN.std).toBeLessThan(stO.std);
  });

  it('120Hz cap0:修前 SuppressDraw 相位游走高频翻转,修后零跳变', () => {
    const seed = 43;
    const neo = runBeat({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(Math.max(2, stO.jumps * 0.2));
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(3);
    expect(stN.std).toBeLessThan(stO.std);
  });

  it('60Hz cap60(多数用户场景):修后无回归(跳变不增,p50 不变)', () => {
    const seed = 44;
    const neo = runBeat({ vsync: HZ60, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ60, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(stO.jumps);
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(2);
  });
});

describe('三档语义锁(源锚)', () => {
  it('Game.start():subtle 走 beat 门(observeVsync/shouldRender/beginRender/endRender 接线)', () => {
    expect(GAME).toContain("import { FrameBeat } from './FrameBeat';");
    expect(GAME).toContain('this.beat.observeVsync(now, options.data.frameCap)');
    expect(GAME).toContain('if (!this.beat.shouldRender(now))');
    expect(GAME).toContain('this.beat.beginRender(now)');
    expect(GAME).toContain("if (mode === 'subtle') this.beat.endRender(performance.now())");
  });

  it('Game.start():被跳回调先于 _paintedFrames++ 早退(whenFirstPaint 只认真实渲染帧)', () => {
    const iSkip = GAME.indexOf('if (!this.beat.shouldRender(now))');
    const iCapSkip = GAME.indexOf('now - this._lastCapTs < 1000 / cap - 1');
    const iPaint = GAME.indexOf('this._paintedFrames++');
    expect(iSkip).toBeGreaterThan(-1);
    expect(iCapSkip).toBeGreaterThan(-1);
    expect(iPaint).toBeGreaterThan(-1);
    expect(iSkip).toBeLessThan(iPaint);
    expect(iCapSkip).toBeLessThan(iPaint);
  });

  it('SuppressDraw 旧分支已退役(0 步进帧照画,与 improved-subtle 同相)', () => {
    expect(GAME).not.toMatch(/frameSkipMode === 'subtle' && steps === 0/);
    expect(GAME).toContain('62624');   // 注释锚:EndDraw 忙等 present 网格
  });

  it('on/off 逃生门:被动 frameCap 门原样保留(旧自由渲染)', () => {
    expect(GAME).toContain('1000 / cap - 1');
  });

  it('FrameBeat.ts vanilla 锚齐备(1457 亲读行号)', () => {
    expect(BEAT).toContain('17129');   // 三态 IsFixedTimeStep
    expect(BEAT).toContain('17182');   // SuppressDraw 仅旧路径
    expect(BEAT).toContain('improvedSubtleFrameSkip');
    expect(BEAT).toContain('62624');   // EndDraw 忙等
    expect(BEAT).toContain('67615');   // 默认值
  });

  it('常数处方锁(任务给定,防漂移)', () => {
    expect(UPGRADE_HOLD_MS).toBe(2000);
    expect(GRID_MS).toBeCloseTo(1000 / 60);
  });
});

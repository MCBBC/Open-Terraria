// ★调度面修复刃(2026-09-28):帧模式 subtle 档确定性节拍对齐——FrameBeat 纯状态机单测
//  + 三档语义锁(vanilla 1457 亲读锚,见 FrameBeat.ts 头注) + 修前/修后节拍 digest 模拟。
//  ★热修刃(2026-09-28 同日):废除 60Hz 网格地板——TARGET=用户 frameCap(cap=0=1×vsync),
//  subtle 只对齐不钳速(否决注见 FrameBeat.ts 头注)。红判别器:cap=120@120Hz 旧码网格
//  地板 k=2 恒 60fps(红)→新码 k=1 恒 120fps 拍对齐(绿);重场景(帧耗抖动 12ms)新码
//  降拍到可持续拍(容量驱动,可逆)而非硬 60(钉死)。
//  ★热修刃 2(2026-09-28 同日):升拍 p50 制(v3 语义注)——旧判据 p95<0.8×budget(k−1)
//  持续 2s 顶格永不可达(本仓稳态帧耗 8-12ms,要求 p95<6.7ms)→降拍后钉 60=用户实报
//  cap120+subtle 进世界回不到 120。新判据 p50<budget(k−1) 连续 2 半窗(60 渲染帧):
//  beat 对齐下超预算帧只是顺延下一 vsync(对齐 60Hz 节拍)非失稳,中位数装得下即升;
//  p95 超标仅驱动降拍(持续过载)。红→绿:稳态帧耗 8-12ms(p50 8/p95 12,边界①形态)
//  旧判据永钉 k=2(红)/新判据升 k=1 通路活+节拍对齐(绿);p50 9/p95 12(预算上半区)
//  =render-bound 恒不升(边界③);重过载降拍保持(回归)。
//  判别指标=「帧距序列的跳变次数」(用户实报"高于 60fps 仍卡一下"=节拍摆动)+「帧距
//  p50 随 cap 走」(120 档 p50≈8.3 而非 16.7)。模拟器口径:rAF 回调在 vsync 边界触发
//  (±抖动),渲染占用推迟后续回调(busyUntil)——修前/修后喂同一回调时间流(同一 LCG
//  抖动/成本序列),公平 A/B。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FrameBeat, GRID_MS, UPGRADE_WIN_SAMPLES, UPGRADE_HOLD_WINDOWS } from '../src/core/FrameBeat';

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

/** 重场景成本形态:基础 4ms,25% 帧尖峰 12ms(双峰——处方"帧耗抖动 12ms";
 *  匀称恒超载会滑入 render-bound 常节奏=估计即节奏,引擎 k=1 恒帧距是物理最优) */
const costFn = (lcg: ReturnType<typeof lcgOf>) =>
  () => (lcg() < 0.25 ? 12 : 4);

/** 稳态切取(按时间):rAF 冷窗期(vsync 估计样本<31)首样本噪声可把 minK 瞬时抬高,
 *  经滞回升拍 ~2.5s 自愈(真实流程 afterWorldLoad resetSampling 用成熟估计,无此瞬态;
 *  纯仿真冷启动才有)——digest 判别面取稳态段 */
const steady = (rendered: number[], t0: number) => rendered.filter((t) => t >= t0);

/** 修前(本热修刃前)FrameBeat 复刻:targetMs 的 60Hz 网格地板——【仅此一处语义差】,
 *  其余状态机逐行同构(继承现行类+覆写 targetMs=首版公式)。红判别器的旧侧。 */
class OldGridFloorBeat extends FrameBeat {
  private gridCap = 0;
  override observeVsync(now: number, cap: number): void {
    this.gridCap = cap;
    super.observeVsync(now, cap);
  }
  override targetMs(cap = this.gridCap): number {
    return Math.max(GRID_MS, cap > 0 ? 1000 / cap : 0);
  }
}

/** 修前(升拍 p50 制之前)FrameBeat 复刻:升拍判据 p95<0.8×budget(k−1)——判据等价
 *  变形:p50 位置放 p95/0.8(p95<0.8×B ⟺ p95/0.8<B)。红判别器(第二设计错)的旧侧:
 *  本仓稳态帧耗 p95≈12 → 旧判据阈值 6.7ms 永不可达=降拍后永钉 k=2。保持时长差异
 *  (旧 2s 墙钟/新 60 渲染帧)对红侧无关紧要——条件恒假,永不进入保持。 */
class OldP95HeadroomBeat extends FrameBeat {
  override costP50(): number {
    return this.costP95() / 0.8;
  }
}

/** 稳态帧耗形态(边界①:预算边缘震荡)——75%@8ms/25%@12ms:p50=8<8.33 预算(升拍
 *  判据面),p95=12(降拍判据面,>预算 8.3→k=1 下 p95② 立即拉回)。任务处方
 *  "稳态帧耗 8-12ms"的可满足形态(字面 p50 9>8.33=render-bound,归边界③,另测) */
const costEdge = (lcg: ReturnType<typeof lcgOf>) => () => (lcg() < 0.75 ? 8 : 12);
/** render-bound 形态(边界③)——70%@9/30%@4:p50=9>8.33 恒不升(判别面=p50 字面值);
 *  ★不用 50/50@9/12:全帧超预算会让回调流 busy 锁相 → vsync 估计吃进帧距(估计即
 *  节奏,上一刀备注的 render-bound k=1 恒帧距稳态),判据面失义;30% 子预算帧保持
 *  回调落在 vsync 网格(估计诚实≈8.6),p50 判别面才纯 */
const costRenderBound = (lcg: ReturnType<typeof lcgOf>) => () => (lcg() < 0.7 ? 9 : 4);

/** 显示网格 interval 流(按绝对网格步索引;修前/修后共享同一物理显示节拍=公平 A/B) */
function makeIntervals(vsync: number, jitter: number, n: number, seed: number) {
  const lcg = lcgOf(seed);
  return Array.from({ length: n }, () => vsync * (1 + jitter * (2 * lcg() - 1)));
}

/**
 * 引擎驱动器:回调时间流喂 FrameBeat,返回渲染帧起点序列。
 * 回调时点模型(真实 Chrome):rAF 只在「上一回调之后的下一网格点」触发;渲染超支
 * 越过网格点时,迟帧的回调在解堵点(busy)即跑,再下一回调回到网格——时间戳单调。
 * make:引擎工厂(修前/修后 A/B 用——OldGridFloorBeat 复刻网格地板语义)。
 */
function runBeat(opts: {
  vsync: number;
  cap: number;
  cost: number | ((i: number, t: number) => number);
  callbacks: number;
  seed?: number;
  jitter?: number;
  make?: () => FrameBeat;
  onRender?: (beat: FrameBeat, t: number) => void;
}) {
  const { vsync, cap, cost, callbacks, seed = 7, jitter = 0, make = () => new FrameBeat(), onRender } = opts;
  const intervals = makeIntervals(vsync, jitter, callbacks * 8, seed);
  const beat = make();
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
      onRender?.(beat, t);
    }
  }
  return { beat, rendered };
}

/** 修前行为复刻(初版调度刃【之前】的 Game.ts start()/frame() 逐行对译;被动门+SuppressDraw) */
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

/** 首次落到 k=2 之后的 k=1 渲染帧数(升拍通路活性;剔除冷启动 k=1 噪声) */
function upgradesAfterK2(ks: number[]): number {
  const i2 = ks.indexOf(2);
  return i2 < 0 ? 0 : ks.slice(i2).filter((k) => k === 1).length;
}

describe('拍选择纯函数(minK:目标=用户 cap,网格地板已废)', () => {
  it.each([
    ['60Hz 屏 cap60 → 每帧', HZ60, 60, 1],
    ['60Hz 屏 cap90 → cap 高于屏率,屏率绑顶 → 每帧', HZ60, 90, 1],
    ['120Hz 屏 cap60 → cap 是真实天花板 → 每 2 vsync(60fps 拍)', HZ120, 60, 2],
    ['120Hz 屏 cap0 → 不设限=拍 1 vsync(全速,不再压回 60)', HZ120, 0, 1],
    ['120Hz 屏 cap120 → 拍 1 vsync(全速,不再压回 60)', HZ120, 120, 1],
    ['120Hz 屏 cap30 → cap 压拍 → 每 4 vsync', HZ120, 30, 4],
    ['90Hz 屏 cap0 → 拍 1 vsync(全速)', 1000 / 90, 0, 1],
    ['90Hz 屏 cap30 → 每 3 vsync(30fps 确定拍)', 1000 / 90, 30, 3],
    ['144Hz 屏 cap0 → 拍 1 vsync', 1000 / 144, 0, 1],
    ['240Hz 屏 cap0 → 拍 1 vsync', 1000 / 240, 0, 1],
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

describe('确定性节拍(帧距恒定;p50 随 cap 走)', () => {
  it('120Hz cap60:帧距恒 ≈16.7ms,零跳变(cap=60 是真实天花板,语义不变)', () => {
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

  it('★cap120@120Hz(用户实报场景):拍=1,帧距恒 ≈8.3ms 而非 16.7——p50 随 cap 走', () => {
    const { beat, rendered } = runBeat({ vsync: HZ120, cap: 120, cost: 4, callbacks: 2400 });
    expect(beat.k).toBe(1);
    const st = gapStats(rendered.slice(40));
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(HZ120 - 1);
    expect(st.p50).toBeLessThan(HZ120 + 1);
  });
});

describe('容量降拍(超预算即降;拍随容量可逆,非硬地板)', () => {
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

  it('★cap120@120Hz render-bound(帧耗 p50 9>预算 8.3):降拍①立即 k=2 且 p50 制恒不升(边界③;9ms<预算 16.7 容量容纳,不连降)', () => {
    const { beat } = runBeat({ vsync: HZ120, cap: 120, cost: costRenderBound(lcgOf(47)), callbacks: 600, jitter: 0.1 });
    expect(beat.k).toBe(2);
    expect(beat.lastReason).toBe('overbudget');
  });

  it('拍地板:cap 收紧即时抬高拍(vsync 8.33,cap 0→30 → k 1→4)', () => {
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
      if (i === 79) expect(beat.k).toBe(1);   // 收紧前:cap=0 → 全速拍 1(热修刃语义)
    }
    expect(beat.k).toBe(4);                   // 收紧后地板抬到 4
    expect(beat.lastReason).toBe('floor');
  });
});

describe('滞回升拍(降快升慢;容量拍可逆)', () => {
  it('重载压到 k=4,成本回落后需 p95 清窗+持续保持才逐级升(10s 只升一级)', () => {
    const { beat } = runBeat({
      vsync: HZ120, cap: 60, callbacks: 1200,
      cost: (_i, t) => (t < 1000 ? 30 : 5),   // 前 1s 重载压拍,之后轻载
    });
    expect(beat.k).toBe(2);                    // 4→3→2(清窗 2s+保持 2s/级,10s 两级)
    expect(beat.lastReason).toBe('upgrade');
  });

  it('★cap120@120Hz:12ms 重载降 k=2,轻载后清窗+2s 保持升回 k=1(拍随容量,不钉死)', () => {
    const { beat } = runBeat({
      vsync: HZ120, cap: 120, callbacks: 1200,
      cost: (_i, t) => (t < 1000 ? 12 : 4),
    });
    expect(beat.k).toBe(1);
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
    expect(beat.k).toBe(1);                    // 尖峰降回 2 后清窗+保持又升回 1
    expect(beat.lastReason).toBe('upgrade');
  });
});

describe('★升拍 p50 制(v3 热修刃:中位数装得下即升,顶格可达;判据史/理论根基见 FrameBeat.ts 头注)', () => {
  it('★红→绿:稳态帧耗 8-12ms(p50 8/p95 12,边界①形态)——旧判据(p95<0.8×budget)永钉 k=2(红);新判据升 k=1 通路活且节拍对齐(绿)', () => {
    const seed = 46;
    const cost = costEdge(lcgOf(seed));
    // 红(修前判据复刻 OldP95HeadroomBeat):p95=12 → 旧阈值 0.8×8.33=6.7 永不可达
    // → k=2 单向钉死(用户实报"进世界降拍后回不到 120")
    const ksO: number[] = [];
    const ro = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: 2400, seed, jitter: 0.1, make: () => new OldP95HeadroomBeat(), onRender: (b) => ksO.push(b.k) });
    expect(ro.beat.k).toBe(2);
    expect(upgradesAfterK2(ksO)).toBe(0);              // 升拍通路死=红
    // 绿(p50 制):p50=8<8.33 → 连续 2 半窗(60 渲染帧)即升;升后 p95②(12>8.33)立即
    // 拉回=边界②准稳态(有界震荡,升回 120 的通路活);全程帧距钉 vsync 网格带=对齐。
    // ★末拍 reason 随停点在震荡相位上漂(upgrade/capacity/overbudget 皆可能),不断言
    const ksN: number[] = [];
    const rn = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: 2400, seed, jitter: 0.1, onRender: (b) => ksN.push(b.k) });
    expect(upgradesAfterK2(ksN)).toBeGreaterThanOrEqual(3);   // 升拍通路活=绿
    const stN = gapStats(rn.rendered.slice(40));
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);  // 无整拍空档(对齐)
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.5 * HZ120); // 无解堵即画聚帧
    expect(stN.jumps).toBeLessThanOrEqual(upgradesAfterK2(ksN) * 2 + 2);  // 摆动有界
  });

  it('★稳态 120(顶格可达):稳态帧耗 6ms(p50/p95 均<8.33)降拍后按 p50 制回升 k=1 且【稳定驻留】零跳变', () => {
    // 前 1s 重载 12ms 恒(压 k=2),之后 6ms 稳态——p50 制回升后 p95 6<8.33 无拉回
    const { beat, rendered } = runBeat({
      vsync: HZ120, cap: 120, callbacks: 2400, jitter: 0.1,
      cost: (_i, t) => (t < 1000 ? 12 : 6),
    });
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('upgrade');
    const st = gapStats(rendered.slice(rendered.length - 600));   // 稳态段
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(HZ120 - 1);
    expect(st.p50).toBeLessThan(HZ120 + 1);
  });

  it('★边界③(任务红→绿处方字面形态 p50 9/p95 12):p50>budget 恒不升=render-bound 正确不升——处方字面"升 k=1"与判据公式(p50<8.33,任务三处+关键洞察明写)矛盾,以公式+边界③为准', () => {
    const seed = 49;
    const cost = costRenderBound(lcgOf(seed));
    const ks: number[] = [];
    const r = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: 2400, seed, jitter: 0.1, onRender: (b) => ks.push(b.k) });
    expect(upgradesAfterK2(ks)).toBe(0);               // 恒不升
    expect(r.beat.k).toBe(2);
    expect(['overbudget', 'capacity']).toContain(r.beat.lastReason);
  });

  it('防抖标定:判据连续 60 渲染帧(2 半窗)即升——轻于旧 p95 制 2s 墙钟(≈120 渲染帧@k2-120Hz)', () => {
    // ★回调流与渲染 busy 解耦(回调恒落严格 120Hz 网格,vsync 估计恒诚实 8.33)——
    //  只标定判据/防抖时长本身;busy 耦合下 cost-4 帧会让回调快于 vsync,估计吃进
    //  帧距塌缩(见 costRenderBound 注),标定面失真
    const climbAt = (make: () => FrameBeat) => {
      const beat = make();
      let renders = 0, upAt = -1, sawK2 = false;
      for (let i = 0; i < 600; i++) {
        const t = i * HZ120;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          const c = renders < 2 ? 12 : 4;   // 首两帧 12ms(估计收敛后)>预算 8.3 → 降拍①压 k=2;之后 4ms 稳态
          beat.endRender(t + c);
          renders++;
          if (beat.k === 2) sawK2 = true;
          if (sawK2 && beat.k === 1 && upAt < 0) upAt = renders;
        }
      }
      return upAt;
    };
    const neo = climbAt(() => new FrameBeat());
    const old_ = climbAt(() => new OldP95HeadroomBeat());
    expect(neo).toBeGreaterThan(0);
    expect(neo).toBeLessThanOrEqual(UPGRADE_WIN_SAMPLES * UPGRADE_HOLD_WINDOWS + 4);  // 降拍后 60 连续满足帧+窗滚出 12s 段
    expect(old_).toBeGreaterThan(neo);       // 旧 2s 墙钟@k2-120Hz ≈120 渲染帧,更慢
  });

  it('costP50 中位数基(升拍判据面):偶发尖峰不改中位数,p95 面照常反映尖峰', () => {
    const beat = new FrameBeat();
    beat.observeVsync(0, 0);
    for (let i = 0; i < 60; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 0);
      beat.beginRender(t);
      beat.endRender(t + (i % 10 === 9 ? 12 : 4));    // 10% 尖峰
    }
    expect(beat.costP50()).toBe(4);          // 90%@4 → 中位数 4(升拍判据面)
    expect(beat.costP95()).toBe(12);         // 尖峰进 p95(降拍判据面)
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

describe('★digest 修前/修后节拍对照(帧距序列跳变次数+p50 随 cap=判别指标)', () => {
  const N = 2400;        // 20s@120Hz / 40s@60Hz 仿真
  const jitter = 0.1;    // ±10% rAF 回调抖动(真实 rAF 常见量级)
  const TRIM = 40;       // 去 vsync 估计/拍选择预热段(帧数;cap60/60Hz 场景用)

  it('120Hz cap60(缺省档):修后跳变≪修前(被动门),p50 不变,方差降——语义不变无回归', () => {
    const seed = 42;
    const neo = runBeat({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const old_ = runOld({ vsync: HZ120, cap: 60, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(Math.max(2, stO.jumps * 0.2));
    expect(Math.abs(stN.p50 - stO.p50)).toBeLessThanOrEqual(3);
    expect(stN.std).toBeLessThan(stO.std);
  });

  it('120Hz cap0:修前 SuppressDraw 相位游走,修后帧距不慢于旧+摆动有界(★p50 制重写:4/12 抖动下准稳态震荡,跳变只来自升拍触顶 blip)', () => {
    const seed = 43;
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const old_ = runOld({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stN.jumps).toBeLessThanOrEqual(upgradesAfterK2(ksN) * 2 + 2);   // 摆动有界(非自由漂移)
    expect(stN.p50).toBeLessThanOrEqual(stO.p50 + 2);                      // 修后帧距不慢于旧(容量只多渲不少渲)
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);             // 无 33ms 整拍空档
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.5 * HZ120);            // 无解堵即画聚帧
  });

  it('★cap120@120Hz 轻载(用户实报场景):旧码网格地板恒 60fps(红)→新码恒 120fps 拍对齐(绿);p50 8.3 而非 16.7', () => {
    const seed = 45;
    const cost = 4;                           // 轻载:4ms < 8.3ms 预算,120 可持续
    const neo = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter });
    const old_ = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, make: () => new OldGridFloorBeat() });
    // 红(修前):网格地板 → 稳态 k=2 恒 60fps
    expect(old_.beat.k).toBe(2);
    const stO = gapStats(steady(old_.rendered, 5000));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);      // 旧 p50≈16.7
    expect(stO.p50).toBeLessThan(GRID_MS + 2);
    // 绿(修后):稳态 k=1 恒 120fps。冷启动首样本噪声可瞬时抬 floor(k=2),滞回升拍
    // ~2.5s 自愈(lastReason='upgrade' 即自愈凭证;真实流程 afterWorldLoad resetSampling
    // 用成熟估计无此瞬态)——判别面取 5s 后稳态段
    expect(neo.beat.k).toBe(1);
    expect(neo.beat.lastReason).toBe('upgrade');
    const stN = gapStats(steady(neo.rendered, 5000));
    expect(stN.p50).toBeGreaterThan(HZ120 - 1);        // 新 p50≈8.3
    expect(stN.p50).toBeLessThan(HZ120 + 1);
    expect(stN.jumps).toBe(0);
    expect(stN.jumps).toBeLessThanOrEqual(stO.jumps);  // 跳变不增
  });

  it('★cap120@120Hz 重场景(帧耗抖动 4/12ms;★p50 制重写):准稳态——升拍通路活(k 周期触顶 1)+p95/单帧看门狗压回 k=2,帧距无 33ms 整拍空档;旧网格地板码恒钉 k=2 零升拍(硬地板)', () => {
    const seed = 46;
    const cost = costFn(lcgOf(seed));
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const ksO: number[] = [];
    const old_ = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, make: () => new OldGridFloorBeat(), onRender: (b) => ksO.push(b.k) });
    // 新码(p50 制):p50=4<8.3 → 升拍通路活(周期性触顶 k=1);p95=12>8.3 看门狗立即
    // 压回 k=2 → 边界②准稳态(有界震荡;旧判据 p95 阈值 6.7 永不可达=单向钉死)
    expect(upgradesAfterK2(ksN)).toBeGreaterThanOrEqual(3);
    const stN = gapStats(neo.rendered.slice(TRIM));
    expect(stN.p50).toBeGreaterThan(GRID_MS - 2);      // k=2 为主准稳态 ≈16.7
    expect(stN.p50).toBeLessThan(GRID_MS + 2);
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);   // 无整拍空档(<25ms)
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.5 * HZ120);  // 无解堵即画聚帧
    // 摆动有界:跳变只来自升拍触顶的 8.3 blip(每次触顶 ≤2 跳),非自由漂移
    expect(stN.jumps).toBeLessThanOrEqual(upgradesAfterK2(ksN) * 2 + 2);
    // 旧码:网格地板钉死 k=2,升拍通路不存在(轻载对照见上例:旧恒 60,新 120)
    expect(old_.beat.k).toBe(2);
    expect(upgradesAfterK2(ksO)).toBe(0);
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);
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

  it('★网格地板已废除(targetMs 不再 max(GRID_MS,·);否决注在头注——防"忠实原版"回改)', () => {
    expect(BEAT).not.toContain('Math.max(GRID_MS');              // 首版网格地板公式已移除
    expect(BEAT).toContain('cap > 0 ? 1000 / cap : this.vsyncPeriod');  // 热修刃语义
    expect(BEAT).toContain('网格地板否决注');                     // 否决理由在头注
  });

  it('常数处方锁(任务给定,防漂移;★v3 p50 制:半窗粒度 30×连续 2 窗=60 渲染帧,轻于旧 2s 墙钟)', () => {
    expect(UPGRADE_WIN_SAMPLES).toBe(30);
    expect(UPGRADE_HOLD_WINDOWS).toBe(2);
    expect(GRID_MS).toBeCloseTo(1000 / 60);
  });
});

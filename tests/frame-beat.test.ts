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
//  ★热修刃 3(2026-09-29):降档边界改【帧率优先】(v6,判据参数级调整,v5 结构冻结令
//  仍有效)——用户实报帧耗 9-15ms 场景被 v5 线(p50 刚超当前拍预算 8.3)锁 60/40,而
//  该区间 k=1 realized ~90-110(不齐但高)仍高于 60 档对齐。新降档线=
//  p50 > budget(k+1)×DOWNGRADE_MARGIN(1.1):中位超过【下一更低档】预算×1.1 才降
//  (k=1@120Hz 线 18.3ms)。红判别器=OldV5Breach(v5 线复刻):p50 9 流(9-15 震荡)
//  旧线降 k=2 钉 60(红)/v6 留 k=1 跑 ~93fps(绿);p50 20 正确降 k=2 保留(旧线落
//  k=3,一档差);render-bound p50 40 逐级 2→3→4(逐级扫拍保留)。★判据算术面测试用
//  回调锁定驱动器(诚实估计):busy 耦合的恒重载流呈"估计即节奏"回声(FrameBeat 头注
//  饱和回声债),est→帧耗使 budget(k+1) 线被回声豁免——那是估计器债不是判据缺陷。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FrameBeat, GRID_MS, UPGRADE_WIN_SAMPLES, UPGRADE_HOLD_WINDOWS, UPGRADE_HEADROOM, DOWNGRADE_MARGIN, MISS_SLACK, MISS_GRID_TOL_REL, MISS_GRID_TOL_MS } from '../src/core/FrameBeat';

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

/** 修前(v4=升拍 p50 制代码原样)FrameBeat 复刻:v4 失效形态的红判别器旧侧。
 *  v4 判据组=【单帧 cost>budget 立即降】+【p95>budget 扫拍降】+【p50<budget(k−1)
 *  无余量升】——边界震荡会话(帧耗 p50 贴预算/p95 超预算)下升拍判据与降拍判据
 *  同时成立 → k 1↔2 flap(帧距 8.3/16.7 混样=FPS 读数 80-90 反复)。
 *  复刻口径:经 v5 的 protected 判据钩子(capacityBreach/upgradeCleared)覆写
 *  p95 扫拍+无余量升两点——v4 的"单帧立即降"与 p95 扫拍在尖峰会话同向(都逐出
 *  整拍),flap 判别面不受影响;状态机其余逐行同构=公平 A/B。 */
class OldV4Beat extends FrameBeat {
  override capacityBreach(): boolean {
    return this.costP95() > this.budget();           // v4 降拍:p95 扫拍(含单帧立即降的迁移动能)
  }
  override upgradeCleared(): boolean {
    return this.costP50() < this.budget(this.k - 1); // v4 升拍:无余量
  }
}

/** 修前(v5=降档线 budget(k))FrameBeat 复刻:v6 红判别器旧侧——与现行码的语义差
 *  【仅降档线一处参数】,其余状态机逐行同构(继承现行类+覆写 capacityBreach=旧线):
 *  中位刚超当前拍预算即降,把帧耗落在两档预算之间的会话逐出高档(用户实报"锁 60/40")。 */
class OldV5Breach extends FrameBeat {
  override capacityBreach(): boolean {
    return this.costP50() > this.budget();           // v5 降档线:中位刚超当前拍预算即降
  }
}

/** 修前(v7 案①=失拍判据无对齐豁免)复刻:红判别器旧侧——帧距超 (k+MISS_SLACK)×vsync
 *  即判失拍,把 vsync 锁相交付下的物理 n-vsync 对齐节奏(如 k=1+帧耗 9-15 的 2-vsync
 *  网格)误判为容量失稳 → miss-streak 降拍(而 k=1/k=2 realized 同值=纯噪声降档)。 */
class OldAlignedMissBeat extends FrameBeat {
  override isCapacityMiss(gap: number, vsync: number): boolean {
    return gap > (this.k + MISS_SLACK) * vsync;      // 旧判据语义:无对齐豁免
  }
}

/** 稳态帧耗形态(边界①:预算边缘震荡)——75%@8ms/25%@12ms:p50=8<8.33 预算(升拍
 *  判据面),p95=12(降拍判据面,>预算 8.3→k=1 下 p95② 立即拉回)。任务处方
 *  "稳态帧耗 8-12ms"的可满足形态(字面 p50 9>8.33=render-bound,归边界③,另测) */
const costEdge = (lcg: ReturnType<typeof lcgOf>) => () => (lcg() < 0.75 ? 8 : 12);

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

/** 帧距序列指标:p50/均值/标准差/跳变次数(|相邻帧距差|>jumpMs);mean 供 realized
 *  fps(1000/mean)判读——v6 帧率优先判别面用 */
function gapStats(rendered: number[], jumpMs = 4) {
  const gaps: number[] = [];
  for (let i = 1; i < rendered.length; i++) gaps.push(rendered[i] - rendered[i - 1]);
  const s = [...gaps].sort((a, b) => a - b);
  const p50 = s[Math.floor(s.length / 2)] ?? 0;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
  let jumps = 0;
  for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > jumpMs) jumps++;
  return { p50, std, jumps, gaps, mean };
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

describe('容量降拍(v6 帧率优先制:p50 超过下一更低档预算×1.1 才降;单帧超支由 beat 对齐顺延吸收)', () => {
  it('★v6 红→绿(60Hz 带内会话):恒 20ms∈(16.7,36.7) 两档预算之间——v5 线降 k=2 钉 30fps(红);v6 留 k=1 跑 50fps 不齐但高(绿:50>30,帧率优先)', () => {
    // 60Hz 恒 20ms:k=1 realized=1000/20=50; k=2 对齐=30。两路同值带内→选高(头注 v6)。
    // v6 线=budget(2)×1.1=36.7ms:20<36.7 不降(估计回声 est→20 后线 44,更不降);
    // v5 线=budget(1)=est:20>16.7 即降 k=2。
    const rn = runBeat({ vsync: HZ60, cap: 0, cost: 20, callbacks: 600 });
    const ro = runBeat({ vsync: HZ60, cap: 0, cost: 20, callbacks: 600, make: () => new OldV5Breach() });
    // 绿(v6):k=1,帧距=帧耗 20ms(不齐但高)
    expect(rn.beat.k).toBe(1);
    const stN = gapStats(rn.rendered.slice(120));
    expect(stN.p50).toBeGreaterThan(19);
    expect(stN.p50).toBeLessThan(21);
    expect(1000 / stN.mean).toBeGreaterThan(45);          // realized ≈50fps
    // 红(v5 线):降 k=2 对齐,帧距稳 33.3=30fps
    expect(ro.beat.k).toBe(2);
    expect(ro.beat.lastReason).toBe('capacity');
    const stO = gapStats(ro.rendered.slice(120));
    expect(stO.p50).toBeGreaterThan(2 * HZ60 - 2);
    expect(stO.p50).toBeLessThan(2 * HZ60 + 2);
    expect(1000 / stN.mean).toBeGreaterThan(1000 / stO.mean);  // 绿帧率 > 红
  });

  it('★v5 教义:单帧尖峰不降档(beat 对齐下顺延一个 vsync=无感;尖峰后 k 不变,下一帧距=尖峰顺延,随后回稳)', () => {
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    const rendered: number[] = [];
    let spiked = false;
    for (let i = 0; i < 400; i++) {
      while (grid <= prevT) grid += HZ60;
      const t = Math.max(grid, busy);
      prevT = t;
      beat.observeVsync(t, 0);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        rendered.push(t);
        const c = i === 200 ? 20 : 5;           // 稳态 5ms,单帧注入 20ms>预算 16.7
        if (i === 200) spiked = true;
        busy = t + c;
        beat.endRender(t + c);
      }
    }
    expect(spiked).toBe(true);
    expect(beat.k).toBe(1);                      // 单帧尖峰:拍不变(v4 在此立即降=flap 引擎)
    expect(beat.lastReason).not.toBe('capacity');
    const gaps = rendered.slice(1).map((r, i) => r - rendered[i]);
    const spikeGap = Math.max(...gaps);
    expect(spikeGap).toBeGreaterThan(16.7);      // 尖峰帧顺延(下一回调让路)
    expect(spikeGap).toBeLessThan(2 * HZ60 + 8); // 顺延一拍即回,无连锁空档
  });

  it('★v6 正确降档保留(回调锁定=诚实估计口径):帧耗 p50=20ms → 降 k=2 capacity(20>线 budget(2)×1.1=18.3)且不深降(20<27.5);p50=25 同落 k=2(两路 realized 同值,选高);v5 旧线多降一级落 k=3', () => {
    // 回调锁定驱动:回调恒落严格 120Hz 网格,vsync 估计恒诚实 8.33——判据算术面纯
    // (busy 耦合恒重载流的回声会豁免降档线,见文件头注)。
    // v6 线@k=1:2×8.33×1.1=18.3;p50 20>18.3 → k=2;@k=2:3×8.33×1.1=27.5,20<27.5 停。
    // v5 旧线@k=2:budget(2)=16.7,20>16.7 → k=3;@k=3:25>20 停 → 一档差。
    const drive = (cost: number, make: () => FrameBeat) => {
      const beat = make();
      for (let i = 0; i < 300; i++) {
        const t = i * HZ120;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          beat.endRender(t + cost);
        }
      }
      return beat;
    };
    const neo20 = drive(20, () => new FrameBeat());
    expect(neo20.k).toBe(2);
    expect(neo20.lastReason).toBe('capacity');
    const old20 = drive(20, () => new OldV5Breach());
    expect(old20.k).toBe(3);                       // 旧线:中位刚超当前拍预算,多降一级
    const neo25 = drive(25, () => new FrameBeat());
    expect(neo25.k).toBe(2);                       // 25<27.5:两路同值带内,选高(头注 v6 边界)
  });

  it('★v6 红→绿(用户实报场景,帧耗 9-15ms 震荡 p50≈9/均值 10.8):v5 线降 k=2 钉 60 档且升拍余量拦死(红);v6 留 k=1 跑 ~93fps 不齐但高、零迁移(绿)', () => {
    // 用户场景帧耗形态:60%@9 / 20%@12 / 20%@15(震荡带宽 9-15,全部落在 v5 预算 8.33
    // 与 v6 线 18.3 之间)。busy 耦合驱动(真实回调物理:帧耗>vsync 时回调解堵即跑):
    // 帧距=前帧帧耗(不齐),realized=1000/均值≈93。
    const seed = 53;
    const costUserBand = (r: ReturnType<typeof lcgOf>) => () => (r() < 0.6 ? 9 : (r() < 0.5 ? 12 : 15));
    const ksO: number[] = [];
    const ro = runBeat({ vsync: HZ120, cap: 120, cost: costUserBand(lcgOf(seed)), callbacks: 2400, seed, jitter: 0.1, make: () => new OldV5Breach(), onRender: (b) => ksO.push(b.k) });
    // 红(v5 线):p50 9>预算 8.33 → k=2 对齐 60 档;升拍线 budget(1)×0.9=7.5 拦死(p50 9>7.5)→ 钉死(用户实报"锁 60/40")
    expect(ro.beat.k).toBe(2);
    expect(upgradesAfterK2(ksO)).toBe(0);
    const stO = gapStats(ro.rendered.slice(200));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);          // 帧距 ≈16.7 = 60fps 对齐档
    // 绿(v6 线):p50 9 < budget(2)×1.1=18.3 → 留 k=1;realized ≈93fps ∈ ~90-110
    const ksN: number[] = [];
    const rn = runBeat({ vsync: HZ120, cap: 120, cost: costUserBand(lcgOf(seed)), callbacks: 2400, seed, jitter: 0.1, onRender: (b) => ksN.push(b.k) });
    expect(rn.beat.k).toBe(1);
    expect(ksN.slice(1).filter((k, i) => k !== ksN[i]).length).toBe(0);   // 零迁移
    const stN = gapStats(rn.rendered.slice(200));
    expect(stN.p50).toBeLessThan(12);                      // 帧距中位≈帧耗(不齐)
    expect(1000 / stN.mean).toBeGreaterThan(85);           // realized 高于 60 档(帧率优先)
    expect(1000 / stN.mean).toBeLessThan(115);
    expect(Math.max(...stN.gaps)).toBeLessThan(2 * GRID_MS);   // 无整拍空档
    expect(1000 / stN.mean).toBeGreaterThan(1000 / stO.mean);  // 绿帧率 > 红
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
  it('★v6 逐级扫拍保留(回调锁定诚实估计):恒 40ms render-bound → k 1→2→3→4 逐级 capacity(线 18.3/27.5/36.7/45.8,40 越前三线 ≤第四线),轻载后清窗+保持逐级升回 k=1(拍随容量,可逆)', () => {
    // 回调锁定驱动(t=i×vsync,与渲染 busy 解耦,est 恒诚实 8.33)——纯判据算术面:
    // p50 40:budget(2)×1.1=18.3 <40 → k2;budget(3)×1.1=27.5 <40 → k3;
    // budget(4)×1.1=36.7 <40 → k4;budget(5)×1.1=45.8 >40 停 =逐级不跳级。
    const beat = new FrameBeat();
    const ks: number[] = [];
    let renders = 0;
    for (let i = 0; i < 3000; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        const c = renders < 400 ? 40 : 4;      // 前 400 帧 40ms 重载,之后轻载
        beat.endRender(t + c);
        renders++;
        ks.push(beat.k);
      }
    }
    const heavy = ks.slice(0, 400);
    expect(heavy[0]).toBe(1);                  // ★v7 案②结算护栏:costWin 未满窗不扫拍(证据门槛),重载首帧不再薄窗即降
    expect(heavy[58]).toBe(1);                 // 护栏期最后 1 帧仍不降(第 59 渲染=窗将满)
    expect(heavy[59]).toBe(4);                 // 第 60 渲染=窗满即一拍扫到容量档(while 逐级:18.3/27.5/36.7 全越,45.8 停=不跳级)
    expect(Math.max(...heavy)).toBe(4);        // est 收敛后 scan 续扫:1→4(40<45.8 停)=逐级扫拍保留
    expect(Math.min(...heavy)).toBeGreaterThanOrEqual(1);   // 护栏期 k=1(重载段降后恒 ≥2)
    const light = ks.slice(400);
    expect(light).toContain(3);
    expect(light).toContain(2);                // 轻载后清窗+保持逐级回 4→3→2→1(每级驻留)
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('upgrade');
  });

  it('★cap120@120Hz:重载(p50 22>v6 线 18.3)降 k=2,轻载后清窗+保持升回 k=1(拍随容量,不钉死)', () => {
    // ★回调锁定驱动(busy 解耦,est 恒诚实):busy 耦合下 est→帧耗回声使 budget(k+1) 线
    // 被豁免(文件头注),升/降拍判据算术面须估计诚实的流。v6 线@k=1=18.3:重载 22ms
    // (est 收敛后 p50 22>18.3)压 k=2;@k=2 线 27.5 容纳不深降;轻载 3ms 清窗+保持升回。
    const beat = new FrameBeat();
    let renders = 0, sawK2 = false, upAfter = false;
    for (let i = 0; i < 3000; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        const c = renders < 400 ? 22 : 3;      // 前 400 帧重载(>线 18.3),之后轻载
        beat.endRender(t + c);
        renders++;
        if (beat.k === 2) sawK2 = true;
        if (sawK2 && beat.k === 1 && renders > 400) upAfter = true;
      }
    }
    expect(sawK2).toBe(true);
    expect(upAfter).toBe(true);                // 降了能升回(不钉死)
    expect(beat.k).toBe(1);
    expect(beat.lastReason).toBe('upgrade');
  });

  it('重载压 k=2 → 轻载升回 k=1;升后【单帧】尖峰不降档(v5 教义:顺延吸收,拍位不动)', () => {
    // 场景(60Hz 屏):42ms 重载(>v6 线 budget(2)×1.1=36.7;★v5 时代 22ms 在 v6 线下
    // 已属带内会话不再降档)窗熟后 p50 越线 → 压到 k=2;轻载后清窗+保持升回 k=1;
    // 升后注入单帧 20ms>预算 → 不降档(单帧尖峰≠降档理由)。
    // ★回调锁定驱动(诚实估计口径,v6 判据算术面同款):busy 耦合恒重载流的"估计即
    // 节奏"回声会豁免降档线(文件头注),旧版此用例靠薄窗+默认估计 accident 达成压拍
    // ——v7 案②护栏废除薄窗扫描后,判据面统一走回调锁定口径。
    const beat = new FrameBeat();
    let phase: 'heavy' | 'light' | 'spike' | 'hold' = 'heavy';
    let sawUpgrade = false;
    let spikeHeld = -1;
    for (let i = 0; i < 900; i++) {
      const t = i * HZ60;
      beat.observeVsync(t, 0);
      if (phase === 'heavy' && beat.k === 2 && i > 30) phase = 'light';   // 已压满,转轻载
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        let c = 5;
        if (phase === 'heavy') c = 42;
        else if (phase === 'light' && beat.k === 1 && beat.lastReason === 'upgrade') {
          phase = 'spike'; sawUpgrade = true;
        }
        if (phase === 'spike') { c = 20; phase = 'hold'; }                 // 单帧尖峰
        else if (phase === 'hold') {
          c = 5;
          if (spikeHeld < 0 && beat.k === 1) spikeHeld = i;                // 尖峰后驻留 k=1
        }
        beat.endRender(t + c);
      }
    }
    expect(sawUpgrade).toBe(true);             // 重载压 2 → 轻载升 1
    expect(spikeHeld).toBeGreaterThan(0);      // 尖峰后驻留 k=1(单帧不逐出)
    expect(beat.k).toBe(1);                    // 全程无降档回摆(尖峰被顺延吸收)
  });
});

describe('★v5/v6 判据自洽(升拍余量+降档帧率优先线;判据史/失效形态见 FrameBeat.ts 头注)', () => {
  it('★红→绿:边界震荡画像(p50 8/p95 12,帧耗 75%@8/25%@12)——v4 判据组(无余量升+尖峰降)1↔2 flap(红);v5 稳定驻留一档(绿)', () => {
    const seed = 46;
    const cost = costEdge(lcgOf(seed));
    // 红(v4 复刻 OldV4Beat):升拍判据 p50 8<8.33 成立的同时 p95 12>预算降拍也成立
    // → k 1↔2 flap 循环 ≈60 渲染帧/圈(2400 帧 ≥4 圈)
    const ksO: number[] = [];
    const ro = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: 2400, seed, jitter: 0.1, make: () => new OldV4Beat(), onRender: (b) => ksO.push(b.k) });
    const flipsO = ksO.slice(1).filter((k, i) => k !== ksO[i]).length;
    expect(flipsO).toBeGreaterThanOrEqual(4);          // flap=红(v4 失效形态实锤)
    // 绿(v5):升拍余量拦住 p50 8(>0.9×8.33=7.5)→ 不升;中位 8<预算 → 不降;
    // 失拍阈值随估计回声(≈10.2)放大,16.67 顺延帧不记失拍 → 零迁移稳驻 k=1,
    // 帧距全落 vsync 网格(8.3/16.7 对齐顺延,≈100fps)——驻留+对齐=绿(无 80-90 漂移)
    const ksN: number[] = [];
    const rn = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: 2400, seed, jitter: 0.1, onRender: (b) => ksN.push(b.k) });
    const flipsN = ksN.slice(1).filter((k, i) => k !== ksN[i]).length;
    expect(flipsN).toBe(0);                            // 零迁移=绿(驻留)
    expect(rn.beat.k).toBe(1);
    const stN = gapStats(rn.rendered.slice(200));      // 去迁移段,取稳态
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);  // 无整拍空档(对齐)
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.5 * HZ120); // 无解堵即画聚帧
  });

  it('★稳态 120(顶格可达):重载 22ms 段不再压拍(v6 帧率优先——22 落两档预算之间),轻载 6ms 稳定驻留 k=1 零跳变且全程零 capacity 降档', () => {
    // 前 1s 重载 22ms 恒:v6 线 18.3 下 p50 22 越线,但 busy 耦合回声(est→帧耗)豁免
    // 降档线(文件头注)=k=1 骑回声恒帧距(1000/22≈45fps>k=2 回声态实际更差),帧率优先
    // 不压拍;之后 6ms 稳态——est 收敛 8.33,稳定驻留 k=1(est 抖动穿越地板的 floor/
    // upgrade 微迁移自愈,reason 最多为 floor/upgrade,绝不 capacity)
    const { beat, rendered } = runBeat({
      vsync: HZ120, cap: 120, callbacks: 2400, jitter: 0.1,
      cost: (_i, t) => (t < 1000 ? 22 : 6),
    });
    expect(beat.k).toBe(1);
    expect(beat.lastReason).not.toBe('capacity');
    const st = gapStats(rendered.slice(rendered.length - 600));   // 稳态段
    expect(st.jumps).toBe(0);
    expect(st.p50).toBeGreaterThan(HZ120 - 1);
    expect(st.p50).toBeLessThan(HZ120 + 1);
  });

  it('★边界③(v6 重划:render-bound=p50 超 v6 线 18.3;原 p50 9 带内会话归帧率优先绿,见主判别器):回调锁定 70%@20/30%@4(p50 20)→ 降 k=2 capacity 且余量恒不升', () => {
    // 回调锁定(诚实估计):v6 线@k=1=18.3,p50 20>18.3 → k=2;@k=2 线 27.5 容纳不深降;
    // 升拍线 budget(1)×0.9=7.5:20>7.5 恒不升 =render-bound 驻低档(语义保留,边界右移)
    const beat = new FrameBeat();
    const ks: number[] = [];
    const rng = lcgOf(49);
    for (let i = 0; i < 2400; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        beat.endRender(t + (rng() < 0.7 ? 20 : 4));
        ks.push(beat.k);
      }
    }
    expect(upgradesAfterK2(ks)).toBe(0);               // 恒不升
    expect(beat.k).toBe(2);
    expect(beat.lastReason).toBe('capacity');
  });

  it('防抖标定:重载段压 k=2 后,轻载 60 渲染帧(2 半窗)即升——余量不拖慢真轻载的升拍', () => {
    // ★回调流与渲染 busy 解耦(回调恒落严格 120Hz 网格,vsync 估计恒诚实 8.33)——
    //  只标定判据/防抖时长本身;busy 耦合下 cost-4 帧会让回调快于 vsync,估计吃进
    //  帧距塌缩,标定面失真。★v6:重载须越过新降档线 18.3 → 22ms
    const beat = new FrameBeat();
    let renders = 0, upAt = -1, sawK2 = false;
    for (let i = 0; i < 900; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        const c = renders < 200 ? 22 : 4;  // 前 200 帧 22ms 恒:p50 22>v6 线 18.3 → 降 k=2;之后 4ms 稳态
        beat.endRender(t + c);
        renders++;
        if (beat.k === 2) sawK2 = true;
        if (sawK2 && beat.k === 1 && upAt < 0) upAt = renders;
      }
    }
    expect(sawK2).toBe(true);
    expect(upAt).toBeGreaterThan(0);
    expect(upAt).toBeLessThanOrEqual(200 + UPGRADE_WIN_SAMPLES * UPGRADE_HOLD_WINDOWS + 70); // 轻载起 60 连续满足帧+成本窗滚出 22ms 段(60)
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

  it('★v7 案①对齐顺延豁免(红→绿):k=1 诚实估计下连续 2 次 2-vsync 对齐帧距(锁相物理节奏)——旧判据 miss-streak 误降(红);新判据零降拍(绿)', () => {
    // 场景(用户实报族):120Hz 锁相+k=1+帧耗 9-15 → 帧距恒落 2-vsync 网格(16.7),
    // realized k=1 与 k=2 同为 60——降拍=纯噪声。旧判据 gap>(1.7)×est 即失拍,连续
    // 2 次=容量不足误降;新判据恰滑一拍落回网格(n=k+1)=对齐顺延不计。
    // 驱动:回调锁定网格,每 30 回调滑相一拍(两个连续 16.7 帧距,其后回 8.3)——
    // 高模占比 2/30<截尾 10%,估计恒诚实 8.33。
    const drive = (make: () => FrameBeat) => {
      const beat = make();
      let slip = 0;
      let rendered = 0;
      let kMax = 1;
      let sawMissStreak = false;
      for (let i = 0; i < 600; i++) {
        if (i % 30 === 13 || i % 30 === 14) slip += HZ120;   // 相位永久滑一拍=两个连续 16.7 帧距
        const t = i * HZ120 + slip;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          beat.endRender(t + 4);
          rendered++;
          kMax = Math.max(kMax, beat.k);
          if (beat.lastReason === 'miss-streak') sawMissStreak = true;
        }
      }
      return { beat, rendered, kMax, sawMissStreak, vsync: beat.vsyncPeriod };
    };
    const red = drive(() => new OldAlignedMissBeat());
    expect(red.vsync).toBeLessThan(9);             // 估计诚实(高模被截尾,无回声豁免)
    expect(red.sawMissStreak).toBe(true);          // 红:对齐节奏被判失拍降档
    expect(red.kMax).toBeGreaterThanOrEqual(2);
    const neo = drive(() => new FrameBeat());
    expect(neo.vsync).toBeLessThan(9);
    expect(neo.kMax).toBe(1);                      // 绿:对齐顺延豁免,零降拍
    expect(neo.sawMissStreak).toBe(false);
    expect(neo.rendered).toBe(600);                // 每回调皆渲(k=1 全速)
  });

  it('★v7 案①对齐豁免不庇护深滑:stall 帧距落 n=k+2 倍点照旧计失拍(连续失拍看门狗不失明)', () => {
    // 30ms stall 在网格走查驱动器下帧距恰量化到 4×8.33(k=2 时 n=k+2)——全倍点豁免
    // 会把连续失拍看门狗打瞎;单拍豁免(n=k+1)下仍两次连续失拍 → miss-streak 降拍。
    const beat = new FrameBeat();
    let grid = 0;
    let busy = 0;
    let prevT = -1;
    let stallRenders = 0;
    for (let i = 0; i < 220; i++) {
      while (grid <= prevT) grid += HZ120;
      let t = Math.max(grid, busy);
      if (i >= 100 && i < 103) t += 30;
      prevT = t;
      beat.observeVsync(t, 60);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        busy = t + 5;
        beat.endRender(t + 5);
        if (i >= 100) stallRenders++;
      }
    }
    expect(beat.k).toBe(3);
    expect(beat.lastReason).toBe('miss-streak');
  });
});

describe('★v7 案②入场结算护栏(降拍判据须 costWin 全窗证据;构造/resetSampling 各挂满)', () => {
  it('★红→绿:入世界首簇重帧(6×150ms 突发)——旧判据薄窗一拍扫到深档(红,实测入场景);新判据护栏期内零降拍,窗熟后轻载恒 k=1(绿)', () => {
    // 实测锚(探针 _framebeat-entry-cascade2,ProMotion 有头):入世界首簇 ~150ms/帧
    // 在旧码以 2-6 样本薄窗驱动 while 扫拍直达 k=6,滞回梯 60 渲染帧/级 ≈11s 才回
    // k=1=入场后 10s+ 的 16-60fps。护栏语义:判据动作前窗必须满——证据门槛,非新判据。
    const drive = (make: () => FrameBeat) => {
      const beat = make();
      const ks: number[] = [];
      let renders = 0;
      for (let i = 0; i < 600; i++) {
        const t = i * HZ120;
        beat.observeVsync(t, 120);
        if (beat.shouldRender(t)) {
          beat.beginRender(t);
          beat.endRender(t + (renders < 6 ? 150 : 4));
          renders++;
          ks.push(beat.k);
        }
      }
      return { beat, ks };
    };
    const red = drive(() => new OldV5Breach());    // 旧侧复刻:覆写判据=无护栏语义
    expect(Math.max(...red.ks)).toBeGreaterThanOrEqual(5);   // 红:突发薄窗即深扫
    const neo = drive(() => new FrameBeat());
    expect(Math.max(...neo.ks)).toBe(1);           // 绿:护栏期内零降拍
    expect(neo.beat.k).toBe(1);
    expect(neo.beat.lastReason).not.toBe('capacity');
  });

  it('★resetSampling 重挂护栏(进世界路径;读档/模式切换经同一路径受益)+窗熟后真重载照常降', () => {
    // resetSampling 后 60 渲染帧内:即使注入恒超预算成本也不降拍(窗未熟);
    // 窗熟(v7 护栏释放)后 p50 20>v6 线 18.3 照常 capacity 降 k=2(判据本体不动)。
    const beat = new FrameBeat();
    let renders = 0;
    let resetAt = -1;
    let downAt = -1;
    for (let i = 0; i < 400; i++) {
      const t = i * HZ120;
      beat.observeVsync(t, 120);
      if (i === 100) { beat.resetSampling(); resetAt = renders; }   // 进世界路径:清窗+重挂护栏
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        beat.endRender(t + 20);                    // 恒 20ms 超预算
        renders++;
        if (resetAt >= 0 && beat.k === 2 && downAt < 0) downAt = renders;
      }
    }
    expect(beat.k).toBe(2);
    expect(beat.lastReason).toBe('capacity');
    expect(downAt).toBeGreaterThanOrEqual(resetAt + 60); // reset 后满窗(60 渲染帧)才动作
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

  it('120Hz cap0:修前 SuppressDraw 相位游走,修后零迁移+帧距不慢于旧+全程对齐(v5:4/12 混合下 p50 制驻 k=1,12ms 帧对齐顺延)', () => {
    const seed = 43;
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const old_ = runOld({ vsync: HZ120, cap: 0, cost: costFn(lcgOf(seed)), callbacks: N, seed, jitter });
    const stN = gapStats(neo.rendered.slice(TRIM));
    const stO = gapStats(old_.rendered.slice(TRIM));
    const flipsN = ksN.slice(1).filter((k, i) => k !== ksN[i]).length;
    expect(flipsN).toBe(0);                                                // 档位零迁移(不 flap)
    expect(stN.p50).toBeLessThanOrEqual(stO.p50 + 2);                      // 修后帧距不慢于旧(容量只多渲不少渲)
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);             // 无 33ms 整拍空档
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.45 * HZ120);           // 无解堵聚帧(解堵→回网格顺延帧距≈4.1 合法)
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

  it('★cap120@120Hz 重场景(帧耗抖动 4/12ms;★v5):零迁移驻 k=1,12ms 帧=对齐顺延(无 flap;fps 不慢于旧网格地板),旧网格地板码恒钉 k=2 零升拍(硬地板)', () => {
    const seed = 46;
    const cost = costFn(lcgOf(seed));
    const ksN: number[] = [];
    const neo = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, onRender: (b) => ksN.push(b.k) });
    const ksO: number[] = [];
    const old_ = runBeat({ vsync: HZ120, cap: 120, cost, callbacks: N, seed, jitter, make: () => new OldGridFloorBeat(), onRender: (b) => ksO.push(b.k) });
    // 新码(v5):p50 4<预算 → 中位不超支;估计回声(≈10)下 16.7 顺延帧不记失拍
    // → 零迁移驻 k=1;12ms 帧顺延一个 vsync=对齐节拍(教义:丢一拍无感),帧距全网格
    const flipsN = ksN.slice(1).filter((k, i) => k !== ksN[i]).length;
    expect(flipsN).toBe(0);                            // 零迁移(不 flap)
    expect(neo.beat.k).toBe(1);
    const stN = gapStats(neo.rendered.slice(TRIM));
    expect(stN.p50).toBeGreaterThan(HZ120 - 1);        // 帧距 p50≈8.3(全速对齐,优于旧 60)
    expect(stN.p50).toBeLessThan(GRID_MS + 2);
    expect(Math.max(...stN.gaps)).toBeLessThan(1.5 * GRID_MS);   // 无整拍空档(<25ms)
    expect(Math.min(...stN.gaps)).toBeGreaterThan(0.45 * HZ120); // 无解堵聚帧(解堵→回网格顺延帧距≈4.1 合法)
    // 旧码:网格地板钉死 k=2,升拍通路不存在(轻载对照见上例:旧恒 60,新全速)
    expect(old_.beat.k).toBe(2);
    expect(upgradesAfterK2(ksO)).toBe(0);
    const stO = gapStats(old_.rendered.slice(TRIM));
    expect(stO.p50).toBeGreaterThan(GRID_MS - 2);      // 旧 p50≈16.7=恒 60
    expect(stN.p50).toBeLessThan(stO.p50);             // 修后帧距更短(fps 更高)
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

describe('★真实 trace 回放(Trace-20260929T164816 @localhost:4173,主线程 rAF 序列实拍;饱和回声流)', () => {
  // ★数据来源:DevTools trace 原始 FireAnimationFrame X 事件,主线程(82014:18783261),
  //   逐回调归组(≤3ms 同拍合并;每拍 4 链=游戏 loop+3 条小链,取组内最大 dur=游戏帧耗)。
  //   切片 t∈[4.0,11.2]s 稳态段 630 拍(工具链:/tmp/kflap-scan.mjs 口径;定谳报告 2026-09-29)。
  //   该会话实况=frameSkipMode 'off'+frameCap 0( leveldb 实证)→ 节拍引擎不在渲染路径;
  //   rAF 迟交:delta≈前帧 cost+1.9ms(corr=0.952)→ 回调流带工作周期回声,vsync 估计
  //   被污染(≈11.3ms 而非真网格)。本测试把这条【真实流】喂给状态机做红蓝 A/B:
  //   红(v4 判据组)=估计回声下 p95 扫拍与无余量升拍打架 → k 1↔2 flap(修前实锤);
  //   绿(v5)=p50 判据自洽 → 零迁移稳驻 k=1(回声预算容得下;更深稳定须估计器去回声,
  //   已立案为结构债,见 FrameBeat.ts 头注)。
const DELTAS_X10 = [124,122,104,123,160,135,114,95,119,96,155,124,126,116,95,115,97,128,129,133,95,147,120,125,93,165,122,131,96,121,122,106,120,118,117,93,117,97,143,129,131,134,97,132,125,100,145,131,134,94,130,122,135,96,143,117,100,128,122,125,90,130,139,124,96,115,143,95,122,152,129,120,115,120,95,123,122,124,116,123,140,123,98,121,116,93,120,115,158,114,116,94,128,126,121,108,121,114,93,119,126,94,117,116,91,142,116,116,93,159,116,91,118,116,94,113,145,97,128,117,95,125,111,129,125,119,92,120,119,121,95,136,109,121,94,119,126,91,128,127,120,122,127,125,90,119,121,95,114,113,91,117,89,133,127,95,127,148,139,122,94,124,120,90,122,114,87,140,112,92,125,122,104,116,134,138,94,144,153,122,106,131,117,93,134,153,152,155,157,147,149,149,201,218,119,123,96,118,121,96,118,91,114,93,134,139,115,122,97,120,115,92,129,137,98,122,117,120,97,124,128,98,138,124,92,117,117,98,123,118,106,119,112,96,113,137,126,94,115,123,118,113,117,91,124,121,90,116,100,127,132,125,98,129,118,126,99,162,118,126,88,146,115,97,126,120,89,124,117,128,90,120,118,97,143,115,101,118,145,123,96,122,124,97,161,127,142,118,96,126,118,113,124,122,98,128,123,123,94,141,118,111,126,124,115,118,131,139,139,99,126,128,120,94,121,129,97,124,125,99,138,116,97,114,124,114,121,113,116,101,117,123,96,132,134,123,96,121,128,94,132,140,143,92,126,129,95,123,121,104,132,128,121,99,134,129,124,94,143,123,99,121,158,119,109,116,175,122,103,124,121,101,123,125,122,131,122,117,102,128,128,122,137,118,94,97,119,141,137,124,90,149,122,96,117,127,125,123,90,91,117,118,135,136,92,120,95,119,125,143,137,122,120,122,121,94,128,142,90,119,96,123,122,122,96,169,124,123,120,94,117,120,93,120,120,94,127,127,90,124,127,89,133,139,119,94,166,133,125,96,115,116,91,113,96,119,115,113,93,129,135,85,119,124,95,111,125,88,138,112,85,134,117,90,109,87,132,113,144,87,115,114,86,115,86,135,121,84,111,115,89,130,127,91,104,81,125,87,111,115,84,129,121,108,78,112,130,83,129,115,198,115,114,127,101,126,103,110,80,108,85,110,112,81,103,81,116,113,86,117,81,107,111,111,112,107,81,133,93,112,106,83,105,93,114,106,84,107,93,115,105,80,104,105,102,100,80,108,118,106,109,77,120,102,77,104,81,102,79,105,106,73,107,96,102,103,102,121,75,102,74,98,74,102,98,76,109,75,118,72,99,72,105,75,105,103,100,106,81,132,80,109,78,106,114,77,116,79,104,95,107,103,77,108,84,140,110,109,76,102,88,101,102,81,105,75,104,97,106,108];
const COSTS_X10 = [107,88,107,143,118,98,80,105,83,132,107,110,102,81,101,77,108,110,117,81,133,103,108,79,150,105,116,81,106,107,80,105,104,102,77,103,80,127,108,109,120,82,115,111,84,129,115,121,80,114,108,119,80,130,101,83,112,106,108,76,113,123,108,82,99,127,79,107,132,110,104,101,105,81,108,105,110,102,109,125,109,84,105,100,77,105,77,144,99,102,79,114,110,104,77,105,100,78,103,109,78,100,99,76,129,102,101,79,142,101,78,101,100,80,98,127,81,112,101,76,106,96,93,106,101,77,103,104,107,81,121,96,105,78,99,112,77,112,106,104,107,101,110,77,101,105,80,100,99,74,103,74,117,110,79,99,132,123,107,80,107,101,75,104,100,73,117,96,78,107,107,81,98,119,123,78,126,136,105,90,113,100,78,119,139,136,136,138,129,132,134,125,198,101,109,81,104,103,76,103,77,97,76,117,124,97,107,82,102,98,76,103,119,80,103,98,104,81,108,111,84,124,109,77,99,104,77,104,103,78,104,98,80,99,121,111,81,101,109,99,98,104,77,108,106,77,101,85,108,113,107,81,112,101,110,84,146,101,111,74,131,101,83,109,103,76,111,101,113,78,101,101,83,129,101,79,102,127,106,78,104,108,80,140,108,124,101,81,110,104,97,107,104,80,111,105,106,80,125,104,94,109,110,82,102,115,119,125,81,110,105,105,80,105,113,79,108,109,83,121,102,83,98,107,97,107,99,101,87,103,106,81,118,114,106,81,104,111,80,112,123,128,76,107,113,81,105,106,82,117,109,106,83,118,109,107,78,125,107,82,105,141,104,91,100,107,107,81,106,107,83,105,109,108,99,108,102,81,111,114,108,122,103,79,81,99,122,121,109,75,135,107,79,102,111,110,107,77,77,101,100,105,122,75,103,79,102,109,128,76,108,104,105,104,79,104,127,76,105,77,106,103,107,79,144,109,104,103,78,100,102,78,101,103,77,103,113,74,107,112,73,113,123,101,76,149,111,108,81,100,100,75,99,78,103,100,94,76,110,120,71,100,109,76,96,109,73,122,97,72,102,101,75,94,74,115,97,126,73,99,98,71,100,71,120,106,70,96,99,73,114,113,73,91,68,111,72,95,99,69,114,103,93,65,97,111,69,113,101,183,95,99,111,86,112,84,95,65,93,69,90,93,64,88,66,93,98,68,100,65,91,93,95,97,91,62,118,66,96,91,68,90,68,95,91,70,92,67,99,88,62,88,87,86,86,63,93,62,86,94,61,104,86,61,87,66,87,64,86,90,58,92,82,86,64,84,105,59,86,59,84,60,82,83,61,88,60,103,58,83,55,87,60,90,84,84,84,56,112,60,91,63,88,96,61,99,62,87,57,89,85,62,93,68,124,91,93,61,87,57,82,85,64,88,59,89,58,90,91,61];

  function replayStream(make: () => FrameBeat) {
    const beat = make();
    let t = 0;
    let rendered = 0;
    const ks: number[] = [];
    for (let i = 0; i < DELTAS_X10.length; i++) {
      t += DELTAS_X10[i] / 10;
      beat.observeVsync(t, 120);
      if (beat.shouldRender(t)) {
        beat.beginRender(t);
        beat.endRender(t + COSTS_X10[i] / 10);
        rendered++;
        ks.push(beat.k);
      }
    }
    const flips = ks.slice(1).filter((k, i) => k !== ks[i]).length;
    return { beat, rendered, flips, ks };
  }

  it('红(v4 判据组):回声流上 p95 扫拍↔无余量升拍打架 → k 反复迁移(修前形态实锤)', () => {
    const r = replayStream(() => new OldV4Beat());
    expect(r.flips).toBeGreaterThanOrEqual(6);   // flap=红
  });

  it('绿(v5):p50 判据自洽 → 零迁移稳驻(不再被回声流打出 flap)', () => {
    const r = replayStream(() => new FrameBeat());
    expect(r.flips).toBe(0);                     // 稳驻=绿
    expect(r.beat.k).toBe(1);
    expect(r.rendered).toBeGreaterThan(620);     // 每拍皆渲(回声预算容得下;修前 flap 只渲约半)
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

  it('★v6 降档线源锚(帧率优先,防回改):capacityBreach=budget(k+1)×DOWNGRADE_MARGIN;政策语义在头注(帧耗落两档预算之间时帧率优先>对齐但低,用户明令)', () => {
    expect(BEAT).toContain('this.budget(this.k + 1) * DOWNGRADE_MARGIN');  // 降档线=下一更低档预算×1.1
    expect(BEAT).toContain('DOWNGRADE_MARGIN = 1.1');
    expect(BEAT).toContain('帧率优先');                           // 政策语义在头注
    expect(BEAT).toContain('★v6 降档边界=帧率优先');              // v6 注在头注(结构冻结令仍有效)
  });

  it('常数处方锁(任务给定,防漂移;★v3 p50 制:半窗粒度 30×连续 2 窗=60 渲染帧,轻于旧 2s 墙钟;★v5:升拍余量 0.9;★v6:降档余量 1.1=帧率优先线;★v7:失拍对齐豁免带 0.2/2ms)', () => {
    expect(UPGRADE_WIN_SAMPLES).toBe(30);
    expect(UPGRADE_HOLD_WINDOWS).toBe(2);
    expect(UPGRADE_HEADROOM).toBe(0.9);
    expect(DOWNGRADE_MARGIN).toBe(1.1);
    expect(MISS_SLACK).toBe(0.7);
    expect(MISS_GRID_TOL_REL).toBe(0.2);
    expect(MISS_GRID_TOL_MS).toBe(2);
    expect(GRID_MS).toBeCloseTo(1000 / 60);
  });
});

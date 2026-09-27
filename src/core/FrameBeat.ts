/**
 * ★确定性节拍对齐引擎(2026-09-28 调度面修复刃)——帧模式 subtle 档的渲染调度。
 *
 * vanilla 锚(1457 亲读,勿凭记忆改):
 *  - FrameSkipMode 三态:Main.cs:17129-17137——Off/Subtle=可变步+垂直同步;On=IsFixedTimeStep(60Hz)+垂直同步。
 *  - 累计器门+SuppressDraw:Main.cs:17182-17197——【仅】Off 或 Subtle&&!improvedSubtleFrameSkip
 *    (旧路径)走"累计器未满 1/60 → SuppressDraw+return";其后"落后跳帧"分支 num3=0 恒死代码。
 *  - improvedSubtleFrameSkip(1457 默认 true,Main.cs:67615-67616):EndDraw 忙等钳 60Hz present
 *    网格(Main.cs:62624-62644)——Update 每循环照跑、【无绘制抑制】,整个 Update+Draw+Present
 *    周期被钉在 60Hz 网格上(火焰时钟案已实证"原版绘制周期≡60Hz tick")。
 *
 * 本引擎 = improvedSubtle 语义的 rAF 移植:**帧序计数落拍,非忙等**。rAF 时代 present
 * 由浏览器合成器掌控,只能选 vsync 的整数倍——"每 k 个 vsync 渲一次"(k=拍)且 k 恒定
 * ⇒ 渲染帧距恒定 = 确定性节拍。取代旧被动门(`now-_lastCapTs<1000/cap-1 即跳`:
 * 阈值落在 vsync 整数倍 ±抖动带内 ⇒ 跳 1/2 个 vsync 随机翻转)与旧 SuppressDraw
 * (0 步进帧跳绘:累计器相位随 rAF 抖动随机游走 ⇒ 渲染落点不规律)——两者即用户实报
 * "高于 60fps 仍有卡一下感"的节拍摆动源。
 *
 * 拍选择(状态机全输入显式,内部不读墙钟——事件序列决定论,可单测):
 *  - 目标周期 TARGET = max(1000/60[原版 present 网格], frameCap>0 ? 1000/frameCap : 0):
 *    subtle 恒 ≤60fps(原版网格=节拍地板),frameCap 只是天花板;cap=0 与 cap≥60 行为
 *    一致(网格地板绑定),cap<60 才往下压拍。
 *  - minK = ceil(TARGET/vsync):拍=vsync 整数倍(60Hz 屏 1;90Hz 2;120Hz 2;144Hz 3;240Hz 4)。
 *  - 容量预算 budget(k)=k×vsync(渲染帧成本落在预算内,滑一个 vsync 也保持均匀相位的
 *    一致性;成本贴/超预算=相位随机翻转=摆动)。降拍立即:单帧成本>预算 → k+1;
 *    p95>预算 → 逐级扫到首个能容纳的 k。
 *  - 滞回升拍:k>minK 且 p95<0.8×budget(k−1)【持续 2s】→ k−1(一步);条件破即弃——
 *    降快升慢防档位震荡。
 *  - 失拍吸附:渲染帧距>(k+0.7)×vsync=失拍(渲染节拍滑了 ≥1 个 vsync)。序数计数天然
 *    【不追赶中途】——失拍后下一渲染仍落在下一拍(不插补.render,防连锁迟到);单次失拍
 *    只作余量警示(弃升拍保持),连续 2 次=容量不足 → 降拍。
 */

/** 原版 present 网格(60Hz;improvedSubtle EndDraw 钳值 TARGET_FRAME_TIME×599/600 的整数网格) */
export const GRID_MS = 1000 / 60;
/** 拍上限(vsync 整数倍的最深降级;60Hz 屏即 10fps——成本 p95>100ms 时渲染已死,兜底不再降) */
export const BEAT_K_MAX = 6;
/** 升拍需持续余量的时长(任务处方:2s) */
export const UPGRADE_HOLD_MS = 2000;
/** 升拍余量系数(任务处方:预算×0.8) */
export const UPGRADE_HEADROOM = 0.8;
/** 失拍判定:帧距 >(k+MISS_SLACK)×vsync(0.7=滑过 1 拍尚容 ±0.3 拍 rAF 抖动) */
export const MISS_SLACK = 0.7;
/** vsync 周期样本窗(中位数估计;rAF 回调间隔) */
const VSYNC_WIN = 31;
/** 渲染帧成本样本窗(p95) */
const COST_WIN = 60;
/** vsync 周期钳(防未锁 vsync 的无头/离屏 rAF 与暂停恢复大空洞) */
const VSYNC_MIN_MS = 2;
const VSYNC_MAX_MS = 100;
/** >此间隔的 vsync 样本视为断流(tab 隐藏/调试暂停),清窗不采样 */
const VSYNC_GAP_RESET_MS = 250;
/** shouldRender 的时间护栏余量(vsync 估计失真时的兜底,吸收 rAF 时间戳抖动) */
const TARGET_GUARD_MS = 2;

export type BeatReason = 'init' | 'capacity' | 'overbudget' | 'miss-streak' | 'upgrade' | 'floor' | 'hold';

export class FrameBeat {
  /** 当前拍:每 k 个 vsync 渲染一次(k=1 即每帧) */
  k = 1;
  /** 自上次渲染起累计的 vsync 回调数(帧序计数;渲染后归零) */
  ordinal = 0;
  /** 用户帧率上限(0=不设限;仅作天花板,经 observeVsync 注入——引擎不读 options) */
  private cap = 0;
  /** vsync 周期估计(ms;rAF 回调间隔中位数) */
  vsyncPeriod = GRID_MS;
  /** 最近一次拍变更原因(诊断/探针) */
  lastReason: BeatReason = 'init';

  private vsyncDeltas: number[] = [];
  private lastVsyncTs = -1;
  private costWin: number[] = [];
  private lastRenderAt = -1;
  /** 上次渲染帧距(beginRender 时记;endRender 作失拍判定) */
  private lastGap = 0;
  private holdSince: number | null = null;
  private missStreak = 0;

  /** 目标周期:原版 60Hz 网格地板与 frameCap 天花板取大(subtle 恒≤60fps) */
  targetMs(cap = this.cap): number {
    return Math.max(GRID_MS, cap > 0 ? 1000 / cap : 0);
  }

  /** 拍地板:目标周期折成 vsync 整数倍(ceil−ε:120Hz 的 16.667/8.333=2.0002 须落 2 非 3) */
  minK(vsyncPeriod = this.vsyncPeriod, cap = this.cap): number {
    return Math.max(1, Math.ceil(this.targetMs(cap) / vsyncPeriod - 0.02));
  }

  /** 拍容量预算(渲染帧成本预算=拍周期本身) */
  budget(k = this.k, vsyncPeriod = this.vsyncPeriod): number {
    return k * vsyncPeriod;
  }

  /** 渲染帧成本滚动 p95(空窗=0) */
  costP95(): number {
    if (this.costWin.length === 0) return 0;
    const s = [...this.costWin].sort((a, b) => a - b);
    return s[Math.floor(0.95 * (s.length - 1))];
  }

  /**
   * 每个 rAF 回调必经(先于任何跳帧判定)——喂 vsync 序列估计周期。
   * cap:当前用户帧率上限(0=不设限),变更即时生效。
   */
  observeVsync(now: number, cap: number): void {
    this.cap = cap;
    if (this.lastVsyncTs >= 0) {
      const d = now - this.lastVsyncTs;
      if (d > VSYNC_GAP_RESET_MS) {
        this.vsyncDeltas.length = 0;            // 断流(tab 隐藏恢复):清窗防大空洞污染中位数
      } else {
        this.vsyncDeltas.push(d);
        if (this.vsyncDeltas.length > VSYNC_WIN) this.vsyncDeltas.shift();
        const s = [...this.vsyncDeltas].sort((a, b) => a - b);
        this.vsyncPeriod = Math.min(VSYNC_MAX_MS, Math.max(VSYNC_MIN_MS, s[s.length >> 1]));
      }
    }
    this.lastVsyncTs = now;
    this.ordinal++;
  }

  /** 本回调是否落拍(渲染)。序数计满即拍+时间护栏(vsync 估计失真时兜底) */
  shouldRender(now: number): boolean {
    return this.ordinal >= this.k && now - this.lastRenderAt >= this.targetMs() - TARGET_GUARD_MS;
  }

  /** 渲染开始(shouldRender 为真后调用):重置序数、记帧距锚 */
  beginRender(now: number): void {
    this.lastGap = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.lastRenderAt = now;
    this.ordinal = 0;
  }

  /** 渲染结束:now=渲染帧完成时刻(performance.now,与 rAF 时间戳同源)。跑拍状态机 */
  endRender(now: number): void {
    const cost = this.lastRenderAt >= 0 ? now - this.lastRenderAt : 0;
    this.costWin.push(cost);
    if (this.costWin.length > COST_WIN) this.costWin.shift();
    const vsync = this.vsyncPeriod;
    const floor = this.minK();
    const prevK = this.k;

    // 失拍记账(帧距在 beginRender 记)——序数计数天然吸附下一拍,这里只做容量诊断
    if (this.lastGap > (this.k + MISS_SLACK) * vsync) this.missStreak++;
    else this.missStreak = 0;

    // 降拍①:单帧超预算立即降(任务处方"超预算即降";钳拍上限)
    if (this.k < BEAT_K_MAX && cost > this.budget()) {
      this.k++;
      this.lastReason = 'overbudget';
    }
    // 降拍②:成本 p95 超预算 → 逐级扫到首个能容纳的拍(容量地板)
    while (this.k < BEAT_K_MAX && this.costP95() > this.budget()) {
      this.k++;
      this.lastReason = 'capacity';
    }
    // 拍地板(vsync 重估/cap 收紧可抬高 minK——即时跟上)
    if (this.k < floor) {
      this.k = floor;
      this.lastReason = 'floor';
    }

    if (this.k !== prevK) {
      // 任何拍变更:相位重锚+记账复位(旧拍成本样本对新拍预算失义;不追赶中途)
      this.ordinal = 0;
      this.missStreak = 0;
      this.holdSince = null;
    } else {
      // 滞回升拍(一步):k>地板 且 p95<0.8×budget(k−1) 持续 2s;条件破即弃
      if (this.k > floor && this.costP95() < UPGRADE_HEADROOM * this.budget(this.k - 1)) {
        if (this.holdSince === null) {
          this.holdSince = now;
        } else if (now - this.holdSince >= UPGRADE_HOLD_MS) {
          this.k--;
          this.lastReason = 'upgrade';
          this.ordinal = 0;          // 相位重锚:升拍后不追赶中途
          this.holdSince = now;      // 下一级重新计 2s
          this.missStreak = 0;
        }
      } else {
        this.holdSince = null;
      }
      // 连续失拍=容量不足 → 降拍(单次失拍只在此前的升拍保持里被弃——上面 holdSince 已因
      // missStreak>0 …见下;这里处理"持续失拍但成本贴预算内"的合成器侧压力)
      if (this.missStreak >= 2 && this.k < BEAT_K_MAX) {
        this.k++;
        this.lastReason = 'miss-streak';
        this.ordinal = 0;
        this.missStreak = 0;
        this.holdSince = null;
      }
    }
  }

  /** 诊断快照(探针/调试面板) */
  snapshot(): { k: number; vsync: number; p95: number; target: number; reason: BeatReason; miss: number } {
    return {
      k: this.k,
      vsync: Math.round(this.vsyncPeriod * 100) / 100,
      p95: Math.round(this.costP95() * 100) / 100,
      target: Math.round(this.targetMs() * 100) / 100,
      reason: this.lastReason,
      miss: this.missStreak,
    };
  }
}

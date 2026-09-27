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
/** vsync 周期样本窗(截尾均值估计;rAF 回调间隔) */
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
/** 拍地板容差(相对):minK 折算容许 vsync 估计低于目标 4%(31 样本中位数在 ±10%
 *  rAF 抖动下的 3σ 噪声≈±4%)——容差须【相对】于目标周期:绝对 ε 会被估计噪声击穿
 *  (60Hz 拍 ratio 1.02 处地板 1↔2 翻转=恒久 30fps,首版实测炸点) */
const FLOOR_TOL = 0.04;

export type BeatReason = 'init' | 'capacity' | 'overbudget' | 'miss-streak' | 'upgrade' | 'floor';

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

  /** 拍地板:最小 k 使 k×vsync ≥ (1−容差)×目标周期(整数倍折算+估计噪声容差;
   *  60Hz 屏拍 1;90Hz 2;120Hz 2;144Hz 3;240Hz 4;cap<60 时由 cap 压大) */
  minK(vsyncPeriod = this.vsyncPeriod, cap = this.cap): number {
    return Math.max(1, Math.ceil((this.targetMs(cap) * (1 - FLOOR_TOL)) / vsyncPeriod));
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
    let d: number | undefined;
    if (this.lastVsyncTs >= 0) {
      d = now - this.lastVsyncTs;
      if (d > VSYNC_GAP_RESET_MS) {
        this.vsyncDeltas.length = 0;            // 断流(tab 隐藏恢复):清窗防大空洞污染估计
      } else {
        this.vsyncDeltas.push(d);
        if (this.vsyncDeltas.length > VSYNC_WIN) this.vsyncDeltas.shift();
        // ★截尾均值(非中位数):渲染超支时回调流呈【双峰】(超支时长/剩余节拍交替——
        //  真实 Chrome 形态,busy 解堵即跑 rAF),中位数按窗奇偶在双峰间翻转=估计跳变
        //  (首版实测 60Hz 假失拍级联/地板翻转);截尾均值对双峰恢复真值、对单峰抖动
        //  ≈中位数、对罕见迟回调稳健
        const s = [...this.vsyncDeltas].sort((a, b) => a - b);
        // 截尾数须留 ≥1 样本(小窗 n=1/2 时 ceil(n×0.1) 会吃光窗口→除零/负分母)
        const trim = Math.min(Math.ceil(s.length * 0.1), (s.length - 1) >> 1);
        let sum = 0;
        for (let i = trim; i < s.length - trim; i++) sum += s[i];
        const mean = sum / (s.length - 2 * trim);
        this.vsyncPeriod = Math.min(VSYNC_MAX_MS, Math.max(VSYNC_MIN_MS, mean));
      }
    }
    this.lastVsyncTs = now;
    // 帧序计数=【估计 vsync 数】而非回调数:Chrome 忙合成器会合并回调(一次回调跨
    // 多个网格点),裸回调计数会欠数 → 拍滑一个 vsync(实机 120Hz cap30 实测 13 跳);
    // 按本回调间隔折算 vsync 数对合并鲁棒,对正常流(间隔≈估计值)恒 +1 同构
    if (d === undefined) this.ordinal++;
    else this.ordinal += Math.min(8, Math.max(1, Math.round(d / this.vsyncPeriod)));
  }

  /** 本回调是否落拍(渲染)。序数计满即拍;时间护栏仅在拍周期本身够不到目标时兜底
   *  (vsync 估计失真/未锁 vsync 的退化 rAF)——拍周期已达目标时纯序数落拍,护栏
   *  不参与(否则 rAF 抖动会让护栏自造跳帧=引回摆动) */
  shouldRender(now: number): boolean {
    if (this.ordinal < this.k) return false;
    if (this.k * this.vsyncPeriod >= this.targetMs() - TARGET_GUARD_MS) return true;
    return now - this.lastRenderAt >= this.targetMs() - TARGET_GUARD_MS;
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
      // 单次失拍=余量警示:升拍保持即弃(拍可信度存疑,重计 2s)
      if (this.missStreak > 0) this.holdSince = null;
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
      // 连续失拍=容量不足 → 降拍(单次失拍只弃升拍保持,不降档;连续 2 次=拍持续
      // 滑动——覆盖"成本贴预算内但合成器侧持续掉拍"的口径)
      if (this.missStreak >= 2 && this.k < BEAT_K_MAX) {
        this.k++;
        this.lastReason = 'miss-streak';
        this.ordinal = 0;
        this.missStreak = 0;
        this.holdSince = null;
      }
    }
  }

  /**
   * 采样面复位(拍 k 归地板,清成本/失拍/升拍保持/相位记账;vsync 估计保留——
   * 它由 observeVsync 连续维护,与负载无关)。
   * 调用点=进世界(afterWorldLoad)——世界生成/读档期的重载帧成本与随之的降拍
   * 均为过期证据,不得带进图后(实测污染面:生成页把 k 压到 5-6,进图后逐级爬回
   * 耗时数十秒=整段 30-100ms 节拍;模式切换经同一路径受益)
   */
  resetSampling(): void {
    this.costWin.length = 0;
    this.missStreak = 0;
    this.holdSince = null;
    this.lastGap = 0;
    this.lastRenderAt = -1;
    this.ordinal = 0;
    this.k = Math.max(1, this.minK());
    this.lastReason = 'init';
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

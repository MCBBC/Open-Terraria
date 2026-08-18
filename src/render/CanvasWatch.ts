// canvas 分配哨兵(2026-08-18):泄漏/不合理分配的常驻早期警告。
//
// 背景:cloudTint 曾以 ~340 张/秒 createElement('canvas') 潜伏数周无人察觉——
// 泄漏大扫除只看【活集】(被池化上限"界定"住了),没人量过【出生率】。
// 本模块:
//   · patch document.createElement 计数 canvas 出生(一次字符串比较,零热路径成本);
//   · 每 5s 一窗,窗口均值 > WARN_PER_SEC 持续 ≥ HOT_WINDOWS 窗 → console.warn 一条
//     含出生栈样例的详细警告(进 __swWarns 警告环 = F5 可见),每"事件"只报一次
//     (60s 冷却),持续异常每分钟最多提醒一次防刷屏;
//   · 单窗尖峰 > SPIKE_PER_SEC 立即报警;
//   · canvasWatchStats() 供 F5/renderLog:总出生数 + 最近窗口速率。
// 静默:URL ?cwatch=0。诊断工具:scripts/_canvasborn-probe.mjs(聚栈 TOP)。
//
// 阈值标定(2026-08-18 atlas 化后实测):正常稳态 0-6 张/s(首见帧探测/UI 刷新),
// 探索跑图瞬时 ~10 张/s;cloudTint 事故形态 = 340 张/s。20/s 持续 10s = 异常。
export interface CanvasWatchStats {
  births: number;        // 安装以来累计出生
  perSec: number;        // 最近窗口均值
  hot: boolean;          // 当前处于报警事件中
  disabled: boolean;
}

/** 纯速率判定逻辑(与 DOM 解耦,单测友好)。
 *  ★连续窗双档判据(2026-08-18 真机标定两轮返工的结论):
 *  · 短窗速率判据误伤正常探索(跑图首见帧探测单窗 30/s);
 *  · 滚动总量判据误伤进世界洪峰(SpriteAtlas.hardAlpha 一次性单窗 1621 张,
 *    与 cloudTint 事故 1700/窗不可区分);
 *  · 唯一可靠区分度 =【逐窗持续性】:一次性构建 1-2 窗即衰减,事故恒高。
 *  双档:≥300 张/窗(60/s)连 3 窗(15s)→ 急性;≥100 张/窗(20/s)连 6 窗(30s)→ 慢性 */
export class RateWatch {
  private streak300 = 0;
  private streak100 = 0;
  /** -Infinity:冷却门初值——首报不被"从未报警"的 0 点位挡住(测试实抓) */
  private lastWarnAt = -Infinity;
  private lastRate = 0;
  /** @returns warn=应发警告;rate=最近窗速率 */
  window(birthsThisWindow: number, windowSec: number, nowMs: number): { warn: boolean; rate: number } {
    this.lastRate = birthsThisWindow / windowSec;
    this.streak300 = birthsThisWindow >= FAST_WINDOW ? this.streak300 + 1 : 0;
    this.streak100 = birthsThisWindow >= SLOW_WINDOW ? this.streak100 + 1 : 0;
    const trip = this.streak300 >= FAST_STREAK || this.streak100 >= SLOW_STREAK;
    if (trip && nowMs - this.lastWarnAt >= COOLDOWN_MS) {
      this.lastWarnAt = nowMs;
      return { warn: true, rate: this.lastRate };
    }
    return { warn: false, rate: this.lastRate };
  }
  get rate(): number { return this.lastRate; }
  get streaks(): { fast: number; slow: number } { return { fast: this.streak300, slow: this.streak100 }; }
}

const WINDOW_SEC = 5;
/** 急性档:≥300 张/窗(60/s)连续 3 窗——cloudTint 事故形态(1700/窗)3 窗触发 */
const FAST_WINDOW = 300;
const FAST_STREAK = 3;
/** 慢性档:≥100 张/窗(20/s)连续 6 窗(30s)——中速持续泄漏(如 50/s 常驻) */
const SLOW_WINDOW = 100;
const SLOW_STREAK = 6;
const COOLDOWN_MS = 60_000;

let births = 0;
let winBirths = 0;
let winStart = 0;
let lastRate = 0;
let hot = false;
let sampleStack: string | null = null;
let sampledThisWindow = false;
let installed = false;
let disabled = false;
const watch = new RateWatch();

export function canvasWatchStats(): CanvasWatchStats {
  return { births, perSec: lastRate, hot, disabled };
}

/** 调试句柄/测试注入:手动记一次出生(绕过 createElement patch) */
export function noteCanvasBirth(stack?: string): void {
  births++; winBirths++;
  if (!sampledThisWindow) {
    sampledThisWindow = true;
    sampleStack = stack ?? (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim()).join(' | ');
  }
}

export function installCanvasWatch(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  if (new URLSearchParams(location.search).get('cwatch') === '0') { disabled = true; return; }
  const orig = document.createElement.bind(document);
  // 类型断言:createElement 有多重重载,包一层后收窄为统一签名
  document.createElement = ((tag: string, opts?: ElementCreationOptions) => {
    if (tag === 'canvas' || tag === 'CANVAS') noteCanvasBirth();
    return orig(tag as never, opts as never);
  }) as typeof document.createElement;
  winStart = performance.now();
  const WINDOW_MS = WINDOW_SEC * 1000;
  setInterval(() => {
    const now = performance.now();
    const sec = Math.max(0.5, (now - winStart) / 1000);
    const { warn, rate } = watch.window(winBirths, sec, now);
    lastRate = rate;
    winBirths = 0;
    winStart = now;
    sampledThisWindow = false;
    if (warn) {
      hot = true;
      const s = watch.streaks;
      console.warn(`[canvas哨兵] canvas 分配异常:连续窗 streak(≥${FAST_WINDOW}/窗:${s.fast}连 / ≥${SLOW_WINDOW}/窗:${s.slow}连),最近窗 ${Math.round(rate)}/s——疑似泄漏/不合理分配。出生栈样例:${sampleStack ?? '(无)'} | 诊断:node tools/run-diag.mjs scripts/_canvasborn-probe.mjs`);
    } else if (hot && watch.streaks.fast === 0 && watch.streaks.slow === 0) {
      hot = false;
    }
  }, WINDOW_MS);
  // 控制台句柄(与 __swRenderLog 同风格)
  (window as unknown as { __swCanvasWatch?: unknown }).__swCanvasWatch = canvasWatchStats;
}

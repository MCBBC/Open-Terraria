// ★看门狗治理（2026-09-28）——LightWorker/WaveWorker 同治共享语义单源。
//
// ═══════════════ 定谳（Trace-20260928T132330 三遍亲扫 + 源码闭环）═══════════════
// 该 trace 实际只含 93s 捕获窗（859.2s CpuProfiler::StartProfiling 起,环形缓冲逐出
// 此前明细;「16 分钟」是会话时长≠捕获窗）。窗内实锤：
//   · LightWorker/WaveWorker 线程【不存在】——仅有的 2 个 DedicatedWorker =
//     save.worker + worldGen.worker（TracingSessionIdForWorker args 实证;全程闲,
//     2/s×0.03ms 心跳,活到 949.4s 页面拆除）。原 digest「worker 被误杀」读法=误认。
//   · 主线程从窗首桶即本地模式：_step 23.21% + blurLine 8.86% + exportTo 6.43%
//     + surfaceSky 1.54% ≈ 40% 墙钟,30fps（p50 gap 30.72ms）。
//   · 窗内零 terminate（save/worldGen 存活到底）→ 回落态在窗前已成立;窗内主线程
//     max 非审计任务 82.5ms,不存在 2s 级长任务链 → 「稳态 pickup 延迟误杀」证伪。
// 触发点=世界入场首次 spawn/首结果链（时点被环形缓冲逐出,不可直测）。源码闭环：
// 旧看门狗 warmup 分支（now-startedAt>2000,wave `_wwLastField===0` 支/light
// `results===0` 支）从 spawn 起按【墙钟】计时,而 worker 模块图冷取（SW 未预热）
// 在世界入场风暴期 >2s 极平凡 → 开局必杀;杀后 `_wwOn=false`/`_lw=null` 零重生
// 路径 → 整会话 40% 主线程墙钟。关键旁证：代码库既有判例 prefetchWorldGenWorker/
// prefetchSaveWorker 借音频门预热 worker 脚本进 SW 缓存,light/wave 从未拿到同款
// 预热=结构性缺口。
//
// ═══════════════ 三缺陷治理（语义单源,两侧集成面各自落刀）═══════════════
// ①信号源（outstanding-aware）：主线程「没 pickup 到结果」不是 worker 死的证据——
//   主线程忙/暂停/隐藏期本来就取不了货也发不出新请求。唯一有效嫌疑面=「主线程发出
//   了快照且最老未答请求年龄超预算」（worker 线程独立于主线程负载,收到请求必产出;
//   outstanding=0 时回传缺席完全无信息量,永不定谳——修「跨隐藏期 lastResultAt 陈旧,
//   恢复首拍即杀」族）。预算双档：warmup（该 worker 实例 0 产出）15s=冷模块图取+编译
//   宽限;稳态 2s。双拍确认闩（CONFIRM_MS 内第二拍仍嫌疑才定谳）：rAF 与消息任务
//   FIFO 交错的残余竞态豁免——worker 已产出、回达消息在队列里排队的场景会在两拍间
//   经 onResult 冲账解武装。
// ②去永久化：回落 → 阶梯重生 5s/10s/20s（封顶续 20s）,?wwretry=0 逃生门。重生=
//   全新 worker 实例（light 走 warmup 双跑语义无黑窗;wave 走 shadow 双轨本地连续）。
// ③指纹：falls 细分 onerror/no-result-dead/pickup-timeout,入 F5 驾驶舱。
/** 回落原因三分类（F5 fallsBy 消费面） */
export type WorkerFallReason = 'onerror' | 'no-result-dead' | 'pickup-timeout';
export type WorkerFallsBy = Record<WorkerFallReason, number>;

/** warmup 预算：该 worker 实例 0 产出期间的未答请求年龄上限——覆盖冷模块图
 *  取+编译（弱机/慢网/部署新 hash 冷缓存实测 >2s;定谳=开局误杀第一因）。 */
export const WORKER_WARMUP_BUDGET_MS = 15000;
/** 稳态预算：已产出过的 worker,最老未答请求年龄上限（旧 2s 语义保留,但只对
 *  「确有在途请求」生效——outstanding=0 的回传缺席不再计数）。 */
export const WORKER_STEADY_BUDGET_MS = 2000;
/** 双拍确认窗：嫌疑武装后须经此时长仍未解武装才定谳（两拍间回达冲账=豁免）。 */
export const WORKER_CONFIRM_MS = 250;
/** 阶梯重生延迟：首次 5s → 10s → 封顶 20s（swpipe 判例;重生成功即回 worker 模式）。 */
export const WORKER_RESPAWN_LADDER_MS = [5000, 10000, 20000] as const;

export function ladderDelayMs(fallIndex: number): number {
  const i = Math.min(Math.max(fallIndex, 0), WORKER_RESPAWN_LADDER_MS.length - 1);
  return WORKER_RESPAWN_LADDER_MS[i];
}

/** 重生阶梯逃生门（?wwretry=0=回落即终态,旧语义）。每次判读现场解析（仅回落/
 *  重生分派点调用,频次≈0）;worker 上下文无 location → 缺省开。 */
export function workerRetryEnabled(): boolean {
  try {
    return typeof location === 'undefined' || new URLSearchParams(location.search).get('wwretry') !== '0';
  } catch { return true; }
}

/**
 * outstanding-aware 看门狗（每 worker 实例一个;回落即弃,重生换新实例）。
 * 纯时序状态机,零 DOM/Worker 依赖（node 单测直驱）。
 *
 * 时序约定：onSend=主线程发出一份快照/帧（1:1 期待一份结果）;onResult=一份结果
 * 被主线程 pickup（消息到达即算,应用与否不影响心跳语义——世代过滤丢弃同样证明
 * worker 活着）。healthy(now, errored) 由宿主每 tick/frame 轮询。
 */
export class WorkerWatchdog {
  private outstanding = 0;
  private oldestOutstandingAt = 0;
  private produced = 0;
  private lastSendAt = 0;
  private lastLagMs = 0;
  private armedAt = 0;
  private condemned = false;
  private reason: WorkerFallReason = 'no-result-dead';

  /** 主线程发出一份请求（ outstanding 0→1 时钉最老年龄锚）。 */
  onSend(now: number): void {
    if (this.condemned) return;
    if (this.outstanding === 0) this.oldestOutstandingAt = now;
    this.outstanding++;
    this.lastSendAt = now;
  }

  /** 一份结果被主线程 pickup（到达即算）。证据=worker 产出——嫌疑武装即刻解除。 */
  onResult(now: number): void {
    if (this.outstanding > 0) this.outstanding--;
    if (this.outstanding === 0) this.oldestOutstandingAt = 0;
    this.produced++;
    this.lastLagMs = this.lastSendAt > 0 ? now - this.lastSendAt : 0;
    this.armedAt = 0;
  }

  /** 最近一次 send→pickup 端到端延迟（pickup-timeout 分类指纹 + 诊断面）。 */
  get lagMs(): number { return this.lastLagMs; }

  /** 宿主轮询:false=定谳回落（此后恒 false,宿主应 dispose+阶梯重生）。 */
  healthy(now: number, errored: boolean): boolean {
    if (this.condemned) return false;
    if (errored) { this.condemn('onerror'); return false; }   // 硬证据,免闩直杀
    if (this.outstanding === 0) { this.armedAt = 0; return true; }   // 无在途请求=无证据
    const budget = this.produced > 0 ? WORKER_STEADY_BUDGET_MS : WORKER_WARMUP_BUDGET_MS;
    if (now - this.oldestOutstandingAt <= budget) { this.armedAt = 0; return true; }
    // 嫌疑：双拍确认（250ms 内第二拍仍嫌疑才定谳;两拍间 onResult 冲账=豁免——
    // rAF/消息任务 FIFO 交错的「回达在队列里排队」残余竞态在此消解）
    if (this.armedAt === 0) { this.armedAt = now; return true; }
    if (now - this.armedAt < WORKER_CONFIRM_MS) return true;
    this.condemn(this.produced > 0 && this.lastLagMs >= WORKER_STEADY_BUDGET_MS
      ? 'pickup-timeout'   // 回传管道饱和（末次端到端延迟超预算）——弱机拥塞签名
      : 'no-result-dead'); // 静默停摆（末次延迟健康却无新产出）——真死签名
    return false;
  }

  private condemn(reason: WorkerFallReason): void {
    this.condemned = true;
    this.reason = reason;
  }

  fallReason(): WorkerFallReason { return this.reason; }
}

export function newFallsBy(): WorkerFallsBy {
  return { onerror: 0, 'no-result-dead': 0, 'pickup-timeout': 0 };   // 键=WorkerFallReason 值（fallsBy[reason]++ 直配）
}

// ★prefetchLightWaveWorkers 已迁 src/workers/lightWavePrefetch.ts（2026-09-29 拆出:
//   本模块被 LightingEngine.ts:16 import,worker-URL 字面量留在这里会把 LightWorker
//   的 bundle 闭包接回 Wave/Light 入口=vite「Circular worker imports」拒构建）。

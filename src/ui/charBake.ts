// SW-AX1 2026-09-06: 角色创建 sheet 烘焙的低开销调度件(纯逻辑,node 单测可驱动)。
// 延迟定谳(scripts/_cc-ax1-latency.mjs @ SW_ORIGIN 私有实例,暖缓存稳态):
//   look 随机点击→缩略图换图 38-50ms = ensure 缺口 13-16ms(随机必换变体→新变体
//   Player_{v}_{s} 全套懒载) + 20 帧整表合成 ~9-14ms(缩略图只消费第 0 帧,19 帧白烘)
//   + toDataURL 同步 PNG 编码 10-14ms + 双烘(直调+scheduleSheetBake(0))第二轮余波;
//   hair 重烘 626ms = 213 格整表合成 ~400ms + setTimeout(0) 嵌套钳制税 27ms(10 批)
//   + toDataURL(440×968) 同步编码 85ms。四件套对症:
//   yieldTask(零钳制让出)/bakeCells(时间预算自适应批)/SingleFlightBake(快照键单飞+
//   尾随重烘)/canvasToUrl(toBlob 异步编码)+DelayedMask(延迟挂载 loading 态)。

/** 零延迟让出:setTimeout(0) 嵌套 ≥5 层被钳到 4ms/次(hair 烘 10 批实测 27ms 纯税),
 *  MessageChannel 宏任务让出无钳制且让出渲染检查点;无 MessageChannel 环境
 *  (Node 老版本/极简 jsdom)回退 setTimeout(0)。 */
export function yieldTask(): Promise<void> {
  const MC = (globalThis as {
    MessageChannel?: new () => {
      port1: { onmessage: (() => void) | null; close(): void };
      port2: { postMessage(v: unknown): void };
    };
  }).MessageChannel;
  if (typeof MC === 'function') {
    return new Promise((resolve) => {
      const ch = new MC!();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 批大小规划器:上次批耗时超预算按比例缩、富余 ×1.5 扩,钳 [min,max]。
 *  保住 2026-08-27"不阻塞主线程"底线的同时,自适应批让 213 格总墙钟更短
 *  (固定 24 格/批曾使每批长任务 ~40ms)。 */
export function nextBatchSize(prev: number, lastMs: number, budgetMs = 7, min = 6, max = 32): number {
  if (!(prev > 0)) return prev;
  if (!(lastMs > 0)) {
    // SW-RB3 2026-09-06: lastMs=0 = 零耗批(粗时钟环境 sub-µs 批真实读 0)——按最大富余
    // 扩批,不得与"无数据"混判(旧守卫把 0 也原样返回 → 零耗工作负载批长永不增长,
    // 213 格退化成 27 批 27 让出);负值/NaN(时钟回拨等病态)才算无数据,原样返回防注入
    if (lastMs === 0) return Math.max(min, Math.min(max, Math.round(prev * 1.5)));
    return prev;
  }
  const next = lastMs > budgetMs ? prev * (budgetMs / lastMs) : prev * 1.5;
  return Math.max(min, Math.min(max, Math.round(next)));
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** SW-BM1 2026-09-06: 批级诊断账(环形 64 批)——bakeCells 每批落一行
 *  {cells 批内格数, ms 批耗时, maxCellMs 批内最大单格}。恒记(逐格一次
 *  performance.now(),亚 µs 级;批对象每批一个,量级=批数)。消费面=探针/
 *  诊断脚本读 bakeLastBatches() 定位"长任务在批内均摊还是单格尖峰"。
 *  clearBakeStats() 供分段测量清账。 */
export interface BakeBatchStat { cells: number; ms: number; maxCellMs: number }
const batchRing: BakeBatchStat[] = [];
export function bakeLastBatches(): readonly BakeBatchStat[] { return batchRing; }
export function clearBakeStats(): void { batchRing.length = 0; }

/** SW-BB1 D4a 2026-09-06: 批级硬顶(ms)。规划批的预估时长(批长 × 每格 EWMA 估计)
 *  超顶时按 cells 向下钳——防病态慢源(单格突刺/同步解码/GC)把批拖成 300ms 级长任务。
 *  只在规划器【输出】上钳(向下、恒 ≥1 格),EWMA/预算语义不变;正常负载
 *  (hair 烘每格 ~1.9ms、look ~1ms)预估 ≤~10ms 恒不触发,守线数字不受影响。 */
export const BAKE_BATCH_HARD_CAP_MS = 24;

/** 分批执行 draw(items),批间 yieldTask 让出,批大小按耗时自适应。
 *  批耗时按 EWMA(0.6/0.4)平滑后喂规划器——单批方差不放大批长(56ms 尖峰根因)。
 *  返回批数与让出次数(回归锚:213 格 N 批内完成且每批界必让出)。
 *  shouldAbort=面板关闭等中止门(中止时已画的格随调用方丢弃)。 */
export async function bakeCells<T>(
  items: readonly T[],
  draw: (item: T, index: number) => void,
  opts: { budgetMs?: number; startBatch?: number; shouldAbort?: () => boolean;
          afterBatch?: (batchMs: number) => void } = {},
): Promise<{ batches: number; yields: number }> {
  const budget = opts.budgetMs ?? 7;
  const abort = opts.shouldAbort ?? (() => false);
  let batch = Math.max(1, opts.startBatch ?? 8);
  let batches = 0;
  let yields = 0;
  let ewma = 0;
  let lastCells = 0;
  let i = 0;
  while (i < items.length) {
    if (abort()) return { batches, yields };
    const t0 = nowMs();
    const end = Math.min(items.length, i + batch);
    let maxCellMs = 0;                                     // ★SW-BM1: 批内最大单格(诊断账)
    for (let j = i; j < end; j++) {
      const ct = nowMs();
      draw(items[j]!, j);
      const cd = nowMs() - ct;
      if (cd > maxCellMs) maxCellMs = cd;
    }
    batches++;
    const dur = nowMs() - t0;
    batchRing.push({ cells: end - i, ms: +dur.toFixed(2), maxCellMs: +maxCellMs.toFixed(2) });
    if (batchRing.length > 64) batchRing.shift();
    ewma = ewma ? ewma * 0.6 + dur * 0.4 : dur;
    lastCells = end - i;
    i += end - i;                 // ★按实耗推进——批大小变更只作用于下一批
    batch = nextBatchSize(batch, ewma, budget);
    // SW-BB1 D4a: 硬顶钳制——perCell=ewma/上批格数,预估=规划批长×perCell>顶时减格。
    // 零耗批(ewma=0)不钳;钳到 1 保进度(最坏每格一让出,不再整批悬挂)。
    const perCellMs = lastCells > 0 ? ewma / lastCells : 0;
    if (perCellMs > 0) batch = Math.min(batch, Math.max(1, Math.floor(BAKE_BATCH_HARD_CAP_MS / perCellMs)));
    // ★SW-BM1 2026-09-06: 批后钩子(可选,入参=本批耗时 ms)——GPU 加速目标画布的
    //  延迟命令队列在批间"放血"(如 1×1 getImageData 强制物化),防积到尾部物化点
    //  一次性冲刷成百毫秒长任务;调用方可按累计耗时分频(放血本身有 ~25ms 固定
    //  GPU sync 成本,逐批放血不划算)。缺省无钩子 = 零开销。
    if (opts.afterBatch) opts.afterBatch(dur);
    if (i < items.length) { await yieldTask(); yields++; }
  }
  return { batches, yields };
}

/** 单次烘焙落地洁净度(run 回传,SW-BB1 D1):
 *  'clean' = sheet 已落地且内容自检通过(格子全绘出、非全透明)——同键后续请求可跳过;
 *  'dirty' = 落地但有缺口(miss 格/全透明自检失败)或本次失败——同键下次请求必须重烘;
 *  'noop'  = 本页无 sheet(信息/颜色页)或中途放弃(面板关闭)——不动落地账。
 *  run 回传 void/undefined 按 'noop' 计(纯逻辑单测的旧形态保持兼容)。 */
export type BakeOutcome = 'clean' | 'dirty' | 'noop';

/** 单飞烘焙调度:飞行中的 request 折叠为同一 Promise;请求时快照键与起飞时不同
 *  才登记尾随重烘(同态=本次飞行结果已覆盖请求,免重烘)。
 *  消:randomize 直调 bakeSheets + buildLook/buildHair 尾 scheduleSheetBake(0)
 *  双入口曾在同态下白跑第二轮全链(双 ensure/双编码/双 applySheetUrls)。
 *  SW-BB1 D1 2026-09-06: 增设「落地账」(lastLandedKey+lastLandedClean)——落地键
 *  相同∧洁净 → request 直接复用现值不重烘(bakeStateKey 是超集:理发窗同色随机
 *  同发型/切页回来等键不变场景不再全量重烘+重编码)。不洁(全透明自检失败/miss/
 *  异常)置 clean=false → 同键重烘通路保留 = 2026-08-25 全透明自愈链不死
 *  (死 sheet 永远有路重烘);自愈/retry 链另走 forceRequest 强制通道双保险。 */
export class SingleFlightBake {
  private flight: Promise<void> | null = null;
  private flightKey = '';
  private pending = false;
  private pendingForce = false;
  private lastLandedKey = '';
  private lastLandedClean = false;
  constructor(
    private run: () => Promise<BakeOutcome | void>,
    private key: () => string,
    private alive: () => boolean = () => true,
  ) {}

  request(): Promise<void> {
    if (this.flight) {
      if (this.key() !== this.flightKey) this.pending = true;
      return this.flight;
    }
    const key = this.key();
    // SW-BB1 D1: 落地账命中(键同∧洁净)→ 复用现值,不重烘
    if (key === this.lastLandedKey && this.lastLandedClean) return Promise.resolve();
    return this.launch(key, false);
  }

  /** SW-BB1 D1: 强制通道——无视落地账直接起飞(全透明自检失败/retry 链用,保证
   *  死 sheet 不被跳过);烘后仍按洁净度更新落地账。飞行中登记【强制】尾随。 */
  forceRequest(): Promise<void> {
    if (this.flight) {
      this.pending = true;
      this.pendingForce = true;
      return this.flight;
    }
    return this.launch(this.key(), true);
  }

  private launch(key: string, force: boolean): Promise<void> {
    this.pending = false;
    this.pendingForce = false;
    this.flightKey = key;
    const flight = this.run()
      .catch(() => 'dirty' as BakeOutcome)   // 异常=不洁(单飞不放大失败;同键下次重烘,前单飞语义)
      .then((outcome) => {
        if (outcome === 'clean') { this.lastLandedKey = key; this.lastLandedClean = true; }
        else if (outcome === 'dirty') { this.lastLandedKey = key; this.lastLandedClean = false; }
        // 'noop'/undefined: 不动落地账(信息/颜色页无 sheet;放弃不抹旧账)
      })
      .finally(() => {
        this.flight = null;
        if (this.pending && this.alive()) {
          const forceTrailing = this.pendingForce;
          this.pending = false;
          this.pendingForce = false;
          void (forceTrailing ? this.forceRequest() : this.request());
        } else {
          this.pending = false;
          this.pendingForce = false;
        }
      });
    this.flight = flight;
    return flight;
  }

  /** 面板关闭:吞尾随重烘(飞行体自守 isConnected)。 */
  cancel(): void { this.pending = false; this.pendingForce = false; }

  get inFlight(): boolean { return this.flight !== null; }
}

/** 烘焙 loading 态(延迟挂载):immediate=无旧图可看(首访)立即挂;重烘路径延迟
 *  delayMs 才挂——快烘(<120ms)不闪遮罩,慢烘(>120ms)有可见反馈。
 *  apply(on) 挂/摘由消费方映射到当前页容器 class。 */
export const BAKE_MASK_DELAY_MS = 120;
export class DelayedMask {
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private shown = false;
  constructor(private delayMs = BAKE_MASK_DELAY_MS, private apply: (on: boolean) => void) {}

  /** 挂载请求;shown 时幂等,等待中重复 arm 幂等。 */
  arm(immediate: boolean): void {
    if (this.shown) return;
    if (immediate) {
      if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
      this.shown = true;
      this.apply(true);
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.shown = true;
      this.apply(true);
    }, this.delayMs);
  }

  /** 摘除(apply(false) 仅在真挂过时发,避免盖掉消费方自建的初始态)。 */
  disarm(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    if (this.shown) {
      this.shown = false;
      this.apply(false);
    }
  }

  get visible(): boolean { return this.shown; }
}

/** canvas → 可挂 CSS 的 URL:优先 toBlob+objectURL(PNG 编码下放浏览器编码线程,
 *  440×968 同步 toDataURL 实测 85ms 主线程阻塞);无 toBlob 环境兜底同步 toDataURL。 */
export async function canvasToUrl(cv: HTMLCanvasElement): Promise<string> {
  const toBlob = typeof cv.toBlob === 'function' ? cv.toBlob.bind(cv) : null;
  if (toBlob) {
    try {
      const blob = await new Promise<Blob | null>((resolve) => toBlob((b) => resolve(b), 'image/png'));
      if (blob) return URL.createObjectURL(blob);
    } catch { /* 编码失败回退同步路径 */ }
  }
  return cv.toDataURL();
}

/** objectURL 判定(revoke 管理只针对 blob:,dataURL 无需回收)。 */
export function isObjectUrl(url: string): boolean {
  return url.startsWith('blob:');
}

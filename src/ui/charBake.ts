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
  if (!(lastMs > 0) || !(prev > 0)) return prev;
  const next = lastMs > budgetMs ? prev * (budgetMs / lastMs) : prev * 1.5;
  return Math.max(min, Math.min(max, Math.round(next)));
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 分批执行 draw(items),批间 yieldTask 让出,批大小按耗时自适应。
 *  批耗时按 EWMA(0.6/0.4)平滑后喂规划器——单批方差不放大批长(56ms 尖峰根因)。
 *  返回批数与让出次数(回归锚:213 格 N 批内完成且每批界必让出)。
 *  shouldAbort=面板关闭等中止门(中止时已画的格随调用方丢弃)。 */
export async function bakeCells<T>(
  items: readonly T[],
  draw: (item: T, index: number) => void,
  opts: { budgetMs?: number; startBatch?: number; shouldAbort?: () => boolean } = {},
): Promise<{ batches: number; yields: number }> {
  const budget = opts.budgetMs ?? 7;
  const abort = opts.shouldAbort ?? (() => false);
  let batch = Math.max(1, opts.startBatch ?? 8);
  let batches = 0;
  let yields = 0;
  let ewma = 0;
  for (let i = 0; i < items.length; i += batch) {
    if (abort()) return { batches, yields };
    const t0 = nowMs();
    const end = Math.min(items.length, i + batch);
    for (let j = i; j < end; j++) draw(items[j]!, j);
    batches++;
    const dur = nowMs() - t0;
    ewma = ewma ? ewma * 0.6 + dur * 0.4 : dur;
    batch = nextBatchSize(batch, ewma, budget);
    if (end < items.length) { await yieldTask(); yields++; }
  }
  return { batches, yields };
}

/** 单飞烘焙调度:飞行中的 request 折叠为同一 Promise;请求时快照键与起飞时不同
 *  才登记尾随重烘(同态=本次飞行结果已覆盖请求,免重烘)。
 *  消:randomize 直调 bakeSheets + buildLook/buildHair 尾 scheduleSheetBake(0)
 *  双入口曾在同态下白跑第二轮全链(双 ensure/双编码/双 applySheetUrls)。 */
export class SingleFlightBake {
  private flight: Promise<void> | null = null;
  private flightKey = '';
  private pending = false;
  constructor(
    private run: () => Promise<void>,
    private key: () => string,
    private alive: () => boolean = () => true,
  ) {}

  request(): Promise<void> {
    if (this.flight) {
      if (this.key() !== this.flightKey) this.pending = true;
      return this.flight;
    }
    this.pending = false;
    this.flightKey = this.key();
    const flight = this.run()
      .catch(() => { /* 单飞不放大失败:失败态由调用方重试链兜底 */ })
      .finally(() => {
        this.flight = null;
        if (this.pending && this.alive()) void this.request();
        else this.pending = false;
      });
    this.flight = flight;
    return flight;
  }

  /** 面板关闭:吞尾随重烘(飞行体自守 isConnected)。 */
  cancel(): void { this.pending = false; }

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

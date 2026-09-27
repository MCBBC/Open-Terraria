// GPU 提交账本（#perf2026-08-28 需求："通过 console.log 打印 GPU 负载与送进 GPU 的
// 贴图/渲染量"）。
//
// 能测什么 / 不能测什么：
//   ✅ 每帧、按上下文精确记账——贴图上传张数与字节(texImage2D/texSubImage2D)、
//      绘制调用数(drawArrays/drawElements)、纹理删除与净驻留字节。
//      ★驻留 vs 带宽双口径:新建纹理分配才算驻留;既有纹理的每帧刷新只算带宽
//      (GLSpriteLayer.texFromImage 走 Alloc;worldLight/water 的逐帧整屏刷新只记带宽)。
//      全部在调用点埋计数(我们自持全部 GL 上下文),不做任何原型包装。
//   ⚠️ "GPU 利用率 %"浏览器不暴露;WebGL 计时查询(disjoint_timer_query)被 Chrome
//      禁用。替代代理 = **fence 完成延迟**:每 K 帧在本上下文收工处插 fenceSync,
//      之后每帧零开销轮询 clientWaitSync(0)——GPU 真正完成时刻 - 提交时刻 =
//      队列滞后 ms(GPU 排队越久滞后越大,滚动 p50/max)。这是"GPU 是否吃得满"
//      的可靠间接信号(配合帧率不减=未饱和;滞后涨+掉帧=真饱和)。
//
// 帧推进:Game 渲染循环尾调 glStatFrame()(唯一推进点,早退路径少记一帧无妨)。
// 消费:window.__swGPULog.snapshot() / ?gpulog=1 时自动每 2s console.log。

/** 纹理字节公式(本仓全部 upload 使用的三档格式) */
export function texBytes(fmt: number | string, w: number, h: number): number {
  const f = typeof fmt === 'number' ? fmt : fmt;
  // LUMINANCE=0x1901, R8(RED)=0x1903, 其余按 RGBA8 计
  if (f === 0x1901 || f === 'LUMINANCE') return w * h;
  if (f === 0x1903 || f === 'RED') return w * h;
  return w * h * 4;
}

export interface GpuAccount {
  /** 本帧上传笔数与带宽字节(含对既有纹理的刷新) */
  uploads: number; upBytes: number;
  /** 本帧新纹理分配字节(计入驻留的那部分) */
  allocBytes: number;
  draws: number; verts: number;
  deletes: number; delBytes: number;
  /** 净驻留纹理字节(累计上传-删除;运行期下限 0) */
  liveBytes: number;
}

const empty = (): GpuAccount => ({ uploads: 0, upBytes: 0, allocBytes: 0, draws: 0, verts: 0, deletes: 0, delBytes: 0, liveBytes: 0 });

class CtxLedger {
  frame = empty();
  last = { ...empty() };
  liveBytes = 0;
  /** fence 滚动滞后样本(最近 64 个) */
  lags: number[] = [];
}

const ledgers = new Map<string, CtxLedger>();
function ctx(name: string): CtxLedger {
  let c = ledgers.get(name);
  if (!c) { c = new CtxLedger(); ledgers.set(name, c); }
  return c;
}

/** 带宽口径:本帧把字节送进 GPU(含对既有纹理的整块刷新) */
export function glStatUpload(name: string, bytes: number): void {
  const c = ctx(name);
  c.frame.uploads++; c.frame.upBytes += bytes;
}
/** 驻留口径:新纹理对象的一次性分配(texFromImage/createTexture 后首传)。配对
 *  删除时由 glStatDelete 减回——对既有纹理的每帧刷新【勿】走此入口(t1036 教训:
 *  worldLight/waterDistortion 整屏逐帧刷新曾以 +350/+730MB/帧 污染驻留列) */
export function glStatTexCreate(name: string, bytes: number): void {
  const c = ctx(name);
  c.frame.allocBytes += bytes;   // 本帧分配量(进上帧快照的 新分配 列)
  c.liveBytes += bytes;          // 驻留净额
}
export function glStatDelete(name: string, bytes: number): void {
  const c = ctx(name);
  const b = Math.min(bytes, Math.max(0, c.liveBytes));
  c.frame.deletes++; c.frame.delBytes += b; c.liveBytes -= b;
}
export function glStatDraw(name: string, verts: number): void {
  const c = ctx(name);
  c.frame.draws++; c.frame.verts += verts;
}

let frameN = 0;
/** 渲染循环尾唯一推进点 */
export function glStatFrame(): void {
  if (!ledgers.size && !fencesByCtx.size) return;
  frameN++;
  pollFences();
  for (const c of ledgers.values()) {
    c.last = { ...c.frame };
    c.frame = empty();
  }
}
const fenceLagsEmpty = () => !lastLag.p50;

// ---- fence 延迟代理 ----
interface FenceSlot { name: string; gl: WebGL2RenderingContext; obj: WebGLSync | null; issuedAt: number }
const fencesByCtx = new Map<string, FenceSlot>();
let lastLag = { p50: 0, max: 0, n: 0 };

export function registerFence(name: string, gl: WebGLRenderingContext): void {
  if (!('fenceSync' in gl)) return;            // WebGL1 无围栏,静默跳过
  // ★R3-F9（2026-09-25 红蓝批 B）：同名槽 revive 后持死上下文引用——旧实现
  //  has(name) 即返,槽永远钉死旧 gl（pollFences 对死上下文恒 skip=fence 观测面
  //  整链盲区）;现检测旧槽 isContextLost 即重建槽（新 gl 顶替）。活槽幂等不换。
  const old = fencesByCtx.get(name);
  if (old) {
    const lost = (() => { try { return old.gl.isContextLost(); } catch { return true; } })();
    if (!lost) return;
  }
  fencesByCtx.set(name, { name, gl: gl as WebGL2RenderingContext, obj: null, issuedAt: 0 });
}
const FENCE_EVERY = 10;                        // 每 10 帧一发
function pollFences(): void {
  for (const f of fencesByCtx.values()) {
    try {
      if (f.gl.isContextLost?.()) { f.obj = null; continue; }
      if (frameN % FENCE_EVERY === 0 && !f.obj) {
        f.obj = f.gl.fenceSync(f.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        f.issuedAt = performance.now();
        continue;
      }
      if (f.obj) {
        const st = f.gl.clientWaitSync(f.obj, 0, 0);   // 零超时纯探测
        if (st === f.gl.ALREADY_SIGNALED || st === f.gl.CONDITION_SATISFIED) {
          const lag = performance.now() - f.issuedAt;
          const c = ctx(f.name).lags;
          c.push(lag); if (c.length > 64) c.shift();
          f.gl.deleteSync(f.obj); f.obj = null;
        }
        // 还没好:下一帧再看(不计入)
      }
    } catch { /* 上下文异常静默 */ }
  }
}
function lagStats(): { p50: number; max: number; n: number } {
  const all: number[] = [];
  for (const c of ledgers.values()) all.push(...c.lags);
  all.sort((a, b) => a - b);
  lastLag = { p50: all.length ? all[Math.floor(all.length / 2)] : 0, max: all.length ? all[all.length - 1] : 0, n: all.length };
  return lastLag;
}

export interface GpuSnapshot {
  frame: number;
  fenceLagMs: { p50: number; max: number };
  /** key = name */
  ctxs: Record<string, {
    liveMB: number;
    /** 上一整帧的本帧增量(uploads/upMB/draws) */
    frameUp: number; frameUpMB: number; frameDraws: number; frameAllocMB: number;
    lags: { p50: number; max: number; n: number };
  }>;
}

export function gpuLogSnapshot(): GpuSnapshot {
  const out: GpuSnapshot = { frame: frameN, fenceLagMs: { ...lagStats() }, ctxs: {} as GpuSnapshot['ctxs'] };
  for (const [name, c] of ledgers) {
    const ls = c.lags.length ? [...c.lags].sort((a, b) => a - b) : [];
    out.ctxs[name] = {
      liveMB: c.liveBytes / 1048576,
      frameUp: c.last.uploads,
      frameUpMB: c.last.upBytes / 1048576,
      frameAllocMB: c.last.allocBytes / 1048576,
      frameDraws: c.last.draws,
      lags: { p50: ls.length ? ls[Math.floor(ls.length / 2)] : 0, max: ls.length ? ls[ls.length - 1] : 0, n: c.lags.length },
    };
  }
  return out;
}

let loggerInstalled = false;
/** ?gpulog=1 自动启动的周期打印;也可 window.__swGPULog.start(sec) 手动开 */
export function installGpuLogger(intervalSec = 2): void {
  if (loggerInstalled) return;
  loggerInstalled = true;
  setInterval(() => {
    const s = gpuLogSnapshot();
    const head = `[gpulog] frame=${s.frame} 围栏滞后(p50/max)=${s.fenceLagMs.p50.toFixed(1)}/${s.fenceLagMs.max.toFixed(1)}ms`;
    const rows = Object.entries(s.ctxs).map(([k, v]) =>
      `  ${k.padEnd(14)} 驻留=${v.liveMB.toFixed(2)}MB  上传=${v.frameUpMB.toFixed(2)}MB(${v.frameUp}笔/帧)  新分配=${v.frameAllocMB.toFixed(2)}MB  draw=${v.frameDraws}/帧  延迟p50=${v.lags.p50.toFixed(1)}ms`);
    console.log([head, ...rows].join('\n'));
  }, intervalSec * 1000);
}

// ---- 跨实例显存饥饿锁(#三开压测批) ----
// 三 tab 共享同一 GPU 进程池:预算穿透后 Chrome 逐最旧表面 → 各层反复蒸发+重建
// (inst-3 实测 25×CONTEXT_LOST / 每轮重传 ~27MB 全量驻留 = 正反馈死亡螺旋)。
// 本锁 = 90s 窗口内 ≥3 次 contextlost 即判定系统性饥饿:工厂新建入口直接让路,
// 渲染走各消费方既有 2D 回退链,直到滚动窗口自然衰减。VUI 光标等 2D 自愈不受限。
const lossTimes: number[] = [];
/** 记一次真实 GL 上下文丢失(isContextLost==true 或 webglcontextlost 事件;分配失败不计)。
 *  ★P0-A:新丢失=半开试探 streak 作废(「连续成功才闭合」被打断,窗照常滚动)。 */
export function noteContextLost(tag: string): void {
  lossTimes.push(performance.now());
  probeOkStreak = 0;
  if (lossTimes.length > 64) lossTimes.shift();
}
/** ★P0-C（2026-09-25 trace-231810 定谳续刀）同上下文丢失去重口径:共管管线画布上
 *  挂着 N 个监听者（管线本体+云层+世界层…同一真实丢失事件全体齐发）——旧链每监听者
 *  各记一笔=单次真实丢失即污染饥饿窗 N 笔,2 次真实丢失即 ≥3 次判饥饿=锁被「审计窗
 *  被共挂者灌满」假阳性瞬间扳动（compose 已建活着而 worldGl 工厂恒被扣押的分层
 *  塌方形态主因之一）。以 ctxKey（=共享 canvas 对象,WeakMap 不滞留）去重:同 key
 *  250ms 内的多笔报告只记窗一次——250ms 内同上下文二次丢失物理不可能（须先 restore）。 */
const lossDedupe = new WeakMap<object, number>();
export function noteContextLostOnce(ctxKey: object, tag: string): void {
  const now = performance.now();
  const last = lossDedupe.get(ctxKey);
  if (last !== undefined && now - last < 250) return;
  lossDedupe.set(ctxKey, now);
  noteContextLost(tag);
}
let lastStarveLogAt = -Infinity;
let _starvedEver = false;   /** 会话级闩:饥饿发生过一次即真(贫困模式依据) */
export function starvedEver(): boolean { return _starvedEver; }
/** ★P0-A 半开试探（2026-09-25 塌方定谳续刀）：饥饿锁原语义=90s 滚动窗内 ≥3 次
 *  contextlost 即扣押全部 GL 工厂,窗内每次新丢失都续期——系统性饥饿(三开/GPU
 *  进程挤压)缓解后仍要等满 90s 无新丢失才解锁,实测拖出 17 分钟全 2D 塌方
 *  （ acquireSwPipe 恒 null 面）。熔断器 half-open 语义修复:饥饿期内每
 *  STARVE_PROBE_MS 放行一拍（starvedLock() 返 false 让工厂试建,失败时 init
 *  成本极低）,不被滚动窗无限续期扣押;【连续】≥2 拍试建成功才闭合（清窗）,
 *  单拍成功只计 streak——防单次侥幸抖动回切再炸。 */
const STARVE_PROBE_MS = 5000;
let lastProbeAt = -Infinity;
let probeOkStreak = 0;
let _probePass = false;     /** 本拍是否处于半开放行（诊断面） */
type StarveCb = (active: boolean) => void;
const starveCbs: StarveCb[] = [];
let lastActive = false;
/** 订阅饥饿沿(进入 true / 解除 false)——Renderer 挂 renderScale 自动降档用 */
export function onStarveTransition(cb: StarveCb): void { starveCbs.push(cb); }
/** ★BJ318（2026-09-24）：退订——starveCbs 是模块级数组,Renderer 每局构造期
 *  push 的回调闭包捕获 this,dispose 不退订=死 Renderer→Game→World 整岛被模块
 *  单例永久钉死,进出世界每轮一份（WeakRef 二分+正向可达定谳的【主锚】）。 */
export function offStarveTransition(cb: StarveCb): void {
  const i = starveCbs.indexOf(cb);
  if (i >= 0) starveCbs.splice(i, 1);
}
/** 饥饿转场沿结算（starvedLock/闭合清窗共用;active 变更才走 cb, cb 链不抖） */
function settleStarve(active: boolean): void {
  if (active === lastActive) return;
  lastActive = active;
  if (active) _starvedEver = true;
  for (const cb of starveCbs) { try { cb(active); } catch { /* 观察者异常静默 */ } }
}
/** ≥3 次/90s = 饥饿;进入与解除沿各告警一条。
 *  ★P0-A 半开试探:饥饿窗内每 STARVE_PROBE_MS 放行一拍(返 false,工厂可试建)
 *  ——windowActive 转场沿照常结算(首次进饥饿仍告警/降档),试探拍不翻转沿。 */
export function starvedLock(): boolean {
  const now = performance.now();
  while (lossTimes.length && now - lossTimes[0] > 90_000) lossTimes.shift();
  const active = lossTimes.length >= 3;
  _probePass = false;
  if (active && now - lastProbeAt >= STARVE_PROBE_MS) {
    lastProbeAt = now;
    _probePass = true;
    settleStarve(true);          // 转场沿照常结算(饥饿态不因试探拍隐瞒)
    return false;                // 半开放行一拍
  }
  settleStarve(active);
  if (active && now - lastStarveLogAt > 30_000) {
    lastStarveLogAt = now;
    console.warn(`[gpulog] GPU 饥饿锁生效(90s 内丢失 ${lossTimes.length} 次;每 ${Math.round(STARVE_PROBE_MS / 1000)}s 半开试探一次)——GL 层重建暂停,走 2D 回退`);
  }
  return active;
}
/** ★P0-A 半开试探成功登记（Renderer.acquireSwPipe init 成功【与健康早退支】调用
 *  ——★R1b-4（2026-09-27 红蓝批 β）：旧码只记新建支,首次试探成功建链后后续
 *  acquire 走健康早退不记成功 → streak 恒 1 → 锁等 90s 自然衰减,期间
 *  GLWorldCompose.acquire 恒 null=acc 帧落 CPU 读回链（每帧全幅 readPixels）。
 *  健康支幂等补记后锁 2 拍内闭合。
 *  ★同拍去重：健康早退支每帧多消费方各调一次（cloud/world/compose 同帧串联）——
 *  STARVE_PROBE_MS 时间窗内只计一拍（「连续 ≥2 拍」拍语义保持,单拍多笔确认
 *  不等效两拍）;闭合/非饥饿期重置时间锚=新饥饿集会的首拍必计数。 */
let lastProbeOkAt = -Infinity;
export function noteStarveProbeOk(): void {
  if (lossTimes.length < 3) { probeOkStreak = 0; lastProbeOkAt = -Infinity; return; }
  const now = performance.now();
  if (now - lastProbeOkAt < STARVE_PROBE_MS) return;   // 同拍多消费方确认只计一拍
  lastProbeOkAt = now;
  if (++probeOkStreak >= 2) {
    lossTimes.length = 0;
    probeOkStreak = 0;
    lastProbeOkAt = -Infinity;
    settleStarve(false);
  }
}
/** ★P0-A 半开试探失败登记（init 失败/构造异常时调）——streak 归零,窗自然衰减 */
export function noteStarveProbeFail(): void { probeOkStreak = 0; }
/** ★P0-A F5 快照面:饥饿锁状态一次取全（DebugReport.swpipe 块消费） */
export function starveSnapshot(): {
  active: boolean; ever: boolean; losses: number; windowRemainMs: number;
  probeOkStreak: number; nextProbeInMs: number;
} {
  const now = performance.now();
  while (lossTimes.length && now - lossTimes[0] > 90_000) lossTimes.shift();
  return {
    active: lossTimes.length >= 3,
    ever: _starvedEver,
    losses: lossTimes.length,
    windowRemainMs: lossTimes.length ? Math.max(0, 90_000 - (now - lossTimes[0])) : 0,
    probeOkStreak,
    nextProbeInMs: lossTimes.length >= 3 ? Math.max(0, STARVE_PROBE_MS - (now - lastProbeAt)) : 0,
  };
}
let tag = '';
export function setStarveTag(t: string): void { tag = t; }

/** 显存预算观测(#2 需求):浏览器不暴露分配配额——这里给的是
 *  ①每个 GL 上下文的真实硬件身份(RENDERER/MAX_TEXTURE_SIZE);
 *  ②本仓账本净驻留(GL 纹理字节);
 *  ③DOM 全量 2D 画布表面估算(width×height×4,含窗口外);
 *  ④真实每进程显存要看 Chrome 任务管理器(Shift+Esc,"内存"列选 GPU 进程)。 */
export function gpuBudgetReport(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dom: Array<{ kind: string; count: number; mb: number }> = [];
  try {
    const map = new Map<string, { c: number; b: number }>();
    document.querySelectorAll('canvas').forEach((c) => {
      const gl = !!c.getContext;
      let kind = '2d-or-other';
      const gk = (c as HTMLCanvasElement).dataset?.glkind; if (gk) kind = gk;
      else if (c.id === 'ui-canvas') kind = 'vui';
      else if (c === document.querySelector('#game-root canvas')) kind = 'main?';
      const cur = map.get(kind) ?? { c: 0, b: 0 };
      cur.c++; cur.b += c.width * c.height * 4; map.set(kind, cur);
    });
    for (const [k, v] of map) dom.push({ kind: k, count: v.c, mb: +(v.b / 1048576).toFixed(2) });
    out.domSurfacesMB = +dom.reduce((a, x) => a + x.mb, 0).toFixed(1);
    out.domBreakdown = dom.sort((a, b) => b.mb - a.mb);
  } catch { /* 无 DOM 环境 */ }
  const gpus: Record<string, unknown> = {};
  fencesByCtx.forEach((f, name) => {
    try {
      const dbg = f.gl.getExtension('WEBGL_debug_renderer_info');
      const rd = dbg ? String(f.gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(f.gl.getParameter(f.gl.RENDERER));
      gpus[name] = {
        renderer: rd.slice(0, 80),
        maxTextureSize: f.gl.getParameter(f.gl.MAX_TEXTURE_SIZE),
        liveTexturesMB: +((ctx(name)?.liveBytes ?? 0) / 1048576).toFixed(2),
      };
    } catch { /* 上下文死 */ }
  });
  out.glContexts = gpus;
  out.jsHeapMB = (() => { try { return +(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(0); } catch { return -1; } })();
  return out;
}

export function maybeInstallGpuLoggerFromUrl(): void {
  try {
    (window as unknown as { __swGPULog?: unknown }).__swGPULog = {
      snapshot: gpuLogSnapshot,
      budget: gpuBudgetReport,
      start: installGpuLogger,
    };
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpulog') === '1') {
      installGpuLogger();
    }
  } catch { /* 非浏览器环境 */ }
}

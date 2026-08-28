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
  if (fencesByCtx.has(name)) return;
  if (!('fenceSync' in gl)) return;            // WebGL1 无围栏,静默跳过
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

export function maybeInstallGpuLoggerFromUrl(): void {
  try {
    (window as unknown as { __swGPULog?: unknown }).__swGPULog = {
      snapshot: gpuLogSnapshot,
      start: installGpuLogger,
    };
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpulog') === '1') {
      installGpuLogger();
    }
  } catch { /* 非浏览器环境 */ }
}

// 环境感知画布工厂（★C4 烘焙 Worker 化基建，2026-09-28）。
//
// 背景：ChunkCache 烘焙体抽出共享内核（ChunkBake.ts）后在主线程与 BakeWorker
// 两处执行——worker 侧【document 不存在】（fork bomb 判例家族：worker 上下文禁
// document 触点），烘焙调用树内所有 `document.createElement('canvas')` 触点一律
// 换本工厂。主线程行为逐位不变（优先 document 画布——与既有 GPU 后备/WRF 语义
// 完全一致）；worker 侧落 OffscreenCanvas；node 测试环境两者皆无 → null（与旧
// `typeof document === 'undefined' ? null : …` 桩语义同形）。
//
// 光栅化一致性依据：Chromium 主线程 canvas 与 worker OffscreenCanvas 2D 走同一
// Skia 光栅化引擎（同一 GPU 进程/同一线程池），本仓烘焙消费面（drawImage 最近邻/
// fillRect/clip+translate/filter=brightness/getImageData）无环境分支——双路径逐字
// 节一致由 tests/wbake 协议锁 + scripts/_wbake-digest.mjs 探针 md5 共同把门。

/** 主线程=HTMLCanvasElement；worker=OffscreenCanvas；node 测试环境=null */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 2D 上下文联合（两成员共享 CanvasFilters/CanvasDrawImage 等混入，烘焙树内
 *  消费面 drawImage/fillRect/clip/filter/getImageData 全部双成员可用） */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 是否 worker 上下文（烘焙 worker 侧诊断日志用；node=false） */
export const IN_WORKER = typeof document === 'undefined'
  && typeof WorkerGlobalScope !== 'undefined'
  && typeof self !== 'undefined'
  && self instanceof WorkerGlobalScope;

/** 建一张 2D 画布。w/h ≤ 0 时返回的画布保持 0 尺寸（与旧 document 路径同形，
 *  调用方自行保证先建后设尺寸的既有形态不破）。node 环境 null。 */
export function mkCanvas(w: number, h: number): AnyCanvas | null {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    return c;
  }
  return null;
}

/** 取 2D 上下文（attrs 透传——willReadFrequently 等语义两侧一致）。 */
export function ctx2d(c: AnyCanvas, attrs?: CanvasRenderingContext2DSettings): Ctx2D {
  const ctx = c.getContext('2d', attrs) as Ctx2D | null;
  if (!ctx) throw new Error('[canvasEnv] 2D context unavailable');
  return ctx;
}

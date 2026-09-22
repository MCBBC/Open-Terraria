// ★B0 Canvas2D 兼容 shim —— census 普查仪具（2026-09-22;渲染改造方案 §三 B0 一段）
//
// 目的：在世界层绘制路径上逐帧统计 2D API 调用谱（直映射档可支持面 vs 需隔离
// 栅格化兜底面 vs 稀有面），产出 shim 覆盖率报告 = B1+B2 世界层翻面战役的定谳
// 依据（方案 §二：实体 drawImage(1175 处)+alpha+仿射+lighter/source-over 静态
// 覆盖 ~95%、clip 零使用——本仪具用**运行时实测**替换静态统计）。
//
// 形态：ctx 包装器（仅 ?b0shadow=1 激活,零缺省开销——未激活时渲染路径零触碰）。
// 逐调用分类计数 + 矩阵栈深度哨兵,帧尾汇出 window.__swGLShim.snapshot()。
// B0 二段（移交件）：shim 执行器（quad 批发射）+ 影子 FBO 双执行 + 帧末像素
// diff 归因——需 GL 运行时,node vitest 无法验证像素,见 tests/b0-shim-census.test.ts 注。
//
// 分类表（直映射档 = 方案 §三 B0 定义的 GL batch 可精确表达面）：
//   direct: drawImage 3/5/9 参、save/restore、setTransform/translate/scale/rotate、
//           globalAlpha、gCO(source-over/lighter/destination-out)、fillRect、
//           imageSmoothingEnabled
//   fallback: 其余 gCO(multiply/destination-in/source-in/source-atop)、
//             fillText/strokeText、gradient、filter、getImageData/putImageData、
//             beginPath/arc/stroke/fill、clip、shadow、drawImage 异常形态
export type ShimCallCategory = 'direct' | 'fallback';

export interface ShimCensusFrame {
  frame: number;
  /** 直映射档调用计数（键=方法名） */
  direct: Record<string, number>;
  /** 兜底档调用计数（键=方法名[:形态]） */
  fallback: Record<string, number>;
  /** gCO 直映射档命中细分（混合档位发射分组依据） */
  gco: Record<string, number>;
  /** 矩阵栈深度峰值（shim 执行器栈容量依据） */
  maxStackDepth: number;
}

const DIRECT_METHODS = new Set([
  'drawImage', 'save', 'restore', 'setTransform', 'translate', 'scale', 'rotate',
  'fillRect', 'setImageSmoothingEnabled',
]);
const DIRECT_GCO = new Set(['source-over', 'lighter', 'destination-out']);

export class GLShimCensus {
  private target: CanvasRenderingContext2D;
  private frame: ShimCensusFrame;
  private frames: ShimCensusFrame[] = [];
  private stackDepth = 0;
  private maxStackDepth = 0;
  private frameNo = 0;
  /** 稀有面登记（防报告膨胀:每形态只记首 8 次「调用点样本」——setter 链） */
  rareSamples: string[] = [];

  constructor(target: CanvasRenderingContext2D) {
    this.target = target;
    this.frame = this.blank(++this.frameNo);
    // 探针句柄（scripts/_b0-shadow-audit.mjs 读 window.__swGLShim.snapshot()）
    (globalThis as unknown as Record<string, unknown>).__swGLShim = this;
  }

  private blank(frame: number): ShimCensusFrame {
    return { frame, direct: {}, fallback: {}, gco: {}, maxStackDepth: 0 };
  }

  private count(bucket: Record<string, number>, key: string): void {
    bucket[key] = (bucket[key] || 0) + 1;
  }

  private classify(method: string, kind: ShimCallCategory): void {
    this.count(kind === 'direct' ? this.frame.direct : this.frame.fallback, method);
  }

  /** 构建 ctx 包装（Proxy——仪具面,不计较逐调用开销;生产 shim 执行器是 B0 二段手写面） */
  wrap(): CanvasRenderingContext2D {
    const self = this;
    return new Proxy(this.target, {
      get(t, prop, recv) {
        const v = Reflect.get(t, prop, t);
        if (typeof v !== 'function') {
          // 属性写面（globalAlpha/gCO/imageSmoothingEnabled…）
          return v;
        }
        return function (this: unknown, ...args: unknown[]) {
          self.observe(String(prop), args);
          return Reflect.apply(v as (this: unknown, ...a: unknown[]) => unknown, t, args);
        };
      },
      set(t, prop, value) {
        const p = String(prop);
        if (p === 'globalCompositeOperation') {
          const mode = String(value);
          self.frame.gco[mode] = (self.frame.gco[mode] || 0) + 1;
          self.classify(DIRECT_GCO.has(mode) ? p : `${p}:${mode}`, DIRECT_GCO.has(mode) ? 'direct' : 'fallback');
        } else if (p === 'globalAlpha') {
          self.classify(p, 'direct');
        } else if (p === 'imageSmoothingEnabled') {
          self.classify('setImageSmoothingEnabled', 'direct');
        } else if (p === 'filter' && String(value) !== 'none') {
          self.classify(`${p}:${String(value).slice(0, 24)}`, 'fallback');
        }
        return Reflect.set(t, prop, value);
      },
    });
  }

  private observe(method: string, args: unknown[]): void {
    if (method === 'save') {
      this.stackDepth++;
      if (this.stackDepth > this.maxStackDepth) this.maxStackDepth = this.stackDepth;
      this.classify(method, 'direct');
      return;
    }
    if (method === 'restore') {
      this.stackDepth = Math.max(0, this.stackDepth - 1);
      this.classify(method, 'direct');
      return;
    }
    if (DIRECT_METHODS.has(method)) {
      if (method === 'drawImage' && args.length !== 3 && args.length !== 5 && args.length !== 9) {
        this.classify(`drawImage:${args.length}arg`, 'fallback');
        return;
      }
      this.classify(method, 'direct');
      return;
    }
    if (method === 'clip') this.classify('clip', 'fallback');   // 静态普查=0,实测兜底
    else if (['fillText', 'strokeText', 'createLinearGradient', 'createRadialGradient',
      'getImageData', 'putImageData', 'beginPath', 'arc', 'stroke', 'fill',
      'setLineDash', 'strokeRect', 'drawPatternish'].includes(method)) {
      this.classify(method, 'fallback');
    } else {
      this.classify(method, 'fallback');
      if (this.rareSamples.length < 8) this.rareSamples.push(`${method}(${args.length}args)`);
    }
    if (method === 'translate' || method === 'scale' || method === 'rotate' || method === 'setTransform') {
      this.classify(method, 'direct');
      return;
    }
  }

  /** 帧界（Renderer 帧尾调用;汇出并重置） */
  endFrame(): void {
    this.frame.maxStackDepth = this.maxStackDepth;
    this.frames.push(this.frame);
    if (this.frames.length > 600) this.frames.shift();   // ~10s@60fps 环形窗
    this.frame = this.blank(++this.frameNo);
    this.maxStackDepth = this.stackDepth;                 // 栈深跨帧延续（restore 配平校验面）
  }

  /** 汇总快照（探针消费面:window.__swGLShim.snapshot()） */
  snapshot(): { frames: ShimCensusFrame[]; rareSamples: string[] } {
    return { frames: this.frames.slice(), rareSamples: this.rareSamples.slice() };
  }
}

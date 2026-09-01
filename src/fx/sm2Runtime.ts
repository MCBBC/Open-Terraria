// SM2 codegen 运行时契约（PR#3）：生成代码与 VM 共享的最小依赖面。
// 只有 sat——保持与 SM2Effect 内历史实现逐字同式(x<0?0:x>1?1:x，含 NaN 透传语义：
// NaN 两比较皆 false → 原样返回，NaN 位型差异由金标网按值类归一处理)。
export function sat(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 生成像素函数签名（与 SM2Effect.execPixel 参数域一一对应）。
 * C=常量库(setupConstants 产物)、R=临时寄存器、T=tex 坐标、V=v0/v1、O=oC0 槽、
 * SAM=出参采样器槽位表、OUT=最终 UNORM 写回缓冲。返回 null=texkill。 */
export type Sm2PxGenFn = (
  C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array,
  O: Float64Array,
  SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>,
  OUT: Float64Array, sm2Scr: Float64Array,
) => boolean | null;

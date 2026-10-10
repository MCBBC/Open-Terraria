/**
 * ★BJ599 手持物潜行减色（BJ595 台账 M3 销案,2026-10-10）。
 *
 * 原版锚（Terarria1457 亲读）：
 *   · PlayerDrawLayers.cs:3589-3605 DrawPlayer_27_HeldItem_ApplyStealthToColor：
 *       flag  = drawUseStyle && playerItem.ranged   // 挥舞中且远程
 *       flag2 = !drawUseStyle & drawHoldStyle       // 静持持位（holdStyle 族）
 *       if (shroomiteStealth && (flag | flag2)) {
 *         s = max(stealth, 0.03f); num2 = (1f + s*10f)/11f;
 *         color = (byte)(R*s),(byte)(G*s),(byte)(B*num2),(byte)(A*s)  // raw 直乘
 *       }
 *       if (setVortex && (flag | flag2)) {
 *         s = max(stealth, 0.03f);
 *         color = color.MultiplyRGBA(new Color(Vector4.Lerp(Vector4.One,
 *                   new Vector4(0f,0.12f,0.16f,0f), 1f - s)));
 *       }
 *     两分支按序串联（套装互斥但实现保留序）；B 通道乘 num2=(1+10s)/11 > s =
 *     蘑菇矿潜行保蓝偏色；星旋 RGB Lerp 向 (0,0.12,0.16) 暗青、A 因子 = Lerp W 分量
 *     = 1−t = s 同乘渐隐（MultiplyRGBA Utils.cs:2116-2120 确乘 A 通道——★C13-F1
 *     翻案:旧注「A 面不动」系 Lerp 目标 W=0 误读为因子 W=1）。
 *   · 调用点（DrawPlayer_27_HeldItem）：drawinfo.itemColor(:3193,主贴图经
 *     heldItem.GetAlpha(itemColor) 消费)、glow color(:3272)、glowMask color3(:3475)、
 *     3788 color4(:3483)、5670/5671 phase(:3506)、火苗 color5(:3574)。
 *   · caller 门（:3188-3191）：drawUseStyle = itemAnimation>0 && useStyle!=0；
 *     drawHoldStyle = holdStyle!=0 && !pulley && CanVisuallyHoldItem。
 *     ★挥舞帧只减 ranged 物（火把挥动帧不减、静持帧减——:3592/3593 原版语义）。
 *   · Utils.cs:2116-2120 MultiplyRGBA：(byte)(a.C*b.C/255f) 逐通道截断；
 *     FNA Color(Vector4)（FNA src/Color.cs:1576-1583）：(byte)Clamp(v*255,0,255) 截断。
 *     ⇒ 星旋因子字节 = floor(255·Lerp 分量),再 MultiplyRGBA 二次 floor(c·b/255)。
 *
 * 本仓前态：光照染色无逐物品管线（itemColor≡White 近似,Renderer.ts:20483 既有
 *   登记）→ 减色面 = 贴图逐通道乘 dimmedWhite；非 255 基色（火苗 color5=100,100,100）
 *   走 applyStealthToColor 逐分支精确重放（shroomite raw 直乘 / vortex 字节乘）。
 *   ★BJ348b-3 判例：ctx.filter 在 shim/acc 态语义不可靠（栅格化/降级分叉）——
 *   减色一律 entry-owned bake（arcanumDimTex 逐像素习语 + tintRGBA 缓存形）,
 *   运行时 drawImage 恒 filter=none 快路径 = shim/acc/GL 三态同结果（无分叉面）。
 */

/** 减色因子族：shroomiteRaw = 原始浮点乘子（(byte)(c·f) 直乘面,非 255 基色用）；
 *  vortexBytes = 已量化因子字节（MultiplyRGBA (byte)(c·b/255) 面,FNA Color(Vector4)
 *  截断后）。未触发/无套/恒等（stealth≥1）→ 整族 null。 */
export interface HeldStealthDim {
  shroomiteRaw: readonly [number, number, number, number] | null;
  vortexBytes: readonly [number, number, number, number] | null;
}

const truncByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.trunc(v));
/** Utils.MultiplyRGBA 核：(byte)(a*b/255f) 截断 */
export const mulByte = (a: number, b: number) => truncByte((a * b) / 255);

/** 触发门 + 逐分支系数（:3591-3605 逐式）。flag|flag2 门在套旗之前（原版序）——
 *  无套不触发、有套但挥舞非远程/静持无持位也不触发。 */
export function heldItemStealthDim(args: {
  stealth: number;
  shroomiteSet: boolean;
  vortexSet: boolean;
  /** itemAnimation>0 && useStyle!=0（挥舞中） */
  drawUseStyle: boolean;
  /** holdStyle!=0 && !pulley && CanVisuallyHoldItem（静持） */
  drawHoldStyle: boolean;
  /** heldItem.ranged */
  ranged: boolean;
}): HeldStealthDim | null {
  const flag = args.drawUseStyle && args.ranged;
  const flag2 = !args.drawUseStyle && args.drawHoldStyle;
  if (!(flag || flag2)) return null;
  if (!args.shroomiteSet && !args.vortexSet) return null;
  const s = args.stealth < 0.03 ? 0.03 : args.stealth;   // :3596/:3604 双支同钳
  if (s >= 1) return null;                               // 恒等档（两族乘子全 1）零bake
  let shroomiteRaw: HeldStealthDim['shroomiteRaw'] = null;
  let vortexBytes: HeldStealthDim['vortexBytes'] = null;
  if (args.shroomiteSet) {
    const num2 = (1 + s * 10) / 11;                      // :3599
    shroomiteRaw = [s, s, num2, s];
  }
  if (args.vortexSet) {
    const k = 1 - s;                                     // Lerp 张量 1-s
    // Lerp(One,(0,0.12,0.16,0),k) = (1-k, 1-0.88k, 1-0.84k, 1-k) → FNA (byte)Clamp(v*255)
    // ★C13-F1：W 分量 = Lerp(1,0,k) = 1-k ≡ s（与 R 同式同源,原版 f32 结构
    //   1f-(1f-num3)）——旧值恒 255 系误读;A 渐隐在深档 = White×[7,37,47,7]
    vortexBytes = [truncByte((1 - k) * 255), truncByte((1 - 0.88 * k) * 255),
      truncByte((1 - 0.84 * k) * 255), truncByte((1 - k) * 255)];
  }
  return { shroomiteRaw, vortexBytes };
}

/** 逐分支精确重放（:3597-3602 raw 直乘 → :3602-3605 字节乘,序=原版）。
 *  输入/输出 = RGBA 字节元组（color.C 面）。 */
export function applyStealthToColor(
  c: readonly [number, number, number, number],
  d: HeldStealthDim,
): [number, number, number, number] {
  let r = c[0], g = c[1], b = c[2], a = c[3];
  if (d.shroomiteRaw) {
    const f = d.shroomiteRaw;
    r = truncByte(r * f[0]); g = truncByte(g * f[1]);
    b = truncByte(b * f[2]); a = truncByte(a * f[3]);
  }
  if (d.vortexBytes) {
    const v = d.vortexBytes;
    r = mulByte(r, v[0]); g = mulByte(g, v[1]);
    b = mulByte(b, v[2]); a = mulByte(a, v[3]);
  }
  return [r, g, b, a];
}

// ===================== entry-owned bake（BJ348b-3 判例） =====================

const dimRegionCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

/** 贴图区域 × 减色因子烘焙（懒烘焙 + 量化键 LRU,tintRGBA BJ595 同缓存形）。
 *  逐像素 arcanumDimTex 习语（getImageData 非预乘面直乘 = 精确字节域）,
 *  零 ctx.filter 面。document 缺席（node 测试）→ null（调用方画原帧自愈）。 */
export function dimmedHeldRegion(
  img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
  dim: HeldStealthDim,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const bytes = applyStealthToColor([255, 255, 255, 255], dim);
  const key = `${sx},${sy},${sw},${sh}|${bytes[0]},${bytes[1]},${bytes[2]},${bytes[3]}`;
  let inner = dimRegionCache.get(img);
  if (!inner) { inner = new Map(); dimRegionCache.set(img, inner); }
  const hit = inner.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const id = c.getImageData(0, 0, sw, sh);
  for (let i = 0; i < id.data.length; i += 4) {
    id.data[i] = mulByte(id.data[i], bytes[0]);
    id.data[i + 1] = mulByte(id.data[i + 1], bytes[1]);
    id.data[i + 2] = mulByte(id.data[i + 2], bytes[2]);
    id.data[i + 3] = mulByte(id.data[i + 3], bytes[3]);   // A 面（shroomite A×s 渐隐）
  }
  c.putImageData(id, 0, 0);
  inner.set(key, cv);
  if (inner.size > 48) {   // LRU：stealth 粗粒度档（0.015/0.04 步）常态 ≤65 键,留头部
    let i = 0;
    for (const k of inner.keys()) { if (i++ > 24) break; inner.delete(k); }
  }
  return cv;
}

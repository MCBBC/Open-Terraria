// 四柱护盾泡视觉（shader 审计遗留修齐批 ①）。
// 原版（Main.cs:24551-24583 四柱 DrawNPC 分支）：
//   盾在（shieldStrength>0）: Images/Misc/Perlin 600² 绕柱画,色=White×(frac×0.8+0.2),
//     scale×(1+num319×0.05),num319=破盾淡入 ai3∈(0,30];ForceField uColor=(1+num319×0.5)
//   破盾波（ai3>0 且盾 0）: num320=ai3/120,num321=min(ai3/30,1),色=Vector4(1−√num321),
//     scale×(1+num321),uColor=2 —— 膨胀淡出冲击波
// pass（PixelShader.cso ForceField）：极坐标 swirl 采 Perlin(s0),c2=rect 半宽,c3=uTime×5,
//   c4=uColor。SM2 直连（getPass('ForceField')+runPassOnImageData,Perlin 为输入 ImageData）,
//   异常回退双层的旋转 Perlin 近似。
import { getPass, runPassOnImageData, defaultUniforms } from './SM2Effect';
import type { Renderer } from '../render/Renderer';

interface ImgData { data: Uint8ClampedArray; width: number; height: number }
const SIZE = 128;
let perlinCache: ImgData | null = null;
let perlinTried = 0;

function perlinData(renderer: Renderer): ImgData | null {
  if (perlinCache) return perlinCache;
  if (performance.now() - perlinTried < 15000) return null;   // 负缓存 15s（vulture 教训）
  perlinTried = performance.now();
  try {
    const img = renderer.atlas?.ensureVImage('vanilla/Perlin.png');
    if (!img || !(img.width > 0)) return null;
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img as CanvasImageSource, 0, 0, SIZE, SIZE);
    const im = cx.getImageData(0, 0, SIZE, SIZE);
    perlinCache = { data: im.data, width: SIZE, height: SIZE };
    return perlinCache;
  } catch {
    return null;
  }
}

let scratch: HTMLCanvasElement | null = null;

export interface ForceFieldOpts {
  cx: number; cy: number;
  radius: number;                    // 泡半径 px（原版 300×scale）
  tint: [number, number, number];    // 柱色（屏幕滤镜近似沿）
  /** 盾量分数 0-1（shieldStrength/max） */
  frac: number;
  /** 破盾波进度 0-1；-1=盾在 */
  breakT: number;
  /** 破盾淡入 num319 0-1（盾刚刷新 30t 内）——-1=不在窗 */
  reformT: number;
  time: number;
}

/** @returns 是否实际绘制（SM2/回退任一） */
export function drawForceFieldBubble(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
  o: ForceFieldOpts,
): boolean {
  const per = perlinData(renderer);
  if (!per) return false;
  const breaking = o.breakT >= 0;
  // 原版包络
  const alpha = breaking
    ? Math.max(0, 1 - Math.sqrt(o.breakT))
    : o.frac * 0.8 + 0.2;
  const grow = breaking ? 1 + o.breakT : 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.05;
  if (alpha <= 0.01) return false;
  const uColor: [number, number, number] = breaking
    ? [2, 2, 2]
    : [1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5, 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5, 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5];

  const pass = getPass('ForceField');
  let drawn = false;
  if (pass) {
    try {
      if (!scratch) scratch = document.createElement('canvas');
      if (scratch.width !== SIZE || scratch.height !== SIZE) { scratch.width = SIZE; scratch.height = SIZE; }
      const scx = scratch.getContext('2d', { willReadFrequently: true });
      if (!scx) return false;
      const frame = scx.createImageData(SIZE, SIZE);
      frame.data.set(per.data);
      const u = defaultUniforms();
      u.uColor = uColor;
      u.uTime = o.time;
      u.uSourceRect = [0, 0, SIZE, SIZE];
      u.uImageSize0 = [SIZE, SIZE];
      runPassOnImageData(pass, frame.data, SIZE, SIZE, u);
      scx.putImageData(frame, 0, 0);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      const r = o.radius * grow * 2;
      ctx.drawImage(scratch, o.cx - r / 2, o.cy - r / 2, r, r);
      ctx.restore();
      drawn = true;
    } catch {
      drawn = false;                                       // SM2 解释失败 → 回退
    }
  }
  if (!drawn) {
    // 回退：双层反向旋转 Perlin（swirl 观感近似）
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
    const r = o.radius * grow * 2;
    for (const dir of [1, -1]) {
      ctx.save();
      ctx.translate(o.cx, o.cy);
      ctx.rotate(o.time * 0.4 * dir);
      ctx.drawImage(
        (renderer.atlas?.ensureVImage('vanilla/Perlin.png') as CanvasImageSource) ?? scratch!,
        -r / 2, -r / 2, r, r);
      ctx.restore();
    }
    ctx.restore();
    drawn = true;
  }
  // 柱色沿（Filters.Scene[key] 屏幕滤镜的泡沿近似）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha * 0.35);
  ctx.strokeStyle = `rgb(${Math.round(o.tint[0] * 255)},${Math.round(o.tint[1] * 255)},${Math.round(o.tint[2] * 255)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.cx, o.cy, o.radius * grow * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return true;
}

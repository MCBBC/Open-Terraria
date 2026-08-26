// 原版 GameShaders.Misc 拖尾族 shader 的 Canvas 复刻（全量 shader 审计战役·旗舰件）。
// 原版管线：VertexStrip.PrepareStripWithProceduralPadding(oldPos,oldRot,…)+DrawTrail()
//   → GameShaders.Misc[pass].Apply()（Main.cs:28617-28690 按 proj.type 分发）。
// pass 数学（PixelShader.cso 反汇编 /tmp/fx-pixel.txt:2705-2806 MagicMissile）：
//   m    = saturate(2×(tex(s2,uvS).r − (u×1.5−0.5)))      // u=横向宽坐标 0..1
//   m   *= tex(s1,uvS).r                                  // 噪声门
//   out  = tex(s0,uv) × m × vColor × uOpacity             // 加算叠画
//   uvS 随时间滚动（preshader c1=f(uTime)，ps.mul_s[1] uSaturation.x,uTime.x）
// FinalFractalVertex（:2808-2879）：mask 同式；s0/s1=UseImage0/1。★锯齿调深链为
//   死代码（c2 未定义恒 0,见 FINAL_FRACTAL_ZIGZAG_DEPTH 定谳注）。绑定表
//   DyeInitializer.cs:461-480（FinalFractal 出手侧被 FinalFractalHelper.cs:185-186
//   覆写为 201/193）：
//   MagicMissile=Extra192/194/193  FlameLash=191/189/190  RainbowRod=195/197/196
//   LightDisc=195/195/252  EmpressBlade(FinalFractalVertex)=209/210/-（s2 缺省白）
// 消费弹型（Main.cs:28616-28668）：34 火鞭/16 魔导弹/121-126+597+1120 宝石弹/
//   106 光棱剑/933+1100 天顶剑日耀刃/946 女皇剑刃。
import type { Renderer } from '../render/Renderer';

export interface TrailPt {
  x: number; y: number;          // 世界坐标（ctx 已在相机系）
  hw: number;                    // 半宽 px
  r: number; g: number; b: number; a: number;   // 顶点色 0-1（沿程已含淡出）
}

type ExtraSet = readonly [string, string, string | null];
const EXTRA_SETS: Record<string, ExtraSet> = {
  MagicMissile: ['vanilla/Extra_192.png', 'vanilla/Extra_194.png', 'vanilla/Extra_193.png'],
  FlameLash: ['vanilla/Extra_191.png', 'vanilla/Extra_189.png', 'vanilla/Extra_190.png'],
  RainbowRod: ['vanilla/Extra_195.png', 'vanilla/Extra_197.png', 'vanilla/Extra_196.png'],
  LightDisc: ['vanilla/Extra_195.png', 'vanilla/Extra_195.png', 'vanilla/Extra_252.png'],
  // ★修齐批：FinalFractalHelper.Draw :180-181 出手侧覆写绑定（非 DyeInitializer 的
  //   195/197）——s0=Extra_201/s1=Extra_193；EmpressBlade 维持 209/210(:478-480)
  FinalFractal: ['vanilla/Extra_201.png', 'vanilla/Extra_193.png', null],
  EmpressBlade: ['vanilla/Extra_209.png', 'vanilla/Extra_210.png', null],
};

interface ImgData { data: Uint8ClampedArray; w: number; h: number }
const imgCache = new Map<string, ImgData | null>();

/** atlas 图 → 像素域缓存（懒加载；失败负缓存防逐帧重试——vulture 教训的 15s 窗口化） */
function extraData(atlas: NonNullable<Renderer['atlas']>, path: string, tMs: number): ImgData | null {
  const hit = imgCache.get(path);
  if (hit !== undefined) return hit;
  const img = atlas.ensureVImage(path);
  if (!img || !(img.width > 0)) {
    if (!imgCache.has(path)) imgCache.set(path, null);
    // 15s 后允许重试（瞬时失败≠永久缺失）
    setTimeout(() => imgCache.delete(path), 15000).unref?.();
    return null;
  }
  try {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    if (!cx) return null;
    cx.drawImage(img as CanvasImageSource, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height);
    const out: ImgData = { data: d.data, w: img.width, h: img.height };
    imgCache.set(path, out);
    return out;
  } catch {
    return null;
  }
}

function sampleAt(im: ImgData | null, u: number, v: number): number {
  if (!im) return 1;
  let uu = u - Math.floor(u), vv = v - Math.floor(v);
  const x = Math.min(im.w - 1, (uu * im.w) | 0);
  const y = Math.min(im.h - 1, (vv * im.h) | 0);
  return im.data[(y * im.w + x) * 4] / 255;
}

let scratch: HTMLCanvasElement | null = null;

/** ★R33 复核定谳（C3）：FinalFractalVertex 字节码的锯齿调深链是【死代码】——
 *  ps `mad r0.x, r0.x, -c2.x, r0.z` 的 c2 既无 def 也不在 CTAB 符号表
 *  （fxPixelShader.json symbols 仅 c0=uOpacity/c1=uShaderSpecificData）→
 *  D3D9 常量默认 (0,0,0,0) → dim = 1 − tri×0 ≡ 1;preshader `SSD.w = 1/SSD.w`
 *  (=0.25) 亦无 ps 消费（c1.w 全 token 零引用）。即原版 FinalFractalVertex
 *  像素输出 ≡ MagicMissile 公式（s0=Extra_201/s1=Extra_193 绑定差异除外），
 *  三角波链（frc+cmp :2822-2825,相位=v×SSD.x=×4）不产生可见调制。
 *  本常量=字节码真值 c2.x=0;参数链保留（波形/相位照算）以便未来发现 c2
 *  真实写入方时一键启用。 */
const FINAL_FRACTAL_ZIGZAG_DEPTH = 0;

export interface TrailSpec {
  /** 'RainbowRod'(宝石弹)/'MagicMissile'(魔导弹)/'FlameLash'/'LightDisc' —— 决定 Extra 组 */
  set: keyof typeof EXTRA_SETS;
  pts: TrailPt[];
  opacity: number;               // uOpacity
  time: number;                  // 秒（滚动相位）
  /** FinalFractalVertex 长度向锯齿强度 0-1（天顶剑/女皇剑用，宝石弹 0） */
  zigzag?: number;
}

/**
 * 条带拖尾：逐像素按 pass 公式合成（条带 bbox 小,每帧 ≤3 万 px,可接受）。
 * 输出以 'lighter' 叠画到 ctx（原版加算混合语义）。返回是否实际绘制。
 */
export function drawStripTrail(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
  spec: TrailSpec,
): boolean {
  const pts = spec.pts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
  if (pts.length < 2) return false;
  const atlas = renderer.atlas;
  if (!atlas) return false;
  const set = EXTRA_SETS[spec.set] ?? EXTRA_SETS.MagicMissile;
  const s0 = extraData(atlas, set[0], performance.now());
  const s1 = extraData(atlas, set[1], performance.now());
  const s2 = set[2] ? extraData(atlas, set[2], performance.now()) : null;

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxHw = 4;
  for (const q of pts) {
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    maxHw = Math.max(maxHw, q.hw);
  }
  const pad = Math.ceil(maxHw + 3);
  const bx = Math.floor(x0 - pad), by = Math.floor(y0 - pad);
  const bw = Math.ceil(x1 - x0) + pad * 2, bh = Math.ceil(y1 - y0) + pad * 2;
  if (bw <= 0 || bh <= 0 || bw > 2048 || bh > 2048) return false;

  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== bw || scratch.height !== bh) { scratch.width = bw; scratch.height = bh; }
  const scx = scratch.getContext('2d');
  if (!scx) return false;
  const frame = scx.createImageData(bw, bh);
  const fd = frame.data;

  const n = pts.length;
  const scrollT = spec.time * 0.35;
  const zz = spec.zigzag ?? 0;
  for (let pyi = 0; pyi < bh; pyi++) {
    const wy = by + pyi + 0.5;
    for (let pxi = 0; pxi < bw; pxi++) {
      const wx = bx + pxi + 0.5;
      // 最近段投影
      let bestD2 = Infinity, bestSeg = -1, bestV = 0, bestU = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = pts[i], b2 = pts[i + 1];
        const ex = b2.x - a.x, ey = b2.y - a.y;
        const len2 = ex * ex + ey * ey;
        const tt = len2 > 1e-6 ? Math.max(0, Math.min(1, ((wx - a.x) * ex + (wy - a.y) * ey) / len2)) : 0;
        const qx = a.x + ex * tt, qy = a.y + ey * tt;
        const ddx = wx - qx, ddy = wy - qy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < bestD2) { bestD2 = d2; bestSeg = i; bestV = (i + tt) / (n - 1); bestU = d2 > 1e-6 ? Math.sign(ddx * -ey + ddy * ex) * Math.sqrt(d2) : 0; }
      }
      if (bestSeg < 0) continue;
      const a = pts[bestSeg], b2 = pts[bestSeg + 1];
      const hw = a.hw + (b2.hw - a.hw) * bestV;
      if (Math.abs(bestU) > hw) continue;
      const uN = bestU / hw * 0.5 + 0.5;                       // 横向 0..1
      // 顶点色插值（两端点色已含沿程淡出）
      const cr = a.r + (b2.r - a.r) * bestV;
      const cg = a.g + (b2.g - a.g) * bestV;
      const cb = a.b + (b2.b - a.b) * bestV;
      const ca = a.a + (b2.a - a.a) * bestV;
      if (ca <= 0.004) continue;
      // pass 数学：噪声门 + 边缘包络
      const uvU = uN + scrollT, uvV = bestV * 0.5 + scrollT * 0.7;
      const gate = sampleAt(s1, uvU, uvV);
      const edge = Math.max(0, Math.min(1, 2 * ((s2 ? sampleAt(s2, uvU, uvV) : gate) - (uN * 1.5 - 0.5))));
      const base = sampleAt(s0, uvV, uvU * 0.5 + scrollT * 0.4);   // s0 底噪（轴对调采样近似投影差）
      // C3：三角波（frc+cmp 链同构）× 字节码真值深度 0（见 FINAL_FRACTAL_ZIGZAG_DEPTH
      // 定谳注）——曾写 sin(v×40+t×6)(波形/频率/时滚三处非同构,且原版本无可见调制)
      const zzPh = bestV * 4;                                  // SSD.x=4（FinalFractalHelper.cs:181）
      const zzTri = Math.abs(((zzPh % 2) + 2) % 2 - 1);
      const zzK = 1 - zz * FINAL_FRACTAL_ZIGZAG_DEPTH * zzTri; // ≡1（死链）
      const k = gate * edge * zzK;
      if (k <= 0.01) continue;
      const o = (pyi * bw + pxi) * 4;
      fd[o] = Math.min(255, base * 255 * cr * k * spec.opacity);
      fd[o + 1] = Math.min(255, base * 255 * cg * k * spec.opacity);
      fd[o + 2] = Math.min(255, base * 255 * cb * k * spec.opacity);
      fd[o + 3] = Math.min(255, 255 * ca * k);
    }
  }
  scx.putImageData(frame, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(scratch, bx, by);
  ctx.restore();
  return true;
}

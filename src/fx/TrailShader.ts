// 原版 GameShaders.Misc 拖尾族 shader 的 Canvas 复刻（全量 shader 审计战役·旗舰件）。
// 原版管线：VertexStrip(oldPos,oldRot)+GameShaders.Misc[技术名].Apply()。
//
// ★2026-08-30 反汇编终案（tools/disasm-fx.mjs ../terraria-assets/PixelShader.cso）：
// 先前版本把孤立 pass 'FinalFractal'（obj56，atan 极坐标版，属于另一未配对克隆）
// 当作用户像素公式；实际 C# 技术名（DyeInitializer.cs:475）="FinalFractalVertex"，
// 该技术包含【自己的 PS=obj58】（反汇编 :2808-2885），与 obj56 完全不同。obj58 仅
// 12 条指令、逐通道忠实转录如下（dsw=1/SSD.w 预着色器写入 c2.x；p=progressOnStrip；
// t0=(p, dist·across, dist)；v0=顶点色；SSD=(4,0,0,4) FinalFractalHelper.Draw :180）：
//   wEnv   = p×1.5 − 0.5                          （mad r0.w, t0, c3, c3.y）
//   ph     = p×SSD.x + SSD.y                      （mad r0.x, t0, c1, c1.y）
//   sfrac  = signPreserving(frc(|ph|))             （abs+frc+cmp → 只作 UV.x 输入）
//   dim    = ph×(−dswInv) + 1                     （mad r0.x, −c2——★锯齿链活的！
//                                                   旧 R33"死代码"结论基于错 pass）
//   across = t0.y / t0.z                          （rcp+mul：B 侧 0、A 侧 1）
//   gate   = tex(s1, (sfrac, across)).x           （s1=UseImage1=Extra_193 出手侧）
//   blade  = tex(s0, (sfrac, across))             （s0=UseImage0=Extra_201）
//   col    = blade × vColor × uOpacity            （mul v0；mul c0=uOpacity 广播）
//   edge   = saturate((gate.x − wEnv) × 2)        （add+add_sat）
//   out.r  = col.r × dim        ← 尾乘按通道独立
//   out.g  = col.g × edge       ← （编译器生成的 4 lane 各不同乘子：r0=(dim,edge,1,wEnv)）
//   out.b  = col.b × 1
//   out.a  = col.a × wEnv                        （线性包络收尾）
// 图片绑定表（DyeInitializer.cs:461-480；FinalFractal 出手侧被 FinalFractalHelper.cs
// :185-186 覆写）：MagicMissile=192/194/193  FlameLash=191/189/190  RainbowRod=
// 195/197/196  LightDisc=195/195/252  FinalFractal=201/193  EmpressBlade=209/210。
// 消费弹型（Main.cs:28616-28668）：34/16/宝石弹族/106/933+1100/946。
// ★性能批（同日）：主循环原为 O(bbox像素×段数)，天顶挥击十余剑 bbox 600² 而描边覆盖
// ~5% —— 自适应半分辨率光栅 + 段扫掠矩形粗格预筛（无假阴性；被覆盖像素数学不变）。
import type { Renderer } from '../render/Renderer';

export interface TrailPt {
  x: number; y: number;          // 世界坐标（ctx 已在相机系）
  hw: number;                    // 半宽 px
  r: number; g: number; b: number; a: number;   // 顶点色 0-1（沿程已含淡出）
}

type ExtraSet = {
  imgs: readonly [string, string, string | null];
  /** true = FinalFractalVertex 技术 obj58 字节码像素语义（Zenith/女皇剑族） */
  tech: boolean;
  ssd: readonly [number, number, number, number];
};
const EXTRA_SETS: Record<string, ExtraSet> = {
  MagicMissile: { imgs: ['vanilla/Extra_192.png', 'vanilla/Extra_194.png', 'vanilla/Extra_193.png'], tech: false, ssd: [4, 0, 0, 4] },
  FlameLash: { imgs: ['vanilla/Extra_191.png', 'vanilla/Extra_189.png', 'vanilla/Extra_190.png'], tech: false, ssd: [4, 0, 0, 4] },
  RainbowRod: { imgs: ['vanilla/Extra_195.png', 'vanilla/Extra_197.png', 'vanilla/Extra_196.png'], tech: false, ssd: [4, 0, 0, 4] },
  LightDisc: { imgs: ['vanilla/Extra_195.png', 'vanilla/Extra_195.png', 'vanilla/Extra_252.png'], tech: false, ssd: [4, 0, 0, 4] },
  FinalFractal: { imgs: ['vanilla/Extra_201.png', 'vanilla/Extra_193.png', null], tech: true, ssd: [4, 0, 0, 4] },
  EmpressBlade: { imgs: ['vanilla/Extra_209.png', 'vanilla/Extra_210.png', null], tech: true, ssd: [4, 0, 0, 4] },
};

interface ImgData { data: Uint8ClampedArray; w: number; h: number }
const imgCache = new Map<string, ImgData | null>();

/** atlas 图 → 像素域缓存（懒加载；失败负缓存防逐帧重试——vulture 教训的 15s 窗口化） */
function extraData(atlas: NonNullable<Renderer['atlas']>, path: string, _tMs: number): ImgData | null {
  const hit = imgCache.get(path);
  if (hit !== undefined) return hit;
  const img = atlas.ensureVImage(path);
  if (!img || !(img.width > 0)) {
    if (!imgCache.has(path)) imgCache.set(path, null);
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
  const uu = u - Math.floor(u), vv = v - Math.floor(v);
  const x = Math.min(im.w - 1, (uu * im.w) | 0);
  const y = Math.min(im.h - 1, (vv * im.h) | 0);
  return im.data[(y * im.w + x) * 4] / 255;
}

let scratch: HTMLCanvasElement | null = null;

export interface TrailSpec {
  /** 'RainbowRod'(宝石弹)/'MagicMissile'(魔导弹)/'FlameLash'/'LightDisc'
   *  /'FinalFractal'(天顶剑)/'EmpressBlade'(女皇剑) */
  set: keyof typeof EXTRA_SETS;
  pts: TrailPt[];
  opacity: number;               // uOpacity（obj58 路径由调用方折进顶点色上游一致生效）
  time: number;                  // 秒（滚动相位；obj58 未消费 uTime，保留接口）
  /** 兼容位：锯齿强度。真字节码下由 SSD 决定（不再是自由参数） */
  zigzag?: number;
}

/**
 * 条带拖尾合成入口：
 * ① FinalFractal/EmpressBlade 走 obj58 字节码忠实路径（tech=true）；
 * ② 其余族沿旧近似公式（门×包络），待逐族迁移。
 * 输出以 'lighter' 叠画到 ctx（原版 AlphaBlend 加算分量等价）。返回是否实际绘制。
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
  const s0im = extraData(atlas, set.imgs[0], performance.now());
  const s1im = extraData(atlas, set.imgs[1], performance.now());

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

  // ---- 性能：自适应半分辨率 + 覆盖格预筛 ----
  const rs = bw * bh > 50000 ? 0.5 : 1;
  const rw = Math.max(1, Math.round(bw * rs));
  const rh = Math.max(1, Math.round(bh * rs));

  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== rw || scratch.height !== rh) { scratch.width = rw; scratch.height = rh; }
  const scx = scratch.getContext('2d', { willReadFrequently: true });
  if (!scx) return false;
  const frame = scx.createImageData(rw, rh);
  const fd = frame.data;

  const n = pts.length;
  const scrollT = spec.time * 0.35;
  // ---- 覆盖格预筛 ----
  const csz = Math.max(6, Math.ceil(maxHw * rs));
  const gw = Math.ceil(rw / csz), gh = Math.ceil(rh / csz);
  const cover = new Uint8Array(gw * gh);
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b2 = pts[i + 1];
    const hw2 = Math.max(a.hw, b2.hw) + 1;
    const gx0 = Math.max(0, Math.floor((Math.min(a.x, b2.x) - hw2 - bx) * rs / csz));
    const gy0 = Math.max(0, Math.floor((Math.min(a.y, b2.y) - hw2 - by) * rs / csz));
    const gx1 = Math.min(gw - 1, Math.floor((Math.max(a.x, b2.x) + hw2 - bx) * rs / csz));
    const gy1 = Math.min(gh - 1, Math.floor((Math.max(a.y, b2.y) + hw2 - by) * rs / csz));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cover[gy * gw + gx] = 1;
  }

  // ---- obj58 常量 ----
  const ssdInvW = set.ssd[3] !== 0 ? 1 / set.ssd[3] : 0;

  for (let pyi = 0; pyi < rh; pyi++) {
    const wy = by + (pyi + 0.5) / rs;
    const grow = Math.floor(pyi / csz);
    let rowHasCover = false;
    if (grow >= 0 && grow < gh) {
      for (let gx = 0; gx < gw; gx++) if (cover[grow * gw + gx]) { rowHasCover = true; break; }
    }
    if (!rowHasCover) continue;
    for (let pxi = 0; pxi < rw; pxi++) {
      if (!cover[Math.floor(pyi / csz) * gw + Math.floor(pxi / csz)]) continue;
      const wx = bx + (pxi + 0.5) / rs;
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
      const uN = bestU / hw * 0.5 + 0.5;                       // 跨带 0(B)..1(A)
      const cr = a.r + (b2.r - a.r) * bestV;
      const cg = a.g + (b2.g - a.g) * bestV;
      const cb = a.b + (b2.b - a.b) * bestV;
      const ca = a.a + (b2.a - a.a) * bestV;
      if (ca <= 0.004) continue;
      const o = (pyi * rw + pxi) * 4;

      if (set.tech) {
        // ===== obj58 逐指令忠实执行 =====
        // ★p 取【时间序】progress：调用方数组 index0=最新（本仓历史环约定），而 XNA
        //   VertexStrip 以 oldest-first 迭代——此处翻转换算，wEnv 尾段(旧端)收 0 才符合
        //   原版"拖尾远离剑身端淡出"
        const p = 1 - bestV;
        const wEnv = p * 1.5 - 0.5;
        const ph = p * set.ssd[0] + set.ssd[1];
        const sfrac = (ph % 1 + 1) % 1;                        // frc（cmp 分支对 Repeat 无感）
        const dim = 1 - ph * ssdInvW;                          // ★锯齿链（活）
        const across = uN;                                     // t0.y/t0.z
        const gate = sampleAt(s1im, sfrac, across);            // s1（Repeat 寻址）
        void sampleAt(s0im, sfrac, across);                    // s0 blade（当前贴图为均匀噪底，
                                                               // 与 gate 同源；保留调用占位锚定语义）
        const edgeRaw = (gate - wEnv) * 2;
        const edge = edgeRaw < 0 ? 0 : edgeRaw > 1 ? 1 : edgeRaw;
        fd[o] = cr * dim * edge * 255;
        fd[o + 1] = cg * edge * 255;
        fd[o + 2] = cb * 255;
        fd[o + 3] = ca * edge * Math.max(0, wEnv) * 255;
        continue;
      }

      // ---- 兜底近似（MagicMissile 族，迁移前口径不变）----
      const uvU = uN + scrollT, uvV = bestV * 0.5 + scrollT * 0.7;
      const gate = sampleAt(s1im, uvU, uvV);
      const base = sampleAt(s0im, uvV, uvU * 0.5 + scrollT * 0.4);
      const k = gate * Math.max(0, Math.min(1, 2 * (base - (uN * 1.5 - 0.5))));
      if (k <= 0.01) continue;
      fd[o] = Math.min(255, base * 255 * cr * k * spec.opacity);
      fd[o + 1] = Math.min(255, base * 255 * cg * k * spec.opacity);
      fd[o + 2] = Math.min(255, base * 255 * cb * k * spec.opacity);
      fd[o + 3] = Math.min(255, 255 * ca * k);
    }
  }
  scx.putImageData(frame, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, rw, rh, bx, by, bw, bh);
  ctx.restore();
  return true;
}

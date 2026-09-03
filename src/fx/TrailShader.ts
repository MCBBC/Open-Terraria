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
import { defaultUniforms, getPass, sampleImageInto, type SM2Pass, type SM2SamplerOut } from './SM2Effect';

export interface TrailPt {
  x: number; y: number;          // 世界坐标（ctx 已在相机系）
  hw: number;                    // 半宽 px
  /** 顶点旋转（刃轴向，AddVertexPair 截面 = (rot−π/2) 向；缺省按相邻点走向推导） */
  rot?: number;
  r: number; g: number; b: number; a: number;   // 顶点色 0-1（沿程已含淡出）
}

type ExtraSet = {
  imgs: readonly [string, string, string | null];
  /** true = FinalFractalVertex 技术 obj58 字节码像素语义（Zenith/女皇剑族） */
  tech: boolean;
  ssd: readonly [number, number, number, number];
  /** ★2026-09-03 SM2 字节码档：走 obj55 "MagicMissile" pass（SM2Effect 解释器/
   *  codegen 逐像素执行）。值 = Drawer.UseSaturation 钉值（FlameLashDrawer.cs:16
   *  =-2f；MagicMissileDrawer.cs:15/RainbowRodDrawer.cs:15/LightDiscDrawer.cs:15
   *  =-2.8f）——uSaturation 经 D3DX preshader 与 uTime 合成 s2 噪声层滚动相位
   *  （preshader syms=[uSaturation,uTime] 写回 c1.x,主 shader `add r0,T0.x,C[4]`
   *  消费）,不是颜色饱和度。undefined = 沿旧兜底近似公式。 */
  sm2?: number;
};
export const EXTRA_SETS: Record<string, ExtraSet> = {
  MagicMissile: { imgs: ['vanilla/Extra_192.png', 'vanilla/Extra_194.png', 'vanilla/Extra_193.png'], tech: false, ssd: [4, 0, 0, 4], sm2: -2.8 },
  FlameLash: { imgs: ['vanilla/Extra_191.png', 'vanilla/Extra_189.png', 'vanilla/Extra_190.png'], tech: false, ssd: [4, 0, 0, 4], sm2: -2 },
  RainbowRod: { imgs: ['vanilla/Extra_195.png', 'vanilla/Extra_197.png', 'vanilla/Extra_196.png'], tech: false, ssd: [4, 0, 0, 4], sm2: -2.8 },
  LightDisc: { imgs: ['vanilla/Extra_195.png', 'vanilla/Extra_195.png', 'vanilla/Extra_252.png'], tech: false, ssd: [4, 0, 0, 4], sm2: -2.8 },
  FinalFractal: { imgs: ['vanilla/Extra_201.png', 'vanilla/Extra_193.png', null], tech: true, ssd: [4, 0, 0, 4] },
  EmpressBlade: { imgs: ['vanilla/Extra_209.png', 'vanilla/Extra_210.png', null], tech: true, ssd: [4, 0, 0, 4] },
};

// ---------- obj55 "MagicMissile" pass（SM2 字节码）帧级执行上下文 ----------
// 四个 Misc 拖尾技术（MagicMissile/FlameLash/RainbowRod/LightDisc）在 DyeInitializer
// （Terarria1458/Terraria.Initializers/DyeInitializer.cs:461-484）全部指向同一
// pixelShaderRef 技术 "MagicMissile"（obj55,23 tokens/17 实指令/3 texld）——只换
// 三张噪声贴图。codegen 产物 px_MagicMissile.gen.ts 已在位（SM2_CODEGEN 缺省开）。
let mmPassCache: SM2Pass | null | undefined;   // undefined=尚未取
function magicMissilePass(): SM2Pass | null {
  if (mmPassCache === undefined) mmPassCache = getPass('MagicMissile');
  return mmPassCache;
}

/** LinearWrap 采样器（MiscShaderData.cs:110 SamplerState.LinearWrap——Misc 族
 *  uImage0/1/2 全走 wrap;染料 s0 的 LinearClamp 与此不同源）。双线性滤波由
 *  SM2Effect.sampleImageInto 承担（与染料侧同实现,不另造滤波器）。 */
function wrapSampler(im: ImgData | null): SM2SamplerOut {
  return (u: number, v: number, out: Float64Array): void => {
    if (!im) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 1; return; }
    sampleImageInto(im.data, im.w, im.h, u, v, true, out);
  };
}

interface SM2FrameCtx {
  pass: SM2Pass;
  c: Float64Array; regs: Float64Array; tex: Float64Array;
  v0: Float64Array; o: Float64Array;
  smp: Array<SM2SamplerOut | undefined>;
}
/** 帧级准备：setupConstants 一次（uOpacity/uSaturation/uTime 常量化+preshader 求值）。
 *  三张噪声贴图任一未就位 → null（调用侧回退兜底近似,首帧懒加载自愈）。 */
function sm2FrameCtx(set: ExtraSet, opacity: number, timeSec: number,
  s0im: ImgData | null, s1im: ImgData | null, s2im: ImgData | null): SM2FrameCtx | null {
  const pass = magicMissilePass();
  if (!pass || !s0im || !s1im || !s2im) return null;
  const u = defaultUniforms();
  u.uOpacity = opacity;
  u.uSaturation = set.sm2 ?? 1;
  u.uTime = timeSec;                       // Main.GlobalTimeWrappedHourly（秒,%3600）
  return {
    pass,
    c: pass.setupConstants(u),
    regs: new Float64Array(128),           // r0..r31
    tex: new Float64Array(32),             // t0..（T[0]=p,T[1]=across×d,T[2]=d 由像素级写）
    v0: new Float64Array(8),
    o: new Float64Array(4),
    smp: [wrapSampler(s0im), wrapSampler(s1im), wrapSampler(s2im), undefined],
  };
}

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
    const cx = cv.getContext('2d', { willReadFrequently: true });
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

/** GL 纹理源直连加载器：绕开 atlas.ensureVImage 的 createImageBitmap 异步升级链
 *  （重负载下升级排队数秒，GL 分支整段退化 CPU 光栅 = 卡顿；2026-08-30 实测定罪：
 *  probe 中 ensureVImage 6 秒窗口全程 pending 而直连 Image 数毫秒落地）。
 *  独立缓存：status pending→ok；失败 10s 重试。 */
const rawImgs = new Map<string, { img: HTMLImageElement | null; failedAt: number }>();
function ensureRawImg(path: string): HTMLImageElement | null {
  const hit = rawImgs.get(path);
  if (hit) {
    if (hit.img) return hit.img;
    if (performance.now() - hit.failedAt > 10_000) rawImgs.delete(path);
    else return null;
  }
  const rec = { img: null as HTMLImageElement | null, failedAt: 0 };
  rawImgs.set(path, rec);
  const im = new Image();
  im.onload = () => {
    // ★2026-09-02 月牙形态翻案：Extra_201/209 的 16×16 裁剪+黑底键控【整体撤销】。
    //   当年"内容仅底左角 16×16"系误诊——磁盘文件（=terraria-assets 原件逐字节
    //   一致，PIL/浏览器双读）实为 512² 全幅、alpha 恒 255：内容=底左角亮扇形
    //   （rows 204-510 × cols 0-359，per-row/col max lum 单调渐变），XNA 侧正是
    //   全范围采样该扇形得【截面亮外缘 + 4 次 sfrac 波纹】的宽月牙；裁剪把扇形
    //   压进 16×16 = 只剩一条细亮纹（"细螺旋线"根因）。黑十字之病根在本层曾用
    //   预乘 over 混合——rgb=0∧a>0 的暗 texel 压暗背景；现 trailStrip 改真加算
    //   (ONE,ONE)+主链 'lighter' 合成（=XNA BlendState.Additive 语义），暗 texel
    //   贡献恒 0，无需键控。贴图一概原样直传（与 XNA Texture2D 同口径）。
    rec.img = im;
  };
  im.onerror = () => { rec.failedAt = performance.now(); };
  im.src = `sprites/${encodeURI(path)}`;
  return null;
}

/** 进世界预热：把六组 Extra 贴图在【 load 早期】钉进 atlas（+ raw 直连链）。
 *  痛点：draw 时才懒加载会撞上 atlas.createImageBitmap 升级排队（重负载数秒），
 *  期间 GL 分支拿不到图 → 整段退化 CPU 光栅 = 挥剑即卡。afterWorldLoad 调用。 */
export function prewarmTrailTextures(atlas: NonNullable<Renderer['atlas']>): void {
  const seen = new Set<string>();
  for (const set of Object.values(EXTRA_SETS)) {
    for (const path of set.imgs) {
      if (!path || seen.has(path)) continue;
      seen.add(path);
      try { atlas.ensureVImage(path); } catch { /* 预热失败不影响绘制链 */ }
      ensureRawImg(path);
    }
  }
}

export interface TrailSpec {
  /** 'RainbowRod'(宝石弹)/'MagicMissile'(魔导弹)/'FlameLash'/'LightDisc'
   *  /'FinalFractal'(天顶剑)/'EmpressBlade'(女皇剑) */
  set: keyof typeof EXTRA_SETS;
  pts: TrailPt[];
  opacity: number;               // uOpacity（obj58 路径由调用方折进顶点色上游一致生效）
  time: number;                  // 秒（滚动相位；obj58 未消费 uTime，保留接口）
  /** 兼容位：锯齿强度。真字节码下由 SSD 决定（不再是自由参数） */
  zigzag?: number;
  /** 原版 VertexStrip.PrepareStrip 第 6 参 expectedVertexPairsAmount（:55-63）：
   *  progressOnStrip = i/(该值−1)——【与实际点数无关】（天顶剑恒传 oldPos.Length=60，
   *  幼剑/裁剪点数后 progress 仍按 /59 摊，短条带只到 p=(n−1)/59 不到 1）。缺省回退
   *  实际点数（旧口径）。 */
  expectedPairs?: number;
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
  const s2im = set.imgs[2] ? extraData(atlas, set.imgs[2], performance.now()) : null;
  // obj55 SM2 字节码帧级上下文（贴图未就位=首帧懒加载窗 → null,走兜底近似回退）
  const sm2f = set.sm2 !== undefined
    ? sm2FrameCtx(set, spec.opacity, spec.time, s0im, s1im, s2im)
    : null;

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
        // ===== GL 路径：obj58 语义整条交给 GPU（极光同教训——CPU 硬画预乘/混合
        // 语义对不齐且慢；此处顶点交错后一次 drawElements，主链每帧单次合成）。
        // p 沿 XNA 约定：pts[0] = 最新（[0]=newest），p=0 为刃后最近段。
        // ?trailgl=0 = 逃生门（SwiftShader/驱动白名单问题强制 CPU 路径）
        // ★dbg 声明必须先于任何 dbg() 调用——曾因 TDZ 在首像素抛
        //   ReferenceError 且被调用方静默 catch = 整条拖尾消失（2026-08-30 定罪）
        const dbgOn = (() => { try { return new URLSearchParams(location.search).has('traildbg'); } catch { return false; } })();
        const dbg = (why: string): void => { if (dbgOn) { const w = (renderer as unknown as { __trailDbg?: Record<string, number> }).__trailDbg ??= {}; w[why] = (w[why] ?? 0) + 1; } };
        dbg('tech-enter');
        const glfx = (() => {
          try {
            if (new URLSearchParams(location.search).get('trailgl') === '0') { dbg('gate-off'); return null; }
          } catch { /* 非浏览器环境 */ }
          const g = renderer.acquireGL();
          if (!g) dbg('no-glfx');
          return g;
        })();
        const img0 = ensureRawImg(set.imgs[0]);
        const img1 = ensureRawImg(set.imgs[1]);
        if (!img0) dbg('no-img0');
        if (!img1) dbg('no-img1');
        if (glfx && img0 && img1 && img0.width > 0 && img1.width > 0) {
          const vW = Math.max(2, Math.round(renderer.glViewW));
          const vH = Math.max(2, Math.round(renderer.glViewH));
          glfx.resize(vW, vH);
          // zoom 透传（Camera.zoom 默认 1.25——世界按 z 落画布，条带 clip 同乘）
          glfx.trailFrameBegin(vW, vH, renderer.glCamX, renderer.glCamY,
            (renderer as unknown as { glZoom?: number }).glZoom ?? 1);
          const t0e = glfx.texFromImage(`trail:${set.imgs[0]}`, img0 as unknown as TexImageSource, false, true, true);
          const t1e = glfx.texFromImage(`trail:${set.imgs[1]}`, img1 as unknown as TexImageSource, false, true, true);
          if (!t0e || !t1e) dbg('tex-upload-null');
          if (t0e && t1e) {
            const m = pts.length;
            const verts = new Float32Array(m * 2 * 9);
            const idx = new Uint16Array((m - 1) * 12);
            const op = spec.opacity;
            const pairs = spec.expectedPairs ?? m;   // :55-63 分母=期望对数−1（≠实际点数）
            for (let i = 0; i < m; i++) {
              const q = pts[i];
              const rot = q.rot
                ?? (i + 1 < m ? Math.atan2(pts[i + 1].y - q.y, pts[i + 1].x - q.x)
                  : i > 0 ? Math.atan2(q.y - pts[i - 1].y, q.x - pts[i - 1].x) : 0);
              const dxC = Math.cos(rot - Math.PI / 2) * q.hw;
              const dyC = Math.sin(rot - Math.PI / 2) * q.hw;
              const prog = pairs > 1 ? i / (pairs - 1) : 0;   // XNA [0]=newest ⇒ p=0 刃后最近段
              const d = q.hw * 2;
              const b = i * 18;
              // A 侧(+widthDir)：progress=p；B 侧：progress=0（VertexStrip 语义）
              verts[b] = q.x + dxC; verts[b + 1] = q.y + dyC;
              verts[b + 2] = q.r * op; verts[b + 3] = q.g * op; verts[b + 4] = q.b * op; verts[b + 5] = q.a * op;
              verts[b + 6] = prog; verts[b + 7] = d; verts[b + 8] = d;
              const b2 = b + 9;
              verts[b2] = q.x - dxC; verts[b2 + 1] = q.y - dyC;
              verts[b2 + 2] = q.r * op; verts[b2 + 3] = q.g * op; verts[b2 + 4] = q.b * op; verts[b2 + 5] = q.a * op;
              verts[b2 + 6] = 0; verts[b2 + 7] = 0; verts[b2 + 8] = d;
            }
            for (let k = 0; k < m - 1; k++) {
              const v = k * 2, j = k * 12;
              // PrepareIndices 正面 + 背面（includeBacksides=true, :93-116）
              idx[j] = v; idx[j + 1] = v + 1; idx[j + 2] = v + 2;
              idx[j + 3] = v + 2; idx[j + 4] = v + 1; idx[j + 5] = v + 3;
              idx[j + 6] = v + 2; idx[j + 7] = v + 1; idx[j + 8] = v;
              idx[j + 9] = v + 2; idx[j + 10] = v + 3; idx[j + 11] = v + 1;
            }
            glfx.trailStrip(t0e, t1e, verts, idx, set.ssd);
            return true;
          }
        }
        // GL 不可用 → CPU obj58 退化（半分辨率+覆盖格已限流）
        // ===== obj58 逐指令忠实执行 =====
        // ★p 方向：XNA oldPos[0]=最新（Projectile.cs:15841 压栈序），VertexStrip 从
        //   i=0 迭代（:59-63）⇒ p=0 在【剑侧】；ptsFS[0]=最新 ⇒ p=bestV 直取
        //   （曾反转为 1−bestV = 包络方向颠倒：剑侧渐隐、尾端全亮，2026-09-02 勘误）。
        //   分母按 expectedPairs−1（:55-63 恒定，与实际点数无关）。
        const pairs = spec.expectedPairs ?? n;
        const p = pairs > 1 ? Math.min(1, bestV * (n - 1) / (pairs - 1)) : 0;
        const wEnv = p * 1.5 - 0.5;
        const ph = p * set.ssd[0] + set.ssd[1];
        const sfrac = (ph % 1 + 1) % 1;                        // frc（cmp 分支对 Repeat 无感）
        const dim = 1 - ph * ssdInvW;                          // ★锯齿链（活）
        const across = uN;                                     // t0.y/t0.z
        const gate = sampleAt(s1im, sfrac, across);            // s1（Repeat 寻址）
        const blade = sampleAt(s0im, sfrac, across);           // s0 全幅扇形贴图（截面+4 波纹本体）
        const edgeRaw = (gate - wEnv) * 2;
        const edge = edgeRaw < 0 ? 0 : edgeRaw > 1 ? 1 : edgeRaw;
        const aOut = ca * edge * Math.max(0, wEnv);            // out.a = col.a×edge×wEnv
        if (aOut <= 0.004) continue;
        // out.rgb = blade×vColor×lane(dim,edge,1)（含 obj58 第 16 指令 edge 标量广播）；
        // XNA 设备混合贡献 = out.rgb 全量直加（(One,One) 语义，见 GLSpriteLayer TRAIL_FS
        // 注）→ 'lighter' 直加不预乘。★alpha 写 255（2026-09-03 premul 陷阱定罪：
        // 旧 a=0 被真实 canvas 的 premul 内部表示吞光——putImageData 后 rgb'=rgb×a/255=0，
        // drawImage('lighter') 加 0 = CPU 退化路径整条带不可见;实机探针 probe4 实证
        // a=0→[0,0,0]/a=255→[200,0,100]。rgb 全额通过须 a=255;dst.a+=255 的主画布
        // alpha 抬升无观感面——主画布每帧 opaque 底）
        fd[o] = blade * cr * edge * dim * 255;
        fd[o + 1] = blade * cg * edge * edge * 255;
        fd[o + 2] = blade * cb * edge * 255;
        fd[o + 3] = 255;
        continue;
      }

      // ---- obj55 "MagicMissile" pass SM2 字节码逐像素执行（2026-09-03）----
      //  t0 = XNA VertexStrip 顶点 CustomData 流的像素插值：A 侧 (p, d, d)、B 侧
      //  (0, 0, d)（GL verts 路径同构,见上方 tech 分支 verts 布局）→
      //  T[0]=p、T[1]=across×d、T[2]=d。p 方向：pts[0]=最新（strip.unshift 压栈序
      //  与 XNA oldPos[0] 同），分母=expectedPairs−1（VertexStrip :55-63 语义）。
      //  execPixel 的 t0x/t0y 形参只覆写 tex[0]/[1]，T[2] 由预写 tex[2] 传入
      //  （codegen 生成体 instr#2 `1/T[2]` 与 VM bindFile case 3 同读 tex 数组）。
      //  输出 oC0 已 UNORM sat——XNA (One,One) 加算 → 'lighter' 直加。★alpha 写
      //  255（premul 陷阱同 tech 分支注,probe4 实证）。
      if (sm2f) {
        const pairs = spec.expectedPairs ?? n;
        const p = pairs > 1 ? Math.min(1, bestV * (n - 1) / (pairs - 1)) : 0;
        const d = hw * 2;
        sm2f.tex[2] = d;
        sm2f.tex[3] = 0;
        sm2f.v0[0] = cr; sm2f.v0[1] = cg; sm2f.v0[2] = cb; sm2f.v0[3] = ca;
        const res = sm2f.pass.execPixel(sm2f.c, sm2f.regs, sm2f.tex, sm2f.v0, sm2f.o,
          p, uN * d, sm2f.smp);
        if (res) {
          fd[o] = res[0] * 255;
          fd[o + 1] = res[1] * 255;
          fd[o + 2] = res[2] * 255;
          fd[o + 3] = 255;
        }
        continue;
      }

      // ---- 兜底近似（obj55 字节码/三贴图未就位时的回退,首帧懒加载后自愈）----
      //  ★alpha 同 premul 陷阱修（rgb 已含全部折算,旧 a=ca*k 是第二次折算:
      //  premul 内部 rgb'=rgb×a/255 → 实际加成被多乘一次 ca*k/255=偏暗）
      const uvU = uN + scrollT, uvV = bestV * 0.5 + scrollT * 0.7;
      const gate = sampleAt(s1im, uvU, uvV);
      const base = sampleAt(s0im, uvV, uvU * 0.5 + scrollT * 0.4);
      const k = gate * Math.max(0, Math.min(1, 2 * (base - (uN * 1.5 - 0.5))));
      if (k <= 0.01) continue;
      fd[o] = Math.min(255, base * 255 * cr * k * spec.opacity);
      fd[o + 1] = Math.min(255, base * 255 * cg * k * spec.opacity);
      fd[o + 2] = Math.min(255, base * 255 * cb * k * spec.opacity);
      fd[o + 3] = 255;
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

// ★B2 shim 执行器（2026-09-24;B0 GLShimCensus 普查仪具的执行面落地）——
// 实体/弹/掉落/尘族经 Canvas2D 兼容层把 drawImage 3/5/9 参翻译成 GL quad，
// 发射进共管管线 FBO('world') 段（B1 bglStageGrid 同租同式），present 回贴
// worldCanvas——compositeLight 全屏乘光路径零改动（B2b worldCanvas 退役边界
// 见任务报告）。沿 B0 census 形态：ctx 包装器+旗标激活（riding ?bgl=1），
// 不支持算子→该精灵 flush 后保 2D 热路径（族级回退=census 口径）。
//
// 【混合档语义定谳（本文件正确性的根，实现前亲读 Renderer.drawVanillaDustPremul/
// drawVanillaDustPass/dustPremulBake 源码）】
//  · SO（source-over）批：FBO 清透明→quad(ONE,1−SA) 预乘→end present→2D
//    source-over 回贴。source-over 结合律（(A over ∅) over B ≡ A over B,预乘域）
//    ⇒ 与逐精灵直画 worldCanvas 逐位同（B1 已验证的同构论证）。
//  · ADD（lighter）批：FBO 清透明→quad(ONE,ONE) 逐加（8bit 目标逐 quad 钳,
//    与 2D 逐 drawImage 钳同构）→end present→2D gCO='lighter' 回贴＝整批一次
//    加算，加法交换律 ⇒ 与逐精灵 'lighter' 直画逐位同。
//  · 尘预乘对（destination-out erase + lighter add 两步）：合并单 quad
//    （rgb=预乘 add 面,a=erase e,dustPremulBake.gl 字节）走 SO 批——
//    out = src + dst×(1−e) 恰为两步合式（中间舍入差 ≤1LSB,登记）；
//    后随 add drawImage 判定吞掉（pair 吞抑,见 drawDustPremul 调用形状）。
//    m≠e 亮点位 α 偏差 ≤(m−e)×mul（α 只影响天空透出,census 有界登记）。
//  · 跨档序偏差（唯一登记项）：2D 里 ADD 精灵先画、SO 精灵后画时，SO 的
//    dst 衰减会吃到已加的 ADD 贡献；GL 固定 SO 批先 present——ADD 贡献不被
//    后续 SO 的 (1−a) 衰减。仅「同像素同时被两档精灵覆盖」可见（census 有界）。
//
// 【字节纪律】整数坐标/整数缩放路径逐字节（tie ε=quadExact 同款）；
// 分数路径（zoom 1.25 实体常态）= B1 Skia tie 定谳的 census 有界口径逐族登记。
// 矩阵镜像逐算子 Math.fround 复刻 Skia f32 拼接（每元素两积一和,与
// SkMatrix::setConcat 同构;和内单次舍入差 ≤1e-7 相对,census 口径）。
import type { GLSpriteLayer, TexEntry } from '../GLSpriteLayer';
import { texId } from '../texId';

/** 宿主接口（Renderer 注入;flush 所需的世界层现场） */
export interface ShimHost {
  acquireGl(): GLSpriteLayer | null;
  worldCtx(): CanvasRenderingContext2D | null;
  worldW(): number;
  worldH(): number;
  /** ★B2b 累积态降级（可选）：把当帧从 acc 切到 bridge——惰性建 worldCanvas、
   *  present FBO('world')→worldCanvas、本执行器 re-bridge 到真 2D ctx。
   *  返回 false=无法降级（调用方弃队列）。触发面=acc 窗内 GL 死亡/
   *  不可栅格化算子（strokeRect 之外的落笔长尾）。 */
  degradeAcc?(): boolean;
}

/** 单 quad 记录（池化;同时携带 2D 重放面——flush 遇 GL 失败逐条原样回放） */
interface QuadRec {
  tier: 0 | 1;                        // 0=SO 1=ADD(lighter)
  img: CanvasImageSource | null;      // 2D 重放源（solid 面为 null）
  solid: boolean;                     // fillRect 纯色面（白纹理+tint）
  a: number[];                        // 归一化 9 参 [img?忽略, sx,sy,sw,sh, dx,dy,dw,dh]（重放用原参形态存 raw 参）
  raw: unknown[] | null;              // 原始 drawImage 实参（重放面）
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
  rot: number; alpha: number;
  fr: number; fg: number; fb: number;
  flipX: boolean; flipY: boolean; smooth: boolean;
  dynamic: boolean;                   // 动态源:flush 期 texRefresh 重传
  pair: PairReg | null;               // 尘预乘对合并纹理记录
  /** ★UV 空间分道（2026-09-24 角色透明案定谳修正）:region=裁剪小纹理(UV=0,0,sw,sh)
   *  /full=全画布纹理(UV=sx,sy,sw,sh=页内矩形)/pair=尘对合并面(UV=0,0,w,h)。
   *  曾把页内矩形直接喂裁剪纹理 → UV 出界 CLAMP=大面积透明/常量色块（用户实报案）。 */
  texKind: 'region' | 'full' | 'pair';
  next: QuadRec | null;               // 池链
}

/** 尘预乘对登记（Renderer.dustPremulPair 烘焙时注册） */
interface PairReg {
  w: number; h: number;
  gl: Uint8Array;                     // 合并字节（rgb=预乘 add,a=erase e）
  tex: TexEntry | null;               // 惰性建（首 flush）
  add: HTMLCanvasElement;             // 吞抑标记（后随 add drawImage）
}

export interface ShimExecStats {
  draws: number;        // 窗内 drawImage 总数
  emitSO: number;       // SO quad 发射
  emitADD: number;      // ADD quad 发射
  pairEmitted: number;  // 尘预乘对合并 quad
  pairSuppressed: number;
  fallback: number;     // 2D 回退（flush+raw）
  flushes: number;      // FBO present 次数
  uploads: number;      // 纹理（重）上传
  replays: number;      // GL 失败 2D 重放
}

const fround = Math.fround;

/** 常用 CSS 颜色解析缓存（fillRect 面;键=fillStyle 原串） */
const colorCache = new Map<string, readonly [number, number, number, number]>();

function parseColor(s: string): readonly [number, number, number, number] | null {
  const hit = colorCache.get(s);
  if (hit) return hit;
  let out: readonly [number, number, number, number] | null = null;
  const mRgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (mRgba) {
    out = [+mRgba[1], +mRgba[2], +mRgba[3], mRgba[4] === undefined ? 1 : +mRgba[4]];
  } else if (s.charCodeAt(0) === 35 /* # */) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      out = [
        parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16), hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1,
      ];
    } else if (hex.length === 6 || hex.length === 8) {
      out = [
        parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16),
        hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }
  if (colorCache.size > 512) colorCache.clear();
  colorCache.set(s, out ?? [0, 0, 0, 0]);
  return out;
}

/** 窗内白名单外的「会落笔」2D 算子（Proxy 长尾;命中=先 flush 再委托） */
const DRAWING_TAIL = new Set([
  'putImageData', 'fillText', 'strokeText', 'stroke', 'fill', 'strokeRect', 'clearRect',
  'drawFocusIfNeeded', 'fillText2',
]);

export class GLShimExecutor {
  private host: ShimHost;
  private raw: CanvasRenderingContext2D | null = null;
  private glw: GLSpriteLayer | null = null;
  /** 窗口激活中（attach..detach） */
  active = false;
  /** ★B2b 累积态（2026-09-24）：'acc'=整层单 FBO 累积（无 raw 2D 面——quad 依
   *  发射序逐条混合进 FBO('world'),flush 只发射不 present;不可表达算子→
   *  隔离栅格化/strokeRect 直支,其余→host.degradeAcc 降级）;'bridge'=B2 语义
   *  （SO/ADD 分批 FBO→present→2D 回贴 worldCanvas）。降级后 raw=真 worldCtx。 */
  private accMode = false;
  /** 本窗 CTM 内出现 clip→后续 drawImage 全回退（GL quad 不表达裁剪） */
  private clipped = false;
  /** 矩阵镜像（fround 复刻 Skia f32 拼接）+ 状态镜像 */
  private m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  private ga = 1;
  private gco: GlobalCompositeOperation = 'source-over';
  private smooth = false;
  private fillStyleS = '#000';
  /** ★B2b acc 隔离栅格化所需状态镜像（strokeStyle/lineWidth 任意值原样保） */
  private strokeStyleV: string | CanvasGradient | CanvasPattern = '#000';
  private lineWidthV = 1;
  private stack: Array<{ m: typeof GLShimExecutor.prototype.m; ga: number; gco: GlobalCompositeOperation; smooth: boolean; fill: string; clip: boolean }> = [];
  /** 队列（单序表+tier 标签——重放保原序,SO/ADD 分批 present） */
  private head: QuadRec | null = null;
  private tail: QuadRec | null = null;
  private pool: QuadRec | null = null;
  /** 后随吞抑（尘对 add 面） */
  private suppressAdd: HTMLCanvasElement | null = null;
  /** 纹理缓存:texId → packed(sx,sy,sw,sh) → entry（静态稳定源） */
  private texCache = new Map<number, Map<number, TexEntry>>();
  /** 尘预乘对登记（Renderer 注册;erase/add 画布 → reg） */
  private pairs = new WeakMap<HTMLCanvasElement, PairReg>();
  /** 动态源登记（内容每绘都变的 scratch 面） */
  private dynamicSrc = new WeakSet<object>();
  private dynKeySeq = 0;
  private dynKeys = new WeakMap<object, string>();
  stats: ShimExecStats = GLShimExecutor.blankStats();

  static blankStats(): ShimExecStats {
    return { draws: 0, emitSO: 0, emitADD: 0, pairEmitted: 0, pairSuppressed: 0, fallback: 0, flushes: 0, uploads: 0, replays: 0 };
  }

  constructor(host: ShimHost) {
    this.host = host;
  }

  // ================= 窗口生命周期 =================

  /** 窗口开：GL 可用才激活（null=整窗走 2D 原链;调用方把 this.ctx 换回原值即可）。
   *  矩阵镜像从 raw CTM 起步（f32 扩宽值=Skia 现值精确）。 */
  attach(raw: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
    this.raw = raw;
    this.accMode = false;
    this.glw = this.host.acquireGl();
    if (!this.glw || this.glw.unavailable) { this.raw = null; return null; }
    const t = raw.getTransform();
    this.m.a = t.a; this.m.b = t.b; this.m.c = t.c; this.m.d = t.d; this.m.e = t.e; this.m.f = t.f;
    this.ga = raw.globalAlpha;
    this.gco = raw.globalCompositeOperation;
    this.smooth = raw.imageSmoothingEnabled;
    this.clipped = false;
    this.active = true;
    return this.wrap();
  }

  /** ★B2b acc 窗口开（整层单窗,raw-less）：世界层 beginWorldLayer 在世界变换
   *  置位【前】调用——镜像从单位阵起步,后续 translate/scale 经 shim 镜像推进
   *  （raw 委托在 acc 态全部跳过,见各方法 if(this.raw) 守卫）。GL 不可用返 null
   *  （调用方回落 2D/bridge 全链）。 */
  attachAcc(): CanvasRenderingContext2D | null {
    this.raw = null;
    this.accMode = true;
    this.glw = this.host.acquireGl();
    if (!this.glw || this.glw.unavailable) { this.accMode = false; return null; }
    this.m.a = 1; this.m.b = 0; this.m.c = 0; this.m.d = 1; this.m.e = 0; this.m.f = 0;
    this.ga = 1; this.gco = 'source-over'; this.smooth = false;
    this.clipped = false;
    this.active = true;
    return this.wrap();
  }

  /** ★B2b 降级换桥（host.degradeAcc 调用）：raw 重指真 worldCtx（worldCanvas 惰性
   *  建成后）,镜像态一次性回放（CTM/globalAlpha/gCO/smooth/stroke/lineWidth——
   *  save 栈深度差以「当前态正确」为准:降级帧后续绘制/回放按现值续走）。 */
  bridge(raw: CanvasRenderingContext2D): void {
    this.raw = raw;
    this.accMode = false;
    raw.setTransform(this.m.a, this.m.b, this.m.c, this.m.d, this.m.e, this.m.f);
    raw.globalAlpha = this.ga;
    raw.globalCompositeOperation = this.gco;
    raw.imageSmoothingEnabled = this.smooth;
    try {
      raw.strokeStyle = this.strokeStyleV;
      raw.lineWidth = this.lineWidthV;
    } catch { /* 非法值保 raw 现状 */ }
  }

  /** 窗口关：flush + 摘除（返回原 ctx;调用方恢复 this.ctx）。 */
  detach(): void {
    if (!this.active) return;
    this.active = false;
    this.flush();
    this.raw = null;
    this.glw = null;
    this.suppressAdd = null;
  }

  /** 帧界统计复位（Renderer 窗口开时调） */
  frameReset(): void {
    this.stats = GLShimExecutor.blankStats();
  }

  // ================= 纹理登记（Renderer 侧） =================

  /** 尘预乘对注册（dustPremulPair 烘焙/命中两支调用;gl=合并字节）。
   *  ★幂等复用 reg（命中支每尘每帧都调——重建 reg 会丢 tex 缓存引用=伪 uploads++;GL 键不变,字节不变,直接保旧） */
  registerDustPair(addC: HTMLCanvasElement, eraseC: HTMLCanvasElement, glBytes: Uint8Array): void {
    const cur = this.pairs.get(eraseC);
    if (cur && cur.add === addC) { cur.gl = glBytes; return; }
    const reg: PairReg = { w: addC.width, h: addC.height, gl: glBytes, tex: null, add: addC };
    this.pairs.set(eraseC, reg);
    this.pairs.set(addC, reg);
  }

  /** 动态源注册（内容每绘都变的 scratch:drawVanillaDustPass s1/s2、mountTintScratch…）
   *  ——每次绘制 flush 期全量重传（texRefresh,免 createTexture 抖动）。 */
  markDynamic(img: object): void {
    this.dynamicSrc.add(img);
    if (!this.dynKeys.has(img)) this.dynKeys.set(img, `dyn:${++this.dynKeySeq}`);
  }

  // ================= ctx 包装 =================

  private bound: Record<string, unknown> = {};
  private boundBuilt = false;

  private buildBound(): void {
    const self = this;
    const names = ['drawImage', 'save', 'restore', 'translate', 'scale', 'rotate',
      'setTransform', 'transform', 'fillRect'];
    for (const n of names) {
      (self.bound as Record<string, unknown>)[n] = (self as unknown as Record<string, (...a: unknown[]) => unknown>)[n].bind(self);
    }
    this.boundBuilt = true;
  }

  /** 包装 raw ctx：热方法预绑定（零逐调用 bind 分配）;长尾走 raw 委托,
   *  「会落笔」长尾先 flush 保序。属性 set 镜像+透传（raw 保持 2D 回退正确态）。 */
  wrap(): CanvasRenderingContext2D {
    if (!this.boundBuilt) this.buildBound();
    const self = this;
    const raw = this.raw!;
    const bound = this.bound;
    return new Proxy(raw, {
      get(t, prop) {
        if (typeof prop === 'string') {
          const b = bound[prop];
          if (b !== undefined) return b;
          if (DRAWING_TAIL.has(prop)) {
            const fn = (...args: unknown[]) => { self.flushForFallback(); return (t as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args); };
            bound[prop] = fn;
            return fn;
          }
        }
        const v = Reflect.get(t, prop, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, value) {
        self.observeSet(prop, value);
        return Reflect.set(t, prop, value);
      },
    }) as CanvasRenderingContext2D;
  }

  private observeSet(prop: PropertyKey, value: unknown): void {
    if (prop === 'globalAlpha') this.ga = typeof value === 'number' ? value : this.ga;
    else if (prop === 'globalCompositeOperation') this.gco = value as GlobalCompositeOperation;
    else if (prop === 'imageSmoothingEnabled') this.smooth = value === true;
    else if (prop === 'fillStyle' && typeof value === 'string') this.fillStyleS = value;
  }

  // ================= 变换（镜像+委托,fround 复刻 Skia f32 拼接） =================

  save(): void {
    this.stack.push({
      m: { ...this.m }, ga: this.ga, gco: this.gco, smooth: this.smooth,
      fill: this.fillStyleS, clip: this.clipped,
    });
    this.raw!.save();
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m; this.ga = s.ga; this.gco = s.gco; this.smooth = s.smooth;
      this.fillStyleS = s.fill; this.clipped = s.clip;
    }
    this.raw!.restore();
  }

  translate(x: number, y: number): void {
    const m = this.m;
    m.e = fround(fround(m.a * x) + fround(fround(m.c * y) + m.e));
    m.f = fround(fround(m.b * x) + fround(fround(m.d * y) + m.f));
    this.raw!.translate(x, y);
  }

  scale(x: number, y: number): void {
    const m = this.m;
    m.a = fround(m.a * x); m.b = fround(m.b * x);
    m.c = fround(m.c * y); m.d = fround(m.d * y);
    this.raw!.scale(x, y);
  }

  rotate(th: number): void {
    const cos = fround(Math.cos(th)), sin = fround(Math.sin(th));
    const m = this.m;
    const a = m.a, b = m.b, c = m.c, d = m.d;
    m.a = fround(fround(a * cos) + fround(c * sin));
    m.b = fround(fround(b * cos) + fround(d * sin));
    m.c = fround(fround(c * cos) - fround(a * sin));
    m.d = fround(fround(d * cos) - fround(b * sin));
    this.raw!.rotate(th);
  }

  setTransform(...args: unknown[]): void {
    const dm = args[0] as { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number } | undefined;
    if (dm && typeof dm === 'object' && 'a' in dm) {
      this.m.a = fround(dm.a ?? 1); this.m.b = fround(dm.b ?? 0); this.m.c = fround(dm.c ?? 0);
      this.m.d = fround(dm.d ?? 1); this.m.e = fround(dm.e ?? 0); this.m.f = fround(dm.f ?? 0);
    } else {
      const v = args as unknown as number[];
      this.m.a = fround(v[0]); this.m.b = fround(v[1]); this.m.c = fround(v[2]);
      this.m.d = fround(v[3]); this.m.e = fround(v[4]); this.m.f = fround(v[5]);
    }
    (this.raw as unknown as { setTransform: (...a: unknown[]) => void }).setTransform(...args);
  }

  transform(...args: unknown[]): void {
    const v = args as unknown as number[];
    const m = this.m;
    const a = m.a, b = m.b, c = m.c, d = m.d;
    m.a = fround(fround(a * v[0]) + fround(c * v[1]));
    m.b = fround(fround(b * v[0]) + fround(d * v[1]));
    m.c = fround(fround(a * v[2]) + fround(c * v[3]));
    m.d = fround(fround(b * v[2]) + fround(d * v[3]));
    m.e = fround(fround(a * v[4]) + fround(c * v[5]) + m.e);
    m.f = fround(fround(b * v[4]) + fround(d * v[5]) + m.f);
    (this.raw as unknown as { transform: (...a: unknown[]) => void }).transform(...args);
  }

  // ================= drawImage 主桥 =================

  drawImage(img: CanvasImageSource, ...rest: unknown[]): void {
    const raw = this.raw!;
    const n = rest.length;
    this.stats.draws++;
    // 吞抑面：尘对 add 面（合并 quad 已含其贡献;2D 侧不再画）
    if (this.suppressAdd && img === this.suppressAdd && this.gco === 'lighter' && n === 2) {
      this.suppressAdd = null;
      this.stats.pairSuppressed++;
      return;
    }
    this.suppressAdd = null;
    // 长尾形态/回退判:clip 活跃、filter 非 none、3/5/9 参以外
    if (this.clipped || n !== 2 && n !== 4 && n !== 8) {
      this.flushForFallback();
      Reflect.apply(raw.drawImage, raw, [img, ...rest]);
      this.stats.fallback++;
      return;
    }
    // 源矩形（3 参=全图）
    const iw = (img as { width: number }).width, ih = (img as { height: number }).height;
    let sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number;
    if (n === 2) { sx = 0; sy = 0; sw = iw; sh = ih; dx = rest[0] as number; dy = rest[1] as number; dw = iw; dh = ih; }
    else if (n === 4) { sx = 0; sy = 0; sw = iw; sh = ih; dx = rest[0] as number; dy = rest[1] as number; dw = rest[2] as number; dh = rest[3] as number; }
    else { sx = rest[0] as number; sy = rest[1] as number; sw = rest[2] as number; sh = rest[3] as number; dx = rest[4] as number; dy = rest[5] as number; dw = rest[6] as number; dh = rest[7] as number; }
    // 零尺寸=2D no-op（无落笔,无需 flush 保序）
    if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
    // 源越界=2D 有源裁剪+dst 补偿语义（spec）——不逐式复刻,回退
    if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih) || sw < 0 || sh < 0) {
      this.flushForFallback();
      Reflect.apply(raw.drawImage, raw, [img, ...rest]);
      this.stats.fallback++;
      return;
    }
    // 负 dst = 翻转
    let flipNegX = false, flipNegY = false;
    if (dw < 0) { dx += dw; dw = -dw; flipNegX = true; }
    if (dh < 0) { dy += dh; dh = -dh; flipNegY = true; }
    // 几何解码（CTM×dst 矩形）
    const geo = this.decode(dx, dy, dw, dh);
    if (!geo) {
      this.flushForFallback();
      Reflect.apply(raw.drawImage, raw, [img, ...rest]);
      this.stats.fallback++;
      return;
    }
    // 尘预乘对面:destination-out 画 erase 面 → 合并 quad + 吞后随 add
    if (this.gco === 'destination-out') {
      const reg = this.pairs.get(img as HTMLCanvasElement);
      if (reg) {
        this.push(0, null, false, img, rest, sx, sy, sw, sh,
          geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
          1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth, false, reg);
        this.suppressAdd = reg.add;
        this.stats.pairEmitted++;
        return;
      }
      this.flushForFallback();
      Reflect.apply(raw.drawImage, raw, [img, ...rest]);
      this.stats.fallback++;
      return;
    }
    const additive = this.gco === 'lighter';
    if (!additive && this.gco !== 'source-over') {
      this.flushForFallback();
      Reflect.apply(raw.drawImage, raw, [img, ...rest]);
      this.stats.fallback++;
      return;
    }
    const tier = additive ? 1 : 0;
    // 纯色面?（fillRect 不走此;此处 img 恒 sprite）
    this.push(tier, null, false, img, rest, sx, sy, sw, sh,
      geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
      1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth,
      this.dynamicSrc.has(img), null);
  }

  /** fillRect→纯色 quad（白纹理 tint+α;平色 ±1LSB census 登记）。
   *  无法表达（斜切/非解析色）→ flush+2D。 */
  fillRect(x: number, y: number, w: number, h: number): void {
    const raw = this.raw!;
    if (this.clipped || w === 0 || h === 0) {
      if (w !== 0 && h !== 0) this.flushForFallback();
      raw.fillRect(x, y, w, h);
      return;
    }
    const col = parseColor(this.fillStyleS);
    const geo = col ? this.decode(x, y, w, h) : null;
    if (!col || !geo || (this.gco !== 'source-over' && this.gco !== 'lighter')) {
      this.flushForFallback();
      raw.fillRect(x, y, w, h);
      return;
    }
    const A = col[3] * this.ga;
    if (A <= 0) return;
    this.push(this.gco === 'lighter' ? 1 : 0, null, true, null, null, 0, 0, 1, 1,
      geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, A,
      col[0] / 255, col[1] / 255, col[2] / 255,
      geo.flipX, geo.flipY, false, false, null);
  }

  /** 几何解码：CTM×dst 矩形 → {dx,dy,dw,dh,rot,flipX,flipY}。斜切=不可表达（null）。 */
  private decode(dx: number, dy: number, dw: number, dh: number):
    { dx: number; dy: number; dw: number; dh: number; rot: number; flipX: boolean; flipY: boolean } | null {
    const { a, b, c, d, e, f } = this.m;
    if (b === 0 && c === 0) {
      const x0 = fround(a * dx) + e, x1 = fround(a * (dx + dw)) + e;
      const y0 = fround(d * dy) + f, y1 = fround(d * (dy + dh)) + f;
      return {
        dx: Math.min(x0, x1), dy: Math.min(y0, y1),
        dw: Math.abs(x1 - x0), dh: Math.abs(y1 - y0),
        rot: 0, flipX: a < 0, flipY: d < 0,
      };
    }
    // 旋转档:|CTM 列| 为轴长,列正交（无斜切）才可表达
    const lu = Math.hypot(a, b), lv = Math.hypot(c, d);
    if (lu === 0 || lv === 0) return null;
    const dot = a * c + b * d;
    if (Math.abs(dot) > 1e-4 * lu * lv) return null;
    const det = a * d - b * c;
    const cx = fround(fround(a * dx) + fround(c * dy)) + e;
    const cy = fround(fround(b * dx) + fround(d * dy)) + f;
    const cx2 = fround(fround(a * (dx + dw)) + fround(c * (dy + dh))) + e;
    const cy2 = fround(fround(b * (dx + dw)) + fround(d * (dy + dh))) + f;
    return {
      dx: fround((cx + cx2) / 2) - dw * lu / 2,
      dy: fround((cy + cy2) / 2) - dh * lv / 2,
      dw: dw * lu, dh: dh * lv,
      rot: Math.atan2(b, a),
      flipX: det < 0, flipY: false,
    };
  }

  // ================= 队列与 flush =================

  private push(tier: 0 | 1, _e: TexEntry | null, solid: boolean, img: CanvasImageSource | null,
    rawArgs: unknown[] | null, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number, rot: number, alpha: number,
    fr: number, fg: number, fb: number, flipX: boolean, flipY: boolean, smooth: boolean,
    dynamic: boolean, pair: PairReg | null): void {
    const rec = this.pool ?? ({} as QuadRec);
    this.pool = rec.next;
    rec.tier = tier; rec.solid = solid; rec.img = img; rec.raw = rawArgs;
    rec.sx = sx; rec.sy = sy; rec.sw = sw; rec.sh = sh;
    rec.dx = dx; rec.dy = dy; rec.dw = dw; rec.dh = dh;
    rec.rot = rot; rec.alpha = alpha; rec.fr = fr; rec.fg = fg; rec.fb = fb;
    rec.flipX = flipX; rec.flipY = flipY; rec.smooth = smooth;
    rec.dynamic = dynamic; rec.pair = pair; rec.next = null;
    rec.texKind = pair ? 'pair' : (dynamic ? 'full' : 'region');
    if (this.tail) this.tail.next = rec; else this.head = rec;
    this.tail = rec;
    if (tier === 0) this.stats.emitSO++; else this.stats.emitADD++;
  }

  private popAll(): void {
    let p = this.head;
    while (p) { const n = p.next; p.next = this.pool; this.pool = p; p = n; }
    this.head = this.tail = null;
  }

  /** 落笔前保序 flush（2D 回退面） */
  private flushForFallback(): void {
    if (this.head) this.flush();
  }

  /** flush：SO 批 → ADD 批，各一段 FBO('world') 租用+present 回贴。
   *  GL 失败 → 全队列 2D 重放（重放面=原参,保序）。 */
  flush(): void {
    if (!this.head) return;
    const glw = this.glw && !this.glw.unavailable ? this.glw : this.host.acquireGl();
    const wctx = this.host.worldCtx();
    if (!glw || glw.unavailable || !wctx) { this.replay2D(); return; }
    const w = this.host.worldW(), h = this.host.worldH();
    // SO 批（含尘对合并 quad——(ONE,1−SA) 下 dst 衰减由 quad α=e 驱动）
    if (this.hasTier(0)) this.presentBatch(glw, wctx, w, h, 0, false);
    // ADD 批（(ONE,ONE) 逐加;2D 'lighter' 整批回贴=加法交换律保位）
    if (this.hasTier(1)) this.presentBatch(glw, wctx, w, h, 1, true);
    this.popAll();
  }

  private hasTier(t: 0 | 1): boolean {
    for (let p = this.head; p; p = p.next) if (p.tier === t) return true;
    return false;
  }

  private presentBatch(glw: GLSpriteLayer, wctx: CanvasRenderingContext2D,
    w: number, h: number, tier: 0 | 1, additive: boolean): void {
    glw.resize(w, h);
    glw.begin('world');
    if (glw.unavailable) { this.replay2D(); return; }   // 失败段整体回放（B1 逃生门同款）
    if (additive) glw.blendAdditive(true);
    // ★预解析门:纹理解析失败（源未就绪/尺寸 0）的 rec 不得静默丢精灵——
    //  任一失败 → 本批整体走 2D 重放（静默丢=「角色变透明」形态的禁下面,
    //  2026-09-24 用户实报案防线;宁回退不丢内容）
    for (let p = this.head; p; p = p.next) {
      if (p.tier !== tier || p.solid) continue;
      if (!this.resolveTex(glw, p)) {
        if (additive) glw.blendAdditive(false);
        glw.end();
        this.replay2D();
        return;
      }
    }
    for (let p = this.head; p; p = p.next) {
      if (p.tier !== tier) continue;
      if (p.solid) {
        glw.quadSprite(WHITE_E(glw), 0, 0, 1, 1, p.dx, p.dy, p.dw, p.dh,
          { alpha: p.alpha, tint: [p.fr, p.fg, p.fb], rot: p.rot, smooth: false });
      } else {
        const e = this.resolveTex(glw, p);
        if (!e) continue;   // 预解析门已兜;防御支
        // ★UV 空间分道（角色透明案修正）:裁剪件 UV=整幅;全幅件 UV=页内矩形
        const usx = p.texKind === 'full' ? p.sx : 0;
        const usy = p.texKind === 'full' ? p.sy : 0;
        glw.quadSprite(e, usx, usy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh,
          { alpha: p.alpha, rot: p.rot, flipX: p.flipX, flipY: p.flipY, smooth: p.smooth });
      }
    }
    if (additive) glw.blendAdditive(false);
    glw.end();
    // 回贴（B1 同式:身份变换 1:1;ADD 批 gCO='lighter'）
    wctx.save();
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    if (additive) wctx.globalCompositeOperation = 'lighter';
    wctx.drawImage(glw.canvas, 0, 0, w, h);
    wctx.restore();
    this.stats.flushes++;
  }

  /** 纹理解析（flush 期逐 rec;LRU 逐出/动态源/尘对惰性建面都在此收口） */
  private resolveTex(glw: GLSpriteLayer, p: QuadRec): TexEntry | null {
    if (p.pair) {
      if (!p.pair.tex || !glw.texAlive(p.pair.tex)) {
        p.pair.tex = glw.texFromData(`dpair:${texId(p.pair.add)}`, p.pair.gl, p.pair.w, p.pair.h);
        if (p.pair.tex) this.stats.uploads++;
      }
      return p.pair.tex;
    }
    if (p.dynamic) {
      const key = this.dynKeys.get(p.img as object) ?? `dyn:${++this.dynKeySeq}`;
      const e = glw.texRefresh(key, p.img as TexImageSource);
      if (e) this.stats.uploads++;
      return e;
    }
    const id = texId(p.img as object);
    // 数值键零分配:packed = ((sx·8192+sy)·4096+sw)·4096+sh < 2⁵³
    const packed = ((p.sx * 8192 + p.sy) * 4096 + p.sw) * 4096 + p.sh;
    let sub = this.texCache.get(id);
    if (sub) {
      const hit = sub.get(packed);
      if (hit && glw.texAlive(hit)) return hit;
    } else {
      sub = new Map();
      this.texCache.set(id, sub);
    }
    const key = `er:${id}:${p.sx},${p.sy},${p.sw},${p.sh}`;
    const e = glw.texFromRegion(key, p.img as TexImageSource, p.sx, p.sy, p.sw, p.sh);
    if (e) { sub.set(packed, e); this.stats.uploads++; }
    return e;
  }

  /** GL 失败逃生:全队列按原序 2D 重放。【设备空间重放】重放时 raw CTM 已非发射时
   *  语境——统一 setTransform(identity) 后按解码矩形重画（rot/flip 走中心锚变换），
   *  gCO 按 tier 重置;紧急路径（GL 中帧死亡）,视觉正确即可。 */
  private replay2D(): void {
    const raw = this.raw;
    if (!raw) { this.popAll(); return; }
    for (let p = this.head; p; p = p.next) {
      raw.save();
      raw.setTransform(1, 0, 0, 1, 0, 0);
      raw.globalAlpha = p.alpha;
      raw.globalCompositeOperation = p.tier === 1 ? 'lighter' : 'source-over';
      if (p.solid) {
        raw.fillStyle = `rgb(${Math.round(p.fr * 255)},${Math.round(p.fg * 255)},${Math.round(p.fb * 255)})`;
        if (p.rot) {
          raw.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
          raw.rotate(p.rot);
          raw.fillRect(-p.dw / 2, -p.dh / 2, p.dw, p.dh);
        } else {
          raw.fillRect(p.dx, p.dy, p.dw, p.dh);
        }
      } else if (p.pair) {
        // 尘对重放=2D 两步原样（erase destination-out + add lighter;p.img=erase 面）
        const img = p.img as HTMLCanvasElement | null;
        if (img) {
          raw.globalCompositeOperation = 'destination-out';
          if (p.rot || p.flipX || p.flipY) {
            raw.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
            if (p.rot) raw.rotate(p.rot);
            if (p.flipX || p.flipY) raw.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
            raw.drawImage(img, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
            raw.globalCompositeOperation = 'lighter';
            raw.drawImage(p.pair.add, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
          } else {
            raw.drawImage(img, p.dx, p.dy, p.dw, p.dh);
            raw.globalCompositeOperation = 'lighter';
            raw.drawImage(p.pair.add, p.dx, p.dy, p.dw, p.dh);
          }
        }
      } else if (p.img) {
        raw.imageSmoothingEnabled = p.smooth;
        if (p.rot || p.flipX || p.flipY) {
          raw.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
          if (p.rot) raw.rotate(p.rot);
          if (p.flipX || p.flipY) raw.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
          raw.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
        } else {
          raw.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
        }
      }
      raw.restore();
      this.stats.replays++;
    }
    this.popAll();
  }
}

/** 1×1 白纹理（fillRect 纯色面;惰性建,键恒 '__white'——GLSpriteLayer.fillQuad 同款） */
function WHITE_E(glw: GLSpriteLayer): TexEntry {
  const hit = WHITE_CACHE.get(glw);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 1, 1);
  const e = glw.texFromImage('__white', c, false, true)!;
  WHITE_CACHE.set(glw, e);
  return e;
}
const WHITE_CACHE = new WeakMap<GLSpriteLayer, TexEntry>();

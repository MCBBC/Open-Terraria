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
  /** 0=SO 1=ADD(lighter) ★B2b acc 新增 2=ERASE(destination-out 独立削底面——
   *  未注册尘对/光环削底+加算两步族的 acc 直译;bridge 态不产生）
   *  3=MULT(multiply 实心 fillRect——★2026-09-25 普查翻案为
   *  (ONE_MINUS_DST_ALPHA,SRC_COLOR)=Canvas multiply 逐字节精确式（含半透明
   *  dst 格;旧 (ZERO,SRC_COLOR) α 域登记项已消,见 GLSpriteLayer.blendMult 注;
   *  实色源门 col[3]===1/ga===1/轴对齐仍在——rgba 半透明源走降级）） */
  tier: 0 | 1 | 2 | 3;
  img: CanvasImageSource | null;      // 2D 重放源（solid 面为 null）
  solid: boolean;                     // fillRect 纯色面（白纹理+tint）
  // ★R3-F3:原 `a: number[]`/`raw: unknown[]` 两字段死码（写读双无）已删——
  //  rest 数组不再被 rec 驻留（重放面=sx..sh+img 中心锚形,见 replay2D/drawRec2D）
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
  emitErase: number;    // ★B2b acc ERASE quad 发射（tier 2）
  emitMult: number;     // ★B2b acc MULT quad 发射（tier 3,multiply 实心矩形）
  pairEmitted: number;  // 尘预乘对合并 quad
  pairSuppressed: number;
  fallback: number;     // 2D 回退（flush+raw）
  flushes: number;      // FBO present 次数
  uploads: number;      // 纹理（重）上传
  replays: number;      // GL 失败 2D 重放
}

const fround = Math.fround;

/** ★R1-F1 tier→2D 算子全表（重放/直画面 gCO 单源;旧码二值表丢 tier-2/3 语义） */
const TIER_GCO: readonly GlobalCompositeOperation[] = ['source-over', 'lighter', 'destination-out', 'multiply'];

/** ★R3-F3 quadSprite opts 单槽复用（quadSprite 同步读入 uniform 零驻留;单线程,
 *  flushAcc/presentBatch 发射期消费即弃） */
const QOPTS: { alpha: number; tint: [number, number, number] | null; rot: number; flipX: boolean; flipY: boolean; smooth: boolean } =
  { alpha: 1, tint: null, rot: 0, flipX: false, flipY: false, smooth: false };
const TINT3: [number, number, number] = [1, 1, 1];

/** ★R3-F1 texCache 驻留上界:sub-Map 32 条（LRU 触达刷新）/全表 256 texId（FIFO）。
 *  逐出仅删 JS 侧 Map 条目——GL 纹理仍驻留（texFromRegion 键幂等零重传）,
 *  显存由 GLSpriteLayer 192MB LRU 兜底;防长会话 texId×packed 笛卡尔积无界。 */
const TEX_CACHE_SUB_CAP = 32;
const TEX_CACHE_OUTER_CAP = 256;

/** 常用 CSS 颜色解析缓存（fillRect 面;键=fillStyle 原串,值可为 null=确认不可解析
 *  ——★R1-F4:失败曾缓存 [0,0,0,0] 黑哨兵,同串二次调用 truthy→A=0 静默丢笔;
 *  现恒返 null 走既有降级/栅格化支,逐次同相） */
const colorCache = new Map<string, readonly [number, number, number, number] | null>();

/** hsl()/hsla() → rgb（CSS round-to-8bit;h 任意角度归一,s/l ∈[0,100] 百分比） */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function parseColor(s: string): readonly [number, number, number, number] | null {
  if (colorCache.has(s)) return colorCache.get(s)!;
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
  } else {
    // ★R1-F4③:hsl()/hsla() 逗号形（现代空格形/命名色不解析——恒 null 走
    //  栅格化/降级回退,像素正确;不做 148 色名表=纯回退频次优化,零正确性收益）
    const mHsl = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
    if (mHsl) {
      const hh = +mHsl[1], ss = +mHsl[2] / 100, ll = +mHsl[3] / 100;
      if (ss >= 0 && ss <= 1 && ll >= 0 && ll <= 1) {
        const [r, g, b] = hslToRgb(hh, ss, ll);
        out = [r, g, b, mHsl[4] === undefined ? 1 : +mHsl[4]];
      }
    }
  }
  if (colorCache.size > 512) colorCache.clear();
  colorCache.set(s, out);
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
  /** ★R1-F4:fillStyle 全值镜像（string/CanvasGradient/CanvasPattern;observeSet 收
   *  全类型,fillRect 遇非 string 走栅格化/降级支,rasterizeFillRect 渐变兜底可达） */
  private fillStyleV: string | CanvasGradient | CanvasPattern = '#000';
  /** ★R3-F3 decode 结果单槽复用（消费即弃:drawImage/fillRect 同步读完全即丢,
   *  单线程无重入——rasterize→flush 链不再调 decode,已核;★BJ342 会话顺手修:
   *  原文 rasterize 后多一枚「星杠」提前闭合块注释=全树语法错误,阻塞
   *  Renderer import 链(2026-09-25 01:55 盘上态)） */
  private _geo: { dx: number; dy: number; dw: number; dh: number; rot: number; flipX: boolean; flipY: boolean } = { dx: 0, dy: 0, dw: 0, dh: 0, rot: 0, flipX: false, flipY: false };
  /** ★普查修复（2026-09-25 旗错色同病普查案②）：font/textAlign 状态镜像——acc 态
   *  旧代码路径（Bobber 声呐渔获名/Banner 悬停名）先 set font+textAlign 再 fillText,
   *  未镜像属性在 acc 态被静默丢弃（set 落空+raw=null）,fillText 触发降级后 bridge()
   *  又不回放 → 默认字体+左对齐错位渲染（undefined 传播面同 gCO 族病根）。 */
  private fontV = '10px sans-serif';
  private alignV: CanvasTextAlign = 'left';
  /** ★B2b acc 隔离栅格化所需状态镜像（strokeStyle/lineWidth/filter 任意值原样保） */
  private strokeStyleV: string | CanvasGradient | CanvasPattern = '#000';
  private lineWidthV = 1;
  /** ★四柱掉帧批（2026-09-25）acc 路径镜像：pathOps=逐 op 录制（beginPath 起清,
   *  canvas 语义 stroke/fill 不清路径）;pathOverflow=超帽保守降级位。
   *  消费面=rasterizePathOp（stroke/fill 隔离栅格化——drawForceFieldBubble 尾部
   *  arc/stroke 曾触发 beginPath→ensureBridged 整帧降级,四柱档 100% 降级元凶）。 */
  private pathOps: Array<[string, unknown[]]> = [];
  private pathOverflow = false;
  /** 路径 op 录制帽（防病态长路径无界驻留;超帽 stroke/fill 走降级原链） */
  private static readonly PATH_OPS_CAP = 512;
  /** 描边样式收尾镜像（rasterizePathOp/bridge 回放;canvas 缺省值） */
  private lineCapV: CanvasLineCap = 'butt';
  private lineJoinV: CanvasLineJoin = 'miter';
  private miterLimitV = 10;
  /** ctx.filter 镜像（非 'none' 的 drawImage=源级滤镜——quad 不表达,走隔离栅格化） */
  private filterV = 'none';
  private stack: Array<{ m: typeof GLShimExecutor.prototype.m; ga: number; gco: GlobalCompositeOperation; smooth: boolean; fill: string | CanvasGradient | CanvasPattern; clip: boolean; stroke: string | CanvasGradient | CanvasPattern; lw: number; filter: string; font: string; align: CanvasTextAlign }> = [];
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
    return { draws: 0, emitSO: 0, emitADD: 0, emitErase: 0, emitMult: 0, pairEmitted: 0, pairSuppressed: 0, fallback: 0, flushes: 0, uploads: 0, replays: 0 };
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
    // ★R1-F8:bridge 窗残帧守卫三面（对齐 attachAcc 孪生守卫）——上一 acc 帧异常
    //  （渲染 throw 于 finishAccFrame 前）残留:残队/残 save 栈/开着 FBO。attach 只
    //  跑在 _accMode==='off' 帧（acc/bridged 帧分窗早退）→ 残留必为垃圾,宁弃不跨帧
    //  串层。正常链 detach 已 flush+restore 平衡=恒 no-op。
    this.suppressAdd = null;
    if (this.head) this.popAll();
    this.stack.length = 0;
    this.glw = this.host.acquireGl();
    if (!this.glw || this.glw.unavailable) { this.raw = null; return null; }
    if (this.glw.isAccumOpen('world')) this.glw.endAccumulate();   // 残开 FBO 弃用（重开帧首段 begin(clear) 再清量）
    const t = raw.getTransform();
    this.m.a = t.a; this.m.b = t.b; this.m.c = t.c; this.m.d = t.d; this.m.e = t.e; this.m.f = t.f;
    this.ga = raw.globalAlpha;
    this.gco = raw.globalCompositeOperation;
    this.smooth = raw.imageSmoothingEnabled;
    // ★R1-F4:fillStyle 镜像从 raw 起步（对齐 font/textAlign 普查案②同款——
    //  窗前 raw 直设的 fillStyle 不再被 stale 镜像顶掉）
    const fsRaw = (raw as { fillStyle?: unknown }).fillStyle;
    if (typeof fsRaw === 'string' || (typeof fsRaw === 'object' && fsRaw !== null)) {
      this.fillStyleV = fsRaw as string | CanvasGradient | CanvasPattern;
    }
    this.filterV = String(raw.filter ?? 'none');
    this.fontV = String(raw.font ?? '10px sans-serif');
    this.alignV = (raw.textAlign ?? 'left') as CanvasTextAlign;
    this.clipped = false;
    // ★四柱掉帧批:路径镜像清窗（attach=窗开,模拟 ctx 路径从空起——raw 残路径
    //  不可读,与既有镜像态同口径）;描边样式收尾镜像从 raw 起步
    this.pathOps.length = 0;
    this.pathOverflow = false;
    this.lineCapV = (raw.lineCap ?? 'butt') as CanvasLineCap;
    this.lineJoinV = (raw.lineJoin ?? 'miter') as CanvasLineJoin;
    this.miterLimitV = typeof raw.miterLimit === 'number' ? raw.miterLimit : 10;
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
    this.ga = 1; this.gco = 'source-over'; this.smooth = false; this.filterV = 'none';
    this.fontV = '10px sans-serif'; this.alignV = 'left';
    this.clipped = false;
    // ★四柱掉帧批:acc 窗开=路径镜像/描边样式收尾同步复位（canvas 缺省值）
    this.pathOps.length = 0;
    this.pathOverflow = false;
    this.lineCapV = 'butt'; this.lineJoinV = 'miter'; this.miterLimitV = 10;
    // ★普查修复（2026-09-25 旗错色同病普查案③）：上一帧异常残留的【开着 FBO】必须
    //  弃用——endAccumulate 前残帧 pipeFbo 仍绑 'world',本帧首个 flushAcc 撞
    //  isAccumOpen=true 会跳过 begin(clear) → 新帧内容叠在残帧上=残影跨帧串层
    //  （与下方残队守卫同案同拍:异常帧 queue+开 FBO 双残,残队已治,FBO 此治）。
    //  正常帧 finishAccFrame→endAccumulate 已解绑=本支恒 no-op。
    if (this.glw.isAccumOpen('world')) this.glw.endAccumulate();
    // ★B2b 修复:新帧 acc 窗开=队列必须空——上一帧异常路径（渲染 throw 于
    //  compositeLight 前）会留残队,残队在本帧首个 flush 点（墙格段 flush）
    //  先于墙发射=角色/实体垫到墙后（用户实报症状）。宁弃残帧内容不跨帧串层。
    if (this.head) this.popAll();
    // ★R3-F6:残 save 栈镜像清（第三面守卫,与上面残队/残 FBO 同案同拍）——上帧
    //  异常未 restore 的残条在本帧 restore 时弹出=上帧中段 CTM/α/gco 跨帧复活。
    this.stack.length = 0;
    this.suppressAdd = null;
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
      raw.fillStyle = this.fillStyleV;   // ★R1-F4:fillStyle 全值回放（acc 窗渐变/图案/色串降级后不丢）
      raw.strokeStyle = this.strokeStyleV;
      raw.lineWidth = this.lineWidthV;
      raw.filter = this.filterV;
      raw.font = this.fontV;        // ★普查案②:文本态回放（降级帧 fillText 用对字体）
      raw.textAlign = this.alignV;
      raw.lineCap = this.lineCapV;   // ★四柱掉帧批:描边样式收尾回放（降级帧 stroke 同态）
      raw.lineJoin = this.lineJoinV;
      raw.miterLimit = this.miterLimitV;
    } catch { /* 非法值保 raw 现状 */ }
    // ★四柱掉帧批:录制路径原样重放（acc 期 path op 只落镜像不落 raw;换桥后
    //  stroke/fill 原生消费须有路径——重放=「op 本就发给 raw」的等价态,降级帧
    //  尾部 arc+stroke 环仍画出）
    for (const [o, a] of this.pathOps) {
      const f = (raw as unknown as Record<string, (...x: unknown[]) => unknown>)[o];
      if (typeof f === 'function') f.apply(raw, a);
    }
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

  /** 包装 ctx：热方法预绑定（零逐调用 bind 分配）;长尾走 raw 委托,
   *  「会落笔」长尾先 flush 保序。属性 set 镜像+透传（raw 保持 2D 回退正确态）。
   *  ★B2b acc 态（raw=null）：target=哑对象,属性读走 acc 分支——canvas→尺寸桩
   *  （worldW/H,消费面=gateFootprintCtx/beginFgPass 的画布尺寸读取）、
   *  getTransform→镜像、落笔长尾→隔离栅格化或降级、未知函数→降级后委托;
   *  属性 set 只镜像不落 raw。 */
  wrap(): CanvasRenderingContext2D {
    if (!this.boundBuilt) this.buildBound();
    const self = this;
    const bound = this.bound;
    const dummy = (this._dummy ??= {}) as unknown as CanvasRenderingContext2D;
    return new Proxy(dummy, {
      get(_t, prop) {
        // ★raw 动态读（acc→bridge 换桥重指后闭包不得持陈旧引用）
        const raw = self.raw;
        if (typeof prop === 'string') {
          const b = bound[prop];
          if (b !== undefined) return b;
          if (self.accMode) {
            if (prop === 'canvas') return self.canvasStub();
            if (prop === 'getTransform') {
              const m = self.m;
              return () => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
            }
            // ★B2b 修复（2026-09-24 用户实报「角色合成到背景墙后面」）:状态属性读
            //  必须回镜像值——undefined 会沿「gco 读→undefined→写回→后续 drawImage
            //  判非 source-over→rawDrawImage→整帧降级」链触发伪降级,降级帧叠加
            //  桥接队列无 flush 点=内容跨帧滞留（层序炸,症状见 Renderer 注）。
            //  消费面实证:npcExtraParts 光环 prevOp=ctx.globalCompositeOperation 读。
            if (prop === 'globalAlpha') return self.ga;
            if (prop === 'globalCompositeOperation') return self.gco;
            if (prop === 'imageSmoothingEnabled') return self.smooth;
            if (prop === 'fillStyle') return self.fillStyleV;
            if (prop === 'strokeStyle') return self.strokeStyleV;
            if (prop === 'lineWidth') return self.lineWidthV;
            if (prop === 'filter') return self.filterV;
            // ★普查案②:font/textAlign 读回镜像值（undefined 传播面封口）
            if (prop === 'font') return self.fontV;
            if (prop === 'textAlign') return self.alignV;
            if (DRAWING_TAIL.has(prop)) {
              const fn = (...args: unknown[]) => { self.accTailOp(prop, args); return undefined; };
              bound[prop] = fn;
              return fn;
            }
            if (prop === 'beginPath' || prop === 'moveTo' || prop === 'lineTo' || prop === 'arc'
              || prop === 'arcTo' || prop === 'bezierCurveTo' || prop === 'quadraticCurveTo'
              || prop === 'rect' || prop === 'closePath' || prop === 'ellipse' || prop === 'setLineDash') {
              // ★四柱掉帧批（2026-09-25）:路径构造 op 落【镜像录制】不再降级——
              //  旧码走「读值面」支 ensureBridged（flush+degradeAcc）=world 层任何
              //  beginPath 必整帧降级（drawForceFieldBubble 尾环 2268/2502 帧必降
              //  定谳面）。录制后由 accTailOp 的 stroke/fill 隔离栅格化消费
              //  （rasterizePathOp）;降级换桥时 bridge() 原样重放=等价态。
              const fn = (...args: unknown[]) => { self.recordPathOp(prop, args); return undefined; };
              bound[prop] = fn;
              return fn;
            }
            if (prop === 'getImageData' || prop === 'createPattern' || prop === 'createLinearGradient'
              || prop === 'createRadialGradient' || prop === 'measureText' || prop === 'isPointInPath'
              || prop === 'clip' || prop === 'drawFocusIfNeeded') {
              // 读值面/样式工厂:acc 态无落笔语义,降级后委托（防御性）
              return (...args: unknown[]) => { self.ensureBridged(); const r = self.raw as unknown as Record<string, (...a: unknown[]) => unknown>; return r[prop](...args); };
            }
            return undefined;
          }
          if (DRAWING_TAIL.has(prop)) {
            const fn = (...args: unknown[]) => { self.flushForFallback(); return (raw as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args); };
            bound[prop] = fn;
            return fn;
          }
        }
        const v = Reflect.get(raw as object, prop, raw as object);
        return typeof v === 'function' ? v.bind(raw) : v;
      },
      set(_t, prop, value) {
        self.observeSet(prop, value);
        const raw = self.raw;
        if (raw) return Reflect.set(raw, prop, value);
        return true;
      },
    }) as CanvasRenderingContext2D;
  }

  private _dummy: Record<string, unknown> | null = null;
  private _stub: { width: number; height: number } | null = null;

  /** acc 态 ctx.canvas 桩（只暴露尺寸;世界层消费面=画布尺寸读取,无 getContext 落笔） */
  private canvasStub(): { width: number; height: number } {
    const w = this.host.worldW(), h = this.host.worldH();
    if (!this._stub || this._stub.width !== w || this._stub.height !== h) {
      this._stub = { width: w, height: h };
    }
    return this._stub;
  }

  /** acc 态未知算子收口：优先降级换桥再委托真 ctx（宁降级不丢内容）。
   *  ★R1-F3:降级前必须全 tier flush——残队逐条落 FBO 后由降级 present 带走;
   *  不 flush 即降级=残队跨档,bridge flush 只发 tier 0/1（tier-2/3 曾静默弃）。
   *  flush 内部失败已自带降级+重放链（accFail）,此处二次 degradeAcc 为幂等 no-op。 */
  private ensureBridged(): void {
    if (this.raw || !this.accMode) return;
    this.flush();
    this.host.degradeAcc?.();
  }

  /** ★B2b acc 落笔长尾分流：strokeRect=隔离栅格化直支（像素恒等,见 rasterizeOp）;
   *  ★四柱掉帧批（2026-09-25）新增 stroke/fill=录制的路径 op 隔离栅格化直支
   *  （rasterizePathOp——drawForceFieldBubble 尾部 arc+stroke 环,旧码整帧降级）;
   *  其余（fillText/putImageData/clearRect…）→ flush 保序+降级换桥+raw 委托。 */
  private accTailOp(op: string, args: unknown[]): void {
    if (op === 'strokeRect' && !this.clipped) {
      const ok = this.rasterizeOp('strokeRect', args);
      if (ok) return;
    }
    if ((op === 'stroke' || op === 'fill') && !this.clipped && !this.pathOverflow) {
      const ok = this.rasterizePathOp(op, args);
      if (ok) return;
    }
    this.flushForFallback();
    if (!this.ensureBridgedNow()) return;
    const r = this.raw as unknown as Record<string, (...a: unknown[]) => unknown>;
    r[op](...args);
    this.stats.fallback++;
  }

  /** ★四柱掉帧批：acc 路径 op 录制（构造面零落笔零降级;beginPath=清录制）。
   *  canvas 语义路径不属于绘图状态（save/restore 不存取）;录制裁断帽防病态驻留。 */
  private recordPathOp(op: string, args: unknown[]): void {
    if (op === 'beginPath') {
      this.pathOps.length = 0;
      this.pathOverflow = false;
      return;
    }
    if (this.pathOps.length >= GLShimExecutor.PATH_OPS_CAP) {
      this.pathOverflow = true;   // 超帽:stroke/fill 走降级原链（宁降级不丢内容）
      return;
    }
    this.pathOps.push([op, args]);
  }

  /** ★四柱掉帧批（2026-09-25）：acc 态 stroke/fill 隔离栅格化（B2b strokeRect 判例
   *  rasterizeOp 同款——整数对齐 scratch 按当前镜像 CTM 原样重放录制路径,覆盖率
   *  逐位;发射 SO/ADD quad 由 gco 分档）。空路径=canvas no-op 语义,返回 true 不
   *  发射。gco∉{source-over,lighter}（multiply 等改面语义在透明 scratch 上不成立）
   *  → false 走降级原链。 */
  private rasterizePathOp(op: 'stroke' | 'fill', fillArgs: unknown[]): boolean {
    if (this.gco !== 'source-over' && this.gco !== 'lighter') return false;
    const segs = this.pathOps;
    if (!segs.length) return true;   // 空路径落笔=no-op（当前 acc 帧语义亦然）
    const { a, b, c, d, e, f } = this.m;
    if (Math.abs(a * d - b * c) < 1e-12) return false;   // 退化 CTM→保守降级
    // 设备 bbox（保守超集:圆/椭圆按全径,贝塞尔按控制点凸包;stroke 加半宽+AA 1px）
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    const pt = (x: number, y: number): void => {
      const px = a * x + c * y + e, py = b * x + d * y + f;
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
      if (py < by0) by0 = py; if (py > by1) by1 = py;
    };
    const circle = (x: number, y: number, r: number): void => {
      // 仿射下圆→椭圆:x 半轴=r·hypot(a,c)（精确）,y 半轴=r·hypot(b,d)——
      // 部分弧取全径=保守超集（像素面只多不多）
      const rx = r * Math.hypot(a, c), ry = r * Math.hypot(b, d);
      pt(x - rx, y - ry); pt(x + rx, y - ry); pt(x - rx, y + ry); pt(x + rx, y + ry);
    };
    for (const [o, s] of segs) {
      switch (o) {
        case 'moveTo': case 'lineTo': pt(s[0] as number, s[1] as number); break;
        case 'arc': circle(s[0] as number, s[1] as number, Math.max(s[2] as number, 0)); break;
        case 'ellipse': circle(s[0] as number, s[1] as number,
          Math.max(Math.abs(s[2] as number), Math.abs(s[3] as number), 0)); break;   // 旋转载荷取全径=超集
        case 'arcTo': pt(s[0] as number, s[1] as number); pt(s[2] as number, s[3] as number);
          circle(s[0] as number, s[1] as number, Math.max(s[4] as number, 0)); break;
        case 'bezierCurveTo': pt(s[0] as number, s[1] as number); pt(s[2] as number, s[3] as number);
          pt(s[4] as number, s[5] as number); break;
        case 'quadraticCurveTo': pt(s[0] as number, s[1] as number); pt(s[2] as number, s[3] as number); break;
        case 'rect': {   // 四角（斜切 CTM 下对角两点不足界,2026-09-25 自查补）
          const rx = s[0] as number, ry = s[1] as number, rw = s[2] as number, rh = s[3] as number;
          pt(rx, ry); pt(rx + rw, ry); pt(rx, ry + rh); pt(rx + rw, ry + rh);
          break;
        }
        default: break;   // closePath/setLineDash 无几何
      }
    }
    const ms = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
    const pad = (op === 'stroke' ? (this.lineWidthV * ms) / 2 : 0) + 1;
    const fx = Math.floor(bx0 - pad), fy = Math.floor(by0 - pad);
    const sx = Math.ceil(bx1 + pad) - fx, sy = Math.ceil(by1 + pad) - fy;
    if (!(sx > 0 && sy > 0) || sx > 4096 || sy > 4096) return false;
    const sc = accScratch(sx, sy);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx, sy);
    // 整数设备平移 (−fx,−fy) 后同 CTM 重放——覆盖率与原位逐位同（B2b 判例）
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    sctx.lineWidth = this.lineWidthV;
    sctx.lineCap = this.lineCapV;
    sctx.lineJoin = this.lineJoinV;
    sctx.miterLimit = this.miterLimitV;
    try { sctx.filter = this.filterV; } catch { /* 非法值保缺省 */ }
    sctx.beginPath();
    for (const [o, s] of segs) {
      const fn = (sctx as unknown as Record<string, (...x: unknown[]) => unknown>)[o];
      if (typeof fn === 'function') fn.apply(sctx, s);
    }
    if (op === 'stroke') {
      sctx.strokeStyle = this.strokeStyleV;
      sctx.stroke();
    } else {
      sctx.fillStyle = this.fillStyleV;
      if (fillArgs.length > 0) sctx.fill(fillArgs[0] as CanvasFillRule);
      else sctx.fill();
    }
    // 发射:scratch=动态源,UV=整幅,设备矩形 1:1;α/样式已烘进 scratch;
    // gco='lighter'→ADD quad（canvas lighter 同式 src+dst）,SO→tier 0
    this.markDynamic(sc);
    this.push(this.gco === 'lighter' ? 1 : 0, null, false, sc, 0, 0, sx, sy, fx, fy, sx, sy, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();   // 即发即弃（保序+防 scratch 覆写,rasterizeOp 同款）
    return true;
  }

  /** 降级同步版：调 host.degradeAcc;成功=raw 可用（bridge 已回放镜像态）。 */
  private ensureBridgedNow(): boolean {
    if (this.raw) return true;
    if (!this.host.degradeAcc?.()) return false;
    return !!this.raw;
  }

  private observeSet(prop: PropertyKey, value: unknown): void {
    // ★R2-F5:2D 语义=非有限/越界 [0,1] 忽略保旧值（NaN 被 >=0/<=1 双比较排除）
    if (prop === 'globalAlpha') this.ga = typeof value === 'number' && value >= 0 && value <= 1 ? value : this.ga;
    else if (prop === 'globalCompositeOperation') this.gco = value as GlobalCompositeOperation;
    else if (prop === 'imageSmoothingEnabled') this.smooth = value === true;
    // ★R1-F4:fillStyle 镜像收全值（string/CanvasGradient/CanvasPattern）——旧码只收
    //  string,渐变/图案 set 落空=get 回 stale 串色→fillRect 发错色 quad。垃圾值
    //  （number/bool/null）按 2D 语义忽略保旧。
    else if (prop === 'fillStyle' && (typeof value === 'string' || (typeof value === 'object' && value !== null))) this.fillStyleV = value as string | CanvasGradient | CanvasPattern;
    else if (prop === 'strokeStyle') this.strokeStyleV = value as string | CanvasGradient | CanvasPattern;
    else if (prop === 'lineWidth' && typeof value === 'number') this.lineWidthV = value;
    // ★四柱掉帧批:描边样式收尾镜像（rasterizePathOp 在 scratch 上原值重放;
    //  2D 语义=非法值忽略保旧,与 lineWidth 同门）
    else if (prop === 'lineCap' && typeof value === 'string') this.lineCapV = value as CanvasLineCap;
    else if (prop === 'lineJoin' && typeof value === 'string') this.lineJoinV = value as CanvasLineJoin;
    else if (prop === 'miterLimit' && typeof value === 'number' && value >= 0) this.miterLimitV = value;
    else if (prop === 'filter' && typeof value === 'string') this.filterV = value;
    // ★普查案②:font/textAlign 镜像（acc 态 set 只落镜像,降级后 bridge 回放）
    else if (prop === 'font' && typeof value === 'string') this.fontV = value;
    else if (prop === 'textAlign' && typeof value === 'string') this.alignV = value as CanvasTextAlign;
  }

  // ================= 变换（镜像+委托,fround 复刻 Skia f32 拼接） =================

  save(): void {
    this.stack.push({
      m: { ...this.m }, ga: this.ga, gco: this.gco, smooth: this.smooth,
      fill: this.fillStyleV, clip: this.clipped,
      stroke: this.strokeStyleV, lw: this.lineWidthV, filter: this.filterV,
      font: this.fontV, align: this.alignV,
    });
    if (this.raw) this.raw.save();
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m; this.ga = s.ga; this.gco = s.gco; this.smooth = s.smooth;
      this.fillStyleV = s.fill; this.clipped = s.clip;
      this.strokeStyleV = s.stroke; this.lineWidthV = s.lw; this.filterV = s.filter;
      this.fontV = s.font; this.alignV = s.align;
    }
    if (this.raw) this.raw.restore();
  }

  translate(x: number, y: number): void {
    const m = this.m;
    m.e = fround(fround(m.a * x) + fround(fround(m.c * y) + m.e));
    m.f = fround(fround(m.b * x) + fround(fround(m.d * y) + m.f));
    if (this.raw) this.raw.translate(x, y);
  }

  scale(x: number, y: number): void {
    const m = this.m;
    m.a = fround(m.a * x); m.b = fround(m.b * x);
    m.c = fround(m.c * y); m.d = fround(m.d * y);
    if (this.raw) this.raw.scale(x, y);
  }

  rotate(th: number): void {
    const cos = fround(Math.cos(th)), sin = fround(Math.sin(th));
    const m = this.m;
    const a = m.a, b = m.b, c = m.c, d = m.d;
    m.a = fround(fround(a * cos) + fround(c * sin));
    m.b = fround(fround(b * cos) + fround(d * sin));
    m.c = fround(fround(c * cos) - fround(a * sin));
    m.d = fround(fround(d * cos) - fround(b * sin));
    if (this.raw) this.raw.rotate(th);
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
    if (this.raw) (this.raw as unknown as { setTransform: (...a: unknown[]) => void }).setTransform(...args);
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
    if (this.raw) (this.raw as unknown as { transform: (...a: unknown[]) => void }).transform(...args);
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
      this.rawDrawImage(img, rest);
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
      this.rawDrawImage(img, rest);
      return;
    }
    // 负 dst = 翻转
    let flipNegX = false, flipNegY = false;
    if (dw < 0) { dx += dw; dw = -dw; flipNegX = true; }
    if (dh < 0) { dy += dh; dh = -dh; flipNegY = true; }
    // 几何解码（CTM×dst 矩形）
    const geo = this.decode(dx, dy, dw, dh);
    if (!geo) {
      this.rawDrawImage(img, rest);
      return;
    }
    // 尘预乘对面:destination-out 画 erase 面 → 合并 quad + 吞后随 add
    if (this.gco === 'destination-out') {
      const reg = this.pairs.get(img as HTMLCanvasElement);
      if (reg) {
        this.push(0, null, false, img, sx, sy, sw, sh,
          geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
          1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth, false, reg);
        this.suppressAdd = reg.add;
        this.stats.pairEmitted++;
        return;
      }
      // ★B2b acc:未注册削底面（duke 拖影对/光环 A∈(0,255) 两步族）→ tier-2 ERASE
      //  quad——blend(ZERO,1−SA) 直削【累积面】=2D destination-out 直绘逐位同构
      //  （dst 衰减吃到身后全部已画内容）;bridge 态不产生（分批 FBO 语义不含
      //  独立削底,保持 flush+2D 回退）。
      if (this.accMode) {
        this.push(2, null, false, img, sx, sy, sw, sh,
          geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
          1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth,
          this.dynamicSrc.has(img), null);
        return;
      }
      this.rawDrawImage(img, rest);
      return;
    }
    const additive = this.gco === 'lighter';
    if (!additive && this.gco !== 'source-over') {
      this.rawDrawImage(img, rest);
      return;
    }
    // ★B2b:ctx.filter 非 none（敌怪受击 brightness/水下 sepia 染色族）——quad
    //  不表达源级滤镜,acc 态走隔离栅格化（滤镜在 scratch 上施加,SO 合成逐位同）;
    //  非 source-over 滤镜面=不可隔离 → 降级。bridge 态保持 census 回退（B2 现状）。
    if (this.accMode && this.filterV !== 'none') {
      if (this.gco === 'source-over' && this.rasterizeDrawImage(img, sx, sy, sw, sh, geo)) return;
      this.rawDrawImage(img, rest);
      return;
    }
    const tier = additive ? 1 : 0;
    // 纯色面?（fillRect 不走此;此处 img 恒 sprite）
    this.push(tier, null, false, img, sx, sy, sw, sh,
      geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
      1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth,
      this.dynamicSrc.has(img), null);
  }

  /** fillRect→纯色 quad（白纹理 tint+α;平色 ±1LSB census 登记）。
   *  无法表达（斜切/非解析色）→ flush+2D。 */
  fillRect(x: number, y: number, w: number, h: number): void {
    const raw = this.raw;
    if (this.clipped || w === 0 || h === 0) {
      if (w !== 0 && h !== 0) {
        // ★B2b acc:渐变/图案 fillStyle 直译不出→隔离栅格化（像素恒等）;败→降级
        if (this.accMode && this.rasterizeFillRect(x, y, w, h)) return;
        this.flushForFallback();
        if (this.accMode && !this.ensureBridgedNow()) { this.stats.fallback++; return; }
        (this.raw as CanvasRenderingContext2D).fillRect(x, y, w, h);
        this.stats.fallback++;
      }
      return;
    }
    // ★R1-F4:非 string fillStyle（渐变/图案）不进 parseColor——直译不出,走下方
    //  栅格化/回退支（acc 态 rasterizeFillRect 可达渐变兜底;bridge 态 raw 有真值）
    const col = typeof this.fillStyleV === 'string' ? parseColor(this.fillStyleV) : null;
    const geo = col ? this.decode(x, y, w, h) : null;
    // ★B2b 修复（2026-09-24 用户实报「NPC 旗子闪烁错色」）:multiply 实心矩形
    //  =tier-3 MULT quad（GLSpriteLayer.blendMult=Canvas multiply 逐字节精确式,
    //  ★2026-09-25 普查翻案为 (ONE_MINUS_DST_ALPHA,SRC_COLOR)——半透明/透明 dst
    //  格亦逐字节,见 GLSpriteLayer 注+探针 _census-flagcolor-dolltint ③）。
    //  此前整帧降级;更早版本（用户页在跑）栅格化到透明 scratch=实心色块盖旗。
    //  ★普查案④:门加 col[3]===1——rgba 半透明 fillStyle 的 multiply 有
    //  (1−αs)αbCb 项,固定功能 blend 不表达 → 走降级（两现网调用点均 rgb() 实色）。
    //  非轴对齐/ga≠1 → 降级。
    if (this.accMode && this.gco === 'multiply' && col && col[3] === 1 && geo && geo.rot === 0
      && !geo.flipX && !geo.flipY && this.ga === 1 && this.filterV === 'none') {
      this.push(3, null, true, null, 0, 0, 1, 1,
        geo.dx, geo.dy, geo.dw, geo.dh, 0, 1,
        col[0] / 255, col[1] / 255, col[2] / 255, false, false, false, false, null);
      return;
    }
    if (!col || !geo || (this.gco !== 'source-over' && this.gco !== 'lighter')) {
      if (this.accMode && this.rasterizeFillRect(x, y, w, h)) return;
      this.flushForFallback();
      if (this.accMode && !this.ensureBridgedNow()) { this.stats.fallback++; return; }
      (this.raw as CanvasRenderingContext2D).fillRect(x, y, w, h);
      this.stats.fallback++;
      return;
    }
    const A = col[3] * this.ga;
    if (A <= 0) return;
    this.push(this.gco === 'lighter' ? 1 : 0, null, true, null, 0, 0, 1, 1,
      geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, A,
      col[0] / 255, col[1] / 255, col[2] / 255,
      geo.flipX, geo.flipY, false, false, null);
  }

  /** 不可直译 drawImage 的统一回退口：flush 保序 + acc 态降级换桥 + raw 原参重放。 */
  private rawDrawImage(img: CanvasImageSource, rest: unknown[]): void {
    this.flushForFallback();
    if (this.accMode && !this.ensureBridgedNow()) { this.stats.fallback++; return; }
    const raw = this.raw;
    if (raw) Reflect.apply(raw.drawImage, raw, [img, ...rest]);
    this.stats.fallback++;
  }

  /** ★B2b acc drawImage 隔离栅格化（ctx.filter 非 none 的源级滤镜族——滤镜在
   *  scratch 上施加后 SO 合成回原设备矩形=像素恒等;仅 source-over 态可隔离） */
  private rasterizeDrawImage(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    geo: { dx: number; dy: number; dw: number; dh: number; rot: number; flipX: boolean; flipY: boolean }): boolean {
    if (this.clipped || this.gco !== 'source-over' || this.filterV === 'none') return false;
    const { a, b, c, d, e, f } = this.m;
    const xs = [geo.dx, geo.dx + geo.dw, geo.dx, geo.dx + geo.dw];
    const ys = [geo.dy, geo.dy, geo.dy + geo.dh, geo.dy + geo.dh];
    void xs; void ys;
    // 几何已由 decode 解出（设备空间）——rot/flip 用中心锚变换在 scratch 复现
    const bx0 = geo.dx - 1, bx1 = geo.dx + geo.dw + 1;
    const by0 = geo.dy - 1, by1 = geo.dy + geo.dh + 1;
    const fx = Math.floor(bx0), fy = Math.floor(by0);
    const sx2 = Math.ceil(bx1) - fx, sy2 = Math.ceil(by1) - fy;
    if (sx2 <= 0 || sy2 <= 0 || sx2 > 4096 || sy2 > 4096) return false;
    const sc = accScratch(sx2, sy2);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx2, sy2);
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    sctx.imageSmoothingEnabled = this.smooth;
    try { sctx.filter = this.filterV; } catch { return false; }
    if (geo.rot || geo.flipX || geo.flipY) {
      sctx.translate(geo.dx + geo.dw / 2, geo.dy + geo.dh / 2);
      if (geo.rot) sctx.rotate(geo.rot);
      if (geo.flipX || geo.flipY) sctx.scale(geo.flipX ? -1 : 1, geo.flipY ? -1 : 1);
      sctx.drawImage(img, sx, sy, sw, sh, -geo.dw / 2, -geo.dh / 2, geo.dw, geo.dh);
    } else {
      sctx.drawImage(img, sx, sy, sw, sh, geo.dx, geo.dy, geo.dw, geo.dh);
    }
    this.markDynamic(sc);
    this.push(0, null, false, sc, 0, 0, sx2, sy2, fx, fy, sx2, sy2, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();
    return true;
  }

  /** ★B2b acc fillRect 隔离栅格化（fillStyle 渐变/图案/非解析色——直译不出,
   *  栅格化到 scratch 保像素恒等;失败返 false → 调用方降级）。 */
  private rasterizeFillRect(x: number, y: number, w: number, h: number): boolean {
    // multiply 等改面算子不可隔离（见 rasterizeOp 注）→ 整帧降级
    if (this.clipped || this.gco !== 'source-over') return false;
    const { a, b, c, d, e, f } = this.m;
    const xs = [a * x + c * y + e, a * (x + w) + c * y + e, a * x + c * (y + h) + e, a * (x + w) + c * (y + h) + e];
    const ys = [b * x + d * y + f, b * (x + w) + d * y + f, b * x + d * (y + h) + f, b * (x + w) + d * (y + h) + f];
    const bx0 = Math.min(...xs) - 1, bx1 = Math.max(...xs) + 1;
    const by0 = Math.min(...ys) - 1, by1 = Math.max(...ys) + 1;
    const fx = Math.floor(bx0), fy = Math.floor(by0);
    const sx = Math.ceil(bx1) - fx, sy = Math.ceil(by1) - fy;
    if (sx <= 0 || sy <= 0 || sx > 4096 || sy > 4096) return false;
    const sc = accScratch(sx, sy);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx, sy);
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    try { sctx.fillStyle = this.fillStyleV as string | CanvasGradient | CanvasPattern; } catch { return false; }
    sctx.fillRect(x, y, w, h);
    this.markDynamic(sc);
    this.push(0, null, false, sc, 0, 0, sx, sy, fx, fy, sx, sy, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();
    return true;
  }

  /** 几何解码：CTM×dst 矩形 → {dx,dy,dw,dh,rot,flipX,flipY}。斜切=不可表达（null）。
   *  ★R3-F3:结果写单槽（this._geo）复用——消费即弃（两调用点均同步读完即丢,
   *  中途无 decode 重入），零逐帧分配。 */
  private decode(dx: number, dy: number, dw: number, dh: number):
    { dx: number; dy: number; dw: number; dh: number; rot: number; flipX: boolean; flipY: boolean } | null {
    const g = this._geo;
    const { a, b, c, d, e, f } = this.m;
    if (b === 0 && c === 0) {
      const x0 = fround(a * dx) + e, x1 = fround(a * (dx + dw)) + e;
      const y0 = fround(d * dy) + f, y1 = fround(d * (dy + dh)) + f;
      g.dx = Math.min(x0, x1); g.dy = Math.min(y0, y1);
      g.dw = Math.abs(x1 - x0); g.dh = Math.abs(y1 - y0);
      g.rot = 0; g.flipX = a < 0; g.flipY = d < 0;
      return g;
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
    // ★R2-F1（2026-09-25 红蓝实锤）:正交列恒等式 v̂=sign(det)·û⊥——det<0 的镜像
    //  落【局部 V 轴】（flipY,rot=atan2(b,a) 不变）,det>0 无镜像。旧码 flipX=det<0
    //  =内容点反射 180°（受击面:Arrow PROJ_ROT_RIGHT 族 16/34/190/837/1023/485
    //  左斜飞+弹 630——quadSprite flip=u/v 区间反向=旋转【前】内容镜像,推导见
    //  tests/b2-shim-executor.test.ts ★R2-F1 判别器）。
    g.dx = fround((cx + cx2) / 2) - dw * lu / 2;
    g.dy = fround((cy + cy2) / 2) - dh * lv / 2;
    g.dw = dw * lu; g.dh = dh * lv;
    g.rot = Math.atan2(b, a);
    g.flipX = false; g.flipY = det < 0;
    return g;
  }

  // ================= 队列与 flush =================

  private push(tier: 0 | 1 | 2 | 3, _e: TexEntry | null, solid: boolean, img: CanvasImageSource | null,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number, rot: number, alpha: number,
    fr: number, fg: number, fb: number, flipX: boolean, flipY: boolean, smooth: boolean,
    dynamic: boolean, pair: PairReg | null): void {
    const rec = this.pool ?? ({} as QuadRec);
    this.pool = rec.next;
    rec.tier = tier; rec.solid = solid; rec.img = img;
    rec.sx = sx; rec.sy = sy; rec.sw = sw; rec.sh = sh;
    rec.dx = dx; rec.dy = dy; rec.dw = dw; rec.dh = dh;
    rec.rot = rot; rec.alpha = alpha; rec.fr = fr; rec.fg = fg; rec.fb = fb;
    rec.flipX = flipX; rec.flipY = flipY; rec.smooth = smooth;
    rec.dynamic = dynamic; rec.pair = pair; rec.next = null;
    rec.texKind = pair ? 'pair' : (dynamic ? 'full' : 'region');
    if (this.tail) this.tail.next = rec; else this.head = rec;
    this.tail = rec;
    if (tier === 0) this.stats.emitSO++;
    else if (tier === 2) this.stats.emitErase++;
    else if (tier === 3) this.stats.emitMult++;
    else this.stats.emitADD++;
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
   *  GL 失败 → 全队列 2D 重放（重放面=原参,保序）。
   *  ★B2b acc 态：改走 flushAcc（单 FBO 累积直发,无 present 无回贴）。 */
  flush(): void {
    if (!this.head) return;
    if (this.accMode) { this.flushAcc(); return; }
    const glw = this.glw && !this.glw.unavailable ? this.glw : this.host.acquireGl();
    const wctx = this.host.worldCtx();
    if (!glw || glw.unavailable || !wctx) { this.replay2D(); return; }
    const w = this.host.worldW(), h = this.host.worldH();
    // SO 批（含尘对合并 quad——(ONE,1−SA) 下 dst 衰减由 quad α=e 驱动）
    if (this.hasTier(0)) this.presentBatch(glw, wctx, w, h, 0, false);
    // ADD 批（(ONE,ONE) 逐加;2D 'lighter' 整批回贴=加法交换律保位）
    if (this.hasTier(1)) this.presentBatch(glw, wctx, w, h, 1, true);
    // ★R1-F3b:tier-2/3 覆盖——残队跨档防御面（acc 残帧异常降级/ensureBridged 旧形状
    //  漏 flush 的队列）曾在此被 popAll 静默弃（presentBatch 只发 tier 0/1）;现按 2D
    //  算子直画 wctx（erase=destination-out 削已回贴全量/mult=multiply）。层序=批后
    //  追加,与原发射序有偏差——仅降级应急路径可达（正常链降级前已 flush）,census 有界。
    if (this.hasTier(2) || this.hasTier(3)) this.replayTier23(wctx);
    this.popAll();
  }

  /** ★B2b acc flush：整队列按【发射序】逐条混合进开着的世界 FBO——
   *  无批拆分无 present（2D 每条 drawImage 即时落面的语义;SO/ADD 交错序保持=
   *  B2 登记的「跨档序偏差」在 acc 态自然消失,比 bridge 更贴近 2D 原语义）。
   *  尘对合并 quad 的 dst=累积面 ⇒ erase 衰减吃到身后全部已画内容=原版
   *  destination-out 对 worldCanvas 语义（B2b 步2）;tier-2 独立削底 quad 同理。
   *  GL 不可用/纹理解析失败 → host.degradeAcc 降级（FBO 现量 present 到
   *  worldCanvas）+ 全队列 2D 重放（宁回退不丢精灵,B2 判例沿袭）。 */
  private flushAcc(): void {
    if (!this.head) return;
    const glw = this.glw && !this.glw.unavailable ? this.glw : this.host.acquireGl();
    if (!glw || glw.unavailable) { this.accFail('nogl'); return; }
    // 预解析门（bridge presentBatch 同款;动态源在发射期解析）
    for (let p: QuadRec | null = this.head; p; p = p.next) {
      if (p.solid || p.pair || p.dynamic) continue;
      if (!this.resolveTex(glw, p)) { this.accFail('tex'); return; }
    }
    // 开 FBO（帧首段 clear;后续段续交幂等）
    if (!glw.isAccumOpen('world')) {
      const w = this.host.worldW(), h = this.host.worldH();
      glw.resize(w, h);
      glw.begin('world', true);
      if (glw.unavailable) { this.accFail('begin'); return; }
    }
    // 逐条发射（连续同档合并 blend 切换;blend 离场还原 (ONE,1−SA) 基态）
    let curTier = -1;
    for (let p: QuadRec | null = this.head; p; p = p.next) {
      if (p.tier !== curTier) {
        if (curTier === 1) glw.blendAdditive(false);
        if (curTier === 2) glw.blendErase(false);
        if (curTier === 3) glw.blendMult(false);
        if (p.tier === 1) glw.blendAdditive(true);
        if (p.tier === 2) glw.blendErase(true);
        if (p.tier === 3) glw.blendMult(true);
        curTier = p.tier;
      }
      if (p.solid) {
        const o = QOPTS;
        o.alpha = p.alpha; o.tint = TINT3; TINT3[0] = p.fr; TINT3[1] = p.fg; TINT3[2] = p.fb;
        o.rot = p.rot; o.flipX = false; o.flipY = false; o.smooth = false;
        glw.quadSprite(WHITE_E(glw), 0, 0, 1, 1, p.dx, p.dy, p.dw, p.dh, o);
        continue;
      }
      const e = this.resolveTex(glw, p);
      if (!e) { if (curTier === 1) glw.blendAdditive(false); if (curTier === 2) glw.blendErase(false); if (curTier === 3) glw.blendMult(false); this.accFail('tex2'); return; }
      const usx = p.texKind === 'full' ? p.sx : 0;
      const usy = p.texKind === 'full' ? p.sy : 0;
      const o = QOPTS;
      o.alpha = p.alpha; o.tint = null;
      o.rot = p.rot; o.flipX = p.flipX; o.flipY = p.flipY; o.smooth = p.smooth;
      glw.quadSprite(e, usx, usy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh, o);
    }
    if (curTier === 1) glw.blendAdditive(false);
    if (curTier === 2) glw.blendErase(false);
    if (curTier === 3) glw.blendMult(false);
    this.popAll();
    this.stats.flushes++;
  }

  /** acc 发射失败收口：GL 存活且 FBO 有量 → 降级换桥（present 已画内容到
   *  worldCanvas）+ 全队列 2D 重放;无法降级 → 弃队列（帧已不可救,B2 弃画
   *  判例同款——不动已画内容）。 */
  private accFail(why: string): void {
    const hadFbo = this.glw?.isAccumOpen('world') ?? false;
    if (this.host.degradeAcc && (hadFbo || why === 'nogl')) {
      if (this.host.degradeAcc()) { this.replay2D(); return; }
    }
    this.popAll();
  }

  /** ★B2b 隔离栅格化（acc 态不可直译算子的像素恒等兜底——方案 B0 设计落地）：
   *  以【当前镜像 CTM 平移整数设备偏移】把该算子栅格化到独立小 scratch
   *  （整数平移下 Skia 覆盖率逐位不变=亚像素相位保持）,再以 (ONE,1−SA) quad
   *  1:1 合成回原设备矩形=source-over 逐位同。scratch 即发即弃（发射前立即
   *  flush,防同帧二次栅格化覆写同面）。仅 strokeRect 有调用点;失败返 false
   *  →调用方降级。 */
  private rasterizeOp(op: string, args: unknown[]): boolean {
    const x = args[0] as number, y = args[1] as number;
    const w = args[2] as number, h = args[3] as number;
    // ★隔离栅格化只保「落笔」类算子——multiply 等改面算子在透明 scratch 上
    //  栅格化≠原语义（dst 缺席）,必须整帧降级走真 2D 面
    if (this.clipped || this.gco !== 'source-over') return false;
    const { a, b, c, d, e, f } = this.m;
    // 设备 bbox（四角 CTM 变换;含 lineWidth 半宽外扩+AA 1px 边）
    const xs = [a * x + c * y + e, a * (x + w) + c * y + e, a * x + c * (y + h) + e, a * (x + w) + c * (y + h) + e];
    const ys = [b * x + d * y + f, b * (x + w) + d * y + f, b * x + d * (y + h) + f, b * (x + w) + d * (y + h) + f];
    const pad = op === 'strokeRect' ? (this.lineWidthV * Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))) / 2 + 1 : 1;
    const bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad;
    const by0 = Math.min(...ys) - pad, by1 = Math.max(...ys) + pad;
    const fx = Math.floor(bx0), fy = Math.floor(by0);
    const sx = Math.ceil(bx1) - fx, sy = Math.ceil(by1) - fy;
    if (sx <= 0 || sy <= 0 || sx > 4096 || sy > 4096) return false;
    const sc = accScratch(sx, sy);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx, sy);
    // 整数设备平移 (−fx,−fy) 后同 CTM 栅格化——覆盖率与原位逐位同
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    sctx.strokeStyle = this.strokeStyleV;
    sctx.lineWidth = this.lineWidthV;
    sctx.strokeRect(x, y, w, h);
    // 发射:scratch=动态源（逐帧重画）,UV=整幅,设备矩形 1:1;α 已烘进 scratch
    this.markDynamic(sc);   // 稳定 dyn 键→texRefresh 复用纹理（防 createTexture churn）
    this.push(0, null, false, sc, 0, 0, sx, sy, fx, fy, sx, sy, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();   // 即发即弃（acc flush=直发累积面;保序+防 scratch 覆写）
    return true;
  }

  private hasTier(t: 0 | 1 | 2 | 3): boolean {
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
        const o = QOPTS;
        o.alpha = p.alpha; o.tint = TINT3; TINT3[0] = p.fr; TINT3[1] = p.fg; TINT3[2] = p.fb;
        o.rot = p.rot; o.flipX = false; o.flipY = false; o.smooth = false;
        glw.quadSprite(WHITE_E(glw), 0, 0, 1, 1, p.dx, p.dy, p.dw, p.dh, o);
      } else {
        const e = this.resolveTex(glw, p);
        if (!e) continue;   // 预解析门已兜;防御支
        // ★UV 空间分道（角色透明案修正）:裁剪件 UV=整幅;全幅件 UV=页内矩形
        const usx = p.texKind === 'full' ? p.sx : 0;
        const usy = p.texKind === 'full' ? p.sy : 0;
        const o = QOPTS;
        o.alpha = p.alpha; o.tint = null;
        o.rot = p.rot; o.flipX = p.flipX; o.flipY = p.flipY; o.smooth = p.smooth;
        glw.quadSprite(e, usx, usy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh, o);
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
      if (hit && glw.texAlive(hit)) {
        // ★R3-F1 驻留上界:满容触达刷新（LRU）——驱逐只删 JS 侧 Map 条目,
        //  GL 纹理仍驻留（texFromRegion 键幂等）由层 192MB LRU 兜底
        if (sub.size >= TEX_CACHE_SUB_CAP) { sub.delete(packed); sub.set(packed, hit); }
        return hit;
      }
      if (hit) sub.delete(packed);   // 死条目清位（占容不回收=上界击穿）
    } else {
      sub = new Map();
      if (this.texCache.size >= TEX_CACHE_OUTER_CAP) {
        const oldest = this.texCache.keys().next();
        if (!oldest.done) this.texCache.delete(oldest.value);
      }
      this.texCache.set(id, sub);
    }
    const key = `er:${id}:${p.sx},${p.sy},${p.sw},${p.sh}`;
    const e = glw.texFromRegion(key, p.img as TexImageSource, p.sx, p.sy, p.sw, p.sh);
    if (e) {
      while (sub.size >= TEX_CACHE_SUB_CAP) {
        const oldest = sub.keys().next();
        if (oldest.done) break;
        sub.delete(oldest.value);
      }
      sub.set(packed, e);
      this.stats.uploads++;
    }
    return e;
  }

  /** GL 失败逃生:全队列按原序 2D 重放。【设备空间重放】重放时 raw CTM 已非发射时
   *  语境——统一 setTransform(identity) 后按解码矩形重画（rot/flip 走中心锚变换），
   *  gCO 按 tier 重置;紧急路径（GL 中帧死亡）,视觉正确即可。
   *  ★R1-F1:gCO=tier→2D 算子全表（TIER_GCO）——旧码 `tier===1?'lighter':'source-over'`
   *  把 tier-2 ERASE 重放成不透明精灵（削底变盖面）/tier-3 MULT 重放成实色块。 */
  private replay2D(): void {
    const raw = this.raw;
    if (!raw) { this.popAll(); return; }
    for (let p = this.head; p; p = p.next) {
      this.drawRec2D(raw, p);
      this.stats.replays++;
    }
    this.popAll();
  }

  /** ★R1-F3b bridge flush 的 tier-2/3 覆盖面:2D 侧按算子直画（层序=SO/ADD 批后
   *  追加,降级应急语义）。 */
  private replayTier23(wctx: CanvasRenderingContext2D): void {
    for (let p = this.head; p; p = p.next) {
      if (p.tier === 2 || p.tier === 3) this.drawRec2D(wctx, p);
    }
  }

  /** 单 rec 2D 直画（replay2D/tier-2/3 覆盖共用;设备空间中心锚,gCO=tier 全表）。 */
  private drawRec2D(ctx: CanvasRenderingContext2D, p: QuadRec): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = p.alpha;
    ctx.globalCompositeOperation = TIER_GCO[p.tier];
    if (p.solid) {
      ctx.fillStyle = `rgb(${Math.round(p.fr * 255)},${Math.round(p.fg * 255)},${Math.round(p.fb * 255)})`;
      if (p.rot) {
        ctx.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.dw / 2, -p.dh / 2, p.dw, p.dh);
      } else {
        ctx.fillRect(p.dx, p.dy, p.dw, p.dh);
      }
    } else if (p.pair) {
      // 尘对重放=2D 两步原样（erase destination-out + add lighter;p.img=erase 面）
      const img = p.img as HTMLCanvasElement | null;
      if (img) {
        ctx.globalCompositeOperation = 'destination-out';
        if (p.rot || p.flipX || p.flipY) {
          ctx.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
          if (p.rot) ctx.rotate(p.rot);
          if (p.flipX || p.flipY) ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
          ctx.drawImage(img, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(p.pair.add, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
        } else {
          ctx.drawImage(img, p.dx, p.dy, p.dw, p.dh);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(p.pair.add, p.dx, p.dy, p.dw, p.dh);
        }
      }
    } else if (p.img) {
      ctx.imageSmoothingEnabled = p.smooth;
      if (p.rot || p.flipX || p.flipY) {
        ctx.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
        if (p.rot) ctx.rotate(p.rot);
        if (p.flipX || p.flipY) ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
        ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
      } else {
        ctx.drawImage(p.img, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
      }
    }
    ctx.restore();
  }
}

/** 1×1 白纹理（fillRect 纯色面;惰性建,键恒 '__white'——GLSpriteLayer.fillQuad 同款）。
 *  ★R1-F7:命中面加 texAlive 卫兵——层 192MB LRU 逐出/releaseAll 清表（切世界/读档）
 *  后 WeakMap 缓存的是死条目,续用=画已删纹理（fillRect 全族静默消失）。 */
function WHITE_E(glw: GLSpriteLayer): TexEntry {
  const hit = WHITE_CACHE.get(glw);
  if (hit && glw.texAlive(hit)) return hit;
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

/** ★B2b 隔离栅格化 scratch（模块级复用,只增不减——CanvasWatch churn 判例:
 *  禁逐帧新建;内容即发即弃（push 后立即 flush 消费）,同帧多次栅格化按序
 *  复用同面无串味）。★R3-F8（2026-09-25 红蓝批 B）：三栅格化消费点的
 *  getContext 统一带 willReadFrequently——纯上传中转（markDynamic→texRefresh
 *  texImage2D）,SHM/CPU 后备不占 IOSurface,GLSpriteLayer.texSubUpdate 判例同注;
 *  本面无 GL readPixels 读回需求（评估过,非盲改）。 */
let _accScratch: HTMLCanvasElement | null = null;
function accScratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!_accScratch) {
    _accScratch = document.createElement('canvas');
    _accScratch.width = 64; _accScratch.height = 64;
  }
  // 只增不减 resize（缩小不缩——churn 面归零;尺寸变化自动清屏）
  if (_accScratch.width < w) _accScratch.width = w;
  if (_accScratch.height < h) _accScratch.height = h;
  return _accScratch;
}

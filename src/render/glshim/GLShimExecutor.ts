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
import { texEpoch, texId } from '../texId';
import { liqpolish } from '../perfFlags';   // ★liqpolish 微抛光刀总闸（texCheck 批检/pushLiquidAddBatch 消费）

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
  /** ★R1b-5（2026-09-28 雷雨 degradeAcc 逐帧定谳,可选）：样式工厂 ctx——
   *  acc 态 createLinearGradient/createRadialGradient/createPattern 用它产
   *  真样式对象（CanvasGradient/Pattern 是上下文无关的普通样式对象,可跨 ctx
   *  使用）。缺省=执行器自建 1×1 离屏 ctx（真浏览器恒可达;node 测试无 document
   *  时由 host 注入 FakeCtx 面或回退旧降级链）。 */
  styleCtx?(): CanvasRenderingContext2D | null;
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
  /** ★I类(2026-09-27):bake 期已上传的固定纹理（bolt 烘焙面）——resolve 直取不再重传。
   *  背景:共享 boltScratch 同帧多次烘焙时,flush 期逐 rec texRefresh 全部读到
   *  【最后烘焙】的字节（1 实体 ≤7 bolts/ArcSurge ≤13×3 发,单槽+单键=先行 quad
   *  全部错拿末次内容）。preTex=bake 字节仍新鲜时立即上传的驻留纹理。 */
  preTex: TexEntry | null;
  pair: PairReg | null;               // 尘预乘对合并纹理记录
  /** ★R1b-6:bake 期字节快照（preTex 非 null 时由 uploadScratchNow 定格）——
   *  GL 失败 replay2D 直画共享 scratch=末次烘焙字节的错画源,快照=各自 bake 内容。
   *  ★P0 去画布化（2026-09-28 灾难链定谳）:快照由「每 bake createElement 一张
   *  新画布」改【区域字节 ImageData】——霜月尘帧数千 bake 曾打出 531-2376
   *  canvas/秒出生风暴（GC 432-580MB 锯齿→CONTEXT_LOST×N→GPU 压力熔断→chunk
   *  降档+波场看门狗回落全 2D）;重放经 preSnapScratch 共享面中转（putImageData）,
   *  稳态零画布出生零 GPU 面分配。每 bake 独立对象无池化无容量=R1b-6 语义原样。 */
  preSnap: ImageData | null;
  /** ★UV 空间分道（2026-09-24 角色透明案定谳修正）:region=裁剪小纹理(UV=0,0,sw,sh)
   *  /full=全画布纹理(UV=sx,sy,sw,sh=页内矩形)/pair=尘对合并面(UV=0,0,w,h)。
   *  曾把页内矩形直接喂裁剪纹理 → UV 出界 CLAMP=大面积透明/常量色块（用户实报案）。 */
  texKind: 'region' | 'full' | 'pair';
  /** ★C5 雨批（非 null=本 rec 是一个预变换四边形批,上列几何/源字段全部不用;
   *  tier 恒 0=SO——雨无 ADD 需求,纯 SO 单档）。push 写 null+本类型特设。 */
  batch: RainBatchRef | null;
  next: QuadRec | null;               // 池链
}

/** 尘预乘对登记（Renderer.dustPremulPair 烘焙时注册） */
interface PairReg {
  w: number; h: number;
  gl: Uint8Array;                     // 合并字节（rgb=预乘 add,a=erase e）
  tex: TexEntry | null;               // 惰性建（首 flush）
  add: HTMLCanvasElement;             // 吞抑标记（后随 add drawImage）
}

/** ★R1b-6 bake 快照账（uploadScratchNow 产物;pending/multi 共用值型）
 *  ★P0 去画布化:snap=区域字节 ImageData（每 bake 独立对象,无池化无容量概念
 *  ——R1b-6「重放=各自 bake 字节」语义不变,风暴根治）;preBytes=烘焙点已持
 *  现成 ImageData 直挂（尘族三烘焙点——零拷贝零新分配支）。
 *  ★shineslice（2026-09-28）:tint=quad 乘法色（delta 字节/255）——切片路径
 *  纹理=sprite-only 面（delta 不烘进纹理）,乘法由消费 rec 的顶点色承担
 *  （flushAcc/presentBatch 对非 solid rec 直通 uTint;白=零开销 null 同旧）。 */
interface BakeSnap {
  img: object;
  tex: TexEntry;
  /** bake 期字节定格（重放面字节源;null=快照失败按旧链 p.img 兜底） */
  snap: ImageData | null;
  /** ★shineslice:本 bake 消费 rec 的乘法 tint（缺省 undefined=白,零行为差） */
  tint?: readonly [number, number, number];
}

/** ★C5 雨批引用（2026-09-26 rain-gl 收官刀;WeatherRenderer 构建,Renderer
 *  emitRainQuadBatch 中介递入）：N 个预变换四边形单 drawArrays 发射。
 *  data 布局=6 顶点/quad×7 float（x,y,u,v,r,g,b）;img/key=GL 纹理惰性解析
 *  （flush 期 texFromImage 幂等键——层重建/LRU 逐出自愈）;replay=降级帧 2D
 *  逐滴回放闭包（宁回退不丢精灵判例;读构建方单槽 scratch,同帧消费）。 */
interface RainBatchRef {
  img: CanvasImageSource;
  key: string;
  data: Float32Array;
  quads: number;
  replay: (ctx: CanvasRenderingContext2D) => void;
  /** ★C5b（2026-09-27）雪沙批面：true=stride 8（x,y,u,v,r,g,b,a——第 4 分量逐
   *  quad α,沙尘叠画 180/255）走 quadBatchRgba;缺省 false=雨条 stride 7 原通道。 */
  rgba?: boolean;
  /** ★F-gore（2026-09-28）批段=裁剪小纹理：img 的 (sx,sy,sw,sh) 行切片经
   *  texFromRegion 建键（region 语义 UV=0,0,sw,sh,与 resolveTex er: 键同族——
   *  逐件 quadSprite 路径与批路径共享同一条目）;缺省=全幅 texFromImage（雨）。 */
  region?: { sx: number; sy: number; sw: number; sh: number };
}

/** ★F-gore 批段规格（Renderer.buildGoreQuadBatch 产出,pushGoreQuadBatch 消费）。
 *  gore 逐件形态（贴图+旋转+α+加性档）折进顶点批,段=「连续同 (纹理行切片,tier)
 *  运行」——发射序=2D 绘制序逐一同相（C1 排序判例:不重排,只在运行边界断段）,
 *  单段一次 quadBatchRgba drawArrays。 */
export interface GoreSegSpec {
  img: CanvasImageSource;
  /** GL 纹理幂等键（=resolveTex er:texId:ep:sx,sy,sw,sh 同格式,两路径共享条目） */
  key: string;
  region: { sx: number; sy: number; sw: number; sh: number };
  /** 顶点数据（共享槽的 subarray 视图;6 顶点/quad×8 float,rgb=a=ga 折入） */
  data: Float32Array;
  quads: number;
  /** 0=SO 1=ADD（gore 16/17 火苗 'lighter' 档）——blend 切换由 rec.tier 驱动 */
  tier: 0 | 1;
  /** 降级帧 2D 逐件回放闭包（宁回退不丢精灵;角点仿射直构,雨批同式） */
  replay: (ctx: CanvasRenderingContext2D) => void;
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
  regionUploads: number; // ★P1-B 子区增量上传笔数（texRefreshRegion 支;探针分账面）
  replays: number;      // GL 失败 2D 重放
  emitBatchQuads: number; // ★C5 雨批发射四边形数（quadBatch 路径;探针对账面）
  /** ★闪屏定谳仪（2026-09-30）：accFail 原因分布（'nogl'/'tex'/'tex2'/'gl'/'begin'/
   *  'op:*'——b2b-acc-degraded 计数无归因面,本案 1473 次降级=原因黑箱;原因计数
   *  直连 F5 报告 render.acc.shim.accFails）。 */
  accFails: Record<string, number>;
  /** ★b2b-acc-degraded 定谳仪（2026-10-05,清偿批）：acc 窗内触发整帧降级的 op
   *  分类计数（每帧清;键='rv:measureText'/'tail:fillText'/'di:clip'/'fr:style'/
   *  'fail:tex'/'sty:createRadialGradient'——前缀族见 noteDegradeTrigger 注）。
   *  首触发归因（调用方栈）走静态 GLShimExecutor.degradeCallers（每帧首个触发
   *  付一次 stack 采集,稳态零成本）。 */
  degradeTriggers: Record<string, number>;
}

const fround = Math.fround;

/** ★b2b-acc-degraded 定谳仪：压缩调用方栈（跳过 shim 内部帧,取前 3 个外部落笔帧,
 *  `fn file.ts:line` 用 '<-' 连接）。只在每 acc 窗首触发调用一次（降级帧定谳税）。 */
function degradeCallerSite(): string {
  const st = new Error().stack;
  if (!st) return '';
  const out: string[] = [];
  for (const line of st.split('\n')) {
    const s = line.trim();
    if (!s || s === 'Error') continue;
    if (s.includes('GLShimExecutor.ts')) continue;   // shim 内部帧（含 Proxy 箭头）
    out.push(shortStackFrame(s));
    if (out.length >= 3) break;
  }
  return out.join('<-');
}

function shortStackFrame(s: string): string {
  // "at fn (http://host/p/file.ts:12:34)" / "at http://…/file.ts:12:34" 两形
  const m = /^at\s+(?:(.*?)\s+\()?(.*?):(\d+):\d+\)?$/.exec(s);
  if (m) {
    const file = (m[2] as string).split('/').pop() as string;
    return `${m[1] ? m[1] + ' ' : ''}${file}:${m[3]}`;
  }
  return s.length > 80 ? s.slice(0, 80) : s;
}

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

/** ★P1-B 子区上传门（2026-09-28 纯函数供单测/两调用点共用）：子区 <半幅 才换刀
 *  （登记债注中预案分档——子区收益 ≥2× 才值得吃抠图的第二次 premul 往返 ±1LSB;
 *  大子区/越界/零尺寸保整幅精确链）。cw/ch=宿主画布（accScratch/boltScratch）
 *  当前尺寸。 */
export function p1bRegionGate(sw: number, sh: number, cw: number, ch: number): boolean {
  return sw > 0 && sh > 0 && sw <= cw && sh <= ch && sw * sh * 2 < cw * ch;
}

export class GLShimExecutor {
  /** ★P1-B 子区上传逃生门（探针 A/B 面+回滚口;缺省开。StormLightning.BOLT_BAKE_OFF
   *  判例同款静态可扭面——探针页内 m.GLShimExecutor.P1B_REGION_OFF=true 切臂） */
  static P1B_REGION_OFF = false;
  /** ★EoL 残影风暴定谳刀逃生门（2026-10-03）：源交集为空 no-op 直返支的回滚口
   *  （缺省 false=no-op 门生效;置 true=恢复旧「全量 rawDrawImage+flush」链,
   *  探针 A/B 对拍用——scripts/_eol-ghost-census.mjs 消费）。 */
  static SRC_OOB_NOOP_OFF = false;
  /** ★b2b-acc-degraded 清偿①逃生门（2026-10-05）：acc 态 measureText 走专用度量
   *  ctx 直读支的回滚口（缺省 false=度量支生效;置 true=恢复旧「读值面→整帧
   *  降级」链,探针 A/B 对拍面,P1B_REGION_OFF 同族）。 */
  static RV_MEASURE_OFF = false;
  /** ★b2b-acc-degraded 清偿③逃生门（2026-10-05）：acc 态 fillText/strokeText 走
   *  rasterizeText 隔离栅格化支的回滚口（缺省 false=栅格化支生效;置 true=恢复
   *  旧「落笔长尾→整帧降级」链）。 */
  static TEXT_RASTER_OFF = false;
  /** ★清偿③文本栅格化每窗帽（P0-B 高频保险:逐 op 隔离栅格化=每 op 一次上传,
   *  只可承载低频落笔——每窗 fillText/strokeText 超 32 笔=疑似逐字形风暴,超帽
   *  笔回退降级原链）。窗界=attach/attachAcc（=每帧）。 */
  private static readonly TEXT_RASTER_CAP = 32;
  private textRasterCount = 0;
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
  /** ★b2b-acc-degraded 清偿②（2026-10-05）:textBaseline 镜像（旧码未镜像=acc 态
   *  set 静默丢失+降级后 bridge 不回放=潜在错位;且 rasterizeText 墨盒度量/重放
   *  需要基线值。canvas 缺省 'alphabetic'。） */
  private baselineV: CanvasTextBaseline = 'alphabetic';
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
  private stack: Array<{ m: typeof GLShimExecutor.prototype.m; ga: number; gco: GlobalCompositeOperation; smooth: boolean; fill: string | CanvasGradient | CanvasPattern; clip: boolean; stroke: string | CanvasGradient | CanvasPattern; lw: number; filter: string; font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline }> = [];
  /** 队列（单序表+tier 标签——重放保原序,SO/ADD 分批 present） */
  private head: QuadRec | null = null;
  private tail: QuadRec | null = null;
  private pool: QuadRec | null = null;
  /** 后随吞抑（尘对 add 面） */
  private suppressAdd: HTMLCanvasElement | null = null;
  /** 纹理缓存:texId → packed(sx,sy,sw,sh) → entry（静态稳定源） */
  private texCache = new Map<number, Map<number, { e: TexEntry; ep: number }>>();   // ★值带纪元(变体①终扫)
  /** 尘预乘对登记（Renderer 注册;erase/add 画布 → reg） */
  private pairs = new WeakMap<HTMLCanvasElement, PairReg>();
  /** 动态源登记（内容每绘都变的 scratch 面） */
  private dynamicSrc = new WeakSet<object>();
  private dynKeySeq = 0;
  private dynKeys = new WeakMap<object, string>();
  stats: ShimExecStats = GLShimExecutor.blankStats();
  /** ★b2b-acc-degraded 定谳仪：本窗（acc 窗）已做过首触发栈归因（每窗至多一次） */
  private _degradeAttributed = false;

  /** ★闪屏定谳仪（2026-09-30）：accFail 会话级累计账（静态,不随 frameReset 每帧清;
   *  key=`why` 或 `why:失败纹理键`——F5 报告 render.acc.accFailLedger 消费） */
  static accFailLedger: Record<string, number> = {};

  /** ★b2b-acc-degraded 定谳仪（2026-10-05 清偿批）会话级累计账（静态,不随帧清）：
   *  ①degradeOps=每次触发都计（键=op 前缀族,见 noteDegradeTrigger 注）——per-op
   *  频率账;②degradeCallers=每 acc 窗【首个】触发才计（键=`op <- 调用方栈3帧`,
   *  栈采集每窗至多一次=降级帧才付的定谳税）——帧级元凶构成清单。探针/F5 消费。 */
  static degradeOps: Record<string, number> = {};
  static degradeCallers: Record<string, number> = {};

  static blankStats(): ShimExecStats {
    return { draws: 0, emitSO: 0, emitADD: 0, emitErase: 0, emitMult: 0, pairEmitted: 0, pairSuppressed: 0, fallback: 0, flushes: 0, uploads: 0, regionUploads: 0, replays: 0, emitBatchQuads: 0, accFails: {}, degradeTriggers: {} };
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
    this.bakedTexPending = null;   // ★I类:跨帧陈旧烘焙 pending 禁串窗（残队同门）
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
    this.baselineV = (raw.textBaseline ?? 'alphabetic') as CanvasTextBaseline;   // ★清偿②
    this.clipped = false;
    // ★四柱掉帧批:路径镜像清窗（attach=窗开,模拟 ctx 路径从空起——raw 残路径
    //  不可读,与既有镜像态同口径）;描边样式收尾镜像从 raw 起步
    this.pathOps.length = 0;
    this.pathOverflow = false;
    this.lineCapV = (raw.lineCap ?? 'butt') as CanvasLineCap;
    this.lineJoinV = (raw.lineJoin ?? 'miter') as CanvasLineJoin;
    this.miterLimitV = typeof raw.miterLimit === 'number' ? raw.miterLimit : 10;
    this._degradeAttributed = false;   // ★定谳仪:新窗重归因
    this.textRasterCount = 0;          // ★清偿③:每窗文本栅格化帽计数（=每帧窗）
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
    this.fontV = '10px sans-serif'; this.alignV = 'left'; this.baselineV = 'alphabetic';
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
    this.bakedTexPending = null;   // ★R1b-7:acc 窗残 pending 同门（attach 孪生守卫,
    //  旧码只清 multi 不清单槽——上帧 bake 未消费的 pending 跨帧错配本帧首笔同 img 绘制）
    this._degradeAttributed = false;   // ★定谳仪:新窗重归因
    this.textRasterCount = 0;          // ★清偿③:每窗文本栅格化帽计数（=每帧窗）
    this.active = true;
    return this.wrap();
  }

  /** ★B2b 降级换桥（host.degradeAcc 调用）：raw 重指真 worldCtx（worldCanvas 惰性
   *  建成后）,镜像态一次性回放（CTM/globalAlpha/gCO/smooth/stroke/lineWidth）。
   *  ★R3x（2026-09-28 雷击帧雨消失定谳）:raw 的 save 栈重建到镜像深度——acc 期
   *  save 只进镜像栈（raw=null 不转发）,换桥的 raw（惰性建 worldCanvas）栈为空。
   *  不重建则本帧后续 restore 弹镜像而 raw.restore() 对空栈 no-op → raw 停在
   *  换桥瞬间的局部变换（镜像则弹回世界变换）→ 两栈失同步:getTransform 消费面
   *  （雨/雪沙/液体/gore 批基 CTM）与 raw 直绘（2D 兜底/光栅化面回贴）全错位
   *  （旧注「save 栈深度差以当前态正确为准」只保了换桥【瞬间】,漏了后续 restore
   *  的分叉）。逐条【自底向上】「回放条目态→raw.save()」后再回放当前态,使后续
   *  restore 双栈同步弹出。clip 不可回放（canvas 无 region 读回）=换桥既有登记。 */
  bridge(raw: CanvasRenderingContext2D): void {
    this.raw = raw;
    this.accMode = false;
    // ① save 栈重建（自底向上;先于当前态回放——save 捕获的是回放时的现值）
    for (const s of this.stack) {
      raw.setTransform(s.m.a, s.m.b, s.m.c, s.m.d, s.m.e, s.m.f);
      try {
        raw.globalAlpha = s.ga;
        raw.globalCompositeOperation = s.gco;
        raw.imageSmoothingEnabled = s.smooth;
        raw.fillStyle = s.fill;
        raw.strokeStyle = s.stroke;
        raw.lineWidth = s.lw;
        raw.filter = s.filter;
        raw.font = s.font;
        raw.textAlign = s.align;
      } catch { /* 非法值保 raw 现状 */ }
      raw.save();
    }
    // ② 当前镜像态回放
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
      try { raw.textBaseline = this.baselineV; } catch { /* 非法值保 raw 现状 */ }   // ★清偿②
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
    this.bakedTexMulti.clear();   // ★N类:跨帧 preTex 账清零（残留=陈旧直取）
    this.bakedTexPending = null;  // ★R1b-7:单槽 pending 同账清（旧码漏——bridge 窗
    //  残留 pending 跨帧串到 acc 帧首笔 drawImage=上帧 bake 纹理错配本帧内容）
    this._frameSeq++;             // ★R3b-4 shineCell 键触帧账时基
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

  /** ★I类修复（2026-09-27 bolt 烘焙多雷同帧错拿字节）:bake 期【立即上传】口——
   *  共享 scratch 同帧多次烘焙时,flush 期逐 rec texRefresh 全部读到末次烘焙字节
   *  （1 实体 ≤7 bolts、ArcSurge ≤13 bolts×3 发/帧;旧单键 dynamic 路径=先行 quad
   *  全错）。本口在字节仍新鲜的 bake 点立即 texRefresh 到【调用方给的稳定键】
   *  （跨帧复用同纹理,零 createTexture 抖动）,挂入 pending 由下一个该 img 的
   *  acc drawImage 消费（rec.preTex=直取,resolveTex 不再重传）。
   *  ★R1b-6:同时快照 bake 字节——★P0 去画布化（2026-09-28 灾难链定谳）:旧实现
   *  每 bake createElement 一张新画布,霜月尘帧数千 bake=canvas 出生风暴
   *  （实测 2441.7/s·探针 _presnap-storm-probe;用户实报 531-2376/s→GC 432-580MB
   *  锯齿→CONTEXT_LOST×N→GPU 压力熔断 3 次/10s→chunk 192→96→64+主画布重建→
   *  波场看门狗 8235ms 回落全 2D）。现=【区域字节快照】:getImageData(0,0,w,h)
   *  一次性 CPU 拷贝（尘 s1/s2/boltScratch 等 willReadFrequently 软面=纯 memcpy;
   *  bolt 按烘焙 bbox 子区,严格小于旧整幅画布拷贝;烘焙点已持现成 ImageData 时
   *  经 preBytes 直挂=零拷贝零新分配）——稳态零画布出生零 GPU 面分配。重放面=
   *  putImageData 到模块级共享 scratch（preSnapScratch,滞回回落 accScratch 判例）。
   *  快照缺失（极端:非 2D 面/读回失败）仍按旧链 p.img 兜底。
   *  ★R3b-4:shineCell 键触帧账+帽（CAP 超限清扫 600 帧未触键 dropTexture——
   *  键空间=可见 shine 格并集,相机漫游无界增长会顶替 chunk 页等活纹理）。
   *  ★P1-B（2026-09-28）:可选子区参 (rw,rh)——bake 链 quad 实采 scratch 左上
   *  (0,0,rw,rh) 时按 p1bRegionGate 分档走 texRefreshRegion（雷暴持续期
   *  boltScratch 恒大滞回不回落,整幅/op=与 bake bbox 无关的浪费;子区门同判）;
   *  不带子区参的调用点（shine/empressTint——实采≈全幅,子区无收益）保整幅链。
   *  无 GL/非 bgl 会话 no-op（2D 兜底链本就逐 bolt 即画,无此病）。 */
  uploadScratchNow(img: HTMLCanvasElement, key: string, rw?: number, rh?: number,
    preBytes?: ImageData): void {
    if (!this.active || !this.glw || this.glw.unavailable) return;
    const regionPath = rw !== undefined && rh !== undefined && !GLShimExecutor.P1B_REGION_OFF
      && p1bRegionGate(rw, rh, img.width, img.height);
    const e = regionPath
      ? this.glw.texRefreshRegion(key, img, rw, rh)
      : this.glw.texRefresh(key, img);
    if (regionPath && e) this.stats.regionUploads++;
    if (!e) return;
    const rec0 = { img, tex: e, snap: preBytes ?? this.snapBakeRegion(img, rw, rh) };
    this.bakedTexPending = rec0;
    this.bakedTexMulti.set(img, rec0);
    if (key.startsWith('shineCell:')) {
      this.shineKeySeen.set(key, this._frameSeq);
      if (this.shineKeySeen.size > GLShimExecutor.SHINE_KEY_CAP) {
        for (const [k, fr] of this.shineKeySeen) {
          if (this._frameSeq - fr > GLShimExecutor.SHINE_KEY_IDLE) {
            this.shineKeySeen.delete(k);
            this.glw.dropTexture(k);   // 重访由 texRefresh 重建,幂等
          }
        }
      }
    }
  }

  /** ★shineslice（2026-09-28 登记债清算:TileShine 动态支逐格 6.4KB/格/帧上传+
   *  同量 getImageData 读回——叶绿素农场数百格在视=MB 级/帧）:动态 shine 格
   *  【逐 (格内容,动画相位) 稳定键】切片上 GPU。首见=_texFromRegion 幂等键建
   *  纹理（40×40 sprite-only 面,6.4KB 一次）+字节快照缓存;稳态命中=零上传
   *  零读回（纹理在驻留表+快照在账,直挂 pending 由下一笔同 img drawImage 消费）;
   *  delta 不烘进纹理——走 BakeSnap.tint → 消费 rec 顶点色 → quadSprite uTint
   *  （乘法在 GPU 逐 quad 施加,呼吸扫频零重传）。键=内容指纹（TileShine 侧
   *  3×3 邻域+帧相位）→ 同型格共享同纹理（变体数≪格数）;纹理被 LRU 逐出/
   *  清扫后 texFromRegion 由当前 scratch 幂等重建（内容键=当前字节即正确字节）。
   *  键空间与 shineCell 旧族共用 SHINE_KEY_CAP/SHINE_KEY_IDLE 帽账（1024/600 帧
   *  ——全前缀统一清扫,纹理+快照同摘）。返回 false=未接slice（调用方回 2D
   *  烘焙原链:delta 仍烘进 scratch）。 */
  uploadShineSlice(img: HTMLCanvasElement, key: string,
    tint: readonly [number, number, number]): boolean {
    if (!this.active || !this.glw || this.glw.unavailable) return false;
    const e = this.glw.texFromRegion(key, img, 0, 0, img.width, img.height);
    if (!e) return false;
    const fresh = !this.shineKeySeen.has(key);
    let snap = this.sliceSnaps.get(key);
    if (snap === undefined) {
      snap = fresh ? this.snapBakeRegion(img) : null;   // 首见才读回（稳态零 getImageData）
      this.sliceSnaps.set(key, snap);
    }
    const rec0: BakeSnap = { img, tex: e, snap, tint };
    this.bakedTexPending = rec0;
    this.bakedTexMulti.set(img, rec0);
    this.shineKeySeen.set(key, this._frameSeq);
    if (this.shineKeySeen.size > GLShimExecutor.SHINE_KEY_CAP) {
      for (const [k, fr] of this.shineKeySeen) {
        if (this._frameSeq - fr > GLShimExecutor.SHINE_KEY_IDLE) {
          this.shineKeySeen.delete(k);
          this.sliceSnaps.delete(k);
          this.glw.dropTexture(k);   // 重访由 texFromRegion 重建,幂等
        }
      }
    }
    return true;
  }
  private bakedTexPending: BakeSnap | null = null;
  /** ★N类（2026-09-27 变体①终扫）:bake 期上传的 1:N 消费账（img→最近 bake 纹理
   *  +字节快照）。帧界清空（frameReset）——跨帧残留=陈旧 preTex 直取,故必须随帧
   *  复位（★R1b-7:单槽 pending 与 multi 同账,attachAcc/attach 同门清）。 */
  private bakedTexMulti = new Map<object, BakeSnap>();
  /** bake 字节快照共享账（img→{tex,snap}） */
  private shineKeySeen = new Map<string, number>();
  /** ★shineslice（2026-09-28）:切片键→首见字节快照（重放面字节源;键空间与
   *  shineKeySeen 同账同帽,清扫同步摘除）。稳态命中零上传零读回的另一半——
   *  纹理侧 texFromRegion 幂等（首见才传）,本账负责「重放字节也只取一次」。 */
  private sliceSnaps = new Map<string, ImageData | null>();
  private _frameSeq = 0;
  private static SHINE_KEY_CAP = 1024;
  private static SHINE_KEY_IDLE = 600;
  /** ★R1b-6 bake 字节快照 → ★P0 去画布化（2026-09-28 灾难链定谳,原 snapBakeBytes）:
   *  区域字节定格=getImageData(0,0,w,h) 一次性 CPU 拷贝（快照域=消费 rec 的实采域:
   *  无 (rw,rh)=全幅——尘 8×8/shine 40×40/empressTint 帧面;带 (rw,rh)=烘焙子区——
   *  bolt bbox;越界钳回画面）。零画布出生（旧=每 bake createElement 一张,霜月
   *  数千 bake/帧=出生风暴本体）。非 2D 面/零尺寸/读回失败 → null（重放退 p.img
   *  旧链,与旧快照失败支同相）。 */
  private snapBakeRegion(img: HTMLCanvasElement, rw?: number, rh?: number): ImageData | null {
    if (img.width <= 0 || img.height <= 0) return null;
    const g = typeof img.getContext === 'function' ? img.getContext('2d') : null;
    if (!g) return null;
    const w = Math.min(rw ?? img.width, img.width);
    const h = Math.min(rh ?? img.height, img.height);
    if (w <= 0 || h <= 0) return null;
    try { return g.getImageData(0, 0, w, h); } catch { return null; }
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
          // ★R3x（2026-09-28 雷击帧雨消失定谳）:getTransform 双态统一回【镜像】——
          //  旧 attach 态回 raw 现值,而换桥帧（acc 期 accFail→degradeAcc→bridge）
          //  raw 与镜像必然分叉:acc 期世界变换只进镜像（raw=null 不转发）,bridge
          //  把 raw 定格在【换桥瞬间】的镜像值（常是某精灵局部变换）,其后 ctx 逐层
          //  restore 把镜像弹回世界变换,raw.restore() 对空栈 no-op 追不上 →
          //  raw 停在局部变换。getTransform 消费面（雨 C5/雪沙 C5b/液体 liqgl/
          //  gore F-gore 批与 bolt bake 的基 CTM）读 raw 现值 → 整批顶点按世界坐标
          //  直发 = 全部落画布外 = 雷击降级帧雨层整批消失、下一 acc 帧复现（用户
          //  截图 40/41 症状）。镜像=shim 自身绘制（geo decode）的唯一坐标真相,
          //  双态回镜像=批与实体同源零分叉;同步态下镜像≡raw（快照起步+逐式同步）,
          //  本支零行为差。
          if (prop === 'getTransform') {
            const m = self.m;
            return () => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
          }
          if (self.accMode) {
            if (prop === 'canvas') return self.canvasStub();
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
            if (prop === 'textBaseline') return self.baselineV;   // ★清偿②同门
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
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
              // ★R1b-5（2026-09-28 雷雨 degradeAcc 逐帧定谳）:样式工厂不再降级——
              //  旧码把 createRadialGradient/createLinearGradient/createPattern 归入
              //  「读值面→ensureBridged」支=acc 窗内一次样式工厂即【整帧降级】+
              //  present 回贴重放（degradeAcc 每帧 drawImage 1015ms=9.3% 稳态,
              //  Trace-20260928T184502 全帧样本唯一退化栈 draw@proj1457:1851）。而
              //  CanvasGradient/CanvasPattern 是【上下文无关】的普通样式对象（spec:
              //  opaque 工厂产物,addColorStop 后可跨 ctx 使用）→ 工厂 ctx 产真对象,
              //  fillStyle/strokeStyle 镜像收全值（R1-F4）,落笔由 rasterizeFillRect
              //  （渐变/图案）·rasterizePathOp（fill/stroke）·bridge 回放原样消费=
              //  零降级零像素差。工厂不可达（node 无 document 且 host 未注入）→
              //  回退旧降级链（宁降级不丢内容）。
              return (...args: unknown[]) => {
                const sc = self.styleCtx();
                if (!sc) {
                  self.noteDegradeTrigger(`sty:${prop}`);   // ★定谳仪
                  self.ensureBridged();
                  const r = self.raw as unknown as Record<string, (...a: unknown[]) => unknown>;
                  return r[prop](...args);
                }
                const f = (sc as unknown as Record<string, (...a: unknown[]) => unknown>)[prop];
                return f.apply(sc, args);
              };
            }
            if (prop === 'measureText') {
              // ★b2b-acc-degraded 清偿①（2026-10-05）:measureText=纯读 op（不落笔
              //  不改面）——专用度量 ctx（font/align/baseline=镜像值,2D 语义同构）
              //  上出 TextMetrics,零降级。旧链=acc 窗一次 measureText 即整帧降级+
              //  全幅 present+restack（悬停名板案 restackAfterBlitOff 已修呈现面、
              //  降级本身保留=本债;定谳仪 inj:measureText 99.5% 降级复现面）。
              //  度量 ctx 不可达（node 桩无 measureText/RV_MEASURE_OFF）→ 回退旧
              //  降级链（宁降级不丢读值;降级安全网保留）。
              const fn = (...args: unknown[]) => {
                // ★门=accMode && !raw（纯净 acc 态才走度量支;bridge/已降级态保持
                //  旧 raw 委托链零变化——最小面）
                if (!GLShimExecutor.RV_MEASURE_OFF && self.accMode && !self.raw) {
                  const mc = self.measureCtx();
                  if (mc && typeof mc.measureText === 'function') {
                    try {
                      mc.font = self.fontV;
                      mc.textAlign = self.alignV;
                      mc.textBaseline = self.baselineV;
                    } catch { /* 非法值保旧（2D set 语义） */ }
                    try {
                      return (mc as unknown as Record<string, (...a: unknown[]) => unknown>).measureText(...args);
                    } catch { /* 度量异常回退降级链 */ }
                  }
                }
                if (!self.raw && self.accMode) self.noteDegradeTrigger(`rv:${prop}`);
                self.ensureBridged();
                const r = self.raw as unknown as Record<string, (...a: unknown[]) => unknown> | null;
                return r ? r[prop](...args) : undefined;
              };
              bound[prop] = fn;
              return fn;
            }
            if (prop === 'getImageData' || prop === 'isPointInPath'
              || prop === 'clip' || prop === 'drawFocusIfNeeded') {
              // 读值面/真裁剪:acc 态无落笔/无读回语义,降级后委托（防御性）。
              // ★定谳仪:闭包缓存进 bound（读 live 态,跨 acc/bridge 两相安全——
              //  DRAWING_TAIL 双支同判例）;触发时 noteDegradeTrigger 归因。
              // ★清偿批定谳（2026-10-05）:全树世界段零调用点（inj 自检=唯一复现面）
              //  ——保留降级原链=必要保留项（真裁剪/真读回语义需实面,无可等价路径）。
              const fn = (...args: unknown[]) => {
                if (!self.raw && self.accMode) self.noteDegradeTrigger(`rv:${prop}`);
                self.ensureBridged();
                const r = self.raw as unknown as Record<string, (...a: unknown[]) => unknown> | null;
                return r ? r[prop](...args) : undefined;
              };
              bound[prop] = fn;
              return fn;
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

  /** ★R1b-5 样式工厂 ctx（acc 态 createLinearGradient/RadialGradient/Pattern 产真对象）：
   *  host 注入优先（测试/复用面）;缺省自建 1×1 离屏（惰性单例——执行器单实例,
   *  全会话一画布;1×1 零 GPU 面,梯度对象本身无 GPU 资源）。 */
  private _styleCv: HTMLCanvasElement | null = null;
  private _styleCtx2d: CanvasRenderingContext2D | null = null;
  private styleCtx(): CanvasRenderingContext2D | null {
    if (this.host.styleCtx) return this.host.styleCtx();
    if (!this._styleCtx2d) {
      if (typeof document === 'undefined') return null;
      this._styleCv = document.createElement('canvas');
      this._styleCv.width = 1;
      this._styleCv.height = 1;
      this._styleCtx2d = this._styleCv.getContext('2d');
    }
    return this._styleCtx2d;
  }

  /** ★b2b-acc-degraded 清偿①（2026-10-05）：文本度量 ctx——acc 态 measureText 在此
   *  出 TextMetrics（font/align/baseline 由调用方镜像置位=与降级后 raw 同值同源,
   *  量宽/墨盒逐数一致）。惰性 1×1 离屏单例（度量无落笔,零 GPU 面）;node 桩
   *  无 measureText → null（调用方回退旧降级链）。与 styleCtx 分离（样式工厂
   *  可能被 host 注入,度量态 font 置位不得串味）。 */
  private _measureCv: HTMLCanvasElement | null = null;
  private _measureCtx2d: CanvasRenderingContext2D | null = null;
  private measureCtx(): CanvasRenderingContext2D | null {
    if (!this._measureCtx2d) {
      if (typeof document === 'undefined') return null;
      this._measureCv = document.createElement('canvas');
      this._measureCv.width = 1;
      this._measureCv.height = 1;
      this._measureCtx2d = this._measureCv.getContext('2d');
    }
    return this._measureCtx2d;
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
    // ★b2b-acc-degraded 清偿③（2026-10-05）：fillText/strokeText 隔离栅格化直支
    //  （悬停名板案=旗布 hover 名牌 measureText+fillText 同点位,定谳仪 inj:fillText
    //  100% 降级复现面;文本墨盒一次栅格化+单 quad 发射=P0-B 低频落笔律内）。
    if ((op === 'fillText' || op === 'strokeText') && !this.clipped) {
      const ok = this.rasterizeText(op, args);
      if (ok) return;
    }
    this.noteDegradeTrigger(`tail:${op}`);   // ★定谳仪:落笔长尾兜底=整帧降级源
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
   *  → false 走降级原链。
   *  ★P0-B 判例登记（2026-09-25 雷击风暴定谳）：本通道【每 op 隔离栅格化+
   *  markDynamic+即发即弃 flush】=每 op 一次 texImage2D 上传,只可承载【低频】
   *  落笔（每帧个位数形状）。高频路径形状（每帧数十~数千 fill 的矢量体——
   *  StormLightning bolt 每雷 ~1500 fill 曾打出 2000-3500 次/帧上传风暴≈11ms,
   *  单独砍半帧率）必须在上游【批化/预烘】后走单 drawImage 动态源（判例:
   *  proj1457.StormLightning.bakeBolt——整 bolt K=6 切片一张 scratch,~1500 fill
   *  →1 次上传+1 个 ADD quad）。fillText/strokeText 若未来接入本通道（通用化
   *  债,同律适用）:逐字形栅格化即重演同型上传风暴,须整段文本一次烘焙。 */
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

  /** ★b2b-acc-degraded 清偿③（2026-10-05）：acc 态 fillText/strokeText 隔离栅格化
   *  （B2b strokeRect/四柱 rasterizePathOp 判例同款）——文本墨盒一次栅格化进
   *  整数对齐 scratch（镜像 CTM+文本态原值重放,整数设备平移下字形覆盖率逐位同）,
   *  单 quad 发射=零整帧降级。旧行为=每次 fillText 走「落笔长尾→ensureBridged→
   *  整帧降级+全幅 present+restack」（定谳仪 inj:fillText 100% 降级复现面;登记债
   *  「悬停名板」族的降级本体）。失败（gco 改面/度量不可达/超帽/超大墨盒）返
   *  false → 调用方降级原链（安全网保留,宁降级不丢文本）。
   *  ★P0-B 律:逐 op 栅格化=每 op 一次 texImage2D,只承载低频落笔——TEXT_RASTER_CAP
   *  超帽支=高频风暴保险（超帽笔走降级,旧行为全保）。 */
  private rasterizeText(op: 'fillText' | 'strokeText', args: unknown[]): boolean {
    if (GLShimExecutor.TEXT_RASTER_OFF) return false;
    if (this.clipped || (this.gco !== 'source-over' && this.gco !== 'lighter')) return false;
    if (this.textRasterCount >= GLShimExecutor.TEXT_RASTER_CAP) return false;   // 每窗帽
    const text = typeof args[0] === 'string' ? args[0] : String(args[0] ?? '');
    const x = args[1] as number, y = args[2] as number;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const hasMaxW = typeof args[3] === 'number' && Number.isFinite(args[3] as number) && (args[3] as number) >= 0;
    // 墨盒度量（度量 ctx:font/align/baseline=镜像值——与真 ctx 同态,actualBoundingBox
    //  相对 (x,y) 对齐点,与 align 无关;缺该档=宽度+字号保守回退）
    const mc = this.measureCtx();
    if (!mc || typeof mc.measureText !== 'function') return false;
    try {
      mc.font = this.fontV;
      mc.textAlign = this.alignV;
      mc.textBaseline = this.baselineV;
    } catch { /* 非法值保旧 */ }
    let m: TextMetrics;
    try { m = mc.measureText(text); } catch { return false; }
    const fontPx = Math.abs(parseFloat(this.fontV)) || 10;
    const abL = (m as { actualBoundingBoxLeft?: number }).actualBoundingBoxLeft;
    const abR = (m as { actualBoundingBoxRight?: number }).actualBoundingBoxRight;
    const abA = (m as { actualBoundingBoxAscent?: number }).actualBoundingBoxAscent;
    const abD = (m as { actualBoundingBoxDescent?: number }).actualBoundingBoxDescent;
    let ux0: number, ux1: number;
    if (typeof abR === 'number' && typeof abL === 'number') {
      ux0 = x - abL; ux1 = x + abR;
    } else {
      const w = Math.max(0, m.width || 0);
      if (this.alignV === 'center') { ux0 = x - w / 2; ux1 = x + w / 2; }
      else if (this.alignV === 'right' || this.alignV === 'end') { ux0 = x - w; ux1 = x; }
      else { ux0 = x; ux1 = x + w; }
    }
    const uy0 = y - (typeof abA === 'number' ? abA : fontPx) - fontPx * 0.25;   // 顶垫=基线档语义差保险
    const uy1 = y + (typeof abD === 'number' ? abD : fontPx * 0.3) + fontPx * 0.25;
    if (hasMaxW) {
      // maxWidth 压缩:真墨盒 ⊆ 按对齐锚定的 maxWidth 盒——并集保守（只多不小）
      const wm = args[3] as number;
      if (this.alignV === 'center') { ux0 = Math.min(ux0, x - wm / 2); ux1 = Math.max(ux1, x + wm / 2); }
      else if (this.alignV === 'right' || this.alignV === 'end') { ux0 = Math.min(ux0, x - wm); ux1 = Math.max(ux1, x); }
      else { ux0 = Math.min(ux0, x); ux1 = Math.max(ux1, x + wm); }
    }
    // 设备 bbox（四角 CTM 变换;strokeText 加【斜接感知】描边外扩+AA 2px 边——
    // 描边 ink 超出 fill actualBoundingBox 达 lw/2×miterLimit（canvas spec 斜接
    // 钉尖）+Skia AA 羽化,半宽估计曾削去描边左裙边（bit-AB 636 列 d=142 定谳面）;
    // 低频文本 bbox 大几列=无感,宁大勿削）
    const { a, b, c, d, e, f } = this.m;
    const xs = [a * ux0 + c * uy0 + e, a * ux1 + c * uy0 + e, a * ux0 + c * uy1 + e, a * ux1 + c * uy1 + e];
    const ys = [b * ux0 + d * uy0 + f, b * ux1 + d * uy0 + f, b * ux0 + d * uy1 + f, b * ux1 + d * uy1 + f];
    const ms = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
    const pad = (op === 'strokeText'
      ? (this.lineWidthV / 2) * Math.max(1, Math.min(this.miterLimitV, 10)) * ms
      : 0) + 2;
    const bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad;
    const by0 = Math.min(...ys) - pad, by1 = Math.max(...ys) + pad;
    const fx = Math.floor(bx0), fy = Math.floor(by0);
    const sx = Math.ceil(bx1) - fx, sy = Math.ceil(by1) - fy;
    if (!(sx > 0 && sy > 0) || sx > 4096 || sy > 4096) return false;
    const sc = accScratch(sx, sy);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx, sy);
    // 整数设备平移 (−fx,−fy) 后同 CTM 同文本态重放——字形覆盖率与原位逐位同（B2b 判例）
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    sctx.font = this.fontV;
    sctx.textAlign = this.alignV;
    sctx.textBaseline = this.baselineV;
    if (op === 'strokeText') {
      sctx.strokeStyle = this.strokeStyleV;
      sctx.lineWidth = this.lineWidthV;
      sctx.lineCap = this.lineCapV;
      sctx.lineJoin = this.lineJoinV;
      sctx.miterLimit = this.miterLimitV;
      if (hasMaxW) sctx.strokeText(text, x, y, args[3] as number);
      else sctx.strokeText(text, x, y);
    } else {
      try { sctx.fillStyle = this.fillStyleV as string | CanvasGradient | CanvasPattern; } catch { return false; }
      if (hasMaxW) sctx.fillText(text, x, y, args[3] as number);
      else sctx.fillText(text, x, y);
    }
    this.textRasterCount++;
    // 发射:scratch=动态源,UV=整幅,设备矩形 1:1;gco='lighter'→ADD,SO→tier 0
    this.markDynamic(sc);
    this.push(this.gco === 'lighter' ? 1 : 0, null, false, sc, 0, 0, sx, sy, fx, fy, sx, sy, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();   // 即发即弃（保序+防 scratch 覆写,rasterizePathOp 同款）
    return true;
  }

  /** 降级同步版：调 host.degradeAcc;成功=raw 可用（bridge 已回放镜像态）。 */
  private ensureBridgedNow(): boolean {
    if (this.raw) return true;
    if (!this.host.degradeAcc?.()) return false;
    return !!this.raw;
  }

  /** ★b2b-acc-degraded 定谳仪（2026-10-05 清偿批）：acc 窗内「将触发整帧降级」的
   *  触发点计数+首触发调用方归因。键前缀族（noteDegradeTrigger 入参 op）：
   *  `rv:*`=读值面 op（measureText/getImageData/isPointInPath/clip/drawFocusIfNeeded,
   *  wrap 读值支）;`tail:*`=落笔长尾（fillText/strokeText/putImageData/clearRect…
   *  accTailOp 兜底支,含 strokeRect/fill/stroke 栅格化失败支）;`di:*`=drawImage
   *  回退（clip/filter/args/geo/srcoob/gco/dsto）;`fr:*`=fillRect 回退（clip/style）;
   *  `fail:*`=flushAcc accFail（与 accFailLedger 同因,并入本账=统一口径）;
   *  `sty:*`=样式工厂 ctx 不可达兜底。门=accMode && !raw（恰为 host.degradeAcc
   *  将真降级的态——已降级帧/bridge 窗零成本直返）。 */
  private noteDegradeTrigger(op: string): void {
    if (!(this.accMode && !this.raw)) return;
    this.stats.degradeTriggers[op] = (this.stats.degradeTriggers[op] ?? 0) + 1;
    GLShimExecutor.degradeOps[op] = (GLShimExecutor.degradeOps[op] ?? 0) + 1;
    if (!this._degradeAttributed) {
      this._degradeAttributed = true;
      const site = degradeCallerSite();
      if (site) {
        const k = `${op} <- ${site}`;
        GLShimExecutor.degradeCallers[k] = (GLShimExecutor.degradeCallers[k] ?? 0) + 1;
      }
    }
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
    // ★清偿②:baseline 镜像（acc 态读回+降级回放+rasterizeText 重放单源）
    else if (prop === 'textBaseline' && typeof value === 'string') this.baselineV = value as CanvasTextBaseline;
  }

  // ================= 变换（镜像+委托,fround 复刻 Skia f32 拼接） =================

  save(): void {
    this.stack.push({
      m: { ...this.m }, ga: this.ga, gco: this.gco, smooth: this.smooth,
      fill: this.fillStyleV, clip: this.clipped,
      stroke: this.strokeStyleV, lw: this.lineWidthV, filter: this.filterV,
      font: this.fontV, align: this.alignV, baseline: this.baselineV,
    });
    if (this.raw) this.raw.save();
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m; this.ga = s.ga; this.gco = s.gco; this.smooth = s.smooth;
      this.fillStyleV = s.fill; this.clipped = s.clip;
      this.strokeStyleV = s.stroke; this.lineWidthV = s.lw; this.filterV = s.filter;
      this.fontV = s.font; this.alignV = s.align; this.baselineV = s.baseline;
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
      this.rawDrawImage(img, rest, this.clipped ? 'clip' : 'args');
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
    // ★EoL 残影风暴定谳刀（2026-10-03）:源矩形与图像交集为空 = 2D spec no-op
    //  （canvas 有源裁剪语义:交集空→不落笔）——零像素输出、零序影响（不落笔=无序
    //  可保）,直接返回【不 flush 不回退】,与上方零尺寸 no-op 同一原则。
    //  触发面=873 光鞭残影 g873 帧行进负回绕（Main.cs:31358-31362,C# % 负模→
    //  sy∈{−rh..−6rh},sy+sh<0 恒完全越界;探针 scripts/_eol-ghost-census.mjs 定谳:
    //  光女战 719 帧 fallback 47290 次 100%=srcOOB-empty,贴图 72×72 sy∈{−12,−24}
    //  sh=10,风暴帧 448 回退=7 弹×32 槽×2 笔逐值命中,presentBatch p95=83 次/帧
    //  整幅回贴）——旧链逐 op rawDrawImage→flushForFallback→presentBatch×2=
    //  战斗帧率崩塌主因。部分越界（交集非空,有真实裁剪输出）不在此门,仍走下方
    //  rawDrawImage 保序回退。NaN/负 sw/sh 判据全 false→不入此门（落既有门）。
    //  回滚口:GLShimExecutor.SRC_OOB_NOOP_OFF=true（探针 A/B 面,P1B_REGION_OFF 同族）。
    if (!GLShimExecutor.SRC_OOB_NOOP_OFF && sw > 0 && sh > 0
      && Number.isFinite(sx) && Number.isFinite(sy)
      && (sx >= iw || sx + sw <= 0 || sy >= ih || sy + sh <= 0)) {
      return;
    }
    // 源越界=2D 有源裁剪+dst 补偿语义（spec）——不逐式复刻,回退
    if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih) || sw < 0 || sh < 0) {
      this.rawDrawImage(img, rest, 'srcoob');
      return;
    }
    // 负 dst = 翻转
    let flipNegX = false, flipNegY = false;
    if (dw < 0) { dx += dw; dw = -dw; flipNegX = true; }
    if (dh < 0) { dy += dh; dh = -dh; flipNegY = true; }
    // 几何解码（CTM×dst 矩形）
    const geo = this.decode(dx, dy, dw, dh);
    if (!geo) {
      this.rawDrawImage(img, rest, 'geo');
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
      this.rawDrawImage(img, rest, 'dsto');
      return;
    }
    const additive = this.gco === 'lighter';
    if (!additive && this.gco !== 'source-over') {
      this.rawDrawImage(img, rest, 'gco');
      return;
    }
    // ★B2b:ctx.filter 非 none（敌怪受击 brightness/水下 sepia 染色族）——quad
    //  不表达源级滤镜,acc 态走隔离栅格化（滤镜在 scratch 上施加,SO 合成逐位同;
    //  ★浸没透明案:user 空间原参重放,勿再吃一次 CTM——见 rasterizeDrawImage 注）;
    //  非 source-over 滤镜面=不可隔离 → 降级。bridge 态保持 census 回退（B2 现状）。
    if (this.accMode && this.filterV !== 'none') {
      if (this.gco === 'source-over' && this.rasterizeDrawImage(img, rest)) return;
      this.rawDrawImage(img, rest, 'filter');
      return;
    }
    const tier = additive ? 1 : 0;
    // ★I类:bake 期上传面（bolt 烘焙）——markWorldDynamicScratch(key) 刚上传的纹理
    //  挂到本 rec（resolve 直取,flush 期不再重传共享 scratch 的末次字节）
    //  ★N类（2026-09-27 变体①终扫）:单槽 pending 只覆盖 1:1（bake→单 draw）;
    //  1:N 消费（女皇剑一染十层/尘族逐尘烘焙）与跨 draw 窗口由 bakedTexMulti 承接
    //  ——语义=「本帧该 img 最近一次 bake 上传」,帧界 frameReset 清（跨帧不残留）。
    //  消费序 pending(本次 bake)优先 → multi(本帧最近 bake)——逐帧重烘焙的面
    //  每次 bake 后紧跟消费,与 2D 逐 draw 快照语义逐位同。
    const pre = this.bakedTexPending && this.bakedTexPending.img === img
      ? this.bakedTexPending
      : (this.bakedTexMulti.get(img as object) ?? null);
    this.bakedTexPending = null;
    // 纯色面?（fillRect 不走此;此处 img 恒 sprite）
    this.push(tier, null, false, img, sx, sy, sw, sh,
      geo.dx, geo.dy, geo.dw, geo.dh, geo.rot, this.ga,
      1, 1, 1, geo.flipX !== flipNegX, geo.flipY !== flipNegY, this.smooth,
      this.dynamicSrc.has(img), null, pre?.tex ?? null, pre?.snap ?? null, pre?.tint);
  }

  /** fillRect→纯色 quad（白纹理 tint+α;平色 ±1LSB census 登记）。
   *  无法表达（斜切/非解析色）→ flush+2D。 */
  fillRect(x: number, y: number, w: number, h: number): void {
    const raw = this.raw;
    if (this.clipped || w === 0 || h === 0) {
      if (w !== 0 && h !== 0) {
        // ★B2b acc:渐变/图案 fillStyle 直译不出→隔离栅格化（像素恒等）;败→降级
        if (this.accMode && this.rasterizeFillRect(x, y, w, h)) return;
        this.noteDegradeTrigger('fr:clip');   // ★定谳仪
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
      this.noteDegradeTrigger('fr:style');   // ★定谳仪
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

  /** 不可直译 drawImage 的统一回退口：flush 保序 + acc 态降级换桥 + raw 原参重放。
   *  ★定谳仪:why=回退因（clip/args/srcoob/geo/gco/dsto/filter）——归因账消费。 */
  private rawDrawImage(img: CanvasImageSource, rest: unknown[], why: string): void {
    this.noteDegradeTrigger(`di:${why}`);   // 门在内（bridge 态零成本直返）
    this.flushForFallback();
    if (this.accMode && !this.ensureBridgedNow()) { this.stats.fallback++; return; }
    const raw = this.raw;
    if (raw) Reflect.apply(raw.drawImage, raw, [img, ...rest]);
    this.stats.fallback++;
  }

  /** ★B2b acc drawImage 隔离栅格化（ctx.filter 非 none 的源级滤镜族——滤镜在
   *  scratch 上施加后 SO 合成回原设备矩形=像素恒等;仅 source-over 态可隔离）。
   *  ★浸没透明案定谳（2026-09-25 用户实报「完全浸水角色消失」;?bglshim=0 正常;
   *  BJ348b2「glow 可见主层消失」同根翻案）:旧实现把 decode 产出的【设备空间】
   *  geo 矩形在 scratch 上【再乘一次镜像 CTM】（setTransform(a,b,c,d,e−fx,f−fy)
   *  后 drawImage 到 geo.dx/dy）= 双变换——世界层 CTM 非单位时内容整体落到
   *  scratch 外（被裁空）→ 全透明 quad 发射在正确设备矩形 = 精灵整体消失
   *  （ret=true/fallback=0/replay=0 全绿静默;探针实测 CTM[-1,0,0,1,638,421] 下
   *  scratch 落点 x=−558）。单位阵下 scratch x=geo.dx−fx 恰好正确 = 既有单测与
   *  纯 2D 对拍全绿漏网。修复 = rasterizeFillRect/rasterizeOp 同判例:user 空间
   *  【原参重放】——负 dw/dh 翻转/旋转/斜切全由 2D 语义自洽;设备 bbox 由 dst
   *  四角 CTM 变换取 min/max（覆盖旋转/镜像;AA 1px 边）。 */
  private rasterizeDrawImage(img: CanvasImageSource, rest: unknown[]): boolean {
    if (this.clipped || this.gco !== 'source-over' || this.filterV === 'none') return false;
    const n = rest.length;
    // dst 矩形（user 空间,与主桥同式解参;负 dw/dh=翻转,由四角 min/max 自然覆盖）
    let dx: number, dy: number, dw: number, dh: number;
    if (n === 2) { dx = rest[0] as number; dy = rest[1] as number; dw = (img as { width: number }).width; dh = (img as { height: number }).height; }
    else if (n === 4) { dx = rest[0] as number; dy = rest[1] as number; dw = rest[2] as number; dh = rest[3] as number; }
    else if (n === 8) { dx = rest[4] as number; dy = rest[5] as number; dw = rest[6] as number; dh = rest[7] as number; }
    else return false;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dw) || !Number.isFinite(dh)) return false;
    const { a, b, c, d, e, f } = this.m;
    // 设备 bbox（dst 四角 CTM 变换——旋转/镜像/负宽高全覆盖）
    const x0 = a * dx + c * dy + e, x1 = a * (dx + dw) + c * dy + e;
    const x2 = a * dx + c * (dy + dh) + e, x3 = a * (dx + dw) + c * (dy + dh) + e;
    const y0 = b * dx + d * dy + f, y1 = b * (dx + dw) + d * dy + f;
    const y2 = b * dx + d * (dy + dh) + f, y3 = b * (dx + dw) + d * (dy + dh) + f;
    const bx0 = Math.min(x0, x1, x2, x3) - 1, bx1 = Math.max(x0, x1, x2, x3) + 1;
    const by0 = Math.min(y0, y1, y2, y3) - 1, by1 = Math.max(y0, y1, y2, y3) + 1;
    const fx = Math.floor(bx0), fy = Math.floor(by0);
    const sx2 = Math.ceil(bx1) - fx, sy2 = Math.ceil(by1) - fy;
    if (sx2 <= 0 || sy2 <= 0 || sx2 > 4096 || sy2 > 4096) return false;
    const sc = accScratch(sx2, sy2);
    if (!sc) return false;
    const sctx = sc.getContext('2d', { willReadFrequently: true });
    if (!sctx) return false;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sx2, sy2);
    // ★user 空间原参重放:镜像 CTM 整数设备平移后 drawImage(img,...rest) 原样
    //  （覆盖率与原位逐位同——rasterizeFillRect/rasterizeOp 同判例）
    sctx.setTransform(a, b, c, d, e - fx, f - fy);
    sctx.globalAlpha = this.ga;
    sctx.imageSmoothingEnabled = this.smooth;
    try { sctx.filter = this.filterV; } catch { return false; }
    Reflect.apply(sctx.drawImage, sctx, [img, ...rest]);
    this.markDynamic(sc);
    this.push(0, null, false, sc, 0, 0, sx2, sy2, fx, fy, sx2, sy2, 0, 1,
      1, 1, 1, false, false, false, true, null);
    this.flush();
    return true;
  }

  /** ★B2b acc fillRect 隔离栅格化（fillStyle 渐变/图案/非解析色——直译不出,
   *  栅格化到 scratch 保像素恒等;失败返 false → 调用方降级）。
   *  ★R1b-5（2026-09-28 雷雨定谳续刀）:'lighter' 可隔离——纯加算在【透明 scratch】
   *  上栅格化出源贡献（ga 烘入面,上传预乘=cs·αs）,ADD(ONE,ONE) quad 加进累积面
   *  =2D lighter 逐位同构（dust add 面/tier-1 既有判例;ray-orb StormLightning
   *  draw :1851-1856 辉光盘=createRadialGradient+lighter fillRect 同帧即此形态,
   *  旧码在此降级整帧）。multiply 等改面算子仍不可隔离 → 整帧降级。 */
  private rasterizeFillRect(x: number, y: number, w: number, h: number): boolean {
    // multiply 等改面算子不可隔离（见 rasterizeOp 注）→ 整帧降级;lighter=源栅格化
    if (this.clipped || (this.gco !== 'source-over' && this.gco !== 'lighter')) return false;
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
    // ★R1b-5:gco='lighter' → ADD 档（源贡献加进累积面）;SO → 基档
    this.push(this.gco === 'lighter' ? 1 : 0, null, false, sc, 0, 0, sx, sy, fx, fy, sx, sy, 0, 1,
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
    dynamic: boolean, pair: PairReg | null, preTex: TexEntry | null = null,
    preSnap: ImageData | null = null,
    tint?: readonly [number, number, number]): void {
    const rec = this.pool ?? ({} as QuadRec);
    this.pool = rec.next;
    rec.tier = tier; rec.solid = solid; rec.img = img;
    rec.sx = sx; rec.sy = sy; rec.sw = sw; rec.sh = sh;
    rec.dx = dx; rec.dy = dy; rec.dw = dw; rec.dh = dh;
    // ★shineslice:tint 覆写（缺省=入参 fr/fg/fb——solid 面色/图像面恒白,零行为差）
    rec.rot = rot; rec.alpha = alpha;
    rec.fr = tint ? tint[0] : fr; rec.fg = tint ? tint[1] : fg; rec.fb = tint ? tint[2] : fb;
    rec.flipX = flipX; rec.flipY = flipY; rec.smooth = smooth;
    rec.dynamic = dynamic; rec.pair = pair; rec.next = null;
    rec.preTex = preTex;                // ★I类:池复用卫生（恒显式置位,防陈旧纹理驻留）
    rec.preSnap = preSnap;              // ★R1b-6:池复用卫生同门
    rec.batch = null;                   // ★C5:池复用卫生（批引用单槽,非批 rec 恒空）
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

  /** ★C5 雨批入队（2026-09-26 rain-gl 收官刀;Renderer.emitRainQuadBatch 中介调用）：
   *  预变换四边形批作为【一条 rec】按调用点原位入队（保序:批在实体 rec 之后
   *  gore 之前,flush 期顺序混合进累积 FBO）。可表达性门=与 drawImage 主桥同构:
   *  窗活跃/GL 层在场/无 clip/无 filter/SO 态/ga=1——任一不满足返回 false,
   *  调用方整帧回 2D 原链（宁回退不丢精灵）。 */
  pushQuadBatch(img: CanvasImageSource, key: string, data: Float32Array, quads: number,
    replay: (ctx: CanvasRenderingContext2D) => void): boolean {
    if (!this.active || !this.glw || this.glw.unavailable) return false;
    if (this.clipped || this.filterV !== 'none') return false;
    if (this.ga !== 1 || this.gco !== 'source-over') return false;
    if (quads <= 0) return true;        // 零活滴=无事可画（与 2D 零绘制等价）
    this.push(0, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1, 1, 1, false, false, false, false, null);
    this.tail!.batch = { img, key, data, quads, replay };
    return true;
  }

  /** ★C5b 雪沙批入队（2026-09-27;pushQuadBatch 镜像,rgba:true——stride 8 带
   *  逐 quad α,发射走 GLSpriteLayer.quadBatchRgba;可表达性门/保序/降级语义同源）。 */
  pushQuadBatchRgba(img: CanvasImageSource, key: string, data: Float32Array, quads: number,
    replay: (ctx: CanvasRenderingContext2D) => void): boolean {
    if (!this.active || !this.glw || this.glw.unavailable) return false;
    if (this.clipped || this.filterV !== 'none') return false;
    if (this.ga !== 1 || this.gco !== 'source-over') return false;
    if (quads <= 0) return true;        // 零活粒=无事可画（与 2D 零绘制等价）
    this.push(0, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1, 1, 1, false, false, false, false, null);
    this.tail!.batch = { img, key, data, quads, replay, rgba: true };
    return true;
  }

  /** ★F-gore 批入队（2026-09-28;pushQuadBatchRgba 同族,多段形态）：gore 顶点批
   *  按「连续同 (纹理行切片,tier) 运行」拆段,逐段一条 rec【按调用序】原位入队
   *  （保序:段序=2D 绘制序逐一同相,C1 排序判例——不重排,flush 期顺序混合进
   *  累积 FBO;ADD 段 blend 切换由 rec.tier 驱动,flushAcc 逐 rec 换档既有链）。
   *  【门与 pushQuadBatch 的差异=有据】ga/gco 入口态不设门：2D 链逐件【自设】
   *  globalAlpha/gco（drawGorePiece :7574-7575）,入口态既不进 2D 输出也不进批
   *  输出（段 tier/α 全编码在 rec/顶点色）;Boss 战常在 gore 前有加性特效把镜像
   *  gco 留在 'lighter'——伪门会在目标场景整帧静默回退。clip/filter 真门保留
   *  （批不表达裁剪/源级滤镜）→ 违反即回 2D 逐件原链（宁回退不丢）。
   *  空 segs/全零 quads=真值零入队（与 2D 零绘制等价）。 */
  pushGoreQuadBatch(segs: readonly GoreSegSpec[]): boolean {
    if (!this.active || !this.glw || this.glw.unavailable) return false;
    if (this.clipped || this.filterV !== 'none') return false;
    for (const s of segs) {
      if (s.quads <= 0) continue;       // 零活件段=不占 rec（与 2D 跳过等价）
      const tier: 0 | 1 = s.tier === 1 ? 1 : 0;
      this.push(tier, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
        1, 1, 1, false, false, false, false, null);
      this.tail!.batch = { img: s.img, key: s.key, data: s.data, quads: s.quads,
        replay: s.replay, rgba: true, region: s.region };
    }
    return true;
  }

  /** ★liqpolish 液体 ADD 批入队（2026-09-29 微抛光刀;pushGoreQuadBatch 单段形态,
   *  tier=1 恒 ADD）：drawVanillaLiquids sparkle/glint ADD 段的发射口——逐 tile
   *  shim rec（save/gco/globalAlpha/drawImage/restore+resolveTex 逐 rec texAlive）
   *  退役面。门=gore 批同款（clip/filter 真门;ga/gco 逐 quad 编码进顶点不设入口门
   *  ——'lighter' 语义在 tier-1 blend+顶点 α,与入口态无关）。 */
  pushLiquidAddBatch(img: CanvasImageSource, key: string, data: Float32Array, quads: number,
    replay: (ctx: CanvasRenderingContext2D) => void): boolean {
    if (!this.active || !this.glw || this.glw.unavailable) return false;
    if (this.clipped || this.filterV !== 'none') return false;
    if (quads <= 0) return true;        // 零活段=无事可画（与 2D 零绘制等价）
    this.push(1, null, false, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
      1, 1, 1, false, false, false, false, null);
    this.tail!.batch = { img, key, data, quads, replay, rgba: true };
    return true;
  }

  /** ★liqgl 批通道可用性预检（drawVanillaLiquids pass 级 all-or-nothing 判据）——
   *  窗活跃/GL 层在场/无 clip/无 filter;ga/gco 由调用方归一后再过 pushQuadBatchRgba
   *  同门（本预检不含二者,避免预检面重复状态耦合）。 */
  batchAvail(): boolean {
    return this.active && !!this.glw && !this.glw.unavailable
      && !this.clipped && this.filterV === 'none';
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

    // 预解析门（bridge presentBatch 同款;动态源在发射期解析;批纹理在发射期解析）
    for (let p: QuadRec | null = this.head; p; p = p.next) {
      if (p.solid || p.pair || p.dynamic || p.batch) continue;
      if (!this.resolveTex(glw, p)) {
        // ★闪屏定谳仪:静态路径失败=er: 键明细（img id+纪元+子区矩形,直指哪张区域纹理）
        const id = texId(p.img as object);
        this.accFail('tex', `er:${id}:${texEpoch(p.img as object)}:${p.sx},${p.sy},${p.sw},${p.sh}`);
        return;
      }
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
      // ★C5 雨批发射（单 drawArrays;纹理惰性解析幂等键——层重建/LRU 逐出自愈;
      //  发射失败=accFail 降级换桥+队列余量 2D 重放,宁回退不丢精灵）
      //  ★C5b：rgba 面（雪沙 stride 8）走 quadBatchRgba 分支
      //  ★F-gore：region 面（gore 行切片裁剪纹理）走 texFromRegion——与 resolveTex
      //  er: 键同族幂等键,逐件 quadSprite 路径与批路径共享条目;段 blend 已由
      //  rec.tier 驱动的上方换档链设好（SO 基态/ADD (ONE,ONE)）。
      if (p.batch) {
        const rg = p.batch.region;
        const e = rg
          ? glw.texFromRegion(p.batch.key, p.batch.img as TexImageSource, rg.sx, rg.sy, rg.sw, rg.sh)
          : glw.texFromImage(p.batch.key, p.batch.img as TexImageSource, false, true);
        if (!e) { this.dropEmittedPrefix(p); this.accFail('tex', p.batch.key); return; }
        const ok = p.batch.rgba
          ? glw.quadBatchRgba(e, p.batch.data, p.batch.quads)
          : glw.quadBatch(e, p.batch.data, p.batch.quads);
        if (!ok) { this.dropEmittedPrefix(p); this.accFail('gl'); return; }
        this.stats.emitBatchQuads += p.batch.quads;
        continue;
      }
      const e = this.resolveTex(glw, p);
      // ★R1b-3:mid-loop 纹理解析失败=前缀已进 FBO——先弃前缀再降级重放（只补尾）
      if (!e) {
        if (curTier === 1) glw.blendAdditive(false);
        if (curTier === 2) glw.blendErase(false);
        if (curTier === 3) glw.blendMult(false);
        this.dropEmittedPrefix(p);
        // ★闪屏定谳仪:mid-loop 静态失败=er: 键明细
        const id2 = texId(p.img as object);
        this.accFail('tex2', `er:${id2}:${texEpoch(p.img as object)}:${p.sx},${p.sy},${p.sw},${p.sh}`);
        return;
      }
      const usx = p.texKind === 'full' ? p.sx : 0;
      const usy = p.texKind === 'full' ? p.sy : 0;
      const o = QOPTS;
      o.alpha = p.alpha;
      // ★shineslice:非白 tint 直通（delta 乘法;白=零开销 null 同旧。QOPTS/TINT3
      //  单槽复用判例——quadSprite 同步读入 uniform,单线程消费即弃）
      if (p.fr !== 1 || p.fg !== 1 || p.fb !== 1) {
        TINT3[0] = p.fr; TINT3[1] = p.fg; TINT3[2] = p.fb;
        o.tint = TINT3;
      } else o.tint = null;
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
   *  判例同款——不动已画内容）。
   *  ★R1b-3:中途失败（发射点之后）调用前先 dropEmittedPrefix——队列只余未发射
   *  尾段,degrade present 的 FBO 已含前缀,replay 只补尾=前缀不二次落画
   *  （旧码 replay 全队列=SO 变浓/ADD 双亮）;入口失败（'nogl'/'tex' 预解析门/
   *  'begin'）无前缀,全队列重放语义不变。 */
  private accFail(why: string, detail?: string): void {
    // ★闪屏定谳仪（2026-09-30）：原因入账——stats.accFails 随 frameReset 每帧清
    //  （本案 1473 次降级的重放账曾被每帧清零吞掉=报告全零假象）,定谳账走
    //  【静态累计】accFailLedger（不随帧清,F5 报告 render.acc.accFailLedger 消费）;
    //  detail=失败纹理键（'tex'/'tex2' 携带,直指哪张贴图）。
    const f = this.stats.accFails;
    f[why] = (f[why] ?? 0) + 1;
    const lk = detail ? `${why}:${detail}` : why;
    GLShimExecutor.accFailLedger[lk] = (GLShimExecutor.accFailLedger[lk] ?? 0) + 1;
    this.noteDegradeTrigger(`fail:${why}`);   // ★定谳仪:统一口径并入触发账
    const hadFbo = this.glw?.isAccumOpen('world') ?? false;
    if (this.host.degradeAcc && (hadFbo || why === 'nogl')) {
      if (this.host.degradeAcc()) { this.replay2D(); return; }
    }
    this.popAll();
  }

  /** ★R1b-3:acc 中途失败——把已发射进 FBO 的前缀（head..upTo 之前）回池,
   *  队列头推进到 upTo（=首个未发射 rec） */
  private dropEmittedPrefix(upTo: QuadRec | null): void {
    let p = this.head;
    while (p && p !== upTo) {
      const n = p.next;
      p.next = this.pool;
      this.pool = p;
      p = n;
    }
    this.head = upTo;
    if (!upTo) this.tail = null;
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
      if (p.tier !== tier || p.solid || p.batch) continue;
      if (!this.resolveTex(glw, p)) {
        if (additive) glw.blendAdditive(false);
        glw.end();
        this.restackAfterBlitOff(glw);   // ★C10e 屏栈补偿（头注见本函数尾）
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
      } else if (p.batch) {
        // ★C5 雨批（bridge SO 批;纹理解析失败=本批整体 2D 重放,同上门）
        // ★C5b：rgba 面（雪沙 stride 8）走 quadBatchRgba 分支
        // ★F-gore：region 面（gore 行切片）走 texFromRegion（flushAcc 同款）
        const rg = p.batch.region;
        const e = rg
          ? glw.texFromRegion(p.batch.key, p.batch.img as TexImageSource, rg.sx, rg.sy, rg.sw, rg.sh)
          : glw.texFromImage(p.batch.key, p.batch.img as TexImageSource, false, true);
        const ok = e && (p.batch.rgba
          ? glw.quadBatchRgba(e, p.batch.data, p.batch.quads)
          : glw.quadBatch(e, p.batch.data, p.batch.quads));
        if (!ok) {
          if (additive) glw.blendAdditive(false);
          glw.end();
          this.restackAfterBlitOff(glw);   // ★C10e 屏栈补偿（头注见本函数尾）
          this.replay2D();
          return;
        }
        this.stats.emitBatchQuads += p.batch.quads;
      } else {
        const e = this.resolveTex(glw, p);
        if (!e) continue;   // 预解析门已兜;防御支
        // ★UV 空间分道（角色透明案修正）:裁剪件 UV=整幅;全幅件 UV=页内矩形
        const usx = p.texKind === 'full' ? p.sx : 0;
        const usy = p.texKind === 'full' ? p.sy : 0;
        const o = QOPTS;
        o.alpha = p.alpha;
        // ★shineslice:非白 tint 直通（flushAcc 同款单槽复用）
        if (p.fr !== 1 || p.fg !== 1 || p.fb !== 1) {
          TINT3[0] = p.fr; TINT3[1] = p.fg; TINT3[2] = p.fb;
          o.tint = TINT3;
        } else o.tint = null;
        o.rot = p.rot; o.flipX = p.flipX; o.flipY = p.flipY; o.smooth = p.smooth;
        glw.quadSprite(e, usx, usy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh, o);
      }
    }
    if (additive) glw.blendAdditive(false);
    glw.end();
    // 回贴（B1 同式:身份变换 1:1;回贴 gCO【显式置位】——★BJ387（2026-09-28 用户实报
    // 「夜晚雨天悬停 A 驻家旗→B 驻家旗黑块」探针 _bj387-banner-hover-black 定谳）：
    // 桥接帧旗 tint fillRect（gco='multiply' 经 shim Reflect.set 落 raw worldCtxLayer）
    // 触发 flushForFallback→本 presentBatch 的回贴 drawImage 曾【继承 ambient
    // gCO='multiply'】→ FBO 里刚发射的旗布/头像 quad 乘上 worldCanvas 身后墙格
    // （cloth×wall=黑块;探针实测 presentBatch wctxGco:"multiply"+B 旗矩形逐像素
    // 暗化 0.68）。旧码只在 additive 臂置 'lighter',SO 臂倚「ambient 恒
    // source-over」假设——gco 活跃 flush 点（multiply fillRect 桥接回退族）不成立。
    // 谁设谁还原判例:save/restore 已括弧,补显式 source-over 封口。）
    wctx.save();
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    wctx.drawImage(glw.canvas, 0, 0, w, h);
    wctx.restore();
    // ★C10e 屏栈补偿（2026-10-03 用户实报「光标指向 NPC 旗帜远景全消失」定谳刀）：
    //  本函数 glw.end() → GLSpriteLayer.end → pipeBackend.present(fboWorld, over=false)
    //  =blend-off 直写管线画布。旗关/C10e 前=画布只是回贴 scratch 无害;C10e 屏栈
    //  模式下管线画布=DOM glCanvas=屏栈折叠面——blend-off 直写把 bg+云+群系背景
    //  整组栈内容【踩掉】,帧尾合成器采样到踩踏态=远景层集合整体消失（云+山+森林
    //  bg 三层齐没,天空渐变+太阳从 sky2D 透出）。触发链=旗布悬停名板 measureText
    //  （读值面支 →ensureBridged→degradeAcc 换桥,Renderer 侧该处 present 自带
    //  restack 补偿）后本帧续走桥接 flush——本函数的 world:OFF present 无补偿
    //  （degradeAcc/fullbright/lightFast 三处同型位均有,唯此处漏）→悬停期间
    //  每帧帧尾恒踩踏=「持续消失」;鼠标移开名板不再触发降级=自然恢复。四柱区
    //  高空间歇案=同族（其他实体的 measureText/getImageData/clip 读值面 op
    //  触发整帧降级,机制同此）。readback（上方 drawImage）必须先于 restack
    //  消费踩踏态画布=本补偿只能落调用侧,不能下沉 GLSpriteLayer.end。
    this.restackAfterBlitOff(glw);
    this.stats.flushes++;
  }

  /** ★C10e 屏栈补偿（presentBatch 专用）：blend-off present 踩踏屏栈折叠后按栈
   *  重放恢复「glCanvas=屏栈」不变式（restackScreen=clear+栈序 premul over 重放,
   *  与 degradeAcc 尾/全亮快路径补偿同款语义）。旗关/非共管=零操作。 */
  private restackAfterBlitOff(glw: GLSpriteLayer): void {
    const pipe = glw.pipeBackend;
    if (pipe && pipe.screenStackMode) pipe.restackScreen();
  }

  /** 纹理解析（flush 期逐 rec;LRU 逐出/动态源/尘对惰性建面都在此收口）。
   *  ★liqpolish（2026-09-29 微抛光刀）:稳定键族逐 rec texAlive 改 texCheck 批检
   *  （代际戳命中窗一次 Map.get+数字比较;LRU 逐出窗语义保持——删表路径必 bump
   *  texGen,逐出注入判别器 tests/liqpolish-guard.test.ts）。 */
  private resolveTex(glw: GLSpriteLayer, p: QuadRec): TexEntry | null {
    // ★I类:bake 期已上传纹理直取（flush 期绝不再 texRefresh——共享 scratch 的字节
    //  此时已是【最后一次烘焙】的,重传=先行 quad 错拿末次内容）。LRU 逐出（罕见）
    //  → null → accFail 2D 重放（有界降级,宁降级不丢）。
    if (p.preTex) return (liqpolish ? glw.texCheck(p.preTex) : glw.texAlive(p.preTex)) ? p.preTex : null;
    if (p.pair) {
      if (!p.pair.tex || !(liqpolish ? glw.texCheck(p.pair.tex) : glw.texAlive(p.pair.tex))) {
        p.pair.tex = glw.texFromData(`dpair:${texId(p.pair.add)}`, p.pair.gl, p.pair.w, p.pair.h);
        if (p.pair.tex) this.stats.uploads++;
      }
      return p.pair.tex;
    }
    if (p.dynamic) {
      const key = this.dynKeys.get(p.img as object) ?? `dyn:${++this.dynKeySeq}`;
      // ★P1-B 子区上传落刀（2026-09-28——上注为 2026-09-27 登记债,设计+三风险
      //  预案原样兑现,见 GLSpriteLayer.texRefreshRegion 头注）:栅格化族四口
      //  （rasterizeDrawImage/rasterizePathOp/rasterizeFillRect/rasterizeOp）的
      //  quad 只实采 accScratch 左上 (0,0,sw,sh),texRefresh 却整幅上传——面被
      //  「需求∈(半幅,全幅] 的 op 流」顶住滞回不回落时逐 op 全幅重传（霜月
      //  1650²=10.9MB/op,42.4% 墙钟定谳面）。本支:img===accScratch 且子区<半幅
      //  → texRefreshRegion（同尺寸 texSubImage2D 增量,上传=sw×sh;纹理恒全幅
      //  尺寸,UV/texKind/quad 采样语义不变）;其余动态源（尘 s1/s2、mountTint、
      //  boltScratch 兜底散画、empressTint 等——实采≈全幅）与 ≥半幅子区保整幅
      //  texRefresh 精确链。P1B_REGION_OFF=探针 A/B 逃生门。
      //  ★texEpoch 交互:er: 纪元键只在本函数下方静态支（texCache 命中判定）,
      //  本支 dyn: 键与其零交集;texRefreshRegion 返回同一 entry 对象（stamp 推进）,
      //  缓存/持引用面语义不变。
      const acc = _accScratch;
      if (acc && p.img === acc && !GLShimExecutor.P1B_REGION_OFF
        && p1bRegionGate(p.sw, p.sh, acc.width, acc.height)) {
        const er = glw.texRefreshRegion(key, p.img as TexImageSource, p.sw, p.sh);
        if (er) { this.stats.uploads++; this.stats.regionUploads++; }
        return er;
      }
      const e = glw.texRefresh(key, p.img as TexImageSource);
      if (e) this.stats.uploads++;
      return e;
    }
    const id = texId(p.img as object);
    const ep = texEpoch(p.img as object);
    // 数值键零分配:packed = ((sx·8192+sy)·4096+sw)·4096+sh < 2⁵³
    const packed = ((p.sx * 8192 + p.sy) * 4096 + p.sw) * 4096 + p.sh;
    let sub = this.texCache.get(id);
    if (sub) {
      const hit = sub.get(packed);
      // ★纪元参与命中判定（2026-09-27 变体①终扫）:epoch≠缓存纪元=源被原地覆写
      //  （TintAtlas 页矩形回收族）——旧条目作废重传;epoch 恒 0 的静态源零开销。
      if (hit && hit.ep === ep && (liqpolish ? glw.texCheck(hit.e) : glw.texAlive(hit.e))) {
        // ★R3-F1 驻留上界:满容触达刷新（LRU）——驱逐只删 JS 侧 Map 条目,
        //  GL 纹理仍驻留（texFromRegion 键幂等）由层 192MB LRU 兜底
        if (sub.size >= TEX_CACHE_SUB_CAP) { sub.delete(packed); sub.set(packed, hit); }
        return hit.e;
      }
      if (hit) sub.delete(packed);   // 死条目/旧纪元清位（占容不回收=上界击穿）
    } else {
      sub = new Map();
      if (this.texCache.size >= TEX_CACHE_OUTER_CAP) {
        const oldest = this.texCache.keys().next();
        if (!oldest.done) this.texCache.delete(oldest.value);
      }
      this.texCache.set(id, sub);
    }
    // ★纪元键:键携带 epoch——bump 后换键,层侧旧键纹理由 192MB LRU 自然回收
    const key = `er:${id}:${ep}:${p.sx},${p.sy},${p.sw},${p.sh}`;
    const e = glw.texFromRegion(key, p.img as TexImageSource, p.sx, p.sy, p.sw, p.sh);
    if (e) {
      while (sub.size >= TEX_CACHE_SUB_CAP) {
        const oldest = sub.keys().next();
        if (oldest.done) break;
        sub.delete(oldest.value);
      }
      sub.set(packed, { e, ep });
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
      // ★C5 雨批回放：构建方闭包逐滴 2D 直画（角点仿射+现烘 tint;宁回退不丢精灵）
      if (p.batch) { p.batch.replay(raw); this.stats.replays++; continue; }
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
      // ★R1b-6:preTex rec 重放吃 bake 期字节快照（p.img=共享 scratch,直画=
      //  末次烘焙内容错画;快照缺失（极端:快照失败）才按 p.img 兜底）
      //  ★P0 去画布化:快照=ImageData 区域字节——putImageData 进共享回放
      //  scratch（逐 rec 顺序覆写=安全）再取样;src 矩形 ⊆ 快照域才吃（越界=
      //  防御支退 p.img 旧链,现调用点恒 ⊆:尘=全幅/bolt=烘焙 bbox 子区）
      let src: CanvasImageSource = p.img;
      const sn = p.preSnap;
      if (sn && p.sx + p.sw <= sn.width && p.sy + p.sh <= sn.height) {
        const sc = preSnapScratch(sn.width, sn.height);
        const g = sc ? sc.getContext('2d') : null;
        if (sc && g) { g.putImageData(sn, 0, 0); src = sc; }
      }
      // ★shineslice:tinted rec 重放=sprite×delta 乘法在共享中转面重烘
      //  （stampShineCell 乘法支尾段同式 multiply+destination-in——降级帧像素
      //  =2D 原链;第二共享面持有乘法产物,preSnapScratch 继续持 sprite 蒙版源;
      //  只被本降级支触达,滞回回落同 preSnapScratch 判例）
      if ((p.fr !== 1 || p.fg !== 1 || p.fb !== 1) && p.sx === 0 && p.sy === 0) {
        const w = (src as { width: number }).width, h = (src as { height: number }).height;
        const tsc = tintReplayScratch(w, h);
        const tg = tsc ? tsc.getContext('2d') : null;
        if (tsc && tg) {
          tg.setTransform(1, 0, 0, 1, 0, 0);
          tg.globalCompositeOperation = 'source-over';
          tg.clearRect(0, 0, w, h);
          tg.drawImage(src, 0, 0);
          tg.globalCompositeOperation = 'multiply';
          tg.fillStyle = `rgb(${Math.round(p.fr * 255)},${Math.round(p.fg * 255)},${Math.round(p.fb * 255)})`;
          tg.fillRect(0, 0, w, h);
          tg.globalCompositeOperation = 'destination-in';
          tg.drawImage(src, 0, 0);
          tg.globalCompositeOperation = 'source-over';
          src = tsc;
        }
      }
      if (p.rot || p.flipX || p.flipY) {
        ctx.translate(p.dx + p.dw / 2, p.dy + p.dh / 2);
        if (p.rot) ctx.rotate(p.rot);
        if (p.flipX || p.flipY) ctx.scale(p.flipX ? -1 : 1, p.flipY ? -1 : 1);
        ctx.drawImage(src, p.sx, p.sy, p.sw, p.sh, -p.dw / 2, -p.dh / 2, p.dw, p.dh);
      } else {
        ctx.drawImage(src, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
      }
    }
    ctx.restore();
  }
}

/** 1×1 白纹理（fillRect 纯色面;惰性建,键恒 '__white'——GLSpriteLayer.fillQuad 同款）。
 *  ★R1-F7:命中面加 texAlive 卫兵——层 192MB LRU 逐出/releaseAll 清表（切世界/读档）
 *  后 WeakMap 缓存的是死条目,续用=画已删纹理（fillRect 全族静默消失）。
 *  ★liqpolish:卫兵改 texCheck 批检（__white 不进 evictLRU 逐出集,死窗=清表族
 *  ——清表必 bump texGen=批检窗闭合,语义同逐 rec texAlive）。 */
function WHITE_E(glw: GLSpriteLayer): TexEntry {
  const hit = WHITE_CACHE.get(glw);
  if (hit && (liqpolish ? glw.texCheck(hit) : glw.texAlive(hit))) return hit;
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
const ACC_SCRATCH_BASE = 64;
function accScratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!_accScratch) {
    _accScratch = document.createElement('canvas');
    _accScratch.width = ACC_SCRATCH_BASE; _accScratch.height = ACC_SCRATCH_BASE;
  }
  const cw = _accScratch.width, ch = _accScratch.height;
  if (w > cw || h > ch) {
    // 涨:直接扩到需求(尺寸变化自动清屏;宽高独立扩=最小必要面)
    if (w > cw) _accScratch.width = w;
    if (h > ch) _accScratch.height = h;
    return _accScratch;
  }
  // ★P1-A 滞回回落（2026-09-27,R3b-2 boltScratch proj1457.ts:1918 判例移植）:
  //  旧「只增不减」让单次离群大 op 把共享面永久撑大（实测 1650²）——此后【所有】
  //  栅格化按整幅上传（texRefresh 全画布 texImage2D,10.9MB/op 级）。现需求
  //  ≤当前一半（滞回防抖,双维联合判定）时缩回 max(基线,需求):离群帧后首个
  //  小 op 即回归稳态=上传≈需求。回落时机边界已核:四消费口（rasterizePathOp/
  //  rasterizeDrawImage/rasterizeFillRect/rasterizeOp）全部即发即弃
  //  （markDynamic→push→flush 同步消费,无跨 op 持面）;缩后 canvas=max(基线,需求)
  //  ≥需求,UV(0,0,需求) 落点不变;尺寸回落走 texRefresh 换尺寸重建通道
  //  （dropTexture+texFromImage,GLSpriteLayer 851-853）天然衔接;resize 自动清屏
  //  与消费方首行 clearRect(0,0,需求) 语义不变。
  //  ★P1-B（2026-09-28）:需求∈(半幅,全幅] 的 op 流把面顶在高位时不回落——
  //  此前每 op 仍整幅上传;resolveTex 对 img===本面 且子区<半幅 走 texRefreshRegion
  //  子区增量（上传=sw×sh;四消费口的内容恒落 (0,0,sw,sh) 左上=子区读取域,
  //  面其余部分为陈旧字节但 quad 从不采样）。本 let 被 resolveTex 门按身份比对。
  if (w * 2 <= cw && h * 2 <= ch) {
    const tw = Math.max(ACC_SCRATCH_BASE, w), th = Math.max(ACC_SCRATCH_BASE, h);
    if (tw < cw || th < ch) { _accScratch.width = tw; _accScratch.height = th; }
  }
  return _accScratch;
}

/** ★P0 去画布化重放中转 scratch（2026-09-28 灾难链定谳刃）：preSnap 字节快照
 *  （ImageData）putImageData 的共享面——只被 drawRec2D 重放路径触达（GL 失败
 *  降级帧）,稳态零创建零触碰;逐 rec 顺序 putImageData 覆写 (0,0,w,h) 后立即
 *  drawImage 消费=单线程串行安全。滞回回落同 accScratch/R3b-2 判例（防单次
 *  离群大快照把面永久撑大）。快照字节经 putImageData 整域替换（含 α）,取样域
 *  (sx..sx+sw, sy..sy+sh) ⊆ 快照域由调用侧守卫。 */
let _preSnapScratch: HTMLCanvasElement | null = null;
const PRE_SNAP_SCRATCH_BASE = 64;
function preSnapScratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!_preSnapScratch) {
    _preSnapScratch = document.createElement('canvas');
    _preSnapScratch.width = PRE_SNAP_SCRATCH_BASE;
    _preSnapScratch.height = PRE_SNAP_SCRATCH_BASE;
  }
  const cw = _preSnapScratch.width, ch = _preSnapScratch.height;
  if (w > cw || h > ch) {
    if (w > cw) _preSnapScratch.width = w;      // 涨:直接扩到需求(尺寸变化自动清屏)
    if (h > ch) _preSnapScratch.height = h;
    return _preSnapScratch;
  }
  if (w * 2 <= cw && h * 2 <= ch) {             // 滞回:需求≤当前一半才缩
    const tw = Math.max(PRE_SNAP_SCRATCH_BASE, w), th = Math.max(PRE_SNAP_SCRATCH_BASE, h);
    if (tw < cw || th < ch) { _preSnapScratch.width = tw; _preSnapScratch.height = th; }
  }
  return _preSnapScratch;
}

/** ★shineslice tinted rec 降级重放第二中转面（2026-09-28）:持 sprite×delta 乘法
 *  产物——preSnapScratch 同刻持 sprite 蒙版源（destination-in 的源不能与产物同面,
 *  putImageData 直写会绕过 gCO）。只被 replay2D 的 tinted 支触达（GL 失败降级帧）,
 *  稳态零创建零触碰;滞回回落/preSnapScratch 判例同款。 */
let _tintReplayScratch: HTMLCanvasElement | null = null;
const TINT_REPLAY_SCRATCH_BASE = 64;
function tintReplayScratch(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!_tintReplayScratch) {
    _tintReplayScratch = document.createElement('canvas');
    _tintReplayScratch.width = TINT_REPLAY_SCRATCH_BASE;
    _tintReplayScratch.height = TINT_REPLAY_SCRATCH_BASE;
  }
  const cw = _tintReplayScratch.width, ch = _tintReplayScratch.height;
  if (w > cw || h > ch) {
    if (w > cw) _tintReplayScratch.width = w;
    if (h > ch) _tintReplayScratch.height = h;
    return _tintReplayScratch;
  }
  if (w * 2 <= cw && h * 2 <= ch) {
    const tw = Math.max(TINT_REPLAY_SCRATCH_BASE, w), th = Math.max(TINT_REPLAY_SCRATCH_BASE, h);
    if (tw < cw || th < ch) { _tintReplayScratch.width = tw; _tintReplayScratch.height = th; }
  }
  return _tintReplayScratch;
}

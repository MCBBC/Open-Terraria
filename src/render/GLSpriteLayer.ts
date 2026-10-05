// WebGL2 离屏精灵层(docs/webgl2-migration-plan.md 一期共享模块)。
// 定位:Canvas2D 里"整图离屏烘焙/每帧全屏乘法/整幅缩放采样"三类工作迁入
// 纹理+quad 的最小基础设施——#1 背景层族(BiomeBackground tintCache 退役)、
// #2 全屏地图(残项#3 归零)共用;#3/#4 与渲染器 v2 复用同一模块。
//
// 合成形态(计划关键决策):GL 画布是【离屏】的,调用方在原 2D 链的同一
// 时序 `ctx.drawImage(layer.canvas, 0, 0)` 单次合成——层序/透明度/遮挡关系
// 零改动(不采用垫底画布方案:那要求整段天空一并迁移,风险面大)。
//
// 语义对齐 Canvas2D:
//  · 输出预乘(blend ONE / ONE_MINUS_SRC_ALPHA,shader rgb*=a)——浏览器把
//    canvas 内容按预乘合成,与 2D 链 drawImage 的透明语义一致
//  · 四个 sampler(clamp/repeat × nearest/linear)按次绑定:2D 的
//    imageSmoothingEnabled 开关与横向平铺 1:1 映射
//  · tint 为 uniform 乘法(canvas multiply+destination-in 的等价,零离屏)
//  · WebGL2 NPOT 纹理可 REPEAT(地下带横向平铺)
import { noteContextLost, noteContextLostOnce } from './GLStats';
import type { DrawRect } from '../assets/SpriteAtlas';
import { texId, texReady } from './texId';
import { glStatUpload, glStatTexCreate, glStatDelete, glStatDraw } from './GLStats';
// ★C10a（2026-09-24）：GLPipeline 后端模式——GL 调用面（程序/VAO/纹理/draw）重定向到
// GLPipeline 单上下文,quads 渲进管线 FBO('clouds'),end() present() 到管线画布。
// 值导入（createPipelineBacked 工厂现场构造管线;类型面无环:GLPipeline 只依赖 GLStats）
import { GLPipeline, type PipelineFbo, type PipelineProgram } from './GLPipeline';

export interface QuadOpts {
  alpha?: number;                                    // 整体透明度(默认 1)
  tint?: readonly [number, number, number] | null;   // RGB 乘法(默认无)
  rot?: number;                                      // 弧度,绕 dst 中心
  smooth?: boolean;                                  // 采样过滤(默认 true=2D 默认平滑开)
  flipX?: boolean;                                   // 水平镜像(u0/u1 交换;云族用)
}

export interface TexEntry { tex: WebGLTexture; w: number; h: number; stamp: number; bytes: number; mipped: boolean; key?: string;
  /** ★liqpolish texCheck 批检代际戳（tileGen 语义:chk===texGen ⇒ 本 flush 窗已验活;
   *  仅 GLSpriteLayer 写,消费方只读。可选字段=旧 entry 结构兼容） */
  chk?: number }

/** ★B1 quadExact tie 相位补正（texel 单位;见 quadExact 内注） */
const QUAD_TIE_EPS = 1 / 4096;

// ---- ★B1 tile 面专用程序（2026-09-24）:uv 插值自由的最邻近采样 ----
// 【为何不用 quad/quadExact 的 varying vUv】插值误差随目标矩形绝对坐标增大
// （光栅化 barycentric 精度 ~1e-4 相对）→ 精确 tie（src 坐标恰落 texel 整数
// 边界,如 2:1 整档缩放全像素 tie、z1.27 的 325 周期 tie）在大幅 offset 下
// 两臂随机分裂（微测 _b1-micro-quad 原点处 ε 可钉,游戏内 1280 偏移处不可钉）。
// 【本程序】FS 由 gl_FragCoord（=像素中心,精确整数+0.5）直接算 texel 索引:
//   texel = src.xy + floor((frag−dst.xy)/dst.wh×src.wh − ε)
// float32 误差 ~1.5e-5 texel ≪ ε=2⁻¹²≪非 tie 最小分数距 ≥1/512 —— 全 W 稳定。
// tie 取 floor(c−ε)=c−1 ≙ Chrome 2D 最近邻 tie 语义（微测实证）。texelFetch
// 不经采样器（NEAREST/LINEAR 均无关）,返回预乘 texel 原值 → blend (ONE,1−SA)。
const TILE_VERT_SRC = `#version 300 es
uniform vec2 uCanvas;
uniform vec4 uDst;
layout(location=0) in vec2 aPos;
void main() {
  vec2 screen = uDst.xy + aPos * uDst.zw;
  gl_Position = vec4(screen.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - screen.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

const TILE_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec4 uDst;      // 设备矩形 (x,y,w,h)
uniform vec4 uSrcT;     // texel 矩形 (sx,sy,sw,sh)
uniform float uFboH;    // FBO 高(设备像素;gl_FragCoord.y 自底向上)
out vec4 outColor;
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uFboH - gl_FragCoord.y);   // 设备坐标(中心=整数+0.5)
  vec2 local = dev - uDst.xy;                                 // 目标内坐标
  vec2 t = uSrcT.xy + floor(local / uDst.zw * uSrcT.zw - 1.0 / 4096.0);
  outColor = texelFetch(uTex, ivec2(t), 0);
}`;

// ---- ★C5 雨批程序（2026-09-26 rain-gl 收官刀）：逐滴四边形单 drawArrays 成批 ----
// 【为何不用 quadSprite】雨=750 滴/帧×每滴独立光照色——quadSprite 每滴一次
// bindTexture+drawArrays（=750 draw call/帧;trace 20260926 强降雨桶 rain 1076ms/2s
// ≈54% 墙钟定谳批的构成面之一）且 uTint 是 per-call uniform 无法逐滴。
// 【本程序】顶点自带 pos/uv/color（stride 7 float:pos2+uv2+col3），一次
// drawArrays(TRIANGLES, 6N) 全量发射；blend 不在此设（SO 批走 begin 的
// (ONE,1−SA) 基态——雨无 ADD 需求=纯 SO 单档,少一次档切换）。
// 【像素语义】片元 c.rgb×vCol 与 2D 烘焙路径 bakeTintFrame 的
// multiply+destination-in 同式（Rain.png α∈{0,255} 二值 → 预乘上传恒等；
// vCol=与烘焙同一量化 tint 值 /255）——±1LSB census 登记（乘法舍入域）；
// 采样恒 NEAREST（2D imageSmoothingEnabled=false 判例）；uv 全跨度−ε
// （quadSprite 同款 tie 补正）。旋转边=硬边 vs Skia AA——与实体旋转 quad
// 同族（B2b 分数路径 census 有界登记口径），非新增偏差类。
const RAIN_VS = `#version 300 es
uniform vec2 uCanvas;
layout(location=0) in vec2 aPos;   // 设备 px（顶点已含世界变换,WeatherRenderer 构建）
layout(location=1) in vec2 aUv;    // 图集 uv
layout(location=2) in vec3 aCol;   // 逐滴光照 tint（0..1）
out vec2 vUv;
out vec3 vCol;
void main() {
  gl_Position = vec4(aPos.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - aPos.y / uCanvas.y * 2.0, 0.0, 1.0);
  vUv = aUv; vCol = aCol;
}`;

const RAIN_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
in vec3 vCol;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  outColor = vec4(c.rgb * vCol, c.a);   // 预乘纹理×顶点色 = 烘焙 multiply 同式
}`;

// ★C5b 雪沙 precip 批着色器（2026-09-27;RAIN_* 同构+第 4 顶点分量=逐 quad α）：
// 沙尘叠画 alpha=180/255（Sandstorm.cs:179-182）按 quad 走 aCol.a——批内雪/沙基画
// （a=1）与叠画（a=180/255）精确保序单 drawArrays 发射（2D 逐粒 globalAlpha 序）。
// out.rgb = tex_p.rgb×vCol.rgb、out.a = tex.a×vCol.a：与 2D globalAlpha source-over
// 逐位同式（out_p = src_p×ga + dst_p×(1−ga·sa),基画 ga=1 / 叠画 ga=180/255）。
const PRECIP_VS = `#version 300 es
uniform vec2 uCanvas;
layout(location=0) in vec2 aPos;   // 设备 px（顶点已含世界变换,WeatherRenderer 构建）
layout(location=1) in vec2 aUv;    // 图集 uv
layout(location=2) in vec4 aCol;   // 逐粒 tint rgb + 逐 quad alpha（0..1）
out vec2 vUv;
out vec4 vCol;
void main() {
  gl_Position = vec4(aPos.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - aPos.y / uCanvas.y * 2.0, 0.0, 1.0);
  vUv = aUv; vCol = aCol;
}`;

const PRECIP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUv;
in vec4 vCol;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  outColor = vec4(c.rgb * vCol.rgb, c.a * vCol.a);   // 预乘纹理×顶点色×quad α
}`;

// ---- ★C13c 微光波场 GLSL 程序（2026-10-01 二期刀;docs/c13c-shimmer-wave-glsl-design.md）----
// 【VS】PRECIP_VS 同构 + 两顶点属性扩展（设计案 §3.1 "VS=PRECIP_VS 复用" 的机械落地:
//  FS 需要 vTile/vNoise varying ⇒ VS 必须声明 out——pos/uv/col 三属性逐字同 PRECIP_VS,
//  location 3=aTile(vec2)/4=aNoise(float),stride 44B（11 float,方案 H §3.2）。
//  aTile = 像素的世界 tile 连续坐标（world px/16,VS 线性插值逐像素精确——world→device
//  仿射(b=c=0 门)复合线性插值仍精确=场世界锚定）;aNoise = CPU 逐节点 noise-sin
//  （§2.2 定谳:uint hash→float 高位损失 256 ⇒ sin 相位差 25.6rad 位等不可达 ⇒ hash+sin
//  留 CPU 经属性上传;FS 侧 glitter(§2.5)消费位=三期 sparkle 段——★三期（2026-10-02）
//  已接通:uSpark=1 段（liqspark: 键族）main 内 glitter(vTile,vNoise) 逐像素调制;
//  基体主式(§2.4)不读）。 */
const LIQSHIM_VS = `#version 300 es
uniform vec2 uCanvas;
layout(location=0) in vec2 aPos;   // 设备 px（顶点已含世界变换,VanillaLiquidRenderer 构建）
layout(location=1) in vec2 aUv;    // 图集 uv
layout(location=2) in vec4 aCol;   // 预乘恒等（rgb===a;§3.3 预乘锁域）
layout(location=3) in vec2 aTile;  // 世界 tile 连续坐标（corner=世界px/16）
layout(location=4) in float aNoise; // CPU 逐节点 noise-sin（方案 H）
out vec2 vUv;
out vec4 vCol;
out vec2 vTile;
out float vNoise;
void main() {
  gl_Position = vec4(aPos.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - aPos.y / uCanvas.y * 2.0, 0.0, 1.0);
  vUv = aUv; vCol = aCol; vTile = aTile; vNoise = aNoise;
}`;

// 【FS】逐像素场合成（设计案 §2.1/§2.3/§2.4 逐条翻译;§2.5 glitter 三期消费位）:
//   shimmerWave = GetShimmerWave(LiquidRenderer.cs:761-763) 1:1
//   field       = GetShimmerBaseColor(:803-807) 端点常量预析（SHIM_A/SHIM_DV 与 JS 侧
//                 SHIM_A_*/SHIM_D_* 同源 f32 编译期常量）
//   glitter     = GetShimmerGlitterOpacity 体部式(:773-790) remap×remap
//  双模式（段级 uniform 分派——基体段/亮纹段纹理互异=永不分批同段,uniform 每发射
//  单点写入=逐 draw 生效）:
//   uSpark=0（liqshim: 基体段）out = (tex_p.rgb × field × vCol.a, tex_p.a × vCol.a)
//     ——顶点 rgb 不进乘链（§2.4"乘 vCol.rgb 退役"）,环数据 rgb===a 预乘恒等（§3.3）。
//   uSpark=1（liqspark: 三期亮纹段,2026-10-02）out = (tex_p.rgb × vCol.rgb × g,
//     tex_p.a × vCol.a × g),g=glitter(vTile,vNoise)——亮纹透明度逐像素化（替换 CPU
//     sparkGa 四角均值近似;顶点 rgb=hue×α 预乘族,a 只载 opacity;保留域=flag 表层
//     照旧 CPU ADD 段）。
//  ★precision highp float 强制（§5 风险2:mediump 漏入=离线场值 readback 闸抓）。 */
const LIQSHIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uTVis;   // visEffectFrames()（渲染段内不变;批发射点单点写入）
uniform float uSpark;  // ★三期段模式:0=基体场段(liqshim:) 1=sparkle 亮纹段(liqspark:)
in vec2 vUv;
in vec4 vCol;
in vec2 vTile;
in float vNoise;
out vec4 outColor;
const float TAU = 6.283185307179586;
const vec3 SHIM_A = vec3(0.64705884, 0.50980393, 0.93333333);   // (0.64705884, 26/51, 14/15)
const vec3 SHIM_DV = vec3(0.80392158, 0.80392158, 1.0) - SHIM_A; // lerp 端点差（预析）
float shimmerWave(vec2 tile) {
  return sin(((tile.x + tile.y / 6.0) / 10.0 - uTVis / 360.0) * TAU);
}
float remap(float v, float a, float b, float c, float d) {
  return c + (d - c) * clamp((v - a) / (b - a), 0.0, 1.0);
}
float glitter(vec2 tile, float noiseSinV) {
  return remap(remap(shimmerWave(tile), -0.5, 1.0, 0.0, 0.35) * noiseSinV, 0.0, 0.5, 0.0, 1.0);
}
void main() {
  vec4 c = texture(uTex, vUv);
  if (uSpark > 0.5) {
    // ★三期 sparkle 亮纹透明度逐像素化（§2.5 逐式）:g 消费 vTile（波场逐像素）
    //  ×vNoise（CPU 逐节点 aNoise 顶点插值,方案 H §3.2——两三角逐线性=GPU varying
    //  语义≙原版 SpriteBatch 顶点插值域）
    float g = glitter(vTile, vNoise);
    outColor = vec4(c.rgb * vCol.rgb * g, c.a * vCol.a * g);
  } else {
    float w = shimmerWave(vTile);
    vec3 field = SHIM_A + SHIM_DV * (0.1 + w * 0.4);
    outColor = vec4(c.rgb * field * vCol.a, c.a * vCol.a);
  }
}`;

/** ★C13c 着色器源导出（离线场值 readback 闸 §4.1 直采同源——探针编译本常量,
 *  禁转录漂移;设计案"实现前可行性闸"判据面） */
export const LIQSHIM_VS_SRC = LIQSHIM_VS;
export const LIQSHIM_FS_SRC = LIQSHIM_FS;

// ---- ★K2 力场泡场程序（2026-10-01 二期刀;px_ForceField 字节码逐指令 GLSL 移植）----
// 【背景】四柱盾泡 SM2 产物链（200ms 桶缓存后仍 ~100ms/s）定谳=5 桶/秒 × ~25ms
//  解释器冷跑（128² ImageData 逐像素 f64 VM/codegen）。本程序把 ForceField 像素
//  场整体移入 FS——每塔每帧 1 quad,冷跑/产物画布/putImageData/texImage2D 全归零。
// 【VS】LIQSHIM_VS 同构三属性（pos/uv/col）+ 第 4 顶点分量 aTime（stride 36B,
//  9 float/顶点×6=54/quad——★形状分派判别值:既有 rgba 面 stride 8=48/quad、
//  微光 stride 11=66/quad 零交集,分派点=quadBatchRgba 发射口 c13c 判例）。
//  uTime 逐 quad 携带（VS 透传 varying）=四塔可同批发射免 uniform 分档。
// 【FS】px_ForceField 生成体（src/fx/gen/px_ForceField.gen.ts,50 实指令）逐式直译:
//  preshader 终值按产物口径 (uSourceRect=(0,0,128,128),uImageSize0=(128,128))
//  编译期折叠——★公式由 setupConstants 变参扫描经验定谳（scripts/_k2-fdiag3.mjs,
//  token 手解码两处翻车由场值闸抓出）:c0.xy=SR.xy/IS0.xy=(0,0)、
//  c1.xy=IS0.xy/SR.wh=(1,1)、c2.xy=0.5·SR.wh/IS0.wh=(0.5,0.5)、
//  c3.x=5·uTime（「×5」——旧 BUCKET_PHASE 注本正确,「+5」系手解码错）。
//  def 常量逐字（c5..c12 活跃子集）:c5=(−0.5,1.5,1,0) c6=(2.8,−1,20,30)
//  c7=(−0.3,0.75) c8=(12.566,−6.283,2,0.5)（inst22 产物=inst25 cmp 条件源——
//  「死码」初判被场值闸证伪）c9.z=0.0795774907(=1/4π) c9.w=−1.498e−6
//  c10=(2π,−π,−0.5,0.5)。
//  ★dp2add(0x5A)=真 x²+y²（gen 体 inst14 逐字;VM 回退支 x²-only 是登记偏差,
//  运行时 SM2_CODEGEN=true 恒走生成体=本表为运行时行为对齐）。
//  ★pr≤0 守卫=JS NaN 钳 0 语义复刻:inst41 1/pr=Inf→inst43 s1·Inf+…=NaN（s1=0
//  时 0·Inf=NaN）→ w=NaN → Uint8ClampedArray 钳 0=全通道 0;GLSL IEEE 同式可
//  达同值,但 UNORM NaN 写入行为实现定义——显式分支钉死（离线场值闸判读）。
//  ★采样档=LINEAR CLAMP 无 mip（runPassOnImageData sampleImageInto 双线性+钳
//  边逐式同构;texFromImage(…,noMip=true) 同参;Perlin α 恒 255=预乘上传恒等）。
//  ★输出语义=2D 产物 drawImage 等价:产物直 alpha (rgb=uColor·w, a=w) 源过
//  globalAlpha=ga 的 source-over → 预乘管线 out_p = uColor·w²·ga + dst·(1−w·ga)
//  ⇒ FS 写 vec4(vCol.rgb·w·w·ga, w·ga)、blend 走批基态 (ONE,1−SA)。
//  ★与 2D 产物链的登记差:FS 逐像素求值（dst 分辨率）vs 2D 128² 产物双线性放大
//  ——原版即逐像素（600² quad 直跑像素着色器）,GL 路径更贴原版;场值闸锚 128²
//  网格（scripts/_k2-fieldgate.mjs maxd≤2/255 c13c 判例）。
const FFIELD_VS = `#version 300 es
uniform vec2 uCanvas;
layout(location=0) in vec2 aPos;   // 设备 px（ForceFieldBubble 构建,世界变换已折算）
layout(location=1) in vec2 aUv;    // 泡内 0..1（t0,y 向下=2D 产物行序同相）
layout(location=2) in vec4 aCol;   // uColor.rgb(1..2 破盾/重塑窗)+globalAlpha
layout(location=3) in float aTime; // uTime 秒（GTW;逐 quad 携带免 uniform 分档）
out vec2 vUv;
out vec4 vCol;
out float vT;
void main() {
  gl_Position = vec4(aPos.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - aPos.y / uCanvas.y * 2.0, 0.0, 1.0);
  vUv = aUv; vCol = aCol; vT = aTime;
}`;

const FFIELD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
in vec4 vCol;
in float vT;
out vec4 outColor;
void main() {
  vec2 t0 = vUv;
  vec2 u = t0 - 0.5;                                   // inst8/10: (t0−c0)·c1 + c5.x
  float x = u.x * 1.5;                                 // inst13 ×c5.y（y×c5.z=1 恒等）
  float y = u.y;
  float rho = sqrt(x * x + y * y);                     // inst14 dp2add + inst15/16 rsq·rcp
  float z = y * 30.0 + vT * 5.0;                       // inst11/12: y·c6.w + c3.x(=5·uTime)
  float s = z * 0.0795774906873703;                    // inst17 ×c9.z(=1/4π)
  float fa = fract(abs(s));                            // inst18/19
  float saw = z >= 0.0 ? fa : -fa;                     // inst20 cmp（条件源 R[2]=z 未覆写）
  // inst22 非死码:c8.x/c8.y 产物 = inst25 cmp 的条件源（4π(saw−0.5)≥0 ⟺ saw≥0.5）
  float cmpv = saw * 12.566368103027344 - 6.283184051513672;
  float ang = cmpv >= 0.0 ? -0.0000014980281548560015  // inst25 cmp（c9.w）
            : fract(saw * 1.9999996423721313 + 0.5) * 6.2831854820251465 - 3.1415927410125732;
  float band = cos(ang) * -0.5 + 0.5;                  // inst26/27（c10.zw）
  float d = rho * 2.799999952316284;                   // inst28 ×c6.x
  float e = clamp((d - 1.0) * 20.0, 0.0, 1.0);         // inst29/30（c6.y=−1,c6.z=20）
  float sd = sqrt(d);                                  // inst31/32（r0.z=d）
  vec2 puv = (t0 - 0.5) * sd + 0.5;                    // inst33/34（c2.xy=0.5·span,−c5.x=+0.5）
  vec4 p = texture(uTex, puv);                         // inst35（LINEAR CLAMP）
  float pr = p.r;
  float t = clamp((pr * band - 0.3) * 20.0, 0.0, 1.0); // inst36/37（c7.x=−0.3,c6.z=20）
  float s1 = (3.0 - 2.0 * t) * t * t;                  // inst38-40 smoothstep 多项式
  if (pr <= 0.0) { outColor = vec4(0.0); return; }     // inst41 NaN 钳 0 语义复刻（见类注）
  float lr = s1 / pr + (1.0 - s1);                     // inst41 rcp + inst43 lrp(c5.z=1)
  float P = pr * pr * lr;                              // inst42/44
  float A = 1.0 - (3.0 - 2.0 * e) * e * e;             // inst45-47 1−smoothstep(e)
  float w1 = P * band * A;                             // inst48/49（Perlin 项）
  float w2 = A * d * d * d;                            // inst51-53 A·(2.8ρ)³（径向项）
  float w = 0.75 * w2 + w1;                            // inst55 ×c7.y(0.75) 混合=oC.a
  // 产物 8bit 钳制语义:Uint8ClampedArray 每通道钳 1（uColor=2 破盾支 w>0.5 时
  // uColor·w 饱和）——直 alpha 产物 rgb=min(uColor·w,1),预乘=×w
  vec3 straight = min(vCol.rgb * w, vec3(1.0));
  outColor = vec4(straight * w * vCol.a, w * vCol.a);   // 预乘输出（见类注）
}`;

/** ★K2 着色器源导出（离线场值 readback 闸 scripts/_k2-fieldgate.mjs 直采同源——
 *  探针编译本常量,禁转录漂移;c13c LIQSHIM_*_SRC 判例同款） */
export const FFIELD_VS_SRC = FFIELD_VS;
export const FFIELD_FS_SRC = FFIELD_FS;

/** ★C13c uTVis 帧界单点（模块态; VanillaLiquidRenderer 批发射点写入——渲染段内
 *  visEffectFrames 不变判例（§5 风险6:帧界错拍=跨相位时钟管线判例同族,发射点=
 *  flushShimRun/gate 重发射/fg 复用重发射,三处同段同值） */
let _liqShimTVis = 0;
export function setLiqShimmerTVis(v: number): void { _liqShimTVis = v; }

const VERT_SRC = `#version 300 es
uniform vec2 uCanvas;
uniform vec4 uSrc;    // uv 基 + uv 跨度
uniform vec4 uDst;    // 目标基 + 尺寸(像素)
uniform float uRot;
layout(location=0) in vec2 aPos;                     // 单位 quad (0..1)^2
out vec2 vUv;
void main() {
  // ★rot 双轴修复（2026-09-25 用户实报「全武器/弹幕旋转失效」定谳,探针
  //   scripts/_rot-shader-micro.mjs 六场景判谳）:
  //   【轴1 内容旋转】vUv 必须取【未旋转】aPos——贴图按精灵自身坐标采样,
  //   几何由旋转项驱动,内容才随 outline 同转 ≙ 2D translate·rotate·drawImage。
  //   旧码 vUv 用旋转后 p:screen 与 uv 同用 p ⇒ uv 成为 dst 矩形归一化坐标的
  //   逐轴仿射(与 uRot 无关——仿射映射由四角值唯一确定)——内容恒不转,只有
  //   outline 转 = 旋转精灵画成「未旋转内容+旋转裁剪框+边外 CLAMP 拖影」。
  //   【轴2 各向异性序】位置必须【先按 dst 尺寸展开像素域、后旋转】——
  //   旧码先旋转归一化坐标再逐轴乘 dst.zw:非方形 dst(w≠h)下 scale∘rotate
  //   ≠rotate∘scale = 剪切畸变(32×48@45° 纵弦 45→68px 实锤)。方形 dst 两序
  //   同构=旧码方形档 outline 恰好的根源。uRot=0 时两轴修复均逐位恒等
  //   （aPos==p、d*wh 展开回原式——tile/背景/地图全 unrotated 面零回归）。
  //   flipX/flipY(u/v 区间反向)=旋转【前】局部框内容镜像=R(rot)·F ≙ 重放面
  //   drawRec2D 的 translate·rotate·scale 语义与 decode R2-F1 判谳（tests/
  //   b2-shim-executor ★R2-F1 判别器+gl-layer-regression 源码锁双守卫）。
  //   ★CLOUD_VERT_SRC 同构剪切为登记债（obj62 1:1 移植锁+云 rot 微小+vScreen
  //   域联动,本案不动——见修复刃档案）。
  vec2 d = (aPos - vec2(0.5)) * uDst.zw;
  float s = sin(uRot), co = cos(uRot);
  vec2 screen = uDst.xy + uDst.zw * 0.5 + vec2(d.x * co - d.y * s, d.x * s + d.y * co);
  vUv = vec2(uSrc.x + aPos.x * uSrc.z, uSrc.y + aPos.y * uSrc.w);
  // ★y 翻转:canvas 2D 的 y 向下,clip space 的 y 向上——不翻则整画布垂直颠倒
  //   (两次实测翻车:2026-08-18 用户两报背景/地图倒置;texImage2D 未开 FLIP_Y,
  //   纹理行 0=图像顶行,配此翻转后 dst 顶=图像顶 ✓。tests/gl-layer-regression 锁定)
  gl_Position = vec4(screen.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - screen.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform vec3 uTint;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  // ★2026-09-03 边缘暗晕定谳：rgb 不得再乘 c.a——线性插值下边缘 c.rgb 已含 α
  //  (t×色)，再乘 c.a = t² 双重变暗（3.4× 沙暴背景撕裂带呈暗蓝描边，用户实报；
  //  剖面三通道实测与 t² 模型全中）。预乘混合(ONE/ONE_MINUS_SRC_ALPHA)要求
  //  rgb=预乘值：纹理经 UNPACK_PREMULTIPLY/位图预乘上传后 c.rgb 已是预乘态，
  //  此处只乘层透明度 uAlpha（XNA SpriteBatch Color×scale 同语义）
  outColor = vec4(c.rgb * uTint * uAlpha, c.a * uAlpha);
}`;

// ---- HorizonClouds 像素着色器（Terraria 1.4.5.6 PixelShader.cso obj62 逐指令 1:1；
//      行号 = fxPixel.txt 反汇编 :2929-2998。云晨昏天体染色主路径——
//      CloudsEnd（NextHorizonRenderer.cs:328-361）对三通道全部 _drawData 施加本 pass）----
const CLOUD_VERT_SRC = `#version 300 es
uniform vec2 uCanvas;
uniform vec4 uSrc;    // uv 基 + uv 跨度
uniform vec4 uDst;    // 目标基 + 尺寸(像素)
uniform float uRot;
layout(location=0) in vec2 aPos;
out vec2 vUv;
out vec2 vScreen;     // t1：旋转后画布像素位（shader 的 n1/dist 几何输入）
void main() {
  vec2 c = vec2(0.5);
  vec2 d = aPos - c;
  float s = sin(uRot), co = cos(uRot);
  vec2 p = c + vec2(d.x * co - d.y * s, d.x * s + d.y * co);
  vUv = vec2(uSrc.x + p.x * uSrc.z, uSrc.y + p.y * uSrc.w);
  vec2 screen = vec2(uDst.x + p.x * uDst.z, uDst.y + p.y * uDst.w);
  vScreen = screen;
  gl_Position = vec4(screen.x / uCanvas.x * 2.0 - 1.0,
                     1.0 - screen.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

const CLOUD_FRAG_SRC = `#version 300 es
precision highp float;   // dist/D³ 大数链,fp16 精度不足
uniform sampler2D uTex;        // s0 = 云贴图(LinearWrap → wrap2 采样器 REPEAT 双轴)
uniform vec4 uVertColor;       // v0 = cloudColor×globalCloudAlpha(DrawData 顶点色)
uniform vec3 uCelestialCol;    // c0 = uColor(GetCelestialBodyColors 天体色)
uniform vec2 uDrawPos;         // c1 = uDrawPosition(云中心,画布 px)
uniform vec3 uCelestial;       // c2 = uShaderSpecificData.xyz: 天体位 px + 强度
in vec2 vUv;
in vec2 vScreen;
out vec4 outColor;
void main() {
  // :2941-2949 五点采样：上(0,−0.035) 下(0,0.14) 左(−0.035,0) 右(+0.035,0) 中
  vec4 up = texture(uTex, vUv + vec2(0.0, -0.035));
  vec4 dn = texture(uTex, vUv + vec2(0.0, 0.14));
  vec4 lf = texture(uTex, vUv + vec2(-0.035, 0.0));
  vec4 rt = texture(uTex, vUv + vec2(0.035, 0.0));
  vec4 cc = texture(uTex, vUv);
  float coverage = 1.0 - 0.2 * (up.a + dn.a + lf.a + rt.a + cc.a);   // :2950-2954
  float thickness = 1.0 - 4.0 * clamp(cc.r - 0.62, 0.0, 1.0);        // :2955-2957(★#25 _sat)
  float A = max(thickness, coverage);                                // :2958
  vec2 d1 = vScreen - uDrawPos;                                      // :2959
  float l1 = dot(d1, d1);
  vec2 n1 = l1 > 0.0 ? d1 * inversesqrt(l1) : vec2(0.0);             // :2960-2962
  vec2 d2 = uCelestial.xy - vScreen;                                 // :2963
  float l2 = dot(d2, d2);
  vec2 n2 = l2 > 0.0 ? d2 * inversesqrt(l2) : vec2(0.0);             // :2964-2966
  float dist = l2 > 0.0 ? sqrt(l2) : 0.0;                            // :2967 rcp
  float B = max(dot(n1, n2), 1.0 - (dist * 0.0166667) * (dist * 0.0166667));  // :2968-2971 (d/60)²
  float R = length(vUv * 2.0 - 1.0);                                 // :2972-2975
  float distTerm = dist <= 50.0 ? dist / 50.0 - 1.0 : 0.0;           // :2979+2982 cmp(else 分支=c3.x=0 非 −1!)
  float inner = clamp(B * R - 0.05, 0.0, 1.0) * A + 0.6 * A + B * R - 0.3 + distTerm;  // :2976-2984(★#45 _sat)
  float D = max(0.3, 1.3 - dist * 0.000555556);                      // :2980-2981 (c4.x=1/1800)
  float shade = clamp(inner * uCelestial.z, 0.0, 1.0) * D * D * D;   // :2985-2988(★#57 _sat)
  vec4 r1 = mix(uVertColor, vec4(uCelestialCol, 1.0), 0.5) * cc.a;   // :2989-2992
  vec4 r2 = cc * uVertColor;                                          // :2993
  vec4 col = r2 + shade * (r1 * uVertColor.a - r2);                   // :2994-2995
  outColor = vec4(col.rgb * col.a, col.a);                            // 预乘输出(blend ONE/1−srcα)
}`;

/** HorizonClouds 每云 uniform（drawCloudPass 组装；vColor=既有云色链结果） */
export interface CloudFx {
  /** c1 uDrawPosition：云中心（画布 px = dst 左上 + 半宽高） */
  drawPos: readonly [number, number];
  /** c2.xyz：天体屏幕位 px（GetCelestialBodyPosition）+ CloudsEnd 强度 num */
  celestial: readonly [number, number, number];
  /** c0 uColor：日 (255,246,204)/月 GetMoonColor×GetMoonStrength（0..1） */
  color: readonly [number, number, number];
  /** v0 顶点色（cloudColor×globalCloudAlpha，rgba 0..1） */
  vertColor: readonly [number, number, number, number];
}

/** ★30fps 刀1 texFromRegion 区域键归一（2026-10-05;闪屏案 2026-09-30 修自注
 *  「键归一是上游刀」的兑现;纯函数=tests/gl-texregion-keynorm 锁 + 活机
 *  scripts/_erkey-census.mjs /_erkey-semab.mjs 对拍仪共用口径）。
 *  【病灶】er: 键坐标尾段含调用方原始小数（水面波相位条带/遮蔽比例切分等
 *  分数源矩形）→ 同一逻辑区域每帧一个新键 = 每帧 miss+scratch 重绘+
 *  texImage2D 上传+evictLRU 插入（LRU 满容时=逐帧换页级联,EoL 战 trace
 *  慢帧 clearRect@texFromRegion 3.55ms/帧定谳面）。
 *  【归一】裁剪窗整数化:锚=floor(起点)、端=ceil(终点)——「分数矩形 ⊆ 整数窗」
 *  的最小覆盖超集（邻接子四边形拼回父矩形零漏;sh∈(0,1) 带恰映射单行
 *  floor(sy),与闪屏案判例「亚像素源=采样首行,1px 纹理同语义」逐位同窗;
 *  活机 A/B:真水贴图表面带 (0,0,34,0.52)/(0.48) 刀前刀后逐字节 0 差）。
 *  键与窗同源:er: 族键坐标尾段（最后一个 ':' 之后）按窗重写,id/epoch 段
 *  逐字保留（bumpTexEpoch 换键重传语义不变;无 epoch 段的三段式 er: 键同
 *  兼容）。【scope=er: 族】其它命名空间（shineCell:<内容指纹> 等）尾段非
 *  坐标,重写会摧毁指纹语义（同画布异内容键坍缩=内容永久冻结）——键原样
 *  保留,窗照常整数化（其调用坐标本恒整数,行为零变化）。
 *  @returns {key,sx,sy,sw,sh} 归一后的层键与裁剪窗（整数调用逐位恒等）。 */
export function texRegionNormalize(
  key: string, sx: number, sy: number, sw: number, sh: number,
): { key: string; sx: number; sy: number; sw: number; sh: number } {
  const isx = Math.floor(sx), isy = Math.floor(sy);
  const rsw = Math.max(1, Math.ceil(sx + sw) - isx);
  const rsh = Math.max(1, Math.ceil(sy + sh) - isy);
  if (isx === sx && isy === sy && rsw === sw && rsh === sh) return { key, sx, sy, sw, sh };
  if (!key.startsWith('er:')) return { key, sx: isx, sy: isy, sw: rsw, sh: rsh };
  const ci = key.lastIndexOf(':');
  return { key: `${key.slice(0, ci + 1)}${isx},${isy},${rsw},${rsh}`, sx: isx, sy: isy, sw: rsw, sh: rsh };
}

export class GLSpriteLayer {
  /** GPU 账本命名(glfx/menubg…)——所有方构造后赋值;同名实例共享账页。
   *  ★C10a 管线后端模式=构造期取 pipe.statName（GLStats 记账随上下文归属走管线账页） */
  statName = 'sprite';
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  /** HorizonClouds 第二程序（obj62 1:1；编译失败→ cloudFxOK=false 走普通 quad） */
  private progCloud: WebGLProgram | null = null;
  private uniCloud: Record<string, WebGLUniformLocation | null> = {};
  cloudFxOK = false;
  /** ★B1 tile 面程序（gl_FragCoord texelFetch——见 TILE_*_SRC 注） */
  private progTile: WebGLProgram | null = null;
  private progTileHandle: PipelineProgram | null = null;
  private uniTile: Record<string, WebGLUniformLocation | null> = {};
  /** ★C5 雨批程序（RAIN_*_SRC——见注;惰性编译/登记,失败 rainFail 恒走 2D 兜底） */
  private rainProg: WebGLProgram | null = null;
  private rainProgHandle: PipelineProgram | null = null;
  private rainUni: Record<string, WebGLUniformLocation | null> = {};
  private rainVao: WebGLVertexArrayObject | null = null;
  private rainVbo: WebGLBuffer | null = null;
  private rainFail = false;
  /** ★C5b 雪沙 precip 批程序（PRECIP_*——aCol vec4 带 quad α;同款惰性/失败面） */
  private precipProg: WebGLProgram | null = null;
  private precipProgHandle: PipelineProgram | null = null;
  private precipUni: Record<string, WebGLUniformLocation | null> = {};
  private precipVao: WebGLVertexArrayObject | null = null;
  private precipVbo: WebGLBuffer | null = null;
  private precipFail = false;
  /** ★C13c 微光波场批程序（LIQSHIM_*——stride 11 带 aTile/aNoise;同款惰性/失败面） */
  private shimProg: WebGLProgram | null = null;
  private shimProgHandle: PipelineProgram | null = null;
  private shimUni: Record<string, WebGLUniformLocation | null> = {};
  private shimVao: WebGLVertexArrayObject | null = null;
  private shimVbo: WebGLBuffer | null = null;
  private shimFail = false;
  /** ★K2 力场泡场批程序（FFIELD_*——stride 9 带 aTime;同款惰性/失败面） */
  private ffProg: WebGLProgram | null = null;
  private ffProgHandle: PipelineProgram | null = null;
  private ffUni: Record<string, WebGLUniformLocation | null> = {};
  private ffVao: WebGLVertexArrayObject | null = null;
  private ffVbo: WebGLBuffer | null = null;
  private ffFail = false;
  private vao: WebGLVertexArrayObject | null = null;
  private samp: { nearest: WebGLSampler | null; linear: WebGLSampler | null; repeat: WebGLSampler | null; linearNoMip: WebGLSampler | null; wrap2: WebGLSampler | null } =
    { nearest: null, linear: null, repeat: null, linearNoMip: null, wrap2: null };
  private texs = new Map<string, TexEntry>();
  private stamp = 0;
  /** 字节预算(★2026-08-18:曾按条数 96 限额——96 张多 MB 纹理+mip 链可达 GB 级,
   *  叠在画布预算之上 = GPU 打爆→contextlost 风暴 26 万次;改按字节) */
  static MAX_BYTES = 192 * 1024 * 1024;
  private bytes = 0;
  /** GL 不可用(WebGL2 缺失/初始化失败)时置 true,调用方回退 2D 路径 */
  unavailable = false;
  // ---- ★C10a「GLPipeline 后端」模式（?cloudpipe=1;云会话迁入管线单上下文）----
  // ---- ★C10b（2026-09-24）共管：管线归属上移持有方（Renderer 单实例注入
  //  云+bg 两类会话+worldCompose），ownsPipe=false 时 dispose 不级联管线本体 ----
  /** 持有的管线（null=旧独立上下文模式）。★C10b 起共享注入为常态:dispose 是否
   *  级联管线本体由 ownsPipe 决定（Renderer 持有单一 GLPipeline 注入） */
  private pipe: GLPipeline | null = null;
  /** ★C10b:管线所有权（createPipelineBacked 工厂/独占构造=true——dispose 级联;
   *  Renderer 共管注入=false——管线归 Renderer 治理,层 dispose 只清自管对象） */
  private ownsPipe = true;
  /** 管线 program 表句柄（程序禁单删:program() 按名缓存,单删=悬空句柄毒化重登记） */
  private progHandle: PipelineProgram | null = null;
  private progCloudHandle: PipelineProgram | null = null;
  /** 当帧云 FBO（begin 租借,end present 后落引用） */
  private pipeFbo: PipelineFbo | null = null;
  /** ★BJ316 判例 getError 审计窗（仅管线模式;begin 内）:首 3 次+尺寸首见;稳态零 sync。
   *  recreate=整体新实例,天然重审 */
  private pipeAuditLeft = 3;
  private pipeAuditKey = '';
  /** 设备最大纹理边长(大世界整幅 8400 超限的 GPU 走 2D 回退,防静默花屏) */
  get maxTextureSize(): number {
    return this.gl ? this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number : 0;
  }
  /** ★R1b-2:本层 GL 上下文暴露（句柄产生面指纹——emitVanillaLiquidGate 产
   *  WorldTexSrc.gl,GLWorldCompose.compose 跨上下文校验判据） */
  get pipeGl(): WebGL2RenderingContext | null { return this.gl; }

  constructor(pipe?: GLPipeline, ownsPipe = true) {
    if (pipe) {
      // ★C10a 管线后端：GL 上下文/画布/present 面全归管线,本类只自管
      // 纹理(LRU)/采样器/VAO/quads 提交。canvas=pipe.canvas（cloudBlitRect 的 blit 源）
      // ★C10b:ownsPipe=false=共管注入（Renderer 单管线多消费方）——dispose 不级联
      this.pipe = pipe;
      this.ownsPipe = ownsPipe;
      this.canvas = pipe.canvas;
      this.statName = pipe.statName;
      this.initPipeMode();
      return;
    }
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.init();
  }

  /** ★C10a 工厂：管线后端实例（管线+层 1:1 持有,statName=GLStats 账本名）。
   *  不可用返 null（调用方 30s 退避——acquireGL 哨兵同款）。★worker 判死判例:
   *  GLPipeline 上下文判定用 document 存在性,worker 里恒不可启用。 */
  static createPipelineBacked(statName: string): GLSpriteLayer | null {
    if (typeof document === 'undefined') return null;
    const pipe = new GLPipeline(statName);
    const layer = new GLSpriteLayer(pipe);
    if (layer.unavailable) { layer.dispose(); return null; }
    return layer;
  }

  /** 管线后端初始化：程序登记进管线 program 表+共用 VAO/采样器构造。
   *  ★着色器源与旧路径【同一常量】（VERT_SRC/FRAG_SRC/CLOUD_*_SRC 单源——obj62
   *  字节码 1:1 禁转录漂移,uniform 表逐式同旧 init） */
  private initPipeMode(): void {
    const pipe = this.pipe!;
    const gl = pipe.glx;
    if (!gl || pipe.unavailable) {
      this.unavailable = true;
      this.diedAt = pipe.diedAt || performance.now();
      return;
    }
    this.gl = gl;   // 全部 quad/texFromImage 调用面走管线上下文（调用点零改动）
    const pQuad = pipe.program('sprite:quad', VERT_SRC, FRAG_SRC);
    if (!pQuad.prog) { this.unavailable = true; this.diedAt = performance.now(); return; }
    this.progHandle = pQuad;
    this.prog = pQuad.prog;
    for (const n of ['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uAlpha', 'uTint']) {
      this.uni[n] = pipe.uni(pQuad, n);
    }
    // HorizonClouds 程序（独立登记;失败不致命——cloudQuad 回退普通 quad,同旧路径）
    const pCloud = pipe.program('sprite:cloud', CLOUD_VERT_SRC, CLOUD_FRAG_SRC);
    if (pCloud.prog) {
      this.progCloudHandle = pCloud;
      this.progCloud = pCloud.prog;
      this.cloudFxOK = true;
      for (const n of ['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uVertColor', 'uCelestialCol', 'uDrawPos', 'uCelestial']) {
        this.uniCloud[n] = pipe.uni(pCloud, n);
      }
    } else {
      console.warn('[GLSpriteLayer:pipe] HorizonClouds 程序链接失败——cloudQuad 回退普通 quad');
    }
    // ★B1 tile 面程序（quadTile 消费;编译失败→ progTile=null,调用方回 2D 栅格化）
    const pTile = pipe.program('sprite:tile', TILE_VERT_SRC, TILE_FRAG_SRC);
    if (pTile.prog) {
      this.progTileHandle = pTile;
      this.progTile = pTile.prog;
      for (const n of ['uCanvas', 'uDst', 'uSrcT', 'uFboH', 'uTex']) {
        this.uniTile[n] = pipe.uni(pTile, n);
      }
    } else {
      console.warn('[GLSpriteLayer:pipe] tile 面程序链接失败——quadTile 不可用');
    }
    this.buildCommonObjects(gl);
    // 上下文丢失:管线画布上的第二监听（管线自身也监听并标自身不可用）——本层同步
    // 标记,消费方回退 2D,退避期后由持有方整体重建（语义同旧路径自愈钩子）
    // ★BJ344（件3）：具名化（dispose 摘除——脱离 canvas 上闭包捕 this=层→Renderer→Game
    //  整链滞留,合成层 +3/轮的 blink 侧入边之一）
    const lostPipe = (e: Event) => {
      // ★P0-C（trace-231810 续刀）:共管画布多监听者同事件齐发——noteContextLostOnce
      // 按【共享 canvas】去重（250ms 窗）,单次真实丢失只记饥饿窗一笔（原链云层+世界层
      // 各记一笔=2 次真实丢失即假性饥饿,工厂被扣而已建 compose 照跑=分层塌方）
      noteContextLostOnce(this.canvas, `sprite:${this.statName}`);   // #三开压测批
      e.preventDefault();
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
      console.warn('[GLSpriteLayer:pipe] GL 上下文丢失——标记不可用,消费方回退 2D,5s 后允许重建');
    };
    const restoredPipe = () => {
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
    };
    this.ctxLostHandlers.push(lostPipe, restoredPipe);
    this.canvas.addEventListener('webglcontextlost', lostPipe);
    this.canvas.addEventListener('webglcontextrestored', restoredPipe);
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,   // 离屏合成:drawImage 时缓冲必须仍在
    }) as WebGL2RenderingContext | null;
    // ★初始化失败也记 diedAt(2026-08-19 哨兵三捕真凶):消费方退避判
    // now-diedAt>5000,diedAt=0 时恒真 = 每帧重建(playsoft --disable-gpu 下
    // WebGL2 必失败 → 60 张/秒 createElement 风暴,暂停中也持续)
    if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
    // 软件渲染器判不可用(SwiftShader/llvmpipe:上下文可建但软跑纹理采样劣于
    // 2D 回退路径——背景/云消费方均有 2D 兜底;--disable-gpu 场景 2026-08-20)
    try {
      const renderer = String(gl.getParameter(gl.RENDERER) ?? '');
      if (/swiftshader|software|llvmpipe|basic render/i.test(renderer)) {
        this.unavailable = true; this.diedAt = performance.now();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return;
      }
    } catch { /* RENDERER 查询失败按硬件处理 */ }
    this.gl = gl;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[GLSpriteLayer] shader 编译失败:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) { this.unavailable = true; this.diedAt = performance.now(); return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLSpriteLayer] program 链接失败:', gl.getProgramInfoLog(prog));
      this.unavailable = true; this.diedAt = performance.now();
      return;
    }
    this.prog = prog;
    for (const n of ['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uAlpha', 'uTint']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }
    // HorizonClouds 程序（独立编译;失败不致命——cloudQuad 回退普通 quad）
    const cvs = compile(gl.VERTEX_SHADER, CLOUD_VERT_SRC);
    const cfs = compile(gl.FRAGMENT_SHADER, CLOUD_FRAG_SRC);
    if (cvs && cfs) {
      const cp = gl.createProgram()!;
      gl.attachShader(cp, cvs);
      gl.attachShader(cp, cfs);
      gl.linkProgram(cp);
      if (gl.getProgramParameter(cp, gl.LINK_STATUS)) {
        this.progCloud = cp;
        this.cloudFxOK = true;
        for (const n of ['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uVertColor', 'uCelestialCol', 'uDrawPos', 'uCelestial']) {
          this.uniCloud[n] = gl.getUniformLocation(cp, n);
        }
      } else {
        console.warn('[GLSpriteLayer] HorizonClouds 程序链接失败:', gl.getProgramInfoLog(cp));
      }
    }
    // ★B1 tile 面程序（standalone 上下文;管线模式在 initPipeMode 同参登记）
    {
      const tvs = compile(gl.VERTEX_SHADER, TILE_VERT_SRC);
      const tfs = compile(gl.FRAGMENT_SHADER, TILE_FRAG_SRC);
      if (tvs && tfs) {
        const tp = gl.createProgram()!;
        gl.attachShader(tp, tvs);
        gl.attachShader(tp, tfs);
        gl.linkProgram(tp);
        if (gl.getProgramParameter(tp, gl.LINK_STATUS)) {
          this.progTile = tp;
          for (const n of ['uCanvas', 'uDst', 'uSrcT', 'uFboH', 'uTex']) {
            this.uniTile[n] = gl.getUniformLocation(tp, n);
          }
        } else {
          console.warn('[GLSpriteLayer] tile 面程序链接失败:', gl.getProgramInfoLog(tp));
        }
      }
    }
    // 单位 quad VAO+五采样器（旧上下文/管线后端两路共用构造段）
    this.buildCommonObjects(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // ★自愈钩子(2026-08-18 双开"关掉另一窗口也恢复不了"根因):GL 上下文
    // 丢失后【不会自恢复】(2D 会),曾无人监听=永远持有死上下文,背景层
    // 全空且不再重试。死亡即标 unavailable,消费方丢弃实例走 2D 兜底,
    // 退避期后重建新实例
    // ★BJ344（件3）：具名化（dispose 摘除,同 initPipeMode 注）
    const lost = (e: Event) => {
      noteContextLost(`sprite:${this.statName}`);   // #三开压测批
      e.preventDefault();               // 保留恢复资格(部分驱动可自动恢复)
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
      console.warn('[GLSpriteLayer] GL 上下文丢失——标记不可用,消费方回退 2D,5s 后允许重建');
    };
    const restored = () => {
      // 内容(纹理/程序)已全部蒸发:仍按死亡处理,由消费方整体重建更干净
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;   // restore 后 isContextLost()=false 但旧对象已蒸发
    };
    this.ctxLostHandlers.push(lost, restored);
    this.canvas.addEventListener('webglcontextlost', lost);
    this.canvas.addEventListener('webglcontextrestored', restored);
  }
  /** 上下文死亡时刻(重建退避用;0=未死) */
  diedAt = 0;
  /** ★BJ344（件3）：具名 lost/restored 监听柄（dispose 摘除——脱离 canvas 上的闭包滞留面） */
  private ctxLostHandlers: Array<(e: Event) => void> = [];
  /** 对象陈旧旗:lost/restored 后旧对象已蒸发或不属于恢复后的上下文——dispose 跳过 delete */
  objectsStale = false;

  /** 单位 quad VAO+五采样器构造（旧 init 与 C10a 管线后端共用——★采样器参数两路
   *  必须同参,gl-layer-regression 守卫锁 mkSampler 字面量） */
  private buildCommonObjects(gl: WebGL2RenderingContext): void {
    // 单位 quad(TRIANGLE_STRIP)
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    // ★MIN/MAG 分参:MAG_FILTER 只接受 NEAREST|LINEAR(mip 档仅 MIN 合法——
    // 曾把 LINEAR_MIPMAP_LINEAR 也传给 MAG = INVALID_ENUM 警告+MAG 落回
    // sampler 默认 NEAREST,放大采样(地图 zoom>1)错过滤)
    const mkSampler = (minFilter: number, magFilter: number, wrapS: number): WebGLSampler => {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, minFilter);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, magFilter);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, wrapS);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return s;
    };
    this.samp.nearest = mkSampler(gl.NEAREST, gl.NEAREST, gl.CLAMP_TO_EDGE);
    // LINEAR 档 MIN 带 mipmap(缩放对齐 Skia 盒式降采样),MAG 恒 LINEAR
    this.samp.linear = mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.samp.repeat = mkSampler(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.REPEAT);
    // wrap2:双轴 REPEAT(HorizonClouds obj62 ±0.035/0.14 uv 偏移采样须 wrap——
    // 原版 MiscShaderData 默认 SamplerState.LinearWrap;WebGL2 NPOT REPEAT 合法)
    this.samp.wrap2 = (() => {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return s;
    })();
    // linearNoMip:无 mip 线性(quad/tileX 的 noMip 纹理分流;此前从未创建——
    // bindSampler(0, null) 会解绑采样器落回纹理参数,侥幸同语义,现补齐)
    this.samp.linearNoMip = (() => {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return s;
    })();
  }

  /** 画布尺寸(与主画布同尺寸;DPR 内部像素)。
   *  ★C10a 管线后端=pipe.beginFrame（管线画布尺寸+帧界同步,present 的 uDst 域） */
  resize(w: number, h: number): void {
    if (this.unavailable) return;
    if (this.pipe) { this.pipe.beginFrame(w, h); return; }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** 帧开始:清透明(不透明底用 fillQuad 铺)。
   *  ★C10a 管线后端:清的是管线 FBO（RGBA8——与旧 glfx 画布背板同构,
   *  中间产物字节语义=原画布字节）;present 离场留 blend off → 会话态(blend/depth)
   *  每帧显式重建（谁设谁还原判例:管线共享上下文无「init 一次性状态」可倚）。
   *  ★C10b fboName 参数化:云会话缺省 'clouds';bg 会话传 'bg'（纯 bg 与
   *  bg+云合并会话同 FBO——合并=bg quads 后保持开放续交云 quads,FBO 名随
   *  开会话方;管线 FBO 命名空间防撞:clouds/bg/lit/warped/light2 各归各）。
   *  ★B2b clear 参数化（2026-09-24）:世界层单 FBO 累积态（B2b accumulate）——
   *  帧内首段 begin('world') 清透明,后续段/层以 clear=false 续交（FBO 保持
   *  绑定, quad 顺序=层序）,compositeLight 末尾 endAccumulate 取 FBO 纹理
   *  直采（worldCanvas 上传链退役）。clear=false 不重租 FBO（同名幂等）。 */
  begin(fboName = 'clouds', clear = true): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    if (this.pipe) {
      // ★C10e:帧首清屏已改 Renderer.render 头【显式】执行（2026-10-01 实机拖影
      //  补充定谳——隐式「首会话 begin 代理」在帧类变化/管线帧中 revive 时失效或
      //  清错时机,且代理清屏对「帧内首个 pipe 操作非 begin」的帧（compose 直入）
      //  无覆盖;显式=确定性一次,删代理）
      const w = this.canvas.width, h = this.canvas.height;
      if (w === 0 || h === 0) { this.pipeFbo = null; return; }   // 防上一会话残留 FBO 被 end 误 present
      const f = this.pipe.fbo(fboName, w, h);
      if (!f) { this.unavailable = true; this.diedAt = performance.now(); return; }
      this.pipeFbo = f;
      this.pipe.bindTarget(f);   // 绑 FBO+viewport(0,0,f.w,f.h)
      // ★BJ316 判例 getError 审计窗:首 3 次 begin+尺寸首见;先排空（getError 返回
      //  最老未读错误,不排空会把帧内其他调用的旧错误记到本次头上）;稳态零 sync。
      //  错误=上下文级确定性坏 → unavailable 走 2D 兜底（escape=旧会话在旗面）
      const k = `${w}x${h}`;
      const audit = this.pipeAuditLeft > 0 || this.pipeAuditKey !== k;
      if (audit) {
        if (this.pipeAuditLeft > 0) this.pipeAuditLeft--;
        this.pipeAuditKey = k;
        while (gl.getError() !== gl.NO_ERROR) { /* 排空 */ }
      }
      gl.clearColor(0, 0, 0, 0);
      if (clear) gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.prog);
      gl.uniform2f(this.uni.uCanvas, w, h);
      gl.uniform1i(this.uni.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(this.vao);
      if (audit && gl.getError() !== gl.NO_ERROR) {
        this.unavailable = true;
        this.diedAt = performance.now();
        console.warn('[GLSpriteLayer:pipe] begin 审计窗 GL 错误——标记不可用走 2D 兜底');
      }
      return;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.uni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
  }

  /** 读合成画布单像素（begin..end 之间调用；全屏地图黑屏哨兵探针用）。
   *  返回 null = GL 不可用/读失败 */
  readPixel(x: number, y: number): Uint8Array | null {
    if (this.unavailable || !this.gl) return null;
    const out = new Uint8Array(4);
    try {
      this.gl.readPixels(x, y, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, out);
      return out;
    } catch { return null; }
  }

  /** 帧结束(离屏画布交给调用方 drawImage)。
   *  ★C10a 管线后端:FBO → 管线画布 present(GLPipeline.present:blend off+flipY=1;
   *  1:1 LINEAR 采样落 texel 中心=逐位拷贝)——调用方 cloudBlitRect 从 pipe.canvas
   *  取 bbox 子矩形,blit 结构与旧路径同构（一期不改 blit 合并）
   *  ★opresent（2026-09-25）：present=false=延迟收口——FBO 内容留在管线（不 present
   *  不回贴）,供 worldCompose pass3 over(warped, sky) 直采后单 present 消费（单
   *  present 合并刀:两次全屏回贴并成一次）。仅共管管线合并会话（mergedSession,
   *  恒 pipe 后端）使用;FBO 引用必清（防后续 end() 双重 present）。 */
  end(present = true, over = false): void {
    if (this.unavailable || !this.gl) return;
    this.gl.bindVertexArray(null);
    if (this.pipe && this.pipeFbo) {
      if (present) this.pipe.present(this.pipeFbo, over);
      this.pipeFbo = null;
    }
  }

  /** ★C10e：共管管线访问器（屏 present 面=pipe.canvas=可见 DOM 画布;调用方据此
   *  判「end 后无需 2D blit」——非管线后端（glfx 自持画布）恒 null=照旧 blit） */
  get pipeBackend(): GLPipeline | null { return this.pipe; }

  /** ★B2b 累积态收口（2026-09-24）：解绑 VAO、【不 present】,把开着的世界 FBO
   *  交还调用方（GLWorldCompose compose 直采其纹理=worldCanvas 上传链退役;
   *  降级路径用 pipeline.present(fbo) 落画布）。返回 null=无开着 FBO。 */
  endAccumulate(): PipelineFbo | null {
    if (this.unavailable || !this.gl) return null;
    this.gl.bindVertexArray(null);
    const f = this.pipeFbo;
    this.pipeFbo = null;
    return f;
  }

  /** ★B2b 累积态查询：指定名 FBO 当前是否开着（open 未 present）——
   *  帧内后续段续交时跳过 begin(clear) 的判据。 */
  isAccumOpen(name: string): boolean {
    return !!(this.pipe && this.pipeFbo && this.pipeFbo.name === name);
  }

  /** ★liqgl 当前绑定 FBO 的纹理句柄（'liqgate' 绑定期由 emitVanillaLiquidGate 捕获;
   *  无管线/未开会话返回 null） */
  pipeFboTex(): WebGLTexture | null {
    return this.pipeFbo?.tex ?? null;
  }

  /** ★liqgl gate FBO 采样参数（NEAREST CLAMP=canvas 上传 texWater 同档「原版
   *  PointClamp 门控」——GLPipeline.fbo 统一 LINEAR,门控 α×100 饱和场的边缘
   *  采样档必须与 canvas 路径同档:LINEAR 会在水线边缘混出中间 α=门控域半 texel
   *  漂移）。绑定卫生同 fbo 创建判例:存/还当前单元绑定。FBO 重建（变尺寸）后
   *  参数随纹理蒸发=每次发射重设（4 次 texParameteri,帧级可忽略）。 */
  liqGateParams(): void {
    if (this.unavailable || !this.gl || !this.pipeFbo?.tex) return;
    const gl = this.gl;
    const prev = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, this.pipeFbo.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, prev);
  }

  /** 图片源(ImageBitmap/Image/canvas)入纹理;repeatX 横向 REPEAT;
   *  noMip=跳过 mip 链(超大纹理/恒放大或 NEAREST 采样的贴图:小地图/迷雾——
   *  8400×2400 的 mip 重生成是巨量 GPU churn,且它只在 zoom≥1 放大或 NEAREST
   *  下采样时被采样,MIN/mip 永不生效) */
  texFromImage(key: string, img: TexImageSource, repeatX = false, noMip = false, wrapY = false): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (hit) { hit.stamp = ++this.stamp; return hit; }
    const gl = this.gl;
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    // ★texReady 半加载窗守卫（2026-08-25 同类扫描补强）：!w||!h 挡不住"元数据已到
    //  (width>0)但主体未完"窗——texImage2D 该窗上传空内容且按 key **永久入
    //  this.texs**（GL 纹理无重烘焙自愈,比 canvas 毒化更狠）。本方法是全部 GL
    //  贴图（背景层 bg:*/云 cloud:*/小地图/atlas 矩形）的唯一上传口,守卫收口在此
    if (!w || !h || !texReady(img as ImageBitmap | HTMLImageElement | HTMLCanvasElement)) return null;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // ★预乘上传:mip 层平均的是预乘像素(能量正确)——直 Alpha 会让 mip 把
    // 透明像素的 RGB(黑)混进边缘 = 软边缘发暗(对拍实锤树冠边缘差异)。
    // shader 侧公式无需变:out.rgb = premul×tint×uAlpha 恰等于 straight×tint×a
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapY ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    glStatUpload(this.statName, w * h * 4);              // #perf-gpulog:带宽
    glStatTexCreate(this.statName, w * h * 4);           // #perf-gpulog:新纹理→驻留
    const mipped = !noMip;
    if (mipped) gl.generateMipmap(gl.TEXTURE_2D);   // LINEAR 档三线采样(LINEAR_MIPMAP_LINEAR)
    gl.bindTexture(gl.TEXTURE_2D, null);
    const base = w * h * 4;
    const entry: TexEntry = { tex, w, h, stamp: ++this.stamp, bytes: mipped ? base * 4 / 3 : base, mipped, key };
    this.texs.set(key, entry);
    this.bytes += entry.bytes;
    this.evictLRU(key);
    return entry;
  }

  /** 子区增量上传(小地图 dirtyChunks;画布/位图源,纹理须已存在)。
   *  ★WebGL2 的 DOM 源重载只有 8 参(无宽高)——曾传 9 参,Chrome 把画布
   *  【左上角 w×h】贴进目标区 = 脏块全被天空色污染(地图逐渐出现 #362CFF
   *  退化块的根因,2026-08-18 用户实报+探针定罪)。DOM 源取子区必须先抠到
   *  scratch 画布再整幅上传 */
  private scratch: HTMLCanvasElement | null = null;
  texSubUpdate(key: string, src: TexImageSource, x: number, y: number, w: number, h: number): void {
    if (this.unavailable || !this.gl) return;
    const e = this.texs.get(key);
    if (!e) return;
    const gl = this.gl;
    if (!this.scratch) this.scratch = document.createElement('canvas');
    if (this.scratch.width !== w || this.scratch.height !== h) {
      this.scratch.width = w; this.scratch.height = h;
    }
    const sc = this.scratch.getContext('2d', { willReadFrequently: true })!;  // 纯上传中转,SHM 后备不占 IOSurface
    sc.clearRect(0, 0, w, h);
    sc.drawImage(src as CanvasImageSource, x, y, w, h, 0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);   // 同 texFromImage:预乘+mip 能量正确
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch);
    glStatUpload(this.statName, w * h * 4);   // #perf-gpulog
    if (e.mipped) gl.generateMipmap(gl.TEXTURE_2D);   // 子区更新后 mip 链重建
    gl.bindTexture(gl.TEXTURE_2D, null);
    e.stamp = ++this.stamp;
  }

  /** ImageData 源直接子区上传(2026-08-18 小地图 CPU 化:主数据已不在画布上,
   *  ImageData 不能 drawImage 进 scratch——走 8 参 DOM 源重载直传) */
  texSubUpdateData(key: string, src: ImageData, x: number, y: number): void {
    if (this.unavailable || !this.gl) return;
    const e = this.texs.get(key);
    if (!e) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, src);
    glStatUpload(this.statName, src.width * src.height * 4);   // #perf-gpulog
    if (e.mipped) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    e.stamp = ++this.stamp;
  }

  /** ★B2 子区上传（atlas 页 sub-rect → 独立小纹理;实体/弹/尘帧纹理口）。
   *  【为何不整页上传】NPC/player 素材页可达数百 KB~MB,帧工作集逐页驻留会顶爆
   *  MAX_BYTES LRU 引发逐帧换页抖动;帧级 sub-rect 工作集 KB 级。
   *  【scratch 转存】texImage2D 的 DOM 源无 9 参子区重载（texSubUpdate 同款判例）
   *  ——先抠到 scratch 再整面上传。noMip 恒真（实体/尘恒放大或 1:1 采样）。
   *  ★只服务【内容不变】的稳定源（atlas 页/烘焙缓存）;内容会变的 scratch 源
   *  （s1 重着色面等）走 texRefresh 全量重传,不走本口（键会撞陈旧字节）。 */
  texFromRegion(key: string, img: TexImageSource, sx: number, sy: number, sw: number, sh: number): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    if (sw <= 0 || sh <= 0) return null;
    // ★闪屏根因修复（2026-09-30）：亚像素区域（水面波纹相位使表面条带源高 sh∈(0,1)
    //  px——腐化群系水池锁定复现）此前 canvas.height=0.52 → IDL 无符号长整型截断
    //  为 0 → texFromImage !h 守卫 null → resolveTex null → accFail('tex') →
    //  整帧降级=闪屏本体（波相位进 (0,1) 带期间每帧唯一键+每帧失败,ledger 实锤
    //  273/273 全为本型）。修=区域钳 ≥1 整数像素（2D drawImage 亚像素源=采样首行,
    //  1px 纹理同语义,视觉零差）。
    // ★30fps 刀1 键归一（2026-10-05,该修自注「键归一是上游刀」的兑现）：
    //  归一进 texRegionNormalize（模块级纯函数,tests/gl-texregion-keynorm 锁）——
    //  键含原始小数=每帧唯一 miss+每帧唯一纹理（上传+evictLRU 插入→LRU 满容时
    //  逐帧换页级联）从此整类消除。整数调用（sprite 帧面 99.9%+）逐位零改动。
    const n = texRegionNormalize(key, sx, sy, sw, sh);
    const hit = this.texs.get(n.key);
    if (hit) { hit.stamp = ++this.stamp; return hit; }
    if (!this.regScratch) this.regScratch = document.createElement('canvas');
    const sc = this.regScratch;
    if (sc.width !== n.sw || sc.height !== n.sh) { sc.width = n.sw; sc.height = n.sh; }
    const scx = this.regScratchCtx ??= sc.getContext('2d', { willReadFrequently: true })!;
    scx.clearRect(0, 0, n.sw, n.sh);
    scx.drawImage(img as CanvasImageSource, n.sx, n.sy, n.sw, n.sh, 0, 0, n.sw, n.sh);
    return this.texFromImage(n.key, sc, false, true);
  }
  private regScratch: HTMLCanvasElement | null = null;
  private regScratchCtx: CanvasRenderingContext2D | null = null;

  /** ★B2 动态源全量重传（s1/mountTintScratch 等内容每绘都变的 scratch 源）。
   *  已驻留则同纹理 texImage2D 重规格化（零 createTexture/deleteTexture 抖动——
   *  逐尘 create/delete 是驱动 churn 反模式）;未驻留则 texFromImage 建键。
   *  键 = 动态源 img 实例 id（全画布;子区绘制也只是多传无效区,字节数小可忽略）。 */
  texRefresh(key: string, img: TexImageSource): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (!hit) return this.texFromImage(key, img, false, true);
    const gl = this.gl;
    if (!(img as { width: number }).width || !(img as { height: number }).height) return hit;
    if ((img as { width: number }).width !== hit.w || (img as { height: number }).height !== hit.h) {
      this.dropTexture(key);   // 尺寸变了:重规格化不可用,走重建
      return this.texFromImage(key, img, false, true);
    }
    gl.bindTexture(gl.TEXTURE_2D, hit.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    glStatUpload(this.statName, hit.w * hit.h * 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    hit.stamp = ++this.stamp;
    return hit;
  }

  /** ★P1-B 子区上传（2026-09-28 栅格化族上传风暴根治;GLShimExecutor.resolveTex
   *  2026-09-27 登记债注含完整设计+三风险预案,本刀按注落地）:动态 scratch 的
   *  【左上子区】(0,0,sw,sh) 增量重传——栅格化族（rasterizeDrawImage/rasterizePathOp/
   *  rasterizeFillRect/rasterizeOp）与 bolt bake 的 quad 只实采 scratch 左上
   *  (0,0,sw,sh),整幅 texRefresh 在面被「需求∈(半幅,全幅] 的 op 流」顶住滞回
   *  不回落时逐 op 全幅重传（实测 1650²=10.9MB/op,霜月 42.4% 墙钟定谳面）。
   *  【三链分档】①未驻留/换尺寸 → 整幅 texFromImage/drop 重建（首次创建仍需全幅,
   *  按注:单 premul 往返=逐字节精确）;②同尺寸驻留 → 抠 (0,0,sw,sh) 到隔离面 +
   *  texSubImage2D 增量（上传量=sw×sh,典型 10-100× 缩减）;③越界/零尺寸防御 →
   *  整幅 texRefresh 退回。驻留纹理恒全幅尺寸（hit.w/h 不变）——调用方 UV
   *  (÷e.w/e.h)/texKind 语义零改动。
   *  【三风险处置（注中预案）】①首建/换尺寸=整幅精确链（见上）;②抠图引入第二次
   *  premul↔unpremul 往返=α<255 像素 ±1LSB 漂移（尘对合并「中间舍入差 ≤1LSB,
   *  登记」同款 census 有界口径——栅格化族为特效面,调用方半幅门把收益不足的
   *  op 挡回整幅精确链）;③账本联动:glStatUpload 记【子区】字节（带宽真值,
   *  texSubUpdate 小地图 :798 判例同口径）,entry.bytes/LRU 驻留账恒全幅
   *  （texFromImage 建账,纹理对象尺寸未变,不动 evictLRU）。
   *  ★texEpoch 交互:er: 纪元键只存在于静态 texFromRegion 支（texCache 命中判定）,
   *  本口只服务 dyn:/bake 稳定键——纪元命中语义零交集;同键返回同一 entry 对象
   *  （stamp 推进）,外部持引用面（texAlive/preTex/texCache）语义不变。
   *  隔离面复用 regScratch（texFromRegion 同款 willReadFrequently 上传中转,
   *  判例 R3-F8;调用同步单线程无重入）。 */
  texRefreshRegion(key: string, img: TexImageSource, sw: number, sh: number): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (!hit) return this.texFromImage(key, img, false, true);   // ①首建=整幅（精确单往返）
    const iw = (img as { width: number }).width, ih = (img as { height: number }).height;
    if (!iw || !ih) return hit;
    if (iw !== hit.w || ih !== hit.h) {   // 换尺寸:重规格化不可用,drop 重建（同 texRefresh 通道）
      this.dropTexture(key);
      return this.texFromImage(key, img, false, true);
    }
    if (!(sw > 0 && sh > 0) || sw > hit.w || sh > hit.h) return this.texRefresh(key, img);   // ③防御
    const gl = this.gl;
    if (!this.regScratch) this.regScratch = document.createElement('canvas');
    const sc = this.regScratch;
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const scx = this.regScratchCtx ??= sc.getContext('2d', { willReadFrequently: true })!;
    scx.clearRect(0, 0, sw, sh);
    scx.drawImage(img as CanvasImageSource, 0, 0, sw, sh, 0, 0, sw, sh);
    gl.bindTexture(gl.TEXTURE_2D, hit.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sc);
    glStatUpload(this.statName, sw * sh * 4);   // ③带宽=子区;驻留账（entry.bytes）恒全幅
    if (hit.mipped) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    hit.stamp = ++this.stamp;
    return hit;
  }

  /** ★B2 字节直传（尘预乘对合并纹理:rgb=预乘 add 面,a=erase 面）。数据已是
   *  预乘字节——禁 UNPACK_PREMULTIPLY（二次预乘=rgb 再乘 a=暗一档）;无 mip。
   *  采样档由 quadSprite 按调用面绑定（纹理参数只兜底）。 */
  texFromData(key: string, data: Uint8Array, w: number, h: number): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (hit) { hit.stamp = ++this.stamp; return hit; }
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    glStatUpload(this.statName, w * h * 4);
    glStatTexCreate(this.statName, w * h * 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const entry: TexEntry = { tex, w, h, stamp: ++this.stamp, bytes: w * h * 4, mipped: false, key };
    this.texs.set(key, entry);
    this.bytes += entry.bytes;
    this.evictLRU(key);
    return entry;
  }

  /** ★B2 纹理存活查询（flush 期逐 rec 解析防 LRU 逐出后画死纹理——缓存命中但
   *  已被 evictLRU/世界切换清表的 entry 必须重传）。texFromData/texFromRegion
   *  建的 entry 带 key（texFromImage 同步补）;null-key entry（外部直持）按存活算。 */
  texAlive(e: TexEntry): boolean {
    return !e.key || this.texs.get(e.key) === e;
  }

  /** ★liqpolish 纹理表代际（2026-09-29 微抛光刀;微光环境 texAlive self 176.9ms/
   *  1.26% 定谳面——稳定键族 resolveTex 逐 rec texAlive=Map.get+恒等比较逐 quad 税）。
   *  【所有删表路径必 bump】evictLRU（有删才 bump）/dropTexture/dispose 系列
   *  texs.clear()——bump 后旧 chk 戳全部失效=逐出窗语义与逐 rec texAlive 逐位同
   *  （判别器=逐出注入下守卫仍拦得住,tests/liqpolish-guard.test.ts）。 */
  texGen = 0;

  /** ★liqpolish 按 flush 代际批检的 texAlive（语义=逐 rec 查询,成本=命中窗一次
   *  Map.get+数字比较/op）:entry.chk===texGen ⇒ 本代际（自上次删表以来）已验活,
   *  直通;否则真查 texAlive 并盖戳。批检窗=两次删表之间（flush 期内批 rec 的
   *  texFromImage 可能触发 evictLRU=bump→后续 rec 重验=LRU 逐出窗语义保持）。 */
  texCheck(e: TexEntry): boolean {
    if (e.chk === this.texGen) return true;
    if (!e.key || this.texs.get(e.key) === e) { e.chk = this.texGen; return true; }
    return false;
  }

  /** 按键主动释放(全屏地图关闭时丢弃整幅纹理——地图只在打开期占 GPU)。
   *  ★liqpolish:删表必 bump 代际（texCheck 批检窗闭合） */
  dropTexture(key: string): void {
    if (!this.gl) return;
    const e = this.texs.get(key);
    if (!e) return;
    this.texs.delete(key);
    this.bytes -= e.bytes;
    glStatDelete(this.statName, e.bytes);   // #perf-gpulog
    this.gl.deleteTexture(e.tex);
    this.texGen++;
  }

  /** SpriteAtlas DrawRect 便捷入口 */
  drawRect(rect: DrawRect, dx: number, dy: number, dw: number, dh: number, opts?: QuadOpts): void {
    if (this.unavailable) return;
    // ★bitmap 无 .src(旧键退化为 'cv' → 同尺寸跨表碰撞隐患);texId 实例自增
    const tag = String(texId(rect.img));
    const e = this.texFromImage(`r:${rect.img.width}x${rect.img.height}:${tag}:${rect.sx},${rect.sy}`, rect.img as TexImageSource);
    if (!e) return;
    this.quad(e, rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, dw, dh, opts);
  }

  /** 纯色矩形(不透明底/黑盒垫底;tint 即颜色) */
  fillQuad(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 1): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    // 复用 quad 通道:1×1 白纹理 + tint
    const e = this.texFromImage('__white', WHITE_PX);
    if (!e) return;
    this.quad(e, 0, 0, 1, 1, x, y, w, h, { alpha: a, tint: [r, g, b], smooth: false });
    void gl;
  }

  /** 核心:单 quad。uv 半像素内缩(防 CLAMP 边缘渗色) */
  /** ★C10d 共享上下文绘制态自包含（2026-09-30 闪屏定谳硬化工）：swpipe 单上下文
   *  跑多个 GLSpriteLayer 实例（acc 世界层+云/bg 会话管线后端），program/VAO 是
   *  【上下文级】共享态——任何他实例 begin()/present() 都会换掉它们，而下列
   *  绘制入口曾依赖「begin 约定」（本实例 begin 早已设好）= 跨实例互扰窗
   *  （云会话 begin 换态 → acc flush 拿他实例 VAO/程序画 tile 批=坏帧指纹
   *  「bg 纹理透出 tile 位」）。uniform 属程序态(per-program)不受会话切换影响；
   *  blend/采样器各绘制位自设。幂等：态已在位=两次廉价冗余状态调用。 */
  private ensureBaseState(): void {
    const gl = this.gl!;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
  }

  /** ★C10d:仅恢复本实例 VAO（quadTile 等自管程序位用——drawArrays 顶点若经
   *  attrib 指针取数,他实例 VAO=他 VBO 残留） */
  private bindOwnVao(): void {
    this.gl!.bindVertexArray(this.vao);
  }

  quad(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number, opts?: QuadOpts,
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const gl = this.gl;
    this.ensureBaseState();
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    // 采样器按【纹理是否带 mip】分流：mipped 用三线(linear)，noMip 用无 mip 线性
    // (linearNoMip)——拿三线采样器采无 mip 纹理=不完整恒黑
    const wantLinear = opts?.smooth ?? true;
    gl.bindSampler(0, wantLinear
      ? (e.mipped ? this.samp.linear! : this.samp.linearNoMip!)
      : this.samp.nearest!);
    const px = 0.5 / e.w, py = 0.5 / e.h;
    const v0 = (sy + py) / e.h, v1 = (sy + sh - py) / e.h;
    const ua = (sx + px) / e.w, ub = (sx + sw - px) / e.w;
    // flipX = u 区间反向(顶点位置不变,采样镜像)
    const u0 = opts?.flipX ? ub : ua, u1 = opts?.flipX ? ua : ub;
    gl.uniform4f(this.uni.uSrc, u0, v0, u1 - u0, v1 - v0);
    this.setCommon(dx, dy, dw, dh, opts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);   // #perf-gpulog
    gl.bindSampler(0, null);
  }

  /** ★B1 世界层 tile 面 quad（2026-09-24）：全跨度 uv（无半像素内缩）+ NEAREST
   *  采样——2D drawImage(imageSmoothingEnabled=false) 最近邻映射的逐式复刻。
   *  ★为何不复用 quad()：quad() 的 uv 半像素内缩（px=0.5/w,CLAMP 渗色判例）
   *  把采样域收缩到 [sx+0.5, sx+sw−0.5]——NEAREST 下尾列/尾行采到倒数第二
   *  texel（i=dw−1 → src≈sx+sw−1.5,floor 少 1），与 2D 的
   *  floor(sx+(i+0.5)·sw/dw) 全域错位,禁用于最近邻 tile 面。
   *  【逐字节等价论证】全跨度 uv+NEAREST 下 GL src = sx+(i+0.5−dx)·sw/dw,
   *  与 2D 同式;整数设备矩形(dx/dw 恒整)下:①最近邻 tie（src 恰落整数）⟺
   *  sw·(2i'+1)/dw ∈ ℤ → tie 位 i'=(dw·k−1)/2 → 顶点插值参数
   *  t=(i'+0.5)/dw=k/2 恒 2 的幂分数=fp32 精确,两侧同取 floor;②非 tie
   *  最小分数距 = 1/dw ≥ 1/512 ≈ 2e-3 ≫ varying 插值 fp32 误差(~2.5e-5
   *  texel)→ 无翻转面。缩放相位(1.25/1.27/1.5625/低清 K<1)全档成立,
   *  像素对拍 scripts/_b1-world-ab.mjs 锁。 */
  quadExact(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const gl = this.gl;
    this.ensureBaseState();   // ★C10d
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, this.samp.nearest!);   // 恒 NEAREST(与 2D smoothing off 同采样)
    // ★tie 相位补正:采样域整体 −ε（texel 单位）——Chrome 2D 最近邻在【精确 tie】
    //  (src 坐标恰落 texel 整数边界,2:1 整档缩放全像素 tie)取 c−1,硬件 NEAREST
    //  floor 取 c（微测 scripts/_b1-micro-quad.mjs:W=325 n=649=325+324 恰 tie 网格
    //  实证）。ε=2⁻¹² ≪ 非 tie 最小分数距(≥1/512)且 ≫ varying 插值误差
    //  (微测非 tie 零翻转约束 <3e-3);左缘 c−ε>0、右缘 c<sw 恒不出源矩形。
    gl.uniform4f(this.uni.uSrc, (sx - QUAD_TIE_EPS) / e.w, (sy - QUAD_TIE_EPS) / e.h,
      sw / e.w, sh / e.h);
    this.setCommon(dx, dy, dw, dh, undefined);   // α=1/tint=白/rot=0
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);
    gl.bindSampler(0, null);
  }

  /** ★B2 shim 执行器发射口（2026-09-24）：quadExact 的全跨度 uv+ε tie 补正推广版
   *  ——支持 alpha/tint/rot/flipX/flipY/smooth（quadExact 是本式的零 opts 特例）。
   *  【为何不用 quad()】quad() 的 uv 半像素内缩是 LINEAR CLAMP 渗色判例的防渗
   *  手法，NEAREST 下尾列/尾行采错档（quadExact 注）；实体/弹/尘的 2D 语义是
   *  「全跨度映射+按 imageSmoothingEnabled 选采样」，故全跨度为正身。
   *  【tie 补正】同 quadExact：src 域整体 −ε（texel 单位）复刻 Chrome 2D 最近邻
   *  精确 tie 取 c−1 语义；分数 dst 相位下的 tie 本就随 Skia 定点游走漂移
   *  （B1 Skia tie 定谳）=census 有界登记，不在此复现。
   *  blend 不在此设——SO 批走 begin 的 (ONE,1−SA)，ADD 批由调用方 blendAdditive
   *  包裹（谁设谁还原）。 */
  quadSprite(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    opts?: { alpha?: number; tint?: readonly [number, number, number] | null; rot?: number; flipX?: boolean; flipY?: boolean; smooth?: boolean },
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const gl = this.gl;
    this.ensureBaseState();   // ★C10d:跨实例互扰硬ening（注释见 ensureBaseState）
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, (opts?.smooth ?? false)
      ? (e.mipped ? this.samp.linear! : this.samp.linearNoMip!)
      : this.samp.nearest!);
    const ua = (sx - QUAD_TIE_EPS) / e.w, ub = (sx + sw - QUAD_TIE_EPS) / e.w;
    const va = (sy - QUAD_TIE_EPS) / e.h, vb = (sy + sh - QUAD_TIE_EPS) / e.h;
    const u0 = opts?.flipX ? ub : ua, u1 = opts?.flipX ? ua : ub;
    const v0 = opts?.flipY ? vb : va, v1 = opts?.flipY ? va : vb;
    gl.uniform4f(this.uni.uSrc, u0, v0, u1 - u0, v1 - v0);
    this.setCommon(dx, dy, dw, dh, opts as QuadOpts | undefined);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);
    gl.bindSampler(0, null);
  }

  /** ★B2 ADD 批混合切换（尘 A=0 加性族 'lighter' 精确映射）。on=true 切 (ONE,ONE)
   *  加算，false 还原 begin 约定的 (ONE,1−SA)——谁设谁还原判例，批间必须成对。 */
  blendAdditive(on: boolean): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    if (on) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** ★B2b ERASE 档混合切换（未注册削底面 tier-2——destination-out 直绘语义:
   *  out=dst×(1−srcA),GLPipeline.setBlend('erase') 同表 (ZERO,1−SA)）。
   *  on=true 切削底,false 还原 (ONE,1−SA) 基态——谁设谁还原判例。 */
  blendErase(on: boolean): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    if (on) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** ★B2b MULT 档混合切换（tier-3 multiply 实心矩形——Canvas 'multiply' 的
   *  逐字节精确式（★2026-09-25 普查翻案,原 (ZERO,SRC_COLOR) 已证病）：
   *  Canvas multiply（αs=1 不透明源,预乘域推导）out.rgb=Cs×(1−αb+αbCb)
   *  =S×(1−Da)+D×S、αo=αs+αb(1−αs)=1 → GL (ONE_MINUS_DST_ALPHA, SRC_COLOR)
   *  双通道同表。旧 (ZERO,SRC_COLOR)=dst×C 丢了 S×(1−Da) 项且 α 保 dst.a——
   *  半透明/透明 dst 格与 2D 分道（探针 _census-flagcolor-dolltint ③:
   *  GL(128,64,0,128) vs 2D(127,64,0,255) 实锤;shimmer 瀑布拖尾 opacity<1
   *  拖尾格=可见受害面）。不透明 dst（旗贴墙主面）两式逐位同=旗案回归零。
   *  false 还原 (ONE,1−SA) 基态。 */
  blendMult(on: boolean): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    if (on) gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.SRC_COLOR);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** ★B1 tile 面 quad（gl_FragCoord texelFetch——任意 dst offset/缩放相位下
   *  最近邻映射精确;tie 语义 ≙ Chrome 2D,见 TILE_*_SRC 注）。程序不可用返回
   *  false（调用方回 2D 栅格化）。draw 后恢复基础 quad 程序态（begin 约定）。 */
  quadTile(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ): boolean {
    if (this.unavailable || !this.gl || !this.progTile) return false;
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return false;
    const gl = this.gl;
    gl.useProgram(this.progTile);
    this.bindOwnVao();   // ★C10d:tile 顶点经 uniforms 合成,VAO 只需本实例在场（他实例 VAO=他 VBO 残留）
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, null);   // texelFetch 不经采样器;解绑防残留
    gl.uniform2f(this.uniTile.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform4f(this.uniTile.uDst, dx, dy, dw, dh);
    gl.uniform4f(this.uniTile.uSrcT, sx, sy, sw, sh);
    gl.uniform1f(this.uniTile.uFboH, this.canvas.height);
    gl.uniform1i(this.uniTile.uTex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);
    gl.useProgram(this.prog);   // 程序态还原（begin 设定基础 quad 程序在场）
    return true;
  }

  /** ★C5 雨批程序惰性装配（quadTile 同款失败面:rainFail=true 恒走 2D 兜底）。
   *  管线模式走 pipe.program('sprite:rain') 按名登记（禁单删判例——程序表归
   *  pipe.dispose 整表清理）;独立上下文模式走 trail 同款本地编译。
   *  VAO:location0=aPos(vec2)/1=aUv(vec2)/2=aCol(vec3),stride 28B（7 float）,
   *  顶点数据由调用方每帧 STREAM_DRAW 重传（单动态源上传=IOSurface 零新增——
   *  复用本层单 VBO,无逐帧建面）。 */
  private ensureRain(): boolean {
    if (this.rainFail) return false;
    if (this.rainProg) return true;
    const gl = this.gl;
    if (!gl) return false;
    if (this.pipe) {
      const p = this.pipe.program('sprite:rain', RAIN_VS, RAIN_FS);
      if (!p.prog) { this.rainFail = true; return false; }
      this.rainProgHandle = p;
      this.rainProg = p.prog;
      for (const n of ['uCanvas', 'uTex']) this.rainUni[n] = this.pipe.uni(p, n);
    } else {
      const mk = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn('[GLSpriteLayer] rain batch shader 编译失败:', gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = mk(gl.VERTEX_SHADER, RAIN_VS);
      const fs = mk(gl.FRAGMENT_SHADER, RAIN_FS);
      if (!vs || !fs) { this.rainFail = true; return false; }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[GLSpriteLayer] rain batch 程序链接失败:', gl.getProgramInfoLog(prog));
        this.rainFail = true;
        return false;
      }
      this.rainProg = prog;
      for (const n of ['uCanvas', 'uTex']) this.rainUni[n] = gl.getUniformLocation(prog, n);
    }
    this.rainVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.rainVao);
    this.rainVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rainVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16);
    gl.bindVertexArray(null);
    return true;
  }

  /** ★C5 雨批发射口（GLShimExecutor.pushQuadBatch 消费）：N 个预变换四边形
   *  单 drawArrays(TRIANGLES, 6N) 发射——750 滴/帧 750 draw call → 1。
   *  data 布局 = 6 顶点/quad × 7 float（x,y,u,v,r,g,b;TRIANGLES 两三角
   *  (p0,p1,p2)+(p0,p2,p3)）;NEAREST 采样;blend/纹理参数不在本方法设
   *  （SO 基态由 begin 约定;纹理参数由调用方 texFromImage 兜底）。
   *  离场还原程序态/VAO（quadTile 判例:begin 设定基础 quad 程序在场）。 */
  quadBatch(e: TexEntry, data: Float32Array, quads: number): boolean {
    if (this.unavailable || !this.gl || quads <= 0) return false;
    if (!this.ensureRain()) return false;
    const gl = this.gl;
    gl.useProgram(this.rainProg);
    gl.uniform2f(this.rainUni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.rainUni.uTex, 0);
    gl.bindVertexArray(this.rainVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rainVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, this.samp.nearest!);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    glStatDraw(this.statName, quads * 6);
    gl.bindSampler(0, null);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    return true;
  }

  /** ★C5b 雪沙批程序惰性装配（ensureRain 同款失败面:precipFail=true 恒走 2D 兜底）。
   *  管线模式走 pipe.program('sprite:precip') 按名登记（禁单删判例）;独立上下文
   *  模式走 rain 同款本地编译。VAO:location0=aPos(vec2)/1=aUv(vec2)/2=aCol(vec4),
   *  stride 32B（8 float）,顶点数据调用方每帧 STREAM_DRAW 重传（复用本层单 VBO）。 */
  private ensurePrecip(): boolean {
    if (this.precipFail) return false;
    if (this.precipProg) return true;
    const gl = this.gl;
    if (!gl) return false;
    if (this.pipe) {
      const p = this.pipe.program('sprite:precip', PRECIP_VS, PRECIP_FS);
      if (!p.prog) { this.precipFail = true; return false; }
      this.precipProgHandle = p;
      this.precipProg = p.prog;
      for (const n of ['uCanvas', 'uTex']) this.precipUni[n] = this.pipe.uni(p, n);
    } else {
      const mk = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn('[GLSpriteLayer] precip batch shader 编译失败:', gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = mk(gl.VERTEX_SHADER, PRECIP_VS);
      const fs = mk(gl.FRAGMENT_SHADER, PRECIP_FS);
      if (!vs || !fs) { this.precipFail = true; return false; }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[GLSpriteLayer] precip batch 程序链接失败:', gl.getProgramInfoLog(prog));
        this.precipFail = true;
        return false;
      }
      this.precipProg = prog;
      for (const n of ['uCanvas', 'uTex']) this.precipUni[n] = gl.getUniformLocation(prog, n);
    }
    this.precipVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.precipVao);
    this.precipVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.precipVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    return true;
  }

  /** ★C5b 雪沙批发射口（quadBatch 同款;stride 8=x,y,u,v,r,g,b,a——第 4 分量
   *  逐 quad α,沙尘叠画 180/255 精确保序单 drawArrays。blend/纹理参数不在本
   *  方法设（SO 基态由 begin 约定）;离场还原程序态/VAO（quadBatch 判例同款）。 */
  quadBatchRgba(e: TexEntry, data: Float32Array, quads: number, smooth = false): boolean {
    if (this.unavailable || !this.gl || quads <= 0) return false;
    // ★C13c 数据形状分派（加法支;既有调用零变化判据=既有面 stride 恒 48 float/quad,
    //  66 float/quad 仅 VanillaLiquidRenderer._shimRing 微光段产出——C13 星场批 smooth
    //  缺省参判例同构「缺省=既有调用零变化」）。分派点=本发射口的理由:stride-11 数据
    //  经 shim rec（Renderer 中介/GLShimExecutor 队列）到此是唯一既见数据又见 GL 的位。
    if (data.length === quads * 66) return this.quadBatchLiqShimmer(e, data, quads);
    // ★K2 力场泡场数据形状分派（stride 9=x,y,u,v,r,g,b,a,t——54/quad 唯一判别,
    //  既有 rgba 面 stride 8=48/quad、微光 stride 11=66/quad 零交集;分派点=本发射口
    //  「既见数据又见 GL」c13c 判例同位）
    if (data.length === quads * 54) return this.quadBatchForceField(e, data, quads);
    if (!this.ensurePrecip()) return false;
    const gl = this.gl;
    gl.useProgram(this.precipProg);
    gl.uniform2f(this.precipUni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.precipUni.uTex, 0);
    gl.bindVertexArray(this.precipVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.precipVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    // ★C13 星场批（2026-09-30）：smooth=true=线性采样（星贴图缩放软边语义,2D
    //  imageSmoothingEnabled=true 对位;缺省 false=既有雨/沙/gore 调用零变化）
    gl.bindSampler(0, smooth
      ? (e.mipped ? this.samp.linear! : this.samp.linearNoMip!)
      : this.samp.nearest!);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    glStatDraw(this.statName, quads * 6);
    gl.bindSampler(0, null);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    return true;
  }

  /** ★C13c 微光波场批程序惰性装配（ensurePrecip 同款失败面:shimFail=true 恒走 2D 兜底）。
   *  管线模式走 pipe.program('sprite:liqshimmer') 按名登记（禁单删判例）;独立上下文
   *  模式走 rain 同款本地编译。VAO:location0=aPos(vec2)/1=aUv(vec2)/2=aCol(vec4)/
   *  3=aTile(vec2)/4=aNoise(float),stride 44B（11 float）,顶点数据调用方每帧
   *  STREAM_DRAW 重传（复用本层单 VBO判例）。 */
  private ensureLiqShim(): boolean {
    if (this.shimFail) return false;
    if (this.shimProg) return true;
    const gl = this.gl;
    if (!gl) return false;
    if (this.pipe) {
      const p = this.pipe.program('sprite:liqshimmer', LIQSHIM_VS, LIQSHIM_FS);
      if (!p.prog) { this.shimFail = true; return false; }
      this.shimProgHandle = p;
      this.shimProg = p.prog;
      for (const n of ['uCanvas', 'uTex', 'uTVis', 'uSpark']) this.shimUni[n] = this.pipe.uni(p, n);
    } else {
      const mk = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn('[GLSpriteLayer] liqshimmer shader 编译失败:', gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = mk(gl.VERTEX_SHADER, LIQSHIM_VS);
      const fs = mk(gl.FRAGMENT_SHADER, LIQSHIM_FS);
      if (!vs || !fs) { this.shimFail = true; return false; }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[GLSpriteLayer] liqshimmer 程序链接失败:', gl.getProgramInfoLog(prog));
        this.shimFail = true;
        return false;
      }
      this.shimProg = prog;
      for (const n of ['uCanvas', 'uTex', 'uTVis', 'uSpark']) this.shimUni[n] = gl.getUniformLocation(prog, n);
    }
    this.shimVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shimVao);
    this.shimVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shimVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 44, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 44, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 32);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
    gl.bindVertexArray(null);
    return true;
  }

  /** ★K3 星批 idle 预热面（2026-10-01）:sprite:precip 程序惰性编译提前——
   *  世界载入完成后空闲期调用（SkyRenderer.prewarmStarBatch → mainFlow 幕布掀除后
   *  rIC 挂点）;失败面=precipFail 恒走 2D 兜底语义不变。 */
  prewarmPrecip(): boolean { return this.ensurePrecip(); }

  /** ★K2 力场泡场批程序惰性装配（ensureLiqShim 同款失败面:ffFail=true 恒走 2D 兜底）。
   *  管线模式走 pipe.program('sprite:forcefield') 按名登记（禁单删判例）;独立上下文
   *  模式走 rain 同款本地编译。VAO:location0=aPos(vec2)/1=aUv(vec2)/2=aCol(vec4)/
   *  3=aTime(float),stride 36B（9 float）,顶点数据调用方每帧 STREAM_DRAW 重传
   *  （复用本层单 VBO 判例）。 */
  private ensureForceField(): boolean {
    if (this.ffFail) return false;
    if (this.ffProg) return true;
    const gl = this.gl;
    if (!gl) return false;
    if (this.pipe) {
      const p = this.pipe.program('sprite:forcefield', FFIELD_VS, FFIELD_FS);
      if (!p.prog) { this.ffFail = true; return false; }
      this.ffProgHandle = p;
      this.ffProg = p.prog;
      for (const n of ['uCanvas', 'uTex']) this.ffUni[n] = this.pipe.uni(p, n);
    } else {
      const mk = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn('[GLSpriteLayer] forcefield shader 编译失败:', gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = mk(gl.VERTEX_SHADER, FFIELD_VS);
      const fs = mk(gl.FRAGMENT_SHADER, FFIELD_FS);
      if (!vs || !fs) { this.ffFail = true; return false; }
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[GLSpriteLayer] forcefield 程序链接失败:', gl.getProgramInfoLog(prog));
        this.ffFail = true;
        return false;
      }
      this.ffProg = prog;
      for (const n of ['uCanvas', 'uTex']) this.ffUni[n] = gl.getUniformLocation(prog, n);
    }
    this.ffVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ffVao);
    this.ffVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ffVbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindVertexArray(null);
    return true;
  }

  /** ★K2 力场泡场批发射口（quadBatchLiqShimmer 同族;stride 9=x,y,u,v,r,g,b,a,t——
   *  uColor 逐 quad 顶点色、uTime 逐 quad aTime,四塔免 uniform 分档）。LINEAR CLAMP
   *  采样（=runPassOnImageData 双线性+钳边档）;blend 不在此设（批基态 (ONE,1−SA)=
   *  2D 产物 source-over 直 alpha 语义,FS 侧预乘式已折算）;离场还原程序态/VAO
   *  （quadBatch 判例同款）。 */
  quadBatchForceField(e: TexEntry, data: Float32Array, quads: number): boolean {
    if (this.unavailable || !this.gl || quads <= 0) return false;
    if (!this.ensureForceField()) return false;
    const gl = this.gl;
    gl.useProgram(this.ffProg);
    gl.uniform2f(this.ffUni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.ffUni.uTex, 0);
    gl.bindVertexArray(this.ffVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ffVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, this.samp.linearNoMip!);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    glStatDraw(this.statName, quads * 6);
    gl.bindSampler(0, null);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    return true;
  }

  /** ★C13c 微光波场批发射口（quadBatchRgba 同族;stride 11=x,y,u,v,r,g,b,a,tileX,tileY,
   *  noise——方案 H:波场 FS 逐像素解析,aNoise=CPU 逐节点 noise-sin 顶点属性）。
   *  ★三期（2026-10-02）双模式:uSpark 按段键族分派——liqspark: 前缀=亮纹段（FS
   *  glitter(vTile,vNoise) 逐像素调制;ADD blend 由 pushLiquidAddBatch tier-1 rec
   *  驱动 flushAcc 换档链,本方法不设 blend）,其余=基体场段（rgb===a 预乘恒等域）。
   *  NEAREST 采样;纹理参数不在本方法设（SO 基态由 begin 约定）;uTVis 读模块态
   *  （setLiqShimmerTVis——批发射点单点写入,帧界错拍风险 §5-6 处置）;离场还原程序态/
   *  VAO（quadBatch 判例同款）。 */
  quadBatchLiqShimmer(e: TexEntry, data: Float32Array, quads: number): boolean {
    if (this.unavailable || !this.gl || quads <= 0) return false;
    if (!this.ensureLiqShim()) return false;
    const gl = this.gl;
    gl.useProgram(this.shimProg);
    gl.uniform2f(this.shimUni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.shimUni.uTVis, _liqShimTVis);
    if (this.shimUni.uSpark) gl.uniform1f(this.shimUni.uSpark, (e.key ?? '').startsWith('liqspark:') ? 1 : 0);
    gl.uniform1i(this.shimUni.uTex, 0);
    gl.bindVertexArray(this.shimVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shimVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.bindSampler(0, this.samp.nearest!);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    glStatDraw(this.statName, quads * 6);
    gl.bindSampler(0, null);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    return true;
  }

  /** 横向平铺:dst 区间内按"dw 对应一个源周期"重复(GL REPEAT 一次画整段,
   *  替代 2D for 循环逐 tile drawImage)。纹理须以 repeatX=true 创建 */
  tileX(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, totalW: number, dh: number, opts?: QuadOpts,
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || totalW <= 0 || dh <= 0) return;
    const gl = this.gl;
    this.ensureBaseState();   // ★C10d
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    // repeat 档同理按 mipped 分流（现网调用方均为 mipped 世界背景；noMip+REPEAT
    // 组合留 linearNoMipRepeat 防将来踩同坑）
    gl.bindSampler(0, e.mipped ? this.samp.repeat! : this.samp.linearNoMip!);
    const px = 0.5 / e.w, py = 0.5 / e.h;
    const u0 = (sx + px) / e.w, v0 = (sy + py) / e.h;
    const span = ((sx + sw - px) - (sx + px)) / e.w * (totalW / dw);
    gl.uniform4f(this.uni.uSrc, u0, v0, span, ((sy + sh - py) - (sy + py)) / e.h);
    this.setCommon(dx, dy, totalW, dh, opts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);   // #perf-gpulog
    gl.bindSampler(0, null);
  }

  private setCommon(dx: number, dy: number, dw: number, dh: number, opts?: QuadOpts): void {
    const gl = this.gl!;
    gl.uniform4f(this.uni.uDst, dx, dy, dw, dh);
    gl.uniform1f(this.uni.uRot, opts?.rot ?? 0);
    gl.uniform1f(this.uni.uAlpha, opts?.alpha ?? 1);
    const t = opts?.tint ?? WHITE3;
    gl.uniform3f(this.uni.uTint, t[0], t[1], t[2]);
  }

  /** HorizonClouds 云 quad（obj62 逐像素公式;整朵云一个 draw call,uniform 每云一发）。
   *  fx 缺失/程序编译失败 → 调用方应回退普通 quad(本方法不回退,保持路径单一)。 */
  cloudQuad(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    rot: number, flipX: boolean, fx: CloudFx,
  ): void {
    if (this.unavailable || !this.gl || !this.progCloud || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.progCloud);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    // 原版 LinearWrap(双轴 wrap);mip 分流同 quad
    gl.bindSampler(0, e.mipped ? this.samp.wrap2! : this.samp.linearNoMip!);
    const px = 0.5 / e.w, py = 0.5 / e.h;
    const v0 = (sy + py) / e.h, v1 = (sy + sh - py) / e.h;
    const ua = (sx + px) / e.w, ub = (sx + sw - px) / e.w;
    const u0 = flipX ? ub : ua, u1 = flipX ? ua : ub;
    gl.uniform4f(this.uniCloud.uSrc, u0, v0, u1 - u0, v1 - v0);
    gl.uniform4f(this.uniCloud.uDst, dx, dy, dw, dh);
    gl.uniform1f(this.uniCloud.uRot, rot);
    gl.uniform1i(this.uniCloud.uTex, 0);
    gl.uniform2f(this.uniCloud.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform4f(this.uniCloud.uVertColor, fx.vertColor[0], fx.vertColor[1], fx.vertColor[2], fx.vertColor[3]);
    gl.uniform3f(this.uniCloud.uCelestialCol, fx.color[0], fx.color[1], fx.color[2]);
    gl.uniform2f(this.uniCloud.uDrawPos, fx.drawPos[0], fx.drawPos[1]);
    gl.uniform3f(this.uniCloud.uCelestial, fx.celestial[0], fx.celestial[1], fx.celestial[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    glStatDraw(this.statName, 4);   // #perf-gpulog
    gl.bindSampler(0, null);
    // 程序切换回基础 quad 程序(uniform 属程序态;后续 quad() 假定 prog 在位)
    gl.useProgram(this.prog);
  }

  private evictLRU(keepKey: string): void {
    if (!this.gl) return;
    let evicted = 0;
    while (this.bytes > GLSpriteLayer.MAX_BYTES) {
      let oldest: string | null = null;
      let min = Infinity;
      for (const [k, e] of this.texs) if (e.stamp < min && k !== keepKey && k !== '__white') { min = e.stamp; oldest = k; }
      if (!oldest) break;
      const dead = this.texs.get(oldest)!;
      this.texs.delete(oldest);
      this.bytes -= dead.bytes;
      glStatDelete(this.statName, dead.bytes);   // #perf-gpulog
      this.gl.deleteTexture(dead.tex);
      evicted++;
    }
    // ★liqpolish:有删必 bump 代际（texCheck 批检窗闭合——逐出后旧戳失效重验）
    if (evicted > 0) this.texGen++;
  }

  // ---- 拖尾三角带 pass（2026-08-30 天顶剑 GL 化：obj58 像素语义 1:1）----
  // 极光/水面同教训：条带类特效走 CPU canvas 逐像素 = 又慢又重（预乘/混合语义
  // 对不齐）；本 pass 在共享 glfx 画布上以真 GPU 混合(ONE,INV_SRC_ALPHA)渲染
  // VertexStrip 三角带，主 ctx 每帧一次 drawImage 合成。
  private trailProg: WebGLProgram | null = null;
  private trailUni: Record<string, WebGLUniformLocation | null> = {};
  private trailVAO: WebGLVertexArrayObject | null = null;
  private trailVbo: WebGLBuffer | null = null;
  private trailIbo: WebGLBuffer | null = null;
  /** 帧内已有条带（首个条带负责清屏） */
  trailDirty = false;

  private static readonly TRAIL_VS = `#version 300 es
layout(location=0) in vec2 aPos;      // 世界 px
layout(location=1) in vec4 aColor;    // 顶点色(含沿程淡出与 Opacity 折叠)
layout(location=2) in vec3 aTC;       // (progress, distAcross, dist)
uniform vec2 uCam;                    // 相机中心(世界 px)
uniform vec2 uHalf;                   // 视半宽(设备 px; y 已含 DPR)
out vec4 vColor;
out vec3 vTC;
void main(){
  vec2 clip = vec2((aPos.x - uCam.x) / uHalf.x, -(aPos.y - uCam.y) / uHalf.y);
  gl_Position = vec4(clip, 0.0, 1.0);
  vColor = aColor; vTC = aTC;
}`;

  private static readonly TRAIL_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vTC;
uniform sampler2D uS0;   // UseImage0（Extra_201 等）
uniform sampler2D uS1;   // UseImage1（Extra_193 等）
uniform vec4 uSSD;       // uShaderSpecificData=(4,0,0,4)
out vec4 oC;
void main(){
  float p = vTC.x;                       // progressOnStrip（[0]=顶点序最新端=0）
  float across = vTC.z != 0.0 ? vTC.y / vTC.z : 0.0;   // B 侧 0、A 侧 1
  float wEnv = p * 1.5 - 0.5;            // mad r0.w（alpha 线性包络）
  float ph = p * uSSD.x + uSSD.y;        // 锯齿相位（obj58 r0.x 前段）
  vec2 uv = vec2(fract(abs(ph)), across);// frc+abs（cmp 分支在 Repeat 下不可见）
  float gate = texture(uS1, uv).x;       // texld s1（obj58 只读 .x 进 edge）
  vec4 blade = texture(uS0, uv);         // texld s0
  vec4 col = blade * vColor;             // mul v0
  float edge = clamp((gate - wEnv) * 2.0, 0.0, 1.0);   // add+add_sat
  float dswInv = uSSD.w != 0.0 ? 1.0 / uSSD.w : 0.0;   // 预着色器 c2.x=1/SSD.w
  float dim = 1.0 - ph * dswInv;                       // mad r0.x（锯齿 dim——线性于 p）
  vec4 r0 = vec4(dim, edge, 1.0, max(wEnv, 0.0));      // 尾乘四 lane（反汇编逐通道）
  vec4 oc = col * edge;                  // mul r1, r0.y（标量广播）
  oc *= r0;                              // mul r0, r0, r1（lane 独立）
  // ★(ONE,ONE) 真加算直写（2026-09-02 月牙亮度翻案）：XNA 侧该条带的设备混合贡献=
  //   字节码 rgb 全量——原版 GIF 单剑峰值 +145 复算（blade 0.96×fade 0.35×edge →
  //   ~86/剑，多剑叠加 150-220 ✓）只吻合 (One,One)/(One,1−a)；(SrcAlpha,One) 会被
  //   out.a(~0.1-0.2) 压到 ~8/剑 = 可见部分塌成细丝（本仓"细螺旋"亮度病根，与
  //   贴图裁剪病叠加）。取 (One,One)：直加 oc.rgb、零压暗（GIF 实测零暗带）；
  //   alpha 写 max(oc.rgb)（2026-10-01 C10e 透明 HUD 拖影黑块定谳改）：预乘画布
  //   读出有 rgb≤a 隐式钳制，a=max(rgb) ≥ 每通道=零钳制零色移（与恒 1 同字节）;
  //   旧不透明主画布 'lighter' 只加 rgb 不读源 alpha=逐位不变;透明 HUD（C10e）
  //   'lighter' 连 alpha 一起加——恒 1 的暗 texel(rgb≈0,a=1)=不透明黑块叠过场景
  //   （天顶剑/彩虹魔杖黑带实报），a=max(rgb) 暗处 a≈0 保留 dst=黑块根除。
  oC = vec4(oc.rgb, max(oc.r, max(oc.g, oc.b)));
}`;

  /** 惰性编译拖尾程序（失败→trailOK=false 永久走 2D 兜底）。
   *  ★C10a:管线后端不承载拖尾（管线模式仅云会话;拖尾仍走旧 glfx 独立上下文,
   *  条带渲其默认帧缓冲——管线 FBO 面上无此 pass 的落点语义） */
  private ensureTrail(): boolean {
    if (this.pipe) return false;
    if (this.unavailable || !this.gl) return false;
    if (this.trailProg) return true;
    const gl = this.gl;
    const mk = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[GLSpriteLayer] trail shader 编译失败:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, GLSpriteLayer.TRAIL_VS);
    const fs = mk(gl.FRAGMENT_SHADER, GLSpriteLayer.TRAIL_FS);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLSpriteLayer] trail 程序链接失败:', gl.getProgramInfoLog(prog));
      return false;
    }
    this.trailProg = prog;
    for (const n of ['uCam', 'uHalf', 'uS0', 'uS1', 'uSSD']) this.trailUni[n] = gl.getUniformLocation(prog, n);
    this.trailVAO = gl.createVertexArray()!;
    this.trailVbo = gl.createBuffer()!;
    this.trailIbo = gl.createBuffer()!;
    return true;
  }

  /**
   * 帧首：调用方在首个条带前调用（清屏 + 相机 uniform）。
   * viewW/viewH = 设备像素（glfx.canvas 同尺寸，调用方先 resize）。
   * zoom = 相机缩放（Camera.zoom 默认 1.25）——世界层按 z 落画布，条带 clip 须同乘
   * （uHalf=halfView/z），否则条带比世界几何小 1/z 并向相机中心收缩（2026-09-02 修）。
   */
  trailFrameBegin(viewW: number, viewH: number, camX: number, camY: number, zoom = 1): void {
    if (!this.ensureTrail() || !this.gl) return;
    const gl = this.gl;
    this.resize(viewW, viewH);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.trailDirty) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.trailDirty = true;
    }
    gl.useProgram(this.trailProg);
    gl.uniform2f(this.trailUni.uCam, camX, camY);
    gl.uniform2f(this.trailUni.uHalf, viewW / (2 * zoom), viewH / (2 * zoom));
    gl.uniform1i(this.trailUni.uS0, 0);
    gl.uniform1i(this.trailUni.uS1, 1);
    gl.bindVertexArray(this.trailVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIbo);
    // stride = 9 floats: pos2 + color4 + tc3
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  }

  /**
   * 单条条带（一条三角带 = 一次 drawElements）。
   * verts = n×2 顶点交错 [x,y, r,g,b,a, progress, distAcross, dist]（9 floats/顶点）；
   * idx = XNA PrepareIndices(includeBackside) 语义的索引（调用方生成）。
   */
  trailStrip(texS0: TexEntry, texS1: TexEntry, verts: Float32Array, idx: Uint16Array,
    ssd: readonly [number, number, number, number]): void {
    if (!this.ensureTrail() || !this.gl || !this.trailDirty) return;
    const gl = this.gl;
    gl.useProgram(this.trailProg);
    gl.bindVertexArray(this.trailVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texS0.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texS1.tex);
    // XNA MiscShaderData 默认 LinearWrap：无 mip 线性 + 双轴 REPEAT
    if (!this.trailWrapSampler) {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.trailWrapSampler = s;
    }
    gl.bindSampler(0, this.trailWrapSampler);
    gl.bindSampler(1, this.trailWrapSampler);
    gl.uniform4f(this.trailUni.uSSD, ssd[0], ssd[1], ssd[2], ssd[3]);
    // ★真加算（2026-09-02 月牙形态翻案）：XNA 侧该条带在 spriteBatch(AlphaBlend) 开批
    //   期间以 DrawUserIndexedPrimitives 直绘，实测原版（Zenith_(demo).gif 暗砖底逐
    //   像素剖面）条带【只增亮、零压暗】= BlendState.Additive 语义（contribution =
    //   out.rgb×out.a；FS 已预乘 → blend (ONE,ONE)）。旧 (ONE,INV_SRC_ALPHA) 会把
    //   blade 贴图 rgb=0∧a>0 的暗 texel 画成压暗底（黑十字病根）。绘后还原层默认。
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glStatDraw(this.statName, idx.length / 3);
    gl.bindSampler(0, null); gl.bindSampler(1, null);
    gl.activeTexture(gl.TEXTURE0);
  }
  private trailWrapSampler: WebGLSampler | null = null;

  // ---- obj55 "MagicMissile" pass 条带（BJ255 2026-09-21：SM2 族 34/16/79 拖尾 GL 化）----
  // 像素语义=SM2 codegen px_MagicMissile 逐指令直译（src/fx/SM2Effect.ts 生成体同源）：
  //   wEnv  = p×C[8] + C[9]                （def 常量 1.5/−0.5，实测钉值 2026-09-21）
  //   u     = p + C[4]                     （C[4]=preshader uSaturation×uTime，f64 CPU 侧算好入 uniform）
  //   across= T.y/T.z                      （B 侧 0、A 侧 1——同 obj58 vTC 语义）
  //   gate  = tex(s2, (u, across)).x       （s2=UseImage2=imgs[2]）
  //   mult  = tex(s1, (u, across)).x       （s1=UseImage1=imgs[1]）
  //   blade = tex(s0, (p, across))         （s0=UseImage0=imgs[0]，RGBA）
  //   edge  = sat(2×(gate − wEnv))
  //   oC    = sat(blade × (mult×edge) × vColor × uOpacity)
  // ★vColor=原始顶点色（uOpacity 独立通道，不折入顶点——与 CPU 路径 sm2f 分支同构，
  //   差于 obj58 tech 路径的 op 折叠）；(ONE,ONE) 直加语义同 obj58 注（alpha 恒写 1）。
  // ★索引=6/quad（不含背面）：MM 族原版 PrepareStripWithProceduralPadding 缺省
  //   includeBacksides=false（MagicMissileDrawer.cs:18/FlameLashDrawer.cs:19/
  //   LightDiscDrawer.cs:18/RainbowRodDrawer.cs:18——FinalFractalHelper.cs:188 才传
  //   true），XNA 侧 CullCounterClockwise 下每 quad 至多栅格化一次；WebGL 无剔除，
  //   6 索引=每 quad 恰一次=同栅格覆盖（12 索引不剔除=加算×2，禁用）。
  private trailMMProg: WebGLProgram | null = null;
  private trailMMUni: Record<string, WebGLUniformLocation | null> = {};

  private static readonly TRAIL_MM_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec3 vTC;
uniform sampler2D uS0;   // UseImage0（Extra_195 等，blade RGBA）
uniform sampler2D uS1;   // UseImage1（Extra_197 等，mult）
uniform sampler2D uS2;   // UseImage2（Extra_196 等，gate）
uniform vec4 uMM;        // (uOpacity, 滚动相位, 1.5, -0.5)
out vec4 oC;
void main(){
  float p = vTC.x;
  float across = vTC.z != 0.0 ? vTC.y / vTC.z : 0.0;
  float wEnv = p * uMM.z + uMM.w;
  vec2 uvS = vec2(p + uMM.y, across);
  float gate = texture(uS2, uvS).x;
  float mult = texture(uS1, uvS).x;
  vec4 blade = texture(uS0, vec2(p, across));
  float edge = clamp(2.0 * (gate - wEnv), 0.0, 1.0);
  vec4 oc = blade * (mult * edge) * vColor * uMM.x;
  // ★alpha=max(rgb)（2026-10-01 C10e 透明 HUD 拖影黑块定谳,同 obj58 注——
  //  零钳制零色移;旧不透明画布 'lighter' 逐位不变;透明 HUD 暗处 a≈0 保留 dst）
  oC = vec4(oc.rgb, max(oc.r, max(oc.g, oc.b)));
}`;

  /** 惰性编译 obj55 程序（失败→null 永久走 CPU 兜底;管线后端同 ensureTrail 不承载） */
  private ensureTrailMM(): boolean {
    if (this.pipe) return false;
    if (this.unavailable || !this.gl) return false;
    if (this.trailMMProg) return true;
    const gl = this.gl;
    const mk = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[GLSpriteLayer] trail MM shader 编译失败:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, GLSpriteLayer.TRAIL_VS);
    const fs = mk(gl.FRAGMENT_SHADER, GLSpriteLayer.TRAIL_MM_FS);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLSpriteLayer] trail MM 程序链接失败:', gl.getProgramInfoLog(prog));
      return false;
    }
    this.trailMMProg = prog;
    for (const n of ['uCam', 'uHalf', 'uS0', 'uS1', 'uS2', 'uMM']) this.trailMMUni[n] = gl.getUniformLocation(prog, n);
    return true;
  }

  /**
   * obj55 族帧首（清屏/相机 uniform 同 obj58 trailFrameBegin；VAO/VBO/IBO 布局同构
   * 9 floats/顶点，复用同一组缓冲）。uOpacity/scroll=SM2 setupConstants 的 C[0]/C[4]
   * （preshader 在 CPU 侧 f64 求值，位精度优于 FS 内重算）。
   */
  trailFrameBeginMM(viewW: number, viewH: number, camX: number, camY: number, zoom = 1,
    uOpacity = 1, uScroll = 0): void {
    if (!this.ensureTrailMM() || !this.ensureTrail() || !this.gl) return;
    const gl = this.gl;
    this.resize(viewW, viewH);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (!this.trailDirty) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.trailDirty = true;
    }
    gl.useProgram(this.trailMMProg);
    gl.uniform2f(this.trailMMUni.uCam, camX, camY);
    gl.uniform2f(this.trailMMUni.uHalf, viewW / (2 * zoom), viewH / (2 * zoom));
    gl.uniform1i(this.trailMMUni.uS0, 0);
    gl.uniform1i(this.trailMMUni.uS1, 1);
    gl.uniform1i(this.trailMMUni.uS2, 2);
    gl.uniform4f(this.trailMMUni.uMM, uOpacity, uScroll, 1.5, -0.5);
    gl.bindVertexArray(this.trailVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  }

  /**
   * obj55 单条条带（一次 drawElements，6 索引/quad——见类注）。
   * verts 布局同 trailStrip：n×2 顶点 [x,y, r,g,b,a, progress, distAcross, dist]，
   * ★顶点色=原始色（uOpacity 走 uniform，不折入）。
   */
  trailStripMM(texS0: TexEntry, texS1: TexEntry, texS2: TexEntry,
    verts: Float32Array, idx: Uint16Array): void {
    if (!this.ensureTrailMM() || !this.gl || !this.trailDirty) return;
    const gl = this.gl;
    gl.useProgram(this.trailMMProg);
    gl.bindVertexArray(this.trailVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailVbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texS0.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texS1.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texS2.tex);
    if (!this.trailWrapSampler) {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.trailWrapSampler = s;
    }
    gl.bindSampler(0, this.trailWrapSampler);
    gl.bindSampler(1, this.trailWrapSampler);
    gl.bindSampler(2, this.trailWrapSampler);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glStatDraw(this.statName, idx.length / 3);
    gl.bindSampler(0, null); gl.bindSampler(1, null); gl.bindSampler(2, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** 全量释放(切世界/读档——★曾漏挂此链:连续读档逐次叠满 LRU=GB 级显存
   *  打爆 → contextlost 风暴 26 万次,tab 3.4GB 用户实报 2026-08-18) */
  dispose(): void {
    // ★BJ344（件3）：contextlost/restored 监听随实例摘除
    for (const h of this.ctxLostHandlers) this.canvas.removeEventListener('webglcontextlost', h);
    for (const h of this.ctxLostHandlers) this.canvas.removeEventListener('webglcontextrestored', h);
    this.ctxLostHandlers.length = 0;
    if (this.pipe) { this.disposePipeMode(); return; }
    if (!this.gl) return;
    // 上下文已丢失 → 驱动侧资源已蒸发,delete 只会打 INVALID_OPERATION 噪声
    if (!this.gl.isContextLost() && !this.objectsStale) {
      let freed = 0;
      for (const [, e] of this.texs) { this.gl.deleteTexture(e.tex); freed += e.bytes; }
      glStatDelete(this.statName, freed);   // #perf-gpulog:整包释放记净额
    }
    if (!this.gl.isContextLost() && !this.objectsStale) {
      if (this.trailProg) this.gl.deleteProgram(this.trailProg);
      if (this.trailMMProg) this.gl.deleteProgram(this.trailMMProg);
      if (this.trailVAO) this.gl.deleteVertexArray(this.trailVAO);
      if (this.trailVbo) this.gl.deleteBuffer(this.trailVbo);
      if (this.trailIbo) this.gl.deleteBuffer(this.trailIbo);
      if (this.trailWrapSampler) this.gl.deleteSampler(this.trailWrapSampler);
      if (this.rainProg) this.gl.deleteProgram(this.rainProg);
      if (this.rainVao) this.gl.deleteVertexArray(this.rainVao);
      if (this.rainVbo) this.gl.deleteBuffer(this.rainVbo);
      // ★R1b-5（2026-09-27 红蓝批 β）dispose 表补全：quad/cloud/tile/precip 程序
      //  （standalone 自编译,非 pipe.program 缓存=可单删）+主 VAO/采样器表
      //  +precip VAO/VBO——此前 leak=每次层重建在旧上下文遗留程序/VAO/缓冲对象。
      if (this.prog) this.gl.deleteProgram(this.prog);
      if (this.progCloud) this.gl.deleteProgram(this.progCloud);
      if (this.progTile) this.gl.deleteProgram(this.progTile);
      if (this.precipProg) this.gl.deleteProgram(this.precipProg);
      if (this.precipVao) this.gl.deleteVertexArray(this.precipVao);
      if (this.precipVbo) this.gl.deleteBuffer(this.precipVbo);
      // ★C13c:liqshimmer 程序/VAO/VBO（standalone 自编译=可单删;R1b-5 判例同表）
      if (this.shimProg) this.gl.deleteProgram(this.shimProg);
      if (this.shimVao) this.gl.deleteVertexArray(this.shimVao);
      if (this.shimVbo) this.gl.deleteBuffer(this.shimVbo);
      // ★K2:forcefield 程序/VAO/VBO（同上判例）
      if (this.ffProg) this.gl.deleteProgram(this.ffProg);
      if (this.ffVao) this.gl.deleteVertexArray(this.ffVao);
      if (this.ffVbo) this.gl.deleteBuffer(this.ffVbo);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      for (const s of Object.values(this.samp)) if (s) this.gl.deleteSampler(s);
    }
    this.rainProg = null; this.rainProgHandle = null; this.rainVao = null; this.rainVbo = null;
    this.rainFail = false;
    this.trailProg = null; this.trailMMProg = null; this.trailVAO = null; this.trailVbo = null;
    this.trailIbo = null; this.trailWrapSampler = null;
    this.trailDirty = false;
    // ★R1b-5:补齐程序/VAO/采样器/precip 引用清面（句柄置 null——重建期
    //  ensureXxx 的 `if (this.xxx) return true` 早退必须失效）
    this.prog = null; this.progCloud = null; this.progTile = null; this.cloudFxOK = false;
    this.precipProg = null; this.precipProgHandle = null; this.precipVao = null;
    this.precipVbo = null; this.precipFail = false; this.precipUni = {};
    // ★C13c:liqshimmer 引用清面（同 R1b-5 重建期早退失效判据）
    this.shimProg = null; this.shimProgHandle = null; this.shimVao = null;
    this.shimVbo = null; this.shimFail = false; this.shimUni = {};
    // ★K2:forcefield 引用清面（同上判据）
    this.ffProg = null; this.ffProgHandle = null; this.ffVao = null;
    this.ffVbo = null; this.ffFail = false; this.ffUni = {};
    this.vao = null;
    this.samp = { nearest: null, linear: null, repeat: null, linearNoMip: null, wrap2: null };
    this.uni = {}; this.uniCloud = {}; this.uniTile = {}; this.rainUni = {};
    this.texs.clear();
    this.texGen++;   // ★liqpolish:清表必 bump（texCheck 批检窗闭合）
    this.bytes = 0;
    this.canvas.width = 0;
    this.canvas.height = 0;
  }

  /** ★C10a 管线后端释放：自管对象（纹理/VAO/采样器）删于管线上下文+字节账归账页;
   *  程序【禁单删】——pipe.program() 按名缓存句柄,单删=悬空句柄毒化重登记,
   *  归 pipe.dispose() 整表清理。★C10b:管线本体仅 ownsPipe 时随层释放——
   *  共管注入（Renderer 单管线多消费方）时归 Renderer 治理（revive/drop 链） */
  private disposePipeMode(): void {
    const gl = this.pipe?.glx;
    if (gl && !gl.isContextLost() && !this.objectsStale) {
      let freed = 0;
      for (const [, e] of this.texs) { gl.deleteTexture(e.tex); freed += e.bytes; }
      glStatDelete(this.statName, freed);   // #perf-gpulog:整包释放记净额
      if (this.vao) gl.deleteVertexArray(this.vao);
      for (const s of Object.values(this.samp)) if (s) gl.deleteSampler(s);
      // ★R1b-5（2026-09-27 红蓝批 β）pipe 模式 dispose 表补全：rain/precip VAO/VBO
      //  （层自建对象,非 pipe.program 按名缓存=可单删;程序句柄归 pipe.dispose 整表
      //  ——程序禁单删判例不动。拖尾族管线模式恒不建（ensureTrail `if (this.pipe)
      //  return false` 判例）,无释放面）——此前 revive/drop 链每次层重建在共管
      //  上下文遗留 VAO/VBO。
      if (this.rainVao) gl.deleteVertexArray(this.rainVao);
      if (this.rainVbo) gl.deleteBuffer(this.rainVbo);
      if (this.precipVao) gl.deleteVertexArray(this.precipVao);
      if (this.precipVbo) gl.deleteBuffer(this.precipVbo);
      // ★C13c:liqshimmer VAO/VBO（层自建对象可单删;程序句柄归 pipe.dispose 整表）
      if (this.shimVao) gl.deleteVertexArray(this.shimVao);
      if (this.shimVbo) gl.deleteBuffer(this.shimVbo);
      // ★K2:forcefield VAO/VBO（同上判例）
      if (this.ffVao) gl.deleteVertexArray(this.ffVao);
      if (this.ffVbo) gl.deleteBuffer(this.ffVbo);
    }
    this.progHandle = null; this.progCloudHandle = null;
    this.progTileHandle = null;
    this.rainProgHandle = null;
    // ★R1b-5:precip 句柄此前漏置——残留句柄让重建期 ensurePrecip 的
    //  `if (this.precipProg) return true` 早退命中死上下文对象
    this.precipProgHandle = null;
    // ★C13c:liqshimmer 句柄/引用清面（同上重建期早退失效判据）
    this.shimProgHandle = null;
    this.shimProg = null; this.shimVao = null; this.shimVbo = null;
    this.shimFail = false; this.shimUni = {};
    // ★K2:forcefield 句柄/引用清面（同上判据）
    this.ffProgHandle = null;
    this.ffProg = null; this.ffVao = null; this.ffVbo = null;
    this.ffFail = false; this.ffUni = {};
    this.prog = null; this.progCloud = null; this.progTile = null; this.cloudFxOK = false;
    this.uniTile = {};
    this.rainProg = null; this.rainVao = null; this.rainVbo = null; this.rainFail = false;
    this.precipProg = null; this.precipVao = null; this.precipVbo = null;
    this.precipFail = false; this.precipUni = {};
    this.vao = null;
    this.samp = { nearest: null, linear: null, repeat: null, linearNoMip: null, wrap2: null };
    this.pipeFbo = null;
    this.texs.clear();
    this.texGen++;   // ★liqpolish:清表必 bump（texCheck 批检窗闭合）
    this.bytes = 0;
    if (this.ownsPipe) this.pipe?.dispose();
  }
}

/** 1×1 白像素(canvas 源,fillQuad 用) */
const WHITE_PX_CANVAS = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 1, 1);
  return c;
})();
const WHITE_PX: TexImageSource = WHITE_PX_CANVAS as unknown as TexImageSource;
const WHITE3: readonly [number, number, number] = [1, 1, 1];

// ★A2 光照×扭曲 FBO 链（2026-09-23；渲染改造方案 §三 A2,计划文件 §八实现态）
//
// 形态：GLWorldLight + GLWaterDistortion 两 pass 迁入 GLPipeline 单上下文——
//   worldCanvas 全帧上传 ─┐
//   光照脏行带 ──────────┴→ pass1(精确乘) → FBO('lit') → pass2(obj19 扭曲,直采 FBO
//   纹理) → FBO('warped') → present() 单次回贴 2D。
// 消灭：scene 全帧重传（旧 GLWaterDistortion 把 worldLight 输出【画布】再上传,
//   用户实机 trace texSubImage2D 502ms 主源）+ 一次全屏 GL→2D 回贴。
// 字节等价构造：两 pass 的 VERT/FRAG 从原模块【单源引用】（GLWorldLight.VERT/FRAG、
//   GLWaterDistortion.VERT/FRAG——2026-09-23 去私有化）,uniform 表/纹理参数/上传
//   逐式对照原 composite()（方案 §八实录）;中间产物 RGBA8 FBO ≡ 原 8bit 画布字节
//   （blend off 直写）。★两级 pass 结构不变——不合并单 shader pass（第一级输出经
//   8bit 量化,第二级 LINEAR 插值的是量化值;浮点直乘跳过中间量化=字节必不同,
//   方案 §二裁决 3）。朝向链由对拍实证（_wlgl 探针族+像素 md5）。
// 接线：Renderer.compositeLight `?wfbo=1` 激活（首版默认关;对拍过翻缺省+逃生门
//   改 ?wfbo=0）。旧路径与 2D 兜底全保留。
import { GLPipeline, type PipelineFbo, type PipelineProgram } from './GLPipeline';
import { glStatUpload, glStatTexCreate, starvedLock } from './GLStats';
import { GLWorldLight } from './GLWorldLight';
import { GLWaterDistortion } from './GLWaterDistortion';

/** ★A2 朝向链（2026-09-23 用户实报"世界倒置"定谳,真实代数重推）：原 VERT 写
 *  `gl_Position.y = 1.0 - aPos.y*2.0`（aPos.y=0→clip+1）。画布呈现:clip+1=画布顶
 *  ✓生产正确;但 FBO:clip+1=帧缓冲 max 行=纹理 v1 → aPos.y=0（图像顶行,vUv=0）
 *  落 v1 → FBO 布局相对「画布上传即纹理」（v0=图像顶,FLIP_Y=false）上下颠倒
 *  → pass2/水门控/扭曲全链倒置。
 *  修=pass1 用去翻转变体（单点派生自 GLWorldLight.VERT,非转录）:
 *  `aPos.y*2.0-1.0` → aPos.y=0→clip-1→帧缓冲 row0=v0=图像顶 ≙ 旧上传布局。
 *  pass2 保持原 VERT:vUv=0 采 lit v0=图像顶 ✓,写入经原翻转→图像顶落 warped v1;
 *  present(flipY=1) 画布顶采 v1=图像顶 → 三级闭合,屏上正立。 */
const LIT_VERT = GLWorldLight.VERT.replace('1.0 - aPos.y * 2.0', 'aPos.y * 2.0 - 1.0');

/** ★B2b worldTex 源换指（2026-09-24）：uWorld 采样 Y 翻转单点派生 FRAG。
 *  B2b 累积态下 uWorld=FBO('world') 纹理——GLSpriteLayer quad VERT 自带
 *  `1.0-screen.y·2/canvas.y` 翻转 → FBO 内 stored GL 朝向（图像顶=v1）,与
 *  画布上传布局（v0=图像顶）上下颠倒;canvas 路径须恒等。派生式=采样坐标
 *  mix(vUv.y, 1−vUv.y, uWorldFlip)（uWorldFlip=0 恒等:mix(x,y,0)=x*1+y*0
 *  =x 逐位精确——canvas 路径与原 FRAG 逐位同,由对拍锁）。只翻 uWorld 采样,
 *  uLight（lightCanvas 上传/recon FBO,两者皆 v0=图像顶）不动。 */
const LIT_FRAG = GLWorldLight.FRAG
  .replace('uniform float uDarkSkip;',
    'uniform float uDarkSkip;\nuniform float uWorldFlip;')
  .replace('vec4 w = texture2D(uWorld, vUv);',
    'vec4 w = texture2D(uWorld, vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uWorldFlip)));');

/** ★B2b 世界纹理句柄（FBO('world') 累积纹理直采——A 线句柄面冻结,B 线换指）。
 *  flipY=1=FBO GL 朝向（图像顶在 v1,采样须 Y 翻转）;canvas 直传路径不走此型。 */
export interface WorldTexSrc {
  tex: WebGLTexture;
  w: number;
  h: number;
  flipY: number;
}

/** ★A3 光照小图 GPU 重建 pass0（2026-09-23）。等价性论证（对 CPU 循环
 *  Renderer.compositeLight BJ77 快路径逐式）：
 *  ① SS=2 → gx=px·0.5−0.5 精确（2 的幂运算 fp32 无误差）→ fx∈{0,0.5} →
 *     权重 w∈{0,0.25,0.5,1} 全 2 的负幂,8bit 整数×幂权 fp32 精确,≤4 项和
 *     =k/4(k≤1020) 精确可表示;
 *  ② Math.round(r) ≡ floor(r+0.5)（r≥0 且分数 ∈{0,.25,.5,.75}——精确半值成立）;
 *  ③ 窗外 tap=0：raw 光照按 (rw+2)×(rh+2) 整数纹理上传,窗内容在 (1,1) 偏移,
 *     边缘一圈 0 + clamp 取零环 = 任意窗外 tap 恒 0（CPU 窗口谓词逐位同）;
 *  ④ texelFetch(usampler2D) 返回整数（UNORM 的 k/255 除法不精确,故 RGBA8UI）;
 *  ⑤ 求和序 = CPU 左结合同序 t00·w00+t10·w10+t01·w01+t11·w11;
 *  ⑥ 输出 min(255,·) 钳位 + α=255 同 CPU;UNORM 回写 round(k/255·255)=k 精确。
 *  朝向：复用 LIT_VERT（no-flip）→ FBO v0=图像顶 ≙ lightCanvas 上传布局,
 *  pass1 uLightRect 映射零改动。 */
const LRECON_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  // no-flip（同 LIT_VERT 派生式）:aPos.y=0→clip-1→FBO row0=v0=图像顶
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, 0.0, 1.0);
}`;

/** ★300 es 对（usampler2D/texelFetch 需 ESSL3——ESSL1 无 usampler=编译失败,
 *  2026-09-23 用户实报全黑案真凶）。★VERT/FRAG 必须同版本——混编非法。 */
const LRECON_FRAG = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform highp usampler2D uRaw;
uniform int uRx; uniform int uRy; uniform int uRw; uniform int uRh;
uniform int uTx0; uniform int uTy0;
in vec2 vUv;
out vec4 outColor;
void main() {
  ivec2 fc = ivec2(gl_FragCoord.xy);
  float gx = float(fc.x) * 0.5 - 0.5;
  float gy = float(fc.y) * 0.5 - 0.5;
  int x0 = int(floor(gx)); float fx = gx - float(x0);
  int y0 = int(floor(gy)); float fy = gy - float(y0);
  float wx0 = 1.0 - fx, wx1 = fx, wy0 = 1.0 - fy, wy1 = fy;
  float w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
  int bx = (uTx0 + x0) - uRx + 1;
  int by = (uTy0 + y0) - uRy + 1;
  ivec2 lim = ivec2(uRw + 1, uRh + 1);
  uvec4 t00 = texelFetch(uRaw, clamp(ivec2(bx, by), ivec2(0), lim), 0);
  uvec4 t10 = texelFetch(uRaw, clamp(ivec2(bx + 1, by), ivec2(0), lim), 0);
  uvec4 t01 = texelFetch(uRaw, clamp(ivec2(bx, by + 1), ivec2(0), lim), 0);
  uvec4 t11 = texelFetch(uRaw, clamp(ivec2(bx + 1, by + 1), ivec2(0), lim), 0);
  vec3 r = vec3(t00.rgb) * w00 + vec3(t10.rgb) * w10 + vec3(t01.rgb) * w01 + vec3(t11.rgb) * w11;
  outColor = vec4(min(vec3(255.0), floor(r + 0.5)) / 255.0, 1.0);
}`;

/** ★opresent 单 present 合并 pass3（2026-09-25）：FBO('warped') over 天空栈 FBO
 *  → FBO('opresent') → present 一次——天空栈（C10b bg+云合并背板）与世界合成的
 *  两次全屏回贴主画布并成一次（回贴账 2→1;全幅 IOSurface 往返同账）。
 *
 *  字节等价推导（porter-duff over 结合律,预乘域,C10b GC/GD 同族论证）：
 *  现行为  main = q2d( W over_2d q2d( S over_2d G ) )
 *  合并后  main = q2d( qGL( W overGL S ) over_2d q2d( G ) )
 *    G=主画布 2D 天空渐变（预乘）, S=天空栈 FBO 8bit 预乘, W=FBO('warped')
 *    8bit 预乘, q2d/qGL=2D 画布/GL FBO 的 8bit 量化。精确算术下
 *    over(W, over(S,G)) = over(over(W,S), G)（预乘域 over 可结合）,两路各恰有
 *    2 个 8bit 量化点,仅分组位置不同：
 *    · W.a∈{0,1}（世界不透明/全空——绝大多数像素）over 退化为选择,两路逐位同;
 *    · W.a∈(0,1) ∧ S.a∈(0,1) 的重叠像素（水面边/玻璃×云/背景渐变）±1~2LSB
 *      （cloudbatch/C10b GC·GD 备案族同源,方向中性）。
 *  朝向：FBO('bg')/FBO('warped') 同为「图像顶=v1」GL 朝向（bg=GLSpriteLayer
 *  quad VERT 自带翻转;warped=pass2 原 VERT 写入翻转）,本 pass no-flip 同 vUv
 *  直采保持相对对齐,输出同朝向（v0=图像底）→ present(flipY=1) 三级闭合。 */
const OPRESENT_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  // no-flip（同 LRECON_VERT 派生式）:aPos.y=0→clip-1→FBO row0=v0;双源同朝向同 vUv
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, 0.0, 1.0);
}`;

const OPRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uWorld;   // FBO('warped') 世界合成输出（预乘,图像顶=v1）
uniform sampler2D uSky;     // 天空栈 FBO（'bg';bg+云合并背板,预乘,图像顶=v1）
out vec4 outColor;
void main() {
  vec4 w = texture(uWorld, vUv);
  vec4 s = texture(uSky, vUv);
  // porter-duff over（预乘域）:out = src + dst·(1−src.a)——与 2D drawImage
  // source-over 同式（uWorld 为上层=世界合成盖天空栈）
  outColor = vec4(w.rgb + s.rgb * (1.0 - w.a), w.a + s.a * (1.0 - w.a));
}`;

/** ★opresent 天空栈挂起引用（Renderer 延迟收口时传入）：管线内 FBO 名+帧界尺寸。
 *  compose 尾段在 w/h 与其一致时走 pass3 合并（不一致=低清档帧 → 回退双 blit,
 *  调用方按 lastMergeUsed 自行补贴 presentPendingSky）。 */
export interface SkyPresentRef {
  fboName: string;
  w: number;
  h: number;
}

export interface RawLight {
  r: Uint8Array; g: Uint8Array; b: Uint8Array;
  rx: number; ry: number; rw: number; rh: number;   // 光照扫描窗（tile 系）
  tx0: number; ty0: number;                          // 视口基 tile（重建网格对齐）
  w2: number; h2: number;                            // SS=2 小图尺寸=tilesX/Y·2
}

export class GLWorldCompose {
  /** ★C10b 共管注入:管线所有权。true=自建（?cloudpipe=0 逃生门下的旧行为,
   *  statName 账页='worldCompose'）;false=Renderer 单实例 GLPipeline 注入
   *  （云+bg+本模块三消费方共管）——dispose 不级联管线本体,上下文重生归
   *  Renderer.reviveSwPipe 治理（recreate 清程序表=A3 判例,全消费方须重注册） */
  readonly ownsPipe: boolean;
  /** 无扭曲帧的中性波场（0.5 中心值 → 位移 (0.5−0.5)·intensity=0;gridW/H=1 防
   *  uWaveSize=(0,0) 的 NaN 除法——mix(NaN×0)=NaN 污染恒等直通） */
  static readonly neutralWave = new Float32Array([0.5]);
  readonly pipeline: GLPipeline;
  unavailable: boolean;
  private pLit: PipelineProgram | null = null;
  private pDistort: PipelineProgram | null = null;
  /** ★opresent pass3 程序（over 合成;编译失败只废合并——compose 尾回退单 present） */
  private pOver: PipelineProgram | null = null;
  private fboOpresent: PipelineFbo | null = null;
  /** ★opresent:最近一次 compose 是否实际走了 pass3 合并（调用方据此决定是否需
   *  回贴挂起的天空栈——compose 返 true 但合并未走（程序缺/FBO 租借失败/尺寸
   *  不一致）时天空栈仍在管线 FBO 里,Renderer presentPendingSky 补贴=回退双 blit） */
  lastMergeUsed = false;
  private fboLit: PipelineFbo | null = null;
  private fboWarped: PipelineFbo | null = null;
  private texWorld: WebGLTexture | null = null;
  private texLight: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private texWave: WebGLTexture | null = null;
  private texWater: WebGLTexture | null = null;
  private texWaterEmpty: WebGLTexture | null = null;
  private texRaw: WebGLTexture | null = null;      // ★A3 raw 光照（RGBA8UI,+1 零边框）
  private fboLight2: PipelineFbo | null = null;    // ★A3 recon 产出（SS=2 小图,替代 lightCanvas 带上传）
  private pRecon: PipelineProgram | null = null;
  /** recon 编译失败位（只废 A3;A2 照常） */
  private lreconDead = false;
  private _rawBuf: Uint8Array | null = null;
  /** ★RGBA8UI 上传被驱动拒后永久回落 lightCanvas 路径（getError 体检位） */
  private _rawBroken = false;
  private _rawWarned = false;
  /** ★BJ316（2026-09-23）getError 体检审计窗：首 3 次上传+尺寸首见+recreate 后重审
   *  ——getError=全管线 sync（真机 trace:稳态 ~1ms/帧,DOM 争用态 4.0ms/帧）,
   *  稳态禁逐帧;RGBA8UI 拒收=逐上下文确定性条件,审计窗覆盖即等价。 */
  private _rawAuditLeft = 3;
  private _rawAuditKey = '';
  /** ★诊断:最近一次 compose 失败原因（探针面） */
  lastFail = '';
  private _texKeyWorld = '';
  private _texKeyLight = '';
  private _texKeyNoise = '';
  private _texKeyWater = '';
  private noiseW = 0;
  private noiseH = 0;
  private waveBytes: Uint8Array | null = null;

  constructor(statName = 'worldCompose', pipe?: GLPipeline | null) {
    // ★C10b:注入管线上限参——传入即共管（statName 随管线账页）;缺省自建=旧行为
    this.ownsPipe = !pipe;
    this.pipeline = pipe ?? new GLPipeline(statName);
    this.unavailable = this.pipeline.unavailable;
    const gl = this.pipeline.glx;
    if (!gl) return;
    this.pLit = this.pipeline.program('worldLight', LIT_VERT, LIT_FRAG);
    this.pDistort = this.pipeline.program('distort', GLWaterDistortion.VERT, GLWaterDistortion.FRAG);
    this.pRecon = this.pipeline.program('lrecon', LRECON_VERT, LRECON_FRAG);
    // ★opresent:pass3 程序登记（失败不致命——合并跳过走单 present 回退）
    this.pOver = this.pipeline.program('opresent', OPRESENT_VERT, OPRESENT_FRAG);
    if (!this.pLit?.prog || !this.pDistort?.prog) { this.unavailable = true; return; }
    // ★pRecon 编译失败只废 A3（lreconDead）不废 A2——原全有全无 early-return 会
    //  跳过纹理创建,recreate 复活后半残态=黑世界（2026-09-23 用户实报案）
    this.lreconDead = !this.pRecon?.prog;
    this.texRaw = gl.createTexture();
    this.setParams(gl, this.texRaw, 'NEAREST', 'CLAMP');   // texelFetch 不经采样器过滤;NEAREST 合法搭配
    // 纹理创建+采样参数（逐字对照两原模块 init:GLWorldLight.ts:140-148 / GLWaterDistortion.ts:243-270 表）
    this.texWorld = gl.createTexture();
    this.texLight = gl.createTexture();
    for (const t of [this.texWorld, this.texLight]) this.setParams(gl, t, 'LINEAR', 'CLAMP');   // 光照小图 LINEAR 上采样=原 2D 双线性同款
    this.texNoise = gl.createTexture();
    this.setParams(gl, this.texNoise, 'LINEAR', 'REPEAT');
    this.texWave = gl.createTexture();
    this.setParams(gl, this.texWave, 'LINEAR', 'CLAMP');     // LUMINANCE LINEAR（原 uWave 档）
    this.texWater = gl.createTexture();
    this.setParams(gl, this.texWater, 'NEAREST', 'CLAMP');   // 原版 PointClamp 门控
    // 注意:本模块全部上传逐笔显式 pixelStorei（不依赖 pipeline init 的画布源预乘收口——
    // noise/wave/water-empty 是纯数据源,预乘必须 false）
  }

  private setParams(gl: WebGL2RenderingContext, t: WebGLTexture, filter: 'LINEAR' | 'NEAREST', wrap: 'CLAMP' | 'REPEAT'): void {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === 'LINEAR' ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === 'LINEAR' ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap === 'CLAMP' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap === 'CLAMP' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
  }

  /** 整链合成。入参语义=旧 GLWorldLight.composite+GLWaterDistortion.composite 拼合。
   *  ★B2b（2026-09-24）：world 入参双型——HTMLCanvasElement（旧上传链,逃生门/降级
   *  路径）或 WorldTexSrc 句柄（FBO('world') 累积纹理直采,worldCanvas 上传链退役:
   *  texSubImage2D 全幅上传归零,采样换 uWorldFlip=1）。成功返回 true——调用方随后
   *  ctx.drawImage(compose.pipeline.canvas, 0, 0, viewW, viewH) 单次回贴。
   *  ★opresent（2026-09-25）：sky 在场（Renderer 延迟收口的天空栈挂起引用）且帧界
   *  一致 → 尾段 pass3 over(warped, sky) → FBO('opresent') → present 单次,调用方
   *  仍单次 drawImage——两次全屏回贴并成一次（等价性推导见 OPRESENT_VERT 注）。
   *  合并未走（程序缺/FBO 失败/尺寸不一致）时 lastMergeUsed=false,调用方补贴。 */
  compose(
    world: HTMLCanvasElement | WorldTexSrc, light: HTMLCanvasElement,
    lightRect: readonly [number, number, number, number], darkSkip = 0,
    lightBand?: { canvas: HTMLCanvasElement; y: number; w: number; h: number } | null,
    water: HTMLCanvasElement | null = null, noise: TexImageSource | null = null,
    cssW = 0, cssH = 0, progress = 0, intensity = 0,
    waveR: Float32Array | null = null, gridW = 0, gridH = 0,
    worldX = 0, worldY = 0, waveOffX = 0, waveOffY = 0,
    rawLight?: RawLight,
    sky?: SkyPresentRef | null,
  ): boolean {
    this.lastMergeUsed = false;   // ★opresent:每次 compose 重置（失败/回退面=未合并）
    const pipeline = this.pipeline;
    const gl = pipeline.glx;
    if (!gl || !this.pLit?.prog || !this.pDistort?.prog || this.unavailable) { this.lastFail = 'unavailable'; return false; }
    const w = (world as WorldTexSrc).tex ? (world as WorldTexSrc).w : (world as HTMLCanvasElement).width;
    const h = (world as WorldTexSrc).tex ? (world as WorldTexSrc).h : (world as HTMLCanvasElement).height;
    if (w === 0 || h === 0) { this.lastFail = 'dim'; return false; }
    pipeline.beginFrame(w, h);
    let lightTex: WebGLTexture | null = this.texLight;
    // ★A3 支路：rawLight 在场 → recon pass0【独立 pre-pass,置于 pass1 状态设置之前】 产 FBO('light2')（替代 lightCanvas
    //   带上传——CPU 4-tap 重建/putImageData/脏带比对/带 blit 四消）;缺省走原路径
    // ★recon 不可用时必须整体返 false——调用方（Renderer lrecon 分支）在本帧【跳过了
    //  CPU 重建】,若此处回落 texLight 空纹理=黑世界（2026-09-23 实报案第二层）。
    //  返 false → Renderer 继续走 CPU 重建 → A2/旧链照常。
    if (rawLight && (this._rawBroken || this.lreconDead || !this.pRecon?.prog)) {
      this.lastFail = 'guard:' + (this._rawBroken ? 'rawBroken' : this.lreconDead ? 'lreconDead' : 'noprog');
      return false;
    }
    if (rawLight && this.pRecon?.prog) {
      if (!this.uploadRaw(gl, rawLight)) return false;
      this.fboLight2 = pipeline.fbo('light2', rawLight.w2, rawLight.h2);
      if (!this.fboLight2 || !this.fboLight2.tex) { this.lastFail = 'fbo'; return false; }
      pipeline.bindTarget(this.fboLight2);
      gl.viewport(0, 0, rawLight.w2, rawLight.h2);
      gl.useProgram(this.pRecon.prog);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uRx'), rawLight.rx);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uRy'), rawLight.ry);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uRw'), rawLight.rw);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uRh'), rawLight.rh);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uTx0'), rawLight.tx0);
      gl.uniform1i(this.pipeline.uni(this.pRecon, 'uTy0'), rawLight.ty0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texRaw);
      pipeline.setBlend('off');
      pipeline.drawQuad(this.pRecon, [0, 0, rawLight.w2, rawLight.h2], 0);
      lightTex = this.fboLight2.tex;
      gl.activeTexture(gl.TEXTURE1);
    }

    // ---- Pass1：world × light → FBO('lit')（GLWorldLight.composite:179-232 逐式） ----
    this.fboLit = pipeline.fbo('lit', w, h);
    if (!this.fboLit) return false;
    pipeline.bindTarget(this.fboLit);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pLit.prog);
    gl.activeTexture(gl.TEXTURE0);
    const worldTex = (world as WorldTexSrc).tex;
    if (worldTex) {
      // ★B2b 句柄路径：FBO('world') 累积纹理直采——零上传（texSubImage2D 全幅
      //   上传退役）,采样朝向经 uWorldFlip=1 翻转（LIT_FRAG 派生式,见该注）。
      //   预乘语义:FBO 内容=quad (ONE,1−SA) 混合产物=预乘域,与 canvas 预乘
      //   上传同域（A 线零改动验证=光照链像素逐字节,对拍锁）。
      gl.bindTexture(gl.TEXTURE_2D, worldTex);
      gl.uniform1f(this.pipeline.uni(this.pLit, 'uWorldFlip'), (world as WorldTexSrc).flipY);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.texWorld);
      gl.uniform1f(this.pipeline.uni(this.pLit, 'uWorldFlip'), 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);   // canvas 源预乘直拷（原 :186 同式）
      const kW = `${w}x${h}`;
      if (this._texKeyWorld !== kW) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, world as HTMLCanvasElement);
        glStatTexCreate(this.pipeline.statName, w * h * 4);
        this._texKeyWorld = kW;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, world as HTMLCanvasElement);
      }
      glStatUpload(this.pipeline.statName, w * h * 4);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (rawLight) { /* recon 已产 uLight 来源;legacy 上传整段跳过 */ } else {
    const kb = `${light.width}x${light.height}`;
    if (this._texKeyLight !== kb) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatTexCreate(this.pipeline.statName, light.width * light.height * 4);
      this._texKeyLight = kb;
      glStatUpload(this.pipeline.statName, light.width * light.height * 4);
    } else if (lightBand === null) {
      // 零变化:跳过上传（原 :211 同式）
    } else if (lightBand !== undefined) {
      // ★R1-F5（2026-09-25 红蓝批 B）：9 参 DOM 源重载非标准（Firefox 按规范抛
      //  TypeError=每脏带帧崩;Chrome 左上 w×h 语义=侥幸对齐）——统一走
      //  GLSpriteLayer.texSubUpdate 判例:带内容 (0,0,w,h)（Renderer 生产面）先抠进
      //  带尺寸 scratch,再按标准 7 参 DOM 源整面上传 (0, band.y)。scratch 抠取=
      //  恒等复制+上传 pixelStorei 态逐式同 → Chrome 上传字节逐位不变。
      const bs = this.bandScratch(lightBand.canvas, lightBand.w, lightBand.h);
      if (bs) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, lightBand.y, gl.RGBA, gl.UNSIGNED_BYTE, bs);
        glStatUpload(this.pipeline.statName, lightBand.w * lightBand.h * 4);
      } else {
        // scratch 不可得（无 document——理论不可达,compose 面无此环境）:全幅回退
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, light);
        glStatUpload(this.pipeline.statName, light.width * light.height * 4);
      }
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatUpload(this.pipeline.statName, light.width * light.height * 4);
    }
    }
    gl.uniform1i(this.pipeline.uni(this.pLit, 'uWorld'), 0);
    gl.uniform1i(this.pipeline.uni(this.pLit, 'uLight'), 1);
    gl.uniform2f(this.pipeline.uni(this.pLit, 'uCanvas'), w, h);
    gl.uniform4f(this.pipeline.uni(this.pLit, 'uLightRect'), lightRect[0], lightRect[1],
      Math.max(1, lightRect[2]), Math.max(1, lightRect[3]));
    gl.uniform1f(this.pipeline.uni(this.pLit, 'uDarkSkip'), darkSkip);
    pipeline.setBlend('off');
    pipeline.drawQuad(this.pLit, [0, 0, w, h], 0);   // flipY=0:同 VERT 自带 y 翻转语义（与原 pass 内直绘一致）
    // ---- Pass2：obj19 扭曲,直采 FBO('lit') 纹理（GLWaterDistortion.composite:350-412 逐式） ----
    this.fboWarped = pipeline.fbo('warped', w, h);
    if (!this.fboWarped) return false;
    pipeline.bindTarget(this.fboWarped);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pDistort.prog);
    // uScene = FBO('lit') 纹理（★本刀核心:免画布回读+免全帧重传;LINEAR CLAMP 参数同原 texScene）
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboLit.tex);
    // 前景水门控纹理
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texWater);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (water && water.width > 0 && water.height > 0) {
      // ★首传/变尺寸必须 texImage2D 分配存储——只 texSubImage2D 于无存储纹理=
      //   INVALID_OPERATION 静默 → 采样不完整纹理恒 (0,0,0,1) → 门控 α≡1 全屏
      //   （2026-09-23 用户实报"全屏热扭曲状"定谳,即此）
      const kW = `${water.width}x${water.height}`;
      if (this._texKeyWater !== kW) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, water);
        glStatTexCreate(this.pipeline.statName, water.width * water.height * 4);
        this._texKeyWater = kW;
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, water);
      }
      glStatUpload(this.pipeline.statName, water.width * water.height * 4);
    } else {
      if (!this.texWaterEmpty) {
        this.texWaterEmpty = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texWaterEmpty);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([0, 0, 0, 0]));
      }
      gl.bindTexture(gl.TEXTURE_2D, this.texWaterEmpty);
    }
    if (noise) this.ensureNoise(gl, noise);
    else if (this.noiseW === 0) {
      // ★无噪声帧中性 1×1 垫底：防 uNoiseSize=(0,0) 除零 NaN（NaN×0=NaN 污染
      //   gate=0 的恒等直通——除零是唯一 NaN 源,全部定义后 gate=0 ⟹ 逐位恒等）
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      this.noiseW = 1; this.noiseH = 1;
    }
    if (waveR && gridW > 0 && gridH > 0) this.uploadWave(gl, waveR, gridW, gridH);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uScene'), 0);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uNoise'), 1);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uWave'), 2);
    gl.uniform1i(this.pipeline.uni(this.pDistort, 'uWater'), 3);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uCssSize'), cssW, cssH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWorldPx'), worldX, worldY);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uNoiseSize'), this.noiseW, this.noiseH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWaveSize'), gridW, gridH);
    gl.uniform2f(this.pipeline.uni(this.pDistort, 'uWaveOff'), waveOffX, waveOffY);
    gl.uniform1f(this.pipeline.uni(this.pDistort, 'uProgress'), progress);
    gl.uniform1f(this.pipeline.uni(this.pDistort, 'uIntensity'), intensity);
    pipeline.setBlend('off');
    pipeline.drawQuad(this.pDistort, [0, 0, w, h], 0);
    // ---- present：FBO('warped') → pipeline 画布（调用方单次 drawImage 回贴 2D） ----
    // ★opresent pass3：天空栈挂起在场且帧界一致 → over(warped, sky) → present 一次
    //  （两次全屏回贴并成一次;字节等价推导见 OPRESENT_VERT 注）。合并不可用
    //  （程序缺/FBO 租借失败/尺寸不一致=低清档帧）→ 原样单 present,lastMergeUsed
    //  保持 false=调用方 presentPendingSky 补贴天空栈（回退双 blit 基线）。
    const fboSky = sky && sky.w === w && sky.h === h ? pipeline.fbo(sky.fboName, sky.w, sky.h) : null;
    if (fboSky?.tex && this.pOver?.prog && this.fboWarped.tex) {
      this.fboOpresent = pipeline.fbo('opresent', w, h);
      if (this.fboOpresent) {
        pipeline.bindTarget(this.fboOpresent);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.pOver.prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.fboWarped.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fboSky.tex);
        gl.uniform1i(this.pipeline.uni(this.pOver, 'uWorld'), 0);
        gl.uniform1i(this.pipeline.uni(this.pOver, 'uSky'), 1);
        pipeline.setBlend('off');
        pipeline.drawQuad(this.pOver, [0, 0, w, h], 0);
        this.lastMergeUsed = true;
        pipeline.present(this.fboOpresent);
        return true;
      }
    }
    pipeline.present(this.fboWarped);
    return true;
  }

  /** ★哨兵族同款获取面（2026-09-23 资源风暴防护补齐）：贫困锁不建（starvedLock,
   *  与 waterWarp.glLayer 同款）;上下文丢失后 5s 退避重建（diedAt 哨兵,防重建风暴）。
   *  unavailable 即返 null=调用方落回旧链。
   *  ★C10b 共管模式（ownsPipe=false）不自行重生管线本体——pipeline.recreate 清
   *  程序表会连带毒化云/bg 层的已登记句柄（悬空程序=INVALID_OPERATION 静默弃画）,
   *  管线重生链统一归 Renderer.reviveSwPipe。
   *  ★R1-F12（2026-09-25 红蓝批 B）：共管支【同等 5s 退避重试】（对齐 ownsPipe=true
   *  支承诺）——recreate 在 ownsPipe=false 只做「管线已活则重注册」（不触
   *  pipeline.recreate、不清程序表,见 recreate 注）;管线仍死（ok=false）保持
   *  unavailable 返 null,不刷屏。可达面：构造期 shader 编译失败/句柄半残——
   *  此前永久熄火,现 5s 后经 recreate 重登记自愈。 */
  acquire(): GLWorldCompose | null {
    if (starvedLock()) return null;
    if (this.unavailable) {
      if (performance.now() - this.pipeline.diedAt > 5000) this.recreate();
    }
    return this.unavailable ? null : this;
  }

  /** ★P0 闩位收口（2026-09-25）：A3（lrecon raw 直传）可用性【预检】。
   *  真值面与 compose 内 guard（:288 `guard:rawBroken|lreconDead|noprog`）逐字
   *  同源（单一事实源=同一布尔组合,lastFail 面同串）。为什么要预检:guard 早退
   *  返 false 时调用方（Renderer lrecon 分支）已在本帧【跳过 CPU 光照重建】——
   *  rawBroken/lreconDead 是逐上下文确定性闩（RGBA8UI 驱动拒收/程序编译失败,
   *  不自愈）,一旦置位=此后每帧重复付费 [compose 进入+guard 早退]+CPU 重建,
   *  且 lastFail 账面与路径账在帧间反复横跳难归因。预检让 Renderer 在跳过
   *  CPU 重建【之前】知情:闩置位帧直接走 CPU 重建+A2（lightCanvas 路径,
   *  lastFail 保留首因串）——与 ?lrecon=0 逃生门同构,语义=废 A3 不废 A2 整链。
   *  compose 内 guard 保留为防御位（调用方漏检/运行中置位的当帧仍由它兜底）。 */
  lreconUsable(): boolean {
    if (this._rawBroken) { this.lastFail = 'guard:rawBroken'; return false; }
    if (this.lreconDead || !this.pRecon?.prog) { this.lastFail = 'guard:lreconDead'; return false; }
    return true;
  }

  /** ★A3 raw 光照上传：(rw+2)×(rh+2) RGBA8UI,窗内容 (1,1) 偏移,边缘零环。
   *  整数纹理=采样返回原字节（UNORM k/255 不精确会破坏位等价,见 LRECON_FRAG 注④） */
  private uploadRaw(gl: WebGL2RenderingContext, rl: RawLight): boolean {
    const W = rl.rw + 2, H = rl.rh + 2;
    if (!this._rawBuf || this._rawBuf.length !== W * H * 4) this._rawBuf = new Uint8Array(W * H * 4);
    const buf = this._rawBuf;
    for (let y = 0; y < rl.rh; y++) {
      let di = ((y + 1) * W + 1) * 4;
      let si = y * rl.rw;
      for (let x = 0; x < rl.rw; x++, di += 4, si++) {
        buf[di] = rl.r[si]; buf[di + 1] = rl.g[si]; buf[di + 2] = rl.b[si]; buf[di + 3] = 255;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texRaw);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // ★BJ316 体检收窗（真机 trace 定谳 2026-09-23,Trace-20260923T222003.json）：
    //  getError 是全管线同步点（排空 while+上传后体检=每帧 2 次 flush+GPU 回读
    //  等待），稳态自付 ~1ms/帧；DOM 每帧重绘与 WebGL 争 GPU 时单点膨胀到
    //  4.0ms/帧（开包掉帧主凶,占 120→82fps 缺口六成）。RGBA8UI 被驱动拒是
    //  【逐上下文确定性】条件（2026-09-23 全黑案形态:首传即拒,无逐帧随机面）
    //  → 体检收窄到「审计窗」：①首 3 次上传 ②尺寸首见（视口/缩放变化 →
    //  rw/rh 变 → W×H 变）③recreate 重建上下文后重置。稳态零 getError=零
    //  sync;错误队列此后不再消费（全仓无其他 getError 消费方,grep 核对
    //  2026-09-23;GL 错误码槽合并覆写,无累积面）。审计窗内仍先排空
    //  （getError 返回最老未读错误,不排空会把帧内其他调用的旧错误记到本次
    //  上传头上,2026-09-23 探针实测误伤案）。
    const kW = `${W}x${H}`;
    const audit = this._rawAuditLeft > 0 || this._rawAuditKey !== kW;
    if (audit) {
      if (this._rawAuditLeft > 0) this._rawAuditLeft--;
      this._rawAuditKey = kW;
      while (gl.getError() !== gl.NO_ERROR) { /* 排空 */ }
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, W, H, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, buf);
    // ★RGBA8UI 上传体检（审计窗内）：被驱动拒（INVALID_OPERATION）时纹理不完整 →
    //  texelFetch 恒 0 → recon 全黑 → 世界全黑（用户实报案防御）——坏即 _rawBroken
    //  回落 lightCanvas 路径（compose 返 false → Renderer 落 CPU 重建+A2/旧链）。
    //  语义收窄备案：稳态（已过审同尺寸）上传失败不再逐帧检出——唯一登记失效面
    //  是逐上下文确定性拒绝（审计窗已覆盖）与 OOM（尺寸变化触发重审已覆盖）。
    if (audit && gl.getError() !== gl.NO_ERROR) { this._rawBroken = true; this.lastFail = 'raw-upload-glerror'; return false; }
    glStatUpload(this.pipeline.statName, W * H * 4);
    return true;
  }

  /** 噪声懒上传（ensureNoise:278-289 逐式;纯数据源预乘 false） */
  private ensureNoise(gl: WebGL2RenderingContext, noise: TexImageSource): boolean {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    const nw = (noise as { width?: number }).width ?? 0;
    const nh = (noise as { height?: number }).height ?? 0;
    if (nw > 0 && nh > 0) {
      glStatUpload(this.pipeline.statName, nw * nh * 4);
      this.noiseW = nw; this.noiseH = nh;
    }
    return true;
  }

  /** ★R1-F5 光照脏行带 scratch（GLSpriteLayer.texSubUpdate 同款判例）：带画布是
   *  全尺寸 w2×h2 面带内容只在 (0,0,w,bandH)（Renderer 生产面）,DOM 源无子区重载
   *  → 抠进恰好 band 尺寸的 scratch 再整面上传。resize-on-change（尺寸变才重分配;
   *  band 高逐帧变=换页 churn 接受面,与 texSubUpdate 判例同款）。
   *  willReadFrequently=纯上传中转（SHM 后备不占 IOSurface,GLSpriteLayer 判例同注）。 */
  private _bandScratch: HTMLCanvasElement | null = null;
  private _bandScratchCtx: CanvasRenderingContext2D | null = null;
  private bandScratch(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (!this._bandScratch) {
      this._bandScratch = document.createElement('canvas');
      this._bandScratchCtx = this._bandScratch.getContext('2d', { willReadFrequently: true });
    }
    const c = this._bandScratchCtx;
    if (!c || !this._bandScratch) return null;
    if (this._bandScratch.width !== w || this._bandScratch.height !== h) {
      this._bandScratch.width = w;
      this._bandScratch.height = h;
    }
    c.clearRect(0, 0, w, h);
    c.drawImage(src, 0, 0, w, h, 0, 0, w, h);
    return this._bandScratch;
  }

  /** 波场 _R → LUMINANCE 8bit（uploadWave:293-321 逐式;★8bit 量化=输出语义,勿改浮点直传） */
  private uploadWave(gl: WebGL2RenderingContext, waveR: Float32Array, w: number, h: number): void {
    const n = w * h;
    if (!this.waveBytes || this.waveBytes.length !== n) this.waveBytes = new Uint8Array(n);
    const bytes = this.waveBytes;
    const amp = 1;   // ?wamp 增益在旧模块读取;本模块首版恒 1=原版原样（接线刀带 waveAmpParam 同款读取面）
    for (let i = 0; i < n; i++) {
      const v = ((waveR[i] - 0.5) * amp + 0.5) * 255 + 0.5;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);   // LUMINANCE 紧排（原 :318,行非 4 倍数防 INVALID_OPERATION）
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    glStatUpload(this.pipeline.statName, w * h);
  }

  /** 上下文丢失/退避后重建（透传 pipeline.recreate;纹理/键全弃）。
   *  ★C10b 共管模式:管线重生归 Renderer（reviveSwPipe 先行——此处只在管线已
   *  活时重注册程序+重建纹理;管线仍死则保持 unavailable 待下轮） */
  recreate(): boolean {
    const ok = this.ownsPipe ? this.pipeline.recreate() : !this.pipeline.unavailable;
    this.unavailable = this.pipeline.unavailable;
    if (ok) {
      // ★程序登记重跑（pipeline.recreate 清空程序表——句柄重注册,否则悬空）
      this.pLit = this.pipeline.program('worldLight', LIT_VERT, LIT_FRAG);
      this.pDistort = this.pipeline.program('distort', GLWaterDistortion.VERT, GLWaterDistortion.FRAG);
      this.pRecon = this.pipeline.program('lrecon', LRECON_VERT, LRECON_FRAG);
      this.pOver = this.pipeline.program('opresent', OPRESENT_VERT, OPRESENT_FRAG);   // ★opresent 同链重注册
      this.lreconDead = !this.pRecon?.prog;
      const gl = this.pipeline.glx;
      if (gl) {
        this.texWorld = gl.createTexture();
        this.texLight = gl.createTexture();
        for (const t of [this.texWorld, this.texLight]) this.setParams(gl, t, 'LINEAR', 'CLAMP');
        this.texNoise = gl.createTexture();
        this.setParams(gl, this.texNoise, 'LINEAR', 'REPEAT');
        this.texWave = gl.createTexture();
        this.setParams(gl, this.texWave, 'LINEAR', 'CLAMP');
        this.texWater = gl.createTexture();
        this.setParams(gl, this.texWater, 'NEAREST', 'CLAMP');
        this.texRaw = gl.createTexture();
        this.setParams(gl, this.texRaw, 'NEAREST', 'CLAMP');
      }
      this._texKeyWorld = ''; this._texKeyLight = ''; this._texKeyNoise = ''; this._texKeyWater = '';
      // ★R1-F6（2026-09-25 红蓝批 B）：噪声尺寸一并重置——texNoise 已是全新无存储
      //  纹理,陈旧 noiseW/H 会让「无噪声帧中性 1×1 垫底」门（noiseW===0）被跳过 →
      //  uNoise 采 incomplete 纹理恒 (0,0,0,1)（噪声位移项静默归零面）。
      this.noiseW = 0; this.noiseH = 0;
      // ★BJ316:重建后重审 RGBA8UI 体检。★P0（2026-09-25）:_rawBroken 闩必须随
      //  体检窗一起复位——RGBA8UI 拒收是【逐上下文】确定性条件,重建=新上下文可能
      //  接受;闩残留则重审窗成死代码,A3 永久熄火（新上下文拒绝时首 3 传内再检出
      //  再闩,安全面不变）。lreconDead 同理已随 :625 程序重登记重估。
      this._rawAuditLeft = 3; this._rawAuditKey = '';
      this._rawBroken = false;
      this.texWaterEmpty = null;
    }
    return ok;
  }

  dispose(): void {
    // ★C10b:仅自建管线时级联 dispose——共管注入的管线归 Renderer 治理
    if (this.ownsPipe) this.pipeline.dispose();
    this.unavailable = true;
  }
}

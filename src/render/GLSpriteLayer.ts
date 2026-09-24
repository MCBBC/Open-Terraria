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
import { noteContextLost } from './GLStats';
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

interface TexEntry { tex: WebGLTexture; w: number; h: number; stamp: number; bytes: number; mipped: boolean }

const VERT_SRC = `#version 300 es
uniform vec2 uCanvas;
uniform vec4 uSrc;    // uv 基 + uv 跨度
uniform vec4 uDst;    // 目标基 + 尺寸(像素)
uniform float uRot;
layout(location=0) in vec2 aPos;                     // 单位 quad (0..1)^2
out vec2 vUv;
void main() {
  vec2 c = vec2(0.5);
  vec2 d = aPos - c;
  float s = sin(uRot), co = cos(uRot);
  vec2 p = c + vec2(d.x * co - d.y * s, d.x * s + d.y * co);
  vUv = vec2(uSrc.x + p.x * uSrc.z, uSrc.y + p.y * uSrc.w);
  vec2 screen = vec2(uDst.x + p.x * uDst.z, uDst.y + p.y * uDst.w);
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
    this.buildCommonObjects(gl);
    // 上下文丢失:管线画布上的第二监听（管线自身也监听并标自身不可用）——本层同步
    // 标记,消费方回退 2D,退避期后由持有方整体重建（语义同旧路径自愈钩子）
    this.canvas.addEventListener('webglcontextlost', (e) => {
      noteContextLost(`sprite:${this.statName}`);   // #三开压测批
      e.preventDefault();
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
      console.warn('[GLSpriteLayer:pipe] GL 上下文丢失——标记不可用,消费方回退 2D,5s 后允许重建');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
    });
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
    // 单位 quad VAO+五采样器（旧上下文/管线后端两路共用构造段）
    this.buildCommonObjects(gl);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // ★自愈钩子(2026-08-18 双开"关掉另一窗口也恢复不了"根因):GL 上下文
    // 丢失后【不会自恢复】(2D 会),曾无人监听=永远持有死上下文,背景层
    // 全空且不再重试。死亡即标 unavailable,消费方丢弃实例走 2D 兜底,
    // 退避期后重建新实例
    this.canvas.addEventListener('webglcontextlost', (e) => {
      noteContextLost(`sprite:${this.statName}`);   // #三开压测批
      e.preventDefault();               // 保留恢复资格(部分驱动可自动恢复)
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;
      console.warn('[GLSpriteLayer] GL 上下文丢失——标记不可用,消费方回退 2D,5s 后允许重建');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      // 内容(纹理/程序)已全部蒸发:仍按死亡处理,由消费方整体重建更干净
      this.unavailable = true;
      this.diedAt = performance.now();
      this.objectsStale = true;   // restore 后 isContextLost()=false 但旧对象已蒸发
    });
  }
  /** 上下文死亡时刻(重建退避用;0=未死) */
  diedAt = 0;
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
   *  开会话方;管线 FBO 命名空间防撞:clouds/bg/lit/warped/light2 各归各） */
  begin(fboName = 'clouds'): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    if (this.pipe) {
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
      gl.clear(gl.COLOR_BUFFER_BIT);
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
   *  取 bbox 子矩形,blit 结构与旧路径同构（一期不改 blit 合并） */
  end(): void {
    if (this.unavailable || !this.gl) return;
    this.gl.bindVertexArray(null);
    if (this.pipe && this.pipeFbo) {
      this.pipe.present(this.pipeFbo);
      this.pipeFbo = null;
    }
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
    const entry: TexEntry = { tex, w, h, stamp: ++this.stamp, bytes: mipped ? base * 4 / 3 : base, mipped };
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

  /** 按键主动释放(全屏地图关闭时丢弃整幅纹理——地图只在打开期占 GPU) */
  dropTexture(key: string): void {
    if (!this.gl) return;
    const e = this.texs.get(key);
    if (!e) return;
    this.texs.delete(key);
    this.bytes -= e.bytes;
    glStatDelete(this.statName, e.bytes);   // #perf-gpulog
    this.gl.deleteTexture(e.tex);
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
  quad(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number, opts?: QuadOpts,
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    const gl = this.gl;
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

  /** 横向平铺:dst 区间内按"dw 对应一个源周期"重复(GL REPEAT 一次画整段,
   *  替代 2D for 循环逐 tile drawImage)。纹理须以 repeatX=true 创建 */
  tileX(
    e: TexEntry, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, totalW: number, dh: number, opts?: QuadOpts,
  ): void {
    if (this.unavailable || !this.gl || sw <= 0 || sh <= 0 || totalW <= 0 || dh <= 0) return;
    const gl = this.gl;
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
    }
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
  //   alpha 恒写 1——预乘画布读出有 rgb≤a 隐式钳制，恒 1 杜绝 rgb>a 被钳暗。
  oC = vec4(oc.rgb, 1.0);
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
  oC = vec4(oc.rgb, 1.0);
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
    }
    this.trailProg = null; this.trailMMProg = null; this.trailVAO = null; this.trailVbo = null;
    this.trailIbo = null; this.trailWrapSampler = null;
    this.trailDirty = false;
    this.texs.clear();
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
    }
    this.progHandle = null; this.progCloudHandle = null;
    this.prog = null; this.progCloud = null; this.cloudFxOK = false;
    this.vao = null;
    this.samp = { nearest: null, linear: null, repeat: null, linearNoMip: null, wrap2: null };
    this.pipeFbo = null;
    this.texs.clear();
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

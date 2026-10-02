// ★A0 GLPipeline —— 单上下文 GL 管线门面（2026-09-22 基建刀；docs/plans 渲染改造方案 §三 A0）
//
// 背景：现架构 5-6 个独立离屏 WebGL 上下文（glfx/GLWorldLight/GLWaterDistortion/
// GLScreenFilters/GLAurora/menubg），中间产物走「GL 画布 → 2D drawImage 回读 →
// 下一 pass 全幅重传」乒乓（gpulog 排行 #1 债；GLScreenFilters.drawChain 每 pass
// 全幅 texImage2D = N−1 次往返）。本模块把中间产物驻留**单上下文 FBO**：
//
//   upload(worldCanvas) ─┐
//   upload(lightBand)  ──┴→ pass1 → FBO_A → pass2 → FBO_B → present() → ctx.drawImage(canvas) 单次回贴
//
// 消费路线图（每刀独立对拍+逃生门,见方案 §三）：A1 screenFx 链入管线（杀乒乓）、
// A2 光照×扭曲两级 FBO 链（★两级 pass 结构与字节路径逐位不变——不合并单 shader
// pass：第一级输出经 8-bit RGBA8 量化,第二级 LINEAR 插值的是量化值,单 pass 浮点
// 直乘跳过中间量化=字节必不同,方案 §二裁决 3）、A3 光照小图 GPU 重建、B1+B2 世界层
// 翻面。**本刀零消费方 = 零输出变化**（final-gate 零漂移;tests/a0-glpipeline-shell
// 结构锁钉住「无 import 方」——接入刀落盘时同步摘除该锁）。
//
// 纪律（全承 GLSpriteLayer 判例,勿另起炉灶）：
// - 预乘：canvas 源上传恒 UNPACK_PREMULTIPLY_ALPHA_WEBGL=true;ImageBitmap 源须
//   createImageBitmap({premultiplyAlpha:'premultiply'}) 升格（SpriteAtlas.ts:230 判例
//   ——WebGL 规范对 ImageBitmap 忽略 UNPACK_PREMULTIPLY）;blend (ONE,1−SA) 语义。
// - 软渲染判死：SwiftShader/llvmpipe 上下文可建但软跑（GLSpriteLayer.ts:189 判例）。
// - 退避：初始化失败/丢失记 diedAt,消费方 5s 退避重建（防 --disable-gpu 下 60 张/秒
//   createElement 风暴,2026-08-19 哨兵三捕）。
// - 字节账：分配/上传/绘制全埋 GLStats（驻留 vs 带宽双口径铁律,GLStats.ts:61 注）。
import { glStatUpload, glStatTexCreate, glStatDelete, glStatDraw, registerFence } from './GLStats';
import { texBytes } from './GLStats';

/** blend 档位表（固定功能混合;尘/拖尾 erase·add 已有逐位语义定谳） */
export type BlendMode = 'premul' | 'add' | 'erase' | 'off';

/** 管线 FBO 句柄（RGBA8 纹理+attachment;尺寸随帧面变化自动重分配） */
export interface PipelineFbo {
  readonly name: string;
  tex: WebGLTexture | null;
  fbo: WebGLFramebuffer | null;
  w: number;
  h: number;
}

/** 登记程序句柄（uniform 定位惰性解析缓存） */
export interface PipelineProgram {
  readonly name: string;
  prog: WebGLProgram | null;
  private_: { uniCache: Map<string, WebGLUniformLocation | null> };
}

const PRESENT_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform vec4 uDst;        // 像素矩形 (x,y,w,h)——present/全屏 pass 复用
uniform vec2 uCanvas;     // 目标面尺寸
uniform float uFlipY;     // 1=纹理 Y 翻转（GL 常规→画布常规;2D drawImage 语义）
void main() {
  vec2 p = aPos * uDst.zw + uDst.xy;
  gl_Position = vec4(p / uCanvas * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  vUv = vec2(aPos.x, mix(aPos.y, 1.0 - aPos.y, uFlipY));
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`;

export class GLPipeline {
  /** present 目标画布——调用方 2D 侧 ctx.drawImage(pipeline.canvas) 单次回贴。
   *  preserveDrawingBuffer 必须（drawImage 合成时缓冲必须仍在,GLSpriteLayer 判例） */
  readonly canvas: HTMLCanvasElement;
  unavailable = false;
  diedAt = 0;
  // ---- ★C10e 屏直出栈（2026-10-01）：可见画布上的栈式 present 记账 ----
  /** Renderer 分体画布注入（glCanvas=DOM 呈现面）时置 true——over present 走
   *  premul source-over 叠合并入栈；replace present（内部读回面）不入栈。 */
  screenStackMode = false;
  /** 本帧已 over-present 的 FBO 序（层序=入栈序;restack 重放源） */
  private screenStack: PipelineFbo[] = [];
  private gl: WebGL2RenderingContext | null = null;
  /** ★BJ344（件3）：contextlost 具名监听（dispose 摘除——脱离 canvas 上的闭包滞留面） */
  private ctxLostHandler: ((e: Event) => void) | null = null;
  private fbos = new Map<string, PipelineFbo>();
  private programs = new Map<string, PipelineProgram>();
  private vao: WebGLVertexArrayObject | null = null;
  private presentProg: PipelineProgram | null = null;
  private frameW = 0;
  private frameH = 0;

  constructor(statName = 'pipeline', canvas?: HTMLCanvasElement) {
    this.statName = statName;
    // ★C10e（2026-10-01）分体画布呈现：注入画布=可见 DOM 画布（Renderer 持有,
    //  z 序夹在 sky2D 与 HUD 之间）——present 直出屏面,跨上下文拷贝归零。
    //  不传=离屏画布（旗关/旧路径零变化）。revive 链传新元素（死上下文同元素
    //  getContext 恒回死上下文,GLSpriteLayer 判例——Renderer 侧 replaceWith 换元）。
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.init();
  }

  statName: string;
  /** 消费模块的原始上下文访问器（纹理对象创建/逐上传 pixelStorei 精细控制——
   *  ★noise/wave 等纯数据源须 UNPACK_PREMULTIPLY=false,不适用画布源预乘收口）。
   *  unavailable 时返回 null;消费方一律先判。 */
  get glx(): WebGL2RenderingContext | null {
    return this.unavailable ? null : this.gl;
  }
  private gll(): WebGL2RenderingContext | null {
    return this.unavailable ? null : this.gl;
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,   // 离屏合成:drawImage 时缓冲必须仍在
    }) as WebGL2RenderingContext | null;
    if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
    // 软渲染判死（SwiftShader/llvmpipe——上下文可建但软跑,GLSpriteLayer 判例）
    try {
      const renderer = String(gl.getParameter(gl.RENDERER) ?? '');
      if (/swiftshader|software|llvmpipe|basic render/i.test(renderer)) {
        this.unavailable = true; this.diedAt = performance.now();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return;
      }
    } catch { /* RENDERER 查询失败按硬件处理 */ }
    this.gl = gl;
    // ★BJ344（件3）：具名化（destroy 后 canvas 脱离文档仍被实例持有,匿名监听器闭包
    //  捕 this=管线→Renderer→Game 整链滞留——dispose removeEventListener 摘除）
    this.ctxLostHandler = (e: Event) => {
      e.preventDefault();
      this.unavailable = true;
      this.diedAt = performance.now();
    };
    this.canvas.addEventListener('webglcontextlost', this.ctxLostHandler);
    // 预乘收口：所有上传恒真（模块级状态一次设齐,upload 不再逐次设）
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   // Y 翻转由 present uFlipY 显式管
    // 单位 quad(TRIANGLE_STRIP)——全模块共享单 VAO
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.presentProg = this.program('present', PRESENT_VERT, PRESENT_FRAG);
    if (!this.presentProg?.prog) { this.unavailable = true; this.diedAt = performance.now(); }
  }

  /** 程序登记（编译/链接失败返回 prog=null 的句柄,不 throw——消费方判不可用走 2D 兜底） */
  program(name: string, vs: string, fs: string): PipelineProgram {
    const existed = this.programs.get(name);
    if (existed) return existed;
    const handle: PipelineProgram = { name, prog: null, private_: { uniCache: new Map() } };
    const gl = this.gll();
    if (gl) {
      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn(`[GLPipeline:${name}] shader 编译失败:`, gl.getShaderInfoLog(sh));
          return null;
        }
        return sh;
      };
      const v = compile(gl.VERTEX_SHADER, vs);
      const f = compile(gl.FRAGMENT_SHADER, fs);
      if (v && f) {
        const p = gl.createProgram()!;
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (gl.getProgramParameter(p, gl.LINK_STATUS)) {
          handle.prog = p;
        } else {
          console.warn(`[GLPipeline:${name}] 链接失败:`, gl.getProgramInfoLog(p));
        }
      }
    }
    this.programs.set(name, handle);
    return handle;
  }

  uni(p: PipelineProgram, n: string): WebGLUniformLocation | null {
    let loc = p.private_.uniCache.get(n);
    if (loc === undefined) {
      loc = p.prog ? this.gl!.getUniformLocation(p.prog, n) : null;
      p.private_.uniCache.set(n, loc);
    }
    return loc;
  }

  /** FBO 租借（按名驻留;帧面尺寸变化时重分配纹理。RGBA8——与 2D 画布背板同构,
   *  中间产物字节语义=原画布字节（A1/A2 等价性论证的前提） */
  fbo(name: string, w: number, h: number): PipelineFbo | null {
    const gl = this.gll();
    if (!gl) return null;
    let f = this.fbos.get(name);
    if (!f) {
      f = { name, tex: null, fbo: null, w: 0, h: 0 };
      this.fbos.set(name, f);
    }
    if (f.tex && f.w === w && f.h === h) return f;
    if (f.tex) {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fbo!);
      glStatDelete(this.statName, texBytes('RGBA8', f.w, f.h));
    }
    // ★绑定卫生（2026-09-23 反馈环案）:创建时 bindTexture 落【当前激活单元】且顶掉
    //  原绑定——pass2 建 warped 纹理恰落 unit1（pass1 的 light 绑定位）→ 往 warped
    //  里画时 unit1=warped 自身=Feedback loop（drawArrays 拒绝/未定义行为）。
    //  保存/还原激活单元绑定,创建不留痕。
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    f.tex = tex; f.fbo = fb; f.w = w; f.h = h;
    glStatTexCreate(this.statName, texBytes('RGBA8', w, h));
    return f;
  }

  /** 渲染目标切换（viewport 随 FBO;null=回 present 画布） */
  bindTarget(f: PipelineFbo | null): void {
    const gl = this.gll();
    if (!gl) return;
    if (f) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
      gl.viewport(0, 0, f.w, f.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.frameW, this.frameH);
    }
  }

  /** blend 档位（固定功能表——premul=Canvas source-over 语义/add=lighter/
   *  erase=destination-out(off 前须 premul 对)/off=滤镜 pass 直写） */
  setBlend(mode: BlendMode): void {
    const gl = this.gll();
    if (!gl) return;
    switch (mode) {
      case 'premul': gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'add': gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'erase': gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'off': gl.disable(gl.BLEND); break;
    }
  }

  /** 画布/位图源上传（预乘已由 init 收口;字节账=带宽列）。
   *  ★ImageBitmap 源须已 premultiply 升格（SpriteAtlas 判例）——本口不二次处理 */
  uploadCanvas(tex: WebGLTexture, src: TexImageSource, w: number, h: number): void {
    const gl = this.gll();
    if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    glStatUpload(this.statName, w * h * 4);
  }

  /** 帧界：present 画布尺寸同步（2D 主画布同尺寸）;幂等 */
  beginFrame(w: number, h: number): boolean {
    const gl = this.gll();
    if (!gl) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.frameW = w;
    this.frameH = h;
    return true;
  }

  /** 单位 quad 全屏/矩形绘制（blend 由调用方 setBlend;uDst 为像素矩形） */
  drawQuad(p: PipelineProgram, uDst: [number, number, number, number], flipY = 1): void {
    const gl = this.gll();
    if (!gl || !p.prog || !this.vao) return;
    gl.useProgram(p.prog);
    gl.uniform4f(this.uni(p, 'uDst'), uDst[0], uDst[1], uDst[2], uDst[3]);
    gl.uniform2f(this.uni(p, 'uCanvas'), this.frameW, this.frameH);
    gl.uniform1f(this.uni(p, 'uFlipY'), flipY);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    glStatDraw(this.statName, 4);
  }

  /** 把 source FBO 1:1 present 到自身画布（调用方随后 ctx.drawImage 单次回贴 2D）。
   *  blend off+flipY=1（GL 纹理 Y 向上→画布 Y 向下,≙2D drawImage 语义）。
   *  ★2026-09-23 用户实报全黑案:uniform1i 必须在 useProgram 之后——原实现先设
   *  uTex 再于 drawQuad 内 useProgram = 上一 pass 程序在场 → INVALID_OPERATION
   *  每帧刷屏（location is not from the associated program）且 uTex 未落。
   *  ★C10e over 档（2026-10-01）：screenStackMode 下 over=true = premul source-over
   *  叠合出屏（栈式呈现——屏面已画内容在下,本 FBO 在上,porter-duff over 结合律
   *  ≙ 原单画布 2D 序列;不透明 FBO 逐位同 blend-off）并入屏栈;false=blend off
   *  直写（内部读回面/旗关路径,字节路径零变化）不入栈。 */
  present(src: PipelineFbo, over = false): void {
    const gl = this.gll();
    if (!gl || !src.tex || !this.presentProg?.prog) return;
    // 语义逐位保持原实现:premul+入栈【仅】over∧screenStackMode;over 真而栈机制
    // 关（revive 窗/旗关）=blend off 直写（原 if/else 档,字节路径零变化）
    const stackOver = over && this.screenStackMode;
    if (stackOver) this.screenStack.push(src);
    this.presentTexTo(null, src.tex, stackOver, 1);
  }

  /** ★K1-2（2026-10-02）present 同款语义落指定目标（屏栈 FBO 直入滤镜链的组装
   *  口——屏栈重放/基底直写,【不入屏栈】不改「glCanvas=屏栈折叠」不变式）。
   *  target=null=默认帧缓冲（≙present 本体）;over=true=premul source-over 叠合
   *  （同 present over 档）;flipY 透传 drawQuad（1=texel 恒等映射——屏栈 FBO 全为
   *  GLSpriteLayer VERT 产物 G 朝向「图像顶=v1」,present flipY=1 恒等重放逐位同
   *  restackScreen 语义;0=行反转映射）。uniform-in-useProgram 纪律同 present
   *  （2026-09-23 全黑案判例）。 */
  presentTexTo(target: PipelineFbo | null, tex: WebGLTexture, over: boolean, flipY: number): void {
    const gl = this.gll();
    if (!gl || !this.presentProg?.prog) return;
    this.bindTarget(target);
    this.setBlend(over ? 'premul' : 'off');
    gl.useProgram(this.presentProg.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uni(this.presentProg, 'uTex'), 0);
    this.drawQuad(this.presentProg, [0, 0, this.frameW, this.frameH], flipY);
    registerFence(this.statName, gl);
  }

  /** ★K1-2：屏栈只读暴露（drawChainPipeStack 逐层 premul-over 重放用——消费方
   *  禁改栈;入栈唯一写点=present over 档,清栈唯一写点=clearScreenForStack） */
  get screenStackView(): readonly PipelineFbo[] {
    return this.screenStack;
  }

  /** ★C10e 帧首屏面清透明+屏栈清零（本帧首个会话 begin 经此闯入——pipe 帧头可能
   *  未建,不能在 render 头做）。保留 drawImage 读回所需的 preserve 语义:clear 后
   *  后续 present 重建内容。 */
  clearScreenForStack(): void {
    const gl = this.gll();
    if (!gl) return;
    this.bindTarget(null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.screenStack.length = 0;
  }

  /** ★C10e 内部 present（blend off 直写读回面）踩踏屏面后的恢复：清屏+按栈重放
   *  屏栈（层序=入栈序）。栈语义不变式：任意帧内任意时点,glCanvas 内容 ≙ 屏栈
   *  FBO 的 over 折叠——内部读回位（degradeAcc/bgl 桥/人工星 blit）踩踏后必须调。 */
  restackScreen(): void {
    if (!this.screenStackMode) return;
    const gl = this.gll();
    if (!gl) return;
    const stack = this.screenStack.slice();   // clear 会清栈——先快照再重放
    this.clearScreenForStack();
    for (const f of stack) this.present(f, true);
  }

  /** 上下文丢失/退避后重建（消费方判 now-diedAt>5000 才调,防风暴） */
  recreate(): boolean {
    if (!this.unavailable) return true;
    this.gl = null;
    this.fbos.clear();
    this.programs.clear();
    this.presentProg = null;
    this.vao = null;
    this.unavailable = false;
    this.init();
    return !this.unavailable;
  }

  dispose(): void {
    // ★BJ344（件3）：监听器随实例摘除（闭包捕 this——脱离 canvas 上滞留即整链滞留）
    if (this.ctxLostHandler) this.canvas.removeEventListener('webglcontextlost', this.ctxLostHandler);
    this.ctxLostHandler = null;
    const gl = this.gl;
    if (gl) {
      for (const f of this.fbos.values()) {
        if (f.tex) {
          gl.deleteTexture(f.tex);
          glStatDelete(this.statName, texBytes('RGBA8', f.w, f.h));
        }
        if (f.fbo) gl.deleteFramebuffer(f.fbo);
      }
      for (const p of this.programs.values()) if (p.prog) gl.deleteProgram(p.prog);
    }
    this.fbos.clear();
    this.programs.clear();
    this.gl = null;
    this.unavailable = true;
    this.diedAt = performance.now();
  }
}

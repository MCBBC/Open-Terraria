// 世界层×光照 精确乘法合成器(2026-08-20 夜景对齐原版重写)。
//
// 为什么需要 GL:Canvas2D 的 'multiply' 走 PDF 混合语义——半透明目标上
// blend 结果带 (1-αd)·Cs 项(色洗)且 αo = αs+αd(1-αs)(α 膨胀):史莱姆
// α0.7 → 0.91 且偏白(2026-08-19 worldLayer mask-multiply 实测病根)。
// 原版语义是【顶点色乘法】:out.rgb = texel.rgb × light.rgb,α 原样保留
// (Lighting.GetColor 的 A 恒 255,XNA 预乘管线)。2D 无法精确表达,这里用
// 一条双纹理 quad 精确实现:
//   gl_FragColor = vec4(world.rgb × light.rgb × world.a, world.a)  // 预乘输出
//
// 合成形态同 GLSpriteLayer:GL 画布离屏,调用方在原 2D 链同一时序
// `ctx.drawImage(layer.canvas, 0, 0)` 单次合成。GL 不可用/上下文丢失时
// unavailable=true,调用方回退 2D 三步近似(见 Renderer.compositeLight)。

import { glStatUpload, glStatTexCreate, glStatDraw, registerFence, noteContextLost } from './GLStats';
export class GLWorldLight {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private texWorld: WebGLTexture | null = null;
  private texLight: WebGLTexture | null = null;
  /** 上下文丢失/初始化失败时间戳(0=健在);调用方 5s 退避后可重建 */
  diedAt = 0;
  /** GL 永不可用(WebGL 缺失/shader 失败)——调用方直接走 2D 回退不再重建 */
  unavailable = false;

  // GLSL 100(WebGL1/2 皆可编)——attribute/varying 形式
  static VERT = `
attribute vec2 aPos;              // 单位 quad (0..1)^2
uniform vec2 uCanvas;             // (仅 FRAG 采样用;此处 aPos 已是归一化)
varying vec2 vUv;
void main() {
  vUv = aPos;
  // ★y 翻转同 GLSpriteLayer(两次倒置翻车教训):canvas 2D y 向下;
  //   aPos 已 0..1,直接映 clip(曾误除 uCanvas → quad 缩成 1px 碎片)
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;
  static FRAG = `
precision highp float;   // uCanvas 与 VS 共享,精度必须一致(链接器要求)
uniform sampler2D uWorld;
uniform sampler2D uLight;
uniform vec2 uCanvas;
uniform vec4 uLightRect;          // 光照栅格在画布像素空间的 (x,y,w,h)
uniform float uDarkSkip;          // ★SW-BJ41：1=以太域零光 α→0（0=恒等,原语义）
varying vec2 vUv;
void main() {
  vec4 w = texture2D(uWorld, vUv);
  // vUv 是画布归一化坐标;光照纹理按其覆盖矩形线性映射,
  // 矩形外取边缘色(CLAMP,= 2D drawImage 边缘复制同款)
  vec2 px = vUv * uCanvas;
  vec2 lu = (px - uLightRect.xy) / uLightRect.zw;
  lu = clamp(lu, vec2(0.0), vec2(1.0));
  vec3 l = texture2D(uLight, lu).rgb;
  // ★SW-BJ41 2026-09-09：以太域零光跳过（Main.DrawBlack :58831 shimmerAlpha==1f
  //   早退 + TileDrawing.cs:1053/WallDrawing.cs:102 零光图格不画）——光照三通道
  //   全零(<1/255)的像素 α 清零,露出其后(主画布)的黑幕+人工星空。mix 对 uDarkSkip=0
  //   恒等,gate=1 保原语义逐位不变
  float gate = mix(1.0, step(1.0 / 255.0, max(max(l.r, l.g), l.b)), uDarkSkip);
  // ★预乘管线(canvas 源):pixelStorei(UNPACK_PREMULTIPLY=true) 上传即预乘 rgb·a,
  //   再乘光 (rgb·a)·l ≡ (rgb·l)·a 输出恰为预乘语义——曾漏设 UNPACK 声明
  //   (默认 false=期望非预乘)而 Chrome/Mac 对 canvas 源保持预乘直拷,shader 又
  //   手动 ×a → 半透明像素 α² 双重变暗(史莱姆 0.58²≈42% 暗化,2026-08-20 实测)
  gl_FragColor = vec4(w.rgb * l, w.a * gate);
}`;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.init();
  }

  /** 释放(丢上下文即可,canvas 随 GC) */
  dispose(): void {
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null;
    this.prog = null;
  }

  private init(): void {
    const gl = (this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,
    }) || this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,
    })) as WebGLRenderingContext | null;
    if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
    // 软件渲染器(SwiftShader/llvmpipe 等)判不可用:上下文能建但全屏双纹理
    // 采样每帧毫秒级,劣于 2D 三步回退——直接走 unavailable 让消费方回退 2D
    // (--disable-gpu 全域软渲染实测场景,2026-08-20)
    try {
      const renderer = String(gl.getParameter(gl.RENDERER) ?? '');
      if (/swiftshader|software|llvmpipe|basic render/i.test(renderer)) {
        this.unavailable = true; this.diedAt = performance.now();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return;
      }
    } catch { /* RENDERER 查询失败按硬件处理 */ }
    this.gl = gl;
    // ★IIIII248:DOM 源带源矩形的 texSubImage2D 重载仅 WebGL2 提供(WebGL1 规范
    //  无此签名,调用会 TypeError)——按实际上下文域分派
    this._isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[GLWorldLight] shader 编译失败:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, GLWorldLight.VERT);
    const fs = compile(gl.FRAGMENT_SHADER, GLWorldLight.FRAG);
    if (!vs || !fs) { this.unavailable = true; this.diedAt = performance.now(); return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLWorldLight] program 链接失败:', gl.getProgramInfoLog(prog));
      this.unavailable = true; this.diedAt = performance.now(); return;
    }
    this.prog = prog;
    for (const n of ['uCanvas', 'uWorld', 'uLight', 'uLightRect', 'uDarkSkip']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }
    // 单位 quad(三角带 4 顶点)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.texWorld = gl.createTexture();
    this.texLight = gl.createTexture();
    for (const t of [this.texWorld, this.texLight]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    gl.disable(gl.BLEND);   // 单 quad 直写,无需混合
    registerFence('worldLight', gl);   // #perf-gpulog
  }

  /** 整幅刷新优化(#perf-gpulog,gptlog2 定量):world/light 同尺寸场景纹理每帧整幅重传——
   *  首次/尺寸变化才走 texImage2D(隐式重分配),此后 texSubImage2D 数据区直刷,
   *  规避驱动逐帧 realloc/错排路径(弱 iGPU 上该路径是 CPU→GPU 复制的主要开销项)。
   *  账本语义:上传记实际带宽;仅 key 变化时补记一笔 新分配(隐式 realloc)。
   *  ★IIIII248:light 纹理支持脏行带上传(lightDirty=[x,y,w,h] 于 light 画布像素系;
   *  null=零变化跳过上传;undefined=旧全幅路径)。world 纹理无内容级脏迹,恒全幅。 */
  private _texKeyWorld = '';
  private _texKeyLight = '';
  /** WebGL2 通道(webgl2 上下文才有 DOM 源带 src-rect 的 texSubImage2D 重载;
   *  WebGL1 回退全幅——正确性不变,只是少省带宽) */
  private _isGL2 = false;
  /** 每帧合成:world(worldCanvas) × light(lightCanvas @ lightRect 像素矩形) → this.canvas
   *  darkSkip（★SW-BJ41 2026-09-09）：1 = 以太域零光 α→0（shimmerAlpha≥1 时传入）
   *  lightBand（★IIIII248）：light 纹理脏行带 {canvas,y,w,h}——canvas 的 (0,0,w,h)
   *  区已由调用方绘制好本帧带内容(带画布,y=纹理内目标行);null=本帧零变化跳过
   *  上传;缺省 undefined=全幅(兼容旧调用面)。 */
  composite(world: HTMLCanvasElement, light: HTMLCanvasElement, lightRect: readonly [number, number, number, number], darkSkip = 0,
    lightBand?: { canvas: HTMLCanvasElement; y: number; w: number; h: number } | null): boolean {
    const gl = this.gl;
    if (!gl || !this.prog || this.diedAt) return false;
    const w = world.width, h = world.height;
    if (w === 0 || h === 0) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    // 纹理上传(canvas 源;光照小图 LINEAR 上采样 = 原 2D 双线性同款)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texWorld);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // 预乘上传声明:canvas 源内部即预乘,显式 true = 驱动零转换直拷(实现无关)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const kW = `${w}x${h}`;
    const kb = `${light.width}x${light.height}`;
    if (this._texKeyWorld !== kW) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, world);   // 分配式首传/变尺寸重分配
      glStatTexCreate('worldLight', w * h * 4);
      this._texKeyWorld = kW;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, world);
    }
    glStatUpload('worldLight', w * h * 4);   // 带宽恒记(两种路径都发生的真实传输量)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texLight);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // ★IIIII248 光照图脏行带:调用方逐行比对产出带画布(canvas 的 (0,0,w,h) = 本帧
    //  带,y = 纹理内目标行)。纹理与 light 画布由同一脏带对称推进 ⇒ 带外纹素=
    //  带外画布像素恒等,采样结果与全幅上传逐位一致。null=零变化 ⇒ 纹理已是
    //  本帧内容,整段跳过。WebGL2 的 texSubImage2D DOM 源重载为
    //  (target,level,xoff,yoff,w,h,fmt,type,source)——无 srcX/srcY 形态(带内容
    //  由调用方先画进带画布左上角);WebGL1 无宽高形态 → 走全幅回退支。
    if (this._texKeyLight !== kb) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatTexCreate('worldLight', light.width * light.height * 4);
      this._texKeyLight = kb;
      glStatUpload('worldLight', light.width * light.height * 4);
    } else if (lightBand === null) {
      // 零变化:跳过上传(账本零带宽)
    } else if (lightBand !== undefined && this._isGL2) {
      // WebGL2 9 参 DOM 源重载(target,level,xoff,yoff,w,h,fmt,type,source)——
      // 本仓 TS DOM 库版本未收录该重载,松散调用面 + _isGL2 门控(GL1 走全幅回退)
      (gl as unknown as { texSubImage2D: (...a: unknown[]) => void }).texSubImage2D(
        gl.TEXTURE_2D, 0, 0, lightBand.y, lightBand.w, lightBand.h,
        gl.RGBA, gl.UNSIGNED_BYTE, lightBand.canvas);
      glStatUpload('worldLight', lightBand.w * lightBand.h * 4);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, light);
      glStatUpload('worldLight', light.width * light.height * 4);
    }
    gl.uniform1i(this.uni.uWorld, 0);
    gl.uniform1i(this.uni.uLight, 1);
    gl.uniform2f(this.uni.uCanvas, w, h);
    gl.uniform4f(this.uni.uLightRect, lightRect[0], lightRect[1],
      Math.max(1, lightRect[2]), Math.max(1, lightRect[3]));
    gl.uniform1f(this.uni.uDarkSkip, darkSkip);   // ★SW-BJ41：零光 α 门（0=恒等）
    glStatDraw('worldLight', 4);   // #perf-gpulog
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // WebGL 错误哨兵:上下文丢失即判死,调用方回退 2D
    if (gl.isContextLost()) { noteContextLost('worldLight'); this.diedAt = performance.now(); return false; }   // #三开压测批
    return true;
  }
}

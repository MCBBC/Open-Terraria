// 水体"果冻效应"扭曲 GL 合成器（2026-08-21 原版 FilterWaterDistortion 后处理落地）。
//
// 【原版管线考古（Terarria1456，全部带行号）】
// · 滤镜注册：ScreenEffectInitializer.cs:41
//   `Filters.Scene["WaterDistortion"] = new Filter(new WaterShaderData(
//     "FilterWaterDistortion").UseIntensity(1f).UseImage("Images/Misc/noise"),
//     EffectPriority.VeryHigh)` —— pass 名 = "FilterWaterDistortion"（ScreenShader.cso
//   Technique1 第 16 个 pass，obj19，ps_2_0）。
// · 激活与强度：SceneState.cs:129 `ManageSpecialBiomeVisuals("WaterDistortion",
//   Main.WaveQuality > 0)`；强度 :159-173（风/雨/离世界边/地下因子，钳 [0,2.5]——
//   WaterWaves.waterDistortionIntensity 1:1）。
// · 应用点：FilterManager.EndCapture :127-176 —— 滤镜是【全屏后处理】：
//   `filter.Apply(textureSize, sceneSize, sceneOffset); spriteBatch.Draw(t
//   /*=screenTarget1 整个合成场景*/, ...)`（:154-156）。WaterShaderData.Apply
//   (WaterShaderData.cs:362-377) 绑定：UseImage(_distortionTarget, 1)（波场，
//   屏 1/4 分辨率）、UseImage(Main.waterTarget.Texture, 2, PointClamp)（前景水层）、
//   UseTargetPosition/UseImageOffset（相机滚动补偿）。
// · 采样器映射（ScreenShaderData.Apply :159-185 Textures[i+1]）：s0=场景(spriteBatch
//   自带)、s1=noise(Images/Misc/noise 256²)、s2=波场、s3=前景 waterTarget。
// · Main.cs:61748 waterTarget 直画进场景 / :61635 backWaterTarget 直画 —— 水层
//   本体无扭曲；扭曲只发生在 EndCapture 的全屏 pass（场景像素按位移场重采样，
//   权重由前景水层 alpha 门控：水体内部 w=1、水线边缘 |2f(q)| 部分权重、旱地 0）。
//
// 【obj19 位移公式（tools/disasm-fx.mjs 逐指令复原；★负号修饰符三处订正——
//    #26 add r0.zw, r0, -r1 / #29 mad r0.w, r3.z, -c13 / #59 add r0.x, r2.x, -r2.y，
//    与 WaterWaves.sampleDisplace 逐项一致）】
//   pixel   = t0·uScreenResolution + uScreenPosition          (#10-12)
//   n1      = noise(pixel/noiseSize·0.1 + (0, prog·0.04))     (#13-15,#21)
//   n2      = noise(pixel/noiseSize·0.2 − (0, prog·0.04))     (#16-17,#22)
//   grad    = n1.xy − n2.xy                                   (#24-26)
//   h'      = waveR − 0.5（×(1−0.4·waveB)，1456 B≡0）          (#28-29)
//   DISPX   = grad.x·0.1·I                                    (#34)
//   DISPY   = grad.y·0.1·I − clamp(h', −0.3, 0.3)             (#30-33)
//   位移px  = (DISPX·0.1, DISPY)·32·opacity（c14/c5 链；opacity=1）(#39-42)
//   （X 位移只含噪声项且额外 ×0.1 —— 原版涟漪只垂直推，水平 wobble 极弱。）
//
// 【本仓落地形态（Canvas2D 取舍，与 WaterWaves.ts 头注同源）】
// 原版 filter 位移采样【合成后屏幕】；Canvas2D 无屏幕纹理 —— 位移施加在【水体层】
// 上：VanillaLiquidRenderer 把前/背景水 pass 画进离屏 waterCanvas（=原版
// waterTarget/backWaterTarget 语义），本模块按上表位移场重采样后合成回世界层
// （吃光照）。波场 _R 通道以 LUMINANCE 8bit 上传（值域恒 k/256 量化——8bit 编码
// 无损级），noise 一次性上传（REPEAT+LINEAR，256 pow2）。场景 alpha 门控
// （obj19 #55-71 的 |Δα|·|2f+Δα−1| 权重）属"整屏扭"语义，水体层扭曲下不适用，
// 取全权重（WaterWaves.ts 头注既有取舍）。
//
// 合成形态同 GLWorldLight：GL 画布离屏，调用方在原 2D 链同一时序
// `ctx.drawImage(layer.canvas, 0, 0)` 单次合成（身份变换、像素 1:1）。
// GL 不可用/上下文丢失时 composite() 返回 false，调用方回退 2D 分块近似。

export class GLWaterDistortion {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private texWater: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private texWave: WebGLTexture | null = null;
  private texFoot: WebGLTexture | null = null;
  private noiseReady = false;
  private noiseW = 256;
  private noiseH = 256;
  /** 波场 Float32→Uint8 转换暂存（容量只增不减） */
  private waveBytes: Uint8Array | null = null;
  /** 上下文丢失/初始化失败时间戳(0=健在);调用方 5s 退避后可重建 */
  diedAt = 0;
  /** GL 永不可用(WebGL 缺失/shader 失败/软件渲染)——调用方直接走 2D 回退不再重建 */
  unavailable = false;

  private static VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  // ★y 翻转同 GLWorldLight(canvas 2D y 向下;aPos 0..1 直映 clip)
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

  // 位移公式 = WaterWaves.sampleDisplace 的 GLSL 镜像（公式出处见文件头；
  // 测试锁常量：tests/water-warp.test.ts）。
  // ★足迹回退（uFoot，前景 pass 专用）：前景水层不带浸润带（带入前景层会被合成
  //   画在方块贴图之上 = 水蓝盖地形），位移采样落在地形区（层内透明）时回退本像素
  //   原样——前景水色贴地形边界不被位移撕开；水线（空气侧）足迹恒空 → 不回退 →
  //   水线自由升降（原版 filter 的 alpha 差门控语义的水层化近似）。
  static readonly FRAG = `
precision highp float;
uniform sampler2D uWater;
uniform sampler2D uNoise;
uniform sampler2D uWave;
uniform sampler2D uFoot;
uniform float uFootMode;
uniform vec2 uCssSize;
uniform vec2 uNoiseSize;
uniform vec2 uWaveSize;
uniform float uProgress;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  // 屏幕 css px（与 sampleDisplace 的 (world−cam)·cssZoom 同一坐标系）
  vec2 px = vUv * uCssSize;
  vec2 nu = px / uNoiseSize;
  // 双噪声采样：0.1/0.2 双尺度反向 Y 滚动（obj19 #13-22；c1/c2=±prog·0.04）
  vec4 n1 = texture2D(uNoise, vec2(nu.x * 0.1, nu.y * 0.1 + uProgress * 0.04));
  vec4 n2 = texture2D(uNoise, vec2(nu.x * 0.2, nu.y * 0.2 - uProgress * 0.04));
  // 波场高度（obj19 #23-28；uv=px·0.25/网格尺寸 = _readR 的 texel 中心语义，CLAMP）
  float h = texture2D(uWave, px * 0.25 / uWaveSize).x;
  float gx = n1.x - n2.x;
  float gy = n1.y - n2.y;
  float dispx = gx * 0.1 * uIntensity;
  float dispy = gy * 0.1 * uIntensity - clamp(h - 0.5, -0.3, 0.3);
  // 屏幕 css px 位移（c14.x=0.1 / c14.y=1.0 × c5=32·opacity/res × res）
  vec2 disp = vec2(dispx * 0.1, dispy) * 32.0;
  vec2 uvD = vUv + disp / uCssSize;
  vec4 w = texture2D(uWater, uvD);
  if (uFootMode > 0.5 && w.a < 0.02 && texture2D(uFoot, uvD).a > 0.02) {
    w = texture2D(uWater, vUv);
  }
  gl_FragColor = w;
}`;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.init();
  }

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
    // 软件渲染器判不可用（同 GLWorldLight：全屏三纹理采样软渲染毫秒级）
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
        console.warn('[GLWaterDistortion] shader 编译失败:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, GLWaterDistortion.VERT);
    const fs = compile(gl.FRAGMENT_SHADER, GLWaterDistortion.FRAG);
    if (!vs || !fs) { this.unavailable = true; this.diedAt = performance.now(); return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLWaterDistortion] program 链接失败:', gl.getProgramInfoLog(prog));
      this.unavailable = true; this.diedAt = performance.now();
      return;
    }
    this.prog = prog;
    for (const n of ['uCssSize', 'uNoiseSize', 'uWaveSize', 'uProgress', 'uIntensity',
      'uWater', 'uNoise', 'uWave', 'uFoot', 'uFootMode']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.texWater = gl.createTexture();
    this.texNoise = gl.createTexture();
    this.texWave = gl.createTexture();
    this.texFoot = gl.createTexture();
    // 水层：CLAMP（越界 = 边缘重复，原版 PointClamp 同款边界语义）
    gl.bindTexture(gl.TEXTURE_2D, this.texWater);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // noise：256 pow2 → REPEAT 合法（LinearWrap，ScreenShaderData.cs:175-178 同款）
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 波场：非 pow2（屏/4）→ CLAMP + LINEAR（= _readR 的 clamp+双线性）
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // 足迹纹理（CLAMP + LINEAR，采样落空回退判定）
    gl.bindTexture(gl.TEXTURE_2D, this.texFoot);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.disable(gl.BLEND);
  }

  /** noise 一次性上传（重复调用幂等；源不变则 no-op——重制素材包换图须重建实例） */
  private ensureNoise(noise: TexImageSource | null): boolean {
    const gl = this.gl!;
    if (this.noiseReady) return true;
    if (!noise) return false;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texNoise);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    const [w, h] = texDims(noise);
    if (w > 0) { this.noiseW = w; this.noiseH = h; }
    this.noiseReady = true;
    return true;
  }

  /** 波场 _R → LUMINANCE 8bit（值恒 k/256 量化，×255 编码误差 ≤1/510 ≈ 半个量化步） */
  private uploadWave(waveR: Float32Array, w: number, h: number): void {
    const gl = this.gl!;
    const n = w * h;
    if (!this.waveBytes || this.waveBytes.length !== n) this.waveBytes = new Uint8Array(n);
    const bytes = this.waveBytes;
    for (let i = 0; i < n; i++) {
      const v = waveR[i] * 255 + 0.5;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
  }

  /**
   * 每帧合成：water（离屏水层，设备像素）按位移场重采样 → this.canvas。
   * cssW/cssH = 位移场坐标系（模拟系 CSS px）；progress/intensity = waterWaves 公开态；
   * waveR/gridW/gridH = 波场（readGridR/gridW/gridH）。失败返回 false（调用方走 2D 回退）。
   */
  composite(
    water: HTMLCanvasElement, noise: TexImageSource | null,
    cssW: number, cssH: number, progress: number, intensity: number,
    waveR: Float32Array, gridW: number, gridH: number,
    foot: HTMLCanvasElement | null = null,
  ): boolean {
    const gl = this.gl;
    if (!gl || !this.prog || this.diedAt) return false;
    const w = water.width, h = water.height;
    if (w === 0 || h === 0 || gridW <= 0 || gridH <= 0) return false;
    if (!this.ensureNoise(noise)) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    // 水层上传（canvas 源预乘直拷——同 GLWorldLight 的 UNPACK 声明教训）
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texWater);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, water);
    this.uploadWave(waveR, gridW, gridH);
    gl.uniform1i(this.uni.uWater, 0);
    gl.uniform1i(this.uni.uNoise, 1);
    gl.uniform1i(this.uni.uWave, 2);
    // 足迹纹理（前景 pass：uFoot=背景水层；null = 关回退）
    if (foot && foot.width > 0 && foot.height > 0) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.texFoot);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, foot);
      gl.uniform1i(this.uni.uFoot, 3);
      gl.uniform1f(this.uni.uFootMode, 1);
    } else {
      gl.uniform1f(this.uni.uFootMode, 0);
    }
    gl.uniform2f(this.uni.uCssSize, cssW, cssH);
    gl.uniform2f(this.uni.uNoiseSize, this.noiseW, this.noiseH);
    gl.uniform2f(this.uni.uWaveSize, gridW, gridH);
    gl.uniform1f(this.uni.uProgress, progress);
    gl.uniform1f(this.uni.uIntensity, intensity);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (gl.isContextLost()) { this.diedAt = performance.now(); return false; }
    return true;
  }
}

/** TexImageSource 尺寸（ImageBitmap/HTMLImageElement 通用） */
function texDims(t: TexImageSource): [number, number] {
  const b = t as ImageBitmap;
  if (typeof b.width === 'number' && b.width > 0) return [b.width, b.height];
  const im = t as HTMLImageElement;
  return [im.naturalWidth || 0, im.naturalHeight || 0];
}

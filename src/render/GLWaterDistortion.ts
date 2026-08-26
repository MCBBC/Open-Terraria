// 水体扭曲全屏 GL 合成器（2026-08-22 原版 FilterWaterDistortion 完整落地）。
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
//   /*=screenTarget1 整个合成场景（含光照）*/, ...)`（:154-156）。WaterShaderData.Apply
//   (WaterShaderData.cs:362-377) 绑定：UseImage(_distortionTarget, 1)（波场，
//   屏 1/4 分辨率）、UseImage(Main.waterTarget.Texture, 2, PointClamp)（前景水层）、
//   UseTargetPosition/UseImageOffset（相机滚动补偿）。
// · 采样器映射（ScreenShaderData.Apply :159-185 Textures[i+1]）：s0=场景(spriteBatch
//   自带)、s1=noise(Images/Misc/noise 256²)、s2=波场、s3=前景 waterTarget。
// · ★水体本体不扭：Main.cs:61748 waterTarget 直画进场景 / :61635 backWaterTarget
//   直画 —— 扭曲只发生在 EndCapture 的全屏 pass（场景像素按位移场重采样）。
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
// 【obj19 #55-71 alpha 门控（2026-08-22 逐指令复原——水下整屏扭曲的本体）】
//   aD  = min(100·waterAlpha(位移后UV), 1)     # s3 前景水层（×100 = α>0.01 即饱和）
//   aU  = min(100·waterAlpha(原始UV), 1)
//   Δα  = aD − aU
//   f   = min(100·(aD + aU), 1)                 # 水体存在门
//   w   = smoothstep((DISPY·c5.y + 0.001)·500)  # c5.y=32/res.y → x = DISPY·16000/res.y+0.5
//   gate= f · (1 − |Δα|·(1 − |2w+Δα−1|))
//   out = lerp(scene(uv), scene(uvD), gate)     # #74 lrp
//   语义：水体内部 Δα=0、f=1 → gate=1 → 整屏全量扭曲（水下一切随噪声场+波场晃动，
//   即"水下热浪式扭曲"）；旱地 f=0 → gate=0；水线边缘 Δα 大 → 带状权重 = 果冻。
//   w 项在 |DISPY·32| > 0.8px（res 800）即饱和为方向门（0/1）——只参与边缘带调制。
//   ★登记偏差：XNA lrp 对超界权重外推；本实现把 x/gate 钳 [0,1]（饱和区行为
//   一致，避免负权重外推花屏）。
//
// 【本仓落地形态】
// 输入 = 带光照的完整世界层（GLWorldLight 输出画布，=原版 screenTarget 语义）+
// 前景水离屏（waterTarget，alpha 门控纹理）。调用方在 compositeLight 的 GL 路径
// 里以本模块输出替换直画。GL 不可用/上下文丢失时 composite() 返回 false，调用方
// 原样直画（无扭曲——CPU 渲染/低端机自动降级，同 ?wwarp=0 逃生门）。

export class GLWaterDistortion {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private texScene: WebGLTexture | null = null;
  private texWater: WebGLTexture | null = null;
  private texNoise: WebGLTexture | null = null;
  private texWave: WebGLTexture | null = null;
  private noiseReady = false;
  private noiseW = 256;
  private noiseH = 256;
  /** 波场 Float32→Uint8 转换暂存（容量只增不减） */
  private waveBytes: Uint8Array | null = null;
  /** 上下文丢失/初始化失败时间戳(0=健在);调用方 5s 退避后可重建 */
  diedAt = 0;
  /** GL 永不可用(WebGL 缺失/shader 失败/软件渲染)——调用方直接原样直画不再重建 */
  unavailable = false;

  private static VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos;
  // ★y 翻转同 GLWorldLight(canvas 2D y 向下;aPos 0..1 直映 clip)
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

  // 位移公式 = WaterWaves.sampleDisplace 的 GLSL 镜像 + obj19 #55-71 门控（公式出处
  // 见文件头；测试锁常量：tests/water-warp.test.ts）。
  // 场景纹理 = 带光照世界层（预乘 α 画布直拷）；输出 = mix(原样, 位移后, gate)
  // ——预乘色插值仍预乘，drawImage 合成回主画布语义不变。
  static readonly FRAG = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uNoise;
uniform sampler2D uWave;
uniform sampler2D uWater;
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
  // 梯度 = n1.xy − n2.xy（#26 负号修饰符）。★经验定版（2026-08-25 用户对照
  //  原版观感校准）：反汇编 swizzle 级解码在此 shader 上多义（c5=uOpacity 常量
  //  依赖链），以用户观感为准
  float gx = n1.x - n2.x;
  float gy = n1.y - n2.y;
  float dispx = gx * 0.1 * uIntensity;
  float dispy = gy * 0.1 * uIntensity - clamp(h - 0.5, -0.3, 0.3);
  // 屏幕 css px 位移（c14.x=0.1 / c14.y=1.0 × c5=32·opacity/res × res）。
  // ★0.1 因子对噪声/波场两项都生效（:73 'mul r1.xy, r2, c14' 在 DISPX/DISPY 合成后
  //  统一 ×0.1；c5=uOpacity=32/res 符号表实证）——曾漏乘波场项 → 波场位移 ±9.6px
  //  = 原版 ±0.96px 的 10 倍（2026-08-25 反汇编订正，用户问"原版为何不需增益"追出）
  vec2 disp = vec2(dispx * 0.1, dispy) * 32.0;
  vec2 uvD = vUv + disp / uCssSize;
  // ---- obj19 #55-71 alpha 门控 ----
  float aD = min(texture2D(uWater, uvD).a * 100.0, 1.0);
  float aU = min(texture2D(uWater, vUv).a * 100.0, 1.0);
  float dA = aD - aU;
  float f = min((aD + aU) * 100.0, 1.0);
  // w = smoothstep((DISPY·c5.y+0.001)·500)，c5.y=32/res.y → x = dispy·16000/res.y + 0.5
  float x = clamp(dispy * 16000.0 / uCssSize.y + 0.5, 0.0, 1.0);
  float w = x * x * (3.0 - 2.0 * x);
  float gate = clamp(f * (1.0 - abs(dA) * (1.0 - abs(2.0 * w + dA - 1.0))), 0.0, 1.0);
  gl_FragColor = mix(texture2D(uScene, vUv), texture2D(uScene, uvD), gate);
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
    // 软件渲染器判不可用（同 GLWorldLight：全屏四纹理采样软渲染毫秒级）
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
      'uScene', 'uNoise', 'uWave', 'uWater']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.texScene = gl.createTexture();
    this.texWater = gl.createTexture();
    this.texNoise = gl.createTexture();
    this.texWave = gl.createTexture();
    // 场景/水层：CLAMP（越界 = 边缘重复，原版 PointClamp 同款边界语义）
    for (const t of [this.texScene, this.texWater]) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
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
    // ?wamp=N 波形偏差增益（默认 2=2026-08-25 用户对照原版观感校准"非常接近原版"；
    // ?wamp=1=原样直通，诊断用）
    const amp = (() => { try { return Number(new URLSearchParams(location.search).get('wamp')) || 2; } catch { return 2; } })();
    for (let i = 0; i < n; i++) {
      const v = ((waveR[i] - 0.5) * amp + 0.5) * 255 + 0.5;
      bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texWave);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // ★LUMINANCE 每像素 1 字节,默认 UNPACK_ALIGNMENT=4 要求行 4 字节对齐——
    //   波场宽非 4 倍数时驱动期望带填充的 buffer > 实际 → INVALID_OPERATION:
    //   "ArrayBufferView not big enough"(每帧刷屏,2026-08-21 用户实报)。
    //   对齐 1 = 紧密排列,与 bytes 长度 w*h 精确匹配
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
  }

  /**
   * 每帧全屏合成：scene（带光照世界层，设备像素）按位移场重采样、前景水 alpha
   * 门控 → this.canvas。water = 前景水离屏（waterTarget 门控纹理；null = 无水帧，
   * 门控恒 0 = 原样直通）。cssW/cssH = 位移场坐标系（模拟系 CSS px）；
   * progress/intensity = waterWaves 公开态；waveR/gridW/gridH = 波场。
   * 失败返回 false（调用方原样直画）。
   */
  composite(
    scene: HTMLCanvasElement, water: HTMLCanvasElement | null,
    noise: TexImageSource | null,
    cssW: number, cssH: number, progress: number, intensity: number,
    waveR: Float32Array, gridW: number, gridH: number,
  ): boolean {
    const gl = this.gl;
    if (!gl || !this.prog || this.diedAt) return false;
    const w = scene.width, h = scene.height;
    if (w === 0 || h === 0 || gridW <= 0 || gridH <= 0) return false;
    if (!this.ensureNoise(noise)) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    // 画布源预乘直拷（canvas 2D 产出一律预乘——UNPACK 声明教训同 GLWorldLight）
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    // 前景水门控纹理（α 参与门控；预乘不影响 α 通道）
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texWater);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (water && water.width > 0 && water.height > 0) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, water);
    } else {
      // 无水帧：1×1 透明纹理 = 门控恒 0 = 原样直通
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]));
    }
    this.uploadWave(waveR, gridW, gridH);
    gl.uniform1i(this.uni.uScene, 0);
    gl.uniform1i(this.uni.uNoise, 1);
    gl.uniform1i(this.uni.uWave, 2);
    gl.uniform1i(this.uni.uWater, 3);
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

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
import type { DrawRect } from '../assets/SpriteAtlas';

export interface QuadOpts {
  alpha?: number;                                    // 整体透明度(默认 1)
  tint?: readonly [number, number, number] | null;   // RGB 乘法(默认无)
  rot?: number;                                      // 弧度,绕 dst 中心
  smooth?: boolean;                                  // 采样过滤(默认 true=2D 默认平滑开)
}

interface TexEntry { tex: WebGLTexture; w: number; h: number; stamp: number }

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
  gl_Position = vec4(screen / uCanvas * 2.0 - 1.0, 0.0, 1.0);
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
  float a = c.a * uAlpha;
  outColor = vec4(c.rgb * uTint * a, a);             // 预乘输出
}`;

export class GLSpriteLayer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject | null = null;
  private samp: { nearest: WebGLSampler | null; linear: WebGLSampler | null; repeat: WebGLSampler | null };
  private texs = new Map<string, TexEntry>();
  private stamp = 0;
  /** 纹理缓存上限(LRU;超限驱逐最久未用) */
  static MAX_TEXTURES = 96;
  /** GL 不可用(WebGL2 缺失/初始化失败)时置 true,调用方回退 2D 路径 */
  unavailable = false;
  /** 设备最大纹理边长(大世界整幅 8400 超限的 GPU 走 2D 回退,防静默花屏) */
  get maxTextureSize(): number {
    return this.gl ? this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number : 0;
  }

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.samp = { nearest: null, linear: null, repeat: null };
    this.init();
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,   // 离屏合成:drawImage 时缓冲必须仍在
    }) as WebGL2RenderingContext | null;
    if (!gl) { this.unavailable = true; return; }
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
    if (!vs || !fs) { this.unavailable = true; return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[GLSpriteLayer] program 链接失败:', gl.getProgramInfoLog(prog));
      this.unavailable = true;
      return;
    }
    this.prog = prog;
    for (const n of ['uCanvas', 'uSrc', 'uDst', 'uRot', 'uTex', 'uAlpha', 'uTint']) {
      this.uni[n] = gl.getUniformLocation(prog, n);
    }
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
    const mkSampler = (filter: number, wrapS: number): WebGLSampler => {
      const s = gl.createSampler()!;
      gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, filter);
      gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, filter);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, wrapS);
      gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return s;
    };
    this.samp.nearest = mkSampler(gl.NEAREST, gl.CLAMP_TO_EDGE);
    this.samp.linear = mkSampler(gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.samp.repeat = mkSampler(gl.LINEAR, gl.REPEAT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** 画布尺寸(与主画布同尺寸;DPR 内部像素) */
  resize(w: number, h: number): void {
    if (this.unavailable) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** 帧开始:清透明(不透明底用 fillQuad 铺) */
  begin(): void {
    if (this.unavailable || !this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform2f(this.uni.uCanvas, this.canvas.width, this.canvas.height);
    gl.uniform1i(this.uni.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
  }

  /** 帧结束(离屏画布交给调用方 drawImage) */
  end(): void {
    if (this.unavailable || !this.gl) return;
    this.gl.bindVertexArray(null);
  }

  /** 图片源(ImageBitmap/Image/canvas)入纹理;repeatX=true 时横向 REPEAT */
  texFromImage(key: string, img: TexImageSource, repeatX = false): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (hit) { hit.stamp = ++this.stamp; return hit; }
    const gl = this.gl;
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    if (!w || !h) return null;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const entry: TexEntry = { tex, w, h, stamp: ++this.stamp };
    this.texs.set(key, entry);
    this.evictLRU(key);
    return entry;
  }

  /** 子区增量上传(小地图 dirtyChunks;画布/位图源,纹理须已存在) */
  texSubUpdate(key: string, src: TexImageSource, x: number, y: number, w: number, h: number): void {
    if (this.unavailable || !this.gl) return;
    const e = this.texs.get(key);
    if (!e) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.bindTexture(gl.TEXTURE_2D, null);
    e.stamp = ++this.stamp;
  }

  /** SpriteAtlas DrawRect 便捷入口 */
  drawRect(rect: DrawRect, dx: number, dy: number, dw: number, dh: number, opts?: QuadOpts): void {
    if (this.unavailable) return;
    const tag = (rect.img as HTMLImageElement).src ?? (rect.img as HTMLCanvasElement).toDataURL?.().length ?? 'cv';
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
    gl.bindSampler(0, (opts?.smooth ?? true) ? this.samp.linear! : this.samp.nearest!);
    const px = 0.5 / e.w, py = 0.5 / e.h;
    const u0 = (sx + px) / e.w, v0 = (sy + py) / e.h;
    const u1 = (sx + sw - px) / e.w, v1 = (sy + sh - py) / e.h;
    gl.uniform4f(this.uni.uSrc, u0, v0, u1 - u0, v1 - v0);
    this.setCommon(dx, dy, dw, dh, opts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    gl.bindSampler(0, this.samp.repeat!);
    const px = 0.5 / e.w, py = 0.5 / e.h;
    const u0 = (sx + px) / e.w, v0 = (sy + py) / e.h;
    const span = ((sx + sw - px) - (sx + px)) / e.w * (totalW / dw);
    gl.uniform4f(this.uni.uSrc, u0, v0, span, ((sy + sh - py) - (sy + py)) / e.h);
    this.setCommon(dx, dy, totalW, dh, opts);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

  private evictLRU(keepKey: string): void {
    if (!this.gl) return;
    while (this.texs.size > GLSpriteLayer.MAX_TEXTURES) {
      let oldest: string | null = null;
      let min = Infinity;
      for (const [k, e] of this.texs) if (e.stamp < min && k !== keepKey && k !== '__white') { min = e.stamp; oldest = k; }
      if (!oldest) break;
      const dead = this.texs.get(oldest)!;
      this.texs.delete(oldest);
      this.gl.deleteTexture(dead.tex);
    }
  }

  /** 全量释放(切世界/长期不用) */
  dispose(): void {
    if (!this.gl) return;
    for (const [, e] of this.texs) this.gl.deleteTexture(e.tex);
    this.texs.clear();
    this.canvas.width = 0;
    this.canvas.height = 0;
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

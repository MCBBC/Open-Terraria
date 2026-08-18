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
import { texId } from './texId';

export interface QuadOpts {
  alpha?: number;                                    // 整体透明度(默认 1)
  tint?: readonly [number, number, number] | null;   // RGB 乘法(默认无)
  rot?: number;                                      // 弧度,绕 dst 中心
  smooth?: boolean;                                  // 采样过滤(默认 true=2D 默认平滑开)
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
  /** 字节预算(★2026-08-18:曾按条数 96 限额——96 张多 MB 纹理+mip 链可达 GB 级,
   *  叠在画布预算之上 = GPU 打爆→contextlost 风暴 26 万次;改按字节) */
  static MAX_BYTES = 192 * 1024 * 1024;
  private bytes = 0;
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
    // ★初始化失败也记 diedAt(2026-08-19 哨兵三捕真凶):消费方退避判
    // now-diedAt>5000,diedAt=0 时恒真 = 每帧重建(playsoft --disable-gpu 下
    // WebGL2 必失败 → 60 张/秒 createElement 风暴,暂停中也持续)
    if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
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
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // ★自愈钩子(2026-08-18 双开"关掉另一窗口也恢复不了"根因):GL 上下文
    // 丢失后【不会自恢复】(2D 会),曾无人监听=永远持有死上下文,背景层
    // 全空且不再重试。死亡即标 unavailable,消费方丢弃实例走 2D 兜底,
    // 退避期后重建新实例
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();               // 保留恢复资格(部分驱动可自动恢复)
      this.unavailable = true;
      this.diedAt = performance.now();
      console.warn('[GLSpriteLayer] GL 上下文丢失——标记不可用,消费方回退 2D,5s 后允许重建');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      // 内容(纹理/程序)已全部蒸发:仍按死亡处理,由消费方整体重建更干净
      this.unavailable = true;
      this.diedAt = performance.now();
    });
  }
  /** 上下文死亡时刻(重建退避用;0=未死) */
  diedAt = 0;

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

  /** 图片源(ImageBitmap/Image/canvas)入纹理;repeatX 横向 REPEAT;
   *  noMip=跳过 mip 链(超大纹理/恒放大或 NEAREST 采样的贴图:小地图/迷雾——
   *  8400×2400 的 mip 重生成是巨量 GPU churn,且它只在 zoom≥1 放大或 NEAREST
   *  下采样时被采样,MIN/mip 永不生效) */
  texFromImage(key: string, img: TexImageSource, repeatX = false, noMip = false): TexEntry | null {
    if (this.unavailable || !this.gl) return null;
    const hit = this.texs.get(key);
    if (hit) { hit.stamp = ++this.stamp; return hit; }
    const gl = this.gl;
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    if (!w || !h) return null;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // ★预乘上传:mip 层平均的是预乘像素(能量正确)——直 Alpha 会让 mip 把
    // 透明像素的 RGB(黑)混进边缘 = 软边缘发暗(对拍实锤树冠边缘差异)。
    // shader 侧公式无需变:out.rgb = premul×tint×uAlpha 恰等于 straight×tint×a
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
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
    const sc = this.scratch.getContext('2d')!;
    sc.clearRect(0, 0, w, h);
    sc.drawImage(src as CanvasImageSource, x, y, w, h, 0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);   // 同 texFromImage:预乘+mip 能量正确
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch);
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
    while (this.bytes > GLSpriteLayer.MAX_BYTES) {
      let oldest: string | null = null;
      let min = Infinity;
      for (const [k, e] of this.texs) if (e.stamp < min && k !== keepKey && k !== '__white') { min = e.stamp; oldest = k; }
      if (!oldest) break;
      const dead = this.texs.get(oldest)!;
      this.texs.delete(oldest);
      this.bytes -= dead.bytes;
      this.gl.deleteTexture(dead.tex);
    }
  }

  /** 全量释放(切世界/读档——★曾漏挂此链:连续读档逐次叠满 LRU=GB 级显存
   *  打爆 → contextlost 风暴 26 万次,tab 3.4GB 用户实报 2026-08-18) */
  dispose(): void {
    if (!this.gl) return;
    for (const [, e] of this.texs) this.gl.deleteTexture(e.tex);
    this.texs.clear();
    this.bytes = 0;
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

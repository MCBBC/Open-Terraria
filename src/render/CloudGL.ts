// 云层 GL 渲染器(WebGL2 逐精灵批绘,2026-08-18)。
//
// 为什么:Canvas 2D 的 drawImage 没有颜色参数——云染(cloudTint 预烘焙副本+
// 量化色键+LRU 池)整套是给这个缺失打的补丁;GL 的 fragment 一行
// texColor × vColor 就是原版 spritebatch.Draw(tex, …, Color) 的语义:
// 精确色(量化近似消失)、零副本(24+8 张画布 → 1 张 GL 画布 + ~4 张纹理)。
// 这也是渲染器 v2(逐精灵 GL 批绘)的最小先行试验田。
//
// 结构:一张视口大小离屏 GL 画布,同一帧【两次】复用(远云在 sky.draw 内、
// 近云在 biomeBg 之后——两 pass 帧序位置不同,但缓冲可以在两次合成间 clear
// 重用):beginPass() → quad()×N → endPass(ctx2d)(flush + drawImage 进主画布)。
//
// 稳定性(与 GLSpriteLayer 同款纪律):
//  · webglcontextlost → unavailable + diedAt,消费方(SkyRenderer)回退 2D
//    cloudTint 路径(该路径已修好行为良好);5s 退避后重建;
//  · cpuRender / ?cloudgl=0 → 消费方根本不启用;
//  · 纹理恒定(云五族 ~41 槽,实载几张)——无字节 LRU 需求。
// 预乘一致性:纹理预乘上传,顶点色在 CPU 侧预乘(rgb×a),fragment 直乘,
// blend(ONE, ONE_MINUS_SRC_ALPHA) —— 与 2D 路径(multiply 烘焙×globalAlpha)
// 逐像素等价(见 _cloudaudit/对拍探针)。
export class CloudGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private texs = new Map<string, { tex: WebGLTexture; w: number; h: number }>();
  /** 动态顶点缓冲:每顶点 8 float(x,y,u,v,r,g,b,a);容量按需翻倍 */
  private verts = new Float32Array(8 * 6 * 64);
  private nVerts = 0;
  private curTex: WebGLTexture | null = null;
  /** GL 不可用/已死:消费方回退 2D */
  unavailable = false;
  diedAt = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 0; this.canvas.height = 0;
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: true,   // 离屏合成:drawImage 时缓冲必须仍在
    }) as WebGL2RenderingContext | null;
    if (!gl) { this.unavailable = true; return; }
    this.gl = gl;
    const VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aCol;
uniform vec2 uCanvas;
out vec2 vUV; out vec4 vCol;
void main() {
  // 画布像素坐标 → GL 裁剪(y 翻转,与 GLSpriteLayer 同款)
  vec2 c = aPos / uCanvas * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  vUV = aUV; vCol = aCol;
}`;
    const FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
in vec2 vUV; in vec4 vCol;
out vec4 o;
void main() {
  vec4 t = texture(uTex, vUV);
  o = t * vCol;   // 预乘纹理 × 预乘顶点色 = 原版 Draw(Color) 语义
}`;
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[CloudGL] shader 编译失败:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { this.unavailable = true; return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[CloudGL] program 链接失败:', gl.getProgramInfoLog(prog));
      this.unavailable = true; return;
    }
    this.prog = prog;
    this.uni.uCanvas = gl.getUniformLocation(prog, 'uCanvas');
    this.uni.uTex = gl.getUniformLocation(prog, 'uTex');
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
    const STRIDE = 8 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);       // pos
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 2 * 4);   // uv
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE, 4 * 4);   // color
    gl.bindVertexArray(null);
    this.vao = vao; this.vbo = vbo;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // 上下文死亡钩子(★restore 也按死亡处理:纹理/程序已蒸发,整体重建)
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.unavailable = true; this.diedAt = performance.now();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.unavailable = true; this.diedAt = performance.now();
    });
  }

  resize(w: number, h: number): void {
    if (this.unavailable) return;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  /** 取/上传纹理(按 key 缓存;预乘 + mipmap,LINEAR 过滤 = 软边云等价) */
  texFor(key: string, img: TexImageSource & { width: number; height: number }): WebGLTexture | null {
    const gl = this.gl;
    if (!gl || this.unavailable) return null;
    let e = this.texs.get(key);
    if (!e) {
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      e = { tex, w: img.width, h: img.height };
      this.texs.set(key, e);
    }
    return e.tex;
  }

  /** 上一 pass 的 quad 数(探针/调试:游戏内 GL 云路径是否真的在画) */
  quadsLastPass = 0;
  private quadsThisPass = 0;

  beginPass(): void {
    const gl = this.gl;
    if (!gl || this.unavailable) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.nVerts = 0;
    this.curTex = null;
    this.quadsThisPass = 0;
  }

  /** 追加一朵云的 quad(画布像素坐标系;中心+半宽高+旋转+水平翻转)。
   *  color 为【直色】(0..1 rgb + alpha)——内部 CPU 预乘。纹理切换时自动 flush。 */
  quad(tex: WebGLTexture, cx: number, cy: number, hw: number, hh: number,
    rot: number, flip: boolean, r: number, g: number, b: number, a: number): void {
    if (tex !== this.curTex) { this.flush(); this.curTex = tex; }
    this.quadsThisPass++;
    if (this.nVerts + 6 > this.verts.length / 8) {
      const grown = new Float32Array(this.verts.length * 2);
      grown.set(this.verts); this.verts = grown;
      this.gl?.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
      this.gl?.bufferData(this.gl.ARRAY_BUFFER, this.verts.byteLength, this.gl.DYNAMIC_DRAW);
    }
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const px = (lx: number, ly: number): [number, number] =>
      [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    const pa = Math.min(1, Math.max(0, a));
    const R = r * pa, G = g * pa, B = b * pa;   // CPU 预乘
    // 四角(画布 y 向下)与 UV(flip = 镜像 u)
    const [x0, y0] = px(-hw, -hh), [x1, y1] = px(hw, -hh), [x2, y2] = px(-hw, hh), [x3, y3] = px(hw, hh);
    const u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
    const put = (x: number, y: number, u: number, v: number) => {
      const o = this.nVerts * 8;
      this.verts[o] = x; this.verts[o + 1] = y; this.verts[o + 2] = u; this.verts[o + 3] = v;
      this.verts[o + 4] = R; this.verts[o + 5] = G; this.verts[o + 6] = B; this.verts[o + 7] = pa;
      this.nVerts++;
    };
    put(x0, y0, u0, 0); put(x1, y1, u1, 0); put(x2, y2, u0, 1);
    put(x1, y1, u1, 0); put(x3, y3, u1, 1); put(x2, y2, u0, 1);
  }

  private flush(): void {
    const gl = this.gl;
    if (!gl || this.nVerts === 0 || !this.curTex) { this.nVerts = 0; return; }
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts.subarray(0, this.nVerts * 8));
    gl.uniform2f(this.uni.uCanvas, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.curTex);
    gl.uniform1i(this.uni.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.nVerts);
    this.nVerts = 0;
  }

  /** pass 收尾:flush + 合成进主 2D 画布(同帧同任务内 drawImage,
   *  preserveDrawingBuffer 保缓冲——GLSpriteLayer 同款模式) */
  endPass(ctx: CanvasRenderingContext2D): void {
    if (this.unavailable || this.canvas.width === 0) return;
    this.flush();
    this.curTex = null;
    this.quadsLastPass = this.quadsThisPass;
    ctx.drawImage(this.canvas, 0, 0);
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      // 已丢失的上下文上 delete 会打 INVALID_OPERATION 噪声(对象可能已不属于
      // 恢复后的上下文实例;2026-08-19 双开风暴 console 刷屏)——直接跳过,
      // 上下文死亡时驱动侧资源已全部蒸发
      if (!gl.isContextLost()) {
        for (const e of this.texs.values()) gl.deleteTexture(e.tex);
        if (this.vbo) gl.deleteBuffer(this.vbo);
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.prog) gl.deleteProgram(this.prog);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      this.texs.clear();
    }
    this.canvas.width = 0; this.canvas.height = 0;
    this.gl = null; this.prog = null; this.vao = null; this.vbo = null;
  }
}

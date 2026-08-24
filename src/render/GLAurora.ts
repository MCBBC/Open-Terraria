// 极光 WebGL2 渲染器——照 GLSpriteLayer 模式(自建 canvas + WebGL2 上下文)。
// Aurora pixel shader 反编译 → GLSL(SM2 字节码逐步码 1:1,fxPixel.txt pass Aurora
//  :3109-3172;噪声 UV :3132-3144、强度链 :3145-3167、preshader :3174-3179)。
// 噪声贴图 Extra_286/287 → R8 纹理 LinearWrap(源即 8bit R 通道,R8 与 CPU 侧
//  Float32(k/255) 数值等价;R32F 的线性过滤需 OES_texture_float_linear 扩展,
//  缺失时纹理不完整→采样恒 0→极光整片消失,故不用)。
// 混合 = gl.ONE/gl.ONE additive(shader oC0.a≡0 :3170 + FNA AlphaBlend 等效,
//  黑像素=零贡献)。
// 分带:specificData.Y 逐带不同(AuroraSky.auroraSpecificData)——beginFrame 清屏
//  一次,每带一次 drawBand(带间在同一帧缓冲内加法累积);调用方最后 blit×2
//  (PrepareIndices includeBacksides + CullNone 双画等效)。
const VERT = `#version 300 es
layout(location=0) in vec2 aPos;      // 屏空间像素坐标
layout(location=1) in vec3 aUV;       // (u=沿带参数, grad=竖向0顶1底, d=参考厚度)
layout(location=2) in vec3 aColor;    // 顶点色(Color×num28 byte 截断 /255)
uniform vec2 uResolution;
out vec3 vColor;
out vec3 vUV;
void main() {
    vec2 clip = aPos / uResolution * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    vColor = aColor;
    vUV = aUV;
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uNoiseA;   // Extra_286 256²
uniform sampler2D uNoiseB;   // Extra_287 128²
uniform float uTime;         // Main.GlobalTimeWrappedHourly(MiscShaderData.Apply :91)
uniform vec4 uSD;            // UseShaderSpecificData(.x 亮度乘门 .y 分带竖参;Z/W 字节码不读)
in vec3 vColor;
in vec3 vUV;
out vec4 fragColor;
void main() {
    float u = vUV.x;
    float grad = vUV.y;
    float sdX = uSD.x;
    float sdY = uSD.y;
    // preshader :3174-3179:T = 2·uTime + sd.y;c0..c3 = ∓T·0.01/0.02
    float T = uTime + uTime + sdY;
    // 噪声采样 :3132-3144(★横坐标 = t0.x = u 沿带参数 + sdY,不是厚度 d)
    float n1 = texture(uNoiseA, vec2((u + sdY) * 20.0 - T * 0.02, T * 0.02)).r;
    float n2 = texture(uNoiseA, vec2((u + sdY) * 6.0 - T * 0.01, T * 0.01)).r;
    float n3 = texture(uNoiseB, vec2(u, grad)).r;
    // 强度链 :3145-3166(逐步码 1:1)
    float r0 = n1 * n1;
    r0 = n1 * r0;                       // n1³
    r0 = clamp(r0 * -0.7 + 1.0, 0.0, 1.0);  // A = sat(1−0.7·n1³)(★#15 _sat)
    float f1 = grad + 0.1;              // grad+0.1(可到 1.1,lrp 外插不钳)
    float b = f1 + (1.0 - f1) * r0;
    b = sdY * (1.0 - b) + b;
    float f2 = grad * sdY;
    float c = f2 + (1.0 - f2) * b;
    float t15 = 0.1 + 0.9 * c;
    float q = n2 * n2;                  // ★n2²(曾误写前值 c 的平方)
    float e = 1.0 - q * q;              // 1−n2⁴
    e = max(e, 0.0);
    float f = sdY * (1.0 - e) + e;
    float g = f2 + (1.0 - f2) * f;
    float t16 = 0.3 + 0.7 * g;
    float k = (t15 * t16) * (clamp(grad * 3.0, 0.0, 1.0) * pow(n3, 1.2));  // ★#37 _sat
    // :3167-3169 逐通道 v + sat(v·sd.x)(★#52 _sat;v·sd.x≤1 时 ≡ (1+sd.x)·v)
    vec3 fac = vColor + clamp(vColor * sdX, 0.0, 1.0);
    // oC0 = sat(fac·k),α≡c6.x=0(:3170-3171)
    fragColor = vec4(min(fac.r * k, 1.0), min(fac.g * k, 1.0), min(fac.b * k, 1.0), 0.0);
}`;

export class GLAurora {
    readonly canvas: HTMLCanvasElement | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private prog: WebGLProgram | null = null;
    private vbo: WebGLBuffer | null = null;
    private texA: WebGLTexture | null = null;
    private texB: WebGLTexture | null = null;
    private uni: Record<string, WebGLUniformLocation | null> = {};
    diedAt = 0;
    unavailable = false;
    private _noiseUploaded = false;

    constructor() {
        if (typeof document === 'undefined') { this.unavailable = true; return; }
        this.canvas = document.createElement('canvas');
        this.canvas.width = 0;
        this.canvas.height = 0;
        this.init();
    }

    private init(): void {
        const gl = this.canvas!.getContext('webgl2', {
            alpha: false, premultipliedAlpha: false, antialias: false,
            depth: false, stencil: false, preserveDrawingBuffer: true,
        }) as WebGL2RenderingContext | null;
        if (!gl) { this.unavailable = true; this.diedAt = performance.now(); return; }
        this.gl = gl;
        const compile = (type: number, src: string): WebGLShader => {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src); gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(sh) ?? 'compile failed');
            return sh;
        };
        try {
            const vs = compile(gl.VERTEX_SHADER, VERT);
            const fs = compile(gl.FRAGMENT_SHADER, FRAG);
            const prog = gl.createProgram()!;
            gl.attachShader(prog, vs); gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
                throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
            this.prog = prog;
            for (const name of ['uResolution', 'uTime', 'uSD', 'uNoiseA', 'uNoiseB'])
                this.uni[name] = gl.getUniformLocation(prog, name);
            this.vbo = gl.createBuffer();
            // 顶点布局一次装好(专用上下文:属性/指针常驻,VBO 不换)
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 8);
            gl.enableVertexAttribArray(2);
            gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
        } catch (e) {
            console.error('[GLAurora] init:', e);
            this.unavailable = true; this.diedAt = performance.now();
        }
    }

    /** 噪声上传(R 通道 0..1 Float32 → R8 unorm,数值等价) */
    uploadNoise(texA: Float32Array, texB: Float32Array): void {
        const gl = this.gl; if (!gl || this._noiseUploaded) return;
        const mk = (data: Float32Array, size: number): WebGLTexture => {
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) bytes[i] = data[i] * 255 + 0.5 | 0;
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            return t;
        };
        this.texA = mk(texA, 256);
        this.texB = mk(texB, 128);
        this._noiseUploaded = true;
    }

    get ready(): boolean { return !!(this.gl && this.prog && !this.diedAt && !this.unavailable); }

    /** 帧头:调尺寸/清屏(加法累积的零底)/帧常量 uniform/噪声绑定/开加法混合 */
    beginFrame(w: number, h: number, time: number,
        noiseA: Float32Array, noiseB: Float32Array): void {
        const gl = this.gl; if (!gl || !this.prog) return;
        if (this.canvas!.width !== w || this.canvas!.height !== h) {
            this.canvas!.width = w; this.canvas!.height = h;
        }
        this.uploadNoise(noiseA, noiseB);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.prog);
        if (this.uni.uResolution) gl.uniform2f(this.uni.uResolution, w, h);
        if (this.uni.uTime) gl.uniform1f(this.uni.uTime, time);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        if (this.uni.uNoiseA) gl.uniform1i(this.uni.uNoiseA, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        if (this.uni.uNoiseB) gl.uniform1i(this.uni.uNoiseB, 1);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);          // α≡0 + AlphaBlend(One,InvSrcα) 等效
    }

    /** 单带绘制(verts 8 float/顶点;count 顶点数;sdX/sdY = 该带 specificData) */
    drawBand(verts: Float32Array, count: number, sdX: number, sdY: number): void {
        const gl = this.gl; if (!gl || !this.prog || count <= 0) return;
        if (this.uni.uSD) gl.uniform4f(this.uni.uSD, sdX, sdY, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, count);
    }
}

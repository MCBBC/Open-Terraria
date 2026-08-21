// 极光 WebGL2 渲染器（2026-08-21）——原版 Aurora pixel shader 反编译 → GLSL。
// SM2 字节码逐步码 1:1 翻译（tools/disasm-fx.mjs → PixelShader.cso pass Aurora）。
// GPU 逐像素连续采样 = 原版视觉品质（柔滑渐变/射线/色带），CPU 0.5x 离屏无法复刻。
// 噪声贴图 = Extra_286(256²)/Extra_287(128²) R 通道，LinearWrap。
// 混合 = gl.ONE, gl.ONE（additive，shader α≡0 + FNA AlphaBlend 等效）。
const VERT = `#version 300 es
layout(location=0) in vec2 aPos;       // 屏幕空间位置（像素）
layout(location=1) in vec3 aUV;        // (u, grad, d)
layout(location=2) in vec3 aColor;     // 顶点色 × num28（0..1）
uniform vec2 uResolution;              // 画布尺寸（px）
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
uniform sampler2D uNoiseA;             // Extra_286 (256×256, wrap)
uniform sampler2D uNoiseB;             // Extra_287 (128×128, wrap)
uniform float uTime;
uniform vec4 uSD;                      // shader specific data
in vec3 vColor;
in vec3 vUV;
out vec4 fragColor;

void main() {
    float t0x = vUV.x;
    float t0y = vUV.y;                 // grad（0 顶→1 底）
    float t0z = vUV.z;                 // d（带高）
    float sdX = uSD.x;
    float sdY = uSD.y;

    float T = 2.0 * uTime + sdY;
    float c0 = -T * 0.01;
    float c1 = T * 0.01;
    float c2 = -T * 0.02;
    float c3 = T * 0.02;

    // SM2 texld ×3（噪声采样，LinearWrap 由 texture() 的 REPEAT 完成）
    float n1 = texture(uNoiseA, vec2((t0z + sdY) * 20.0 + c2, c3)).r;
    float n2 = texture(uNoiseA, vec2((t0z + sdY) * 6.0 + c0, c1)).r;
    float n3 = texture(uNoiseB, vec2(t0x, t0y / t0z)).r;

    // SM2 强度链（:3145-3167 逐步码 1:1）
    float r0 = n1 * n1;
    r0 = n1 * r0;                       // n1³
    r0 = r0 * (-0.7) + 1.0;            // mad -c6.z(0.7), c6.w(1.0)

    float r0y = t0y / t0z * 1.0 + 0.1; // mad t0.y×rcp(t0.z), c7.x
    float r1y = r0y * 1.0 + (1.0 - r0y) * r0; // lrp r0.y, c5.w(1.0), r0.x

    r0 = 1.0 - r1y;                    // add -r1.y, c5.w
    r0 = sdY * r0 + r1y;               // mad c4.y(sdY), r0.x, r1.y

    r0y = (t0y / t0z) * sdY;           // mul r2.y, r0.z, c4.y
    r1y = r0y * 1.0 + (1.0 - r0y) * r0; // lrp

    r0 = r1y * 0.9 + 0.1;              // mad c7.w(0.9), c7.x(0.1)

    float r0z = r1y * r1y;             // mul
    r0z = r0z * (-r0z) + 1.0;          // mad → 1 - r1y⁴
    r0z = max(r0z, 0.0);               // max c6.x(0.0)

    float r0z2 = 1.0 - r0z;            // add
    r0z2 = sdY * r0z2 + r0z;           // mad c4.y

    float r1x = r0y * 1.0 + (1.0 - r0y) * r0z2; // lrp

    r0 = r1x * 0.7 + 0.3;              // mad c7.y(0.7), c7.z(0.3)

    float r0y2 = (t0y / t0z) * 3.0;    // mul c5.y(3.0)
    float r0z3 = pow(n3, 1.2);         // pow c5.x(1.2)
    r0y2 = r0y2 * r0z3;
    r0 = r0 * r0y2;

    // 色尾（:3167-3171）：rgb = sat(intensity × v0.rgb × (1+sdX))，α=c6.x=0
    float k = r0 * (1.0 + sdX);
    fragColor = vec4(clamp(vColor.r * k, 0.0, 1.0),
                     clamp(vColor.g * k, 0.0, 1.0),
                     clamp(vColor.b * k, 0.0, 1.0), 0.0);
}`;

export class GLAurora {
    private gl: WebGL2RenderingContext | null = null;
    private prog: WebGLProgram | null = null;
    private vbo: WebGLBuffer | null = null;
    private texA: WebGLTexture | null = null;
    private texB: WebGLTexture | null = null;
    private uni: Record<string, WebGLUniformLocation | null> = {};
    private canvas: HTMLCanvasElement | null = null;
    diedAt = 0;
    unavailable = false;

    /** 上传噪声贴图（R 通道 Float32Array → Luminance R32UI 纹理） */
    uploadNoise(gl: WebGL2RenderingContext, texA: Float32Array, texB: Float32Array): void {
        const mk = (data: Float32Array, size: number): WebGLTexture => {
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            // R32F 纹理（float 采样）
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            return t;
        };
        this.texA = mk(texA, 256);
        this.texB = mk(texB, 128);
    }

    /** 确保上下文+程序就绪；返回 gl 或 null */
    ensure(): WebGL2RenderingContext | null {
        if (this.gl && this.prog && !this.diedAt) return this.gl;
        if (this.unavailable) return null;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) { this.unavailable = true; return null; }
        this.canvas = canvas;
        this.gl = gl;
        // 编译
        const compile = (type: number, src: string): WebGLShader => {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error('[GLAurora] shader 编译失败:', gl.getShaderInfoLog(sh));
                throw new Error('shader compile failed');
            }
            return sh;
        };
        try {
            const vs = compile(gl.VERTEX_SHADER, VERT);
            const fs = compile(gl.FRAGMENT_SHADER, FRAG);
            const prog = gl.createProgram()!;
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(prog) ?? 'link failed');
            }
            this.prog = prog;
            for (const name of ['uResolution', 'uTime', 'uSD', 'uNoiseA', 'uNoiseB']) {
                this.uni[name] = gl.getUniformLocation(prog, name);
            }
            this.vbo = gl.createBuffer();
        } catch (e) {
            console.error('[GLAurora] init failed:', e);
            this.unavailable = true;
            return null;
        }
        return gl;
    }

    /**
     * 渲染极光带条（WebGL2 additive）。
     * @param gl 外部 WebGL2 上下文（Renderer 的 acquireGL）
     * @param verts Float32Array：每顶点 [x, y, u, grad, d, r, g, b] = 8 float
     * @param vertexCount 顶点数（= 段数 × 2 × 3 三角形索引展开后）
     * @param width 画布宽
     * @param height 画布高
     * @param time globalTime（GlobalTimeWrappedHourly）
     * @param sdX specificData.X
     * @param sdY specificData.Y
     */
    render(gl: WebGL2RenderingContext, verts: Float32Array, vertexCount: number,
        width: number, height: number, time: number, sdX: number, sdY: number): void {
        if (!this.prog) return;
        const prog = this.prog;
        gl.useProgram(prog);
        gl.viewport(0, 0, width, height);
        // 顶点缓冲
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        // attrib 0: aPos (x, y) → stride 32, offset 0
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
        // attrib 1: aUV (u, grad, d) → stride 32, offset 8
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 8);
        // attrib 2: aColor (r, g, b) → stride 32, offset 20
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
        // uniforms
        if (this.uni.uResolution) gl.uniform2f(this.uni.uResolution, width, height);
        if (this.uni.uTime) gl.uniform1f(this.uni.uTime, time);
        if (this.uni.uSD) gl.uniform4f(this.uni.uSD, sdX, sdY, 0, 0);
        // 纹理
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        if (this.uni.uNoiseA) gl.uniform1i(this.uni.uNoiseA, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        if (this.uni.uNoiseB) gl.uniform1i(this.uni.uNoiseB, 1);
        // additive 混合
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        gl.disable(gl.BLEND);
    }

    dispose(): void {
        this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
        this.prog = null;
    }
}

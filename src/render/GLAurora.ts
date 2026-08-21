// 极光 WebGL2 渲染器——照 GLSpriteLayer 模式（自建 canvas + WebGL2 上下文）。
// Aurora pixel shader 反编译 → GLSL（SM2 字节码逐步码 1:1）。
// 噪声贴图 Extra_286/287 → R32F 纹理 LinearWrap。
// 混合 = gl.ONE/gl.ONE additive（shader α≡0 + FNA AlphaBlend 等效）。
const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec3 aUV;        // (u, grad, d)
layout(location=2) in vec3 aColor;     // 顶点色 × num28
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
uniform sampler2D uNoiseA;
uniform sampler2D uNoiseB;
uniform float uTime;
uniform vec4 uSD;
in vec3 vColor;
in vec3 vUV;
out vec4 fragColor;

void main() {
    float u = vUV.x;
    float grad = vUV.y;
    float d = vUV.z;
    float sdX = uSD.x;
    float sdY = uSD.y;

    float T = 2.0 * uTime + sdY;
    float c0 = -T * 0.01;
    float c1 = T * 0.01;
    float c2 = -T * 0.02;
    float c3 = T * 0.02;

    float n1 = texture(uNoiseA, vec2((d + sdY) * 20.0 + c2, c3)).r;
    float n2 = texture(uNoiseA, vec2((d + sdY) * 6.0 + c0, c1)).r;
    float n3 = texture(uNoiseB, vec2(u, grad)).r;

    // SM2 强度链（:3145-3167 逐步码 1:1）
    float r0 = n1 * n1;
    r0 = n1 * r0;
    r0 = r0 * (-0.7) + 1.0;

    float r0y = grad * 1.0 + 0.1;
    float r1y = r0y * 1.0 + (1.0 - r0y) * r0;

    r0 = 1.0 - r1y;
    r0 = sdY * r0 + r1y;

    r0y = grad * sdY;
    r1y = r0y * 1.0 + (1.0 - r0y) * r0;

    r0 = r1y * 0.9 + 0.1;

    float r0z = r1y * r1y;
    r0z = r0z * (-r0z) + 1.0;
    r0z = max(r0z, 0.0);

    float r0z2 = 1.0 - r0z;
    r0z2 = sdY * r0z2 + r0z;

    float r1x = r0y * 1.0 + (1.0 - r0y) * r0z2;

    r0 = r1x * 0.7 + 0.3;

    float r0y2 = grad * 3.0;
    float r0z3 = pow(n3, 1.2);
    r0y2 = r0y2 * r0z3;
    r0 = r0 * r0y2;

    float k = r0 * (1.0 + sdX);
    fragColor = vec4(clamp(vColor.r * k, 0.0, 1.0),
                     clamp(vColor.g * k, 0.0, 1.0),
                     clamp(vColor.b * k, 0.0, 1.0), 0.0);
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
            alpha: false, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true,
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
        } catch (e) {
            console.error('[GLAurora] init:', e);
            this.unavailable = true; this.diedAt = performance.now();
        }
    }

    /** 上传噪声贴图（R 通道 Float32Array → R32F 纹理 LinearWrap） */
    uploadNoise(texA: Float32Array, texB: Float32Array): void {
        const gl = this.gl; if (!gl) return;
        if (this._noiseUploaded) return;
        const mk = (data: Float32Array, size: number): WebGLTexture => {
            const t = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, size, size, 0, gl.RED, gl.FLOAT, data);
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

    /**
     * 渲染极光带条到自身 canvas（additive）。
     * @param verts 每顶点 8 float [x, y, u, grad, d, r, g, b]
     * @param count 顶点数
     * @param w 画布宽  @param h 画布高
     * @param time GlobalTimeWrappedHourly
     * @param sdX/sdY specificData
     * @param noiseA/B 噪声数据（首次上传用）
     */
    render(verts: Float32Array, count: number, w: number, h: number,
        time: number, sdX: number, sdY: number,
        noiseA: Float32Array, noiseB: Float32Array): void {
        if (!this.ready || !this.gl) return;
        const gl = this.gl;
        if (this.canvas!.width !== w || this.canvas!.height !== h) {
            this.canvas!.width = w; this.canvas!.height = h;
        }
        this.uploadNoise(noiseA, noiseB);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
        if (this.uni.uResolution) gl.uniform2f(this.uni.uResolution, 1920, 1080);
        if (this.uni.uTime) gl.uniform1f(this.uni.uTime, time);
        if (this.uni.uSD) gl.uniform4f(this.uni.uSD, sdX, sdY, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        if (this.uni.uNoiseA) gl.uniform1i(this.uni.uNoiseA, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        if (this.uni.uNoiseB) gl.uniform1i(this.uni.uNoiseB, 1);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, count);
        gl.disable(gl.BLEND);
        // 诊断：扫描全 canvas 找最亮像素
        const pxBuf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pxBuf);
        let maxLum = 0, maxPx = [0,0,0,0], nonZero = 0;
        for (let i = 0; i < pxBuf.length; i += 4) {
            const lum = pxBuf[i] + pxBuf[i+1] + pxBuf[i+2];
            if (lum > 0) nonZero++;
            if (lum > maxLum) { maxLum = lum; maxPx = [pxBuf[i], pxBuf[i+1], pxBuf[i+2], pxBuf[i+3]]; }
        }
        console.log(`[GLAurora] 非零像素: ${nonZero}/${w*h}, 最亮: rgb(${maxPx[0]},${maxPx[1]},${maxPx[2]}) a=${maxPx[3]}`);
        // 诊断：读中心像素（开发用，正式版删）
        const px = new Uint8Array(4);
        gl.readPixels(Math.floor(w/2), Math.floor(h/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (px[0] + px[1] + px[2] > 0) console.log('[GLAurora] 中心像素:', px[0], px[1], px[2], 'α=', px[3]);
        else console.log('[GLAurora] 中心像素全零！');
    }
}

// ★K2 场值闸诊断（一次性）：oracle(SM2) vs JS 直译 GLSL vs 真 GL 三方对照,
// 定位 maxd=244 的归属面（公式理解 vs GL 管线）。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k2-fdiag.mjs
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');

const out = await page.evaluate(async () => {
  const glMod = await import('/src/render/GLSpriteLayer.ts');
  const smMod = await import('/src/fx/SM2Effect.ts');
  const FS = glMod.FFIELD_FS_SRC;
  const W = 128, H = 128;
  const img = new Image();
  img.src = 'sprites/vanilla/Misc_Perlin.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); });
  const pcv = document.createElement('canvas');
  pcv.width = W; pcv.height = H;
  pcx = pcv.getContext('2d', { willReadFrequently: true });
  pcx.drawImage(img, 0, 0, W, H);
  const perlin = pcx.getImageData(0, 0, W, H);

  // ---- oracle ----
  const pass = smMod.getPass('ForceField');
  const oracle = (uTime, uColor) => {
    const data = new Uint8ClampedArray(perlin.data);
    const u = smMod.defaultUniforms();
    u.uTime = uTime; u.uColor = uColor;
    u.uSourceRect = [0, 0, W, H]; u.uImageSize0 = [W, H];
    smMod.runPassOnImageData(pass, data, W, H, u);
    return data;
  };
  const ref = oracle(3.4, [1, 1, 1]);

  // ---- JS 直译版 GLSL（与 FS 源逐式同步;双线性钳采样按 sampleImageInto 同式）----
  const sample = (u, v) => {   // clamp 双线性,返回 r (0..1)
    const x = u * W - 0.5, y = v * H - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const cl = (xx, yy) => {
      const sx = xx < 0 ? 0 : xx >= W ? W - 1 : xx;
      const sy = yy < 0 ? 0 : yy >= H ? H - 1 : yy;
      return perlin.data[((sy | 0) * W + (sx | 0)) * 4] / 255;
    };
    const a = cl(x0, y0), b = cl(x0 + 1, y0), c = cl(x0, y0 + 1), d = cl(x0 + 1, y0 + 1);
    const p01 = a + (b - a) * fx, p23 = c + (d - c) * fx;
    return p01 + (p23 - p01) * fy;
  };
  const jsPort = (uTime, px, py) => {
    const t0x = (px + 0.5) / W, t0y = (py + 0.5) / H;
    const ux = t0x - 0.5, uy = t0y - 0.5;
    const x = ux * 1.5, y = uy;
    const rho = Math.sqrt(x * x + y * y);
    const z = y * 30.0 + (uTime + 5.0);
    const s = z * 0.0795774906873703;
    const fa = s - Math.floor(Math.abs(s)) * Math.sign(1); // fract(abs(s))
    const faAbs = Math.abs(s) - Math.floor(Math.abs(s));
    const saw = z >= 0 ? faAbs : -faAbs;
    const cmpv = saw * 12.566368103027344 - 6.283184051513672;
    const fr = (v) => v - Math.floor(v);
    const ang = cmpv >= 0 ? -0.0000014980281548560015
      : fr(saw * 1.9999996423721313 + 0.5) * 6.2831854820251465 - 3.1415927410125732;
    const band = Math.cos(ang) * -0.5 + 0.5;
    const d = rho * 2.799999952316284;
    const sat = (v) => Math.min(1, Math.max(0, v));
    const e = sat((d - 1.0) * 20.0);
    const sd = Math.sqrt(d);
    const puvx = (t0x - 1.5) * sd + 0.5, puvy = (t0y - 1.5) * sd + 0.5;
    const pr = sample(puvx, puvy);
    const t = sat((pr * band - 0.3) * 20.0);
    const s1 = (3.0 - 2.0 * t) * t * t;
    if (pr <= 0) return { w: 0, dbg: { pr, band, ang, saw } };
    const lr = s1 / pr + (1.0 - s1);
    const P = pr * pr * lr;
    const A = 1.0 - (3.0 - 2.0 * e) * e * e;
    const w1 = P * band * A;
    const w2 = A * d * d * d;
    const w = 0.75 * w2 + w1;
    return { w, dbg: { pr, band, ang, saw, rho, A } };
  };

  // ---- 真 GL ----
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true });
  const mk = (ty, src) => { const sh = gl.createShader(ty); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const vs = mk(gl.VERTEX_SHADER, `#version 300 es
uniform vec2 uCanvas;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
layout(location=3) in float aTime;
out vec2 vUv; out vec4 vCol; out float vT;
void main(){ gl_Position=vec4(aPos.x/uCanvas.x*2.0-1.0, 1.0-aPos.y/uCanvas.y*2.0,0.,1.); vUv=aUv; vCol=aCol; vT=aTime; }`);
  const fs = mk(gl.FRAGMENT_SHADER, FS);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.uniform2f(gl.getUniformLocation(prog, 'uCanvas'), W, H);
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
  gl.viewport(0, 0, W, H); gl.disable(gl.BLEND);
  const buf = new Float32Array(54);
  const put = (i, x, y, u, v) => { const o = i * 9; buf[o]=x; buf[o+1]=y; buf[o+2]=u; buf[o+3]=v; buf[o+4]=1; buf[o+5]=1; buf[o+6]=1; buf[o+7]=1; buf[o+8]=3.4; };
  put(0,0,0,0,0); put(1,W,0,1,0); put(2,W,H,1,1); put(3,0,0,0,0); put(4,W,H,1,1); put(5,0,H,0,1);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STREAM_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const rd = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rd);
  const glAt = (px, py) => { const row = H - 1 - py; return rd[(row * W + px) * 4 + 3]; };

  // ---- 三方对照（y=44 行,含 worst 点 x=55）----
  const rows = [];
  for (const px of [8, 24, 40, 48, 55, 64, 72, 88, 104, 120]) {
    const py = 44;
    const ri = (py * W + px) * 4;
    const jp = jsPort(3.4, px, py);
    rows.push({
      px, oracleA: ref[ri + 3], oracleRGB: [ref[ri], ref[ri + 1], ref[ri + 2]],
      glA: glAt(px, py),
      jsW: +(jp.w * 255).toFixed(1), dbg: {
        pr: +jp.dbg.pr.toFixed(3), band: +jp.dbg.band.toFixed(3),
        rho: +jp.dbg.rho.toFixed(3), A: +(jp.dbg.A ?? -1).toFixed(3),
        saw: +jp.dbg.saw.toFixed(3), ang: +jp.dbg.ang.toFixed(3),
      },
    });
  }
  return { rows, shaderCompiled: true };
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);

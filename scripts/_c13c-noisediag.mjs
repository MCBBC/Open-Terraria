// 一次性诊断（三期亮纹场闸调试）:LIQSHIM_VS + 诊断 FS（直出 vNoise）——
// 实测 GPU varying 插值形态 vs 双线性/两三角模型。
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
const out = await page.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const VS = mod.LIQSHIM_VS_SRC;
  const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol; in vec2 vTile; in float vNoise;
out vec4 outColor;
void main() { outColor = vec4(vec3(vNoise * 0.5 + 0.5), 1.0); }`;
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true });
  const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.uniform2f(gl.getUniformLocation(prog, 'uCanvas'), W, H);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 44, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 32);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
  gl.viewport(0, 0, W, H);
  const px = new Float32Array(6 * 11);
  const put = (i, x, y, u, v, tx, tyy, n) => {
    const o = i * 11;
    px[o] = x; px[o + 1] = y; px[o + 2] = u; px[o + 3] = v;
    px[o + 4] = 1; px[o + 5] = 1; px[o + 6] = 1; px[o + 7] = 1;
    px[o + 8] = tx; px[o + 9] = tyy; px[o + 10] = n;
  };
  // 全幅 quad:aTile=(0,0)-(256,256);四角噪声 = 已知简单值
  const n00 = 0.9, n10 = -0.4, n11 = 1.0, n01 = 0.0;
  put(0, 0, 0, 0, 0, 0, 0, n00);
  put(1, W, 0, 1, 0, W, 0, n10);
  put(2, W, H, 1, 1, W, H, n11);
  put(3, 0, 0, 0, 0, 0, 0, n00);
  put(4, W, H, 1, 1, W, H, n11);
  put(5, 0, H, 0, 1, 0, H, n01);
  gl.bufferData(gl.ARRAY_BUFFER, px, gl.STREAM_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // 抽样:对角线两侧 + 远离对角域,对照两三角模型
  const sample = [];
  for (const [c, r] of [[0, 0], [32, 0], [64, 0], [127, 0], [128, 0], [200, 0], [255, 0], [0, 128], [64, 64], [128, 128], [200, 100], [255, 255], [10, 240], [250, 20]]) {
    const b = (H - 1 - r) * W + c;
    const o = b * 4;
    const got = (buf[o] / 255) * 2 - 1;
    const u = (c + 0.5) / W, v = (r + 0.5) / H;
    const model = v >= u ? n00 + (n11 - n01) * u + (n01 - n00) * v
      : n00 + (n10 - n00) * u + (n11 - n10) * v;
    sample.push({ c, r, got: +got.toFixed(4), model: +model.toFixed(4), d: +(got - model).toFixed(4) });
  }
  return sample;
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);

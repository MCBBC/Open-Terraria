// ★K2 离线场值 readback 闸（2026-10-01;c13c _c13c-fieldgate.mjs 同款方法论）。
// 128² FBO 渲染 sprite:forcefield 真源（FFIELD_VS/FS_SRC 导出直采,禁转录漂移）
// 的逐像素场,对照 JS 参照 = SM2 解释器（getPass('ForceField')+runPassOnImageData,
// 运行时同引擎:codegen 主路径）在真 Perlin 128² 上的产物。
// 网格:128² 全像素 × uTime∈{0,0.2,0.5,3.4,13.7,100.3,1234.5,3600.2} ×
// uColor∈{(1,1,1),(2,2,2),(1.37,1.37,1.37)}（稳态/破盾/重塑窗中值）。
// 验收线:c13c 判例 maxd ≤ 2/255（highp f32 vs 解释器 f64 域 + 产物单次量化差;
// 超域=mediump 漏入或常量/指令序转录错）。α 通道直比;rgb 比预乘重构域
// （FS 输出=预乘管线下游,oracle 产物为直 alpha:ref_rgb_p=oracle.rgb×oracle.a）。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k2-fieldgate.mjs
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, ORIGIN + '/');

const out = await page.evaluate(async () => {
  const glMod = await import('/src/render/GLSpriteLayer.ts');
  const smMod = await import('/src/fx/SM2Effect.ts');
  const VS = glMod.FFIELD_VS_SRC, FS = glMod.FFIELD_FS_SRC;
  const W = 128, H = 128;

  // ---- 真 Perlin 128²（与 ForceFieldBubble.perlinData 同源同式:drawImage 0,0,128,128）----
  const img = new Image();
  img.src = 'sprites/vanilla/Misc_Perlin.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('perlin load fail')); });
  const pcv = document.createElement('canvas');
  pcv.width = W; pcv.height = H;
  const pcx = pcv.getContext('2d', { willReadFrequently: true });
  pcx.drawImage(img, 0, 0, W, H);
  const perlin = pcx.getImageData(0, 0, W, H);

  // ---- JS 参照（SM2 解释器,运行时同引擎）----
  const pass = smMod.getPass('ForceField');
  if (!pass) return { why: 'no ForceField pass' };
  const oracle = (uTime, uColor) => {
    const data = new Uint8ClampedArray(perlin.data);       // 产物=输入 Perlin 覆写
    const u = smMod.defaultUniforms();
    u.uTime = uTime; u.uColor = uColor;
    u.uSourceRect = [0, 0, W, H]; u.uImageSize0 = [W, H];
    smMod.runPassOnImageData(pass, data, W, H, u);
    return data;
  };

  // ---- GL 侧（真源编译;128² FBO）----
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) return { why: 'no webgl2' };
  const mk = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return { err: gl.getShaderInfoLog(sh) };
    return { sh };
  };
  const vs = mk(gl.VERTEX_SHADER, VS), fs = mk(gl.FRAGMENT_SHADER, FS);
  if (vs.err || fs.err) return { why: 'compile', vs: vs.err, fs: fs.err };
  const prog = gl.createProgram();
  gl.attachShader(prog, vs.sh); gl.attachShader(prog, fs.sh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { why: 'link', log: gl.getProgramInfoLog(prog) };
  gl.useProgram(prog);
  gl.uniform2f(gl.getUniformLocation(prog, 'uCanvas'), W, H);
  gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
  // Perlin 纹理:预乘上传（texFromImage 同参;α 恒 255=恒等）,LINEAR CLAMP 无 mip
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // stride-9 VAO（quadBatchForceField 同布局:0=pos2/1=uv2/2=col4/3=time1）
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
  gl.viewport(0, 0, W, H);
  gl.disable(gl.BLEND);
  const buf = new Float32Array(54);
  const put = (i, x, y, u, v) => {
    const o = i * 9;
    buf[o] = x; buf[o + 1] = y; buf[o + 2] = u; buf[o + 3] = v;
    buf[o + 4] = 1; buf[o + 5] = 1; buf[o + 6] = 1; buf[o + 7] = 1; buf[o + 8] = 0;
  };
  put(0, 0, 0, 0, 0); put(1, W, 0, 1, 0); put(2, W, H, 1, 1);
  put(3, 0, 0, 0, 0); put(4, W, H, 1, 1); put(5, 0, H, 0, 1);

  const TIMES = [0, 0.2, 0.5, 3.4, 13.7, 100.3, 1234.5, 3600.2];
  const COLORS = [[1, 1, 1], [2, 2, 2], [1.37, 1.37, 1.37]];
  const rd = new Uint8Array(W * H * 4);
  let maxd = 0, worst = null, nanMismatch = 0, zeroGuard = 0;
  for (const uColor of COLORS) {
    for (const uTime of TIMES) {
      // 顶点 time/col 逐帧写入
      for (let v = 0; v < 6; v++) {
        buf[v * 9 + 4] = uColor[0]; buf[v * 9 + 5] = uColor[1]; buf[v * 9 + 6] = uColor[2];
        buf[v * 9 + 7] = 1; buf[v * 9 + 8] = uTime;
      }
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rd);
      const ref = oracle(uTime, uColor);
      // readPixels 底起 → 行翻转对齐 ImageData（顶行 0）
      for (let y = 0; y < H; y++) {
        const glRow = H - 1 - y;
        for (let x = 0; x < W; x++) {
          const gi = (glRow * W + x) * 4, ri = (y * W + x) * 4;
          const refA = ref[ri + 3];
          const da = Math.abs(rd[gi + 3] - refA);
          if (da > maxd) { maxd = da; worst = { uTime, uColor: [...uColor], x, y, ch: 'a', got: rd[gi + 3], ref: refA }; }
          if (refA === 0 && rd[gi + 3] === 0) { zeroGuard++; continue; }   // NaN 钳 0 支
          // rgb 预乘重构:ref_rgb_p = oracle.rgb×oracle.a/255
          for (let ch = 0; ch < 3; ch++) {
            const refP = Math.round((ref[ri + ch] / 255) * refA);
            const dch = Math.abs(rd[gi + ch] - refP);
            if (dch > maxd) { maxd = dch; worst = { uTime, uColor: [...uColor], x, y, ch, got: rd[gi + ch], ref: refP }; }
          }
        }
      }
    }
  }
  return { maxd, worst, zeroGuard, nanMismatch };
});

if (out.why) {
  chk('着色器真源编译/链接', false, JSON.stringify(out).slice(0, 300));
} else {
  chk('离线场值 readback 闸:maxd ≤ 2/255（c13c 验收线;超域=mediump 漏入/转录错）',
    out.maxd <= 2,
    `maxd=${out.maxd} worst=${JSON.stringify(out.worst)} NaN钳0像素=${out.zeroGuard}`);
}
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);

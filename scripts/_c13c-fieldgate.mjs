// ★C13c 离线场值 readback 闸（2026-10-01;设计案 §4.1 第 1 步——纯 GL 侧,不动游戏管线）。
// 小 FBO(256×256) 渲染 sprite:liqshimmer 真源（LIQSHIM_FS_SRC 导出直采,禁转录漂移）
// 的逐像素基色场 field×255,readPixels 对照 JS 参照（GetShimmerBaseColor :803-807 逐式）。
// 网格:x∈[0,256) × tVis∈{0..3570,步 30} × tile.y∈[0,8)（行混编覆盖 y 域）。
// 验收线（设计案 §4.1）:maxd ≤ 2/255（highp sin vs f64 sin 域;超域=mediump 漏入或常量错）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_c13c-fieldgate.mjs
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
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const VS = mod.LIQSHIM_VS_SRC, FS = mod.LIQSHIM_FS_SRC;
  const W = 256, H = 256, ROWS = 120;   // tVis = row*30 ∈ [0,3570]
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
  const uTVis = gl.getUniformLocation(prog, 'uTVis');
  // 白 1×1 纹理（RGB=255,A=255=预乘恒等;tex_p.rgb=1 → out=field×vCol.a）
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  // stride-11 VAO（与 quadBatchLiqShimmer 同布局:0=pos2/1=uv2/2=col4/3=tile2/4=noise1）
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 44, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 44, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 44, 16);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 32);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 44, 40);
  gl.viewport(0, 0, W, H);
  const px = new Float32Array(6 * 11);
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const ty = r % 8, tVis = r * 30;
    gl.uniform1f(uTVis, tVis);
    // 设备行 r..r+1;两三角 (TL,TR,BR)+(TL,BR,BL)——与 shimQuad 顶点序同构
    const put = (i, x, y, u, v, tx, tyy) => {
      const o = i * 11;
      px[o] = x; px[o + 1] = y; px[o + 2] = u; px[o + 3] = v;
      px[o + 4] = 1; px[o + 5] = 1; px[o + 6] = 1; px[o + 7] = 1;
      px[o + 8] = tx; px[o + 9] = tyy; px[o + 10] = 0;
    };
    put(0, 0, r, 0, 0, 0, ty);           // TL
    put(1, W, r, 1, 0, W, ty);           // TR
    put(2, W, r + 1, 1, 1, W, ty);       // BR
    put(3, 0, r, 0, 0, 0, ty);           // TL'
    put(4, W, r + 1, 1, 1, W, ty);       // BR'
    put(5, 0, r + 1, 0, 1, 0, ty);       // BL
    gl.bufferData(gl.ARRAY_BUFFER, px, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // JS 参照（GetShimmerBaseColor :803-807 f64;与 VanillaLiquidRenderer SHIM_* 常量同源）
  const A = [0.64705884, 26 / 51, 14 / 15], D = [41 / 51, 41 / 51, 1];
  let maxd = 0, worst = null;
  for (let r = 0; r < ROWS; r++) {
    const ty = r % 8, tVis = r * 30;
    let rowMax = 0;
    for (let c = 0; c < W; c++) {
      // ★参照=像素中心 c+0.5（FS 在像素中心求值;vTile.x=设备 c+0.5 线性映射——
      //  曾用 c 差半像素=相位差 0.314rad≈场差 9.3/255,恰为 maxd 9.7 伪影源）
      const w = Math.sin(((c + 0.5 + ty / 6) / 10 - tVis / 360) * Math.PI * 2);
      const k = 0.1 + w * 0.4;
      const glRow = H - 1 - r;   // readPixels 底起
      const o = (glRow * W + c) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const ref = 255 * (A[ch] + (D[ch] - A[ch]) * k);
        const d = Math.abs(buf[o + ch] - ref);
        if (d > rowMax) rowMax = d;
        if (d > maxd) { maxd = d; worst = { c, r, ty, tVis, ch, got: buf[o + ch], ref }; }
      }
      const da = Math.abs(buf[o + 3] - 255);
      if (da > rowMax) rowMax = da;
    }
    rows.push(rowMax);
  }
  return { maxd, worst, rowMaxWorst: Math.max(...rows), rowsGT2: rows.filter((m) => m > 2).length };
});

if (out.why) {
  chk('着色器真源编译/链接', false, JSON.stringify(out).slice(0, 300));
} else {
  chk('离线场值 readback 闸:maxd ≤ 2/255（§4.1 验收线;超域=mediump 漏入或常量错）',
    out.maxd <= 2,
    `maxd=${out.maxd.toFixed(3)} worst=${JSON.stringify(out.worst)} 行超域数=${out.rowsGT2}/${out.rowMaxWorst.toFixed(2)}`);
}
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);

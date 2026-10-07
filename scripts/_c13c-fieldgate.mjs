// ★C13c 离线场值 readback 闸（2026-10-01 二期;2026-10-02 三期扩 glitter 亮纹场;
//  ★四期修正 2026-10-07:uSpark=1 支改验【四角 glitter 终值的 varying 插值域】——
//  FS 内 remap 链逐像素式已废（插值后钳制≠原版钳制后插值=果冻感回归定谳面）,
//  glitter 公式本体归 CPU（glitter4FromWaves,liqpolish-shimmer-field 位等锁+
//  liquid-c13c-shimmer-glsl refGlitter 角值锁覆盖）,GPU 侧只剩插值消费。
//  设计案 §4.1 第 1 步——纯 GL 侧,不动游戏管线）。
//  小 FBO(256×256) 渲染 sprite:liqshimmer 真源（LIQSHIM_FS_SRC 导出直采,禁转录漂移）
//  的逐像素场 readPixels 对照 JS 参照（LiquidRenderer.cs 逐式）。两模式:
//   ①uSpark=0 基体场 field×255 ↔ GetShimmerBaseColor :803-807（验收 maxd ≤ 2/255）;
//   ②uSpark=1 亮纹段 ↔ 四角 glitter 终值（aNoise 槽喂四异值）的两三角逐线性插值
//     （★四期:g=vNoise 硬件插值,参照=同一插值模型——参照必须按【两三角逐线性】
//     建模,GPU varying 插值≙原版 TileBatch 顶点插值域（TileBatch.cs:175-187 对角线
//     TL-BR）;双线性≠两三角:cross 项 |Δ|≤0.5×值域,参照若用双线性必爆假红）。
//  网格:x∈[0,256) × tVis∈{0..3570,步 30} × tile.y∈[0,8)（行混编覆盖 y 域）。
//  运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_c13c-fieldgate.mjs
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
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
  const uSpark = gl.getUniformLocation(prog, 'uSpark');
  if (!uSpark) return { why: 'no uSpark uniform' };
  // 白 1×1 纹理（RGB=255,A=255=预乘恒等;tex_p.rgb=1 → out=调制项×vCol）
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
  const put = (i, x, y, u, v, tx, tyy, n) => {
    const o = i * 11;
    px[o] = x; px[o + 1] = y; px[o + 2] = u; px[o + 3] = v;
    px[o + 4] = 1; px[o + 5] = 1; px[o + 6] = 1; px[o + 7] = 1;
    px[o + 8] = tx; px[o + 9] = tyy; px[o + 10] = n;
  };
  const draw = () => {
    gl.bufferData(gl.ARRAY_BUFFER, px, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const read = () => {
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  // JS 参照共用:uint 混淆白噪声（SimpleWhiteNoise :793-797 1:1）
  const refNoise = (x, y) => {
    let ux = Math.abs(Math.floor(x)) >>> 0, uy = Math.abs(Math.floor(y)) >>> 0;
    ux = (36469 * (ux & 0xffff) + (ux >>> 16)) >>> 0;
    uy = (18012 * (uy & 0xffff) + (uy >>> 16)) >>> 0;
    return (((ux << 16) >>> 0) + uy) >>> 0;
  };
  // ---- 模式①:uSpark=0 基体场（§4.1 既有闸;tile.y 恒定行=场只随 x 变,参照同构）----
  gl.uniform1f(uSpark, 0);
  for (let r = 0; r < ROWS; r++) {
    const ty = r % 8, tVis = r * 30;
    gl.uniform1f(uTVis, tVis);
    put(0, 0, r, 0, 0, 0, ty, 0);           // TL
    put(1, W, r, 1, 0, W, ty, 0);           // TR
    put(2, W, r + 1, 1, 1, W, ty, 0);       // BR
    put(3, 0, r, 0, 0, 0, ty, 0);           // TL'
    put(4, W, r + 1, 1, 1, W, ty, 0);       // BR'
    put(5, 0, r + 1, 0, 1, 0, ty, 0);       // BL
    draw();
  }
  const buf0 = read();
  // JS 参照（GetShimmerBaseColor :803-807 f64;★参照=像素中心 c+0.5——曾用 c 差半像素
  //  =相位差 0.314rad≈场差 9.3/255 伪影,判例注）
  const A = [0.64705884, 26 / 51, 14 / 15], D = [41 / 51, 41 / 51, 1];
  let baseMaxd = 0, baseWorst = null;
  for (let r = 0; r < ROWS; r++) {
    const ty = r % 8, tVis = r * 30;
    for (let c = 0; c < W; c++) {
      const w = Math.sin(((c + 0.5 + ty / 6) / 10 - tVis / 360) * Math.PI * 2);
      const k = 0.1 + w * 0.4;
      const glRow = H - 1 - r;   // readPixels 底起
      const o = (glRow * W + c) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const ref = 255 * (A[ch] + (D[ch] - A[ch]) * k);
        const d = Math.abs(buf0[o + ch] - ref);
        if (d > baseMaxd) { baseMaxd = d; baseWorst = { c, r, ty, tVis, ch, got: buf0[o + ch], ref }; }
      }
    }
  }
  // ---- 模式②:uSpark=1 亮纹段（★四期 2026-10-07:g=vNoise=四角 glitter 终值插值域）----
  // ★探针教训（2026-10-02 readback 判谳）: 场参照必须用【全幅 quad】——1px 高薄条
  //  quad 的对角线与像素行近平行,本机 GPU 薄片栅格化的 varying 插值偏离两三角模型
  //  （实测段内跳变 maxd 38,全幅 quad 同模型 maxd 0.004 噪声域——_c13c-noisediag.mjs
  //  判谳）。全幅 quad 四角喂四异值（0.05/0.45/0.70/0.25—— glitter 终值可达域内)
  //  → 参照=同一两三角逐线性模型（对角线 TL-BR=v=u;三角1=(TL,TR,BR) 覆 v≤u,
  //  三角2=(TL,BR,BL) 覆 v≥u;GPU varying 语义≙原版 TileBatch 顶点插值域）。
  gl.uniform1f(uSpark, 1);
  gl.uniform1f(uTVis, 0);
  let gmaxd = 0, gworst = null, gTri1 = 0, gTri2 = 0;
  const buf1 = new Uint8Array(W * H * 4);
  {
    const g00 = 0.05, g10 = 0.45, g11 = 0.7, g01 = 0.25;   // 四角 glitter 终值（aNoise 槽）
    put(0, 0, 0, 0, 0, 0, 0, g00);        // TL
    put(1, W, 0, 1, 0, W, 0, g10);        // TR
    put(2, W, H, 1, 1, W, H, g11);        // BR
    put(3, 0, 0, 0, 0, 0, 0, g00);        // TL'
    put(4, W, H, 1, 1, W, H, g11);        // BR'
    put(5, 0, H, 0, 1, 0, H, g01);        // BL
    draw();
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf1);
    for (let y = 0; y < H; y++) {
      const glRow = H - 1 - y;   // readPixels 底起
      for (let c = 0; c < W; c++) {
        const u = (c + 0.5) / W, v = (y + 0.5) / H;
        const g = v >= u
          ? g00 + (g11 - g01) * u + (g01 - g00) * v   // 三角2 (TL,BR,BL)
          : g00 + (g10 - g00) * u + (g11 - g10) * v;  // 三角1 (TL,TR,BR)
        const ref = g * 255;
        const o = (glRow * W + c) * 4;
        const d = Math.abs(buf1[o] - ref);
        if (v >= u) gTri2++; else gTri1++;
        if (d > gmaxd) { gmaxd = d; gworst = { c, y, u: +u.toFixed(3), v: +v.toFixed(3), got: buf1[o], ref: +ref.toFixed(2) }; }
      }
    }
  }
  return { baseMaxd, baseWorst, gmaxd, gworst, gTri1, gTri2 };
});

if (out.why) {
  chk('着色器真源编译/链接', false, JSON.stringify(out).slice(0, 300));
} else {
  chk('①基体场 readback 闸:maxd ≤ 2/255（§4.1 验收线;超域=mediump 漏入或常量错）',
    out.baseMaxd <= 2,
    `maxd=${out.baseMaxd.toFixed(3)} worst=${JSON.stringify(out.baseWorst)}`);
  chk('②亮纹段 readback 闸（★四期:四角 glitter 终值两三角插值域）:maxd ≤ 2/255',
    out.gmaxd <= 2,
    `maxd=${out.gmaxd.toFixed(3)} worst=${JSON.stringify(out.gworst)} 三角覆盖 ${out.gTri1}/${out.gTri2}`);
}
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);

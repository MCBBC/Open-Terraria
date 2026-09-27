// ★BJ368 独立隔离台架——球精灵直驱 shim(GLShimExecutor+GLSpriteLayer) vs 纯 2D 逐像素
//  面:①bridge(分窗) ②acc(累积) ③filter 强制(rasterizeDrawImage) × 旋转 0..360 × zoom
//  不起世界/不起游戏循环——最小受控环境。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj368-iso-harness.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 900, height: 700 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));   // 只需 vite 模块可导入,无需进世界

const out = await page.evaluate(async () => {
  const O = { cases: {} };
  // 球贴图:走游戏 atlas 同源(Image)
  const im = new Image();
  im.src = 'sprites/vanilla/Projectile_404.png';
  await im.decode();

  const { GLShimExecutor } = await import('/src/render/glshim/GLShimExecutor.ts');
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');

  const W = 120, H = 120;
  const mk2d = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    return { c, x: c.getContext('2d', { willReadFrequently: true }) };
  };

  // 一轮绘制序列:球绕中心转,α=1,最近邻;rotN=档数;zoom=缩放;filter=可空
  const drawSeq = (ctx, rotN, zoom, filter, rot0deg = 0) => {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (filter) ctx.filter = filter;
    for (let k = 0; k < rotN; k++) {
      const ang = (rot0deg + k * (360 / rotN)) * Math.PI / 180;
      const cx = W / 2 + Math.cos(ang) * 28 * zoom;
      const cy = H / 2 + Math.sin(ang) * 28 * zoom;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.scale(zoom, zoom);
      ctx.drawImage(im, -15, -13, 30, 32);
      ctx.restore();
    }
    if (filter) ctx.filter = 'none';
    ctx.restore();
  };

  const diff = (a, b) => {
    let big = 0, sum = 0, n = a.length / 4;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let i = 0; i < a.length; i += 4) {
      const dd = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      sum += dd;
      if (dd > 40) {
        big++;
        const xx = (i / 4) % W, yy = Math.floor(i / 4 / W);
        if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx;
        if (yy < by0) by0 = yy; if (yy > by1) by1 = yy;
      }
    }
    return { mean: +(sum / n).toFixed(2), bigPx: big, bigBox: big ? { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } : null };
  };
  const stat = (d) => {
    let white = 0, pale = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r >= 240 && g >= 240 && b >= 240) white++;
      if (r >= 200 && g >= 200 && b >= 200) pale++;
    }
    return { white, pale };
  };

  // ==== ① bridge 模式(GLSpriteLayer 独立上下文 + attach) ====
  const bridgeCase = (tag, rotN, zoom, filter, rot0) => {
    const glCanvas = document.createElement('canvas'); glCanvas.width = W; glCanvas.height = H;
    const glw = new GLSpriteLayer(undefined, true);
    glw.statName = 'bj368iso';
    // GLSpriteLayer 构造不带 canvas——查 resize/begin 用 this.canvas?读注:独立上下文模式需先 canvas 绑定
    return { tag, skip: 'ctor-needs-canvas' };
  };
  // GLSpriteLayer 的 canvas 从哪来?——独立模式在 init() 时用宿主传入?直接探:
  const probe = new GLSpriteLayer();
  O.ctorCanvas = probe.canvas ? { w: probe.canvas.width, h: probe.canvas.height } : null;

  // 更直接:GLPipeline + GLSpriteLayer(pipe) 模式（C10a 后端,与游戏 acc 链同构）
  const { GLPipeline } = await import('/src/render/GLPipeline.ts');
  const pipe = new GLPipeline('bj368pipe');
  const gl = pipe.glx;
  O.glOk = !!gl;
  O.glRenderer = gl ? String(gl.getParameter(gl.RENDERER)) : null;
  if (gl && !pipe.unavailable) {
    const glw = new GLSpriteLayer(pipe, false);
    glw.statName = 'bj368iso';
    glw.resize(W, H);
    // GLSpriteLayer.pipe 模式 present → pipe.canvas;查 pipe.canvas
    O.pipeCanvas = pipe.canvas ? 'yes' : 'no';

    const runGL = (mode, rotN, zoom, filter, rot0) => {
      // host
      const host = {
        acquireGl: () => glw,
        worldCtx: () => out2d.x,
        worldW: () => W,
        worldH: () => H,
        degradeAcc: () => false,
      };
      const shim = new GLShimExecutor(host);
      const target = mk2d();          // out 面(bridge present 落点)
      const out2d = target;
      host.worldCtx = () => target.x;
      let ctx;
      if (mode === 'bridge') {
        ctx = shim.attach(target.x);
        if (!ctx) return { fail: 'attach-null' };
      } else {
        ctx = shim.attachAcc();
        if (!ctx) return { fail: 'attachAcc-null' };
      }
      drawSeq(ctx, rotN, zoom, filter, rot0);
      shim.flush();
      if (mode === 'bridge') shim.detach();
      else { shim.active = false; glw.endAccumulate(); }
      // bridge 模式 presentBatch 已把 FBO blit 到 target(2D);acc 模式需手工 present:
      if (mode === 'acc') {
        const f = glw.isAccumOpen('world') ? null : null;
        // endAccumulate 已在上步行内返回 fbo——重取:
      }
      return target;
    };

    // ---- ① bridge 无 filter 全旋转 ----
    for (const [zoom, tag] of [[1, 'z1'], [1.25, 'z125'], [0.75, 'z075']]) {
      const base = mk2d();
      drawSeq(base.x, 12, zoom, null, 0);
      const got = runGL('bridge', 12, zoom, null, 0);
      if (got && got.c) {
        const d = diff(base.x.getImageData(0, 0, W, H).data, got.x.getImageData(0, 0, W, H).data);
        O.cases[`bridge_${tag}`] = { ...d, stat: stat(got.x.getImageData(0, 0, W, H).data), baseStat: stat(base.x.getImageData(0, 0, W, H).data) };
      } else O.cases[`bridge_${tag}`] = { fail: 'no-out' };
    }
    // ---- ② bridge + filter(rasterizeDrawImage 走不通——bridge 态 filter≠none 走 raw)----
    //      bridge 态 filterV≠none → drawImage 分支:accMode=false → 无 rasterize → raw 直绘
    //      ⇒ filter 面只在 acc 态可达。
    // ---- ③ acc 模式(先在独立 FBO 上累积+present 取回字节) ----
    //      acc 态 present 需 host.worldCtx/世界画布——简化:acc 发射后 readPixels FBO。
    const runAccRead = (rotN, zoom, filter, rot0) => {
      const host = { acquireGl: () => glw, worldCtx: () => null, worldW: () => W, worldH: () => H, degradeAcc: () => false };
      const shim = new GLShimExecutor(host);
      const ctx = shim.attachAcc();
      if (!ctx) return { fail: 'attachAcc-null' };
      drawSeq(ctx, rotN, zoom, filter, rot0);
      shim.flush();               // flushAcc:begin('world',true)+quads 直发
      const fbo = glw.endAccumulate();
      if (!fbo) return { fail: 'no-fbo' };
      const g2 = gl;
      g2.bindFramebuffer(g2.FRAMEBUFFER, fbo.fbo);
      const buf = new Uint8Array(W * H * 4);
      g2.readPixels(0, 0, W, H, g2.RGBA, g2.UNSIGNED_BYTE, buf);
      g2.bindFramebuffer(g2.FRAMEBUFFER, null);
      // GL row0=底 → 翻转
      const out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) {
        out.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      }
      return new ImageData(out, W, H);
    };
    for (const [zoom, tag] of [[1, 'z1'], [1.25, 'z125'], [0.75, 'z075']]) {
      const base = mk2d();
      drawSeq(base.x, 12, zoom, null, 0);
      const imgd = runAccRead(12, zoom, null, 0);
      if (imgd && imgd.data) {
        const d = diff(base.x.getImageData(0, 0, W, H).data, imgd.data);
        O.cases[`acc_${tag}`] = { ...d, stat: stat(imgd.data), baseStat: stat(base.x.getImageData(0, 0, W, H).data) };
      } else O.cases[`acc_${tag}`] = imgd ?? { fail: 'unknown' };
    }
    // ---- ④ acc + filter(球走 rasterizeDrawImage——任务书头号嫌疑) ----
    for (const filt of ['brightness(2.5)', 'brightness(0.5)']) {
      const tag = filt.includes('2.5') ? 'b25' : 'b05';
      const base = mk2d();
      drawSeq(base.x, 12, 1, filt, 0);
      const imgd = runAccRead(12, 1, filt, 0);
      if (imgd && imgd.data) {
        const d = diff(base.x.getImageData(0, 0, W, H).data, imgd.data);
        O.cases[`accfilter_${tag}`] = { ...d, stat: stat(imgd.data), baseStat: stat(base.x.getImageData(0, 0, W, H).data) };
      } else O.cases[`accfilter_${tag}`] = imgd ?? { fail: 'unknown' };
    }
    // ---- ⑤ 高密度旋转(24 档 15°) + zoom1.25 acc——叠影/白底观感面 ----
    {
      const base = mk2d();
      drawSeq(base.x, 24, 1.25, null, 0);
      const imgd = runAccRead(24, 1.25, null, 0);
      if (imgd && imgd.data) {
        const d = diff(base.x.getImageData(0, 0, W, H).data, imgd.data);
        O.cases['acc_dense24'] = { ...d, stat: stat(imgd.data), baseStat: stat(base.x.getImageData(0, 0, W, H).data) };
      }
    }
  }
  return O;
});
console.log('BJ368_ISO=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 10)));
await browser.close();

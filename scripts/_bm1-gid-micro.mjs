// SW-BM1 微探针:getImageData 首读昂贵机制隔离(SwiftShader/headless)。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bm1-micro-' + (Date.now() % 100000), args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if (await page.evaluate(() => !document.getElementById('sw-splash'))) break;
}
const out = await page.evaluate(async () => {
  const r = {};
  const t = () => performance.now();
  const mk = (wf) => {
    const c = document.createElement('canvas');
    c.width = 440; c.height = 968;
    const g = c.getContext('2d', wf ? { willReadFrequently: true } : undefined);
    g.imageSmoothingEnabled = false;
    // 213 个 40×44 小精灵铺进去(模拟烘焙)
    for (let i = 0; i < 213; i++) {
      g.fillStyle = `rgba(${i % 255},${(i * 7) % 255},64,1)`;
      g.fillRect((i % 10) * 44, Math.floor(i / 10) * 44, 40, 44);
    }
    return { c, g };
  };
  // A: 裸读(无 WF)
  { const { c, g } = mk(false); const t0 = t(); g.getImageData(0, 0, 440, 64); r.A_noWF_first64 = +(t() - t0).toFixed(1); const t1 = t(); g.getImageData(0, 0, 440, 64); r.A_noWF_second64 = +(t() - t1).toFixed(1); }
  // B: WF 首读 64 行
  { const { g } = mk(true); const t0 = t(); g.getImageData(0, 0, 440, 64); r.B_WF_first64 = +(t() - t0).toFixed(1); const t1 = t(); g.getImageData(0, 64, 440, 64); r.B_WF_second64 = +(t() - t1).toFixed(1); }
  // C: WF + createImageBitmap 中转(WF scratch 1.7MB)
  { const { c } = mk(true); const t0 = t(); const bmp = await createImageBitmap(c); const mid = t();
    const sc = document.createElement('canvas'); sc.width = 440; sc.height = 968;
    const sg = sc.getContext('2d', { willReadFrequently: true });
    sg.drawImage(bmp, 0, 0); const blit = t();
    sg.getImageData(0, 0, 440, 64); const rd = t();
    r.C_cib = +(mid - t0).toFixed(1); r.C_blit = +(blit - mid).toFixed(1); r.C_read64 = +(rd - blit).toFixed(1); }
  // D: 空白 WF 画布首读(无绘制)
  { const c = document.createElement('canvas'); c.width = 440; c.height = 968;
    const g = c.getContext('2d', { willReadFrequently: true });
    const t0 = t(); g.getImageData(0, 0, 440, 64); r.D_blankWF64 = +(t() - t0).toFixed(1); }
  // F: 复刻应用模式——源=非 WF 小画布(乘色后)逐个 drawImage 进 WF 目标,再读
  { const srcs = [];
    for (let i = 0; i < 213; i++) {
      const s = document.createElement('canvas'); s.width = 40; s.height = 44;
      const sg = s.getContext('2d');                       // 无 WF=GPU 化源(应用 tint 同形态)
      sg.fillStyle = `rgba(${i % 255},${(i * 7) % 255},64,1)`; sg.fillRect(0, 0, 40, 44);
      srcs.push(s);
    }
    const c = document.createElement('canvas'); c.width = 440; c.height = 968;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    for (let i = 0; i < 213; i++) g.drawImage(srcs[i], 0, 0, 40, 44, (i % 10) * 44 + 2, Math.floor(i / 10) * 44, 40, 44);
    const t0 = t(); g.getImageData(0, 0, 440, 64); r.F_srcGPU_WF_first64 = +(t() - t0).toFixed(1);
    const t1 = t(); g.getImageData(0, 64, 440, 64); r.F_second64 = +(t() - t1).toFixed(1);
    // G: 同形态目标但无 WF
    const c2 = document.createElement('canvas'); c2.width = 440; c2.height = 968;
    const g2 = c2.getContext('2d'); g2.imageSmoothingEnabled = false;
    for (let i = 0; i < 213; i++) g2.drawImage(srcs[i], 0, 0, 40, 44, (i % 10) * 44 + 2, Math.floor(i / 10) * 44, 40, 44);
    const t2 = t(); g2.getImageData(0, 0, 440, 64); r.G_srcGPU_noWF_first64 = +(t() - t2).toFixed(1); }
  // H: 复刻应用全形态——15 张共享 GPU 源 + 213 张独立源,6000 次 drawImage 进目标,
  //    对比 (a) 主线程直读整面 (b) createImageBitmap 快照+WF 暂存读(耗时拆 call/resolve)
  { const shared = [];
    for (let i = 0; i < 15; i++) {
      const s = document.createElement('canvas'); s.width = 40; s.height = 1120;
      const sg = s.getContext('2d'); sg.fillStyle = `rgba(${i * 17 % 255},64,128,1)`; sg.fillRect(0, 0, 40, 1120);
      shared.push(s);
    }
    const uniques = [];
    for (let i = 0; i < 213; i++) {
      const s = document.createElement('canvas'); s.width = 40; s.height = 784;
      const sg = s.getContext('2d'); sg.fillStyle = `rgba(${i % 255},200,64,1)`; sg.fillRect(0, 0, 40, 784);
      uniques.push(s);
    }
    const mk2 = (wf) => {
      const c = document.createElement('canvas'); c.width = 440; c.height = 968;
      const g = c.getContext('2d', wf ? { willReadFrequently: true } : undefined);
      g.imageSmoothingEnabled = false;
      const t0 = t();
      for (let i = 0; i < 213; i++) {
        for (let k = 0; k < 27; k++) {
          const src = k < 6 ? shared[k] : uniques[i];
          g.drawImage(src, 0, (k % 20) * 56, 40, 44, (i % 10) * 44 + 2, Math.floor(i / 10) * 44, 40, 44);
        }
      }
      return { c, drawMs: +(t() - t0).toFixed(1) };
    };
    { const { c, drawMs } = mk2(false); const t0 = t(); g_img(c); r.H_noWF_fullRead = +(t() - t0).toFixed(1); r.H_drawMs = drawMs; }
    function g_img(c) { return c.getContext('2d').getImageData(0, 0, 440, 968); }
    { const { c, drawMs } = mk2(true); const t0 = t();
      const p = createImageBitmap(c); const callMs = +(t() - t0).toFixed(1);
      const bmp = await p; const resMs = +(t() - t0).toFixed(1);
      const sc = document.createElement('canvas'); sc.width = 440; sc.height = 968;
      const sg = sc.getContext('2d', { willReadFrequently: true });
      const t1 = t(); sg.drawImage(bmp, 0, 0); const blitMs = +(t() - t1).toFixed(1);
      const t2 = t(); sg.getImageData(0, 0, 440, 64); const rdMs = +(t() - t2).toFixed(1);
      r.H_WF_cibCall = callMs; r.H_WF_cibResolve = resMs; r.H_WF_blit = blitMs; r.H_WF_read64 = rdMs; r.H_WF_drawMs = drawMs; } }
  // E: UA/特性取证
  r.ua = navigator.userAgent; r.gpu = (() => { try { const c = document.createElement('canvas').getContext('webgl'); const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; } catch { return 'err'; } })();
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

import puppeteer from 'puppeteer-core';
// 原位探针:真实游戏(私有实例 ?play=small)+ headed Chrome + DPR2,
// 逐帧统计主画布 drawImage 调用数/耗时分类(源类型/尺寸),验证
// 「drawMapHeads 描边 12×改scratch→blit」在实机 GPU 环境的真实成本,
// 并排查 getImageData/putImageData 回读面。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 },
  args: ['--window-position=3200,2400', '--enable-gpu-rasterization', '--enable-zero-copy'],
});
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let ok = null;
for (let att = 0; att < 10 && !ok; att++) {
  try { await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
  catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

const boot = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 500)); }
  if (!window.__swGame?.player) return 'no game';
  return 'ok';
});
console.log('boot:', boot);
if (boot !== 'ok') { await browser.close(); process.exit(1); }

// 注入插桩(中立性:仅计数与 perf.now 差值,不改变任何绘制语义)
const stats = await page.evaluate(async () => {
  const g = window.__swGame;
  const mainCanvas = g?.renderer?.canvas || document.querySelector('canvas');
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage, origGet = proto.getImageData, origPut = proto.putImageData;
  const S = {
    frames: [], cur: { n: 0, ms: 0, cls: {}, get: 0, put: 0, putMs: 0, getMs: 0 },
    clsOf(src, sw, sh, dw, dh) {
      const t = src instanceof HTMLCanvasElement ? 'canvas' : src instanceof ImageBitmap ? 'bitmap' : src instanceof HTMLImageElement ? 'img' : '?';
      const sw2 = src.width || 0, sh2 = src.height || 0;
      // 头像签名:源 ≤56×48(40×32 头/48×40 合成),目标是小尺寸中心锚 blit
      if (sw2 <= 56 && sh2 <= 48) return `headsrc/${t}`;
      if (sw2 > 1024 || sh2 > 1024) return `big/${t}`;
      return `mid/${t}`;
    },
  };
  proto.drawImage = function (...a) {
    const t0 = performance.now();
    try { return origDraw.apply(this, a); }
    finally {
      const dt = performance.now() - t0;
      S.cur.n++; S.cur.ms += dt;
      const src = a[0];
      const dw = a.length > 5 ? a[5] : (src.width || 0), dh = a.length > 6 ? a[6] : (src.height || 0);
      const k = S.clsOf(src, 0, 0, dw, dh);
      S.cur.cls[k] = S.cur.cls[k] || { n: 0, ms: 0 };
      S.cur.cls[k].n++; S.cur.cls[k].ms += dt;
    }
  };
  proto.getImageData = function (...a) { const t0 = performance.now(); try { return origGet.apply(this, a); } finally { S.cur.get++; S.cur.getMs += performance.now() - t0; } };
  proto.putImageData = function (...a) { const t0 = performance.now(); try { return origPut.apply(this, a); } finally { S.cur.put++; S.cur.putMs += performance.now() - t0; } };
  // 逐帧采样 240 帧
  let done = false;
  const frames = [];
  const tick = () => {
    frames.push(S.cur);
    S.cur = { n: 0, ms: 0, cls: {}, get: 0, put: 0, putMs: 0, getMs: 0 };
    if (frames.length >= 240) { done = true; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  while (!done) { await new Promise(r => setTimeout(r, 100)); }
  // 汇总:去掉前 40 帧(加载余波)
  const f = frames.slice(40);
  const agg = (arr) => arr.reduce((s, x) => s + x, 0);
  const clsAgg = {};
  for (const fr of f) for (const k in fr.cls) { clsAgg[k] = clsAgg[k] || { n: 0, ms: 0 }; clsAgg[k].n += fr.cls[k].n; clsAgg[k].ms += fr.cls[k].ms; }
  return {
    canvasW: mainCanvas?.width, canvasH: mainCanvas?.height, dpr: devicePixelRatio,
    fps: +(f.length / (agg(f.map(x => 1)) && 1) && 0).toFixed(0),
    framesSampled: f.length,
    perFrame: {
      drawImage_n: +(agg(f.map(x => x.n)) / f.length).toFixed(1),
      drawImage_ms: +(agg(f.map(x => x.ms)) / f.length).toFixed(2),
      getImageData_n: +(agg(f.map(x => x.get)) / f.length).toFixed(2),
      getImageData_ms: +(agg(f.map(x => x.getMs)) / f.length).toFixed(2),
      putImageData_n: +(agg(f.map(x => x.put)) / f.length).toFixed(2),
      putImageData_ms: +(agg(f.map(x => x.putMs)) / f.length).toFixed(2),
    },
    classes: Object.fromEntries(Object.entries(clsAgg).map(([k, v]) => [k, {
      n_perFrame: +(v.n / f.length).toFixed(1), ms_perFrame: +(v.ms / f.length).toFixed(2),
      us_perCall: +(v.ms * 1000 / v.n).toFixed(1),
    }])),
    worstFrames: f.map((x, i) => ({ i, ms: +x.ms.toFixed(1), n: x.n })).sort((a, b) => b.ms - a.ms).slice(0, 8),
  };
});
console.log(JSON.stringify(stats, null, 1));
await browser.close();

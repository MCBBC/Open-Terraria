// 一次性:AuroraSky 像素公式光栅性能实测(逐帧 ms)+ 截图目检。
// 用法:SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_aurora-perf.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(async () => {
  const m = await import('/src/render/AuroraSky.ts');
  const aurora = new m.AuroraSky();
  aurora.setActive(true);
  for (let i = 0; i < 10; i++) aurora.update(0.5);        // opacity → 1
  const canvas = document.createElement('canvas');
  canvas.id = 'sw-aurora-probe';
  canvas.width = 1920; canvas.height = 1080;
  canvas.style.width = '1920px'; canvas.style.height = '1080px';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const opts = {
    nightTicks: 16000, isDay: false, moonPhase: 0,
    globalTime: 123.4, camTopTiles: 0, surfaceTiles: 100,
    moonFrac: { x: 0.4, y: 0.15 }, dtSec: 1 / 60,
  };
  let waited = 0;
  aurora.draw(ctx, 1920, 1080, opts);                    // 触发 ensureNoise(懒加载启动)
  while (!m.auroraNoiseReady() && waited < 8000) { await new Promise((r) => setTimeout(r, 50)); waited += 50; }
  const drawOnce = (ph) => {
    const g = ctx.createLinearGradient(0, 0, 0, 1080);    // 深夜底色(观察 lighter 加法)
    g.addColorStop(0, '#05070f'); g.addColorStop(1, '#0a1020');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    opts.moonPhase = ph;
    aurora.draw(ctx, 1920, 1080, { ...opts, globalTime: (performance.now() / 1000) % 3600 });
  };
  for (let i = 0; i < 30; i++) drawOnce(0);              // 预热(JIT)
  const frames = 120;
  const t1 = performance.now();
  for (let i = 0; i < frames; i++) drawOnce(0);
  const perFrameMs = (performance.now() - t1) / frames;
  const perPhase = {};
  for (const ph of [0, 1, 2, 4, 5, 7]) {
    for (let i = 0; i < 10; i++) drawOnce(ph);
    const t2 = performance.now();
    for (let i = 0; i < 30; i++) drawOnce(ph);
    perPhase[ph] = +(((performance.now() - t2) / 30).toFixed(3));
  }
  // 覆盖像素量(带宽旁证):alpha 通道里非纯黑计数
  const px = ctx.getImageData(0, 0, 1920, 1080).data;
  const bg = (y) => 5 + (y / 1080) * 5;                   // 底色梯度近似(r 通道 5→10)
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
  // 极光本体统计:显著高于底色的像素(≥底色+8)+ 行剖面(峰值行)+ 伪影检测:
  //  1px 竖缝 = 某列均值显著高于左右邻列(段界双画/缝隙);块状 = 4px 网格自相关
  let auroraPx = 0;
  const rowMax = new Float64Array(1080);
  for (let y = 0; y < 1080; y++) {
    for (let x = 0; x < 1920; x++) {
      const i = (y * 1920 + x) * 4;
      const v = px[i] + px[i + 1] + px[i + 2];
      const base = bg(y) * 3 + 40;
      if (v > base) { auroraPx++; if (v > rowMax[y]) rowMax[y] = v; }
    }
  }
  let peakRow = 0; for (let y = 1; y < 1080; y++) if (rowMax[y] > rowMax[peakRow]) peakRow = y;
  const colMean = new Float64Array(1920);
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
    const i = (y * 1920 + x) * 4; colMean[x] += (px[i] + px[i + 1] + px[i + 2]) / 1080;
  }
  let seamCols = 0;
  for (let x = 1; x < 1919; x++) {
    if (colMean[x] > colMean[x - 1] + 2.5 && colMean[x] > colMean[x + 1] + 2.5) seamCols++;
  }
  // 极光像素通道主导(带色 hue:绿/青族应 g≥b>r)+ 帘状竖纹(带区内列均值方差)
  let cr = 0, cg = 0, cb = 0, cn = 0;
  for (let y = 0; y < 588; y += 3) for (let x = 0; x < 1920; x += 3) {
    const i = (y * 1920 + x) * 4;
    if (px[i] + px[i + 1] + px[i + 2] > bg(y) * 3 + 40) { cr += px[i]; cg += px[i + 1]; cb += px[i + 2]; cn++; }
  }
  let cm = 0; for (let x = 0; x < 1920; x++) cm += colMean[x]; cm /= 1920;
  let colVar = 0; for (let x = 0; x < 1920; x++) colVar += (colMean[x] - cm) ** 2;
  colVar /= 1920;
  // 4px 块状检测:块边(x%4==0)平均 |列差| vs 块内
  let edgeDiff = 0, innerDiff = 0, ne = 0, ni = 0;
  for (let x = 1; x < 1919; x++) {
    const d = Math.abs(colMean[x] - colMean[x - 1]);
    if (x % 4 === 0) { edgeDiff += d; ne++; } else { innerDiff += d; ni++; }
  }
  let peakRowRange = [0, 0]; { let s = -1; for (let y = 0; y < 1080; y++) { const on = rowMax[y] > 60; if (on && s < 0) s = y; if (!on && s >= 0) { peakRowRange = [s, y - 1]; break; } if (on) peakRowRange = [s, y]; } }
  const png = canvas.toDataURL('image/png');              // 画布自身位图(免页面层遮挡)
  return {
    ready: m.auroraNoiseReady(), waited,
    perFrameMs: +perFrameMs.toFixed(3), perPhase,
    litPx: lit, quality: m.AURORA_QUALITY,
    auroraPx, peakRow, bandRows: peakRowRange, seamCols,
    auroraMeanRGB: [+(cr / cn).toFixed(1), +(cg / cn).toFixed(1), +(cb / cn).toFixed(1), cn],
    colStd: +Math.sqrt(colVar).toFixed(2),
    blockEdgeDiff: +(edgeDiff / ne).toFixed(3), blockInnerDiff: +(innerDiff / ni).toFixed(3),
    png,
  };
});
const { png, ...stats } = out;
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/aurora-shot.png', Buffer.from(png.split(',')[1], 'base64'));
console.log(JSON.stringify(stats, null, 1));
await browser.close();

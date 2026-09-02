// dust 预乘混合批(Renderer.drawVanillaDustPass):性能前后对比 + 浏览器实测等价性。
// ① 游戏实机:spawn 受控尘组 → 直接计时 drawVanillaDustPass(lit/fullbright)单次耗时;
// ② 微观 A/B:同一真实 atlas 帧上,旧管线(getImageData 源覆盖 source-over)vs
//    新管线(烘焙对 destination-out+lighter)vs XNA 预乘公式,三方逐像素对拍 + 原语计时。
// 用法:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_dust-pm-bench.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/dust-pm-bench-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto(`${ORIGIN}/debug-line.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));

// ---------- ① 实机 pass 计时 ----------
const gameBench = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const vd = g.vanillaDust;
  // 受控尘组:300 默认档(76 雪)+100 全亮(6 烟)+100 全亮(15)+100 拖影族(130 带速)+100 colorPass(76+color)
  // spawn 位置全部落在视口中心 400×300 窗内(世界坐标)
  const cx = cam.x, cy = cam.y;
  const put = (n, fn) => { for (let i = 0; i < n; i++) fn(cx - 200 + Math.random() * 400, cy - 150 + Math.random() * 300); };
  put(300, (x, y) => vd.spawn(x, y, 8, 8, 76, 0, 0, 120));
  put(100, (x, y) => vd.spawn(x, y, 8, 8, 6));
  put(100, (x, y) => vd.spawn(x, y, 8, 8, 15));
  put(100, (x, y) => vd.spawn(x, y, 8, 8, 130, 2.5, 1.5));
  put(100, (x, y) => { const d = vd.spawn(x, y, 8, 8, 76, 0, 0, 120); if (d) { d.color = { r: 250, g: 120, b: 40, a: 200 }; } });
  let lit = 0, fb = 0;
  for (const d of vd.each(false)) lit++;
  for (const d of vd.each(true)) fb++;
  const r = g.renderer;
  const pass = r['drawVanillaDustPass'].bind(r);
  for (let i = 0; i < 15; i++) { pass(false, cam); pass(true, cam); }   // 热身+烘焙缓存填充
  const N = 150;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) pass(false, cam);
  const litMs = (performance.now() - t0) / N;
  t0 = performance.now();
  for (let i = 0; i < N; i++) pass(true, cam);
  const fbMs = (performance.now() - t0) / N;
  return { lit, fb, litMsUs: +(litMs * 1000).toFixed(1), fbMsUs: +(fbMs * 1000).toFixed(1) };
});
console.log('[实机 pass]', JSON.stringify(gameBench));

// ---------- ② 微观 A/B + 等价性(真实 atlas 帧) ----------
const micro = await page.evaluate(async () => {
  const blob = await (await fetch('/sprites/vanilla/Dust.png')).blob();
  const bmp = await createImageBitmap(blob);
  const fx = 0, fy = 0;                                    // type 0 帧区域(8×8)
  const rgb = 120 / 255, a = 120 / 255;                    // 默认档 num=(255−alpha)/255
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // 已知背景:渐变(含高亮/低亮区)
  const bg = mk(64, 64), bctx = bg.getContext('2d', { willReadFrequently: true });
  const bid = bctx.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    bid.data[i * 4] = (i * 7) % 256; bid.data[i * 4 + 1] = (i * 13) % 256;
    bid.data[i * 4 + 2] = (i * 29) % 256; bid.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(bid, 0, 0);
  // 贴图采样(直色 RGBA)
  const samp = mk(8, 8), sctx = samp.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(bmp, fx, fy, 8, 8, 0, 0, 8, 8);
  const tex = sctx.getImageData(0, 0, 8, 8).data;

  // --- 旧管线(改前 drawVanillaDustPass 本体:RGB×rgb、A×a → source-over;复用暂存,同真实代码) ---
  const s1 = mk(8, 8), c1 = s1.getContext('2d', { willReadFrequently: true });
  const oldRun = (dst) => {
    c1.clearRect(0, 0, 8, 8);
    c1.drawImage(bmp, fx, fy, 8, 8, 0, 0, 8, 8);
    const id = c1.getImageData(0, 0, 8, 8);
    for (let i = 0; i < id.data.length; i += 4) {
      id.data[i] *= rgb; id.data[i + 1] *= rgb; id.data[i + 2] *= rgb; id.data[i + 3] *= a;
    }
    c1.putImageData(id, 0, 0);
    dst.drawImage(s1, 0, 0);
  };
  // --- 新管线(烘焙对:destination-out erase(alpha=texA×a) + lighter add(RGB=texP×rgb,A=255)) ---
  const mR = Math.round(rgb * 255), mA = Math.round(a * 255);   // 乘数字节化(与实现一致)
  const bakePair = () => {
    const add = new Uint8ClampedArray(8 * 8 * 4), erase = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < tex.length; i += 4) {
      const tA = tex[i + 3];
      add[i] = tex[i] * tA * mR / 65025; add[i + 1] = tex[i + 1] * tA * mR / 65025;
      add[i + 2] = tex[i + 2] * tA * mR / 65025; add[i + 3] = 255;
      erase[i + 3] = tA * mA / 255;
    }
    const ac = mk(8, 8); ac.getContext('2d').putImageData(new ImageData(add, 8, 8), 0, 0);
    const ec = mk(8, 8); ec.getContext('2d').putImageData(new ImageData(erase, 8, 8), 0, 0);
    return { add: ac, erase: ec };
  };
  const pair = bakePair();
  const newRun = (dst) => {
    dst.globalAlpha = 1;
    dst.globalCompositeOperation = 'destination-out';
    dst.drawImage(pair.erase, 0, 0);
    dst.globalCompositeOperation = 'lighter';
    dst.drawImage(pair.add, 0, 0);
    dst.globalCompositeOperation = 'source-over';
  };
  // 三方对拍:dst 复制自同一背景 → 各自画尘 → 读回
  const runOn = (fn) => {
    const d = mk(64, 64), dctx = d.getContext('2d', { willReadFrequently: true });
    dctx.drawImage(bg, 0, 0);
    fn(dctx);
    return dctx.getImageData(0, 0, 64, 64).data;
  };
  const oldOut = runOn(oldRun);
  const newOut = runOn(newRun);
  // XNA 公式(浮点独立推导):final = dst×(1−texA×a) + tex.rgb×tex.a×rgb,单次 clamp
  let oldErr = 0, newErr = 0, oldBad = 0, newBad = 0;
  for (let py = 0; py < 8; py++) for (let px = 0; px < 8; px++) {
    const ti = (py * 8 + px) * 4, di = (py * 64 + px) * 4;
    const tA = tex[ti + 3] / 255;
    for (let ch = 0; ch < 3; ch++) {
      const dstv = bid.data[di + ch];
      const exp = Math.min(255, dstv * (1 - tA * a) + tex[ti + ch] / 255 * tA * rgb * 255);
      const oe = Math.abs(oldOut[di + ch] - exp), ne = Math.abs(newOut[di + ch] - exp);
      oldErr = Math.max(oldErr, oe); newErr = Math.max(newErr, ne);
      if (oe > 2) oldBad++; if (ne > 2) newBad++;
    }
  }
  // 原语计时:512 尘 × 200 帧(缓存命中稳态;旧管线含逐尘 getImageData/putImageData)
  const N2 = 200, M = 512;
  const time = (fn) => {
    for (let i = 0; i < 20; i++) fn();
    const t0 = performance.now();
    for (let i = 0; i < N2; i++) for (let j = 0; j < M; j++) fn();
    return (performance.now() - t0) / (N2 * M) * 1000;   // µs/尘
  };
  const oldUs = time(() => oldRun(bctx));
  const newUs = time(() => newRun(bctx));
  return { oldMaxErr: +oldErr.toFixed(2), newMaxErr: +newErr.toFixed(2), oldBadPx: oldBad, newBadPx: newBad, oldUsPerDust: +oldUs.toFixed(2), newUsPerDust: +newUs.toFixed(2) };
});
console.log('[微观 A/B+等价]', JSON.stringify(micro));
await browser.close();

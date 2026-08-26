// GenWorldPreview 位图模式"擦除揭示"验证：
// 首帧白色 → 第 40 tick 注入黑帧 → 逐模拟帧采样 show 缓冲左起黑色边界，
// 断言 ①注入前无变化 ②边界随时间从左向右单调推进 ③最终全屏换新。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + ORIGIN + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await page.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
if (!menuOk) { console.log('主菜单未挂载'); await browser.close(); process.exit(1); }

const out = await page.evaluate(async () => {
  const { GenWorldPreview } = await import('/src/vui/states/GenWorldPreview.ts');
  const W = 640, H = 180;
  const mk = (r, g, b) => { const a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < a.length; i += 4) { a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; } return a; };
  const isNewColor = (d, x) => d[x * 4] === 0 && d[x * 4 + 1] === 200;   // 新帧绿色
  const isYel = (c) => c && c.r > 230 && c.g > 180 && c.b < 160;          // 指示线
  const p = new GenWorldPreview();
  p.setPreviewFrame(mk(255, 255, 255), W, H);      // 白首帧
  p.setPreviewFrame(mk(255, 255, 255), W, H);      // 同尺寸第二帧（走 wipe 常规路径）
  p.recalculate();                                  // 独立实例：默认 provider=全屏逻辑尺寸
  const D = p.getDimensions();
  const rects = [];                                 // 每次 drawSelf 的黄色 fillRect 记录
  const fakeBatch = {
    draw() {}, fillRect(x, y, w, h, c) { if (isYel(c)) rects.push({ x, y, w, h }); },
  };
  const edges = [];   // 每模拟帧左起新色像素数（未到=0，全过=W）
  let yellowAtMidwipe = false, yellowMatchesEdge = false, bufCleanAtEdge = true;
  for (let f = 0; f < 140; f++) {
    if (f === 40) p.setPreviewFrame(mk(0, 200, 0), W, H);   // 绿帧注入
    p.update();                                     // 元素 update = 每渲染帧一次
    const before = rects.length;
    p.drawSelf(fakeBatch);
    const frac = p.revealX / W;
    const active = frac > 0 && frac < 1;
    const ys = rects.slice(before);
    if (active && ys.length >= 2 && ys.some((r) => r.w <= 3)) {   // 光晕+主线都有
      yellowAtMidwipe = true;
      const ex = D.x + D.width * frac;
      const main = ys.find((r) => r.w <= 3);
      if (Math.abs(main.x + main.w / 2 - ex) <= 3) yellowMatchesEdge = true;
    }
    if (!active && ys.length > 0) console.log('意外：非揭示期出现指示线', JSON.stringify(ys));
    const d = p.showCtx.getImageData(0, 0, W, 1).data;
    let e = 0; while (e < W && isNewColor(d, e)) e++;
    // 前沿像素本身必须还是纯净新帧色（线只画显示层，不写入缓冲）
    if (e > 0 && e < W && !(isNewColor(d, Math.max(0, e - 1)))) bufCleanAtEdge = false;
    edges.push(e);
    await new Promise((r) => setTimeout(r, 16));    // ≈60Hz
  }
  const after = edges.slice(40);
  let mono = true;
  for (let i = 1; i < after.length; i++) if (after[i] < after[i - 1]) mono = false;
  return {
    beforeAllZero: edges.slice(0, 40).every((e) => e === 0),
    monotonicL2R: mono,
    finalFull: after[after.length - 1] === W,
    doneAfterNFrames: after.findIndex((e) => e === W),   // 相对注入点；wipe≈72 帧
    sampleIdx: [0, 20, 39, 50, 70, 90, 110, 139].map((i) => edges[i]),
    yellowSeenWhileWiping: yellowAtMidwipe,
    yellowTracksFrontier: yellowMatchesEdge,
    frameBufferClean: bufCleanAtEdge,
    dims: { x: D.x, y: D.y, w: D.width, h: D.height },
  };
});
console.log(JSON.stringify(out, null, 2));
const ok = out.beforeAllZero && out.monotonicL2R && out.finalFull
  && out.yellowSeenWhileWiping && out.yellowTracksFrontier && out.frameBufferClean;
console.log(ok ? 'PASS: 黑色新帧从左到右单调刷过并铺满' : 'FAIL');
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
process.exit(ok ? 0 : 1);

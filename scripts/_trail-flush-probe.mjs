// flushTrailShade 链实机探针（2026-09-03 黑椭圆止血+月牙恢复验证）。
// 模拟 SwingArc 推队列 → flush → 主画布差分：①月牙亮回来（彩色 lit 增量>0）
// ②黑椭圆不再（近黑像素增量≈0——'lighter' 加算只会增亮不替换）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const { prewarmTrailTextures } = await import('/src/fx/TrailShader.ts');
  prewarmTrailTextures(g.renderer.atlas);
  await new Promise(r => setTimeout(r, 800));
  // 玩家上方 300px 天空窗
  const wy0 = p.cy - 300;
  const scr = (wx, wyy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wyy - cam.y) * cam.zoom + cv.height / 2),
  ];
  const sample = () => {
    const [sx, sy] = scr(p.cx - 180, wy0 - 60);
    const w = Math.round(360 * cam.zoom), h = Math.round(120 * cam.zoom);
    const img = g.renderer.ctx.getImageData(Math.max(0, sx), Math.max(0, sy), w, h).data;
    let lum = 0, dark = 0;
    for (let i = 0; i < img.length; i += 4) {
      lum += img[i] + img[i + 1] + img[i + 2];
      if (img[i] + img[i + 1] + img[i + 2] < 60) dark++;
    }
    return { lum, dark, px: img.length / 4 };
  };
  const z = cam.zoom;
  const pts = Array.from({ length: 12 }, (_, i) => ({
    x: p.cx - 160 + i * 29, y: wy0, hw: 12, rot: 0,
    r: 0.9, g: 0.75, b: 0.4, a: 0.5,
  }));
  const before = sample();
  // 推队列（FinalFractal=天顶剑同 set）+ flush（private 直调）
  g.renderer.queueTrailShade({ set: 'FinalFractal', pts, opacity: 1, expectedPairs: 60, time: performance.now() / 1000, zigzag: 0.5 });
  g.renderer.flushTrailShade(cam, z, cv.width, cv.height);
  const after = sample();
  // 判定（'lighter' 加算正确口径）：①darkDelta=黑椭圆（应≈0/负——加算不替换）
  //  ②lumDelta>1=条带画上（月牙回来;chroma 口径在加算推向白时假阴）
  const lumPerPx = (a) => a.lum / a.px;
  return {
    darkDelta: after.dark - before.dark,
    lumDelta: Math.round(lumPerPx(after) - lumPerPx(before)),
  };
});
console.log(JSON.stringify(out));
await browser.close();

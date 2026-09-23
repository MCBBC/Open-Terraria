// BJ314 像素恒等基准捕获：当前 canvas 染色烘焙路径的输出指纹（落刀前后必须全等）。
// 画布:离屏 340×340;输入:projSprite(972) + arcLayerList(972,0.4,1,0.8) + tneGhostLayers
// 三组参数;输出:getImageData 逐字节 FNV-1a 哈希 + 非零像素计数。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 640, height: 480 } });
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const { projSprite } = await import('/src/entities/Arrow.ts');
  // 等贴图落地（draw 前必须 width>0）
  for (let i = 0; i < 300; i++) {
    const img = projSprite(972);
    if (img && img.width > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const img = projSprite(972);
  if (!img || img.width <= 0) return { error: 'sprite not loaded' };
  const arcMod = await import('/src/entities/SwingArc.ts');
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 400;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const hashOf = (label) => {
    const d = ctx.getImageData(0, 0, 400, 400).data;
    let h = 0x811c9dc5, nz = 0;
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== 0) nz++;
      h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0;
    }
    return { label, hash: h.toString(16), nonzero: nz };
  };
  const res = [];
  // 面1: 972 锚弧 mid-swing（num=0.4, fv=1 白日, op=0.8）
  ctx.clearRect(0, 0, 400, 400);
  arcMod.drawArcLayers(ctx, img, 200, 200, 0.7, 1, 1.1, arcMod.arcLayerList(972, 0.4, 1, 0.8));
  res.push(hashOf('arc972-mid'));
  // 面2: 972 全亮尾段（num=0.85）
  ctx.clearRect(0, 0, 400, 400);
  arcMod.drawArcLayers(ctx, img, 200, 200, 2.2, 1, 1.1, arcMod.arcLayerList(972, 0.85, 1, 0.62));
  res.push(hashOf('arc972-late'));
  // 面3: 973 残影链（amount=0.6, num8=0.5, fv=0.8, n3=0.7）
  const img973 = (() => { void 0; return img; })();
  ctx.clearRect(0, 0, 400, 400);
  arcMod.drawArcLayers(ctx, img973, 200, 200, 1.1, 1, 1.1, arcMod.tneGhostLayers(0.6, 0.5, 0.8, 0.7));
  res.push(hashOf('tne-ghost'));
  // 面4: 二次重绘同参数（缓存命中面,输出必须与面1逐字节同）
  ctx.clearRect(0, 0, 400, 400);
  arcMod.drawArcLayers(ctx, img, 200, 200, 0.7, 1, 1.1, arcMod.arcLayerList(972, 0.4, 1, 0.8));
  res.push(hashOf('arc972-mid-2nd'));
  return { res, imgW: img.width, imgH: img.height };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);

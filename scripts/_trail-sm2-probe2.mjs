import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.text().startsWith('[probe]')) console.log(m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = {};
  const { drawStripTrail, prewarmTrailTextures } = await import('/src/fx/TrailShader.ts');
  res.hasAtlas = !!g.renderer.atlas;
  try { prewarmTrailTextures(g.renderer.atlas); res.prewarm = 'ok'; } catch (e) { res.prewarm = String(e); }
  await new Promise(r => setTimeout(r, 800));
  const off = document.createElement('canvas');
  off.width = 640; off.height = 200;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const pts = Array.from({ length: 12 }, (_, i) => ({ x: 60 + i * 46, y: 100, hw: 10, r: 1, g: 0.3, b: 0.1, a: 0.5 }));
  res.ret = drawStripTrail(octx, g.renderer, { set: 'FlameLash', pts, opacity: 4, time: 1.25 });
  const img = octx.getImageData(0, 0, 640, 200).data;
  let lit = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i] + img[i+1] + img[i+2] > 30) lit++;
  res.lit = lit;
  return res;
});
console.log(JSON.stringify(out));
await browser.close();

import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch {} });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'rainbowroad', size: 0, name: 'iii227a', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
let ok = false; const t1 = Date.now();
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const rep = await page.evaluate(() => {
  const atlas = globalThis.__swGame.chunks.atlasRef ?? globalThis.__swGame.chunks.atlas;
  const out = {};
  for (const sh of [126, 711, 719, 160, 666]) {
    const file = `vanilla/Tiles_${sh}.png`;
    const img = atlas.ensureVImage(file);
    const meta = atlas.vmeta(sh);
    out[sh] = {
      img: img ? { w: img.width, h: img.height } : null,
      failed: atlas.vImageFailed?.(file) ?? null,
      meta: meta ? { cols: meta.cols, rows: meta.rows, stride: meta.stride, grid: meta.grid } : null,
      vframe00: atlas.vframe(sh, 0, 0) ?? null,
      vframeAt18: atlas.vframeAt(sh, 18, 18) ?? null,
    };
  }
  return out;
});
console.log(JSON.stringify(rep, null, 1));
await browser.close();

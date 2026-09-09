// ★IIIII227 探针②d：懒加载晚到自愈核验——读格→强制重烘→等待→复读。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch {} });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'rainbowroad', size: 0, name: 'iii227l', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
let ok = false; const t1 = Date.now();
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const rep = await page.evaluate(async () => {
  const { TILE, CHUNK } = await import('/src/core/constants.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = globalThis.__swGame;
  const world = g.world, st = world.store;
  const w = world.w, h = world.h;
  const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  const out = {};
  for (const sh of [719, 711, 126]) {
    const idT = bySheet(sh);
    const cells = [];
    for (let k = 0; k < 60000 && cells.length < 2; k++) {
      const x = 60 + ((k * 1103) % (w - 120));
      const y = 60 + ((k * 733) % (h - 120));
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== idT) continue;
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
      const rd = () => {
        const pair = g.chunks.get(cx, cy);
        const lx = x % CHUNK, ly = y % CHUNK;
        const img = pair.tile.getContext('2d').getImageData(pair.sx + lx * TILE, pair.sy + ly * TILE, TILE, TILE).data;
        let n = 0;
        for (let p = 3; p < img.length; p += 4) if (img[p] > 0) n++;
        return n;
      };
      const immediate = rd();
      g.chunks.markDirtyAround(x, y); g.chunks.flushDirty(64, 300);
      const rebaked = rd();
      await new Promise((r) => setTimeout(r, 3000));   // 等图像晚到+自愈重烘
      g.chunks.markDirtyAround(x, y); g.chunks.flushDirty(64, 300);
      const afterWait = rd();
      const img = g.chunks.atlasRef?.ensureVImage?.(`vanilla/Tiles_${sh}.png`) ?? g.chunks.atlas?.ensureVImage?.(`vanilla/Tiles_${sh}.png`);
      cells.push({ x, y, immediate, rebaked, afterWait, imgLoaded: img ? `${img.width}x${img.height}` : null });
    }
    out[sh] = cells;
  }
  return out;
});
console.log(JSON.stringify(rep));
await browser.close();

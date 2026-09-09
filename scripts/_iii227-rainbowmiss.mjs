// ★IIIII227 探针②c：719/126/711 零像素取证——帧数据/atlas 命中/强制重烘差分。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=900000 scripts/_iii227-rainbowmiss.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });
const BUST = Date.now();

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'rainbowroad', size: 0, name: 'iii227rm', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
let ok = false;
const t1 = Date.now();
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ok) { console.error('not ready'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const rep = await page.evaluate(async (bust) => {
  const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const g = globalThis.__swGame;
  const world = g.world, st = world.store;
  const w = world.w, h = world.h;
  const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  const out = {};
  for (const sh of [719, 126, 711]) {
    const idT = bySheet(sh);
    const def = TILE_DEFS[idT];
    const cells = [];
    for (let k = 0; k < 60000 && cells.length < 3; k++) {
      const x = 60 + ((k * 1103) % (w - 120));
      const y = 60 + ((k * 733) % (h - 120));
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== idT) continue;
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
      const lx = x % CHUNK, ly = y % CHUNK;
      const rd = (pair) => {
        const img = pair.tile.getContext('2d').getImageData(pair.sx + lx * TILE, pair.sy + ly * TILE, TILE, TILE).data;
        let n = 0;
        for (let p = 3; p < img.length; p += 4) if (img[p] > 0) n++;
        return n;
      };
      const before = rd(g.chunks.get(cx, cy));
      g.chunks.markDirtyAround(x, y);
      g.chunks.flushDirty(64, 300);
      const after = rd(g.chunks.get(cx, cy));
      cells.push({
        x, y, frameX: st.frameX[i], frameY: st.frameY[i],
        vanillaFrame: def?.vanilla?.frame, fw: def?.vanilla?.fw, fh: def?.vanilla?.fh,
        opaqueBefore: before, opaqueAfterRebake: after,
      });
    }
    out[sh] = { defSheet: def?.vanilla, cells };
  }
  // 贴图真身尺寸（ensureVImage 命中面）
  const atlas = g.chunks.atlasRef ?? g.chunks.atlas;
  out.atlasKeys = atlas ? Object.keys(atlas).slice(0, 6) : null;
  return out;
}, BUST);

writeFileSync(`${OUT}/rainbowmiss-report.json`, JSON.stringify(rep, null, 1));
console.log('written');
await browser.close();

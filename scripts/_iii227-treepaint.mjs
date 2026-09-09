// ★IIIII227 探针④：树族油漆通道验收——drawTreeCell paint 源染色差分（0 vs 30/27）。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=900000 scripts/_iii227-treepaint.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });
const BUST = Date.now();

const CASES = [
  { seed: 'negativeinfinity', paint: 30, tag: 'negative' },
  { seed: 'monochrome', paint: 27, tag: 'gray' },
];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
const report = [];
for (const { seed, paint, tag } of CASES) {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
  await page.evaluate((s) => {
    void window.__swFlow.createWorldProbe({ seed: s, size: 0, name: 'iii227t', difficulty: 0, evil: 0 })?.catch?.(() => {});
  }, seed);
  let ok = false; const t1 = Date.now();
  while (Date.now() - t1 < 420000) {
    ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) { report.push({ seed, error: 'not ready' }); continue; }
  const rep = await page.evaluate(async (bust, paintId) => {
    const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
    const g = globalThis.__swGame;
    const world = g.world, st = world.store;
    const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
    const idTree = bySheet(5);
    // 找一个冠标记格（fy>=198 fx>=22）
    let crown = null;
    for (let k = 0; k < 80000 && !crown; k++) {
      const x = 60 + ((k * 1103) % (st.w - 120));
      const y = 60 + ((k * 733) % (st.h - 120));
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === idTree && st.frameY[i] >= 198 && st.frameX[i] >= 22) crown = { x, y, fx: st.frameX[i], fy: st.frameY[i] };
    }
    if (!crown) return { crown: false };
    const { drawTreeCell } = await import(`/src/render/VanillaTiler.ts?t=${bust}`);
    const render = (p) => {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.imageSmoothingEnabled = false;
      drawTreeCell(c2, g.chunks.autotiler.atlas, st, crown.x, crown.y, crown.fx, crown.fy,
        64, 64, 5, true, { treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
          worldSurface: world.groundLevel, worldW: world.w }, 0, undefined, p);
      return c2.getImageData(0, 0, 128, 128).data;
    };
    const raw = render(0), tinted = render(paintId);
    let opaque = 0, diff = 0, grayAll = true, invMatch = 0, invTotal = 0;
    for (let p = 0; p < raw.length; p += 4) {
      if (raw[p + 3] === 0) continue;
      opaque++;
      if (raw[p] !== tinted[p] || raw[p + 1] !== tinted[p + 1] || raw[p + 2] !== tinted[p + 2]) diff++;
      if (tinted[p] !== tinted[p + 1] || tinted[p + 1] !== tinted[p + 2]) grayAll = false;
      if (paintId === 30) { invTotal++; if (tinted[p] === 255 - raw[p] && tinted[p + 1] === 255 - raw[p + 1] && tinted[p + 2] === 255 - raw[p + 2]) invMatch++; }
    }
    // 相机对准树冠 + 截图
    g.camera.x = crown.x * TILE + 8; g.camera.y = crown.y * TILE - 32;
    g.player.x = crown.x * TILE + 8; g.player.y = (crown.y - 3) * TILE;
    return { crown, opaque, tintedDiffPx: diff, grayAll, invMatch, invTotal, paintCell: st.paint[st.idx(crown.x, crown.y)] };
  }, BUST, paint);
  report.push({ seed, tag, ...rep });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/tree-${tag}.png` });
}
writeFileSync(`${OUT}/treepaint-report.json`, JSON.stringify(report, null, 1));
console.log('written');
await browser.close();

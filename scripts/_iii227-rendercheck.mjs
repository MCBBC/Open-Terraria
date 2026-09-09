// ★IIIII227 探针②b：poo 666 / rainbow 族渲染核验（中心像素读法，防角像素透明伪红）。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=900000 scripts/_iii227-rendercheck.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });
const BUST = Date.now();

const SEEDS = [
  { seed: 'truckstop', sheets: [666] },
  { seed: 'rainbowroad', sheets: [627, 719, 160, 692, 711, 126] },
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));

const report = { seeds: [], pageErrors: errs };
for (const { seed, sheets } of SEEDS) {
  console.log('==', seed);
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
  await page.evaluate((s) => {
    void window.__swFlow.createWorldProbe({ seed: s, size: 0, name: 'iii227rc', difficulty: 0, evil: 0 })?.catch?.(() => {});
  }, seed);
  const t1 = Date.now();
  let ok = false;
  while (Date.now() - t1 < 420000) {
    ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) { report.seeds.push({ seed, error: 'not ready' }); continue; }
  await new Promise((r) => setTimeout(r, 1500));
  const rep = await page.evaluate(async (bust, sheetList, seedName) => {
    const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
    const g = globalThis.__swGame;
    const world = g.world, st = world.store;
    const w = world.w, h = world.h;
    const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
    const out = { seed: seedName, sheets: {} };
    for (const sh of sheetList) {
      const idT = bySheet(sh);
      if (idT <= 0) { out.sheets[sh] = { def: false }; continue; }
      // 每 sheet 采 6 格（不同深度带），读 16×16 区 alpha 覆盖率 + 中心像素
      const cells = [];
      for (let k = 0; k < 60000 && cells.length < 6; k++) {
        const x = 60 + ((k * 1103) % (w - 120));
        const y = 60 + ((k * 733) % (h - 120));
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] !== idT) continue;
        const pair = g.chunks.get(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
        const lx = x % CHUNK, ly = y % CHUNK;
        const img = pair.tile.getContext('2d').getImageData(pair.sx + lx * TILE, pair.sy + ly * TILE, TILE, TILE).data;
        let opaque = 0;
        for (let p = 3; p < img.length; p += 4) if (img[p] > 0) opaque++;
        cells.push({ x, y, opaqueOf256: opaque, center: [img[(8 * TILE + 8) * 4], img[(8 * TILE + 8) * 4 + 1], img[(8 * TILE + 8) * 4 + 2], img[(8 * TILE + 8) * 4 + 3]] });
      }
      out.sheets[sh] = { def: true, sampled: cells.length, cells };
    }
    return out;
  }, BUST, sheets, seed);
  report.seeds.push(rep);
}
writeFileSync(`${OUT}/rendercheck-report.json`, JSON.stringify(report, null, 1));
console.log('written; errs=', errs.length);
await browser.close();

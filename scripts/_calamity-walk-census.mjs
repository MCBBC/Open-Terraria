// 在页内普查 mod tile 分布(调试探针;找硫磺沙真实位置)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox'],
  userDataDir: `/tmp/sw-cal-census-${Date.now() % 100000}`,
});
const page = await browser.newPage();
try {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => typeof (window).__swMods === 'object' && typeof (window).__swFlow === 'object', { timeout: 180000 });
  await page.evaluate(async () => {
    const res = await fetch('/mods/dist/calamity.swmod');
    await (window).__swMods.install(new Uint8Array(await res.arrayBuffer()));
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => !!((window).__swMods?.result?.()?.allocation?.items?.size > 2000), { timeout: 240000 });
  await page.waitForFunction(() => typeof (window).__swFlow?.createWorldProbe === 'function', { timeout: 120000 });
  await page.evaluate(() => { void (window).__swFlow.createWorldProbe({ name: 'census', seed: '9293480', w: 4200, h: 1200, size: 0, difficulty: 0, evil: 0 })?.catch?.(() => {}); });
  await page.waitForFunction(() => { const g = (window).__swGame; return !!g && !!g.world && g.world.store?.w > 0; }, { timeout: 300000, polling: 2000 });
  await new Promise((r) => setTimeout(r, 2000));
  const census = await page.evaluate(async () => {
    const g = (window).__swGame;
    const store = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const sandId = TILE_BY_KEY['mod_calamity_sulphurous_sand'];
    const gravelId = TILE_BY_KEY['mod_calamity_abyss_gravel'];
    const out = { w: store.w, h: store.h, sandId, gravelId, sand: 0, gravel: 0, bbox: null, cols: {} };
    let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
    for (let x = 0; x < store.w; x += 2) {
      for (let y = 0; y < store.h; y += 2) {
        const i = store.idx(x, y);
        const t = store.type[i];
        if (t === sandId) { out.sand++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
        if (t === gravelId) out.gravel++;
      }
    }
    out.bbox = `${minx},${miny} - ${maxx},${maxy}`;
    return out;
  });
  console.log(JSON.stringify(census));
} finally {
  await browser.close();
  process.exit(0);
}

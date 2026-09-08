// ★IIIII218 补充定位探针：zenith 世界漆面格 mapColor24 vs Minimap.colorFor 残差全量 dump。
// SW_ORIGIN=http://localhost:5275 node tools/run-diag.mjs --timeout=600000 scripts/_iii218-templedump.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5275';
const OUT = '/tmp/iii218-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate((cfg) => {
  void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
}, { seed: 'get fixed boi', size: 0, name: 'iii218d', difficulty: 0, evil: 0 });
const t1 = Date.now();
while (Date.now() - t1 < 300000) {
  const ok = await page.evaluate(() => !!globalThis.__swGame?.renderer?.minimap).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}

const dump = await page.evaluate(async (bust) => {
  const { mapColor24 } = await import(`/src/render/MapColors.ts?t=${bust}`);
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const { WALL_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const g = globalThis.__swGame;
  const world = g.world, st = world.store, mm = g.renderer.minimap;
  const bg = {
    groundLevel: world.groundLevel, rockLevel: world.rockLevel,
    underworld: world.lavaLine > 0 ? world.lavaLine : undefined,
    remix: !!world.seedFlags?.remix,
  };
  const SHEET = new Int32Array(st.type.length);
  for (let i = 0; i < st.type.length; i++) SHEET[i] = TILE_DEFS[i]?.vanilla?.sheet ?? -1;
  const rows = [];
  const hist = {};
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const i = st.idx(x, y);
      const t = st.flags[i] ? st.type[i] : 0;
      const paint = st.paint[i] > 0 ? st.paint[i] : 0;
      const wpaint = st.paintWall[i] > 0 ? st.paintWall[i] : 0;
      if (!(paint || wpaint)) continue;
      const active = t !== 0 && st.flags[i] !== 0;
      const isTemple = active && (SHEET[st.type[i]] === 226 || SHEET[st.type[i]] === 61 || st.wall[i] === 87);
      if (!isTemple) continue;
      const a = mapColor24(st, x, y, bg);
      const bHex = mm.colorFor(x, y);
      if (a === null || bHex === null) continue;
      const b = '#' + bHex.slice(1).toLowerCase();
      const ah = '#' + a.toString(16).padStart(6, '0');
      if (ah === b) continue;
      hist[SHEET[st.type[i]] + '|' + st.wall[i] + '|p' + paint + '|wp' + wpaint + '|coat' + st.coat[i]] =
        (hist[SHEET[st.type[i]] + '|' + st.wall[i] + '|p' + paint + '|wp' + wpaint + '|coat' + st.coat[i]] ?? 0) + 1;
      if (rows.length < 12) {
        rows.push({
          x, y, type: st.type[i], sheet: SHEET[st.type[i]], flags: st.flags[i], wall: st.wall[i],
          liquid: st.liquid[i], liquidType: st.liquidType[i], paint, wpaint, coat: st.coat[i],
          preview: ah, minimap: b,
          defMapColor: TILE_DEFS[st.type[i]]?.mapColor ?? null,
        });
      }
    }
  }
  return { hist, rows, total: Object.values(hist).reduce((a2, b2) => a2 + b2, 0) };
}, Date.now()).catch((e) => ({ error: String(e).slice(0, 300) }));

writeFileSync(`${OUT}/temple-dump.json`, JSON.stringify(dump, null, 2));
console.log('TOTAL', dump.total);
console.log('HIST', JSON.stringify(dump.hist, null, 1).slice(0, 1500));
console.log('ROWS', JSON.stringify(dump.rows ?? [], null, 1).slice(0, 2400));
await browser.close();

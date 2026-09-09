// ★IIIII227 探针①b：negativeinfinity 墙漆/未漆格专项取证。
//   问题源：探针① probe[1] wallPx=[97,67,51] 疑似未吃负相墙档(Pass44)。
//   取证：①全图未漆格分布（y 带/墙有无/paint 值）②未漆格 vs 已漆格烘焙画布逐像素
//   对拍 applyPaintTint(isWall) 期望 ③wallTiler.hasTexture / 动画墙旁路检查。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=900000 scripts/_iii227-negwall.mjs
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
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 300)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'negativeinfinity', size: 0, name: 'iii227n', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
const t1 = Date.now();
let ok = false;
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world && !!globalThis.__swGame?.renderer?.minimap).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ok) { console.error('world not ready'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

const rep = await page.evaluate(async (bust) => {
  const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
  const { applyPaintTint } = await import(`/src/world/Paint.ts?t=${bust}`);
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${bust}`);
  const { wallAnimRate } = await import(`/src/render/VanillaWallTiler.ts?t=${bust}`);
  const g = globalThis.__swGame;
  const world = g.world, st = world.store;
  const w = world.w, h = world.h;

  // ① 未漆格分布（paint≠30 或 paintWall≠30，边距 5 域）
  const bands = {};
  let unpaintTile = 0, unpaintWall = 0, unpaintBothHasWall = 0;
  const samplesUnpainted = [];
  for (let y = 5; y < h - 25; y++) {
    const band = y < world.groundLevel ? 'sky' : y < world.rockLevel ? 'dirt' : y < (world.lavaLine || h) ? 'rock' : 'hell';
    for (let x = 5; x < w - 5; x++) {
      const i = st.idx(x, y);
      const ut = st.paint[i] !== 30, uw = st.wall[i] !== 0 && st.paintWall[i] !== 30;
      if (ut) unpaintTile++;
      if (uw) unpaintWall++;
      if (ut && st.wall[i] !== 0 && st.paintWall[i] !== 30) unpaintBothHasWall++;
      if ((ut || uw)) {
        bands[band] = (bands[band] ?? 0) + 1;
        if (samplesUnpainted.length < 10) samplesUnpainted.push({ x, y, paint: st.paint[i], paintWall: st.paintWall[i], wall: st.wall[i], type: st.type[i], flags: st.flags[i] });
      }
    }
  }
  const out = { unpaintTile, unpaintWall, unpaintBothHasWall, bands, samplesUnpainted };

  // ② 已漆格烘焙对拍：抽 12 个 wall>0 且 paintWall=30 的格
  const checks = [];
  let tried = 0;
  for (let k = 0; checks.length < 12 && k < 20000; k++) {
    const x = 100 + ((k * 977) % (w - 200));
    const y = 100 + ((k * 613) % (h - 200));
    const i = st.idx(x, y);
    tried++;
    if (st.wall[i] === 0 || st.paintWall[i] !== 30 || !st.flags[i]) continue;
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const pair = g.chunks.get(cx, cy);
    const lx = x % CHUNK, ly = y % CHUNK;
    const rd = (cv, oxx, oyy) => {
      const d = cv.getContext('2d').getImageData(oxx + lx * TILE + 8, oyy + ly * TILE + 8, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const wallId = st.wall[i];
    const bakedWallPx = rd(pair.wall, pair.sx, pair.sy);
    // 差分实验：清漆重烘取 raw，再回漆重烘取 tinted，逐像素对 Pass44 期望
    const bake = () => { g.chunks.markDirtyAround(x, y); g.chunks.flushDirty(64, 200); };
    const reread = () => g.chunks.get(cx, cy);
    st.paintWall[i] = 0; bake(); reread();
    const rawPx = rd(g.chunks.get(cx, cy).wall, g.chunks.get(cx, cy).sx, g.chunks.get(cx, cy).sy);
    st.paintWall[i] = 30; bake(); reread();
    const tintedPx = rd(g.chunks.get(cx, cy).wall, g.chunks.get(cx, cy).sx, g.chunks.get(cx, cy).sy);
    const exp = applyPaintTint(rawPx[0], rawPx[1], rawPx[2], 30, true);
    checks.push({
      x, y, wallId, animated: wallAnimRate(wallId) !== 0,
      hasTexture: g.chunks.wallTiler ? g.chunks.wallTiler.hasTexture(wallId) : null,
      bakedWallPx, rawPx, tintedPx,
      expectedTinted: [...exp],
      tintMatchesExp: tintedPx[0] === exp[0] && tintedPx[1] === exp[1] && tintedPx[2] === exp[2],
      paintWall: st.paintWall[i], paint: st.paint[i],
    });
  }
  out.wallChecks = checks;
  out.wallTilerExists = !!g.chunks.wallTiler;
  return out;
}, BUST);

writeFileSync(`${OUT}/negwall-report.json`, JSON.stringify(rep, null, 1));
console.log('written; errs=', errs.length);
await browser.close();

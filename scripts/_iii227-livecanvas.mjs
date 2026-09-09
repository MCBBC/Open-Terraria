// ★IIIII227 探针②e：实况画布核验（WindSway 动态层家族 126/91 + 静态 719/627）——
//   传送相机至目标格,等 3 帧,读主画布对应屏幕区非背景像素率。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch {} });
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'rainbowroad', size: 0, name: 'iii227v', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
let ok = false; const t1 = Date.now();
while (Date.now() - t1 < 420000) {
  ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));
const rep = await page.evaluate(async () => {
  const { TILE, CHUNK } = await import('/src/core/constants.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = globalThis.__swGame;
  const world = g.world, st = world.store;
  const w = world.w, h = world.h;
  const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  const out = {};
  for (const [name, sh, fwPx, fhPx] of [['discoball126', 126, 32, 32], ['banner91', 91, 18, 54], ['cloud719', 719, 16, 16], ['moss627', 627, 16, 16]]) {
    const idT = bySheet(sh);
    let hit = null;
    for (let k = 0; k < 80000 && !hit; k++) {
      const x = 60 + ((k * 1103) % (w - 120));
      const y = 60 + ((k * 733) % (h - 120));
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === idT) hit = { x, y };
    }
    if (!hit) { out[name] = { hit: false }; continue; }
    // 相机对准目标（世界像素）
    g.camera.x = hit.x * TILE + 8; g.camera.y = hit.y * TILE + 8;
    g.player.x = hit.x * TILE + 8; g.player.y = (hit.y - 4) * TILE;
    for (let f = 0; f < 8; f++) g.fixedUpdate(1 / 60);
    await new Promise((r) => setTimeout(r, 400));
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const [sx, sy] = g.camera.worldToScreen(hit.x * TILE, hit.y * TILE);
    const region = c2.getImageData(Math.max(0, sx - 4), Math.max(0, sy - 4), Math.min(80, cv.width - sx + 4), Math.min(80, cv.height - sy + 4)).data;
    let nonBlack = 0, total = 0;
    for (let p = 0; p < region.length; p += 4) {
      total++;
      if (region[p] + region[p + 1] + region[p + 2] > 30) nonBlack++;
    }
    out[name] = { hit, screen: [Math.round(sx), Math.round(sy)], nonBlackRatio: +(nonBlack / Math.max(1, total)).toFixed(3) };
  }
  return out;
});
console.log(JSON.stringify(rep));
await browser.close();

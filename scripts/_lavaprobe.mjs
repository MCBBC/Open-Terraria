// 岩浆渲染探针 v2：不开全亮，采样点保证在屏幕内且 store 里确实是岩浆
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000));

const lava = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16);
  let best = null;
  for (let y = Math.floor(g.world.groundLevel) + 20; y < st.h - 10; y++) {
    let run = 0;
    for (let x = Math.max(2, cx - 300); x < Math.min(st.w - 2, cx + 300); x++) {
      const i = st.idx(x, y);
      if (st.liquidType[i] === 2 && st.liquid[i] > 200) run++;
      else {
        if (run >= 8 && (!best || run > best.run)) best = { run, x: x - Math.floor(run / 2), y };
        run = 0;
      }
    }
    if (run >= 8 && (!best || run > best.run)) best = { run, x: cx - 300 + Math.floor(run / 2), y };
  }
  return best;
});
console.log('lava pool:', JSON.stringify(lava));
if (!lava) { console.log('NO LAVA'); await browser.close(); process.exit(1); }
await page.evaluate((l) => { window.__lavaX = l.x; window.__lavaY = l.y; }, lava);

// zoom 固定 1.0，屏高 800px = 50 格；分别距 岩浆上方 20 格（屏幕下方 1/3）与 6 格
for (const [dist, label] of [[45, 'far45'], [25, 'mid25'], [6, 'near']]) {
  const res = await page.evaluate((d) => {
    const g = window.__swGame;
    g.camera.zoom = Math.min(1.0, 340 / (d * 16)); g.camera.zoomTarget = g.camera.zoom;
    const tx = window.__lavaX, ty = window.__lavaY;
    g.player.x = tx * 16 - 8;
    g.player.y = (ty - d - 6) * 16;
    g.camera.x = tx * 16;
    g.camera.y = (ty - d) * 16;
    return true;
  }, dist);
  await new Promise((r) => setTimeout(r, 900));
  const out = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const [sx, sy] = g.camera.worldToScreen(window.__lavaX * 16 + 8, window.__lavaY * 16 + 8);
    const tile = st.get(window.__lavaX, window.__lavaY);
    const liq = st.liquid[st.idx(window.__lavaX, window.__lavaY)];
    const ltype = st.liquidType[st.idx(window.__lavaX, window.__lavaY)];
    const onScreen = sx >= 8 && sx <= 1272 && sy >= 8 && sy <= 792;
    const d = g.renderer.ctx.getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 16, 16).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    // 光照采样
    const L = g.lighting;
    const li = (window.__lavaY - L.ry) * L.rw + (window.__lavaX - L.rx);
    const inRegion = window.__lavaX >= L.rx && window.__lavaX < L.rx + L.rw && window.__lavaY >= L.ry && window.__lavaY < L.ry + L.rh;
    return {
      screen: [sx | 0, sy | 0], onScreen, tile, liq, ltype,
      rgb: [(r / n) | 0, (gg / n) | 0, (b / n) | 0],
      inLightRegion: inRegion,
      light: inRegion ? [L.r[li], L.g[li], L.b[li]] : null,
    };
  });
  console.log(label, JSON.stringify(out));
}
await browser.close();

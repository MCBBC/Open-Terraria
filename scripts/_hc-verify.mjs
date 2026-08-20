import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/hcv-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (/shader|GL|WebGL/i.test(m.text())) console.log('[console.' + m.type() + ']', m.text().slice(0, 200)); });
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.25 + (5000 / 54000) * 0.5;
  g.player.x = 33500; g.player.y = 3000;
});
await new Promise((r) => setTimeout(r, 9000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const layer = sky.cloudGlLayer;
  // 云位置采样:vclouds 各朵云屏幕位(近/远太阳)
  const cam = g.camera, z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  const cel = sky.cloudCelestial;
  const clouds = (sky.vclouds ?? []).filter((c) => c.active !== false).slice(0, 200).map((c) => {
    const [sx, sy] = w2s(c.x, c.y);
    return { x: Math.round(sx), y: Math.round(sy), scale: +c.scale.toFixed(2) };
  });
  // 最近太阳的三朵云 + 最远三朵:采样中心 16×16 的平均 RGB
  const sample = (x, y) => {
    if (x < 0 || y < 0 || x + 16 > cv.width || y + 16 > cv.height) return null;
    const d = ctx.getImageData(x, y, 16, 16).data;
    let r = 0, g2 = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 30) { r += d[i]; g2 += d[i + 1]; b += d[i + 2]; n++; } }
    return n ? [Math.round(r / n), Math.round(g2 / n), Math.round(b / n), n] : null;
  };
  const withDist = clouds.map((c) => ({ ...c, d: cel ? Math.hypot(c.x - cel.posX, c.y - cel.posY) : 0 }));
  withDist.sort((a, b) => a.d - b.d);
  const near = withDist.slice(0, 4).map((c) => ({ ...c, rgb: sample(c.x, c.y) }));
  const far = withDist.slice(-4).map((c) => ({ ...c, rgb: sample(c.x, c.y) }));
  return {
    glLayer: { present: !!layer, unavailable: layer?.unavailable ?? null, cloudFxOK: layer?.cloudFxOK ?? null },
    cel: cel ? { x: Math.round(cel.posX), y: Math.round(cel.posY), i: +cel.intensity.toFixed(3), rgb: [cel.r, cel.g, cel.b].map((v) => Math.round(v * 255)) } : null,
    cloudCount: clouds.length, near, far,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/hcv2-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
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
  const cel = sky.cloudCelestial;
  const cv = g.renderer.canvas, ctx = cv.getContext('2d');
  // 云像素特征:亮度较高、非纯天空(天空 B>>R;云 R≈G≈B 偏白)
  const isCloud = (r, gg, b) => r > 110 && gg > 110 && Math.abs(r - b) < 60 && gg > 90;
  const regionStats = (cx, cy, rad) => {
    const d = ctx.getImageData(Math.max(0, cx - rad), Math.max(0, cy - rad), rad * 2, rad * 2).data;
    const W = rad * 2;
    let n = 0, sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
      const i = ((y * W) + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (isCloud(r, gg, b)) { n++; sr += r; sg += gg; sb += b; }
    }
    return n ? { n, rgb: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] } : { n: 0, rgb: null };
  };
  const res = { cel: cel ? { x: Math.round(cel.posX), y: Math.round(cel.posY), i: +cel.intensity.toFixed(3) } : null, regions: [] };
  if (cel) {
    for (const [dx, dy] of [[0, 0], [-260, 0], [260, 0], [0, -220], [0, 220], [-450, 120], [450, 120]]) {
      res.regions.push({ at: [dx, dy], ...regionStats(Math.round(cel.posX + dx), Math.round(cel.posY + dy), 90) });
    }
  }
  return res;
});
console.log(JSON.stringify(out));
await browser.close();

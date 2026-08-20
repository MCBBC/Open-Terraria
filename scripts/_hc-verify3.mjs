import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/hcv3-profile',
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
await new Promise((r) => setTimeout(r, 6000));
// 云搬家:所有 vclouds 的 x 铺到太阳屏幕位附近(云系在屏空间绘制,c.x 即屏 x)
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cel = sky.cloudCelestial;
  const cs = sky.vclouds;
  if (!cel || !cs) return;
  // pass1 云(yOf = c.y + distY):先测 distY——不动云,采样屏幕顶部区域找最近云带
  // 简化:全部 scale<1 云搬 x;近太阳排开
  let k = 0;
  for (const c of cs) {
    if (c.scale < 1) {
      c.x = cel.posX - 350 + (k % 12) * 70;
      k++;
    } else {
      c.x = cel.posX - 400 + ((k++) % 10) * 90;
    }
    c.alpha = Math.max(c.alpha, 0.9);
  }
  window.__moved = k;
});
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cel = sky.cloudCelestial;
  const cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const moved = window.__moved;
  const d = ctx.getImageData(0, 0, cv.width, Math.min(cv.height, 700)).data;
  const W = cv.width, H = Math.min(cv.height, 700);
  const isCloud = (r, gg, b) => r > 100 && gg > 100 && b > 95 && Math.max(r, gg, b) - Math.min(r, gg, b) < 70;
  // 云像素按"到太阳距离"分桶,统计平均色与暖度(R−B)
  const buckets = { near: [0, 0, 0, 0], mid: [0, 0, 0, 0], far: [0, 0, 0, 0] };
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const i = (y * W + x) * 4;
    if (!isCloud(d[i], d[i + 1], d[i + 2])) continue;
    const dist = Math.hypot(x - cel.posX, y - cel.posY);
    const bkt = dist < 250 ? 'near' : dist < 550 ? 'mid' : 'far';
    const b = buckets[bkt];
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
  }
  const fmt = (b) => b[3] ? { n: b[3], rgb: [b[0], b[1], b[2]].map((v) => Math.round(v / b[3])) } : { n: 0 };
  return { cel: { x: Math.round(cel.posX), y: Math.round(cel.posY), i: +cel.intensity.toFixed(3) }, moved, near: fmt(buckets.near), mid: fmt(buckets.mid), far: fmt(buckets.far) };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/hc-moved.png' });
await browser.close();

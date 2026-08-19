// 双水线全宽扫描 v2:强制白天(dline3 疑似随机入夜全暗→零峰)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dline3-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(420000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
console.log('生成 12345…');
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 360000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 385 * 16; g.player.y = 232 * 16;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 12000));
const out = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const cam = g.camera, cv = r.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  const segs = [];
  for (let x0t = 344; x0t <= 424; x0t += 10) {
    const [ax] = w2s(x0t * 16, 0);
    const [, ay] = w2s(0, (241 - 2) * 16);
    const W = Math.round(10 * 16 * z), H = Math.round(5 * 16 * z);
    const d = ctx.getImageData(Math.round(ax), Math.round(ay), W, H).data;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let lum = 0, n = 0;
      for (let x = 0; x < W; x += 3) {
        const i = (y * W + x) * 4;
        const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        if (A > 200) { lum += (R + G + B) / 3; n++; }
      }
      if (n > (W / 3) * 0.6) rows.push({ y, lum: Math.round(lum / n) });
    }
    const peaks = [];
    for (let k = 1; k < rows.length - 1; k++) {
      const a = rows[k - 1].lum, b = rows[k].lum, c2 = rows[k + 1].lum;
      if (b >= a + 15 && b >= c2 + 15 && b > 105) peaks.push({ y: rows[k].y, lum: b });
    }
    const merged = [];
    for (const l of peaks) {
      const last = merged[merged.length - 1];
      if (last && l.y - last.y <= 2) last.lum = Math.max(last.lum, l.lum);
      else merged.push({ ...l });
    }
    const gaps = [];
    for (let k = 1; k < merged.length; k++) gaps.push(+((merged[k].y - merged[k - 1].y) / (16 * z)).toFixed(2));
    segs.push({ x: x0t, rowCount: rows.length, maxLum: rows.length ? Math.max(...rows.map((q) => q.lum)) : 0,
      peaks: merged.map((m) => m.y), lums: merged.map((m) => m.lum), gaps });
  }
  return segs;
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log(JSON.stringify(out));
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync('/Users/vinlic/.claude/jobs/8405c930/tmp/dline3.png', shot);
await browser.close();

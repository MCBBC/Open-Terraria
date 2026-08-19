// 双水线逐列扫描:每列中心 6px 竖带,逐行亮度→局部峰=水面线。
// 若某些列线在 y241、另一些在 y242(或植物列双线),即"两条线差1格"的现场。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dline4-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(420000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
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
  const yTop = 236, yBot = 248;               // 扫描行范围(世界 tile)
  const H = Math.round((yBot - yTop) * 16 * z);
  const stripW = Math.max(2, Math.round(6 * z));
  const cols = [];
  for (let tx = 346; tx <= 422; tx++) {
    const [ax] = w2s(tx * 16 + 8 - 3, 0);
    const [, ay] = w2s(0, yTop * 16);
    let d;
    try { d = ctx.getImageData(Math.round(ax), Math.round(ay), stripW, H).data; } catch { continue; }
    const rows = [];
    for (let y = 0; y < H; y++) {
      let lum = 0, n = 0;
      for (let x = 0; x < stripW; x++) {
        const i = (y * stripW + x) * 4;
        if (d[i + 3] > 200) { lum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
      }
      if (n === stripW) rows.push(Math.round(lum / n));
    }
    if (rows.length < H) continue;            // 每行都得有像素(防半透明/缺图列)
    // 局部峰(±2 行更亮 + 绝对 ≥130)
    const lines = [];
    for (let k = 2; k < rows.length - 2; k++) {
      const b = rows[k];
      if (b < 130) continue;
      if (b >= rows[k - 2] + 12 && b >= rows[k + 2] + 12 && b >= rows[k - 1] && b >= rows[k + 1]) {
        lines.push({ tileY: +(yTop + k / (16 * z)).toFixed(2), lum: b });
      }
    }
    if (lines.length) cols.push({ x: tx, lines });
  }
  // 汇总:按 tileY 分桶
  const buckets = {};
  for (const c of cols) for (const l of c.lines) {
    const key = l.tileY.toFixed(1);
    (buckets[key] ??= []).push(c.x);
  }
  return { zoom: z, colCount: cols.length,
    linesPerCol: cols.map((c) => [c.x, c.lines.length]),
    doubleCols: cols.filter((c) => c.lines.length >= 2).map((c) => ({ x: c.x, lines: c.lines })),
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, `${v.length}列:${v[0]}-${v[v.length - 1]}`])) };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
console.log(JSON.stringify(out));
await browser.close();

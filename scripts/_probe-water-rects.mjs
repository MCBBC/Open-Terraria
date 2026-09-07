import puppeteer from 'puppeteer-core';
// 液体 drawImage 矩形插桩:过滤水贴图调用,聚合 (dy0,dh) 与 pass(alpha) 分布,
// 对比 jx=0 与 jx=0.5 的矩形对齐差。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
for (let att = 0; att < 8; att++) { try { await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 }); break; } catch { await new Promise(r => setTimeout(r, 2500)); } }
await page.evaluate(async () => { const t0 = Date.now(); while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 500)); });
const res = await page.evaluate(async (POOL) => {
  const g = window.__swGame, r = g.renderer;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const cxw = (POOL.x0 + POOL.x1) / 2 * 16, cyw = POOL.y * 16;
  // 插桩:水贴图调用 = 源高≤16 且 源宽≤16 且 globalAlpha ∈{1,0.6,0.75...}
  const proto = CanvasRenderingContext2D.prototype;
  const origDraw = proto.drawImage;
  const rects = [];
  let on = false;
  proto.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw, dh, ...rest) {
    if (on && sh <= 16 && sw <= 16 && sy >= 1200) {
      rects.push({ sx, sy, sw, sh, dx, dy, dw, dh, a: +this.globalAlpha.toFixed(2), op: this.globalCompositeOperation });
    }
    return origDraw.call(this, img, sx, sy, sw, sh, dx, dy, dw, dh, ...rest);
  };
  const runCombo = async (c) => {
    rects.length = 0;
    g.camera.zoomTarget = c.z; g.camera.zoom = c.z;
    g.player.noClip = true;
    g.player.x = cxw + c.jx; g.player.y = cyw - 40; g.player.vx = 0; g.player.vy = 0;
    await sleep(500);
    on = true;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    on = false;
    // 聚合:按 (dy mod 1 无意义,取 dy 整数) 分桶前景 pass(0.6 alpha)的 (dy,dh) 对
    const fg = rects.filter((q) => q.a < 0.9);
    const bg = rects.filter((q) => q.a >= 0.9);
    const agg = (arr) => {
      const byDy = new Map();
      for (const q of arr) {
        const k = q.dy;
        byDy.set(k, (byDy.get(k) || 0) + 1);
      }
      return [...byDy.entries()].map(([dy, n]) => ({ dy, n })).sort((a, b) => a.dy - b.dy).slice(0, 14);
    };
    const dhDist = {};
    for (const q of fg) dhDist[q.dh] = (dhDist[q.dh] || 0) + 1;
    const srcYdist = {};
    for (const q of rects) srcYdist[q.sy] = (srcYdist[q.sy] || 0) + 1;
    g.player.noClip = false;
    return { total: rects.length, fgN: fg.length, bgN: bg.length, fgDy: agg(fg), bgDy: agg(bg), dhDist, srcYTop: Object.entries(srcYdist).sort((a, b) => b[1] - a[1]).slice(0, 6) };
  };
  const out = [];
  out.push({ combo: 'z1.25 jx0', r: await runCombo({ z: 1.25, jx: 0, jy: 0 }) });
  out.push({ combo: 'z1.25 jx0.5', r: await runCombo({ z: 1.25, jx: 0.5, jy: 0 }) });
  return out;
}, { x0: 1536, x1: 1598, y: 280 });
console.log(JSON.stringify(res, null, 1));
await browser.close();

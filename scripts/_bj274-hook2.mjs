// BJ274 探针3：无差别 drawImage 钩子——dest 落在幻影区(屏幕 x 880..1180, y 436..500)的
// 全部调用，记录图像 URL + src/dest + 栈。定位真正的画手。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const saveText = readFileSync('/tmp/bj274-map.json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bj274-chrome-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate((text) => window.__swFlow.loadJson(text), saveText);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 30043; g.player.y = 4678; g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => {
  window.__cap = [];
  window.__capOn = true;
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  // 幻影区:tile 1866-1896 -> 屏 x 1866*16-30053+756=649 .. 1896*16-30053+756=1129; y 434..502
  const X0 = 640, X1 = 1140, Y0 = 430, Y1 = 505;
  proto.drawImage = function (img, a, b, c, d, e, f, g2, h) {
    try {
      if (window.__capOn && window.__cap.length < 20000) {
        let dx, dy, dw, dh, sx = null, sy = null;
        if (arguments.length >= 9) { sx = a; sy = b; dx = e; dy = f; dw = g2; dh = h; }
        else if (arguments.length >= 5) { dx = a; dy = b; dw = c; dh = d; }
        else { dx = 0; dy = 0; dw = img && img.width; dh = img && img.height; }
        const t = this.getTransform();
        // dest 经当前变换映射:取矩形四角最小包围(仅处理无旋转)
        const jx = t.a, jy = t.d, je = t.e, jf = t.f;
        const ex0 = dx * jx + je, ey0 = dy * jy + jf;
        const ex1 = (dx + dw) * jx + je, ey1 = (dy + dh) * jy + jf;
        const rx0 = Math.min(ex0, ex1), rx1 = Math.max(ex0, ex1);
        const ry0 = Math.min(ey0, ey1), ry1 = Math.max(ey0, ey1);
        if (rx1 > X0 && rx0 < X1 && ry1 > Y0 && ry0 < Y1) {
          const src = String((img && (img.src || '')) || '');
          const rec = { sx, sy, sw: sx !== null ? c : null, sh: sx !== null ? d : null,
            dx: Math.round(rx0), dy: Math.round(ry0), dw: Math.round(rx1 - rx0), dh: Math.round(ry1 - ry0),
            img: src ? src.slice(-52) : `${img && img.width}x${img && img.height}` };
          const arr = window.__cap;
          const last = arr[arr.length - 1];
          if (last && last.img === rec.img && Math.abs(last.dx - rec.dx) < 2 && Math.abs(last.dy - rec.dy) < 2) {
            last.n = (last.n || 1) + 1;
          } else {
            rec.n = 1;
            rec.st = String(new Error().stack || '').split('\n').slice(2, 7).map(s => s.trim().replace('http://localhost:5201', '')).join(' <- ');
            arr.push(rec);
          }
        }
      }
    } catch { /* 忽略 */ }
    return orig.apply(this, arguments);
  };
});
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  window.__capOn = false;
  const seen = new Map();
  for (const r of window.__cap) {
    const k = r.st;
    if (!seen.has(k)) seen.set(k, { st: r.st, imgs: new Set(), n: 0, sample: null });
    const e = seen.get(k);
    e.n += r.n || 1;
    e.imgs.add(r.img + (r.sx !== null ? ` @${r.sx},${r.sy} ${r.sw}x${r.sh} -> ${r.dx},${r.dy} ${r.dw}x${r.dh}` : ` -> ${r.dx},${r.dy} ${r.dw}x${r.dh}`));
    if (!e.sample) e.sample = r;
  }
  return [...seen.values()].map(e => ({ st: e.st, n: e.n, imgs: [...e.imgs].slice(0, 6), more: e.imgs.size - 6 }));
});
console.log('painter groups:', out.length);
for (const g of out) {
  console.log('=== n=' + g.n, g.more > 0 ? `(+${g.more} more rects)` : '');
  console.log('   stack:', g.st);
  for (const im of g.imgs) console.log('   ', im);
}
await browser.close();
console.log('done');

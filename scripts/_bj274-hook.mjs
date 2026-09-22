// BJ274 探针2：drawImage 钩子捕获水面绘制调用——谁在无液体数据格画水？
// 记录 src/dest 矩形 + 当前 transform + canvas 尺寸 + 采样调用栈；离线映射世界格。
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
  proto.drawImage = function (img, a, b, c, d, e, f, g2, h) {
    try {
      if (window.__capOn && window.__cap.length < 60000) {
        const src = String((img && (img.src || '')) || '');
        const isWater = src.includes('Misc_water') || (img && img.width === 48 && img.height >= 1000);
        if (isWater) {
          const t = this.getTransform();
          const rec = arguments.length >= 9
            ? { sx: a, sy: b, sw: c, sh: d, dx: e, dy: f, dw: g2, dh: h }
            : { f5: 1, dx: a, dy: b, dw: c, dh: d };
          rec.tfm = [t.a, t.b, t.c, t.d, t.e, t.f].map(Number);
          rec.cw = this.canvas.width; rec.ch = this.canvas.height;
          rec.src = src.slice(-40);
          const arr = window.__cap;
          const last = arr[arr.length - 1];
          if (last && last.dx === rec.dx && last.dy === rec.dy && last.sy === rec.sy) {
            last.n = (last.n || 1) + 1;
          } else {
            rec.n = 1;
            rec.st = String(new Error().stack || '').split('\n').slice(1, 9).join('|');
            arr.push(rec);
          }
        }
      }
    } catch { /* 忽略 */ }
    return orig.apply(this, arguments);
  };
});
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  window.__capOn = false;
  const g = window.__swGame;
  const cam = g.camera ?? {};
  const camKeys = {};
  for (const k of ['x', 'y', 'zoom', 'zoomTarget', 'screenW', 'screenH', 'left', 'top', 'px', 'py']) {
    if (typeof cam[k] === 'number') camKeys[k] = cam[k];
  }
  const st = g.world.store;
  const rows = [];
  for (let y = 292; y <= 297; y++) {
    const cells = [];
    for (let x = 1836; x <= 1934; x++) {
      const i = st.idx(x, y);
      cells.push(`${st.type[i]}:${st.flags[i]}:${st.liquid[i]}`);
    }
    rows.push(cells.join(','));
  }
  return { cap: window.__cap.slice(0, 300), cam: camKeys, dpr: window.devicePixelRatio, rows };
});
console.log('unique water draw targets:', out.cap.length, 'dpr:', out.dpr);
console.log('cam:', JSON.stringify(out.cam));
for (const e of out.cap) console.log('CAP', JSON.stringify(e));
out.rows.forEach((r, i) => console.log('DATA row', 292 + i, r));
await browser.close();
console.log('done');

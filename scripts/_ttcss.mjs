// 独立页复刻 tooltip DOM/CSS：像素级验九宫底不透明度
import { REPO_ROOT, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 400, height: 300 }, protocolTimeout: 60000,
});
const page = await browser.newPage();
const img = readFileSync(join(REPO_ROOT, 'public/sprites/vanilla/Inventory_Back13.png')).toString('base64');
await page.setContent(`<body style="background:#fff;margin:0">
<div id="tt" style="position:fixed;left:20px;top:20px;width:200px;height:120px;padding:9px 13px;
  font-size:13px;color:#fff;background:rgba(21,23,75,0.93);
  text-shadow:1px 1px 0 rgba(0,0,0,0.85)">测试行</div>
<script>
const b64='${img}';
function tint() {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const t = document.createElement('canvas'); t.width = im.width; t.height = im.height;
      const tc = t.getContext('2d'); tc.drawImage(im, 0, 0);
      const d = tc.getImageData(0, 0, t.width, t.height);
      const m = [23/255, 25/255, 81/255, 0.925];
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i] = Math.round(d.data[i]*m[0]); d.data[i+1] = Math.round(d.data[i+1]*m[1]);
        d.data[i+2] = Math.round(d.data[i+2]*m[2]); d.data[i+3] = Math.round(d.data[i+3]*m[3]);
      }
      tc.putImageData(d, 0, 0); res(t);
    };
    im.src = 'data:image/png;base64,' + b64;
  });
}
tint().then((t) => {
  const W = t.width, H = t.height;
  const c = document.createElement('canvas'); c.width = 200; c.height = 120;
  const x = c.getContext('2d');
  x.drawImage(t, 0, 0, 10, 10, 0, 0, 10, 10);
  x.drawImage(t, W-10, 0, 10, 10, 190, 0, 10, 10);
  x.drawImage(t, 0, H-10, 10, 10, 0, 110, 10, 10);
  x.drawImage(t, W-10, H-10, 10, 10, 190, 110, 10, 10);
  x.drawImage(t, 10, 0, 10, 10, 10, 0, 180, 10);
  x.drawImage(t, 10, H-10, 10, 10, 10, 110, 180, 10);
  x.drawImage(t, 0, 10, 10, 10, 0, 10, 10, 100);
  x.drawImage(t, W-10, 10, 10, 10, 190, 10, 10, 100);
  x.drawImage(t, 10, 10, 10, 10, 10, 10, 180, 100);
  const el = document.getElementById('tt');
  el.style.background = 'url(' + c.toDataURL() + ')';
  el.style.filter = 'brightness(0.936)';
  window.__done = true;
});
</script></body>`);
await page.waitForFunction(() => window.__done, { timeout: 10000 });
const px = await page.evaluate(() => {
  const el = document.getElementById('tt');
  const r = el.getBoundingClientRect();
  const shot = document.createElement('canvas');
  shot.width = 400; shot.height = 300;
  const sc = shot.getContext('2d');
  // 无法直接截 DOM——用 element screenshot
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const el = await page.$('#tt');
await el.screenshot({ path: '/tmp/ttcss.png' });
console.log('shot ok', JSON.stringify(px));
await browser.close();

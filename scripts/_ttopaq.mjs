// 不透明度验证：合成层像素 alpha 必须 255（零透 world）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const r = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const v = await fetch('/sprites/vanilla.json').then((x) => x.json());
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, `vi_4_${v.items['4'].key}`, 1, 0, -1);
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === d.itemId);
  g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r2) => setTimeout(r2, 600));
  // 从 dataURL 直接解码 alpha
  const url = ui.tooltip.style.background.slice(5, -2);   // url("...")
  const b64 = url.split(',')[1];
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return { len: buf.length, head: Array.from(buf.slice(1, 4)) };
});
// 解码 PNG 太重——改用页面内 canvas 重绘 dataURL 采样
const r2 = await page.evaluate(async () => {
  const ui = window.__swUI;
  const url = ui.tooltip.style.background.slice(5, -2);
  return await new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      // 中心 + 四角 + 边中点 alpha
      const pts = [[Math.floor(c.width/2), Math.floor(c.height/2)], [4,4], [c.width-5,4], [4,c.height-5], [Math.floor(c.width/2), 4]];
      const out = pts.map(([px, py]) => d[(py*c.width+px)*4+3]);
      res({ w: c.width, h: c.height, alphas: out });
    };
    im.src = url;
  });
});
console.log(JSON.stringify(r2));
const ok = r2.alphas.every((a) => a === 255);
console.log(ok ? 'PASS: 背景全不透明（alpha 255）' : 'FAIL: 仍有透明像素 ' + JSON.stringify(r2.alphas));
await browser.close();
process.exit(ok ? 0 : 1);

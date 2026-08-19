// alpha 采样：期望 245（0.96 折中档）且圆角像素保留透明
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const r2 = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const v = await fetch('/sprites/vanilla.json').then((x) => x.json());
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, `vi_4_${v.items['4'].key}`, 1, 0, -1);
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === d.itemId);
  g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r2) => setTimeout(r2, 600));
  const url = ui.tooltip.style.background.slice(5, -2);
  return await new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const d2 = x.getImageData(0, 0, c.width, c.height).data;
      const at = (px, py) => d2[(py * c.width + px) * 4 + 3];
      res({
        w: c.width, h: c.height,
        center: at(Math.floor(c.width / 2), Math.floor(c.height / 2)),
        midTop: at(Math.floor(c.width / 2), 4),
        corner00: at(0, 0), corner10: at(c.width - 1, 0),
      });
    };
    im.src = url;
  });
});
console.log(JSON.stringify(r2));
const ok = r2.center === 236 && r2.midTop === 236 && r2.corner00 === 0;   // 0.925×255=236 原版真值
console.log(ok
  ? 'PASS: 主体 alpha 236（原版 0.925 真值）+ 圆角保留透明'
  : `FAIL: ${JSON.stringify(r2)}`);
await browser.close();
process.exit(ok ? 0 : 1);

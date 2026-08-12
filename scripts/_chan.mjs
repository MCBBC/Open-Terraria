// 逐通道分析（直载贴图）：Player_0_N 各帧的上/下半身非透明像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?vuidemo=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current, { timeout: 120000 });
const result = await page.evaluate(async () => {
  const out = [];
  for (let n = 0; n <= 15; n++) {
    const img = new Image();
    img.src = `sprites/vanilla-ui/Player_0_${n}.png`;
    let ok = true;
    try { await img.decode(); } catch { ok = false; }
    if (!ok || !img.width) { out.push({ n, missing: true }); continue; }
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const band = (row) => {
      if (row * 56 + 56 > img.height) return { up: -1, low: -1 };
      const d = ctx.getImageData(0, row * 56, 40, 56).data;
      let up = 0, low = 0;
      for (let y = 0; y < 56; y++) {
        for (let x = 0; x < 40; x++) {
          if (d[(y * 40 + x) * 4 + 3] > 40) { if (y < 30) up++; else low++; }
        }
      }
      return { up, low };
    };
    out.push({ n, idle: band(0), walk: band(6), h: img.height });
  }
  return out;
});
for (const r of result) console.log(JSON.stringify(r));
await browser.close();

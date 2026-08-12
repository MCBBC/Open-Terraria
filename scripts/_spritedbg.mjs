// 史莱姆贴图本体诊断：NPC_1 帧的 alpha/RGB 分布（判定素材是否实心白剪影）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const r = atlas.vnpc(1, 0);
  if (!r) return { err: 'no sprite' };
  const c = document.createElement('canvas');
  c.width = r.sw; c.height = r.sh;
  const cx = c.getContext('2d');
  cx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
  const d = cx.getImageData(0, 0, r.sw, r.sh).data;
  const hist = { a0: 0, aMid: 0, a255: 0 };
  let sr = 0, sg = 0, sb = 0, nOpaque = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) hist.a0++;
    else if (a === 255) { hist.a255++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; nOpaque++; }
    else hist.aMid++;
  }
  return {
    size: [r.sw, r.sh], hist,
    opaqueMeanRGB: nOpaque ? [Math.round(sr / nOpaque), Math.round(sg / nOpaque), Math.round(sb / nOpaque)] : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

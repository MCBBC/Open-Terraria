// 诊断：drawUseItem 在 scratch canvas 成像条件
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, R = Object.getPrototypeOf(g.renderer);
  const { ITEM_DEFS } = await import('/src/data/items');
  const dbg = { cx: p.cx, y: p.y, w: p.w, h: p.h, facing: p.facing };
  const id = ITEM_DEFS.findIndex((d) => /^vi_3389_/.test(d?.key ?? ''));
  dbg.id = id; dbg.key = ITEM_DEFS[id]?.key;
  dbg.atlasIcon = g.renderer.atlasIcon(id) ? 'hit' : 'null';
  dbg.vicon3389 = g.renderer.atlas.vicon(3389) ? 'hit' : 'null';
  dbg.vicon969 = g.renderer.atlas.vicon(969) ? 'hit' : 'null';
  // 直接画一次看像素
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;
  const c2 = cv.getContext('2d');
  const cnt = () => { const d = c2.getImageData(0, 0, 1280, 800).data; let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < 800; y++) for (let x = 0; x < 1280; x++) if (d[(y * 1280 + x) * 4 + 3] > 8) { n++; if (x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    return { n, box: n ? [x0, y0, x1, y1] : null }; };
  for (let k = 0; k < 6; k++) {
    c2.clearRect(0, 0, 1280, 800);
    R.drawUseItem.call(g.renderer, c2, p, { t: 30, dur: 60, item: id, useStyle: 5, aim: 0 }, null);
    const r = cnt();
    dbg[`try${k}`] = r;
    if (r.n > 40) break;
    await new Promise(rr => setTimeout(rr, 400));
  }
  return dbg;
}, { timeout: 90000 });
console.log(JSON.stringify(out, null, 1));
await browser.close();

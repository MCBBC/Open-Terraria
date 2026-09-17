// ★FX57 一次性量测:12px 原生档 fillText 的覆盖二值性(烘焙前提验证)+
// window.__swItems 键值形态(探针入包域核对)。到主菜单即可(UIFont.load 启动 await)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5262') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 900, height: 600 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
const out = await page.evaluate(async () => {
  await document.fonts.ready;
  const probe = (font, text) => {
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 40;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.font = font;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#000';
    c.fillText(text, 3, 30);
    const d = c.getImageData(0, 0, 400, 40).data;
    let a255 = 0, aMid = 0, midMin = 999, midMax = 0;
    const hist = {};
    for (let p = 3; p < d.length; p += 4) {
      const a = d[p];
      if (a === 255) a255++;
      else if (a > 0) {
        aMid++;
        midMin = Math.min(midMin, a); midMax = Math.max(midMax, a);
        const bucket = a >> 4;
        hist[bucket] = (hist[bucket] || 0) + 1;
      }
    }
    const m = c.measureText(text);
    return { font, text, a255, aMid, midMin, midMax, hist, w: +m.width.toFixed(2),
      asc: +(m.actualBoundingBoxAscent ?? -1).toFixed(2), desc: +(m.actualBoundingBoxDescent ?? -1).toFixed(2) };
  };
  const items = window.__swItems;
  const sample = items ? Object.entries(items).slice(0, 5) : null;
  const vidMatch = items ? Object.entries(items).filter(([, v]) => v === 17 || v === 3084 || v === '17' || v === '3084').slice(0, 6) : null;
  return {
    checks: {
      f12: document.fonts.check('12px "Fusion Pixel 12px"'),
      faces: [...document.fonts].filter((f) => /Fusion/.test(f.family)).map((f) => `${f.family} | ${f.status}`),
    },
    probes: [
      probe('12px "Fusion Pixel 12px", monospace', '附近没有宝藏 8:30 42mph'),
      probe('14px "Fusion Pixel 12px", monospace', '附近没有宝藏 8:30 42mph'),
      probe('12px "Fusion Pixel 12px"', '附近没有宝藏 8:30 42mph'),
    ],
    swItems: { type: typeof items, sample, vidMatch, n: items ? Object.keys(items).length : 0 },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

// worker 图集物化 vs legacy 同步生成的像素等价性(前 60 个 id 全比对)
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5209');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + String(e.message).slice(0, 200)));
page.on('console', m => { const t = m.text(); if (/存档|error|失败|WorldGenUnavailable/i.test(t)) errs.push('[console] ' + t.slice(0, 160)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient');
  const m = await import('/src/assets/ItemIconGen');
  const items = await import('/src/data/items');
  const c = new WorldGenClient();
  const icons = await c.genIcons({ timeoutMs: 60000 });
  const atlas = document.createElement('canvas');
  atlas.width = icons.width; atlas.height = icons.height;
  const actx = atlas.getContext('2d', { willReadFrequently: true });
  actx.putImageData(new ImageData(new Uint8ClampedArray(icons.rgba), icons.width, icons.height), 0, 0);
  let n = 0, diff = 0; const bad = [];
  for (const def of items.ITEM_DEFS) {
    if (n >= 60) break;
    const slot = n;   // 与 worker 同序:ITEM_DEFS 下标
    const ex = (slot % icons.cols) * 16, ey = Math.floor(slot / icons.cols) * 16;
    const mine = document.createElement('canvas');
    mine.width = 16; mine.height = 16;
    mine.getContext('2d', { willReadFrequently: true }).drawImage(atlas, ex, ey, 16, 16, 0, 0, 16, 16);
    const legacy = m.genItemIconCanvas(def.key);
    if (mine.toDataURL() !== legacy.toDataURL()) { diff++; if (bad.length < 3) bad.push(def.key); }
    n++;
  }
  return { checked: n, diff, bad, atlas: `${icons.width}x${icons.height}` };
});
console.log(JSON.stringify(out));
console.log(out.diff === 0 ? '=== ICON PARITY PASS ===' : '=== PARITY FAIL ===');
await browser.close();
process.exit(out.diff === 0 ? 0 : 3);

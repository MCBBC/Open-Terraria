// 擦除动画内部状态逐步 dump：revealX 推进 + 行像素采样。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + ORIGIN + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await page.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
if (!menuOk) { console.log('主菜单未挂载'); await browser.close(); process.exit(1); }

const out = await page.evaluate(async () => {
  const mod = await import('/src/vui/states/GenWorldPreview.ts');
  const GenWorldPreview = mod.GenWorldPreview;
  const W = 640, H = 180;
  const mk = (r, g, b) => { const a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < a.length; i += 4) { a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; } return a; };
  const p = new GenWorldPreview();
  const log = [];
  const snap = (tag) => {
    const d = p.showCtx.getImageData(0, 0, W, 1).data;
    log.push(`${tag} revealX=${p.revealX} px@[0,10,20,32,48,63]=[${[0, 10, 20, 32, 48, 63].map((i) => `${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]}`).join(' | ')}]`);
  };
  p.setPreviewFrame(mk(255, 255, 255), W, H);
  p.setPreviewFrame(mk(255, 255, 255), W, H);
  snap('after-white');
  p.setPreviewFrame(mk(0, 200, 0), W, H);   // 绿帧
  for (let t = 0; t < 12; t++) {
    try { p.update(); } catch (e) { log.push(`update#${t} THREW: ${e.message}`); break; }
    if (t < 4 || t > 7) snap(`t${t}`);
    else log.push(`t${t} revealX=${p.revealX} off@y0x5=${(() => { const o = p.offCtx.getImageData(5, 0, 1, 1).data; return o[0] + "," + o[1] + "," + o[2]; })()}`);
    await new Promise((r) => setTimeout(r, 16));
  }
  return { protoHasUpdate: typeof GenWorldPreview.prototype.update, log: log.slice(0, 20) };
});
console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log('pageerrors:', errors.slice(0, 5));
await browser.close();

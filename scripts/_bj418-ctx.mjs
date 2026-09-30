import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5540';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&bj418c=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
const info = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const out = { ctxType: r.ctx?.constructor?.name, canvasW: r.ctx?.canvas?.width, hasOwn: false, desc: null };
  const d = Object.getOwnPropertyDescriptor(r.ctx, 'globalAlpha');
  out.desc = d ? 'own' : 'proto';
  // 试挂钩并触发一次 set
  const proto = CanvasRenderingContext2D.prototype;
  const pd = Object.getOwnPropertyDescriptor(proto, 'globalAlpha');
  Object.defineProperty(r.ctx, 'globalAlpha', {
    get() { return pd.get.call(this); },
    set(v) { out.__sets = (out.__sets ?? 0) + 1; pd.set.call(this, v); },
    configurable: true,
  });
  r.ctx.globalAlpha = 0.5;
  out.hasOwn = Object.getOwnPropertyNames(r.ctx).includes('globalAlpha');
  out.afterSet = r.ctx.globalAlpha;
  return out;
});
console.log(JSON.stringify(info));
// 等一帧再查 __sets 是否增长（渲染循环会 set globalAlpha）
await new Promise((r2) => setTimeout(r2, 500));
const info2 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const d = Object.getOwnPropertyDescriptor(r.ctx, 'globalAlpha');
  return { sets: d?.get ? 'n/a' : undefined, own: Object.getOwnPropertyNames(r.ctx).includes('globalAlpha'), isSameCtx: true };
});
console.log(JSON.stringify(info2));
await browser.close();

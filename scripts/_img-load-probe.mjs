// Extra_201/193 在真实页面环境（SW 控制下）的 Image 解码行为取证
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/?traildbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));   // 等 SW/资产管线就绪
const out = await page.evaluate(async () => {
  const load = (src) => new Promise((res) => {
    const im = new Image();
    const t0 = performance.now();
    im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight, ms: Math.round(performance.now() - t0) });
    im.onerror = (e) => res({ ok: false, ms: Math.round(performance.now() - t0) });
    im.src = src;
  });
  const sw = navigator.serviceWorker?.controller ? 'controlled' : 'none';
  const a = await load('sprites/vanilla/Extra_201.png');
  const b = await load('sprites/vanilla/Extra_193.png');
  const atlas = window.__swAtlas;
  const viaAtlas = atlas ? (atlas.ensureVImage('vanilla/Extra_201.png') ? 'landed' : 'pending/failed') : 'no-atlas';
  await new Promise(r => setTimeout(r, 1500));
  const viaAtlas2 = atlas ? (atlas.ensureVImage('vanilla/Extra_201.png') ? 'landed' : 'pending/failed') : 'no-atlas';
  return { sw, a, b, viaAtlas, viaAtlas2, failed: atlas ? atlas.failedVImages() : null };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

// FX24i 一次性探针：img668 (436,720,220,242) 直绘（绕过 tintAtlas）——
//  若直绘即双影=浏览器内 img668 内容与 fetch 版不同;若干净=tintAtlas.bake 内部污染
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto(`${ORIGIN}/?play=small&fx24i=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-role=list] > div').click();
  g.summonPanel?.close();
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/NPC_668.png'));
  if (ok) break;
  await wait(300);
}
await wait(600);
const R = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const img668 = r.atlas.ensureVImage('vanilla/NPC_668.png');
  // ① 内存 ImageBitmap 直绘
  const c1 = document.createElement('canvas');
  c1.width = 220; c1.height = 242;
  c1.getContext('2d').drawImage(img668, 436, 720, 220, 242, 0, 0, 220, 242);
  const memPng = c1.toDataURL('image/png');
  // ② 重新 fetch 一份画同样区域
  return { memPng, ctor: img668.constructor?.name, w: img668.width, h: img668.height };
});
const fs = await import('node:fs');
fs.writeFileSync('/tmp/fx24i-mem668.png', Buffer.from(R.memPng.split(',')[1], 'base64'));
console.log(JSON.stringify({ ...R, memPng: undefined }, null, 1));
await browser.close();

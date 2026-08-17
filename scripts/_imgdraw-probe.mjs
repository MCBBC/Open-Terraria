// _imgdraw-probe:统计游戏内每帧 drawImage(HTMLImageElement) 的调用源
// 用真实大世界存档(public/tmp-imgdraw-world.json,loadJson 绕 worldgen)
// 目标:定位 trace 残余每帧 LazyPixelRef(519831×1095 / 528731×790)的真身
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 120)));
// document-start 装 wrapper(抢在业务模块前;记录 Image 实例的绘制计数)
await p.evaluateOnNewDocument(() => {
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  const stats = new Map();
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    try {
      if (img instanceof HTMLImageElement) {
        const k = (img.currentSrc || img.src || '').split('/').pop().slice(0, 70);
        stats.set(k, (stats.get(k) || 0) + 1);
        if (stats.size > 500) stats.clear();
      }
    } catch { /* ignore */ }
    return orig.call(this, img, ...rest);
  };
  window.__imgDrawStats = stats;
});
await p.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
// 菜单态基线
const menuBase = await p.evaluate(() => ({ ...window.__imgDrawStats }));
// 载入真实大世界存档(loadJson 绕 worldgen)
console.log('载入大世界存档…');
const ok = await p.evaluate(async () => {
  const r = await fetch('/tmp-imgdraw-world.json');
  if (!r.ok) return `fetch ${r.status}`;
  await window.__swFlow.loadJson(await r.text());
  return 'ok';
});
console.log('loadJson →', ok);
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 2000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 5000));
if (!(await p.evaluate(() => !!window.__swGame).catch(() => false))) { console.log('FAIL:未进世界'); await b.close(); process.exit(1); }
const sample = async (label, ms, move) => {
  const before = await p.evaluate(() => ({ ...window.__imgDrawStats }));
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (move) await p.evaluate((i) => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 + (i % 7) * 15, clientY: 260 + (i % 3) * 25, bubbles: true }));
    }, Math.random() * 100 | 0);
    await new Promise(r => setTimeout(r, 50));
  }
  const after = await p.evaluate(() => ({ ...window.__imgDrawStats }));
  const delta = {};
  for (const [k, v] of Object.entries(after)) {
    const d = v - (before[k] ?? 0);
    if (d > 0) delta[k] = d;
  }
  const sorted = Object.entries(delta).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`[${label}] ${ms / 1000}s 内 HTMLImageElement drawImage:`);
  for (const [k, v] of sorted) console.log(`  ×${v}  ${k}`);
  if (!sorted.length) console.log('  (零)');
};
await sample('进世界-静止', 4000, false);
await sample('进世界-扫鼠标', 4000, true);
await b.close(); process.exit(0);

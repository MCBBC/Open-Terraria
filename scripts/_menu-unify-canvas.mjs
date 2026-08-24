// 一次性:菜单路径 canvas 分配哨兵——晨昏 tint 连续扫描期逐层烘焙缓存
// (BiomeBackground.menuTintBufs)不得产生持续 canvas 分配(雪崩坑回归)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__bornStacks = new Map();
  window.__bornOn = false;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) {
      const st = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at\s+/, '')).join(' | ');
      window.__bornStacks.set(st, (window.__bornStacks.get(st) || 0) + 1);
    }
    return orig(tag, ...rest);
  };
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100; i++) {
  if (await page.evaluate(() => !!window.__swMenuBg).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
for (let i = 0; i < 120; i++) {
  if (await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));
// 黄昏扫描(色调漂移最快窗):time 44000→54000 每 100ms +750,共 ~13s;再入夜扫 2000 帧
await page.evaluate(() => { window.__bornOn = true; window.__swMenuBg.vTime = 44000; window.__swMenuBg.dayTime = true; });
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => { const mb = window.__swMenuBg; mb.vTime = Math.min(54000, mb.vTime + 750); });
  await new Promise((r) => setTimeout(r, 100));
}
await page.evaluate(() => { const mb = window.__swMenuBg; mb.dayTime = false; mb.vTime = 2000; });
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => { const mb = window.__swMenuBg; mb.vTime += 400; });
  await new Promise((r) => setTimeout(r, 100));
}
const out = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  return {
    stacks: Array.from(window.__bornStacks.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    total: Array.from(window.__bornStacks.values()).reduce((a, b) => a + b, 0),
    tintBufs: mb.biomeBg.menuTintBufs.size,
    alphaFront: [mb.biomeBg.alphaFront[0], mb.biomeBg.alphaFront[1]].map((v) => +v.toFixed(2)),
  };
});
console.log('CANVAS_BORN:', JSON.stringify(out, null, 1));
await browser.close();

import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => { window.__swGame.paused = true; });
await new Promise(r => setTimeout(r, 1500));
// 记录 3s 内 alphaFront/bgStyle/ugAlpha 的变化(渲染侧动画,暂停也在走)
const series = await p.evaluate(async () => {
  const bg = window.__swGame.renderer.biomeBg;
  const out = [];
  for (let i = 0; i < 30; i++) {
    out.push(`style=${bg.bgStyle} front0=${bg['alphaFront'][0].toFixed(2)} front1=${bg['alphaFront'][1]?.toFixed(2) ?? '-'} ugA=${bg['ugAlpha'].toFixed(2)} ug=${bg.ugStyle}/${bg['ugOld']}`);
    await new Promise(r => setTimeout(r, 100));
  }
  return out;
});
const uniq = [...new Set(series)];
console.log(`30 个采样点去重后 ${uniq.length} 种状态:`);
console.log(uniq.join('\n'));
await b.close(); process.exit(0);

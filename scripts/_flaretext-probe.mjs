// 一次性:光斑贴图加载态检查——菜单黄昏页内读 sunflareTex 各键 width/complete
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('console', (m) => { if (m.text().includes('[flare]')) console.log('[page]', m.text()); });
p.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(-60), r.failure()?.errorText));
await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await p.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await sleep(1000);
for (let i = 0; i < 30; i++) {
  if (await p.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await sleep(500);
}
await p.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.dayTime = true;
  mb.vTime = 48000;
});
await sleep(2500);   // 给足加载时间
const st = await p.evaluate(() => {
  const s = window.__swMenuBg.sky;
  const keys = ['flare1', 'flare2', 'bokeh', 'spectra', 'pointblurry', 'pointsharp', 'colorgradient'];
  const out = {};
  for (const k of keys) {
    try {
      const t = s.sunflareTexLoad(k);
      out[k] = t ? { w: t.width, h: t.height, complete: t.complete, src: String(t.src).slice(-40) } : 'null';
    } catch (e) { out[k] = 'ERR:' + String(e).slice(0, 60); }
  }
  return {
    tex: out,
    sun: s.sunScreen,
    vis: s.horizonVisCache,
    sampled: s.sunVisSampled,
    occ: s.sunVisibility
  };
});
console.log(JSON.stringify(st, null, 1));
await b.close();

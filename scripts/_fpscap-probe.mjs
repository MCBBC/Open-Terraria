import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-fps-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 4000));
const read = (label) => p.evaluate((l) => {
  const g = window.__swGame;
  return { label: l, cap: g['options']?.data?.frameCap ?? import('/src/core/Options.ts').then ? undefined : undefined, fps: g.fps, dts: g.frameDts.slice(-10).map(x => Math.round(x)) };
}, label).catch(e => String(e));
const a = await read('默认');
// 切不锁
await p.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', 0);
});
await new Promise(r => setTimeout(r, 2500));
const b2 = await read('不锁');
// 切回 60
await p.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', 60);
});
await new Promise(r => setTimeout(r, 2500));
const c = await read('回60');
console.log(JSON.stringify(a)); console.log(JSON.stringify(b2)); console.log(JSON.stringify(c));
await b.close(); process.exit(0);

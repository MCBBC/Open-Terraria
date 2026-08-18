import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => { errs.push(String(e)); console.log('[pageerror]', String(e).slice(0, 400)); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-crash-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
// Lucy 台词弹窗 ×20(与真实砍树同款调用)
const r1 = await p.evaluate(async () => {
  const mod = await import('/src/items/LucyAxe.ts');
  const create = mod.create ?? mod.lucyCreate;
  for (let i = 0; i < 20; i++) create('choppedTree', 7 * (i % 2 ? 1 : -1), -7);
  return typeof create;
});
console.log('lucyCreate 调用:', r1);
await new Promise(r => setTimeout(r, 4000));
const alive = await p.evaluate(() => ({ alive: !!window.__swGame.running, tick: window.__swGame.tickCount, errs: (window.__swErrors ?? []).slice(-2).map(e => e.msg.slice(0, 150)) }));
console.log('4s 后:', JSON.stringify(alive));
console.log('pageerror:', errs.length);
await b.close(); process.exit(0);

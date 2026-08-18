import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
const logs = [];
p.on('console', m => { const t = m.text(); if (t.startsWith('[b]') || t.startsWith('[q]') || t.startsWith('[t2]')) logs.push(t); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const origQ = mod.GLSpriteLayer.prototype.quad;
  let n = 0;
  mod.GLSpriteLayer.prototype.quad = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    if (n++ < 30) console.log(`[q] tint=${JSON.stringify(opts?.tint ?? null)} a=${(opts?.alpha ?? 1).toFixed(2)}`);
    return origQ.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
  const bg = await import('/src/render/BiomeBackground.ts');
  const origT = bg.BiomeBackground.prototype.drawTiledTinted;
  let m = 0;
  bg.BiomeBackground.prototype.drawTiledTinted = function (ctx, im, tr, tg, tb, dx, dy, dw, dh) {
    if (m++ < 10) console.log(`[t2] bake tint=${tr.toFixed(2)},${tg.toFixed(2)},${tb.toFixed(2)}`);
    return origT.call(this, ctx, im, tr, tg, tb, dx, dy, dw, dh);
  };
});
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.75;
  g.paused = true;
});
logs.length = 0;                       // 清掉进世界的白昼日志
await new Promise(r => setTimeout(r, 3000));
const clockInfo = await p.evaluate(() => {
  const g = window.__swGame;
  const c1 = g.world.clock;
  // 渲染器实际拿到的 clock:Game.render 传的哪个对象——抓一帧看
  const c2 = g['clock'] ?? null;
  return { world: { t: c1.timeOfDay, df: c1.dayFactor }, game: c2 ? { t: c2.timeOfDay, df: c2.dayFactor, same: c2 === c1 } : 'no-field' };
});
console.log('[b] clock 对象:', JSON.stringify(clockInfo));
console.log('黄昏窗日志(quad/t2bake):');
console.log([...new Set(logs)].slice(0, 12).join('\n'));
await b.close(); process.exit(0);

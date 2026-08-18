import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
const logs = [];
p.on('console', m => { const t = m.text(); if (t.includes('[q]')) logs.push(t); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
// 打桩:quad 实参(世界进入前打,renderer 的 glfx 懒建实例继承补丁)
await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const orig = mod.GLSpriteLayer.prototype.quad;
  let n = 0;
  mod.GLSpriteLayer.prototype.quad = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    if (n++ < 6) console.log(`[q]#${n} tint=${JSON.stringify(opts?.tint ?? null)} alpha=${opts?.alpha ?? 1} smooth=${opts?.smooth ?? true} dst=${dx.toFixed(0)},${dy.toFixed(0)},${dw.toFixed(0)}x${dh.toFixed(0)} tex=${e.w}x${e.h}`);
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
  window.__keepMod = mod;
});
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
console.log(logs.slice(0, 6).join('\n'));
await b.close(); process.exit(0);

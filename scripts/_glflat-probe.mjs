import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
const logs = [];
p.on('console', m => { const t = m.text(); if (t.startsWith('[q]')) logs.push(t); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const orig = mod.GLSpriteLayer.prototype.quad;
  window.__qlog = [];
  mod.GLSpriteLayer.prototype.quad = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    window.__qlog.push(`tex=${e.w}x${e.h} src=${sx},${sy},${sw}x${sh} dst=${dx.toFixed(0)},${dy.toFixed(0)},${dw.toFixed(0)}x${dh.toFixed(0)} tint=${JSON.stringify(opts?.tint ?? null)} a=${(opts?.alpha ?? 1).toFixed(2)}`);
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
});
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.paused = true;
  window.__qlog.length = 0;      // 冻结后清零,只留下一帧
});
await new Promise(r => setTimeout(r, 400));
const frame = await p.evaluate(() => {
  const q = window.__qlog.slice();         // 一帧的 quad 序列
  window.__qlog.length = 0;
  // GL 画布本体读回(不经主画布合成)
  const gl = window.__swGame.renderer.glfx;
  const c = gl.canvas;
  const ctx = c.getContext('webgl2');
  const w = 64, h = 40;
  const px = new Uint8Array(w * h * 4);
  ctx.readPixels(c.width / 2 - w / 2, c.height / 2 - h / 2, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  // 采两点(读回是底起,翻转): 中点 + 中上
  const mid = [(c.height / 2) | 0, (c.width / 2) | 0];
  const at = (x, y) => { const i = ((c.height - y) * c.width + x) * 4; return [px[0], px[1], px[2]]; };
  void mid; void at;
  return { quads: q, canvasSize: [c.width, c.height] };
});
console.log('一帧 quad 数:', frame.quads.length);
console.log(frame.quads.slice(0, 20).join('\n'));
await b.close(); process.exit(0);

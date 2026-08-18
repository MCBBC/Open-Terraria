import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
const logs = [];
p.on('console', m => { const t = m.text(); if (t.startsWith('[q]') || t.startsWith('[tint]')) logs.push(t); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const orig = mod.GLSpriteLayer.prototype.quad;
  let n = 0;
  mod.GLSpriteLayer.prototype.quad = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    if (n++ < 400) console.log(`[q] tint=${JSON.stringify(opts?.tint ?? null)} a=${(opts?.alpha ?? 1).toFixed(2)} tex=${e.w}x${e.h} dst=${dx.toFixed(0)},${dy.toFixed(0)}`);
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
});
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.75;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = true;
});
await new Promise(r => setTimeout(r, 2500));
// 记录黄昏帧的 tint 实参(取这一窗的 log)——同时页内重算 Renderer 的 tint 公式
const info = await p.evaluate(() => {
  const g = window.__swGame;
  const clock = g.world.clock;
  const df = clock.dayFactor, t = clock.timeOfDay;
  const dusk = t > 0.68 && t < 0.82 ? 1 - Math.abs(t - 0.75) / 0.07 : t > 0.18 && t < 0.32 ? 1 - Math.abs(t - 0.25) / 0.07 : 0;
  const night = 1 - df;
  return { df, t, tint: [1 - 0.70 * night + 0.10 * dusk, 1 - 0.66 * night - 0.22 * dusk, 1 - 0.50 * night - 0.40 * dusk] };
});
console.log('[tint] 公式值:', JSON.stringify(info));
const px = (x, y) => p.evaluate((x2, y2) => {
  const c = window.__swGame.renderer.canvas;
  const d = c.getContext('2d').getImageData(x2 * 2, y2 * 2, 1, 1).data;  // DPR2
  return [d[0], d[1], d[2]];
}, x, y);
const glP = [await px(640, 200), await px(400, 60)];
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 900));
const c2dP = [await px(640, 200), await px(400, 60)];
console.log('GL 帧像素:', JSON.stringify(glP), '| 2D 帧像素:', JSON.stringify(c2dP));
console.log('黄昏窗 quad log 前 8 条:');
console.log(logs.slice(-8).join('\n'));
await b.close(); process.exit(0);

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
// ① 传送(相机跟随) ② 等稳 ③ 冻结+黄昏 ④ 打桩
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise(r => setTimeout(r, 2000));
await p.evaluate(async () => {
  const g = window.__swGame;
  g.paused = true;
  g.world.clock.timeOfDay = 0.75;
  g.world.clock.dayFactor = 0.5;
  const mod = await import('/src/render/GLSpriteLayer.ts');
  window.__qlast = null;
  window.__qcount = 0;
  const orig = mod.GLSpriteLayer.prototype.quad;
  mod.GLSpriteLayer.prototype.quad = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
    window.__qcount++;
    if (opts?.tint && window.__qcount < 200) window.__qlast = [...opts.tint];
    return orig.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
  };
});
await new Promise(r => setTimeout(r, 1200));
const grab = () => p.evaluate(() => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2d = c.getContext('2d');
  const pts = {};
  for (const [name, x, y] of [['a', 1280, 200], ['b', 1280, 400], ['c', 800, 400], ['d', 400, 260]]) {
    const d = ctx2d.getImageData(x, y, 1, 1).data;
    pts[name] = [d[0], d[1], d[2]];
  }
  return { pts, cam: { x: g.camera.x, y: g.camera.y }, q: window.__qlast, qn: window.__qcount, bgGL: g.renderer.bgGlEnabled };
});
const A = await grab();
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 900));
const B = await grab();
console.log('GL 帧:', JSON.stringify(A));
console.log('2D 帧:', JSON.stringify(B));
await b.close(); process.exit(0);

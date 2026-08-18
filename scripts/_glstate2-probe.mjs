import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => {
  const bg = await import('/src/render/BiomeBackground.ts');
  const origDraw = bg.BiomeBackground.prototype.draw;
  window.__states = [];
  bg.BiomeBackground.prototype.draw = function (target, ...args) {
    const isCtx = typeof (target && target.img) !== 'function';
    if (isCtx && window.__states.length < 3) {
      window.__states.push({ gCO: target.globalCompositeOperation, gA: target.globalAlpha, filter: String(target.filter) });
    }
    return origDraw.call(this, target, ...args);
  };
});
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise(r => setTimeout(r, 2000));
await p.evaluate(() => {
  window.__swGame.paused = true;
  window.__states.length = 0;    // 只留 A/B 时段的状态
});
await new Promise(r => setTimeout(r, 600));
const grab = () => p.evaluate(() => {
  const g = window.__swGame;
  const d = g.renderer.canvas.getContext('2d').getImageData(400, 400, 1, 1).data;
  return { px: [d[0], d[1], d[2]], states: window.__states.slice() };
});
const A = await grab();
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; window.__states.length = 0; });
await new Promise(r => setTimeout(r, 900));
const B = await grab();
console.log('GL 帧:', JSON.stringify(A));
console.log('2D 帧:', JSON.stringify(B));
await b.close(); process.exit(0);

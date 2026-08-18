// 翻转修复验证 + 决定性 A/B(带 GL 分支命中计数)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  let n = 0;
  const orig = mod.GLSpriteLayer.prototype.quad;
  mod.GLSpriteLayer.prototype.quad = function (...a) { n++; return orig.apply(this, a); };
  window.__quadCount = () => { const c = n; return c; };
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
// 地表 A/B
const s = () => p.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const ctx = c.getContext('2d');
  const out = [];
  for (let j = 0; j < 30; j++) for (let i = 0; i < 96; i++) {
    const d = ctx.getImageData(Math.floor((i + 0.5) * c.width / 96), Math.floor((j + 0.5) * c.height * 0.55 / 30), 1, 1).data;
    out.push(d[0], d[1], d[2]);
  }
  return out;
});
const cmp = (A, B) => {
  let mx = 0, sum = 0, n2 = 0, over = 0;
  for (let i = 0; i < A.length; i += 3) {
    const d = Math.max(Math.abs(A[i]-B[i]), Math.abs(A[i+1]-B[i+1]), Math.abs(A[i+2]-B[i+2]));
    mx = Math.max(mx, d); sum += d; n2++; if (d > 8) over++;
  }
  return `最大Δ=${mx} 平均Δ=${(sum/n2).toFixed(2)} Δ>8=${(over/n2*100).toFixed(1)}%`;
};
const c0 = await p.evaluate(() => window.__quadCount());
const bgGL = await s();
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 900));
const bg2D = await s();
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = true; });
console.log(`#1 背景 A/B: ${cmp(bgGL, bg2D)}(quad 累计 ${c0})`);
// 地图 A/B(带命中计数)
await p.evaluate(() => {
  const fm = window.__swGame.renderer.fullMap;
  fm.open = true; fm.zoom = 1.25; fm.zoomTarget = 1.25; fm.panX = 0; fm.panY = 0;
});
await new Promise(r => setTimeout(r, 1200));
const c1 = await p.evaluate(() => window.__quadCount());
const sm = () => p.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const ctx = c.getContext('2d');
  const out = [];
  for (let j = 0; j < 54; j++) for (let i = 0; i < 96; i++) {
    const d = ctx.getImageData(Math.floor((i + 0.5) * c.width / 96), Math.floor((j + 0.5) * c.height / 54), 1, 1).data;
    out.push(d[0], d[1], d[2]);
  }
  return out;
});
const mapGL = await sm();
await p.evaluate(() => { window.__swGame.renderer.mapGlEnabled = false; });
await new Promise(r => setTimeout(r, 900));
const c2 = await p.evaluate(() => window.__quadCount());
const map2D = await sm();
console.log(`#2 地图 A/B: ${cmp(mapGL, map2D)}(开图后 quad 增量 ${await p.evaluate(() => window.__quadCount()) - c1}→${c2 - c1})`);
await b.close(); process.exit(0);

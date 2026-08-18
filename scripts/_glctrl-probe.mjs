import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.75;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = true;
  g.renderer.bgGlEnabled = false;   // 全程 2D!
});
await new Promise(r => setTimeout(r, 3000));
const px = () => p.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const ctx = c.getContext('2d');
  const out = [];
  for (let j = 0; j < 30; j++) for (let i = 0; i < 96; i++) {
    const d = ctx.getImageData(Math.floor((i + 0.5) * c.width / 96), Math.floor((j + 0.5) * c.height * 0.55 / 30), 1, 1).data;
    out.push(d[0], d[1], d[2]);
  }
  return out;
});
const A = await px();
await new Promise(r => setTimeout(r, 900));
const B = await px();
let mx = 0, sum = 0, n = 0, over = 0;
for (let i = 0; i < A.length; i += 3) {
  const d = Math.max(Math.abs(A[i]-B[i]), Math.abs(A[i+1]-B[i+1]), Math.abs(A[i+2]-B[i+2]));
  mx = Math.max(mx, d); sum += d; n++; if (d > 8) over++;
}
console.log(`对照组(2D vs 2D, 900ms, 暂停): 最大Δ=${mx} 平均Δ=${(sum/n).toFixed(2)} Δ>8=${(over/n*100).toFixed(1)}%`);
await b.close(); process.exit(0);

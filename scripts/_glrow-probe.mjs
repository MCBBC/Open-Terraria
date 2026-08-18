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
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = (g.world.spawnX - 2) * 16; g.player.y = (g.world.spawnY - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise(r => setTimeout(r, 2000));
await p.evaluate(() => { window.__swGame.paused = true; });
await new Promise(r => setTimeout(r, 600));
const grab = async () => {
  const r = await p.evaluate(() => {
    const ctx2d = window.__swGame.renderer.canvas.getContext('2d');
    const row = [];
    for (let x = 0; x < 2560; x += 80) {
      const d = ctx2d.getImageData(x, 400, 1, 1).data;
      row.push([x, d[0], d[1], d[2]]);
    }
    return row;
  });
  return r;
};
const A = await grab();
await p.evaluate(() => { window.__swGame.renderer.bgGlEnabled = false; });
await new Promise(r => setTimeout(r, 900));
const B = await grab();
console.log('    x    GL               2D');
for (let i = 0; i < A.length; i++) {
  const a = A[i], c = B[i];
  const d = Math.max(Math.abs(a[1]-c[1]), Math.abs(a[2]-c[2]), Math.abs(a[3]-c[3]));
  console.log(`${String(a[0]).padStart(5)}  (${a[1]},${a[2]},${a[3]})  (${c[1]},${c[2]},${c[3]})  Δ=${d}`);
}
await b.close(); process.exit(0);

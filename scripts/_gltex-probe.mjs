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
const r = await p.evaluate(() => {
  const g = window.__swGame;
  const glc = g.renderer.glfx.canvas;
  const gl = glc.getContext('webgl2');
  const px = new Uint8Array(4);
  gl.readPixels(400, glc.height - 400, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 翻转 y
  // 主画布同点
  const d = g.renderer.canvas.getContext('2d').getImageData(400, 400, 1, 1).data;
  // 找覆盖此点的 quad 的源图:森林 t0 层即 Background_50(FOREST_STYLES[0].t[0]=50)
  const im = new Image();
  return new Promise((resolve) => {
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      // 采样源图中部三点
      const pts = [];
      for (const [sx, sy] of [[512, 349], [200, 500], [800, 200]]) {
        const d2 = x.getImageData(sx, sy, 1, 1).data;
        pts.push([sx, sy, d2[0], d2[1], d2[2], d2[3]]);
      }
      resolve({ glCanvasPx: [px[0], px[1], px[2], px[3]], mainPx: [d[0], d[1], d[2]], tex50: pts, texSize: [im.width, im.height] });
    };
    im.src = '/sprites/vanilla/Background_50.png';
  });
});
console.log(JSON.stringify(r));
await b.close(); process.exit(0);

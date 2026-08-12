import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame && window.__swGame.player) {
      clearInterval(iv);
      (async () => {
        const g = window.__swGame;
        await new Promise((r2) => setTimeout(r2, 1500));
        g.world.explored.fill(1); g.world.exploredVersion++;
        g.renderer.fullbright = true;
        g.player.x = (g.world.spawnX + 40) * 16;
        g.player.y = (Math.floor(g.world.groundLevel) + 120) * 16;
        await new Promise((r2) => setTimeout(r2, 900));
        g.camera.x += 0.37; g.camera.y += 0.43;
        await new Promise((r2) => setTimeout(r2, 400));
        const canvas = g.renderer.canvas;
        const ctx = canvas.getContext('2d');
        const z = g.camera.zoom;
        const W = canvas.width, H = canvas.height;
        const camRX = Math.round(g.camera.x * z) / z;
        const camRY = Math.round(g.camera.y * z) / z;
        const yTop = 150, yH = 400;
        const img = ctx.getImageData(0, yTop, W, yH).data;
        const col = (x, y) => { const i = (y * W + x) * 4; return [img[i], img[i + 1], img[i + 2]]; };
        // 逐列异常分:与左右邻列均值差的平均(高=竖缝嫌疑列)
        const colScores = [];
        for (let x = 2; x < W - 2; x++) {
          let s = 0;
          for (let y = 0; y < yH; y += 2) {
            const a = col(x - 1, y), b = col(x, y), c = col(x + 1, y);
            s += Math.abs(b[0] - (a[0] + c[0]) / 2) + Math.abs(b[1] - (a[1] + c[1]) / 2) + Math.abs(b[2] - (a[2] + c[2]) / 2);
          }
          colScores.push({ x, s: s / (yH / 2) });
        }
        colScores.sort((a, b) => b.s - a.s);
        const worldXof = (sx) => (sx - W / 2) / z + camRX;
        const top = colScores.slice(0, 15).map((c) => ({
          sx: c.x, score: Math.round(c.s),
          wx: Math.round(worldXof(c.x)),
          mod16: Math.round(worldXof(c.x)) % 16,
          mod256: Math.round(worldXof(c.x)) % 256,
        }));
        // 同样扫行(对照)
        const xLeft = 200, xW = 800;
        const img2 = ctx.getImageData(xLeft, 0, xW, H).data;
        const row2 = (x, y) => { const i = (y * xW + (x - xLeft)) * 4; return [img2[i], img2[i + 1], img2[i + 2]]; };
        const rowScores = [];
        for (let y = 2; y < H - 2; y++) {
          let s = 0;
          for (let x = xLeft; x < xLeft + xW; x += 2) {
            const a = row2(x, y - 1), b = row2(x, y), c = row2(x, y + 1);
            s += Math.abs(b[0] - (a[0] + c[0]) / 2) + Math.abs(b[1] - (a[1] + c[1]) / 2) + Math.abs(b[2] - (a[2] + c[2]) / 2);
          }
          rowScores.push({ y, s: s / (xW / 2) });
        }
        rowScores.sort((a, b) => b.s - a.s);
        const topRows = rowScores.slice(0, 8).map((c) => ({ sy: c.y, score: Math.round(c.s) }));
        // 基线(中位数)
        const med = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
        res({
          zoom: z,
          colMedian: Math.round(med(colScores.map(c => c.s))),
          topCols: top,
          rowMedian: Math.round(med(rowScores.map(c => c.s))),
          topRows,
        });
      })();
    } else if (Date.now() - t0 > 180000) { clearInterval(iv); res({ error: 'timeout' }); }
  }, 250);
}));
console.log(JSON.stringify(r, null, 1));
await browser.close();

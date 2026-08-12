// 新鲜世界复刻用户场景(陶罐放平台上)→ chunk vs 素材期望 互相关测位移
// 位移>0 = 渲染错位实锤并可量化;位移=0 = 用户存档环境专属(加载期陈旧)
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swTileByKey, { timeout: 600000, polling: 2000 });
await new Promise((r) => setTimeout(r, 2000));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const POT = window.__swTileByKey('pot');
  const PLAT = window.__swTileByKey('platform');
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const y0 = py + 12;
  // 平台行 + 陶罐(用户同款帧)
  for (let x = px - 4; x <= px + 6; x++) { st.setTile(x, y0, PLAT); st.setTile(x, y0 - 1, 0); st.setTile(x, y0 - 2, 0); }
  st.setTile(px, y0 - 2, POT, 72, 432); st.setTile(px + 1, y0 - 2, POT, 90, 432);
  st.setTile(px, y0 - 1, POT, 72, 450); st.setTile(px + 1, y0 - 1, POT, 90, 450);
  return { px, y0 };
});
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate((s) => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const img = atlas.ensureVImage('vanilla/Tiles_28.png');
  if (!img) return { err: 'sheet 未加载' };
  const key = (Math.floor(s.px / 16) & 0xffff) | ((Math.floor((s.y0 - 2) / 16) & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return { err: 'no chunk' };
  const cctx = pair.tile.getContext('2d');
  const cells = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = s.px + dx, y = s.y0 - 2 + dy;
    const chunkD = cctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
    // 期望帧
    const ec = document.createElement('canvas');
    ec.width = 16; ec.height = 16;
    const ectx = ec.getContext('2d');
    ectx.drawImage(img, 72 + dx * 18, 432 + dy * 18, 16, 16, 0, 0, 16, 16);
    const expD = ectx.getImageData(0, 0, 16, 16).data;
    // 互相关:在 ±6px 范围找最佳对齐(逐平移算 alpha 重合)
    let best = { shiftX: 99, shiftY: 99, score: -1 };
    for (let sy = -6; sy <= 6; sy++) {
      for (let sx = -6; sx <= 6; sx++) {
        let hit = 0, total = 0;
        for (let yy = 0; yy < 16; yy++) {
          for (let xx = 0; xx < 16; xx++) {
            const cx2 = xx - sx, cy2 = yy - sy;
            if (cx2 < 0 || cx2 > 15 || cy2 < 0 || cy2 > 15) continue;
            const a1 = chunkD[(yy * 16 + xx) * 4 + 3] > 40 ? 1 : 0;
            const a2 = expD[(cy2 * 16 + cx2) * 4 + 3] > 40 ? 1 : 0;
            total++;
            if (a1 === a2) hit++;
          }
        }
        const score = hit / total;
        if (score > best.score) best = { shiftX: sx, shiftY: sy, score };
      }
    }
    let op = 0;
    for (let k = 3; k < chunkD.length; k += 4) if (chunkD[k] > 40) op++;
    cells.push({ dx, dy, chunkOpaque: op, bestShift: [best.shiftX, best.shiftY], alignScore: Number(best.score.toFixed(3)) });
  }
  return { cells };
}, setup);
console.log(JSON.stringify(out, null, 1));
await browser.close();

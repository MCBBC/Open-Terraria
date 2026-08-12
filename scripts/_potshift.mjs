// 陶罐错位测量:加载用户存档(worker 秒级) → 标注陶罐旁放同款测试陶罐
// → chunk vs 素材期望帧 互相关测位移(±6px)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync('/Users/vinlic/Downloads/map-12345世界 (2).json', 'utf8');
async function attempt(n) {
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000, polling: 2000 });
// 稳定窗口:确认 __swGame.renderer 与 chunks 均在(防 HMR 重载中间态)
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 60000, polling: 500 });
await new Promise((r) => setTimeout(r, 3000));
console.log('存档已加载(第', n + 1, '次尝试)');

// 在标注陶罐 (3385,189) 右侧 6 格放同款测试陶罐(用户同帧 72/90,432/450),下方平台
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const POT = window.__swTileByKey('pot');
  const PLAT = window.__swTileByKey('platform');
  const bx = 3392, by = 189;
  for (let x = bx - 1; x <= bx + 3; x++) { st.setTile(x, by + 2, PLAT); st.setTile(x, by, 0); st.setTile(x, by + 1, 0); }
  st.setTile(bx, by, POT, 72, 432); st.setTile(bx + 1, by, POT, 90, 432);
  st.setTile(bx, by + 1, POT, 72, 450); st.setTile(bx + 1, by + 1, POT, 90, 450);
  // 相机对准两个陶罐中间
  g.player.x = (3385 + bx) / 2 * 16; g.player.y = (by - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  return { bx, by };
});
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate((s) => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const img = atlas.ensureVImage('vanilla/Tiles_28.png');
  if (!img) return { err: 'sheet 未加载' };
  const measure = (x0, y0) => {
    const key = (Math.floor(x0 / 16) & 0xffff) | ((Math.floor(y0 / 16) & 0xffff) << 16);
    const pair = g.chunks.chunks.get(key);
    if (!pair) return [{ err: 'no chunk' }];
    const cctx = pair.tile.getContext('2d');
    return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => {
      const x = x0 + dx, y = y0 + dy;
      const chunkD = cctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
      const ec = document.createElement('canvas');
      ec.width = 16; ec.height = 16;
      const ectx = ec.getContext('2d');
      ectx.drawImage(img, 72 + dx * 18, 432 + dy * 18, 16, 16, 0, 0, 16, 16);
      const expD = ectx.getImageData(0, 0, 16, 16).data;
      let best = { sx: 99, sy: 99, score: -1 };
      for (let sy = -6; sy <= 6; sy++) for (let sx = -6; sx <= 6; sx++) {
        let hit = 0, total = 0;
        for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
          const cx2 = xx - sx, cy2 = yy - sy;
          if (cx2 < 0 || cx2 > 15 || cy2 < 0 || cy2 > 15) continue;
          total++;
          if ((chunkD[(yy * 16 + xx) * 4 + 3] > 40 ? 1 : 0) === (expD[(cy2 * 16 + cx2) * 4 + 3] > 40 ? 1 : 0)) hit++;
        }
        if (hit / total > best.score) best = { sx, sy, score: hit / total };
      }
      let op = 0;
      for (let k = 3; k < chunkD.length; k += 4) if (chunkD[k] > 40) op++;
      return { dx, dy, op, shift: [best.sx, best.sy], score: Number(best.score.toFixed(3)) };
    });
  };
  return { userPot: measure(3385, 189), testPot: measure(s.bx, s.by) };
}, setup);
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/pot-shift.png' });
await browser.close();
return out;
}
let lastErr = null;
for (let n = 0; n < 3; n++) {
  try { const r = await attempt(n); if (r && !String(r).includes('err')) break; } catch (e) { lastErr = e; console.log('尝试', n + 1, '失败:', e.message.slice(0, 80)); }
}
if (lastErr && typeof lastErr === 'object') process.exit(1);

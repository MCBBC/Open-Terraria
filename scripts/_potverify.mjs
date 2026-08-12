// 加载用户存档 → 标注陶罐 (3385,189) → chunk 像素 vs 素材期望帧逐像素对比
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-12345世界 (2).json';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
const saveText = readFileSync(SAVE, 'utf8');
console.log('存档', saveText.length, '字节,通过 __swLoadJson 加载…');
await page.evaluate((t) => window.__swLoadJson(t), saveText);
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000, polling: 2000 });
await new Promise((r) => setTimeout(r, 4000));
console.log('存档已加载');

// 传送到标注陶罐处(相机对准,等 chunk 烘焙)
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 200; g.player.y = 186 * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 2500));

const cmp = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const atlas = g.renderer.atlas;
  const out = { cells: [], match: null };
  // 读 4 格的存储帧 + chunk 像素 vs 期望帧像素
  const img = atlas.ensureVImage('vanilla/Tiles_28.png');
  if (!img) return { err: 'Tiles_28 未加载' };
  const expect = document.createElement('canvas');
  expect.width = 32; expect.height = 32;
  const ectx = expect.getContext('2d');
  const key = (Math.floor(3385 / 16) & 0xffff) | ((Math.floor(189 / 16) & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return { err: 'no chunk' };
  const cctx = pair.tile.getContext('2d');
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = 3385 + dx, y = 189 + dy;
    const i = st.idx(x, y);
    const fx = st.frameX[i], fy = st.frameY[i];
    ectx.drawImage(img, fx, fy, 16, 16, dx * 16, dy * 16, 16, 16);
    const lx = (x % 16) * 16, ly = (y % 16) * 16;
    const chunkPx = cctx.getImageData(lx, ly, 16, 16).data;
    const expPx = ectx.getImageData(dx * 16, dy * 16, 16, 16).data;
    let diff = 0, chunkOpaque = 0;
    for (let k = 0; k < chunkPx.length; k += 4) {
      if (chunkPx[k + 3] > 40) chunkOpaque++;
      if (Math.abs(chunkPx[k] - expPx[k]) > 24 || Math.abs(chunkPx[k + 1] - expPx[k + 1]) > 24
        || Math.abs(chunkPx[k + 2] - expPx[k + 2]) > 24 || Math.abs(chunkPx[k + 3] - expPx[k + 3]) > 40) diff++;
    }
    out.cells.push({ x, y, fx, fy, chunkOpaque, diffPx: diff });
  }
  out.match = out.cells.every((c) => c.diffPx <= 8);
  out.stale = true;
  return out;
});
console.log('BAKE 现状(可能是陈旧 chunk):', JSON.stringify(cmp, null, 1));

// 强制全量重烘焙(invalidateAll + 等)再对比
await page.evaluate(() => { window.__swGame.chunks.invalidateAll(); });
await new Promise((r) => setTimeout(r, 4000));
const cmp2 = await page.evaluate(() => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const img = atlas.ensureVImage('vanilla/Tiles_28.png');
  const key = (Math.floor(3385 / 16) & 0xffff) | ((Math.floor(189 / 16) & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return { err: 'no chunk' };
  const cctx = pair.tile.getContext('2d');
  const cells = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = 3385 + dx, y = 189 + dy;
    const lx = (x % 16) * 16, ly = (y % 16) * 16;
    const chunkPx = cctx.getImageData(lx, ly, 16, 16).data;
    // 期望帧直接从素材画
    const ec = document.createElement('canvas');
    ec.width = 16; ec.height = 16;
    const ectx = ec.getContext('2d');
    ectx.drawImage(img, 72 + dx * 18, 432 + dy * 18, 16, 16, 0, 0, 16, 16);
    const expPx = ectx.getImageData(0, 0, 16, 16).data;
    let diff = 0, opaque = 0;
    for (let k = 0; k < chunkPx.length; k += 4) {
      if (chunkPx[k + 3] > 40) opaque++;
      if (Math.abs(chunkPx[k] - expPx[k]) > 24 || Math.abs(chunkPx[k + 1] - expPx[k + 1]) > 24
        || Math.abs(chunkPx[k + 2] - expPx[k + 2]) > 24 || Math.abs(chunkPx[k + 3] - expPx[k + 3]) > 40) diff++;
    }
    cells.push({ x, y, opaque, diffPx: diff });
  }
  return { cells, match: cells.every((c) => c.diffPx <= 8) };
});
console.log('全量重烘焙后:', JSON.stringify(cmp2, null, 1));
await page.screenshot({ path: '/tmp/pot-user-save.png' });
await browser.close();

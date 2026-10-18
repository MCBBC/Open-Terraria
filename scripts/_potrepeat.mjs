// 陶罐烘焙非确定性证明:同一会话内,存储帧不变,强制重建 N 次 → chunk 内容应稳定
// 若变化 = 烘焙非确定性实锤(并记录图像加载状态)
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync(needInput(join(DOWNLOADS, 'map-12345世界 (2).json')), 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 600000, polling: 2000 });
// 传送到陶罐旁
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 100; g.player.y = 185 * 16; g.player.vx = 0; g.player.vy = 0;
});
// 等 Tiles_28 加载完成(消除懒加载竞态变量)
await page.waitForFunction(() => {
  const g = window.__swGame;
  return !!g.renderer.atlas.ensureVImage('vanilla/Tiles_28.png');
}, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const readPot = () => page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const key = (Math.floor(3385 / 16) & 0xffff) | ((Math.floor(189 / 16) & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return { err: 'no chunk' };
  const ctx = pair.tile.getContext('2d');
  const cells = [];
  let fxSum = 0;
  for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
    const i = st.idx(x, y);
    fxSum += st.frameX[i] + st.frameY[i] * 1000;
    const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
    let op = 0;
    for (let k = 3; k < d.length; k += 4) if (d[k] > 40) op++;
    cells.push(op);
  }
  return { cells, fxSum };
});

let done = false;
for (let round = 0; round < 4 && !done; round++) {
  try {
    const r = await readPot();
    console.log(`第 ${round} 次读取:`, JSON.stringify(r));
    if (round < 3) {
      await page.evaluate(() => window.__swGame.chunks.invalidateAll());
      await new Promise((r2) => setTimeout(r2, 2000));
    } else done = true;
  } catch (e) {
    console.log(`第 ${round} 次读取被 HMR 重载打断:`, e.message.slice(0, 60));
    break;
  }
}
await browser.close();

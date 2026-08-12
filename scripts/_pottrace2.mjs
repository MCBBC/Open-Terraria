// 打桩:强制重建陶罐所在 chunk → 统计 drawVanillaCell 对 sheet 28 的取帧调用
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync('/Users/vinlic/Downloads/map-12345世界 (2).json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 600000, polling: 2000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 100; g.player.y = 185 * 16; g.player.vx = 0; g.player.vy = 0;
});
await page.waitForFunction(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/Tiles_28.png'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// 打桩 vframeAt:记录 sheet 28 调用
await page.evaluate(() => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const orig = atlas.vframeAt.bind(atlas);
  window.__calls28 = [];
  atlas.vframeAt = (sheet, fx, fy) => {
    const rr = orig(sheet, fx, fy);
    if (sheet === 28) window.__calls28.push([fx, fy, rr ? 1 : 0]);
    return rr;
  };
});

// 清空记录 → 强制只重建陶罐 chunk → 数调用
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const key = (211 & 0xffff) | ((11 & 0xffff) << 16);
  window.__calls28.length = 0;
  // 先记录陶罐 chunk 重建前后
  g.chunks.invalidateAll();
  return { key };
});
await new Promise((r) => setTimeout(r, 2500));
const r2 = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 活体 half/slope/wire/flags + 图片加载态
  const live = [];
  for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
    const i = st.idx(x, y);
    live.push({ t: st.type[i], f: st.flags[i], half: st.half[i], slope: st.slope[i], wire: st.wire[i], fx: st.frameX[i], fy: st.frameY[i] });
  }
  const imgLoaded = !!g.renderer.atlas.ensureVImage('vanilla/Tiles_28.png');
  const key = (211 & 0xffff) | ((11 & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  const cells = [];
  if (pair) {
    const ctx = pair.tile.getContext('2d');
    for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
      const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
      let op = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 40) op++;
      cells.push(op);
    }
  }
  const c28 = window.__calls28;
  // 统计 (72,432) 等四帧是否被请求
  const want = ['72,432', '90,432', '72,450', '90,450'];
  const hit = want.map((w) => c28.filter((c) => c[0] + ',' + c[1] === w).length);
  return { cells, live, imgLoaded, total28: c28.length, hit, sample: c28.slice(0, 6) };
});
console.log(JSON.stringify(r2, null, 1));
await browser.close();

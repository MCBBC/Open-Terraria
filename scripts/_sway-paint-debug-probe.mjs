// 染色分支调试:paint=0/1/3 三态采样灯笼区域不透明像素数
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  const LANT = window.__swTileByKey('lantern');
  const tx = Math.floor(pl.cx / 16) + 4;
  const ty = Math.floor((pl.y + pl.h) / 16) + 4;
  for (let x = tx - 8; x <= tx + 8; x++) {
    for (let y = ty - 8; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
    st.setTile(x, ty - 8, DIRT);
  }
  st.setTile(tx - 2, ty - 7, LANT, 0, 0);
  st.setTile(tx - 2, ty - 6, LANT, 0, 18);
  pl.x = (tx - 1) * 16; pl.y = (ty - 1) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  // 采样函数:读主画布灯笼区域非背景像素数
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  const sample = () => {
    ctx2.drawImage(cv, 0, 0);
    // 灯笼世界位 → 屏幕
    const [sx, sy] = g.camera.worldToScreen((tx - 2) * 16 + 8, (ty - 7) * 16 + 8);
    const d = ctx2.getImageData(Math.max(0, sx - 20), Math.max(0, sy - 20), 40, 40).data;
    let n = 0, rs = 0, gs = 0, bs = 0;
    for (let p = 0; p < d.length; p += 4) {
      // 排除天空蓝(近似):只统计暖色像素(灯笼木色/橙)
      if (d[p + 3] > 200 && d[p] > 100 && d[p] > d[p + 2]) { n++; rs += d[p]; gs += d[p + 1]; bs += d[p + 2]; }
    }
    return { n, avg: n ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] : null };
  };
  const r0 = sample();
  st.paint[st.idx(tx - 2, ty - 7)] = 3;
  st.paint[st.idx(tx - 2, ty - 6)] = 3;
  await new Promise((r) => setTimeout(r, 300));
  const r3 = sample();
  st.paint[st.idx(tx - 2, ty - 7)] = 0;
  st.paint[st.idx(tx - 2, ty - 6)] = 0;
  await new Promise((r) => setTimeout(r, 300));
  const r0b = sample();
  return { paint0: r0, paint3: r3, paint0again: r0b };
});
console.log(JSON.stringify(out));
await browser.close();

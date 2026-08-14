// 月光像素级实证:同一露天格,白天 vs 夜半(满月/新月)的渲染亮度 + 全屏均值
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  // 玩家旁找一格"露天草地"(实心+上方无墙无实体)
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  let tx = ptx, ty = -1;
  for (let x = ptx - 20; x < ptx + 20; x++) {
    for (let y = pty - 10; y < pty + 10; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && st.wall[i] === 0 && st.type[i] !== 0
        && !st.flags[st.idx(x, y - 1)] && st.wall[st.idx(x, y - 1)] === 0) { tx = x; ty = y; break; }
    }
    if (ty > 0) break;
  }
  const sample = () => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const c = g.renderer.canvas;
    const ctx2 = c.getContext('2d');
    const sc = c.width / 1280;   // backing scale
    const px0 = Math.max(0, Math.round(sx * sc - 8 * sc)), py0 = Math.max(0, Math.round(sy * sc - 8 * sc));
    const img = ctx2.getImageData(px0, py0, Math.round(16 * sc), Math.round(16 * sc)).data;
    let s = 0, n = 0;
    for (let i = 0; i < img.length; i += 4) { s += (img[i] + img[i + 1] + img[i + 2]) / 3; n++; }
    // 全屏均值
    const full = ctx2.getImageData(0, 0, c.width, c.height).data;
    let fs = 0;
    for (let i = 0; i < full.length; i += 40) fs += (full[i] + full[i + 1] + full[i + 2]) / 3;
    return { tileAvg: Math.round(s / n), fullAvg: Math.round(fs / (full.length / 40)), light: g.lighting.lightAt(tx, ty).map(Math.round) };
  };
  return new Promise((resolve) => {
    const r = {};
    w.clock.timeOfDay = 0.5; w.clock.isDay = true;
    setTimeout(() => {
      r.day = sample();
      w.clock.timeOfDay = 0; w.clock.isDay = false; w.clock.moonPhase = 0;   // 满月
      setTimeout(() => {
        r.nightFull = sample();
        w.clock.moonPhase = 4;                                              // 新月
        setTimeout(() => { r.nightNew = sample(); resolve({ tile: [tx, ty], r }); }, 900);
      }, 900);
    }, 900);
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();

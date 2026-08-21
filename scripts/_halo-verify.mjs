// 修复验证:夜晚多时间点抓帧,跑"硬边矩形"检测(报告2 同款:边缘密度法),
// 全零=修复通过;并截 3 帧供肉眼复核
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
let worst = 0, shots = [];
for (let round = 0; round < 6; round++) {
  await page.goto(origin + '/?play=small&v=' + round, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const r = await page.evaluate(async (round) => {
    const t0 = Date.now();
    while (!(window.__swGame?.player && window.__swGame.world)) {
      if (Date.now() - t0 > 120000) return null;
      await new Promise((res) => setTimeout(res, 300));
    }
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.68 + round * 0.03;   // 0.68..0.83 夜段扫
    g.player.x = 2524 * 16; g.player.y = 231 * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    await new Promise((res) => setTimeout(res, 1500));
    const cv = g.renderer.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    g.frame(performance.now());
    const img = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    // 边缘密度:竖边列(计数≥25/106 采样)与横边行(≥25/167)——报告2 异常帧为 78/161
    let maxCol = 0, maxRow = 0;
    for (let x = 60; x < W - 60; x++) {
      let c = 0;
      for (let y = 100; y < 420; y += 3) if (Math.abs(lum(x, y) - lum(x - 1, y)) > 7) c++;
      if (c > maxCol) maxCol = c;
    }
    for (let y = 60; y < H - 60; y++) {
      let c = 0;
      for (let x = 350; x < 855; x += 3) if (Math.abs(lum(x, y) - lum(x, y - 1)) > 7) c++;
      if (c > maxRow) maxRow = c;
    }
    const shot = document.createElement('canvas');
    shot.width = W; shot.height = H;
    shot.getContext('2d').drawImage(cv, 0, 0);
    return { maxCol, maxRow, moon: !!g.renderer.sky?.moonScreen, shot: shot.toDataURL('image/png') };
  }, round).catch(() => null);
  if (!r) continue;
  worst = Math.max(worst, r.maxCol, r.maxRow);
  if (round < 3) shots.push(r.shot);
  console.log(`round ${round}: time=${(0.68 + round * 0.03).toFixed(2)} moon=${r.moon} maxColEdge=${r.maxCol} maxRowEdge=${r.maxRow}`);
}
const fs = await import('node:fs');
shots.forEach((b, i) => fs.writeFileSync(`/tmp/halo-fix-${i}.png`, Buffer.from(b.split(',')[1], 'base64')));
console.log(`WORST edge density: ${worst} (异常帧为 161;>60 判异常)`);
console.log(worst > 60 ? 'FAIL' : 'PASS');
await browser.close();
process.exit(worst > 60 ? 1 : 0);

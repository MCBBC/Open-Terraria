// 水线交界诊断：采样 水↔方块 边界像素、chunk 贴图画布透明像素分布，
// 找出"方格子感"的来源
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// 找海洋水线：x=20 列附近，从上往下找第一个"实心 tile 之上是水"的位置
const shore = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 找一段水线：某行 y 满足 (x,y) 实心、(x,y-1) 水量>200，连续 ≥10 格
  for (let x = 10; x < 300; x++) {
    for (let y = Math.floor(g.world.groundLevel) + 10; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && st.liquid[st.idx(x, y - 1)] > 200) {
        let run = 0;
        while (run < 12 && st.isSolid(x + run, y) && st.liquid[st.idx(x + run, y - 1)] > 200) run++;
        if (run >= 12) return { x, y };
      }
    }
  }
  return null;
});
console.log('shore:', JSON.stringify(shore));
if (!shore) { await browser.close(); process.exit(1); }

// 相机对准水线（主角放上方，zoom 2 放大观察）
await page.evaluate((s) => {
  const g = window.__swGame;
  g.player.x = (s.x + 6) * 16;
  g.player.y = (s.y - 12) * 16;
  g.camera.zoom = 2.0; g.camera.zoomTarget = 2.0;
  g.renderer.fullbright = true;
}, shore);
await new Promise((r) => setTimeout(r, 1200));

const diag = await page.evaluate((s) => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = (tx, ty, ox, oy) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + ox, ty * 16 + oy);
    const d = g.renderer.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  // 1) 边界上下：水线处，方块格(y)顶部 1px / 水格(y-1)底部 1px
  const boundary = [];
  for (let dx = 0; dx < 8; dx++) {
    boundary.push({
      tileTop: px(s.x + dx, s.y, 8, 0),      // 方块格顶边中点
      tileTop2: px(s.x + dx, s.y, 8, 2),     // 方块格内 2px
      waterBot: px(s.x + dx, s.y - 1, 8, 15), // 水格底边
      waterMid: px(s.x + dx, s.y - 1, 8, 8),  // 水格中部
    });
  }
  // 2) 水格之间的竖缝：相邻水格 x 边界两侧 1px
  const vseam = [];
  for (let dy = 0; dy > -4; dy--) {
    vseam.push({
      left: px(s.x + 3, s.y - 1 + dy, 15, 8),
      right: px(s.x + 4, s.y - 1 + dy, 0, 8),
    });
  }
  // 3) chunk tile 画布：方块格(y)里透明像素有多少（alpha=0 占比）+ 四角透明情况
  const chunk = g.chunks;
  const cs = 16; // chunk size
  const ccx = Math.floor(s.x / cs), ccy = Math.floor(s.y / cs);
  const c = chunk.get(ccx, ccy).tile;
  const cctx = c.getContext('2d');
  const transp = (tx, ty) => {
    const lx = (tx - ccx * cs) * 16, ly = (ty - ccy * cs) * 16;
    const d = cctx.getImageData(lx, ly, 16, 16).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 0) n++;
    return n / 256;
  };
  const tileTransparency = [];
  for (let dx = -2; dx <= 9; dx++) tileTransparency.push({ dx, t: +(transp(s.x + dx, s.y)).toFixed(2) });
  // 4) 浸润验证：方块格(y)透明缺口像素（从 chunk tile 画布找出 alpha=0 的像素）现在应显示水色
  const ccx2 = Math.floor(s.x / cs), ccy2 = Math.floor(s.y / cs);
  const c2 = chunk.get(ccx2, ccy2).tile;
  const c2ctx = c2.getContext('2d');
  const notchPx = [];
  const lx0 = (s.x - ccx2 * cs) * 16, ly0 = (s.y - ccy2 * cs) * 16;
  const td = c2ctx.getImageData(lx0, ly0, 16, 16).data;
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
    if (td[(yy * 16 + xx) * 4 + 3] === 0) notchPx.push([xx, yy]);
  }
  const notchColors = notchPx.slice(0, 10).map(([xx, yy]) => px(s.x, s.y, xx, yy));
  return { boundary, vseam, tileTransparency, notchCount: notchPx.length, notchColors };
}, shore);
console.log('boundary[0..3]:', JSON.stringify(diag.boundary.slice(0, 4)));
console.log('vseam:', JSON.stringify(diag.vseam));
console.log('tile transparency (waterline row):', JSON.stringify(diag.tileTransparency));
console.log('notchCount:', diag.notchCount, 'notchColors:', JSON.stringify(diag.notchColors));
await browser.close();

// 水体三症状复现探针(2026-08-20 用户追加):
//   1 水格间 1px 缝(zoom=1.73 非整数放大暴露;锚 LiquidRenderer.cs:505-537 floor+ceil)
//   2 水与半砖浸润空缺几像素(锚 :512-515 半砖钳底墙 0.5 + TileDrawing solidLayer 带)
//   3 静水自然扰动缺失(FilterWaterDistortion obj19 噪声位移 → WaterWaves.sampleDisplace)
// 用法:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=240000 scripts/_water-symptoms-probe.mjs
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/watersym-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

const setup = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.42;   // 白天固定
  const dirt = window.__swTileByKey('dirt');
  const stone = window.__swTileByKey('stone');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 26;
  // 挖 28×12 空腔 + stone 全封闭盆(底/左右壁) + 石墙背景(wall=1)——保水 + 缝隙检测对比色
  for (let x = sx - 1; x < sx + 29; x++) {
    for (let y = sy - 1; y < sy + 13; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  }
  for (let x = sx - 1; x < sx + 29; x++) st.setTile(x, sy + 12, stone, 0);
  for (let y = sy; y < sy + 12; y++) { st.setTile(sx - 1, y, stone, 0); st.setTile(sx + 28, y, stone, 0); }
  for (let x = sx; x < sx + 28; x++) {
    for (let y = sy; y < sy + 12; y++) { st.setWall(x, y, 1); st.setLiquid(x, y, 255, 1); }
  }
  // 半砖组:盆内中部沉一条 dirt 半砖行;半砖格自身带部分液(:512-515 IsHalfBrick&&IsSolid
  // 且 num23>0.5 → 钳 0.5 场景),上方整格水
  for (let k = 0; k < 4; k++) {
    st.setTile(sx + 12 + k, sy + 4, dirt, 0);
    st.setHalfBrick(sx + 12 + k, sy + 4, true);
    st.setLiquid(sx + 12 + k, sy + 4, 200, 1);
    st.setLiquid(sx + 12 + k, sy + 3, 255, 1);     // 半砖正上方整格水
  }
  // 第二盆(右移 16):部分液位 113(用户 debug 报告值)的【表面行】场景——水线在
  // 盆内第 3 格,半砖行贴水线
  const bx0 = sx + 16;
  for (let x = bx0 - 1; x < bx0 + 13; x++) {
    for (let y = sy - 1; y < sy + 13; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  }
  for (let x = bx0 - 1; x < bx0 + 13; x++) st.setTile(x, sy + 12, stone, 0);
  for (let y = sy; y < sy + 12; y++) { st.setTile(bx0 - 1, y, stone, 0); st.setTile(bx0 + 12, y, stone, 0); }
  for (let x = bx0; x < bx0 + 12; x++) {
    for (let y = sy; y < sy + 12; y++) { st.setWall(x, y, 1); st.setLiquid(x, y, 255, 1); }
    // 排到液位 113:上方两格清液 → 顶格留 113(等稳定后再校;先设 113+255+255)
  }
  for (let x = bx0; x < bx0 + 12; x++) {
    st.setLiquid(x, sy, 0, 1); st.setLiquid(x, sy + 1, 0, 1);
    st.setLiquid(x, sy + 2, 113, 1);
  }
  // 半砖贴水线(bx0+4..+6 半砖格 = 表面格,自带液 113 → 钳 0.5 场景)
  for (let k = 0; k < 3; k++) {
    st.setTile(bx0 + 4 + k, sy + 2, dirt, 0);
    st.setHalfBrick(bx0 + 4 + k, sy + 2, true);
    st.setLiquid(bx0 + 4 + k, sy + 2, 113, 1);
  }
  g.player.x = (sx + 14) * 16; g.player.y = (sy + 2) * 16;
  window.__sx = sx; window.__sy = sy;
  return { ok: true, sx, sy, dirt, stone };
});
console.log('场景:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 9000));    // 液体稳定 + 相机就位

const zoomTo = async (z) => {
  await page.evaluate((zz) => {
    const g = window.__swGame;
    g.camera.zoom = zz; g.camera.zoomTarget = zz;
  }, z);
  await new Promise((r) => setTimeout(r, 800));
};

const measure = () => page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const sx = window.__sx, sy = window.__sy;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 症状1:深水内部 12×6 tile 区域扫描——逐设备列统计"非水像素行"(水平缝)与逐设备行统计"非水像素列"(垂直缝)
  // 水感 = B 分量显著大于 R(背景=棕土/灰石)
  const [ax, ay] = w2s((sx + 2) * 16, (sy + 6) * 16);
  const [bx, by] = w2s((sx + 14) * 16, (sy + 12) * 16);
  const ix0 = Math.round(ax), iy0 = Math.round(ay);
  const iw = Math.round(bx - ax), ih = Math.round(by - ay);
  const data = ctx.getImageData(ix0, iy0, iw, ih).data;
  const W = iw, H = ih;
  const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const isWater = (p) => p[2] > p[0] + 12 && p[2] > p[1] + 8;   // 暗水也认(B 主导);石墙=近灰
  // 水平缝:某行整行(排除两端 2px)非水比例 > 0.9
  let hSeams = 0; const hSeamAt = []; const hSeamCol = [];
  for (let y = 0; y < H; y++) {
    let nw = 0; const nonW = [];
    for (let x = 2; x < W - 2; x++) if (!isWater(px(x, y))) { nw++; if (nonW.length < 9) nonW.push(px(x, y)); }
    if (nw / (W - 4) > 0.9) {
      hSeams++;
      const med = nonW[Math.floor(nonW.length / 2)];
      hSeamAt.push(y); hSeamCol.push(med);
    }
  }
  let vSeams = 0; const vSeamAt = []; const vSeamCol = [];
  for (let x = 0; x < W; x++) {
    let nw = 0; const nonW = [];
    for (let y = 2; y < H - 2; y++) if (!isWater(px(x, y))) { nw++; if (nonW.length < 9) nonW.push(px(x, y)); }
    if (nw / (H - 4) > 0.9) {
      vSeams++;
      const med = nonW[Math.floor(nonW.length / 2)];
      vSeamAt.push(x); vSeamCol.push(med);
    }
  }
  // 症状2:半砖行(sy+4)——半砖上沿应贴水;统计半砖 tile 顶部 8px 带内非水像素占比
  const [hx0, hy0] = w2s((sx + 12) * 16, (sy + 4) * 16);
  const [hx1, hy1] = w2s((sx + 16) * 16, (sy + 4) * 16 + 8);
  const hd = ctx.getImageData(Math.round(hx0), Math.round(hy0), Math.round(hx1 - hx0), Math.round(hy1 - hy0)).data;
  let hnw = 0, hn = 0;
  for (let i = 0; i < hd.length; i += 4) { hn++; if (!(hd[i + 2] > hd[i] + 24 && hd[i + 2] > 60)) hnw++; }
  // 半砖上方一格(should be 水,sy+3)
  const [tx0, ty0] = w2s((sx + 12) * 16, (sy + 3) * 16);
  const [tx1, ty1] = w2s((sx + 16) * 16, (sy + 3) * 16 + 16);
  const td = ctx.getImageData(Math.round(tx0), Math.round(ty0), Math.round(tx1 - tx0), Math.round(ty1 - ty0)).data;
  let tnw = 0, tn = 0;
  for (let i = 0; i < td.length; i += 4) { tn++; if (!(td[i + 2] > td[i] + 24 && td[i + 2] > 60)) tnw++; }
  return {
    zoom: z, camX: cam.x, camY: cam.y, cvs: [cv.width, cv.height],
    seam: { W, H, hSeams, hSeamAt: hSeamAt.slice(0, 10), hSeamCol: hSeamCol.slice(0, 5), vSeams, vSeamAt: vSeamAt.slice(0, 10), vSeamCol: vSeamCol.slice(0, 5) },
    half: { nonWaterTop8: hnw / hn, nonWaterAbove: tnw / tn },
    surface: (() => {
      // 第二盆表面带:液位 113 格(sy+2)上下各一格——统计该带内"非水非土"像素
      // (缝隙=墙色透出行)。取 bx0+7..+11 远离半砖的纯水列
      const bxx = sx + 16;
      const [cx0, cy0] = w2s((bxx + 7) * 16, (sy + 1) * 16 + 4);
      const [cx1, cy1] = w2s((bxx + 11) * 16, (sy + 4) * 16);
      const dd = ctx.getImageData(Math.round(cx0), Math.round(cy0), Math.round(cx1 - cx0), Math.round(cy1 - cy0)).data;
      const isDirt = (r, g2, b2) => b2 < g2 + 6 && g2 < r + 6;   // 棕土近似(R≥G≥B)
      let gap = 0, n = 0;
      const rows = [];
      const WW = Math.round(cx1 - cx0);
      for (let yy = 0; yy < Math.round(cy1 - cy0); yy++) {
        let rowGap = 0;
        for (let xx = 0; xx < WW; xx++) {
          const i = (yy * WW + xx) * 4;
          n++;
          if (!isWater([dd[i], dd[i + 1], dd[i + 2]]) && !isDirt(dd[i], dd[i + 1], dd[i + 2])) { rowGap++; gap++; }
        }
        if (rowGap / WW > 0.8) rows.push(yy);
      }
      return { gapRatio: +(gap / Math.max(1, n)).toFixed(4), fullGapRows: rows.slice(0, 12) };
    })(),
  };
});

// 症状3:静水扰动——直接读 WaterWaves 采样(模块 import)
const sway = await page.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  const g = window.__swGame;
  const sx = window.__sx, sy = window.__sy;
  const out = [0, 0];
  const samples = [];
  for (let f = 0; f < 30; f++) {
    m.waterWaves.sampleDisplace((sx + 8) * 16, (sy + 4) * 16, out);
    samples.push([+out[0].toFixed(3), +out[1].toFixed(3)]);
    await new Promise((r) => setTimeout(r, 100));
  }
  const dxs = samples.map((s) => s[0]), dys = samples.map((s) => s[1]);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  return {
    debug: m.waterWaves.debug(), texReady: m.waveTexReady(),
    samples: samples.slice(0, 8), dxSpread: +spread(dxs).toFixed(3), dySpread: +spread(dys).toFixed(3),
  };
});
console.log('症状3 静水扰动:', JSON.stringify(sway));

for (const z of [1.73, 2.0]) {
  await zoomTo(z);
  console.log(`症状1/2 @zoom=${z}:`, JSON.stringify(await measure()));
}

// 截图存档
await zoomTo(1.73);
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/watersym-173.png' });
await browser.close();
console.log('DONE');

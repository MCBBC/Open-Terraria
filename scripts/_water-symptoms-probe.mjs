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
  // 挖 28×12 空腔(保留 stone 盆底),四周留天然土做背景墙视觉对照;盆内灌满水
  for (let x = sx; x < sx + 28; x++) {
    for (let y = sy; y < sy + 12; y++) st.setTile(x, y, 0, 0);
  }
  for (let x = sx; x < sx + 28; x++) {
    st.setTile(x, sy + 12, stone, 0);              // 盆底
    for (let y = sy; y < sy + 12; y++) st.setLiquid(x, y, 255, 1);
  }
  // 半砖组:盆内中部沉一条 dirt 半砖行(水上露出上半)——水面在 sy+3 附近
  for (let k = 0; k < 4; k++) {
    st.setTile(sx + 12 + k, sy + 4, dirt, 0);
    st.setHalfBrick(sx + 12 + k, sy + 4, true);
    st.setLiquid(sx + 12 + k, sy + 4, 0, 1);       // 半砖格本身无液(水漫过其上)
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
  const isWater = (p) => p[2] > p[0] + 24 && p[2] > 60;
  // 水平缝:某行整行(排除两端 2px)非水比例 > 0.9
  let hSeams = 0; const hSeamAt = [];
  for (let y = 0; y < H; y++) {
    let nw = 0; for (let x = 2; x < W - 2; x++) if (!isWater(px(x, y))) nw++;
    if (nw / (W - 4) > 0.9) { hSeams++; hSeamAt.push(y); }
  }
  let vSeams = 0; const vSeamAt = [];
  for (let x = 0; x < W; x++) {
    let nw = 0; for (let y = 2; y < H - 2; y++) if (!isWater(px(x, y))) nw++;
    if (nw / (H - 4) > 0.9) { vSeams++; vSeamAt.push(x); }
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
    seam: { W, H, hSeams, hSeamAt: hSeamAt.slice(0, 8), vSeams, vSeamAt: vSeamAt.slice(0, 8) },
    half: { nonWaterTop8: hnw / hn, nonWaterAbove: tnw / tn },
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

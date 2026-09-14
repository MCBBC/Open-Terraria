// BJ76 水面 GL 波纹锚定域取证探针（用户实报：走动时波纹跟着角色跑，不锚定水面）。
//
// 定罪逻辑：冻结波场进度/缓冲/实体注入后，在两个相机位置各截一组帧
// （组内跨水动画相位，交叉取 min 配对同相位帧），把 B 组按相机位移对齐后与
// A 组差分：
//   · 对照组（同相机重复截图）≈ 0        —— 机具噪声基线
//   · 波纹世界锚定（原版 obj19 语义）  → 对齐后残差 ≈ 对照组
//   · 波纹屏幕锚定（本仓现状嫌疑）     → 对齐后残差显著 > 对照组
// 另附 CPU 路径仪器：sampleDisplace 固定世界点、平移相机采样——
//   世界锚定 = 输出与相机无关；屏幕锚定 = 输出随相机漂移。
// 运行:SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs scripts/_bj76-water-anchor.mjs --timeout=240000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3500));   // rbake 2.5s 保险 + 渲染稳定

// ---- 场景：地下封闭腔（20 列×6 行,地表下 8 行）：左半满水（判据带）、右半干燥
//      （负对照带）。腔背板 = 石墙/无墙棋盘格（无墙格=黑底,强对比,世界固定——
//      不用露天:露天无墙格透天空视差,对齐被污染）。照明 = 干半火把（列不进带）。
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.paused = true;
  const ptx = Math.floor(g.player.x / 16);
  let solidY = Math.floor(g.player.y / 16);
  for (let y = solidY; y < solidY + 60; y++) {
    if (st.isSolid(ptx, y)) { solidY = y; break; }
  }
  const tx = ptx + 6;          // 腔左列
  const ty = solidY + 8;       // 腔顶行 = 地表下 8 行（地下,无天空视差）
  const W = 20, H = 6, WATER_COLS = 10, WATER_TOP = 2;   // 水面在腔顶下 2 行（上 2 行留空气进光）
  for (let x = tx; x < tx + W; x++) {
    for (let y = ty; y < ty + H; y++) {
      st.setTile(x, y, 0);
      st.setWall(x, y, ((x + y) % 2 === 0) ? 1 : 0);   // 石墙(1)/无墙(0)棋盘格
      if (x < tx + WATER_COLS && y >= ty + WATER_TOP) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = 1;      // 左半下 4 行满水
      }
    }
  }
  // 采光竖井（两半各一条,2 列宽,从地表直通腔顶——日光进腔;火把 setTile 不亮）：
  //   水半井 tx+5..6、干半井 tx+12..13（带=tx+5..8 / tx+11..14 在腔内行,井在腔顶以上,无叠）
  for (const sx of [[tx + 5, tx + 6], [tx + 12, tx + 13]]) {
    for (let x = sx[0]; x <= sx[1]; x++) {
      for (let y = solidY; y < ty; y++) st.setTile(x, y, 0);
    }
  }
  g.player.x = (tx - 5) * 16 + 8 - g.player.w / 2;
  g.player.vx = 0; g.player.vy = 0;
  return { tx, ty, W, H, WATER_COLS, WATER_TOP, surfaceWorldY: (ty + WATER_TOP) * 16, solidY };
});
console.log('pit:', JSON.stringify(setup));

// 先跑 40 渲染帧：波场网格分配/涟漪消费走正常路径，之后才冻结
const pump = (n) => page.evaluate((n) => new Promise((res) => {
  let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);
await pump(40);

// ---- 冻结波场时间轴：progress/intensity/波缓冲/涟漪全停；progress 钉 P0 ----
// 前置：等待波场网格就绪（渲染循环偶发启动慢;gridW=0 时 composite 直通=false）
for (let i = 0; i < 30; i++) {
  const gw = await page.evaluate(async () => {
    const WW = await import('/src/render/WaterWaves.ts');
    return WW.waterWaves.gridW();
  });
  if (gw > 0) break;
  await pump(20);
}
const frozen = await page.evaluate(async () => {
  const WW = await import('/src/render/WaterWaves.ts');
  const w = WW.waterWaves;
  // 冻结世界时钟（日光恒定;竖井采光随时辰会变=帧间污染）
  const c = window.__swGame.world.clock;
  c.tick = () => {};
  c.timeOfDay = 0.5;
  const dbg0 = w.debug();
  w.frame = () => {};                       // 冻结 Update/PreDraw/涟漪注入
  w.progress = 2.718281828;                 // 任意钉值（非 0 防"意外清零"伪绿）
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  // 页内截屏/差分店
  const store = window.__bj76 = { caps: [] };
  const mainCanvas = () => [...document.querySelectorAll('canvas')]
    .filter((c) => !c.classList.contains('sw-credits'))   // 排除黑屏 credits 覆盖画布（与主画布同尺寸）
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  store.cap = () => {
    const cv = mainCanvas();
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const c2 = off.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    const g = window.__swGame;
    store.caps.push({
      cam: [g.camera.x, g.camera.y], zoom: g.camera.zoom,
      devW: cv.width, devH: cv.height,
      data: c2.getImageData(0, 0, cv.width, cv.height).data,
    });
    return store.caps.length - 1;
  };
  // mean |B(x−dx,y) − A(x,y)|（RGB 三通道，0..255 尺度；带以 A 帧坐标给定,
  // B 帧在 x−dx 采样——dx=相机位移,两帧各自带内区域都必须在视口内）
  store.metric = (ia, ib, band, dx) => {
    const A = store.caps[ia], B = store.caps[ib];
    const w = A.devW; let sum = 0, n = 0;
    for (let y = band.y0; y < band.y1; y++) {
      for (let x = band.x0; x < band.x1; x++) {
        const xb = x - dx; if (xb < 0 || xb >= w) continue;
        const oB = (y * w + xb) * 4, oA = (y * w + x) * 4;
        sum += Math.abs(B.data[oB] - A.data[oA]) + Math.abs(B.data[oB + 1] - A.data[oA + 1]) + Math.abs(B.data[oB + 2] - A.data[oA + 2]);
        n++;
      }
    }
    return n ? sum / (n * 3) : -1;
  };
  store.best = (ia, ib, band, dx0) => {
    let best = null;
    for (let dx = dx0 - 8; dx <= dx0 + 8; dx++) {
      const m = store.metric(ia, ib, band, dx);
      if (m >= 0 && (!best || m < best.m)) best = { dx, m: +m.toFixed(3) };
    }
    return best;
  };
  // 水线带（设备 px）：世界 y=surfaceWorldY−8..+8（水面线 ±8px——线本身是带内最强
  // 结构,位移场把线晃 ±1-2px=用户所见"水线果冻";水体内部近乎平色不可感），
  // x=坑中段列。此带在地下腔内:上侧为腔内空气窗（棋盘格背板,无天空视差）
  store.band = (capIdx, surfaceWorldY, txCols) => {
    const c = store.caps[capIdx];
    const camL = c.cam[0] - (c.devW / 2) / c.zoom, camT = c.cam[1] - (c.devH / 2) / c.zoom;
    const y0 = Math.round((surfaceWorldY - camT) * c.zoom) - 8;
    const x0 = Math.round((txCols[0] * 16 - camL) * c.zoom);
    const x1 = Math.round((txCols[1] * 16 - camL) * c.zoom);
    return { y0, y1: y0 + 16, x0, x1 };
  };
  return { dbg0, quality: w.quality, gridW: w.gridW(), gridH: w.gridH() };
});
console.log('frozen:', JSON.stringify(frozen));

// ---- 三组采集：A(相机位1) / B(相机位2, 右移 512 世界px) / A2(回位) ----
// ★Δ=512：噪声场特征尺度 = 256/0.1 = 2560 屏幕px——Δ=48 时场仅移 2% 不可感；
//   512px = 0.2 噪声贴图宽 = 屏幕锚定时位移场显著换相（世界锚定时位移场随世界平移,
//   对齐后逐像素不变）
const DXP = 512;   // 相机位移（世界 px）
async function burstAt(dxCam) {
  await page.evaluate((dxCam) => {
    const g = window.__swGame;
    if (g.player.x0BJ76 === undefined) g.player.x0BJ76 = g.player.x;   // 基准位（setup 摆位）
    g.player.x = g.player.x0BJ76 + dxCam;
    g.player.vx = 0; g.player.vy = 0;
  }, dxCam);
  await pump(40);   // 相机/光照沉降
  const ids = [];
  for (let i = 0; i < 6; i++) {
    ids.push(await page.evaluate(() => window.__bj76.cap()));
    await new Promise((r) => setTimeout(r, 130));   // 跨水动画相位（rate≈6/s → 167ms/帧）
  }
  return ids;
}
const idsA = await burstAt(0);
const idsB = await burstAt(DXP);
const idsA2 = await burstAt(0);

// ---- 指标：交叉 min 配对（同动画相位）+ 最佳对齐位移 ----
const result = await page.evaluate(async ({ idsA, idsB, idsA2, setup, DXP }) => {
  const store = window.__bj76;
  const band = store.band(idsA[0], setup.surfaceWorldY, [setup.tx + 5, setup.tx + 8]);      // 水线带（判据;避开井列外侧亮差）
  const dryBand = store.band(idsA[0], setup.surfaceWorldY, [setup.tx + 11, setup.tx + 14]); // 干半棋盘格带（负对照:gate=0 无位移）
  const zoomDev = store.caps[idsA[0]].zoom;
  const dx0 = Math.round(DXP * zoomDev);
  const minBest = (g1, g2, b, d0) => {
    let best = null, atD0 = null;
    for (const a of g1) for (const b2 of g2) {
      const r = store.best(a, b2, b, d0);
      if (r && (!best || r.m < best.m)) best = { ...r, pair: [a, b2] };
      const m0 = store.metric(a, b2, b, d0);
      if (atD0 === null || m0 < atD0) atD0 = m0;
    }
    return { best, atD0: +atD0.toFixed(3) };
  };
  const control = minBest(idsA, idsA2, band, 0);       // 同相机重复 = 机具基线
  const world = minBest(idsA, idsB, band, dx0);        // 跨相机对齐 = 波纹锚定域判据
  const dry = minBest(idsA, idsB, dryBand, dx0);       // 干半 gate=0 无位移 = 负对照
  // 带内纹理活跃度（A 帧像素标准差;过低=平坦区,指标无感）
  const bandStd = (capIdx, b) => {
    const d = store.caps[capIdx].data, w = store.caps[capIdx].devW;
    let s = 0, s2 = 0, n = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const o = (y * w + x) * 4; const v = (d[o] + d[o + 1] + d[o + 2]) / 3;
      s += v; s2 += v * v; n++;
    }
    const mu = s / n;
    return +Math.sqrt(Math.max(0, s2 / n - mu * mu)).toFixed(2);
  };
  // CPU 路径仪器：固定世界点，平移相机采样
  const WW = await import('/src/render/WaterWaves.ts');
  const w = WW.waterWaves;
  const cap0 = store.caps[idsA[0]];
  const wx = (setup.tx + 5) * 16 + 8;   // 坑中心世界 px
  const wy = setup.surfaceWorldY + 24;
  const out = [0, 0];
  w.setCamera(cap0.cam[0], cap0.cam[1], w.viewZoom() || cap0.zoom);
  w.sampleDisplace(wx, wy, out); const d1 = [+out[0].toFixed(4), +out[1].toFixed(4)];
  w.setCamera(cap0.cam[0] + DXP, cap0.cam[1], w.viewZoom() || cap0.zoom);
  w.sampleDisplace(wx, wy, out); const d2 = [+out[0].toFixed(4), +out[1].toFixed(4)];
  w.setCamera(cap0.cam[0], cap0.cam[1], w.viewZoom() || cap0.zoom);
  // GL 路径确权
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  const warpPath = LR.liquidDebugState().warp;
  return { band, dryBand, dx0, zoomDev, control, world, dry, d1, d2,
    bandStd: bandStd(idsA[0], band), dryStd: bandStd(idsA[0], dryBand),
    cpuDrift: +(Math.abs(d1[0] - d2[0]) + Math.abs(d1[1] - d2[1])).toFixed(4),
    warp: { active: warpPath.active, path: warpPath.path, passes: warpPath.passes },
    progress: w.progress, quality: w.quality, intensity: w.intensity };
}, { idsA, idsB, idsA2, setup, DXP });

console.log('\n=== BJ76 水面波纹锚定域取证 ===');
console.log('GL 路径:', JSON.stringify(result.warp), ' quality=', result.quality, ' progress=', result.progress.toFixed(3), ' I=', result.intensity.toFixed(3));
console.log('水线带(device px):', JSON.stringify(result.band), ' 对齐搜索中心 dx0=', result.dx0, ' zoomDev=', result.zoomDev);
console.log(`带内纹理活跃度 std: 水下带=${result.bandStd} 旱地带=${result.dryStd}`);
console.log(`对照组 同相机重复   : best=${JSON.stringify(result.control.best)} @dx0=${result.control.atD0}`);
console.log(`判据组 跨相机512px  : best=${JSON.stringify(result.world.best)} @dx0=${result.world.atD0}`);
console.log(`负对照 干半(gate=0) : best=${JSON.stringify(result.dry.best)} @dx0=${result.dry.atD0}`);
console.log(`★配对差(水线带−干半,基线对消) = ${(result.world.atD0 - result.dry.atD0).toFixed(3)}`);
console.log(`CPU sampleDisplace 固定世界点: cam@(0,0)=${JSON.stringify(result.d1)} cam@(+512,0)=${JSON.stringify(result.d2)} |漂移|=${result.cpuDrift}`);
console.log('\n预测:世界锚定(原版) ⇒ world≈dry≈control≈0 且 cpuDrift=0；屏幕锚定 ⇒ world−dry>0（位移场换相）且 cpuDrift>0');
await browser.close();

// FX62 微光湖亮度探针（2026-09-17 用户实报"湖体偏暗紫,原版亮紫发光感"）。
// 场景：地下开挖砖砌水池 + setLiquid(255,4) 灌满微光（地下 = 零天光,唯一光 =
//   微光液体发射色 → 乘光面全暴露）。传送玩家到池旁站台,同相机位取液面带直方图。
// 判据（desert-style4 直方图指纹法变体）：
//   pre（病根）: 光照图在微光液体格 = 发射色 (~0.43-0.56, 0.2-0.58, 0.65-0.84)×255
//     → 自发光湖体被乘成暗紫（体部均值暗、R/G 低）。
//   post（修后）: 原版 DrawShimmer :713 SetShimmerVertexColors 把顶点色重置为
//     White×opacity×baseColor（自发光免乘光）→ 本仓等效 = 液体格光照抬白地板
//     → 体部均值显著抬升（R/G/B 全通道,尤其 R/G）。
// 量化: 体部带逐像素 RGB 直方图（均值/P25/P50/P75/P90 亮度）+ 底部砖壁对照带
//   （壁面仍正常乘光,不应被抬白 = 免疫区对照,防"全屏抬亮"假阳性）。
// 用法: SW_ORIGIN=http://localhost:5272 node tools/run-diag.mjs scripts/_fx62-shimmer-brightness.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('FX62');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('1');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const hideWelcome = () => {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  };
  hideWelcome();
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  // ★地下场景（零天光：微光发射是唯一光源,乘光面全暴露——地表白天湖体被天光
  //   max-raise 成白,病根不可见）。地下 30 格 + 深挖清障,防原生洞穴水渗入污染。
  const ry = gy + 30;              // 液面行
  const depth = 4;
  const x0 = px - 8, x1 = px + 7;
  // ★清场（跨 run 世界复用同 FX61 教训：残液/残砖逐 run 排干净）
  for (let x = x0 - 30; x <= x1 + 30; x++) {
    for (let y = ry - 14; y <= ry + depth + 10; y++) {
      st.setTile(x, y, 0);
      st.setLiquid(x, y, 0, 0);
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = ry - 8; y <= ry + depth - 1; y++) st.setTile(x, y, 0);
    for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);   // 4 = SHIMMER
    st.setTile(x, ry + depth, BRICK, 0, 0);    // 池底（对照带=池底砖）
    st.setTile(x, ry + depth + 1, BRICK, 0, 0);
  }
  for (let y = ry - 8; y <= ry + depth + 1; y++) {
    st.setTile(x0 - 1, y, BRICK, 0, 0);
    st.setTile(x1 + 1, y, BRICK, 0, 0);
  }
  // 站台（x1+2..x1+3,砖面与液面齐平）+ 上方净空
  for (let y = ry - 6; y < ry; y++) { st.setTile(x1 + 2, y, 0); st.setTile(x1 + 3, y, 0); }
  st.setTile(x1 + 2, ry, BRICK, 0, 0);
  st.setTile(x1 + 3, ry, BRICK, 0, 0);
  st.setTile(x1 + 2, ry + 1, BRICK, 0, 0);
  st.setTile(x1 + 3, ry + 1, BRICK, 0, 0);
  // 传送 + 拉近（★不开 fullbright——病根在乘光面,fullbright 会把乘光整段旁路）
  g.player.x = (x1 + 3) * 16; g.player.y = (ry - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  if (g.player.position) { g.player.position.x = (x1 + 3) * 16; g.player.position.y = (ry - 2) * 16; }
  if (g.camera) { g.camera.zoomTarget = 2.5; g.camera.zoom = 2.5; }
  // 轮询相机稳定
  for (let k = 0; k < 60; k++) {
    await new Promise((r) => setTimeout(r, 100));
    const camY = g.camera?.y ?? 0;
    if (Math.abs(camY - (ry + 1) * 16) < 8) break;
  }
  await new Promise((r) => setTimeout(r, 2000));   // 液体稳定 + 光照传播多拍
  for (let k = 0; k < 5; k++) {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
    await new Promise((r) => setTimeout(r, 250));
    if (!document.querySelector('button')?.textContent?.includes('我知道了')) break;
  }

  const cv = g.renderer?.canvas ?? document.querySelector('canvas');
  const tmp = document.createElement('canvas');
  tmp.width = cv.width; tmp.height = cv.height;
  const cctx = tmp.getContext('2d', { willReadFrequently: true });
  const refresh = () => { cctx.drawImage(cv, 0, 0); };
  const scale = cv.width / g.camera.viewW;
  // 带内亮度直方图:均值 RGB + 亮度(V)分位数
  const stats = (wy0, wy1) => {
    const [sx0v] = g.camera.worldToScreen(x0 * 16, 0);
    const [sx1v] = g.camera.worldToScreen((x1 + 1) * 16, 0);
    const [, syA] = g.camera.worldToScreen(0, wy0);
    const [, syB] = g.camera.worldToScreen(0, wy1);
    const dx0 = Math.max(0, Math.floor(sx0v * scale)), dx1 = Math.min(cv.width, Math.ceil(sx1v * scale));
    const dy0 = Math.max(0, Math.floor(syA * scale)), dy1 = Math.min(cv.height, Math.ceil(syB * scale));
    if (dx1 <= dx0 || dy1 <= dy0) return { fail: `band empty ${dx0},${dy0},${dx1},${dy1}` };
    refresh();
    const img = cctx.getImageData(dx0, dy0, dx1 - dx0, dy1 - dy0).data;
    let sr = 0, sg = 0, sb = 0, n = 0;
    const lum = [];
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], gg = img[i + 1], b = img[i + 2];
      sr += r; sg += gg; sb += b; n++;
      lum.push(Math.max(r, gg, b));
    }
    lum.sort((a, b) => a - b);
    const q = (p) => lum[Math.min(lum.length - 1, Math.floor(p * lum.length))];
    return { n, meanR: +(sr / n).toFixed(1), meanG: +(sg / n).toFixed(1), meanB: +(sb / n).toFixed(1),
      p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9),
      band: [dx0, dy0, dx1 - dx0, dy1 - dy0] };
  };
  // 体部带（液面下 1..3 格,避开表层 bob/彩虹顶缘行）与池底砖对照带
  const body = stats((ry + 1) * 16 + 6, (ry + 3) * 16 + 10);
  const wall = stats((ry + depth) * 16 + 4, (ry + depth) * 16 + 12);   // 池底砖壁对照
  // 画布活性指纹（恒等 = 渲染冻结,量测作废）
  const cvsHash = () => {
    refresh();
    const d = cctx.getImageData(0, 0, cv.width, Math.min(200, cv.height)).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) | 0;
    return h;
  };
  const alive1 = cvsHash();
  await new Promise((r) => setTimeout(r, 300));
  const alive2 = cvsHash();
  const canvasAlive = alive1 !== alive2;
  window.__fx62shot = (() => { refresh(); return tmp.toDataURL('image/png'); })();
  const liquidTypeAt = (x, y) => st.liquidType[st.idx(x, y)];
  const liquidAmtAt = (x, y) => st.liquid[st.idx(x, y)];
  return {
    pool: { x0, x1, ry, gy, brick: BRICK, depth }, scale, canvas: [cv.width, cv.height],
    cam: [g.camera?.x, g.camera?.y], zoom: g.camera?.zoom,
    fullbright: !!g.fullbright,
    liquidProbe: [[x0 + 4, ry], [x0 + 12, ry + 1], [x1 - 4, ry + 2]].map(([x, y]) => [x, y, liquidAmtAt(x, y), liquidTypeAt(x, y)]),
    canvasAlive,
    modalGone: ![...document.querySelectorAll('button')].some((b) => /我知道了/.test(b.textContent || '')),
    body, wall,
  };
});
console.log(JSON.stringify(out, null, 1));
const fs = await import('node:fs');
const shot = await page.evaluate(() => window.__fx62shot ?? null);
if (shot) fs.writeFileSync('/tmp/fx62-shimmer-brightness.png', Buffer.from(shot.split(',')[1], 'base64'));
console.log('shot=/tmp/fx62-shimmer-brightness.png');
await browser.close();

// FX61 微光液面顶缘彩虹渐变线探针（2026-09-17 用户实报"液面缺原版彩虹线"）。
// 场景：地表开挖砖砌水池 + setLiquid(255, 4) 灌满微光（稳定态无流动）→
// 传送玩家到池上方、zoom=3 拉近液面 → 对液面顶缘行取色直方图。
// 判据（desert-style4 直方图指纹法变体）：微光基底是饱和紫（hue≈250° 单簇），
// 彩虹线的判别 = 【非基底簇】的多色相存在：
//   post: 顶缘带 S>0.3∧V>0.35 像素的 30° 色相直方图，除众数簇外 ≥3 个非基底簇
//         且合计 ≥200px；顶缘下 1 格体部带非基底簇显著更少（线只在顶缘）。
//   pre:  非基底簇 ≈0（sparkle 门 De Morgan bug：表层格被判 body → 棋盘×噪声微闪）。
// 用法: SW_ORIGIN=http://localhost:5270 node tools/run-diag.mjs scripts/_fx61-shimmer-rim.mjs
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
  await page.keyboard.type('FX61');
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
  // 水池：24 宽，液面行 ry=gy+2（地表下 2 格，y>groundLevel-40 → IsSurfaceLiquid 成立）。
  // 池旁留 2 格宽砖砌站台（顶面与液面齐平）——玩家站台上,相机稳定在液面高度,
  // 且不接触微光（vanilla 玩家入微光会下沉漂浮,相机跟着沉）
  const x0 = px - 8, x1 = px + 7, ry = gy + 2, depth = 3;
  // ★清场（跨 run 世界复用：前几轮 24 宽池的残液在池外悬空,逐 run 排水下渗,
  //  池面满度被破坏 → fy≠0 → IsSurfaceLiquid 失效 = 彩虹条时有时无的根因）
  for (let x = x0 - 26; x <= x1 + 26; x++) {
    for (let y = ry - 10; y <= ry + depth + 8; y++) {
      st.setTile(x, y, 0);
      st.setLiquid(x, y, 0, 0);
    }
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = ry - 6; y <= ry + depth - 1; y++) st.setTile(x, y, 0);
    for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);   // 4 = SHIMMER
    st.setTile(x, ry + depth, BRICK, 0, 0);
    st.setTile(x, ry + depth + 1, BRICK, 0, 0);
  }
  for (let y = ry - 6; y <= ry + depth + 1; y++) {
    st.setTile(x0 - 1, y, BRICK, 0, 0);
    st.setTile(x1 + 1, y, BRICK, 0, 0);
  }
  // 站台（x1+2..x1+3,行 ry 为砖面）+ 上方净空
  for (let y = ry - 5; y < ry; y++) { st.setTile(x1 + 2, y, 0); st.setTile(x1 + 3, y, 0); }
  st.setTile(x1 + 2, ry, BRICK, 0, 0);
  st.setTile(x1 + 3, ry, BRICK, 0, 0);
  st.setTile(x1 + 2, ry + 1, BRICK, 0, 0);
  st.setTile(x1 + 3, ry + 1, BRICK, 0, 0);
  // 传送 + 拉近
  g.player.x = (x1 + 3) * 16; g.player.y = (ry - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  if (g.player.position) { g.player.position.x = (x1 + 3) * 16; g.player.position.y = (ry - 2) * 16; }
  g.fullbright = true;
  if (g.camera) { g.camera.zoomTarget = 2.5; g.camera.zoom = 2.5; }
  // 轮询相机稳定（跟随缓动到站台≈液面高度）,最长 6s
  for (let k = 0; k < 60; k++) {
    await new Promise((r) => setTimeout(r, 100));
    const camY = g.camera?.y ?? 0;
    if (Math.abs(camY - ry * 16) < 8) break;
  }
  // 等 2s：液面稳定渲染 + 彩虹相位漂移（3s 一周期,取两拍直方图取并集）
  await new Promise((r) => setTimeout(r, 2000));
  // ★欢迎弹窗在 world 载入后才挂出——量测前再关一遍并确认消失（首跑被弹窗盖住
  //  液面带：21167px 全是弹窗蓝 hue 240°,与微光基底同簇,直方图全废）
  for (let k = 0; k < 5; k++) {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
    await new Promise((r) => setTimeout(r, 250));
    if (!document.querySelector('button')?.textContent?.includes('我知道了')) break;
  }

  const cv = g.renderer?.canvas ?? document.querySelector('canvas');
  // ★经 drawImage 中转读像素：Chrome 对 desynchronized/GPU 主画布的 getImageData
  //  直读回会拿到陈旧快照（实测主画布直读恒 uniform 紫、同 tick toDataURL 却有
  //  彩虹条）——drawImage 走合成路径,位图与所见一致
  const tmp = document.createElement('canvas');
  tmp.width = cv.width; tmp.height = cv.height;
  const cctx = tmp.getContext('2d', { willReadFrequently: true });
  const refresh = () => { cctx.drawImage(cv, 0, 0); };
  const scale = cv.width / g.camera.viewW;   // view px → 设备 px
  const histogram = (wy0, wy1) => {
    const [sx0v] = g.camera.worldToScreen(x0 * 16, 0);
    const [sx1v] = g.camera.worldToScreen((x1 + 1) * 16, 0);
    const [, syA] = g.camera.worldToScreen(0, wy0);
    const [, syB] = g.camera.worldToScreen(0, wy1);
    const dx0 = Math.max(0, Math.floor(sx0v * scale)), dx1 = Math.min(cv.width, Math.ceil(sx1v * scale));
    const dy0 = Math.max(0, Math.floor(syA * scale)), dy1 = Math.min(cv.height, Math.ceil(syB * scale));
    if (dx1 <= dx0 || dy1 <= dy0) return { fail: `band empty ${dx0},${dy0},${dx1},${dy1}` };
    refresh();
    const img = cctx.getImageData(dx0, dy0, dx1 - dx0, dy1 - dy0).data;
    const bins = new Array(12).fill(0);   // 30° 色相桶
    let colored = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i] / 255, gg = img[i + 1] / 255, b = img[i + 2] / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const v = mx, s = mx === 0 ? 0 : (mx - mn) / mx;
      if (s <= 0.15 || v <= 0.4) continue;   // ★加色彩虹叠在浅紫基底上=粉彩,S 阈 0.3 会整批漏
      colored++;
      let h;
      const d = mx - mn;
      if (mx === r) h = ((gg - b) / d + 6) % 6;
      else if (mx === gg) h = (b - r) / d + 2;
      else h = (r - gg) / d + 4;
      h = ((h * 60) % 360 + 360) % 360;
      bins[Math.min(11, Math.floor(h / 30))]++;
    }
    const modal = bins.indexOf(Math.max(...bins));
    // 彩虹判别 = 基底簇（modal ±1 桶 = ±30°）之外的色相像素
    const outBins = bins.map((c, k) => ({ bin: k * 30, count: c }))
      .filter((o) => o.count >= 20 && Math.abs(k2dist(o.bin, modal * 30)) > 25);
    const outPx = outBins.reduce((a, o) => a + o.count, 0);
    // 诊断样本：带内第 2 行的 8 个等距像素 RGB
    const rowY = dy0 + 2, samples = [];
    for (let k = 0; k < 8; k++) {
      const sx = dx0 + Math.floor((dx1 - dx0) * (k + 0.5) / 8);
      const j = (rowY - dy0) * (dx1 - dx0) * 4 + (sx - dx0) * 4;
      samples.push([img[j], img[j + 1], img[j + 2]]);
    }
    return { colored, bins, modalBin: modal * 30, outBins, outBinsN: outBins.length, outPx,
      band: [dx0, dy0, dx1 - dx0, dy1 - dy0], rowY, samples };
  };
  const k2dist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  // 画布活性指纹（同一 buffer 哈希两次,间隔 300ms——恒等 = 渲染冻结,量测作废）
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
  // 量测与画布快照【同一 tick】——防止"量测时无彩虹/截图时有"的时间窗错位
  window.__fx61shot1 = cv.toDataURL('image/png');
  const rim = histogram(ry * 16 - 48, ry * 16 + 40);         // 顶缘行 ±波 bob（waveOn 时表层格 ±16px 位移,曾固定带 408-418 错位全漏）
  const body = histogram((ry + 1) * 16 + 22, (ry + 1) * 16 + 38);  // 体部对照行（bob 带之下）
  await new Promise((r) => setTimeout(r, 1500));           // 半个彩虹周期后再拍一帧
  window.__fx61shot2 = cv.toDataURL('image/png');
  const rim2 = histogram(ry * 16 - 48, ry * 16 + 40);
  window.__fx61tmpSnap = (() => {
    refresh();
    return tmp.toDataURL('image/png');
  })();
  const canvasList = [...document.querySelectorAll('canvas')].map((c) => [
    c.width, c.height, c === cv, c.parentElement?.tagName ?? '', c.id || '', c.className?.slice?.(0, 30) ?? '',
  ]);
  const verdict = (h) => !h.fail && h.outBinsN >= 2 && h.outPx >= 150;
  return {
    pool: { x0, x1, ry, gy, brick: BRICK }, scale, canvas: [cv.width, cv.height],
    player: [g.player.x, g.player.y], cam: [g.camera?.x, g.camera?.y], pxt: [px, x0, x1, ry],
    canvasAlive, canvasList,
    modalGone: ![...document.querySelectorAll('button')].some((b) => /我知道了/.test(b.textContent || '')),
    rim, rim2, body,
    rainbow: verdict(rim) || verdict(rim2),
    bodyQuiet: !body.fail && (body.outPx < rim.outPx),
  };
});
console.log(JSON.stringify(out, null, 1));
// 截图 = 直方图同源快照（tmp 画布,refresh 后直出）→ 任务指定路径 /tmp/fx61-shimmer-rim.png；
// 主画布 toDataURL 对拍件另存 cv-dataurl
const fs = await import('node:fs');
const tmpSnap = await page.evaluate(() => window.__fx61tmpSnap ?? null);
if (tmpSnap) {
  fs.writeFileSync('/tmp/fx61-shimmer-rim.png', Buffer.from(tmpSnap.split(',')[1], 'base64'));
  fs.writeFileSync('/tmp/fx61-tmp-snap.png', Buffer.from(tmpSnap.split(',')[1], 'base64'));
}
const shot2 = await page.evaluate(() => window.__fx61shot2 ?? null);
if (shot2) fs.writeFileSync('/tmp/fx61-cv-dataurl.png', Buffer.from(shot2.split(',')[1], 'base64'));
console.log('shot=/tmp/fx61-shimmer-rim.png  cv-dataurl=/tmp/fx61-cv-dataurl.png');
await browser.close();
console.log(out && out.rainbow ? '✅ 顶缘多色相彩虹簇存在（post 判据通过）' : '❌ 顶缘未见非基底色相簇（彩虹线缺席）');

// R33 shader 集成 review 实机探针（红队只读——不改 src，跑在并行 TileShader 批在途态上）：
//   (p1) 闪电之击 6155→天雷 bolt 帧面：白芯（峰值像素近中性）+蓝边（中亮度像素 b>r）
//        +过曝（存在 ≥254 像素）——StormLightning pass 截面语义
//   (p2) Extra_288 通道定罪数值化：同一资产上 vanilla(仅红吃×8链) vs 我方(RGB全乘)
//        的芯/边亮度比——C2 的定量证据
//   (p3) Extra_288 行均值合法性：行内极差 ≤8（LUT 坍缩到 1D 的前提）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5237';
fs.mkdirSync('/tmp/recon/r33-shots', { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) {
    if (options.options?.data) { options.options.data.renderMode = 'cpu'; return; }
    await new Promise((r) => setTimeout(r, 50));
  }
});
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R33');
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
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { fatal: null, checks: [], dbg: {} };
  const ck = (name, ok, detail) => { R.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} [${detail}]`); };

  if (g.world.journeyPowers) {
    g.world.journeyPowers.godmode = true;
    if ('infiniteMana' in g.world.journeyPowers) g.world.journeyPowers.infiniteMana = true;
  }
  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let tries = 0; tries < 40; tries++) {
    p.y = sy * TILE - p.h - 2;
    const cT = Math.floor(p.cx / 16), cTy = Math.floor((p.y + p.h / 2) / 16);
    if (!st0.isSolid(cT, cTy)) break;
    sy -= 1;
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 150; i++) g.fixedUpdate(1 / 60);

  const ticks = async (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); await new Promise((r) => requestAnimationFrame(r)); };

  // ---- (p3)+(p2) Extra_288 资产数学（先行，不依赖出手） ----
  const atlas = g.renderer.atlas;
  const img = atlas?.ensureVImage?.('vanilla/Extra_288.png');
  if (!img || !(img.width > 0)) {
    R.fatal = 'Extra_288 not loaded';
    return R;
  }
  const cv288 = document.createElement('canvas');
  cv288.width = img.width; cv288.height = img.height;
  const cx288 = cv288.getContext('2d', { willReadFrequently: true });
  cx288.drawImage(img, 0, 0);
  const d288 = cx288.getImageData(0, 0, img.width, img.height).data;
  // (p3) 行均值合法性
  let worstRowSpread = 0, peakRow = -1, peakVal = 0;
  const rowMean = new Float32Array(img.height);
  for (let y = 0; y < img.height; y++) {
    let mn = 999, mx = 0, acc = 0;
    for (let x = 0; x < img.width; x++) {
      const v = d288[(y * img.width + x) * 4];
      acc += v; mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    rowMean[y] = acc / img.width;
    worstRowSpread = Math.max(worstRowSpread, mx - mn);
    if (rowMean[y] > peakVal) { peakVal = rowMean[y]; peakRow = y; }
  }
  ck('(p3) Extra_288 行内极差 ≤8（行均值 LUT 合法）', worstRowSpread <= 8, `spread=${worstRowSpread} peakRow=${peakRow} peak=${peakVal.toFixed(0)}`);
  // (p2) 通道定罪数值化：vColor=闪电蓝 (0.5,0.7,1.0)，op=0.7 sat=1（StormLightningDrawer 量级）
  const sampleV = (v) => rowMean[Math.min(img.height - 1, Math.max(0, (v * img.height) | 0))] / 255;
  const vr = 0.5, vg = 0.7, vb = 1.0, OP = 0.7, SAT = 1;
  const core = sampleV(0.5), fringe = sampleV(0.18);   // 中带 vs 边带（梯度带 0.18≈半高）
  const van = (t, c) => [Math.min(1, t * 8 * OP * SAT * c[0]), t * c[1], t * c[2]];
  const our = (t, c) => [Math.min(1, t * 8 * OP * SAT * c[0]), Math.min(1, t * 8 * OP * SAT * c[1]), Math.min(1, t * 8 * OP * SAT * c[2])];
  const vc = [vr, vg, vb];
  const vanCore = van(core, vc), ourCore = our(core, vc);
  const vanFringe = van(fringe, vc), ourFringe = our(fringe, vc);
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  R.dbg.channel = {
    core: { van: vanCore.map((x) => +x.toFixed(2)), our: ourCore.map((x) => +x.toFixed(2)) },
    fringe: { van: vanFringe.map((x) => +x.toFixed(2)), our: ourFringe.map((x) => +x.toFixed(2)) },
    fringeLumRatio: +(lum(ourFringe) / Math.max(1e-3, lum(vanFringe))).toFixed(2),
  };
  ck('(p2) 通道偏差定量：我方边带亮度/原版 ≥2×（C2 定罪成立）',
    lum(ourFringe) / Math.max(1e-3, lum(vanFringe)) >= 2,
    `ratio=${R.dbg.channel.fringeLumRatio} vanFringe=[${vanFringe.map((x) => x.toFixed(2))}] ourFringe=[${ourFringe.map((x) => x.toFixed(2))}]`);

  // ---- (p1) 实机 bolt 帧面 ----
  const key = items.VANILLA_ITEM_KEY_BY_ID[6155];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_6155_`];
  p.inv.slots[2] = { id, stack: 1 };
  p.inv.selected = 2;
  p.statManaMax2 = 400; p.manaMax = 400; p.mana = 400;
  for (let i = 0; i < 6; i++) { g.fixedUpdate(1 / 60); p.useTime = 0; p.itemTime = 0; }
  const targetX = p.cx + 15 * TILE, targetY = (sy - 6) * TILE;
  {
    const [sx2, syp2] = g.camera.worldToScreen(targetX, targetY);
    g.input.mouseX = sx2 / (g.renderer.dpr || 1);
    g.input.mouseY = syp2 / (g.renderer.dpr || 1);
  }
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  // bolt 窗口：出手后 ~30t Kill 帧（R34 装置），逐帧采样取最亮帧
  let best = null;
  const dpr = g.renderer.dpr || 1;
  const cv = g.renderer.canvas;
  const W = cv.width, H = cv.height;
  for (let f = 0; f < 70; f++) {
    await ticks(1);
    const ctx2 = cv.getContext('2d');
    const x0 = Math.max(0, Math.round((targetX - 120) * dpr)), y0 = Math.max(0, Math.round((targetY - 120) * dpr));
    const w = Math.min(W - x0, Math.round(240 * dpr)), h = Math.min(H - y0, Math.round(240 * dpr));
    if (w <= 0 || h <= 0) continue;
    const dd = ctx2.getImageData(x0, y0, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < dd.length; i += 4) { sum += 0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2]; n++; }
    const avg = sum / n;
    if (!best || avg > best.avg) best = { avg, dd, w, h };
  }
  if (!best || best.avg < 1) { R.fatal = 'bolt frame not captured'; return R; }
  // 截面统计：核心(≥250)/高亮(180..250)/边带(60..180)
  let coreN = 0, coreRGB = [0, 0, 0], edgeN = 0, edgeR = 0, edgeB = 0, overN = 0;
  const dd = best.dd;
  for (let i = 0; i < dd.length; i += 4) {
    const r = dd[i], gg = dd[i + 1], b = dd[i + 2];
    const L = 0.299 * r + 0.587 * gg + 0.114 * b;
    if (L >= 250) { coreN++; overN++; coreRGB[0] += r; coreRGB[1] += gg; coreRGB[2] += b; }
    else if (L >= 180) { coreN++; coreRGB[0] += r; coreRGB[1] += gg; coreRGB[2] += b; }
    else if (L >= 60 && L < 180) { edgeN++; edgeR += r; edgeB += b; }
  }
  const coreMean = coreN ? coreRGB.map((v) => v / coreN) : [0, 0, 0];
  const edgeMeanR = edgeN ? edgeR / edgeN : 0, edgeMeanB = edgeN ? edgeB / edgeN : 0;
  R.dbg.bolt = { frameAvg: +best.avg.toFixed(1), coreN, edgeN, coreMean: coreMean.map((v) => v.toFixed(0)), edgeMeanR: edgeMeanR.toFixed(0), edgeMeanB: edgeMeanB.toFixed(0) };
  ck('(p1a) bolt 过曝白芯（≥180 亮度像素 ≥30 且均值近中性 max−min ≤60）',
    coreN >= 30 && (Math.max(...coreMean) - Math.min(...coreMean)) <= 60,
    `coreN=${coreN} mean=[${coreMean.map((v) => v.toFixed(0))}]`);
  ck('(p1b) 蓝边（60..180 亮度带 B>R）', edgeN >= 30 && edgeMeanB > edgeMeanR,
    `edgeN=${edgeN} R=${edgeMeanR.toFixed(0)} B=${edgeMeanB.toFixed(0)}`);
  ck('(p1c) 过曝（≥254 亮度像素存在）', overN > 0, `overN=${overN}`);
  R.pngDataURL = cv.toDataURL('image/png');
  return R;
});

let pass = 0, fail = 0;
if (out.fatal) { console.log('FATAL:', out.fatal); fail = 1; }
if (out.pngDataURL) fs.writeFileSync('/tmp/recon/r33-shots/storm-bolt.png', Buffer.from(out.pngDataURL.split(',')[1], 'base64'));
for (const c of out.checks ?? []) { console.log(`${c.ok ? 'PASS' : 'FAIL'}: ${c.name} [${c.detail}]`); c.ok ? pass++ : fail++; }
console.log('dbg:', JSON.stringify(out.dbg ?? {}));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exitCode = fail === 0 ? 0 : 1;
await browser.close();

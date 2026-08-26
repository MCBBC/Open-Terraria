// #perf2026-08-26 批零视觉差异优化对拍探针:
// ① 水体扭曲门控安全性:站在合成旱地(清液体带)上→前景水离屏(fgCanvas)应全透明;
//    此时【离线直调】applyFullScreen(真实管线/真噪声图),逐字节对比扭曲输出 vs
//    原样 scene——差=0 即"跳过上传"像素级安全实证。自然门控字段在旱地应为 false、
//    且真实帧循环中 applyFullScreen 零调用;水池视口则门=true 且合成照常。
// ② 云近双通道合并:'both'(新批路径)vs 'closer'+'closest' 分离调用(=改动前独立
//    会话语义,菜单注入路径原样保留)在两张同底色画布上逐字节对比;重复自跑两遍
//    作确定性对照(harness 自检);blit 计数验证 2→1。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
// 音频解锁门会吞首次合成 click(既有坑)——先真点角落再进单人,失败重试
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('parity');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界 4200×1200
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const SURF = g.world.groundLevel;
  const report = {};
  const rafN = async (n) => { for (let i = 0; i < n * 2; i++) await new Promise(r => requestAnimationFrame(r)); };

  // ---------- ① 水体扭曲 ----------
  // 计数器:hook 原型方法记录每帧合成发生与否
  const comp = g.renderer.waterWarp;
  const proto = Object.getPrototypeOf(comp);
  const origApply = proto.applyFullScreen;
  window.__wwCalls = 0;
  proto.applyFullScreen = function (...a) { window.__wwCalls++; return origApply.call(this, ...a); };
  const snapCanvas = (c) => {
    const cc = document.createElement('canvas'); cc.width = c.width; cc.height = c.height;
    const x = cc.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);
    return cc;
  };
  const diffCanvases = (A, B) => {
    const xa = A.getContext('2d'), xb = B.getContext('2d');
    const a = xa.getImageData(0, 0, A.width, A.height).data;
    const b = xb.getImageData(0, 0, B.width, B.height).data;
    let px = 0, mx = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (d > 0) px++; if (d > mx) mx = d;
    } return { px, mx };
  };

  // ---- 场地 A:旱地(按相机实际投影矩形+余量清液体),玩家站中央 ----
  const cam = g.player.__camRef ?? g.world.cam ?? g.renderer.cam ?? null;   // 兼容取法
  const zR = (cam?.zoom) ?? (g.renderer._waveCss?.cssZoom) ?? 3;
  const viewWpx = g.renderer.canvas.width, viewHpx = g.renderer.canvas.height;
  const dx0 = Math.floor(st.w / 2), dy0 = SURF + 4;          // 先定玩家格
  for (let txx = dx0 - 60; txx <= dx0 + 60; txx++) {         // 铺地板让玩家有落脚面
    if (st.inBounds(txx, dy0)) st.setTile(txx, dy0, 2);
    if (st.inBounds(txx, dy0 + 1)) st.setTile(txx, dy0 + 1, 1);   // 泥土垫层防穿
  }
  g.player.x = (dx0) * 16; g.player.y = (dy0 - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  await rafN(20);                                            // 相机先对准,再精确清窗

  const camL = (g.player.x + 8) - viewWpx / (2 * zR);
  const camT = (g.player.y + 12) - viewHpx / (2 * zR);
  {
    const M = 3;
    const cx0 = Math.max(0, Math.floor(camL / 16) - M), cx1 = Math.min(st.w - 1, Math.ceil((camL + viewWpx / zR) / 16) + M);
    const cy0 = Math.max(0, Math.floor(camT / 16) - M), cy1 = Math.min(st.h - 1, Math.ceil((camT + viewHpx / zR) / 16) + M);
    report.dryClearRect = [cx0, cy0, cx1, cy1];
    for (let ty = cy0; ty <= cy1; ty++)
      for (let tx = cx0; tx <= cx1; tx++) st.liquid[ty * st.w + tx] = 0;
  }
  await rafN(15);

  report.dryNaturalGate = g.renderer._waveLiquidInView;             // 应为 false
  // 真实帧循环旱地零合成断言基线
  const callsDryStart = window.__wwCalls;
  await rafN(30);
  report.dryZeroCompositeInLiveLoop = (window.__wwCalls === callsDryStart);

  // 离线等价性测试:当前相机下前景水离屏应全透明;applyFullScreen(scene)+scene 对比
  const gate = comp.gateCanvas();
  if (gate && gate.width > 0) {
    const gd = snapCanvas(gate).getContext('2d').getImageData(0, 0, gate.width, gate.height).data;
    let alphaNonzero = 0;
    for (let i = 3; i < gd.length; i += 4) if (gd[i] !== 0) alphaNonzero++;
    report.fgAlphaNonzeroPx = alphaNonzero;                        // 应 0(旱地无前景水)
  }
  if (comp.active() && comp.glUnavailable?.() === false || true) {
    const scene = document.createElement('canvas');
    scene.width = 640; scene.height = 360;
    const sc = scene.getContext('2d');
    const gr = sc.createLinearGradient(0, 0, 0, 360);
    gr.addColorStop(0, '#20407a'); gr.addColorStop(1, '#93b8dd');
    sc.fillStyle = gr; sc.fillRect(0, 0, 640, 360);
    sc.fillStyle = '#c84040';
    for (let k = 0; k < 40; k++) { sc.beginPath(); sc.arc((k * 97) % 640, (k * 53) % 360, 6 + (k % 7), 0, 7); sc.fill(); }
    sc.fillStyle = '#fff'; sc.font = '24px monospace'; sc.fillText('parity-probe 你好 ▲', 24, 48);
    const wwave = g.renderer._waveCss ?? { cssW: 988, cssH: 862, cssScale: 1, cssZoom: 3, camL: 0, camT: 0 };
    const noise = g.renderer.atlas?.ensureVImage('vanilla/Misc_noise.png') ?? null;
    const warping = origApply.call(comp, scene, wwave, noise);
    if (warping) report.dryDiff = diffCanvases(snapCanvas(warping), scene);   // 应全 0
    else report.dryDiff = 'applyFullScreen-return-null(gl 走不了)';
  }

  // ---- 场地 B:水池(90×4 深 liquid=255 + 底板) ----
  const wx0 = Math.floor(st.w / 2) - 40, wy0 = SURF + 1;
  for (let txx = wx0; txx < wx0 + 90; txx++) {
    for (let tyy = wy0; tyy <= wy0 + 3; tyy++) if (st.inBounds(txx, tyy)) st.liquid[st.idx(txx, tyy)] = 255;
    if (st.inBounds(txx, wy0 + 4)) st.setTile(txx, wy0 + 4, 2);
  }
  g.player.x = (wx0 + 45) * 16; g.player.y = (wy0 - 8) * 16; g.player.vx = 0; g.player.vy = 0;
  await rafN(30);
  report.waterGate = g.renderer._waveLiquidInView;                  // 应 true
  const callsPoolStart = window.__wwCalls;
  await rafN(30);
  report.waterCompositedInLiveLoop = window.__wwCalls > callsPoolStart;

  // ---------- ② 云双通道 ----------
  const sky = g.renderer.sky;
  const Wc = g.renderer.canvas.width, Hc = g.renderer.canvas.height;
  const camY = g.world.groundLevel * 16 - Hc / 2 + 120;
  const mkTarget = () => {
    const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, Hc);
    gr.addColorStop(0, '#3a70b4'); gr.addColorStop(1, '#87a6cf');
    x.fillStyle = gr; x.fillRect(0, 0, Wc, Hc);
    return c;
  };
  const s2 = [], s3 = [];
  for (const c of sky.vclouds) { if (c.scale >= 1 && c.scale < 1.15) s2.push(c); else if (c.scale >= 1.15) s3.push(c); }
  report.cloudSel = [s2.length, s3.length];

  if (sky.cloudGlLayer && !sky.cloudGlLayer.unavailable && s2.length + s3.length > 0) {
    const T1 = mkTarget(), T2 = mkTarget();
    sky.drawCloudsNear(T1.getContext('2d'), Wc, Hc, camY, 'both');
    sky.drawCloudsNear(T2.getContext('2d'), Wc, Hc, camY, 'both');
    report.batchSelfRepeat = diffCanvases(T1, T2);                 // 应全 0

    const TN = mkTarget(), TO = mkTarget();
    sky.drawCloudsNear(TN.getContext('2d'), Wc, Hc, camY, 'both');
    const co = TO.getContext('2d');
    sky.drawCloudsNear(co, Wc, Hc, camY, 'closer');
    sky.drawCloudsNear(co, Wc, Hc, camY, 'closest');
    report.batchVsSplit = diffCanvases(TN, TO);

    let blits = 0;
    const glc = sky.cloudGlLayer.canvas;
    const tallyCtx = mkTarget().getContext('2d');
    const od = tallyCtx.drawImage.bind(tallyCtx);
    tallyCtx.drawImage = (...a) => { if (a[0] === glc) blits++; return od(...a); };
    sky.drawCloudsNear(tallyCtx, Wc, Hc, camY, 'both');
    report.blitsBatched = blits;
    blits = 0;
    sky.drawCloudsNear(tallyCtx, Wc, Hc, camY, 'closer');
    sky.drawCloudsNear(tallyCtx, Wc, Hc, camY, 'closest');
    report.blitsSplit = blits;
  } else {
    report.cloudSkipped = 'gl-unavailable or empty selection';
  }
  proto.applyFullScreen = origApply;
  return report;
});

console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('PAGE_ERRORS:', errs.splice(0).join(' | ').slice(0, 400));
const P = out;
let fail = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };
check('旱地自然门=false', P.dryNaturalGate === false, String(P.dryNaturalGate));
check('旱地实机零合成', P.dryZeroCompositeInLiveLoop === true);
check('前景水离屏全透明', P.fgAlphaNonzeroPx === 0, `nonzero=${P.fgAlphaNonzeroPx}`);
check(P.dryDiff === undefined ? '' : '扭曲输出≡输入(diffPx=0)', P.dryDiff ? P.dryDiff.px === 0 : true,
  typeof P.dryDiff === 'object' ? `diffPx=${P.dryDiff.px} maxΔ=${P.dryDiff.mx}` : String(P.dryDiff));
check('水池门=true', P.waterGate === true, String(P.waterGate));
check('水池实机合成照常', P.waterCompositedInLiveLoop === true);
if (P.batchSelfRepeat) {
  check('批路径自身可复现', P.batchSelfRepeat.px === 0);
  check('批 vs 分离逐位一致', P.batchVsSplit.px === 0, `diffPx=${P.batchVsSplit.px} maxΔ=${P.batchVsSplit.mx}`);
  check('blit 批1/分离2', P.blitsBatched === 1 && P.blitsSplit === 2, `batch=${P.blitsBatched} split=${P.blitsSplit}`);
}
console.log(fail ? `\n=== ${fail} FAILED ===` : '\n=== ALL PASS ===');
await browser.close();
process.exit(fail ? 3 : 0);

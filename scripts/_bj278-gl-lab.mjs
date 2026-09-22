// BJ278 GL 实验：分离「GL 画布读回坏」vs「TRAIL_MM 绘制坏」。
// A: fillQuad 红方块 → readPixel（管线+读回健康检查）
// B: trailFrameBeginMM+trailStripMM 合成水平带 → readPixel + getError
// C: trailFrameBegin+trailStrip（obj58 tech 路径）同几何 → readPixel + getError
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('CONSOLE:', String(m.text()).slice(0, 300)); });

await page.goto(`${ORIGIN}/?traildbg`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
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
  await page.keyboard.type('BJ278GL');
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
  await page.keyboard.type('bj278probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const gx = g.renderer?.glfx;
  if (!gx || gx.unavailable) return { fatal: 'no-glfx or unavailable' };
  const gl = gx.gl;
  const H = gx.canvas.height;
  const rd = (x, y) => { const p = gx.readPixel(x, H - 1 - y); return p ? [...p] : null; };
  const err = () => { const e = gl.getError(); return e === 0 ? 'NO_ERR' : `ERR_${e}`; };
  const res = {};

  // ---- A: fillQuad 红方块（走 begin/quad 通道）----
  gx.begin();
  gx.fillQuad(600, 300, 80, 80, 1, 0, 0, 1);
  gx.end();
  res.A_fillQuad = { center: rd(640, 340), outside: rd(500, 300), err: err() };

  // ---- B: TRAIL_MM 合成水平带（屏幕中心,y=400,宽 200,hw=24,白色顶点）----
  const cam = { x: g.camera.x, y: g.camera.y, z: 1 };
  const vW = gx.canvas.width, vH = gx.canvas.height;
  gx.resize(vW, vH);
  gx.trailFrameBeginMM(vW, vH, cam.x, cam.y, cam.z, 4, 0);
  // 合成带：从屏幕左 (cx−100) 到右 (cx+100)，10 对顶点
  const m = 10;
  const verts = new Float32Array(m * 2 * 9);
  const idx = new Uint16Array((m - 1) * 6);
  const hw = 24;
  const cxw = cam.x, cyw = cam.y;   // 世界坐标 = 相机中心 = 屏幕中心
  for (let i = 0; i < m; i++) {
    const x = cxw - 100 + (200 * i) / (m - 1);
    const rot = 0;   // 带向 +x，A/B 侧 ±y
    const dxC = Math.cos(rot - Math.PI / 2) * hw, dyC = Math.sin(rot - Math.PI / 2) * hw;
    const b = i * 18;
    verts[b] = x + dxC; verts[b + 1] = cyw + dyC;
    verts[b + 2] = 1; verts[b + 3] = 1; verts[b + 4] = 1; verts[b + 5] = 1;
    verts[b + 6] = i / (m - 1); verts[b + 7] = hw * 2; verts[b + 8] = hw * 2;
    const b2 = b + 9;
    verts[b2] = x - dxC; verts[b2 + 1] = cyw - dyC;
    verts[b2 + 2] = 1; verts[b2 + 3] = 1; verts[b2 + 4] = 1; verts[b2 + 5] = 1;
    verts[b2 + 6] = 0; verts[b2 + 7] = 0; verts[b2 + 8] = hw * 2;
  }
  for (let k = 0; k < m - 1; k++) {
    const v = k * 2, j = k * 6;
    idx[j] = v; idx[j + 1] = v + 1; idx[j + 2] = v + 2;
    idx[j + 3] = v + 2; idx[j + 4] = v + 1; idx[j + 5] = v + 3;
  }
  // 三张噪声贴图（真实 Extra_195/197/196——经 texFromImage 上传）
  const mkImg = (path) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = `sprites/${path}`;
  });
  return mkImg('vanilla/Extra_195.png').then(async (i0) => {
    const i1 = await mkImg('vanilla/Extra_197.png');
    const i2 = await mkImg('vanilla/Extra_196.png');
    if (!i0 || !i1 || !i2) { res.B_mm = { fatal: 'imgs null', i0: !!i0, i1: !!i1, i2: !!i2 }; return res; }
    const t0 = gx.texFromImage('lab:195', i0, false, true, true);
    const t1 = gx.texFromImage('lab:197', i1, false, true, true);
    const t2 = gx.texFromImage('lab:196', i2, false, true, true);
    if (!t0 || !t1 || !t2) { res.B_mm = { fatal: 'texUpload null', t0: !!t0, t1: !!t1, t2: !!t2, err: err() }; return res; }
    gx.trailStripMM(t0, t1, t2, verts, idx);
    const row = [];
    for (const dx of [-80, -40, 0, 40, 80]) row.push(rd(Math.round(vW / 2 + dx), Math.round(vH / 2)));
    res.B_mm = { row, err: err(), prog: !!gx.trailMMProg, dirty: gx.trailDirty };
    // ---- C: obj58 tech 路径同几何 ----
    gx.trailFrameBegin(vW, vH, cam.x, cam.y, cam.z);
    const s0t = gx.texFromImage('lab:195b', i0, false, true, true);
    const s1t = gx.texFromImage('lab:197b', i1, false, true, true);
    gx.trailStrip(s0t, s1t, verts, idx, [4, 0, 0, 4]);
    const row2 = [];
    for (const dx of [-80, -40, 0, 40, 80]) row2.push(rd(Math.round(vW / 2 + dx), Math.round(vH / 2)));
    res.C_tech = { row: row2, err: err() };
    // ---- D: drawImage 读回对照（B 后内容仍在）----
    const sc = document.createElement('canvas');
    sc.width = vW; sc.height = vH;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(gx.canvas, 0, 0);
    const d = c2.getImageData(vW / 2 - 2, H - 1 - vH / 2 - 2, 4, 4).data;
    res.D_drawImage = { px: [d[0], d[1], d[2], d[3], d[16], d[17], d[18], d[19]] };
    return res;
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);

// 天顶剑拖尾"月牙形态"量测探针 v2（2026-09-02 细螺旋→宽月牙修复验证）。
// 单发 4956 → counter≈82 冻结帧 → 主画布读回 → 沿轨道环 16 条射线扫横截面：
// 带厚(dev>25 连续段)/峰值增量/波纹起伏/带外暗变。原版参照（Zenith_(demo).gif f170，
// 1x 缩放实测）：亮带 45-53px、峰值 +145、4 次波纹、带外零暗变。
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/?traildbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
{ // SW cache-first 清扫
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
for (const sel of ['button', '[data-act]']) {
  try {
    const done = await page.evaluate((s) => {
      const b = [...document.querySelectorAll(s)].find((x) => /我已知晓/.test(x.textContent ?? ''));
      if (b) { b.click(); return true; }
      return false;
    }, sel);
    if (done) break;
  } catch { /* next */ }
}
await new Promise((r) => setTimeout(r, 500));

const shot = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = 381 * 16 + 8 - 560;   // 上提出室内（绿植/灯笼污染掩码）
  g.player.vx = 0; g.player.vy = 0;
  await wait(1400);   // 相机缓动跟上
  g.paused = false;
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height;
  const r = g.renderer;
  const z = r.glZoom ?? 1;
  const pscr = { x: (g.player.cx - r.glCamX) * z + W / 2, y: (g.player.cy - r.glCamY) * z + H / 2 };
  const inp = g.input;
  inp.mouseX = Math.round(pscr.x + 330); inp.mouseY = Math.round(pscr.y - 60);
  if (!r.__swRw) { const o = r.render.bind(r); window.__rc = { n: 0 }; r.render = (...a) => { window.__rc.n++; return o(...a); }; r.__swRw = true; }
  g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, crit: 4, pen: 2 });
  let sw = (g.entities?.projectiles ?? []).find((e) => e.ai1 === 4956 && e.counter !== undefined);
  if (!sw) return { fail: 'no-sword' };
  while (sw.counter < 82 && !sw.dead) await wait(8);
  const counter = +sw.counter.toFixed(1);
  await wait(60);
  // 读回锚点邻域（世界→画布：×z）
  const axw = g.player.cx + sw.vx, ayw = g.player.cy + sw.vy;
  const acx = (axw - r.glCamX) * z + W / 2, acy = (ayw - r.glCamY) * z + H / 2;
  const rx = Math.max(0, Math.round(acx - 420)), ry = Math.max(0, Math.round(acy - 400));
  const rw = Math.min(840, W - rx), rh = Math.min(800, H - ry);
  const sc = document.createElement('canvas');
  sc.width = rw; sc.height = rh;
  const scc = sc.getContext('2d', { willReadFrequently: true });
  scc.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh);
  const d = scc.getImageData(0, 0, rw, rh).data;
  const lum = new Float32Array(rw * rh);
  for (let i = 0, p = 0; i < rw * rh; i++, p += 4) lum[i] = Math.max(d[p], d[p + 1], d[p + 2]);
  const ax = acx - rx, ay = acy - ry;
  // 轨道环半径（counter≥60 → phase=1）：num8=|vel|+40
  const spd = Math.hypot(sw.vx, sw.vy);
  const num8 = spd + 40;
  // 16 条射线横截面：r 从 num8−80 到 num8+80 步 1；基线=同射线 r±(num8+150..190) 中值
  const rays = [];
  for (let k = 0; k < 16; k++) {
    const aa = (k / 16) * Math.PI * 2 + 0.19;
    const ca = Math.cos(aa), sa = Math.sin(aa);
    const smp = (rr) => {
      const x = Math.round(ax + ca * rr), y = Math.round(ay + sa * rr);
      if (x < 1 || y < 1 || x >= rw - 1 || y >= rh - 1) return null;
      return lum[y * rw + x];
    };
    const baseS = [];
    for (let rr = num8 + 150; rr <= num8 + 190; rr += 4) { const v = smp(rr); if (v != null) baseS.push(v); }
    for (let rr = num8 - 190; rr <= num8 - 150; rr += 4) { const v = smp(rr); if (v != null) baseS.push(v); }
    if (baseS.length < 8) { rays.push({ a: +aa.toFixed(2), miss: true }); continue; }
    baseS.sort((p, q) => p - q);
    const base = baseS[Math.floor(baseS.length / 2)];
    const prof = [];
    for (let rr = num8 - 80; rr <= num8 + 80; rr++) {
      const v = smp(rr);
      prof.push(v == null ? null : v - base);
    }
    // 带内 = dev>25 的最宽连续段
    let b0 = -1, b1 = -1, c0 = -1;
    for (let i = 0; i < prof.length; i++) {
      if (prof[i] != null && prof[i] > 25) { if (c0 < 0) c0 = i; }
      else { if (c0 >= 0 && (i - c0) > (b1 - b0)) { b0 = c0; b1 = i - 1; } c0 = -1; }
    }
    if (c0 >= 0 && (prof.length - c0) > (b1 - b0)) { b0 = c0; b1 = prof.length - 1; }
    if (b0 < 0) { rays.push({ a: +aa.toFixed(2), empty: true }); continue; }
    const seg = prof.slice(b0, b1 + 1).filter((v) => v != null);
    const peak = Math.max(...seg);
    rays.push({ a: +(aa * 180 / Math.PI).toFixed(0), thick: b1 - b0 + 1, peak: +peak.toFixed(0),
      rIn: +(num8 - 80 + b0).toFixed(0), rOut: +(num8 - 80 + b1).toFixed(0) });
  }
  // 带外暗变检查：带外缘 +8..+30 vs 远端基线（每射线）
  const darkPairs = [];
  for (const ray of rays) {
    if (ray.miss || ray.empty || ray.rOut == null) continue;
    const aa = (ray.a * Math.PI) / 180;
    const smp = (rr) => {
      const x = Math.round(ax + Math.cos(aa) * rr), y = Math.round(ay + Math.sin(aa) * rr);
      if (x < 1 || y < 1 || x >= rw - 1 || y >= rh - 1) return null;
      return lum[y * rw + x];
    };
    const near = [], far = [];
    for (let rr = ray.rOut + 8; rr <= ray.rOut + 30; rr += 2) { const v = smp(rr); if (v != null) near.push(v); }
    for (let rr = ray.rOut + 44; rr <= ray.rOut + 76; rr += 2) { const v = smp(rr); if (v != null) far.push(v); }
    if (near.length > 3 && far.length > 3) {
      const mean = (arr) => arr.reduce((s, q) => s + q, 0) / arr.length;
      darkPairs.push(+(mean(near) - mean(far)).toFixed(1));
    }
  }
  // glfx 层内容量（条带本体亮像素）
  const gl2 = g.renderer.acquireGL();
  let glLit = null;
  if (gl2) {
    const t = document.createElement('canvas');
    t.width = gl2.canvas.width; t.height = gl2.canvas.height;
    const tc = t.getContext('2d', { willReadFrequently: true });
    tc.drawImage(gl2.canvas, 0, 0);
    const dd = tc.getImageData(0, 0, t.width, t.height).data;
    glLit = 0;
    for (let i = 0; i < dd.length; i += 4) if (Math.max(dd[i], dd[i + 1], dd[i + 2]) > 60) glLit++;
  }
  return {
    ok: true, counter, zoom: z, renders: window.__rc.n, num8: +num8.toFixed(0), spd: +spd.toFixed(0),
    rays, darkPairs, glLit,
    anchor: { x: +ax.toFixed(0), y: +ay.toFixed(0) },
    sword: { x: +(sw.cx - r.glCamX * 0 + (sw.cx - r.glCamX) * z + W / 2 - rx).toFixed(0), y: +((sw.cy - r.glCamY) * z + H / 2 - ry).toFixed(0) },
    region: [rx, ry, rw, rh], png: sc.toDataURL('image/png'),
  };
});
if (!shot.ok) { console.log(JSON.stringify(shot)); await browser.close(); process.exit(1); }
writeFileSync('/tmp/zc-frame.png', Buffer.from(shot.png.split(',')[1], 'base64'));
try { await page.screenshot({ path: '/tmp/zc-viewport.png' }); } catch {}
const ok = shot.rays.filter((r2) => r2.thick);
const th = ok.map((r2) => r2.thick).sort((a, b) => a - b);
const pk = ok.map((r2) => r2.peak).sort((a, b) => a - b);
console.log(JSON.stringify({
  counter: shot.counter, zoom: shot.zoom, renders: shot.renders, num8: shot.num8, spd: shot.spd,
  glLit: shot.glLit,
  bandThickness: { n: th.length, of16: shot.rays.length, min: th[0], med: th[Math.floor(th.length / 2)], max: th[th.length - 1] },
  bandPeak: { min: pk[0], med: pk[Math.floor(pk.length / 2)], max: pk[pk.length - 1] },
  rays: shot.rays,
  darkPairs: { n: shot.darkPairs.length, mean: shot.darkPairs.length ? +(shot.darkPairs.reduce((s, q) => s + q, 0) / shot.darkPairs.length).toFixed(1) : null, min: Math.min(...shot.darkPairs), max: Math.max(...shot.darkPairs) },
}, null, 1));
await browser.close();

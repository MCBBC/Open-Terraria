// 山层闪烁修复·活机验证:相机穿越原门线(ws*16+16)确定性扫描+边界驻留抖动检查
// 指纹=三画布合成(sky→gl→hud)山带原像素统计;判据:深度扫描=连续坡(原版视差)非阶跃
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);   // 夜(山层无光照依赖,任意时段可判)
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });

// 关闭重力/物理干扰:god+定悬停,玩家位置由探针直控
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
  g.player.x = g.world.spawnX * 16 + 400;
  window.__ws16 = Math.floor(g.world.groundLevel) * 16;
  // 垂直驱动器:每帧把玩家钉到目标位(相机跟随),目标由 __driveY 控制
  window.__driveY = null;
  const g2 = window.__swGame;
  setInterval(() => {
    if (window.__driveY == null) return;
    g2.player.y = window.__driveY;
    g2.player.vy = 0;
    g2.player.fallStart = 0; void g2.player.fallStart;
  }, 8);
});

// 采样器:合成山带指纹(三画布 1:1 叠合后逐像素统计)
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__s = [];
  const W = r.canvas.width, H = r.canvas.height;
  const sc = document.createElement('canvas');
  sc.width = W; sc.height = 12;
  const scx = sc.getContext('2d', { willReadFrequently: true });
  window.__band = (y0f) => {
    const gl = document.getElementById('sw-c10e-glcanvas');
    const y0 = Math.round(H * y0f);
    scx.clearRect(0, 0, W, 12);
    for (const c of [r.skyCanvas, gl, r.canvas]) {
      if (c) { try { scx.drawImage(c, 0, y0, W, 12, 0, 0, W, 12); } catch { /* - */ } }
    }
    const d = scx.getImageData(0, 0, W, 12).data;
    let sum = 0, lit48 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v; n++;
      if (v > 48) lit48++;
    }
    return [Math.round(sum / n * 10) / 10, lit48];
  };
  window.__rec = () => {
    const cam = g.camera;
    window.__s.push({
      camTop: Math.round((cam.y - H / 2) * 10) / 10,
      b1: window.__band(0.10), b2: window.__band(0.28), b3: window.__band(0.45),
    });
    if (window.__s.length > 3000) window.__s.shift();
  };
  setInterval(window.__rec, 100);
});

const drive = async (y) => { await page.evaluate((v) => { window.__driveY = v; }, y); };

// ==== 1) 深度扫描:camTop 从 ws-600 到 ws+900,~40s 慢扫 ====
const ws16 = await page.evaluate(() => window.__ws16);
console.log('groundLevel*16 =', ws16);
const yStart = ws16 - 600 + 400, yEnd = ws16 + 900 + 400;
const STEPS = 60;
for (let i = 0; i <= STEPS; i++) {
  const y = yStart + (yEnd - yStart) * i / STEPS;
  await drive(y);
  await new Promise((r) => setTimeout(r, 600));
}
const sweep = await page.evaluate(() => window.__s.slice());
await page.evaluate(() => { window.__s.length = 0; });

// 扫描曲线摘要:按 camTop 每 100px 桶平均 b2/b3 亮度(观察连续性/阶跃位置)
const buckets = new Map();
for (const s of sweep) {
  const k = Math.round((s.camTop - ws16) / 100);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(s);
}
console.log('=== 深度扫描曲线(camTop−ws16 px 桶 → b2均亮/lit48, b3均亮/lit48) ===');
for (const [k, arr] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
  const m = (f) => Math.round(arr.reduce((a, s) => a + s[f][0], 0) / arr.length * 10) / 10;
  const l = (f) => Math.round(arr.reduce((a, s) => a + s[f][1], 0) / arr.length);
  console.log(`camTop-ws16=${String(k * 100).padStart(5)}px n=${String(arr.length).padStart(3)}  b2=${m('b2')}/${l('b2')}  b3=${m('b3')}/${l('b3')}`);
}

// ==== 2) 边界驻留+小抖动(模拟塔战上下移动):camTop=ws+16±40px,30s ====
await drive(ws16 + 16 + 400);
await new Promise((r) => setTimeout(r, 2500));
const t0 = Date.now();
let osc = 0;
while (Date.now() - t0 < 30000) {
  osc += 0.1;
  await drive(ws16 + 16 + 400 + Math.sin(osc * 0.7) * 40);
  await new Promise((r) => setTimeout(r, 100));
}
const hold = await page.evaluate(() => window.__s.slice());
// 翻转计数:b2 lit48 与阈值 60 的穿越次数 + 最大亮度差
let flips = 0, prev = null, hi = 0, lo = 1e9;
for (const s of hold) {
  const v = s.b2[1] + s.b3[1];
  hi = Math.max(hi, v); lo = Math.min(lo, v);
  const state = v > 60;
  if (prev !== null && state !== prev) flips++;
  prev = state;
}
console.log(`=== 边界驻留 30s: 亮暗穿越=${flips} lit48范围=[${lo},${hi}] n=${hold.length}`);
await page.screenshot({ path: 'shots/c10e-trail/nv-boundary.png' }).catch(() => {});

// ==== 3) 目检三态截图 ====
for (const [name, camTop] of [['surface', ws16 - 400 + 400 - 400], ['boundary', ws16 + 16], ['deep', ws16 + 600]]) {
  await drive(camTop + 400);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `shots/c10e-trail/nv-${name}.png` }).catch(() => {});
}
process.exit(0);

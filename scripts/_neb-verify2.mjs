// 山层闪烁修复·终验:页内改 groundLevel 把门线抬到 spawn 高空(露天),
// 相机在原门线上下驻留/振荡 —— 修复后山层应【恒可见且随视差连续滚动,零硬切换】
// (修复前:camTop 越线瞬间整组地表层硬切消失=闪烁)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.3);   // 白天(山层高对比,夜间过暗不利判读)
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
  g.player.x = g.world.spawnX * 16 + 400;
  // 门线抬到 tile 201(=201*16+16=3232px;spawn 局部地表 tile 269=4304px,露天带=3232..4304)
  g.world.groundLevel = 200;
  window.__line = 200 * 16 + 16;
  window.__driveY = null;
  setInterval(() => {
    if (window.__driveY == null) return;
    g.player.y = window.__driveY;
    g.player.vy = 0;
  }, 8);
});

// 合成山带指纹(天/山带,原像素)
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__s = [];
  const W = r.canvas.width, H = r.canvas.height;
  const sc = document.createElement('canvas');
  sc.width = W; sc.height = 40;
  const scx = sc.getContext('2d', { willReadFrequently: true });
  window.__band = (y0f) => {
    const gl = document.getElementById('sw-c10e-glcanvas');
    const y0 = Math.round(H * y0f);
    scx.clearRect(0, 0, W, 40);
    for (const c of [r.skyCanvas, gl, r.canvas]) if (c) { try { scx.drawImage(c, 0, y0, W, 40, 0, 0, W, 40); } catch { /* - */ } }
    const d = scx.getImageData(0, 0, W, 40).data;
    let sum = 0, lit = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v; n++;
      if (v > 60) lit++;
    }
    return [Math.round(sum / n * 10) / 10, lit];
  };
  window.__rec = () => {
    const cam = g.camera;
    window.__s.push({ camTop: Math.round(cam.y - H / 2), m: window.__band(0.30), l: window.__band(0.55) });
    if (window.__s.length > 3000) window.__s.shift();
  };
  setInterval(window.__rec, 100);
});
const drive = async (y) => { await page.evaluate((v) => { window.__driveY = v; }, y); };
const line = await page.evaluate(() => window.__line);
console.log('gate line px =', line, '(修复前:camTop>=line → 山层硬切消失)');

// 相机中心(y=camTop+H/2):山带 0.30H..0.55H 在门线上下各取景
const cyAtCamTop = (ct) => ct + 400;

// A) 线下 250px(修复前=无山)与线上 250px(修复前=有山)各驻留 3s 对比
for (const [tag, camTop] of [['below-line', line + 250], ['above-line', line - 250]]) {
  await drive(cyAtCamTop(camTop));
  await new Promise((r) => setTimeout(r, 3000));
  const s = await page.evaluate(() => window.__s.slice(-20));
  const avg = (f) => Math.round(s.reduce((a, x) => a + x[f][0], 0) / s.length * 10) / 10;
  const lit = (f) => Math.round(s.reduce((a, x) => a + x[f][1], 0) / s.length);
  console.log(`${tag} (camTop=line${tag.includes('below') ? '+' : '-'}250): 山带均亮=${avg('m')} lit=${lit('m')} | 低带均亮=${avg('l')} lit=${lit('l')}`);
  await page.screenshot({ path: `shots/c10e-trail/nv2-${tag}.png` }).catch(() => {});
}
await page.evaluate(() => { window.__s.length = 0; });

// B) 门线上 40px 幅度振荡 30s:修复后山带亮度应连续波动(视差),无亮/暗硬切换
let osc = 0;
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  osc += 0.09;
  await drive(cyAtCamTop(line + Math.sin(osc) * 120));   // ±120px 扫过门线
  await new Promise((r) => setTimeout(r, 90));
}
const hold = await page.evaluate(() => window.__s.slice());
let flips = 0, prev = null, lo = 1e9, hi = 0;
const series = [];
for (const s of hold) {
  const v = s.m[0];
  series.push(v);
  lo = Math.min(lo, v); hi = Math.max(hi, v);
  const state = v > 12;   // 亮暗二值阈值
  if (prev !== null && state !== prev) flips++;
  prev = state;
}
// 连续性:相邻样本最大跳变(硬切换=整层消失 → 跳变应 > 视差连续滚动的幅度)
let maxJump = 0;
for (let i = 1; i < series.length; i++) maxJump = Math.max(maxJump, Math.abs(series[i] - series[i - 1]));
console.log(`振荡 30s: 亮暗硬切换=${flips} 山带均亮范围=[${lo},${hi}] 最大相邻跳变=${Math.round(maxJump * 10) / 10} n=${hold.length}`);
await page.screenshot({ path: 'shots/c10e-trail/nv2-osc.png' }).catch(() => {});
process.exit(0);

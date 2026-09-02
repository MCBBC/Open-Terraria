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
  g.player.y = 381 * 16 + 8 - 560;
  g.player.vx = 0; g.player.vy = 0;
  await wait(1400);
  g.paused = false;
  const r = g.renderer;
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height;
  const z = r.glZoom ?? 1;
  const pscr = { x: (g.player.cx - r.glCamX) * z + W / 2, y: (g.player.cy - r.glCamY) * z + H / 2 };
  const inp = g.input;
  // 多方向连发：花环状叠加（原版 demo 形态）
  const dirs = [[340, -40], [300, 120], [-320, -60], [-280, 140], [60, -300], [-40, 280], [330, 60], [-330, 20]];
  let i = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 5200) {
    const [dx, dy] = dirs[i % dirs.length];
    inp.mouseX = Math.round(pscr.x + dx); inp.mouseY = Math.round(pscr.y + dy);
    g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, crit: 4, pen: 2 });
    i++;
    await wait(620);
  }
  await wait(500);
  return { ok: true, fired: i, alive: (g.entities?.projectiles ?? []).filter((e) => !e.dead).length };
});
if (!shot.ok) { console.log(JSON.stringify(shot)); await browser.close(); process.exit(1); }
try { await page.screenshot({ path: '/tmp/zc-wreath.png' }); } catch {}
console.log(JSON.stringify({ fired: shot.fired, alive: shot.alive }));
await browser.close();

// ★星云 618 像素取证二番——相机钉球、尘屏幕位逐点亮度判读（可见性定谳）
// 运行：SW_ORIGIN=http://localhost:5243 node tools/run-diag.mjs scripts/_nebula618-pix.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { PNG } from 'pngjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/nebula618';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR:', String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5243', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const { freezeClock } = await import('../tools/probe/lib/clock.mjs');
await freezeClock(page, { tod: 0.5 });
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g.world && g.world.store && g.world.store.w >= 1200;
}, { timeout: 300000 });

await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const c0 = Math.trunc(st.w / 2);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  p.statMana = p.statManaMax = p.statManaMax2 = 800;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3476_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 999 };
  p.inv.selected = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  // 相机钉球辅助位
  window.__pinCam = () => {
    const g2 = window.__swGame;
    const ball = g2.entities.projectiles.find((e) => e.projId === 617 && !e.dead);
    if (ball) { g2.camera.x = ball.cx; g2.camera.y = ball.cy; }
    return !!ball;
  };
});

await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const wx = p.cx + 120, wy = p.cy - 60;
  const [sx, sy] = g.camera.worldToScreen(wx, wy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true;
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g.entities.projectiles.some((e) => e.projId === 618 && !e.dead);
}, { timeout: 15000, polling: 50 }).then(() => console.log('spark_born: true')).catch(() => console.log('spark_born: FALSE'));
await new Promise((r) => setTimeout(r, 1300));

async function sample(tag) {
  await page.evaluate(() => { window.__pinCam(); });
  await new Promise((r) => setTimeout(r, 80));   // 让相机应用一帧
  // 尘/弹遥测 + 屏幕位（与截图同帧序：先记录,后截图——1-2px 相位差可接受）
  const tele = await page.evaluate(() => {
    const g = window.__swGame;
    const cam = g.camera;
    const ball = g.entities.projectiles.find((e) => e.projId === 617 && !e.dead);
    const sparks = g.entities.projectiles.filter((e) => e.projId === 618 && !e.dead);
    const dusts = [];
    for (const d of g.vanillaDust.pool) {
      if (!d.active || d.type !== 86) continue;
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      dusts.push({ x: Math.round(d.x), y: Math.round(d.y), sx: Math.round(sx), sy: Math.round(sy),
        scale: +d.scale.toFixed(2), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2),
        dspark: Math.min(...sparks.map((s) => Math.hypot(d.x - s.cx, d.y - s.cy)), 9999) | 0,
        dball: ball ? Math.hypot(d.x - ball.cx, d.y - ball.cy) | 0 : -1 });
    }
    const bs = cam.worldToScreen(ball ? ball.cx : 0, ball ? ball.cy : 0);
    return { dusts, ball: { sx: Math.round(bs[0]), sy: Math.round(bs[1]), wx: Math.round(ball?.cx ?? 0), wy: Math.round(ball?.cy ?? 0) },
      nsparks: sparks.length, zoom: cam.zoom };
  });
  const img = await page.screenshot({ path: `${OUT}/pix-${tag}.png` });
  const png = PNG.sync.read(img);
  const px = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
    const i = (png.width * y + x) << 2;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const lum = (x, y) => { const c = px(x, y); return c ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : -1; };
  // 对每枚在屏 d86：中心 3×3 max vs 周边 40×40 中位
  const spots = [];
  for (const d of tele.dusts) {
    if (d.sx < 30 || d.sy < 30 || d.sx > 1250 || d.sy > 770) continue;
    let cmax = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cmax = Math.max(cmax, lum(d.sx + dx, d.sy + dy));
    const ring = [];
    for (let dy = -20; dy <= 20; dy += 5) for (let dx = -20; dx <= 20; dx += 5) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) continue;
      const v = lum(d.sx + dx, d.sy + dy);
      if (v >= 0) ring.push(v);
    }
    ring.sort((a, b) => a - b);
    const med = ring[Math.floor(ring.length / 2)] ?? 0;
    const c = px(d.sx, d.sy);
    spots.push({ at: [d.sx, d.sy], dspark: d.dspark, scale: d.scale, cmax: Math.round(cmax), bg: Math.round(med), boost: Math.round(cmax - med), rgb: c });
  }
  spots.sort((a, b) => b.boost - a.boost);
  const vis = spots.filter((s) => s.boost > 25);
  console.log(`[${tag}] ball_px=`, JSON.stringify(tele.ball), 'zoom=', tele.zoom, 'nsparks=', tele.nsparks);
  console.log(`[${tag}] dust86_total=${tele.dusts.length} sampled=${spots.length} visible(boost>25)=${vis.length}`);
  console.log(`[${tag}] top6=`, JSON.stringify(spots.slice(0, 6)));
  const ds = tele.dusts.map((d) => d.dspark).sort((a, b) => a - b);
  console.log(`[${tag}] d86→spark p10/p50/p90:`, ds[Math.floor(ds.length * 0.1)] ?? '-', ds[Math.floor(ds.length * 0.5)] ?? '-', ds[Math.floor(ds.length * 0.9)] ?? '-');
}

await sample('a');
await new Promise((r) => setTimeout(r, 1200));
await sample('b');
await new Promise((r) => setTimeout(r, 1200));
await sample('c');
await browser.close();
console.log('done');

// ★星云 618 像素取证三番——玩家传送跟球、屏心净区采样（无 UI 污染）
// 运行：SW_ORIGIN=http://localhost:5243 node tools/run-diag.mjs scripts/_nebula618-pix2.mjs
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
});

await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const wx = p.cx + 100, wy = p.cy - 40;
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
await new Promise((r) => setTimeout(r, 1200));

async function sample(tag) {
  // 玩家传送到球正下方 170px → 相机跟玩家 → 球 ≈ 屏心(640, 400-170·zoom 上方)
  await page.evaluate(() => {
    const g = window.__swGame;
    const ball = g.entities.projectiles.find((e) => e.projId === 617 && !e.dead);
    const p = g.player;
    if (ball) { p.x = ball.cx - p.w / 2; p.y = ball.cy + 170; p.vx = 0; p.vy = 0; }
  });
  await new Promise((r) => setTimeout(r, 120));   // 相机应用 1-2 帧
  const tele = await page.evaluate(() => {
    const g = window.__swGame;
    const cam = g.camera;
    const ball = g.entities.projectiles.find((e) => e.projId === 617 && !e.dead);
    const sparks = g.entities.projectiles.filter((e) => e.projId === 618 && !e.dead);
    const dusts = [];
    for (const d of g.vanillaDust.pool) {
      if (!d.active) continue;
      if (d.type !== 86 && d.type !== 90 && d.type !== 240) continue;
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      dusts.push({ t: d.type, x: Math.round(d.x), y: Math.round(d.y), sx: Math.round(sx), sy: Math.round(sy),
        scale: +d.scale.toFixed(2),
        dspark: (sparks.length ? Math.min(...sparks.map((s) => Math.hypot(d.x - s.cx, d.y - s.cy))) : 9999) | 0 });
    }
    const bs = cam.worldToScreen(ball ? ball.cx : 0, ball ? ball.cy : 0);
    const ss = sparks.map((s) => { const [sx, sy] = cam.worldToScreen(s.cx, s.cy); return [Math.round(sx), Math.round(sy)]; });
    return { dusts, ball: [Math.round(bs[0]), Math.round(bs[1])], sparks: ss };
  });
  const img = await page.screenshot({ path: `${OUT}/p2-${tag}.png` });
  const png = PNG.sync.read(img);
  const lum = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return -1;
    const i = (png.width * y + x) << 2;
    return 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
  };
  const px = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
    const i = (png.width * y + x) << 2;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  // 净区：x∈[200,1080], y∈[250,760]（热栏/心/小地图皆在外）
  const inClean = (sx, sy) => sx >= 200 && sx <= 1080 && sy >= 250 && sy <= 760;
  const spots = [];
  for (const d of tele.dusts) {
    if (!inClean(d.sx, d.sy)) continue;
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
    spots.push({ at: [d.sx, d.sy], t: d.t, dspark: d.dspark, scale: d.scale, boost: Math.round(cmax - med), rgb: px(d.sx, d.sy) });
  }
  spots.sort((a, b) => b.boost - a.boost);
  console.log(`[${tag}] ball_px=`, JSON.stringify(tele.ball), 'sparks_px=', JSON.stringify(tele.sparks));
  console.log(`[${tag}] dust(t86/90/240)=${tele.dusts.length}/${tele.dusts.filter((d) => d.t === 90).length}/${tele.dusts.filter((d) => d.t === 240).length} clean_sampled=${spots.length} visible(>25)=${spots.filter((s) => s.boost > 25).length}`);
  console.log(`[${tag}] top8=`, JSON.stringify(spots.slice(0, 8)));
  const ds = tele.dusts.map((d) => d.dspark).sort((a, b) => a - b);
  console.log(`[${tag}] dust→spark p10/p50/p90:`, ds[Math.floor(ds.length * 0.1)] ?? '-', ds[Math.floor(ds.length * 0.5)] ?? '-', ds[Math.floor(ds.length * 0.9)] ?? '-');
}

await sample('A');
await new Promise((r) => setTimeout(r, 1100));
await sample('B');
await new Promise((r) => setTimeout(r, 1100));
await sample('C');
await browser.close();
console.log('done');

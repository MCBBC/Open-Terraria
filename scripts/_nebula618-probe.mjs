// ★星云粉色小射弹 618 视觉取证探针——原版 streak 配方 vs 本仓实机帧
// 运行：SW_ORIGIN=http://localhost:5243 node tools/run-diag.mjs scripts/_nebula618-probe.mjs
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

// ---- 场景布置：平地、法力满、给 3476 星璇秘术、清怪 ----
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
  if (!key) throw new Error('item 3476 not found: ' + Object.keys(window.__swItems).find((k) => /3476/.test(k)));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 999 };
  p.inv.selected = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
});

// ---- 发射一球（右上仰射 200px），等球进入慢速段并掷出 618 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const wx = p.cx + 200, wy = p.cy - 120;
  const [sx, sy] = g.camera.worldToScreen(wx, wy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true;
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });

// 等 618 出现
const sparkBorn = await page.waitForFunction(() => {
  const g = window.__swGame;
  return g.entities.projectiles.some((e) => e.projId === 618 && !e.dead);
}, { timeout: 15000, polling: 50 }).then(() => true).catch(() => false);
console.log('spark_born:', sparkBorn);

// 慢速段 30t 一掷：再等 ~1.4s 让 2-3 枚 618 同场并成 streak
await new Promise((r) => setTimeout(r, 1400));

// ---- 采样函数：投射物/尘遥测 + 截图 + 尘位像素亮斑分析 ----
async function sample(tag) {
  const tele = await page.evaluate(() => {
    const g = window.__swGame;
    const projs = g.entities.projectiles.filter((e) => !e.dead && (e.projId === 617 || e.projId === 618)).map((e) => ({
      id: e.projId, x: Math.round(e.cx), y: Math.round(e.cy), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2),
      alpha: e.alpha, naParent: e.projId === 618 ? !!e.naParent : undefined,
    }));
    const vd = g.vanillaDust;
    const dusts = [];
    if (vd) {
      for (const d of vd.pool) {
        if (!d.active) continue;
        if (d.type === 86 || d.type === 90 || d.type === 240) {
          dusts.push({ t: d.type, x: Math.round(d.x), y: Math.round(d.y), vx: +d.vx.toFixed(2), vy: +d.vy.toFixed(2),
            scale: +d.scale.toFixed(2), fx: d.fx, fy: d.fy, ng: d.noGravity, nl: d.noLight,
            fi: d.fadeIn, fe: typeof d.followEnt === 'function' });
        }
      }
    }
    const cam = g.camera;
    const scr = projs.map((q) => { const [sx, sy] = cam.worldToScreen(q.x, q.y); return { id: q.id, sx: Math.round(sx), sy: Math.round(sy) }; });
    return { projs, dusts, scr, cw: 1280, ch: 800 };
  });
  fs.writeFileSync(`${OUT}/tele-${tag}.json`, JSON.stringify(tele, null, 1));
  const img = await page.screenshot({ path: `${OUT}/shot-${tag}.png` });
  // 尘位像素亮斑分析（pngjs）
  const png = PNG.sync.read(img);
  const lum = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return -1;
    const i = (png.width * y + x) << 2;
    return 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
  };
  const stats = { dusts: [], total86: 0, withFollow: 0, farTrail: 0 };
  for (const q of tele.projs) if (q.id === 617) { stats.ball = { x: q.x, y: q.y }; }
  const sparks = tele.projs.filter((q) => q.id === 618);
  for (const d of tele.dusts) {
    if (d.t !== 86) continue;
    stats.total86++;
    if (d.fe) stats.withFollow++;
    let dmin = 1e9;
    for (const s of sparks) dmin = Math.min(dmin, Math.hypot(d.x - s.x, d.y - s.y));
    const dball = stats.ball ? Math.hypot(d.x - stats.ball.x, d.y - stats.ball.y) : -1;
    if (dmin > 25) stats.farTrail++;
    if (d.scale > 0.7 && dmin < 200) {
      const [sx, sy] = (() => {
        const scr = tele.scr.find((s) => s.id === 617);
        return [0, 0];
      })();
    }
  }
  // 逐尘亮斑：屏幕坐标 = 世界坐标经 cam ——上面 scr 只有投射物;尘屏幕位直接用 worldToScreen 等价:
  // 已在页内补采（下面 evaluate）——此处用 png 对尘中心 3×3 max 与周边 40×40 中位比
  const dustPix = await page.evaluate(() => {
    const g = window.__swGame;
    const cam = g.camera;
    const out = [];
    for (const d of g.vanillaDust.pool) {
      if (!d.active || d.type !== 86 || d.scale < 0.7) continue;
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      if (sx < 40 || sy < 40 || sx > 1240 || sy > 760) continue;
      out.push({ sx: Math.round(sx), sy: Math.round(sy), scale: +d.scale.toFixed(2) });
      if (out.length >= 24) break;
    }
    return out;
  });
  const spot = [];
  for (const q of dustPix) {
    let cmax = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cmax = Math.max(cmax, lum(q.sx + dx, q.sy + dy));
    const ring = [];
    for (let dy = -20; dy <= 20; dy += 4) for (let dx = -20; dx <= 20; dx += 4) {
      const v = lum(q.sx + dx, q.sy + dy);
      if (v >= 0) ring.push(v);
    }
    ring.sort((a, b) => a - b);
    const med = ring[Math.floor(ring.length / 2)] ?? 0;
    spot.push({ at: [q.sx, q.sy], scale: q.scale, cmax: Math.round(cmax), bg: Math.round(med), boost: +(cmax - med).toFixed(0) });
  }
  spot.sort((a, b) => b.boost - a.boost);
  console.log(`[${tag}] sparks=${sparks.length} dust86=${stats.total86} follow=${stats.withFollow} farTrail(>25px)=${stats.farTrail}`);
  console.log(`[${tag}] ball=`, JSON.stringify(stats.ball));
  console.log(`[${tag}] spark_pos=`, JSON.stringify(sparks.map((s) => [s.x, s.y, s.vx, s.vy])));
  console.log(`[${tag}] top_boost=`, JSON.stringify(spot.slice(0, 6)));
  // 尘-618 距离分布（streak 判据:拖尾应有 >20px 远尘)
  const dists = tele.dusts.filter((d) => d.t === 86).map((d) => {
    let m = 1e9;
    for (const s of sparks) m = Math.min(m, Math.hypot(d.x - s.x, d.y - s.y));
    return Math.round(m);
  }).sort((a, b) => a - b);
  console.log(`[${tag}] dist86→nearest_spark p10/p50/p90/max:`,
    dists[Math.floor(dists.length * 0.1)] ?? '-', dists[Math.floor(dists.length * 0.5)] ?? '-',
    dists[Math.floor(dists.length * 0.9)] ?? '-', dists[dists.length - 1] ?? '-');
  return tele;
}

const t1 = await sample('t1');
await new Promise((r) => setTimeout(r, 1300));
const t2 = await sample('t2');
await new Promise((r) => setTimeout(r, 1300));
const t3 = await sample('t3');

// ---- 几何指纹：618 与父球距离谱（绕球=亚 sonic 弧线;飞散=直线远走）----
for (const [tag, t] of [['t1', t1], ['t2', t2], ['t3', t3]]) {
  const ball = t.projs.find((q) => q.id === 617);
  const sparks = t.projs.filter((q) => q.id === 618);
  if (!ball) continue;
  const ds = sparks.map((s) => Math.round(Math.hypot(s.x - ball.x, s.y - ball.y)));
  console.log(`[${tag}] spark→ball dist:`, JSON.stringify(ds));
}
await browser.close();
console.log('done');

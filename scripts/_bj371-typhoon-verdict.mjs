// ★BJ371 定谳探针 v2——剃刀台风 2622（弹 409 Typhoon aiStyle71）用户三症状：
//   ① 白底半透明大方块（带旋转残影叠加）② 缺旋转 ③ 缺尾迹粒子。
// 定谳面：
//   M1（机制）页内 tintedTex 微测：drawProjGhosts 预乘单笔 path 消费
//     tintedTex(tex,[255,255,255],flatten)——flatten=true 对透明底贴图把透明域
//     multiply 填成【不透明白】=白底来源；flatten=false 保持 alpha 形状。
//   M2（实机）日间空旷天空连发 409：弹后随 A 盒 vs 弹前同距 B 盒（纯天）亮度/
//     白像索对拍 + spinRot 采样 + d217 尘计数 + 截图三连。
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj371-typhoon-verdict.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/bj371';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const { freezeClock } = await import('../tools/probe/lib/clock.mjs');
await freezeClock(page, { tod: 0.5 });   // 正午

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = { M1: {}, M2: {}, env: {} };
  await g.newWorld('bj371', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const c0 = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  p.statMana = p.statManaMax = p.statManaMax2 = 600;
  const key2622 = Object.keys(items).find((k) => /^vi_2622_/.test(k));
  if (!key2622) { O.fail = 'item-2622-missing'; return O; }
  p.inv.slots[0] = { id: items[key2622], stack: 999 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));
  O.env.itemKey = key2622;

  // ---- M1 tintedTex 微测（机制定谳;贴图源 = draw 路径同源 projSprite(409)）----
  const { tintedTex } = await import('/src/render/StringLine.ts');
  const { projSprite } = await import('/src/entities/Arrow.ts');
  let tex409 = null;
  for (let i = 0; i < 50 && !tex409; i++) {
    tex409 = projSprite(409);
    if (!tex409) await new Promise((r) => setTimeout(r, 100));
  }
  O.M1.srcSize = tex409 ? [tex409.width, tex409.height] : null;
  if (tex409) {
    const srcC = document.createElement('canvas');
    srcC.width = tex409.width; srcC.height = tex409.height;
    const sc = srcC.getContext('2d');
    sc.drawImage(tex409, 0, 0);
    const sPix = sc.getImageData(0, 0, 8, 8).data;
    O.M1.srcCorner = [sPix[0], sPix[1], sPix[2], sPix[3]];
    const flat = tintedTex(tex409, [255, 255, 255], true);
    const keep = tintedTex(tex409, [255, 255, 255], false);
    const rd = (c) => { const x = c.getContext('2d'); const d = x.getImageData(0, 0, 4, 4).data; return [d[0], d[1], d[2], d[3]]; };
    O.M1.flattenTrueCorner = rd(flat);
    O.M1.flattenFalseCorner = rd(keep);
    const cnt = (c) => { const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let op = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) op++; return op; };
    O.M1.srcOpaquePx = cnt(srcC);
    O.M1.flattenTrueOpaquePx = cnt(flat);
    O.M1.flattenFalseOpaquePx = cnt(keep);
    O.M1.verdict = O.M1.flattenTrueOpaquePx === O.M1.flattenFalseOpaquePx
      ? 'no-diff' : 'flatten-true-fills-transparent-WHITE-BG';
  }

  // ---- M2 实机（A/B 盒对拍 + spin + d217 计数）----
  O.env.bglPathUsed = g.renderer.bglPathUsed ?? '-';
  const canvas = g.renderer.canvas;
  const work = document.createElement('canvas');
  work.width = canvas.width; work.height = canvas.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  window.__d217 = 0;
  const origD = g.spawnDust.bind(g);
  g.spawnDust = (...a) => { if (a[4] === 217) window.__d217++; return origD(...a); };
  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };
  // 盒统计：meanRGB + 白像素（r,g,b≥195 且低彩度）
  const boxStats = (cx, cy, r0) => {
    wctx.drawImage(canvas, 0, 0);
    const x0 = Math.max(0, Math.round(cx - r0)), y0 = Math.max(0, Math.round(cy - r0));
    const w0 = Math.min(canvas.width - x0, r0 * 2), h0 = Math.min(canvas.height - y0, r0 * 2);
    if (w0 <= 0 || h0 <= 0) return null;
    const d = wctx.getImageData(x0, y0, w0, h0).data;
    let sr = 0, sg = 0, sb = 0, n = 0, white = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      sr += r; sg += gg; sb += b; n++;
      if (r >= 195 && gg >= 195 && b >= 195 && Math.max(r, gg, b) - Math.min(r, gg, b) < 22) white++;
    }
    return { mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)], white };
  };
  const samples = [];
  window.__m2 = [];
  for (let f = 0; f < 300; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    const cyc = f % 45;
    if (cyc === 1) { aim(p.cx + 260, p.cy - 240); g.input.mouseDown = true; }
    if (cyc === 26) g.input.mouseDown = false;
    if (f >= 40 && f % 12 === 0) {
      const projs = g.entities.projectiles.filter((q) => q.projId === 409 && !q.dead);
      if (projs.length) {
        const q = projs[0];
        const [sx, sy] = g.camera.worldToScreen(q.cx, q.cy);
        if (sx > 300 && sx < canvas.width - 300 && sy > 200 && sy < canvas.height - 200) {
          // A 盒=弹后（沿速度反向 30px）;B 盒=弹前同距（纯天空对照）
          const vlen = Math.hypot(q.vx, q.vy) || 1;
          const ux = q.vx / vlen, uy = q.vy / vlen;
          const zoom = g.camera.zoom ?? 2;
          const off = 30 * zoom;
          const A = boxStats(sx - ux * off, sy - uy * off, 24);
          const B = boxStats(sx + ux * off, sy + uy * off, 24);
          samples.push({ f, spin: +(q.spinRot ?? 0).toFixed(3),
            d217: window.__d217,
            A: A && A.mean, Awhite: A && A.white, B: B && B.mean, Bwhite: B && B.white });
        }
      }
    }
  }
  O.M2.samples = samples.slice(-12);
  O.M2.d217Total = window.__d217;
  O.M2.spinMoved = samples.some((s) => Math.abs(s.spin) > 0.01);
  O.M2.AbrighterB = samples.filter((s) => s.A && s.B).map((s) => (s.A[0] - s.B[0]));
  return O;
});

// ---- 截图三连（弹在场;每轮重挂 item 防热栏被换）----
for (let i = 0; i < 3; i++) {
  await page.evaluate(async () => {
    const g = window.__swGame;
    const p = g.player;
    const items = window.__swItems;
    const key2622 = Object.keys(items).find((k) => /^vi_2622_/.test(k));
    p.inv.slots[0] = { id: items[key2622], stack: 999 };
    p.inv.selected = 0;
    p.statMana = 600;
    const [sx, sy] = g.camera.worldToScreen(p.cx + 260, p.cy - 240);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    await new Promise((r) => requestAnimationFrame(r));
    g.input.mouseDown = true;
    await new Promise((r) => setTimeout(r, 620));
    g.input.mouseDown = false;
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: `${OUT}/typhoon-v2-${i}.png` });
}
console.log(JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS:', JSON.stringify(pageErrors.slice(0, 5)));
await browser.close();

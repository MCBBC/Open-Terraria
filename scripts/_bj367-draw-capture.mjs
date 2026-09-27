// ★BJ367 绘制捕获 v3——停自动 rAF 循环,手动 g.frame() 逐帧 step+render,绘制面全录
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const BJ367_MODE = process.env.SW_BJ367_MODE ?? 'cpu';
const out = await page.evaluate(async (MODE) => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', MODE);
  await new Promise((r) => setTimeout(r, 600));
  await g.newWorld('bj367', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) { if (g.world && g.world.store && g.world.store.w === 4200) break; await new Promise((r) => setTimeout(r, 200)); }
  g.running = false;   // ★停自动循环——绘制只在我调 g.frame() 时发生=完全确定性
  const p = g.player;
  const st = g.world.store;
  let groundY = -1;
  const c0 = Math.trunc(p.x / 16);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  p.x = c0 * 16; p.y = groundY * 16 - p.h; p.vx = 0; p.vy = 0;
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;

  // 贴图预热
  const { projSprite, projSpriteHealth } = await import('/src/entities/Arrow.ts');
  projSprite(404);
  let warm = null;
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 400)); warm = projSprite(404); if (warm) break; }
  const warmState = warm ? { w: warm.width, h: warm.height, ctor: warm.constructor.name } : 'warm-fail';

  const { FlaironHeadProj, FlaironSpike, flaironSpawnNudge } = await import('/src/entities/WeaponProj.ts');
  const dirx = p.cx + 150, diry = p.cy - 330;
  const sp = flaironSpawnNudge(-1, p.cx, p.cy, dirx, diry);
  const ddx = dirx - sp.x, ddy = diry - sp.y, dl = Math.hypot(ddx, ddy) || 1;
  const spd = 14;
  const head = new FlaironHeadProj(sp.x, sp.y, ddx / dl * spd, ddy / dl * spd, 30, 4.5);
  head.x = sp.x - head.w / 2; head.y = sp.y - head.h / 2;
  head.pinUse = () => {};
  head.spawnProj = (sx, sy, svx, svy, sProj, sDmg, sKb) => {
    if (sProj !== 405) return;
    g.entities.add(new FlaironSpike(sx - 7, sy - 7, svx, svy, Math.max(1, Math.round(sDmg)), sKb), 'projectiles');
  };
  g.entities.add(head, 'projectiles');

  const cap = { draws: [], fills: [], headDraws: 0, spikeDraws: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  let captureHeadBox = null;
  const xformBox = (ctx, x, y, w, h) => {
    const t = ctx.getTransform();
    const cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [t.a * px + t.c * py + t.e, t.b * px + t.d * py + t.f]);
    return { x0: Math.min(...cs.map((c) => c[0])), x1: Math.max(...cs.map((c) => c[0])), y0: Math.min(...cs.map((c) => c[1])), y1: Math.max(...cs.map((c) => c[1])) };
  };
  const inter = (b, hb) => b && hb && b.x0 < hb.x1 && hb.x0 < b.x1 && b.y0 < hb.y1 && hb.y0 < b.y1;
  if (!proto.__bj367v3) {
    proto.__bj367v3 = true;
    const od = proto.drawImage, of = proto.fillRect;
    proto.drawImage = function (...a) {
      try {
        if (captureHeadBox) {
          const img = a[0];
          const iw = img && img.width, ih = img && img.height;
          let sx = 0, sy = 0, sw = iw, sh = ih, dx = 0, dy = 0, dw = iw, dh = ih;
          if (a.length >= 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
          else if (a.length >= 5) { dx = a[1]; dy = a[2]; dw = a[3]; dh = a[4]; }
          else { dx = a[1]; dy = a[2]; }
          const b = xformBox(this, dx, dy, dw, dh);
          if (inter(b, captureHeadBox) && iw > 0) {
            const rec = { iw, ih, n: a.length, alpha: +(+this.globalAlpha).toFixed(2), comp: this.globalCompositeOperation,
              bx: Math.round(b.x0), by: Math.round(b.y0), bw: Math.round(b.x1 - b.x0), bh: Math.round(b.y1 - b.y0) };
            if (a.length >= 9) { rec.src = [sx, sy, sw, sh].map(Math.round); rec.dst = [dx, dy, dw, dh].map(Math.round); }
            else if (a.length >= 5) rec.dst = [dx, dy, dw, dh].map(Math.round);
            else rec.dst = [dx, dy].map(Math.round);
            cap.draws.push(rec);
          }
        }
      } catch { }
      return od.apply(this, a);
    };
    proto.fillRect = function (x, y, w, h) {
      try {
        if (captureHeadBox && w < 100 && h < 100) {
          const b = xformBox(this, x, y, w, h);
          if (inter(b, captureHeadBox)) {
            const f = this.fillStyle;
            cap.fills.push({ f: typeof f === 'string' ? f : String(f), x: Math.round(b.x0), y: Math.round(b.y0), w: Math.round(b.x1 - b.x0), h: Math.round(b.y1 - b.y0), alpha: +(+this.globalAlpha).toFixed(2), comp: this.globalCompositeOperation });
          }
        }
      } catch { }
      return of.apply(this, [x, y, w, h]);
    };
  }
  const oh = FlaironHeadProj.prototype.draw;
  FlaironHeadProj.prototype.draw = function (...a) { cap.headDraws++; return oh.apply(this, a); };
  const osp = FlaironSpike.prototype.draw;
  if (osp) FlaironSpike.prototype.draw = function (...a) { cap.spikeDraws++; return osp.apply(this, a); };

  const off = document.createElement('canvas');
  off.width = 160; off.height = 160;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const frames = [];
  for (let t = 1; t <= 120; t++) {
    g.paused = false;
    const [psx, psy] = g.camera.worldToScreen(head.x, head.y);
    const scale = g.renderer.canvas.width / g.renderer.canvas.getBoundingClientRect().width;
    const sampling = t >= 8 && t % 3 === 0;
    if (sampling) captureHeadBox = { x0: psx * scale - 70, x1: psx * scale + head.w * scale + 70, y0: psy * scale - 70, y1: psy * scale + head.h * scale + 70 };
    g.frame(performance.now());   // step+render 一帧
    captureHeadBox = null;
    if (head.dead) break;
    if (!sampling) continue;
    // 像素:头部屏域（用帧后位置）
    const [sx2, sy2] = g.camera.worldToScreen(head.x, head.y);
    octx.clearRect(0, 0, 160, 160);
    const gx = Math.max(0, Math.round(sx2 * scale) - 60), gy = Math.max(0, Math.round(sy2 * scale) - 60);
    octx.drawImage(g.renderer.canvas, gx, gy, 160, 160, 0, 0, 160, 160);
    const d = octx.getImageData(0, 0, 160, 160).data;
    let white = 0, wx0 = 1e9, wy0 = 1e9, wx1 = -1, wy1 = -1, cyan = 0;
    for (let yy = 0; yy < 160; yy++) for (let xx = 0; xx < 160; xx++) {
      const i = (yy * 160 + xx) * 4;
      if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245 && d[i + 3] > 100) {
        white++;
        if (xx < wx0) wx0 = xx; if (xx > wx1) wx1 = xx;
        if (yy < wy0) wy0 = yy; if (yy > wy1) wy1 = yy;
      }
      if (d[i + 3] > 200 && d[i + 1] > 140 && d[i] < 160 && d[i + 2] > 90 && d[i + 2] < 220) cyan++;
    }
    frames.push({ t, head: { cx: Math.round(head.cx), cy: Math.round(head.cy), st: head.aiState, alpha: head.alphaView },
      rotDeg: +((head.rotation * 180 / Math.PI) % 360).toFixed(1), white, cyan,
      whiteBox: white > 0 ? { x: wx0, y: wy0, w: wx1 - wx0 + 1, h: wy1 - wy0 + 1 } : null,
      draws: cap.draws.splice(0, cap.draws.length), fills: cap.fills.splice(0, cap.fills.length) });
  }
  return {
    warmState, health: projSpriteHealth([404, 405]),
    headDraws: cap.headDraws, spikeDraws: cap.spikeDraws,
    frameCount: frames.length,
    maxWhite: Math.max(0, ...frames.map((f) => f.white)),
    maxCyan: Math.max(0, ...frames.map((f) => f.cyan)),
    framesWithWhite: frames.filter((f) => f.white > 0).length,
    framesWhiteBox: frames.filter((f) => f.white > 0).slice(0, 3).map((f) => ({ t: f.t, white: f.white, box: f.whiteBox, head: f.head })),
    sampleFrames: frames.slice(0, 6),
    texAgg: (() => { const m = {}; for (const f of frames) for (const dr of f.draws) { const k = dr.iw + 'x' + dr.ih + '#a' + dr.n; m[k] = (m[k] || 0) + 1; } return m; })(),
    fillAgg: (() => { const m = {}; for (const f of frames) for (const fl of f.fills) { const k = fl.f + '@' + fl.alpha + '@' + fl.comp; m[k] = (m[k] || 0) + 1; } return m; })(),
  };
}, BJ367_MODE);
console.log('CAP3=' + JSON.stringify(out, null, 1));
await browser.close();

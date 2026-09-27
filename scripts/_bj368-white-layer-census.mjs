// ★BJ368 白层普查——球飞行时,球盒内【每一笔】绘制调用 census:
//  GL 面 quadSprite(白纹理/白tint/球盒内)+shim fillRect(白);2D 面 fillRect/drawImage(白)
//  目的:回答「是否多画一层白色」——抓到就报调用形态;抓不到=证伪
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = {};
  const { options } = await import('/src/core/Options.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368wc', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  // ---- 普查钩 ----
  const census = [];
  let capture = null;   // {x0,y0,x1,y1} 世界盒(屏幕系)
  let frameNo = 0;

  // GL 面:quadSprite——白纹理('__white'/1×1)/白 tint/球盒相交
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
  const glp = GLSpriteLayer.prototype;
  if (!glp.__bj368wc) {
    glp.__bj368wc = true;
    const oq = glp.quadSprite;
    glp.quadSprite = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
      try {
        if (capture) {
          const isWhiteTex = e && e.w === 1 && e.h === 1;
          const tint = opts && opts.tint;
          const isWhiteTint = tint && tint[0] >= 0.9 && tint[1] >= 0.9 && tint[2] >= 0.9;
          const inBox = dx + dw >= capture.x0 && capture.x1 >= dx && dy + dh >= capture.y0 && capture.y1 >= dy;
          if ((isWhiteTex || isWhiteTint) && inBox) {
            census.push({ ch: 'gl-quad', whiteTex: isWhiteTex, whiteTint: !!isWhiteTint,
              dx: +dx.toFixed(1), dy: +dy.toFixed(1), dw: +dw.toFixed(1), dh: +dh.toFixed(1),
              rot: opts && opts.rot ? +opts.rot.toFixed(3) : 0,
              alpha: opts && opts.alpha !== undefined ? +opts.alpha.toFixed(3) : 1,
              tex: e ? `${e.w}x${e.h}` : null, frame: frameNo });
          }
        }
      } catch { /* ignore */ }
      return oq.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
    };
  }
  // shim fillRect（白）
  {
    const live = g.renderer.bglEntShim;
    if (live && live.bound && !live.bound.__bj368wc) {
      live.bound.__bj368wc = true;
      const ofr = live.bound.fillRect;
      live.bound.fillRect = function (x, y, w, h) {
        try {
          if (capture) {
            const m = live.m;
            const cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
              .map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
            const bx0 = Math.min(...cs.map((c) => c[0])), bx1 = Math.max(...cs.map((c) => c[0]));
            const by0 = Math.min(...cs.map((c) => c[1])), by1 = Math.max(...cs.map((c) => c[1]));
            const inBox = bx1 >= capture.x0 && capture.x1 >= bx0 && by1 >= capture.y0 && capture.y1 >= by0;
            const fs = String(live.fillStyleV ?? '');
            const isWhite = /rgba?\(\s*2[0-5]\d,\s*2[0-5]\d,\s*2[0-5]\d/.test(fs) || fs === '#fff' || fs === '#ffffff' || fs === 'white';
            if (inBox) census.push({ ch: 'shim-fillRect', white: isWhite, fillStyle: fs.slice(0, 40),
              gco: live.gco, bx: [Math.round(bx0), Math.round(by0), Math.round(bx1 - bx0), Math.round(by1 - by0)], frame: frameNo });
          }
        } catch { /* ignore */ }
        return ofr.call(this, x, y, w, h);
      };
    }
  }
  // 2D 面（主画布+世界画布）:白 fillRect
  {
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__bj368wc) {
      proto.__bj368wc = true;
      const ofr = proto.fillRect;
      proto.fillRect = function (x, y, w, h) {
        try {
          if (capture && this !== g.renderer.bglEntShim) {
            const m = this.getTransform ? this.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            const cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
              .map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
            const bx0 = Math.min(...cs.map((c) => c[0])), bx1 = Math.max(...cs.map((c) => c[0]));
            const by0 = Math.min(...cs.map((c) => c[1])), by1 = Math.max(...cs.map((c) => c[1]));
            const inBox = bx1 >= capture.x0 && capture.x1 >= bx0 && by1 >= capture.y0 && capture.y1 >= by0;
            if (inBox) {
              const f = this.fillStyle;
              const fs = typeof f === 'string' ? f : String(f);
              const isWhite = /rgba?\(\s*2[0-5]\d,\s*2[0-5]\d,\s*2[0-5]\d/.test(fs) || /#f{3,6}/i.test(fs) || fs === 'white';
              if (isWhite) census.push({ ch: '2d-fillRect', fillStyle: fs.slice(0, 40), gco: this.globalCompositeOperation,
                ga: +Number(this.globalAlpha).toFixed(3), bx: [Math.round(bx0), Math.round(by0), Math.round(bx1 - bx0), Math.round(by1 - by0)], frame: frameNo });
            }
          }
        } catch { /* ignore */ }
        return ofr.apply(this, arguments);
      };
    }
  }

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };
  const scale = g.renderer.canvas.width / g.renderer.canvas.getBoundingClientRect().width;

  // 出球并逐帧设捕获盒(球±60px)
  const samples = [];
  for (let rep = 0; rep < 4; rep++) {
    for (const q of g.entities.projectiles) q.dead = true;
    g.fixedUpdate(1 / 60);
    aim(p.cx + (rep % 2 ? -220 : 220), p.cy - 30);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    let head = g.entities.projectiles.find((q) => q.projId === 404);
    if (!head) continue;
    for (let t = 1; t <= 40; t++) {
      g.paused = false;
      g.fixedUpdate(1 / 60);
      head = g.entities.projectiles.find((q) => q.projId === 404 && !q.dead);
      if (!head) break;
      if (t % 2 !== 0) continue;
      const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
      capture = { x0: sx * scale - 70, y0: sy * scale - 70, x1: sx * scale + 70, y1: sy * scale + 70 };
      frameNo++;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      capture = null;
      samples.push({ rep, t });
    }
  }
  O.samples = samples.length;
  O.censusN = census.length;
  // 汇总:按 ch+形态聚
  const agg = {};
  for (const c of census) {
    const k = c.whiteTex ? 'gl-quad-WHITETEX' : c.whiteTint ? 'gl-quad-WHITETINT' : c.ch;
    agg[k] = (agg[k] ?? 0) + 1;
  }
  O.agg = agg;
  O.first = census.slice(0, 24);
  O.whites = census.filter((c) => c.white || c.whiteTex || c.whiteTint).slice(0, 24);
  O.shimStats = g.renderer.bglShimStats ? g.renderer.bglShimStats() : null;
  O.path = g.renderer.bglPathUsed;
  return O;
});
console.log('BJ368_WC=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();

// ★BJ367 实机绘制探针 v2——利刃台风 404 头弹白底/旋转/尾迹三症状定谳
//  v2 修正:①CPU 渲染模式强制(2D 记录面可达) ②canvas backing 像素换算(DPR/renderScale)
//  ③双通道:CPU pass 记录 drawImage/fillRect+像素;GPU pass 仅像素+截图
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj367-flairon-draw-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', 'cpu');
  await new Promise((r) => setTimeout(r, 400));
  await g.newWorld('bj367', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  const O = { env: {} };
  O.env.cpuRender = g.renderer.usingCpu ?? g.renderer.cpuRender;
  O.env.canvasW = g.renderer.canvas.width; O.env.canvasH = g.renderer.canvas.height;
  O.env.rectW = g.renderer.canvas.getBoundingClientRect().width;

  // 夜幕
  try { g.world.clock.timeOfDay = 40000; } catch (e) { O.env.timeSet = String(e); }

  const pcol0 = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  if (groundY < 0) {
    const c0 = Math.trunc(p.x / 16);
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
    p.x = c0 * 16; p.y = groundY * 16 - p.h;
  } else {
    p.x = pcol0 * 16; p.y = groundY * 16 - p.h;
  }
  p.vx = 0; p.vy = 0;
  O.env.groundY = groundY;

  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 300));

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  O.env.scale = scale;

  // ---- 2D 记录面 wrap（含 backing 像素换算）----
  const proto = CanvasRenderingContext2D.prototype;
  const drawLog = [];
  const fillLog = [];
  let captureHeadBox = null;
  const xformBox = (ctx, x, y, w, h) => {
    const t = ctx.getTransform();
    const cs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]
      .map(([px, py]) => [t.a * px + t.c * py + t.e, t.b * px + t.d * py + t.f]);
    const x0 = Math.min(...cs.map((c) => c[0])), x1 = Math.max(...cs.map((c) => c[0]));
    const y0 = Math.min(...cs.map((c) => c[1])), y1 = Math.max(...cs.map((c) => c[1]));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const intersects = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (!proto.__bj367Patched) {
    proto.__bj367Patched = true;
    const origDraw = proto.drawImage;
    proto.drawImage = function (...args) {
      try {
        if (captureHeadBox) {
          const img = args[0];
          const iw = img && (img.width ?? 0), ih = img && (img.height ?? 0);
          let dx, dy, dw, dh, sx = 0, sy = 0, sw = iw, sh = ih;
          if (args.length >= 9) { sx = args[1]; sy = args[2]; sw = args[3]; sh = args[4]; dx = args[5]; dy = args[6]; dw = args[7]; dh = args[8]; }
          else if (args.length >= 5) { dx = args[1]; dy = args[2]; dw = args[3]; dh = args[4]; }
          else { dx = 0; dy = 0; dw = iw; dh = ih; }
          const box = xformBox(this, dx, dy, dw, dh);
          if (intersects(box, captureHeadBox) && iw > 0) {
            drawLog.push({ iw, ih, sx, sy, sw, sh, dw, dh,
              box: { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) },
              alpha: +this.globalAlpha.toFixed(3), comp: this.globalCompositeOperation });
          }
        }
      } catch { /* 记录面零干扰 */ }
      return origDraw.apply(this, args);
    };
    const origFill = proto.fillRect;
    proto.fillRect = function (x, y, w, h) {
      try {
        if (captureHeadBox) {
          const box = xformBox(this, x, y, w, h);
          if (intersects(box, captureHeadBox)) {
            const f = this.fillStyle;
            const fs = typeof f === 'string' ? f : (f && f.toString ? f.toString() : String(f));
            fillLog.push({ fillStyle: fs, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h),
              alpha: +this.globalAlpha.toFixed(3), comp: this.globalCompositeOperation });
          }
        }
      } catch { /* ignore */ }
      return origFill.apply(this, args);
    };
  }

  const off = document.createElement('canvas');
  off.width = 140; off.height = 140;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const sampleBox = (bx, by, bw, bh) => {
    octx.clearRect(0, 0, 140, 140);
    const w = Math.min(140, bw), h = Math.min(140, bh);
    octx.drawImage(canvas, bx, by, w, h, 0, 0, w, h);
    const d = octx.getImageData(0, 0, w, h).data;
    let white = 0, opaque = 0, wx0 = 1e9, wy0 = 1e9, wx1 = -1, wy1 = -1;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      if (d[i + 3] > 10) opaque++;
      if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) {
        white++;
        if (xx < wx0) wx0 = xx; if (xx > wx1) wx1 = xx;
        if (yy < wy0) wy0 = yy; if (yy > wy1) wy1 = yy;
      }
    }
    return { white, opaque, whiteBox: white > 0 ? { x: wx0, y: wy0, w: wx1 - wx0 + 1, h: wy1 - wy0 + 1 } : null };
  };

  // 直接出球（绕开真循环 input 面——renderMode 切换会重建 Input,旗标不可靠）:
  // 复刻 Game.ts case 'flairon' 接线（出生 nudge+1px/盒心/伴生 405 回调）
  const spawnHead = async () => {
    for (const q of g.entities.projectiles) q.dead = true;
    await new Promise((r) => setTimeout(r, 80));
    const { FlaironHeadProj, FlaironSpike, flaironSpawnNudge } = await import('/src/entities/WeaponProj.ts');
    const dirx = p.cx + 240, diry = p.cy - 4;
    const sp = flaironSpawnNudge(-1, p.cx, p.cy, dirx, diry);
    const spd = 14;
    const hdx = dirx - sp.x, hdy = diry - sp.y, hl = Math.hypot(hdx, hdy) || 1;
    const head = new FlaironHeadProj(sp.x, sp.y, hdx / hl * spd, hdy / hl * spd, 30, 4.5);
    head.x = sp.x - head.w / 2; head.y = sp.y - head.h / 2;   // 盒心=pointPosition
    head.pinUse = () => {};
    head.spawnProj = (sx, sy, svx, svy, sProj, sDmg, sKb) => {
      if (sProj !== 405) return;
      g.entities.add(new FlaironSpike(sx - 7, sy - 7, svx, svy, Math.max(1, Math.round(sDmg)), sKb), 'projectiles');
    };
    g.entities.add(head, 'projectiles');
    return head;
  };

  // 采样一程（pass 参数:withLog）——★手动驱动 fixedUpdate(headless 失焦暂停冻结真循环)
  const runPass = async (withLog, ticks) => {
    const head = await spawnHead();
    if (!head) return { fail: 'no-head' };
    const frames = [];
    for (let t = 1; t <= ticks; t++) {
      g.paused = false;
      g.fixedUpdate(1 / 60);
      if (head.dead) break;
      if (t % 2 !== 0) continue;
      const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
      const hb = { x: sx * scale - 45, y: sy * scale - 45, w: head.w * scale + 90, h: head.h * scale + 90 };
      const [psx, psy] = g.camera.worldToScreen(p.x, p.y);
      const playerOpaque = sampleBox(psx * scale - 10, psy * scale - 10, 60, 80).opaque;
      if (withLog) captureHeadBox = hb;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      captureHeadBox = null;
      const px = sampleBox(hb.x, hb.y, 140, 140);
      frames.push({
        t,
        head: { cx: Math.round(head.cx), cy: Math.round(head.cy), st: head.aiState, alpha: head.alphaView },
        rotDeg: +((head.rotation * 180 / Math.PI) % 360).toFixed(1),
        playerOpaque,
        ...px,
        draws: withLog ? drawLog.splice(0, drawLog.length) : undefined,
        fills: withLog ? fillLog.splice(0, fillLog.length) : undefined,
      });
    }
    return { frames, n: frames.length };
  };

  // ---- CPU pass ----
  O.cpu = await runPass(true, 200);
  // 聚合
  if (O.cpu.frames) {
    const dimAgg = {};
    for (const f of O.cpu.frames) for (const dr of f.draws ?? []) {
      const k = `${dr.iw}x${dr.ih}`;
      dimAgg[k] = dimAgg[k] || { n: 0, srcRects: {}, dst: [] };
      dimAgg[k].n++;
      const sk = `${dr.sx},${dr.sy},${dr.sw},${dr.sh}`;
      dimAgg[k].srcRects[sk] = (dimAgg[k].srcRects[sk] || 0) + 1;
      if (dimAgg[k].dst.length < 4) dimAgg[k].dst.push(dr.box);
    }
    O.cpu.texDims = dimAgg;
    const fillAgg = {};
    for (const f of O.cpu.frames) for (const fl of f.fills ?? []) {
      const k = `${fl.fillStyle}@${fl.comp}@a${fl.alpha}`;
      fillAgg[k] = (fillAgg[k] || 0) + 1;
    }
    O.cpu.fillAgg = fillAgg;
    O.cpu.maxWhite = Math.max(...O.cpu.frames.map((f) => f.white));
    O.cpu.framesWithWhite = O.cpu.frames.filter((f) => f.white > 0).length;
    O.cpu.playerOpaqueMin = Math.min(...O.cpu.frames.map((f) => f.playerOpaque));
  }

  // ---- GPU pass（像素+截图）----
  options.set('renderMode', 'gpu');
  await new Promise((r) => setTimeout(r, 500));
  O.env.afterGpu = g.renderer.usingCpu ?? g.renderer.cpuRender;
  O.gpu = await runPass(false, 160);
  if (O.gpu.frames) {
    O.gpu.maxWhite = Math.max(...O.gpu.frames.map((f) => f.white));
    O.gpu.framesWithWhite = O.gpu.frames.filter((f) => f.white > 0).length;
    O.gpu.whiteBoxes = O.gpu.frames.filter((f) => f.white > 0).slice(0, 4).map((f) => ({ t: f.t, white: f.white, box: f.whiteBox }));
    O.gpu.headAtMax = O.gpu.frames.reduce((a, b) => (b.white > (a?.white ?? -1) ? b : a), null)?.head;
  }

  // ---- P3 旋转对拍（fixedUpdate 面）----
  {
    for (const q of g.entities.projectiles) q.dead = true;
    await new Promise((r) => setTimeout(r, 60));
    aim(p.cx + 260, p.cy - 4);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const h2 = g.entities.projectiles.find((q) => q.projId === 404);
    if (h2) {
      const seq = [];
      for (let t = 1; t <= 30; t++) {
        g.fixedUpdate(1 / 60);
        const expect = Math.atan2(p.cy - h2.cy, p.cx - h2.cx) - Math.PI / 2;
        seq.push({ t, rotDeg: +((h2.rotation * 180 / Math.PI)).toFixed(1), expectDeg: +((expect * 180 / Math.PI)).toFixed(1) });
      }
      O.P3 = { rotSeq: seq.slice(0, 8), matches: seq.every((s) => Math.abs(((s.rotDeg - s.expectDeg + 540) % 360) - 180) < 0.6) };
    } else O.P3 = 'relaunch-failed';
  }
  return O;
});

await page.screenshot({ path: '/tmp/bj367-flairon-gpu.png' });
console.log('BJ367_PROBE=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors));
await browser.close();

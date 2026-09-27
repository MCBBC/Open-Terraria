// ★BJ368 用户环境复现探针 v2——利刃台风 404 头弹白底/多层残影方块（acc/shim 链）
//  v2:①实例级 bound 补丁（绕 buildBound 缓存）+早期原型补丁 ②逐拍状态(头/玩家)
//  ③头部盒颜色直方图(白/中性亮色检出) ④真实 input 出球路径 ⑤DPR 双档
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj368-flairon-shim-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DPR = Number(process.env.SW_DPR ?? 1);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: DPR }, protocolTimeout: 300_000 });
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
  const O = { env: {} };
  const { options } = await import('/src/core/Options.ts');
  const { Renderer } = await import('/src/render/Renderer.ts');
  O.env.flags = { bgl: Renderer.bgl, bglShim: Renderer.bglShim, b2b: Renderer.b2b };
  O.env.renderModeDefault = options.data.renderMode;
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  O.env.cpuRender = g.renderer.usingCpu ?? g.renderer.cpuRender;
  await g.newWorld('bj368', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
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
  O.env.dpr = window.devicePixelRatio;
  // 清场:驱散敌对 NPC（防玩家被杀中断采样）;玩家给抗性
  try {
    const npcs = g.entities.npcs ?? [];
    for (const n of npcs) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  } catch (e) { O.env.npcClear = String(e); }

  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 300));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  O.env.scale = scale;

  // ---- shim draw 级日志面：原型先补 + 存活实例 bound 表重挂 ----
  const { GLShimExecutor } = await import('/src/render/glshim/GLShimExecutor.ts');
  const ex = GLShimExecutor.prototype;
  const shimLog = [];
  const shimCounters = { draw30x32: 0, drawTotal: 0, rasterizeDrawImage: 0, rasterizeFillRect: 0, rasterizeOp: 0 };
  const origProtoDraw = ex.drawImage;
  const makeWrapper = (self) => function (img, ...rest) {
    try {
      shimCounters.drawTotal++;
      const iw = img && img.width, ih = img && img.height;
      if (iw === 30 && ih === 32) {
        shimCounters.draw30x32++;
        const m = self.getTransform ? self.getTransform() : null;
        shimLog.push({ n: rest.length, rest: rest.map(Number),
          ga: +Number(self.globalAlpha).toFixed(3), gco: self.globalCompositeOperation, filter: self.filter,
          m: m ? [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +Number(v).toFixed(3)) : null });
      }
    } catch { /* zero-interfere */ }
    return origProtoDraw.call(self, img, ...rest);
  };
  if (!ex.__bj368Patched) {
    ex.__bj368Patched = true;
    for (const nm of ['rasterizeDrawImage', 'rasterizeFillRect', 'rasterizeOp']) {
      const orig = ex[nm];
      if (typeof orig === 'function') ex[nm] = function (...a) { shimCounters[nm]++; return orig.apply(this, a); };
    }
  }
  // 存活实例（bglEntShim 单例）:bound[prop] 优先查表——直接覆盖即接管
  const liveShim = g.renderer.bglEntShim;
  if (liveShim && liveShim.bound) {
    liveShim.bound.drawImage = makeWrapper(liveShim);
  }

  const off = document.createElement('canvas');
  off.width = 160; off.height = 160;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const sampleBox = (bx, by, bw, bh) => {
    octx.clearRect(0, 0, 160, 160);
    const w = Math.min(160, bw), h = Math.min(160, bh);
    if (w <= 0 || h <= 0) return null;
    octx.drawImage(canvas, bx, by, w, h, 0, 0, w, h);
    const d = octx.getImageData(0, 0, w, h).data;
    let white = 0, neutralBright = 0, teal = 0;
    let wx0 = 1e9, wy0 = 1e9, wx1 = -1, wy1 = -1;
    const buckets = new Map();
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r >= 245 && gg >= 245 && b >= 245) {
        white++;
        if (xx < wx0) wx0 = xx; if (xx > wx1) wx1 = xx;
        if (yy < wy0) wy0 = yy; if (yy > wy1) wy1 = yy;
      }
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx - mn < 18 && mn > 110) neutralBright++;
      if (Math.abs(r - 48) < 70 && Math.abs(gg - 248) < 70 && Math.abs(b - 171) < 70) teal++;
      if (yy < 8 && xx < 8) { const k = `${r >> 4},${gg >> 4},${b >> 4}`; buckets.set(k, (buckets.get(k) ?? 0) + 1); }
    }
    return { white, neutralBright, teal, whiteBox: white > 0 ? { x: wx0, y: wy0, w: wx1 - wx0 + 1, h: wy1 - wy0 + 1 } : null,
      corner: [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) };
  };

  const frames = [];
  const shots = [];
  // 真实 input 出球（BJ367 P3 同款）
  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };
  for (let rep = 0; rep < 3 && frames.length < 22; rep++) {
    for (const q of g.entities.projectiles) q.dead = true;
    await new Promise((r) => setTimeout(r, 60));
    aim(p.cx + 260, p.cy - 4);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    let head = g.entities.projectiles.find((q) => q.projId === 404);
    if (!head) { frames.push({ rep, fail: 'no-404-spawn' }); continue; }
    for (let t = 1; t <= 70; t++) {
      g.paused = false;
      g.fixedUpdate(1 / 60);
      head = g.entities.projectiles.find((q) => q.projId === 404);
      if (!head || head.dead) { frames.push({ rep, t, headDead: true, pDead: p.dead }); break; }
      const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
      const bx = Math.round(sx * scale - 70), by = Math.round(sy * scale - 70);
      if (t % 3 !== 0) continue;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const px = sampleBox(bx, by, 140, 140);
      frames.push({
        rep, t, st: head.st, alpha: head.alphaView,
        rotDeg: +((head.rotation * 180 / Math.PI) % 360).toFixed(1),
        hp: p.statLife, pDead: p.dead,
        path: g.renderer.bglPathUsed,
        ...px,
      });
      if (px && (px.white > 30 || px.neutralBright > 400)) {
        const c2 = document.createElement('canvas');
        c2.width = 140; c2.height = 140;
        c2.getContext('2d').drawImage(canvas, bx, by, 140, 140, 0, 0, 140, 140);
        shots.push({ t: `${rep}-${t}`, dataURL: c2.toDataURL('image/png'), rotDeg: frames[frames.length - 1].rotDeg });
      }
    }
  }
  O.engagement = {
    bglPathUsed: g.renderer.bglPathUsed,
    bglPathStats: { ...g.renderer.bglPathStats },
    shimStats: g.renderer.bglShimStats ? g.renderer.bglShimStats() : null,
    composePath: g.renderer.composePathUsed ?? null,
    liveShimPatched: !!(liveShim && liveShim.bound && liveShim.bound.drawImage),
  };
  O.shimCounters = shimCounters;
  O.draws30x32 = shimLog.slice(0, 20);
  O.draws30x32N = shimLog.length;
  O.frames = frames;
  O.maxWhite = frames.length ? Math.max(...frames.map((f) => f.white ?? 0)) : 0;
  O.maxNeutralBright = frames.length ? Math.max(...frames.map((f) => f.neutralBright ?? 0)) : 0;
  O.maxTeal = frames.length ? Math.max(...frames.map((f) => f.teal ?? 0)) : 0;
  O.shots = shots.map((s) => ({ t: s.t, rotDeg: s.rotDeg, len: s.dataURL.length }));
  O._shotData = shots;
  return O;
});

if (out && out._shotData && out._shotData.length) {
  const fs = await import('node:fs');
  for (const s of out._shotData) {
    fs.writeFileSync(`/tmp/bj368-head-${s.t}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
  }
}
await page.screenshot({ path: `/tmp/bj368-full-dpr${DPR}.png` });
const slim = { ...out, _shotData: undefined };
console.log('BJ368_PROBE=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();

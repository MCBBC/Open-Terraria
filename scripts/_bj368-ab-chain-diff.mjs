// ★BJ368 A/B 链对拍探针——404 头弹 2D 链(?bgl 关) vs acc/shim 链(缺省开) 逐帧盒像素 diff
//  白天场景（去光照干扰）;真实 input 出球;8 向瞄准轮转覆盖旋转角;盒像素哈希+diff
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj368-ab-chain-diff.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
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
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  O.env.cpuRender = g.renderer.usingCpu ?? g.renderer.cpuRender;
  await g.newWorld('bj368ab', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  try { g.world.clock.timeOfDay = 27000; } catch (e) { O.env.timeSet = String(e); }   // 白天

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
  try {
    for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  } catch { /* ignore */ }

  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 300));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  O.env.scale = scale;

  const off = document.createElement('canvas');
  off.width = 200; off.height = 200;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const grabBox = (bx, by, bw, bh) => {
    const w = Math.min(200, bw), h = Math.min(200, bh);
    octx.clearRect(0, 0, 200, 200);
    octx.drawImage(canvas, bx, by, w, h, 0, 0, w, h);
    return { w, h, data: octx.getImageData(0, 0, w, h).data };
  };
  const statBox = (px) => {
    let white = 0, neutralBright = 0, teal = 0;
    let wx0 = 1e9, wy0 = 1e9, wx1 = -1, wy1 = -1;
    const d = px.data;
    for (let yy = 0; yy < px.h; yy++) for (let xx = 0; xx < px.w; xx++) {
      const i = (yy * px.w + xx) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r >= 240 && gg >= 240 && b >= 240) {
        white++;
        if (xx < wx0) wx0 = xx; if (xx > wx1) wx1 = xx;
        if (yy < wy0) wy0 = yy; if (yy > wy1) wy1 = yy;
      }
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx - mn < 18 && mn > 150) neutralBright++;
      if (Math.abs(r - 48) < 70 && Math.abs(gg - 248) < 70 && Math.abs(b - 171) < 70) teal++;
    }
    return { white, neutralBright, teal, whiteBox: white > 0 ? { x: wx0, y: wy0, w: wx1 - wx0 + 1, h: wy1 - wy0 + 1 } : null };
  };

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  // 单程:一圈 8 向出球,每球最多 40 拍,每 2 拍采一帧
  const runPass = (tag) => {
    const frames = [];
    const DIRS = [[1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0], [-0.7, 0.7], [0, 1], [0.7, 0.7]];
    for (let d = 0; d < DIRS.length; d++) {
      for (const q of g.entities.projectiles) q.dead = true;
      g.fixedUpdate(1 / 60);
      const [ax, ay] = DIRS[d];
      aim(p.cx + ax * 260, p.cy + ay * 260 - 4);
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      let head = g.entities.projectiles.find((q) => q.projId === 404);
      if (!head) continue;
      for (let t = 1; t <= 40; t++) {
        g.paused = false;
        g.fixedUpdate(1 / 60);
        head = g.entities.projectiles.find((q) => q.projId === 404);
        if (!head || head.dead) break;
        if (t % 2 !== 0) continue;
        const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
        const bx = Math.round(sx * scale - 60), by = Math.round(sy * scale - 60);
        const px = grabBox(bx, by, 120, 120);
        const s2 = statBox(px);
        frames.push({
          d, t, rotDeg: +((head.rotation * 180 / Math.PI) % 360).toFixed(0),
          path: g.renderer.bglPathUsed,
          ...s2,
          _px: px,
        });
      }
    }
    return frames;
  };

  // ---- Pass A: 2D 链 ----
  Renderer.bglShimSetForTest(false);
  Renderer.b2bSetForTest(false);
  await new Promise((r) => setTimeout(r, 400));
  const framesA = runPass('2d');
  // ---- Pass B: shim 链（恢复缺省三旗）----
  Renderer.bglShimSetForTest(true);
  Renderer.b2bSetForTest(true);
  await new Promise((r) => setTimeout(r, 400));

  // shim 端 draw 钩（bound 表直挂——首 wrap 已发生,原型补丁无效）
  const { GLShimExecutor } = await import('/src/render/glshim/GLShimExecutor.ts');
  const liveShim = g.renderer.bglEntShim;
  const shimLog = [];
  if (liveShim && liveShim.bound) {
    const orig = liveShim.bound.drawImage;
    liveShim.bound.drawImage = function (img, ...rest) {
      try {
        if (img && img.width === 30 && img.height === 32) {
          const m = self_m();
          shimLog.push({ n: rest.length, ga: +Number(liveShim.ga).toFixed(3), gco: liveShim.gco,
            filter: liveShim.filterV, acc: liveShim.accMode,
            m: [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +Number(v).toFixed(3)) });
        }
      } catch { /* ignore */ }
      function self_m() { return { a: liveShim.m.a, b: liveShim.m.b, c: liveShim.m.c, d: liveShim.m.d, e: liveShim.m.e, f: liveShim.m.f }; }
      return orig.call(liveShim, img, ...rest);
    };
  }
  const framesB = runPass('shim');

  // 对齐 diff:按 (d,t) 键匹配
  const key = (f) => `${f.d}:${f.t}`;
  const mapA = new Map(framesA.map((f) => [key(f), f]));
  const diffs = [];
  let maxDiff = 0, worst = null;
  for (const fb of framesB) {
    const fa = mapA.get(key(fb));
    if (!fa || fa._px.w !== fb._px.w || fa._px.h !== fb._px.h) continue;
    let big = 0, sum = 0, n = fa._px.w * fa._px.h;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let i = 0; i < n * 4; i += 4) {
      const dd = Math.max(Math.abs(fa._px.data[i] - fb._px.data[i]),
        Math.abs(fa._px.data[i + 1] - fb._px.data[i + 1]),
        Math.abs(fa._px.data[i + 2] - fb._px.data[i + 2]));
      sum += dd;
      if (dd > 40) {
        big++;
        const xx = (i / 4) % fa._px.w, yy = Math.floor(i / 4 / fa._px.w);
        if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx;
        if (yy < by0) by0 = yy; if (yy > by1) by1 = yy;
      }
    }
    const rec = { k: key(fb), rotDeg: fb.rotDeg, mean: +(sum / n).toFixed(2), bigPx: big,
      bigBox: big > 0 ? { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } : null,
      shimWhite: fb.white, shimTeal: fb.teal, d2dWhite: fa.white, d2dTeal: fa.teal };
    diffs.push(rec);
    if (big > maxDiff) { maxDiff = big; worst = rec; }
  }
  O.env.pathA = framesA[0]?.path ?? null;
  O.env.pathB = framesB[0]?.path ?? null;
  O.engagement = { bglPathStats: { ...g.renderer.bglPathStats }, shimStats: g.renderer.bglShimStats ? g.renderer.bglShimStats() : null };
  O.counts = { framesA: framesA.length, framesB: framesB.length, diffs: diffs.length };
  O.worst = worst;
  O.topDiffs = [...diffs].sort((a, b) => b.bigPx - a.bigPx).slice(0, 10);
  O.shimDraws30x32 = shimLog.slice(0, 12);
  O.shimDraws30x32N = shimLog.length;
  // 白盒检出（两链各自）
  O.whiteA = framesA.filter((f) => f.white > 30).slice(0, 5).map((f) => ({ k: key(f), white: f.white, box: f.whiteBox }));
  O.whiteB = framesB.filter((f) => f.white > 30).slice(0, 5).map((f) => ({ k: key(f), white: f.white, box: f.whiteBox }));
  O.maxTealA = Math.max(...framesA.map((f) => f.teal), 0);
  O.maxTealB = Math.max(...framesB.map((f) => f.teal), 0);
  O.framesBsample = framesB.filter((_, i) => i % 5 === 0).slice(0, 8).map((f) => ({ k: key(f), rot: f.rotDeg, white: f.white, teal: f.teal, nb: f.neutralBright }));
  return O;
});

console.log('BJ368_AB=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();

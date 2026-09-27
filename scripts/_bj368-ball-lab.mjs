// ★BJ368 定点实验室——404 球钉位(位置/α/旋转受控)双链对拍+旋转扫掠
//  目的:先让球【可见】,再 2D vs shim 逐像素对拍;扫掠旋转角找白底/叠影触发面
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj368-ball-lab.mjs
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
  O.env.cpuRender = g.renderer.usingCpu;
  await g.newWorld('bj368lab', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;   // 正午
  // 落位:出生列地表
  let groundY = -1;
  const c0 = Math.trunc(p.x / 16);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 300));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;

  // 球钉位:玩家上空 120px
  const { FlaironHeadProj, flaironSpawnNudge } = await import('/src/entities/WeaponProj.ts');
  const sp = flaironSpawnNudge(-1, p.cx, p.cy, p.cx + 100, p.cy - 100);
  const head = new FlaironHeadProj(sp.x, sp.y, 0, 0, 30, 4.5);
  head.pinUse = () => {};
  head.spawnProj = () => {};
  const PIN = { wx: p.cx, wy: p.cy - 120 };
  g.entities.add(head, 'projectiles');

  // 每拍渲染前钉位（保证 AI 不挪球）;θ!=null 时绕玩家轨道角钉位——
  // AI rotation=atan2(p.cy-cy,p.cx-cx)-π/2,球在玩家下方 θ=0 → rotation=θ 自然成立
  let orbitDeg = null;
  const pin = () => {
    if (orbitDeg !== null) {
      const th = orbitDeg * Math.PI / 180;
      // 球在玩家 (sin,cos) 方向 R=120 处:vector46=玩家-球=-(R sinθ, R cosθ)
      // rotation=atan2(-R cosθ,-R sinθ)-π/2 = θ-π ... 直接枚举 8 邻域+精调见 orbit()
      // vector46=玩家-球=R·(−sinθ,cosθ) → rotation=atan2(R cosθ,−R sinθ)−π/2=θ
      // y 向下坐标系:θ=0 → 球在玩家正上方(此前实测 rot=0 同款)
      PIN.wx = p.cx + Math.sin(th) * 120;
      PIN.wy = p.cy - Math.cos(th) * 120;
    }
    head.x = PIN.wx - head.w / 2; head.y = PIN.wy - head.h / 2;
    head.vx = 0; head.vy = 0;
    head.alpha = 0; head.ai1 = 10; head.st = 0;
    head.handX = p.cx; head.handY = p.cy;
  };

  const boxCv = document.createElement('canvas');
  boxCv.width = 160; boxCv.height = 160;
  const bctx = boxCv.getContext('2d', { willReadFrequently: true });
  const grabAround = (wx, wy, half = 80) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const bx = Math.round(sx * scale) - half, by = Math.round(sy * scale) - half;
    bctx.clearRect(0, 0, 160, 160);
    bctx.drawImage(canvas, bx, by, 160, 160, 0, 0, 160, 160);
    return { bx, by, data: bctx.getImageData(0, 0, 160, 160).data };
  };
  const stat = (d) => {
    let white = 0, neutralBright = 0, teal = 0, tealDark = 0;
    let wx0 = 1e9, wy0 = 1e9, wx1 = -1, wy1 = -1;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r >= 240 && gg >= 240 && b >= 240) {
        white++;
        const xx = (i / 4) % 160, yy = Math.floor(i / 4 / 160);
        if (xx < wx0) wx0 = xx; if (xx > wx1) wx1 = xx;
        if (yy < wy0) wy0 = yy; if (yy > wy1) wy1 = yy;
      }
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx - mn < 18 && mn > 150) neutralBright++;
      if (Math.abs(r - 48) < 70 && Math.abs(gg - 248) < 70 && Math.abs(b - 171) < 70) teal++;
      if (Math.abs(r - 24) < 40 && Math.abs(gg - 124) < 60 && Math.abs(b - 85) < 50) tealDark++;
    }
    return { white, neutralBright, teal, tealDark, whiteBox: white > 0 ? { x: wx0, y: wy0, w: wx1 - wx0 + 1, h: wy1 - wy0 + 1 } : null };
  };

  // shim quad 级钩:quadSprite 挂 bound 不可行(GLSpriteLayer 实例在层内)——原型补丁+实例标记
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
  const quadLog = [];
  const glp = GLSpriteLayer.prototype;
  if (!glp.__bj368q) {
    glp.__bj368q = true;
    const oq = glp.quadSprite;
    glp.quadSprite = function (e, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
      try {
        if (e && e.w === 30 && e.h === 32) {
          quadLog.push({ sx, sy, sw, sh, dx: +dx.toFixed(1), dy: +dy.toFixed(1), dw: +dw.toFixed(1), dh: +dh.toFixed(1),
            rot: opts && opts.rot !== undefined ? +opts.rot.toFixed(4) : 0,
            alpha: opts && opts.alpha !== undefined ? +opts.alpha.toFixed(3) : 1,
            flipX: !!(opts && opts.flipX), flipY: !!(opts && opts.flipY), smooth: !!(opts && opts.smooth) });
        }
      } catch { /* ignore */ }
      return oq.call(this, e, sx, sy, sw, sh, dx, dy, dw, dh, opts);
    };
  }

  // 渲染一拍辅助（rotDeg!=null 时按轨道角钉位——AI fixedUpdate 内自然算出 rotation）
  let renderFrames = async (n = 3, rotDeg = null) => {
    orbitDeg = rotDeg;
    pin();
    for (let i = 0; i < n; i++) {
      g.paused = false;
      pin();                    // fixedUpdate 前钉位(本拍 AI 用上拍位算 rotation)
      g.fixedUpdate(1 / 60);
      pin();                    // fixedUpdate 后再钉(渲染位精确)
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
    }
  };

  // ---- Pass 1: 2D 链 基准（rot=0 与 rot 扫掠）----
  Renderer.bglShimSetForTest(false);
  Renderer.b2bSetForTest(false);
  await new Promise((r) => setTimeout(r, 400));
  await renderFrames(4);
  const base0 = grabAround(PIN.wx, PIN.wy);
  const sBase0 = stat(base0.data);
  const baseImgs = {};
  // rot 扫掠 24 档,记录每档盒
  const sweepA = [];
  for (let k = 0; k < 24; k++) {
    await renderFrames(2, k * 15);
    const px = grabAround(PIN.wx, PIN.wy);
    sweepA.push({ k, rotDeg: k * 15, ...stat(px.data) });
    if (k === 3 || k === 6 || k === 9) baseImgs[`a${k}`] = boxCv.toDataURL('image/png');
  }

  // ---- Pass 2: shim 链 ----
  Renderer.bglShimSetForTest(true);
  Renderer.b2bSetForTest(true);
  await new Promise((r) => setTimeout(r, 400));
  await renderFrames(4);
  const shim0 = grabAround(PIN.wx, PIN.wy);
  const sShim0 = stat(shim0.data);
  const sweepB = [];
  for (let k = 0; k < 24; k++) {
    await renderFrames(2, k * 15);
    const px = grabAround(PIN.wx, PIN.wy);
    sweepB.push({ k, rotDeg: k * 15, ...stat(px.data) });
    if (k === 3 || k === 6 || k === 9) baseImgs[`b${k}`] = boxCv.toDataURL('image/png');
  }

  // ---- diff 基准帧(rot=0) 与扫掠各档 ----
  const diffBoxes = (da, db) => {
    if (da.length !== db.length) return null;
    let big = 0, sum = 0;
    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let i = 0; i < da.length; i += 4) {
      const dd = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      sum += dd;
      if (dd > 40) {
        big++;
        const xx = (i / 4) % 160, yy = Math.floor(i / 4 / 160);
        if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx;
        if (yy < by0) by0 = yy; if (yy > by1) by1 = yy;
      }
    }
    return { mean: +(sum / (da.length / 4)).toFixed(2), bigPx: big, bigBox: big ? { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } : null };
  };
  const rotDiff = [];
  for (let k = 0; k < 24; k++) {
    Renderer.bglShimSetForTest(false); Renderer.b2bSetForTest(false);
    await renderFrames(2, k * 15);
    const pa = grabAround(PIN.wx, PIN.wy);
    Renderer.bglShimSetForTest(true); Renderer.b2bSetForTest(true);
    await renderFrames(2, k * 15);
    const pb = grabAround(PIN.wx, PIN.wy);
    rotDiff.push({ k, rotDeg: k * 15, ...diffBoxes(pa.data, pb.data) });
  }

  // ---- Pass 3: filter 强制面——shim filterV='brightness(1.5)' → 球走 rasterizeDrawImage
  //      （用户嫌疑#1:栅格化路径对旋转 404 的语义）;2D 对照同 filter。
  //      同时挂 quadLog 观测 scratch 面。----
  const filterProbe = [];
  const fImgs = {};
  for (const filt of ['brightness(1.5)', 'brightness(0.5)']) {
    Renderer.bglShimSetForTest(true); Renderer.b2bSetForTest(true);
    await new Promise((r) => setTimeout(r, 300));
    const shimInst = g.renderer.bglEntShim;
    if (!shimInst) { filterProbe.push({ filt, fail: 'no-shim' }); continue; }
    // 每帧渲染前把镜像 filterV 置非 none（attachAcc 会复位——须逐帧钉）
    const origRenderFrames = renderFrames;
    const renderFramesF = async (n, rotDeg) => {
      orbitDeg = rotDeg;
      pin();
      for (let i = 0; i < n; i++) {
        g.paused = false;
        pin();
        shimInst.filterV = filt;           // 钉非 none（球走 rasterizeDrawImage）
        g.fixedUpdate(1 / 60);
        pin();
        shimInst.filterV = filt;
        await new Promise((r2) => requestAnimationFrame(r2));
        await new Promise((r2) => requestAnimationFrame(r2));
      }
    };
    // shim 侧采样
    const shimSamples = [];
    for (let k = 0; k < 8; k++) {
      await renderFramesF(2, k * 45);
      const px = grabAround(PIN.wx, PIN.wy);
      shimSamples.push({ k, rotDeg: k * 45, ...stat(px.data) });
      if (k === 1) fImgs[`f_${filt.startsWith('brightness(1.5') ? 'up' : 'down'}`] = boxCv.toDataURL('image/png');
    }
    // 2D 侧对照（同 filter——直绘 ctx.filter）
    Renderer.bglShimSetForTest(false); Renderer.b2bSetForTest(false);
    await new Promise((r) => setTimeout(r, 300));
    const d2dSamples = [];
    for (let k = 0; k < 8; k++) {
      orbitDeg = k * 45; pin();
      for (let i = 0; i < 2; i++) {
        g.paused = false;
        pin();
        g.renderer.ctx.filter = filt;      // 真 2D 面同滤镜
        g.fixedUpdate(1 / 60);
        pin();
        g.renderer.ctx.filter = filt;
        await new Promise((r2) => requestAnimationFrame(r2));
        await new Promise((r2) => requestAnimationFrame(r2));
      }
      const px = grabAround(PIN.wx, PIN.wy);
      d2dSamples.push({ k, rotDeg: k * 45, ...stat(px.data) });
      if (k === 1) fImgs[`d_${filt.startsWith('brightness(1.5') ? 'up' : 'down'}`] = boxCv.toDataURL('image/png');
    }
    filterProbe.push({ filt, shim: shimSamples, d2d: d2dSamples });
    renderFrames = origRenderFrames;
  }
  // ---- Pass 4: renderScale K 档（世界层低清——用户长会话自动降档形态）----
  const rsProbe = [];
  for (const rs of [0.75, 0.66, 0.5]) {
    options.set('renderScale', rs);
    await new Promise((r) => setTimeout(r, 400));
    const rec = { rs, rot: [] };
    for (let k = 0; k < 8; k++) {
      await renderFrames(2, k * 45);
      const px = grabAround(PIN.wx, PIN.wy);
      rec.rot.push({ rotDeg: k * 45, ...stat(px.data) });
    }
    rsProbe.push(rec);
    if (rs === 0.75) O._rsimg = boxCv.toDataURL('image/png');
  }
  options.set('renderScale', 1);
  await new Promise((r) => setTimeout(r, 400));
  O.rsProbe = rsProbe;
  O.filterProbe = filterProbe;
  O._fimgs = fImgs;
  O.env.pathNow = g.renderer.bglPathUsed;
  O.sBase0 = sBase0;
  O.sShim0 = sShim0;
  O.diff0 = diffBoxes(base0.data, shim0.data);
  O.sweepA = sweepA;
  O.sweepB = sweepB;
  O.rotDiff = rotDiff;
  O.worstRotDiff = [...rotDiff].sort((a, b) => (b.bigPx || 0) - (a.bigPx || 0))[0] ?? null;
  O.quadLog = quadLog.slice(0, 30);
  O.quadLogN = quadLog.length;
  O.lightAtBall = (() => {
    try {
      const lt = g.renderer.lighting;
      const [r, gg, b] = lt.lightAt(Math.floor(PIN.wx / 16), Math.floor(PIN.wy / 16));
      return [Math.round(r), Math.round(gg), Math.round(b)];
    } catch (e) { return String(e); }
  })();
  O._imgs = baseImgs;
  return O;
});

if (out && out._imgs) {
  const fs = await import('node:fs');
  for (const [k, v] of Object.entries(out._imgs)) {
    if (typeof v === 'string') fs.writeFileSync(`/tmp/bj368-lab-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  }
}
if (out && out._rsimg) {
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/bj368-rs075.png', Buffer.from(out._rsimg.split(',')[1], 'base64'));
}
if (out && out._fimgs) {
  const fs = await import('node:fs');
  for (const [k, v] of Object.entries(out._fimgs)) {
    if (typeof v === 'string') fs.writeFileSync(`/tmp/bj368-filt-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  }
}
const slim = { ...out, _imgs: undefined, _fimgs: undefined, _rsimg: undefined };
console.log('BJ368_LAB=' + JSON.stringify(slim, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();

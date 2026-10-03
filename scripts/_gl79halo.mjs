// _gl79halo.mjs — 彩虹魔杖(495)引导期光标星形闪光 黑晕 A/B 像素对拍探针 v2
// （GL 复发案定谳用;只读不修）。
// v2:读【可见合成面】(glCanvas+HUD over 折叠)而非主画布;模块 import 不带 ?t=
// （拿游戏同实例,包装才生效）;并案落叶 A/B（清 leaves 前后同区域对拍）。
// 判据：加算/SO 合成正确时星只增亮;差分 dA=lumA-lumB 中 dA<=-8 像素=黑晕签名。
import {
  launchBrowser, openPage, bootstrap, createGame, pump, giveItems,
  saveCanvasShot, resolveShotPath, saveJson, freezeClock, clockInfo,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const TAG = process.env.SW79_TAG ?? 'gl';
const Q = process.env.SW79_Q ?? '';
const browser = await launchBrowser({});
const errors = [];
try {
  const page = await openPage(browser, { errors });
  if (Q) await page.goto(ORIGIN + '/?' + Q.replace(/^[&?]/, ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log('BOOT-FAIL', boot.why, JSON.stringify(errors.slice(0, 8))); throw new Error('bootstrap fail'); }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) throw new Error('createGame fail: ' + (gen.why ?? ''));
  const gv = await giveItems(page, [{ vid: 495, slot: 0 }], { wipe: true, select: 0 });
  if (!gv.ok) console.log('GIVE-FAIL', JSON.stringify(gv.failed ?? gv));
  await pump(page, 6, {});
  // 正午日光（黑晕只在亮背景可显）+ 冻结（A/B 帧间钟面不漂）
  const frz = await freezeClock(page, { tod: 0.5 });
  const ci = await clockInfo(page);
  console.log('CLOCK', JSON.stringify({ frz, isDay: ci.isDay, tod: ci.tod }));

  const res = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__swGame;
    if (!g) return { fail: 'no-game' };
    g.paused = false;
    const out = {};

    // ---- 仪表：MagicMissileProj 绘制链（同实例包装） + Renderer 全亮队列 ----
    try {
      const MM = await import('/src/entities/MissileProj.ts');
      const proto = MM.MagicMissileProj.prototype;
      if (!proto.__79wrapped) {
        const od = proto.draw, oh = proto.draw79Head;
        const mm = { draw: 0, head: 0, headQueue: 0, headDirect: 0 };
        window.__mm79 = mm;
        proto.draw = function (r, cam) { mm.draw++; return od.call(this, r, cam); };
        proto.draw79Head = function (ctx, renderer) {
          mm.head++;
          if (renderer && typeof renderer.queueProjFullbright === 'function') mm.headQueue++;
          else mm.headDirect++;
          return oh.call(this, ctx, renderer);
        };
        proto.__79wrapped = true;
      }
    } catch (e) { out.mmWrapErr = String(e); }
    const R = Object.getPrototypeOf(g.renderer);
    if (!R.__79qwrapped) {
      const oq = R.queueProjFullbright, ofts = R.flushTrailShade;
      R.queueProjFullbright = function (fn) { if (window.__mm79) window.__mm79.queuePush = (window.__mm79.queuePush ?? 0) + 1; return oq.call(this, fn); };
      R.flushTrailShade = function (...a) {
        const n = this.projFullbrightQueue.length;
        if (window.__mm79) { window.__mm79.flushWithQ = (window.__mm79.flushWithQ ?? 0) + (n > 0 ? 1 : 0); window.__mm79.flushedHeads = (window.__mm79.flushedHeads ?? 0) + n; }
        return ofts.apply(this, a);
      };
      R.__79qwrapped = true;
    }

    // ---- face 旗 ----
    const F = () => ({
      accMode: g.renderer._accMode,
      bglPathUsed: g.renderer.bglPathUsed,
      sfxPathUsed: g.renderer.sfxPathUsed,
      c10e: g.renderer.constructor.c10e,
      c10eK1: g.renderer.constructor.c10eK1,
      bgl: g.renderer.constructor.bgl,
      bglShim: g.renderer.constructor.bglShim,
      b2b: g.renderer.constructor.b2b,
      cloudPipe: g.renderer.constructor.cloudPipe,
      cpuRender: g.renderer.isCpuRender?.() ?? null,
      farDeferGate: g.renderer.sky?.farDeferGate,
      trailGLfx: !!g.renderer.glfx,
      filters: g.renderer.monoFilters ? { anyInUse: g.renderer.monoFilters.anyInUse, heat: g.renderer.monoFilters.heatInUse } : null,
    });
    out.face = F();

    // ---- 魔力拉满 + 静置 + 鼠标天空 ----
    const p = g.player;
    for (const k of ['maxMana', 'statManaMax', 'statManaMax2']) { try { p[k] = 600; } catch { /* 缺字段 */ } }
    try { p.statMana = 600; } catch { /* 缺字段 */ }
    p.vx = 0; p.vy = 0;
    await wait(400);
    const cv = g.renderer.canvas;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    // 可见合成面 = [sky2D(若有)] → glCanvas → HUD(主画布,透明) over —— DOM 同序同式
    const allCv = [...document.querySelectorAll('#game-root canvas')];
    const glCv = document.querySelector('#sw-c10e-glcanvas');
    const belowGl = glCv ? allCv.filter((c) => c.compareDocumentPosition(glCv) & Node.DOCUMENT_POSITION_FOLLOWING && c.width > 100 && c !== glCv) : [];
    out.canvasInfo = { hudW: cv.width, glFound: !!glCv, glW: glCv?.width ?? 0, dpr, rectW: rect.width, canvasCount: allCv.length, belowGl: belowGl.map((c) => [c.width, c.height]) };
    const comp = document.createElement('canvas');
    comp.width = cv.width; comp.height = cv.height;
    const cc = comp.getContext('2d', { willReadFrequently: true });
    const readComp = (x, y, S) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.clearRect(0, 0, comp.width, comp.height);
      for (const c of belowGl) if (c.width > 0 && c.height > 0) cc.drawImage(c, 0, 0);
      if (glCv && glCv.width > 0 && glCv.height > 0) cc.drawImage(glCv, 0, 0);
      if (cv.width > 0 && cv.height > 0) cc.drawImage(cv, 0, 0);
      const d = cc.getImageData(x, y, S, S);
      return d.data;
    };
    const readHudOnly = (x, y, S) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.clearRect(0, 0, comp.width, comp.height);
      cc.drawImage(cv, 0, 0);
      return cc.getImageData(x, y, S, S).data;
    };

    const mX0 = Math.round(rect.width * 0.72), mY0 = Math.round(rect.height * 0.22);
    // ---- 星窗自动选址：全屏扫 320×320 窗,取「纯天空」窗（4 阶降采样亮度
    //  p5 ≥ mean−22 = 窗内无深色内容）——树冠/地形污染窗一律避开 ----
    let mX = mX0, mY = mY0;
    {
      const glCv0 = document.querySelector('#sw-c10e-glcanvas');
      const probeC = document.createElement('canvas');
      probeC.width = cv.width; probeC.height = cv.height;
      const pc = probeC.getContext('2d', { willReadFrequently: true });
      if (glCv0 && glCv0.width > 0) pc.drawImage(glCv0, 0, 0);
      pc.drawImage(cv, 0, 0);
      const W = cv.width, H = cv.height;
      const full = pc.getImageData(0, 0, W, H).data;
      const lAll = (x, y) => { const o = (y * W + x) * 4; return 0.299 * full[o] + 0.587 * full[o + 1] + 0.114 * full[o + 2]; };
      let best = -1, bestScore = -1;
      for (let wy = 240; wy + 160 <= H - 200; wy += 30) {
        for (let wx = 180; wx + 160 <= W - 240; wx += 30) {
          const lums = [];
          for (let y = wy - 160 + 4; y < wy + 160; y += 12) for (let x = wx - 160 + 4; x < wx + 160; x += 12) lums.push(lAll(x, y));
          lums.sort((a, b) => a - b);
          const mean = lums.reduce((p, c) => p + c, 0) / lums.length;
          const p5 = lums[Math.floor(lums.length * 0.05)];
          const score = Math.min(mean - 130, 60) + Math.min(p5 - mean + 22, 0) * 40;   // 亮且无暗内容
          if (mean > 118 && p5 > mean - 26 && score > bestScore) { bestScore = score; best = [wx, wy]; }
        }
      }
      if (best) { mX = Math.round(best[0] / dpr); mY = Math.round(best[1] / dpr); }
      out.starWindow = { chosen: best ? [best[0], best[1]] : null, fallback: !best };
    }
    const inp = g.input;
    inp.mouseX = mX; inp.mouseY = mY;
    inp.mouseHeld = true; inp.mouseDown = true;
    out.mouse = { mX, mY };

    // ---- 引导 170t + 渲染帧 ----
    for (let i = 0; i < 34; i++) { for (let k = 0; k < 5; k++) g.fixedUpdate(1 / 60); await wait(0); }
    await wait(500);
    const p79 = (g.entities.projectiles ?? []).find((q) => q.projId === 79 && !q.dead);
    out.starCount = (g.entities.projectiles ?? []).filter((q) => q.projId === 79 && !q.dead).length;
    if (!p79) {
      inp.mouseHeld = false; inp.mouseDown = false;
      return { fail: 'no-79', invHeld: g.player.inv?.heldItem?.() ?? null, face: out.face };
    }
    const [swx, swy] = g.camera.worldToScreen(p79.cx, p79.cy);
    out.starScreen = { x: Math.round(swx), y: Math.round(swy), cx: p79.cx, cy: p79.cy, strip: p79.strip?.length ?? 0 };
    out.mmAfterChannel = { ...window.__mm79 };

    // ---- 星帧单帧测量（判据：加算永不暗于行背景）----
    //  A/B 双帧法受相机微移/摇树噪声污染（fix3 定谳）。改单帧行背景法：
    //  天空横向均匀,每行以左右边距带估背景,星区内暗于背景>7 的像素=
    //  「加算面出现暗于天空的内容」=黑晕签名（拖尾带/头部软边一并覆盖）。
    const S = 320;
    const px = Math.round(swx * dpr) - 160, py = Math.round(swy * dpr) - 160;
    const dA = readComp(px, py, S);
    const lum = (o) => 0.299 * dA[o] + 0.587 * dA[o + 1] + 0.114 * dA[o + 2];
    const M = 22;                                    // 行背景边距带宽
    const bgOfRow = (y) => {
      let n = 0, s = 0;
      for (let x = 2; x < M; x++) { s += lum((y * S + x) * 4); n++; }
      for (let x = S - M; x < S - 2; x++) { s += lum((y * S + x) * 4); n++; }
      return s / Math.max(1, n);
    };
    let dark = 0, darkSum = 0, coreDark = 0, rowsValid = 0, rowsSkip = 0;
    const darkPts = [];
    for (let y = 2; y < S - 2; y++) {
      // 行有效性：左右边距带须均匀（sd≤6,纯天空）——摇树/地形行跳过
      const m1 = [], m2 = [];
      for (let x = 2; x < M; x++) m1.push(lum((y * S + x) * 4));
      for (let x = S - M; x < S - 2; x++) m2.push(lum((y * S + x) * 4));
      const sd = (a) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) * (c - m), 0) / a.length); };
      const bg = (m1.reduce((p, c) => p + c, 0) + m2.reduce((p, c) => p + c, 0)) / (m1.length + m2.length);
      if (sd(m1) > 6 || sd(m2) > 6) { rowsSkip++; continue; }
      rowsValid++;
      for (let x = M; x < S - M; x++) {
        const d = lum((y * S + x) * 4) - bg;
        if (d <= -7) {
          dark++; darkSum += d;
          const r = Math.hypot(x - 160, y - 160);
          if (r < 60) coreDark++;
          if (darkPts.length < 3000) darkPts.push([x, y, Math.round(d)]);
        }
      }
    }
    out.starSingle = { dark, darkAvg: dark ? +(darkSum / dark).toFixed(1) : 0, coreDark, rowsValid, rowsSkip, darkPts };

    // ---- B 帧（对照,运动噪声仍在但供参考）：清星/带 → 读回 ----
    inp.mouseHeld = false; inp.mouseDown = false;
    for (const q of (g.entities.projectiles ?? [])) if (q.projId === 79) { q.dead = true; }
    g.renderer.projFullbrightQueue.length = 0;
    g.renderer.trailShadeQueue.length = 0;
    if (g.renderer.glfx) g.renderer.glfx.trailDirty = false;
    await wait(800);
    const dB = readComp(px, py, S);
    const diffStats = (dA2, dB2) => {
      let dark2 = 0, bright = 0, darkSum2 = 0, brightSum = 0;
      const darkPx = [];
      const n = S * S;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const la = 0.299 * dA2[o] + 0.587 * dA2[o + 1] + 0.114 * dA2[o + 2];
        const lb = 0.299 * dB2[o] + 0.587 * dB2[o + 1] + 0.114 * dB2[o + 2];
        const d = la - lb;
        if (d <= -8) { dark2++; darkSum2 += d; if (darkPx.length < 5000) darkPx.push([i % S, (i / S) | 0, Math.round(d)]); }
        else if (d >= 8) { bright++; brightSum += d; }
      }
      const rings = [0, 0, 0, 0, 0];
      for (const [x, y] of darkPx) {
        const r = Math.hypot(x - 160, y - 160);
        rings[r < 10 ? 0 : r < 20 ? 1 : r < 34 ? 2 : r < 80 ? 3 : 4]++;
      }
      return { dark: dark2, bright, darkAvg: dark2 ? +(darkSum2 / dark2).toFixed(1) : 0, brightAvg: bright ? +(brightSum / bright).toFixed(1) : 0, rings, darkPx };
    };
    out.diffComp = diffStats(dA, dB);

    // ---- 并案：落叶定谳（单帧超出量法）——叶=世界层 SO,本体暗于天空=正确;
    //  判据=【精灵足迹(+4px 漂移吸收)之外】的行背景超出暗像素（黑晕环）。
    //  叶 update 会覆写 v（圆弧相位）,冻结无效 → 漂移由足迹膨胀吸收。
    let leafOut = null;
    try {
      const NP = await import('/src/render/NatureParticles.ts');
      const np = NP.natureParticles;
      np.leaves.length = 0;                       // 清天然叶
      g.renderer.atlas.ensureVImage('vanilla/Gore_910.png');
      await wait(700);                            // 图集异步装载窗
      const LS = 160;
      const lx0 = Math.round(swx * dpr) + 90, ly0 = Math.round(swy * dpr) - 40;   // 星右侧独立天区
      const [wxL, wyL] = g.camera.screenToWorld(lx0 + 50, ly0 + 70);
      np.spawnLeaf(wxL, wyL, 910, 0);
      const lf = np.leaves[np.leaves.length - 1];
      if (lf) { lf.alpha = 0; lf.row = 0; lf.scale = 1.2; }
      for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
      await wait(120);                            // 一两渲染帧（漂移 ≤3px）
      const lA = readComp(lx0, ly0, LS);
      const feet = np.leaves.map((l) => {
        const [sx2, sy2] = g.camera.worldToScreen(l.x, l.y);
        return { x: Math.round(sx2 * dpr) - lx0, y: Math.round(sy2 * dpr) - ly0, w: Math.ceil(12 * l.scale * dpr), h: Math.ceil(14 * l.scale * dpr) };
      });
      const lN = np.leaves.length;
      const M2 = 22;
      const llum = (x, y) => { const o = (y * LS + x) * 4; return 0.299 * lA[o] + 0.587 * lA[o + 1] + 0.114 * lA[o + 2]; };
      let body = 0, halo = 0, haloSum = 0;
      const inFoot = (x, y) => feet.some((f) => x >= f.x - 5 && x < f.x + f.w + 5 && y >= f.y - 5 && y < f.y + f.h + 5);
      for (let y = 2; y < LS - 2; y++) {
        const m1 = [], m2 = [];
        for (let x = 2; x < M2; x++) m1.push(llum(x, y));
        for (let x = LS - M2; x < LS - 2; x++) m2.push(llum(x, y));
        const sd = (a) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) * (c - m), 0) / a.length); };
        if (sd(m1) > 6 || sd(m2) > 6) continue;
        const bg = (m1.reduce((p, c) => p + c, 0) + m2.reduce((p, c) => p + c, 0)) / (m1.length + m2.length);
        for (let x = M2; x < LS - M2; x++) {
          const d = llum(x, y) - bg;
          if (d <= -7) { if (inFoot(x, y)) body++; else { halo++; haloSum += d; } }
        }
      }
      leafOut = { leavesAtScan: lN, body, halo, haloAvg: halo ? +(haloSum / halo).toFixed(1) : 0, feet, note: 'halo=足迹(+5px)外行背景超出暗像素(黑晕);body=叶本体(正确 SO)' };
    } catch (e) { leafOut = { err: String(e) }; }
    out.leaf = leafOut;

    out.faceAfter = F();
    out.mmFinal = { ...window.__mm79 };
    out.A = Array.from(dA);
    out.B = Array.from(dB);
    return out;
  });

  if (res.fail) {
    console.log('PROBE-FAIL', JSON.stringify({ ...res, A: undefined, B: undefined }));
  } else {
    const { A, B, ...rest } = res;
    console.log('RESULT', JSON.stringify(rest));
    saveJson(`/tmp/probe-out/gl79/${TAG}-ab.json`, { A, B });
    await saveCanvasShot(page, resolveShotPath(`gl79/${TAG}-final.png`));
  }
} catch (e) {
  console.log('ERR', String(e && e.message || e).slice(0, 400));
} finally {
  await browser.close().catch(() => {});
}

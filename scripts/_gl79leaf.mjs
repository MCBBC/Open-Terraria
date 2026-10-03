// _gl79leaf.mjs — 落叶并案定谳探针（彩虹杖黑晕案的协同并案）
// ① 单帧行背景超出量法：叶=世界层 SO,本体暗于天空=正确;足迹(+5px)外的
//    行背景超出暗像素=黑晕签名。叶盒先经纯天空窗校验（p5 ≥ mean−26）。
// ② 双面对拍：GL face（acc/shim 链）vs ?bgl=0（worldCanvas 2D 直绘）同一
//    静态叶的裁剪颜色直方图对比——shim SO 预乘错位会整体移动直方图。
import {
  launchBrowser, openPage, bootstrap, createGame, pump, giveItems,
  freezeClock, saveJson,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const TAG = process.env.SWL_TAG ?? 'leaf';
const Q = process.env.SW79_Q ?? '';
const browser = await launchBrowser({});
const errors = [];
try {
  const page = await openPage(browser, { errors });
  if (Q) {
    await page.goto(ORIGIN + '/?' + Q.replace(/^[&?]/, ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
    // ★SW 模块陈旧缓存清扫（zenith 探针同款;带参页面 bootstrap 的 t= 变体会撞
    //  cache-first 旧 bundle=boot 桥不上）——先注销 SW+清 CacheStorage 再引导
    await page.evaluate(async () => {
      try {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
        const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(regs.map((r) => r.unregister()));
      } catch { /* no-op */ }
    });
    await page.goto(ORIGIN + '/?' + Q.replace(/^[&?]/, ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
  const boot = await bootstrap(page, ORIGIN, { clean: !Q });
  if (!boot.ok) { console.log('BOOT-FAIL', boot.why); throw new Error('bootstrap'); }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) throw new Error('createGame');
  await giveItems(page, [{ vid: 495, slot: 0 }], { wipe: true, select: 0 });
  await pump(page, 6, {});
  await freezeClock(page, { tod: 0.5 });

  const res = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__swGame;
    g.paused = false;
    const p = g.player; p.vx = 0; p.vy = 0;
    try { p.maxMana = 600; p.statManaMax = 600; p.statManaMax2 = 600; p.statMana = 600; } catch { /* 缺字段 */ }
    await wait(500);
    const cv = g.renderer.canvas;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    const glCv = document.querySelector('#sw-c10e-glcanvas');
    const comp = document.createElement('canvas');
    comp.width = cv.width; comp.height = cv.height;
    const cc = comp.getContext('2d', { willReadFrequently: true });
    const readComp = (x, y, S) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.clearRect(0, 0, comp.width, comp.height);
      if (glCv && glCv.width > 0 && glCv.height > 0) cc.drawImage(glCv, 0, 0);
      cc.drawImage(cv, 0, 0);
      return cc.getImageData(x, y, S, S).data;
    };
    // ---- 纯天空窗选址（与星窗同判据） ----
    const probeC = document.createElement('canvas');
    probeC.width = cv.width; probeC.height = cv.height;
    const pc = probeC.getContext('2d', { willReadFrequently: true });
    if (glCv && glCv.width > 0 && glCv.height > 0) pc.drawImage(glCv, 0, 0);
    pc.drawImage(cv, 0, 0);
    const W = cv.width, H = cv.height;
    const full = pc.getImageData(0, 0, W, H).data;
    const lAll = (x, y) => { const o = (y * W + x) * 4; return 0.299 * full[o] + 0.587 * full[o + 1] + 0.114 * full[o + 2]; };
    let best = null, bestScore = -1e9;
    for (let wy = 240; wy + 100 <= H - 200; wy += 24) {
      for (let wx = 180; wx + 100 <= W - 240; wx += 24) {
        const lums = [];
        for (let y = wy + 2; y < wy + 98; y += 8) for (let x = wx + 2; x < wx + 98; x += 8) lums.push(lAll(x, y));
        lums.sort((a, b) => a - b);
        const mean = lums.reduce((p, c) => p + c, 0) / lums.length;
        const p5 = lums[Math.floor(lums.length * 0.05)];
        if (mean > 118 && p5 > mean - 26) {
          const score = mean - p5;
          if (score > bestScore) { bestScore = score; best = [wx, wy]; }
        }
      }
    }
    if (!best) return { fail: 'no-sky-window' };
    const LS = 100;
    const lx0 = best[0], ly0 = best[1];

    // ---- 静态叶（row0 帧,满 alpha;update 会覆写 v → 漂移 ≤3px 由足迹膨胀吸收） ----
    const NP = await import('/src/render/NatureParticles.ts');
    const np = NP.natureParticles;
    np.leaves.length = 0;
    g.renderer.atlas.ensureVImage('vanilla/Gore_910.png');
    await wait(700);
    const [wxL, wyL] = g.camera.screenToWorld(lx0 + 50, ly0 + 50);
    np.spawnLeaf(wxL, wyL, 910, 0);
    const lf = np.leaves[np.leaves.length - 1];
    if (lf) { lf.alpha = 0; lf.row = 0; lf.scale = 1.2; }
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    await wait(150);
    const dA = readComp(lx0, ly0, LS);
    const feet = np.leaves.map((l) => {
      const [sx2, sy2] = g.camera.worldToScreen(l.x, l.y);
      return { x: Math.round(sx2 * dpr) - lx0, y: Math.round(sy2 * dpr) - ly0, w: Math.ceil(12 * l.scale * dpr), h: Math.ceil(14 * l.scale * dpr) };
    });
    const lAlive = np.leaves.length;
    const bodyPx = (() => {
      let n = 0;
      for (const f of feet) {
        for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
          const o = (y * LS + x) * 4;
          if (dA[o + 1] > dA[o] + 8 && dA[o + 1] > 40) n++;   // 绿色占优=叶本体
        }
      }
      return n;
    })();

    // ---- 行背景超出量扫描（足迹+5px 外） ----
    const llum = (x, y) => { const o = (y * LS + x) * 4; return 0.299 * dA[o] + 0.587 * dA[o + 1] + 0.114 * dA[o + 2]; };
    const inFoot = (x, y) => feet.some((f) => x >= f.x - 5 && x < f.x + f.w + 5 && y >= f.y - 5 && y < f.y + f.h + 5);
    let halo = 0, haloSum = 0, body = 0, rowsValid = 0;
    const M = 20;
    for (let y = 2; y < LS - 2; y++) {
      const m1 = [], m2 = [];
      for (let x = 2; x < M; x++) m1.push(llum(x, y));
      for (let x = LS - M; x < LS - 2; x++) m2.push(llum(x, y));
      const sd = (a) => { const m = a.reduce((p, c) => p + c, 0) / a.length; return Math.sqrt(a.reduce((p, c) => p + (c - m) * (c - m), 0) / a.length); };
      if (sd(m1) > 6 || sd(m2) > 6) continue;
      rowsValid++;
      const bg = (m1.reduce((p, c) => p + c, 0) + m2.reduce((p, c) => p + c, 0)) / (m1.length + m2.length);
      for (let x = M; x < LS - M; x++) {
        const d = llum(x, y) - bg;
        if (d <= -7) { if (inFoot(x, y)) body++; else { halo++; haloSum += d; } }
      }
    }
    // ---- 叶本体颜色直方图（双面对拍数据面;RGB 各 32 桶） ----
    const hist = new Array(32).fill(0);
    for (const f of feet) {
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const o = (y * LS + x) * 4;
        const l = (0.299 * dA[o] + 0.587 * dA[o + 1] + 0.114 * dA[o + 2]) | 0;
        hist[Math.min(31, l >> 3)]++;
      }
    }
    np.leaves.length = 0;
    return {
      window: best, lAlive, feet, bodyPx, halo, haloAvg: halo ? +(haloSum / halo).toFixed(1) : 0,
      body, rowsValid, hist,
      face: { bgl: g.renderer.constructor.bgl, acc: g.renderer._accMode, path: g.renderer.bglPathUsed },
    };
  });
  console.log('RESULT', JSON.stringify(res));
  saveJson(`/tmp/probe-out/gl79/${TAG}-leaf.json`, res);
} catch (e) {
  console.log('ERR', String(e && e.message || e).slice(0, 300));
} finally {
  await browser.close().catch(() => {});
}

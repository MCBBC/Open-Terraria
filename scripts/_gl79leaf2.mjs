// _gl79leaf2.mjs — 落叶光照染色定谳：lightAt(叶格) + 叶纹理帧均亮 vs 渲染裁剪均亮
// （GL face vs ?bgl=0 face 双跑,外部对拍）。若 lightAt 恒全亮且裁剪均亮≈纹理帧均亮
// → 叶渲染无病（用户所见=叶本体暗于亮天空的正确 SO 形态/vanilla 光照染色）。
import {
  launchBrowser, openPage, bootstrap, createGame, pump, giveItems,
  freezeClock,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const TAG = process.env.SWL_TAG ?? 'leaf2';
const Q = process.env.SW79_Q ?? '';
const browser = await launchBrowser({});
const errors = [];
try {
  const page = await openPage(browser, { errors });
  if (Q) {
    await page.goto(ORIGIN + '/?' + Q.replace(/^[&?]/, ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
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
  await pump(page, 6, {});
  await freezeClock(page, { tod: 0.5 });

  const res = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__swGame;
    g.paused = false;
    const p = g.player; p.vx = 0; p.vy = 0;
    await wait(500);
    const cv = g.renderer.canvas;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    // 纯天空窗（屏中上部固定扫一块)
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
    // 选窗
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
    const LS = 100, lx0 = best[0], ly0 = best[1];

    const NP = await import('/src/render/NatureParticles.ts');
    const np = NP.natureParticles;
    np.leaves.length = 0;
    g.renderer.atlas.ensureVImage('vanilla/Gore_910.png');
    await wait(700);
    const img = g.renderer.atlas.ensureVImage('vanilla/Gore_910.png');
    // 叶纹理 row0/col0 帧均亮（帧 12×14）
    const texC = document.createElement('canvas');
    texC.width = img.width; texC.height = img.height;
    const tcc = texC.getContext('2d', { willReadFrequently: true });
    tcc.drawImage(img, 0, 0);
    const td = tcc.getImageData(0, 0, 12, 14).data;
    let tSum = 0, tN = 0;
    for (let i = 0; i < 12 * 14; i++) {
      const o = i * 4;
      if (td[o + 3] < 40) continue;
      tSum += 0.299 * td[o] + 0.587 * td[o + 1] + 0.114 * td[o + 2]; tN++;
    }
    const texMean = tN ? +(tSum / tN).toFixed(1) : null;

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
    // 裁剪内叶盒均亮（绿主导像素）
    let cSum = 0, cN = 0, cMin = 999, lightAt = null;
    for (const f of feet) {
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
        const o = (y * LS + x) * 4;
        if (!(dA[o + 1] > dA[o] + 4 && dA[o + 1] > 30)) continue;
        const l = 0.299 * dA[o] + 0.587 * dA[o + 1] + 0.114 * dA[o + 2];
        cSum += l; cN++; if (l < cMin) cMin = +l.toFixed(0);
      }
    }
    // 叶所在格光照
    try { lightAt = g.renderer.lighting?.lightAt?.(Math.floor((wxL + 4) / 16), Math.floor((wyL + 4) / 16)) ?? null; } catch { lightAt = 'err'; }
    np.leaves.length = 0;
    return {
      window: best, texMean, cropMean: cN ? +(cSum / cN).toFixed(1) : null, cropMin: cMin, cropN: cN,
      lightAt, feet,
      face: { bgl: g.renderer.constructor.bgl, acc: g.renderer._accMode, path: g.renderer.bglPathUsed },
    };
  });
  console.log('RESULT', JSON.stringify(res));
} catch (e) {
  console.log('ERR', String(e && e.message || e).slice(0, 300));
} finally {
  await browser.close().catch(() => {});
}

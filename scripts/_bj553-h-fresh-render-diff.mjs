/**
 * BJ553-h:终版活体差分(等真渲染帧)。
 *  v4-v7 定谳链:块每渲染帧执行(evCalls=render 计数 1:1)→ rAF 节流下旧像素差分
 *  全作废(采样间零渲染)。本版:render 包装计数轮询等 ≥3 真帧再采样,并读
 *  _accMode/bglPathUsed/bglShimStats 路径账 + 全屏差分定位。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, saveCanvasShot, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553h';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553h = { renderCalls: 0, errs: [] };
window.__bj553hInstall = async () => {
  const { Renderer } = await import('/src/render/Renderer.ts');
  const proto = Renderer.prototype;
  if (!proto.__bj553hp) {
    proto.__bj553hp = true;
    const or_ = proto.render;
    proto.render = function (...a) {
      window.__bj553h.renderCalls++;
      try { return or_.apply(this, a); }
      catch (e) { if (window.__bj553h.errs.length < 4) window.__bj553h.errs.push(String(e?.stack ?? e).slice(0, 300)); throw e; }
    };
  }
  return 'ok';
};
window.__awaitRenders = async (n, timeoutMs = 12000) => {
  const start = window.__bj553h.renderCalls;
  const t0 = performance.now();
  while (window.__bj553h.renderCalls < start + n) {
    await new Promise((r) => requestAnimationFrame(r));
    if (performance.now() - t0 > timeoutMs) return { ok: false, got: window.__bj553h.renderCalls - start };
  }
  return { ok: true, got: window.__bj553h.renderCalls - start };
};
'ok';
`;

const SAMPLE = `(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
  if (!e) return { why: 'no-zombie' };
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const [px, py] = cam.worldToScreen(e.cx, e.cy);
  const z = cam.zoom ?? 1;
  const R = Math.ceil(24 * z);
  const sx = Math.round(px) - R, sy = Math.round(py) - R, W = R * 2, H = R * 2;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, sx, sy, W, H, 0, 0, W, H);
  return { why: null, data: Array.from(g2.getImageData(0, 0, W, H).data),
    px: Math.round(px), py: Math.round(py), z, tid: g.player.minionTargetId };
})()`;

const FULLSHOT = `(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  g2.drawImage(cv, 0, 0);
  return { w: cv.width, h: cv.height, data: Array.from(g2.getImageData(0, 0, cv.width, cv.height).data) };
})()`;

function diffClusters(a, b, minPx = 60) {
  if (!a?.data || !b?.data || a.data.length !== b.data.length) return { ok: false };
  const W = a.w, clusters = new Map();
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) {
      n++;
      const gx = Math.floor(((i >> 2) % W) / 16), gy = Math.floor(((i >> 2) / W | 0) / 16);
      const k = gx + ',' + gy;
      clusters.set(k, (clusters.get(k) ?? 0) + 1);
    }
  }
  const hot = [...clusters.entries()].filter(([, c]) => c >= minPx)
    .map(([k, c]) => { const [gx, gy] = k.split(',').map(Number); return { gx, gy, px16: c, screen: [gx * 16, gy * 16] }; })
    .sort((x, y) => y.px16 - x.px16);
  return { ok: true, n, hot: hot.slice(0, 10) };
}

function diffCount(a, b) {
  if (!a || !b || a.why || b.why || a.data.length !== b.data.length) return { ok: false };
  let n = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
  const R = Math.sqrt(a.data.length / 4) | 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) {
      n++;
      const px = (i >> 2) % R, py = (i >> 2) / R | 0;
      if (px < minx) minx = px; if (px > maxx) maxx = px;
      if (py < miny) miny = py; if (py > maxy) maxy = py;
    }
  }
  return { ok: true, n, bbox: [minx, miny, maxx, maxy], R };
}

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 30);
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, '');
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, '');
  await pump(page, 20);

  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj553hInstall(); });

  // 路径账 + 冻结僵尸 + tid
  const path = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    if (z) { z.vx = 0; z.vy = 0; z.fixedUpdate = () => {}; g.player.minionTargetId = z.id; }
    return { accMode: r._accMode, bglPathUsed: r.bglPathUsed, pathStats: r.bglPathStats,
      shim: r.bglShimStats?.() ?? null, tid: g.player.minionTargetId,
      zoom: g.camera.zoom };
  });
  L.say(`path: ${JSON.stringify(path)}`);

  // ON → 等 3 真帧 → 采样;OFF → 等 3 真帧 → 采样;再 ON;再 OFF
  const w1 = await page.evaluate(() => window.__awaitRenders(3));
  const A = await page.evaluate(SAMPLE);              // ON
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  const w2 = await page.evaluate(() => window.__awaitRenders(3));
  const B = await page.evaluate(SAMPLE);              // OFF
  await pump(page, 2);
  const w3 = await page.evaluate(() => window.__awaitRenders(3));
  const B2 = await page.evaluate(SAMPLE);             // OFF 第二帧
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
  });
  const w4 = await page.evaluate(() => window.__awaitRenders(3));
  const C = await page.evaluate(SAMPLE);              // 复 ON
  L.say(`waits: ${JSON.stringify([w1, w2, w3, w4])} tids: A=${A.tid} B=${B.tid} C=${C.tid}`);

  const dOnOff = diffCount(A, B);
  const dOffOff = diffCount(B, B2);
  const dReOn = diffCount(C, B2);
  L.say(`ON/OFF=${dOnOff.ok ? JSON.stringify({ n: dOnOff.n, bbox: dOnOff.bbox, R: dOnOff.R }) : 'x'}`);
  L.say(`OFF/OFF=${dOffOff.ok ? dOffOff.n : 'x'}  reON/OFF=${dReOn.ok ? dReOn.n : 'x'}`);

  // 全屏差分定位(ON A vs OFF B)
  const FA = await page.evaluate(FULLSHOT);
  await page.evaluate(() => { window.__swGame.player.minionTargetId = -1; });
  await page.evaluate(() => window.__awaitRenders(3));
  const FB = await page.evaluate(FULLSHOT);
  const fd = diffClusters(FA, FB);
  L.say(`fullScreenDiff: total=${fd.ok ? fd.n : 'x'} hot16pxClusters=${fd.ok ? JSON.stringify(fd.hot) : 'x'}`);
  if (A && !A.why) L.say(`zombie screen=(${A.px},${A.py}) zoom=${A.z}`);

  await saveCanvasShot(page, `${OUT}/bj553h-on.png`).catch(() => {});
  L.chk('marker-pixels-appear', dOnOff.ok && dOnOff.n > 100 && dOffOff.ok && dOffOff.n < dOnOff.n / 2,
    `ON/OFF=${dOnOff.ok ? dOnOff.n : 'x'} OFF/OFF=${dOffOff.ok ? dOffOff.n : 'x'}`);

  writeFileSync(`${OUT}/bj553h-result.json`, JSON.stringify({ path, dOnOff, dOffOff, dReOn, fd, zombie: A ? { px: A.px, py: A.py, z: A.z } : null }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());

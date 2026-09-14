// BJ82 调研探针 ①·GL 纹理上传带宽普查(只读,零 src 触碰)
// 目标:量化 T3「三纹理每帧上传」的真实口径——worldLight(worldCanvas×light)
//      与 waterDistortion(scene+water gate)两上下文在四场景的每帧上传 MB。
// 通路:gpuLogSnapshot()(GLStats 模块级账本,单例裸 import 同 BJ77 WaterWaves 先例)。
// ★纪律:GPU 页不挂 trace;窗内禁确定性 pump;生产源码零改动。
// 运行:SW_ORIGIN=http://localhost:5213 node tools/probe.mjs run scripts/_bj82-upload-census.mjs --seed=05162020 --size=small
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  // 采样器:每 250ms 抓一次 gpuLogSnapshot,按场景聚合 frameUpMB 分布
  await page.evaluate(function bj82UploadInstall() {
    const S = window.__bj82up = { on: false, samples: [], timer: 0 };
    S.step = async () => {
      try {
        const { gpuLogSnapshot } = await import('/src/render/GLStats.ts');
        S.snap = () => gpuLogSnapshot();
      } catch (e) { S.err = String(e).slice(0, 200); S.snap = () => null; }
      S.timer = setInterval(() => {
        if (!S.on) return;
        const s = S.snap?.();
        if (!s) return;
        const row = { t: performance.now() };
        for (const [k, v] of Object.entries(s.ctxs)) row[k] = { up: v.frameUp, upMB: v.frameUpMB, draws: v.frameDraws, liveMB: v.liveMB };
        S.samples.push(row);
        if (S.samples.length > 4000) S.samples.shift();
      }, 250);
    };
    S.step();
  });
  const setOn = (on) => page.evaluate((c) => { window.__bj82up.on = c; }, on);
  const flush = (name) => page.evaluate((n) => {
    const S = window.__bj82up;
    const rows = S.samples; S.samples = [];
    // 聚合:每上下文 frameUpMB 的 mean/p50/p90/max
    const acc = {};
    for (const r0 of rows) for (const [k, v] of Object.entries(r0)) {
      if (k === 't' || !v || typeof v.upMB !== 'number') continue;
      (acc[k] ??= []).push(v.upMB);
    }
    const out = {};
    for (const [k, arr] of Object.entries(acc)) {
      arr.sort((a, b) => a - b);
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      out[k] = { n: arr.length, meanMB: +mean.toFixed(3), p50MB: +arr[Math.floor(arr.length / 2)].toFixed(3), p90MB: +arr[Math.floor(arr.length * 0.9)].toFixed(3), maxMB: +arr[arr.length - 1].toFixed(3) };
    }
    return { name: n, rows: rows.length, ctxs: out };
  }, name);

  // 画布尺寸盘点(worldCanvas / worldLight 输出 / warp scene+gate)
  const dims = await page.evaluate(function bj82Dims() {
    const g = window.__swGame, r = g.renderer;
    const out = { view: { w: r.canvas?.width, h: r.canvas?.height, dpr: window.devicePixelRatio } };
    try { out.worldCanvas = { w: r.worldCanvas?.width, h: r.worldCanvas?.height, lowK: r._worldLowK ?? 1 }; } catch (e) { out.worldCanvas = { err: String(e).slice(0, 80) }; }
    try { const wl = r.worldLightLayer(); out.worldLight = { w: wl?.canvas?.width, h: wl?.canvas?.height, unavailable: !!wl?.unavailable }; } catch (e) { out.worldLight = { err: String(e).slice(0, 80) }; }
    try { out.warpFg = { w: r.waterWarp?.fgCanvas?.width, h: r.waterWarp?.fgCanvas?.height, mode: r.waterWarp?.mode }; } catch (e) { out.warpFg = { err: String(e).slice(0, 80) }; }
    try { const glw = r.waterWarp?.gl; out.warpGL = { w: glw?.canvas?.width, h: glw?.canvas?.height }; } catch (e) { out.warpGL = { err: String(e).slice(0, 80) }; }
    try { out.zoom = g.camera.zoom; out.waveQ = (window.__bj82up, null); } catch { /* zoom 读不到不致命 */ }
    return out;
  });
  L.say('dims=' + JSON.stringify(dims));

  // 找水(同 BJ77 口径:地表列扫描)
  const water = await page.evaluate(function bj82FindWater() {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const y0 = Math.max(0, gl - 30), y1 = Math.min(st.h - 1, gl + 12);
    const runs = [];
    let runStart = -1, runLen = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let cnt = 0;
      for (let y = y0; y <= y1; y++) if (st.liquid[y * st.w + x] > 0) cnt++;
      if (cnt >= 8) { if (runStart < 0) runStart = x; runLen++; }
      else if (runStart >= 0) { if (runLen >= 10) runs.push([runStart, runStart + runLen - 1]); runStart = -1; runLen = 0; }
    }
    if (runStart >= 0 && runLen >= 10) runs.push([runStart, runStart + runLen - 1]);
    runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - g.player.x) - Math.abs((b[0] + b[1]) / 2 - g.player.x));
    return { runs: runs.slice(0, 6), groundLevel: gl };
  });
  L.say('water-runs=' + JSON.stringify(water.runs));

  // 走动驱动器(真实 rAF,只写玩家位)
  await page.evaluate(function bj82WalkInstall() {
    const P = window.__bj82walk = { on: false, tps: 0, dir: 1, last: 0 };
    function tick(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick); return; }
      const g = window.__swGame;
      if (g?.player) {
        const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
        g.player.x += P.tps * 16 * dt * P.dir;
        g.player.vy = 0;
      }
      P.last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const setWalk = (on, tps, dir) => page.evaluate((c) => { const P = window.__bj82walk; P.on = c.on; P.tps = c.tps; P.dir = c.dir; P.last = 0; }, { on, tps, dir });

  const seg = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    await setOn(true);
    await sleep(ms);
    await setOn(false);
    const r0 = await flush(name);
    const mb = Object.entries(r0.ctxs).filter(([k]) => k === 'worldLight' || k === 'waterDistortion' || k === 'screenFx' || k === 'clouds' || k === 'cloud');
    L.say(`[${name}] samples=${r0.rows} ` + mb.map(([k, v]) => `${k}: mean=${v.meanMB}MB p50=${v.p50MB} p90=${v.p90MB} max=${v.maxMB}`).join(' | '));
    return r0;
  };

  await seg('still:surface', 6000);
  await seg('walk:surface', 8000, () => setWalk(true, 12, 1));
  await setWalk(false, 0, 1);
  if (water.runs.length) {
    const [wx0, wx1] = water.runs[0];
    const wx = ((wx0 + wx1) / 2) * 16;
    await teleport(page, wx, water.groundLevel * 16 - 48);
    await seg('still:water', 6000);
    await seg('walk:water', 8000, () => setWalk(true, 12, 1));
    await setWalk(false, 0, 1);
  } else {
    L.say('no-water-run: 水段跳过');
  }

  // 收尾再抓一次尺寸(GL 层此刻必然就位)
  const dims2 = await page.evaluate(function bj82Dims2() {
    const g = window.__swGame, r = g.renderer;
    return {
      worldCanvas: { w: r.worldCanvas?.width, h: r.worldCanvas?.height, lowK: r._worldLowK ?? 1 },
      worldLight: { w: r.worldLightLayer()?.canvas?.width, h: r.worldLightLayer()?.canvas?.height, unavail: !!r.worldLightLayer()?.unavailable },
      warpGL: { w: r.waterWarp?.gl?.canvas?.width, h: r.waterWarp?.gl?.canvas?.height },
      zoom: g.camera.zoom, dpr: window.devicePixelRatio,
    };
  });
  L.say('dims2=' + JSON.stringify(dims2));
  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

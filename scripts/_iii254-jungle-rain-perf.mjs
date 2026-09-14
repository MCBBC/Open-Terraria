#!/usr/bin/env node
// IIII254 探针:雨林+雨天掉帧 A/B 复现仪(与 Trace-20260914T162213.json 归因对齐)。
//   P1 jungle-rain-static   丛林最密窗+强制开雨站定(雨因果主相)
//   P2 jungle-dry-static    同点位关雨(雨刀:rain OFF 对照)
//   P3 forest-rain-static   非丛林地表+开雨(丛林特异性对照)
//   P4 jungle-rain-tour     开雨丛林巡游(复现用户跑图)
//   仪表:drawImage/fillRect 原型包装(大 blit 分类) / rAF fps /
//     SkyRenderer.drawWeatherTint2D 包装(调用数+ms+门状态) / LightingEngine
//     processScan+processBlurAndPresent 包装 / WaterWaves frame 包装 /
//     CDP Profiler 100µs(dev 实例=原名) / 世界 FNV 前后守恒
// 用法: node tools/probe.mjs run scripts/_iii254-jungle-rain-perf.mjs --vite=5303 --out=/tmp/iii254-out/probe-run
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { fnvStore } from '../tools/probe/lib/world.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}
const TAG = argVal('--tag', 'run');
const OUT = argVal('--out', process.env.SW_PROBE_OUT || '/tmp/iii254-out/' + TAG);
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5303';
const SCEN_MS = Number(argVal('--scen-ms', '11000'));
const SEED = process.env.SW_SEED || argVal('--seed', '05162020');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[iii254]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
log('scene boot, origin=', ORIGIN, 'seed=', SEED, 'out=', OUT);

// ---------- in-page instruments ----------
async function installInstruments(page) {
  return page.evaluate(async () => {
    const G = (globalThis).__swProbe = { win: [] };
    const proto = CanvasRenderingContext2D.prototype;
    G.diCalls = 0; G.diMs = 0; G.bigCalls = 0; G.bigMs = 0;
    G.frCalls = 0; G.frMs = 0; G.bigFrCalls = 0; G.bigFrMs = 0;
    const origDi = proto.drawImage;
    proto.drawImage = function (...args) {
      G.diCalls++;
      const t0 = performance.now();
      const r = origDi.apply(this, args);
      const ms = performance.now() - t0;
      G.diMs += ms;
      // 大 blit 判定:整源→整目标(d args 4 个=5 参式)且目标覆盖 ≥80% 画布
      const cw = this.canvas.width, ch = this.canvas.height;
      if (args.length <= 5) {
        const dw = args[3] ?? (this.canvas ? 0 : 0), dh = args[4] ?? 0;
        if (dw >= cw * 0.8 && dh >= ch * 0.8) { G.bigCalls++; G.bigMs += ms; }
      } else {
        const dw = args[6], dh = args[7];
        if (dw >= cw * 0.8 && dh >= ch * 0.8) { G.bigCalls++; G.bigMs += ms; }
      }
      return r;
    };
    const origFr = proto.fillRect;
    proto.fillRect = function (...args) {
      G.frCalls++;
      const t0 = performance.now();
      const r = origFr.apply(this, args);
      const ms = performance.now() - t0;
      G.frMs += ms;
      const cw = this.canvas.width, ch = this.canvas.height;
      const sx = this.getTransform().a, sy = this.getTransform().d;
      if (args[2] * sx >= cw * 0.8 && args[3] * sy >= ch * 0.8) { G.bigFrCalls++; G.bigFrMs += ms; }
      return r;
    };
    const raf = window.requestAnimationFrame.bind(window);
    G.rafCalls = 0;
    window.requestAnimationFrame = (cb) => raf((t) => { G.rafCalls++; return cb(t); });
    // 模块级包装(dev=原名)
    try {
      const { SkyRenderer } = await import('/src/render/SkyRenderer.ts');
      const sp = SkyRenderer.prototype;
      G.tintCalls = 0; G.tintMs = 0;
      const oTint = sp.drawWeatherTint2D;
      sp.drawWeatherTint2D = function (...a) {
        G.tintCalls++;
        const t0 = performance.now();
        const r = oTint.apply(this, a);
        G.tintMs += performance.now() - t0;
        G.tintState = {
          sand: { ...this.sandTintState }, blizz: { ...this.blizzTintState },
          passes: this.weatherTintPasses().length,
        };
        return r;
      };
    } catch (e) { G.tintErr = String(e); }
    try {
      const g = window.__swGame;
      const lp = Object.getPrototypeOf(g.lighting);
      G.scanCalls = 0; G.scanMs = 0; G.blurCalls = 0; G.blurMs = 0;
      const oScan = lp.processScan, oBlur = lp.processBlurAndPresent;
      lp.processScan = function (...a) { G.scanCalls++; const t0 = performance.now(); const r = oScan.apply(this, a); G.scanMs += performance.now() - t0; return r; };
      lp.processBlurAndPresent = function (...a) { G.blurCalls++; const t0 = performance.now(); const r = oBlur.apply(this, a); G.blurMs += performance.now() - t0; return r; };
    } catch (e) { G.lightErr = String(e); }
    try {
      const ww = await import('/src/render/WaterWaves.ts');
      G.waveMs = 0; G.waveCalls = 0;
      const oFrame = ww.waterWaves.frame.bind(ww.waterWaves);
      ww.waterWaves.frame = (...a) => { G.waveCalls++; const t0 = performance.now(); const r = oFrame(...a); G.waveMs += performance.now() - t0; return r; };
    } catch (e) { G.waveErr = String(e); }
    try {
      // ChunkCache:重烘/脏区计数(雨×1.5 演化采样→tile 写→chunk 失效链)
      const g0 = window.__swGame;
      const cc = g0?.chunks ?? g0?.renderer?.chunks ?? null;
      G.rcCount = 0; G.rcMs = 0; G.mdCount = 0;
      if (cc) {
        const cp2 = Object.getPrototypeOf(cc);
        const oRc = cp2.renderChunk;
        if (oRc) cp2.renderChunk = function (...a) { G.rcCount++; const t0 = performance.now(); const r = oRc.apply(this, a); G.rcMs += performance.now() - t0; return r; };
        const oMd = cp2.markDirtyArea;
        if (oMd) cp2.markDirtyArea = function (...a) { G.mdCount++; return oMd.apply(this, a); };
      }
      // WorldEvolution.update(雨天 ×1.5 地表采样)
      const { WorldEvolution } = await import('/src/world/evolution/WorldEvolution.ts');
      G.evoCalls = 0; G.evoMs = 0;
      const ep = WorldEvolution.prototype, oEvo = ep.update;
      ep.update = function (...a) { G.evoCalls++; const t0 = performance.now(); const r = oEvo.apply(this, a); G.evoMs += performance.now() - t0; return r; };
      // WeatherRenderer 雨面(update 物理 + drawRain 雨列 + drawPrecipDust 溅花尘)
      const { WeatherRenderer } = await import('/src/render/WeatherRenderer.ts');
      G.wxMs = 0; G.wxCalls = 0; G.rainMs = 0; G.dustMs = 0;
      const wp = WeatherRenderer.prototype;
      const oWxU = wp.update, oWxR = wp.drawRain, oWxD = wp.drawPrecipDust;
      if (oWxU) wp.update = function (...a) { G.wxCalls++; const t0 = performance.now(); const r = oWxU.apply(this, a); G.wxMs += performance.now() - t0; return r; };
      if (oWxR) wp.drawRain = function (...a) { const t0 = performance.now(); const r = oWxR.apply(this, a); G.rainMs += performance.now() - t0; return r; };
      if (oWxD) wp.drawPrecipDust = function (...a) { const t0 = performance.now(); const r = oWxD.apply(this, a); G.dustMs += performance.now() - t0; return r; };
    } catch (e) { G.chunkErr = String(e); }
    // 每秒采样
    G.sampling = false; G.samples = [];
    G.timer = setInterval(() => {
      if (!G.sampling) return;
      const g = window.__swGame;
      G.win.push({
        t: Date.now(),
        fps: G.rafCalls,
        diCalls: G.diCalls, diMs: +G.diMs.toFixed(1),
        bigCalls: G.bigCalls, bigMs: +G.bigMs.toFixed(1),
        frCalls: G.frCalls, frMs: +G.frMs.toFixed(1),
        bigFrCalls: G.bigFrCalls, bigFrMs: +G.bigFrMs.toFixed(1),
        tintCalls: G.tintCalls ?? null, tintMs: G.tintMs != null ? +G.tintMs.toFixed(2) : null,
        tintState: G.tintState ?? null,
        scanCalls: G.scanCalls ?? null, scanMs: G.scanMs != null ? +G.scanMs.toFixed(1) : null,
        blurCalls: G.blurCalls ?? null, blurMs: G.blurMs != null ? +G.blurMs.toFixed(1) : null,
        waveCalls: G.waveCalls ?? null, waveMs: G.waveMs != null ? +G.waveMs.toFixed(1) : null,
        rcCount: G.rcCount ?? null, rcMs: G.rcMs != null ? +G.rcMs.toFixed(1) : null,
        mdCount: G.mdCount ?? null, evoCalls: G.evoCalls ?? null, evoMs: G.evoMs != null ? +G.evoMs.toFixed(1) : null,
        wxCalls: G.wxCalls ?? null, wxMs: G.wxMs != null ? +G.wxMs.toFixed(2) : null,
        rainMs: G.rainMs != null ? +G.rainMs.toFixed(2) : null, dustMs: G.dustMs != null ? +G.dustMs.toFixed(2) : null,
        raining: !!g?.world?.weather?.raining, cloudAlpha: g?.world?.weather?.cloudAlpha ?? null,
        zoneRain: !!g?.scene?.zoneRain, zoneSnow: !!g?.scene?.zoneSnow,
        jungleTiles: g?.scene?.jungleTileCount ?? null,
        canvasW: g?.renderer?.canvas?.width ?? null, canvasH: g?.renderer?.canvas?.height ?? null,
      });
      G.rafCalls = 0; G.diCalls = 0; G.diMs = 0; G.bigCalls = 0; G.bigMs = 0;
      G.frCalls = 0; G.frMs = 0; G.bigFrCalls = 0; G.bigFrMs = 0;
      G.tintCalls = 0; G.tintMs = 0; G.scanCalls = 0; G.scanMs = 0; G.blurCalls = 0; G.blurMs = 0;
      G.waveCalls = 0; G.waveMs = 0; G.rcCount = 0; G.rcMs = 0; G.mdCount = 0;
      G.evoCalls = 0; G.evoMs = 0; G.wxCalls = 0; G.wxMs = 0; G.rainMs = 0; G.dustMs = 0;
    }, 1000);
    return { ok: true, errs: [G.tintErr, G.lightErr, G.waveErr].filter(Boolean) };
  });
}

// ---------- scene: locate densest jungle window ----------
async function locateJungle(page) {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    let JG = -1;
    try { JG = (await import('/src/data/tiles.ts')).TILE_BY_KEY['v_60_jungle_grass_block']; } catch {}
    if (JG == null) return { ok: false, why: 'no jungle tile id' };
    const jx = g.world.jungleX || Math.floor(st.w * 0.15);
    const WW = 80, WH = 56;
    let best = { d: -1, x: jx, y: Math.floor(g.world.groundLevel) };
    const bw = Math.ceil(st.w / 8), bh = Math.ceil(st.h / 8);
    const dens = new Float32Array(bw * bh);
    for (let y = 0; y < st.h; y += 4) {
      for (let x = Math.max(0, jx - 160); x < Math.min(st.w, jx + 160); x += 4) {
        const i = st.idx(x, y);
        if (st.hasTile(x, y) && st.type[i] === JG) dens[(y / 4 | 0) * bw + (x / 4 | 0)] = 1;
      }
    }
    for (let by = 0; by + WH / 4 <= bh; by++) {
      for (let bx = 0; bx + WW / 4 <= bw; bx++) {
        let s = 0;
        for (let yy = by; yy < by + WH / 4; yy++) for (let xx = bx; xx < bx + WW / 4; xx++) s += dens[yy * bw + xx];
        if (s > best.d) best = { d: s, x: bx * 4 + WW / 2, y: by * 4 + WH / 2 };
      }
    }
    return { ok: best.d > 10, density: best.d, jungle: { tx: best.x, ty: best.y }, jx };
  });
}

async function findStandSpot(page, tx, fromY) {
  return page.evaluate(({ tx, fromY }) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (let y = Math.max(2, fromY - 80); y < st.h - 4; y++) {
      if (st.isSolid(tx, y) && st.isSolid(tx, y + 1) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2)) {
        return { x: tx * 16 + 8, y: (y - 3) * 16 };
      }
    }
    return { x: tx * 16 + 8, y: (fromY - 6) * 16 };
  }, { tx, fromY });
}

async function teleport(page, s) {
  await page.evaluate(({ x, y }) => {
    const g = window.__swGame;
    g.player.x = x - g.player.w / 2; g.player.y = y; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  }, s);
}

async function setRain(page, on) {
  return page.evaluate((on) => {
    const g = window.__swGame;
    const w = g.world.weather;
    if (on) w.startRain(true);
    else w.stopRain(true);
    return { raining: w.raining, cloudAlpha: w.cloudAlpha, maxRaining: w.maxRaining };
  }, on);
}

async function profiledPhase(page, name, scenMs, tour, spots, throttle = 0) {
  const client = await page.target().createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await client.send('Profiler.start');
  await page.evaluate(() => { const G = globalThis.__swProbe; G.win.length = 0; G.sampling = true; });
  await runScene(page, scenMs, tour, spots);
  const { profile } = await client.send('Profiler.stop');
  if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const win = await page.evaluate(() => { const G = globalThis.__swProbe; G.sampling = false; return G.win.slice(); });
  await client.detach().catch(() => {});
  return { name, win, profile };
}

async function runScene(page, scenMs, tour, spots) {
  const tEnd = Date.now() + scenMs;
  let idx = 0, nextJump = Date.now() + 2200;
  while (Date.now() < tEnd) {
    if (tour && spots.length > 1 && Date.now() > nextJump) {
      await teleport(page, spots[idx % spots.length]);
      idx++;
      nextJump = Date.now() + 2200;
    }
    await sleep(250);
  }
}

function summarizePhase(p) {
  const wins = p.win;
  if (!wins.length) return { name: p.name, empty: true, profile: p.profile };
  const q = (arr, pr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(pr * (s.length - 1))] : -1; };
  const avg = (arr) => +(arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length)).toFixed(2);
  return {
    name: p.name, seconds: wins.length,
    fpsMedian: q(wins.map(w => w.fps), 0.5), fpsMin: q(wins.map(w => w.fps), 0.05),
    diCallsMedian: q(wins.map(w => w.diCalls), 0.5), diMsMedian: q(wins.map(w => w.diMs), 0.5), diMsMax: q(wins.map(w => w.diMs), 1),
    bigCallsMedian: q(wins.map(w => w.bigCalls), 0.5), bigMsMedian: q(wins.map(w => w.bigMs), 0.5),
    bigFrMsMedian: q(wins.map(w => w.bigFrMs), 0.5), bigFrCallsMedian: q(wins.map(w => w.bigFrCalls), 0.5),
    tintCallsMedian: q(wins.map(w => w.tintCalls ?? -1), 0.5), tintMsMedian: q(wins.map(w => w.tintMs ?? -1), 0.5),
    scanMsMedian: q(wins.map(w => w.scanMs ?? -1), 0.5), blurMsMedian: q(wins.map(w => w.blurMs ?? -1), 0.5),
    waveMsMedian: q(wins.map(w => w.waveMs ?? -1), 0.5),
    raining: wins[0].raining, cloudAlpha: wins[0].cloudAlpha,
    zoneRain: wins[0].zoneRain, zoneSnow: wins[0].zoneSnow,
    canvas: [wins[0].canvasW, wins[0].canvasH],
    tintState: wins[0].tintState ?? null,
    perSecond: wins,
    profile: p.profile,
  };
}

function analyzeProfile(profile) {
  const nodesById = new Map();
  for (const n of profile.nodes) nodesById.set(n.id, n);
  const parentOf = new Map();
  for (const n of profile.nodes) {
    if (n.parent !== undefined) parentOf.set(n.id, n.parent);
    else for (const c of n.children || []) parentOf.set(c, n.id);
  }
  const fnOf = (id) => nodesById.get(id)?.callFrame?.functionName || '(unknown)';
  const cnt = new Map();
  for (const s of profile.samples) cnt.set(s, (cnt.get(s) || 0) + 1);
  const ds = profile.timeDeltas.filter((d) => d > 0).sort((a, b) => a - b);
  const med = ds.length ? ds[ds.length >> 1] : 1000;
  const byFn = new Map();
  for (const [id, c] of cnt) { const f = fnOf(id); byFn.set(f, (byFn.get(f) || 0) + c); }
  const top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 22)
    .map(([f, c]) => ({ fn: f, samples: c, selfMs: +((c * med) / 1000).toFixed(1) }));
  // native 叶的调用方归属(最近 3 级 JS 祖先)
  const NATIVE = /^(drawImage|texSubImage2D|fillRect|\(program\)|\(garbage collector\))$/;
  const caller = new Map();
  for (const [id, c] of cnt) {
    if (!NATIVE.test(fnOf(id))) continue;
    let a = parentOf.get(id), chain = [], gd = 0;
    while (a !== undefined && gd++ < 12) {
      const f = fnOf(a);
      if (f && f !== '(unknown)' && f !== '(idle)' && !NATIVE.test(f)) { chain.push(f); if (chain.length === 3) break; }
      a = parentOf.get(a);
    }
    if (chain.length) { const k = chain.join(' ← '); caller.set(k, (caller.get(k) || 0) + c); }
  }
  const callers = [...caller].sort((a, b) => b[1] - a[1]).slice(0, 16)
    .map(([k, c]) => ({ chain: k, selfMs: +((c * med) / 1000).toFixed(1) }));
  return { totalSamples: profile.samples.length, medianDeltaUs: med, wallMs: +((profile.endTime - profile.startTime) / 1000).toFixed(0), top, callers };
}

async function main() {
  const browser = await launchBrowser({ extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const result = { tag: TAG, origin: ORIGIN, scenMs: SCEN_MS, seed: SEED };
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    const inst = await installInstruments(page);
    log('instruments:', JSON.stringify(inst));
    result.fnvBefore = await fnvStore(page);

    const jl = await locateJungle(page);
    log('jungle locate:', JSON.stringify(jl));
    if (!jl.ok) throw new Error('no jungle window (d=' + jl.density + ')');
    result.jungle = jl;
    const jSpot = await findStandSpot(page, jl.jungle.tx, jl.jungle.ty);
    const jSpots = [];
    for (const dx of [-40, 0, 40]) jSpots.push(await findStandSpot(page, jl.jungle.tx + dx, jl.jungle.ty));
    const fSpot = await findStandSpot(page, Math.floor(jl.jx * 2.6), jl.jungle.ty);
    result.spots = { jSpot, fSpot };

    // P1 丛林+雨 站定
    await teleport(page, jSpot);
    result.rainOn = await setRain(page, true);
    await sleep(1500);
    result.P1 = summarizePhase(await profiledPhase(page, 'jungle-rain-static', SCEN_MS, false, []));
    log('P1', JSON.stringify({ ...result.P1, perSecond: undefined, tintState: undefined }));

    // P2 丛林 无雨 站定(同点位)
    await setRain(page, false);
    await sleep(2500);
    result.P2 = summarizePhase(await profiledPhase(page, 'jungle-dry-static', Math.min(SCEN_MS, 9000), false, []));
    log('P2', JSON.stringify({ ...result.P2, perSecond: undefined }));

    // P3 非丛林+雨 站定(对照)
    await teleport(page, fSpot);
    await setRain(page, true);
    await sleep(1500);
    result.P3 = summarizePhase(await profiledPhase(page, 'forest-rain-static', Math.min(SCEN_MS, 9000), false, []));
    log('P3', JSON.stringify({ ...result.P3, perSecond: undefined }));

    // P4 丛林+雨 巡游
    await teleport(page, jSpot);
    await sleep(300);
    result.P4 = summarizePhase(await profiledPhase(page, 'jungle-rain-tour', SCEN_MS, true, jSpots));
    log('P4', JSON.stringify({ ...result.P4, perSecond: undefined, profile: undefined }));

    // P5/P6 CPU 节流相(×6 模拟用户量级机器;掉帧复现用)
    const TH = Number(argVal('--throttle', '6'));
    result.P1t = summarizePhase(await profiledPhase(page, 'jungle-rain-throttled', Math.min(SCEN_MS, 9000), false, [], TH));
    log('P1t', JSON.stringify({ ...result.P1t, perSecond: undefined, profile: undefined }));
    await teleport(page, fSpot);
    await sleep(300);
    result.P3t = summarizePhase(await profiledPhase(page, 'forest-rain-throttled', Math.min(SCEN_MS, 9000), false, [], TH));
    log('P3t', JSON.stringify({ ...result.P3t, perSecond: undefined, profile: undefined }));

    result.P1tintState = result.P1.win?.[0]?.tintState ?? null;
    result.fnvAfter = await fnvStore(page);
    result.fnvSame = result.fnvBefore === result.fnvAfter;
    if (result.P1.profile) result.P1profile = analyzeProfile(result.P1.profile);
    if (result.P4.profile) result.P4profile = analyzeProfile(result.P4.profile);
    for (const k of ['P1', 'P2', 'P3', 'P4', 'P1t', 'P3t']) delete result[k]?.profile;
    writeFileSync(join(OUT, 'iii254-probe.json'), JSON.stringify(result, null, 1));
    log('WROTE', join(OUT, 'iii254-probe.json'), 'fnvSame=', result.fnvSame);
  } finally {
    await closeAllBrowsers();
  }
}
try { await main(); process.exit(0); } catch (e) { console.error('[iii254] FATAL', e); process.exit(1); }

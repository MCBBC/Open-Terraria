#!/usr/bin/env node
// ★perf3（2026-09-19 trace 三批：云/雨/星渲染层热点）A/B 探针。
//   刀面：SkyRenderer.drawCloudsNear 尾blit 区域收口（bbox 子矩形）+
//         WeatherRenderer.drawRain 数字键 memo + setTransform 折叠。
//   视觉等价证据（同帧位逐像素 diff，≤1 LSB 判据）：
//     同一页加载内 g.paused=true 冻结世界 → 连续渲染为纯重绘 →
//     基线自diff（不翻刀，须=0，证渲染活着且冻结稳定）→ 翻 hatch 重渲染 →
//     diff（须=0）→ 翻回 → diff（须=0）。渲染活性由 drawCloudsNear 调用计数
//     增量断言（防「渲染停了=恒等假阴性」）。
//   帧耗时：暂停解除后真 rAF 600 帧/段，新路径→旧路径（?cloudcache=0 运行时翻）
//     各一段，均值/p50/p95；并记录云层画布 blit 面积/帧（面积收口直接证据）。
//   场景：白天多云 / 雨天 / 夜间（同一世界 seed，钟面钉死）。
// 用法：node tools/run-diag.mjs --timeout=900000 scripts/_perf3-cloudrain.mjs
//   （SW_ORIGIN=http://localhost:5276 私有实例）
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, installPinnedRandom } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5276';
const OUT = process.env.SW_PROBE_OUT || '/tmp/perf3-out';
const FRAMES = Number(process.env.SW_FRAMES || 600);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[perf3]', ...a, DSF !== 1 ? `(DSF=${DSF})` : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SW_DSF=2 → 复现用户 Retina 面(DPR=2,全屏层 blit 面积 4×;puppeteer defaultViewport
// 直透 deviceScaleFactor,零 lib 改动)。缺省 1。
// SW_W/SW_H → 视口尺寸(画布=视口 CSS px;2560×1600 = 用户 Retina 画布面积同量级,
// 用于验证 blit 成本∝面积的迁移性)。缺省 1280×800。
const DSF = Number(process.env.SW_DSF || 1);
const VW = Number(process.env.SW_W || 1280), VH = Number(process.env.SW_H || 800);
const browser = await launchBrowser({ viewport: { width: VW, height: VH, deviceScaleFactor: DSF } });
try {
  const page = await openPage(browser, {});
  installPinnedRandom(page, 913);                       // 环境方差钉死（导航前装）
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1500 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);
  // 无头失焦会触发 applyFocusPause（playWhenUnfocused=false 默认→paused=true→
  // weatherFx.update 被 _worldPaused 门冻=雨池永不填充,首轮探针实证 active=0）。
  // 探针纪律:开 playWhenUnfocused(Options 开关,失焦不暂停游戏)+显式 unpause。
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    options.data.playWhenUnfocused = true;
    window.__swGame.paused = false;
    return true;
  });

  // ---------- 页内仪器 ----------
  await page.evaluate(async () => {
    const { SkyRenderer } = await import('/src/render/SkyRenderer.ts');
    const { WeatherRenderer } = await import('/src/render/WeatherRenderer.ts');
    const g = window.__swGame;
    const P = globalThis.__perf3 = {
      SkyRenderer, WeatherRenderer,
      renderMs: [], cloudNearMs: [], pass1Ms: [], rainMs: [], precipMs: [],
      blitArea: [], blitCalls: [], blitMs: [],
      cloudCalls: 0, rainCalls: 0,
      lastRender: 0, lastNear: 0, lastP1: 0, lastRain: 0, lastPrecip: 0,
      curArea: 0, curCalls: 0, curBlitMs: 0, layerCanvas: null,
    };
    const wrap = (obj, name, tag) => {
      const o = obj.prototype[name];
      obj.prototype[name] = function (...a) {
        if (tag === 'near' || tag === 'p1') P.layerCanvas = this.cloudGlLayer ? this.cloudGlLayer.canvas : null;
        if (tag === 'rain') P.rainCalls++;
        P.cloudCalls += (tag === 'near' || tag === 'p1') ? 1 : 0;
        const t0 = performance.now();
        const r = o.apply(this, a);
        const dt = performance.now() - t0;
        if (tag === 'near') P.lastNear = dt;
        else if (tag === 'p1') P.lastP1 = dt;
        else if (tag === 'rain') P.lastRain = dt;
        else if (tag === 'precip') P.lastPrecip = dt;
        return r;
      };
    };
    wrap(SkyRenderer, 'drawCloudsNear', 'near');
    wrap(SkyRenderer, 'drawVanillaClouds', 'p1');
    wrap(WeatherRenderer, 'drawRain', 'rain');
    wrap(WeatherRenderer, 'drawPrecipDust', 'precip');
    // 云层画布 blit 账（恒等比较;9 参式取 [7]=dw/[8]=dh,5 参式=全幅;blit 自计时）
    const proto = CanvasRenderingContext2D.prototype;
    const oDi = proto.drawImage;
    proto.drawImage = function (...args) {
      if (P.layerCanvas && args[0] === P.layerCanvas) {
        const w = args.length > 5 ? args[7] : args[0].width;
        const h = args.length > 5 ? args[8] : args[0].height;
        P.curArea += w * h; P.curCalls++;
        const t0 = performance.now();
        const r = oDi.apply(this, args);
        P.curBlitMs += performance.now() - t0;
        return r;
      }
      return oDi.apply(this, args);
    };
    // 逐帧账：render 一次 = 一帧
    const oRender = g.renderer.render.bind(g.renderer);
    g.renderer.render = function (...a) {
      const t0 = performance.now();
      const r = oRender(...a);
      P.lastRender = performance.now() - t0;
      P.renderMs.push(P.lastRender);
      P.cloudNearMs.push(P.lastNear); P.pass1Ms.push(P.lastP1);
      P.rainMs.push(P.lastRain); P.precipMs.push(P.lastPrecip);
      P.blitArea.push(P.curArea); P.blitCalls.push(P.curCalls); P.blitMs.push(P.curBlitMs);
      P.curArea = 0; P.curCalls = 0; P.curBlitMs = 0; P.lastNear = 0; P.lastP1 = 0; P.lastRain = 0; P.lastPrecip = 0;
      return r;
    };
    // n 帧真 rAF 窗
    window.__perf3Run = (n) => new Promise((resolve) => {
      const t0 = performance.now();
      const start = P.renderMs.length;
      const tick = () => {
        if (P.renderMs.length - start >= n) { resolve({ wallMs: Math.round(performance.now() - t0), frames: n }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // 等 n 个 rAF 回调（捕获节拍用——比 sleep 抗 headless rAF 停摆;活性断言前提）
    window.__perf3WaitFrames = (n) => new Promise((resolve) => {
      let k = 0;
      const tick = () => { if (++k >= n) { resolve(k); return; } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    // 冻结 render 侧动画器（仅捕获窗;A/B 两拍同吃=公平;计时段还原）:
    // 水波帧场 / 瀑布贴图 now 相位 / 环境生物(鸟群无 pause 门,白天 wiggle 源,夜间自静)
    let frozen = null;
    window.__perf3FreezeFx = async (on) => {
      if (on && !frozen) {
        frozen = {};
        try {
          const m = await import('/src/render/WaterWaves.ts');
          frozen.wavesRef = m.waterWaves; frozen.oWaves = m.waterWaves.frame;
          m.waterWaves.frame = () => {};
        } catch {}
        try {
          const { SkyRenderer } = await import('/src/render/SkyRenderer.ts');
          frozen.oAmb = SkyRenderer.prototype.drawAmbience;
          SkyRenderer.prototype.drawAmbience = function () {};
        } catch {}
        try {
          const wf = g.renderer.waterfalls;
          if (wf) { frozen.oWf = wf.draw; wf.draw = function () {}; }
        } catch {}
      } else if (!on && frozen) {
        if (frozen.wavesRef) frozen.wavesRef.frame = frozen.oWaves;
        if (frozen.oAmb) P.SkyRenderer.prototype.drawAmbience = frozen.oAmb;
        if (frozen.oWf) g.renderer.waterfalls.draw = frozen.oWf;
        frozen = null;
      }
      return true;
    };
    // 捕获 + 页内 diff（prev 缓存在页内,只回传统计）
    let prev = null;
    window.__perf3Cap = () => {
      const cv = g.renderer.canvas;
      const s = document.createElement('canvas');
      s.width = cv.width; s.height = cv.height;
      const c = s.getContext('2d', { willReadFrequently: true });
      c.drawImage(cv, 0, 0);
      const cur = c.getImageData(0, 0, cv.width, cv.height).data;
      let diffPx = 0, maxd = 0, sumd = 0;
      if (prev) {
        for (let i = 0; i < cur.length; i += 4) {
          const dr = Math.abs(cur[i] - prev[i]);
          const dg = Math.abs(cur[i + 1] - prev[i + 1]);
          const db = Math.abs(cur[i + 2] - prev[i + 2]);
          const da = Math.abs(cur[i + 3] - prev[i + 3]);
          const d = Math.max(dr, dg, db, da);
          if (d > 0) { diffPx++; sumd += d; if (d > maxd) maxd = d; }
        }
      }
      prev = cur;
      return {
        w: cv.width, h: cv.height,
        cloudCalls: P.cloudCalls, rainCalls: P.rainCalls,
        diffPx: prev ? diffPx : -1, maxd: prev ? maxd : -1,
        avgd: prev && diffPx ? +(sumd / diffPx).toFixed(3) : 0,
      };
    };
    // hatch 运行时翻（TS readonly 仅编译期）
    window.__perf3Hatch = (cloud, rain) => {
      P.SkyRenderer.cloudRegionBlit = cloud;
      P.WeatherRenderer.rainPerf3 = rain;
      return { cloud: P.SkyRenderer.cloudRegionBlit, rain: P.WeatherRenderer.rainPerf3 };
    };
    // 场景置位：地表站位+相机钉+雨开关（钟面由 node 侧 freezeClock 钉）
    window.__perf3Scene = (rain) => {
      const w = g.world;
      const st = w.store;
      // ★站位=附近【最低谷】列：世界中心地表可能是山峰——传送后雨生成带
      //   （camTop-20..100）落进实心山体 → 逐滴门全拒 → 雨池零填充（首轮实证
      //   active=0/zoneRain=true）。扫 ±48 列取「首个实心格 ty 最大」的谷底列。
      const surfaceTy = (tx) => {
        for (let ty = 0; ty < w.h; ty++) {
          const i = st.idx(tx, ty);
          if (st.flags[i] !== 0) return ty;
        }
        return w.h;
      };
      const c0 = Math.floor(w.w / 2);
      let best = c0, bestTy = -1;
      for (let tx = Math.max(1, c0 - 48); tx < Math.min(w.w - 1, c0 + 48); tx += 2) {
        const ty = surfaceTy(tx);
        if (ty > bestTy) { bestTy = ty; best = tx; }
      }
      g.player.x = best * 16 + 8;
      g.player.y = (bestTy - 6) * 16;
      g.player.vx = 0; g.player.vy = 0;
      g.camera.x = g.player.cx; g.camera.y = g.player.cy;
      if (rain) { if (!w.weather.raining || w.weather.cloudAlpha < 0.5) w.weather.startRain(true, 0.85); }
      else w.weather.stopRain(true);
      return { x: g.player.x, y: g.player.y, surfTy: bestTy, ground: w.groundLevel, rain: w.weather.cloudAlpha };
    };
    window.__perf3Pause = (on) => { g.paused = !!on; return g.paused; };
    window.__perf3RainStat = () => {
      const wf = g.renderer.weatherFx;
      const pool = wf && wf.pool ? wf.pool : [];
      let active = 0; for (const d of pool) if (d.active) active++;
      return { active, cap: pool.length, cloudAlpha: g.world.weather.cloudAlpha, paused: g.paused };
    };
    // 等雨池真实填充(硬失败——防空转雨场景的 vacuous 计量,首轮教训)
    window.__perf3WaitRain = async (minActive) => {
      const t0 = performance.now();
      for (;;) {
        const wf = g.renderer.weatherFx;
        const pool = wf && wf.pool ? wf.pool : [];
        let active = 0; for (const d of pool) if (d.active) active++;
        if (active >= minActive) return { active, ms: Math.round(performance.now() - t0) };
        if (performance.now() - t0 > 20000) return { active, ms: -1, why: 'rain-fill-timeout' };
        await new Promise((r) => requestAnimationFrame(r));
      }
    };
  });

  // ---------- 场景驱动 ----------
  const stats = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
    const mean = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    return { mean: +mean.toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), n: a.length };
  };
  const areaStat = (arr) => {
    const nz = arr.filter((v) => v > 0);
    if (!nz.length) return { meanArea: 0, framesWithBlit: 0 };
    return { meanArea: Math.round(nz.reduce((s, v) => s + v, 0) / nz.length), framesWithBlit: nz.length };
  };
  const result = { scenarios: {} };

  /** 差异断言采集步 */
  async function captureStep(label) {
    const r = await page.evaluate(() => window.__perf3Cap());
    log(`  [${label}]`, JSON.stringify(r));
    return r;
  }

  /** 置场景 + 未暂停沉降 + 截图 */
  async function setupScenario(name, tod, rain, settleMs) {
    await freezeClock(page, { tod });
    const sc = await page.evaluate((r) => window.__perf3Scene(r), rain);
    log(`scenario ${name}: scene=${JSON.stringify(sc)} tod=${tod}`);
    await sleep(settleMs);   // 真 rAF 帧窗：雨池填充/光照收敛/风暴云到位
    await page.evaluate(() => window.__perf3SceneShot?.() ?? true).catch(() => {});
  }

  /** 冻结态 A/B 逐像素 diff（该场景的等价性证据）。
   *  判据（v2,配对噪声地板）：同态相邻两拍 diff = 环境残余动画噪声（与刀无关）;
   *  翻刀拍 diff 须与噪声同量级且 maxd ≤ max(噪声maxd,1)——位精确刀在噪声=0
   *  场景给出 0,在残余噪声场景给出 ≈噪声;超噪声包线（如 fused 矩阵的最近邻
   *  采样整格翻转 maxd 34-44 vs 噪声 3）= 刀的真差异 → FAIL 不落刀。 */
  async function diffPhase(name, flips) {
    await page.evaluate(() => window.__perf3FreezeFx(true));
    await page.evaluate(() => window.__perf3Pause(true));
    await page.evaluate((n) => window.__perf3WaitFrames(n), 8);   // ≥8 rAF 稳定（rAF 驱动节拍,防停摆拍帧）
    const base = await captureStep(`${name} cap0(new-path)`);
    await page.evaluate((n) => window.__perf3WaitFrames(n), 4);
    const base2 = await captureStep(`${name} cap1(same-state-noise)`);
    const alive = base2.cloudCalls > base.cloudCalls || base2.rainCalls > base.rainCalls;
    const noise = { diffPx: base2.diffPx, maxd: base2.maxd };
    const verdict = (c) => ({
      ...c,
      pass: alive && c.maxd <= Math.max(noise.maxd, 1)
        && c.diffPx <= Math.max(noise.diffPx * 2, noise.diffPx + 150),
    });
    const steps = [];
    for (const f of flips) {
      await page.evaluate((f) => window.__perf3Hatch(f.cloud, f.rain), f.hatch);
      await page.evaluate((n) => window.__perf3WaitFrames(n), 4);
      const cf = await captureStep(`${name} ${f.label}`);
      await page.evaluate(() => window.__perf3Hatch(true, true));
      await page.evaluate((n) => window.__perf3WaitFrames(n), 4);
      // 对称回翻拍:同一 4-rAF 节拍的无刀对照（环境噪声自校准——噪声源随时间漂移,
      // 相位起点单次噪声不够判;回翻拍 diff = 纯噪声,翻刀拍 diff = 噪声+刀）
      const cb = await captureStep(`${name} ${f.label} unflip`);
      const nm = { diffPx: Math.max(noise.diffPx, cb.diffPx), maxd: Math.max(noise.maxd, cb.maxd) };
      steps.push({
        label: f.label, hatch: f.hatch, diffPx: cf.diffPx, maxd: cf.maxd, avgd: cf.avgd,
        noisePx: nm.diffPx, noiseMaxd: nm.maxd,
        pass: cf.maxd <= Math.max(nm.maxd, 1) && cf.diffPx <= nm.diffPx + 60,
      });
    }
    await page.evaluate(() => window.__perf3FreezeFx(false));
    await page.evaluate(() => window.__perf3Pause(false));
    const res = {
      renderAlive: alive, noise,
      flips: steps,
      pass: alive && steps.every((s) => s.pass),
    };
    result.scenarios[name] = { ...(result.scenarios[name] ?? {}), diff: res };
    log(`  [${name}] diff pass=${res.pass} (alive=${alive} noise=${JSON.stringify(noise)} flips=${JSON.stringify(steps.map((s) => ({ l: s.label, px: s.diffPx, maxd: s.maxd, noisePx: s.noisePx, noiseMaxd: s.noiseMaxd, pass: s.pass })))})`);
    return res;
  }

  /** 600 帧×2 段计时（新路径先跑=更冷,偏保守）。段数据取【本段末尾 FRAMES 帧】
   *  （renderMs 自页面加载单调累积,settle 帧混入会稀释统计） */
  async function timingPhase(name) {
    await page.evaluate(() => window.__perf3Pause(false));
    await page.evaluate(() => window.__perf3Hatch(true, true));
    await page.evaluate((n) => window.__perf3Run(n), FRAMES);
    const newSeg = await page.evaluate((n) => ({
      render: globalThis.__perf3.renderMs.slice(-n), near: globalThis.__perf3.cloudNearMs.slice(-n),
      p1: globalThis.__perf3.pass1Ms.slice(-n), rain: globalThis.__perf3.rainMs.slice(-n),
      area: globalThis.__perf3.blitArea.slice(-n), calls: globalThis.__perf3.blitCalls.slice(-n),
      blitMs: globalThis.__perf3.blitMs.slice(-n),
    }), FRAMES);
    await page.evaluate(() => window.__perf3Hatch(false, false));   // =0 旧路径
    await page.evaluate((n) => window.__perf3Run(n), FRAMES);
    const oldSeg = await page.evaluate((n) => ({
      render: globalThis.__perf3.renderMs.slice(-n), near: globalThis.__perf3.cloudNearMs.slice(-n),
      p1: globalThis.__perf3.pass1Ms.slice(-n), rain: globalThis.__perf3.rainMs.slice(-n),
      area: globalThis.__perf3.blitArea.slice(-n), calls: globalThis.__perf3.blitCalls.slice(-n),
      blitMs: globalThis.__perf3.blitMs.slice(-n),
    }), FRAMES);
    await page.evaluate(() => window.__perf3Hatch(true, true));
    const seg = (s) => ({
      render: stats(s.render), cloudsNear: stats(s.near), pass1: stats(s.p1),
      rain: stats(s.rain), blit: areaStat(s.area), blitMs: stats(s.blitMs),
      blitMeanCalls: +(s.calls.filter((v) => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, s.calls.filter((v) => v > 0).length)).toFixed(2),
    });
    const res = { frames: FRAMES, newPath: seg(newSeg), oldPath: seg(oldSeg) };
    result.scenarios[name] = { ...(result.scenarios[name] ?? {}), timing: res };
    log(`  [${name}] timing: new render=${JSON.stringify(res.newPath.render)} old render=${JSON.stringify(res.oldPath.render)}`);
    log(`  [${name}] cloudsNear: new=${JSON.stringify(res.newPath.cloudsNear)} old=${JSON.stringify(res.oldPath.cloudsNear)}`);
    log(`  [${name}] rain: new=${JSON.stringify(res.newPath.rain)} old=${JSON.stringify(res.oldPath.rain)}`);
    log(`  [${name}] blit area/frame: new=${res.newPath.blit.meanArea}px old=${res.oldPath.blit.meanArea}px | blit self-time: new=${JSON.stringify(res.newPath.blitMs)} old=${JSON.stringify(res.oldPath.blitMs)}`);
    return res;
  }

  // ---- ① 白天多云 ----
  log('scenario: cloudy-day');
  await setupScenario('cloudy-day', 12 / 24, false, 2500);
  await page.screenshot({ path: `${OUT}/perf3-cloudyday.png` }).catch(() => {});
  await diffPhase('cloudy-day', [
    { label: 'cloud-off', hatch: { cloud: false, rain: true } },
    { label: 'cloud+rain-off', hatch: { cloud: false, rain: false } },
  ]);
  await timingPhase('cloudy-day');

  // ---- ② 雨天 ----
  log('scenario: rainy');
  await setupScenario('rainy', 13 / 24, true, 3000);
  const fill = await page.evaluate((m) => window.__perf3WaitRain(m), 200);
  log(`  rain fill: ${JSON.stringify(fill)}`);
  if (fill.ms === -1) { log('VISUAL-EQUIVALENCE: FAIL-RAIN-FILL — 雨池未填充,计量作废'); }
  const rs = await page.evaluate(() => window.__perf3RainStat());
  log(`  rain pool: ${JSON.stringify(rs)}`);
  await page.screenshot({ path: '/tmp/perf3-cloudrain.png' }).catch(() => {});
  await diffPhase('rainy', [
    { label: 'rain-only-off', hatch: { cloud: true, rain: false } },
    { label: 'cloud-only-off', hatch: { cloud: false, rain: true } },
    { label: 'both-off', hatch: { cloud: false, rain: false } },
  ]);
  await timingPhase('rainy');

  // ---- ③ 夜间 ----
  log('scenario: night');
  await setupScenario('night', 22 / 24, false, 2500);
  await page.screenshot({ path: `${OUT}/perf3-night.png` }).catch(() => {});
  await diffPhase('night', [
    { label: 'cloud-off', hatch: { cloud: false, rain: true } },
  ]);

  writeFileSync(`${OUT}/perf3-result.json`, JSON.stringify(result, null, 2));
  log('result written:', `${OUT}/perf3-result.json`);
  const allPass = Object.values(result.scenarios).every((s) => s.diff?.pass);
  log('VISUAL-EQUIVALENCE:', allPass ? 'PASS (all flips diff=0)' : 'FAIL — 不落刀判据触发');
} finally {
  await closeAllBrowsers().catch(() => {});
}
